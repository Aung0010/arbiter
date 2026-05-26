import { AgentRole, AgentResponse, DebateRound, FinalConsensus } from '../types';
import { DebatePipelinePayload, DebateHistoryRow, streamDebatePipeline } from './geminiService';

function judgeSemanticsMatchedConsensus(dr: DebatePipelinePayload['debate_result']): boolean {
  if (dr.post_debate_semantic_consensus) return true;
  if (
    dr.mid_debate_judge_consensus_round != null &&
    dr.consensus_round === dr.mid_debate_judge_consensus_round
  ) {
    return true;
  }
  if (dr.consensus_round === 0 && dr.round_zero_consensus_source === 'judge_semantic') {
    return true;
  }
  return false;
}

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

  private mapFinalConsensus(payload: DebatePipelinePayload): FinalConsensus {
    const j = payload.judge_result ?? ({} as DebatePipelinePayload['judge_result']);
    const dr = payload.debate_result;
    const line = `${payload.models.model_a} vs ${payload.models.model_b}; judge ${payload.models.model_judge}`;

    const semanticsFlag = judgeSemanticsMatchedConsensus(dr);

    let terminationDesc: string;
    if (dr.consensus_round === 0) {
      terminationDesc = semanticsFlag
        ? 'Consensus at Round 0 (semantic match — judge confirmed same conclusion before debate began).'
        : 'Consensus at Round 0 (exact agreement before debate was needed).';
    } else if (dr.consensus_round !== null) {
      terminationDesc = semanticsFlag
        ? `Consensus at Round ${dr.consensus_round} (semantic match — judge confirmed same substantive conclusion).`
        : `Consensus at Round ${dr.consensus_round} (exact agreement reached during debate).`;
    } else {
      terminationDesc = `No consensus after ${payload.debate_rounds} rounds — judge arbitrated.`;
    }

    const bits = [
      line,
      `Structured consensus flag: ${dr.consensus}`,
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

  /**
   * Maps a single raw history row to a DebateRound with a provisional summary
   * (used while the debate is still in progress — we don't yet have consensus info).
   */
  private mapRowProvisional(row: DebateHistoryRow, roundIndex: number): DebateRound {
    const ts = Date.now();
    const responses: AgentResponse[] = [
      { agentId: AgentRole.MODEL_A, content: row.a.answer, timestamp: ts },
      { agentId: AgentRole.MODEL_B, content: row.b.answer, timestamp: ts },
    ];
    const summary =
      row.round === 0
        ? 'Independent expert outputs — awaiting cross-examination.'
        : `Cross-examination round ${row.round} — debate in progress…`;
    return { roundNumber: row.round + 1, responses, summary };
  }

  /**
   * Finalizes all round summaries once the complete payload is available.
   * Mutates the rounds array in-place so the same array reference is reused.
   */
  private finalizeRoundSummaries(
    rounds: DebateRound[],
    payload: DebatePipelinePayload,
  ): void {
    const dr = payload.debate_result;
    const consensusRound = dr?.consensus_round ?? null;
    const semanticsFlag = judgeSemanticsMatchedConsensus(dr);
    const totalRounds = rounds.length;

    rounds.forEach((round, idx) => {
      const rawRound = round.roundNumber - 1; // round.roundNumber is 1-indexed
      if (rawRound === 0) {
        round.summary = 'Independent expert outputs — no cross-examination yet.';
      } else if (consensusRound !== null && rawRound === consensusRound) {
        round.summary = semanticsFlag
          ? `⚑ Consensus reached in round ${rawRound} (semantic agreement confirmed by judge — same conclusion, different phrasing).`
          : `⚑ Consensus reached in round ${rawRound} (exact agreement).`;
      } else if (idx === totalRounds - 1 && consensusRound === null) {
        round.summary =
          'Final debate round. No consensus reached — arbiter judge produced the definitive answer.';
      } else {
        round.summary = `Cross-examination round ${rawRound} — experts refining positions.`;
      }
    });
  }

  public async runDebate(): Promise<FinalConsensus> {
    // Accumulate rounds progressively — each SSE 'round' event appends one entry.
    const rounds: DebateRound[] = [];
    let finalPayload: DebatePipelinePayload | null = null;

    await streamDebatePipeline(
      this.userPrompt,

      // onRound: fired immediately after each debate round completes on the server.
      (row: DebateHistoryRow, _roundIndex: number) => {
        const debateRound = this.mapRowProvisional(row, rounds.length);
        rounds.push(debateRound);
        // Spread the array so React sees a new reference and re-renders.
        this.onUpdate([...rounds]);
      },

      // onComplete: fired once — contains the full payload with judge verdict + consensus metadata.
      (payload: DebatePipelinePayload) => {
        finalPayload = payload;
        // Finalize summaries now that we know which round reached consensus.
        this.finalizeRoundSummaries(rounds, payload);
        this.onUpdate([...rounds]);
      },
    );

    if (!finalPayload) {
      throw new Error('Debate stream ended without a complete event from the server.');
    }

    return this.mapFinalConsensus(finalPayload);
  }
}
