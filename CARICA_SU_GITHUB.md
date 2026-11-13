# Caricare Sculpt Wing su GitHub

## Prima di iniziare

Estrai `Sculpt-Wing-GitHub-0.6.0.zip` e apri la cartella **sculpt-wing**. I file e le cartelle al suo interno sono la radice del repository: `README.md`, `native`, `desktop`, `dist`, `tests` e `.github` devono essere direttamente visibili nel repo, senza un ulteriore livello `sculpt-wing/`.

Su Mac, nel Finder premi **Cmd + Shift + .** per mostrare anche **`.github`**, **`.gitignore`** e **`.gitattributes`**. Il workflow di compilazione è già incluso in `.github/workflows/build-desktop.yml`.

## Caricamento dal sito GitHub

GitHub accetta fino a 100 file per un singolo caricamento dal browser. Per questo progetto usa questi tre passaggi, mantenendo i nomi e la struttura delle cartelle:

1. Nel repository appena creato scegli **Add file → Upload files**. Carica le cartelle **desktop**, **dist**, **docs**, **scripts** e **tests**, insieme a tutti i file che trovi direttamente nella cartella principale, compresi `.gitignore` e `.gitattributes`. Lascia per i passaggi successivi le cartelle **native** e **.github**. Premi **Commit changes** sul ramo `main` o `master`.
2. Ripeti **Add file → Upload files**, trascina la cartella **native** e conferma con **Commit changes** sullo stesso ramo.
3. Ripeti il caricamento con la cartella **.github** e conferma. A questo punto tutti i sorgenti sono presenti e la compilazione può partire.

Se GitHub mostra **uploading an existing file** nel repository vuoto, puoi usare quel collegamento per il primo passaggio.

In alternativa, con GitHub Desktop puoi clonare il repository, copiare tutto il contenuto della cartella estratta nella cartella del clone, fare Commit e poi Push. Questo percorso consente di inviare tutti i file insieme.

## Avviare e trovare le app

1. Apri la scheda **Actions** del repository.
2. Se il primo caricamento completo non ha già avviato la compilazione, seleziona **Build Sculpt Wing**, premi **Run workflow**, scegli `main` o `master` e conferma.
3. Aspetta che il controllo iniziale e le tre compilazioni terminino. Apri l’esecuzione e scorri fino ad **Artifacts**.

| Artifact | Contenuto |
| --- | --- |
| `Sculpt-Wing-macOS-arm64` | ZIP con `Sculpt Wing.app` per Mac Apple Silicon, serie M |
| `Sculpt-Wing-macOS-x64` | ZIP con `Sculpt Wing.app` per Mac Intel |
| `Sculpt-Wing-Windows-x64` | Installer `Sculpt-Wing-0.6.0-win-x64.exe` per Windows x64 |

GitHub scarica gli artifact in uno ZIP esterno: estrailo per trovare il pacchetto dell’app. Su Mac estrai anche lo ZIP interno, quindi sposta l’app in Applicazioni. Su Windows avvia l’installer estratto.

Gli artifact di questo workflow restano disponibili per **14 giorni**; puoi scaricarli subito o avviare una nuova compilazione quando occorre. Il workflow non crea automaticamente una Release.

## Se il workflow non compare

- Controlla in **Code** che il percorso sia esattamente **`.github/workflows/build-desktop.yml`**. La cartella inizia con un punto ed è nella radice del repo.
- Controlla che non sia stato caricato il solo ZIP e che i sorgenti non si trovino dentro un’ulteriore cartella `sculpt-wing`.
- Controlla che il file sia sul ramo predefinito. Il comando manuale **Run workflow** compare quando il workflow con `workflow_dispatch` è presente sul ramo predefinito.
- Se GitHub chiede di abilitare Actions per il repository, abilitalo dalla scheda Actions secondo le impostazioni del tuo account.
- Se un job fallisce, aprilo e leggi il primo passaggio rosso. Puoi condividere quel log per correggere il problema specifico.

## Firma e collaudo

Le build Mac hanno firma locale **ad-hoc**, verificata nel workflow, e richiedono macOS 13 o successivo. Non hanno Developer ID né notarizzazione Apple. L’installer Windows non ha firma Authenticode. Le protezioni del sistema possono quindi mostrare avvisi o impedire l’apertura secondo le loro impostazioni.

La compilazione su GitHub e i test automatici non sostituiscono la prova con la tua WING. Il progetto iPhone/iPad è incluso nei sorgenti; il workflow qui prepara soltanto le app Mac e Windows.

Riferimenti: [caricare file su GitHub](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository), [avviare manualmente un workflow](https://docs.github.com/en/actions/how-tos/managing-workflow-runs-and-deployments/managing-workflow-runs/manually-running-a-workflow), [scaricare gli artifact](https://docs.github.com/en/actions/managing-workflow-runs/downloading-workflow-artifacts).
