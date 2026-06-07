"""Bug C: project-layer scan must only treat *real* projects as projects.

Before the fix, `_scan_extra_skills` rglob'd SKILL.md under EVERY top-level
directory of the projects root. On a VPS whose projects root is /srv, that
pulled in venvs, archives, and the tool's own dir (e.g. `_archive`,
`flow-inspector-venv`) as bogus "projects" because they happened to contain a
SKILL.md somewhere in their tree.

A directory should only be scanned for extra (non-.claude) skills when it
looks like a real project: it has a `.claude/` dir, a `CLAUDE.md`, or a
`.git/` dir. venvs/archives have none of these.
"""
from __future__ import annotations

from pathlib import Path

import parser as P


def _skill(dirpath: Path, name: str, body="---\nname: %s\ndescription: d\n---\n# %s\n本文\n"):
    d = dirpath / name
    d.mkdir(parents=True, exist_ok=True)
    (d / "SKILL.md").write_text(body % (name, name), encoding="utf-8")


def test_venv_like_dir_is_not_scanned_as_project(tmp_path):
    """A dir with a SKILL.md buried inside but no .claude/CLAUDE.md/.git is skipped."""
    root = tmp_path / "srv"
    root.mkdir()
    # bogus: a venv-style dir that happens to contain a SKILL.md sample deep inside
    _skill(root / "flow-inspector-venv" / "lib" / "site" / "pkg", "samp")
    _skill(root / "_archive" / "old" / "skills", "legacy")

    flows = P.discover_and_scan_all(projects_root=str(root))
    proj = [f for f in flows if (f.get("source") or {}).get("layer") == "project"
            or f.get("source_layer") == "project" or f.get("layer") == "project"]
    names = {f.get("working_dir") or (f.get("meta") or {}).get("working_dir") for f in flows}
    # neither bogus dir should appear as a project
    assert "flow-inspector-venv" not in names
    assert "_archive" not in names


def test_real_project_with_claude_dir_is_scanned(tmp_path):
    """A dir WITH .claude/ is a real project; its extra skills are picked up."""
    root = tmp_path / "srv"
    root.mkdir()
    proj = root / "my-project"
    (proj / ".claude").mkdir(parents=True)
    _skill(proj / "pipeline" / "skills", "blog-writer")

    flows = P.discover_and_scan_all(projects_root=str(root))
    wds = {(f.get("meta") or {}).get("working_dir") or f.get("working_dir") for f in flows}
    assert "my-project" in wds


def test_real_project_with_claude_md_is_scanned(tmp_path):
    """A dir WITH a root CLAUDE.md counts as a real project for extra-skill scan."""
    root = tmp_path / "srv"
    root.mkdir()
    proj = root / "doc-project"
    proj.mkdir()
    (proj / "CLAUDE.md").write_text("# Doc Project\n手順\n", encoding="utf-8")
    _skill(proj / "skills", "writer")

    flows = P.discover_and_scan_all(projects_root=str(root))
    wds = {(f.get("meta") or {}).get("working_dir") or f.get("working_dir") for f in flows}
    assert "doc-project" in wds
