#!/bin/bash
set -euo pipefail
SCULPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$(uname -s)" != "Darwin" ]; then
  echo "Questo comando apre il progetto iPhone/iPad su macOS con Xcode."
  exit 1
fi
if [ ! -f "$SCULPT_DIR/ios/App/App/public/index.html" ] || \
   [ ! -f "$SCULPT_DIR/ios/App/App/capacitor.config.json" ] || \
   [ ! -f "$SCULPT_DIR/ios/App/App/config.xml" ]; then
  echo "Il progetto sorgente deve essere preparato prima di aprirlo in Xcode."
  echo "Apri AGGIORNA_INTERFACCIA.command oppure esegui dalla cartella native:"
  echo "  npm ci"
  echo "  npm run ios:sync"
  echo "Poi riapri APRI_SU_MAC.command. Servono Node.js 22+ e Xcode 26+."
  exit 1
fi
echo "Apertura di Sculpt Wing in Xcode."
echo "Nel target App seleziona il tuo Team e l’iPhone o iPad, poi premi Run."
echo "Bundle web e configurazioni iOS presenti."
open "$SCULPT_DIR/ios/App/App.xcodeproj"
