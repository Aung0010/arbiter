import React, { useState } from 'react';
import { FinalConsensus } from '../types';

interface FinalAnswerProps {
  consensus: FinalConsensus;
  onRegenerate: () => void;
}

const FinalAnswer: React.FC<FinalAnswerProps> = ({ consensus, onRegenerate }) => {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  return (
    <div className="mt-8 mb-24 animate-fade-in-up">
      <div className="bg-white border border-indigo-100 rounded-xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-4 border-b border-indigo-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className="bg-indigo-600 text-white p-1.5 rounded-md">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 className="text-lg font-bold text-indigo-900">Final Consensus</h2>
            </div>
            <span className="text-xs font-medium text-indigo-400 uppercase tracking-wider">
                {consensus.participatingAgents.length} Agents Agreed
            </span>
        </div>
        
        <div className="p-6">
          <div className="prose prose-slate max-w-none text-slate-800 leading-relaxed">
            {consensus.answer.split('\n').map((paragraph, idx) => (
                <p key={idx} className="mb-4">{paragraph}</p>
            ))}
          </div>
          
          <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">Method:</span> {consensus.reasoning}
            </div>
            
            <div className="flex items-center gap-3">
               <button 
                onClick={onRegenerate}
                className="text-slate-500 hover:text-indigo-600 text-sm flex items-center gap-1 transition-colors mr-2"
               >
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                 </svg>
                 Regenerate
               </button>
               
               <div className="h-4 w-px bg-slate-200 mx-1"></div>

              <span className="text-xs text-slate-400 mr-2">Was this helpful?</span>
              <button 
                onClick={() => setFeedback('up')}
                className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${feedback === 'up' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400'}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
              </button>
              <button 
                onClick={() => setFeedback('down')}
                className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${feedback === 'down' ? 'text-red-600 bg-red-50' : 'text-slate-400'}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinalAnswer;