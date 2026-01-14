import React, { useState } from 'react';
import { DebateRound, AgentRole } from '../types';
import AgentBadge from './AgentBadge';
import ReactMarkdown from 'react-markdown'; // Assuming we had this, but for this exercise we'll output raw text or simple formatting

interface DebateRoundViewProps {
  round: DebateRound;
  isLatest: boolean;
}

const DebateRoundView: React.FC<DebateRoundViewProps> = ({ round, isLatest }) => {
  const [isExpanded, setIsExpanded] = useState(isLatest);

  return (
    <div className="border border-slate-200 rounded-lg mb-4 overflow-hidden bg-white shadow-sm transition-all duration-300">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${isLatest ? 'bg-indigo-600 text-white' : 'bg-slate-300 text-slate-600'}`}>
            R{round.roundNumber}
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-slate-800">Debate Round {round.roundNumber}</h3>
            <p className="text-xs text-slate-500 line-clamp-1">{round.summary || "Agents generating..."}</p>
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
        <div className="p-4 border-t border-slate-100 space-y-4">
            <div className="text-sm text-slate-500 italic mb-4 bg-slate-50 p-2 rounded">
                Round Summary: {round.summary}
            </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {round.responses.map((response, idx) => (
              <div key={idx} className="bg-white border border-slate-100 rounded-md p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-2">
                  <AgentBadge role={response.agentId} size="sm" />
                </div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar">
                  {response.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DebateRoundView;