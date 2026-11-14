# Compilare Sculpt Wing 0.7.2 su GitHub · Mac M1

Il pacchetto `Sculpt-Wing-0.7.2-source.zip` contiene il progetto completo aggiornato dalla base 0.6.8 del repository [mrgianluca990-bit/Sculpt-Wing](https://github.com/mrgianluca990-bit/Sculpt-Wing), commit `7720343a47d660dd7ddacf249f4eef5ab219de9a`.

Include le nove caselle condivise fra Compact ed Extended, riordino WING e TAP Send, espansione dei moduli, fader/pan/mute conservati, Cmd + =, host USB/VST3, importazione PDF live, RTA automatico, Controllo automatico, avviso Ricollega, macro corrette e scene locali. La compilazione ARM64 resta da eseguire dopo il caricamento dei sorgenti.

## Caricamento con GitHub Desktop

1. Estrai `Sculpt-Wing-0.7.2-source.zip` sul Mac.
2. Apri il clone del repository Sculpt-Wing in GitHub Desktop e crea un ramo per l’aggiornamento.
3. Copia il contenuto estratto nella radice del clone, mantenendo i percorsi. Includi `audio-host/`, `dist/`, `native/`, `desktop/`, `docs/`, `scripts/`, `tests/` e `.github/`.
4. Controlla il diff, crea il commit e pubblica il ramo.
5. Apri una pull request verso `main`: il workflow di verifica e compilazione parte per la pull request. Dopo aver integrato l’aggiornamento in `main`, parte anche sul push.

Nel Finder **Cmd + Shift + .** mostra la cartella `.github`. Il workflow deve trovarsi in `.github/workflows/build-desktop.yml`, senza un livello di cartella aggiuntivo. Lo ZIP contiene sorgenti; non caricare lo ZIP stesso come sostituto dei file del repository.

## Compilazione e download

1. Apri **Actions → Build Sculpt Wing - Mac M1**.
2. Attendi i test dell’interfaccia e del trasporto, il test dell’host con un effetto VST3 reale e la compilazione ARM64. Per un avvio manuale usa **Run workflow** sul ramo aggiornato.
3. Nell’esecuzione riuscita, scarica l’artifact **Sculpt-Wing-Mac-M1**.
4. Estrai lo ZIP esterno di GitHub e poi `Sculpt-Wing-0.7.2-mac-arm64.zip`.
5. Chiudi la precedente app e copia **Sculpt Wing.app** in Applicazioni.

Il motore VST3 è incluso nell’app. Il workflow verifica architettura ARM64 e firma ad hoc dell’app e del motore. Non serve installare Node sul Mac dell’utente per usare il pacchetto finale. Il collaudo di audio USB, plugin personali e collegamento WING si svolge sul Mac e sul banco reali.

## Se la compilazione si interrompe

Apri il primo passaggio rosso e conserva il messaggio e il log. Verifica prima che il ramo contenga anche `audio-host/` e il workflow aggiornato. Le istruzioni di compilazione locale sono in [desktop/README.md](desktop/README.md) e [audio-host/README.md](audio-host/README.md).

- [Novità e utilizzo](docs/RELEASE_0.7.2_MAC_M1.md).
- [Verifiche eseguite e prove da completare](docs/VERIFICA_0.7.2.md).
- [Importazione della channel list](docs/CHANNEL_LIST_IMPORT.md).
