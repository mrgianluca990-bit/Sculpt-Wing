# Sculpt Wing 0.6

Controller WING per iPhone/iPad, macOS e Windows, con la stessa interfaccia e un’anteprima web offline.

## Compilare con GitHub

Questo pacchetto contiene i sorgenti pronti per il repository **sculpt wing**. Segui [CARICA_SU_GITHUB.md](CARICA_SU_GITHUB.md) per il caricamento e l’avvio della compilazione.

Il workflow reale è **`.github/workflows/build-desktop.yml`**, incluso anche se Finder nasconde le cartelle che iniziano con un punto. In GitHub compare come **Build Sculpt Wing** e parte con un push su `main` o `master`, oppure da **Actions → Build Sculpt Wing → Run workflow**.

Dopo i test produce tre artefatti: app Mac Apple Silicon, app Mac Intel e installer Windows x64. Non occorre installare Node sul proprio computer per usare GitHub Actions. I dettagli di runner, firma e output sono in [docs/GITHUB_ACTIONS.md](docs/GITHUB_ACTIONS.md).

## Cosa aprire

- **Interfaccia nel browser:** `dist/index.html`, servita via HTTP/HTTPS. La versione pubblicata è https://sculpt-control-offline.mrgianluca990.chatgpt.site . Safari e Chrome eseguono la demo offline.
- **Progetto iPhone/iPad:** `native/ios/App/App.xcodeproj`, dopo la preparazione con `npm ci` e `npm run ios:sync` nella cartella `native`. Vedi [native/README.md](native/README.md).
- **App desktop:** `desktop/`, con shell Electron e trasporto TCP/UDP diretto. Vedi `desktop/README.md`.
- **Guida iOS per i sorgenti GitHub:** `native/README.md`; i documenti 0.5 descrivono la precedente consegna.
- **Copertura e limiti:** `docs/STATO_0.6.md`, `docs/LIVE_MAPPING.md` e `native/docs/API-LIVE-0.5.md`.

La connessione usa TCP/UDP nativi sulla rete locale: **WING + router + dispositivo con Sculpt Wing**. L’app iPhone/iPad usa il plugin Swift; le app macOS e Windows usano socket Node nel processo principale. Non è richiesto un server o un computer aggiuntivo durante l’uso. La pagina web resta una demo e non apre direttamente i socket del banco.

## Interfaccia

Le **mandate nell’editor canale hanno fader verticali**. Per cambiare nome: apri una strip, premi **Rinomina**, modifica **Nome** e conferma con Invio o uscendo dal campo. Il comando porta anche a **Canale → Identità**. In collegamento live va prima attivato **Controllo** e attesa la lettura dal mixer.

Due file compatte: **16 BUS + 8 MTX + 4 MAIN** sopra, **40 CH + 8 AUX** sotto. Gli AUX sono ingressi. SOF su ogni BUS/MTX, editor da nome strip, macro nella barra inferiore e tema Sculpt rosso.

Il catalogo comprende 109 definizioni di processore fra i diversi contesti e 1116 controlli. I pannelli sono interfacce originali Sculpt: VSS3, FET/ottici, EQ per bande, EQ grafici, multibanda, delay, pitch, amplificatori e channel strip hanno disposizioni specifiche. Non sono immagini statiche né copie grafiche ufficiali Behringer. L’audio viene elaborato dalla WING.

## Modalità WING

1. Inserire l’IP privato del banco in **WING / Connessione**.
2. Attendere identità, struttura e lettura delle 76 strip, comprese le assegnazioni insert esposte dal firmware.
3. Attivare **Controllo** per inviare modifiche. La connessione parte in lettura.
4. Aprire il processore o la pagina: lo schema viene letto dal banco, poi i controlli sono abilitati.
5. Le modifiche vengono confermate con una rilettura. I valori esterni aggiornano l’interfaccia.

Il cambio di modello invalida i parametri precedenti e i gesti accodati. La disconnessione, il background e la riconnessione annullano i comandi pendenti. Il progetto demo non viene mai inviato automaticamente al mixer.

**Parametri WING** permette di navigare l’intera struttura esposta dal firmware, con limiti, enum e proprietà di sola lettura ottenuti dal banco. I controlli senza una mappatura verificata non inviano comandi inventati.

## Sviluppo e verifiche

Da `native/`, con Node 22 aggiornato (almeno 22.12.0, richiesto anche dalla versione desktop):

```sh
npm ci
npm run test:all
npm run build
```

`npm run dev` serve la nuova interfaccia completa; i comandi con suffisso `:prototype` sono riservati al vecchio prototipo.

`build` esegue TypeScript, genera `dist/native-bridge.js` nel progetto web, copia l’interfaccia completa in `native/dist` e nel progetto Xcode. `npm run ios:sync` usa inoltre Capacitor; la firma rimane una configurazione di Xcode.

L’entrypoint distribuito è `native/src/live-entry.ts`. `src/App.tsx` e lo store del prototipo iniziale restano come riferimento storico e per i test legacy; non costituiscono l’interfaccia inclusa nella build corrente.

Il pacchetto contiene codice sorgente, test, documentazione e risorse. **Non contiene un IPA firmato.** Build e test JavaScript/TypeScript sono verificati nell’ambiente Linux; compilazione Xcode, installazione iOS e funzionamento su WING fisica restano da verificare sul dispositivo.

## Versione desktop

Il bundle desktop include la stessa cartella `dist/` e lo stesso driver WING di iOS. La connessione parte in lettura; la modifica dei parametri richiede **Attiva controllo**. I pacchetti del mixer vengono isolati per sessione e i comandi pendenti sono annullati alla disconnessione o alla sospensione.

Il progetto prevede pacchetti macOS Apple Silicon/Intel e Windows x64. Gli esiti effettivi di compilazione, distribuzione e collaudo sono riportati in `docs/STATO_0.6.md`; il codice sorgente non equivale a una build firmata o a un test su WING reale.
