// Detail pages (subagent/hook/command/skill). Phase 3 module — extracted verbatim from app.jsx.
import React, { useState, useEffect } from 'react'

export function SubagentDetailPage({ agent, onBack }) {
  const layerColors = { "built-in": "#6b7280", user: "#2563eb", project: "#059669", managed: "#d97706" };
  const layerLabel = { "built-in": "BUILT-IN", user: "USER", project: "PROJECT", managed: "MANAGED" };
  const lc = layerColors[agent.layer] || "#6b7280";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(agent.prompt || "");

  function handleSave() {
    // In real mode, would save via API. For demo, update in-memory.
    agent.prompt = draft;
    setEditing(false);
  }
  function handleCancel() {
    setDraft(agent.prompt || "");
    setEditing(false);
  }

  return (
    <div className="sa-page">
      <div className="sa-topbar">
        <button className="sa-back" onClick={onBack}>&larr; Back</button>
        <div className="bc">
          <span className="bc-muted">subagents</span>
          <span className="bc-sep">/</span>
          <span className="bc-cur">{agent.name}</span>
        </div>
      </div>

      <div className="sa-body">
        <div className="sa-content">
          <div className="sa-hero">
            <div className="sa-icon" style={{ borderColor: lc, color: lc }}>◇</div>
            <div className="sa-hero-body">
              <h1 className="sa-hero-name">{agent.name}</h1>
              <p className="sa-hero-desc">{agent.desc}</p>
              <div className="sa-meta-row">
                <span className="sa-meta-pill"><span className="dot" style={{ background: lc }} />{layerLabel[agent.layer] || agent.layer}</span>
                {agent.model && <span className="sa-meta-pill" style={{ color: "var(--c-subagent)", borderColor: "color-mix(in srgb, var(--c-subagent) 30%, transparent)" }}>{agent.model}</span>}
                {agent.type === "custom" && agent.source && <span className="sa-meta-pill">{agent.source}</span>}
              </div>
            </div>
          </div>

          <div className="sa-card">
            <div className="sa-card-head">
              <div className="sa-card-title">Prompt</div>
              {!editing && <button className="sa-edit-toggle" onClick={() => setEditing(true)}>Edit</button>}
            </div>
            {editing ? (
              <>
                <textarea className="sa-prompt-edit" value={draft} onChange={e => setDraft(e.target.value)} />
                <div className="sa-prompt-actions">
                  <button className="sa-btn" onClick={handleCancel}>Cancel</button>
                  <button className="sa-btn sa-btn-primary" onClick={handleSave}>Save</button>
                </div>
              </>
            ) : (
              <pre className="sa-prompt-pre">{agent.prompt || "(No prompt set)"}</pre>
            )}
          </div>

          <div className="sa-card">
            <div className="sa-card-title">Allowed tools</div>
            {agent.allowed_tools && agent.allowed_tools.length > 0 ? (
              <div className="sa-tools-grid">
                {agent.allowed_tools.map(t => <ToolChipWithDetail key={t} toolName={t} />)}
              </div>
            ) : (
              <div className="sa-empty-note">No restrictions — all tools available</div>
            )}
          </div>

          <div className="sa-card">
            <div className="sa-card-title">Configuration</div>
            <div className="sa-kv-list">
              <div className="sa-kv"><span className="sa-kv-k">Layer</span><span className="sa-kv-v">{layerLabel[agent.layer] || agent.layer}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">Model</span><span className="sa-kv-v">{agent.model || "Default (inherited)"}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">Type</span><span className="sa-kv-v">{agent.type === "built-in" ? "Built-in" : "Custom definition"}</span></div>
              {agent.source && <div className="sa-kv"><span className="sa-kv-k">Definition file</span><span className="sa-kv-v" style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12 }}>{agent.source}</span></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ══════════ HOOK DETAIL PAGE ══════════

export function HookDetailPage({ hook, onBack }) {
  const layerColors = { "built-in": "#6b7280", user: "#2563eb", project: "#059669", managed: "#d97706" };
  const layerLabel = { "built-in": "BUILT-IN", user: "USER", project: "PROJECT", managed: "MANAGED" };
  const lc = layerColors[hook.layer] || "#6b7280";
  const eventColors = { PreToolUse: "#d97706", PostToolUse: "#059669", Notification: "#6366f1", Stop: "#dc2626", SubagentStop: "#dc2626" };
  const ec = eventColors[hook.type] || "#6b7280";

  // Determine if hook can block/modify or is observe-only
  const isPre = hook.type.startsWith("Pre");
  const decisionLabel = isPre
    ? "allow / block / modify"
    : "Observe only (runs as a side effect)";

  // Simple flow steps for visualization
  const flowSteps = isPre ? [
    { icon: "⚡", label: "Event fired", desc: `Claude is about to use ${hook.matcher}` },
    { icon: "🔍", label: "Matcher check", desc: `Matches pattern "${hook.matcher}"?` },
    { icon: "📥", label: "Receive data", desc: hook.input_summary || "Receives the tool name and input as JSON" },
    { icon: "⚙", label: "Run script", desc: hook.script },
    { icon: "📤", label: "Return decision", desc: hook.output_summary || "allow / block / modify" },
    { icon: isPre ? "✅" : "📋", label: isPre ? "Claude follows the decision" : "Log the result", desc: isPre ? "On allow, run the tool; on block, abort" : "Record the tool's execution result" },
  ] : [
    { icon: "⚡", label: "Tool run completed", desc: `Claude finished using ${hook.matcher}` },
    { icon: "🔍", label: "Matcher check", desc: `Matches pattern "${hook.matcher}"?` },
    { icon: "📥", label: "Receive result", desc: hook.input_summary || "Receives the tool's result as JSON" },
    { icon: "⚙", label: "Run script", desc: hook.script },
    { icon: "📋", label: "Done", desc: hook.output_summary || "Side effects such as logging or notifications" },
  ];

  return (
    <div className="sa-page">
      <div className="sa-topbar">
        <button className="sa-back" onClick={onBack}>&larr; Back</button>
        <div className="bc">
          <span className="bc-muted">hooks</span>
          <span className="bc-sep">/</span>
          <span className="bc-cur">{hook.name}</span>
        </div>
      </div>

      <div className="sa-body">
        <div className="sa-content">
          {/* Hero */}
          <div className="sa-hero">
            <div className="sa-icon" style={{ borderColor: ec, color: ec, fontSize: 18 }}>⌘</div>
            <div className="sa-hero-body">
              <h1 className="sa-hero-name">{hook.name}</h1>
              <p className="sa-hero-desc">{hook.description || `${hook.type} hook — matches ${hook.matcher}`}</p>
              <div className="sa-meta-row">
                <span className="sa-meta-pill"><span className="dot" style={{ background: lc }} />{layerLabel[hook.layer]}</span>
                <span className="sa-meta-pill" style={{ color: ec, borderColor: `color-mix(in srgb, ${ec} 30%, transparent)` }}>{hook.type}</span>
                <span className="sa-meta-pill" style={{ fontFamily: '"Geist Mono", monospace' }}>{hook.matcher}</span>
              </div>
            </div>
          </div>

          {/* What this hook does — plain language */}
          <div className="sa-card">
            <div className="sa-card-title">What this hook does</div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--tx-2)" }}>
              {isPre ? (
                <span>Runs automatically <strong>before</strong> Claude uses <code style={{ background: "var(--bg-3)", padding: "2px 6px", borderRadius: 4 }}>{hook.matcher}</code>. If the script returns "block", the tool call is blocked.</span>
              ) : (
                <span>Runs automatically <strong>after</strong> Claude uses <code style={{ background: "var(--bg-3)", padding: "2px 6px", borderRadius: 4 }}>{hook.matcher}</code>. It performs additional processing on the tool's result, such as logging or notifications.</span>
              )}
            </div>
            {hook.use_case && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--tx-3)", borderTop: "1px solid var(--bd)", paddingTop: 10 }}>
                💡 <strong>Example use:</strong> {hook.use_case}
              </div>
            )}
          </div>

          {/* Flow visualization */}
          <div className="sa-card">
            <div className="sa-card-title">Execution flow</div>
            <div className="hook-flow">
              {flowSteps.map((step, i) => (
                <React.Fragment key={i}>
                  <div className="hook-flow-step">
                    <div className="hook-flow-icon">{step.icon}</div>
                    <div className="hook-flow-body">
                      <div className="hook-flow-label">{step.label}</div>
                      <div className="hook-flow-desc">{step.desc}</div>
                    </div>
                  </div>
                  {i < flowSteps.length - 1 && <div className="hook-flow-arrow">↓</div>}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* I/O examples */}
          <div className="sa-card">
            <div className="sa-card-title">Input/output data</div>
            <div className="sa-kv-list" style={{ gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>📥 Input (stdin)</div>
                <div style={{ fontSize: 12, color: "var(--tx-3)", marginBottom: 6 }}>{hook.input_summary}</div>
                {hook.input_example && <pre className="sa-prompt-pre" style={{ fontSize: 11, padding: "10px 14px" }}>{hook.input_example}</pre>}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>📤 Output (stdout)</div>
                <div style={{ fontSize: 12, color: "var(--tx-3)", marginBottom: 6 }}>{hook.output_summary}</div>
                {hook.output_example && <pre className="sa-prompt-pre" style={{ fontSize: 11, padding: "10px 14px" }}>{hook.output_example}</pre>}
              </div>
            </div>
          </div>

          {/* Decision examples */}
          {hook.examples && hook.examples.length > 0 && (
            <div className="sa-card">
              <div className="sa-card-title">Decision examples</div>
              <div style={{ fontSize: 13, color: "var(--tx-3)", marginBottom: 16, lineHeight: 1.5 }}>
                {isPre ? "Here's when it gets approved and when it gets blocked." : "All pass through, but the processing differs."}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {hook.examples.map((ex, i) => (
                  <div key={i} className="hook-example" style={{
                    display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10,
                    background: ex.decision === "allow" ? "rgba(22,163,74,0.04)" : "rgba(220,38,38,0.04)",
                    border: `1px solid ${ex.decision === "allow" ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)"}`,
                  }}>
                    <div style={{
                      flexShrink: 0, width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                      background: ex.decision === "allow" ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
                      color: ex.decision === "allow" ? "#16a34a" : "#dc2626",
                    }}>
                      {ex.decision === "allow" ? "✓" : "✗"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tx-1)" }}>{ex.title}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                          background: ex.decision === "allow" ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
                          color: ex.decision === "allow" ? "#16a34a" : "#dc2626",
                        }}>{ex.decision === "allow" ? "Approved" : "Blocked"}</span>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: '"Geist Mono", monospace', color: "var(--tx-3)", marginBottom: 4, wordBreak: "break-all" }}>{ex.input}</div>
                      <div style={{ fontSize: 12, color: "var(--tx-2)" }}>{ex.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Config */}
          <div className="sa-card">
            <div className="sa-card-title">Configuration</div>
            <div className="sa-kv-list">
              <div className="sa-kv"><span className="sa-kv-k">Layer</span><span className="sa-kv-v">{layerLabel[hook.layer]}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">Event</span><span className="sa-kv-v">{hook.type}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">Matcher</span><span className="sa-kv-v" style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12 }}>{hook.matcher}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">Handler</span><span className="sa-kv-v">{hook.handler || "command"}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">Script</span><span className="sa-kv-v" style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12 }}>{hook.script}</span></div>
              {hook.timeout && <div className="sa-kv"><span className="sa-kv-k">Timeout</span><span className="sa-kv-v">{hook.timeout / 1000}s</span></div>}
              <div className="sa-kv"><span className="sa-kv-k">Decision authority</span><span className="sa-kv-v">{decisionLabel}</span></div>
              {hook.config_path && <div className="sa-kv"><span className="sa-kv-k">Definition file</span><span className="sa-kv-v" style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12 }}>{hook.config_path}</span></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CommandDetailPage({ command, onBack }) {
  const layerColors = { "built-in": "#6b7280", user: "#2563eb", project: "#059669", managed: "#d97706" };
  const layerLabel = { "built-in": "BUILT-IN", user: "USER", project: "PROJECT", managed: "MANAGED" };
  const lc = layerColors[command.layer] || "#6b7280";
  const isBuiltin = command.layer === "built-in";
  const [copied, setCopied] = React.useState(false);
  // Prompt body: in demo mode command.prompt is inline; with real data, fetch it from the source file
  const [src, setSrc] = React.useState(null); // null=not fetched | {loading} | {content,path} | {error}

  React.useEffect(() => {
    if (isBuiltin || command.prompt || !command.flowId) return;
    let alive = true;
    setSrc({ loading: true });
    fetch(`/api/flows/${encodeURIComponent(command.flowId)}/source`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.detail || "Failed to read")))
      .then(d => { if (alive) setSrc({ content: d.content, path: d.path }); })
      .catch(err => { if (alive) setSrc({ error: String(err) }); });
    return () => { alive = false; };
  }, [command.flowId]);

  const promptText = command.prompt || (src && src.content) || "";
  const promptPath = (src && src.path) || command.sourcePath;

  function copyPrompt() {
    navigator.clipboard.writeText(promptText).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="sa-page">
      <div className="sa-topbar">
        <button className="sa-back" onClick={onBack}>&larr; Back</button>
        <div className="bc">
          <span className="bc-muted">commands</span>
          <span className="bc-sep">/</span>
          <span className="bc-cur">{command.name}</span>
        </div>
      </div>

      <div className="sa-body">
        <div className="sa-content">
          {/* Hero */}
          <div className="sa-hero">
            <div className="sa-icon" style={{ borderColor: lc, color: lc, fontSize: 18 }}>⌨</div>
            <div className="sa-hero-body">
              <h1 className="sa-hero-name" style={{ fontFamily: '"Geist Mono", monospace' }}>{command.name}</h1>
              <p className="sa-hero-desc">{command.desc}</p>
              <div className="sa-meta-row">
                <span className="sa-meta-pill"><span className="dot" style={{ background: lc }} />{layerLabel[command.layer]}</span>
              </div>
            </div>
          </div>

          {/* What this command does */}
          <div className="sa-card">
            <div className="sa-card-title">What this command can do</div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--tx-2)" }}>
              {command.overview || command.desc}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--tx-3)", borderTop: "1px solid var(--bd)", paddingTop: 10 }}>
              {isBuiltin
                ? <span>💡 <code style={{ background: "var(--bg-3)", padding: "2px 6px", borderRadius: 4 }}>{command.name}</code> is a built-in command shipped with Claude Code itself (it runs as a native feature, not via prompt injection).</span>
                : <span>💡 A slash command works like this: typing <code style={{ background: "var(--bg-3)", padding: "2px 6px", borderRadius: 4 }}>{command.name}</code> injects the prompt below into Claude.</span>}
            </div>
          </div>

          {/* Prompt — or built-in badge */}
          {isBuiltin ? (
            <div className="sa-card">
              <div className="sa-card-title">Injected prompt</div>
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10,
                background: "var(--bg-2)", border: "1px solid var(--bd)", fontSize: 13, color: "var(--tx-3)",
              }}>
                <span style={{ fontSize: 16 }}>🔒</span>
                <span><strong style={{ color: "var(--tx-2)" }}>Built-in command</strong> — there is no editable prompt file. It runs as behavior built into Claude Code itself.</span>
              </div>
            </div>
          ) : (
            <div className="sa-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div className="sa-card-title" style={{ marginBottom: promptPath ? 2 : 0 }}>Injected prompt</div>
                  {promptPath && <div style={{ fontSize: 11, color: "var(--tx-4)", fontFamily: '"Geist Mono", monospace' }}>{promptPath}</div>}
                </div>
                {promptText && (
                  <button className="cmd-detail-btn" onClick={copyPrompt} title="Copy prompt">{copied ? "Copied" : "Copy"}</button>
                )}
              </div>
              {src && src.loading
                ? <div style={{ fontSize: 13, color: "var(--tx-3)" }}>Loading…</div>
                : src && src.error
                ? <div style={{ fontSize: 13, color: "#dc2626" }}>⚠️ Failed to load the prompt ({src.error})</div>
                : promptText
                ? <pre className="sa-prompt-pre">{promptText}</pre>
                : <div style={{ fontSize: 13, color: "var(--tx-3)" }}>This command has no prompt body.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// kind 3/4 (ruleset/reference) skills are not rendered as flow diagrams; the SKILL.md sections are shown as cards instead.
// The backend's attach_kind sets flow.kind / flow.kind_label / flow.sections.
const SKILL_KIND_JP = { ruleset: "Principles & rules", reference: "Reference & knowledge" };

export function SkillCard({ flow, onBack }) {
  const sections = flow.sections || [];
  const label = SKILL_KIND_JP[flow.kind_label] || flow.kind_label || "";
  return (
    <div className="skill-card-view">
      <div className="skill-card-inner">
        {onBack && <button className="skill-card-back" onClick={onBack}>← Dashboard</button>}
        <div className="skill-card-head">
          <h2>{flow.name}</h2>
          <span className="muted">{label} · {sections.length} sections</span>
        </div>
        <div className="skill-card-body">
          {sections.map((s, i) => (
            <section key={i} className={`skill-card-sec lvl-${s.level || 2}`}>
              {s.heading && <h3 className="skill-card-h">{s.heading}</h3>}
              {s.body && <pre className="skill-card-text">{s.body}</pre>}
            </section>
          ))}
          {sections.length === 0 && <p className="muted">(No sections)</p>}
        </div>
      </div>
    </div>
  );
}

// If the flow JSON has no flow.start / flow.end nodes, add them. A normalization that loadFlow always runs.
// (The definition was lost during plugin extraction, so it was restored — there were 3 remaining call sites in loadFlow.)
export function ensureFlowEndpoints(flow) {
  if (!flow || !Array.isArray(flow.nodes) || flow.nodes.length === 0) return flow;
  const nodes = flow.nodes;
  const edges = Array.isArray(flow.edges) ? flow.edges : [];
  const cap = (n) => (n.meta && n.meta.capability) || (n.config && n.config.capability);
  const hasStart = nodes.some(n => cap(n) === "flow.start");
  const hasEnd = nodes.some(n => cap(n) === "flow.end");
  if (hasStart && hasEnd) return flow;

  const DY = 130;
  const xs = nodes.map(n => typeof n.x === "number" ? n.x : 420);
  const ys = nodes.map(n => typeof n.y === "number" ? n.y : 70);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const base = () => ({ desc: "", config: {}, depends: [], input: {}, output: {}, duration: "", io_desc: [] });

  const newNodes = [...nodes];
  const newEdges = [...edges];

  if (!hasStart) {
    const inDeg = {}; nodes.forEach(n => { inDeg[n.id] = 0; });
    edges.forEach(e => { if (e.to in inDeg) inDeg[e.to]++; });
    const heads = nodes.filter(n => inDeg[n.id] === 0);
    newNodes.unshift({ ...base(), id: "flow-start", type: "trigger",
      title: "Flow start", subtitle: "Inputs and trigger",
      meta: { capability: "flow.start" }, x: minX, y: minY - DY });
    (heads.length ? heads : nodes.slice(0, 1)).forEach(h => newEdges.push({ from: "flow-start", to: h.id }));
  }
  if (!hasEnd) {
    const outDeg = {}; nodes.forEach(n => { outDeg[n.id] = 0; });
    edges.forEach(e => { if (e.from in outDeg) outDeg[e.from]++; });
    const tails = nodes.filter(n => outDeg[n.id] === 0);
    newNodes.push({ ...base(), id: "flow-end", type: "parent",
      title: "Flow end", subtitle: "Outputs and destinations",
      meta: { capability: "flow.end" }, x: minX, y: maxY + DY });
    (tails.length ? tails : nodes.slice(-1)).forEach(t => newEdges.push({ from: t.id, to: "flow-end" }));
  }
  return { ...flow, nodes: newNodes, edges: newEdges };
}
