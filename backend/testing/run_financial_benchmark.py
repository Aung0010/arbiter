from __future__ import annotations

import re
import json
import time
from pathlib import Path
from typing import Optional

import requests
import pandas as pd
from tqdm import tqdm
from datasets import load_dataset
from sklearn.metrics import accuracy_score, f1_score, classification_report


# ============================================================
# 配置区
# ============================================================
OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat"

MODELS = [
    "qwen3.5:9b",
    "qwen2.5:14b",
]

# 先小样本验证，确认没问题后改成 100 / 300 / None
MAX_SAMPLES: Optional[int] = 300

# 单次请求最长等待时间（秒）
REQUEST_TIMEOUT = 600

# 请求失败时的最大重试次数
MAX_RETRIES = 2

# 输出目录
OUTPUT_DIR = Path("benchmark_outputs_chat")
OUTPUT_DIR.mkdir(exist_ok=True)

# benchmark 配置
DATASET_NAME = "takala/financial_phrasebank"
DATASET_CONFIG = "sentences_allagree"

LABELS = ["negative", "neutral", "positive"]

SYSTEM_MESSAGE = """
You are a financial sentiment classifier.

Your task is to classify a financial news sentence into exactly one of these labels:
negative
neutral
positive

Rules:
- Return exactly one word
- Do not explain
- Do not add punctuation
- Do not output anything except one label
""".strip()


# ============================================================
# 工具函数
# ============================================================
def call_ollama_chat(
    model: str,
    sentence: str,
    timeout: int = REQUEST_TIMEOUT,
    retries: int = MAX_RETRIES,
) -> str:
    """
    调用 Ollama chat API。
    对 qwen3.5 关键点：
    - 使用 /api/chat
    - 顶层加入 think=False
    """
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
                    "Classify the sentiment of this financial sentence.\n\n"
                    f"Sentence: {sentence}\n\n"
                    "Return only one label: negative, neutral, or positive."
                ),
            },
        ],
        "options": {
            "temperature": 0,
            "num_predict": 64,
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


def normalize_label(text: str) -> str:
    """
    归一化模型输出到:
    negative / neutral / positive
    """
    if not text:
        return "neutral"

    text = text.strip().lower()

    match = re.search(r"\b(negative|neutral|positive)\b", text)
    if match:
        return match.group(1)

    if "neg" in text:
        return "negative"
    if "neu" in text:
        return "neutral"
    if "pos" in text:
        return "positive"

    return "neutral"


def load_financial_phrasebank(max_samples: Optional[int] = None) -> pd.DataFrame:
    """
    加载 Financial PhraseBank 数据集
    """
    ds = load_dataset(DATASET_NAME, DATASET_CONFIG)["train"]

    text_col = "sentence" if "sentence" in ds.column_names else "text"
    label_col = "label"

    label_feature = ds.features[label_col]
    if hasattr(label_feature, "names") and label_feature.names:
        id2label = {i: name.lower() for i, name in enumerate(label_feature.names)}
    else:
        id2label = {
            0: "negative",
            1: "neutral",
            2: "positive",
        }

    rows = []
    for item in ds:
        rows.append(
            {
                "text": item[text_col],
                "gold": id2label[int(item[label_col])],
            }
        )

    df = pd.DataFrame(rows)

    if max_samples is not None and len(df) > max_samples:
        sampled_parts = []
        total_len = len(df)

        for _, sub_df in df.groupby("gold"):
            ratio = len(sub_df) / total_len
            n = max(1, round(max_samples * ratio))
            n = min(n, len(sub_df))
            sampled_parts.append(sub_df.sample(n=n, random_state=42))

        df = (
            pd.concat(sampled_parts)
            .sample(frac=1.0, random_state=42)
            .reset_index(drop=True)
        )

        if len(df) > max_samples:
            df = df.iloc[:max_samples].copy()

    return df


def warmup_model(model_name: str) -> None:
    """
    正式 benchmark 前预热
    """
    print("=" * 70)
    print(f"Warming up model: {model_name}")
    print("=" * 70)

    start = time.perf_counter()
    raw = call_ollama_chat(
        model=model_name,
        sentence="The company reported stable quarterly earnings.",
        timeout=REQUEST_TIMEOUT,
        retries=MAX_RETRIES,
    )
    elapsed = time.perf_counter() - start

    print(f"Warmup response: {raw!r}")
    print(f"Warmup latency: {elapsed:.2f}s")
    print()


def evaluate_model(model_name: str, df: pd.DataFrame) -> dict:
    """
    对单个模型做评测
    """
    predictions = []
    raw_outputs = []
    latencies = []
    error_flags = []
    error_messages = []

    progress_bar = tqdm(
        df.itertuples(index=False),
        total=len(df),
        desc=f"Running {model_name}",
    )

    for row in progress_bar:
        sentence = row.text
        gold = row.gold

        try:
            start = time.perf_counter()
            raw = call_ollama_chat(
                model=model_name,
                sentence=sentence,
                timeout=REQUEST_TIMEOUT,
                retries=MAX_RETRIES,
            )
            elapsed = time.perf_counter() - start

            pred = normalize_label(raw)

            predictions.append(pred)
            raw_outputs.append(raw)
            latencies.append(elapsed)
            error_flags.append(False)
            error_messages.append("")

            progress_bar.set_postfix(
                {
                    "last_raw": raw[:20] if raw else "EMPTY",
                    "last_pred": pred,
                    "latency_s": f"{elapsed:.1f}",
                }
            )

        except Exception as e:
            # 单条失败时不中断整个 benchmark
            predictions.append("neutral")
            raw_outputs.append("")
            latencies.append(float("nan"))
            error_flags.append(True)
            error_messages.append(str(e))

            progress_bar.set_postfix(
                {
                    "last_raw": "ERROR",
                    "last_pred": "neutral",
                    "latency_s": "NA",
                }
            )

            print(f"\n[ERROR] model={model_name}")
            print(f"Sentence: {sentence}")
            print(f"Gold: {gold}")
            print(f"Error: {e}\n")

    out_df = df.copy()
    out_df["model"] = model_name
    out_df["prediction"] = predictions
    out_df["raw_output"] = raw_outputs
    out_df["latency_sec"] = latencies
    out_df["error"] = error_flags
    out_df["error_message"] = error_messages
    out_df["correct"] = out_df["gold"] == out_df["prediction"]

    valid_latency = out_df["latency_sec"].dropna()
    avg_latency = valid_latency.mean() if len(valid_latency) > 0 else float("nan")

    acc = accuracy_score(out_df["gold"], out_df["prediction"])
    macro_f1 = f1_score(out_df["gold"], out_df["prediction"], average="macro")

    report = classification_report(
        out_df["gold"],
        out_df["prediction"],
        labels=LABELS,
        digits=4,
        output_dict=True,
        zero_division=0,
    )

    safe_name = model_name.replace(":", "_")
    out_csv = OUTPUT_DIR / f"{safe_name}_predictions.csv"
    out_json = OUTPUT_DIR / f"{safe_name}_report.json"

    out_df.to_csv(out_csv, index=False, encoding="utf-8-sig")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    error_count = int(out_df["error"].sum())
    empty_output_count = int((out_df["raw_output"].fillna("") == "").sum())

    return {
        "model": model_name,
        "samples": len(out_df),
        "accuracy": acc,
        "macro_f1": macro_f1,
        "avg_latency_sec": avg_latency,
        "error_count": error_count,
        "empty_output_count": empty_output_count,
        "output_csv": str(out_csv),
        "output_report": str(out_json),
    }


def print_dataset_info(df: pd.DataFrame) -> None:
    print("=" * 70)
    print("Loading Financial PhraseBank benchmark...")
    print("=" * 70)
    print(f"Loaded samples: {len(df)}")
    print("\nLabel distribution:")
    print(df["gold"].value_counts())
    print()


def print_final_summary(summary_df: pd.DataFrame, summary_path: Path) -> None:
    print("\n" + "=" * 70)
    print("FINAL SCORE COMPARISON")
    print("=" * 70)
    print(summary_df.to_string(index=False))
    print(f"\nSaved summary to: {summary_path.resolve()}")
    print(f"Detailed outputs saved in: {OUTPUT_DIR.resolve()}")


def main() -> None:
    df = load_financial_phrasebank(MAX_SAMPLES)
    print_dataset_info(df)

    # 预热
    for model in MODELS:
        warmup_model(model)

    # 正式评测
    results = []
    for model in MODELS:
        print("=" * 70)
        print(f"Evaluating model: {model}")
        print("=" * 70)
        result = evaluate_model(model, df)
        results.append(result)

    summary_df = pd.DataFrame(results).sort_values(
        by=["macro_f1", "accuracy"],
        ascending=False,
    )

    summary_path = OUTPUT_DIR / "summary.csv"
    summary_df.to_csv(summary_path, index=False, encoding="utf-8-sig")

    print_final_summary(summary_df, summary_path)


if __name__ == "__main__":
    main()