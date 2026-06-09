# Changelog

このプロジェクトのバージョンごとの変更点。形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に準拠します。

## [Unreleased]

### 追加
- **英語版エディション**: リポジトリを「1マーケットプレイス・2プラグイン」のモノレポに再構成。英語UIの `flow-inspector-eng` と日本語UIの `flow-inspector` を同一リポジトリ／同一マーケットプレイスから配布（`plugins/<edition>/`）。
- README を英語主（`README.md`）＋日本語（`README.ja.md`）の2本立てに。スクリーンショットを `docs/images/{en,ja}/` に分離。
- バックエンド共有の仕組み: `scripts/sync-backend.sh`（日本語版 `server/` を正準として英語版へ同期。表示文字列を翻訳した3ファイルは除外）と `scripts/check-backend-sync.sh`（共有ファイルのドリフト検査）。

## [0.1.0] - 2026-06-08

初版（公開リリース）。

### 追加
- **ダッシュボード**: `~/.claude/` を解析し、スキル / サブエージェント / フック / MCP / コマンド / CLAUDE.md 階層を一覧表示。
- **フロー図エディタ**: 各設定の実行フローをノード／エッジで可視化、ノーコードで編集。
- **遅延フロー化**: 起動時に全件フロー化はせず、各行の「▶ フロー化」ボタン（または一括ボタン）を押したときだけ AI で解析。結果は staging に保存され、「同期」で実ファイルへ反映するまで本番 `~/.claude` は無傷。
- **eval ワークベンチ**: フローのバージョン管理・テストケース・評価器（LLM / コード）。
- **CLAUDE.md オーサリング**: レイヤー別に対話で CLAUDE.md を作成／編集。
- ビルド済み Web UI（React 18 + Vite）を `static/assets/` に同梱（オフライン起動可）。UI ソースは `web/` に同梱し再ビルド可能（[BUILD.md](BUILD.md)）。
- ローカル専用サーバ（FastAPI、`127.0.0.1` バインド）。依存は専用 venv に隔離して自動インストール。

### セキュリティ
- スキル／コマンドの保存先を `$HOME` 配下の安全なサブツリーに限定（`~/.ssh` `~/.aws` 等を拒否）。
- eval のコード評価器は subprocess 分離＋環境変数除去＋実行時間制限で動作（完全な隔離ではないため、信頼できるコードのみ登録すること）。
