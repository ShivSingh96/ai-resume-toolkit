"""
Multi-provider LLM abstraction for Resume Analyzer.

Supported providers (set LLM_PROVIDER env var):
  groq      - Free tier. Fast. Requires GROQ_API_KEY.   https://console.groq.com
  gemini    - Free tier. Requires GEMINI_API_KEY.       https://aistudio.google.com
  openai    - Paid. Requires OPENAI_API_KEY.            https://platform.openai.com
  anthropic - Paid. Requires ANTHROPIC_API_KEY.         https://console.anthropic.com
  ollama    - Local. No key needed. Requires Ollama running at OLLAMA_ENDPOINT.
"""

import os
import re
import json
import logging
from abc import ABC, abstractmethod
from typing import Generator

logger = logging.getLogger(__name__)

PROVIDER_INFO = {
    "groq": {
        "display_name": "Groq",
        "free_tier": True,
        "default_model": "llama-3.1-8b-instant",
        "available_models": [
            "llama-3.1-8b-instant",  # tier 1 — fast, short tasks
            "llama3-8b-8192",        # tier 2 — medium tasks
            "llama3-70b-8192",       # tier 3 — long/complex tasks
            "gemma2-9b-it",          # tier 4 — highest free TPM, last resort
        ],
        "signup_url": "https://console.groq.com",
    },
    "gemini": {
        "display_name": "Google Gemini",
        "free_tier": True,
        "default_model": "gemini-1.5-flash",
        "available_models": ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
        "signup_url": "https://aistudio.google.com",
    },
    "openai": {
        "display_name": "OpenAI",
        "free_tier": False,
        "default_model": "gpt-4o-mini",
        "available_models": ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
        "signup_url": "https://platform.openai.com",
    },
    "anthropic": {
        "display_name": "Anthropic",
        "free_tier": False,
        "default_model": "claude-haiku-4-5-20251001",
        "available_models": ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-5"],
        "signup_url": "https://console.anthropic.com",
    },
    "ollama": {
        "display_name": "Ollama (local)",
        "free_tier": True,
        "default_model": "llama3",
        "available_models": ["llama3", "llama3.1", "mistral", "gemma"],
        "signup_url": None,
    },
}


class BaseLLMProvider(ABC):
    """Common interface for all LLM providers."""

    @abstractmethod
    def generate(self, prompt: str) -> str:
        """Blocking generation — returns full response string."""

    def generate_stream(self, prompt: str) -> Generator[str, None, None]:
        """Streaming generation — yields text chunks. Default: single blocking call."""
        yield self.generate(prompt)

    def generate_filtered(self, prompt: str) -> str:
        """generate() with <think>...</think> reasoning blocks stripped."""
        result = self.generate(prompt)
        return re.sub(r"<think>.*?</think>", "", result, flags=re.DOTALL).strip()

    def generate_stream_filtered(self, prompt: str) -> Generator[str, None, None]:
        """generate_stream() with <think>...</think> blocks stripped before yielding."""
        in_think = False
        buffer = ""
        for chunk in self.generate_stream(prompt):
            buffer += chunk
            while True:
                if not in_think:
                    start = buffer.find("<think>")
                    if start == -1:
                        # Keep a tail in case the tag spans chunk boundaries
                        tail = len("<think>") - 1
                        if len(buffer) > tail:
                            yield buffer[:-tail]
                            buffer = buffer[-tail:]
                        break
                    if start > 0:
                        yield buffer[:start]
                    buffer = buffer[start + len("<think>"):]
                    in_think = True
                else:
                    end = buffer.find("</think>")
                    if end == -1:
                        buffer = ""  # discard think content
                        break
                    buffer = buffer[end + len("</think>"):].lstrip("\n")
                    in_think = False
        if buffer and not in_think:
            yield buffer

    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        pass


class GroqProvider(BaseLLMProvider):
    # Preferred tiers ordered by prompt complexity (max prompt chars → model).
    # Smaller/faster models handle short prompts; higher-capacity models handle long ones.
    # On a rate-limit hit, the chain escalates through remaining tiers automatically.
    _MODEL_TIERS: list = [
        (1500,  "llama-3.1-8b-instant"),  # fast; keyword extract, short JSON tasks
        (6000,  "llama3-8b-8192"),        # balanced; ATS check, job recommendations
        (15000, "llama3-70b-8192"),       # capable; long resume summarisation
        (None,  "gemma2-9b-it"),          # highest free-tier TPM; last resort
    ]

    # Models that must never be auto-selected — they require separate terms acceptance.
    _BLOCKED_MODELS: frozenset = frozenset({
        "canopylabs/orpheus-arabic-saudi",
    })

    def __init__(self, api_key: str):
        from groq import Groq
        self._client = Groq(api_key=api_key)
        self._available: set = self._fetch_available()

    def _fetch_available(self) -> set:
        """
        Fetch usable model IDs at startup.
        Prefers the curated tier list; falls back to any model on the account
        that isn't in the blocked list (avoids models requiring extra terms acceptance).
        """
        try:
            all_ids = {m.id for m in self._client.models.list().data}
            preferred = {m for _, m in self._MODEL_TIERS}
            tier_available = all_ids & preferred
            if tier_available:
                return tier_available
            # Account doesn't have the preferred Llama/Gemma models — use whatever is accessible
            fallback = all_ids - self._BLOCKED_MODELS
            if fallback:
                logger.warning(
                    "Preferred tier models not on this account. Using: %s. "
                    "For best rate limits, enable Llama/Gemma models at https://console.groq.com",
                    sorted(fallback),
                )
                return fallback
            raise ValueError(
                "No usable Groq models found on this account. "
                "Enable at least one model at https://console.groq.com"
            )
        except ValueError:
            raise
        except Exception as exc:
            logger.warning("Could not list Groq models (%s); will try all tier models", exc)
            return {m for _, m in self._MODEL_TIERS}

    def _models_for_prompt(self, prompt: str) -> list:
        """Return ordered model chain for this prompt: best tier fit first, then escalating."""
        prompt_len = len(prompt)
        tier_models = [m for _, m in self._MODEL_TIERS]

        # Find the lightest tier model that fits this prompt and is on the account
        primary = None
        for max_chars, model in self._MODEL_TIERS:
            if (max_chars is None or prompt_len <= max_chars) and model in self._available:
                primary = model
                break

        if primary is None:
            # No tier model available — use account's models sorted for determinism
            chain = sorted(self._available - set(tier_models))
        else:
            chain = [primary]

        # Append remaining tier models (rate-limit escalation path)
        for _, model in self._MODEL_TIERS:
            if model not in chain and model in self._available:
                chain.append(model)

        # Append any non-tier account models at the end (last resort)
        for model in sorted(self._available):
            if model not in chain:
                chain.append(model)

        logger.debug("Prompt len=%d → model chain: %s", prompt_len, chain)
        return chain

    @property
    def provider_name(self) -> str:
        return "groq"

    @property
    def model_name(self) -> str:
        # Report the lightest available tier model, or first available if none match tiers
        for _, model in self._MODEL_TIERS:
            if model in self._available:
                return model
        return next(iter(sorted(self._available)), "unknown")

    def generate(self, prompt: str) -> str:
        from groq import RateLimitError
        last_err = None
        for model in self._models_for_prompt(prompt):
            try:
                response = self._client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                )
                logger.debug("generate() used model '%s'", model)
                return response.choices[0].message.content
            except RateLimitError as e:
                logger.warning("Rate limit on '%s'; escalating to next tier", model)
                last_err = e
        raise last_err

    def generate_stream(self, prompt: str) -> Generator[str, None, None]:
        from groq import RateLimitError
        last_err = None
        for model in self._models_for_prompt(prompt):
            try:
                stream = self._client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    stream=True,
                )
                logger.debug("generate_stream() used model '%s'", model)
                for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        yield delta
                return
            except RateLimitError as e:
                logger.warning("Rate limit on '%s'; escalating to next tier", model)
                last_err = e
        raise last_err


class GeminiProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-1.5-flash"):
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self._model_obj = genai.GenerativeModel(model)
        self._model = model

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model

    def generate(self, prompt: str) -> str:
        response = self._model_obj.generate_content(prompt)
        return response.text

    def generate_stream(self, prompt: str) -> Generator[str, None, None]:
        response = self._model_obj.generate_content(prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield chunk.text


class OpenAIProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        from openai import OpenAI
        self._client = OpenAI(api_key=api_key)
        self._model = model

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self._model

    def generate(self, prompt: str) -> str:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        return response.choices[0].message.content

    def generate_stream(self, prompt: str) -> Generator[str, None, None]:
        stream = self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


class AnthropicProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model: str = "claude-haiku-4-5-20251001"):
        import anthropic
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model

    @property
    def provider_name(self) -> str:
        return "anthropic"

    @property
    def model_name(self) -> str:
        return self._model

    def generate(self, prompt: str) -> str:
        message = self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text

    def generate_stream(self, prompt: str) -> Generator[str, None, None]:
        with self._client.messages.stream(
            model=self._model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            for text in stream.text_stream:
                yield text


class OllamaProvider(BaseLLMProvider):
    def __init__(self, endpoint: str = "http://localhost:11434", model: str = "llama3"):
        import requests as _requests
        self._requests = _requests
        self._endpoint = endpoint.rstrip("/")
        self._model = model

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return self._model

    def generate(self, prompt: str) -> str:
        response = self._requests.post(
            f"{self._endpoint}/api/generate",
            json={"model": self._model, "prompt": prompt, "stream": False},
            timeout=120,
        )
        response.raise_for_status()
        return response.json()["response"]

    def generate_stream(self, prompt: str) -> Generator[str, None, None]:
        with self._requests.post(
            f"{self._endpoint}/api/generate",
            json={"model": self._model, "prompt": prompt, "stream": True},
            stream=True,
            timeout=120,
        ) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if line:
                    data = json.loads(line)
                    if "response" in data:
                        yield data["response"]
                    if data.get("done"):
                        break


def get_provider() -> BaseLLMProvider:
    """Instantiate the provider configured via env vars."""
    provider_name = os.getenv("LLM_PROVIDER", "groq").lower()

    if provider_name == "groq":
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("LLM_PROVIDER=groq requires GROQ_API_KEY. Get a free key at https://console.groq.com")
        return GroqProvider(api_key=api_key)

    if provider_name == "gemini":
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("LLM_PROVIDER=gemini requires GEMINI_API_KEY. Get a free key at https://aistudio.google.com")
        model = os.getenv("LLM_MODEL", PROVIDER_INFO["gemini"]["default_model"])
        return GeminiProvider(api_key=api_key, model=model)

    if provider_name == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("LLM_PROVIDER=openai requires OPENAI_API_KEY.")
        model = os.getenv("LLM_MODEL", PROVIDER_INFO["openai"]["default_model"])
        return OpenAIProvider(api_key=api_key, model=model)

    if provider_name == "anthropic":
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY.")
        model = os.getenv("LLM_MODEL", PROVIDER_INFO["anthropic"]["default_model"])
        return AnthropicProvider(api_key=api_key, model=model)

    if provider_name == "ollama":
        endpoint = os.getenv("OLLAMA_ENDPOINT", "http://localhost:11434")
        model = os.getenv("LLM_MODEL", PROVIDER_INFO["ollama"]["default_model"])
        return OllamaProvider(endpoint=endpoint, model=model)

    valid = ", ".join(PROVIDER_INFO.keys())
    raise ValueError(f"Unknown LLM_PROVIDER='{provider_name}'. Valid options: {valid}")


def get_provider_info(provider: BaseLLMProvider) -> dict:
    """Return display metadata for the active provider."""
    name = provider.provider_name
    info = PROVIDER_INFO.get(name, {})
    return {
        "provider": name,
        "display_name": info.get("display_name", name),
        "model": provider.model_name,
        "free_tier": info.get("free_tier", False),
        "available_models": info.get("available_models", []),
        "signup_url": info.get("signup_url"),
    }
