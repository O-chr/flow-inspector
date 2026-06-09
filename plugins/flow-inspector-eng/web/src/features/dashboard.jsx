// Dashboard config-stack panels (Dash*, ClaudeStack, layer boxes). Phase 3 module.
// Reads window.DASH_*/CONFIG_STACK/LAYERS globals (set by App). Extracted verbatim.
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { API, apiFetch, apiPost, apiPut } from '../lib/api.js'
import { useFlowizeJobs, startFlowize } from '../lib/flowize.js'

const LAYER_CLASS = {
  "built-in":     "is-builtin",
  "managed":      "is-managed",
  "user":         "is-user",
  "user-project": "is-userproject",
  "project":      "is-project",
  "local":        "is-local",
};

export function LayerPill({ layer }) {
  const L = window.LAYERS[layer];
  return <span className={`layer-pill ${LAYER_CLASS[layer]}`}>{L?.label ?? layer}</span>;
}

export function DashHeader({ activeProject, onPickProject, stats, onOpenFlow, notifSignal }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  const [notif, setNotif] = React.useState({ count_unread: 0, items: [] });
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [deploying, setDeploying] = React.useState(false);
  const loadNotif = React.useCallback(() => {
    apiFetch("/api/notifications").then(setNotif).catch(() => {});
  }, []);
  React.useEffect(() => { loadNotif(); }, [loadNotif]);
  // Refresh the bell immediately on a flow-ize job completion signal (also picks up completions from other pages)
  React.useEffect(() => { if (notifSignal) loadNotif(); }, [notifSignal, loadNotif]);
  const doDeploy = React.useCallback(async () => {
    setDeploying(true);
    try {
      const res = await fetch(API + "/api/workspace/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const r = await res.json();
      const np = (r.pushed || []).length, failed = (r.failed || []), ns = (r.skipped || []).length;
      if (np === 0 && failed.length === 0 && ns === 0) {
        window.alert("Nothing to sync (no staged changes).");
      } else if (failed.length) {
        window.alert(`Applied: ${np} / Skipped: ${ns}\n⚠️ Failed: ${failed.length}\n`
          + failed.slice(0, 5).map(f => "- " + (f.path || "") + ": " + (f.message || "")).join("\n"));
      } else {
        window.alert(`✅ Applied: ${np} / Skipped: ${ns}`);
      }
      loadNotif();
    } catch (e) {
      window.alert("Apply failed: " + ((e && e.message) || e));
    } finally { setDeploying(false); }
  }, [loadNotif]);

  // Count of un-flow-ized skills (deterministic, zero tokens). Used for the button label.
  const [annoCount, setAnnoCount] = React.useState(0);
  const [annotating, setAnnotating] = React.useState(false);
  const loadAnnoCount = React.useCallback(() => {
    apiFetch("/api/workspace/annotate-candidates").then(d => setAnnoCount(d.count || 0)).catch(() => {});
  }, []);
  React.useEffect(() => { loadAnnoCount(); }, [loadAnnoCount]);
  const doAnnotate = React.useCallback(async () => {
    if (annoCount < 1) return;
    if (!window.confirm(`There are ${annoCount} un-flow-ized skills.\nThis will flow-ize all of them (calling the AI about ${annoCount} times, which takes time and tokens).\n\nTo pick just a few, ask in chat: "Flow-ize the X-related skills."\n\nFlow-ize all of them?`)) return;
    setAnnotating(true);
    try {
      const r = await apiPost("/api/workspace/annotate-all", {});
      const na = (r.annotated || []).length, nf = (r.failed || []).length;
      window.alert(`Flow-ize: ${na} done / ${nf} failed\n(Results were saved to the working copy. Use "Sync & Apply" to push them to production.)`);
      loadAnnoCount();
      loadNotif();
    } catch (e) {
      window.alert("Flow-ize failed: " + ((e && e.message) || e));
    } finally { setAnnotating(false); }
  }, [annoCount, loadAnnoCount, loadNotif]);

  return (
    <header className="dash-header">
      <div className="dh-grid">
        <div className="dh-brand">
          <div className="dh-mark"></div>
          <div className="dh-title-block">
            <div className="dh-name">
              Flow Inspector
              <span className="dh-name-tail">
                <span style={{width:6,height:6,borderRadius:"50%",background:"var(--L-project)",boxShadow:"0 0 6px rgba(21,128,61,0.4)"}}></span>
                v0.4 &middot; System Overview
              </span>
            </div>
            <div className="dh-sub">Claude Code config &middot; Layers &middot; Skills &middot; MCP &middot; Hooks</div>
          </div>
        </div>
        <div className="dh-right" ref={wrap} style={{position:"relative"}}>
          <button className={`proj-select ${open ? "is-open" : ""}`} onClick={() => setOpen(v => !v)}>
            <div className="ps-bar"></div>
            <div className="ps-text">
              <div className="ps-k">PROJECT</div>
              <div className="ps-v">{activeProject ? activeProject.name : "None selected"}</div>
              <div className="ps-path">{activeProject ? `${activeProject.path} · #${activeProject.hash}` : "Select a project"}</div>
            </div>
            <span className="ps-caret">&#9662;</span>
          </button>
          {open && (
            <div className="proj-menu">
              {window.DASH_PROJECTS.map(p => (
                <div key={p.id} className={`proj-menu-item ${activeProject && p.id === activeProject.id ? "is-current" : ""}`}
                     onClick={() => { onPickProject(p); setOpen(false); }}>
                  <div className="pmi-bar" style={{background: activeProject && p.id === activeProject.id ? "var(--L-project)" : "var(--bd-2)"}}></div>
                  <div style={{flex:1, minWidth:0}}>
                    <div className="pmi-name">{p.name}</div>
                    <div className="pmi-path">{p.path}{!p.has_claude_md && <span style={{marginLeft:6,fontSize:10,color:"var(--tx-4)"}}>· no CLAUDE.md</span>}</div>
                  </div>
                  <div className="pmi-hash">#{p.hash}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="qstats">
        <div className="qstat"><span className="qstat-dot" style={{background:"var(--L-user)"}}></span><b>{stats.layers}</b><span>layers active</span></div>
        <div className="qstat-sep"></div>
        <div className="qstat"><b>{stats.skills}</b><span>skills</span></div>
        <div className="qstat-sep"></div>
        <div className="qstat"><b>{stats.agents}</b><span>subagents</span></div>
        <div className="qstat-sep"></div>
        <div className="qstat"><b>{stats.mcpActive}/{stats.mcp}</b><span>MCP servers</span></div>
        <div className="qstat-sep"></div>
        <div className="qstat"><b>{stats.hooks}</b><span>hooks</span></div>
        <div className="qstat-sep"></div>
        <div className="qstat"><b>{stats.cmds}</b><span>commands</span></div>
        <div className="qstat-sep"></div>
        <div className="qstat"><span className="qstat-dot" style={{background:"var(--L-project)"}}></span><span style={{color:"var(--tx-2)"}}>API: <b>{location.host}</b></span></div>
        <div className="qstat-sep"></div>
        {annoCount > 0 && (
          <button className="plan-btn" onClick={doAnnotate} disabled={annotating}
                  title={`Flow-ize ${annoCount} un-flow-ized skills with AI (calls sonnet about ${annoCount} times)`}>
            {annotating ? "⏳ Flow-izing…" : `▶ Flow-ize (${annoCount})`}
          </button>
        )}
        <button className="plan-btn plan-btn-deploy" onClick={doDeploy} disabled={deploying}
                title="Detect changes, verify with claude -p, then apply to the live ~/.claude">
          {deploying ? "⏳ Applying…" : "⇡ Sync & Apply"}
        </button>
        <div style={{ position: "relative", display: "inline-block" }}>
          <button className="notif-bell" onClick={() => { setNotifOpen(o => !o); loadNotif(); }}
                  title="Notifications">
            🔔{notif.count_unread > 0 && <span className="notif-badge">{notif.count_unread}</span>}
          </button>
          {notifOpen && (
            <div className="notif-panel">
              <div className="notif-panel-head">
                <span>Notifications</span>
                <button onClick={() => apiPost("/api/notifications/read-all", {}).then(loadNotif)}>Mark all read</button>
              </div>
              {notif.items.length === 0 && <div className="notif-empty">No notifications</div>}
              {notif.items.map(n => (
                <div key={n.id} className={`notif-item notif-${n.status} ${n.read ? "is-read" : ""}`}
                     onClick={() => {
                       apiPost(`/api/notifications/${n.id}/read`, {}).then(loadNotif);
                       if (n.flowId && onOpenFlow) { setNotifOpen(false); onOpenFlow(n.flowId); }
                     }}>
                  <div className="notif-item-top">
                    <b>{n.status === "success" ? "✓" : n.status === "error" ? "⚠️" : "—"} {n.name || n.path}</b>
                    <span className="notif-ts">{n.ts}</span>
                  </div>
                  <div className="notif-detail">{n.detail}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function LayerLegend() {
  const order = ["built-in","managed","user","user-project","project","local"];
  return (
    <div className="layer-legend">
      <div className="legend-pair"><span className="lk">Layers</span></div>
      {order.map(k => {
        const L = window.LAYERS[k];
        return (
          <div className="legend-pair" key={k}>
            <span className="legend-bar" style={{background: L.color}}></span>
            <span style={{fontFamily:'"Geist Mono", monospace', fontSize:11.5}}>{L.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function FileChip({ f, onClick, isOpen }) {
  return (
    <button
      className={`f-chip ${f.exists ? "is-on" : "is-ghost"} ${isOpen ? "is-active" : ""}`}
      onClick={onClick}
      style={isOpen ? {borderColor:"var(--L-user)", color:"var(--L-user)", background:"var(--L-user-bg)"} : null}>
      <span className="f-chip-mark">{f.exists ? "✓" : "✗"}</span>
      <span>{f.name}</span>
      {f.size && f.exists && <span className="f-chip-size">{f.size}</span>}
      {f.parent && <span className="f-chip-size">↑repo</span>}
    </button>
  );
}

// ===== CLAUDE.md config stack redesign (mock: native-mock-v2) =====
// Show only the CLAUDE.md chain that applies to the selected project, in "layers" and "merged" views.
// skills / commands / agents / settings are out of scope. Data comes from /api/dashboard/claude-stack.
const CS_LAYER_CLASS = { "managed": "managed", "user": "user", "user-project": "uproj", "project": "project", "local": "local" };
const CS_LAYER_INFO = {
  managed:        { scope: "Everyone on this machine, all projects", purpose: "Rules an admin enforces globally (you normally don't touch these)", example: "e.g. an org-wide security policy" },
  user:           { scope: "All your projects (just you — doesn't affect anyone else)", purpose: "Personal preferences you want everywhere", example: '"Answer in Japanese," "Use a polite tone"' },
  "user-project": { scope: "This project only, just you (not shared with the team)", purpose: "Personal notes you don't want in git", example: '"My own check steps," "Personal reminders"' },
  project:        { scope: "Everyone on this project (shared via git)", purpose: "The team's shared, official rules", example: '"Tests: npm test," "Deploy: systemctl restart"' },
  local:          { scope: "This project, this machine, just you (not in git)", purpose: "Temporary, machine-specific overrides", example: 'e.g. "local DB path"' },
};
const CS_LAYER_COLOR = { "managed": "var(--cs-managed)", "user": "var(--cs-user)", "user-project": "var(--cs-uproj)", "project": "var(--cs-project)", "local": "var(--cs-local)" };

export function ClaudeLayerBox({ layer, openFile, onOpenFile, onCreateLayer, canCreateLayer, children }) {
  const ghost = !layer.present;
  const [collapsed, setCollapsed] = useState(false);
  const cls = CS_LAYER_CLASS[layer.id] || "";
  const editorOpen = openFile && openFile.layer === layer.id;
  const showBody = !ghost && !collapsed;
  const openFull = () => onOpenFile && onOpenFile({
    key: layer.id, absPath: layer.abs_path, name: layer.path, layer: layer.id, layerPath: layer.path,
  });
  const meta = layer.present
    ? [layer.size, layer.sub].filter(Boolean).join(" · ")
    : layer.sub;
  return (
    <div className={`cs-ly ${cls} ${ghost ? "ghost" : ""}`} data-id={`cs-layer-${layer.id}`}>
      <div className="cs-lhd">
        <span className={`cs-bdg ${cls}`}>{layer.title}</span>
        {CS_LAYER_INFO[layer.id] && (
          <span className="cs-info" tabIndex={0} aria-label="About this layer">ⓘ
            <span className="cs-tip">
              <div><b>Applies to</b>: {CS_LAYER_INFO[layer.id].scope}</div>
              <div><b>What goes here</b>: {CS_LAYER_INFO[layer.id].purpose}</div>
              <div><b>Example</b>: {CS_LAYER_INFO[layer.id].example}</div>
            </span>
          </span>
        )}
        <span className="cs-lpath" title={layer.path}>{layer.path}</span>
        <span className="cs-lmeta">{meta}</span>
        {layer.id !== "managed" && onCreateLayer && (() => {
          const enabled = !canCreateLayer || canCreateLayer(layer);
          return (
            <button className="cs-ly-make" disabled={!enabled}
                    title={!enabled ? "Select a project first"
                                    : (layer.present ? "Edit this layer's CLAUDE.md with AI" : "Create this layer's CLAUDE.md with AI")}
                    onClick={(e) => { e.stopPropagation(); if (enabled) onCreateLayer(layer); }}>
              {layer.present ? "✏️ Edit" : "✨ Create"}
            </button>
          );
        })()}
        {!ghost && (
          <button className="cs-toggle" title={collapsed ? "Expand" : "Collapse"}
                  aria-expanded={!collapsed} onClick={() => setCollapsed(c => !c)}>
            {collapsed ? "+" : "−"}
          </button>
        )}
      </div>
      {ghost && <div className="cs-ghost-note">{layer.note}</div>}
      {showBody && (
        <div className="cs-lbody">
          {layer.sections && layer.sections.length > 0 && (
            <div className="cs-secchips">
              {layer.sections.map((s, i) => <span key={i} className="cs-schip">{s}</span>)}
            </div>
          )}
          {layer.preview && <div className="cs-prev">{layer.preview}</div>}
          <button className="cs-openfull" onClick={openFull}>Open full text →</button>
          {editorOpen && <DashEditor file={openFile} onClose={() => onOpenFile(null)} />}
        </div>
      )}
      {children && <div className="cs-nest" style={{ padding: "0 14px 12px" }}>{children}</div>}
    </div>
  );
}

export function MergedClaudeView({ merged }) {
  const order = [];
  const seen = {};
  (merged || []).forEach(b => { if (!seen[b.source]) { seen[b.source] = true; order.push(b.source); } });
  return (
    <div className="cs-stack">
      <div className="cs-mlegend">
        {order.map(src => (
          <span key={src}><i style={{ background: CS_LAYER_COLOR[src] || "var(--bd-2)" }}></i>{src.toUpperCase()}</span>
        ))}
        <span style={{ color: "var(--tx-4,#9aa0aa)" }}>= everything concatenated top to bottom is what actually gets passed to Claude</span>
      </div>
      <div className="cs-mdoc">
        {(merged || []).map((b, i) => (
          <div key={i} className="cs-mblk">
            <div className="cs-mbar" style={{ background: CS_LAYER_COLOR[b.source] || "var(--bd-2)" }}></div>
            <div className="cs-mc">
              <div className="cs-msrc">{(b.source || "").toUpperCase()}</div>
              <div className="cs-mh">{b.heading}</div>
              {b.excerpt && <div className="cs-mtxt">{b.excerpt}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ClaudeStackPanel({ activeProject, openFile, onOpenFile, onCreateClaudeMd }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState("stack"); // "stack" | "merged"
  const [err, setErr] = useState(null);
  const projKey = activeProject ? (activeProject.path || activeProject.name || activeProject) : "";

  useEffect(() => {
    let cancelled = false;
    if (window.__DEMO_MODE__ && window.CLAUDE_STACK_DEMO) {
      setData(window.CLAUDE_STACK_DEMO); setErr(null);
      return () => { cancelled = true; };
    }
    setData(null); setErr(null);
    apiFetch(`/api/dashboard/claude-stack?project=${encodeURIComponent(projKey || "")}`)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setErr((e && e.message) || String(e)); });
    return () => { cancelled = true; };
  }, [projKey]);

  if (err) return <div className="stack-card" style={{ padding: 20 }}><div className="cs-ghost-note">Failed to load the CLAUDE.md stack: {err}</div></div>;
  if (!data) return <div className="stack-card" style={{ padding: 20 }}><div className="cs-ghost-note">Loading…</div></div>;

  const byId = {};
  (data.layers || []).forEach(l => { byId[l.id] = l; });
  // Nesting: outer = broader scope → inner = narrower scope (managed ⊃ user ⊃ user-project ⊃ project ⊃ local)
  const order = ["managed", "user", "user-project", "project", "local"];
  const present = order.filter(id => byId[id]);
  const canCreateLayer = (layer) => !!(activeProject || (layer && layer.id === "user"));
  const onCreateLayer = (layer) => { if (onCreateClaudeMd && canCreateLayer(layer)) onCreateClaudeMd(activeProject || null, layer); };
  const buildNest = (idx) => {
    if (idx >= present.length) return null;
    const id = present[idx];
    return (
      <ClaudeLayerBox key={id} layer={byId[id]} openFile={openFile} onOpenFile={onOpenFile} onCreateLayer={onCreateLayer} canCreateLayer={canCreateLayer}>
        {buildNest(idx + 1)}
      </ClaudeLayerBox>
    );
  };

  const s = data.summary || {};
  const kb = Math.round(((s.total_bytes || 0) / 1024) * 10) / 10;
  return (
    <div>
      <div className="cs-toprow">
        <div className="cs-seg">
          <button className={view === "stack" ? "on" : ""} onClick={() => setView("stack")}>By layer</button>
          <button className={view === "merged" ? "on" : ""} onClick={() => setView("merged")}>Merged view</button>
        </div>
      </div>
      <div className="cs-summary">
        <span>Active CLAUDE.md files: <b>{s.effective_count || 0}</b></span>
        <span>Total <b>{kb}KB</b></span>
        <span>Sections <b>{s.section_count || 0}</b></span>
      </div>
      {view === "stack"
        ? <div className="cs-stack">{buildNest(0)}</div>
        : <MergedClaudeView merged={data.merged} />}
    </div>
  );
}

export function DashEditor({ file, onClose }) {
  // file: { key, absPath, name, layer, layerPath } — passed from LayerBox
  const absPath = file.absPath;
  const fileName = file.name || absPath;
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!absPath) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/api/workspace/file?path=${encodeURIComponent(absPath)}`)
      .then(data => {
        if (cancelled) return;
        setContent(data.content);
        setOriginal(data.content);
        setMeta({
          is_staged: data.is_staged,
          exists_live: data.exists_live,
          size: data.size,
          mtime: data.mtime,
          layer: data.layer,
        });
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError((err && err.message) || String(err));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [absPath]);

  const isDirty = content !== original;
  const editCount = (() => {
    if (!isDirty) return 0;
    const a = original.split("\n");
    const b = content.split("\n");
    const maxLen = Math.max(a.length, b.length);
    let n = 0;
    for (let i = 0; i < maxLen; i++) {
      if ((a[i] === undefined ? "" : a[i]) !== (b[i] === undefined ? "" : b[i])) n++;
    }
    return n;
  })();

  function copyPath() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(absPath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => { /* clipboard unavailable in some contexts */ });
  }

  const canFormat = /\.(json|jsonc)$/i.test(absPath || "");
  function formatContent() {
    if (!canFormat) return;
    try {
      const obj = JSON.parse(content);
      setContent(JSON.stringify(obj, null, 2));
      setError(null);
    } catch (e) {
      setError(`Format failed: ${e.message}`);
    }
  }

  async function save() {
    if (!isDirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const data = await apiPut("/api/workspace/file", { path: absPath, content });
      setOriginal(content);
      setMeta(m => ({ ...(m || {}), is_staged: true, mtime: data.mtime, size: data.size, layer: data.layer }));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
      window.dispatchEvent(new CustomEvent("flow-inspector:staged-changed"));
    } catch (err) {
      setError(`Save failed: ${(err && err.message) || err}`);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (isDirty && !window.confirm("Discard unsaved edits and close?")) return;
    onClose();
  }

  const lines = content.split("\n");
  const layerKlass = meta ? (meta.layer === "user-project" ? "is-userproject" : `is-${meta.layer}`) : "";

  let stateBadge;
  if (loading) {
    stateBadge = <span className="editor-state" style={{background:"var(--bg-3)",color:"var(--tx-3)",borderColor:"var(--bd)"}}>Loading…</span>;
  } else if (error) {
    stateBadge = <span className="editor-state" style={{background:"#fee",color:"#b00",borderColor:"#fcc"}} title={error}>{error.length > 40 ? error.slice(0, 38) + "…" : error}</span>;
  } else if (isDirty) {
    stateBadge = <span className="editor-state">Unsaved · {editCount} edits</span>;
  } else if (meta && meta.is_staged) {
    stateBadge = <span className="editor-state" style={{background:"var(--L-user-bg)",color:"var(--L-user)",borderColor:"rgba(59,130,246,0.3)"}}>Staged · not synced</span>;
  } else {
    stateBadge = <span className="editor-state" style={{background:"var(--bg-3)",color:"var(--tx-3)",borderColor:"var(--bd)"}}>Live-synced</span>;
  }

  return (
    <div className={`editor ${layerKlass}`}>
      <div className="editor-head">
        <span className="editor-file">{fileName}</span>
        {stateBadge}
        {justSaved && (
          <span className="editor-state" style={{background:"var(--L-project-bg)",color:"var(--L-project)",borderColor:"rgba(21,128,61,0.3)"}}>✓ Saved to staging</span>
        )}
        <div className="editor-actions">
          <button className="dash-btn ghost" onClick={copyPath} title={absPath}>{copied ? "✓ Copied" : "📋 Copy path"}</button>
          <button className="dash-btn ghost" onClick={cancel}>Cancel</button>
          <button className="dash-btn" disabled={!canFormat || loading} onClick={formatContent} title={canFormat ? "Format JSON" : "Formatting is only for .json/.jsonc"}>Format</button>
          <button className="dash-btn primary" disabled={!isDirty || saving || loading} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
      <div className="editor-body">
        <div className="editor-gutter">
          {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <textarea
          className="editor-textarea"
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
          disabled={loading || saving}
          style={{minHeight: `${Math.max(lines.length, 6) * 1.7}em`}}
        />
      </div>
    </div>
  );
}

export function Acc({ icon, title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`acc ${open ? "is-open" : ""}`}>
      <div className="acc-head" onClick={() => setOpen(v => !v)}>
        <div className="acc-icon">{icon}</div>
        <div className="acc-title">{title}</div>
        <div className="acc-count">{count}</div>
        <div className="acc-chev">&#9660;</div>
      </div>
      {open && <div className="acc-body">{children}</div>}
    </div>
  );
}

export function DashSubagents({ onOpenAgent }) {
  return (
    <Acc icon="◇" title="Subagents" count={window.DASH_SUBAGENTS.length}>
      {window.DASH_SUBAGENTS.map((a, i) => (
        <div className="row" key={i} data-id={`subagent-${i}`}>
          <LayerPill layer={a.layer} />
          <div className="row-body">
            <div className="row-name">{a.name}</div>
            <div className="row-desc">{a.desc}</div>
            {a.meta && <div className="row-meta">{a.meta}</div>}
          </div>
          <div className="row-aside">
            <button className="arrow-btn" onClick={() => onOpenAgent && onOpenAgent(i)} title="Open">&rarr;</button>
          </div>
        </div>
      ))}
    </Acc>
  );
}

// The "Flow-ize" action on each skill/command row. State machine:
//   idle → ▶ Flow-ize / running → ⏳ Flow-izing… / done → View / failed → ⚠ Retry
// The initial state is derived by merging the list's flowized flag (= kind cache present) with running jobs.
// managed (distributed) skills are read-only, so they're disabled when idle (viewing is still allowed once done).
function FlowizeButton({ flowId, flowized, layer, jobs, onOpen }) {
  const job = flowId ? jobs[flowId] : null;
  const status = job ? job.status : (flowized ? "done" : "idle");
  if (status === "running") {
    return <span className="flowize-badge" title="Flow-ize in progress">⏳ Flow-izing…</span>;
  }
  if (status === "done") {
    return <button className="flowize-btn is-view" onClick={onOpen} title="View result">View</button>;
  }
  if (status === "failed") {
    return <button className="flowize-btn is-failed" onClick={() => startFlowize(flowId)}
                   title={(job && job.error) || "Failed"}>⚠ Retry</button>;
  }
  // idle
  if (layer === "managed") {
    return <button className="flowize-btn" disabled title="Distributed (managed) skills are read-only">▶ Flow-ize</button>;
  }
  return <button className="flowize-btn" onClick={() => startFlowize(flowId)} title="Flow-ize this skill/command">▶ Flow-ize</button>;
}

export function DashSkills({ onOpenFlow }) {
  const jobs = useFlowizeJobs();
  // Group skills into 3 categories:
  //   1. Custom / User (~/.claude/skills/) — no plugin_source
  //   2. Plugin-provided — plugin_source is "<plugin-name>"
  //   3. In-project (working-directory dependent) — plugin_source is "project:<name>"
  //      => SKILL.md in non-standard locations (e.g. pipeline/skills/).
  //      Claude Code itself doesn't recognize them, but they're used indirectly via CLAUDE.md.
  //   0. Awaiting publish (staged inside FI, not synced) — /api/skills/staged. Shown at the top.
  const all = window.DASH_SKILLS || [];

  const [staged, setStaged] = React.useState([]);
  const [stagedBusy, setStagedBusy] = React.useState(null);  // slug currently being operated on
  const [diffFor, setDiffFor] = React.useState(null);        // { slug, staged_content, live_content, is_new }
  const refreshStaged = React.useCallback(() => {
    fetch(API + "/api/skills/staged").then(r => r.ok ? r.json() : []).then(d => setStaged(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  React.useEffect(() => { refreshStaged(); }, [refreshStaged]);

  async function viewStaged(slug) {
    try {
      const r = await fetch(API + "/api/skills/staged/" + encodeURIComponent(slug));
      if (!r.ok) throw 0;
      setDiffFor({ slug, ...(await r.json()) });
    } catch (e) { alert("Failed to load"); }
  }
  async function publishStaged(slug) {
    if (stagedBusy) return;
    if (!window.confirm(`Sync "${slug}" to production (~/.claude/skills). It will become available to Claude.`)) return;
    setStagedBusy(slug);
    try {
      const r = await fetch(API + "/api/skills/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || `Sync failed (HTTP ${r.status})`); }
      window.location.reload();   // disappears from "awaiting publish" and shows up under Custom/User (live)
    } catch (e) { alert(String(e.message || e)); setStagedBusy(null); }
  }
  async function discardStaged(slug) {
    if (stagedBusy) return;
    if (!window.confirm(`Discard the pending skill "${slug}". This can't be undone.`)) return;
    setStagedBusy(slug);
    try {
      const r = await fetch(API + "/api/skills/staged/" + encodeURIComponent(slug), { method: "DELETE" });
      if (!r.ok) throw 0;
      refreshStaged();
    } catch (e) { alert("Failed to discard"); }
    setStagedBusy(null);
  }

  const preBox = { whiteSpace: "pre-wrap", fontSize: 11, maxHeight: "56vh", overflow: "auto", padding: 10, borderRadius: 6, fontFamily: '"Geist Mono", monospace' };
  const diffModal = diffFor && (
    <div className="plan-modal-overlay" onClick={() => setDiffFor(null)}>
      <div className="plan-modal" onClick={e => e.stopPropagation()} style={{ width: 760, maxWidth: "92vw" }}>
        <div className="plan-modal-head">
          <span className="plan-modal-title">{diffFor.is_new ? "Pending contents" : "Diff (sync overwrites production)"}: /{diffFor.slug}</span>
          <button onClick={() => setDiffFor(null)}>×</button>
        </div>
        <div className="plan-modal-body" style={{ gap: 10 }}>
          {!diffFor.is_new && <div className="skill-val-warn">⚠ A skill with the same name exists in production. Syncing will overwrite it.</div>}
          {diffFor.is_new
            ? <pre style={{ ...preBox, maxHeight: "60vh", background: "var(--bg-2, #f6f6f3)" }}>{diffFor.staged_content}</pre>
            : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><div style={{ fontSize: 11, color: "var(--tx-4)", marginBottom: 4 }}>Pending (new)</div><pre style={{ ...preBox, background: "#f0fdf4" }}>{diffFor.staged_content}</pre></div>
                <div><div style={{ fontSize: 11, color: "var(--tx-4)", marginBottom: 4 }}>Production (current)</div><pre style={{ ...preBox, background: "#fef2f2" }}>{diffFor.live_content}</pre></div>
              </div>}
          <div className="plan-modal-actions">
            <button onClick={() => setDiffFor(null)}>Close</button>
            <button className="primary" onClick={() => { const s = diffFor.slug; setDiffFor(null); publishStaged(s); }}>Sync to production</button>
          </div>
        </div>
      </div>
    </div>
  );
  const userOwn = all.filter(s => !s.plugin_source);
  const byPlugin = {};      // <plugin-name> -> [skill]
  const byProject = {};     // <project-name> (without "project:" prefix) -> [skill]
  all.forEach(s => {
    if (!s.plugin_source) return;
    if (s.plugin_source.startsWith("project:")) {
      const proj = s.plugin_source.slice("project:".length);
      if (!byProject[proj]) byProject[proj] = [];
      byProject[proj].push(s);
    } else {
      if (!byPlugin[s.plugin_source]) byPlugin[s.plugin_source] = [];
      byPlugin[s.plugin_source].push(s);
    }
  });
  // Sort plugin names: official (anthropic) → claude-plugins-official → everything else alphabetically
  const pluginNames = Object.keys(byPlugin).sort((a, b) => {
    const score = (n) => n.startsWith("anthropic-") ? 0 : (n === "claude-plugins-official" ? 1 : 2);
    return score(a) - score(b) || a.localeCompare(b);
  });
  const projectNames = Object.keys(byProject).sort((a, b) => a.localeCompare(b));
  const [openPlugins, setOpenPlugins] = React.useState({});  // pluginName -> bool
  const togglePlugin = (name) => setOpenPlugins(o => ({ ...o, [name]: !o[name] }));
  const [openProjects, setOpenProjects] = React.useState({});  // projectName -> bool
  const toggleProject = (name) => setOpenProjects(o => ({ ...o, [name]: !o[name] }));

  const renderSkillRow = (s, key) => (
    <div className="row" key={key} data-id={`skill-${key}`}>
      <LayerPill layer={s.layer} />
      <div className="row-body">
        <div className="row-name">{s.skill_name || s.name}</div>
        <div className="row-desc">{s.desc}</div>
      </div>
      <div className="row-aside">
        <div style={{display:"flex", gap:6, alignItems:"center"}}>
          <span className={`cx-pill cx-${s.complexity.toLowerCase()}`}>{s.complexity}</span>
          <span className="row-meta" style={{margin:0}}>{s.nodes} nodes</span>
        </div>
        <FlowizeButton flowId={s.flowId} flowized={s.flowized} layer={s.layer}
                       jobs={jobs} onOpen={() => onOpenFlow && onOpenFlow(s.flowId)} />
      </div>
    </div>
  );

  return (
    <React.Fragment>
    {diffModal}
    <Acc icon="⚡" title="Skills" count={all.length + staged.length}>
      {/* Awaiting publish (staged inside FI, not synced) at the top */}
      {staged.length > 0 && (
        <div className="skill-folder skill-folder-staged" style={{ borderLeft: "3px solid #d97706" }}>
          <div className="skill-folder-head">
            <span className="skill-folder-icon">⏳</span>
            <span className="skill-folder-name">Awaiting publish</span>
            <span className="skill-folder-count">{staged.length}</span>
            <span style={{ marginLeft: 8, fontSize: 10, color: "var(--tx-4)", fontFamily: '"Geist Mono", monospace' }}>In FI · not synced</span>
          </div>
          <div className="skill-folder-body">
            {staged.map(s => (
              <div className="row" key={s.slug} data-id={`staged-${s.slug}`}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", whiteSpace: "nowrap" }}>Pending</span>
                <div className="row-body">
                  <div className="row-name">{s.display_name || s.slug}</div>
                  <div className="row-desc">{s.description ? s.description : <span style={{ color: "var(--tx-4)" }}>(no description)</span>}</div>
                  <div style={{ fontSize: 10, color: "var(--tx-4)", fontFamily: '"Geist Mono", monospace', marginTop: 2 }}>Invoke: /{s.slug}</div>
                </div>
                <div className="row-aside" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button className="arrow-btn" title="View contents / diff" onClick={() => viewStaged(s.slug)}>👁</button>
                  <button className="arrow-btn" title="Discard" disabled={stagedBusy === s.slug} onClick={() => discardStaged(s.slug)}>🗑</button>
                  <button className="primary" style={{ padding: "4px 10px", fontSize: 12 }} disabled={stagedBusy === s.slug} onClick={() => publishStaged(s.slug)}>{stagedBusy === s.slug ? "Syncing…" : "Sync to production"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* User-owned skills first */}
      {userOwn.length > 0 && (
        <div className="skill-folder skill-folder-user">
          <div className="skill-folder-head">
            <span className="skill-folder-icon">📁</span>
            <span className="skill-folder-name">Custom / User</span>
            <span className="skill-folder-count">{userOwn.length}</span>
          </div>
          <div className="skill-folder-body">
            {userOwn.map((s, i) => renderSkillRow(s, `user-${i}`))}
          </div>
        </div>
      )}
      {/* Plugin-provided skills, one collapsible folder per plugin */}
      {pluginNames.map(name => {
        const items = byPlugin[name];
        const isOpen = !!openPlugins[name];
        return (
          <div key={name} className={`skill-folder skill-folder-plugin ${isOpen ? "is-open" : ""}`}>
            <button className="skill-folder-head skill-folder-toggle" onClick={() => togglePlugin(name)}>
              <span className="skill-folder-chev">{isOpen ? "▾" : "▸"}</span>
              <span className="skill-folder-icon">🧩</span>
              <span className="skill-folder-name">{name}</span>
              <span className="skill-folder-count">{items.length}</span>
            </button>
            {isOpen && (
              <div className="skill-folder-body">
                {items.map((s, i) => renderSkillRow(s, `${name}-${i}`))}
              </div>
            )}
          </div>
        );
      })}
      {/* In-project skills (working-directory dependent) — non-standard locations like pipeline/skills/ */}
      {projectNames.length > 0 && (
        <div className="skill-section-divider" style={{padding:"8px 12px 4px", fontSize:11, color:"var(--tx-4)", fontFamily:'"Geist Mono", monospace', letterSpacing:"0.06em", textTransform:"uppercase"}}>
          ── In-project (working-directory dependent) ──
        </div>
      )}
      {projectNames.map(name => {
        const items = byProject[name];
        const isOpen = !!openProjects[name];
        // Sub-group further by container_path (e.g. "pipeline/skills/" / "scripts/skills/")
        const byContainer = {};
        items.forEach(it => {
          const c = it.container_path || "(root)";
          if (!byContainer[c]) byContainer[c] = [];
          byContainer[c].push(it);
        });
        const containerKeys = Object.keys(byContainer).sort();
        return (
          <div key={`proj-${name}`} className={`skill-folder skill-folder-project ${isOpen ? "is-open" : ""}`}>
            <button className="skill-folder-head skill-folder-toggle" onClick={() => toggleProject(name)}>
              <span className="skill-folder-chev">{isOpen ? "▾" : "▸"}</span>
              <span className="skill-folder-icon">📂</span>
              <span className="skill-folder-name">{name}</span>
              <span className="skill-folder-count">{items.length}</span>
              <span style={{marginLeft:8, fontSize:10, color:"var(--tx-4)", fontFamily:'"Geist Mono", monospace'}}>~/projects/{name}/</span>
            </button>
            {isOpen && (
              <div className="skill-folder-body">
                {containerKeys.length > 1 ? (
                  // Sub-group when there are multiple containers
                  containerKeys.map(c => (
                    <div key={c} style={{marginBottom:8}}>
                      <div style={{padding:"4px 14px", fontSize:11, color:"var(--tx-4)", fontFamily:'"Geist Mono", monospace'}}>📁 {c}/</div>
                      {byContainer[c].map((s, i) => renderSkillRow(s, `${name}-${c}-${i}`))}
                    </div>
                  ))
                ) : (
                  items.map((s, i) => renderSkillRow(s, `${name}-${i}`))
                )}
              </div>
            )}
          </div>
        );
      })}
      {all.length === 0 && (
        <div className="row-empty" style={{padding:"12px 16px", color:"var(--tx-4)", fontSize:12, lineHeight:1.7}}>
          No custom skills yet (skills placed in <code>~/.claude/skills/</code> or a project's <code>.claude/skills/</code> show up here).<br/>
          Skills from official plugins are hidden by default. To show them, reopen the page with <code>?include_managed=true</code> in the URL, or set the location of your projects via the <code>FLOW_INSPECTOR_PROJECTS_ROOT</code> environment variable.
        </div>
      )}
    </Acc>
    </React.Fragment>
  );
}

export function DashMcpList() {
  return (
    <Acc icon="🔌" title="MCP Servers" count={`${window.DASH_MCP.filter(m=>m.active).length}/${window.DASH_MCP.length} running`}>
      {window.DASH_MCP.map((m, i) => (
        <div className="row" key={i} data-id={`mcp-${i}`}>
          <LayerPill layer={m.layer} />
          <div className="row-body">
            <div className="row-name" style={{display:"flex", alignItems:"center", gap:8}}>
              <span className={`dot ${m.active ? "is-on" : "is-off"}`}></span>
              <code>{m.name}</code>
              {!m.active && <span style={{fontFamily:'"Geist Mono", monospace', fontSize:10, color:"var(--L-managed)", letterSpacing:"0.1em"}}>INACTIVE</span>}
            </div>
            <div className="row-meta">$ {m.cmd}</div>
            <div className="tool-chips">
              {m.tools.map(t => <span key={t} className="tool-chip">{t}</span>)}
            </div>
            {m.error && <div className="row-meta" style={{color:"var(--L-managed)", marginTop:4}}>! {m.error}</div>}
          </div>
          <div className="row-aside">
            <span className="row-meta" style={{margin:0}}>{m.tools.length} tools</span>
            <button className="arrow-btn" title="Edit">&rarr;</button>
          </div>
        </div>
      ))}
    </Acc>
  );
}

export function DashHooksList({ onOpenHook }) {
  return (
    <Acc icon="⌘" title="Hooks" count={window.DASH_HOOKS.length}>
      {window.DASH_HOOKS.map((h, i) => (
        <div className="row" key={i} data-id={`hook-${i}`} style={{cursor:"pointer"}} onClick={() => onOpenHook && onOpenHook(i)}>
          <LayerPill layer={h.layer} />
          <div className="row-body">
            <div className="row-name" style={{display:"flex", alignItems:"center", gap:8}}>
              <span className="tool-chip" style={{color:"var(--L-userproject)", borderColor:"rgba(124,58,237,0.3)", background:"var(--L-userproject-bg)"}}>{h.type}</span>
              <span>{h.name}</span>
            </div>
            <div className="row-meta">matcher: <code style={{color:"var(--tx)"}}>{h.matcher}</code> &rarr; <code style={{color:"var(--tx-2)"}}>{h.script}</code></div>
          </div>
          <div className="row-aside">
            <button className="arrow-btn" title="Open">&rarr;</button>
          </div>
        </div>
      ))}
    </Acc>
  );
}

export function DashCommandsList({ onOpenCommand }) {
  const jobs = useFlowizeJobs();
  return (
    <Acc icon="⌨" title="Slash Commands" count={window.DASH_COMMANDS.length}>
      <div className="cmd-grid">
        {window.DASH_COMMANDS.map((c, i) => (
          <div className="cmd-cell" key={i} data-id={`cmd-${i}`}>
            <LayerPill layer={c.layer} />
            <div className="cmd-cell-body">
              <div className="cmd-name">{c.name}</div>
              <div className="cmd-desc">{c.desc}</div>
            </div>
            <FlowizeButton flowId={c.flowId} flowized={c.flowized} layer={c.layer}
                           jobs={jobs} onOpen={() => onOpenCommand && onOpenCommand(i)} />
          </div>
        ))}
      </div>
    </Acc>
  );
}

export function DashFilesList() {
  return (
    <Acc icon="📁" title="Config Files" count={window.DASH_FILE_TREE.reduce((a,b)=>a+b.files.length,0)}>
      <div className="tree-root">
        {window.DASH_FILE_TREE.map((r, i) => (
          <div className="tree-root-group" key={i}>
            <div className="tree-root-head">
              <LayerPill layer={r.layer} />
              <span className="tree-path">{r.root}</span>
            </div>
            {r.files.map((f, j) => (
              <div className="tree-row" key={j}>
                <span className={`tree-mark ${f.exists ? "on" : "off"}`}>{f.exists ? "✓" : "✗"}</span>
                <span className={`tree-name ${f.exists ? "" : "is-missing"}`}>{f.name}</span>
                <span className="tree-size">{f.size}</span>
                <span className="tree-desc">{f.desc}</span>
                <span className="tree-act">{f.exists ? "Open" : "Create"}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Acc>
  );
}

export function DashIntegrations() {
  return (
    <Acc icon="🔗" title="Integrations" count={window.DASH_INTEGRATIONS.length}>
      {window.DASH_INTEGRATIONS.map((it, i) => (
        <div className="row" key={i} data-id={`integ-${i}`}>
          <span className="layer-pill is-builtin">{it.state}</span>
          <div className="row-body">
            <div className="row-name">{it.name}</div>
            <div className="row-desc">{it.desc}</div>
            <div className="row-meta">{it.meta}</div>
          </div>
          <div className="row-aside">
            <button className="arrow-btn" title="Open">&rarr;</button>
          </div>
        </div>
      ))}
    </Acc>
  );
}

export function DashValidation({ onDismiss }) {
  return (
    <div className="validation">
      <div className="val-head">
        <div className="val-title">
          <span className="val-icon">!</span>
          Validation
        </div>
        <span className="val-count">{window.DASH_VALIDATION_WARNINGS.length} warnings &middot; pending save</span>
        <div className="val-spacer"></div>
        <div className="val-actions">
          <button className="dash-btn">Verify with <code style={{fontFamily:'"Geist Mono", monospace'}}>claude -p</code></button>
          <button className="dash-btn">Save anyway</button>
          <button className="dash-btn primary" onClick={onDismiss}>Discard</button>
        </div>
      </div>
      <div className="val-list">
        {window.DASH_VALIDATION_WARNINGS.map((w, i) => (
          <div key={i} className="val-item">
            <span className="vi-mark">⚠</span>
            <div>
              <div className="vi-title">{w.title}</div>
              <div className="vi-detail">{w.detail}</div>
              <div className="vi-affected">
                {w.affected.map(a => <span key={a} className="vi-aff">{a}</span>)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────── Dashboard Chat + Firefly highlight ─────────
function buildSearchIndex() {
  const items = [];
  window.DASH_SKILLS.forEach((s, i) => items.push({ kind: "Skill", layer: s.layer, name: s.name, desc: s.desc, domId: `skill-${i}` }));
  window.DASH_SUBAGENTS.forEach((a, i) => items.push({ kind: "Subagent", layer: a.layer, name: a.name, desc: a.desc, domId: `subagent-${i}` }));
  const mcpAliases = { "gmail-mcp": "mail email gmail", "xmcp": "tweet post x", "canva-mcp": "design canva", "notion-mcp": "note notes memo" };
  window.DASH_MCP.forEach((m, i) => items.push({ kind: "MCP", layer: m.layer, name: m.name, desc: m.tools.join(", ") + " " + (mcpAliases[m.name] || ""), domId: `mcp-${i}` }));
  window.DASH_HOOKS.forEach((h, i) => items.push({ kind: "Hook", layer: h.layer, name: h.name, desc: `${h.type} ${h.matcher}`, domId: `hook-${i}` }));
  window.DASH_COMMANDS.forEach((c, i) => items.push({ kind: "Command", layer: c.layer, name: c.name, desc: c.desc, domId: `cmd-${i}` }));
  window.DASH_INTEGRATIONS.forEach((it, i) => items.push({ kind: "Integration", layer: "built-in", name: it.name, desc: it.desc, domId: `integ-${i}` }));
  window.CONFIG_STACK.forEach(cfg => {
    if (cfg.sections) cfg.sections.forEach(s => items.push({ kind: "Section", layer: cfg.layer, name: s, desc: `CLAUDE.md section in ${cfg.title}`, domId: `layer-${cfg.id}` }));
  });
  return items;
}

function searchItems(query, index) {
  const q = query.toLowerCase().replace(/[？?！!。、\s]+/g, " ").trim();
  // Extract tokens: strip common particles/endings, split, keep >=2 char
  const stripped = q.replace(/(に関する|について|ってなに|ってある|ですか|ますか|できる|したい|ありますか|ある|ない|した|って|する|れる|の|は|が|を|で|と|も|か|な|よ|ね)/g, " ");
  const tokens = stripped.split(/\s+/).filter(w => w.length >= 2);
  // Also extract all 2-4 char CJK substrings from the cleaned query for broader matching
  const cjk = /[　-鿿豈-﫿]/;
  const cleanQ = q.replace(/[？?！!。、\s]/g, "");
  const subs = new Set();
  for (let len = 3; len <= Math.min(5, cleanQ.length); len++) {
    for (let i = 0; i <= cleanQ.length - len; i++) {
      const s = cleanQ.slice(i, i + len);
      if (cjk.test(s[0])) subs.add(s);
    }
  }
  // Also add ascii tokens (like "mcp", "github")
  const asciiTokens = q.match(/[a-z0-9_-]{2,}/g) || [];
  asciiTokens.forEach(t => tokens.push(t));

  const scored = index.map(item => {
    const nameL = item.name.toLowerCase();
    const descL = item.desc.toLowerCase();
    const allText = nameL + " " + descL + " " + (item.kind || "");
    let score = 0;
    // Exact full match
    if (nameL === q) score = 100;
    // Full query in name or desc
    else if (nameL.includes(q)) score = 70;
    else if (descL.includes(q)) score = 50;
    // Token matching
    if (score < 60 && tokens.length > 0) {
      let hits = 0;
      for (const t of tokens) { if (allText.includes(t)) hits++; }
      const tokenScore = Math.min(65, 20 + hits * 18);
      if (hits > 0) score = Math.max(score, tokenScore);
    }
    // CJK substring matching — only against name+desc, not kind
    if (score < 60) {
      const nameDesc = nameL + " " + descL;
      let bestLen = 0;
      for (const s of subs) {
        if (nameDesc.includes(s) && s.length > bestLen) bestLen = s.length;
      }
      if (bestLen >= 3) score = Math.max(score, 55);
      else if (bestLen >= 2) score = Math.max(score, 35);
    }
    return { ...item, score };
  }).filter(i => i.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
}

function generateReply(query, matches) {
  if (matches.length === 0) {
    return { text: `No items matched "${query}". You can search by the name or description of skills, MCP, hooks, commands, and subagents.`, matches: [] };
  }
  const top = matches[0];
  if (matches.length === 1) {
    return { text: `Found "${top.name}"! It's a ${top.kind} (${top.layer} layer).`, matches };
  }
  const names = matches.slice(0, 3).map(m => m.name).join(", ");
  return { text: `Found ${matches.length} matches. ${top.score >= 70 ? `The closest is "${top.name}" (${top.kind}).` : `Candidates: ${names}`}`, matches };
}

export function DashChat({ onHighlight, activeProject }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "ai", seed: true, text: "Ask anything about what's on the dashboard.\ne.g. \"Any skills for tweeting?\" \"Can MCP send email?\"" }
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [available, setAvailable] = useState(null);  // null=unknown / true=CLI available / false=none → keyword search only
  const messagesEnd = useRef(null);
  const indexRef = useRef(null);
  if (!indexRef.current) indexRef.current = buildSearchIndex();

  useEffect(() => {
    apiFetch("/api/chat/status").then(r => setAvailable(r.available)).catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (messagesEnd.current) messagesEnd.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  // Fallback when the CLI isn't found: answer with the client-side keyword search as before.
  function keywordReply(q) {
    const matches = searchItems(q, indexRef.current);
    const reply = generateReply(q, matches);
    setMessages(prev => [...prev, { role: "ai", text: reply.text, matches: reply.matches }]);
    setTyping(false);
    if (reply.matches.length > 0) onHighlight(reply.matches[0].domId);
  }

  async function send() {
    const q = input.trim();
    if (!q || typing) return;
    setInput("");
    const newMsgs = [...messages, { role: "user", text: q }];
    setMessages(newMsgs);
    setTyping(true);

    // Locally search for related items to use as chips + highlight (alongside the LLM answer).
    const matches = searchItems(q, indexRef.current);
    if (matches.length > 0) onHighlight(matches[0].domId);

    if (available === false) { keywordReply(q); return; }

    try {
      const apiMsgs = newMsgs
        .filter(m => !m.seed && (m.role === "user" || m.role === "ai"))
        .map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));
      const res = await fetch(API + "/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMsgs, context_type: "dashboard", project: (activeProject && (activeProject.path || activeProject.name)) || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiText = "";
      setMessages(m => [...m, { role: "ai", text: "", matches }]);
      setTyping(false);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try { aiText += JSON.parse(line.slice(6)).text;
              setMessages(m => { const u = [...m]; u[u.length - 1] = { role: "ai", text: aiText, matches }; return u; });
            } catch (e) {}
          }
        }
      }
      if (!aiText.trim()) keywordReply(q);  // fall back to keyword search if the response is empty
    } catch (e) {
      setTyping(false);
      keywordReply(q);  // also fall back to keyword search on connection failure
    }
  }

  function handleMatchClick(domId) {
    onHighlight(domId);
  }

  if (!open) {
    return <button className="dash-chat-fab" onClick={() => setOpen(true)} title="Open chat">💬</button>;
  }

  return (
    <div className="dash-chat-panel">
      <div className="dcp-head">
        <div className="dcp-head-icon">AI</div>
        <div>
          <div className="dcp-head-title">Dashboard Assistant</div>
          <div className="dcp-head-sub">Search config, skills, and MCP</div>
        </div>
        <button className="dcp-close" onClick={() => setOpen(false)}>&times;</button>
      </div>
      <div className="dcp-messages">
        {messages.map((m, i) => (
          <div key={i} className={`dcp-msg is-${m.role}`}>
            <div style={{whiteSpace:"pre-wrap"}}>{m.text}</div>
            {m.matches && m.matches.length > 0 && (
              <div style={{marginTop:6, display:"flex", flexWrap:"wrap", gap:4}}>
                {m.matches.map((match, j) => (
                  <span key={j} className="dcp-match-chip" onClick={() => handleMatchClick(match.domId)}>
                    <span className="dcp-chip-layer">{match.layer}</span>
                    {match.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {typing && <div className="dcp-msg is-ai"><div className="dcp-typing"><span/><span/><span/></div></div>}
        <div ref={messagesEnd} />
      </div>
      <div className="dcp-input-wrap">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}}
          placeholder="Ask about skills, MCP…"
          autoFocus
        />
        <button className="dcp-send" onClick={send} disabled={!input.trim() || typing}>↑</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════
// My Functions (custom functions) — save a selection under a name and reuse it
// ════════════════════════════════════════════════════
