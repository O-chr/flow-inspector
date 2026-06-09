// Board/skill AI chat panels (FlowBuildChat, SkillDiscussChat, ClaudeMdChat, SkillSaveFlow).
// Phase 3 module — extracted verbatim.
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { API, apiFetch } from '../lib/api.js'
import { extractTaggedJson } from '../lib/json.js'
import { applyFlowActions, boardToWorkflow, missingRequiredForBoard, validateFlowForSkill } from '../lib/board-model.js'

// Flow-building AI chat (targets the whole board). Conversation → flow_actions proposal → confirm and apply.
// Uses /api/chat with context_type="flow-build", sending the current board (unsaved OK) so the AI can propose edits.
export function FlowBuildChat({ board, flowMeta, onApplyActions, onClose }) {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [available, setAvailable] = React.useState(null);
  const [proposal, setProposal] = React.useState(null);  // { actions, summary, warnings }
  const messagesEnd = React.useRef(null);
  const taRef = React.useRef(null);
  const boardRef = React.useRef(board);
  React.useEffect(() => { boardRef.current = board; }, [board]);
  const reviewedSigRef = React.useRef(null);  // signature of the board last shown in a pre-save review

  // ── Conversation history (same mechanism as Eval Chat: saved per flow, reselectable from history) ──
  const fcFlowId = flowMeta?.id || null;
  const [sessions, setSessions] = React.useState([]);
  const [currentSessionId, setCurrentSessionId] = React.useState(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const sessionIdRef = React.useRef(null);
  React.useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);

  async function loadSessions() {
    if (!fcFlowId || window.__DEMO_MODE__) return;
    try {
      const list = await apiFetch(`/api/flows/${fcFlowId}/flowchat/sessions`);
      setSessions(Array.isArray(list) ? list : []);
    } catch (e) { /* no history is fine */ }
  }
  React.useEffect(() => { loadSessions(); }, [fcFlowId]);

  async function loadSession(id) {
    setShowHistory(false);
    try {
      const s = await apiFetch(`/api/flows/${fcFlowId}/flowchat/sessions/${id}`);
      setCurrentSessionId(id);
      setMessages(s.messages || []);
      setProposal(null);
    } catch (e) { alert("Failed to load conversation: " + e.message); }
  }
  function newChat() {
    setCurrentSessionId(null);
    setMessages([]);
    setProposal(null);
    setShowHistory(false);
  }
  async function deleteSession(id, e) {
    if (e) e.stopPropagation();
    if (!window.confirm("Delete this conversation?")) return;
    try {
      await fetch(API + `/api/flows/${fcFlowId}/flowchat/sessions/${id}`, { method: "DELETE" });
      if (id === sessionIdRef.current) newChat();
      await loadSessions();
    } catch (err) { alert("Failed to delete: " + err.message); }
  }
  async function persistSession(msgs) {
    if (!fcFlowId || window.__DEMO_MODE__ || !msgs || !msgs.length) return;
    let sid = sessionIdRef.current;
    if (!sid) { sid = `fc_${Date.now()}`; setCurrentSessionId(sid); }
    try {
      await fetch(API + `/api/flows/${fcFlowId}/flowchat/sessions/${sid}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs.filter(m => m.role === "user" || m.role === "assistant") }),
      });
      await loadSessions();
    } catch (e) { console.warn("Failed to save conversation", e); }
  }

  React.useEffect(() => {
    apiFetch("/api/chat/status").then(r => setAvailable(r.available)).catch(() => setAvailable(false));
  }, []);
  React.useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, proposal]);

  function tryParseActions(fullText) {
    const arr = extractTaggedJson(fullText, "flow_actions");
    if (Array.isArray(arr) && arr.length) return arr;
    return null;
  }

  // Finalize block for turning the flow into a skill/command inside chat: ```flow_finalize {as,name,description}```
  function tryParseFinalize(fullText) {
    const obj = extractTaggedJson(fullText, "flow_finalize");
    if (obj && typeof obj === "object" && !Array.isArray(obj) && obj.as) return obj;
    return null;
  }

  // Finalize: deterministic checks → pre-save review (MCP preflight + AI flow-review) → stage for publishing.
  // The body is preserved (not regenerated). If the review raises findings, show them once and stop; re-finalizing
  // the same board lets it through (= the modal's "proceed anyway" behavior, expressed via chat).
  async function runFinalize(spec) {
    const b = boardRef.current || {};
    const items = b.items || [], edges = b.edges || [];
    const kind = spec.as === "command" ? "command" : "skill";
    const label = kind === "command" ? "command" : "skill";
    const folder = kind === "command" ? "~/.claude/commands" : SKILL_FOLDER_PRESETS[0];
    const nm = (spec.name || b.name || kind), desc = (spec.description || b.desc || "");
    const subFlow = boardToWorkflow({ ...b, name: nm, desc },
      { name: nm, description: desc, source: { type: "skill" } });

    // ① Deterministic checks (fatal = cannot save)
    const det = validateFlowForSkill(items, edges);
    const fatal = det.filter(w => w.level === "error");
    if (fatal.length) {
      setMessages(m => [...m, { role: "system", content: "⚠ Can't finalize (critical gaps):\n" + fatal.map(w => `• ${w.title}${w.detail ? " — " + w.detail : ""}`).join("\n") + "\nFix these, then finalize again." }]);
      return;
    }

    // ② Pre-save review (runs if the board changed since it was last shown). If there are findings, show them and pause.
    const sig = JSON.stringify({ n: items.map(i => ({ id: i.id, t: i.nodeType, m: i.meta, l: i.label })), e: edges });
    if (reviewedSigRef.current !== sig) {
      let mcpW = [], aiW = [];
      try {
        const r = await fetch(API + "/api/skills/preflight-mcp", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flow: subFlow }),
        });
        if (r.ok) { const d = await r.json(); mcpW = Array.isArray(d.warnings) ? d.warnings : []; }
      } catch (e) {}
      try {
        const det2 = [...det.filter(w => w.level === "warn"), ...mcpW].map(w => ({ title: w.title, detail: w.detail }));
        const res = await fetch(API + "/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: `Review this ${label} before saving` }], context_type: "flow-review", board: subFlow, det_findings: det2 }),
        });
        const reader = res.body.getReader(); const dec = new TextDecoder(); let txt = "";
        while (true) { const { done, value } = await reader.read(); if (done) break;
          for (const line of dec.decode(value).split("\n")) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") { try { txt += JSON.parse(line.slice(6)).text; } catch (e) {} }
          }
        }
        const j = extractTaggedJson(txt, "review");
        aiW = Array.isArray(j) ? j : [];
      } catch (e) {}
      const report = [...det.filter(w => w.level === "warn"), ...mcpW, ...aiW];
      if (report.length) {
        reviewedSigRef.current = sig;  // re-finalizing the same board passes next time
        setMessages(m => [...m, { role: "system", content: `🔎 Pre-save review findings (${report.length}):\n` + report.map(w => `• ${w.title}${w.detail ? " — " + w.detail : ""}`).join("\n") + `\n\nGive instructions to fix them, or say "save anyway" to save despite the findings.` }]);
        return;
      }
      reviewedSigRef.current = sig;  // clean
    }

    // ③ Stage (body preserved)
    try {
      const res = await fetch(API + "/api/skills/stage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, name: nm, description: desc, flow: subFlow, kind }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || `HTTP ${res.status}`); }
      const d = await res.json();
      setMessages(m => [...m, { role: "system", content: `✓ Saved "${nm}" to the publish queue (${label}).\nSaved to: ${d.path}\nTo publish: ⚡ Skills → Publish queue → "Sync to production".` }]);
    } catch (e) {
      setMessages(m => [...m, { role: "system", content: "Failed to turn into a " + label + ": " + (e.message || e) }]);
    }
  }

  function autoResize() { const ta = taRef.current; if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; } }

  async function send(text) {
    const userMsg = (text || input).trim();
    if (!userMsg || streaming) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setProposal(null);
    const newMsgs = [...messages, { role: "user", content: userMsg }];
    setMessages(newMsgs);
    setStreaming(true);
    try {
      const b = boardRef.current || {};
      const liveFlow = boardToWorkflow(b, { id: flowMeta?.id, name: b.name, description: b.desc, source: { type: flowMeta?.sourceType || "skill" } });
      // UI-only messages such as apply confirmations (role:"system") are not sent to the API.
      // The backend's ChatMessage.role only allows user/assistant (anything else → 422).
      const apiMsgs = newMsgs.filter(m => m.role === "user" || m.role === "assistant");
      const res = await fetch(API + "/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMsgs, context_type: "flow-build", board: liveFlow, flow_id: flowMeta?.id || null, required_status: missingRequiredForBoard(b.items || []) }),
      });
      if (!res.ok) {
        let detail = "";
        try { detail = (await res.json()).detail || ""; } catch (e) {}
        throw new Error(`Server error (HTTP ${res.status})${detail ? " — " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 120) : ""}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages(m => [...m, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              assistantText += data.text;
              setMessages(m => { const u = [...m]; u[u.length - 1] = { role: "assistant", content: assistantText }; return u; });
            } catch (e) {}
          }
        }
      }
      const actions = tryParseActions(assistantText);
      if (actions) {
        const prev = applyFlowActions(boardRef.current, actions);
        setProposal({ actions, summary: prev.summary, warnings: prev.warnings });
      }
      const fin = tryParseFinalize(assistantText);
      if (fin) await runFinalize(fin);
      // Persist the conversation (so it can be reselected from history)
      persistSession([...newMsgs, { role: "assistant", content: assistantText }]);
    } catch (e) {
      setMessages(m => [...m, { role: "system", content: "Connection error: " + e.message }]);
    }
    setStreaming(false);
  }

  function onKeyDown(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }

  function apply() {
    if (!proposal) return;
    const n = proposal.summary.length;
    onApplyActions(proposal.actions);
    setProposal(null);
    setMessages(m => [...m, { role: "system", content: `✓ Applied ${n} operation(s) to the board` }]);
  }

  const suggestions = [
    "Build a flow that checks Gmail, summarizes it, and drafts a reply",
    "Add a notification node to the current flow",
    "Explain the overall flow",
  ];

  return (
    <div className="plan-chat-panel">
      <div className="plan-chat-head">
        <span className="plan-chat-head-icon">💬</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="plan-chat-head-title">Flow Build Assistant</div>
          <div className="plan-chat-head-sub">Add, configure, and connect nodes by chatting (confirm before applying)</div>
        </div>
        {fcFlowId && (
          <div className="plan-chat-history-wrap" style={{ position: "relative" }}>
            <button className="plan-chat-iconbtn" onClick={() => setShowHistory(v => !v)} disabled={sessions.length === 0} title="Open past conversations">🕘{sessions.length > 0 ? ` ${sessions.length}` : ""}</button>
            {showHistory && (
              <div className="eval-chat-history-menu">
                {sessions.length === 0 && <div className="eval-chat-history-empty">No saved conversations</div>}
                {sessions.map(s => (
                  <div key={s.id} className={`eval-chat-history-item ${s.id === currentSessionId ? "is-active" : ""}`} onClick={() => loadSession(s.id)}>
                    <div className="eval-chat-history-info">
                      <div className="eval-chat-history-title">{s.title || "(untitled)"}</div>
                      <div className="eval-chat-history-meta">{s.message_count} messages</div>
                    </div>
                    <button className="eval-chat-history-del" onClick={(e) => deleteSession(s.id, e)} title="Delete this conversation">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button className="plan-chat-iconbtn" onClick={newChat} title="Start a new chat (history is kept)">🆕</button>
        <button className="plan-chat-iconbtn" onClick={onClose} title="Close">×</button>
      </div>
      {available === false ? (
        <div className="chat-unavailable" style={{ padding: 18 }}>
          <div className="chat-empty-icon">⚡</div>
          <h4>Claude CLI not found</h4>
          <p>Chat runs through the Claude Code CLI</p>
        </div>
      ) : (
        <div className="chat-panel" style={{ flex: 1, minHeight: 0 }}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-icon">🛠️</div>
              <h4>Build a flow by chatting</h4>
              <p>Describe what you want to do and the AI will propose nodes to add, configure, and connect.<br/>The board doesn't change until you press "Apply".</p>
              <div className="chat-suggestions">
                {suggestions.map((s, i) => <button key={i} className="chat-suggest-btn" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          ) : (
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role}`}>
                  {m.role === "assistant" ? m.content.replace(/```(?:flow_actions|flow_finalize)\s*\n[\s\S]*?\n```/g, "").trim() : m.content}
                </div>
              ))}
              {streaming && <div className="chat-typing"><span/><span/><span/></div>}
              {proposal && !streaming && (
                <div className="plan-chat-proposal">
                  <h5>📋 Proposed operations ({proposal.summary.length})</h5>
                  <ul className="plan-chat-actions">
                    {proposal.summary.length === 0
                      ? <li className="is-muted">No applicable operations found</li>
                      : proposal.summary.map((s, i) => <li key={i} className={s.startsWith("🗑") ? "is-danger" : ""}>{s}</li>)}
                  </ul>
                  {proposal.warnings.length > 0 && (
                    <div className="plan-chat-warns">{proposal.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}</div>
                  )}
                  <div className="plan-chat-proposal-btns">
                    <button onClick={() => setProposal(null)}>Dismiss</button>
                    <button className="primary" onClick={apply} disabled={proposal.summary.length === 0}>✓ Apply</button>
                  </div>
                </div>
              )}
              <div ref={messagesEnd} />
            </div>
          )}
          <div className="chat-input-wrap">
            <textarea ref={taRef} value={input} onChange={e => { setInput(e.target.value); autoResize(); }} onKeyDown={onKeyDown} placeholder="Describe the flow or change you want…" rows={1} />
            <button className="chat-send" onClick={() => send()} disabled={!input.trim() || streaming} title="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// Candidate save folders (the backend expands ~ and only allows paths under a safe root)
const SKILL_FOLDER_PRESETS = ["~/.claude/skills", "~/projects/your-project/.claude/skills"];

// Chat for discussing a saved skill with shared context. Same claude CLI / SSE as the other AI features.
// On open, the saved SKILL.md is passed as context and the AI presents a one-message summary.
export function SkillDiscussChat({ skillName, skillPath, skillContent, onClose }) {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const messagesEnd = React.useRef(null);
  const taRef = React.useRef(null);
  const kicked = React.useRef(false);
  React.useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send(text, asGreeting) {
    const userMsg = (text || input).trim();
    if (!userMsg || streaming) return;
    if (!asGreeting) setInput("");
    const visible = asGreeting ? [] : [...messages, { role: "user", content: userMsg }];
    if (!asGreeting) setMessages(visible);
    setStreaming(true);
    try {
      const res = await fetch(API + "/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // UI-only messages with role:"system" (error display, etc.) are excluded (backend allows only user/assistant → otherwise 422)
          messages: (asGreeting ? [{ role: "user", content: userMsg }] : visible).filter(m => m.role === "user" || m.role === "assistant"),
          context_type: "skill-discuss",
          board: { skill_name: skillName, skill_path: skillPath, skill_content: skillContent },
        }),
      });
      const reader = res.body.getReader(); const dec = new TextDecoder(); let txt = "";
      setMessages(m => [...m, { role: "assistant", content: "" }]);
      while (true) { const { done, value } = await reader.read(); if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try { txt += JSON.parse(line.slice(6)).text; setMessages(m => { const u = [...m]; u[u.length - 1] = { role: "assistant", content: txt }; return u; }); } catch (e) {}
          }
        }
      }
    } catch (e) { setMessages(m => [...m, { role: "system", content: "Connection error: " + e.message }]); }
    setStreaming(false);
  }
  React.useEffect(() => {
    if (kicked.current) return; kicked.current = true;
    send("I've saved this skill. In 2–3 sentences, summarize what flow it is and how it can be used, then help me think through how to use it.", true);
  }, []);
  function onKeyDown(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }
  function autoResize() { const ta = taRef.current; if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; } }

  return (
    <div className="plan-chat-panel">
      <div className="plan-chat-head">
        <span className="plan-chat-head-icon">★</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="plan-chat-head-title">Discuss {skillName}</div>
          <div className="plan-chat-head-sub" title={skillPath}>{skillPath}</div>
        </div>
        <button className="plan-chat-iconbtn" onClick={onClose} title="Close">×</button>
      </div>
      <div className="chat-panel" style={{ flex: 1, minHeight: 0 }}>
        <div className="chat-messages">
          {messages.map((m, i) => (<div key={i} className={`chat-msg ${m.role}`}>{m.content}</div>))}
          {streaming && <div className="chat-typing"><span/><span/><span/></div>}
          <div ref={messagesEnd} />
        </div>
        <div className="chat-input-wrap">
          <textarea ref={taRef} value={input} onChange={e => { setInput(e.target.value); autoResize(); }} onKeyDown={onKeyDown} placeholder="Ask about usage or adjustments…" rows={1} />
          <button className="chat-send" onClick={() => send()} disabled={!input.trim() || streaming} title="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// CLAUDE.md generation/editing chat: propose the body with the claude-md context, extract the code fence, and save to staging.
// SSE / message handling follow the same conventions as SkillDiscussChat.
export function ClaudeMdChat({ project, existing, layerId, layerTitle, targetPath, onClose, onSaved }) {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const deepRef = React.useRef(false);  // true after "look closer" is granted → adds deep to subsequent sends
  const systemRef = React.useRef(false);  // true after "inspect the system too" is granted → also reads systemd/nginx etc.
  const [failed, setFailed] = React.useState(false);   // last send failed → show retry button
  const lastPayloadRef = React.useRef(null);           // for retry: the last conversation that was sent
  const [saved, setSaved] = React.useState(false);     // saved to staging → switch to sync button
  const [syncing, setSyncing] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState(null);  // {ok,text} result of save/sync
  const messagesEnd = React.useRef(null);
  const taRef = React.useRef(null);
  const kicked = React.useRef(false);
  const intentRef = React.useRef(null);  // intent chosen at the entry point: "modify" (edit existing) | "add" (append) | "create" (new)
  const [sessions, setSessions] = React.useState([]);        // past conversations for this file [{id,title,ts,messages}] (newest first)
  const [currentSessionId, setCurrentSessionId] = React.useState(null);
  const [showHistory, setShowHistory] = React.useState(false);
  React.useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function runChat(payload) {
    lastPayloadRef.current = payload;
    setFailed(false);
    setStreaming(true);
    let txt = "", failure = null;
    try {
      const res = await fetch(API + "/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // backend accepts only user/assistant (system etc. → 422)
          messages: payload.filter(m => m.role === "user" || m.role === "assistant"),
          context_type: "claude-md",
          board: { project_path: (project && project.path) || "", existing_content: existing || "", layer: layerId || "project", deep: deepRef.current, probe_system: systemRef.current, intent: intentRef.current || null },
        }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const reader = res.body.getReader(); const dec = new TextDecoder();
      setMessages(m => [...m, { role: "assistant", content: "" }]);
      while (true) { const { done, value } = await reader.read(); if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try { txt += JSON.parse(line.slice(6)).text; setMessages(m => { const u = [...m]; u[u.length - 1] = { role: "assistant", content: txt }; return u; }); } catch (e) {}
          }
        }
      }
      if (!txt.trim()) failure = "The response was empty (possibly a timeout)";
      else if (txt.includes("[Error:")) failure = "An error occurred on the server";
    } catch (e) {
      setMessages(m => m.filter(x => !(x.role === "assistant" && !x.content)));  // remove empty bubble
      failure = "Connection failed: " + (e.message || e);
    }
    if (failure) { setMessages(m => [...m, { role: "system", content: "⚠️ " + failure + " — use \"Retry\" below to resend" }]); setFailed(true); }
    setStreaming(false);
  }

  async function send(text, asGreeting) {
    const userMsg = (text || input).trim();
    if (!userMsg || streaming) return;
    if (!asGreeting) setInput("");
    const base = messages.filter(m => m.role === "user" || m.role === "assistant");
    const payload = asGreeting ? [{ role: "user", content: userMsg }] : [...base, { role: "user", content: userMsg }];
    if (!asGreeting) setMessages(m => [...m, { role: "user", content: userMsg }]);
    await runChat(payload);
  }

  function retry() {
    if (streaming || !lastPayloadRef.current) return;
    setMessages(m => m.filter(x => x.role !== "system" && !(x.role === "assistant" && !x.content)));
    runChat(lastPayloadRef.current);
  }
  const cmdLsKey = "fi-cmd-msgs:" + (targetPath || "");          // old single-conversation key (for migration)
  const cmdSessKey = "fi-cmd-sessions:" + (targetPath || "");    // new multi-session key
  const loadSessionsLS = () => { try { const s = localStorage.getItem(cmdSessKey); if (s) return JSON.parse(s) || []; } catch (e) {} return []; };
  const saveSessionsLS = (arr) => { try { localStorage.setItem(cmdSessKey, JSON.stringify(arr)); } catch (e) {} };
  const sessionTitle = (msgs) => {
    const fu = msgs.find(m => m.role === "user");
    const t = ((fu && fu.content) || "New conversation").replace(/\s+/g, " ").trim();
    return t.length > 28 ? t.slice(0, 28) + "…" : t;
  };
  function loadHistorySession(sid) {
    const s = sessions.find(x => x.id === sid);
    if (!s) return;
    setCurrentSessionId(sid); setMessages(s.messages || []); setShowHistory(false);
    intentRef.current = null; setFailed(false);
  }
  function deleteHistorySession(sid, e) {
    if (e) e.stopPropagation();
    setSessions(prev => { const arr = prev.filter(x => x.id !== sid); saveSessionsLS(arr); return arr; });
    if (sid === currentSessionId) { setCurrentSessionId(null); setMessages([]); }
  }
  // First instruction per intent. Not sent to the LLM on open; sent after the user picks a button.
  const intentGreeting = (kind) => kind === "modify"
    ? "I want to review and improve the existing CLAUDE.md. For each item currently written, give concrete suggestions for what to improve or fix. Don't pad it out — focus on fixing what's there."
    : kind === "add"
      ? "I want to append new rules to CLAUDE.md. Propose candidates worth adding, as concrete drafts I can write in as-is. Don't duplicate the existing content."
      : "I want to create a CLAUDE.md from scratch. Propose candidate content worth including, as concrete drafts I can write in as-is.";
  function startWithIntent(kind) {
    if (streaming) return;
    intentRef.current = kind; setFailed(false);
    // For "add", don't fire the LLM right away — first just ask "what do you want to add?" (generate after the user answers)
    if (kind === "add") {
      setMessages([{ role: "assistant", content: "What would you like to add to CLAUDE.md? Describe the rule or note you want to include, and I'll shape it into something you can drop straight into CLAUDE.md." }]);
      setTimeout(() => taRef.current?.focus(), 50);
      return;
    }
    send(intentGreeting(kind), true);
  }
  React.useEffect(() => {
    if (kicked.current) return; kicked.current = true;
    let arr = loadSessionsLS();
    // If an old single conversation (fi-cmd-msgs) remains, migrate it as one session
    if (!arr.length) {
      try { const old = localStorage.getItem(cmdLsKey); if (old) { const m = JSON.parse(old); if (m && m.length) { arr = [{ id: "cmd_" + Date.now(), title: sessionTitle(m), ts: Date.now(), messages: m }]; saveSessionsLS(arr); } } } catch (e) {}
    }
    setSessions(arr);
    if (arr.length) { setCurrentSessionId(arr[0].id); setMessages(arr[0].messages || []); }  // restore the most recent conversation
  }, []);
  // Upsert the current conversation into the session array and save to localStorage (exclude empty bubbles / ⚠️)
  React.useEffect(() => {
    const clean = messages.filter(m => (m.role === "user" || m.role === "assistant") && m.content);
    if (!clean.length) return;
    let sid = currentSessionId;
    if (!sid) { sid = "cmd_" + Date.now(); setCurrentSessionId(sid); }
    setSessions(prev => {
      const arr = [...prev];
      const idx = arr.findIndex(s => s.id === sid);
      const title = (idx >= 0 && arr[idx].title) ? arr[idx].title : sessionTitle(clean);
      const rec = { id: sid, title, ts: Date.now(), messages: clean };
      if (idx >= 0) arr[idx] = rec; else arr.unshift(rec);
      saveSessionsLS(arr);
      return arr;
    });
  }, [messages]);
  function startFresh() {
    if (streaming) return;
    // The current conversation is already saved to a session. Start a new empty conversation (history is kept).
    intentRef.current = null; setFailed(false);
    setCurrentSessionId(null); setMessages([]); setShowHistory(false);
  }
  function onKeyDown(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }
  function autoResize() { const ta = taRef.current; if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; } }

  function extractClaudeMd(text) {
    if (!text) return null;
    // 4+-backtick outer fence: handles CLAUDE.md bodies that themselves contain
    // ```code``` blocks. Closing fence must match the opening run length (\1).
    let m = text.match(/(`{4,})(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*(?:\r?\n|$)/);
    if (m) return m[2].replace(/\n+$/,"") + "\n";
    // Legacy 3-backtick: greedy to the LAST closing ``` (don't truncate at an inner fence).
    m = text.match(/```(?:markdown|md)?[ \t]*\r?\n([\s\S]*)\r?\n```[ \t]*(?:\r?\n)?$/);
    if (m) return m[1].replace(/\n+$/,"") + "\n";
    m = text.match(/```(?:markdown|md)?\s*\n([\s\S]*?)```/);
    return m ? m[1].replace(/\n+$/,"") + "\n" : null;
  }
  // Parse for turning multiple-choice questions (each option on a "(a) ..." / "1. ..." line) into buttons.
  // Only lines with a letter/number marker count as options; plain "- " bullets in summaries are not picked up.
  function parseChoices(text) {
    if (!text) return { cleaned: text || "", choices: [] };
    const choices = [], keep = [];
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*[-*]?\s*(\([a-zA-Z]\)|[0-9]+[.)])\s+(.+?)\s*$/);
      if (m) choices.push({ full: (m[1] + " " + m[2]).trim() });
      else keep.push(line);
    }
    if (choices.length < 2) return { cleaned: text, choices: [] };
    return { cleaned: keep.join("\n").replace(/\n{3,}/g, "\n\n").trim(), choices };
  }
  // When the AI emits a ```ask-permission fence, show "Allow / Don't" buttons.
  function parsePermission(text) {
    if (!text) return { cleaned: text || "", ask: false, scope: "project" };
    const m = text.match(/```ask-permission([\s\S]*?)```/);
    if (!m) return { cleaned: text, ask: false, scope: "project" };
    const scope = /scope\s*:\s*system/i.test(m[1]) ? "system" : "project";
    return { cleaned: text.replace(/```ask-permission[\s\S]*?```/, "").replace(/\n{3,}/g, "\n\n").trim(), ask: true, scope };
  }
  // Most recent assistant message that actually contains a draft, so a trailing
  // follow-up question doesn't hide a draft produced a turn earlier.
  let draft = null;
  for (let k = messages.length - 1; k >= 0 && draft === null; k--) {
    if (messages[k].role === "assistant") draft = extractClaudeMd(messages[k].content);
  }
  // Reset save state when a new draft arrives
  React.useEffect(() => { setSaved(false); setSyncMsg(null); }, [draft]);
  // Warn if there's an unsaved draft and the user tries to close/reload the tab (localStorage restore exists too, but just in case)
  React.useEffect(() => {
    const h = (e) => { if (draft && !saved) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [draft, saved]);

  async function syncNow() {
    if (syncing) return;
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await fetch(API + "/api/workspace/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [targetPath] }) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      const pushed = (d.pushed || []).length, failed = (d.failed || []);
      if (pushed > 0) setSyncMsg({ ok: true, text: "✅ Published to production" });
      else if (failed.length) setSyncMsg({ ok: false, text: "⚠️ Publish failed: " + (failed[0].message || "unknown") });
      else setSyncMsg({ ok: false, text: "⚠️ Nothing to publish (save first)" });
    } catch (e) { setSyncMsg({ ok: false, text: "⚠️ Sync failed: " + (e.message || e) }); }
    setSyncing(false);
  }

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const r = await fetch(API + "/api/workspace/file", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetPath, content: draft }),
      });
      if (!r.ok) { const j = await r.json().catch(()=>({})); throw new Error(j.detail || ("HTTP " + r.status)); }
      setSaved(true); setSyncMsg(null);   // don't close the panel → you can "publish to production now" right here
      onSaved && onSaved();
    } catch (e) { setSyncMsg({ ok: false, text: "⚠️ Save failed: " + (e.message || e) }); }
    setSaving(false);
  }

  return (
    <div className="plan-chat-panel">
      <div className="plan-chat-head">
        <span className="plan-chat-head-icon">✨</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="plan-chat-head-title">{layerTitle || "PROJECT"} CLAUDE.md</div>
          <div className="plan-chat-head-sub" title={targetPath}>{targetPath}</div>
        </div>
        <div style={{ position: "relative" }}>
          <button className="plan-chat-iconbtn" onClick={() => setShowHistory(v => !v)} disabled={streaming} title="Conversation history">🕘</button>
          {showHistory && (
            <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, width: 260, maxHeight: 320, overflowY: "auto", background: "var(--bg-1, #fff)", border: "1px solid var(--bd, #e5e7eb)", borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,.14)", zIndex: 50, padding: 4 }}>
              <div style={{ fontSize: 10.5, color: "var(--tx-4)", padding: "4px 8px" }}>Conversation history (this file)</div>
              {sessions.length === 0
                ? <div style={{ fontSize: 11, color: "var(--tx-4)", padding: "8px" }}>None yet</div>
                : sessions.map(s => (
                  <div key={s.id} onClick={() => loadHistorySession(s.id)}
                       style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: s.id === currentSessionId ? "var(--accent-bg, #eff6ff)" : "transparent" }}
                       onMouseEnter={e => { if (s.id !== currentSessionId) e.currentTarget.style.background = "var(--bg-2, #f3f4f6)"; }}
                       onMouseLeave={e => { if (s.id !== currentSessionId) e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.title}>{s.title}</span>
                    <button onClick={e => deleteHistorySession(s.id, e)} title="Delete"
                            style={{ background: "none", border: "none", color: "var(--tx-4)", cursor: "pointer", fontSize: 12, padding: "0 2px" }}>✕</button>
                  </div>
                ))}
            </div>
          )}
        </div>
        <button className="plan-chat-iconbtn" onClick={startFresh} disabled={streaming} title="New (start a new conversation)">🆕</button>
        <button className="plan-chat-iconbtn" onClick={onClose} title="Close">×</button>
      </div>
      <div className="chat-panel" style={{ flex: 1, minHeight: 0 }}>
        <div className="chat-messages">
          {messages.length === 0 && !streaming && (
            <div className="chat-empty">
              <div className="chat-empty-icon">✨</div>
              <h4>{layerTitle || "PROJECT"} CLAUDE.md</h4>
              <p>What would you like to do? Pick one and the AI will act accordingly<br/>(nothing is sent to the AI until you press a button)</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 320, marginTop: 6 }}>
                {existing && <button className="chat-suggest-btn" style={{ textAlign: "left" }} onClick={() => startWithIntent("modify")}>✏️ Review and improve the existing one</button>}
                <button className="chat-suggest-btn" style={{ textAlign: "left" }} onClick={() => startWithIntent("add")}>➕ Append a new rule</button>
                {!existing && <button className="chat-suggest-btn" style={{ textAlign: "left" }} onClick={() => startWithIntent("create")}>✨ Create from scratch (propose candidates)</button>}
              </div>
            </div>
          )}
          {(() => {
            const lastA = messages.map(mm => mm.role).lastIndexOf("assistant");
            return messages.map((m, i) => {
              if (m.role === "assistant" && i === lastA && !streaming) {
                const perm = parsePermission(m.content);
                if (perm.ask) {
                  const sys = perm.scope === "system";
                  return (
                    <div key={i} className={`chat-msg ${m.role}`}>
                      {perm.cleaned}
                      <div className="cmd-choices">
                        <button className="cmd-choice-btn cmd-grant"
                                onClick={() => {
                                  if (sys) systemRef.current = true; else deepRef.current = true;
                                  send(sys ? "Granted. Go ahead and inspect the operational config (systemd / nginx, etc.) too, and continue."
                                           : "Granted. Take a closer look at the project and continue.");
                                }}>
                          {sys ? "✅ Inspect operational config (systemd/nginx) too" : "✅ Allow (read the project in detail)"}
                        </button>
                        <button className="cmd-choice-btn"
                                onClick={() => send("Don't investigate for now — proceed with the information you already have.")}>
                          Not now
                        </button>
                      </div>
                    </div>
                  );
                }
                const pc = parseChoices(m.content);
                if (pc.choices.length) {
                  return (
                    <div key={i} className={`chat-msg ${m.role}`}>
                      {pc.cleaned}
                      <div className="cmd-choices">
                        {pc.choices.map((c, j) => (
                          <button key={j} className="cmd-choice-btn" onClick={() => send(c.full)}>{c.full}</button>
                        ))}
                        <button className="cmd-choice-btn cmd-investigate"
                                onClick={() => { deepRef.current = true; send("I don't know the answer to this question. Investigate the project and answer it yourself. If you can't tell, ask whether to widen the scope."); }}>
                          🔍 Have you investigate (figure it out yourself)
                        </button>
                      </div>
                    </div>
                  );
                }
              }
              return <div key={i} className={`chat-msg ${m.role}`}>{m.content}</div>;
            });
          })()}
          {streaming && <div className="chat-typing"><span/><span/><span/></div>}
          {failed && !streaming && (
            <div style={{ padding: "4px 2px" }}>
              <button className="cmd-choice-btn cmd-grant" onClick={retry}>🔄 Retry</button>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>
        {draft ? (
          <div className="claudemd-save-bar">
            <span className="cms-note">
              {syncMsg ? syncMsg.text
                : saved ? "✓ Saved to working copy (not yet synced)"
                : "CLAUDE.md body detected (" + draft.length.toLocaleString() + " characters)"}
            </span>
            {!saved
              ? <button className="cms-save-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save this content"}</button>
              : <button className="cms-save-btn" onClick={syncNow} disabled={syncing}>{syncing ? "Publishing…" : "🔄 Publish to production now"}</button>}
          </div>
        ) : (!streaming && messages.some(m => m.role === "assistant") && (
          <div className="claudemd-save-bar">
            <span className="cms-note" style={{ opacity: .7 }}>No body yet (once the AI produces a draft, you can "Save")</span>
          </div>
        ))}
        <div className="chat-input-wrap">
          <textarea ref={taRef} value={input} onChange={e => { setInput(e.target.value); autoResize(); }} onKeyDown={onKeyDown} placeholder="Discuss content or direction…" rows={1} />
          <button className="chat-send" onClick={() => send()} disabled={!input.trim() || streaming} title="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// "Save as skill" flow: validate (warning cards) → save (name/folder) → context-sharing chat.
export function SkillSaveFlow({ subgraph, flowMeta, onClose, onFocusNodes, kind = "skill" }) {
  const isCmd = kind === "command";
  const label = isCmd ? "command" : "skill";
  const items = subgraph.items || [];
  const edges = subgraph.edges || [];
  const [phase, setPhase] = React.useState("validate");  // validate | save | chat
  const detWarnings = React.useMemo(() => validateFlowForSkill(items, edges), []);
  const [aiWarnings, setAiWarnings] = React.useState([]);
  const [aiState, setAiState] = React.useState("loading");  // loading | done | error | unavailable
  const initName = (flowMeta?.name || `new-${label}`).replace(/[\s/]+/g, "-").replace(/[^\w\-ぁ-んァ-ヶ一-龠]/g, "").toLowerCase() || kind;
  const [name, setName] = React.useState(initName);
  const [folder, setFolder] = React.useState(isCmd ? "~/.claude/commands" : SKILL_FOLDER_PRESETS[0]);
  const [description, setDescription] = React.useState(flowMeta?.desc || "");
  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState("");
  const [saved, setSaved] = React.useState(null);  // { path, content }
  const [copied, setCopied] = React.useState(false);
  const [mcpWarnings, setMcpWarnings] = React.useState([]);   // MCP not configured (preflight, deterministic)
  const [forceRegen, setForceRegen] = React.useState(true);  // body generation: true=rewrite all (default) / false=empty only. The chat-finalize path preserves the body (handled separately)
  const [gen, setGen] = React.useState({ status: "idle" });   // idle|running|done|error

  const subFlow = React.useMemo(() => boardToWorkflow(
    { ...subgraph, name: flowMeta?.name, desc: flowMeta?.desc },
    { name: flowMeta?.name, description: flowMeta?.desc, source: { type: "skill" } }
  ), []);

  // Pre-save checks: ① MCP config presence (deterministic, immediate) → ② AI semantic review (with machine checks already passed in)
  React.useEffect(() => {
    let alive = true;
    (async () => {
      // ① MCP config-presence preflight
      let mcpW = [];
      try {
        const r = await fetch(API + "/api/skills/preflight-mcp", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flow: subFlow }),
        });
        if (r.ok) { const d = await r.json(); mcpW = Array.isArray(d.warnings) ? d.warnings : []; }
      } catch (e) {}
      if (!alive) return;
      setMcpWarnings(mcpW);
      // ② AI semantic review (flow-review SSE). Passes the machine checks (structure + MCP) via det_findings.
      try {
        const st = await apiFetch("/api/chat/status").catch(() => ({ available: false }));
        if (!st.available) { if (alive) setAiState("unavailable"); return; }
        const det = [...detWarnings, ...mcpW].map(w => ({ title: w.title, detail: w.detail }));
        const res = await fetch(API + "/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: "Review this flow before saving it as a skill" }], context_type: "flow-review", board: subFlow, det_findings: det }),
        });
        const reader = res.body.getReader(); const dec = new TextDecoder(); let txt = "";
        while (true) { const { done, value } = await reader.read(); if (done) break;
          for (const line of dec.decode(value).split("\n")) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") { try { txt += JSON.parse(line.slice(6)).text; } catch (e) {} }
          }
        }
        const j = extractTaggedJson(txt, "review");
        const arr = Array.isArray(j) ? j : [];
        if (alive) { setAiWarnings(arr); setAiState("done"); }
      } catch (e) { if (alive) setAiState("error"); }
    })();
    return () => { alive = false; };
  }, []);

  const hasError = detWarnings.some(w => w.level === "error");
  const structuralWarnings = detWarnings.concat(mcpWarnings);

  // Turn the structure check + AI review into copy-pasteable text
  function copyWarnings() {
    const lines = [`Findings before turning the skill "${flowMeta?.name || "(unnamed plan)"}" into a skill (${structuralWarnings.length + aiWarnings.length}). I want to fix the flow based on the following:`, ""];
    if (structuralWarnings.length) {
      lines.push("[Structure check]");
      for (const w of structuralWarnings) lines.push(`- ${w.title}${w.detail ? " — " + w.detail : ""}`);
      lines.push("");
    }
    if (aiWarnings.length) {
      lines.push("[AI review]");
      for (const w of aiWarnings) lines.push(`- ${w.title}${w.detail ? " — " + w.detail : ""}`);
      lines.push("");
    }
    const text = lines.join("\n").trim();
    (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    }).catch(() => {
      // Fallback when the clipboard API is unavailable
      try {
        const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
        setCopied(true); setTimeout(() => setCopied(false), 1600);
      } catch (e) {}
    });
  }

  // LLM body generation (SSE). On completion, gen.content holds the full SKILL.md → preview.
  async function startGenerate() {
    setSaveErr("");
    setGen({ status: "running", done: 0, total: 0 });
    try {
      const res = await fetch(API + "/api/skills/generate-body", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, flow: subFlow, force_regenerate: forceRegen, kind }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || `Generation failed (HTTP ${res.status})`); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      let content = null, degraded = false, done = 0, total = 0;
      while (true) {
        const { done: rdone, value } = await reader.read(); if (rdone) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() || "";
        for (const chunk of parts) {
          const line = chunk.split("\n").find(l => l.startsWith("data: "));
          if (!line || line === "data: [DONE]") continue;
          let ev; try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
          if (ev.content != null) { content = ev.content; degraded = !!ev.degraded; }
          else if (ev.error) { throw new Error(ev.error); }
          else if (typeof ev.done_count === "number") { done = ev.done_count; total = ev.total || 0; setGen({ status: "running", done, total }); }
        }
      }
      if (content == null) throw new Error("No body was returned");
      setGen({ status: "done", content, degraded });
    } catch (e) {
      setGen({ status: "error", error: String(e.message || e) });
    }
  }

  async function doSave() {
    if (!name.trim() || saving) return;
    setSaving(true); setSaveErr("");
    try {
      const res = await fetch(API + "/api/skills/stage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, name: name.trim(), description, flow: subFlow, content: (gen.status === "done" ? gen.content : undefined), kind }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || `Save failed (HTTP ${res.status})`); }
      const d = await res.json();
      setSaved({ slug: d.slug, path: d.path, content: d.content });
      setPhase("staged");
    } catch (e) { setSaveErr(String(e.message || e)); }
    setSaving(false);
  }

  if (phase === "staged" && saved) {
    return (
      <div className="plan-modal-overlay" onClick={onClose}>
        <div className="plan-modal plan-skill-modal" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
          <div className="plan-modal-head">
            <span className="plan-modal-title">✓ Saved to the publish queue</span>
            <button onClick={onClose}>×</button>
          </div>
          <div className="plan-modal-body" style={{ gap: 12 }}>
            <div className="skill-val-ok">Saved "{name}" to the publish queue (not yet written to production).</div>
            <div className="plan-saveas-hint">To publish: <b>⚡ Skills → Publish queue → "Sync to production"</b>. Location after syncing: <code className="plan-saveas-path">{(folder || "").replace(/\/$/, "")}/{saved.slug}/SKILL.md</code></div>
            <div className="plan-modal-actions">
              <button onClick={() => setPhase("chat")}>Discuss this skill</button>
              <button className="primary" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (phase === "chat" && saved) {
    return <SkillDiscussChat skillName={name} skillPath={saved.path} skillContent={saved.content} onClose={onClose} />;
  }

  return (
    <div className="plan-modal-overlay" onClick={onClose}>
      <div className="plan-modal plan-skill-modal" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
        <div className="plan-modal-head">
          <span className="plan-modal-title">{isCmd ? "/ Save as command" : "★ Save as skill"}</span>
          <button onClick={onClose}>×</button>
        </div>
        {phase === "validate" ? (
          <div className="plan-modal-body" style={{ gap: 12 }}>
            <div className="skill-val-summary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>
                {structuralWarnings.length === 0 && aiWarnings.length === 0 && aiState !== "loading"
                  ? <span className="skill-val-ok">✓ No gaps found. Ready to save.</span>
                  : <span className="skill-val-warn">⚠ There are still things to fill in ({structuralWarnings.length + aiWarnings.length})</span>}
              </span>
              {(structuralWarnings.length > 0 || aiWarnings.length > 0) && (
                <button className="skill-val-copy" onClick={copyWarnings} title="Copy the full structure check + AI review (paste straight into Claude)">
                  {copied ? "✓ Copied" : "📋 Copy findings"}
                </button>
              )}
            </div>
            <div className="skill-val-group">
              <div className="skill-val-label">Structure check</div>
              {structuralWarnings.length === 0 ? <div className="skill-val-none">No issues</div> : structuralWarnings.map((w, i) => (
                <div key={i} className={`skill-val-item ${w.level}`} onClick={() => w.nodeIds && w.nodeIds.length && onFocusNodes(w.nodeIds)} title={w.nodeIds && w.nodeIds.length ? "Click to select the relevant node" : ""}>
                  <b>{w.title}</b>{w.detail && <span> — {w.detail}</span>}
                </div>
              ))}
            </div>
            <div className="skill-val-group">
              <div className="skill-val-label">AI review</div>
              {aiState === "loading" ? <div className="skill-val-none">Reviewing… <span className="chat-typing" style={{ display: "inline-flex" }}><span/><span/><span/></span></div>
                : aiState === "unavailable" ? <div className="skill-val-none">Skipped — Claude CLI not detected</div>
                : aiState === "error" ? <div className="skill-val-none">Review failed (you can continue with the structure check only)</div>
                : aiWarnings.length === 0 ? <div className="skill-val-none">Nothing in particular</div>
                : aiWarnings.map((w, i) => (<div key={i} className="skill-val-item warn"><b>{w.title}</b>{w.detail && <span> — {w.detail}</span>}</div>))}
            </div>
            <div className="plan-modal-actions">
              <button onClick={onClose}>Fix it</button>
              <button className="primary" disabled={hasError} onClick={() => setPhase("save")} title={hasError ? "Can't proceed — there are critical gaps" : ""}>Proceed anyway →</button>
            </div>
          </div>
        ) : phase === "generate" ? (
          <div className="plan-modal-body" style={{ gap: 12 }}>
            {gen.status === "running" ? (
              <div className="skill-val-none" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                Generating the body with AI… {gen.total ? `(${gen.done}/${gen.total} steps)` : ""}
                <span className="chat-typing" style={{ display: "inline-flex" }}><span/><span/><span/></span>
              </div>
            ) : gen.status === "error" ? (
              <div className="fme-error">Generation failed: {gen.error}</div>
            ) : gen.status === "done" ? (
              <>
                {gen.degraded && <div className="skill-val-none">Claude CLI not detected, so the body is left as the node descriptions (passthrough).</div>}
                <div className="plan-fn-label">Generated SKILL.md (preview)</div>
                <pre className="src-modal-pre" style={{ maxHeight: "40vh", overflow: "auto", margin: 0 }}>{gen.content}</pre>
                {saveErr && <div className="fme-error">{saveErr}</div>}
              </>
            ) : null}
            <div className="plan-modal-actions">
              <button onClick={() => setPhase("save")}>← Back</button>
              {gen.status === "done" && <button onClick={startGenerate} disabled={saving}>Regenerate the body</button>}
              <button className="primary" onClick={doSave} disabled={gen.status !== "done" || saving}>{saving ? "Saving…" : "★ Save this to the publish queue"}</button>
            </div>
          </div>
        ) : (
          <div className="plan-modal-body" style={{ gap: 12 }}>
            <label className="plan-fn-field">
              <span className="plan-fn-label">Skill name <span style={{ color: "#dc2626" }}>*</span></span>
              <input className="plan-fn-input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. create-document" />
            </label>
            <label className="plan-fn-field">
              <span className="plan-fn-label">Description (optional · used for Claude's automatic triggering)</span>
              <textarea className="plan-fn-input" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Create meeting-minutes Markdown from meeting audio and notes" />
            </label>
            <label className="plan-fn-field">
              <span className="plan-fn-label">Publish folder (sync target)</span>
              <input className="plan-fn-input" value={folder} onChange={e => setFolder(e.target.value)} list="skill-folder-presets" />
              <datalist id="skill-folder-presets">{SKILL_FOLDER_PRESETS.map(p => <option key={p} value={p} />)}</datalist>
            </label>
            <div className="plan-saveas-hint">Generate the body with AI → preview → save to the publish queue. Location after syncing: <code className="plan-saveas-path">{(folder || "").replace(/\/$/, "")}/{name || "<name>"}/SKILL.md</code></div>
            <label className="plan-fn-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={forceRegen} onChange={e => setForceRegen(e.target.checked)} />
              <span className="plan-fn-label" style={{ margin: 0 }}>Rewrite all steps (off = only AI-generate steps with an empty description)</span>
            </label>
            <div className="plan-modal-actions">
              <button onClick={() => setPhase("validate")}>← Back</button>
              <button className="primary" onClick={() => { setPhase("generate"); startGenerate(); }} disabled={!name.trim()}>✨ Generate the body with AI →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
