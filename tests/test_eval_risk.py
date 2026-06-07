"""Tests for eval_risk: the pure operation-classifier for Eval safe execution.

``eval_risk.classify_node(node)`` maps a single flow node to a risk level:

  * GREEN  — read-only / no side effects → safe to auto-run in a test
  * YELLOW — has side effects (send / write / state-change) → ask the user
  * RED    — finance / credentials / account / permanent-delete → never auto-run

Classification is keyword-driven (per the locked spec
``docs/superpowers/specs/2026-06-05-eval-safe-execution-design.md``) and
deny-by-default: anything not provably read-only falls to YELLOW, and RED
keywords are force-applied regardless of node type.
"""
from __future__ import annotations

from eval_risk import classify_node, GREEN, YELLOW, RED


# --- MCP tool-name keyword classification ---------------------------------

def test_mcp_read_tool_is_green():
    node = {"type": "mcp", "config": {"server": "gmail", "action": "tool",
                                      "tool_name": "search_messages"}}
    assert classify_node(node).level == GREEN


def test_mcp_send_tool_is_yellow():
    node = {"type": "mcp", "config": {"server": "imessage", "action": "tool",
                                      "tool_name": "send_imessage"}}
    assert classify_node(node).level == YELLOW


def test_mcp_unknown_tool_is_yellow_deny_by_default():
    node = {"type": "mcp", "config": {"server": "euler", "action": "tool",
                                      "tool_name": "commissions"}}
    assert classify_node(node).level == YELLOW


# --- node-type rules ------------------------------------------------------

def test_llm_node_types_are_green():
    # think / parent / decision / subagent only produce artifacts or judgments.
    for t in ("think", "parent", "decision", "subagent"):
        node = {"type": t, "config": {}, "desc": "draft a summary"}
        assert classify_node(node).level == GREEN, t


def test_user_interaction_node_is_green():
    # A user node just waits for input — an I/O contract, no external effect.
    node = {"type": "user", "config": {}, "desc": "ユーザーに確認を求める"}
    assert classify_node(node).level == GREEN


def test_code_node_is_yellow():
    node = {"type": "code", "config": {"tool": "bash"}, "desc": "rsync の差分を出す"}
    assert classify_node(node).level == YELLOW


def test_hook_node_is_yellow():
    node = {"type": "hook", "config": {"hook_type": "PreToolUse",
                                       "command": "check_weekday.py"}}
    assert classify_node(node).level == YELLOW


def test_skill_node_is_yellow_deny_by_default():
    # A skill is opaque — it may do anything, so default to asking.
    node = {"type": "skill", "config": {"skill_name": "x"},
            "desc": "X に投稿する"}
    assert classify_node(node).level == YELLOW


# --- RED: forced regardless of node type / keyword ------------------------

def test_finance_tool_is_red_over_write_keyword():
    # "create_payment" matches the YELLOW "create" keyword, but finance forces RED.
    node = {"type": "mcp", "config": {"server": "stripe", "action": "tool",
                                      "tool_name": "create_payment"}}
    assert classify_node(node).level == RED


def test_finance_japanese_desc_is_red():
    node = {"type": "code", "config": {"tool": "bash"},
            "desc": "銀行APIで送金を実行する"}
    assert classify_node(node).level == RED


def test_credential_desc_is_red():
    node = {"type": "user", "config": {}, "desc": "パスワードを入力してログインする"}
    assert classify_node(node).level == RED


def test_permission_change_is_red():
    node = {"type": "mcp", "config": {"server": "drive", "action": "tool",
                                      "tool_name": "update_file_permissions"}}
    assert classify_node(node).level == RED


def test_permanent_delete_is_red():
    node = {"type": "mcp", "config": {"server": "gmail", "action": "tool",
                                      "tool_name": "empty_trash"}}
    assert classify_node(node).level == RED


def test_ordinary_delete_stays_yellow():
    # Deleting a single label is a reversible state change, not a hard delete.
    node = {"type": "mcp", "config": {"server": "gmail", "action": "tool",
                                      "tool_name": "delete_label"}}
    assert classify_node(node).level == YELLOW


def test_security_setting_change_is_red():
    node = {"type": "code", "config": {"tool": "bash"},
            "desc": "macOS のセキュリティ設定を変更して Gatekeeper を無効化する"}
    assert classify_node(node).level == RED


# --- token-aware MCP keywords (no substring false positives) --------------

def test_write_tool_with_read_substring_is_yellow():
    # "code_widget_create" contains "get" (wid-GET) but is a CREATE → YELLOW,
    # not GREEN. Verb tokens must be matched whole, not as substrings.
    node = {"type": "mcp", "config": {"server": "miro", "action": "tool",
                                      "tool_name": "code_widget_create"}}
    assert classify_node(node).level == YELLOW


def test_read_tool_with_verb_not_first_is_green():
    # The read verb is not the leading token here, but it should still register.
    node = {"type": "mcp", "config": {"server": "miro", "action": "tool",
                                      "tool_name": "board_list_items"}}
    assert classify_node(node).level == GREEN


def test_explicit_write_verbs_are_yellow():
    for tool in ("create_draft", "update_page", "upload_asset", "post_message",
                 "reply_to_comment", "move_item_to_folder"):
        node = {"type": "mcp", "config": {"action": "tool", "tool_name": tool}}
        assert classify_node(node).level == YELLOW, tool
