// Diagram geometry (sizing/shapes/edge paths). shapeElement returns SVG JSX.
// Phase 3 module — extracted from app.jsx.
import React from 'react'
// ══════════ DIAGRAM ══════════
export const NODE_W = 220;
export const NODE_H = 78;
export const DIAMOND_W = 170;
export const DIAMOND_H = 110;

export function nodeBounds(node) {
  if (node.type === "decision") return { x: node.x - DIAMOND_W / 2, y: node.y - DIAMOND_H / 2, w: DIAMOND_W, h: DIAMOND_H };
  return { x: node.x - NODE_W / 2, y: node.y - NODE_H / 2, w: NODE_W, h: NODE_H };
}

export function shapeMeta(type) {
  switch (type) {
    case "parent":   return { kind: "rect",  rx: 10, padL: 16 };
    case "code":     return { kind: "sharp", rx: 2,  padL: 14 };
    case "mcp":      return { kind: "pill",          padL: 26 };
    case "subagent": return { kind: "hex",  inset: 16, padL: 28 };
    case "hook":     return { kind: "para", skew: 14,  padL: 22 };
    case "user":     return { kind: "octa", chamfer: 16, padL: 22 };
    case "decision": return { kind: "diamond", padL: 0 };
    case "skill":    return { kind: "rect",  rx: 10, padL: 16 };
    case "command":  return { kind: "sharp", rx: 2,  padL: 14 };
    case "config":   return { kind: "rect",  rx: 9,  padL: 16 };
    case "api":      return { kind: "pill",          padL: 26 };
    case "plugin":   return { kind: "tab",  notch: 10, padL: 18 };
    case "agentsdk": return { kind: "trap", inset: 12, padL: 20 };
    default:         return { kind: "rect", rx: 9, padL: 16 };
  }
}

export function shapeElement(node, b, stroke, strokeWidth, extraClass = "") {
  const m = shapeMeta(node.type);
  const common = { className: `node-card ${extraClass}`, stroke, strokeWidth };
  if (m.kind === "rect" || m.kind === "sharp") return <rect {...common} x={b.x} y={b.y} width={b.w} height={b.h} rx={m.rx} />;
  if (m.kind === "pill") return <rect {...common} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.h / 2} />;
  if (m.kind === "hex") { const i = m.inset; const pts = [[b.x+i,b.y],[b.x+b.w-i,b.y],[b.x+b.w,b.y+b.h/2],[b.x+b.w-i,b.y+b.h],[b.x+i,b.y+b.h],[b.x,b.y+b.h/2]].map(p=>p.join(",")).join(" "); return <polygon {...common} points={pts} />; }
  if (m.kind === "para") { const s = m.skew; const pts = [[b.x+s,b.y],[b.x+b.w,b.y],[b.x+b.w-s,b.y+b.h],[b.x,b.y+b.h]].map(p=>p.join(",")).join(" "); return <polygon {...common} points={pts} />; }
  if (m.kind === "octa") { const c = m.chamfer; const pts = [[b.x+c,b.y],[b.x+b.w-c,b.y],[b.x+b.w,b.y+c],[b.x+b.w,b.y+b.h-c],[b.x+b.w-c,b.y+b.h],[b.x+c,b.y+b.h],[b.x,b.y+b.h-c],[b.x,b.y+c]].map(p=>p.join(",")).join(" "); return <polygon {...common} points={pts} />; }
  if (m.kind === "tab") { const n = m.notch; const pts = [[b.x,b.y+n],[b.x+n,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]].map(p=>p.join(",")).join(" "); return <polygon {...common} points={pts} />; }
  if (m.kind === "trap") { const i = m.inset; const pts = [[b.x+i,b.y],[b.x+b.w-i,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]].map(p=>p.join(",")).join(" "); return <polygon {...common} points={pts} />; }
  return null;
}

export function edgePath(from, to) {
  const fb = nodeBounds(from), tb = nodeBounds(to);
  const x1 = from.x, y1 = fb.y + fb.h, x2 = to.x, y2 = tb.y;
  const dy = y2 - y1, cy = Math.max(28, Math.abs(dy) * 0.45);
  return `M ${x1} ${y1} C ${x1} ${y1 + cy}, ${x2} ${y2 - cy}, ${x2} ${y2}`;
}

export function midpoint(from, to) {
  const fb = nodeBounds(from), tb = nodeBounds(to);
  return { x: (from.x + to.x) / 2, y: (fb.y + fb.h + tb.y) / 2 };
}
