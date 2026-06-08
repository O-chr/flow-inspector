// Board <-> workflow model + plan-board persistence. Phase 3 lib module
// (pure functions, extracted verbatim; shared by App + PlanWorkspace).
import { API } from './api.js'
import { NODE_TYPES } from './node-types.js'
import { loadCustomFunctions } from './custom-functions.js'

export function workflowToBoard(workflow) {
  if (!workflow) return null;
  return {
    id: workflow.id || "wf",
    name: workflow.name || "(無名)",
    desc: workflow.description || "",
    items: (workflow.nodes || []).map(n => {
      // 中身フロー (flowizer 出力 inner_flow) を持つノードは「マイ関数」と同じ
      // group ブロックに変換する。collapsed=true で 1 ブロック表示、「＋」で右横展開
      // (PlanGroupCard + PlanSubflowContainer + expandGroup をそのまま再利用)。
      const inner = n.inner_flow && Array.isArray(n.inner_flow.nodes) && n.inner_flow.nodes.length
        ? n.inner_flow : null;
      if (inner) {
        const NT = window.NODE_TYPES || {};
        return {
          id: n.id, type: "group",
          label: n.title || n.id,
          description: n.subtitle || "",
          color: (NT[n.type] && NT[n.type].color) || "#7c3aed",
          shape: "rounded",
          collapsed: true,
          // 子ノードを board の node 形式に正規化。inner_flow はメインフロー用の
          // 広い座標 (DY=130) なので、サブフロープレビューに収まるよう縦間隔を圧縮する
          // (PlanSubflowContainer が bbox を localMin 正規化するので min 引きは不要、
          // スケールのみで十分)。x は横の分岐位置維持のためそのまま。
          items: inner.nodes.map(c => ({
            id: c.id, type: "node", nodeType: c.type,
            label: c.title || c.id, subtitle: c.subtitle || "",
            x: c.x || 0, y: Math.round((c.y || 0) * 0.55), w: 180, h: 60,
            meta: { ...(c.meta || {}), desc: c.desc },
          })),
          edges: (inner.edges || []).map(e => ({ from: e.from, to: e.to, label: e.label || "" })),
          x: (n.x || 0) - 130, y: (n.y || 0) - 36, w: 260, h: 72,
        };
      }
      return {
        id: n.id, type: "node", nodeType: n.type,
        label: n.title || n.id, subtitle: n.subtitle || "",
        meta: {
          ...(n.meta || {}),
          desc: n.desc, input: n.input, output: n.output,
          depends: n.depends, parallel: n.parallel, duration: n.duration,
          subtype: n.subtype,  // 起動元バッジ (systemd/cron/github-actions) で参照
          // 内部フロー: subflow (legacy/demo) を保持。PlanNodeCard が「📂 N ノード」表示。
          // inner_flow (flowizer) は上の group 分岐で処理済み。
          subflow: n.subflow || undefined,
        },
        x: (n.x || 0) - 90, y: (n.y || 0) - 30, w: 180, h: 60,
      };
    }),
    edges: (workflow.edges || []).map(e => ({ from: e.from, to: e.to, label: e.label || "" })),
    view: { x: 0, y: 0, k: 0.9 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// チャットで確定した {desc, config} を Plan Workspace ボードの該当ノードに反映する。
// ボードノードは設定値を meta に持つ (config ではない) ので、config キーを meta にマージし、
// desc は meta.desc に入れる。戻り値は新しい board オブジェクト。
export function mergeNodeSettingsIntoBoard(board, nodeId, settings) {
  if (!board || !board.items) return board;
  const { desc, config } = settings || {};
  return {
    ...board,
    items: board.items.map(it => {
      if (it.id !== nodeId || it.type !== "node") return it;
      const nextMeta = { ...(it.meta || {}) };
      if (config && typeof config === "object") {
        for (const [k, v] of Object.entries(config)) nextMeta[k] = v;
      }
      if (desc !== undefined) nextMeta.desc = desc;
      return { ...it, meta: nextMeta };
    }),
    updatedAt: new Date().toISOString(),
  };
}
// board item ({id,type:"node"|"group",nodeType,label,subtitle,meta,...}) を
// DetailBody / RightPanel が期待する node 形に変換する。
export function boardItemToNode(item) {
  if (!item) return null;
  if (item.type === "group") {
    return {
      id: item.id,
      type: "group",
      title: item.label || "(無名グループ)",
      subtitle: item.description || `${(item.items || []).length} 項目`,
      desc: item.description || `このグループには ${(item.items || []).length} 個のアイテムが含まれます`,
      input: {}, output: {},
      meta: { color: item.color, shape: item.shape, collapsed: item.collapsed, items: item.items, edges: item.edges },
      depends: [], duration: "",
    };
  }
  if (item.type === "node") {
    return {
      id: item.id,
      type: item.nodeType,
      title: item.label,
      subtitle: item.subtitle || "",
      desc: item.meta?.desc || "",
      input: item.meta?.input || {},
      output: item.meta?.output || {},
      meta: item.meta || {},
      depends: item.meta?.depends || [],
      parallel: item.meta?.parallel,
      duration: item.meta?.duration || "",
    };
  }
  return null;  // note 等は詳細パネルに流さない
}
// エッジの向きから階層 (depth) を求め、ノードを格子状に再配置する純関数。
// direction: "vertical" (既定, 上→下) | "horizontal" (左→右)。
// 戻り値: x/y を書き換えた新しい items 配列 (node/group 以外はそのまま)。
export function autoLayoutItems(items, edges, opts) {
  const dir = (opts && opts.direction === "horizontal") ? "horizontal" : "vertical";
  const nodes = (items || []).filter(it => it.type === "node" || it.type === "group");
  if (nodes.length === 0) return items;
  const ids = new Set(nodes.map(n => n.id));
  const eds = (edges || []).filter(e => ids.has(e.from) && ids.has(e.to));
  const depth = {}; nodes.forEach(n => { depth[n.id] = 0; });
  let changed = true, guard = 0;
  while (changed && guard++ < nodes.length + 5) {
    changed = false;
    for (const e of eds) { if (depth[e.to] < depth[e.from] + 1) { depth[e.to] = depth[e.from] + 1; changed = true; } }
  }
  const byLayer = {};
  nodes.forEach(n => { const d = depth[n.id]; (byLayer[d] = byLayer[d] || []).push(n); });
  const MAIN = 150, CROSS = 240, baseX = 560, baseY = 120;
  const pos = {};
  Object.keys(byLayer).map(Number).sort((a, b) => a - b).forEach(d => {
    const layer = byLayer[d];
    layer.forEach((n, i) => {
      const off = (i - (layer.length - 1) / 2) * CROSS;
      if (dir === "horizontal") pos[n.id] = { x: baseX + d * CROSS + 200, y: baseY + off + 200 };
      else pos[n.id] = { x: baseX + off, y: baseY + d * MAIN };
    });
  });
  return items.map(it => pos[it.id] ? { ...it, x: Math.round(pos[it.id].x), y: Math.round(pos[it.id].y) } : it);
}
// フロー構築AIチャットの操作プラン (flow_actions) を board に適用する純関数。
// 戻り値: { board: 新board, summary: 人間可読な行[], warnings: string[] }
// 新規ノードは action.ref を一時IDとして採番し、同バッチ内の edge から参照できる。
export function applyFlowActions(board, actions) {
  const warnings = [];
  const summary = [];
  let items = (board.items || []).map(it => ({ ...it }));
  let edges = (board.edges || []).map(e => ({ ...e }));
  const refMap = {};  // add_node の ref -> 採番した実id
  const tsBase = Date.now();
  let counter = 0;
  const newId = () => `an_${tsBase}_${counter++}`;
  const resolve = (ref) => (ref != null && refMap[ref]) ? refMap[ref] : ref;
  const findItem = (id) => items.find(it => it.id === id);
  const labelOf = (id) => { const it = findItem(id); return it ? it.label : id; };

  // 新規ノードの配置: 既存の最下ノードの下から縦に積む。
  // 空ボードは左パレット/ドック (画面左 ~400px) の裏に隠れないよう、見える位置 (canvas x≈600) から始める。
  let nextY = items.length ? Math.max(...items.map(it => (it.y || 0) + (it.h || 60))) + 60 : 120;
  const baseX = items.length ? Math.round(items.reduce((a, it) => a + (it.x || 0), 0) / items.length) : 600;

  const list = Array.isArray(actions) ? actions : [];

  // 第1パス: add_node (ref を先に解決できるよう先行処理)
  for (const a of list) {
    if (!a || a.op !== "add_node") continue;
    const nt = a.nodeType || a.type;
    if (!nt || !(window.NODE_TYPES && window.NODE_TYPES[nt])) {
      warnings.push(`未知のノードタイプ「${nt}」(${a.title || "?"}) — スキップ`);
      continue;
    }
    const id = newId();
    if (a.ref) refMap[a.ref] = id;
    const meta = { ...(a.config || {}) };
    if (a.desc !== undefined) meta.desc = a.desc;
    items.push({
      id, type: "node", nodeType: nt,
      label: a.title || nt, subtitle: a.subtitle || "",
      meta, x: baseX - 90, y: nextY, w: 180, h: 60,
    });
    nextY += 140;
    summary.push(`➕ ノード追加: ${a.title || nt} (${(window.NODE_TYPES[nt].label) || nt}${a.subtitle ? " / " + a.subtitle : ""})`);
  }

  // 第2パス: set_settings / edge系 / remove
  for (const a of list) {
    if (!a || !a.op || a.op === "add_node") continue;
    if (a.op === "set_settings") {
      const id = resolve(a.node);
      const it = findItem(id);
      if (!it) { warnings.push(`設定: ノード「${a.node}」が見つからない — スキップ`); continue; }
      const meta = { ...(it.meta || {}) };
      if (a.config && typeof a.config === "object") for (const [k, v] of Object.entries(a.config)) meta[k] = v;
      if (a.desc !== undefined) meta.desc = a.desc;
      it.meta = meta;
      summary.push(`🔧 設定: ${it.label} を更新`);
    } else if (a.op === "add_edge") {
      const from = resolve(a.from), to = resolve(a.to);
      if (!findItem(from) || !findItem(to)) { warnings.push(`エッジ: ${a.from}→${a.to} の端点が無い — スキップ`); continue; }
      if (edges.some(e => e.from === from && e.to === to)) continue;
      edges.push({ from, to, label: a.label || "" });
      summary.push(`🔗 エッジ: ${labelOf(from)} → ${labelOf(to)}`);
    } else if (a.op === "reconnect_edge") {
      const from = resolve(a.from), to = resolve(a.to);
      const idx = edges.findIndex(e => e.from === from && e.to === to);
      if (idx < 0) { warnings.push(`繋ぎ直し: ${a.from}→${a.to} が無い — スキップ`); continue; }
      const nf = a.new_from !== undefined ? resolve(a.new_from) : from;
      const nt2 = a.new_to !== undefined ? resolve(a.new_to) : to;
      if (!findItem(nf) || !findItem(nt2)) { warnings.push(`繋ぎ直し: 新しい端点が無い — スキップ`); continue; }
      edges[idx] = { from: nf, to: nt2, label: a.label !== undefined ? a.label : edges[idx].label };
      summary.push(`🔗 繋ぎ直し: ${labelOf(nf)} → ${labelOf(nt2)}`);
    } else if (a.op === "remove_node") {
      const id = resolve(a.node);
      const it = findItem(id);
      if (!it) { warnings.push(`削除: ノード「${a.node}」が無い — スキップ`); continue; }
      const lbl = it.label;
      items = items.filter(x => x.id !== id);
      edges = edges.filter(e => e.from !== id && e.to !== id);
      summary.push(`🗑 削除: ノード ${lbl}`);
    } else if (a.op === "remove_edge") {
      const from = resolve(a.from), to = resolve(a.to);
      const before = edges.length;
      edges = edges.filter(e => !(e.from === from && e.to === to));
      if (edges.length === before) { warnings.push(`削除: エッジ ${a.from}→${a.to} が無い — スキップ`); continue; }
      summary.push(`🗑 削除: エッジ ${a.from} → ${a.to}`);
    } else if (a.op === "auto_layout") {
      items = autoLayoutItems(items, edges, { direction: a.direction });
      summary.push(`🧹 レイアウト自動整列${a.direction === "horizontal" ? "（左→右）" : "（上→下）"}`);
    } else if (a.op === "move_node") {
      const id = resolve(a.node);
      const it = findItem(id);
      if (!it) { warnings.push(`移動: ノード「${a.node}」が無い — スキップ`); continue; }
      if (typeof a.x === "number") it.x = Math.round(a.x);
      if (typeof a.y === "number") it.y = Math.round(a.y);
      summary.push(`📍 移動: ${it.label}`);
    } else {
      warnings.push(`未知の操作「${a.op}」— スキップ`);
    }
  }

  return {
    board: { ...board, items, edges, updatedAt: new Date().toISOString() },
    summary, warnings,
  };
}
// ノードの「必須フィールド」一覧を TYPE_SPECS から解決する (条件付き fieldsBy* も、
// 該当セレクタが設定されていれば取り込む)。NodeConfigFields の動的spec解決と同じ思想。
// authoringOnly:true の項目 (要素本体を新規定義するときだけ意味がある name/description 等) は
// フローの「使用ステップ」としては不要なので必須から除外する。将来インライン定義モードを足す
// なら node.meta を見て分岐させる。
// secret:true の項目 (API キー等、envKey で環境変数から渡る秘匿値) も、フロー定義に直書き
// させない方針なので必須から除外する。
export function requiredFieldsFor(node) {
  const spec = (window.FI && window.FI.TYPE_SPECS && window.FI.TYPE_SPECS[node.nodeType]) || null;
  const meta = node.meta || {};
  let fields = (spec && Array.isArray(spec.fields)) ? [...spec.fields] : [];
  if (spec) {
    for (const [k, v] of Object.entries(spec)) {
      if (!k.startsWith("fieldsBy") || !v || typeof v !== "object") continue;
      const sel = k.slice("fieldsBy".length).toLowerCase();         // tool / action / handler ...
      const selKey = sel === "handler" ? "handler_type" : sel;       // fieldsByHandler は handler_type で引く
      const val = meta[selKey];
      if (val && Array.isArray(v[val])) fields = fields.concat(v[val]);
    }
  }
  // capability ノード (Gmail/Slack 等) の「実用コア」必須フィールドを PART_FIELDS から取り込む。
  // これが宛先 (Gmailクエリ/Slackチャンネル等) を保存ゲートで効かせる本丸。
  // フロー開始/終了の I/O 契約 (input/trigger/outputs) は宛先チェックの対象外 (ノイズ回避)。
  const cap = meta.capability;
  if (cap && cap !== "flow.start" && cap !== "flow.end"
      && window.FI && window.FI.PART_FIELDS && Array.isArray(window.FI.PART_FIELDS[cap])) {
    const seen = new Set(fields.map(f => f && f.key));
    for (const f of window.FI.PART_FIELDS[cap]) {
      if (f && !seen.has(f.key)) { fields.push(f); seen.add(f.key); }
    }
  }
  return fields.filter(f => f && f.required && !f.authoringOnly && !f.secret);
}
// 値が「空」か (validateFlowForSkill 内の isEmpty と同基準)。
export function fiIsEmpty(v) {
  return v === undefined || v === null || v === ""
    || (Array.isArray(v) && v.length === 0)
    || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
}
// フロー構築チャット用: ボード各ノードの「未入力の必須項目」を集める。
// requiredFieldsFor (TYPE_SPECS/PART_FIELDS 解決・secret/authoringOnly 除外済み) を再利用。
// AI が会話で「ここどう入れます?」と確認できるよう、key/label/desc/options を渡す。
export function missingRequiredForBoard(items) {
  const out = [];
  for (const it of (items || [])) {
    if (it.type !== "node") continue;
    const meta = it.meta || {};
    const missing = [];
    for (const f of requiredFieldsFor(it)) {
      if (fiIsEmpty(meta[f.key])) {
        missing.push({ key: f.key, label: f.label || f.key, desc: f.desc || "", options: f.options || null });
      }
    }
    if (missing.length) {
      out.push({ node_id: it.id, label: it.label || it.nodeType || it.id, nodeType: it.nodeType, missing });
    }
  }
  return out;
}
// 選択サブグラフ (items + その間のエッジ) を「スキル」として保存できるか決定論的に検証する。
// 返り値: { level: "warn"|"error", title, detail, nodeIds[] }[]
export function validateFlowForSkill(items, edges) {
  const nodes = (items || []).filter(it => it.type === "node");
  const out = [];
  if (nodes.length === 0) {
    out.push({ level: "error", title: "ノードがありません", detail: "スキルにするノードを選択してください。", nodeIds: [] });
    return out;
  }
  const idset = new Set(nodes.map(n => n.id));
  const within = (edges || []).filter(e => idset.has(e.from) && idset.has(e.to));
  const hasIn = new Set(within.map(e => e.to));
  const hasOut = new Set(within.map(e => e.from));
  const isEmpty = (v) => v === undefined || v === null || v === ""
    || (Array.isArray(v) && v.length === 0)
    || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

  // 孤立ノード (2件以上のとき)
  for (const n of nodes) {
    if (nodes.length > 1 && !hasIn.has(n.id) && !hasOut.has(n.id)) {
      out.push({ level: "warn", title: `「${n.label}」が孤立しています`, detail: "どのノードにも繋がっていません。フローに組み込むか外してください。", nodeIds: [n.id] });
    }
  }
  // 複数ゴール (出力エッジ無しノードが2つ以上)
  const terminals = nodes.filter(n => !hasOut.has(n.id));
  if (terminals.length > 1) {
    out.push({ level: "warn", title: "ゴールが複数あります", detail: `終端が複数: ${terminals.map(n => n.label).join(" / ")}。1つの成果物に絞れますか?`, nodeIds: terminals.map(n => n.id) });
  }
  // 入口未定義 (起点型ノードが無い)
  const entryTypes = new Set(["parent", "trigger", "user", "hook"]);
  if (!nodes.some(n => entryTypes.has(n.nodeType))) {
    const starts = nodes.filter(n => !hasIn.has(n.id));
    out.push({ level: "warn", title: "入口（トリガー/parent）が未定義", detail: "何をきっかけに起動するかが決まっていません。", nodeIds: starts.map(n => n.id) });
  }
  // 必須設定の未入力
  for (const n of nodes) {
    const meta = n.meta || {};
    for (const f of requiredFieldsFor(n)) {
      if (isEmpty(meta[f.key])) {
        out.push({ level: "warn", title: `「${n.label}」の必須項目が未入力`, detail: `『${f.label}』が空です。`, nodeIds: [n.id] });
      }
    }
  }
  return out;
}
export function boardToWorkflow(board, originalWorkflow) {
  if (!board) return originalWorkflow;
  return {
    ...(originalWorkflow || {}),
    id: originalWorkflow?.id || board.id,
    name: board.name || originalWorkflow?.name,
    nodes: (board.items || []).filter(it => it.type === "node").map(it => ({
      id: it.id, type: it.nodeType,
      title: it.label, subtitle: it.subtitle || "",
      x: (it.x || 0) + (it.w || 180) / 2,
      y: (it.y || 0) + (it.h || 60) / 2,
      desc: it.meta?.desc || "",
      input: it.meta?.input || {},
      output: it.meta?.output || {},
      meta: it.meta || {},
      depends: it.meta?.depends || [],
      parallel: it.meta?.parallel,
      duration: it.meta?.duration || "",
    })),
    edges: (board.edges || []).map(e => ({ from: e.from, to: e.to, label: e.label || "" })),
  };
}
// ════════════════════════════════════════════════════
// Plan Workspace (プランニング ホワイトボード)
// 1ボード = 1目的のロジック最適化、複数バリエーション + ふせんメモを自由配置
// データは localStorage 永続化 (バックエンド連携は後フェーズ)
// ════════════════════════════════════════════════════
const PLAN_BOARD_PREFIX = "fi_plan_board_";

export function loadPlanBoard(boardId) {
  try {
    const raw = localStorage.getItem(PLAN_BOARD_PREFIX + boardId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
export function savePlanBoard(board) {
  try { localStorage.setItem(PLAN_BOARD_PREFIX + board.id, JSON.stringify(board)); } catch {}
}
export function listPlanBoards() {
  const list = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PLAN_BOARD_PREFIX)) {
        const v = JSON.parse(localStorage.getItem(k) || "null");
        if (v && v.id) list.push({ id: v.id, name: v.name, itemCount: (v.items || []).length, updatedAt: v.updatedAt });
      }
    }
  } catch {}
  return list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

// ── 複数ボード: ファイル(正本) + localStorage(キャッシュ) の二層保存 ──
// localStorage は即時キャッシュ、boards/<id>.json (API) が正本。
const _boardSaveTimers = {};
export async function loadPlanBoardFile(id) {
  try {
    const res = await fetch(API + "/api/boards/" + encodeURIComponent(id));
    if (res.ok) {
      const b = await res.json();
      try { savePlanBoard(b); } catch {}           // refresh cache
      return b;
    }
  } catch {}
  return loadPlanBoard(id);                          // offline / not-found fallback
}
export function savePlanBoardFile(board) {
  if (!board || !board.id) return;
  // 1) localStorage 即時 (updatedAt はキャッシュ側で付ける)
  try { savePlanBoard({ ...board, updatedAt: new Date().toISOString() }); } catch {}
  // 2) ファイルへは 800ms デバウンスで PUT
  const id = board.id;
  if (_boardSaveTimers[id]) clearTimeout(_boardSaveTimers[id]);
  _boardSaveTimers[id] = setTimeout(() => {
    fetch(API + "/api/boards/" + encodeURIComponent(id), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(board),
    }).catch(() => {});
  }, 800);
}
export async function listBoardsFile() {
  try {
    const res = await fetch(API + "/api/boards");
    if (res.ok) return await res.json();
  } catch {}
  return listPlanBoards();                           // fallback to localStorage list
}
export async function createBoardFile(name) {
  const res = await fetch(API + "/api/boards", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name || "無題のボード" }),
  });
  if (!res.ok) throw new Error("ボードの作成に失敗しました");
  return await res.json();
}
export async function deleteBoardFile(id) {
  try {
    const res = await fetch(API + "/api/boards/" + encodeURIComponent(id), { method: "DELETE" });
    try { localStorage.removeItem(PLAN_BOARD_PREFIX + id); } catch {}
    return res.ok;
  } catch { return false; }
}
export function fmtBoardDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return "—"; }
}
