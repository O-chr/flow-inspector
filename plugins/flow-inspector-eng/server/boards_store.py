"""File-backed storage for planning whiteboard boards.

Each board is a JSON file at <root>/<id>.json. Ids are validated to reject
path traversal (reuses io_utils.validate_flow_id). Mirrors the small per-feature
store pattern used elsewhere in this server (drafts, eval, automation registry).
No FastAPI imports — pure storage so it is unit-testable.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

from io_utils import validate_flow_id, atomic_write_json

# Strict board-id charset (no dots/separators). Layered on top of validate_flow_id,
# which also rejects ''/'undefined'/'null'/path separators but permits dots.
_BOARD_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")

# Default storage lives under ~/.cache/flow-inspector (not the package dir) so a
# distributed plugin directory stays read-only. main.py passes an explicit root.
DEFAULT_DIR = Path.home() / ".cache" / "flow-inspector" / "boards"


def _now_iso() -> str:
    """UTC ISO-8601 with milliseconds and trailing Z, e.g. 2026-05-30T14:23:45.123Z.
    Lexicographically sortable and matching the frontend's new Date().toISOString()
    shape, so the updatedAt sort is stable across both."""
    t = time.time()
    ms = int((t - int(t)) * 1000)
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(t)) + f".{ms:03d}Z"


def _default_items() -> list[dict]:
    """Endpoint nodes seeded into every new board so the canvas opens with a
    flow start/end already placed (no edge between them — the user wires the
    middle). Shapes mirror the viewer's ensureFlowEndpoints (nodeType +
    meta.capability); flow_codec strips these capabilities before SKILL.md
    export, so they never leak into generated skills. A fresh list is returned
    each call to avoid shared mutable state across boards."""
    return [
        {"id": "flow-start", "type": "node", "nodeType": "trigger",
         "label": "Flow start", "subtitle": "Inputs and triggers",
         "meta": {"capability": "flow.start"}, "x": 420, "y": 80, "w": 180, "h": 60},
        {"id": "flow-end", "type": "node", "nodeType": "parent",
         "label": "Flow end", "subtitle": "Outputs and notifications",
         "meta": {"capability": "flow.end"}, "x": 420, "y": 380, "w": 180, "h": 60},
    ]


class BoardsStore:
    def __init__(self, root: Path = DEFAULT_DIR):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, board_id: str) -> Path:
        # validate_flow_id rejects '', 'undefined'/'null', path separators.
        validate_flow_id(board_id)
        # strict charset additionally rejects '..' and any dotted/odd ids.
        if not _BOARD_ID_RE.match(board_id):
            raise ValueError(f"invalid board id: {board_id!r}")
        p = (self.root / f"{board_id}.json").resolve()
        if self.root.resolve() != p.parent:
            raise ValueError(f"board id escapes boards dir: {board_id!r}")
        return p

    def list(self) -> list[dict]:
        out = []
        for p in self.root.glob("*.json"):
            try:
                b = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not isinstance(b, dict) or not b.get("id"):
                continue
            items = b.get("items") or []
            out.append({
                "id": b["id"],
                "name": b.get("name") or "無題のボード",
                "updatedAt": b.get("updatedAt"),
                "createdAt": b.get("createdAt"),
                "nodeCount": len([it for it in items if isinstance(it, dict) and it.get("type") == "node"]),
            })
        out.sort(key=lambda m: m.get("updatedAt") or "", reverse=True)
        return out

    def get(self, board_id: str) -> dict | None:
        p = self._path(board_id)
        if not p.exists():
            return None
        return json.loads(p.read_text(encoding="utf-8"))

    def create(self, name: str | None = None) -> dict:
        now = _now_iso()
        board_id = f"board_{int(time.time() * 1000)}"
        board = {
            "id": board_id,
            "name": name or "無題のボード",
            "desc": "",
            "items": _default_items(),
            "edges": [],
            "view": {"x": 0, "y": 0, "k": 0.9},
            "createdAt": now,
            "updatedAt": now,
        }
        atomic_write_json(self._path(board_id), board)
        return board

    def save(self, board_id: str, board: dict) -> dict:
        existing = self.get(board_id)
        data = dict(board)
        data["id"] = board_id  # path id is authoritative
        data["createdAt"] = (existing or {}).get("createdAt") or data.get("createdAt") or _now_iso()
        data["updatedAt"] = _now_iso()
        atomic_write_json(self._path(board_id), data)
        return data

    def delete(self, board_id: str) -> bool:
        p = self._path(board_id)
        if p.exists():
            p.unlink()
            return True
        return False
