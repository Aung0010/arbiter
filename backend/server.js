const express = require('express');
const cors = require('cors');

// Ollama /api/generate — same as run_mcc_medqa.py
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
const MODEL_A = process.env.MODEL_A || 'gemma3:12b-cloud';
const MODEL_B = process.env.MODEL_B || 'ministral-3:14b-cloud';
const MODEL_C = process.env.MODEL_C || 'qwen3.5:cloud';
// Fixed number of debate rounds after round 0 (parallel first answers)
const DEBATE_ROUNDS = parseInt(process.env.DEBATE_ROUNDS || '3', 10);
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '600000', 10);
const PORT = parseInt(process.env.PORT || '5050', 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

async function callOllama(model, prompt) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const resp = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0 },
      }),
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

/** Plain chat: one model, user only sends question */
function buildSingleModelPrompt(question, modelLabel) {
  return `You are a helpful assistant (${modelLabel}).

User question:
${question}

Answer clearly and directly.`;
}

/** Round 0: independent answers (MCC-style parallel phase, chat wording) */
function buildInitialPanelPrompt(question, modelLabel) {
  return `You are one of three independent experts (${modelLabel}) answering the same question. Give your own best answer first; you will later discuss with two other models.

Question:
${question}

Your answer:`;
}

/**
 * Debate turn: self sees the other two models' latest answers and own previous answer.
 * Turn order per round matches run_mcc_medqa: A → B → C.
 */
function buildDebateTurnPrompt(
  question,
  selfLabel,
  peer1Label,
  peer2Label,
  peer1Answer,
  peer2Answer,
  selfPreviousAnswer,
  roundNum,
  totalDebateRounds
) {
  return `You are ${selfLabel} in a round-table discussion with ${peer1Label} and ${peer2Label}.

Question:
${question}

Your answer before this turn:
${selfPreviousAnswer}

--- ${peer1Label}'s latest answer ---
${peer1Answer}

--- ${peer2Label}'s latest answer ---
${peer2Answer}

This is discussion round ${roundNum} of ${totalDebateRounds}. Critically compare the other answers with yours, note agreement or disagreement, then give your updated answer to the original question.

Your response:`;
}

function requireQuestion(body) {
  const q = body && body.question;
  if (typeof q !== 'string' || !q.trim()) {
    return { error: 'Missing or empty "question" (string).' };
  }
  return { question: q.trim() };
}

async function handleChatModel(req, res, modelName) {
  try {
    const parsed = requireQuestion(req.body);
    if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });
    const answer = await callOllama(modelName, buildSingleModelPrompt(parsed.question, modelName));
    res.json({ status: 'success', model: modelName, answer });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: 'error', message: e.message || 'Model call failed' });
  }
}

/**
 * Run round 0 (parallel) + exactly DEBATE_ROUNDS full cycles (A→B→C each).
 * Returns every round snapshot for the frontend.
 */
async function runMccChatDebate(question) {
  const history = [];

  const runInitial = async (label) => {
    try {
      const answer = await callOllama(label, buildInitialPanelPrompt(question, label));
      return { answer };
    } catch (e) {
      return { answer: `Error: ${e.message}` };
    }
  };

  // Round 0: three models answer in parallel (same idea as initialize_debate)
  const [a0, b0, c0] = await Promise.all([
    runInitial(MODEL_A),
    runInitial(MODEL_B),
    runInitial(MODEL_C),
  ]);
  let curA = a0;
  let curB = b0;
  let curC = c0;
  history.push({ round: 0, a: { ...curA }, b: { ...curB }, c: { ...curC } });

  for (let r = 1; r <= DEBATE_ROUNDS; r++) {
    // A responds to B and C (still at state from end of round r-1)
    try {
      const promptA = buildDebateTurnPrompt(
        question,
        MODEL_A,
        MODEL_B,
        MODEL_C,
        curB.answer,
        curC.answer,
        curA.answer,
        r,
        DEBATE_ROUNDS
      );
      curA = { answer: await callOllama(MODEL_A, promptA) };
    } catch (e) {
      curA = { answer: `Error: ${e.message}` };
    }

    // B sees updated A, C unchanged this round
    try {
      const promptB = buildDebateTurnPrompt(
        question,
        MODEL_B,
        MODEL_A,
        MODEL_C,
        curA.answer,
        curC.answer,
        curB.answer,
        r,
        DEBATE_ROUNDS
      );
      curB = { answer: await callOllama(MODEL_B, promptB) };
    } catch (e) {
      curB = { answer: `Error: ${e.message}` };
    }

    // C sees updated A and B
    try {
      const promptC = buildDebateTurnPrompt(
        question,
        MODEL_C,
        MODEL_A,
        MODEL_B,
        curA.answer,
        curB.answer,
        curC.answer,
        r,
        DEBATE_ROUNDS
      );
      curC = { answer: await callOllama(MODEL_C, promptC) };
    } catch (e) {
      curC = { answer: `Error: ${e.message}` };
    }

    // One entry per round after all three have spoken (full MCC step for round r)
    history.push({ round: r, a: { ...curA }, b: { ...curB }, c: { ...curC } });
  }

  return {
    models: { model_a: MODEL_A, model_b: MODEL_B, model_c: MODEL_C },
    debate_rounds: DEBATE_ROUNDS,
    debate_history: history,
    final: { a: curA, b: curB, c: curC },
  };
}

// --- Four chat APIs: three single-model + one full MCC debate ---

// Single-model chat: Ollama once per request, no cross-model context
app.post('/api/chat/model-a', (req, res) => handleChatModel(req, res, MODEL_A));
app.post('/api/chat/model-b', (req, res) => handleChatModel(req, res, MODEL_B));
app.post('/api/chat/model-c', (req, res) => handleChatModel(req, res, MODEL_C));

// MCC debate: round 0 parallel + DEBATE_ROUNDS sequential rounds (A→B→C each)
app.post('/api/chat/debate', async (req, res) => {
  try {
    const parsed = requireQuestion(req.body);
    if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });
    const result = await runMccChatDebate(parsed.question);
    res.json({ status: 'success', ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: 'error', message: e.message || 'Debate failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Chat + MCC backend on http://localhost:${PORT}`);
  console.log('  POST /api/chat/model-a | /api/chat/model-b | /api/chat/model-c | /api/chat/debate');
});
