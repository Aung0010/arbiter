import React, { useState } from 'react';
import { DebateRound, AgentResponse } from '../types';
import AgentBadge from './AgentBadge';
import ReactMarkdown from 'react-markdown';

interface DebateRoundViewProps {
  round: DebateRound;
  isLatest: boolean;
}

// Timeline pastel round number badges — AI-action signature
// Round 1 → Thinking peach · Round 2 → Grep mint · Round 3 → Read blue · 4+ → Edit lavender
const getRoundBadgeStyle = (roundNumber: number) => {
  const map: Record<number, string> = {
    1: 'bg-timeline-thinking text-ink',
    2: 'bg-timeline-grep text-ink',
    3: 'bg-timeline-read text-ink',
  };
  return map[roundNumber] ?? 'bg-timeline-edit text-ink';
};

const DebateRoundView: React.FC<DebateRoundViewProps> = ({ round, isLatest }) => {
  const [isExpanded, setIsExpanded] = useState(isLatest);
  const [selectedResponse, setSelectedResponse] = useState<AgentResponse | null>(null);

  return (
    <>
      {/* Round card */}
      <div className="border border-hairline rounded-lg mb-4 overflow-hidden bg-surface-card transition-all duration-300">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-4 bg-surface-card hover:bg-canvas-soft transition-colors"
        >
          <div className="flex items-center gap-3">
            {/* Round badge — timeline pastel by round number */}
            <div className={`w-8 h-8 rounded-pill flex items-center justify-center text-[11px] font-semibold tracking-[0.055em] uppercase ${getRoundBadgeStyle(round.roundNumber)}`}>
              R{round.roundNumber}
            </div>
            <div className="text-left">
              <h3 className="text-[16px] font-semibold text-ink leading-tight">
                Protocol Phase {round.roundNumber}
              </h3>
              <p className="text-[13px] text-muted line-clamp-1 font-mono mt-0.5">
                {round.summary || 'Agent execution in progress…'}
              </p>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-muted flex-shrink-0 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="border-t border-hairline">
            {/* Execution summary */}
            {round.summary && (
              <div className="px-4 py-3 bg-canvas-soft border-b border-hairline">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.055em] text-muted mb-1">
                  Execution Summary
                </span>
                <p className="text-[13px] text-body font-mono leading-relaxed">
                  {round.summary}
                </p>
              </div>
            )}

            {/* Response cards grid */}
            <div className="p-4">
              <div
                className={`grid grid-cols-1 gap-3 ${
                  round.responses.length <= 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'
                }`}
              >
                {round.responses.map((response, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedResponse(response)}
                    className="bg-canvas border border-hairline rounded-lg p-4 hover:border-hairline-strong transition-colors cursor-pointer relative group"
                  >
                    {/* Expand icon on hover */}
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    </div>

                    {/* Agent badge */}
                    <div className="mb-3 pb-2 border-b border-hairline pr-6">
                      <AgentBadge role={response.agentId} size="sm" />
                    </div>

                    {/* Content preview */}
                    <div className="text-[14px] text-body max-h-56 overflow-y-auto prose prose-sm leading-relaxed">
                      <ReactMarkdown>{response.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full-screen response modal */}
      {selectedResponse && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-12">
          <div
            className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            onClick={() => setSelectedResponse(null)}
          />
          <div className="relative w-full max-w-5xl max-h-[90vh] bg-surface-card border border-hairline rounded-lg flex flex-col overflow-hidden animate-fade-in-up">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline bg-canvas-soft">
              <AgentBadge role={selectedResponse.agentId} />
              <button
                onClick={() => setSelectedResponse(null)}
                className="p-1.5 rounded-md hover:bg-hairline text-muted hover:text-ink transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal content */}
            <div className="p-6 md:p-8 overflow-y-auto prose prose-sm md:prose-base max-w-none text-body flex-1 leading-relaxed">
              <ReactMarkdown>{selectedResponse.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DebateRoundView;