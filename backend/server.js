const express = require('express');
const cors = require('cors');

// ---------------------------------------------------------------------------
// Config — override via environment variables
// ---------------------------------------------------------------------------
const OLLAMA_URL    = process.env.OLLAMA_URL    || 'http://127.0.0.1:11434/api/generate';
const OLLAMA_TAGS   = process.env.OLLAMA_TAGS   || 'http://127.0.0.1:11434/api/tags';
const MODEL_A       = process.env.MODEL_A       || 'gemma3:12b';
const MODEL_B       = process.env.MODEL_B       || 'mistral:latest';
const MODEL_C       = process.env.MODEL_C       || 'qwen2.5:latest';
const DEBATE_ROUNDS = parseInt(process.env.DEBATE_ROUNDS  || '3', 10);
const TIMEOUT_MS    = parseInt(process.env.OLLAMA_TIMEOUT_MS || '600000', 10);
const PORT          = parseInt(process.env.PORT || '5050', 10);

// Human-friendly labels for each model slot
const MODEL_LABELS = {
  model_a: MODEL_A,
  model_b: MODEL_B,
  model_c: MODEL_C,
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

// ---------------------------------------------------------------------------
// Core Ollama caller
// ---------------------------------------------------------------------------
async function callOllama(model, prompt) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0 } }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Ollama HTTP ${resp.status}: ${errText.slice(0, 500)}`);
    }
    const data = await resp.json();
    return String(data.response || '').trim();
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------
function buildInitialPrompt(question, modelLabel) {
  return `You are one of three independent expert AI models (${modelLabel}) answering the same question.
Give your own best answer. You will later see what the other two models said.

Question:
${question}

Your answer (use markdown formatting):`;
}

function buildDebateTurnPrompt(question, selfLabel, peer1Label, peer2Label, peer1Answer, peer2Answer, selfPrevious, roundNum, totalRounds) {
  return `You are ${selfLabel} in a collaborative round-table debate with ${peer1Label} and ${peer2Label}.

Original Question:
${question}

Your previous answer:
${selfPrevious}

--- ${peer1Label}'s latest answer ---
${peer1Answer}

--- ${peer2Label}'s latest answer ---
${peer2Answer}

This is deliberation round ${roundNum} of ${totalRounds}.
Critically compare the other answers with yours. Note points of agreement and disagreement, then provide your updated, refined answer to the original question.

Your response (use markdown formatting):`;
}

function buildSummarizePrompt(perspectives) {
  return `Analyze the following perspectives from AI models on the same question and give a single concise sentence summarising the current state of their debate — noting agreement, disagreement, or convergence.

Perspectives:
${perspectives.join('\n---\n')}

One-sentence summary:`;
}

function buildConsensusPrompt(perspectives) {
  return `Analyze the following perspectives from AI models. Determine whether they have reached a satisfactory consensus that resolves the original query without major conflicts.

Respond with EXACTLY this format (no extra text):
CONSENSUS: YES or NO
REASONING: <one sentence>
ANSWER: <if YES: the unified answer in clean markdown. If NO: a brief summary of remaining disagreement>

Perspectives:
${perspectives.join('\n---\n')}`;
}

function buildMajorityVotePrompt(question, finalAnswers) {
  return `You are the Arbiter. Three AI models have completed a full debate without reaching consensus. Your task is to produce the single best final answer by applying majority-vote logic to their final positions.

Original Question:
${question}

Model A final answer:
${finalAnswers.a}

Model B final answer:
${finalAnswers.b}

Model C final answer:
${finalAnswers.c}

Provide the definitive consensus answer in clean markdown. Output ONLY the answer, no preamble:`;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function requireQuestion(body) {
  const q = body && body.question;
  if (typeof q !== 'string' || !q.trim()) {
    return { error: 'Missing or empty "question" field (string).' };
  }
  return { question: q.trim() };
}

// SSE helpers
function sseWrite(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Health check — lists available Ollama models
// ---------------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    const resp = await fetch(OLLAMA_TAGS);
    const data = resp.ok ? await resp.json() : { models: [] };
    const availableModels = (data.models || []).map(m => m.name);
    res.json({
      status: 'ok',
      backend: 'running',
      configured: MODEL_LABELS,
      ollama_available: availableModels,
      model_a_ready: availableModels.some(n => n.startsWith(MODEL_A.split(':')[0])),
      model_b_ready: availableModels.some(n => n.startsWith(MODEL_B.split(':')[0])),
      model_c_ready: availableModels.some(n => n.startsWith(MODEL_C.split(':')[0])),
    });
  } catch (e) {
    res.status(503).json({ status: 'error', message: `Cannot reach Ollama: ${e.message}` });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chat/summarize  { perspectives: string[] } → { summary: string }
// ---------------------------------------------------------------------------
app.post('/api/chat/summarize', async (req, res) => {
  try {
    const { perspectives } = req.body;
    if (!Array.isArray(perspectives) || perspectives.length === 0) {
      return res.status(400).json({ status: 'error', message: 'perspectives must be a non-empty array of strings.' });
    }
    const summary = await callOllama(MODEL_A, buildSummarizePrompt(perspectives));
    res.json({ status: 'success', summary });
  } catch (e) {
    console.error('/api/chat/summarize error:', e);
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chat/consensus  { perspectives: string[] }
//   → { isConsensus: bool, answer: string, reasoning: string }
// ---------------------------------------------------------------------------
app.post('/api/chat/consensus', async (req, res) => {
  try {
    const { perspectives } = req.body;
    if (!Array.isArray(perspectives) || perspectives.length === 0) {
      return res.status(400).json({ status: 'error', message: 'perspectives must be a non-empty array of strings.' });
    }
    const raw = await callOllama(MODEL_A, buildConsensusPrompt(perspectives));

    const isConsensusMatch = raw.match(/CONSENSUS:\s*(YES|NO)/i);
    const reasoningMatch   = raw.match(/REASONING:\s*(.*?)(?=\nANSWER:|$)/is);
    const answerMatch      = raw.match(/ANSWER:\s*([\s\S]*)/i);

    const isConsensus = isConsensusMatch ? isConsensusMatch[1].toUpperCase() === 'YES' : false;
    const reasoning   = reasoningMatch   ? reasoningMatch[1].trim() : 'Unable to determine.';
    const answer      = answerMatch      ? answerMatch[1].trim()    : raw;

    res.json({ status: 'success', isConsensus, reasoning, answer });
  } catch (e) {
    console.error('/api/chat/consensus error:', e);
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chat/debate  (blocking — returns full result when done)
// ---------------------------------------------------------------------------
app.post('/api/chat/debate', async (req, res) => {
  try {
    const parsed = requireQuestion(req.body);
    if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });
    const result = await runMccDebate(parsed.question);
    res.json({ status: 'success', ...result });
  } catch (e) {
    console.error('/api/chat/debate error:', e);
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/chat/debate/stream  ?question=... (SSE — emits each round live)
// ---------------------------------------------------------------------------
app.post('/api/chat/debate/stream', async (req, res) => {
  const parsed = requireQuestion(req.body);
  if (parsed.error) {
    res.status(400).json({ status: 'error', message: parsed.error });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const question = parsed.question;

  try {
    // --- Round 0: all three models answer independently, in parallel ---
    sseWrite(res, 'status', { message: 'Round 1: Independent analysis in progress...', round: 1 });

    const [ansA0, ansB0, ansC0] = await Promise.all([
      callOllama(MODEL_A, buildInitialPrompt(question, MODEL_A)).catch(e => `Error: ${e.message}`),
      callOllama(MODEL_B, buildInitialPrompt(question, MODEL_B)).catch(e => `Error: ${e.message}`),
      callOllama(MODEL_C, buildInitialPrompt(question, MODEL_C)).catch(e => `Error: ${e.message}`),
    ]);

    let curA = ansA0, curB = ansB0, curC = ansC0;

    sseWrite(res, 'round', {
      round: 1,
      responses: [
        { agentId: 'model_a', content: curA, timestamp: Date.now() },
        { agentId: 'model_b', content: curB, timestamp: Date.now() },
        { agentId: 'model_c', content: curC, timestamp: Date.now() },
      ],
    });

    // --- Debate rounds 1..DEBATE_ROUNDS (sequential A→B→C each round) ---
    for (let r = 1; r <= DEBATE_ROUNDS; r++) {
      sseWrite(res, 'status', { message: `Round ${r + 1}: Deliberation in progress...`, round: r + 1 });

      // A sees B and C
      curA = await callOllama(MODEL_A, buildDebateTurnPrompt(question, MODEL_A, MODEL_B, MODEL_C, curB, curC, curA, r, DEBATE_ROUNDS))
               .catch(e => `Error: ${e.message}`);

      // B sees updated A, previous C
      curB = await callOllama(MODEL_B, buildDebateTurnPrompt(question, MODEL_B, MODEL_A, MODEL_C, curA, curC, curB, r, DEBATE_ROUNDS))
               .catch(e => `Error: ${e.message}`);

      // C sees updated A and B
      curC = await callOllama(MODEL_C, buildDebateTurnPrompt(question, MODEL_C, MODEL_A, MODEL_B, curA, curB, curC, r, DEBATE_ROUNDS))
               .catch(e => `Error: ${e.message}`);

      sseWrite(res, 'round', {
        round: r + 1,
        responses: [
          { agentId: 'model_a', content: curA, timestamp: Date.now() },
          { agentId: 'model_b', content: curB, timestamp: Date.now() },
          { agentId: 'model_c', content: curC, timestamp: Date.now() },
        ],
      });
    }

    // --- Final majority vote ---
    sseWrite(res, 'status', { message: 'Generating final consensus via majority vote...', round: -1 });
    const finalAnswer = await callOllama(MODEL_A, buildMajorityVotePrompt(question, { a: curA, b: curB, c: curC }))
                          .catch(e => `Error generating final answer: ${e.message}`);

    sseWrite(res, 'final', {
      answer: finalAnswer,
      reasoning: `Majority vote synthesis after ${DEBATE_ROUNDS} rounds of deliberation.`,
      models: MODEL_LABELS,
    });

    sseWrite(res, 'done', { message: 'Debate complete.' });
  } catch (e) {
    console.error('SSE debate error:', e);
    sseWrite(res, 'error', { message: e.message });
  } finally {
    res.end();
  }
});

// ---------------------------------------------------------------------------
// Internal: blocking debate (used by POST /api/chat/debate)
// ---------------------------------------------------------------------------
async function runMccDebate(question) {
  const history = [];

  const [ansA0, ansB0, ansC0] = await Promise.all([
    callOllama(MODEL_A, buildInitialPrompt(question, MODEL_A)).catch(e => `Error: ${e.message}`),
    callOllama(MODEL_B, buildInitialPrompt(question, MODEL_B)).catch(e => `Error: ${e.message}`),
    callOllama(MODEL_C, buildInitialPrompt(question, MODEL_C)).catch(e => `Error: ${e.message}`),
  ]);

  let curA = ansA0, curB = ansB0, curC = ansC0;
  history.push({ round: 0, a: curA, b: curB, c: curC });

  for (let r = 1; r <= DEBATE_ROUNDS; r++) {
    curA = await callOllama(MODEL_A, buildDebateTurnPrompt(question, MODEL_A, MODEL_B, MODEL_C, curB, curC, curA, r, DEBATE_ROUNDS)).catch(e => `Error: ${e.message}`);
    curB = await callOllama(MODEL_B, buildDebateTurnPrompt(question, MODEL_B, MODEL_A, MODEL_C, curA, curC, curB, r, DEBATE_ROUNDS)).catch(e => `Error: ${e.message}`);
    curC = await callOllama(MODEL_C, buildDebateTurnPrompt(question, MODEL_C, MODEL_A, MODEL_B, curA, curB, curC, r, DEBATE_ROUNDS)).catch(e => `Error: ${e.message}`);
    history.push({ round: r, a: curA, b: curB, c: curC });
  }

  const finalAnswer = await callOllama(MODEL_A, buildMajorityVotePrompt(question, { a: curA, b: curB, c: curC }))
                        .catch(e => `Error: ${e.message}`);

  return {
    models: MODEL_LABELS,
    debate_rounds: DEBATE_ROUNDS,
    debate_history: history,
    final: { a: curA, b: curB, c: curC, answer: finalAnswer },
  };
}

// Single-model chat endpoints (convenience)
app.post('/api/chat/model-a', async (req, res) => {
  try {
    const parsed = requireQuestion(req.body);
    if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });
    const answer = await callOllama(MODEL_A, parsed.question);
    res.json({ status: 'success', model: MODEL_A, answer });
  } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

app.post('/api/chat/model-b', async (req, res) => {
  try {
    const parsed = requireQuestion(req.body);
    if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });
    const answer = await callOllama(MODEL_B, parsed.question);
    res.json({ status: 'success', model: MODEL_B, answer });
  } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

app.post('/api/chat/model-c', async (req, res) => {
  try {
    const parsed = requireQuestion(req.body);
    if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });
    const answer = await callOllama(MODEL_C, parsed.question);
    res.json({ status: 'success', model: MODEL_C, answer });
  } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🟢 Arbiter MCC backend running on http://localhost:${PORT}`);
  console.log(`   Models: A=${MODEL_A}  B=${MODEL_B}  C=${MODEL_C}`);
  console.log(`   Ollama: ${OLLAMA_URL}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /api/health`);
  console.log(`     POST /api/chat/debate`);
  console.log(`     POST /api/chat/debate/stream  ← SSE, use this in the frontend`);
  console.log(`     POST /api/chat/summarize`);
  console.log(`     POST /api/chat/consensus`);
  console.log(`     POST /api/chat/model-a|b|c\n`);
});
