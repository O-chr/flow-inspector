# Building the frontend

This repository ships **both** the prebuilt UI bundle (`static/assets/index-*.js` / `index-*.css`) **and** its **source** (`web/`). You do not need to rebuild just to run the server — the bundled assets are used as-is. Rebuild `static/` only when you want to change the UI.

## Prerequisites

- **Node.js 18+** and **npm**

## Install

```bash
cd web
npm install        # or `npm ci` for a reproducible install from the lockfile
```

(Dependencies go into `web/node_modules/`, which is git-ignored. `web/package-lock.json` is committed, so `npm ci` reproduces the exact versions.)

## Build

```bash
cd web
npm run build
```

- `npm run build` runs `vite build --base=/static/`. The server serves the bundle under `/static/`, so the **base must be `/static/`** (it is set in the `package.json` `build` script, so a plain `npm run build` produces correct output).
- Output is generated in `web/dist/` (git-ignored):
  - `web/dist/index.html`
  - `web/dist/assets/index-<hash>.js` / `index-<hash>.css`
  - `web/dist/shared/*.js`, `web/dist/element-explains.js` (copies of `web/public/`)

> **Verify the base was applied.** After building, check that `web/dist/index.html` references `/static/...` paths (e.g. `/static/assets/...`, `/static/shared/...`). If you instead see `/assets/...` (no `/static/` prefix), the base did not apply — rebuild with the explicit flag:
> ```bash
> node_modules/.bin/vite build --base=/static/
> ```

## Sync the output into `static/`

After building, sync the artifacts from `web/dist/` into the repository's `static/`:

```bash
# from the repository root
rm -f static/assets/*
cp web/dist/assets/*       static/assets/
cp web/dist/index.html     static/index.html
cp web/dist/shared/*       static/shared/
cp web/dist/element-explains.js static/element-explains.js
```

> Note: `static/shared/*.js` and `static/element-explains.js` are plain scripts (originating from `web/public/`) that define `window.NODE_TYPES` / `window.FI` and load before the module bundle. They are the source of the node-type metadata, the palette element library, and the inspector explanations — to change that content, edit the files under `web/public/` and rebuild.

After syncing, confirm that the hashed filenames referenced by `static/index.html` exist in `static/assets/`.

## Notes

- The committed `static/assets/` is a **prebuilt artifact** generated from the `web/` source. When you change `web/`, update `static/` with the steps above and commit both together (to keep source and artifact in sync).
- `web/node_modules/` and `web/dist/` are git-ignored.
- For hot-reload during development: `cd web && npm run dev` (the Vite dev server). The `/api` proxy target is set in `web/vite.config.js` (default `http://localhost:8077`).
