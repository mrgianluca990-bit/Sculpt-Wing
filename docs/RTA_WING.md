# RTA WING in Sculpt Wing 0.6.8

Sculpt Wing riceve le **120 bande dell'analizzatore reale della WING** attraverso il trasporto nativo già usato per i meter. Non serve un'altra applicazione. Il grafico non viene generato dai fader, dalla curva dell'EQ o da un segnale dimostrativo.

La pagina **Meter / RTA → RTA** mostra l'analizzatore globale del banco. L'associazione automatica al canale dell'EQ richiede un'identificazione esplicita fornita dal firmware: con i soli indici numerici documentati dal protocollo, Sculpt mostra la sorgente come **Sorgente WING #N** e non inventa una corrispondenza con CH, AUX, BUS, MAIN o MTX.

## Come usarlo

1. Collega l'app desktop alla WING dalla pagina **Connessione WING**.
2. Apri **Meter / RTA**, quindi la scheda **RTA**. Il pulsante **RTA** è attivo all'apertura del pannello.
3. Lascia selezionato **RTA del banco**. Sculpt legge la sorgente e il punto di prelievo effettivi della console; questa modalità funziona anche in sola lettura e non modifica la sorgente del banco.
4. Seleziona sulla WING il segnale e il punto di analisi che vuoi osservare. Controlla l'intestazione del grafico in Sculpt: riporta la sorgente effettiva e il tap ricevuti, per esempio **Sorgente WING #1 · PRE EQ · scala relativa**.
5. Premi **RTA** per fermare la lettura oppure chiudi il pannello. La selezione ON/OFF è locale alla vista e torna al valore iniziale quando la vista viene ricreata.

Un numero di sorgente non dimostra che quel segnale appartenga all'omonimo canale: **Sorgente WING #1** non viene presentata come **CH 1**. In particolare i tap degli effetti, del solo e del monitor hanno significati diversi dai tap di una strip.

Nel grafico del **WING EQ** il controllo RTA è compatto e l'eventuale spettro occupa la stessa area della curva EQ. Negli altri modelli EQ il dettaglio RTA è richiudibile e parte chiuso. La curva dell'equalizzatore rappresenta la regolazione dei filtri; lo spettro RTA rappresenta invece le bande misurate dal banco.

Se compare **Fonte non associata al canale**, il pulsante **Banco** apre direttamente **Meter / RTA → RTA**. È il percorso previsto quando il firmware espone soltanto un indice numerico. L'overlay sul canale resta vuoto finché la corrispondenza non può essere verificata.

## Un solo analizzatore condiviso

La WING dispone di un RTA condiviso con la console e con gli altri client. Il display della console può prendere la priorità sulla selezione remota. È un limite del comportamento del banco, documentato anche da [Mixing Station](https://mixingstation.app/ms-docs/mixers/behringer/wing/) e discusso dal [Behringer Team](https://ideas.behringer.com/p/bug-wing-edit-3-3-1-wing-fw-3-3-rta-still-not-working-as-expected-on-remote-devices).

Sculpt non modifica automaticamente il blocco del RTA, la visualizzazione Home della console, l'overlay del banco o l'autogain. In modalità **RTA del banco** segue il segnale effettivamente analizzato. Se una selezione remota identificata viene sostituita dalla console, l'overlay del canale si svuota e segnala l'occupazione; l'app non riscrive continuamente la propria preferenza.

Solo un pannello Sculpt può richiedere il flusso alla volta: ha precedenza l'ultimo pannello visibile e abilitato. Un dettaglio richiuso non lo richiede. Nascondere la finestra, disconnettersi o chiudere l'ultimo pannello attivo interrompe la richiesta RTA; i normali meter mantengono il loro ciclo indipendente.

## Identificazione di sorgente e tap

Il contratto di riferimento è [WING Remote Protocols V3.1.2-a](https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md), tabelle del nodo `/cfg/rta` e definizioni dei nodi.

| Percorso nativo | Tipo e intervallo documentati | Uso in Sculpt |
| --- | --- | --- |
| `/cfg/rta/$src` | Intero, 1–76, sola lettura | Sorgente effettiva, letta nuovamente durante il flusso. |
| `/cfg/rta/$tap` | Stringa, sola lettura | Tap effettivo, usato per verificare l'attribuzione dello spettro. |
| `/cfg/rta/rtasrc` | Intero, 0–76 | Sorgente richiesta; nessuna conversione automatica da un ID di canale. |
| `/cfg/rta/rtatap` | Stringa | Tap richiesto, modificabile soltanto quando la selezione del canale è verificabile e la sessione è in Controllo. |

Il protocollo comprende tap come `IN`, `POST`, `FILT`, `PREEQ`, `POSTEQ`, `PREFDR`, `GATEK`, `DYNK`, `DYNXO`, `PRETAP`, `SOLO`, `MON.PH`, `MON.SPK`, `FXIN` e `FXOUT`. La vista globale mostra quello effettivamente ricevuto. L'EQ offre **PRE EQ** e **POST EQ** per una sorgente identificata.

Nelle definizioni native standard, un parametro intero di tipo 4 espone minimo e massimo, senza etichette per ogni valore. Le definizioni enum di tipo 5 e 6 hanno invece elementi con etichette. Il contratto standard di `rtasrc` e `$src` non fornisce dunque una tabella verificata numero → strip.

L'app supporta una capacità condizionale: se il firmware restituisce un'identità simbolica esplicita, per esempio `CH.1` o `BUS.9`, può verificare il canale effettivo e mostrare l'overlay. Per **richiedere** un altro canale servono etichette esplicite e concordanti nei metadati della sorgente effettiva e della sorgente richiesta. Il valore da scrivere viene preso dal relativo elemento dei metadati, senza supporre che i due domini numerici coincidano. I metadati e i valori di sorgente e tap vengono validati prima della prima scrittura.

Questa capacità non costituisce una promessa sulle etichette disponibili nei firmware correnti. Con i normali metadati interi la modalità utilizzabile resta **RTA del banco**. I tap `FXIN`, `FXOUT`, `SOLO`, `MON.PH` e `MON.SPK` non vengono attribuiti a una strip dell'EQ.

La nota sul diverso indice GET/SET di `/$ctl/$stat/selidx` riguarda quel parametro e non viene applicata ai parametri RTA. L'ordine delle famiglie usato per i meter delle strip non viene usato come prova della mappatura dell'analizzatore.

## Formato del flusso e frequenze

Il riferimento per questi dati è la sezione **Channel 3: Metering**, comprese le tabelle **Meter Request Tokens**, **Meter Data** e le frequenze RTA, del [protocollo WING](https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md).

| Proprietà | Implementazione |
| --- | --- |
| Richiesta | Canale nativo TCP 3, token singolo `0xAA`, senza byte indice. |
| Risposta | UDP: ID report big-endian di 4 byte, seguito dai dati nell'ordine della richiesta. |
| Dati RTA | 120 interi con segno, 16 bit big-endian: 240 byte preservati come valori grezzi. |
| Frequenze | Centri delle bande a semitoni da E0 a D#10, circa 20,60 Hz–19,91 kHz. |
| Riferimento | A4 = 440 Hz, indice 53 contando da zero. |
| Rinnovo | Richiesta corrente rinnovata ogni 2,5 secondi; il protocollo richiede il rinnovo prima di 5 secondi. |

Per l'indice `i` da 0 a 119, il centro della banda è `440 × 2^((i − 53) / 12)` Hz. Si tratta di bande a semitoni: non sono bin FFT equidistanti né campioni audio PCM.

RTA e meter condividono la stessa sottoscrizione e gli stessi socket. Con tutte le 76 strip, il payload UDP completo è `4 + 76 × 16 + 120 × 2 = 1460` byte. Sommando i normali header IPv4 e UDP si arriva a 1488 byte, entro un MTU Ethernet di 1500 byte. La verifica riguarda questo formato; non assume MTU maggiori né aggiunge frammentazione applicativa.

## Scala verticale relativa

I valori ricevuti vengono conservati senza convertirli nella scala dei meter di livello. La documentazione e le implementazioni consultate distinguono la scala dei meter ordinari da quella del RTA; la verifica sul banco rimane necessaria prima di dichiarare una misura calibrata.

Il grafico 0.6.8 usa una **normalizzazione relativa a ogni fotogramma**: prende il valore massimo delle 120 bande e mostra una finestra di 8192 unità grezze, posizionando il massimo vicino al 94% dell'altezza. I valori sotto la finestra sono limitati al bordo inferiore. Un fotogramma composto interamente dal valore minimo `−32768` produce una traccia vuota.

Questo rende leggibile la distribuzione delle frequenze ma non misura il livello assoluto. Un aumento uniforme del segnale può lasciare pressoché identica la forma visualizzata. La scala non è dichiarata in dBFS o dB SPL e non permette di confrontare il volume assoluto fra due istanti. La linea che unisce le bande è una rappresentazione del dato ricevuto, senza ricostruire un FFT.

## Aggiornamenti, sospensione e dati scaduti

Il disegno dello spettro avviene al massimo dieci volte al secondo, con un solo tracciato SVG. Gli aggiornamenti RTA non vengono copiati nella scena e non richiedono il ridisegno dell'intero mixer. Non esiste un ciclo di animazione del RTA offline.

Sorgente e tap effettivi vengono riletti circa una volta al secondo, senza sovrapporre le letture. Un cambio di sorgente, tap o schema invalida la traccia precedente; la successiva sottoscrizione usa un nuovo ID report. Vengono scartati pacchetti con ID obsoleto, lunghezza errata, valori non validi o timestamp incompatibili. La traccia viene rimossa se il fotogramma ha almeno 1,2 secondi o se la sorgente non è stata verificata da almeno 2,5 secondi.

La chiusura del pannello e i cambi di sessione invalidano anche le operazioni asincrone in corso: una risposta tardiva non può riattivare una vista chiusa. Il blocco grafico mostra lo stato effettivo, per esempio **Collega WING**, **Dati scaduti**, **Fonte non associata al canale** oppure **LIVE · relativo**. Nessun dato offline viene presentato come segnale proveniente dal mixer.

## Verifiche eseguite e collaudo da completare

Sono stati aggiunti **14 test RTA**: 3 sul codec, 1 sul client nativo, 7 sulla sessione e 3 sulla UI. Coprono formato, dimensione del pacchetto, frequenze, valori signed, rinnovo e rilascio, cambio report, metadati numerici senza mappatura, metadati simbolici con domini GET/SET diversi, preflight, sospensione, scadenza, selezione del pannello e assenza di spettro offline. I test mirati complessivi dei file interessati hanno superato 14 casi nativi e 18 casi web; è passato anche il controllo TypeScript.

Queste verifiche usano fixture e trasporti controllati. **Il RTA 0.6.8 non è stato collaudato su una WING fisica durante questa implementazione.** Il prossimo collaudo deve confrontare la sorgente e il tap mostrati, la forma spettrale e i cambi di selezione con il banco collegato, includendo perdita di rete, riapertura del pannello e priorità del display della console. La calibrazione verticale e un'eventuale mappatura numerica delle strip richiedono prove ulteriori prima di essere abilitate.

## Fonti e tracciabilità

- [WING Remote Protocols V3.1.2-a, Patrick-Gilles Maillot](https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md): contratto nativo, formato e frequenze RTA, nodi `/cfg/rta`, definizioni dei metadati. Blob consultato: `3c1e19595dcb2d1ab7173b18127d606fd2c656ed`.
- [Mixing Station: Behringer WING](https://mixingstation.app/ms-docs/mixers/behringer/wing/): analizzatore condiviso e priorità del banco.
- [Discussione Behringer Team sulla priorità del RTA](https://ideas.behringer.com/p/bug-wing-edit-3-3-1-wing-fw-3-3-rta-still-not-working-as-expected-on-remote-devices): comportamento del display della console e dell'overlay Home.
- [Ricerca di floatingdino su WING-Edit 3.3.4 arm64](https://github.com/floatingdino/wing-simulator/blob/main/docs/research/rta.md): analisi statica del parser di 120 parole big-endian, della scala e della richiesta dell'analizzatore. Blob consultato: `b7abc65ca569019963ac416a4e27eab420da522d`. È una ricerca sull'implementazione ufficiale, non una specifica Behringer né un collaudo hardware di Sculpt. Il collegamento locale `rtasrc = selidx + 1` non dimostra da solo le soglie delle famiglie di canali.
- [Note di metering di wing-mcp-server](https://github.com/bawaaaaah/wing-mcp-server/blob/main/docs/wing-protocol/04-metering.md): osservazioni dichiarate dall'autore sulla scala RTA `/128`, distinte dai meter `/256`. Sono materiale di confronto e non vengono usate per dichiarare una calibrazione in questa versione.

