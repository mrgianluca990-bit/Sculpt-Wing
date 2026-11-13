# Plugin WING — implementazione demo 0.4

## Copertura implementata

La demo contiene **109 definizioni di modello per categoria** e **1.116 definizioni di parametro** nel catalogo generato. I modelli dello stesso nome in contesti diversi rimangono distinti. Il totale non rappresenta 109 processori simultanei né parametri unici del firmware.

- Rack: 63 algoritmi, più `NONE` ed `EXT`; 16 istanze con stato indipendente.
- Slot 1–8: 65 modalità selezionabili. Slot 9–16: 39 modalità, senza algoritmi premium.
- Filter CH: 4 modelli.
- EQ: 8 ID complessivi, filtrati per famiglia: 7 CH, 6 AUX, 7 BUS/MAIN/MTX.
- Gate/dynamics: catalogo di 32 modelli dove ammesso; 28 modelli per il blocco dynamics degli AUX.
- EQ standard: 20 parametri per la versione a sei bande; 27 nella versione a otto bande delle uscite.

`SculptCatalog.list(context)` filtra l’elenco; `get(context, model)` fornisce il pannello e lo schema corretti. `defaults` crea un oggetto nuovo per ogni istanza. Sono comprese tutte le righe parametrizzate delle sei tabelle dell’appendice esaminate, con le correzioni sotto indicate.

## Interfacce

Gli editor sono ricostruzioni responsive in HTML/CSS/SVG, adattate a iPhone e tablet, con 17 temi visivi e strutture specifiche per processore:

- Manopole regolabili con trascinamento relativo, frecce della tastiera e inserimento numerico; doppio tocco/click per ripristinare il valore dimostrativo.
- Switch, selettori enumerati e sezioni organizzate secondo i gruppi del processore.
- GEQ a 31 bande e PIA 560 con fader verticali, scorrimento orizzontale e controlli master.
- EQ standard ed emulati con curve illustrative che reagiscono a gain, frequenza e Q dove presenti.
- Pannelli dynamics con display di riduzione dimostrativo e controlli specifici per 76, LA, Fairkid, No Stressor, PSE, Rider e gli altri modelli.
- Riverberi, VSS3 con sezioni early/tail/decay/modulation, delay, pitch, modulazioni, filtri, amp e tape.
- Sezioni per banda su DEQ/Combinator e sottoblocchi delle cinque channel strip rack.
- Libreria di preset locali del processore; salvataggio, richiamo e cancellazione; copia/incolla tra contesti compatibili; reset.
- Rack con ricerca, assegnazione della destinazione e posizione di insert, bypass e mix dello slot.

Le interfacce conservano nomi e controlli del catalogo WING. Non sono immagini del firmware incorporate né una dichiarazione di corrispondenza pixel per pixel. Curve, meter e impostazioni dei profili dimostrativi non eseguono DSP e non costituiscono misure del banco.

## Stato condiviso

Tutte le modifiche passano da `SculptDesk`; non esiste una memoria locale separata dei plugin. Gli editor ricevono le notifiche di cambio modello, parametri, preset e scene, ricostruendo il pannello quando cambia l’algoritmo. Le modifiche dei singoli parametri aggiornano il pannello senza ricreare i controlli e perdere focus o trascinamento.

I preset sono in `desk.pluginPresets` e la clipboard in `desk.pluginClipboard`. Il richiamo filtra le chiavi attraverso il modello di destinazione e impedisce di usare un premium in uno slot standard o un processore di una famiglia non compatibile.

Il pulsante LOAD di VSS3 applica un profilo illustrativo coerente con la famiglia del nome selezionato. Non riproduce i dati proprietari dei factory preset WING: l’interfaccia lo comunica con “Profilo dimostrativo applicato”. I preset creati dall’utente salvano e richiamano esattamente lo stato locale.

## Correzioni alla fonte

La fonte è la copia locale di **WING Remote Protocols V3.1.2-a**. Il catalogo iniziale normalizzato è `docs/wing-plugin-catalog.json`; le tabelle dei parametri sono convertite da `scripts/build-plugin-catalog.py` in `dist/plugin-data.js`.

Correzioni documentate:

- `R-OOM` → `ROOM`; Stereo Flanger distinto da `CHORUS` con ID `FLANGER`; `V_IMG` → `V-IMG`.
- `7q` dell’EQ output corretto in `6q` in base alla descrizione della sesta banda.
- `bandse l` → `bandsel`.
- Tipo mancante del mix SUB-M ricostruito come `linf`; `linf>` di Velvet normalizzato; `inf [0,1]` per `shv`/`eq5` trattato come interruttore.
- Unità contenute nelle parentesi dei range normalizzate senza trasformare valori numerici in enumerazioni.
- I parametri `fader lvl` di VSS3 sono inclusi; range demo −144…+10 dB.
- Gli indici `int [1..5]` e gli altri intervalli con punti vengono interpretati come range.
- Nel PSE/LA Combo la fonte ripete `peak` per due parametri diversi. La demo conserva **Peak detector** come `peak` e **Peak reduction** come `peak__2`; l’ambiguità è marcata nei metadati e richiede la descrizione del nodo reale prima di qualsiasi controllo hardware.

I valori iniziali sono valori dimostrativi scelti entro i limiti documentati, non un dump dei factory default della console. Per il collegamento reale devono essere sostituiti dai valori e dallo schema letti dal mixer.

### Risoluzione dei controlli numerici

Il numero di passi indicato per un parametro `logf` non viene diviso linearmente per il suo intervallo fisico: questo produceva valori come 78,78125 Hz al posto di 80 Hz e alterava inutilmente i numeri digitati. La curva della manopola resta logaritmica dove il documento dichiara `logf`; il passo di inserimento della demo è invece esplicito e sensato per l’unità (1 Hz, 0,1 ms, 0,01 s, con risoluzioni più fini per altri valori continui). Il conteggio originale rimane in `referenceSteps` e l’approssimazione della demo è marcata `stepSource: demo_display_resolution`.

Per il Decay di VSS3 la fonte dichiara `linf [.1, 20, 280]`: la demo conserva la mappatura lineare e usa **0,01 s** come risoluzione di editing, così 2,8 s resta 2,8 s. Questo non afferma una quantizzazione hardware di 0,01 s; quella dovrà provenire dai metadati e dal valore confermato dal mixer.

## Verifica

`node --check` superato per `plugin-data.js` e `plugins.js`.

Sei test automatici in `tests/plugin-catalog.test.cjs` verificano:

1. Copertura del rack e divieto dei premium negli slot 9–16.
2. Differenze tra famiglie CH, AUX e uscite, incluse omonimie EQ/gate.
3. Chiavi uniche, parametri presenti, tipi, valori iniziali e limiti di tutte le definizioni.
4. Varianti EQ6/EQ8, livelli VSS3 e correzioni controllate del parser.
5. Isolamento delle istanze e conservazione delle due chiavi ambigue di CMB.
6. Risoluzione numerica di VSS3 e dei parametri logaritmici, mantenendo separata la curva del controllo dalla quantizzazione hardware.

L’integrazione browser, l’offline e le interazioni incrociate con routing/scene sono verificate dal workflow generale della demo. Nessuna prova WING fisica né caricamento di processori reali è eseguito da questo modulo.
