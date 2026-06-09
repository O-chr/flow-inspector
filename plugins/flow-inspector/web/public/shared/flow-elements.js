/**
 * Flow Inspector — Shared Element Design System
 *
 * マスター定義: 8093 (whiteboard) で確定 → 8092/8091 で参照
 * プラグイン配信時はこのファイルをバンドルする
 *
 * 含まれるもの:
 *   - NODE_TYPES (NT): 全ノードタイプの色・ラベル・アイコン
 *   - CSS Variables: テーマカラー定義
 *   - shapeMeta(): タイプ → 形状パラメータ
 *   - ShapeEl: SVG形状レンダリング (React component)
 *   - AccentBar: ノード装飾 (React component)
 *   - NodeCard: 完全なノードカード (React component)
 *   - ELEMENTS: 全要素データ (Tier 1-3)
 *
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════
// DIMENSIONS
// ═══════════════════════════════════════════════════════

const FI_NODE_W = 220;
const FI_NODE_H = 78;
const FI_DIAMOND_W = 170;
const FI_DIAMOND_H = 110;

// ═══════════════════════════════════════════════════════
// CSS VARIABLES (inject into :root)
// ═══════════════════════════════════════════════════════

const FI_CSS_VARS = `
  --c-parent:   #2563eb;
  --c-subagent: #7c3aed;
  --c-think:    #7c3aed;
  --c-mcp:      #15803d;
  --c-hook:     #c2410c;
  --c-code:     #525252;
  --c-user:     #a16207;
  --c-decision: #1f2937;
  --c-skill:    #0891b2;
  --c-command:  #6d28d9;
  --c-config:   #78716c;
  --c-api:      #0d9488;
  --c-plugin:   #4f46e5;
  --c-agentsdk: #be185d;
`;

// ═══════════════════════════════════════════════════════
// NODE TYPES — Master Definition
// ═══════════════════════════════════════════════════════

const FI_NODE_TYPES = {
  parent:   { label: "親エージェント",   color: "var(--c-parent)",   raw: "#2563eb", icon: "◆" },
  subagent: { label: "サブエージェント", color: "var(--c-subagent)", raw: "#7c3aed", icon: "◇" },
  think:    { label: "Claude呼び出し",   color: "var(--c-think)",    raw: "#7c3aed", icon: "💭" },
  mcp:      { label: "MCP連携",         color: "var(--c-mcp)",      raw: "#15803d", icon: "↗" },
  hook:     { label: "フック",           color: "var(--c-hook)",     raw: "#c2410c", icon: "⌘" },
  code:     { label: "コード実行",       color: "var(--c-code)",     raw: "#525252", icon: "▷" },
  user:     { label: "ユーザー操作",     color: "var(--c-user)",     raw: "#a16207", icon: "○" },
  decision: { label: "分岐判定",         color: "var(--c-decision)", raw: "#1f2937", icon: "?" },
  skill:    { label: "スキル",           color: "var(--c-skill)",    raw: "#0891b2", icon: "★" },
  command:  { label: "コマンド",         color: "var(--c-command)",  raw: "#6d28d9", icon: "/" },
  config:   { label: "設定",             color: "var(--c-config)",   raw: "#78716c", icon: "⚙" },
  api:      { label: "API",              color: "var(--c-api)",      raw: "#0d9488", icon: "⇄" },
  plugin:   { label: "プラグイン",       color: "var(--c-plugin)",   raw: "#4f46e5", icon: "⚡" },
  agentsdk: { label: "Agent SDK",        color: "var(--c-agentsdk)", raw: "#be185d", icon: "⊞" },
  trigger:  { label: "トリガー",         color: "#d97706",           raw: "#d97706", icon: "▶" },
};

// ═══════════════════════════════════════════════════════
// SHAPE META — type → geometry parameters
// ═══════════════════════════════════════════════════════

function fiShapeMeta(type) {
  switch (type) {
    case "parent":   return { kind: "rect",    rx: 10,            padL: 16 };
    case "code":     return { kind: "sharp",   rx: 2,             padL: 14 };
    case "mcp":      return { kind: "pill",                       padL: 26 };
    case "subagent": return { kind: "hex",     inset: 16,         padL: 28 };
    case "think":    return { kind: "rect",    rx: 14,            padL: 16 };
    case "hook":     return { kind: "para",    skew: 14,          padL: 22 };
    case "user":     return { kind: "octa",    chamfer: 16,       padL: 22 };
    case "decision": return { kind: "diamond",                    padL: 0  };
    case "skill":    return { kind: "rect",    rx: 10,            padL: 16 };
    case "command":  return { kind: "sharp",   rx: 2,             padL: 14 };
    case "config":   return { kind: "rect",    rx: 9,             padL: 16 };
    case "api":      return { kind: "pill",                       padL: 26 };
    case "plugin":   return { kind: "tab",     notch: 10,         padL: 18 };
    case "agentsdk": return { kind: "trap",    inset: 12,         padL: 20 };
    default:         return { kind: "rect",    rx: 9,             padL: 16 };
  }
}

// ═══════════════════════════════════════════════════════
// SHAPE RENDERING — SVG React Components
// ═══════════════════════════════════════════════════════

function FIShapeEl({ type, x, y, w, h, stroke, strokeWidth, className }) {
  const m = fiShapeMeta(type);
  const p = { className, stroke, strokeWidth };
  if (m.kind === "rect" || m.kind === "sharp") return React.createElement("rect", { ...p, x, y, width: w, height: h, rx: m.rx });
  if (m.kind === "pill") return React.createElement("rect", { ...p, x, y, width: w, height: h, rx: h / 2 });
  if (m.kind === "hex") { const i = m.inset; const pts = [[x+i,y],[x+w-i,y],[x+w,y+h/2],[x+w-i,y+h],[x+i,y+h],[x,y+h/2]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  if (m.kind === "para") { const s = m.skew; const pts = [[x+s,y],[x+w,y],[x+w-s,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  if (m.kind === "octa") { const c = m.chamfer; const pts = [[x+c,y],[x+w-c,y],[x+w,y+c],[x+w,y+h-c],[x+w-c,y+h],[x+c,y+h],[x,y+h-c],[x,y+c]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  if (m.kind === "tab") { const n = m.notch; const pts = [[x,y+n],[x+n,y],[x+w,y],[x+w,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  if (m.kind === "trap") { const i = m.inset; const pts = [[x+i,y],[x+w-i,y],[x+w,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  if (m.kind === "diamond") { const pts = [[x+w/2,y],[x+w,y+h/2],[x+w/2,y+h],[x,y+h/2]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  return null;
}

function FIAccentBar({ type, x, y, w, h, color }) {
  const m = fiShapeMeta(type);
  if (m.kind === "pill") return React.createElement("circle", { cx: x + 14, cy: y + h/2, r: 5, fill: color });
  if (m.kind === "para") { const s = m.skew; const pts = [[x+s,y],[x+s+4,y],[x+4,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { points: pts, fill: color }); }
  if (m.kind === "hex") { const pts = [[x+4,y+h/2-6],[x+12,y+h/2],[x+4,y+h/2+6],[x-2,y+h/2]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { points: pts, fill: color }); }
  if (m.kind === "octa") return React.createElement("rect", { x, y: y+14, width: 4, height: h-28, rx: 2, fill: color });
  if (m.kind === "sharp") return React.createElement("text", { x: x+8, y: y+h/2+4, className: "sharp-prompt", style: { fill: color } }, "$_");
  if (m.kind === "tab") { const n = m.notch; const pts = [[x,y+n],[x+4,y+n],[x+4,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { points: pts, fill: color }); }
  if (m.kind === "trap") { const i = m.inset; const pts = [[x+i,y],[x+i+4,y],[x+4,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { points: pts, fill: color }); }
  return React.createElement("rect", { x, y, width: 4, height: h, rx: 2, fill: color });
}

// ═══════════════════════════════════════════════════════
// NODE BOUNDS HELPER
// ═══════════════════════════════════════════════════════

function fiNodeBounds(node) {
  const isDiamond = fiShapeMeta(node.type).kind === "diamond";
  const w = isDiamond ? FI_DIAMOND_W : FI_NODE_W;
  const h = isDiamond ? FI_DIAMOND_H : FI_NODE_H;
  return { x: node.x - w / 2, y: node.y - h / 2, w, h };
}

// ═══════════════════════════════════════════════════════
// EXPORT to global scope
// ═══════════════════════════════════════════════════════

window.FI = {
  NODE_W: FI_NODE_W,
  NODE_H: FI_NODE_H,
  DIAMOND_W: FI_DIAMOND_W,
  DIAMOND_H: FI_DIAMOND_H,
  CSS_VARS: FI_CSS_VARS,
  NODE_TYPES: FI_NODE_TYPES,
  shapeMeta: fiShapeMeta,
  ShapeEl: FIShapeEl,
  AccentBar: FIAccentBar,
  nodeBounds: fiNodeBounds,
  version: "1.0.0",
};

// Also export as individual globals for backward compatibility
window.FI_NODE_TYPES = FI_NODE_TYPES;
window.fiShapeMeta = fiShapeMeta;
window.FIShapeEl = FIShapeEl;
window.FIAccentBar = FIAccentBar;

// ═══════════════════════════════════════════════════════
// TYPE_SPECS — Detail Panel master definition
// (moved from whiteboard.html 1745-2729 — マスター: 8093 で確定)
// ═══════════════════════════════════════════════════════

window.FI.TYPE_SPECS = {
  hook: {
    base: "Claudeの処理の特定タイミングに介入して、自動でチェックや処理を行う要素です。settings.json の hooks セクションで定義。",
    flowGuide: {
      what:    "どの Hook イベント (PreToolUse / PostToolUse / SessionStart / Stop / ...) に反応するか",
      target:  "matcher の値 (Bash や Edit|Write などのツール名、startup などの開始理由)",
      content: "ハンドラー種別 (command/prompt/agent/http/mcp_tool) + 実行内容 (コマンド/プロンプト/URL等)",
      summary: "matcher 一致時に自動でハンドラーを実行 → exit code 2 でブロック可能なイベントもある",
    },
    steps: [
      "対象パターン (matcher) に一致するイベントが発生したらフック発動",
      "指定されたハンドラー (command / prompt / agent / http / mcp_tool) を実行",
      "結果が正常 → 処理続行 + 必要なら additionalContext を Claude に注入",
      "exit code 2 → ツール実行などをブロック (ブロック可能イベントのみ)",
      "タイムアウト → スキップして続行",
    ],
    io: { in: "イベント情報 (tool_name / tool_input / prompt 等、イベントごとに違う)", out: "allow/deny/ask 判定 / additionalContext / toolInputModification (イベントごとに違う)" },
    // ブロック可能イベント (permission_decision を表示する対象)。公式docs準拠。
    blockableEvents: ["PreToolUse","UserPromptSubmit","Stop","SubagentStop","PermissionRequest","PreCompact","Elicitation","WorktreeCreate","ConfigChange","TeammateIdle","TaskCompleted"],
    // セクション分けで「フロー固有」「フック動作」「定義」を分離
    fieldSections: [
      { key: "trigger",   title: "🟧 発動条件",                desc: "どんな対象でフックを動かすか" },
      { key: "handler",   title: "🟨 ハンドラー (実行内容)",    desc: "matcher 一致時に何を実行するか" },
      { key: "control",   title: "🟦 制御",                    desc: "タイムアウト・非同期・権限判定など" },
      { key: "io",        title: "🟩 入出力 (フロー固有)",      desc: "このフックが受け取る情報と返す情報" },
    ],
    fields: [
      // 🟧 trigger — 全 Hook 共通の最小フィールド
      { section: "trigger", key: "matcher",          label: "対象パターン", desc: "イベントごとに意味が違う (ツール名 / 開始理由 / ファイル名 / 通知種別 等)", required: true },
      { section: "trigger", key: "placement",        label: "配置位置",     desc: "フロー上のどこに置くべきか (バリデーション用)", advanced: true,
        options: ["before-tool","after-tool","tool-batch","before-prompt","before-response-end","session-start","session-end","subagent-start","subagent-stop","file-watch","worktree-create","worktree-remove","before-compact","after-compact","notification","mcp-input-request"],
        info: {
          "before-tool":          "ツール実行ノードの前に配置 (PreToolUse 等)",
          "after-tool":           "ツール実行ノードの後に配置 (PostToolUse 等)",
          "tool-batch":           "並列ツール実行バッチ後に配置",
          "before-prompt":        "ユーザー送信直後に配置 (UserPromptSubmit)",
          "before-response-end":  "応答完了直前に配置 (Stop)",
          "session-start":        "フロー起点に配置 (SessionStart 等)",
          "session-end":          "フロー終端に配置 (SessionEnd)",
          "subagent-start":       "サブエージェント起動時に配置",
          "subagent-stop":        "サブエージェント完了時に配置",
          "file-watch":           "ファイル変更検知時に配置",
          "worktree-create":      "Worktree 作成時に配置",
          "worktree-remove":      "Worktree 削除時に配置",
          "before-compact":       "コンパクション前に配置 (PreCompact)",
          "after-compact":        "コンパクション後に配置 (PostCompact)",
          "notification":         "通知発生時に配置 (Notification)",
          "mcp-input-request":    "MCP入力要求時に配置 (Elicitation)"
        } },
      // 🟨 handler — ハンドラー種別のみ共通。具体的なフィールドは fieldsByHandler で動的切替
      { section: "handler", key: "handler_type",     label: "ハンドラー種別", desc: "何を実行するか", options: ["command","prompt","agent","http","mcp_tool"], required: true,
        info: {
          command:  "シェル (ターミナル) のコマンドを直接走らせる。フックが反応した時に prettier や npm test を実行するなど、最も汎用的なハンドラー。タイムアウトはデフォルト 600 秒。",
          prompt:   "Claude (デフォルトで Haiku) に短い指示文を評価させる。「この入力は危ないか?」のような軽い判定を LLM に任せたい時に使う。タイムアウトは 30 秒。",
          agent:    "サブエージェントを起動して判断を任せる。Read / Grep / Glob が使えるので、ファイルを読みながら考えてほしい高度な判定向き。タイムアウトは 60 秒。",
          http:     "外部サービスに HTTP リクエストで通知や問い合わせを送る。Slack Webhook や自前 API に繋ぐ Webhook 用途。",
          mcp_tool: "MCP サーバーのツールを直接呼び出す。フックの中から Notion 更新や DB 書き込みなど、特定の MCP 機能を走らせたい時に使う。",
        }
      },
      // 🟦 control — 全 Hook 共通
      { section: "control", key: "timeout",          label: "タイムアウト", desc: "最大待ち時間 (秒)。command/http/mcp_tool=600, prompt=30, agent=60, UserPromptSubmit=30" },
      { section: "control", key: "async",            label: "非同期実行",   desc: "false = 同期、async = 投げっぱなし、asyncRewake = バックグラウンド後 exit 2 で復帰", options: ["false","async","asyncRewake"], advanced: true,
        info: {
          false: "同期実行。フックが完了するまで Claude は待つ。デフォルト。",
          async: "投げっぱなし (バックグラウンド実行)。結果を待たない。ログ記録など副作用だけ欲しい時に。",
          asyncRewake: "バックグラウンド実行 + exit code 2 で戻ってきた時だけ Claude を呼び戻して理由を伝える。失敗時の通知に。"
        } },
      // permission_decision は blockableEvents のみ表示 (DetailPanel で動的フィルタ)
      { section: "control", key: "permission_decision", label: "権限判定",  desc: "ツール実行を allow/deny/ask で制御", options: ["allow","deny","ask","defer"], blockableOnly: true,
        info: {
          allow: "ツール実行を許可。通常の動作を続行。",
          deny: "ツール実行を拒否してブロック。stderr のメッセージが Claude に理由として返る。",
          ask: "ユーザーに確認ダイアログを表示。許可するかは人間が決める。",
          defer: "判断を保留して次のフックチェーンに委ねる。"
        } },
      { section: "control", key: "additionalContext", label: "追加コンテキスト", desc: "Claude に注入する追加情報", long: true, advanced: true },
      { section: "control", key: "hookSpecificOutput", label: "固有出力",   desc: "イベント固有のJSON出力 (toolInputModification / worktreePath 等)", long: true, advanced: true },
      // 🟩 io (フロー固有)
      { section: "io",      key: "input",            label: "入力 (IN)",    desc: "このフックが受け取るデータ。イベントによって異なる",  long: true },
      { section: "io",      key: "output",           label: "出力 (OUT)",   desc: "このフックが返すデータ",                              long: true },
    ],
    // 🟨 handler_type 別の動的フィールド (handler_type を選んだ時だけ、対応する追加フィールドを表示)
    fieldsByHandler: {
      command: [
        { section: "handler", key: "command",       label: "コマンド",     desc: "シェルで実行するコマンド (例: bash scripts/validate.sh)", long: true, required: true },
      ],
      prompt: [
        { section: "handler", key: "prompt_text",   label: "評価プロンプト", desc: "Claude (Haiku) に渡す判定指示文", long: true, required: true },
        { section: "handler", key: "prompt_model",  label: "モデル",        desc: "判定に使うモデル", options: ["haiku","sonnet"],
          info: { haiku: "高速・低コスト デフォルト判定向き", sonnet: "高精度 複雑な判定向き" } },
      ],
      agent: [
        { section: "handler", key: "subagent_type", label: "サブエージェント種別", desc: "Explore / Plan / general-purpose / 自作名", required: true },
        { section: "handler", key: "agent_prompt",  label: "プロンプト",    desc: "サブエージェントへの指示文",                     long: true, required: true },
      ],
      http: [
        { section: "handler", key: "url",           label: "URL",          desc: "HTTPリクエストの送信先", required: true },
        { section: "handler", key: "method",        label: "HTTPメソッド", desc: "送信メソッド", options: ["GET","POST","PUT","DELETE"],
          info: {
            GET: "データ取得 (副作用なし)",
            POST: "データ送信 (新規作成)",
            PUT: "データ更新 (全体置換)",
            DELETE: "データ削除"
          } },
        { section: "handler", key: "body",          label: "リクエストボディ", desc: "POST/PUT 時のペイロード (JSON)",                long: true, advanced: true },
      ],
      mcp_tool: [
        { section: "handler", key: "mcp_server",    label: "MCPサーバー",  desc: ".mcp.json の mcpServers キー (例: slack, notion)", required: true },
        { section: "handler", key: "mcp_tool_name", label: "MCPツール名",  desc: "そのサーバーが提供するツール (例: send_message)", required: true },
        { section: "handler", key: "mcp_params",    label: "パラメータ",   desc: "ツールに渡す引数 (JSON)",                            long: true, advanced: true },
      ],
    },
    definition: `// settings.json\n{\n  "hooks": {\n    "PreToolUse": [{\n      "matcher": "Bash",\n      "hooks": [{\n        "type": "command",\n        "command": "bash scripts/validate.sh",\n        "timeout": 30\n      }]\n    }]\n  }\n}`,
  },
  subagent: {
    base: "専門的なAIアシスタントを新たに起動して、特定のタスクを任せる要素です。メインのAIとは独立して動きます。",
    flowGuide: {
      what:    "起動するサブエージェント種別 (Explore / Plan / general-purpose / 自作の専門役)",
      target:  "依頼するタスクの種類とスコープ (何を調査・実装・要約するか)",
      content: "プロンプト本文 (具体的な指示文)、許可するツール、モデル選択",
      summary: "前ステップからのコンテキストを受け取り、別の文脈で自律的にタスクを処理 → 最終結果のみを親に返す",
    },
    steps: [
      "プロンプト（指示文）をサブエージェントに渡す",
      "指定されたモデル（Sonnet/Opus/Haiku）で処理開始",
      "許可されたツール（Read/Grep等）を使いながら自律的にタスク実行",
      "結果をまとめて親エージェントに返す",
    ],
    io: { in: "プロンプト（自然言語の指示）、コンテキスト", out: "タスク実行結果（テキスト/データ）" },
    fieldSections: [
      { key: "request",    title: "🔵 呼び出しリクエスト", desc: "このサブエージェントに何を依頼するか。フローごとに変わる" },
      { key: "execution",  title: "🟣 実行パラメータ",     desc: "モデル/許可ツール/権限/隔離など、どう動かすか" },
      { key: "io_schema",  title: "🟢 入出力の形",         desc: "期待する出力形式・具体例" },
      { key: "definition", title: "⚪ サブエージェント本体の定義", desc: ".claude/agents/*.md の中身。自作の場合のみ意味あり" },
    ],
    fields: [
      // ─── 🔵 request ───
      { section: "request", key: "prompt",       label: "プロンプト",      desc: "サブエージェントへの指示文", long: true, required: true },
      { section: "request", key: "target_files", label: "対象ファイル",    desc: "処理対象のファイル/フォルダ",       multi: true },

      // ─── 🟣 execution ───
      { section: "execution", key: "model", label: "AIモデル", desc: "処理に使うモデル", options: ["sonnet","opus","haiku"],
        info: { sonnet: "バランス型 標準モデル", opus: "高性能 複雑タスク向け", haiku: "高速・低コスト 簡単タスク向け" } },
      { section: "execution", key: "allowed_tools", label: "許可ツール", desc: "このサブエージェントが使えるツール",
        multi: true, choices: ["Read","Write","Edit","MultiEdit","Bash","Grep","Glob","WebFetch","WebSearch","TodoWrite","Task"],
        info: {
          Read: "ファイルを読み取る",
          Write: "ファイルを新規作成・上書き",
          Edit: "ファイルの一部を置換編集",
          MultiEdit: "1ファイル内の複数箇所を一括編集",
          Bash: "シェルコマンドを実行",
          Grep: "ファイル内テキスト検索 (ripgrep)",
          Glob: "ファイル名パターン検索",
          WebFetch: "URLを取得して内容を抽出",
          WebSearch: "Web検索",
          TodoWrite: "セッションのTodoリスト管理",
          Task: "別サブエージェントを起動"
        } },
      { section: "execution", key: "disallowed_tools", label: "禁止ツール", desc: "明示的に使わせないツール",
        multi: true, choices: ["Read","Write","Edit","MultiEdit","Bash","Grep","Glob","WebFetch","WebSearch","TodoWrite","Task"],
        info: {
          Read: "ファイルを読み取る",
          Write: "ファイルを新規作成・上書き",
          Edit: "ファイルの一部を置換編集",
          MultiEdit: "1ファイル内の複数箇所を一括編集",
          Bash: "シェルコマンドを実行",
          Grep: "ファイル内テキスト検索 (ripgrep)",
          Glob: "ファイル名パターン検索",
          WebFetch: "URLを取得して内容を抽出",
          WebSearch: "Web検索",
          TodoWrite: "セッションのTodoリスト管理",
          Task: "別サブエージェントを起動"
        } },
      { section: "execution", key: "permission_mode", label: "権限モード", desc: "ツール実行時の承認レベル",
        options: ["default","acceptEdits","plan","bypassPermissions"],
        info: {
          default: "毎回ユーザーに確認",
          acceptEdits: "編集系は自動承認",
          plan: "計画のみ (書き込み禁止)",
          bypassPermissions: "全ツールを承認なしで実行 (上級者向け)"
        } },
      { section: "execution", key: "isolation", label: "隔離実行", desc: "Git worktreeで隔離するか", options: ["none","worktree"],
        info: { none: "本体と同じディレクトリで動く", worktree: "別worktreeで隔離 (本体を汚さない)" } },

      // ─── 🟢 io_schema ───
      { section: "io_schema", key: "output_schema", label: "出力スキーマ",   desc: "期待する出力形式 (JSON Schema / 自由記述)", long: true },
      { section: "io_schema", key: "expected_io",   label: "期待 IN/OUT 例", desc: "実行例の具体記述",                          long: true },

      // ─── ⚪ definition (自作の場合のみ) ───
      { section: "definition", key: "file",        label: "ファイルパス",  desc: ".claude/agents/*.md の保存先" },
      { section: "definition", key: "name",        label: "エージェント名", desc: "識別子", required: true, authoringOnly: true },
      { section: "definition", key: "description", label: "発動トリガー",  desc: "Task ツール経由で選ばれるトリガー文",   long: true, required: true, authoringOnly: true },
      { section: "definition", key: "builtin",     label: "組込み",        desc: "Anthropic組込みのbuiltin agentか", options: ["false","true"],
        info: { false: "自作のサブエージェント", true: "Anthropic組込み (中身は非公開)" } },
    ],
    definition: `// .claude/agents/deploy-checker.md\n---\nmodel: haiku\nallowed_tools:\n  - Read\n  - Bash\n  - Grep\n---\nデプロイ前のチェックリストを確認して...`,
  },
  think: {
    base: "メインClaude自身に推論させるステップ (Claude呼び出し) を表します。サブエージェントを起動せず、現在の会話の延長で執筆・要約・リサーチ・レビュー・整形などの LLM 呼び出しを行います。",
    flowGuide: {
      what:    "メインClaudeに何をさせたいか (執筆 / 構成設計 / レビュー / 整形 等)",
      target:  "出力の対象 (ドラフト本文 / 構成案 / レビューコメント / 修正後テキスト 等)",
      content: "Claudeに渡すプロンプト本文 + 形式・観点・トーン",
      summary: "現在の文脈とプロンプトを Claude に投げて出力を得る → 次ステップへ渡す",
    },
    steps: [
      "前のステップから素材 (リサーチ結果・ブリーフ・観点リスト 等) を受け取る",
      "現在の文脈にプロンプト本文を合成して Claude に送る",
      "返ってきた出力 (本文・要約・レビュー・修正案 等) を成果物として保持",
      "結果を次のステップに渡す",
    ],
    io: { in: "前ステップの素材 + プロンプト", out: "Claude が返した成果物 (テキスト / 構成案 / レビュー 等)" },
    fields: [
      { key: "prompt",       label: "プロンプト",       desc: "Claude に投げる指示文。前ステップの素材を踏まえて、何を・どんな観点で・どんな形式で出力させるかを書く",  long: true, required: true },
      { key: "tone",         label: "トーン",           desc: "出力の文体・口調",  options: ["丁寧","フランク","技術的","ビジネス","学術"], advanced: true },
    ],
    definition: `// メインClaude自身による LLM 呼び出しステップ\n// 設定ファイルは持たず、プロンプトと\n// 前ステップの素材だけで動く`,
  },
  mcp: {
    base: "外部サービス（Slack、GitHub、Google Drive等）と接続して、データの取得や操作を行う要素です。",
    flowGuide: {
      what:    "接続するMCPサーバー (slack / notion / github / canva-mcp / 自作) と、操作種別 (tool/resource/prompt)",
      target:  "サーバー側で定義された tool 名 / resource URI / prompt 名",
      content: "ツール引数 (JSON) や検索クエリ、書き込み内容",
      summary: "前ステップから受け取った情報を使って外部サービスに API 呼び出し → 結果 (投稿ID/検索結果/レスポンス) を次ステップへ",
    },
    // 共通フォールバック (meta.action 未指定時)
    steps: [
      "指定されたMCPサーバーに接続",
      "認証を確認（OAuth等、初回のみ）",
      "操作種別 (tool / resource / prompt) に応じて呼び出し",
      "レスポンスを受け取って次のステップへ渡す",
    ],
    io: { in: "操作種別 + パラメータ", out: "サービスからのレスポンス" },
    fieldSections: [
      { key: "request",    title: "🔵 呼び出しリクエスト", desc: "どのツール/リソースを、どんなパラメータで呼ぶか" },
      { key: "execution",  title: "🟣 実行パラメータ",     desc: "操作種別と認証方式" },
      { key: "io_schema",  title: "🟢 入出力の形",         desc: "期待する出力スキーマ・具体例" },
      { key: "definition", title: "⚪ サーバー本体の定義",  desc: ".mcp.json の中身 + 利用可能な capabilities" },
    ],
    // 共通フィールド
    fields: [
      // 🟣 execution (操作種別と認証)
      { section: "execution", key: "action", label: "操作種別", desc: "MCPの3要素のどれを呼ぶか",
        options: ["tool","resource","prompt"], required: true,
        info: {
          tool: "サーバーが提供する操作 (send_message 等)",
          resource: "サーバー上のリソース参照 (読み取り専用)",
          prompt: "サーバー定義のプロンプトテンプレート"
        } },
      { section: "execution", key: "auth", label: "認証方式", desc: "認証の取り方",
        options: ["oauth","api_key","none"],
        info: {
          oauth: "ブラウザでログインしてトークン取得",
          api_key: "APIキーを環境変数等で渡す",
          none: "認証不要 (ローカルサーバー等)"
        } },
      // 🟢 io_schema
      { section: "io_schema", key: "output_schema", label: "出力スキーマ",   desc: "期待する出力形式 (JSON Schema / 自由記述)", long: true },
      { section: "io_schema", key: "expected_io",   label: "期待 IN/OUT 例", desc: "実行例の具体記述",                          long: true },
      // ⚪ definition (サーバー本体)
      { section: "definition", key: "server", label: "サーバー名", desc: "接続先 (.mcp.json の mcpServers キー)", required: true, authoringOnly: true },
    ],
    definition: `// .mcp.json — サーバー定義の例\n{\n  "mcpServers": {\n    "slack": {\n      "command": "npx",\n      "args": ["-y", "@anthropic/slack-mcp"],\n      "env": { "SLACK_TOKEN": "xoxb-..." }\n    }\n  }\n}`,

    // 🔵 request: 操作種別 (action) ごとの追加フィールド
    fieldsByAction: {
      tool: [
        { section: "request", key: "tool_name", label: "ツール名",   desc: "サーバーが提供するtool (例: send_message)。capabilities セクションで複数選択も可", required: true },
        { section: "request", key: "params",    label: "パラメータ", desc: "ツールに渡す引数 (JSON)", long: true },
      ],
      resource: [
        { section: "request", key: "resource_uri", label: "リソースURI", desc: "参照するリソースのURI (例: notion://page/abc)", required: true },
      ],
      prompt: [
        { section: "request", key: "prompt_name", label: "プロンプト名", desc: "サーバー定義のプロンプトテンプレート名", required: true },
        { section: "request", key: "arguments",   label: "引数",         desc: "プロンプトに渡す引数 (JSON)", long: true },
      ],
    },
    stepsByAction: {
      tool: [
        "サーバーに接続して認証確認",
        "tool_name で目的のツールを指定",
        "params をパラメータとして渡して実行",
        "サービス側で処理 → JSONレスポンスを返却",
      ],
      resource: [
        "サーバーに接続して認証確認",
        "resource_uri で参照したいリソースを指定",
        "サーバーがリソース内容を読み取って返却",
        "テキスト/JSON/バイナリを次ステップへ渡す",
      ],
      prompt: [
        "サーバーに接続",
        "prompt_name で事前定義のプロンプトを取得",
        "arguments で穴埋め",
        "完成したプロンプトを Claude に渡す",
      ],
    },
    ioByAction: {
      tool:     { in: "server + tool_name + params",      out: "ツール実行結果 (JSON)" },
      resource: { in: "server + resource_uri",            out: "リソース内容 (テキスト/JSON/バイナリ)" },
      prompt:   { in: "server + prompt_name + arguments", out: "完成したプロンプト文字列" },
    },
  },
  code: {
    base: "ファイルの読み書き、コマンド実行、検索などの基本操作を行う要素です。Claudeが手足のように使うツールです。",
    flowGuide: {
      what:    "使うツール (Read / Write / Edit / Bash / Grep / Glob / WebFetch / WebSearch 等) を選択",
      target:  "対象ファイルのパス、Bashコマンド文字列、検索パターン、URL など",
      content: "ツール固有の追加パラメータ (offset/limit / replace_all / timeout / matcher 等)",
      summary: "前ステップから受け取ったパスや指示を使ってツール実行 → 結果 (テキスト/JSON/exit code) を次へ",
    },
    // タイプ共通フォールバック (meta.tool 未設定時)
    steps: [
      "ツール固有のパラメータを受け取る（パス、コマンド等）",
      "ツールを実行（ファイル操作/シェル実行/検索等）",
      "実行結果を次のステップに渡す",
    ],
    io: { in: "ツール固有のパラメータ（path, command, pattern等）", out: "実行結果（テキスト、JSON、成功/失敗）" },
    fieldSections: [
      { key: "request",   title: "🔵 呼び出しリクエスト", desc: "このツールに何を渡すか" },
      { key: "execution", title: "🟣 実行パラメータ",     desc: "どう動かすか (timeout / フラグ等)" },
      { key: "io_schema", title: "🟢 入出力の形",         desc: "期待する出力形式・具体例 (任意)" },
    ],
    fields: [
      { section: "request", key: "tool", label: "ツール名", desc: "使用するビルトインツール",
        options: ["Read","Write","Edit","MultiEdit","NotebookEdit","Bash","Grep","Glob","WebFetch","WebSearch","TodoWrite","Task"], required: true,
        info: {
          Read: "ファイルを読み取る",
          Write: "ファイルを新規作成・上書き",
          Edit: "ファイルの一部を置換編集",
          MultiEdit: "1ファイル内の複数箇所を一括編集",
          NotebookEdit: "Jupyter ノートブックのセルを編集",
          Bash: "シェルコマンドを実行",
          Grep: "ファイル内テキスト検索 (ripgrep)",
          Glob: "ファイル名パターン検索",
          WebFetch: "URLを取得して内容を抽出",
          WebSearch: "Web検索",
          TodoWrite: "セッションのTodoリスト管理",
          Task: "サブエージェントを起動"
        } },
    ],
    definition: `// tool_use ブロック\n{\n  "type": "tool_use",\n  "name": "Read",\n  "input": { "file_path": "/path/to/file.md" }\n}`,

    // ツール別の詳細定義。各 entry に section を付けて 4 ブロック分類。
    fieldsByTool: {
      Read: [
        { section: "request", key: "file_path", label: "ファイルパス", desc: "読み取る対象ファイル（絶対パス）", required: true },
        { section: "request", key: "offset",    label: "開始行",       desc: "何行目から読むか（任意）" },
        { section: "request", key: "limit",     label: "行数",         desc: "読み込む最大行数（任意、デフォルト2000）" },
        { section: "request", key: "pages",     label: "PDFページ範囲", desc: "PDF時のページ指定 (例: 1-5)" },
      ],
      Write: [
        { section: "request", key: "file_path", label: "ファイルパス", desc: "書き込み先（既存なら上書き）", required: true },
        { section: "request", key: "content",   label: "書き込み内容", desc: "ファイル全文",                long: true, required: true },
      ],
      Edit: [
        { section: "request",   key: "file_path",   label: "ファイルパス", desc: "編集対象ファイル", required: true },
        { section: "request",   key: "old_string",  label: "置換前",       desc: "置き換える元の文字列",       long: true, required: true },
        { section: "request",   key: "new_string",  label: "置換後",       desc: "置き換え後の文字列",         long: true, required: true },
        { section: "execution", key: "replace_all", label: "全箇所置換",   desc: "true で全一致を置換",        options: ["false","true"],
          info: { false: "最初の1箇所だけ置換 (デフォルト)", true: "ファイル内の全一致を置換" } },
      ],
      MultiEdit: [
        { section: "request", key: "file_path", label: "ファイルパス", desc: "編集対象ファイル", required: true },
        { section: "request", key: "edits",     label: "編集リスト",   desc: "[{old_string, new_string, replace_all?}, …]", long: true, required: true },
      ],
      NotebookEdit: [
        { section: "request",   key: "notebook_path", label: "ノートブックパス", desc: ".ipynb ファイル（絶対パス）", required: true },
        { section: "request",   key: "cell_id",       label: "セルID",          desc: "編集対象セル（任意、未指定で末尾追加）" },
        { section: "request",   key: "new_source",    label: "新しいセル内容",  desc: "セルに入れる本文",       long: true, required: true },
        { section: "execution", key: "cell_type",     label: "セル種別",        desc: "code / markdown",       options: ["code","markdown"],
          info: { code: "コードセル (Python等が実行される)", markdown: "Markdownセル (ドキュメント)" } },
        { section: "execution", key: "edit_mode",     label: "編集モード",      desc: "replace / insert / delete", options: ["replace","insert","delete"],
          info: { replace: "既存セルの内容を置き換え", insert: "新規セルを挿入", delete: "セルを削除" } },
      ],
      Grep: [
        { section: "request",   key: "pattern",     label: "検索パターン",  desc: "正規表現 (ripgrep構文)", long: true, required: true },
        { section: "request",   key: "path",        label: "検索対象パス",  desc: "ファイル/フォルダ (省略時は現在の作業ディレクトリ)" },
        { section: "request",   key: "glob",        label: "ファイル絞込",  desc: 'glob で対象ファイルを限定 (例: "*.ts", "**/src/**")' },
        { section: "request",   key: "type",        label: "ファイル種別",  desc: 'ripgrep の type 名 (例: "js", "py", "rust")' },
        { section: "execution", key: "output_mode", label: "出力モード",    desc: "content=本文 / files_with_matches=ファイル名のみ / count=件数のみ", options: ["content","files_with_matches","count"],
          info: { content: "マッチ行の本文＋ファイル名", files_with_matches: "ファイル名のみ (デフォルト)", count: "ファイル別マッチ数" } },
        { section: "execution", key: "-i",          label: "大小文字無視",  desc: "true で case-insensitive 検索", options: ["false","true"],
          info: { false: "大小文字を区別する (デフォルト)", true: "大小文字を区別せず検索" } },
        { section: "execution", key: "-n",          label: "行番号表示",    desc: "true でマッチ箇所に行番号を付ける (content モード時)", options: ["false","true"],
          info: { false: "行番号を付けない", true: "マッチ箇所に行番号を付ける" } },
        { section: "execution", key: "-C",          label: "前後表示",      desc: "マッチ前後 N 行も表示 (任意)" },
        { section: "execution", key: "multiline",   label: "複数行マッチ",  desc: "改行をまたぐ正規表現を許可", options: ["false","true"],
          info: { false: "1行内で正規表現を評価 (デフォルト)", true: "改行をまたぐ正規表現を許可" } },
        { section: "execution", key: "head_limit",  label: "件数上限",      desc: "結果先頭 N 件で打ち切り (任意)" },
      ],
      Glob: [
        { section: "request", key: "pattern", label: "globパターン", desc: 'ファイル名パターン (例: "**/*.ts", "src/**/*.{js,jsx}")', required: true },
        { section: "request", key: "path",    label: "検索開始パス", desc: "省略時は現在の作業ディレクトリ" },
      ],
      Bash: [
        { section: "request",   key: "command",            label: "コマンド",         desc: "実行するシェルコマンド", long: true, required: true },
        { section: "request",   key: "description",        label: "説明",             desc: "5〜10語の短い説明（ログ用）" },
        { section: "execution", key: "timeout",            label: "タイムアウト",      desc: "最大待ち時間 ms (デフォ120000、最大600000)" },
        { section: "execution", key: "run_in_background",  label: "バックグラウンド",  desc: "true で投げっぱなしにして他の作業を続ける", options: ["false","true"],
          info: { false: "完了まで待つ (デフォルト)", true: "バックグラウンド実行で shell_id を返す" } },
      ],
      BashOutput: [
        { section: "request",   key: "bash_id", label: "シェルID",     desc: "run_in_background で起動したBashのID", required: true },
        { section: "execution", key: "filter",  label: "出力フィルタ", desc: "正規表現で出力行を絞り込む（任意）" },
      ],
      KillBash: [
        { section: "request", key: "shell_id", label: "シェルID", desc: "停止するバックグラウンドBashのID", required: true },
      ],
      WebFetch: [
        { section: "request", key: "url",    label: "URL",      desc: "取得対象URL（HTTPはHTTPSへ自動アップグレード）", required: true },
        { section: "request", key: "prompt", label: "抽出指示", desc: "ページから何を抜き出すかの指示文（小さいモデルが先に処理）", long: true, required: true },
      ],
      WebSearch: [
        { section: "request",   key: "query",           label: "検索クエリ",   desc: "Web検索キーワード", required: true },
        { section: "execution", key: "allowed_domains", label: "許可ドメイン", desc: "このドメインの結果のみ含める（任意）", multi: true },
        { section: "execution", key: "blocked_domains", label: "除外ドメイン", desc: "このドメインの結果を除外（allowed_domains と排他）", multi: true },
      ],
      TodoWrite: [
        { section: "request", key: "todos", label: "Todoリスト", desc: "[{content, activeForm, status}, …] の配列", long: true, required: true },
      ],
      Task: [
        { section: "request",   key: "subagent_type",     label: "サブエージェント種別", desc: "Explore / Plan / general-purpose / カスタム名",
          options: ["Explore","Plan","general-purpose"], required: true,
          info: {
            Explore: "コードベース探索専用 (読み取り専用)",
            Plan: "実装計画立案専用",
            "general-purpose": "汎用 (調査+実行+修正の万能型)"
          } },
        { section: "request",   key: "description",       label: "説明",                 desc: "3〜5語の短いタスク説明（UI表示用）" },
        { section: "request",   key: "prompt",            label: "プロンプト",           desc: "サブエージェントへの詳細指示文", long: true, required: true },
        { section: "execution", key: "run_in_background", label: "バックグラウンド",     desc: "true で並行実行", options: ["false","true"],
          info: { false: "完了まで待つ (デフォルト)", true: "バックグラウンドで並行実行" } },
        { section: "execution", key: "isolation",         label: "隔離実行",             desc: "worktree で git worktree 隔離", options: ["none","worktree"],
          info: { none: "本体と同じディレクトリで動く", worktree: "別worktreeで隔離 (本体を汚さない)" } },
      ],
      SlashCommand: [
        { section: "request", key: "command", label: "コマンド", desc: "実行する/コマンド (例: \"/init\", \"/review pr-123\")", required: true },
      ],
      EnterPlanMode: [],  // パラメータなし
      ExitPlanMode: [
        { section: "request", key: "plan", label: "プラン", desc: "ユーザーに提示する作業計画（Markdown）", long: true, required: true },
      ],
    },

    // ツール別の概要ステップ
    stepsByTool: {
      Read: [
        "file_path を受け取る",
        "ファイルを開いて中身を読み込む",
        "（offset/limit 指定があれば範囲を絞る）",
        "テキストを返す（行番号付き）",
      ],
      Write: [
        "file_path と content を受け取る",
        "既存ファイルがあれば丸ごと上書き、なければ新規作成",
        "書き込み成功/失敗を返す",
      ],
      Edit: [
        "file_path、old_string、new_string を受け取る",
        "ファイル内で old_string を探す（一意でないとエラー）",
        "見つかった箇所を new_string に置換",
        "成功/失敗を返す",
      ],
      MultiEdit: [
        "file_path と edits 配列を受け取る",
        "edits を順番に1つずつ適用していく",
        "全部成功した時だけ反映、途中失敗ならすべて巻き戻し",
        "成功/失敗を返す",
      ],
      NotebookEdit: [
        "notebook_path・cell_id・edit_mode を受け取る",
        "ノートブックを開いて対象セルを特定",
        "edit_mode に従って置換/挿入/削除",
        "結果を返す",
      ],
      Grep: [
        "pattern と検索範囲（path / glob / type）を受け取る",
        "ripgrep でファイル内を高速検索",
        "output_mode に応じて結果を整形 (本文 / ファイル名一覧 / 件数)",
        "head_limit があれば先頭 N 件で打ち切って返す",
      ],
      Glob: [
        "globパターンと開始パスを受け取る",
        "パターンに一致するファイルを列挙",
        "更新日時の新しい順にソートして返す",
      ],
      Bash: [
        "command を受け取る",
        "別プロセスでシェル実行 (タイムアウト適用)",
        "run_in_background なら投げっぱなしにして shell_id を返す",
        "通常時は stdout / stderr / exit code を返す（30,000字超は一時ファイルに保存）",
      ],
      BashOutput: [
        "bash_id を受け取る",
        "対象シェルの最新の標準出力/標準エラーを取得",
        "filter があれば正規表現で絞り込み",
        "実行中なら新規追加分、終了なら最終結果を返す",
      ],
      KillBash: [
        "shell_id を受け取る",
        "対象バックグラウンドBashプロセスを終了",
        "停止結果を返す",
      ],
      WebFetch: [
        "url と prompt を受け取る",
        "ページを取得し HTML→Markdown 変換",
        "小さなモデルが prompt に従って必要部分を抽出",
        "抽出結果をテキストで返す（15分間キャッシュ）",
      ],
      WebSearch: [
        "query を受け取る",
        "Anthropic の検索バックエンドで検索（内部で最大8回まで refinement）",
        "allowed/blocked domains で結果を絞り込み",
        "タイトルとURL一覧を返す（本文取得は別途WebFetch）",
      ],
      TodoWrite: [
        "todos 配列を受け取る (content / activeForm / status)",
        "セッションのTodoリストを全置換で更新",
        "UI に最新リストを反映",
      ],
      Task: [
        "subagent_type と prompt を受け取る",
        "別コンテキストでサブエージェントを起動",
        "サブエージェントが自律的にツールを使ってタスク実行",
        "最終結果のみを親に返す（途中経過は親に見えない）",
      ],
      SlashCommand: [
        "command 文字列を受け取る (例: \"/init\")",
        "登録済みコマンドを解決して実行",
        "コマンド実行結果を返す",
      ],
      EnterPlanMode: [
        "Plan モードに入る（書き込み系ツールが禁止される）",
        "コードを読みながら作業計画を組み立てる",
        "計画ができたら ExitPlanMode で提示",
      ],
      ExitPlanMode: [
        "計画書（Markdown）を受け取る",
        "ユーザーに計画を提示して承認を求める",
        "承認されたら通常モードに戻って実装開始",
      ],
    },

    // ツール別の入出力
    ioByTool: {
      Read:         { in: "file_path（+ offset / limit / pages）", out: "ファイルの中身（行番号付きテキスト）" },
      Write:        { in: "file_path + content（全文）",            out: "書き込み成功/失敗" },
      Edit:         { in: "file_path + old_string + new_string",   out: "編集成功/失敗" },
      MultiEdit:    { in: "file_path + edits[]",                   out: "全edits適用の成否（原子的）" },
      NotebookEdit: { in: "notebook_path + cell_id + new_source",  out: "セル更新結果" },
      Grep:         { in: "pattern + 範囲指定 (path/glob/type) + オプション",  out: "マッチ箇所のテキスト or ファイル名一覧 or 件数" },
      Glob:         { in: "globパターン + 検索開始パス",                       out: "マッチしたファイルパスの配列（更新日時順）" },
      Bash:         { in: "command (+ timeout / run_in_background / description)", out: "stdout / stderr / exit code（または shell_id）" },
      BashOutput:   { in: "bash_id (+ filter)",                               out: "対象シェルの最新出力 + 状態" },
      KillBash:     { in: "shell_id",                                          out: "停止結果" },
      WebFetch:     { in: "url + prompt",                                      out: "抽出結果テキスト（小さいモデルが処理済み）" },
      WebSearch:    { in: "query (+ allowed/blocked_domains)",                out: "検索結果のタイトル + URL一覧" },
      TodoWrite:    { in: "todos[]",                                           out: "Todoリスト更新結果" },
      Task:         { in: "subagent_type + prompt (+ オプション)",            out: "サブエージェントの最終結果（テキスト）" },
      SlashCommand: { in: "command文字列 (例: '/init args')",                  out: "コマンド実行結果" },
      EnterPlanMode:{ in: "（パラメータなし）",                                 out: "モード遷移結果" },
      ExitPlanMode: { in: "plan（Markdown形式の計画）",                        out: "ユーザー承認結果" },
    },

    // ツール別の Dev モード定義例
    definitionByTool: {
      Read:         `{\n  "tool": "Read",\n  "input": {\n    "file_path": "/path/to/file.md",\n    "offset": 1,\n    "limit": 200\n  }\n}`,
      Write:        `{\n  "tool": "Write",\n  "input": {\n    "file_path": "/path/to/new.md",\n    "content": "# Hello\\n..."\n  }\n}`,
      Edit:         `{\n  "tool": "Edit",\n  "input": {\n    "file_path": "/path/x.ts",\n    "old_string": "const foo = 1;",\n    "new_string": "const foo = 2;",\n    "replace_all": false\n  }\n}`,
      MultiEdit:    `{\n  "tool": "MultiEdit",\n  "input": {\n    "file_path": "/path/x.ts",\n    "edits": [\n      { "old_string": "foo", "new_string": "bar" },\n      { "old_string": "baz", "new_string": "qux" }\n    ]\n  }\n}`,
      NotebookEdit: `{\n  "tool": "NotebookEdit",\n  "input": {\n    "notebook_path": "/path/x.ipynb",\n    "cell_id": "abc123",\n    "edit_mode": "replace",\n    "new_source": "print('hi')"\n  }\n}`,
      Grep:         `{\n  "tool": "Grep",\n  "input": {\n    "pattern": "function\\\\s+(\\\\w+)",\n    "path": "src/",\n    "glob": "*.ts",\n    "output_mode": "content",\n    "-n": true,\n    "-C": 2,\n    "head_limit": 50\n  }\n}`,
      Glob:         `{\n  "tool": "Glob",\n  "input": {\n    "pattern": "**/*.test.ts",\n    "path": "/path/to/repo"\n  }\n}`,
      Bash:         `{\n  "tool": "Bash",\n  "input": {\n    "command": "npm test -- --coverage",\n    "description": "Run tests with coverage",\n    "timeout": 300000,\n    "run_in_background": false\n  }\n}`,
      BashOutput:   `{\n  "tool": "BashOutput",\n  "input": {\n    "bash_id": "shell_abc123",\n    "filter": "ERROR|FAIL"\n  }\n}`,
      KillBash:     `{\n  "tool": "KillBash",\n  "input": { "shell_id": "shell_abc123" }\n}`,
      WebFetch:     `{\n  "tool": "WebFetch",\n  "input": {\n    "url": "https://example.com/article",\n    "prompt": "この記事の3つの主張を要約して"\n  }\n}`,
      WebSearch:    `{\n  "tool": "WebSearch",\n  "input": {\n    "query": "Claude Code hooks 2026",\n    "allowed_domains": ["anthropic.com", "code.claude.com"]\n  }\n}`,
      TodoWrite:    `{\n  "tool": "TodoWrite",\n  "input": {\n    "todos": [\n      { "content": "実装する", "activeForm": "実装中", "status": "in_progress" },\n      { "content": "テスト書く", "activeForm": "テスト作成中", "status": "pending" }\n    ]\n  }\n}`,
      Task:         `{\n  "tool": "Task",\n  "input": {\n    "subagent_type": "Explore",\n    "description": "認証実装を探す",\n    "prompt": "認証関連のコードがどこに実装されているか調査して..."\n  }\n}`,
      SlashCommand: `{\n  "tool": "SlashCommand",\n  "input": { "command": "/review pr-123" }\n}`,
      EnterPlanMode:`{\n  "tool": "EnterPlanMode",\n  "input": {}\n}`,
      ExitPlanMode: `{\n  "tool": "ExitPlanMode",\n  "input": {\n    "plan": "## 実装計画\\n\\n1. 認証ミドルウェアを追加\\n2. JWT トークン検証ロジック...\\n3. ..."\n  }\n}`,
    },
  },
  parent: {
    base: "フローの起点・終点・統合点に置く「親エージェントそのもの」のマーカーです。具体的な推論内容は持たず、フロー全体の主体 (= Claude エージェント) がそこに存在することを示すだけのノードです。",
    flowGuide: {
      what:    "親エージェントが担う役割 (起点なら受信、終点なら返却、中間なら結果統合)",
      target:  "対象 (=フロー全体)",
      content: "Claude 本体がフローのこの位置で担う責任の説明 (短く)",
      summary: "ノードとして見える形で『ここに親エージェントがいる』を表現する。具体的な LLM プロンプトは持たない (= think との違い)",
    },
    steps: [
      "起点: ユーザー指示や上流入力を受信",
      "終点: 全フローの結果を集約してユーザーに返却",
      "中間 (統合点): 並列ブランチの結果を1点で受け止める",
    ],
    io: { in: "起点ならユーザープロンプト / 中間なら上流の結果群", out: "下流ノードへの引き渡し / ユーザーへの最終出力" },
    fields: [],
    definition: `// フローの起点・終点・統合点マーカー\n// プロンプトは持たない (think と区別)\n// 「ここで Claude 本体が主体として動く」を示すだけ`,
  },
  // think (TYPE_SPECS で別途定義) と parent の使い分け:
  //   parent: 主体マーカー (プロンプト無し、青)。フロー全体の責任主体を表現する位置だけに置く。
  //   think:  Claude へ投げる個別 LLM タスク (プロンプト必須、紫)。フロー内の各推論ステップで使う。
  //   迷ったら think を使う。parent は明示的に「起点/終点/統合点」のときだけ。
  user: {
    base: "ユーザーからの入力待ちや、処理状況の表示など、人間とのやり取りに関わる要素です。",
    steps: [ "ユーザーに選択肢や質問を提示", "ユーザーの入力を待機", "入力内容を次のステップに渡す" ],
    io: { in: "質問内容 / 選択肢", out: "ユーザーの回答" },
    fields: [],
    definition: `// ユーザー操作ノード\n// 人間の入力・判断を待つステップ`,
  },
  decision: {
    base: "条件に基づいて処理ルートを切り替える分岐点です。if文のような役割を果たします。",
    steps: [
      "前のステップから条件値を受け取る",
      "条件を評価（例: テスト結果がpass? / ファイルが存在する?）",
      "条件A → ルートAへ進む",
      "条件B → ルートBへ進む",
      "どちらでもない → デフォルトルートへ",
    ],
    io: { in: "評価対象の値（前ステップの出力）", out: "選択されたルート先のステップ" },
    fields: [
      { key: "condition", label: "条件式", desc: "分岐の判定条件", required: true },
    ],
    definition: `// 分岐ノード\n// exit code や変数値で\n// 次のルートを決定`,
  },
  skill: {
    base: "特定のタスクに特化した手順書です。Claudeがこのスキルを読み込むと、専門的な処理を自動で行えるようになります。",
    steps: [
      "ユーザーの指示や paths パターンから、description をもとに Claude がスキルを選択",
      "SKILL.md の中身がプロンプトとして注入される",
      "本文の手順に従って処理を実行（必要なら reference_files を追加読み込み）",
      "scripts/ 配下の付属スクリプトや allowed-tools を使って具体作業",
      "成果物を返す（スキル定義の出力形式に従う）",
    ],
    io: { in: "ユーザーの指示（descriptionと一致するキーワード）+ コンテキスト", out: "スキルに定義された成果物（ファイル/テキスト/データ）" },
    // 設定タブ: 4ブロック構造 (request / execution / io_schema / definition)
    fieldSections: [
      { key: "request",    title: "🔵 呼び出しリクエスト", desc: "このノードでこのスキルに何を依頼するか。フローごとに変わる値" },
      { key: "execution",  title: "🟣 実行パラメータ",     desc: "モデル/許可ツール/努力レベル等、どう動かすかの設定" },
      { key: "io_schema",  title: "🟢 入出力の形",         desc: "期待する出力スキーマや、入出力の具体例" },
      { key: "definition", title: "⚪ スキル本体の定義",    desc: "SKILL.md の frontmatter。スキルそのものの能力を定義する値 (普段は触らない)" },
    ],
    fields: [
      // ─── 🔵 request: 呼び出しリクエスト ───
      { section: "request", key: "request_prompt",  label: "リクエスト内容",   desc: "スキルに渡す自然言語の指示文。「○○を読み取って△△の形式で返して」", long: true, required: true },
      { section: "request", key: "target_files",    label: "対象ファイル",     desc: "処理対象のファイル/フォルダパス",                                multi: true },
      { section: "request", key: "arguments_value", label: "引数 ($ARGUMENTS)", desc: "$ARGUMENTS / $0 / $1 に渡される文字列" },

      // ─── 🟣 execution: 実行パラメータ ───
      { section: "execution", key: "model",          label: "モデル",         desc: "スキル実行時のモデル", options: ["sonnet","opus","haiku"],
        info: { sonnet: "バランス型。標準モデル", opus: "高性能。複雑なタスク向け", haiku: "高速・低コスト。簡単なタスク向け" } },
      { section: "execution", key: "effort",         label: "努力レベル",     desc: "推論の深さ", options: ["low","medium","high","xhigh","max"],
        info: { low: "最小限。即答", medium: "標準", high: "じっくり考える", xhigh: "深く考える", max: "最大限思考" } },
      { section: "execution", key: "allowed-tools",  label: "事前許可ツール",  desc: "スキル実行中は許可なく使えるツール (例: Read, Bash(git *))",
        multi: true, choices: ["Read","Write","Edit","MultiEdit","Bash","Grep","Glob","WebFetch","WebSearch","TodoWrite","Task"],
        info: {
          Read: "ファイルを読み取る",
          Write: "ファイルを新規作成・上書き",
          Edit: "ファイルの一部を置換編集",
          MultiEdit: "1ファイル内の複数箇所を一括編集",
          Bash: "シェルコマンドを実行",
          Grep: "ファイル内テキスト検索 (ripgrep)",
          Glob: "ファイル名パターン検索",
          WebFetch: "URLを取得して内容を抽出",
          WebSearch: "Web検索",
          TodoWrite: "セッションのTodoリスト管理",
          Task: "サブエージェントを起動"
        } },
      { section: "execution", key: "shell",                    label: "シェル",         desc: "!`cmd` のインライン実行で使うシェル", options: ["bash","powershell"],
        info: { bash: "Linux/Mac の bash で実行", powershell: "Windows PowerShell で実行" } },
      { section: "execution", key: "disable-model-invocation", label: "自動呼び出し禁止", desc: "true で Claude の自動選択を無効化 (手動 / のみ)", options: ["false","true"],
        info: { false: "Claude が自動でスキル選択可 (デフォルト)", true: "Claude の自動選択を無効化 (手動のみ)" } },
      { section: "execution", key: "user-invocable",           label: "ユーザー呼び出し可", desc: "false で / メニューから非表示 (Claude自動のみ)",  options: ["true","false"],
        info: { true: "/ メニューから手動呼び出し可 (デフォルト)", false: "/ メニューから非表示 (Claude自動のみ)" } },
      { section: "execution", key: "context",                  label: "実行コンテキスト", desc: "fork で隔離サブエージェント文脈で実行", options: ["normal","fork"],
        info: { normal: "本体コンテキストで実行 (デフォルト)", fork: "隔離サブエージェント文脈で実行" } },
      { section: "execution", key: "agent",                    label: "fork時のエージェント", desc: "context: fork のとき使うサブエージェント種別" },

      // ─── 🟢 io_schema: 入出力の形 ───
      { section: "io_schema", key: "output_schema", label: "出力スキーマ",   desc: "期待する出力形式 (JSON Schema / TypeScript型 / 自由記述)",       long: true },
      { section: "io_schema", key: "expected_io",   label: "期待 IN/OUT 例", desc: "実行例: 「invoice.pdf → {amount:380000, currency:'JPY'}」",     long: true },

      // ─── ⚪ definition: スキル本体の定義 (普段は変えない) ───
      { section: "definition", key: "file",            label: "ファイルパス",  desc: "SKILL.md の保存先" },
      { section: "definition", key: "name",            label: "スキル名",      desc: "小文字/数字/ハイフンのみ。最大64文字", required: true, authoringOnly: true },
      { section: "definition", key: "description",     label: "発動トリガー",  desc: "Claude が「これを使おう」と判断する文。1,536文字制限",     long: true, required: true, authoringOnly: true },
      { section: "definition", key: "when_to_use",     label: "追加トリガー",  desc: "description に上乗せされる、より具体的なトリガー条件",   long: true },
      { section: "definition", key: "argument-hint",   label: "引数ヒント",    desc: "オートコンプリート表示用 (例: [issue-number])" },
      { section: "definition", key: "arguments",       label: "名前付き引数",  desc: "$name で参照できる引数名",                              multi: true },
      { section: "definition", key: "reference_files", label: "参考ファイル",  desc: "SKILL.md から必要時に読みに行く付属ファイル",            multi: true },
      { section: "definition", key: "scripts",         label: "付属スクリプト", desc: "scripts/ 配下の実行可能ファイル",                        multi: true },
      { section: "definition", key: "paths",           label: "自動活性化パス", desc: "このグロブにマッチするファイル編集時のみ自動発火",         multi: true },
    ],
    definition: `---\nname: example-flow\ndescription: "Xに投稿して" で起動。投稿文を生成して投稿する。\nallowed-tools: Read WebFetch Bash(curl *)\nmodel: sonnet\n---\n\n# Social Post Assistant スキル\n\n1. 過去の投稿を分析: !\`cat ~/.post-history.json\`\n2. スタイルガイド参照: [style-guide.md](style-guide.md)\n3. 新規投稿文を生成して、ユーザー確認後に投稿`,
    expandable: true,
  },
  command: {
    base: "ユーザーが /コマンド名 で呼び出せるカスタム処理です。よく使う定型タスクを部品化して、フロー内で再利用できます。",
    flowGuide: {
      what:    "コマンド名 (/の後に続く識別子) を指定",
      target:  "$ARGUMENTS で受け取る引数の形式 (argument_hint で示す)",
      content: "frontmatter (model / allowed_tools) + プロンプト本文 (Markdown)",
      summary: "/コマンド名 が呼ばれると frontmatter の環境でプロンプトを実行 → 結果を次ステップへ",
    },
    steps: [
      "ユーザーまたは Claude が /コマンド名 + 引数を入力",
      "$ARGUMENTS にユーザー引数文字列が代入される",
      "frontmatter の model / allowed_tools で実行環境を設定",
      "プロンプト本文に従って処理を実行",
      "結果を次のステップへ渡す",
    ],
    io: { in: "$ARGUMENTS (ユーザー引数文字列)", out: "コマンド実行結果 (テキスト/データ)" },
    // fieldSections: 入出力 (フロー固有) と コマンド定義 (本体) を分けて表示
    fieldSections: [
      { key: "io",         title: "入出力 (フローごとに変わる)", desc: "このコマンドノードが受け取る情報と返す情報を、フロー文脈に合わせて記述" },
      { key: "command",    title: "コマンド定義",                 desc: "frontmatter (識別情報・実行環境) とプロンプト本文" },
    ],
    fields: [
      // 入出力 — コマンドの中身 (subflow) によって何を受け取り何を返すかが変わる。フローごとに指定。
      { section: "io",      key: "input",          label: "入力 (IN)",       desc: "このコマンドが受け取るデータ。$ARGUMENTS で来る引数 + 前ステップから渡される情報", long: true },
      { section: "io",      key: "output",         label: "出力 (OUT)",      desc: "このコマンドが次ステップへ返すデータ",                                                long: true },
      // コマンド本体定義
      { section: "command", key: "name",           label: "コマンド名",      desc: "/ の後に続く名前 (例: deploy)", required: true, authoringOnly: true },
      { section: "command", key: "description",    label: "説明",            desc: "frontmatter の description。コマンドの用途を一文で" },
      { section: "command", key: "model",          label: "AIモデル",        desc: "コマンド実行時に使うモデル", options: ["sonnet","opus","haiku"],
        info: { sonnet: "バランス型 標準モデル", opus: "高性能 複雑タスク向け", haiku: "高速・低コスト 簡単タスク向け" } },
      { section: "command", key: "allowed_tools",  label: "許可ツール",      desc: "コマンド内で使えるツール一覧", multi: true },
      { section: "command", key: "argument_hint",  label: "引数ヒント",      desc: "$ARGUMENTS の期待形式 (例: '<env: prod|staging>')" },
      { section: "command", key: "prompt",         label: "プロンプト本文",  desc: "コマンド実行時に走るプロンプト (Markdown)", long: true, required: true },
    ],
    definition: `// .claude/commands/deploy.md\n---\ndescription: デプロイ前チェック&実行\nmodel: sonnet\nallowed_tools: [Bash, Read, WebFetch]\nargument_hint: "<env: prod | staging | dev>"\n---\n$ARGUMENTS の環境にデプロイします。\n\nまず git status で未コミット変更を確認し、なければ npm test を実行。\nテストが通ったら ./scripts/deploy.sh $ARGUMENTS を実行し、\n結果を Slack の #deploy チャンネルに通知してください。`,
    // subflow を持つことを示す (内部フロー展開はキャンバス側で実装予定。詳細パネルには出さない)
    expandable: true,
  },
  config: {
    base: "Claudeの動作ルールを定義する設定ファイルです。どのツールが使えるか、どんな権限があるか等を管理します。",
    steps: [
      "~/.claude/settings.json（ユーザー全体）を読み込み",
      "プロジェクト/.claude/settings.json（プロジェクト）で上書き",
      "settings.local.json（ローカル）でさらに上書き",
      "CLAUDE.md（自然言語ルール）を適用",
    ],
    io: { in: "なし（起動時に自動読み込み）", out: "設定値（permissions, allowedTools, hooks, env等）" },
    fields: [
      { key: "scope", label: "スコープ", desc: "user/project/local", options: ["user","project","local"], required: true,
        info: {
          user: "ユーザー全体設定 (~/.claude/)",
          project: "プロジェクト共有設定 (.claude/)",
          local: "ローカル個人設定 (settings.local.json、git無視)"
        } },
      { key: "file_type", label: "ファイル種別", desc: "設定ファイルの種類", options: ["settings.json","CLAUDE.md",".claudeignore"], required: true,
        info: {
          "settings.json": "権限・hooks・env など JSON 設定",
          "CLAUDE.md": "自然言語のプロジェクトルール",
          ".claudeignore": "Claude が読まないファイルパターン"
        } },
    ],
    definition: `// settings.json\n{\n  "permissions": {\n    "allow": ["Bash(npm test)", "Read"],\n    "deny": ["Bash(rm -rf *)"]\n  },\n  "hooks": { ... }\n}`,
  },
  api: {
    base: "外部 API を呼び出す要素。LLM (Claude/OpenAI/Gemini) や 各種 SaaS の REST API、Webhook 等。MCP がカバーしていないサービスはここで叩く。",
    // 共通フォールバック (meta.service 未指定時)
    steps: [
      "認証情報 (API キー / トークン / Webhook URL) を準備",
      "リクエストパラメータを組み立て",
      "HTTPS でリクエスト送信",
      "レスポンスを受け取って次ステップへ渡す",
    ],
    io: { in: "サービス固有のパラメータ + 認証情報", out: "サービスからのレスポンス" },
    fields: [
      { key: "service", label: "サービス", desc: "接続先サービス", options: ["claude","openai","gemini","line","stripe","discord","rest"], required: true,
        info: {
          claude: "Anthropic Claude API (Messages)",
          openai: "OpenAI Chat Completions API",
          gemini: "Google Gemini API",
          line: "LINE Messaging API (メッセージ送信)",
          stripe: "Stripe API (決済・顧客管理)",
          discord: "Discord Webhook (チャンネル投稿)",
          rest: "汎用 REST API (上記以外の任意のHTTPS)"
        } },
    ],
    definition: `// サービスごとに異なる - 詳細は meta.service で切替`,

    // ── サービス別の動的フィールド / ステップ / IO / 定義例 ──
    fieldsByService: {
      claude: [
        { key: "api_key",     label: "API キー",            desc: "Anthropic API キー (ANTHROPIC_API_KEY)",     secret: true, envKey: "ANTHROPIC_API_KEY", required: true },
        { key: "model",       label: "モデル",              desc: "使用するモデル",                              options: ["claude-sonnet-4-5","claude-opus-4-7","claude-haiku-4-5"], required: true,
          info: {
            "claude-sonnet-4-5": "バランス型 標準モデル",
            "claude-opus-4-7": "最高性能 複雑タスク向け",
            "claude-haiku-4-5": "高速・低コスト 簡単タスク向け"
          } },
        { key: "system",      label: "system prompt",      desc: "アシスタントの役割設定",                     long: true },
        { key: "messages",    label: "messages 配列",       desc: "user/assistant の会話履歴 (JSON)",          long: true, required: true },
        { key: "tools",       label: "tools (Function Calling)", desc: "Claude に使わせるツール定義 (JSON)",  long: true },
        { key: "server_tools", label: "Anthropic server tools", desc: "サーバー側で実行されるツール", multi: true },
        { key: "temperature", label: "temperature",        desc: "出力ばらつき (0-1)" },
        { key: "max_tokens",  label: "max_tokens",         desc: "応答の最大長", required: true },
        { key: "cache",       label: "プロンプトキャッシュ", desc: "長いシステムプロンプトを使い回す", options: ["なし","ephemeral (5分)","1時間"],
          info: {
            "なし": "キャッシュなし (毎回フル送信)",
            "ephemeral (5分)": "5分間キャッシュ (短い対話向け)",
            "1時間": "1時間キャッシュ (長期セッション向け)"
          } },
      ],
      openai: [
        { key: "api_key",     label: "API キー",       desc: "OpenAI API キー (OPENAI_API_KEY)",            secret: true, envKey: "OPENAI_API_KEY", required: true },
        { key: "model",       label: "モデル",         desc: "使用するモデル",                              options: ["gpt-4o","gpt-4o-mini","o1","o1-mini","gpt-4-turbo"], required: true,
          info: {
            "gpt-4o": "フラッグシップ マルチモーダル対応",
            "gpt-4o-mini": "高速・低コスト軽量版",
            "o1": "推論特化 数学・コード向け",
            "o1-mini": "推論特化 軽量版",
            "gpt-4-turbo": "従来 GPT-4 改良版"
          } },
        { key: "system",      label: "system prompt", desc: "アシスタントの役割設定",                     long: true },
        { key: "messages",    label: "messages 配列", desc: "user/assistant の会話履歴 (JSON)",          long: true, required: true },
        { key: "tools",       label: "tools (Function Calling)", desc: "OpenAI に使わせるツール定義 (JSON)", long: true },
        { key: "temperature", label: "temperature",   desc: "出力ばらつき (0-2)" },
        { key: "max_tokens",  label: "max_tokens",    desc: "応答の最大長" },
      ],
      gemini: [
        { key: "api_key",     label: "API キー",       desc: "Google AI Studio API キー (GEMINI_API_KEY)",  secret: true, envKey: "GEMINI_API_KEY", required: true },
        { key: "model",       label: "モデル",         desc: "使用するモデル",                              options: ["gemini-2.0-flash","gemini-2.0-pro","gemini-1.5-flash","gemini-1.5-pro"], required: true,
          info: {
            "gemini-2.0-flash": "最新世代 高速版",
            "gemini-2.0-pro": "最新世代 高性能版",
            "gemini-1.5-flash": "前世代 高速版",
            "gemini-1.5-pro": "前世代 高性能版 (長文脈対応)"
          } },
        { key: "system",      label: "system instruction", desc: "アシスタントの役割設定",                long: true },
        { key: "contents",    label: "contents",      desc: "会話履歴 (parts 形式の JSON)",              long: true, required: true },
        { key: "tools",       label: "tools",         desc: "Function Calling 定義 (JSON)",              long: true },
        { key: "temperature", label: "temperature",   desc: "出力ばらつき (0-2)" },
      ],
      line: [
        { key: "channel_access_token", label: "チャネルアクセストークン", desc: "LINE Developers で発行", secret: true, envKey: "LINE_CHANNEL_ACCESS_TOKEN", required: true },
        { key: "endpoint", label: "エンドポイント", desc: "LINE Messaging API の操作", options: ["push (個別送信)","multicast (複数送信)","broadcast (全員)","reply (応答)"], required: true,
          info: {
            "push (個別送信)": "特定ユーザーに個別送信 (要 userId)",
            "multicast (複数送信)": "複数ユーザーに一斉送信",
            "broadcast (全員)": "友だち全員に一斉配信",
            "reply (応答)": "Webhook で受けたメッセージに応答"
          } },
        { key: "to",         label: "送信先",       desc: "ユーザーID / グループID / トークルームID (push/multicast 時)" },
        { key: "messages",   label: "messages",     desc: "送信するメッセージ配列 (text / image / template 等)", long: true, required: true },
      ],
      stripe: [
        { key: "secret_key", label: "シークレットキー", desc: "Stripe Secret Key (本番/テスト)",            secret: true, envKey: "STRIPE_SECRET_KEY", required: true },
        { key: "endpoint",   label: "エンドポイント",   desc: "Stripe API 操作",                            options: ["charges (決済)","customers (顧客)","subscriptions (定期)","payment_intents (PaymentIntents)","invoices (請求書)"], required: true,
          info: {
            "charges (決済)": "1回限りの決済 (旧式 API)",
            "customers (顧客)": "顧客情報の作成・取得",
            "subscriptions (定期)": "サブスクリプション (定期課金)",
            "payment_intents (PaymentIntents)": "現代的な決済フロー (3D Secure 対応)",
            "invoices (請求書)": "請求書発行・送付"
          } },
        { key: "params",     label: "パラメータ",      desc: "操作ごとの引数 (JSON)",                       long: true, required: true },
      ],
      discord: [
        { key: "webhook_url", label: "Webhook URL",  desc: "Discord チャンネルの Webhook URL",            secret: true, envKey: "DISCORD_WEBHOOK_URL", required: true },
        { key: "username",    label: "ユーザー名",    desc: "Webhook 投稿時の表示名 (任意)" },
        { key: "content",     label: "本文",          desc: "投稿テキスト (Markdown 対応)",                 long: true, required: true },
        { key: "embeds",      label: "embeds",        desc: "リッチ埋め込み (タイトル/色/フィールド付き)", long: true },
      ],
      rest: [
        { key: "method",      label: "メソッド",      desc: "HTTP メソッド",                                options: ["GET","POST","PUT","PATCH","DELETE"], required: true,
          info: {
            GET: "データ取得 (副作用なし)",
            POST: "データ送信 (新規作成)",
            PUT: "データ更新 (全体置換)",
            PATCH: "データ更新 (部分更新)",
            DELETE: "データ削除"
          } },
        { key: "url",         label: "URL",           desc: "リクエスト先 URL (https://...)", required: true },
        { key: "auth_type",   label: "認証方式",      desc: "Authorization ヘッダの種類",                  options: ["なし","Bearer Token","Basic Auth","API Key Header","Custom Header"],
          info: {
            "なし": "認証なし (公開API)",
            "Bearer Token": "Authorization: Bearer <token>",
            "Basic Auth": "Authorization: Basic <base64>",
            "API Key Header": "X-API-Key 等の専用ヘッダ",
            "Custom Header": "任意のヘッダ名でトークン送信"
          } },
        { key: "auth_value",  label: "認証値",        desc: "トークン / API キー本体",                     secret: true, envKey: "API_AUTH_TOKEN" },
        { key: "headers",     label: "ヘッダー",      desc: "追加ヘッダー (1行1個: Key: Value)",          long: true },
        { key: "body",        label: "本文",          desc: "POST/PUT/PATCH のボディ (JSON / form / text)", long: true },
        { key: "response_path", label: "レスポンス取出", desc: "jq風パス (例: .data.items[0].id)" },
      ],
    },
    stepsByService: {
      claude: [
        "ANTHROPIC_API_KEY で認証",
        "model / system / messages / tools / cache_control 等を設定",
        "POST https://api.anthropic.com/v1/messages",
        "レスポンス受信 (assistant message or tool_use)",
        "tool_use なら → ツール実行 → tool_result を返す → ループ",
      ],
      openai: [
        "OPENAI_API_KEY で認証",
        "model / messages / tools / response_format 等を設定",
        "POST https://api.openai.com/v1/chat/completions",
        "レスポンス受信 (choices[0].message)",
        "tool_calls あれば → ツール実行 → tool role の message を返す → ループ",
      ],
      gemini: [
        "GEMINI_API_KEY で認証",
        "model / contents / tools / generationConfig 等を設定",
        "POST https://generativelanguage.googleapis.com/v1/models/{model}:generateContent",
        "レスポンス受信 (candidates[0].content)",
        "functionCall あれば → 関数実行 → 結果を返す → ループ",
      ],
      line: [
        "LINE_CHANNEL_ACCESS_TOKEN で認証 (Bearer)",
        "endpoint と to / messages を設定",
        "POST https://api.line.me/v2/bot/message/{endpoint}",
        "レスポンス受信 (送信成否)",
      ],
      stripe: [
        "STRIPE_SECRET_KEY で認証 (Basic Auth)",
        "endpoint と params を設定",
        "POST https://api.stripe.com/v1/{endpoint}",
        "レスポンス受信 (charge / subscription 等のオブジェクト)",
      ],
      discord: [
        "DISCORD_WEBHOOK_URL を準備 (認証は URL に含まれる)",
        "content / embeds / username を設定",
        "POST {webhook_url}",
        "レスポンス受信 (204 No Content または 200 + message オブジェクト)",
      ],
      rest: [
        "method / url / auth / headers / body を組み立て",
        "HTTPS でリクエスト送信",
        "レスポンスを受信 (JSON / text / バイナリ)",
        "response_path で必要部分だけ取り出して次ステップへ",
      ],
    },
    ioByService: {
      claude:  { in: "model + system + messages + tools (+ cache)",  out: "assistant メッセージ or tool_use ブロック" },
      openai:  { in: "model + messages + tools",                     out: "choices[0].message or tool_calls" },
      gemini:  { in: "model + contents + tools",                     out: "candidates[0].content or functionCall" },
      line:    { in: "endpoint + to + messages",                     out: "送信結果 (sentMessages[] etc)" },
      stripe:  { in: "endpoint + params",                            out: "Stripe オブジェクト (charge/subscription/...)" },
      discord: { in: "webhook_url + content/embeds",                 out: "204 No Content (送信完了)" },
      rest:    { in: "method + url + headers + body",                out: "HTTP レスポンス (JSON/text/binary)" },
    },
    definitionByService: {
      claude:  `// POST https://api.anthropic.com/v1/messages\n{\n  "model": "claude-sonnet-4-5",\n  "max_tokens": 1024,\n  "system": "あなたは...",\n  "messages": [{ "role": "user", "content": "..." }],\n  "tools": [{ "name": "...", "input_schema": {...} }]\n}\n// Header: x-api-key: \${ANTHROPIC_API_KEY}`,
      openai:  `// POST https://api.openai.com/v1/chat/completions\n{\n  "model": "gpt-4o",\n  "messages": [\n    { "role": "system", "content": "..." },\n    { "role": "user",   "content": "..." }\n  ],\n  "tools": [{ "type": "function", "function": {...} }]\n}\n// Header: Authorization: Bearer \${OPENAI_API_KEY}`,
      gemini:  `// POST https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=\${GEMINI_API_KEY}\n{\n  "system_instruction": { "parts": [{ "text": "..." }] },\n  "contents": [{ "role": "user", "parts": [{ "text": "..." }] }],\n  "tools": [...]\n}`,
      line:    `// POST https://api.line.me/v2/bot/message/push\n{\n  "to": "USER_ID",\n  "messages": [{ "type": "text", "text": "..." }]\n}\n// Header: Authorization: Bearer \${LINE_CHANNEL_ACCESS_TOKEN}`,
      stripe:  `// POST https://api.stripe.com/v1/charges (Basic Auth: \${STRIPE_SECRET_KEY}:)\nForm body:\n  amount=2000\n  currency=jpy\n  source=tok_visa\n  description="..."`,
      discord: `// POST \${DISCORD_WEBHOOK_URL}\n{\n  "username": "DeployBot",\n  "content": "デプロイ完了 ✅",\n  "embeds": [{\n    "title": "v1.2.3 released",\n    "color": 5814783\n  }]\n}`,
      rest:    `// 任意の HTTPS リクエスト\n{\n  "method": "POST",\n  "url": "https://api.example.com/v1/resource",\n  "headers": {\n    "Authorization": "Bearer \${API_TOKEN}",\n    "Content-Type": "application/json"\n  },\n  "body": { "key": "value" }\n}`,
    },
  },
  plugin: {
    base: "複数の機能（コマンド・スキル・フック・エージェント）をひとまとめにしたパッケージです。インストールするだけで一連の機能が使えます。",
    steps: [
      "plugin.json（マニフェスト）を読み込み",
      "含まれるcommands/agents/skills/hooksを登録",
      "MCP定義があれば接続",
      "各機能が有効化される",
    ],
    io: { in: "インストールコマンド", out: "登録された機能一覧" },
    fields: [
      { key: "name", label: "プラグイン名", desc: "パッケージ名", required: true, authoringOnly: true },
      { key: "version", label: "バージョン", desc: "セマンティックバージョン", required: true, authoringOnly: true },
    ],
    definition: `// plugin.json\n{\n  "name": "example-flow",\n  "version": "1.0.0",\n  "commands": ["commands/post.md"],\n  "skills": ["skills/analyze.md"],\n  "hooks": { ... },\n  "agents": ["agents/writer.md"]\n}`,
    expandable: true,
  },
  trigger: {
    base: "フローの起点 (トリガー)。何をきっかけにこのフローが起動するかを表す要素。手動 / 定期実行 / Webhook 受信 / メール受信 / チャット入力 / アプリイベントなど、起動方式は meta.source で切替。",
    // 共通フォールバック (meta.source 未指定時)
    steps: [
      "トリガー条件をセットアップ (cron式 / Webhook URL / メール条件 等)",
      "条件が成立するまで待機",
      "条件成立で後続のフローを起動",
      "起動時のデータ (時刻 / リクエスト本文 / メール本文 等) を次ステップへ渡す",
    ],
    io: { in: "(外部イベント) ", out: "後続ノードへのトリガー + 起動データ" },
    fields: [
      { key: "source", label: "起動方式", desc: "何をきっかけにフローを起動するか", options: ["manual","cron","webhook","email","chat","app-event"],
        info: {
          manual: "ユーザーが手動で起動 (/コマンド or プロンプト)",
          cron: "cron式 / 定期スケジュールで自動起動",
          webhook: "外部サービスからの HTTP リクエストで起動",
          email: "受信メールをきっかけに起動",
          chat: "チャット (LINE/Slack/Discord等) のメッセージで起動",
          "app-event": "アプリのイベント (Notion更新等) で起動"
        } },
    ],
    definition: `// 起動方式 (source) によって設定値が変わる - 詳細は meta.source で切替`,

    // ── source 別の動的フィールド / ステップ / IO / 定義例 ──
    fieldsBySource: {
      manual: [
        { key: "trigger_type", label: "起動方法",     desc: "ユーザーが起動する手段", options: ["/slash-command","プロンプト","UIボタン"],
          info: {
            "/slash-command": "/ で始まるコマンドで起動",
            "プロンプト": "自然言語のプロンプトで起動",
            "UIボタン": "ボタンクリックで起動"
          } },
        { key: "command",      label: "コマンド名",   desc: "/コマンド名 (slash-command 時)" },
        { key: "prompt_hint",  label: "プロンプト例", desc: "ユーザーが書きそうなプロンプト例 (発火条件の参考)", long: true },
      ],
      cron: [
        { key: "schedule",     label: "実行スケジュール", desc: "cron式 or 間隔表記",                 options: ["毎時","毎日朝9時","毎週月曜9時","毎月1日","カスタムcron式"],
          info: {
            "毎時": "1時間おきに実行",
            "毎日朝9時": "毎日 09:00 に実行 (日次バッチ向け)",
            "毎週月曜9時": "毎週月曜 09:00 に実行 (週次レポート向け)",
            "毎月1日": "毎月1日に実行 (月次集計向け)",
            "カスタムcron式": "下の cron式 欄に手入力"
          } },
        { key: "cron_expr",    label: "cron式 (詳細)",   desc: "上記でカスタム選択時 (例: 0 9 * * *)" },
        { key: "timezone",     label: "タイムゾーン",     desc: "実行時の TZ",                         options: ["Asia/Tokyo","UTC","America/New_York","Europe/London"],
          info: {
            "Asia/Tokyo": "日本時間 (JST、UTC+9)",
            "UTC": "協定世界時 (時差なし)",
            "America/New_York": "米国東部時間 (夏時間自動切替)",
            "Europe/London": "英国時間 (夏時間自動切替)"
          } },
        { key: "implementation", label: "実装方式",       desc: "どのスケジュール仕組みを使うか",       options: ["Anthropic Routines (claude.ai)","CronCreate (セッション内)","外部 cron"],
          info: {
            "Anthropic Routines (claude.ai)": "claude.ai 上の公式定期実行 (推奨)",
            "CronCreate (セッション内)": "セッション中だけ動くインメモリ cron",
            "外部 cron": "OS の crontab / GitHub Actions 等で起動"
          } },
      ],
      webhook: [
        { key: "webhook_url",  label: "Webhook URL",  desc: "外部から POST/GET される URL (発行)",  secret: true, envKey: "WEBHOOK_URL" },
        { key: "method",       label: "HTTP メソッド", desc: "受け付けるメソッド",                    options: ["POST","GET","PUT","ANY"],
          info: {
            POST: "POSTのみ受付 (一般的な Webhook)",
            GET: "GETのみ受付 (URLパラメータ受取)",
            PUT: "PUTのみ受付",
            ANY: "全メソッド受付"
          } },
        { key: "auth",         label: "認証",          desc: "Webhook の受信時認証",                  options: ["なし","署名検証 (HMAC)","Bearer Token","Basic Auth"],
          info: {
            "なし": "認証なし (公開エンドポイント、リスクあり)",
            "署名検証 (HMAC)": "HMAC 署名で送信元を検証 (GitHub/Stripe 等)",
            "Bearer Token": "Authorization: Bearer <token> で認証",
            "Basic Auth": "ユーザー名/パスワードで認証"
          } },
        { key: "auth_secret",  label: "認証シークレット", desc: "署名検証用シークレット or トークン",  secret: true, envKey: "WEBHOOK_SECRET" },
        { key: "payload_path", label: "ペイロード抽出", desc: "リクエスト本文の使う部分 (jq風: .data.user.id 等)" },
      ],
      email: [
        { key: "email_account", label: "メールアカウント", desc: "監視するメールボックス (Gmail/IMAP)" },
        { key: "auth_token",    label: "認証トークン",     desc: "OAuth トークン or IMAP パスワード",  secret: true, envKey: "EMAIL_AUTH_TOKEN" },
        { key: "filter",        label: "受信フィルタ",     desc: "対象メールの条件 (Gmail 検索構文: from:.. subject:.. is:unread 等)", long: true },
        { key: "polling_interval", label: "チェック間隔",  desc: "メールをチェックする頻度",            options: ["1分","5分","15分","1時間"],
          info: {
            "1分": "1分おきにチェック (即応性重視、API消費多)",
            "5分": "5分おきにチェック (推奨バランス)",
            "15分": "15分おきにチェック (省コスト)",
            "1時間": "1時間おきにチェック (低優先・コスト最小)"
          } },
      ],
      chat: [
        { key: "chat_platform", label: "チャットプラットフォーム", desc: "受信元",                         options: ["LINE","Slack","Discord","Telegram","埋め込みチャット","MCP elicitation"],
          info: {
            "LINE": "LINE Bot からメッセージ受信",
            "Slack": "Slack Bot からメッセージ受信",
            "Discord": "Discord Bot からメッセージ受信",
            "Telegram": "Telegram Bot からメッセージ受信",
            "埋め込みチャット": "自前サイトに埋め込んだチャットUI",
            "MCP elicitation": "MCP のユーザー入力要求 (elicitation)"
          } },
        { key: "auth_token",    label: "認証トークン",            desc: "Bot Token / Channel Access Token", secret: true, envKey: "CHAT_AUTH_TOKEN" },
        { key: "filter",        label: "起動条件",                desc: "起動するメッセージ条件 (例: メンション付き, 特定キーワード, 特定チャンネル)", long: true },
      ],
      "app-event": [
        { key: "app",            label: "対象アプリ",      desc: "イベント発生元",                          options: ["Notion","Linear","GitHub","Stripe","Google Calendar","Airtable","Shopify","Slack","カスタム"],
          info: {
            "Notion": "Notion ページ/DB の変更イベント",
            "Linear": "Issue / Project の変更イベント",
            "GitHub": "Issue / PR / Push などのイベント",
            "Stripe": "決済成功・失敗などの課金イベント",
            "Google Calendar": "予定の作成・更新・削除イベント",
            "Airtable": "レコードの変更イベント",
            "Shopify": "注文・在庫などの EC イベント",
            "Slack": "メッセージ・リアクションなどのイベント",
            "カスタム": "上記以外の任意のアプリ"
          } },
        { key: "event_type",     label: "イベント種別",    desc: "対象アプリでのイベント (新規Issue / PR opened / 決済成功 等)" },
        { key: "auth_token",     label: "認証トークン",    desc: "対象アプリの API キー / OAuth トークン",  secret: true, envKey: "APP_AUTH_TOKEN" },
        { key: "filter",         label: "イベント条件",    desc: "発火対象の絞り込み (例: ラベル=bug のみ)", long: true },
        { key: "implementation", label: "受信方式",        desc: "実装方式",                                options: ["MCP polling","Webhook (アプリ側設定)","ポーリング (定期問い合わせ)"],
          info: {
            "MCP polling": "MCP サーバーが定期的に変更を取得",
            "Webhook (アプリ側設定)": "アプリ側でURL登録 → 即時イベント通知 (推奨)",
            "ポーリング (定期問い合わせ)": "こちらから定期的にAPIで問い合わせ"
          } },
      ],
    },
    stepsBySource: {
      manual: [
        "ユーザーがプロンプト or /command を入力",
        "Claude Code がコマンド/プロンプト解釈",
        "フロー本体を起動",
      ],
      cron: [
        "実装方式 (Routines / cron) に従って起動条件を登録",
        "指定時刻 or 間隔で起動",
        "前ステップなし → フロー本体の最初のノードを起動",
      ],
      webhook: [
        "Webhook URL を発行 (バックエンドが待受 endpoint を提供)",
        "外部サービスがその URL に POST/GET",
        "認証/署名チェック → ペイロード解析",
        "ペイロード (or payload_path で抽出した部分) をフローに渡して起動",
      ],
      email: [
        "メールアカウントに OAuth/IMAP で接続",
        "polling_interval ごとに受信メールをチェック",
        "filter 条件にマッチするメールを発見",
        "メール内容 (from/subject/本文) をフローに渡して起動",
      ],
      chat: [
        "Bot を該当プラットフォームに登録 (LINE/Slack/Discord/...)",
        "ユーザーがメッセージ送信 → bot 経由で受信",
        "filter 条件にマッチするメッセージを発見",
        "メッセージ内容 + 送信者情報をフローに渡して起動",
      ],
      "app-event": [
        "対象アプリで Webhook 設定 or MCP polling を構成",
        "アプリ側でイベント発生 (新規 Issue 等)",
        "filter 条件にマッチするイベントを通過",
        "イベントデータをフローに渡して起動",
      ],
    },
    ioBySource: {
      manual:      { in: "ユーザーのプロンプト or /コマンド + 引数",    out: "後続フロー + ユーザー入力データ" },
      cron:        { in: "(時刻到達)",                                    out: "後続フロー + 起動時刻" },
      webhook:     { in: "HTTP リクエスト (headers + body)",            out: "後続フロー + payload" },
      email:       { in: "受信メール (from / subject / body / 添付)",   out: "後続フロー + メール内容" },
      chat:        { in: "チャットメッセージ + 送信者情報",              out: "後続フロー + メッセージ内容" },
      "app-event": { in: "アプリのイベントデータ (JSON)",                out: "後続フロー + イベントデータ" },
    },
    definitionBySource: {
      manual:      `// /tldr コマンドで起動する例\n{\n  "trigger": "manual",\n  "command": "/tldr",\n  "prompt_hint": "URL貼って → 要約して返す"\n}`,
      cron:        `// Anthropic Routines (claude.ai 上)\n// または .claude/cron.json\n{\n  "trigger": "cron",\n  "schedule": "0 9 * * *",  // 毎日朝9時\n  "timezone": "Asia/Tokyo"\n}`,
      webhook:     `// バックエンドで受け付ける webhook endpoint\nPOST /api/triggers/webhook/{flow_id}\nHeader: X-Signature: sha256=...\nBody: { "user": {...}, "action": "..." }\n→ payload を後続フローに渡す`,
      email:       `// メール監視設定\n{\n  "trigger": "email",\n  "account": "support@example.com",\n  "filter": "is:unread label:invoices",\n  "polling": "5min"\n}`,
      chat:        `// LINE Bot Webhook\nPOST https://api.line.me/v2/webhook\nBody: {\n  "events": [{\n    "type": "message",\n    "message": { "type": "text", "text": "..." },\n    "source": { "userId": "U..." }\n  }]\n}`,
      "app-event": `// Notion → MCP polling 例\n{\n  "trigger": "app-event",\n  "app": "Notion",\n  "event_type": "page.created",\n  "filter": "database_id == '...' && status == 'New'",\n  "implementation": "MCP polling"\n}`,
    },
  },

  schedule: {
    base: "[仮置き要素] cron/タイマーで定期的にフローを自動起動するトリガー要素。Anthropic公式の要素分類にはまだ存在しないので、ワークフロー記述のために新規追加。",
    steps: [
      "cron式（例: 0 9 * * *）または間隔（例: every 1h）でスケジュール登録",
      "指定時刻に到達すると、後続のフロー（Subagent/Skill等）を起動",
      "実行ログを記録",
    ],
    io: { in: "cron式 / 間隔", out: "後続ノードへのトリガー" },
    fields: [
      { key: "cron", label: "cron式", desc: "例: 0 9 * * *（毎日9時）", required: true },
    ],
    definition: `// 仮置きの構造例\n{\n  "schedule": "0 9 * * *",\n  "skill": "slack-digest"\n}`,
  },
  parallel: {
    base: "[仮置き要素] 複数のSubagent/タスクを同時起動（fan-out）し、結果をまとめる（fan-in）ための制御要素。1メッセージで複数Taskを呼ぶパターンの可視化用に新規追加。",
    steps: [
      "fan-out: 親エージェントから複数の子タスクを並列起動",
      "各子タスクは独立したコンテキストで処理を進める",
      "fan-in: 全タスク完了を待って結果を集約",
    ],
    io: { in: "並列起動するタスク群", out: "集約された結果" },
    fields: [],
    definition: `// 1メッセージ内で複数Task呼び出し → 並列実行\n[\n  { tool: "Task", input: { subagent: "explore-docs" }},\n  { tool: "Task", input: { subagent: "explore-code" }},\n  { tool: "Task", input: { subagent: "web-search"   }}\n]`,
  },
  agentsdk: {
    base: "プログラムからClaudeエージェントを起動・制御するための開発キットです。Claude Code をライブラリとして自分のアプリ・スクリプトから呼び出すための、TypeScript / Python / REST (Managed) の3つの提供形態があります。",
    // 共通フォールバック (meta.runtime 未指定時)
    steps: [
      "API キーで認証",
      "ClaudeAgentOptions で設定を構築 (model / allowed_tools / system 等)",
      "query() でエージェントを起動",
      "エージェントが tool_use を自動実行するループに入る",
      "can_use_tool で各ツール実行を承認/拒否 (任意)",
      "最終結果を返す",
    ],
    io: { in: "prompt + 設定オブジェクト", out: "エージェントの実行結果" },
    fields: [
      { key: "runtime", label: "ランタイム", desc: "SDK の言語/形態", options: ["typescript","python","managed"], required: true,
        info: {
          typescript: "TypeScript / Node.js SDK で実装",
          python: "Python SDK で実装",
          managed: "Anthropic ホステッド (Managed Agents REST API)"
        } },
    ],
    definition: `// runtime によって書き方が変わる - 詳細は meta.runtime で切替`,

    // ── ランタイム別の動的フィールド / ステップ / IO / 定義例 ──
    fieldsByRuntime: {
      typescript: [
        { key: "api_key",         label: "API キー",       desc: "Anthropic API キー",                      secret: true, envKey: "ANTHROPIC_API_KEY", required: true },
        { key: "entry",           label: "エントリポイント", desc: "実行方式",                                  options: ["query() (1ショット)","SDKClient (対話セッション)"], required: true,
          info: {
            "query() (1ショット)": "1回のリクエストで完結 (簡単・推奨)",
            "SDKClient (対話セッション)": "クライアントを保持して複数ターン対話"
          } },
        { key: "model",           label: "モデル",         desc: "使用するモデル",                            options: ["sonnet","opus","haiku"], required: true,
          info: { sonnet: "バランス型 標準モデル", opus: "高性能 複雑タスク向け", haiku: "高速・低コスト 簡単タスク向け" } },
        { key: "system",          label: "system prompt", desc: "エージェントの役割設定",                     long: true },
        { key: "prompt",          label: "プロンプト",      desc: "エージェントへの指示文",                    long: true, required: true },
        { key: "allowedTools",    label: "許可ツール",      desc: "使えるツール一覧",                          multi: true },
        { key: "permissionMode",  label: "権限モード",      desc: "ツール承認の方式",                          options: ["default","acceptEdits","plan","bypassPermissions"],
          info: {
            default: "毎回ユーザーに確認",
            acceptEdits: "編集系は自動承認",
            plan: "計画のみ (書き込み禁止)",
            bypassPermissions: "全ツールを承認なしで実行 (上級者向け)"
          } },
        { key: "maxTurns",        label: "最大ターン数",    desc: "ツール呼び出しループの上限" },
        { key: "settingSources",  label: "設定の読込先",    desc: "settings.json を読む場所",                  options: ["project","user","none"],
          info: {
            project: "プロジェクトの .claude/settings.json を使う",
            user: "ユーザーの ~/.claude/settings.json を使う",
            none: "設定ファイルを読まない (コードのみで完結)"
          } },
        { key: "canUseTool",      label: "can_use_tool",   desc: "ツール実行を独自ロジックで承認する関数 (任意)" },
      ],
      python: [
        { key: "api_key",         label: "API キー",       desc: "Anthropic API キー",                      secret: true, envKey: "ANTHROPIC_API_KEY", required: true },
        { key: "entry",           label: "エントリポイント", desc: "実行方式",                                  options: ["query() (1ショット)","ClaudeSDKClient (対話セッション)"], required: true,
          info: {
            "query() (1ショット)": "1回のリクエストで完結 (簡単・推奨)",
            "ClaudeSDKClient (対話セッション)": "クライアントを保持して複数ターン対話"
          } },
        { key: "model",           label: "モデル",         desc: "使用するモデル",                            options: ["sonnet","opus","haiku"], required: true,
          info: { sonnet: "バランス型 標準モデル", opus: "高性能 複雑タスク向け", haiku: "高速・低コスト 簡単タスク向け" } },
        { key: "system",          label: "system prompt", desc: "エージェントの役割設定",                     long: true },
        { key: "prompt",          label: "プロンプト",      desc: "エージェントへの指示文",                    long: true, required: true },
        { key: "allowed_tools",   label: "許可ツール",      desc: "使えるツール一覧",                          multi: true },
        { key: "permission_mode", label: "権限モード",      desc: "ツール承認の方式",                          options: ["default","acceptEdits","plan","bypassPermissions"],
          info: {
            default: "毎回ユーザーに確認",
            acceptEdits: "編集系は自動承認",
            plan: "計画のみ (書き込み禁止)",
            bypassPermissions: "全ツールを承認なしで実行 (上級者向け)"
          } },
        { key: "max_turns",       label: "最大ターン数",    desc: "ツール呼び出しループの上限" },
        { key: "setting_sources", label: "設定の読込先",    desc: "settings.json を読む場所",                  options: ["project","user","none"],
          info: {
            project: "プロジェクトの .claude/settings.json を使う",
            user: "ユーザーの ~/.claude/settings.json を使う",
            none: "設定ファイルを読まない (コードのみで完結)"
          } },
        { key: "can_use_tool",    label: "can_use_tool",   desc: "ツール実行を独自ロジックで承認する関数 (任意)" },
      ],
      managed: [
        { key: "api_key",         label: "API キー",       desc: "Anthropic API キー",                      secret: true, envKey: "ANTHROPIC_API_KEY", required: true },
        { key: "agent_id",        label: "Agent ID",       desc: "Anthropic コンソールで作成したエージェントの ID", required: true },
        { key: "thread_id",       label: "Thread ID",      desc: "会話スレッド ID (継続セッション用、新規なら空)" },
        { key: "model",           label: "モデル",         desc: "使用するモデル (エージェント側で固定の場合はそれが優先)", options: ["sonnet","opus","haiku"],
          info: { sonnet: "バランス型 標準モデル", opus: "高性能 複雑タスク向け", haiku: "高速・低コスト 簡単タスク向け" } },
        { key: "prompt",          label: "プロンプト",      desc: "エージェントへの指示文",                    long: true, required: true },
        { key: "stream",          label: "ストリーミング",  desc: "結果を逐次受信するか",                       options: ["false","true"],
          info: { false: "完了時に一括で受信", true: "生成中の部分応答を順次受信" } },
      ],
    },
    stepsByRuntime: {
      typescript: [
        "ANTHROPIC_API_KEY で認証 (環境変数 or options で渡す)",
        "import { query } from '@anthropic-ai/claude-agent-sdk'",
        "options を組み立てて query() を呼ぶ (or new SDKClient)",
        "エージェントが async generator でメッセージを返す → for-await で処理",
        "tool_use ループは内部で自動回る (canUseTool で割り込み可能)",
        "最終 result を取り出してアプリのロジックへ",
      ],
      python: [
        "ANTHROPIC_API_KEY で認証",
        "from claude_agent_sdk import query, ClaudeAgentOptions",
        "options を構築して query() を呼ぶ (or ClaudeSDKClient で対話)",
        "async iterator でメッセージを受信",
        "tool_use ループは内部で自動回る (can_use_tool で割り込み可能)",
        "最終 result を取り出してアプリのロジックへ",
      ],
      managed: [
        "ANTHROPIC_API_KEY で認証 (Authorization: Bearer)",
        "Anthropic コンソールでエージェントを事前作成 → agent_id 取得",
        "POST /v1/agents/{agent_id}/messages にプロンプト送信",
        "Anthropic 側で tool_use ループが完結 (サーバー側実行)",
        "thread_id で会話継続可能",
        "結果を JSON で受信",
      ],
    },
    ioByRuntime: {
      typescript: { in: "ClaudeAgentOptions + prompt", out: "AsyncGenerator<Message> (ツール実行履歴 + 最終 result)" },
      python:     { in: "ClaudeAgentOptions + prompt", out: "AsyncIterator[Message] (ツール実行履歴 + 最終 result)" },
      managed:    { in: "agent_id + prompt (+ thread_id)", out: "ホステッド実行の JSON レスポンス (assistant message + tool 実行履歴)" },
    },
    definitionByRuntime: {
      typescript: `// TypeScript / Node.js\nimport { query } from "@anthropic-ai/claude-agent-sdk";\n\nfor await (const msg of query({\n  prompt: "デプロイ前チェックを実行して",\n  options: {\n    model: "sonnet",\n    allowedTools: ["Read", "Bash", "Grep"],\n    permissionMode: "acceptEdits",\n    maxTurns: 20,\n  },\n})) {\n  console.log(msg);\n}\n// 認証: process.env.ANTHROPIC_API_KEY`,
      python:     `# Python\nfrom claude_agent_sdk import query, ClaudeAgentOptions\nimport asyncio\n\nasync def main():\n    options = ClaudeAgentOptions(\n        model="sonnet",\n        allowed_tools=["Read", "Bash", "Grep"],\n        permission_mode="acceptEdits",\n        max_turns=20,\n    )\n    async for msg in query(prompt="デプロイ前チェックを実行して", options=options):\n        print(msg)\n\nasyncio.run(main())\n# 認証: os.environ["ANTHROPIC_API_KEY"]`,
      managed:    `# Managed Agents (REST)\n# POST https://api.anthropic.com/v1/agents/{agent_id}/messages\ncurl https://api.anthropic.com/v1/agents/ag_xxxx/messages \\\n  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "prompt": "デプロイ前チェックを実行して",\n    "thread_id": null,\n    "stream": false\n  }'`,
    },
  },
};


// ═══════════════════════════════════════════════════════
// ELEMENTS — Whiteboard element catalog (Tier 1-3, ~130 cards)
// (moved from whiteboard.html 558-1144 — マスター: 8093 で確定)
// ═══════════════════════════════════════════════════════

// ══════════ PARTS (実用パーツ) ══════════
// 「業務の動詞」で使える事前設定済みノード。ELEMENTS と同じ shape (cat/type/id/title/subtitle/desc/meta)。
// ELEMENTS が「Claude Code プリミティブのカタログ (技術単位)」なのに対し、
// PARTS は「メールを送る / 予定を入れる 等の実用単位」。非エンジニア向けパレットの「🧱 パーツ」タブに出る。
//
// 各 part の meta.capability が PART_FIELDS のキーになり、実用コアのフィールド定義 (ラベル/入力タイプ) を引く。
// meta.core に実用コアのデフォルト値を持つ。詳細 (server/auth/action 等) は従来通り TYPE_SPECS 側で扱う。
window.FI.PARTS = [
  // ── 🚩 フロー共通 (全フローの開始/終了 = スキルの I/O 契約。フロー化時に自動注入される) ──
  { cat: "🚩 フロー共通", tier: 1, type: "trigger", id: "part-flow-start", title: "フロー開始", subtitle: "入力・トリガー",
    desc: "このフロー（スキル）の起点。何を入力として受け取り、何をきっかけに動き出すかを定義します。",
    meta: { capability: "flow.start" } },
  { cat: "🚩 フロー共通", tier: 1, type: "parent", id: "part-flow-end", title: "フロー完了", subtitle: "出力物・通知先",
    desc: "このフロー（スキル）の終点。最終的に何を生成し、完了をどこに通知するかを定義します。",
    meta: { capability: "flow.end" } },

  // ── 📧 Gmail (接続済み MCP / 下書き中心=送信なしの安全設計) ──
  { cat: "📧 Gmail", tier: 1, type: "mcp", id: "part-gmail-draft", title: "メールの下書きを作る", subtitle: "Gmail",
    desc: "宛先・件名・本文を指定して Gmail の下書きを作成します（送信はせず下書き保存＝誤送信しない安全設計）。",
    meta: { server: "gmail", action: "tool", tool_name: "create_draft", capability: "gmail.create_draft" } },
  { cat: "📧 Gmail", tier: 1, type: "mcp", id: "part-gmail-search", title: "メールを調べる", subtitle: "Gmail",
    desc: "「誰から」「未読」「期間」などの条件でメールを検索します。",
    meta: { server: "gmail", action: "tool", tool_name: "search_threads", capability: "gmail.search_threads" } },
  { cat: "📧 Gmail", tier: 1, type: "mcp", id: "part-gmail-read", title: "スレッドを読む", subtitle: "Gmail",
    desc: "対象のメールスレッドの本文・件名・送信者を取得します。",
    meta: { server: "gmail", action: "tool", tool_name: "get_thread", capability: "gmail.get_thread" } },
  { cat: "📧 Gmail", tier: 1, type: "mcp", id: "part-gmail-label", title: "ラベルを付ける", subtitle: "Gmail",
    desc: "対象スレッドにラベルを付与して仕分けします。",
    meta: { server: "gmail", action: "tool", tool_name: "label_thread", capability: "gmail.label_thread" } },

  // ── 📅 Google Calendar ──
  { cat: "📅 カレンダー", tier: 1, type: "mcp", id: "part-cal-create", title: "予定を入れる", subtitle: "Google Calendar",
    desc: "タイトル・日時・参加者を指定してカレンダーに予定を作成します。",
    meta: { server: "google-calendar", action: "tool", tool_name: "create_event", capability: "calendar.create_event" } },
  { cat: "📅 カレンダー", tier: 1, type: "mcp", id: "part-cal-list", title: "予定を調べる", subtitle: "Google Calendar",
    desc: "指定した期間のカレンダー予定を一覧で取得します。",
    meta: { server: "google-calendar", action: "tool", tool_name: "list_events", capability: "calendar.list_events" } },
  { cat: "📅 カレンダー", tier: 1, type: "mcp", id: "part-cal-suggest", title: "空き時間を探す", subtitle: "Google Calendar",
    desc: "参加者全員が空いている時間帯を提案します。",
    meta: { server: "google-calendar", action: "tool", tool_name: "suggest_time", capability: "calendar.suggest_time" } },
  { cat: "📅 カレンダー", tier: 1, type: "mcp", id: "part-cal-respond", title: "出欠を返す", subtitle: "Google Calendar",
    desc: "招待された予定に参加/不参加を返答します。",
    meta: { server: "google-calendar", action: "tool", tool_name: "respond_to_event", capability: "calendar.respond_to_event" } },

  // ── 📁 Google Drive ──
  { cat: "📁 Drive", tier: 1, type: "mcp", id: "part-drive-search", title: "ファイルを探す", subtitle: "Google Drive",
    desc: "キーワードで Drive 内のファイルを検索します。",
    meta: { server: "google-drive", action: "tool", tool_name: "search_files", capability: "drive.search_files" } },
  { cat: "📁 Drive", tier: 1, type: "mcp", id: "part-drive-read", title: "中身を読む", subtitle: "Google Drive",
    desc: "対象ファイルの中身をテキストとして取得します。",
    meta: { server: "google-drive", action: "tool", tool_name: "read_file_content", capability: "drive.read_file_content" } },
  { cat: "📁 Drive", tier: 1, type: "mcp", id: "part-drive-create", title: "新規作成", subtitle: "Google Drive",
    desc: "名前と中身を指定して Drive にファイルを作成します。",
    meta: { server: "google-drive", action: "tool", tool_name: "create_file", capability: "drive.create_file" } },

  // ── 📝 Notion ──
  { cat: "📝 Notion", tier: 1, type: "mcp", id: "part-notion-create", title: "ページを作る", subtitle: "Notion",
    desc: "タイトルと本文を指定して Notion にページを作成します。",
    meta: { server: "notion", action: "tool", tool_name: "notion-create-pages", capability: "notion.create_pages" } },
  { cat: "📝 Notion", tier: 1, type: "mcp", id: "part-notion-search", title: "検索する", subtitle: "Notion",
    desc: "キーワードで Notion ワークスペースを検索します。",
    meta: { server: "notion", action: "tool", tool_name: "notion-search", capability: "notion.search" } },
  { cat: "📝 Notion", tier: 1, type: "mcp", id: "part-notion-update", title: "ページを更新", subtitle: "Notion",
    desc: "対象ページに内容を追記・更新します。",
    meta: { server: "notion", action: "tool", tool_name: "notion-update-page", capability: "notion.update_page" } },

  // ── 💬 iMessage ──
  { cat: "💬 iMessage", tier: 1, type: "mcp", id: "part-imsg-send", title: "メッセージを送る", subtitle: "iMessage",
    desc: "宛先と本文を指定して iMessage を送信します。",
    meta: { server: "imessage", action: "tool", tool_name: "send_imessage", capability: "imessage.send" } },
  { cat: "💬 iMessage", tier: 1, type: "mcp", id: "part-imsg-unread", title: "未読を読む", subtitle: "iMessage",
    desc: "未読の iMessage を取得します。",
    meta: { server: "imessage", action: "tool", tool_name: "get_unread_imessages", capability: "imessage.unread" } },
  { cat: "💬 iMessage", tier: 1, type: "mcp", id: "part-imsg-contact", title: "連絡先を探す", subtitle: "iMessage",
    desc: "名前・電話・メールで連絡先を検索します。",
    meta: { server: "imessage", action: "tool", tool_name: "search_contacts", capability: "imessage.search_contacts" } },

  // ── 🗄 ローカルDB (code ラッパー / sqlite 等) ──
  { cat: "🗄 ローカルDB", tier: 1, type: "code", id: "part-db-record", title: "記録する", subtitle: "ローカルDB",
    desc: "手元のデータベース（例: ~/data/app.sqlite）にデータを記録します。",
    meta: { tool: "Bash", capability: "localdb.record" } },
  { cat: "🗄 ローカルDB", tier: 1, type: "code", id: "part-db-query", title: "調べる", subtitle: "ローカルDB",
    desc: "条件を指定してローカルDBからデータを取得します。",
    meta: { tool: "Bash", capability: "localdb.query" } },
  { cat: "🗄 ローカルDB", tier: 1, type: "code", id: "part-db-update", title: "更新する", subtitle: "ローカルDB",
    desc: "対象レコードの内容を更新します。",
    meta: { tool: "Bash", capability: "localdb.update" } },

  // ── 🤖 Claude（LLM呼び出し）= think。メイン Claude 自身に考えさせる ──
  { cat: "🤖 Claude (LLM)", tier: 1, type: "think", id: "part-think-write", title: "文章を書かせる", subtitle: "Claude呼び出し",
    desc: "渡した素材をもとに Claude に文章（記事・本文・原稿）を書かせます。",
    meta: { capability: "think.task" } },
  { cat: "🤖 Claude (LLM)", tier: 1, type: "think", id: "part-think-summarize", title: "要約させる", subtitle: "Claude呼び出し",
    desc: "長い文章や資料を Claude に要約させます。",
    meta: { capability: "think.task" } },
  { cat: "🤖 Claude (LLM)", tier: 1, type: "think", id: "part-think-review", title: "レビューさせる", subtitle: "Claude呼び出し",
    desc: "成果物を観点に沿って Claude にレビュー・チェックさせます。",
    meta: { capability: "think.task" } },
  { cat: "🤖 Claude (LLM)", tier: 1, type: "think", id: "part-think-format", title: "整形させる", subtitle: "Claude呼び出し",
    desc: "文体や形式を Claude に整えさせます。",
    meta: { capability: "think.task" } },

  // ── 👥 サブエージェント = 別働隊の Claude に任せる ──
  { cat: "👥 サブエージェント", tier: 1, type: "subagent", id: "part-sa-investigate", title: "調べさせる", subtitle: "サブエージェント",
    desc: "別文脈の Claude に調査を任せ、結果をファイルにまとめさせます。",
    meta: { capability: "subagent.task" } },
  { cat: "👥 サブエージェント", tier: 1, type: "subagent", id: "part-sa-build", title: "作らせる", subtitle: "サブエージェント",
    desc: "別文脈の Claude に実装・生成タスクを任せます。",
    meta: { capability: "subagent.task" } },
  { cat: "👥 サブエージェント", tier: 1, type: "subagent", id: "part-sa-review", title: "レビューさせる", subtitle: "サブエージェント",
    desc: "別文脈の Claude に客観的なレビューを任せます。",
    meta: { capability: "subagent.task" } },

  // ── ⚙ コード・ファイル = code ──
  { cat: "⚙ コード・ファイル", tier: 1, type: "code", id: "part-code-read", title: "ファイルを読む", subtitle: "コード実行",
    desc: "ファイルの中身を読み取ります。",
    meta: { tool: "Read", capability: "code.read" } },
  { cat: "⚙ コード・ファイル", tier: 1, type: "code", id: "part-code-write", title: "ファイルを書く", subtitle: "コード実行",
    desc: "ファイルを新規作成・上書きします。",
    meta: { tool: "Write", capability: "code.write" } },
  { cat: "⚙ コード・ファイル", tier: 1, type: "code", id: "part-code-run", title: "コマンドを実行", subtitle: "コード実行",
    desc: "シェルコマンドやスクリプトを実行します。",
    meta: { tool: "Bash", capability: "code.run" } },
  { cat: "⚙ コード・ファイル", tier: 1, type: "code", id: "part-code-search", title: "検索する", subtitle: "コード実行",
    desc: "ファイル内のテキストやファイル名を検索します。",
    meta: { tool: "Grep", capability: "code.search" } },

  // ── 📄 文書作成（公式スキル / builtin = 中身非公開）──
  { cat: "📄 文書作成", tier: 1, type: "skill", id: "part-skill-docx", title: "Word を作る", subtitle: "docx スキル",
    desc: "依頼内容に沿って Word 文書（.docx）を作成します。",
    meta: { skill_name: "docx", builtin: true, capability: "skill.document" } },
  { cat: "📄 文書作成", tier: 1, type: "skill", id: "part-skill-pptx", title: "スライドを作る", subtitle: "pptx スキル",
    desc: "依頼内容に沿って PowerPoint（.pptx）を作成します。",
    meta: { skill_name: "pptx", builtin: true, capability: "skill.document" } },
  { cat: "📄 文書作成", tier: 1, type: "skill", id: "part-skill-pdf", title: "PDF を作る", subtitle: "pdf スキル",
    desc: "依頼内容に沿って PDF を作成します。",
    meta: { skill_name: "pdf", builtin: true, capability: "skill.document" } },
  { cat: "📄 文書作成", tier: 1, type: "skill", id: "part-skill-xlsx", title: "表計算を作る", subtitle: "xlsx スキル",
    desc: "依頼内容に沿って Excel（.xlsx）を作成します。",
    meta: { skill_name: "xlsx", builtin: true, capability: "skill.document" } },
  { cat: "📄 文書作成", tier: 1, type: "skill", id: "part-skill-custom", title: "自作スキルを呼ぶ", subtitle: "スキル",
    desc: "自分で作ったスキルを部品として呼び出します。",
    meta: { capability: "skill.custom" } },

  // ── 🔀 分岐・確認 ──
  { cat: "🔀 分岐・確認", tier: 1, type: "decision", id: "part-decision", title: "条件で分ける", subtitle: "分岐判定",
    desc: "条件に応じて処理ルートを yes / no に分けます。",
    meta: { capability: "decision.branch" } },
  { cat: "🔀 分岐・確認", tier: 1, type: "user", id: "part-user-confirm", title: "ユーザーに確認", subtitle: "ユーザー操作",
    desc: "人間に確認・入力を求めます。",
    meta: { capability: "user.confirm" } },

  // ── 🌐 外部API（MCP が無いサービス / 別LLM）──
  { cat: "🌐 外部API", tier: 1, type: "api", id: "part-api-llm", title: "別のLLMに投げる", subtitle: "Claude/OpenAI/Gemini",
    desc: "外部の LLM API（Claude / OpenAI / Gemini）に指示を投げて結果を受け取ります。",
    meta: { capability: "api.llm" } },
  { cat: "🌐 外部API", tier: 1, type: "api", id: "part-api-discord", title: "Discordに投稿", subtitle: "Discord Webhook",
    desc: "Discord チャンネルにメッセージを投稿します。",
    meta: { service: "discord", capability: "api.discord" } },
  { cat: "🌐 外部API", tier: 1, type: "api", id: "part-api-line", title: "LINEで送る", subtitle: "LINE Messaging",
    desc: "LINE でメッセージを送信します。",
    meta: { service: "line", capability: "api.line" } },
];

// ── PART_FIELDS: capability ごとの実用コア フィールド定義 (2層UIの「コア」側) ──
// 詳細 (server/auth/params-JSON) は出さず、業務の言葉のフィールドだけ。
window.FI.PART_FIELDS = {
  // 🚩 フロー共通 — 開始/終了 (スキルの I/O 契約 = インターフェース)
  "flow.start": [
    { key: "input",   label: "入力物",       long: true, required: true,
      desc: "このフローが受け取る素材（例: input/ の取材メモ.docx、ユーザーが渡すテキスト）" },
    { key: "trigger", label: "トリガー種類", required: true,
      options: ["/コマンド", "ファイル変更", "スケジュール", "手動", "Webhook"],
      info: {
        "/コマンド":    "/skill-name で手動起動",
        "ファイル変更":  "特定フォルダ/ファイルの変更で自動起動",
        "スケジュール":  "定時実行（cron 等）",
        "手動":         "ユーザーが明示的に開始",
        "Webhook":      "外部からの通知で起動",
      } },
  ],
  "flow.end": [
    { key: "outputs", label: "出力物", long: true, required: true,
      desc: "このフローが最終的に生成する成果物（例: output/article.docx、記録されたDB行）" },
    { key: "notify",  label: "通知先", required: false,
      desc: "完了をどこに知らせるか（例: Slack #general、メール、なし）" },
  ],
  "gmail.create_draft": [
    { key: "to",      label: "宛先",   required: true,  placeholder: "tanaka@example.com" },
    { key: "subject", label: "件名",   required: true,  placeholder: "【納品】導入事例記事" },
    { key: "body",    label: "本文",   long: true, required: true,  desc: "メール本文" },
  ],
  "gmail.search_threads": [
    { key: "query",       label: "検索条件", required: true,  desc: "例: is:unread from:tanaka after:2026-05-01" },
    { key: "max_results", label: "取得件数", required: false, desc: "デフォルト 20" },
  ],
  "gmail.get_thread": [
    { key: "thread_id", label: "対象スレッド", required: true, desc: "スレッドID または検索で選択" },
  ],
  "gmail.label_thread": [
    { key: "thread_id", label: "対象スレッド", required: true },
    { key: "label",     label: "ラベル名",   required: true, desc: "例: Work / Follow-up" },
  ],

  // 📅 Calendar
  "calendar.create_event": [
    { key: "summary",        label: "タイトル", required: true, placeholder: "打ち合わせ" },
    { key: "startTime",      label: "開始日時", required: true, desc: "例: 2026-06-03T14:00:00" },
    { key: "endTime",        label: "終了日時", required: true, desc: "例: 2026-06-03T15:00:00" },
    { key: "location",       label: "場所",     required: false },
    { key: "attendeeEmails", label: "参加者",   required: false, multi: true, desc: "メールアドレス" },
  ],
  "calendar.list_events": [
    { key: "startTime", label: "期間（開始）", required: false, desc: "例: 2026-06-01T00:00:00" },
    { key: "endTime",   label: "期間（終了）", required: false },
    { key: "fullText",  label: "キーワード",   required: false, desc: "タイトル・場所・参加者を絞り込み" },
  ],
  "calendar.suggest_time": [
    { key: "attendeeEmails", label: "参加者",       required: true, multi: true, desc: "空きを探したい人のメール（自分は primary）" },
    { key: "startTime",      label: "候補期間（開始）", required: true },
    { key: "endTime",        label: "候補期間（終了）", required: true },
    { key: "durationMinutes", label: "所要時間（分）",  required: false, desc: "デフォルト 30" },
  ],
  "calendar.respond_to_event": [
    { key: "eventId",        label: "対象イベント", required: true },
    { key: "responseStatus", label: "返答",        required: true, options: ["accepted", "declined", "tentative"],
      info: { accepted: "参加", declined: "不参加", tentative: "仮承諾" } },
  ],

  // 📁 Drive
  "drive.search_files": [
    { key: "query", label: "検索キーワード", required: true, desc: "例: title contains '請求書' / fullText contains '見積'" },
  ],
  "drive.read_file_content": [
    { key: "fileId", label: "対象ファイル", required: true, desc: "ファイルID（検索で取得）" },
  ],
  "drive.create_file": [
    { key: "title",       label: "ファイル名", required: true },
    { key: "textContent", label: "中身",      long: true, required: false },
    { key: "parentId",    label: "置き場所",   required: false, desc: "フォルダID（未指定はマイドライブ直下）" },
  ],

  // 📝 Notion
  "notion.create_pages": [
    { key: "title",   label: "タイトル", required: true },
    { key: "content", label: "本文",    long: true, required: false, desc: "Notion Markdown" },
    { key: "parent",  label: "置き場所", required: false, desc: "親ページ/DBのID（未指定はワークスペース直下）" },
  ],
  "notion.search": [
    { key: "query", label: "検索キーワード", required: true },
  ],
  "notion.update_page": [
    { key: "page_id", label: "対象ページ", required: true, desc: "ページID" },
    { key: "content", label: "追記内容",   long: true, required: false, desc: "Notion Markdown" },
  ],

  // 💬 iMessage
  "imessage.send": [
    { key: "recipient", label: "宛先", required: true, desc: "電話番号 または メール" },
    { key: "message",   label: "本文", long: true, required: true },
  ],
  "imessage.unread": [],
  "imessage.search_contacts": [
    { key: "query", label: "検索（名前/電話/メール）", required: true },
  ],

  // 🗄 ローカルDB
  "localdb.record": [
    { key: "target",  label: "保存先",      required: true, desc: "DBパス/テーブル（例: ~/data/app.sqlite の posts）" },
    { key: "content", label: "記録する内容", long: true, required: true, desc: "保存する項目・値" },
  ],
  "localdb.query": [
    { key: "target",    label: "対象",     required: true, desc: "DBパス/テーブル" },
    { key: "condition", label: "検索条件", long: true, required: false, desc: "例: 日付が今週、ステータスが未処理" },
  ],
  "localdb.update": [
    { key: "target",    label: "対象",     required: true },
    { key: "condition", label: "どれを",   required: true, desc: "更新対象の条件" },
    { key: "content",   label: "更新内容", long: true, required: true },
  ],

  // 🤖 Claude (think)
  "think.task": [
    { key: "prompt", label: "Claudeへの指示", long: true, required: true, desc: "何を・どんな観点で・どんな形式で出力させるか" },
    { key: "files",  label: "渡すファイル",   multi: true, required: false, desc: "素材として読ませるファイル/フォルダ" },
    { key: "model",  label: "モデル",         options: ["sonnet", "opus", "haiku"], required: false,
      info: { sonnet: "バランス型 標準", opus: "高性能 複雑タスク", haiku: "高速・低コスト" } },
  ],

  // 👥 subagent
  "subagent.task": [
    { key: "agent",  label: "どのClaude", options: ["general-purpose", "Explore", "Plan"], required: false,
      info: { "general-purpose": "汎用（何でも）", Explore: "調査特化（読み取り）", Plan: "計画特化" } },
    { key: "prompt", label: "依頼内容",    long: true, required: true, desc: "目的・入力・期待する成果物" },
    { key: "target", label: "対象ファイル", multi: true, required: false },
    { key: "model",  label: "モデル",      options: ["sonnet", "opus", "haiku"], required: false },
  ],

  // ⚙ code
  "code.read":   [ { key: "path", label: "対象ファイル", required: true, desc: "読み取るファイルのパス" } ],
  "code.write":  [
    { key: "path",    label: "保存先", required: true },
    { key: "content", label: "内容",   long: true, required: true },
  ],
  "code.run":    [ { key: "command", label: "コマンド", long: true, required: true, desc: "実行するシェルコマンド/スクリプト" } ],
  "code.search": [
    { key: "pattern", label: "検索パターン", required: true, desc: "探したい文字列・正規表現" },
    { key: "path",    label: "対象範囲",    required: false, desc: "検索するフォルダ（未指定は全体）" },
  ],

  // 📄 文書作成（公式スキル / builtin → リクエスト内容＋対象のみ）
  "skill.document": [
    { key: "request", label: "リクエスト内容", long: true, required: true, desc: "何を作るか（例: 議事録を当社フォーマットの Word に）" },
    { key: "target",  label: "対象ファイル",   multi: true, required: false, desc: "元になる素材ファイル" },
  ],
  "skill.custom": [
    { key: "skill_name", label: "スキル名",     required: true, desc: "呼び出す自作スキルの名前" },
    { key: "request",    label: "リクエスト内容", long: true, required: true },
    { key: "target",     label: "対象ファイル",   multi: true, required: false },
  ],

  // 🔀 分岐・確認
  "decision.branch": [
    { key: "condition", label: "判断条件（質問形）", required: true, desc: "例: テストは通った？ / ファイルはある？" },
  ],
  "user.confirm": [
    { key: "message", label: "確認・入力内容", long: true, required: true, desc: "ユーザーに見せる/聞く内容" },
  ],

  // 🌐 外部API
  "api.llm": [
    { key: "service", label: "サービス", options: ["claude", "openai", "gemini"], required: true,
      info: { claude: "Anthropic Claude", openai: "OpenAI GPT", gemini: "Google Gemini" } },
    { key: "prompt",  label: "指示",     long: true, required: true },
    { key: "model",   label: "モデル",   required: false, desc: "サービスに応じたモデル名" },
  ],
  "api.discord": [
    { key: "content", label: "本文", long: true, required: true, desc: "Discord に投稿するメッセージ" },
  ],
  "api.line": [
    { key: "to",      label: "送信先", required: true, desc: "ユーザーID / グループID" },
    { key: "message", label: "本文",   long: true, required: true },
  ],

  // 💬 Slack (MCP) — 宛先(channel)/本文を実用コア必須に。#general は placeholder のみ (保存値にしない)。
  "slack.send_message": [
    { key: "channel",   label: "送信先チャンネル", required: true,  placeholder: "#general", desc: "例: #general / @user / チャンネルID" },
    { key: "text",      label: "本文",            long: true, required: true },
    { key: "thread_ts", label: "スレッド返信先",   required: false, desc: "親メッセージの ts（任意）" },
  ],
  "slack.search_messages": [
    { key: "query",       label: "検索クエリ", required: true,  desc: "Slack検索構文: from:@user in:#channel before:YYYY-MM-DD" },
    { key: "max_results", label: "最大件数",   required: false },
  ],
};

window.FI.ELEMENTS = [
  // ── Design Reference: 全ノードタイプ見本 ──
  { cat: "★ ノードタイプ一覧", tier: 1, type: "parent",   id: "ref-parent",   title: "スキル受信",           subtitle: "親エージェント",             desc: "フロー全体を制御する親エージェントノード。角丸矩形＋青アクセントバー", meta: { shape: "rect (rx:10)", accent: "左サイドバー", color: "#2563eb" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "hook",     id: "ref-hook",     title: "pre: 入力バリデーション", subtitle: "PreToolUse フック",           desc: "イベントに応じて発火するフックノード。平行四辺形＋オレンジアクセントバー", meta: { shape: "para (skew:14)", accent: "斜めバー", color: "#c2410c" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "subagent", id: "ref-subagent", title: "Explore: 過去投稿分析",  subtitle: "サブエージェント（読み取り専用）", desc: "並列実行可能なサブエージェント。六角形＋紫ダイヤモンドアクセント", meta: { shape: "hex (inset:16)", accent: "ダイヤモンド", color: "#7c3aed" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "mcp",      id: "ref-mcp",      title: "画像アセット検索",      subtitle: "canva-mcp",                  desc: "外部MCP連携ノード。ピル型（完全丸角）＋緑サークルアクセント", meta: { shape: "pill (rx:h/2)", accent: "サークル", color: "#15803d" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "code",     id: "ref-code",     title: "Read",                  subtitle: "ファイル読込",                desc: "コード実行・ツール呼出ノード。シャープ矩形＋$_プロンプトアクセント", meta: { shape: "sharp (rx:2)", accent: "$_ プロンプト", color: "#525252" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "user",     id: "ref-user",     title: "タイムライン",          subtitle: "時系列表示",                  desc: "ユーザー操作・表示系ノード。八角形＋サイドバーアクセント", meta: { shape: "octa (chamfer:16)", accent: "サイドバー", color: "#a16207" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "decision", id: "ref-decision", title: "条件分岐",              subtitle: "Bash結果で判定",              desc: "分岐判定ノード。ダイヤモンド型", meta: { shape: "diamond", accent: "なし", color: "#1f2937" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "skill",    id: "ref-skill",    title: "SKILL.mdファイル",       subtitle: "name / description / body",  desc: "スキル定義ノード。角丸矩形＋シアンアクセントバー", meta: { shape: "rect (rx:10)", accent: "左サイドバー", color: "#0891b2" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "command",  id: "ref-command",  title: "commands/run.md",       subtitle: "claude/commands/配下",        desc: "カスタムコマンドノード。シャープ矩形＋$_アクセント", meta: { shape: "sharp (rx:2)", accent: "$_ プロンプト", color: "#6d28d9" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "config",   id: "ref-config",   title: "settings.json",         subtitle: "model / allowedTools / permissions", desc: "設定ノード。角丸矩形＋グレーアクセント", meta: { shape: "rect (rx:9)", accent: "左サイドバー", color: "#78716c" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "api",      id: "ref-api",      title: "model",                 subtitle: "モデル名指定",                desc: "APIパラメータノード。ピル型＋ティールサークルアクセント", meta: { shape: "pill (rx:h/2)", accent: "サークル", color: "#0d9488" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "plugin",   id: "ref-plugin",   title: "plugin.json",           subtitle: "プラグインマニフェスト",       desc: "プラグイン定義ノード。タブ型（左上折り）＋インディゴアクセント", meta: { shape: "tab (notch:10)", accent: "左サイドバー", color: "#4f46e5" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "agentsdk", id: "ref-agentsdk", title: "createAgentWithOptions", subtitle: "agent.ts エントリポイント",    desc: "Agent SDKノード。台形型（上辺が狭い）＋ローズアクセント", meta: { shape: "trap (inset:12)", accent: "斜めバー", color: "#be185d" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "trigger",  id: "ref-trigger",  title: "Trigger (起点)",         subtitle: "フローを起こすきっかけ",     desc: "トリガーノード。ピル型 (フローチャートの start node 風)＋アンバーアクセント", meta: { shape: "pill (rx:h/2)", accent: "サークル", color: "#d97706" } },

  // A. Hook イベント
  // A. Hook イベント — 22個 (発動タイミング+入力データ+matcher意味+ブロック能力+出力フィールドが
  // それぞれ違うので個別カードで残す。Tier1=必須5、Tier2=重要8、Tier3=差別化9)。
  // 各カードの meta.placement は将来のフロー配置バリデーション用 (IMPLEMENTATION_NOTES.md 参照)。

  // ─── Tier 1 (必須) ───
  { cat: "A. Hook イベント", tier: 1, type: "hook", id: "SessionStart", title: "SessionStart", subtitle: "セッション開始時", desc: "セッション開始時に発火。matcher: startup / resume / clear / compact",
    meta: { event: "SessionStart", placement: "session-start", matcher: "startup|resume", handler_type: "command", command: "echo 'プロジェクト情報を読み込み中…' && cat .claude/STATUS.md", timeout: 30, additionalContext: "プロジェクトの最近の変更点をClaudeに伝える",
      io: { in: "session開始情報 (how: startup/resume/clear/compact, cwd, project_dir)", out: "additionalContext で Claude に追加情報を注入" } } },
  { cat: "A. Hook イベント", tier: 1, type: "hook", id: "UserPromptSubmit", title: "UserPromptSubmit", subtitle: "プロンプト送信時", desc: "ユーザーがメッセージ送信した直後。文脈注入・危険指示のブロックに使う",
    meta: { event: "UserPromptSubmit", placement: "before-prompt", matcher: "", handler_type: "prompt", prompt_text: "このプロンプトに機密情報の漏洩リスクがあるかチェック", timeout: 30, async: "false", permission_decision: "allow",
      io: { in: "ユーザーが書いたプロンプト本文 + session info", out: "additionalContext / sessionTitle / ブロック判定" } } },
  { cat: "A. Hook イベント", tier: 1, type: "hook", id: "PreToolUse", title: "PreToolUse", subtitle: "ツール実行前 (最重要)", desc: "Claudeがツール実行する直前。matcherで対象ツール指定。ブロック可。",
    meta: { event: "PreToolUse", placement: "before-tool", matcher: "Bash", handler_type: "command", command: "bash scripts/validate-bash.sh", timeout: 30, permission_decision: "allow",
      io: { in: "tool_name + tool_input (実行前情報)", out: "permissionDecision (allow/deny/ask) / toolInputModification / additionalContext" } } },
  { cat: "A. Hook イベント", tier: 1, type: "hook", id: "PostToolUse", title: "PostToolUse", subtitle: "ツール実行後", desc: "ツール実行成功直後。自動フォーマット・テスト実行・ログ記録等",
    meta: { event: "PostToolUse", placement: "after-tool", matcher: "Edit|Write", handler_type: "command", command: "prettier --write \"$FILE_PATH\"", timeout: 30,
      io: { in: "tool_name + tool_input + tool_response (実行結果も含む)", out: "additionalContext (結果をClaudeに伝える)" } } },
  { cat: "A. Hook イベント", tier: 1, type: "hook", id: "Stop", title: "Stop", subtitle: "応答完了時", desc: "Claudeの応答完了時。完了通知、強制継続",
    meta: { event: "Stop", placement: "before-response-end", matcher: "", handler_type: "http", url: "https://hooks.slack.com/services/T00000/B00000/XXXXXXXX", timeout: 10,
      io: { in: "応答完了情報", out: "Slackなどへの通知送信 / ブロック判定で強制継続" } } },

  // ─── Tier 2 (重要) ───
  { cat: "A. Hook イベント", tier: 2, type: "hook", id: "PostToolUseFailure", title: "PostToolUseFailure", subtitle: "ツール失敗時", desc: "ツール実行失敗時。エラー記録、リトライ提案",
    meta: { event: "PostToolUseFailure", placement: "after-tool", matcher: "Bash", handler_type: "command", command: "bash scripts/log-failure.sh", timeout: 10,
      io: { in: "tool_name + tool_input + error 情報", out: "additionalContext (エラーをClaudeに伝えてリトライ提案)" } } },
  { cat: "A. Hook イベント", tier: 2, type: "hook", id: "PermissionRequest", title: "PermissionRequest", subtitle: "権限ダイアログ発火時", desc: "権限確認ダイアログ表示の瞬間。自動承認/拒否ルール注入",
    meta: { event: "PermissionRequest", placement: "before-tool", matcher: "Bash", handler_type: "command", command: "bash scripts/auto-approve.sh", timeout: 5, permission_decision: "allow",
      io: { in: "tool_name + tool_input", out: "decision.behavior (allow/deny) + decision.updatedInput" } } },
  { cat: "A. Hook イベント", tier: 2, type: "hook", id: "SubagentStart", title: "SubagentStart", subtitle: "サブエージェント起動時", desc: "サブエージェント起動の瞬間。開始ログ、初期コンテキスト渡し",
    meta: { event: "SubagentStart", placement: "subagent-start", matcher: "Explore|Plan", handler_type: "command", command: "echo \"[$(date)] Subagent started\" >> .claude/agent.log", timeout: 5,
      io: { in: "subagent_type + プロンプト", out: "additionalContext (サブエージェントへの初期情報)" } } },
  { cat: "A. Hook イベント", tier: 2, type: "hook", id: "SubagentStop", title: "SubagentStop", subtitle: "サブエージェント完了時", desc: "サブエージェント完了の瞬間。結果集約、完了報告",
    meta: { event: "SubagentStop", placement: "subagent-stop", matcher: "Explore|Plan", handler_type: "command", command: "echo \"[$(date)] Subagent finished\" >> .claude/agent.log", timeout: 5,
      io: { in: "subagent_type + 実行結果", out: "additionalContext (親エージェントへの結果サマリ)" } } },
  { cat: "A. Hook イベント", tier: 2, type: "hook", id: "ConfigChange", title: "ConfigChange", subtitle: "設定変更時", desc: "settings.json 等の設定変更時。差分通知、再読込後処理",
    meta: { event: "ConfigChange", placement: "file-watch", matcher: "", handler_type: "command", command: "bash scripts/notify-config-change.sh", timeout: 10,
      io: { in: "変更されたファイルパス + 差分", out: "additionalContext (変更内容をClaudeに通知)" } } },
  { cat: "A. Hook イベント", tier: 2, type: "hook", id: "InstructionsLoaded", title: "InstructionsLoaded", subtitle: "CLAUDE.md / .claude/rules/*.md ロード時", desc: "指示ファイル読み込み完了時。プロジェクト固有のコンテキスト追加",
    meta: { event: "InstructionsLoaded", placement: "file-watch", matcher: "", handler_type: "command", command: "cat .claude/recent-decisions.md", timeout: 5,
      io: { in: "ロードされたファイルパス", out: "additionalContext (補足情報の注入)" } } },
  { cat: "A. Hook イベント", tier: 2, type: "hook", id: "FileChanged", title: "FileChanged", subtitle: "ファイル変更検知", desc: "ウォッチ対象のファイル変更時。matcher にファイル名そのもの (独自方式)",
    meta: { event: "FileChanged", placement: "file-watch", matcher: ".envrc|.env", handler_type: "command", command: "bash scripts/reload-env.sh", timeout: 10,
      io: { in: "ファイルパス + 変更タイプ (created/modified/deleted)", out: "additionalContext" } } },
  { cat: "A. Hook イベント", tier: 2, type: "hook", id: "Notification", title: "Notification", subtitle: "システム通知時", desc: "システム通知出力時。matcher: permission_prompt / elicitation_dialog 等",
    meta: { event: "Notification", placement: "notification", matcher: "permission_prompt|elicitation_dialog", handler_type: "command", command: "osascript -e 'display notification \"Claude requests attention\"'", timeout: 5,
      io: { in: "notification type + message", out: "(出力なし、副作用のみ)" } } },

  // ─── Tier 3 (差別化) ───
  { cat: "A. Hook イベント", tier: 3, type: "hook", id: "SessionEnd", title: "SessionEnd", subtitle: "セッション終了時", desc: "会話セッション終了時。作業ログ保存、後片付け",
    meta: { event: "SessionEnd", placement: "session-end", matcher: "logout|clear", handler_type: "command", command: "bash scripts/save-session-log.sh", timeout: 30,
      io: { in: "終了理由 (logout/clear/resume)", out: "(出力なし、副作用のみ)" } } },
  { cat: "A. Hook イベント", tier: 3, type: "hook", id: "Setup", title: "Setup", subtitle: "init / maintenance 実行時", desc: "`claude --init-only` / `--maintenance` 実行時。matcher: init / maintenance",
    meta: { event: "Setup", placement: "session-start", matcher: "init|maintenance", handler_type: "command", command: "bash scripts/project-init.sh", timeout: 60,
      io: { in: "実行モード (init / maintenance)", out: "additionalContext" } } },
  { cat: "A. Hook イベント", tier: 3, type: "hook", id: "TaskCompleted", title: "TaskCompleted", subtitle: "タスク完了時", desc: "Claudeが内部管理するタスク (TodoWrite等) 完了時。次タスク起動、完了通知",
    meta: { event: "TaskCompleted", placement: "subagent-stop", matcher: "", handler_type: "command", command: "bash scripts/on-task-done.sh", timeout: 10,
      io: { in: "completed task の id / content", out: "additionalContext (次タスクへの指示)" } } },
  { cat: "A. Hook イベント", tier: 3, type: "hook", id: "TeammateIdle", title: "TeammateIdle", subtitle: "他エージェント待機時", desc: "協調エージェントが手すきになった瞬間。次の仕事を割り振る",
    meta: { event: "TeammateIdle", placement: "subagent-stop", matcher: "", handler_type: "command", command: "bash scripts/assign-next-task.sh", timeout: 30,
      io: { in: "idle teammate の情報", out: "新タスクの割り当て" } } },
  { cat: "A. Hook イベント", tier: 3, type: "hook", id: "Elicitation", title: "Elicitation", subtitle: "MCPがユーザー入力要求時", desc: "MCPサーバーがユーザー入力を要求した時。よくある入力の自動回答",
    meta: { event: "Elicitation", placement: "mcp-input-request", matcher: "", handler_type: "command", command: "bash scripts/auto-fill-elicitation.sh", timeout: 10,
      io: { in: "MCPサーバーからの入力要求", out: "action (accept/decline/cancel) + content (フォーム値)" } } },
  { cat: "A. Hook イベント", tier: 3, type: "hook", id: "WorktreeCreate", title: "WorktreeCreate", subtitle: "Git worktree作成時", desc: "Git worktree (作業用の別フォルダ) 作成時。新作業空間の初期化",
    meta: { event: "WorktreeCreate", placement: "worktree-create", matcher: "", handler_type: "command", command: "cd $WORKTREE_PATH && npm install", timeout: 120,
      io: { in: "worktreePath + branch", out: "worktreePath (確定パス) + additionalContext" } } },
  { cat: "A. Hook イベント", tier: 3, type: "hook", id: "WorktreeRemove", title: "WorktreeRemove", subtitle: "Git worktree削除時", desc: "Git worktree削除時。後片付け、キャッシュクリア",
    meta: { event: "WorktreeRemove", placement: "worktree-remove", matcher: "", handler_type: "command", command: "rm -rf node_modules .next", timeout: 30,
      io: { in: "削除されたworktreePath", out: "(出力なし、副作用のみ)" } } },
  { cat: "A. Hook イベント", tier: 3, type: "hook", id: "PreCompact", title: "PreCompact", subtitle: "コンパクション前", desc: "会話履歴のコンパクション開始直前。大事な情報の別途保存",
    meta: { event: "PreCompact", placement: "before-compact", matcher: "manual|auto", handler_type: "command", command: "bash scripts/save-key-context.sh", timeout: 30,
      io: { in: "compaction trigger (manual / auto)", out: "additionalContext (要約後も残したい情報)" } } },
  { cat: "A. Hook イベント", tier: 3, type: "hook", id: "PostCompact", title: "PostCompact", subtitle: "コンパクション後", desc: "履歴の要約圧縮完了直後。状態整理、必要情報の再注入",
    meta: { event: "PostCompact", placement: "after-compact", matcher: "manual|auto", handler_type: "command", command: "cat .claude/key-context.md", timeout: 10,
      io: { in: "compaction trigger + 要約結果", out: "additionalContext (再注入する情報)" } } },

  // A-2. Hook ハンドラー (h-*) — 削除。各 Hook イベントカードの fields の handler_type options に格下げ。
  // A-3. Hook 制御 (c-*) — 削除。各 Hook イベントカードの fields に統合 (matcher / timeout / async / exit2 / output / perm / input / ctx)。

  // B. Built-in Tools
  // B. ファイル操作 — カードは1ツール1枚で独立。設定値はツール別 fields をDetailPanelで動的に表示。
  // ここの meta は「代表サンプル」。実フローではノードごとに値が変わる。
  { cat: "B. ファイル操作", tier: 1, type: "code", id: "t-Read", title: "Read", subtitle: "ファイル読込", desc: "offset/limit/pages対応",
    meta: { tool: "Read", file_path: "/path/to/file.md", offset: 1, limit: 200,
      io: { in: "file_path（+ offset / limit / pages）", out: "ファイルの中身（行番号付きテキスト）" } } },
  { cat: "B. ファイル操作", tier: 1, type: "code", id: "t-Write", title: "Write", subtitle: "ファイル新規作成", desc: "既存ファイルは上書き",
    meta: { tool: "Write", file_path: "/path/to/new-file.md", content: "# 新しいファイル\n本文を書き込みます…",
      io: { in: "file_path + content（全文）", out: "書き込み成功/失敗" } } },
  { cat: "B. ファイル操作", tier: 1, type: "code", id: "t-Edit", title: "Edit", subtitle: "ファイル編集（部分置換）", desc: "old_string を new_string に1箇所置換",
    meta: { tool: "Edit", file_path: "/path/to/config.ts", old_string: "const PORT = 8080;", new_string: "const PORT = 9090;", replace_all: "false",
      io: { in: "file_path + old_string + new_string", out: "編集成功/失敗" } } },
  { cat: "B. ファイル操作", tier: 1, type: "code", id: "t-MultiEdit", title: "MultiEdit", subtitle: "複数箇所同時編集", desc: "1ファイル内の複数箇所を一括編集（原子的）",
    meta: { tool: "MultiEdit", file_path: "/path/to/file.ts", edits: '[\n  { "old_string": "foo", "new_string": "bar" },\n  { "old_string": "baz", "new_string": "qux" }\n]',
      io: { in: "file_path + edits[]", out: "全edits適用の成否（原子的）" } } },
  { cat: "B. ファイル操作", tier: 2, type: "code", id: "t-NB", title: "NotebookEdit", subtitle: "Jupyter Notebook編集", desc: "ipynbのセル単位編集",
    meta: { tool: "NotebookEdit", notebook_path: "/path/to/analysis.ipynb", cell_id: "abc123", cell_type: "code", edit_mode: "replace", new_source: "import pandas as pd\ndf = pd.read_csv('data.csv')",
      io: { in: "notebook_path + cell_id + new_source", out: "セル更新結果" } } },
  // B. 検索系 — ripgrep ベースの高速テキスト検索 (Grep) と globパターン検索 (Glob)
  { cat: "B. 検索系", tier: 1, type: "code", id: "t-Grep", title: "Grep", subtitle: "テキスト検索", desc: "ripgrep相当の高速正規表現検索",
    meta: { tool: "Grep", pattern: "function\\s+(\\w+)", path: "src/", glob: "*.ts", output_mode: "content", "-n": "true", "-C": 2, head_limit: 50,
      io: { in: "pattern + 範囲指定 (path/glob/type) + オプション", out: "マッチ箇所のテキスト or ファイル名一覧 or 件数" } } },
  { cat: "B. 検索系", tier: 1, type: "code", id: "t-Glob", title: "Glob", subtitle: "ファイルパス検索", desc: "globパターンでファイル列挙",
    meta: { tool: "Glob", pattern: "**/*.test.ts", path: "/path/to/repo",
      io: { in: "globパターン + 検索開始パス", out: "マッチしたファイルパスの配列（更新日時順）" } } },
  // B. 実行系 — シェルコマンド実行と、バックグラウンド実行の制御
  { cat: "B. 実行系", tier: 1, type: "code", id: "t-Bash", title: "Bash", subtitle: "シェルコマンド実行", desc: "timeout/run_in_background対応",
    meta: { tool: "Bash", command: "npm test -- --coverage", description: "Run tests with coverage", timeout: 300000, run_in_background: "false",
      io: { in: "command (+ timeout / run_in_background / description)", out: "stdout / stderr / exit code（または shell_id）" } } },
  { cat: "B. 実行系", tier: 2, type: "code", id: "t-BO", title: "BashOutput", subtitle: "バックグラウンド出力取得", desc: "バックグラウンドBashの出力取得",
    meta: { tool: "BashOutput", bash_id: "shell_abc123", filter: "ERROR|FAIL",
      io: { in: "bash_id (+ filter)", out: "対象シェルの最新出力 + 状態" } } },
  { cat: "B. 実行系", tier: 2, type: "code", id: "t-KB", title: "KillBash", subtitle: "Bashプロセス停止", desc: "Bashプロセス停止",
    meta: { tool: "KillBash", shell_id: "shell_abc123",
      io: { in: "shell_id", out: "停止結果" } } },

  // B. Web系 — 外部Webにアクセスする
  { cat: "B. Web系", tier: 1, type: "code", id: "t-WF", title: "WebFetch", subtitle: "URL取得", desc: "URLからコンテンツ取得＋抽出",
    meta: { tool: "WebFetch", url: "https://example.com/article", prompt: "この記事の3つの主張を要約して",
      io: { in: "url + prompt", out: "抽出結果テキスト（小さいモデルが処理済み）" } } },
  { cat: "B. Web系", tier: 1, type: "code", id: "t-WS", title: "WebSearch", subtitle: "Web検索", desc: "Anthropic検索バックエンドで検索",
    meta: { tool: "WebSearch", query: "Claude Code hooks 2026", allowed_domains: ["anthropic.com","code.claude.com"], blocked_domains: [],
      io: { in: "query (+ allowed/blocked_domains)", out: "検索結果のタイトル + URL一覧" } } },

  // B. タスク管理 — Todo / サブエージェント / スラッシュコマンド
  { cat: "B. タスク管理", tier: 1, type: "code", id: "t-TW", title: "TodoWrite", subtitle: "タスクリスト管理", desc: "セッション内のTodoリストを更新",
    meta: { tool: "TodoWrite", todos: '[\n  { "content": "実装する", "activeForm": "実装中", "status": "in_progress" },\n  { "content": "テスト書く", "activeForm": "テスト作成中", "status": "pending" }\n]',
      io: { in: "todos[]", out: "Todoリスト更新結果" } } },
  { cat: "B. タスク管理", tier: 1, type: "code", id: "t-Task", title: "Task", subtitle: "サブエージェント呼出し", desc: "別コンテキストでサブエージェントを起動",
    meta: { tool: "Task", subagent_type: "Explore", description: "認証実装を探す", prompt: "認証関連のコードがどこに実装されているか、ファイルパスと該当行を一覧で報告して", run_in_background: "false", isolation: "none",
      io: { in: "subagent_type + prompt (+ オプション)", out: "サブエージェントの最終結果（テキスト）" } } },
  { cat: "B. タスク管理", tier: 2, type: "code", id: "t-SC", title: "SlashCommand", subtitle: "スラッシュコマンド実行", desc: "登録済みコマンドを呼び出す",
    meta: { tool: "SlashCommand", command: "/review pr-123",
      io: { in: "command文字列 (例: '/init args')", out: "コマンド実行結果" } } },

  // B. プラン系 — 計画モードの出入り
  { cat: "B. プラン系", tier: 2, type: "code", id: "t-PM", title: "EnterPlanMode", subtitle: "計画モード開始", desc: "書き込み禁止モードに遷移して計画を立てる",
    meta: { tool: "EnterPlanMode",
      io: { in: "（パラメータなし）", out: "モード遷移結果" } } },
  { cat: "B. プラン系", tier: 2, type: "code", id: "t-EPM", title: "ExitPlanMode", subtitle: "計画モード終了", desc: "計画を提示して通常モードに戻る",
    meta: { tool: "ExitPlanMode", plan: "## 実装計画\n\n1. 認証ミドルウェアを追加\n2. JWT トークン検証ロジックを実装\n3. ログイン/ログアウトエンドポイントを追加\n4. E2Eテストを書く",
      io: { in: "plan（Markdown形式の計画）", out: "ユーザー承認結果" } } },

  // C. Subagent
  // C. Subagent — 実体カードのみ。設定フィールド (model/allowed_tools/permission_mode/isolation等)
  // は subagent ノード詳細パネル内の「設定値」セクションに表示する。
  { cat: "C. Subagent", tier: 1, type: "subagent", id: "sa-def", title: "サブエージェント (汎用)", subtitle: ".claude/agents/*.md", desc: "自作のサブエージェント定義。実フローではモデル・許可ツール・プロンプト・入出力は各ノードごとに変わる（ここの値は見本）",
    meta: {
      file: ".claude/agents/*.md",
      model: "sonnet",
      allowed_tools: ["Read","Grep","Glob","WebFetch"],
      disallowed_tools: ["Bash"],
      permission_mode: "default",
      isolation: "none",
      prompt: "あなたは○○の専門エージェントです。\n以下の手順でタスクを進めてください:\n1. ...\n2. ...\n3. 結果をMarkdownでまとめて返す",
      io: { in: "親エージェントからのプロンプト + コンテキスト", out: "タスクの実行結果（自然文 / 構造化データ）" }
    }
  },
  { cat: "C. Subagent", tier: 2, type: "subagent", id: "sa-bi-explore", title: "builtin: Explore", subtitle: "読み取り専用の探索エージェント", desc: "コードベースを安全に調査する組み込みサブエージェント", meta: { builtin: true, model: "haiku", allowed_tools: ["Read","Grep","Glob","WebFetch"], permission_mode: "default" } },
  { cat: "C. Subagent", tier: 2, type: "subagent", id: "sa-bi-plan", title: "builtin: Plan", subtitle: "実装計画立案エージェント", desc: "実装に入る前の設計・段取りを返す組み込みサブエージェント", meta: { builtin: true, model: "sonnet", allowed_tools: ["Read","Grep","Glob","WebFetch"], permission_mode: "plan" } },
  { cat: "C. Subagent", tier: 2, type: "subagent", id: "sa-bi-general", title: "builtin: general-purpose", subtitle: "汎用エージェント", desc: "調査・実行・修正をまとめて任せられる万能型の組み込みサブエージェント", meta: { builtin: true, model: "sonnet", allowed_tools: ["*"], permission_mode: "default" } },

  // D. MCP
  // D. MCP — メイン10カード (各サーバー1枚)
  // 詳細パネルで meta.action (tool/resource/prompt) を切り替えると、必要な追加フィールドが表示される。
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-def", title: "カスタムMCPサーバー (汎用)", subtitle: ".mcp.json で定義", desc: "自作 or 公式以外のMCPサーバーを表す汎用カード",
    meta: { server: "my-server", auth: "api_key", action: "tool", tool_name: "do_something", params: '{ "key": "value" }',
      io: { in: "server + tool_name + params", out: "ツール実行結果 (JSON)" },
      flowGuide: {
        what:    "サーバーが提供する tool / resource / prompt のどれを呼ぶか",
        target:  "サーバー名 (.mcp.json の mcpServers キー) と、操作対象 (ツール名・リソースURI・プロンプト名)",
        content: "サーバーごとに違う引数 (JSON形式)",
        summary: "自作 or サードパーティのMCPサーバーに対する1回の呼び出し。サーバーごとに固有の引数を渡し、結果を次ステップへ",
      },
      capabilities: [
        { name: "(tools)",     desc: "サーバーが提供する関数。LLMが呼び出して何かを実行する", friendly: "サーバーが「LLMから呼び出して使ってください」と公開している関数群です。副作用あり (データ作成・送信・更新など)。サーバーごとに `send_message` や `query` などの独自関数名で公開されています。" },
        { name: "(resources)", desc: "サーバーが公開する読み取り専用データ (URI参照)",      friendly: "サーバーが「LLMが参照してOK」と公開しているデータです。URI (例: `file:///path/x`, `notion://page/abc`) で識別し、副作用なしで読み取りだけ行います。コンテキストとしてLLMに渡すのに便利。" },
        { name: "(prompts)",   desc: "サーバーが定義する事前プロンプトテンプレート",         friendly: "サーバーが用意した定型プロンプトテンプレートです。引数を埋めて完成したプロンプトをLLMに渡せます。「議事録要約のお手本指示文」のようなものをサーバー側で保守・共有できます。" },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-fs", title: "Filesystem", subtitle: "ファイル読み書き", desc: "指定フォルダ内のファイルを安全に操作",
    meta: { server: "filesystem", auth: "none", action: "tool", tool_name: "read_file", params: '{ "path": "~/Documents/notes.md" }',
      io: { in: "server + tool_name + params", out: "ツール実行結果 (JSON)" },
      flowGuide: {
        what:    "read_file / write_file / list_directory / search_files / move_file のどれかを選択",
        target:  "対象ファイル or フォルダの絶対パス (サーバー設定で許可されたフォルダ内のみ)",
        content: "書き込み内容・検索パターン・移動先パスなど",
        summary: "プロジェクト外フォルダ(Downloads, Desktop など)のファイル操作。組み込みの Read/Write ツールは現在の作業ディレクトリ中心なので、それ以外を触る時にこちらを使う",
      },
      capabilities: [
        { name: "read_file",      desc: "ファイル内容を読み取る",                friendly: "絶対パスで指定したファイル(.md, .txt, .json など)を読み取って中身を返します。Claude Codeの組み込み Read ツールと似ていますが、Filesystem MCP は事前に許可したフォルダ範囲内に限定されるので、Downloads や Desktop のような作業ディレクトリ外のファイルに安全に触れます。" },
        { name: "write_file",     desc: "ファイルに書き込む (上書き or 新規作成)", friendly: "指定パスにファイルを書き込みます。既存ファイルは丸ごと上書き、新規パスなら作成します。「整理結果を ~/Documents/report.md として保存」のような出力先指定に使います。" },
        { name: "list_directory", desc: "フォルダ内のファイル一覧を取得",         friendly: "指定フォルダの直下のファイル・サブフォルダ一覧を取得します。ファイル名・サイズ・更新日時を返すので、「Downloads にある一番大きい3つのファイル」のような集計の起点に。" },
        { name: "search_files",   desc: "ファイル名 or 内容で検索",              friendly: "指定フォルダ配下でファイル名パターンや内容のキーワード検索ができます。再帰的にサブフォルダも対象。「『議事録』と入ったMarkdownを探して」のような調査に。" },
        { name: "move_file",      desc: "ファイル移動・リネーム",                friendly: "ファイルを別の場所に移動 or リネームします。「Downloads にダウンロードしたPDFを Documents/Receipts に振り分ける」のような自動整理に。" },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-gh", title: "GitHub", subtitle: "PR・Issue・コード", desc: "GitHub の PR / Issue / コード操作",
    meta: { server: "github", auth: "oauth", action: "tool", tool_name: "create_issue", params: '{ "owner": "anthropic", "repo": "claude-code", "title": "バグ報告", "body": "..." }',
      io: { in: "server + tool_name + params", out: "ツール実行結果 (JSON)" },
      flowGuide: {
        what:    "create_issue / create_pull_request / add_comment / search_code / get_file_contents / list_repos のどれかを選択",
        target:  "owner (組織/ユーザー名) と repo (リポジトリ名)、必要なら issue/PR 番号",
        content: "title / body / コメント本文 / 検索クエリ など",
        summary: "GitHub の Issue/PR/コードに対する1回の操作。前ステップで生成したテキスト(エラー報告・レビューコメントなど)を GitHub に投稿する用途が中心",
      },
      capabilities: [
        { name: "create_issue",        desc: "Issue を作成",            friendly: "リポジトリに新しい Issue を作成します。タイトルと本文(Markdown)、ラベル、担当者、マイルストーンを指定できます。「テスト失敗ログから自動でバグ報告 Issue を作る」「定期的なメンテナンス Issue を毎月作る」のような自動化に。" },
        { name: "create_pull_request", desc: "PR を作成",                friendly: "ブランチ間の Pull Request を作成します。タイトル・本文(Markdown)・ベースブランチ・対象ブランチを指定。Claude が自動で実装したブランチをそのまま PR 化するワークフローに使います。" },
        { name: "add_comment",         desc: "Issue / PR にコメント追加", friendly: "既存の Issue または PR にコメントを追加します。コードレビューコメント (特定の行に紐づける) と、一般コメントの両方が可能。「PR 解析結果を要約してコメント投稿」のようなレビュー自動化に。" },
        { name: "search_code",         desc: "リポ内のコードを検索",      friendly: "GitHub の検索API経由でコード検索します。`language:python TODO` のような検索クエリで、リポ内/組織内/全公開リポを横断検索可能。「あの実装どこにあったっけ」を聞ける形に。" },
        { name: "get_file_contents",   desc: "ファイル内容を取得",        friendly: "リポジトリ内のファイル本文を取得します。Path とブランチ/コミットSHA を指定。「main ブランチの README を読み込んで要約」「特定コミット時点のコードと現状を比較」のような取得に。" },
        { name: "list_repos",          desc: "リポジトリ一覧を取得",      friendly: "組織やユーザーが所有するリポジトリの一覧を取得します。「会社の組織で最近更新されたリポ TOP10」「自分の作ったリポを全部リスト」のような俯瞰に。" },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-gd", title: "Google Drive", subtitle: "ドキュメント検索・更新", desc: "Google Drive のドキュメント操作",
    meta: { server: "gdrive", auth: "oauth", action: "tool", tool_name: "search_files", params: '{ "query": "議事録 2026", "page_size": 10 }',
      io: { in: "server + tool_name + params", out: "ツール実行結果 (JSON)" },
      flowGuide: {
        what:    "search_files / read_file_content / create_file / update_file のどれかを選択",
        target:  "ファイルID or 検索クエリ。フォルダID も指定可能",
        content: "新規/更新ファイルの本文・タイトル・MIMEタイプなど",
        summary: "Google Drive 上のドキュメントを検索・閲覧・作成・更新する。「議事録テンプレから新規ファイル」「先週の提案書を取得して内容把握」などの用途",
      },
      capabilities: [
        { name: "search_files",      desc: "Drive 内のファイルを検索",   friendly: "Google Drive 全体から、名前・内容・MIMEタイプ等の条件でファイルを検索します。「議事録 2026」「最終更新が今月の Spreadsheet」のような自然な絞り込みで候補リストを取得できます。" },
        { name: "read_file_content", desc: "ドキュメント本文を読み取り", friendly: "ファイルID を指定して中身を取得します。Google Docs はテキスト本文、Google Sheets は CSV 形式、Markdown/テキストはそのまま読めます。要約・分析の元データ取得に。" },
        { name: "create_file",       desc: "新規ファイル作成",            friendly: "Drive 上に新しいファイルを作成します。フォルダ指定・タイトル・本文・MIMEタイプを指定。「議事録テンプレから新規ファイル作成」「分析結果を Spreadsheet として保存」のような自動アウトプットに。" },
        { name: "update_file",       desc: "既存ファイルを更新",          friendly: "既存ファイルの内容を更新します。本文の上書き、追記、メタデータ(タイトル・共有設定)変更が可能。「議事録に決定事項を追記」のような継続更新に。" },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-sl", title: "Slack", subtitle: "メッセージ送受信", desc: "Slack のメッセージ送受信・検索",
    meta: { server: "slack", auth: "oauth", action: "tool", tool_name: "send_message", capability: "slack.send_message",
      io: { in: "server + tool_name + params", out: "ツール実行結果 (JSON)" },
      flowGuide: {
        what:    "send_message / search_messages / list_channels / get_thread / add_reaction のどれかを選択",
        target:  "操作対象 (channel名 '#general' / user ID / message timestamp など)",
        content: "渡すデータ (送信テキスト・検索クエリ・絵文字名など)",
        summary: "前のステップから受け取った情報を使って Slack に投稿・検索などを行い、結果(投稿ID・メッセージ一覧など)を次ステップへ渡す",
      },
      capabilities: [
        { name: "send_message",    desc: "チャンネル or DM へメッセージ送信", friendly: "指定したチャンネル(#general など)やDMに新しいメッセージを投稿します。本文に加えて、絵文字・スレッド返信先(thread_ts)・メンション(@user)・添付ファイルも指定可能。デプロイ完了通知、エラーアラート、日次レポート投稿などに使います。" },
        { name: "search_messages", desc: "過去メッセージを検索",                friendly: "ワークスペース全体からキーワードに合うメッセージを検索します。Slackの検索構文(from:@user / in:#channel / before:YYYY-MM-DD)が使えます。「先週の田中さんからの依頼」「#bug チャンネルのERROR言及」を集約したい時に。" },
        { name: "list_channels",   desc: "チャンネル一覧を取得",                friendly: "ワークスペースのチャンネル名・人数・トピックを一覧で取得します。投稿先がどこか分からない時に候補を探したり、新規メンバーへの案内、自動的な「適切なチャンネル選択」に使います。" },
        { name: "get_thread",      desc: "スレッドの返信一覧を取得",            friendly: "親メッセージのタイムスタンプを指定して、そのスレッドのぶら下がり返信を全部取得します。議論の流れを要約したり、未読返信を一気に拾いたい時に。" },
        { name: "add_reaction",    desc: "メッセージにリアクションを付ける",    friendly: "既存メッセージに絵文字リアクション(✅ 👀 🚀 など)を付けます。「対応中」「確認しました」のような状態を一目で示したり、自動ワークフローの進捗マーカーとして使えます。" },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-db", title: "Database (Postgres / SQLite)", subtitle: "SQL実行", desc: "データベースに対する SQL 実行",
    meta: { server: "postgres", auth: "api_key", action: "tool", tool_name: "query", params: '{ "sql": "SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL \'30 days\'" }',
      io: { in: "server + tool_name + params", out: "ツール実行結果 (JSON)" },
      flowGuide: {
        what:    "query (SQL実行) / schema (テーブル定義取得) / list_tables のどれかを選択",
        target:  "DB接続先 (.mcp.json の env で指定済み)。テーブル名はクエリ内に直接書く",
        content: "実行する SQL 文 (SELECT/INSERT/UPDATE/DELETE)。 自然文→SQL は Claude が変換",
        summary: "自然文の質問 (例: 「先月の新規ユーザー数は？」) を Claude が SQL に変換 → DB に問い合わせ → 結果を集計・要約",
      },
      capabilities: [
        { name: "query",       desc: "任意の SQL を実行して結果を取得", friendly: "SELECT / INSERT / UPDATE / DELETE どんな SQL でも実行できます。Claude は自然文の質問を SQL に変換してこの query を呼びます。本番DBで使う時は read-only ユーザーで接続するか、permissions で UPDATE/DELETE を deny しておくのが安全です。" },
        { name: "schema",      desc: "テーブルのスキーマ定義を取得",      friendly: "指定テーブルのカラム名・型・制約・インデックスを取得します。Claude が SQL を書く前に、まず schema を呼んで構造を把握 → 正しいクエリを組み立てる、というのが定番の流れです。" },
        { name: "list_tables", desc: "DB 内のテーブル一覧を取得",        friendly: "現在接続中の DB にあるテーブル名を一覧で取得します。「どんなデータが入ってるDB？」を最初に把握する起点として使います。" },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-gm", title: "Gmail", subtitle: "メール検索・送信", desc: "Gmail のメール検索・送信",
    meta: { server: "gmail", auth: "oauth", action: "tool", tool_name: "search_messages", params: '{ "query": "is:unread label:important", "max_results": 20 }',
      io: { in: "server + tool_name + params", out: "ツール実行結果 (JSON)" },
      flowGuide: {
        what:    "search_messages / read_message / send_message / create_draft / add_label のどれかを選択",
        target:  "対象メッセージID または Gmail 検索クエリ (is:unread, label:work など)",
        content: "送信メールの宛先/件名/本文、付与するラベル名、下書き内容など",
        summary: "メール業務の自動化。「未読のうち重要なものだけ要約」「定型返信の下書き作成」「特定タグへの自動仕分け」など。送信系は誤爆防止のため下書き経由が推奨",
      },
      capabilities: [
        { name: "search_messages", desc: "メール検索 (Gmail 検索クエリ構文)", friendly: "`is:unread`, `label:important`, `from:tanaka@`, `before:2026-05-01` のような Gmail 検索構文でメッセージを検索します。「未読の重要メールだけ」「特定の人からの最近10件」のような絞り込みが可能。検索結果はメッセージID + プレビューのリスト。" },
        { name: "read_message",    desc: "個別メール本文を取得",                friendly: "メッセージID を指定して、件名・本文・送信者・添付ファイル情報を取得します。検索 → 個別読み込みの2段階で動くのが基本。" },
        { name: "send_message",    desc: "メール送信",                          friendly: "宛先・件名・本文を指定してメールを送信します。確認なしで即送信されるので、permissions で deny にしておくか、create_draft 経由にするのが安全です。" },
        { name: "create_draft",    desc: "下書き作成",                          friendly: "送信せずに下書きフォルダに保存します。Claudeに「返信案を10通用意して、自分で確認してから送る」運用にする時にこちらを使うと安全です。" },
        { name: "add_label",       desc: "ラベル付与",                          friendly: "指定メッセージにラベル(`Work`, `Follow-up` など)を付与します。自動仕分け・後追い対応リストの作成に使います。" },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-gc", title: "Google Calendar", subtitle: "予定管理", desc: "Google Calendar の予定操作",
    meta: { server: "gcalendar", auth: "oauth", action: "tool", tool_name: "suggest_time", params: '{ "attendees": ["you@example.com","colleague@example.com"], "duration": 30, "within_days": 7 }',
      io: { in: "server + tool_name + params", out: "ツール実行結果 (JSON)" },
      flowGuide: {
        what:    "list_events / create_event / update_event / delete_event / suggest_time のどれかを選択",
        target:  "カレンダーID (デフォルトはプライマリ) + イベントID または期間",
        content: "予定タイトル/開始時刻/終了時刻/参加者リスト/場所 など",
        summary: "予定の確認・調整・調整。「来週空いてる時間に田中さんと打ち合わせ」「今日の予定を要約」のような調整・要約作業",
      },
      capabilities: [
        { name: "list_events",  desc: "予定一覧を取得",                  friendly: "指定期間 (例: 今週 / 今日 / 来週月曜) の予定を一覧で取得します。タイトル・時刻・場所・参加者が返るので、「今日のスケジュール要約」「重要な予定だけリスト」のような起点に。" },
        { name: "create_event", desc: "新規予定を作成",                  friendly: "新しい予定を作成します。タイトル・開始/終了時刻・参加者・場所・繰り返し設定を指定可能。確認なしで即作成されるので、send_message 同様、permissions で制御するのが安全です。" },
        { name: "update_event", desc: "既存予定を更新",                  friendly: "予定の時刻・タイトル・参加者を変更します。「金曜 14時の打ち合わせを 15時にずらす」のようなリスケに。" },
        { name: "delete_event", desc: "予定を削除",                      friendly: "予定をキャンセル削除します。参加者にも通知が飛ぶので、permissions で deny にしておくのが基本です。" },
        { name: "suggest_time", desc: "参加者全員の空き時間を提案",        friendly: "複数人の予定を見比べて、全員が空いている時間帯を提案してくれます。「30分の打ち合わせを来週中に3人で」のような調整に最も便利。read-only なので安全。" },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-nt", title: "Notion", subtitle: "ページ・DB操作", desc: "Notion のページ・データベース操作",
    meta: { server: "notion", auth: "oauth", action: "resource", resource_uri: "notion://page/abc123def456",
      io: { in: "server + resource_uri", out: "リソース内容 (テキスト/JSON/バイナリ)" },
      flowGuide: {
        what:    "search / create_page / update_page / query_database / create_database_entry (tool) または resource として notion://page/{id} を参照",
        target:  "ページID / データベースID / 検索クエリ。Notion の URL からIDを抜く",
        content: "ページタイトル/本文(Markdown→Notionブロックに変換)/プロパティ値/フィルタ条件",
        summary: "Notion 上のドキュメント・データベース操作。「議事録テンプレで新規ページ」「特定のDBに今週の進捗を追記」「ページ参照→要約」など",
      },
      capabilities: [
        { name: "search",                desc: "ワークスペース全体を検索 (tool)",      friendly: "ワークスペース内のページ・データベース・コメントを横断検索します。「先月のミーティング議事録を全部」「『QBR』というキーワードのページ」のような検索に。" },
        { name: "create_page",           desc: "新規ページ作成 (tool)",                 friendly: "新しいページを作成します。親ページ or 親DBを指定 + タイトル + 本文(Markdown相当) + プロパティ値。「議事録テンプレで新規ページ」のような自動作成に。" },
        { name: "update_page",           desc: "既存ページを更新 (tool)",               friendly: "ページのプロパティ(ステータス・担当者・期限など)や本文を更新します。「タスクのステータスを Done に」「議事録に決定事項を追記」のような継続更新に。" },
        { name: "query_database",        desc: "データベースに対する絞り込み・並び替え (tool)", friendly: "Notion DB に対する SQL 的な絞り込み・ソート・ページング。「期限が今週中で担当が自分のタスク」「進行中の案件を優先度順」のような取得に。" },
        { name: "create_database_entry", desc: "DB に新規エントリ追加 (tool)",          friendly: "Notion DB (タスク管理・読書ログなど) に新規行を追加します。プロパティ値 (タイトル・タグ・日付など) を指定。" },
        { name: "notion://page/{id}",    desc: "ページ内容を読み取り参照 (resource)",   friendly: "ページIDを URI で指定して、本文を読み取り専用で取得します。tool の create_page/update_page と違って副作用なしの参照系。要約・分析の元データに使えます。" },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-ln", title: "Linear / Jira / Asana", subtitle: "チケット管理", desc: "プロジェクト管理ツールのチケット操作",
    meta: { server: "linear", auth: "api_key", action: "tool", tool_name: "update_issue", params: '{ "id": "ENG-123", "state": "Done", "comment": "PR #45 でリリース" }',
      io: { in: "server + tool_name + params", out: "ツール実行結果 (JSON)" },
      flowGuide: {
        what:    "create_issue / update_issue / list_issues / add_comment / assign のどれかを選択",
        target:  "チケットID (例: ENG-123) または プロジェクトID + フィルタ条件",
        content: "タイトル/本文/状態(Todo/In Progress/Done など)/担当者/優先度",
        summary: "GitHub PR/コミットと連動した自動チケット更新、定例レポート、自動アサインなど。「PRマージ時にチケットをDoneに」「未完了チケットを毎朝Slackで通知」のような自動運用に",
      },
      capabilities: [
        { name: "create_issue", desc: "チケットを作成",                  friendly: "新しいチケットを作成します。タイトル・本文(Markdown)・状態・担当者・優先度・ラベルを指定。「テスト失敗時に自動でバグチケット起票」「定期レビュー時に Todo を一括作成」のような自動化に。" },
        { name: "update_issue", desc: "状態・担当・優先度を変更",        friendly: "既存チケットのプロパティを変更します。「PR マージで自動的に Done」「ブロッカー発見時に優先度UP」のような連動運用に。" },
        { name: "list_issues",  desc: "チケット一覧を取得 (フィルタ付き)", friendly: "プロジェクト内のチケットを条件で絞って取得します。「未完了かつ自分担当のチケット」「期限切れの全チケット」のような俯瞰に。" },
        { name: "add_comment",  desc: "チケットにコメント追加",            friendly: "既存チケットに進捗コメントを追加します。「コードレビュー結果を自動コメント」「日次ステータスを自動投稿」のような記録自動化に。" },
        { name: "assign",       desc: "担当者を割り当てる",                friendly: "チケットの担当者を変更します。「ラベルに応じて自動アサイン」「過負荷の人から他のメンバーへ振り直し」のような調整に。" },
      ] } },

  // D. MCP (Dev) — 開発者向けサブ要素。MCP仕様の詳細を理解する人向け。Tier 3 + ⚙印。
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-call", title: "⚙ MCP Tool 呼び出し", subtitle: "MCP仕様: tool 呼び出し", desc: "MCP プロトコルの3要素のうち tools を呼び出すアクション。サーバーカードの action=tool に相当",
    meta: { action: "tool" } },
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-res", title: "⚙ MCP Resource 取得", subtitle: "MCP仕様: resource 取得", desc: "MCP プロトコルの3要素のうち resources を参照するアクション。読み取り専用、副作用なし",
    meta: { action: "resource" } },
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-prm", title: "⚙ MCP Prompt テンプレート", subtitle: "MCP仕様: prompt 使用", desc: "MCP プロトコルの3要素のうち prompts を使用するアクション。事前定義のプロンプトテンプレートを呼ぶ",
    meta: { action: "prompt" } },
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-oauth", title: "⚙ MCP OAuth 認証", subtitle: "動的認証フロー", desc: "MCP サーバーへの OAuth 認証フロー (Dynamic Client Registration)。ユーザーがブラウザでログインしてトークン取得",
    meta: { auth: "oauth" } },

  // E. Skills
  // E. Skills — 実体カードのみ。frontmatter（name/description/allowed-tools/scripts等）は
  //   詳細パネル内の「設定フィールド」に集約。meta はサンプル値。
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-file", title: "スキル (汎用)", subtitle: ".claude/skills/<name>/SKILL.md", desc: "自作スキル。実フローでは name / description / allowed-tools / 参考ファイル / scripts が各スキルごとに変わる（ここの値は見本）",
    meta: {
      // ── 呼び出しリクエスト (このノードがフロー上で何を依頼するか) ──
      request_prompt: "今日の新機能リリースについて、過去投稿のトーンに合わせて 3案つくって投稿準備して",
      target_files: ["~/.post-history.json"],
      output_schema: "ドラフト3案 + 各案のバリエーション理由 (Markdown)",
      arguments_value: "新機能リリース",
      expected_io: "「新機能リリース」というトピックを受けて → 過去投稿のスタイルに沿った3つのドラフト + ユーザー確認 → X API で投稿",
      // ── スキル定義 (本体の能力) ──
      file: ".claude/skills/example-flow/SKILL.md",
      name: "example-flow",
      description: "「Xに投稿して」「ツイートにして」で起動。投稿文を生成・確認して投稿する。",
      "allowed-tools": ["Read","WebFetch","Bash(curl *)"],
      model: "sonnet",
      effort: "medium",
      reference_files: ["style-guide.md","templates/post.md"],
      scripts: ["scripts/post.py","scripts/analyze-history.py"],
      "argument-hint": "[トピック]",
      "disable-model-invocation": "false",
      "user-invocable": "true",
      context: "normal",
      io: { in: "ユーザーの指示文（descriptionと一致するキーワード）+ コンテキスト", out: "投稿済みの結果 + 投稿文の控え" },
      // 内部フロー — このスキルが SKILL.md 内で実際に何をするか
      subflow: [
        { title: "過去投稿を読み込む",       tool: "Bash",     detail: "scripts/analyze-history.py で ~/.post-history.json を解析し、直近のトーン・話題傾向を抽出" },
        { title: "スタイルガイド参照",        tool: "Read",     detail: "reference_files の style-guide.md / templates/post.md を読み、文体ルールを把握" },
        { title: "投稿文ドラフトを3案生成",   tool: "(model)",  detail: "$ARGUMENTS のトピックとスタイル制約を反映して、変化を持たせた3つのドラフトを作成" },
        { title: "ユーザーに3案を提示",       tool: "user",     detail: "どの案にするか・微修正したい点があるかを対話で確認" },
        { title: "X API で投稿",              tool: "Bash",     detail: "scripts/post.py を実行 (内部で curl で X API 叩く)。allowed-tools の Bash(curl *) で事前許可済み" },
        { title: "履歴に追記",                tool: "Bash",     detail: "投稿成功後、~/.post-history.json に新規エントリを append" },
      ]
    }
  },
  // 公式スキル (anthropic-skills プラグイン配布) — フロー上で「ここで成果物を生成/読み取る」と明示的に置くもの
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-pub-docx", title: "docx", subtitle: "Word文書の生成・編集・読取",
    desc: "Word文書(.docx)の作成・読み取り・編集。フォーマット付き正式文書/テンプレ/レターヘッド対応。議事録・契約書・レポートを Word で出すフローで使う。",
    meta: {
      // ── 呼び出しリクエスト ──
      request_prompt: "添付の議事録テキスト (meeting-notes.md) を、当社レターヘッド付きの Word 議事録テンプレ (templates/minutes-template.docx) に流し込んで、output/2026-05-21-minutes.docx として保存して",
      target_files: ["meeting-notes.md","templates/minutes-template.docx"],
      output_schema: "output/2026-05-21-minutes.docx (Word文書、当社レターヘッド + 議事録フォーマット)",
      arguments_value: "",
      expected_io: "meeting-notes.md (テキスト) + テンプレ → レターヘッド付きの完成版 .docx",
      // ── スキル定義 ──
      builtin: true,
      name: "docx",
      description: "Word文書(.docx)の作成・読み取り・編集・操作。フォーマット付きの正式文書、テンプレ、レターヘッド等にも対応。",
      "allowed-tools": ["Read","Write","Bash"],
      reference_files: ["reference.md","examples/letterhead.docx"],
      scripts: ["scripts/create_docx.py","scripts/extract_text.py","scripts/replace_text.py"],
      "disable-model-invocation": "false",
      "user-invocable": "true",
      io: { in: ".docx ファイルへの参照 or 作成指示 + 内容データ", out: "生成 / 編集された .docx ファイル" }
    }
  },
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-pub-pptx", title: "pptx", subtitle: "PowerPointの生成・編集",
    desc: "PowerPoint(.pptx)の生成・編集。テンプレ適用・チャート挿入・スライドマスター制御に対応。営業資料・週次レポート・ピッチデッキを自動生成するフローで使う。",
    meta: {
      // ── 呼び出しリクエスト ──
      request_prompt: "data/weekly-kpi.json を読み込んで、当社テンプレ (templates/business.pptx) を適用した週次レポートを 10スライド以内で作って。表紙 / サマリ / 主要KPI 3枚 / 課題 / 次週の打ち手 / Q&A の構成で。",
      target_files: ["data/weekly-kpi.json","templates/business.pptx"],
      output_schema: "output/2026-W21-weekly-report.pptx (10スライド構成、business テンプレ適用)",
      arguments_value: "",
      expected_io: "JSON データ + テンプレ → 営業向け週次レポート .pptx (10スライド)",
      // ── スキル定義 ──
      builtin: true,
      name: "pptx",
      description: "PowerPoint(.pptx)スライドデッキの作成・編集。テンプレ適用、チャート/表/画像挿入、スライドマスター制御に対応。",
      "allowed-tools": ["Read","Write","Bash"],
      reference_files: ["reference.md","templates/business.pptx"],
      scripts: ["scripts/create_pptx.py","scripts/add_slide.py","scripts/apply_template.py"],
      "disable-model-invocation": "false",
      "user-invocable": "true",
      io: { in: ".pptx ファイル参照 or スライド構成データ", out: "生成 / 編集された .pptx ファイル" }
    }
  },
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-pub-xlsx", title: "xlsx", subtitle: "Excel/CSV/TSVの読み書き",
    desc: "Excel/CSV/TSV の読み書き・データクリーニング・数式適用・チャート挿入。集計結果を Excel で出すフロー、雑多な CSV を整形して取り込むフローで使う。",
    meta: {
      // ── 呼び出しリクエスト ──
      request_prompt: "data/sales-raw-2026-05.csv を読み込んで、(1) 空行と重複を削除、(2) 日付列を YYYY-MM-DD に正規化、(3) 商品カテゴリ別の月次売上を SUMIFS で集計、(4) その結果を棒グラフ付きで output/sales-2026-05-summary.xlsx に出力して",
      target_files: ["data/sales-raw-2026-05.csv"],
      output_schema: "output/sales-2026-05-summary.xlsx (2シート: raw_cleaned / summary_with_chart)",
      arguments_value: "",
      expected_io: "汚いCSV → クリーニング済み + 集計済み + チャート付き .xlsx",
      // ── スキル定義 ──
      builtin: true,
      name: "xlsx",
      description: "Excel(.xlsx/.xlsm) / CSV / TSV の読み書き・編集。データクリーニング、数式適用、フォーマット、チャート挿入に対応。",
      "allowed-tools": ["Read","Write","Bash"],
      reference_files: ["reference.md"],
      scripts: ["scripts/clean_csv.py","scripts/apply_formulas.py","scripts/add_chart.py"],
      "disable-model-invocation": "false",
      "user-invocable": "true",
      io: { in: ".xlsx/.csv ファイル参照 + 操作指示", out: "整形済み / 集計済み / 生成された表形式ファイル" }
    }
  },
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-pub-pdf", title: "pdf", subtitle: "PDF読取・生成・操作",
    desc: "PDF の読み取り・結合・分割・OCR・フォーム入力。契約書から条文抽出、複数 PDF 結合、スキャン PDF をテキスト化するフローで使う。",
    meta: {
      // ── 呼び出しリクエスト ──
      request_prompt: "invoices/2026-Q2-001.pdf を読み取って、合計金額・通貨・支払期限・取引先名を抽出し、下記JSONスキーマで返してください。\n\n{\n  \"amount\":   number,\n  \"currency\": \"JPY\"|\"USD\"|\"EUR\",\n  \"due_date\": \"YYYY-MM-DD\",\n  \"vendor\":   string\n}",
      target_files: ["invoices/2026-Q2-001.pdf"],
      output_schema: "{\n  \"amount\":   number,\n  \"currency\": \"JPY\"|\"USD\"|\"EUR\",\n  \"due_date\": \"YYYY-MM-DD\",\n  \"vendor\":   string\n}",
      arguments_value: "",
      expected_io: "請求書 PDF → { amount: 380000, currency: \"JPY\", due_date: \"2026-06-30\", vendor: \"○○商事\" }",
      // ── スキル定義 ──
      builtin: true,
      name: "pdf",
      description: "PDF ファイルの操作全般。読み取り（テキスト/表抽出）、結合・分割、回転、ウォーターマーク、フォーム入力、OCR に対応。",
      "allowed-tools": ["Read","Write","Bash"],
      reference_files: ["reference.md"],
      scripts: ["scripts/extract_text.py","scripts/merge_pdfs.py","scripts/ocr.py","scripts/fill_form.py"],
      "disable-model-invocation": "false",
      "user-invocable": "true",
      io: { in: ".pdf ファイル参照 + 操作指示", out: "抽出テキスト / 生成 / 編集された .pdf ファイル" }
    }
  },

  // F. Commands
  // F. Commands — カスタムスラッシュコマンド (汎用) 1枚に集約。
  //   $ARGUMENTS / frontmatter (description, model, tools) などは詳細パネルの fields に統合済み。
  //   組み込みコマンド (/init, /clear 等) はカード化しない (フロー/自動化では使われないため)。
  //   meta は代表サンプル値。実フローではノードごとに変わる。
  //   subflow は将来キャンバス側で「+」展開する想定 (詳細パネルには出さない)。
  { cat: "F. Commands", tier: 1, type: "command", id: "cm-file", title: "カスタムコマンド (汎用)", subtitle: ".claude/commands/*.md", desc: "/コマンド名 で呼び出せる自作の定型処理。フロー内では SlashCommand ツール経由で実行される",
    meta: {
      file: ".claude/commands/*.md",
      name: "deploy",
      description: "デプロイ前チェック&実行",
      model: "sonnet",
      allowed_tools: ["Bash","Read","WebFetch"],
      argument_hint: "<env: prod | staging | dev>",
      prompt: "$ARGUMENTS の環境にデプロイします。\n\n1. git status で未コミット変更を確認\n2. なければ npm test を実行\n3. テストが通ったら ./scripts/deploy.sh $ARGUMENTS を実行\n4. 結果を Slack の #deploy チャンネルに通知",
      input:  "$ARGUMENTS (例: 'prod')\n+ 環境変数・前ステップから渡されたコンテキスト",
      output: "デプロイ結果 (成功/失敗) + ログURL + 所要時間",
      io: { in: "$ARGUMENTS (例: 'prod')", out: "デプロイ結果 (成功/失敗 + ログURL)" },
      flowGuide: {
        what:    "コマンド名 (/の後に続く識別子)",
        target:  "$ARGUMENTS で受け取る引数の形式 (argument_hint で指定)",
        content: "コマンド実行時に走るプロンプト本文。Markdownで複数ステップを記述",
      },
      // 当面の代替表現: 内部処理を subflow として記録 (将来キャンバス側で展開)
      subflow: [
        { title: "git status 確認",  tool: "Bash",         detail: "未コミット変更を検出" },
        { title: "テスト実行",       tool: "Bash",         detail: "npm test を走らせる" },
        { title: "デプロイ実行",     tool: "Bash",         detail: "./scripts/deploy.sh $ARGUMENTS" },
        { title: "Slack 通知",       tool: "mcp",          detail: "結果を #deploy に投稿 (Slack MCP 経由)" },
      ],
    } },

  // G. Plugin — 削除。プラグインは「配布パッケージ」であって、フロー実行ノードではない。
  // インストール後の中身 (commands/agents/skills/hooks/MCP) は既存の各カテゴリのカードで表現する。

  // H. Settings — 削除。
  //   settings.json / CLAUDE.md / AGENTS.md / .claudeignore はフローノードではなく
  //   セッション開始時に自動読込されるフロー実行の土台。明示呼び出しが無いためフロー描画には不要。
  //   設定変更タイミングをフローに表したい場合は Hook (ConfigChange / InstructionsLoaded) で表現する。

  // I. API — 外部API呼び出し。LLM API (Claude/OpenAI/Gemini) + 各種 SaaS REST API。
  //   サービス別の動的フィールドは TYPE_SPECS.api.fieldsByService で切替。
  //   シークレット (api_key/webhook_url) は f.secret: true で UI 上はマスク表示 (本実装時は .env 連携)。

  // Tier 1: LLM API (Claude を含むよく使われるLLM)
  { cat: "I. LLM API", tier: 1, type: "api", id: "a-claude", title: "Claude API", subtitle: "Anthropic Messages API", desc: "Anthropic 公式の Messages API。tool_use ループや prompt caching、server tools (web_search 等) が使える",
    meta: { service: "claude", api_key: "", model: "claude-sonnet-4-5", system: "あなたは...", messages: '[\n  { "role": "user", "content": "..." }\n]', tools: "", server_tools: [], temperature: 0.7, max_tokens: 4096, cache: "なし",
      io: { in: "model + system + messages + tools (+ cache)", out: "assistant メッセージ or tool_use ブロック" } } },
  { cat: "I. LLM API", tier: 1, type: "api", id: "a-openai", title: "OpenAI API", subtitle: "GPT-4 / o1 系", desc: "OpenAI の Chat Completions API。Function Calling、JSON モード、o1 推論モデルなどに対応",
    meta: { service: "openai", api_key: "", model: "gpt-4o", system: "You are...", messages: '[\n  { "role": "user", "content": "..." }\n]', tools: "", temperature: 0.7, max_tokens: 4096,
      io: { in: "model + messages + tools", out: "choices[0].message or tool_calls" } } },
  { cat: "I. LLM API", tier: 1, type: "api", id: "a-gemini", title: "Gemini API", subtitle: "Google AI Studio", desc: "Google の Gemini モデルを生成 API 経由で呼ぶ。長コンテキスト・マルチモーダル対応",
    meta: { service: "gemini", api_key: "", model: "gemini-2.0-flash", system: "...", contents: '[\n  { "role": "user", "parts": [{ "text": "..." }] }\n]', tools: "", temperature: 0.7,
      io: { in: "model + contents + tools", out: "candidates[0].content or functionCall" } } },

  // Tier 2: 外部 SaaS API (MCP がカバーしていないもの)
  { cat: "I. 外部 API", tier: 2, type: "api", id: "a-line", title: "LINE Messaging API", subtitle: "LINE 公式アカウント", desc: "LINE 公式アカウントからユーザーへのメッセージ送信。push / multicast / broadcast / reply",
    meta: { service: "line", channel_access_token: "", endpoint: "push (個別送信)", to: "USER_ID", messages: '[\n  { "type": "text", "text": "通知本文" }\n]',
      io: { in: "endpoint + to + messages", out: "送信結果 (sentMessages[] etc)" } } },
  { cat: "I. 外部 API", tier: 2, type: "api", id: "a-stripe", title: "Stripe API", subtitle: "決済・サブスクリプション", desc: "決済処理・顧客管理・サブスク管理。テストキー/本番キーで切替",
    meta: { service: "stripe", secret_key: "", endpoint: "charges (決済)", params: '{\n  "amount": 2000,\n  "currency": "jpy",\n  "source": "tok_visa"\n}',
      io: { in: "endpoint + params", out: "Stripe オブジェクト (charge/subscription/...)" } } },
  { cat: "I. 外部 API", tier: 2, type: "api", id: "a-discord", title: "Discord Webhook", subtitle: "チャンネル投稿", desc: "Discord チャンネルへの Webhook 投稿。テキスト / embeds / メンション対応",
    meta: { service: "discord", webhook_url: "", username: "DeployBot", content: "デプロイ完了 ✅", embeds: '[{\n  "title": "v1.2.3 released",\n  "color": 5814783\n}]',
      io: { in: "webhook_url + content/embeds", out: "204 No Content (送信完了)" } } },

  // Tier 1: 汎用 REST API (上記でカバーされないサービス用)
  { cat: "I. 汎用 API", tier: 1, type: "api", id: "a-rest", title: "REST API (汎用)", subtitle: "任意の HTTPS リクエスト", desc: "任意の REST/HTTP API を直接叩く汎用カード。MCP がカバーしていないサービスや、独自APIに使う",
    meta: { service: "rest", method: "POST", url: "https://api.example.com/v1/resource", auth_type: "Bearer Token", auth_value: "", headers: "Content-Type: application/json", body: '{\n  "key": "value"\n}', response_path: ".data.id",
      io: { in: "method + url + headers + body", out: "HTTP レスポンス (JSON/text/binary)" } } },

  // J. Agent SDK — カテゴリ完全削除。
  //   理由: SDK インストール = 1回限りの環境セットアップであって、
  //         オートメーションフローの中で何度も呼び出されるノードにはならない。
  //   Plugin と同じロジック (配布/環境構築 vs フロー実体)。
  //   Managed Agents (Anthropic ホステッド REST) は将来 I. Server Tools に統合する案あり。
  //   ref-agentsdk (デザイン見本) は ★ノードタイプ一覧 に残してある (タイプ自体の存在は維持)。

  // L. 組み合わせフロー
  // L. 組み合わせフロー — ELEMENTS から削除済み。
  //   フロー例は FLOWS 配列 (whiteboard.html 内、ワークフローモードで表示) に集約。
  //   ELEMENTS は「ノード部品」、FLOWS は「ノードの組み合わせ例」。役割を分離。
  //   FLOWS は将来的に flow-templates.js への切り出しを検討 (IMPLEMENTATION_NOTES.md 参照)。

  // M. メタ可視化 — カテゴリ完全削除。
  //   理由: タイムライン / アクティブパスハイライト / データフロー可視化 は
  //   フロー図に並べる「ノード」ではなく、Flow Inspector アプリ自身の表示モード / ビュー機能。
  //   本実装時の UI 機能として IMPLEMENTATION_NOTES.md に転記済み。

  // N. 仮置き要素 — カテゴリ削除済み。
  //   new-schedule → K. Trigger の tr-cron に格上げ (Anthropic Routines / CronCreate で公式対応)
  //   new-parallel → 削除 (並列実行はフロー線「1ノードから複数本」で表現可能、専用ノード不要)

  // K. Trigger — フローの起点 (フローを起こすきっかけ)。フロー図の最初に置くノード。
  //   設定値は TYPE_SPECS.trigger.fieldsBySource で動的切替。
  //   secret (Webhook URL / Auth Token 等) は f.secret: true で UI 上はマスク表示 (本実装時 .env 連携)。
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-manual", title: "手動起動", subtitle: "/command / プロンプト / UI", desc: "ユーザーが明示的にフローを起動する",
    meta: { source: "manual", trigger_type: "/slash-command", command: "/draft-nda", prompt_hint: "「田中さんとの NDA を作って」のような自然文でも起動",
      io: { in: "ユーザーのプロンプト or /コマンド + 引数", out: "後続フロー + ユーザー入力データ" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-cron", title: "スケジュール起動", subtitle: "cron / Routines", desc: "定期的・指定時刻でフローを自動起動",
    meta: { source: "cron", schedule: "毎日朝9時", cron_expr: "0 9 * * *", timezone: "Asia/Tokyo", implementation: "Anthropic Routines (claude.ai)",
      io: { in: "(時刻到達)", out: "後続フロー + 起動時刻" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-webhook", title: "Webhook 受信", subtitle: "外部 HTTP POST", desc: "GitHub / Stripe / 自前 API からの HTTP リクエストで起動",
    meta: { source: "webhook", webhook_url: "", method: "POST", auth: "署名検証 (HMAC)", auth_secret: "", payload_path: ".user.id",
      io: { in: "HTTP リクエスト (headers + body)", out: "後続フロー + payload" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-email", title: "メール受信", subtitle: "Gmail / IMAP", desc: "特定条件のメールを受信したら起動",
    meta: { source: "email", email_account: "support@example.com", auth_token: "", filter: "is:unread label:invoices from:billing@", polling_interval: "5分",
      io: { in: "受信メール (from / subject / body / 添付)", out: "後続フロー + メール内容" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-chat", title: "チャット入力", subtitle: "LINE / Slack / Discord bot", desc: "チャットボット経由のメッセージで起動",
    meta: { source: "chat", chat_platform: "LINE", auth_token: "", filter: "全メッセージ (特定キーワード指定可)",
      io: { in: "チャットメッセージ + 送信者情報", out: "後続フロー + メッセージ内容" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-app-event", title: "アプリイベント", subtitle: "Notion / Linear / GitHub 等", desc: "SaaS 内のイベント発生で起動 (Form 送信 / DB 行追加 / 予定作成等もここに集約)",
    meta: { source: "app-event", app: "Notion", event_type: "page.created", auth_token: "", filter: "database_id == 'xxx' && status == 'New'", implementation: "MCP polling",
      io: { in: "アプリのイベントデータ (JSON)", out: "後続フロー + イベントデータ" } } },
];

