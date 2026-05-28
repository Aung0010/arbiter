// Agent role identifiers mapped to match the Supabase DB CHECK constraints.
// Display names are handled in AgentBadge.tsx.
export enum AgentRole {
  MODEL_A = 'expert_a', // Maps to DB expert_a
  MODEL_B = 'expert_b', // Maps to DB expert_b
  MODEL_C = 'judge',    // Maps to DB judge
  USER = 'user',        // Added for message storage
  SYSTEM = 'system'     // Added for message storage
}

export interface AgentResponse {
  agentId: AgentRole;
  content: string;
  confidenceScore?: number; // 0–100
  timestamp: number;
}

export interface DebateRound {
  roundNumber: number;
  responses: AgentResponse[];
  summary?: string;
}

export interface FinalConsensus {
  answer: string;
  reasoning: string;
  participatingAgents: AgentRole[];
  /** Optional subtitle in the verdict header instead of participatingAgents.length. */
  participantSummary?: string;
}

export interface ChatSession {
  id: string;
  user_id?: string;     // Added: Maps to Supabase auth.users
  title: string;
  timestamp: number;
  rounds: DebateRound[];
  finalResult: FinalConsensus | null;
  userPrompt: string;
  followUpCount: number; // Added: Tracks session length
}

export interface BackendHealth {
  ok: boolean;
  configured: Record<string, string>;  // { model_a: 'gemma3:12b', ... }
  available: string[];                 // Ollama model names currently loaded
}

export interface Feedback {
  sessionId: string;
  isPositive: boolean;
  comments?: string;
}
