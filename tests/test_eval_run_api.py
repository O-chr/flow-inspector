"""API-level tests for ``POST /api/flows/{id}/eval/run`` — phase-2 approvals.

We never call the real claude CLI: ``find_claude_cli`` is stubbed and
``_run_flow_safely`` is replaced with a fake that (a) records the
``approved_tools`` it was handed and (b) returns synthetic blocked ops (one 🟡,
one 🔴). The LLM judge subprocess is also stubbed to a canned pass verdict.

These assert the phase-2 contract the frontend depends on:

  * ``EvalRunRequest`` accepts ``approved_tools`` and threads it to the runner.
  * each executed case result exposes ``pending_approvals`` = the 🟡 blocked ops
    (approvable) and keeps 🔴 ops out of that list (non-approvable).
"""
from __future__ import annotations

import json

import pytest


@pytest.fixture
def seeded_eval(app_module, clean_data_dirs):
    """Seed one version + one case + one llm evaluator; return the flow_id."""
    flow_id = "demoflow"
    snapshot = {
        "id": flow_id, "name": "デモ", "description": "テスト",
        "nodes": [{"id": "n1", "title": "送信", "type": "subagent", "desc": ""}],
    }
    ev = {
        "cases": [{"id": "case1", "title": "ケース1", "input_text": "in"}],
        "evaluators": [{"id": "ev1", "name": "判定", "type": "llm", "prompt": "ok?"}],
        "versions": [{"id": "v1", "label": "v1", "snapshot": snapshot}],
        "runs": [],
    }
    app_module.save_eval_data(flow_id, ev)
    return flow_id


def _stub_judge_pass(app_module, monkeypatch):
    """Make the judge subprocess return a pass verdict without a real claude."""
    class _P:
        returncode = 0
        async def communicate(self):
            return json.dumps({"verdict": "pass", "reason": "ok"}).encode(), b""
        def kill(self): pass
        async def wait(self): return 0

    async def fake_exec(*args, **kwargs):
        return _P()

    monkeypatch.setattr(app_module.asyncio, "create_subprocess_exec", fake_exec)


def _stub_runner(app_module, monkeypatch, captured):
    """Replace _run_flow_safely with a fake that records approved_tools."""
    blocked = [
        {"tool_name": "mcp__gmail__create_draft", "decision": "deny", "level": "yellow",
         "tool_input": {"to": "a@b.com", "subject": "件名", "body": "本文"},
         "reason": "[safe-eval] blocked YELLOW: ..."},
        {"tool_name": "mcp__stripe__create_payment", "decision": "deny", "level": "red",
         "tool_input": {"amount": 100},
         "reason": "[safe-eval] blocked RED: ..."},
    ]

    async def fake_run(claude_bin, snapshot, case, approved_tools=None):
        captured["approved_tools"] = approved_tools
        return "REAL OUTPUT", blocked

    monkeypatch.setattr(app_module, "_run_flow_safely", fake_run)


def test_run_threads_approved_tools_to_runner(app_module, monkeypatch, seeded_eval):
    monkeypatch.setattr(app_module, "find_claude_cli", lambda: "claude")
    captured = {}
    _stub_runner(app_module, monkeypatch, captured)
    _stub_judge_pass(app_module, monkeypatch)

    from fastapi.testclient import TestClient
    client = TestClient(app_module.app)
    resp = client.post(f"/api/flows/{seeded_eval}/eval/run", json={
        "version_id": "v1", "execute": True,
        "approved_tools": ["mcp__gmail__create_draft"],
    })
    assert resp.status_code == 200, resp.text
    assert captured["approved_tools"] == ["mcp__gmail__create_draft"]


def test_executed_case_exposes_pending_approvals_yellow_only(app_module, monkeypatch, seeded_eval):
    monkeypatch.setattr(app_module, "find_claude_cli", lambda: "claude")
    _stub_runner(app_module, monkeypatch, {})
    _stub_judge_pass(app_module, monkeypatch)

    from fastapi.testclient import TestClient
    client = TestClient(app_module.app)
    resp = client.post(f"/api/flows/{seeded_eval}/eval/run", json={
        "version_id": "v1", "execute": True,
    })
    assert resp.status_code == 200, resp.text
    run = resp.json()
    case = run["results"][0]
    assert case["executed"] is True
    # pending_approvals = the 🟡 ops only (approvable)
    pending = case["pending_approvals"]
    assert len(pending) == 1
    assert pending[0]["tool_name"] == "mcp__gmail__create_draft"
    assert pending[0]["level"] == "yellow"
    assert pending[0]["tool_input"]["subject"] == "件名"
    # the 🔴 op must NOT be in pending_approvals
    assert all(p["level"] != "red" for p in pending)
    # but it should still be visible somewhere (blocked_ops keeps everything)
    assert any(b["level"] == "red" for b in case["blocked_ops"])


def test_run_without_approved_tools_passes_none(app_module, monkeypatch, seeded_eval):
    monkeypatch.setattr(app_module, "find_claude_cli", lambda: "claude")
    captured = {}
    _stub_runner(app_module, monkeypatch, captured)
    _stub_judge_pass(app_module, monkeypatch)

    from fastapi.testclient import TestClient
    client = TestClient(app_module.app)
    resp = client.post(f"/api/flows/{seeded_eval}/eval/run", json={
        "version_id": "v1", "execute": True,
    })
    assert resp.status_code == 200, resp.text
    assert captured["approved_tools"] is None
