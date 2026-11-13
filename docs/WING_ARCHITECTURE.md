# Sculpt Wing — architettura per il controllo completo della WING

Analisi del codice esistente, 13 novembre 2026. Nessun file dell’app è stato modificato e non sono stati eseguiti nuovi test o collegamenti hardware in questa analisi.

## Esito

La richiesta di tutti i plugin con editor dedicati, I/O e funzioni del banco richiede un ampliamento del modello e del driver. La grafica a due file può rimanere il punto d’ingresso. Il numero di fader visibili non deve determinare il perimetro delle funzioni disponibili.

Esistono attualmente **due implementazioni separate**:

1. La demo web rossa 0.3 in `/workspace/sites/sculpt-control-offline` è JavaScript locale. Mostra 76 strip, editor semplificati e SOF, conserva lo stato nel browser e non importa alcun driver WING.
2. Il progetto React/Capacitor 0.1 in `/workspace/scratch/a1956412ee90/sculpt-control` contiene il trasporto nativo TCP/UDP e un controller per le sole mandate monitor. La sua UI non è quella della demo rossa. Il progetto Xcode è attualmente configurato per iPad (`TARGETED_DEVICE_FAMILY = 2`), non come app universale iPhone/iPad.

Quindi non basta aggiungere un pulsante Connessione alla demo pubblicata. Occorre portare il suo layout approvato su un modello condiviso con il driver, conservando i due modi d’uso: simulazione nel browser e collegamento diretto nell’app installata.

## Stato reale del codice

| Area | Demo web 0.3 | Progetto nativo 0.1 | Intervento necessario |
|---|---|---|---|
| Stato | Oggetti strip fissi, `localStorage` | `ControlStore` con 8 CH visibili e 1 BUS selezionato | Stato normalizzato per entità e parametro, separato dalla vista |
| Scritture | Mutazioni locali immediate | Solo CH→BUS `lvl/on` e BUS `fdr` | Comandi tipizzati per ciascun dominio supportato |
| Connessione | Nessuna | IP locale manuale, identità, TCP/UDP, sessioni | Conservare la base e ampliare discovery/capabilities |
| Plugin | Un EQ e un compressore generici; gate ridotto | Nessun controllo FX/EQ/dynamics | Catalogo algoritmi, istanze, parametri e interfacce specifiche |
| Routing | Sole direzioni logiche delle mandate | Nessun I/O | Sorgenti, assegnazioni, insert, patch di ingresso e uscita come entità distinte |
| Meter | Animazioni | 8 CH e 1 BUS, L/R ridotti al massimo | Meter per famiglia, stereo separato, GR e analisi secondo disponibilità |
| Scene/preset | Nessuna gestione | Nessuna gestione | Dominio dedicato a operazioni console e progetti offline |
| Integrazione Sculpt | Quattro spazi macro | Nessun bridge esterno implementato | API di azioni comune a UI, macro e future integrazioni |

### Componenti del nativo da riutilizzare

- `WingTransport` separa il trasferimento dei byte dalla semantica del banco.
- `NativeTransport` e `WingSocketPlugin.swift` associano traffico, errori e chiusure a request/session ID, chiudono la sessione entrando in background e respingono eventi tardivi.
- `WingStreamDecoder` gestisce il flusso TCP spezzato o aggregato, gli escape e le definizioni dei nodi.
- `NodeDefinition` possiede già nome, tipo, flag di sola lettura, min/max, passi, lunghezza delle stringhe ed elenchi enum.
- `WingClient` risolve i path a runtime e non presume ID numerici invariabili fra firmware.
- Le scritture sono seguite da rilettura; l’invio di un pacchetto non è trattato come conferma del mixer.
- `ControlStore` usa epoche di connessione/vista e rappresenta valori sconosciuti con `null`.
- `DemoDriver` implementa già il medesimo contratto del driver reale, ma soltanto per il piccolo dominio monitor iniziale.

Questa è una base riutilizzabile, non una verifica che il controllo completo sia già funzionante. `docs/VERIFICHE.md` del nativo dichiara build Swift, installazione e connessione hardware non eseguite.

### Limiti concreti da rimuovere

In `src/wing/client.ts`, `validateWrite` consente esclusivamente:

- `/ch/{1..40}/send/{1..16}/lvl`
- `/ch/{1..40}/send/{1..16}/on`
- `/bus/{1..16}/fdr`

Il codec `encodeSet` sa già codificare stringhe, interi e float, ma il metodo pubblico `set` è limitato a scritture numeriche sui tre path sopra. Non gestisce ancora la scelta di modelli FX, enum, nomi, routing, headamp o comandi console.

`WingDriver` espone `get`, `set` e meter del dominio ridotto, ma non espone la scoperta delle definizioni dei nodi. I metadati esistono internamente al client: occorre renderli disponibili al livello applicativo con una API esplicita.

Il client memorizza `children`, `paths` e alias fino alla fine della sessione. Questo è insufficiente per i plugin. Il protocollo V3.1.2-a mostra che cambiando `/fx/1/mdl` da `NONE` a `PIA` cambia l’insieme dei figli di `/fx/1`. Serve un’invalidazione del sottoalbero interessato e una nuova lettura di schema e valori dopo ogni cambio modello, compresi quelli fatti dalla console o da un altro controller.

`ControlStore` conserva e aggiorna solo la vista corrente con regex per CH nome/colore/send e BUS nome/fader. Ricevere un valore dal driver non significa che il resto del banco venga rappresentato o aggiornato. Un archivio di stato generale deve sostituire questi adattamenti specifici, lasciando ai selettori di vista il compito di estrarre gli otto o dodici canali mostrati.

La demo rossa imposta `−90` come sentinella di meno infinito; il nativo utilizza `−144`. Anche i range di EQ/dinamica, il colore RGB e il nome fino a 40 caratteri sono scelte dimostrative locali. Prima del collegamento occorre usare range, enum e codifica del parametro effettivo, mantenendo le trasformazioni grafiche in un livello distinto.

## Architettura proposta

### 1. Un solo nucleo di controllo

Portare a un nucleo condiviso questi elementi:

- identità console, modello, firmware e sessione;
- registry di entità e definizioni dei parametri;
- stato noto, stato in lettura, anteprima del gesto e scrittura in attesa;
- API di comandi validati;
- profili per simulazione offline;
- servizi di routing, plugin, scene e meter.

La UI rossa, l’editor, le macro e le integrazioni future devono usare questa API. Nessun componente grafico deve aprire socket, costruire pacchetti WING o mantenere una seconda copia autonoma dei valori live.

Il sito può distribuire lo stesso frontend in modalità simulazione. Il bundle iOS può distribuire il frontend con il trasporto nativo. La PWA nel browser non diventa un client TCP/UDP mediante un normale WebSocket. Per conservare il setup mixer + router + tablet, il trasporto nativo rimane la direzione già scelta.

### 2. Entità e parametri indipendenti dal mixer a fader

Le entità non devono essere soltanto `inputs[]` e `outputs[]`. Servono almeno famiglie per canali, AUX, BUS, MAIN, MTX, sorgenti, porte fisiche, gruppi, istanze di processing, slot FX, monitor e configurazione.

Ogni parametro deve portare valore e metadati distinti: path logico, valore conosciuto, tipo, enum/range, unità, sola lettura, disponibilità, origine del valore e revisione dello schema. La selezione SOF è stato della UI; la mandata è stato del banco e può essere aperta anche fuori dal mixer.

La vista a due file conserva quindi i suoi controlli compatti, mentre I/O, rack FX e Setup aprono pagine o pannelli dedicati.

### 3. Catalogo plugin e interfacce dedicate

Per ogni algoritmo va registrato un identificativo del protocollo, il dominio/slot consentito, i parametri, i formati di visualizzazione, i controlli e l’editor associato. L’istanza contiene modello selezionato, bypass/mix, valori, meter e collegamenti di insert o send/return disponibili.

Un editor dedicato deve riprendere i controlli e l’organizzazione del plugin effettivo: manopole, switch, selezioni discrete, curve e meter dove applicabili. I metadati del protocollo possono descrivere parametri e range; non costituiscono automaticamente una pagina grafica remota già pronta da incorporare.

Il cambio algoritmo deve essere una sequenza applicativa: sospendere i vecchi binding, inviare il cambio quando richiesto, leggere il modello effettivo, invalidare il sottoalbero, acquisire nuovo schema/valori, montare l’editor corretto. Una modifica esterna deve attivare lo stesso percorso. Le operazioni in coda riferite alla vecchia revisione del plugin vanno scartate.

Un pannello generato dai metadati può servire per diagnostica e firmware nuovi; non soddisfa da solo il requisito dell’utente di avere l’interfaccia specifica di ogni plugin.

### 4. Routing come grafo di assegnazioni

I/O non è un’estensione del campo `send.pre`. Occorre distinguere porta hardware, sorgente WING, ingresso del canale, punto di prelievo, insert, destinazione e uscita fisica. Una stessa sorgente può alimentare più destinazioni, e le operazioni devono riflettere le dipendenze effettive dichiarate dalla console.

Il controller dovrebbe esporre operazioni semantiche quali assegnazione della sorgente, cambio Main/Alt, assegnazione di un’uscita o inserimento di un FX. La UI le presenta in tabelle/patchbay; la conversione ai path WING resta nel servizio di routing.

La presenza di una scheda Dante è una capacità hardware da rappresentare. Il routing interno della WING verso la scheda non dimostra il controllo delle subscription fra dispositivi Dante: quest’ultimo rimane un perimetro distinto finché non verificato.

### 5. Sincronizzazione e prestazioni

Conservare la serializzazione delle richieste ambigue del protocollo corrente. Estendere l’API applicativa a letture per sottoalbero e gruppi di parametri senza introdurre richieste concorrenti che non possono essere associate con sicurezza alle risposte.

Caricare prima mixer visibile, slot/plugin aperto e pagina I/O corrente; poi altri valori in background. Usare una coda con priorità, limiti e accorpamento delle variazioni continue di uno stesso parametro. Non trasformare un trascinamento in centinaia di scritture da riprodurre dopo il rilascio o la riconnessione.

La UI distingue anteprima del gesto e valore confermato. Il readback deve usare la tolleranza/quantizzazione del parametro, non il solo confronto fisso `0,11 dB` oggi usato per fader e send. Durante modifiche concorrenti da banco/app è necessario un comportamento esplicito di conflitto; un comando non confermato potrebbe essere arrivato e non deve essere ripetuto ciecamente.

Il piano meter attuale supporta otto CH e un BUS. Per il banco completo servono selezioni per famiglia e per editor, canali stereo separati, freshness e limitazione del flusso. Le parole gate/dynamics del pacchetto attuale sono decodificate solo nella parte utile ai meter di livello; non costituiscono ancora un pannello GR funzionante.

### 6. Firmware e hardware

Separare identità console e schema runtime dalle definizioni visive del catalogo. Un algoritmo conosciuto può ottenere l’editor dedicato, mentre la disponibilità concreta dipende dal nodo/enum realmente esposto dalla console collegata.

I profili offline devono essere dichiarati per versione del protocollo e modello. Il profilo dimostrativo non deve sovrascrivere i valori o le capacità scoperte collegandosi alla WING Rack reale. Nuovi firmware richiedono invalidazione dei dati di sessione e un rapporto dei nodi non coperti, non l’assunzione che un ID precedente significhi ancora la stessa cosa.

### 7. Offline, scene e progetti

Separare tre oggetti:

- **Demo:** stato simulato liberamente modificabile per provare l’interfaccia.
- **Progetto offline:** configurazione intenzionale salvata dall’utente, con versione e perimetro.
- **Sessione live:** valori letti dalla console, validi soltanto per la sessione corrente.

Alla connessione, lo stato live viene letto dal mixer. Un progetto offline può essere confrontato e applicato con un’operazione esplicita e un ambito preciso; non va inviato implicitamente dopo la riconnessione. Questo conserva il comportamento corretto del controller iniziale.

Scene/snapshot/snippet e preset plugin devono avere comandi e stato dedicati. Dopo un recall, le pagine coinvolte vanno risincronizzate e gli eventuali cambi di modello FX devono invalidare gli editor. I safes e gli scope devono provenire dal banco dove esposti, distinguendoli dai filtri applicativi locali. Non è presente oggi un import/export di scene completo, né un servizio di filesystem remoto.

### 8. Integrazione Sculpt

Il punto comune deve essere un bus di comandi semantici, riutilizzato anche dalle macro: destinazione console, entità/parametro, operazione assoluta o relativa, precondizione di sessione/schema e risultato confermato.

Show potrà richiamare gruppi di azioni; Production potrà contribuire a nomi, patch e assegnazioni; il trasporto fisico deve avere un proprietario preciso. Questi sono punti di estensione proposti: nel codice esistente non sono implementati canali di comunicazione tra app, HTTP/WebSocket server o import di progetti Sculpt.

Poiché l’app iOS chiude i socket in background, eventuali automazioni che devono continuare a schermo spento o passando a un’altra app richiedono un progetto specifico di lifecycle/ownership. Non possono essere promesse sulla base del prototipo attuale.

## Ordine di lavoro consigliato

1. Aggiornare il contratto di progetto: il vecchio limite alle sole mandate era il perimetro della 0.1. La nuova richiesta autorizza la progettazione del controllo completo; non deve diventare un blocco da sottoporre nuovamente all’utente.
2. Unificare modello e driver con la UI rossa, conservando la simulazione e senza introdurre replay di dati locali.
3. Costruire inventario di funzioni, parametri e plugin per il firmware di riferimento. Per ogni voce registrare stato documentato, UI, controllo simulato, lettura/scrittura live e verifica hardware.
4. Introdurre dominio I/O e istanze di processing, poi editor dedicati per algoritmo e gestione dei cambi modello.
5. Estendere meter, scene, gruppi, monitor, recorder e Setup per blocchi verificabili.
6. Verificare ogni blocco sulla WING Rack, compresa la modifica bidirezionale simultanea con banco e altri controller.
7. Aggiungere macro e comunicazione con le altre app sullo stesso nucleo già verificato.

“Tutte le funzioni” deve essere un inventario verificabile, non una schermata con pulsanti per funzioni ancora simulate. È realistico preparare tutto il perimetro ora; non è corretto dichiarare parità completa con il banco prima delle verifiche dei parametri e dell’hardware.

## Fonti dell’analisi

Fonti primarie locali lette:

- Demo: `dist/model.js`, `dist/app.js`, `dist/editor.js`, `dist/index.html` nel progetto Sites.
- Nativo: `DEVELOPMENT_CONTRACT.md`, `docs/ARCHITETTURA.md`, `docs/PROTOCOL.md`, `docs/VERIFICHE.md`.
- Nativo: `src/wing/types.ts`, `protocol.ts`, `client.ts`, `native.ts`; `src/state/types.ts`, `store.ts`, `demo.ts`; `src/App.tsx`.
- Nativo: `ios/App/App/WingSocketPlugin.swift` e `ios/App/App.xcodeproj/project.pbxproj`.
- `wing_remote_protocols_v3.1.2a.md`, dichiarato **V3.1.2-a — WING FW 3.1.2 and above**, in particolare l’esempio di cambio modello FX `NONE` → `PIA` e conseguente cambiamento dei parametri.

Riferimento pubblico dell’autore del protocollo già usato nel progetto: https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md . Questa analisi confronta il codice locale; non sostiene di avere validato l’ultima versione del firmware o il comportamento della console reale.
