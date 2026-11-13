# Sculpt Wing per macOS e Windows · 0.6

Questa versione usa la stessa interfaccia di Sculpt Wing per iPhone/iPad, in una finestra desktop, con collegamento TCP/UDP diretto alla WING. Durante l’uso servono il computer, il mixer e la stessa rete locale; non serve un server sul computer o una connessione Internet.

## Pacchetti generati da GitHub

Il workflow **Build Sculpt Wing**, incluso in `.github/workflows/build-desktop.yml` alla radice del repository, prepara:

- **Mac Apple Silicon:** `Sculpt-Wing-0.6.0-mac-arm64.zip`.
- **Mac Intel:** `Sculpt-Wing-0.6.0-mac-x64.zip`.
- **Windows x64:** installer `Sculpt-Wing-0.6.0-win-x64.exe`.

Su Mac estrai `Sculpt Wing.app` e spostala in Applicazioni. Su Windows avvia l’installer. I pacchetti incorporano il runtime e non richiedono Node.js. Per il caricamento dei sorgenti e l’avvio della compilazione vedi [CARICA_SU_GITHUB.md](../CARICA_SU_GITHUB.md).

I pacchetti Mac dichiarano **macOS 13.0 o successivo** come versione minima.

Il workflow genera l’installer NSIS sul runner Windows. I pacchetti Mac hanno firma locale ad-hoc, con verifica del bundle, e non hanno Developer ID o notarizzazione; Windows non applica una firma Authenticode. Il primo esito reale di compilazione sarà disponibile dopo l’esecuzione del workflow nel repository.

## Uso

1. Apri **Sculpt Wing**.
2. Apri **WING / Connessione** e inserisci l’IPv4 locale del mixer.
3. Collega la WING: l’app legge identità, parametri e meter. Il collegamento parte in sola lettura.
4. Attiva **Controllo** per abilitare le modifiche.

Il controllo della WING usa la porta 2222 TCP/UDP e una porta UDP locale assegnata dal sistema per i meter. Se macOS o Windows richiedono il permesso, consenti a Sculpt Wing di usare la rete locale/privata. Dopo sospensione del computer, blocco schermo, chiusura o ricaricamento della finestra, la sessione termina: ricollega il banco per rileggere il suo stato.

La demo rimane utilizzabile senza mixer. Le modifiche della demo non vengono inviate automaticamente quando ci si collega alla WING.

## Generare le app dal progetto

I comandi seguenti servono a chi prepara i pacchetti; l’utente di un’app già compilata non deve installare Node.

Prerequisiti: Node.js 22 aggiornato (almeno 22.12.0), npm, download delle dipendenze. Usare macOS per la build Mac e Windows per quella Windows. Dalla radice, preparare prima il driver con `npm ci --prefix native` e `npm run build --prefix native`.

Dalla cartella `desktop`:

```sh
npm ci
npm test
npm run dist:mac
```

oppure, su Windows:

```sh
npm ci
npm test
npm run dist:win
```

- `dist:mac`: DMG e ZIP per Apple Silicon (`arm64`) e Intel (`x64`).
- `dist:win`: installer NSIS e ZIP per Windows `x64`.
- `npm start`: avvia l’app dall’albero di sviluppo.
- `npm run pack`: prepara la cartella applicazione senza installer sul sistema corrente.

Gli output sono in `desktop/release/`. I pacchetti incorporano `dist/` dalla radice del progetto; non caricano il sito pubblicato. Se vengono modificati i file TypeScript del driver in `native/src`, eseguire prima `npm ci` e `npm run build` nella cartella `native` per rigenerare `dist/native-bridge.js`.

## Firma e verifica

La configurazione comprende entrambi i sistemi, ma non contiene certificati, password o credenziali di firma. Electron-builder utilizza le credenziali di firma disponibili nell’ambiente di build. La firma e notarizzazione macOS richiedono un ambiente Mac; la distribuzione Windows firmata richiede un certificato appropriato. Un pacchetto non firmato non equivale a un installer già approvato dai controlli di macOS o Windows.

Il codice della shell e del trasporto dispone di test automatici. Le prove reali su macOS, Windows e WING fisica restano distinte dai test di protocollo e di rete simulata. Verificare la combinazione computer/router/firmware prima dell’impiego durante uno spettacolo.

## Struttura

- `src/main.cjs`: finestra, menu, ciclo di vita e confine IPC.
- `src/preload.cjs`: quattro operazioni e due eventi esposti al renderer.
- `src/wing-socket.cjs`: socket locali e isolamento delle sessioni.
- `scripts/prepare.mjs`: copia dell’interfaccia condivisa e icona.

L’interfaccia usa l’origine locale `sculpt://app` e conserva i dati sul computer. Node è disabilitato nel renderer; sandbox, isolamento del contesto, blocco navigazioni e controllo del mittente IPC sono attivi. Non vengono caricate pagine remote nella finestra dell’app.

Riferimenti: [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security/), [electron-builder v26](https://www.electron.build/v26/docs/features/multi-platform-build/).
