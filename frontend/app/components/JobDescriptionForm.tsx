import { useState } from 'react';
import axios from 'axios';

import { API_BASE } from '../../lib/api';
const API_URL = API_BASE;

interface JobDescriptionFormProps {
  resumeIds: string[];
}

export default function JobDescriptionForm({ resumeIds }: JobDescriptionFormProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<any>(null);
  const [mode, setMode] = useState<'gaps' | 'rank'>('rank');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!jobDescription.trim()) {
      setError('Please enter a job description');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      let response;
      
      if (mode === 'gaps' && resumeIds.length === 1) {
        response = await axios.post(`${API_URL}/identify-gaps`, {
          job_description: jobDescription,
          resume_ids: resumeIds
        });
        setResults(response.data.gap_analysis);
      } else if (mode === 'rank' && resumeIds.length >= 2) {
        response = await axios.post(`${API_URL}/rank-candidates`, {
          job_description: jobDescription,
          resume_ids: resumeIds
        });
        setResults(response.data.ranking);
      } else {
        setError('Invalid operation for the current selection');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error processing request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-xl font-semibold mb-4">
        {resumeIds.length === 1 ? 'Analyze Skill Gaps' : 'Rank Candidates'}
      </h2>
      
      {resumeIds.length === 1 && (
        <div className="mb-4">
          <p className="text-sm text-gray-600">
            Analyzing skill gaps for candidate ID: {resumeIds[0]}
          </p>
        </div>
      )}
      
      {resumeIds.length >= 2 && (
        <div className="mb-4">
          <p className="text-sm text-gray-600">
            Ranking {resumeIds.length} candidates for job fit
          </p>
          <div className="mt-2">
            <select
              className="border rounded p-2 w-full"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'gaps' | 'rank')}
            >
              <option value="rank">Rank Candidates</option>
            </select>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Job Description
          </label>
          <textarea
            className="w-full p-3 border rounded-md"
            rows={8}
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste job description here..."
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className={`px-4 py-2 rounded-md text-white font-medium ${
            loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
          } transition-colors`}
        >
          {loading ? 'Processing...' : mode === 'gaps' ? 'Identify Gaps' : 'Rank Candidates'}
        </button>
      </form>
      
      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md">
          {error}
        </div>
      )}
      
      {results && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">Results</h3>
          <div className="bg-gray-50 p-4 rounded-md prose max-w-none">
            <pre className="whitespace-pre-wrap">{results}</pre>
          </div>
        </div>
      )}
    </div>
  );
}