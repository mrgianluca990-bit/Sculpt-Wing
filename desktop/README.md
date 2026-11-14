# Sculpt Wing per Mac M1 · 0.7.1

L’app desktop usa la stessa interfaccia del progetto web e comunica direttamente con la WING tramite TCP/UDP. Include un trasporto OSC per Sculpt Show e il motore nativo VST3 `SculptWingAudio`, incluso nello stesso pacchetto. Ethernet controlla la console, USB porta l’audio al Mac e indietro. Non occorre installare un’app ponte separata.

## Pacchetto generato da GitHub

Il workflow **Build Sculpt Wing - Mac M1**, in `.github/workflows/build-desktop.yml`, distribuisce il target **Apple Silicon ARM64**. L’artifact previsto **Sculpt-Wing-Mac-M1** contiene `Sculpt-Wing-0.7.1-mac-arm64.zip`, con **Sculpt Wing.app**. Estrai l’app e spostala in Applicazioni dopo aver chiuso la versione precedente. L’app incorpora il runtime e il motore VST3: non richiede Node.js sul computer dell’utente.

Il workflow esegue prima i test nell’ambiente Linux e poi quelli del trasporto sul runner Mac. Compila un host e un effetto VST3 di prova per verificare caricamento, stato e processing sul runner, poi compila esplicitamente l’app e il motore ARM64. Verifica entrambe le architetture e la firma ad hoc. Non applica Developer ID o notarizzazione e non pubblica automaticamente una Release. La compilazione macOS resta da eseguire dopo il caricamento autorizzato dei sorgenti.

Per il caricamento seguire [CARICA_SU_GITHUB.md](../CARICA_SU_GITHUB.md).

## Collegare la WING

1. Apri **WING / Connessione** e inserisci l’IPv4 locale del mixer.
2. Collega il banco e attendi la lettura di identità, parametri e meter.
3. Dopo la sincronizzazione riuscita **Controllo si abilita automaticamente**. Puoi disattivarlo manualmente per lavorare in sola lettura.

Il controllo WING usa la porta 2222 TCP/UDP e una porta UDP locale assegnata dal sistema per i meter. Se macOS richiede il permesso per la rete locale, concedilo all’app. Dopo sospensione, chiusura o ricaricamento della finestra la sessione termina: ricollega il banco per rileggere lo stato. La demo non viene inviata automaticamente alla WING.

Aprire una pagina, scegliere un file o esportare una scena conserva la connessione. Il catalogo Scene usa le definizioni per leggere tutti i nomi dello Show aperto e richiede separatamente i valori di stato. La coda riserva spazio al controllo TCP e scarta soltanto i meter UDP eccedenti. Una perdita inattesa mostra un avviso persistente con causa e **Ricollega**; il nuovo collegamento rilegge il banco e non riproduce i vecchi comandi. Un timeout reale interrompe ancora la sessione.

## Compact, Extended e USB

**Cmd + =** alterna le due viste anche dal menu Vista. Compact conserva le due righe e presenta tutti i dispositivi del canale affiancati nella riga opposta: parametri principali e singoli moduli espandibili orizzontalmente. Extended conserva i processori WING e gli slot VST3 sopra i fader del banco selezionato. Il cambio non modifica i parametri audio. Gli slot VST3 richiamano l’editor nativo del plugin.

In **Audio USB** scegli la WING come unica interfaccia di ingresso e uscita, applica frequenza e buffer e prepara il routing dei rack. Al primo uso macOS può richiedere il permesso Microfono, necessario anche per gli ingressi USB. L’audio si avvia solo con **Avvia audio USB**. Le catene sono salvate localmente e ripristinate con l’audio fermo.

Il motore ospita effetti VST3 compatibili con Apple Silicon, fino a 16 rack mono/stereo con 8 slot ciascuno e fino a 48 canali USB. Modifiche alla struttura richiedono audio fermo; editor e bypass sono utilizzabili durante l’elaborazione. Il bypass del rack lascia passare il segnale attraverso il Mac; l’esclusione del computer richiede il bypass dell’insert sulla console. Dettagli, limiti e collegamenti sono nelle [note 0.7.1](../docs/RELEASE_0.7.1_MAC_M1.md).

## EQ, pan e RTA

Il cambio canale mantiene il modulo dell’editor aperto. Le bande EQ usano le coordinate effettive del grafico ridimensionato e conservano il punto di presa. Pan sopra i fader: trascina o usa le frecce; doppio clic per il centro. Un gesto resta una sola operazione Annulla.

Lo spettro RTA arriva direttamente dal trasporto UDP WING. L’apertura dell’EQ richiede automaticamente il canale e il tap corretti, con conferma prima di mostrare lo spettro. È supportato il profilo numerico standard, oltre alle enum simboliche esposte dal firmware. La console dispone di un analizzatore condiviso: contesa, sorgente diversa e assenza dei dati rimangono visibili. Scala relativa; prova hardware ancora necessaria. Vedi [RTA_WING.md](../docs/RTA_WING.md).

## OSC e Sculpt Show

Apri **OSC / Sculpt Show** dal menu del banco. Il profilo Show propone `127.0.0.1:53000` per le app aperte sullo stesso Mac. Abilita OSC Control in Show RC3, applica le impostazioni e usa **Verifica Sculpt Show**: richiede soltanto lo stato, senza avviare cue.

GO, Stop All, pausa, ripresa, fade e navigazione sono già predisposti. Si possono aggiungere alle macro anche comandi per cue/liste specifiche e messaggi OSC personalizzati. L’invio UDP non richiede Controllo WING. Un invio riuscito certifica l’accettazione del datagramma, non l’esecuzione del comando nel destinatario; la verifica di stato attende invece una risposta valida.

La pagina browser permette di preparare le assegnazioni, ma per inviare UDP serve l’app desktop. I messaggi OSC già inviati non vengono annullati con Cmd+Z. Contratto, versione Show e istruzioni: [OSC_SCULPT_SHOW.md](../docs/OSC_SCULPT_SHOW.md).

## Annulla e ripristina

**Cmd+Z** e **Maiusc+Cmd+Z** richiamano la cronologia dell’app dal menu macOS e dalla tastiera. Un trascinamento crea una sola operazione. Nei campi di testo resta l’annullamento nativo della digitazione.

In live, Undo/Redo passa dalle verifiche di stato e dal riscontro delle scritture WING. Un valore modificato esternamente o una sessione cambiata impediscono il ripristino obsoleto. Il cambio di algoritmo live richiede un preset; i trigger esterni, come OSC e registrazione, non vengono invertiti.

## Compilare dal progetto

Questi comandi servono a chi prepara l’app. Usare Node 22 aggiornato, CMake 3.22+ e Xcode Command Line Tools su macOS per generare il pacchetto Mac. Dalla radice del repository:

```sh
npm ci --prefix native
npm run build --prefix native
npm run test:all --prefix native
npm ci --prefix desktop
npm test --prefix desktop
npm run dist:mac --prefix desktop
```

- `dist:mac`: compila il motore VST3 e prepara lo ZIP ARM64, con le stesse opzioni di firma locale del workflow.
- `build:audio`: compila soltanto il motore VST3 ARM64.
- `prepare:app`: copia l’interfaccia e prepara l’icona.
- `start`: prepara e apre l’app di sviluppo.
- `pack`: prepara una cartella applicazione senza installer sul sistema corrente.

Gli output sono in `desktop/release/`. L’app incorpora `dist/` dalla radice e non carica il sito pubblicato. Dopo modifiche al driver in `native/src`, eseguire di nuovo la build nativa prima della preparazione desktop. La configurazione Windows precedente resta nel progetto, ma non viene compilata dal workflow corrente.

## Struttura e prove

- `src/main.cjs`: finestra, menu macOS, ciclo di vita e controlli IPC.
- `src/preload.cjs`: API limitata per WING, OSC ed eventi, compresa la cronologia.
- `src/wing-socket.cjs`: socket WING e isolamento delle sessioni.
- `src/osc-sender.cjs`: codifica/invio OSC, risposta Show e chiusura dei socket.
- `src/audio-host.cjs`: processo VST3, protocollo JSON, catalogo, sessione locale e gestione degli errori.
- `src/bridge-policy.cjs`: validazione delle richieste provenienti dall’interfaccia.
- `scripts/prepare.mjs`: copia dell’interfaccia condivisa e preparazione dell’icona.

L’interfaccia usa l’origine locale `sculpt://app` e conserva i dati sul computer. Node è disabilitato nel renderer; restano sandbox, isolamento del contesto, blocco delle navigazioni e controllo del mittente IPC.

Le prove comprendono la suite desktop con UDP reali in loopback, menu Mac simulato, isolamento dei processi, salvataggio dei preset e protocollo dell’host VST3. Non è stato eseguito il binario 0.7.1 su un Mac fisico né collaudato questo aggiornamento con una WING reale. Vedi [risultati e procedura di verifica](../docs/RELEASE_0.7.1_MAC_M1.md).
