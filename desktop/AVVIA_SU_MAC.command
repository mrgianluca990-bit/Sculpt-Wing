#!/bin/bash
set -euo pipefail
SCULPT_DESKTOP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCULPT_DESKTOP_DIR"
if ! command -v npm >/dev/null 2>&1; then
  echo "Per avviare dal codice serve Node.js 22 o successivo. L’app compilata non richiede Node."
  exit 1
fi
if [ ! -d node_modules ]; then npm ci; fi
npm start
