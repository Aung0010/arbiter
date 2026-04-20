/**
 * ollamaService.ts
 * All communication with the Ollama/Express backend.
 * No Google API keys — all inference runs locally via Ollama.
 */

// In development, Vite proxies /api → http://localhost:5050
// In production, set VITE_BACKEND_URL in your .env
const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL ?? '';

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend ${path} returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// generateSummary — calls POST /api/chat/summarize
// ---------------------------------------------------------------------------
export const generateSummary = async (perspectives: string[]): Promise<string> => {
  try {
    const data = await post<{ summary: string }>('/api/chat/summarize', { perspectives });
    return data.summary ?? 'Consolidating perspectives...';
  } catch (e) {
    console.error('generateSummary error:', e);
    return 'Consolidating perspectives...';
  }
};

// ---------------------------------------------------------------------------
// checkConsensus — calls POST /api/chat/consensus
// ---------------------------------------------------------------------------
export const checkConsensus = async (
  perspectives: string[]
): Promise<{ isConsensus: boolean; answer: string; reasoning: string }> => {
  try {
    const data = await post<{ isConsensus: boolean; answer: string; reasoning: string }>(
      '/api/chat/consensus',
      { perspectives }
    );
    return {
      isConsensus: Boolean(data.isConsensus),
      answer: data.answer ?? '',
      reasoning: data.reasoning ?? '',
    };
  } catch (e) {
    console.error('checkConsensus error:', e);
    return { isConsensus: false, answer: '', reasoning: 'Error checking consensus.' };
  }
};

// ---------------------------------------------------------------------------
// streamDebate — calls POST /api/chat/debate/stream (SSE)
// Calls onRound for each completed round, then onFinal with the synthesis.
// ---------------------------------------------------------------------------
export interface StreamedRound {
  round: number;
  responses: Array<{ agentId: string; content: string; timestamp: number }>;
}

export interface StreamedFinal {
  answer: string;
  reasoning: string;
  models: Record<string, string>;
}

export const streamDebate = async (
  question: string,
  onStatus: (msg: string, round: number) => void,
  onRound: (round: StreamedRound) => void,
  onFinal: (final: StreamedFinal) => void,
  onError: (msg: string) => void,
): Promise<void> => {
  const res = await fetch(`${BACKEND}/api/chat/debate/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => 'Unknown error');
    onError(`Backend error ${res.status}: ${text.slice(0, 200)}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by double-newlines
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const lines = part.split('\n');
      let event = '';
      let dataStr = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        if (line.startsWith('data: '))  dataStr = line.slice(6).trim();
      }

      if (!event || !dataStr) continue;

      try {
        const payload = JSON.parse(dataStr);
        if (event === 'status') onStatus(payload.message, payload.round);
        if (event === 'round')  onRound(payload);
        if (event === 'final')  onFinal(payload);
        if (event === 'error')  onError(payload.message);
      } catch {
        // ignore malformed SSE chunk
      }
    }
  }
};

// ---------------------------------------------------------------------------
// checkBackendHealth — convenience for startup validation
// ---------------------------------------------------------------------------
export const checkBackendHealth = async (): Promise<{
  ok: boolean;
  configured: Record<string, string>;
  available: string[];
}> => {
  try {
    const res = await fetch(`${BACKEND}/api/health`);
    const data = await res.json();
    return {
      ok: data.status === 'ok',
      configured: data.configured ?? {},
      available: data.ollama_available ?? [],
    };
  } catch {
    return { ok: false, configured: {}, available: [] };
  }
};