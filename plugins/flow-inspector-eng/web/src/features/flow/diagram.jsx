// Flow diagram cluster (ParallelFrame, SubflowNode/Container, Node, StickyNote,
// FlowDiagram). Phase 3 module — extracted from app.jsx (logic unchanged).
// Reads window.NODE_TYPES (global, set by lib/node-types.js); publishes window.FlowDiagram.
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { NODE_W, NODE_H, nodeBounds, shapeMeta, shapeElement, edgePath, midpoint } from '../../lib/geometry.jsx'

export function ParallelFrame({ group, nodes }) {
  const inside = nodes.filter(n => group.nodes.includes(n.id));
  if (!inside.length) return null;
  const PAD_X = 56, PAD_TOP = 38, PAD_BOT = 22;
  const xs = inside.flatMap(n => { const b = nodeBounds(n); return [b.x, b.x + b.w]; });
  const ys = inside.flatMap(n => { const b = nodeBounds(n); return [b.y, b.y + b.h]; });
  const x = Math.min(...xs) - PAD_X, y = Math.min(...ys) - PAD_TOP;
  const w = Math.max(...xs) - Math.min(...xs) + PAD_X * 2;
  const h = Math.max(...ys) - Math.min(...ys) + PAD_TOP + PAD_BOT;
  return (
    <g className="parallel-frame">
      <rect x={x} y={y} width={w} height={h} rx="14" className="pf-rect" strokeDasharray="4 5" strokeWidth="1" />
      <g transform={`translate(${x + 14}, ${y + 18})`}>
        <rect x="-6" y="-12" width="86" height="22" rx="6" className="pf-chip" />
        <text x="0" y="3" className="parallel-label">PARALLEL</text>
      </g>
    </g>
  );
}

// ── Subflow layout constants ──
const SF_NODE_W = 150;
const SF_NODE_H = 56;
const SF_GAP_X = 180;
const SF_GAP_Y = 90;
const SF_PAD_X = 40;
const SF_PAD_TOP = 50;
const SF_PAD_BOT = 30;

export function subflowContainerSize(subflow) {
  if (!subflow || !subflow.nodes.length) return { w: 0, h: 0 };
  const maxX = Math.max(...subflow.nodes.map(n => n.x || 0));
  const maxY = Math.max(...subflow.nodes.map(n => n.y || 0));
  const w = (maxX + 1) * SF_GAP_X + SF_PAD_X * 2;
  const h = (maxY + 1) * SF_GAP_Y + SF_PAD_TOP + SF_PAD_BOT + SF_NODE_H;
  return { w: Math.max(w, NODE_W + SF_PAD_X * 2), h };
}

export function subflowNodePos(sfNode, containerX, containerY) {
  const gx = sfNode.x || 0;
  const gy = sfNode.y || 0;
  return {
    x: containerX + SF_PAD_X + gx * SF_GAP_X + SF_NODE_W / 2,
    y: containerY + SF_PAD_TOP + gy * SF_GAP_Y + SF_NODE_H / 2
  };
}

export function SubflowNode({ sfNode, cx, cy, parentColor, selected, onSelect }) {
  const t = window.NODE_TYPES[sfNode.type] || window.NODE_TYPES["code"];
  const x = cx - SF_NODE_W / 2;
  const y = cy - SF_NODE_H / 2;
  const isSelected = selected === sfNode.id;
  return (
    <g className={`subflow-node ${isSelected ? "is-selected" : ""}`} onClick={(e) => { e.stopPropagation(); onSelect(sfNode.id); }} style={{ cursor: "pointer" }}>
      <rect className="node-card" x={x} y={y} width={SF_NODE_W} height={SF_NODE_H} rx="7" stroke={isSelected ? t.color : "var(--node-bd)"} strokeWidth={isSelected ? 1.4 : 0.8} fill="var(--node-bg)" />
      <rect x={x} y={y} width="3" height={SF_NODE_H} rx="1.5" fill={t.color} />
      <g transform={`translate(${x + 12}, ${y + 12})`}>
        <rect x="0" y="0" width="7" height="7" rx="1.5" fill={t.color} fillOpacity="0.9" />
        <text x="12" y="6.5" className="node-type" style={{ fill: t.color, fontSize: "7px" }}>{t.label.toUpperCase()}</text>
      </g>
      <text x={x + 12} y={y + 32} className="node-title" style={{ fontSize: "10.5px" }}>{sfNode.title}</text>
      <text x={x + 12} y={y + 46} className="node-sub" style={{ fontSize: "8px" }}>{sfNode.subtitle || ""}</text>
    </g>
  );
}

export function SubflowContainer({ node, containerX, containerY, containerW, containerH, selected, onSelect, onToggle }) {
  const sf = node.subflow;
  const t = window.NODE_TYPES[node.type];
  const sfNodesPos = sf.nodes.map(sn => ({ ...sn, ...subflowNodePos(sn, containerX, containerY) }));
  const sfNodesById = {};
  sfNodesPos.forEach(sn => { sfNodesById[sn.id] = sn; });

  return (
    <g className="subflow-expanded">
      {/* Container background */}
      <rect className="subflow-container" x={containerX} y={containerY} width={containerW} height={containerH} />
      {/* Label + collapse toggle (inline, always visible at top-left) */}
      <g transform={`translate(${containerX + 10}, ${containerY + 6})`}>
        <rect x="0" y="0" width={Math.min(node.title.length * 9 + 60, 220)} height="22" rx="6" fill="var(--bg-2)" stroke={t.color} strokeWidth="0.8" strokeOpacity="0.5" />
        <rect x="6" y="5" width="7" height="7" rx="1.5" fill={t.color} fillOpacity="0.9" />
        <text x="20" y="15" className="subflow-label">{node.title}</text>
        <g className="expand-toggle" onClick={(e) => { e.stopPropagation(); onToggle(node.id); }} transform={`translate(${Math.min(node.title.length * 9 + 42, 202)}, 11)`}>
          <circle cx="0" cy="0" r="9" fill="var(--bg-2)" stroke={t.color} strokeWidth="0.8" strokeOpacity="0.5" />
          <text x="0" y="3.5" textAnchor="middle" style={{ fontSize: "13px", fill: t.color, fontWeight: "600" }}>−</text>
        </g>
      </g>
      {/* Internal edges */}
      {sf.edges.map((e, i) => {
        const fromN = sfNodesById[e.from], toN = sfNodesById[e.to];
        if (!fromN || !toN) return null;
        const x1 = fromN.x, y1 = fromN.y + SF_NODE_H / 2;
        const x2 = toN.x, y2 = toN.y - SF_NODE_H / 2;
        // If same column, simple vertical curve; else route with bezier
        const dy = y2 - y1;
        const cy = Math.max(16, Math.abs(dy) * 0.4);
        const d = `M ${x1} ${y1} C ${x1} ${y1 + cy}, ${x2} ${y2 - cy}, ${x2} ${y2}`;
        return <path key={i} className="subflow-edge" d={d} markerEnd="url(#ah-default)" />;
      })}
      {/* Internal nodes */}
      {sfNodesPos.map(sn => (
        <SubflowNode key={sn.id} sfNode={sn} cx={sn.x} cy={sn.y} parentColor={t.color} selected={selected} onSelect={onSelect} />
      ))}
    </g>
  );
}

export function Node({ node, selected, hovered, onSelect, onHover, isDraft, onRemoveDraft, isExpanded, onToggleExpand, extraClass }) {
  const t = window.NODE_TYPES[node.type] || window.NODE_TYPES["code"];
  const b = nodeBounds(node);
  const m = shapeMeta(node.type);
  const isDecision = node.type === "decision";
  const isSelected = selected === node.id;
  const isHover = hovered === node.id;
  const hasSubflow = !!node.subflow;
  const strokeColor = isExpanded ? t.color : (isSelected ? t.color : (isHover ? "var(--node-bd-hover)" : "var(--node-bd)"));
  const strokeW = isExpanded ? 1.8 : (isSelected ? 1.6 : 1);
  const ec = extraClass || "";

  // If expanded and using inline expand (skill flow), don't render
  if (hasSubflow && isExpanded && !extraClass) return null;

  if (isDecision) {
    const cx = node.x, cy = node.y;
    const pts = [[cx, b.y],[b.x + b.w, cy],[cx, b.y + b.h],[b.x, cy]].map(p => p.join(",")).join(" ");
    return (
      <g className={`${ec} node node-decision ${isSelected ? "is-selected" : ""}`} data-node-id={node.id} onMouseEnter={() => onHover(node.id)} onMouseLeave={() => onHover(null)} onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
        <polygon points={pts} className="diamond-bg" stroke={strokeColor} strokeWidth={isSelected ? 2 : 1.2} />
        <text x={cx} y={cy - 4} className="node-title" textAnchor="middle">{node.title}</text>
        <text x={cx} y={cy + 14} className="node-sub" textAnchor="middle">{node.subtitle || "Decision"}</text>
      </g>
    );
  }

  const accentBar = (() => {
    if (m.kind === "pill") return <circle cx={b.x + 14} cy={node.y} r="5" fill={t.color} />;
    if (m.kind === "para") { const s = m.skew; const pts = [[b.x+s,b.y],[b.x+s+4,b.y],[b.x+4,b.y+b.h],[b.x,b.y+b.h]].map(p=>p.join(",")).join(" "); return <polygon points={pts} fill={t.color} />; }
    if (m.kind === "hex") { const pts = [[b.x+4,b.y+b.h/2-6],[b.x+12,b.y+b.h/2],[b.x+4,b.y+b.h/2+6],[b.x-2,b.y+b.h/2]].map(p=>p.join(",")).join(" "); return <polygon points={pts} fill={t.color} />; }
    if (m.kind === "octa") return <rect x={b.x} y={b.y + 14} width="4" height={b.h - 28} rx="2" fill={t.color} />;
    if (m.kind === "sharp") return <text x={b.x + 8} y={b.y + b.h / 2 + 4} className="sharp-prompt" style={{ fill: t.color }}>{"$_"}</text>;
    if (m.kind === "tab") { const n = m.notch; return <polygon points={[[b.x,b.y+n],[b.x+4,b.y+n],[b.x+4,b.y+b.h],[b.x,b.y+b.h]].map(p=>p.join(",")).join(" ")} fill={t.color} />; }
    if (m.kind === "trap") { const i = m.inset; return <polygon points={[[b.x+i,b.y],[b.x+i+4,b.y],[b.x+4,b.y+b.h],[b.x,b.y+b.h]].map(p=>p.join(",")).join(" ")} fill={t.color} />; }
    return <rect x={b.x} y={b.y} width="4" height={b.h} rx="2" fill={t.color} />;
  })();

  const textPad = m.kind === "sharp" ? 34 : m.padL;

  return (
    <g className={`${ec} node node-${node.type} ${isSelected ? "is-selected" : ""} ${isHover ? "is-hover" : ""} ${isDraft ? "is-draft" : ""} ${hasSubflow ? "has-subflow" : ""}`} data-node-id={node.id} onMouseEnter={() => onHover(node.id)} onMouseLeave={() => onHover(null)} onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
      {isSelected && shapeElement(node, { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 }, t.color, 1.5, "node-halo")}
      {shapeElement(node, b, strokeColor, strokeW)}
      {accentBar}
      <g transform={`translate(${b.x + textPad}, ${b.y + 16})`}>
        <rect x="0" y="0" width="9" height="9" rx="2" fill={t.color} fillOpacity="0.9" />
        <text x="16" y="8" className="node-type" style={{ fill: t.color }}>{isDraft ? "DRAFT" : t.label.toUpperCase()}</text>
        {node.subtype && (() => {
          // Trigger origin emojis (Phase 2: ⏰ cron / 🐙 github-actions)
          const subtypeEmoji = { systemd: "🛡️ ", cron: "⏰ ", "github-actions": "🐙 " }[node.subtype] || "";
          const label = subtypeEmoji + node.subtype;
          return (
            <g transform="translate(0, 0)">
              <rect x={t.label.length * 6.5 + 20} y="-3" width={label.length * 5.5 + 12} height="14" rx="3"
                    fill={t.bg} stroke={t.color} strokeWidth="0.5" opacity="0.9" />
              <text x={t.label.length * 6.5 + 26} y="7.5" fontSize="8" fontFamily="Geist Mono" fill={t.color}>{label}</text>
            </g>
          );
        })()}
      </g>
      <text x={b.x + textPad} y={b.y + 42} className="node-title">{node.title}</text>
      <text x={b.x + textPad} y={b.y + 62} className="node-sub">{node.subtitle}</text>
      {hasSubflow && (
        <g className="expand-toggle" onClick={(ev) => { ev.stopPropagation(); onToggleExpand(node.id); }} transform={`translate(${b.x + b.w - 14}, ${b.y + b.h - 14})`}>
          <circle cx="0" cy="0" r="10" />
          <text x="0" y="4" textAnchor="middle">{isExpanded ? "−" : "+"}</text>
        </g>
      )}
      {node.meta && node.meta.node_count && !hasSubflow && (
        <text x={b.x + b.w - 10} y={b.y + 16} textAnchor="end" fontSize="9" fill="var(--tx-4)" fontFamily="Geist Mono">{node.meta.node_count}N</text>
      )}
      {isDraft && onRemoveDraft && (
        <g className="draft-remove" style={{ cursor: "pointer" }} onClick={(ev) => { ev.stopPropagation(); onRemoveDraft(node.id); }}>
          <circle cx={b.x + b.w - 6} cy={b.y + 6} r="8" fill="var(--c-hook)" fillOpacity="0.9" />
          <text x={b.x + b.w - 6} y={b.y + 10} textAnchor="middle" fill="white" fontSize="11" fontWeight="600">×</text>
        </g>
      )}
    </g>
  );
}

// Sticky note component.
// Embeds HTML inside an SVG <foreignObject> to enable drag-to-move + text editing.
export function StickyNote({ note, isEditing, onStartEdit, onStopEdit, onChange, onRemove, viewK }) {
  const COLORS = {
    yellow: { bg: "#fff8c2", border: "#e8d76a", text: "#5b4d00" },
    pink:   { bg: "#ffd6e3", border: "#e8a3bb", text: "#5b1530" },
    blue:   { bg: "#d0e7ff", border: "#7fb3e5", text: "#0a3d6b" },
    green:  { bg: "#d6f5d6", border: "#7fc97f", text: "#0d4a18" },
  };
  const c = COLORS[note.color] || COLORS.yellow;
  const [isDragging, setIsDragging] = React.useState(false);
  const [isResizing, setIsResizing] = React.useState(false);

  // Drag to move (updates in canvas coordinates)
  function onDragStart(e) {
    if (isEditing) return;
    if (e.target.closest(".sticky-action") || e.target.closest(".sticky-resize")
        || e.target.closest(".sticky-text") || e.target.closest(".sticky-textarea")) return;
    e.stopPropagation(); e.preventDefault();
    setIsDragging(true);
    // Control text selection + cursor across the whole body
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    const startX = e.clientX, startY = e.clientY;
    const baseX = note.x, baseY = note.y;
    const onMove = (mv) => {
      const dx = (mv.clientX - startX) / viewK;
      const dy = (mv.clientY - startY) / viewK;
      onChange({ x: baseX + dx, y: baseY + dy });
    };
    const onUp = () => {
      setIsDragging(false);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onResizeStart(e) {
    if (isEditing) return;
    e.stopPropagation(); e.preventDefault();
    setIsResizing(true);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
    const startX = e.clientX, startY = e.clientY;
    const baseW = note.w, baseH = note.h;
    const onMove = (mv) => {
      const dw = (mv.clientX - startX) / viewK;
      const dh = (mv.clientY - startY) / viewK;
      onChange({
        w: Math.max(100, baseW + dw),
        h: Math.max(60, baseH + dh)
      });
    };
    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <foreignObject x={note.x} y={note.y} width={note.w} height={note.h} className="sticky-note-fo">
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className={`sticky-note ${isEditing ? "is-editing" : ""} ${isDragging ? "is-dragging" : ""} ${isResizing ? "is-resizing" : ""}`}
        style={{ background: c.bg, borderColor: c.border, color: c.text, width: "100%", height: "100%" }}
        onMouseDown={onDragStart}
        onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(); }}
      >
        <div className="sticky-actions" onMouseDown={(e) => e.stopPropagation()}>
          {Object.keys(COLORS).map(col => (
            <button key={col}
              type="button"
              className={`sticky-action sticky-color ${note.color === col ? "is-on" : ""}`}
              style={{ background: COLORS[col].bg, borderColor: COLORS[col].border }}
              onClick={(e) => { e.stopPropagation(); onChange({ color: col }); }}
              title={`Color: ${col}`}
            />
          ))}
          <button type="button" className="sticky-action sticky-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Delete">×</button>
        </div>
        {/* Drag handle bar at the top (drag-only area) */}
        <div className="sticky-drag-handle" title="Drag to move" />
        {isEditing ? (
          <textarea
            autoFocus
            className="sticky-textarea"
            style={{ color: c.text }}
            value={note.text}
            onChange={(e) => onChange({ text: e.target.value })}
            onBlur={onStopEdit}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Enter a note..."
          />
        ) : (
          <div className="sticky-text" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onStartEdit(); }}>
            {note.text || <span className="sticky-placeholder">Click to edit</span>}
          </div>
        )}
        {/* Resize handle (bottom-right) */}
        <div className="sticky-resize" onMouseDown={onResizeStart} title="Drag to resize" />
      </div>
    </foreignObject>
  );
}

export function FlowDiagram({ workflow, selected, onSelect, onAddDraft, onRemoveDraft, drafts = [], onAIDesign, autoFit }) {
  const [view, setView] = React.useState({ x: 60, y: 30, k: 0.85 });
  const [hovered, setHovered] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const [picker, setPicker] = React.useState(null); // { x, y, afterNode, beforeNode }
  const [expanded, setExpanded] = React.useState(new Set()); // expanded subflow node IDs
  const dragRef = React.useRef(null);
  const svgRef = React.useRef(null);

  // ── Sticky note feature ──
  // Persisted to localStorage per workflow.id
  const notesKey = `fi_notes_${workflow.id || "default"}`;
  const [notes, setNotes] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(notesKey) || "[]"); }
    catch { return []; }
  });
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(notesKey) || "[]");
      setNotes(saved);
    } catch { setNotes([]); }
  }, [workflow.id]);
  React.useEffect(() => {
    try { localStorage.setItem(notesKey, JSON.stringify(notes)); } catch {}
  }, [notes, notesKey]);

  const [editingNoteId, setEditingNoteId] = React.useState(null);
  const noteCounter = React.useRef(0);

  // Center of the screen in SVG canvas coordinates (initial position for a new note)
  function getCanvasCenter() {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const cx = (rect.width / 2 - view.x) / view.k;
    const cy = (rect.height / 2 - view.y) / view.k;
    return { x: cx, y: cy };
  }

  function addNote() {
    const c = getCanvasCenter();
    const id = `note_${Date.now()}_${noteCounter.current++}`;
    const next = {
      id,
      x: c.x - 90, y: c.y - 60, w: 180, h: 120,
      text: "",
      color: "yellow", // yellow / pink / blue / green
    };
    setNotes(prev => [...prev, next]);
    setEditingNoteId(id);
  }
  function updateNote(id, patch) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
  }
  function removeNote(id) {
    setNotes(prev => prev.filter(n => n.id !== id));
    if (editingNoteId === id) setEditingNoteId(null);
  }

  function toggleExpand(nodeId) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  // Merge real nodes with draft nodes for rendering
  const allNodes = React.useMemo(() => [...workflow.nodes, ...drafts], [workflow.nodes, drafts]);
  const allEdges = React.useMemo(() => {
    if (drafts.length === 0) return workflow.edges;
    let edges = [...workflow.edges];
    drafts.forEach(d => {
      if (d._afterNode && d._beforeNode) {
        edges = edges.filter(e => !(e.from === d._afterNode && e.to === d._beforeNode));
        edges.push({ from: d._afterNode, to: d.id });
        edges.push({ from: d.id, to: d._beforeNode });
      }
    });
    return edges;
  }, [workflow.edges, drafts]);

  // autoFit: set the initial view so the whole flow fits the container (for small regions like the Eval comparison pane).
  React.useEffect(() => {
    if (!autoFit) return;
    let raf;
    const doFit = () => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) { raf = requestAnimationFrame(doFit); return; }
      const ns = workflow.nodes || [];
      if (!ns.length) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      ns.forEach(n => {
        const b = nodeBounds(n);
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
      });
      if (!isFinite(minX)) return;
      const pad = 40;
      const bw = (maxX - minX) + pad * 2, bh = (maxY - minY) + pad * 2;
      const k = Math.max(0.25, Math.min(1.0, Math.min(rect.width / bw, rect.height / bh)));
      const x = (rect.width - (maxX - minX) * k) / 2 - minX * k;
      const y = (rect.height - (maxY - minY) * k) / 2 - minY * k;
      setView({ x, y, k });
    };
    raf = requestAnimationFrame(doFit);
    return () => cancelAnimationFrame(raf);
  }, [autoFit, workflow]);

  // Calculate Y offsets for expanded subflows AND draft node spacing
  const yOffsets = React.useMemo(() => {
    const offsets = {};
    const sorted = [...allNodes].sort((a, b) => a.y - b.y);
    sorted.forEach(n => { offsets[n.id] = 0; });

    // For each expanded node, push down everything below it
    sorted.forEach(expandedNode => {
      if (!expanded.has(expandedNode.id) || !expandedNode.subflow) return;
      const sfSize = subflowContainerSize(expandedNode.subflow);
      const extraH = sfSize.h - NODE_H;
      sorted.forEach(n => {
        if (n.y > expandedNode.y) {
          offsets[n.id] = (offsets[n.id] || 0) + extraH;
        }
      });
    });

    // For each draft node, ensure minimum spacing by pushing down nodes at or below the draft
    const MIN_GAP = NODE_H + 30; // minimum vertical gap between nodes
    const draftNodes = allNodes.filter(n => n._isDraft);
    draftNodes.forEach(draft => {
      const draftY = draft.y + (offsets[draft.id] || 0);
      sorted.forEach(n => {
        if (n.id === draft.id || n._isDraft) return;
        const nY = n.y + (offsets[n.id] || 0);
        // If this node is at or below the draft and too close, push it down
        if (nY >= draftY - 10 && nY < draftY + MIN_GAP) {
          offsets[n.id] = (offsets[n.id] || 0) + (draftY + MIN_GAP - nY);
        } else if (nY >= draftY + MIN_GAP) {
          // Also push down nodes further below by the same amount as the closest pushed node
          const beforeNodeY = draft._beforeNode ? (allNodes.find(bn => bn.id === draft._beforeNode)?.y || 0) : 0;
          if (beforeNodeY > 0 && n.y >= beforeNodeY) {
            offsets[n.id] = (offsets[n.id] || 0) + MIN_GAP;
          }
        }
      });
    });

    return offsets;
  }, [allNodes, expanded, drafts]);

  // Build positioned nodes with y offsets applied
  // Bridge inner_flow → subflow so parent nodes (from automation flowizer)
  // automatically pick up the existing subflow rendering / expand machinery.
  const positionedNodes = React.useMemo(() => {
    return allNodes.map(n => ({
      ...n,
      _origY: n.y,
      y: n.y + (yOffsets[n.id] || 0),
      subflow: n.subflow || (n.inner_flow && n.inner_flow.nodes ? n.inner_flow : undefined)
    }));
  }, [allNodes, yOffsets]);

  const nodesById = React.useMemo(() => { const m = {}; positionedNodes.forEach(n => { m[n.id] = n; }); return m; }, [positionedNodes]);

  function onWheel(e) {
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta = -e.deltaY * 0.0015;
    const newK = Math.max(0.35, Math.min(2.0, view.k * (1 + delta)));
    const dx = (mx - view.x) * (newK / view.k - 1), dy = (my - view.y) * (newK / view.k - 1);
    setView({ x: view.x - dx, y: view.y - dy, k: newK });
  }

  function onMouseDown(e) { if (e.target.closest(".node")) return; setDragging(true); dragRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; }
  function onMouseMove(e) { if (!dragging) return; const d = dragRef.current; setView(v => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) })); }
  function onMouseUp() { setDragging(false); }

  function zoomBy(factor) { const rect = svgRef.current.getBoundingClientRect(); const mx = rect.width / 2, my = rect.height / 2; const newK = Math.max(0.35, Math.min(2.0, view.k * factor)); const dx = (mx - view.x) * (newK / view.k - 1), dy = (my - view.y) * (newK / view.k - 1); setView({ x: view.x - dx, y: view.y - dy, k: newK }); }
  function fit() { setView({ x: 60, y: 30, k: 0.78 }); }

  const hoveredNode = hovered ? nodesById[hovered] : null;

  return (
    <div className="diagram-wrap">
      <svg ref={svgRef} className={`diagram ${dragging ? "is-dragging" : ""}`} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onClick={() => onSelect(null)}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-flow-element")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
        onDrop={(e) => {
          e.preventDefault();
          const data = e.dataTransfer.getData("application/x-flow-element");
          if (!data || !onAddDraft) return;
          try {
            const item = JSON.parse(data);
            const svgRect = svgRef.current.getBoundingClientRect();
            const dropX = (e.clientX - svgRect.left - view.x) / view.k;
            const dropY = (e.clientY - svgRect.top - view.y) / view.k;
            let closestEdge = null, minDist = Infinity;
            for (const edge of allEdges) {
              const from = nodesById[edge.from], to = nodesById[edge.to];
              if (!from || !to) continue;
              if (from._isDraft || to._isDraft) continue;
              const mid = midpoint(from, to);
              const d = Math.hypot(mid.x - dropX, mid.y - dropY);
              if (d < minDist) { minDist = d; closestEdge = edge; }
            }
            if (closestEdge) onAddDraft(item.type, closestEdge.from, closestEdge.to, item);
          } catch (err) { console.warn("Drop parse error", err); }
        }}>
        <defs>
          {Object.entries(window.NODE_TYPES).map(([k, t]) => (
            <marker key={k} id={`ah-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill={t.color} fillOpacity="0.9" />
            </marker>
          ))}
          <marker id="ah-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="ah-default-fill" />
          </marker>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" className="grid-line" strokeWidth="1" />
          </pattern>
          <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
            <stop offset="60%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" className="vignette-stop" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <rect width="100%" height="100%" fill="url(#vignette)" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {workflow.parallels.map(p => <ParallelFrame key={p.id} group={p} nodes={positionedNodes} />)}
          {allEdges.map((e, i) => {
            const from = nodesById[e.from], to = nodesById[e.to];
            if (!from || !to) return null;
            const d = edgePath(from, to), color = window.NODE_TYPES[to.type]?.color || "var(--edge)", mid = midpoint(from, to);
            const isSel = selected === e.from || selected === e.to;
            const isDraftEdge = from._isDraft || to._isDraft;
            // For expanded nodes, adjust edge endpoints to container boundary
            const fromExpanded = expanded.has(e.from) && from.subflow;
            const toExpanded = expanded.has(e.to) && to.subflow;
            let actualD = d;
            if (fromExpanded || toExpanded) {
              const fb = fromExpanded ? (() => { const sz = subflowContainerSize(from.subflow); const cx = from.x - sz.w / 2; const cy = from.y - NODE_H / 2; return { x: cx, y: cy, w: sz.w, h: sz.h }; })() : nodeBounds(from);
              const tb = toExpanded ? (() => { const sz = subflowContainerSize(to.subflow); const cx = to.x - sz.w / 2; const cy = to.y - NODE_H / 2; return { x: cx, y: cy, w: sz.w, h: sz.h }; })() : nodeBounds(to);
              const x1 = from.x, y1 = fb.y + fb.h, x2 = to.x, y2 = tb.y;
              const dy = y2 - y1, cy2 = Math.max(28, Math.abs(dy) * 0.45);
              actualD = `M ${x1} ${y1} C ${x1} ${y1 + cy2}, ${x2} ${y2 - cy2}, ${x2} ${y2}`;
            }
            return (
              <g key={i} className="edge">
                <path d={actualD} fill="none" stroke={isSel ? color : "var(--edge)"} strokeOpacity={isDraftEdge ? 0.4 : (isSel ? 0.95 : 0.85)} strokeWidth={isSel ? 2 : 1.3} strokeDasharray={isDraftEdge ? "6 4" : "none"} markerEnd={`url(#ah-${to.type})`} />
                {!isDraftEdge && <path d={actualD} fill="none" stroke={color} strokeOpacity="0.95" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="1.6 11" className="edge-flow" />}
                {e.label && (
                  <g transform={`translate(${mid.x}, ${mid.y})`}>
                    <rect x="-18" y="-11" width="36" height="22" rx="11" className="edge-chip" />
                    <text x="0" y="4" className="edge-label" textAnchor="middle">{e.label}</text>
                  </g>
                )}
                {!isDraftEdge && !e.label && onAddDraft && (
                  <g className="edge-add-btn" transform={`translate(${mid.x}, ${mid.y})`} onClick={(ev) => { ev.stopPropagation(); const rect = svgRef.current.getBoundingClientRect(); setPicker({ x: mid.x * view.k + view.x + rect.left + 22, y: mid.y * view.k + view.y + rect.top - 18, afterNode: e.from, beforeNode: e.to }); }}>
                    <circle r="11" className="edge-add-circle" fill="var(--bg-2)" stroke="var(--accent)" strokeWidth="1.5" />
                    <text y="4.5" textAnchor="middle" className="edge-add-plus" fill="var(--accent)" fontSize="15" fontWeight="400">+</text>
                  </g>
                )}
              </g>
            );
          })}
          {/* Sticky notes (rendered behind the nodes) */}
          {notes.map(n => (
            <StickyNote
              key={n.id}
              note={n}
              isEditing={editingNoteId === n.id}
              onStartEdit={() => setEditingNoteId(n.id)}
              onStopEdit={() => setEditingNoteId(null)}
              onChange={(patch) => updateNote(n.id, patch)}
              onRemove={() => removeNote(n.id)}
              viewK={view.k}
            />
          ))}
          {/* Render expanded subflow containers */}
          {positionedNodes.filter(n => expanded.has(n.id) && n.subflow).map(n => {
            const sfSize = subflowContainerSize(n.subflow);
            const cx = n.x - sfSize.w / 2;
            const cy = n.y - NODE_H / 2;
            return <SubflowContainer key={`sf-${n.id}`} node={n} containerX={cx} containerY={cy} containerW={sfSize.w} containerH={sfSize.h} selected={selected} onSelect={onSelect} onToggle={toggleExpand} />;
          })}
          {positionedNodes.map(n => <Node key={n.id} node={n} selected={selected} hovered={hovered} onSelect={onSelect} onHover={setHovered} isDraft={n._isDraft} onRemoveDraft={onRemoveDraft} isExpanded={expanded.has(n.id)} onToggleExpand={toggleExpand} />)}
        </g>
      </svg>
      {/* "+ Add note" button (pinned to the bottom-right of the canvas) */}
      <button
        type="button"
        className="add-note-btn"
        onClick={addNote}
        title="Add a sticky note"
      >
        <span className="add-note-icon">📝</span>
        <span className="add-note-label">Note</span>
      </button>
      {hoveredNode && hovered !== selected && !expanded.has(hovered) && (() => {
        const b = nodeBounds(hoveredNode);
        const sx = b.x * view.k + view.x + (b.w * view.k) + 14, sy = b.y * view.k + view.y;
        const t = window.NODE_TYPES[hoveredNode.type];
        return (
          <div className="tooltip" style={{ left: sx, top: sy }}>
            <div className="tt-row"><span className="tt-dot" style={{ background: t.color }} /><span className="tt-type">{t.label}</span></div>
            <div className="tt-title">{hoveredNode.title}</div>
            <div className="tt-desc">{hoveredNode.desc.slice(0, 110)}…</div>
            <div className="tt-foot"><span>⏱ {hoveredNode.duration}</span><span>← {hoveredNode.depends.length} deps</span></div>
          </div>
        );
      })()}
      {picker && (
        <>
          {/* The overlay would block dragging, so it's omitted. Close explicitly via the ✕ button. */}
          <div className="node-picker" style={{ left: picker.x, top: picker.y }}>
            <div className="node-picker-header"
              onMouseDown={(ev) => {
                // Drag the title bar (anywhere except ×) to move the panel
                if (ev.target.closest('.node-picker-close')) return;
                const startX = ev.clientX, startY = ev.clientY;
                const baseX = picker.x, baseY = picker.y;
                const onMove = (mv) => {
                  setPicker(p => p ? { ...p, x: baseX + (mv.clientX - startX), y: baseY + (mv.clientY - startY) } : p);
                };
                const onUp = () => {
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                  document.body.style.userSelect = "";
                };
                document.body.style.userSelect = "none";
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }}
            >
              <span className="node-picker-grip" title="Drag to move">⋮⋮</span>
              <span className="node-picker-title">✨ Ask AI</span>
              <button type="button" className="node-picker-close" onClick={() => setPicker(null)} title="Close">×</button>
            </div>
            <div className="np-ai-wrap">
              <div className="np-ai-input">
                <textarea
                  autoFocus
                  rows={2}
                  placeholder="Describe what you want to do…&#10;e.g. Skip the step on Sundays"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const text = e.target.value.trim();
                      if (text && onAIDesign) {
                        onAIDesign(text, picker.afterNode, picker.beforeNode);
                        setPicker(null);
                      }
                    }
                  }}
                  id="np-ai-textarea"
                />
                <button className="np-ai-send" onClick={() => {
                  const ta = document.getElementById("np-ai-textarea");
                  const text = ta?.value?.trim();
                  if (text && onAIDesign) {
                    onAIDesign(text, picker.afterNode, picker.beforeNode);
                    setPicker(null);
                  }
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="np-divider"><span>Or pick manually</span></div>
            <NodePickerList
              onPick={(item) => {
                if (onAddDraft) onAddDraft(item.type, picker.afterNode, picker.beforeNode, item);
                setPicker(null);
              }}
            />
          </div>
        </>
      )}
      <div className="canvas-toolbar">
        <div className="ct-group">
          <button onClick={() => zoomBy(1.2)} title="Zoom in">＋</button>
          <button onClick={() => zoomBy(1/1.2)} title="Zoom out">−</button>
          <button onClick={fit} title="Fit">⊑</button>
        </div>
        <div className="ct-zoom">{Math.round(view.k * 100)}%</div>
      </div>
      <div className="canvas-help">
        <span>Scroll to zoom</span><span className="dot" /><span>Drag to pan</span><span className="dot" /><span>Click a node for details</span>
      </div>
    </div>
  );
}

window.FlowDiagram = FlowDiagram;
