import { useState, useEffect } from 'react';
import axios from 'axios';
import JobDescriptionForm from './JobDescriptionForm';
import ResumeQuestions from './ResumeQuestions';

import { API_BASE } from '../../lib/api';
const API_URL = API_BASE;

interface Resume {
  id: string;
  summary: string;
  metadata: any;
}

interface ResumeManagerProps {
  onSelectResumes?: (ids: string[]) => void;
}

export default function ResumeManager({ onSelectResumes }: ResumeManagerProps) {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [comparison, setComparison] = useState('');
  const [comparing, setComparing] = useState(false);
  const [expandedResume, setExpandedResume] = useState<string | null>(null);

  useEffect(() => {
    fetchResumes();
  }, []);

  // Update parent component when selections change
  useEffect(() => {
    if (onSelectResumes) {
      onSelectResumes(selectedResumes);
    }
  }, [selectedResumes, onSelectResumes]);

  const fetchResumes = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/resumes`);
      setResumes(response.data.resumes);
    } catch (err: any) {
      setError('Failed to load resumes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleResumeSelection = (id: string) => {
    if (selectedResumes.includes(id)) {
      setSelectedResumes(selectedResumes.filter(rid => rid !== id));
    } else {
      setSelectedResumes([...selectedResumes, id]);
    }
  };

  const compareResumes = async () => {
    if (selectedResumes.length < 2) {
      setError('Select at least 2 resumes to compare');
      return;
    }
    
    setComparing(true);
    setError('');
    
    try {
      const response = await axios.post(`${API_URL}/compare`, {
        resume_ids: selectedResumes
      });
      setComparison(response.data.comparison);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error comparing resumes');
    } finally {
      setComparing(false);
    }
  };

  const toggleExpandResume = (id: string) => {
    if (expandedResume === id) {
      setExpandedResume(null);
    } else {
      setExpandedResume(id);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Resume Database</h1>
      
      {loading && <p>Loading resumes...</p>}
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md">
          {error}
        </div>
      )}
      
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Stored Resumes</h2>
        {resumes.length === 0 ? (
          <p className="text-gray-500">No resumes stored yet. Upload some first!</p>
        ) : (
          <div className="grid gap-4">
            {resumes.map(resume => (
              <div 
                key={resume.id} 
                className={`border p-4 rounded-md ${
                  selectedResumes.includes(resume.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center mb-2">
                  <input 
                    type="checkbox"
                    checked={selectedResumes.includes(resume.id)}
                    onChange={() => toggleResumeSelection(resume.id)}
                    className="mr-3 h-5 w-5"
                  />
                  <div className="flex-1">
                    <h3 className="font-medium">Resume ID: {resume.id}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {resume.summary.split('\n')[0]}...
                    </p>
                  </div>
                  <button 
                    onClick={() => toggleExpandResume(resume.id)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    {expandedResume === resume.id ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                
                {expandedResume === resume.id && (
                  <div className="mt-3 pl-8">
                    <div className="bg-gray-50 p-3 rounded-md">
                      <h4 className="font-medium text-sm mb-2">Full Summary:</h4>
                      <p className="text-sm whitespace-pre-line">{resume.summary}</p>
                    </div>
                    
                    {/* Add ResumeQuestions component here */}
                    <ResumeQuestions resumeId={resume.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {resumes.length > 0 && (
        <div className="flex justify-end mb-6">
          <button
            onClick={compareResumes}
            disabled={selectedResumes.length < 2 || comparing}
            className={`px-4 py-2 rounded-md text-white font-medium ${
              selectedResumes.length < 2 || comparing 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-700'
            } transition-colors`}
          >
            {comparing ? 'Comparing...' : 'Compare Selected Resumes'}
          </button>
        </div>
      )}
      
      {comparison && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-xl font-semibold mb-4">Resume Comparison</h2>
          <div className="prose max-w-none">
            <pre className="whitespace-pre-wrap bg-gray-50 p-4 rounded-md">{comparison}</pre>
          </div>
        </div>
      )}
      
      {selectedResumes.length > 0 && (
        <JobDescriptionForm resumeIds={selectedResumes} />
      )}
    </div>
  );
}