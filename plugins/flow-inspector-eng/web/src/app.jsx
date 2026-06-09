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
if (!window.SOCIAL_POSTER) window.SOCIAL_POSTER = null;
if (!window.SIDEBAR || !window.SIDEBAR.length) window.SIDEBAR = [];
if (!window.__DEMO_FLOW__) window.__DEMO_FLOW__ = null;

// Diagram geometry → ./lib/geometry.jsx (Phase 3)

// Flow diagram cluster → ./features/flow/diagram.jsx (Phase 3)

// ══════════ APP ══════════
// React hooks are imported as ESM at the top of this module.

// Small shared UI helpers → ./lib/ui.jsx (Phase 3)

// Palette + sidebar → ./features/palette.jsx (Phase 3)

// G: Inspector area for editing the flow's overall metadata (purpose / inputs / outputs)
// Always editable; the Save button persists to localStorage
// H: shows a "✨ Generate with AI" button if nodes / edges are passed in
//    pressing it calls /api/auto-config (mode=flow-meta) to auto-fill the 3 fields
// Used as the prompt context for F (Let AI handle it)
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

// Whether to show managed (plugin-provided) skills/layers.
// Enabled via the localStorage setting OR the URL's ?include_managed=true.
// The URL flag is the one-click path to show everything from the "skills section is empty" hint.
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
// workflow (nodes/edges) ⇔ board (items/edges) conversion utilities
// workflow: { id, name, nodes: [{id, type, title, subtitle, x, y, meta, ...}], edges: [{from, to, label?}] }
// board: { id, name, items: [{id, type:"node", nodeType, label, subtitle, x, y, w, h, meta}], edges: [{from, to, label}] }
// Board model + persistence → ./lib/board-model.js (Phase 3)

// custom "my functions" helpers → ./lib/custom-functions.js (Phase 3)


// Board/skill chat panels → ./features/chat.jsx (Phase 3)
// Rich Node inspector for the Plan Workspace left dock.
// Reuses the same DetailBody as the skill-editing RightPanel, but since the planning whiteboard
// has no real flow (flowId), it omits workflow.id (= suppresses server PATCH);
// edits are written back to the board (localStorage) via onPatch. Frontmatter is derived from the board's name/purpose.
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

  // Persist the open chat to localStorage and auto-restore it on startup so you can pick up where you left off after a reload.
  // Closing (×) clears the saved state, so it won't auto-open on the next reload. The conversation itself is saved separately per layer.
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
          <span className="section-eyebrow">01 / Config</span>
          <h2 className="section-h">Config Stack</h2>
          <span className="section-rule"></span>
          <span style={{fontFamily:'"Geist Mono", monospace', fontSize:11, color:"var(--tx-4)"}}>Outer = broader scope &middot; Inner = narrower scope</span>
        </div>
        <ClaudeStackPanel activeProject={activeProject} openFile={openFile} onOpenFile={setOpenFile} onCreateClaudeMd={openClaudeMdChat} />

        <div className="section-head">
          <span className="section-eyebrow">02 / Components</span>
          <h2 className="section-h">Registered Items Across All Layers</h2>
          <span className="section-rule"></span>
        </div>

        {/* Plan Workspace: list of multiple boards */}
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
          <span>⌘K Search &middot; ⌘E Toggle Editor &middot; ⌘R Refresh</span>
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
                      onSaved={() => { /* the selector's has_claude_md is refreshed on the next load */ }} />
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
  // Import legacy localStorage boards (fi_plan_board_*) into boards/ on first run.
  // Only when the server list is empty and migration hasn't happened yet. Preserves existing ids (PUT).
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
  // S2: flow edit mode ("view" = FlowDiagram, "edit" = PlanWorkspace editing UI)
  const [flowEditMode, setFlowEditMode] = useState("view");
  const [editingBoard, setEditingBoard] = useState(null);  // board state being edited
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
  const [notifSignal, setNotifSignal] = useState(0);  // bump → DashHeader refetches bell notifications
  // When a flowize job completes, send a signal to refresh the bell (even on a different page)
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
        // include_single=true also fetches plugin-provided single-node skills, kept for the Dashboard's Skill list
        // The include_managed flag is held in localStorage (default false: don't fetch plugin-provided items)
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
          container_path: f.container_path,  // Option B: sub-grouping key for project: sources
          working_dir: f.working_dir,
          kind: f.kind, flowized: f.flowized,  // lazy flowize: initial list state (0 tokens)
        });
      });
      // Sidebar: edit targets = show multi-node flows only (single-node skills are accessed via the Dashboard's Skill list)
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
      // DASH_SKILLS holds all skills (including single-node ones) and groups them into folders by plugin_source
      window.DASH_SKILLS = (grouped["Skills"] || []).map(s => ({
        layer: s.source_layer || "user", name: s.name,
        complexity: s.complexity, nodes: s.nodes,
        desc: s.description || "", flowId: s.id, hasFlow: true,
        plugin_source: s.plugin_source,            // null for user-owned skills
        skill_name: s.skill_name || s.name,
        container_path: s.container_path,          // for project: source (Option B)
        working_dir: s.working_dir,
        kind: s.kind, flowized: s.flowized,        // initial badge state for lazy flowize
      }));
      window.DASH_COMMANDS = (grouped["Commands"] || []).map(c => ({
        layer: c.source_layer || "user", name: "/" + c.name,
        desc: c.description || "",
        flowId: c.id, sourcePath: c.source_path,
        kind: c.kind, flowized: c.flowized,        // initial badge state for lazy flowize
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
          ? [{ id: "managed", title: "MANAGED", path: "~/.claude/plugins/", sub: "Installed plugins", note: "No plugins" }]
          : []),
        { id: "user", title: "USER GLOBAL", path: "~/.claude/", sub: "Personal settings · shared across all projects", note: "No global settings" },
        { id: "user-project", title: "USER × PROJECT", path: "~/.claude/projects/", sub: "Per-project user settings", note: "No project-specific settings" },
        { id: "project", title: "PROJECT", path: "~/projects/*/.claude/", sub: "Project-level settings", note: "No project settings" },
        { id: "local", title: "LOCAL", path: ".claude.local/", sub: "Local overrides", note: "No local overrides" },
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

      // DASH_PROJECTS is fetched from /api/projects (deterministic, single source).
      // Parsing flows' working_dir misses entries and lets junk in when projects_root
      // is something other than ~/projects (e.g. /srv), so we consolidated on a dedicated API.
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
          // In real API mode, if the flow list is empty / fallback triggered and DEMO_FLOW
          // exists, implicitly display in demo fallback mode
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
      subtitle: paletteItem?.subtitle || "New node",
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
      title: spec.title || "New node",
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
        `Please implement the following nodes added to the workflow "${workflow.name}" (${activeId}).`,
        "",
        ...specs.map((s, i) => [
          `## Node ${i + 1}: ${s.title}`,
          `Type: ${s.type}`,
          `Description: ${s.desc || "(not set)"}`,
          `Prompt: ${s.prompt || "(not set)"}`,
          `Position: ${s.after} → [NEW] → ${s.before}`,
          "",
        ].join("\n")),
        "For each node:",
        "1. Formally add the node to the JSON in flows/ (the insert API may be used)",
        "2. Create any required scripts/config files",
        "3. For a hook, register it in .claude/settings.json",
        "4. For an MCP, add it to the config",
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
      alert("Implementation complete! The nodes have been added to the flow.\n\nClaude response:\n" + fullText.substring(0, 500));
    } catch(e) {
      alert("Error: " + e.message);
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
    setSelected(null); // deselect the workflow node
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
        catch (e) { alert("Failed to create board: " + e.message); }
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

  if (!workflow) return (<div className="loading-wrap"><div className="loading-dot" /><span>Select a flow…</span></div>);

  // kind 3/4 (ruleset/reference): show SKILL.md sections as cards instead of a flow diagram.
  // Hand-written flows where attach_kind is unclassified (kind undefined) go to the flow diagram as usual.
  if (workflow.kind >= 3) {
    return <SkillCard flow={workflow} onBack={goToDashboard} />;
  }

  // In edit mode, show the PlanWorkspace (S2). If a node is selected, show the RightPanel on the right.
  if (flowEditMode === "edit") {
    // Rebuild workflow from the board being edited (for incoming/outgoing inside RightPanel)
    const liveWorkflow = editingBoard ? boardToWorkflow(editingBoard, workflow) : workflow;
    // Get the selected item from the board being edited (both node / group flow into RightPanel)
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
                return `Saved (${b.items?.length || 0} nodes) — server`;
              } catch (e) { console.warn("PUT /api/drafts failed; localStorage fallback", e); }
            }
            try {
              localStorage.setItem(lsKey, JSON.stringify({ ...b, savedAt: new Date().toISOString(), _synced: false }));
              return `Saved (${b.items?.length || 0} nodes) — offline`;
            } catch (e) { return `Save failed: ${e.message}`; }
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
                return `Saved → ${info.location}${info.name} (${res.version?.id || "version"})`;
              } catch (e) { console.warn("Save As via API failed; localStorage fallback", e); }
            }
            try {
              localStorage.setItem(info.fullKey, JSON.stringify({ ...b, name: info.name, id: info.fullKey, savedAt: new Date().toISOString(), _synced: false }));
              return `Saved → ${info.location}${info.name} (offline)`;
            } catch (e) { return `Save failed: ${e.message}`; }
          }}
          onDeployTest={(b) => {
            // Backend not implemented: currently a mock (eventually POSTs the board to /api/deploy/test)
            const nodeCount = b?.items?.filter(it => it.type === "node").length || 0;
            return `Deploy test in progress: ${nodeCount} nodes · backend integration coming soon`;
          }}
          onEval={() => setPage("eval")}
          onBack={() => {
            // Close edit mode (discards for now; save logic to be implemented in S2-D)
            if (editingBoard && confirm("Discard your edits and return to view mode?")) {
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
        {/* Edit mode: show RightPanel only when something is selected (floating) */}
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

  // Viewer mode: show PlanWorkspace as readOnly (= matches the edit-mode look)
  // Node selected in viewer mode (for the right panel)
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
      {/* Overview minimap (floating) */}
      <MiniMap workflow={workflow} selected={selected} onSelect={setSelected} />
      {/* Edit-mode toggle button (floating, bottom right) */}
      <button
        className="flow-edit-toggle"
        onClick={() => { setEditingBoard(workflowToBoard(workflow)); setFlowEditMode("edit"); }}
        title="Switch to edit mode (lets you add/move nodes and turn them into functions)"
      >
        ✎ Edit
      </button>
    </div>
  );
}

export default App
