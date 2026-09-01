"use client";

import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import { API_BASE } from "../../lib/api";

interface StoredResume { id: string; summary: string }

interface Job {
  title: string;
  company: string;
  location: string;
  description: string;
  apply_url: string;
  salary: string | null;
  posted: string;
  match_score: number;
}

export interface JobDiscoveryResult {
  search_query: string;
  top_skills: string[];
  country: string;
  total: number;
  jobs: Job[];
}

interface Props {
  result: JobDiscoveryResult | null;
  onResultChange: (r: JobDiscoveryResult | null) => void;
  onPrepForRole: (roleTitle: string) => void;
}

const COUNTRIES = [
  { code: "in", label: "India" },
  { code: "us", label: "USA" },
  { code: "gb", label: "UK" },
  { code: "au", label: "Australia" },
  { code: "sg", label: "Singapore" },
  { code: "ca", label: "Canada" },
];

const AVATAR_GRADIENTS = [
  "from-blue-500 to-blue-700",
  "from-violet-500 to-violet-700",
  "from-emerald-500 to-emerald-700",
  "from-rose-500 to-rose-700",
  "from-amber-500 to-amber-700",
  "from-cyan-500 to-cyan-700",
  "from-pink-500 to-pink-700",
];

function CompanyAvatar({ name }: { name: string }) {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length;
  return (
    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${AVATAR_GRADIENTS[idx]} flex items-center justify-center shrink-0 shadow-sm`}>
      <span className="text-white font-bold text-base">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const style =
    score >= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : score >= 65 ? "bg-blue-100 text-blue-700 border-blue-200"
    : "bg-amber-100 text-amber-700 border-amber-200";
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${style}`}>
      {score}% match
    </span>
  );
}

const STEPS = [
  { key: "uploading", label: "Uploading" },
  { key: "analyzing", label: "AI Analysis" },
  { key: "searching", label: "Finding Jobs" },
] as const;

function ProgressSteps({ step }: { step: "uploading" | "analyzing" | "searching" }) {
  const order = ["uploading", "analyzing", "searching"];
  const currentIdx = order.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-1 py-4">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < currentIdx  ? "bg-emerald-500 text-white"
              : i === currentIdx ? "bg-blue-600 text-white ring-4 ring-blue-100"
              : "bg-gray-100 text-gray-400"
            }`}>
              {i < currentIdx ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : i + 1}
            </div>
            <span className={`text-xs font-medium ${i <= currentIdx ? "text-gray-800" : "text-gray-400"}`}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-6 h-0.5 mx-1 rounded-full ${i < currentIdx ? "bg-emerald-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function JobDiscovery({ result, onResultChange, onPrepForRole }: Props) {
  const [resumes, setResumes]         = useState<StoredResume[]>([]);
  const [selectedId, setSelectedId]   = useState("");
  const [country, setCountry]         = useState("in");
  const [searching, setSearching]     = useState(false);
  const [searchError, setSearchError] = useState("");

  const [uploadFile, setUploadFile]   = useState<File | null>(null);
  const [uploadStep, setUploadStep]   = useState<"idle" | "uploading" | "analyzing" | "done">("idle");
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    axios.get(`${API_BASE}/resumes`).then((r: any) => {
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

  const handleUploadAndSearch = async () => {
    if (!uploadFile) return;
    setUploadError("");
    setSearchError("");
    onResultChange(null);
    try {
      setUploadStep("uploading");
      const form = new FormData();
      form.append("file", uploadFile);
      const uploadRes = await axios.post(`${API_BASE}/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const file_id: string = uploadRes.data.file_id;

      setUploadStep("analyzing");
      await axios.post(`${API_BASE}/summarize`, { file_id });

      const listRes = await axios.get(`${API_BASE}/resumes`);
      const list: StoredResume[] = listRes.data.resumes ?? [];
      setResumes(list);
      setSelectedId(file_id);
      setUploadStep("done");

      await doSearch(file_id, country);
    } catch (err: any) {
      setUploadError(err.response?.data?.detail ?? "Upload failed. Please try again.");
      setUploadStep("idle");
    }
  };

  const doSearch = async (resumeId: string, countryCode: string) => {
    if (!resumeId) return;
    setSearching(true);
    setSearchError("");
    onResultChange(null);
    try {
      const r = await axios.post(`${API_BASE}/job-discovery`, {
        resume_id: resumeId,
        country_code: countryCode,
      });
      onResultChange(r.data);
    } catch (err: any) {
      setSearchError(err.response?.data?.detail ?? "Error fetching jobs. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const hasResumes = resumes.length > 0;
  const isLoading  = searching || uploadStep === "uploading" || uploadStep === "analyzing";

  const progressStep: "uploading" | "analyzing" | "searching" =
    uploadStep === "uploading" ? "uploading"
    : uploadStep === "analyzing" ? "analyzing"
    : "searching";

  return (
    <div className="space-y-5">
      {/* Control card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
        {/* Card header strip */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Find & Apply</h2>
            <p className="text-xs text-blue-200">Live job listings powered by Adzuna</p>
          </div>
        </div>

        <div className="p-6">
          {!hasResumes ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Drop your resume — AI extracts your profile and searches live job boards instantly.
              </p>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  isDragActive  ? "border-blue-400 bg-blue-50 scale-[1.01]"
                  : uploadFile  ? "border-emerald-400 bg-emerald-50/50"
                  : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/20"
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
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          Drop resume here, or <span className="text-blue-600 font-semibold">browse files</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-1">PDF, DOCX, or TXT · max 10 MB</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {uploadFile && (
                <>
                  {isLoading && <ProgressSteps step={progressStep} />}
                  <button
                    onClick={handleUploadAndSearch}
                    disabled={isLoading}
                    className={`w-full py-3 rounded-xl font-bold text-sm text-white transition-all ${
                      isLoading
                        ? "bg-blue-400 cursor-not-allowed"
                        : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 shadow-md shadow-blue-200"
                    }`}
                  >
                    {isLoading ? (
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

              {uploadError && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                  <strong>Error:</strong> {uploadError}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-3 flex-wrap items-end">
                <div className="flex-1 min-w-44">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Resume</label>
                  <select
                    value={selectedId}
                    onChange={(e) => { setSelectedId(e.target.value); onResultChange(null); }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                  >
                    {resumes.map((r) => (
                      <option key={r.id} value={r.id}>{r.id.replace(/^[0-9a-f]+_/, "")}</option>
                    ))}
                  </select>
                </div>
                <div className="w-36">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Market</label>
                  <select
                    value={country}
                    onChange={(e) => { setCountry(e.target.value); onResultChange(null); }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                  >
                    {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {isLoading && <ProgressSteps step={progressStep} />}

              <button
                onClick={() => doSearch(selectedId, country)}
                disabled={isLoading || !selectedId}
                className={`w-full py-3 rounded-xl font-bold text-sm text-white transition-all ${
                  isLoading || !selectedId
                    ? "bg-blue-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 shadow-md shadow-blue-200"
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Searching live jobs…
                  </span>
                ) : "Find Matching Jobs"}
              </button>

              {searchError && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                  <strong>Error:</strong> {searchError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Results meta */}
          <div className="flex items-center justify-between flex-wrap gap-3 px-1">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
                <p className="text-sm font-semibold text-gray-900">
                  {result.total.toLocaleString()} jobs matching{" "}
                  <span className="text-blue-600">"{result.search_query}"</span>
                </p>
              </div>
              {result.top_skills?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {result.top_skills.map((s) => (
                    <span key={s} className="text-xs px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span className="text-xs text-gray-400">Powered by Adzuna · sorted by relevance</span>
          </div>

          {/* Job cards */}
          <div className="space-y-3">
            {result.jobs.map((job, i) => {
              const borderColor =
                job.match_score >= 80 ? "border-l-emerald-400"
                : job.match_score >= 65 ? "border-l-blue-400"
                : "border-l-amber-400";
              return (
                <div
                  key={i}
                  className={`bg-white rounded-2xl shadow-sm border border-gray-200/80 border-l-4 ${borderColor} p-5 hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-start gap-4">
                    <CompanyAvatar name={job.company || "?"} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-gray-900 text-base leading-tight">{job.title}</h3>
                        <ScoreBadge score={job.match_score} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-500">
                        <span className="font-medium text-gray-700">{job.company}</span>
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
                    <a
                      href={job.apply_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 px-5 py-2 rounded-xl transition-all shadow-sm shadow-blue-200"
                    >
                      Apply Now
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </a>
                    <button
                      onClick={() => onPrepForRole(job.title)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-3.5 py-2 rounded-xl border border-indigo-200 hover:bg-indigo-50 transition-colors"
                    >
                      Prep for this role →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
