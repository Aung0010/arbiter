import React from 'react';
import { AgentRole } from '../types';

interface AgentBadgeProps {
  role: AgentRole;
  size?: 'sm' | 'md';
}

const AgentBadge: React.FC<AgentBadgeProps> = ({ role, size = 'md' }) => {
  const styles = {
    [AgentRole.ANALYST]: "bg-layer-white text-slate-custom border-base-divider border-l-2 border-l-brand-azure",
    [AgentRole.CREATIVE]: "bg-layer-white text-slate-custom border-base-divider border-l-2 border-l-brand-azure",
    [AgentRole.SKEPTIC]: "bg-layer-white text-slate-custom border-base-divider border-l-2 border-l-brand-azure",
  };

  const text = {
    [AgentRole.ANALYST]: "Qwen 2.5",
    [AgentRole.CREATIVE]: "Gemma 3",
    [AgentRole.SKEPTIC]: "Ministral 3",
  };

  const icons = {
    [AgentRole.ANALYST]: (
      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    [AgentRole.CREATIVE]: (
      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    [AgentRole.SKEPTIC]: (
      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  const sizeClasses = size === 'sm' ? "text-xs px-2 py-1" : "text-sm px-2.5 py-1.5";

  return (
    <span className={`inline-flex items-center font-medium rounded shadow-sm border ${styles[role]} ${sizeClasses}`}>
      {icons[role]}
      <span className="ml-1 tracking-tight">{text[role]}</span>
    </span>
  );
};

export default AgentBadge;