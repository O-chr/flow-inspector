// Board/skill AI chat panels (FlowBuildChat, SkillDiscussChat, ClaudeMdChat, SkillSaveFlow).
// Phase 3 module — extracted verbatim.
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { API, apiFetch } from '../lib/api.js'
import { extractTaggedJson } from '../lib/json.js'
import { applyFlowActions, boardToWorkflow, missingRequiredForBoard, validateFlowForSkill } from '../lib/board-model.js'

// フロー構築AIチャット (ボード全体対象)。会話 → flow_actions 提案 → 確認して適用。
// /api/chat の context_type="flow-build" を使い、現在ボード (未保存OK) を送ってAIに操作を提案させる。
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
  const reviewedSigRef = React.useRef(null);  // 直近に保存前レビューを見せたボードの署名

  // ── 会話履歴（Eval Chat と同じ仕組み。flow ごとに保存し履歴から選び直せる）──
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
    } catch (e) { /* 履歴なしは正常 */ }
  }
  React.useEffect(() => { loadSessions(); }, [fcFlowId]);

  async function loadSession(id) {
    setShowHistory(false);
    try {
      const s = await apiFetch(`/api/flows/${fcFlowId}/flowchat/sessions/${id}`);
      setCurrentSessionId(id);
      setMessages(s.messages || []);
      setProposal(null);
    } catch (e) { alert("会話の読み込みに失敗: " + e.message); }
  }
  function newChat() {
    setCurrentSessionId(null);
    setMessages([]);
    setProposal(null);
    setShowHistory(false);
  }
  async function deleteSession(id, e) {
    if (e) e.stopPropagation();
    if (!window.confirm("この会話を削除する？")) return;
    try {
      await fetch(API + `/api/flows/${fcFlowId}/flowchat/sessions/${id}`, { method: "DELETE" });
      if (id === sessionIdRef.current) newChat();
      await loadSessions();
    } catch (err) { alert("削除に失敗: " + err.message); }
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
    } catch (e) { console.warn("会話の保存に失敗", e); }
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

  // チャット内でのスキル化/コマンド化の確定ブロック ```flow_finalize {as,name,description}```
  function tryParseFinalize(fullText) {
    const obj = extractTaggedJson(fullText, "flow_finalize");
    if (obj && typeof obj === "object" && !Array.isArray(obj) && obj.as) return obj;
    return null;
  }

  // 確定: 決定論チェック → 保存前レビュー(MCP preflight + AI flow-review) → 公開待ちに stage。
  // 本文は温存(regenしない)。レビュー指摘があれば一旦見せて止め、同じボードで再確定なら通す
  // （= モーダルの「このまま進む」相当を会話で実現）。
  async function runFinalize(spec) {
    const b = boardRef.current || {};
    const items = b.items || [], edges = b.edges || [];
    const kind = spec.as === "command" ? "command" : "skill";
    const label = kind === "command" ? "コマンド" : "スキル";
    const folder = kind === "command" ? "~/.claude/commands" : SKILL_FOLDER_PRESETS[0];
    const nm = (spec.name || b.name || kind), desc = (spec.description || b.desc || "");
    const subFlow = boardToWorkflow({ ...b, name: nm, desc },
      { name: nm, description: desc, source: { type: "skill" } });

    // ① 決定論チェック (致命的=保存不可)
    const det = validateFlowForSkill(items, edges);
    const fatal = det.filter(w => w.level === "error");
    if (fatal.length) {
      setMessages(m => [...m, { role: "system", content: "⚠ 確定できません（致命的な不足）:\n" + fatal.map(w => `・${w.title}${w.detail ? " — " + w.detail : ""}`).join("\n") + "\n直してから、もう一度確定してください。" }]);
      return;
    }

    // ② 保存前レビュー (ボードが前回提示時から変わっていれば実行)。指摘があれば見せて一旦停止。
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
          body: JSON.stringify({ messages: [{ role: "user", content: `この${label}を保存する前にレビューして` }], context_type: "flow-review", board: subFlow, det_findings: det2 }),
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
        reviewedSigRef.current = sig;  // 同じボードで再確定なら次は通す
        setMessages(m => [...m, { role: "system", content: `🔎 保存前レビューの指摘（${report.length}件）:\n` + report.map(w => `・${w.title}${w.detail ? " — " + w.detail : ""}`).join("\n") + `\n\n直すなら指示を、指摘を承知で保存するなら「このまま保存して」と言ってください。` }]);
        return;
      }
      reviewedSigRef.current = sig;  // クリーン
    }

    // ③ stage (本文温存)
    try {
      const res = await fetch(API + "/api/skills/stage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, name: nm, description: desc, flow: subFlow, kind }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || `HTTP ${res.status}`); }
      const d = await res.json();
      setMessages(m => [...m, { role: "system", content: `✓ 「${nm}」を公開待ちに保存しました（${label}）。\n保存先: ${d.path}\n本番へは ⚡スキル → 公開待ち → 「本番へ同期」。` }]);
    } catch (e) {
      setMessages(m => [...m, { role: "system", content: label + "化に失敗しました: " + (e.message || e) }]);
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
      // 適用確認など UI 専用メッセージ (role:"system") は API に送らない。
      // バックエンドの ChatMessage.role は user/assistant のみ許可 (それ以外は 422)。
      const apiMsgs = newMsgs.filter(m => m.role === "user" || m.role === "assistant");
      const res = await fetch(API + "/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMsgs, context_type: "flow-build", board: liveFlow, flow_id: flowMeta?.id || null, required_status: missingRequiredForBoard(b.items || []) }),
      });
      if (!res.ok) {
        let detail = "";
        try { detail = (await res.json()).detail || ""; } catch (e) {}
        throw new Error(`サーバーエラー (HTTP ${res.status})${detail ? " — " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 120) : ""}`);
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
      // 会話を永続化（履歴から選び直せるように）
      persistSession([...newMsgs, { role: "assistant", content: assistantText }]);
    } catch (e) {
      setMessages(m => [...m, { role: "system", content: "接続エラー: " + e.message }]);
    }
    setStreaming(false);
  }

  function onKeyDown(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }

  function apply() {
    if (!proposal) return;
    const n = proposal.summary.length;
    onApplyActions(proposal.actions);
    setProposal(null);
    setMessages(m => [...m, { role: "system", content: `✓ ${n} 件の操作をボードに反映しました` }]);
  }

  const suggestions = [
    "Gmailを調べて要約しメール下書きを作るフローを作って",
    "今のフローに通知ノードを足して",
    "全体の流れを説明して",
  ];

  return (
    <div className="plan-chat-panel">
      <div className="plan-chat-head">
        <span className="plan-chat-head-icon">💬</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="plan-chat-head-title">フロー構築アシスタント</div>
          <div className="plan-chat-head-sub">会話でノード追加・設定・接続（確認して適用）</div>
        </div>
        {fcFlowId && (
          <div className="plan-chat-history-wrap" style={{ position: "relative" }}>
            <button className="plan-chat-iconbtn" onClick={() => setShowHistory(v => !v)} disabled={sessions.length === 0} title="過去の会話を開く">🕘{sessions.length > 0 ? ` ${sessions.length}` : ""}</button>
            {showHistory && (
              <div className="eval-chat-history-menu">
                {sessions.length === 0 && <div className="eval-chat-history-empty">保存された会話はありません</div>}
                {sessions.map(s => (
                  <div key={s.id} className={`eval-chat-history-item ${s.id === currentSessionId ? "is-active" : ""}`} onClick={() => loadSession(s.id)}>
                    <div className="eval-chat-history-info">
                      <div className="eval-chat-history-title">{s.title || "(無題)"}</div>
                      <div className="eval-chat-history-meta">{s.message_count} 件</div>
                    </div>
                    <button className="eval-chat-history-del" onClick={(e) => deleteSession(s.id, e)} title="この会話を削除">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button className="plan-chat-iconbtn" onClick={newChat} title="新しいチャットを始める（履歴は残ります）">🆕</button>
        <button className="plan-chat-iconbtn" onClick={onClose} title="閉じる">×</button>
      </div>
      {available === false ? (
        <div className="chat-unavailable" style={{ padding: 18 }}>
          <div className="chat-empty-icon">⚡</div>
          <h4>Claude CLI が見つかりません</h4>
          <p>チャットは Claude Code CLI 経由で動作します</p>
        </div>
      ) : (
        <div className="chat-panel" style={{ flex: 1, minHeight: 0 }}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-icon">🛠️</div>
              <h4>会話でフローを組み立てる</h4>
              <p>やりたいことを書くと、AIがノード追加・設定・接続を提案します。<br/>「適用」を押すまでボードは変わりません。</p>
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
                  <h5>📋 提案された操作（{proposal.summary.length}件）</h5>
                  <ul className="plan-chat-actions">
                    {proposal.summary.length === 0
                      ? <li className="is-muted">適用できる操作がありませんでした</li>
                      : proposal.summary.map((s, i) => <li key={i} className={s.startsWith("🗑") ? "is-danger" : ""}>{s}</li>)}
                  </ul>
                  {proposal.warnings.length > 0 && (
                    <div className="plan-chat-warns">{proposal.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}</div>
                  )}
                  <div className="plan-chat-proposal-btns">
                    <button onClick={() => setProposal(null)}>却下</button>
                    <button className="primary" onClick={apply} disabled={proposal.summary.length === 0}>✓ 適用</button>
                  </div>
                </div>
              )}
              <div ref={messagesEnd} />
            </div>
          )}
          <div className="chat-input-wrap">
            <textarea ref={taRef} value={input} onChange={e => { setInput(e.target.value); autoResize(); }} onKeyDown={onKeyDown} placeholder="作りたいフローや変更を書く…" rows={1} />
            <button className="chat-send" onClick={() => send()} disabled={!input.trim() || streaming} title="送信">
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
// 保存先フォルダの候補 (バックエンドが ~ を展開し、安全なルート配下のみ許可)
const SKILL_FOLDER_PRESETS = ["~/.claude/skills", "~/projects/your-project/.claude/skills"];

// 保存したスキルを「前提共有」して相談するチャット。他AI機能と同じ claude CLI / SSE。
// 開いた瞬間に、保存した SKILL.md を context に AI が要約を1メッセージ提示する。
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
          // role:"system" の UI 専用メッセージ (エラー表示等) は除外 (backend は user/assistant のみ → それ以外は 422)
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
    } catch (e) { setMessages(m => [...m, { role: "system", content: "接続エラー: " + e.message }]); }
    setStreaming(false);
  }
  React.useEffect(() => {
    if (kicked.current) return; kicked.current = true;
    send("このスキルを保存しました。どんなフローで、どう使えるかを2〜3文で要約し、使い方の相談に乗ってください。", true);
  }, []);
  function onKeyDown(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }
  function autoResize() { const ta = taRef.current; if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; } }

  return (
    <div className="plan-chat-panel">
      <div className="plan-chat-head">
        <span className="plan-chat-head-icon">★</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="plan-chat-head-title">{skillName} について相談</div>
          <div className="plan-chat-head-sub" title={skillPath}>{skillPath}</div>
        </div>
        <button className="plan-chat-iconbtn" onClick={onClose} title="閉じる">×</button>
      </div>
      <div className="chat-panel" style={{ flex: 1, minHeight: 0 }}>
        <div className="chat-messages">
          {messages.map((m, i) => (<div key={i} className={`chat-msg ${m.role}`}>{m.content}</div>))}
          {streaming && <div className="chat-typing"><span/><span/><span/></div>}
          <div ref={messagesEnd} />
        </div>
        <div className="chat-input-wrap">
          <textarea ref={taRef} value={input} onChange={e => { setInput(e.target.value); autoResize(); }} onKeyDown={onKeyDown} placeholder="使い方・調整を相談…" rows={1} />
          <button className="chat-send" onClick={() => send()} disabled={!input.trim() || streaming} title="送信">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// CLAUDE.md 生成/編集チャット: claude-md context で本文を提案させ、コードフェンスを抽出して staging に保存。
// SSE / メッセージ管理は SkillDiscussChat と同じ作法。
export function ClaudeMdChat({ project, existing, layerId, layerTitle, targetPath, onClose, onSaved }) {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const deepRef = React.useRef(false);  // 「詳しく確認」許可後に true → 以降の送信に deep を付与
  const systemRef = React.useRef(false);  // 「システムも調べる」許可後に true → systemd/nginx 等も読む
  const [failed, setFailed] = React.useState(false);   // 直近の送信が失敗 → リトライボタン表示
  const lastPayloadRef = React.useRef(null);           // リトライ用：直近に送った会話
  const [saved, setSaved] = React.useState(false);     // staging保存済み → 同期ボタンに切替
  const [syncing, setSyncing] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState(null);  // {ok,text} 保存/同期の結果表示
  const messagesEnd = React.useRef(null);
  const taRef = React.useRef(null);
  const kicked = React.useRef(false);
  const intentRef = React.useRef(null);  // 入口で選んだ意図: "modify"（既存修正） | "add"（追記） | "create"（新規）
  const [sessions, setSessions] = React.useState([]);        // このファイルの過去会話 [{id,title,ts,messages}]（新しい順）
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
          // backend は user/assistant のみ受け付ける (system 等は 422)
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
      if (!txt.trim()) failure = "応答が空でした（タイムアウト等の可能性）";
      else if (txt.includes("[Error:")) failure = "サーバ側でエラーが発生しました";
    } catch (e) {
      setMessages(m => m.filter(x => !(x.role === "assistant" && !x.content)));  // 空バブル除去
      failure = "通信に失敗しました: " + (e.message || e);
    }
    if (failure) { setMessages(m => [...m, { role: "system", content: "⚠️ " + failure + " — 下の「リトライ」で再送できます" }]); setFailed(true); }
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
  const cmdLsKey = "fi-cmd-msgs:" + (targetPath || "");          // 旧・単一会話キー（移行用）
  const cmdSessKey = "fi-cmd-sessions:" + (targetPath || "");    // 新・複数セッション
  const loadSessionsLS = () => { try { const s = localStorage.getItem(cmdSessKey); if (s) return JSON.parse(s) || []; } catch (e) {} return []; };
  const saveSessionsLS = (arr) => { try { localStorage.setItem(cmdSessKey, JSON.stringify(arr)); } catch (e) {} };
  const sessionTitle = (msgs) => {
    const fu = msgs.find(m => m.role === "user");
    const t = ((fu && fu.content) || "新しい会話").replace(/\s+/g, " ").trim();
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
  // 意図別の最初の指示。開いた瞬間にLLMへは投げず、ボタンで選んでから送る。
  const intentGreeting = (kind) => kind === "modify"
    ? "既存の CLAUDE.md を見直して修正したい。今書かれている各項目について、改善・修正した方がいい点を具体的に提案して。やみくもに増やさず、直す方向で。"
    : kind === "add"
      ? "CLAUDE.md に新しいルールを追記したい。足す価値のある候補を、そのまま書ける具体ドラフトで提案して。既存の内容とは重複させないで。"
      : "ゼロから CLAUDE.md を作りたい。入れる価値のある内容を、そのまま書ける具体ドラフトで候補提案して。";
  function startWithIntent(kind) {
    if (streaming) return;
    intentRef.current = kind; setFailed(false);
    // 「追記」はいきなりLLMに投げず、まず「何を足したい？」とだけ聞く（ユーザーが答えてから生成）
    if (kind === "add") {
      setMessages([{ role: "assistant", content: "どんな内容を CLAUDE.md に追記したいですか？ 足したいルールや注意点を書いてください。それを CLAUDE.md にそのまま書ける形に整えます。" }]);
      setTimeout(() => taRef.current?.focus(), 50);
      return;
    }
    send(intentGreeting(kind), true);
  }
  React.useEffect(() => {
    if (kicked.current) return; kicked.current = true;
    let arr = loadSessionsLS();
    // 旧・単一会話 (fi-cmd-msgs) が残っていれば 1セッションとして移行
    if (!arr.length) {
      try { const old = localStorage.getItem(cmdLsKey); if (old) { const m = JSON.parse(old); if (m && m.length) { arr = [{ id: "cmd_" + Date.now(), title: sessionTitle(m), ts: Date.now(), messages: m }]; saveSessionsLS(arr); } } } catch (e) {}
    }
    setSessions(arr);
    if (arr.length) { setCurrentSessionId(arr[0].id); setMessages(arr[0].messages || []); }  // 直近の会話を復元
  }, []);
  // 現在の会話をセッション配列に upsert して localStorage 保存（空バブル/⚠️は除外）
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
    // 現在の会話はセッションに保存済み。新しい空の会話を始める（履歴は消さない）。
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
  // 選択式の質問 (各選択肢が "(a) ..." / "1. ..." の行) をボタン化するためのパース。
  // レター/数字付きの行だけを選択肢扱いし、A要約の素の "- " 箇条書きは拾わない。
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
  // AI が ```ask-permission フェンスを出したら「許可/しない」ボタンを出す。
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
  // 新しいドラフトが来たら保存状態をリセット
  React.useEffect(() => { setSaved(false); setSyncMsg(null); }, [draft]);
  // 未保存の下書きがあるのにタブを閉じ/再読込しようとしたら警告（localStorage復元もあるが念のため）
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
      if (pushed > 0) setSyncMsg({ ok: true, text: "✅ 本番に反映しました" });
      else if (failed.length) setSyncMsg({ ok: false, text: "⚠️ 反映失敗: " + (failed[0].message || "不明") });
      else setSyncMsg({ ok: false, text: "⚠️ 反映対象がありません（先に保存してください）" });
    } catch (e) { setSyncMsg({ ok: false, text: "⚠️ 同期に失敗: " + (e.message || e) }); }
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
      setSaved(true); setSyncMsg(null);   // パネルは閉じない → その場で「今すぐ本番反映」できる
      onSaved && onSaved();
    } catch (e) { setSyncMsg({ ok: false, text: "⚠️ 保存に失敗: " + (e.message || e) }); }
    setSaving(false);
  }

  return (
    <div className="plan-chat-panel">
      <div className="plan-chat-head">
        <span className="plan-chat-head-icon">✨</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="plan-chat-head-title">{layerTitle || "PROJECT"} の CLAUDE.md</div>
          <div className="plan-chat-head-sub" title={targetPath}>{targetPath}</div>
        </div>
        <div style={{ position: "relative" }}>
          <button className="plan-chat-iconbtn" onClick={() => setShowHistory(v => !v)} disabled={streaming} title="会話履歴">🕘</button>
          {showHistory && (
            <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, width: 260, maxHeight: 320, overflowY: "auto", background: "var(--bg-1, #fff)", border: "1px solid var(--bd, #e5e7eb)", borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,.14)", zIndex: 50, padding: 4 }}>
              <div style={{ fontSize: 10.5, color: "var(--tx-4)", padding: "4px 8px" }}>会話履歴（このファイル）</div>
              {sessions.length === 0
                ? <div style={{ fontSize: 11, color: "var(--tx-4)", padding: "8px" }}>まだありません</div>
                : sessions.map(s => (
                  <div key={s.id} onClick={() => loadHistorySession(s.id)}
                       style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: s.id === currentSessionId ? "var(--accent-bg, #eff6ff)" : "transparent" }}
                       onMouseEnter={e => { if (s.id !== currentSessionId) e.currentTarget.style.background = "var(--bg-2, #f3f4f6)"; }}
                       onMouseLeave={e => { if (s.id !== currentSessionId) e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.title}>{s.title}</span>
                    <button onClick={e => deleteHistorySession(s.id, e)} title="削除"
                            style={{ background: "none", border: "none", color: "var(--tx-4)", cursor: "pointer", fontSize: 12, padding: "0 2px" }}>✕</button>
                  </div>
                ))}
            </div>
          )}
        </div>
        <button className="plan-chat-iconbtn" onClick={startFresh} disabled={streaming} title="新規（新しい会話を始める）">🆕</button>
        <button className="plan-chat-iconbtn" onClick={onClose} title="閉じる">×</button>
      </div>
      <div className="chat-panel" style={{ flex: 1, minHeight: 0 }}>
        <div className="chat-messages">
          {messages.length === 0 && !streaming && (
            <div className="chat-empty">
              <div className="chat-empty-icon">✨</div>
              <h4>{layerTitle || "PROJECT"} の CLAUDE.md</h4>
              <p>何をしますか？ 選ぶと、それに合わせて AI が動きます<br/>（押すまで AI には送りません）</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 320, marginTop: 6 }}>
                {existing && <button className="chat-suggest-btn" style={{ textAlign: "left" }} onClick={() => startWithIntent("modify")}>✏️ 既存を見直して修正したい</button>}
                <button className="chat-suggest-btn" style={{ textAlign: "left" }} onClick={() => startWithIntent("add")}>➕ 新しいルールを追記したい</button>
                {!existing && <button className="chat-suggest-btn" style={{ textAlign: "left" }} onClick={() => startWithIntent("create")}>✨ ゼロから作る（候補を提案）</button>}
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
                                  send(sys ? "許可します。systemd / nginx などの運用設定も調べて、続けてください。"
                                           : "許可します。プロジェクトを詳しく確認して、続けてください。");
                                }}>
                          {sys ? "✅ システムの運用設定（systemd/nginx）も調べる" : "✅ 許可する（プロジェクトを詳しく読む）"}
                        </button>
                        <button className="cmd-choice-btn"
                                onClick={() => send("今は調べず、今ある情報で進めてください。")}>
                          今はしない
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
                                onClick={() => { deepRef.current = true; send("この質問は私には分かりません。プロジェクトを調べて、あなたが答えてください。分からなければ範囲を広げる確認をしてください。"); }}>
                          🔍 調べてもらう（自分で確認して）
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
              <button className="cmd-choice-btn cmd-grant" onClick={retry}>🔄 リトライ</button>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>
        {draft ? (
          <div className="claudemd-save-bar">
            <span className="cms-note">
              {syncMsg ? syncMsg.text
                : saved ? "✓ 作業用コピーに保存（未同期）"
                : "CLAUDE.md 本文を検出（" + draft.length.toLocaleString() + " 文字）"}
            </span>
            {!saved
              ? <button className="cms-save-btn" onClick={save} disabled={saving}>{saving ? "保存中…" : "この内容で保存"}</button>
              : <button className="cms-save-btn" onClick={syncNow} disabled={syncing}>{syncing ? "反映中…" : "🔄 今すぐ本番反映"}</button>}
          </div>
        ) : (!streaming && messages.some(m => m.role === "assistant") && (
          <div className="claudemd-save-bar">
            <span className="cms-note" style={{ opacity: .7 }}>本文がまだありません（AI がドラフトを出すと「保存」できます）</span>
          </div>
        ))}
        <div className="chat-input-wrap">
          <textarea ref={taRef} value={input} onChange={e => { setInput(e.target.value); autoResize(); }} onKeyDown={onKeyDown} placeholder="内容や方針を相談…" rows={1} />
          <button className="chat-send" onClick={() => send()} disabled={!input.trim() || streaming} title="送信">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// 「スキルとして保存」フロー: 検証(警告カード) → 保存(name/folder) → 前提共有チャット。
export function SkillSaveFlow({ subgraph, flowMeta, onClose, onFocusNodes, kind = "skill" }) {
  const isCmd = kind === "command";
  const label = isCmd ? "コマンド" : "スキル";
  const items = subgraph.items || [];
  const edges = subgraph.edges || [];
  const [phase, setPhase] = React.useState("validate");  // validate | save | chat
  const detWarnings = React.useMemo(() => validateFlowForSkill(items, edges), []);
  const [aiWarnings, setAiWarnings] = React.useState([]);
  const [aiState, setAiState] = React.useState("loading");  // loading | done | error | unavailable
  const initName = (flowMeta?.name || `新しい${label}`).replace(/[\s/]+/g, "-").replace(/[^\w\-ぁ-んァ-ヶ一-龠]/g, "").toLowerCase() || kind;
  const [name, setName] = React.useState(initName);
  const [folder, setFolder] = React.useState(isCmd ? "~/.claude/commands" : SKILL_FOLDER_PRESETS[0]);
  const [description, setDescription] = React.useState(flowMeta?.desc || "");
  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState("");
  const [saved, setSaved] = React.useState(null);  // { path, content }
  const [copied, setCopied] = React.useState(false);
  const [mcpWarnings, setMcpWarnings] = React.useState([]);   // MCP未設定 (preflight, 決定論)
  const [forceRegen, setForceRegen] = React.useState(true);  // 本文生成: true=全書き直し(既定) / false=空のみ。チャット確定経路は本文温存(別途)
  const [gen, setGen] = React.useState({ status: "idle" });   // idle|running|done|error

  const subFlow = React.useMemo(() => boardToWorkflow(
    { ...subgraph, name: flowMeta?.name, desc: flowMeta?.desc },
    { name: flowMeta?.name, description: flowMeta?.desc, source: { type: "skill" } }
  ), []);

  // 保存前チェック: ① MCP設定の存在 (決定論・即時) → ② AI意味レビュー (機械チェック済みを渡す)
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
      // ② AI意味レビュー (flow-review SSE)。機械チェック済み(構造+MCP)を det_findings で渡す。
      try {
        const st = await apiFetch("/api/chat/status").catch(() => ({ available: false }));
        if (!st.available) { if (alive) setAiState("unavailable"); return; }
        const det = [...detWarnings, ...mcpW].map(w => ({ title: w.title, detail: w.detail }));
        const res = await fetch(API + "/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: "このフローをスキルとして保存する前にレビューして" }], context_type: "flow-review", board: subFlow, det_findings: det }),
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

  // 構造チェック + AIレビューを「そのまま投げられる」テキストにしてコピー
  function copyWarnings() {
    const lines = [`スキル「${flowMeta?.name || "(無名プラン)"}」をスキル化する前の指摘（${structuralWarnings.length + aiWarnings.length}件）。以下を踏まえてフローを直したい:`, ""];
    if (structuralWarnings.length) {
      lines.push("【構造チェック】");
      for (const w of structuralWarnings) lines.push(`- ${w.title}${w.detail ? " — " + w.detail : ""}`);
      lines.push("");
    }
    if (aiWarnings.length) {
      lines.push("【AIレビュー】");
      for (const w of aiWarnings) lines.push(`- ${w.title}${w.detail ? " — " + w.detail : ""}`);
      lines.push("");
    }
    const text = lines.join("\n").trim();
    (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    }).catch(() => {
      // クリップボードAPIが使えない場合のフォールバック
      try {
        const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
        setCopied(true); setTimeout(() => setCopied(false), 1600);
      } catch (e) {}
    });
  }

  // 本文LLM生成 (SSE)。完了で gen.content に SKILL.md 全文 → プレビューへ。
  async function startGenerate() {
    setSaveErr("");
    setGen({ status: "running", done: 0, total: 0 });
    try {
      const res = await fetch(API + "/api/skills/generate-body", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, flow: subFlow, force_regenerate: forceRegen, kind }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || `生成失敗 (HTTP ${res.status})`); }
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
      if (content == null) throw new Error("本文が返りませんでした");
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
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || `保存失敗 (HTTP ${res.status})`); }
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
            <span className="plan-modal-title">✓ 公開待ちに保存しました</span>
            <button onClick={onClose}>×</button>
          </div>
          <div className="plan-modal-body" style={{ gap: 12 }}>
            <div className="skill-val-ok">「{name}」を公開待ちに保存しました（本番にはまだ書いていません）。</div>
            <div className="plan-saveas-hint">本番へ出すには <b>⚡スキル → 公開待ち → 「本番へ同期」</b>。同期後の場所: <code className="plan-saveas-path">{(folder || "").replace(/\/$/, "")}/{saved.slug}/SKILL.md</code></div>
            <div className="plan-modal-actions">
              <button onClick={() => setPhase("chat")}>このスキルを相談する</button>
              <button className="primary" onClick={onClose}>閉じる</button>
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
          <span className="plan-modal-title">{isCmd ? "/ コマンドとして保存" : "★ スキルとして保存"}</span>
          <button onClick={onClose}>×</button>
        </div>
        {phase === "validate" ? (
          <div className="plan-modal-body" style={{ gap: 12 }}>
            <div className="skill-val-summary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>
                {structuralWarnings.length === 0 && aiWarnings.length === 0 && aiState !== "loading"
                  ? <span className="skill-val-ok">✓ 不足は見つかりませんでした。保存に進めます。</span>
                  : <span className="skill-val-warn">⚠ まだ埋める箇所があります（{structuralWarnings.length + aiWarnings.length}件）</span>}
              </span>
              {(structuralWarnings.length > 0 || aiWarnings.length > 0) && (
                <button className="skill-val-copy" onClick={copyWarnings} title="構造チェック＋AIレビューを全文コピー（そのままClaudeに貼れます）">
                  {copied ? "✓ コピーしました" : "📋 指摘をコピー"}
                </button>
              )}
            </div>
            <div className="skill-val-group">
              <div className="skill-val-label">構造チェック</div>
              {structuralWarnings.length === 0 ? <div className="skill-val-none">問題なし</div> : structuralWarnings.map((w, i) => (
                <div key={i} className={`skill-val-item ${w.level}`} onClick={() => w.nodeIds && w.nodeIds.length && onFocusNodes(w.nodeIds)} title={w.nodeIds && w.nodeIds.length ? "クリックで該当ノードを選択" : ""}>
                  <b>{w.title}</b>{w.detail && <span> — {w.detail}</span>}
                </div>
              ))}
            </div>
            <div className="skill-val-group">
              <div className="skill-val-label">AIレビュー</div>
              {aiState === "loading" ? <div className="skill-val-none">レビュー中… <span className="chat-typing" style={{ display: "inline-flex" }}><span/><span/><span/></span></div>
                : aiState === "unavailable" ? <div className="skill-val-none">Claude CLI 未検出のためスキップ</div>
                : aiState === "error" ? <div className="skill-val-none">レビューに失敗しました（構造チェックのみで続行できます）</div>
                : aiWarnings.length === 0 ? <div className="skill-val-none">特になし</div>
                : aiWarnings.map((w, i) => (<div key={i} className="skill-val-item warn"><b>{w.title}</b>{w.detail && <span> — {w.detail}</span>}</div>))}
            </div>
            <div className="plan-modal-actions">
              <button onClick={onClose}>修正する</button>
              <button className="primary" disabled={hasError} onClick={() => setPhase("save")} title={hasError ? "致命的な不足があるため進めません" : ""}>このまま進む →</button>
            </div>
          </div>
        ) : phase === "generate" ? (
          <div className="plan-modal-body" style={{ gap: 12 }}>
            {gen.status === "running" ? (
              <div className="skill-val-none" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                本文をAIで生成中… {gen.total ? `（${gen.done}/${gen.total} ステップ）` : ""}
                <span className="chat-typing" style={{ display: "inline-flex" }}><span/><span/><span/></span>
              </div>
            ) : gen.status === "error" ? (
              <div className="fme-error">生成に失敗しました: {gen.error}</div>
            ) : gen.status === "done" ? (
              <>
                {gen.degraded && <div className="skill-val-none">Claude CLI 未検出のため、本文はノード説明のまま（passthrough）です。</div>}
                <div className="plan-fn-label">生成された SKILL.md（プレビュー）</div>
                <pre className="src-modal-pre" style={{ maxHeight: "40vh", overflow: "auto", margin: 0 }}>{gen.content}</pre>
                {saveErr && <div className="fme-error">{saveErr}</div>}
              </>
            ) : null}
            <div className="plan-modal-actions">
              <button onClick={() => setPhase("save")}>← 戻る</button>
              {gen.status === "done" && <button onClick={startGenerate} disabled={saving}>本文を作り直す</button>}
              <button className="primary" onClick={doSave} disabled={gen.status !== "done" || saving}>{saving ? "保存中…" : "★ この内容で公開待ちに保存"}</button>
            </div>
          </div>
        ) : (
          <div className="plan-modal-body" style={{ gap: 12 }}>
            <label className="plan-fn-field">
              <span className="plan-fn-label">スキル名 <span style={{ color: "#dc2626" }}>*</span></span>
              <input className="plan-fn-input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="例: shiryo-sakusei" />
            </label>
            <label className="plan-fn-field">
              <span className="plan-fn-label">説明（任意・Claudeの自動トリガーに使われます）</span>
              <textarea className="plan-fn-input" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="例: 打ち合わせ音声とメモから日本語の議事録Markdownを作る" />
            </label>
            <label className="plan-fn-field">
              <span className="plan-fn-label">公開フォルダ（同期先）</span>
              <input className="plan-fn-input" value={folder} onChange={e => setFolder(e.target.value)} list="skill-folder-presets" />
              <datalist id="skill-folder-presets">{SKILL_FOLDER_PRESETS.map(p => <option key={p} value={p} />)}</datalist>
            </label>
            <div className="plan-saveas-hint">本文をAIで生成 → プレビュー → 公開待ちに保存。同期後の場所: <code className="plan-saveas-path">{(folder || "").replace(/\/$/, "")}/{name || "<name>"}/SKILL.md</code></div>
            <label className="plan-fn-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={forceRegen} onChange={e => setForceRegen(e.target.checked)} />
              <span className="plan-fn-label" style={{ margin: 0 }}>全ステップを書き直す（オフ＝説明が空のステップだけAI生成）</span>
            </label>
            <div className="plan-modal-actions">
              <button onClick={() => setPhase("validate")}>← 戻る</button>
              <button className="primary" onClick={() => { setPhase("generate"); startGenerate(); }} disabled={!name.trim()}>✨ 本文をAIで生成 →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
