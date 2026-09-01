"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE } from "../../lib/api";

interface StoredResume {
  id: string;
  summary: string;
}

interface RecommendedRole {
  title: string;
  match_score: number;
  why_fits: string;
  skills_matched: string[];
  search_keywords: string;
}

export interface RecommendationResult {
  profile: string;
  experience_level: string;
  years_experience: number;
  top_skills: string[];
  recommended_roles: RecommendedRole[];
}

interface Props {
  initialResumeId?: string;
  result: RecommendationResult | null;
  onResultChange: (r: RecommendationResult | null) => void;
  onResumeIdChange: (id: string) => void;
  onPrepForRole: (roleTitle: string) => void;
}

const JOB_BOARDS = [
  {
    name: "LinkedIn",
    color: "bg-[#0A66C2] hover:bg-[#004182] text-white",
    url: (kw: string) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(kw)}`,
  },
  {
    name: "Indeed",
    color: "bg-[#2164f3] hover:bg-[#1a4fcf] text-white",
    url: (kw: string) => `https://www.indeed.com/jobs?q=${encodeURIComponent(kw)}`,
  },
  {
    name: "Glassdoor",
    color: "bg-emerald-600 hover:bg-emerald-700 text-white",
    url: (kw: string) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(kw)}`,
  },
  {
    name: "Naukri",
    color: "bg-orange-500 hover:bg-orange-600 text-white",
    url: (kw: string) =>
      `https://www.naukri.com/${encodeURIComponent(kw.toLowerCase().replace(/\s+/g, "-"))}-jobs`,
  },
];

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85 ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : score >= 70 ? "bg-blue-100 text-blue-700 border-blue-200"
    : "bg-amber-100 text-amber-700 border-amber-200";
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${color}`}>
      {score}% match
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 85 ? "bg-emerald-500"
    : score >= 70 ? "bg-blue-500"
    : "bg-amber-500";
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${score}%` }} />
    </div>
  );
}

export default function JobRecommendations({
  initialResumeId = "",
  result,
  onResultChange,
  onResumeIdChange,
  onPrepForRole,
}: Props) {
  const [resumes, setResumes]   = useState<StoredResume[]>([]);
  const [selectedId, setSelectedId] = useState(initialResumeId);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    axios
      .get(`${API_BASE}/resumes`)
      .then((r: any) => {
        const list = r.data.resumes ?? [];
        setResumes(list);
        if (!selectedId && list.length > 0) {
          const id = list[0].id;
          setSelectedId(id);
          onResumeIdChange(id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialResumeId && initialResumeId !== selectedId) {
      setSelectedId(initialResumeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResumeId]);

  const handleIdChange = (id: string) => {
    setSelectedId(id);
    onResumeIdChange(id);
    onResultChange(null);
  };

  const handleAnalyze = async () => {
    if (!selectedId) return;
    setLoading(true);
    setError("");
    onResultChange(null);
    try {
      const r = await axios.post(`${API_BASE}/job-recommendations`, { resume_id: selectedId });
      onResultChange(r.data);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Error generating recommendations. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Controls card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Career Fit Analysis</h2>
            <p className="text-xs text-purple-200">AI identifies the roles that best match your profile</p>
          </div>
        </div>

        <div className="p-6">
          {resumes.length === 0 ? (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>No analyzed resumes yet. Upload one on the <strong>Find & Apply</strong> tab first.</span>
            </div>
          ) : (
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-48">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Resume</label>
                <select
                  value={selectedId}
                  onChange={(e) => handleIdChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id.replace(/^[0-9a-f]+_/, "")}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={loading || !selectedId}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all ${
                  loading || !selectedId
                    ? "bg-violet-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-violet-600 to-purple-600 hover:opacity-90 shadow-md shadow-violet-200"
                }`}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Analyzing…
                  </span>
                ) : "Analyze My Fit"}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Profile banner card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 pt-5 pb-8">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Your AI Profile</p>
              <p className="text-white font-medium text-sm leading-relaxed">{result.profile}</p>
            </div>
            <div className="px-6 pb-5 -mt-5">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
                <div className="flex gap-2">
                  <span className="text-xs px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-bold">
                    {result.experience_level}
                  </span>
                  <span className="text-xs px-3 py-1.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200 font-semibold">
                    {result.years_experience}+ yrs exp
                  </span>
                </div>
                {result.top_skills?.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {result.top_skills.map((skill) => (
                      <span key={skill} className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Role cards */}
          {result.recommended_roles.map((role, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Rank badge */}
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shrink-0 border border-slate-200">
                    <span className="text-xs font-extrabold text-slate-500">{String(i + 1).padStart(2, "0")}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-gray-900 text-base">{role.title}</h3>
                      <ScoreBadge score={role.match_score} />
                    </div>
                    <ScoreBar score={role.match_score} />
                    <p className="text-sm text-gray-600 mt-2 leading-relaxed">{role.why_fits}</p>
                  </div>
                </div>

                {role.skills_matched?.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-4 ml-14">
                    {role.skills_matched.map((s) => (
                      <span key={s} className="text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action row */}
              <div className="px-5 pb-4 flex gap-2 flex-wrap items-center border-t border-gray-100 pt-3">
                <span className="text-xs text-gray-400 font-medium mr-1">Search on:</span>
                {JOB_BOARDS.map((board) => (
                  <a
                    key={board.name}
                    href={board.url(role.search_keywords)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${board.color} transition-colors`}
                  >
                    {board.name} →
                  </a>
                ))}
                <button
                  onClick={() => onPrepForRole(role.title)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors ml-auto"
                >
                  Prep for this role →
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
