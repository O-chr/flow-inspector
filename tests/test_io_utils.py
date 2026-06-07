"""Tests for io_utils: flow-id validation, atomic JSON write, per-flow lock.

These pin the *current* behaviour of io_utils as a regression baseline —
including its quirks (e.g. it does NOT strip surrounding whitespace, and
``.hidden`` is accepted by the ``[\\w.\\-]+`` rule). Path separators and
dot-only ids (``.`` / ``..`` / ``...``) are rejected.
"""
from __future__ import annotations

import json
import threading
import time

import pytest

import io_utils


# --- validate_flow_id ------------------------------------------------------
class TestValidateFlowId:
    @pytest.mark.parametrize(
        "good",
        [
            "demo-project",
            "weather-reporter",
            "todo_helper",
            "flow.1",
            "ABC123",
            "a",
            # The regex is Unicode-aware, so word chars from other scripts pass.
            "天気レポート",
        ],
    )
    def test_accepts_valid(self, good):
        assert io_utils.validate_flow_id(good) == good

    @pytest.mark.parametrize(
        "bad",
        [
            "",
            "undefined",
            "null",
            "a/b",
            "../escape",
            ".",
            "..",
            "...",
            "back\\slash",
            "has space",
            "weird*char",
            "emoji-\U0001f600",
        ],
    )
    def test_rejects_invalid(self, bad):
        with pytest.raises(ValueError):
            io_utils.validate_flow_id(bad)

    def test_rejects_non_string(self):
        with pytest.raises(ValueError):
            io_utils.validate_flow_id(123)  # type: ignore[arg-type]

    def test_does_not_strip_whitespace(self):
        # Current behaviour: surrounding whitespace is NOT trimmed, so a padded
        # id fails the regex. Captured so a future change here is intentional.
        with pytest.raises(ValueError):
            io_utils.validate_flow_id("  demo-project  ")


# --- atomic_write_json -----------------------------------------------------
class TestAtomicWriteJson:
    def test_write_then_read_roundtrip(self, tmp_path):
        target = tmp_path / "sub" / "data.json"
        payload = {"name": "demo-project", "nodes": [1, 2, 3], "nested": {"k": "v"}}
        io_utils.atomic_write_json(target, payload)
        assert target.exists()
        assert json.loads(target.read_text(encoding="utf-8")) == payload

    def test_creates_parent_dirs(self, tmp_path):
        target = tmp_path / "a" / "b" / "c.json"
        io_utils.atomic_write_json(target, {"ok": True})
        assert target.exists()

    def test_overwrite_is_atomic_replace(self, tmp_path):
        target = tmp_path / "data.json"
        io_utils.atomic_write_json(target, {"v": 1})
        io_utils.atomic_write_json(target, {"v": 2})
        assert json.loads(target.read_text(encoding="utf-8")) == {"v": 2}

    def test_no_temp_files_left_behind(self, tmp_path):
        target = tmp_path / "data.json"
        io_utils.atomic_write_json(target, {"v": 1})
        assert list(tmp_path.glob("*.tmp")) == []

    def test_unicode_preserved(self, tmp_path):
        target = tmp_path / "u.json"
        payload = {"title": "天気レポート", "emoji": "☀"}
        io_utils.atomic_write_json(target, payload)
        # ensure_ascii=False, so multibyte chars are written literally.
        assert "天気レポート" in target.read_text(encoding="utf-8")
        assert json.loads(target.read_text(encoding="utf-8")) == payload


# --- flow_lock -------------------------------------------------------------
# Signature: flow_lock(lock_dir, flow_id). It is an fcntl file lock keyed by
# <lock_dir>/<flow_id>.lock. fcntl locks are per-process advisory, so a single
# process re-acquiring the same lock does NOT deadlock — we test cross-thread
# behaviour and the lock-dir/lock-file mechanics instead.
class TestFlowLock:
    def test_creates_lock_file(self, tmp_path):
        with io_utils.flow_lock(tmp_path / "locks", "demo-flow"):
            assert (tmp_path / "locks" / "demo-flow.lock").exists()

    def test_distinct_ids_use_distinct_files(self, tmp_path):
        lock_dir = tmp_path / "locks"
        with io_utils.flow_lock(lock_dir, "flow-a"):
            with io_utils.flow_lock(lock_dir, "flow-b"):
                assert (lock_dir / "flow-a.lock").exists()
                assert (lock_dir / "flow-b.lock").exists()

    def test_validates_flow_id(self, tmp_path):
        with pytest.raises(ValueError):
            with io_utils.flow_lock(tmp_path / "locks", "a/b"):
                pass

    def test_reusable_after_context(self, tmp_path):
        lock_dir = tmp_path / "locks"
        with io_utils.flow_lock(lock_dir, "demo-flow"):
            pass
        # Re-acquire after release: must not raise / hang.
        with io_utils.flow_lock(lock_dir, "demo-flow"):
            pass

    def test_cross_thread_same_id_serializes(self, tmp_path):
        """A second *thread* contending on the same lock file blocks until the
        first releases (fcntl locks are per open-file-descriptor)."""
        lock_dir = tmp_path / "locks"
        events: list[str] = []
        first_holding = threading.Event()
        release_first = threading.Event()

        def first():
            with io_utils.flow_lock(lock_dir, "shared"):
                events.append("first-enter")
                first_holding.set()
                release_first.wait(timeout=3.0)
                events.append("first-exit")

        def second():
            first_holding.wait(timeout=3.0)
            with io_utils.flow_lock(lock_dir, "shared"):
                events.append("second-enter")

        t1 = threading.Thread(target=first)
        t2 = threading.Thread(target=second)
        t1.start()
        first_holding.wait(timeout=3.0)
        t2.start()
        # Give the second thread a moment to (wrongly) enter if the lock leaked.
        time.sleep(0.15)
        assert events == ["first-enter"], "second thread entered before first released"
        release_first.set()
        t1.join(timeout=3.0)
        t2.join(timeout=3.0)
        assert events == ["first-enter", "first-exit", "second-enter"]

    def test_cross_thread_distinct_ids_run_concurrently(self, tmp_path):
        """Locks for distinct ids do not block each other across threads."""
        lock_dir = tmp_path / "locks"
        both_in = threading.Barrier(2, timeout=3.0)
        ok: list[bool] = []

        def worker(fid: str):
            with io_utils.flow_lock(lock_dir, fid):
                both_in.wait()  # would time out if the two ids serialized
                ok.append(True)

        t1 = threading.Thread(target=worker, args=("flow-a",))
        t2 = threading.Thread(target=worker, args=("flow-b",))
        t1.start()
        t2.start()
        t1.join(timeout=3.0)
        t2.join(timeout=3.0)
        assert ok == [True, True]
