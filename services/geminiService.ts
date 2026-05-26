/**
 * Backend API client — Ollama/Express only (no Gemini).
 * In development, Vite proxies /api → http://localhost:${BACKEND_PORT}.
 * In production, set VITE_BACKEND_URL to your API origin (no trailing slash).
 */

const BACKEND_ORIGIN =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL
    ? String(import.meta.env.VITE_BACKEND_URL).replace(/\/+$/, '')
    : '';

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${BACKEND_ORIGIN}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend ${path} returned ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

export interface DebateHistoryRow {
  round: number;
  a: { answer: string };
  b: { answer: string };
}

export interface DebatePipelinePayload {
  status: 'success';
  architecture: string;
  models: { model_a: string; model_b: string; model_judge: string };
  debate_rounds: number;
  debate_history: DebateHistoryRow[];
  debate_result: {
    failed: boolean;
    failure_reason: string | null;
    consensus: boolean;
    /** Which round consensus was detected: 0 = initial (before debate), 1-N = debate round, null = no consensus */
    consensus_round: number | null;
    debate_final_summary: string;
    /** True when substantive agreement only detected after debate via semanticConsensusViaJudge. */
    post_debate_semantic_consensus?: boolean;
  };
  judge_result: {
    final_answer: string;
    decision_type?: string;
    winner?: string | null;
    reason?: string | null;
  };
}

/**
 * Runs the full two-expert debate + mandatory judge pipeline (blocking until complete).
 */
export async function fetchDebatePipeline(question: string): Promise<DebatePipelinePayload> {
  const data = await postJson<DebatePipelinePayload>('/api/chat/debate', { question });
  if (data.status !== 'success') {
    throw new Error('Debate finished without success status.');
  }
  return data;
}

/** GET /api/health — aligns with Jimmy backend route. */
export const checkBackendHealth = async (): Promise<{
  ok: boolean;
  configured: Record<string, string>;
  available: string[];
}> => {
  try {
    const url = `${BACKEND_ORIGIN}/api/health`;
    const res = await fetch(url);
    const data = await res.json();
    const ok = data.status === 'ok';
    const models = data.models ?? {};
    return {
      ok,
      configured: {
        model_a: String(models.model_a ?? ''),
        model_b: String(models.model_b ?? ''),
        model_judge: String(models.model_judge ?? ''),
      },
      available: Array.isArray(data.ollama_available) ? data.ollama_available : [],
    };
  } catch {
    return { ok: false, configured: {}, available: [] };
  }
};
