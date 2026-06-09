#!/usr/bin/env bash
# Sync shared backend files from the canonical (JP) plugin to the English plugin.
# The three display-string files are language-specific and are NOT synced.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/plugins/flow-inspector/server"
DST="$ROOT/plugins/flow-inspector-eng/server"
rsync -a --delete \
  --exclude='__pycache__/' \
  --exclude='boards_store.py' \
  --exclude='flow_codec.py' \
  --exclude='parser.py' \
  "$SRC/" "$DST/"
echo "Synced shared backend (3 language-specific display files left untouched)."
