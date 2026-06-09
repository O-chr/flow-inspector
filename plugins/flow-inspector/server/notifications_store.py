"""File-backed notification store (single JSON file).

Mirrors the small per-feature store pattern (boards_store) — pure storage,
no FastAPI imports, unit-testable. Atomic writes via io_utils.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from io_utils import atomic_write_json

# Default storage lives under ~/.cache/flow-inspector (not the package dir) so a
# distributed plugin directory stays read-only. main.py passes an explicit path.
DEFAULT_PATH = Path.home() / ".cache" / "flow-inspector" / "notifications.json"


def _now_iso() -> str:
    t = time.time()
    ms = int((t - int(t)) * 1000)
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(t)) + f".{ms:03d}Z"


class NotificationsStore:
    def __init__(self, path=DEFAULT_PATH):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def _load(self) -> list:
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return []
        return data if isinstance(data, list) else []

    def _save(self, items: list) -> None:
        atomic_write_json(self.path, items)

    def append(self, entry: dict) -> dict:
        items = self._load()
        e = dict(entry)
        e["id"] = f"ntf_{int(time.time() * 1000)}_{len(items)}"
        e["ts"] = _now_iso()
        e.setdefault("kind", "deploy")
        e.setdefault("read", False)
        items.append(e)
        self._save(items)
        return e

    def list(self, limit: int = 200) -> list:
        return list(reversed(self._load()))[:limit]

    def mark_read(self, notif_id: str) -> bool:
        items = self._load()
        hit = False
        for e in items:
            if e.get("id") == notif_id and not e.get("read"):
                e["read"] = True
                hit = True
        if hit:
            self._save(items)
        return hit

    def mark_all_read(self) -> int:
        items = self._load()
        n = 0
        for e in items:
            if not e.get("read"):
                e["read"] = True
                n += 1
        if n:
            self._save(items)
        return n

    def unread_count(self) -> int:
        return sum(1 for e in self._load() if not e.get("read"))
