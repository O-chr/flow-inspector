"""Tests for the PreToolUse hook wrapper (``server/eval_pretooluse_hook.py``).

Claude runs this script as a subprocess, feeding one tool call as JSON on stdin
and reading the permission decision as JSON on stdout. Phase 2 adds two things
this file exercises end-to-end (subprocess, real env, real stdin):

  * ``SAFE_EVAL_APPROVED`` (comma-separated tool names) is passed to
    ``decide_tool`` so an approved 🟡 tool is *allowed* on pass 2.
  * each blocked op logged to ``SAFE_EVAL_LOG`` now also records the risk
    ``level`` (yellow/red) and the ``tool_input`` so the UI can show "what it
    would have sent".

The script is invoked exactly the way Claude invokes it (subprocess + stdin),
so these double as a contract test for the wire format.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).resolve().parent.parent / "plugins" / "flow-inspector" / "server" / "eval_pretooluse_hook.py"


def _run_hook(event: dict, *, approved: str | None = None, log_path: str | None = None):
    env = {}
    if approved is not None:
        env["SAFE_EVAL_APPROVED"] = approved
    if log_path is not None:
        env["SAFE_EVAL_LOG"] = log_path
    # Inherit PATH etc. but start from a clean-ish env for determinism.
    import os
    full_env = {**os.environ, **env}
    if approved is None:
        full_env.pop("SAFE_EVAL_APPROVED", None)
    proc = subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps(event).encode("utf-8"),
        capture_output=True,
        env=full_env,
    )
    assert proc.returncode == 0, proc.stderr.decode()
    out = json.loads(proc.stdout.decode())
    return out["hookSpecificOutput"]


def _read_log(path: Path):
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


# --- approvals via env ----------------------------------------------------

def test_green_allowed_with_no_env():
    d = _run_hook({"tool_name": "Read", "tool_input": {"file_path": "/x"}})
    assert d["permissionDecision"] == "allow"


def test_yellow_denied_without_approval():
    d = _run_hook({"tool_name": "Write", "tool_input": {"file_path": "/x", "content": "y"}})
    assert d["permissionDecision"] == "deny"


def test_yellow_allowed_when_approved_via_env():
    d = _run_hook(
        {"tool_name": "Write", "tool_input": {"file_path": "/x", "content": "y"}},
        approved="Write")
    assert d["permissionDecision"] == "allow"


def test_approved_env_is_comma_separated():
    d = _run_hook(
        {"tool_name": "mcp__gmail__create_draft", "tool_input": {}},
        approved="Write, mcp__gmail__create_draft ,Edit")
    assert d["permissionDecision"] == "allow"


def test_red_denied_even_when_approved_via_env():
    d = _run_hook(
        {"tool_name": "mcp__stripe__create_payment", "tool_input": {}},
        approved="mcp__stripe__create_payment")
    assert d["permissionDecision"] == "deny"


# --- richer log: level + tool_input --------------------------------------

def test_blocked_log_records_level_and_tool_input(tmp_path):
    log = tmp_path / "blocked.jsonl"
    tool_input = {"to": "a@b.com", "subject": "hi", "body": "hello"}
    _run_hook(
        {"tool_name": "mcp__gmail__create_draft", "tool_input": tool_input},
        log_path=str(log))
    rows = _read_log(log)
    assert len(rows) == 1
    row = rows[0]
    assert row["tool_name"] == "mcp__gmail__create_draft"
    assert row["decision"] == "deny"
    assert row["level"] == "yellow"
    assert row["tool_input"] == tool_input
    assert row.get("reason")


def test_red_block_logs_red_level(tmp_path):
    log = tmp_path / "blocked.jsonl"
    _run_hook(
        {"tool_name": "mcp__stripe__create_payment", "tool_input": {"amount": 999}},
        log_path=str(log))
    rows = _read_log(log)
    assert rows and rows[0]["level"] == "red"


def test_allowed_op_is_not_logged(tmp_path):
    log = tmp_path / "blocked.jsonl"
    _run_hook({"tool_name": "Read", "tool_input": {"file_path": "/x"}}, log_path=str(log))
    # nothing blocked → no log file written (or empty)
    assert not log.exists() or _read_log(log) == []


def test_approved_yellow_is_not_logged_as_blocked(tmp_path):
    log = tmp_path / "blocked.jsonl"
    _run_hook(
        {"tool_name": "Write", "tool_input": {"file_path": "/x", "content": "y"}},
        approved="Write", log_path=str(log))
    assert not log.exists() or _read_log(log) == []


# --- safety: malformed input still denies, doesn't crash ------------------

def test_malformed_stdin_denies():
    proc = subprocess.run(
        [sys.executable, str(HOOK)],
        input=b"not json at all",
        capture_output=True,
    )
    assert proc.returncode == 0
    out = json.loads(proc.stdout.decode())
    assert out["hookSpecificOutput"]["permissionDecision"] == "deny"
