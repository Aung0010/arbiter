// Agent role identifiers match the backend model slot keys (model_a / model_b / model_c).
// Display names are handled in AgentBadge.tsx.
export enum AgentRole {
  MODEL_A = 'model_a',
  MODEL_B = 'model_b',
  MODEL_C = 'model_c',
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
  title: string;
  timestamp: number;
  rounds: DebateRound[];
  finalResult: FinalConsensus | null;
  userPrompt: string;
}

export interface BackendHealth {
  ok: boolean;
  configured: Record<string, string>;  // { model_a: 'gemma3:12b', ... }
  available: string[];                  // Ollama model names currently loaded
}

export interface Feedback {
  sessionId: string;
  isPositive: boolean;
  comments?: string;
}