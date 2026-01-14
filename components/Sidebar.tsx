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
        fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0
      `}>
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight">Arbiter</h1>
          <button onClick={onNewChat} className="p-1 hover:bg-slate-700 rounded transition-colors" title="New Chat">
            <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto h-[calc(100vh-64px)]">
          <button 
            onClick={() => { onNewChat(); if (window.innerWidth < 768) toggleSidebar(); }}
            className="w-full flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            New Debate
          </button>

          <div className="space-y-1">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">History</h2>
            {sessions.length === 0 && (
                <p className="text-xs text-slate-600 italic">No past debates.</p>
            )}
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => { onSelectSession(session.id); if (window.innerWidth < 768) toggleSidebar(); }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm truncate transition-colors ${
                  activeSessionId === session.id 
                    ? 'bg-slate-800 text-white' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {session.title || "Untitled Debate"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;