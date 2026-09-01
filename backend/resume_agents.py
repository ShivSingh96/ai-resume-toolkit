import os
import json
import time
import re
from typing import List, Dict, Any, Optional

import chromadb
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

from llm_provider import BaseLLMProvider

try:
    from supabase import create_client
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False

PERSIST_DIRECTORY = os.getenv("CHROMA_DIR", "chroma_db")
RESUME_DATABASE   = os.getenv("DB_PATH", "resume_database.json")
SUPABASE_URL      = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY      = os.getenv("SUPABASE_KEY", "")


class ResumeStore:
    """Manages storage and retrieval of resume data."""

    def __init__(self, db_path: str = RESUME_DATABASE):
        self.db_path = db_path

        # Supabase client — used when env vars are set
        self._sb = None
        if _SUPABASE_AVAILABLE and SUPABASE_URL and SUPABASE_KEY:
            self._sb = create_client(SUPABASE_URL, SUPABASE_KEY)

        self.resumes = self._load_db()

        os.makedirs(PERSIST_DIRECTORY, exist_ok=True)

        # DefaultEmbeddingFunction uses ONNX (all-MiniLM-L6-v2) — no PyTorch needed
        self._ef = DefaultEmbeddingFunction()
        # In-memory ChromaDB when Supabase handles persistence; disk otherwise
        if self._sb:
            self._chroma = chromadb.EphemeralClient()
        else:
            self._chroma = chromadb.PersistentClient(path=PERSIST_DIRECTORY)
        self._collection = self._chroma.get_or_create_collection(
            name="resumes",
            embedding_function=self._ef,
        )
        self._bootstrap_chromadb()

    def _load_db(self) -> Dict:
        if self._sb:
            try:
                rows = self._sb.table("resumes").select(
                    "id,summary,resume_text,metadata,feedback"
                ).execute()
                db: Dict = {"resumes": {}}
                for row in rows.data:
                    db["resumes"][row["id"]] = {
                        "summary":  row.get("summary", ""),
                        "metadata": row.get("metadata") or {},
                        "feedback": row.get("feedback") or [],
                        "_text":    row.get("resume_text", ""),
                    }
                return db
            except Exception as e:
                print(f"[ResumeStore] Supabase load failed: {e}. Starting empty.")
                return {"resumes": {}}
        # Local JSON fallback
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, "r") as f:
                    return json.load(f)
            except Exception:
                return {"resumes": {}}
        return {"resumes": {}}

    def _save_db(self):
        if self._sb:
            return  # Supabase writes happen immediately in add_resume / add_feedback
        with open(self.db_path, "w") as f:
            json.dump(self.resumes, f)

    def _bootstrap_chromadb(self):
        """Populate in-memory ChromaDB from data already loaded into self.resumes."""
        for rid, data in self.resumes["resumes"].items():
            text = data.get("_text") or data.get("summary", "")
            if not text:
                continue
            chunks = self._chunk_text(text)
            ids    = [f"{rid}_chunk_{i}" for i in range(len(chunks))]
            metas  = [{"resume_id": rid, "chunk_id": i} for i in range(len(chunks))]
            try:
                self._collection.upsert(documents=chunks, metadatas=metas, ids=ids)
            except Exception:
                pass

    def _chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 100) -> List[str]:
        chunks = []
        for i in range(0, len(text), chunk_size - overlap):
            chunk = text[i : i + chunk_size]
            if chunk.strip():
                chunks.append(chunk)
        return chunks

    def add_resume(self, resume_id: str, resume_text: str, summary: str, metadata: Dict = None):
        if metadata is None:
            metadata = {}

        self.resumes["resumes"][resume_id] = {
            "summary":  summary,
            "metadata": metadata,
            "_text":    resume_text,
        }

        if self._sb:
            try:
                self._sb.table("resumes").upsert({
                    "id":          resume_id,
                    "summary":     summary,
                    "resume_text": resume_text,
                    "metadata":    metadata,
                    "feedback":    [],
                }).execute()
            except Exception as e:
                print(f"[ResumeStore] Supabase upsert failed: {e}")
        else:
            self._save_db()

        chunks = self._chunk_text(resume_text)
        ids    = [f"{resume_id}_chunk_{i}" for i in range(len(chunks))]
        metas  = [{"resume_id": resume_id, "chunk_id": i, **metadata} for i in range(len(chunks))]
        self._collection.upsert(documents=chunks, metadatas=metas, ids=ids)

        return resume_id

    def get_resume(self, resume_id: str) -> Optional[Dict]:
        return self.resumes["resumes"].get(resume_id)

    def get_all_resumes(self) -> List[Dict]:
        return [{"id": k, **v} for k, v in self.resumes["resumes"].items()]

    def search_resumes(self, query: str, n_results: int = 5) -> List[Dict]:
        results = self._collection.query(query_texts=[query], n_results=n_results)
        resume_ids: set = set()
        if results["metadatas"]:
            for m in results["metadatas"][0]:
                resume_ids.add(m["resume_id"])
        return [
            {"id": rid, **self.resumes["resumes"][rid]}
            for rid in resume_ids
            if rid in self.resumes["resumes"]
        ]

    def match_job_description(
        self, job_description: str, provider: BaseLLMProvider, top_n: int = 5
    ) -> List[Dict]:
        """Find resumes matching a job description using vector search + LLM scoring."""
        try:
            results = self._collection.query(query_texts=[job_description], n_results=10)
            resume_ids: set = set()
            if results["metadatas"]:
                for m in results["metadatas"][0]:
                    resume_ids.add(m["resume_id"])

            matches = []
            for rid in resume_ids:
                resume = self.get_resume(rid)
                if resume:
                    score = self._calculate_match_score(
                        resume["summary"], job_description, provider
                    )
                    matches.append(
                        {
                            "id": rid,
                            "summary": resume["summary"],
                            "match_score": score,
                            "metadata": resume["metadata"],
                        }
                    )

            matches.sort(key=lambda x: x["match_score"], reverse=True)
            return matches[:top_n]
        except Exception as e:
            print(f"Error matching job description: {e}")
            return []

    def _calculate_match_score(
        self, resume_summary: str, job_description: str, provider: BaseLLMProvider
    ) -> float:
        prompt = f"""
You are evaluating how well a candidate's resume matches a job description.

Resume:
{resume_summary}

Job Description:
{job_description}

On a scale of 0 to 100 (100 = perfect match, 0 = no match), assign a score based on
skills, experience, and qualifications. Return ONLY the numeric score, nothing else.
"""
        try:
            result = provider.generate(prompt).strip().replace("%", "")
            # Extract first number found in the response
            match = re.search(r"\d+(?:\.\d+)?", result)
            return float(match.group()) / 100 if match else 0.0
        except Exception:
            return 0.0

    def add_feedback(self, resume_id: str, is_positive: bool, feedback_text: str = None):
        if resume_id not in self.resumes["resumes"]:
            return False
        self.resumes["resumes"][resume_id].setdefault("feedback", []).append(
            {"timestamp": time.time(), "is_positive": is_positive, "text": feedback_text}
        )
        if self._sb:
            try:
                self._sb.table("resumes").update({
                    "feedback": self.resumes["resumes"][resume_id]["feedback"]
                }).eq("id", resume_id).execute()
            except Exception as e:
                print(f"[ResumeStore] Supabase feedback update failed: {e}")
        else:
            self._save_db()
        return True

    def get_feedback_stats(self):
        total_positive = total_negative = resume_count = 0
        for data in self.resumes["resumes"].values():
            if "feedback" in data:
                resume_count += 1
                for fb in data["feedback"]:
                    if fb["is_positive"]:
                        total_positive += 1
                    else:
                        total_negative += 1
        return {
            "total_positive": total_positive,
            "total_negative": total_negative,
            "resume_count_with_feedback": resume_count,
            "total_resume_count": len(self.resumes["resumes"]),
        }


class ResumeComparatorAgent:
    def __init__(self, resume_store: ResumeStore, provider: BaseLLMProvider):
        self.resume_store = resume_store
        self.provider = provider

    def compare_resumes(self, resume_ids: List[str]) -> str:
        if len(resume_ids) < 2:
            return "Need at least 2 resumes to compare"

        resume_summaries = []
        for rid in resume_ids:
            resume = self.resume_store.get_resume(rid)
            if resume:
                resume_summaries.append(f"Candidate ID: {rid}\n{resume['summary']}")

        if not resume_summaries:
            return "No valid resumes found to compare"

        prompt = f"""
You are a resume comparison expert. Compare the following candidate summaries and highlight:
1. Strengths and weaknesses of each candidate
2. Key differentiating factors
3. Technical skill comparison
4. Experience level comparison

Candidate resumes:
{"---".join(resume_summaries)}

Create a comparison table and provide a brief analysis of each candidate.
"""
        try:
            return self.provider.generate(prompt)
        except Exception as e:
            return f"Error comparing resumes: {e}"


class SkillGapIdentifierAgent:
    def __init__(self, resume_store: ResumeStore, provider: BaseLLMProvider):
        self.resume_store = resume_store
        self.provider = provider

    def identify_gaps(self, resume_id: str, job_description: str) -> str:
        resume = self.resume_store.get_resume(resume_id)
        if not resume:
            return "Resume not found"

        prompt = f"""
You are a technical recruiter helping identify skill gaps between a job description and a candidate.

Job description:
{job_description}

Candidate summary:
{resume["summary"]}

Identify the following:
1. Required skills missing from the candidate's profile
2. Experience gaps that need to be addressed
3. Certifications or qualifications that would strengthen the application
4. Overall skill gap severity (Low, Medium, High)

Format your response as a structured analysis.
"""
        try:
            return self.provider.generate(prompt)
        except Exception as e:
            return f"Error identifying skill gaps: {e}"


class CandidateRankerAgent:
    def __init__(self, resume_store: ResumeStore, provider: BaseLLMProvider):
        self.resume_store = resume_store
        self.provider = provider

    def rank_candidates(self, resume_ids: List[str], job_description: str) -> str:
        if not resume_ids:
            return "No resumes provided for ranking"

        resume_summaries = []
        for rid in resume_ids:
            resume = self.resume_store.get_resume(rid)
            if resume:
                resume_summaries.append(f"Candidate ID: {rid}\n{resume['summary']}")

        if not resume_summaries:
            return "No valid resumes found to rank"

        prompt = f"""
You are a talent acquisition specialist ranking candidates for a position.

Job description:
{job_description}

Candidate summaries:
{"---".join(resume_summaries)}

Rank these candidates from most to least suitable. For each candidate:
1. Assign a fit score (0-100)
2. List their key strengths for this role
3. List their key weaknesses for this role
4. Provide a brief explanation for the ranking

Return results as a ranked list with detailed justification for each candidate.
"""
        try:
            return self.provider.generate(prompt)
        except Exception as e:
            return f"Error ranking candidates: {e}"


class QuestionGeneratorAgent:
    def __init__(self, provider: BaseLLMProvider):
        self.provider = provider

    def generate_questions(self, resume_id: str, resume_store: ResumeStore) -> List[str]:
        resume = resume_store.get_resume(resume_id)
        if not resume:
            return ["Resume not found"]

        prompt = f"""
You are a technical recruiter reviewing a resume. Identify 3-5 areas where more information
would help fully evaluate this candidate — ambiguous or unclear aspects of their resume.

Resume Summary:
{resume["summary"]}

Generate specific follow-up questions that clarify these ambiguities.
Return ONLY a JSON array of question strings. Example:
["Question 1?", "Question 2?", "Question 3?"]
"""
        try:
            result = self.provider.generate(prompt)
            # Extract JSON array from anywhere in the response
            match = re.search(r"\[.*\]", result, re.DOTALL)
            if match:
                questions = json.loads(match.group())
                if isinstance(questions, list):
                    return questions
            # Fallback: extract lines containing "?"
            return [q.strip() for q in result.split("\n") if "?" in q.strip()]
        except Exception as e:
            return [f"Error generating questions: {e}"]


class FakeResumeDetectorAgent:
    def __init__(self, provider: BaseLLMProvider):
        self.provider = provider

    def detect_fake_resume(self, resume_text: str) -> Dict:
        prompt = f"""
You are an expert at identifying potentially fake or AI-generated resumes.
Analyze the following resume and look for:

1. Inconsistencies in career timeline
2. Generic descriptions lacking specific details
3. Perfect grammar with AI-like writing patterns
4. Unrealistic combinations of skills or responsibilities
5. Vague accomplishments without metrics

Resume Text:
{resume_text}

Respond with ONLY a valid JSON object in this exact structure:
{{
    "is_suspicious": true or false,
    "confidence_score": 0-100,
    "reasons": ["reason 1", "reason 2"],
    "red_flags": ["specific suspicious text 1", "specific suspicious text 2"]
}}
"""
        try:
            result = self.provider.generate(prompt)
            # Extract JSON object from the response
            match = re.search(r"\{.*\}", result, re.DOTALL)
            if match:
                return json.loads(match.group())
            return {
                "is_suspicious": False,
                "confidence_score": 0,
                "reasons": ["Failed to parse analysis"],
                "red_flags": [],
            }
        except Exception as e:
            return {
                "is_suspicious": False,
                "confidence_score": 0,
                "reasons": [f"Error analyzing resume: {e}"],
                "red_flags": [],
            }


def setup_agents(provider: BaseLLMProvider):
    """Initialize resume store and all agents with the given provider."""
    resume_store = ResumeStore()
    comparator_agent = ResumeComparatorAgent(resume_store, provider)
    gap_identifier_agent = SkillGapIdentifierAgent(resume_store, provider)
    ranker_agent = CandidateRankerAgent(resume_store, provider)
    question_agent = QuestionGeneratorAgent(provider)
    fake_detector_agent = FakeResumeDetectorAgent(provider)

    return resume_store, comparator_agent, gap_identifier_agent, ranker_agent, question_agent, fake_detector_agent
