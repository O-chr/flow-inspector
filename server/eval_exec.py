"""Run-time glue for safe Eval execution (phase 1).

Phase 1 runs a flow for real but only lets read-only (🟢) tools fire; every
side-effecting (🟡) or forbidden (🔴) call is denied at the permission layer —
not by asking the model nicely, but via a PreToolUse hook that calls
``eval_risk.classify_tool`` on the *actual* tool invocation.

``decide_tool`` is that hook's pure decision, kept here so it can be unit
tested and so the on-disk hook script stays a thin stdin→stdout wrapper.

Phase 2 keeps the synchronous hook but adds a 2-pass *approval* gate: pass 1
runs as phase 1 (🟡/🔴 denied) and records what each 🟡 op *would* do; the user
then approves specific 🟡 tools; pass 2 re-runs with those names in an allowlist
so they actually fire. ``decide_tool(event, approved=...)`` is the per-call
decision that honours that allowlist — 🔴 is never allowed, even if approved.

See ``docs/superpowers/specs/2026-06-05-eval-safe-execution-design.md``.
"""
from __future__ import annotations

from typing import Iterable, Optional

from eval_risk import classify_tool, GREEN, YELLOW


def build_safe_settings(hook_command: str) -> dict:
    """Build the ``--settings`` payload that installs the safe-eval gate.

    A single PreToolUse hook with a catch-all matcher so *every* tool call is
    routed through ``hook_command`` (the on-disk wrapper around ``decide_tool``).
    A narrower matcher would let unmatched side-effecting tools slip past the
    gate, so the matcher must be the catch-all ``"*"``.
    """
    return {
        "hooks": {
            "PreToolUse": [
                {
                    "matcher": "*",
                    "hooks": [{"type": "command", "command": hook_command}],
                }
            ]
        }
    }


def build_exec_prompt(flow: dict, case: dict) -> str:
    """Build the prompt that runs ``flow`` for one test ``case``.

    Deliberately **blind to ``case['expected']``** — the run must produce its
    own output, which the judge then compares against the expected result. If
    the run saw the expected answer it would just echo it and the eval would be
    meaningless.

    Phase 1 synthesises the prompt from the flow definition (name, description,
    ordered node titles) plus the case input, and asks Claude to carry the
    workflow out using only the tools it is permitted to use. The PreToolUse
    gate is what keeps that safe; this prompt only describes the task.
    """
    name = flow.get("name", "(無題のワークフロー)")
    desc = flow.get("description") or ""
    steps = [str(n.get("title") or n.get("type") or "") for n in flow.get("nodes", [])]
    case_input = case.get("input_text", case.get("input", ""))

    lines = [
        f"あなたは次のワークフロー「{name}」を実行するエージェントです。",
    ]
    if desc:
        lines.append(f"ワークフローの目的: {desc}")
    if steps:
        lines.append("## 手順")
        lines.extend(f"{i}. {s}" for i, s in enumerate(steps, 1) if s)
    lines.append("## 入力")
    lines.append(str(case_input))
    lines.append(
        "## 指示\n"
        "上記の手順に従い、この入力に対してワークフローを実際に実行してください。"
        "使用を許可されたツールだけを使い（許可されない操作はスキップして構いません）、"
        "最終的な成果物（このワークフローが出力すべきもの）だけを返してください。"
    )
    return "\n".join(lines)


def decide_tool(event: dict, approved: Optional[Iterable[str]] = None) -> dict:
    """Return the PreToolUse hook output for one tool call.

    ``event`` is the JSON Claude feeds a PreToolUse hook on stdin; the parts we
    use are ``tool_name`` and ``tool_input``.

    ``approved`` is the set of tool names the user OK'd in pass 1 (phase 2's
    approval gate). The decision is:

      * 🟢 → allow (always)
      * 🟡 and ``tool_name in approved`` → allow (pass 2 lets it actually fire)
      * 🔴 → deny — **never** allowed, even if the name is in ``approved``
      * anything else → deny (deny-by-default, with the risk reason)

    With ``approved=None`` (or empty) this is exactly the phase-1 behaviour:
    🟢 allow, everything else deny.
    """
    approved_set = set(approved or ())
    tool_name = event.get("tool_name", "")
    tool_input = event.get("tool_input")
    risk = classify_tool(tool_name, tool_input)
    if risk.level == GREEN:
        decision, reason = "allow", risk.reason
    elif risk.level == YELLOW and tool_name in approved_set:
        decision = "allow"
        reason = f"[safe-eval] approved by user: {risk.reason}"
    else:
        decision = "deny"
        reason = f"[safe-eval] blocked {risk.level.upper()}: {risk.reason}"
    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }
