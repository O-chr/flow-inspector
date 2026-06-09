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
  // 元ファイルがあるフロー (skill / agent / hooks) でのみ「指示文全文」ボタンを出す
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

  // flowKey が変わったら値を再読込
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
        // 黙って上書き (ユーザーが目を通して保存する流れ)
        setDraft({
          purpose: data.purpose || "",
          inputs: data.inputs || "",
          outputs: data.outputs || "",
        });
      } else {
        setGenerateError("AI 応答が想定外の形式でした");
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
        <div className="fme-title">フロー設定</div>
        <div style={{ display: "flex", gap: 6 }}>
          {canViewSource && (
            <button
              type="button"
              className="fme-ai-btn"
              style={{ background: "var(--bg-3)", color: "var(--tx-2)" }}
              onClick={() => setShowSource(true)}
              title="このスキルの指示文 (SKILL.md) の全文を表示"
            >📄 指示文の全文</button>
          )}
          {canGenerate && (
            <button
              type="button"
              className="fme-ai-btn"
              onClick={generateWithAI}
              disabled={generating}
              title="ノード構成から AI が目的・入出力を推測"
            >
              {generating ? "⏳ 推論中…" : "✨ AI で生成"}
            </button>
          )}
        </div>
      </div>
      {showSource && <SourceTextModal flowId={flowId} onClose={() => setShowSource(false)} />}
      {generateError && <div className="fme-error">{generateError}</div>}
      <div className="fme-section">
        <label className="fme-label">🎯 フローの目的</label>
        <textarea
          className="fme-textarea"
          value={draft.purpose || ""}
          onChange={(e) => setDraft(d => ({ ...d, purpose: e.target.value }))}
          placeholder="このフロー全体で何を達成するかを書く"
          rows={3}
        />
      </div>
      <div className="fme-section">
        <label className="fme-label">📥 入力物</label>
        <textarea
          className="fme-textarea"
          value={draft.inputs || ""}
          onChange={(e) => setDraft(d => ({ ...d, inputs: e.target.value }))}
          placeholder="何を入力として受け取るか"
          rows={3}
        />
      </div>
      <div className="fme-section">
        <label className="fme-label">📤 出力物</label>
        <textarea
          className="fme-textarea"
          value={draft.outputs || ""}
          onChange={(e) => setDraft(d => ({ ...d, outputs: e.target.value }))}
          placeholder="何を出力として返すか"
          rows={3}
        />
      </div>
      <div className="fme-actions">
        <span className={`fme-status ${isDirty ? "is-dirty" : ""}`}>
          {isDirty ? "(未保存)" : ""}
        </span>
        <button
          type="button"
          className={`fme-save ${isDirty ? "is-dirty" : ""}`}
          onClick={save}
          disabled={!isDirty}
        >
          💾 保存
        </button>
      </div>
    </div>
  );
}

export function DetailEmpty({ legend = true, flowKey = "default", nodes, edges, flowId, sourceType }) {
  return (
    <div className="empty-inner">
      <div className="empty-art"><div className="ea-ring r1" /><div className="ea-ring r2" /><div className="ea-ring r3" /><div className="ea-core" /></div>
      <div className="empty-title">ノード未選択</div>
      <div className="empty-sub">ダイアグラム上のノードをクリックすると、入出力・依存関係・実行時間などの詳細を確認できます。</div>
      {legend && <FlowMetaEditor flowKey={flowKey} nodes={nodes} edges={edges} flowId={flowId} sourceType={sourceType} />}
    </div>
  );
}

// 選択ノードに対応する SKILL.md 内の見出しブロック行範囲を求める
function _findNodeSection(lines, node) {
  if (!node || !node.title) return null;
  // フロー開始/終了は本文に対応箇所が無い
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

// 📄 全文タブ: SKILL.md 等の全文を表示し、選択ノードに対応する箇所をハイライト
export function FlowSourceView({ flowId, sourceType, selectedNode, liveFlow }) {
  const [state, setState] = React.useState({ loading: true });
  const hiRef = React.useRef(null);
  const fileBacked = ["skill", "agent", "hooks", "command"].includes(sourceType || "");
  // ライブモード: 編集中フローを preview-source に POST して即エンコード (debounce)
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
          .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.detail || "生成失敗")))
          .then(d => { if (alive) setState({ loading: false, live: true, ...d }); })
          .catch(err => { if (alive) setState({ loading: false, error: String(err) }); });
      }, 300);
      return () => { alive = false; clearTimeout(t); };
    }
    if (!flowId || !fileBacked) { setState({ loading: false, unsupported: true }); return; }
    let alive = true;
    setState({ loading: true });
    fetch(`/api/flows/${encodeURIComponent(flowId)}/source`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.detail || "読み取り失敗")))
      .then(d => { if (alive) setState({ loading: false, ...d }); })
      .catch(err => { if (alive) setState({ loading: false, error: String(err) }); });
    return () => { alive = false; };
  }, [flowId, fileBacked, live, liveSig]);

  const lines = React.useMemo(() => (state.content || "").split("\n"), [state.content]);
  const section = React.useMemo(() => _findNodeSection(lines, selectedNode), [lines, selectedNode]);

  React.useEffect(() => {
    if (section && hiRef.current) hiRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [section && section.start, state.content]);

  if (state.loading) return <div className="src-view-msg">読み込み中…</div>;
  if (state.unsupported) return <div className="src-view-msg">このフローには表示できる元ファイルがありません。</div>;
  if (state.error) return <div className="src-view-msg src-view-err">⚠️ {state.error}</div>;

  return (
    <div className="src-view">
      <div className="src-view-head">
        <span className="src-view-path">{state.live ? "● ライブプレビュー（編集中・未保存）" : state.path}</span>
        <span className="src-view-meta">{state.lines} 行</span>
      </div>
      {selectedNode && !section && (
        <div className="src-view-note">「{selectedNode.title}」に対応する見出しが本文に見つかりませんでした。</div>
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
            >{ln || " "}</div>
          );
        })}
      </pre>
    </div>
  );
}

// スキル指示文 (SKILL.md 等) の全文を表示するモーダル
export function SourceTextModal({ flowId, onClose }) {
  const [state, setState] = React.useState({ loading: true });
  React.useEffect(() => {
    let alive = true;
    fetch(`/api/flows/${encodeURIComponent(flowId)}/source`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.detail || "読み取り失敗")))
      .then(d => { if (alive) setState({ loading: false, ...d }); })
      .catch(err => { if (alive) setState({ loading: false, error: String(err) }); });
    return () => { alive = false; };
  }, [flowId]);
  return (
    <div className="src-modal-overlay" onClick={onClose}>
      <div className="src-modal" onClick={e => e.stopPropagation()}>
        <div className="src-modal-head">
          <div>
            <div className="src-modal-title">📄 指示文の全文</div>
            {state.path && <div className="src-modal-path">{state.path}{state.lines ? ` · ${state.lines} 行` : ""}</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {state.content && (
              <button className="src-modal-copy" onClick={() => navigator.clipboard.writeText(state.content)} title="全文コピー">コピー</button>
            )}
            <button className="src-modal-close" onClick={onClose} title="閉じる">×</button>
          </div>
        </div>
        <div className="src-modal-body">
          {state.loading ? <div className="src-modal-loading">読み込み中…</div>
            : state.error ? <div className="src-modal-error">⚠️ {state.error}</div>
            : <pre className="src-modal-pre">{state.content}</pre>}
        </div>
      </div>
    </div>
  );
}

export function AddressChip({ flowId, nodeId }) {
  const [copied, setCopied] = useState(false);
  // flowId が無い (プランニングホワイトボード等、未保存スクラッチ) ときは flow:undefined を避ける
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
    { key: "hook_type", label: "タイミング", desc: "フックが実行されるタイミングです。PreToolUse（ツール実行前）やPostToolUse（ツール実行後）など、処理のどの段階で介入するかを決めます。",
      options: ["PreToolUse", "PostToolUse", "PreSubagent", "PostSubagent", "Notification"] },
    { key: "matcher", label: "対象パターン", desc: "このフックが反応する対象を絞り込むパターンです。例：Skill:x-autopilot なら、x-autopilotスキル実行時のみ発火します。", edit: "text" },
    { key: "script", label: "スクリプト", desc: "フック実行時に呼び出されるスクリプトファイルです。バリデーション・前処理・ログ記録などの処理を記述します。", edit: "text" },
    { key: "outputs_to", label: "出力先", desc: "処理結果を書き出す先です。ログファイルや外部サービスなど、複数指定できます。", edit: "text" },
  ],
  subagent: [
    { key: "agent_type", label: "エージェント種別", desc: "起動するサブエージェントの種類です。Explore（探索専用）、general-purpose（汎用）など、タスクに応じた専門エージェントを選びます。",
      options: ["Explore", "general-purpose", "code", "plan", "claude-code-guide", "plugin-dev:agent-creator"] },
    { key: "model", label: "AIモデル", desc: "サブエージェントが使用するAIモデルです。sonnet（高速・バランス型）、opus（高精度）、haiku（軽量・高速）から選べます。",
      options: ["sonnet", "opus", "haiku"] },
    { key: "tools", label: "使用ツール", desc: "サブエージェントが利用できるツールの一覧です。Bash（コマンド実行）、Read（ファイル読み取り）、Grep（検索）など。",
      multi: ["Bash", "Read", "Write", "Edit", "Grep", "Glob", "WebFetch", "WebSearch"] },
  ],
  mcp: [
    { key: "mcp_server", label: "接続先サービス", desc: "MCP（Model Context Protocol）で接続する外部サービス名です。Canva、Slack、GitHubなど、様々なサービスと連携できます。",
      options: ["canva", "xmcp", "gmail-mcp", "notion-mcp", "slack-mcp", "github-mcp"] },
    { key: "tool", label: "実行ツール", desc: "接続先サービスで実行する具体的な操作です。例：search-designs（デザイン検索）、post_tweet（ツイート投稿）など。", edit: "text" },
    { key: "params", label: "パラメータ", desc: "ツール実行時に渡す追加の設定値です。検索条件やフィルタなど、実行内容を細かく指定します。", edit: "text" },
    { key: "retries", label: "リトライ回数", desc: "失敗した場合に自動で再試行する回数です。外部サービスの一時的なエラーに対応します。",
      options: ["1", "2", "3", "5", "10"] },
  ],
  code: [
    { key: "tool", label: "実行ツール", desc: "コード実行に使うツールの種類です。Write（ファイル書き込み）、Bash（コマンド実行）、Read（ファイル読み込み）など。",
      options: ["Write", "Bash", "Read", "Edit"] },
    { key: "command", label: "コマンド", desc: "実行するシェルコマンドです。Bashツール使用時に指定します。", edit: "text" },
    { key: "path", label: "ファイルパス", desc: "操作対象のファイルパスです。テンプレート変数（{date}など）を含めることができます。", edit: "text" },
    { key: "path_template", label: "パステンプレート", desc: "動的にファイルパスを生成するためのテンプレートです。{date}や{id}などの変数が実行時に置換されます。", edit: "text" },
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
          <button className="ne-cfg-save-btn is-cancel" onClick={() => { setMultiDraft(Array.isArray(value) ? value : []); setEditing(false); }}>キャンセル</button>
          <button className="ne-cfg-save-btn is-ok" onClick={() => save(multiDraft)} disabled={saving}>{saving ? "…" : "保存"}</button>
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
        {display || "未設定"}
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
      <div className="ne-section-label">設定内容</div>
      <div className="ne-cfg-list">
        {activeFields.map(f => (
          <ConfigFieldRow key={f.key} field={f} value={cfg[f.key]} onSave={handleSave} />
        ))}
      </div>
    </div>
  );
}

function nodeTypeExplain(node) {
  // shared/flow-elements.js のマスター TYPE_SPECS を優先参照 (8093 で確定 → 全環境共有)
  const specs = (window.FI && window.FI.TYPE_SPECS) || {};
  const spec = specs[node.type];
  if (spec && spec.base) return spec.base;
  // フォールバック (TYPE_SPECS 未定義のタイプ向け)
  switch (node.type) {
    case "parent":   return "ワークフロー全体を統括する親ノードです。全体の流れを制御し、各ステップの実行順序を管理します。";
    case "user":     return "ユーザーからの入力や判断を待つステップです。人間の確認やフィードバックが必要な場面で使われます。";
    case "decision": return "条件に基づいて処理を分岐させるステップです。結果に応じて次に進むルートが変わります。";
    default:         return "このステップはワークフローの一部として処理を行います。";
  }
}

function nodeTypeSteps(node) {
  // shared/flow-elements.js のマスター TYPE_SPECS を優先参照
  // meta.tool / meta.action / meta.service / meta.handler_type / meta.runtime に応じて動的差し替え
  const specs = (window.FI && window.FI.TYPE_SPECS) || {};
  const spec = specs[node.type];
  if (spec) {
    const meta = node.meta || node.config || {};
    // 動的サブ種別キー → stepsBy* テーブルからの引き当て
    if (meta.tool && spec.stepsByTool && spec.stepsByTool[meta.tool]) return spec.stepsByTool[meta.tool];
    if (meta.action && spec.stepsByAction && spec.stepsByAction[meta.action]) return spec.stepsByAction[meta.action];
    if (meta.service && spec.stepsByService && spec.stepsByService[meta.service]) return spec.stepsByService[meta.service];
    if (meta.runtime && spec.stepsByRuntime && spec.stepsByRuntime[meta.runtime]) return spec.stepsByRuntime[meta.runtime];
    if (Array.isArray(spec.steps) && spec.steps.length > 0) return spec.steps;
  }
  // フォールバック
  switch (node.type) {
    case "parent":   return ["ワークフロー全体の初期化", "各ステップを順番に実行", "全体の結果をまとめる"];
    case "user":     return ["ユーザーに入力を要求", "入力内容を受け取る", "次のステップに渡す"];
    case "decision": return ["条件を評価", "分岐先を決定", "該当するルートに進む"];
    default:         return ["処理を実行", "結果を出力"];
  }
}

// ── 柱2: 編集状態の揮発防止 ──────────────────────────────────────────
// ノード切替/リロードを跨いで編集状態を保持するための React 外キャッシュ。
//  __nodeEditCache: { localOverride, aiInstruction } を flowId::nodeId ごとに退避。
//  __aiFieldJobs  : 進行中/完了済みの AI 生成ジョブを flowId::nodeId ごとに保持。
//                   fetch はコンポーネントのマウント状態に依存せず走り、完了時に
//                   レジストリへ結果を書く。マウント中のコンポーネントは onUpdate で通知を受ける。
window.__nodeEditCache = window.__nodeEditCache || new Map();
window.__aiFieldJobs = window.__aiFieldJobs || new Map();
function nodeEditKey(flowId, nodeId) { return `${flowId || "_"}::${nodeId || "_"}`; }

export function DetailBody({ node, workflow, onJump, onSaved, viewMode, onPatch }) {
  const t = window.NODE_TYPES[node.type];
  const inLinks = workflow.edges.filter(e => e.to === node.id);
  const outLinks = workflow.edges.filter(e => e.from === node.id);
  const nodesById = Object.fromEntries(workflow.nodes.map(n => [n.id, n]));
  // 柱2: 編集状態キャッシュのキー (flowId::nodeId)
  const editKey = nodeEditKey(workflow?.id, node.id);
  // 初期値はキャッシュ → なければ node.meta から復元 (リロード時は meta が効く)
  const initFromCache = () => {
    const c = window.__nodeEditCache.get(editKey);
    return {
      localOverride: (c && c.localOverride) ? c.localOverride : {},
      aiInstruction: (c && typeof c.aiInstruction === "string")
        ? c.aiInstruction : (node.meta?.ai_instruction || ""),
    };
  };
  const init0 = initFromCache();
  // 設定タブ用: 上級者向け折り畳み + secret 表示切替の状態
  const [advancedOpen, setAdvancedOpen] = useState({});
  const [revealedSecrets, setRevealedSecrets] = useState({});
  // 設定タブの値変更を一時保持 (楽観的UI更新) — ノード切替/リロードを跨いで保持
  const [localOverride, setLocalOverride] = useState(init0.localOverride);
  // 概要タブ: AIに説明させた結果 (Claude Code CLI 経由で生成)
  const [aiExplain, setAiExplain] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  // capabilities (MCP): ⓘ で展開中の機能 index
  const [openCap, setOpenCap] = useState(null);
  // 設定タブ: options ボタンの ⓘ で展開中の {fieldKey, optionValue}
  const [openOptInfo, setOpenOptInfo] = useState(null);
  // 設定タブ: AIで設定を生成 (node-fields) の指示文・状態
  const [aiFieldInstruction, setAiFieldInstruction] = useState(init0.aiInstruction);
  const [aiFieldGenerating, setAiFieldGenerating] = useState(false);
  const [aiFieldError, setAiFieldError] = useState("");
  // ⓘホバー時のツールチップ: { label, text, x, y } or null
  const [tipState, setTipState] = useState(null);
  // 編集状態を常に最新でキャッシュへ書き戻す ref (アンマウント/切替の退避に使う)
  const editStateRef = useRef({ localOverride, aiFieldInstruction, editKey });
  editStateRef.current = { localOverride, aiFieldInstruction, editKey };
  const showTip = (e, label, text) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTipState({ label, text, x: r.right + 8, y: r.top + r.height / 2 });
  };
  const hideTip = () => setTipState(null);
  // 現在表示中のノードキー (切替検出用)。初回は editKey で初期化。
  const prevKeyRef = useRef(editKey);
  // ノード切替: 揮発してよい UI 状態だけリセットし、編集/生成状態は退避→復元する
  useEffect(() => {
    const prevKey = prevKeyRef.current;
    if (prevKey !== editKey) {
      // 1. 離れるノードの編集状態をキャッシュへ退避
      window.__nodeEditCache.set(prevKey, {
        localOverride: editStateRef.current.localOverride,
        aiInstruction: editStateRef.current.aiFieldInstruction,
      });
      // 2. 揮発してよい UI 状態はリセット
      setAdvancedOpen({}); setRevealedSecrets({});
      setAiExplain(""); setAiLoading(false);
      setOpenCap(null); setOpenOptInfo(null); setTipState(null);
      setAiFieldError("");
      // 3. 入るノードの編集状態をキャッシュ (なければ meta) から復元
      const restored = initFromCache();
      setLocalOverride(restored.localOverride);
      setAiFieldInstruction(restored.aiInstruction);
      prevKeyRef.current = editKey;
    }
    // 4. AI 生成ジョブの状態をレジストリから復元 (戻ってきた時に ⏳ / 結果を再表示)
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
        setAiFieldError(job.error || "AI 生成に失敗しました");
      }
    }
    // 5. この editKey のジョブ完了を購読 — マウント中なら結果/エラーを即反映。
    //    fetch 自体はコンポーネントに依存せず走り、完了時にここを呼ぶ。
    const sub = {
      onDone(result) {
        setAiFieldGenerating(false);
        setLocalOverride(o => ({ ...o, ...result }));
        const j = window.__aiFieldJobs.get(editKey);
        if (j) j.consumed = true;
      },
      onError(msg) {
        setAiFieldGenerating(false);
        setAiFieldError(msg || "AI 生成に失敗しました");
        const j = window.__aiFieldJobs.get(editKey);
        if (j) j.consumed = true;
      },
    };
    if (!window.__aiFieldSubs) window.__aiFieldSubs = new Map();
    window.__aiFieldSubs.set(editKey, sub);
    return () => {
      // アンマウント/切替時: 現在ノードの編集状態を退避し、購読を解除
      window.__nodeEditCache.set(editKey, {
        localOverride: editStateRef.current.localOverride,
        aiInstruction: editStateRef.current.aiFieldInstruction,
      });
      if (window.__aiFieldSubs && window.__aiFieldSubs.get(editKey) === sub) {
        window.__aiFieldSubs.delete(editKey);
      }
    };
  }, [editKey]);

  // 「AIに説明させる」: ノードの全情報を /api/explain に送り、説明文を取得
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
      setAiExplain(`(AI生成エラー: ${e.message})`);
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
          <div className="ne-section-label">このステップの役割</div>
          <div className="ne-explain">{nodeTypeExplain(node)}</div>
          {aiExplain && (
            <div className="ne-ai-explain">
              <div className="ne-ai-explain-label">✨ AI による解説 (このノード固有)</div>
              <div className="ne-ai-explain-text">{aiExplain}</div>
            </div>
          )}
          <button
            type="button"
            className={`ne-ai-btn ${aiLoading ? "loading" : ""}`}
            onClick={handleAiExplain}
            disabled={aiLoading}
            title="このノードの設定値を AI に解析させて、固有の説明を生成"
          >
            {aiLoading ? "⏳ 生成中..." : (aiExplain ? "🔄 もう一度生成" : "✨ AI に解説させる")}
          </button>
        </div>
        <NodeConfigFields node={node} flowId={workflow.id} onSaved={onSaved} onPatch={onPatch} />
        <div className="ne-section">
          <div className="ne-section-label">処理の流れ</div>
          <div className="ne-step-list">
            {nodeTypeSteps(node).map((step, i) => (
              <div key={i} className="ne-step">
                <span className="ne-step-num">{i + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* flowGuide — 「フローに置く時に決めること」
            優先順: node.meta.flowGuide → node.config.flowGuide → TYPE_SPECS[type].flowGuide (タイプ共通テンプレート) */}
        {(() => {
          const typeSpec = (window.FI && window.FI.TYPE_SPECS && window.FI.TYPE_SPECS[node.type]) || null;
          const fg = (node.meta && node.meta.flowGuide)
                  || (node.config && node.config.flowGuide)
                  || (typeSpec && typeSpec.flowGuide)
                  || null;
          if (!fg) return null;
          const tColor = (window.NODE_TYPES && window.NODE_TYPES[node.type] && window.NODE_TYPES[node.type].color) || "var(--accent)";
          const rows = [
            { num: "①", label: "何をする", val: fg.what },
            { num: "②", label: "対象",     val: fg.target },
            { num: "③", label: "内容",     val: fg.content },
          ].filter(r => r.val);
          if (rows.length === 0 && !fg.summary) return null;
          return (
            <div className="ne-section">
              <div className="ne-section-label">フローに置く時に決めること</div>
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

        {/* capabilities — このサーバーで使える主な機能 (MCPノードのみ) */}
        {node.type === "mcp" && (() => {
          const caps = (node.meta && Array.isArray(node.meta.capabilities) && node.meta.capabilities)
                   || (node.config && Array.isArray(node.config.capabilities) && node.config.capabilities)
                   || null;
          if (!caps || caps.length === 0) return null;
          const tColor = (window.NODE_TYPES && window.NODE_TYPES.mcp && window.NODE_TYPES.mcp.color) || "#15803d";
          return (
            <div className="ne-section">
              <div className="ne-section-label">このサーバーで使える主な機能</div>
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
                            title={isOpen ? "閉じる" : "詳しい説明を見る"}
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
            <div className="ne-section-label">補足メモ</div>
            <div className="ne-explain">{node.desc}</div>
          </div>
        )}
        {inLinks.length > 0 && (
          <div className="ne-section">
            <div className="ne-section-label">前のステップ ({inLinks.length})</div>
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
            <div className="ne-section-label">次のステップ ({outLinks.length})</div>
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
    // TYPE_SPECS マスター定義 (shared/flow-elements.js) を参照
    const specs = (window.FI && window.FI.TYPE_SPECS) || {};
    const baseSpec = specs[node.type];
    // meta (whiteboard 流) と config (8092 旧来) と localOverride (UI仮反映) の3層
    // localOverride は楽観的UI更新用 — 変更を即反映し、裏で PATCH /api/flows/{id}/nodes/{nid} を叩く。
    // 失敗時のみ rollback。flow_id が無い (whiteboard モード等) の場合は localOverride のみ。
    const baseMeta = (node.meta && Object.keys(node.meta).length) ? node.meta : (node.config || {});
    const meta = { ...baseMeta, ...localOverride };
    const usesMetaShape = !!(node.meta && Object.keys(node.meta).length);

    // 値変更を localOverride に即反映 (楽観的UI) → 裏で PATCH 送信 → 失敗時 rollback
    async function handleFieldSave(key, newVal) {
      const prev = key in localOverride ? localOverride[key] : undefined;
      const hadPrev = key in localOverride;
      // 1. 楽観的に UI 反映
      setLocalOverride(o => ({ ...o, [key]: newVal }));

      // 1b. ボードへ書き戻し (Plan Workspace 等で onPatch があるとき)。
      //     flowId が無くても効くので、SKILL.md 全文プレビュー・localStorage・undo に載る。
      if (typeof onPatch === "function") onPatch(node.id, { config: { [key]: newVal } });

      // 2. サーバーに永続化 (flow_id / node.id があるときのみ)
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
        // 3. 失敗時: そのキーだけ元に戻す
        setLocalOverride(o => {
          const copy = { ...o };
          if (hadPrev) copy[key] = prev;
          else delete copy[key];
          return copy;
        });
        console.warn(`保存失敗 (${key}):`, e.message);
        if (typeof showSettingsSaveError === "function") {
          showSettingsSaveError(key, e.message);
        }
      }
    }

    // 動的差し替え: tool / action / service / runtime / source / handler_type
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
      // hook 系: handler_type 別 + blockableOnly フィルタ
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

    // 各フィールドの描画
    const renderField = (f) => {
      const val = meta[f.key];
      const hasValue = val !== undefined && val !== null && val !== "" && !(Array.isArray(val) && val.length === 0);
      // 必須マークは validateFlowForSkill と同じ基準で出し分ける:
      //   赤● = スキル化をブロックする本当の必須 / 灰○ = 条件付き (自作定義時のみ or env由来の秘匿値) で空でも可
      const hardRequired = f.required && !f.authoringOnly && !f.secret;
      const softRequired = f.required && (f.authoringOnly || f.secret);
      const softTitle = f.authoringOnly
        ? "この要素を自作・定義するときだけ必須（フローの利用ステップでは空でOK）"
        : "秘匿値。通常は環境変数(envKey)から渡るので、ここは空でOK";
      return (
        <div key={f.key} className="ne-st-field">
          <div className="ne-st-label">
            <span>{f.label || f.key}</span>
            {hardRequired && <span className="ne-st-required" title="必須項目">●</span>}
            {softRequired && <span className="ne-st-required is-soft" title={softTitle}>○</span>}
          </div>
          {f.options ? (
            // 単一選択: クリックで値を切り替え (保存)。f.info[o] があれば ⓘ をホバーで詳細ツールチップ
            <div className="ne-st-badges">
              {f.options.map(o => {
                const hasInfo = !!(f.info && f.info[o]);
                return (
                  <span key={o} className={`ne-st-badge-wrap ${val === o ? "is-on" : ""}`}>
                    <button
                      type="button"
                      className={`ne-st-badge ${val === o ? "on" : ""} ${hasInfo ? "has-info" : ""}`}
                      onClick={() => handleFieldSave(f.key, o)}
                      title={`${f.label || f.key} を「${o}」に変更`}
                    >{o}</button>
                    {hasInfo && (
                      <span
                        className="ne-st-opt-info"
                        onMouseEnter={(e) => showTip(e, `${f.label || f.key}: ${o}`, f.info[o])}
                        onMouseLeave={hideTip}
                        role="img" aria-label={`${o} の詳細`}
                      >i</span>
                    )}
                  </span>
                );
              })}
            </div>
          ) : f.multi ? (
            (() => {
              const arr = Array.isArray(val) ? val : (val ? [val] : []);
              // f.multi が配列なら候補リスト → チェックリスト的に複数選択可能
              // f.multi: true (boolean) なら既存値の表示のみ
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
                            title={`${f.label || f.key}: ${c} を${isOn ? "外す" : "追加"}`}
                          >{isOn ? "✓ " : ""}{c}</button>
                          {hasInfo && (
                            <span
                              className="ne-st-opt-info"
                              onMouseEnter={(e) => showTip(e, `${f.label || f.key}: ${c}`, f.info[c])}
                              onMouseLeave={hideTip}
                              role="img" aria-label={`${c} の詳細`}
                            >i</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                );
              }
              if (arr.length === 0) return <div className="ne-st-val is-empty">未設定</div>;
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
                      {hasValue ? (revealed ? String(val) : masked) : <span style={{color:"var(--tx-4)",fontStyle:"italic"}}>未設定</span>}
                    </div>
                    {hasValue && (
                      <button
                        type="button"
                        className="ne-st-secret-btn"
                        onClick={() => setRevealedSecrets(s => ({ ...s, [f.key]: !s[f.key] }))}
                        title={revealed ? "マスクに戻す" : "値を表示"}
                      >{revealed ? "🔒" : "👁"}</button>
                    )}
                  </div>
                  <div className="ne-st-secret-note">
                    <span style={{color:"#16a34a"}}>🔒</span>
                    <span>本実装時は <code style={{fontFamily:'"Geist Mono",monospace',background:"var(--bg-3)",padding:"1px 4px",borderRadius:3}}>.env</code> に保存{f.envKey ? ` (${f.envKey})` : ""}</span>
                  </div>
                </>
              );
            })()
          ) : f.long ? (
            // 長文 textarea: blur (focus 解除) 時に保存
            <textarea
              key={`${node.id}-${f.key}-${String(val)}`}
              className="ne-st-long-input"
              defaultValue={hasValue ? String(val) : ""}
              placeholder="未設定"
              onBlur={(e) => {
                const newVal = e.target.value;
                if (newVal !== (val == null ? "" : String(val))) handleFieldSave(f.key, newVal);
              }}
              rows={Math.min(8, Math.max(3, (String(val || "").match(/\n/g) || []).length + 2))}
            />
          ) : (
            // 短文 input: blur 時に保存。オブジェクト値は表示のみ (Dev タブで編集)
            (typeof val === "object" && val !== null) ? (
              <div className={`ne-st-val ${!hasValue ? "is-empty" : ""}`}>{JSON.stringify(val)}</div>
            ) : (
              <input
                key={`${node.id}-${f.key}-${String(val)}`}
                type="text"
                className="ne-st-text-input"
                defaultValue={hasValue ? String(val) : ""}
                placeholder="未設定"
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

    // 設定/Dev タブ共通: 説明 + 前後ノード一覧 (タブが「消えた」感を防ぐためのフォールバック)
    const renderContextBlock = (variant) => (
      <>
        {(node.desc || node.subtitle || node.summary) && (
          <div className="ne-section">
            <div className="ne-section-label">説明</div>
            <div className="ne-explain">{node.desc || node.subtitle || node.summary}</div>
          </div>
        )}
        {inLinks.length > 0 && (
          <div className="ne-section">
            <div className="ne-section-label">前のステップ ({inLinks.length})</div>
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
            <div className="ne-section-label">次のステップ ({outLinks.length})</div>
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

    // セクション別に描画 (fieldSections 無ければ単一セクション)
    const renderFieldsSection = () => {
      if (!spec || !Array.isArray(spec.fields) || spec.fields.length === 0) {
        return (
          <>
            <div className="ne-section">
              <div className="ne-section-label">設定フィールド</div>
              <div className="ne-cfg-empty">このノードタイプは設定不要です（{window.NODE_TYPES[node.type]?.label || node.type} は他のノードを統括・接続するため、固有のパラメータを持ちません）</div>
            </div>
            {renderContextBlock("settings")}
          </>
        );
      }

      // AIで設定を生成: 指示文 + フィールド定義を /api/auto-config (node-fields) に投げ、
      // 返ってきた値を一括で localOverride に反映 + 1 回の PATCH で永続化する。
      // (handleFieldSave を順次呼ぶと PATCH が互いに古い localOverride を上書きするため一括)
      // ジョブレジストリ経由で実行。fetch はコンポーネントのマウント状態に依存せず走り、
      // 完了時にレジストリへ結果を保存 + 該当 editKey の購読者へ通知する。
      // → ノード切替で離れても生成は継続し、戻れば ⏳/結果が正しいノードに反映される。
      function generateNodeFields() {
        const instruction = (aiFieldInstruction || "").trim();
        const jobKey = editKey;
        const existing = window.__aiFieldJobs.get(jobKey);
        if (!instruction || (existing && existing.status === "running")) return;
        setAiFieldGenerating(true); setAiFieldError("");
        // 実用設定 (PART_FIELDS) + 技術フィールド (spec.fields) の両方を AI に渡す。
        // capability ノード (Gmail 等) は宛先/件名/本文が PART_FIELDS 側にあるため、
        // これを含めないと AI が返した値が表示フィールドに反映されない。
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
        // レジストリに running として登録
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
              const msg = "AI が設定値を生成できませんでした";
              window.__aiFieldJobs.set(jobKey, { status: "error", result: null, error: msg, consumed: false });
              notify("error", msg); return;
            }
            const updates = { ...gen, ai_instruction: instruction };
            // 生成は設定フィールドを「埋めるだけ」(localOverride に反映)。永続化は「保存」に委ねる。
            // マウント中でなくてもレジストリに残るので、戻ってきた時に effect が反映する。
            window.__aiFieldJobs.set(jobKey, { status: "done", result: updates, error: "", consumed: false });
            // 戻ってきた時に復元できるよう、編集キャッシュにも反映しておく
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
          <div className="ne-section-label">✨ AIで設定を生成</div>
          <div className="ne-st-sec-desc">やりたいことを書いてボタンを押すと、下の設定を自動で埋めます。</div>
          <textarea
            rows={2}
            placeholder="例: 経理部にプロジェクト完了の報告メールを送る"
            value={aiFieldInstruction}
            onChange={e => {
              const v = e.target.value;
              setAiFieldInstruction(v);
              // リロードを跨いで残すため meta に随時保存 (初期復元元と同じ場所)
              if (node.meta) node.meta.ai_instruction = v;
              // ノード切替を跨いで残すため編集キャッシュにも反映
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
          >{aiFieldGenerating ? "⏳ 生成中…" : "✨ AIで設定を生成"}</button>
          {aiFieldError && <div className="fme-error" style={{ marginTop: 6 }}>{aiFieldError}</div>}
        </div>
      );

      const sections = (spec.fieldSections && spec.fieldSections.length > 0)
        ? spec.fieldSections
        : [{ key: "_default", title: "設定フィールド", desc: "" }];
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
                  title={isAdvancedOpen ? "上級者向けフィールドを隠す" : "上級者向けフィールドを表示"}
                >
                  {isAdvancedOpen ? "▼" : "▶"} 上級者向け ({advancedItems.length})
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

      // ── 実用パーツ (meta.capability あり): 実用コアを上に、技術フィールドは折りたたみ ──
      const capability = meta.capability;
      const coreFields = (capability && window.FI && window.FI.PART_FIELDS)
        ? window.FI.PART_FIELDS[capability] : null;
      if (coreFields && coreFields.length > 0) {
        const detailOpen = !!advancedOpen["__parts_detail__"];
        return (
          <>
            {aiBlock}
            <div className="ne-section">
              <div className="ne-section-label">🧱 実用設定</div>
              <div className="ne-st-sec-desc">このパーツでよく使う項目です。ここだけ埋めれば動きます。</div>
              {coreFields.map(renderField)}
            </div>
            <div className="ne-section">
              <button
                type="button"
                className="ne-st-adv-btn"
                onClick={() => setAdvancedOpen(o => ({ ...o, __parts_detail__: !o["__parts_detail__"] }))}
                title={detailOpen ? "技術的な詳細設定を隠す" : "技術的な詳細設定を表示"}
              >
                {detailOpen ? "▼" : "▶"} 詳細設定（上級者向け）
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
              <div className="ne-section-label">設定フィールド</div>
              <div className="ne-cfg-empty">TYPE_SPECS が読み込まれていません (shared/flow-elements.js を確認してください)</div>
            </div>
            {renderContextBlock("settings")}
          </>
        ) : !baseSpec ? (
          <>
            <div className="ne-section">
              <div className="ne-section-label">設定フィールド</div>
              <div className="ne-cfg-empty">このノードタイプ ({node.type}) には TYPE_SPECS 定義がありません</div>
            </div>
            {renderContextBlock("settings")}
          </>
        ) : (
          renderFieldsSection()
        )}
        {/* ⓘホバーツールチップ (viewport固定、z-index 最上位) */}
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

// ノードごとのチャット履歴を React 外に保持する。パネルを閉じても (ChatPanel が
// アンマウントされても) 内容が残るので、再度開いたときに復元される。
if (!window.__nodeChatCache) window.__nodeChatCache = new Map();
function _nodeChatKey(workflow, selectedNode) {
  return `${workflow?.id || "_"}::${selectedNode?.id || "_flow"}`;
}

export function ChatPanel({ workflow, selectedNode, onSaved, onApplyNodeSettings }) {
  const chatKey = _nodeChatKey(workflow, selectedNode);
  // 初期値はキャッシュから復元 (key prop でノードごとに別インスタンスになる前提)
  const [messages, setMessages] = useState(() => window.__nodeChatCache.get(chatKey) || []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [available, setAvailable] = useState(null);
  const [parsedSettings, setParsedSettings] = useState(null);  // AI が提案した {desc, config}（旧・編集モード。説明タブでは出ない）
  const [editPrompt, setEditPrompt] = useState(null);  // AI が生成したコピペ用ブロック { kind:"edit"|"claudemd", text }
  const [copied, setCopied] = useState(false);
  const [intent, setIntent] = useState(null);  // 入口で選んだ意図: null | "fix"（スキル修正） | "claudemd"（CLAUDE.md追加）
  const [applying, setApplying] = useState(false);
  const messagesEnd = useRef(null);
  const textareaRef = useRef(null);

  // assistant の最新メッセージから ```node_settings ブロックを抽出
  function tryParseSettings(fullText) {
    const obj = extractTaggedJson(fullText, "node_settings");
    if (obj && !Array.isArray(obj) && (obj.desc !== undefined || obj.config !== undefined)) return obj;
    return null;
  }

  // assistant の最新メッセージから ```edit_prompt フェンスの中身（コピペ用 修正プロンプト）を抽出
  function tryParseEditPrompt(fullText) {
    const m = (fullText || "").match(/```edit_prompt\s*\n([\s\S]*?)\n```/);
    return m ? m[1].trim() : null;
  }
  // ```claude_md_add フェンス（CLAUDE.md に追記する案）を抽出
  function tryParseClaudeMdAdd(fullText) {
    const m = (fullText || "").match(/```claude_md_add\s*\n([\s\S]*?)\n```/);
    return m ? m[1].trim() : null;
  }

  // 入口で「修正したい / CLAUDE.mdに追加したい」を選んだとき: すぐLLMに投げず、まず聞く。
  function startIntent(kind) {
    setIntent(kind);
    setEditPrompt(null);
    const q = kind === "fix"
      ? "どんな修正をしたいですか？ 直したい点を書いてください（例：「status 以外の引数はエラーで止めたい」）。それを元に、Claude Code か編集チャットにそのまま貼れる修正プロンプトを作ります。"
      : "CLAUDE.md に何を足したいですか？ このフローで気づいたルールや注意点を書いてください（例：「このコマンドは VPS 前提でローカルでは動かない、と明記したい」）。どのファイルにどう書くかの追記案を作ります。";
    setMessages([{ role: "assistant", content: q }]);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  // 提案された設定を実ノードに適用する。
  // - onApplyNodeSettings が渡されていれば (Plan Workspace 等) それに委譲 (ボード状態を更新)
  // - 無ければ通常フローとして PATCH /api/flows/{id}/nodes/{id} → onSaved で再読込
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
        if (!res.ok) throw new Error(`保存に失敗 (HTTP ${res.status})`);
        if (typeof onSaved === "function") onSaved();
      }
      setParsedSettings(null);
      setMessages(m => [...m, { role: "system", content: "✓ ノードに設定を反映しました" }]);
    } catch (e) {
      alert("適用に失敗: " + ((e && e.message) || e));
    }
    setApplying(false);
  }

  useEffect(() => {
    apiFetch("/api/chat/status").then(r => setAvailable(r.available)).catch(() => setAvailable(false));
  }, []);

  // messages が変わるたびにキャッシュへ書き戻す (アンマウントしても残す)
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
          // UI 専用メッセージ (role:"system": 適用確認・エラー表示) は API に送らない (backend は user/assistant のみ許可 → それ以外は 422)
          messages: newMsgs.filter(m => m.role === "user" || m.role === "assistant"),
          flow_id: workflow?.id || null,
          node_id: selectedNode?.id || null,
          // このタブは常にフロー/ノードの「説明 + 修正/追加プロンプト生成」モード（ノード未選択でも）
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
      // ストリーム完了後、設定ブロックがあれば適用候補として保持（旧・編集モード）
      const settings = tryParseSettings(assistantText);
      if (settings) setParsedSettings(settings);
      // 説明タブの本命: 修正プロンプト(edit_prompt) / CLAUDE.md追記案(claude_md_add) があればコピペ用カードに
      const ep = tryParseEditPrompt(assistantText);
      const cm = tryParseClaudeMdAdd(assistantText);
      if (ep) setEditPrompt({ kind: "edit", text: ep });
      else if (cm) setEditPrompt({ kind: "claudemd", text: cm });
      else setEditPrompt(null);
      setCopied(false);
    } catch(e) {
      setMessages(m => [...m, { role: "system", content: "接続エラー: " + e.message }]);
    }
    setStreaming(false);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const suggestions = selectedNode ? [
    `「${selectedNode.title}」は何をするノード？`,
    "入力と出力は？",
    "フロー全体のどこで動く？",
  ] : [
    "このフローは何をするもの？",
    "いつ起動する？",
    "全体の流れを説明して",
  ];

  if (available === false) {
    return (
      <div className="chat-panel">
        <div className="chat-unavailable">
          <div className="chat-empty-icon">⚡</div>
          <h4>Claude CLI が見つかりません</h4>
          <p>チャット機能は Claude Code CLI 経由で動作します</p>
          <code>npm install -g @anthropic-ai/claude-code</code>
          <p style={{ fontSize: 10.5, marginTop: 4 }}>インストール後、ターミナルで <code>claude</code> が動作することを確認</p>
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
              title="このノードのチャット履歴をクリア"
            >🗑 履歴をクリア</button>
          )}
        </div>
      )}
      {messages.length === 0 ? (
        <div className="chat-empty">
          <div className="chat-empty-icon">💬</div>
          <h4>{selectedNode ? "このノードの役割を説明" : "このフローの中身を説明"}</h4>
          <p>{selectedNode ? <>「{selectedNode.title}」が何を入力に・何をして・何を出すか、<br/>フローのどこで動くかを説明します</> : <>このスキル/コマンドが何をするものか、<br/>全体の流れを説明します（修正したいときは修正プロンプトを作ります）</>}</p>
          <div className="chat-suggestions">
            {suggestions.map((s, i) => (
              <button key={i} className="chat-suggest-btn" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--bd, #e5e7eb)", display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 320 }}>
            <div style={{ fontSize: 10.5, color: "var(--tx-4)", marginBottom: 2 }}>または — 修正したいときは（押すと先に聞きます）</div>
            <button className="chat-suggest-btn" style={{ textAlign: "left" }} onClick={() => startIntent("fix")}>✏️ このスキル/コマンドを修正したい</button>
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
              <h5 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--accent)" }}>📋 このノードに反映する設定</h5>
              {parsedSettings.desc !== undefined && (
                <div style={{ fontSize: 11, marginBottom: 4 }}>
                  <b>本文:</b> {String(parsedSettings.desc).slice(0, 160)}{String(parsedSettings.desc).length > 160 ? "…" : ""}
                </div>
              )}
              {parsedSettings.config && (
                <div style={{ fontSize: 10, fontFamily: "monospace", marginBottom: 6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {JSON.stringify(parsedSettings.config, null, 2)}
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setParsedSettings(null)} style={{ fontSize: 11, padding: "4px 10px" }}>却下</button>
                <button className="primary" onClick={applySettings} disabled={applying}
                  style={{ fontSize: 11, padding: "4px 10px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4 }}>
                  {applying ? "適用中…" : "✓ このノードに適用"}
                </button>
              </div>
            </div>
          )}
          {editPrompt && !streaming && (
            <div className="ai-design-spec-preview" style={{ border: "1px solid var(--accent)", borderRadius: 8, padding: 10, marginTop: 8, background: "var(--accent-bg, #eff6ff)" }}>
              <h5 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--accent)" }}>
                {editPrompt.kind === "claudemd"
                  ? "📝 CLAUDE.md 追記案（コピーして CLAUDE.md チャット / Claude Code へ）"
                  : "📋 修正プロンプト（コピーして Claude Code か「編集」チャットへ）"}
              </h5>
              <div style={{ fontSize: 11, fontFamily: "monospace", marginBottom: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflowY: "auto", background: "var(--bg-2, #fff)", border: "1px solid var(--bd, #e5e7eb)", borderRadius: 4, padding: 8 }}>
                {editPrompt.text}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button className="primary" onClick={() => { navigator.clipboard.writeText(editPrompt.text).then(() => setCopied(true)).catch(() => {}); }}
                  style={{ fontSize: 11, padding: "4px 10px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4 }}>
                  {copied ? "✓ コピーしました" : "📋 コピー"}
                </button>
                <button onClick={() => setEditPrompt(null)} style={{ fontSize: 11, padding: "4px 10px" }}>閉じる</button>
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
          placeholder={selectedNode ? `${selectedNode.title} について質問…` : "ワークフローについて質問…"}
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
          // role:"system" の UI 専用メッセージ (エラー表示等) は除外 (backend は user/assistant のみ → それ以外は 422)
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
      setMessages(m => [...m, { role: "system", content: "接続エラー: " + e.message }]);
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
        <h4>✨ AIノード設計</h4>
        <p>やりたいことを伝えると、最適なノード設計を提案します</p>
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
            <h5>📋 設計されたノード</h5>
            <div className="ai-design-spec-row"><span className="label">Type</span><span className="value" style={{ color: window.NODE_TYPES[parsedSpec.type]?.color || "var(--tx)" }}>{window.NODE_TYPES[parsedSpec.type]?.label || parsedSpec.type}</span></div>
            <div className="ai-design-spec-row"><span className="label">Title</span><span className="value">{parsedSpec.title}</span></div>
            {parsedSpec.subtitle && <div className="ai-design-spec-row"><span className="label">Sub</span><span className="value">{parsedSpec.subtitle}</span></div>}
            <div className="ai-design-spec-row"><span className="label">Desc</span><span className="value">{parsedSpec.desc}</span></div>
            {parsedSpec.config && <div className="ai-design-spec-row"><span className="label">Config</span><span className="value mono" style={{fontSize:10}}>{JSON.stringify(parsedSpec.config)}</span></div>}
            <div className="ai-design-actions">
              <button onClick={onCancel}>キャンセル</button>
              <button className="primary" onClick={() => onApplySpec(parsedSpec)}>✓ ドラフトに追加</button>
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
          placeholder="追加の要件や質問…"
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
        ⚡ 「Claudeに実装を依頼」ボタンで、この仕様をもとに実装されます
      </div>
      <button className="draft-discard" style={{ marginTop: 8, width: "100%" }} onClick={() => removeDraft(node.id)}>
        このドラフトを削除
      </button>
    </div>
  );
}

export function RightPanel({ node, workflow, onClose, onJump, onSaved, drafts, updateDraft, removeDraft, aiDesign, onAIApplySpec, onAICancelDesign, floating, onApplyNodeSettings }) {
  const [tab, setTab] = useState("inspector");
  const [viewMode, setViewMode] = useState("simple"); // "simple" (概要) | "settings" (設定) | "dev" (エンジニア向け)
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
        title={minimized ? "展開 (+)" : "最小化 (−)"}
      >{minimized ? "+" : "−"}</button>
      <div className="right-tabs">
        <button className={`right-tab ${tab === "inspector" ? "is-active" : ""}`} onClick={() => setTab("inspector")}>
          <span className="tab-icon">🔍</span> Inspector
        </button>
        <button className={`right-tab ${tab === "fulltext" ? "is-active" : ""}`} onClick={() => setTab("fulltext")}>
          <span className="tab-icon">📄</span> 全文
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
                    <button className={`dh-mode-btn ${viewMode === "simple" ? "is-active" : ""}`} onClick={() => setViewMode("simple")}>概要</button>
                    <button className={`dh-mode-btn ${viewMode === "settings" ? "is-active" : ""}`} onClick={() => setViewMode("settings")}>設定</button>
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
      // stage 成功後そのまま実反映 (差分検出→claude -p→push)
      const dep = await apiPost("/api/workspace/deploy", {});
      const np = (dep.pushed || []).length, nf = (dep.failed || []).length;
      window.alert(`反映 ${np}件 / 失敗 ${nf}件`);
      setStaging("done");
      // 同期ボタン (ConfigStackActions) のバッジを更新
      window.dispatchEvent(new CustomEvent("flow-inspector:staged-changed"));
      // 本文が空のノードがあれば警告 (ノード詳細の AI チャットで埋めてもらう想定)
      const warnings = (res && res.warnings) || [];
      if (warnings.length > 0) {
        alert(
          `⚠️ ${warnings.length}個のノードが未記入のまま保存されました:\n\n` +
          warnings.map(w => "・" + w).join("\n") +
          "\n\n各ノードの詳細パネルの AI チャットで本文を作成してください。"
        );
      }
      setTimeout(() => setStaging("idle"), 2500);
    } catch (e) {
      setStaging("error");
      alert("ステージ保存に失敗: " + ((e && e.message) || e));
      setTimeout(() => setStaging("idle"), 2500);
    }
  }

  const stageLabel = staging === "staging" ? "⏳ 保存中…"
    : staging === "done" ? "✓ ステージ保存済"
    : staging === "error" ? "⚠ 失敗"
    : "💾 ステージに保存";

  async function handleCopyToPlan() {
    if (!workflow) return;
    // 「フロー全体」を Plan Workspace 用のクリップボード形式で保存
    const item = {
      id: `flow_${Date.now()}`,
      type: "flow",
      flowId: workflow.id,
      label: `${workflow.name} のコピー`,
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
            title="フロー図の編集を実ファイル形式に変換してステージに保存。実環境への反映は設定スタックの「⇡ 同期」で行う。"
          >{stageLabel}</button>
        )}
        <button
          className="tb-plan-copy"
          onClick={handleCopyToPlan}
          title="このフロー全体を Plan Workspace のクリップボードにコピー (Plan Workspace でCmd+V で貼り付け)"
        >{copied ? "✓ コピーしました" : "📋 Plan にコピー"}</button>
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
  // floating 時の高さ (展開時)。ドラッグハンドルでリサイズ可能。localStorage 永続化。
  const initialHeight = (() => {
    try { const v = parseInt(localStorage.getItem("fi_dock_height") || ""); return (v >= 120 && v <= window.innerHeight - 80) ? v : Math.round(window.innerHeight * 0.4); }
    catch { return Math.round(window.innerHeight * 0.4); }
  })();
  const [dockHeight, startDockResize, setDockHeight] = useResizable(initialHeight, 120, window.innerHeight - 80);
  useEffect(() => {
    try { localStorage.setItem("fi_dock_height", String(dockHeight)); } catch {}
  }, [dockHeight]);
  // ヘッダー (タブ以外) クリックで toggle
  const onHeadClick = (e) => {
    // タブボタン / アクションボタン領域 / リサイズハンドル は除外
    if (e.target.closest(".dock-tab") || e.target.closest(".dock-actions") || e.target.closest(".dock-resize")) return;
    setMinimized(m => !m);
  };
  const baseClass = `dock ${minimized ? "is-minimized" : ""} ${floating ? "is-floating" : ""}`;
  // 展開時の高さスタイル (floating かつ展開時のみ反映)
  const heightStyle = (floating && !minimized) ? { height: `${dockHeight}px`, maxHeight: `${dockHeight}px` } : {};
  if (!node) return (
    <div className={baseClass} style={heightStyle}>
      {floating && !minimized && <div className="dock-resize" onMouseDown={startDockResize("up")} title="ドラッグでサイズ変更" />}
      <div className="dock-head" onClick={onHeadClick} style={{ cursor: "pointer" }} title={minimized ? "クリックで展開" : "クリックで折り畳み"}>
        <div className="dock-tabs">{["details","timeline","logs","config"].map(t => (<button key={t} className={`dock-tab ${tab === t ? "is-active" : ""}`} onClick={(e) => { e.stopPropagation(); setTab(t); if (minimized) setMinimized(false); }}>{t}</button>))}</div>
        <div className="dock-actions">
          <button className="dock-btn" onClick={(e) => { e.stopPropagation(); setMinimized(m => !m); }} title={minimized ? "展開" : "折り畳み"}>{minimized ? "▲" : "▼"}</button>
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
      {floating && !minimized && <div className="dock-resize" onMouseDown={startDockResize("up")} title="ドラッグでサイズ変更" />}
      <div className="dock-head" onClick={onHeadClick} style={{ cursor: "pointer" }} title={minimized ? "クリックで展開" : "クリックで折り畳み"}>
        <div className="dock-tabs">{["details","timeline","logs","config"].map(tb => (<button key={tb} className={`dock-tab ${tab === tb ? "is-active" : ""}`} onClick={(e) => { e.stopPropagation(); setTab(tb); if (minimized) setMinimized(false); }}>{tb}</button>))}</div>
        <div className="dock-node"><span className="dock-chip" style={{ background: t.bg, color: t.color, borderColor: t.color }}>{t.label}</span><span className="dock-title">{node.title}</span><span className="dock-sub">{node.subtitle}</span></div>
        <div className="dock-actions">
          <button className="dock-btn" onClick={(e) => { e.stopPropagation(); setMinimized(m => !m); }} title={minimized ? "展開" : "折り畳み"}>{minimized ? "▲" : "▼"}</button>
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
    // メインキャンバスのそのノード位置にスクロール (.diagram のスクロール領域があれば)
    const diagram = document.querySelector(".diagram, .flow-diagram, .dt-canvas");
    if (diagram) {
      // ノードカード要素を探して scrollIntoView
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
              {/* 当たり判定を広げるための透明 circle */}
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
              {/* 見た目のドット */}
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
    // right / down: +、left / up: -
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
          <>⚡ Claudeに実装を依頼</>
        )}
      </button>
      <button className="draft-discard" onClick={onDiscard}>Discard</button>
    </div>
  );
}
