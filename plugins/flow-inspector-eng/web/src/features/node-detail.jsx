// Node detail + editors + node-level AI chat + flow chrome (TopBar/Timeline/MiniMap/…).
// Phase 3 module — extracted verbatim from app.jsx.
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { API, apiFetch, apiPatch, apiPost } from '../lib/api.js'
import { NODE_TYPES } from '../lib/node-types.js'
import { Section, formatJSON } from '../lib/ui.jsx'
import { extractTaggedJson } from '../lib/json.js'
import { validateFlowForSkill } from '../lib/board-model.js'

export function FlowMetaEditor({ flowKey = "default", nodes, edges, flowId, sourceType }) {
  const storageKey = `fi_flow_meta_${flowKey}`;
  const [showSource, setShowSource] = React.useState(false);
  // Only show the "full source text" button for flows backed by a real file (skill / agent / hooks)
  const canViewSource = !!flowId && ["skill", "agent", "hooks", "command"].includes(sourceType || "");
  const [meta, setMeta] = React.useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return v && typeof v === "object" ? v : {};
    } catch { return {}; }
  });
  const [draft, setDraft] = React.useState(meta);
  const [generating, setGenerating] = React.useState(false);
  const [generateError, setGenerateError] = React.useState("");
  const isDirty = JSON.stringify(meta) !== JSON.stringify(draft);
  const canGenerate = Array.isArray(nodes) && nodes.length > 0;

  // Reload the values when flowKey changes
  React.useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const m = v && typeof v === "object" ? v : {};
      setMeta(m);
      setDraft(m);
    } catch {}
  }, [storageKey]);

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {}
    setMeta(draft);
  }

  async function generateWithAI() {
    if (!canGenerate || generating) return;
    setGenerating(true);
    setGenerateError("");
    try {
      const payload = {
        mode: "flow-meta",
        nodes: (nodes || []).map(n => ({
          id: n.id,
          type: n.type || n.nodeType || "node",
          nodeType: n.nodeType,
          label: n.label || n.title || n.name || "",
          meta: n.meta || {},
        })),
        edges: (edges || []).map(e => ({
          from: e.from,
          to: e.to,
          label: e.label || "",
        })),
        existing: {
          purpose: draft.purpose || "",
          inputs: draft.inputs || "",
          outputs: draft.outputs || "",
        },
      };
      const res = await fetch("/api/auto-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data && data.error) {
        setGenerateError(data.error);
      } else if (data && (data.purpose || data.inputs || data.outputs)) {
        // Overwrite silently (the user reviews and saves)
        setDraft({
          purpose: data.purpose || "",
          inputs: data.inputs || "",
          outputs: data.outputs || "",
        });
      } else {
        setGenerateError("The AI response was in an unexpected format");
      }
    } catch (err) {
      setGenerateError(String((err && err.message) || err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flow-meta-editor">
      <div className="fme-header">
        <div className="fme-title">Flow settings</div>
        <div style={{ display: "flex", gap: 6 }}>
          {canViewSource && (
            <button
              type="button"
              className="fme-ai-btn"
              style={{ background: "var(--bg-3)", color: "var(--tx-2)" }}
              onClick={() => setShowSource(true)}
              title="Show the full instructions (SKILL.md) for this skill"
            >📄 Full source text</button>
          )}
          {canGenerate && (
            <button
              type="button"
              className="fme-ai-btn"
              onClick={generateWithAI}
              disabled={generating}
              title="Let AI infer the purpose and inputs/outputs from the node structure"
            >
              {generating ? "⏳ Inferring…" : "✨ Generate with AI"}
            </button>
          )}
        </div>
      </div>
      {showSource && <SourceTextModal flowId={flowId} onClose={() => setShowSource(false)} />}
      {generateError && <div className="fme-error">{generateError}</div>}
      <div className="fme-section">
        <label className="fme-label">🎯 Flow purpose</label>
        <textarea
          className="fme-textarea"
          value={draft.purpose || ""}
          onChange={(e) => setDraft(d => ({ ...d, purpose: e.target.value }))}
          placeholder="Describe what this flow as a whole is meant to accomplish"
          rows={3}
        />
      </div>
      <div className="fme-section">
        <label className="fme-label">📥 Inputs</label>
        <textarea
          className="fme-textarea"
          value={draft.inputs || ""}
          onChange={(e) => setDraft(d => ({ ...d, inputs: e.target.value }))}
          placeholder="What it takes as input"
          rows={3}
        />
      </div>
      <div className="fme-section">
        <label className="fme-label">📤 Outputs</label>
        <textarea
          className="fme-textarea"
          value={draft.outputs || ""}
          onChange={(e) => setDraft(d => ({ ...d, outputs: e.target.value }))}
          placeholder="What it returns as output"
          rows={3}
        />
      </div>
      <div className="fme-actions">
        <span className={`fme-status ${isDirty ? "is-dirty" : ""}`}>
          {isDirty ? "(unsaved)" : ""}
        </span>
        <button
          type="button"
          className={`fme-save ${isDirty ? "is-dirty" : ""}`}
          onClick={save}
          disabled={!isDirty}
        >
          💾 Save
        </button>
      </div>
    </div>
  );
}

export function DetailEmpty({ legend = true, flowKey = "default", nodes, edges, flowId, sourceType }) {
  return (
    <div className="empty-inner">
      <div className="empty-art"><div className="ea-ring r1" /><div className="ea-ring r2" /><div className="ea-ring r3" /><div className="ea-core" /></div>
      <div className="empty-title">No node selected</div>
      <div className="empty-sub">Click a node in the diagram to see details such as its inputs/outputs, dependencies, and run time.</div>
      {legend && <FlowMetaEditor flowKey={flowKey} nodes={nodes} edges={edges} flowId={flowId} sourceType={sourceType} />}
    </div>
  );
}

// Find the line range of the heading block in SKILL.md that corresponds to the selected node
function _findNodeSection(lines, node) {
  if (!node || !node.title) return null;
  // The flow start/end have no corresponding section in the body
  const cap = (node.meta && node.meta.capability) || (node.config && node.config.capability);
  if (cap === "flow.start" || cap === "flow.end") return null;
  const stripMarker = (s) => s.replace(/<!--[\s\S]*?-->/g, "").trim();
  const target = String(node.title).trim();
  const headRe = /^(#{1,6})\s+(.*)$/;
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headRe);
    if (!m) continue;
    const text = stripMarker(m[2]).replace(/\s*→.*$/, "").trim();
    if (text === target || text.includes(target) || target.includes(text)) {
      start = i; level = m[1].length; break;
    }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(headRe);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return { start, end };
}

// 📄 Full-text tab: show the entire source of SKILL.md etc. and highlight the part matching the selected node
export function FlowSourceView({ flowId, sourceType, selectedNode, liveFlow }) {
  const [state, setState] = React.useState({ loading: true });
  const hiRef = React.useRef(null);
  const fileBacked = ["skill", "agent", "hooks", "command"].includes(sourceType || "");
  // Live mode: POST the flow being edited to preview-source and encode it on the fly (debounced)
  const live = !!liveFlow;
  const liveSig = React.useMemo(() => live ? JSON.stringify(liveFlow) : "", [live, liveFlow]);

  React.useEffect(() => {
    if (live) {
      let alive = true;
      const t = setTimeout(() => {
        fetch(`/api/flows/${encodeURIComponent(flowId || "preview")}/preview-source`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flow: liveFlow }),
        })
          .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.detail || "Generation failed")))
          .then(d => { if (alive) setState({ loading: false, live: true, ...d }); })
          .catch(err => { if (alive) setState({ loading: false, error: String(err) }); });
      }, 300);
      return () => { alive = false; clearTimeout(t); };
    }
    if (!flowId || !fileBacked) { setState({ loading: false, unsupported: true }); return; }
    let alive = true;
    setState({ loading: true });
    fetch(`/api/flows/${encodeURIComponent(flowId)}/source`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.detail || "Read failed")))
      .then(d => { if (alive) setState({ loading: false, ...d }); })
      .catch(err => { if (alive) setState({ loading: false, error: String(err) }); });
    return () => { alive = false; };
  }, [flowId, fileBacked, live, liveSig]);

  const lines = React.useMemo(() => (state.content || "").split("\n"), [state.content]);
  const section = React.useMemo(() => _findNodeSection(lines, selectedNode), [lines, selectedNode]);

  React.useEffect(() => {
    if (section && hiRef.current) hiRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [section && section.start, state.content]);

  if (state.loading) return <div className="src-view-msg">Loading…</div>;
  if (state.unsupported) return <div className="src-view-msg">This flow has no source file to display.</div>;
  if (state.error) return <div className="src-view-msg src-view-err">⚠️ {state.error}</div>;

  return (
    <div className="src-view">
      <div className="src-view-head">
        <span className="src-view-path">{state.live ? "● Live preview (editing · unsaved)" : state.path}</span>
        <span className="src-view-meta">{state.lines} lines</span>
      </div>
      {selectedNode && !section && (
        <div className="src-view-note">No heading matching "{selectedNode.title}" was found in the source.</div>
      )}
      <pre className="src-view-pre">
        {lines.map((ln, i) => {
          const inHi = section && i >= section.start && i < section.end;
          const isHeadStart = section && i === section.start;
          return (
            <div
              key={i}
              ref={isHeadStart ? hiRef : null}
              className={`src-view-line ${inHi ? "is-hi" : ""}`}
            >{ln || " "}</div>
          );
        })}
      </pre>
    </div>
  );
}

// Modal that shows the full instruction text of a skill (SKILL.md etc.)
export function SourceTextModal({ flowId, onClose }) {
  const [state, setState] = React.useState({ loading: true });
  React.useEffect(() => {
    let alive = true;
    fetch(`/api/flows/${encodeURIComponent(flowId)}/source`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.detail || "Read failed")))
      .then(d => { if (alive) setState({ loading: false, ...d }); })
      .catch(err => { if (alive) setState({ loading: false, error: String(err) }); });
    return () => { alive = false; };
  }, [flowId]);
  return (
    <div className="src-modal-overlay" onClick={onClose}>
      <div className="src-modal" onClick={e => e.stopPropagation()}>
        <div className="src-modal-head">
          <div>
            <div className="src-modal-title">📄 Full source text</div>
            {state.path && <div className="src-modal-path">{state.path}{state.lines ? ` · ${state.lines} lines` : ""}</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {state.content && (
              <button className="src-modal-copy" onClick={() => navigator.clipboard.writeText(state.content)} title="Copy all">Copy</button>
            )}
            <button className="src-modal-close" onClick={onClose} title="Close">×</button>
          </div>
        </div>
        <div className="src-modal-body">
          {state.loading ? <div className="src-modal-loading">Loading…</div>
            : state.error ? <div className="src-modal-error">⚠️ {state.error}</div>
            : <pre className="src-modal-pre">{state.content}</pre>}
        </div>
      </div>
    </div>
  );
}

export function AddressChip({ flowId, nodeId }) {
  const [copied, setCopied] = useState(false);
  // When there is no flowId (e.g. an unsaved scratch on the planning whiteboard), avoid flow:undefined
  const addr = flowId ? `flow:${flowId}/${nodeId}` : `node:${nodeId}`;
  function copy() {
    navigator.clipboard.writeText(addr).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  return (
    <div className={`addr-row ${copied ? "copied" : ""}`} onClick={copy} title="Click to copy address">
      <span className="addr-icon">#</span>
      <span className="addr-text">{addr}</span>
      <span className="addr-copy">{copied ? "copied!" : "copy"}</span>
    </div>
  );
}

export function PromptEditor({ node, flowId, onSaved, onPatch }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(node.prompt || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const ref = useRef(null);

  useEffect(() => { setVal(node.prompt || ""); setEditing(false); setMsg(""); }, [node.id]);

  async function save() {
    setSaving(true);
    try {
      if (typeof onPatch === "function") onPatch(node.id, { config: { prompt: val } });
      else await apiPatch(`/api/flows/${flowId}/nodes/${node.id}`, { prompt: val });
      setMsg("saved"); setEditing(false);
      if (onSaved) onSaved();
      setTimeout(() => setMsg(""), 2000);
    } catch(e) { setMsg("error"); }
    setSaving(false);
  }

  if (!editing) {
    return (
      <div>
        {val ? (
          <div className="prompt-block" onClick={() => setEditing(true)}>
            <span className="edit-hint">click to edit</span>
            {val}
          </div>
        ) : (
          <div className="prompt-block prompt-empty" onClick={() => setEditing(true)}>
            <span className="edit-hint">click to add</span>
            No prompt defined
          </div>
        )}
        {msg && <span className="save-msg">{msg}</span>}
      </div>
    );
  }

  return (
    <div>
      <textarea ref={ref} className="prompt-block" style={{ width: "100%", resize: "vertical", minHeight: 80, border: "2px solid var(--c-parent)" }}
        value={val} onChange={e => setVal(e.target.value)} autoFocus />
      <button className="save-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      <button className="save-btn" style={{ background: "var(--tx-4)", marginLeft: 4 }} onClick={() => { setVal(node.prompt || ""); setEditing(false); }}>Cancel</button>
      {msg && <span className="save-msg">{msg}</span>}
    </div>
  );
}

export function DescEditor({ node, flowId, onSaved, onPatch }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(node.desc || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { setVal(node.desc || ""); setEditing(false); setMsg(""); }, [node.id]);

  async function save() {
    setSaving(true);
    try {
      if (typeof onPatch === "function") onPatch(node.id, { desc: val });
      else await apiPatch(`/api/flows/${flowId}/nodes/${node.id}`, { desc: val });
      setMsg("saved"); setEditing(false);
      if (onSaved) onSaved();
      setTimeout(() => setMsg(""), 2000);
    } catch(e) { setMsg("error"); }
    setSaving(false);
  }

  if (!editing) {
    return (
      <div>
        <p className="d-desc editable-desc" onClick={() => setEditing(true)} title="Click to edit">
          {val || <em className="tx-4">No description</em>}
          <span className="edit-hint">click to edit</span>
        </p>
        {msg && <span className="save-msg">{msg}</span>}
      </div>
    );
  }

  return (
    <div>
      <textarea className="prompt-block" style={{ width: "100%", resize: "vertical", minHeight: 60, border: "2px solid var(--accent)" }}
        value={val} onChange={e => setVal(e.target.value)} autoFocus />
      <button className="save-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      <button className="save-btn" style={{ background: "var(--tx-4)", marginLeft: 4 }} onClick={() => { setVal(node.desc || ""); setEditing(false); }}>Cancel</button>
      {msg && <span className="save-msg">{msg}</span>}
    </div>
  );
}

export function ConfigEditor({ node, flowId, onSaved, onPatch }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(JSON.stringify(node.config, null, 2));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { setVal(JSON.stringify(node.config, null, 2)); setEditing(false); setMsg(""); }, [node.id]);

  async function save() {
    setSaving(true);
    try {
      const parsed = JSON.parse(val);
      if (typeof onPatch === "function") onPatch(node.id, { config: parsed });
      else await apiPatch(`/api/flows/${flowId}/nodes/${node.id}`, { config: parsed });
      setMsg("saved"); setEditing(false);
      if (onSaved) onSaved();
      setTimeout(() => setMsg(""), 2000);
    } catch(e) { setMsg(e instanceof SyntaxError ? "invalid JSON" : "error"); }
    setSaving(false);
  }

  if (!editing) {
    return (
      <div>
        <div className="config-grid editable-config" onClick={() => setEditing(true)} title="Click to edit">
          {Object.entries(node.config).map(([k, v]) => (
            <React.Fragment key={k}>
              <span className="config-key">{k}:</span>
              <span className="config-val">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
            </React.Fragment>
          ))}
          <span className="edit-hint">click to edit</span>
        </div>
        {msg && <span className="save-msg">{msg}</span>}
      </div>
    );
  }

  return (
    <div>
      <textarea className="prompt-block mono" style={{ width: "100%", resize: "vertical", minHeight: 80, border: "2px solid var(--c-mcp)", fontSize: 12 }}
        value={val} onChange={e => setVal(e.target.value)} autoFocus spellCheck={false} />
      <button className="save-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      <button className="save-btn" style={{ background: "var(--tx-4)", marginLeft: 4 }} onClick={() => { setVal(JSON.stringify(node.config, null, 2)); setEditing(false); }}>Cancel</button>
      {msg && <span className="save-msg">{msg}</span>}
    </div>
  );
}

export function ConfigView({ config }) {
  if (!config) return <div className="d-empty">No config</div>;
  return (
    <div className="config-grid">
      {Object.entries(config).map(([k, v]) => (
        <React.Fragment key={k}>
          <span className="config-key">{k}:</span>
          <span className="config-val">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

const NODE_TYPE_FIELDS = {
  hook: [
    { key: "hook_type", label: "Timing", desc: "When the hook runs. Choose at which stage to intervene, such as PreToolUse (before a tool runs) or PostToolUse (after a tool runs).",
      options: ["PreToolUse", "PostToolUse", "PreSubagent", "PostSubagent", "Notification"] },
    { key: "matcher", label: "Target pattern", desc: "A pattern that narrows down what this hook reacts to. Example: Skill:x-autopilot fires only when the x-autopilot skill runs.", edit: "text" },
    { key: "script", label: "Script", desc: "The script file invoked when the hook runs. Put validation, preprocessing, logging, and similar logic here.", edit: "text" },
    { key: "outputs_to", label: "Output target", desc: "Where to write the results. You can specify multiple destinations such as log files or external services.", edit: "text" },
  ],
  subagent: [
    { key: "agent_type", label: "Agent type", desc: "The type of subagent to launch. Pick a specialized agent for the task, such as Explore (exploration only) or general-purpose.",
      options: ["Explore", "general-purpose", "code", "plan", "claude-code-guide", "plugin-dev:agent-creator"] },
    { key: "model", label: "AI model", desc: "The AI model the subagent uses. Choose from sonnet (fast, balanced), opus (high accuracy), or haiku (lightweight, fast).",
      options: ["sonnet", "opus", "haiku"] },
    { key: "tools", label: "Tools", desc: "The list of tools the subagent can use, such as Bash (run commands), Read (read files), and Grep (search).",
      multi: ["Bash", "Read", "Write", "Edit", "Grep", "Glob", "WebFetch", "WebSearch"] },
  ],
  mcp: [
    { key: "mcp_server", label: "Service", desc: "The external service to connect to over MCP (Model Context Protocol). You can integrate with services like Canva, Slack, and GitHub.",
      options: ["canva", "xmcp", "gmail-mcp", "notion-mcp", "slack-mcp", "github-mcp"] },
    { key: "tool", label: "Tool", desc: "The specific operation to run on the connected service, e.g. search-designs (search designs) or post_tweet (post a tweet).", edit: "text" },
    { key: "params", label: "Parameters", desc: "Extra settings passed when running the tool, such as search conditions or filters that fine-tune what runs.", edit: "text" },
    { key: "retries", label: "Retries", desc: "How many times to retry automatically on failure. Handles transient errors from external services.",
      options: ["1", "2", "3", "5", "10"] },
  ],
  code: [
    { key: "tool", label: "Tool", desc: "The kind of tool used to run code, such as Write (write a file), Bash (run a command), or Read (read a file).",
      options: ["Write", "Bash", "Read", "Edit"] },
    { key: "command", label: "Command", desc: "The shell command to run. Specify this when using the Bash tool.", edit: "text" },
    { key: "path", label: "File path", desc: "The path of the file to operate on. May contain template variables (e.g. {date}).", edit: "text" },
    { key: "path_template", label: "Path template", desc: "A template for generating file paths dynamically. Variables like {date} and {id} are substituted at run time.", edit: "text" },
  ],
  parent: [],
  user: [],
  decision: [],
};

/* Global info tooltip state — only one open at a time */
let _closeActiveTooltip = null;

export function FieldInfoButton({ desc }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const tipRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    _closeActiveTooltip = () => setOpen(false);
    function handleClick(e) {
      if (ref.current?.contains(e.target)) return;
      if (tipRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick, true);
    return () => { document.removeEventListener("mousedown", handleClick, true); if (_closeActiveTooltip === (() => setOpen(false))) _closeActiveTooltip = null; };
  }, [open]);

  function handleClick(e) {
    e.stopPropagation();
    if (!open) {
      if (_closeActiveTooltip) { _closeActiveTooltip(); _closeActiveTooltip = null; }
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const tipW = 240;
        let left = rect.right - tipW;
        if (left < 8) left = 8;
        if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
        setPos({ top: rect.bottom + 6, left });
      }
    }
    setOpen(o => !o);
  }

  return (
    <span className="ne-cfg-info" ref={ref} onClick={handleClick}>
      i
      {open && <div className="ne-cfg-tooltip" ref={tipRef} style={{ top: pos.top, left: pos.left }}>{desc}</div>}
    </span>
  );
}

export function ConfigFieldRow({ field, value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [multiDraft, setMultiDraft] = useState(Array.isArray(value) ? value : []);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value); setMultiDraft(Array.isArray(value) ? value : []); setEditing(false); }, [value]);

  const isSelect = !!field.options;
  const isMulti = !!field.multi;
  const isText = field.edit === "text";
  const canEdit = isSelect || isMulti || isText;

  const display = Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value ?? "");

  async function save(newVal) {
    setSaving(true);
    await onSave(field.key, newVal);
    setSaving(false);
    setEditing(false);
  }

  function handleSelectChange(e) {
    save(e.target.value);
  }

  function toggleMultiChip(chip) {
    setMultiDraft(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]);
  }

  if (editing && isSelect) {
    return (
      <div className="ne-cfg-row">
        <span className="ne-cfg-key">{field.label}</span>
        <select className="ne-cfg-select" value={draft ?? ""} onChange={handleSelectChange} autoFocus disabled={saving}>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <FieldInfoButton desc={field.desc} />
      </div>
    );
  }

  if (editing && isMulti) {
    return (
      <div className="ne-cfg-row" style={{ flexWrap: "wrap" }}>
        <span className="ne-cfg-key" style={{ width: "100%", minWidth: "100%", marginBottom: 4 }}>{field.label}</span>
        <div className="ne-cfg-multi">
          {field.multi.map(chip => (
            <span key={chip} className={`ne-cfg-chip ${multiDraft.includes(chip) ? "is-on" : ""}`}
              onClick={() => toggleMultiChip(chip)}>{chip}</span>
          ))}
        </div>
        <div className="ne-cfg-save-row" style={{ width: "100%" }}>
          <button className="ne-cfg-save-btn is-cancel" onClick={() => { setMultiDraft(Array.isArray(value) ? value : []); setEditing(false); }}>Cancel</button>
          <button className="ne-cfg-save-btn is-ok" onClick={() => save(multiDraft)} disabled={saving}>{saving ? "…" : "Save"}</button>
        </div>
        <FieldInfoButton desc={field.desc} />
      </div>
    );
  }

  if (editing && isText) {
    return (
      <div className="ne-cfg-row">
        <span className="ne-cfg-key">{field.label}</span>
        <input className="ne-cfg-input" value={draft ?? ""} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(draft); if (e.key === "Escape") setEditing(false); }}
          autoFocus disabled={saving} />
        <div className="ne-cfg-save-row">
          <button className="ne-cfg-save-btn is-cancel" onClick={() => { setDraft(value); setEditing(false); }}>✕</button>
          <button className="ne-cfg-save-btn is-ok" onClick={() => save(draft)} disabled={saving}>✓</button>
        </div>
        <FieldInfoButton desc={field.desc} />
      </div>
    );
  }

  return (
    <div className="ne-cfg-row">
      <span className="ne-cfg-key">{field.label}</span>
      <span className={`ne-cfg-val ${!value ? "is-empty" : ""} ${canEdit ? "is-editable" : ""}`}
        onClick={canEdit ? () => setEditing(true) : undefined}>
        {display || "Not set"}
      </span>
      <FieldInfoButton desc={field.desc} />
    </div>
  );
}

export function NodeConfigFields({ node, flowId, onSaved, onPatch }) {
  const fields = NODE_TYPE_FIELDS[node.type];
  if (!fields || fields.length === 0) return null;
  const cfg = node.config || {};
  const activeFields = fields.filter(f => cfg[f.key] !== undefined && cfg[f.key] !== null);
  if (activeFields.length === 0) return null;

  async function handleSave(key, newVal) {
    const newConfig = { ...cfg, [key]: newVal };
    await apiPatch(`/api/flows/${flowId}/nodes/${node.id}`, { config: newConfig });
    if (onSaved) onSaved();
  }

  return (
    <div className="ne-section">
      <div className="ne-section-label">Settings</div>
      <div className="ne-cfg-list">
        {activeFields.map(f => (
          <ConfigFieldRow key={f.key} field={f} value={cfg[f.key]} onSave={handleSave} />
        ))}
      </div>
    </div>
  );
}

function nodeTypeExplain(node) {
  // Prefer the master TYPE_SPECS from shared/flow-elements.js (finalized in 8093 → shared across all environments)
  const specs = (window.FI && window.FI.TYPE_SPECS) || {};
  const spec = specs[node.type];
  if (spec && spec.base) return spec.base;
  // Fallback (for types not defined in TYPE_SPECS)
  switch (node.type) {
    case "parent":   return "The parent node that oversees the whole workflow. It controls the overall flow and manages the execution order of each step.";
    case "user":     return "A step that waits for input or a decision from the user. Used when human confirmation or feedback is required.";
    case "decision": return "A step that branches the processing based on a condition. The next route taken depends on the outcome.";
    default:         return "This step performs work as part of the workflow.";
  }
}

function nodeTypeSteps(node) {
  // Prefer the master TYPE_SPECS from shared/flow-elements.js
  // Swapped dynamically based on meta.tool / meta.action / meta.service / meta.handler_type / meta.runtime
  const specs = (window.FI && window.FI.TYPE_SPECS) || {};
  const spec = specs[node.type];
  if (spec) {
    const meta = node.meta || node.config || {};
    // Dynamic sub-type key → lookup from the stepsBy* tables
    if (meta.tool && spec.stepsByTool && spec.stepsByTool[meta.tool]) return spec.stepsByTool[meta.tool];
    if (meta.action && spec.stepsByAction && spec.stepsByAction[meta.action]) return spec.stepsByAction[meta.action];
    if (meta.service && spec.stepsByService && spec.stepsByService[meta.service]) return spec.stepsByService[meta.service];
    if (meta.runtime && spec.stepsByRuntime && spec.stepsByRuntime[meta.runtime]) return spec.stepsByRuntime[meta.runtime];
    if (Array.isArray(spec.steps) && spec.steps.length > 0) return spec.steps;
  }
  // Fallback
  switch (node.type) {
    case "parent":   return ["Initialize the whole workflow", "Run each step in order", "Aggregate the overall result"];
    case "user":     return ["Prompt the user for input", "Receive the input", "Pass it to the next step"];
    case "decision": return ["Evaluate the condition", "Decide the branch", "Proceed down the matching route"];
    default:         return ["Run the processing", "Output the result"];
  }
}

// ── Pillar 2: preventing edit state from being lost ──────────────────────────
// A React-external cache that preserves edit state across node switches and reloads.
//  __nodeEditCache: stashes { localOverride, aiInstruction } per flowId::nodeId.
//  __aiFieldJobs  : holds in-progress / completed AI generation jobs per flowId::nodeId.
//                   The fetch runs independently of whether the component is mounted, and on
//                   completion writes its result to the registry. A mounted component is notified via onUpdate.
window.__nodeEditCache = window.__nodeEditCache || new Map();
window.__aiFieldJobs = window.__aiFieldJobs || new Map();
function nodeEditKey(flowId, nodeId) { return `${flowId || "_"}::${nodeId || "_"}`; }

export function DetailBody({ node, workflow, onJump, onSaved, viewMode, onPatch }) {
  const t = window.NODE_TYPES[node.type];
  const inLinks = workflow.edges.filter(e => e.to === node.id);
  const outLinks = workflow.edges.filter(e => e.from === node.id);
  const nodesById = Object.fromEntries(workflow.nodes.map(n => [n.id, n]));
  // Pillar 2: key for the edit-state cache (flowId::nodeId)
  const editKey = nodeEditKey(workflow?.id, node.id);
  // Initial value comes from the cache → otherwise restored from node.meta (meta takes effect on reload)
  const initFromCache = () => {
    const c = window.__nodeEditCache.get(editKey);
    return {
      localOverride: (c && c.localOverride) ? c.localOverride : {},
      aiInstruction: (c && typeof c.aiInstruction === "string")
        ? c.aiInstruction : (node.meta?.ai_instruction || ""),
    };
  };
  const init0 = initFromCache();
  // For the settings tab: advanced collapse + secret reveal state
  const [advancedOpen, setAdvancedOpen] = useState({});
  const [revealedSecrets, setRevealedSecrets] = useState({});
  // Temporarily hold value changes in the settings tab (optimistic UI) — preserved across node switches and reloads
  const [localOverride, setLocalOverride] = useState(init0.localOverride);
  // Overview tab: the result of having the AI explain (generated via the Claude Code CLI)
  const [aiExplain, setAiExplain] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  // capabilities (MCP): index of the capability currently expanded via ⓘ
  const [openCap, setOpenCap] = useState(null);
  // Settings tab: the {fieldKey, optionValue} currently expanded via ⓘ on an options button
  const [openOptInfo, setOpenOptInfo] = useState(null);
  // Settings tab: instruction and state for AI-generated settings (node-fields)
  const [aiFieldInstruction, setAiFieldInstruction] = useState(init0.aiInstruction);
  const [aiFieldGenerating, setAiFieldGenerating] = useState(false);
  const [aiFieldError, setAiFieldError] = useState("");
  // Tooltip shown on ⓘ hover: { label, text, x, y } or null
  const [tipState, setTipState] = useState(null);
  // A ref that always holds the latest edit state for writing back to the cache (used when stashing on unmount/switch)
  const editStateRef = useRef({ localOverride, aiFieldInstruction, editKey });
  editStateRef.current = { localOverride, aiFieldInstruction, editKey };
  const showTip = (e, label, text) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTipState({ label, text, x: r.right + 8, y: r.top + r.height / 2 });
  };
  const hideTip = () => setTipState(null);
  // The key of the node currently displayed (used to detect switches). Initialized with editKey on first render.
  const prevKeyRef = useRef(editKey);
  // Node switch: reset only the UI state that is safe to discard; stash → restore the edit/generation state
  useEffect(() => {
    const prevKey = prevKeyRef.current;
    if (prevKey !== editKey) {
      // 1. Stash the edit state of the node we are leaving into the cache
      window.__nodeEditCache.set(prevKey, {
        localOverride: editStateRef.current.localOverride,
        aiInstruction: editStateRef.current.aiFieldInstruction,
      });
      // 2. Reset the UI state that is safe to discard
      setAdvancedOpen({}); setRevealedSecrets({});
      setAiExplain(""); setAiLoading(false);
      setOpenCap(null); setOpenOptInfo(null); setTipState(null);
      setAiFieldError("");
      // 3. Restore the edit state of the node we are entering from the cache (or meta if absent)
      const restored = initFromCache();
      setLocalOverride(restored.localOverride);
      setAiFieldInstruction(restored.aiInstruction);
      prevKeyRef.current = editKey;
    }
    // 4. Restore the AI job state from the registry (re-show ⏳ / result when we come back)
    const job = window.__aiFieldJobs.get(editKey);
    if (job && job.status === "running") {
      setAiFieldGenerating(true); setAiFieldError("");
    } else {
      setAiFieldGenerating(false);
      if (job && job.status === "done" && job.result && !job.consumed) {
        job.consumed = true;
        setLocalOverride(o => ({ ...o, ...job.result }));
      } else if (job && job.status === "error" && !job.consumed) {
        job.consumed = true;
        setAiFieldError(job.error || "AI generation failed");
      }
    }
    // 5. Subscribe to completion of the job for this editKey — if mounted, reflect the result/error immediately.
    //    The fetch itself runs independently of the component and calls here on completion.
    const sub = {
      onDone(result) {
        setAiFieldGenerating(false);
        setLocalOverride(o => ({ ...o, ...result }));
        const j = window.__aiFieldJobs.get(editKey);
        if (j) j.consumed = true;
      },
      onError(msg) {
        setAiFieldGenerating(false);
        setAiFieldError(msg || "AI generation failed");
        const j = window.__aiFieldJobs.get(editKey);
        if (j) j.consumed = true;
      },
    };
    if (!window.__aiFieldSubs) window.__aiFieldSubs = new Map();
    window.__aiFieldSubs.set(editKey, sub);
    return () => {
      // On unmount/switch: stash the current node's edit state and unsubscribe
      window.__nodeEditCache.set(editKey, {
        localOverride: editStateRef.current.localOverride,
        aiInstruction: editStateRef.current.aiFieldInstruction,
      });
      if (window.__aiFieldSubs && window.__aiFieldSubs.get(editKey) === sub) {
        window.__aiFieldSubs.delete(editKey);
      }
    };
  }, [editKey]);

  // "Let AI explain": send all of the node's info to /api/explain and get back an explanation
  async function handleAiExplain() {
    setAiLoading(true);
    try {
      const payload = {
        type: node.type,
        title: node.title || "",
        subtitle: node.subtitle || "",
        desc: node.desc || node.summary || "",
        cat: node.cat || workflow.title || "",
        meta: node.meta || node.config || {},
      };
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setAiExplain(data.explain || "");
    } catch (e) {
      setAiExplain(`(AI generation error: ${e.message})`);
    }
    setAiLoading(false);
  }

  const sharedTop = (
    <>
      {node.summary && (
        <div className="node-summary">{node.summary}</div>
      )}
      {node.io_desc && node.io_desc.length > 0 && (
        <div className="node-io-list">
          {node.io_desc.map((io, i) => (
            <div key={i} className="node-io-item">
              <span className={`node-io-dir ${io.dir === "in" ? "is-in" : "is-out"}`}>{io.dir === "in" ? "IN" : "OUT"}</span>
              <span className="node-io-name">{io.name}</span>
              <span className="node-io-desc">{io.desc}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (viewMode === "simple") {
    return (
      <>
        {sharedTop}
        <div className="ne-section">
          <div className="ne-section-label">What this step does</div>
          <div className="ne-explain">{nodeTypeExplain(node)}</div>
          {aiExplain && (
            <div className="ne-ai-explain">
              <div className="ne-ai-explain-label">✨ AI explanation (specific to this node)</div>
              <div className="ne-ai-explain-text">{aiExplain}</div>
            </div>
          )}
          <button
            type="button"
            className={`ne-ai-btn ${aiLoading ? "loading" : ""}`}
            onClick={handleAiExplain}
            disabled={aiLoading}
            title="Have the AI analyze this node's settings and generate a node-specific explanation"
          >
            {aiLoading ? "⏳ Generating..." : (aiExplain ? "🔄 Generate again" : "✨ Let AI explain")}
          </button>
        </div>
        <NodeConfigFields node={node} flowId={workflow.id} onSaved={onSaved} onPatch={onPatch} />
        <div className="ne-section">
          <div className="ne-section-label">How it works</div>
          <div className="ne-step-list">
            {nodeTypeSteps(node).map((step, i) => (
              <div key={i} className="ne-step">
                <span className="ne-step-num">{i + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* flowGuide — "What to decide when placing this in a flow"
            Priority: node.meta.flowGuide → node.config.flowGuide → TYPE_SPECS[type].flowGuide (per-type template) */}
        {(() => {
          const typeSpec = (window.FI && window.FI.TYPE_SPECS && window.FI.TYPE_SPECS[node.type]) || null;
          const fg = (node.meta && node.meta.flowGuide)
                  || (node.config && node.config.flowGuide)
                  || (typeSpec && typeSpec.flowGuide)
                  || null;
          if (!fg) return null;
          const tColor = (window.NODE_TYPES && window.NODE_TYPES[node.type] && window.NODE_TYPES[node.type].color) || "var(--accent)";
          const rows = [
            { num: "①", label: "What to do", val: fg.what },
            { num: "②", label: "Target",     val: fg.target },
            { num: "③", label: "Details",    val: fg.content },
          ].filter(r => r.val);
          if (rows.length === 0 && !fg.summary) return null;
          return (
            <div className="ne-section">
              <div className="ne-section-label">What to decide when placing this in a flow</div>
              <div className="ne-flowguide" style={{ borderColor: tColor }}>
                {rows.map(r => (
                  <div key={r.num} className="ne-fg-row">
                    <span className="ne-fg-num" style={{ color: tColor }}>{r.num} {r.label}</span>
                    <span className="ne-fg-val">{r.val}</span>
                  </div>
                ))}
                {fg.summary && (
                  <div className="ne-fg-summary">{fg.summary}</div>
                )}
              </div>
            </div>
          );
        })()}

        {/* capabilities — the main features available on this server (MCP nodes only) */}
        {node.type === "mcp" && (() => {
          const caps = (node.meta && Array.isArray(node.meta.capabilities) && node.meta.capabilities)
                   || (node.config && Array.isArray(node.config.capabilities) && node.config.capabilities)
                   || null;
          if (!caps || caps.length === 0) return null;
          const tColor = (window.NODE_TYPES && window.NODE_TYPES.mcp && window.NODE_TYPES.mcp.color) || "#15803d";
          return (
            <div className="ne-section">
              <div className="ne-section-label">Main features available on this server</div>
              <div className="ne-caps">
                {caps.map((c, i) => {
                  const isOpen = openCap === i;
                  const hasFriendly = !!c.friendly;
                  return (
                    <div key={i} className={`ne-cap ${isOpen ? "is-open" : ""}`}>
                      <div className="ne-cap-row">
                        <span className="ne-cap-name" style={{ color: tColor }}>{c.name}</span>
                        <span className="ne-cap-desc">{c.desc}</span>
                        {hasFriendly && (
                          <button
                            type="button"
                            className={`ne-cap-btn ${isOpen ? "on" : ""}`}
                            onClick={() => setOpenCap(isOpen ? null : i)}
                            title={isOpen ? "Close" : "See a detailed explanation"}
                          >{isOpen ? "×" : "i"}</button>
                        )}
                      </div>
                      {isOpen && hasFriendly && (
                        <div className="ne-cap-friendly">{c.friendly}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {node.desc && (
          <div className="ne-section">
            <div className="ne-section-label">Notes</div>
            <div className="ne-explain">{node.desc}</div>
          </div>
        )}
        {inLinks.length > 0 && (
          <div className="ne-section">
            <div className="ne-section-label">Previous steps ({inLinks.length})</div>
            {inLinks.map((l, i) => {
              const n = nodesById[l.from];
              return (
                <button key={i} className="ne-dep-row" onClick={() => onJump(n.id)}>
                  <span className="ne-dep-arrow">←</span>
                  <span className="ne-dep-name">{n.title}</span>
                  {n.summary && <span className="ne-dep-summary">{n.summary}</span>}
                </button>
              );
            })}
          </div>
        )}
        {outLinks.length > 0 && (
          <div className="ne-section">
            <div className="ne-section-label">Next steps ({outLinks.length})</div>
            {outLinks.map((l, i) => {
              const n = nodesById[l.to];
              return (
                <button key={i} className="ne-dep-row" onClick={() => onJump(n.id)}>
                  <span className="ne-dep-arrow">→</span>
                  <span className="ne-dep-name">{n.title}</span>
                  {l.label && <span className="ne-dep-summary">{l.label}</span>}
                  {!l.label && n.summary && <span className="ne-dep-summary">{n.summary}</span>}
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  if (viewMode === "settings") {
    // References the master TYPE_SPECS definition (shared/flow-elements.js)
    const specs = (window.FI && window.FI.TYPE_SPECS) || {};
    const baseSpec = specs[node.type];
    // Three layers: meta (whiteboard style), config (legacy 8092), and localOverride (provisional UI changes)
    // localOverride is for optimistic UI updates — changes are reflected immediately while PATCH /api/flows/{id}/nodes/{nid} runs in the background.
    // Roll back only on failure. When there is no flow_id (e.g. whiteboard mode), only localOverride is used.
    const baseMeta = (node.meta && Object.keys(node.meta).length) ? node.meta : (node.config || {});
    const meta = { ...baseMeta, ...localOverride };
    const usesMetaShape = !!(node.meta && Object.keys(node.meta).length);

    // Reflect value changes into localOverride immediately (optimistic UI) → send PATCH in the background → roll back on failure
    async function handleFieldSave(key, newVal) {
      const prev = key in localOverride ? localOverride[key] : undefined;
      const hadPrev = key in localOverride;
      // 1. Reflect into the UI optimistically
      setLocalOverride(o => ({ ...o, [key]: newVal }));

      // 1b. Write back to the board (when onPatch is provided, e.g. in Plan Workspace).
      //     This works even without a flowId, so it shows up in the SKILL.md full-text preview, localStorage, and undo.
      if (typeof onPatch === "function") onPatch(node.id, { config: { [key]: newVal } });

      // 2. Persist on the server (only when flow_id / node.id are present)
      if (!workflow?.id || !node?.id) return;
      const nextBag = { ...baseMeta, ...localOverride, [key]: newVal };
      const body = usesMetaShape ? { meta: nextBag } : { config: nextBag };
      try {
        const res = await fetch(`/api/flows/${encodeURIComponent(workflow.id)}/nodes/${encodeURIComponent(node.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${detail.slice(0, 120)}`);
        }
        if (typeof onSaved === "function") onSaved();
      } catch (e) {
        // 3. On failure: revert just that one key
        setLocalOverride(o => {
          const copy = { ...o };
          if (hadPrev) copy[key] = prev;
          else delete copy[key];
          return copy;
        });
        console.warn(`Save failed (${key}):`, e.message);
        if (typeof showSettingsSaveError === "function") {
          showSettingsSaveError(key, e.message);
        }
      }
    }

    // Dynamic swap: tool / action / service / runtime / source / handler_type
    const spec = (() => {
      if (!baseSpec || !Array.isArray(baseSpec.fields)) return baseSpec;
      const merged = { ...baseSpec };
      const tool = meta.tool;
      if (tool && baseSpec.fieldsByTool && baseSpec.fieldsByTool[tool]) {
        merged.fields = [ baseSpec.fields[0], ...baseSpec.fieldsByTool[tool] ];
      }
      const action = meta.action;
      if (action && baseSpec.fieldsByAction && baseSpec.fieldsByAction[action]) {
        merged.fields = [ ...baseSpec.fields, ...baseSpec.fieldsByAction[action] ];
      }
      const service = meta.service;
      if (service && baseSpec.fieldsByService && baseSpec.fieldsByService[service]) {
        merged.fields = [ baseSpec.fields[0], ...baseSpec.fieldsByService[service] ];
      }
      const runtime = meta.runtime;
      if (runtime && baseSpec.fieldsByRuntime && baseSpec.fieldsByRuntime[runtime]) {
        merged.fields = [ baseSpec.fields[0], ...baseSpec.fieldsByRuntime[runtime] ];
      }
      const source = meta.source;
      if (source && baseSpec.fieldsBySource && baseSpec.fieldsBySource[source]) {
        merged.fields = [ baseSpec.fields[0], ...baseSpec.fieldsBySource[source] ];
      }
      // hook variants: per handler_type + blockableOnly filter
      if (node.type === "hook") {
        const handler = meta.handler_type;
        const eventName = meta.event || node.id;
        const isBlockable = Array.isArray(baseSpec.blockableEvents) && baseSpec.blockableEvents.includes(eventName);
        let baseFields = merged.fields.filter(f => !f.blockableOnly || isBlockable);
        if (handler && baseSpec.fieldsByHandler && baseSpec.fieldsByHandler[handler]) {
          const handlerExtra = baseSpec.fieldsByHandler[handler];
          const out = [];
          for (const f of baseFields) {
            out.push(f);
            if (f.key === "handler_type") out.push(...handlerExtra);
          }
          baseFields = out;
        }
        merged.fields = baseFields;
      }
      return merged;
    })();

    // Render each field
    const renderField = (f) => {
      const val = meta[f.key];
      const hasValue = val !== undefined && val !== null && val !== "" && !(Array.isArray(val) && val.length === 0);
      // Show the required marker using the same criteria as validateFlowForSkill:
      //   red ● = truly required, blocks skill generation / gray ○ = conditional (only when authoring, or an env-backed secret) and may be empty
      const hardRequired = f.required && !f.authoringOnly && !f.secret;
      const softRequired = f.required && (f.authoringOnly || f.secret);
      const softTitle = f.authoringOnly
        ? "Required only when authoring/defining this element (may be empty when using it as a flow step)"
        : "A secret value. Normally passed from an environment variable (envKey), so this can be left empty";
      return (
        <div key={f.key} className="ne-st-field">
          <div className="ne-st-label">
            <span>{f.label || f.key}</span>
            {hardRequired && <span className="ne-st-required" title="Required field">●</span>}
            {softRequired && <span className="ne-st-required is-soft" title={softTitle}>○</span>}
          </div>
          {f.options ? (
            // Single select: click to switch the value (saves). If f.info[o] exists, hovering ⓘ shows a detail tooltip
            <div className="ne-st-badges">
              {f.options.map(o => {
                const hasInfo = !!(f.info && f.info[o]);
                return (
                  <span key={o} className={`ne-st-badge-wrap ${val === o ? "is-on" : ""}`}>
                    <button
                      type="button"
                      className={`ne-st-badge ${val === o ? "on" : ""} ${hasInfo ? "has-info" : ""}`}
                      onClick={() => handleFieldSave(f.key, o)}
                      title={`Change ${f.label || f.key} to "${o}"`}
                    >{o}</button>
                    {hasInfo && (
                      <span
                        className="ne-st-opt-info"
                        onMouseEnter={(e) => showTip(e, `${f.label || f.key}: ${o}`, f.info[o])}
                        onMouseLeave={hideTip}
                        role="img" aria-label={`Details for ${o}`}
                      >i</span>
                    )}
                  </span>
                );
              })}
            </div>
          ) : f.multi ? (
            (() => {
              const arr = Array.isArray(val) ? val : (val ? [val] : []);
              // If f.multi is an array, it is a candidate list → multi-select like a checklist
              // If f.multi is true (boolean), only display the existing value
              const choices = Array.isArray(f.multi) ? f.multi : (Array.isArray(f.choices) ? f.choices : null);
              if (choices && choices.length > 0) {
                return (
                  <div className="ne-st-badges">
                    {choices.map(c => {
                      const isOn = arr.includes(c);
                      const hasInfo = !!(f.info && f.info[c]);
                      return (
                        <span key={c} className={`ne-st-badge-wrap ${isOn ? "is-on" : ""}`}>
                          <button
                            type="button"
                            className={`ne-st-badge ${isOn ? "on" : ""} ${hasInfo ? "has-info" : ""}`}
                            onClick={() => {
                              const next = isOn ? arr.filter(x => x !== c) : [...arr, c];
                              handleFieldSave(f.key, next);
                            }}
                            title={`${f.label || f.key}: ${isOn ? "remove" : "add"} ${c}`}
                          >{isOn ? "✓ " : ""}{c}</button>
                          {hasInfo && (
                            <span
                              className="ne-st-opt-info"
                              onMouseEnter={(e) => showTip(e, `${f.label || f.key}: ${c}`, f.info[c])}
                              onMouseLeave={hideTip}
                              role="img" aria-label={`Details for ${c}`}
                            >i</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                );
              }
              if (arr.length === 0) return <div className="ne-st-val is-empty">Not set</div>;
              return (
                <div className="ne-st-badges">
                  {arr.map(o => <span key={o} className="ne-st-tag">{o}</span>)}
                </div>
              );
            })()
          ) : f.secret ? (
            (() => {
              const revealed = !!revealedSecrets[f.key];
              const masked = hasValue ? "●".repeat(Math.min(String(val).length, 16)) : "";
              return (
                <>
                  <div className="ne-st-secret-row">
                    <div className="ne-st-secret-val">
                      {hasValue ? (revealed ? String(val) : masked) : <span style={{color:"var(--tx-4)",fontStyle:"italic"}}>Not set</span>}
                    </div>
                    {hasValue && (
                      <button
                        type="button"
                        className="ne-st-secret-btn"
                        onClick={() => setRevealedSecrets(s => ({ ...s, [f.key]: !s[f.key] }))}
                        title={revealed ? "Mask again" : "Reveal value"}
                      >{revealed ? "🔒" : "👁"}</button>
                    )}
                  </div>
                  <div className="ne-st-secret-note">
                    <span style={{color:"#16a34a"}}>🔒</span>
                    <span>In the real implementation, store this in <code style={{fontFamily:'"Geist Mono",monospace',background:"var(--bg-3)",padding:"1px 4px",borderRadius:3}}>.env</code>{f.envKey ? ` (${f.envKey})` : ""}</span>
                  </div>
                </>
              );
            })()
          ) : f.long ? (
            // Long-text textarea: saves on blur (loss of focus)
            <textarea
              key={`${node.id}-${f.key}-${String(val)}`}
              className="ne-st-long-input"
              defaultValue={hasValue ? String(val) : ""}
              placeholder="Not set"
              onBlur={(e) => {
                const newVal = e.target.value;
                if (newVal !== (val == null ? "" : String(val))) handleFieldSave(f.key, newVal);
              }}
              rows={Math.min(8, Math.max(3, (String(val || "").match(/\n/g) || []).length + 2))}
            />
          ) : (
            // Short-text input: saves on blur. Object values are display-only (edit in the Dev tab)
            (typeof val === "object" && val !== null) ? (
              <div className={`ne-st-val ${!hasValue ? "is-empty" : ""}`}>{JSON.stringify(val)}</div>
            ) : (
              <input
                key={`${node.id}-${f.key}-${String(val)}`}
                type="text"
                className="ne-st-text-input"
                defaultValue={hasValue ? String(val) : ""}
                placeholder="Not set"
                onBlur={(e) => {
                  const newVal = e.target.value;
                  if (newVal !== (val == null ? "" : String(val))) handleFieldSave(f.key, newVal);
                }}
              />
            )
          )}
          {f.desc && <div className="ne-st-desc">{f.desc}</div>}
        </div>
      );
    };

    // Shared by the Settings/Dev tabs: explanation + previous/next node list (fallback so the tab doesn't feel "empty")
    const renderContextBlock = (variant) => (
      <>
        {(node.desc || node.subtitle || node.summary) && (
          <div className="ne-section">
            <div className="ne-section-label">Description</div>
            <div className="ne-explain">{node.desc || node.subtitle || node.summary}</div>
          </div>
        )}
        {inLinks.length > 0 && (
          <div className="ne-section">
            <div className="ne-section-label">Previous steps ({inLinks.length})</div>
            {inLinks.map((l, i) => {
              const n = nodesById[l.from];
              if (!n) return null;
              return (
                <button key={i} className="ne-dep-row" onClick={() => onJump(n.id)}>
                  <span className="ne-dep-arrow">←</span>
                  <span className="ne-dep-name">{n.title}</span>
                  {n.summary && <span className="ne-dep-summary">{n.summary}</span>}
                </button>
              );
            })}
          </div>
        )}
        {outLinks.length > 0 && (
          <div className="ne-section">
            <div className="ne-section-label">Next steps ({outLinks.length})</div>
            {outLinks.map((l, i) => {
              const n = nodesById[l.to];
              if (!n) return null;
              return (
                <button key={i} className="ne-dep-row" onClick={() => onJump(n.id)}>
                  <span className="ne-dep-arrow">→</span>
                  <span className="ne-dep-name">{n.title}</span>
                  {l.label && <span className="ne-dep-summary">{l.label}</span>}
                  {!l.label && n.summary && <span className="ne-dep-summary">{n.summary}</span>}
                </button>
              );
            })}
          </div>
        )}
      </>
    );

    // Render per section (a single section if there are no fieldSections)
    const renderFieldsSection = () => {
      if (!spec || !Array.isArray(spec.fields) || spec.fields.length === 0) {
        return (
          <>
            <div className="ne-section">
              <div className="ne-section-label">Settings fields</div>
              <div className="ne-cfg-empty">This node type needs no settings ({window.NODE_TYPES[node.type]?.label || node.type} oversees and connects other nodes, so it has no parameters of its own)</div>
            </div>
            {renderContextBlock("settings")}
          </>
        );
      }

      // Generate settings with AI: send the instruction + field definitions to /api/auto-config (node-fields),
      // then apply the returned values to localOverride in one batch + persist with a single PATCH.
      // (Calling handleFieldSave repeatedly would have each PATCH overwrite the others with a stale localOverride, hence the batch)
      // Run via the job registry. The fetch runs independently of the component's mount state, and
      // on completion saves its result to the registry + notifies subscribers of that editKey.
      // → Generation continues even if you switch away from the node, and ⏳/the result reflects on the correct node when you return.
      function generateNodeFields() {
        const instruction = (aiFieldInstruction || "").trim();
        const jobKey = editKey;
        const existing = window.__aiFieldJobs.get(jobKey);
        if (!instruction || (existing && existing.status === "running")) return;
        setAiFieldGenerating(true); setAiFieldError("");
        // Pass both the practical settings (PART_FIELDS) and the technical fields (spec.fields) to the AI.
        // For capability nodes (e.g. Gmail), the recipient/subject/body live in PART_FIELDS, so
        // without including those the values returned by the AI won't reflect in the displayed fields.
        const cap = meta.capability;
        const coreFields = (cap && window.FI && window.FI.PART_FIELDS)
          ? (window.FI.PART_FIELDS[cap] || []) : [];
        const seen = new Set();
        const allFields = [...coreFields, ...(spec.fields || [])].filter(f => {
          if (!f || !f.key || seen.has(f.key)) return false;
          seen.add(f.key); return true;
        });
        const fieldDefs = allFields.map(f => ({
          key: f.key, label: f.label || f.key,
          type: f.long ? "long" : (f.type || "text"),
          value: meta[f.key] || "",
        }));
        const reqBody = {
          mode: "node-fields", instruction,
          node: { type: node.type, title: node.title || "", fields: fieldDefs },
        };
        // Register as running in the registry
        window.__aiFieldJobs.set(jobKey, { status: "running", result: null, error: "", consumed: false });
        const notify = (kind, payload) => {
          const sub = window.__aiFieldSubs && window.__aiFieldSubs.get(jobKey);
          if (sub) { if (kind === "done") sub.onDone(payload); else sub.onError(payload); }
        };
        (async () => {
          try {
            const res = await fetch("/api/auto-config", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(reqBody),
            });
            const data = await res.json();
            if (data && data.error) {
              window.__aiFieldJobs.set(jobKey, { status: "error", result: null, error: data.error, consumed: false });
              notify("error", data.error); return;
            }
            const gen = data && data.fields;
            if (!gen || typeof gen !== "object" || Object.keys(gen).length === 0) {
              const msg = "The AI could not generate settings values";
              window.__aiFieldJobs.set(jobKey, { status: "error", result: null, error: msg, consumed: false });
              notify("error", msg); return;
            }
            const updates = { ...gen, ai_instruction: instruction };
            // Generation only "fills in" the settings fields (reflected in localOverride). Persistence is left to "Save".
            // It stays in the registry even when unmounted, so the effect applies it when you return.
            window.__aiFieldJobs.set(jobKey, { status: "done", result: updates, error: "", consumed: false });
            // Also write into the edit cache so it can be restored when you come back
            const cached = window.__nodeEditCache.get(jobKey) || {};
            window.__nodeEditCache.set(jobKey, {
              localOverride: { ...(cached.localOverride || {}), ...updates },
              aiInstruction: typeof cached.aiInstruction === "string" ? cached.aiInstruction : instruction,
            });
            notify("done", updates);
          } catch (e) {
            const msg = String((e && e.message) || e);
            window.__aiFieldJobs.set(jobKey, { status: "error", result: null, error: msg, consumed: false });
            notify("error", msg);
          }
        })();
      }

      const aiBlock = (
        <div className="ne-section">
          <div className="ne-section-label">✨ Generate settings with AI</div>
          <div className="ne-st-sec-desc">Describe what you want to do and press the button to auto-fill the settings below.</div>
          <textarea
            rows={2}
            placeholder="e.g. Send the accounting team an email reporting that the project is complete"
            value={aiFieldInstruction}
            onChange={e => {
              const v = e.target.value;
              setAiFieldInstruction(v);
              // Save into meta continuously so it survives a reload (same place it is restored from initially)
              if (node.meta) node.meta.ai_instruction = v;
              // Also write into the edit cache so it survives node switches
              const cached = window.__nodeEditCache.get(editKey) || {};
              window.__nodeEditCache.set(editKey, {
                localOverride: cached.localOverride || localOverride,
                aiInstruction: v,
              });
            }}
            style={{ width: "100%", boxSizing: "border-box", marginBottom: 6, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--bd)" }}
          />
          <button
            type="button"
            className="fme-ai-btn"
            onClick={generateNodeFields}
            disabled={aiFieldGenerating || !(aiFieldInstruction || "").trim()}
          >{aiFieldGenerating ? "⏳ Generating…" : "✨ Generate settings with AI"}</button>
          {aiFieldError && <div className="fme-error" style={{ marginTop: 6 }}>{aiFieldError}</div>}
        </div>
      );

      const sections = (spec.fieldSections && spec.fieldSections.length > 0)
        ? spec.fieldSections
        : [{ key: "_default", title: "Settings fields", desc: "" }];
      const techSectionNodes = sections.map(sec => {
        const items = spec.fields.filter(f => (f.section || "_default") === sec.key);
        if (items.length === 0) return null;
        const normalItems = items.filter(f => !f.advanced);
        const advancedItems = items.filter(f => f.advanced);
        const isAdvancedOpen = !!advancedOpen[sec.key];
        return (
          <div key={sec.key} className="ne-section">
            <div className="ne-section-label">{sec.title}</div>
            {sec.desc && <div className="ne-st-sec-desc">{sec.desc}</div>}
            {normalItems.map(renderField)}
            {advancedItems.length > 0 && (
              <div>
                <button
                  type="button"
                  className="ne-st-adv-btn"
                  onClick={() => setAdvancedOpen(o => ({ ...o, [sec.key]: !o[sec.key] }))}
                  title={isAdvancedOpen ? "Hide advanced fields" : "Show advanced fields"}
                >
                  {isAdvancedOpen ? "▼" : "▶"} Advanced ({advancedItems.length})
                </button>
                {isAdvancedOpen && (
                  <div className="ne-st-adv-body">
                    {advancedItems.map(renderField)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      });

      // ── Practical parts (when meta.capability is set): practical core on top, technical fields collapsed ──
      const capability = meta.capability;
      const coreFields = (capability && window.FI && window.FI.PART_FIELDS)
        ? window.FI.PART_FIELDS[capability] : null;
      if (coreFields && coreFields.length > 0) {
        const detailOpen = !!advancedOpen["__parts_detail__"];
        return (
          <>
            {aiBlock}
            <div className="ne-section">
              <div className="ne-section-label">🧱 Practical settings</div>
              <div className="ne-st-sec-desc">The items most commonly used for this part. Fill in just these and it works.</div>
              {coreFields.map(renderField)}
            </div>
            <div className="ne-section">
              <button
                type="button"
                className="ne-st-adv-btn"
                onClick={() => setAdvancedOpen(o => ({ ...o, __parts_detail__: !o["__parts_detail__"] }))}
                title={detailOpen ? "Hide technical details" : "Show technical details"}
              >
                {detailOpen ? "▼" : "▶"} Detailed settings (advanced)
              </button>
              {detailOpen && <div className="ne-st-adv-body">{techSectionNodes}</div>}
            </div>
          </>
        );
      }
      return <>{aiBlock}{techSectionNodes}</>;
    };

    return (
      <>
        {sharedTop}
        {(!window.FI || !window.FI.TYPE_SPECS) ? (
          <>
            <div className="ne-section">
              <div className="ne-section-label">Settings fields</div>
              <div className="ne-cfg-empty">TYPE_SPECS is not loaded (check shared/flow-elements.js)</div>
            </div>
            {renderContextBlock("settings")}
          </>
        ) : !baseSpec ? (
          <>
            <div className="ne-section">
              <div className="ne-section-label">Settings fields</div>
              <div className="ne-cfg-empty">This node type ({node.type}) has no TYPE_SPECS definition</div>
            </div>
            {renderContextBlock("settings")}
          </>
        ) : (
          renderFieldsSection()
        )}
        {/* ⓘ hover tooltip (viewport-fixed, top z-index) */}
        {tipState && (
          <div className="ne-tooltip" style={{ left: tipState.x, top: tipState.y }}>
            {tipState.label && <div className="ne-tooltip-label">{tipState.label}</div>}
            <div>{tipState.text}</div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {sharedTop}
      <AddressChip flowId={workflow.id} nodeId={node.id} />
      <Section label="Description"><DescEditor node={node} flowId={workflow.id} onSaved={onSaved} onPatch={onPatch} /></Section>
      <div className="d-grid">
        <div className="d-stat"><div className="d-stat-k">Type</div><div className="d-stat-v"><span className="d-stat-dot" style={{ background: t.color }} /> {t.label}</div></div>
        <div className="d-stat"><div className="d-stat-k">Duration</div><div className="d-stat-v mono">{node.duration}</div></div>
        <div className="d-stat"><div className="d-stat-k">Dependencies</div><div className="d-stat-v mono">{node.depends.length || "—"}</div></div>
        <div className="d-stat"><div className="d-stat-k">Branch</div><div className="d-stat-v mono">{outLinks.length > 1 ? `fan-out ×${outLinks.length}` : "linear"}</div></div>
      </div>
      {(node.type === "subagent" || node.type === "hook" || node.type === "mcp") && (
        <Section label="Prompt"><PromptEditor node={node} flowId={workflow.id} onSaved={onSaved} onPatch={onPatch} /></Section>
      )}
      {node.config && (
        <Section label="Config"><ConfigEditor node={node} flowId={workflow.id} onSaved={onSaved} onPatch={onPatch} /></Section>
      )}
      <Section label="Input"><pre className="code">{formatJSON(node.input)}</pre></Section>
      <Section label="Output"><pre className="code">{formatJSON(node.output)}</pre></Section>
      <Section label={`Incoming (${inLinks.length})`}>
        {inLinks.length === 0 && <div className="d-empty">— root node —</div>}
        {inLinks.map((l, i) => { const n = nodesById[l.from], lt = window.NODE_TYPES[n.type]; return (<button key={i} className="dep-row" onClick={() => onJump(n.id)}><span className="dep-bar" style={{ background: lt.color }} /><span className="dep-name">{n.title}</span><span className="dep-type">{lt.label}</span></button>); })}
      </Section>
      <Section label={`Outgoing (${outLinks.length})`}>
        {outLinks.length === 0 && <div className="d-empty">— terminal node —</div>}
        {outLinks.map((l, i) => { const n = nodesById[l.to], lt = window.NODE_TYPES[n.type]; return (<button key={i} className="dep-row" onClick={() => onJump(n.id)}><span className="dep-bar" style={{ background: lt.color }} /><span className="dep-name">{n.title}</span>{l.label && <span className="dep-label">{l.label}</span>}<span className="dep-type">{lt.label}</span></button>); })}
      </Section>
    </>
  );
}

// Keep each node's chat history outside React. Closing the panel (unmounting ChatPanel)
// keeps the content, so it is restored when the panel is reopened.
if (!window.__nodeChatCache) window.__nodeChatCache = new Map();
function _nodeChatKey(workflow, selectedNode) {
  return `${workflow?.id || "_"}::${selectedNode?.id || "_flow"}`;
}

export function ChatPanel({ workflow, selectedNode, onSaved, onApplyNodeSettings }) {
  const chatKey = _nodeChatKey(workflow, selectedNode);
  // Initial value restored from the cache (assumes a separate instance per node via the key prop)
  const [messages, setMessages] = useState(() => window.__nodeChatCache.get(chatKey) || []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [available, setAvailable] = useState(null);
  const [parsedSettings, setParsedSettings] = useState(null);  // {desc, config} the AI proposed (legacy edit mode; not shown in the explanation tab)
  const [editPrompt, setEditPrompt] = useState(null);  // copy-paste block the AI generated { kind:"edit"|"claudemd", text }
  const [copied, setCopied] = useState(false);
  const [intent, setIntent] = useState(null);  // intent chosen at the entry point: null | "fix" (fix skill) | "claudemd" (add to CLAUDE.md)
  const [applying, setApplying] = useState(false);
  const messagesEnd = useRef(null);
  const textareaRef = useRef(null);

  // Extract the ```node_settings block from the assistant's latest message
  function tryParseSettings(fullText) {
    const obj = extractTaggedJson(fullText, "node_settings");
    if (obj && !Array.isArray(obj) && (obj.desc !== undefined || obj.config !== undefined)) return obj;
    return null;
  }

  // Extract the contents of the ```edit_prompt fence (a copy-paste fix prompt) from the assistant's latest message
  function tryParseEditPrompt(fullText) {
    const m = (fullText || "").match(/```edit_prompt\s*\n([\s\S]*?)\n```/);
    return m ? m[1].trim() : null;
  }
  // Extract the ```claude_md_add fence (a proposal to append to CLAUDE.md)
  function tryParseClaudeMdAdd(fullText) {
    const m = (fullText || "").match(/```claude_md_add\s*\n([\s\S]*?)\n```/);
    return m ? m[1].trim() : null;
  }

  // When the user picks "I want to fix this / add to CLAUDE.md" at the entry point: ask first instead of immediately calling the LLM.
  function startIntent(kind) {
    setIntent(kind);
    setEditPrompt(null);
    const q = kind === "fix"
      ? "What would you like to change? Describe what you want to fix (e.g. \"I want it to error out on any argument other than status\"). I'll turn that into a fix prompt you can paste straight into Claude Code or the edit chat."
      : "What would you like to add to CLAUDE.md? Describe any rule or caveat you noticed in this flow (e.g. \"make it explicit that this command assumes a VPS and won't run locally\"). I'll draft what to add and to which file.";
    setMessages([{ role: "assistant", content: q }]);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  // Apply the proposed settings to the actual node.
  // - If onApplyNodeSettings is provided (e.g. Plan Workspace), delegate to it (updates the board state)
  // - Otherwise, follow the normal flow: PATCH /api/flows/{id}/nodes/{id} → reload via onSaved
  async function applySettings() {
    if (!parsedSettings || !selectedNode || applying) return;
    setApplying(true);
    try {
      if (typeof onApplyNodeSettings === "function") {
        await onApplyNodeSettings(selectedNode.id, parsedSettings);
      } else {
        const body = {};
        if (parsedSettings.desc !== undefined) body.desc = parsedSettings.desc;
        if (parsedSettings.config !== undefined) body.config = parsedSettings.config;
        const res = await fetch(API + `/api/flows/${encodeURIComponent(workflow.id)}/nodes/${encodeURIComponent(selectedNode.id)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`);
        if (typeof onSaved === "function") onSaved();
      }
      setParsedSettings(null);
      setMessages(m => [...m, { role: "system", content: "✓ Settings applied to the node" }]);
    } catch (e) {
      alert("Failed to apply: " + ((e && e.message) || e));
    }
    setApplying(false);
  }

  useEffect(() => {
    apiFetch("/api/chat/status").then(r => setAvailable(r.available)).catch(() => setAvailable(false));
  }, []);

  // Write back to the cache every time messages changes (keeps it across unmount)
  useEffect(() => {
    window.__nodeChatCache.set(chatKey, messages);
  }, [chatKey, messages]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function autoResize() {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; }
  }

  async function send(text) {
    const userMsg = text || input.trim();
    if (!userMsg || streaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const newMsgs = [...messages, { role: "user", content: userMsg }];
    setMessages(newMsgs);
    setStreaming(true);

    try {
      const res = await fetch(API + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Don't send UI-only messages (role:"system": apply confirmations / error display) to the API (the backend allows only user/assistant → anything else is a 422)
          messages: newMsgs.filter(m => m.role === "user" || m.role === "assistant"),
          flow_id: workflow?.id || null,
          node_id: selectedNode?.id || null,
          // This tab is always in "explain + generate fix/add prompt" mode for the flow/node (even with no node selected)
          context_type: "node-settings",
          intent: intent || null,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages(m => [...m, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              assistantText += data.text;
              setMessages(m => {
                const updated = [...m];
                updated[updated.length - 1] = { role: "assistant", content: assistantText };
                return updated;
              });
            } catch(e) {}
          }
        }
      }
      // After the stream completes, if there's a settings block, keep it as an apply candidate (legacy edit mode)
      const settings = tryParseSettings(assistantText);
      if (settings) setParsedSettings(settings);
      // The main purpose of the explanation tab: if there's a fix prompt (edit_prompt) / CLAUDE.md draft (claude_md_add), put it in a copy-paste card
      const ep = tryParseEditPrompt(assistantText);
      const cm = tryParseClaudeMdAdd(assistantText);
      if (ep) setEditPrompt({ kind: "edit", text: ep });
      else if (cm) setEditPrompt({ kind: "claudemd", text: cm });
      else setEditPrompt(null);
      setCopied(false);
    } catch(e) {
      setMessages(m => [...m, { role: "system", content: "Connection error: " + e.message }]);
    }
    setStreaming(false);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const suggestions = selectedNode ? [
    `What does the "${selectedNode.title}" node do?`,
    "What are its inputs and outputs?",
    "Where in the overall flow does it run?",
  ] : [
    "What does this flow do?",
    "When does it start?",
    "Walk me through the overall flow",
  ];

  if (available === false) {
    return (
      <div className="chat-panel">
        <div className="chat-unavailable">
          <div className="chat-empty-icon">⚡</div>
          <h4>Claude CLI not found</h4>
          <p>The chat feature runs through the Claude Code CLI</p>
          <code>npm install -g @anthropic-ai/claude-code</code>
          <p style={{ fontSize: 10.5, marginTop: 4 }}>After installing, confirm that <code>claude</code> works in your terminal</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      {workflow && (
        <div className="chat-context-bar">
          <span>Context:</span>
          <span className="ctx-chip">{workflow.id}</span>
          {selectedNode && <><span>→</span><span className="ctx-chip">{selectedNode.id}</span></>}
          {messages.length > 0 && (
            <button
              className="chat-clear-btn"
              style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--tx-4)", cursor: "pointer", fontSize: "11px", padding: "2px 6px" }}
              onClick={() => { setMessages([]); window.__nodeChatCache.delete(chatKey); }}
              title="Clear this node's chat history"
            >🗑 Clear history</button>
          )}
        </div>
      )}
      {messages.length === 0 ? (
        <div className="chat-empty">
          <div className="chat-empty-icon">💬</div>
          <h4>{selectedNode ? "Explain this node's role" : "Explain what this flow does"}</h4>
          <p>{selectedNode ? <>Explains what "{selectedNode.title}" takes as input, what it does, and what it outputs,<br/>and where it runs in the flow</> : <>Explains what this skill/command does and the<br/>overall flow (when you want to change it, it builds a fix prompt)</>}</p>
          <div className="chat-suggestions">
            {suggestions.map((s, i) => (
              <button key={i} className="chat-suggest-btn" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--bd, #e5e7eb)", display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 320 }}>
            <div style={{ fontSize: 10.5, color: "var(--tx-4)", marginBottom: 2 }}>Or — when you want to make a change (it asks first)</div>
            <button className="chat-suggest-btn" style={{ textAlign: "left" }} onClick={() => startIntent("fix")}>✏️ I want to modify this skill/command</button>
          </div>
        </div>
      ) : (
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.role === "assistant"
                ? m.content.replace(/```node_settings\s*\n[\s\S]*?\n```/g, "").replace(/```edit_prompt\s*\n[\s\S]*?\n```/g, "").replace(/```claude_md_add\s*\n[\s\S]*?\n```/g, "").trim()
                : m.content}
            </div>
          ))}
          {streaming && <div className="chat-typing"><span/><span/><span/></div>}
          {parsedSettings && !streaming && (
            <div className="ai-design-spec-preview" style={{ border: "1px solid var(--accent)", borderRadius: 8, padding: 10, marginTop: 8, background: "var(--accent-bg, #eff6ff)" }}>
              <h5 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--accent)" }}>📋 Settings to apply to this node</h5>
              {parsedSettings.desc !== undefined && (
                <div style={{ fontSize: 11, marginBottom: 4 }}>
                  <b>Body:</b> {String(parsedSettings.desc).slice(0, 160)}{String(parsedSettings.desc).length > 160 ? "…" : ""}
                </div>
              )}
              {parsedSettings.config && (
                <div style={{ fontSize: 10, fontFamily: "monospace", marginBottom: 6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {JSON.stringify(parsedSettings.config, null, 2)}
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setParsedSettings(null)} style={{ fontSize: 11, padding: "4px 10px" }}>Dismiss</button>
                <button className="primary" onClick={applySettings} disabled={applying}
                  style={{ fontSize: 11, padding: "4px 10px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4 }}>
                  {applying ? "Applying…" : "✓ Apply to this node"}
                </button>
              </div>
            </div>
          )}
          {editPrompt && !streaming && (
            <div className="ai-design-spec-preview" style={{ border: "1px solid var(--accent)", borderRadius: 8, padding: 10, marginTop: 8, background: "var(--accent-bg, #eff6ff)" }}>
              <h5 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--accent)" }}>
                {editPrompt.kind === "claudemd"
                  ? "📝 CLAUDE.md draft (copy into the CLAUDE.md chat / Claude Code)"
                  : "📋 Fix prompt (copy into Claude Code or the \"Edit\" chat)"}
              </h5>
              <div style={{ fontSize: 11, fontFamily: "monospace", marginBottom: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflowY: "auto", background: "var(--bg-2, #fff)", border: "1px solid var(--bd, #e5e7eb)", borderRadius: 4, padding: 8 }}>
                {editPrompt.text}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button className="primary" onClick={() => { navigator.clipboard.writeText(editPrompt.text).then(() => setCopied(true)).catch(() => {}); }}
                  style={{ fontSize: 11, padding: "4px 10px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4 }}>
                  {copied ? "✓ Copied" : "📋 Copy"}
                </button>
                <button onClick={() => setEditPrompt(null)} style={{ fontSize: 11, padding: "4px 10px" }}>Close</button>
              </div>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>
      )}
      <div className="chat-input-wrap">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => { setInput(e.target.value); autoResize(); }}
          onKeyDown={onKeyDown}
          placeholder={selectedNode ? `Ask about ${selectedNode.title}…` : "Ask about the workflow…"}
          rows={1}
        />
        <button className="chat-send" onClick={() => send()} disabled={!input.trim() || streaming} title="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function AIDesignChat({ workflow, afterNodeId, beforeNodeId, initialMessage, onApplySpec, onCancel }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [parsedSpec, setParsedSpec] = useState(null);
  const messagesEnd = useRef(null);
  const textareaRef = useRef(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-send initial message
  useEffect(() => {
    if (initialMessage && !sentInitial.current && messages.length === 0) {
      sentInitial.current = true;
      send(initialMessage);
    }
  }, [initialMessage]);

  function autoResize() {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 100) + "px"; }
  }

  function tryParseSpec(fullText) {
    const spec = extractTaggedJson(fullText, "node_spec") || extractTaggedJson(fullText, "json");
    if (spec && !Array.isArray(spec) && spec.ready && spec.type && spec.title) return spec;
    return null;
  }

  async function send(text) {
    const userMsg = text || input.trim();
    if (!userMsg || streaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const newMsgs = [...messages, { role: "user", content: userMsg }];
    setMessages(newMsgs);
    setStreaming(true);

    try {
      const res = await fetch(API + "/api/chat/design-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Exclude UI-only messages with role:"system" (error display etc.) (the backend allows only user/assistant → anything else is a 422)
          messages: newMsgs.filter(m => m.role === "user" || m.role === "assistant"),
          flow_id: workflow?.id || "",
          after_node: afterNodeId,
          before_node: beforeNodeId,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages(m => [...m, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              assistantText += data.text;
              setMessages(m => {
                const updated = [...m];
                updated[updated.length - 1] = { role: "assistant", content: assistantText };
                return updated;
              });
            } catch(e) {}
          }
        }
      }

      // Check if response contains a node spec
      const spec = tryParseSpec(assistantText);
      if (spec) setParsedSpec(spec);
    } catch(e) {
      setMessages(m => [...m, { role: "system", content: "Connection error: " + e.message }]);
    }
    setStreaming(false);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const afterNode = workflow?.nodes?.find(n => n.id === afterNodeId);
  const beforeNode = workflow?.nodes?.find(n => n.id === beforeNodeId);

  // Strip ```node_spec blocks from display text
  function displayText(text) {
    return text.replace(/```(?:node_spec|json)\s*\n[\s\S]*?\n```/g, "").trim();
  }

  return (
    <div className="ai-design-chat">
      <div className="ai-design-header">
        <h4>✨ AI node design</h4>
        <p>Tell it what you want to do and it proposes the best node design</p>
        {afterNode && beforeNode && (
          <div className="ai-design-pos">
            <span className="pos-node">{afterNode.title}</span>
            <span>→</span>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>NEW</span>
            <span>→</span>
            <span className="pos-node">{beforeNode.title}</span>
          </div>
        )}
      </div>
      <div className="ai-design-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === "assistant" ? displayText(m.content) : m.content}
          </div>
        ))}
        {streaming && <div className="chat-typing"><span/><span/><span/></div>}
        {parsedSpec && !streaming && (
          <div className="ai-design-spec-preview">
            <h5>📋 Designed node</h5>
            <div className="ai-design-spec-row"><span className="label">Type</span><span className="value" style={{ color: window.NODE_TYPES[parsedSpec.type]?.color || "var(--tx)" }}>{window.NODE_TYPES[parsedSpec.type]?.label || parsedSpec.type}</span></div>
            <div className="ai-design-spec-row"><span className="label">Title</span><span className="value">{parsedSpec.title}</span></div>
            {parsedSpec.subtitle && <div className="ai-design-spec-row"><span className="label">Sub</span><span className="value">{parsedSpec.subtitle}</span></div>}
            <div className="ai-design-spec-row"><span className="label">Desc</span><span className="value">{parsedSpec.desc}</span></div>
            {parsedSpec.config && <div className="ai-design-spec-row"><span className="label">Config</span><span className="value mono" style={{fontSize:10}}>{JSON.stringify(parsedSpec.config)}</span></div>}
            <div className="ai-design-actions">
              <button onClick={onCancel}>Cancel</button>
              <button className="primary" onClick={() => onApplySpec(parsedSpec)}>✓ Add to draft</button>
            </div>
          </div>
        )}
        <div ref={messagesEnd} />
      </div>
      <div className="chat-input-wrap">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => { setInput(e.target.value); autoResize(); }}
          onKeyDown={onKeyDown}
          placeholder="Additional requirements or questions…"
          rows={1}
        />
        <button className="chat-send" onClick={() => send()} disabled={!input.trim() || streaming} title="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function DraftEditor({ node, updateDraft, removeDraft }) {
  return (
    <div className="draft-form">
      <label>Title</label>
      <input value={node.title} onChange={e => updateDraft(node.id, { title: e.target.value })} placeholder="Node title" />
      <label>Subtitle</label>
      <input value={node.subtitle} onChange={e => updateDraft(node.id, { subtitle: e.target.value })} placeholder="e.g. PreToolUse Hook" />
      <label>Description</label>
      <textarea value={node.desc} onChange={e => updateDraft(node.id, { desc: e.target.value })} placeholder="What does this node do?" />
      <label>Prompt / Code</label>
      <textarea value={node.prompt || ""} onChange={e => updateDraft(node.id, { prompt: e.target.value })} placeholder="Sub-agent prompt, hook script, etc." />
      <div style={{ fontSize: 11, color: "var(--tx-4)", marginTop: 4 }}>
        ⚡ The "Ask Claude to implement" button implements it based on this spec
      </div>
      <button className="draft-discard" style={{ marginTop: 8, width: "100%" }} onClick={() => removeDraft(node.id)}>
        Delete this draft
      </button>
    </div>
  );
}

export function RightPanel({ node, workflow, onClose, onJump, onSaved, drafts, updateDraft, removeDraft, aiDesign, onAIApplySpec, onAICancelDesign, floating, onApplyNodeSettings }) {
  const [tab, setTab] = useState("inspector");
  const [viewMode, setViewMode] = useState("simple"); // "simple" (overview) | "settings" (settings) | "dev" (for engineers)
  const [minimized, setMinimized] = useState(false);
  const isDraft = node?._isDraft;

  // Auto-switch to AI design tab when aiDesign session starts
  const prevDesign = useRef(null);
  useEffect(() => {
    if (aiDesign && !prevDesign.current) setTab("ai-design");
    if (!aiDesign && prevDesign.current) setTab("inspector");
    prevDesign.current = aiDesign;
  }, [aiDesign]);

  return (
    <aside className={`detail ${minimized ? "is-minimized" : ""} ${floating ? "is-floating" : ""}`} style={{ display: "flex", flexDirection: "column", position: floating ? "absolute" : "relative" }}>
      <button
        className="detail-collapse-btn"
        onClick={() => setMinimized(m => !m)}
        title={minimized ? "Expand (+)" : "Minimize (−)"}
      >{minimized ? "+" : "−"}</button>
      <div className="right-tabs">
        <button className={`right-tab ${tab === "inspector" ? "is-active" : ""}`} onClick={() => setTab("inspector")}>
          <span className="tab-icon">🔍</span> Inspector
        </button>
        <button className={`right-tab ${tab === "fulltext" ? "is-active" : ""}`} onClick={() => setTab("fulltext")}>
          <span className="tab-icon">📄</span> Full text
        </button>
        {aiDesign && (
          <button className={`right-tab ${tab === "ai-design" ? "is-active" : ""}`} onClick={() => setTab("ai-design")} style={{ color: "var(--accent)" }}>
            <span className="tab-icon">✨</span> AI Design
          </button>
        )}
        <button className={`right-tab ${tab === "chat" ? "is-active" : ""}`} onClick={() => setTab("chat")}>
          <span className="tab-icon">💬</span> Chat
        </button>
      </div>
      {tab === "ai-design" && aiDesign ? (
        <AIDesignChat
          workflow={workflow}
          afterNodeId={aiDesign.afterNode}
          beforeNodeId={aiDesign.beforeNode}
          initialMessage={aiDesign.initialMessage}
          onApplySpec={onAIApplySpec}
          onCancel={onAICancelDesign}
        />
      ) : tab === "inspector" ? (
        node ? (
          <>
            <div className="detail-head" style={{ "--accent": window.NODE_TYPES[node.type].color }}>
              <div className="dh-row">
                <span className="dh-chip" style={{ background: isDraft ? "var(--accent)" : window.NODE_TYPES[node.type].bg, color: isDraft ? "white" : window.NODE_TYPES[node.type].color, borderColor: isDraft ? "var(--accent)" : window.NODE_TYPES[node.type].color }}>
                  {isDraft ? "DRAFT" : window.NODE_TYPES[node.type].label.toUpperCase()}
                </span>
                {!isDraft && (
                  <div className="dh-mode-toggle">
                    <button className={`dh-mode-btn ${viewMode === "simple" ? "is-active" : ""}`} onClick={() => setViewMode("simple")}>Overview</button>
                    <button className={`dh-mode-btn ${viewMode === "settings" ? "is-active" : ""}`} onClick={() => setViewMode("settings")}>Settings</button>
                    <button className={`dh-mode-btn ${viewMode === "dev" ? "is-active" : ""}`} onClick={() => setViewMode("dev")}>Dev</button>
                  </div>
                )}
                <button className="dh-close" onClick={onClose} title="Close">×</button>
              </div>
              <div className="dh-title">{node.title}</div>
              <div className="dh-sub">{isDraft ? `New ${window.NODE_TYPES[node.type].label}` : node.subtitle}</div>
            </div>
            <div className="detail-body">
              {isDraft ? (
                <DraftEditor node={node} updateDraft={updateDraft} removeDraft={removeDraft} />
              ) : (
                <DetailBody node={node} workflow={workflow} onJump={onJump} onSaved={onSaved} viewMode={viewMode} />
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1 }}><DetailEmpty flowKey={workflow?.id || "default"} nodes={workflow?.nodes} edges={workflow?.edges} flowId={workflow?.id} sourceType={workflow?.source?.type} /></div>
        )
      ) : tab === "fulltext" ? (
        <FlowSourceView flowId={workflow?.id} sourceType={workflow?.source?.type} selectedNode={node} />
      ) : (
        <ChatPanel key={node?.id || "_flow"} workflow={workflow} selectedNode={node} onSaved={onSaved} onApplyNodeSettings={onApplyNodeSettings} />
      )}
    </aside>
  );
}

export function DetailPanel({ node, workflow, onClose, onJump, onSaved }) {
  if (!node) return <aside className="detail empty"><DetailEmpty flowKey={workflow?.id || "default"} nodes={workflow?.nodes} edges={workflow?.edges} /></aside>;
  const t = window.NODE_TYPES[node.type];
  return (
    <aside className="detail">
      <div className="detail-head" style={{ "--accent": t.color }}>
        <div className="dh-row"><span className="dh-chip" style={{ background: t.bg, color: t.color, borderColor: t.color }}>{t.label.toUpperCase()}</span><button className="dh-close" onClick={onClose} title="Close">×</button></div>
        <div className="dh-title">{node.title}</div>
        <div className="dh-sub">{node.subtitle}</div>
      </div>
      <div className="detail-body"><DetailBody node={node} workflow={workflow} onJump={onJump} onSaved={onSaved} /></div>
    </aside>
  );
}

export function TopBar({ workflow, runState, setRunState, variant, onEval, onCopyToPlan }) {
  const compact = variant === "compact";
  const [copied, setCopied] = React.useState(false);
  const [staging, setStaging] = React.useState("idle"); // idle | staging | done | error
  const sourceType = workflow && workflow.source && workflow.source.type;
  const stageable = sourceType === "skill" || sourceType === "agent" || sourceType === "hooks";

  async function handleStage() {
    if (!workflow || staging === "staging") return;
    setStaging("staging");
    try {
      const res = await apiPost(`/api/flows/${encodeURIComponent(workflow.id)}/stage`, {});
      // After a successful stage, apply it for real (detect diff → claude -p → push)
      const dep = await apiPost("/api/workspace/deploy", {});
      const np = (dep.pushed || []).length, nf = (dep.failed || []).length;
      window.alert(`Applied ${np} / Failed ${nf}`);
      setStaging("done");
      // Update the badge on the sync button (ConfigStackActions)
      window.dispatchEvent(new CustomEvent("flow-inspector:staged-changed"));
      // Warn if any node has an empty body (the user is expected to fill it in via the node-detail AI chat)
      const warnings = (res && res.warnings) || [];
      if (warnings.length > 0) {
        alert(
          `⚠️ ${warnings.length} node(s) were saved while still empty:\n\n` +
          warnings.map(w => "• " + w).join("\n") +
          "\n\nWrite the body for each node via the AI chat in its detail panel."
        );
      }
      setTimeout(() => setStaging("idle"), 2500);
    } catch (e) {
      setStaging("error");
      alert("Failed to save to stage: " + ((e && e.message) || e));
      setTimeout(() => setStaging("idle"), 2500);
    }
  }

  const stageLabel = staging === "staging" ? "⏳ Saving…"
    : staging === "done" ? "✓ Saved to stage"
    : staging === "error" ? "⚠ Failed"
    : "💾 Save to stage";

  async function handleCopyToPlan() {
    if (!workflow) return;
    // Save the "whole flow" in the clipboard format used by Plan Workspace
    const item = {
      id: `flow_${Date.now()}`,
      type: "flow",
      flowId: workflow.id,
      label: `Copy of ${workflow.name}`,
      x: 100, y: 100, w: 400, h: 260,
    };
    const payload = { source: "plan-workspace", boardId: "from-workflow", items: [item], copiedAt: new Date().toISOString() };
    try { localStorage.setItem("fi_plan_clipboard", JSON.stringify(payload)); } catch {}
    try { await navigator.clipboard.writeText(JSON.stringify(payload)); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className={`topbar ${compact ? "is-compact" : ""}`}>
      <div className="tb-left"><div className="bc"><span className="bc-muted">workflows</span><span className="bc-sep">/</span><span className="bc-muted">skills</span><span className="bc-sep">/</span><span className="bc-cur">{workflow.name}</span></div></div>
      <div className="tb-center"><div className="tabs">{onEval && <button className="tab" onClick={onEval} style={{ color: "var(--accent)" }}>⚖ Eval</button>}</div></div>
      <div className="tb-right">
        {stageable && (
          <button
            className={`tb-stage-btn ${staging}`}
            onClick={handleStage}
            disabled={staging === "staging"}
            title="Convert the flow-diagram edits into real file format and save them to the stage. Apply them to the live environment via '⇡ Sync' in the config stack."
          >{stageLabel}</button>
        )}
        <button
          className="tb-plan-copy"
          onClick={handleCopyToPlan}
          title="Copy this entire flow to the Plan Workspace clipboard (paste with Cmd+V in Plan Workspace)"
        >{copied ? "✓ Copied" : "📋 Copy to Plan"}</button>
        <span className="tb-meta">{workflow.nodes.length}N · {workflow.edges.length}E · <span style={{ color: "var(--c-hook)" }}>{workflow.complexity}</span></span>
      </div>
    </div>
  );
}

// (removed dead layout-switcher cluster: LAYOUT_OPTIONS, LayoutTabs, RAIL_ICONS, IconRail, FloatingDetail — only used by the unreachable Layout* dev-mockups)

function parseDuration(s) { if (!s) return 0; if (s === "user") return 4; if (s === "—") return 0.2; const m = s.match(/([\d.]+)\s*(ms|s)/i); if (!m) return 1; const n = parseFloat(m[1]); return m[2].toLowerCase() === "s" ? n : n / 1000; }

export function Timeline({ workflow, selected, onJump }) {
  const order = workflow.nodes;
  const lanes = {}; let cursor = 0;
  const rows = order.map(n => { const dur = parseDuration(n.duration); const lane = n.parallel || "main"; const start = lanes[lane] || cursor; const end = start + dur; lanes[lane] = end; if (lane === "main") cursor = end; return { n, start, end }; });
  const total = Math.max(...rows.map(r => r.end), 1);
  return (
    <div className="timeline">{rows.map(({ n, start, end }, i) => { const t = window.NODE_TYPES[n.type]; return (
      <button key={n.id} className={`tl-row ${selected === n.id ? "is-active" : ""}`} onClick={() => onJump(n.id)}>
        <span className="tl-label">{n.title}</span>
        <div className="tl-track"><div className="tl-bar" style={{ left: `${(start / total) * 100}%`, width: `${Math.max(2, ((end - start) / total) * 100)}%`, background: t.color }} /></div>
        <span className="tl-dur mono">{n.duration}</span>
      </button>
    ); })}</div>
  );
}

function buildLog(workflow) {
  const ts = (i) => `14:32:${(11 + i).toString().padStart(2, "0")}.${Math.floor(Math.random()*900+100)}`;
  let i = 0; const out = [];
  workflow.nodes.forEach((n) => { out.push({ ts: ts(i), lvl: "info", msg: `→ enter  ${n.title}  [${n.type}]` }); i++; if (n.type === "user") out.push({ ts: ts(i), lvl: "warn", msg: `  awaiting user confirmation` }); if (n.type === "mcp") out.push({ ts: ts(i), lvl: "info", msg: `  mcp.dispatch(${n.subtitle})` }); out.push({ ts: ts(i), lvl: "info", msg: `← exit   ${n.title}  (${n.duration})` }); });
  return out;
}

export function LogView({ workflow }) {
  const lines = useMemo(() => buildLog(workflow), [workflow]);
  return (<pre className="code logview">{lines.map((l, i) => (<div key={i} className={`log-line log-${l.lvl}`}><span className="log-ts">{l.ts}</span><span className="log-lvl">{l.lvl.toUpperCase()}</span><span className="log-msg">{l.msg}</span></div>))}</pre>);
}

export function BottomDock({ node, workflow, onJump, onClose, defaultMinimized = false, floating = false }) {
  const [tab, setTab] = useState("details");
  const [minimized, setMinimized] = useState(defaultMinimized);
  // Height when floating (expanded). Resizable via the drag handle. Persisted in localStorage.
  const initialHeight = (() => {
    try { const v = parseInt(localStorage.getItem("fi_dock_height") || ""); return (v >= 120 && v <= window.innerHeight - 80) ? v : Math.round(window.innerHeight * 0.4); }
    catch { return Math.round(window.innerHeight * 0.4); }
  })();
  const [dockHeight, startDockResize, setDockHeight] = useResizable(initialHeight, 120, window.innerHeight - 80);
  useEffect(() => {
    try { localStorage.setItem("fi_dock_height", String(dockHeight)); } catch {}
  }, [dockHeight]);
  // Clicking the header (outside the tabs) toggles it
  const onHeadClick = (e) => {
    // Exclude the tab buttons / action button area / resize handle
    if (e.target.closest(".dock-tab") || e.target.closest(".dock-actions") || e.target.closest(".dock-resize")) return;
    setMinimized(m => !m);
  };
  const baseClass = `dock ${minimized ? "is-minimized" : ""} ${floating ? "is-floating" : ""}`;
  // Height style when expanded (only applied when floating and expanded)
  const heightStyle = (floating && !minimized) ? { height: `${dockHeight}px`, maxHeight: `${dockHeight}px` } : {};
  if (!node) return (
    <div className={baseClass} style={heightStyle}>
      {floating && !minimized && <div className="dock-resize" onMouseDown={startDockResize("up")} title="Drag to resize" />}
      <div className="dock-head" onClick={onHeadClick} style={{ cursor: "pointer" }} title={minimized ? "Click to expand" : "Click to collapse"}>
        <div className="dock-tabs">{["details","timeline","logs","config"].map(t => (<button key={t} className={`dock-tab ${tab === t ? "is-active" : ""}`} onClick={(e) => { e.stopPropagation(); setTab(t); if (minimized) setMinimized(false); }}>{t}</button>))}</div>
        <div className="dock-actions">
          <button className="dock-btn" onClick={(e) => { e.stopPropagation(); setMinimized(m => !m); }} title={minimized ? "Expand" : "Collapse"}>{minimized ? "▲" : "▼"}</button>
        </div>
      </div>
      {!minimized && <div className="dock-body dock-empty"><span className="dock-empty-text">click a node in the diagram to inspect</span></div>}
    </div>
  );
  const t = window.NODE_TYPES[node.type];
  const inLinks = workflow.edges.filter(e => e.to === node.id);
  const outLinks = workflow.edges.filter(e => e.from === node.id);
  const nodesById = Object.fromEntries(workflow.nodes.map(n => [n.id, n]));
  return (
    <div className={baseClass} style={heightStyle}>
      {floating && !minimized && <div className="dock-resize" onMouseDown={startDockResize("up")} title="Drag to resize" />}
      <div className="dock-head" onClick={onHeadClick} style={{ cursor: "pointer" }} title={minimized ? "Click to expand" : "Click to collapse"}>
        <div className="dock-tabs">{["details","timeline","logs","config"].map(tb => (<button key={tb} className={`dock-tab ${tab === tb ? "is-active" : ""}`} onClick={(e) => { e.stopPropagation(); setTab(tb); if (minimized) setMinimized(false); }}>{tb}</button>))}</div>
        <div className="dock-node"><span className="dock-chip" style={{ background: t.bg, color: t.color, borderColor: t.color }}>{t.label}</span><span className="dock-title">{node.title}</span><span className="dock-sub">{node.subtitle}</span></div>
        <div className="dock-actions">
          <button className="dock-btn" onClick={(e) => { e.stopPropagation(); setMinimized(m => !m); }} title={minimized ? "Expand" : "Collapse"}>{minimized ? "▲" : "▼"}</button>
          {onClose && <button className="dock-btn" onClick={(e) => { e.stopPropagation(); onClose(); }} title="Close">×</button>}
        </div>
      </div>
      {!minimized && tab === "details" && (
        <div className="dock-body dock-grid">
          <div className="dock-col"><Section label="Description" dense><p className="d-desc">{node.desc}</p></Section><Section label="Stats" dense><div className="d-grid d-grid-compact"><div className="d-stat"><div className="d-stat-k">Duration</div><div className="d-stat-v mono">{node.duration}</div></div><div className="d-stat"><div className="d-stat-k">Deps</div><div className="d-stat-v mono">{node.depends.length || "—"}</div></div><div className="d-stat"><div className="d-stat-k">Branch</div><div className="d-stat-v mono">{outLinks.length > 1 ? `×${outLinks.length}` : "linear"}</div></div><div className="d-stat"><div className="d-stat-k">Type</div><div className="d-stat-v"><span className="d-stat-dot" style={{ background: t.color }} /> {t.label}</div></div></div></Section></div>
          <div className="dock-col"><Section label="Input" dense><pre className="code">{formatJSON(node.input)}</pre></Section><Section label="Output" dense><pre className="code">{formatJSON(node.output)}</pre></Section></div>
          <div className="dock-col">
            <Section label={`Incoming (${inLinks.length})`} dense>{inLinks.length === 0 && <div className="d-empty">— root —</div>}{inLinks.map((l, i) => { const n = nodesById[l.from], lt = window.NODE_TYPES[n.type]; return (<button key={i} className="dep-row" onClick={() => onJump(n.id)}><span className="dep-bar" style={{ background: lt.color }} /><span className="dep-name">{n.title}</span></button>); })}</Section>
            <Section label={`Outgoing (${outLinks.length})`} dense>{outLinks.length === 0 && <div className="d-empty">— terminal —</div>}{outLinks.map((l, i) => { const n = nodesById[l.to], lt = window.NODE_TYPES[n.type]; return (<button key={i} className="dep-row" onClick={() => onJump(n.id)}><span className="dep-bar" style={{ background: lt.color }} /><span className="dep-name">{n.title}</span>{l.label && <span className="dep-label">{l.label}</span>}</button>); })}</Section>
          </div>
        </div>
      )}
      {!minimized && tab === "timeline" && <div className="dock-body"><Timeline workflow={workflow} selected={node.id} onJump={onJump} /></div>}
      {!minimized && tab === "logs" && <div className="dock-body"><LogView workflow={workflow} /></div>}
      {!minimized && tab === "config" && <div className="dock-body"><pre className="code config-pre">{`name: ${workflow.name}\ntrigger: skill\nnodes: ${workflow.nodes.length}\nparallel: true\nretries: 3\ntimeout: 30s\nlog_level: info`}</pre></div>}
    </div>
  );
}

export function MiniMap({ workflow, selected, onSelect }) {
  const w = 200, h = 130;
  const [minimized, setMinimized] = useState(false);
  const [dragStyle, onDragStart] = useDraggable(null);
  const [hoverId, setHoverId] = useState(null);
  const xs = workflow.nodes.map(n => n.x), ys = workflow.nodes.map(n => n.y);
  const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60, minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 60;
  const sx = (x) => ((x - minX) / (maxX - minX)) * w, sy = (y) => ((y - minY) / (maxY - minY)) * h;
  const handleClick = (n) => {
    if (onSelect) onSelect(n.id);
    // Scroll the main canvas to that node's position (if there's a scrollable .diagram area)
    const diagram = document.querySelector(".diagram, .flow-diagram, .dt-canvas");
    if (diagram) {
      // Find the node card element and scrollIntoView
      const nodeEl = document.querySelector(`[data-node-id="${n.id}"]`)
                  || document.getElementById(`node-${n.id}`);
      if (nodeEl && nodeEl.scrollIntoView) {
        nodeEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    }
  };
  return (
    <div className={`minimap ${minimized ? "is-minimized" : ""}`} style={dragStyle}>
      <div className="mm-head" onMouseDown={onDragStart}>
        <span>overview</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span className="mm-count">{workflow.nodes.length} nodes</span>
          <button className="mm-toggle" onClick={(e) => { e.stopPropagation(); setMinimized(m => !m); }} title={minimized ? "Expand" : "Minimize"}>
            {minimized ? "+" : "−"}
          </button>
        </span>
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {workflow.edges.map((e, i) => { const a = workflow.nodes.find(n => n.id === e.from), b = workflow.nodes.find(n => n.id === e.to); return <line key={i} x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)} stroke="var(--bd-2)" strokeWidth="0.8" />; })}
        {workflow.nodes.map(n => {
          const t = window.NODE_TYPES[n.type];
          const isSel = selected === n.id;
          const isHover = hoverId === n.id;
          const r = isSel ? 5 : (isHover ? 4 : 2.5);
          return (
            <g key={n.id}>
              {/* Transparent circle to widen the hit area */}
              <circle
                cx={sx(n.x)} cy={sy(n.y)} r={Math.max(r + 3, 7)}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onClick={() => handleClick(n)}
                onMouseEnter={() => setHoverId(n.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <title>{n.title || n.id}</title>
              </circle>
              {/* The visible dot */}
              <circle
                cx={sx(n.x)} cy={sy(n.y)} r={r}
                fill={t.color}
                stroke={isSel ? "var(--tx)" : (isHover ? t.color : "none")}
                strokeWidth={isSel ? 1.2 : (isHover ? 2 : 1)}
                strokeOpacity={isHover && !isSel ? 0.4 : 1}
                style={{ pointerEvents: "none", transition: "r 0.12s" }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// (removed FloatingPicker — only used by the unreachable LayoutStudio dev-mockup)

function useResizable(initial, min, max) {
  const [size, setSize] = useState(initial);
  const sizeRef = useRef(initial);
  useEffect(() => { sizeRef.current = size; }, [size]);
  const startDrag = React.useCallback((direction) => (e) => {
    e.preventDefault();
    const isVertical = direction === "up" || direction === "down";
    const startCoord = isVertical ? e.clientY : e.clientX;
    const base = sizeRef.current;
    // right / down: +, left / up: -
    const sign = (direction === "right" || direction === "down") ? 1 : -1;
    const onMove = (ev) => {
      const cur = isVertical ? ev.clientY : ev.clientX;
      setSize(Math.max(min, Math.min(max, base + (cur - startCoord) * sign)));
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.body.style.cursor = isVertical ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [min, max]);
  return [size, startDrag, setSize];
}

function useDraggable(initialPos) {
  const [pos, setPos] = useState(initialPos); // { x, y } or null (use CSS default)
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);
  const onDragStart = React.useCallback((e) => {
    e.preventDefault();
    const el = e.target.closest('.minimap, .layout-switcher');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const parent = el.offsetParent?.getBoundingClientRect() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    const onMove = (ev) => {
      const x = ev.clientX - offX - parent.left;
      const y = ev.clientY - offY - parent.top;
      setPos({ x: Math.max(0, Math.min(parent.width - rect.width, x)), y: Math.max(0, Math.min(parent.height - rect.height, y)) });
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);
  const style = pos ? { position: "absolute", left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : {};
  return [style, onDragStart];
}

// (removed Layout* dev-mockups: Inspector/Focus/DevTools/Studio — never rendered: no switcher mounted, `layout` fixed to "inspector", computed <Layout> never placed in tree; no storage/save logic)

export function DraftBar({ drafts, onDiscard, onImplement, implementing }) {
  if (drafts.length === 0) return null;
  return (
    <div className="draft-bar">
      <span className="draft-count">{drafts.length}</span>
      <span>draft node{drafts.length > 1 ? "s" : ""} pending</span>
      <button className="draft-implement" onClick={onImplement} disabled={implementing}>
        {implementing ? (
          <><span className="run-pulse" /> Implementing…</>
        ) : (
          <>⚡ Ask Claude to implement</>
        )}
      </button>
      <button className="draft-discard" onClick={onDiscard}>Discard</button>
    </div>
  );
}
