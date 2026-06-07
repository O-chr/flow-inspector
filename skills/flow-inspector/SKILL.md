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
   if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/api/chat/status"; then
     echo "already running on ${PORT}"   # → 起動済み。手順1〜2をスキップし、3 のワークスペース確認とブラウザ案内へ進む
   fi
   ```
   応答があれば「既に起動しています」とユーザーに伝え、手順5（ブラウザ表示）へ。応答が無ければ手順1から起動する。

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

4. **フロー化の同意（任意・トークン消費する唯一の箇所）**:
   - `GET http://127.0.0.1:8077/api/workspace/annotate-candidates` で未フロー化スキルの一覧を取得（0 トークン）。レスポンスは `{count, skills:[{id, name, description}], setup_done}`。
   - `count == 0` なら何もせず次へ。
   - `count >= 1` のときだけ、ユーザーにチャットで **3 択** を提示する:
     ```
     未フロー化のスキルが N 件あります。フロー化しますか？（AI を呼び、トークンを消費します）
       1. 全部フロー化する（AI 約 N 回）
       2. 選択してフロー化する（特徴を教えてください）
       3. 今はしない
     ```
   - **「1 全部」** → `POST http://127.0.0.1:8077/api/workspace/annotate-all`（body 不要、または `{}`）。
   - **「2 選択」** → 「どんなスキルをフロー化したいですか？（例: 議事録・文書作成系、SNS 投稿系 など）」と聞く。ユーザーの特徴文と、上で取得した `skills` の `name`/`description` を **あなた（Claude）自身が読んで意味的に合致するものを選ぶ**（別途 AI 検索 API は呼ばない＝追加トークン 0）。該当候補を名前で提示して確認を取り、同意されたら `POST .../annotate-all` に `{"flow_ids": [選んだ id ...]}` を渡す。
   - **「3 今はしない」** → 呼ばない。「あとでダッシュボードの『フロー化』ボタン（全件）か、チャットで『〇〇系をフロー化して』と頼めば実行できます」と案内。
   - 実行すると結果は staging に書かれ、本番は push まで無傷。1 件以上成功するとセットアップ済みマーカーが記録され、次回以降は新しい未フロー化スキルがある時だけ再度確認される。時間がかかるのでレスポンスを待たず次へ進んでよい。**勝手に（同意なく）実行しないこと。**

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
6. **フロー化の同意（トークンを消費する唯一の箇所）**:
   - GET `http://127.0.0.1:8077/api/workspace/annotate-candidates` で未フロー化スキルの一覧を取得（0 トークン）。`{count, skills:[{id,name,description}], setup_done}`。
   - `count == 0` なら何も実行せず 7. へ。
   - `count >= 1` のときだけユーザーに **3 択** を提示:「1. 全部フロー化 / 2. 選択してフロー化（特徴を教えてください）/ 3. 今はしない」。AI（sonnet）を 1 スキルにつき約 1 回呼ぶこと（コスト）を明記する。
     - **1 全部** → POST `.../annotate-all`（body 不要）。
     - **2 選択** → 特徴を聞き、取得済み `skills` の name/description を **あなた自身が読んで** 合致するものを選び、確認の上 POST `.../annotate-all` に `{"flow_ids": [...]}` を渡す（別の AI 検索 API は呼ばない）。
     - **3 今はしない** → 呼ばない。ダッシュボードのボタン（全件）かチャットで後から可、と案内。
   - **勝手に実行しないこと。**
7. ブラウザで `http://127.0.0.1:8077` を開く（`FLOW_INSPECTOR_PORT` を変えた場合はそのポート）
8. ユーザーにダッシュボード起動完了を通知（フロー化を実行中なら「スキルをフロー化中です」と添える）

**停止モード（引数に "stop" が含まれる場合）:**
1. プロセスを終了する（OS で分岐）:
   - macOS / Linux: `pkill -f "uvicorn server.main:app"`
   - Windows（`pkill` 非対応）: `taskkill /F /IM python.exe`（該当プロセスのみ停止が望ましい）
2. ユーザーにダッシュボード停止完了を通知
