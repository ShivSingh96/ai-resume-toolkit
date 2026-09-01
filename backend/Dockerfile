FROM python:3.11-slim

WORKDIR /app

# System deps for PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

# uv is significantly faster than pip for dependency resolution
RUN pip install --no-cache-dir uv

# Copy project manifest first — cached by Docker unless pyproject.toml changes
COPY pyproject.toml .
# Stub package so uv can install deps without the full source tree
RUN mkdir -p resume_analyzer_backend && touch resume_analyzer_backend/__init__.py
RUN uv pip install --system --no-cache .

# Copy source after deps are cached
COPY . .

EXPOSE 8000

CMD ["uvicorn", "resume_analyzer_api:app", "--host", "0.0.0.0", "--port", "8000"]
