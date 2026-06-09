#!/usr/bin/env python3
"""PreToolUse hook for safe Eval execution (phases 1–2).

Claude invokes this once per tool call, feeding the call as JSON on stdin. We
hand it to ``eval_exec.decide_tool`` (which classifies via ``eval_risk``) and
print the hook decision as JSON: 🟢 reads are allowed, 🟡/🔴 calls are denied.

Phase 2 (the 2-pass approval gate) adds:

  * ``SAFE_EVAL_APPROVED`` — a comma-separated list of tool names the user
    approved. On pass 2 these 🟡 tools are *allowed* (passed to ``decide_tool``).
  * the blocked-op log now records the risk ``level`` (yellow/red) and the
    call's ``tool_input`` so the UI can show what each blocked op *would* do.

The decision logic lives in ``eval_exec`` so it is unit tested; this file is the
thin stdin→stdout wrapper Claude actually runs as a subprocess. It must not
import anything heavy (no FastAPI) so it starts fast and can't have side
effects of its own.

Optionally, if ``SAFE_EVAL_LOG`` is set, each blocked call is appended (one JSON
object per line) so the Eval run can report what it stopped.
"""
import json
import os
import sys
from pathlib import Path

# Make sibling modules (eval_exec, eval_risk) importable when Claude runs this
# script from an arbitrary cwd.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from eval_exec import decide_tool  # noqa: E402
from eval_risk import classify_tool  # noqa: E402


def _parse_approved(raw):
    """Parse the comma-separated ``SAFE_EVAL_APPROVED`` env value.

    Tolerant of surrounding whitespace and empty entries so a malformed/empty
    value simply yields no approvals (deny-by-default stays the safe fallback).
    """
    if not raw:
        return []
    return [name.strip() for name in raw.split(",") if name.strip()]


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        # Malformed input: stay safe (deny) rather than allow an unknown call.
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": "[safe-eval] unparseable tool event",
        }}))
        return 0

    approved = _parse_approved(os.environ.get("SAFE_EVAL_APPROVED"))
    out = decide_tool(event, approved=approved)
    decision = out["hookSpecificOutput"]["permissionDecision"]

    log_path = os.environ.get("SAFE_EVAL_LOG")
    if log_path and decision != "allow":
        # Record the risk level + the actual tool_input so the UI can render
        # "what this op would have done" and offer per-tool approval. Classify
        # defensively — a bad event must not crash the hook (deny already won).
        try:
            level = classify_tool(event.get("tool_name", ""), event.get("tool_input")).level
        except Exception:
            level = "unknown"
        try:
            with open(log_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps({
                    "tool_name": event.get("tool_name", ""),
                    "decision": decision,
                    "level": level,
                    "tool_input": event.get("tool_input"),
                    "reason": out["hookSpecificOutput"]["permissionDecisionReason"],
                }, ensure_ascii=False) + "\n")
        except OSError:
            pass

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
