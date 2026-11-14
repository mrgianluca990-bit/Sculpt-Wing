# RTA WING in Sculpt Wing 0.7.1

Sculpt Wing riceve le **120 bande dell'analizzatore reale della WING** attraverso il trasporto nativo già usato per i meter. Non serve un'altra applicazione. Il grafico non viene generato dai fader, dalla curva dell'EQ o da un segnale dimostrativo.

Aprire l'EQ di un canale attiva automaticamente il RTA sulla sorgente di quel canale, al punto **PRE EQ**. Cambiando canale, la richiesta segue il nuovo canale; il grafico attende la conferma della sorgente e del tap effettivi, quindi un nuovo pacchetto del banco. La pagina **Meter / RTA → RTA** permette anche di seguire l'analizzatore globale senza cambiarne la sorgente.

## Come usarlo

1. Collega l'app desktop alla WING dalla pagina **Connessione WING**.
2. Attendi il completamento della lettura del banco: **Controllo** si abilita automaticamente dopo identità e sincronizzazione riuscite.
3. Apri l'EQ del canale. Il pulsante **RTA** è attivo all'apertura; non serve scegliere nuovamente il canale. Puoi passare da **PRE EQ** a **POST EQ** nel relativo selettore.
4. Controlla l'intestazione e lo stato del grafico: indicano la sorgente effettiva, il tap e l'arrivo di dati freschi. Per seguire invece la sorgente selezionata sul banco, apri **Meter / RTA → RTA** e scegli **RTA del banco**; questa modalità funziona anche in sola lettura.
5. Premi **RTA** per fermare la lettura oppure chiudi il pannello. La selezione ON/OFF è locale alla vista e torna al valore iniziale quando la vista viene ricreata.

La scelta manuale **Sola lettura** resta disponibile. In quel modo Sculpt non cambia sorgente o tap: l'overlay può mostrare un canale solo se la sorgente effettiva del banco coincide già. I tap degli effetti, del solo e del monitor hanno significati diversi dai tap di una strip e non vengono etichettati come canali.

Nel grafico del **WING EQ** lo spettro occupa la stessa area della curva EQ e si adatta alle dimensioni del grafico. Negli altri modelli EQ il dettaglio RTA è aperto automaticamente e resta richiudibile. La curva dell'equalizzatore rappresenta la regolazione dei filtri; lo spettro RTA rappresenta le bande misurate dal banco.

Se un firmware espone un dominio numerico diverso dal profilo riconosciuto e non fornisce etichette simboliche concordanti, compare **Fonte non associata al canale**. Il pulsante **Banco** apre il flusso globale; l'overlay sul canale resta vuoto finché la corrispondenza non può essere verificata.

## Un solo analizzatore condiviso

La WING dispone di un RTA condiviso con la console e con gli altri client. Il display della console può prendere la priorità sulla selezione remota. È un limite del comportamento del banco, documentato anche da [Mixing Station](https://mixingstation.app/ms-docs/mixers/behringer/wing/) e discusso dal [Behringer Team](https://ideas.behringer.com/p/bug-wing-edit-3-3-1-wing-fw-3-3-rta-still-not-working-as-expected-on-remote-devices).

Sculpt non modifica automaticamente il blocco del RTA, la visualizzazione Home della console, l'overlay del banco o l'autogain. In modalità **RTA del banco** segue il segnale effettivamente analizzato. Se una selezione remota identificata viene sostituita dalla console, l'overlay del canale si svuota e segnala l'occupazione; l'app non riscrive continuamente la propria preferenza.

Solo un pannello Sculpt può richiedere il flusso alla volta: ha precedenza l'ultimo pannello visibile e abilitato. Un dettaglio richiuso non lo richiede. Nel Compact, scorrere il grafico EQ fuori dall'area visibile sospende la sua richiesta; riportarlo in vista riattiva lo stesso canale e tap, aspettando nuovi dati. Questa rilevazione usa `IntersectionObserver` quando disponibile. Nascondere la finestra, disconnettersi o chiudere l'ultimo pannello attivo interrompe la richiesta RTA; i normali meter mantengono il loro ciclo indipendente.

## Identificazione di sorgente e tap

Il contratto di riferimento è [WING Remote Protocols V3.1.2-a](https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md), tabelle del nodo `/cfg/rta` e definizioni dei nodi.

| Percorso nativo | Tipo e intervallo documentati | Uso in Sculpt |
| --- | --- | --- |
| `/cfg/rta/$src` | Intero, 1–76, sola lettura | Sorgente effettiva, letta nuovamente durante il flusso. |
| `/cfg/rta/$tap` | Stringa, sola lettura | Tap effettivo, usato per verificare l'attribuzione dello spettro. |
| `/cfg/rta/rtasrc` | Intero, 0–76 | Sorgente richiesta automaticamente all'apertura dell'EQ o al cambio del canale, con profilo verificato dai metadati. |
| `/cfg/rta/rtatap` | Stringa | Tap richiesto, modificabile soltanto quando la selezione del canale è verificabile e la sessione è in Controllo. |

Il protocollo comprende tap come `IN`, `POST`, `FILT`, `PREEQ`, `POSTEQ`, `PREFDR`, `GATEK`, `DYNK`, `DYNXO`, `PRETAP`, `SOLO`, `MON.PH`, `MON.SPK`, `FXIN` e `FXOUT`. La vista globale mostra quello effettivamente ricevuto. L'EQ offre **PRE EQ** e **POST EQ** per una sorgente identificata.

Nelle definizioni native standard, un intero di tipo 4 espone minimo e massimo, senza etichette. Sculpt 0.7.1 riconosce il profilo con `$src` intero **1–76** e `rtasrc` intero **0–76**. Il protocollo pubblicato fornisce questi domini; l'[analisi originale di WING-Edit 3.3.4](https://github.com/floatingdino/wing-simulator/blob/957b4061e6f75412b5c5b731c46e518199ac6ae3/docs/research/rta.md) descrive la richiesta come indice della strip più uno e il confronto con la sorgente effettiva. L'[implementazione dello stesso autore](https://github.com/floatingdino/wing-simulator/blob/957b4061e6f75412b5c5b731c46e518199ac6ae3/crates/wing-engine/src/rta.rs) esplicita il seguente ordine:

| Sorgente richiesta / effettiva | Strip |
| --- | --- |
| 1–40 | CH 1–40 |
| 41–48 | AUX 1–8 |
| 49–64 | BUS 1–16 |
| 65–68 | MAIN 1–4 |
| 69–76 | MTX 1–8 |

È un profilo d'interoperabilità ricavato dalle fonti e dal codice citati, non una misura effettuata su una WING fisica in questa sessione. Lo zero non identifica una strip. Per abilitare la selezione automatica, i tipi e i limiti ricevuti dal firmware devono coincidere esattamente; non basta ricevere un numero compreso fra 1 e 76.

Le enum simboliche del firmware hanno precedenza: se il banco espone identità come `CH.1` o `BUS.9`, l'app usa i valori dei relativi elementi. I domini numerici GET e SET possono quindi essere diversi. Sorgente e tap vengono validati prima della prima scrittura; il grafico usa sempre la successiva conferma di `$src` e `$tap`.

I tap `FXIN`, `FXOUT`, `SOLO`, `MON.PH` e `MON.SPK` non vengono attribuiti a una strip dell'EQ. La nota sul diverso indice GET/SET di `/$ctl/$stat/selidx` riguarda quel parametro e non viene applicata ai parametri RTA.

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

Il grafico usa una **normalizzazione relativa a ogni fotogramma**: prende il valore massimo delle 120 bande e mostra una finestra di 8192 unità grezze, posizionando il massimo vicino al 94% dell'altezza. I valori sotto la finestra sono limitati al bordo inferiore. Un fotogramma composto interamente dal valore minimo `−32768` produce una traccia vuota.

Questo rende leggibile la distribuzione delle frequenze ma non misura il livello assoluto. Un aumento uniforme del segnale può lasciare pressoché identica la forma visualizzata. La scala non è dichiarata in dBFS o dB SPL e non permette di confrontare il volume assoluto fra due istanti. La linea che unisce le bande è una rappresentazione del dato ricevuto, senza ricostruire un FFT.

## Aggiornamenti, sospensione e dati scaduti

Il disegno ordinario dello spettro avviene al massimo dieci volte al secondo, con un solo tracciato SVG. Gli aggiornamenti RTA non vengono copiati nella scena e non richiedono il ridisegno dell'intero mixer. Un ridimensionamento del grafico adatta la traccia corrente ai nuovi limiti, senza cambiare sorgente o riaprire la sottoscrizione. Non esiste un ciclo di animazione del RTA offline.

Sorgente e tap effettivi vengono riletti circa una volta al secondo, senza sovrapporre le letture. Un cambio di sorgente, tap o schema invalida la traccia precedente; la successiva sottoscrizione usa un nuovo ID report. Vengono scartati pacchetti con ID obsoleto, lunghezza errata, valori non validi o timestamp incompatibili. La traccia viene rimossa se il fotogramma ha almeno 1,2 secondi o se la sorgente non è stata verificata da almeno 2,5 secondi.

La chiusura del pannello e i cambi di sessione invalidano anche le operazioni asincrone in corso: una risposta tardiva non può riattivare una vista chiusa. Il blocco grafico mostra lo stato effettivo, per esempio **Collega WING**, **Dati scaduti**, **Fonte non associata al canale** oppure **LIVE · relativo**. Nessun dato offline viene presentato come segnale proveniente dal mixer.

## Verifiche eseguite e collaudo da completare

I **13 test della sessione e del widget RTA** eseguiti per 0.7.1 coprono la selezione numerica ai confini di tutte e cinque le famiglie, i domini sconosciuti, le enum con valori GET/SET diversi, la sola lettura, il preflight, il cambio report, la sospensione, la scadenza, il cambio pannello, il ridimensionamento senza nuova richiesta e l'uscita/rientro del grafico nell'area visibile. Restano inoltre i test del codec e del client nativo per formato, dimensione del pacchetto, frequenze, valori signed, rinnovo e rilascio.

Queste verifiche usano fixture e trasporti controllati. **Il RTA 0.7.1 non è stato collaudato su una WING fisica durante questa implementazione.** Il collaudo hardware deve confrontare sorgente e tap mostrati, forma spettrale e cambi di selezione, includendo tutte le famiglie di strip, perdita di rete, riapertura del pannello e priorità del display della console. La scala verticale resta relativa.

## Fonti e tracciabilità

- [WING Remote Protocols V3.1.2-a, Patrick-Gilles Maillot](https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md): contratto nativo, formato e frequenze RTA, nodi `/cfg/rta`, definizioni dei metadati. Blob consultato: `3c1e19595dcb2d1ab7173b18127d606fd2c656ed`.
- [Mixing Station: Behringer WING](https://mixingstation.app/ms-docs/mixers/behringer/wing/): analizzatore condiviso e priorità del banco.
- [Discussione Behringer Team sulla priorità del RTA](https://ideas.behringer.com/p/bug-wing-edit-3-3-1-wing-fw-3-3-rta-still-not-working-as-expected-on-remote-devices): comportamento del display della console e dell'overlay Home.
- [Ricerca di floatingdino su WING-Edit 3.3.4 arm64](https://github.com/floatingdino/wing-simulator/blob/957b4061e6f75412b5c5b731c46e518199ac6ae3/docs/research/rta.md) e [implementazione RTA con ordine delle strip](https://github.com/floatingdino/wing-simulator/blob/957b4061e6f75412b5c5b731c46e518199ac6ae3/crates/wing-engine/src/rta.rs): analisi statica del parser, della richiesta e della conferma della sorgente; profilo numerico usato per l'interoperabilità. Commit consultato: `957b4061e6f75412b5c5b731c46e518199ac6ae3`. È ricerca originale sull'implementazione ufficiale e codice del suo autore, non una specifica Behringer né un collaudo hardware di Sculpt.
- [Note di metering di wing-mcp-server](https://github.com/bawaaaaah/wing-mcp-server/blob/main/docs/wing-protocol/04-metering.md): osservazioni dichiarate dall'autore sulla scala RTA `/128`, distinte dai meter `/256`. Sono materiale di confronto e non vengono usate per dichiarare una calibrazione in questa versione.

