// Board <-> workflow model + plan-board persistence. Phase 3 lib module
// (pure functions, extracted verbatim; shared by App + PlanWorkspace).
import { API } from './api.js'
import { NODE_TYPES } from './node-types.js'
import { loadCustomFunctions } from './custom-functions.js'

export function workflowToBoard(workflow) {
  if (!workflow) return null;
  return {
    id: workflow.id || "wf",
    name: workflow.name || "(untitled)",
    desc: workflow.description || "",
    items: (workflow.nodes || []).map(n => {
      // Nodes that carry an inner flow (flowizer's inner_flow output) are converted
      // into the same group block as a "my function". collapsed=true shows them as a
      // single block, and "+" expands them out to the right
      // (reusing PlanGroupCard + PlanSubflowContainer + expandGroup as-is).
      const inner = n.inner_flow && Array.isArray(n.inner_flow.nodes) && n.inner_flow.nodes.length
        ? n.inner_flow : null;
      if (inner) {
        const NT = window.NODE_TYPES || {};
        return {
          id: n.id, type: "group",
          label: n.title || n.id,
          description: n.subtitle || "",
          color: (NT[n.type] && NT[n.type].color) || "#7c3aed",
          shape: "rounded",
          collapsed: true,
          // Normalize child nodes into the board's node format. inner_flow uses the
          // wide coordinates meant for the main flow (DY=130), so compress the vertical
          // spacing to fit the subflow preview (PlanSubflowContainer normalizes the bbox
          // to localMin, so no min subtraction is needed — scaling alone is enough).
          // Keep x as-is to preserve the horizontal branch positions.
          items: inner.nodes.map(c => ({
            id: c.id, type: "node", nodeType: c.type,
            label: c.title || c.id, subtitle: c.subtitle || "",
            x: c.x || 0, y: Math.round((c.y || 0) * 0.55), w: 180, h: 60,
            meta: { ...(c.meta || {}), desc: c.desc },
          })),
          edges: (inner.edges || []).map(e => ({ from: e.from, to: e.to, label: e.label || "" })),
          x: (n.x || 0) - 130, y: (n.y || 0) - 36, w: 260, h: 72,
        };
      }
      return {
        id: n.id, type: "node", nodeType: n.type,
        label: n.title || n.id, subtitle: n.subtitle || "",
        meta: {
          ...(n.meta || {}),
          desc: n.desc, input: n.input, output: n.output,
          depends: n.depends, parallel: n.parallel, duration: n.duration,
          subtype: n.subtype,  // referenced by the trigger-source badge (systemd/cron/github-actions)
          // Inner flow: keep subflow (legacy/demo). PlanNodeCard shows "📂 N nodes".
          // inner_flow (flowizer) is already handled by the group branch above.
          subflow: n.subflow || undefined,
        },
        x: (n.x || 0) - 90, y: (n.y || 0) - 30, w: 180, h: 60,
      };
    }),
    edges: (workflow.edges || []).map(e => ({ from: e.from, to: e.to, label: e.label || "" })),
    view: { x: 0, y: 0, k: 0.9 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Apply the {desc, config} confirmed in chat to the matching node on the Plan Workspace board.
// Board nodes keep their settings in meta (not config), so merge the config keys into meta,
// and put desc into meta.desc. Returns a new board object.
export function mergeNodeSettingsIntoBoard(board, nodeId, settings) {
  if (!board || !board.items) return board;
  const { desc, config } = settings || {};
  return {
    ...board,
    items: board.items.map(it => {
      if (it.id !== nodeId || it.type !== "node") return it;
      const nextMeta = { ...(it.meta || {}) };
      if (config && typeof config === "object") {
        for (const [k, v] of Object.entries(config)) nextMeta[k] = v;
      }
      if (desc !== undefined) nextMeta.desc = desc;
      return { ...it, meta: nextMeta };
    }),
    updatedAt: new Date().toISOString(),
  };
}
// Convert a board item ({id,type:"node"|"group",nodeType,label,subtitle,meta,...})
// into the node shape that DetailBody / RightPanel expect.
export function boardItemToNode(item) {
  if (!item) return null;
  if (item.type === "group") {
    return {
      id: item.id,
      type: "group",
      title: item.label || "(untitled group)",
      subtitle: item.description || `${(item.items || []).length} items`,
      desc: item.description || `This group contains ${(item.items || []).length} items`,
      input: {}, output: {},
      meta: { color: item.color, shape: item.shape, collapsed: item.collapsed, items: item.items, edges: item.edges },
      depends: [], duration: "",
    };
  }
  if (item.type === "node") {
    return {
      id: item.id,
      type: item.nodeType,
      title: item.label,
      subtitle: item.subtitle || "",
      desc: item.meta?.desc || "",
      input: item.meta?.input || {},
      output: item.meta?.output || {},
      meta: item.meta || {},
      depends: item.meta?.depends || [],
      parallel: item.meta?.parallel,
      duration: item.meta?.duration || "",
    };
  }
  return null;  // don't pass notes etc. to the detail panel
}
// Pure function that derives a hierarchy (depth) from edge directions and re-lays out
// nodes in a grid. direction: "vertical" (default, top→bottom) | "horizontal" (left→right).
// Returns a new items array with x/y rewritten (anything other than node/group is left as-is).
export function autoLayoutItems(items, edges, opts) {
  const dir = (opts && opts.direction === "horizontal") ? "horizontal" : "vertical";
  const nodes = (items || []).filter(it => it.type === "node" || it.type === "group");
  if (nodes.length === 0) return items;
  const ids = new Set(nodes.map(n => n.id));
  const eds = (edges || []).filter(e => ids.has(e.from) && ids.has(e.to));
  const depth = {}; nodes.forEach(n => { depth[n.id] = 0; });
  let changed = true, guard = 0;
  while (changed && guard++ < nodes.length + 5) {
    changed = false;
    for (const e of eds) { if (depth[e.to] < depth[e.from] + 1) { depth[e.to] = depth[e.from] + 1; changed = true; } }
  }
  const byLayer = {};
  nodes.forEach(n => { const d = depth[n.id]; (byLayer[d] = byLayer[d] || []).push(n); });
  const MAIN = 150, CROSS = 240, baseX = 560, baseY = 120;
  const pos = {};
  Object.keys(byLayer).map(Number).sort((a, b) => a - b).forEach(d => {
    const layer = byLayer[d];
    layer.forEach((n, i) => {
      const off = (i - (layer.length - 1) / 2) * CROSS;
      if (dir === "horizontal") pos[n.id] = { x: baseX + d * CROSS + 200, y: baseY + off + 200 };
      else pos[n.id] = { x: baseX + off, y: baseY + d * MAIN };
    });
  });
  return items.map(it => pos[it.id] ? { ...it, x: Math.round(pos[it.id].x), y: Math.round(pos[it.id].y) } : it);
}
// Pure function that applies a flow-builder AI chat's action plan (flow_actions) to the board.
// Returns: { board: new board, summary: human-readable lines[], warnings: string[] }
// New nodes use action.ref as a temporary id so edges within the same batch can reference them.
export function applyFlowActions(board, actions) {
  const warnings = [];
  const summary = [];
  let items = (board.items || []).map(it => ({ ...it }));
  let edges = (board.edges || []).map(e => ({ ...e }));
  const refMap = {};  // add_node ref -> assigned real id
  const tsBase = Date.now();
  let counter = 0;
  const newId = () => `an_${tsBase}_${counter++}`;
  const resolve = (ref) => (ref != null && refMap[ref]) ? refMap[ref] : ref;
  const findItem = (id) => items.find(it => it.id === id);
  const labelOf = (id) => { const it = findItem(id); return it ? it.label : id; };

  // Placement of new nodes: stack them vertically below the current bottommost node.
  // For an empty board, start at a visible position (canvas x≈600) so nodes aren't
  // hidden behind the left palette/dock (~400px on the left of the screen).
  let nextY = items.length ? Math.max(...items.map(it => (it.y || 0) + (it.h || 60))) + 60 : 120;
  const baseX = items.length ? Math.round(items.reduce((a, it) => a + (it.x || 0), 0) / items.length) : 600;

  const list = Array.isArray(actions) ? actions : [];

  // Pass 1: add_node (handled first so refs can be resolved)
  for (const a of list) {
    if (!a || a.op !== "add_node") continue;
    const nt = a.nodeType || a.type;
    if (!nt || !(window.NODE_TYPES && window.NODE_TYPES[nt])) {
      warnings.push(`Unknown node type "${nt}" (${a.title || "?"}) — skipped`);
      continue;
    }
    const id = newId();
    if (a.ref) refMap[a.ref] = id;
    const meta = { ...(a.config || {}) };
    if (a.desc !== undefined) meta.desc = a.desc;
    items.push({
      id, type: "node", nodeType: nt,
      label: a.title || nt, subtitle: a.subtitle || "",
      meta, x: baseX - 90, y: nextY, w: 180, h: 60,
    });
    nextY += 140;
    summary.push(`➕ Added node: ${a.title || nt} (${(window.NODE_TYPES[nt].label) || nt}${a.subtitle ? " / " + a.subtitle : ""})`);
  }

  // Pass 2: set_settings / edge ops / remove
  for (const a of list) {
    if (!a || !a.op || a.op === "add_node") continue;
    if (a.op === "set_settings") {
      const id = resolve(a.node);
      const it = findItem(id);
      if (!it) { warnings.push(`Settings: node "${a.node}" not found — skipped`); continue; }
      const meta = { ...(it.meta || {}) };
      if (a.config && typeof a.config === "object") for (const [k, v] of Object.entries(a.config)) meta[k] = v;
      if (a.desc !== undefined) meta.desc = a.desc;
      it.meta = meta;
      summary.push(`🔧 Settings: updated ${it.label}`);
    } else if (a.op === "add_edge") {
      const from = resolve(a.from), to = resolve(a.to);
      if (!findItem(from) || !findItem(to)) { warnings.push(`Edge: ${a.from}→${a.to} has a missing endpoint — skipped`); continue; }
      if (edges.some(e => e.from === from && e.to === to)) continue;
      edges.push({ from, to, label: a.label || "" });
      summary.push(`🔗 Edge: ${labelOf(from)} → ${labelOf(to)}`);
    } else if (a.op === "reconnect_edge") {
      const from = resolve(a.from), to = resolve(a.to);
      const idx = edges.findIndex(e => e.from === from && e.to === to);
      if (idx < 0) { warnings.push(`Reconnect: ${a.from}→${a.to} does not exist — skipped`); continue; }
      const nf = a.new_from !== undefined ? resolve(a.new_from) : from;
      const nt2 = a.new_to !== undefined ? resolve(a.new_to) : to;
      if (!findItem(nf) || !findItem(nt2)) { warnings.push(`Reconnect: new endpoint not found — skipped`); continue; }
      edges[idx] = { from: nf, to: nt2, label: a.label !== undefined ? a.label : edges[idx].label };
      summary.push(`🔗 Reconnected: ${labelOf(nf)} → ${labelOf(nt2)}`);
    } else if (a.op === "remove_node") {
      const id = resolve(a.node);
      const it = findItem(id);
      if (!it) { warnings.push(`Remove: node "${a.node}" does not exist — skipped`); continue; }
      const lbl = it.label;
      items = items.filter(x => x.id !== id);
      edges = edges.filter(e => e.from !== id && e.to !== id);
      summary.push(`🗑 Removed: node ${lbl}`);
    } else if (a.op === "remove_edge") {
      const from = resolve(a.from), to = resolve(a.to);
      const before = edges.length;
      edges = edges.filter(e => !(e.from === from && e.to === to));
      if (edges.length === before) { warnings.push(`Remove: edge ${a.from}→${a.to} does not exist — skipped`); continue; }
      summary.push(`🗑 Removed: edge ${a.from} → ${a.to}`);
    } else if (a.op === "auto_layout") {
      items = autoLayoutItems(items, edges, { direction: a.direction });
      summary.push(`🧹 Auto-arranged layout${a.direction === "horizontal" ? " (left→right)" : " (top→bottom)"}`);
    } else if (a.op === "move_node") {
      const id = resolve(a.node);
      const it = findItem(id);
      if (!it) { warnings.push(`Move: node "${a.node}" does not exist — skipped`); continue; }
      if (typeof a.x === "number") it.x = Math.round(a.x);
      if (typeof a.y === "number") it.y = Math.round(a.y);
      summary.push(`📍 Moved: ${it.label}`);
    } else {
      warnings.push(`Unknown operation "${a.op}" — skipped`);
    }
  }

  return {
    board: { ...board, items, edges, updatedAt: new Date().toISOString() },
    summary, warnings,
  };
}
// Resolve a node's list of "required fields" from TYPE_SPECS (conditional fieldsBy* are
// also pulled in when the relevant selector is set). Same idea as NodeConfigFields'
// dynamic spec resolution.
// authoringOnly:true fields (name/description etc. that only matter when defining the
// element itself from scratch) are excluded from required, since they aren't needed for
// a flow's "usage step". If we add an inline-definition mode later, branch on node.meta.
// secret:true fields (API keys etc., secrets passed via envKey from environment variables)
// are also excluded from required, since we don't want them hard-coded in the flow definition.
export function requiredFieldsFor(node) {
  const spec = (window.FI && window.FI.TYPE_SPECS && window.FI.TYPE_SPECS[node.nodeType]) || null;
  const meta = node.meta || {};
  let fields = (spec && Array.isArray(spec.fields)) ? [...spec.fields] : [];
  if (spec) {
    for (const [k, v] of Object.entries(spec)) {
      if (!k.startsWith("fieldsBy") || !v || typeof v !== "object") continue;
      const sel = k.slice("fieldsBy".length).toLowerCase();         // tool / action / handler ...
      const selKey = sel === "handler" ? "handler_type" : sel;       // fieldsByHandler is keyed by handler_type
      const val = meta[selKey];
      if (val && Array.isArray(v[val])) fields = fields.concat(v[val]);
    }
  }
  // For capability nodes (Gmail/Slack etc.), pull the "practical core" required fields from PART_FIELDS.
  // This is what makes the destination (Gmail query / Slack channel etc.) enforced at the save gate.
  // The flow start/end I/O contract (input/trigger/outputs) is exempt from the destination check (to avoid noise).
  const cap = meta.capability;
  if (cap && cap !== "flow.start" && cap !== "flow.end"
      && window.FI && window.FI.PART_FIELDS && Array.isArray(window.FI.PART_FIELDS[cap])) {
    const seen = new Set(fields.map(f => f && f.key));
    for (const f of window.FI.PART_FIELDS[cap]) {
      if (f && !seen.has(f.key)) { fields.push(f); seen.add(f.key); }
    }
  }
  return fields.filter(f => f && f.required && !f.authoringOnly && !f.secret);
}
// Whether a value is "empty" (same criteria as isEmpty inside validateFlowForSkill).
export function fiIsEmpty(v) {
  return v === undefined || v === null || v === ""
    || (Array.isArray(v) && v.length === 0)
    || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
}
// For the flow-builder chat: collect the "unfilled required fields" of each board node.
// Reuses requiredFieldsFor (TYPE_SPECS/PART_FIELDS resolution, secret/authoringOnly already excluded).
// Passes key/label/desc/options so the AI can ask "how should we fill this in?" during the conversation.
export function missingRequiredForBoard(items) {
  const out = [];
  for (const it of (items || [])) {
    if (it.type !== "node") continue;
    const meta = it.meta || {};
    const missing = [];
    for (const f of requiredFieldsFor(it)) {
      if (fiIsEmpty(meta[f.key])) {
        missing.push({ key: f.key, label: f.label || f.key, desc: f.desc || "", options: f.options || null });
      }
    }
    if (missing.length) {
      out.push({ node_id: it.id, label: it.label || it.nodeType || it.id, nodeType: it.nodeType, missing });
    }
  }
  return out;
}
// Deterministically validate whether a selected subgraph (items + the edges between them)
// can be saved as a "skill".
// Returns: { level: "warn"|"error", title, detail, nodeIds[] }[]
export function validateFlowForSkill(items, edges) {
  const nodes = (items || []).filter(it => it.type === "node");
  const out = [];
  if (nodes.length === 0) {
    out.push({ level: "error", title: "No nodes", detail: "Select the nodes you want to turn into a skill.", nodeIds: [] });
    return out;
  }
  const idset = new Set(nodes.map(n => n.id));
  const within = (edges || []).filter(e => idset.has(e.from) && idset.has(e.to));
  const hasIn = new Set(within.map(e => e.to));
  const hasOut = new Set(within.map(e => e.from));
  const isEmpty = (v) => v === undefined || v === null || v === ""
    || (Array.isArray(v) && v.length === 0)
    || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

  // Isolated nodes (when there are 2 or more)
  for (const n of nodes) {
    if (nodes.length > 1 && !hasIn.has(n.id) && !hasOut.has(n.id)) {
      out.push({ level: "warn", title: `"${n.label}" is isolated`, detail: "It isn't connected to any node. Either wire it into the flow or remove it.", nodeIds: [n.id] });
    }
  }
  // Multiple goals (2 or more nodes with no outgoing edge)
  const terminals = nodes.filter(n => !hasOut.has(n.id));
  if (terminals.length > 1) {
    out.push({ level: "warn", title: "Multiple goals", detail: `Multiple endpoints: ${terminals.map(n => n.label).join(" / ")}. Can you narrow it down to a single deliverable?`, nodeIds: terminals.map(n => n.id) });
  }
  // No entry point defined (no start-type node)
  const entryTypes = new Set(["parent", "trigger", "user", "hook"]);
  if (!nodes.some(n => entryTypes.has(n.nodeType))) {
    const starts = nodes.filter(n => !hasIn.has(n.id));
    out.push({ level: "warn", title: "No entry point (trigger/parent) defined", detail: "It isn't clear what triggers this flow to start.", nodeIds: starts.map(n => n.id) });
  }
  // Unfilled required settings
  for (const n of nodes) {
    const meta = n.meta || {};
    for (const f of requiredFieldsFor(n)) {
      if (isEmpty(meta[f.key])) {
        out.push({ level: "warn", title: `"${n.label}" has an unfilled required field`, detail: `"${f.label}" is empty.`, nodeIds: [n.id] });
      }
    }
  }
  return out;
}
export function boardToWorkflow(board, originalWorkflow) {
  if (!board) return originalWorkflow;
  return {
    ...(originalWorkflow || {}),
    id: originalWorkflow?.id || board.id,
    name: board.name || originalWorkflow?.name,
    nodes: (board.items || []).filter(it => it.type === "node").map(it => ({
      id: it.id, type: it.nodeType,
      title: it.label, subtitle: it.subtitle || "",
      x: (it.x || 0) + (it.w || 180) / 2,
      y: (it.y || 0) + (it.h || 60) / 2,
      desc: it.meta?.desc || "",
      input: it.meta?.input || {},
      output: it.meta?.output || {},
      meta: it.meta || {},
      depends: it.meta?.depends || [],
      parallel: it.meta?.parallel,
      duration: it.meta?.duration || "",
    })),
    edges: (board.edges || []).map(e => ({ from: e.from, to: e.to, label: e.label || "" })),
  };
}
// ════════════════════════════════════════════════════
// Plan Workspace (planning whiteboard)
// 1 board = logic optimization for 1 goal, with multiple variations + sticky notes
// placed freely. Data is persisted in localStorage (backend integration is a later phase).
// ════════════════════════════════════════════════════
const PLAN_BOARD_PREFIX = "fi_plan_board_";

export function loadPlanBoard(boardId) {
  try {
    const raw = localStorage.getItem(PLAN_BOARD_PREFIX + boardId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
export function savePlanBoard(board) {
  try { localStorage.setItem(PLAN_BOARD_PREFIX + board.id, JSON.stringify(board)); } catch {}
}
export function listPlanBoards() {
  const list = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PLAN_BOARD_PREFIX)) {
        const v = JSON.parse(localStorage.getItem(k) || "null");
        if (v && v.id) list.push({ id: v.id, name: v.name, itemCount: (v.items || []).length, updatedAt: v.updatedAt });
      }
    }
  } catch {}
  return list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

// ── Multiple boards: two-layer storage of file (source of truth) + localStorage (cache) ──
// localStorage is the immediate cache, boards/<id>.json (API) is the source of truth.
const _boardSaveTimers = {};
export async function loadPlanBoardFile(id) {
  try {
    const res = await fetch(API + "/api/boards/" + encodeURIComponent(id));
    if (res.ok) {
      const b = await res.json();
      try { savePlanBoard(b); } catch {}           // refresh cache
      return b;
    }
  } catch {}
  return loadPlanBoard(id);                          // offline / not-found fallback
}
export function savePlanBoardFile(board) {
  if (!board || !board.id) return;
  // 1) localStorage immediately (updatedAt is set on the cache side)
  try { savePlanBoard({ ...board, updatedAt: new Date().toISOString() }); } catch {}
  // 2) PUT to the file with an 800ms debounce
  const id = board.id;
  if (_boardSaveTimers[id]) clearTimeout(_boardSaveTimers[id]);
  _boardSaveTimers[id] = setTimeout(() => {
    fetch(API + "/api/boards/" + encodeURIComponent(id), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(board),
    }).catch(() => {});
  }, 800);
}
export async function listBoardsFile() {
  try {
    const res = await fetch(API + "/api/boards");
    if (res.ok) return await res.json();
  } catch {}
  return listPlanBoards();                           // fallback to localStorage list
}
export async function createBoardFile(name) {
  const res = await fetch(API + "/api/boards", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name || "Untitled board" }),
  });
  if (!res.ok) throw new Error("Failed to create board");
  return await res.json();
}
export async function deleteBoardFile(id) {
  try {
    const res = await fetch(API + "/api/boards/" + encodeURIComponent(id), { method: "DELETE" });
    try { localStorage.removeItem(PLAN_BOARD_PREFIX + id); } catch {}
    return res.ok;
  } catch { return false; }
}
export function fmtBoardDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return "—"; }
}
