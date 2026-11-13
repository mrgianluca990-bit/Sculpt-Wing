# Compilazione di Sculpt Wing con GitHub Actions

## Workflow incluso

Percorso: `.github/workflows/build-desktop.yml`. Nome mostrato da GitHub: **Build Sculpt Wing**.

Si avvia automaticamente con i push ai rami `main` e `master`, oppure manualmente con `workflow_dispatch`. Se il repository usa un altro ramo predefinito, modificarne il nome nella sezione `on.push.branches` oppure usare l’avvio manuale.

| Job | Runner | Attività |
| --- | --- | --- |
| Test e compilazione interfaccia | `ubuntu-24.04` | Installazione da lockfile, TypeScript, bundle condiviso, test del driver, dell’interfaccia e dei socket |
| Mac arm64 | `macos-15` | Build ZIP per Apple Silicon, test desktop su macOS, firma ad-hoc e verifica `codesign` |
| Mac x64 | `macos-15-intel` | Build ZIP per Intel, test desktop su macOS, firma ad-hoc e verifica `codesign` |
| Windows x64 | `windows-2025` | Test desktop su Windows e generazione dell’installer NSIS |

I tre job di packaging iniziano soltanto dopo il successo dei controlli iniziali. La versione dell’app viene letta da `desktop/package.json`, attualmente `0.6.0`. Le dipendenze sono fissate nei rispettivi `package-lock.json`; il workflow usa Node 22 aggiornato e le Actions ufficiali `checkout`, `setup-node` e `upload-artifact` della serie 6.

## Ordine di build

Il passaggio `npm run build --prefix native` controlla TypeScript e rigenera `dist/native-bridge.js`. Successivamente `npm run prepare:app --prefix desktop` copia l’interfaccia nella cartella `desktop/app`. Electron-builder incorpora questa copia nel pacchetto.

La cartella **`dist` alla radice contiene sorgenti indispensabili dell’interfaccia**, oltre al bridge generato: va mantenuta nel repository. Le cartelle `native/dist`, `native/ios/App/App/public`, `desktop/app`, `desktop/release` e `node_modules` sono generate e vengono escluse da Git.

Il generatore opzionale `scripts/build-plugin-catalog.py` accetta un riferimento WING locale tramite `--source FILE`. Non fa parte della normale build: il catalogo verificato è già incluso in `dist/plugin-data.js` e nella documentazione.

## Output

| Artifact GitHub | File prodotto |
| --- | --- |
| `Sculpt-Wing-macOS-arm64` | `Sculpt-Wing-0.6.0-mac-arm64.zip` |
| `Sculpt-Wing-macOS-x64` | `Sculpt-Wing-0.6.0-mac-x64.zip` |
| `Sculpt-Wing-Windows-x64` | `Sculpt-Wing-0.6.0-win-x64.exe` |

La conservazione richiesta è di 14 giorni. Il workflow ha permessi `contents: read`, disabilita la conservazione delle credenziali di checkout e passa `--publish never` a electron-builder. Produce artifact scaricabili e non pubblica Release. Una nuova esecuzione sullo stesso ramo annulla quella precedente ancora in corso.

## Firma

Le build Mac usano esplicitamente `mac.identity=-`, `mac.hardenedRuntime=false` e `mac.notarize=false`. La firma ad-hoc mantiene coerente la firma dei componenti del bundle; non fornisce un’identità Apple verificata. Il job fallisce se `codesign --verify --deep --strict` non riesce. I pacchetti sono destinati alla prova personale e richiedono macOS 13 o successivo.

Per una successiva distribuzione con Developer ID serviranno credenziali Apple, hardened runtime e notarizzazione; questi elementi non sono inclusi o richiesti dal workflow attuale. Windows genera un installer completo sul runner Windows, senza dipendere da Wine, e non applica Authenticode.

## Ambito e verifica

Il progetto iOS è conservato in `native/ios`; va preparato con `npm ci` e `npm run ios:sync` nella cartella `native`, quindi compilato con Xcode e una configurazione di firma adatta al dispositivo. Questo workflow non produce un IPA.

I controlli locali eseguiti per il pacchetto sorgente sono descritti in `VERIFICA_GITHUB_0.6.md`. Il primo risultato effettivo dei job Mac/Windows sarà disponibile dopo il caricamento nel repository e l’esecuzione su GitHub. Resta necessaria la prova sul computer e sulla WING di destinazione.

## Fonti tecniche

- [Runner ospitati GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Sintassi dei workflow](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Actions checkout](https://github.com/actions/checkout)
- [Actions setup-node](https://github.com/actions/setup-node)
- [Actions upload-artifact](https://github.com/actions/upload-artifact)
- [Configurazione macOS electron-builder v26](https://www.electron.build/v26/docs/configuration/mac)
