# GitHub Actions · Mac M1 / Apple Silicon

Il workflow distribuito è `.github/workflows/build-desktop.yml`, denominato **Build Sculpt Wing - Mac M1**. Si avvia su push e pull request verso `main`/`master`, oppure manualmente da **Run workflow**.

1. **Verifica interfaccia e protocollo** su Ubuntu: installazione con lockfile, build TypeScript, test dell’interfaccia e test del trasporto desktop.
2. **Mac M1 (arm64)** su `macos-15`: verifica dell’architettura del runner, build dell’interfaccia, test desktop, compilazione del motore JUCE e del plugin VST3 di prova, test nativi e del protocollo senza aprire un dispositivo audio.
3. Firma ad hoc del motore, packaging Electron ARM64, verifica con `lipo` e `codesign` di app e motore incluso.
4. Upload dell’artifact **Sculpt-Wing-Mac-M1**, contenente `Sculpt-Wing-0.7.3-mac-arm64.zip`.

La versione viene letta da `desktop/package.json`. Il motore è compilato prima del packaging perché `extraResources` richiede il suo bundle. Il plugin di prova rimane fuori dall’app distribuita. Non viene pubblicata automaticamente una Release.

Il runner `macos-15` è indicato come Apple Silicon ARM64 dalla [documentazione GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job), verificata il 16 novembre 2026. Il target ARM64 viene anche controllato durante il job.

Le prove native del workflow devono ancora essere eseguite sul nuovo commit dopo il caricamento dell’aggiornamento. I controlli automatici non misurano latenza USB reale né compatibilità dei plugin personali. Per la procedura completa vedi [Carica su GitHub](../CARICA_SU_GITHUB.md) e [Verifica 0.7.3](VERIFICA_0.7.3.md).
