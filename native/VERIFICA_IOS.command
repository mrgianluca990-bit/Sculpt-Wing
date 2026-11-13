#!/bin/bash
set -euo pipefail
SCULPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCULPT_DIR"
if [ "$(uname -s)" != "Darwin" ] || ! command -v xcodebuild >/dev/null 2>&1; then
  echo "La verifica richiede macOS e Xcode 26 o successivo."
  exit 1
fi
xcodebuild -version
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$SCULPT_DIR/.local-build" \
  CODE_SIGNING_ALLOWED=NO build
echo "Build per simulatore completata. Resta necessaria la prova su iPhone/iPad e WING reali."
