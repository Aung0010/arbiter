"""
MCC 辅助脚本：对 errors/ 中的题目重跑；统计三模型与 MCC 系统在 benchmark 上的表现。

用法（在 arbiter/backend/testing 下）:
  python mcc_helper.py
  python mcc_helper.py --results-root mcc_debate_results --skip-retest   # 仅统计
  python mcc_helper.py --skip-stats                                      # 仅重试 errors
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

# 与 run_mcc_medqa 共用同一套辩论逻辑与数据集
import run_mcc_medqa as mcc


def _get_correct_num(data: Dict[str, Any]) -> Optional[int]:
    n = data.get("correct_num")
    if n is not None:
        return int(n) if isinstance(n, (int, float)) else None
    letter = str(data.get("correct_answer", "")).strip().upper()
    if not letter:
        return None
    return mcc.letter_to_num(letter) or None


def _round0_choices(data: Dict[str, Any], folder: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    """
    返回 (model_a, model_b, model_c) 在 round 0 的选项编号。
    initial_consensus 落盘为精简 JSON，无 debate_result，三模型首轮一致，用 pred_num 代表三者。
    """
    if folder == mcc.SUBDIR_INITIAL_CONSENSUS:
        p = data.get("pred_num")
        if p is None:
            return None, None, None
        return int(p), int(p), int(p)

    dr = data.get("debate_result") or {}
    hist = dr.get("debate_history") or []
    if not hist:
        return None, None, None
    h0 = hist[0]
    def ch(key: str) -> Optional[int]:
        block = h0.get(key) or {}
        c = block.get("choice")
        if c is None:
            return None
        return int(c) if isinstance(c, (int, float)) else None

    return ch("a"), ch("b"), ch("c")


def _hist_choice(h: List[Dict[str, Any]], round_idx: int, model_key: str) -> Optional[int]:
    if round_idx < 0 or round_idx >= len(h):
        return None
    blk = h[round_idx].get(model_key) or {}
    c = blk.get("choice")
    if c is None:
        return None
    return int(c) if isinstance(c, (int, float)) else None


def _first_wrong_to_right_round_index(h: List[Dict[str, Any]], model_key: str, cn: int) -> Optional[int]:
    """
    在 debate_history 中，该模型首次从「非正确答案」变为「正确答案」的条目下标 i（i>=1）。
    若从未发生或无法判断则返回 None。
    """
    if len(h) < 2:
        return None
    prev = _hist_choice(h, 0, model_key)
    for i in range(1, len(h)):
        cur = _hist_choice(h, i, model_key)
        if prev is not None and cur is not None and prev != cn and cur == cn:
            return i
        prev = cur
    return None


def _peer_keys_for(model_key: str) -> Tuple[str, str]:
    if model_key == "a":
        return "b", "c"
    if model_key == "b":
        return "a", "c"
    return "a", "b"


def _classify_peer_context(
    h: List[Dict[str, Any]], context_idx: int, model_key: str, cn: int
) -> str:
    """
    在「该模型即将更新」之前，另两个模型在 history[context_idx] 上是否已选对。
    context_idx 通常为 i-1（第 i 条 history 里本模型刚选对时，其看到的同伴状态）。
    """
    p1, p2 = _peer_keys_for(model_key)
    o1 = _hist_choice(h, context_idx, p1) == cn
    o2 = _hist_choice(h, context_idx, p2) == cn
    if o1 and o2:
        return "both_peers_had_correct"
    if o1 and not o2:
        return f"only_{p1}_had_correct"
    if o2 and not o1:
        return f"only_{p2}_had_correct"
    return "neither_peer_had_correct"


def _classify_round0_peers_when_wrong(
    h: List[Dict[str, Any]], model_key: str, cn: int
) -> str:
    """首轮时另两个模型是否已选对（用于与「首次修正」对照的简单叙事）。"""
    return _classify_peer_context(h, 0, model_key, cn)


def compute_after_debate_dynamics(results_root: str) -> Dict[str, Any]:
    """
    仅针对 after_debate/：立场变化、错误→正确、同伴归因（启发式）。
    归因说明：当某模型在 history[i] 首次选对时，认为其更新前参考的是 history[i-1] 上另两模型的选项。
    """
    dpath = os.path.join(results_root, mcc.SUBDIR_AFTER_DEBATE)
    out: Dict[str, Any] = {
        "after_debate_cases_seen": 0,
        "skipped": [],
        "consensus_true_final": 0,
        "consensus_false_final": 0,
        "stance_changes_from_correct_to_wrong": {
            "model_a": 0,
            "model_b": 0,
            "model_c": 0,
        },
        "wrong_to_right_first_time": {
            "model_a": {
                "count": 0,
                "by_round_index_in_history": Counter(),
                "peer_context_before_fix": Counter(),
                "round0_peer_when_fix": Counter(),
            },
            "model_b": {
                "count": 0,
                "by_round_index_in_history": Counter(),
                "peer_context_before_fix": Counter(),
                "round0_peer_when_fix": Counter(),
            },
            "model_c": {
                "count": 0,
                "by_round_index_in_history": Counter(),
                "peer_context_before_fix": Counter(),
                "round0_peer_when_fix": Counter(),
            },
        },
    }
    if not os.path.isdir(dpath):
        return {
            "after_debate_cases_seen": 0,
            "skipped": [],
            "note": "after_debate 目录不存在",
            "wrong_to_right_first_time": {
                "model_a": {"count": 0, "by_round_index_in_history": {}, "peer_context_before_fix": {}, "round0_peer_when_fix": {}},
                "model_b": {"count": 0, "by_round_index_in_history": {}, "peer_context_before_fix": {}, "round0_peer_when_fix": {}},
                "model_c": {"count": 0, "by_round_index_in_history": {}, "peer_context_before_fix": {}, "round0_peer_when_fix": {}},
            },
        }

    for path in sorted(glob.glob(os.path.join(dpath, "case_*.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        cn = _get_correct_num(data)
        if cn is None:
            out["skipped"].append(f"{path} (no correct_num)")
            continue
        dr = data.get("debate_result") or {}
        h = dr.get("debate_history") or []
        if len(h) < 2:
            out["skipped"].append(f"{path} (debate_history too short)")
            continue

        out["after_debate_cases_seen"] += 1

        if dr.get("consensus") is True:
            out["consensus_true_final"] += 1
        else:
            out["consensus_false_final"] += 1

        st = dr.get("stance_changes") or {}
        for k_json, k_out in (
            ("a_changed_from_correct", "model_a"),
            ("b_changed_from_correct", "model_b"),
            ("c_changed_from_correct", "model_c"),
        ):
            if st.get(k_json):
                out["stance_changes_from_correct_to_wrong"][k_out] += 1

        for model_key, mk_name in (("a", "model_a"), ("b", "model_b"), ("c", "model_c")):
            wtr = _first_wrong_to_right_round_index(h, model_key, cn)
            if wtr is None:
                continue
            bucket = out["wrong_to_right_first_time"][mk_name]
            bucket["count"] += 1
            bucket["by_round_index_in_history"][wtr] += 1
            ctx_idx = wtr - 1
            if ctx_idx >= 0:
                peer_cls = _classify_peer_context(h, ctx_idx, model_key, cn)
                bucket["peer_context_before_fix"][peer_cls] += 1
            r0_cls = _classify_round0_peers_when_wrong(h, model_key, cn)
            bucket["round0_peer_when_fix"][r0_cls] += 1

    # Convert Counter to dict for JSON
    for mk in ("model_a", "model_b", "model_c"):
        b = out["wrong_to_right_first_time"][mk]
        b["by_round_index_in_history"] = dict(b["by_round_index_in_history"])
        b["peer_context_before_fix"] = dict(b["peer_context_before_fix"])
        b["round0_peer_when_fix"] = dict(b["round0_peer_when_fix"])

    out["note"] = (
        "wrong_to_right: first round index in debate_history where choice goes from wrong to correct. "
        "peer_context_before_fix: peers' choices at history[i-1] when fix at i. "
        "round0_peer_when_fix: which peers already had correct at round 0 (same labels for narrative). "
        "Attribution is heuristic, not causal."
    )
    out["model_key_legend"] = {"a": mcc.MODEL_A, "b": mcc.MODEL_B, "c": mcc.MODEL_C}
    return out


def retest_errors(results_root: str, max_rounds: int) -> None:
    """读取 errors/case_*.json，从数据集取题重跑；成功则写入对应子目录并删除 error 文件。"""
    err_dir = os.path.join(results_root, mcc.SUBDIR_ERRORS)
    if not os.path.isdir(err_dir):
        print(f"[retest] 无目录: {err_dir}，跳过。")
        return

    paths = sorted(glob.glob(os.path.join(err_dir, "case_*.json")))
    if not paths:
        print(f"[retest] {err_dir} 下无 case_*.json，跳过。")
        return

    print(f"[retest] 加载数据集 {mcc.DATASET_NAME} ({mcc.DATASET_SPLIT}) …")
    ds = mcc.load_medqa(max_samples=None)
    os.makedirs(os.path.join(results_root, mcc.SUBDIR_INITIAL_CONSENSUS), exist_ok=True)
    os.makedirs(os.path.join(results_root, mcc.SUBDIR_AFTER_DEBATE), exist_ok=True)
    os.makedirs(os.path.join(results_root, mcc.SUBDIR_FAILED), exist_ok=True)

    ok, still_err = 0, 0
    for path in paths:
        with open(path, encoding="utf-8") as f:
            err = json.load(f)
        idx = err.get("idx")
        if idx is None:
            print(f"[retest] 跳过（无 idx）: {path}")
            continue
        idx = int(idx)
        if idx < 0 or idx >= len(ds):
            print(f"[retest] 跳过 idx={idx}（超出数据集长度 {len(ds)}）: {path}")
            continue

        item = ds[idx]
        r = mcc.process_single_case(item, idx, max_rounds)
        if r.get("error"):
            still_err += 1
            with open(path, "w", encoding="utf-8") as f:
                json.dump(r, f, ensure_ascii=False, indent=2)
            print(f"[retest] 仍失败 idx={idx} → 已更新 {path}")
            continue

        sub = mcc.case_output_subdir(r["debate_result"])
        out_path = os.path.join(results_root, sub, f"case_{idx}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(mcc.build_case_json_payload(r), f, ensure_ascii=False, indent=2)
        os.remove(path)
        ok += 1
        print(f"[retest] 成功 idx={idx} → {out_path}，已删除 errors 中的记录")

    print(f"[retest] 完成：成功移出 {ok} 题，仍失败 {still_err} 题。")


def compute_stats(results_root: str) -> Dict[str, Any]:
    """
    仅统计 initial_consensus/ 与 after_debate/。
    - initial_consensus：首轮三模型一致，用 pred_num 作为 A/B/C 首轮答案。
    - after_debate：用 debate_history[0] 中 a/b/c 的 choice 作为各模型首轮答案。
    MCC 系统：均用 pred_num 与 correct_num 比较。
    """
    folders = [
        (mcc.SUBDIR_INITIAL_CONSENSUS, "initial_consensus"),
        (mcc.SUBDIR_AFTER_DEBATE, "after_debate"),
    ]

    total_cases = 0
    mcc_correct = 0
    ma_correct = mb_correct = mc_correct = 0
    skipped: List[str] = []

    by_folder: Dict[str, Any] = {}

    for sub, label in folders:
        dpath = os.path.join(results_root, sub)
        n_local = 0
        ma_l = mb_l = mc_l = 0
        mcc_l = 0
        if not os.path.isdir(dpath):
            by_folder[label] = {"cases": 0, "note": "目录不存在"}
            continue

        for path in sorted(glob.glob(os.path.join(dpath, "case_*.json"))):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)

            cn = _get_correct_num(data)
            pred = data.get("pred_num")
            if cn is None:
                skipped.append(f"{path} (no correct_num)")
                continue
            if pred is None:
                skipped.append(f"{path} (no pred_num)")
                continue
            pred_i = int(pred)

            ca, cb, cc = _round0_choices(data, sub)
            if sub == mcc.SUBDIR_AFTER_DEBATE and not (data.get("debate_result") or {}).get("debate_history"):
                skipped.append(f"{path} (no debate_history)")
                continue

            n_local += 1
            total_cases += 1

            if pred_i == cn:
                mcc_l += 1
                mcc_correct += 1

            for c, acc in ((ca, "ma"), (cb, "mb"), (cc, "mc")):
                if c is not None and int(c) == cn:
                    if acc == "ma":
                        ma_l += 1
                        ma_correct += 1
                    elif acc == "mb":
                        mb_l += 1
                        mb_correct += 1
                    else:
                        mc_l += 1
                        mc_correct += 1

        by_folder[label] = {
            "cases": n_local,
            "model_a_correct": ma_l,
            "model_b_correct": mb_l,
            "model_c_correct": mc_l,
            "mcc_correct": mcc_l,
            "model_a_accuracy": (ma_l / n_local) if n_local else None,
            "model_b_accuracy": (mb_l / n_local) if n_local else None,
            "model_c_accuracy": (mc_l / n_local) if n_local else None,
            "mcc_accuracy": (mcc_l / n_local) if n_local else None,
        }

    out: Dict[str, Any] = {
        "results_root": os.path.abspath(results_root),
        "model_names": {
            "model_a": mcc.MODEL_A,
            "model_b": mcc.MODEL_B,
            "model_c": mcc.MODEL_C,
        },
        "total_cases": total_cases,
        "pooled": {
            "model_a_correct": ma_correct,
            "model_b_correct": mb_correct,
            "model_c_correct": mc_correct,
            "mcc_correct": mcc_correct,
            "model_a_accuracy": (ma_correct / total_cases) if total_cases else None,
            "model_b_accuracy": (mb_correct / total_cases) if total_cases else None,
            "model_c_accuracy": (mc_correct / total_cases) if total_cases else None,
            "mcc_accuracy": (mcc_correct / total_cases) if total_cases else None,
        },
        "by_folder": by_folder,
        "skipped_files": skipped,
        "note": (
            "Per-model counts use round-0 choices only. "
            "initial_consensus uses pred_num for all three (first-round agreement). "
            "MCC uses final pred_num vs gold."
        ),
        "after_debate_dynamics": compute_after_debate_dynamics(results_root),
    }
    return out


def print_stats(stats: Dict[str, Any]) -> None:
    names = stats["model_names"]
    p = stats["pooled"]
    n = stats["total_cases"]
    print("\n" + "=" * 70)
    print("MCC Helper — 准确率统计（initial_consensus + after_debate）")
    print("=" * 70)
    print(f"结果目录: {stats['results_root']}")
    print(f"有效题数（分母）: {n}")
    if not n:
        print("  无有效样本（请检查子目录 JSON 是否含 correct_num / debate_result）。")
    else:

        def line(label: str, key: str) -> None:
            c = p[key + "_correct"]
            acc = p[key + "_accuracy"]
            print(f"  {label}: 答对 {c} / {n} = {acc:.4%}")

        line(f"Model A ({names['model_a']})", "model_a")
        line(f"Model B ({names['model_b']})", "model_b")
        line(f"Model C ({names['model_c']})", "model_c")
        line("MCC 系统（最终 pred_num）", "mcc")

    print("-" * 70)
    print("按子目录:")

    def _fmt_pct(x: Any) -> str:
        return f"{x:.4%}" if isinstance(x, (int, float)) and x is not None else "N/A"

    for fk, fv in stats["by_folder"].items():
        m = fv.get("cases", 0)
        print(f"  [{fk}] cases={m}", end="")
        if m:
            print(
                f"  A={_fmt_pct(fv.get('model_a_accuracy'))}  B={_fmt_pct(fv.get('model_b_accuracy'))}  "
                f"C={_fmt_pct(fv.get('model_c_accuracy'))}  MCC={_fmt_pct(fv.get('mcc_accuracy'))}"
            )
        else:
            print()
    if stats.get("skipped_files"):
        print(f"跳过文件数: {len(stats['skipped_files'])}（见 stats JSON）")

    ad = stats.get("after_debate_dynamics") or {}
    if ad.get("after_debate_cases_seen", 0) or ad.get("skipped"):
        print("-" * 70)
        print("after_debate 动态统计（立场变化 / 同伴归因，启发式）")
        print("-" * 70)
        print(f"  纳入 case 数: {ad.get('after_debate_cases_seen', 0)}")
        print(
            f"  最终全体一致 consensus=True: {ad.get('consensus_true_final', 0)}  |  "
            f"最终未一致(多数票等) consensus=False: {ad.get('consensus_false_final', 0)}"
        )
        sc = ad.get("stance_changes_from_correct_to_wrong") or {}
        print(
            f"  从「首轮选对」改为「最终选错」次数 — "
            f"A: {sc.get('model_a', 0)}  B: {sc.get('model_b', 0)}  C: {sc.get('model_c', 0)}"
        )
        names = stats.get("model_names") or {}
        wtr = ad.get("wrong_to_right_first_time") or {}
        for mk, label in (
            ("model_a", f"A ({names.get('model_a', 'A')})"),
            ("model_b", f"B ({names.get('model_b', 'B')})"),
            ("model_c", f"C ({names.get('model_c', 'C')})"),
        ):
            b = wtr.get(mk) or {}
            cnt = b.get("count", 0)
            if not cnt:
                print(f"  首次「错→对」— {label}: 0 次")
                continue
            print(f"  首次「错→对」— {label}: {cnt} 次")
            br = b.get("by_round_index_in_history") or {}
            if br:
                print(f"    出现在 debate_history 下标: {br}")
            pbf = b.get("peer_context_before_fix") or {}
            if pbf:
                print(f"    修正前一步同伴是否已选对: {pbf}")
            r0 = b.get("round0_peer_when_fix") or {}
            if r0:
                print(f"    首轮时同伴是否已选对(对照): {r0}")
        if ad.get("skipped"):
            print(f"  动态统计跳过文件: {len(ad['skipped'])}")
        print(
            "  说明: 「修正前一步」指 history[i-1] 上另两模型的选项；"
            "对 A 而言同伴为 B/C；对 B 为 A/C；对 C 为 A/B。"
        )

    print("=" * 70)


def main() -> None:
    parser = argparse.ArgumentParser(description="MCC：重试 errors + 统计三模型与系统准确率")
    parser.add_argument(
        "--results-root",
        default="mcc_debate_results",
        help="run_mcc_medqa 输出根目录（含 errors/、initial_consensus/、after_debate/）",
    )
    parser.add_argument("--skip-retest", action="store_true", help="不重跑 errors，仅统计")
    parser.add_argument("--skip-stats", action="store_true", help="仅重跑 errors，不统计")
    parser.add_argument(
        "--max-rounds",
        type=int,
        default=None,
        help=f"重试时的辩论轮数，默认 {mcc.MAX_DEBATE_ROUNDS}",
    )
    args = parser.parse_args()
    root = args.results_root
    rounds = args.max_rounds if args.max_rounds is not None else mcc.MAX_DEBATE_ROUNDS

    if not args.skip_retest:
        retest_errors(root, rounds)
    if not args.skip_stats:
        stats = compute_stats(root)
        out_json = os.path.join(root, "mcc_stats.json")
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
        print_stats(stats)
        print(f"详细统计已写入: {out_json}")


if __name__ == "__main__":
    main()
