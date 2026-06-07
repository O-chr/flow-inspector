"""Builds the LLM-judge prompt used by the Eval runner.

Extracted from ``run_eval`` so it can be unit tested in isolation and so the
two judging modes are explicit:

  * **definition mode** (``actual_output is None``) — the flow has *not* been
    executed; the judge assesses whether the workflow *definition* could
    plausibly satisfy the expected result. This is the current behaviour.
  * **output mode** (``actual_output`` given) — the flow has been run and its
    real output is judged against the expected result and the criteria. This
    is the slot the Eval-safe-execution work will fill once execution is wired
    up (step 2 only prepares the opening; nothing calls it with output yet).

See ``docs/superpowers/specs/2026-06-05-eval-safe-execution-design.md``.
"""
from __future__ import annotations

from typing import Optional


def _case_title(case: dict) -> str:
    return case.get("title", case.get("name", ""))


def _case_input(case: dict) -> str:
    return case.get("input_text", case.get("input", ""))


def build_judge_prompt(
    flow_desc: str,
    case: dict,
    evaluator_prompt: str,
    actual_output: Optional[str] = None,
    blocked_ops: Optional[list] = None,
) -> str:
    """Assemble the judge prompt for one (case, evaluator) pair.

    ``actual_output`` is the flow's real output when it has been executed, or
    ``None`` when it has not. The closing instruction adapts so the judge knows
    whether it is scoring a real artifact or reasoning from the definition.

    ``blocked_ops`` are the side-effecting (🟡) operations the safe-eval gate
    refused to run. When present, the judge is told they did *not* execute so it
    can distinguish "failed because a send was blocked" from "the flow itself is
    wrong" instead of unfairly scoring a partial run.

    A fixed **判定の指針** (strict, consistent, evidence-based) is always
    appended to curb the verdict flakiness that vague evaluators cause.
    """
    expected = case.get("expected", "(未定義)")
    parts = [
        "あなたはワークフロー評価の審査員です。",
        f"## ワークフロー情報\n{flow_desc}",
        (
            "## テストケース\n"
            f"タイトル: {_case_title(case)}\n"
            f"入力: {_case_input(case)}\n"
            f"期待される結果: {expected}"
        ),
    ]
    if actual_output is None:
        parts.append(
            "## 実際の出力\n"
            "（このフローはまだ実行されていません。ワークフローの定義から、"
            "期待される結果を満たせそうかを判断してください。）"
        )
        closing = (
            "上記ワークフローが期待される結果を満たせそうか、評価基準に照らして "
            'PASS か FAIL かを判定し JSON {"verdict":"pass/fail","reason":"理由"} で回答'
        )
    else:
        parts.append(f"## 実際の出力\n{actual_output}")
        closing = (
            "上の『実際の出力』が期待される結果と評価基準を満たすか、"
            'PASS か FAIL かを判定し JSON {"verdict":"pass/fail","reason":"理由"} で回答'
        )
    parts.append(f"## 評価基準\n{evaluator_prompt}")

    blocked_names = [
        str(b.get("tool_name", "")) for b in (blocked_ops or []) if isinstance(b, dict)
    ]
    blocked_names = [n for n in blocked_names if n]
    if blocked_names:
        parts.append(
            "## 安全ゲートでブロックされた操作（未実行）\n"
            + "\n".join(f"- {n}" for n in blocked_names)
            + "\nこれらは安全のため実行されていない。期待結果に届かない原因が"
            "「この未実行」なのか「フロー設計そのもの」なのかを区別し、未実行が"
            "原因なら理由にその旨を明記する。"
        )

    parts.append(
        "## 判定の指針\n"
        "厳密かつ一貫して判定する。評価基準を1つでも明確に満たさなければ FAIL とする。"
        "迷うときも FAIL とし、何が不足かを書く。理由は出力・定義の該当箇所を根拠に"
        "具体的に書く（曖昧な感想で済ませない）。"
    )
    parts.append(closing)
    return "\n".join(parts)
