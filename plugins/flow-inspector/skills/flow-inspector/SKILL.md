---
name: flow-inspector
description: Claude Code設定のフロー図ダッシュボードを起動・停止する
argument-hint: "[stop]"
disable-model-invocation: true
flow_version: 1
---

# Flow Inspector Skill

このスキルは Claude Code 設定をフロー図で可視化・編集するダッシュボードを起動・停止します。

## 使い方

- 引数なし: ダッシュボードを起動
- 引数 `stop`: ダッシュボードを停止

## 処理フロー

### 起動時 <!-- {code} -->

ポートは既定で **8077**。環境変数 `FLOW_INSPECTOR_PORT` で変更可能。

0. **二重起動チェック（最初に必ず行う）**: 既に Flow Inspector が同じポートで動いていたら、新規起動しない（ポート衝突で「失敗」表示になるのを防ぐ）。
   ```bash
   PORT="${FLOW_INSPECTOR_PORT:-8077}"
   if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
     echo "already running on ${PORT}"   # → 起動済み。手順1〜2をスキップし、3 のワークスペース確認とブラウザ案内へ進む
   fi
   ```
   応答があれば「既に起動しています」とユーザーに伝え、手順5（ブラウザ表示）へ。応答が無ければ手順1から起動する。
   （死活確認はサーバが応答するかだけを見る。`/` に統一する＝後半「実装内容」のチェックと揃える。）

1. **専用 venv の準備（依存はプラグイン外に隔離）**: プラグインディレクトリ内に依存を入れず、`~/.cache/flow-inspector/venv` に専用の Python 仮想環境を用意する（無ければ作成、有ればそのまま使う）。これによりシステム Python や他プロジェクトと依存が混ざらず、プラグイン本体も軽量に保たれる。
   ```bash
   FI_VENV="$HOME/.cache/flow-inspector/venv"
   [ -d "$FI_VENV" ] || python3 -m venv "$FI_VENV"      # python3 が無ければ python
   "$FI_VENV/bin/python" -c "import fastapi, uvicorn, yaml" 2>/dev/null \
     || "$FI_VENV/bin/pip" install -q -r "${CLAUDE_PLUGIN_ROOT}/server/requirements.txt"
   ```

2. **サーバーの起動**: その venv の Python で、プラグインディレクトリから Uvicorn を起動
   - 実行コマンド: `cd "${CLAUDE_PLUGIN_ROOT}" && "$HOME/.cache/flow-inspector/venv/bin/python" -m uvicorn server.main:app --host 127.0.0.1 --port "${FLOW_INSPECTOR_PORT:-8077}"`
   - 既定でポート 8077（localhost のみ）にバインド。バックグラウンド起動でよい。

3. **ワークスペース初期化**: サーバー起動後、POST リクエストでワークスペースを初期化
   - エンドポイント: `POST http://127.0.0.1:8077/api/workspace/init`
   - これは決定論コピーのみ。AI（claude）は呼ばず、トークンは消費しない。

4. **未フロー化スキルの案内（フロー化は実行しない・トークン 0）**:
   - `GET http://127.0.0.1:8077/api/workspace/annotate-candidates` で未フロー化スキルの件数を取得（決定論・0 トークン）。レスポンスは `{count, skills:[{id, name, description}], setup_done}`。
   - `count == 0` なら何も言わず次へ。
   - `count >= 1` のときは、ユーザーに **案内だけ** する（ここでは AI 注釈＝フロー化を実行しない）:
     ```
     未フロー化のスキル／コマンドが N 件あります。
     ダッシュボードで、見たいものの「▶ フロー化」ボタンを押すとその場でフロー化します（押した分だけ AI を呼びます）。
     まとめてやるなら、画面上部の「▶ フロー化 (N)」で一括もできます。
     ```
   - **このスキルからは `annotate-all` を自動で叩かない。** フロー化はすべてダッシュボードのボタン（人間のクリック）から実行する＝同意とコストの発生点を UI に一本化する。チャットで「〇〇系をフロー化して」と明示的に頼まれた時だけ `POST .../annotate-all` に `{"flow_ids": [...]}` を渡してよい（任意）。
   - 補足: フロー化結果は staging に書かれ、本番 `~/.claude` は「同期・反映」を押すまで無傷。一度フロー化すればキャッシュされ、プラグインを再起動しても消えない。

5. **ブラウザで表示**: `http://127.0.0.1:8077` をブラウザで開く（`FLOW_INSPECTOR_PORT` を変えた場合はそのポート）

### 停止時（引数: `stop`） <!-- {code} -->

- **macOS / Linux**: `pkill -f "uvicorn server.main:app"`
- **Windows**（`pkill` は使えない）: `taskkill /F /IM python.exe`（他に Python プロセスがある場合はタスクマネージャ等で該当プロセスのみ停止）

## 実装内容

以下の手順に従ってください：

ポートは既定で **8077**（環境変数 `FLOW_INSPECTOR_PORT` で変更可能）。`python3` が無い環境では `python` を使う。

**起動モード:**
0. **二重起動チェック（最初に必ず）**: 既に起動済みなら新規 uvicorn を立てない（ポート衝突で「exit 1 / 失敗」と表示されるのを防ぐ）。
   ```bash
   PORT="${FLOW_INSPECTOR_PORT:-8077}"
   if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
     echo "already running"   # 起動済み → 手順1〜4 をスキップし、7（ブラウザ）へ。ユーザーに「既に起動しています」と伝える
   fi
   ```
   応答が無いときだけ手順1から起動する。
1. 専用 venv を用意（プラグイン外に依存を隔離。`$HOME/.cache/flow-inspector/venv`）:
   ```bash
   FI_VENV="$HOME/.cache/flow-inspector/venv"
   [ -d "$FI_VENV" ] || python3 -m venv "$FI_VENV"
   "$FI_VENV/bin/python" -c "import fastapi, uvicorn, yaml" 2>/dev/null \
     || "$FI_VENV/bin/pip" install -q -r "${CLAUDE_PLUGIN_ROOT}/server/requirements.txt"
   ```
2. （上の手順に統合済み。依存が無ければ自動で install される）
3. その venv の Python で Uvicorn を起動: `cd "${CLAUDE_PLUGIN_ROOT}" && "$FI_VENV/bin/python" -m uvicorn server.main:app --host 127.0.0.1 --port "${FLOW_INSPECTOR_PORT:-8077}"`
4. サーバー起動待機（数秒）
5. POST `http://127.0.0.1:8077/api/workspace/init` を呼び出し（本番設定を作業用コピーに pull。決定論・0 トークン）
6. **未フロー化スキルの案内（フロー化は実行しない・トークン 0）**:
   - GET `http://127.0.0.1:8077/api/workspace/annotate-candidates` で件数を取得（決定論・0 トークン）。`{count, skills:[{id,name,description}], setup_done}`。
   - `count == 0` なら何もせず 7. へ。
   - `count >= 1` のときは、ダッシュボードでフロー化できる旨を **案内するだけ**:「N 件が未フロー化です。各行の『▶ フロー化』、または上部の『▶ フロー化 (N)』で実行できます（押した分だけ AI を呼びます）」。
   - **`annotate-all` をここから自動で叩かない。** フロー化の実行と同意は UI ボタンに一本化する（チャットで明示的に「〇〇系をフロー化して」と頼まれた時のみ任意で `POST .../annotate-all` 可）。
7. ブラウザで `http://127.0.0.1:8077` を開く（`FLOW_INSPECTOR_PORT` を変えた場合はそのポート）
8. ユーザーにダッシュボード起動完了を通知（未フロー化が N 件あれば、ダッシュボードの「▶ フロー化」ボタンで実行できると添える）

**停止モード（引数に "stop" が含まれる場合）:**
1. プロセスを終了する（OS で分岐）:
   - macOS / Linux: `pkill -f "uvicorn server.main:app"`
   - Windows（`pkill` 非対応）: `taskkill /F /IM python.exe`（該当プロセスのみ停止が望ましい）
2. ユーザーにダッシュボード停止完了を通知
