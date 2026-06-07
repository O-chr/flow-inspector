"""Tests for the consent-gated, selectable skill annotation flow.

Covers:
- ``_annotate_pending`` deterministic candidate selection (no LLM).
- ``GET /api/workspace/annotate-candidates`` returns id/name/description + count.
- ``POST /api/workspace/annotate-all`` honours an optional ``flow_ids`` filter
  (selective flow-ize) and falls back to "all" when omitted (back-compat).

All skill data is synthetic. ``discover_and_scan_all`` and the actual
``annotate_skill_async`` (which would call the ``claude`` CLI) are
monkeypatched, so **no AI is invoked and no tokens are spent** in these tests.
"""
from __future__ import annotations

import pytest


# --- synthetic skill catalog (no real names/paths) ------------------------
def _fake_flows(tmp_skill_dir):
    """Three self-authored skills + one managed (must be excluded)."""
    def mk(skill_id, name, desc, layer="user"):
        # give each a real-on-disk path with NON-convention content so
        # is_convention_v1() is False → it counts as "pending".
        p = tmp_skill_dir / f"{skill_id}.md"
        p.write_text(f"---\nname: {name}\ndescription: {desc}\n---\n\n# {name}\n本文。\n", encoding="utf-8")
        return {
            "id": skill_id,
            "name": name,
            "description": desc,
            "source": {"type": "skill", "path": str(p), "layer": layer},
        }
    return [
        mk("minutes-maker", "議事録メーカー", "会議の文字起こしから議事録を作成する"),
        mk("blog-writer", "ブログ執筆", "アウトラインから記事本文を書く"),
        mk("sns-poster", "SNS投稿", "投稿文を生成してSNSに出す"),
        mk("official-pdf", "PDF (公式)", "PDFを編集する", layer="managed"),
    ]


@pytest.fixture
def patched(app_module, monkeypatch, isolated_home):
    """Patch discovery + the AI annotator so the endpoints run offline.

    Skill files live UNDER the fake ``$HOME`` because ``ws.live_to_staged``
    maps live paths via ``relative_to(Path.home())`` — mirroring real usage
    where candidates always sit under ``~/`` (``~/.claude`` or ``~/projects``).
    """
    # Wipe the staging mirror so a prior test's annotate output doesn't make
    # _annotate_pending treat these skills as "already staged" (→ excluded).
    import shutil
    files_root = app_module.ws.files_path
    if files_root.exists():
        shutil.rmtree(files_root)

    skill_dir = isolated_home / "projects" / "demo" / "skills"
    skill_dir.mkdir(parents=True, exist_ok=True)
    flows = _fake_flows(skill_dir)

    monkeypatch.setattr(app_module, "discover_and_scan_all", lambda projects_root=None: flows)

    # Record which paths got annotated; never call the real CLI.
    annotated_paths = []

    class _Res:
        annotated_text = "---\nname: x\nflow_version: 1\n---\n# x\n本文。\n"
        nodes_matched = 2

    async def _fake_annotate(path, dry_run=True, variant="v3"):
        annotated_paths.append(path)
        return _Res()

    import annotator
    monkeypatch.setattr(annotator, "annotate_skill_async", _fake_annotate)
    return {"flows": flows, "annotated_paths": annotated_paths, "skill_dir": skill_dir}


def test_candidates_excludes_managed_and_includes_description(client, patched):
    r = client.get("/api/workspace/annotate-candidates")
    assert r.status_code == 200
    body = r.json()
    # 3 self-authored pending; the managed one is excluded.
    assert body["count"] == 3
    ids = {s["id"] for s in body["skills"]}
    assert ids == {"minutes-maker", "blog-writer", "sns-poster"}
    assert "official-pdf" not in ids
    # description is present so the chat Claude can semantically filter.
    by_id = {s["id"]: s for s in body["skills"]}
    assert by_id["minutes-maker"]["description"] == "会議の文字起こしから議事録を作成する"
    assert "setup_done" in body


def test_annotate_all_without_flow_ids_processes_everything(client, patched):
    r = client.post("/api/workspace/annotate-all", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert len(body["annotated"]) == 3
    assert len(patched["annotated_paths"]) == 3


def test_annotate_all_with_flow_ids_processes_only_selected(client, patched):
    r = client.post("/api/workspace/annotate-all", json={"flow_ids": ["minutes-maker"]})
    assert r.status_code == 200
    body = r.json()
    annotated_ids = {a["id"] for a in body["annotated"]}
    assert annotated_ids == {"minutes-maker"}
    # exactly one underlying annotate call happened
    assert len(patched["annotated_paths"]) == 1
    assert patched["annotated_paths"][0].endswith("minutes-maker.md")


def test_annotate_all_with_multiple_flow_ids(client, patched):
    r = client.post("/api/workspace/annotate-all", json={"flow_ids": ["blog-writer", "sns-poster"]})
    assert r.status_code == 200
    annotated_ids = {a["id"] for a in r.json()["annotated"]}
    assert annotated_ids == {"blog-writer", "sns-poster"}


def test_annotate_all_unknown_flow_id_is_ignored(client, patched):
    r = client.post("/api/workspace/annotate-all", json={"flow_ids": ["does-not-exist"]})
    assert r.status_code == 200
    body = r.json()
    assert body["annotated"] == []
    assert patched["annotated_paths"] == []


def test_annotate_all_no_body_still_works(client, patched):
    # No JSON body at all → must not 500; treated as "all".
    r = client.post("/api/workspace/annotate-all")
    assert r.status_code == 200
    assert r.json()["total"] == 3
