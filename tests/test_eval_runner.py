"""Tests for ``main._run_flow_safely`` — the safe-eval flow runner.

The runner spawns ``claude -p`` as a subprocess behind a PreToolUse permission
gate. We do **not** invoke claude here; instead we monkeypatch
``asyncio.create_subprocess_exec`` with a fake process that records the argv +
env it was launched with (and can simulate a blocked-op log line). That lets us
assert the *wiring* the phase-2 second pass needs:

  * ``approved_tools`` → ``SAFE_EVAL_APPROVED`` env (so the hook allows them)
  * ``approved_tools`` → ``--allowedTools`` argv (so claude is willing to call
    them at all; the hook is what actually gates each call)
  * pass-1 behaviour (``approved_tools=None``) is unchanged: no
    ``SAFE_EVAL_APPROVED``, no ``--allowedTools``.
  * blocked_ops parsed from the log carry the phase-2 ``level`` / ``tool_input``.
"""
from __future__ import annotations

import asyncio
import json

import pytest

_FLOW = {
    "name": "テストフロー",
    "description": "何かする",
    "nodes": [{"title": "送信する", "type": "subagent"}],
}
_CASE = {"id": "c1", "title": "ケース1", "input_text": "入力"}


class _FakeProc:
    """Stand-in for an asyncio subprocess: returns canned stdout, no real exec."""

    def __init__(self, stdout: bytes, log_path: str | None, log_rows):
        self._stdout = stdout
        self.returncode = 0
        # Simulate the hook appending blocked-op rows to SAFE_EVAL_LOG.
        if log_path and log_rows:
            with open(log_path, "a", encoding="utf-8") as fh:
                for row in log_rows:
                    fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    async def communicate(self):
        return self._stdout, b""

    def kill(self):
        pass

    async def wait(self):
        return 0


def _patch_subprocess(app_module, monkeypatch, *, stdout=b"OUTPUT", log_rows=None):
    """Patch create_subprocess_exec; return a dict that captures argv/env."""
    captured = {}

    async def fake_exec(*args, env=None, **kwargs):
        captured["args"] = list(args)
        captured["env"] = dict(env or {})
        log_path = captured["env"].get("SAFE_EVAL_LOG")
        return _FakeProc(stdout, log_path, log_rows or [])

    monkeypatch.setattr(app_module.asyncio, "create_subprocess_exec", fake_exec)
    return captured


def test_pass1_no_approved_tools_no_allowlist(app_module, monkeypatch):
    cap = _patch_subprocess(app_module, monkeypatch)
    out, blocked = asyncio.run(
        app_module._run_flow_safely("claude", _FLOW, _CASE))
    assert out == "OUTPUT"
    assert "--allowedTools" not in cap["args"]
    assert "SAFE_EVAL_APPROVED" not in cap["env"]


def test_pass2_approved_tools_set_env_and_allowlist(app_module, monkeypatch):
    cap = _patch_subprocess(app_module, monkeypatch)
    asyncio.run(
        app_module._run_flow_safely("claude", _FLOW, _CASE, approved_tools=["Write", "mcp__x__send"]))
    args = cap["args"]
    assert "--allowedTools" in args
    allow_val = args[args.index("--allowedTools") + 1]
    assert "Write" in allow_val and "mcp__x__send" in allow_val
    approved_env = cap["env"].get("SAFE_EVAL_APPROVED", "")
    assert "Write" in approved_env and "mcp__x__send" in approved_env


def test_pass2_empty_approved_tools_behaves_like_pass1(app_module, monkeypatch):
    cap = _patch_subprocess(app_module, monkeypatch)
    asyncio.run(
        app_module._run_flow_safely("claude", _FLOW, _CASE, approved_tools=[]))
    assert "--allowedTools" not in cap["args"]
    assert "SAFE_EVAL_APPROVED" not in cap["env"]


def test_blocked_ops_carry_level_and_tool_input(app_module, monkeypatch):
    rows = [{
        "tool_name": "Write",
        "decision": "deny",
        "level": "yellow",
        "tool_input": {"file_path": "/tmp/x", "content": "hi"},
        "reason": "[safe-eval] blocked YELLOW: deny-by-default (Write)",
    }]
    _patch_subprocess(app_module, monkeypatch, log_rows=rows)
    out, blocked = asyncio.run(
        app_module._run_flow_safely("claude", _FLOW, _CASE))
    assert len(blocked) == 1
    b = blocked[0]
    assert b["level"] == "yellow"
    assert b["tool_input"]["file_path"] == "/tmp/x"
