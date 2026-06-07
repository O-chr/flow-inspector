"""
Flow Inspector — Draft Store

Per-flow editing snapshot persistence. Used by the UI's 💾保存 (Save) button to
persist the current PlanWorkspace board across sessions, separate from the
explicit 📋名前をつけて保存 (Save As → version) workflow.

Storage layout:
    ~/.cache/flow-inspector/drafts/<flow_id>.json   # one file per flow

Each draft is wrapped in an envelope (see DraftStore.save) that carries
forward-compat fields for Phase C (sha256-based conflict detection,
~/.claude/ source reference).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


SCHEMA_VERSION = 1

# Whitelist for flow_id path components — matches the demo dataset's id style
# ("x-autopilot", "doc_writer", etc.) plus Unicode word characters so project
# names like "日本語プロジェクト名" survive _slugify() without being rejected here.
# Path separators are blocked explicitly below.
_FLOW_ID_RE = re.compile(r"^[\w.\-]+$", re.UNICODE)


class DraftStore:
    def __init__(self, cache_dir: Optional[str] = None):
        if cache_dir is None:
            cache_dir = str(Path.home() / ".cache" / "flow-inspector")
        self.cache_dir = Path(cache_dir)
        self.drafts_path = self.cache_dir / "drafts"

    # ── path helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _safe_flow_id(flow_id: str) -> str:
        if not isinstance(flow_id, str) or not flow_id:
            raise ValueError("flow_id must be a non-empty string")
        if "/" in flow_id or "\\" in flow_id:
            raise ValueError(
                f"flow_id cannot contain path separators: {flow_id!r}"
            )
        if not _FLOW_ID_RE.match(flow_id):
            raise ValueError(
                f"flow_id contains disallowed characters: {flow_id!r} "
                r"(allowed: [\w.\-] — Unicode word, dot, hyphen)"
            )
        if flow_id in (".", ".."):
            raise ValueError("flow_id cannot be '.' or '..'")
        return flow_id

    def _ensure_dir(self) -> None:
        self.drafts_path.mkdir(parents=True, exist_ok=True)

    def path_for(self, flow_id: str) -> Path:
        fid = self._safe_flow_id(flow_id)
        return self.drafts_path / f"{fid}.json"

    def exists(self, flow_id: str) -> bool:
        try:
            return self.path_for(flow_id).is_file()
        except ValueError:
            return False

    # ── core operations ────────────────────────────────────────────────────

    def list(self) -> list[dict]:
        """List all drafts with summary metadata for the UI sidebar."""
        if not self.drafts_path.exists():
            return []
        results: list[dict] = []
        for child in sorted(self.drafts_path.glob("*.json")):
            try:
                data = json.loads(child.read_text(encoding="utf-8"))
                board = data.get("board") or {}
                items = board.get("items") or []
                results.append({
                    "flow_id": data.get("flow_id") or child.stem,
                    "saved_at": data.get("saved_at"),
                    "name": board.get("name"),
                    "item_count": len(items),
                })
            except (OSError, json.JSONDecodeError):
                # Skip corrupt files but don't crash the listing
                continue
        return results

    def load(self, flow_id: str) -> Optional[dict]:
        """Load a draft envelope. Returns None if not present."""
        try:
            p = self.path_for(flow_id)
        except ValueError:
            return None
        if not p.is_file():
            return None
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    def save(
        self,
        flow_id: str,
        board: dict,
        *,
        client_id: Optional[str] = None,
        source_sha256: Optional[str] = None,
    ) -> dict:
        """Save a draft atomically (temp file + rename) so a crash mid-write
        can't leave a torn JSON file. Returns the envelope as stored.

        Phase C will:
          - Populate source_sha256 from the actual ~/.claude/<file> at the time
            of save, so writer.py can detect under-the-hood file edits.
          - Add expected_draft_sha256 conflict detection (last-writer-wins).
        """
        self._safe_flow_id(flow_id)
        if not isinstance(board, dict):
            raise ValueError("board must be a dict")
        self._ensure_dir()

        # Canonical JSON for hash: sorted keys, separators tight
        board_json_bytes = json.dumps(
            board, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")
        draft_sha256 = hashlib.sha256(board_json_bytes).hexdigest()

        envelope = {
            "schema_version": SCHEMA_VERSION,
            "flow_id": flow_id,
            "saved_at": datetime.now(timezone.utc).isoformat(),
            "client_id": client_id,
            "source_sha256": source_sha256,
            "draft_sha256": draft_sha256,
            "board": board,
        }

        # Atomic write: write to .tmp in the same dir, then os.replace()
        dest = self.path_for(flow_id)
        fd, tmp_path = tempfile.mkstemp(
            prefix=f".{flow_id}.", suffix=".tmp", dir=str(self.drafts_path)
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(envelope, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, dest)
        except Exception:
            # Best-effort cleanup; .tmp file is harmless if it remains
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

        return envelope

    def delete(self, flow_id: str) -> bool:
        """Remove a draft. Returns True if a file was deleted, False if it
        didn't exist."""
        try:
            p = self.path_for(flow_id)
        except ValueError:
            return False
        if not p.is_file():
            return False
        try:
            p.unlink()
        except OSError:
            return False
        return True


# ───────────────────────────────────────────────────────────────────────────
# board → workflow conversion
#
# Python port of `boardToWorkflow` in static/index.html (function at line 9282).
# Used by /api/flows/:id/versions to snapshot the *current draft* when the user
# presses 📋名前をつけて保存, so the version reflects unsaved edits — not the
# stale parsed flow on disk.
# ───────────────────────────────────────────────────────────────────────────

def board_to_workflow(board: dict, original_workflow: Optional[dict] = None) -> dict:
    """Convert a PlanWorkspace `board` dict into the `workflow` shape that the
    rest of the backend expects (nodes / edges / parallels).

    Mirrors the JS implementation; field names match deliberately.
    """
    if not board:
        return original_workflow or {"id": "", "nodes": [], "edges": []}

    base = dict(original_workflow or {})
    items = board.get("items") or []
    edges = board.get("edges") or []

    nodes = []
    for it in items:
        if (it or {}).get("type") != "node":
            continue
        meta = it.get("meta") or {}
        w = it.get("w") or 180
        h = it.get("h") or 60
        nodes.append({
            "id": it.get("id"),
            "type": it.get("nodeType"),
            "title": it.get("label"),
            "subtitle": it.get("subtitle") or "",
            # Map board top-left + size → center coordinates (matches JS)
            "x": (it.get("x") or 0) + w / 2,
            "y": (it.get("y") or 0) + h / 2,
            "desc": meta.get("desc") or "",
            "input": meta.get("input") or {},
            "output": meta.get("output") or {},
            "meta": meta,
            "depends": meta.get("depends") or [],
            "parallel": meta.get("parallel"),
            "duration": meta.get("duration") or "",
        })

    edge_list = [
        {"from": e.get("from"), "to": e.get("to"), "label": e.get("label") or ""}
        for e in edges
    ]

    base.update({
        "id": (original_workflow or {}).get("id") or board.get("id"),
        "name": board.get("name") or (original_workflow or {}).get("name"),
        "nodes": nodes,
        "edges": edge_list,
    })
    return base
