# Aggiornare Sculpt Wing 0.6.7 su GitHub — Mac M1

Questa consegna aggiorna il repository esistente **mrgianluca990-bit/Sculpt-Wing**, verificato alla **0.6.6** su `main`, commit `465b4f01f86f0a758c970d45780a3982db972213`. Lo ZIP contiene i file modificati e aggiunti per la 0.6.7: DCA nella riga superiore, editor rifiniti, mandate compatte, Undo/Redo, ottimizzazioni e OSC per Sculpt Show. **Conserva gli altri file presenti nel repository**: questo è un aggiornamento, non una copia completa del progetto.

## Caricamento

1. Estrai **Sculpt-Wing-0.6.7-Aggiornamento-Mac-M1.zip** sul Mac.
2. Apri il repository [Sculpt-Wing](https://github.com/mrgianluca990-bit/Sculpt-Wing), ramo `main`, e scegli **Add file → Upload files**.
3. Carica i file estratti mantenendo i percorsi `dist/`, `native/`, `desktop/`, `docs/`, `tests/` e i file nella radice. Non caricare il solo ZIP né la cartella esterna come un livello aggiuntivo del repository.
4. Premi **Commit changes** su `main`.

Il workflow **`.github/workflows/build-desktop.yml`** è già configurato. Una copia viene fornita nel pacchetto: va nello stesso percorso se occorre ripristinarlo. Nel Finder, **Cmd + Shift + .** mostra la cartella `.github`.

Con GitHub Desktop puoi invece copiare i file estratti nel clone esistente, mantenere gli altri file, quindi eseguire Commit e Push.

## Compilazione e download

1. Apri **Actions → Build Sculpt Wing - Mac M1**.
2. Attendi il completamento del controllo dell’interfaccia e della compilazione **Sculpt Wing - Mac M1 (arm64)**. Se occorre avviare manualmente, usa **Run workflow** sul ramo `main`.
3. Nell’esecuzione riuscita, scarica l’artifact **Sculpt-Wing-Mac-M1**.
4. Estrai lo ZIP esterno scaricato da GitHub, quindi **Sculpt-Wing-0.6.7-mac-arm64.zip**. All’interno trovi **Sculpt Wing.app**.
5. Chiudi la vecchia app e sostituiscila con la nuova in Applicazioni.

Il workflow corrente produce il solo target **Mac M1 / Apple Silicon ARM64**. Usa un runner Mac Intel con architettura di destinazione esplicita e verifica dell’eseguibile ARM64 e della firma ad hoc. Non crea automaticamente una Release pubblica.

## Se qualcosa non compare

Verifica che `dist`, `native`, `desktop` e `.github` siano nella radice del repository, senza una cartella esterna aggiuntiva. Il workflow deve essere nel percorso `.github/workflows/build-desktop.yml` sul ramo predefinito. Se un job fallisce, apri il primo passaggio rosso e conserva il relativo log.

Questo aggiornamento è stato compilato come frontend e verificato con test nell’ambiente Linux. Il binario macOS 0.6.7 deve essere generato da GitHub; avvio sul Mac M1 e collaudo su WING fisica restano verifiche separate.

- [Uso e novità](LEGGIMI.txt)
- [Risultati delle verifiche 0.6.7](docs/RELEASE_0.6.7_MAC_M1.md)
- [Importazione della channel list](docs/CHANNEL_LIST_IMPORT.md)
- [OSC e Sculpt Show](docs/OSC_SCULPT_SHOW.md)
- [Collaudo con mixer e Show](docs/COLLAUDO_WING_SHOW_0.6.7.md)
