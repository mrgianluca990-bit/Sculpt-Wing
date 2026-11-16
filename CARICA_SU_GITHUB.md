# Compilare Sculpt Wing 0.7.4 su GitHub · Mac M1

Il pacchetto `Sculpt-Wing-0.7.4-source.zip` contiene il progetto aggiornato per il repository [mrgianluca990-bit/Sculpt-Wing](https://github.com/mrgianluca990-bit/Sculpt-Wing): correzione del motore audio mancante, nuova misura manuale con codice Open Sound Meter e modifiche a Compact/Extended.

## Il file essenziale per correggere ENOENT

**Sostituisci anche `.github/workflows/build-desktop.yml`.** Il workflow precedente poteva produrre l'app senza compilare il motore audio. Collegare il mixer o premere Riconnetti non può aggiungere un eseguibile mancante.

Nel Finder **Cmd + Maiusc + .** mostra la cartella `.github`. Deve restare nella radice del repository, senza cartelle aggiuntive sopra. Il nuovo workflow compila il motore ARM64, lo include nell'app e lo avvia dal pacchetto finale prima di caricare l'artifact. Se manca, la build fallisce.

## Caricamento con GitHub Desktop

1. Estrai `Sculpt-Wing-0.7.4-source.zip` sul Mac.
2. Apri il clone di Sculpt-Wing in GitHub Desktop e crea un ramo per l'aggiornamento.
3. Copia il contenuto estratto nella radice del clone, mantenendo i percorsi. Includi **`.github/`, `audio-host/`, `desktop/`, `dist/`, `native/`, `docs/`, `scripts/` e `tests/`**, insieme ai file della radice.
4. Controlla nel diff che compaiano il workflow aggiornato, `desktop/scripts/before-pack.cjs`, `desktop/scripts/after-pack.cjs`, `desktop/scripts/build-audio.cjs` e la cartella `audio-host/vendor/open-sound-meter/`.
5. Crea il commit e pubblica il ramo. Apri la pull request verso `main`, oppure avvia manualmente il workflow sul ramo aggiornato.

Lo ZIP contiene sorgenti: estrailo e carica i file, non lo ZIP come sostituto del progetto. Evita di copiare soltanto l'interfaccia `dist/`.

## Compilazione e download

1. Apri **Actions → Build Sculpt Wing - Mac M1**. Per partire manualmente scegli **Run workflow** sul ramo aggiornato.
2. Attendi la verifica, la compilazione ARM64 e il passaggio **Verifica il motore realmente incluso nell'app**.
3. Nell'esecuzione riuscita scarica l'artifact **Sculpt-Wing-Mac-M1**.
4. Estrai lo ZIP esterno di GitHub e poi **`Sculpt-Wing-0.7.4-mac-arm64.zip`**.
5. Chiudi la vecchia app, copia **Sculpt Wing.app** in Applicazioni e apri la copia nuova.

Il workflow usa il runner Mac ARM64 `macos-15`. Motore ed Electron usano lo stesso requisito minimo macOS, letto dal pacchetto Electron installato. La firma è ad hoc; il workflow non pubblica una Release. Non occorre installare Node sul Mac per usare l'app finale.

## Prova minima senza mixer

Apri **Audio USB**: il motore deve rispondere e mostrare i dispositivi disponibili, anche se la WING non è collegata. Nessun audio deve partire da solo. Apri **Analisi → Open Sound Meter**: senza dispositivo e segnali configurati lo stato deve restare fermo; non devono apparire misure inventate.

Se compare ancora un errore di eseguibile mancante, verifica che stai aprendo l'app 0.7.4 appena estratta e che nell'esecuzione GitHub sia presente il passaggio di verifica del motore incluso. Un errore di dispositivo non disponibile è invece distinto e si risolve scegliendo un dispositivo realmente collegato.

## Documentazione

- [Novità e uso della misura manuale](docs/RELEASE_0.7.4_MAC_M1.md).
- [Verifiche eseguite e prove da completare](docs/VERIFICA_0.7.4.md).
- [Compilazione locale](desktop/README.md).
- [Importazione della channel list](docs/CHANNEL_LIST_IMPORT.md).
