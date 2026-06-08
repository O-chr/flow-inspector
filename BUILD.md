# フロントエンドのビルド

このリポジトリには、ビルド済みの UI バンドル（`static/assets/index-*.js` / `index-*.css`）と、その**ソース**（`web/`）の両方が同梱されています。サーバー起動だけなら再ビルドは不要です（同梱バンドルがそのまま使われます）。UI を改変したいときだけ、以下の手順で `static/` を再生成します。

## 前提条件

- **Node.js 18 以上** と **npm**

## インストール

```bash
cd web
npm install        # または、ロックファイル準拠の再現インストールなら npm ci
```

（依存は `web/node_modules/` に入ります。これは git 管理外です。`web/package-lock.json` はコミット済みなので、`npm ci` で同一バージョンを再現できます。）

## ビルド

```bash
cd web
npm run build
```

- `npm run build` は `vite build --base=/static/` を実行します。サーバーがバンドルを `/static/` 配下で配信するため、**base は必ず `/static/`** である必要があります（`package.json` の `build` スクリプトに設定済みなので、素の `npm run build` で正しい出力になります）。
- 出力は `web/dist/` に生成されます（git 管理外）:
  - `web/dist/index.html`
  - `web/dist/assets/index-<hash>.js` / `index-<hash>.css`
  - `web/dist/shared/*.js`, `web/dist/element-explains.js`（`web/public/` のコピー）

## 出力を `static/` へ反映

ビルド後、`web/dist/` の成果物をリポジトリの `static/` に同期します。

```bash
# リポジトリのルートで
rm -f static/assets/*
cp web/dist/assets/* static/assets/
cp web/dist/index.html static/index.html
```

> 注意: `static/shared/*.js` と `static/element-explains.js` は、`web/public/` 由来のプレーンなスクリプト（`window.NODE_TYPES` / `window.FI` などを定義）で、モジュールバンドルより前に読み込まれます。リポジトリにコミット済みのものをそのまま使うため、**上書き・削除しないでください**（必要なら `web/public/` 側を編集してから再コピーします）。

反映後、`static/index.html` が参照するハッシュ付きファイル名が `static/assets/` に存在することを確認してください。

## 補足

- コミット済みの `static/assets/` は、`web/` のソースから生成された**プリビルド成果物**です。`web/` を変更したら、上記の手順で `static/` を更新し、両方を一緒にコミットしてください（ソースと成果物の整合性を保つため）。
- `web/node_modules/` と `web/dist/` は `.gitignore` 済みです。
- 開発時のホットリロードは `cd web && npm run dev`（Vite dev サーバー）。`/api` のプロキシ先は `web/vite.config.js` で設定します（デフォルトは `http://localhost:8077`）。
