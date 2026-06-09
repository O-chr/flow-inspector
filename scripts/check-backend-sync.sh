#!/usr/bin/env bash
# Verify the SHARED backend files are byte-identical between the two editions.
# The three language-specific display files are allowed to differ.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A="$ROOT/plugins/flow-inspector/server"
B="$ROOT/plugins/flow-inspector-eng/server"
DRIFT="$(diff -r \
  --exclude='__pycache__' \
  --exclude='boards_store.py' \
  --exclude='flow_codec.py' \
  --exclude='parser.py' \
  "$A" "$B" || true)"
if [ -n "$DRIFT" ]; then
  echo "Backend drift detected between editions:"
  echo "$DRIFT"
  exit 1
fi
echo "OK: shared backend files identical (3 display files exempt)."
