"""Pure operation-classifier for Eval safe execution.

Maps a single flow node to a risk level so the eval runner can decide whether
to auto-run it, pause for the user, or refuse outright:

  * ``GREEN``  — read-only / no side effects → safe to auto-run in a test
  * ``YELLOW`` — has side effects (send / write / state-change) → ask the user
  * ``RED``    — finance / credentials / account / permanent-delete → never run

Design (per ``docs/superpowers/specs/2026-06-05-eval-safe-execution-design.md``):
keyword-driven and **deny-by-default** — anything not provably read-only falls
to YELLOW; GREEN is reserved for operations we can confidently call harmless.

This module is pure (no I/O, no imports beyond stdlib) so it is cheap to unit
test and safe to call from anywhere in the request path.
"""
from __future__ import annotations

import re
from typing import NamedTuple


GREEN = "green"
YELLOW = "yellow"
RED = "red"


class RiskClass(NamedTuple):
    level: str
    reason: str


# MCP verb tokens. Matched against whole tool-name tokens (not substrings) so
# e.g. "code_widget_create" is a write (the "get" inside "widget" doesn't make
# it a read). Write takes precedence over read when both appear.
_READ_VERBS = frozenset((
    "search", "list", "get", "read", "fetch", "lookup", "download",
    "find", "browse", "query", "explore", "view", "describe", "pull", "ping",
))
_WRITE_VERBS = frozenset((
    "create", "update", "delete", "send", "post", "reply", "draft", "upload",
    "move", "copy", "label", "unlabel", "archive", "resolve", "write", "set",
    "add", "remove", "merge", "sync", "generate", "export", "import",
    "duplicate", "comment", "respond", "cancel", "commit", "perform", "manage",
    "deactivate", "edit", "rename", "publish", "share", "submit",
))

# Node types that only produce artifacts / judgments or wait for input — no
# external side effects, so safe to auto-run.
_GREEN_NODE_TYPES = ("think", "parent", "decision", "subagent", "user")

# RED: operations the app must never auto-run, even with permission. Matched as
# substrings (case-folded) over the node's searchable text; bias is toward
# over-blocking, since a false RED only means "won't auto-run" while a missed
# one could move money or leak secrets.
_RED_PHRASES = (
    # finance / payments (verb itself is the danger)
    "payment", "送金", "振込", "決済", "出金", "購入", "支払", "課金", "売却", "売買",
    "withdraw", "purchase", "checkout", "payout", "remit",
    # credentials / secrets
    "password", "パスワード", "passcode", "credential", "認証情報",
    "api key", "api_key", "apikey", "secret key", "秘密鍵",
    "card number", "card_number", "クレジットカード",
    # permanent / destructive delete
    "empty trash", "empty_trash", "hard delete", "hard_delete",
    "permanent delete", "permanently delete", "permanently_delete",
    "完全削除", "恒久削除", "ゴミ箱を空",
    # account / sharing changes (explicit phrasings)
    "共有設定", "権限変更", "権限を変更", "アカウント作成", "アカウント削除",
    "recovery contact", "回復用連絡先",
    # captcha / system & security settings
    "captcha", "セキュリティ設定", "システム設定", "security setting",
    "system setting",
)

# Account / permission *changes* are RED, but merely *reading* them is not, so
# require a mutation verb alongside the noun (e.g. update_file_permissions →
# RED, but get_file_permissions → falls through to the read-keyword check).
_RESTRICTED_NOUNS = ("permission", "sharing", "共有", "権限", "account", "アカウント")
_MUTATION_VERBS = ("change", "update", "set", "grant", "revoke", "modify",
                   "create", "delete", "deactivate", "変更", "作成", "削除")


def _searchable_text(node: dict) -> str:
    """Case-folded blob of everything that describes what a node *does*."""
    parts = [str(node.get("desc") or ""), str(node.get("title") or "")]
    parts.extend(str(v) for v in (node.get("config") or {}).values())
    return " ".join(parts).lower()


def _red_match(text: str) -> str | None:
    """Return a short label for why ``text`` is RED, or ``None``."""
    for phrase in _RED_PHRASES:
        if phrase in text:
            return phrase
    if any(v in text for v in _MUTATION_VERBS):
        for noun in _RESTRICTED_NOUNS:
            if noun in text:
                return noun
    return None


def _tokenize(name: str) -> set[str]:
    """Split a tool name into lowercased word tokens (snake_case + camelCase)."""
    spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name)
    return {t.lower() for t in re.split(r"[^A-Za-z0-9]+", spaced) if t}


def _classify_mcp(config: dict) -> RiskClass:
    tool_name = str(config.get("tool_name") or "")
    tokens = _tokenize(tool_name)
    if tokens & _WRITE_VERBS:
        return RiskClass(YELLOW, f"MCP write/side-effecting tool ({tool_name})")
    if tokens & _READ_VERBS:
        return RiskClass(GREEN, f"read-only MCP tool ({tool_name})")
    return RiskClass(YELLOW, f"unknown MCP tool, deny-by-default ({tool_name})")


def classify_node(node: dict) -> RiskClass:
    red = _red_match(_searchable_text(node))
    if red is not None:
        return RiskClass(RED, f"high-risk operation blocked ({red})")
    config = node.get("config") or {}
    node_type = node.get("type")
    if node_type == "mcp":
        return _classify_mcp(config)
    if node_type in _GREEN_NODE_TYPES:
        return RiskClass(GREEN, f"no side effects ({node_type})")
    return RiskClass(YELLOW, "deny-by-default")


# Built-in Claude tools that only read / observe — safe to auto-allow in a run.
# Everything else built-in (Edit, Write, NotebookEdit, Bash, Task, …) is left
# to deny-by-default YELLOW: Bash especially can curl-POST or delete files.
_GREEN_BUILTINS = frozenset((
    "Read", "Glob", "Grep", "LS", "WebSearch", "WebFetch", "NotebookRead",
))


def _mcp_tool_part(tool_name: str) -> str:
    """Extract the tool segment from ``mcp__<server>__<tool>``.

    The server id may itself contain no ``__`` (it is the first segment); the
    tool name is everything after the first ``__`` split, so underscores inside
    the tool name are preserved (e.g. ``mcp__drive__update_file_permissions``).
    """
    rest = tool_name[len("mcp__"):]
    server, sep, tool = rest.partition("__")
    return tool if sep else server


def classify_tool(tool_name: str, tool_input: dict | None = None) -> RiskClass:
    """Classify one real Claude tool invocation for the PreToolUse gate.

    ``tool_name`` is the Claude tool name (``Read``, ``Bash``,
    ``mcp__server__tool`` …); ``tool_input`` is the call's argument dict, used
    for the RED keyword scan (a Bash command that wires money is RED even though
    Bash alone is only YELLOW). Deny-by-default: unknown → YELLOW.
    """
    blob = tool_name
    if isinstance(tool_input, dict):
        blob += " " + " ".join(str(v) for v in tool_input.values())
    elif tool_input is not None:
        blob += " " + str(tool_input)
    red = _red_match(blob.lower())
    if red is not None:
        return RiskClass(RED, f"high-risk operation blocked ({red})")
    if tool_name.startswith("mcp__"):
        tokens = _tokenize(_mcp_tool_part(tool_name))
        if tokens & _WRITE_VERBS:
            return RiskClass(YELLOW, f"MCP write/side-effecting tool ({tool_name})")
        if tokens & _READ_VERBS:
            return RiskClass(GREEN, f"read-only MCP tool ({tool_name})")
        return RiskClass(YELLOW, f"unknown MCP tool, deny-by-default ({tool_name})")
    if tool_name in _GREEN_BUILTINS:
        return RiskClass(GREEN, f"read-only tool ({tool_name})")
    return RiskClass(YELLOW, f"deny-by-default ({tool_name})")
