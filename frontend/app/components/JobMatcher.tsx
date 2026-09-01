import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { API_BASE } from '../../lib/api';

interface MatchedResume {
  id: string;
  summary: string;
  match_score: number;
  metadata: any;
}

export default function JobMatcher() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [matchedResumes, setMatchedResumes] = useState<MatchedResume[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
        setError('');
      }
    },
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a job description file first.');
      return;
    }
    setLoading(true);
    setError('');
    setMatchedResumes([]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post(`${API_BASE}/upload-job-description`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setJobDescription(response.data.job_description);
      setMatchedResumes(response.data.matching_resumes);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Error processing job description.');
    } finally {
      setLoading(false);
    }
  };

  const handleTextInput = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!jobDescription.trim()) {
      setError('Please enter a job description.');
      return;
    }
    setLoading(true);
    setError('');
    setMatchedResumes([]);

    try {
      // Uses real vector search + LLM scoring via /match-job-description
      const response = await axios.post(`${API_BASE}/match-job-description`, {
        job_description: jobDescription,
        top_n: 10,
      });
      setMatchedResumes(response.data.matching_resumes);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Error matching job description.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-xl font-semibold mb-4">Match Job Description to Resumes</h2>

      {/* File upload */}
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2">Upload Job Description</h3>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed p-6 rounded-lg text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center">
            <svg
              className="w-10 h-10 text-gray-400 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            {file ? (
              <p className="text-sm font-medium text-gray-900">{file.name}</p>
            ) : (
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Drop job description file here, or{' '}
                  <span className="text-blue-500">browse</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">Supports PDF, DOCX, and TXT files</p>
              </div>
            )}
          </div>
        </div>
        {file && (
          <div className="mt-3 flex justify-center">
            <button
              onClick={handleUpload}
              disabled={loading}
              className={`px-4 py-2 rounded-md text-white font-medium ${
                loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
              } transition-colors`}
            >
              {loading ? 'Processing…' : 'Upload & Find Matches'}
            </button>
          </div>
        )}
      </div>

      {/* Text input */}
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2">Or Enter Job Description Text</h3>
        <form onSubmit={handleTextInput}>
          <textarea
            className="w-full p-3 border rounded-md h-40"
            placeholder="Paste job description here…"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
          <div className="mt-3 flex justify-center">
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 rounded-md text-white font-medium ${
                loading ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'
              } transition-colors`}
            >
              {loading ? 'Finding Matches…' : 'Find Matching Resumes'}
            </button>
          </div>
        </form>
      </div>

      {error && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md">{error}</div>}

      {/* Results */}
      {matchedResumes.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">
            Matching Resumes ({matchedResumes.length})
          </h3>
          <div className="space-y-4">
            {matchedResumes.map((resume) => (
              <div key={resume.id} className="border rounded-md overflow-hidden">
                <div className="flex justify-between items-center p-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate" title={resume.id}>
                      {resume.id}
                    </h4>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                      {resume.summary.split('\n')[0]}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        resume.match_score >= 0.7
                          ? 'bg-green-100 text-green-800'
                          : resume.match_score >= 0.4
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {(resume.match_score * 100).toFixed(0)}% match
                    </span>
                    <button
                      className="text-sm text-blue-600 hover:text-blue-800"
                      onClick={() =>
                        setExpandedId(expandedId === resume.id ? null : resume.id)
                      }
                    >
                      {expandedId === resume.id ? 'Hide' : 'View'}
                    </button>
                  </div>
                </div>

                {expandedId === resume.id && (
                  <div className="border-t bg-gray-50 p-4">
                    <p className="text-sm whitespace-pre-line">{resume.summary}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && matchedResumes.length === 0 && jobDescription && (
        <p className="mt-4 text-sm text-gray-500 text-center">
          No matching resumes found. Upload some resumes first.
        </p>
      )}
    </div>
  );
}
