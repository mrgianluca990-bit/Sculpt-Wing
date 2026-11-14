# OSC da Sculpt Wing a Sculpt Show

Sculpt Wing per Mac invia messaggi OSC via UDP direttamente dall’app. Non serve un’app ponte. Il collegamento OSC è indipendente dalla connessione alla WING e funziona anche quando il mixer è scollegato o in sola lettura.

## Collegamento sullo stesso Mac

1. Apri Sculpt Show e il progetto.
2. In Show apri **File → Audio/MIDI/Video Setup → OSC Control**.
3. Attiva **Enable OSC control**, lascia la porta **53000** e premi **Apply**.
4. In Sculpt Wing apri **OSC / Sculpt Show** dal menu.
5. La destinazione Show iniziale è già **127.0.0.1:53000**. Premi **Verifica Sculpt Show**.

La verifica invia soltanto `/sculpt/status`: non avvia, ferma o seleziona cue. Una risposta valida mostra nome dello show, numero di cue attive, disponibilità audio e identificativi della cue e della lista selezionate. È lo stato ricevuto al momento della verifica; non è un monitoraggio continuo.

Per Show su un altro computer, imposta il suo indirizzo IPv4 nella destinazione e attiva **Allow LAN controllers** nelle impostazioni OSC di Show. Se hai cambiato la porta in Show, imposta la stessa porta in Wing.

## Comandi Show predisposti

| Pulsante / preset | Indirizzo OSC | Argomenti |
| --- | --- | --- |
| GO | `/sculpt/go` | Nessuno |
| Stop All | `/sculpt/stopAll` | Nessuno |
| Pausa tutte | `/sculpt/pauseAll` | Nessuno |
| Riprendi tutte | `/sculpt/resumeAll` | Nessuno |
| Fade All | `/sculpt/fadeAll` | Nessuno |
| Cue successiva | `/sculpt/next` | Nessuno |
| Cue precedente | `/sculpt/previous` | Nessuno |
| Lista successiva | `/sculpt/nextList` | Nessuno |
| Avvia / ferma / pausa / riprendi / fade / seleziona cue | `/sculpt/cue/UUID/fire`, `stop`, `pause`, `resume`, `fade`, `select` | Nessuno |
| Loop cue ON / OFF | `/sculpt/cue/UUID/loop` | Booleano OSC `T` / `F` |
| Avvia / ferma / fade lista | `/sculpt/list/UUID/play`, `stop`, `fade` | Nessuno |
| Avvia cue per alias | `/sculpt/trigger/alias` | Nessuno |

Per i comandi di una cue o lista specifica, incolla il suo **UUID**, non il numero visualizzato della cue. Lo trovi nelle impostazioni OSC di Show o nella risposta a **Verifica Sculpt Show**. Un alias corrisponde al trigger OSC configurato nella cue in Show; ammette lettere, numeri, punto, trattino e underscore, fino a 64 caratteri.

I preset corrispondono al ricevitore di **Sculpt Show 1.0.0 RC3, build 3**, verificato nel repository al commit `cc10eb537b61720662b0482083be24b39f0c707d`, branch `fix/marker-loop-bridge-workspace`. Al controllo del 14 novembre 2026, `main` e `develop` puntavano a una versione precedente senza questi file OSC.

Fonti del contratto:

- [OSCControlPacket.swift — indirizzi, tipi e decodifica](https://github.com/mrgianluca990-bit/Sculpt-Show/blob/cc10eb537b61720662b0482083be24b39f0c707d/Sources/SculptShowCore/OSCControlPacket.swift).
- [OSCControl.swift — porta, impostazioni, risposta di stato e azioni](https://github.com/mrgianluca990-bit/Sculpt-Show/blob/cc10eb537b61720662b0482083be24b39f0c707d/Sources/SculptShowApp/OSCControl.swift).
- [CueTriggers.swift — regole degli alias](https://github.com/mrgianluca990-bit/Sculpt-Show/blob/cc10eb537b61720662b0482083be24b39f0c707d/Sources/SculptShowCore/CueTriggers.swift).

## Assegnare OSC alle macro

Su un pulsante macro vuoto scegli **Invia OSC / Sculpt Show**, quindi il profilo e il comando. Puoi anche preparare il messaggio nella pagina OSC e usare **Aggiungi alla macro**: il messaggio viene aggiunto alla sequenza scelta senza cancellare le azioni presenti. L’assegnazione non invia comandi.

Per impostazione iniziale, le macro seguono la destinazione del rispettivo profilo nella pagina OSC. Puoi scegliere **Destinazione specifica per questa azione** e indicare un altro IP e porta. Nomi, azioni e destinazioni vengono conservati sul dispositivo.

Una macro può combinare comandi WING, messaggi OSC, attese e aperture di menu. Tutte le azioni vengono verificate prima dell’esecuzione. Una destinazione o un messaggio OSC non valido, un UUID mancante o un’azione WING successiva non valida impediscono di iniziare la sequenza. La destinazione OSC viene fissata durante questa preparazione e non cambia a metà macro.

Le macro con soli comandi OSC e navigazione non richiedono **Controllo WING**. Le sequenze che modificano il mixer conservano i controlli della connessione e il riscontro delle scritture WING.

## OSC personalizzato

Scegli il profilo **OSC personalizzato** e indica un percorso letterale, per esempio `/lighting/scene`. Puoi aggiungere fino a 32 argomenti:

- **Intero (i)**: intero con segno a 32 bit.
- **Decimale (f)**: numero finito a 32 bit.
- **Stringa (s)**: testo UTF-8, senza terminatori NUL incorporati.
- **Vero (T)** e **Falso (F)**: booleani OSC senza payload numerico.

La destinazione ammette un indirizzo IPv4 unicast o `localhost`, con porta da 1 a 65535. I messaggi hanno dimensione massima di 16 KB. Non vengono generati bundle temporizzati o indirizzi con wildcard.

## Cosa significa “inviato”

Un normale invio OSC conferma che il sistema ha accettato il datagramma UDP; **non conferma che Show o un altro destinatario abbia eseguito il comando**. L’interfaccia indica questa distinzione. Un destinatario chiuso può non produrre un errore di invio UDP.

**Verifica Sculpt Show** richiede invece una risposta OSC valida dall’IP e dalla porta scelti. Una risposta di errore, un pacchetto non valido o un timeout vengono mostrati come errore, senza dichiarare Show confermato.

I messaggi già inviati non possono essere ritirati e **Cmd+Z non invia comandi OSC inversi**. Le macro interrompono le azioni non ancora eseguite quando viene richiesto Stop o quando si verifica un errore.

La versione aperta in un normale browser permette di preparare le assegnazioni; l’invio UDP richiede il trasporto dell’app Mac. Nessun collegamento WING fittizio viene usato per simulare un invio OSC riuscito.

## Verifica della consegna

La verifica automatica include codifica OSC, invio e ricezione UDP reali in loopback, risposta Show simulata secondo il contratto RC3, timeout, rifiuto dei peer estranei, limiti, chiusura dei socket, isolamento IPC e assegnazione delle macro. Il test di rete è locale all’ambiente di sviluppo. Il collaudo fra le app aperte sul Mac e con il progetto Show dell’utente resta da eseguire.
