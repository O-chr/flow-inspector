"""Tests for notifications_store.NotificationsStore (tmp-backed JSON file).

API: ``append(entry) -> entry`` (stamps id/ts/read=False/kind default),
``list(limit=200)`` newest-first, ``mark_read(id) -> bool``,
``mark_all_read() -> int``, ``unread_count() -> int``.
"""
from __future__ import annotations

import notifications_store as nstore


def _store(tmp_path):
    return nstore.NotificationsStore(tmp_path / "notifs.json")


class TestNotificationsStore:
    def test_append_stamps_fields(self, tmp_path):
        store = _store(tmp_path)
        e = store.append({"title": "Hello", "body": "world"})
        assert e["title"] == "Hello"
        assert e["read"] is False
        assert e["kind"] == "deploy"  # default kind
        assert e["id"]
        assert e["ts"]

    def test_append_respects_explicit_kind_and_read(self, tmp_path):
        store = _store(tmp_path)
        e = store.append({"title": "x", "kind": "info", "read": True})
        assert e["kind"] == "info"
        assert e["read"] is True

    def test_list_newest_first(self, tmp_path):
        store = _store(tmp_path)
        store.append({"title": "first"})
        store.append({"title": "second"})
        store.append({"title": "third"})
        assert [e["title"] for e in store.list()] == ["third", "second", "first"]

    def test_list_limit(self, tmp_path):
        store = _store(tmp_path)
        for i in range(5):
            store.append({"title": f"n{i}"})
        assert len(store.list(limit=2)) == 2

    def test_unread_count(self, tmp_path):
        store = _store(tmp_path)
        a = store.append({"title": "a"})
        store.append({"title": "b"})
        assert store.unread_count() == 2
        store.mark_read(a["id"])
        assert store.unread_count() == 1

    def test_mark_read(self, tmp_path):
        store = _store(tmp_path)
        e = store.append({"title": "a"})
        assert store.mark_read(e["id"]) is True
        # Already read -> returns False (no change).
        assert store.mark_read(e["id"]) is False
        assert store.unread_count() == 0

    def test_mark_read_unknown_id(self, tmp_path):
        store = _store(tmp_path)
        store.append({"title": "a"})
        assert store.mark_read("ghost") is False

    def test_mark_all_read(self, tmp_path):
        store = _store(tmp_path)
        store.append({"title": "a"})
        store.append({"title": "b"})
        store.append({"title": "c"})
        assert store.mark_all_read() == 3
        assert store.unread_count() == 0
        # Idempotent: nothing left to change.
        assert store.mark_all_read() == 0

    def test_persistence_across_instances(self, tmp_path):
        path = tmp_path / "notifs.json"
        nstore.NotificationsStore(path).append({"title": "persisted"})
        again = nstore.NotificationsStore(path)
        assert [e["title"] for e in again.list()] == ["persisted"]

    def test_empty_store(self, tmp_path):
        store = _store(tmp_path)
        assert store.list() == []
        assert store.unread_count() == 0
