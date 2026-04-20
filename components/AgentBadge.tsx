import React from 'react';
import { AgentRole } from '../types';

interface AgentBadgeProps {
  role: AgentRole;
  size?: 'sm' | 'md';
}

const AgentBadge: React.FC<AgentBadgeProps> = ({ role, size = 'md' }) => {
  const styles: Record<AgentRole, string> = {
    [AgentRole.MODEL_A]: 'bg-layer-white text-slate-custom border-base-divider border-l-2 border-l-[#81C995]',
    [AgentRole.MODEL_B]: 'bg-layer-white text-slate-custom border-base-divider border-l-2 border-l-brand-azure',
    [AgentRole.MODEL_C]: 'bg-layer-white text-slate-custom border-base-divider border-l-2 border-l-[#FDD663]',
  };

  // Human-readable labels; these match the model names set in the backend env
  const text: Record<AgentRole, string> = {
    [AgentRole.MODEL_A]: 'Gemma 3',
    [AgentRole.MODEL_B]: 'Mistral',
    [AgentRole.MODEL_C]: 'Qwen 2.5',
  };

  const icons: Record<AgentRole, React.ReactNode> = {
    [AgentRole.MODEL_A]: (
      // Gemma — hexagonal "gem" shape
      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    [AgentRole.MODEL_B]: (
      // Mistral — lightning bolt (speed / precision)
      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    [AgentRole.MODEL_C]: (
      // Qwen — search/analytical lens
      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  };

  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm px-2.5 py-1.5';

  return (
    <span className={`inline-flex items-center font-medium rounded shadow-sm border ${styles[role]} ${sizeClasses}`}>
      {icons[role]}
      <span className="ml-1 tracking-tight">{text[role]}</span>
    </span>
  );
};

export default AgentBadge;