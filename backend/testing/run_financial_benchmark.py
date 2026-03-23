from __future__ import annotations

import json
import re
import string
import time
from collections import Counter
from pathlib import Path
from typing import Optional

import pandas as pd
import requests
from tqdm import tqdm


# ============================================================
# 配置区
# ============================================================
OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat"

MODELS = [
    "qwen3.5:9b",
    "qwen2.5:14b",
]

# 第一次建议先 30，跑通后再改成 100 / None
MAX_SAMPLES: Optional[int] = 300

REQUEST_TIMEOUT = 600
MAX_RETRIES = 2

OUTPUT_DIR = Path("financebench_outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

# FinanceBench 开源 150 样本
DATA_URL = (
    "https://raw.githubusercontent.com/patronus-ai/financebench/main/data/"
    "financebench_open_source.jsonl"
)

SYSTEM_MESSAGE = """
You are a financial question answering assistant.

You must answer the user's financial question using only the provided context.

Rules:
- Return only the final answer
- Be concise
- Do not explain unless absolutely necessary
- If the answer is not supported by the context, return exactly: insufficient information
- Preserve units, dates, signs, and percentages if present
- Do not use outside knowledge
""".strip()


# ============================================================
# 文本评分工具
# ============================================================
def normalize_text(s: str) -> str:
    s = str(s).lower().strip()
    s = s.replace("\n", " ")
    s = "".join(ch for ch in s if ch not in string.punctuation)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def tokenize(s: str) -> list[str]:
    return normalize_text(s).split()


def exact_match_score(pred: str, gold: str) -> int:
    return int(normalize_text(pred) == normalize_text(gold))


def contains_gold_score(pred: str, gold: str) -> int:
    p = normalize_text(pred)
    g = normalize_text(gold)
    if not p or not g:
        return 0
    return int(g in p or p in g)


def token_f1_score(pred: str, gold: str) -> float:
    pred_tokens = tokenize(pred)
    gold_tokens = tokenize(gold)

    if not pred_tokens and not gold_tokens:
        return 1.0
    if not pred_tokens or not gold_tokens:
        return 0.0

    common = Counter(pred_tokens) & Counter(gold_tokens)
    num_same = sum(common.values())
    if num_same == 0:
        return 0.0

    precision = num_same / len(pred_tokens)
    recall = num_same / len(gold_tokens)
    return 2 * precision * recall / (precision + recall)


# ============================================================
# Ollama 调用
# ============================================================
def call_ollama_chat(
    model: str,
    question: str,
    context: str,
    timeout: int = REQUEST_TIMEOUT,
    retries: int = MAX_RETRIES,
) -> str:
    payload = {
        "model": model,
        "stream": False,
        "think": False,
        "keep_alive": "30m",
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_MESSAGE,
            },
            {
                "role": "user",
                "content": (
                    "Answer the financial question using only the context below.\n\n"
                    f"Question:\n{question}\n\n"
                    f"Context:\n{context}\n\n"
                    "Final answer:"
                ),
            },
        ],
        "options": {
            "temperature": 0,
            "num_predict": 96,
        },
    }

    last_error = None

    for attempt in range(retries + 1):
        try:
            resp = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
            msg = data.get("message", {})
            content = msg.get("content", "")
            return content.strip()

        except requests.exceptions.Timeout as e:
            last_error = e
            print(
                f"[WARN] Timeout | model={model} | "
                f"attempt={attempt + 1}/{retries + 1}"
            )

        except requests.exceptions.RequestException as e:
            last_error = e
            print(
                f"[WARN] Request failed | model={model} | "
                f"attempt={attempt + 1}/{retries + 1} | error={e}"
            )

        time.sleep(2)

    raise last_error


# ============================================================
# 数据加载
# ============================================================
def load_financebench(max_samples: Optional[int] = None) -> pd.DataFrame:
    resp = requests.get(DATA_URL, timeout=120)
    resp.raise_for_status()

    rows = []
    for line in resp.text.splitlines():
        line = line.strip()
        if not line:
            continue

        item = json.loads(line)

        evidence_list = item.get("evidence", [])
        if evidence_list:
            first_evidence = evidence_list[0]
            context = (
                first_evidence.get("evidence_text_full_page")
                or first_evidence.get("evidence_text")
                or ""
            )
            evidence_text = first_evidence.get("evidence_text", "")
            evidence_page_num = first_evidence.get("evidence_page_num")
        else:
            context = ""
            evidence_text = ""
            evidence_page_num = None

        rows.append(
            {
                "financebench_id": item.get("financebench_id", ""),
                "company": item.get("company", ""),
                "doc_name": item.get("doc_name", ""),
                "question": item.get("question", ""),
                "gold_answer": item.get("answer", ""),
                "justification": item.get("justification", ""),
                "question_type": item.get("question_type", ""),
                "question_reasoning": item.get("question_reasoning", ""),
                "context": context,
                "evidence_text": evidence_text,
                "evidence_page_num": evidence_page_num,
            }
        )

    df = pd.DataFrame(rows)

    df = df[
        (df["question"].fillna("").str.strip() != "")
        & (df["gold_answer"].fillna("").str.strip() != "")
        & (df["context"].fillna("").str.strip() != "")
    ].reset_index(drop=True)

    if max_samples is not None and len(df) > max_samples:
        df = df.sample(n=max_samples, random_state=42).reset_index(drop=True)

    return df


# ============================================================
# 预热 / 评测
# ============================================================
def warmup_model(model_name: str) -> None:
    print("=" * 70)
    print(f"Warming up model: {model_name}")
    print("=" * 70)

    q = "What was the company's net income?"
    c = "The company reported net income of $12 million for the fiscal year."

    start = time.perf_counter()
    raw = call_ollama_chat(model=model_name, question=q, context=c)
    elapsed = time.perf_counter() - start

    print(f"Warmup response: {raw!r}")
    print(f"Warmup latency: {elapsed:.2f}s")
    print()


def evaluate_model(model_name: str, df: pd.DataFrame) -> dict:
    predictions = []
    latencies = []
    error_flags = []
    error_messages = []
    exact_matches = []
    contains_gold = []
    token_f1s = []

    progress_bar = tqdm(
        df.itertuples(index=False),
        total=len(df),
        desc=f"Running {model_name}",
    )

    for row in progress_bar:
        try:
            start = time.perf_counter()
            pred = call_ollama_chat(
                model=model_name,
                question=row.question,
                context=row.context,
            )
            elapsed = time.perf_counter() - start

            em = exact_match_score(pred, row.gold_answer)
            cg = contains_gold_score(pred, row.gold_answer)
            f1 = token_f1_score(pred, row.gold_answer)

            predictions.append(pred)
            latencies.append(elapsed)
            error_flags.append(False)
            error_messages.append("")
            exact_matches.append(em)
            contains_gold.append(cg)
            token_f1s.append(f1)

            progress_bar.set_postfix(
                {
                    "last_f1": f"{f1:.2f}",
                    "latency_s": f"{elapsed:.1f}",
                }
            )

        except Exception as e:
            predictions.append("")
            latencies.append(float("nan"))
            error_flags.append(True)
            error_messages.append(str(e))
            exact_matches.append(0)
            contains_gold.append(0)
            token_f1s.append(0.0)

            progress_bar.set_postfix(
                {
                    "last_f1": "ERR",
                    "latency_s": "NA",
                }
            )

            print(f"\n[ERROR] model={model_name}")
            print(f"Question: {row.question}")
            print(f"Gold: {row.gold_answer}")
            print(f"Error: {e}\n")

    out_df = df.copy()
    out_df["model"] = model_name
    out_df["prediction"] = predictions
    out_df["latency_sec"] = latencies
    out_df["error"] = error_flags
    out_df["error_message"] = error_messages
    out_df["exact_match"] = exact_matches
    out_df["contains_gold"] = contains_gold
    out_df["token_f1"] = token_f1s

    safe_name = model_name.replace(":", "_")
    out_csv = OUTPUT_DIR / f"{safe_name}_predictions.csv"
    out_df.to_csv(out_csv, index=False, encoding="utf-8-sig")

    valid_latency = out_df["latency_sec"].dropna()
    avg_latency = valid_latency.mean() if len(valid_latency) > 0 else float("nan")

    summary = {
        "model": model_name,
        "samples": len(out_df),
        "exact_match_rate": out_df["exact_match"].mean(),
        "contains_gold_rate": out_df["contains_gold"].mean(),
        "avg_token_f1": out_df["token_f1"].mean(),
        "avg_latency_sec": avg_latency,
        "error_count": int(out_df["error"].sum()),
        "output_csv": str(out_csv),
    }

    return summary


def print_dataset_info(df: pd.DataFrame) -> None:
    print("=" * 70)
    print("Loading FinanceBench open-source benchmark...")
    print("=" * 70)
    print(f"Loaded samples: {len(df)}")
    if len(df) > 0:
        print("\nSample question:")
        print(df.iloc[0]["question"])
        print(f"Gold answer: {df.iloc[0]['gold_answer']}")
        print(f"Company: {df.iloc[0]['company']}")
        print(f"Doc: {df.iloc[0]['doc_name']}")
    print()


def print_final_summary(summary_df: pd.DataFrame, summary_path: Path) -> None:
    print("\n" + "=" * 70)
    print("FINAL SCORE COMPARISON")
    print("=" * 70)
    print(summary_df.to_string(index=False))
    print(f"\nSaved summary to: {summary_path.resolve()}")
    print(f"Detailed outputs saved in: {OUTPUT_DIR.resolve()}")


def main() -> None:
    df = load_financebench(MAX_SAMPLES)
    print_dataset_info(df)

    for model in MODELS:
        warmup_model(model)

    results = []
    for model in MODELS:
        print("=" * 70)
        print(f"Evaluating model: {model}")
        print("=" * 70)
        result = evaluate_model(model, df)
        results.append(result)

    summary_df = pd.DataFrame(results).sort_values(
        by=["avg_token_f1", "contains_gold_rate", "exact_match_rate"],
        ascending=False,
    )

    summary_path = OUTPUT_DIR / "summary.csv"
    summary_df.to_csv(summary_path, index=False, encoding="utf-8-sig")

    print_final_summary(summary_df, summary_path)


if __name__ == "__main__":
    main()