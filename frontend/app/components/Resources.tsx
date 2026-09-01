"use client";

import { useState } from "react";
import axios from "axios";
import { API_BASE } from "../../lib/api";

interface Resource {
  name: string;
  description: string;
  url: string;
  type: "docs" | "course" | "video" | "practice" | "community" | string;
}

interface Section {
  title: string;
  resources: Resource[];
}

export interface ResourceResult {
  role: string;
  preparation_time: string;
  sections: Section[];
}

interface Props {
  role: string;
  skills: string;
  result: ResourceResult | null;
  onRoleChange: (v: string) => void;
  onSkillsChange: (v: string) => void;
  onResultChange: (v: ResourceResult | null) => void;
}

const TYPE_STYLES: Record<string, string> = {
  docs:      "bg-blue-50   text-blue-700   border-blue-200",
  course:    "bg-purple-50 text-purple-700 border-purple-200",
  video:     "bg-red-50    text-red-700    border-red-200",
  practice:  "bg-amber-50  text-amber-700  border-amber-200",
  community: "bg-teal-50   text-teal-700   border-teal-200",
};

const SECTION_COLORS = [
  "from-sky-500 to-teal-500",
  "from-teal-500 to-emerald-500",
  "from-amber-500 to-orange-500",
  "from-blue-500 to-sky-500",
];

function ExternalLinkIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

export default function Resources({ role, skills, result, onRoleChange, onSkillsChange, onResultChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!role.trim()) { setError("Please enter a Job Role to generate the prep guide."); return; }
    setLoading(true);
    setError("");
    onResultChange(null);
    try {
      const r = await axios.post(`${API_BASE}/interview-resources`, {
        role: role.trim(),
        skills: skills.trim(),
      });
      onResultChange(r.data);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Error generating resources. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Input card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-white">Interview Prep</p>
            <p className="text-xs text-slate-400">Curated resources tailored to your target role</p>
          </div>
        </div>

        <div className="p-6 space-y-4 bg-[#f7fcfe]">
          <p className="text-sm text-gray-500">
            Enter a role to get a curated prep guide — or click <strong className="text-gray-700">Prep for this role →</strong> on any job match card to auto-fill.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Job Role *</label>
            <input
              type="text"
              value={role}
              onChange={(e) => onRoleChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              placeholder="e.g. Senior DevOps Engineer, ML Engineer, Backend Engineer"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Current Skills <span className="text-gray-400 font-normal">(optional — personalizes the guide)</span>
            </label>
            <input
              type="text"
              value={skills}
              onChange={(e) => onSkillsChange(e.target.value)}
              placeholder="e.g. Kubernetes, AWS, Python, Terraform"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className={`w-full py-3 rounded-xl font-bold text-sm text-white transition-all bg-gradient-to-r from-sky-500 to-teal-500 shadow-md shadow-teal-200 ${
              loading ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Building your prep guide…
              </span>
            ) : (
              "Generate Prep Guide"
            )}
          </button>
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
            <p className="text-xs uppercase tracking-wide text-slate-400 mb-1 font-medium">Preparation guide for</p>
            <h3 className="text-lg font-semibold">{result.role}</h3>
            <p className="text-sm text-slate-400 mt-1">Estimated preparation time: {result.preparation_time}</p>
          </div>

          {result.sections?.map((section, si) => (
            <div key={si} className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
              <div className={`bg-gradient-to-r ${SECTION_COLORS[si % SECTION_COLORS.length]} px-5 py-3`}>
                <h3 className="text-sm font-semibold text-white">{section.title}</h3>
              </div>

              <div className="divide-y divide-gray-100">
                {section.resources?.map((resource, ri) => (
                  <a
                    key={ri}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50/80 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                          {resource.name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                          TYPE_STYLES[resource.type] ?? "bg-gray-50 text-gray-600 border-gray-200"
                        }`}>
                          {resource.type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{resource.description}</p>
                      <p className="text-xs text-gray-400 mt-1 truncate">{resource.url}</p>
                    </div>
                    <span className="text-gray-400 group-hover:text-blue-500 transition-colors mt-0.5">
                      <ExternalLinkIcon />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
