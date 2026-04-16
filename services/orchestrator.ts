import { AgentRole, AgentResponse, DebateRound, FinalConsensus } from '../types';
import { generateAgentResponse, generateSummary, checkConsensus } from './geminiService';

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
      this.callAgent(AgentRole.ANALYST, `User Query: "${this.userPrompt}"\nProvide your initial answer. Format using proper markdown.`),
      this.callAgent(AgentRole.CREATIVE, `User Query: "${this.userPrompt}"\nProvide your initial answer. Format using proper markdown.`),
      this.callAgent(AgentRole.SKEPTIC, `User Query: "${this.userPrompt}"\nProvide your initial answer. Focus on identifying facts and verifying accuracy. Format using proper markdown.`),
    ]);

    const round1Summary = await generateSummary(round1Responses.map(r => r.content));
    this.rounds.push({ roundNumber: 1, responses: round1Responses, summary: round1Summary });
    this.onUpdate([...this.rounds]);

    // Check consensus after Round 1
    const r1Consensus = await checkConsensus(round1Responses.map(r => r.content));
    if (r1Consensus.isConsensus) {
      return {
        answer: r1Consensus.answer,
        reasoning: `Early consensus reached after Round 1: ${r1Consensus.reasoning}`,
        participatingAgents: [AgentRole.ANALYST, AgentRole.CREATIVE, AgentRole.SKEPTIC]
      };
    }

    // --- Round 2: Cross-Observation (The Debate) ---
    const round1Context = round1Responses.map(r => `${r.agentId} said: ${r.content}`).join('\n\n');

    const round2Responses = await Promise.all([
      this.callAgent(AgentRole.ANALYST, `User Query: "${this.userPrompt}"\n\nPrevious Round Perspectives:\n${round1Context}\n\nCritique these views and refine your answer if necessary. Format using proper markdown.`),
      this.callAgent(AgentRole.CREATIVE, `User Query: "${this.userPrompt}"\n\nPrevious Round Perspectives:\n${round1Context}\n\nReview these for tone and usefulness. Synthesize a better answer. Format using proper markdown.`),
      this.callAgent(AgentRole.SKEPTIC, `User Query: "${this.userPrompt}"\n\nPrevious Round Perspectives:\n${round1Context}\n\nIdentify any flaws or hallucinations in the previous round. Provide a safer, more accurate version. Format using proper markdown.`),
    ]);

    const round2Summary = await generateSummary(round2Responses.map(r => r.content));
    this.rounds.push({ roundNumber: 2, responses: round2Responses, summary: round2Summary });
    this.onUpdate([...this.rounds]);

    // Check consensus after Round 2
    const r2Consensus = await checkConsensus(round2Responses.map(r => r.content));
    if (r2Consensus.isConsensus) {
      return {
        answer: r2Consensus.answer,
        reasoning: `Consensus reached after Round 2 debate: ${r2Consensus.reasoning}`,
        participatingAgents: [AgentRole.ANALYST, AgentRole.CREATIVE, AgentRole.SKEPTIC]
      };
    }

    // --- Round 3: Final Validation and Alignment ---
    const round2Context = round2Responses.map(r => `${r.agentId} said: ${r.content}`).join('\n\n');
    const round3Responses = await Promise.all([
      this.callAgent(AgentRole.ANALYST, `User Query: "${this.userPrompt}"\n\nRound 2 Context:\n${round2Context}\n\nProvide your FINAL definitive answer, acknowledging remaining disagreements if any. Format using proper markdown.`),
      this.callAgent(AgentRole.CREATIVE, `User Query: "${this.userPrompt}"\n\nRound 2 Context:\n${round2Context}\n\nProvide your FINAL definitive answer, acknowledging remaining disagreements if any. Format using proper markdown.`),
      this.callAgent(AgentRole.SKEPTIC, `User Query: "${this.userPrompt}"\n\nRound 2 Context:\n${round2Context}\n\nProvide your FINAL definitive answer, acknowledging remaining disagreements if any. Format using proper markdown.`),
    ]);

    const round3Summary = await generateSummary(round3Responses.map(r => r.content));
    this.rounds.push({ roundNumber: 3, responses: round3Responses, summary: round3Summary });
    this.onUpdate([...this.rounds]);

    // Final Synthesis (Majority Vote processing)
    const synthesisInstruction = "You are the Arbiter. The agents have completed 3 rounds of debate without early consensus. Review their final responses and generate the definitive answer using a majority vote logic. Ensure the output is formatted cleanly in Markdown.";
    const debateHistory = `Round 3 (Final Agent Answers):\n${round3Responses.map(r => `${r.agentId}: ${r.content}`).join('\n')}`;
    
    const finalResult = await generateAgentResponse(MODEL_NAME, synthesisInstruction, `User Query: "${this.userPrompt}"\n\nDebate History:\n${debateHistory}\n\nProvide the Final Consensus Answer based on majority vote. Output ONLY the answer.`);

    return {
      answer: finalResult,
      reasoning: "Final resolution via majority vote synthesization after 3 full rounds of debate.",
      participatingAgents: [AgentRole.ANALYST, AgentRole.CREATIVE, AgentRole.SKEPTIC]
    };
  }
}