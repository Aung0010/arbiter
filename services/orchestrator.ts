import { AgentRole, AgentResponse, DebateRound, FinalConsensus } from '../types';
import {
  streamDebate,
  generateSummary,
  checkConsensus,
  StreamedRound,
} from './geminiService';

// Map backend model slot keys → frontend AgentRole enum values
const SLOT_TO_ROLE: Record<string, AgentRole> = {
  model_a: AgentRole.MODEL_A,
  model_b: AgentRole.MODEL_B,
  model_c: AgentRole.MODEL_C,
};

/**
 * DebateOrchestrator
 *
 * Streams the MCC debate from the backend and translates each incoming
 * round into the existing DebateRound / AgentResponse shape so the UI
 * components work without any changes.
 *
 * Consensus is checked after each round; if reached, the debate short-circuits
 * and returns immediately — identical to the previous behaviour, but now driven
 * by Ollama instead of the Gemini API.
 */
export class DebateOrchestrator {
  private userPrompt: string;
  private rounds: DebateRound[] = [];
  private onUpdate: (rounds: DebateRound[]) => void;

  constructor(userPrompt: string, onUpdate: (rounds: DebateRound[]) => void) {
    this.userPrompt = userPrompt;
    this.onUpdate = onUpdate;
  }

  public async runDebate(): Promise<FinalConsensus> {
    return new Promise<FinalConsensus>((resolve, reject) => {
      // Accumulator — may resolve early via consensus check
      let resolved = false;
      let pendingFinal: { answer: string; reasoning: string } | null = null;

      const handleRound = async (streamedRound: StreamedRound) => {
        if (resolved) return;

        // Map backend responses onto AgentResponse[]
        const responses: AgentResponse[] = streamedRound.responses.map(r => ({
          agentId: SLOT_TO_ROLE[r.agentId] ?? (r.agentId as AgentRole),
          content: r.content,
          timestamp: r.timestamp,
        }));

        // Generate a 1-sentence summary of this round from the backend
        const summary = await generateSummary(responses.map(r => r.content)).catch(() => '');

        const round: DebateRound = {
          roundNumber: streamedRound.round,
          responses,
          summary,
        };

        this.rounds.push(round);
        this.onUpdate([...this.rounds]);

        // --- Early-exit consensus check ---
        const perspectives = responses.map(r => r.content);
        const consensus = await checkConsensus(perspectives).catch(() => ({
          isConsensus: false,
          answer: '',
          reasoning: '',
        }));

        if (consensus.isConsensus && consensus.answer) {
          resolved = true;
          resolve({
            answer: consensus.answer,
            reasoning: `Consensus reached after Round ${streamedRound.round}: ${consensus.reasoning}`,
            participatingAgents: [AgentRole.MODEL_A, AgentRole.MODEL_B, AgentRole.MODEL_C],
          });
        }
      };

      const handleFinal = (final: { answer: string; reasoning: string }) => {
        // Store for use if consensus never fired
        pendingFinal = final;
      };

      const handleDone = () => {
        if (resolved) return;
        if (pendingFinal) {
          resolved = true;
          resolve({
            answer: pendingFinal.answer,
            reasoning: pendingFinal.reasoning,
            participatingAgents: [AgentRole.MODEL_A, AgentRole.MODEL_B, AgentRole.MODEL_C],
          });
        } else {
          reject(new Error('Debate stream ended without a final answer.'));
        }
      };

      const handleError = (msg: string) => {
        if (!resolved) {
          resolved = true;
          reject(new Error(msg));
        }
      };

      // Kick off the SSE stream — rounds arrive asynchronously
      streamDebate(
        this.userPrompt,
        (_statusMsg, _round) => {
          // Status messages are informational; nothing to do in the orchestrator
        },
        (streamedRound) => {
          // We must await the async handleRound but the SSE callback is sync.
          // Fire-and-forget is intentional here; the SSE reader is sequential
          // so we won't get the next round event until Node finishes this one.
          handleRound(streamedRound).catch(handleError);
        },
        handleFinal,
        handleError,
      ).then(handleDone).catch(handleError);
    });
  }
}