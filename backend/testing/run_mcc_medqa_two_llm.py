"""
双 LLM 版 MCC 辩论 - MedQA（BenchBase）

流程与 `run_mcc_medqa.py` 一致，但仅两个模型 A/B：
- 并行首轮作答；若选项一致则首轮共识。
- 否则每轮：A 参考 B 的最新论证再作答 → 检查共识；
  再 B 参考 A 的最新论证再作答 → 检查共识。
- 轮数用尽仍不一致：两人平票，记为 failed（failure_reason=two_way_disagree），
  与三模型多数决无法打破平局的情形类似。

结果默认写入 `mcc_debate_results_two_llm/`，与三模型脚本的 `mcc_debate_results/` 分离。
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import json
import os
import re
import time
import traceback
from collections import Counter
from typing import Optional, List, Dict, Any

import requests
from datasets import load_dataset
from tqdm import tqdm
from sklearn.metrics import accuracy_score


# =========================
# 配置区
# =========================

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"

MODEL_A = "gemma3:12b-cloud"
MODEL_B = "ministral-3:14b-cloud"

DATASET_NAME = "Layered-Labs/benchbase-medqa"
DATASET_SPLIT = "test"

MAX_DEBATE_ROUNDS = 3
OLLAMA_TIMEOUT = 600

# 与三模型脚本区分的结果根目录
DEFAULT_OUTPUT_DIR = "mcc_debate_results_two_llm"


def call_ollama(model: str, prompt: str, timeout: int = OLLAMA_TIMEOUT) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0},
    }
    resp = requests.post(OLLAMA_URL, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    return data.get("response", "").strip()


def letter_to_num(letter: str) -> int:
    if not letter:
        return 0
    c = letter.strip().upper()
    if c in "ABCD":
        return ord(c) - ord("A") + 1
    return 0


def num_to_letter(num: int) -> str:
    if 1 <= num <= 4:
        return chr(ord("A") + num - 1)
    return ""


def benchbase_options_to_choices(options: List[Dict[str, str]]) -> tuple[str, Dict[str, int]]:
    sorted_opts = sorted(options, key=lambda x: str(x.get("original_key", "")).upper())
    lines = []
    key_to_num: Dict[str, int] = {}
    for i, opt in enumerate(sorted_opts):
        num = i + 1
        key = str(opt.get("original_key", chr(ord("A") + i))).strip().upper()
        text = opt.get("text", "")
        key_to_num[key] = num
        lines.append(f"{num}. {text}")
    return "\n".join(lines), dict(key_to_num)


def load_medqa(max_samples: Optional[int] = None):
    ds = load_dataset(DATASET_NAME)[DATASET_SPLIT]
    if max_samples is not None and len(ds) > max_samples:
        ds = ds.shuffle(seed=42).select(range(max_samples))
    return ds


def extract_model_choice(answer_text: str, choices_text: str, key_to_num: Dict[str, int]) -> Optional[int]:
    if not answer_text:
        return None

    clean_answer = re.sub(r"\*\*([^*]+)\*\*", r"\1", answer_text)

    option_content_to_num: Dict[str, int] = {}
    for line in choices_text.strip().split("\n"):
        match = re.match(r"(\d+)\.\s*(.+)", line.strip())
        if match:
            option_num = int(match.group(1))
            option_content = match.group(2).strip()
            option_content_to_num[option_content.lower()] = option_num
            if " " in option_content:
                short_name = option_content.split()[0].lower()
                option_content_to_num[short_name] = option_num

    patterns = [
        r"my final selection is[：:\s]?\s*(?:\*\*)?option\s*(\d+)(?:\*\*)?",
        r"final (?:selection|choice|decision) is[：:\s]?\s*(?:\*\*)?option\s*(\d+)(?:\*\*)?",
        r"(?:choose|select)[：:\s]?\s*(?:\*\*)?option\s*(\d+)(?:\*\*)?",
        r"option\s*(\d+)\s*is",
        r"\boption\s*(\d+)\b",
    ]
    for pattern in patterns:
        m = re.search(pattern, clean_answer, re.IGNORECASE)
        if m:
            try:
                n = int(m.group(1))
                if 1 <= n <= 4:
                    return n
            except (ValueError, IndexError):
                pass

    text_upper = clean_answer.strip().upper()
    for ch in "DCBA":
        if ch in text_upper:
            idx = text_upper.rfind(ch)
            before = text_upper[max(0, idx - 1)] if idx > 0 else " "
            after = text_upper[idx + 1] if idx + 1 < len(text_upper) else " "
            if not before.isalpha() and not after.isalpha():
                return key_to_num.get(ch, letter_to_num(ch))

    m = re.search(r"\b([ABCD])\b", text_upper)
    if m:
        return key_to_num.get(m.group(1), letter_to_num(m.group(1)))

    return None


def get_initial_prompt(question: str, choices: str, model_role: str) -> str:
    return f"""You are a medical expert (as {model_role}) answering a USMLE-style multiple-choice question.

[Medical Case / Question]
{question}

[Diagnostic Options]
{choices}

Provide a brief analysis and state your final answer. You MUST end with exactly one of:
- "My final selection is: Option 1 (...)" 
- "My final selection is: Option 2 (...)"
- "My final selection is: Option 3 (...)"
- "My final selection is: Option 4 (...)"

Or simply output: Option 1, Option 2, Option 3, or Option 4.

Analysis and final answer:"""


def get_debate_prompt_two(
    question: str,
    choices: str,
    other_answer: str,
    other_choice: Optional[int],
    self_previous_answer: Optional[str],
    self_previous_choice: Optional[int],
    round_num: int,
    model_self: str,
    model_other: str,
) -> str:
    choice_to_text: Dict[int, str] = {}
    for line in choices.strip().split("\n"):
        m = re.match(r"(\d+)\.\s*(.+)", line.strip())
        if m:
            choice_to_text[int(m.group(1))] = m.group(2).strip()

    other_text = choice_to_text.get(other_choice, "?") if other_choice else "?"
    self_text = choice_to_text.get(self_previous_choice, "?") if self_previous_choice else "?"

    prev_block = ""
    if self_previous_answer and self_previous_choice:
        prev_block = f"""
[Your Previous Analysis]
{self_previous_answer}
[Your Previous Choice]: Option {self_previous_choice} ({self_text})
Consider whether to maintain or change your view based on the other expert's arguments.
"""

    return f"""You are {model_self} in a medical diagnosis debate with {model_other}.

[Medical Question]
{question}

[Options]
{choices}
{prev_block}

[{model_other}'s Analysis]
{other_answer}
[{model_other}'s Choice]: Option {other_choice} ({other_text})

Critically evaluate their viewpoint. State whether you agree or disagree. Give your final answer.
You MUST end with: "My final selection is: Option X (...)" or "Option X".

Round {round_num} - Your response:"""


def check_consensus_two(choices: List[Optional[int]]) -> bool:
    valid = [c for c in choices if c is not None]
    if len(valid) < 2:
        return False
    return all(c == valid[0] for c in valid)


def model_a_answer(question: str, choices: str) -> str:
    prompt = get_initial_prompt(question, choices, MODEL_A)
    return call_ollama(MODEL_A, prompt)


def model_b_answer(question: str, choices: str) -> str:
    prompt = get_initial_prompt(question, choices, MODEL_B)
    return call_ollama(MODEL_B, prompt)


def model_a_responds_two(
    question: str,
    choices: str,
    key_to_num: Dict[str, int],
    b_answer: str,
    b_choice: Optional[int],
    self_prev_answer: Optional[str],
    self_prev_choice: Optional[int],
    round_num: int,
) -> Dict[str, Any]:
    prompt = get_debate_prompt_two(
        question,
        choices,
        b_answer,
        b_choice,
        self_prev_answer,
        self_prev_choice,
        round_num,
        MODEL_A,
        MODEL_B,
    )
    answer = call_ollama(MODEL_A, prompt)
    choice = extract_model_choice(answer, choices, key_to_num)
    return {"answer": answer, "choice": choice}


def model_b_responds_two(
    question: str,
    choices: str,
    key_to_num: Dict[str, int],
    a_answer: str,
    a_choice: Optional[int],
    self_prev_answer: Optional[str],
    self_prev_choice: Optional[int],
    round_num: int,
) -> Dict[str, Any]:
    prompt = get_debate_prompt_two(
        question,
        choices,
        a_answer,
        a_choice,
        self_prev_answer,
        self_prev_choice,
        round_num,
        MODEL_B,
        MODEL_A,
    )
    answer = call_ollama(MODEL_B, prompt)
    choice = extract_model_choice(answer, choices, key_to_num)
    return {"answer": answer, "choice": choice}


def initialize_debate_two(question: str, choices: str, key_to_num: Dict[str, int]) -> Dict[str, Dict[str, Any]]:
    results: Dict[str, Dict[str, Any]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        fa = executor.submit(model_a_answer, question, choices)
        fb = executor.submit(model_b_answer, question, choices)
        for future, key in [(fa, "a"), (fb, "b")]:
            try:
                answer = future.result()
                choice = extract_model_choice(answer, choices, key_to_num)
                results[key] = {"answer": answer, "choice": choice}
            except Exception as e:
                results[key] = {"answer": f"Error: {e}", "choice": None}
    return results


def conduct_debate_two(
    question: str,
    choices: str,
    key_to_num: Dict[str, int],
    correct_num: Optional[int],
    max_rounds: int = MAX_DEBATE_ROUNDS,
) -> Optional[Dict[str, Any]]:
    initial = initialize_debate_two(question, choices, key_to_num)
    a_res = initial["a"]
    b_res = initial["b"]

    init_a = a_res["choice"]
    init_b = b_res["choice"]

    if check_consensus_two([init_a, init_b]):
        final = next((c for c in [init_a, init_b] if c is not None), None)
        return {
            "failed": False,
            "consensus": True,
            "final_choice": final,
            "initial_choices": {"a": init_a, "b": init_b},
            "debate_history": [{"round": 0, "a": a_res, "b": b_res}],
            "stance_changes": {
                "a_changed": False,
                "b_changed": False,
                "a_changed_from_correct": False,
                "b_changed_from_correct": False,
            },
            "correct_choice": correct_num,
        }

    cur_a, cur_b = a_res, b_res
    history: List[Dict[str, Any]] = [{"round": 0, "a": a_res, "b": b_res}]

    for r in range(1, max_rounds + 1):
        a_res = model_a_responds_two(
            question,
            choices,
            key_to_num,
            cur_b["answer"],
            cur_b["choice"],
            cur_a["answer"],
            cur_a["choice"],
            r,
        )
        if check_consensus_two([a_res["choice"], cur_b["choice"]]):
            final = next((c for c in [a_res["choice"], cur_b["choice"]] if c is not None), None)
            return {
                "failed": False,
                "consensus": True,
                "final_choice": final,
                "initial_choices": {"a": init_a, "b": init_b},
                "debate_history": history + [{"round": r, "a": a_res, "b": cur_b}],
                "stance_changes": {
                    "a_changed": init_a != a_res["choice"],
                    "b_changed": False,
                    "a_changed_from_correct": bool(
                        correct_num and init_a == correct_num and a_res["choice"] != correct_num
                    ),
                    "b_changed_from_correct": False,
                },
                "correct_choice": correct_num,
            }
        cur_a = a_res

        b_res = model_b_responds_two(
            question,
            choices,
            key_to_num,
            cur_a["answer"],
            cur_a["choice"],
            cur_b["answer"],
            cur_b["choice"],
            r,
        )
        if check_consensus_two([cur_a["choice"], b_res["choice"]]):
            final = next((c for c in [cur_a["choice"], b_res["choice"]] if c is not None), None)
            return {
                "failed": False,
                "consensus": True,
                "final_choice": final,
                "initial_choices": {"a": init_a, "b": init_b},
                "debate_history": history + [{"round": r, "a": cur_a, "b": b_res}],
                "stance_changes": {
                    "a_changed": False,
                    "b_changed": init_b != b_res["choice"],
                    "a_changed_from_correct": False,
                    "b_changed_from_correct": bool(
                        correct_num and init_b == correct_num and b_res["choice"] != correct_num
                    ),
                },
                "correct_choice": correct_num,
            }
        cur_b = b_res
        history.append({"round": r, "a": cur_a, "b": cur_b})

    fa, fb = cur_a["choice"], cur_b["choice"]
    votes = [c for c in [fa, fb] if c is not None]
    stance = {
        "a_changed": init_a != fa,
        "b_changed": init_b != fb,
        "a_changed_from_correct": bool(correct_num and init_a == correct_num and fa != correct_num),
        "b_changed_from_correct": bool(correct_num and init_b == correct_num and fb != correct_num),
    }

    if not votes:
        return {
            "failed": True,
            "failure_reason": "no_valid_votes",
            "consensus": False,
            "final_choice": None,
            "initial_choices": {"a": init_a, "b": init_b},
            "debate_history": history,
            "stance_changes": stance,
            "correct_choice": correct_num,
            "vote_distribution": {},
        }

    if len(votes) == 2 and fa != fb:
        return {
            "failed": True,
            "failure_reason": "two_way_disagree",
            "consensus": False,
            "final_choice": None,
            "initial_choices": {"a": init_a, "b": init_b},
            "debate_history": history,
            "stance_changes": stance,
            "correct_choice": correct_num,
            "vote_distribution": dict(Counter(votes)),
        }

    # 仅剩一票有效（另一为 None）：采用该选项
    cnt = Counter(votes)
    final_choice, _count = cnt.most_common(1)[0]
    return {
        "failed": False,
        "consensus": False,
        "final_choice": final_choice,
        "initial_choices": {"a": init_a, "b": init_b},
        "debate_history": history,
        "stance_changes": stance,
        "correct_choice": correct_num,
    }


SUBDIR_INITIAL_CONSENSUS = "initial_consensus"
SUBDIR_AFTER_DEBATE = "after_debate"
SUBDIR_FAILED = "failed"
SUBDIR_ERRORS = "errors"


def is_initial_consensus_two(debate_result: Dict[str, Any]) -> bool:
    if not debate_result.get("consensus"):
        return False
    history = debate_result.get("debate_history") or []
    return len(history) == 1


def case_output_subdir(debate_result: Dict[str, Any]) -> str:
    if debate_result.get("failed"):
        return SUBDIR_FAILED
    if is_initial_consensus_two(debate_result):
        return SUBDIR_INITIAL_CONSENSUS
    return SUBDIR_AFTER_DEBATE


def build_case_json_payload(r: Dict[str, Any]) -> Dict[str, Any]:
    dr = r["debate_result"]
    base = {k: v for k, v in r.items() if k != "debate_result"}
    if is_initial_consensus_two(dr):
        return base
    out = dict(base)
    out["debate_result"] = dr
    return out


def process_single_case(item: Dict, idx: int, max_rounds: int) -> Dict[str, Any]:
    t0 = time.perf_counter()
    question = item["question"]
    options = item["options"]
    answer = item["answer"]
    gold_key = str(answer.get("original_key", "")).strip().upper()

    choices_str, key_to_num = benchbase_options_to_choices(options)
    correct_num = key_to_num.get(gold_key) if gold_key in key_to_num else letter_to_num(gold_key)
    if correct_num == 0:
        correct_num = None

    try:
        result = conduct_debate_two(question, choices_str, key_to_num, correct_num, max_rounds)
    except Exception as e:
        traceback.print_exc()
        elapsed = time.perf_counter() - t0
        return {
            "error": True,
            "idx": idx,
            "error_type": type(e).__name__,
            "error_message": str(e),
            "question": question,
            "choices": choices_str,
            "correct_answer": gold_key,
            "record": {"elapsed_seconds": round(elapsed, 3)},
        }

    if not result:
        elapsed = time.perf_counter() - t0
        return {
            "error": True,
            "idx": idx,
            "error_type": "NoResult",
            "error_message": "conduct_debate_two returned None (unexpected)",
            "question": question,
            "choices": choices_str,
            "correct_answer": gold_key,
            "record": {"elapsed_seconds": round(elapsed, 3)},
        }

    final = result.get("final_choice")
    pred_letter = num_to_letter(final) if final is not None else ""
    is_correct = final is not None and correct_num is not None and final == correct_num
    elapsed = time.perf_counter() - t0

    out: Dict[str, Any] = {
        "idx": idx,
        "question": question,
        "choices": choices_str,
        "correct_answer": gold_key,
        "correct_num": correct_num,
        "pred_letter": pred_letter,
        "pred_num": final,
        "is_correct": is_correct,
        "consensus": result["consensus"],
        "debate_result": result,
        "record": {"elapsed_seconds": round(elapsed, 3)},
    }
    if result.get("failed"):
        out["failure_reason"] = result.get("failure_reason")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="MCC 框架 - MedQA 双模型辩论 (Ollama)")
    parser.add_argument("-n", "--num_cases", type=int, default=None, help="处理题目数量，默认全部")
    parser.add_argument("-s", "--start_idx", type=int, default=0, help="起始索引")
    parser.add_argument("--max_rounds", type=int, default=MAX_DEBATE_ROUNDS, help="最大辩论轮数")
    parser.add_argument(
        "--output_dir",
        type=str,
        default=DEFAULT_OUTPUT_DIR,
        help="结果根目录（默认与三模型目录不同）",
    )
    args = parser.parse_args()

    ds = load_medqa(max_samples=args.num_cases)
    total = len(ds)
    end_idx = min(args.start_idx + (args.num_cases or total), total)
    indices = list(range(args.start_idx, end_idx))

    os.makedirs(args.output_dir, exist_ok=True)
    os.makedirs(os.path.join(args.output_dir, SUBDIR_INITIAL_CONSENSUS), exist_ok=True)
    os.makedirs(os.path.join(args.output_dir, SUBDIR_AFTER_DEBATE), exist_ok=True)
    os.makedirs(os.path.join(args.output_dir, SUBDIR_FAILED), exist_ok=True)
    os.makedirs(os.path.join(args.output_dir, SUBDIR_ERRORS), exist_ok=True)

    print("=" * 70)
    print("MCC MedQA - 双模型辩论 (Ollama)")
    print("=" * 70)
    print(f"Model A: {MODEL_A}")
    print(f"Model B: {MODEL_B}")
    print(f"Dataset: {DATASET_NAME} ({DATASET_SPLIT})")
    print(f"Output: {args.output_dir}")
    print(f"Cases: {indices[0]}-{indices[-1]} (total {len(indices)})")
    print("=" * 70)

    results = []
    benchmark_items_attempted = len(indices)
    for i in tqdm(indices, desc="MCC 2-LLM Debate"):
        item = ds[i]
        r = process_single_case(item, i, args.max_rounds)
        if r.get("error"):
            err_file = os.path.join(args.output_dir, SUBDIR_ERRORS, f"case_{i}.json")
            with open(err_file, "w", encoding="utf-8") as f:
                json.dump(r, f, ensure_ascii=False, indent=2)
            continue
        results.append(r)
        sub = case_output_subdir(r["debate_result"])
        case_file = os.path.join(args.output_dir, sub, f"case_{i}.json")
        with open(case_file, "w", encoding="utf-8") as f:
            json.dump(build_case_json_payload(r), f, ensure_ascii=False, indent=2)

    benchmark_items_completed = len(results)
    benchmark_items_exception_aborted = benchmark_items_attempted - benchmark_items_completed
    all_benchmark_items_completed = benchmark_items_exception_aborted == 0

    if results:
        gold = [num_to_letter(r["correct_num"]) if r["correct_num"] else "" for r in results]
        pred = [r["pred_letter"] for r in results]
        acc = float(accuracy_score(gold, pred))
    else:
        acc = None

    consensus_count = sum(1 for r in results if r["consensus"])
    failed_count = sum(1 for r in results if r["debate_result"].get("failed"))
    initial_consensus_count = sum(1 for r in results if is_initial_consensus_two(r["debate_result"]))
    after_debate_count = len(results) - initial_consensus_count - failed_count
    no_consensus_single_vote = sum(
        1 for r in results if not r["consensus"] and not r["debate_result"].get("failed")
    )

    summary = {
        "model_a": MODEL_A,
        "model_b": MODEL_B,
        "benchmark_items_attempted": benchmark_items_attempted,
        "benchmark_items_completed": benchmark_items_completed,
        "benchmark_items_exception_aborted": benchmark_items_exception_aborted,
        "all_benchmark_items_completed": all_benchmark_items_completed,
        "accuracy_note": (
            "Reported accuracy uses only benchmark_items_completed rows; "
            "exception-aborted items are excluded from both numerator and denominator."
        ),
        "total": benchmark_items_completed,
        "correct": sum(r["is_correct"] for r in results) if results else 0,
        "accuracy": acc,
        "consensus_count": consensus_count if results else 0,
        "initial_consensus_count": initial_consensus_count if results else 0,
        "after_debate_count": after_debate_count if results else 0,
        "failed_count": failed_count if results else 0,
        "no_consensus_single_valid_vote_count": no_consensus_single_vote if results else 0,
        "output_subdirs": {
            "initial_round_consensus": SUBDIR_INITIAL_CONSENSUS,
            "debated_or_single_vote_resolution": SUBDIR_AFTER_DEBATE,
            "two_way_disagree_or_no_valid_votes": SUBDIR_FAILED,
            "conduct_debate_exception": SUBDIR_ERRORS,
        },
    }
    summary_file = os.path.join(args.output_dir, "summary.json")
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 70)
    print("MCC 双模型辩论统计")
    print("=" * 70)
    print(f"计划评测题数: {benchmark_items_attempted}")
    print(f"成功跑完题数: {benchmark_items_completed}")
    print(f"异常中断题数 (→ {SUBDIR_ERRORS}/): {benchmark_items_exception_aborted}")
    print(f"全部题目均成功跑完: {all_benchmark_items_completed}")
    if results:
        print(f"正确数 (仅成功完成): {sum(r['is_correct'] for r in results)}")
        print(f"准确率 (分母=成功完成题数): {acc:.4%}")
        print(f"达成共识: {consensus_count} ({consensus_count/len(results):.2%})")
        print(f"首轮即共识 (→ {SUBDIR_INITIAL_CONSENSUS}/): {initial_consensus_count}")
        print(f"辩论后有一致答案或单方有效票 (→ {SUBDIR_AFTER_DEBATE}/): {after_debate_count}")
        print(f"其中未全体一致、靠单方有效选项: {no_consensus_single_vote}")
        print(f"双模型仍不一致或无有效票 (→ {SUBDIR_FAILED}/): {failed_count}")
    else:
        print("无成功完成的题目，未计算准确率。")
    print(f"汇总已保存: {summary_file}")
    print("=" * 70)


if __name__ == "__main__":
    main()
