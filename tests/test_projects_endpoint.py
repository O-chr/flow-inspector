"""GET /api/projects: list project dirs under projects_root (minus excludes)."""
from __future__ import annotations
import importlib, sys
from pathlib import Path


def _fresh_main(monkeypatch, home, projects_root):
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("FLOW_INSPECTOR_PROJECTS_ROOT", str(projects_root))
    for n in ("main", "workspace"):
        sys.modules.pop(n, None)
    return importlib.import_module("main")


def _client(main):
    from fastapi.testclient import TestClient
    return TestClient(main.app)


def test_lists_real_dirs_excludes_noise(monkeypatch, tmp_path):
    home = tmp_path / "home"; home.mkdir()
    root = tmp_path / "srv"; root.mkdir()
    for name in ["my-project", "another", "venv", ".venv", "node_modules",
                 "_archive", "__pycache__", "flow-inspector", "flow-inspector-venv",
                 ".hidden"]:
        (root / name).mkdir()
    (root / "my-project" / "CLAUDE.md").write_text("# x\n", encoding="utf-8")
    (root / "another" / ".claude").mkdir()

    main = _fresh_main(monkeypatch, home, root)
    r = _client(main).get("/api/projects")
    assert r.status_code == 200
    names = {p["name"] for p in r.json()["projects"]}
    assert names == {"my-project", "another"}
    by = {p["name"]: p for p in r.json()["projects"]}
    assert by["my-project"]["has_claude_md"] is True
    assert by["my-project"]["has_claude_dir"] is False
    assert by["another"]["has_claude_dir"] is True
    assert by["another"]["has_claude_md"] is False
    assert by["my-project"]["path"].endswith("/my-project")


def test_empty_when_root_missing(monkeypatch, tmp_path):
    home = tmp_path / "home"; home.mkdir()
    main = _fresh_main(monkeypatch, home, tmp_path / "nope")
    r = _client(main).get("/api/projects")
    assert r.status_code == 200
    assert r.json()["projects"] == []
