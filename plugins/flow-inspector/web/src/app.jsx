import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { API, apiFetch, apiPatch, apiPost, apiPut, apiDelete } from './lib/api.js'
import { extractTaggedJson } from './lib/json.js'
import { onFlowizeComplete } from './lib/flowize.js'
import { getClientId } from './lib/client-id.js'
import { NODE_TYPES } from './lib/node-types.js'
import { NODE_W, NODE_H, DIAMOND_W, DIAMOND_H, nodeBounds, shapeMeta, shapeElement, edgePath, midpoint } from './lib/geometry.jsx'
import { ParallelFrame, subflowContainerSize, subflowNodePos, SubflowNode, SubflowContainer, Node, StickyNote, FlowDiagram } from './features/flow/diagram.jsx'
import { formatJSON, Section } from './lib/ui.jsx'
import { NodePickerList, ElementsPalette, Sidebar } from './features/palette.jsx'
import { LayerPill, DashHeader, LayerLegend, FileChip, ClaudeLayerBox, MergedClaudeView, ClaudeStackPanel, DashEditor, Acc, DashSubagents, DashSkills, DashMcpList, DashHooksList, DashCommandsList, DashFilesList, DashIntegrations, DashValidation, DashChat } from './features/dashboard.jsx'
import { workflowToBoard, mergeNodeSettingsIntoBoard, boardItemToNode, autoLayoutItems, applyFlowActions, requiredFieldsFor, fiIsEmpty, missingRequiredForBoard, validateFlowForSkill, boardToWorkflow, loadPlanBoard, savePlanBoard, listPlanBoards, savePlanBoardFile, fmtBoardDate, loadPlanBoardFile, listBoardsFile, createBoardFile, deleteBoardFile } from './lib/board-model.js'
import { loadCustomFunctions, saveCustomFunctions, addCustomFunction, removeCustomFunction, buildMyFunctionsCatalog } from './lib/custom-functions.js'
import { FlowBuildChat, SkillDiscussChat, ClaudeMdChat, SkillSaveFlow } from './features/chat.jsx'
import { EvalPage, EvalResults, EvalCases, EvalEvaluators, EvalFlowPane, EvalFlows, EvalChat, ToolChipWithDetail } from './features/eval.jsx'
import { SubagentDetailPage, HookDetailPage, CommandDetailPage, SkillCard, ensureFlowEndpoints } from './features/detail-pages.jsx'


// API helpers + base URL extracted to ./lib/api.js (Phase 3 module split)

// JSON tag-block extraction → ./lib/json.js (Phase 3)

// (apiFetchWithDemo removed — it had zero call sites; dead demo code.)

// Per-tab client id → ./lib/client-id.js (Phase 3)

// Node types → ./lib/node-types.js (Phase 3; module also sets window.NODE_TYPES)
// Preserve values if already set by demo-dataset.js (injected before this script)
if (!window.X_AUTOPILOT) window.X_AUTOPILOT = null;
if (!window.SIDEBAR || !window.SIDEBAR.length) window.SIDEBAR = [];
if (!window.__DEMO_FLOW__) window.__DEMO_FLOW__ = null;

// Diagram geometry → ./lib/geometry.jsx (Phase 3)

// Flow diagram cluster → ./features/flow/diagram.jsx (Phase 3)

// ══════════ APP ══════════
// React hooks are imported as ESM at the top of this module.

// Small shared UI helpers → ./lib/ui.jsx (Phase 3)

// Palette + sidebar → ./features/palette.jsx (Phase 3)

// G: フロー全体のメタ情報 (目的 / 入力物 / 出力物) を編集する Inspector エリア
// 常時編集可能、保存ボタンで localStorage に永続化
// H: nodes / edges が渡されれば「✨ AI で生成」ボタンを表示
//    押すと /api/auto-config (mode=flow-meta) を叩いて 3 フィールドを自動入力
// F (AI に任せる) のプロンプト context として利用される
// Node detail + editors + node-chat + chrome → ./features/node-detail.jsx (Phase 3)
import { FlowMetaEditor, DetailEmpty, FlowSourceView, SourceTextModal, AddressChip, PromptEditor, DescEditor, ConfigEditor, ConfigView, FieldInfoButton, ConfigFieldRow, NodeConfigFields, DetailBody, ChatPanel, AIDesignChat, DraftEditor, RightPanel, DetailPanel, TopBar, Timeline, LogView, BottomDock, MiniMap, DraftBar } from './features/node-detail.jsx'

// ══════════ DASHBOARD (redesigned — from Claude Design) ══════════

// ── Mock data for dashboard (will be replaced by API later) ──
window.LAYERS = {
  "built-in":    { label: "built-in",     color: "#6b7280", short: "B" },
  "managed":     { label: "managed",      color: "#dc2626", short: "M" },
  "user":        { label: "user",         color: "#2563eb", short: "U" },
  "user-project":{ label: "user-project", color: "#7c3aed", short: "UP" },
  "project":     { label: "project",      color: "#15803d", short: "P" },
  "local":       { label: "local",        color: "#d97706", short: "L" },
};

// Demo mode removed for plugin publication: ?demo no longer activates anything.
// window.__DEMO_MODE__ stays undefined, so every `if (window.__DEMO_MODE__ …)`
// branch below is inert; those dead branches are deleted per-module during the
// React/Vite lift. (__INCLUDE_MANAGED__ below is a real feature — kept.)

// managed (プラグイン由来) スキル/レイヤを表示するか。
// localStorage の設定 OR URL の ?include_managed=true のどちらかで有効。
// URL 指定は「スキル欄が空のときの案内」から1クリックで全件表示するための導線。
window.__INCLUDE_MANAGED__ = (
  localStorage.getItem("flow-inspector:include-managed") === "true"
  || new URLSearchParams(location.search).get("include_managed") === "true"
);

// Only set defaults if not already populated by demo-dataset.js.
// ?demo sets __DEMO_MODE__, but only demo-dataset.js sets __DEMO_FLOW__. If the
// flag is on yet the dataset never loaded (demo fixtures not shipped), fall back
// to empty production arrays instead of leaving DASH_* undefined (white screen).
if (!window.__DEMO_MODE__ || !window.__DEMO_FLOW__) {
  window.DASH_PROJECTS = [];
  window.DASH_ACTIVE_PROJECT = null;
  window.CONFIG_STACK = [];
  window.CLAUDE_MD_PREVIEW = "";
  window.DASH_SUBAGENTS = [];
  window.DASH_SKILLS = [];
  window.DASH_MCP = [];
  window.DASH_HOOKS = [];
  window.DASH_COMMANDS = [];
  window.DASH_FILE_TREE = [];
  window.DASH_INTEGRATIONS = [];
  window.DASH_VALIDATION_WARNINGS = [];
}

// ── Dashboard components ──
// Dashboard panels → ./features/dashboard.jsx (Phase 3)
// workflow (nodes/edges) ⇔ board (items/edges) 変換ユーティリティ
// workflow: { id, name, nodes: [{id, type, title, subtitle, x, y, meta, ...}], edges: [{from, to, label?}] }
// board: { id, name, items: [{id, type:"node", nodeType, label, subtitle, x, y, w, h, meta}], edges: [{from, to, label}] }
// Board model + persistence → ./lib/board-model.js (Phase 3)

// custom "my functions" helpers → ./lib/custom-functions.js (Phase 3)


// Board/skill chat panels → ./features/chat.jsx (Phase 3)
// Plan Workspace 左ドック用のリッチ Node インスペクタ。
// skill編集の RightPanel と同じ DetailBody を流用するが、プランニングホワイトボードは
// 実フロー(flowId)を持たないため workflow.id は付けず (= サーバPATCH を抑止)、
// 編集は onPatch でボード(localStorage)へ書き戻す。frontmatter はボードの名前/目的から出す。
// Plan workspace / builder → ./features/plan.jsx (Phase 3)
import { PlanNodeInspector, PlanWorkspace, PlanFlowThumb, PlanNodeCard, PlanSubflowContainer, PlanGroupCard, PlanFlowCard, PlanNote, PlanBoardList } from './features/plan.jsx'

function Dashboard({ onOpenFlow, flowList, onOpenAgent, onOpenHook, onOpenCommand, onOpenPlan, onOpenBoard, onNewBoard, notifSignal }) {
  const [activeProject, setActiveProject] = useState(window.DASH_ACTIVE_PROJECT);
  const [openFile, setOpenFile] = useState(null);
  const [validationOpen, setValidationOpen] = useState(true);
  const [claudeMdChat, setClaudeMdChat] = React.useState(null);  // { project, layerId, layerTitle, targetPath, existing } | null
  const openClaudeMdChat = React.useCallback(async (project, layer) => {
    // layer: a collect_claude_stack entry { id, title, abs_path, present } — or null → project CLAUDE.md
    // project may be null for cross-project layers (USER GLOBAL).
    const layerId = (layer && layer.id) || "project";
    const layerTitle = (layer && layer.title) || "PROJECT";
    const projPath = (project && project.path) ? project.path.replace(/\/$/,"") : "";
    const targetPath = (layer && layer.abs_path) || (projPath ? projPath + "/CLAUDE.md" : "");
    let existing = "";
    if (targetPath) {
      try {
        const r = await fetch(API + `/api/workspace/file?path=${encodeURIComponent(targetPath)}`);
        if (r.ok) existing = (await r.json()).content || "";
      } catch (e) {}
    }
    setClaudeMdChat({ project: project || null, layerId, layerTitle, targetPath, existing });
  }, []);

  // リロードしても続きが見えるよう、開いているチャットを localStorage に保存し、起動時に自動復元。
  // 閉じる(×)と保存が消えるので、次回リロードでは自動で開かない。会話本体は各レイヤーごとに別途保存される。
  React.useEffect(() => {
    try {
      if (claudeMdChat) localStorage.setItem("fi-cmd-open", JSON.stringify(claudeMdChat));
      else localStorage.removeItem("fi-cmd-open");
    } catch (e) {}
  }, [claudeMdChat]);
  React.useEffect(() => {
    try { const s = localStorage.getItem("fi-cmd-open"); if (s) setClaudeMdChat(JSON.parse(s)); } catch (e) {}
  }, []);

  const stats = useMemo(() => ({
    layers: window.CONFIG_STACK.filter(c => c.present).length,
    skills: window.DASH_SKILLS.length,
    agents: window.DASH_SUBAGENTS.length,
    mcp: window.DASH_MCP.length,
    mcpActive: window.DASH_MCP.filter(m => m.active).length,
    hooks: window.DASH_HOOKS.length,
    cmds: window.DASH_COMMANDS.length,
  }), [flowList]);

  // Toggle body class for dashboard scroll behavior
  useEffect(() => {
    document.body.classList.add("is-dashboard");
    return () => document.body.classList.remove("is-dashboard");
  }, []);

  function handleHighlight(domId) {
    let el = document.querySelector(`[data-id="${domId}"]`);
    if (el) { scrollAndHighlight(el); return; }
    // Element not in DOM — likely inside a closed accordion.
    // Open all closed accordions, then retry after React re-renders.
    document.querySelectorAll('.acc:not(.is-open) .acc-head').forEach(h => h.click());
    setTimeout(() => {
      el = document.querySelector(`[data-id="${domId}"]`);
      if (el) scrollAndHighlight(el);
    }, 180);
  }

  function scrollAndHighlight(el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("firefly-highlight");
    void el.offsetWidth; // force reflow
    el.classList.add("firefly-highlight");
    el.addEventListener("animationend", () => {
      el.classList.remove("firefly-highlight");
    }, { once: true });
  }

  return (
    <div className="dash-root">
      <div className="dash-shell">
        <DashHeader activeProject={activeProject} onPickProject={setActiveProject} stats={stats} onOpenFlow={onOpenFlow} notifSignal={notifSignal} />

        <LayerLegend />

        <div className="section-head">
          <span className="section-eyebrow">01 / 設定</span>
          <h2 className="section-h">設定スタック</h2>
          <span className="section-rule"></span>
          <span style={{fontFamily:'"Geist Mono", monospace', fontSize:11, color:"var(--tx-4)"}}>外側 = 広いスコープ &middot; 内側 = 狭いスコープ</span>
        </div>
        <ClaudeStackPanel activeProject={activeProject} openFile={openFile} onOpenFile={setOpenFile} onCreateClaudeMd={openClaudeMdChat} />

        <div className="section-head">
          <span className="section-eyebrow">02 / コンポーネント</span>
          <h2 className="section-h">全レイヤーの登録済みアイテム</h2>
          <span className="section-rule"></span>
        </div>

        {/* Plan Workspace: 複数ボード一覧 */}
        {(onOpenBoard || onNewBoard) && (
          <PlanBoardList onOpenBoard={onOpenBoard} onNewBoard={onNewBoard} />
        )}
        <div className="acc-grid">
          <DashSubagents onOpenAgent={onOpenAgent} />
          <DashSkills onOpenFlow={onOpenFlow} />
          <DashMcpList />
          <DashHooksList onOpenHook={onOpenHook} />
        </div>
        <div style={{marginTop:14}}>
          <DashCommandsList onOpenCommand={onOpenCommand} />
        </div>
        <div className="acc-grid" style={{marginTop:14}}>
          <DashFilesList />
          <DashIntegrations />
        </div>

        <div className="dash-foot">
          <span>flow-inspector &middot; {location.host}</span>
          <span>⌘K 検索 &middot; ⌘E エディタ切替 &middot; ⌘R 更新</span>
        </div>
      </div>

      {validationOpen && window.DASH_VALIDATION_WARNINGS.length > 0 && <DashValidation onDismiss={() => setValidationOpen(false)} />}
      <DashChat onHighlight={handleHighlight} activeProject={activeProject} />
      {claudeMdChat && (
        <ClaudeMdChat key={(claudeMdChat.layerId || "") + ":" + (claudeMdChat.targetPath || "")}
                      project={claudeMdChat.project} existing={claudeMdChat.existing}
                      layerId={claudeMdChat.layerId} layerTitle={claudeMdChat.layerTitle}
                      targetPath={claudeMdChat.targetPath}
                      onClose={() => setClaudeMdChat(null)}
                      onSaved={() => { /* セレクタの has_claude_md は次回ロードで更新される */ }} />
      )}
    </div>
  );
}

// ══════════ EVAL PAGE ══════════

// Eval page cluster → ./features/eval.jsx (Phase 3)

// Detail pages → ./features/detail-pages.jsx (Phase 3)
function App() {
  const [page, setPage] = useState(window.__DEMO_MODE__ ? "flow" : "dashboard"); // "dashboard" | "flow" | "eval" | "subagent" | "hook"
  const [activePlanBoardId, setActivePlanBoardId] = useState("default");
  // 旧 localStorage ボード (fi_plan_board_*) を初回だけ boards/ へ取り込む。
  // サーバ一覧が空かつ未移行のときのみ。既存idを保持 (PUT)。
  React.useEffect(() => {
    if (window.__DEMO_MODE__) return;
    if (localStorage.getItem("fi_boards_migrated") === "1") return;
    (async () => {
      let serverList = [];
      try { const r = await fetch(API + "/api/boards"); if (r.ok) serverList = await r.json(); } catch { return; }
      if (Array.isArray(serverList) && serverList.length > 0) {
        localStorage.setItem("fi_boards_migrated", "1");   // server already has boards; nothing to do
        return;
      }
      const local = (typeof listPlanBoards === "function") ? listPlanBoards() : [];
      for (const meta of local) {
        const full = loadPlanBoard(meta.id);
        if (!full || !full.id) continue;
        try {
          await fetch(API + "/api/boards/" + encodeURIComponent(full.id), {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(full),
          });
        } catch {}
      }
      localStorage.setItem("fi_boards_migrated", "1");
    })();
  }, []);
  const [activeAgent, setActiveAgent] = useState(null);
  const [activeHook, setActiveHook] = useState(null);
  const [activeCommand, setActiveCommand] = useState(null);
  const [systemData, setSystemData] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [flowList, setFlowList] = useState(null);
  const [loading, setLoading] = useState(true);
  // S2: フロー編集モード ("view" = FlowDiagram, "edit" = PlanWorkspace 編集UI)
  const [flowEditMode, setFlowEditMode] = useState("view");
  const [editingBoard, setEditingBoard] = useState(null);  // 編集中の board state
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [activeId, setActiveId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [wsStatus, setWsStatus] = useState(null);
  const [runState, setRunState] = useState("idle");
  const [drafts, setDrafts] = useState([]);
  const [implementing, setImplementing] = useState(false);
  const [aiDesign, setAiDesign] = useState(null); // { afterNode, beforeNode, initialMessage }
  const [paletteSelectedItem, setPaletteSelectedItem] = useState(null); // ELEMENTS catalog item (preview only)
  const [notifSignal, setNotifSignal] = useState(0);  // bump → DashHeader がベル通知を再取得
  // フロー化ジョブが完了したら（別ページにいても）ベルを更新するシグナルを送る
  useEffect(() => onFlowizeComplete(() => setNotifSignal(n => n + 1)), []);

  // Initialize workspace via API. In demo mode skip the API entirely; if the
  // API fails in real mode, set __DEMO_FALLBACK__ so write paths know the
  // server is unreachable and should mirror to localStorage instead.
  async function initWorkspace() {
    if (window.__DEMO_MODE__) {
      setWsStatus({ initialized: true, has_changes: false, changed_files: [], _demo: true });
      return;
    }
    try {
      await apiPost("/api/workspace/init", {});
      const status = await apiFetch("/api/workspace/status");
      setWsStatus(status);
    } catch(e) {
      console.warn("Workspace init failed; entering demo-fallback mode", e);
      window.__DEMO_FALLBACK__ = true;
      setWsStatus({ initialized: false, has_changes: false, changed_files: [], _fallback: true });
    }
  }

  async function loadFlow(id) {
    // Demo mode: serve __DEMO_FLOW__ directly without hitting the API
    if (window.__DEMO_MODE__ && window.__DEMO_FLOW__ && window.__DEMO_FLOW__.id === id) {
      setWorkflow(ensureFlowEndpoints(window.__DEMO_FLOW__));
      return;
    }
    try {
      const data = await apiFetch(`/api/flows/${id}`);
      if (!data || !data.id) throw new Error("Empty flow response");
      setWorkflow(ensureFlowEndpoints(data));
    } catch(e) {
      console.warn("Failed to load flow; using demo fallback if available", e);
      if (window.__DEMO_FLOW__ && window.__DEMO_FLOW__.id === id) {
        window.__DEMO_FALLBACK__ = true;
        setWorkflow(ensureFlowEndpoints(window.__DEMO_FLOW__));
      } else {
        setWorkflow(null);
      }
    }
  }

  async function loadFlowList() {
    let list = [];
    let usedFallback = false;
    if (window.__DEMO_MODE__) {
      // Build a flat list from demo SIDEBAR so the aggregation below works
      list = (window.SIDEBAR || []).flatMap(s => s.items.map(it => ({
        id: it.id, name: it.name, category: s.section,
        description: it.description || "", complexity: it.complexity || "Med",
        node_count: it.nodes || 0, edge_count: 0,
        source_path: it.source_path, source_layer: it.source_layer || "user",
      })));
      usedFallback = true;
    } else {
      try {
        // include_single=true でプラグイン由来の 1 ノード skill も取得し、Dashboard の Skill 一覧用に保持
        // include_managed フラグは localStorage で持つ (デフォルト false: プラグイン由来を取ってこない)
        const includeManaged = window.__INCLUDE_MANAGED__;
        list = await apiFetch(`/api/flows?include_single=true&include_managed=${includeManaged}`);
        if (!Array.isArray(list) || list.length === 0) {
          throw new Error("Empty flows list");
        }
      } catch(e) {
        console.warn("Flow list fetch failed; using demo SIDEBAR if available", e);
        window.__DEMO_FALLBACK__ = true;
        list = (window.SIDEBAR || []).flatMap(s => s.items.map(it => ({
          id: it.id, name: it.name, category: s.section,
          description: it.description || "", complexity: it.complexity || "Med",
          node_count: it.nodes || 0, edge_count: 0,
          source_path: it.source_path, source_layer: it.source_layer || "user",
        })));
        usedFallback = true;
      }
    }
    try {
      const grouped = {};
      list.forEach(f => {
        if (!grouped[f.category]) grouped[f.category] = [];
        grouped[f.category].push({
          id: f.id, name: f.name, nodes: f.node_count,
          complexity: f.complexity, active: true,
          source_path: f.source_path, source_layer: f.source_layer,
          description: f.description,
          plugin_source: f.plugin_source,
          skill_name: f.skill_name,
          container_path: f.container_path,  // Option B: project: 用サブグルーピングキー
          working_dir: f.working_dir,
          kind: f.kind, flowized: f.flowized,  // 遅延フロー化: 一覧の初期状態(0トークン)
        });
      });
      // Sidebar: 編集対象 = 複数ノード のみ表示 (1 ノード skill は Dashboard 側の Skill 一覧でアクセス)
      const sidebarGrouped = {};
      list.forEach(f => {
        if ((f.node_count || 0) <= 1) return;
        if (!sidebarGrouped[f.category]) sidebarGrouped[f.category] = [];
        sidebarGrouped[f.category].push({
          id: f.id, name: f.name, nodes: f.node_count,
          complexity: f.complexity, active: true,
          source_path: f.source_path, source_layer: f.source_layer,
          description: f.description,
        });
      });
      const sidebar = Object.entries(sidebarGrouped).map(([section, items]) => ({ section, items }));
      window.SIDEBAR = sidebar;
      setFlowList(sidebar);

      // Populate DASH_* globals from API data for dashboard
      // DASH_SKILLS は全 skill (1 ノード含む) を保持し、plugin_source でフォルダ表示する
      window.DASH_SKILLS = (grouped["Skills"] || []).map(s => ({
        layer: s.source_layer || "user", name: s.name,
        complexity: s.complexity, nodes: s.nodes,
        desc: s.description || "", flowId: s.id, hasFlow: true,
        plugin_source: s.plugin_source,            // null for user-owned skills
        skill_name: s.skill_name || s.name,
        container_path: s.container_path,          // for project: source (Option B)
        working_dir: s.working_dir,
        kind: s.kind, flowized: s.flowized,        // 遅延フロー化の初期バッジ状態
      }));
      window.DASH_COMMANDS = (grouped["Commands"] || []).map(c => ({
        layer: c.source_layer || "user", name: "/" + c.name,
        desc: c.description || "",
        flowId: c.id, sourcePath: c.source_path,
        kind: c.kind, flowized: c.flowized,        // 遅延フロー化の初期バッジ状態
      }));
      window.DASH_HOOKS = (grouped["Hooks"] || []).map(h => ({
        layer: h.source_layer || "user", type: "Hook",
        name: h.name, matcher: "", script: "",
      }));
      window.DASH_SUBAGENTS = (grouped["Subagents"] || []).map(a => ({
        layer: a.source_layer || "project", name: a.name,
        desc: a.description || "", flowId: a.id, hasFlow: true,
        nodes: a.node_count,
      }));

      // Build CONFIG_STACK from discovered layers (matching LayerBox expected shape)
      const layersFound = new Set();
      const filesByLayer = {};
      function shortPath(p) {
        if (!p) return p;
        const hm = p.match(/^(\/Users\/[^/]+|\/home\/[^/]+)/);
        let s = hm ? "~" + p.slice(hm[1].length) : p;
        // Shorten plugin cache paths: ~/.claude/plugins/cache/X/Y/hash/skills/name/SKILL.md → plugins:X/skills/name/SKILL.md
        const pluginMatch = s.match(/~\/\.claude\/plugins\/(?:cache|marketplaces)\/([^/]+)\/(?:[^/]+\/)?(?:[^/]+\/)?skills\/(.+)/);
        if (pluginMatch) return `plugins:${pluginMatch[1]}/skills/${pluginMatch[2]}`;
        // Shorten ~/.claude/projects/ paths
        s = s.replace(/~\/\.claude\/projects\//, "projects:/");
        return s;
      }
      list.forEach(f => {
        if (f.source_layer) layersFound.add(f.source_layer);
        if (f.source_path) {
          const layer = f.source_layer || "user";
          if (!filesByLayer[layer]) filesByLayer[layer] = [];
          const displayName = shortPath(f.source_path);
          if (!filesByLayer[layer].find(x => x.path === f.source_path)) {
            filesByLayer[layer].push({ name: displayName, exists: true, path: f.source_path });
          }
        }
      });
      const includeManagedLayer = window.__INCLUDE_MANAGED__;
      const layerDefs = [
        ...(includeManagedLayer
          ? [{ id: "managed", title: "MANAGED", path: "~/.claude/plugins/", sub: "インストール済みプラグイン", note: "プラグインなし" }]
          : []),
        { id: "user", title: "USER GLOBAL", path: "~/.claude/", sub: "個人設定 · 全プロジェクト共通", note: "グローバル設定なし" },
        { id: "user-project", title: "USER × PROJECT", path: "~/.claude/projects/", sub: "プロジェクト別ユーザー設定", note: "プロジェクト固有設定なし" },
        { id: "project", title: "PROJECT", path: "~/projects/*/.claude/", sub: "プロジェクトレベル設定", note: "プロジェクト設定なし" },
        { id: "local", title: "LOCAL", path: ".claude.local/", sub: "ローカル上書き", note: "ローカル上書きなし" },
      ];
      window.CONFIG_STACK = layerDefs.map(ld => ({
        id: ld.id, layer: ld.id, title: ld.title,
        path: ld.path, sub: ld.sub, note: ld.note,
        present: layersFound.has(ld.id),
        files: (filesByLayer[ld.id] || []).slice(0, 20),
      }));

      // Build DASH_FILE_TREE from source paths
      window.DASH_FILE_TREE = Object.entries(filesByLayer).map(([layer, files]) => ({
        root: layer, files: files,
      }));

      // DASH_PROJECTS は /api/projects（決定論・単一ソース）から取得する。
      // フローの working_dir 解析は projects_root が ~/projects 以外（例 /srv）だと
      // 取りこぼし・ゴミ混入が起きるため、専用 API に一本化した。
      try {
        const pj = await apiFetch("/api/projects");
        window.DASH_PROJECTS = (pj.projects || []).map(p => {
          let h = 0;
          for (let i = 0; i < p.path.length; i++) { h = ((h << 5) - h + p.path.charCodeAt(i)) | 0; }
          const hash = Math.abs(h).toString(16).slice(0, 6);
          return { id: p.name, name: p.name, path: p.path, hash,
                   has_claude_md: p.has_claude_md, has_claude_dir: p.has_claude_dir, active: false };
        });
      } catch (e) { console.warn("Failed to load /api/projects", e); window.DASH_PROJECTS = window.DASH_PROJECTS || []; }
    } catch(e) { console.warn("Failed to load flows", e); }
  }

  // Navigate from dashboard to a specific flow
  function openFlow(flowId) {
    setActiveId(flowId);
    setSelected(null);
    setPage("flow");
    loadFlow(flowId);
  }

  function goToDashboard() {
    setPage("dashboard");
  }

  useEffect(() => {
    if (window.__DEMO_MODE__ && window.__DEMO_FLOW__) {
      // Demo mode: use preloaded demo data, skip API
      setWorkflow(window.__DEMO_FLOW__);
      setActiveId(window.__DEMO_FLOW__.id);
      setFlowList(window.SIDEBAR);
      setLoading(false);
    } else {
      initWorkspace()
        .then(() => loadFlowList())
        .then(() => {
          // 実 API モードでフローリストが空 / フォールバック発動かつ DEMO_FLOW が
          // ある場合は、暗黙的に demo フォールバックモードで表示
          if ((window.__DEMO_FALLBACK__ || !window.SIDEBAR || window.SIDEBAR.length === 0)
              && window.__DEMO_FLOW__) {
            window.__DEMO_FALLBACK__ = true;
            setWorkflow(window.__DEMO_FLOW__);
            setActiveId(window.__DEMO_FLOW__.id);
            if (window.SIDEBAR) setFlowList(window.SIDEBAR);
          }
          setLoading(false);
        });
    }
  }, []);

  useEffect(() => { if (page === "flow" && !window.__DEMO_MODE__) loadFlow(activeId); }, [activeId]);

  function handleSaved() { loadFlow(activeId); }

  // ── Draft node management ──
  let draftCounter = useRef(0);

  function addDraft(type, afterNodeId, beforeNodeId, paletteItem = null) {
    draftCounter.current += 1;
    const afterNode = workflow.nodes.find(n => n.id === afterNodeId);
    const beforeNode = workflow.nodes.find(n => n.id === beforeNodeId);
    if (!afterNode || !beforeNode) return;

    const t = window.NODE_TYPES[type] || {};
    const draftId = `draft_${draftCounter.current}`;
    const gapNeeded = 56 + 30 + 40; // NODE_H + spacing + extra margin
    const midY = (afterNode.y + beforeNode.y) / 2;
    const draftY = Math.max(afterNode.y + gapNeeded, midY);
    const newDraft = {
      id: draftId,
      type,
      title: paletteItem?.title || t.label || type,
      subtitle: paletteItem?.subtitle || "新規ノード",
      desc: paletteItem?.desc || "",
      prompt: "",
      config: paletteItem?.meta || null,
      meta: paletteItem?.meta || {},
      x: (afterNode.x + beforeNode.x) / 2,
      y: draftY,
      input: (paletteItem?.meta?.io?.in) ? { _: paletteItem.meta.io.in } : {},
      output: (paletteItem?.meta?.io?.out) ? { _: paletteItem.meta.io.out } : {},
      duration: "—",
      depends: [afterNodeId],
      _isDraft: true,
      _afterNode: afterNodeId,
      _beforeNode: beforeNodeId,
      _sourceId: paletteItem?.source_id || null,
    };
    setDrafts(prev => [...prev, newDraft]);
    setSelected(draftId);
  }

  function updateDraft(draftId, updates) {
    setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, ...updates } : d));
  }

  function removeDraft(draftId) {
    setDrafts(prev => prev.filter(d => d.id !== draftId));
    if (selected === draftId) setSelected(null);
  }

  // ── AI-assisted node design ──
  function startAIDesign(message, afterNodeId, beforeNodeId) {
    setAiDesign({ afterNode: afterNodeId, beforeNode: beforeNodeId, initialMessage: message });
  }

  function applyAISpec(spec) {
    // Create a draft node from AI's designed spec
    if (!aiDesign) return;
    const afterNode = workflow.nodes.find(n => n.id === aiDesign.afterNode);
    const beforeNode = workflow.nodes.find(n => n.id === aiDesign.beforeNode);
    if (!afterNode || !beforeNode) return;

    draftCounter.current += 1;
    const draftId = `draft_${draftCounter.current}`;
    const gapNeeded = 56 + 30 + 40;
    const midY = (afterNode.y + beforeNode.y) / 2;
    const draftY = Math.max(afterNode.y + gapNeeded, midY);
    const newDraft = {
      id: draftId,
      type: spec.type || "hook",
      title: spec.title || "新規ノード",
      subtitle: spec.subtitle || "",
      desc: spec.desc || "",
      prompt: spec.prompt || "",
      config: spec.config || null,
      x: (afterNode.x + beforeNode.x) / 2,
      y: draftY,
      input: {},
      output: {},
      duration: "—",
      depends: [aiDesign.afterNode],
      _isDraft: true,
      _afterNode: aiDesign.afterNode,
      _beforeNode: aiDesign.beforeNode,
    };
    setDrafts(prev => [...prev, newDraft]);
    setSelected(draftId);
    setAiDesign(null);
  }

  function cancelAIDesign() {
    setAiDesign(null);
  }

  function discardDrafts() { setDrafts([]); setSelected(null); }

  async function implementDrafts() {
    setImplementing(true);
    try {
      // Build implementation request for Claude CLI
      const specs = drafts.map(d => {
        const afterNode = workflow.nodes.find(n => n.id === d._afterNode);
        const beforeNode = workflow.nodes.find(n => n.id === d._beforeNode);
        return {
          type: d.type,
          title: d.title,
          desc: d.desc,
          prompt: d.prompt,
          after: `${afterNode?.title} (${d._afterNode})`,
          before: `${beforeNode?.title} (${d._beforeNode})`,
          address: `flow:${activeId}/${d.id}`,
        };
      });

      const prompt = [
        `ワークフロー「${workflow.name}」(${activeId})に以下のノードを追加実装してください。`,
        "",
        ...specs.map((s, i) => [
          `## Node ${i + 1}: ${s.title}`,
          `Type: ${s.type}`,
          `Description: ${s.desc || "(未設定)"}`,
          `Prompt: ${s.prompt || "(未設定)"}`,
          `Position: ${s.after} → [NEW] → ${s.before}`,
          "",
        ].join("\n")),
        "各ノードについて:",
        "1. flows/のJSONに正式にノードを追加（insert API使用可）",
        "2. 必要なスクリプト/設定ファイルを作成",
        "3. hookの場合は .claude/settings.json に登録",
        "4. MCPの場合は設定に追加",
      ].join("\n");

      // Send to Claude CLI via chat API
      const res = await fetch(API + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          flow_id: activeId,
        }),
      });

      // Read the full response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try { fullText += JSON.parse(line.slice(6)).text; } catch(e) {}
          }
        }
      }

      // Also save the drafts to the JSON via the insert API
      for (const d of drafts) {
        try {
          await apiPost(`/api/flows/${activeId}/nodes`, {
            after_node: d._afterNode,
            type: d.type,
            title: d.title,
            subtitle: d.subtitle,
            desc: d.desc || "",
            prompt: d.prompt || "",
            config: d.config,
          });
        } catch(e) { console.error("Failed to insert node", e); }
      }

      // Reload flow, clear drafts
      await loadFlow(activeId);
      setDrafts([]);
      alert("実装完了！ノードがフローに追加されました。\n\nClaude応答:\n" + fullText.substring(0, 500));
    } catch(e) {
      alert("エラー: " + e.message);
    }
    setImplementing(false);
  }

  useEffect(() => { if (selected) setPaletteSelectedItem(null); }, [selected]);

  function paletteItemToNode(item) {
    if (!item) return null;
    return {
      id: `palette-${item.id}`,
      type: item.type,
      title: item.title,
      subtitle: item.subtitle || "",
      desc: item.desc || "",
      prompt: "",
      config: item.meta || null,
      x: 0, y: 0,
      input: (item.meta && item.meta.io && item.meta.io.in) ? { _: item.meta.io.in } : {},
      output: (item.meta && item.meta.io && item.meta.io.out) ? { _: item.meta.io.out } : {},
      duration: "—",
      depends: [],
      meta: item.meta || {},
      _isPaletteItem: true,
      _sourceId: item.id,
    };
  }

  function onSelectPaletteItem(item) {
    setPaletteSelectedItem(item);
    setSelected(null); // workflow node の選択を解除
  }

  const selectedNode = selected && workflow
    ? (workflow.nodes.find(n => n.id === selected) || drafts.find(d => d.id === selected))
    : (paletteSelectedItem ? paletteItemToNode(paletteSelectedItem) : null);

  // (removed ctx/layouts/Layout — fed only the unreachable Layout* dev-mockups)

  function openEval() {
    setPage("eval");
  }

  if (loading) return (<div className="loading-wrap"><div className="loading-dot" /><span>Loading flows…</span></div>);

  if (page === "dashboard") {
    return (<Dashboard onOpenFlow={openFlow} flowList={flowList} notifSignal={notifSignal} onOpenAgent={(idx) => { setActiveAgent(window.DASH_SUBAGENTS[idx]); setPage("subagent"); }} onOpenHook={(idx) => { setActiveHook(window.DASH_HOOKS[idx]); setPage("hook"); }} onOpenCommand={(idx) => { const c = window.DASH_COMMANDS[idx]; if (c && c.flowId) { openFlow(c.flowId); } else { setActiveCommand(c); setPage("command"); } }}
      onOpenPlan={() => { setActivePlanBoardId("default"); setPage("plan"); }}
      onOpenBoard={(id) => { setActivePlanBoardId(id || "default"); setPage("plan"); }}
      onNewBoard={async () => {
        try { const b = await createBoardFile(); setActivePlanBoardId(b.id); setPage("plan"); }
        catch (e) { alert("ボードの作成に失敗しました: " + e.message); }
      }} />);
  }

  if (page === "plan") {
    return (<PlanWorkspace key={activePlanBoardId} boardId={activePlanBoardId} flowList={flowList} richInspector floatingPalette flowChat onBack={() => setPage("dashboard")} onOpenFlow={(flowId) => openFlow(flowId)} />);
  }

  if (page === "eval") {
    return (<EvalPage flowId={activeId} flowName={workflow ? workflow.name : ""} currentFlow={workflow} onBack={() => setPage("flow")} />);
  }

  if (page === "subagent" && activeAgent) {
    return (<SubagentDetailPage agent={activeAgent} onBack={() => setPage("dashboard")} />);
  }

  if (page === "command" && activeCommand) {
    return (<CommandDetailPage command={activeCommand} onBack={() => setPage("dashboard")} />);
  }
  if (page === "hook" && activeHook) {
    return (<HookDetailPage hook={activeHook} onBack={() => setPage("dashboard")} />);
  }

  if (!workflow) return (<div className="loading-wrap"><div className="loading-dot" /><span>フローを選択してください…</span></div>);

  // kind 3/4 (ruleset/reference): フロー図ではなく SKILL.md の節をカード表示する。
  // attach_kind が未分類 (kind undefined) の手書きフロー等は通常どおりフロー図へ。
  if (workflow.kind >= 3) {
    return <SkillCard flow={workflow} onBack={goToDashboard} />;
  }

  // 編集モード時は PlanWorkspace を表示 (S2)。選択中ノードがあれば右に RightPanel
  if (flowEditMode === "edit") {
    // 編集中ボード基準で workflow を再構築 (RightPanel 内 incoming/outgoing 用)
    const liveWorkflow = editingBoard ? boardToWorkflow(editingBoard, workflow) : workflow;
    // 編集中ボードから選択アイテムを取得 (node / group どちらも RightPanel に流す)
    const editSelectedItem = (selected && editingBoard)
      ? editingBoard.items.find(it => it.id === selected)
      : null;
    const editSelectedNode = editSelectedItem ? boardItemToNode(editSelectedItem) : null;
    return (
      <div className="flow-viewer-layout">
        <PlanWorkspace
          key={`flow-edit-${workflow.id}`}
          controlled
          floatingPalette
          flowChat
          flowId={workflow.id}
          sourceType={workflow.source?.type}
          controlledSelectedId={selected}
          boardId={`flow_${workflow.id}`}
          flowList={flowList}
          initialBoard={editingBoard || workflowToBoard(workflow)}
          onBoardChange={(b) => setEditingBoard(b)}
          onSelectionChange={(ids) => setSelected(ids.length > 0 ? ids[0] : null)}
          saveAsCategory="skill"
          onSave={async (b) => {
            const flowId = workflow.id;
            const lsKey = `fi_saved_flow_${flowId}`;
            if (!window.__DEMO_MODE__ && !window.__DEMO_FALLBACK__) {
              try {
                const res = await apiPut(`/api/drafts/${flowId}`, { board: b, client_id: getClientId() });
                try { localStorage.setItem(lsKey, JSON.stringify({ ...b, savedAt: res.saved_at, _synced: true })); } catch {}
                return `保存しました (${b.items?.length || 0} ノード) — サーバー`;
              } catch (e) { console.warn("PUT /api/drafts failed; localStorage fallback", e); }
            }
            try {
              localStorage.setItem(lsKey, JSON.stringify({ ...b, savedAt: new Date().toISOString(), _synced: false }));
              return `保存しました (${b.items?.length || 0} ノード) — オフライン`;
            } catch (e) { return `保存失敗: ${e.message}`; }
          }}
          onSaveAs={async (b, info) => {
            // info: { location, name, fullKey }
            const flowId = workflow.id;
            if (!window.__DEMO_MODE__ && !window.__DEMO_FALLBACK__) {
              try {
                await apiPut(`/api/drafts/${flowId}`, { board: b, client_id: getClientId() });
                const res = await apiPost(`/api/flows/${flowId}/versions`, {
                  label: info.name,
                  notes: `Saved As: ${info.location}${info.name}`,
                });
                try { localStorage.setItem(info.fullKey, JSON.stringify({ ...b, name: info.name, id: info.fullKey, savedAt: new Date().toISOString(), _versionId: res.version?.id, _synced: true })); } catch {}
                return `保存しました → ${info.location}${info.name} (${res.version?.id || "version"})`;
              } catch (e) { console.warn("Save As via API failed; localStorage fallback", e); }
            }
            try {
              localStorage.setItem(info.fullKey, JSON.stringify({ ...b, name: info.name, id: info.fullKey, savedAt: new Date().toISOString(), _synced: false }));
              return `保存しました → ${info.location}${info.name} (オフライン)`;
            } catch (e) { return `保存失敗: ${e.message}`; }
          }}
          onDeployTest={(b) => {
            // バックエンド未実装: 現状はモック (将来は POST /api/deploy/test に board を送る)
            const nodeCount = b?.items?.filter(it => it.type === "node").length || 0;
            return `デプロイテスト準備中: ${nodeCount} ノード · バックエンド連携は近日実装予定`;
          }}
          onEval={() => setPage("eval")}
          onBack={() => {
            // 編集モードを閉じる (今は破棄。保存ロジックは S2-D で実装予定)
            if (editingBoard && confirm("編集を破棄して閲覧モードに戻りますか?")) {
              setEditingBoard(null);
              setFlowEditMode("view");
              setSelected(null);
            } else if (!editingBoard) {
              setFlowEditMode("view");
              setSelected(null);
            }
          }}
          onOpenFlow={(flowId) => openFlow(flowId)}
        />
        {/* 編集モード: 選択時のみ RightPanel を表示 (floating) */}
        {editSelectedNode && (
          <RightPanel
            floating
            node={editSelectedNode}
            workflow={liveWorkflow}
            onClose={() => setSelected(null)}
            onJump={setSelected}
            onSaved={() => {}}
            drafts={[]}
            updateDraft={() => {}}
            removeDraft={() => {}}
            aiDesign={null}
            onAIApplySpec={() => {}}
            onAICancelDesign={() => {}}
            onApplyNodeSettings={(nodeId, settings) => setEditingBoard(b => mergeNodeSettingsIntoBoard(b, nodeId, settings))}
          />
        )}
      </div>
    );
  }

  // ビューアモード: PlanWorkspace を readOnly で表示 (=見た目を編集モードと統一)
  // ビューア時に選択されたノード (右パネル表示用)
  const selectedNodeFromBoard = selected
    ? workflow.nodes.find(n => n.id === selected)
    : null;
  return (
    <div className="flow-viewer-layout">
      <PlanWorkspace
        key={`flow-view-${workflow.id}`}
        controlled
        readOnly
        hidePalette
        controlledSelectedId={selected}
        boardId={`view_${workflow.id}`}
        flowList={flowList}
        initialBoard={workflowToBoard(workflow)}
        onBack={() => setPage("dashboard")}
        onOpenFlow={(flowId) => openFlow(flowId)}
        onSelectionChange={(ids) => setSelected(ids.length > 0 ? ids[0] : null)}
      />
      <RightPanel
        node={selectedNodeFromBoard}
        workflow={workflow}
        onClose={() => setSelected(null)}
        onJump={setSelected}
        onSaved={() => {}}
        drafts={[]}
        updateDraft={() => {}}
        removeDraft={() => {}}
        aiDesign={null}
        onAIApplySpec={() => {}}
        onAICancelDesign={() => {}}
      />
      {/* Overview ミニマップ (浮動) */}
      <MiniMap workflow={workflow} selected={selected} onSelect={setSelected} />
      {/* 編集モード切替ボタン (右下 floating) */}
      <button
        className="flow-edit-toggle"
        onClick={() => { setEditingBoard(workflowToBoard(workflow)); setFlowEditMode("edit"); }}
        title="編集モードに切り替え (ノード追加/移動/関数化が可能になります)"
      >
        ✎ 編集
      </button>
    </div>
  );
}

export default App
