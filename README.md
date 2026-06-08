# Flow Inspector

> Claude Code の設定をフロー図で可視化・編集するローカルダッシュボード（Claude Code プラグイン）。

Flow Inspector は、あなたの PC の Claude Code 設定（**スキル / サブエージェント / フック / MCP / コマンド / CLAUDE.md**）を自動スキャンして、「いま自分の Claude Code がどう動くのか」を**フロー図**で見える化し、**JSON を書かずに**（ノーコードで）編集できるツールです。

- 🗺 **ダッシュボード** — `~/.claude/` を解析して、スキル・サブエージェント・フック・コマンド・MCP・CLAUDE.md 階層を一覧表示
- 🔀 **フロー図** — 各設定の実行フローをノード／エッジで表示。ドラッグでノードを追加・編集
- ✏️ **ノーコード編集** — ノードをクリック → 設定タブで値を編集 → 「同期」で実ファイルに書き戻し
- 🧪 **eval ワークベンチ** — フローのバージョン管理・テストケース・評価器（LLM / コード）で挙動を検証

## 前提条件

- **Claude Code（`claude` CLI）が認証済み**で PATH にあること（AI 補助機能が利用します。API キーは不要）
- **Python 3.10 以上**（macOS / Linux。Windows は experimental）
- UI はビルド済みバンドルを同梱しており**オフラインでも起動**します（Web フォントのみ CDN 取得＝オフライン時はシステムフォントにフォールバック）。UI ソースは `web/` に同梱、再ビルド手順は [BUILD.md](BUILD.md) 参照

## インストール

Claude Code のプラグインとして導入します（マーケットプレイス登録は別途）。
依存パッケージを入れてください:

```bash
pip install -r server/requirements.txt
```

## 使い方

スラッシュコマンド:

```
/flow-inspector:flow-inspector        # ダッシュボードを起動し、ブラウザで http://127.0.0.1:8077 を開く
/flow-inspector:flow-inspector stop    # 停止
```

> スラッシュコマンドは `プラグイン名:スキル名` の形式です。このプラグインは両方 `flow-inspector` なので `/flow-inspector:flow-inspector` になります。`/` を打つと候補に出ます。

手動起動（依存はプラグイン外の専用 venv に隔離）:

```bash
# 1. 専用 venv を用意（初回のみ。依存をシステムや他プロジェクトと混ぜない）
FI_VENV="$HOME/.cache/flow-inspector/venv"
python3 -m venv "$FI_VENV"
"$FI_VENV/bin/pip" install -r "<plugin>/server/requirements.txt"

# 2. その venv の Python で起動
cd "<plugin>" && "$FI_VENV/bin/python" -m uvicorn server.main:app --host 127.0.0.1 --port 8077
# ポートを変えたい場合は環境変数 FLOW_INSPECTOR_PORT を設定
```

> `/flow-inspector:flow-inspector` スラッシュコマンドを使う場合は、上記の venv 準備・起動は自動で行われます（手動起動は開発・デバッグ用）。

停止（手動）:

- macOS / Linux: `pkill -f "uvicorn server.main:app"`
- Windows: `taskkill /F /IM python.exe`（該当プロセスのみ）

## トークン消費について

- **起動・ダッシュボード表示は 0 トークン**です。設定のスキャンとフロー図化は決定論的に行われ、AI（Claude）は呼ばれません。
- AI を使う（＝トークンを消費する）のは次の操作だけです:
  - **スキルのフロー化（アノテート）** — 初回起動時に未フロー化スキルがあれば、件数を提示して**確認を取ってから**実行します（同意しなければ呼ばれません）。「全部フロー化」か、チャットで特徴を伝えて「選択してフロー化」（例:「議事録系だけフロー化して」）のどちらかを選べます。あとからダッシュボードの「フロー化」ボタン（全件）でも実行できます。
  - 各種 **チャット / 設計 / eval の生成・判定** ボタンを押したとき。
- フロー化は 1 スキルにつき 1 回 AI を呼びます。冪等なので、一度フロー化したスキルは再度実行されません。

## データの保存先

編集の作業コピー・プランボード・通知・eval 結果は **`~/.cache/flow-inspector/`** に保存されます。
本番の `~/.claude/` 配下は、ダッシュボードで明示的に「同期（push）」するまで変更されません（安全側）。

## 既知の制約

- UI はビルド済み JS/CSS バンドル（`static/assets/`）を同梱。オフラインでも動作します（Web フォントのみ CDN）。UI ソースは `web/`（React 18 + Vite）に同梱しており、`cd web && npm install && npm run build` で `static/` を再生成できます（詳細は [BUILD.md](BUILD.md)）。
- eval の **コード評価器は任意の Python を実行**します（サンドボックスは subprocess 分離・環境変数を除去・実行時間制限つきですが、完全な隔離ではありません）。**信頼できるコードのみ登録**してください。サーバーを `127.0.0.1` 以外に公開する場合は特に注意してください。
- サーバーは `127.0.0.1`（ローカルのみ）にバインドします。
- Windows サポートは experimental（起動・停止コマンドは macOS / Linux 前提）。

## ライセンス

[MIT](LICENSE) © 2026 chr

個人・商用を問わず自由に利用・改変できます。
なお、本プロジェクトは将来のバージョンでライセンスが変更される可能性があります（各バージョンは、その時点で付与されたライセンスのもとで有効です）。

## 開発・テスト

```bash
pip install -r server/requirements.txt -r requirements-dev.txt
PYTHONPATH=server python -m pytest tests/ -q
```

フロントエンド（`web/`）を改変したら、[BUILD.md](BUILD.md) に従って再ビルドし、生成物を `static/` に反映してください:

```bash
cd web && npm install && npm run build   # base=/static/ で web/dist/ を生成
# 出力を static/ に反映（BUILD.md 参照）
```
