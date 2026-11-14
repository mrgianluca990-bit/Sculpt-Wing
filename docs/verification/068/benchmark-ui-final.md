# Sculpt Wing 0.6.7 → 0.6.8 — benchmark finale UI

Rilevazione: 2026-11-14T01:28:10.199Z. Sei scenari, tre campioni per versione: 36 processi JSDOM indipendenti. Le sorgenti sono rimaste coerenti durante la misura. Audit finale `strict` con SHA: **PASS**, nessun problema segnalato.

## Tempi

I valori sotto sono le mediane dei tre campioni. p50 e p95 sono prima calcolati sulle singole operazioni di ciascun campione; la tabella riporta poi la mediana dei tre percentili. Il totale include il flush finale del progetto.

| Scenario | Totale 067 → 068 (ms) | Variazione totale | p50 067 → 068 (ms) | p95 067 → 068 (ms) |
| --- | ---: | ---: | ---: | ---: |
| 40 cambi canale da strip, EQ aperto | 2152.00 → 621.80 | -71.1% | 48.52 → 11.88 | 85.09 → 29.03 |
| 40 aperture EQ con openSection | 2183.33 → 797.11 | -63.5% | 50.29 → 17.02 | 69.19 → 38.15 |
| 40 aperture EQ da macro | 3625.70 → 983.84 | -72.9% | 88.97 → 22.30 | 117.03 → 37.47 |
| 120 regolazioni gain EQ | 871.92 → 210.05 | -75.9% | 7.36 → 1.56 | 10.97 → 2.61 |
| 120 regolazioni fader canale | 399.46 → 190.69 | -52.3% | 2.66 → 1.50 | 5.35 → 1.91 |
| 120 movimenti punto EQ, due assi | 1227.62 → 243.01 | -80.2% | 9.35 → 1.72 | 15.87 → 3.00 |

Nessuna regressione delle mediane di totale, p50 o p95 nei sei scenari. I tempi variano fra i campioni; non sono stime di latenza o FPS su Mac M1. I conteggi strutturali sotto spiegano meglio quali costi sono stati eliminati.

## Lavoro effettivamente svolto

| Scenario | Ricostruzioni pannello 067 → 068 | Notifiche subscriber | Scritture storage | Record mutazione DOM |
| --- | ---: | ---: | ---: | ---: |
| 40 cambi canale da strip, EQ aperto | 120 → 40 | 280 → 280 | 1 → 1 | 15680 → 7000 |
| 40 aperture EQ con openSection | 120 → 40 | 280 → 280 | 1 → 1 | 15640 → 7000 |
| 40 aperture EQ da macro | 120 → 40 | 600 → 600 | 41 → 1 | 16640 → 7600 |
| 120 regolazioni gain EQ | 0 → 0 | 960 → 960 | 1 → 1 | 14880 → 14520 |
| 120 regolazioni fader canale | 0 → 0 | 960 → 960 | 1 → 1 | 3840 → 3480 |
| 120 movimenti punto EQ, due assi | 0 → 0 | 1920 → 960 | 1 → 1 | 29783 → 14783 |

- Cambiare canale mantenendo l’EQ aperto richiedeva 40 clic aggiuntivi sulla scheda EQ nella 067; nella 068 la scheda rimane aperta. Il confronto misura il completamento dello stesso compito. I clic e i loro tempi separati sono conservati nel JSON.
- Nelle tre navigazioni: 120 → 40 ricostruzioni del pannello, ma 40 → 40 costruzioni del processore EQ. Sono eliminate le 80 viste Canale intermedie; resta un EQ reale per canale.
- Le macro passano da 3.120 a 80 controlli di aggiornamento strip, senza ricostruire indiscriminatamente tutte le strip. Le serializzazioni JSON passano da 183.251.250 a 991.017 caratteri complessivi; le scritture storage da 41 a 1.
- Il drag del punto EQ produce 120 transazioni e 960 chiamate subscriber contro 240 e 1.920: frequenza e gain cambiano insieme. Il risultato finale è identico in tutti i campioni: circa 934 Hz e +6 dB.
- In entrambe le versioni e in tutti i campioni: zero record di mutazione nelle strip non coinvolte; nessuna chiamata misurata a `desk.normalize`, `desk.defaults` o `catalog.defaults`.
- Ogni gesto di gain, fader o punto EQ termina con una sola voce Undo. Le notifiche subscriber di gain e fader restano 960: il miglioramento in quei casi deriva dal costo minore del lavoro eseguito, non dalla soppressione delle notifiche.

## Costi rimasti e incrementi osservati

- La 068 monta il vero componente RTA nell’EQ: presenza del modulo e del DOM verificata prima di ogni campione. Nelle navigazioni crea 1.760 elementi SVG contro 1.680 (+80, circa +4,8%); il nuovo componente è incluso nella misura.
- Gain e fader serializzano 600 caratteri JSON complessivi in più per campione rispetto alla 067. È un incremento inferiore allo 0,06%; non è accompagnato da maggiori scritture storage.
- Il salvataggio finale resta una scrittura del progetto di circa 0,93 MB. Le sue mediane nella 068 sono circa 5,4–6,6 ms in questo ambiente. Il benchmark esegue operazioni ravvicinate: non rappresenta quanti salvataggi avvengono quando l’utente si ferma fra un clic e l’altro.
- Le 120 regolazioni EQ generano ancora 14.520 record di mutazione DOM. JSDOM non misura layout, paint o compositing, quindi la prova sul Mac resta necessaria per valutare il costo grafico.

## Metodo e limiti

Ambiente: Node v24.22.1, JSDOM 26.1.0, Linux x64 (kernel 6.18.57), AMD EPYC 9V74 80-Core Processor; 9 CPU logiche visibili.

Le versioni sono alternate fra i campioni. Ogni campione riparte in un processo Node distinto, con moduli reali, memoria e DOM nuovi; inizializzazione e warmup sono esclusi dal tratto misurato. Non sono state eseguite suite, build o passate di profiling in parallelo.

I moduli sono letti una sola volta prima delle misure e passati ai processi figli come snapshot. I contatori sono inseriti solo nelle copie in memoria; nessuna modifica alle sorgenti di produzione. La fixture misura il frontend locale offline: niente driver nativo, sessione live, traffico WING o timer dei meter. RTA nella 068 presente ma offline, senza spettro inventato. Le misure includono il lavoro JavaScript sincrono, le microtask e i frame UI esplicitamente svuotati; non includono rendering CSS, attività GPU o attese fra i gesti.

Per il drag sono inviati eventi pointer reali al punto B1, con trasformazione SVG controllata: viewBox 640×190, rettangolo schermo 800×237,5, 120 spostamenti su entrambi gli assi. Il risultato e il raggruppamento Undo vengono verificati.

Tutti i probe richiesti sono stati trovati. SHA controllati per index.html e ogni modulo misurato; nessuna modifica durante il run. L’audit successivo conferma che le sorgenti correnti e le copie dei bundle coincidono con la versione verificata.

## Coerenza degli snapshot

| Versione | File con SHA | Digest aggregato dei manifest SHA256 |
| --- | ---: | --- |
| 067 | 25 | `c32832cee13503725a3a1843704a4af0ae90ddd6fe446d83688c9d646df00427` |
| 068 | 26 | `336d75d1030213b50759a395042b9b8150b8dca4d49c3ce9e65a4272366ccf52` |

Il digest aggregato è SHA256 del JSON compatto, chiavi ordinate, del manifest SHA256 presente nel report. Il manifest contiene gli hash originali di ogni file.

## Riproduzione

```bash
NODE_PATH=../sculpt-wing-068/native/node_modules node --expose-gc benchmark-ui.cjs --versions=067,068 --runs=3 --scenarios=strip_switch_eq,open_section_eq,macro_open_eq,eq_gain,channel_fader,eq_point_drag --output=benchmark-ui-final > benchmark-ui-final.log 2>&1
python3 audit-build.py --report build-audit-final.json --strict --benchmark benchmark-ui-final-results.json
```

Eseguire dalla cartella `wing-068-verification`, con entrambe le directory sorgenti disponibili e stabili.

Dati completi: `benchmark-ui-final-results.json`. Log: `benchmark-ui-final.log`. Audit: `build-audit-final.json`. Harness: `benchmark-ui.cjs` e `audit-build.py`.
