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
    /** True when loop ended with one more semanticConsensusViaJudge after all rounds. */
    post_debate_semantic_consensus?: boolean;
    /** Debate round index (1..N) where judge substantive check ended debate early; null otherwise. */
    mid_debate_judge_consensus_round?: number | null;
    round_zero_consensus_source?: 'none' | 'normalized_text' | 'judge_semantic';
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

/**
 * Streaming version of the debate pipeline via SSE.
 * `onRound` fires as soon as each debate round completes (round 0 = initial, 1-N = debate turns).
 * `onComplete` fires once with the full payload after the judge verdict is ready.
 *
 * Rejects on network errors or if the server sends an `error` event.
 */
export async function streamDebatePipeline(
  question: string,
  onRound: (row: DebateHistoryRow, roundIndex: number) => void,
  onComplete: (payload: DebatePipelinePayload) => void,
): Promise<void> {
  const url = `${BACKEND_ORIGIN}/api/chat/debate/stream`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend /api/chat/debate/stream returned ${res.status}: ${text.slice(0, 400)}`);
  }

  if (!res.body) {
    throw new Error('Streaming response body is null — browser may not support ReadableStream.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let roundIndex = 0;

  // SSE lines are separated by \n\n (event blocks).
  // Each block has: "event: <name>\ndata: <json>\n"
  const processBuffer = () => {
    const blocks = buffer.split('\n\n');
    // The last element may be an incomplete block — keep it in the buffer.
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      if (!block.trim()) continue;
      const lines = block.split('\n');
      let eventName = 'message';
      let dataLine = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) eventName = line.slice('event: '.length).trim();
        else if (line.startsWith('data: ')) dataLine = line.slice('data: '.length).trim();
      }

      if (!dataLine) continue;

      try {
        const parsed = JSON.parse(dataLine);
        if (eventName === 'round') {
          onRound(parsed as DebateHistoryRow, roundIndex++);
        } else if (eventName === 'complete') {
          onComplete(parsed as DebatePipelinePayload);
        } else if (eventName === 'error') {
          throw new Error(`Server error: ${parsed.message ?? 'unknown'}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Server error:')) throw e;
        console.warn('[streamDebatePipeline] Failed to parse SSE block:', block, e);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    processBuffer();
  }
  // Flush any remaining bytes
  buffer += decoder.decode();
  processBuffer();
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
