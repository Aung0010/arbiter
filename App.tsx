import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import DebateRoundView from './components/DebateRoundView';
import FinalAnswer from './components/FinalAnswer';
import OnboardingModal from './components/OnboardingModal';
import LoginPage from './pages/LoginPage';
import { ChatSession, DebateRound, FinalConsensus, AgentRole } from './types';
import { DebateOrchestrator } from './services/orchestrator';
import { supabase } from './lib/supabaseClient';

type DbMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'expert_a' | 'expert_b' | 'judge' | 'system';
  content: string;
  metadata: any;
  created_at: string;
};

type UIChatSession = ChatSession & {
  messages: DbMessage[];
};

type ConversationTurn = {
  turnNumber: number;
  userMessage?: DbMessage;
  rounds: DebateRound[];
  finalMessage?: DbMessage;
};

const isValidUuid = (value: string | null) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);

  const [sessions, setSessions] = useState<UIChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [processingSessionId, setProcessingSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(
    () => localStorage.getItem('arbiter_onboarding_done') !== 'true'
  );

  const scrollEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const savedAgentMessageKeysRef = useRef<Set<string>>(new Set());

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  // One global processing lock, but UI only shows loading for the processing chat.
  const isProcessing = processingSessionId !== null;
  const isCurrentSessionProcessing =
    !!activeSession && activeSession.id === processingSessionId;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) setShowAuth(false);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const buildConsensusFromMessage = (message: DbMessage): FinalConsensus => {
    return {
      answer: message.content,
      reasoning: message.metadata?.reasoning || '',
      participatingAgents:
        message.metadata?.participatingAgents || [
          AgentRole.MODEL_A,
          AgentRole.MODEL_B,
          AgentRole.MODEL_C,
        ],
      participantSummary: message.metadata?.participantSummary,
    };
  };

  const buildRoundsFromMessages = (messages: DbMessage[], turnNumber?: number): DebateRound[] => {
    const debateMessages = messages.filter((m) => {
      const isDebateRound = m.metadata?.kind === 'debate_round';
      const sameTurn =
        turnNumber === undefined || Number(m.metadata?.turnNumber || 1) === turnNumber;

      return isDebateRound && sameTurn;
    });

    const roundMap = new Map<number, DebateRound>();

    for (const message of debateMessages) {
      const roundNumber = Number(message.metadata?.roundNumber || 1);

      if (!roundMap.has(roundNumber)) {
        roundMap.set(roundNumber, {
          roundNumber,
          responses: [],
          summary: message.metadata?.summary || undefined,
        });
      }

      const round = roundMap.get(roundNumber);
      if (!round) continue;

      round.responses.push({
        agentId: message.role as AgentRole,
        content: message.content,
        confidenceScore: message.metadata?.confidenceScore ?? undefined,
        timestamp: message.metadata?.agentTimestamp || new Date(message.created_at).getTime(),
      });
    }

    return Array.from(roundMap.values()).sort((a, b) => a.roundNumber - b.roundNumber);
  };

  const buildTurnsFromMessages = (messages: DbMessage[]): ConversationTurn[] => {
    const turnMap = new Map<number, ConversationTurn>();

    const getTurn = (turnNumber: number): ConversationTurn => {
      if (!turnMap.has(turnNumber)) {
        turnMap.set(turnNumber, {
          turnNumber,
          rounds: [],
        });
      }

      return turnMap.get(turnNumber)!;
    };

    const userMessages = messages.filter((m) => m.role === 'user');

    userMessages.forEach((message, index) => {
      const turnNumber = Number(message.metadata?.turnNumber || index + 1);
      const turn = getTurn(turnNumber);
      turn.userMessage = message;
    });

    const finalMessages = messages.filter(
      (m) =>
        m.role === 'judge' &&
        (m.metadata?.kind === 'final' || m.metadata?.reasoning)
    );

    finalMessages.forEach((message, index) => {
      const turnNumber = Number(message.metadata?.turnNumber || index + 1);
      const turn = getTurn(turnNumber);
      turn.finalMessage = message;
    });

    const debateMessages = messages.filter((m) => m.metadata?.kind === 'debate_round');

    for (const message of debateMessages) {
      const turnNumber = Number(message.metadata?.turnNumber || 1);
      getTurn(turnNumber);
    }

    for (const turn of turnMap.values()) {
      turn.rounds = buildRoundsFromMessages(messages, turn.turnNumber);
    }

    return Array.from(turnMap.values()).sort((a, b) => a.turnNumber - b.turnNumber);
  };

  const buildSessionFromMessages = (
    baseSession: UIChatSession,
    messages: DbMessage[]
  ): UIChatSession => {
    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMessage = [...userMessages].reverse()[0];

    const finalJudgeMessages = messages.filter(
      (m) =>
        m.role === 'judge' &&
        (m.metadata?.kind === 'final' || m.metadata?.reasoning)
    );

    const lastFinalJudgeMessage = [...finalJudgeMessages].reverse()[0];
    const lastTurnNumber = Number(lastUserMessage?.metadata?.turnNumber || userMessages.length || 1);

    return {
      ...baseSession,
      messages,
      userPrompt: lastUserMessage?.content || '',
      followUpCount: Math.max(userMessages.length, 1),
      finalResult: lastFinalJudgeMessage
        ? buildConsensusFromMessage(lastFinalJudgeMessage)
        : null,
      rounds: buildRoundsFromMessages(messages, lastTurnNumber),
    };
  };

  const appendLocalMessages = (sessionId: string, newMessages: DbMessage[]) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;

        const existingIds = new Set(s.messages.map((m) => m.id));
        const mergedMessages = [
          ...s.messages,
          ...newMessages.filter((m) => !existingIds.has(m.id)),
        ].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        return buildSessionFromMessages(s, mergedMessages);
      })
    );
  };

  const loadMessagesForSession = async (sessionId: string) => {
    if (!isValidUuid(sessionId)) {
      console.warn('Invalid session id ignored:', sessionId);
      setActiveSessionId(null);
      return;
    }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      alert(error.message);
      return;
    }

    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? buildSessionFromMessages(s, (data || []) as DbMessage[])
          : s
      )
    );

    scrollToBottom();
  };

  useEffect(() => {
    const loadSessions = async () => {
      if (!session?.user) {
        setSessions([]);
        setActiveSessionId(null);
        return;
      }

      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching sessions:', error);
        alert(error.message);
        return;
      }

      const formattedSessions: UIChatSession[] = (data || []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        title: row.title,
        timestamp: new Date(row.created_at).getTime(),
        rounds: [],
        finalResult: null,
        userPrompt: '',
        followUpCount: 1,
        messages: [],
      }));

      setSessions(formattedSessions);

      if (activeSessionId && !formattedSessions.some((s) => s.id === activeSessionId)) {
        setActiveSessionId(null);
      }
    };

    loadSessions();
  }, [session]);

  const handleNewChat = () => {
    setActiveSessionId(null);
    setPrompt('');
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = async (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));

    if (activeSessionId === id) {
      setActiveSessionId(null);
      setPrompt('');
    }

    if (session?.user) {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id);

      if (error) {
        console.error('Failed to delete session:', error);
        alert(error.message);
      }
    }
  };

  const handleRenameSession = async (id: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              title,
            }
          : s
      )
    );

    if (session?.user) {
      const { error } = await supabase
        .from('sessions')
        .update({
          title,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', session.user.id);

      if (error) {
        console.error('Failed to rename session:', error);
        alert(error.message);
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const updateSession = async (id: string, updates: Partial<UIChatSession>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );

    if (session?.user && updates.title) {
      const { error } = await supabase
        .from('sessions')
        .update({
          title: updates.title,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', session.user.id);

      if (error) {
        console.error('Failed to update session:', error);
      }
    }
  };

  const getNextTurnNumberFromDb = async (sessionId: string) => {
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('role', 'user');

    if (error) {
      console.error('Failed to count previous messages:', error);
      return 1;
    }

    return (count || 0) + 1;
  };

  const saveRoundMessages = async (
    sessionId: string,
    updatedRounds: DebateRound[],
    turnNumber: number
  ) => {
    const rowsToInsert: any[] = [];

    for (const round of updatedRounds) {
      for (const response of round.responses || []) {
        const key = [
          sessionId,
          turnNumber,
          round.roundNumber,
          response.agentId,
          response.timestamp,
          response.content,
        ].join('|');

        if (savedAgentMessageKeysRef.current.has(key)) {
          continue;
        }

        savedAgentMessageKeysRef.current.add(key);

        rowsToInsert.push({
          session_id: sessionId,
          role: response.agentId,
          content: response.content,
          metadata: {
            kind: 'debate_round',
            turnNumber,
            roundNumber: round.roundNumber,
            confidenceScore: response.confidenceScore ?? null,
            agentTimestamp: response.timestamp ?? null,
            summary: round.summary ?? null,
          },
        });
      }
    }

    if (rowsToInsert.length === 0) return;

    const { data, error } = await supabase
      .from('messages')
      .insert(rowsToInsert)
      .select('*');

    if (error) {
      console.error('Failed to save debate round messages:', error);
      return;
    }

    if (data) {
      appendLocalMessages(sessionId, data as DbMessage[]);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!session?.user) {
      setShowAuth(true);
      return;
    }

    if (!prompt.trim() || isProcessing) return;

    const userQuery = prompt.trim();
    setPrompt('');

    let currentSessionId = isValidUuid(activeSessionId) ? activeSessionId : null;
    let currentTurnNumber = 1;

    try {
      if (!currentSessionId) {
        const title =
          userQuery.length > 30
            ? userQuery.substring(0, 30) + '...'
            : userQuery;

        const { data: createdSession, error: sessionError } = await supabase
          .from('sessions')
          .insert({
            user_id: session.user.id,
            title,
          })
          .select('id, user_id, title, created_at')
          .single();

        if (sessionError || !createdSession) {
          console.error('Failed to save session:', sessionError);
          alert(sessionError?.message || 'Failed to save session.');
          return;
        }

        currentSessionId = createdSession.id;
        currentTurnNumber = 1;

        const newSession: UIChatSession = {
          id: createdSession.id,
          user_id: createdSession.user_id,
          title: createdSession.title,
          timestamp: new Date(createdSession.created_at).getTime(),
          rounds: [],
          finalResult: null,
          userPrompt: '',
          followUpCount: 1,
          messages: [],
        };

        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(createdSession.id);
        setProcessingSessionId(createdSession.id);
      } else {
        currentTurnNumber = await getNextTurnNumberFromDb(currentSessionId);
        setProcessingSessionId(currentSessionId);

        updateSession(currentSessionId, {
          rounds: [],
          finalResult: null,
        });
      }

      const { data: savedUserMessage, error: messageError } = await supabase
        .from('messages')
        .insert({
          session_id: currentSessionId,
          role: 'user',
          content: userQuery,
          metadata: {
            kind: 'user_prompt',
            turnNumber: currentTurnNumber,
          },
        })
        .select('*')
        .single();

      if (messageError || !savedUserMessage) {
        console.error('Failed to save user message:', messageError);
        alert(messageError?.message || 'Failed to save user message.');
        return;
      }

      appendLocalMessages(currentSessionId, [savedUserMessage as DbMessage]);

      const orchestrator = new DebateOrchestrator(userQuery, (updatedRounds) => {
        if (currentSessionId) {
          updateSession(currentSessionId, { rounds: updatedRounds });
          saveRoundMessages(currentSessionId, updatedRounds, currentTurnNumber);
          scrollToBottom();
        }
      });

      const finalConsensus = await orchestrator.runDebate();

      if (currentSessionId) {
        updateSession(currentSessionId, { finalResult: finalConsensus });

        const { data: savedJudgeMessage, error: judgeError } = await supabase
          .from('messages')
          .insert({
            session_id: currentSessionId,
            role: 'judge',
            content: finalConsensus.answer,
            metadata: {
              kind: 'final',
              turnNumber: currentTurnNumber,
              reasoning: finalConsensus.reasoning,
              participatingAgents: finalConsensus.participatingAgents,
              participantSummary: finalConsensus.participantSummary,
            },
          })
          .select('*')
          .single();

        if (judgeError || !savedJudgeMessage) {
          console.error('Failed to save judge message:', judgeError);
          alert(judgeError?.message || 'Failed to save judge message.');
          return;
        }

        appendLocalMessages(currentSessionId, [savedJudgeMessage as DbMessage]);
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred during the debate process.');
    } finally {
      setProcessingSessionId(null);
      scrollToBottom();
    }
  };

  const handleSelectSession = async (id: string) => {
    setActiveSessionId(id);
    setIsSidebarOpen(false);
    await loadMessagesForSession(id);
  };

  const handleOnboardingComplete = () => {
    localStorage.setItem('arbiter_onboarding_done', 'true');
    setShowOnboarding(false);
    if (!session) setShowAuth(true);
  };

  const conversationTurns = activeSession
    ? buildTurnsFromMessages(activeSession.messages || [])
    : [];

  const latestTurnNumber =
    conversationTurns.length > 0
      ? conversationTurns[conversationTurns.length - 1].turnNumber
      : 1;

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="text-[13px] font-mono text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-canvas overflow-hidden font-sans text-body">
      {showOnboarding && <OnboardingModal onComplete={handleOnboardingComplete} />}

      {showAuth && !session && !showOnboarding && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/60 backdrop-blur-sm px-4">
          <LoginPage
            onLogin={() => {
              setShowAuth(false);
              window.location.reload();
            }}
            onClose={() => setShowAuth(false)}
          />
        </div>
      )}

      {!session && !showOnboarding && !showAuth && (
        <div className="fixed top-4 right-5 z-50">
          {/* button-secondary: white card on cream canvas */}
          <button
            type="button"
            onClick={() => setShowAuth(true)}
            className="rounded-md border border-hairline bg-surface-card px-5 py-2 text-[14px] font-medium text-ink hover:border-hairline-strong transition"
          >
            Get started
          </button>
        </div>
      )}

      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        userEmail={session?.user?.email}
        onSignOut={handleSignOut}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        isOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onShowTour={() => setShowOnboarding(true)}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden bg-canvas-soft border-b border-hairline px-4 py-3.5 flex items-center justify-between z-10 flex-shrink-0">
          <button onClick={() => setIsSidebarOpen(true)} className="text-muted hover:text-ink transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-[16px] font-normal text-ink tracking-[-0.005em]">Arbiter</span>
          <div className="w-5" />
        </div>

        {!activeSession ? (
          /* ── HERO / EMPTY STATE: centered input like Gemini ── */
          <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto">
            <div className="w-full max-w-2xl flex flex-col items-center py-12">
              {/* App icon */}
              <div className="w-14 h-14 bg-ink rounded-[14px] flex items-center justify-center mb-5 flex-shrink-0">
                <svg className="w-7 h-7 text-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>

              {/* Headline — display-lg style */}
              <h1 className="text-[36px] font-normal text-ink tracking-[-0.02em] leading-tight mb-3 text-center">
                Arbiter
              </h1>

              <p className="text-[16px] text-body text-center leading-relaxed mb-8 max-w-sm">
                A multi-agent consensus protocol. Logic, creativity, and critical analysis debate to reach the truth.
              </p>

              {/* Centered pill input — Gemini-style */}
              <form onSubmit={handleSubmit} className="w-full relative mb-5">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (prompt.trim() && !isProcessing) handleSubmit();
                    }
                  }}
                  rows={1}
                  placeholder="Initialize new protocol execution…"
                  disabled={isProcessing || !session || showOnboarding || showAuth}
                  className="w-full pl-5 pr-14 py-4 bg-surface-card border border-hairline rounded-[28px] text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/8 disabled:opacity-50 disabled:cursor-not-allowed text-[16px] resize-none max-h-48 overflow-y-auto font-sans transition-colors"
                />
                <button
                  type="submit"
                  disabled={!prompt.trim() || isProcessing || !session}
                  className="absolute right-3 bottom-3 h-9 w-9 bg-primary hover:bg-primary-active text-on-primary rounded-pill transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isCurrentSessionProcessing ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </form>

              {/* Clickable suggestion chips */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
                {[
                  { label: 'Evaluate Frameworks', example: 'Compare Python vs Go for a high-throughput backend' },
                  { label: 'Abstract Concepts', example: 'Explain quantum entanglement simply' },
                  { label: 'Risk Assessment', example: 'Draft a sensitive email to a client' },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => {
                      if (session) setPrompt(chip.example);
                      else setShowAuth(true);
                    }}
                    className="text-left p-4 bg-surface-card border border-hairline rounded-lg hover:border-hairline-strong transition-colors group"
                  >
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.055em] text-muted mb-1.5 group-hover:text-body transition-colors">
                      {chip.label}
                    </span>
                    <span className="text-[13px] text-body">"{chip.example}…"</span>
                  </button>
                ))}
              </div>

              {/* Hint */}
              <p className="text-[12px] text-muted-soft font-mono mt-6 text-center">
                Two Ollama experts plus an arbiter judge. Run the backend on port 5050 — Vite proxies{' '}
                <code className="text-muted">/api</code> in development.
              </p>
            </div>
          </div>
        ) : (
          /* ── ACTIVE SESSION: chat layout with bottom-anchored input ── */
          <>
            <main className="flex-1 overflow-y-auto scroll-smooth">
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-10">
                {conversationTurns.length > 0 ? (
                  conversationTurns.map((turn) => (
                    <div key={`turn-${turn.turnNumber}`}>
                      {/* User message — right-aligned bubble */}
                      {turn.userMessage && (
                        <div className="flex justify-end mb-6">
                          <div className="max-w-[78%] bg-surface-card border border-hairline rounded-[20px] px-5 py-3.5 text-[16px] text-ink leading-relaxed whitespace-pre-wrap">
                            {turn.userMessage.content}
                          </div>
                        </div>
                      )}

                      {/* Execution log divider */}
                      {turn.rounds.length > 0 && (
                        <div className="flex items-center gap-3 mb-5">
                          <div className="h-px bg-hairline flex-1" />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.055em] text-muted">
                            Execution Log
                          </span>
                          <div className="h-px bg-hairline flex-1" />
                        </div>
                      )}

                      {/* Debate rounds */}
                      <div className="space-y-3">
                        {turn.rounds.map((round, idx) => (
                          <DebateRoundView
                            key={`turn-${turn.turnNumber}-round-${round.roundNumber}-${idx}`}
                            round={round}
                            isLatest={
                              turn.turnNumber === latestTurnNumber &&
                              idx === turn.rounds.length - 1 &&
                              !turn.finalMessage &&
                              isCurrentSessionProcessing
                            }
                          />
                        ))}
                      </div>

                      {/* Final answer */}
                      {turn.finalMessage && (
                        <FinalAnswer
                          consensus={buildConsensusFromMessage(turn.finalMessage)}
                          onRegenerate={() => {
                            setPrompt(turn.userMessage?.content || activeSession.userPrompt);
                            alert("For regeneration, simply click 'Send' again with the prompt pre-filled.");
                          }}
                        />
                      )}
                    </div>
                  ))
                ) : (
                  /* Fallback: single query bubble while messages load */
                  <div className="flex justify-end mb-6">
                    <div className="max-w-[78%] bg-surface-card border border-hairline rounded-[20px] px-5 py-3.5 text-[16px] text-ink leading-relaxed">
                      {activeSession.userPrompt}
                    </div>
                  </div>
                )}

                {/* Typing/processing indicator */}
                {isCurrentSessionProcessing && (
                  <div className="flex items-center gap-3 py-3 pl-1">
                    <div className="flex items-end gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-pill bg-timeline-thinking animate-typing-dot"
                        style={{ animationDelay: '0ms' }}
                      />
                      <div
                        className="w-2.5 h-2.5 rounded-pill bg-timeline-grep animate-typing-dot"
                        style={{ animationDelay: '200ms' }}
                      />
                      <div
                        className="w-2.5 h-2.5 rounded-pill bg-timeline-read animate-typing-dot"
                        style={{ animationDelay: '400ms' }}
                      />
                    </div>
                    <span className="text-[13px] text-muted font-mono">
                      Debate in progress — this may take several minutes…
                    </span>
                  </div>
                )}

                <div ref={scrollEndRef} />
              </div>
            </main>

            {/* Bottom input bar — pill-shaped, anchored */}
            <div className="flex-shrink-0 bg-canvas border-t border-hairline px-4 py-4">
              <div className="max-w-3xl mx-auto">
                {activeSession && activeSession.followUpCount >= 5 ? (
                  <div className="flex flex-col items-center justify-center py-5 px-5 bg-surface-card border border-hairline rounded-lg text-center">
                    <span className="text-[16px] font-normal text-ink mb-1.5">Session Limit Reached</span>
                    <span className="text-[14px] text-body mb-4 max-w-sm">
                      To maintain optimal agent performance and context limits, please start a new execution.
                    </span>
                    <button
                      onClick={handleNewChat}
                      className="px-5 py-2.5 bg-ink hover:opacity-90 text-on-primary rounded-md text-[14px] font-medium transition-opacity"
                    >
                      Initialize New Chat
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="relative">
                    <textarea
                      ref={textareaRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (prompt.trim() && !isProcessing) handleSubmit();
                        }
                      }}
                      rows={1}
                      placeholder="Input secondary query parameters…"
                      disabled={isProcessing || !session || showOnboarding || showAuth}
                      className="w-full pl-5 pr-14 py-3.5 bg-surface-card border border-hairline rounded-[28px] text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/8 disabled:opacity-50 disabled:cursor-not-allowed text-[16px] resize-none max-h-40 overflow-y-auto font-sans transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={!prompt.trim() || isProcessing || !session}
                      className="absolute right-3 bottom-3 h-9 w-9 bg-primary hover:bg-primary-active text-on-primary rounded-pill transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {isCurrentSessionProcessing ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                    </button>
                  </form>
                )}

                <p className="text-[12px] text-muted-soft font-mono mt-2.5 text-center">
                  Two Ollama experts plus an arbiter judge. Run the backend on port 5050 — Vite proxies{' '}
                  <code className="text-muted">/api</code> in development.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
};

export default App;
