import React from 'react';
import { ChatSession } from '../types';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  isOpen: boolean;
  toggleSidebar: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  sessions, 
  activeSessionId, 
  onSelectSession, 
  onNewChat,
  isOpen,
  toggleSidebar
}) => {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={toggleSidebar}
        />
      )}
      
      <div className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-base-panel text-slate-custom transform transition-transform duration-300 ease-in-out border-r border-base-divider
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0
      `}>
        <div className="p-4 border-b border-base-divider flex justify-between items-center">
          <h1 className="text-lg font-semibold tracking-tight text-brand-navy">Arbiter Console</h1>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => {
                const isDark = document.documentElement.classList.toggle('dark');
                localStorage.theme = isDark ? 'dark' : 'light';
              }} 
              className="p-1 hover:bg-layer-white rounded transition-colors" 
              title="Toggle Theme"
            >
              <svg className="w-5 h-5 text-slate-custom" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path className="hidden dark:block" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                <path className="block dark:hidden" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            </button>
            <button onClick={onNewChat} className="p-1 hover:bg-layer-white rounded transition-colors" title="New Session">
              <svg className="w-5 h-5 text-slate-custom" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto h-[calc(100vh-64px)]">
          <button 
            onClick={() => { onNewChat(); if (window.innerWidth < 768) toggleSidebar(); }}
            className="w-full flex items-center gap-2 px-4 py-3 bg-brand-navy hover:brightness-110 text-core-inverse rounded transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Initialize Execution
          </button>

          <div className="space-y-1">
            <h2 className="text-xs font-semibold text-slate-custom uppercase tracking-wider mb-2 mt-4 inline-block">Execution History</h2>
            {sessions.length === 0 && (
                <p className="text-xs text-slate-500 italic">No historical data.</p>
            )}
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => { onSelectSession(session.id); if (window.innerWidth < 768) toggleSidebar(); }}
                className={`w-full text-left px-3 py-2 rounded text-sm truncate transition-colors ${
                  activeSessionId === session.id 
                    ? 'bg-brand-azure text-core-inverse' 
                    : 'text-slate-custom hover:bg-layer-white hover:text-brand-navy'
                }`}
              >
                {session.title || "Untitled Execution"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;