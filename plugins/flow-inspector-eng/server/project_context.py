"""Deterministic, read-only project summary for the CLAUDE.md authoring chat.

The chat used to pass the LLM nothing but a path, so it guessed (and hedged
with "I can't read files, may I?"). This builds a bounded text summary — a
top-2-level directory tree plus snippets of the key root files (README,
manifests) — so the model writes a *grounded* CLAUDE.md instead.

Intentionally shallow: a project's ``.claude/`` directory is shown to exist but
its hooks/skills are NOT parsed here (out of scope — that would be overkill for
authoring a CLAUDE.md). 0 LLM tokens; pure filesystem reads.
"""
from __future__ import annotations

import re
from pathlib import Path

# Directory names that are noise when trying to understand a project.
_EXCLUDE_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".pytest_cache",
    "venv", ".venv", "env", "site-packages", "dist", "build", "target", "out",
    ".next", ".nuxt", ".cache", "coverage", ".turbo", "_archive",
}

# Hidden directories we still surface in the tree (worth knowing they exist),
# but do NOT descend into.
_KEEP_HIDDEN_DIRS = {".claude"}

# File-name patterns that are pure noise for authoring a CLAUDE.md: backups,
# editor/temp files, SQLite runtime sidecars, compiled artifacts. Real projects
# (e.g. ajidontsuki) accumulate dozens of `index.html.bak.<timestamp>` copies
# that would otherwise crowd out the actual structure.
_NOISE_FILE_SUFFIXES = (
    ".orig", ".tmp", ".temp", ".swp", ".swo", ".log",
    ".pyc", ".pyo", ".class", ".o", ".lock",
    ".db-shm", ".db-wal", ".db-journal", "~",
)
# `.bak`, `.bak.<timestamp>`, `.bak2.<timestamp>` etc.
_BAK_RE = re.compile(r"\.bak\d*(\.|$)")


def _is_noise_file(name: str) -> bool:
    low = name.lower()
    return bool(_BAK_RE.search(low)) or low.endswith(_NOISE_FILE_SUFFIXES)

# Root-level files worth snippeting, in priority order.
_KEY_FILES = [
    "README.md", "README", "README.rst", "README.txt",
    "package.json", "pyproject.toml", "requirements.txt", "setup.py", "setup.cfg",
    "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "composer.json", "Gemfile",
    "Makefile", "Dockerfile", "docker-compose.yml",
]

_MAX_TREE_ENTRIES = 100
_MAX_SNIPPET_BYTES = 1500
_MAX_SNIPPET_FILES = 6
_MAX_TOTAL_CHARS = 8000

# Deep mode (opt-in, after the user grants "詳しく確認"): wider tree, more & larger
# snippets, and top-level source files (app.py, index.js, …) included verbatim.
_DEEP_MAX_DEPTH = 3
_DEEP_SNIPPET_BYTES = 4000
_DEEP_SNIPPET_FILES = 14
_DEEP_TOTAL_CHARS = 30000
_SOURCE_EXTS = (".py", ".js", ".ts", ".jsx", ".tsx", ".go", ".rb", ".rs",
                ".java", ".php", ".sh", ".sql", ".vue", ".svelte")

# System/runtime deploy discovery (opt-in escalation, only after the user widens
# scope to "system"). Read-only, no sudo; unreadable files are skipped silently.
_SYSTEMD_DIRS = ("/etc/systemd/system", "/lib/systemd/system", "/usr/lib/systemd/system")
_NGINX_DIRS = ("/etc/nginx/sites-enabled", "/etc/nginx/sites-available", "/etc/nginx/conf.d")
_DEPLOY_MAX_CHARS = 4000


def _is_under(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


def _build_tree(proj: Path, max_depth: int = 2) -> list[str]:
    """Bounded directory listing: noise/hidden excluded, .claude/ shown but not entered."""
    lines: list[str] = []
    count = 0
    truncated = False

    def visit(d: Path, depth: int, prefix: str) -> None:
        nonlocal count, truncated
        if depth > max_depth:
            return
        try:
            entries = sorted(d.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        except OSError:
            return
        for e in entries:
            if count >= _MAX_TREE_ENTRIES:
                # Emit the elision marker once; ancestor frames still in flight
                # just bail out instead of stacking duplicate markers.
                if not truncated:
                    lines.append(f"{prefix}… (省略)")
                    truncated = True
                return
            # Never follow symlinks: a symlink named `docs` → /etc (or → outside
            # the project) would leak the target's contents/listing into the LLM
            # prompt. The summary is meant to be confined to the project tree.
            if e.is_symlink():
                continue
            name = e.name
            if e.is_dir():
                if name in _EXCLUDE_DIRS:
                    continue
                hidden = name.startswith(".")
                if hidden and name not in _KEEP_HIDDEN_DIRS:
                    continue
                lines.append(f"{prefix}{name}/")
                count += 1
                # Surface kept-hidden config dirs (.claude) without descending.
                if not hidden:
                    visit(e, depth + 1, prefix + "  ")
            else:
                if name.startswith(".") or _is_noise_file(name):
                    continue
                lines.append(f"{prefix}{name}")
                count += 1

    visit(proj, 1, "")
    return lines


def _key_file_snippets(proj: Path, files=_KEY_FILES, max_files: int = _MAX_SNIPPET_FILES,
                       max_bytes: int = _MAX_SNIPPET_BYTES) -> list[str]:
    out: list[str] = []
    for fname in files:
        if len(out) >= max_files:
            break
        f = proj / fname
        # Skip symlinks: a `README.md` → ~/.ssh/id_rsa symlink would otherwise
        # embed the target's contents verbatim into the prompt (and the draft).
        if f.is_symlink() or not f.is_file():
            continue
        try:
            # Bounded read: never pull more than the snippet limit into memory,
            # regardless of file size. The +1 byte lets us detect truncation.
            with f.open("rb") as fh:
                raw = fh.read(max_bytes + 1)
            text = raw[:max_bytes].decode("utf-8", errors="replace").rstrip()
        except OSError:
            continue
        tail = "\n…(以下省略)" if len(raw) > max_bytes else ""
        out.append(f"[{fname}]\n{text}{tail}")
    return out


def _source_files(proj: Path) -> list[str]:
    """Top-level source files (deep mode only) — entrypoints like app.py / index.js."""
    out: list[str] = []
    try:
        entries = sorted(proj.iterdir(), key=lambda p: p.name.lower())
    except OSError:
        return out
    for e in entries:
        if (e.is_file() and not e.is_symlink() and not e.name.startswith(".")
                and e.suffix.lower() in _SOURCE_EXTS and not _is_noise_file(e.name)
                and e.name not in _KEY_FILES):
            out.append(e.name)
    return out


def gather_project_context(project_path: str, projects_root: str, deep: bool = False) -> str:
    """Bounded, read-only text summary of a project for the CLAUDE.md author.

    deep=True (opt-in, granted by the user) reads wider/deeper: 3-level tree, more
    & larger snippets, and top-level source files included verbatim. Same safety
    guarantees (projects_root-confined, symlink-skip, noise-skip, bounded).

    Returns "" if the path is empty, missing, or resolves outside ``projects_root``.
    """
    if not project_path:
        return ""
    try:
        proj = Path(project_path).expanduser().resolve()
        root = Path(projects_root).expanduser().resolve()
    except (OSError, RuntimeError, ValueError):
        return ""
    if not proj.is_dir() or not _is_under(proj, root):
        return ""

    max_depth = _DEEP_MAX_DEPTH if deep else 2
    max_files = _DEEP_SNIPPET_FILES if deep else _MAX_SNIPPET_FILES
    max_bytes = _DEEP_SNIPPET_BYTES if deep else _MAX_SNIPPET_BYTES
    max_total = _DEEP_TOTAL_CHARS if deep else _MAX_TOTAL_CHARS
    files = (_KEY_FILES + _source_files(proj)) if deep else _KEY_FILES

    parts: list[str] = []
    tree = _build_tree(proj, max_depth)
    if tree:
        header = "ディレクトリ構成(上位3階層):" if deep else "ディレクトリ構成(上位2階層):"
        parts.append(header + "\n" + "\n".join(tree))
    snippets = _key_file_snippets(proj, files, max_files, max_bytes)
    if snippets:
        parts.append("主要ファイル抜粋:\n\n" + "\n\n".join(snippets))

    result = "\n\n".join(parts)
    if len(result) > max_total:
        result = result[:max_total] + "\n…(全体を省略)"
    return result


def gather_deploy_context(project_path, projects_root,
                          systemd_dirs=_SYSTEMD_DIRS, nginx_dirs=_NGINX_DIRS):
    """Read-only, consented scan of runtime/deploy config (systemd, nginx) that
    references THIS project. Only files mentioning the project's path/name are
    read, and only deploy-relevant lines are returned. Graceful on permission
    errors (no sudo). Confined to a project under projects_root.
    """
    if not project_path:
        return ""
    try:
        proj = Path(project_path).expanduser().resolve()
        root = Path(projects_root).expanduser().resolve()
    except (OSError, RuntimeError, ValueError):
        return ""
    if not proj.is_dir() or not _is_under(proj, root):
        return ""

    needle_path, needle_name = str(proj), proj.name
    parts: list[str] = []
    seen: set = set()   # dedup symlinked entries (nginx sites-enabled → sites-available)

    for d in systemd_dirs:
        try:
            units = sorted(Path(d).glob("*.service"))
        except OSError:
            continue
        for f in units:
            try:
                rp = f.resolve()
            except OSError:
                continue
            if rp in seen:
                continue
            seen.add(rp)
            try:
                txt = rp.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue                     # permission denied etc. → skip
            if needle_path in txt or f.stem == needle_name:
                lines = [ln.strip() for ln in txt.splitlines() if ln.strip().startswith(
                    ("Description=", "ExecStart=", "WorkingDirectory=", "User="))]
                if lines:
                    parts.append(f"[systemd: {f.name}]\n" + "\n".join(lines))

    for d in nginx_dirs:
        try:
            sites = sorted(p for p in Path(d).glob("*") if p.is_file())
        except OSError:
            continue
        for f in sites:
            try:
                rp = f.resolve()
            except OSError:
                continue
            if rp in seen:
                continue
            seen.add(rp)
            try:
                txt = rp.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if needle_path in txt or needle_name in txt:
                lines = [ln.strip() for ln in txt.splitlines()
                         if any(k in ln for k in ("server_name", "proxy_pass", "listen", "root "))]
                if lines:
                    parts.append(f"[nginx: {f.name}]\n" + "\n".join(lines[:12]))

    if not parts:
        return ""
    out = "運用/デプロイ設定(自動検出・読み取り専用):\n\n" + "\n\n".join(parts)
    return out[:_DEPLOY_MAX_CHARS]
