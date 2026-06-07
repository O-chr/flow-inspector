# Flow Inspector

Claude Code プラグイン。インストールした PC の Claude Code 設定（**skills / subagents / hooks / MCP / commands / CLAUDE.md**）を自動スキャンし、フロー図ダッシュボードで可視化・ノーコード編集・eval する。加えて、プロジェクトの **CLAUDE.md を対話で作成/編集**する機能を持つ。

公開方針：**仕組み（ダッシュボード・フロー図・設定スキャン・CLAUDE.md オーサリング）だけ**を公開。特定プロジェクトの中身やデモデータは含めない。ライセンス MIT。

## 開発・起動

- 依存：`pip install -r server/requirements.txt`（**fastapi / uvicorn / pyyaml の3つだけ**。`anthropic` 等は使っていない＝import しない）。開発用は `requirements-dev.txt`（pytest 等）。
- 起動：リポ直下で `uvicorn server.main:app --host 127.0.0.1 --port 8077` → `http://127.0.0.1:8077/` で `static/index.html` が配信される。
- 環境変数：`FLOW_INSPECTOR_PORT`（既定 8077・localhost のみ）、`FLOW_INSPECTOR_PROJECTS_ROOT`（プロジェクト走査ルート・既定 `~/projects`）。
- テスト：`python -m pytest tests/ -q`（HOME 隔離 conftest・合成データのみ）。
- フロント：`static/` にビルド済み React（Vite）バンドルを同梱（`static/assets/index-*.js` / `index-*.css`、`static/index.html` はそれを読む薄いローダ）。UI ソースは別管理でビルドし、生成された `static/assets/` をこのリポにコミットする。CDN 依存なし（Web フォントのみ）。

## プラグインとしての構造（plugin 化）

- `.claude-plugin/plugin.json` — マニフェスト（name=`flow-inspector`／**repository は文字列 URL**。オブジェクトにすると `claude plugin validate` が落ちる）。
- `.claude-plugin/marketplace.json` — マーケットプレイス定義（name=`flow-inspector-marketplace`／source `"./"`）。**登録にはこのファイルが必須**。
- `skills/flow-inspector/SKILL.md` — 起動スキル。**自動 venv**（`~/.cache/flow-inspector/venv` を無ければ作り依存を入れて、そこで uvicorn 起動）／二重起動チェック／フロー化の 3 択同意／`disable-model-invocation: true`。
- インストール：`claude plugin marketplace add <dir>` → `claude plugin install flow-inspector@flow-inspector-marketplace`（`~/.claude/plugins/cache/...` に展開）。
- **ユーザーデータはパッケージ内に書かない**：作業用コピー・flows・eval 等は `~/.cache/flow-inspector/` に置く（起動 0 トークン／AI を呼ぶのはフロー化とチャットだけ＝同意制）。

## ファイル地図

### バックエンド `server/`（FastAPI 単一アプリ・DB なし・JSON で永続化）
- `main.py` — 全 API。ダッシュボード（`/api/dashboard*`・`/api/projects`）、ワークスペース（`/api/workspace/*`：本番設定の staging への pull／file 読み書き／**同期(push)**）、チャット（`/api/chat`：`claude` CLI を subprocess 起動して SSE）、eval、CLAUDE.md オーサリング（`build_claude_md_request`／`CLAUDE_MD_SYSTEM`／レイヤー別ガイダンス）。
- `parser.py` — `.claude/` を走査し skills/commands/hooks/agents/CLAUDE.md を「フロー dict」に変換。`collect_dashboard_data`／`collect_claude_stack`（CLAUDE.md 階層解決）。
- `project_context.py` — CLAUDE.md チャット用の**読み取り専用プロジェクト要約**。`gather_project_context(deep)`（上位ツリー＋主要ファイル抜粋、deep でトップレベルソース全文）、`gather_deploy_context`（systemd ユニット／nginx をプロジェクト関連箇所だけ読む）。symlink/ノイズ除外・`projects_root` 配下に限定・サイズ上限・sudo なし。
- `workspace.py` — 作業用コピー(staging)管理。`_validate_live_path`（書込許可リスト：`$HOME/.claude` 配下、`projects_root` 配下の `CLAUDE.md`/`CLAUDE.local.md` のみ）、staging↔live 変換、`push`（同期＝本番反映）。
- 補助：`deploy_validate.py`／`flow_codec.py`／`fi_frontmatter.py`（frontmatter は yaml-first＋行フォールバック）／`parser_convention.py`／`drafts.py`／`eval_sandbox.py`（eval のコード評価を制限組み込みで実行）／`annotator.py`・`auto_config.py`（フロー化＝AI 注釈）他。

### フロント `static/`
- `assets/index-*.js` / `index-*.css` — ビルド済み React（Vite）バンドル。ダッシュボード、フロー図エディタ、設定スタック表示、**CLAUDE.md オーサリングチャット `ClaudeMdChat`** を含む。
- `index.html` — バンドルを読む薄いローダ。`shared/`・`element-explains.js` 等は素の script で先読みする補助定義。

### その他
- `tests/` — pytest（HOME 隔離・合成データ）。実行時の状態（作業コピー・flows・eval 等）は `~/.cache/flow-inspector/` 配下に作られ、リポには含めない。
- **`docs/llm-chats-map.md` — LLMチャット該当箇所＆対応チェック表**。全 LLM 呼び出し（13機能）の UI名・フロント/バックの所在・system prompt 定数・モデル・渡すデータ・出力形式を一覧化。**チャット/プロンプト/モデルを触る前に必ず参照**すること（`/api/chat` の context_type 分岐や、共有ユーティリティ `build_flow_context`／`NO_TOOLS_PREFIX` 等の連動範囲＝「ここを直すとどこに波及するか」もここに記載）。行番号はズレるので関数名・定数名で探す。

## CLAUDE.md オーサリング（主要機能の一つ）

- 設定スタックの各レイヤー（USER GLOBAL / USER×PROJECT / PROJECT / LOCAL。MANAGED は除外）の「✨作成 / ✏️編集」から対話で作る。保存先はそのレイヤーの実パス。
- AI は **1 問ずつ質問**して作る（「コードから分かること＝調べて埋める／ユーザーにしか分からないこと＝質問」）。選択式の質問はボタン化される。
- AI は**ファイルツールを持たない**（`claude -p --tools ""`）。文脈はサーバが注入する：「🔍調べてもらう」でプロジェクトを深読み、足りなければ確認の上 systemd/nginx まで**段階的に**スコープ拡大。捏造させない。
- チャットは `--model sonnet`。`claude -p` は逐次出力しないので SSE アイドルタイムアウトは 300 秒。会話履歴は `localStorage` 保存でリロード復元。
- 保存は **staging → 「同期」で本番**（チャットもサーバも勝手に live を書かない）。

## 規約・落とし穴

- チャット系の subprocess は全て `--tools ""`（ファイルツール無し＝text 生成専用。有効だとモデルが cwd 外を Read しようとして詰まる）。引数はリスト渡し（shell を経由しない＝injection 安全）。
- `claude` CLI が認証済みで PATH にある前提（チャット／フロー化／eval が使う）。
- ノード操作 API は edge 張り替えの副作用に注意（挿入＝後続を `y+=140` シフト＋edge 張替、削除＝incoming×outgoing を直結で再構築）。
- 公開対象は「仕組み」のみ。**特定プロジェクトの中身・デモデータ・個人情報を入れない。**
- **VPS で実験する時の URL・接続方法（SSHトンネル/autossh）・デプロイ手順は `CLAUDE.local.md`（gitignore・非公開）に記載。** 公開リポには載せないこと。
