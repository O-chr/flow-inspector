// Palette + sidebar (node picker, elements palette, left sidebar + my-items helpers).
// Phase 3 module — extracted verbatim. Reads window.FI/SIDEBAR/DASH_* (globals).
import React, { useState, useEffect, useMemo } from 'react'
import { NODE_TYPES } from '../lib/node-types.js'
import { buildMyFunctionsCatalog, removeCustomFunction } from '../lib/custom-functions.js'

const PALETTE_L1_ORDER = ["hook", "subagent", "mcp", "skill", "command", "code", "trigger", "user", "decision", "config", "api", "plugin", "agentsdk", "parent"];

// localStorage キー: 「マイ要素」タブで選択中の id 集合
const PALETTE_MY_KEY = "fi_palette_my_items_v1";
function loadMyItemIds() {
  try { return new Set(JSON.parse(localStorage.getItem(PALETTE_MY_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveMyItemIds(setObj) {
  try { localStorage.setItem(PALETTE_MY_KEY, JSON.stringify([...setObj])); } catch {}
}

// DASH_* (実 PC 上の自作要素) を ELEMENTS 形式 (palette item) に変換
function buildMyItemsCatalog() {
  const items = [];
  (window.DASH_SUBAGENTS || []).forEach((a, i) => {
    items.push({
      id: `my-subagent-${a.name || i}`, type: "subagent",
      title: a.name || "(no name)",
      subtitle: a.layer ? `layer: ${a.layer}` : "サブエージェント",
      desc: a.desc || "", cat: "C. Subagent (自作)",
      meta: { name: a.name, layer: a.layer, nodes: a.nodes, flowId: a.flowId },
    });
  });
  (window.DASH_SKILLS || []).forEach((s, i) => {
    items.push({
      id: `my-skill-${s.name || i}`, type: "skill",
      title: s.name || "(no name)",
      subtitle: s.layer ? `layer: ${s.layer}` : "スキル",
      desc: s.desc || "", cat: "E. Skills (自作)",
      meta: { name: s.name, layer: s.layer, complexity: s.complexity, flowId: s.flowId },
    });
  });
  (window.DASH_MCP || []).forEach((m, i) => {
    items.push({
      id: `my-mcp-${m.name || i}`, type: "mcp",
      title: m.name || "(no name)",
      subtitle: m.layer ? `layer: ${m.layer}` : "MCP",
      desc: (m.tools || []).join(", "), cat: "D. MCP (自作)",
      meta: { server: m.name, layer: m.layer, active: m.active, tools: m.tools, cmd: m.cmd },
    });
  });
  (window.DASH_HOOKS || []).forEach((h, i) => {
    items.push({
      id: `my-hook-${h.name || h.type || i}`, type: "hook",
      title: h.name || h.type || "(no name)",
      subtitle: h.matcher ? `matcher: ${h.matcher}` : (h.type || "フック"),
      desc: h.script || "", cat: "A. Hook (自作)",
      meta: { event: h.type, matcher: h.matcher, script: h.script, layer: h.layer },
    });
  });
  (window.DASH_COMMANDS || []).forEach((c, i) => {
    items.push({
      id: `my-command-${c.name || i}`, type: "command",
      title: c.name || "(no name)",
      subtitle: c.layer ? `layer: ${c.layer}` : "コマンド",
      desc: c.desc || "", cat: "F. Commands (自作)",
      meta: { name: c.name, layer: c.layer },
    });
  });
  return items;
}

// エッジ中央 + ボタン picker 内で使う、コンパクトな ELEMENTS 検索リスト
// パレットと同じデータソース (ELEMENTS + マイ要素タブ) を共有。タイプ別 L1/L2 構造。
export function NodePickerList({ onPick }) {
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState("default"); // "default" | "mine"
  const [myIds] = React.useState(() => loadMyItemIds());
  // タイプ別の展開状態。初期はすべて折りたたみ。
  const [expanded, setExpanded] = React.useState(() => new Set());

  const NT = window.NODE_TYPES || {};
  const elements = (window.FI && window.FI.ELEMENTS) || [];
  const myCatalog = React.useMemo(() => buildMyItemsCatalog(), []);
  const source = tab === "mine" ? myCatalog.filter(it => myIds.has(it.id)) : elements;

  const filtered = React.useMemo(() => {
    if (!query.trim()) return source;
    const q = query.toLowerCase();
    return source.filter(e =>
      (e.title || "").toLowerCase().includes(q) ||
      (e.subtitle || "").toLowerCase().includes(q) ||
      (e.cat || "").toLowerCase().includes(q) ||
      (e.id || "").toLowerCase().includes(q)
    );
  }, [query, source]);

  // タイプ別グループ化
  const grouped = React.useMemo(() => {
    const byType = {};
    filtered.forEach(item => {
      const tp = item.type;
      if (!byType[tp]) byType[tp] = [];
      byType[tp].push(item);
    });
    return byType;
  }, [filtered]);

  // 検索時は全展開、それ以外はユーザー操作の expanded state を見る
  const effectiveExpanded = query.trim() ? new Set(Object.keys(grouped)) : expanded;

  function toggleL1(type) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  const PALETTE_ORDER = (typeof PALETTE_L1_ORDER !== "undefined") ? PALETTE_L1_ORDER : Object.keys(grouped);
  const visibleTypes = PALETTE_ORDER.filter(t => grouped[t] && grouped[t].length > 0);
  Object.keys(grouped).forEach(t => { if (!PALETTE_ORDER.includes(t)) visibleTypes.push(t); });

  return (
    <div className="np-list-wrap">
      <div className="np-tabs">
        <button type="button" className={`np-tab ${tab === "default" ? "is-active" : ""}`}
          onClick={() => setTab("default")}>デフォルト</button>
        <button type="button" className={`np-tab ${tab === "mine" ? "is-active" : ""}`}
          onClick={() => setTab("mine")}>マイ要素 <span className="np-tab-count">{myIds.size}</span></button>
      </div>
      <input
        className="np-search"
        placeholder="🔍 検索: 名前 / カテゴリ"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={false}
      />
      <div className="np-scroll">
        {visibleTypes.length === 0 && (
          <div className="np-empty">
            {tab === "mine" && myIds.size === 0
              ? "「マイ要素」が未選択。パレットの ⚙ 編集から追加してください。"
              : "該当なし"}
          </div>
        )}
        {visibleTypes.map(type => {
          const t = NT[type] || {};
          const isOpen = effectiveExpanded.has(type);
          const items = grouped[type];
          return (
            <div key={type} className="np-group">
              <div className="np-l1" onClick={() => toggleL1(type)} style={{ borderLeftColor: t.color }}>
                <span className="np-l1-icon" style={{ color: t.color }}>{t.icon || "·"}</span>
                <span className="np-l1-label" style={{ color: t.color }}>{t.label || type}</span>
                <span className="np-l1-count">{items.length}</span>
                <span className="np-l1-arrow">{isOpen ? "▾" : "▸"}</span>
              </div>
              {isOpen && (
                <div className="np-l2-list">
                  {items.slice(0, 30).map(item => (
                    <button key={item.id} className="np-item" onClick={() => onPick(item)}
                      title={`${item.title} (${t.label || item.type})`}>
                      <span className="np-dot" style={{ background: t.color }} />
                      <span className="np-item-title">{item.title}</span>
                    </button>
                  ))}
                  {items.length > 30 && (
                    <div className="np-empty" style={{ fontSize: 10, padding: "4px 8px" }}>
                      ({items.length - 30} 件以上 / 検索で絞り込み)
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ElementsPalette({ onSelectPaletteItem, paletteSelectedId, floating }) {
  const [query, setQuery] = useState("");
  // デフォルトは全カテゴリ折りたたみ（検索時は effectiveExpanded で自動展開）
  const [expanded, setExpanded] = useState(() => new Set());
  const [tip, setTip] = useState(null);
  // タブ: "default" (Element カタログ) / "mine" (自作要素) / "fn" (マイ関数)
  const [paletteTab, setPaletteTab] = useState("default");
  // マイ要素タブで選択中の id 集合 (localStorage 永続化)
  const [myItemIds, setMyItemIds] = useState(() => loadMyItemIds());
  // マイ要素タブの編集モード (チェック式 表示/非表示制御)
  const [editMyMode, setEditMyMode] = useState(false);
  // マイ関数の再描画用カウンター (CustomEvent をリッスン)
  const [fnVersion, setFnVersion] = useState(0);

  React.useEffect(() => {
    const handler = () => setFnVersion(v => v + 1);
    window.addEventListener("fi-custom-functions-changed", handler);
    return () => window.removeEventListener("fi-custom-functions-changed", handler);
  }, []);

  const elements = (window.FI && window.FI.ELEMENTS) || [];
  const NT = window.NODE_TYPES || {};
  const SPECS = (window.FI && window.FI.TYPE_SPECS) || {};

  // マイ要素カタログ (DASH_* から変換)
  const myCatalog = useMemo(() => buildMyItemsCatalog(), [
    window.DASH_SUBAGENTS, window.DASH_SKILLS, window.DASH_MCP, window.DASH_HOOKS, window.DASH_COMMANDS
  ]);

  // マイ関数カタログ (localStorage から)
  const fnCatalog = useMemo(() => buildMyFunctionsCatalog(), [fnVersion]);

  // パーツカタログ (実用プリセット = window.FI.PARTS)。業務の動詞で使える事前設定済みノード。
  const partsCatalog = useMemo(() => (window.FI && window.FI.PARTS) || [], []);

  // タブごとのソース
  const tabSource = paletteTab === "fn"
    ? fnCatalog
    : paletteTab === "parts"
    ? partsCatalog
    : paletteTab === "mine"
    ? (editMyMode ? myCatalog : myCatalog.filter(it => myItemIds.has(it.id)))
    : elements;

  const filtered = useMemo(() => {
    if (!query.trim()) return tabSource;
    const q = query.toLowerCase();
    return tabSource.filter(e =>
      (e.title || "").toLowerCase().includes(q) ||
      (e.subtitle || "").toLowerCase().includes(q) ||
      (e.desc || "").toLowerCase().includes(q) ||
      (e.cat || "").toLowerCase().includes(q) ||
      (e.id || "").toLowerCase().includes(q)
    );
  }, [query, tabSource]);

  function toggleMyItem(id) {
    setMyItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveMyItemIds(next);
      return next;
    });
  }
  function selectAllMy() {
    const next = new Set(myCatalog.map(it => it.id));
    setMyItemIds(next); saveMyItemIds(next);
  }
  function clearAllMy() {
    const next = new Set();
    setMyItemIds(next); saveMyItemIds(next);
  }

  const grouped = useMemo(() => {
    const byType = {};
    filtered.forEach(e => {
      const type = e.type;
      if (!byType[type]) byType[type] = [];
      byType[type].push(e);
    });
    return byType;
  }, [filtered]);

  const effectiveExpanded = query.trim() ? new Set(Object.keys(grouped)) : expanded;

  function toggleL1(type) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  function showTip(type, ev) {
    const rect = ev.currentTarget.getBoundingClientRect();
    // パレットの右端から 8px 右に表示 (Issue #2 fix: ⓘ アイコンの位置基準だと
    // パレット内のアイテムに被るため、パレット右端基準で計算)
    const palette = ev.currentTarget.closest(".elements-palette");
    const baseX = palette ? palette.getBoundingClientRect().right : rect.right;
    setTip({ type, x: baseX + 8, y: rect.top });
  }

  function handleDragStart(item, ev) {
    const payload = {
      type: item.type, title: item.title, subtitle: item.subtitle || "",
      desc: item.desc || "", meta: item.meta || {}, source_id: item.id,
    };
    ev.dataTransfer.setData("application/x-flow-element", JSON.stringify(payload));
    ev.dataTransfer.setData("text/plain", item.title);
    ev.dataTransfer.effectAllowed = "copy";
  }

  const visibleTypes = PALETTE_L1_ORDER.filter(t => grouped[t] && grouped[t].length > 0);
  Object.keys(grouped).forEach(t => { if (!PALETTE_L1_ORDER.includes(t)) visibleTypes.push(t); });

  return (
    <aside className={`elements-palette ${floating ? "is-floating" : ""}`}>
      {/* タブ切替: デフォルトカタログ / 自作要素 / マイ関数 */}
      <div className="ep-tabs">
        <button
          type="button"
          className={`ep-tab ${paletteTab === "default" ? "is-active" : ""}`}
          onClick={() => { setPaletteTab("default"); setEditMyMode(false); }}
        >デフォルト</button>
        <button
          type="button"
          className={`ep-tab ${paletteTab === "parts" ? "is-active" : ""}`}
          onClick={() => { setPaletteTab("parts"); setEditMyMode(false); }}
          title="業務の動詞で使える実用パーツ (メールを送る / 予定を入れる 等)"
        >🧱 パーツ <span className="ep-tab-count">{partsCatalog.length}</span></button>
        <button
          type="button"
          className={`ep-tab ${paletteTab === "mine" ? "is-active" : ""}`}
          onClick={() => setPaletteTab("mine")}
          title="自分で作成した skill / subagent / MCP / hook / command"
        >マイ要素 <span className="ep-tab-count">{myItemIds.size}</span></button>
        <button
          type="button"
          className={`ep-tab ${paletteTab === "fn" ? "is-active" : ""}`}
          onClick={() => { setPaletteTab("fn"); setEditMyMode(false); }}
          title="Plan Workspace で「関数化」したフロー部品"
        >🧩 マイ関数 <span className="ep-tab-count">{fnCatalog.length}</span></button>
      </div>

      <input className="ep-search" placeholder="検索: 名前 / 説明 / カテゴリ"
        value={query} onChange={(e) => setQuery(e.target.value)} />

      {/* マイ要素タブの操作バー */}
      {paletteTab === "mine" && (
        <div className="ep-my-bar">
          <button
            type="button"
            className={`ep-my-btn ${editMyMode ? "is-active" : ""}`}
            onClick={() => setEditMyMode(m => !m)}
            title={editMyMode ? "編集モードを終了" : "パレットに乗せる要素を選ぶ"}
          >{editMyMode ? "✓ 完了" : "⚙ 編集"}</button>
          {editMyMode && (
            <>
              <button type="button" className="ep-my-btn" onClick={selectAllMy} title="全部選択">全選択</button>
              <button type="button" className="ep-my-btn" onClick={clearAllMy} title="全部解除">クリア</button>
            </>
          )}
          {!editMyMode && myCatalog.length > 0 && (
            <span className="ep-my-hint">
              {myItemIds.size === 0
                ? "「⚙ 編集」で要素を選択してパレットに追加"
                : `${myItemIds.size} / ${myCatalog.length} 件を表示中`}
            </span>
          )}
        </div>
      )}

      <div className="ep-list">
        {/* マイ要素タブで何もない時 */}
        {paletteTab === "mine" && myCatalog.length === 0 && (
          <div className="ep-empty">
            自作要素 (skill / subagent / MCP / hook / command) が見つかりません。
            <br/>
            <span style={{ color: "var(--tx-4)", fontSize: 11 }}>
              `.claude/` フォルダにファイルを作成すると、ここに表示されます。
            </span>
          </div>
        )}

        {/* マイ関数タブで何もない時 */}
        {paletteTab === "fn" && fnCatalog.length === 0 && (
          <div className="ep-empty">
            マイ関数がまだありません。
            <br/>
            <span style={{ color: "var(--tx-4)", fontSize: 11 }}>
              Plan Workspace で複数アイテムを選択し、「⚙ 関数化」で保存すると、ここに表示されます。
            </span>
          </div>
        )}

        {/* パーツタブで何もない時 */}
        {paletteTab === "parts" && partsCatalog.length === 0 && (
          <div className="ep-empty">
            実用パーツがまだありません。
            <br/>
            <span style={{ color: "var(--tx-4)", fontSize: 11 }}>
              「メールを送る」「予定を入れる」など、業務の動詞で使える事前設定済みノードがここに並びます。
            </span>
          </div>
        )}

        {visibleTypes.length === 0 && !(paletteTab === "mine" && myCatalog.length === 0) && !(paletteTab === "fn" && fnCatalog.length === 0) && !(paletteTab === "parts" && partsCatalog.length === 0) && (
          <div className="ep-empty">
            {paletteTab === "mine" && !editMyMode
              ? "選択中の自作要素がありません。「⚙ 編集」から選んでください。"
              : "該当なし"}
          </div>
        )}

        {/* マイ関数タブ: フラットなカード一覧 */}
        {paletteTab === "fn" && filtered.length > 0 && (
          <div className="ep-fn-list">
            {filtered.map(item => {
              const itemCount = (item.meta && item.meta.items && item.meta.items.length) || 0;
              const fnIcon = (item.meta && item.meta.fnIcon) || "🧩";
              const fnColor = (item.meta && item.meta.fnColor) || "#7c3aed";
              return (
                <div
                  key={item.id}
                  className="ep-fn-card"
                  draggable
                  onDragStart={(ev) => handleDragStart(item, ev)}
                  onClick={() => onSelectPaletteItem && onSelectPaletteItem(item)}
                  style={{ borderLeftColor: fnColor }}
                  title={item.desc || item.title}
                >
                  <div className="ep-fn-card-head">
                    <span className="ep-fn-card-icon" style={{ color: fnColor }}>{fnIcon}</span>
                    <span className="ep-fn-card-title">{item.title}</span>
                    <span className="ep-fn-card-count">{itemCount} items</span>
                    <button
                      type="button"
                      className="ep-fn-card-del"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (confirm(`マイ関数「${item.title}」を削除しますか？`)) {
                          removeCustomFunction(item.meta.fnId);
                        }
                      }}
                      title="削除"
                    >×</button>
                  </div>
                  {item.desc && <div className="ep-fn-card-desc">{item.desc}</div>}
                </div>
              );
            })}
          </div>
        )}

        {paletteTab !== "fn" && visibleTypes.map(type => {
          const t = NT[type] || {};
          const isOpen = effectiveExpanded.has(type);
          const items = grouped[type];
          return (
            <div key={type} className="ep-group">
              <div className="ep-l1" onClick={() => toggleL1(type)}>
                <span className="ep-l1-icon" style={{ color: t.color }}>{t.icon || "·"}</span>
                <span className="ep-l1-label" style={{ color: t.color }}>{t.label || type}</span>
                <span className="ep-l1-count">{items.length}</span>
                <span className="ep-l1-info"
                  onMouseEnter={(ev) => showTip(type, ev)}
                  onMouseLeave={() => setTip(null)}
                  onClick={(ev) => ev.stopPropagation()}>ⓘ</span>
                <span className="ep-l1-arrow">{isOpen ? "▾" : "▸"}</span>
              </div>
              {isOpen && (
                <div className="ep-l2-list">
                  {items.map(item => {
                    const isMine = paletteTab === "mine";
                    const isChecked = isMine && myItemIds.has(item.id);
                    const isCheckEdit = isMine && editMyMode;
                    return (
                      <div
                        key={item.id}
                        className={`ep-l2 ${paletteSelectedId === item.id ? "is-selected" : ""} ${isCheckEdit ? "is-edit" : ""} ${isMine && !isChecked && !isCheckEdit ? "is-disabled" : ""}`}
                        draggable={!isCheckEdit && (!isMine || isChecked)}
                        onDragStart={(ev) => (!isCheckEdit && (!isMine || isChecked)) ? handleDragStart(item, ev) : ev.preventDefault()}
                        onClick={() => {
                          if (isCheckEdit) toggleMyItem(item.id);
                          else if (!isMine || isChecked) onSelectPaletteItem && onSelectPaletteItem(item);
                        }}
                        style={{ borderLeftColor: t.color }}
                        title={isCheckEdit ? (isChecked ? "クリックでパレットから外す" : "クリックでパレットに追加") : item.title}
                      >
                        {isCheckEdit && (
                          <span className={`ep-l2-check ${isChecked ? "is-on" : ""}`}>
                            {isChecked ? "✓" : ""}
                          </span>
                        )}
                        <span className="ep-l2-icon" style={{ color: t.color }}>{t.icon || "·"}</span>
                        <span className="ep-l2-title">{item.title}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {tip && (() => {
        const base = (SPECS[tip.type] && SPECS[tip.type].base) || {};
        const explainText = base.explain || (NT[tip.type] && NT[tip.type].label) || tip.type;
        return (
          <div className="ep-l1-tip" style={{ left: tip.x + "px", top: tip.y + "px" }}>
            <strong style={{ color: NT[tip.type]?.color }}>{NT[tip.type]?.label || tip.type}</strong>
            <div>{explainText}</div>
          </div>
        );
      })()}
    </aside>
  );
}

export function Sidebar({ query, setQuery, activeFilter, setActiveFilter, activeId, onPick, compact, onDashboard }) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return window.SIDEBAR.filter(s => activeFilter === "All" || s.section === activeFilter).map(s => ({ ...s, items: s.items.filter(it => !q || it.name.toLowerCase().includes(q)) })).filter(s => s.items.length);
  }, [query, activeFilter]);
  const filters = ["All", "Skills", "Hooks", "Scheduled Tasks", "Custom Workflows"];
  return (
    <aside className={`sidebar ${compact ? "is-compact" : ""}`}>
      <div className="brand">{onDashboard && <button className="brand-back" onClick={onDashboard} title="Back to Dashboard">←</button>}<div className="brand-mark"></div><div className="brand-text"><div className="brand-name">Flow Inspector</div><div className="brand-sub">v0.4.2 · local</div></div></div>
      <div className="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg><input value={query} onChange={e => setQuery(e.target.value)} placeholder="search workflows…" /><kbd>⌘K</kbd></div>
      <div className="filters">{filters.map(f => (<button key={f} className={`filter-chip ${activeFilter === f ? "is-active" : ""}`} onClick={() => setActiveFilter(f)}>{f}</button>))}</div>
      <div className="sb-scroll">{filtered.map(section => (
        <div key={section.section} className="sb-section">
          <div className="sb-section-head"><span>{section.section}</span><span className="sb-count">{section.items.length}</span></div>
          {section.items.map(item => (
            <button key={item.id} className={`sb-item ${activeId === item.id ? "is-active" : ""}`} onClick={() => onPick(item.id)}>
              <div className="sb-item-main"><div className="sb-item-name">{item.name}</div><div className="sb-item-badges"><span className="badge"><span className="badge-dot" /> {item.nodes} nodes</span><span className={`badge cx-${item.complexity.toLowerCase()}`}>{item.complexity}</span></div></div>
            </button>
          ))}
        </div>
      ))}</div>
      <div className="sb-foot"><div className="sf-row"><span className="sf-dot" /><span>watching <code>~/.claude</code></span></div><div className="sf-row sf-muted"><span>last sync</span><span>2s ago</span></div></div>
    </aside>
  );
}
