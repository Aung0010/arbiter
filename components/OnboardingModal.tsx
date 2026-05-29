import React, { useState } from 'react';

interface OnboardingModalProps {
  onComplete: () => void;
}

const steps = [
  {
    id: 'welcome',
    tag: 'Welcome to Arbiter',
    headline: 'AI that argues its way to the truth.',
    body: 'Arbiter is a multi-agent debate system. Instead of trusting a single AI answer, it pits specialised large language models against each other in a structured debate, then passes the result to an impartial judge for a final, verified answer.',
    visual: (
      <div className="flex items-center justify-center gap-4 py-6">
        {[
          { label: 'Expert A', bg: '#b9b9f9', text: '#0d253d', icon: '⬡' },
          { label: 'Expert B', bg: '#9fbbe0', text: '#0d253d', icon: '⚡' },
        ].map((m) => (
          <div key={m.label} className="flex flex-col items-center gap-2">
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center text-2xl"
              style={{ background: m.bg + '33', border: `1px solid ${m.bg}` }}
            >
              {m.icon}
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.055em] text-muted">{m.label}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-px bg-hairline mx-1" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-14 h-14 rounded-lg flex items-center justify-center text-2xl"
            style={{ background: '#1c1e5433', border: '1px solid #1c1e54' }}
          >
            ⚖️
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.055em] text-muted">Judge</span>
        </div>
      </div>
    ),
  },
  {
    id: 'why',
    tag: 'The Problem',
    headline: 'Single models have blind spots.',
    body: 'Every LLM carries inherent biases and gaps. A single model confidently giving one answer has no mechanism to self-correct. Arbiter solves this by making models challenge each other, surfacing weaknesses, sharpening reasoning, and producing more trustworthy outputs.',
    visual: (
      <div className="grid grid-cols-2 gap-2.5 py-4">
        {[
          { label: 'Hallucination', icon: '🌀', desc: 'Confident but wrong' },
          { label: 'Bias', icon: '📐', desc: 'Skewed perspective' },
          { label: 'No self-check', icon: '🔇', desc: 'No adversarial review' },
          { label: 'Fixed answer', icon: '🔒', desc: 'No iteration' },
        ].map((item) => (
          <div key={item.label} className="bg-canvas border border-hairline rounded-md p-3 flex items-start gap-2">
            <span className="text-lg flex-shrink-0">{item.icon}</span>
            <div>
              <div className="text-[13px] font-semibold text-ink">{item.label}</div>
              <div className="text-[12px] text-body">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'models',
    tag: 'The Models',
    headline: 'Three specialised AI agents.',
    body: 'Arbiter uses two expert debaters and one impartial judge, each a distinct open-source LLM running locally via Ollama — no data leaves your machine.',
    visual: (
      <div className="flex flex-col gap-2.5 py-4">
        {[
          { name: 'Gemma 3', role: 'Expert A · Logical analysis', bg: '#b9b9f9', icon: '⬡' },
          { name: 'Mistral', role: 'Expert B · Critical reasoning', bg: '#9fbbe0', icon: '⚡' },
          { name: 'Qwen 2.5 / GPT-OSS', role: 'Judge · Final arbitration', bg: '#1c1e54', icon: '⚖️' },
        ].map((m) => (
          <div key={m.name} className="flex items-center gap-3 bg-canvas border border-hairline rounded-md px-4 py-3">
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: m.bg + '22', border: `1px solid ${m.bg}66` }}
            >
              {m.icon}
            </div>
            <div>
              <div className="text-[14px] font-semibold text-ink">{m.name}</div>
              <div className="text-[12px] text-body">{m.role}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'debate',
    tag: 'The Debate Structure',
    headline: 'A structured multi-round protocol.',
    body: 'Each query triggers a debate. Both experts independently answer first. Then, for up to 3 rounds, each model reads the other\'s latest response and either challenges it or updates its own view. Early exit fires the moment both positions converge.',
    visual: (
      <div className="py-4 space-y-2">
        {[
          { round: 'Round 0', desc: 'Both experts answer independently in parallel', active: true },
          { round: 'Round 1–3', desc: 'Experts debate: read, critique, and update', active: false },
          { round: 'Consensus check', desc: 'After each turn — early exit if views align', active: false },
          { round: 'Judge', desc: 'Final layer reads all rounds and issues verdict', active: false },
        ].map((r, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-6 h-6 rounded-pill flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                style={{
                  background: r.active ? 'var(--c-ink)' : 'var(--c-hairline-strong)',
                  color: r.active ? 'var(--c-on-primary)' : 'var(--c-muted)',
                }}
              >
                {i + 1}
              </div>
              {i < 3 && <div className="w-px h-4 bg-hairline mt-1" />}
            </div>
            <div className="pb-1">
              <div className="text-[13px] font-semibold text-ink">{r.round}</div>
              <div className="text-[12px] text-body">{r.desc}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'judge',
    tag: 'The Judge Layer',
    headline: 'An impartial third model has the final say.',
    body: 'After debate, the judge reviews both experts\' initial and final answers, the debate outcome, and all reasoning. It can confirm consensus, break ties, or override a weak conclusion — producing a single verified answer with a confidence score and decision rationale.',
    visual: (
      <div className="py-4 space-y-3">
        <div className="bg-canvas border border-hairline rounded-md p-3 text-[13px] text-body font-mono">
          <span className="font-semibold text-ink not-italic block mb-1">Judge reads:</span>
          Expert A initial → Expert B initial → Debate rounds → Consensus status
        </div>
        <div className="flex gap-2">
          {[
            { label: 'Confirm consensus', color: '#1f8a65' },
            { label: 'Break a tie', color: '#c08532' },
            { label: 'Override weak reasoning', color: '#cf2d56' },
          ].map((o) => (
            <div
              key={o.label}
              className="flex-1 rounded-md p-2 text-center text-[11px] font-semibold uppercase tracking-[0.055em]"
              style={{ background: o.color + '15', border: `1px solid ${o.color}44`, color: o.color }}
            >
              {o.label}
            </div>
          ))}
        </div>
        <div className="bg-surface-card border border-hairline rounded-md p-3 flex items-center gap-2">
          <span className="text-semantic-success text-base">✓</span>
          <span className="text-[13px] font-semibold text-ink">Terminal Protocol Reached</span>
          <span className="ml-auto text-[11px] uppercase tracking-[0.055em] font-semibold text-muted">Verified</span>
        </div>
      </div>
    ),
  },
  {
    id: 'use',
    tag: 'Get Started',
    headline: 'What can you ask?',
    body: 'Arbiter excels at questions where nuance, tradeoffs, or multiple valid perspectives exist. Type any query in the console below to start a debate.',
    visual: (
      <div className="grid grid-cols-1 gap-2.5 py-4">
        {[
          { title: 'Compare Frameworks', example: '"Compare Python vs Go for a high-throughput backend."' },
          { title: 'Risk Assessment', example: '"What are the risks of adopting microservices for a startup?"' },
          { title: 'Clinical / Technical', example: '"What is the first-line treatment for Type 2 diabetes?"' },
          { title: 'Abstract Concepts', example: '"Explain quantum entanglement simply."' },
        ].map((q) => (
          <div key={q.title} className="bg-canvas border border-hairline rounded-md px-4 py-3">
            <div className="text-[13px] font-semibold text-ink mb-0.5">{q.title}</div>
            <div className="text-[13px] text-body italic font-mono">{q.example}</div>
          </div>
        ))}
      </div>
    ),
  },
];

const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-canvas/90 backdrop-blur-sm" />

      {/* Modal — surface-card, hairline border, rounded-lg */}
      <div className="relative w-full max-w-lg bg-surface-card border border-hairline rounded-lg flex flex-col overflow-hidden animate-fade-in-up shadow-none">

        {/* Header bar */}
        <div className="bg-canvas-soft border-b border-hairline px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-ink rounded-xs flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="text-[14px] font-medium text-ink">Arbiter Console</span>
          </div>
          <button
            onClick={onComplete}
            className="text-[13px] text-muted hover:text-ink transition-colors"
          >
            Skip tour
          </button>
        </div>

        {/* Step indicator dots */}
        <div className="px-5 pt-5 flex items-center gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className="h-1.5 rounded-pill transition-all duration-300"
              style={{
                width: i === step ? 24 : 8,
                background: i === step ? 'var(--c-ink)' : 'var(--c-hairline-strong)',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-5 pt-4 pb-2 flex-1 overflow-y-auto max-h-[60vh]">
          {/* caption-uppercase tag */}
          <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.055em] text-muted mb-3">
            {current.tag}
          </span>
          {/* display-md: 26px / 400 / -0.325px tracking */}
          <h2 className="text-[26px] font-normal text-ink leading-[1.25] tracking-[-0.0125em] mb-3">
            {current.headline}
          </h2>
          {/* body-md */}
          <p className="text-[16px] text-body leading-[1.5]">
            {current.body}
          </p>
          {current.visual}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-hairline flex items-center justify-between bg-canvas-soft">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-[14px] font-medium text-body hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <span className="text-[13px] text-muted">{step + 1} / {steps.length}</span>

          {/* button-primary: Cursor Orange */}
          <button
            onClick={() => isLast ? onComplete() : setStep(s => s + 1)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-active text-on-primary text-[14px] font-medium rounded-md transition-colors"
          >
            {isLast ? 'Launch Console' : 'Next'}
            {!isLast && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            )}
            {isLast && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;