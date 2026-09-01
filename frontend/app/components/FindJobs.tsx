"use client";

import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import { API_BASE, getClientId } from "../../lib/api";

interface StoredResume { id: string; summary: string }

interface LiveJob {
  title: string;
  company: string;
  location: string;
  description: string;
  apply_url: string;
  salary: string | null;
  posted: string;
  match_score: number;
}

interface RecommendedRole {
  title: string;
  match_score: number;
  why_fits: string;
  skills_matched: string[];
  search_keywords: string;
}

interface CareerFit {
  profile: string;
  experience_level: string;
  years_experience: number;
  top_skills: string[];
  recommended_roles: RecommendedRole[];
}

interface LiveJobs {
  search_query: string;
  top_skills: string[];
  country: string;
  total: number;
  jobs: LiveJob[];
}

export interface FindJobsResult {
  careerFit: CareerFit | null;
  liveJobs: LiveJobs | null;
}

interface Props {
  result: FindJobsResult | null;
  onResultChange: (r: FindJobsResult | null) => void;
  onPrepForRole: (title: string) => void;
}

const COUNTRIES = [
  { code: "in", label: "India" },
  { code: "us", label: "USA" },
  { code: "gb", label: "UK" },
  { code: "au", label: "Australia" },
  { code: "sg", label: "Singapore" },
  { code: "ca", label: "Canada" },
];

const JOB_BOARDS = [
  { name: "LinkedIn",  color: "bg-[#0A66C2] hover:bg-[#004182]", url: (kw: string) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(kw)}` },
  { name: "Indeed",    color: "bg-[#2164f3] hover:bg-[#1a4fcf]", url: (kw: string) => `https://www.indeed.com/jobs?q=${encodeURIComponent(kw)}` },
  { name: "Glassdoor", color: "bg-emerald-600 hover:bg-emerald-700", url: (kw: string) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(kw)}` },
  { name: "Naukri",    color: "bg-orange-500 hover:bg-orange-600", url: (kw: string) => `https://www.naukri.com/${encodeURIComponent(kw.toLowerCase().replace(/\s+/g, "-"))}-jobs` },
];

const AVATAR_COLORS = ["from-blue-500 to-blue-700","from-violet-500 to-violet-700","from-emerald-500 to-emerald-700","from-rose-500 to-rose-700","from-amber-500 to-amber-700","from-cyan-500 to-cyan-700"];

function CompanyAvatar({ name }: { name: string }) {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_COLORS.length;
  return (
    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${AVATAR_COLORS[idx]} flex items-center justify-center shrink-0 shadow-sm`}>
      <span className="text-white font-bold text-sm">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

function MatchBadge({ score }: { score: number }) {
  const c = score >= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : score >= 65 ? "bg-blue-100 text-blue-700 border-blue-200"
    : "bg-amber-100 text-amber-700 border-amber-200";
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${c}`}>{score}% match</span>;
}

const STEPS = [
  { key: "uploading",  label: "Uploading" },
  { key: "analyzing",  label: "AI Analysis" },
  { key: "searching",  label: "Finding Jobs" },
] as const;

function ProgressSteps({ step }: { step: "uploading" | "analyzing" | "searching" }) {
  const order = ["uploading", "analyzing", "searching"];
  const idx = order.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-1 py-3">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              i < idx  ? "bg-emerald-500 text-white"
              : i === idx ? "bg-sky-600 text-white ring-4 ring-sky-100"
              : "bg-gray-100 text-gray-400"
            }`}>
              {i < idx ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : i + 1}
            </div>
            <span className={`text-xs font-medium ${i <= idx ? "text-gray-800" : "text-gray-400"}`}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-6 h-0.5 mx-1 rounded-full ${i < idx ? "bg-emerald-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function FindJobs({ result, onResultChange, onPrepForRole }: Props) {
  const [resumes, setResumes]       = useState<StoredResume[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [country, setCountry]       = useState("in");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  const [uploadFile, setUploadFile]   = useState<File | null>(null);
  const [uploadStep, setUploadStep]   = useState<"idle" | "uploading" | "analyzing" | "done">("idle");
  const [uploadError, setUploadError] = useState("");

  // Which sections are loading
  const [loadingFit, setLoadingFit]   = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);

  useEffect(() => {
    axios.get(`${API_BASE}/resumes`, { params: { client_id: getClientId() } }).then((r: any) => {
      const list: StoredResume[] = r.data.resumes ?? [];
      setResumes(list);
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) { setUploadFile(files[0]); setUploadError(""); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
  });

  const runSearch = async (resumeId: string, countryCode: string) => {
    onResultChange(null);
    setError("");
    setLoadingFit(true);
    setLoadingJobs(true);

    // Fire both in parallel
    const [fitRes, jobsRes] = await Promise.allSettled([
      axios.post(`${API_BASE}/job-recommendations`, { resume_id: resumeId }),
      axios.post(`${API_BASE}/job-discovery`, { resume_id: resumeId, country_code: countryCode }),
    ]);

    setLoadingFit(false);
    setLoadingJobs(false);

    const careerFit = fitRes.status === "fulfilled" ? fitRes.value.data : null;
    const liveJobs  = jobsRes.status === "fulfilled" ? jobsRes.value.data : null;

    if (!careerFit && !liveJobs) {
      const msg = fitRes.status === "rejected"
        ? (fitRes.reason?.response?.data?.detail ?? "Search failed. Please try again.")
        : (jobsRes.status === "rejected" ? jobsRes.reason?.response?.data?.detail : "Search failed.");
      setError(msg ?? "Search failed. Please try again.");
      return;
    }

    onResultChange({ careerFit, liveJobs });
  };

  const handleUploadAndSearch = async () => {
    if (!uploadFile) return;
    setUploadError("");
    onResultChange(null);
    try {
      setUploadStep("uploading");
      const clientId = getClientId();
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("client_id", clientId);
      const up = await axios.post(`${API_BASE}/upload`, form, { headers: { "Content-Type": "multipart/form-data" } });
      const file_id: string = up.data.file_id;

      setUploadStep("analyzing");
      await axios.post(`${API_BASE}/summarize`, { file_id, client_id: clientId });

      const listRes = await axios.get(`${API_BASE}/resumes`, { params: { client_id: clientId } });
      const list: StoredResume[] = listRes.data.resumes ?? [];
      setResumes(list);
      setSelectedId(file_id);
      setUploadStep("done");

      setLoading(true);
      await runSearch(file_id, country);
    } catch (err: any) {
      setUploadError(err.response?.data?.detail ?? "Upload failed. Please try again.");
      setUploadStep("idle");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!selectedId) return;
    setLoading(true);
    await runSearch(selectedId, country);
    setLoading(false);
  };

  const [showUploadNew, setShowUploadNew] = useState(false);
  const hasResumes = resumes.length > 0;
  const isUploading = uploadStep === "uploading" || uploadStep === "analyzing";
  const progressStep: "uploading" | "analyzing" | "searching" =
    uploadStep === "uploading" ? "uploading" : uploadStep === "analyzing" ? "analyzing" : "searching";

  return (
    <div className="space-y-5">
      {/* Control card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Find Matching Jobs</p>
              <p className="text-xs text-slate-400">AI career fit analysis + live Adzuna job listings</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-white/20 text-white font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
            LIVE
          </div>
        </div>

        <div className="p-6 bg-[#f7fcfe]">
          {!hasResumes ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Upload your resume once — AI extracts your profile, finds your best-fit roles, and searches live job boards.</p>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  isDragActive ? "border-sky-400 bg-sky-50"
                  : uploadFile ? "border-emerald-400 bg-emerald-50/50"
                  : "border-gray-200 hover:border-sky-300 hover:bg-sky-50/20"
                }`}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-3">
                  {uploadFile ? (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{uploadFile.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{(uploadFile.size / 1024).toFixed(0)} KB · click to change</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-100 to-teal-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Drop resume here or <span className="text-sky-600 font-semibold">browse</span></p>
                        <p className="text-xs text-gray-400 mt-1">PDF, DOCX or TXT</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {uploadFile && (
                <>
                  {isUploading && <ProgressSteps step={progressStep} />}
                  <button onClick={handleUploadAndSearch} disabled={isUploading}
                    className={`w-full py-3 rounded-xl font-bold text-sm text-white ${isUploading ? "bg-sky-400 cursor-not-allowed" : "bg-gradient-to-r from-sky-500 to-teal-500 hover:opacity-90 shadow-md shadow-sky-200"}`}>
                    {isUploading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Working…
                      </span>
                    ) : "Analyze & Find Jobs"}
                  </button>
                </>
              )}
              {uploadError && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm"><strong>Error:</strong> {uploadError}</div>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-3 flex-wrap items-end">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Resume</label>
                  <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); onResultChange(null); setShowUploadNew(false); }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-800">
                    {resumes.map((r) => <option key={r.id} value={r.id}>{r.id.replace(/^[0-9a-f]+_/, "")}</option>)}
                  </select>
                </div>
                <div className="w-full sm:w-36">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Market</label>
                  <select value={country} onChange={(e) => { setCountry(e.target.value); onResultChange(null); }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-800">
                    {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Upload different resume toggle */}
              <button onClick={() => { setShowUploadNew(v => !v); setUploadFile(null); setUploadError(""); }}
                className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-800 font-semibold">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {showUploadNew ? "Cancel upload" : "Upload a different resume"}
              </button>

              {showUploadNew && (
                <div className="space-y-3 pt-1">
                  <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isDragActive ? "border-sky-400 bg-sky-50"
                    : uploadFile ? "border-emerald-400 bg-emerald-50/50"
                    : "border-gray-200 hover:border-sky-300 hover:bg-sky-50/20"
                  }`}>
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center gap-2">
                      {uploadFile ? (
                        <>
                          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <p className="font-semibold text-gray-900 text-sm">{uploadFile.name}</p>
                          <p className="text-xs text-gray-400">{(uploadFile.size / 1024).toFixed(0)} KB · click to change</p>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-100 to-teal-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-gray-700">Drop resume or <span className="text-sky-600 font-semibold">browse</span></p>
                          <p className="text-xs text-gray-400">PDF, DOCX or TXT</p>
                        </>
                      )}
                    </div>
                  </div>
                  {uploadFile && (
                    <>
                      {isUploading && <ProgressSteps step={progressStep} />}
                      <button onClick={handleUploadAndSearch} disabled={isUploading}
                        className={`w-full py-3 rounded-xl font-bold text-sm text-white ${isUploading ? "bg-sky-400 cursor-not-allowed" : "bg-gradient-to-r from-sky-500 to-teal-500 hover:opacity-90 shadow-md shadow-sky-200"}`}>
                        {isUploading ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Working…
                          </span>
                        ) : "Analyze & Find Jobs"}
                      </button>
                    </>
                  )}
                  {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
                </div>
              )}

              {!showUploadNew && (
                <>
                  {loading && <ProgressSteps step="searching" />}
                  <button onClick={handleSearch} disabled={loading || !selectedId}
                    className={`w-full py-3 rounded-xl font-bold text-sm text-white ${loading || !selectedId ? "bg-sky-400 cursor-not-allowed" : "bg-gradient-to-r from-sky-500 to-teal-500 hover:opacity-90 shadow-md shadow-sky-200"}`}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Finding your jobs…
                      </span>
                    ) : "Find My Jobs"}
                  </button>
                  {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm"><strong>Error:</strong> {error}</div>}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">

          {/* ── Career Fit Section ── */}
          {result.careerFit && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-gray-900">Your Career Fit</h2>
                <span className="text-xs text-gray-400 font-medium">AI-matched roles based on your profile</span>
              </div>

              {/* Profile summary */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 pt-4 pb-7">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Your Profile</p>
                  <p className="text-white text-sm leading-relaxed font-medium">{result.careerFit.profile}</p>
                </div>
                <div className="px-5 pb-4 -mt-4">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3.5 flex flex-wrap gap-2 items-center">
                    <span className="text-xs px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-bold">{result.careerFit.experience_level}</span>
                    <span className="text-xs px-3 py-1.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200 font-semibold">{result.careerFit.years_experience}+ yrs</span>
                    {result.careerFit.top_skills?.map((s) => (
                      <span key={s} className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Role recommendations */}
              <div className="grid gap-3 sm:grid-cols-2">
                {result.careerFit.recommended_roles.map((role, i) => (
                  <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                        <span className="text-xs font-extrabold text-slate-500">{String(i + 1).padStart(2, "0")}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h3 className="font-bold text-gray-900 text-sm">{role.title}</h3>
                          <MatchBadge score={role.match_score} />
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                          <div className={`h-1 rounded-full ${role.match_score >= 85 ? "bg-emerald-500" : role.match_score >= 70 ? "bg-blue-500" : "bg-amber-500"}`}
                            style={{ width: `${role.match_score}%` }} />
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mb-3 leading-relaxed">{role.why_fits}</p>
                    {role.skills_matched?.length > 0 && (
                      <div className="flex gap-1 flex-wrap mb-3">
                        {role.skills_matched.map((s) => (
                          <span key={s} className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">{s}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {JOB_BOARDS.map((b) => (
                        <a key={b.name} href={b.url(role.search_keywords)} target="_blank" rel="noopener noreferrer"
                          className={`text-xs font-semibold text-white px-2.5 py-1 rounded-lg ${b.color} transition-colors`}>
                          {b.name}
                        </a>
                      ))}
                      <button onClick={() => onPrepForRole(role.title)}
                        className="text-xs font-semibold text-teal-600 px-2.5 py-1 rounded-lg border border-teal-200 hover:bg-teal-50 transition-colors ml-auto">
                        Prep →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Live Jobs Section ── */}
          {result.liveJobs && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE
                  </span>
                  <h2 className="text-sm font-bold text-gray-900">
                    {result.liveJobs.total.toLocaleString()} openings matching{" "}
                    <span className="text-teal-600">"{result.liveJobs.search_query}"</span>
                  </h2>
                </div>
                <span className="text-xs text-gray-400">Powered by Adzuna · by relevance</span>
              </div>

              <div className="space-y-3">
                {result.liveJobs.jobs.map((job, i) => {
                  const borderColor = job.match_score >= 80 ? "border-l-emerald-400" : job.match_score >= 65 ? "border-l-blue-400" : "border-l-amber-400";
                  return (
                    <div key={i} className={`bg-white rounded-2xl shadow-sm border border-gray-200/80 border-l-4 ${borderColor} p-5 hover:shadow-md transition-shadow`}>
                      <div className="flex items-start gap-3">
                        <CompanyAvatar name={job.company || "?"} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap mb-0.5">
                            <h3 className="font-bold text-gray-900 text-base leading-tight">{job.title}</h3>
                            <MatchBadge score={job.match_score} />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 text-sm text-gray-500">
                            <span className="font-semibold text-gray-700">{job.company}</span>
                            {job.location && <span className="text-gray-400">· {job.location}</span>}
                            {job.posted && <span className="text-gray-400">· {job.posted}</span>}
                          </div>
                          {job.salary && (
                            <span className="inline-block mt-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {job.salary}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-3 leading-relaxed line-clamp-2">{job.description}</p>
                      <div className="flex gap-2 mt-4 flex-wrap items-center">
                        <a href={job.apply_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-r from-sky-500 to-teal-500 hover:opacity-90 px-5 py-2 rounded-xl shadow-sm shadow-sky-200 transition-all">
                          Apply Now
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </a>
                        <button onClick={() => onPrepForRole(job.title)}
                          className="text-xs font-semibold text-teal-600 hover:text-teal-800 px-3.5 py-2 rounded-xl border border-teal-200 hover:bg-teal-50 transition-colors">
                          Prep for this role →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
