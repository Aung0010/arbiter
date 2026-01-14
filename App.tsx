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
    <div className="flex h-screen bg-slate-50 overflow-hidden">
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
        <div className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600">
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
             </svg>
          </button>
          <span className="font-semibold text-slate-800">Arbiter</span>
          <div className="w-6"></div> 
        </div>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <div className="max-w-4xl mx-auto">
            {!activeSession ? (
              <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-6">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-xl flex items-center justify-center text-white mb-4">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                  </svg>
                </div>
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Arbiter</h1>
                <p className="text-lg text-slate-500 max-w-md">
                  A multi-agent system where <span className="text-blue-600 font-medium">Logic</span>, <span className="text-purple-600 font-medium">Creativity</span>, and <span className="text-emerald-600 font-medium">Safety</span> debate to give you the best answer.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl mt-8">
                    <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm text-sm text-slate-600">
                        "Compare Python vs Go for backend..."
                    </div>
                    <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm text-sm text-slate-600">
                        "Explain quantum entanglement simply..."
                    </div>
                    <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm text-sm text-slate-600">
                        "Draft a sensitive email to a client..."
                    </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-20">
                <div className="bg-slate-100 rounded-xl p-6 mb-8">
                    <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">User Prompt</h2>
                    <p className="text-lg text-slate-900 font-medium">{activeSession.userPrompt}</p>
                </div>

                {/* Processing State / Rounds */}
                {activeSession.rounds.length > 0 && (
                    <div className="flex items-center gap-2 mb-4">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-xs font-semibold text-slate-400 uppercase">Debate Protocol</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
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
                   <div className="flex items-center justify-center p-8">
                       <div className="flex space-x-2 animate-pulse">
                           <div className="w-3 h-3 bg-indigo-400 rounded-full"></div>
                           <div className="w-3 h-3 bg-purple-400 rounded-full"></div>
                           <div className="w-3 h-3 bg-emerald-400 rounded-full"></div>
                       </div>
                       <span className="ml-3 text-sm text-slate-500 font-medium">Agents are deliberating...</span>
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
        <div className="border-t border-slate-200 bg-white p-4 md:p-6">
          <div className="max-w-4xl mx-auto relative">
            <form onSubmit={handleSubmit} className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={activeSessionId ? "Ask a follow-up or create a new topic..." : "Enter your prompt for the agents..."}
                disabled={isProcessing}
                className="w-full pl-6 pr-14 py-4 bg-slate-50 border border-slate-200 rounded-full text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              />
              <button
                type="submit"
                disabled={!prompt.trim() || isProcessing}
                className="absolute right-2 top-2 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                   <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                ) : (
                  <svg className="w-5 h-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </form>
            <div className="text-center mt-2">
                 <p className="text-xs text-slate-400">Powered by Claude, GPT, and Gemini for best Results.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;