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
        <button className="sa-back" onClick={onBack}>&larr; 戻る</button>
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
              <div className="sa-card-title">プロンプト</div>
              {!editing && <button className="sa-edit-toggle" onClick={() => setEditing(true)}>編集</button>}
            </div>
            {editing ? (
              <>
                <textarea className="sa-prompt-edit" value={draft} onChange={e => setDraft(e.target.value)} />
                <div className="sa-prompt-actions">
                  <button className="sa-btn" onClick={handleCancel}>キャンセル</button>
                  <button className="sa-btn sa-btn-primary" onClick={handleSave}>保存</button>
                </div>
              </>
            ) : (
              <pre className="sa-prompt-pre">{agent.prompt || "(プロンプト未設定)"}</pre>
            )}
          </div>

          <div className="sa-card">
            <div className="sa-card-title">許可ツール</div>
            {agent.allowed_tools && agent.allowed_tools.length > 0 ? (
              <div className="sa-tools-grid">
                {agent.allowed_tools.map(t => <ToolChipWithDetail key={t} toolName={t} />)}
              </div>
            ) : (
              <div className="sa-empty-note">制限なし — 全ツール利用可能</div>
            )}
          </div>

          <div className="sa-card">
            <div className="sa-card-title">構成</div>
            <div className="sa-kv-list">
              <div className="sa-kv"><span className="sa-kv-k">レイヤー</span><span className="sa-kv-v">{layerLabel[agent.layer] || agent.layer}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">モデル</span><span className="sa-kv-v">{agent.model || "デフォルト（継承）"}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">種別</span><span className="sa-kv-v">{agent.type === "built-in" ? "ビルトイン" : "カスタム定義"}</span></div>
              {agent.source && <div className="sa-kv"><span className="sa-kv-k">定義ファイル</span><span className="sa-kv-v" style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12 }}>{agent.source}</span></div>}
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
    ? "許可 (allow) / 拒否 (block) / 変更 (modify)"
    : "観測のみ（副作用として実行）";

  // Simple flow steps for visualization
  const flowSteps = isPre ? [
    { icon: "⚡", label: "イベント発火", desc: `Claudeが ${hook.matcher} を使おうとした` },
    { icon: "🔍", label: "マッチャー判定", desc: `パターン "${hook.matcher}" に一致？` },
    { icon: "📥", label: "データ受信", desc: hook.input_summary || "ツール名と入力内容をJSON受信" },
    { icon: "⚙", label: "スクリプト実行", desc: hook.script },
    { icon: "📤", label: "判定を返却", desc: hook.output_summary || "allow / block / modify" },
    { icon: isPre ? "✅" : "📋", label: isPre ? "Claudeが判定に従う" : "結果をログ", desc: isPre ? "allowならツール実行、blockなら中止" : "ツール実行結果を記録" },
  ] : [
    { icon: "⚡", label: "ツール実行完了", desc: `Claudeが ${hook.matcher} を使い終わった` },
    { icon: "🔍", label: "マッチャー判定", desc: `パターン "${hook.matcher}" に一致？` },
    { icon: "📥", label: "結果受信", desc: hook.input_summary || "ツール実行結果をJSON受信" },
    { icon: "⚙", label: "スクリプト実行", desc: hook.script },
    { icon: "📋", label: "処理完了", desc: hook.output_summary || "ログ記録・通知などの副作用" },
  ];

  return (
    <div className="sa-page">
      <div className="sa-topbar">
        <button className="sa-back" onClick={onBack}>&larr; 戻る</button>
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
              <p className="sa-hero-desc">{hook.description || `${hook.type} フック — ${hook.matcher} にマッチ`}</p>
              <div className="sa-meta-row">
                <span className="sa-meta-pill"><span className="dot" style={{ background: lc }} />{layerLabel[hook.layer]}</span>
                <span className="sa-meta-pill" style={{ color: ec, borderColor: `color-mix(in srgb, ${ec} 30%, transparent)` }}>{hook.type}</span>
                <span className="sa-meta-pill" style={{ fontFamily: '"Geist Mono", monospace' }}>{hook.matcher}</span>
              </div>
            </div>
          </div>

          {/* What this hook does — plain language */}
          <div className="sa-card">
            <div className="sa-card-title">このフックは何をするか</div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--tx-2)" }}>
              {isPre ? (
                <span>Claudeが <code style={{ background: "var(--bg-3)", padding: "2px 6px", borderRadius: 4 }}>{hook.matcher}</code> を<strong>使う前</strong>に自動で実行されます。スクリプトが「拒否」を返した場合、ツール実行はブロックされます。</span>
              ) : (
                <span>Claudeが <code style={{ background: "var(--bg-3)", padding: "2px 6px", borderRadius: 4 }}>{hook.matcher}</code> を<strong>使った後</strong>に自動で実行されます。ツール実行の結果に対して、ログ記録や通知などの追加処理を行います。</span>
              )}
            </div>
            {hook.use_case && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--tx-3)", borderTop: "1px solid var(--bd)", paddingTop: 10 }}>
                💡 <strong>活用例:</strong> {hook.use_case}
              </div>
            )}
          </div>

          {/* Flow visualization */}
          <div className="sa-card">
            <div className="sa-card-title">実行フロー</div>
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
            <div className="sa-card-title">入出力データ</div>
            <div className="sa-kv-list" style={{ gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>📥 入力 (stdin)</div>
                <div style={{ fontSize: 12, color: "var(--tx-3)", marginBottom: 6 }}>{hook.input_summary}</div>
                {hook.input_example && <pre className="sa-prompt-pre" style={{ fontSize: 11, padding: "10px 14px" }}>{hook.input_example}</pre>}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>📤 出力 (stdout)</div>
                <div style={{ fontSize: 12, color: "var(--tx-3)", marginBottom: 6 }}>{hook.output_summary}</div>
                {hook.output_example && <pre className="sa-prompt-pre" style={{ fontSize: 11, padding: "10px 14px" }}>{hook.output_example}</pre>}
              </div>
            </div>
          </div>

          {/* Decision examples */}
          {hook.examples && hook.examples.length > 0 && (
            <div className="sa-card">
              <div className="sa-card-title">判定の具体例</div>
              <div style={{ fontSize: 13, color: "var(--tx-3)", marginBottom: 16, lineHeight: 1.5 }}>
                {isPre ? "こんなとき承認され、こんなとき拒否されます。" : "すべて通過しますが、処理内容が変わります。"}
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
                        }}>{ex.decision === "allow" ? "承認" : "拒否"}</span>
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
            <div className="sa-card-title">構成</div>
            <div className="sa-kv-list">
              <div className="sa-kv"><span className="sa-kv-k">レイヤー</span><span className="sa-kv-v">{layerLabel[hook.layer]}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">イベント</span><span className="sa-kv-v">{hook.type}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">マッチャー</span><span className="sa-kv-v" style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12 }}>{hook.matcher}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">ハンドラー</span><span className="sa-kv-v">{hook.handler || "command"}</span></div>
              <div className="sa-kv"><span className="sa-kv-k">スクリプト</span><span className="sa-kv-v" style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12 }}>{hook.script}</span></div>
              {hook.timeout && <div className="sa-kv"><span className="sa-kv-k">タイムアウト</span><span className="sa-kv-v">{hook.timeout / 1000}秒</span></div>}
              <div className="sa-kv"><span className="sa-kv-k">判定権限</span><span className="sa-kv-v">{decisionLabel}</span></div>
              {hook.config_path && <div className="sa-kv"><span className="sa-kv-k">定義ファイル</span><span className="sa-kv-v" style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12 }}>{hook.config_path}</span></div>}
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
  // プロンプト本文: デモは command.prompt 直書き、実データは source ファイルから取得
  const [src, setSrc] = React.useState(null); // null=未取得 | {loading} | {content,path} | {error}

  React.useEffect(() => {
    if (isBuiltin || command.prompt || !command.flowId) return;
    let alive = true;
    setSrc({ loading: true });
    fetch(`/api/flows/${encodeURIComponent(command.flowId)}/source`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.detail || "読み取り失敗")))
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
        <button className="sa-back" onClick={onBack}>&larr; 戻る</button>
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
            <div className="sa-card-title">このコマンドができること</div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--tx-2)" }}>
              {command.overview || command.desc}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--tx-3)", borderTop: "1px solid var(--bd)", paddingTop: 10 }}>
              {isBuiltin
                ? <span>💡 <code style={{ background: "var(--bg-3)", padding: "2px 6px", borderRadius: 4 }}>{command.name}</code> は Claude Code 本体に組み込まれた内蔵コマンドです（プロンプト注入ではなく本体機能として動作）。</span>
                : <span>💡 スラッシュコマンドは「<code style={{ background: "var(--bg-3)", padding: "2px 6px", borderRadius: 4 }}>{command.name}</code> と打つと、下のプロンプトが Claude に注入される」という仕組みです。</span>}
            </div>
          </div>

          {/* Prompt — or built-in badge */}
          {isBuiltin ? (
            <div className="sa-card">
              <div className="sa-card-title">投げられるプロンプト</div>
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10,
                background: "var(--bg-2)", border: "1px solid var(--bd)", fontSize: 13, color: "var(--tx-3)",
              }}>
                <span style={{ fontSize: 16 }}>🔒</span>
                <span><strong style={{ color: "var(--tx-2)" }}>内蔵コマンド</strong> — 編集可能なプロンプトファイルはありません。Claude Code 本体に組み込まれた動作として実行されます。</span>
              </div>
            </div>
          ) : (
            <div className="sa-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div className="sa-card-title" style={{ marginBottom: promptPath ? 2 : 0 }}>投げられるプロンプト</div>
                  {promptPath && <div style={{ fontSize: 11, color: "var(--tx-4)", fontFamily: '"Geist Mono", monospace' }}>{promptPath}</div>}
                </div>
                {promptText && (
                  <button className="cmd-detail-btn" onClick={copyPrompt} title="プロンプトをコピー">{copied ? "コピー済み" : "コピー"}</button>
                )}
              </div>
              {src && src.loading
                ? <div style={{ fontSize: 13, color: "var(--tx-3)" }}>読み込み中…</div>
                : src && src.error
                ? <div style={{ fontSize: 13, color: "#dc2626" }}>⚠️ プロンプトの読み込みに失敗しました（{src.error}）</div>
                : promptText
                ? <pre className="sa-prompt-pre">{promptText}</pre>
                : <div style={{ fontSize: 13, color: "var(--tx-3)" }}>このコマンドにはプロンプト本文がありません。</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// kind 3/4 (ruleset/reference) スキルはフロー図にせず、SKILL.md の節をカードで表示する。
// バックエンドの attach_kind が flow.kind / flow.kind_label / flow.sections を付与する。
const SKILL_KIND_JP = { ruleset: "原則・ルール集", reference: "参照・知識" };

export function SkillCard({ flow, onBack }) {
  const sections = flow.sections || [];
  const label = SKILL_KIND_JP[flow.kind_label] || flow.kind_label || "";
  return (
    <div className="skill-card-view">
      <div className="skill-card-inner">
        {onBack && <button className="skill-card-back" onClick={onBack}>← ダッシュボード</button>}
        <div className="skill-card-head">
          <h2>{flow.name}</h2>
          <span className="muted">{label} · {sections.length} 節</span>
        </div>
        <div className="skill-card-body">
          {sections.map((s, i) => (
            <section key={i} className={`skill-card-sec lvl-${s.level || 2}`}>
              {s.heading && <h3 className="skill-card-h">{s.heading}</h3>}
              {s.body && <pre className="skill-card-text">{s.body}</pre>}
            </section>
          ))}
          {sections.length === 0 && <p className="muted">（節なし）</p>}
        </div>
      </div>
    </div>
  );
}

// フロー JSON に flow.start / flow.end ノードが無ければ補う。loadFlow が必ず通す正規化。
// (プラグイン抽出時に定義が欠落していたため復元 — 呼び出しは loadFlow に 3 箇所残っていた)
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
      title: "フロー開始", subtitle: "入力とトリガー",
      meta: { capability: "flow.start" }, x: minX, y: minY - DY });
    (heads.length ? heads : nodes.slice(0, 1)).forEach(h => newEdges.push({ from: "flow-start", to: h.id }));
  }
  if (!hasEnd) {
    const outDeg = {}; nodes.forEach(n => { outDeg[n.id] = 0; });
    edges.forEach(e => { if (e.from in outDeg) outDeg[e.from]++; });
    const tails = nodes.filter(n => outDeg[n.id] === 0);
    newNodes.push({ ...base(), id: "flow-end", type: "parent",
      title: "フロー終了", subtitle: "出力物と通知先",
      meta: { capability: "flow.end" }, x: minX, y: maxY + DY });
    (tails.length ? tails : nodes.slice(-1)).forEach(t => newEdges.push({ from: t.id, to: "flow-end" }));
  }
  return { ...flow, nodes: newNodes, edges: newEdges };
}

