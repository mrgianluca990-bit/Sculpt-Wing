# Sculpt Wing per Mac M1 · 0.6.8

L’app desktop usa la stessa interfaccia del progetto web e comunica direttamente con la WING tramite TCP/UDP. Include anche un trasporto OSC per Sculpt Show o altri destinatari. Le due connessioni sono indipendenti; non serve un’app ponte.

## Pacchetto generato da GitHub

Il workflow **Build Sculpt Wing - Mac M1**, in `.github/workflows/build-desktop.yml`, compila il solo target **Apple Silicon ARM64**. L’artifact **Sculpt-Wing-Mac-M1** contiene `Sculpt-Wing-0.6.8-mac-arm64.zip`, con **Sculpt Wing.app**. Estrai l’app e spostala in Applicazioni dopo aver chiuso la versione precedente. L’app incorpora il runtime: non richiede Node.js sul computer dell’utente.

Il workflow esegue prima i test nell’ambiente Linux e poi quelli del trasporto sul runner Mac; compila esplicitamente ARM64, verifica l’architettura dell’eseguibile e la firma ad hoc. Non applica Developer ID o notarizzazione e non pubblica automaticamente una Release. La nuova compilazione macOS deve essere eseguita dopo il caricamento dei sorgenti: questa consegna non contiene un binario Mac già collaudato.

Per il caricamento seguire [CARICA_SU_GITHUB.md](../CARICA_SU_GITHUB.md).

## Collegare la WING

1. Apri **WING / Connessione** e inserisci l’IPv4 locale del mixer.
2. Collega il banco e attendi la lettura di identità, parametri e meter. La sessione parte in sola lettura.
3. Attiva **Controllo** per modificare i valori.

Il controllo WING usa la porta 2222 TCP/UDP e una porta UDP locale assegnata dal sistema per i meter. Se macOS richiede il permesso per la rete locale, concedilo all’app. Dopo sospensione, chiusura o ricaricamento della finestra la sessione termina: ricollega il banco per rileggere lo stato. La demo non viene inviata automaticamente alla WING.

## EQ, pan e RTA

Il cambio canale mantiene il modulo dell’editor aperto. Le bande EQ usano le coordinate effettive del grafico ridimensionato e conservano il punto di presa. Pan sopra i fader: trascina o usa le frecce; doppio clic per il centro. Un gesto resta una sola operazione Annulla.

Lo spettro RTA arriva direttamente dal trasporto UDP WING già integrato. Si attiva soltanto mentre una vista RTA è aperta e visibile. La console dispone di un analizzatore condiviso: la sorgente effettiva è riportata, e un indice senza mappatura verificata non viene presentato come il canale selezionato. Scala relativa; prova hardware ancora necessaria. Vedi [RTA_WING.md](../docs/RTA_WING.md).

## OSC e Sculpt Show

Apri **OSC / Sculpt Show** dal menu del banco. Il profilo Show propone `127.0.0.1:53000` per le app aperte sullo stesso Mac. Abilita OSC Control in Show RC3, applica le impostazioni e usa **Verifica Sculpt Show**: richiede soltanto lo stato, senza avviare cue.

GO, Stop All, pausa, ripresa, fade e navigazione sono già predisposti. Si possono aggiungere alle macro anche comandi per cue/liste specifiche e messaggi OSC personalizzati. L’invio UDP non richiede Controllo WING. Un invio riuscito certifica l’accettazione del datagramma, non l’esecuzione del comando nel destinatario; la verifica di stato attende invece una risposta valida.

La pagina browser permette di preparare le assegnazioni, ma per inviare UDP serve l’app desktop. I messaggi OSC già inviati non vengono annullati con Cmd+Z. Contratto, versione Show e istruzioni: [OSC_SCULPT_SHOW.md](../docs/OSC_SCULPT_SHOW.md).

## Annulla e ripristina

**Cmd+Z** e **Maiusc+Cmd+Z** richiamano la cronologia dell’app dal menu macOS e dalla tastiera. Un trascinamento crea una sola operazione. Nei campi di testo resta l’annullamento nativo della digitazione.

In live, Undo/Redo passa dalle verifiche di stato e dal riscontro delle scritture WING. Un valore modificato esternamente o una sessione cambiata impediscono il ripristino obsoleto. Il cambio di algoritmo live richiede un preset; i trigger esterni, come OSC e registrazione, non vengono invertiti.

## Compilare dal progetto

Questi comandi servono a chi prepara l’app. Usare Node 22 aggiornato e un ambiente macOS per generare il pacchetto Mac. Dalla radice del repository:

```sh
npm ci --prefix native
npm run build --prefix native
npm run test:all --prefix native
npm ci --prefix desktop
npm test --prefix desktop
npm run dist:mac --prefix desktop
```

- `dist:mac`: ZIP ARM64, con le stesse opzioni di firma locale del workflow.
- `prepare:app`: copia l’interfaccia e prepara l’icona.
- `start`: prepara e apre l’app di sviluppo.
- `pack`: prepara una cartella applicazione senza installer sul sistema corrente.

Gli output sono in `desktop/release/`. L’app incorpora `dist/` dalla radice e non carica il sito pubblicato. Dopo modifiche al driver in `native/src`, eseguire di nuovo la build nativa prima della preparazione desktop. La configurazione Windows precedente resta nel progetto, ma non viene compilata dal workflow corrente.

## Struttura e prove

- `src/main.cjs`: finestra, menu macOS, ciclo di vita e controlli IPC.
- `src/preload.cjs`: API limitata per WING, OSC ed eventi, compresa la cronologia.
- `src/wing-socket.cjs`: socket WING e isolamento delle sessioni.
- `src/osc-sender.cjs`: codifica/invio OSC, risposta Show e chiusura dei socket.
- `src/bridge-policy.cjs`: validazione delle richieste provenienti dall’interfaccia.
- `scripts/prepare.mjs`: copia dell’interfaccia condivisa e preparazione dell’icona.

L’interfaccia usa l’origine locale `sculpt://app` e conserva i dati sul computer. Node è disabilitato nel renderer; restano sandbox, isolamento del contesto, blocco delle navigazioni e controllo del mittente IPC.

Le prove della consegna comprendono **28 test desktop**, inclusi UDP reali in loopback e Undo/Redo del menu Mac con shell simulata. Non è stato eseguito il binario 0.6.8 su un Mac fisico, né collegata una WING o l’app Show reale. Vedi [risultati completi](../docs/RELEASE_0.6.8_MAC_M1.md) e [collaudo WING/Show](../docs/COLLAUDO_0.6.8.md).
