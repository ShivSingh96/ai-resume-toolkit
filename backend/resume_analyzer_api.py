import os
import re
import json
import shutil
import uuid
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List

import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from resume_analyzer_v7 import FileExtractor, ResumeValidator, ResumeAnalyzerError, build_resume_prompt
from resume_agents import setup_agents
from llm_provider import get_provider, get_provider_info

load_dotenv()

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt"}

UPLOAD_DIR.mkdir(exist_ok=True)

# Shared singletons — populated during startup
_provider = None
_resume_store = None
_comparator_agent = None
_gap_identifier_agent = None
_ranker_agent = None
_question_agent = None
_fake_detector_agent = None
_file_extractor = FileExtractor()
_resume_validator = ResumeValidator()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _provider, _resume_store, _comparator_agent, _gap_identifier_agent
    global _ranker_agent, _question_agent, _fake_detector_agent

    _provider = get_provider()
    (
        _resume_store,
        _comparator_agent,
        _gap_identifier_agent,
        _ranker_agent,
        _question_agent,
        _fake_detector_agent,
    ) = setup_agents(_provider)

    yield  # application runs here


app = FastAPI(
    title="Resume Analyzer API",
    description="AI-powered resume analysis with multi-provider LLM support.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ──────────────────────────────────────────────

class SummaryRequest(BaseModel):
    file_id: str

class JobDescriptionRequest(BaseModel):
    job_description: str
    resume_ids: List[str]

class MatchJobRequest(BaseModel):
    job_description: str
    top_n: Optional[int] = 5

class CompareRequest(BaseModel):
    resume_ids: List[str]

class FeedbackRequest(BaseModel):
    resume_id: str
    is_positive: bool
    feedback_text: Optional[str] = None

class JobRecommendationRequest(BaseModel):
    resume_id: str

class InterviewResourceRequest(BaseModel):
    role: str
    skills: Optional[str] = ""

class JobDiscoveryRequest(BaseModel):
    resume_id: str
    country_code: str = "in"   # Adzuna country code: in, us, gb, au, sg, ca …
    location: Optional[str] = ""

class ATSCheckRequest(BaseModel):
    resume_id: str


# ── Helpers ────────────────────────────────────────────────────────────────

def _valid_extension(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXTENSIONS


def _cleanup(path: Path):
    try:
        if path.exists():
            os.remove(path)
    except Exception:
        pass


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/provider-info")
async def provider_info():
    """Return the active LLM provider name, model, and free-tier status."""
    return get_provider_info(_provider)


@app.post("/upload")
async def upload_resume(file: UploadFile = File(...)):
    """Upload a resume file. Returns a file_id for subsequent calls."""
    if not _valid_extension(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported: {', '.join(SUPPORTED_EXTENSIONS)}",
        )

    file_id    = f"{os.urandom(8).hex()}_{file.filename}"
    file_bytes = await file.read()

    if _resume_store and _resume_store._sb:
        try:
            _resume_store._sb.storage.from_("resume-files").upload(
                path=file_id,
                file=file_bytes,
                file_options={"content-type": file.content_type or "application/octet-stream"},
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload to storage: {e}")
    else:
        file_path = UPLOAD_DIR / file_id
        try:
            with open(file_path, "wb") as buf:
                buf.write(file_bytes)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    return {"file_id": file_id, "filename": file.filename}


@app.post("/summarize")
async def summarize_resume(request: SummaryRequest):
    """Analyze a previously uploaded resume. Stores result in the database."""
    tmp_path: Optional[Path] = None

    if _resume_store and _resume_store._sb:
        try:
            file_bytes = _resume_store._sb.storage.from_("resume-files").download(request.file_id)
        except Exception:
            raise HTTPException(status_code=404, detail="File not found in storage. Upload the file first.")
        suffix = Path(request.file_id).suffix or ".pdf"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = Path(tmp.name)
        file_path = tmp_path
    else:
        file_path = UPLOAD_DIR / request.file_id
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found. Upload the file first.")

    try:
        text = _file_extractor.extract_text(file_path)
        if not text.strip():
            raise HTTPException(status_code=400, detail="No text found in document.")

        is_resume, confidence, explanation = _resume_validator.is_resume(text)
        if not is_resume:
            raise HTTPException(
                status_code=400,
                detail=f"Document doesn't appear to be a resume ({confidence:.0%} confidence). {explanation}",
            )

        summary = _provider.generate_filtered(build_resume_prompt(text))
        _resume_store.add_resume(request.file_id, text, summary)

        return {"summary": summary, "file_id": request.file_id}

    except ResumeAnalyzerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing resume: {e}")
    finally:
        if tmp_path and tmp_path.exists():
            try:
                os.remove(tmp_path)
            except Exception:
                pass


@app.get("/summarize/stream")
async def summarize_resume_stream(file_id: str):
    """
    Stream resume summary as Server-Sent Events.
    Events: data: {"chunk": "..."} and a final data: [DONE]
    The summary is also stored in the database after streaming completes.
    """
    file_path = UPLOAD_DIR / file_id
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found. Upload the file first.")

    try:
        text = _file_extractor.extract_text(file_path)
        if not text.strip():
            raise HTTPException(status_code=400, detail="No text found in document.")

        is_resume, confidence, explanation = _resume_validator.is_resume(text)
        if not is_resume:
            raise HTTPException(
                status_code=400,
                detail=f"Document doesn't appear to be a resume ({confidence:.0%} confidence). {explanation}",
            )
    except ResumeAnalyzerError as e:
        raise HTTPException(status_code=400, detail=str(e))

    prompt = build_resume_prompt(text)

    def event_stream():
        full_summary = []
        try:
            for chunk in _provider.generate_stream_filtered(prompt):
                full_summary.append(chunk)
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            # Store completed summary in database
            _resume_store.add_resume(file_id, text, "".join(full_summary))
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/resumes")
async def list_resumes():
    """List all stored resumes."""
    return {"resumes": _resume_store.get_all_resumes()}


@app.post("/compare")
async def compare_resumes(request: CompareRequest):
    """Compare 2 or more resumes side by side."""
    if len(request.resume_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 resumes to compare.")
    comparison = _comparator_agent.compare_resumes(request.resume_ids)
    return {"comparison": comparison}


@app.post("/identify-gaps")
async def identify_gaps(request: JobDescriptionRequest):
    """Identify skill gaps for a single resume against a job description."""
    if len(request.resume_ids) != 1:
        raise HTTPException(status_code=400, detail="Provide exactly one resume ID.")
    analysis = _gap_identifier_agent.identify_gaps(request.resume_ids[0], request.job_description)
    return {"gap_analysis": analysis}


@app.post("/rank-candidates")
async def rank_candidates(request: JobDescriptionRequest):
    """Rank 2+ candidates against a job description."""
    if len(request.resume_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 resumes to rank.")
    ranking = _ranker_agent.rank_candidates(request.resume_ids, request.job_description)
    return {"ranking": ranking}


@app.post("/match-job-description")
async def match_job_description(request: MatchJobRequest):
    """
    Find resumes in the database that best match a job description (text input).
    Uses vector search + LLM scoring for real match percentages.
    """
    if not request.job_description.strip():
        raise HTTPException(status_code=400, detail="Job description cannot be empty.")
    matches = _resume_store.match_job_description(
        request.job_description, _provider, top_n=request.top_n
    )
    return {"matching_resumes": matches}


@app.post("/upload-job-description")
async def upload_job_description(file: UploadFile = File(...)):
    """Upload a job description file and find matching resumes."""
    tmp_path = UPLOAD_DIR / f"job_{uuid.uuid4().hex}_{file.filename}"
    try:
        with open(tmp_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
        text = _file_extractor.extract_text(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {e}")
    finally:
        _cleanup(tmp_path)

    matches = _resume_store.match_job_description(text, _provider)
    return {"job_description": text, "matching_resumes": matches}


@app.get("/generate-questions/{resume_id}")
async def generate_questions(resume_id: str):
    """Generate follow-up interview questions for a stored resume."""
    questions = _question_agent.generate_questions(resume_id, _resume_store)
    return {"questions": questions}


@app.post("/detect-fake-resume")
async def detect_fake_resume(file: UploadFile = File(...)):
    """Analyze a resume for signs of being AI-generated or fake."""
    if not _valid_extension(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported: {', '.join(SUPPORTED_EXTENSIONS)}",
        )

    tmp_path = UPLOAD_DIR / f"tmp_{uuid.uuid4().hex}_{file.filename}"
    try:
        with open(tmp_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
        text = _file_extractor.extract_text(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze resume: {e}")
    finally:
        _cleanup(tmp_path)

    return _fake_detector_agent.detect_fake_resume(text)


_JOB_RECOMMENDATION_PROMPT = """You are a career advisor. Based on this candidate's resume summary, recommend the best-fit job roles.

Resume Summary:
{summary}

Respond ONLY with a valid JSON object. No markdown, no code fences, no extra text.

{{
  "profile": "<one-sentence candidate overview>",
  "experience_level": "<Junior|Mid|Senior|Lead|Principal>",
  "years_experience": <number>,
  "top_skills": ["<skill1>", "<skill2>"],
  "recommended_roles": [
    {{
      "title": "<Specific Job Title>",
      "match_score": <0-100>,
      "why_fits": "<1-2 sentence explanation>",
      "skills_matched": ["<skill1>", "<skill2>"],
      "search_keywords": "<keywords for job board search>"
    }}
  ]
}}

Include 5-6 roles ranked by match_score descending. Use specific titles like "Senior DevOps Engineer" not just "Engineer".
"""


@app.post("/job-recommendations")
async def job_recommendations(request: JobRecommendationRequest):
    """Return LLM-generated job role recommendations for a stored resume."""
    stored = _resume_store.get_resume(request.resume_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Resume not found. Analyze it first.")

    summary = stored.get("summary", "")
    if not summary:
        raise HTTPException(status_code=400, detail="Resume has no summary. Re-analyze it first.")

    prompt = _JOB_RECOMMENDATION_PROMPT.format(summary=summary)
    try:
        raw = _provider.generate_filtered(prompt)
        # Strip any accidental markdown code fences
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
        result = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="LLM returned malformed JSON for job recommendations. Try again.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {e}")

    return result


_KEYWORD_EXTRACT_PROMPT = """From this resume summary extract job search information.
Respond ONLY with a JSON object — no markdown, no extra text:
{{"search_query": "<3-5 word job title + top tech skill>", "top_skills": ["skill1", "skill2", "skill3", "skill4", "skill5"]}}

Example: {{"search_query": "Senior DevOps Engineer Kubernetes AWS", "top_skills": ["Kubernetes", "AWS", "Terraform", "Python", "CI/CD"]}}

Resume summary:
{summary}
"""


def _match_score(description: str, skills: list) -> int:
    """Simple keyword-overlap score — avoids an extra LLM call per job."""
    desc = description.lower()
    hits = sum(1 for s in skills if s.lower() in desc)
    return min(95, 45 + round((hits / max(len(skills), 1)) * 50))


@app.post("/job-discovery")
async def job_discovery(request: JobDiscoveryRequest):
    """Fetch live job listings from Adzuna matching the candidate's resume."""
    adzuna_id  = os.getenv("ADZUNA_APP_ID")
    adzuna_key = os.getenv("ADZUNA_APP_KEY")
    if not adzuna_id or not adzuna_key:
        raise HTTPException(status_code=500, detail="Adzuna API keys not configured. Add ADZUNA_APP_ID and ADZUNA_APP_KEY to .env.")

    stored = _resume_store.get_resume(request.resume_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Resume not found. Analyze it first.")

    summary = stored.get("summary", "")
    if not summary:
        raise HTTPException(status_code=400, detail="Resume has no summary. Re-analyze it first.")

    # Extract search keywords from resume summary via LLM
    try:
        raw = _provider.generate_filtered(_KEYWORD_EXTRACT_PROMPT.format(summary=summary[:800]))
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
        kw_data = json.loads(raw)
        search_query = kw_data.get("search_query", "software engineer")
        top_skills   = kw_data.get("top_skills", [])
    except Exception:
        search_query = "software engineer"
        top_skills   = []

    # Call Adzuna Search API
    country = request.country_code or "in"
    params = {
        "app_id":           adzuna_id,
        "app_key":          adzuna_key,
        "results_per_page": 10,
        "what":             search_query,
        "content-type":     "application/json",
        "sort_by":          "relevance",
    }
    if request.location:
        params["where"] = request.location

    try:
        resp = httpx.get(
            f"https://api.adzuna.com/v1/api/jobs/{country}/search/1",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Adzuna API returned {e.response.status_code}. Check your API keys.")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Adzuna: {e}")

    data = resp.json()
    jobs = []
    for j in data.get("results", []):
        desc  = j.get("description", "")
        title = j.get("title", "")
        sal_min = j.get("salary_min")
        sal_max = j.get("salary_max")
        salary  = None
        if sal_min and sal_max:
            salary = f"₹{sal_min/100000:.0f}L–{sal_max/100000:.0f}L" if country == "in" else f"${sal_min:,.0f}–${sal_max:,.0f}"
        elif sal_min:
            salary = f"₹{sal_min/100000:.0f}L+" if country == "in" else f"${sal_min:,.0f}+"

        jobs.append({
            "title":       title,
            "company":     j.get("company", {}).get("display_name", "Unknown"),
            "location":    j.get("location", {}).get("display_name", ""),
            "description": desc[:250].rstrip() + "…" if len(desc) > 250 else desc,
            "apply_url":   j.get("redirect_url", ""),
            "salary":      salary,
            "posted":      j.get("created", "")[:10],
            "match_score": _match_score(title + " " + desc, top_skills),
        })

    # Sort by match score descending
    jobs.sort(key=lambda x: x["match_score"], reverse=True)

    return {
        "search_query": search_query,
        "top_skills":   top_skills,
        "country":      country,
        "total":        data.get("count", len(jobs)),
        "jobs":         jobs,
    }


_INTERVIEW_RESOURCES_PROMPT = """You are a senior technical recruiter and interview coach.

Role to prepare for: {role}
Candidate's current skills: {skills}

Generate a focused interview preparation guide. Respond ONLY with valid JSON (no markdown, no code fences).

{{
  "role": "<role name>",
  "preparation_time": "<e.g. 3-4 weeks>",
  "sections": [
    {{
      "title": "<section title>",
      "resources": [
        {{
          "name": "<resource name>",
          "description": "<one sentence: what to focus on and why>",
          "url": "<real canonical URL — official docs, GitHub, or well-known learning platform only>",
          "type": "<docs|course|video|practice|community>"
        }}
      ]
    }}
  ]
}}

Include exactly 4 sections in this order:
1. "Core Technical Skills" — 4-5 resources (official docs, tutorials for key technologies in this role)
2. "System Design & Architecture" — 3-4 resources (system design resources relevant to the role)
3. "Interview Practice" — 3-4 resources (coding platforms, mock interviews, role-specific prep)
4. "Community & Research" — 3 resources (relevant GitHub repos, communities, job-specific blogs)

Only use real, stable URLs. Prefer official documentation and well-known platforms.
"""


@app.post("/interview-resources")
async def interview_resources(request: InterviewResourceRequest):
    """Generate role-specific interview preparation resources."""
    if not request.role.strip():
        raise HTTPException(status_code=400, detail="Role cannot be empty.")

    prompt = _INTERVIEW_RESOURCES_PROMPT.format(
        role=request.role.strip(),
        skills=request.skills.strip() if request.skills else "not specified",
    )
    try:
        raw = _provider.generate_filtered(prompt)
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
        result = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="LLM returned malformed JSON for resources. Try again.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating resources: {e}")

    return result


_ATS_CHECK_PROMPT = """You are an expert ATS (Applicant Tracking System) analyst.
Analyze this resume for ATS compatibility and return ONLY valid JSON (no markdown, no code fences).

Resume summary:
{resume_text}

{{
  "overall_score": <integer 0-100>,
  "grade": "<Excellent|Good|Fair|Poor>",
  "sections": {{
    "contact_info":          {{"score": <0-100>, "status": "<ok|warning|missing>", "feedback": "<one actionable sentence>"}},
    "professional_summary":  {{"score": <0-100>, "status": "<ok|warning|missing>", "feedback": "<one actionable sentence>"}},
    "work_experience":       {{"score": <0-100>, "status": "<ok|warning|missing>", "feedback": "<one actionable sentence>"}},
    "skills":                {{"score": <0-100>, "status": "<ok|warning|missing>", "feedback": "<one actionable sentence>"}},
    "education":             {{"score": <0-100>, "status": "<ok|warning|missing>", "feedback": "<one actionable sentence>"}}
  }},
  "keywords_found":   ["<keyword>", ...],
  "keywords_missing": ["<keyword>", ...],
  "issues":           ["<specific issue 1>", "<specific issue 2>", "<specific issue 3>"],
  "improvements":     ["<specific improvement 1>", "<specific improvement 2>", "<specific improvement 3>"]
}}

Be specific and honest. keywords_found: 6-10 strong keywords present. keywords_missing: 5-8 important missing keywords.
"""


@app.post("/ats-check")
async def ats_check(request: ATSCheckRequest):
    """Run ATS compatibility analysis on a stored resume."""
    stored = _resume_store.get_resume(request.resume_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Resume not found. Analyze it first.")

    summary = stored.get("summary", "")
    if not summary:
        raise HTTPException(status_code=400, detail="Resume has no summary. Re-analyze it first.")

    prompt = _ATS_CHECK_PROMPT.format(resume_text=summary[:2000])
    try:
        raw = _provider.generate_filtered(prompt)
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
        result = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="LLM returned malformed JSON for ATS check. Try again.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running ATS check: {e}")

    return result


@app.post("/feedback")
async def add_feedback(request: FeedbackRequest):
    """Record thumbs-up / thumbs-down feedback for a resume analysis."""
    success = _resume_store.add_feedback(
        request.resume_id, request.is_positive, request.feedback_text
    )
    if not success:
        raise HTTPException(status_code=404, detail="Resume not found.")
    return {"status": "success"}


@app.get("/feedback-stats")
async def get_feedback_stats():
    """Return aggregate feedback statistics."""
    return _resume_store.get_feedback_stats()


if __name__ == "__main__":
    uvicorn.run("resume_analyzer_api:app", host="0.0.0.0", port=8000, reload=True)
