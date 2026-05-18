const express = require('express');
const cors = require('cors');

// Ollama /api/generate — aligned with run_mcc_medqa_two_llm_judge.py
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
const MODEL_A = process.env.MODEL_A || 'gemma3:12b-cloud';
const MODEL_B = process.env.MODEL_B || 'ministral-3:14b-cloud';
const MODEL_JUDGE = process.env.MODEL_JUDGE || 'gpt-oss:20b-cloud';
const DEBATE_ROUNDS = parseInt(process.env.DEBATE_ROUNDS || '3', 10);
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '600000', 10);
const PORT = parseInt(process.env.PORT || '5050', 10);

const ARCHITECTURE = 'two_llm_judge_v1';

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

function extractJsonFromText(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function normalizeAnswer(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function checkConsensusTwo(aAnswer, bAnswer) {
  const a = normalizeAnswer(aAnswer);
  const b = normalizeAnswer(bAnswer);
  if (!a || !b) return false;
  return a === b;
}

function buildSingleModelPrompt(question, modelLabel) {
  return `You are a helpful assistant (${modelLabel}).

User question:
${question}

Answer clearly and directly.`;
}

/** Round 0: independent answers (parallel), two experts */
function buildInitialPrompt(question, modelRole) {
  return `You are an expert (${modelRole}) answering a user question independently.
Another expert will debate with you afterward; give your best initial answer first.

Question:
${question}

Provide a brief analysis and a clear final answer.`;
}

/**
 * Debate turn: one expert sees the other's latest answer and own previous answer.
 * Turn order per round: A → B (same as run_mcc_medqa_two_llm_judge.py).
 */
function buildDebatePromptTwo(
  question,
  modelSelf,
  modelOther,
  otherAnswer,
  selfPreviousAnswer,
  roundNum
) {
  const prevBlock =
    selfPreviousAnswer && selfPreviousAnswer.trim()
      ? `
[Your Previous Answer]
${selfPreviousAnswer}
Consider whether to maintain or change your view based on the other expert's arguments.
`
      : '';

  return `You are ${modelSelf} in a discussion with ${modelOther}.

Original Question:
${question}
${prevBlock}

[${modelOther}'s Answer]
${otherAnswer}

Critically evaluate their viewpoint. State whether you agree or disagree, then give your updated final answer.

Round ${roundNum} - Your response:`;
}

/**
 * Final judge layer — always runs after debate (even if experts already agreed).
 * Mirrors get_judge_prompt_two / judge_finalize_two in the Python benchmark script.
 */
function buildJudgePromptTwo(
  question,
  initialAAnswer,
  initialBAnswer,
  finalAAnswer,
  finalBAnswer,
  debateConsensus,
  debateSummary
) {
  return `You are the final judge in a two-expert discussion.

Your task is to review the question and both experts' initial and final answers, then produce the single best final answer for the user.

[Question]
${question}

[Expert A - Initial Answer]
${initialAAnswer}

[Expert B - Initial Answer]
${initialBAnswer}

[Expert A - Final Debate Answer]
${finalAAnswer}

[Expert B - Final Debate Answer]
${finalBAnswer}

[Debate Outcome]
Consensus reached: ${debateConsensus}
Debate summary: ${debateSummary}

Instructions:
1. Produce the single best final answer to the user's question.
2. You may agree with the debate consensus, or override it if the reasoning is weak.
3. Focus on which expert gives better-supported reasoning.
4. Do not simply average opinions.
5. Output ONLY valid JSON.
6. Do not include markdown fences.

Return JSON in exactly this format:
{
  "final_answer": "your complete final answer for the user",
  "decision_type": "consensus_confirmed_or_consensus_overruled_or_tie_break",
  "winner": "A_or_B_or_consensus",
  "confidence": 0.0,
  "reason": "brief explanation"
}`;
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
    console.error(e);
    res.status(500).json({ status: 'error', message: e.message || 'Model call failed' });
  }
}

async function runInitialTwo(question) {
  const runOne = async (label) => {
    try {
      const answer = await callOllama(label, buildInitialPrompt(question, label));
      return { answer };
    } catch (e) {
      return { answer: `Error: ${e.message}` };
    }
  };

  const [aRes, bRes] = await Promise.all([runOne(MODEL_A), runOne(MODEL_B)]);
  return { a: aRes, b: bRes };
}

/**
 * Two-LLM debate + mandatory judge (same flow as conduct_debate_two + judge_finalize_two).
 * Debate may end early on consensus; judge always produces the system final answer.
 */
async function runTwoLlmJudgeDebate(question) {
  const initial = await runInitialTwo(question);
  let curA = initial.a;
  let curB = initial.b;

  const initConsensus = checkConsensusTwo(curA.answer, curB.answer);
  const history = [{ round: 0, a: { ...curA }, b: { ...curB } }];

  let debateConsensus = initConsensus;
  let debateFailed = false;
  let failureReason = null;
  let debateFinalSummary = initConsensus
    ? 'Both experts agreed in round 0.'
    : 'Experts disagreed after round 0.';

  if (!initConsensus) {
    for (let r = 1; r <= DEBATE_ROUNDS; r++) {
      try {
        const promptA = buildDebatePromptTwo(
          question,
          MODEL_A,
          MODEL_B,
          curB.answer,
          curA.answer,
          r
        );
        curA = { answer: await callOllama(MODEL_A, promptA) };
      } catch (e) {
        curA = { answer: `Error: ${e.message}` };
      }

      if (checkConsensusTwo(curA.answer, curB.answer)) {
        debateConsensus = true;
        debateFinalSummary = `Consensus reached after Expert A spoke in round ${r}.`;
        history.push({ round: r, a: { ...curA }, b: { ...curB } });
        break;
      }

      try {
        const promptB = buildDebatePromptTwo(
          question,
          MODEL_B,
          MODEL_A,
          curA.answer,
          curB.answer,
          r
        );
        curB = { answer: await callOllama(MODEL_B, promptB) };
      } catch (e) {
        curB = { answer: `Error: ${e.message}` };
      }

      if (checkConsensusTwo(curA.answer, curB.answer)) {
        debateConsensus = true;
        debateFinalSummary = `Consensus reached after Expert B spoke in round ${r}.`;
        history.push({ round: r, a: { ...curA }, b: { ...curB } });
        break;
      }

      history.push({ round: r, a: { ...curA }, b: { ...curB } });

      if (r === DEBATE_ROUNDS) {
        debateConsensus = false;
        debateFailed = true;
        failureReason = 'two_way_disagree';
        debateFinalSummary = `No consensus after ${DEBATE_ROUNDS} debate rounds.`;
      }
    }
  }

  const initialRound = history[0];
  const finalRound = history[history.length - 1];

  const judgePrompt = buildJudgePromptTwo(
    question,
    initialRound.a.answer,
    initialRound.b.answer,
    finalRound.a.answer,
    finalRound.b.answer,
    debateConsensus,
    debateFinalSummary
  );

  let judgeRaw = '';
  let judgeResult;
  try {
    judgeRaw = await callOllama(MODEL_JUDGE, judgePrompt);
    const parsed = extractJsonFromText(judgeRaw);

    if (!parsed || typeof parsed.final_answer !== 'string' || !parsed.final_answer.trim()) {
      const fallback =
        debateConsensus && finalRound.a.answer
          ? finalRound.a.answer
          : `${finalRound.a.answer}\n\n---\n\n${finalRound.b.answer}`;
      judgeResult = {
        raw_answer: judgeRaw,
        final_answer: fallback,
        decision_type: 'judge_parse_failed_fallback',
        winner: null,
        confidence: null,
        reason: 'Judge response could not be parsed as JSON; fallback to debate answers.',
        judge_overrode_debate: !debateConsensus,
      };
    } else {
      const debatePick = debateConsensus ? finalRound.a.answer : null;
      const judgeAnswer = parsed.final_answer.trim();
      const overrode =
        debatePick !== null && normalizeAnswer(judgeAnswer) !== normalizeAnswer(debatePick);

      judgeResult = {
        raw_answer: judgeRaw,
        final_answer: judgeAnswer,
        decision_type: parsed.decision_type || 'unknown',
        winner: parsed.winner ?? null,
        confidence: parsed.confidence ?? null,
        reason: parsed.reason ?? null,
        judge_overrode_debate: overrode || (!debateConsensus && !debateFailed),
      };
    }
  } catch (e) {
    const fallback =
      debateConsensus && finalRound.a.answer
        ? finalRound.a.answer
        : finalRound.a.answer || finalRound.b.answer;
    judgeResult = {
      raw_answer: judgeRaw,
      final_answer: fallback,
      decision_type: 'judge_call_failed_fallback',
      winner: null,
      confidence: null,
      reason: e.message,
      judge_overrode_debate: false,
    };
  }

  const debateResult = {
    failed: debateFailed,
    failure_reason: failureReason,
    consensus: debateConsensus,
    initial_choices: { a: initialRound.a.answer, b: initialRound.b.answer },
    debate_history: history,
    debate_final_summary: debateFinalSummary,
  };

  return {
    architecture: ARCHITECTURE,
    models: {
      model_a: MODEL_A,
      model_b: MODEL_B,
      model_judge: MODEL_JUDGE,
    },
    debate_rounds: DEBATE_ROUNDS,
    debate_result: debateResult,
    judge_result: judgeResult,
    debate_history: history,
    final: {
      a: finalRound.a,
      b: finalRound.b,
      answer: judgeResult.final_answer,
    },
  };
}

// --- APIs: two debaters + judge + full pipeline ---

app.post('/api/chat/model-a', (req, res) => handleChatModel(req, res, MODEL_A));
app.post('/api/chat/model-b', (req, res) => handleChatModel(req, res, MODEL_B));
app.post('/api/chat/model-judge', (req, res) => handleChatModel(req, res, MODEL_JUDGE));

// 2-LLM debate + mandatory judge (replaces legacy 3-model MCC debate)
app.post('/api/chat/debate', async (req, res) => {
  try {
    const parsed = requireQuestion(req.body);
    if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });
    const result = await runTwoLlmJudgeDebate(parsed.question);
    res.json({ status: 'success', ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: 'error', message: e.message || 'Debate failed' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    architecture: ARCHITECTURE,
    models: { model_a: MODEL_A, model_b: MODEL_B, model_judge: MODEL_JUDGE },
    debate_rounds: DEBATE_ROUNDS,
  });
});

app.listen(PORT, () => {
  console.log(`Chat + 2-LLM+Judge backend on http://localhost:${PORT}`);
  console.log(`  Architecture: ${ARCHITECTURE}`);
  console.log(`  Model A: ${MODEL_A}`);
  console.log(`  Model B: ${MODEL_B}`);
  console.log(`  Judge:   ${MODEL_JUDGE}`);
  console.log('  POST /api/chat/model-a | /api/chat/model-b | /api/chat/model-judge | /api/chat/debate');
  console.log('  GET  /api/health');
});
