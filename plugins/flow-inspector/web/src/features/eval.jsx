// Eval page cluster (EvalPage/Results/Cases/Evaluators/Flows/Chat + helpers).
// Phase 3 module — extracted verbatim. Uses window.FlowDiagram/NODE_TYPES/TOOL_DESCRIPTIONS (globals).
import React, { useState, useEffect, useRef } from 'react'
import { apiFetch, apiPost } from '../lib/api.js'

export function EvalPage({ flowId, flowName, currentFlow, onBack }) {
  const [tab, setTab] = useState("flows"); // flows | results | cases | evaluators
  const [versions, setVersions] = useState([]);
  const [cases, setCases] = useState([]);
  const [evaluators, setEvaluators] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runningEval, setRunningEval] = useState(false);
  // 権限スライダー: 0=定義のみ(実行なし) / 1=🟢読み取り(推奨) / 2=🟡送信・編集(承認つき)。
  // 🔴金融/認証は常にブロックでスライダー外（到達不可）。
  const [permLevel, setPermLevel] = useState(0);
  // Phase-2 approval gate: which 🟡 blocked tool names the user ticked to allow
  // on a pass-2 re-run. Keyed by tool_name → bool (approvals apply run-wide).
  const [approvalChecks, setApprovalChecks] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatSessions, setChatSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  // 現在のフロー本体。prop で来なくても flowId から取得し、Eval比較スロットの既定に使う。
  const [liveFlow, setLiveFlow] = useState(currentFlow && Array.isArray(currentFlow.nodes) ? currentFlow : null);

  // Load data
  useEffect(() => { loadAll(); loadChatSessions(); }, [flowId]);
  useEffect(() => {
    if (window.__DEMO_MODE__ || !flowId) return;
    apiFetch(`/api/flows/${flowId}`).then(f => { if (f && Array.isArray(f.nodes)) setLiveFlow(f); }).catch(() => {});
  }, [flowId]);

  async function loadChatSessions() {
    if (window.__DEMO_MODE__) return;
    try {
      const list = await apiFetch(`/api/flows/${flowId}/eval/chat/sessions`);
      setChatSessions(Array.isArray(list) ? list : []);
    } catch (e) { /* 履歴なしは正常 */ }
  }

  const evalModeRef = useRef(null);  // 入口で選んだモード "evaluators"|"cases"|"analyze"。会話中は固定、新規で解除。
  function newChat() {
    setCurrentSessionId(null);
    setChatMessages([]);
    setChatInput("");
    setShowSessionMenu(false);
    evalModeRef.current = null;  // モードをリセット → 入口の選択ボタンに戻る
  }
  // 入口でモードを選んだら、そのモードで要件ヒアリングを開始する
  function startEvalMode(mode) {
    evalModeRef.current = mode;
    const kick = mode === "cases" ? "テストケースを作りたい。要件から相談させて。"
      : mode === "analyze" ? "評価結果を分析・相談したい。"
      : "評価軸を作りたい。要件から相談させて。";
    sendChat(kick);
  }

  async function loadSession(sessionId) {
    setShowSessionMenu(false);
    try {
      const s = await apiFetch(`/api/flows/${flowId}/eval/chat/sessions/${sessionId}`);
      setCurrentSessionId(sessionId);
      setChatMessages(s.messages || []);
    } catch (e) { alert("会話の読み込みに失敗: " + e.message); }
  }

  async function deleteSession(sessionId, e) {
    if (e) e.stopPropagation();
    if (!window.confirm("この会話を削除する？")) return;
    try {
      await fetch(API + `/api/flows/${flowId}/eval/chat/sessions/${sessionId}`, { method: "DELETE" });
      if (sessionId === currentSessionId) newChat();
      await loadChatSessions();
    } catch (e) { alert("削除に失敗: " + e.message); }
  }

  async function persistSession(messages) {
    if (window.__DEMO_MODE__ || !messages.length) return;
    let sid = currentSessionId;
    if (!sid) {
      sid = `chat_${Date.now()}`;
      setCurrentSessionId(sid);
    }
    try {
      await fetch(API + `/api/flows/${flowId}/eval/chat/sessions/${sid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      await loadChatSessions();
    } catch (e) { console.warn("会話の保存に失敗", e); }
  }

  async function loadAll() {
    // DEMO MODE: バックエンドの代わりに demo-dataset の DEMO_EVAL を使う
    if (window.__DEMO_MODE__ && window.DEMO_EVAL) {
      const D = window.DEMO_EVAL;
      setVersions(D.versions || []);
      setCases(D.cases || []);
      setEvaluators(D.evaluators || []);
      setRuns(D.runs || []);
      if ((D.versions || []).length > 0 && !selectedVersion) {
        setSelectedVersion(D.versions[D.versions.length - 1].id);
      }
      return;
    }
    // Helper to apply DEMO_EVAL data; reused on empty/error
    const applyDemoFallback = () => {
      if (!window.DEMO_EVAL) return false;
      const D = window.DEMO_EVAL;
      setVersions(D.versions || []);
      setCases(D.cases || []);
      setEvaluators(D.evaluators || []);
      setRuns(D.runs || []);
      if ((D.versions || []).length > 0 && !selectedVersion) {
        setSelectedVersion(D.versions[D.versions.length - 1].id);
      }
      return true;
    };
    try {
      const [v, c, e, r] = await Promise.all([
        apiFetch(`/api/flows/${flowId}/versions`),
        apiFetch(`/api/flows/${flowId}/eval/cases`),
        apiFetch(`/api/flows/${flowId}/eval/evaluators`),
        apiFetch(`/api/flows/${flowId}/eval/runs`),
      ]);
      // すべて空配列なら未投入とみなして demo にフォールバック
      const allEmpty = !v.length && !c.length && !e.length && !r.length;
      if (allEmpty && applyDemoFallback()) return;
      setVersions(v); setCases(c); setEvaluators(e); setRuns(r);
      if (v.length > 0 && !selectedVersion) setSelectedVersion(v[v.length - 1].id);
    } catch(err) {
      console.warn("Eval load error; falling back to DEMO_EVAL if available", err);
      applyDemoFallback();
    }
  }

  async function createVersion() {
    const label = prompt("バージョン名 (例: v1-baseline):");
    if (!label) return;
    const notes = prompt("メモ (任意):") || "";
    try {
      await apiPost(`/api/flows/${flowId}/versions`, { label, notes });
      await loadAll();
    } catch(e) { alert("Error: " + e.message); }
  }

  async function runEval(approvedTools) {
    if (!selectedVersion) return alert("バージョンを選択してください");
    if (cases.length === 0) return alert("テストケースを追加してください");
    if (evaluators.length === 0) return alert("評価器を追加してください");
    // A re-run with approved tools is always a safe real run (pass 2).
    const hasApprovals = Array.isArray(approvedTools) && approvedTools.length > 0;
    setRunningEval(true);
    try {
      const body = { version_id: selectedVersion, execute: permLevel >= 1 || hasApprovals };
      if (hasApprovals) body.approved_tools = approvedTools;
      const result = await apiPost(`/api/flows/${flowId}/eval/run`, body);
      setSelectedRun(result);
      setApprovalChecks({});  // clear ticks; the new run starts fresh
      await loadAll();
      setTab("results");
    } catch(e) { alert("Eval error: " + e.message); }
    setRunningEval(false);
  }

  async function generateCases() {
    try {
      const res = await apiPost(`/api/flows/${flowId}/eval/cases/generate`, {});
      if (res.ok) {
        await loadAll();
        alert(`${res.generated.length} テストケースを生成しました`);
      } else {
        alert("生成失敗: " + (res.error || ""));
      }
    } catch(e) { alert("Error: " + e.message); }
  }

  async function sendChat(text) {
    if (!text.trim()) return;
    const newMsgs = [...chatMessages, { role: "user", content: text }];
    setChatMessages(newMsgs);
    setChatInput("");
    setChatStreaming(true);
    try {
      const res = await fetch(API + `/api/flows/${flowId}/eval/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs.filter(m => m.role === "user" || m.role === "assistant"), flow_id: flowId, mode: evalModeRef.current || null }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try { fullText += JSON.parse(line.slice(6)).text; } catch(e) {}
          }
        }
        setChatMessages([...newMsgs, { role: "assistant", content: fullText }]);
      }
      // 会話を永続化 (履歴から選び直せるように)
      await persistSession([...newMsgs, { role: "assistant", content: fullText }]);
    } catch(e) { console.error("Chat error", e); }
    setChatStreaming(false);
  }

  // Eval Chat が出した ```evaluators ブロックを抽出
  function parseEvaluatorsBlock(text) {
    const m = (text || "").match(/```evaluators\s*\n([\s\S]*?)\n```/);
    if (!m) return null;
    try { const arr = JSON.parse(m[1]); return Array.isArray(arr) ? arr.filter(e => e && e.name && (e.prompt || e.code)) : null; }
    catch (e) { return null; }
  }
  // 提案された評価軸を「評価軸」タブに一括登録
  async function addEvaluatorsFromChat(list) {
    if (!Array.isArray(list) || !list.length) return;
    for (const e of list) {
      try {
        await fetch(API + `/api/flows/${flowId}/eval/evaluators`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: e.name, type: e.type === "code" ? "code" : "llm", prompt: e.prompt || "", code: e.code || null }),
        });
      } catch (err) { console.error("add evaluator failed", err); }
    }
    await loadAll();
    setTab("evaluators");
  }

  // Eval Chat が出した ```cases ブロックを抽出
  function parseCasesBlock(text) {
    const m = (text || "").match(/```cases\s*\n([\s\S]*?)\n```/);
    if (!m) return null;
    try { const arr = JSON.parse(m[1]); return Array.isArray(arr) ? arr.filter(c => c && c.title && c.input_text) : null; }
    catch (e) { return null; }
  }
  // 提案されたテストケースを「テストケース」タブに一括登録
  async function addCasesFromChat(list) {
    if (!Array.isArray(list) || !list.length) return;
    for (const c of list) {
      try {
        await fetch(API + `/api/flows/${flowId}/eval/cases`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: c.title, input_text: c.input_text || "", expected: c.expected || "", tags: ["from-chat"] }),
        });
      } catch (err) { console.error("add case failed", err); }
    }
    await loadAll();
    setTab("cases");
  }

  // ── 分析モードの「適用」系：既存の評価軸/ケースを修正、フロー本体はコピペ用プロンプト ──
  function parseEvaluatorEditsBlock(text) {
    const m = (text || "").match(/```evaluator_edits\s*\n([\s\S]*?)\n```/);
    if (!m) return null;
    try { const arr = JSON.parse(m[1]); return Array.isArray(arr) ? arr.filter(e => e && e.id && (e.prompt || e.code || e.name)) : null; }
    catch (e) { return null; }
  }
  async function applyEvaluatorEdits(list) {
    if (!Array.isArray(list) || !list.length) return;
    for (const edit of list) {
      const cur = evaluators.find(e => e.id === edit.id);
      if (!cur) { console.warn("evaluator not found:", edit.id); continue; }
      const merged = { name: edit.name ?? cur.name, type: edit.type ?? cur.type ?? "llm",
        prompt: edit.prompt ?? cur.prompt ?? "", code: edit.code ?? cur.code ?? null };
      try {
        await fetch(API + `/api/flows/${flowId}/eval/evaluators/${edit.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(merged),
        });
      } catch (err) { console.error("update evaluator failed", err); }
    }
    await loadAll();
    setTab("evaluators");
  }
  function parseCaseEditsBlock(text) {
    const m = (text || "").match(/```case_edits\s*\n([\s\S]*?)\n```/);
    if (!m) return null;
    try { const arr = JSON.parse(m[1]); return Array.isArray(arr) ? arr.filter(c => c && c.id && (c.input_text || c.expected || c.title)) : null; }
    catch (e) { return null; }
  }
  async function applyCaseEdits(list) {
    if (!Array.isArray(list) || !list.length) return;
    for (const edit of list) {
      const cur = cases.find(c => c.id === edit.id);
      if (!cur) { console.warn("case not found:", edit.id); continue; }
      const merged = { title: edit.title ?? cur.title, input_text: edit.input_text ?? cur.input_text ?? "",
        input_doc: edit.input_doc ?? cur.input_doc ?? null, expected: edit.expected ?? cur.expected ?? "", tags: cur.tags || [] };
      try {
        await fetch(API + `/api/flows/${flowId}/eval/cases/${edit.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(merged),
        });
      } catch (err) { console.error("update case failed", err); }
    }
    await loadAll();
    setTab("cases");
  }
  function parseEvalEditPrompt(text) {
    const m = (text || "").match(/```edit_prompt\s*\n([\s\S]*?)\n```/);
    return m ? m[1].trim() : null;
  }

  // Get latest run for display
  // 直近の実行（新しい順）。サイドバーに数件積んで推移を見せる。
  const recentRunsForVersion = selectedVersion
    ? runs.filter(r => r.version_id === selectedVersion).slice(-5).reverse()
    : [];
  function openRun(run) { setSelectedRun(run); setTab("results"); }

  return (
    <div className="eval-page">
      <div className="eval-sidebar">
        <div className="eval-sidebar-topbar">
          <button className="eval-back" onClick={onBack}>← 戻る</button>
          <span className="eval-badge">⚖<span>Eval</span></span>
        </div>
        <div className="eval-sidebar-flowname">{flowName}</div>

        <div className="ev-section">
          <div className="ev-section-head">バージョン</div>
          <div className="ev-version-list">
            {versions.map(v => (
              <div key={v.id} className={`ev-version ${selectedVersion === v.id ? "is-active" : ""}`} onClick={() => setSelectedVersion(v.id)}>
                <span className="ev-v-label">{v.id}</span>
                <span className="ev-v-name">{v.label}</span>
                {v.latest_eval ? (
                  <span className="ev-v-badge">
                    <span className="ev-v-pass">✓{v.latest_eval.passed}</span>
                    {v.latest_eval.failed > 0 && <span className="ev-v-fail">✗{v.latest_eval.failed}</span>}
                  </span>
                ) : <span className="ev-v-badge ev-v-neutral">—</span>}
              </div>
            ))}
          </div>
          <button className="ev-btn" onClick={createVersion} style={{ marginTop: "6px" }}>+ 現在のフローを保存</button>
        </div>

        <div className="ev-section">
          <div className="ev-section-head">概要</div>
          <div style={{ fontSize: "12px", color: "var(--tx-2)", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div>テストケース: <b>{cases.length}</b></div>
            <div>評価器: <b>{evaluators.length}</b></div>
            <div>実行回数: <b>{runs.length}</b></div>
          </div>
          {selectedVersion && (
            <>
              <div className="perm-slider">
                <div className="perm-slider-cap">権限レベル — どこまで実行する？</div>
                <div className="perm-slider-track">
                  {[
                    { lv: 0, label: "定義のみ", sub: "実行なし" },
                    { lv: 1, label: "🟢 読み取り", sub: "推奨" },
                    { lv: 2, label: "🟡 送信・編集", sub: "承認つき" },
                  ].map(opt => (
                    <button key={opt.lv} type="button"
                      className={`perm-seg perm-seg-${opt.lv} ${permLevel === opt.lv ? "is-active" : ""}`}
                      onClick={() => setPermLevel(opt.lv)}>
                      <span className="perm-seg-label">{opt.label}</span>
                      <span className="perm-seg-sub">{opt.sub}</span>
                    </button>
                  ))}
                  <div className="perm-seg perm-seg-locked" title="金融・認証・権限変更などは安全のため常にブロック。スライダーでは緩められません。">
                    <span className="perm-seg-label">🔴</span>
                    <span className="perm-seg-sub">常に不可🔒</span>
                  </div>
                </div>
                <div className="perm-slider-help">
                  {permLevel === 0 && "実行せず、フロー定義から採点します（従来のEval）。"}
                  {permLevel === 1 && "🟢検索/取得だけ実行して実出力を採点。🟡送信/編集・🔴は自動ブロック。実データに触れます。"}
                  {permLevel === 2 && "🟢に加え、🟡送信/編集は実行履歴で1件ずつ承認して再実行できます。🔴金融/認証は常にブロック。"}
                </div>
              </div>
              <button className="ev-run-btn" onClick={() => runEval()} disabled={runningEval || cases.length === 0 || evaluators.length === 0}>
                {runningEval
                  ? (permLevel >= 1 ? "⏳ 実走中…" : "⏳ 実行中…")
                  : (permLevel === 0 ? "▶ Eval実行" : permLevel === 1 ? "▶ 安全実走（読み取り）" : "▶ 安全実走（🟡は承認）")}
              </button>
            </>
          )}
        </div>

        {recentRunsForVersion.length > 0 && (
          <div className="ev-section">
            <div className="ev-section-head">直近の実行</div>
            {recentRunsForVersion.map((run, i) => {
              const t = run.timestamp ? new Date(run.timestamp) : null;
              const tlabel = t ? `${String(t.getMonth()+1).padStart(2,"0")}/${String(t.getDate()).padStart(2,"0")} ${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}` : "";
              return (
                <button key={run.id || i} className="ev-recent-run" onClick={() => openRun(run)} title="この実行の詳細を見る">
                  <div className="ev-recent-top">
                    <span className="ev-recent-time">{i === 0 ? "最新" : tlabel}{run.executed ? " 🟢実走" : ""}</span>
                    <span className="ev-recent-count">
                      <span className="ev-v-pass">{run.passed}</span>
                      {run.failed > 0 && <> · <span className="ev-v-fail">{run.failed}</span></>}
                      <span style={{ color: "var(--tx-4)" }}> / {run.total} ケース</span>
                    </span>
                  </div>
                  <div className="ev-score-bar">
                    <div className="ev-score-pass" style={{ width: `${run.total ? (run.passed / run.total) * 100 : 0}%` }} />
                    <div className="ev-score-fail" style={{ width: `${run.total ? (run.failed / run.total) * 100 : 0}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="eval-main">
        <div className="eval-header">
          <h2>⚖ {flowName} — Eval</h2>
          {selectedVersion && <span className="eval-header-ver">v{selectedVersion}</span>}
        </div>
        <div className="eval-tabs">
          {[
            { id: "flows", label: "フロー図" },
            { id: "results", label: "実行履歴" },
            { id: "cases", label: "テストケース" },
            { id: "evaluators", label: "評価軸" },
          ].map(t => (
            <button key={t.id} className={`eval-tab ${tab === t.id ? "is-active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {tab === "flows" && <EvalFlows versions={versions} runs={runs} flowId={flowId} currentFlow={liveFlow || currentFlow} />}
        {tab === "results" && <EvalResults runs={runs} versions={versions} selectedVersion={selectedVersion} selectedRun={selectedRun} setSelectedRun={setSelectedRun} flowId={flowId} approvalChecks={approvalChecks} setApprovalChecks={setApprovalChecks} runEval={runEval} runningEval={runningEval} canApprove={permLevel === 2} />}
        {tab === "cases" && <EvalCases cases={cases} flowId={flowId} onReload={loadAll} onGenerate={generateCases} />}
        {tab === "evaluators" && <EvalEvaluators evaluators={evaluators} flowId={flowId} onReload={loadAll} />}
      </div>

      <div className="eval-chat-panel">
        <div className="eval-chat-head">
          <span className="eval-chat-title"><span>💬</span> Eval Chat</span>
          <div className="eval-chat-head-actions">
            <div className="eval-chat-history-wrap">
              <button
                className="eval-chat-iconbtn"
                onClick={() => setShowSessionMenu(v => !v)}
                title="過去の会話を開く"
                disabled={chatSessions.length === 0}
              >🕘 履歴 {chatSessions.length > 0 && <span className="eval-chat-count">{chatSessions.length}</span>}</button>
              {showSessionMenu && (
                <div className="eval-chat-history-menu">
                  {chatSessions.length === 0 && (
                    <div className="eval-chat-history-empty">保存された会話はありません</div>
                  )}
                  {chatSessions.map(s => (
                    <div
                      key={s.id}
                      className={`eval-chat-history-item ${s.id === currentSessionId ? "is-active" : ""}`}
                      onClick={() => loadSession(s.id)}
                    >
                      <div className="eval-chat-history-info">
                        <div className="eval-chat-history-title">{s.title || "(無題)"}</div>
                        <div className="eval-chat-history-meta">{s.message_count} 件</div>
                      </div>
                      <button
                        className="eval-chat-history-del"
                        onClick={(e) => deleteSession(s.id, e)}
                        title="この会話を削除"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              className="eval-chat-iconbtn primary"
              onClick={newChat}
              title="新しいチャットを始める"
            >＋ 新規</button>
          </div>
        </div>
        <EvalChat messages={chatMessages} input={chatInput} setInput={setChatInput} onSend={sendChat} streaming={chatStreaming} parseEvaluators={parseEvaluatorsBlock} onAddEvaluators={addEvaluatorsFromChat} parseCases={parseCasesBlock} onAddCases={addCasesFromChat} onStartMode={startEvalMode} parseEvaluatorEdits={parseEvaluatorEditsBlock} onApplyEvaluatorEdits={applyEvaluatorEdits} parseCaseEdits={parseCaseEditsBlock} onApplyCaseEdits={applyCaseEdits} parseEditPrompt={parseEvalEditPrompt} />
      </div>
    </div>
  );
}

// Compact one-line summary of a blocked op's tool_input for the approval UI,
// e.g. {to,subject,body} → "to=a@b.com, subject=件名, body=本文…". Module-level so
// both EvalPage and EvalResults can use it. Safe on null/non-objects.
function summarizeToolInput(input) {
  if (!input || typeof input !== "object") return input ? String(input).slice(0, 120) : "";
  const parts = [];
  for (const [k, v] of Object.entries(input)) {
    let s = (v === null || v === undefined) ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
    s = s.replace(/\s+/g, " ").trim();
    if (s.length > 60) s = s.slice(0, 60) + "…";
    parts.push(`${k}=${s}`);
    if (parts.length >= 4) break;
  }
  return parts.join(", ");
}

export function EvalResults({ runs, versions, selectedVersion, selectedRun, setSelectedRun, flowId, approvalChecks, setApprovalChecks, runEval, runningEval, canApprove }) {
  // 各 run のトグル状態 (runId → bool)。デフォルトは全て閉じる
  const sortedRuns = runs.slice().reverse();
  const [expandedRuns, setExpandedRuns] = useState({});
  const [expandedCases, setExpandedCases] = useState({}); // `${runId}:${caseIdx}` → bool
  const [loadingDetail, setLoadingDetail] = useState({});  // runId → bool (バックエンド連携時用)
  const [runDetails, setRunDetails] = useState({});  // runId → detail with results
  const [compareData, setCompareData] = useState(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  useEffect(() => {
    if (runs.length <= 1) { setCompareData(null); return; }
    setLoadingCompare(true);
    apiFetch(`/api/flows/${flowId}/eval/compare`)
      .then(d => setCompareData(d))
      .catch(() => setCompareData(null))
      .finally(() => setLoadingCompare(false));
  }, [runs.length, flowId]);

  // demo mode では results が既に入っているので、そのまま使う
  function getRunWithResults(r) {
    if (r.results) return r;
    return runDetails[r.id] || null;
  }

  function toggleRun(r) {
    const isOpen = !!expandedRuns[r.id];
    setExpandedRuns(prev => ({ ...prev, [r.id]: !isOpen }));
    // 詳細が未取得かつバックエンドモードならフェッチ
    if (!isOpen && !r.results && !runDetails[r.id] && !loadingDetail[r.id]) {
      setLoadingDetail(prev => ({ ...prev, [r.id]: true }));
      apiFetch(`/api/flows/${flowId}/eval/runs/${r.id}`)
        .then(detail => setRunDetails(prev => ({ ...prev, [r.id]: detail })))
        .catch(e => console.warn("failed to load run detail", e))
        .finally(() => setLoadingDetail(prev => ({ ...prev, [r.id]: false })));
    }
  }
  function toggleCase(runId, caseIdx) {
    const key = `${runId}:${caseIdx}`;
    setExpandedCases(prev => ({ ...prev, [key]: !prev[key] }));
  }

  if (sortedRuns.length === 0) {
    return (
      <div className="eval-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-4)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "32px", opacity: 0.3, marginBottom: "8px" }}>📊</div>
          <div>まだEval結果がありません</div>
          <div style={{ fontSize: "12px", marginTop: "4px" }}>バージョンを保存してEvalを実行してください</div>
        </div>
      </div>
    );
  }

  return (
    <div className="eval-content">
      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "12px" }}>実行履歴 ({sortedRuns.length})</div>
      {sortedRuns.map(r => {
        const isOpen = !!expandedRuns[r.id];
        const detail = getRunWithResults(r);
        const isLoading = !!loadingDetail[r.id];
        return (
          <div key={r.id} className={`ev-run-card ${isOpen ? "is-open" : ""}`}>
            <button className="ev-run-summary" onClick={() => toggleRun(r)}>
              <span className="ev-run-chev">{isOpen ? "▼" : "▶"}</span>
              <span className="ev-run-label">{r.version_label}</span>
              <span className="ev-run-meta">{r.timestamp?.slice(0, 16).replace("T", " ")}</span>
              <span className="ev-run-counts">
                <span className="ev-v-pass">✓ {r.passed}</span>
                {r.failed > 0 && <span className="ev-v-fail">✗ {r.failed}</span>}
                <span style={{ color: "var(--tx-4)", fontSize: "12px" }}>/ {r.total}</span>
                <span className="ev-run-rate">{Math.round((r.passed / r.total) * 100)}%</span>
              </span>
            </button>
            <div className="ev-run-bar">
              <div className="ev-score-pass" style={{ width: `${(r.passed / r.total) * 100}%` }} />
              <div className="ev-score-fail" style={{ width: `${(r.failed / r.total) * 100}%` }} />
            </div>
            {isOpen && (
              <div className="ev-run-body">
                {isLoading && <div style={{ padding: 16, textAlign: "center", color: "var(--tx-4)" }}>⏳ 詳細を取得中…</div>}
                {!isLoading && !detail && <div style={{ padding: 16, textAlign: "center", color: "var(--tx-4)" }}>詳細が取得できませんでした</div>}
                {!isLoading && detail && (
                  <div className="ev-results">
                    {(detail.results || []).map((res, idx) => {
                      const caseKey = `${r.id}:${idx}`;
                      const caseOpen = !!expandedCases[caseKey];
                      const failedEvals = (res.evaluator_results || []).filter(e => e.verdict !== "pass").length;
                      return (
                        <div key={idx} className="ev-result-row">
                          <button className="ev-result-summary" onClick={() => toggleCase(r.id, idx)}>
                            <div className={`ev-verdict ${res.pass ? "pass" : "fail"}`}>{res.pass ? "✓" : "✗"}</div>
                            <span className="ev-result-title">{res.case_title}</span>
                            {!res.pass && failedEvals > 0 && (
                              <span className="ev-result-failbadge">{failedEvals} 項目 fail</span>
                            )}
                            <span className="ev-result-chev">{caseOpen ? "▲" : "▼"}</span>
                          </button>
                          {caseOpen && (
                            <div className="ev-result-detail">
                              {res.executed && (
                                <div className="ev-evaluator-result" style={{ borderLeft: "2px solid var(--c-mcp, #4a9)" }}>
                                  <div className="ev-evaluator-name">🟢 安全実走の実出力</div>
                                  <div className="ev-detail-section">
                                    <div className="ev-detail-prompt" style={{ whiteSpace: "pre-wrap" }}>{res.actual_output || "(出力なし)"}</div>
                                  </div>
                                  {(() => {
                                    // Phase-2 approval gate. Prefer the split the backend sends
                                    // (pending_approvals=🟡 / forbidden_ops=🔴); fall back to
                                    // deriving them from blocked_ops for older runs.
                                    const blocked = res.blocked_ops || [];
                                    const pending = res.pending_approvals || blocked.filter(b => b.level === "yellow");
                                    const forbidden = res.forbidden_ops || blocked.filter(b => b.level === "red");
                                    if (pending.length === 0 && forbidden.length === 0) return null;
                                    return (
                                      <div className="ev-detail-section">
                                        {pending.length > 0 && (canApprove ? (
                                          <>
                                            <div className="ev-detail-label">🟡 承認を求める操作（{pending.length}）— チェックして再実行すると実際に行います</div>
                                            {pending.map((b, bi) => (
                                              <label key={bi} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "11px", color: "var(--tx-2)", margin: "4px 0", cursor: "pointer" }}>
                                                <input type="checkbox" style={{ marginTop: 2 }}
                                                  checked={!!approvalChecks[b.tool_name]}
                                                  onChange={e => setApprovalChecks(prev => ({ ...prev, [b.tool_name]: e.target.checked }))} />
                                                <span>
                                                  <b style={{ color: "var(--tx-1)" }}>{b.tool_name}</b>
                                                  {summarizeToolInput(b.tool_input) && (
                                                    <span style={{ color: "var(--tx-3)" }}> — {summarizeToolInput(b.tool_input)}</span>
                                                  )}
                                                </span>
                                              </label>
                                            ))}
                                          </>
                                        ) : (
                                          <>
                                            <div className="ev-detail-label">🟡 ブロックした送信・編集（{pending.length}）— 承認するには権限レベルを「🟡 送信・編集」にして再実行</div>
                                            {pending.map((b, bi) => (
                                              <div key={bi} style={{ fontSize: "11px", color: "var(--tx-3)", margin: "4px 0" }}>
                                                ⛔ <b style={{ color: "var(--tx-2)" }}>{b.tool_name}</b>
                                                {summarizeToolInput(b.tool_input) && <span> — {summarizeToolInput(b.tool_input)}</span>}
                                              </div>
                                            ))}
                                          </>
                                        ))}
                                        {forbidden.length > 0 && (
                                          <div style={{ marginTop: pending.length > 0 ? 8 : 0 }}>
                                            <div className="ev-detail-label">🔴 実行不可（手動のみ）</div>
                                            {forbidden.map((b, bi) => (
                                              <div key={bi} style={{ fontSize: "11px", color: "var(--tx-3)" }}>
                                                ⛔ <b style={{ color: "var(--tx-2)" }}>{b.tool_name}</b>
                                                {summarizeToolInput(b.tool_input) && <span> — {summarizeToolInput(b.tool_input)}</span>}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                              {(res.evaluator_results || []).map((er, eri) => (
                                <div key={eri} className="ev-evaluator-result">
                                  <div className="ev-evaluator-name">{er.evaluator_name} <span style={{ color: "var(--tx-4)", fontWeight: 400 }}>({er.type})</span></div>
                                  <div className="ev-evaluator-verdict">
                                    <span className={`ev-verdict ${er.verdict === "pass" ? "pass" : "fail"}`} style={{ width: 18, height: 18, fontSize: 10 }}>{er.verdict === "pass" ? "✓" : "✗"}</span>
                                    <span>{er.reason}</span>
                                  </div>
                                  {er.prompt_used && (
                                    <div className="ev-detail-section">
                                      <div className="ev-detail-label">評価プロンプト</div>
                                      <div className="ev-detail-prompt">{er.prompt_used}</div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {(() => {
                      // Run-wide re-run: gather every 🟡 pending tool name across
                      // this run's cases; let the user re-run with the ticked ones
                      // added to the allowlist so they ACTUALLY execute (pass 2).
                      if (!canApprove) return null;  // 承認＆再実行は権限レベル🟡のときだけ
                      const allPending = (detail.results || []).flatMap(rr =>
                        (rr.pending_approvals || (rr.blocked_ops || []).filter(b => b.level === "yellow")));
                      const pendingNames = [...new Set(allPending.map(b => b.tool_name))];
                      if (pendingNames.length === 0) return null;
                      const checkedNames = pendingNames.filter(n => approvalChecks[n]);
                      return (
                        <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--bd-2)", borderRadius: 8, background: "var(--bg-2)" }}>
                          <div style={{ fontSize: "11px", color: "var(--tx-3)", marginBottom: 8 }}>
                            🟡 の操作はデフォルトでブロックされています。許可する操作をチェックして再実行すると、その操作だけ実際に実行して採点し直します（🔴は再実行しても実行されません）。
                          </div>
                          <button className="ev-run-btn"
                            disabled={runningEval || checkedNames.length === 0}
                            onClick={() => runEval(checkedNames)}>
                            {runningEval ? "⏳ 再実行中…" : `選んだ操作を許可して再実行（${checkedNames.length}）`}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Comparison table */}
      {runs.length > 1 && (
        <>
          <div style={{ fontSize: "13px", fontWeight: 600, marginTop: "24px", marginBottom: "12px" }}>バージョン比較</div>
          <table className="ev-compare">
            <thead><tr><th>バージョン</th><th>PASS</th><th>FAIL</th><th>合格率</th><th>日時</th></tr></thead>
            <tbody>
              {sortedRuns.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.version_label}</td>
                  <td className="ev-compare-pass">{r.passed}</td>
                  <td className={r.failed > 0 ? "ev-compare-fail" : ""}>{r.failed}</td>
                  <td style={{ fontWeight: 600 }}>{Math.round((r.passed / r.total) * 100)}%</td>
                  <td style={{ color: "var(--tx-4)", fontSize: "11px" }}>{r.timestamp?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Per-case comparison matrix */}
          {loadingCompare && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--tx-4)" }}>⏳ ケース別データを取得中…</div>
          )}
          {!loadingCompare && compareData && compareData.cases.length > 0 && (
            <>
              <div style={{ fontSize: "12px", fontWeight: 600, marginTop: "16px", marginBottom: "8px", color: "var(--tx-3)" }}>ケース別</div>
              <table className="ev-compare">
                <thead>
                  <tr>
                    <th style={{ minWidth: 140 }}>ケース</th>
                    {compareData.versions.filter(v => v.run_id).map(v => (
                      <th key={v.id} style={{ textAlign: "center" }}>
                        {v.label || v.id}
                        <div style={{ fontWeight: 400, fontSize: "10px", color: "var(--tx-4)", marginTop: 2 }}>
                          {v.passed != null ? `${Math.round((v.passed / v.total) * 100)}%` : "—"}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compareData.cases.map(c => {
                    const versionsWithRuns = compareData.versions.filter(v => v.run_id);
                    const hasRegression = versionsWithRuns.length >= 2 &&
                      versionsWithRuns.some((v, i) => {
                        if (i === 0) return false;
                        const prev = c.results[versionsWithRuns[i - 1].id];
                        const cur = c.results[v.id];
                        return prev?.pass && cur && !cur.pass;
                      });
                    const hasImprovement = versionsWithRuns.length >= 2 &&
                      versionsWithRuns.some((v, i) => {
                        if (i === 0) return false;
                        const prev = c.results[versionsWithRuns[i - 1].id];
                        const cur = c.results[v.id];
                        return !prev?.pass && cur?.pass;
                      });
                    return (
                      <tr key={c.title} style={hasRegression ? { background: "#fef2f2" } : hasImprovement ? { background: "#f0fdf4" } : {}}>
                        <td style={{ fontSize: "12px" }}>
                          {hasRegression && <span title="退行" style={{ marginRight: 4 }}>⚠️</span>}
                          {hasImprovement && <span title="改善" style={{ marginRight: 4 }}>✨</span>}
                          {c.title}
                        </td>
                        {versionsWithRuns.map(v => {
                          const res = c.results[v.id];
                          if (!res) return <td key={v.id} style={{ textAlign: "center", color: "var(--tx-4)" }}>—</td>;
                          return (
                            <td key={v.id} style={{ textAlign: "center" }}
                              className={res.pass ? "ev-compare-pass" : "ev-compare-fail"}>
                              {res.pass ? "✓" : "✗"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function EvalCases({ cases, flowId, onReload, onGenerate }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", input_text: "", expected: "" });
  const [generating, setGenerating] = useState(false);

  async function addCase() {
    if (!form.title || !form.input_text) return;
    try {
      await apiPost(`/api/flows/${flowId}/eval/cases`, form);
      setForm({ title: "", input_text: "", expected: "" });
      setAdding(false);
      onReload();
    } catch(e) { alert("Error: " + e.message); }
  }

  async function deleteCase(id) {
    try {
      await fetch(API + `/api/flows/${flowId}/eval/cases/${id}`, { method: "DELETE" });
      onReload();
    } catch(e) { alert("Error: " + e.message); }
  }

  async function handleGenerate() {
    setGenerating(true);
    await onGenerate();
    setGenerating(false);
  }

  return (
    <div className="eval-content">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>テストケース ({cases.length})</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button className="ev-card-btn" onClick={handleGenerate} disabled={generating}>{generating ? "⏳ 生成中…" : "✨ AI生成"}</button>
          <button className="ev-card-btn" onClick={() => setAdding(true)}>+ 手動追加</button>
        </div>
      </div>

      {adding && (
        <div className="ev-add-form">
          <input placeholder="テスト名" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <textarea placeholder="入力テキスト（テストの入力データ）" value={form.input_text} onChange={e => setForm({ ...form, input_text: e.target.value })} />
          <textarea placeholder="期待される結果（任意）" value={form.expected} onChange={e => setForm({ ...form, expected: e.target.value })} />
          <div className="ev-form-row">
            <button className="ev-form-save" onClick={addCase}>追加</button>
            <button className="ev-form-cancel" onClick={() => setAdding(false)}>キャンセル</button>
          </div>
        </div>
      )}

      {cases.map(c => (
        <div key={c.id} className="ev-card">
          <div className="ev-card-head">
            <span className="ev-card-title">{c.title}</span>
            {c.tags?.includes("auto-generated") && <span className="ev-card-type llm">AI生成</span>}
          </div>
          <div className="ev-card-body">
            <div><strong>入力:</strong> {c.input_text?.slice(0, 120)}{c.input_text?.length > 120 ? "…" : ""}</div>
            {c.expected && <div style={{ marginTop: "4px" }}><strong>期待:</strong> {c.expected?.slice(0, 120)}</div>}
          </div>
          <div className="ev-card-actions">
            <button className="ev-card-btn danger" onClick={() => deleteCase(c.id)}>削除</button>
          </div>
        </div>
      ))}

      {cases.length === 0 && !adding && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--tx-4)" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>📝</div>
          <div>テストケースがありません</div>
          <div style={{ fontSize: "12px", marginTop: "4px" }}>手動で追加するか、AIに自動生成させてください</div>
        </div>
      )}
    </div>
  );
}

export function EvalEvaluators({ evaluators, flowId, onReload }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", type: "llm", prompt: "", code: "" });
  const [generating, setGenerating] = useState(false);
  const [showGenForm, setShowGenForm] = useState(false);
  const [focusText, setFocusText] = useState("");

  async function addEvaluator() {
    if (!form.name) return;
    const body = { name: form.name, type: form.type };
    if (form.type === "llm") body.prompt = form.prompt;
    else body.code = form.code;
    try {
      await apiPost(`/api/flows/${flowId}/eval/evaluators`, body);
      setForm({ name: "", type: "llm", prompt: "", code: "" });
      setAdding(false);
      onReload();
    } catch(e) { alert("Error: " + e.message); }
  }

  async function deleteEvaluator(id) {
    try {
      await fetch(API + `/api/flows/${flowId}/eval/evaluators/${id}`, { method: "DELETE" });
      onReload();
    } catch(e) { alert("Error: " + e.message); }
  }

  async function generateEvaluators() {
    if (!focusText.trim()) return;
    setGenerating(true);
    try {
      const res = await apiPost(`/api/flows/${flowId}/eval/evaluators/generate`, { focus: focusText });
      if (res.ok) {
        await onReload();
        setShowGenForm(false);
        setFocusText("");
      } else {
        alert("生成失敗: " + (res.error || "不明なエラー"));
      }
    } catch(e) { alert("Error: " + e.message); }
    setGenerating(false);
  }

  return (
    <div className="eval-content">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>評価器 ({evaluators.length})</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button className="ev-card-btn" style={{ background: "var(--accent)", color: "#fff", border: "none" }}
            onClick={() => { setShowGenForm(v => !v); setAdding(false); }}>✨ AI で生成</button>
          <button className="ev-card-btn" onClick={() => { setAdding(true); setShowGenForm(false); }}>+ 手動追加</button>
        </div>
      </div>

      {showGenForm && (
        <div className="ev-add-form" style={{ background: "var(--accent-bg, #eff6ff)", borderColor: "var(--accent)" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent)", marginBottom: "6px" }}>✨ 評価軸を AI に生成させる</div>
          <textarea
            placeholder={"気をつけたい観点を自由に書いてください。\n例: 文体が丁寧語に統一されているか、固有名詞の誤記がないか、記事の6ブロック構造に沿っているか"}
            value={focusText}
            onChange={e => setFocusText(e.target.value)}
            style={{ minHeight: "96px" }}
          />
          <div className="ev-form-row">
            <button className="ev-form-save" onClick={generateEvaluators} disabled={generating || !focusText.trim()}
              style={{ background: "var(--accent)" }}>
              {generating ? "⏳ 生成中…" : "生成する"}
            </button>
            <button className="ev-form-cancel" onClick={() => { setShowGenForm(false); setFocusText(""); }}>キャンセル</button>
          </div>
        </div>
      )}

      {adding && (
        <div className="ev-add-form">
          <input placeholder="評価器の名前" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="llm">LLM判定</option>
            <option value="code">コード判定</option>
          </select>
          {form.type === "llm" ? (
            <textarea placeholder="評価プロンプト（例: 出力が日本語で自然な文章であること。投稿として適切なトーンであること。）" value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} style={{ minHeight: "80px" }} />
          ) : (
            <textarea placeholder="Python評価コード（verdict = 'pass' or 'fail', reason = '...'）" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} style={{ minHeight: "80px", fontFamily: "'Geist Mono', monospace" }} />
          )}
          <div className="ev-form-row">
            <button className="ev-form-save" onClick={addEvaluator}>追加</button>
            <button className="ev-form-cancel" onClick={() => setAdding(false)}>キャンセル</button>
          </div>
        </div>
      )}

      {evaluators.map(ev => (
        <div key={ev.id} className="ev-card">
          <div className="ev-card-head">
            <span className="ev-card-title">{ev.name}</span>
            <span className={`ev-card-type ${ev.type}`}>{ev.type === "llm" ? "LLM" : "CODE"}</span>
          </div>
          <div className="ev-card-body">
            {ev.type === "llm" && ev.prompt && <div className="ev-detail-prompt" style={{ marginTop: "4px" }}>{ev.prompt}</div>}
            {ev.type === "code" && ev.code && <div className="ev-detail-prompt" style={{ marginTop: "4px" }}>{ev.code}</div>}
          </div>
          <div className="ev-card-actions">
            <button className="ev-card-btn danger" onClick={() => deleteEvaluator(ev.id)}>削除</button>
          </div>
        </div>
      ))}

      {evaluators.length === 0 && !adding && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--tx-4)" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>⚖️</div>
          <div>評価器がありません</div>
          <div style={{ fontSize: "12px", marginTop: "4px" }}>LLM判定（プロンプトでPass/Fail判定）またはコード判定を追加してください</div>
        </div>
      )}
    </div>
  );
}

export function EvalFlowPane({ workflow, label, badge, onSelectNode, selectedNode }) {
  if (!workflow || !workflow.nodes) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--tx-4)", fontSize: "13px" }}>バージョンを選択</div>;
  return <window.FlowDiagram workflow={workflow} selected={selectedNode} onSelect={onSelectNode} autoFit />;
}

const EVAL_CURRENT_ID = "__current__";   // 「現在のフロー（未保存）」を表す合成バージョンID
export function EvalFlows({ versions, runs, flowId, currentFlow }) {
  // 現在メインに映っているフローを、比較スロットの選択肢／既定値として使えるようにする。
  const hasCurrent = !!(currentFlow && Array.isArray(currentFlow.nodes));
  const allVersions = hasCurrent
    ? [{ id: EVAL_CURRENT_ID, label: "現在のフロー（未保存）" }, ...versions]
    : versions;
  // 既定: 保存バージョンがあればそれ、無ければ「現在のフロー」を両スロットに入れる。
  const defLeft = versions.length >= 1 ? versions[0].id : (hasCurrent ? EVAL_CURRENT_ID : null);
  const defRight = versions.length >= 2 ? versions[1].id
    : versions.length >= 1 ? versions[0].id
    : (hasCurrent ? EVAL_CURRENT_ID : null);
  const [leftVersion, setLeftVersion] = useState(defLeft);
  const [rightVersion, setRightVersion] = useState(defRight);
  const [snapshots, setSnapshots] = useState(hasCurrent ? { [EVAL_CURRENT_ID]: currentFlow } : {});
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedSide, setSelectedSide] = useState(null); // "left" | "right"

  // 現在のフローのスナップショットを最新に保つ（合成バージョン用）
  useEffect(() => {
    if (hasCurrent) setSnapshots(prev => ({ ...prev, [EVAL_CURRENT_ID]: currentFlow }));
  }, [currentFlow]);

  useEffect(() => {
    // currentFlow が後から(fetch完了で)入る場合も既定を適用できるよう hasCurrent も依存に入れる
    if (!leftVersion) setLeftVersion(versions[0]?.id || (hasCurrent ? EVAL_CURRENT_ID : null));
    if (!rightVersion) setRightVersion(versions[1]?.id || versions[0]?.id || (hasCurrent ? EVAL_CURRENT_ID : null));
  }, [versions, hasCurrent]);

  // Fetch snapshots for selected versions
  useEffect(() => {
    async function fetchSnap(vid) {
      if (!vid || vid === EVAL_CURRENT_ID || snapshots[vid]) return;  // 現在のフローは既に snapshots にある
      // DEMO MODE: バックエンドの代わりに DEMO_EVAL の snapshot を使う
      if (window.__DEMO_MODE__ && window.DEMO_EVAL) {
        const v = window.DEMO_EVAL.versions.find(x => x.id === vid);
        if (v && v.snapshot) {
          setSnapshots(prev => ({ ...prev, [vid]: v.snapshot }));
          return;
        }
      }
      try {
        const data = await apiFetch(`/api/flows/${flowId}/versions/${vid}`);
        setSnapshots(prev => ({ ...prev, [vid]: data.snapshot }));
      } catch(e) { console.warn("Failed to load snapshot", vid, e); }
    }
    if (leftVersion) fetchSnap(leftVersion);
    if (rightVersion) fetchSnap(rightVersion);
  }, [leftVersion, rightVersion, flowId]);

  const leftV = allVersions.find(v => v.id === leftVersion);
  const rightV = allVersions.find(v => v.id === rightVersion);
  const leftSnap = snapshots[leftVersion] || null;
  const rightSnap = snapshots[rightVersion] || null;

  // Compute diff
  const leftNodeIds = new Set((leftSnap?.nodes || []).map(n => n.id));
  const rightNodeIds = new Set((rightSnap?.nodes || []).map(n => n.id));
  const addedNodes = [...rightNodeIds].filter(id => !leftNodeIds.has(id));
  const removedNodes = [...leftNodeIds].filter(id => !rightNodeIds.has(id));
  const commonNodes = [...leftNodeIds].filter(id => rightNodeIds.has(id));

  const leftNodeMap = {};
  (leftSnap?.nodes || []).forEach(n => { leftNodeMap[n.id] = n; });
  const rightNodeMap = {};
  (rightSnap?.nodes || []).forEach(n => { rightNodeMap[n.id] = n; });
  const changedNodes = commonNodes.filter(id => {
    const l = leftNodeMap[id], r = rightNodeMap[id];
    if (!l || !r) return false;
    // workflow ノードは title/desc、board アイテムは label/description — 両方サポート
    const lLabel = l.label ?? l.title;
    const rLabel = r.label ?? r.title;
    const lDesc = l.description ?? l.desc ?? l.summary;
    const rDesc = r.description ?? r.desc ?? r.summary;
    return lLabel !== rLabel || lDesc !== rDesc || l.type !== r.type;
  });

  const leftRun = runs.filter(r => r.version_id === leftVersion).slice(-1)[0];
  const rightRun = runs.filter(r => r.version_id === rightVersion).slice(-1)[0];

  function badgeClass(run) {
    if (!run) return "neutral";
    if (run.failed === 0) return "pass";
    if (run.passed === 0) return "fail";
    return "mixed";
  }
  function badgeText(run) {
    if (!run) return "未実行";
    return `${run.passed}✓ ${run.failed}✗`;
  }

  function handleSelectLeft(nodeId) {
    if (selectedNode === nodeId && selectedSide === "left") { setSelectedNode(null); setSelectedSide(null); }
    else { setSelectedNode(nodeId); setSelectedSide("left"); }
  }
  function handleSelectRight(nodeId) {
    if (selectedNode === nodeId && selectedSide === "right") { setSelectedNode(null); setSelectedSide(null); }
    else { setSelectedNode(nodeId); setSelectedSide("right"); }
  }

  // Get selected node object
  const activeSnap = selectedSide === "left" ? leftSnap : rightSnap;
  const activeNode = activeSnap?.nodes?.find(n => n.id === selectedNode) || null;

  return (
    <div className="ef-container">
      <div className="ef-toolbar">
        <span className="ef-label">比較</span>
        <select className="ef-select" value={leftVersion || ""} onChange={e => setLeftVersion(e.target.value)}>
          {allVersions.map(v => <option key={v.id} value={v.id}>{v.id === EVAL_CURRENT_ID ? v.label : `${v.id}: ${v.label}`}</option>)}
        </select>
        <span className="ef-vs">VS</span>
        <select className="ef-select" value={rightVersion || ""} onChange={e => setRightVersion(e.target.value)}>
          {allVersions.map(v => <option key={v.id} value={v.id}>{v.id === EVAL_CURRENT_ID ? v.label : `${v.id}: ${v.label}`}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <div className="ef-diff-chips">
          {addedNodes.length > 0 && <span className="ef-diff-chip added">+{addedNodes.length}</span>}
          {removedNodes.length > 0 && <span className="ef-diff-chip removed">-{removedNodes.length}</span>}
          {changedNodes.length > 0 && <span className="ef-diff-chip changed">~{changedNodes.length}</span>}
          {addedNodes.length === 0 && removedNodes.length === 0 && changedNodes.length === 0 && <span className="ef-diff-chip neutral">同一</span>}
        </div>
      </div>

      <div className="ef-body">
        <div className="ef-panes">
          <div className="ef-pane">
            <div className="ef-pane-head">
              <span className="ef-pane-label">{leftV?.label || "—"}</span>
              <span className="ef-pane-meta">{leftSnap?.nodes?.length || 0}N</span>
              <span className={`ef-pane-badge ${badgeClass(leftRun)}`}>{badgeText(leftRun)}</span>
            </div>
            <EvalFlowPane workflow={leftSnap} selectedNode={selectedSide === "left" ? selectedNode : null} onSelectNode={handleSelectLeft} />
          </div>
          <div className="ef-pane">
            <div className="ef-pane-head">
              <span className="ef-pane-label">{rightV?.label || "—"}</span>
              <span className="ef-pane-meta">{rightSnap?.nodes?.length || 0}N</span>
              <span className={`ef-pane-badge ${badgeClass(rightRun)}`}>{badgeText(rightRun)}</span>
            </div>
            <EvalFlowPane workflow={rightSnap} selectedNode={selectedSide === "right" ? selectedNode : null} onSelectNode={handleSelectRight} />
          </div>
        </div>

        {activeNode && (
          <div className="ef-detail">
            <div className="ef-detail-head">
              <span className="ef-detail-side">{selectedSide === "left" ? leftV?.label : rightV?.label}</span>
              <button className="ef-detail-close" onClick={() => { setSelectedNode(null); setSelectedSide(null); }}>×</button>
            </div>
            <div className="ef-detail-body">
              <div className="ef-detail-title">
                <span className="ef-detail-chip" style={{ background: (window.NODE_TYPES[activeNode.type]?.color || "#888") + "20", color: window.NODE_TYPES[activeNode.type]?.color || "#888" }}>{window.NODE_TYPES[activeNode.type]?.label || activeNode.type}</span>
                <span>{activeNode.title || activeNode.label}</span>
              </div>
              {activeNode.subtitle && <div className="ef-detail-sub">{activeNode.subtitle}</div>}
              {activeNode.summary && <div className="ef-detail-desc">{activeNode.summary}</div>}
              {activeNode.desc && !activeNode.summary && <div className="ef-detail-desc">{activeNode.desc}</div>}
              {activeNode.duration && <div className="ef-detail-row"><span className="ef-detail-k">実行時間</span><span className="mono">{activeNode.duration}</span></div>}
              {activeNode.io_desc && activeNode.io_desc.length > 0 && (
                <div className="ef-detail-io">
                  <div className="ef-detail-k" style={{ marginBottom: "4px" }}>入出力</div>
                  {activeNode.io_desc.map((io, i) => (
                    <div key={i} className="ef-detail-io-item">
                      <span className={`ef-io-dir ${io.dir}`}>{io.dir === "in" ? "→ IN" : "← OUT"}</span>
                      <span className="ef-io-name">{io.name}</span>
                      <span className="ef-io-desc">{io.desc}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Show diff if same node exists in other version */}
              {selectedNode && changedNodes.includes(selectedNode) && (
                <div className="ef-detail-diff">
                  <div className="ef-detail-k" style={{ marginBottom: "4px", color: "var(--accent)" }}>変更点</div>
                  {(() => {
                    const other = selectedSide === "left" ? rightNodeMap[selectedNode] : leftNodeMap[selectedNode];
                    if (!other) return null;
                    const diffs = [];
                    if (activeNode.label !== other.label) diffs.push({ field: "ラベル", from: selectedSide === "left" ? activeNode.label : other.label, to: selectedSide === "left" ? other.label : activeNode.label });
                    if (activeNode.title !== other.title) diffs.push({ field: "タイトル", from: selectedSide === "left" ? activeNode.title : other.title, to: selectedSide === "left" ? other.title : activeNode.title });
                    if (activeNode.description !== other.description) diffs.push({ field: "説明", from: selectedSide === "left" ? (activeNode.description || "").substring(0, 50) : (other.description || "").substring(0, 50), to: selectedSide === "left" ? (other.description || "").substring(0, 50) : (activeNode.description || "").substring(0, 50) });
                    return diffs.map((d, i) => (
                      <div key={i} style={{ fontSize: "11px", marginBottom: "4px" }}>
                        <span style={{ color: "var(--tx-4)" }}>{d.field}: </span>
                        <span className="ef-diff-chip removed" style={{ fontSize: "10px" }}>{d.from}</span>
                        <span style={{ margin: "0 4px", color: "var(--tx-4)" }}>→</span>
                        <span className="ef-diff-chip added" style={{ fontSize: "10px" }}>{d.to}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="ef-diff-bar">
        <span style={{ fontWeight: 600, fontSize: "11px", color: "var(--tx-3)" }}>差分:</span>
        {addedNodes.length > 0 && <span className="ef-diff-chip added">+{addedNodes.length} 追加 ({addedNodes.map(id => (rightNodeMap[id]?.title || rightNodeMap[id]?.label || id)).join(", ")})</span>}
        {removedNodes.length > 0 && <span className="ef-diff-chip removed">-{removedNodes.length} 削除 ({removedNodes.map(id => (leftNodeMap[id]?.title || leftNodeMap[id]?.label || id)).join(", ")})</span>}
        {changedNodes.length > 0 && <span className="ef-diff-chip changed">~{changedNodes.length} 変更 ({changedNodes.map(id => (rightNodeMap[id]?.title || rightNodeMap[id]?.label || id)).join(", ")})</span>}
        {addedNodes.length === 0 && removedNodes.length === 0 && changedNodes.length === 0 && <span className="ef-diff-chip neutral">変更なし</span>}
      </div>
    </div>
  );
}

export function EvalChat({ messages, input, setInput, onSend, streaming, parseEvaluators, onAddEvaluators, parseCases, onAddCases, onStartMode, parseEvaluatorEdits, onApplyEvaluatorEdits, parseCaseEdits, onApplyCaseEdits, parseEditPrompt }) {
  const messagesEndRef = useRef(null);
  const [added, setAdded] = useState(false);
  const [addedCases, setAddedCases] = useState(false);
  const [editedEvals, setEditedEvals] = useState(false);
  const [editedCases, setEditedCases] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { setAdded(false); setAddedCases(false); setEditedEvals(false); setEditedCases(false); setCopiedPrompt(false); }, [messages.length]);

  return (
    <div className="eval-chat">
      {messages.length === 0 ? (
        <div className="eval-chat-empty">
          <div className="eval-chat-icon">🤖</div>
          <div>Eval づくりアシスタント</div>
          <div style={{ fontSize: "12px", textAlign: "center", padding: "0 16px" }}>何を作りますか？ 選ぶと要件から一緒に作ります<br/>（途中で別の種類に変えたいときは『新規』でやり直してください）</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, width: "100%", maxWidth: 280 }}>
            <button className="eval-mode-btn" style={{ textAlign: "left", padding: "9px 12px", border: "1px solid var(--accent)", borderRadius: 8, background: "var(--bg-2)", color: "var(--tx)", cursor: "pointer", fontSize: 13 }} onClick={() => onStartMode && onStartMode("evaluators")}>⚖ 評価軸を作る</button>
            <button className="eval-mode-btn" style={{ textAlign: "left", padding: "9px 12px", border: "1px solid var(--accent)", borderRadius: 8, background: "var(--bg-2)", color: "var(--tx)", cursor: "pointer", fontSize: 13 }} onClick={() => onStartMode && onStartMode("cases")}>🧪 テストケースを作る</button>
            <button className="eval-mode-btn" style={{ textAlign: "left", padding: "9px 12px", border: "1px solid var(--bd-2)", borderRadius: 8, background: "var(--bg-2)", color: "var(--tx-2)", cursor: "pointer", fontSize: 13 }} onClick={() => onStartMode && onStartMode("analyze")}>💬 評価結果を分析・相談</button>
          </div>
        </div>
      ) : (
        <div className="eval-chat-messages">
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const block = (m.role === "assistant" && parseEvaluators) ? parseEvaluators(m.content) : null;
            const cblock = (m.role === "assistant" && parseCases) ? parseCases(m.content) : null;
            const eedit = (m.role === "assistant" && parseEvaluatorEdits) ? parseEvaluatorEdits(m.content) : null;
            const cedit = (m.role === "assistant" && parseCaseEdits) ? parseCaseEdits(m.content) : null;
            const eprompt = (m.role === "assistant" && parseEditPrompt) ? parseEditPrompt(m.content) : null;
            let shown = m.content;
            if (block) shown = shown.replace(/```evaluators\s*\n[\s\S]*?\n```/g, "").trim();
            if (cblock) shown = shown.replace(/```cases\s*\n[\s\S]*?\n```/g, "").trim();
            if (eedit) shown = shown.replace(/```evaluator_edits\s*\n[\s\S]*?\n```/g, "").trim();
            if (cedit) shown = shown.replace(/```case_edits\s*\n[\s\S]*?\n```/g, "").trim();
            if (eprompt) shown = shown.replace(/```edit_prompt\s*\n[\s\S]*?\n```/g, "").trim();
            return (
              <div key={i} className={`eval-chat-msg ${m.role}`}>
                {shown}
                {block && block.length > 0 && isLast && !streaming && (
                  <div style={{ marginTop: 8, border: "1px solid var(--accent)", borderRadius: 8, padding: 10, background: "var(--accent-bg, #eff6ff)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 6 }}>⚖ 提案された評価軸（{block.length}）</div>
                    {block.map((e, j) => (
                      <div key={j} style={{ fontSize: 11, marginBottom: 4 }}>
                        <b>・{e.name}</b><div style={{ color: "var(--tx-3)", whiteSpace: "pre-wrap" }}>{(e.prompt || e.code || "").slice(0, 140)}{(e.prompt || e.code || "").length > 140 ? "…" : ""}</div>
                      </div>
                    ))}
                    <button
                      onClick={() => { onAddEvaluators && onAddEvaluators(block); setAdded(true); }}
                      disabled={added}
                      style={{ marginTop: 6, fontSize: 11, padding: "5px 12px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, cursor: added ? "default" : "pointer" }}>
                      {added ? "✓ 評価軸に追加しました" : `＋ ${block.length}件を評価軸に追加`}
                    </button>
                  </div>
                )}
                {cblock && cblock.length > 0 && isLast && !streaming && (
                  <div style={{ marginTop: 8, border: "1px solid var(--accent)", borderRadius: 8, padding: 10, background: "var(--accent-bg, #eff6ff)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 6 }}>🧪 提案されたテストケース（{cblock.length}）</div>
                    {cblock.map((c, j) => (
                      <div key={j} style={{ fontSize: 11, marginBottom: 4 }}>
                        <b>・{c.title}</b><div style={{ color: "var(--tx-3)", whiteSpace: "pre-wrap" }}>{(c.input_text || "").slice(0, 100)}{(c.input_text || "").length > 100 ? "…" : ""}{c.expected ? ` → 期待: ${String(c.expected).slice(0, 60)}` : ""}</div>
                      </div>
                    ))}
                    <button
                      onClick={() => { onAddCases && onAddCases(cblock); setAddedCases(true); }}
                      disabled={addedCases}
                      style={{ marginTop: 6, fontSize: 11, padding: "5px 12px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, cursor: addedCases ? "default" : "pointer" }}>
                      {addedCases ? "✓ テストケースに追加しました" : `＋ ${cblock.length}件をテストケースに追加`}
                    </button>
                  </div>
                )}
                {eedit && eedit.length > 0 && isLast && !streaming && (
                  <div style={{ marginTop: 8, border: "1px solid #d97706", borderRadius: 8, padding: 10, background: "rgba(217,119,6,0.06)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#d97706", marginBottom: 6 }}>✎ 評価軸の修正案（{eedit.length}）</div>
                    {eedit.map((e, j) => (
                      <div key={j} style={{ fontSize: 11, marginBottom: 4 }}>
                        <b>・[{e.id}]{e.name ? ` ${e.name}` : ""}</b><div style={{ color: "var(--tx-3)", whiteSpace: "pre-wrap" }}>{(e.prompt || e.code || "").slice(0, 140)}{(e.prompt || e.code || "").length > 140 ? "…" : ""}</div>
                      </div>
                    ))}
                    <button
                      onClick={() => { onApplyEvaluatorEdits && onApplyEvaluatorEdits(eedit); setEditedEvals(true); }}
                      disabled={editedEvals}
                      style={{ marginTop: 6, fontSize: 11, padding: "5px 12px", background: "#d97706", color: "#fff", border: "none", borderRadius: 4, cursor: editedEvals ? "default" : "pointer" }}>
                      {editedEvals ? "✓ 評価軸を修正しました" : `✎ ${eedit.length}件の評価軸を修正`}
                    </button>
                  </div>
                )}
                {cedit && cedit.length > 0 && isLast && !streaming && (
                  <div style={{ marginTop: 8, border: "1px solid #d97706", borderRadius: 8, padding: 10, background: "rgba(217,119,6,0.06)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#d97706", marginBottom: 6 }}>✎ テストケースの修正案（{cedit.length}）</div>
                    {cedit.map((c, j) => (
                      <div key={j} style={{ fontSize: 11, marginBottom: 4 }}>
                        <b>・[{c.id}]{c.title ? ` ${c.title}` : ""}</b><div style={{ color: "var(--tx-3)", whiteSpace: "pre-wrap" }}>{c.expected ? `期待: ${String(c.expected).slice(0, 80)}` : ""}{c.input_text ? ` / 入力: ${String(c.input_text).slice(0, 60)}` : ""}</div>
                      </div>
                    ))}
                    <button
                      onClick={() => { onApplyCaseEdits && onApplyCaseEdits(cedit); setEditedCases(true); }}
                      disabled={editedCases}
                      style={{ marginTop: 6, fontSize: 11, padding: "5px 12px", background: "#d97706", color: "#fff", border: "none", borderRadius: 4, cursor: editedCases ? "default" : "pointer" }}>
                      {editedCases ? "✓ テストケースを修正しました" : `✎ ${cedit.length}件のテストケースを修正`}
                    </button>
                  </div>
                )}
                {eprompt && isLast && !streaming && (
                  <div style={{ marginTop: 8, border: "1px solid var(--bd-2)", borderRadius: 8, padding: 10, background: "var(--bg-2)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx-2)", marginBottom: 6 }}>🛠 フロー本体の修正プロンプト（Claude Codeに貼る）</div>
                    <div style={{ fontSize: 11, color: "var(--tx-3)", whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", background: "var(--bg-1, #fff)", border: "1px solid var(--bd)", borderRadius: 4, padding: 8 }}>{eprompt}</div>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(eprompt); setCopiedPrompt(true); }}
                      style={{ marginTop: 6, fontSize: 11, padding: "5px 12px", background: "var(--tx-2)", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
                      {copiedPrompt ? "✓ コピーしました" : "📋 プロンプトをコピー"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {streaming && (() => {
            const last = messages[messages.length - 1];
            const waitingForReply = !last || last.role === "user" || !(last.content || "").trim();
            return waitingForReply ? (
              <div className="chat-typing"><span/><span/><span/></div>
            ) : null;
          })()}
          <div ref={messagesEndRef} />
        </div>
      )}
      <div className="eval-chat-input">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && onSend(input)}
          placeholder="Evalについて質問…"
          disabled={streaming}
        />
        <button onClick={() => onSend(input)} disabled={streaming || !input.trim()}>
          {streaming ? "⏳" : "送信"}
        </button>
      </div>
    </div>
  );
}


// ══════════ SUBAGENT DETAIL PAGE ══════════

export function ToolChipWithDetail({ toolName }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const td = (window.TOOL_DESCRIPTIONS || {})[toolName];

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="sa-tool-chip-wrap" ref={ref}>
      <button className={`sa-tool-chip-btn ${open ? "is-active" : ""}`} onClick={() => setOpen(!open)}>{toolName}</button>
      {open && td && (
        <div className="sa-tool-pop">
          <div className="sa-tool-pop-name">{td.name}</div>
          <div className="sa-tool-pop-desc">{td.desc}</div>
          {td.can && td.can.length > 0 && (
            <>
              <div className="sa-tool-pop-section">できること</div>
              <ul className="sa-tool-pop-list can">{td.can.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
          {td.cannot && td.cannot.length > 0 && (
            <>
              <div className="sa-tool-pop-section">できないこと</div>
              <ul className="sa-tool-pop-list cant">{td.cannot.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
        </div>
      )}
      {open && !td && (
        <div className="sa-tool-pop">
          <div className="sa-tool-pop-name">{toolName}</div>
          <div className="sa-tool-pop-desc" style={{ marginBottom: 0 }}>このツールの詳細情報はまだ登録されていません。</div>
        </div>
      )}
    </div>
  );
}
