import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Sidebar from './components/Sidebar';
import DebateRoundView from './components/DebateRoundView';
import FinalAnswer from './components/FinalAnswer';
import { ChatSession, DebateRound, FinalConsensus } from './types';
import { DebateOrchestrator } from './services/orchestrator';

// Define simulated uuid here to avoid external dependency issues in environment
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const App: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Load history from local storage
  useEffect(() => {
    const saved = localStorage.getItem('arbiter_sessions');
    if (saved) {
      setSessions(JSON.parse(saved));
    }
  }, []);

  // Save history
  useEffect(() => {
    localStorage.setItem('arbiter_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  const scrollToBottom = () => {
      setTimeout(() => {
        scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setPrompt('');
    setIsSidebarOpen(false);
  };

  const updateSession = (id: string, updates: Partial<ChatSession>) => {
      setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isProcessing) return;

    const userQuery = prompt.trim();
    setPrompt('');
    setIsProcessing(true);

    let currentSessionId = activeSessionId;

    if (!currentSessionId) {
      const newSession: ChatSession = {
        id: generateId(),
        title: userQuery.length > 30 ? userQuery.substring(0, 30) + '...' : userQuery,
        timestamp: Date.now(),
        rounds: [],
        finalResult: null,
        userPrompt: userQuery
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      currentSessionId = newSession.id;
    } else {
        // Regeneration logic handling
        // We actually just clear the old result and re-run
        updateSession(currentSessionId, { 
            rounds: [], 
            finalResult: null,
            userPrompt: userQuery // Should ideally handle multi-turn, but scope is 1-shot debate
        });
    }

    // Initialize Orchestrator
    const orchestrator = new DebateOrchestrator(userQuery, (updatedRounds) => {
        if(currentSessionId) {
            updateSession(currentSessionId, { rounds: updatedRounds });
            scrollToBottom();
        }
    });

    try {
      const finalConsensus = await orchestrator.runDebate();
      if(currentSessionId) {
          updateSession(currentSessionId, { finalResult: finalConsensus });
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred during the debate process.");
    } finally {
      setIsProcessing(false);
      scrollToBottom();
    }
  };

  return (
    <div className="flex h-screen bg-base-DEFAULT overflow-hidden font-sans text-slate-custom">
      <Sidebar 
        sessions={sessions} 
        activeSessionId={activeSessionId}
        onSelectSession={(id) => { setActiveSessionId(id); setIsSidebarOpen(false); }}
        onNewChat={handleNewChat}
        isOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      <div className="flex-1 flex flex-col h-full relative">
        {/* Header (Mobile) */}
        <div className="md:hidden bg-base-panel border-b border-base-divider p-4 flex items-center justify-between z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="text-slate-custom">
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
             </svg>
          </button>
          <span className="font-semibold text-brand-navy">Arbiter</span>
          <div className="w-6"></div> 
        </div>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <div className="max-w-4xl mx-auto">
            {!activeSession ? (
              <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-6">
                <div className="w-16 h-16 bg-layer-white border border-base-divider rounded shadow-sm flex items-center justify-center text-brand-navy mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h1 className="text-3xl font-semibold text-brand-navy tracking-tight">Arbiter Console</h1>
                <p className="text-base text-slate-custom max-w-md">
                  A multi-agent consensus protocol incorporating structured logical, creative, and critical analysis.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl mt-8">
                    <div className="p-4 bg-layer-white border border-base-divider rounded shadow-sm text-sm text-slate-custom text-left">
                        <span className="font-medium text-brand-navy block mb-1">Evaluate Frameworks</span>
                        "Compare Python vs Go for backend..."
                    </div>
                    <div className="p-4 bg-layer-white border border-base-divider rounded shadow-sm text-sm text-slate-custom text-left">
                        <span className="font-medium text-brand-navy block mb-1">Abstract Concepts</span>
                        "Explain quantum entanglement simply..."
                    </div>
                    <div className="p-4 bg-layer-white border border-base-divider rounded shadow-sm text-sm text-slate-custom text-left">
                        <span className="font-medium text-brand-navy block mb-1">Risk Assessment</span>
                        "Draft a sensitive email to a client..."
                    </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-20">
                <div className="bg-layer-white border border-base-divider rounded p-6 mb-8 shadow-sm">
                    <h2 className="text-xs font-semibold text-brand-navy uppercase tracking-wider mb-2">User Query</h2>
                    <p className="text-base text-slate-custom font-medium">{activeSession.userPrompt}</p>
                </div>

                {/* Processing State / Rounds */}
                {activeSession.rounds.length > 0 && (
                    <div className="flex items-center gap-2 mb-4">
                        <div className="h-px bg-base-divider flex-1"></div>
                        <span className="text-xs font-semibold text-brand-navy uppercase">Execution Log</span>
                        <div className="h-px bg-base-divider flex-1"></div>
                    </div>
                )}

                {activeSession.rounds.map((round, idx) => (
                  <DebateRoundView 
                    key={round.roundNumber} 
                    round={round} 
                    isLatest={idx === activeSession.rounds.length - 1 && !activeSession.finalResult}
                  />
                ))}

                {isProcessing && !activeSession.finalResult && (
                   <div className="flex items-center justify-center p-8 bg-layer-white border border-base-divider rounded shadow-sm">
                       <div className="flex space-x-2 animate-pulse">
                           <div className="w-2 h-2 bg-brand-azure rounded-sm"></div>
                           <div className="w-2 h-2 bg-brand-azure rounded-sm"></div>
                           <div className="w-2 h-2 bg-brand-azure rounded-sm"></div>
                       </div>
                       <span className="ml-3 text-sm text-slate-custom font-medium">Model consensus pending...</span>
                   </div>
                )}

                {activeSession.finalResult && (
                  <FinalAnswer 
                    consensus={activeSession.finalResult} 
                    onRegenerate={() => {
                        setPrompt(activeSession.userPrompt);
                        // Trigger logic handled via useEffect or direct call, simplified here by resetting state for demo
                        alert("For regeneration, simply click 'Send' again with the prompt pre-filled.");
                    }}
                  />
                )}
                
                <div ref={scrollEndRef} />
              </div>
            )}
          </div>
        </main>

        {/* Input Area */}
        <div className="border-t border-base-divider bg-base-DEFAULT p-4 md:p-6">
          <div className="max-w-4xl mx-auto relative">
            <form onSubmit={handleSubmit} className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={activeSessionId ? "Input secondary query parameters..." : "Initialize new protocol execution..."}
                disabled={isProcessing}
                className="w-full pl-4 pr-14 py-3 bg-layer-white border border-base-divider rounded text-slate-custom placeholder-slate-400 focus:outline-none focus:border-brand-azure shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
              />
              <button
                type="submit"
                disabled={!prompt.trim() || isProcessing}
                className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-brand-navy hover:brightness-110 text-core-inverse rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isProcessing ? (
                   <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                ) : (
                  <svg className="w-4 h-4 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </form>
            <div className="text-center mt-3">
                 <p className="text-xs text-slate-custom">Powered by Qwen2.4, Gemma3, and Ministral3.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;