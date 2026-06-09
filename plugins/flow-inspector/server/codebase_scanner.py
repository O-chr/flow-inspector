"""Codebase scanner — rule-based extraction of structured Claude Code configuration.

LLM-based parsing (parser_llm.py) is good for interpreting the prose of SKILL.md,
but for **machine-readable** configuration (settings.json hooks, .mcp.json MCP
servers, .claude/agents/*.md frontmatter) we can extract a precise list without
any LLM call. This scanner builds a `CodebaseContext` dict that:

  1. Is fed into the LLM prompt as "available hooks / mcp / subagents in this
     repo", reducing hallucination risk
  2. Is used after LLM output to bind real matcher/command/file paths to the
     LLM-generated hook/subagent/mcp nodes (validation + enrichment)

Inputs scanned (per project workspace):
  - <project>/.claude/settings.json           → hooks list
  - <project>/.claude/settings.local.json     → hooks list (merged on top of settings.json)
  - <project>/.mcp.json                       → MCP servers
  - <project>/.claude/agents/**/*.md          → subagents (frontmatter)
  - <project>/.claude/skills/**/SKILL.md      → sibling skills (for skill-to-skill calls)

Returns a dict (JSON-serializable) — no LLM dependency, no Claude SDK import.
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any

# Frontmatter は共有ハイブリッドパーサ (server/fi_frontmatter.py) に委譲。
# yaml 値は str/bool/int/list 混在なので、参照側で fm_str / fm_list を通して正規化する。
try:
    from fi_frontmatter import parse_frontmatter as _parse_frontmatter, fm_str, fm_list
except ImportError:  # pragma: no cover
    from .fi_frontmatter import parse_frontmatter as _parse_frontmatter, fm_str, fm_list  # type: ignore


def _safe_load_json(path: Path) -> dict | None:
    """Load a JSON file safely, return None on any failure (missing / malformed)."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _scan_hooks(settings: dict | None) -> list[dict]:
    """Extract hooks from a parsed settings.json dict."""
    if not settings:
        return []
    out: list[dict] = []
    hooks = settings.get("hooks") or {}
    for hook_type, entries in hooks.items():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            matcher = entry.get("matcher", "*")
            for h in entry.get("hooks", []):
                out.append({
                    "hook_type": hook_type,          # PreToolUse / PostToolUse / SessionStart / ...
                    "matcher": matcher,              # Bash / Edit|Write / startup / ...
                    "handler_type": h.get("type"),   # command / prompt / agent / http / mcp_tool
                    "command": h.get("command", ""),
                    "prompt": h.get("prompt", ""),
                    "subagent_type": h.get("subagent_type", ""),
                    "url": h.get("url", ""),
                    "timeout": h.get("timeout"),
                })
    return out


def _scan_mcp(mcp_json: dict | None) -> list[dict]:
    """Extract MCP servers from a parsed .mcp.json dict."""
    if not mcp_json:
        return []
    out: list[dict] = []
    servers = mcp_json.get("mcpServers") or {}
    for name, conf in servers.items():
        if not isinstance(conf, dict):
            continue
        out.append({
            "name": name,                          # gmail, slack, notion, github ...
            "command": conf.get("command", ""),
            "args": conf.get("args", []),
            "env_keys": sorted(list((conf.get("env") or {}).keys())),
        })
    return out


def _scan_agents(agents_dir: Path) -> list[dict]:
    """Scan .claude/agents/**/*.md, extracting frontmatter name/description/tools."""
    if not agents_dir.is_dir():
        return []
    out: list[dict] = []
    for md_path in sorted(agents_dir.rglob("*.md")):
        try:
            text = md_path.read_text(encoding="utf-8")
        except Exception:
            continue
        fm = _parse_frontmatter(text)
        # yaml は値を str 以外 (int/bool/list) で返しうるので fm_str / fm_list で正規化。
        out.append({
            "name": fm_str(fm.get("name")) or md_path.stem,
            "description": fm_str(fm.get("description")),
            "model": fm_str(fm.get("model")),
            "tools": fm_list(fm.get("tools")),
            "file": str(md_path),
        })
    return out


def _scan_sibling_skills(skills_dir: Path, exclude_name: str | None = None) -> list[dict]:
    """Scan .claude/skills/*/SKILL.md frontmatter for sibling-skill awareness."""
    if not skills_dir.is_dir():
        return []
    out: list[dict] = []
    for skill_path in sorted(skills_dir.glob("*/SKILL.md")):
        try:
            text = skill_path.read_text(encoding="utf-8")
        except Exception:
            continue
        fm = _parse_frontmatter(text)
        # yaml は name を str 以外で返しうるので fm_str で正規化。
        name = fm_str(fm.get("name")) or skill_path.parent.name
        if exclude_name and name == exclude_name:
            continue
        out.append({
            "name": name,
            "description": fm_str(fm.get("description")),
            "file": str(skill_path),
        })
    return out


def scan_project_context(project_dir: str | Path, *, exclude_skill_name: str | None = None) -> dict:
    """Build a `CodebaseContext` dict for a given project workspace.

    Args:
        project_dir: project root (e.g. /path/to/your-project)
        exclude_skill_name: if scanning for skill X, optionally exclude X from
                            the sibling-skills list (to avoid self-reference)

    Returns:
        dict with keys: hooks, mcp_servers, subagents, sibling_skills, project_dir.
        Each value is a list of structured entries. Empty lists when nothing found.
    """
    project_dir = Path(project_dir)
    claude_dir = project_dir / ".claude"

    # settings.json + settings.local.json をマージ
    base = _safe_load_json(claude_dir / "settings.json") or {}
    local = _safe_load_json(claude_dir / "settings.local.json") or {}
    merged_settings: dict[str, Any] = {**base}
    # 簡易マージ: local 側の hooks セクションを上書き
    if "hooks" in local:
        merged_settings["hooks"] = local["hooks"]

    mcp_json = _safe_load_json(project_dir / ".mcp.json")

    return {
        "project_dir": str(project_dir),
        "hooks":          _scan_hooks(merged_settings),
        "mcp_servers":    _scan_mcp(mcp_json),
        "subagents":      _scan_agents(claude_dir / "agents"),
        "sibling_skills": _scan_sibling_skills(claude_dir / "skills", exclude_name=exclude_skill_name),
    }


def find_hook_for(context: dict, matcher_hint: str | None = None, hook_type_hint: str | None = None) -> dict | None:
    """Look up the best matching real hook by matcher/hook_type hints.

    Used by parser_llm.py to bind LLM-generated hook nodes to real settings.json
    entries. Returns the first matching hook entry, or None if no match.
    """
    hooks = context.get("hooks", [])
    if not hooks:
        return None
    # 1) Exact match on both fields
    if matcher_hint and hook_type_hint:
        for h in hooks:
            if h["matcher"] == matcher_hint and h["hook_type"] == hook_type_hint:
                return h
    # 2) Match on matcher only
    if matcher_hint:
        for h in hooks:
            if h["matcher"] == matcher_hint:
                return h
    # 3) Match on hook_type only
    if hook_type_hint:
        for h in hooks:
            if h["hook_type"] == hook_type_hint:
                return h
    # 4) Substring match on command (LLM-generated nodes often have command snippets in title/desc)
    if matcher_hint:
        for h in hooks:
            if matcher_hint.lower() in h.get("command", "").lower():
                return h
    return None


def find_subagent_for(context: dict, name_hint: str) -> dict | None:
    """Look up a real subagent by name (or description substring)."""
    subagents = context.get("subagents", [])
    if not subagents or not name_hint:
        return None
    lo = name_hint.lower()
    for a in subagents:
        if a["name"].lower() == lo:
            return a
    for a in subagents:
        if lo in a["name"].lower() or lo in a["description"].lower():
            return a
    return None


def find_mcp_server_for(context: dict, name_hint: str) -> dict | None:
    """Look up a real MCP server by name."""
    servers = context.get("mcp_servers", [])
    if not servers or not name_hint:
        return None
    lo = name_hint.lower()
    for s in servers:
        if s["name"].lower() == lo:
            return s
    for s in servers:
        if lo in s["name"].lower():
            return s
    return None


def find_sibling_skill_for(context: dict, name_hint: str) -> dict | None:
    """Look up a sibling skill by name."""
    skills = context.get("sibling_skills", [])
    if not skills or not name_hint:
        return None
    lo = name_hint.lower()
    for s in skills:
        if s["name"].lower() == lo:
            return s
    for s in skills:
        if lo in s["name"].lower():
            return s
    return None
