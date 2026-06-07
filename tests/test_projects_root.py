"""Tests for FLOW_INSPECTOR_PROJECTS_ROOT override (bug B).

The project layer is scanned under a configurable root so users whose projects
do not live in ~/projects (e.g. /srv on a VPS) still get them discovered.
"""
from __future__ import annotations

import importlib
from pathlib import Path


def _fresh_main(monkeypatch, isolated_home):
    """Re-import main with a clean env so module-level constants recompute."""
    monkeypatch.setenv("HOME", str(isolated_home))
    import sys
    for name in ("main", "workspace"):
        sys.modules.pop(name, None)
    return importlib.import_module("main")


def test_default_is_home_projects(monkeypatch, isolated_home):
    monkeypatch.delenv("FLOW_INSPECTOR_PROJECTS_ROOT", raising=False)
    main = _fresh_main(monkeypatch, isolated_home)
    assert main._projects_root() == str(Path(isolated_home) / "projects")


def test_override_absolute_path(monkeypatch, isolated_home):
    monkeypatch.setenv("FLOW_INSPECTOR_PROJECTS_ROOT", "/srv")
    main = _fresh_main(monkeypatch, isolated_home)
    assert main._projects_root() == "/srv"


def test_override_tilde_expands(monkeypatch, isolated_home):
    monkeypatch.setenv("FLOW_INSPECTOR_PROJECTS_ROOT", "~/work")
    main = _fresh_main(monkeypatch, isolated_home)
    assert main._projects_root() == str(Path(isolated_home) / "work")


def test_override_blank_falls_back_to_default(monkeypatch, isolated_home):
    monkeypatch.setenv("FLOW_INSPECTOR_PROJECTS_ROOT", "   ")
    main = _fresh_main(monkeypatch, isolated_home)
    assert main._projects_root() == str(Path(isolated_home) / "projects")
