"""
Flow Inspector — Staged Skills Store

A *staged* skill ("公開待ち") is a skill-ified flow saved inside Flow Inspector's
own cache, NOT yet published to ~/.claude/skills/. The publish ("同期") step
copies it live. This gives a review gate before anything reaches the live
skills directory.

Storage layout:
    ~/.cache/flow-inspector/staged-skills/<slug>/SKILL.md
    ~/.cache/flow-inspector/staged-skills/<slug>/meta.json

`slug` is a filesystem-safe key derived from the user's display name; it is also
the published folder name (= the skill's invocation name).
"""
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


# Collapse whitespace and path separators into a single hyphen.
_WS_OR_SEP = re.compile(r"[\s/\\]+", re.UNICODE)


def slugify_skill_name(name: str) -> str:
    """Turn a user-facing skill name into a filesystem-safe, invocation-safe slug.

    - lowercases (matches the frontend's existing slug rule and ~/.claude/skills
      naming convention)
    - collapses whitespace and path separators to '-'
    - preserves Unicode word characters (Japanese names must survive)
    - rejects empty / '.' / '..' / traversal

    Raises ValueError on an unusable name.
    """
    if not isinstance(name, str):
        raise ValueError("skill name must be a string")
    s = _WS_OR_SEP.sub("-", name.strip()).strip("-").lower()
    if not s or s in (".", "..") or s.startswith("."):
        raise ValueError(f"invalid skill name: {name!r}")
    if "/" in s or "\\" in s:  # defense-in-depth; should be impossible after sub
        raise ValueError(f"skill name cannot contain path separators: {name!r}")
    return s


class StagedSkillsStore:
    def __init__(self, cache_dir: Optional[str] = None):
        if cache_dir is None:
            cache_dir = str(Path.home() / ".cache" / "flow-inspector")
        self.cache_dir = Path(cache_dir)
        self.root = self.cache_dir / "staged-skills"

    # ── core operations ────────────────────────────────────────────────────

    def stage(
        self,
        display_name: str,
        description: str,
        content: str,
        publish_target: str,
        source_board_id: Optional[str] = None,
        kind: str = "skill",
    ) -> dict:
        """Write a staged skill/command (content blob + meta.json). Returns the meta dict.

        `kind` ("skill" | "command") decides the live file shape at publish time;
        the staged content is stored the same way regardless.
        """
        slug = slugify_skill_name(display_name)
        d = self.root / slug
        d.mkdir(parents=True, exist_ok=True)
        meta = {
            "slug": slug,
            "display_name": display_name,
            "description": description or "",
            "kind": kind if kind in ("skill", "command") else "skill",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source_board_id": source_board_id,
            "publish_target": publish_target,
        }
        (d / "SKILL.md").write_text(content, encoding="utf-8")
        (d / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return meta

    def list(self) -> list[dict]:
        """List all staged skills (meta only) for the UI."""
        if not self.root.exists():
            return []
        out: list[dict] = []
        for child in sorted(self.root.iterdir()):
            if not child.is_dir():
                continue
            mp = child / "meta.json"
            if not mp.is_file():
                continue
            try:
                out.append(json.loads(mp.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                continue
        return out

    def get(self, slug: str) -> Optional[dict]:
        """Return meta + SKILL.md content, or None if not present."""
        try:
            s = slugify_skill_name(slug)
        except ValueError:
            return None
        d = self.root / s
        mp, sp = d / "meta.json", d / "SKILL.md"
        if not mp.is_file() or not sp.is_file():
            return None
        try:
            meta = json.loads(mp.read_text(encoding="utf-8"))
            content = sp.read_text(encoding="utf-8")
        except (OSError, json.JSONDecodeError):
            return None
        return {**meta, "content": content}

    def remove(self, slug: str) -> bool:
        """Delete a staged skill. True if removed, False if it didn't exist."""
        try:
            s = slugify_skill_name(slug)
        except ValueError:
            return False
        d = self.root / s
        if not d.is_dir():
            return False
        shutil.rmtree(d, ignore_errors=True)
        return not d.exists()


# ── publish ("同期") helpers ────────────────────────────────────────────────


# Sensitive top-level $HOME subtrees a skill/command must NEVER be written into,
# even though they live under $HOME. Protects credentials and OS state from a
# crafted publish_target. (Skills legitimately go to ~/.claude/... or a project's
# .claude/...; none of these need writing.)
_DENY_HOME_SUBTREES = frozenset({
    ".ssh", ".aws", ".gnupg", ".gpg", ".config", ".docker", ".kube",
    ".npm", ".cargo", ".gem", ".password-store", "Library",
})
# Inside ~/.claude/, refuse these live-state subtrees (mirrors workspace.py).
_DENY_CLAUDE_SUBTREES = frozenset({
    "todos", "history", "shell-snapshots", "ide", "statsig", "logs",
})


def validate_publish_target(folder: str, *, home: Optional[Path] = None) -> Path:
    """Resolve a publish target folder and ensure it is a SAFE path under HOME.

    Path-traversal + sensitive-subtree guard for the live skills directory.
    Raises ValueError if the target escapes HOME or lands in a credential / OS
    state subtree (~/.ssh, ~/.aws, ~/.claude/todos, …). Returns the resolved Path.
    """
    if home is None:
        home = Path.home()
    home = Path(home).resolve()
    p = Path(folder).expanduser().resolve()
    if p != home and home not in p.parents:
        raise ValueError(f"publish target must be under home: {folder!r}")
    # Reject sensitive subtrees by inspecting the path components below HOME.
    try:
        parts = p.relative_to(home).parts
    except ValueError:
        parts = ()
    if parts:
        if parts[0] in _DENY_HOME_SUBTREES:
            raise ValueError(f"publish target is a protected directory: {folder!r}")
        if parts[0] == ".claude" and len(parts) >= 2 and parts[1] in _DENY_CLAUDE_SUBTREES:
            raise ValueError(f"publish target is a protected .claude subtree: {folder!r}")
    return p


def publish_skill_md(
    content: str, publish_target: str, slug: str, *, home: Optional[Path] = None
) -> Path:
    """Write content to <publish_target>/<slug>/SKILL.md (overwriting if present).

    Validates publish_target is under HOME. Returns the written path.
    """
    target = validate_publish_target(publish_target, home=home)
    d = target / slugify_skill_name(slug)
    d.mkdir(parents=True, exist_ok=True)
    path = d / "SKILL.md"
    path.write_text(content, encoding="utf-8")
    return path


def publish_command_md(
    content: str, publish_target: str, slug: str, *, home: Optional[Path] = None
) -> Path:
    """Write content to <publish_target>/<slug>.md (slash command; single file).

    Validates publish_target is under HOME. Returns the written path.
    """
    target = validate_publish_target(publish_target, home=home)
    target.mkdir(parents=True, exist_ok=True)
    path = target / f"{slugify_skill_name(slug)}.md"
    path.write_text(content, encoding="utf-8")
    return path


def read_live_skill(publish_target: str, slug: str) -> Optional[str]:
    """Return the live SKILL.md at <publish_target>/<slug>/SKILL.md, or None."""
    try:
        safe_slug = slugify_skill_name(slug)
    except ValueError:
        return None
    p = Path(publish_target).expanduser() / safe_slug / "SKILL.md"
    if not p.is_file():
        return None
    try:
        return p.read_text(encoding="utf-8")
    except OSError:
        return None
