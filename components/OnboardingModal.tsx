import React, { useState } from 'react';

interface OnboardingModalProps {
  onComplete: () => void;
}

const steps = [
  {
    id: 'welcome',
    tag: 'Welcome to Arbiter',
    headline: 'AI that argues its way to the truth.',
    body: 'Arbiter is a multi-agent debate system. Instead of trusting a single AI answer, it pits specialised large language models against each other in a structured debate — then passes the result to an impartial judge for a final, verified answer.',
    visual: (
      <div className="flex items-center justify-center gap-4 py-6">
        {[
          { label: 'Expert A', color: '#81C995', icon: '⬡' },
          { label: 'Expert B', color: '#3C7EB3', icon: '⚡' },
        ].map((m) => (
          <div key={m.label} className="flex flex-col items-center gap-2">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shadow-md"
              style={{ background: m.color + '22', border: `2px solid ${m.color}` }}
            >
              {m.icon}
            </div>
            <span className="text-xs font-medium text-slate-custom">{m.label}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-px bg-base-divider mx-1" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shadow-md"
            style={{ background: '#FDD66322', border: '2px solid #FDD663' }}
          >
            ⚖️
          </div>
          <span className="text-xs font-medium text-slate-custom">Judge</span>
        </div>
      </div>
    ),
  },
  {
    id: 'why',
    tag: 'The Problem',
    headline: 'Single models have blind spots.',
    body: 'Every LLM carries inherent biases and gaps. A single model confidently giving one answer has no mechanism to self-correct. Arbiter solves this by making models challenge each other — surfacing weaknesses, sharpening reasoning, and producing more trustworthy outputs.',
    visual: (
      <div className="grid grid-cols-2 gap-3 py-4">
        {[
          { label: 'Hallucination', icon: '🌀', desc: 'Confident but wrong' },
          { label: 'Bias', icon: '📐', desc: 'Skewed perspective' },
          { label: 'No self-check', icon: '🔇', desc: 'No adversarial review' },
          { label: 'Fixed answer', icon: '🔒', desc: 'No iteration' },
        ].map((item) => (
          <div key={item.label} className="bg-base-panel border border-base-divider rounded-lg p-3 flex items-start gap-2">
            <span className="text-lg">{item.icon}</span>
            <div>
              <div className="text-xs font-semibold text-brand-navy">{item.label}</div>
              <div className="text-xs text-slate-custom">{item.desc}</div>
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
      <div className="flex flex-col gap-3 py-4">
        {[
          { name: 'Gemma 3', role: 'Expert A · Logical analysis', color: '#81C995', icon: '⬡' },
          { name: 'Mistral', role: 'Expert B · Critical reasoning', color: '#3C7EB3', icon: '⚡' },
          { name: 'Qwen 2.5 / GPT-OSS', role: 'Judge · Final arbitration', color: '#FDD663', icon: '⚖️' },
        ].map((m) => (
          <div key={m.name} className="flex items-center gap-3 bg-base-panel border border-base-divider rounded-lg px-4 py-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: m.color + '22', border: `1.5px solid ${m.color}` }}
            >
              {m.icon}
            </div>
            <div>
              <div className="text-sm font-semibold text-brand-navy">{m.name}</div>
              <div className="text-xs text-slate-custom">{m.role}</div>
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
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  background: r.active ? 'rgb(11,31,51)' : 'rgb(224,227,232)',
                  color: r.active ? '#fff' : 'rgb(75,85,99)',
                }}
              >
                {i + 1}
              </div>
              {i < 3 && <div className="w-px h-4 bg-base-divider mt-1" />}
            </div>
            <div className="pb-1">
              <div className="text-xs font-semibold text-brand-navy">{r.round}</div>
              <div className="text-xs text-slate-custom">{r.desc}</div>
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
        <div className="bg-base-panel border border-base-divider rounded-lg p-3 text-xs text-slate-custom">
          <span className="font-semibold text-brand-navy block mb-1">Judge reads:</span>
          Expert A initial → Expert B initial → Debate rounds → Consensus status
        </div>
        <div className="flex gap-2">
          {[
            { label: 'Confirm consensus', color: '#1A9D68' },
            { label: 'Break a tie', color: '#D98A1B' },
            { label: 'Override weak reasoning', color: '#C43F4A' },
          ].map((o) => (
            <div
              key={o.label}
              className="flex-1 rounded-lg p-2 text-center text-xs font-medium"
              style={{ background: o.color + '18', border: `1px solid ${o.color}44`, color: o.color }}
            >
              {o.label}
            </div>
          ))}
        </div>
        <div className="bg-layer-white border border-base-divider rounded-lg p-3 flex items-center gap-2">
          <span className="text-signal-green text-base">✓</span>
          <span className="text-xs font-semibold text-brand-navy">Terminal Protocol Reached</span>
          <span className="ml-auto text-xs text-slate-custom">Verified answer</span>
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
      <div className="grid grid-cols-1 gap-3 py-4">
        {[
          { title: 'Compare Frameworks', example: '"Compare Python vs Go for a high-throughput backend."' },
          { title: 'Risk Assessment', example: '"What are the risks of adopting microservices for a startup?"' },
          { title: 'Clinical / Technical', example: '"What is the first-line treatment for Type 2 diabetes?"' },
          { title: 'Abstract Concepts', example: '"Explain quantum entanglement simply."' },
        ].map((q) => (
          <div key={q.title} className="bg-base-panel border border-base-divider rounded-lg px-4 py-3">
            <div className="text-xs font-semibold text-brand-navy mb-0.5">{q.title}</div>
            <div className="text-xs text-slate-custom italic">{q.example}</div>
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
      <div className="absolute inset-0 bg-base-DEFAULT/90 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-layer-white border border-base-divider rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
        {/* Header bar */}
        <div className="bg-base-panel border-b border-base-divider px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-brand-navy rounded flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-brand-navy">Arbiter Console</span>
          </div>
          <button
            onClick={onComplete}
            className="text-xs text-slate-custom hover:text-brand-navy transition-colors"
          >
            Skip tour
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-5 flex items-center gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === step ? 24 : 8,
                background: i === step ? 'rgb(11,31,51)' : 'rgb(208,213,221)',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pt-4 pb-2 flex-1 overflow-y-auto max-h-[60vh]">
          <span className="inline-block text-xs font-semibold uppercase tracking-wider text-brand-azure mb-2">
            {current.tag}
          </span>
          <h2 className="text-xl font-bold text-brand-navy leading-snug mb-2">
            {current.headline}
          </h2>
          <p className="text-sm text-slate-custom leading-relaxed">
            {current.body}
          </p>
          {current.visual}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-base-divider flex items-center justify-between bg-base-panel">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-sm text-slate-custom hover:text-brand-navy transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <span className="text-xs text-slate-custom">{step + 1} / {steps.length}</span>
          <button
            onClick={() => isLast ? onComplete() : setStep(s => s + 1)}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-navy hover:brightness-110 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isLast ? 'Launch Console' : 'Next'}
            {!isLast && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            {isLast && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
