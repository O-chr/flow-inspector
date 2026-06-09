// Plan workspace / builder (PlanWorkspace + Plan* cards + board list). Phase 3 module.
// Extracted verbatim — the last big cluster.
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { API } from '../lib/api.js'
import { NODE_TYPES } from '../lib/node-types.js'
import { NODE_W, NODE_H } from '../lib/geometry.jsx'
import { applyFlowActions, boardItemToNode, boardToWorkflow, deleteBoardFile, fmtBoardDate, listBoardsFile, loadPlanBoard, loadPlanBoardFile, mergeNodeSettingsIntoBoard, savePlanBoardFile } from '../lib/board-model.js'
import { addCustomFunction, loadCustomFunctions } from '../lib/custom-functions.js'
import { DetailBody, RightPanel, MiniMap } from './node-detail.jsx'
import { ElementsPalette, NodePickerList } from './palette.jsx'
import { FlowBuildChat, SkillSaveFlow } from './chat.jsx'
import { FlowDiagram, SubflowContainer } from './flow/diagram.jsx'

export function PlanNodeInspector({ item, board, onPatch, onJump, onClose }) {
  const [viewMode, setViewMode] = React.useState("simple"); // simple(概要) | settings(設定) | dev
  if (!item) {
    return <div className="plan-panel-body src-view-msg" style={{ padding: 16 }}>ノードをクリックすると詳細が出ます。</div>;
  }
  const node = boardItemToNode(item);
  if (!node) {
    return <div className="plan-panel-body src-view-msg" style={{ padding: 16 }}>このアイテムには表示できる詳細がありません。</div>;
  }
  const nt = window.NODE_TYPES[node.type] || { label: node.type, color: "var(--tx-3)", bg: "var(--bg-3)" };
  // edges/nodes コンテキストを DetailBody に渡す。id は付けない → localOverride + onPatch のみで動く。
  const ctx = boardToWorkflow(board, { name: board.name, description: board.desc, source: { type: "skill" } });
  ctx.id = undefined;
  return (
    <div className="plan-panel-body plan-rich-inspector" style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1, padding: 0 }}>
      <div className="detail-head" style={{ "--accent": nt.color }}>
        <div className="dh-row">
          <span className="dh-chip" style={{ background: nt.bg, color: nt.color, borderColor: nt.color }}>{(nt.label || node.type).toUpperCase()}</span>
          <div className="dh-mode-toggle">
            <button className={`dh-mode-btn ${viewMode === "simple" ? "is-active" : ""}`} onClick={() => setViewMode("simple")}>概要</button>
            <button className={`dh-mode-btn ${viewMode === "settings" ? "is-active" : ""}`} onClick={() => setViewMode("settings")}>設定</button>
            <button className={`dh-mode-btn ${viewMode === "dev" ? "is-active" : ""}`} onClick={() => setViewMode("dev")}>Dev</button>
          </div>
          {onClose && <button className="dh-close" onClick={onClose} title="選択解除">×</button>}
        </div>
        <div className="dh-title">{node.title}</div>
        <div className="dh-sub">{node.subtitle}</div>
      </div>
      <div className="detail-body" style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <DetailBody node={node} workflow={ctx} onJump={onJump} onSaved={() => {}} viewMode={viewMode} onPatch={onPatch} />
      </div>
    </div>
  );
}
export function PlanWorkspace({ boardId, flowList, onBack, onOpenFlow, controlled, initialBoard, onBoardChange, title, hideHeader, hidePalette, floatingPalette, readOnly, onSelectionChange, controlledSelectedId, onSave, onSaveAs, onDeployTest, onEval, saveAsCategory, flowId, sourceType, richInspector, flowChat }) {
  // ボード読込 (なければ初期化)
  // board の最低限のフィールドを補完するサニタイザ (undo/redo で壊れたデータを受けても落ちないように)
  function sanitizeBoard(b) {
    if (!b || typeof b !== "object") return null;
    return {
      id: b.id || boardId,
      name: b.name || "新しいプラン",
      desc: b.desc || "",
      items: Array.isArray(b.items) ? b.items : [],
      edges: Array.isArray(b.edges) ? b.edges : [],
      view: (b.view && typeof b.view === "object") ? b.view : { x: 0, y: 0, k: 0.9 },
      createdAt: b.createdAt || new Date().toISOString(),
      updatedAt: b.updatedAt || new Date().toISOString(),
    };
  }
  const [board, setBoardRaw] = React.useState(() => {
    const fallback = {
      id: boardId || "default",
      name: "新しいプラン",
      desc: "目的を入力 (このボードで何を最適化するか)",
      items: [],
      edges: [],
      view: { x: 0, y: 0, k: 0.9 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // controlled モード: 親から initialBoard を受け取る (localStorage は使わない)
    if (controlled && initialBoard) {
      return sanitizeBoard(initialBoard) || fallback;
    }
    const existing = loadPlanBoard(boardId);
    return sanitizeBoard(existing) || fallback;
  });
  // setBoard wrapper: null/壊れたデータを弾いて、必ず最低限のフィールドを持つようにする
  const setBoard = React.useCallback((updater) => {
    setBoardRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const safe = sanitizeBoard(next);
      return safe || prev;  // sanitize 失敗時は前の状態を維持
    });
  }, []);
  // 非 controlled: mount 後に boards/<id>.json (正本) から取得して差し替える。
  // 初期 state は localStorage キャッシュ or 空。取得成功時の差し替えでは自動保存しない
  // (= ボードを「開いただけ」で updatedAt を更新しないため、下の保存をスキップ)。
  const boardFileLoadedRef = React.useRef(false);
  const skipNextFileSaveRef = React.useRef(false);
  const firstAutosaveSkippedRef = React.useRef(false);  // mount 直後の placeholder/cache 状態はユーザー編集ではないので保存しない (新規ボードのファイル上書き防止)
  React.useEffect(() => {
    if (controlled || boardFileLoadedRef.current) return;
    boardFileLoadedRef.current = true;
    let cancelled = false;
    (async () => {
      const fromFile = await loadPlanBoardFile(boardId);
      if (!cancelled && fromFile) {
        skipNextFileSaveRef.current = true;
        setBoard(fromFile);
      }
    })();
    return () => { cancelled = true; };
  }, [controlled, boardId]);
  // controlled mode: initialBoard は「初期値」のみとして扱う (mount 後の同期はしない)。
  // 親が後から差し替えたい場合は <PlanWorkspace key={...} /> で remount すること。
  // ※ 旧実装の同期 useEffect は無限ループの原因だった:
  //   initialBoard 変化 → setBoardRaw → board 変化 → onBoardChange → 親 setState →
  //   親 re-render で新 initialBoard → 再度 setBoardRaw …  (~225 renders/sec)
  // 初回の onBoardChange も親には不要なのでスキップする
  const initialEmitDoneRef = React.useRef(false);
  React.useEffect(() => {
    if (!board) return;
    if (controlled) {
      if (!initialEmitDoneRef.current) {
        initialEmitDoneRef.current = true;
        return;  // 初回 (= initial state そのもの) は親に通知しない
      }
      if (onBoardChange) onBoardChange(board);
      return;
    }
    if (!firstAutosaveSkippedRef.current) { firstAutosaveSkippedRef.current = true; return; }
    if (skipNextFileSaveRef.current) { skipNextFileSaveRef.current = false; return; }
    savePlanBoardFile(board);
  }, [board]);

  // ── Undo / Redo (S1 C-1) ──
  // past / future stack で履歴管理 (上限 50 件)。setBoard ラッパー setBoardWithHistory で push する
  const [history, setHistory] = React.useState({ past: [], future: [] });
  const HISTORY_LIMIT = 50;
  const skipHistoryRef = React.useRef(false);  // ドラッグ中は history push を抑制
  const dragSnapshotRef = React.useRef(null);  // ドラッグ開始時のスナップショット (終了時に1回 push)
  // 最新の state を ref で持つ (closure stale 対策)
  const boardRef = React.useRef(board);
  const historyRef = React.useRef(history);
  React.useEffect(() => { boardRef.current = board; }, [board]);
  React.useEffect(() => { historyRef.current = history; }, [history]);

  function setBoardWithHistory(updater) {
    setBoard(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next === prev) return prev;
      if (!skipHistoryRef.current && prev) {
        setHistory(h => ({
          past: [...h.past, prev].slice(-HISTORY_LIMIT),
          future: [],
        }));
      }
      return next;
    });
  }

  function beginDragHistory() {
    if (skipHistoryRef.current) return;
    dragSnapshotRef.current = boardRef.current;
    skipHistoryRef.current = true;
  }
  function endDragHistory() {
    skipHistoryRef.current = false;
    if (dragSnapshotRef.current) {
      const snap = dragSnapshotRef.current;
      setHistory(h => ({
        past: [...h.past, snap].slice(-HISTORY_LIMIT),
        future: [],
      }));
      dragSnapshotRef.current = null;
    }
  }
  function undo() {
    const h = historyRef.current;
    if (!h || h.past.length === 0) return;
    const previous = h.past[h.past.length - 1];
    if (!previous) return;  // null/undefined ガード
    const current = boardRef.current;
    setHistory({
      past: h.past.slice(0, -1),
      future: current ? [...h.future, current].slice(-HISTORY_LIMIT) : h.future,
    });
    skipHistoryRef.current = true;
    setBoard(previous);
    setTimeout(() => { skipHistoryRef.current = false; }, 0);
  }
  function redo() {
    const h = historyRef.current;
    if (!h || h.future.length === 0) return;
    const nextBoard = h.future[h.future.length - 1];
    if (!nextBoard) return;
    const current = boardRef.current;
    setHistory({
      past: current ? [...h.past, current].slice(-HISTORY_LIMIT) : h.past,
      future: h.future.slice(0, -1),
    });
    skipHistoryRef.current = true;
    setBoard(nextBoard);
    setTimeout(() => { skipHistoryRef.current = false; }, 0);
  }

  const [view, setView] = React.useState((board && board.view) || { x: 0, y: 0, k: 0.9 });
  const [dragging, setDragging] = React.useState(false);
  const [showFlowPicker, setShowFlowPicker] = React.useState(false);
  const [editingTitle, setEditingTitle] = React.useState(false);
  // PW-4: 選択 / クリップボード / 右クリックメニュー
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  // 浮動パレットの最小化状態 (− / +)
  const [paletteMinimized, setPaletteMinimized] = React.useState(false);
  // floating パネル: ドックのアクティブタブ + 切り離した floating ウィンドウ群
  const [panelTab, setPanelTab] = React.useState("palette");
  // フロー構築AIチャット (右下FAB) の開閉
  const [chatOpen, setChatOpen] = React.useState(false);
  // 「スキルとして保存」フロー (検証→保存→相談チャット)。{ items, edges } | null
  const [skillSave, setSkillSave] = React.useState(null);
  const [floatWins, setFloatWins] = React.useState([]); // [{id, tab, x, y, w, h}]
  const winDrag = React.useRef(null);
  const winResize = React.useRef(null);
  const winSeq = React.useRef(0);
  const tearPending = React.useRef(null); // {tab, sx, sy}
  const tearFired = React.useRef(false);  // 直近のドラッグで切り離したか (click 抑制用)
  React.useEffect(() => {
    function onMove(e) {
      // タブ文字をドラッグ → しきい値超で切り離して floating 化
      if (tearPending.current && !winDrag.current && !winResize.current) {
        const tp = tearPending.current;
        if (Math.abs(e.clientX - tp.sx) + Math.abs(e.clientY - tp.sy) > 5) {
          const id = `fw_${++winSeq.current}`;
          const x = e.clientX - 40, y = e.clientY - 10;
          setFloatWins(ws => [...ws, { id, tab: tp.tab, x, y, w: 320, h: 420 }]);
          winDrag.current = { id, sx: e.clientX, sy: e.clientY, bx: x, by: y };
          tearFired.current = true;
          tearPending.current = null;
          document.body.style.userSelect = "none";
        }
      }
      if (winDrag.current) {
        const d = winDrag.current;
        const nx = d.bx + (e.clientX - d.sx), ny = d.by + (e.clientY - d.sy);
        setFloatWins(ws => ws.map(w => w.id === d.id ? { ...w, x: nx, y: ny } : w));
      } else if (winResize.current) {
        const d = winResize.current;
        const nw = Math.max(240, d.bw + (e.clientX - d.sx)), nh = Math.max(180, d.bh + (e.clientY - d.sy));
        setFloatWins(ws => ws.map(w => w.id === d.id ? { ...w, w: nw, h: nh } : w));
      }
    }
    function onUp() { winDrag.current = null; winResize.current = null; tearPending.current = null; document.body.style.userSelect = ""; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);
  // タブ操作: mousedown で tear 候補をセット、click はドラッグ無し時のみ切替
  function onTabMouseDown(tab, e) { tearPending.current = { tab, sx: e.clientX, sy: e.clientY }; }
  function onTabClick(tab) {
    if (tearFired.current) { tearFired.current = false; return; } // 切り離し直後の click は無視
    setPanelTab(tab); setPaletteMinimized(false);
  }
  const tabLabel = (t) => t === "palette" ? "🧱 パレット" : t === "inspector" ? "🔍 Inspector" : "📄 全文";
  function startWinDrag(id, e) {
    const w = floatWins.find(x => x.id === id); if (!w) return;
    winDrag.current = { id, sx: e.clientX, sy: e.clientY, bx: w.x, by: w.y };
    document.body.style.userSelect = "none";
  }
  function startWinResize(id, e) {
    e.stopPropagation();
    const w = floatWins.find(x => x.id === id); if (!w) return;
    winResize.current = { id, sx: e.clientX, sy: e.clientY, bw: w.w, bh: w.h };
    document.body.style.userSelect = "none";
  }
  // ドックのグリップをドラッグ → アクティブタブを新しい floating ウィンドウに切り離す
  function closeFloatWin(id) { setFloatWins(ws => ws.filter(w => w.id !== id)); }

  // パレットからアイテムを配置 (ドック・floating 双方から呼ぶ)
  function handlePaletteSelect(item) {
    if (item.meta && item.meta.custom && Array.isArray(item.meta.items)) {
      const fnId = item.meta.fnId;
      const fn = (loadCustomFunctions() || []).find(f => f.id === fnId);
      const c = getCanvasCenter();
      const gid = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newGroup = {
        id: gid, type: "group", label: item.title || "マイ関数",
        description: fn?.description || "", color: fn?.color || (item.meta.fnColor || "#7c3aed"),
        shape: fn?.shape || "rounded", collapsed: true,
        items: (fn?.items || item.meta.items || []).map(it => ({ ...it })),
        edges: (fn?.edges || []).map(e => ({ ...e })),
        fnId, x: c.x - 110, y: c.y - 32, w: 220, h: 64,
      };
      setBoardWithHistory(b => ({ ...b, items: [...b.items, newGroup] }));
      setSelectedIds(new Set([gid]));
      return;
    }
    const id = `${item.type || "node"}_${Date.now()}_${itemCounter.current++}`;
    const selectedItems = board.items.filter(it => selectedIds.has(it.id) && (it.type === "node" || it.type === "group"));
    let fromItem = null;
    if (selectedItems.length > 0) {
      fromItem = selectedItems.reduce((a, b) => ((a.y || 0) + (a.h || 60) > (b.y || 0) + (b.h || 60) ? a : b));
    }
    let nx, ny;
    if (fromItem) {
      nx = (fromItem.x || 0) + ((fromItem.w || 180) - 180) / 2;
      ny = (fromItem.y || 0) + (fromItem.h || 60) + 80;
    } else {
      const c = getCanvasCenter(); nx = c.x - 90; ny = c.y - 30;
    }
    const newItem = { id, type: "node", nodeType: item.type, label: item.title, subtitle: item.subtitle || "", meta: item.meta || {}, x: nx, y: ny, w: 180, h: 60 };
    setBoardWithHistory(b => ({ ...b, items: [...b.items, newItem], edges: fromItem ? [...(b.edges || []), { from: fromItem.id, to: id, label: "" }] : b.edges }));
    setSelectedIds(new Set([id]));
  }

  // タブ内容を描画 (ドック・floating ウィンドウ双方で共有)
  function renderPanelContent(tab) {
    if (tab === "inspector") {
      // richInspector: skill編集と同等の DetailBody ベース詳細。編集はボードへ書き戻す。
      if (richInspector) {
        const selItem = board.items.find(it => selectedIds.has(it.id)) || null;
        return <PlanNodeInspector
          item={selItem}
          board={board}
          onPatch={(nodeId, patch) => setBoardWithHistory(b => mergeNodeSettingsIntoBoard(b, nodeId, patch))}
          onJump={(nodeId) => setSelectedIds(new Set([nodeId]))}
          onClose={() => setSelectedIds(new Set())}
        />;
      }
      const sel = board.items.find(it => selectedIds.has(it.id));
      if (!sel) return <div className="plan-panel-body src-view-msg">ノードをクリックすると詳細が出ます。</div>;
      const nt = (window.NODE_TYPES && window.NODE_TYPES[sel.nodeType]) || null;
      const m = sel.meta || {};
      return (
        <div className="plan-panel-body plan-inspector">
          <div className="pi-head">
            {nt && <span className="pi-chip" style={{ background: nt.bg, color: nt.color, borderColor: nt.color }}>{nt.label}</span>}
            <div className="pi-title">{sel.label}</div>
            {sel.subtitle && <div className="pi-sub">{sel.subtitle}</div>}
          </div>
          {Object.keys(m).length > 0 ? (
            <div className="pi-meta">
              {Object.entries(m).filter(([k]) => !["custom","items","fnId","fnColor"].includes(k)).map(([k, v]) => (
                <div key={k} className="pi-meta-row"><span className="pi-meta-k">{k}</span><span className="pi-meta-v">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span></div>
              ))}
            </div>
          ) : <div className="src-view-msg" style={{ padding: 12 }}>設定なし</div>}
        </div>
      );
    }
    if (tab === "fulltext") {
      const sel = board.items.find(it => selectedIds.has(it.id));
      const selNode = sel ? { title: sel.label, meta: sel.meta || {}, config: {} } : null;
      // 編集中はライブプレビュー (board → workflow → preview-source、debounce)
      // frontmatter (name/description) はボードの名前/目的欄から出す。SKILL.md プレビュー用。
      const liveFlow = boardToWorkflow(board, { id: flowId, name: board.name, description: board.desc, source: { type: sourceType || "skill" } });
      return <div className="plan-panel-body" style={{ flex: 1, display: "flex", minHeight: 0 }}><FlowSourceView flowId={flowId} sourceType={sourceType} selectedNode={selNode} liveFlow={liveFlow} /></div>;
    }
    return <ElementsPalette onSelectPaletteItem={handlePaletteSelect} />;
  }
  // 保存/デプロイのトースト表示
  const [toast, setToast] = React.useState(null);  // { icon, text } | null
  const showToast = React.useCallback((icon, text, ms = 2400) => {
    setToast({ icon, text });
    setTimeout(() => setToast(null), ms);
  }, []);
  // 「名前をつけて保存」モーダル
  const [saveAsModal, setSaveAsModal] = React.useState(null);  // { location, name } | null
  const openSaveAsModal = React.useCallback(() => {
    const baseName = (boardRef.current?.name || "untitled").replace(/[\s/]/g, "-");
    const category = saveAsCategory || "saved";
    const location = `${category}/${baseName}/`;
    // 既存バージョン (同一 location prefix) を localStorage から探して、次のバージョン番号を決める
    const prefix = `fi_saveas:${location}`;
    const existing = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          let meta = null;
          try { meta = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
          existing.push({ key, name: key.slice(prefix.length), savedAt: meta?.savedAt || null });
        }
      }
    } catch {}
    existing.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
    // 次のバージョン番号: 既存の `<base>-v<N>` を解析して max + 1
    const vNums = existing.map(e => {
      const m = (e.name || "").match(/-v(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextV = (vNums.length > 0 ? Math.max(...vNums) : 0) + 1;
    setSaveAsModal({
      location,
      name: `${baseName}-v${nextV}`,
      existing,
    });
  }, [saveAsCategory]);
  // mount 直後の空 selectedIds で親を上書きしないよう、初回は emit をスキップ
  const selectionEmitInitRef = React.useRef(true);
  React.useEffect(() => {
    if (selectionEmitInitRef.current) {
      selectionEmitInitRef.current = false;
      // 初回 mount: selectedIds が非空なら親に通知 (controlled モードからの初期値継承用)
      if (selectedIds.size === 0) return;
    }
    if (onSelectionChange) onSelectionChange([...selectedIds]);
  }, [selectedIds]);
  // 親側 (MiniMap / RightPanel 等) からの選択を canvas に反映
  // controlledSelectedId が変わったら内部 selectedIds を更新する。
  // ループ防止: 既に同じ単一選択なら何もしない。
  React.useEffect(() => {
    if (controlledSelectedId === undefined) return;
    if (controlledSelectedId === null) {
      if (selectedIds.size === 0) return;
      setSelectedIds(new Set());
      return;
    }
    if (selectedIds.size === 1 && selectedIds.has(controlledSelectedId)) return;
    setSelectedIds(new Set([controlledSelectedId]));
  }, [controlledSelectedId]);
  const [ctxMenu, setCtxMenu] = React.useState(null); // { x, y, targetId? }
  // PW-6: 関数化ダイアログ
  const [fnDialog, setFnDialog] = React.useState(null); // { items, name, description, category }
  // PW-6: マイ関数ピッカー (再利用)
  const [showFnPicker, setShowFnPicker] = React.useState(false);
  // 接続ハンドルからドラッグ中のドラフトエッジ { fromId, toX, toY }
  const [draftEdge, setDraftEdge] = React.useState(null);
  // group の内部詳細モーダルを開く (group.id) — folded 状態でも中身を見れる
  const [groupDetail, setGroupDetail] = React.useState(null);
  // ドラフトエッジのターゲット候補 (ホバーされた item.id)
  const [edgeTargetId, setEdgeTargetId] = React.useState(null);
  // エッジへの差し込みピッカー { edgeIdx, fromId, toId, screenX, screenY }
  const [edgeInsert, setEdgeInsert] = React.useState(null);
  // エッジ端点の付け替えドラッグ中 { edgeIdx, end: "from" | "to", toX, toY }
  const [edgeReroute, setEdgeReroute] = React.useState(null);
  // 選択中のエッジ idx (Delete キー / ×ボタンで削除可能)
  const [selectedEdgeIdx, setSelectedEdgeIdx] = React.useState(null);
  // ドラッグ中にハイライトされるエッジ idx (E-1)
  const [hoveredEdgeIdxState, _setHoveredEdgeIdxState] = React.useState(null);
  const hoveredEdgeIdxRef = React.useRef(null);
  function setHoveredEdgeIdx(v) {
    hoveredEdgeIdxRef.current = v;
    _setHoveredEdgeIdxState(v);
  }
  const hoveredEdgeIdx = hoveredEdgeIdxState;  // alias for render
  const lastDragOverRef = React.useRef(0);

  // マウス座標 (canvas 空間) から最近接エッジを探す。距離 < threshold なら index を返す
  // excludeNodeId: そのノードが from/to のエッジは候補から除外 (自分自身に挿入は無意味)
  function findClosestEdgeIdx(canvasX, canvasY, threshold = 28, excludeNodeId = null) {
    const edges = board.edges || [];
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (excludeNodeId && (e.from === excludeNodeId || e.to === excludeNodeId)) continue;
      const from = board.items.find(it => it.id === e.from);
      const to = board.items.find(it => it.id === e.to);
      if (!from || !to) continue;
      const fx = (from.x || 0) + (from.w || 180) / 2;
      const fy = (from.y || 0) + (from.h || 60);
      const tx = (to.x || 0) + (to.w || 180) / 2;
      const ty = (to.y || 0);
      // 簡易: ベジエの近似として、3 サンプル点 (1/4, 1/2, 3/4) との距離の最小
      for (const t of [0.25, 0.5, 0.75]) {
        const px = fx + (tx - fx) * t;
        const py = fy + (ty - fy) * t;
        const d = Math.hypot(px - canvasX, py - canvasY);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
    }
    return bestDist < threshold ? bestIdx : null;
  }

  // 既存ノードをエッジ間に挿入: 既存エッジを分割して、ノードを中間に再配置 + 下流押し下げ
  function insertExistingNodeIntoEdge(nodeId, edgeIdx) {
    setBoardWithHistory(b => {
      const edge = (b.edges || [])[edgeIdx];
      if (!edge) return b;
      if (edge.from === nodeId || edge.to === nodeId) return b;  // セルフループ防止
      const from = b.items.find(it => it.id === edge.from);
      const to = b.items.find(it => it.id === edge.to);
      const node = b.items.find(it => it.id === nodeId);
      if (!from || !to || !node) return b;
      // 既に from-node または node-to のエッジがある場合は重複を避ける
      const NODE_H = node.h || 60, V_GAP = 30;
      const PUSH = NODE_H + V_GAP * 2;
      // 新ノード位置: 元 to の真上 (中間配置)
      const newX = ((from.x || 0) + (from.w || 180) / 2 + (to.x || 0) + (to.w || 180) / 2) / 2 - (node.w || 180) / 2;
      const newY = ((from.y || 0) + (from.h || 60) + (to.y || 0)) / 2 - NODE_H / 2;
      const toY = to.y || 0;
      // エッジ更新: 元 from-to を削除し、from-node, node-to を追加 (既存重複は dedup)
      const filteredEdges = (b.edges || []).filter((e, i) => {
        if (i === edgeIdx) return false;
        if (e.from === edge.from && e.to === nodeId) return false;
        if (e.from === nodeId && e.to === edge.to) return false;
        return true;
      });
      filteredEdges.push({ from: edge.from, to: nodeId, label: "" });
      filteredEdges.push({ from: nodeId, to: edge.to, label: "" });
      // ノード位置を更新 + 下流押し下げ (移動するノード自身と from は除外)
      const updatedItems = b.items.map(it => {
        if (it.id === nodeId) return { ...it, x: newX, y: newY };
        if (it.id === edge.from) return it;
        if ((it.y || 0) >= toY) return { ...it, y: (it.y || 0) + PUSH };
        return it;
      });
      return { ...b, items: updatedItems, edges: filteredEdges };
    });
    setSelectedIds(new Set([nodeId]));
  }

  // エッジを削除
  function deleteEdge(idx) {
    setBoardWithHistory(b => ({ ...b, edges: (b.edges || []).filter((_, i) => i !== idx) }));
    setSelectedEdgeIdx(null);
  }

  // エッジ端点を別のノードに付け替え
  function startEdgeReroute(edgeIdx, end, ev) {
    ev.stopPropagation();
    ev.preventDefault();
    const startCanvas = clientToCanvas(ev.clientX, ev.clientY);
    setEdgeReroute({ edgeIdx, end, toX: startCanvas.x, toY: startCanvas.y });
    beginDragHistory();  // ドラッグ開始時にスナップショット
    const onMove = (mv) => {
      const c = clientToCanvas(mv.clientX, mv.clientY);
      setEdgeReroute({ edgeIdx, end, toX: c.x, toY: c.y });
      const el = document.elementFromPoint(mv.clientX, mv.clientY);
      const target = el?.closest("[data-plan-item-id]");
      const targetId = target?.getAttribute("data-plan-item-id");
      setEdgeTargetId(targetId || null);
    };
    const onUp = (up) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const el = document.elementFromPoint(up.clientX, up.clientY);
      const target = el?.closest("[data-plan-item-id]");
      const targetId = target?.getAttribute("data-plan-item-id");
      if (targetId) {
        // 付け替え操作は normal setBoardWithHistory で OK (skipHistoryRef=true なので no-op)
        // 終了時に endDragHistory が1回 push する
        setBoardWithHistory(b => {
          const newEdges = (b.edges || []).map((e, i) => {
            if (i !== edgeIdx) return e;
            const other = end === "from" ? e.to : e.from;
            if (targetId === other) return e;  // 自分自身に繋がるのを防止
            return end === "from" ? { ...e, from: targetId } : { ...e, to: targetId };
          });
          // 重複チェック (同じ from→to が既にある場合は新しい方を捨てる)
          const seen = new Set();
          const uniq = [];
          newEdges.forEach((e, i) => {
            const key = `${e.from}->${e.to}`;
            if (!seen.has(key)) { seen.add(key); uniq.push(e); }
          });
          return { ...b, edges: uniq };
        });
      }
      setEdgeReroute(null);
      setEdgeTargetId(null);
      endDragHistory();  // 1回だけ history に push
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // エッジ間に新ノードを差し込む: from → 新ノード → to に分割
  function insertNodeIntoEdge(itemTemplate) {
    if (!edgeInsert) return;
    const { fromId, toId } = edgeInsert;
    const from = board.items.find(it => it.id === fromId);
    const to = board.items.find(it => it.id === toId);
    if (!from || !to) { setEdgeInsert(null); return; }
    insertNodeBetween(from, to, fromId, toId, itemTemplate);
    setEdgeInsert(null);
  }

  // 共通: from→to のエッジを分割して中間に新ノードを挿入、下流ノードを押し下げる
  function insertNodeBetween(from, to, fromId, toId, itemTemplate) {
    const NODE_H = 60, V_GAP = 30;  // 押し下げ量 = ノード高さ + 上下マージン
    const PUSH = NODE_H + V_GAP * 2;
    // 新ノード位置: from の真下 80px、to の真上 80px の間。スペース確保のため to から PUSH/2 上に配置
    const cx = ((from.x || 0) + (from.w || 180) / 2 + (to.x || 0) + (to.w || 180) / 2) / 2 - 90;
    const cy = ((from.y || 0) + (from.h || 60) + (to.y || 0)) / 2 - 30;
    const id = `node_${Date.now()}_${itemCounter.current++}`;
    const newItem = {
      id, type: "node", nodeType: itemTemplate.type,
      label: itemTemplate.title, subtitle: itemTemplate.subtitle || "",
      meta: itemTemplate.meta || {},
      x: cx, y: cy, w: 180, h: NODE_H,
    };
    // 押し下げ判定: 元の to ノードの y より下にあるノードを全て PUSH 分下げる
    const toY = to.y || 0;
    setBoardWithHistory(b => {
      const newEdges = (b.edges || []).filter(e => !(e.from === fromId && e.to === toId));
      newEdges.push({ from: fromId, to: id, label: "" });
      newEdges.push({ from: id, to: toId, label: "" });
      // 下流ノードを押し下げ — toY 以上にあるノード (to を含む) を PUSH 下げる
      const pushedItems = b.items.map(it => {
        if (it.id === fromId) return it;  // from は動かさない
        if ((it.y || 0) >= toY) return { ...it, y: (it.y || 0) + PUSH };
        return it;
      });
      return { ...b, items: [...pushedItems, newItem], edges: newEdges };
    });
    setSelectedIds(new Set([id]));
  }

  function startHandleDrag(fromId, ev) {
    // mousedown 時の canvas 座標を基点
    const startCanvas = clientToCanvas(ev.clientX, ev.clientY);
    setDraftEdge({ fromId, toX: startCanvas.x, toY: startCanvas.y });
    const onMove = (mv) => {
      const c = clientToCanvas(mv.clientX, mv.clientY);
      setDraftEdge({ fromId, toX: c.x, toY: c.y });
      // ターゲット候補を計算 (マウス位置にあるノード)
      const el = document.elementFromPoint(mv.clientX, mv.clientY);
      const target = el?.closest("[data-plan-item-id]");
      const targetId = target?.getAttribute("data-plan-item-id");
      if (targetId && targetId !== fromId) setEdgeTargetId(targetId);
      else setEdgeTargetId(null);
    };
    const onUp = (up) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      // ドロップ判定
      const el = document.elementFromPoint(up.clientX, up.clientY);
      const target = el?.closest("[data-plan-item-id]");
      const targetId = target?.getAttribute("data-plan-item-id");
      if (targetId && targetId !== fromId) {
        // 既存エッジと重複しなければ追加
        setBoardWithHistory(b => {
          const existing = (b.edges || []).some(e => e.from === fromId && e.to === targetId);
          if (existing) return b;
          return { ...b, edges: [...(b.edges || []), { from: fromId, to: targetId, label: "" }] };
        });
      }
      setDraftEdge(null);
      setEdgeTargetId(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  // マイ関数の再描画用 (CustomEvent をリッスン)
  const [fnVersion, setFnVersion] = React.useState(0);
  React.useEffect(() => {
    const handler = () => setFnVersion(v => v + 1);
    window.addEventListener("fi-custom-functions-changed", handler);
    return () => window.removeEventListener("fi-custom-functions-changed", handler);
  }, []);
  const itemCounter = React.useRef(0);
  const svgRef = React.useRef(null);

  // ── ワークフロー データキャッシュ (サムネ描画用) ──
  // 各フローカードが必要な flowId の workflow データを fetch してキャッシュ
  const [workflowsCache, setWorkflowsCache] = React.useState({});
  React.useEffect(() => {
    const flowIds = [...new Set(board.items.filter(it => it.type === "flow" && it.flowId).map(it => it.flowId))];
    flowIds.forEach(flowId => {
      if (workflowsCache[flowId] || workflowsCache[`${flowId}__loading`]) return;
      setWorkflowsCache(c => ({ ...c, [`${flowId}__loading`]: true }));
      // demo モードなら window.__DEMO_FLOW__ から、それ以外は API fetch
      if (window.__DEMO_MODE__ && window.__DEMO_FLOW__ && window.__DEMO_FLOW__.id === flowId) {
        setWorkflowsCache(c => ({ ...c, [flowId]: window.__DEMO_FLOW__, [`${flowId}__loading`]: false }));
        return;
      }
      fetch(`/api/flows/${flowId}`)
        .then(r => r.ok ? r.json() : null)
        .then(wf => {
          if (wf) setWorkflowsCache(c => ({ ...c, [flowId]: wf, [`${flowId}__loading`]: false }));
          else setWorkflowsCache(c => ({ ...c, [`${flowId}__loading`]: false, [`${flowId}__error`]: true }));
        })
        .catch(() => setWorkflowsCache(c => ({ ...c, [`${flowId}__loading`]: false, [`${flowId}__error`]: true })));
    });
  }, [board.items]);

  // ── キャンバス操作:
  //   tool === "select": 空白ドラッグ = 矩形選択 (マーキー)
  //   tool === "pan":    空白ドラッグ = パン
  //   Space + ドラッグ または 中ボタン または 右ボタン → 一時パン (tool 問わず)
  //   ホイール → ズーム
  // ──
  const [tool, setTool] = React.useState("select"); // "select" | "pan"
  const [marquee, setMarquee] = React.useState(null); // { x0, y0, x1, y1 }
  const [spaceDown, setSpaceDown] = React.useState(false);
  React.useEffect(() => {
    const onKD = (e) => {
      const tag = document.activeElement?.tagName;
      const isEditing = tag === "INPUT" || tag === "TEXTAREA";
      if (isEditing) return;
      if (e.code === "Space") { e.preventDefault(); setSpaceDown(true); }
      else if (e.key === "v" || e.key === "V") setTool("select");
      else if (e.key === "h" || e.key === "H") setTool("pan");
    };
    const onKU = (e) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", onKD);
    window.addEventListener("keyup", onKU);
    return () => { window.removeEventListener("keydown", onKD); window.removeEventListener("keyup", onKU); };
  }, []);

  function clientToCanvas(clientX, clientY) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k };
  }

  function startPan(e) {
    setDragging(true);
    const sx = e.clientX, sy = e.clientY;
    const bx = view.x, by = view.y;
    const onMove = (mv) => setView(v => ({ ...v, x: bx + (mv.clientX - sx), y: by + (mv.clientY - sy) }));
    const onUp = () => { setDragging(false); document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function startMarquee(e) {
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const baseSel = additive ? new Set(selectedIds) : new Set();
    // 空白マーキー開始 → エッジ/ノード選択もクリア (ツールバー閉じる)
    if (!additive) {
      setSelectedEdgeIdx(null);
      setSelectedIds(new Set());
    }
    const start = clientToCanvas(e.clientX, e.clientY);
    setMarquee({ x0: start.x, y0: start.y, x1: start.x, y1: start.y });
    const onMove = (mv) => {
      const cur = clientToCanvas(mv.clientX, mv.clientY);
      const m = { x0: start.x, y0: start.y, x1: cur.x, y1: cur.y };
      setMarquee(m);
      // 矩形と重なるアイテムをハイライト
      const left = Math.min(m.x0, m.x1), right = Math.max(m.x0, m.x1);
      const top = Math.min(m.y0, m.y1), bottom = Math.max(m.y0, m.y1);
      const hit = new Set(baseSel);
      (board.items || []).forEach(it => {
        const iL = it.x || 0, iT = it.y || 0;
        const iR = iL + (it.w || 180), iB = iT + (it.h || 120);
        if (iR >= left && iL <= right && iB >= top && iT <= bottom) hit.add(it.id);
      });
      setSelectedIds(hit);
    };
    const onUp = () => {
      setMarquee(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onCanvasMouseDown(e) {
    if (e.target.closest(".plan-item")) return;
    if (e.target.closest(".plan-floating-toolbar")) return;
    if (e.target.closest(".plan-tool-bar")) return;
    // readOnly: 常にパンモード (マーキー選択は無効)
    if (readOnly) {
      if (e.button === 0 || e.button === 1 || e.button === 2) {
        e.preventDefault();
        startPan(e);
      }
      return;
    }
    // 一時パン: Space, 中ボタン, 右ボタン
    if (spaceDown || e.button === 1 || e.button === 2) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    // ツールに応じて分岐
    if (tool === "pan") startPan(e);
    else startMarquee(e);
  }
  function onCanvasWheel(e) {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return;
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const nk = Math.max(0.25, Math.min(2.5, view.k * factor));
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    setView(v => ({ k: nk, x: mx - (mx - v.x) * (nk / v.k), y: my - (my - v.y) * (nk / v.k) }));
  }

  function getCanvasCenter() {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return { x: (rect.width / 2 - view.x) / view.k, y: (rect.height / 2 - view.y) / view.k };
  }

  // ── アイテム追加 ──
  function addNote() {
    const c = getCanvasCenter();
    const id = `note_${Date.now()}_${itemCounter.current++}`;
    setBoardWithHistory(b => ({
      ...b,
      items: [...b.items, { id, type: "note", x: c.x - 90, y: c.y - 60, w: 180, h: 120, text: "", color: "yellow" }],
    }));
  }

  // ── PW-4: コピー & ペースト ──
  // clipboard データは localStorage + system clipboard 両方に保存
  // 形式: { source: "plan-workspace", items: [...] }
  // toSystemClipboard=false (Cmd+C / カット / 右クリック): localStorage のみに保存する
  //   "普通のコピー操作"。システムクリップボード(他アプリに見える側)は汚さない。
  // toSystemClipboard=true (ツールバーの「コピー」ボタンだけ): JSON をシステムクリップボードにも
  //   書き出す。他タブ・他アプリ・他マシンへ持ち出したいとき用。
  async function copySelectedToClipboard({ toSystemClipboard = false } = {}) {
    if (selectedIds.size === 0) return;
    const items = board.items.filter(it => selectedIds.has(it.id));
    if (items.length === 0) return;
    // 選択範囲の内部エッジ (両端が選択内) も一緒にコピーする。
    // これが無いと、繋がったノードをコピペしたとき接続がバラバラになる。
    const idset = new Set(items.map(it => it.id));
    const edges = (board.edges || []).filter(e => idset.has(e.from) && idset.has(e.to));
    const payload = { source: "plan-workspace", boardId: board.id, items, edges, copiedAt: new Date().toISOString() };
    // localStorage に保存 (同一オリジンの全タブで共有される = アプリ内ペーストはこれで足りる)
    try { localStorage.setItem("fi_plan_clipboard", JSON.stringify(payload)); } catch {}
    if (toSystemClipboard) {
      try { await navigator.clipboard.writeText(JSON.stringify(payload)); } catch {}
    }
  }
  async function pasteFromClipboard() {
    // localStorage と system clipboard の両方を読み、copiedAt が新しい方を採用する。
    // (古い「コピー」ボタンの JSON が system clipboard に残って誤爆するのを防ぐ)
    const candidates = [];
    try {
      const txt = await navigator.clipboard.readText();
      if (txt && txt.trim().startsWith("{")) {
        const parsed = JSON.parse(txt);
        if (parsed && parsed.source === "plan-workspace" && Array.isArray(parsed.items)) candidates.push(parsed);
      }
    } catch {}
    try {
      const raw = localStorage.getItem("fi_plan_clipboard");
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.source === "plan-workspace" && Array.isArray(p.items)) candidates.push(p);
      }
    } catch {}
    if (candidates.length === 0) return;
    candidates.sort((a, b) => new Date(b.copiedAt || 0) - new Date(a.copiedAt || 0));
    const payload = candidates[0];
    if (!payload || !Array.isArray(payload.items)) return;
    // ペースト位置: 元の位置から (40, 40) ずらして、衝突を避ける
    const offset = 40;
    const idMap = {};  // 旧id -> 新id (内部エッジの張り替え用)
    const newItems = payload.items.map(orig => {
      const newId = `${orig.type}_${Date.now()}_${itemCounter.current++}`;
      idMap[orig.id] = newId;
      const copy = { ...orig, id: newId, x: (orig.x || 0) + offset, y: (orig.y || 0) + offset };
      // group の内部アイテム/エッジは id 衝突を避けるため新規採番する
      // (貼り付けた group を後でグループ解除しても元と衝突しない)
      if (orig.type === "group" && Array.isArray(orig.items)) {
        const inner = {};
        copy.items = orig.items.map(ci => {
          const nid = `${ci.type || "node"}_${Date.now()}_${itemCounter.current++}`;
          inner[ci.id] = nid;
          return { ...ci, id: nid };
        });
        copy.edges = (orig.edges || []).filter(e => inner[e.from] && inner[e.to])
          .map(e => ({ ...e, from: inner[e.from], to: inner[e.to] }));
      }
      return copy;
    });
    // 内部エッジを新しい id で再構築する (コピー時に保存した edges を張り直す)
    const newEdges = (payload.edges || [])
      .filter(e => idMap[e.from] && idMap[e.to])
      .map(e => ({ from: idMap[e.from], to: idMap[e.to], label: e.label || "" }));
    setBoardWithHistory(b => ({ ...b, items: [...b.items, ...newItems], edges: [...(b.edges || []), ...newEdges] }));
    setSelectedIds(new Set(newItems.map(it => it.id)));
  }
  function deleteSelected() {
    if (selectedIds.size === 0) return;
    setBoardWithHistory(b => ({
      ...b,
      items: b.items.filter(it => !selectedIds.has(it.id)),
      edges: (b.edges || []).filter(e => !selectedIds.has(e.from) && !selectedIds.has(e.to)),
    }));
    setSelectedIds(new Set());
  }
  function cutSelected() {
    copySelectedToClipboard().then(() => deleteSelected());
  }
  function selectItem(itemId, multi = false) {
    setSelectedIds(prev => {
      if (multi) {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
        return next;
      }
      return new Set([itemId]);
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ── PW-6: 関数化 ──
  // 選択中アイテムをマイ関数 (再利用可能ブロック) として保存
  function openFunctionDialog() {
    if (selectedIds.size === 0) return;
    const items = board.items.filter(it => selectedIds.has(it.id));
    if (items.length === 0) return;
    setFnDialog({
      items,
      name: items.length === 1 && items[0].label ? items[0].label : `マイ関数 ${loadCustomFunctions().length + 1}`,
      description: "",
      category: "マイ関数",
      color: "#7c3aed",
      shape: "rounded",   // "rounded" | "rect" | "pill" | "hex"
      registerAsCustom: true,  // マイ関数として登録するか
    });
  }
  function saveFunction() {
    if (!fnDialog) return;
    const name = (fnDialog.name || "").trim();
    if (!name) { alert("名前を入力してください"); return; }
    const groupItems = fnDialog.items.map(it => ({ ...it }));
    const selectedIdSet = new Set(fnDialog.items.map(it => it.id));
    // 選択範囲のバウンディングボックスを計算 (group 配置位置の起点)
    const xs = groupItems.map(it => it.x || 0);
    const ys = groupItems.map(it => it.y || 0);
    const rs = groupItems.map(it => (it.x || 0) + (it.w || 180));
    const bs = groupItems.map(it => (it.y || 0) + (it.h || 60));
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...rs), maxY = Math.max(...bs);
    const bbW = maxX - minX, bbH = maxY - minY;
    // 内部 items / edges を相対座標に正規化
    const normalizedItems = groupItems.map(it => ({ ...it, x: (it.x || 0) - minX, y: (it.y || 0) - minY }));
    const innerEdges = (board.edges || []).filter(e => selectedIdSet.has(e.from) && selectedIdSet.has(e.to));
    // group アイテムを作成 (折りたたみ表示)
    const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const group = {
      id: groupId, type: "group",
      label: name,
      description: fnDialog.description || "",
      color: fnDialog.color || "#7c3aed",
      shape: fnDialog.shape || "rounded",
      collapsed: true,
      items: normalizedItems,
      edges: innerEdges.map(e => ({ from: e.from, to: e.to, label: e.label || "" })),
      x: minX + bbW / 2 - 110, y: minY + bbH / 2 - 32, w: 220, h: 64,
      // 元の絶対座標バウンディングボックス (展開時に内部を絶対位置で表示する用)
      bbW, bbH,
    };
    // board.items から元アイテムを除去して group を追加。group 外との接続エッジは group.id にリマップ
    setBoardWithHistory(b => {
      const remaining = b.items.filter(it => !selectedIdSet.has(it.id));
      const remappedEdges = (b.edges || []).map(e => {
        const fromInside = selectedIdSet.has(e.from);
        const toInside = selectedIdSet.has(e.to);
        if (fromInside && toInside) return null;             // 内部エッジ → 削除 (group 内に保存済み)
        if (fromInside) return { ...e, from: groupId };
        if (toInside) return { ...e, to: groupId };
        return e;
      }).filter(Boolean);
      return { ...b, items: [...remaining, group], edges: remappedEdges };
    });
    setSelectedIds(new Set([groupId]));
    // マイ関数として登録 (フラグが立っている時)
    if (fnDialog.registerAsCustom) {
      addCustomFunction({
        id: `fn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        description: fnDialog.description || "",
        category: fnDialog.category || "マイ関数",
        icon: "🧩",
        color: fnDialog.color || "#7c3aed",
        shape: fnDialog.shape || "rounded",
        items: normalizedItems,
        edges: innerEdges.map(e => ({ from: e.from, to: e.to, label: e.label || "" })),
        createdAt: new Date().toISOString(),
      });
    }
    setFnDialog(null);
  }

  // マイ関数を再利用: A-1 = 畳まれた group 1 ブロックとして canvas 中心に配置
  // 内部 items / edges は group.items / group.edges に保持される (展開時に SubflowContainer 風に表示)
  function insertFunction(fn) {
    if (!fn || !Array.isArray(fn.items) || fn.items.length === 0) return;
    const c = getCanvasCenter();
    // 内部 items は normalized (相対座標) で保存されている前提。
    // bbW/bbH は 内部 items のサイズから計算 (展開時の SubflowContainer サイズの参考)
    const xs = fn.items.map(it => it.x || 0);
    const ys = fn.items.map(it => it.y || 0);
    const rs = fn.items.map(it => (it.x || 0) + (it.w || 180));
    const bs = fn.items.map(it => (it.y || 0) + (it.h || 60));
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...rs), maxY = Math.max(...bs);
    const bbW = maxX - minX, bbH = maxY - minY;
    // 内部 items / edges を新規 unique ID にリマップ
    // (同じマイ関数を複数回貼り付けても衝突しないよう)
    const idMap = {};
    const newItems = fn.items.map(orig => {
      const newId = `${orig.type || "node"}_${Date.now()}_${itemCounter.current++}`;
      idMap[orig.id] = newId;
      return { ...orig, id: newId };
    });
    const newEdges = (fn.edges || []).map(e => ({
      ...e,
      from: idMap[e.from] || e.from,
      to: idMap[e.to] || e.to,
    }));
    // 畳まれた group として配置 (saveFunction と同じ構造)
    const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const group = {
      id: groupId,
      type: "group",
      label: fn.name || "マイ関数",
      description: fn.description || "",
      color: fn.color || "#7c3aed",
      shape: fn.shape || "rounded",
      collapsed: true,    // A-1: デフォルトで畳まれた状態
      items: newItems,
      edges: newEdges,
      x: c.x - 110, y: c.y - 32, w: 220, h: 64,
      bbW, bbH,
      fnId: fn.id,        // 元のマイ関数 ID (履歴用)
    };
    setBoardWithHistory(b => ({ ...b, items: [...b.items, group] }));
    setSelectedIds(new Set([groupId]));
    setShowFnPicker(false);
  }

  // グループを展開: group はそのまま、collapsed=false に変えて横にサブフローコンテナを表示する
  // 内部 items / edges は group.items / group.edges に保持されたまま、virtual render される
  function expandGroup(groupId) {
    setBoardWithHistory(b => ({
      ...b,
      items: b.items.map(it => it.id === groupId ? { ...it, collapsed: false } : it),
    }));
  }

  // 展開中の group のフレーム (ヘッダー) をドラッグ: group + 全ての子を一緒に動かす
  function startFrameDrag(groupId, ev) {
    const sx = ev.clientX, sy = ev.clientY;
    // 開始時の位置を記録
    const grpStart = board.items.find(it => it.id === groupId);
    if (!grpStart) return;
    const gx0 = grpStart.x || 0, gy0 = grpStart.y || 0;
    const childPositions = board.items
      .filter(it => it.groupId === groupId)
      .map(it => ({ id: it.id, x: it.x || 0, y: it.y || 0 }));
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (mv) => {
      const dx = (mv.clientX - sx) / view.k;
      const dy = (mv.clientY - sy) / view.k;
      setBoardWithHistory(b => {
        const cpById = Object.fromEntries(childPositions.map(c => [c.id, c]));
        return {
          ...b,
          items: b.items.map(it => {
            if (it.id === groupId) return { ...it, x: gx0 + dx, y: gy0 + dy };
            const cp = cpById[it.id];
            if (cp) return { ...it, x: cp.x + dx, y: cp.y + dy };
            return it;
          }),
        };
      });
    };
    const onUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // グループを折りたたみ: collapsed=true に戻すだけ (内部 items は元から group.items に保存されている)
  function collapseGroup(groupId) {
    setBoardWithHistory(b => ({
      ...b,
      items: b.items.map(it => it.id === groupId ? { ...it, collapsed: true } : it),
    }));
  }

  // 外側クリックで選択/エッジ選択を解除 (B-1)
  React.useEffect(() => {
    const onDocMouseDown = (e) => {
      // 選択中の要素・ツールバー・モーダル等の上なら閉じない
      if (e.target.closest(".plan-item")) return;
      if (e.target.closest(".plan-floating-toolbar")) return;
      if (e.target.closest(".plan-tool-bar")) return;
      if (e.target.closest(".plan-edge-insert-btn")) return;
      if (e.target.closest(".plan-edge-del-btn")) return;
      if (e.target.closest(".plan-edge-endpoint")) return;
      if (e.target.closest(".plan-modal-overlay")) return;
      if (e.target.closest(".plan-edge-picker")) return;
      if (e.target.closest(".plan-ctx-overlay")) return;
      if (e.target.closest(".plan-header")) return;  // ヘッダーのボタンクリックは選択保持
      if (e.target.closest(".plan-subflow-header")) return;
      if (e.target.closest(".elements-palette")) return;  // パレットクリックも保持
      if (e.target.closest(".detail")) return;  // RightPanel (ノード詳細) のクリックは選択保持
      if (e.target.closest(".plan-palette-float")) return;  // 浮動ドック (パレット/Inspector/全文・設定/Devボタン含む) のクリックは選択保持
      if (e.target.closest(".plan-float-win")) return;  // 切り離したフローティングウィンドウのクリックも保持
      if (e.target.closest(".plan-chat-panel")) return;  // フロー構築AIチャットのクリックは選択保持
      if (e.target.closest(".plan-chat-fab")) return;
      if (e.target.closest(".ne-tooltip")) return;  // 設定タブの ⓘ ツールチップ
      if (e.target.closest(".plan-edge-g")) return;  // エッジクリックは別ハンドラ
      // 上記以外 (外側) → 選択クリア
      if (selectedIds.size > 0 || selectedEdgeIdx !== null) {
        setSelectedIds(new Set());
        setSelectedEdgeIdx(null);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [selectedIds, selectedEdgeIdx]);

  // キーボードショートカット: Cmd/Ctrl + C / V / X / Backspace + Delete
  React.useEffect(() => {
    const onKey = (e) => {
      // 編集中のテキストフィールドではスキップ
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (meta && e.key === "y") { e.preventDefault(); redo(); return; }
      if (meta && (e.key === "s" || e.key === "S")) {
        // ブラウザ標準の「ページを保存」を常にブロック (onSave 未指定でも)
        e.preventDefault();
        if (onSave) {
          // onSave は同期文字列 or Promise<string> の両方を許容
          Promise.resolve(onSave(boardRef.current)).then(r => showToast("💾", r || "保存しました"));
        }
        return;
      }
      if (meta && e.key === "c") { e.preventDefault(); copySelectedToClipboard(); }
      else if (meta && e.key === "v") { e.preventDefault(); pasteFromClipboard(); }
      else if (meta && e.key === "x") { e.preventDefault(); cutSelected(); }
      else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size > 0) { e.preventDefault(); deleteSelected(); }
        else if (selectedEdgeIdx !== null) { e.preventDefault(); deleteEdge(selectedEdgeIdx); }
      }
      else if (e.key === "Escape") { clearSelection(); setCtxMenu(null); setSelectedEdgeIdx(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIds, selectedEdgeIdx, board, history]);
  // フローのノードをホワイトボードに直接配置 (外枠なし、各ノードが独立アイテム)
  async function addFlowCard(flowMeta) {
    setShowFlowPicker(false);
    // workflow を取得 (demo モード対応)
    let workflow = null;
    if (window.__DEMO_MODE__ && window.__DEMO_FLOW__ && window.__DEMO_FLOW__.id === flowMeta.id) {
      workflow = window.__DEMO_FLOW__;
    } else {
      try {
        const r = await fetch(`/api/flows/${flowMeta.id}`);
        if (r.ok) workflow = await r.json();
      } catch {}
    }
    if (!workflow || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
      alert(`フローの構造を取得できませんでした: ${flowMeta.name}`);
      return;
    }
    // 元 workflow の座標バウンディングボックスを計算して、キャンバス中心に配置
    const xs = workflow.nodes.map(n => n.x || 0);
    const ys = workflow.nodes.map(n => n.y || 0);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const bbW = maxX - minX + 200, bbH = maxY - minY + 100;  // ノードサイズ余裕
    const c = getCanvasCenter();
    const offX = c.x - bbW / 2 - minX;
    const offY = c.y - bbH / 2 - minY;
    // 各ノードを type: "node" として個別配置
    const ts = Date.now();
    const idMap = {};
    const newItems = workflow.nodes.map((n, i) => {
      const newId = `node_${ts}_${itemCounter.current++}`;
      idMap[n.id] = newId;
      return {
        id: newId, type: "node", nodeType: n.type,
        label: n.title, subtitle: n.subtitle || "",
        meta: { desc: n.desc, input: n.input, output: n.output, fromFlow: flowMeta.id, fromNodeId: n.id },
        x: (n.x || 0) + offX - 90, y: (n.y || 0) + offY - 30, w: 180, h: 60,
      };
    });
    // エッジも保存 (描画は後でホワイトボードに矢印で実装)
    const newEdges = (workflow.edges || []).map(e => ({
      from: idMap[e.from], to: idMap[e.to], label: e.label || "",
    })).filter(e => e.from && e.to);
    setBoardWithHistory(b => ({
      ...b,
      items: [...b.items, ...newItems],
      edges: [...(b.edges || []), ...newEdges],
    }));
    setSelectedIds(new Set(newItems.map(it => it.id)));
  }
  function updateItem(itemId, patch) {
    setBoardWithHistory(b => ({ ...b, items: b.items.map(it => it.id === itemId ? { ...it, ...patch } : it) }));
  }
  function removeItem(itemId) {
    setBoardWithHistory(b => ({
      ...b,
      items: b.items.filter(it => it.id !== itemId),
      edges: (b.edges || []).filter(e => e.from !== itemId && e.to !== itemId),
    }));
  }
  // グループ削除: 展開された子も一緒に削除
  function removeGroup(groupId) {
    setBoardWithHistory(b => ({
      ...b,
      items: b.items.filter(it => it.id !== groupId),
      edges: (b.edges || []).filter(e => e.from !== groupId && e.to !== groupId),
    }));
  }

  return (
    <div className={`plan-workspace ${controlled ? "is-controlled" : ""} ${readOnly ? "is-readonly" : ""}`}>
      {/* ヘッダー (controlled モード時は省略可) */}
      {!hideHeader && (
      <div className="plan-header">
        <button className="plan-back" onClick={onBack} title="ダッシュボードへ戻る">←</button>
        <div className="plan-history-btns">
          <button
            className="plan-history-btn"
            disabled={history.past.length === 0}
            onClick={undo}
            title="元に戻す (⌘Z)"
          >⤺</button>
          <button
            className="plan-history-btn"
            disabled={history.future.length === 0}
            onClick={redo}
            title="やり直し (⌘⇧Z)"
          >⤻</button>
        </div>
        <div className="plan-title-area">
          {editingTitle ? (
            <input
              autoFocus
              className="plan-title-input"
              value={board.name}
              onChange={(e) => setBoardWithHistory(b => ({ ...b, name: e.target.value }))}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => { if (e.key === "Enter") setEditingTitle(false); }}
            />
          ) : (
            <div className="plan-title" onClick={() => setEditingTitle(true)} title="クリックで編集">{board.name}</div>
          )}
          <div className="plan-subtitle">{board.items.length} 個のアイテム</div>
        </div>
        <div className="plan-header-hints" title="ショートカット">
          {selectedIds.size > 0 && <span className="plan-hint-badge">{selectedIds.size} 選択中</span>}
          <span className="plan-hint">V=選択 / H=パン · Space+ドラッグ=一時パン · ⌘C/V/X · Delete</span>
        </div>
        <div className="plan-header-actions">
          <button className="plan-btn" onClick={addNote} title="ふせんメモを追加">📝 メモ追加</button>
          <button className="plan-btn" onClick={() => setShowFnPicker(true)} title="保存済みマイ関数を呼び出す">🧩 マイ関数</button>
          <button className="plan-btn plan-btn-primary" onClick={() => setShowFlowPicker(true)} title="フローカードを追加">+ フロー追加</button>
          {/* 保存系ボタン (編集モード時のみ) */}
          {(onSave || onSaveAs || onDeployTest) && (
            <span className="plan-header-divider" aria-hidden="true" />
          )}
          {onSave && (
            <button
              className="plan-btn plan-btn-save"
              onClick={() => {
                // onSave は同期 string or Promise<string> どちらも受け入れる
                Promise.resolve(onSave(board)).then(r => showToast("💾", r || "保存しました"));
              }}
              title="現在の編集を保存 (⌘S)"
            >💾 保存</button>
          )}
          {onSaveAs && (
            <button
              className="plan-btn"
              onClick={openSaveAsModal}
              title="保存先 (フォルダ + ファイル名) を指定して保存"
            >📋 名前をつけて保存</button>
          )}
          {onDeployTest && (
            <button
              className="plan-btn plan-btn-deploy"
              onClick={() => {
                const r = onDeployTest(board);
                showToast("▶", r || "デプロイテストを実行しました");
              }}
              title="現在の編集内容で .claude/ にテスト書き出し（バックエンド未実装：トーストでプレビューのみ）"
              style={{ opacity: 0.65 }}
            >▶ デプロイテスト <span style={{ fontSize: "0.8em", opacity: 0.75 }}>(未実装)</span></button>
          )}
          {onEval && (
            <button
              className="plan-btn plan-btn-eval"
              onClick={() => onEval(board)}
              title="Eval ワークベンチを開く (バリエーション間のスコア比較)"
            >⚖ Eval</button>
          )}
        </div>
      </div>
      )}

      {/* ボディ: 左パレット + キャンバス (floatingPalette のときはパレットを浮動表示) */}
      <div className={`plan-body ${floatingPalette ? "has-floating-palette" : ""}`}>
      {/* 左パレット (controlled モード時は省略可) */}
      {!hidePalette && (
      <div
        className={`${floatingPalette ? "plan-palette-float" : "plan-palette-fixed"} ${paletteMinimized ? "is-minimized" : ""} ${richInspector ? "is-wide" : ""}`}
      >
        {floatingPalette && (
          <div className="plan-palette-head">
            <div className="plan-panel-tabs">
              <button className={`plan-panel-tab ${panelTab === "palette" ? "is-active" : ""}`} onMouseDown={(e) => onTabMouseDown("palette", e)} onClick={() => onTabClick("palette")} title="クリックで切替 / ドラッグで切り離し">🧱 パレット</button>
              <button className={`plan-panel-tab ${panelTab === "inspector" ? "is-active" : ""}`} onMouseDown={(e) => onTabMouseDown("inspector", e)} onClick={() => onTabClick("inspector")} title="クリックで切替 / ドラッグで切り離し">🔍 Inspector</button>
              <button className={`plan-panel-tab ${panelTab === "fulltext" ? "is-active" : ""}`} onMouseDown={(e) => onTabMouseDown("fulltext", e)} onClick={() => onTabClick("fulltext")} title="クリックで切替 / ドラッグで切り離し">📄 全文</button>
            </div>
            <button
              className="plan-palette-toggle"
              onClick={() => setPaletteMinimized(m => !m)}
              title={paletteMinimized ? "展開 (+)" : "最小化 (−)"}
            >{paletteMinimized ? "+" : "−"}</button>
          </div>
        )}
        {!paletteMinimized && (floatingPalette ? renderPanelContent(panelTab) : renderPanelContent("palette"))}
      </div>
      )}

      {/* 切り離した floating ウィンドウ群 */}
      {floatWins.map(win => (
        <div
          key={win.id}
          className="plan-float-win"
          style={{ left: win.x, top: win.y, width: win.w, height: win.h }}
        >
          <div className="plan-palette-head">
            <span className="plan-panel-grip" onMouseDown={(e) => startWinDrag(win.id, e)} title="ドラッグで移動">⠿</span>
            <span className="plan-float-win-title">{tabLabel(win.tab)}</span>
            <button className="plan-palette-toggle" onClick={() => closeFloatWin(win.id)} title="閉じる">×</button>
          </div>
          {renderPanelContent(win.tab)}
          <div className="plan-panel-resize" onMouseDown={(e) => startWinResize(win.id, e)} title="ドラッグでサイズ変更" />
        </div>
      ))}

      {/* キャンバス */}
      <div
        ref={svgRef}
        className={`plan-canvas tool-${tool} ${dragging ? "is-dragging" : ""} ${spaceDown ? "is-pan-mode" : ""} ${marquee ? "is-marquee" : ""}`}
        onMouseDown={onCanvasMouseDown}
        onWheel={onCanvasWheel}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("application/x-flow-element")) return;
          e.preventDefault(); e.dataTransfer.dropEffect = "copy";
          // throttle 16ms (E-1)
          const now = Date.now();
          if (now - lastDragOverRef.current < 16) return;
          lastDragOverRef.current = now;
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          const cx = (e.clientX - rect.left - view.x) / view.k;
          const cy = (e.clientY - rect.top - view.y) / view.k;
          const idx = findClosestEdgeIdx(cx, cy);
          setHoveredEdgeIdx(idx);
        }}
        onDragLeave={() => setHoveredEdgeIdx(null)}
        onDrop={(e) => {
          const data = e.dataTransfer.getData("application/x-flow-element");
          if (!data) { setHoveredEdgeIdx(null); return; }
          e.preventDefault();
          try {
            const payload = JSON.parse(data);
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = (e.clientX - rect.left - view.x) / view.k;
            const y = (e.clientY - rect.top - view.y) / view.k;
            // E-1: エッジハイライト中なら分割挿入 (マイ関数は通常 drop)
            const isCustom = payload.meta && payload.meta.custom;
            if (hoveredEdgeIdx !== null && !isCustom) {
              const edge = (board.edges || [])[hoveredEdgeIdx];
              const from = board.items.find(it => it.id === edge.from);
              const to = board.items.find(it => it.id === edge.to);
              if (from && to) {
                insertNodeBetween(from, to, edge.from, edge.to, payload);
              }
              setHoveredEdgeIdx(null);
              return;
            }
            setHoveredEdgeIdx(null);
            // マイ関数 (composite) の場合は collapsed=true の1ブロックで配置
            if (payload.meta && payload.meta.custom && Array.isArray(payload.meta.items)) {
              const fnId = payload.meta.fnId;
              const fn = (loadCustomFunctions() || []).find(f => f.id === fnId);
              const gid = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              const newGroup = {
                id: gid, type: "group",
                label: payload.title || "マイ関数",
                description: fn?.description || "",
                color: fn?.color || (payload.meta.fnColor || "#7c3aed"),
                shape: fn?.shape || "rounded",
                collapsed: true,
                items: (fn?.items || payload.meta.items || []).map(it => ({ ...it })),
                edges: (fn?.edges || []).map(e => ({ ...e })),
                fnId,
                x: x - 110, y: y - 32, w: 220, h: 64,
              };
              setBoardWithHistory(b => ({ ...b, items: [...b.items, newGroup] }));
              setSelectedIds(new Set([gid]));
              return;
            }
            // 通常の単発要素
            const id = `${payload.type || "node"}_${Date.now()}_${itemCounter.current++}`;
            setBoardWithHistory(b => ({
              ...b,
              items: [...b.items, {
                id, type: "node", nodeType: payload.type, label: payload.title,
                subtitle: payload.subtitle || "", meta: payload.meta || {},
                x: x - 90, y: y - 30, w: 180, h: 60,
              }],
            }));
          } catch (err) { console.warn("drop parse failed", err); }
        }}
        onContextMenu={(e) => {
          // 右クリックドラッグはパンに使うので、押下したまま動かなかった場合だけメニューを開く
          if (!e.target.closest(".plan-item") && !dragging) {
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY, targetId: null });
          }
        }}
      >
        {/* グリッド背景 */}
        <svg className="plan-grid" width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <defs>
            <pattern id="plan-grid-pattern" width={40 * view.k} height={40 * view.k} patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x % (40 * view.k)},${view.y % (40 * view.k)})`}>
              <circle cx={20 * view.k} cy={20 * view.k} r="0.8" fill="var(--bd-2)" opacity="0.6" />
            </pattern>
            {/* タイプ別の矢印先端 */}
            {Object.entries(window.NODE_TYPES || {}).map(([k, t]) => (
              <marker key={k} id={`plan-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={t.color} />
              </marker>
            ))}
            {/* group 用 (各 group の色ごとに動的 marker) */}
            {board.items.filter(it => it.type === "group").map(g => (
              <marker key={g.id} id={`plan-arrow-group-${g.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={g.color || "#7c3aed"} />
              </marker>
            ))}
            <marker id="plan-arrow-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#plan-grid-pattern)" />
          {/* エッジ描画レイヤー (ノード間矢印 — 色付き + フローアニメーション) */}
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {(board.edges || []).map((e, i) => {
              const from = board.items.find(it => it.id === e.from);
              const to = board.items.find(it => it.id === e.to);
              if (!from || !to) return null;
              const fx = (from.x || 0) + (from.w || 180) / 2;
              const fy = (from.y || 0) + (from.h || 60);
              const tx = (to.x || 0) + (to.w || 180) / 2;
              const ty = (to.y || 0);
              const dy = ty - fy;
              const cy = Math.max(20, Math.abs(dy) * 0.45);
              const d = `M ${fx} ${fy} C ${fx} ${fy + cy}, ${tx} ${ty - cy}, ${tx} ${ty}`;
              // to ノードのタイプ色で矢印を着色 (group の場合はその color、それ以外は NODE_TYPES から)
              const NT = window.NODE_TYPES || {};
              const toType = to.type === "group" ? null : to.nodeType;
              const color = to.type === "group" ? (to.color || "#7c3aed") : (NT[toType]?.color || "#94a3b8");
              const markerId = to.type === "group"
                ? `plan-arrow-group-${to.id}`
                : (toType && NT[toType] ? `plan-arrow-${toType}` : "plan-arrow-default");
              const midX = (fx + tx) / 2;
              const midY = (fy + ty) / 2;
              const isBeingRerouted = edgeReroute && edgeReroute.edgeIdx === i;
              const isSelected = selectedEdgeIdx === i;
              const isHovered = hoveredEdgeIdx === i;
              return (
                <g key={i} className={`plan-edge-g ${isSelected ? "is-selected" : ""} ${isHovered ? "is-drop-target" : ""}`}>
                  {/* クリック判定用の太い透明 path */}
                  <path
                    d={d} fill="none"
                    stroke="transparent" strokeWidth="12"
                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                    onClick={(ev) => { ev.stopPropagation(); setSelectedEdgeIdx(i); setSelectedIds(new Set()); }}
                  />
                  {/* ドロップターゲット時の halo */}
                  {isHovered && (
                    <path d={d} fill="none" stroke="#2563eb" strokeWidth="10" opacity="0.3" />
                  )}
                  {/* 選択中の halo */}
                  {isSelected && (
                    <path d={d} fill="none" stroke={color} strokeWidth="6" opacity="0.25" />
                  )}
                  {/* 背景の薄い線 (流れアニメと重ねる) */}
                  <path d={d} fill="none" stroke={color} strokeWidth={isSelected ? 3 : 2.2} opacity={isBeingRerouted ? 0.1 : (isSelected ? 0.5 : 0.25)} />
                  {/* メインの動く線 (リルート中は薄く / ドロップターゲット時は青く) */}
                  <path
                    d={d} fill="none"
                    stroke={isHovered ? "#2563eb" : color} strokeWidth={isHovered ? 3 : (isSelected ? 2.4 : 1.8)}
                    strokeDasharray="6 6"
                    markerEnd={`url(#${markerId})`}
                    className="plan-edge-flow"
                    opacity={isBeingRerouted ? 0.3 : 0.95}
                  />
                  {e.label && (
                    <text x={midX} y={midY - 10} fill={color} fontSize="11" fontWeight="600" fontFamily="Geist, sans-serif" textAnchor="middle"
                      style={{ paintOrder: "stroke", stroke: "var(--bg-1)", strokeWidth: 3 }}>
                      {e.label}
                    </text>
                  )}
                  {/* エッジ中央の + ボタン (差し込み) — 常時表示。選択時は + の左に × も並べる */}
                  <g
                    className={`plan-edge-insert-btn ${isSelected ? "is-active" : ""}`}
                    transform={`translate(${midX + (isSelected ? 14 : 0)},${midY})`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEdgeInsert({
                        fromId: e.from, toId: e.to,
                        screenX: ev.clientX, screenY: ev.clientY,
                      });
                    }}
                  >
                    <circle r="11" fill="var(--bg-1)" stroke={color} strokeWidth="1.6" />
                    <text textAnchor="middle" dominantBaseline="central" fill={color} fontSize="15" fontWeight="700" style={{ pointerEvents: "none" }}>+</text>
                  </g>
                  {isSelected && (
                    <g
                      className="plan-edge-del-btn"
                      transform={`translate(${midX - 14},${midY})`}
                      onClick={(ev) => { ev.stopPropagation(); deleteEdge(i); }}
                    >
                      <circle r="11" fill="#dc2626" stroke="white" strokeWidth="2" />
                      <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="15" fontWeight="700" style={{ pointerEvents: "none" }}>×</text>
                    </g>
                  )}
                  {/* エッジ端点ハンドル (from / to) — ドラッグで付け替え */}
                  <circle
                    className="plan-edge-endpoint"
                    cx={fx} cy={fy} r="6"
                    fill="var(--bg-1)" stroke={color} strokeWidth="1.5"
                    onMouseDown={(ev) => startEdgeReroute(i, "from", ev)}
                  />
                  <circle
                    className="plan-edge-endpoint"
                    cx={tx} cy={ty} r="6"
                    fill="var(--bg-1)" stroke={color} strokeWidth="1.5"
                    onMouseDown={(ev) => startEdgeReroute(i, "to", ev)}
                  />
                </g>
              );
            })}
            {/* ドラフトエッジ (接続ハンドルからのドラッグ中) */}
            {draftEdge && (() => {
              const from = board.items.find(it => it.id === draftEdge.fromId);
              if (!from) return null;
              const fx = (from.x || 0) + (from.w || 180) / 2;
              const fy = (from.y || 0) + (from.h || 60);
              const tx = draftEdge.toX, ty = draftEdge.toY;
              const dy = ty - fy;
              const cy = Math.max(20, Math.abs(dy) * 0.45);
              const d = `M ${fx} ${fy} C ${fx} ${fy + cy}, ${tx} ${ty - cy}, ${tx} ${ty}`;
              return (
                <g>
                  <path d={d} fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="6 6" markerEnd="url(#plan-arrow-default)" opacity="0.9" />
                </g>
              );
            })()}
            {/* エッジ付け替え中のプレビュー線 */}
            {edgeReroute && (() => {
              const e = (board.edges || [])[edgeReroute.edgeIdx];
              if (!e) return null;
              const anchor = edgeReroute.end === "from"
                ? board.items.find(it => it.id === e.to)
                : board.items.find(it => it.id === e.from);
              if (!anchor) return null;
              // 固定端の座標
              const ax = (anchor.x || 0) + (anchor.w || 180) / 2;
              const ay = edgeReroute.end === "from"
                ? (anchor.y || 0)
                : (anchor.y || 0) + (anchor.h || 60);
              // ドラッグ中端の座標
              const dx = edgeReroute.toX, dy = edgeReroute.toY;
              // 描画方向 (from→to): from が固定なら from→マウス、to が固定ならマウス→to
              const sx = edgeReroute.end === "from" ? dx : ax;
              const sy = edgeReroute.end === "from" ? dy : ay;
              const ex = edgeReroute.end === "from" ? ax : dx;
              const ey = edgeReroute.end === "from" ? ay : dy;
              const dyP = ey - sy;
              const cy = Math.max(20, Math.abs(dyP) * 0.45);
              const d = `M ${sx} ${sy} C ${sx} ${sy + cy}, ${ex} ${ey - cy}, ${ex} ${ey}`;
              return (
                <path d={d} fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="6 6" markerEnd="url(#plan-arrow-default)" opacity="0.9" />
              );
            })()}
          </g>
        </svg>

        {/* アイテム描画コンテナ (view 適用) */}
        <div className="plan-items-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}>
          {/* 展開中の group は z 順で最背面に置く (子 node より後ろ) */}
          {[...board.items].sort((a, b) => {
            const ae = a.type === "group" && a.collapsed === false ? 0 : 1;
            const be = b.type === "group" && b.collapsed === false ? 0 : 1;
            return ae - be;
          }).map(item => {
            if (item.type === "flow") return <PlanFlowCard
              key={item.id}
              item={item}
              flowList={flowList}
              workflow={workflowsCache[item.flowId]}
              loading={workflowsCache[`${item.flowId}__loading`]}
              viewK={view.k}
              isSelected={selectedIds.has(item.id)}
              readOnly={readOnly}
              onChange={(p) => updateItem(item.id, p)}
              onRemove={() => removeItem(item.id)}
              onOpenFlow={onOpenFlow}
              onSelect={(multi) => selectItem(item.id, multi)}
              onContextMenu={(x, y) => setCtxMenu({ x, y, targetId: item.id })}
              onDragBegin={beginDragHistory}
              onDragEnd={endDragHistory}
            />;
            if (item.type === "group") return <PlanGroupCard
              key={item.id}
              item={item}
              viewK={view.k}
              isSelected={selectedIds.has(item.id)}
              isEdgeTarget={edgeTargetId === item.id}
              readOnly={readOnly}
              onChange={(p) => updateItem(item.id, p)}
              onRemove={() => removeGroup(item.id)}
              onSelect={(multi) => selectItem(item.id, multi)}
              onContextMenu={(x, y) => setCtxMenu({ x, y, targetId: item.id })}
              onExpand={() => expandGroup(item.id)}
              onCollapse={() => collapseGroup(item.id)}
              onHandleDragStart={startHandleDrag}
              onDragBegin={beginDragHistory}
              onDragEnd={endDragHistory}
              onOpenDetail={() => setGroupDetail(item.id)}
              onDragMoveOver={(id, cx, cy) => {
                const idx = findClosestEdgeIdx(cx, cy, 36, id);
                setHoveredEdgeIdx(idx);
              }}
              onDragDropMaybeInsert={(id) => {
                const idx = hoveredEdgeIdxRef.current;
                if (idx !== null && idx !== undefined) {
                  insertExistingNodeIntoEdge(id, idx);
                }
                setHoveredEdgeIdx(null);
              }}
            />;
            if (item.type === "node") return <PlanNodeCard
              key={item.id}
              item={item}
              viewK={view.k}
              isSelected={selectedIds.has(item.id)}
              isEdgeTarget={edgeTargetId === item.id}
              readOnly={readOnly}
              onChange={(p) => updateItem(item.id, p)}
              onRemove={() => removeItem(item.id)}
              onSelect={(multi) => selectItem(item.id, multi)}
              onContextMenu={(x, y) => setCtxMenu({ x, y, targetId: item.id })}
              onHandleDragStart={startHandleDrag}
              onDragBegin={beginDragHistory}
              onDragEnd={endDragHistory}
              onDragMoveOver={(id, cx, cy) => {
                const idx = findClosestEdgeIdx(cx, cy, 36, id);
                setHoveredEdgeIdx(idx);
              }}
              onDragDropMaybeInsert={(id) => {
                const idx = hoveredEdgeIdxRef.current;
                if (idx !== null && idx !== undefined) {
                  insertExistingNodeIntoEdge(id, idx);
                }
                setHoveredEdgeIdx(null);
              }}
            />;
            return <PlanNote
              key={item.id}
              item={item}
              viewK={view.k}
              isSelected={selectedIds.has(item.id)}
              readOnly={readOnly}
              onChange={(p) => updateItem(item.id, p)}
              onRemove={() => removeItem(item.id)}
              onSelect={(multi) => selectItem(item.id, multi)}
              onContextMenu={(x, y) => setCtxMenu({ x, y, targetId: item.id })}
              onDragBegin={beginDragHistory}
              onDragEnd={endDragHistory}
            />;
          })}
          {/* 展開中のグループのサブフローコンテナ (横に展開) */}
          {board.items.filter(it => it.type === "group" && it.collapsed === false).map(grp => (
            <PlanSubflowContainer
              key={`sf-${grp.id}`}
              group={grp}
              onCollapse={() => collapseGroup(grp.id)}
              onSelectNode={(id) => { setSelectedIds(new Set([id])); if (onSelectionChange) onSelectionChange([id]); }}
            />
          ))}
        </div>

        {/* 空キャンバスメッセージ */}
        {board.items.length === 0 && (
          <div className="plan-empty">
            <div className="plan-empty-title">プランニング ホワイトボード</div>
            <div className="plan-empty-desc">
              このボードで <strong>1 つのロジックを最適化</strong>するため、<br/>
              複数のバリエーションを並べて比較できます。
            </div>
            <div className="plan-empty-tips">
              <div>📝 <strong>「メモ追加」</strong>で目的・想定・メモを書く</div>
              <div>＋ <strong>「フロー追加」</strong>で既存ワークフローをカードとして配置</div>
              <div style={{ marginTop: 6, color: "var(--tx-4)", fontSize: 11 }}>
                空白をドラッグ = 矩形選択 ・ Space + ドラッグ = パン
              </div>
            </div>
          </div>
        )}

        {/* 矩形選択 (マーキー) の可視化 */}
        {marquee && (() => {
          const left = Math.min(marquee.x0, marquee.x1) * view.k + view.x;
          const top = Math.min(marquee.y0, marquee.y1) * view.k + view.y;
          const w = Math.abs(marquee.x1 - marquee.x0) * view.k;
          const h = Math.abs(marquee.y1 - marquee.y0) * view.k;
          return (
            <div
              className="plan-marquee"
              style={{ left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` }}
            />
          );
        })()}

        {/* 選択範囲のフローティングツールバー */}
        {selectedIds.size > 0 && !marquee && (() => {
          // 選択アイテムのバウンディングボックスを計算 → ツールバーを上中央に配置
          const items = board.items.filter(it => selectedIds.has(it.id));
          if (items.length === 0) return null;
          const xs = items.map(it => it.x || 0);
          const ys = items.map(it => it.y || 0);
          const rs = items.map(it => (it.x || 0) + (it.w || 180));
          const bs = items.map(it => (it.y || 0) + (it.h || 120));
          const minX = Math.min(...xs), minY = Math.min(...ys);
          const maxX = Math.max(...rs);
          const left = ((minX + maxX) / 2) * view.k + view.x;
          const top = minY * view.k + view.y;
          // メモ (note) のみの選択ではグループ化を出さない (関数化はノード/グループ用)
          const hasGroupableItems = items.some(it => it.type === "node" || it.type === "group");
          return (
            <div
              className="plan-floating-toolbar"
              style={{ left: `${left}px`, top: `${top - 44}px` }}
              onMouseDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
            >
              <span className="plan-fl-badge">{selectedIds.size}</span>
              {hasGroupableItems && (
                <button className="plan-fl-btn" onClick={openFunctionDialog} title="選択範囲を1つの□にグループ化 (関数化)">
                  <span className="plan-fl-icon">🧩</span>
                  <span className="plan-fl-label">グループ化</span>
                </button>
              )}
              {hasGroupableItems && (() => {
                const openSave = (kind) => {
                  const selItems = board.items.filter(it => selectedIds.has(it.id));
                  const ids = new Set(selItems.map(it => it.id));
                  const selEdges = (board.edges || []).filter(e => ids.has(e.from) && ids.has(e.to));
                  setSkillSave({ items: selItems, edges: selEdges, kind });
                };
                return (
                  <>
                    <button className="plan-fl-btn" onClick={() => openSave("skill")} title="選択範囲をスキル(SKILL.md)として保存 — 不足があれば警告します">
                      <span className="plan-fl-icon">★</span>
                      <span className="plan-fl-label">スキルとして保存</span>
                    </button>
                    <button className="plan-fl-btn" onClick={() => openSave("command")} title="選択範囲をスラッシュコマンド(commands/&lt;name&gt;.md)として保存">
                      <span className="plan-fl-icon">/</span>
                      <span className="plan-fl-label">コマンドとして保存</span>
                    </button>
                  </>
                );
              })()}
              <button className="plan-fl-btn" onClick={() => copySelectedToClipboard({ toSystemClipboard: true })} title="JSONとしてクリップボードにコピー (他タブ・他アプリへ貼り付け可能)">
                <span className="plan-fl-icon">⧉</span>
                <span className="plan-fl-label">JSONコピー</span>
              </button>
              <button className="plan-fl-btn" onClick={() => cutSelected()} title="切り取り (⌘X)">
                <span className="plan-fl-icon">✂</span>
              </button>
              <button className="plan-fl-btn is-danger" onClick={deleteSelected} title="削除 (Delete)">
                <span className="plan-fl-icon">🗑</span>
              </button>
              <button className="plan-fl-btn-close" onClick={clearSelection} title="選択解除 (Esc)">×</button>
            </div>
          );
        })()}

        {/* ツール切替バー (Figma 風: 矢印=選択 / 手=パン) */}
        <div className="plan-tool-bar" onMouseDown={(e) => e.stopPropagation()}>
          <button
            className={`plan-tool-btn ${tool === "select" ? "is-active" : ""}`}
            onClick={() => setTool("select")}
            title="選択ツール (V) — ドラッグで矩形選択"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.5 3.21V20.79c0 .45.54.67.85.35l4.86-4.86h7.13c.45 0 .67-.54.35-.85L6.35 2.86c-.31-.31-.85-.09-.85.35z"/>
            </svg>
          </button>
          <button
            className={`plan-tool-btn ${tool === "pan" ? "is-active" : ""}`}
            onClick={() => setTool("pan")}
            title="手のひらツール (H) — ドラッグでキャンバス移動"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 0 0-4 0v5"/>
              <path d="M14 10V4a2 2 0 0 0-4 0v6"/>
              <path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </button>
        </div>

        {/* ズームコントロール */}
        <div className="plan-zoom-ctrl">
          <button onClick={() => setView(v => ({ ...v, k: Math.min(2.5, v.k * 1.2) }))}>+</button>
          <button onClick={() => setView(v => ({ ...v, k: Math.max(0.25, v.k * 0.8) }))}>−</button>
          <button onClick={() => setView({ x: 0, y: 0, k: 1 })} title="リセット">⊙</button>
          <span className="plan-zoom-label">{Math.round(view.k * 100)}%</span>
        </div>
      </div>
      </div>

      {/* エッジ差し込みピッカー */}
      {edgeInsert && (() => {
        // + ボタン位置の右側にポップアップ、画面端でフリップ
        const PICKER_W = 320;
        const PICKER_H = 460;
        const RIGHT_OFFSET = 20;  // + ボタンから右へ
        let left = edgeInsert.screenX + RIGHT_OFFSET;
        let top = edgeInsert.screenY - 30;
        if (left + PICKER_W > window.innerWidth - 8) {
          // 右に出せない → 左にフリップ
          left = edgeInsert.screenX - PICKER_W - RIGHT_OFFSET;
        }
        if (left < 8) left = 8;
        if (top + PICKER_H > window.innerHeight - 8) top = window.innerHeight - PICKER_H - 8;
        if (top < 8) top = 8;
        return (
        <div
          className="plan-edge-picker"
          style={{ left, top }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="plan-edge-picker-head">
            <span>＋ ここに要素を差し込む</span>
            <button onClick={() => setEdgeInsert(null)} title="閉じる">×</button>
          </div>
          <div className="plan-edge-picker-body">
            <NodePickerList onPick={(item) => insertNodeIntoEdge(item)} />
          </div>
        </div>
        );
      })()}

      {/* 右クリックメニュー */}
      {ctxMenu && (
        <div className="plan-ctx-overlay" onMouseDown={() => setCtxMenu(null)} onContextMenu={(e) => e.preventDefault()}>
          <div className="plan-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onMouseDown={(e) => e.stopPropagation()}>
            {ctxMenu.targetId ? (
              <>
                <button className="plan-ctx-item" onClick={() => {
                  // 対象アイテムを選択状態にして実行
                  if (!selectedIds.has(ctxMenu.targetId)) setSelectedIds(new Set([ctxMenu.targetId]));
                  setTimeout(() => { copySelectedToClipboard(); setCtxMenu(null); }, 0);
                }}>
                  <span className="plan-ctx-icon">⌘C</span>
                  <span>コピー</span>
                </button>
                <button className="plan-ctx-item" onClick={() => {
                  if (!selectedIds.has(ctxMenu.targetId)) setSelectedIds(new Set([ctxMenu.targetId]));
                  setTimeout(() => { cutSelected(); setCtxMenu(null); }, 0);
                }}>
                  <span className="plan-ctx-icon">⌘X</span>
                  <span>切り取り</span>
                </button>
                <button className="plan-ctx-item" onClick={() => { pasteFromClipboard(); setCtxMenu(null); }}>
                  <span className="plan-ctx-icon">⌘V</span>
                  <span>ペースト</span>
                </button>
                <div className="plan-ctx-divider" />
                <button className="plan-ctx-item plan-ctx-danger" onClick={() => {
                  if (!selectedIds.has(ctxMenu.targetId)) setSelectedIds(new Set([ctxMenu.targetId]));
                  setTimeout(() => { deleteSelected(); setCtxMenu(null); }, 0);
                }}>
                  <span className="plan-ctx-icon">⌫</span>
                  <span>削除</span>
                </button>
              </>
            ) : (
              <>
                <button className="plan-ctx-item" onClick={() => { pasteFromClipboard(); setCtxMenu(null); }}>
                  <span className="plan-ctx-icon">⌘V</span>
                  <span>ここにペースト</span>
                </button>
                <button className="plan-ctx-item" onClick={() => { addNote(); setCtxMenu(null); }}>
                  <span className="plan-ctx-icon">📝</span>
                  <span>メモ追加</span>
                </button>
                <button className="plan-ctx-item" onClick={() => { setShowFlowPicker(true); setCtxMenu(null); }}>
                  <span className="plan-ctx-icon">+</span>
                  <span>フロー追加</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* フロー構築AIチャット: 右下FAB → 開くとパネル (編集時のみ) */}
      {flowChat && !readOnly && (
        chatOpen ? (
          <FlowBuildChat
            board={board}
            flowMeta={{ id: flowId, sourceType }}
            onApplyActions={(actions) => {
              const res = applyFlowActions(boardRef.current, actions);
              setBoardWithHistory(() => res.board);
              showToast("🛠", `${res.summary.length} 件の操作を適用しました`);
            }}
            onClose={() => setChatOpen(false)}
          />
        ) : (
          <button className="plan-chat-fab" onClick={() => setChatOpen(true)} title="フロー構築AIチャット">💬</button>
        )
      )}

      {/* スキルとして保存フロー: 検証 → 保存 → 前提共有チャット */}
      {skillSave && (
        <SkillSaveFlow
          subgraph={skillSave}
          kind={skillSave.kind || "skill"}
          flowMeta={{ name: board.name, desc: board.desc, sourceType }}
          onClose={() => setSkillSave(null)}
          onFocusNodes={(ids) => { setSelectedIds(new Set(ids)); if (onSelectionChange) onSelectionChange(ids); }}
        />
      )}

      {/* 関数化ダイアログ */}
      {fnDialog && (
        <div className="plan-modal-overlay" onClick={() => setFnDialog(null)}>
          <div className="plan-modal" onClick={(e) => e.stopPropagation()} style={{ width: 500 }}>
            <div className="plan-modal-head">
              <h3>🧩 グループ化 / 関数化</h3>
              <button onClick={() => setFnDialog(null)}>×</button>
            </div>
            <div className="plan-modal-body" style={{ gap: 12 }}>
              <div className="plan-fn-info">
                {fnDialog.items.length} 個のアイテムをひとつの □ にまとめます。＋ボタンで再展開できます。
              </div>
              <label className="plan-fn-field">
                <span className="plan-fn-label">名前 <span style={{color: "#dc2626"}}>*</span></span>
                <input
                  autoFocus
                  className="plan-fn-input"
                  value={fnDialog.name}
                  onChange={(e) => setFnDialog(d => ({ ...d, name: e.target.value }))}
                  placeholder="例: PRレビューサブフロー"
                />
              </label>
              <label className="plan-fn-field">
                <span className="plan-fn-label">説明</span>
                <textarea
                  rows={2}
                  className="plan-fn-input"
                  value={fnDialog.description}
                  onChange={(e) => setFnDialog(d => ({ ...d, description: e.target.value }))}
                  placeholder="どんな処理をする部品か、簡単な説明"
                />
              </label>
              <div className="plan-fn-field">
                <span className="plan-fn-label">色</span>
                <div className="plan-fn-color-row">
                  {["#7c3aed", "#2563eb", "#0891b2", "#15803d", "#c2410c", "#dc2626", "#6d28d9", "#525252"].map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`plan-fn-color-sw ${fnDialog.color === c ? "is-on" : ""}`}
                      style={{ background: c }}
                      onClick={() => setFnDialog(d => ({ ...d, color: c }))}
                      title={c}
                    />
                  ))}
                </div>
              </div>
              <div className="plan-fn-field">
                <span className="plan-fn-label">形</span>
                <div className="plan-fn-shape-row">
                  {[
                    { id: "rounded", label: "角丸" },
                    { id: "rect", label: "矩形" },
                    { id: "pill", label: "ピル" },
                    { id: "hex", label: "六角" },
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={`plan-fn-shape-btn is-shape-${s.id} ${fnDialog.shape === s.id ? "is-on" : ""}`}
                      style={fnDialog.shape === s.id ? { borderColor: fnDialog.color, color: fnDialog.color } : {}}
                      onClick={() => setFnDialog(d => ({ ...d, shape: s.id }))}
                    >{s.label}</button>
                  ))}
                </div>
              </div>
              <label className="plan-fn-field">
                <span className="plan-fn-label">
                  <input
                    type="checkbox"
                    checked={fnDialog.registerAsCustom}
                    onChange={(e) => setFnDialog(d => ({ ...d, registerAsCustom: e.target.checked }))}
                    style={{ marginRight: 6 }}
                  />
                  マイ関数としても保存する (他のフローで再利用可能に)
                </span>
              </label>
              {/* プレビュー */}
              <div className="plan-fn-preview-wrap">
                <span style={{ font: "500 11px Geist Mono, monospace", color: "var(--tx-4)" }}>プレビュー</span>
                <div
                  className={`plan-fn-preview is-shape-${fnDialog.shape}`}
                  style={{ borderColor: fnDialog.color, background: fnDialog.color + "0d" }}
                >
                  <span className="plan-fn-preview-dot" style={{ background: fnDialog.color }} />
                  <span className="plan-fn-preview-label">{fnDialog.name || "未命名"}</span>
                  <span className="plan-fn-preview-count">＋{fnDialog.items.length}</span>
                </div>
              </div>
            </div>
            <div className="plan-modal-foot">
              <button className="plan-btn" onClick={() => setFnDialog(null)}>キャンセル</button>
              <button className="plan-btn plan-btn-primary" onClick={saveFunction}>関数化</button>
            </div>
          </div>
        </div>
      )}

      {/* フロー選択モーダル */}
      {showFlowPicker && (
        <div className="plan-modal-overlay" onClick={() => setShowFlowPicker(false)}>
          <div className="plan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="plan-modal-head">
              <h3>フローカードとして追加</h3>
              <button onClick={() => setShowFlowPicker(false)}>×</button>
            </div>
            <div className="plan-modal-body">
              {flowList.flatMap(section => section.items.map(item => ({ ...item, section: section.section }))).map(f => (
                <button key={f.id} className="plan-flow-pick" onClick={() => addFlowCard(f)}>
                  <span className="plan-flow-pick-name">{f.name}</span>
                  <span className="plan-flow-pick-meta">{f.section} · {f.nodes} nodes</span>
                </button>
              ))}
              {flowList.length === 0 && <div className="plan-empty-text">フローがありません</div>}
            </div>
          </div>
        </div>
      )}

      {groupDetail && (() => {
        const grp = board.items.find(it => it.id === groupDetail);
        if (!grp) return null;
        const NT = window.NODE_TYPES || {};
        return (
          <div className="plan-modal-overlay" onClick={() => setGroupDetail(null)}>
            <div className="plan-modal" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxHeight: "80vh" }}>
              <div className="plan-modal-head">
                <h3>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: grp.color || "#7c3aed", marginRight: 8, verticalAlign: "middle" }} />
                  {grp.label || "(無名関数)"}
                </h3>
                <button onClick={() => setGroupDetail(null)}>×</button>
              </div>
              <div className="plan-modal-body" style={{ gap: 10 }}>
                {grp.description && (
                  <div className="plan-fn-info">{grp.description}</div>
                )}
                <div style={{ font: "600 11px Geist Mono, monospace", color: "var(--tx-4)" }}>
                  内部要素 ({(grp.items || []).length} 個)
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(grp.items || []).map(it => {
                    const t = NT[it.nodeType] || {};
                    return (
                      <div key={it.id} className="plan-group-detail-row" style={{ borderLeftColor: t.color || "var(--bd-2)" }}>
                        <div className="plan-node-card-head">
                          <span className="plan-node-card-chip" style={{ color: t.color }}>
                            <span className="plan-node-card-icon">{t.icon || "·"}</span>
                            <span className="plan-node-card-type">{t.label || it.nodeType}</span>
                          </span>
                        </div>
                        <div className="plan-node-card-title">{it.label}</div>
                        {it.subtitle && <div className="plan-node-card-subtitle">{it.subtitle}</div>}
                        {it.meta && it.meta.desc && (
                          <div className="plan-group-detail-desc">{it.meta.desc}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(grp.edges || []).length > 0 && (
                  <>
                    <div style={{ font: "600 11px Geist Mono, monospace", color: "var(--tx-4)", marginTop: 8 }}>
                      内部接続 ({grp.edges.length} 本)
                    </div>
                    <div className="plan-group-detail-edges">
                      {grp.edges.map((e, i) => {
                        const fromIt = grp.items.find(it => it.id === e.from);
                        const toIt = grp.items.find(it => it.id === e.to);
                        return (
                          <div key={i} className="plan-group-detail-edge">
                            <span>{fromIt?.label || e.from}</span>
                            <span style={{ color: "var(--tx-4)" }}>→{e.label ? `[${e.label}]` : ""}</span>
                            <span>{toIt?.label || e.to}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <div className="plan-modal-foot">
                <button className="plan-btn" onClick={() => setGroupDetail(null)}>閉じる</button>
                <button className="plan-btn plan-btn-primary" onClick={() => {
                  setGroupDetail(null);
                  expandGroup(grp.id);
                }}>展開して編集</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showFnPicker && (
        <div className="plan-modal-overlay" onClick={() => setShowFnPicker(false)}>
          <div className="plan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="plan-modal-head">
              <h3>🧩 マイ関数を呼び出す</h3>
              <button onClick={() => setShowFnPicker(false)}>×</button>
            </div>
            <div className="plan-modal-body">
              {(() => {
                const fns = loadCustomFunctions();
                if (fns.length === 0) {
                  return (
                    <div className="plan-empty-text">
                      まだマイ関数がありません。
                      <br/>
                      <span style={{ fontSize: 11, color: "var(--tx-4)" }}>
                        アイテムを選択して「⚙ 関数化」で保存できます。
                      </span>
                    </div>
                  );
                }
                return fns.map(fn => (
                  <button key={fn.id} className="plan-flow-pick" onClick={() => insertFunction(fn)}>
                    <span className="plan-flow-pick-name">
                      <span style={{ marginRight: 6 }}>{fn.icon || "🧩"}</span>
                      {fn.name}
                    </span>
                    <span className="plan-flow-pick-meta">
                      {fn.category || "マイ関数"} · {(fn.items || []).length} items
                      {fn.description && ` · ${fn.description.slice(0, 40)}${fn.description.length > 40 ? "…" : ""}`}
                    </span>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 名前をつけて保存モーダル */}
      {saveAsModal && (
        <div className="plan-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setSaveAsModal(null); }}>
          <div className="plan-modal plan-saveas-modal">
            <div className="plan-modal-head">
              <span className="plan-modal-title">📋 名前をつけて保存</span>
              <button className="plan-modal-close" onClick={() => setSaveAsModal(null)} title="閉じる">×</button>
            </div>
            <div className="plan-modal-body">
              <div className="plan-saveas-field">
                <label className="plan-saveas-label">保存先フォルダ</label>
                <input
                  type="text"
                  className="plan-saveas-input mono"
                  value={saveAsModal.location}
                  onChange={(e) => setSaveAsModal(m => ({ ...m, location: e.target.value }))}
                  placeholder="skill/X-Autopilot/"
                />
                <div className="plan-saveas-hint">例: <code>skill/X-Autopilot/</code> · <code>automation/X-Autopilot/</code></div>
              </div>
              <div className="plan-saveas-field">
                <label className="plan-saveas-label">ファイル名 (バージョン)</label>
                <input
                  type="text"
                  className="plan-saveas-input mono"
                  value={saveAsModal.name}
                  onChange={(e) => setSaveAsModal(m => ({ ...m, name: e.target.value }))}
                  placeholder="X-Autopilot-v1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && saveAsModal.name.trim()) {
                      e.preventDefault();
                      document.querySelector('.plan-saveas-submit')?.click();
                    }
                  }}
                />
                <div className="plan-saveas-hint">最終保存パス: <code className="plan-saveas-path">{(saveAsModal.location || "").replace(/\/$/, "") + "/" + (saveAsModal.name || "")}</code></div>
              </div>
              {saveAsModal.existing && saveAsModal.existing.length > 0 && (
                <div className="plan-saveas-field">
                  <label className="plan-saveas-label">このフォルダの既存バージョン ({saveAsModal.existing.length})</label>
                  <div className="plan-saveas-existing">
                    {saveAsModal.existing.map((ex, i) => {
                      const isOverwriting = ex.name === saveAsModal.name;
                      return (
                        <div key={i} className={`plan-saveas-existing-row ${isOverwriting ? "is-conflict" : ""}`}>
                          <span className="plan-saveas-existing-name mono">{ex.name}</span>
                          {ex.savedAt && <span className="plan-saveas-existing-time">{new Date(ex.savedAt).toLocaleString("ja-JP")}</span>}
                          <button
                            className="plan-saveas-existing-use"
                            onClick={() => setSaveAsModal(m => ({ ...m, name: ex.name }))}
                            title="このバージョン名にセット (上書きされます)"
                          >使う</button>
                        </div>
                      );
                    })}
                  </div>
                  {saveAsModal.existing.some(e => e.name === saveAsModal.name) && (
                    <div className="plan-saveas-warn">⚠ 同名の既存バージョンを上書きします</div>
                  )}
                </div>
              )}
            </div>
            <div className="plan-modal-foot">
              <button className="plan-btn" onClick={() => setSaveAsModal(null)}>キャンセル</button>
              <button
                className="plan-btn plan-btn-primary plan-saveas-submit"
                disabled={!saveAsModal.name?.trim() || !saveAsModal.location?.trim()}
                onClick={() => {
                  const location = saveAsModal.location.replace(/\/+$/, "") + "/";
                  const name = saveAsModal.name.trim();
                  const fullKey = `fi_saveas:${location}${name}`;
                  // 親 onSaveAs に詳細を渡す。親が無ければデフォルトで localStorage に書く
                  // onSaveAs は string か Promise<string> を返す可能性がある
                  setSaveAsModal(null);
                  const finish = (result) => showToast("📋", result || `保存しました: ${location}${name}`);
                  if (onSaveAs) {
                    Promise.resolve(onSaveAs(boardRef.current, { location, name, fullKey })).then(finish);
                  } else {
                    try {
                      localStorage.setItem(fullKey, JSON.stringify({ ...boardRef.current, name, savedAt: new Date().toISOString() }));
                      finish(`保存しました: ${location}${name}`);
                    } catch (e) {
                      finish(`保存失敗: ${e.message}`);
                    }
                  }
                }}
              >保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 保存・デプロイのトースト */}
      {toast && (
        <div className="plan-toast">
          {toast.icon && <span className="plan-toast-icon">{toast.icon}</span>}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

// フローカード中身のサムネ: ノード一覧を色付き丸 + タイトルで縦並びに表示
// + 隣接ノードを線で結ぶ簡易エッジ描画
export function PlanFlowThumb({ workflow, loading, flowMeta }) {
  if (loading) {
    return (
      <div className="plan-card-thumb-placeholder">
        <div className="plan-card-thumb-text" style={{ opacity: 0.6 }}>読み込み中...</div>
      </div>
    );
  }
  if (!workflow || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    return (
      <div className="plan-card-thumb-placeholder">
        <div className="plan-card-thumb-text" style={{ opacity: 0.6 }}>
          {flowMeta?.nodes ? `${flowMeta.nodes} ノード (未ロード)` : "フロー構造を取得できません"}
        </div>
      </div>
    );
  }
  // 本物のフロー図 (FlowDiagram) を縮小表示。pointer-events を切ってサムネとして見せる
  if (!window.FlowDiagram) {
    return <div className="plan-card-thumb-placeholder"><div className="plan-card-thumb-text">FlowDiagram 未ロード</div></div>;
  }
  const FD = window.FlowDiagram;
  return (
    <div className="plan-card-thumb-diagram">
      <FD workflow={workflow} selected={null} onSelect={() => {}} drafts={[]} />
    </div>
  );
}

// プランボード上の単発ノードカード (パレットから配置された要素)
export function PlanNodeCard({ item, viewK, isSelected, isEdgeTarget, readOnly, onChange, onRemove, onSelect, onContextMenu, onHandleDragStart, onDragBegin, onDragEnd, onDragMoveOver, onDragDropMaybeInsert }) {
  const [isDragging, setIsDragging] = React.useState(false);
  const NT = window.NODE_TYPES || {};
  const t = NT[item.nodeType] || {};

  function onDragStart(e) {
    if (e.target.closest(".plan-node-actions") || e.target.closest(".plan-card-resize") || e.target.closest(".plan-node-handle")) return;
    e.stopPropagation();
    // 選択処理は readOnly でも動かす (詳細パネル表示のため)
    if (onSelect) onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
    if (readOnly) return;  // ドラッグだけ readOnly でスキップ
    setIsDragging(true);
    if (onDragBegin) onDragBegin();
    const sx = e.clientX, sy = e.clientY;
    const bx = item.x, by = item.y;
    let didMove = false;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (mv) => {
      didMove = true;
      const nx = bx + (mv.clientX - sx) / viewK;
      const ny = by + (mv.clientY - sy) / viewK;
      onChange({ x: nx, y: ny });
      // ノード中心の canvas 座標で近接エッジ判定 → 親に通知
      if (onDragMoveOver) {
        const cx = nx + (item.w || 180) / 2;
        const cy = ny + (item.h || 60) / 2;
        onDragMoveOver(item.id, cx, cy);
      }
    };
    const onUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (onDragDropMaybeInsert) onDragDropMaybeInsert(item.id);
      if (onDragEnd) onDragEnd(didMove);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className={`plan-item plan-node-card ${isDragging ? "is-dragging" : ""} ${isSelected ? "is-selected" : ""} ${isEdgeTarget ? "is-edge-target" : ""}`}
      data-plan-item-id={item.id}
      style={{
        left: item.x, top: item.y, width: item.w || 180, height: item.h || 60,
        borderLeftColor: t.color || "var(--bd-2)",
      }}
      onMouseDown={onDragStart}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (onContextMenu) onContextMenu(e.clientX, e.clientY); }}
    >
      <div className="plan-node-card-head">
        <span className="plan-node-card-chip" style={{ color: t.color }}>
          <span className="plan-node-card-icon">{t.icon || "·"}</span>
          <span className="plan-node-card-type">{
            // systemd/cron/GitHub Actions の起動元は "フック" だと紛らわしいので
            // 「起動トリガー」系の分かりやすいラベルに置き換える (Claude Code の
            // hook とは別概念であることを明示)。
            ({ systemd: "起動トリガー", cron: "定期トリガー", "github-actions": "CI トリガー" }[item.meta?.subtype])
            || t.label || item.nodeType
          }</span>
        </span>
        {item.meta?.subtype && (
          <span className="plan-node-card-chip" style={{ color: t.color, marginLeft: 4, opacity: 0.85 }}>
            <span>{({ systemd: "🛡️", cron: "⏰", "github-actions": "🐙" }[item.meta.subtype]) || ""}</span>
            <span className="plan-node-card-type">{item.meta.subtype}</span>
          </span>
        )}
        {item.meta?.subflow?.nodes?.length > 0 && (
          <span
            className="plan-node-card-chip"
            style={{ color: t.color, marginLeft: 4, opacity: 0.9 }}
            title="このノードには内部フローがあります"
          >
            <span>📂</span>
            <span className="plan-node-card-type">中身: {item.meta.subflow.nodes.length} ノード</span>
          </span>
        )}
        <button className="plan-node-card-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
      </div>
      <div className="plan-node-card-title">{item.label}</div>
      {item.subtitle && <div className="plan-node-card-subtitle">{item.subtitle}</div>}
      {/* 接続ハンドル: ドラッグで矢印を伸ばして他のノードに繋ぐ */}
      <div
        className="plan-node-handle"
        title="ドラッグで矢印を伸ばす"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (onHandleDragStart) onHandleDragStart(item.id, e);
        }}
      />
    </div>
  );
}

// プランボード上のフローカード (workflow の縮小表示)
// グループ (関数化された複合要素) — 折りたたみ表示 + ＋ボタンで展開
// グループ展開時の横サブフローコンテナ — 元ブロックの右側に dashed フレーム + 内部ノード/エッジを描画
export function PlanSubflowContainer({ group, onCollapse, onSelectNode }) {
  const NT = window.NODE_TYPES || {};
  const items = group.items || [];
  const edges = group.edges || [];
  const color = group.color || "#7c3aed";
  if (items.length === 0) return null;

  // 内部ノードの bbox を計算 (group ローカル座標系)
  const xs = items.map(it => it.x || 0);
  const ys = items.map(it => it.y || 0);
  const rs = items.map(it => (it.x || 0) + (it.w || 180));
  const bs = items.map(it => (it.y || 0) + (it.h || 60));
  const localMinX = Math.min(...xs), localMinY = Math.min(...ys);
  const localMaxX = Math.max(...rs), localMaxY = Math.max(...bs);
  const contentW = localMaxX - localMinX;
  const contentH = localMaxY - localMinY;

  const PAD = 24, HEADER = 32, GAP = 60;
  const containerW = contentW + PAD * 2;
  const containerH = contentH + PAD * 2 + HEADER;

  // 配置位置: 元ブロックの右辺 + GAP
  const groupX = group.x || 0, groupY = group.y || 0;
  const groupW = group.w || 220, groupH = group.h || 64;
  const containerX = groupX + groupW + GAP;
  const containerY = groupY + groupH / 2 - containerH / 2;

  // 接続線 (元ブロック右辺 → コンテナ左辺)
  const lineX1 = groupX + groupW;
  const lineY1 = groupY + groupH / 2;
  const lineX2 = containerX;
  const lineY2 = containerY + containerH / 2;
  const lineDx = (lineX2 - lineX1) * 0.5;

  // 内部ノードの絶対位置 (コンテナ左上 + PAD + (ローカル座標 - localMin))
  function absPos(it) {
    return {
      x: containerX + PAD + ((it.x || 0) - localMinX),
      y: containerY + PAD + HEADER + ((it.y || 0) - localMinY),
    };
  }
  const itemPositions = {};
  items.forEach(it => { itemPositions[it.id] = absPos(it); });

  return (
    <>
      {/* 接続線 (元ブロック → コンテナ) */}
      <svg
        className="plan-subflow-connect"
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}
        width="0" height="0"
      >
        <path
          d={`M ${lineX1} ${lineY1} C ${lineX1 + lineDx} ${lineY1}, ${lineX2 - lineDx} ${lineY2}, ${lineX2} ${lineY2}`}
          fill="none" stroke={color} strokeWidth="2" strokeDasharray="6 4" opacity="0.7"
        />
      </svg>

      {/* コンテナ本体 (dashed frame + ヘッダー + 内部) */}
      <div
        className="plan-subflow-container"
        style={{
          left: containerX, top: containerY, width: containerW, height: containerH,
          borderColor: color, background: `${color}06`,
        }}
      >
        <div className="plan-subflow-header" style={{ borderColor: color }}>
          <span className="plan-subflow-dot" style={{ background: color }} />
          <span className="plan-subflow-label" style={{ color }}>{(group.label || "").toUpperCase()}</span>
          <button
            type="button"
            className="plan-subflow-collapse"
            title="折りたたむ"
            onClick={(e) => { e.stopPropagation(); onCollapse && onCollapse(); }}
            style={{ background: color, color: "white" }}
          >−</button>
        </div>
      </div>

      {/* 内部エッジ (ノードより前に描画して後ろに置く) */}
      <svg
        className="plan-subflow-edges"
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}
        width="0" height="0"
      >
        {edges.map((e, i) => {
          const fp = itemPositions[e.from];
          const tp = itemPositions[e.to];
          if (!fp || !tp) return null;
          const fromIt = items.find(it => it.id === e.from);
          const toIt = items.find(it => it.id === e.to);
          const fx = fp.x + (fromIt?.w || 180) / 2;
          const fy = fp.y + (fromIt?.h || 60);
          const tx = tp.x + (toIt?.w || 180) / 2;
          const ty = tp.y;
          const dy = ty - fy;
          const cy = Math.max(20, Math.abs(dy) * 0.45);
          const d = `M ${fx} ${fy} C ${fx} ${fy + cy}, ${tx} ${ty - cy}, ${tx} ${ty}`;
          const tColor = NT[toIt?.nodeType]?.color || "#94a3b8";
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={tColor} strokeWidth="1.6" strokeDasharray="6 6" opacity="0.85" />
              {e.label && (
                <text x={(fx + tx) / 2} y={(fy + ty) / 2} fill={tColor} fontSize="11" fontWeight="600" textAnchor="middle"
                  style={{ paintOrder: "stroke", stroke: "var(--bg-1)", strokeWidth: 3 }}>{e.label}</text>
              )}
            </g>
          );
        })}
      </svg>

      {/* 内部ノード (read-only mini cards) */}
      {items.map(it => {
        const p = itemPositions[it.id];
        const t = NT[it.nodeType] || {};
        return (
          <div
            key={it.id}
            className="plan-subflow-node"
            style={{
              position: "absolute",
              left: p.x, top: p.y, width: it.w || 180, height: it.h || 60,
              borderLeftColor: t.color || "var(--bd-2)",
              cursor: "pointer",
            }}
            onClick={(e) => { e.stopPropagation(); if (onSelectNode) onSelectNode(it.id); }}
          >
            <div className="plan-node-card-head">
              <span className="plan-node-card-chip" style={{ color: t.color }}>
                <span className="plan-node-card-icon">{t.icon || "·"}</span>
                <span className="plan-node-card-type">{t.label || it.nodeType}</span>
              </span>
            </div>
            <div className="plan-node-card-title">{it.label}</div>
            {it.subtitle && <div className="plan-node-card-subtitle">{it.subtitle}</div>}
          </div>
        );
      })}
    </>
  );
}

export function PlanGroupCard({ item, viewK, isSelected, isEdgeTarget, readOnly, frame, onChange, onRemove, onSelect, onContextMenu, onExpand, onCollapse, onFrameDragStart, onHandleDragStart, onDragBegin, onDragEnd, onOpenDetail, onDragMoveOver, onDragDropMaybeInsert }) {
  const [isDragging, setIsDragging] = React.useState(false);

  function onDragStart(e) {
    if (e.target.closest(".plan-group-actions") || e.target.closest(".plan-group-expand-btn") || e.target.closest(".plan-card-resize") || e.target.closest(".plan-node-handle")) return;
    e.stopPropagation();
    if (onSelect) onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
    if (readOnly) return;
    setIsDragging(true);
    if (onDragBegin) onDragBegin();
    const sx = e.clientX, sy = e.clientY;
    const bx = item.x, by = item.y;
    let didMove = false;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (mv) => {
      didMove = true;
      const nx = bx + (mv.clientX - sx) / viewK;
      const ny = by + (mv.clientY - sy) / viewK;
      onChange({ x: nx, y: ny });
      if (onDragMoveOver) {
        const cx = nx + (item.w || 220) / 2;
        const cy = ny + (item.h || 64) / 2;
        onDragMoveOver(item.id, cx, cy);
      }
    };
    const onUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (onDragDropMaybeInsert) onDragDropMaybeInsert(item.id);
      if (onDragEnd) onDragEnd(didMove);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const color = item.color || "#7c3aed";
  const shape = item.shape || "rounded";
  const collapsed = item.collapsed !== false;  // 既定で折りたたみ
  const w = item.w || 220, h = item.h || 64;

  // 1つの □ (collapsed/expanded どちらも同じ見た目、ボタンだけ + / − で切替)
  return (
    <div
      className={`plan-item plan-group-card is-shape-${shape} ${isDragging ? "is-dragging" : ""} ${isSelected ? "is-selected" : ""} ${isEdgeTarget ? "is-edge-target" : ""}`}
      data-plan-item-id={item.id}
      style={{
        left: item.x, top: item.y, width: w, height: h,
        borderColor: color,
        background: `${color}0d`,
      }}
      onMouseDown={onDragStart}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (onContextMenu) onContextMenu(e.clientX, e.clientY); }}
    >
      <span className="plan-group-dot" style={{ background: color }} />
      <div className="plan-group-text">
        <div className="plan-group-label">{item.label || "(無名関数)"}</div>
        {item.description && <div className="plan-group-sub">{item.description}</div>}
      </div>
      <span className="plan-group-count" style={{ color }}>{item.items?.length || 0} 要素</span>
      <button
        type="button"
        className="plan-group-expand-btn"
        title={collapsed ? "展開してフローを開く" : "折りたたむ"}
        onClick={(e) => {
          e.stopPropagation();
          if (collapsed) { onExpand && onExpand(); }
          else { onCollapse && onCollapse(); }
        }}
        style={{ background: color, color: "white" }}
      >{collapsed ? "＋" : "−"}</button>
      <div className="plan-group-actions" onMouseDown={(e) => e.stopPropagation()}>
        <button className="plan-group-info" onClick={(e) => { e.stopPropagation(); onOpenDetail && onOpenDetail(); }} title="中身の詳細を見る">ⓘ</button>
        <button className="plan-group-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="削除">×</button>
      </div>
      {/* 接続ハンドル: ドラッグで矢印を伸ばす */}
      <div
        className="plan-node-handle"
        title="ドラッグで矢印を伸ばす"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (onHandleDragStart) onHandleDragStart(item.id, e);
        }}
      />
    </div>
  );
}

export function PlanFlowCard({ item, flowList, workflow, loading, viewK, isSelected, readOnly, onChange, onRemove, onOpenFlow, onSelect, onContextMenu, onDragBegin, onDragEnd }) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [hover, setHover] = React.useState(false);

  function onDragStart(e) {
    if (readOnly) return;
    if (e.target.closest(".plan-card-action") || e.target.closest(".plan-card-resize")) return;
    e.stopPropagation();
    // クリック時に選択状態に
    if (onSelect) onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
    setIsDragging(true);
    if (onDragBegin) onDragBegin();
    let didMove = false;
    const sx = e.clientX, sy = e.clientY;
    const bx = item.x, by = item.y;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (mv) => { didMove = true; onChange({ x: bx + (mv.clientX - sx) / viewK, y: by + (mv.clientY - sy) / viewK }); };
    const onUp = () => {
      if (onDragEnd) onDragEnd(didMove);
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  function onResizeStart(e) {
    e.stopPropagation(); e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const bw = item.w, bh = item.h;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
    const onMove = (mv) => onChange({
      w: Math.max(200, bw + (mv.clientX - sx) / viewK),
      h: Math.max(140, bh + (mv.clientY - sy) / viewK),
    });
    const onUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // フロー情報を flowList から取得
  const flowMeta = flowList.flatMap(s => s.items).find(f => f.id === item.flowId);

  return (
    <div
      className={`plan-item plan-flow-card ${isDragging ? "is-dragging" : ""} ${isSelected ? "is-selected" : ""}`}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={(e) => { e.preventDefault(); if (onContextMenu) onContextMenu(e.clientX, e.clientY); }}
    >
      <div className="plan-card-header" onMouseDown={onDragStart} title="ドラッグで移動">
        <input
          className="plan-card-label"
          value={item.label || ""}
          onChange={(e) => onChange({ label: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="ラベル (V1, V2 など)"
        />
        {hover && (
          <div className="plan-card-actions">
            <button className="plan-card-action" onClick={(e) => { e.stopPropagation(); onOpenFlow && onOpenFlow(item.flowId); }} title="フローを開く">⤢</button>
            <button className="plan-card-action plan-card-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="削除">×</button>
          </div>
        )}
      </div>
      <div className="plan-card-body">
        {flowMeta ? (
          <>
            <div className="plan-card-meta">
              <span>{flowMeta.name}</span>
              <span className="plan-card-meta-sub">{flowMeta.nodes} nodes · {flowMeta.complexity || "—"}</span>
            </div>
            <PlanFlowThumb workflow={workflow} loading={loading} flowMeta={flowMeta} />
          </>
        ) : (
          <div className="plan-card-meta">フロー情報が見つかりません ({item.flowId})</div>
        )}
      </div>
      <div className="plan-card-resize" onMouseDown={onResizeStart} title="ドラッグでサイズ変更" />
    </div>
  );
}

// プランボード上のふせんメモ
export function PlanNote({ item, viewK, isSelected, readOnly, onChange, onRemove, onSelect, onContextMenu, onDragBegin, onDragEnd }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const COLORS = {
    yellow: { bg: "#fff8c2", border: "#e8d76a", text: "#5b4d00" },
    pink:   { bg: "#ffd6e3", border: "#e8a3bb", text: "#5b1530" },
    blue:   { bg: "#d0e7ff", border: "#7fb3e5", text: "#0a3d6b" },
    green:  { bg: "#d6f5d6", border: "#7fc97f", text: "#0d4a18" },
  };
  const c = COLORS[item.color] || COLORS.yellow;

  function onDragStart(e) {
    if (readOnly) return;
    if (isEditing) return;
    if (e.target.closest(".plan-note-actions") || e.target.closest(".plan-card-resize") || e.target.closest("textarea") || e.target.closest(".plan-note-text")) return;
    e.stopPropagation();
    // クリック時に選択状態に
    if (onSelect) onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
    setIsDragging(true);
    if (onDragBegin) onDragBegin();
    let didMove = false;
    const sx = e.clientX, sy = e.clientY;
    const bx = item.x, by = item.y;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (mv) => { didMove = true; onChange({ x: bx + (mv.clientX - sx) / viewK, y: by + (mv.clientY - sy) / viewK }); };
    const onUp = () => {
      if (onDragEnd) onDragEnd(didMove);
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onResizeStart(e) {
    e.stopPropagation(); e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const bw = item.w, bh = item.h;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
    const onMove = (mv) => onChange({
      w: Math.max(100, bw + (mv.clientX - sx) / viewK),
      h: Math.max(60, bh + (mv.clientY - sy) / viewK),
    });
    const onUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className={`plan-item plan-note ${isEditing ? "is-editing" : ""} ${isDragging ? "is-dragging" : ""} ${isSelected ? "is-selected" : ""}`}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h, background: c.bg, borderColor: c.border, color: c.text }}
      onMouseDown={onDragStart}
      onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (onContextMenu) onContextMenu(e.clientX, e.clientY); }}
    >
      <div className="plan-note-handle" />
      <div className="plan-note-actions" onMouseDown={(e) => e.stopPropagation()}>
        {Object.keys(COLORS).map(col => (
          <button key={col}
            className={`plan-note-color ${item.color === col ? "is-on" : ""}`}
            style={{ background: COLORS[col].bg, borderColor: COLORS[col].border }}
            onClick={(e) => { e.stopPropagation(); onChange({ color: col }); }}
          />
        ))}
        <button className="plan-note-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
      </div>
      {isEditing ? (
        <textarea
          autoFocus
          className="plan-note-textarea"
          style={{ color: c.text }}
          value={item.text}
          onChange={(e) => onChange({ text: e.target.value })}
          onBlur={() => setIsEditing(false)}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="メモ..."
        />
      ) : (
        <div className="plan-note-text" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
          {item.text || <span style={{opacity: 0.5, fontStyle: "italic"}}>クリックして編集</span>}
        </div>
      )}
      <div className="plan-card-resize" onMouseDown={onResizeStart} />
    </div>
  );
}


// ダッシュボード: 複数ボードの一覧 (登録済みアイテムと同じ行スタイル)。
// 行 = 題名 + 最終更新日時 + 開く + 消去。新規ボードボタン付き。
export function PlanBoardList({ onOpenBoard, onNewBoard }) {
  const [boards, setBoards] = React.useState(null);   // null = loading
  const refresh = React.useCallback(async () => {
    const list = await listBoardsFile();
    setBoards(Array.isArray(list) ? list : []);
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);
  async function handleDelete(b, e) {
    e.stopPropagation();
    if (!window.confirm(`「${b.name || "無題のボード"}」を削除します。元に戻せません。`)) return;
    await deleteBoardFile(b.id);
    refresh();
  }
  return (
    <div className="board-list">
      <div className="board-list-head">
        <div className="board-list-title">🎯 プランニング ホワイトボード</div>
        <button className="board-list-new" onClick={onNewBoard}>＋ 新規ボード</button>
      </div>
      {boards === null ? (
        <div className="board-list-empty">読み込み中…</div>
      ) : boards.length === 0 ? (
        <div className="board-list-empty">まだボードがありません。「＋ 新規ボード」で作成できます。</div>
      ) : (
        <div className="board-list-rows">
          {boards.map((b) => (
            <div key={b.id} className="board-row" onClick={() => onOpenBoard(b.id)}>
              <div className="board-row-main">
                <div className="board-row-name">{b.name || "無題のボード"}</div>
                <div className="board-row-meta">最終更新 {fmtBoardDate(b.updatedAt)}{typeof b.nodeCount === "number" ? ` · ${b.nodeCount} ノード` : ""}</div>
              </div>
              <button className="board-row-open" title="開く" onClick={(e) => { e.stopPropagation(); onOpenBoard(b.id); }}>→</button>
              <button className="board-row-del" title="消去" onClick={(e) => handleDelete(b, e)}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
