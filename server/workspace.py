import os
import shutil
import filecmp
from pathlib import Path
from datetime import datetime


def _projects_root_for_ws() -> Path:
    """Project scan root (mirrors main._projects_root); overridable via env."""
    override = os.environ.get("FLOW_INSPECTOR_PROJECTS_ROOT", "").strip()
    return Path(override).expanduser() if override else (Path.home() / "projects")


# Files within these top-level $HOME subtrees are editable. Other paths are rejected
# even if they live under $HOME — protects ~/.ssh, ~/.aws, etc.
ALLOWED_HOME_PREFIXES = (".claude", "projects")

# Inside ~/.claude/, refuse to touch these subtrees — they store live state that
# the dashboard editor has no business mutating.
DENY_CLAUDE_SUBTREES = ("todos", "history", "shell-snapshots", "ide", "statsig", "logs")

# Reasonable upper bound for a single file we let through the editor. Above this
# the file is probably not the user's hand-edited config and reading the whole
# thing into memory + sending over the wire would be wasteful.
MAX_FILE_BYTES = 2 * 1024 * 1024  # 2 MiB


class WorkspaceManager:
    def __init__(self, cache_dir: str = None):
        if cache_dir is None:
            cache_dir = str(Path.home() / ".cache" / "flow-inspector")
        self.cache_dir = Path(cache_dir)
        self.workspace_path = self.cache_dir / "workspace"
        self.backups_path = self.cache_dir / "backups"
        self.flows_path = self.cache_dir / "flows"
        # Staged file editor area (mirrors $HOME-relative paths). Independent of
        # the global/project trees used by init/sync/diff.
        self.files_path = self.workspace_path / "files"
        # Persistent store for flow-ization output (LLM annotations + builder-
        # encoded flows). Lives OUTSIDE workspace_path so init()'s rmtree never
        # wipes it; init() re-applies it into a fresh files_path. This is what
        # makes flow-ization survive a plugin restart without re-spending tokens.
        # Layout mirrors files_path exactly (same relative keys) for a 1:1 copy.
        self.annotations_path = self.cache_dir / "annotations"

    def is_initialized(self) -> bool:
        """Check if workspace_path exists and has at least one file in it."""
        if not self.workspace_path.exists():
            return False
        for _ in self.workspace_path.rglob("*"):
            if _.is_file():
                return True
        return False

    def init(self, global_dir: str = None, project_dir: str = None) -> dict:
        """Initialize workspace by copying from production dirs."""
        # Remove old workspace dir if exists
        if self.workspace_path.exists():
            shutil.rmtree(self.workspace_path)

        # Create workspace subdirs
        ws_global = self.workspace_path / "global"
        ws_project = self.workspace_path / "project"
        ws_global.mkdir(parents=True, exist_ok=True)
        ws_project.mkdir(parents=True, exist_ok=True)

        # Copy from global_dir if provided
        if global_dir is not None:
            self._copy_claude_dir(Path(global_dir), ws_global)

        # Copy from project_dir if provided
        if project_dir is not None:
            self._copy_claude_dir(Path(project_dir), ws_project)

        # Create flows dir
        self.flows_path.mkdir(parents=True, exist_ok=True)

        # Re-apply persisted flow-ization into the fresh staging surface so it
        # survives this rmtree-and-rebuild. annotations_path lives outside
        # workspace_path, so it was untouched above.
        reapplied = self._reapply_annotations()

        return {
            "initialized": True,
            "global": bool(global_dir),
            "project": bool(project_dir),
            "annotations_reapplied": reapplied,
        }

    def _reapply_annotations(self) -> int:
        """Copy every persisted annotation back into files_path (same rel key).

        Called by init() after the workspace is rebuilt. Returns the number of
        files re-applied. The overlay (live_to_staged) and push then see the
        flow-ization exactly as before the restart.
        """
        if not self.annotations_path.exists():
            return 0
        count = 0
        for src in self.annotations_path.rglob("*"):
            if not src.is_file():
                continue
            rel = src.relative_to(self.annotations_path)
            dst = self.files_path / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            count += 1
        return count

    def _copy_claude_dir(self, src: Path, dst: Path):
        """Copy relevant .claude/ files from src to dst."""
        # Copy individual files
        for filename in ("CLAUDE.md", "settings.json"):
            src_file = src / filename
            if src_file.exists():
                shutil.copy2(src_file, dst / filename)

        # Copy directories
        for dirname in ("commands", "skills"):
            src_dir = src / dirname
            if src_dir.exists():
                shutil.copytree(src_dir, dst / dirname, dirs_exist_ok=True)

    def sync(self, global_dir: str = None, project_dir: str = None) -> dict:
        """Backup production, then overwrite production with workspace content."""
        ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        backup_dir = self.backups_path / ts
        backup_dir.mkdir(parents=True, exist_ok=True)

        # Backup production → backups/{ts}/
        if global_dir is not None:
            src = Path(global_dir)
            if src.exists():
                shutil.copytree(src, backup_dir / "global", dirs_exist_ok=True)

        if project_dir is not None:
            src = Path(project_dir)
            if src.exists():
                shutil.copytree(src, backup_dir / "project", dirs_exist_ok=True)

        # Copy workspace → production
        ws_global = self.workspace_path / "global"
        if global_dir is not None and ws_global.exists():
            shutil.copytree(ws_global, Path(global_dir), dirs_exist_ok=True)

        ws_project = self.workspace_path / "project"
        if project_dir is not None and ws_project.exists():
            shutil.copytree(ws_project, Path(project_dir), dirs_exist_ok=True)

        self._prune_backups()

        return {"synced": True, "backup": str(backup_dir)}

    def reset(self, global_dir: str = None, project_dir: str = None) -> dict:
        """Re-initialize workspace from production."""
        self.init(global_dir=global_dir, project_dir=project_dir)
        return {"reset": True}

    def diff(self, global_dir: str = None, project_dir: str = None) -> dict:
        """Compare workspace files against production."""
        changed_files = []

        def compare_dir(ws_dir: Path, prod_dir: Path):
            if not ws_dir.exists():
                return
            for ws_file in ws_dir.rglob("*"):
                if not ws_file.is_file():
                    continue
                rel = ws_file.relative_to(ws_dir)
                prod_file = prod_dir / rel
                if not prod_file.exists():
                    changed_files.append(str(ws_file))
                elif not filecmp.cmp(ws_file, prod_file, shallow=False):
                    changed_files.append(str(ws_file))

        if global_dir is not None:
            compare_dir(self.workspace_path / "global", Path(global_dir))

        if project_dir is not None:
            compare_dir(self.workspace_path / "project", Path(project_dir))

        return {"has_changes": bool(changed_files), "changed_files": changed_files}

    # ── File editor (staged file CRUD) ─────────────────────────────────────

    def _validate_live_path(self, live_path: Path) -> Path:
        """Resolve & validate a path the editor wants to read/write.

        Returns the resolved absolute path. Raises ValueError if the path is
        outside the allowed set.
        """
        # Resolve symlinks and ..  before policy check so we cannot be tricked
        # by ~/.claude/..  /.ssh-style traversal.
        try:
            resolved = Path(live_path).expanduser().resolve(strict=False)
        except (OSError, RuntimeError) as e:
            raise ValueError(f"Cannot resolve path: {live_path} ({e})")

        # Allow staging writes to a project's CLAUDE.md / CLAUDE.local.md even
        # outside $HOME (e.g. projects under /srv via FLOW_INSPECTOR_PROJECTS_ROOT).
        # Tightest possible scope: must be UNDER projects_root AND named exactly
        # CLAUDE.md (PROJECT layer) or CLAUDE.local.md (LOCAL layer — gitignored
        # personal override). `resolved` already has symlinks/.. collapsed, so the
        # relative_to() below rejects traversal escapes.
        if resolved.name in ("CLAUDE.md", "CLAUDE.local.md"):
            try:
                proot = _projects_root_for_ws().resolve(strict=False)
                resolved.relative_to(proot)
                # Guard against a broad projects_root re-opening the $HOME policy:
                # if proot is $HOME itself or an ancestor of it, this early-allow
                # would let sensitive in-$HOME paths (~/.ssh/CLAUDE.md,
                # ~/.claude/todos/CLAUDE.md, …) through under the CLAUDE.md name.
                # In that case skip the bypass and fall through to the normal
                # $HOME policy below. Only a *truly external* projects_root
                # (e.g. /srv) keeps the early-allow.
                home = Path.home().resolve()
                # Only bypass for a projects_root genuinely OUTSIDE $HOME. If proot
                # is $HOME, an ancestor of it, OR a descendant of it (e.g. ~/.claude),
                # fall through to the $HOME policy so DENY_CLAUDE_SUBTREES still apply.
                try:
                    proot.relative_to(home)
                    proot_under_home = True
                except ValueError:
                    proot_under_home = False
                if not proot_under_home and proot not in home.parents:
                    return resolved      # project CLAUDE.md outside $HOME — allowed
            except ValueError:
                pass                     # not under projects_root → fall through to $HOME policy

        home = Path.home().resolve()
        try:
            rel = resolved.relative_to(home)
        except ValueError:
            raise ValueError(f"Path is outside $HOME: {resolved}")

        parts = rel.parts
        if not parts:
            raise ValueError("Path resolves to $HOME itself")
        if parts[0] not in ALLOWED_HOME_PREFIXES:
            raise ValueError(
                f"Path's top-level dir under $HOME ({parts[0]!r}) is not editable. "
                f"Allowed: {ALLOWED_HOME_PREFIXES}"
            )
        if parts[0] == ".claude" and len(parts) >= 2 and parts[1] in DENY_CLAUDE_SUBTREES:
            raise ValueError(
                f"Path under ~/.claude/{parts[1]}/ is not editable (runtime state)"
            )
        return resolved

    def live_to_staged(self, live_path) -> Path:
        """Map an absolute live path to its workspace/files/ mirror.

        Caller is expected to have validated the path via _validate_live_path
        first. We deliberately do NOT re-validate here so the function is pure
        path arithmetic and easy to test.
        """
        resolved = Path(live_path).expanduser()
        if not resolved.is_absolute():
            resolved = resolved.resolve(strict=False)
        try:
            rel = resolved.relative_to(Path.home().resolve())
        except ValueError:
            # $HOME-external (e.g. a projects_root CLAUDE.md under /srv): mirror
            # into a separate, collision-free namespace so we never crash and
            # never clash with a $HOME-relative path. Deterministic, no reverse
            # lookup needed: /srv/demo/CLAUDE.md → files_path/_abs/srv/demo/CLAUDE.md
            rel = Path("_abs") / Path(*resolved.parts[1:])
        return self.files_path / rel

    def staged_to_live(self, staged_path) -> Path:
        """Inverse of live_to_staged: recover the live path from a staged mirror.

        Files mirrored under the `_abs/` namespace map back to an absolute path
        rooted at "/"; everything else is $HOME-relative.
        """
        rel = Path(staged_path).relative_to(self.files_path)
        if rel.parts and rel.parts[0] == "_abs":
            return Path("/", *rel.parts[1:])
        return Path.home().resolve() / rel

    def _annotation_path(self, live_path) -> Path:
        """Persistent-store path for a live file, mirroring files_path's layout."""
        staged = self.live_to_staged(live_path)
        rel = staged.relative_to(self.files_path)
        return self.annotations_path / rel

    def save_annotation(self, live_path, content: str) -> Path:
        """Persist flow-ization output for a live file so it survives init().

        Called from the flow-ization paths (LLM annotate + builder-encoded flow)
        in addition to the normal staged write. NOT called for plain text edits
        (the file editor), which are intentionally ephemeral. Returns the path.
        """
        dst = self._annotation_path(live_path)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(content, encoding="utf-8")
        return dst

    def remove_annotation(self, live_path) -> bool:
        """Drop a file's persisted flow-ization (so init() won't resurrect it).

        Called when a staged flow file is discarded. True if something was
        removed. Best-effort prune of now-empty parent dirs.
        """
        dst = self._annotation_path(live_path)
        existed = dst.is_file()
        if existed:
            dst.unlink()
            parent = dst.parent
            while parent != self.annotations_path and parent.exists():
                try:
                    parent.rmdir()
                except OSError:
                    break
                parent = parent.parent
        return existed

    def classify_layer(self, live_path) -> str:
        """Return the settings-stack layer name a live path belongs to.

        Mirrors the categorization used by collect_dashboard_data so the editor
        can show which layer it's about to push to.
        """
        resolved = Path(live_path).expanduser()
        s = str(resolved)
        home = str(Path.home())
        if s.startswith(f"{home}/.claude/plugins/"):
            return "managed"
        if s.startswith(f"{home}/.claude/projects/"):
            return "user-project"
        if s.startswith(f"{home}/.claude/"):
            return "user"
        if ".claude.local/" in s or s.endswith("/.claude.local"):
            return "local"
        if "/.claude/" in s or s.endswith("/.claude"):
            return "project"
        # Root-level project files: the PROJECT/LOCAL layers live as
        # <project>/CLAUDE.md and <project>/CLAUDE.local.md (no .claude/ in the
        # parent chain), so the substring tests above miss them. Checked after
        # the $HOME/.claude/ branches so those still win.
        if resolved.name == "CLAUDE.local.md":
            return "local"
        if resolved.name == "CLAUDE.md":
            return "project"
        return "unknown"

    def read_file(self, live_path) -> dict:
        """Read a settings file via the staged-first overlay.

        Returns:
            {
              "path": str (live path),
              "content": str,
              "is_staged": bool (true if served from workspace/files/),
              "exists_live": bool,
              "size": int (bytes of returned content),
              "mtime": float | None,
            }
        Raises ValueError for unsafe paths, FileNotFoundError if no live or
        staged copy exists, and ValueError if the file is too large.
        """
        resolved = self._validate_live_path(live_path)
        staged = self.live_to_staged(resolved)
        exists_live = resolved.is_file()

        src = staged if staged.is_file() else (resolved if exists_live else None)
        if src is None:
            raise FileNotFoundError(f"No live or staged copy: {resolved}")

        size = src.stat().st_size
        if size > MAX_FILE_BYTES:
            raise ValueError(
                f"File too large ({size} bytes > {MAX_FILE_BYTES}); editor refuses to load"
            )
        try:
            content = src.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raise ValueError(f"File is not valid UTF-8: {resolved}")
        return {
            "path": str(resolved),
            "content": content,
            "is_staged": src == staged,
            "exists_live": exists_live,
            "size": size,
            "mtime": src.stat().st_mtime,
            "layer": self.classify_layer(resolved),
        }

    def write_file(self, live_path, content: str) -> dict:
        """Write content to the staged mirror. Live file is untouched until push."""
        if not isinstance(content, str):
            raise ValueError("content must be a string")
        encoded = content.encode("utf-8")
        if len(encoded) > MAX_FILE_BYTES:
            raise ValueError(
                f"Content too large ({len(encoded)} bytes > {MAX_FILE_BYTES})"
            )
        resolved = self._validate_live_path(live_path)
        staged = self.live_to_staged(resolved)
        staged.parent.mkdir(parents=True, exist_ok=True)
        # atomic: tempfile + os.replace so a crash mid-write can't leave a torn staged file
        import os as _os, tempfile as _tf
        _fd, _tmp = _tf.mkstemp(prefix="." + staged.name + ".", suffix=".tmp", dir=str(staged.parent))
        try:
            with _os.fdopen(_fd, "w", encoding="utf-8") as _f:
                _f.write(content)
            _os.replace(_tmp, staged)
        except Exception:
            try:
                _os.unlink(_tmp)
            except OSError:
                pass
            raise
        return {
            "path": str(resolved),
            "staged_path": str(staged),
            "size": len(encoded),
            "mtime": staged.stat().st_mtime,
            "layer": self.classify_layer(resolved),
        }

    def discard_file(self, live_path) -> dict:
        """Remove the staged copy of a single file, reverting to live."""
        resolved = self._validate_live_path(live_path)
        staged = self.live_to_staged(resolved)
        existed = staged.is_file()
        if existed:
            staged.unlink()
            # Prune now-empty parent dirs up to files_path (best-effort)
            parent = staged.parent
            while parent != self.files_path and parent.exists():
                try:
                    parent.rmdir()
                except OSError:
                    break
                parent = parent.parent
        # Also drop any persisted flow-ization, else init() would resurrect it.
        self.remove_annotation(resolved)
        return {"path": str(resolved), "removed": existed}

    def list_staged_files(self) -> list:
        """List all staged files with a diff summary vs live."""
        results = []
        if not self.files_path.exists():
            return results
        for staged in sorted(self.files_path.rglob("*")):
            if not staged.is_file():
                continue
            live = self.staged_to_live(staged)
            if live.is_file():
                same = filecmp.cmp(staged, live, shallow=False)
                status = "unchanged" if same else "modified"
            else:
                status = "new"
            results.append({
                "path": str(live),
                "staged_path": str(staged),
                "layer": self.classify_layer(live),
                "size": staged.stat().st_size,
                "mtime": staged.stat().st_mtime,
                "status": status,
            })
        return results

    def push_files(self, paths: list = None) -> dict:
        """Copy staged files to live. Optionally restrict to a subset of paths.

        Behavior:
        - Backs up the live version of each touched file (per-file, into a
          single timestamped backup dir) before overwriting.
        - Skips staged files that are byte-identical to live (no-op).
        - After successful push, the staged copy is removed so subsequent
          read_file calls fall through to live (= clean working tree).

        Returns: {pushed: [...], skipped: [...], backup_dir: "..."}
        """
        staged_files = self.list_staged_files()
        if paths is not None:
            wanted = {str(Path(p).expanduser().resolve(strict=False)) for p in paths}
            staged_files = [s for s in staged_files if s["path"] in wanted]

        if not staged_files:
            return {"pushed": [], "skipped": [], "backup_dir": None}

        ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        backup_dir = self.backups_path / f"push-{ts}"
        pushed = []
        skipped = []

        for entry in staged_files:
            live = Path(entry["path"])
            staged = Path(entry["staged_path"])
            if entry["status"] == "unchanged":
                staged.unlink(missing_ok=True)
                skipped.append({**entry, "reason": "identical to live"})
                continue

            # Re-validate so a path that snuck into staging earlier doesn't bypass policy
            try:
                self._validate_live_path(live)
            except ValueError as e:
                skipped.append({**entry, "reason": f"rejected: {e}"})
                continue

            # Per-file backup of the existing live content (if any)
            if live.is_file():
                resolved_live = live.resolve()
                try:
                    rel = resolved_live.relative_to(Path.home().resolve())
                except ValueError:
                    # $HOME-external (projects_root CLAUDE.md): back up under the
                    # same collision-free _abs/ namespace used for staging.
                    rel = Path("_abs") / Path(*resolved_live.parts[1:])
                bkp = backup_dir / rel
                bkp.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(live, bkp)

            live.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(staged, live)
            staged.unlink(missing_ok=True)
            pushed.append(entry)

        self._prune_backups()
        return {
            "pushed": pushed,
            "skipped": skipped,
            "backup_dir": str(backup_dir) if backup_dir.exists() else None,
        }

    def discard_all_files(self) -> dict:
        """Drop every staged file (revert all pending edits to live)."""
        removed = 0
        if self.files_path.exists():
            for staged in self.files_path.rglob("*"):
                if staged.is_file():
                    removed += 1
            shutil.rmtree(self.files_path)
        return {"removed": removed}

    def _prune_backups(self):
        """Keep max 10 backup dirs, delete oldest by sorted name."""
        if not self.backups_path.exists():
            return
        backups = sorted(
            [d for d in self.backups_path.iterdir() if d.is_dir()]
        )
        while len(backups) > 10:
            shutil.rmtree(backups.pop(0))
