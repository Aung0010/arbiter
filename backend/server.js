require('dotenv').config({ path: '../.env.local' });
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
app.use(express.json({ limit: '2mb' }));

async function callOllama(model, prompt) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const resp = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}`
      },
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
      console.error('Full Ollama error:', errText);
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

/**
 * Ask the judge model whether two expert answers agree on the substantive conclusion
 * (used after round 0 and after each completed debate round where text matching failed).
 */
function buildPairwiseSemanticConsensusPrompt(question, answerA, answerB) {
  return `You arbitrate whether two independent expert answers agree on the substance of the user's question.

[Question]
${question}

[Expert A answer]
${answerA}

[Expert B answer]
${answerB}

Decide if both answers reach the same substantive conclusion for the user. Minor differences in explanation, formatting, punctuation, or phrasing must NOT count as disagreement if the core answer is the same (e.g. "2100" vs "2,100" or different verbal work for the same result).

Output ONLY valid JSON. Do not use markdown fences.

Return JSON in exactly this format:
{
  "agree_on_substance": true,
  "reason": "one short sentence"
}`;
}

async function semanticConsensusViaJudge(question, answerA, answerB) {
  try {
    const raw = await callOllama(
      MODEL_JUDGE,
      buildPairwiseSemanticConsensusPrompt(question, answerA, answerB)
    );
    const parsed = extractJsonFromText(raw);
    if (!parsed) return false;
    const v = parsed.agree_on_substance;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      return s === 'true' || s === 'yes';
    }
    return false;
  } catch (e) {
    console.error('semanticConsensusViaJudge:', e);
    return false;
  }
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

Question:
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

  const textConsensus = checkConsensusTwo(curA.answer, curB.answer);
  let judgeRoundZeroConsensus = false;
  if (!textConsensus) {
    judgeRoundZeroConsensus = await semanticConsensusViaJudge(
      question,
      curA.answer,
      curB.answer
    );
  }
  const initConsensus = textConsensus || judgeRoundZeroConsensus;

  const history = [{ round: 0, a: { ...curA }, b: { ...curB } }];

  let debateConsensus = initConsensus;
  let debateFailed = false;
  let failureReason = null;
  let postDebateSemanticConsensusApplied = false;
  let midDebateJudgeConsensusRound = null;
  let debateFinalSummary;
  if (!initConsensus) {
    debateFinalSummary = 'Experts disagreed after round 0.';
  } else if (textConsensus) {
    debateFinalSummary =
      'Both experts agreed in round 0 (normalized text match).';
  } else {
    debateFinalSummary =
      'Semantic agreement after round 0: judge confirmed same substantive conclusion despite different wording.';
  }

  // Track which round consensus was detected (0 = initial, null = none after all rounds)
  let consensusRound = initConsensus ? 0 : null;

  if (!initConsensus) {
    for (let r = 1; r <= DEBATE_ROUNDS; r++) {
      // --- Expert A responds ---
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

      // Text consensus check after A speaks
      if (checkConsensusTwo(curA.answer, curB.answer)) {
        debateConsensus = true;
        debateFinalSummary = `Consensus reached after Expert A spoke in round ${r} (exact text match).`;
        consensusRound = r;
        history.push({ round: r, a: { ...curA }, b: { ...curB } });
        break;
      }

      // --- Expert B responds ---
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

      // Text consensus check after B speaks
      if (checkConsensusTwo(curA.answer, curB.answer)) {
        debateConsensus = true;
        debateFinalSummary = `Consensus reached after Expert B spoke in round ${r} (exact text match).`;
        consensusRound = r;
        history.push({ round: r, a: { ...curA }, b: { ...curB } });
        break;
      }

      // Record this round before doing the semantic check
      history.push({ round: r, a: { ...curA }, b: { ...curB } });

      // Judge semantic consensus after each full debate round (both experts have spoken).
      console.log(`[round ${r}] Text consensus not found. Asking judge for semantic check...`);
      const roundSemanticMatch = await semanticConsensusViaJudge(
        question,
        curA.answer,
        curB.answer
      );
      if (roundSemanticMatch) {
        debateConsensus = true;
        debateFailed = false;
        failureReason = null;
        consensusRound = r;
        midDebateJudgeConsensusRound = r;
        debateFinalSummary = `Semantic consensus confirmed by judge after round ${r}: experts reached the same substantive conclusion despite different phrasing.`;
        console.log(`[round ${r}] Judge confirmed semantic consensus. Terminating debate early.`);
        break;
      }

      console.log(
        `[round ${r}] No consensus. ${r < DEBATE_ROUNDS ? 'Continuing to next round.' : 'All rounds exhausted.'}`
      );

      if (r === DEBATE_ROUNDS) {
        debateConsensus = false;
        debateFailed = true;
        failureReason = 'two_way_disagree';
        debateFinalSummary = `No consensus after ${DEBATE_ROUNDS} debate rounds (text and per-round judge review). Judge will arbitrate.`;
      }
    }
  }

  // Safety net: if all rounds completed without consensus, do one final semantic check.
  // (Per-round checks above already catch most cases; this handles the edge case where
  // the last round's per-round check didn't fire due to the loop ending before it ran.)
  if (!debateConsensus && history.length > 1) {
    console.log('[post-loop] Performing final semantic consensus check...');
    const substantiveMatch = await semanticConsensusViaJudge(question, curA.answer, curB.answer);
    if (substantiveMatch) {
      debateConsensus = true;
      debateFailed = false;
      failureReason = null;
      postDebateSemanticConsensusApplied = true;
      consensusRound = history[history.length - 1].round;
      debateFinalSummary =
        'Substantive agreement confirmed by final semantic review. Judge will formalize the consensus.';
      console.log('[post-loop] Final semantic check found consensus.');
    } else {
      console.log('[post-loop] Final semantic check: no consensus. Judge will arbitrate.');
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
    consensus_round: consensusRound,          // which round consensus was found (0 = initial, null = none)
    initial_choices: { a: initialRound.a.answer, b: initialRound.b.answer },
    debate_history: history,
    debate_final_summary: debateFinalSummary,
    round_zero_consensus_source: !initConsensus
      ? 'none'
      : textConsensus
        ? 'normalized_text'
        : 'judge_semantic',
    post_debate_semantic_consensus: postDebateSemanticConsensusApplied,
    mid_debate_judge_consensus_round: midDebateJudgeConsensusRound,
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
  console.log(`Backend running on port ${PORT}`);
  console.log(`Loaded Key Check:`, process.env.OLLAMA_API_KEY ? "Key Found! ✅" : "Key is Undefined ❌");
  console.log(`  Architecture: ${ARCHITECTURE}`);
  console.log(`  Model A: ${MODEL_A}`);
  console.log(`  Model B: ${MODEL_B}`);
  console.log(`  Judge:   ${MODEL_JUDGE}`);
  console.log('  POST /api/chat/model-a | /api/chat/model-b | /api/chat/model-judge | /api/chat/debate');
  console.log('  GET  /api/health');
});