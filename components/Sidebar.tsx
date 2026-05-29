import React, { useState } from 'react';
import { ChatSession } from '../types';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  isOpen: boolean;
  toggleSidebar: () => void;
  onShowTour: () => void;
  userEmail?: string;
  onSignOut?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  isOpen,
  toggleSidebar,
  onShowTour,
  userEmail,
  onSignOut
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [editTarget, setEditTarget] = useState<ChatSession | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const openDeleteModal = (e: React.MouseEvent<HTMLButtonElement>, session: ChatSession) => {
    e.stopPropagation();
    setDeleteTarget(session);
  };
  const closeDeleteModal = () => setDeleteTarget(null);
  const confirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteSession(deleteTarget.id);
    setDeleteTarget(null);
  };

  const openEditModal = (e: React.MouseEvent<HTMLButtonElement>, session: ChatSession) => {
    e.stopPropagation();
    setEditTarget(session);
    setEditTitle(session.title || '');
  };
  const closeEditModal = () => {
    setEditTarget(null);
    setEditTitle('');
  };
  const confirmEdit = () => {
    if (!editTarget) return;
    const cleanedTitle = editTitle.trim();
    if (!cleanedTitle) { alert('Chat title cannot be empty.'); return; }
    onRenameSession(editTarget.id, cleanedTitle);
    closeEditModal();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-20 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* ── DELETE CONFIRMATION MODAL ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-hairline bg-surface-card animate-fade-in-up">
            <div className="p-6">
              <div className="mb-5 flex items-start gap-4">
                {/* Error icon */}
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-pill bg-semantic-error/10 text-semantic-error">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-ink">Delete chat?</h3>
                  <p className="mt-1 text-[14px] text-body">This action cannot be undone.</p>
                </div>
              </div>

              <div className="rounded-md border border-hairline bg-canvas-soft p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.055em] text-muted">Selected chat</p>
                <p className="mt-1 truncate text-[14px] font-medium text-ink">
                  {deleteTarget.title || 'Untitled Execution'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-hairline bg-canvas-soft px-5 py-3.5">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-md border border-hairline bg-surface-card px-4 py-2 text-[14px] font-medium text-body transition-colors hover:bg-canvas-soft hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-md bg-semantic-error px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:opacity-90"
              >
                Delete chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT TITLE MODAL ── */}
      {editTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-hairline bg-surface-card animate-fade-in-up">
            <div className="p-6">
              <div className="mb-5 flex items-start gap-4">
                {/* Edit icon */}
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-ink">Rename chat</h3>
                  <p className="mt-1 text-[14px] text-body">Update the title shown in your execution history.</p>
                </div>
              </div>

              <label className="block text-[11px] font-semibold uppercase tracking-[0.055em] text-muted mb-2">
                Chat title
              </label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmEdit();
                  if (e.key === 'Escape') closeEditModal();
                }}
                autoFocus
                className="w-full rounded-md border border-hairline bg-surface-card px-4 py-2.5 text-[14px] text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-muted-soft"
                placeholder="Enter chat title"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-hairline bg-canvas-soft px-5 py-3.5">
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-md border border-hairline bg-surface-card px-4 py-2 text-[14px] font-medium text-body transition-colors hover:bg-canvas-soft hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEdit}
                className="rounded-md bg-primary hover:bg-primary-active px-4 py-2 text-[14px] font-medium text-on-primary transition-colors"
              >
                Save title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SIDEBAR PANEL ──
           On mobile: always fixed overlay, slides in/out with translate.
           On desktop (md+): always visible, part of the normal flex row. */}
      <div
        className={`
          fixed inset-y-0 left-0 z-30 flex flex-col
          w-[85vw] max-w-[300px]
          bg-canvas-soft border-r border-hairline
          transform transition-transform duration-300 ease-in-out
          md:relative md:w-64 md:flex-shrink-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-hairline flex items-center justify-between">
          {/* display-sm: 18px / 400 / -0.005em tracking */}
          <h1 className="text-[18px] font-normal text-ink tracking-[-0.005em]">
            Arbiter
          </h1>

          <div className="flex items-center gap-1">
            {/* Theme toggle */}
            <button
              onClick={() => {
                const isDark = document.documentElement.classList.toggle('dark');
                localStorage.theme = isDark ? 'dark' : 'light';
              }}
              className="p-1.5 hover:bg-hairline rounded-md transition-colors"
              title="Toggle Theme"
            >
              <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  className="hidden dark:block"
                  strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
                <path
                  className="block dark:hidden"
                  strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {/* New Chat — Gemini-style: slim pencil+text, not a block button */}
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) toggleSidebar();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-hairline text-ink transition-colors text-[14px] font-medium mb-1 group"
          >
            <svg className="w-4 h-4 flex-shrink-0 text-muted group-hover:text-ink transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            New Chat
          </button>

          {/* A thin separator before history */}
          <div className="h-px bg-hairline mx-1 my-2" />

          {/* History label */}
          <div className="mb-1.5 px-1">
            <h2 className="text-[11px] font-semibold text-muted uppercase tracking-[0.055em]">
              Recent
            </h2>
          </div>

          {sessions.length === 0 && (
            <p className="text-[13px] text-muted-soft italic px-1 mt-2">No historical data.</p>
          )}

          <div className="space-y-0.5">
            {sessions.map((session) => {
              const isActive = activeSessionId === session.id;
              return (
                <div
                  key={session.id}
                  className={`group flex items-center rounded-lg text-[14px] transition-colors ${
                    isActive
                      ? 'bg-hairline text-ink'
                      : 'text-body hover:bg-hairline hover:text-ink'
                  }`}
                >
                  <button
                    onClick={() => {
                      onSelectSession(session.id);
                      if (window.innerWidth < 768) toggleSidebar();
                    }}
                    className="min-w-0 flex-1 text-left px-3 py-2 truncate"
                    title={session.title || 'Untitled Execution'}
                  >
                    {session.title || 'Untitled Execution'}
                  </button>

                  <div className="mr-1 flex items-center gap-0.5">
                    {/* Rename */}
                    <button
                      type="button"
                      onClick={(e) => openEditModal(e, session)}
                      className={`flex h-6 w-6 items-center justify-center rounded transition-all ${
                        isActive
                          ? 'text-on-primary/60 hover:text-on-primary hover:bg-white/10'
                          : 'text-muted opacity-0 group-hover:opacity-100 hover:text-ink hover:bg-hairline'
                      }`}
                      title="Rename chat"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={(e) => openDeleteModal(e, session)}
                      className={`flex h-6 w-6 items-center justify-center rounded transition-all ${
                        isActive
                          ? 'text-on-primary/60 hover:text-on-primary hover:bg-white/10'
                          : 'text-muted opacity-0 group-hover:opacity-100 hover:text-semantic-error hover:bg-semantic-error/10'
                      }`}
                      title="Delete chat"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m3-3h4a1 1 0 011 1v2H9V5a1 1 0 011-1z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom container */}
        <div className="px-3 pb-3 pt-2 border-t border-hairline flex flex-col gap-2">
          {/* Show onboarding tour — button-secondary */}
          <button
            onClick={onShowTour}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-surface-card border border-hairline hover:border-hairline-strong text-body hover:text-ink rounded-md transition-colors text-[14px] font-medium"
          >
            <svg className="w-4 h-4 flex-shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How it works
          </button>

          {/* User account */}
          {userEmail && onSignOut && (
            <div className="relative">
              {isUserMenuOpen && (
                <div className="mb-1 w-full rounded-md border border-hairline p-1 bg-surface-card">
                  <button
                    onClick={onSignOut}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-[14px] font-medium text-semantic-error hover:bg-semantic-error/8 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}

              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex w-full items-center gap-2.5 rounded-md p-2 transition-colors hover:bg-hairline border border-transparent hover:border-hairline"
              >
                {/* Avatar — ink background */}
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-pill bg-ink text-[12px] font-semibold text-on-primary">
                  {userEmail.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-1 flex-col overflow-hidden text-left">
                  <span className="truncate text-[13px] font-medium text-ink">
                    {userEmail.split('@')[0]}
                  </span>
                  <span className="truncate text-[11px] text-muted">
                    {userEmail}
                  </span>
                </div>
                <svg
                  className={`h-3.5 w-3.5 text-muted transition-transform flex-shrink-0 ${isUserMenuOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;