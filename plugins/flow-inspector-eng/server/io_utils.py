"""I/O utilities: atomic JSON write + per-flow file lock.

Used to prevent two race-condition classes:
1. Corrupted JSON when the process dies mid-write (atomic_write_json).
2. Lost-update when two concurrent requests do load-modify-save on the same
   flow_id (flow_lock).
"""
from __future__ import annotations

import fcntl
import json
import os
import re
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


_FLOW_ID_RE = re.compile(r"^[\w.\-]+$", re.UNICODE)


def validate_flow_id(flow_id: str) -> str:
    """Reject empty / path-traversal / 'undefined' flow_ids early.

    Returns the flow_id unchanged when valid. Raises ValueError otherwise.
    """
    if not isinstance(flow_id, str) or not flow_id:
        raise ValueError("flow_id is required")
    if flow_id == "undefined" or flow_id == "null":
        raise ValueError(f"flow_id cannot be the literal string '{flow_id}'")
    if "/" in flow_id or "\\" in flow_id:
        raise ValueError(f"flow_id cannot contain path separators: {flow_id!r}")
    # Reject dot-only ids ('.', '..', '...'): even without a separator, a bare
    # '..' resolves to the parent dir when joined to a base path. No legitimate
    # flow_id is all dots. (Defense-in-depth; separators are already rejected.)
    if set(flow_id) == {"."}:
        raise ValueError(f"flow_id cannot be a dot path component: {flow_id!r}")
    if not _FLOW_ID_RE.match(flow_id):
        raise ValueError(
            r"flow_id must match [\w.\-]+ (Unicode word, dot, hyphen) "
            f"(got: {flow_id!r})"
        )
    return flow_id


def atomic_write_json(path: Path, data, *, indent: int = 2) -> None:
    """Write JSON to `path` atomically (tempfile + os.replace).

    Either the new content is fully visible or the old content remains —
    never a half-written file.
    """
    path = Path(path)
    parent = path.parent
    parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=str(parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=indent)
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def extract_json_object(text: str):
    """Extract the first top-level JSON object/array from LLM text.

    STRING-AWARE: braces/brackets inside string literals do NOT change nesting
    depth, so a `}`/`]` inside a value (e.g. a `command`/`desc`/`reason`) cannot
    terminate the scan early. Strips a surrounding ``` code fence first.
    Returns the parsed value (dict or list). Raises ValueError if none found.
    """
    s = (text or "").strip()
    if s.startswith("```"):
        lines = s.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()
    open_ch = next((c for c in s if c in "{["), None)
    if open_ch is None:
        raise ValueError("no JSON object found in LLM output")
    close_ch = "}" if open_ch == "{" else "]"
    depth = 0
    start = -1
    in_str = False
    esc = False
    for i, ch in enumerate(s):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == open_ch:
            if depth == 0:
                start = i
            depth += 1
        elif ch == close_ch:
            if depth > 0:
                depth -= 1
                if depth == 0 and start >= 0:
                    return json.loads(s[start:i + 1])
    raise ValueError("no balanced JSON found in LLM output")


@contextmanager
def flow_lock(lock_dir: Path, flow_id: str) -> Iterator[None]:
    """Exclusive per-flow file lock — blocks until acquired.

    Use to wrap any load → modify → save sequence on a given flow_id so
    concurrent edits serialize instead of overwriting each other.
    """
    validate_flow_id(flow_id)
    lock_dir = Path(lock_dir)
    lock_dir.mkdir(parents=True, exist_ok=True)
    lock_path = lock_dir / f"{flow_id}.lock"
    fd = os.open(str(lock_path), os.O_RDWR | os.O_CREAT, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)
