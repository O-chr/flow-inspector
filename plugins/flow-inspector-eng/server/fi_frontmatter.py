"""Shared frontmatter parser for SKILL.md / command.md / agent.md.

Hybrid strategy (validated by investigation 2026-06-01):
  1. Try ``yaml.safe_load`` — correctly handles YAML lists, folded/literal
     scalars, quoted multi-line strings.
  2. On ANY yaml error (e.g. a bare colon in an unquoted description like
     ``Triggers: a, b``, which is common and valid in real skills) fall back
     to a tolerant line-by-line parser — preserving the historical behaviour.
  3. yaml returns bool/int/list; callers expect str/None or list. Use
     ``fm_str`` / ``fm_list`` to normalize at the call site.

pyyaml is optional: if it is not importable, we always use the line parser.
"""
from __future__ import annotations

import re

try:
    import yaml  # type: ignore
    _HAS_YAML = True
except ImportError:  # pragma: no cover - exercised only when pyyaml absent
    _HAS_YAML = False


def _extract_block(text: str) -> str | None:
    """Return the raw frontmatter block (between the first two ``---``)."""
    if not text.startswith("---"):
        return None
    lines = text.splitlines()
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return "\n".join(lines[1:i])
    return None


def _line_parse(block: str) -> dict:
    """Tolerant ``key: value`` line parser (historical fallback)."""
    out: dict = {}
    for line in block.splitlines():
        m = re.match(r"^\s*([\w-]+)\s*:\s*(.*)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


def parse_frontmatter(text: str) -> dict:
    """Parse the frontmatter block of a markdown document into a dict.

    Returns ``{}`` when there is no frontmatter. Values may be str / bool /
    int / list (yaml-typed); normalize with :func:`fm_str` / :func:`fm_list`.
    """
    block = _extract_block(text)
    if block is None:
        return {}
    if _HAS_YAML:
        try:
            loaded = yaml.safe_load(block)
            if isinstance(loaded, dict):
                return loaded
        except Exception:
            pass  # fall through to the line parser
    return _line_parse(block)


def fm_str(value) -> str:
    """Normalize a frontmatter value to a string ('' for None/missing)."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        return " ".join(str(x) for x in value)
    # rstrip ONLY trailing newlines: a yaml ``|`` literal block always appends a
    # final ``\n`` that is an artifact of the block syntax, not content. Do NOT
    # use ``.strip()`` here — that would mangle meaningful whitespace in other
    # scalar fields (model / color / name) and clip intentional internal or
    # trailing spaces. The codec's ``yaml.safe_dump`` output round-trips exactly
    # and never relies on this; it only matters for hand-written literal blocks
    # in source skills.
    return str(value).rstrip("\n")


def fm_list(value) -> list | None:
    """Normalize a tools-like value to a list (None when empty/missing).

    Accepts a yaml list, or a string with comma- and/or whitespace-separated
    items (``"Read, Write Bash"`` → ``["Read", "Write", "Bash"]``).
    """
    if value is None or value == "":
        return None
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    return [t for t in re.split(r"[,\s]+", str(value).strip()) if t]
