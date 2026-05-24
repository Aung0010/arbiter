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

    return hist.map((row, idx) => {
      const ts = Date.now();
      const responses: AgentResponse[] = [
        { agentId: AgentRole.MODEL_A, content: row.a.answer, timestamp: ts },
        { agentId: AgentRole.MODEL_B, content: row.b.answer, timestamp: ts },
      ];

      // Phase-local copy only: pinning debate_final_summary on the last accordion row made the UI
      // falsely claim "no consensus" even when expert bodies clearly agreed paragraph-for-paragraph.
      const summary =
        idx === 0
          ? 'Independent expert outputs.'
          : idx === hist.length - 1
            ? 'Final expert replies forwarded to arbiter verdict.'
            : 'Cross-examination between experts.';

      return {
        roundNumber: row.round + 1,
        responses,
        summary,
      };
    });
  }

  private mapFinalConsensus(payload: DebatePipelinePayload): FinalConsensus {
    const j = payload.judge_result ?? ({} as DebatePipelinePayload['judge_result']);
    const line = `${payload.models.model_a} vs ${payload.models.model_b}; judge ${payload.models.model_judge}`;
    const bits = [
      line,
      `Debate consensus: ${payload.debate_result.consensus}`,
      payload.debate_result.post_debate_semantic_consensus
        ? 'Substantive convergence confirmed by judge after debate (answers were not identical as raw text).'
        : null,
      j.decision_type ? `Judge: ${j.decision_type}` : null,
      j.winner != null && String(j.winner).length ? `Winner: ${j.winner}` : null,
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
