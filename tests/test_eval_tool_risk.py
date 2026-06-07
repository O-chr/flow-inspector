"""Tests for eval_risk.classify_tool: the runtime per-tool-call classifier.

Where ``classify_node`` grades a *flow node* (design-time), ``classify_tool``
grades an *actual Claude tool invocation* (run-time) so a PreToolUse hook can
allow 🟢 reads and deny 🟡/🔴 side-effecting calls during a safe Eval run.

Input is the real Claude tool name (``Read``, ``Edit``, ``Bash``,
``mcp__<server>__<tool>``) plus the optional tool-input dict. Same locked spec
and same deny-by-default rule: anything not provably read-only → YELLOW, RED
keywords forced regardless of tool.
"""
from __future__ import annotations

from eval_risk import classify_tool, GREEN, YELLOW, RED


# --- built-in tools -------------------------------------------------------

def test_builtin_read_tools_are_green():
    for name in ("Read", "Glob", "Grep", "WebSearch", "WebFetch"):
        assert classify_tool(name).level == GREEN, name


def test_builtin_edit_write_are_yellow():
    for name in ("Edit", "Write", "NotebookEdit"):
        assert classify_tool(name).level == YELLOW, name


def test_bash_is_yellow_deny_by_default():
    # Bash can curl-POST or rm -rf; never auto-allow it.
    assert classify_tool("Bash", {"command": "ls -la"}).level == YELLOW


# --- MCP tools (mcp__server__tool) ----------------------------------------

def test_mcp_read_tool_is_green():
    assert classify_tool("mcp__5b73dcc6__search_threads").level == GREEN


def test_mcp_write_tool_is_yellow():
    assert classify_tool("mcp__gmail__create_draft").level == YELLOW


def test_mcp_unknown_tool_is_yellow_deny_by_default():
    assert classify_tool("mcp__euler__commissions").level == YELLOW


def test_mcp_token_aware_create_is_yellow_not_green():
    # "code_widget_create" contains "get" (wid-GET) but is a write → YELLOW.
    assert classify_tool("mcp__miro__code_widget_create").level == YELLOW


# --- RED forcing ----------------------------------------------------------

def test_mcp_finance_tool_is_red():
    assert classify_tool("mcp__stripe__create_payment").level == RED


def test_bash_command_with_finance_text_is_red():
    node_input = {"command": "curl -X POST https://bank.example/api 送金"}
    assert classify_tool("Bash", node_input).level == RED


def test_mcp_permission_change_is_red():
    assert classify_tool("mcp__drive__update_file_permissions").level == RED
