"""Shared pytest fixtures for the flow-inspector backend test suite.

Two responsibilities:

1. Make the ``server/`` package importable. Its modules use *absolute*
   sibling imports (``from io_utils import ...``), so ``server/`` itself must
   be on ``sys.path`` — not the repo root.

2. Isolate every test from the real machine. ``server/main.py`` resolves its
   cache directory from ``$HOME`` at *import time* (via ``WorkspaceManager``)
   and creates ``$HOME/.cache/flow-inspector`` as a side effect. We therefore
   point ``$HOME`` at a throwaway temp dir *before* importing ``main`` so
   nothing touches the developer's real ``~/.claude`` / ``~/.cache``.

All test data here is fully synthetic (invented skill/flow/user names). No
real paths, identities, or secrets appear anywhere in this suite.
"""
from __future__ import annotations

import importlib
import shutil
import sys
from pathlib import Path

import pytest

# --- 1. Put server/ on sys.path -------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
SERVER_DIR = REPO_ROOT / "plugins" / "flow-inspector" / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


# --- session-scoped monkeypatch -------------------------------------------
@pytest.fixture(scope="session")
def monkeypatch_session():
    """A session-scoped ``MonkeyPatch`` (the built-in one is function-scoped)."""
    from _pytest.monkeypatch import MonkeyPatch

    mp = MonkeyPatch()
    yield mp
    mp.undo()


# --- 2. HOME-isolated FastAPI app -----------------------------------------
@pytest.fixture(scope="session")
def isolated_home(tmp_path_factory):
    """A session-wide fake ``$HOME`` directory (a temp dir)."""
    return tmp_path_factory.mktemp("fake_home")


@pytest.fixture(scope="session")
def app_module(isolated_home, monkeypatch_session):
    """Import ``server/main.py`` with ``$HOME`` pointed at a temp dir.

    Imported once per session (module import has filesystem side effects we
    only want to incur against the temp home). Per-test isolation of stored
    flows is handled separately by :func:`clean_data_dirs`.
    """
    monkeypatch_session.setenv("HOME", str(isolated_home))
    # Drop any previously-imported copy so module-level path constants are
    # recomputed against the fake HOME.
    for name in ("main", "workspace"):
        sys.modules.pop(name, None)
    main = importlib.import_module("main")
    # Sanity: the cache root really lives under our fake home.
    assert str(main.ws.cache_dir).startswith(str(isolated_home))
    return main


@pytest.fixture
def clean_data_dirs(app_module):
    """Give each test a blank flows / drafts / staged-skills slate.

    Keeps the cache root stable (so the already-imported module's path
    constants stay valid) while wiping per-test state.
    """
    ws = app_module.ws
    targets = [
        ws.flows_path,
        ws.cache_dir / "drafts",
        ws.cache_dir / "staged-skills",
        ws.cache_dir / "locks",
    ]
    for d in targets:
        if d.exists():
            shutil.rmtree(d)
    ws.flows_path.mkdir(parents=True, exist_ok=True)
    yield


@pytest.fixture
def seed_flow(app_module, clean_data_dirs):
    """Return a helper that drops a synthetic flow JSON into the flows dir.

    ``main._get_all_flows`` overlays any ``<id>.json`` in ``ws.flows_path`` on
    top of the (here empty) scan results, so writing one file makes the flow
    visible to every ``/api/flows/...`` endpoint. Edges use the on-disk
    ``from``/``to`` key style the backend expects.
    """
    import json

    def _seed(flow: dict) -> dict:
        app_module.ws.flows_path.mkdir(parents=True, exist_ok=True)
        path = app_module.ws.flows_path / f"{flow['id']}.json"
        path.write_text(json.dumps(flow), encoding="utf-8")
        return flow

    return _seed


@pytest.fixture
def client(app_module, clean_data_dirs):
    """A ``TestClient`` bound to the HOME-isolated app."""
    from fastapi.testclient import TestClient

    return TestClient(app_module.app)
