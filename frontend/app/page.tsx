"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE } from "../lib/api";

import FindJobs, { FindJobsResult } from "./components/FindJobs";
import ATSChecker, { ATSResult } from "./components/ATSChecker";
import Resources from "./components/Resources";

interface ProviderInfo {
  provider: string;
  display_name: string;
  model: string;
  free_tier: boolean;
}

interface ResourceResult {
  role: string;
  preparation_time: string;
  sections: {
    title: string;
    resources: { name: string; description: string; url: string; type: string }[];
  }[];
}

type View = "find-jobs" | "ats-checker" | "resources";

export default function Home() {
  const [view, setView]                 = useState<View>("find-jobs");
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null);

  const [findJobsResult, setFindJobsResult] = useState<FindJobsResult | null>(null);
  const [atsResult, setAtsResult]           = useState<ATSResult | null>(null);
  const [resourceRole, setResourceRole]     = useState("");
  const [resourceSkills, setResourceSkills] = useState("");
  const [resourceResult, setResourceResult] = useState<ResourceResult | null>(null);

  useEffect(() => {
    axios.get(`${API_BASE}/provider-info`).then((r: any) => setProviderInfo(r.data)).catch(() => {});
  }, []);

  const handlePrepForRole = (roleTitle: string) => {
    setResourceRole(roleTitle);
    setResourceResult(null);
    setView("resources");
  };

  return (
    <div className="min-h-screen" style={{ background: "#f0f7fa" }}>
      {/* Sticky header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-teal-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-900">AI Resume Toolkit</span>
          </div>
          {providerInfo && (
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {providerInfo.free_tier ? "Free" : "Paid"} · {providerInfo.model}
            </div>
          )}
        </div>
      </header>

      {/* Hero banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <p className="text-sky-400 text-xs font-bold uppercase tracking-widest mb-2">AI-Powered</p>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-2 leading-tight">
            Resume Toolkit
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm">
            Score ATS compatibility · Find matching jobs · Prepare for interviews
          </p>
        </div>
      </div>

      {/* Tab nav — floats up from hero */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200/80 grid grid-cols-3 gap-1 p-1.5 -mt-5 relative z-10">
          {([
            {
              id: "find-jobs" as View,
              label: "Find Jobs",
              sub: "Live openings · direct apply",
              icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              ),
            },
            {
              id: "ats-checker" as View,
              label: "ATS Score",
              sub: "Resume compatibility check",
              icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              ),
            },
            {
              id: "resources" as View,
              label: "Interview Prep",
              sub: "Curated guides for your role",
              icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                </svg>
              ),
            },
          ] as const).map((tab) => {
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3 px-2 sm:px-4 py-2.5 sm:py-3 rounded-xl text-center sm:text-left transition-all duration-200 ${
                  active
                    ? "bg-gradient-to-r from-sky-500 to-teal-500 shadow-md shadow-sky-200/60"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  active ? "bg-white/20" : "bg-gray-100"
                }`}>
                  <span className={active ? "text-white" : "text-gray-500"}>{tab.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className={`block text-xs sm:text-sm font-semibold leading-tight ${active ? "text-white" : "text-gray-700"}`}>
                    {tab.label}
                  </span>
                  <span className={`hidden sm:block text-xs truncate mt-0.5 ${active ? "text-sky-100" : "text-gray-400"}`}>
                    {tab.sub}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {view === "find-jobs" && (
          <FindJobs
            result={findJobsResult}
            onResultChange={setFindJobsResult}
            onPrepForRole={handlePrepForRole}
          />
        )}
        {view === "ats-checker" && (
          <ATSChecker result={atsResult} onResultChange={setAtsResult} />
        )}
        {view === "resources" && (
          <Resources
            role={resourceRole}
            skills={resourceSkills}
            result={resourceResult}
            onRoleChange={setResourceRole}
            onSkillsChange={setResourceSkills}
            onResultChange={setResourceResult}
          />
        )}
      </main>
    </div>
  );
}
