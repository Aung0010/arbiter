import { AgentRole, AgentResponse, DebateRound, FinalConsensus } from '../types';
import { DebatePipelinePayload, fetchDebatePipeline } from './geminiService';

/**
 * Bridges the Jimmy two-expert + judge REST pipeline to DebateRound / FinalConsensus shapes.
 * All rounds arrive when the backend finishes — the UI stays responsive via isProcessing state.
 */
export class DebateOrchestrator {
  private userPrompt: string;
  private onUpdate: (rounds: DebateRound[]) => void;

  constructor(userPrompt: string, onUpdate: (rounds: DebateRound[]) => void) {
    this.userPrompt = userPrompt;
    this.onUpdate = onUpdate;
  }

  private mapPayloadToRounds(payload: DebatePipelinePayload): DebateRound[] {
    const hist = Array.isArray(payload.debate_history) ? payload.debate_history : [];
    const consensusRound = payload.debate_result?.consensus_round ?? null;
    const totalRounds = hist.length;

    return hist.map((row, idx) => {
      const ts = Date.now();
      const responses: AgentResponse[] = [
        { agentId: AgentRole.MODEL_A, content: row.a.answer, timestamp: ts },
        { agentId: AgentRole.MODEL_B, content: row.b.answer, timestamp: ts },
      ];

      let summary: string;
      if (row.round === 0) {
        summary = 'Independent expert outputs — no cross-examination yet.';
      } else if (consensusRound !== null && row.round === consensusRound) {
        // This is the round where consensus was detected → terminal round
        summary = payload.debate_result.post_debate_semantic_consensus
          ? `⚑ Consensus reached in round ${row.round} (semantic agreement confirmed by judge — same conclusion, different phrasing).`
          : `⚑ Consensus reached in round ${row.round} (exact agreement).`;
      } else if (idx === totalRounds - 1 && consensusRound === null) {
        // Last round, no consensus → judge arbitrates
        summary = `Final debate round. No consensus reached — arbiter judge will produce the definitive answer.`;
      } else {
        summary = `Cross-examination round ${row.round} — experts refining positions.`;
      }

      return {
        roundNumber: row.round + 1,
        responses,
        summary,
      };
    });
  }

  private mapFinalConsensus(payload: DebatePipelinePayload): FinalConsensus {
    const j = payload.judge_result ?? ({} as DebatePipelinePayload['judge_result']);
    const dr = payload.debate_result;
    const line = `${payload.models.model_a} vs ${payload.models.model_b}; judge ${payload.models.model_judge}`;

    // Build a human-readable termination description
    let terminationDesc: string;
    if (dr.consensus_round === 0) {
      terminationDesc = dr.post_debate_semantic_consensus
        ? 'Consensus at Round 0 (semantic match — judge confirmed same conclusion before debate began).'
        : 'Consensus at Round 0 (exact agreement before debate was needed).';
    } else if (dr.consensus_round !== null) {
      terminationDesc = dr.post_debate_semantic_consensus
        ? `Consensus at Round ${dr.consensus_round} (semantic match — judge confirmed same substantive conclusion).`
        : `Consensus at Round ${dr.consensus_round} (exact agreement reached during debate).`;
    } else {
      terminationDesc = `No consensus after ${payload.debate_rounds} rounds — judge arbitrated.`;
    }

    const bits = [
      line,
      terminationDesc,
      j.decision_type ? `Judge decision: ${j.decision_type}` : null,
      j.winner != null && String(j.winner).length ? `Supporting: ${j.winner}` : null,
      j.reason ? String(j.reason) : null,
    ].filter(Boolean) as string[];

    return {
      answer: (j.final_answer && j.final_answer.trim()) || '',
      reasoning: bits.join(' · '),
      participatingAgents: [AgentRole.MODEL_A, AgentRole.MODEL_B, AgentRole.MODEL_C],
      participantSummary: 'Experts · Arbiter Judge',
    };
  }

  public async runDebate(): Promise<FinalConsensus> {
    const payload = await fetchDebatePipeline(this.userPrompt);
    const rounds = this.mapPayloadToRounds(payload);
    this.onUpdate(rounds);
    return this.mapFinalConsensus(payload);
  }
}
