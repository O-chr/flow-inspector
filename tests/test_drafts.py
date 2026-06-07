"""Tests for drafts.DraftStore: save / load / list / delete (tmp-backed).

A draft is a per-flow board snapshot stored as a JSON *envelope*:
``{schema_version, flow_id, saved_at, client_id, source_sha256, draft_sha256,
board}``. The store key is ``flow_id`` (one file per flow), validated against
the same ``[\\w.\\-]+`` rule used elsewhere.
"""
from __future__ import annotations

import drafts


def _board(name="Demo Board", n_items=1):
    return {
        "name": name,
        "items": [{"id": f"i{i}", "type": "node", "label": f"node {i}"} for i in range(n_items)],
        "edges": [],
    }


class TestDraftStore:
    def test_save_returns_envelope(self, tmp_path):
        store = drafts.DraftStore(str(tmp_path / "cache"))
        env = store.save("demo-project", _board("B", 2))
        assert env["flow_id"] == "demo-project"
        assert env["schema_version"] == 1
        assert env["board"]["name"] == "B"
        assert "draft_sha256" in env and env["draft_sha256"]
        assert "saved_at" in env

    def test_save_then_load(self, tmp_path):
        store = drafts.DraftStore(str(tmp_path / "cache"))
        store.save("demo-project", _board("Loaded", 3))
        loaded = store.load("demo-project")
        assert loaded is not None
        assert loaded["board"]["name"] == "Loaded"
        assert len(loaded["board"]["items"]) == 3

    def test_persisted_as_file(self, tmp_path):
        store = drafts.DraftStore(str(tmp_path / "cache"))
        store.save("demo-project", _board())
        assert (tmp_path / "cache" / "drafts" / "demo-project.json").exists()

    def test_load_missing_returns_none(self, tmp_path):
        store = drafts.DraftStore(str(tmp_path / "cache"))
        assert store.load("missing") is None

    def test_load_invalid_id_returns_none(self, tmp_path):
        store = drafts.DraftStore(str(tmp_path / "cache"))
        # Path-separator id is rejected by validation -> None (not an exception).
        assert store.load("a/b") is None

    def test_save_invalid_id_raises(self, tmp_path):
        store = drafts.DraftStore(str(tmp_path / "cache"))
        import pytest

        with pytest.raises(ValueError):
            store.save("a/b", _board())

    def test_list_summaries(self, tmp_path):
        store = drafts.DraftStore(str(tmp_path / "cache"))
        store.save("flow-a", _board("A", 2))
        store.save("flow-b", _board("B", 1))
        listed = {d["flow_id"]: d for d in store.list()}
        assert set(listed) == {"flow-a", "flow-b"}
        assert listed["flow-a"]["item_count"] == 2
        assert listed["flow-b"]["item_count"] == 1
        assert listed["flow-a"]["name"] == "A"

    def test_list_empty(self, tmp_path):
        store = drafts.DraftStore(str(tmp_path / "cache"))
        assert store.list() == []

    def test_overwrite_same_id(self, tmp_path):
        store = drafts.DraftStore(str(tmp_path / "cache"))
        store.save("demo-project", _board("first", 1))
        store.save("demo-project", _board("second", 5))
        loaded = store.load("demo-project")
        assert loaded["board"]["name"] == "second"
        assert len(loaded["board"]["items"]) == 5
        # Still a single file for that id.
        assert len(list((tmp_path / "cache" / "drafts").glob("*.json"))) == 1

    def test_delete(self, tmp_path):
        store = drafts.DraftStore(str(tmp_path / "cache"))
        store.save("demo-project", _board())
        assert store.delete("demo-project") is True
        assert store.load("demo-project") is None
        assert store.delete("demo-project") is False

    def test_exists(self, tmp_path):
        store = drafts.DraftStore(str(tmp_path / "cache"))
        assert store.exists("demo-project") is False
        store.save("demo-project", _board())
        assert store.exists("demo-project") is True


class TestBoardToWorkflow:
    def test_converts_items_to_nodes(self):
        board = {
            "name": "demo",
            "items": [
                {"id": "i1", "type": "node", "nodeType": "code", "label": "Step",
                 "x": 10, "y": 20, "w": 180, "h": 60, "meta": {"desc": "hi"}},
            ],
            "edges": [{"from": "i1", "to": "i2", "label": "yes"}],
        }
        wf = drafts.board_to_workflow(board)
        assert wf["name"] == "demo"
        assert len(wf["nodes"]) == 1
        node = wf["nodes"][0]
        assert node["id"] == "i1"
        assert node["type"] == "code"
        assert node["title"] == "Step"
        # top-left + half size -> center coordinates.
        assert node["x"] == 10 + 180 / 2
        assert node["y"] == 20 + 60 / 2
        assert wf["edges"] == [{"from": "i1", "to": "i2", "label": "yes"}]

    def test_non_node_items_skipped(self):
        board = {"name": "d", "items": [{"id": "g1", "type": "group"}], "edges": []}
        wf = drafts.board_to_workflow(board)
        assert wf["nodes"] == []

    def test_empty_board_falls_back_to_original(self):
        original = {"id": "orig", "nodes": [{"id": "n1"}], "edges": []}
        assert drafts.board_to_workflow({}, original) is original
