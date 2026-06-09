/**
 * Flow Inspector — Elements Catalog
 *
 * マスター定義: 8093 (whiteboard) で確定 → 8092 (Inspector / Builder) と共有
 * ELEMENTS データ (Tier 1-3, 130+ カード) を含む
 *
 * 依存: shared/flow-elements.js (window.FI を先に初期化)
 */

const FI_ELEMENTS = [
  // ── Design Reference: 全ノードタイプ見本 ──
  { cat: "★ ノードタイプ一覧", tier: 1, type: "parent",   id: "ref-parent",   title: "スキル受信",           subtitle: "親エージェント",             desc: "フロー全体を制御する親エージェントノード。角丸矩形＋青アクセントバー", meta: { shape: "rect (rx:10)", accent: "左サイドバー", color: "#2563eb" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "hook",     id: "ref-hook",     title: "pre: 入力バリデーション", subtitle: "PreToolUse フック",           desc: "イベントに応じて発火するフックノード。平行四辺形＋オレンジアクセントバー", meta: { shape: "para (skew:14)", accent: "斜めバー", color: "#c2410c" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "subagent", id: "ref-subagent", title: "Explore: 過去投稿分析",  subtitle: "サブエージェント（読み取り専用）", desc: "並列実行可能なサブエージェント。六角形＋紫ダイヤモンドアクセント", meta: { shape: "hex (inset:16)", accent: "ダイヤモンド", color: "#7c3aed" } },
  { cat: "★ ノードタイプ一覧", tier: 1, type: "think",    id: "ref-think",    title: "ドラフト執筆",          subtitle: "Claude呼び出し",              desc: "メインClaude自身に推論を投げる LLM 呼び出しステップ。サブエージェントは起動せず現在の会話の延長で考える。角丸が大きめの矩形＋紫アクセントバー (サブエージェントと同色、形状で区別)", meta: { shape: "rect (rx:14)", accent: "左サイドバー", color: "#7c3aed" } },
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
      target_files: ["~/.x-history.json"],
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
        { title: "過去投稿を読み込む",       tool: "Bash",     detail: "scripts/analyze-history.py で ~/.x-history.json を解析し、直近のトーン・話題傾向を抽出" },
        { title: "スタイルガイド参照",        tool: "Read",     detail: "reference_files の style-guide.md / templates/post.md を読み、文体ルールを把握" },
        { title: "投稿文ドラフトを3案生成",   tool: "(model)",  detail: "$ARGUMENTS のトピックとスタイル制約を反映して、変化を持たせた3つのドラフトを作成" },
        { title: "ユーザーに3案を提示",       tool: "user",     detail: "どの案にするか・微修正したい点があるかを対話で確認" },
        { title: "X API で投稿",              tool: "Bash",     detail: "scripts/post.py を実行 (内部で curl で X API 叩く)。allowed-tools の Bash(curl *) で事前許可済み" },
        { title: "履歴に追記",                tool: "Bash",     detail: "投稿成功後、~/.x-history.json に新規エントリを append" },
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

window.FI = window.FI || {};
window.FI.ELEMENTS = FI_ELEMENTS;
