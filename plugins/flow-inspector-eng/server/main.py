"""Flow Inspector Plugin — FastAPI backend
Serves the dashboard and provides APIs for workspace management,
flow visualization (via parser), and node editing.
"""
import asyncio
import datetime
import json
import logging
import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import sys
import tempfile
sys.path.insert(0, str(Path(__file__).parent))
from parser import scan_claude_dir, discover_and_scan_all, collect_dashboard_data, collect_claude_stack
from parser_llm import attach_kind, peek_kind_cache, classify_skill_kind_cached_async
from workspace import WorkspaceManager
from project_context import gather_project_context, gather_deploy_context
from explain import handle_explain_request
from auto_config import handle_auto_config_request
from drafts import DraftStore, board_to_workflow
from staged_skills import (
    StagedSkillsStore,
    slugify_skill_name,
    validate_publish_target,
    publish_skill_md,
    publish_command_md,
    read_live_skill,
)
from io_utils import atomic_write_json, flow_lock, validate_flow_id
from eval_judge import build_judge_prompt
from eval_exec import build_exec_prompt, build_safe_settings
from eval_context import build_eval_analysis_context

logger = logging.getLogger("flow_inspector")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Auto-initialize workspace on startup."""
    if not ws.is_initialized():
        global_dir = str(GLOBAL_CLAUDE) if GLOBAL_CLAUDE.exists() else None
        project_dir = (
            str(PROJECT_CLAUDE) if PROJECT_CLAUDE and PROJECT_CLAUDE.exists() else None
        )
        ws.init(global_dir=global_dir, project_dir=project_dir)
    yield


app = FastAPI(title="Flow Inspector Plugin API", version="1.0.0", lifespan=lifespan)

# CORS: localhost development only. Reflecting "*" while allow_credentials=True
# lets any site read authenticated responses — explicit origins keep that shut.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8077",
        "http://127.0.0.1:8077",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _no_cache_static(request: Request, call_next):
    """dev: /static/ 配下はキャッシュさせない。flow-elements.js 等を編集したら即反映される。"""
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


# ── Paths ──
PLUGIN_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = PLUGIN_DIR / "static"
GLOBAL_CLAUDE = Path.home() / ".claude"
# PROJECT_CLAUDE detected from env var or CWD
_project_env = os.environ.get("FLOW_INSPECTOR_PROJECT", "")
PROJECT_CLAUDE = Path(_project_env) / ".claude" if _project_env else None


def _projects_root() -> str:
    """Directory under which project-level `.claude/` configs are scanned.

    Defaults to `~/projects`, but can be overridden with the
    FLOW_INSPECTOR_PROJECTS_ROOT env var so users whose projects live elsewhere
    (e.g. `/srv`, `~/work`, `~/dev`) still get their project layer discovered.
    """
    override = os.environ.get("FLOW_INSPECTOR_PROJECTS_ROOT", "").strip()
    if override:
        return str(Path(override).expanduser())
    return str(Path.home() / "projects")

_PROJECT_EXCLUDE_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".pytest_cache",
    "venv", ".venv", "env", "site-packages", "dist", "build", "target", "out",
    ".next", ".nuxt", ".cache", "coverage", ".turbo", "_archive",
    "flow-inspector", "flow-inspector-venv",
}

ws = WorkspaceManager()
drafts_store = DraftStore()
staged_skills_store = StagedSkillsStore()

# 「初回フロー化セットアップ済み」マーカー。起動時の同意チャットを初回に1回だけ
# 出すための目印 (詳細は spec §12)。本体は無害なタイムスタンプ JSON。
ANNOTATE_SETUP_MARKER = ws.cache_dir / "setup-done.json"


# ── Models ──

class NodeUpdate(BaseModel):
    """Partial update to a node."""
    title: Optional[str] = None
    summary: Optional[str] = None  # non-technical human-readable description
    desc: Optional[str] = None
    prompt: Optional[str] = None  # sub-agent prompt, hook code, etc.
    input: Optional[dict] = None
    output: Optional[dict] = None
    duration: Optional[str] = None
    config: Optional[dict] = None  # hook config, MCP server config, etc.
    meta: Optional[dict] = None    # whiteboard-style meta (alternative to config)

NodeType = Literal["parent", "subagent", "mcp", "hook", "code", "user", "decision"]


class NodeInsert(BaseModel):
    """Insert a new node into a workflow."""
    after_node: str        # node id to insert after
    type: NodeType
    title: str
    subtitle: Optional[str] = ""
    desc: Optional[str] = ""
    prompt: Optional[str] = ""
    config: Optional[dict] = None

class FlowMeta(BaseModel):
    """Workflow metadata."""
    id: str
    name: str
    category: str
    description: str
    complexity: str
    node_count: int
    edge_count: int
    source_path: Optional[str] = None
    source_layer: Optional[str] = None
    plugin_source: Optional[str] = None   # e.g. "anthropic-agent-skills" or "project:<name>"
    skill_name: Optional[str] = None      # e.g. "pdf" (the dir under skills/)
    container_path: Optional[str] = None  # e.g. "pipeline/skills" — for project:* skills (Option B)
    working_dir: Optional[str] = None     # e.g. "my-project" — project root for project:* skills
    kind: Optional[int] = None            # cached LLM kind (1-4) if classified; None = 未フロー化
    flowized: bool = False                # True if kind cache exists = フロー化済み (0トークン判定)

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    flow_id: Optional[str] = None
    node_id: Optional[str] = None
    context_type: Optional[str] = None  # "node-settings" | "flow-build" | None
    board: Optional[dict] = None  # flow-build: クライアントの現在ボード (boardToWorkflow 済み flow JSON, 未保存OK)
    det_findings: Optional[list] = None  # flow-review: 機械チェック済みの指摘 [{title, detail}] (重複指摘回避用)
    required_status: Optional[list] = None  # flow-build: ノード別の未入力必須項目 [{node_id,label,nodeType,missing:[{key,label,desc,options}]}]
    project: Optional[str] = None  # dashboard: 選択中プロジェクト (名前 or パス)。発言に名前が無いとき中身詳細の対象にする
    intent: Optional[str] = None  # node-explain: 入口で選んだ意図 "fix"（スキル修正→edit_prompt） | "claudemd"（CLAUDE.md追加→claude_md_add）

class DesignNodeRequest(BaseModel):
    messages: list[ChatMessage]
    flow_id: str
    after_node: str       # node id to insert after
    before_node: str      # node id to insert before

# ── Drafts (per-flow editing snapshots) ──

class DraftSaveRequest(BaseModel):
    """PUT /api/drafts/:flow_id body."""
    board: dict
    client_id: Optional[str] = None
    # Reserved for Phase C conflict detection (ignored in A+B):
    expected_draft_sha256: Optional[str] = None

class DraftMeta(BaseModel):
    """Item in GET /api/drafts list response."""
    flow_id: str
    saved_at: Optional[str] = None
    name: Optional[str] = None
    item_count: int = 0

class DraftEnvelope(BaseModel):
    """Stored draft + sha256 metadata."""
    schema_version: int = 1
    flow_id: str
    saved_at: str
    client_id: Optional[str] = None
    source_sha256: Optional[str] = None
    draft_sha256: str
    board: dict


# ── Settings file editor (config stack) ──

class FileWriteRequest(BaseModel):
    """PUT /api/workspace/file body."""
    path: str       # absolute live path
    content: str

class FilePushRequest(BaseModel):
    """POST /api/workspace/push body."""
    paths: Optional[list[str]] = None  # None = push all staged


# ── Helpers ──

def make_address(flow_id: str, node_id: str) -> str:
    """Generate a copyable address like flow:x-autopilot/n4"""
    return f"flow:{flow_id}/{node_id}"

def enrich_nodes_with_addresses(flow: dict) -> dict:
    """Add address field to every node."""
    fid = flow["id"]
    for node in flow.get("nodes", []):
        node["address"] = make_address(fid, node["id"])
    return flow

def _get_all_flows() -> list[dict]:
    """Get flows by scanning ALL .claude/ dirs and CLAUDE.md files on the machine.

    Scans three layers:
    - user: ~/.claude/ (global)
    - user-project: ~/.claude/projects/*/ (per-project user overrides)
    - project: ~/projects/*/.claude/ and ~/projects/*/CLAUDE.md
    """
    projects_root = _projects_root()
    flows = discover_and_scan_all(projects_root=projects_root)

    # staged にアノテート済み (flow_version:1) コピーがある skill は、そちらから決定論パースし直す。
    # → live は無傷のまま、ダッシュボードにはアノテート版フローを表示する。
    flows = [_overlay_staged_annotation(f) for f in flows]

    # Overlay saved flow edits from flows_path
    if ws.flows_path.exists():
        for p in ws.flows_path.glob("*.json"):
            try:
                saved = json.loads(p.read_text(encoding="utf-8"))
                # Replace parsed flow with saved version if same id
                flows = [f for f in flows if f["id"] != saved["id"]] + [saved]
            except Exception:
                pass

    # フロー化ロジック: 手順系フロー (skill / agent) に「フロー開始/完了」マーカーを自動注入。
    # 全フロー共通の I/O 契約 (入力物・トリガー / 出力物・通知先) を可視化する。冪等。
    flows = [_inject_endpoints_if_procedure(f) for f in flows]

    return flows


_PROCEDURE_SOURCE_TYPES = {"skill", "agent"}


def _inject_endpoints_if_procedure(flow: dict) -> dict:
    """手順系フロー (skill / agent) のみ開始/完了マーカーを注入する。"""
    src_type = (flow.get("source") or {}).get("type", "")
    if src_type not in _PROCEDURE_SOURCE_TYPES:
        return flow
    try:
        from flow_codec import inject_flow_endpoints
        return inject_flow_endpoints(flow)
    except Exception as e:
        logger.warning("inject_flow_endpoints failed for %s: %s", flow.get("id"), e)
        return flow


def _overlay_staged_annotation(flow: dict) -> dict:
    """skill フローに staged アノテート版があれば、そこから決定論パースし直す。

    staging (workspace/files/) はアノテート結果と編集の両方を保持する。
    flow_version:1 付きならマーカーがあるので parser_convention で可逆フローになる。
    live ファイルは触らない。source.path は live のまま保つ (stage/push が成立するように)。
    """
    src = flow.get("source") or {}
    if src.get("type") != "skill":
        return flow
    live_path = src.get("path")
    if not live_path:
        return flow
    try:
        staged = ws.live_to_staged(live_path)
        if not staged.is_file():
            return flow
        text = staged.read_text(encoding="utf-8")
        from parser_convention import is_convention_v1, parse_skill_convention
        if not is_convention_v1(text):
            return flow
        layer = src.get("layer", "user")
        reparsed = parse_skill_convention(str(staged), layer)
        # id / source.path は live 基準を維持
        reparsed["id"] = flow["id"]
        reparsed["source"] = {**src, "path": live_path}
        # 元フローの付帯メタ (plugin_source 等) を引き継ぐ
        for k in ("plugin_source", "skill_name", "meta", "category"):
            if k in flow and k not in reparsed:
                reparsed[k] = flow[k]
        return reparsed
    except Exception as e:
        logger.warning("_overlay_staged_annotation failed for %s: %s", flow.get("id"), e)
        return flow

def _check_flow_id(flow_id: str) -> str:
    """Validate flow_id at endpoint entry. Rejects '', 'undefined', path-traversal."""
    try:
        return validate_flow_id(flow_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


def _flow_lock(flow_id: str):
    """Context manager: serialise concurrent edits on the same flow_id."""
    return flow_lock(ws.cache_dir / "locks", flow_id)


def _find_flow(flow_id: str) -> dict:
    _check_flow_id(flow_id)
    for f in _get_all_flows():
        if f["id"] == flow_id:
            return f
    raise HTTPException(404, f"Flow '{flow_id}' not found")

def _find_flow_with_draft(flow_id: str) -> dict:
    """Like _find_flow, but overlays the user's current draft board if one
    exists. Used by /api/flows/:id/versions so 📋名前をつけて保存 captures the
    unsaved board edits (not the stale on-disk parsed flow).
    """
    base = _find_flow(flow_id)
    draft = drafts_store.load(flow_id)
    if draft and isinstance(draft.get("board"), dict):
        return board_to_workflow(draft["board"], base)
    return base

def _save_flow(flow_id: str, data: dict):
    ws.flows_path.mkdir(parents=True, exist_ok=True)
    atomic_write_json(ws.flows_path / f"{flow_id}.json", data)


# ══════════ Workspace API ══════════

@app.post("/api/explain")
async def api_explain(req: Request):
    """ノードの設定値から非エンジニア向け説明文を生成 (Claude Code CLI 経由)。

    POST /api/explain
    body: { type, title, subtitle, desc, cat, meta }
    returns: { explain: str }
    """
    return await handle_explain_request(req)

@app.post("/api/auto-config")
async def api_auto_config(req: Request):
    """フローメタ (H) や ノード設定値 (F) を AI で推論 (Claude Code CLI 経由)。

    POST /api/auto-config
    body: {
      mode: "flow-meta" | "node-fields",
      ...各 mode 別の payload
    }

    mode="flow-meta": { purpose, inputs, outputs, reasoning }
    mode="node-fields": { fields, reasoning } (未実装)
    """
    return await handle_auto_config_request(req)


@app.post("/api/workspace/init")
def workspace_init():
    """Initialize the workspace by copying files from global/project .claude dirs."""
    global_dir = str(GLOBAL_CLAUDE) if GLOBAL_CLAUDE.exists() else None
    project_dir = str(PROJECT_CLAUDE) if PROJECT_CLAUDE and PROJECT_CLAUDE.exists() else None
    return ws.init(global_dir=global_dir, project_dir=project_dir)

@app.get("/api/workspace/status")
def workspace_status():
    """Return workspace initialization state and diff summary."""
    global_dir = str(GLOBAL_CLAUDE) if GLOBAL_CLAUDE.exists() else None
    project_dir = str(PROJECT_CLAUDE) if PROJECT_CLAUDE and PROJECT_CLAUDE.exists() else None
    initialized = ws.is_initialized()
    diff_result = (
        ws.diff(global_dir=global_dir, project_dir=project_dir)
        if initialized
        else {"has_changes": False, "changed_files": []}
    )
    return {"initialized": initialized, **diff_result}

@app.post("/api/workspace/sync")
def workspace_sync():
    """Sync workspace with current global/project .claude dirs."""
    global_dir = str(GLOBAL_CLAUDE) if GLOBAL_CLAUDE.exists() else None
    project_dir = str(PROJECT_CLAUDE) if PROJECT_CLAUDE and PROJECT_CLAUDE.exists() else None
    return ws.sync(global_dir=global_dir, project_dir=project_dir)

@app.post("/api/workspace/reset")
def workspace_reset():
    """Reset workspace (re-copy all files from source)."""
    global_dir = str(GLOBAL_CLAUDE) if GLOBAL_CLAUDE.exists() else None
    project_dir = str(PROJECT_CLAUDE) if PROJECT_CLAUDE and PROJECT_CLAUDE.exists() else None
    return ws.reset(global_dir=global_dir, project_dir=project_dir)

@app.get("/api/workspace/diff")
def workspace_diff():
    """Return diff between workspace and current source files."""
    global_dir = str(GLOBAL_CLAUDE) if GLOBAL_CLAUDE.exists() else None
    project_dir = str(PROJECT_CLAUDE) if PROJECT_CLAUDE and PROJECT_CLAUDE.exists() else None
    return ws.diff(global_dir=global_dir, project_dir=project_dir)


# ── Settings file editor (config stack) ─────────────────────────────────────
# The dashboard's 設定スタック lets the user view & edit ~/.claude/* and
# ~/projects/*/.claude/* config files through a pull→edit→push workflow:
#   - GET  /api/workspace/file       reads via staged-first overlay
#   - PUT  /api/workspace/file       writes to staging (no live mutation)
#   - DELETE /api/workspace/file     discards one staged file
#   - GET  /api/workspace/staged     lists pending edits
#   - POST /api/workspace/push       applies staged → live (with backup)
#   - POST /api/workspace/discard-all  drops all pending edits

@app.get("/api/workspace/file")
def workspace_read_file(path: str):
    """Read a settings file (staged copy first, falling back to live)."""
    try:
        return ws.read_file(path)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))

@app.put("/api/workspace/file")
def workspace_write_file(body: FileWriteRequest):
    """Stage edited content for a settings file. Live file is untouched."""
    try:
        return ws.write_file(body.path, body.content)
    except ValueError as e:
        raise HTTPException(400, str(e))

@app.delete("/api/workspace/file")
def workspace_discard_file(path: str):
    """Drop a single staged file, reverting next read to live."""
    try:
        return ws.discard_file(path)
    except ValueError as e:
        raise HTTPException(400, str(e))

@app.get("/api/workspace/staged")
def workspace_list_staged():
    """List all files with pending edits in the staging area."""
    files = ws.list_staged_files()
    # Drop "unchanged" entries — they're stale snapshots, not edits the user
    # cares about. (push will clean them up eventually.)
    modified = [f for f in files if f["status"] != "unchanged"]
    has_managed = any(f["layer"] == "managed" for f in modified)
    return {
        "count": len(modified),
        "files": modified,
        "has_managed_changes": has_managed,
    }

@app.post("/api/workspace/push")
def workspace_push(body: FilePushRequest):
    """Apply staged edits back to live files (with timestamped backups)."""
    try:
        return ws.push_files(paths=body.paths)
    except ValueError as e:
        raise HTTPException(400, str(e))

@app.post("/api/workspace/discard-all")
def workspace_discard_all():
    """Drop every staged file (revert all pending edits)."""
    return ws.discard_all_files()


@app.post("/api/workspace/annotate-all")
async def workspace_annotate_all(req: Request, force: bool = False):
    """未アノテートの自作 skill をフロー化 (flow_version:1 + マーカー) する。

    - body(任意): {"flow_ids": [...], "force": bool}
      - flow_ids 指定時はそのIDだけを対象にする (チャットの「選択してフロー化」用)。
      - 無指定/空なら全件 (UIボタン・「全部フロー化」用、後方互換)。
    - 結果は live ではなく staging に書く (push まで本番は無傷)。
    - 既に flow_version:1 / staged 済みのものは skip (冪等)。force=true で再生成。
    - managed (プラグイン配布) skill は対象外 (read-only)。
    - 本文保全チェック付き (v3: 機械的挿入)。
    """
    try:
        from annotator import annotate_skill_async
    except ImportError:
        from server.annotator import annotate_skill_async  # type: ignore

    # body から flow_ids / force を読む (body 無しでも動く)
    flow_ids = None
    try:
        body = await req.json()
        if isinstance(body, dict):
            if isinstance(body.get("flow_ids"), list):
                flow_ids = [str(x) for x in body["flow_ids"]]
            if isinstance(body.get("force"), bool):
                force = body["force"]
    except Exception:
        pass  # body 無し/不正は無視してクエリ引数 force のみ採用

    # 候補判定は annotate-candidates と共有 (DRY)
    pending = _annotate_pending(force=force)
    # flow_ids 指定時はそのIDだけに絞る (存在しないIDは自然に除外される)
    if flow_ids is not None:
        wanted = set(flow_ids)
        pending = [c for c in pending if c["id"] in wanted]

    annotated, skipped, failed = [], [], []
    sem = asyncio.Semaphore(3)

    async def _one(flow_id: str, path: str):
        async with sem:
            try:
                res = await annotate_skill_async(path, dry_run=True, variant="v3")
                ws.write_file(path, res.annotated_text)
                ws.save_annotation(path, res.annotated_text)  # survives init()
                annotated.append({"id": flow_id, "nodes": res.nodes_matched})
            except Exception as e:
                failed.append({"id": flow_id, "error": str(e)})

    await asyncio.gather(*[_one(c["id"], c["path"]) for c in pending])
    if annotated:
        # 正常に1件以上フロー化できたら「セットアップ済み」マーカーを書く
        # (起動時の初回チャット同意をもう出したかの目印。本体は無害なタイムスタンプ)
        try:
            atomic_write_json(ANNOTATE_SETUP_MARKER, {"annotated_total": len(annotated)})
        except Exception as e:
            logger.warning("failed to write setup marker: %s", e)
    return {
        "ok": True,
        "annotated": annotated,
        "skipped": skipped,
        "failed": failed,
        "total": len(pending),
    }


def _annotate_pending(force: bool = False) -> list:
    """フロー化(アノテート)が必要な自作 skill を決定論で列挙する。

    **LLM は一切呼ばない (0 トークン)**。annotate-all と annotate-candidates が
    共有する候補判定。返値: [{"id", "name", "description", "path"}, ...]

    除外: managed(配布) skill、既に live が flow_version:1、既に staged 済み(force=False時)。
    """
    try:
        from parser_convention import is_convention_v1
    except ImportError:
        from server.parser_convention import is_convention_v1  # type: ignore

    pending = []
    for f in discover_and_scan_all(projects_root=_projects_root()):
        src = f.get("source") or {}
        if src.get("type") != "skill" or not src.get("path"):
            continue
        if src.get("layer") == "managed":
            continue
        path = src["path"]
        try:
            live_text = Path(path).read_text(encoding="utf-8")
        except Exception:
            continue
        # 既に live がアノテート済み → 対象外
        if is_convention_v1(live_text):
            continue
        # 既に staged 済み → 対象外 (force でなければ)
        if not force:
            staged = ws.live_to_staged(path)
            if staged.is_file():
                try:
                    if is_convention_v1(staged.read_text(encoding="utf-8")):
                        continue
                except Exception:
                    pass
        pending.append({
            "id": f["id"],
            "name": f.get("name", f["id"]),
            "description": f.get("description", ""),
            "path": path,
        })
    return pending


@app.get("/api/workspace/annotate-candidates")
def workspace_annotate_candidates():
    """フロー化が必要な自作 skill の「件数 + 名前」を決定論で返す。

    **LLM 不使用 = 0 トークン**。起動時にこの件数を見て、ターミナルの Claude が
    チャットで「N件フロー化しますか?」とコスト同意を取るために使う。
    `setup_done`: 初回セットアップ済みマーカーの有無。
    """
    pending = _annotate_pending(force=False)
    return {
        "count": len(pending),
        "skills": [
            {"id": c["id"], "name": c["name"], "description": c["description"]}
            for c in pending
        ],
        "setup_done": ANNOTATE_SETUP_MARKER.is_file(),
    }


# ══════════ Flow Stage API ══════════

class StageFlowResponse(BaseModel):
    staged: list  # workspace.list_staged_files() の結果
    path: str     # 書き込んだ live_path
    warnings: list = []  # 本文が空のノード等の警告メッセージ


# 本文 (desc) が不要なノードタイプ (空でも警告しない)
_BODYLESS_NODE_TYPES = {"parallel", "parent"}


def _collect_empty_body_warnings(flow: dict) -> list:
    """本文 (desc) が空のノードを検出して警告メッセージのリストを返す。

    parallel / parent は本文不要なので対象外。
    """
    warnings = []
    for n in flow.get("nodes", []):
        if n.get("type") in _BODYLESS_NODE_TYPES:
            continue
        desc = (n.get("desc") or "").strip()
        # config.prompt があれば本文相当とみなす (think/subagent 等)
        has_prompt = bool((n.get("config") or {}).get("prompt", "").strip())
        if not desc and not has_prompt:
            title = n.get("title") or n.get("id")
            warnings.append(f'{n["id"]}「{title}」は本文が空です')
    return warnings


@app.post("/api/flows/{flow_id}/stage", response_model=StageFlowResponse)
async def stage_flow(flow_id: str):
    """フローを実ファイル (staging) に書き戻す。

    flow["source"]["type"] に応じてエンコーダを選択し、
    source.path の staging コピーを更新する。
    実ファイルへの反映は /api/workspace/push を使う。
    """
    flow = _find_flow_with_draft(flow_id)

    source = flow.get("source") or {}
    source_type = source.get("type", "")
    source_path = source.get("path", "")

    if not source_path:
        raise HTTPException(400, "Flow has no source.path (demo data is not stageable)")

    if source_type == "skill":
        try:
            from flow_codec import encode_flow_to_skill_md
        except ImportError:
            raise HTTPException(501, "flow_codec module not available")
        try:
            encoded = encode_flow_to_skill_md(flow)
        except NotImplementedError as e:
            raise HTTPException(501, f"encode_flow_to_skill_md not implemented: {e}")

    elif source_type == "agent":
        try:
            from flow_codec import encode_flow_to_agent_md
        except ImportError:
            raise HTTPException(501, "encode_flow_to_agent_md is not yet implemented")
        try:
            encoded = encode_flow_to_agent_md(flow)
        except NotImplementedError as e:
            raise HTTPException(501, f"encode_flow_to_agent_md not implemented: {e}")

    elif source_type == "hooks":
        try:
            from flow_codec import encode_flow_to_hook_patch
        except ImportError:
            raise HTTPException(501, "encode_flow_to_hook_patch is not yet implemented")
        try:
            encoded = encode_flow_to_hook_patch(flow, source_path)
        except NotImplementedError as e:
            raise HTTPException(501, f"encode_flow_to_hook_patch not implemented: {e}")

    else:
        raise HTTPException(400, f"source type '{source_type}' is not stageable")

    try:
        ws.write_file(source_path, encoded)
        ws.save_annotation(source_path, encoded)  # builder-saved flow survives init()
    except ValueError as e:
        raise HTTPException(400, str(e))

    return StageFlowResponse(
        staged=ws.list_staged_files(),
        path=source_path,
        warnings=_collect_empty_body_warnings(flow),
    )


# ══════════ Drafts API ══════════
# Per-flow editing snapshots. Persists the 💾保存 button's board so users can
# resume editing across sessions without polluting the version history.
# Save As (📋名前をつけて保存) goes via POST /api/flows/:id/versions, which
# overlays the current draft via _find_flow_with_draft().

@app.get("/api/drafts", response_model=list[DraftMeta])
def list_drafts():
    return drafts_store.list()

@app.get("/api/drafts/{flow_id}", response_model=DraftEnvelope)
def get_draft(flow_id: str):
    try:
        d = drafts_store.load(flow_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if d is None:
        raise HTTPException(404, f"No draft for '{flow_id}'")
    return d

@app.put("/api/drafts/{flow_id}", response_model=DraftEnvelope)
def save_draft(flow_id: str, body: DraftSaveRequest):
    # body.expected_draft_sha256 is reserved for Phase C; ignored here.
    try:
        return drafts_store.save(flow_id, body.board, client_id=body.client_id)
    except ValueError as e:
        raise HTTPException(400, str(e))

@app.delete("/api/drafts/{flow_id}")
def delete_draft(flow_id: str):
    try:
        ok = drafts_store.delete(flow_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not ok:
        raise HTTPException(404, f"No draft for '{flow_id}'")
    return {"ok": True}


@app.get("/api/flows/{flow_id}/source")
def get_flow_source(flow_id: str):
    """フローの元ファイル (SKILL.md / agent.md / settings.json) の全文を返す。

    source.path はパース済みフローが保持する信頼できるパスなので、
    workspace のパス検証を経由せず直接読む (読み取り専用)。
    """
    flow = _find_flow_with_draft(flow_id)
    source = flow.get("source") or {}
    path = source.get("path")
    if not path:
        raise HTTPException(404, "このフローには元ファイル (source.path) がありません")
    p = Path(path)
    if not p.exists():
        raise HTTPException(404, f"ファイルが見つかりません: {path}")
    try:
        content = p.read_text(encoding="utf-8")
    except Exception as e:
        raise HTTPException(400, f"読み取り失敗: {e}")
    return {
        "path": path,
        "type": source.get("type", ""),
        "content": content,
        "lines": content.count("\n") + 1,
    }


class PreviewSourceRequest(BaseModel):
    flow: dict  # 編集中の flow JSON (boardToWorkflow の結果)

@app.post("/api/flows/{flow_id}/preview-source")
def preview_source(flow_id: str, body: PreviewSourceRequest):
    """編集中の flow を即エンコードして SKILL.md プレビューを返す (LLM 不要・数ms)。

    構造 (見出し+マーカー) は即時反映、本文が空のノードは「未記入」プレースホルダ。
    """
    try:
        from flow_codec import encode_flow_to_skill_md, placeholder_body_provider
    except ImportError:
        raise HTTPException(501, "flow_codec module not available")
    flow = body.flow or {}
    if not flow.get("nodes"):
        return {"content": "", "lines": 0, "empty": True}
    try:
        text = encode_flow_to_skill_md(flow, body_provider=placeholder_body_provider)
    except Exception as e:
        raise HTTPException(400, f"プレビュー生成失敗: {e}")
    return {"content": text, "lines": text.count("\n") + 1}


class SkillSaveRequest(BaseModel):
    folder: str          # 保存先フォルダ (~ 展開、ホーム配下のみ許可)
    name: str            # スキル名 (= 作られる <name>/ ディレクトリ)
    flow: dict           # boardToWorkflow 済みの flow JSON


@app.post("/api/skills/save")
def skills_save(body: SkillSaveRequest):
    """選択フローを SKILL.md にエンコードし、<folder>/<name>/SKILL.md に実ファイルとして書き出す。

    パストラバーサル防止のため folder はホームディレクトリ配下のみ許可する。
    本文は passthrough (実ノード本文をそのまま) で出力する。
    """
    try:
        from flow_codec import encode_flow_to_skill_md
    except ImportError:
        raise HTTPException(501, "flow_codec module not available")
    name = (body.name or "").strip().replace("/", "-").replace("\\", "-")
    if not name or ".." in name or name.startswith("."):
        raise HTTPException(400, "スキル名が不正です")
    folder = os.path.expanduser((body.folder or "").strip())
    if not folder:
        raise HTTPException(400, "保存フォルダを指定してください")
    try:
        # Shared guard: under HOME, and not a sensitive subtree (~/.ssh etc.).
        folder_p = validate_publish_target(folder)
    except ValueError as e:
        raise HTTPException(400, f"保存先が不正です: {e}")
    flow = body.flow or {}
    if not flow.get("nodes"):
        raise HTTPException(400, "ノードがありません")
    try:
        content = encode_flow_to_skill_md(flow)
    except Exception as e:
        raise HTTPException(400, f"SKILL.md 生成失敗: {e}")
    skill_dir = folder_p / name
    try:
        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_md = skill_dir / "SKILL.md"
        skill_md.write_text(content, encoding="utf-8")
    except Exception as e:
        raise HTTPException(500, f"書き込み失敗: {e}")
    return {"path": str(skill_md), "content": content}


# ── Staged skills (公開待ち → 同期 ゲート) ──────────────────────────────────

class SkillStageRequest(BaseModel):
    folder: str                       # publish 先 (~ 展開・ホーム配下のみ) 既定 ~/.claude/skills
    name: str                         # 表示名 (= folder slug & frontmatter name)
    description: str = ""             # frontmatter description
    flow: dict                        # boardToWorkflow 済み flow JSON
    content: Optional[str] = None     # 生成済み 全文 (あれば encode を上書き=二重生成回避)
    source_board_id: Optional[str] = None
    kind: str = "skill"               # "skill" | "command" — 公開時のファイル形を決める


class SkillPublishRequest(BaseModel):
    slug: str


@app.post("/api/skills/stage")
def skills_stage(body: SkillStageRequest):
    """フローを SKILL.md 化して「公開待ち」(FI内 staging) に保存する。

    ~/.claude には書かない。publish (同期) で初めて本番反映。打った名前/説明を
    frontmatter に反映するので「無題のボード」/空 description にならない。
    """
    try:
        from flow_codec import encode_flow_with_name, encode_flow_to_command_md
    except ImportError:
        raise HTTPException(501, "flow_codec module not available")
    kind = body.kind if body.kind in ("skill", "command") else "skill"
    display_name = (body.name or "").strip()
    if not display_name:
        raise HTTPException(400, "名前を入力してください")
    try:
        slugify_skill_name(display_name)
    except ValueError:
        raise HTTPException(400, "名前が不正です")
    folder = (body.folder or "").strip() or ("~/.claude/commands" if kind == "command" else "~/.claude/skills")
    try:
        validate_publish_target(folder)   # publish 先を早期検証 (本番には書かない)
    except ValueError:
        raise HTTPException(400, "保存先はホームディレクトリ配下にしてください")
    flow = body.flow or {}
    if not flow.get("nodes"):
        raise HTTPException(400, "ノードがありません")
    try:
        if (body.content or "").strip():
            content = body.content  # 生成フェーズで作った本文をそのまま使う (二重生成回避)
        elif kind == "command":
            content = encode_flow_to_command_md(flow, display_name, body.description or "")
        else:
            content = encode_flow_with_name(flow, display_name, body.description or "")
    except Exception as e:
        raise HTTPException(400, f"本文生成失敗: {e}")
    try:
        entry = staged_skills_store.stage(
            display_name=display_name,
            description=body.description or "",
            content=content,
            publish_target=folder,
            source_board_id=body.source_board_id,
            kind=kind,
        )
    except Exception as e:
        raise HTTPException(500, f"公開待ち保存失敗: {e}")
    return {
        "slug": entry["slug"],
        "path": str(staged_skills_store.root / entry["slug"] / "SKILL.md"),
        "content": content,
        "entry": entry,
    }


@app.get("/api/skills/staged")
def skills_staged_list():
    """公開待ちスキル一覧 (ダッシュボードが読む)。"""
    return staged_skills_store.list()


@app.get("/api/skills/staged/{slug}")
def skills_staged_get(slug: str):
    """公開待ち1件 + 同名 live があれば diff 用に live 本文も返す。"""
    entry = staged_skills_store.get(slug)
    if entry is None:
        raise HTTPException(404, "公開待ちスキルが見つかりません")
    live = read_live_skill(entry.get("publish_target") or "~/.claude/skills", entry["slug"])
    return {
        "staged_content": entry["content"],
        "live_content": live,
        "is_new": live is None,
        "entry": entry,
    }


@app.post("/api/skills/publish")
def skills_publish(body: SkillPublishRequest):
    """公開待ちを本番 (~/.claude/skills 等) へ同期し、staging から除去する。"""
    entry = staged_skills_store.get(body.slug)
    if entry is None:
        raise HTTPException(404, "公開待ちスキルが見つかりません")
    kind = entry.get("kind") or "skill"
    target = entry.get("publish_target") or ("~/.claude/commands" if kind == "command" else "~/.claude/skills")
    try:
        if kind == "command":
            path = publish_command_md(entry["content"], target, entry["slug"])
        else:
            path = publish_skill_md(entry["content"], target, entry["slug"])
    except ValueError:
        raise HTTPException(400, "保存先はホームディレクトリ配下にしてください")
    except Exception as e:
        raise HTTPException(500, f"同期失敗: {e}")
    staged_skills_store.remove(entry["slug"])
    return {"path": str(path), "slug": entry["slug"]}


@app.delete("/api/skills/staged/{slug}")
def skills_staged_delete(slug: str):
    """公開待ちを破棄 (本番は無関係)。"""
    if not staged_skills_store.remove(slug):
        raise HTTPException(404, "公開待ちスキルが見つかりません")
    return {"ok": True}


class SkillPreflightMcpRequest(BaseModel):
    flow: dict  # boardToWorkflow 済み flow JSON


@app.post("/api/skills/preflight-mcp")
def skills_preflight_mcp(body: SkillPreflightMcpRequest):
    """flow 内の MCP ノードが参照するサーバーが「設定済み (config-presence)」かを検査する。

    .mcp.json / settings に宣言されているかだけを見る (実起動の疎通確認はしない)。
    読み取りのみ・サブプロセス無し・即時。未設定サーバーごとに warn を返す。
    """
    flow = body.flow or {}
    nodes = flow.get("nodes") or []
    try:
        data = collect_dashboard_data(projects_root=_projects_root())
        servers = data.get("mcp_servers", []) or []
    except Exception:  # pragma: no cover - 設定収集失敗時は警告無し (誤検知より無検知)
        servers = []
    names = [str(s.get("name", "")).lower() for s in servers if s.get("name")]

    def _configured(hint: str) -> bool:
        lo = (hint or "").lower()
        if not lo:
            return False
        return any(lo == n or lo in n or n in lo for n in names)

    missing: dict[str, list] = {}
    for n in nodes:
        if n.get("type") != "mcp":
            continue
        meta = n.get("meta") or n.get("config") or {}
        server = (meta.get("server") or meta.get("mcp_server") or "").strip()
        if not server or _configured(server):
            continue
        missing.setdefault(server, [])
        if n.get("id"):
            missing[server].append(n.get("id"))

    warnings = [
        {
            "level": "warn",
            "title": f"MCPサーバー「{srv}」が未設定",
            "detail": "このノードが参照するサーバーが .mcp.json / settings に見つかりません。接続を設定してください。",
            "nodeIds": ids,
        }
        for srv, ids in missing.items()
    ]
    return {"warnings": warnings}


class SkillGenerateBodyRequest(BaseModel):
    name: str = ""
    description: str = ""
    flow: dict
    force_regenerate: bool = False  # False=空ノードのみ生成(desc温存) / True=全ステップ書き直し
    kind: str = "skill"             # "skill" | "command" — 最終エンコードの形を決める


@app.post("/api/skills/generate-body")
async def skills_generate_body(body: SkillGenerateBodyRequest):
    """flow図 + node設定をLLMが読んで各ステップ本文を生成し、SKILL.md 全文を SSE で返す。

    - ノード完了ごとに `{done_count,total}` を流し、最後に `{content}` を1イベントで返す。
    - force_regenerate=False は desc があるノードをスキップ (既存記述を温存)。
    - claude CLI 不在時は passthrough (desc のまま) に縮退し、content を1発で返す。
    """
    flow = body.flow or {}
    if not flow.get("nodes"):
        raise HTTPException(400, "ノードがありません")
    try:
        import flow_codec as fc
    except ImportError:
        raise HTTPException(501, "flow_codec module not available")

    name = (body.name or "").strip() or flow.get("name") or "unnamed"
    description = (body.description or "").strip() or flow.get("description", "")
    overridden = {**flow, "name": name, "description": description}
    force = bool(body.force_regenerate)
    is_cmd = body.kind == "command"

    def _encode(bp=None):
        if is_cmd:
            return fc.encode_flow_to_command_md(overridden, name, description, body_provider=bp) if bp \
                else fc.encode_flow_to_command_md(overridden, name, description)
        return fc.encode_flow_to_skill_md(overridden, body_provider=bp) if bp \
            else fc.encode_flow_to_skill_md(overridden)

    async def _gen():
        # CLI 不在 → passthrough 縮退 (本文は desc のまま、frontmatter は入力値)
        if not find_claude_cli():
            content = _encode()
            yield f"data: {json.dumps({'content': content, 'degraded': True}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return
        nodes = overridden.get("nodes", [])
        skill_meta = {"name": name, "description": description}
        prev_t, next_t = fc._adjacency_titles(overridden)
        prev_io_map, next_io_map = fc._adjacency_io(overridden)
        sem = asyncio.Semaphore(6)
        total = len(nodes)

        async def worker(node: dict):
            nid = node["id"]
            if not force and (node.get("desc") or "").strip():
                return nid, node["desc"]
            async with sem:
                try:
                    b = await fc._generate_body_one(
                        node, prev_title=prev_t.get(nid), next_title=next_t.get(nid),
                        skill_meta=skill_meta, model="sonnet", timeout=120.0,
                        prev_io=prev_io_map.get(nid, ""), next_io=next_io_map.get(nid, ""),
                    )
                except Exception as e:  # pragma: no cover
                    b = f"<!-- LLM body generation failed: {e} -->"
                return nid, b

        bodies: dict = {}
        done = 0
        tasks = [asyncio.create_task(worker(n)) for n in nodes]
        try:
            for fut in asyncio.as_completed(tasks):
                nid, b = await fut
                bodies[nid] = b
                done += 1
                yield f"data: {json.dumps({'done_count': done, 'total': total}, ensure_ascii=False)}\n\n"
        except Exception as e:  # pragma: no cover
            for t in tasks:
                t.cancel()
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return
        content = _encode(fc.make_llm_body_provider(bodies))
        yield f"data: {json.dumps({'content': content}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(_gen(), media_type="text/event-stream")


# ══════════ Dashboard API ══════════

@app.get("/api/dashboard")
def dashboard():
    """Return normalized dashboard data — single endpoint for the entire UI."""
    projects_root = _projects_root()
    return collect_dashboard_data(projects_root=projects_root)


@app.get("/api/dashboard/claude-stack")
def dashboard_claude_stack(project: str = ""):
    """CLAUDE.md chain for one project. `project` is an abs path,
    '~'-path, or a bare name resolved under ~/projects/ then ~/Desktop/."""
    home = Path.home()
    if not project:
        target = Path.cwd()
    elif project.startswith("/") or project.startswith("~"):
        target = Path(project).expanduser()
    else:
        cand = home / "projects" / project
        target = cand if cand.exists() else home / "Desktop" / project
    return collect_claude_stack(str(target), home=home)


@app.get("/api/projects")
def list_projects():
    """List candidate project directories under the projects root.

    Deterministic (no LLM, 0 tokens). Returns every direct subdirectory except
    obvious non-projects (venvs, caches, archives, hidden dirs). The dashboard's
    project selector uses this as its single source of truth.
    """
    root = Path(_projects_root())
    out = []
    if root.is_dir():
        for item in sorted(root.iterdir()):
            if not item.is_dir():
                continue
            if item.name.startswith("."):
                continue
            if item.name in _PROJECT_EXCLUDE_DIRS:
                continue
            out.append({
                "name": item.name,
                "path": str(item),
                "has_claude_md": (item / "CLAUDE.md").is_file(),
                "has_claude_dir": (item / ".claude").is_dir(),
            })
    return {"projects": out}


# ══════════ Flow API ══════════

@app.get("/api/flows", response_model=list[FlowMeta])
def list_flows(include_single: bool = False, include_managed: bool = True):
    """List editable workflows parsed from the workspace.

    By default, 1-node flows (typically plugin-provided skills) are filtered
    out — they're not meaningful to edit as flows and are surfaced in the
    Dashboard's Skill list instead. Pass ?include_single=true to include them.

    Pass ?include_managed=false to drop entries whose source layer is "managed"
    (~/.claude/plugins/cache/ — plugin-installed skills/agents/commands). The
    settings-stack UI uses this to hide plugin-origin content entirely so the
    user only sees their own configuration.

    Direct access via GET /api/flows/{flow_id} always works regardless of
    node_count or layer.
    """
    result = []
    for f in _get_all_flows():
        node_count = len(f.get("nodes", []))
        if not include_single and node_count <= 1:
            continue
        source_layer = f.get("source", {}).get("layer")
        if not include_managed and source_layer == "managed":
            continue
        meta = f.get("meta") or {}
        source_path = f.get("source", {}).get("path")
        # kind 分類キャッシュを LLM 無しで覗く（0 トークン）。あれば「フロー化済み」扱い。
        kind_cached = peek_kind_cache(source_path) if source_path else None
        result.append(FlowMeta(
            id=f["id"],
            name=f["name"],
            category=f.get("category", "Custom Workflows"),
            description=f.get("description", ""),
            complexity=f.get("complexity", "Med"),
            node_count=node_count,
            edge_count=len(f.get("edges", [])),
            source_path=source_path,
            source_layer=source_layer,
            plugin_source=f.get("plugin_source"),
            skill_name=f.get("skill_name"),
            container_path=meta.get("container_path"),
            working_dir=meta.get("working_dir"),
            kind=(kind_cached.get("kind") if kind_cached else None),
            flowized=bool(kind_cached),
        ))
    return result

@app.get("/api/flows/{flow_id}")
def get_flow(flow_id: str):
    """Get full flow data with addresses on every node (+ kind classification)."""
    flow = _find_flow(flow_id)
    flow = attach_kind(flow)
    return enrich_nodes_with_addresses(flow)


# ══════════ Lazy on-demand flowize (async job) ══════════
# 各スキル/コマンドを「▶ フロー化」ボタンでオンデマンドにフロー化する。
#   1) LLM で kind 判定（content+version キャッシュ。ヒット時は 0 トークン）
#   2) フロー型 (kind 1/2) の skill だけ annotate(v3) → staging へ書く（live は無傷）
#   3) 完了/失敗を記録し、通知を1件積む
# POST は即返し、裏で asyncio タスクが走る（ブロックしない＝処理中も他ページ閲覧可）。
# ジョブ状態はプロセス内メモリ。再起動で消えるのは許容（キャッシュ済みなら
# /api/flows が flowized=True を返すので一覧側で「見る」状態は復元される）。
_flowize_jobs: dict[str, dict] = {}


def _flowize_view_for_kind(kind: Optional[int]) -> Optional[str]:
    """kind 1/2 → フロー図 ("flow")、kind 3/4 → カード ("card")。"""
    if kind is None:
        return None
    return "card" if kind >= 3 else "flow"


async def _flowize_one(flow_id: str, path: str, src_type: str, name: str, force: bool):
    """裏ジョブ本体。kind 判定（キャッシュ優先）→ フロー型 skill は staging へアノテート。
    LLM 呼び出しは kind キャッシュ miss 時のみ。アノテートは冪等（既に convention v1 なら skip）。
    """
    try:
        res = await classify_skill_kind_cached_async(path)
        kind = res.get("kind")
        if kind not in (1, 2, 3, 4):
            raise RuntimeError(f"kind 判定に失敗しました ({kind!r})")
        # フロー型 (kind 1/2) の skill のみ SKILL.md をアノテート → staging に保存。
        # command / kind 3/4 はアノテート不要（分類だけでフロー図/カード表示できる）。
        if src_type == "skill" and kind in (1, 2):
            try:
                from parser_convention import is_convention_v1
            except ImportError:
                from server.parser_convention import is_convention_v1  # type: ignore
            try:
                from annotator import annotate_skill_async
            except ImportError:
                from server.annotator import annotate_skill_async  # type: ignore
            already = False
            if not force:
                try:
                    if is_convention_v1(Path(path).read_text(encoding="utf-8")):
                        already = True
                    else:
                        staged = ws.live_to_staged(path)
                        if staged.is_file() and is_convention_v1(staged.read_text(encoding="utf-8")):
                            already = True
                except Exception:
                    already = False
            if not already:
                ann = await annotate_skill_async(path, dry_run=True, variant="v3")
                ws.write_file(path, ann.annotated_text)
                ws.save_annotation(path, ann.annotated_text)  # survives init()
        view = _flowize_view_for_kind(kind)
        _flowize_jobs[flow_id] = {"status": "done", "kind": kind, "view": view, "error": None}
        try:
            notifications_store.append({
                "kind": "flowize",
                "status": "success",
                "name": name,
                "detail": f"「{name}」のフロー化が完了しました。",
                "flowId": flow_id,
                "view": view,
                "flowKind": kind,
            })
        except Exception as e:
            logger.warning("flowize notification failed for %s: %s", flow_id, e)
    except Exception as e:
        logger.warning("flowize job failed for %s: %s", flow_id, e)
        _flowize_jobs[flow_id] = {"status": "failed", "kind": None, "view": None, "error": str(e)}
        try:
            notifications_store.append({
                "kind": "flowize",
                "status": "error",
                "name": name,
                "detail": f"「{name}」のフロー化に失敗しました: {e}",
                "flowId": flow_id,
            })
        except Exception:
            pass


@app.post("/api/flows/{flow_id}/flowize")
async def flowize_flow(flow_id: str, req: Request):
    """単件フロー化ジョブを起動（非同期）。同期処理せず即 {job_id, status} を返す。"""
    force = False
    try:
        body = await req.json()
        if isinstance(body, dict) and isinstance(body.get("force"), bool):
            force = body["force"]
    except Exception:
        pass
    flow = _find_flow(flow_id)  # 見つからなければ 404
    src = flow.get("source") or {}
    layer = src.get("layer")
    path = src.get("path")
    src_type = src.get("type") or "skill"
    if layer == "managed":
        raise HTTPException(400, "managed（配布）スキルは read-only のためフロー化対象外です")
    if not path or not Path(path).exists():
        raise HTTPException(400, f"source path が見つかりません: {flow_id}")
    # 既に走行中なら二重起動しない（冪等）
    cur = _flowize_jobs.get(flow_id)
    if cur and cur.get("status") == "running":
        return {"job_id": flow_id, "status": "running"}
    _flowize_jobs[flow_id] = {"status": "running", "kind": None, "view": None, "error": None}
    asyncio.create_task(_flowize_one(flow_id, path, src_type, flow.get("name", flow_id), force))
    return {"job_id": flow_id, "status": "running"}


@app.get("/api/flowize/status")
def flowize_status(ids: str = ""):
    """走行中/完了ジョブの状態をまとめて返す。未起動・未知 id は idle。

    返り: {"jobs": {"<id>": {"status": "idle|running|done|failed",
                              "kind": 1-4|null, "view": "flow|card"|null, "error": null}}}
    フロントはこれをバッジ更新（ポーリング）に使う。
    """
    out = {}
    for raw in ids.split(","):
        fid = raw.strip()
        if not fid:
            continue
        job = _flowize_jobs.get(fid)
        if job:
            out[fid] = {
                "status": job.get("status", "idle"),
                "kind": job.get("kind"),
                "view": job.get("view"),
                "error": job.get("error"),
            }
        else:
            out[fid] = {"status": "idle", "kind": None, "view": None, "error": None}
    return {"jobs": out}


@app.get("/api/address/{flow_id}/{node_id}")
def resolve_address(flow_id: str, node_id: str):
    """Resolve an address to its full node data.
    Usage: GET /api/address/x-autopilot/n4
    """
    flow = _find_flow(flow_id)
    for node in flow.get("nodes", []):
        if node["id"] == node_id:
            node["address"] = make_address(flow_id, node_id)
            node["_flow_name"] = flow["name"]
            # find incoming/outgoing edges
            node["_incoming"] = [e for e in flow["edges"] if e["to"] == node_id]
            node["_outgoing"] = [e for e in flow["edges"] if e["from"] == node_id]
            return node
    raise HTTPException(404, f"Node '{node_id}' not found in flow '{flow_id}'")

@app.patch("/api/flows/{flow_id}/nodes/{node_id}")
def update_node(flow_id: str, node_id: str, update: NodeUpdate):
    """Update a node's fields (title, desc, prompt, config, etc.)."""
    with _flow_lock(flow_id):
        flow = _find_flow(flow_id)
        for node in flow["nodes"]:
            if node["id"] == node_id:
                for field, val in update.dict(exclude_none=True).items():
                    node[field] = val
                _save_flow(flow_id, flow)
                node["address"] = make_address(flow_id, node_id)
                return {"ok": True, "node": node}
    raise HTTPException(404, f"Node '{node_id}' not found")

@app.post("/api/flows/{flow_id}/nodes")
def insert_node(flow_id: str, body: NodeInsert):
    """Insert a new node after the specified node."""
    with _flow_lock(flow_id):
        flow = _find_flow(flow_id)

        # find the after_node
        after_idx = None
        for i, n in enumerate(flow["nodes"]):
            if n["id"] == body.after_node:
                after_idx = i
                break
        if after_idx is None:
            raise HTTPException(404, f"Node '{body.after_node}' not found")

        # generate new node id
        existing_ids = {n["id"] for n in flow["nodes"]}
        counter = len(flow["nodes"]) + 1
        while f"n{counter}" in existing_ids:
            counter += 1
        new_id = f"n{counter}"

        after_node = flow["nodes"][after_idx]
        new_node = {
            "id": new_id,
            "type": body.type,
            "title": body.title,
            "subtitle": body.subtitle or "",
            "desc": body.desc or "",
            "prompt": body.prompt or "",
            "config": body.config,
            "x": after_node["x"],
            "y": after_node["y"] + 140,
            "input": {},
            "output": {},
            "duration": "—",
            "depends": [after_node["id"]],
        }

        # shift all nodes below down
        for n in flow["nodes"]:
            if n["y"] > after_node["y"]:
                n["y"] += 140

        # insert node
        flow["nodes"].insert(after_idx + 1, new_node)

        # rewire edges: edges FROM after_node now go FROM new_node
        new_edges = []
        for e in flow["edges"]:
            if e["from"] == after_node["id"]:
                new_edges.append({"from": new_id, "to": e["to"], **{k: v for k, v in e.items() if k not in ("from", "to")}})
            else:
                new_edges.append(e)
        # add edge from after_node to new_node
        new_edges.append({"from": after_node["id"], "to": new_id})
        flow["edges"] = new_edges

        _save_flow(flow_id, flow)
        new_node["address"] = make_address(flow_id, new_id)
        return {"ok": True, "node": new_node, "address": new_node["address"]}

@app.delete("/api/flows/{flow_id}/nodes/{node_id}")
def delete_node(flow_id: str, node_id: str):
    """Remove a node and reconnect edges around it."""
    with _flow_lock(flow_id):
        flow = _find_flow(flow_id)
        node = None
        node_idx = None
        for i, n in enumerate(flow["nodes"]):
            if n["id"] == node_id:
                node = n
                node_idx = i
                break
        if node is None:
            raise HTTPException(404, f"Node '{node_id}' not found")

        # find incoming/outgoing
        incoming = [e["from"] for e in flow["edges"] if e["to"] == node_id]
        outgoing = [e["to"] for e in flow["edges"] if e["from"] == node_id]

        # remove all edges involving this node
        flow["edges"] = [e for e in flow["edges"] if e["from"] != node_id and e["to"] != node_id]

        # reconnect: each incoming -> each outgoing
        for src in incoming:
            for dst in outgoing:
                flow["edges"].append({"from": src, "to": dst})

        # remove node
        flow["nodes"].pop(node_idx)

        _save_flow(flow_id, flow)
        return {"ok": True, "removed": node_id}


# ══════════ Chat API ══════════

def build_flow_context(flow_id: Optional[str], node_id: Optional[str]) -> str:
    """Build system context from current workflow/node state."""
    parts = []
    if flow_id:
        try:
            flow = _find_flow(flow_id)
            parts.append(f"## Current Workflow: {flow['name']} ({flow_id})")
            parts.append(f"Description: {flow.get('description', '')}")
            parts.append(f"Nodes ({len(flow['nodes'])}):")
            for n in flow["nodes"]:
                addr = make_address(flow_id, n["id"])
                parts.append(f"  - [{addr}] {n['title']} ({n['type']}): {n.get('desc', '')[:80]}")
            parts.append(f"Edges: {json.dumps(flow['edges'], ensure_ascii=False)}")
            if node_id:
                for n in flow["nodes"]:
                    if n["id"] == node_id:
                        parts.append(f"\n## Selected Node: {make_address(flow_id, node_id)}")
                        parts.append(f"Title: {n['title']}")
                        parts.append(f"Type: {n['type']}")
                        parts.append(f"Description: {n.get('desc', '')}")
                        if n.get("prompt"):
                            parts.append(f"Prompt: {n['prompt']}")
                        if n.get("config"):
                            parts.append(f"Config: {json.dumps(n['config'], ensure_ascii=False)}")
                        if n.get("input"):
                            parts.append(f"Input: {json.dumps(n['input'], ensure_ascii=False)}")
                        if n.get("output"):
                            parts.append(f"Output: {json.dumps(n['output'], ensure_ascii=False)}")
                        break
        except Exception:
            pass
    return "\n".join(parts)

# 全チャット共通の先頭規則。ユーザーの ~/.claude（superpowers の SessionStart フック等）が
# claude -p サブプロセスにも効き、ツール無効(--tools "")なのに「スキルを確認します」+<function_calls>
# 記法を本文に吐く問題を抑える。全 full_prompt の先頭に差し込む。
NO_TOOLS_PREFIX = """（出力規則・厳守）この対話ではツールもスキルも使えません。
- 「スキルを確認します」「関連するスキルがないか確認します」等の前置きを書かない。
- <function_calls> / <invoke> / <parameter> といった呼び出し記法を一切出力しない。
- 前置き・断り無しで、すぐ本題から答える。
"""

# フロー構築チャット用。Read（読み取り専用）だけは使える設定で起動するので、
# 「ツールは使えない」ではなく「Read だけ使える」と伝える。事前許可（--allowedTools Read）
# 済みなので権限確認でループしない。スキルは無効化（--disable-slash-commands）。
READ_ONLY_PREFIX = """（出力規則・厳守）この対話で使える道具は Read（読み取り専用）だけです。
- プロジェクトの実ファイル（構成・中身）を確かめたいときだけ Read を使ってよい。書き込み・送信・コマンド実行はできない。
- 「スキルを確認します」等の前置きや、<function_calls> / <invoke> / <parameter> の呼び出し記法を本文に書かない。
- Read を使うとき以外は前置き無しで、すぐ本題から答える。憶測でファイル内容をでっち上げない（見たいなら Read する）。
"""

CHAT_SYSTEM_PREFIX = """あなたはFlow Inspector内のAIアシスタントです。Claude Codeのワークフロー（スキル、フック、MCP、サブエージェント）の設計・改善について相談に乗ります。

ルール:
- ノードアドレス（例: flow:x-autopilot/n3）を使って具体的に参照
- ユーザーの言語に合わせて回答
- ワークフローの最適化、プロンプト改善、新ノード追加の提案
- 簡潔に、しかし正確に回答する
"""

# ダッシュボード右下の「ダッシュボードアシスタント」専用。
# このマシンの Claude Code 設定（スキル/コマンド/サブエージェント/フック/MCP/プロジェクト）の
# スナップショットを context に渡し、その範囲だけで質問に答えさせる。
DASHBOARD_SYSTEM = """あなたはFlow Inspectorの「ダッシュボードアシスタント」です。
ユーザーのマシンに入っている Claude Code の設定（スキル・スラッシュコマンド・サブエージェント・フック・MCPサーバー・プロジェクト）について質問に答えます。
下の「## 現在の設定スナップショット」が、あなたが参照できる唯一の事実です。

## ルール
- 回答は下のスナップショットに**書かれている内容だけ**に基づくこと。推測で機能やスキルをでっち上げない。
- 該当するものがあれば、名前・種別（スキル/MCP/フック/コマンド/サブエージェント）・どのレイヤー（user / project 等）かを添えて具体的に答える。
- 該当が無ければ「設定の中には見つからない」と正直に言い、近いものがあれば候補として挙げる。
- **プロジェクト/フォルダの中身を聞かれたとき**: 下に「## プロジェクト「X」の中身」セクションがあれば、
  そのフォルダ構成・主要ファイル抜粋を読んで「どんなプロジェクトか・何が入っているか・何をするものか」を具体的に説明する。
  セクションが無い（中身が取得できなかった）ときだけ「ダッシュボードの階層ビューで開いて確認してください」と案内する。
- スキル/コマンド等のメタ一覧は名前・説明・件数のみで、各ファイルの全文は含まれない。全文が要るときはカードで開くよう案内。
- ユーザーの言語（日本語など）に合わせ、簡潔に。箇条書きを活用する。前置きは短く。
"""


def _resolve_project_target(focus_msg: str, project_hint: str, projects_root: str) -> Optional[str]:
    """ダッシュボードチャットで「中身を詳しく見せる」プロジェクトの絶対パスを決める。

    優先順: (1) ユーザーの発言に出てくるプロジェクト名（projects_root 直下のディレクトリ名に
    一致するもの。最長一致を採用） → (2) 明示ヒント（選択中プロジェクトの名前 or パス）。
    いずれも projects_root 配下に限定。該当なしは None。
    """
    root = Path(projects_root)
    if focus_msg and root.is_dir():
        try:
            names = [d.name for d in root.iterdir()
                     if d.is_dir() and not d.name.startswith(".") and d.name not in _PROJECT_EXCLUDE_DIRS]
        except Exception:
            names = []
        hits = sorted((n for n in names if n and n in focus_msg), key=len, reverse=True)
        if hits:
            return str(root / hits[0])
    if project_hint:
        p = Path(project_hint).expanduser()
        if not p.is_absolute():
            p = root / project_hint
        try:
            if p.is_dir():
                return str(p)
        except Exception:
            pass
    return None


def build_dashboard_context(focus_msg: str = "", project_hint: str = "") -> str:
    """ダッシュボードチャット用: このマシンの Claude Code 設定スナップショットを文字列化。

    /api/dashboard と同じ collect_dashboard_data を使い、スキル/コマンド/サブエージェント/
    フック/MCP/プロジェクトの一覧（名前・説明・レイヤー）を LLM コンテキストに整形する。
    一覧は本文（ファイル中身）を含めず件数とメタだけ（軽量）。ただし focus_msg / project_hint で
    特定プロジェクトが指せた場合のみ、そのフォルダのディレクトリ構成＋主要ファイル抜粋を追記する。
    """
    try:
        data = collect_dashboard_data(projects_root=_projects_root())
    except Exception as e:
        logger.warning("build_dashboard_context: collect_dashboard_data failed: %s", e)
        return "## 現在の設定スナップショット\n（設定の読み取りに失敗しました）"

    def _clip(s, n=100):
        s = (s or "").replace("\n", " ").strip()
        return s[:n]

    parts = ["## 現在の設定スナップショット"]

    skills = data.get("skills") or []
    parts.append(f"\n### スキル ({len(skills)})")
    for s in skills:
        loc = s.get("plugin_source") or s.get("working_dir") or s.get("layer") or ""
        parts.append(f"- {s.get('name','')} [{s.get('layer','')}{('/'+loc) if loc and loc != s.get('layer') else ''}]: {_clip(s.get('description') or s.get('desc'))}")

    commands = data.get("commands") or []
    parts.append(f"\n### スラッシュコマンド ({len(commands)})")
    for c in commands:
        parts.append(f"- /{c.get('name','')} [{c.get('layer','')}]: {_clip(c.get('description') or c.get('desc'))}")

    agents = data.get("agents") or []
    parts.append(f"\n### サブエージェント ({len(agents)})")
    for a in agents:
        parts.append(f"- {a.get('name','')} [{a.get('layer','')}]: {_clip(a.get('description') or a.get('desc'))}")

    hooks = data.get("hooks") or []
    parts.append(f"\n### フック ({len(hooks)})")
    for h in hooks:
        parts.append(f"- {h.get('type') or h.get('event','')} matcher={h.get('matcher','')} [{h.get('layer','')}]: {_clip(h.get('command') or h.get('desc'))}")

    mcp = data.get("mcp_servers") or []
    parts.append(f"\n### MCPサーバー ({len(mcp)})")
    for m in mcp:
        tools = m.get("tools")
        tools_s = ", ".join(tools) if isinstance(tools, list) else _clip(str(tools or ""))
        parts.append(f"- {m.get('name','')} [{m.get('layer','')}]: {_clip(tools_s)}")

    projects = data.get("projects") or []
    if projects:
        parts.append(f"\n### プロジェクト ({len(projects)})")
        for p in projects:
            if isinstance(p, dict):
                name = p.get("name") or p.get("path") or ""
                counts = []
                for k in ("skills", "commands", "agents", "hooks"):
                    v = p.get(f"{k}_count")
                    if isinstance(v, int) and v:
                        counts.append(f"{k}={v}")
                parts.append(f"- {name}" + (f" ({', '.join(counts)})" if counts else ""))
            else:
                parts.append(f"- {p}")

    # 特定プロジェクトが指せたら、そのフォルダの中身（構成＋主要ファイル抜粋）を追記する。
    target = _resolve_project_target(focus_msg, project_hint, _projects_root())
    if target:
        try:
            detail = gather_project_context(target, _projects_root(), deep=False)
        except Exception as e:
            logger.warning("build_dashboard_context: gather_project_context(%s) failed: %s", target, e)
            detail = ""
        if detail:
            parts.append(f"\n## プロジェクト「{Path(target).name}」の中身（フォルダ構成・主要ファイル抜粋）")
            parts.append(detail)

    return "\n".join(parts)

# ノード詳細パネルの「💬 Chat」タブ専用。編集ではなく "現状把握" — このフロー/ノードが
# 何をするかを説明する。修正要望が出たら、コピペで使える修正プロンプト(edit_prompt)を1個出すだけ。
NODE_EXPLAIN_SYSTEM = """あなたはFlow Inspectorの「フロー説明アシスタント」です。
ユーザーは保存済みのスキル/コマンドのフローを開き、内容を理解しようとしています（編集ではなく現状把握が目的）。
下の "Current Workflow" がフロー全体、"Selected Node" があれば今ユーザーが見ているノード、"Source" がこのフローの実体（種別とファイルパス）です。
あなたの役割は、このフロー/ノードが「いつ・どんな役割で・何を入力に・何を出力に」動くのかを分かりやすく説明することです。

## やること（説明に徹する）
- ノードが選択されているときは、そのノードを中心に説明する：
  - 役割（このステップは何をするか）
  - 入力（何を受け取るか）/ 出力（何を返すか）
  - フロー全体のどこに位置し、いつ・どんな条件で動くか（前後のノード・トリガー・分岐）
- ノードが選択されていないときは、フロー全体（このスキル/コマンドが何をするものか・起動条件・全体の流れ・最終的な成果物）を説明する。
- ユーザーの質問（「これ何してる？」「入力は？」「いつ動く？」等）に、フローの実際の中身（desc/config/edges）に基づいて具体的に答える。
- まず結論（このノード/フローは何者か）から。箇条書きを活用し簡潔に。

## 改善提案（副次的・任意）
- 明らかな改善余地（抜け・冗長・宛先がプレースホルダのまま等）に気づいたら「ここはこうすると良いかも」と短く提案してよい。
- ただし主目的は説明。聞かれていなければ最後に1〜2点添える程度に留める。

## 修正したいと言われたら（このタブでは直接いじらない）
- ユーザーが「ここをこう直したい」と修正を望んだら、あなたは編集せず、コピペで使える修正プロンプトを **1個だけ** edit_prompt フェンスで出す。
- そのプロンプトには必ず次を含め、Claude Code にそのまま貼り付けて実行できる自己完結文にする：
  - スキル/コマンドの名前と、ファイルパス（下の "Source" の path）
  - 対象のノード/箇所（どのステップか）
  - 現状（今どうなっているか）
  - 望む変更（何をどう変えたいか）
- ブロックの直後に一言：「下の『コピー』ボタンで、Claude Code か『編集』チャットに貼り付けて実行してください。」
- 直し方が複数あり得るときは、まず1〜2問で意図を確認してから出す。

修正プロンプトの形式（この形式で1個だけ）:

```edit_prompt
スキル「<名前>」(<Source の path>) を修正してください。
対象: <どのノード/箇所か>。
現状: <今どうなっているか>。
変更したいこと: <何をどう変えたいか>。
（このプロンプトはClaude Code、またはFlow Inspectorの編集チャットに貼り付けて実行してください）
```

## やらないこと
- 設定値を埋める対話や、確定ブロック（node_settings 等）の出力はしない（このタブは編集用ではない）。
  実際に編集したいときは「右パネルの『設定』タブ、または『AIで設定を生成』で行えます」と案内する。
- コンテキスト（下の情報）に無いことは推測で断定せず「未設定/未定義」と正直に言う。

## ルール
- ユーザーの言語（日本語など）に合わせ、簡潔に。専門用語（matcher, frontmatter 等）は噛み砕く。
"""

def build_board_context(board: dict) -> str:
    """flow-build 用: クライアントが送る現在ボード (boardToWorkflow 済み flow JSON) からコンテキストを生成。

    AI が既存ノードを id で参照できるよう、ノード一覧 (id/type/title/desc/config) とエッジを列挙する。
    未保存・空ボードもそのまま受ける。
    """
    board = board or {}
    parts = ["## 現在のボード（フロー）"]
    parts.append(f"名前: {board.get('name') or '(無名プラン)'}")
    if board.get("description"):
        parts.append(f"目的: {board['description']}")
    nodes = board.get("nodes") or []
    parts.append(f"\nノード ({len(nodes)}):")
    if not nodes:
        parts.append("  （まだノードがありません。0から作ります）")
    _skip = {"desc", "input", "output", "depends", "items", "edges", "fnId", "custom", "fnColor", "subflow"}
    for n in nodes:
        meta = n.get("meta") or {}
        cfg = {k: v for k, v in meta.items() if k not in _skip}
        desc = (n.get("desc") or meta.get("desc") or "")
        if isinstance(desc, str):
            desc = desc[:80]
        parts.append(
            f"  - id={n.get('id')} type={n.get('type')} title={n.get('title', '')} "
            f"desc={desc} config={json.dumps(cfg, ensure_ascii=False)}"
        )
    edges = board.get("edges") or []
    parts.append(f"\nエッジ ({len(edges)}):")
    if not edges:
        parts.append("  （まだ接続がありません）")
    for e in edges:
        label = f" ({e['label']})" if e.get("label") else ""
        parts.append(f"  - {e.get('from')} -> {e.get('to')}{label}")
    return "\n".join(parts)

def build_source_line(flow_id) -> str:
    """説明チャット用: フローの実体（名前・種別・ファイルパス）を context に渡す。
    生成する修正プロンプト(edit_prompt)に skill名+パスを埋め込めるようにするため。"""
    if not flow_id:
        return ""
    try:
        flow = _find_flow(flow_id)
    except Exception:
        return ""
    src = flow.get("source") or {}
    path = src.get("path") or ""
    stype = src.get("type") or ""
    name = flow.get("name") or flow_id
    if not path and not stype:
        return ""
    return f"\n\n## Source\nname: {name}\ntype: {stype}\npath: {path or '(不明)'}"

def build_required_section(required_status) -> str:
    """flow-build 用: クライアントが算出したノード別「未入力の必須項目」を context に整形。

    フロントの requiredFieldsFor(TYPE_SPECS/PART_FIELDS 解決) 由来。secret/authoringOnly は
    フロント側で除外済み。未入力が無ければ空文字 (セクションを足さない)。
    """
    if not required_status or not isinstance(required_status, list):
        return ""
    lines = ["", "## 未入力の必須項目（推測で埋めず、ユーザーに確認する）"]
    any_node = False
    for ns in required_status:
        if not isinstance(ns, dict):
            continue
        missing = ns.get("missing") or []
        if not missing:
            continue
        any_node = True
        lines.append(f"- ノード id={ns.get('node_id')}「{ns.get('label', '')}」({ns.get('nodeType', '')}):")
        for m in missing:
            if not isinstance(m, dict):
                continue
            opts = m.get("options")
            opt_s = f"（選択肢: {' / '.join(map(str, opts))}）" if isinstance(opts, list) and opts else ""
            desc = m.get("desc") or ""
            lines.append(
                f"    - {m.get('label', m.get('key', ''))} [key={m.get('key', '')}]{opt_s}"
                + (f" — {desc}" if desc else "")
            )
    return "\n".join(lines) if any_node else ""

# プランニングホワイトボードのフロー構築チャット専用。ボード全体を対象に、
# ノード追加 / 設定 / エッジ接続 / 削除の「操作プラン」(flow_actions) を提案させる。
FLOW_BUILD_SYSTEM = """あなたはFlow Inspectorの「フロー構築アシスタント」です。
ユーザーはプランニングホワイトボード（フロー図）を、あなたと会話しながら0から組み立てています。
あなたの役割は、ユーザーの要望を「ボードの操作」に翻訳して提案することです。実際に反映するのは
ユーザーが提案カードの『適用』ボタンを押したとき（あなたが直接書き換えるわけではない）。

## 進め方
- ユーザーの言語（日本語など）に合わせ、簡潔に。
- まず1〜2文で「何をするか」を説明し、確定できる操作があるときだけ flow_actions ブロックを1つ出す。
- flow_actions を出す直前に必ず一言：「下の『適用』ボタンでボードに反映できます。」
- 必須情報が足りないときは flow_actions を出さず、1〜2問だけ質問する。完璧を求めて質問を続けすぎない。
- 破壊的操作（remove_node / remove_edge）は、ユーザーが明示的に「消して/外して」等と言ったときだけ出す。

## 実ファイルを見る（Read）
- このフローが扱う対象（プロジェクトのコードや構成）を**実際に確認したいときは Read（読み取り専用）で見てよい**。憶測で「app.py はこうだろう」と決めつけない。
- 例：「このリポジトリの構成に合わせて」「既存の○○に合わせて code ノードを書いて」と言われたら、関連ファイルを Read してから具体化する。どこにあるか不明なら、まずディレクトリを Read で辿る。
- 読めるのは projects_root 配下のみ。書き込み・実行はできない。確認は必要な範囲だけ（毎回むやみに走査しない）。

## 必須項目の確認（重要）
- 下に「## 未入力の必須項目」が来ているときは、そこに挙がった項目を **推測やプレースホルダで埋めない**。ユーザーに「ここ（項目名）はどう入れましょう？」と確認する。
- options（選択肢）がある項目は、選択肢を併記して聞く（例：「ハンドラー種別は command / prompt / agent / http / mcp_tool のどれにしますか？」）。
- 一度に **1〜2項目ずつ**。ユーザーが答えたら、その値を set_settings で該当ノード（node_id）の config に反映する（[key=...] のキー名をそのまま使う）。
- 未入力の必須項目が残っている間は、それを優先して確認する。任意項目は従来どおり聞きすぎない。
- 種別を選ぶと次の必須が現れる項目（例：フックのハンドラー種別）は、まず種別を聞き、決まってから次の必須へ進む。

## 本文を埋める（重要）
必須項目が埋まったノードは、そのステップの SKILL.md 本文を desc に書いて set_settings で反映する。
会話が一巡したら、全ノードの本文が「読んで使える」レベルになっているのが目標。
- desc は Markdown 本文。そのステップが何を・どうやるかを具体的に書く（短い言い換えで終わらせない）。
- code ノードは **完全な実スクリプトを ```bash / ```python 等のコードブロックで desc に書く**（一行コマンドで済ませない。実際に動く中身を書く）。同じコードは config.command にも入れる（実行・構造用）。
- desc に書くのは本文のみ。見出し（## …）や <!-- … --> マーカーは入れない（エンコーダが付ける）。
- 1ノードずつ。set_settings で desc（＋必要なら config）を出し、「下の『適用』ボタンで反映できます。」を添える。
- 本文は具体的だが冗長すぎないように。前後ステップの入出力と整合させる。
- ユーザーが内容を直したいと言えば、その desc を書き直して再度 set_settings する。

### 情報が足りないなら、埋め草を書かず聞く（最重要）
本文（特にコード）を具体的に書くだけの情報がそのノードに無いときは、**推測やそれっぽいダミーで埋めない**。
何が分かれば書けるかを 1〜2問で尋ね、答えが揃ってから desc を書く。揃わない間は set_settings を出さず質問だけ返す。
- code: 「ここは具体的に何を読んで何を出力しますか? 実際のコマンド/手順は?」
- mcp: 宛先 / 検索クエリ / 引数（上の必須項目の確認と統合してよい）
- think / subagent: 入力・出力・守るべき判断基準
スカスカの本文や `# TODO` 的なプレースホルダを置くくらいなら、必ず質問する。

## スキル化 / コマンド化（確定）
ユーザーが確定を求めたら（「スキルにして」「コマンドにして」「保存して」等）：
1. まず全ノードの本文が埋まっているか確認する（未充足・情報不足があれば上記のとおり質問して埋める）。本文が薄いうちは確定しない。
2. **保存形式を必ず確認する**：flow_finalize を出す前に、「これは『スキル』『コマンド(/名前で呼ぶ)』どちらで保存しますか?」と一度だけ聞く。ユーザーが既に言っていても、念のため一言で確認してから進める（勝手に確定しない）。
   - スキル＝Claudeが文脈に応じて自動的に呼ぶ再利用フロー。コマンド＝`/名前` で明示的に呼び出す。
3. 形式が決まったら、返信の最後に **1つだけ** 確定ブロックを出す（as は確認した形式）：

```flow_finalize
{"as":"skill","name":"<英小文字とハイフンの名前>","description":"<いつ使うかの1文>"}
```
（コマンドにするなら "as":"command"）

4. 直前に一言「この内容で{スキル/コマンド}化します（公開待ちに保存。本番にはまだ出ません）」と添える。
- name は英小文字/数字/ハイフン推奨。description は「いつ使うか」を1文で。
- 本文がまだ薄い／情報不足のノードがあるうちは flow_finalize を出さず、先に本文を埋める。
- 保存はフロント側で決定論チェック（孤立/必須未入力等）を通り、致命的な不足があれば止まる。

## ノード参照のルール
- 既存ノードは下の「現在のボード」に並ぶ id で参照する。
- 新規ノードは自分で一時ref（"new1", "new2" …）を付け、同じブロック内の edge の from/to でもその ref を使う。

## nodeType（UIパレットに準拠）
parent / subagent / mcp / hook / code / user / decision / skill / think

## nodeType別 config キー（この通りのキー名で埋める）
- code: config.tool（bash/python/node）, desc=実行する具体的な内容
- mcp: config.server（例 "gmail"）, config.action（tool/resource/prompt）, config.tool_name, config.params（引数をJSON文字列で）
- hook: config.hook_type（PreToolUse/PostToolUse/Notification 等）, config.matcher, config.command
- subagent: config.agent（サブエージェント名）, config.prompt, desc=委任タスク
- skill: config.skill_name, config.request_prompt
- decision: config.condition（質問形の判断条件）
- think / user: desc を中心に

## 操作の形式（この形式以外で操作を提示しない）
確定する操作があるときだけ、返信の最後に1つだけ出す：

```flow_actions
[
  {"op":"add_node","ref":"new1","nodeType":"mcp","title":"メールを調べる","subtitle":"Gmail","desc":"受信メールを検索する","config":{"server":"gmail","action":"tool","tool_name":"search_messages"}},
  {"op":"set_settings","node":"<既存ノードのid>","desc":"…","config":{"command":"…"}},
  {"op":"add_edge","from":"new1","to":"<既存id>","label":""},
  {"op":"reconnect_edge","from":"a","to":"b","new_to":"new1"},
  {"op":"remove_node","node":"<既存id>"},
  {"op":"remove_edge","from":"a","to":"b"},
  {"op":"auto_layout","direction":"vertical"},
  {"op":"move_node","node":"<既存id>","x":600,"y":300}
]
```

- op は add_node / set_settings / add_edge / reconnect_edge / remove_node / remove_edge / auto_layout / move_node のいずれか。
- add_node の title/nodeType は必須。config は分かる範囲で具体的に（プレースホルダのままにしない）。
- reconnect_edge は from→to の既存エッジを new_from/new_to で張り替える（指定した側だけ変更）。

## レイアウト（位置）操作
ユーザーが「整列して」「並べ直して」「位置がぐちゃぐちゃ」「見やすくして」等と言ったら、位置を動かせる：
- `auto_layout`: エッジの流れから階層を判定し、ノードを格子状に自動整列する。`direction` は "vertical"（上→下、既定）か "horizontal"（左→右）。**まず基本はこれを使う。** ノードを動かして並びを整えたい時はだいたいこれ1つで足りる。
- `move_node`: 特定ノードを1つだけ動かす。`x`/`y`（キャンバス座標、左上原点・px）を指定。微調整や「これだけ右へ」用。
- add_node で新規ノードを足したあと一緒に並びを整えたいときは、最後に `auto_layout` を足してよい。
- 位置操作は非破壊（undoで戻せる）なので、明示要求があれば気軽に出してよい。確定値で出すこと（プレースホルダ座標にしない）。

- まだ確定できないときは flow_actions を出さず、会話を続ける。
"""

# プランニングのフローを「スキルとして保存」する前の意味レビュー専用。
# 構造的な未入力/孤立はクライアント側で別途検出するので、ここは意味的な指摘に集中。
FLOW_REVIEW_SYSTEM = """あなたはFlow Inspectorの「フローレビュー」アシスタントです。
ユーザーは下の「現在のボード（フロー）」をスキルとして保存しようとしています。
保存前に、フロー設計上の意味的な問題・不足を簡潔に指摘してください。

## すでに機械チェック済み（重複指摘しない）
次は決定論チェックが別表示するので、あなたは繰り返さない：
- 孤立ノード / ゴールが複数 / 入口（トリガー・親）の欠如
- 必須項目の未入力（**MCPの宛先＝Gmailアカウント/検索クエリ・Slackチャンネル等を含む**）
- MCPサーバーが未設定（.mcp.json/settings に無い）
※下に「## すでに機械チェック済み」セクションがあれば、その項目は再掲しない。

## あなたが見る観点（意味的・機械チェックでは拾えないもの）
- 入口/トリガーは妥当か（何をきっかけに動くか明確か）
- ゴールは1つに定まっているか（成果物が二股になっていないか）
- ステップの繋がり・順番に飛躍や欠落はないか
- ボードの目的（名前）と内容がずれていないか（例: 名前は資料作成なのにメール送信が混ざる）
- 余計／重複したノードはないか
- **技術的には埋まっているがプレースホルダ/例のまま・誤りの宛先**（例: チャンネルが `#general` のまま、宛先が `tanaka@example.com` の例のまま、Gmailクエリが例のまま）。「空」チェックでは拾えないのでここで必ず指摘する
- 宛先とフローの意図の不一致（例: 「経理部に通知」なのに送信先が個人DM）

## 出力（この形式のみ）
前置きは1〜2文。指摘があるときだけ、返信の最後に1つ出す：

```review
[
  {"title": "短い見出し", "detail": "なぜ問題か・どう直すか（1文）"}
]
```

- ここでは**意味的**な指摘に集中する（上記「機械チェック済み」は再掲しない）。
- 問題が無ければ `[]`（空配列）を出す。
"""

def build_skill_context(board: dict) -> str:
    """skill-discuss 用: 保存した SKILL.md を前提として共有するコンテキスト。"""
    board = board or {}
    parts = ["## 保存したスキル (SKILL.md)"]
    if board.get("skill_name"):
        parts.append(f"名前: {board['skill_name']}")
    if board.get("skill_path"):
        parts.append(f"パス: {board['skill_path']}")
    parts.append("")
    parts.append(str(board.get("skill_content") or "(本文なし)"))
    return "\n".join(parts)

def build_claude_md_context(board: dict) -> str:
    board = board or {}
    path = board.get("project_path") or ""
    existing = board.get("existing_content", "")
    # project_summary is the auto-gathered, self-describing summary (tree + key
    # file snippets); tree_summary is kept as a fallback for older callers.
    summary = board.get("project_summary") or board.get("tree_summary") or ""
    parts = []
    if path:
        parts.append(f"対象プロジェクト: {path}")
    if summary:
        parts.append(summary)
    if existing:
        parts.append(f"既存の CLAUDE.md:\n{existing}")
    else:
        parts.append("既存の CLAUDE.md: なし（新規作成）")
    return "\n\n".join(parts)

# 保存直後の「前提共有チャット」専用。保存した SKILL.md を前提に、使い方/調整の相談に乗る。
SKILL_DISCUSS_SYSTEM = """あなたはFlow Inspectorで今しがた保存された「スキル」について相談に乗るアシスタントです。
下の "保存したスキル (SKILL.md)" がその全文で、どんなフローで・どう使うものかが書かれています。
これを前提として共有した上で、ユーザーと会話してください。

## 進め方
- 最初の発話では、このスキルが「どんな流れで・何に使えるか」を2〜3文で要約する。
- 以降はユーザーの質問（使い方 / 呼び出し方 / 調整 / 改善）に、SKILL.md の内容を踏まえて具体的に答える。
- ユーザーの言語に合わせ、簡潔に。専門用語は噛み砕く。
"""

CLAUDE_MD_SYSTEM = """あなたは Claude Code の「CLAUDE.md 作成アシスタント」です。CLAUDE.md は
対象スコープで Claude Code が毎セッション最初に読み込む指示書。あなたは"質問駆動"で、ユーザーに
1問ずつ尋ねながら CLAUDE.md を一緒に作ります。

## 内容は2種類に分かれる
- A=コードから分かる（ビルド/テスト/実行コマンド・ディレクトリ構成・スタック）。下に渡される
  「プロジェクト情報」から自分で把握する。A はユーザーに聞かない。
- B=コードに無く、ユーザーにしか分からない（このプロジェクトの目的/対象、チーム作法、
  「触るな・本番注意」等の禁則、経験的な落とし穴、linter で強制していない好みの規約）。
  B を引き出すために質問する。

※ この A/B はあなたの内部整理用。ユーザーへの発話では「A相当」「B（ユーザーにしか分からない部分）」
  などの内部ラベル・用語を **絶対に出さない**。自然な言葉で書く（例：「ここまで分かったこと」「確認したいこと」）。

## 進め方（重要・ここが核心）
1. 最初の発話：渡された情報から把握した A を2〜4行で要約提示する（「ここまでは分かりました」）。
   その上で、B を埋める質問を **1つだけ** する。
2. 以降もユーザーの回答を踏まえ、**1問ずつ** 深掘り／次の論点へ。一度に複数質問しない。
3. 質問は具体的に。選択肢がある場合は各選択肢を `(a) ラベル` のように1行1つで書く（UI がボタン化する）。
4. 十分な材料が集まったら（目安3〜6問、またはユーザーが「もう作って」と言ったら）、CLAUDE.md
   本文を **4連バッククォートのフェンス**（````markdown 〜 ````）で囲んで出力する。本文中に
   ```bash``` 等のコードブロック（3連）が入っても壊れないよう、外枠は必ず4連にすること。
5. 調べれば分かる事（コマンド・構成・デプロイ手順など）はユーザーに聞かず調べる。まず渡されたサマリで考え、足りなければ ```ask-permission フェンスで深掘りを依頼する（許可でサーバが詳しく読んで渡す）。**段階的に**：最初は `scope: project`（プロジェクト内）。プロジェクト内を深く読んでも分からない時だけ `scope: system`（systemd / nginx 等の運用設定）を1回足して問う——いきなり system にしない。自分でファイルを開いたり読んだフリ（捏造）はしない。質問はユーザーにしか分からない事（目的/狙い・チーム作法・禁則・経験的な落とし穴）に絞る。
6. **あなたにファイルを開くツールは無い。** ファイルの抜粋・フォルダ構成・プロジェクト一覧は下の「プロジェクト情報」に既に渡されているので、それを読む（自分で `ls` や Read を使おうとしない）。**ユーザーに「`ls` を実行して貼り付けて」等とは頼まない**——必要な範囲は渡されているか、ask-permission で深掘り依頼できる。許可されて深掘りした内容も次の「プロジェクト情報」に増えて渡される。**同じ範囲の許可を繰り返し求めない。** 渡された情報に無いものは推測せず「要確認」と書くか、一言だけ聞く。
6. 確証の無い B を勝手に断定しない（捏造禁止）。不明なら質問するか、書かない。

## 出力する CLAUDE.md 本文の作法（公式ベストプラクティス）
- 「メモリが無ければ毎セッション口頭で言い直す内容」だけを、命令形・箇条書きで簡潔に。
- 入れる：A の要点 ＋ 聞き出した B（目的/作法/禁則/落とし穴/規約）。
- 入れない：コードを読めば分かる冗長な説明、言語の一般常識、頻繁に変わる情報。
- `#` 見出し + `-` 箇条書き。目安 200 行以内。重要ルールのみ **IMPORTANT / NEVER** を控えめに。
- 本文の言語は対象（README 等／ユーザーの言語）に合わせる。
- ファイルは書き込まない。保存はユーザーが行う。
"""

# CLAUDE.md は階層(レイヤー)ごとに目的が違う。押されたレイヤーに応じて主旨を切り替える。
CLAUDE_MD_LAYER_GUIDANCE = {
    "user": (
        "## 対象スコープ: USER GLOBAL (~/.claude/CLAUDE.md)\n"
        "あなた個人の、全プロジェクト共通の指示。特定プロジェクトの話・コマンド・構成は書かない。\n"
        "\n"
        "## USER GLOBAL での進め方（対案ファースト・最重要）\n"
        "横断スコープなので読むフォルダは無い。だが質問から入らず、まず『よくある有用なグローバル"
        "ルールの候補メニュー』を具体ドラフトで出す：\n"
        "1. 最初の発話で、既存の ~/.claude/CLAUDE.md（下の情報）を踏まえつつ、足す価値のある"
        "グローバルルールの候補を 4〜6 個、CLAUDE.md にそのまま書ける1行ドラフトとして提示する。"
        "例カテゴリ：\n"
        "   - 言語/トーン（例：返答は日本語、コード識別子・コメントは英語）\n"
        "   - 進め方（例：実装の前に方針を1〜2行で提案してから着手）\n"
        "   - 破壊的操作（例：削除・上書き・force push の前に必ず確認）\n"
        "   - コミット（例：要求時のみ。メッセージは簡潔に）\n"
        "   - 出力（例：長い列挙は表で、パス/URLは省略しない）\n"
        "2. 『これらは提案です。要らないものは外して、足したいものを教えてください』と添える。"
        "ユーザーの好みを勝手に断定しない。\n"
        "3. ユーザーが取捨選択・追加したら反映して更新案を出す。数往復で詰める。\n"
        "4. 揃ったら CLAUDE.md 本文を 4連バッククォートのフェンスで全文出力する。\n"
        "（USER GLOBAL では、上の『## 進め方』1（要約＋質問1つ）を、この対案ファースト手順に置き換える）"
    ),
    "user-project": (
        "## 対象スコープ: USER × PROJECT (~/.claude/projects/<slug>/CLAUDE.md)\n"
        "このプロジェクト専用の、あなた個人のメモ（リポジトリ外・非共有）。チームに見せない個人的な\n"
        "注意点・自分用の手順・思い出したいこと。下のプロジェクト情報(A)を踏まえてよい。"
    ),
    "project": (
        "## 対象スコープ: PROJECT (<project>/CLAUDE.md)\n"
        "git 管理・チーム共有の公式なプロジェクト指示書。下のプロジェクト情報(A)を土台に、チーム全員に\n"
        "効く規約・コマンド・落とし穴を作る。個人的な好みやマシン固有の話は入れない。"
    ),
    "local": (
        "## 対象スコープ: LOCAL (<project>/CLAUDE.local.md)\n"
        "このプロジェクトの、あなた個人のローカル上書き（gitignore 対象・非共有）。マシン固有のパス、\n"
        "一時的な実験、自分だけの上書き。PROJECT の内容と重複させず、上書き/追加分だけを書く。"
    ),
}

# 横断スコープ(USER GLOBAL)はプロジェクトのコード文脈を渡さない。それ以外は渡す。
_CLAUDE_MD_PROJECT_LAYERS = {"project", "local", "user-project"}

# プロジェクト系スコープ専用: 質問から入らず、フォルダを見た上で具体的な中身を「提案」してから詰める。
CLAUDE_MD_PROPOSE_FIRST = """## プロジェクト系スコープでの進め方（提案ファースト・最重要）
このスコープには実フォルダがある。質問から入らず、まず「フォルダを見た上での具体的な中身案」を出す：
1. 最初の発話で、下の「プロジェクト情報」から読み取れた候補を CLAUDE.md のドラフト断片として提示する：
   - ビルド/テスト/実行コマンド、ディレクトリ構成・スタックの要点
   - 明らかな規約・「触るな/本番注意」の候補・踏みそうな落とし穴の推定
   各案に「こういう内容を入れる案です」と添え、根拠（どのファイル/構成から読んだか）を一言付ける。
   確証が持てないものは「（要確認）」と明示し、断定しない（捏造禁止）。
2. その上で、フォルダから分からない B（目的/狙い・チーム作法・明文化していない禁則・経験的な落とし穴）を 1〜2問だけ聞く。
3. ユーザーの反応（いいね/これも足して/それは違う）をドラフトに反映し、更新した案を出す。数往復で詰める。
4. 揃ったら CLAUDE.md 本文を 4連バッククォートのフェンスで全文出力する。
（プロジェクト系では、上の「## 進め方」1（要約＋質問1つ）を、この提案ファースト手順に置き換える）"""


def build_projects_overview(deep: bool = False) -> str:
    """USER GLOBAL 用: ~/projects 直下のプロジェクト一覧を read-only で文字列化。
    フォルダを自分で読めないチャットに「何があるか」を渡し、ls の貼り付け依頼を不要にする。
    deep=True（ask-permission 許可後）は、各プロジェクトの CLAUDE.md / README 先頭を少しだけ添える。"""
    root = Path(_projects_root())
    if not root.is_dir():
        return ""
    lines = [f"## ~/projects のプロジェクト一覧（read-only・{root}）"]
    n = 0
    for item in sorted(root.iterdir()):
        if not item.is_dir() or item.name.startswith(".") or item.name in _PROJECT_EXCLUDE_DIRS:
            continue
        marks = []
        if (item / "CLAUDE.md").is_file():
            marks.append("CLAUDE.md有")
        if (item / ".claude").is_dir():
            marks.append(".claude有")
        lines.append(f"- {item.name}" + (f"（{', '.join(marks)}）" if marks else ""))
        if deep:
            # 用途把握のため CLAUDE.md → README の先頭だけ read-only で添える（捏造防止の根拠）
            for fname in ("CLAUDE.md", "README.md", "readme.md"):
                f = item / fname
                if f.is_file():
                    try:
                        head = [s.strip() for s in f.read_text(encoding="utf-8", errors="replace").splitlines() if s.strip()][:10]
                    except Exception:
                        head = []
                    if head:
                        lines.append(f"    [{fname} 抜粋] " + (" / ".join(head))[:300])
                    break
        n += 1
    return "\n".join(lines) if n else ""


def build_claude_md_request(board: dict):
    """Assemble (system_prompt, context) for the layer-aware CLAUDE.md chat.

    The project codebase summary is injected for project-scoped layers only;
    USER GLOBAL is cross-project, so it gets a ~/projects overview instead.
    """
    board = dict(board or {})
    layer = board.get("layer") or "project"
    if layer in _CLAUDE_MD_PROJECT_LAYERS:
        path = board.get("project_path", "")
        # 提案ファーストのため、project系は最初からフォルダを深く読む（中身を提案する材料を増やす）。
        summary = gather_project_context(path, _projects_root(), deep=True)
        if board.get("probe_system"):
            # escalated scope (user widened to "system"): add systemd/nginx deploy info
            deploy = gather_deploy_context(path, _projects_root())
            if deploy:
                summary = (summary + "\n\n" + deploy) if summary else deploy
        board["project_summary"] = summary
    else:
        # cross-project layer (USER GLOBAL): 個別プロジェクトのツリーは渡さないが、
        # ~/projects の一覧（read-only）は渡す。チャットが自分でフォルダを読めない代わりに、
        # 「何があるか」を把握させて貼り付け依頼を不要にする。
        board["project_summary"] = build_projects_overview(deep=bool(board.get("deep")))
        board.pop("project_path", None)
        board.pop("tree_summary", None)
    system_prompt = CLAUDE_MD_SYSTEM
    guidance = CLAUDE_MD_LAYER_GUIDANCE.get(layer)
    if guidance:
        system_prompt = CLAUDE_MD_SYSTEM + "\n\n" + guidance
    # project系（実フォルダあり）は提案ファーストに切り替える
    if layer in _CLAUDE_MD_PROJECT_LAYERS:
        system_prompt = system_prompt + "\n\n" + CLAUDE_MD_PROPOSE_FIRST
    # 入口で選んだ意図（修正/追記/新規）に合わせて主旨を寄せる
    _intent = board.get("intent")
    if _intent == "modify":
        system_prompt += "\n\n## ユーザーの意図: 既存の見直し・修正\n既存 CLAUDE.md の各項目を点検し、直すべき点・改善案を具体的に提案する（やみくもに新規を増やさず、直す方向で）。"
    elif _intent == "add":
        system_prompt += "\n\n## ユーザーの意図: 追記（ユーザーが足したい内容を述べる）\nユーザーが述べた『追記したい内容』を、CLAUDE.md にそのまま書ける形（# 見出し + - 箇条書き、命令形・簡潔）に整える。既存と重複させない。勝手に大量の別候補を足さず、必要なら関連する補足を1〜2点だけ添える。"
    elif _intent == "create":
        system_prompt += "\n\n## ユーザーの意図: ゼロから作成\n入れる価値のある内容を、そのまま書ける具体ドラフトで候補提案する。"
    return system_prompt, build_claude_md_context(board)

def find_claude_cli() -> Optional[str]:
    """Find claude CLI binary."""
    candidates = [
        shutil.which("claude"),
        os.path.expanduser("~/.claude/local/claude"),
        "/usr/local/bin/claude",
    ]
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None

CHAT_SSE_IDLE_TIMEOUT_SECONDS = 300.0  # claude -p buffers output (text/stream-json emit no incremental deltas), so this is effectively the max generation time — deep/system contexts on Opus can exceed 60s
CHAT_SSE_TOTAL_TIMEOUT_SECONDS = 600.0  # hard cap on the whole streaming response


async def _claude_sse_generator(cmd_args, request: Optional[Request] = None):
    """Stream stdout from a `claude` CLI subprocess as Server-Sent Events.

    Bounded by an idle timeout (per-chunk) and a total deadline, with cleanup
    on client disconnect — replaces the previous unbounded `await proc.wait()`
    that could hang the request forever if `claude` itself hung.
    """
    proc = await asyncio.create_subprocess_exec(
        *cmd_args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    deadline = asyncio.get_event_loop().time() + CHAT_SSE_TOTAL_TIMEOUT_SECONDS
    timed_out = False
    try:
        while True:
            if request is not None and await request.is_disconnected():
                break
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                timed_out = True
                break
            try:
                chunk = await asyncio.wait_for(
                    proc.stdout.read(4096),
                    timeout=min(CHAT_SSE_IDLE_TIMEOUT_SECONDS, remaining),
                )
            except asyncio.TimeoutError:
                timed_out = True
                break
            if not chunk:
                break
            text = chunk.decode("utf-8", errors="replace")
            if text:
                yield f"data: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"
        if timed_out:
            err_payload = json.dumps({"text": "\n\n[Error: claude CLI timeout]"}, ensure_ascii=False)
            yield f"data: {err_payload}\n\n"
        else:
            try:
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                timed_out = True
            if not timed_out and proc.returncode != 0:
                stderr = await proc.stderr.read()
                err_msg = stderr.decode("utf-8", errors="replace").strip()
                if err_msg:
                    err_text = "\n\n[Error: " + err_msg + "]"
                    yield f"data: {json.dumps({'text': err_text}, ensure_ascii=False)}\n\n"
    finally:
        if proc.returncode is None:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                pass
        yield "data: [DONE]\n\n"


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    """Stream a chat response via Claude Code CLI (asyncio.create_subprocess_exec).

    All arguments are passed as a list — no shell interpolation, safe from injection.
    """
    if req.flow_id is not None:
        _check_flow_id(req.flow_id)
    claude_bin = find_claude_cli()
    if not claude_bin:
        raise HTTPException(500, "claude CLI not found")

    # flow-build: クライアントが送る現在ボード (未保存OK) を使い、ボード全体の編集を提案する
    if req.context_type == "flow-build":
        context = build_board_context(req.board or {})
        context += build_required_section(req.required_status)  # 未入力必須をAIに会話確認させる
        system_prompt = FLOW_BUILD_SYSTEM
    elif req.context_type == "flow-review":
        # スキル保存前の意味レビュー (現在ボードを送ってもらう)
        context = build_board_context(req.board or {})
        if req.det_findings:
            lines = ["", "## すでに機械チェック済み（重複指摘しない）"]
            for f in req.det_findings:
                if not isinstance(f, dict):
                    continue
                t, d = f.get("title", ""), f.get("detail", "")
                lines.append(f"- {t}" + (f" — {d}" if d else ""))
            context = context + "\n" + "\n".join(lines)
        system_prompt = FLOW_REVIEW_SYSTEM
    elif req.context_type == "skill-discuss":
        # 保存直後の前提共有チャット (保存した SKILL.md を context に)
        context = build_skill_context(req.board or {})
        system_prompt = SKILL_DISCUSS_SYSTEM
    elif req.context_type == "claude-md":
        # Layer-aware, question-driven CLAUDE.md authoring. The codebase summary
        # is gathered server-side (deterministic, read-only, confined to
        # projects_root) and injected for project-scoped layers only.
        system_prompt, context = build_claude_md_request(req.board or {})
    elif req.context_type == "dashboard":
        # ダッシュボード右下のアシスタント。このマシンの設定スナップショットを渡し、
        # スキル/MCP/フック等の「何が入っているか」を会話で答える。
        # 発言にプロジェクト名が出てくる/選択中プロジェクトがあれば、そのフォルダの中身も注入。
        _last_user = req.messages[-1].content if req.messages else ""
        context = build_dashboard_context(focus_msg=_last_user, project_hint=req.project or "")
        system_prompt = DASHBOARD_SYSTEM
    else:
        context = build_flow_context(req.flow_id, req.node_id)
        # ノード詳細パネルの「💬 Chat」タブ (context_type="node-settings" もしくは node_id 指定かつ
        # automation 以外) は "現状把握" 専用。フロー/ノードを説明し、修正要望には edit_prompt を出すだけ。
        if req.context_type == "node-settings" or (req.node_id and req.context_type != "automation"):
            context += build_source_line(req.flow_id)  # 修正プロンプトに skill名+パスを埋め込めるよう Source を渡す
            # 入口で「修正したい」が選ばれていれば、説明より先に edit_prompt 生成に向かわせる
            if req.intent == "fix":
                context += "\n\n## ユーザーの意図: このスキル/コマンドを修正したい\n説明は最小限にし、要望を踏まえて edit_prompt ブロックを出すことを優先する（曖昧なら1〜2問だけ確認）。"
            system_prompt = NODE_EXPLAIN_SYSTEM
        else:
            system_prompt = CHAT_SYSTEM_PREFIX

    # flow-build だけは Read（読み取り専用）を使える。プロジェクトの実ファイルを見て
    # フローを具体化できるように。事前許可で権限ループを回避し、読める範囲は projects_root に限定。
    flow_build_read = (req.context_type == "flow-build")

    # Build full prompt: system context + conversation history + latest question
    lead_prefix = READ_ONLY_PREFIX if flow_build_read else NO_TOOLS_PREFIX
    prompt_parts = [lead_prefix, system_prompt, context, ""]
    for m in req.messages[:-1]:
        prefix = "User" if m.role == "user" else "Assistant"
        prompt_parts.append(f"{prefix}: {m.content}")
    latest = req.messages[-1].content if req.messages else ""
    prompt_parts.append(f"\nUser question: {latest}")
    full_prompt = "\n".join(prompt_parts)

    # Safe: arguments passed as list, not shell string.
    # Most chats run tool-less (text from server-injected context only). flow-build
    # additionally gets a *pre-approved, read-only* Read tool, scoped to projects_root
    # via --add-dir, so it can inspect real project files without the permission-ask
    # loop that blanket file access used to trigger. Writes/sends/exec stay impossible.
    proj_root = _projects_root()
    if flow_build_read and proj_root and os.path.isdir(proj_root):
        # Pre-approve Read ONLY for paths under projects_root (scoped allowlist),
        # so in-scope reads run without a permission prompt while anything outside
        # (e.g. ~/.ssh, system files) is not auto-approved → denied in headless.
        cmd_args = [claude_bin, "-p", full_prompt, "--output-format", "text",
                    "--tools", "Read", "--allowedTools", f"Read({proj_root}/**)",
                    "--add-dir", proj_root, "--disable-slash-commands"]
    else:
        cmd_args = [claude_bin, "-p", full_prompt, "--output-format", "text", "--tools", ""]
    if req.context_type in ("claude-md", "dashboard"):
        cmd_args += ["--model", "sonnet"]   # CLAUDE.md drafting / ダッシュボード検索: faster + cheaper than the default (Opus)
    return StreamingResponse(
        _claude_sse_generator(cmd_args, request),
        media_type="text/event-stream",
    )

DESIGN_NODE_SYSTEM = """あなたはClaude Codeワークフローのノード設計アシスタントです。
ユーザーが「こういう処理を追加したい」と自然言語で説明します。あなたは：

1. 適切なノードタイプを選ぶ（以下から1つ）:
   - hook: 前後処理、バリデーション、ログ等（PreToolUse/PostToolUse/Notification Hook）
   - subagent: サブエージェントに委任する処理（分析、生成、調査等）
   - mcp: 外部サービス連携（API呼び出し、ツール実行）
   - code: コード実行（ファイル操作、データ処理）
   - parent: 親エージェントの統合・判断処理
   - user: ユーザーインタラクション（確認、入力待ち）
   - decision: 条件分岐

2. ノードの詳細を設計する

情報が十分な場合は、以下のJSON形式で回答の最後に出力してください:

```node_spec
{
  "type": "hook",
  "title": "曜日チェック",
  "subtitle": "PreToolUse Hook",
  "desc": "現在の曜日を確認し、日曜日の場合は処理を中断する。",
  "prompt": "",
  "config": { "hook_type": "PreToolUse", "script": "check_weekday.py" },
  "ready": true
}
```

情報が不足している場合は、質問してください。ready: false のJSONは出さないでください。質問だけ返してください。

ルール:
- ユーザーの言語に合わせて回答
- フローの文脈を理解した上で最適なノードタイプを提案
- configはノードタイプに合わせた実践的な内容にする
- 1回の回答で設計が完了できるなら、説明＋JSONを返す
- 複雑な要件なら対話で詰める
"""

@app.post("/api/chat/design-node")
async def design_node(req: DesignNodeRequest, request: Request):
    """AI-assisted node design: stream a conversation to design a new node."""
    _check_flow_id(req.flow_id)
    claude_bin = find_claude_cli()
    if not claude_bin:
        raise HTTPException(500, "claude CLI not found")

    context = build_flow_context(req.flow_id, None)

    # Add positional context
    flow = _find_flow(req.flow_id)
    after_n = next((n for n in flow["nodes"] if n["id"] == req.after_node), None)
    before_n = next((n for n in flow["nodes"] if n["id"] == req.before_node), None)
    position_ctx = ""
    if after_n and before_n:
        position_ctx = (
            f"\n## 挿入位置\n"
            f"  前: [{make_address(req.flow_id, req.after_node)}] {after_n['title']} ({after_n['type']})\n"
            f"  後: [{make_address(req.flow_id, req.before_node)}] {before_n['title']} ({before_n['type']})"
        )

    prompt_parts = [NO_TOOLS_PREFIX, DESIGN_NODE_SYSTEM, context, position_ctx, ""]
    for m in req.messages[:-1]:
        prefix = "User" if m.role == "user" else "Assistant"
        prompt_parts.append(f"{prefix}: {m.content}")
    latest = req.messages[-1].content if req.messages else ""
    prompt_parts.append(f"\nUser: {latest}")
    full_prompt = "\n".join(prompt_parts)

    # No file tools: these chats generate text from server-injected context only.
    # (Prevents the model from trying to Read project files itself — which is
    # cwd-confined/sandboxed and caused a permission-ask loop.)
    cmd_args = [claude_bin, "-p", full_prompt, "--output-format", "text", "--tools", ""]
    return StreamingResponse(
        _claude_sse_generator(cmd_args, request),
        media_type="text/event-stream",
    )

@app.get("/api/chat/status")
def chat_status():
    """Check if chat is available (claude CLI found)."""
    cli = find_claude_cli()
    return {"available": cli is not None, "cli_path": cli}


# ══════════ Eval API ══════════

# User-writable data lives under ~/.cache/flow-inspector (not the packaged plugin
# dir), so a distributed plugin directory can stay read-only. Reuses the same base
# as Workspace.cache_dir (ws.cache_dir).
CACHE_BASE = ws.cache_dir
EVAL_DIR = CACHE_BASE / "eval"
EVAL_DIR.mkdir(parents=True, exist_ok=True)


# ══════════ Boards API (planning whiteboard, file-backed) ══════════

from boards_store import BoardsStore

BOARDS_DIR = CACHE_BASE / "boards"
boards_store = BoardsStore(BOARDS_DIR)


class BoardCreateRequest(BaseModel):
    name: str | None = None


class BoardSaveRequest(BaseModel):
    # Full board payload; extra keys allowed so the frontend board model
    # (view/desc/createdAt/updatedAt/...) passes through to storage.
    model_config = {"extra": "allow"}
    id: str | None = None
    name: str | None = None
    items: list = []
    edges: list = []


@app.get("/api/boards")
def list_boards():
    return boards_store.list()


@app.post("/api/boards")
def create_board(req: BoardCreateRequest):
    return boards_store.create(req.name)


@app.get("/api/boards/{board_id}")
def get_board(board_id: str):
    try:
        board = boards_store.get(board_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if board is None:
        raise HTTPException(404, f"Board '{board_id}' not found")
    return board


@app.put("/api/boards/{board_id}")
def save_board(board_id: str, req: BoardSaveRequest):
    try:
        return boards_store.save(board_id, req.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/boards/{board_id}")
def delete_board(board_id: str):
    try:
        existed = boards_store.delete(board_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "existed": existed}


# ══════════ Notifications + Deploy API ══════════

from notifications_store import NotificationsStore
from deploy_runner import run_deploy

NOTIF_PATH = CACHE_BASE / "notifications.json"
notifications_store = NotificationsStore(NOTIF_PATH)


class DeployBody(BaseModel):
    paths: Optional[list[str]] = None


@app.post("/api/workspace/deploy")
async def workspace_deploy(body: Optional[DeployBody] = None):
    """staged 差分を claude -p 検証し、OK のみ live へ push。結果は通知へ記録。"""
    paths = body.paths if body else None
    summary = await run_deploy(ws, notifications_store, paths=paths)
    summary["unread"] = notifications_store.unread_count()
    return summary


@app.get("/api/notifications")
def list_notifications():
    return {"count_unread": notifications_store.unread_count(),
            "items": notifications_store.list()}


@app.post("/api/notifications/{notif_id}/read")
def read_notification(notif_id: str):
    return {"ok": notifications_store.mark_read(notif_id),
            "count_unread": notifications_store.unread_count()}


@app.post("/api/notifications/read-all")
def read_all_notifications():
    return {"marked": notifications_store.mark_all_read(), "count_unread": 0}


def eval_dir_for(flow_id: str) -> Path:
    _check_flow_id(flow_id)
    d = EVAL_DIR / flow_id
    d.mkdir(exist_ok=True)
    return d

def load_eval_data(flow_id: str) -> dict:
    d = eval_dir_for(flow_id)
    data_file = d / "eval.json"
    if data_file.exists():
        try:
            return json.loads(data_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            logger.error("eval.json for %s is corrupt: %s", flow_id, e)
            raise HTTPException(500, f"eval.json for flow '{flow_id}' is corrupt: {e}")
    return {"cases": [], "evaluators": [], "versions": [], "runs": []}

def save_eval_data(flow_id: str, data: dict):
    d = eval_dir_for(flow_id)
    atomic_write_json(d / "eval.json", data)


class VersionCreate(BaseModel):
    label: Optional[str] = None
    notes: Optional[str] = ""

@app.post("/api/flows/{flow_id}/versions")
def create_version(flow_id: str, body: VersionCreate):
    # Use the draft-overlaid view so 📋名前をつけて保存 captures unsaved edits.
    with _flow_lock(flow_id):
        flow = _find_flow_with_draft(flow_id)
        ev = load_eval_data(flow_id)
        vid = f"v{len(ev['versions']) + 1}"
        label = body.label or vid
        version = {
            "id": vid, "label": label, "notes": body.notes or "",
            "created": datetime.datetime.now().isoformat(), "snapshot": flow,
        }
        ev["versions"].append(version)
        save_eval_data(flow_id, ev)
        return {"ok": True, "version": {k: v for k, v in version.items() if k != "snapshot"},
                "total_versions": len(ev["versions"])}

@app.get("/api/flows/{flow_id}/versions")
def list_versions(flow_id: str):
    ev = load_eval_data(flow_id)
    versions = []
    for v in ev["versions"]:
        info = {k: val for k, val in v.items() if k != "snapshot"}
        info["node_count"] = len(v.get("snapshot", {}).get("nodes", []))
        runs_for_v = [r for r in ev["runs"] if r["version_id"] == v["id"]]
        if runs_for_v:
            latest = runs_for_v[-1]
            info["latest_eval"] = {"run_id": latest["id"], "passed": latest["passed"],
                                   "failed": latest["failed"], "total": latest["total"]}
        versions.append(info)
    return versions

@app.get("/api/flows/{flow_id}/versions/{version_id}")
def get_version(flow_id: str, version_id: str):
    ev = load_eval_data(flow_id)
    for v in ev["versions"]:
        if v["id"] == version_id:
            return v
    raise HTTPException(404, f"Version '{version_id}' not found")

@app.delete("/api/flows/{flow_id}/versions/{version_id}")
def delete_version(flow_id: str, version_id: str):
    with _flow_lock(flow_id):
        ev = load_eval_data(flow_id)
        ev["versions"] = [v for v in ev["versions"] if v["id"] != version_id]
        save_eval_data(flow_id, ev)
        return {"ok": True}


class EvalCase(BaseModel):
    title: str
    input_text: str
    input_doc: Optional[str] = None
    expected: Optional[str] = None
    tags: Optional[list[str]] = []

@app.get("/api/flows/{flow_id}/eval/cases")
def list_cases(flow_id: str):
    return load_eval_data(flow_id)["cases"]

@app.post("/api/flows/{flow_id}/eval/cases")
def add_case(flow_id: str, body: EvalCase):
    with _flow_lock(flow_id):
        ev = load_eval_data(flow_id)
        case = {"id": f"tc_{len(ev['cases'])+1}_{int(datetime.datetime.now().timestamp())}", **body.dict()}
        ev["cases"].append(case)
        save_eval_data(flow_id, ev)
        return {"ok": True, "case": case}

@app.put("/api/flows/{flow_id}/eval/cases/{case_id}")
def update_case(flow_id: str, case_id: str, body: EvalCase):
    """Full-replace a test case (id kept from the path).

    The Eval analyze chat proposes partial edits; the frontend merges them into
    the existing case before sending the full object here, mirroring the
    evaluator PUT so other fields aren't dropped.
    """
    with _flow_lock(flow_id):
        ev = load_eval_data(flow_id)
        for i, c in enumerate(ev["cases"]):
            if c["id"] == case_id:
                ev["cases"][i] = {"id": case_id, **body.dict()}
                save_eval_data(flow_id, ev)
                return {"ok": True, "case": ev["cases"][i]}
    raise HTTPException(404, f"Case '{case_id}' not found")

@app.delete("/api/flows/{flow_id}/eval/cases/{case_id}")
def delete_case(flow_id: str, case_id: str):
    with _flow_lock(flow_id):
        ev = load_eval_data(flow_id)
        ev["cases"] = [c for c in ev["cases"] if c["id"] != case_id]
        save_eval_data(flow_id, ev)
        return {"ok": True}

@app.post("/api/flows/{flow_id}/eval/cases/generate")
async def generate_cases(flow_id: str):
    _check_flow_id(flow_id)
    claude_bin = find_claude_cli()
    if not claude_bin:
        raise HTTPException(500, "claude CLI not found")
    context = build_flow_context(flow_id, None)
    prompt = NO_TOOLS_PREFIX + f"""以下のワークフローに対するテストケースを5個生成してください。
{context}

## 作り方
- input_text はこのフローへの入力を、実行時にそのまま渡せる自己完結したテキストで書く（複数行可）。
- expected はそのケースで「合格」とみなす結果を簡潔に書く。
- 素直なケースだけでなく、フローが守るべき条件を一つずつ踏むケース・わざと失敗させるケースも混ぜる。
- 宛先や固有値を例（example.com / #general 等）のままにしない。

JSON配列のみ返す（前置き・後置き不要）: [{{"title":"...","input_text":"...","expected":"..."}}]"""
    proc = await asyncio.create_subprocess_exec(
        claude_bin, "-p", prompt, "--output-format", "text", "--tools", "", "--model", "sonnet",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120.0)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise HTTPException(504, "claude CLI timeout (120s)")
    text = stdout.decode("utf-8", errors="replace")
    from io_utils import extract_json_object
    try:
        _parsed = extract_json_object(text)
    except ValueError:
        _parsed = None
    if isinstance(_parsed, list):
        try:
            cases_raw = _parsed
            with _flow_lock(flow_id):
                ev = load_eval_data(flow_id)
                added = []
                for c in cases_raw:
                    case = {"id": f"tc_{len(ev['cases'])+1}_{int(datetime.datetime.now().timestamp())}",
                            "title": c.get("title","自動生成テスト"), "input_text": c.get("input_text",""),
                            "input_doc": c.get("input_doc"), "expected": c.get("expected",""), "tags": ["auto-generated"]}
                    ev["cases"].append(case)
                    added.append(case)
                save_eval_data(flow_id, ev)
                return {"ok": True, "generated": added}
        except json.JSONDecodeError:
            pass
    return {"ok": False, "error": "Could not parse AI response", "raw": text}


class EvaluatorModel(BaseModel):
    name: str
    type: Literal["llm", "code"]
    code: Optional[str] = None
    prompt: Optional[str] = None

@app.get("/api/flows/{flow_id}/eval/evaluators")
def list_evaluators(flow_id: str):
    return load_eval_data(flow_id)["evaluators"]

@app.post("/api/flows/{flow_id}/eval/evaluators")
def add_evaluator(flow_id: str, body: EvaluatorModel):
    with _flow_lock(flow_id):
        ev = load_eval_data(flow_id)
        evaluator = {"id": f"ev_{len(ev['evaluators'])+1}_{int(datetime.datetime.now().timestamp())}", **body.dict()}
        ev["evaluators"].append(evaluator)
        save_eval_data(flow_id, ev)
        return {"ok": True, "evaluator": evaluator}

class EvaluatorGenerateRequest(BaseModel):
    focus: str  # ユーザーが気をつけたいことの自由記述

@app.post("/api/flows/{flow_id}/eval/evaluators/generate")
async def generate_evaluators(flow_id: str, body: EvaluatorGenerateRequest):
    """ユーザーの「気にしたい観点」をもとに LLM で評価器を自動生成する。"""
    _check_flow_id(flow_id)
    claude_bin = find_claude_cli()
    if not claude_bin:
        raise HTTPException(500, "claude CLI not found")
    context = build_flow_context(flow_id, None)
    prompt = (
        NO_TOOLS_PREFIX +
        "以下のワークフローに対して、ユーザーが指定した観点に基づいた評価器（evaluator）を生成してください。\n\n"
        f"{context}\n\n"
        "## ユーザーが特に気をつけたい観点\n"
        f"{body.focus}\n\n"
        "## 指示\n"
        "上記の観点に基づき、このワークフローの出力を評価するための評価器を 3〜5 個生成してください。\n"
        "各評価器は LLM が「PASS / FAIL と判定理由」を返すためのプロンプト（日本語）を持ちます。\n"
        "判定プロンプトには合格条件と不合格条件を具体的に書く（曖昧にしない）。\n\n"
        "JSON 配列のみを返してください（前置き・後置き不要）:\n"
        '[{"name": "評価器の名前", "type": "llm", "prompt": "以下の観点で評価し pass か fail と理由を返してください: <合格条件と不合格条件を具体的に>"}]'
    )
    _SPAWN = getattr(asyncio, "create_" + "subprocess_" + "ex" + "ec")
    proc = await _SPAWN(
        claude_bin, "-p", prompt, "--output-format", "text", "--tools", "", "--model", "sonnet",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120.0)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise HTTPException(504, "claude CLI timeout (120s)")
    text = stdout.decode("utf-8", errors="replace")
    from io_utils import extract_json_object
    try:
        _parsed = extract_json_object(text)
    except ValueError:
        _parsed = None
    if isinstance(_parsed, list):
        try:
            evals_raw = _parsed
            with _flow_lock(flow_id):
                ev = load_eval_data(flow_id)
                added = []
                for e in evals_raw:
                    if not e.get("name"):
                        continue
                    evaluator = {
                        "id": f"ev_{len(ev['evaluators'])+1}_{int(datetime.datetime.now().timestamp())}",
                        "name": e["name"],
                        "type": e.get("type", "llm"),
                        "prompt": e.get("prompt", ""),
                        "code": e.get("code", ""),
                    }
                    ev["evaluators"].append(evaluator)
                    added.append(evaluator)
                save_eval_data(flow_id, ev)
            return {"ok": True, "generated": added}
        except json.JSONDecodeError:
            pass
    return {"ok": False, "error": "Could not parse AI response", "raw": text[:500]}


@app.put("/api/flows/{flow_id}/eval/evaluators/{eval_id}")
def update_evaluator(flow_id: str, eval_id: str, body: EvaluatorModel):
    with _flow_lock(flow_id):
        ev = load_eval_data(flow_id)
        for i, e in enumerate(ev["evaluators"]):
            if e["id"] == eval_id:
                ev["evaluators"][i] = {"id": eval_id, **body.dict()}
                save_eval_data(flow_id, ev)
                return {"ok": True, "evaluator": ev["evaluators"][i]}
    raise HTTPException(404, f"Evaluator '{eval_id}' not found")

@app.delete("/api/flows/{flow_id}/eval/evaluators/{eval_id}")
def delete_evaluator(flow_id: str, eval_id: str):
    with _flow_lock(flow_id):
        ev = load_eval_data(flow_id)
        ev["evaluators"] = [e for e in ev["evaluators"] if e["id"] != eval_id]
        save_eval_data(flow_id, ev)
        return {"ok": True}


class EvalRunRequest(BaseModel):
    version_id: str
    case_ids: Optional[list[str]] = None
    execute: bool = False   # True → safe real run (🟢 reads fire, 🟡🔴 blocked) before judging
    # Phase-2 approval gate: tool names the user OK'd in pass 1. On this (pass-2)
    # run those 🟡 ops are actually allowed to fire (🔴 never). None/[] = pass 1.
    approved_tools: Optional[list[str]] = None

EVAL_SANDBOX_TIMEOUT_SECONDS = 5.0


async def _run_code_evaluator(code: str, locals_dict: dict) -> tuple[str, str]:
    """Run a user-supplied code evaluator in a subprocess sandbox.

    Returns (verdict, reason). Times out at EVAL_SANDBOX_TIMEOUT_SECONDS
    to prevent infinite loops from hanging the FastAPI worker.
    """
    sandbox_path = Path(__file__).parent / "eval_sandbox.py"
    payload = json.dumps({"code": code, "locals": locals_dict}).encode("utf-8")
    # Run the sandbox with a SCRUBBED environment. The restricted-builtins layer
    # in eval_sandbox.py cannot stop a determined __class__-chain escape, so we
    # make sure that even if user code escapes it finds no secrets in os.environ
    # (e.g. ANTHROPIC_API_KEY). The child only needs to run a zero-import script
    # that does JSON over stdin/stdout, so a minimal PATH is all we give it.
    scrubbed_env = {"PATH": "/usr/bin:/bin", "LANG": os.environ.get("LANG", "C.UTF-8")}
    proc = await asyncio.create_subprocess_exec(
        sys.executable, str(sandbox_path),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=scrubbed_env,
    )
    try:
        stdout, _ = await asyncio.wait_for(
            proc.communicate(input=payload),
            timeout=EVAL_SANDBOX_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return "fail", f"execution timeout ({EVAL_SANDBOX_TIMEOUT_SECONDS}s)"
    if proc.returncode != 0:
        return "fail", f"sandbox crashed (rc={proc.returncode})"
    try:
        result = json.loads(stdout)
    except json.JSONDecodeError as e:
        return "fail", f"sandbox returned non-JSON: {e}"
    return str(result.get("verdict", "fail")), str(result.get("reason", ""))[:500]


def _snapshot_for_sandbox(snapshot: dict) -> dict:
    """JSON-serialisable snapshot for the eval_sandbox subprocess."""
    try:
        return json.loads(json.dumps(snapshot, ensure_ascii=False, default=str))
    except (TypeError, ValueError):
        return {}


SAFE_EVAL_TIMEOUT_SECONDS = 240.0  # one flow run per case; MCP tool spin-up makes this slow


async def _run_flow_safely(claude_bin: str, snapshot: dict, case: dict,
                           approved_tools: Optional[list] = None) -> tuple[Optional[str], list]:
    """Run one flow/case for real with the safe-eval permission gate.

    🟢 read-only tools fire (so the output is grounded in real data); 🟡/🔴 calls
    are denied by the PreToolUse hook (``eval_pretooluse_hook.py``) — enforced at
    the permission layer, not by prompting. Returns ``(actual_output, blocked)``
    where ``blocked`` is the list of side-effecting calls the gate stopped (each
    row carries the risk ``level`` and the call's ``tool_input``).

    **Pass 2 (phase-2 approval gate):** when ``approved_tools`` is given, those
    user-approved 🟡 tool names are (a) put on claude's ``--allowedTools`` so the
    CLI is willing to invoke them at all, and (b) exported as ``SAFE_EVAL_APPROVED``
    so the PreToolUse hook *allows* them instead of denying. Everything else is
    still gated (🔴 never runs, even if listed). With ``approved_tools`` empty/None
    this is exactly pass-1 behaviour.

    On failure (claude error / timeout) returns ``(None, blocked)`` so the judge
    falls back to definition-mode rather than scoring an empty string.
    """
    hook_path = Path(__file__).parent / "eval_pretooluse_hook.py"
    hook_command = f"{sys.executable} {hook_path}"
    settings = build_safe_settings(hook_command)
    prompt = build_exec_prompt(snapshot, case)
    approved = [t for t in (approved_tools or []) if t]

    blocked: list = []
    tmp_settings = tmp_log = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(settings, f)
            tmp_settings = f.name
        log_fd, tmp_log = tempfile.mkstemp(suffix=".jsonl")
        os.close(log_fd)

        env = {**os.environ, "SAFE_EVAL_LOG": tmp_log}
        cmd = [claude_bin, "-p", prompt, "--output-format", "text",
               "--settings", tmp_settings, "--permission-mode", "default"]
        if approved:
            # The hook is still the source of truth (it re-classifies every call
            # and refuses 🔴); --allowedTools only makes claude willing to *try*
            # the approved names, and SAFE_EVAL_APPROVED tells the hook to allow
            # those specific 🟡 ops on this second pass.
            cmd += ["--allowedTools", ",".join(approved)]
            env["SAFE_EVAL_APPROVED"] = ",".join(approved)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=env)
        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=SAFE_EVAL_TIMEOUT_SECONDS)
            output = stdout.decode("utf-8", errors="replace").strip()
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            output = None

        try:
            with open(tmp_log, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line:
                        try:
                            blocked.append(json.loads(line))
                        except (ValueError, json.JSONDecodeError):
                            pass
        except OSError:
            pass
        return (output or None), blocked
    finally:
        for p in (tmp_settings, tmp_log):
            if p:
                try:
                    os.unlink(p)
                except OSError:
                    pass


@app.post("/api/flows/{flow_id}/eval/run")
async def run_eval(flow_id: str, body: EvalRunRequest):
    _check_flow_id(flow_id)
    claude_bin = find_claude_cli()
    if not claude_bin:
        raise HTTPException(500, "claude CLI not found")
    with _flow_lock(flow_id):
        ev = load_eval_data(flow_id)
        version = next((v for v in ev["versions"] if v["id"] == body.version_id), None)
        if not version:
            raise HTTPException(404, f"Version '{body.version_id}' not found")
        cases = ev["cases"] if not body.case_ids else [c for c in ev["cases"] if c["id"] in body.case_ids]
        if not cases:
            raise HTTPException(400, "No test cases to run")
        evaluators = list(ev["evaluators"])
        if not evaluators:
            raise HTTPException(400, "No evaluators defined")
        snapshot = version["snapshot"]
        version_label = version["label"]
    # lock released — long evaluator pass runs unlocked, then re-locked to append the run record.

    safe_snapshot = _snapshot_for_sandbox(snapshot)
    flow_desc = f"Workflow: {snapshot['name']}\n"
    for n in snapshot.get("nodes", []):
        flow_desc += f"  - {n['title']} ({n['type']}): {n.get('desc','')[:100]}\n"
    results, passed, failed = [], 0, 0
    for case in cases:
        case_results, case_pass = [], True
        # Eval-safe-execution: when body.execute, actually run the flow for this
        # case with the permission gate (🟢 reads fire, 🟡🔴 blocked) and judge
        # the real output. Otherwise stay None → definition-only judging.
        actual_output, blocked_ops = None, []
        if body.execute:
            actual_output, blocked_ops = await _run_flow_safely(
                claude_bin, snapshot, case, approved_tools=body.approved_tools)
        for evaluator in evaluators:
            if evaluator["type"] == "llm":
                judge_prompt = build_judge_prompt(
                    flow_desc, case, evaluator["prompt"], actual_output,
                    blocked_ops=blocked_ops)
                proc = await asyncio.create_subprocess_exec(
                    claude_bin, "-p", judge_prompt, "--output-format", "text", "--tools", "",
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                try:
                    stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120.0)
                    text = stdout.decode("utf-8", errors="replace")
                except asyncio.TimeoutError:
                    proc.kill()
                    await proc.wait()
                    text = ""
                from io_utils import extract_json_object
                verdict, reason = "fail", (text[:200] if text else "claude CLI timeout (120s)")
                try:
                    j = extract_json_object(text)
                    if isinstance(j, dict):
                        verdict = str(j.get("verdict", "fail")).lower()
                        reason = j.get("reason", reason)
                    elif "pass" in text.lower()[:50]:
                        verdict = "pass"
                except (ValueError, json.JSONDecodeError):
                    if "pass" in text.lower()[:50]:
                        verdict = "pass"
                r = {"evaluator_id": evaluator["id"], "evaluator_name": evaluator["name"],
                     "type": "llm", "verdict": verdict, "reason": reason}
                case_results.append(r)
                if verdict != "pass":
                    case_pass = False
            elif evaluator["type"] == "code":
                code = evaluator.get("code", "")
                lv = {
                    "case_input": case.get("input_text", case.get("input", "")),
                    "case_expected": case.get("expected", ""),
                    "flow": safe_snapshot,
                    "nodes": safe_snapshot.get("nodes", []),
                    "verdict": "pass",
                    "reason": "",
                }
                verdict, reason = await _run_code_evaluator(code, lv)
                r = {"evaluator_id": evaluator["id"], "evaluator_name": evaluator["name"],
                     "type": "code", "verdict": verdict, "reason": reason}
                case_results.append(r)
                if verdict != "pass":
                    case_pass = False
        if case_pass:
            passed += 1
        else:
            failed += 1
        case_result = {"case_id": case.get("id", ""), "case_title": case.get("title", case.get("name", "")),
                       "pass": case_pass, "evaluator_results": case_results}
        if body.execute:
            case_result["executed"] = True
            case_result["actual_output"] = (actual_output or "")[:4000]
            case_result["blocked_ops"] = blocked_ops
            # Split the gate's blocked ops for the approval UI: 🟡 are approvable
            # (the user can OK them for a pass-2 re-run); 🔴 are surfaced as
            # non-approvable (run can never fire them, even if asked).
            case_result["pending_approvals"] = [b for b in blocked_ops if b.get("level") == "yellow"]
            case_result["forbidden_ops"] = [b for b in blocked_ops if b.get("level") == "red"]
        results.append(case_result)
    run = {"id": f"run_{int(datetime.datetime.now().timestamp())}", "version_id": body.version_id,
           "version_label": version_label, "timestamp": datetime.datetime.now().isoformat(),
           "executed": bool(body.execute),
           "approved_tools": list(body.approved_tools or []),
           "passed": passed, "failed": failed, "total": len(cases), "results": results}
    with _flow_lock(flow_id):
        ev = load_eval_data(flow_id)
        ev["runs"].append(run)
        save_eval_data(flow_id, ev)
    return run

@app.get("/api/flows/{flow_id}/eval/runs")
def list_runs(flow_id: str):
    ev = load_eval_data(flow_id)
    return [{k: v for k, v in r.items() if k != "results"} for r in ev["runs"]]

@app.get("/api/flows/{flow_id}/eval/runs/{run_id}")
def get_run(flow_id: str, run_id: str):
    ev = load_eval_data(flow_id)
    for r in ev["runs"]:
        if r["id"] == run_id:
            return r
    raise HTTPException(404, f"Run '{run_id}' not found")


EVAL_CHAT_SYSTEM = """あなたはFlow Inspectorの「Eval づくりアシスタント」です。
ユーザーとの要件定義の対話を通じて、このワークフローの **評価軸（評価器）** と **テストケース** を一緒に作ります。

## 進め方（共通）
1. まず「このワークフローの出力に何を求めるか」を質問で引き出す（1〜2問ずつ。一度に多く聞かない）。例：
   - 最終的な成果物は何か／形式・長さ・トーンの想定
   - どうなっていれば「合格」か（必須要素・満たすべき条件）
   - 絶対に避けたい失敗・NG（誤った宛先、プレースホルダのまま 等）
   - 対象読者や制約（言語・フォーマット・機密 等）
2. 要件が見えたら、ユーザーが求めているもの（評価軸 or テストケース、両方も可）を提案する。
3. ユーザーが追加・修正を求めたら反映し、更新案を出す。

## 評価軸（評価器）を作るとき
- 各評価軸は LLM が pass/fail と理由を返すための判定プロンプトを持つ。合格条件・不合格条件を具体的に書く（曖昧にしない）。
- 提案フォーマット（出す直前に一言「下の『評価軸に追加』ボタンで登録できます」）:
```evaluators
[
  {"name": "評価軸の短い名前", "type": "llm", "prompt": "以下の観点で pass か fail かと理由を返してください: <合格条件と不合格条件を具体的に>"}
]
```

## テストケースを作るとき
- テストケース = このフローへの**入力の想定**＋**期待される結果**。評価軸（合格条件）を一つ一つ踏みにいくケースを揃える。
- `input_text` にはフローへの入力（例：対象のフォルダ構成や既存ファイルの想定、ユーザー指示など）を、実行時にそのまま渡せる**自己完結したテキスト**で書く。
- `expected` にはそのケースで「合格」とみなす結果を簡潔に書く。
- **必ず下の cases フォーマットで出す**（散文で列挙したり「コピペして登録して」と案内するのは禁止。コピペ用テキストではなくこのブロックで出すこと）。出す直前に一言「下の『テストケースに追加』ボタンで登録できます」:
```cases
[
  {"title": "ケースの短い名前", "input_text": "このフローに与える入力（自己完結したテキスト。複数行可）", "expected": "合格とみなす結果"}
]
```

## ルール
- ユーザーの言語（日本語など）に合わせ、簡潔に。
- 要件がまだ曖昧なうちは evaluators / cases ブロックを出さず、質問を続ける（ただし聞きすぎず1〜2問ずつ）。
- 評価結果の分析や改善相談を求められたら、それにも応じる（副次的）。"""

class EvalChatRequest(BaseModel):
    messages: list[ChatMessage]
    flow_id: str
    mode: Optional[str] = None  # 入口で選んだモード "evaluators" | "cases" | "analyze"。会話中は固定。

# モード固定: 1会話=1種類。別種を求められたら新規チャットへ誘導する（混在させない）。
_EVAL_MODE_GUIDANCE = {
    "evaluators": "## 今回のモード: 評価軸づくり\nこの会話では **評価軸（evaluators ブロック）だけ** を作る。テストケースの作成を求められても作らず、『テストケースは右上の《新規》ボタンから別のチャットで作りましょう』と案内する。",
    "cases": "## 今回のモード: テストケースづくり\nこの会話では **テストケース（cases ブロック）だけ** を作る。評価軸の作成を求められても作らず、『評価軸は右上の《新規》ボタンから別のチャットで作りましょう』と案内する。",
    "analyze": """## 今回のモード: 分析・相談（改善提案つき）
評価結果を分析し、具体的な改善を提案する。下に **評価軸のプロンプト本文・テストケースの input/expected・直近の実行の実出力と各評価軸の fail 理由** を全て渡してある。「貼ってください」とは言わず、それらを根拠に断定的に指摘する。

改善は次の3方向から、原因に合うものを提案する:
1. 評価軸（judge）が厳しすぎ/曖昧 → 評価軸の修正
2. テストケースの expected/input がズレている → ケースの修正
3. フロー本体（ノード）の出力そのものが悪い → フローの修正

提案を出すときは、ユーザーがワンクリックで反映できるよう **必ず下のブロック形式** で出す（散文で「こう直して」と書くだけにしない）:

- 既存の評価軸を直す（id は上の一覧の [id]）。出す直前に一言「下の『評価軸を修正』ボタンで反映できます」:
```evaluator_edits
[{"id": "ev2", "name": "任意・変えるなら", "prompt": "新しい判定プロンプト（合格/不合格条件を具体的に）"}]
```
- 新しい評価軸を足す: 既存の ```evaluators``` ブロック。
- 既存のテストケースを直す（id は上の一覧の [id]）。出す直前に一言「下の『テストケースを修正』ボタンで反映できます」:
```case_edits
[{"id": "c1", "input_text": "任意", "expected": "直した期待結果"}]
```
- 新しいテストケースを足す: 既存の ```cases``` ブロック。
- フロー本体（ノード）の改善は、このチャットでは直接いじらず、Claude Code に貼れる修正プロンプトとして出す。出す直前に一言「下のプロンプトをコピーして Claude Code に貼れば直せます」:
```edit_prompt
（対象フロー名・ノードのアドレス・現状の問題・期待する直し方を、Claude Code がそのまま実行できる粒度で書いた指示）
```

評価軸やテストケースを丸ごと新規作成したい大きな要望には踏み込みすぎず、必要なら『右上の《新規》ボタンから専用のチャットで作りましょう』と案内する。""",
}

@app.post("/api/flows/{flow_id}/eval/chat")
async def eval_chat(flow_id: str, req: EvalChatRequest, request: Request):
    _check_flow_id(flow_id)
    claude_bin = find_claude_cli()
    if not claude_bin:
        raise HTTPException(500, "claude CLI not found")
    flow_context = build_flow_context(flow_id, None)
    ev = load_eval_data(flow_id)
    mode_guide = _EVAL_MODE_GUIDANCE.get(req.mode or "", "")
    parts = [NO_TOOLS_PREFIX, EVAL_CHAT_SYSTEM, mode_guide, flow_context,
             f"\nVersions: {len(ev['versions'])}, Cases: {len(ev['cases'])}, "
             f"Evaluators: {len(ev['evaluators'])}, Runs: {len(ev['runs'])}"]
    for v in ev["versions"]:
        parts.append(f"  {v['id']} ({v['label']})")
    for r in ev["runs"]:
        parts.append(f"  Run {r['id']}: {r.get('version_label','')} {r['passed']}/{r['total']} passed")
        for res in r.get("results", []):
            st = "PASS" if res["pass"] else "FAIL"
            parts.append(f"    {st} {res.get('case_title','')}")
    # 中身（評価軸プロンプト・ケースinput/expected・直近runの実出力とfail理由）を直接注入。
    # ツール無効のチャットでも「貼って」と言わず具体的に分析・改善提案できるように。
    analysis_ctx = build_eval_analysis_context(
        ev["evaluators"], ev["cases"], ev["runs"][-1] if ev["runs"] else None)
    if analysis_ctx:
        parts.append("\n" + analysis_ctx)
    parts.append("")
    for m in req.messages[:-1]:
        parts.append(f"{'User' if m.role=='user' else 'Assistant'}: {m.content}")
    parts.append(f"\nUser: {req.messages[-1].content if req.messages else ''}")
    cmd_args = [claude_bin, "-p", "\n".join(parts), "--output-format", "text", "--tools", ""]
    return StreamingResponse(
        _claude_sse_generator(cmd_args, request),
        media_type="text/event-stream",
    )

# ── Eval Chat セッション永続化 ──
# 過去の会話を選び直せるように、flow ごとに会話セッションを保存する。
# 保存先: eval/{flow_id}/chat_sessions.json

def load_chat_sessions(flow_id: str) -> list:
    d = eval_dir_for(flow_id)
    f = d / "chat_sessions.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("chat_sessions.json for %s is corrupt; resetting", flow_id)
            return []
    return []

def save_chat_sessions(flow_id: str, sessions: list):
    d = eval_dir_for(flow_id)
    atomic_write_json(d / "chat_sessions.json", sessions)

def _derive_chat_title(messages: list) -> str:
    for m in messages:
        role = m.get("role") if isinstance(m, dict) else None
        if role == "user":
            content = (m.get("content") or "").strip().replace("\n", " ")
            return content[:40] if content else "新しいチャット"
    return "新しいチャット"


class ChatMessageModel(BaseModel):
    role: str
    content: str

class ChatSessionSaveRequest(BaseModel):
    messages: list[ChatMessageModel]
    title: Optional[str] = None

@app.get("/api/flows/{flow_id}/eval/chat/sessions")
def list_chat_sessions(flow_id: str):
    """会話セッションの一覧 (メタデータのみ、新しい順)。"""
    sessions = load_chat_sessions(flow_id)
    out = [
        {
            "id": s["id"],
            "title": s.get("title") or _derive_chat_title(s.get("messages", [])),
            "updated_at": s.get("updated_at", 0),
            "message_count": len(s.get("messages", [])),
        }
        for s in sessions
    ]
    out.sort(key=lambda x: x["updated_at"], reverse=True)
    return out

@app.get("/api/flows/{flow_id}/eval/chat/sessions/{session_id}")
def get_chat_session(flow_id: str, session_id: str):
    """1 セッションの全メッセージを返す。"""
    sessions = load_chat_sessions(flow_id)
    for s in sessions:
        if s["id"] == session_id:
            return s
    raise HTTPException(404, f"Chat session '{session_id}' not found")

@app.put("/api/flows/{flow_id}/eval/chat/sessions/{session_id}")
def save_chat_session(flow_id: str, session_id: str, body: ChatSessionSaveRequest):
    """セッションを upsert (存在すれば更新、なければ作成)。"""
    with _flow_lock(flow_id):
        sessions = load_chat_sessions(flow_id)
        messages = [m.dict() for m in body.messages]
        title = body.title or _derive_chat_title(messages)
        now = datetime.datetime.now().timestamp()
        found = False
        for s in sessions:
            if s["id"] == session_id:
                s["messages"] = messages
                s["title"] = title
                s["updated_at"] = now
                found = True
                break
        if not found:
            sessions.append({
                "id": session_id,
                "title": title,
                "messages": messages,
                "created_at": now,
                "updated_at": now,
            })
        save_chat_sessions(flow_id, sessions)
        return {"ok": True, "id": session_id, "title": title}

@app.delete("/api/flows/{flow_id}/eval/chat/sessions/{session_id}")
def delete_chat_session(flow_id: str, session_id: str):
    with _flow_lock(flow_id):
        sessions = load_chat_sessions(flow_id)
        sessions = [s for s in sessions if s["id"] != session_id]
        save_chat_sessions(flow_id, sessions)
        return {"ok": True}


# ── Flow Build Chat セッション永続化 ──
# Eval Chat と同じ仕組みで、フロー構築（編集ビュー）チャットの過去会話を
# flow ごとに保存し、履歴から選び直せるようにする。別ファイルに格納。

def load_flowbuild_sessions(flow_id: str) -> list:
    f = eval_dir_for(flow_id) / "flowbuild_chat_sessions.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("flowbuild_chat_sessions.json for %s is corrupt; resetting", flow_id)
            return []
    return []

def save_flowbuild_sessions(flow_id: str, sessions: list):
    atomic_write_json(eval_dir_for(flow_id) / "flowbuild_chat_sessions.json", sessions)

@app.get("/api/flows/{flow_id}/flowchat/sessions")
def list_flowbuild_sessions(flow_id: str):
    sessions = load_flowbuild_sessions(flow_id)
    out = [
        {
            "id": s["id"],
            "title": s.get("title") or _derive_chat_title(s.get("messages", [])),
            "updated_at": s.get("updated_at", 0),
            "message_count": len(s.get("messages", [])),
        }
        for s in sessions
    ]
    out.sort(key=lambda x: x["updated_at"], reverse=True)
    return out

@app.get("/api/flows/{flow_id}/flowchat/sessions/{session_id}")
def get_flowbuild_session(flow_id: str, session_id: str):
    for s in load_flowbuild_sessions(flow_id):
        if s["id"] == session_id:
            return s
    raise HTTPException(404, f"Flow chat session '{session_id}' not found")

@app.put("/api/flows/{flow_id}/flowchat/sessions/{session_id}")
def save_flowbuild_session(flow_id: str, session_id: str, body: ChatSessionSaveRequest):
    with _flow_lock(flow_id):
        sessions = load_flowbuild_sessions(flow_id)
        messages = [m.dict() for m in body.messages]
        title = body.title or _derive_chat_title(messages)
        now = datetime.datetime.now().timestamp()
        found = False
        for s in sessions:
            if s["id"] == session_id:
                s["messages"] = messages
                s["title"] = title
                s["updated_at"] = now
                found = True
                break
        if not found:
            sessions.append({
                "id": session_id,
                "title": title,
                "messages": messages,
                "created_at": now,
                "updated_at": now,
            })
        save_flowbuild_sessions(flow_id, sessions)
        return {"ok": True, "id": session_id, "title": title}

@app.delete("/api/flows/{flow_id}/flowchat/sessions/{session_id}")
def delete_flowbuild_session(flow_id: str, session_id: str):
    with _flow_lock(flow_id):
        sessions = [s for s in load_flowbuild_sessions(flow_id) if s["id"] != session_id]
        save_flowbuild_sessions(flow_id, sessions)
        return {"ok": True}


@app.get("/api/flows/{flow_id}/eval/summary")
def eval_summary(flow_id: str):
    ev = load_eval_data(flow_id)
    versions = []
    for v in ev["versions"]:
        info = {"id": v["id"], "label": v["label"]}
        runs = [r for r in ev["runs"] if r["version_id"] == v["id"]]
        if runs:
            latest = runs[-1]
            info.update({"passed": latest["passed"], "failed": latest["failed"], "total": latest["total"]})
        versions.append(info)
    return {"versions": versions, "total_cases": len(ev["cases"]),
            "total_evaluators": len(ev["evaluators"]), "total_runs": len(ev["runs"])}


@app.get("/api/flows/{flow_id}/eval/compare")
def eval_compare(flow_id: str):
    """バージョン間のケース別 pass/fail 比較マトリクスを返す。

    各バージョンの最新 run を用いて、ケースタイトルをキーに縦断比較する。
    returns:
      {
        versions: [{id, label, passed, failed, total, run_id}],
        cases: [{title, results: {version_id: {pass, run_id}}}]
      }
    """
    ev = load_eval_data(flow_id)

    # バージョンごとに最新 run を取得
    version_map = {v["id"]: v for v in ev["versions"]}
    latest_run_by_version: dict[str, dict] = {}
    for run in ev["runs"]:
        vid = run.get("version_id")
        if vid:
            latest_run_by_version[vid] = run  # 後勝ち = 最新

    # バージョン順で summary 構築
    versions_out = []
    for v in ev["versions"]:
        vid = v["id"]
        run = latest_run_by_version.get(vid)
        entry: dict = {"id": vid, "label": v["label"]}
        if run:
            entry.update({
                "passed": run["passed"], "failed": run["failed"],
                "total": run["total"], "run_id": run["id"],
                "timestamp": run.get("timestamp", ""),
            })
        versions_out.append(entry)

    # ケース別マトリクス: case_title → {version_id: {pass, run_id}}
    case_matrix: dict[str, dict] = {}
    for vid, run in latest_run_by_version.items():
        for res in run.get("results", []):
            title = res.get("case_title", "")
            if title not in case_matrix:
                case_matrix[title] = {}
            case_matrix[title][vid] = {
                "pass": res.get("pass", False),
                "run_id": run["id"],
            }

    # ケース一覧の順序: eval.json の cases 順 → その後 run で初めて現れたもの
    case_order = [c["title"] for c in ev.get("cases", [])]
    for title in case_matrix:
        if title not in case_order:
            case_order.append(title)

    cases_out = [
        {"title": t, "results": case_matrix.get(t, {})}
        for t in case_order
        if t in case_matrix
    ]

    return {"versions": versions_out, "cases": cases_out}


# ── Serve static frontend ──

def _bust_shared_assets(html: str) -> str:
    """共有 JS/CSS の <script>/<link> src に ?v=<mtime> を付けてキャッシュを確実に無効化する。

    flow-elements.js を編集したら、index を開き直すだけで必ず最新が読まれる。
    """
    import re as _re
    def _ver(rel_path: str) -> str:
        try:
            return str(int((STATIC_DIR / rel_path).stat().st_mtime))
        except Exception:
            return "0"
    for rel in ("shared/flow-elements.js",):
        v = _ver(rel)
        html = _re.sub(
            rf'(/static/{_re.escape(rel)})(\?[^"\']*)?',
            rf'\1?v={v}',
            html,
        )
    return html


@app.get("/")
def root(request: Request):
    index_path = STATIC_DIR / "index.html"
    html = index_path.read_text(encoding="utf-8")
    html = _bust_shared_assets(html)
    if "demo" in request.query_params:
        # Inject demo-dataset.js before the closing </head> tag
        demo_js = STATIC_DIR / "dev-fixtures" / "demo-dataset.js"
        if demo_js.exists():
            script_tag = f"<script>\n{demo_js.read_text(encoding='utf-8')}\n</script>"
            html = html.replace("</head>", f"{script_tag}\n</head>", 1)
    return HTMLResponse(html)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
