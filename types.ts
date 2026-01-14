export enum AgentRole {
  ANALYST = 'Analyst', // Logic/Math focused (Claude)
  CREATIVE = 'Creative', // Context/Nuance focused (GPT)
  SKEPTIC = 'Skeptic'    // Critical/Safety focused (Gemini)
}

export interface AgentResponse {
  agentId: AgentRole;
  content: string;
  confidenceScore?: number; // 0-100
  timestamp: number;
}

export interface DebateRound {
  roundNumber: number;
  responses: AgentResponse[];
  summary?: string; // Orchestrator's summary of this round
}

export interface FinalConsensus {
  answer: string;
  reasoning: string; // How the decision was reached (e.g., "Majority vote")
  participatingAgents: AgentRole[];
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  rounds: DebateRound[];
  finalResult: FinalConsensus | null;
  userPrompt: string;
}

export interface Feedback {
  sessionId: string;
  isPositive: boolean;
  comments?: string;
}