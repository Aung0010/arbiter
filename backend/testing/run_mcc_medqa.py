"""
MCC (Model Confrontation & Collaboration) 框架 - MedQA 多模型辩论

基于 MCC-code/MCC_MedQA.py 的架构，将 GPT/Qwen/DeepSeek API 调用
替换为本地 Ollama 平台上的三个 3B 模型。

使用 BenchBase 规范化的 MedQA 数据集：Layered-Labs/benchbase-medqa
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import json
import os
import re
import sys
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

# 本地 Ollama 服务地址
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"

# 三个 3B 模型（来自 ollama list，可替换为其他 3B 级别模型）
MODEL_A = "qwen2.5:3b"   # 对应原框架中的 "GPT" 角色
MODEL_B = "llama3.2:3b"  # 对应原框架中的 "Qwen" 角色
MODEL_C = "gemma2:2b"    # 对应原框架中的 "DeepSeek" 角色

# BenchBase MedQA 数据集
DATASET_NAME = "Layered-Labs/benchbase-medqa"
DATASET_SPLIT = "test"

# 最大辩论轮数
MAX_DEBATE_ROUNDS = 3

# API 超时（秒）
OLLAMA_TIMEOUT = 300


# =========================
# 工具函数
# =========================

def call_ollama(model: str, prompt: str, timeout: int = OLLAMA_TIMEOUT) -> str:
    """调用 Ollama /api/generate 接口"""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0,
        },
    }
    resp = requests.post(OLLAMA_URL, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    return data.get("response", "").strip()


def letter_to_num(letter: str) -> int:
    """A->1, B->2, C->3, D->4"""
    if not letter:
        return 0
    c = letter.strip().upper()
    if c in "ABCD":
        return ord(c) - ord("A") + 1
    return 0


def num_to_letter(num: int) -> str:
    """1->A, 2->B, 3->C, 4->D"""
    if 1 <= num <= 4:
        return chr(ord("A") + num - 1)
    return ""


def benchbase_options_to_choices(options: List[Dict[str, str]]) -> tuple[str, Dict[int, str]]:
    """
    将 BenchBase 的 options 转为 MCC 的 choices 格式。
    options: [{"original_key": "A", "text": "..."}, ...]

    返回:
        choices_str: "1. xxx\\n2. xxx\\n3. xxx\\n4. xxx"
        key_to_num: {"A": 1, "B": 2, ...} 用于 correct answer 映射
    """
    # 按 original_key 排序保证顺序
    sorted_opts = sorted(options, key=lambda x: str(x.get("original_key", "")).upper())
    lines = []
    key_to_num = {}
    for i, opt in enumerate(sorted_opts):
        num = i + 1
        key = str(opt.get("original_key", chr(ord("A") + i))).strip().upper()
        text = opt.get("text", "")
        key_to_num[key] = num
        lines.append(f"{num}. {text}")
    return "\n".join(lines), dict(key_to_num)


def load_medqa(max_samples: Optional[int] = None):
    """加载 BenchBase MedQA 数据集"""
    ds = load_dataset(DATASET_NAME)[DATASET_SPLIT]
    if max_samples is not None and len(ds) > max_samples:
        ds = ds.shuffle(seed=42).select(range(max_samples))
    return ds


# =========================
# 答案提取 (支持 Option X 与 A/B/C/D)
# =========================

def extract_model_choice(answer_text: str, choices_text: str, key_to_num: Dict[str, int]) -> Optional[int]:
    """
    从模型输出中提取选项编号 (1-4)。
    支持: "Option X", "My final selection is Option X", 以及直接的 A/B/C/D。
    """
    if not answer_text:
        return None

    clean_answer = re.sub(r"\*\*([^*]+)\*\*", r"\1", answer_text)

    # 解析 choices 构建 option_content -> num 映射
    option_content_to_num = {}
    choice_lines = choices_text.strip().split("\n")
    for line in choice_lines:
        match = re.match(r"(\d+)\.\s*(.+)", line.strip())
        if match:
            option_num = int(match.group(1))
            option_content = match.group(2).strip()
            option_content_to_num[option_content.lower()] = option_num
            if " " in option_content:
                short_name = option_content.split()[0].lower()
                option_content_to_num[short_name] = option_num

    # 1. 优先匹配 "Option X" 或 "option X"
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

    # 2. 匹配 A/B/C/D 字母
    text_upper = clean_answer.strip().upper()
    for ch in "DCBA":  # 从后往前，倾向于取结论部分的字母
        if ch in text_upper:
            idx = text_upper.rfind(ch)
            # 确保是独立字母（前后不是字母）
            before = text_upper[max(0, idx - 1)] if idx > 0 else " "
            after = text_upper[idx + 1] if idx + 1 < len(text_upper) else " "
            if not before.isalpha() and not after.isalpha():
                return key_to_num.get(ch, letter_to_num(ch))

    m = re.search(r"\b([ABCD])\b", text_upper)
    if m:
        return key_to_num.get(m.group(1), letter_to_num(m.group(1)))

    return None


# =========================
# Prompt 构建
# =========================

def get_initial_prompt(question: str, choices: str, model_role: str) -> str:
    """初始作答 prompt（简化版，适配 3B 模型）"""
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


def get_debate_prompt(
    question: str,
    choices: str,
    other_a_answer: str,
    other_a_choice: Optional[int],
    other_b_answer: str,
    other_b_choice: Optional[int],
    self_previous_answer: Optional[str],
    self_previous_choice: Optional[int],
    round_num: int,
    model_self: str,
    model_a: str,
    model_b: str,
) -> str:
    """辩论轮次 prompt"""
    choice_to_text = {}
    for line in choices.strip().split("\n"):
        m = re.match(r"(\d+)\.\s*(.+)", line.strip())
        if m:
            choice_to_text[int(m.group(1))] = m.group(2).strip()

    other_a_text = choice_to_text.get(other_a_choice, "?") if other_a_choice else "?"
    other_b_text = choice_to_text.get(other_b_choice, "?") if other_b_choice else "?"
    self_text = choice_to_text.get(self_previous_choice, "?") if self_previous_choice else "?"

    prev_block = ""
    if self_previous_answer and self_previous_choice:
        prev_block = f"""
[Your Previous Analysis]
{self_previous_answer}
[Your Previous Choice]: Option {self_previous_choice} ({self_text})
Consider whether to maintain or change your view based on others' arguments.
"""

    return f"""You are {model_self} in a medical diagnosis debate with {model_a} and {model_b}.

[Medical Question]
{question}

[Options]
{choices}
{prev_block}

[{model_a}'s Analysis]
{other_a_answer}
[{model_a}'s Choice]: Option {other_a_choice} ({other_a_text})

[{model_b}'s Analysis]
{other_b_answer}
[{model_b}'s Choice]: Option {other_b_choice} ({other_b_text})

Critically evaluate their viewpoints. State whether you agree or disagree. Give your final answer.
You MUST end with: "My final selection is: Option X (...)" or "Option X".

Round {round_num} - Your response:"""


# =========================
# 模型调用 (统一用 Ollama)
# =========================

def model_a_answer(question: str, choices: str) -> str:
    """Model A 初始回答"""
    prompt = get_initial_prompt(question, choices, MODEL_A)
    return call_ollama(MODEL_A, prompt)


def model_b_answer(question: str, choices: str) -> str:
    """Model B 初始回答"""
    prompt = get_initial_prompt(question, choices, MODEL_B)
    return call_ollama(MODEL_B, prompt)


def model_c_answer(question: str, choices: str) -> str:
    """Model C 初始回答"""
    prompt = get_initial_prompt(question, choices, MODEL_C)
    return call_ollama(MODEL_C, prompt)


def model_a_responds(
    question: str,
    choices: str,
    key_to_num: Dict[str, int],
    b_answer: str,
    b_choice: Optional[int],
    c_answer: str,
    c_choice: Optional[int],
    self_prev_answer: Optional[str],
    self_prev_choice: Optional[int],
    round_num: int,
) -> Dict[str, Any]:
    """Model A 回应 B 和 C"""
    prompt = get_debate_prompt(
        question, choices,
        b_answer, b_choice, c_answer, c_choice,
        self_prev_answer, self_prev_choice, round_num,
        MODEL_A, MODEL_B, MODEL_C,
    )
    answer = call_ollama(MODEL_A, prompt)
    choice = extract_model_choice(answer, choices, key_to_num)
    return {"answer": answer, "choice": choice}


def model_b_responds(
    question: str,
    choices: str,
    key_to_num: Dict[str, int],
    a_answer: str,
    a_choice: Optional[int],
    c_answer: str,
    c_choice: Optional[int],
    self_prev_answer: Optional[str],
    self_prev_choice: Optional[int],
    round_num: int,
) -> Dict[str, Any]:
    """Model B 回应 A 和 C"""
    prompt = get_debate_prompt(
        question, choices,
        a_answer, a_choice, c_answer, c_choice,
        self_prev_answer, self_prev_choice, round_num,
        MODEL_B, MODEL_A, MODEL_C,
    )
    answer = call_ollama(MODEL_B, prompt)
    choice = extract_model_choice(answer, choices, key_to_num)
    return {"answer": answer, "choice": choice}


def model_c_responds(
    question: str,
    choices: str,
    key_to_num: Dict[str, int],
    a_answer: str,
    a_choice: Optional[int],
    b_answer: str,
    b_choice: Optional[int],
    self_prev_answer: Optional[str],
    self_prev_choice: Optional[int],
    round_num: int,
) -> Dict[str, Any]:
    """Model C 回应 A 和 B"""
    prompt = get_debate_prompt(
        question, choices,
        a_answer, a_choice, b_answer, b_choice,
        self_prev_answer, self_prev_choice, round_num,
        MODEL_C, MODEL_A, MODEL_B,
    )
    answer = call_ollama(MODEL_C, prompt)
    choice = extract_model_choice(answer, choices, key_to_num)
    return {"answer": answer, "choice": choice}


# =========================
# MCC 辩论核心逻辑
# =========================

def check_consensus(choices: List[Optional[int]]) -> bool:
    """检查是否达成共识"""
    valid = [c for c in choices if c is not None]
    if not valid:
        return False
    return all(c == valid[0] for c in valid)


def initialize_debate(question: str, choices: str, key_to_num: Dict[str, int]) -> Dict[str, Dict[str, Any]]:
    """并行获取三个模型的初始回答"""
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        fa = executor.submit(model_a_answer, question, choices)
        fb = executor.submit(model_b_answer, question, choices)
        fc = executor.submit(model_c_answer, question, choices)

        for future, key in [(fa, "a"), (fb, "b"), (fc, "c")]:
            try:
                answer = future.result()
                choice = extract_model_choice(answer, choices, key_to_num)
                results[key] = {"answer": answer, "choice": choice}
            except Exception as e:
                results[key] = {"answer": f"Error: {e}", "choice": None}

    return results


def conduct_debate(
    question: str,
    choices: str,
    key_to_num: Dict[str, int],
    correct_num: Optional[int],
    max_rounds: int = MAX_DEBATE_ROUNDS,
) -> Optional[Dict[str, Any]]:
    """
    执行完整辩论流程。
    correct_num: 正确答案对应的选项编号 (1-4)，若不知则传 None。
    """
    initial = initialize_debate(question, choices, key_to_num)
    a_res = initial["a"]
    b_res = initial["b"]
    c_res = initial["c"]

    init_a = a_res["choice"]
    init_b = b_res["choice"]
    init_c = c_res["choice"]

    if check_consensus([init_a, init_b, init_c]):
        final = next((c for c in [init_a, init_b, init_c] if c is not None), None)
        return {
            "consensus": True,
            "final_choice": final,
            "initial_choices": {"a": init_a, "b": init_b, "c": init_c},
            "debate_history": [{"round": 0, "a": a_res, "b": b_res, "c": c_res}],
            "stance_changes": {
                "a_changed": False, "b_changed": False, "c_changed": False,
                "a_changed_from_correct": False, "b_changed_from_correct": False, "c_changed_from_correct": False,
            },
            "correct_choice": correct_num,
        }

    cur_a, cur_b, cur_c = a_res, b_res, c_res
    history = [{"round": 0, "a": a_res, "b": b_res, "c": c_res}]

    for r in range(1, max_rounds + 1):
        # A 回应 B、C
        a_res = model_a_responds(
            question, choices, key_to_num,
            cur_b["answer"], cur_b["choice"], cur_c["answer"], cur_c["choice"],
            cur_a["answer"], cur_a["choice"], r,
        )
        if check_consensus([a_res["choice"], cur_b["choice"], cur_c["choice"]]):
            final = next((c for c in [a_res["choice"], cur_b["choice"], cur_c["choice"]] if c is not None), None)
            return {
                "consensus": True,
                "final_choice": final,
                "initial_choices": {"a": init_a, "b": init_b, "c": init_c},
                "debate_history": history + [{"round": r, "a": a_res, "b": cur_b, "c": cur_c}],
                "stance_changes": {
                    "a_changed": init_a != a_res["choice"], "b_changed": False, "c_changed": False,
                    "a_changed_from_correct": correct_num and init_a == correct_num and a_res["choice"] != correct_num,
                    "b_changed_from_correct": False, "c_changed_from_correct": False,
                },
                "correct_choice": correct_num,
            }
        cur_a = a_res

        # B 回应 A、C
        b_res = model_b_responds(
            question, choices, key_to_num,
            cur_a["answer"], cur_a["choice"], cur_c["answer"], cur_c["choice"],
            cur_b["answer"], cur_b["choice"], r,
        )
        if check_consensus([cur_a["choice"], b_res["choice"], cur_c["choice"]]):
            final = next((c for c in [cur_a["choice"], b_res["choice"], cur_c["choice"]] if c is not None), None)
            return {
                "consensus": True,
                "final_choice": final,
                "initial_choices": {"a": init_a, "b": init_b, "c": init_c},
                "debate_history": history + [{"round": r, "a": cur_a, "b": b_res, "c": cur_c}],
                "stance_changes": {
                    "a_changed": False, "b_changed": init_b != b_res["choice"], "c_changed": False,
                    "b_changed_from_correct": correct_num and init_b == correct_num and b_res["choice"] != correct_num,
                    "a_changed_from_correct": False, "c_changed_from_correct": False,
                },
                "correct_choice": correct_num,
            }
        cur_b = b_res

        # C 回应 A、B
        c_res = model_c_responds(
            question, choices, key_to_num,
            cur_a["answer"], cur_a["choice"], cur_b["answer"], cur_b["choice"],
            cur_c["answer"], cur_c["choice"], r,
        )
        if check_consensus([cur_a["choice"], cur_b["choice"], c_res["choice"]]):
            final = next((c for c in [cur_a["choice"], cur_b["choice"], c_res["choice"]] if c is not None), None)
            return {
                "consensus": True,
                "final_choice": final,
                "initial_choices": {"a": init_a, "b": init_b, "c": init_c},
                "debate_history": history + [{"round": r, "a": cur_a, "b": cur_b, "c": c_res}],
                "stance_changes": {
                    "a_changed": False, "b_changed": False, "c_changed": init_c != c_res["choice"],
                    "c_changed_from_correct": correct_num and init_c == correct_num and c_res["choice"] != correct_num,
                    "a_changed_from_correct": False, "b_changed_from_correct": False,
                },
                "correct_choice": correct_num,
            }
        cur_c = c_res
        history.append({"round": r, "a": cur_a, "b": cur_b, "c": cur_c})

    # 未达成共识：多数投票
    fa, fb, fc = cur_a["choice"], cur_b["choice"], cur_c["choice"]
    votes = [c for c in [fa, fb, fc] if c is not None]
    if not votes:
        return None
    cnt = Counter(votes)
    most = cnt.most_common(2)
    if not most:
        return None
    final_choice, count = most[0]
    # 若最高票数相同 (tie)，按原框架返回 None
    if len(most) > 1 and most[1][1] == count:
        return None

    return {
        "consensus": False,
        "final_choice": final_choice,
        "initial_choices": {"a": init_a, "b": init_b, "c": init_c},
        "debate_history": history,
        "stance_changes": {
            "a_changed": init_a != fa, "b_changed": init_b != fb, "c_changed": init_c != fc,
            "a_changed_from_correct": correct_num and init_a == correct_num and fa != correct_num,
            "b_changed_from_correct": correct_num and init_b == correct_num and fb != correct_num,
            "c_changed_from_correct": correct_num and init_c == correct_num and fc != correct_num,
        },
        "correct_choice": correct_num,
    }


# =========================
# 主流程
# =========================

def process_single_case(
    item: Dict,
    idx: int,
    max_rounds: int,
) -> Optional[Dict[str, Any]]:
    """处理单题"""
    question = item["question"]
    options = item["options"]
    answer = item["answer"]
    gold_key = str(answer.get("original_key", "")).strip().upper()

    choices_str, key_to_num = benchbase_options_to_choices(options)
    correct_num = key_to_num.get(gold_key) if gold_key in key_to_num else letter_to_num(gold_key)
    if correct_num == 0:
        correct_num = None

    try:
        result = conduct_debate(question, choices_str, key_to_num, correct_num, max_rounds)
    except Exception as e:
        traceback.print_exc()
        result = None

    if not result:
        return None

    final = result["final_choice"]
    pred_letter = num_to_letter(final) if final else ""
    is_correct = final == correct_num if correct_num else False

    return {
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
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="MCC 框架 - MedQA 三模型辩论 (Ollama 3B)")
    parser.add_argument("-n", "--num_cases", type=int, default=None, help="处理题目数量，默认全部")
    parser.add_argument("-s", "--start_idx", type=int, default=0, help="起始索引")
    parser.add_argument("--max_rounds", type=int, default=MAX_DEBATE_ROUNDS, help="最大辩论轮数")
    parser.add_argument("--output_dir", type=str, default="mcc_debate_results", help="结果输出目录")
    args = parser.parse_args()

    ds = load_medqa(max_samples=args.num_cases)
    total = len(ds)
    end_idx = min(args.start_idx + (args.num_cases or total), total)
    indices = list(range(args.start_idx, end_idx))

    os.makedirs(args.output_dir, exist_ok=True)
    log_file = os.path.join(args.output_dir, f"log_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")

    print("=" * 70)
    print("MCC MedQA - 三模型辩论 (Ollama 3B)")
    print("=" * 70)
    print(f"Model A: {MODEL_A}")
    print(f"Model B: {MODEL_B}")
    print(f"Model C: {MODEL_C}")
    print(f"Dataset: {DATASET_NAME} ({DATASET_SPLIT})")
    print(f"Cases: {indices[0]}-{indices[-1]} (total {len(indices)})")
    print("=" * 70)

    results = []
    for i in tqdm(indices, desc="MCC Debate"):
        item = ds[i]
        r = process_single_case(item, i, args.max_rounds)
        if r:
            results.append(r)
            case_file = os.path.join(args.output_dir, f"case_{i}.json")
            with open(case_file, "w", encoding="utf-8") as f:
                json.dump({k: v for k, v in r.items() if k != "debate_result"}, f, ensure_ascii=False, indent=2)

    if not results:
        print("No valid results.")
        return

    gold = [num_to_letter(r["correct_num"]) if r["correct_num"] else "" for r in results]
    pred = [r["pred_letter"] for r in results]
    acc = accuracy_score(gold, pred)
    consensus_count = sum(1 for r in results if r["consensus"])

    summary = {
        "model_a": MODEL_A,
        "model_b": MODEL_B,
        "model_c": MODEL_C,
        "total": len(results),
        "correct": sum(r["is_correct"] for r in results),
        "accuracy": acc,
        "consensus_count": consensus_count,
    }
    summary_file = os.path.join(args.output_dir, "summary.json")
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 70)
    print("MCC 辩论统计")
    print("=" * 70)
    print(f"总题数: {len(results)}")
    print(f"正确数: {sum(r['is_correct'] for r in results)}")
    print(f"准确率: {acc:.4%}")
    print(f"达成共识: {consensus_count} ({consensus_count/len(results):.2%})")
    print(f"汇总已保存: {summary_file}")
    print("=" * 70)


if __name__ == "__main__":
    main()
