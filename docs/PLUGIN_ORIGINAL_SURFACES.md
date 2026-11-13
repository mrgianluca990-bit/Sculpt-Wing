# Pannelli WING ricostruiti dalla guida originale

## Riferimento grafico

La fonte ispezionata è **Behringer, WING Effects Guide, WING Firmware Version 3.0, Processing and Effects Plug-in Guide, V 0.0**: queste diciture sono riportate sulla copertina del PDF di 34 pagine.

- [Guida sul sito Music Tribe](https://mediadl.musictribe.com/media/PLM/data/docs/P0BV2/EFFECTS%20GUIDE_M_BE_0603-AEN_WING.pdf).
- [Copia della stessa guida scaricata da Thomann](https://fast-images.static-thomann.de/pics/atg/atgdata/document/info/599928_m_be_0603-aen_wing_effects_guide_dark1_ww.pdf).

Per completare i nove modelli rimanenti è stato ispezionato anche **Patrick-Gilles Maillot, WING Remote Protocols V3.1.2-a, 26 ottobre 2026**, scaricato dal link pubblico sul [sito dell’autore](https://sites.google.com/site/patrickmaillot/wing). Le figure originali dei filtri sono a pagina 171; Dual Dynamic EQ e PSE/LA Combo a pagina 173; Even 88 Compressor, LMT e One Knob Compressor a pagina 177. I nuovi metadati identificano il documento distinto tramite `sourceDocument`.

Ogni definizione grafica contiene `sourcePage`, con il numero stampato nella rispettiva fonte. Sono state esaminate le immagini dei pannelli, non soltanto la descrizione testuale dei processori. Le schermate della guida possono differire da firmware successivi.

## Che cosa cambia

Le nuove superfici rispettano la disposizione dei controlli illustrata nella guida: posizione e dimensione relativa delle manopole, colonne dei selettori, fader, campi digitali, bande dell'EQ, meter e interruttori. Le superfici vengono ridimensionate come un unico pannello. Quando lo spazio non basta, il pannello scorre orizzontalmente: i controlli non vengono riordinati in una griglia generica.

Esempi verificati sulla fonte:

- **76 Limiter Amp, pagina 32:** Input e Output a sinistra; Attack e Release in colonna; selettore Ratio verticale; VU a destra; scritte sotto le manopole, scala Input/Output a nove valori e ALL sotto i pulsanti Ratio.
- **LA Leveler, pagina 32:** interruttore Limit/Compress, Gain, VU centrale e Peak Reduction.
- **Soul Bus Comp, pagina 31:** VU a sinistra, cinque controlli blu a destra.
- **Even 84, pagina 21:** tre controlli coassiali. La corona esterna modifica la frequenza; la manopola interna modifica il guadagno. I due valori rimangono indipendenti.
- **VSS3, pagina 6:** finitura argento, sei fader e libreria circolare. Gli altri parametri sono raggiungibili con View e nella sezione aggiuntiva.
- **WING Gate, Ducker, Compressor ed Expander, pagine 24 e 29:** campi digitali e grafici delle impostazioni, senza un VU analogico sostitutivo.
- **Channel FX, pagine 22 e 23:** sezioni selezionabili tramite schede; la memoria dei parametri rimane condivisa con l'istanza del processore.

Non vengono incorporate fotografie, schermate del firmware o immagini dei controlli. Le superfici sono disegnate in HTML, CSS e SVG; i controlli sono interattivi e leggono/scrivono lo stesso stato dell'app.

## Controlli e valori

I modelli e i parametri continuano a provenire dal catalogo esistente. In collegamento reale, i metadati letti dalla WING prevalgono sui limiti e sulle opzioni locali. Il nuovo renderer non definisce un secondo insieme di valori e non modifica il trasporto di rete.

Ogni parametro del catalogo compare una sola volta come controllo modificabile. I parametri che non appartengono alla facciata illustrata, comprese opzioni aggiuntive del firmware, restano raggiungibili nella sezione **Altri controlli del processore**. Alcuni display mostrano inoltre un riscontro di sola lettura dello stesso parametro: non sono misure del segnale.

Le manopole con valori nascosti per rispettare il disegno originale mostrano il campo preciso al passaggio del mouse o al focus da tastiera. I selettori rotativi conservano il tipo originale dei valori enumerati, anche quando il firmware restituisce numeri invece di stringhe. Gli interruttori IN/EQ del pannello comandano lo stesso bypass del pulsante nell'intestazione.

I fader verticali e orizzontali dei plugin cambiano valore soltanto trascinando la testa. Il click, il doppio click o il trascinamento sulla pista non muovono il valore. Restano disponibili frecce, Home/End e inserimento numerico.

## Limiti espliciti

Questa è una ricostruzione verificata contro le figure della guida, non una copia del renderer del firmware. Font, materiali, alcuni dettagli di scala e contenuti dipendenti dalla versione possono differire. La modifica non costituisce una certificazione di identità pixel per pixel con tutte le versioni di WING EDIT.

- La figura principale di VSS3 non identifica gli assegnamenti dei sei fader. In Sculpt Wing sono associati esplicitamente a Early Delay, Reverb Delay, Decay, Early Level, Reverb Level e Diffusion. Questa assegnazione è un adattamento del controller; non viene presentata come la pagina originale completa del REVERB 6000.
- I meter di gain reduction e i meter di questi pannelli non ricevono attualmente un flusso audio/GR dal banco. Restano inattivi e indicano l'indisponibilità; non seguono i movimenti delle manopole e non simulano letture audio.
- I grafici della dinamica mostrano una **curva statica di riferimento** calcolata da soglia, rapporto e range. Non riproducono il knee o l'inviluppo proprietario, il segnale presente, il mix parallelo o il guadagno di uscita.
- I grafici Attack/Hold/Release rappresentano i tempi impostati e non una misura dell'audio. Gli altri display senza dati non mostrano tracce inventate.
- I controlli dei preset VSS3 mantengono la separazione fra profilo illustrativo offline e comando LOAD reale. Il disegno della libreria non introduce dati di preset factory non disponibili.
- I quattro tool filter riprendono la griglia e la barra TOOL FILTER delle schermate originali. La riga inferiore dei parametri è un adattamento accessibile esplicito: il riferimento disponibile è ritagliato prima di quella zona. LC/HC appartengono al pannello di ingresso e non sono controlli fittizi dei quattro modelli. Il marker AP usa la frequenza impostata; non viene disegnata una curva audio inventata.
- In PSE/LA Combo, il documento chiama `peak` due parametri diversi. Il mapping conserva il blocco di entrambi in live finché lo schema non consente di identificarli senza ambiguità; la UI li mostra in sola lettura. Gli altri cinque parametri restano disponibili.
- Un modello sconosciuto letto dal firmware non viene sostituito da un modello locale.

## Copertura della ricostruzione

Il renderer basato sui riferimenti è applicato a **108 delle 109 definizioni del catalogo**, corrispondenti a **100 ID distinti**. Una stessa famiglia può essere disponibile in più contesti, per esempio nel rack e nell'EQ del canale; questi numeri non indicano processori utilizzabili contemporaneamente. Le 103 voci dei metadati comprendono alias e definizioni condivise.

| Categoria del catalogo | Definizioni con nuova superficie | Totale |
| --- | ---: | ---: |
| Modalità slot / External | 1 | 2 |
| FX standard | 26 | 26 |
| EQ del rack | 6 | 6 |
| FX premium | 26 | 26 |
| Channel FX | 5 | 5 |
| Filtri di ingresso | 4 | 4 |
| Gate e dynamics | 32 | 32 |
| EQ del canale | 8 | 8 |
| **Totale** | **108** | **109** |

La copertura indica l'uso di una geometria ricostruita dalla fonte, non l'identità di ogni dettaglio o di ogni pagina interna. Per Speaker Manager viene ricostruita la pagina Dynamic EQ illustrata; Filter, Alignment e Limiter restano raggiungibili nei controlli aggiuntivi. WING EQ riprende la figura dell'EQ di ingresso a sei bande; sulle uscite il grafico esistente mantiene gli otto punti e i sette parametri aggiuntivi (bande 5/6 e Tilt) rimangono nella sezione aggiuntiva.

Tutte le 108 definizioni non vuote hanno ora una superficie basata sui riferimenti. La definizione rimanente, `NONE`, è lo slot vuoto: mantiene il suo stato dedicato “Slot disponibile”, con il selettore del processore. Non viene contata come un plugin originale aggiuntivo.

## File e verifiche

`dist/plugin-original-*.js` contiene esclusivamente geometrie e descrizioni dei controlli. `dist/plugins.js` mantiene il rendering, gli eventi e i collegamenti allo stato. `dist/plugins.css` contiene le superfici ridimensionabili. I file di metadati vanno caricati nell'ordine indicato in `dist/index.html`, prima di `plugins.js`; le Channel FX riusano le definizioni di EQ e dinamiche già caricate.

La suite `tests/plugin-panels.test.cjs` supera **14 test**: rendering di tutte le 109 definizioni e dell'EQ di uscita a 27 parametri, unicità e raggiungibilità dei parametri, fader verticali/orizzontali dalla sola testa, selettori enumerati del firmware, controlli coassiali indipendenti, bypass condiviso, schede delle Channel FX, campi digitali e curve di riferimento, selezione della banda e cancellazione della gesture quando la banda viene nascosta, blocco durante il caricamento e rimozione dei listener. La suite aggiuntiva `tests/plugin-additions.test.cjs` verifica selezione e isolamento delle due bande DEQ2, pulsanti con valori booleani reali, unicità dei 47 parametri dei cinque modelli aggiunti e protezione live dei due parametri CMB ambigui. Il confronto visivo e le prove reali sul Mac e sulla WING restano distinti dalle verifiche automatiche del codice.
