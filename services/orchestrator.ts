import { AgentRole, AgentResponse, DebateRound, FinalConsensus } from '../types';
import { generateAgentResponse, generateSummary } from './geminiService';

// We use 'gemini-3-flash-preview' for speed and reasoning
const MODEL_NAME = 'gemini-3-flash-preview';

const AGENT_PERSONAS = {
  [AgentRole.ANALYST]: "You are The Analyst. You prioritize logic, mathematical accuracy, and step-by-step deduction. You are precise and concise. If you see errors in others' reasoning, correct them factually.",
  [AgentRole.CREATIVE]: "You are The Creative. You prioritize user intent, nuance, and readability. You look for the 'why' behind the question. You ensure the answer is helpful and accessible.",
  [AgentRole.SKEPTIC]: "You are The Skeptic. You are a critical thinker. You check for hallucinations, safety risks, and assumptions. You play devil's advocate to ensure the final answer is robust."
};

/**
 * Orchestrates the "1-by-1 Gentleman" debate protocol.
 */
export class DebateOrchestrator {
  private userPrompt: string;
  private rounds: DebateRound[] = [];
  private onUpdate: (rounds: DebateRound[]) => void;

  constructor(userPrompt: string, onUpdate: (rounds: DebateRound[]) => void) {
    this.userPrompt = userPrompt;
    this.onUpdate = onUpdate;
  }

  private async callAgent(role: AgentRole, context: string): Promise<AgentResponse> {
    const instruction = AGENT_PERSONAS[role];
    const content = await generateAgentResponse(MODEL_NAME, instruction, context);
    
    return {
      agentId: role,
      content,
      timestamp: Date.now()
    };
  }

  public async runDebate(): Promise<FinalConsensus> {
    // --- Round 1: Independent Generation ---
    const round1Responses = await Promise.all([
      this.callAgent(AgentRole.ANALYST, `User Query: "${this.userPrompt}"\nProvide your initial answer.`),
      this.callAgent(AgentRole.CREATIVE, `User Query: "${this.userPrompt}"\nProvide your initial answer.`),
      this.callAgent(AgentRole.SKEPTIC, `User Query: "${this.userPrompt}"\nProvide your initial answer.`),
    ]);

    const round1Summary = await generateSummary(round1Responses.map(r => r.content));
    
    const round1: DebateRound = {
      roundNumber: 1,
      responses: round1Responses,
      summary: round1Summary
    };
    this.rounds.push(round1);
    this.onUpdate([...this.rounds]);

    // --- Round 2: Cross-Observation (The Debate) ---
    // Prepare context for agents to see each other's work
    const round1Context = round1Responses.map(r => `${r.agentId} said: ${r.content}`).join('\n\n');

    const round2Responses = await Promise.all([
      this.callAgent(AgentRole.ANALYST, `User Query: "${this.userPrompt}"\n\nPrevious Round Perspectives:\n${round1Context}\n\nCritique these views and refine your answer if necessary. Stick to facts.`),
      this.callAgent(AgentRole.CREATIVE, `User Query: "${this.userPrompt}"\n\nPrevious Round Perspectives:\n${round1Context}\n\nReview these for tone and usefulness. Synthesize a better answer.`),
      this.callAgent(AgentRole.SKEPTIC, `User Query: "${this.userPrompt}"\n\nPrevious Round Perspectives:\n${round1Context}\n\nIdentify any flaws or hallucinations in the previous round. Provide a safer, more accurate version.`),
    ]);

    const round2Summary = await generateSummary(round2Responses.map(r => r.content));

    const round2: DebateRound = {
      roundNumber: 2,
      responses: round2Responses,
      summary: round2Summary
    };
    this.rounds.push(round2);
    this.onUpdate([...this.rounds]);

    // --- Round 3 (Finalization): Synthesis ---
    // In a full implementation, we might have a dynamic check here. 
    // If consensus is reached, stop. For this prototype, we do a final synthesis pass.
    
    const synthesisInstruction = "You are the Arbiter. Review the debate history and produce the final, definitive answer. It should be the best combination of logic, creativity, and safety.";
    const debateHistory = `Round 1:\n${round1Context}\n\nRound 2:\n${round2Responses.map(r => `${r.agentId}: ${r.content}`).join('\n')}`;
    
    const finalResult = await generateAgentResponse(MODEL_NAME, synthesisInstruction, `User Query: "${this.userPrompt}"\n\nDebate History:\n${debateHistory}\n\nProvide the Final Consensus Answer.`);

    return {
      answer: finalResult,
      reasoning: "Consensus reached after 2 rounds of heterogeneous debate and critique.",
      participatingAgents: [AgentRole.ANALYST, AgentRole.CREATIVE, AgentRole.SKEPTIC]
    };
  }
}