# AI Resume Toolkit

An AI-powered resume tool for job seekers. Upload your resume once — get a career fit analysis, live job listings, ATS compatibility score, and interview prep guides.

Runs entirely on **free APIs** (Groq + Adzuna + Supabase). No GPU, no local models required.

---

## Features

- **Find Jobs** — AI analyses your resume, recommends best-fit roles, and searches live job listings via Adzuna
- **ATS Score** — checks resume compatibility with Applicant Tracking Systems with a section-by-section breakdown
- **Interview Prep** — generates curated resource guides for any target role

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Python, FastAPI |
| LLM | Groq (free) · Gemini · OpenAI · Anthropic |
| Job listings | Adzuna API (free tier: 1000 req/day) |
| Vector search | ChromaDB (in-memory when hosted, disk for local dev) |
| Document parsing | PyMuPDF, python-docx |
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Persistence | Supabase (Postgres + Storage) when deployed |

## Quick Start (Docker)

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/ai-resume-toolkit.git
cd ai-resume-toolkit

# 2. Configure
cp .env.example .env
# Edit .env — add your GROQ_API_KEY (free at https://console.groq.com)
# Add ADZUNA_APP_ID and ADZUNA_APP_KEY (free at https://developer.adzuna.com)

# 3. Run
docker compose up
```

Open http://localhost:3000

---

## Manual Setup

### Backend

```bash
cd backend

python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

pip install .

# Copy and fill in your keys
cp .env.example .env

uvicorn resume_analyzer_api:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend

npm install

# Point at the backend
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

npm run dev
```

Open http://localhost:3000

---

## LLM Providers

| Provider | Cost | Sign-up |
|---|---|---|
| **Groq** (recommended) | Free | https://console.groq.com |
| Google Gemini | Free | https://aistudio.google.com |
| OpenAI | Paid | https://platform.openai.com |
| Anthropic | Paid | https://console.anthropic.com |
| Ollama | Free (local) | https://ollama.com |

---

## Deployment (fully free)

| Service | Platform | Cost |
|---|---|---|
| Frontend | Vercel | Free |
| Backend | Render | Free (sleeps after 15 min inactivity) |
| Database + Storage | Supabase | Free |

### Supabase setup

1. Create a free project at https://supabase.com
2. Run in SQL Editor:

```sql
CREATE TABLE resumes (
  id          TEXT PRIMARY KEY,
  summary     TEXT,
  resume_text TEXT,
  metadata    JSONB        DEFAULT '{}',
  feedback    JSONB        DEFAULT '[]',
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE resumes DISABLE ROW LEVEL SECURITY;
```

3. Create a Storage bucket named `resume-files` (private)
4. Copy **Project URL** and **service_role key** from Project Settings → API

### Render (backend)

- **Root directory**: `backend`
- **Build command**: `pip install uv && uv pip install --system .`
- **Start command**: `uvicorn resume_analyzer_api:app --host 0.0.0.0 --port $PORT`
- Add all env vars from `.env.example` plus `SUPABASE_URL` and `SUPABASE_KEY`

### Vercel (frontend)

- **Root directory**: `frontend`
- **Framework**: Next.js (auto-detected)
- **Env var**: `NEXT_PUBLIC_API_URL` = your Render backend URL

---

## Project Structure

```
ai-resume-toolkit/
├── .env.example               # Root env vars — copy to .env
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── llm_provider.py        # Multi-provider LLM abstraction
│   ├── resume_analyzer_api.py # FastAPI app + all endpoints
│   ├── resume_agents.py       # ResumeStore, agent classes
│   └── resume_analyzer_v7.py  # File extraction and validation
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── app/
        ├── page.tsx
        ├── layout.tsx
        └── components/
            ├── FindJobs.tsx       # Job search + career fit
            ├── ATSChecker.tsx     # ATS score gauge
            └── Resources.tsx      # Interview prep guides
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/provider-info` | Active LLM provider and model |
| POST | `/upload` | Upload resume file |
| POST | `/summarize` | Analyse uploaded resume |
| GET | `/resumes` | List all stored resumes |
| POST | `/job-recommendations` | AI career fit + role recommendations |
| POST | `/job-discovery` | Live job listings via Adzuna |
| POST | `/ats-check` | ATS compatibility analysis |
| POST | `/interview-resources` | Interview prep guide for a role |
| POST | `/feedback` | Thumbs up/down on a summary |

## License

MIT
