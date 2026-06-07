"""Tests for eval_exec: the run-time glue for safe Eval execution.

``decide_tool(event)`` is the pure decision a PreToolUse hook makes for one
tool call during a phase-1 safe run: allow 🟢 reads, deny 🟡/🔴 everything else
(phase 2 will turn 🟡 into an interactive "ask"). It returns the Claude hook
output shape so the hook script itself is a thin stdin→stdout wrapper.
"""
from __future__ import annotations

from eval_exec import decide_tool, build_exec_prompt, build_safe_settings


# --- build_safe_settings: the --settings payload that installs the hook ----

def test_settings_register_pretooluse_hook_for_all_tools():
    s = build_safe_settings("python3 /abs/hook.py")
    entries = s["hooks"]["PreToolUse"]
    assert entries, "must register at least one PreToolUse hook"
    entry = entries[0]
    # matcher must cover every tool, or side-effecting calls slip through.
    assert entry["matcher"] in ("*", "")
    inner = entry["hooks"][0]
    assert inner["type"] == "command"
    assert inner["command"] == "python3 /abs/hook.py"


# --- build_exec_prompt: the prompt that actually runs the flow -------------

_FLOW = {
    "name": "名刺リサーチ",
    "description": "名刺を調べて振り分ける",
    "nodes": [
        {"title": "名刺画像を読む", "type": "parent"},
        {"title": "相手を検索して調査", "type": "subagent"},
        {"title": "メール下書きを作る", "type": "subagent"},
    ],
}
_CASE = {"title": "新規名刺1件", "input_text": "山田太郎 ACME社 CTO",
         "expected": "EXPECTED-SENTINEL-9988 should never reach the run"}


def test_exec_prompt_includes_case_input():
    assert "山田太郎 ACME社 CTO" in build_exec_prompt(_FLOW, _CASE)


def test_exec_prompt_includes_flow_name():
    assert "名刺リサーチ" in build_exec_prompt(_FLOW, _CASE)


def test_exec_prompt_lists_step_titles():
    p = build_exec_prompt(_FLOW, _CASE)
    assert "相手を検索して調査" in p and "メール下書きを作る" in p


def test_exec_prompt_is_blind_to_expected():
    # The run must not see the expected answer, or it would just echo it.
    assert "EXPECTED-SENTINEL-9988" not in build_exec_prompt(_FLOW, _CASE)


def test_exec_prompt_handles_legacy_input_key():
    case = {"title": "t", "input": "レガシー入力キー"}
    assert "レガシー入力キー" in build_exec_prompt(_FLOW, case)


def _decision(event):
    out = decide_tool(event)
    return out["hookSpecificOutput"]


def test_output_has_pretooluse_envelope():
    out = decide_tool({"tool_name": "Read", "tool_input": {}})
    hso = out["hookSpecificOutput"]
    assert hso["hookEventName"] == "PreToolUse"
    assert "permissionDecision" in hso


def test_green_read_is_allowed():
    d = _decision({"tool_name": "Read", "tool_input": {"file_path": "/x"}})
    assert d["permissionDecision"] == "allow"


def test_green_mcp_read_is_allowed():
    d = _decision({"tool_name": "mcp__7e8e54__search_files", "tool_input": {}})
    assert d["permissionDecision"] == "allow"


def test_yellow_write_is_denied_in_phase1():
    d = _decision({"tool_name": "mcp__gmail__create_draft", "tool_input": {}})
    assert d["permissionDecision"] == "deny"


def test_bash_is_denied_in_phase1():
    d = _decision({"tool_name": "Bash", "tool_input": {"command": "ls"}})
    assert d["permissionDecision"] == "deny"


def test_red_finance_is_denied():
    d = _decision({"tool_name": "mcp__stripe__create_payment", "tool_input": {}})
    assert d["permissionDecision"] == "deny"


def test_deny_reason_is_present():
    d = _decision({"tool_name": "Bash", "tool_input": {"command": "rm -rf /"}})
    assert d["permissionDecision"] == "deny"
    assert d.get("permissionDecisionReason")


# --- phase 2: approvals (the 2-pass approval gate) ------------------------
# Pass 2 re-runs the flow with the user-approved 🟡 tools added to an allowlist.
# decide_tool honours that allowlist: 🟡 ∈ approved → allow; 🔴 never (even if
# approved); 🟢 still allow; everything else still deny.

def _decision_approved(event, approved):
    out = decide_tool(event, approved=approved)
    return out["hookSpecificOutput"]


def test_yellow_approved_is_allowed():
    d = _decision_approved(
        {"tool_name": "mcp__gmail__create_draft", "tool_input": {}},
        approved=["mcp__gmail__create_draft"])
    assert d["permissionDecision"] == "allow"


def test_yellow_not_approved_is_denied():
    # A different tool is approved, not this one → still denied.
    d = _decision_approved(
        {"tool_name": "mcp__gmail__create_draft", "tool_input": {}},
        approved=["mcp__slack__post_message"])
    assert d["permissionDecision"] == "deny"


def test_red_is_denied_even_if_approved():
    # RED must never run, even when the user explicitly approves the name.
    d = _decision_approved(
        {"tool_name": "mcp__stripe__create_payment", "tool_input": {}},
        approved=["mcp__stripe__create_payment"])
    assert d["permissionDecision"] == "deny"


def test_green_allowed_regardless_of_approvals():
    d = _decision_approved(
        {"tool_name": "Read", "tool_input": {"file_path": "/x"}},
        approved=["Read"])
    assert d["permissionDecision"] == "allow"


def test_approved_accepts_a_set():
    # approved may be any iterable/container of names.
    d = _decision_approved(
        {"tool_name": "mcp__gmail__create_draft", "tool_input": {}},
        approved={"mcp__gmail__create_draft"})
    assert d["permissionDecision"] == "allow"


def test_no_approvals_matches_phase1_behaviour():
    # approved=None must behave exactly like the phase-1 deny-by-default.
    d = _decision({"tool_name": "mcp__gmail__create_draft", "tool_input": {}})
    assert d["permissionDecision"] == "deny"
