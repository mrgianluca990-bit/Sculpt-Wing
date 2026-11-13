# Sculpt Wing — catalogo WING dei processori e requisiti degli editor

## Stato e baseline

Questo è un inventario di progetto, non una dichiarazione di funzioni già implementate o provate sulla WING. La base analizzata è la copia locale **WING Remote Protocols V3.1.2-a**, intestata per firmware **3.1.2 e successivi**. Prima di collegare un mixer bisogna rilevare il suo firmware e riconciliare i cataloghi con i metadati restituiti dal dispositivo. Non si assume che un PDF descriva tutti gli aggiornamenti futuri.

Il modello di controllo deve trattare due insiemi separati: processori integrati nelle strip e rack di effetti. Un compressore nel canale non consuma per questo uno dei sedici slot FX; un effetto caricato nel rack sì. Un algoritmo non equivale a un'istanza simultanea.

| Ambito | Inventario della baseline |
| --- | --- |
| Filter del canale | 4 modelli |
| EQ integrati | 8 ID complessivi: 7 nei CH, 6 negli AUX, 7 nelle uscite |
| Gate / dynamics | 32 modelli nel catalogo generale; lista AUX di 28 |
| Rack premium | 26 algoritmi, slot 1–8 |
| Rack standard | 26 algoritmi, slot 1–16 |
| EQ emulati nel rack | 6 algoritmi, slot 1–16 |
| Channel strip complete nel rack | 5 algoritmi, slot 1–16 |
| Totale rack | 63 algoritmi distinti, più `NONE` e `EXT`: 65 valori del selettore generale |

I sedici slot sono divisi in **1–8** (premium, standard, channel) e **9–16** (standard e channel). Il catalogo va filtrato per slot; non mostrare un riverbero premium come scelta valida nello slot 12. Le sei EQ del gruppo channel compaiono anche nella tabella standard del documento: non devono essere contate due volte.

## 1. Processori integrati nelle strip

### Filter

| ID `mdl` | Nome dell’editor |
| --- | --- |
| `TILT` | Tilt Filter |
| `MAX` | Maxer Filter |
| `AP1` | AP90 Filter (all pass) |
| `AP2` | AP180 Filter (all pass) |

Low-cut/high-cut, enable e pendenza sono controlli del blocco filter e non vanno confusi con il modello aggiuntivo selezionato. I quattro editor hanno controlli propri: Tilt; Low Contour/High Process; frequenza all-pass 90°; frequenza e Q all-pass 180°.

### EQ

| ID `mdl` | Nome dell’editor |
| --- | --- |
| `STD` | WING EQ |
| `SOUL` | Soul Analogue |
| `E88` | Even 88 Formant |
| `E84` | Even 84 |
| `F110` | Fortissimo 110 |
| `PULSAR` | Pulsar |
| `MACH4` | Mach EQ4 |
| `PIA` | PIA 560 GEQ |

L’EQ standard richiede due viste: sei bande per CH/AUX, otto bande per BUS/MAIN/MTX. Gli EQ emulati richiedono i propri selettori, scale e combinazioni boost/cut. Non mappare tutti su sei identiche manopole parametriche. Le liste documentate differiscono per famiglia: CH ammette `STD, SOUL, E88, E84, F110, PULSAR, MACH4`; AUX ammette `STD, SOUL, E88, E84, F110, PULSAR`; BUS/MAIN/MTX ammettono `STD, SOUL, E88, E84, F110, PULSAR, PIA`. Sulle uscite compare quindi PIA 560, mentre MACH4 è elencato per CH. Queste differenze devono essere conservate come capacità documentate e riconciliate con lo schema live, non appiattite in una lista universale.

### Gate e dynamics

| ID `mdl` | Nome dell’editor |
| --- | --- |
| `GATE` | WING Gate / Expander |
| `DUCK` | WING Ducker |
| `E88` | Even 88 Gate |
| `9000G` | Soul 9000 Gate |
| `D241G` | Draw More 241 Gate |
| `DS902` | BDX 902 De-Esser |
| `DEQ` | Dynamic EQ |
| `DEQ2` | Dual Dynamic EQ |
| `WAVE` | Wave Designer |
| `PSE` | Source Extractor |
| `CMB` | PSE / LA Combo |
| `RIDE` | Auto Rider |
| `WARM` | Soul Warmth Pre |
| `COMP` | WING Compressor |
| `EXP` | WING Expander |
| `B160` | BDX 160 |
| `B560` | BDX 560 Easy |
| `D241C` | Draw More Compressor |
| `ECL33` | Even Compressor / Limiter |
| `9000C` | Soul 9000 Compressor |
| `SBUS` | Soul G Bus Compressor |
| `RED3` | Red3 Compressor |
| `76LA` | 76 Limiter Amp |
| `LA` | LA Leveler |
| `F670` | Fairkid 670 |
| `BLISS` | Eternal Bliss |
| `NSTR` | No Stressor |
| `2250` | PIA 2250 Rack |
| `L100` | LTA100 Leveler |
| `E88C` | Even 88 Compressor |
| `LMT` | LMT Compressor |
| `ONEC` | One Knob Compressor |

Il catalogo a 32 modelli è dichiarato per entrambi i punti `gate` e `dyn` dei CH, e per il punto `dyn` di BUS/MAIN/MTX. Non bisogna interpretare “gate” come limitazione a noise gate: in quel punto possono essere caricati anche altri modelli ammessi. Gli AUX hanno un solo punto dynamics; la loro lista documentata esclude `DS902`, `DEQ`, `DEQ2`, `WARM` e comprende gli altri 28. Non creare un secondo gate indipendente sugli AUX.

Il nome del modello da solo non basta come chiave: ad esempio `E88` nel filtro gate identifica Even 88 Gate, mentre `E88` nell’EQ identifica Even 88 Formant. Servono almeno famiglia della strip, sezione e `mdl`. Sidechain, crossover, mix/gain comuni e singoli parametri devono seguire la sezione effettiva; il documento segnala che il sidechain EQ non è disponibile con `CMB` nel punto dynamics.

## 2. Rack FX

### Modalità dello slot

| ID `mdl` | Nome dell’editor |
| --- | --- |
| `NONE` | None / slot vuoto |
| `EXT` | External Insert |

`EXT` è un insert esterno: l’editor deve gestire gruppo/canale di ritorno, modo mono/stereo/M/S, latenza e trim secondo i valori effettivamente ammessi. `NONE` è lo slot vuoto; non è un algoritmo audio.

### Premium — solo slot 1–8

| ID `mdl` | Nome dell’editor |
| --- | --- |
| `HALL` | Hall Reverb |
| `ROOM` | Room Reverb |
| `CHAMBER` | Chamber Reverb |
| `PLATE` | Plate Reverb |
| `CONCERT` | Concert Reverb |
| `AMBI` | Ambiance |
| `VSS3` | VSS3 Reverb |
| `V-ROOM` | Vintage Room |
| `V-REV` | Vintage Reverb |
| `V-PLATE` | Vintage Plate |
| `BPLATE` | Blue Plate |
| `GATED` | Gated Reverb |
| `REVERSE` | Reverse Reverb |
| `DEL/REV` | Delay/Reverb |
| `SHIMMER` | Shimmer Reverb |
| `SPRING` | Spring Reverb |
| `DIMCRS` | Dimension CRS |
| `CHORUS` | Stereo Chorus |
| `FLANGER` | Stereo Flanger |
| `ST-DL` | Stereo Delay |
| `TAP-DL` | UltraTap Delay |
| `TAPE-DL` | Tape Delay |
| `OILCAN` | OilCan Delay |
| `BBD-DL` | BBD Delay |
| `PITCH` | Stereo Pitch |
| `D-PITCH` | Dual Pitch |

### Standard — slot 1–16

| ID `mdl` | Nome dell’editor |
| --- | --- |
| `GEQ` | Graphic EQ |
| `PIA` | PIA 560 GEQ |
| `DEQ3` | Triple Dynamic EQ |
| `C5-CMB` | Combinator |
| `LIMITER` | Precision Limiter |
| `SPKMAN` | Speaker Manager |
| `DE-S2` | 2-Band DeEsser |
| `ENHANCE` | Ultra Enhancer |
| `EXCITER` | Exciter |
| `P-BASS` | Psycho Bass |
| `SUB` | Sub Octaver |
| `SUB-M` | Sub Monster |
| `V-IMG` | Velvet Imager |
| `DOUBLE` | Double Vocal |
| `PCORR` | Pitch Fix |
| `ROTARY` | Rotary Speaker |
| `PHASER` | Phaser |
| `PANNER` | Tremolo Panner |
| `TAPE` | Tape Machine |
| `MOOD` | Mood Filter |
| `BODY` | Bodyrez |
| `RACKAMP` | Rack Amp |
| `UKROCK` | UK Rock Amp |
| `ANGEL` | Angel Amp |
| `JAZZC` | Jazz Clean Amp |
| `DELUXE` | Deluxe Amp |

### EQ emulati nel rack — slot 1–16

| ID `mdl` | Nome dell’editor |
| --- | --- |
| `SOUL` | Soul Analogue |
| `E88` | Even 88 Formant |
| `E84` | Even 84 |
| `F110` | Fortissimo 110 |
| `PULSAR` | Pulsar |
| `MACH4` | Mach EQ4 |

### Channel strip complete nel rack — slot 1–16

| ID `mdl` | Nome dell’editor |
| --- | --- |
| `*EVEN*` | Even Channel |
| `*SOUL*` | Soul Channel |
| `*VINTAGE*` | Vintage Channel |
| `*BUS*` | Bus Channel |
| `*MASTER*` | Mastering |

Gli asterischi nelle ultime cinque stringhe sono presenti come parte degli ID nel dump dei modelli del protocollo. Per esempio `SOUL` è l’EQ singolo, mentre `*SOUL*` è la channel strip completa. Non rimuoverli trattandoli come semplice formattazione Markdown.

Le catene documentate sono: Even Gate + Even EQ + Even Comp/Limiter; Soul Gate + Soul EQ + Soul Comp; 76 + Pulsar + LA; Soul Warmth + Even 84 + Soul G Bus; Tape + Mach EQ4 + Enhancer + Precision Limiter. Ogni catena richiede accesso ai bypass e parametri dei suoi sottoblocchi.

## 3. Cosa significa “le loro interfacce”

Requisito di prodotto: aprendo un modello, deve comparire un editor dedicato e riconoscibile, con gli stessi nomi, unità, scelte discrete e rapporti fra i controlli della WING. La cornice di navigazione può restare Sculpt rossa, mentre il pannello di ogni processore conserva la propria organizzazione. Su iPhone il pannello può essere suddiviso in sezioni o pagine senza perdere parametri.

Il protocollo documenta valori, struttura, descrizioni e metering. Non fornisce un componente grafico nativo da incorporare. Le viste vanno ricostruite nell’app e collegate al motore che resta sulla WING. La disponibilità dei parametri remoti non equivale alla disponibilità di un rendering remoto della GUI.

| Famiglia | Contratto minimo dell’editor dedicato |
| --- | --- |
| 76, LA, Fairkid, No Stressor | Input/output o peak reduction, tempi e scelte di ratio proprie del modello, GR e mix quando previsti |
| Gate / PSE / Rider | Controlli effettivi del modello; sidechain e filtro solo se disponibili; meter con significato corretto |
| Pulsar | Sezioni P1a e M5, boost e attenuazione indipendenti, frequenze discrete, bypass dei blocchi |
| GEQ e PIA 560 | Bande verticali con frequenze corrette; trim/mix e curva complessiva coerenti |
| DEQ3 e C5 Combinator | Selezione bande, parametri per banda, solo/bypass e meter di riduzione |
| Speaker Manager | Filtri/crossover, fase/polarità, allineamento, dynamic EQ e limiter |
| VSS3 | Early reflections, tail/reverb, decay per bande, crossover, modulation e preset/load |
| Riverberi, delay, pitch | Layout proprio, tempi/sync/tap dove previsti, feedback/diffusion/modulation, routing wet/dry |
| Amp e Bodyrez | Controlli originali e selettori cabinet/modo effettivi; niente parametri inventati |
| Channel strip rack | Catena completa, stato e bypass di ogni sottoblocco, navigazione rapida tra sezioni |

La sezione rack deve mostrare numero slot, modello, assegnazione/insert, stato, accesso editor e livello di mix. L’assegnazione a un’altra strip può rimuovere quella precedente: il modello dati deve aggiornare entrambe, anziché duplicare virtualmente una singola istanza FX.

## 4. Collegamento remoto e stato

Percorsi base documentati: `/ch/n/flt/mdl`, `/ch/n/gate/mdl`, `/<famiglia>/n/eq/mdl`, `/<famiglia>/n/dyn/mdl`, `/fx/n/mdl`. I parametri dipendono dal modello istanziato. L’assegnazione insert appartiene ai nodi della strip (`preins/ins`, `postins/ins` quando presenti); i campi FX `$a_chn` e `$a_pos` sono read-only. Non usarli come comandi di assegnazione.

Il protocollo OSC consente di richiedere il contenuto di un nodo con `*`, la descrizione con `?`, descrizione e valori con `#`. Il modello della app deve:

1. Rilevare modello di console e firmware.
2. Leggere i valori e i metadati della sezione aperta; usare le enumerazioni live come autorità sul mixer collegato.
3. Dopo un cambio `mdl`, invalidare il vecchio insieme di parametri e caricare il nuovo prima di abilitare i controlli.
4. Distinguere interi, continui lineari/logaritmici, enumerazioni, booleani, trigger e read-only; il testo visibile non è sempre il valore da inviare.
5. Ricevere modifiche apportate da banco e altre app; mantenere un valore confermato dal mixer distinto dall’interazione in corso.
6. Attivare meter/RTA necessari alla vista aperta e rinnovare le sottoscrizioni; GR non è un generico meter audio.
7. Dopo riconnessione, rileggere lo stato: non rispedire automaticamente l’intera demo o una coda di modifiche offline.

Per la demo si possono implementare e verificare grafica, copertura dei controlli e persistenza; la verifica del suono e della corrispondenza con la WING richiede hardware.

## 5. Incongruenze rilevate nella documentazione

| Voce | Conflitto rilevato | Decisione per l’inventario |
| --- | --- | --- |
| Room Reverb | Appendice scrive `R-OOM`; elenco comandi e dump riportano `ROOM` | Usare `ROOM` come baseline; conferma live obbligatoria |
| Stereo Flanger | Appendice riporta `CHORUS`; elenco e dump distinguono `FLANGER` | Usare `FLANGER`; non sovrascrivere il catalogo Chorus |
| Velvet Imager | Appendice `V_IMG`; elenco e dump `V-IMG` | Usare `V-IMG`; confermare sul mixer |
| EQ standard uscite | Una riga della sesta banda Q è etichettata `7q` nell’appendice | Leggere il nome effettivo dal nodo e confrontare la tabella della famiglia |
| Parametri vari | Virgole, virgolette e numerazioni non uniformi; nomi ripetuti in alcuni blocchi combinati | Non generare scritture o range a partire da un parsing cieco dell’appendice |

Il JSON allegato contiene quindi l’inventario controllato di modelli e capacità, ma deliberatamente non una mappa eseguibile completa di tutti i parametri. I nomi dell’interfaccia sono normalizzati per leggibilità; gli ID sono quelli del selettore comandi, con eccezioni annotate.

## 6. Criterio di completamento per ciascun processore

Un editor è completo solo quando tutti i parametri applicabili sono raggiungibili, hanno unità e scelte corrette, i meter rappresentano il dato appropriato, le modifiche esterne sono ricevute e il salvataggio/richiamo di preset è coerente. In collegamento reale: controllo di valori estremi e discrete, rilettura del valore applicato, cambi modello, cambio assegnazione e bypass, scene che sostituiscono il modello, riconnessione e comportamento in ogni famiglia/slot ammesso.

La copertura va tracciata per **modello × contesto**, non con una percentuale unica basata sul numero di schermate disegnate. Un editor disegnato e funzionante in demo resta “demo verificata”; lo stato “WING verificata” richiede il banco.

## Fonti e tracciabilità

- **Fonte tecnica analizzata:** copia locale `wing_remote_protocols_v3.1.2a.md`, Patrick-Gilles Maillot, manutentore autorizzato da Behringer; sezioni *Effects Settings*, *Effects and Plugins*, *Effects and Plugins’ Parameters list* e tabelle CH/AUX/BUS/MAIN/MTX. La versione è dichiarata nell’intestazione del documento.
- **Pagina del manutentore con documento corrente:** https://sites.google.com/site/patrickmaillot/wing
- **Pagina ufficiale WING RACK:** https://behringer.com/en/products/0604-AAE — conferma 16 slot, otto universali e otto standard/channel.
- **PDF del protocollo linkato dalla pagina ufficiale al momento della ricerca:** https://cdn-media.empowertribe.com/2106004e217b8eb2639d93672823eef5/WING_Remote-Protocols-3.1-03.pdf — non acquisito integralmente da web search perché oltre il limite di dimensione; non affermare che coincida byte per byte con la copia locale.
- **Manuale WING series linkato dalla pagina ufficiale:** https://cdn-media.empowertribe.com/25951c6f808c0a79abc407c07d5639d1/User-Manual_WING-series_2025-10-20.pdf — riferimento di interazione da usare durante il lavoro sugli editor.
- **Effects Guide richiamata nel protocollo:** https://mediadl.musictribe.com/media/PLM/data/docs/P0BV2/EFFECTS%20GUIDE_M_BE_0603-AEN_WING.pdf — riferimento storico di layout; non usarla da sola come catalogo aggiornato.

Rilevazione: 13 novembre 2026. Nessun accesso hardware effettuato.
