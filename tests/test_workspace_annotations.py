"""Flow-ization (annotation) persistence across init().

init() rmtree's workspace_path on every plugin launch, which used to wipe
flow-ization output (it lived under workspace/files/). These tests pin the
fix: flow-ization is persisted to annotations_path (outside workspace_path)
and re-applied into a fresh staging surface on init(), so it survives a
restart. Plain text edits (the file editor) intentionally stay ephemeral.
"""
from __future__ import annotations
import importlib
import sys

import pytest


def _ws(monkeypatch, home, projects_root):
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("FLOW_INSPECTOR_PROJECTS_ROOT", str(projects_root))
    sys.modules.pop("workspace", None)
    return importlib.import_module("workspace")


def _mk(monkeypatch, tmp_path):
    home = tmp_path / "h"; home.mkdir()
    root = tmp_path / "srv"; root.mkdir()
    wsmod = _ws(monkeypatch, home, root)
    return home, wsmod.WorkspaceManager()


def test_annotation_survives_init(monkeypatch, tmp_path):
    """Persisted flow-ization is re-applied to staging after a restart."""
    home, ws = _mk(monkeypatch, tmp_path)
    live = home / ".claude" / "skills" / "foo" / "SKILL.md"
    ws.init()
    ws.save_annotation(live, "ANNOTATED-v1")
    # restart: rmtree(workspace) + rebuild + re-apply annotations
    result = ws.init()
    assert result["annotations_reapplied"] == 1
    staged = ws.live_to_staged(live)
    assert staged.is_file()
    assert staged.read_text(encoding="utf-8") == "ANNOTATED-v1"


def test_plain_edit_does_not_survive_init(monkeypatch, tmp_path):
    """A manual editor write (no save_annotation) is wiped by init() — scope."""
    home, ws = _mk(monkeypatch, tmp_path)
    ws.init()
    live = home / ".claude" / "CLAUDE.md"
    ws.write_file(live, "MANUAL-EDIT")
    assert ws.live_to_staged(live).read_text(encoding="utf-8") == "MANUAL-EDIT"
    ws.init()  # restart
    assert not ws.live_to_staged(live).is_file()


def test_remove_annotation_then_init_gone(monkeypatch, tmp_path):
    """remove_annotation drops persistence so init() won't resurrect it."""
    home, ws = _mk(monkeypatch, tmp_path)
    live = home / ".claude" / "skills" / "bar" / "SKILL.md"
    ws.init()
    ws.save_annotation(live, "ANNOTATED")
    assert ws.remove_annotation(live) is True
    ws.init()
    assert not ws.live_to_staged(live).is_file()


def test_discard_removes_annotation(monkeypatch, tmp_path):
    """Discarding a flow-ized staged file also clears its persistence."""
    home, ws = _mk(monkeypatch, tmp_path)
    live = home / ".claude" / "skills" / "baz" / "SKILL.md"
    ws.init()
    ws.write_file(live, "ANNOTATED")
    ws.save_annotation(live, "ANNOTATED")
    ws.discard_file(live)
    ws.init()
    assert not ws.live_to_staged(live).is_file()
