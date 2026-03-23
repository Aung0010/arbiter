from __future__ import annotations

import re
import time
from typing import Optional, List, Dict

import requests
from datasets import load_dataset
from tqdm import tqdm
from sklearn.metrics import accuracy_score


# =========================
# 配置区
# =========================

# 本地 Ollama 服务地址
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"

# 要测试的本地模型名称（来自 `ollama list`）
MODEL_NAME = "qwen2.5:14b"

# 使用 BenchBase 规范化后的 MedQA 数据集
DATASET_NAME = "Layered-Labs/benchbase-medqa"
DATASET_SPLIT = "test"

# 为了先快速试跑，可以限制样本数量；设为 None 则跑完整测试集
MAX_SAMPLES: Optional[int] = None


# =========================
# 工具函数
# =========================

def call_ollama(model: str, prompt: str, timeout: int = 120) -> str:
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


def build_prompt(question: str, options: List[Dict[str, str]]) -> str:
    """
    将 BenchBase MedQA 的题目与选项转成 LLM 提示词。
    options 元素形如: {"original_key": "A", "text": "..."}。
    """
    options_text = "\n".join(
        f"{opt['original_key']}. {opt['text']}" for opt in options
    )

    system_instruction = """
You are a medical expert answering USMLE-style multiple-choice questions.

Task:
- Read the clinical question and the four answer options.
- Choose the single best answer.

Output rules:
- ONLY output one capital letter: A, B, C, or D.
- Do NOT output any explanation.
- Do NOT output anything except the letter.
""".strip()

    prompt = (
        f"{system_instruction}\n\n"
        f"Question:\n{question}\n\n"
        f"Options:\n{options_text}\n\n"
        f"Answer (A/B/C/D):"
    )
    return prompt


def normalize_choice(text: str) -> str:
    """
    从模型输出中提取选项字母（A/B/C/D）。
    """
    if not text:
        return ""

    text = text.strip().upper()

    # 先尝试直接匹配单个字母
    m = re.search(r"\b([ABCD])\b", text)
    if m:
        return m.group(1)

    # 如果输出里带有 like "Answer: B" 这种，也会被上面的 regex 捕捉到
    # 再兜底：看第一个字母
    for ch in text:
        if ch in {"A", "B", "C", "D"}:
            return ch

    return ""


def load_medqa(max_samples: Optional[int] = None):
    """
    加载 BenchBase MedQA 的 test split，并根据需要进行下采样。
    """
    ds = load_dataset(DATASET_NAME)[DATASET_SPLIT]

    if max_samples is not None and len(ds) > max_samples:
        ds = ds.shuffle(seed=42).select(range(max_samples))

    return ds


def evaluate_model(model_name: str, max_samples: Optional[int] = None) -> None:
    ds = load_medqa(max_samples=max_samples)

    gold_choices: List[str] = []
    pred_choices: List[str] = []

    for item in tqdm(ds, desc=f"Running {model_name} on MedQA ({DATASET_SPLIT})"):
        question: str = item["question"]
        options: List[Dict[str, str]] = item["options"]
        answer: Dict[str, str] = item["answer"]

        gold = str(answer.get("original_key", "")).strip().upper()

        prompt = build_prompt(question, options)

        start = time.perf_counter()
        raw = call_ollama(model_name, prompt)
        _ = time.perf_counter() - start  # 目前只简单丢弃耗时，可后续扩展

        pred = normalize_choice(raw)

        gold_choices.append(gold)
        pred_choices.append(pred)

    acc = accuracy_score(gold_choices, pred_choices)

    total = len(gold_choices)
    correct = sum(g == p for g, p in zip(gold_choices, pred_choices))

    print("=" * 70)
    print(f"Model: {model_name}")
    print(f"Dataset: {DATASET_NAME} (split='{DATASET_SPLIT}')")
    print(f"Samples evaluated: {total}")
    print(f"Correct: {correct}")
    print(f"Accuracy: {acc:.4%}")
    print("=" * 70)


def main() -> None:
    print("=" * 70)
    print("Running MedQA benchmark (BenchBase) with local Ollama model")
    print("=" * 70)
    print(f"Model: {MODEL_NAME}")
    print(f"Dataset: {DATASET_NAME} (split='{DATASET_SPLIT}')")
    print(f"MAX_SAMPLES: {MAX_SAMPLES!r}")
    print()

    evaluate_model(MODEL_NAME, max_samples=MAX_SAMPLES)


if __name__ == "__main__":
    main()

