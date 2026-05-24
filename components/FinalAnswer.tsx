import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FinalConsensus } from '../types';

interface FinalAnswerProps {
  consensus: FinalConsensus;
  onRegenerate: () => void;
}

const FinalAnswer: React.FC<FinalAnswerProps> = ({ consensus, onRegenerate }) => {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  return (
    <div className="mt-8 mb-24 animate-fade-in-up">
      <div className="bg-layer-white border border-base-divider rounded shadow-sm overflow-hidden text-slate-custom">
        <div className="bg-base-panel p-4 border-b border-base-divider flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className="text-signal-green p-1">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 className="text-lg font-bold text-brand-navy">Terminal Protocol Reached</h2>
            </div>
            <span className="text-xs font-medium text-slate-custom uppercase tracking-wider flex items-center">
                <span className="text-signal-green mr-1.5">●</span>
                {consensus.participantSummary ??
                  `${consensus.participatingAgents.length} Models Verified`}
            </span>
        </div>
        
        <div className="p-6">
          <div className="prose prose-slate dark:prose-invert max-w-none text-slate-custom leading-relaxed text-sm">
            <ReactMarkdown>{consensus.answer}</ReactMarkdown>
          </div>
          
          <div className="mt-6 pt-6 border-t border-base-divider flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-custom bg-base-panel px-3 py-1.5 rounded inline-block">
              <span className="font-semibold text-brand-navy">Resolution Protocol:</span> {consensus.reasoning}
            </div>
            
            <div className="flex items-center gap-3">
               <button 
                onClick={onRegenerate}
                className="text-slate-custom hover:text-brand-azure text-sm flex items-center gap-1 transition-colors mr-2"
               >
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                 </svg>
                 Execute Again
               </button>
               
               <div className="h-4 w-px bg-base-divider mx-1"></div>

              <span className="text-xs text-slate-custom mr-2">Validate Output:</span>
              <button 
                onClick={() => setFeedback('up')}
                className={`p-1.5 rounded transition-colors border ${feedback === 'up' ? 'text-signal-green bg-layer-white border-signal-green' : 'text-slate-custom border-transparent hover:bg-base-panel'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
              </button>
              <button 
                onClick={() => setFeedback('down')}
                className={`p-1.5 rounded transition-colors border ${feedback === 'down' ? 'text-soft-red bg-layer-white border-soft-red' : 'text-slate-custom border-transparent hover:bg-base-panel'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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