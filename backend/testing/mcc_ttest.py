"""
配对样本 t 检验：MCC 系统最终答案 vs qwen3.5:cloud（Model C）首轮答案。

数据来源：mcc_debate_results/ 下 initial_consensus、after_debate、failed 中的 case_*.json
（不含 errors/）。

- 系统：pred_num（最终答案）是否与 correct_num 一致 → 二值 1/0
- Qwen：debate_history[0]["c"]["choice"]（首轮）；initial_consensus 无 history 时三模型首轮一致，用 pred_num 作为 C 的首轮选项

说明：二值配对数据更常用 McNemar 检验；本脚本提供配对 t 统计量，双侧 p 值用正态近似 t 分布（无 scipy 依赖）；并附 McNemar 精确二项与混淆表。

用法:
  cd arbiter/backend/testing && python mcc_ttest.py
  python mcc_ttest.py --results-root mcc_debate_results
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import math
import statistics
from typing import Any, Dict, List, Optional, Tuple


def _norm_cdf(z: float) -> float:
    """标准正态 CDF Φ(z)。"""
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def _paired_t_pvalue_two_sided(diff: List[float], n: int) -> Tuple[float, float, str]:
    """
    配对 t 检验：返回 (t 统计量, 双侧 p 值, 说明)。
    p 值在 n 较大时用正态近似 t；n 较小时仍给近似并注明。
    """
    mean_d = statistics.mean(diff)
    sd = statistics.stdev(diff) if n > 1 else 0.0
    if sd == 0:
        return (0.0, 1.0 if mean_d == 0 else 0.0, "zero variance of differences")
    se = sd / math.sqrt(n)
    t_stat = mean_d / se
    df = n - 1
    # 正态近似：t(df) 大样本 ~ N(0,1)；小样本时 p 为近似
    p_approx = 2.0 * (1.0 - _norm_cdf(abs(t_stat)))
    note = f"双侧 p 由正态分布近似 t 分布（df={df}）；二值配对亦可参考 McNemar"
    return (t_stat, p_approx, note)


def _binom_two_sided_p(k: int, n: int, p0: float = 0.5) -> float:
    """二项分布 H0: p=p0 的双侧 p 值（精确）：2 * min(P(X<=k), P(X>=k))。"""
    if n == 0:
        return 1.0

    def pmf(j: int) -> float:
        return math.comb(n, j) * (p0**j) * ((1.0 - p0) ** (n - j))

    p_le = sum(pmf(j) for j in range(0, k + 1))
    p_ge = sum(pmf(j) for j in range(k, n + 1))
    return min(2.0 * min(p_le, p_ge), 1.0)


def _get_correct_num(data: Dict[str, Any]) -> Optional[int]:
    n = data.get("correct_num")
    if n is not None:
        return int(n) if isinstance(n, (int, float)) else None
    letter = str(data.get("correct_answer", "")).strip().upper()
    if not letter:
        return None
    c0 = letter[0]
    if c0 in "ABCD":
        return ord(c0) - ord("A") + 1
    return None


def _qwen_round0_choice(data: Dict[str, Any], folder: str) -> Optional[int]:
    """Model C 在 round 0 的选项编号。"""
    if folder == "initial_consensus":
        p = data.get("pred_num")
        if p is None:
            return None
        return int(p)

    dr = data.get("debate_result") or {}
    hist = dr.get("debate_history") or []
    if not hist:
        return None
    blk = hist[0].get("c") or {}
    c = blk.get("choice")
    if c is None:
        return None
    return int(c) if isinstance(c, (int, float)) else None


def collect_pairs(results_root: str) -> Tuple[List[int], List[int], List[str], Dict[str, int]]:
    """
    返回 (system_correct_01, qwen_correct_01, paths, counts_meta)
    仅包含同时能定义系统最终答案与 Qwen 首轮答案的 case。
    """
    folders = ("initial_consensus", "after_debate", "failed")
    sys_scores: List[int] = []
    qwen_scores: List[int] = []
    paths: List[str] = []
    per_folder: Dict[str, int] = {f: 0 for f in folders}

    for folder in folders:
        d = os.path.join(results_root, folder)
        if not os.path.isdir(d):
            continue
        for path in sorted(glob.glob(os.path.join(d, "case_*.json"))):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if data.get("error"):
                continue

            cn = _get_correct_num(data)
            pred = data.get("pred_num")
            if cn is None:
                continue
            if pred is None:
                continue
            pred_i = int(pred)

            qw = _qwen_round0_choice(data, folder)
            if qw is None:
                continue

            sys_ok = 1 if pred_i == cn else 0
            qwen_ok = 1 if int(qw) == cn else 0

            sys_scores.append(sys_ok)
            qwen_scores.append(qwen_ok)
            paths.append(path)
            per_folder[folder] = per_folder.get(folder, 0) + 1

    meta = {
        "n": len(sys_scores),
        **{f"cases_from_{k}": v for k, v in per_folder.items()},
    }
    return sys_scores, qwen_scores, paths, meta


def mcnemar_contingency(
    sys_scores: List[int], qwen_scores: List[int]
) -> Dict[str, Any]:
    """both_wrong, both_right, sys_only_right, qwen_only_right"""
    b00 = b11 = b10 = b01 = 0
    for s, q in zip(sys_scores, qwen_scores):
        if s == 0 and q == 0:
            b00 += 1
        elif s == 1 and q == 1:
            b11 += 1
        elif s == 1 and q == 0:
            b10 += 1
        else:
            b01 += 1
    return {
        "both_wrong": b00,
        "both_right": b11,
        "system_right_qwen_wrong": b10,
        "qwen_right_system_wrong": b01,
    }


def mcnemar_test(b10: int, b01: int) -> Dict[str, Any]:
    """McNemar：不一致对上精确二项双侧检验。"""
    n_disc = b10 + b01
    if n_disc == 0:
        return {"discordant_n": 0, "pvalue_two_sided_binomial": None, "note": "no discordant pairs"}
    p = _binom_two_sided_p(b10, n_disc, 0.5)
    return {
        "discordant_n": n_disc,
        "system_wins_among_discordant": b10,
        "qwen_wins_among_discordant": b01,
        "pvalue_two_sided_binomial": float(p),
        "method": "exact binomial on discordant pairs (McNemar equivalent)",
    }


def paired_ttest(sys_scores: List[int], qwen_scores: List[int]) -> Dict[str, Any]:
    """配对 t 检验：H0: mean(system - qwen) = 0。"""
    n = len(sys_scores)
    if n < 2:
        return {"n": n, "statistic": None, "pvalue": None, "mean_diff": None, "note": "n too small"}

    diff = [float(s - q) for s, q in zip(sys_scores, qwen_scores)]
    mean_diff = statistics.mean(diff)
    mean_sys = sum(sys_scores) / n
    mean_q = sum(qwen_scores) / n

    t_stat, p_two, note = _paired_t_pvalue_two_sided(diff, n)
    return {
        "n": n,
        "mean_system_accuracy": mean_sys,
        "mean_qwen_round0_accuracy": mean_q,
        "mean_diff_system_minus_qwen": mean_diff,
        "paired_t_statistic": t_stat,
        "pvalue_two_sided": p_two,
        "df": n - 1,
        "pvalue_note": note,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="MCC 系统 vs Qwen 首轮 配对 t 检验")
    parser.add_argument("--results-root", default="mcc_debate_results", help="mcc_debate_results 根目录")
    args = parser.parse_args()
    root = args.results_root

    sys_scores, qwen_scores, _paths, meta = collect_pairs(root)
    n = meta["n"]

    cont = mcnemar_contingency(sys_scores, qwen_scores)
    t_res = paired_ttest(sys_scores, qwen_scores)
    mc = mcnemar_test(cont["system_right_qwen_wrong"], cont["qwen_right_system_wrong"])

    out: Dict[str, Any] = {
        "comparison": "MCC final (pred_num) vs Model C / qwen3.5:cloud round-0 choice",
        "results_root": os.path.abspath(root),
        "sample_meta": meta,
        "paired_ttest": t_res,
        "discordant_table": cont,
        "mcnemar": mc,
        "note": (
            "Positive mean_diff means system is correct more often than Qwen round-0 on the same items. "
            "McNemar tests equality of marginal accuracies using discordant pairs."
        ),
    }

    out_path = os.path.join(root, "mcc_ttest_result.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print("=" * 70)
    print("配对 t 检验：MCC 系统最终答案 vs qwen3.5:cloud（首轮 Model C）")
    print("=" * 70)
    print(f"结果目录: {os.path.abspath(root)}")
    print(f"配对样本量 n: {n}")
    print(f"  来源: initial_consensus={meta.get('cases_from_initial_consensus', 0)}, "
          f"after_debate={meta.get('cases_from_after_debate', 0)}, "
          f"failed={meta.get('cases_from_failed', 0)}")
    if n == 0:
        print("无可用样本（检查 pred_num、correct_num、debate_history[0].c）。")
        print(f"已写入: {out_path}")
        return

    print(f"系统准确率: {t_res.get('mean_system_accuracy', sum(sys_scores) / n):.4%}")
    print(f"Qwen 首轮准确率: {t_res.get('mean_qwen_round0_accuracy', sum(qwen_scores) / n):.4%}")
    print(f"均值差 (系统 − Qwen): {t_res.get('mean_diff_system_minus_qwen', 0):.6f}")
    if t_res.get("paired_t_statistic") is not None:
        print(f"配对 t 统计量: {t_res['paired_t_statistic']:.6f}")
    if t_res.get("pvalue_two_sided") is not None:
        print(f"双侧 p 值 (正态近似): {t_res['pvalue_two_sided']:.6g}")
    if t_res.get("pvalue_note"):
        print(f"  ({t_res['pvalue_note']})")

    print("-" * 70)
    print("混淆（同一题上谁对）:")
    print(f"  皆错: {cont['both_wrong']}  皆对: {cont['both_right']}")
    print(f"  仅系统对: {cont['system_right_qwen_wrong']}  仅 Qwen 对: {cont['qwen_right_system_wrong']}")
    if mc and mc.get("pvalue_two_sided_binomial") is not None:
        print(f"McNemar（二项精确，不一致对子）p = {mc['pvalue_two_sided_binomial']:.6g}")
    elif mc and mc.get("note"):
        print(f"McNemar: {mc.get('note')}")
    print("=" * 70)
    print(f"完整结果: {out_path}")


if __name__ == "__main__":
    main()
