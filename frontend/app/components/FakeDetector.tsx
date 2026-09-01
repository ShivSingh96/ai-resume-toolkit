import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

import { API_BASE } from '../../lib/api';
const API_URL = API_BASE;

interface DetectionResult {
  is_suspicious: boolean;
  confidence_score: number;
  reasons: string[];
  red_flags: string[];
}

export default function FakeDetector() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [result, setResult] = useState<DetectionResult | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
        setError('');
        setResult(null);
      }
    },
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxFiles: 1
  });

  const handleSubmit = async () => {
    if (!file) {
      setError('Please select a resume file first.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API_URL}/detect-fake-resume`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error analyzing resume. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-xl font-semibold mb-4">Fake Resume Detector</h2>
      <p className="text-gray-600 mb-4">
        Upload a resume to check if it might be AI-generated or contains suspicious content.
      </p>

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
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>

          {file ? (
            <p className="text-sm font-medium text-gray-900">{file.name}</p>
          ) : (
            <div>
              <p className="text-sm font-medium text-gray-900">
                Drop resume here, or <span className="text-blue-500">browse</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Supports PDF, DOCX, and TXT files
              </p>
            </div>
          )}
        </div>
      </div>

      {file && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`px-4 py-2 rounded-md text-white font-medium ${
              loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
            } transition-colors`}
          >
            {loading ? 'Analyzing...' : 'Analyze Resume'}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">Analysis Results</h3>
          
          <div className={`p-4 rounded-md ${
            result.is_suspicious 
              ? 'bg-red-50 border border-red-200' 
              : 'bg-green-50 border border-green-200'
          }`}>
            <div className="flex items-center mb-3">
              {result.is_suspicious ? (
                <svg className="w-6 h-6 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              )}
              <h4 className="text-lg font-semibold">
                {result.is_suspicious 
                  ? 'Potentially Suspicious Resume' 
                  : 'Resume Appears Legitimate'}
              </h4>
            </div>
            
            <div className="mb-3">
              <div className="bg-gray-200 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${
                    result.confidence_score > 75 ? 'bg-red-500' : 
                    result.confidence_score > 50 ? 'bg-yellow-500' : 
                    'bg-green-500'
                  }`}
                  style={{width: `${result.confidence_score}%`}}
                ></div>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Confidence Score: {result.confidence_score}%
              </p>
            </div>
            
            {result.is_suspicious && (
              <>
                <div className="mb-3">
                  <h5 className="font-medium mb-1">Reasons for Suspicion:</h5>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {result.reasons.map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                </div>
                
                {result.red_flags.length > 0 && (
                  <div>
                    <h5 className="font-medium mb-1">Red Flags in Text:</h5>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {result.red_flags.map((flag, index) => (
                        <li key={index}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}