#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
McNemar 检验：MCC 系统最终答案 vs qwen3.5:cloud（Model C）首轮答案。

默认从本脚本所在目录读取 initial_consensus/、after_debate/、failed/ 下的 case_*.json
（与 mcc_ttest.py 相同定义；不含 errors/）。

输出：混淆表、不一致对子上的精确二项检验（McNemar 等价）、带/不带连续校正的 χ² 统计量及 χ²(1) 上侧 p 值。

用法（可在任意目录执行）:
  python mcc_mcnemar.py
  python /path/to/mcc_debate_results/mcc_mcnemar.py
  python mcc_mcnemar.py --results-root /path/to/mcc_debate_results
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
from typing import Any, Dict, List, Optional, Tuple


def _norm_cdf(z: float) -> float:
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def _chi2_1df_sf(x: float) -> float:
    """P(χ²(1) > x)，x>0。"""
    if x <= 0:
        return 1.0
    z = math.sqrt(x)
    return 2.0 * (1.0 - _norm_cdf(z))


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


def build_contingency(results_root: str) -> Tuple[Dict[str, int], Dict[str, int], int]:
    """
    返回 (2x2 计数, 各子目录样本量, 总有效 n)。
    键: both_wrong, both_right, system_right_qwen_wrong, qwen_right_system_wrong
    """
    folders = ("initial_consensus", "after_debate", "failed")
    counts = {"both_wrong": 0, "both_right": 0, "system_right_qwen_wrong": 0, "qwen_right_system_wrong": 0}
    per_folder = {f: 0 for f in folders}
    n_total = 0

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
            if cn is None or pred is None:
                continue
            pred_i = int(pred)
            qw = _qwen_round0_choice(data, folder)
            if qw is None:
                continue

            sys_ok = pred_i == cn
            qwen_ok = int(qw) == cn
            n_total += 1
            per_folder[folder] += 1

            if not sys_ok and not qwen_ok:
                counts["both_wrong"] += 1
            elif sys_ok and qwen_ok:
                counts["both_right"] += 1
            elif sys_ok and not qwen_ok:
                counts["system_right_qwen_wrong"] += 1
            else:
                counts["qwen_right_system_wrong"] += 1

    return counts, per_folder, n_total


def binom_exact_two_sided(k: int, n: int, p0: float = 0.5) -> float:
    """H0: p=p0，双侧精确 p：2 * min(P(X<=k), P(X>=k))。"""
    if n == 0:
        return 1.0

    def pmf(j: int) -> float:
        return math.comb(n, j) * (p0**j) * ((1.0 - p0) ** (n - j))

    p_le = sum(pmf(j) for j in range(0, k + 1))
    p_ge = sum(pmf(j) for j in range(k, n + 1))
    return min(2.0 * min(p_le, p_ge), 1.0)


def mcnemar_chi2(b10: int, b01: int, continuity_correction: bool) -> float:
    """McNemar χ²；b10=仅系统对，b01=仅 Qwen 对。"""
    d = b10 + b01
    if d == 0:
        return 0.0
    if continuity_correction:
        num = abs(b10 - b01) - 1.0
        num = max(num, 0.0)
        return (num**2) / d
    return ((b10 - b01) ** 2) / d


def run_mcnemar(results_root: str) -> Dict[str, Any]:
    counts, per_folder, n_total = build_contingency(results_root)
    b10 = counts["system_right_qwen_wrong"]
    b01 = counts["qwen_right_system_wrong"]
    n_disc = b10 + b01

    p_exact = binom_exact_two_sided(b10, n_disc, 0.5) if n_disc > 0 else None

    chi2_raw = mcnemar_chi2(b10, b01, continuity_correction=False)
    chi2_cc = mcnemar_chi2(b10, b01, continuity_correction=True)

    p_chi2_raw = _chi2_1df_sf(chi2_raw) if chi2_raw > 0 else 1.0
    p_chi2_cc = _chi2_1df_sf(chi2_cc) if chi2_cc > 0 else 1.0

    return {
        "results_root": os.path.abspath(results_root),
        "comparison": "MCC final (pred_num) vs Model C / qwen3.5:cloud round-0 choice",
        "n_valid_pairs": n_total,
        "cases_per_subfolder": per_folder,
        "contingency_2x2": counts,
        "discordant_pairs": {
            "n": n_disc,
            "system_right_qwen_wrong_b10": b10,
            "qwen_right_system_wrong_b01": b01,
        },
        "mcnemar_exact_binomial_two_sided_p": p_exact,
        "mcnemar_chi2_without_continuity_correction": {
            "statistic": chi2_raw,
            "p_value_upper_tail_chi2_1df": p_chi2_raw,
        },
        "mcnemar_chi2_with_continuity_correction": {
            "statistic": chi2_cc,
            "p_value_upper_tail_chi2_1df": p_chi2_cc,
        },
        "note": (
            "Exact binomial tests H0: P(system right | discordant)=0.5. "
            "Chi-square statistics follow McNemar formulas; p is P(χ²(1) > stat)."
        ),
    }


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="McNemar 检验（MCC vs Qwen 首轮）")
    parser.add_argument(
        "--results-root",
        default=here,
        help="含 initial_consensus / after_debate / failed 的目录，默认为本脚本所在目录",
    )
    args = parser.parse_args()

    out = run_mcnemar(args.results_root)
    out_path = os.path.join(args.results_root, "mcc_mcnemar_result.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    c = out["contingency_2x2"]
    d = out["discordant_pairs"]
    print("=" * 70)
    print("McNemar 检验（MCC 系统 vs qwen3.5:cloud 首轮）")
    print("=" * 70)
    print(f"结果目录: {out['results_root']}")
    print(f"有效配对 n: {out['n_valid_pairs']}")
    print(f"子目录计数: {out['cases_per_subfolder']}")
    print("2×2 混淆:")
    print(f"  皆错: {c['both_wrong']}  皆对: {c['both_right']}")
    print(f"  仅系统对 (b10): {c['system_right_qwen_wrong']}  仅 Qwen 对 (b01): {c['qwen_right_system_wrong']}")
    print(f"不一致对子 n = b10+b01 = {d['n']}")
    if d["n"] > 0:
        print(f"McNemar 精确二项双侧 p: {out['mcnemar_exact_binomial_two_sided_p']:.6g}")
        print(f"χ² (无校正) = {out['mcnemar_chi2_without_continuity_correction']['statistic']:.6f}, "
              f"p ≈ {out['mcnemar_chi2_without_continuity_correction']['p_value_upper_tail_chi2_1df']:.6g}")
        print(f"χ² (连续校正) = {out['mcnemar_chi2_with_continuity_correction']['statistic']:.6f}, "
              f"p ≈ {out['mcnemar_chi2_with_continuity_correction']['p_value_upper_tail_chi2_1df']:.6g}")
    print("=" * 70)
    print(f"已写入: {out_path}")


if __name__ == "__main__":
    main()
