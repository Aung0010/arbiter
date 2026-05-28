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
      <div className="bg-surface-card border border-hairline rounded-lg overflow-hidden">

        {/* Header band */}
        <div className="bg-canvas-soft px-5 py-4 border-b border-hairline flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Checkmark icon */}
            <div className="text-semantic-success">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            {/* display-sm: 22px / 400 / -0.11px tracking */}
            <h2 className="text-[22px] font-normal text-ink leading-tight tracking-[-0.005em]">
              Terminal Protocol Reached
            </h2>
          </div>

          {/* Status badge — timeline-done gold pill */}
          <span className="inline-flex items-center gap-1.5 bg-timeline-done text-on-primary text-[11px] font-semibold uppercase tracking-[0.055em] rounded-pill px-3 py-1">
            <span>●</span>
            {consensus.participantSummary ??
              `${consensus.participatingAgents.length} Models Verified`}
          </span>
        </div>

        {/* Answer body */}
        <div className="p-6">
          <div className="prose prose-sm md:prose-base max-w-none text-body leading-relaxed">
            <ReactMarkdown>{consensus.answer}</ReactMarkdown>
          </div>

          {/* Footer row */}
          <div className="mt-6 pt-5 border-t border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4">

            {/* Resolution protocol badge */}
            <div className="inline-flex items-start gap-2 bg-surface-strong rounded-pill px-3 py-1.5 text-[13px] text-body max-w-prose">
              <span className="text-[11px] font-semibold uppercase tracking-[0.055em] text-muted whitespace-nowrap mt-0.5">
                Resolution:
              </span>
              <span className="leading-snug">{consensus.reasoning}</span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Execute Again — tertiary text link */}
              <button
                onClick={onRegenerate}
                className="text-[14px] font-medium text-muted hover:text-ink flex items-center gap-1.5 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Execute Again
              </button>

              <div className="h-4 w-px bg-hairline" />

              <span className="text-[11px] font-semibold uppercase tracking-[0.055em] text-muted">
                Validate
              </span>

              {/* Thumbs up */}
              <button
                onClick={() => setFeedback('up')}
                className={`p-1.5 rounded-md transition-colors border ${
                  feedback === 'up'
                    ? 'text-semantic-success bg-surface-card border-semantic-success'
                    : 'text-muted border-hairline hover:border-hairline-strong hover:text-body'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
              </button>

              {/* Thumbs down */}
              <button
                onClick={() => setFeedback('down')}
                className={`p-1.5 rounded-md transition-colors border ${
                  feedback === 'down'
                    ? 'text-semantic-error bg-surface-card border-semantic-error'
                    : 'text-muted border-hairline hover:border-hairline-strong hover:text-body'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
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