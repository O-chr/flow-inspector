"""Bug3: writing CLAUDE.md under projects_root is allowed; everything else stays denied."""
from __future__ import annotations
import importlib, sys
from pathlib import Path
import pytest


def _ws(monkeypatch, home, projects_root):
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("FLOW_INSPECTOR_PROJECTS_ROOT", str(projects_root))
    sys.modules.pop("workspace", None)
    return importlib.import_module("workspace")


def test_claude_md_under_projects_root_allowed(monkeypatch, tmp_path):
    home = tmp_path / "h"; home.mkdir()
    root = tmp_path / "srv"; (root / "demo").mkdir(parents=True)
    wsmod = _ws(monkeypatch, home, root)
    ws = wsmod.WorkspaceManager()
    p = ws._validate_live_path(Path(str(root / "demo" / "CLAUDE.md")))
    assert p == (root / "demo" / "CLAUDE.md").resolve()


def test_non_claude_md_under_projects_root_denied(monkeypatch, tmp_path):
    home = tmp_path / "h"; home.mkdir()
    root = tmp_path / "srv"; (root / "demo").mkdir(parents=True)
    wsmod = _ws(monkeypatch, home, root)
    ws = wsmod.WorkspaceManager()
    with pytest.raises(ValueError):
        ws._validate_live_path(Path(str(root / "demo" / "settings.json")))


def test_claude_local_md_under_projects_root_allowed(monkeypatch, tmp_path):
    """LOCAL layer writes CLAUDE.local.md; must be allowed under projects_root."""
    home = tmp_path / "h"; home.mkdir()
    root = tmp_path / "srv"; (root / "demo").mkdir(parents=True)
    wsmod = _ws(monkeypatch, home, root)
    ws = wsmod.WorkspaceManager()
    p = ws._validate_live_path(Path(str(root / "demo" / "CLAUDE.local.md")))
    assert p == (root / "demo" / "CLAUDE.local.md").resolve()


def test_other_local_md_under_projects_root_denied(monkeypatch, tmp_path):
    """Only CLAUDE.local.md is whitelisted — a lookalike like notes.local.md is not."""
    home = tmp_path / "h"; home.mkdir()
    root = tmp_path / "srv"; (root / "demo").mkdir(parents=True)
    wsmod = _ws(monkeypatch, home, root)
    ws = wsmod.WorkspaceManager()
    with pytest.raises(ValueError):
        ws._validate_live_path(Path(str(root / "demo" / "notes.local.md")))


def test_projects_root_inside_home_does_not_bypass_deny(monkeypatch, tmp_path):
    """bug_003: projects_root inside $HOME (e.g. ~/.claude) must NOT let the
    CLAUDE.md early-allow skip DENY_CLAUDE_SUBTREES."""
    home = tmp_path / "h"; (home / ".claude" / "todos").mkdir(parents=True)
    wsmod = _ws(monkeypatch, home, home / ".claude")   # projects_root is a $HOME descendant
    ws = wsmod.WorkspaceManager()
    with pytest.raises(ValueError):
        ws._validate_live_path(Path(str(home / ".claude" / "todos" / "CLAUDE.md")))


def test_projects_root_inside_home_claude_md_still_allowed_via_policy(monkeypatch, tmp_path):
    """~/.claude/CLAUDE.md stays allowed via the normal $HOME policy (fall-through)."""
    home = tmp_path / "h"; (home / ".claude").mkdir(parents=True)
    wsmod = _ws(monkeypatch, home, home / ".claude")
    ws = wsmod.WorkspaceManager()
    p = ws._validate_live_path(Path(str(home / ".claude" / "CLAUDE.md")))
    assert p == (home / ".claude" / "CLAUDE.md").resolve()


def test_traversal_denied(monkeypatch, tmp_path):
    home = tmp_path / "h"; home.mkdir()
    root = tmp_path / "srv"; root.mkdir()
    wsmod = _ws(monkeypatch, home, root)
    ws = wsmod.WorkspaceManager()
    with pytest.raises(ValueError):
        ws._validate_live_path(Path(str(root / ".." / ".ssh" / "CLAUDE.md")))


def test_home_claude_still_allowed(monkeypatch, tmp_path):
    home = tmp_path / "h"; (home / ".claude").mkdir(parents=True)
    root = tmp_path / "srv"; root.mkdir()
    wsmod = _ws(monkeypatch, home, root)
    ws = wsmod.WorkspaceManager()
    p = ws._validate_live_path(Path(str(home / ".claude" / "CLAUDE.md")))
    assert p == (home / ".claude" / "CLAUDE.md").resolve()


def test_outside_everything_denied(monkeypatch, tmp_path):
    home = tmp_path / "h"; home.mkdir()
    root = tmp_path / "srv"; root.mkdir()
    wsmod = _ws(monkeypatch, home, root)
    ws = wsmod.WorkspaceManager()
    with pytest.raises(ValueError):
        ws._validate_live_path(Path("/etc/passwd"))


def test_write_then_read_under_projects_root(monkeypatch, tmp_path):
    """Critical: staging actually works (write+read) for a /srv-style CLAUDE.md."""
    home = tmp_path / "h"; home.mkdir()
    root = tmp_path / "srv"; (root / "demo").mkdir(parents=True)
    wsmod = _ws(monkeypatch, home, root)
    ws = wsmod.WorkspaceManager()
    target = str(root / "demo" / "CLAUDE.md")
    ws.write_file(target, "# Demo\n本文\n")          # must NOT raise
    got = ws.read_file(target)
    assert "本文" in (got.get("content") if isinstance(got, dict) else got)


def test_broad_projects_root_does_not_bypass_ssh(monkeypatch, tmp_path):
    """Important: projects_root=$HOME must not let ~/.ssh/CLAUDE.md through."""
    home = tmp_path / "h"; (home / ".ssh").mkdir(parents=True)
    wsmod = _ws(monkeypatch, home, home)   # projects_root == $HOME (broad)
    ws = wsmod.WorkspaceManager()
    with pytest.raises(ValueError):
        ws._validate_live_path(Path(str(home / ".ssh" / "CLAUDE.md")))


def test_broad_projects_root_does_not_bypass_deny_subtree(monkeypatch, tmp_path):
    home = tmp_path / "h"; (home / ".claude" / "todos").mkdir(parents=True)
    wsmod = _ws(monkeypatch, home, home)
    ws = wsmod.WorkspaceManager()
    with pytest.raises(ValueError):
        ws._validate_live_path(Path(str(home / ".claude" / "todos" / "CLAUDE.md")))


def test_classify_layer_root_level_project_and_local(monkeypatch, tmp_path):
    """Root-level <project>/CLAUDE(.local).md classify as project/local, not unknown."""
    home = tmp_path / "h"; home.mkdir()
    root = tmp_path / "srv"; (root / "demo").mkdir(parents=True)
    wsmod = _ws(monkeypatch, home, root)
    ws = wsmod.WorkspaceManager()
    assert ws.classify_layer(str(root / "demo" / "CLAUDE.md")) == "project"
    assert ws.classify_layer(str(root / "demo" / "CLAUDE.local.md")) == "local"
    # $HOME/.claude/ branches still take precedence over the name-based checks
    assert ws.classify_layer(str(home / ".claude" / "CLAUDE.md")) == "user"
    assert ws.classify_layer(str(home / ".claude" / "projects" / "p" / "CLAUDE.md")) == "user-project"
