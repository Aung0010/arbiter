import React, { useState } from 'react';
import { DebateRound, AgentRole, AgentResponse } from '../types';
import AgentBadge from './AgentBadge';
import ReactMarkdown from 'react-markdown';

interface DebateRoundViewProps {
  round: DebateRound;
  isLatest: boolean;
}

const DebateRoundView: React.FC<DebateRoundViewProps> = ({ round, isLatest }) => {
  const [isExpanded, setIsExpanded] = useState(isLatest);
  const [selectedResponse, setSelectedResponse] = useState<AgentResponse | null>(null);

  return (
    <>
    <div className="border border-base-divider rounded mb-4 overflow-hidden bg-base-DEFAULT shadow-sm transition-all duration-300">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-layer-white hover:bg-base-DEFAULT transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded flex items-center justify-center font-bold text-sm ${isLatest ? 'bg-brand-navy text-core-inverse' : 'bg-base-panel text-slate-custom'}`}>
            R{round.roundNumber}
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-brand-navy">Protocol Phase {round.roundNumber}</h3>
            <p className="text-xs text-slate-custom line-clamp-1">{round.summary || "Agent execution in progress..."}</p>
          </div>
        </div>
        <svg 
          className={`w-5 h-5 text-slate-400 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-4 border-t border-base-divider space-y-4">
            <div className="text-sm text-slate-custom mb-4 bg-base-panel p-3 rounded">
                <span className="font-medium text-brand-navy block mb-1">Execution Summary</span>
                {round.summary}
            </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {round.responses.map((response, idx) => (
              <div 
                 key={idx} 
                 onClick={() => setSelectedResponse(response)}
                 className="bg-base-panel border border-base-divider rounded p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative group"
              >
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                   <svg className="w-4 h-4 text-brand-azure" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                   </svg>
                </div>
                <div className="mb-3 border-b border-base-divider pb-2 pr-6">
                  <AgentBadge role={response.agentId} size="sm" />
                </div>
                <div className="text-sm text-slate-custom max-h-60 overflow-y-auto prose prose-sm prose-slate dark:prose-invert">
                  <ReactMarkdown>{response.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

      {selectedResponse && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-12">
          <div className="absolute inset-0 bg-base-DEFAULT/80 backdrop-blur-sm" onClick={() => setSelectedResponse(null)}></div>
          <div className="relative w-full max-w-5xl max-h-[90vh] bg-layer-white border border-base-divider rounded shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
            <div className="flex items-center justify-between p-4 border-b border-base-divider bg-base-panel">
               <AgentBadge role={selectedResponse.agentId} />
               <button onClick={() => setSelectedResponse(null)} className="p-1.5 rounded hover:bg-base-DEFAULT text-slate-custom hover:text-brand-navy dark:hover:text-white transition-colors">
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                 </svg>
               </button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto prose prose-slate prose-sm md:prose-base dark:prose-invert max-w-none text-slate-custom flex-1">
               <ReactMarkdown>{selectedResponse.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DebateRoundView;