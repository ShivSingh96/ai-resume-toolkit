import { useState } from 'react';
import axios from 'axios';

import { API_BASE } from '../../lib/api';
const API_URL = API_BASE;

interface ResumeQuestionsProps {
  resumeId: string;
}

export default function ResumeQuestions({ resumeId }: ResumeQuestionsProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [showQuestions, setShowQuestions] = useState<boolean>(false);

  const generateQuestions = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.get(`${API_URL}/generate-questions/${resumeId}`);
      setQuestions(response.data.questions);
      setShowQuestions(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate questions. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4">
      {!showQuestions ? (
        <button
          onClick={generateQuestions}
          disabled={loading}
          className={`text-sm px-3 py-1 rounded-md text-white font-medium ${
            loading ? 'bg-gray-400' : 'bg-gray-600 hover:bg-gray-700'
          } transition-colors`}
        >
          {loading ? 'Generating...' : 'Generate Follow-up Questions'}
        </button>
      ) : (
        <div className="mt-2">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-medium">Follow-up Questions:</h4>
            <button
              onClick={() => setShowQuestions(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Hide
            </button>
          </div>
          
          <ul className="text-sm space-y-2 bg-gray-50 p-3 rounded-md">
            {questions.map((question, index) => (
              <li key={index} className="flex items-start">
                <span className="font-medium mr-2">Q{index + 1}:</span>
                <span>{question}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {error && (
        <div className="mt-2 p-2 bg-red-50 text-red-700 text-sm rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}