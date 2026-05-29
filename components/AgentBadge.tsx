import React from 'react';
import { AgentRole } from '../types';

interface AgentBadgeProps {
  role: AgentRole;
  size?: 'sm' | 'md';
}

const AgentBadge: React.FC<AgentBadgeProps> = ({ role, size = 'md' }) => {
  // Timeline pastel pill palette — AI-action signature
  // Expert A (Gemma) → Primary subdued lavender  · Expert B (Mistral) → Sky blue  · Judge → Brand dark
  const styles: Record<AgentRole, string> = {
    [AgentRole.MODEL_A]: 'bg-primary-subdued text-ink',
    [AgentRole.MODEL_B]: 'bg-timeline-read text-ink',
    [AgentRole.MODEL_C]: 'bg-brand-dark text-on-primary',
    [AgentRole.USER]:   'bg-canvas-soft text-body',
    [AgentRole.SYSTEM]: 'bg-canvas-soft text-muted',
  };

  // Human-readable labels; these match the model names set in the backend env
  const text: Record<AgentRole, string> = {
    [AgentRole.MODEL_A]: 'Expert A · Gemma 3',
    [AgentRole.MODEL_B]: 'Expert B · Mistral',
    [AgentRole.MODEL_C]: 'Arbiter · Judge',
    [AgentRole.USER]: 'User',
    [AgentRole.SYSTEM]: 'System',
  };

  const icons: Record<AgentRole, React.ReactNode> = {
    [AgentRole.MODEL_A]: (
      // Gemma — hexagonal "gem" shape
      <svg className="w-3 h-3 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    [AgentRole.MODEL_B]: (
      // Mistral — lightning bolt (speed / precision)
      <svg className="w-3 h-3 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    [AgentRole.MODEL_C]: (
      // Judge — scales of justice / analytical
      <svg className="w-3 h-3 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  };

  // caption-uppercase: 11px / 600 / 0.88px tracking — timeline pill labels
  const sizeClasses = size === 'sm'
    ? 'text-[11px] font-semibold tracking-[0.055em] uppercase px-2.5 py-1'
    : 'text-[11px] font-semibold tracking-[0.055em] uppercase px-3 py-1.5';

  return (
    <span className={`inline-flex items-center rounded-pill ${styles[role]} ${sizeClasses}`}>
      {icons[role]}
      <span>{text[role]}</span>
    </span>
  );
};

export default AgentBadge;