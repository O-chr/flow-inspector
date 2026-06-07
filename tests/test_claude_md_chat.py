"""context_type='claude-md' builds a CLAUDE.md authoring prompt/context."""
from __future__ import annotations
import importlib, sys
from pathlib import Path


def _main(monkeypatch, home):
    monkeypatch.setenv("HOME", str(home))
    for n in ("main", "workspace"):
        sys.modules.pop(n, None)
    return importlib.import_module("main")


def _main_with_root(monkeypatch, home, projects_root):
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("FLOW_INSPECTOR_PROJECTS_ROOT", str(projects_root))
    for n in ("main", "workspace", "project_context"):
        sys.modules.pop(n, None)
    return importlib.import_module("main")


def _demo_project(tmp_path):
    home = tmp_path / "h"; home.mkdir()
    root = tmp_path / "srv"; (root / "demo").mkdir(parents=True)
    (root / "demo" / "README.md").write_text("# Demo\nGROUNDED_MARKER\n", encoding="utf-8")
    return home, root, str(root / "demo")


def test_claude_md_request_project_layer_injects_tree(monkeypatch, tmp_path):
    home, root, proj = _demo_project(tmp_path)
    main = _main_with_root(monkeypatch, home, root)
    sysp, ctx = main.build_claude_md_request({"project_path": proj, "layer": "project"})
    assert "GROUNDED_MARKER" in ctx        # codebase summary injected
    assert "チーム共有" in sysp             # PROJECT layer guidance present


def test_claude_md_request_user_layer_no_project_tree(monkeypatch, tmp_path):
    home, root, proj = _demo_project(tmp_path)
    main = _main_with_root(monkeypatch, home, root)
    sysp, ctx = main.build_claude_md_request({"project_path": proj, "layer": "user"})
    assert "GROUNDED_MARKER" not in ctx     # cross-project: no project tree
    assert "全プロジェクト共通" in sysp       # USER GLOBAL guidance present


def test_claude_md_request_user_layer_strips_legacy_tree_summary(monkeypatch, tmp_path):
    """USER GLOBAL must not leak project context even via the legacy tree_summary
    fallback field (spec: USER GLOBAL gets no project tree)."""
    home, root, proj = _demo_project(tmp_path)
    main = _main_with_root(monkeypatch, home, root)
    _, ctx = main.build_claude_md_request(
        {"project_path": proj, "layer": "user", "tree_summary": "src/secret/PROJECT_LEAK_MARKER"}
    )
    assert "PROJECT_LEAK_MARKER" not in ctx


def test_claude_md_request_local_layer_injects_tree(monkeypatch, tmp_path):
    home, root, proj = _demo_project(tmp_path)
    main = _main_with_root(monkeypatch, home, root)
    sysp, ctx = main.build_claude_md_request({"project_path": proj, "layer": "local"})
    assert "GROUNDED_MARKER" in ctx          # local is project-scoped
    assert "ローカル上書き" in sysp


def test_claude_md_request_default_layer_is_project(monkeypatch, tmp_path):
    home, root, proj = _demo_project(tmp_path)
    main = _main_with_root(monkeypatch, home, root)
    sysp, ctx = main.build_claude_md_request({"project_path": proj})
    assert "GROUNDED_MARKER" in ctx          # missing layer → treated as project
    assert "チーム共有" in sysp


def test_claude_md_system_is_interview_style(monkeypatch, tmp_path):
    home = tmp_path / "h"; home.mkdir()
    main = _main(monkeypatch, home)
    # the rewritten prompt is question-driven (asks one at a time)
    assert "1問" in main.CLAUDE_MD_SYSTEM or "1 問" in main.CLAUDE_MD_SYSTEM


def test_claude_md_request_user_layer_omits_project_line(monkeypatch, tmp_path):
    """USER GLOBAL is cross-project: no '対象プロジェクト:' line (bug_009)."""
    home, root, proj = _demo_project(tmp_path)
    main = _main_with_root(monkeypatch, home, root)
    _, ctx = main.build_claude_md_request({"project_path": proj, "layer": "user"})
    assert "対象プロジェクト" not in ctx


def test_claude_md_request_project_layer_keeps_project_line(monkeypatch, tmp_path):
    home, root, proj = _demo_project(tmp_path)
    main = _main_with_root(monkeypatch, home, root)
    _, ctx = main.build_claude_md_request({"project_path": proj, "layer": "project"})
    assert "対象プロジェクト" in ctx


def test_build_claude_md_context_includes_path_and_existing(monkeypatch, tmp_path):
    home = tmp_path / "h"; home.mkdir()
    main = _main(monkeypatch, home)
    board = {"project_path": "/srv/demo", "existing_content": "# Old\n", "tree_summary": "src/\n  a.py"}
    ctx = main.build_claude_md_context(board)
    assert "/srv/demo" in ctx
    assert "# Old" in ctx
    assert "a.py" in ctx


def test_build_claude_md_context_renders_project_summary(monkeypatch, tmp_path):
    """The auto-gathered project_summary is handed to the model verbatim."""
    home = tmp_path / "h"; home.mkdir()
    main = _main(monkeypatch, home)
    board = {
        "project_path": "/srv/demo",
        "project_summary": "ディレクトリ構成(上位2階層):\nsrc/\n\n主要ファイル抜粋:\n[README.md]\nhello world",
    }
    ctx = main.build_claude_md_context(board)
    assert "README.md" in ctx and "hello world" in ctx and "src/" in ctx


def test_build_claude_md_context_no_existing(monkeypatch, tmp_path):
    home = tmp_path / "h"; home.mkdir()
    main = _main(monkeypatch, home)
    ctx = main.build_claude_md_context({"project_path": "/srv/x"})
    assert "/srv/x" in ctx
    assert "なし" in ctx  # 新規作成の明示


def test_claude_md_system_prompt_exists(monkeypatch, tmp_path):
    home = tmp_path / "h"; home.mkdir()
    main = _main(monkeypatch, home)
    assert isinstance(main.CLAUDE_MD_SYSTEM, str) and "CLAUDE.md" in main.CLAUDE_MD_SYSTEM


def test_claude_md_request_project_layer_reads_top_level_source(monkeypatch, tmp_path):
    """Proposal-first: project-scoped layers read top-level source (app.py) from
    the start — build_claude_md_request calls gather_project_context(deep=True)
    for project系 unconditionally (commit 提案ファースト化)."""
    home = tmp_path / "h"; home.mkdir()
    root = tmp_path / "srv"; (root / "demo").mkdir(parents=True)
    (root / "demo" / "README.md").write_text("# d\n", encoding="utf-8")
    (root / "demo" / "app.py").write_text("DEEP_MARKER = 1\n", encoding="utf-8")
    main = _main_with_root(monkeypatch, home, root)
    _, ctx = main.build_claude_md_request({"project_path": str(root / "demo"), "layer": "project"})
    assert "DEEP_MARKER" in ctx
