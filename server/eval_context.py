"""Builds the rich context the Eval "分析・相談" chat needs to reason concretely.

The chat is tool-less (``--tools ""``), so rather than have it fetch anything,
we inject the actual content directly: every evaluator's prompt/code, every
case's input + expected, and the latest run's real output + per-evaluator fail
reasons. With this the chat can say "evaluator ev2's prompt is too strict, here
is the fix" instead of asking the user to paste it.

Pure (string in, string out) so it is unit tested and side-effect free.
"""
from __future__ import annotations

from typing import Optional


def _case_input(case: dict) -> str:
    return case.get("input_text", case.get("input", ""))


def _indent(text: str, pad: str = "    ") -> str:
    return "\n".join(pad + line for line in str(text).splitlines())


def build_eval_analysis_context(
    evaluators: list,
    cases: list,
    latest_run: Optional[dict] = None,
    output_cap: int = 1500,
) -> str:
    """Format evaluators, cases and the latest run's details for the chat.

    Returns an empty string when there is nothing to show, so the caller can
    drop it without leaving a dangling header.
    """
    parts: list = []

    if evaluators:
        parts.append("## 評価軸の中身（プロンプト本文／コード）")
        for e in evaluators:
            parts.append(f"- [{e.get('id','')}] {e.get('name','')} ({e.get('type','')})")
            if e.get("type") == "code":
                parts.append("  コード:")
                parts.append(_indent(e.get("code", "")))
            else:
                parts.append(f"  判定プロンプト: {e.get('prompt','')}")

    if cases:
        parts.append("\n## テストケースの中身（入力・期待結果）")
        for c in cases:
            parts.append(f"- [{c.get('id','')}] {c.get('title', c.get('name',''))}")
            parts.append(f"  入力: {_case_input(c)}")
            parts.append(f"  期待結果: {c.get('expected', '(未定義)')}")

    if latest_run:
        parts.append(
            f"\n## 直近の実行の詳細"
            f"（{latest_run.get('version_label','')} / "
            f"{latest_run.get('passed',0)}/{latest_run.get('total',0)} passed）"
        )
        for res in latest_run.get("results", []):
            st = "PASS" if res.get("pass") else "FAIL"
            parts.append(f"### {st}: {res.get('case_title','')}")
            if res.get("executed"):
                actual = (res.get("actual_output") or "").strip()
                if actual:
                    parts.append(f"  実出力: {actual[:output_cap]}")
                blocked = res.get("blocked_ops") or []
                if blocked:
                    names = ", ".join(b.get("tool_name", "") for b in blocked)
                    parts.append(f"  権限ゲートでブロックした操作: {names}")
            for er in res.get("evaluator_results", []):
                parts.append(
                    f"  - {er.get('evaluator_name','')}: "
                    f"{er.get('verdict','')} — {er.get('reason','')}"
                )

    return "\n".join(parts)
