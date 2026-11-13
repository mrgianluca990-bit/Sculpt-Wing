#!/bin/bash
set -euo pipefail
SCULPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCULPT_DIR"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Per preparare il checkout sorgente installa Node 22 o successivo da https://nodejs.org/"
  echo "Poi riapri questo comando: installerà le dipendenze e sincronizzerà il progetto iOS."
  exit 1
fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Serve Node 22 o successivo."); process.exit(1); }'
npm ci
npm test
npm run ios:sync
if [ ! -f ios/App/App/public/index.html ] || \
   [ ! -f ios/App/App/capacitor.config.json ] || \
   [ ! -f ios/App/App/config.xml ]; then
  echo "La preparazione iOS è incompleta: mancano bundle web o configurazioni. Controlla l’output di npm run ios:sync."
  exit 1
fi
echo "Interfaccia aggiornata e copiata nel progetto iPhone/iPad."
echo "Ora puoi aprire APRI_SU_MAC.command."
