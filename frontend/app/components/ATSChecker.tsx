"use client";

import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import { API_BASE, getClientId } from "../../lib/api";

interface StoredResume { id: string; summary: string }

interface SectionResult {
  score: number;
  status: "ok" | "warning" | "missing";
  feedback: string;
}

export interface ATSResult {
  overall_score: number;
  grade: string;
  sections: {
    contact_info: SectionResult;
    professional_summary: SectionResult;
    work_experience: SectionResult;
    skills: SectionResult;
    education: SectionResult;
  };
  keywords_found: string[];
  keywords_missing: string[];
  issues: string[];
  improvements: string[];
}

const SECTION_LABELS: Record<string, string> = {
  contact_info:         "Contact Info",
  professional_summary: "Professional Summary",
  work_experience:      "Work Experience",
  skills:               "Skills",
  education:            "Education",
};

function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const radius = 64;
  const circ   = 2 * Math.PI * radius;
  const filled = (score / 100) * circ;

  const color  = score >= 80 ? "#10b981" : score >= 60 ? "#3b82f6" : score >= 40 ? "#f59e0b" : "#ef4444";
  const bg     = score >= 80 ? "from-emerald-50 to-emerald-100/50" : score >= 60 ? "from-blue-50 to-blue-100/50" : "from-amber-50 to-amber-100/50";
  const label  = score >= 80 ? "ATS Ready" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Work";

  return (
    <div className={`bg-gradient-to-br ${bg} rounded-2xl p-6 flex flex-col items-center gap-3 border border-gray-200/80`}>
      <div className="relative w-36 h-36">
        <svg className="w-36 h-36 -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="14" />
          <circle cx="80" cy="80" r={radius} fill="none" stroke={color} strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circ - filled}`}
            style={{ transition: "stroke-dasharray 1s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="text-4xl font-black text-gray-900">{score}</span>
          <span className="text-xs font-bold text-gray-500">{label}</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-base font-bold text-gray-900">ATS Score</p>
        <p className="text-xs text-gray-500 mt-0.5">out of 100 · Grade: <span className="font-semibold text-gray-700">{grade}</span></p>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: "ok" | "warning" | "missing" }) {
  if (status === "ok") return (
    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
  if (status === "warning") return (
    <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
      <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  );
  return (
    <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
      <svg className="w-3.5 h-3.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  );
}

interface Props {
  result: ATSResult | null;
  onResultChange: (r: ATSResult | null) => void;
}

export default function ATSChecker({ result, onResultChange }: Props) {
  const [resumes, setResumes]       = useState<StoredResume[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  const [uploadFile, setUploadFile]   = useState<File | null>(null);
  const [uploadStep, setUploadStep]   = useState<"idle" | "uploading" | "analyzing">("idle");
  const [uploadError, setUploadError] = useState("");
  const [showUploadNew, setShowUploadNew] = useState(false);

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

  const runCheck = async (resumeId: string) => {
    setLoading(true);
    setError("");
    onResultChange(null);
    try {
      const r = await axios.post(`${API_BASE}/ats-check`, { resume_id: resumeId });
      onResultChange(r.data);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "ATS check failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadAndCheck = async () => {
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
      setUploadStep("idle");
      setShowUploadNew(false);

      await runCheck(file_id);
    } catch (err: any) {
      setUploadError(err.response?.data?.detail ?? "Upload failed. Please try again.");
      setUploadStep("idle");
    }
  };

  const hasResumes = resumes.length > 0;
  const isBusy = loading || uploadStep !== "idle";

  const uploadLabel = uploadStep === "uploading" ? "Uploading…" : uploadStep === "analyzing" ? "Analyzing…" : loading ? "Scoring…" : "Check My Resume";

  return (
    <div className="space-y-5">
      {/* Control card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-white">ATS Resume Checker</p>
            <p className="text-xs text-slate-400">Score your resume for Applicant Tracking Systems</p>
          </div>
        </div>

        <div className="p-6 bg-[#f7fcfe]">
          {!hasResumes ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Upload your resume to get an instant ATS compatibility score with section-by-section feedback.</p>
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
                        <svg className="w-6 h-6 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Drop resume here or <span className="text-teal-600 font-semibold">browse</span></p>
                        <p className="text-xs text-gray-400 mt-1">PDF, DOCX or TXT</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {uploadFile && (
                <button onClick={handleUploadAndCheck} disabled={isBusy}
                  className={`w-full py-3 rounded-xl font-bold text-sm text-white ${isBusy ? "bg-teal-400 cursor-not-allowed" : "bg-gradient-to-r from-sky-500 to-teal-500 hover:opacity-90 shadow-md shadow-teal-200"}`}>
                  {isBusy ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      {uploadLabel}
                    </span>
                  ) : "Check My Resume"}
                </button>
              )}
              {uploadError && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm"><strong>Error:</strong> {uploadError}</div>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-48">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Resume</label>
                  <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); onResultChange(null); }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-800">
                    {resumes.map((r) => <option key={r.id} value={r.id}>{r.id.replace(/^[0-9a-f]+_/, "")}</option>)}
                  </select>
                </div>
                <button onClick={() => runCheck(selectedId)} disabled={isBusy || !selectedId}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white ${isBusy || !selectedId ? "bg-teal-400 cursor-not-allowed" : "bg-gradient-to-r from-sky-500 to-teal-500 hover:opacity-90 shadow-md shadow-teal-200"}`}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Scoring…
                    </span>
                  ) : "Check ATS Score"}
                </button>
              </div>

              {/* Upload different resume toggle */}
              <button
                onClick={() => { setShowUploadNew(v => !v); setUploadFile(null); setUploadError(""); }}
                className="text-xs text-teal-600 hover:text-teal-800 font-semibold flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {showUploadNew ? "Cancel upload" : "Upload a different resume"}
              </button>

              {showUploadNew && (
                <div className="space-y-3 pt-1">
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                      isDragActive ? "border-sky-400 bg-sky-50"
                      : uploadFile ? "border-emerald-400 bg-emerald-50/50"
                      : "border-gray-200 hover:border-sky-300 hover:bg-sky-50/20"
                    }`}
                  >
                    <input {...getInputProps()} />
                    {uploadFile ? (
                      <p className="text-sm font-semibold text-gray-900">{uploadFile.name} <span className="text-xs text-gray-400 font-normal">· click to change</span></p>
                    ) : (
                      <p className="text-sm text-gray-500">Drop resume or <span className="text-teal-600 font-semibold">browse</span> · PDF, DOCX, TXT</p>
                    )}
                  </div>
                  {uploadFile && (
                    <button onClick={handleUploadAndCheck} disabled={isBusy}
                      className={`w-full py-2.5 rounded-xl font-bold text-sm text-white ${isBusy ? "bg-teal-400 cursor-not-allowed" : "bg-gradient-to-r from-sky-500 to-teal-500 hover:opacity-90 shadow-md shadow-teal-200"}`}>
                      {isBusy ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          {uploadLabel}
                        </span>
                      ) : "Upload & Check ATS Score"}
                    </button>
                  )}
                  {uploadError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs"><strong>Error:</strong> {uploadError}</div>}
                </div>
              )}

              {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm"><strong>Error:</strong> {error}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Score + sections grid */}
          <div className="grid sm:grid-cols-3 gap-4">

            <ScoreGauge score={result.overall_score} grade={result.grade} />

            {/* Section breakdown */}
            <div className="sm:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Section Breakdown</p>
              <div className="space-y-3">
                {Object.entries(result.sections).map(([key, sec]) => (
                  <div key={key}>
                    <div className="flex items-center gap-3 mb-1">
                      <StatusIcon status={sec.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-800">{SECTION_LABELS[key] ?? key}</span>
                          <span className={`text-xs font-bold ${
                            sec.score >= 80 ? "text-emerald-600" : sec.score >= 60 ? "text-blue-600" : "text-amber-600"
                          }`}>{sec.score}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                          <div className={`h-1.5 rounded-full ${sec.score >= 80 ? "bg-emerald-500" : sec.score >= 60 ? "bg-blue-500" : "bg-amber-500"}`}
                            style={{ width: `${sec.score}%` }} />
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 ml-9 leading-relaxed">{sec.feedback}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Keywords */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded bg-emerald-100 flex items-center justify-center">
                  <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Keywords Found</p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {result.keywords_found.map((kw) => (
                  <span key={kw} className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">{kw}</span>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded bg-red-100 flex items-center justify-center">
                  <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Add These Keywords</p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {result.keywords_missing.map((kw) => (
                  <span key={kw} className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">{kw}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Issues + Improvements */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Issues to Fix</p>
              <ul className="space-y-2">
                {result.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">{i + 1}</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">How to Improve</p>
              <ul className="space-y-2">
                {result.improvements.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">{i + 1}</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200/80">
            <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>AI content analysis</strong> — scores section completeness and keyword presence based on your resume text.
              This does not simulate how real ATS software (Taleo, Workday, iCIMS) parses file formatting, tables, or columns.
              For format testing, use tools like <span className="font-semibold">Jobscan</span> or <span className="font-semibold">Resume Worded</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
