# Sculpt Wing — perimetro completo WING

## Consegna demo 0.4

Il perimetro dimostrativo qui descritto è stato implementato nella versione 0.4. Il dettaglio delle funzioni operative, dei limiti e delle verifiche è in `../README.md`, `VERIFICATION.md` e nei documenti `*_IMPLEMENTATION.md`. Questo documento resta la specifica di riferimento anche per il futuro controllo remoto; le prove hardware non sono completate.


Decisione di prodotto: 13 novembre 2026. Stato dell’app pubblicata: studio d’interfaccia 0.3, offline e senza collegamento al mixer.

## Obiettivo adottato

Sculpt Wing deve diventare una superficie di controllo completa della WING, con priorità WING RACK. Il precedente obiettivo limitato al controllo delle mandate monitor è superato come obiettivo finale; resta la descrizione delle funzioni implementate nel primo prototipo nativo.

Il criterio di completezza è l’accesso alle funzioni del banco e ai parametri dei suoi algoritmi, con editor dedicati e riscontro dello stato reale. Le automazioni e l’integrazione con le altre app Sculpt si costruiscono sopra questa base.

Gli allegati rendono il perimetro verificabile: [catalogo completo dei plugin](WING_PLUGIN_CATALOG.md), [inventario strutturato dei modelli](wing-plugin-catalog.json), [mappa I/O e funzioni di sistema](WING_IO_AND_SYSTEM.md), [analisi dell’architettura esistente](WING_ARCHITECTURE.md). Gli inventari distinguono ciò che è documentato da ciò che è implementato o verificato su hardware.

L’audio e gli algoritmi continuano a essere elaborati dalla WING. Sculpt Wing seleziona e modifica i processori del banco. L’uso offline rimane un ambiente dimostrativo e di preparazione esplicitamente separato dal mixer collegato.

## Interfaccia approvata e navigazione

La schermata principale conserva la grafica Sculpt rossa, le strip compatte e le due file indipendenti:

- Sopra: 16 BUS, 8 MTX, 4 MAIN.
- Sotto: 40 CH e 8 AUX di ingresso.
- Apertura dell’editor dalla strip; SOF sui BUS e sulle MTX.
- Area macro nella parte inferiore, senza reintrodurre la testata con il marchio.

Un pulsante di menu compatto dà accesso alle aree globali **Mixer, I/O, FX Rack, DCA / Mute Groups, Monitor / Talkback, Scenes / Library, Recorder, Setup**. Gli strumenti di misura sono accessibili dal mixer e dalla sezione Monitor. Gli editor sono adattati a iPhone e tablet: pannelli dedicati, navigazione chiara e stessa disposizione logica dei parametri della WING.

Questa navigazione è una specifica da implementare. La versione 0.3 non contiene ancora tutte queste pagine.

## Mappa delle funzioni

| Area | Copertura richiesta | Dettagli da rispettare |
| --- | --- | --- |
| Mixer e strip | Tutti i CH, AUX, BUS, MAIN e MTX; livello, mute, pan/balance, modalità mono/stereo/M-S, solo, nome, colore, icona e tag; banchi personalizzati | Capacità diverse per famiglia; lettura e aggiornamento bidirezionali |
| Sorgenti | Catalogo delle sorgenti, assegnazione Main/Alt, headamp, phantom, trim, mute e polarità dove supportati | Una sorgente condivisa può alimentare più canali; mantenere separati sorgente, ingresso del canale e uscita fisica |
| Elaborazione di canale | Filtri, tutti i modelli di EQ e dynamics, gate dove presente, sidechain/key, delay, ordine dei processori, punti di prelievo | Ogni parametro appartiene al modello e al contesto effettivo; nessuna falsa parità tra CH e AUX |
| Mandate e routing interno | CH/AUX verso BUS, MAIN e MTX; BUS verso destinazioni ammesse; MAIN verso MTX; punti PRE/TAP/POST, pan/link e abilitazioni | Il SOF mostra solo percorsi validi e conserva i master; regole effettive riconciliate con il mixer |
| I/O | Patch ingressi e uscite Local, AES50 A/B/C, USB, scheda CRD, modulo MOD, StageCONNECT, AES/EBU e segnali USER; sorgenti Main/Alt, USER SIGNAL e USER PATCH | Mostrare porte e risorse realmente presenti sul modello e sulle espansioni rilevate |
| FX Rack | 16 slot; selezione algoritmo, parametri completi, insert, bypass, mix, assegnazioni, insert esterni e funzioni di libreria pertinenti | Slot 1–8 premium/standard/channel; slot 9–16 standard/channel; tenere distinte istanza, algoritmo e destinazione |
| DCA, mute e automix | Assegnazione e controllo DCA, mute groups, spill/layer, gruppi automix e relativi parametri | Baseline del protocollo 3.1.2-a: 16 DCA e 8 mute groups; capacità da confermare sul firmware collegato |
| Monitor e talkback | Monitor bus, dim, mono, solo/PFL/AFL, punti di ascolto, sorgenti e destinazioni talkback, funzionamento momentaneo/latch | Controllo del percorso di monitor del banco; l’ascolto audio dal tablet è una funzione distinta e non viene implicato |
| Meter e strumenti | Meter di ingresso/uscita, gain reduction, RTA, solo, oscillatore/generatore e relativi routing | Dati reali sottoscritti quando collegati; meter simulati identificati in demo |
| Scenes e Library | Show, scene/snapshot, snippet, preset di canale/FX, scope, safes, richiamo e aggiornamento parziale, gestione disponibile dei file | Distinguere stato del mixer, file sul mixer e file locali; verificare le operazioni disponibili tramite protocollo |
| Recorder e player | WING-LIVE/SD e USB player/recorder: routing, trasporto, sessioni/playlist, stato dei supporti | Funzioni subordinate a scheda e supporti presenti; non equivale a trasferire automaticamente audio al telefono |
| Setup | Identità, modello, firmware, rete, clock, sincronizzazione, AES50, schede/moduli, StageCONNECT, MIDI, GPIO e custom controls | Classificare separatamente funzioni documentate, leggibili, scrivibili e confermate con hardware |
| Integrazione Sculpt | Macro su parametri del mixer, richiamo di sequenze, sincronizzazione futura con Sculpt Show e scambio dei dati di produzione | Le macro usano gli stessi comandi e gli stessi riscontri degli editor; non mantengono una seconda copia indipendente del mixer |

## Plugin: interfacce specifiche

La copertura comprende due insiemi: i modelli che sostituiscono l’elaborazione nelle strip e gli algoritmi caricabili nel rack FX. Il catalogo completo con ID e vincoli è mantenuto nell’inventario associato a questa specifica.

Ogni algoritmo richiede un editor riconoscibile: disposizione dei blocchi, nomi, scale, selettori e comportamento devono corrispondere al processore WING. L’involucro dell’app rimane Sculpt; il processore conserva la propria identità visiva e operativa. Un compressore ottico, un FET, un EQ passivo e un riverbero non devono essere rappresentati dalla stessa scheda generica con pochi cursori.

Per ciascun modello l’attività comprende:

1. Censire i parametri esposti nel contesto corretto, le unità, i valori enumerati, i limiti e i controlli condizionali.
2. Registrare le varianti consentite nelle diverse famiglie e negli slot. Lo stesso nome di algoritmo può avere parametri diversi in Gate, Dynamics e FX.
3. Ricostruire il pannello dai riferimenti del banco, con curve e meter solo quando i dati necessari sono disponibili e verificati.
4. Collegare ogni controllo al modello comune della demo e del driver remoto, con il medesimo significato e senza introdurre parametri inesistenti.
5. Confrontare carico, lettura, modifica, bypass, preset e cambio algoritmo con WING/WING Edit e infine con il mixer fisico.

Il protocollo comunica stato e parametri; il client deve renderizzare gli editor. Non è stata documentata una funzione che consegni una pagina web pronta per ogni plugin. L’inventario documentale contiene refusi e differenze tra famiglie: schema e ID vanno riconciliati con il firmware, senza importare ciecamente le tabelle.

## I/O: struttura della pagina

La pagina I/O distingue quattro livelli operativi:

1. **Sorgenti** — porte fisiche e digitali, attributi della sorgente, headamp dove presente.
2. **Ingressi canale** — assegnazione Main/Alt ai CH/AUX e modalità del segnale.
3. **Uscite** — scelta del segnale e del punto di prelievo per ogni porta fisica/digitale.
4. **USER** — segnali e patch personalizzati, usati nel resto del routing con i loro nomi.

La patch deve offrire vista per sorgente e per destinazione, ricerca, assegnazione singola o consecutiva e indicazione dei collegamenti correnti. Il collegamento tra bus e uscita fisica è una scelta di routing: non vincola l’esistenza o l’uso del bus.

Per la WING RACK Dante dell’utente il progetto deve distinguere il modulo AoIP dalla scheda di espansione e mantenere visibili AES50 e WING-LIVE quando presenti. La patch dei flussi Dante lato WING è compresa. La configurazione delle subscription tra dispositivi nella rete Dante è un dominio distinto: non viene dichiarata coperta dal protocollo WING senza una verifica specifica.

## Architettura necessaria

Attualmente la demo rossa usa un proprio modello JavaScript locale, mentre il prototipo Capacitor ha un ControlStore e un driver nativo separati. Prima di estendere gli editor a tutto il banco occorre convergere su un modello condiviso.

- **Stato unico del banco:** identità, capacità, sorgenti, routing, strip, processori, FX, gruppi, monitor, scene e recorder.
- **Due driver:** simulazione offline e collegamento WING, entrambi dietro lo stesso contratto. Il requisito operativo resta mixer + router + tablet, con trasporto nativo nell’app installata.
- **Catalogo versionato:** algoritmo, famiglia, slot, parametri, unità, limiti, enumerazioni, lettura/scrittura e identificatore dell’editor grafico.
- **Schema dinamico:** un cambio di algoritmo invalida i parametri precedenti, rilegge i nuovi nodi, annulla le scritture obsolete e aggiorna il pannello solo quando lo stato è coerente.
- **Sincronizzazione bidirezionale:** le modifiche effettuate sul banco o da un altro controller aggiornano l’app; i comandi dell’app richiedono riscontro dal mixer.
- **Sessioni distinte:** disconnessione o sospensione annullano comandi pendenti; la riconnessione legge il mixer senza riversare automaticamente i valori demo o vecchi valori locali.
- **Capacità reali:** modello, firmware, schede e nodi scoperti determinano le funzioni disponibili. Uno stato sconosciuto non viene mostrato come un valore reale pari a zero.

Il driver nativo esistente contiene già componenti utili: gestione TCP/UDP, metadati dei nodi, isolamento delle sessioni e lettura confermata. Il contratto di scrittura attuale è però limitato a mandate CH→BUS e master BUS; non implementa ancora il controllo completo. Il passaggio al nuovo perimetro deve estendere le operazioni per dominio e conservarne la convalida.

Il progetto Xcode iniziale è configurato per iPad. L’obiettivo comprende un’interfaccia utilizzabile su iPhone e iPad; la configurazione universale e le prove di installazione sul telefono devono essere incluse nel lavoro nativo. La prova della pagina web alle dimensioni iPhone non costituisce una prova della build iOS.

Le operazioni di gestione completa dei file sul banco, import/export, RESTORE/INIT e aggiornamento firmware restano voci esplicite dell’inventario da verificare. Il richiamo di una scena già disponibile non dimostra da solo il supporto a queste operazioni. I controlli associati a potenziometri fisici possono essere assenti o in sola lettura, secondo il modello.

## Sequenza di sviluppo

| Passo | Risultato concreto | Criterio di completamento |
| --- | --- | --- |
| 1. Modello comune e navigazione | Struttura completa del banco, driver demo/live, menu globale e matrice delle capacità | Nessuno stato duplicato tra editor, SOF e trasporto; simulazione separata dalla connessione |
| 2. I/O e canale completo | Patch, Main/Alt, preamp, filtri, delay, insert, solo e percorso del segnale | Gli assegnamenti e i parametri documentati si possono preparare in demo e leggere/scrivere nelle prove collegate |
| 3. Plugin di strip e rack FX | Catalogo completo, selettore, editor specifici, parametri e vincoli di slot | Ogni modello ha un editor censito e i parametri confrontati con lo schema; cambio modello senza dati residui |
| 4. Funzioni globali | DCA/mute/automix, monitor/talkback, scene/libreria, recorder e setup | Copertura verificata separatamente per ciascun dominio e per le risorse hardware presenti |
| 5. Parità operativa | Prove con WING RACK, firmware dichiarato e rete reale; modifiche da più controller e riconnessione | Nessuna funzione dichiarata completa solo perché il relativo pulsante è visibile |
| 6. Automazioni Sculpt | Macro e integrazione con Show e altre app | Azioni sullo stesso stato verificato e con esiti leggibili, conservando il controllo manuale completo |

Questi passi sono incrementi verificabili; non sono una riduzione del perimetro concordato. L’integrazione e le automazioni possono procedere in parallelo quando i domini necessari sono verificati.

## Come viene misurata la copertura

Per ogni funzione e algoritmo mantenere stati separati: **censito**, **editor implementato**, **demo verificata**, **lettura remota verificata**, **scrittura remota verificata**, **prova su hardware completata**. Registrare modello, firmware e data della prova. La completezza richiede anche sincronizzazione, cambio scena/modello e riconnessione.

Questa specifica aggiorna l’obiettivo; non trasforma gli editor generici già presenti nella demo 0.3 in implementazioni complete dei plugin WING.

## Fonti e baseline

- [WING RACK — pagina e download ufficiali Behringer](https://behringer.com/en/products/0604-AAE), consultata il 13 novembre 2026. La pagina consultata elenca firmware 3.1.2 e WING Edit 3.3.4.
- [WING Remote Protocols — download ufficiale](https://cdn-media.empowertribe.com/2106004e217b8eb2639d93672823eef5/WING_Remote-Protocols-3.1-03.pdf). Inventario ricavato dalla copia testuale locale con intestazione V3.1.2-a, FW 3.1.2 e successivi; le capacità effettive si verificano sul mixer.
- [Manuale utente WING series](https://cdn-media.empowertribe.com/25951c6f808c0a79abc407c07d5639d1/User-Manual_WING-series_2025-10-20.pdf).
- [Note di rilascio firmware 3.1.2](https://cdn-media.empowertribe.com/9773eacaebb1ba29df804c96d69cfca1/WING-firmware-3.1.2_release-notes.pdf).
- Sorgenti esaminate: demo web 0.3 e prototipo nativo Sculpt Wing 0.1. Nessuna verifica con hardware collegato in questa fase.
