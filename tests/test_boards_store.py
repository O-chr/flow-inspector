"""Tests for server/boards_store.py — file-backed planning boards.

server/ is already on sys.path via conftest.py.
"""
from __future__ import annotations

from boards_store import BoardsStore


def test_create_returns_board_with_id_and_defaults(tmp_path):
    store = BoardsStore(tmp_path)
    b = store.create()
    assert b["id"]
    assert b["name"] == "無題のボード"
    # new boards open with flow.start / flow.end endpoints seeded, no edges
    assert b["edges"] == []
    assert len(b["items"]) == 2
    assert b["createdAt"] and b["updatedAt"]
    assert (tmp_path / f"{b['id']}.json").exists()


def test_create_seeds_flow_endpoints(tmp_path):
    store = BoardsStore(tmp_path)
    b = store.create()
    items = b["items"]
    assert b["edges"] == []                            # no edge between endpoints
    assert all(it["type"] == "node" for it in items)
    by_cap = {(it.get("meta") or {}).get("capability"): it for it in items}
    assert set(by_cap) == {"flow.start", "flow.end"}
    start, end = by_cap["flow.start"], by_cap["flow.end"]
    assert start["nodeType"] == "trigger" and end["nodeType"] == "parent"
    assert start["label"] == "フロー開始" and end["label"] == "フロー終了"
    # endpoints are persisted to the board file, not just present in the return value
    assert store.get(b["id"])["items"] == items


def test_get_roundtrip(tmp_path):
    store = BoardsStore(tmp_path)
    b = store.create("X")
    got = store.get(b["id"])
    assert got["id"] == b["id"] and got["name"] == "X"


def test_delete(tmp_path):
    store = BoardsStore(tmp_path)
    b = store.create("X")
    assert store.delete(b["id"]) is True
    assert store.get(b["id"]) is None
    assert store.delete(b["id"]) is False
