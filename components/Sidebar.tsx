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

  const openDeleteModal = (
    e: React.MouseEvent<HTMLButtonElement>,
    session: ChatSession
  ) => {
    e.stopPropagation();
    setDeleteTarget(session);
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;

    onDeleteSession(deleteTarget.id);
    setDeleteTarget(null);
  };

  const openEditModal = (
    e: React.MouseEvent<HTMLButtonElement>,
    session: ChatSession
  ) => {
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

    if (!cleanedTitle) {
      alert('Chat title cannot be empty.');
      return;
    }

    onRenameSession(editTarget.id, cleanedTitle);
    closeEditModal();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
            <div className="p-6">
              <div className="mb-5 flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    />
                  </svg>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">
                    Delete chat?
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Selected chat
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-zinc-900">
                  {deleteTarget.title || 'Untitled Execution'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600"
              >
                Delete chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TITLE MODAL */}
      {editTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
            <div className="p-6">
              <div className="mb-5 flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                    />
                  </svg>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">
                    Rename chat
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    Update the title shown in your execution history.
                  </p>
                </div>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
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
                className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                placeholder="Enter chat title"
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4">
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmEdit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Save title
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`
          fixed inset-y-0 left-0 z-30 w-64 bg-base-panel text-slate-custom transform transition-transform duration-300 ease-in-out border-r border-base-divider flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0
        `}
      >
        {/* HEADER */}
        <div className="p-4 border-b border-base-divider flex justify-between items-center">
          <h1 className="text-lg font-semibold tracking-tight text-brand-navy">
            Arbiter Console
          </h1>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const isDark = document.documentElement.classList.toggle('dark');
                localStorage.theme = isDark ? 'dark' : 'light';
              }}
              className="p-1 hover:bg-layer-white rounded transition-colors"
              title="Toggle Theme"
            >
              <svg
                className="w-5 h-5 text-slate-custom"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  className="hidden dark:block"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
                <path
                  className="block dark:hidden"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* CHAT SESSIONS */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) toggleSidebar();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 bg-brand-navy hover:brightness-110 text-core-inverse rounded-lg transition-colors text-sm font-medium"
          >
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            New Chat
          </button>

          <div className="space-y-1">
            <h2 className="text-xs font-semibold text-slate-custom uppercase tracking-wider mb-2 mt-4 inline-block">
              Execution History
            </h2>

            {sessions.length === 0 && (
              <p className="text-xs text-slate-500 italic">
                No historical data.
              </p>
            )}

            {sessions.map((session) => {
              const isActive = activeSessionId === session.id;

              return (
                <div
                  key={session.id}
                  className={`group flex items-center rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-brand-azure text-core-inverse'
                      : 'text-slate-custom hover:bg-layer-white hover:text-brand-navy'
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

                  <div className="mr-1 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => openEditModal(e, session)}
                      className={`flex h-7 w-7 items-center justify-center rounded transition-all ${
                        isActive
                          ? 'text-core-inverse hover:bg-white/20'
                          : 'text-slate-custom opacity-0 group-hover:opacity-100 hover:bg-blue-500/10 hover:text-blue-500'
                      }`}
                      title="Rename chat"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                        />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => openDeleteModal(e, session)}
                      className={`flex h-7 w-7 items-center justify-center rounded transition-all ${
                        isActive
                          ? 'text-core-inverse hover:bg-white/20'
                          : 'text-slate-custom opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500'
                      }`}
                      title="Delete chat"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m3-3h4a1 1 0 011 1v2H9V5a1 1 0 011-1z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* BOTTOM CONTAINER */}
        <div className="p-4 border-t border-base-divider bg-base-panel flex flex-col gap-3 relative">
          <button
            onClick={onShowTour}
            className="w-full flex items-center gap-3 px-4 py-3 bg-brand-navy hover:brightness-110 text-core-inverse rounded-lg transition-colors text-sm font-medium"
          >
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Show onboarding tour
          </button>

          {userEmail && onSignOut && (
            <div className="relative pt-3 border-t border-base-divider">
              {isUserMenuOpen && (
                <div className="mb-2 w-full rounded-xl border border-base-divider p-1 bg-layer-white dark:bg-base-DEFAULT">
                  <button
                    onClick={onSignOut}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}

              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex w-full items-center gap-3 rounded-xl p-2 transition-colors hover:bg-layer-white border border-transparent hover:border-base-divider"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-navy text-sm font-semibold text-white">
                  {userEmail.charAt(0).toUpperCase()}
                </div>

                <div className="flex flex-1 flex-col overflow-hidden text-left">
                  <span className="truncate text-sm font-medium text-brand-navy">
                    {userEmail.split('@')[0]}
                  </span>
                  <span className="truncate text-[10px] text-slate-custom">
                    {userEmail}
                  </span>
                </div>

                <svg
                  className={`h-4 w-4 text-slate-custom transition-transform ${
                    isUserMenuOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 15l7-7 7 7"
                  />
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