// Plan workspace / builder (PlanWorkspace + Plan* cards + board list). Phase 3 module.
// Extracted verbatim — the last big cluster.
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { API } from '../lib/api.js'
import { NODE_TYPES } from '../lib/node-types.js'
import { NODE_W, NODE_H } from '../lib/geometry.jsx'
import { applyFlowActions, boardItemToNode, boardToWorkflow, deleteBoardFile, fmtBoardDate, listBoardsFile, loadPlanBoard, loadPlanBoardFile, mergeNodeSettingsIntoBoard, savePlanBoardFile } from '../lib/board-model.js'
import { addCustomFunction, loadCustomFunctions } from '../lib/custom-functions.js'
import { DetailBody, RightPanel, MiniMap } from './node-detail.jsx'
import { ElementsPalette, NodePickerList } from './palette.jsx'
import { FlowBuildChat, SkillSaveFlow } from './chat.jsx'
import { FlowDiagram, SubflowContainer } from './flow/diagram.jsx'

export function PlanNodeInspector({ item, board, onPatch, onJump, onClose }) {
  const [viewMode, setViewMode] = React.useState("simple"); // simple(overview) | settings | dev
  if (!item) {
    return <div className="plan-panel-body src-view-msg" style={{ padding: 16 }}>Click a node to see details.</div>;
  }
  const node = boardItemToNode(item);
  if (!node) {
    return <div className="plan-panel-body src-view-msg" style={{ padding: 16 }}>No details available for this item.</div>;
  }
  const nt = window.NODE_TYPES[node.type] || { label: node.type, color: "var(--tx-3)", bg: "var(--bg-3)" };
  // Pass edges/nodes context to DetailBody. No id assigned → works only via localOverride + onPatch.
  const ctx = boardToWorkflow(board, { name: board.name, description: board.desc, source: { type: "skill" } });
  ctx.id = undefined;
  return (
    <div className="plan-panel-body plan-rich-inspector" style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1, padding: 0 }}>
      <div className="detail-head" style={{ "--accent": nt.color }}>
        <div className="dh-row">
          <span className="dh-chip" style={{ background: nt.bg, color: nt.color, borderColor: nt.color }}>{(nt.label || node.type).toUpperCase()}</span>
          <div className="dh-mode-toggle">
            <button className={`dh-mode-btn ${viewMode === "simple" ? "is-active" : ""}`} onClick={() => setViewMode("simple")}>Overview</button>
            <button className={`dh-mode-btn ${viewMode === "settings" ? "is-active" : ""}`} onClick={() => setViewMode("settings")}>Settings</button>
            <button className={`dh-mode-btn ${viewMode === "dev" ? "is-active" : ""}`} onClick={() => setViewMode("dev")}>Dev</button>
          </div>
          {onClose && <button className="dh-close" onClick={onClose} title="Deselect">×</button>}
        </div>
        <div className="dh-title">{node.title}</div>
        <div className="dh-sub">{node.subtitle}</div>
      </div>
      <div className="detail-body" style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <DetailBody node={node} workflow={ctx} onJump={onJump} onSaved={() => {}} viewMode={viewMode} onPatch={onPatch} />
      </div>
    </div>
  );
}
export function PlanWorkspace({ boardId, flowList, onBack, onOpenFlow, controlled, initialBoard, onBoardChange, title, hideHeader, hidePalette, floatingPalette, readOnly, onSelectionChange, controlledSelectedId, onSave, onSaveAs, onDeployTest, onEval, saveAsCategory, flowId, sourceType, richInspector, flowChat }) {
  // Load board (initialize if not found)
  // Sanitizer that fills in required board fields (prevents crashes when undo/redo yields corrupted data)
  function sanitizeBoard(b) {
    if (!b || typeof b !== "object") return null;
    return {
      id: b.id || boardId,
      name: b.name || "New Plan",
      desc: b.desc || "",
      items: Array.isArray(b.items) ? b.items : [],
      edges: Array.isArray(b.edges) ? b.edges : [],
      view: (b.view && typeof b.view === "object") ? b.view : { x: 0, y: 0, k: 0.9 },
      createdAt: b.createdAt || new Date().toISOString(),
      updatedAt: b.updatedAt || new Date().toISOString(),
    };
  }
  const [board, setBoardRaw] = React.useState(() => {
    const fallback = {
      id: boardId || "default",
      name: "New Plan",
      desc: "Enter goal (what you want to optimize on this board)",
      items: [],
      edges: [],
      view: { x: 0, y: 0, k: 0.9 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // controlled mode: receive initialBoard from parent (do not use localStorage)
    if (controlled && initialBoard) {
      return sanitizeBoard(initialBoard) || fallback;
    }
    const existing = loadPlanBoard(boardId);
    return sanitizeBoard(existing) || fallback;
  });
  // setBoard wrapper: rejects null/corrupted data, always ensures required fields are present
  const setBoard = React.useCallback((updater) => {
    setBoardRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const safe = sanitizeBoard(next);
      return safe || prev;  // keep previous state if sanitize fails
    });
  }, []);
  // Non-controlled: after mount, fetch from boards/<id>.json (source of truth) and replace state.
  // Initial state is localStorage cache or empty. On successful fetch, skip auto-save
  // (= avoid updating updatedAt just by "opening" the board).
  const boardFileLoadedRef = React.useRef(false);
  const skipNextFileSaveRef = React.useRef(false);
  const firstAutosaveSkippedRef = React.useRef(false);  // placeholder/cache state right after mount is not a user edit — skip save (prevents overwriting new board files)
  React.useEffect(() => {
    if (controlled || boardFileLoadedRef.current) return;
    boardFileLoadedRef.current = true;
    let cancelled = false;
    (async () => {
      const fromFile = await loadPlanBoardFile(boardId);
      if (!cancelled && fromFile) {
        skipNextFileSaveRef.current = true;
        setBoard(fromFile);
      }
    })();
    return () => { cancelled = true; };
  }, [controlled, boardId]);
  // controlled mode: treat initialBoard as "initial value" only (do not sync after mount).
  // To replace later, remount with <PlanWorkspace key={...} />.
  // Note: the old sync useEffect caused infinite loops:
  //   initialBoard changes → setBoardRaw → board changes → onBoardChange → parent setState →
  //   parent re-render with new initialBoard → setBoardRaw again … (~225 renders/sec)
  // Also skip the first onBoardChange emission to parent
  const initialEmitDoneRef = React.useRef(false);
  React.useEffect(() => {
    if (!board) return;
    if (controlled) {
      if (!initialEmitDoneRef.current) {
        initialEmitDoneRef.current = true;
        return;  // first emit (= initial state itself) — do not notify parent
      }
      if (onBoardChange) onBoardChange(board);
      return;
    }
    if (!firstAutosaveSkippedRef.current) { firstAutosaveSkippedRef.current = true; return; }
    if (skipNextFileSaveRef.current) { skipNextFileSaveRef.current = false; return; }
    savePlanBoardFile(board);
  }, [board]);

  // ── Undo / Redo (S1 C-1) ──
  // History managed via past / future stack (limit 50). Push via setBoardWithHistory wrapper
  const [history, setHistory] = React.useState({ past: [], future: [] });
  const HISTORY_LIMIT = 50;
  const skipHistoryRef = React.useRef(false);  // suppress history push while dragging
  const dragSnapshotRef = React.useRef(null);  // snapshot at drag start (pushed once on drag end)
  // keep latest state in ref (prevent stale closures)
  const boardRef = React.useRef(board);
  const historyRef = React.useRef(history);
  React.useEffect(() => { boardRef.current = board; }, [board]);
  React.useEffect(() => { historyRef.current = history; }, [history]);

  function setBoardWithHistory(updater) {
    setBoard(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next === prev) return prev;
      if (!skipHistoryRef.current && prev) {
        setHistory(h => ({
          past: [...h.past, prev].slice(-HISTORY_LIMIT),
          future: [],
        }));
      }
      return next;
    });
  }

  function beginDragHistory() {
    if (skipHistoryRef.current) return;
    dragSnapshotRef.current = boardRef.current;
    skipHistoryRef.current = true;
  }
  function endDragHistory() {
    skipHistoryRef.current = false;
    if (dragSnapshotRef.current) {
      const snap = dragSnapshotRef.current;
      setHistory(h => ({
        past: [...h.past, snap].slice(-HISTORY_LIMIT),
        future: [],
      }));
      dragSnapshotRef.current = null;
    }
  }
  function undo() {
    const h = historyRef.current;
    if (!h || h.past.length === 0) return;
    const previous = h.past[h.past.length - 1];
    if (!previous) return;  // null/undefined guard
    const current = boardRef.current;
    setHistory({
      past: h.past.slice(0, -1),
      future: current ? [...h.future, current].slice(-HISTORY_LIMIT) : h.future,
    });
    skipHistoryRef.current = true;
    setBoard(previous);
    setTimeout(() => { skipHistoryRef.current = false; }, 0);
  }
  function redo() {
    const h = historyRef.current;
    if (!h || h.future.length === 0) return;
    const nextBoard = h.future[h.future.length - 1];
    if (!nextBoard) return;
    const current = boardRef.current;
    setHistory({
      past: current ? [...h.past, current].slice(-HISTORY_LIMIT) : h.past,
      future: h.future.slice(0, -1),
    });
    skipHistoryRef.current = true;
    setBoard(nextBoard);
    setTimeout(() => { skipHistoryRef.current = false; }, 0);
  }

  const [view, setView] = React.useState((board && board.view) || { x: 0, y: 0, k: 0.9 });
  const [dragging, setDragging] = React.useState(false);
  const [showFlowPicker, setShowFlowPicker] = React.useState(false);
  const [editingTitle, setEditingTitle] = React.useState(false);
  // PW-4: Selection / Clipboard / Right-click menu
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  // Floating palette minimized state (− / +)
  const [paletteMinimized, setPaletteMinimized] = React.useState(false);
  // Floating panel: dock active tab + detached floating windows
  const [panelTab, setPanelTab] = React.useState("palette");
  // Flow-build AI chat (bottom-right FAB) open/close
  const [chatOpen, setChatOpen] = React.useState(false);
  // "Save as Skill" flow (validate → save → chat). { items, edges } | null
  const [skillSave, setSkillSave] = React.useState(null);
  const [floatWins, setFloatWins] = React.useState([]); // [{id, tab, x, y, w, h}]
  const winDrag = React.useRef(null);
  const winResize = React.useRef(null);
  const winSeq = React.useRef(0);
  const tearPending = React.useRef(null); // {tab, sx, sy}
  const tearFired = React.useRef(false);  // whether last drag detached a tab (suppresses click)
  React.useEffect(() => {
    function onMove(e) {
      // Drag tab → detach into floating window when threshold exceeded
      if (tearPending.current && !winDrag.current && !winResize.current) {
        const tp = tearPending.current;
        if (Math.abs(e.clientX - tp.sx) + Math.abs(e.clientY - tp.sy) > 5) {
          const id = `fw_${++winSeq.current}`;
          const x = e.clientX - 40, y = e.clientY - 10;
          setFloatWins(ws => [...ws, { id, tab: tp.tab, x, y, w: 320, h: 420 }]);
          winDrag.current = { id, sx: e.clientX, sy: e.clientY, bx: x, by: y };
          tearFired.current = true;
          tearPending.current = null;
          document.body.style.userSelect = "none";
        }
      }
      if (winDrag.current) {
        const d = winDrag.current;
        const nx = d.bx + (e.clientX - d.sx), ny = d.by + (e.clientY - d.sy);
        setFloatWins(ws => ws.map(w => w.id === d.id ? { ...w, x: nx, y: ny } : w));
      } else if (winResize.current) {
        const d = winResize.current;
        const nw = Math.max(240, d.bw + (e.clientX - d.sx)), nh = Math.max(180, d.bh + (e.clientY - d.sy));
        setFloatWins(ws => ws.map(w => w.id === d.id ? { ...w, w: nw, h: nh } : w));
      }
    }
    function onUp() { winDrag.current = null; winResize.current = null; tearPending.current = null; document.body.style.userSelect = ""; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);
  // Tab interaction: set tear candidate on mousedown, switch tab on click only without drag
  function onTabMouseDown(tab, e) { tearPending.current = { tab, sx: e.clientX, sy: e.clientY }; }
  function onTabClick(tab) {
    if (tearFired.current) { tearFired.current = false; return; } // ignore click right after detach
    setPanelTab(tab); setPaletteMinimized(false);
  }
  const tabLabel = (t) => t === "palette" ? "🧱 Palette" : t === "inspector" ? "🔍 Inspector" : "📄 Source";
  function startWinDrag(id, e) {
    const w = floatWins.find(w => w.id === id); if (!w) return;
    winDrag.current = { id, sx: e.clientX, sy: e.clientY, bx: w.x, by: w.y };
    document.body.style.userSelect = "none";
  }
  function startWinResize(id, e) {
    e.stopPropagation();
    const w = floatWins.find(w => w.id === id); if (!w) return;
    winResize.current = { id, sx: e.clientX, sy: e.clientY, bw: w.w, bh: w.h };
    document.body.style.userSelect = "none";
  }
  // Drag dock grip → detach active tab into a new floating window
  function closeFloatWin(id) { setFloatWins(ws => ws.filter(w => w.id !== id)); }

  // Place item from palette (called from both dock and floating window)
  function handlePaletteSelect(item) {
    if (item.meta && item.meta.custom && Array.isArray(item.meta.items)) {
      const fnId = item.meta.fnId;
      const fn = (loadCustomFunctions() || []).find(f => f.id === fnId);
      const c = getCanvasCenter();
      const gid = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newGroup = {
        id: gid, type: "group", label: item.title || "My Function",
        description: fn?.description || "", color: fn?.color || (item.meta.fnColor || "#7c3aed"),
        shape: fn?.shape || "rounded", collapsed: true,
        items: (fn?.items || item.meta.items || []).map(it => ({ ...it })),
        edges: (fn?.edges || []).map(e => ({ ...e })),
        fnId, x: c.x - 110, y: c.y - 32, w: 220, h: 64,
      };
      setBoardWithHistory(b => ({ ...b, items: [...b.items, newGroup] }));
      setSelectedIds(new Set([gid]));
      return;
    }
    const id = `${item.type || "node"}_${Date.now()}_${itemCounter.current++}`;
    const selectedItems = board.items.filter(it => selectedIds.has(it.id) && (it.type === "node" || it.type === "group"));
    let fromItem = null;
    if (selectedItems.length > 0) {
      fromItem = selectedItems.reduce((a, b) => ((a.y || 0) + (a.h || 60) > (b.y || 0) + (b.h || 60) ? a : b));
    }
    let nx, ny;
    if (fromItem) {
      nx = (fromItem.x || 0) + ((fromItem.w || 180) - 180) / 2;
      ny = (fromItem.y || 0) + (fromItem.h || 60) + 80;
    } else {
      const c = getCanvasCenter(); nx = c.x - 90; ny = c.y - 30;
    }
    const newItem = { id, type: "node", nodeType: item.type, label: item.title, subtitle: item.subtitle || "", meta: item.meta || {}, x: nx, y: ny, w: 180, h: 60 };
    setBoardWithHistory(b => ({ ...b, items: [...b.items, newItem], edges: fromItem ? [...(b.edges || []), { from: fromItem.id, to: id, label: "" }] : b.edges }));
    setSelectedIds(new Set([id]));
  }

  // Render panel content (shared by dock and floating windows)
  function renderPanelContent(tab) {
    if (tab === "inspector") {
      // richInspector: DetailBody-based detail equivalent to skill editing. Edits write back to board.
      if (richInspector) {
        const selItem = board.items.find(it => selectedIds.has(it.id)) || null;
        return <PlanNodeInspector
          item={selItem}
          board={board}
          onPatch={(nodeId, patch) => setBoardWithHistory(b => mergeNodeSettingsIntoBoard(b, nodeId, patch))}
          onJump={(nodeId) => setSelectedIds(new Set([nodeId]))}
          onClose={() => setSelectedIds(new Set())}
        />;
      }
      const sel = board.items.find(it => selectedIds.has(it.id));
      if (!sel) return <div className="plan-panel-body src-view-msg">Click a node to see details.</div>;
      const nt = (window.NODE_TYPES && window.NODE_TYPES[sel.nodeType]) || null;
      const m = sel.meta || {};
      return (
        <div className="plan-panel-body plan-inspector">
          <div className="pi-head">
            {nt && <span className="pi-chip" style={{ background: nt.bg, color: nt.color, borderColor: nt.color }}>{nt.label}</span>}
            <div className="pi-title">{sel.label}</div>
            {sel.subtitle && <div className="pi-sub">{sel.subtitle}</div>}
          </div>
          {Object.keys(m).length > 0 ? (
            <div className="pi-meta">
              {Object.entries(m).filter(([k]) => !["custom","items","fnId","fnColor"].includes(k)).map(([k, v]) => (
                <div key={k} className="pi-meta-row"><span className="pi-meta-k">{k}</span><span className="pi-meta-v">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span></div>
              ))}
            </div>
          ) : <div className="src-view-msg" style={{ padding: 12 }}>No settings</div>}
        </div>
      );
    }
    if (tab === "fulltext") {
      const sel = board.items.find(it => selectedIds.has(it.id));
      const selNode = sel ? { title: sel.label, meta: sel.meta || {}, config: {} } : null;
      // Live preview while editing (board → workflow → preview-source, debounced)
      // frontmatter (name/description) comes from the board's name/goal fields — for SKILL.md preview.
      const liveFlow = boardToWorkflow(board, { id: flowId, name: board.name, description: board.desc, source: { type: sourceType || "skill" } });
      return <div className="plan-panel-body" style={{ flex: 1, display: "flex", minHeight: 0 }}><FlowSourceView flowId={flowId} sourceType={sourceType} selectedNode={selNode} liveFlow={liveFlow} /></div>;
    }
    return <ElementsPalette onSelectPaletteItem={handlePaletteSelect} />;
  }
  // Toast display for save/deploy feedback
  const [toast, setToast] = React.useState(null);  // { icon, text } | null
  const showToast = React.useCallback((icon, text, ms = 2400) => {
    setToast({ icon, text });
    setTimeout(() => setToast(null), ms);
  }, []);
  // "Save As" modal
  const [saveAsModal, setSaveAsModal] = React.useState(null);  // { location, name } | null
  const openSaveAsModal = React.useCallback(() => {
    const baseName = (boardRef.current?.name || "untitled").replace(/[\s/]/g, "-");
    const category = saveAsCategory || "saved";
    const location = `${category}/${baseName}/`;
    // Find existing versions (same location prefix) in localStorage to determine next version number
    const prefix = `fi_saveas:${location}`;
    const existing = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          let meta = null;
          try { meta = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
          existing.push({ key, name: key.slice(prefix.length), savedAt: meta?.savedAt || null });
        }
      }
    } catch {}
    existing.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
    // Next version number: parse existing `<base>-v<N>` and take max + 1
    const vNums = existing.map(e => {
      const m = (e.name || "").match(/-v(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextV = (vNums.length > 0 ? Math.max(...vNums) : 0) + 1;
    setSaveAsModal({
      location,
      name: `${baseName}-v${nextV}`,
      existing,
    });
  }, [saveAsCategory]);
  // Skip the first emit to avoid overwriting parent with empty selectedIds right after mount
  const selectionEmitInitRef = React.useRef(true);
  React.useEffect(() => {
    if (selectionEmitInitRef.current) {
      selectionEmitInitRef.current = false;
      // First mount: notify parent if selectedIds is non-empty (for initial value inheritance from controlled mode)
      if (selectedIds.size === 0) return;
    }
    if (onSelectionChange) onSelectionChange([...selectedIds]);
  }, [selectedIds]);
  // Reflect selection from parent (MiniMap / RightPanel, etc.) into canvas.
  // Update internal selectedIds when controlledSelectedId changes.
  // Loop prevention: do nothing if already the same single selection.
  React.useEffect(() => {
    if (controlledSelectedId === undefined) return;
    if (controlledSelectedId === null) {
      if (selectedIds.size === 0) return;
      setSelectedIds(new Set());
      return;
    }
    if (selectedIds.size === 1 && selectedIds.has(controlledSelectedId)) return;
    setSelectedIds(new Set([controlledSelectedId]));
  }, [controlledSelectedId]);
  const [ctxMenu, setCtxMenu] = React.useState(null); // { x, y, targetId? }
  // PW-6: Group/function dialog
  const [fnDialog, setFnDialog] = React.useState(null); // { items, name, description, category }
  // PW-6: My Functions picker (reuse)
  const [showFnPicker, setShowFnPicker] = React.useState(false);
  // Draft edge being dragged from a connection handle { fromId, toX, toY }
  const [draftEdge, setDraftEdge] = React.useState(null);
  // Open inner detail modal for a group (group.id) — can view contents even when collapsed
  const [groupDetail, setGroupDetail] = React.useState(null);
  // Target candidate for draft edge (hovered item.id)
  const [edgeTargetId, setEdgeTargetId] = React.useState(null);
  // Edge insert picker { edgeIdx, fromId, toId, screenX, screenY }
  const [edgeInsert, setEdgeInsert] = React.useState(null);
  // Edge endpoint reroute drag in progress { edgeIdx, end: "from" | "to", toX, toY }
  const [edgeReroute, setEdgeReroute] = React.useState(null);
  // Selected edge index (deletable via Delete key / × button)
  const [selectedEdgeIdx, setSelectedEdgeIdx] = React.useState(null);
  // Edge index highlighted during drag (E-1)
  const [hoveredEdgeIdxState, _setHoveredEdgeIdxState] = React.useState(null);
  const hoveredEdgeIdxRef = React.useRef(null);
  function setHoveredEdgeIdx(v) {
    hoveredEdgeIdxRef.current = v;
    _setHoveredEdgeIdxState(v);
  }
  const hoveredEdgeIdx = hoveredEdgeIdxState;  // alias for render
  const lastDragOverRef = React.useRef(0);

  // Find the closest edge to a mouse position (canvas space). Returns index if distance < threshold.
  // excludeNodeId: exclude edges where that node is from/to (inserting into self is meaningless)
  function findClosestEdgeIdx(canvasX, canvasY, threshold = 28, excludeNodeId = null) {
    const edges = board.edges || [];
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (excludeNodeId && (e.from === excludeNodeId || e.to === excludeNodeId)) continue;
      const from = board.items.find(it => it.id === e.from);
      const to = board.items.find(it => it.id === e.to);
      if (!from || !to) continue;
      const fx = (from.x || 0) + (from.w || 180) / 2;
      const fy = (from.y || 0) + (from.h || 60);
      const tx = (to.x || 0) + (to.w || 180) / 2;
      const ty = (to.y || 0);
      // Simplified: approximate bezier with 3 sample points (1/4, 1/2, 3/4), take minimum distance
      for (const t of [0.25, 0.5, 0.75]) {
        const px = fx + (tx - fx) * t;
        const py = fy + (ty - fy) * t;
        const d = Math.hypot(px - canvasX, py - canvasY);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
    }
    return bestDist < threshold ? bestIdx : null;
  }

  // Insert an existing node between edges: split the edge, reposition node in the middle + push downstream
  function insertExistingNodeIntoEdge(nodeId, edgeIdx) {
    setBoardWithHistory(b => {
      const edge = (b.edges || [])[edgeIdx];
      if (!edge) return b;
      if (edge.from === nodeId || edge.to === nodeId) return b;  // prevent self-loop
      const from = b.items.find(it => it.id === edge.from);
      const to = b.items.find(it => it.id === edge.to);
      const node = b.items.find(it => it.id === nodeId);
      if (!from || !to || !node) return b;
      // Avoid duplicate edges if from-node or node-to edges already exist
      const NODE_H = node.h || 60, V_GAP = 30;
      const PUSH = NODE_H + V_GAP * 2;
      // New node position: directly above original "to" (midpoint placement)
      const newX = ((from.x || 0) + (from.w || 180) / 2 + (to.x || 0) + (to.w || 180) / 2) / 2 - (node.w || 180) / 2;
      const newY = ((from.y || 0) + (from.h || 60) + (to.y || 0)) / 2 - NODE_H / 2;
      const toY = to.y || 0;
      // Update edges: remove original from-to, add from-node and node-to (deduplicate existing)
      const filteredEdges = (b.edges || []).filter((e, i) => {
        if (i === edgeIdx) return false;
        if (e.from === edge.from && e.to === nodeId) return false;
        if (e.from === nodeId && e.to === edge.to) return false;
        return true;
      });
      filteredEdges.push({ from: edge.from, to: nodeId, label: "" });
      filteredEdges.push({ from: nodeId, to: edge.to, label: "" });
      // Update node positions + push downstream (exclude the moved node itself and from)
      const updatedItems = b.items.map(it => {
        if (it.id === nodeId) return { ...it, x: newX, y: newY };
        if (it.id === edge.from) return it;
        if ((it.y || 0) >= toY) return { ...it, y: (it.y || 0) + PUSH };
        return it;
      });
      return { ...b, items: updatedItems, edges: filteredEdges };
    });
    setSelectedIds(new Set([nodeId]));
  }

  // Delete an edge
  function deleteEdge(idx) {
    setBoardWithHistory(b => ({ ...b, edges: (b.edges || []).filter((_, i) => i !== idx) }));
    setSelectedEdgeIdx(null);
  }

  // Reroute edge endpoint to a different node
  function startEdgeReroute(edgeIdx, end, ev) {
    ev.stopPropagation();
    ev.preventDefault();
    const startCanvas = clientToCanvas(ev.clientX, ev.clientY);
    setEdgeReroute({ edgeIdx, end, toX: startCanvas.x, toY: startCanvas.y });
    beginDragHistory();  // snapshot at drag start
    const onMove = (mv) => {
      const c = clientToCanvas(mv.clientX, mv.clientY);
      setEdgeReroute({ edgeIdx, end, toX: c.x, toY: c.y });
      const el = document.elementFromPoint(mv.clientX, mv.clientY);
      const target = el?.closest("[data-plan-item-id]");
      const targetId = target?.getAttribute("data-plan-item-id");
      setEdgeTargetId(targetId || null);
    };
    const onUp = (up) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const el = document.elementFromPoint(up.clientX, up.clientY);
      const target = el?.closest("[data-plan-item-id]");
      const targetId = target?.getAttribute("data-plan-item-id");
      if (targetId) {
        // Reroute via normal setBoardWithHistory is OK (skipHistoryRef=true → no-op)
        // endDragHistory pushes once on finish
        setBoardWithHistory(b => {
          const newEdges = (b.edges || []).map((e, i) => {
            if (i !== edgeIdx) return e;
            const other = end === "from" ? e.to : e.from;
            if (targetId === other) return e;  // prevent connecting to self
            return end === "from" ? { ...e, from: targetId } : { ...e, to: targetId };
          });
          // Deduplicate: discard new edge if same from→to already exists
          const seen = new Set();
          const uniq = [];
          newEdges.forEach((e, i) => {
            const key = `${e.from}->${e.to}`;
            if (!seen.has(key)) { seen.add(key); uniq.push(e); }
          });
          return { ...b, edges: uniq };
        });
      }
      setEdgeReroute(null);
      setEdgeTargetId(null);
      endDragHistory();  // push to history once
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Insert a new node between edges: split from → new node → to
  function insertNodeIntoEdge(itemTemplate) {
    if (!edgeInsert) return;
    const { fromId, toId } = edgeInsert;
    const from = board.items.find(it => it.id === fromId);
    const to = board.items.find(it => it.id === toId);
    if (!from || !to) { setEdgeInsert(null); return; }
    insertNodeBetween(from, to, fromId, toId, itemTemplate);
    setEdgeInsert(null);
  }

  // Shared: split from→to edge, insert new node in the middle, push downstream nodes down
  function insertNodeBetween(from, to, fromId, toId, itemTemplate) {
    const NODE_H = 60, V_GAP = 30;  // push amount = node height + top/bottom margin
    const PUSH = NODE_H + V_GAP * 2;
    // New node position: between 80px below from and 80px above to. Place PUSH/2 above to for spacing.
    const cx = ((from.x || 0) + (from.w || 180) / 2 + (to.x || 0) + (to.w || 180) / 2) / 2 - 90;
    const cy = ((from.y || 0) + (from.h || 60) + (to.y || 0)) / 2 - 30;
    const id = `node_${Date.now()}_${itemCounter.current++}`;
    const newItem = {
      id, type: "node", nodeType: itemTemplate.type,
      label: itemTemplate.title, subtitle: itemTemplate.subtitle || "",
      meta: itemTemplate.meta || {},
      x: cx, y: cy, w: 180, h: NODE_H,
    };
    // Push determination: push all nodes below the original "to" node's y by PUSH
    const toY = to.y || 0;
    setBoardWithHistory(b => {
      const newEdges = (b.edges || []).filter(e => !(e.from === fromId && e.to === toId));
      newEdges.push({ from: fromId, to: id, label: "" });
      newEdges.push({ from: id, to: toId, label: "" });
      // Push downstream nodes — move nodes at or below toY (including to) down by PUSH
      const pushedItems = b.items.map(it => {
        if (it.id === fromId) return it;  // don't move "from"
        if ((it.y || 0) >= toY) return { ...it, y: (it.y || 0) + PUSH };
        return it;
      });
      return { ...b, items: [...pushedItems, newItem], edges: newEdges };
    });
    setSelectedIds(new Set([id]));
  }

  function startHandleDrag(fromId, ev) {
    // Use canvas coords at mousedown as origin
    const startCanvas = clientToCanvas(ev.clientX, ev.clientY);
    setDraftEdge({ fromId, toX: startCanvas.x, toY: startCanvas.y });
    const onMove = (mv) => {
      const c = clientToCanvas(mv.clientX, mv.clientY);
      setDraftEdge({ fromId, toX: c.x, toY: c.y });
      // Compute target candidate (node under mouse)
      const el = document.elementFromPoint(mv.clientX, mv.clientY);
      const target = el?.closest("[data-plan-item-id]");
      const targetId = target?.getAttribute("data-plan-item-id");
      if (targetId && targetId !== fromId) setEdgeTargetId(targetId);
      else setEdgeTargetId(null);
    };
    const onUp = (up) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      // Drop detection
      const el = document.elementFromPoint(up.clientX, up.clientY);
      const target = el?.closest("[data-plan-item-id]");
      const targetId = target?.getAttribute("data-plan-item-id");
      if (targetId && targetId !== fromId) {
        // Add only if not a duplicate of an existing edge
        setBoardWithHistory(b => {
          const existing = (b.edges || []).some(e => e.from === fromId && e.to === targetId);
          if (existing) return b;
          return { ...b, edges: [...(b.edges || []), { from: fromId, to: targetId, label: "" }] };
        });
      }
      setDraftEdge(null);
      setEdgeTargetId(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  // Re-render My Functions on change (listens for CustomEvent)
  const [fnVersion, setFnVersion] = React.useState(0);
  React.useEffect(() => {
    const handler = () => setFnVersion(v => v + 1);
    window.addEventListener("fi-custom-functions-changed", handler);
    return () => window.removeEventListener("fi-custom-functions-changed", handler);
  }, []);
  const itemCounter = React.useRef(0);
  const svgRef = React.useRef(null);

  // ── Workflow data cache (for thumbnail rendering) ──
  // Fetch and cache workflow data for each flow card's flowId
  const [workflowsCache, setWorkflowsCache] = React.useState({});
  React.useEffect(() => {
    const flowIds = [...new Set(board.items.filter(it => it.type === "flow" && it.flowId).map(it => it.flowId))];
    flowIds.forEach(flowId => {
      if (workflowsCache[flowId] || workflowsCache[`${flowId}__loading`]) return;
      setWorkflowsCache(c => ({ ...c, [`${flowId}__loading`]: true }));
      // In demo mode, read from window.__DEMO_FLOW__; otherwise fetch from API
      if (window.__DEMO_MODE__ && window.__DEMO_FLOW__ && window.__DEMO_FLOW__.id === flowId) {
        setWorkflowsCache(c => ({ ...c, [flowId]: window.__DEMO_FLOW__, [`${flowId}__loading`]: false }));
        return;
      }
      fetch(`/api/flows/${flowId}`)
        .then(r => r.ok ? r.json() : null)
        .then(wf => {
          if (wf) setWorkflowsCache(c => ({ ...c, [flowId]: wf, [`${flowId}__loading`]: false }));
          else setWorkflowsCache(c => ({ ...c, [`${flowId}__loading`]: false, [`${flowId}__error`]: true }));
        })
        .catch(() => setWorkflowsCache(c => ({ ...c, [`${flowId}__loading`]: false, [`${flowId}__error`]: true })));
    });
  }, [board.items]);

  // ── Canvas interactions:
  //   tool === "select": drag on empty area = marquee selection
  //   tool === "pan":    drag on empty area = pan
  //   Space + drag, or middle/right button → temporary pan (regardless of tool)
  //   Wheel → zoom
  // ──
  const [tool, setTool] = React.useState("select"); // "select" | "pan"
  const [marquee, setMarquee] = React.useState(null); // { x0, y0, x1, y1 }
  const [spaceDown, setSpaceDown] = React.useState(false);
  React.useEffect(() => {
    const onKD = (e) => {
      const tag = document.activeElement?.tagName;
      const isEditing = tag === "INPUT" || tag === "TEXTAREA";
      if (isEditing) return;
      if (e.code === "Space") { e.preventDefault(); setSpaceDown(true); }
      else if (e.key === "v" || e.key === "V") setTool("select");
      else if (e.key === "h" || e.key === "H") setTool("pan");
    };
    const onKU = (e) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", onKD);
    window.addEventListener("keyup", onKU);
    return () => { window.removeEventListener("keydown", onKD); window.removeEventListener("keyup", onKU); };
  }, []);

  function clientToCanvas(clientX, clientY) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k };
  }

  function startPan(e) {
    setDragging(true);
    const sx = e.clientX, sy = e.clientY;
    const bx = view.x, by = view.y;
    const onMove = (mv) => setView(v => ({ ...v, x: bx + (mv.clientX - sx), y: by + (mv.clientY - sy) }));
    const onUp = () => { setDragging(false); document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function startMarquee(e) {
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const baseSel = additive ? new Set(selectedIds) : new Set();
    // Start marquee on empty area → also clear edge/node selection (close toolbar)
    if (!additive) {
      setSelectedEdgeIdx(null);
      setSelectedIds(new Set());
    }
    const start = clientToCanvas(e.clientX, e.clientY);
    setMarquee({ x0: start.x, y0: start.y, x1: start.x, y1: start.y });
    const onMove = (mv) => {
      const cur = clientToCanvas(mv.clientX, mv.clientY);
      const m = { x0: start.x, y0: start.y, x1: cur.x, y1: cur.y };
      setMarquee(m);
      // Highlight items overlapping the rectangle
      const left = Math.min(m.x0, m.x1), right = Math.max(m.x0, m.x1);
      const top = Math.min(m.y0, m.y1), bottom = Math.max(m.y0, m.y1);
      const hit = new Set(baseSel);
      (board.items || []).forEach(it => {
        const iL = it.x || 0, iT = it.y || 0;
        const iR = iL + (it.w || 180), iB = iT + (it.h || 120);
        if (iR >= left && iL <= right && iB >= top && iT <= bottom) hit.add(it.id);
      });
      setSelectedIds(hit);
    };
    const onUp = () => {
      setMarquee(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onCanvasMouseDown(e) {
    if (e.target.closest(".plan-item")) return;
    if (e.target.closest(".plan-floating-toolbar")) return;
    if (e.target.closest(".plan-tool-bar")) return;
    // readOnly: always pan mode (marquee selection disabled)
    if (readOnly) {
      if (e.button === 0 || e.button === 1 || e.button === 2) {
        e.preventDefault();
        startPan(e);
      }
      return;
    }
    // Temporary pan: Space, middle button, right button
    if (spaceDown || e.button === 1 || e.button === 2) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    // Branch based on active tool
    if (tool === "pan") startPan(e);
    else startMarquee(e);
  }
  function onCanvasWheel(e) {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return;
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const nk = Math.max(0.25, Math.min(2.5, view.k * factor));
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    setView(v => ({ k: nk, x: mx - (mx - v.x) * (nk / v.k), y: my - (my - v.y) * (nk / v.k) }));
  }

  function getCanvasCenter() {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return { x: (rect.width / 2 - view.x) / view.k, y: (rect.height / 2 - view.y) / view.k };
  }

  // ── Add items ──
  function addNote() {
    const c = getCanvasCenter();
    const id = `note_${Date.now()}_${itemCounter.current++}`;
    setBoardWithHistory(b => ({
      ...b,
      items: [...b.items, { id, type: "note", x: c.x - 90, y: c.y - 60, w: 180, h: 120, text: "", color: "yellow" }],
    }));
  }

  // ── PW-4: Copy & Paste ──
  // Clipboard data saved to both localStorage + system clipboard
  // Format: { source: "plan-workspace", items: [...] }
  // toSystemClipboard=false (Cmd+C / cut / right-click): localStorage only
  //   "Normal copy." Does not pollute the system clipboard (visible to other apps).
  // toSystemClipboard=true (toolbar "Copy" button only): also writes JSON to system clipboard
  //   for carrying to other tabs, apps, or machines.
  async function copySelectedToClipboard({ toSystemClipboard = false } = {}) {
    if (selectedIds.size === 0) return;
    const items = board.items.filter(it => selectedIds.has(it.id));
    if (items.length === 0) return;
    // Also copy internal edges whose both endpoints are within the selection.
    // Without this, pasting connected nodes would lose their connections.
    const idset = new Set(items.map(it => it.id));
    const edges = (board.edges || []).filter(e => idset.has(e.from) && idset.has(e.to));
    const payload = { source: "plan-workspace", boardId: board.id, items, edges, copiedAt: new Date().toISOString() };
    // Save to localStorage (shared across all same-origin tabs = sufficient for in-app paste)
    try { localStorage.setItem("fi_plan_clipboard", JSON.stringify(payload)); } catch {}
    if (toSystemClipboard) {
      try { await navigator.clipboard.writeText(JSON.stringify(payload)); } catch {}
    }
  }
  async function pasteFromClipboard() {
    // Read both localStorage and system clipboard, pick the one with the newer copiedAt.
    // (Prevents stale "Copy" button JSON left in system clipboard from triggering accidentally)
    const candidates = [];
    try {
      const txt = await navigator.clipboard.readText();
      if (txt && txt.trim().startsWith("{")) {
        const parsed = JSON.parse(txt);
        if (parsed && parsed.source === "plan-workspace" && Array.isArray(parsed.items)) candidates.push(parsed);
      }
    } catch {}
    try {
      const raw = localStorage.getItem("fi_plan_clipboard");
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.source === "plan-workspace" && Array.isArray(p.items)) candidates.push(p);
      }
    } catch {}
    if (candidates.length === 0) return;
    candidates.sort((a, b) => new Date(b.copiedAt || 0) - new Date(a.copiedAt || 0));
    const payload = candidates[0];
    if (!payload || !Array.isArray(payload.items)) return;
    // Paste position: offset (40, 40) from original to avoid overlap
    const offset = 40;
    const idMap = {};  // old id -> new id (for rewiring internal edges)
    const newItems = payload.items.map(orig => {
      const newId = `${orig.type}_${Date.now()}_${itemCounter.current++}`;
      idMap[orig.id] = newId;
      const copy = { ...orig, id: newId, x: (orig.x || 0) + offset, y: (orig.y || 0) + offset };
      // Re-assign IDs for group inner items/edges to avoid collisions
      // (ungrouping the pasted group later won't conflict with the original)
      if (orig.type === "group" && Array.isArray(orig.items)) {
        const inner = {};
        copy.items = orig.items.map(ci => {
          const nid = `${ci.type || "node"}_${Date.now()}_${itemCounter.current++}`;
          inner[ci.id] = nid;
          return { ...ci, id: nid };
        });
        copy.edges = (orig.edges || []).filter(e => inner[e.from] && inner[e.to])
          .map(e => ({ ...e, from: inner[e.from], to: inner[e.to] }));
      }
      return copy;
    });
    // Rebuild internal edges with new IDs (rewire edges saved at copy time)
    const newEdges = (payload.edges || [])
      .filter(e => idMap[e.from] && idMap[e.to])
      .map(e => ({ from: idMap[e.from], to: idMap[e.to], label: e.label || "" }));
    setBoardWithHistory(b => ({ ...b, items: [...b.items, ...newItems], edges: [...(b.edges || []), ...newEdges] }));
    setSelectedIds(new Set(newItems.map(it => it.id)));
  }
  function deleteSelected() {
    if (selectedIds.size === 0) return;
    setBoardWithHistory(b => ({
      ...b,
      items: b.items.filter(it => !selectedIds.has(it.id)),
      edges: (b.edges || []).filter(e => !selectedIds.has(e.from) && !selectedIds.has(e.to)),
    }));
    setSelectedIds(new Set());
  }
  function cutSelected() {
    copySelectedToClipboard().then(() => deleteSelected());
  }
  function selectItem(itemId, multi = false) {
    setSelectedIds(prev => {
      if (multi) {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
        return next;
      }
      return new Set([itemId]);
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ── PW-6: Grouping / Function ──
  // Save selected items as a My Function (reusable block)
  function openFunctionDialog() {
    if (selectedIds.size === 0) return;
    const items = board.items.filter(it => selectedIds.has(it.id));
    if (items.length === 0) return;
    setFnDialog({
      items,
      name: items.length === 1 && items[0].label ? items[0].label : `My Function ${loadCustomFunctions().length + 1}`,
      description: "",
      category: "My Functions",
      color: "#7c3aed",
      shape: "rounded",   // "rounded" | "rect" | "pill" | "hex"
      registerAsCustom: true,  // whether to register as My Function
    });
  }
  function saveFunction() {
    if (!fnDialog) return;
    const name = (fnDialog.name || "").trim();
    if (!name) { alert("Please enter a name"); return; }
    const groupItems = fnDialog.items.map(it => ({ ...it }));
    const selectedIdSet = new Set(fnDialog.items.map(it => it.id));
    // Compute bounding box of selection (origin for group placement)
    const xs = groupItems.map(it => it.x || 0);
    const ys = groupItems.map(it => it.y || 0);
    const rs = groupItems.map(it => (it.x || 0) + (it.w || 180));
    const bs = groupItems.map(it => (it.y || 0) + (it.h || 60));
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...rs), maxY = Math.max(...bs);
    const bbW = maxX - minX, bbH = maxY - minY;
    // Normalize inner items / edges to relative coordinates
    const normalizedItems = groupItems.map(it => ({ ...it, x: (it.x || 0) - minX, y: (it.y || 0) - minY }));
    const innerEdges = (board.edges || []).filter(e => selectedIdSet.has(e.from) && selectedIdSet.has(e.to));
    // Create group item (collapsed display)
    const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const group = {
      id: groupId, type: "group",
      label: name,
      description: fnDialog.description || "",
      color: fnDialog.color || "#7c3aed",
      shape: fnDialog.shape || "rounded",
      collapsed: true,
      items: normalizedItems,
      edges: innerEdges.map(e => ({ from: e.from, to: e.to, label: e.label || "" })),
      x: minX + bbW / 2 - 110, y: minY + bbH / 2 - 32, w: 220, h: 64,
      // Original absolute-coordinate bounding box (used to render internals with absolute positions when expanded)
      bbW, bbH,
    };
    // Remove original items from board.items and add group. Remap cross-group edges to group.id
    setBoardWithHistory(b => {
      const remaining = b.items.filter(it => !selectedIdSet.has(it.id));
      const remappedEdges = (b.edges || []).map(e => {
        const fromInside = selectedIdSet.has(e.from);
        const toInside = selectedIdSet.has(e.to);
        if (fromInside && toInside) return null;             // inner edge → remove (already stored in group)
        if (fromInside) return { ...e, from: groupId };
        if (toInside) return { ...e, to: groupId };
        return e;
      }).filter(Boolean);
      return { ...b, items: [...remaining, group], edges: remappedEdges };
    });
    setSelectedIds(new Set([groupId]));
    // Register as My Function (when flag is set)
    if (fnDialog.registerAsCustom) {
      addCustomFunction({
        id: `fn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        description: fnDialog.description || "",
        category: fnDialog.category || "My Functions",
        icon: "🧩",
        color: fnDialog.color || "#7c3aed",
        shape: fnDialog.shape || "rounded",
        items: normalizedItems,
        edges: innerEdges.map(e => ({ from: e.from, to: e.to, label: e.label || "" })),
        createdAt: new Date().toISOString(),
      });
    }
    setFnDialog(null);
  }

  // Reuse My Function: A-1 = place as 1 collapsed group block at canvas center
  // Inner items / edges are kept in group.items / group.edges (shown SubflowContainer-style when expanded)
  function insertFunction(fn) {
    if (!fn || !Array.isArray(fn.items) || fn.items.length === 0) return;
    const c = getCanvasCenter();
    // Inner items are assumed to be stored normalized (relative coordinates).
    // bbW/bbH computed from inner items' size (reference for SubflowContainer size when expanded)
    const xs = fn.items.map(it => it.x || 0);
    const ys = fn.items.map(it => it.y || 0);
    const rs = fn.items.map(it => (it.x || 0) + (it.w || 180));
    const bs = fn.items.map(it => (it.y || 0) + (it.h || 60));
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...rs), maxY = Math.max(...bs);
    const bbW = maxX - minX, bbH = maxY - minY;
    // Remap inner items / edges to new unique IDs
    // (so pasting the same My Function multiple times won't conflict)
    const idMap = {};
    const newItems = fn.items.map(orig => {
      const newId = `${orig.type || "node"}_${Date.now()}_${itemCounter.current++}`;
      idMap[orig.id] = newId;
      return { ...orig, id: newId };
    });
    const newEdges = (fn.edges || []).map(e => ({
      ...e,
      from: idMap[e.from] || e.from,
      to: idMap[e.to] || e.to,
    }));
    // Place as collapsed group (same structure as saveFunction)
    const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const group = {
      id: groupId,
      type: "group",
      label: fn.name || "My Function",
      description: fn.description || "",
      color: fn.color || "#7c3aed",
      shape: fn.shape || "rounded",
      collapsed: true,    // A-1: collapsed by default
      items: newItems,
      edges: newEdges,
      x: c.x - 110, y: c.y - 32, w: 220, h: 64,
      bbW, bbH,
      fnId: fn.id,        // original My Function ID (for history)
    };
    setBoardWithHistory(b => ({ ...b, items: [...b.items, group] }));
    setSelectedIds(new Set([groupId]));
    setShowFnPicker(false);
  }

  // Expand group: keep group in place, set collapsed=false to show subflow container to the side
  // Inner items / edges remain in group.items / group.edges and are virtually rendered
  function expandGroup(groupId) {
    setBoardWithHistory(b => ({
      ...b,
      items: b.items.map(it => it.id === groupId ? { ...it, collapsed: false } : it),
    }));
  }

  // Drag the frame (header) of an expanded group: move group + all children together
  function startFrameDrag(groupId, ev) {
    const sx = ev.clientX, sy = ev.clientY;
    // Record positions at drag start
    const grpStart = board.items.find(it => it.id === groupId);
    if (!grpStart) return;
    const gx0 = grpStart.x || 0, gy0 = grpStart.y || 0;
    const childPositions = board.items
      .filter(it => it.groupId === groupId)
      .map(it => ({ id: it.id, x: it.x || 0, y: it.y || 0 }));
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (mv) => {
      const dx = (mv.clientX - sx) / view.k;
      const dy = (mv.clientY - sy) / view.k;
      setBoardWithHistory(b => {
        const cpById = Object.fromEntries(childPositions.map(c => [c.id, c]));
        return {
          ...b,
          items: b.items.map(it => {
            if (it.id === groupId) return { ...it, x: gx0 + dx, y: gy0 + dy };
            const cp = cpById[it.id];
            if (cp) return { ...it, x: cp.x + dx, y: cp.y + dy };
            return it;
          }),
        };
      });
    };
    const onUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Collapse group: just set collapsed=true (inner items are already stored in group.items)
  function collapseGroup(groupId) {
    setBoardWithHistory(b => ({
      ...b,
      items: b.items.map(it => it.id === groupId ? { ...it, collapsed: true } : it),
    }));
  }

  // Click outside to clear node/edge selection (B-1)
  React.useEffect(() => {
    const onDocMouseDown = (e) => {
      // Don't close if clicking on selected elements, toolbars, modals, etc.
      if (e.target.closest(".plan-item")) return;
      if (e.target.closest(".plan-floating-toolbar")) return;
      if (e.target.closest(".plan-tool-bar")) return;
      if (e.target.closest(".plan-edge-insert-btn")) return;
      if (e.target.closest(".plan-edge-del-btn")) return;
      if (e.target.closest(".plan-edge-endpoint")) return;
      if (e.target.closest(".plan-modal-overlay")) return;
      if (e.target.closest(".plan-edge-picker")) return;
      if (e.target.closest(".plan-ctx-overlay")) return;
      if (e.target.closest(".plan-header")) return;  // header button clicks preserve selection
      if (e.target.closest(".plan-subflow-header")) return;
      if (e.target.closest(".elements-palette")) return;  // palette clicks also preserve selection
      if (e.target.closest(".detail")) return;  // RightPanel (node detail) clicks preserve selection
      if (e.target.closest(".plan-palette-float")) return;  // floating dock (palette/inspector/source/settings/dev buttons) preserves selection
      if (e.target.closest(".plan-float-win")) return;  // detached floating window clicks also preserve
      if (e.target.closest(".plan-chat-panel")) return;  // flow-build AI chat clicks preserve selection
      if (e.target.closest(".plan-chat-fab")) return;
      if (e.target.closest(".ne-tooltip")) return;  // settings tab ⓘ tooltip
      if (e.target.closest(".plan-edge-g")) return;  // edge clicks handled separately
      // anything else (outside) → clear selection
      if (selectedIds.size > 0 || selectedEdgeIdx !== null) {
        setSelectedIds(new Set());
        setSelectedEdgeIdx(null);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [selectedIds, selectedEdgeIdx]);

  // Keyboard shortcuts: Cmd/Ctrl + C / V / X / Backspace + Delete
  React.useEffect(() => {
    const onKey = (e) => {
      // Skip when a text field is being edited
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (meta && e.key === "y") { e.preventDefault(); redo(); return; }
      if (meta && (e.key === "s" || e.key === "S")) {
        // Always block the browser's native "Save Page" (even when onSave is not set)
        e.preventDefault();
        if (onSave) {
          // onSave accepts both sync string and Promise<string>
          Promise.resolve(onSave(boardRef.current)).then(r => showToast("💾", r || "Saved"));
        }
        return;
      }
      if (meta && e.key === "c") { e.preventDefault(); copySelectedToClipboard(); }
      else if (meta && e.key === "v") { e.preventDefault(); pasteFromClipboard(); }
      else if (meta && e.key === "x") { e.preventDefault(); cutSelected(); }
      else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size > 0) { e.preventDefault(); deleteSelected(); }
        else if (selectedEdgeIdx !== null) { e.preventDefault(); deleteEdge(selectedEdgeIdx); }
      }
      else if (e.key === "Escape") { clearSelection(); setCtxMenu(null); setSelectedEdgeIdx(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIds, selectedEdgeIdx, board, history]);
  // Place flow nodes directly on the whiteboard (no outer frame; each node is an independent item)
  async function addFlowCard(flowMeta) {
    setShowFlowPicker(false);
    // Fetch workflow (demo mode aware)
    let workflow = null;
    if (window.__DEMO_MODE__ && window.__DEMO_FLOW__ && window.__DEMO_FLOW__.id === flowMeta.id) {
      workflow = window.__DEMO_FLOW__;
    } else {
      try {
        const r = await fetch(`/api/flows/${flowMeta.id}`);
        if (r.ok) workflow = await r.json();
      } catch {}
    }
    if (!workflow || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
      alert(`Could not load flow structure: ${flowMeta.name}`);
      return;
    }
    // Compute bounding box of original workflow coordinates and center on canvas
    const xs = workflow.nodes.map(n => n.x || 0);
    const ys = workflow.nodes.map(n => n.y || 0);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const bbW = maxX - minX + 200, bbH = maxY - minY + 100;  // node size padding
    const c = getCanvasCenter();
    const offX = c.x - bbW / 2 - minX;
    const offY = c.y - bbH / 2 - minY;
    // Place each node individually as type: "node"
    const ts = Date.now();
    const idMap = {};
    const newItems = workflow.nodes.map((n, i) => {
      const newId = `node_${ts}_${itemCounter.current++}`;
      idMap[n.id] = newId;
      return {
        id: newId, type: "node", nodeType: n.type,
        label: n.title, subtitle: n.subtitle || "",
        meta: { desc: n.desc, input: n.input, output: n.output, fromFlow: flowMeta.id, fromNodeId: n.id },
        x: (n.x || 0) + offX - 90, y: (n.y || 0) + offY - 30, w: 180, h: 60,
      };
    });
    // Save edges too (arrow rendering on whiteboard implemented later)
    const newEdges = (workflow.edges || []).map(e => ({
      from: idMap[e.from], to: idMap[e.to], label: e.label || "",
    })).filter(e => e.from && e.to);
    setBoardWithHistory(b => ({
      ...b,
      items: [...b.items, ...newItems],
      edges: [...(b.edges || []), ...newEdges],
    }));
    setSelectedIds(new Set(newItems.map(it => it.id)));
  }
  function updateItem(itemId, patch) {
    setBoardWithHistory(b => ({ ...b, items: b.items.map(it => it.id === itemId ? { ...it, ...patch } : it) }));
  }
  function removeItem(itemId) {
    setBoardWithHistory(b => ({
      ...b,
      items: b.items.filter(it => it.id !== itemId),
      edges: (b.edges || []).filter(e => e.from !== itemId && e.to !== itemId),
    }));
  }
  // Delete group: also deletes expanded children
  function removeGroup(groupId) {
    setBoardWithHistory(b => ({
      ...b,
      items: b.items.filter(it => it.id !== groupId),
      edges: (b.edges || []).filter(e => e.from !== groupId && e.to !== groupId),
    }));
  }

  return (
    <div className={`plan-workspace ${controlled ? "is-controlled" : ""} ${readOnly ? "is-readonly" : ""}`}>
      {/* Header (can be omitted in controlled mode) */}
      {!hideHeader && (
      <div className="plan-header">
        <button className="plan-back" onClick={onBack} title="Back to Dashboard">←</button>
        <div className="plan-history-btns">
          <button
            className="plan-history-btn"
            disabled={history.past.length === 0}
            onClick={undo}
            title="Undo (⌘Z)"
          >⤺</button>
          <button
            className="plan-history-btn"
            disabled={history.future.length === 0}
            onClick={redo}
            title="Redo (⌘⇧Z)"
          >⤻</button>
        </div>
        <div className="plan-title-area">
          {editingTitle ? (
            <input
              autoFocus
              className="plan-title-input"
              value={board.name}
              onChange={(e) => setBoardWithHistory(b => ({ ...b, name: e.target.value }))}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => { if (e.key === "Enter") setEditingTitle(false); }}
            />
          ) : (
            <div className="plan-title" onClick={() => setEditingTitle(true)} title="Click to edit">{board.name}</div>
          )}
          <div className="plan-subtitle">{board.items.length} items</div>
        </div>
        <div className="plan-header-hints" title="Shortcuts">
          {selectedIds.size > 0 && <span className="plan-hint-badge">{selectedIds.size} selected</span>}
          <span className="plan-hint">V=Select / H=Pan · Space+drag=Temp Pan · ⌘C/V/X · Delete</span>
        </div>
        <div className="plan-header-actions">
          <button className="plan-btn" onClick={addNote} title="Add a sticky note">📝 Add Note</button>
          <button className="plan-btn" onClick={() => setShowFnPicker(true)} title="Call a saved My Function">🧩 My Functions</button>
          <button className="plan-btn plan-btn-primary" onClick={() => setShowFlowPicker(true)} title="Add a flow card">+ Add Flow</button>
          {/* Save buttons (edit mode only) */}
          {(onSave || onSaveAs || onDeployTest) && (
            <span className="plan-header-divider" aria-hidden="true" />
          )}
          {onSave && (
            <button
              className="plan-btn plan-btn-save"
              onClick={() => {
                // onSave accepts both sync string and Promise<string>
                Promise.resolve(onSave(board)).then(r => showToast("💾", r || "Saved"));
              }}
              title="Save current edits (⌘S)"
            >💾 Save</button>
          )}
          {onSaveAs && (
            <button
              className="plan-btn"
              onClick={openSaveAsModal}
              title="Specify save location (folder + filename)"
            >📋 Save As</button>
          )}
          {onDeployTest && (
            <button
              className="plan-btn plan-btn-deploy"
              onClick={() => {
                const r = onDeployTest(board);
                showToast("▶", r || "Deploy test executed");
              }}
              title="Write current edits to .claude/ for testing (backend not implemented: preview via toast only)"
              style={{ opacity: 0.65 }}
            >▶ Deploy Test <span style={{ fontSize: "0.8em", opacity: 0.75 }}>(not implemented)</span></button>
          )}
          {onEval && (
            <button
              className="plan-btn plan-btn-eval"
              onClick={() => onEval(board)}
              title="Open Eval workbench (compare scores across variations)"
            >⚖ Eval</button>
          )}
        </div>
      </div>
      )}

      {/* Body: left palette + canvas (palette is floating when floatingPalette is true) */}
      <div className={`plan-body ${floatingPalette ? "has-floating-palette" : ""}`}>
      {/* Left palette (can be omitted in controlled mode) */}
      {!hidePalette && (
      <div
        className={`${floatingPalette ? "plan-palette-float" : "plan-palette-fixed"} ${paletteMinimized ? "is-minimized" : ""} ${richInspector ? "is-wide" : ""}`}
      >
        {floatingPalette && (
          <div className="plan-palette-head">
            <div className="plan-panel-tabs">
              <button className={`plan-panel-tab ${panelTab === "palette" ? "is-active" : ""}`} onMouseDown={(e) => onTabMouseDown("palette", e)} onClick={() => onTabClick("palette")} title="Click to switch / drag to detach">🧱 Palette</button>
              <button className={`plan-panel-tab ${panelTab === "inspector" ? "is-active" : ""}`} onMouseDown={(e) => onTabMouseDown("inspector", e)} onClick={() => onTabClick("inspector")} title="Click to switch / drag to detach">🔍 Inspector</button>
              <button className={`plan-panel-tab ${panelTab === "fulltext" ? "is-active" : ""}`} onMouseDown={(e) => onTabMouseDown("fulltext", e)} onClick={() => onTabClick("fulltext")} title="Click to switch / drag to detach">📄 Source</button>
            </div>
            <button
              className="plan-palette-toggle"
              onClick={() => setPaletteMinimized(m => !m)}
              title={paletteMinimized ? "Expand (+)" : "Minimize (−)"}
            >{paletteMinimized ? "+" : "−"}</button>
          </div>
        )}
        {!paletteMinimized && (floatingPalette ? renderPanelContent(panelTab) : renderPanelContent("palette"))}
      </div>
      )}

      {/* Detached floating windows */}
      {floatWins.map(win => (
        <div
          key={win.id}
          className="plan-float-win"
          style={{ left: win.x, top: win.y, width: win.w, height: win.h }}
        >
          <div className="plan-palette-head">
            <span className="plan-panel-grip" onMouseDown={(e) => startWinDrag(win.id, e)} title="Drag to move">⠿</span>
            <span className="plan-float-win-title">{tabLabel(win.tab)}</span>
            <button className="plan-palette-toggle" onClick={() => closeFloatWin(win.id)} title="Close">×</button>
          </div>
          {renderPanelContent(win.tab)}
          <div className="plan-panel-resize" onMouseDown={(e) => startWinResize(win.id, e)} title="Drag to resize" />
        </div>
      ))}

      {/* Canvas */}
      <div
        ref={svgRef}
        className={`plan-canvas tool-${tool} ${dragging ? "is-dragging" : ""} ${spaceDown ? "is-pan-mode" : ""} ${marquee ? "is-marquee" : ""}`}
        onMouseDown={onCanvasMouseDown}
        onWheel={onCanvasWheel}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("application/x-flow-element")) return;
          e.preventDefault(); e.dataTransfer.dropEffect = "copy";
          // throttle 16ms (E-1)
          const now = Date.now();
          if (now - lastDragOverRef.current < 16) return;
          lastDragOverRef.current = now;
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          const cx = (e.clientX - rect.left - view.x) / view.k;
          const cy = (e.clientY - rect.top - view.y) / view.k;
          const idx = findClosestEdgeIdx(cx, cy);
          setHoveredEdgeIdx(idx);
        }}
        onDragLeave={() => setHoveredEdgeIdx(null)}
        onDrop={(e) => {
          const data = e.dataTransfer.getData("application/x-flow-element");
          if (!data) { setHoveredEdgeIdx(null); return; }
          e.preventDefault();
          try {
            const payload = JSON.parse(data);
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = (e.clientX - rect.left - view.x) / view.k;
            const y = (e.clientY - rect.top - view.y) / view.k;
            // E-1: If an edge is highlighted, do split-insert (My Functions use normal drop)
            const isCustom = payload.meta && payload.meta.custom;
            if (hoveredEdgeIdx !== null && !isCustom) {
              const edge = (board.edges || [])[hoveredEdgeIdx];
              const from = board.items.find(it => it.id === edge.from);
              const to = board.items.find(it => it.id === edge.to);
              if (from && to) {
                insertNodeBetween(from, to, edge.from, edge.to, payload);
              }
              setHoveredEdgeIdx(null);
              return;
            }
            setHoveredEdgeIdx(null);
            // My Function (composite): place as 1 collapsed block
            if (payload.meta && payload.meta.custom && Array.isArray(payload.meta.items)) {
              const fnId = payload.meta.fnId;
              const fn = (loadCustomFunctions() || []).find(f => f.id === fnId);
              const gid = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              const newGroup = {
                id: gid, type: "group",
                label: payload.title || "My Function",
                description: fn?.description || "",
                color: fn?.color || (payload.meta.fnColor || "#7c3aed"),
                shape: fn?.shape || "rounded",
                collapsed: true,
                items: (fn?.items || payload.meta.items || []).map(it => ({ ...it })),
                edges: (fn?.edges || []).map(e => ({ ...e })),
                fnId,
                x: x - 110, y: y - 32, w: 220, h: 64,
              };
              setBoardWithHistory(b => ({ ...b, items: [...b.items, newGroup] }));
              setSelectedIds(new Set([gid]));
              return;
            }
            // Regular single element
            const id = `${payload.type || "node"}_${Date.now()}_${itemCounter.current++}`;
            setBoardWithHistory(b => ({
              ...b,
              items: [...b.items, {
                id, type: "node", nodeType: payload.type, label: payload.title,
                subtitle: payload.subtitle || "", meta: payload.meta || {},
                x: x - 90, y: y - 30, w: 180, h: 60,
              }],
            }));
          } catch (err) { console.warn("drop parse failed", err); }
        }}
        onContextMenu={(e) => {
          // Right-click drag is used for pan; only open menu when mouse didn't move after press
          if (!e.target.closest(".plan-item") && !dragging) {
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY, targetId: null });
          }
        }}
      >
        {/* Grid background */}
        <svg className="plan-grid" width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <defs>
            <pattern id="plan-grid-pattern" width={40 * view.k} height={40 * view.k} patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x % (40 * view.k)},${view.y % (40 * view.k)})`}>
              <circle cx={20 * view.k} cy={20 * view.k} r="0.8" fill="var(--bd-2)" opacity="0.6" />
            </pattern>
            {/* Arrow tips per node type */}
            {Object.entries(window.NODE_TYPES || {}).map(([k, t]) => (
              <marker key={k} id={`plan-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={t.color} />
              </marker>
            ))}
            {/* Dynamic markers per group color */}
            {board.items.filter(it => it.type === "group").map(g => (
              <marker key={g.id} id={`plan-arrow-group-${g.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={g.color || "#7c3aed"} />
              </marker>
            ))}
            <marker id="plan-arrow-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#plan-grid-pattern)" />
          {/* Edge drawing layer (inter-node arrows — colored + flow animation) */}
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {(board.edges || []).map((e, i) => {
              const from = board.items.find(it => it.id === e.from);
              const to = board.items.find(it => it.id === e.to);
              if (!from || !to) return null;
              const fx = (from.x || 0) + (from.w || 180) / 2;
              const fy = (from.y || 0) + (from.h || 60);
              const tx = (to.x || 0) + (to.w || 180) / 2;
              const ty = (to.y || 0);
              const dy = ty - fy;
              const cy = Math.max(20, Math.abs(dy) * 0.45);
              const d = `M ${fx} ${fy} C ${fx} ${fy + cy}, ${tx} ${ty - cy}, ${tx} ${ty}`;
              // Color arrow with "to" node type color (group uses its own color; others from NODE_TYPES)
              const NT = window.NODE_TYPES || {};
              const toType = to.type === "group" ? null : to.nodeType;
              const color = to.type === "group" ? (to.color || "#7c3aed") : (NT[toType]?.color || "#94a3b8");
              const markerId = to.type === "group"
                ? `plan-arrow-group-${to.id}`
                : (toType && NT[toType] ? `plan-arrow-${toType}` : "plan-arrow-default");
              const midX = (fx + tx) / 2;
              const midY = (fy + ty) / 2;
              const isBeingRerouted = edgeReroute && edgeReroute.edgeIdx === i;
              const isSelected = selectedEdgeIdx === i;
              const isHovered = hoveredEdgeIdx === i;
              return (
                <g key={i} className={`plan-edge-g ${isSelected ? "is-selected" : ""} ${isHovered ? "is-drop-target" : ""}`}>
                  {/* Wide transparent path for click detection */}
                  <path
                    d={d} fill="none"
                    stroke="transparent" strokeWidth="12"
                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedEdgeIdx(i); setSelectedIds(new Set()); }}
                  />
                  {/* Halo when drop target */}
                  {isHovered && (
                    <path d={d} fill="none" stroke="#2563eb" strokeWidth="10" opacity="0.3" />
                  )}
                  {/* Halo when selected */}
                  {isSelected && (
                    <path d={d} fill="none" stroke={color} strokeWidth="6" opacity="0.25" />
                  )}
                  {/* Faint background line (layered with flow animation) */}
                  <path d={d} fill="none" stroke={color} strokeWidth={isSelected ? 3 : 2.2} opacity={isBeingRerouted ? 0.1 : (isSelected ? 0.5 : 0.25)} />
                  {/* Main animated line (faint while rerouting / blue when drop target) */}
                  <path
                    d={d} fill="none"
                    stroke={isHovered ? "#2563eb" : color} strokeWidth={isHovered ? 3 : (isSelected ? 2.4 : 1.8)}
                    strokeDasharray="6 6"
                    markerEnd={`url(#${markerId})`}
                    className="plan-edge-flow"
                    opacity={isBeingRerouted ? 0.3 : 0.95}
                  />
                  {e.label && (
                    <text x={midX} y={midY - 10} fill={color} fontSize="11" fontWeight="600" fontFamily="Geist, sans-serif" textAnchor="middle"
                      style={{ paintOrder: "stroke", stroke: "var(--bg-1)", strokeWidth: 3 }}>
                      {e.label}
                    </text>
                  )}
                  {/* + button at edge center (insert) — always visible. When selected, × also appears to the left */}
                  <g
                    className={`plan-edge-insert-btn ${isSelected ? "is-active" : ""}`}
                    transform={`translate(${midX + (isSelected ? 14 : 0)},${midY})`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEdgeInsert({
                        fromId: e.from, toId: e.to,
                        screenX: ev.clientX, screenY: ev.clientY,
                      });
                    }}
                  >
                    <circle r="11" fill="var(--bg-1)" stroke={color} strokeWidth="1.6" />
                    <text textAnchor="middle" dominantBaseline="central" fill={color} fontSize="15" fontWeight="700" style={{ pointerEvents: "none" }}>+</text>
                  </g>
                  {isSelected && (
                    <g
                      className="plan-edge-del-btn"
                      transform={`translate(${midX - 14},${midY})`}
                      onClick={(ev) => { ev.stopPropagation(); deleteEdge(i); }}
                    >
                      <circle r="11" fill="#dc2626" stroke="white" strokeWidth="2" />
                      <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="15" fontWeight="700" style={{ pointerEvents: "none" }}>×</text>
                    </g>
                  )}
                  {/* Edge endpoint handles (from / to) — drag to reroute */}
                  <circle
                    className="plan-edge-endpoint"
                    cx={fx} cy={fy} r="6"
                    fill="var(--bg-1)" stroke={color} strokeWidth="1.5"
                    onMouseDown={(ev) => startEdgeReroute(i, "from", ev)}
                  />
                  <circle
                    className="plan-edge-endpoint"
                    cx={tx} cy={ty} r="6"
                    fill="var(--bg-1)" stroke={color} strokeWidth="1.5"
                    onMouseDown={(ev) => startEdgeReroute(i, "to", ev)}
                  />
                </g>
              );
            })}
            {/* Draft edge (while dragging from a connection handle) */}
            {draftEdge && (() => {
              const from = board.items.find(it => it.id === draftEdge.fromId);
              if (!from) return null;
              const fx = (from.x || 0) + (from.w || 180) / 2;
              const fy = (from.y || 0) + (from.h || 60);
              const tx = draftEdge.toX, ty = draftEdge.toY;
              const dy = ty - fy;
              const cy = Math.max(20, Math.abs(dy) * 0.45);
              const d = `M ${fx} ${fy} C ${fx} ${fy + cy}, ${tx} ${ty - cy}, ${tx} ${ty}`;
              return (
                <g>
                  <path d={d} fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="6 6" markerEnd="url(#plan-arrow-default)" opacity="0.9" />
                </g>
              );
            })()}
            {/* Preview line while rerouting an edge */}
            {edgeReroute && (() => {
              const e = (board.edges || [])[edgeReroute.edgeIdx];
              if (!e) return null;
              const anchor = edgeReroute.end === "from"
                ? board.items.find(it => it.id === e.to)
                : board.items.find(it => it.id === e.from);
              if (!anchor) return null;
              // Coordinates of the fixed endpoint
              const ax = (anchor.x || 0) + (anchor.w || 180) / 2;
              const ay = edgeReroute.end === "from"
                ? (anchor.y || 0)
                : (anchor.y || 0) + (anchor.h || 60);
              // Coordinates of the dragging endpoint
              const dx = edgeReroute.toX, dy = edgeReroute.toY;
              // Draw direction (from→to): if from is fixed, draw from→mouse; if to is fixed, draw mouse→to
              const sx = edgeReroute.end === "from" ? dx : ax;
              const sy = edgeReroute.end === "from" ? dy : ay;
              const ex = edgeReroute.end === "from" ? ax : dx;
              const ey = edgeReroute.end === "from" ? ay : dy;
              const dyP = ey - sy;
              const cy = Math.max(20, Math.abs(dyP) * 0.45);
              const d = `M ${sx} ${sy} C ${sx} ${sy + cy}, ${ex} ${ey - cy}, ${ex} ${ey}`;
              return (
                <path d={d} fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="6 6" markerEnd="url(#plan-arrow-default)" opacity="0.9" />
              );
            })()}
          </g>
        </svg>

        {/* Item rendering container (view transform applied) */}
        <div className="plan-items-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}>
          {/* Expanded groups are placed at the back in z-order (behind child nodes) */}
          {[...board.items].sort((a, b) => {
            const ae = a.type === "group" && a.collapsed === false ? 0 : 1;
            const be = b.type === "group" && b.collapsed === false ? 0 : 1;
            return ae - be;
          }).map(item => {
            if (item.type === "flow") return <PlanFlowCard
              key={item.id}
              item={item}
              flowList={flowList}
              workflow={workflowsCache[item.flowId]}
              loading={workflowsCache[`${item.flowId}__loading`]}
              viewK={view.k}
              isSelected={selectedIds.has(item.id)}
              readOnly={readOnly}
              onChange={(p) => updateItem(item.id, p)}
              onRemove={() => removeItem(item.id)}
              onOpenFlow={onOpenFlow}
              onSelect={(multi) => selectItem(item.id, multi)}
              onContextMenu={(x, y) => setCtxMenu({ x, y, targetId: item.id })}
              onDragBegin={beginDragHistory}
              onDragEnd={endDragHistory}
            />;
            if (item.type === "group") return <PlanGroupCard
              key={item.id}
              item={item}
              viewK={view.k}
              isSelected={selectedIds.has(item.id)}
              isEdgeTarget={edgeTargetId === item.id}
              readOnly={readOnly}
              onChange={(p) => updateItem(item.id, p)}
              onRemove={() => removeGroup(item.id)}
              onSelect={(multi) => selectItem(item.id, multi)}
              onContextMenu={(x, y) => setCtxMenu({ x, y, targetId: item.id })}
              onExpand={() => expandGroup(item.id)}
              onCollapse={() => collapseGroup(item.id)}
              onHandleDragStart={startHandleDrag}
              onDragBegin={beginDragHistory}
              onDragEnd={endDragHistory}
              onOpenDetail={() => setGroupDetail(item.id)}
              onDragMoveOver={(id, cx, cy) => {
                const idx = findClosestEdgeIdx(cx, cy, 36, id);
                setHoveredEdgeIdx(idx);
              }}
              onDragDropMaybeInsert={(id) => {
                const idx = hoveredEdgeIdxRef.current;
                if (idx !== null && idx !== undefined) {
                  insertExistingNodeIntoEdge(id, idx);
                }
                setHoveredEdgeIdx(null);
              }}
            />;
            if (item.type === "node") return <PlanNodeCard
              key={item.id}
              item={item}
              viewK={view.k}
              isSelected={selectedIds.has(item.id)}
              isEdgeTarget={edgeTargetId === item.id}
              readOnly={readOnly}
              onChange={(p) => updateItem(item.id, p)}
              onRemove={() => removeItem(item.id)}
              onSelect={(multi) => selectItem(item.id, multi)}
              onContextMenu={(x, y) => setCtxMenu({ x, y, targetId: item.id })}
              onHandleDragStart={startHandleDrag}
              onDragBegin={beginDragHistory}
              onDragEnd={endDragHistory}
              onDragMoveOver={(id, cx, cy) => {
                const idx = findClosestEdgeIdx(cx, cy, 36, id);
                setHoveredEdgeIdx(idx);
              }}
              onDragDropMaybeInsert={(id) => {
                const idx = hoveredEdgeIdxRef.current;
                if (idx !== null && idx !== undefined) {
                  insertExistingNodeIntoEdge(id, idx);
                }
                setHoveredEdgeIdx(null);
              }}
            />;
            return <PlanNote
              key={item.id}
              item={item}
              viewK={view.k}
              isSelected={selectedIds.has(item.id)}
              readOnly={readOnly}
              onChange={(p) => updateItem(item.id, p)}
              onRemove={() => removeItem(item.id)}
              onSelect={(multi) => selectItem(item.id, multi)}
              onContextMenu={(x, y) => setCtxMenu({ x, y, targetId: item.id })}
              onDragBegin={beginDragHistory}
              onDragEnd={endDragHistory}
            />;
          })}
          {/* Subflow containers for expanded groups (shown to the side) */}
          {board.items.filter(it => it.type === "group" && it.collapsed === false).map(grp => (
            <PlanSubflowContainer
              key={`sf-${grp.id}`}
              group={grp}
              onCollapse={() => collapseGroup(grp.id)}
              onSelectNode={(id) => { setSelectedIds(new Set([id])); if (onSelectionChange) onSelectionChange([id]); }}
            />
          ))}
        </div>

        {/* Empty canvas message */}
        {board.items.length === 0 && (
          <div className="plan-empty">
            <div className="plan-empty-title">Planning Whiteboard</div>
            <div className="plan-empty-desc">
              Use this board to <strong>optimize a single piece of logic</strong> —<br/>
              lay out multiple variations side-by-side to compare.
            </div>
            <div className="plan-empty-tips">
              <div>📝 <strong>"Add Note"</strong> to write goals, assumptions, and notes</div>
              <div>＋ <strong>"Add Flow"</strong> to place an existing workflow as a card</div>
              <div style={{ marginTop: 6, color: "var(--tx-4)", fontSize: 11 }}>
                Drag empty area = marquee select · Space + drag = pan
              </div>
            </div>
          </div>
        )}

        {/* Marquee selection visualization */}
        {marquee && (() => {
          const left = Math.min(marquee.x0, marquee.x1) * view.k + view.x;
          const top = Math.min(marquee.y0, marquee.y1) * view.k + view.y;
          const w = Math.abs(marquee.x1 - marquee.x0) * view.k;
          const h = Math.abs(marquee.y1 - marquee.y0) * view.k;
          return (
            <div
              className="plan-marquee"
              style={{ left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` }}
            />
          );
        })()}

        {/* Floating toolbar for selected items */}
        {selectedIds.size > 0 && !marquee && (() => {
          // Compute bounding box of selected items → position toolbar at top-center
          const items = board.items.filter(it => selectedIds.has(it.id));
          if (items.length === 0) return null;
          const xs = items.map(it => it.x || 0);
          const ys = items.map(it => it.y || 0);
          const rs = items.map(it => (it.x || 0) + (it.w || 180));
          const bs = items.map(it => (it.y || 0) + (it.h || 120));
          const minX = Math.min(...xs), minY = Math.min(...ys);
          const maxX = Math.max(...rs);
          const left = ((minX + maxX) / 2) * view.k + view.x;
          const top = minY * view.k + view.y;
          // Don't show grouping button when only notes are selected (grouping is for nodes/groups)
          const hasGroupableItems = items.some(it => it.type === "node" || it.type === "group");
          return (
            <div
              className="plan-floating-toolbar"
              style={{ left: `${left}px`, top: `${top - 44}px` }}
              onMouseDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
            >
              <span className="plan-fl-badge">{selectedIds.size}</span>
              {hasGroupableItems && (
                <button className="plan-fl-btn" onClick={openFunctionDialog} title="Group selection into a single block">
                  <span className="plan-fl-icon">🧩</span>
                  <span className="plan-fl-label">Group</span>
                </button>
              )}
              {hasGroupableItems && (() => {
                const openSave = (kind) => {
                  const selItems = board.items.filter(it => selectedIds.has(it.id));
                  const ids = new Set(selItems.map(it => it.id));
                  const selEdges = (board.edges || []).filter(e => ids.has(e.from) && ids.has(e.to));
                  setSkillSave({ items: selItems, edges: selEdges, kind });
                };
                return (
                  <>
                    <button className="plan-fl-btn" onClick={() => openSave("skill")} title="Save selection as a skill (SKILL.md) — warns if anything is missing">
                      <span className="plan-fl-icon">★</span>
                      <span className="plan-fl-label">Save as Skill</span>
                    </button>
                    <button className="plan-fl-btn" onClick={() => openSave("command")} title="Save selection as a slash command (commands/<name>.md)">
                      <span className="plan-fl-icon">/</span>
                      <span className="plan-fl-label">Save as Command</span>
                    </button>
                  </>
                );
              })()}
              <button className="plan-fl-btn" onClick={() => copySelectedToClipboard({ toSystemClipboard: true })} title="Copy as JSON to clipboard (paste into other tabs or apps)">
                <span className="plan-fl-icon">⧉</span>
                <span className="plan-fl-label">Copy JSON</span>
              </button>
              <button className="plan-fl-btn" onClick={() => cutSelected()} title="Cut (⌘X)">
                <span className="plan-fl-icon">✂</span>
              </button>
              <button className="plan-fl-btn is-danger" onClick={deleteSelected} title="Delete (Delete)">
                <span className="plan-fl-icon">🗑</span>
              </button>
              <button className="plan-fl-btn-close" onClick={clearSelection} title="Deselect (Esc)">×</button>
            </div>
          );
        })()}

        {/* Tool switcher (Figma-style: arrow=select / hand=pan) */}
        <div className="plan-tool-bar" onMouseDown={(e) => e.stopPropagation()}>
          <button
            className={`plan-tool-btn ${tool === "select" ? "is-active" : ""}`}
            onClick={() => setTool("select")}
            title="Select tool (V) — drag to marquee select"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.5 3.21V20.79c0 .45.54.67.85.35l4.86-4.86h7.13c.45 0 .67-.54.35-.85L6.35 2.86c-.31-.31-.85-.09-.85.35z"/>
            </svg>
          </button>
          <button
            className={`plan-tool-btn ${tool === "pan" ? "is-active" : ""}`}
            onClick={() => setTool("pan")}
            title="Pan tool (H) — drag to move canvas"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 0 0-4 0v5"/>
              <path d="M14 10V4a2 2 0 0 0-4 0v6"/>
              <path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </button>
        </div>

        {/* Zoom controls */}
        <div className="plan-zoom-ctrl">
          <button onClick={() => setView(v => ({ ...v, k: Math.min(2.5, v.k * 1.2) }))}>+</button>
          <button onClick={() => setView(v => ({ ...v, k: Math.max(0.25, v.k * 0.8) }))}>−</button>
          <button onClick={() => setView({ x: 0, y: 0, k: 1 })} title="Reset">⊙</button>
          <span className="plan-zoom-label">{Math.round(view.k * 100)}%</span>
        </div>
      </div>
      </div>

      {/* Edge insert picker */}
      {edgeInsert && (() => {
        // Popup to the right of the + button, flip when near screen edge
        const PICKER_W = 320;
        const PICKER_H = 460;
        const RIGHT_OFFSET = 20;  // offset to the right of + button
        let left = edgeInsert.screenX + RIGHT_OFFSET;
        let top = edgeInsert.screenY - 30;
        if (left + PICKER_W > window.innerWidth - 8) {
          // Cannot fit on right → flip to left
          left = edgeInsert.screenX - PICKER_W - RIGHT_OFFSET;
        }
        if (left < 8) left = 8;
        if (top + PICKER_H > window.innerHeight - 8) top = window.innerHeight - PICKER_H - 8;
        if (top < 8) top = 8;
        return (
        <div
          className="plan-edge-picker"
          style={{ left, top }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="plan-edge-picker-head">
            <span>＋ Insert element here</span>
            <button onClick={() => setEdgeInsert(null)} title="Close">×</button>
          </div>
          <div className="plan-edge-picker-body">
            <NodePickerList onPick={(item) => insertNodeIntoEdge(item)} />
          </div>
        </div>
        );
      })()}

      {/* Right-click context menu */}
      {ctxMenu && (
        <div className="plan-ctx-overlay" onMouseDown={() => setCtxMenu(null)} onContextMenu={(e) => e.preventDefault()}>
          <div className="plan-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onMouseDown={(e) => e.stopPropagation()}>
            {ctxMenu.targetId ? (
              <>
                <button className="plan-ctx-item" onClick={() => {
                  // Select target item before executing
                  if (!selectedIds.has(ctxMenu.targetId)) setSelectedIds(new Set([ctxMenu.targetId]));
                  setTimeout(() => { copySelectedToClipboard(); setCtxMenu(null); }, 0);
                }}>
                  <span className="plan-ctx-icon">⌘C</span>
                  <span>Copy</span>
                </button>
                <button className="plan-ctx-item" onClick={() => {
                  if (!selectedIds.has(ctxMenu.targetId)) setSelectedIds(new Set([ctxMenu.targetId]));
                  setTimeout(() => { cutSelected(); setCtxMenu(null); }, 0);
                }}>
                  <span className="plan-ctx-icon">⌘X</span>
                  <span>Cut</span>
                </button>
                <button className="plan-ctx-item" onClick={() => { pasteFromClipboard(); setCtxMenu(null); }}>
                  <span className="plan-ctx-icon">⌘V</span>
                  <span>Paste</span>
                </button>
                <div className="plan-ctx-divider" />
                <button className="plan-ctx-item plan-ctx-danger" onClick={() => {
                  if (!selectedIds.has(ctxMenu.targetId)) setSelectedIds(new Set([ctxMenu.targetId]));
                  setTimeout(() => { deleteSelected(); setCtxMenu(null); }, 0);
                }}>
                  <span className="plan-ctx-icon">⌫</span>
                  <span>Delete</span>
                </button>
              </>
            ) : (
              <>
                <button className="plan-ctx-item" onClick={() => { pasteFromClipboard(); setCtxMenu(null); }}>
                  <span className="plan-ctx-icon">⌘V</span>
                  <span>Paste Here</span>
                </button>
                <button className="plan-ctx-item" onClick={() => { addNote(); setCtxMenu(null); }}>
                  <span className="plan-ctx-icon">📝</span>
                  <span>Add Note</span>
                </button>
                <button className="plan-ctx-item" onClick={() => { setShowFlowPicker(true); setCtxMenu(null); }}>
                  <span className="plan-ctx-icon">+</span>
                  <span>Add Flow</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Flow-build AI chat: bottom-right FAB → opens panel (edit mode only) */}
      {flowChat && !readOnly && (
        chatOpen ? (
          <FlowBuildChat
            board={board}
            flowMeta={{ id: flowId, sourceType }}
            onApplyActions={(actions) => {
              const res = applyFlowActions(boardRef.current, actions);
              setBoardWithHistory(() => res.board);
              showToast("🛠", `Applied ${res.summary.length} actions`);
            }}
            onClose={() => setChatOpen(false)}
          />
        ) : (
          <button className="plan-chat-fab" onClick={() => setChatOpen(true)} title="Flow-build AI chat">💬</button>
        )
      )}

      {/* Save-as-Skill flow: validate → save → pre-context chat */}
      {skillSave && (
        <SkillSaveFlow
          subgraph={skillSave}
          kind={skillSave.kind || "skill"}
          flowMeta={{ name: board.name, desc: board.desc, sourceType }}
          onClose={() => setSkillSave(null)}
          onFocusNodes={(ids) => { setSelectedIds(new Set(ids)); if (onSelectionChange) onSelectionChange(ids); }}
        />
      )}

      {/* Group / Function dialog */}
      {fnDialog && (
        <div className="plan-modal-overlay" onClick={() => setFnDialog(null)}>
          <div className="plan-modal" onClick={(e) => e.stopPropagation()} style={{ width: 500 }}>
            <div className="plan-modal-head">
              <h3>🧩 Group / Function</h3>
              <button onClick={() => setFnDialog(null)}>×</button>
            </div>
            <div className="plan-modal-body" style={{ gap: 12 }}>
              <div className="plan-fn-info">
                Combines {fnDialog.items.length} items into a single □ block. Use ＋ to expand again.
              </div>
              <label className="plan-fn-field">
                <span className="plan-fn-label">Name <span style={{color: "#dc2626"}}>*</span></span>
                <input
                  autoFocus
                  className="plan-fn-input"
                  value={fnDialog.name}
                  onChange={(e) => setFnDialog(d => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. PR Review Subflow"
                />
              </label>
              <label className="plan-fn-field">
                <span className="plan-fn-label">Description</span>
                <textarea
                  rows={2}
                  className="plan-fn-input"
                  value={fnDialog.description}
                  onChange={(e) => setFnDialog(d => ({ ...d, description: e.target.value }))}
                  placeholder="Brief description of what this block does"
                />
              </label>
              <div className="plan-fn-field">
                <span className="plan-fn-label">Color</span>
                <div className="plan-fn-color-row">
                  {["#7c3aed", "#2563eb", "#0891b2", "#15803d", "#c2410c", "#dc2626", "#6d28d9", "#525252"].map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`plan-fn-color-sw ${fnDialog.color === c ? "is-on" : ""}`}
                      style={{ background: c }}
                      onClick={() => setFnDialog(d => ({ ...d, color: c }))}
                      title={c}
                    />
                  ))}
                </div>
              </div>
              <div className="plan-fn-field">
                <span className="plan-fn-label">Shape</span>
                <div className="plan-fn-shape-row">
                  {[
                    { id: "rounded", label: "Rounded" },
                    { id: "rect", label: "Rect" },
                    { id: "pill", label: "Pill" },
                    { id: "hex", label: "Hex" },
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={`plan-fn-shape-btn is-shape-${s.id} ${fnDialog.shape === s.id ? "is-on" : ""}`}
                      style={fnDialog.shape === s.id ? { borderColor: fnDialog.color, color: fnDialog.color } : {}}
                      onClick={() => setFnDialog(d => ({ ...d, shape: s.id }))}
                    >{s.label}</button>
                  ))}
                </div>
              </div>
              <label className="plan-fn-field">
                <span className="plan-fn-label">
                  <input
                    type="checkbox"
                    checked={fnDialog.registerAsCustom}
                    onChange={(e) => setFnDialog(d => ({ ...d, registerAsCustom: e.target.checked }))}
                    style={{ marginRight: 6 }}
                  />
                  Also save as My Function (enables reuse in other flows)
                </span>
              </label>
              {/* Preview */}
              <div className="plan-fn-preview-wrap">
                <span style={{ font: "500 11px Geist Mono, monospace", color: "var(--tx-4)" }}>Preview</span>
                <div
                  className={`plan-fn-preview is-shape-${fnDialog.shape}`}
                  style={{ borderColor: fnDialog.color, background: fnDialog.color + "0d" }}
                >
                  <span className="plan-fn-preview-dot" style={{ background: fnDialog.color }} />
                  <span className="plan-fn-preview-label">{fnDialog.name || "Unnamed"}</span>
                  <span className="plan-fn-preview-count">＋{fnDialog.items.length}</span>
                </div>
              </div>
            </div>
            <div className="plan-modal-foot">
              <button className="plan-btn" onClick={() => setFnDialog(null)}>Cancel</button>
              <button className="plan-btn plan-btn-primary" onClick={saveFunction}>Group</button>
            </div>
          </div>
        </div>
      )}

      {/* Flow picker modal */}
      {showFlowPicker && (
        <div className="plan-modal-overlay" onClick={() => setShowFlowPicker(false)}>
          <div className="plan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="plan-modal-head">
              <h3>Add as Flow Card</h3>
              <button onClick={() => setShowFlowPicker(false)}>×</button>
            </div>
            <div className="plan-modal-body">
              {flowList.flatMap(section => section.items.map(item => ({ ...item, section: section.section }))).map(f => (
                <button key={f.id} className="plan-flow-pick" onClick={() => addFlowCard(f)}>
                  <span className="plan-flow-pick-name">{f.name}</span>
                  <span className="plan-flow-pick-meta">{f.section} · {f.nodes} nodes</span>
                </button>
              ))}
              {flowList.length === 0 && <div className="plan-empty-text">No flows available</div>}
            </div>
          </div>
        </div>
      )}

      {groupDetail && (() => {
        const grp = board.items.find(it => it.id === groupDetail);
        if (!grp) return null;
        const NT = window.NODE_TYPES || {};
        return (
          <div className="plan-modal-overlay" onClick={() => setGroupDetail(null)}>
            <div className="plan-modal" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxHeight: "80vh" }}>
              <div className="plan-modal-head">
                <h3>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: grp.color || "#7c3aed", marginRight: 8, verticalAlign: "middle" }} />
                  {grp.label || "(Unnamed Function)"}
                </h3>
                <button onClick={() => setGroupDetail(null)}>×</button>
              </div>
              <div className="plan-modal-body" style={{ gap: 10 }}>
                {grp.description && (
                  <div className="plan-fn-info">{grp.description}</div>
                )}
                <div style={{ font: "600 11px Geist Mono, monospace", color: "var(--tx-4)" }}>
                  Inner elements ({(grp.items || []).length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(grp.items || []).map(it => {
                    const t = NT[it.nodeType] || {};
                    return (
                      <div key={it.id} className="plan-group-detail-row" style={{ borderLeftColor: t.color || "var(--bd-2)" }}>
                        <div className="plan-node-card-head">
                          <span className="plan-node-card-chip" style={{ color: t.color }}>
                            <span className="plan-node-card-icon">{t.icon || "·"}</span>
                            <span className="plan-node-card-type">{t.label || it.nodeType}</span>
                          </span>
                        </div>
                        <div className="plan-node-card-title">{it.label}</div>
                        {it.subtitle && <div className="plan-node-card-subtitle">{it.subtitle}</div>}
                        {it.meta && it.meta.desc && (
                          <div className="plan-group-detail-desc">{it.meta.desc}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(grp.edges || []).length > 0 && (
                  <>
                    <div style={{ font: "600 11px Geist Mono, monospace", color: "var(--tx-4)", marginTop: 8 }}>
                      Internal connections ({grp.edges.length})
                    </div>
                    <div className="plan-group-detail-edges">
                      {grp.edges.map((e, i) => {
                        const fromIt = grp.items.find(it => it.id === e.from);
                        const toIt = grp.items.find(it => it.id === e.to);
                        return (
                          <div key={i} className="plan-group-detail-edge">
                            <span>{fromIt?.label || e.from}</span>
                            <span style={{ color: "var(--tx-4)" }}>→{e.label ? `[${e.label}]` : ""}</span>
                            <span>{toIt?.label || e.to}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <div className="plan-modal-foot">
                <button className="plan-btn" onClick={() => setGroupDetail(null)}>Close</button>
                <button className="plan-btn plan-btn-primary" onClick={() => {
                  setGroupDetail(null);
                  expandGroup(grp.id);
                }}>Expand to Edit</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showFnPicker && (
        <div className="plan-modal-overlay" onClick={() => setShowFnPicker(false)}>
          <div className="plan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="plan-modal-head">
              <h3>🧩 Insert My Function</h3>
              <button onClick={() => setShowFnPicker(false)}>×</button>
            </div>
            <div className="plan-modal-body">
              {(() => {
                const fns = loadCustomFunctions();
                if (fns.length === 0) {
                  return (
                    <div className="plan-empty-text">
                      No My Functions yet.
                      <br/>
                      <span style={{ fontSize: 11, color: "var(--tx-4)" }}>
                        Select items and use "Group" to save one.
                      </span>
                    </div>
                  );
                }
                return fns.map(fn => (
                  <button key={fn.id} className="plan-flow-pick" onClick={() => insertFunction(fn)}>
                    <span className="plan-flow-pick-name">
                      <span style={{ marginRight: 6 }}>{fn.icon || "🧩"}</span>
                      {fn.name}
                    </span>
                    <span className="plan-flow-pick-meta">
                      {fn.category || "My Functions"} · {(fn.items || []).length} items
                      {fn.description && ` · ${fn.description.slice(0, 40)}${fn.description.length > 40 ? "…" : ""}`}
                    </span>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Save As modal */}
      {saveAsModal && (
        <div className="plan-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setSaveAsModal(null); }}>
          <div className="plan-modal plan-saveas-modal">
            <div className="plan-modal-head">
              <span className="plan-modal-title">📋 Save As</span>
              <button className="plan-modal-close" onClick={() => setSaveAsModal(null)} title="Close">×</button>
            </div>
            <div className="plan-modal-body">
              <div className="plan-saveas-field">
                <label className="plan-saveas-label">Save Location (Folder)</label>
                <input
                  type="text"
                  className="plan-saveas-input mono"
                  value={saveAsModal.location}
                  onChange={(e) => setSaveAsModal(m => ({ ...m, location: e.target.value }))}
                  placeholder="skill/X-Autopilot/"
                />
                <div className="plan-saveas-hint">e.g. <code>skill/X-Autopilot/</code> · <code>automation/X-Autopilot/</code></div>
              </div>
              <div className="plan-saveas-field">
                <label className="plan-saveas-label">Filename (Version)</label>
                <input
                  type="text"
                  className="plan-saveas-input mono"
                  value={saveAsModal.name}
                  onChange={(e) => setSaveAsModal(m => ({ ...m, name: e.target.value }))}
                  placeholder="X-Autopilot-v1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && saveAsModal.name.trim()) {
                      e.preventDefault();
                      document.querySelector('.plan-saveas-submit')?.click();
                    }
                  }}
                />
                <div className="plan-saveas-hint">Final path: <code className="plan-saveas-path">{(saveAsModal.location || "").replace(/\/$/, "") + "/" + (saveAsModal.name || "")}</code></div>
              </div>
              {saveAsModal.existing && saveAsModal.existing.length > 0 && (
                <div className="plan-saveas-field">
                  <label className="plan-saveas-label">Existing versions in this folder ({saveAsModal.existing.length})</label>
                  <div className="plan-saveas-existing">
                    {saveAsModal.existing.map((ex, i) => {
                      const isOverwriting = ex.name === saveAsModal.name;
                      return (
                        <div key={i} className={`plan-saveas-existing-row ${isOverwriting ? "is-conflict" : ""}`}>
                          <span className="plan-saveas-existing-name mono">{ex.name}</span>
                          {ex.savedAt && <span className="plan-saveas-existing-time">{new Date(ex.savedAt).toLocaleString()}</span>}
                          <button
                            className="plan-saveas-existing-use"
                            onClick={() => setSaveAsModal(m => ({ ...m, name: ex.name }))}
                            title="Use this version name (will overwrite)"
                          >Use</button>
                        </div>
                      );
                    })}
                  </div>
                  {saveAsModal.existing.some(e => e.name === saveAsModal.name) && (
                    <div className="plan-saveas-warn">⚠ This will overwrite an existing version with the same name</div>
                  )}
                </div>
              )}
            </div>
            <div className="plan-modal-foot">
              <button className="plan-btn" onClick={() => setSaveAsModal(null)}>Cancel</button>
              <button
                className="plan-btn plan-btn-primary plan-saveas-submit"
                disabled={!saveAsModal.name?.trim() || !saveAsModal.location?.trim()}
                onClick={() => {
                  const location = saveAsModal.location.replace(/\/+$/, "") + "/";
                  const name = saveAsModal.name.trim();
                  const fullKey = `fi_saveas:${location}${name}`;
                  // Pass details to parent onSaveAs. If absent, default to writing to localStorage.
                  // onSaveAs may return a string or Promise<string>
                  setSaveAsModal(null);
                  const finish = (result) => showToast("📋", result || `Saved: ${location}${name}`);
                  if (onSaveAs) {
                    Promise.resolve(onSaveAs(boardRef.current, { location, name, fullKey })).then(finish);
                  } else {
                    try {
                      localStorage.setItem(fullKey, JSON.stringify({ ...boardRef.current, name, savedAt: new Date().toISOString() }));
                      finish(`Saved: ${location}${name}`);
                    } catch (e) {
                      finish(`Save failed: ${e.message}`);
                    }
                  }
                }}
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Save / deploy toast */}
      {toast && (
        <div className="plan-toast">
          {toast.icon && <span className="plan-toast-icon">{toast.icon}</span>}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

// Flow card thumbnail: shows node list as colored dots + titles in a vertical list
// + simple edge lines connecting adjacent nodes
export function PlanFlowThumb({ workflow, loading, flowMeta }) {
  if (loading) {
    return (
      <div className="plan-card-thumb-placeholder">
        <div className="plan-card-thumb-text" style={{ opacity: 0.6 }}>Loading...</div>
      </div>
    );
  }
  if (!workflow || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    return (
      <div className="plan-card-thumb-placeholder">
        <div className="plan-card-thumb-text" style={{ opacity: 0.6 }}>
          {flowMeta?.nodes ? `${flowMeta.nodes} nodes (not loaded)` : "Cannot load flow structure"}
        </div>
      </div>
    );
  }
  // Render actual FlowDiagram at reduced scale. Disable pointer-events to show as thumbnail.
  if (!window.FlowDiagram) {
    return <div className="plan-card-thumb-placeholder"><div className="plan-card-thumb-text">FlowDiagram not loaded</div></div>;
  }
  const FD = window.FlowDiagram;
  return (
    <div className="plan-card-thumb-diagram">
      <FD workflow={workflow} selected={null} onSelect={() => {}} drafts={[]} />
    </div>
  );
}

// Standalone node card on the plan board (element placed from palette)
export function PlanNodeCard({ item, viewK, isSelected, isEdgeTarget, readOnly, onChange, onRemove, onSelect, onContextMenu, onHandleDragStart, onDragBegin, onDragEnd, onDragMoveOver, onDragDropMaybeInsert }) {
  const [isDragging, setIsDragging] = React.useState(false);
  const NT = window.NODE_TYPES || {};
  const t = NT[item.nodeType] || {};

  function onDragStart(e) {
    if (e.target.closest(".plan-node-actions") || e.target.closest(".plan-card-resize") || e.target.closest(".plan-node-handle")) return;
    e.stopPropagation();
    // Selection also works in readOnly (for detail panel display)
    if (onSelect) onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
    if (readOnly) return;  // skip drag in readOnly mode
    setIsDragging(true);
    if (onDragBegin) onDragBegin();
    const sx = e.clientX, sy = e.clientY;
    const bx = item.x, by = item.y;
    let didMove = false;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (mv) => {
      didMove = true;
      const nx = bx + (mv.clientX - sx) / viewK;
      const ny = by + (mv.clientY - sy) / viewK;
      onChange({ x: nx, y: ny });
      // Compute node center in canvas coords and check for nearby edge → notify parent
      if (onDragMoveOver) {
        const cx = nx + (item.w || 180) / 2;
        const cy = ny + (item.h || 60) / 2;
        onDragMoveOver(item.id, cx, cy);
      }
    };
    const onUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (onDragDropMaybeInsert) onDragDropMaybeInsert(item.id);
      if (onDragEnd) onDragEnd(didMove);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className={`plan-item plan-node-card ${isDragging ? "is-dragging" : ""} ${isSelected ? "is-selected" : ""} ${isEdgeTarget ? "is-edge-target" : ""}`}
      data-plan-item-id={item.id}
      style={{
        left: item.x, top: item.y, width: item.w || 180, height: item.h || 60,
        borderLeftColor: t.color || "var(--bd-2)",
      }}
      onMouseDown={onDragStart}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (onContextMenu) onContextMenu(e.clientX, e.clientY); }}
    >
      <div className="plan-node-card-head">
        <span className="plan-node-card-chip" style={{ color: t.color }}>
          <span className="plan-node-card-icon">{t.icon || "·"}</span>
          <span className="plan-node-card-type">{
            // For systemd/cron/GitHub Actions, "hook" is misleading — replace with clearer
            // "trigger" labels (to distinguish from Claude Code hooks).
            ({ systemd: "Start Trigger", cron: "Scheduled Trigger", "github-actions": "CI Trigger" }[item.meta?.subtype])
            || t.label || item.nodeType
          }</span>
        </span>
        {item.meta?.subtype && (
          <span className="plan-node-card-chip" style={{ color: t.color, marginLeft: 4, opacity: 0.85 }}>
            <span>{({ systemd: "🛡️", cron: "⏰", "github-actions": "🐙" }[item.meta.subtype]) || ""}</span>
            <span className="plan-node-card-type">{item.meta.subtype}</span>
          </span>
        )}
        {item.meta?.subflow?.nodes?.length > 0 && (
          <span
            className="plan-node-card-chip"
            style={{ color: t.color, marginLeft: 4, opacity: 0.9 }}
            title="This node has an internal flow"
          >
            <span>📂</span>
            <span className="plan-node-card-type">Inner: {item.meta.subflow.nodes.length} nodes</span>
          </span>
        )}
        <button className="plan-node-card-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
      </div>
      <div className="plan-node-card-title">{item.label}</div>
      {item.subtitle && <div className="plan-node-card-subtitle">{item.subtitle}</div>}
      {/* Connection handle: drag to draw an arrow to another node */}
      <div
        className="plan-node-handle"
        title="Drag to draw arrow"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (onHandleDragStart) onHandleDragStart(item.id, e);
        }}
      />
    </div>
  );
}

// Flow card on the plan board (miniaturized workflow view)
// Group (composite grouped element) — collapsed display + ＋ button to expand
// Expanded group's side subflow container — dashed frame to the right of original block + inner nodes/edges
export function PlanSubflowContainer({ group, onCollapse, onSelectNode }) {
  const NT = window.NODE_TYPES || {};
  const items = group.items || [];
  const edges = group.edges || [];
  const color = group.color || "#7c3aed";
  if (items.length === 0) return null;

  // Compute bbox of inner nodes (in group-local coordinate space)
  const xs = items.map(it => it.x || 0);
  const ys = items.map(it => it.y || 0);
  const rs = items.map(it => (it.x || 0) + (it.w || 180));
  const bs = items.map(it => (it.y || 0) + (it.h || 60));
  const localMinX = Math.min(...xs), localMinY = Math.min(...ys);
  const localMaxX = Math.max(...rs), localMaxY = Math.max(...bs);
  const contentW = localMaxX - localMinX;
  const contentH = localMaxY - localMinY;

  const PAD = 24, HEADER = 32, GAP = 60;
  const containerW = contentW + PAD * 2;
  const containerH = contentH + PAD * 2 + HEADER;

  // Position: right edge of original block + GAP
  const groupX = group.x || 0, groupY = group.y || 0;
  const groupW = group.w || 220, groupH = group.h || 64;
  const containerX = groupX + groupW + GAP;
  const containerY = groupY + groupH / 2 - containerH / 2;

  // Connector line (right edge of original block → left edge of container)
  const lineX1 = groupX + groupW;
  const lineY1 = groupY + groupH / 2;
  const lineX2 = containerX;
  const lineY2 = containerY + containerH / 2;
  const lineDx = (lineX2 - lineX1) * 0.5;

  // Absolute position of inner nodes (container top-left + PAD + (local coord - localMin))
  function absPos(it) {
    return {
      x: containerX + PAD + ((it.x || 0) - localMinX),
      y: containerY + PAD + HEADER + ((it.y || 0) - localMinY),
    };
  }
  const itemPositions = {};
  items.forEach(it => { itemPositions[it.id] = absPos(it); });

  return (
    <>
      {/* Connector line (original block → container) */}
      <svg
        className="plan-subflow-connect"
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}
        width="0" height="0"
      >
        <path
          d={`M ${lineX1} ${lineY1} C ${lineX1 + lineDx} ${lineY1}, ${lineX2 - lineDx} ${lineY2}, ${lineX2} ${lineY2}`}
          fill="none" stroke={color} strokeWidth="2" strokeDasharray="6 4" opacity="0.7"
        />
      </svg>

      {/* Container body (dashed frame + header + inner content) */}
      <div
        className="plan-subflow-container"
        style={{
          left: containerX, top: containerY, width: containerW, height: containerH,
          borderColor: color, background: `${color}06`,
        }}
      >
        <div className="plan-subflow-header" style={{ borderColor: color }}>
          <span className="plan-subflow-dot" style={{ background: color }} />
          <span className="plan-subflow-label" style={{ color }}>{(group.label || "").toUpperCase()}</span>
          <button
            type="button"
            className="plan-subflow-collapse"
            title="Collapse"
            onClick={(e) => { e.stopPropagation(); onCollapse && onCollapse(); }}
            style={{ background: color, color: "white" }}
          >−</button>
        </div>
      </div>

      {/* Inner edges (rendered before nodes, visually behind them) */}
      <svg
        className="plan-subflow-edges"
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}
        width="0" height="0"
      >
        {edges.map((e, i) => {
          const fp = itemPositions[e.from];
          const tp = itemPositions[e.to];
          if (!fp || !tp) return null;
          const fromIt = items.find(it => it.id === e.from);
          const toIt = items.find(it => it.id === e.to);
          const fx = fp.x + (fromIt?.w || 180) / 2;
          const fy = fp.y + (fromIt?.h || 60);
          const tx = tp.x + (toIt?.w || 180) / 2;
          const ty = tp.y;
          const dy = ty - fy;
          const cy = Math.max(20, Math.abs(dy) * 0.45);
          const d = `M ${fx} ${fy} C ${fx} ${fy + cy}, ${tx} ${ty - cy}, ${tx} ${ty}`;
          const tColor = NT[toIt?.nodeType]?.color || "#94a3b8";
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={tColor} strokeWidth="1.6" strokeDasharray="6 6" opacity="0.85" />
              {e.label && (
                <text x={(fx + tx) / 2} y={(fy + ty) / 2} fill={tColor} fontSize="11" fontWeight="600" textAnchor="middle"
                  style={{ paintOrder: "stroke", stroke: "var(--bg-1)", strokeWidth: 3 }}>{e.label}</text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Inner nodes (read-only mini cards) */}
      {items.map(it => {
        const p = itemPositions[it.id];
        const t = NT[it.nodeType] || {};
        return (
          <div
            key={it.id}
            className="plan-subflow-node"
            style={{
              position: "absolute",
              left: p.x, top: p.y, width: it.w || 180, height: it.h || 60,
              borderLeftColor: t.color || "var(--bd-2)",
              cursor: "pointer",
            }}
            onClick={(e) => { e.stopPropagation(); if (onSelectNode) onSelectNode(it.id); }}
          >
            <div className="plan-node-card-head">
              <span className="plan-node-card-chip" style={{ color: t.color }}>
                <span className="plan-node-card-icon">{t.icon || "·"}</span>
                <span className="plan-node-card-type">{t.label || it.nodeType}</span>
              </span>
            </div>
            <div className="plan-node-card-title">{it.label}</div>
            {it.subtitle && <div className="plan-node-card-subtitle">{it.subtitle}</div>}
          </div>
        );
      })}
    </>
  );
}

export function PlanGroupCard({ item, viewK, isSelected, isEdgeTarget, readOnly, frame, onChange, onRemove, onSelect, onContextMenu, onExpand, onCollapse, onFrameDragStart, onHandleDragStart, onDragBegin, onDragEnd, onOpenDetail, onDragMoveOver, onDragDropMaybeInsert }) {
  const [isDragging, setIsDragging] = React.useState(false);

  function onDragStart(e) {
    if (e.target.closest(".plan-group-actions") || e.target.closest(".plan-group-expand-btn") || e.target.closest(".plan-card-resize") || e.target.closest(".plan-node-handle")) return;
    e.stopPropagation();
    if (onSelect) onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
    if (readOnly) return;
    setIsDragging(true);
    if (onDragBegin) onDragBegin();
    const sx = e.clientX, sy = e.clientY;
    const bx = item.x, by = item.y;
    let didMove = false;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (mv) => {
      didMove = true;
      const nx = bx + (mv.clientX - sx) / viewK;
      const ny = by + (mv.clientY - sy) / viewK;
      onChange({ x: nx, y: ny });
      if (onDragMoveOver) {
        const cx = nx + (item.w || 220) / 2;
        const cy = ny + (item.h || 64) / 2;
        onDragMoveOver(item.id, cx, cy);
      }
    };
    const onUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (onDragDropMaybeInsert) onDragDropMaybeInsert(item.id);
      if (onDragEnd) onDragEnd(didMove);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const color = item.color || "#7c3aed";
  const shape = item.shape || "rounded";
  const collapsed = item.collapsed !== false;  // collapsed by default
  const w = item.w || 220, h = item.h || 64;

  // Single □ block (same appearance collapsed/expanded; only the + / − button toggles)
  return (
    <div
      className={`plan-item plan-group-card is-shape-${shape} ${isDragging ? "is-dragging" : ""} ${isSelected ? "is-selected" : ""} ${isEdgeTarget ? "is-edge-target" : ""}`}
      data-plan-item-id={item.id}
      style={{
        left: item.x, top: item.y, width: w, height: h,
        borderColor: color,
        background: `${color}0d`,
      }}
      onMouseDown={onDragStart}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (onContextMenu) onContextMenu(e.clientX, e.clientY); }}
    >
      <span className="plan-group-dot" style={{ background: color }} />
      <div className="plan-group-text">
        <div className="plan-group-label">{item.label || "(Unnamed Function)"}</div>
        {item.description && <div className="plan-group-sub">{item.description}</div>}
      </div>
      <span className="plan-group-count" style={{ color }}>{item.items?.length || 0} elements</span>
      <button
        type="button"
        className="plan-group-expand-btn"
        title={collapsed ? "Expand to open flow" : "Collapse"}
        onClick={(e) => {
          e.stopPropagation();
          if (collapsed) { onExpand && onExpand(); }
          else { onCollapse && onCollapse(); }
        }}
        style={{ background: color, color: "white" }}
      >{collapsed ? "＋" : "−"}</button>
      <div className="plan-group-actions" onMouseDown={(e) => e.stopPropagation()}>
        <button className="plan-group-info" onClick={(e) => { e.stopPropagation(); onOpenDetail && onOpenDetail(); }} title="View inner details">ⓘ</button>
        <button className="plan-group-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Delete">×</button>
      </div>
      {/* Connection handle: drag to draw arrow */}
      <div
        className="plan-node-handle"
        title="Drag to draw arrow"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (onHandleDragStart) onHandleDragStart(item.id, e);
        }}
      />
    </div>
  );
}

export function PlanFlowCard({ item, flowList, workflow, loading, viewK, isSelected, readOnly, onChange, onRemove, onOpenFlow, onSelect, onContextMenu, onDragBegin, onDragEnd }) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [hover, setHover] = React.useState(false);

  function onDragStart(e) {
    if (readOnly) return;
    if (e.target.closest(".plan-card-action") || e.target.closest(".plan-card-resize")) return;
    e.stopPropagation();
    // Select on click
    if (onSelect) onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
    setIsDragging(true);
    if (onDragBegin) onDragBegin();
    let didMove = false;
    const sx = e.clientX, sy = e.clientY;
    const bx = item.x, by = item.y;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (mv) => { didMove = true; onChange({ x: bx + (mv.clientX - sx) / viewK, y: by + (mv.clientY - sy) / viewK }); };
    const onUp = () => {
      if (onDragEnd) onDragEnd(didMove);
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  function onResizeStart(e) {
    e.stopPropagation(); e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const bw = item.w, bh = item.h;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
    const onMove = (mv) => onChange({
      w: Math.max(200, bw + (mv.clientX - sx) / viewK),
      h: Math.max(140, bh + (mv.clientY - sy) / viewK),
    });
    const onUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Retrieve flow info from flowList
  const flowMeta = flowList.flatMap(s => s.items).find(f => f.id === item.flowId);

  return (
    <div
      className={`plan-item plan-flow-card ${isDragging ? "is-dragging" : ""} ${isSelected ? "is-selected" : ""}`}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={(e) => { e.preventDefault(); if (onContextMenu) onContextMenu(e.clientX, e.clientY); }}
    >
      <div className="plan-card-header" onMouseDown={onDragStart} title="Drag to move">
        <input
          className="plan-card-label"
          value={item.label || ""}
          onChange={(e) => onChange({ label: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Label (V1, V2, etc.)"
        />
        {hover && (
          <div className="plan-card-actions">
            <button className="plan-card-action" onClick={(e) => { e.stopPropagation(); onOpenFlow && onOpenFlow(item.flowId); }} title="Open flow">⤢</button>
            <button className="plan-card-action plan-card-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Delete">×</button>
          </div>
        )}
      </div>
      <div className="plan-card-body">
        {flowMeta ? (
          <>
            <div className="plan-card-meta">
              <span>{flowMeta.name}</span>
              <span className="plan-card-meta-sub">{flowMeta.nodes} nodes · {flowMeta.complexity || "—"}</span>
            </div>
            <PlanFlowThumb workflow={workflow} loading={loading} flowMeta={flowMeta} />
          </>
        ) : (
          <div className="plan-card-meta">Flow info not found ({item.flowId})</div>
        )}
      </div>
      <div className="plan-card-resize" onMouseDown={onResizeStart} title="Drag to resize" />
    </div>
  );
}

// Sticky note on the plan board
export function PlanNote({ item, viewK, isSelected, readOnly, onChange, onRemove, onSelect, onContextMenu, onDragBegin, onDragEnd }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const COLORS = {
    yellow: { bg: "#fff8c2", border: "#e8d76a", text: "#5b4d00" },
    pink:   { bg: "#ffd6e3", border: "#e8a3bb", text: "#5b1530" },
    blue:   { bg: "#d0e7ff", border: "#7fb3e5", text: "#0a3d6b" },
    green:  { bg: "#d6f5d6", border: "#7fc97f", text: "#0d4a18" },
  };
  const c = COLORS[item.color] || COLORS.yellow;

  function onDragStart(e) {
    if (readOnly) return;
    if (isEditing) return;
    if (e.target.closest(".plan-note-actions") || e.target.closest(".plan-card-resize") || e.target.closest("textarea") || e.target.closest(".plan-note-text")) return;
    e.stopPropagation();
    // Select on click
    if (onSelect) onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
    setIsDragging(true);
    if (onDragBegin) onDragBegin();
    let didMove = false;
    const sx = e.clientX, sy = e.clientY;
    const bx = item.x, by = item.y;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (mv) => { didMove = true; onChange({ x: bx + (mv.clientX - sx) / viewK, y: by + (mv.clientY - sy) / viewK }); };
    const onUp = () => {
      if (onDragEnd) onDragEnd(didMove);
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onResizeStart(e) {
    e.stopPropagation(); e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const bw = item.w, bh = item.h;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
    const onMove = (mv) => onChange({
      w: Math.max(100, bw + (mv.clientX - sx) / viewK),
      h: Math.max(60, bh + (mv.clientY - sy) / viewK),
    });
    const onUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className={`plan-item plan-note ${isEditing ? "is-editing" : ""} ${isDragging ? "is-dragging" : ""} ${isSelected ? "is-selected" : ""}`}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h, background: c.bg, borderColor: c.border, color: c.text }}
      onMouseDown={onDragStart}
      onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (onContextMenu) onContextMenu(e.clientX, e.clientY); }}
    >
      <div className="plan-note-handle" />
      <div className="plan-note-actions" onMouseDown={(e) => e.stopPropagation()}>
        {Object.keys(COLORS).map(col => (
          <button key={col}
            className={`plan-note-color ${item.color === col ? "is-on" : ""}`}
            style={{ background: COLORS[col].bg, borderColor: COLORS[col].border }}
            onClick={(e) => { e.stopPropagation(); onChange({ color: col }); }}
          />
        ))}
        <button className="plan-note-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
      </div>
      {isEditing ? (
        <textarea
          autoFocus
          className="plan-note-textarea"
          style={{ color: c.text }}
          value={item.text}
          onChange={(e) => onChange({ text: e.target.value })}
          onBlur={() => setIsEditing(false)}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Note..."
        />
      ) : (
        <div className="plan-note-text" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
          {item.text || <span style={{opacity: 0.5, fontStyle: "italic"}}>Click to edit</span>}
        </div>
      )}
      <div className="plan-card-resize" onMouseDown={onResizeStart} />
    </div>
  );
}


// Dashboard: list of multiple boards (same row style as registered items).
// Row = title + last updated + open + delete. Includes a new board button.
export function PlanBoardList({ onOpenBoard, onNewBoard }) {
  const [boards, setBoards] = React.useState(null);   // null = loading
  const refresh = React.useCallback(async () => {
    const list = await listBoardsFile();
    setBoards(Array.isArray(list) ? list : []);
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);
  async function handleDelete(b, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${b.name || "Untitled Board"}"? This cannot be undone.`)) return;
    await deleteBoardFile(b.id);
    refresh();
  }
  return (
    <div className="board-list">
      <div className="board-list-head">
        <div className="board-list-title">🎯 Planning Whiteboard</div>
        <button className="board-list-new" onClick={onNewBoard}>＋ New Board</button>
      </div>
      {boards === null ? (
        <div className="board-list-empty">Loading…</div>
      ) : boards.length === 0 ? (
        <div className="board-list-empty">No boards yet. Create one with "＋ New Board".</div>
      ) : (
        <div className="board-list-rows">
          {boards.map((b) => (
            <div key={b.id} className="board-row" onClick={() => onOpenBoard(b.id)}>
              <div className="board-row-main">
                <div className="board-row-name">{b.name || "Untitled Board"}</div>
                <div className="board-row-meta">Updated {fmtBoardDate(b.updatedAt)}{typeof b.nodeCount === "number" ? ` · ${b.nodeCount} nodes` : ""}</div>
              </div>
              <button className="board-row-open" title="Open" onClick={(e) => { e.stopPropagation(); onOpenBoard(b.id); }}>→</button>
              <button className="board-row-del" title="Delete" onClick={(e) => handleDelete(b, e)}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
