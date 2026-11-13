# Sculpt Wing — perimetro completo WING: I/O, controllo e sistema

Verifica documentale: 13 novembre 2026. Questo è un inventario per lo sviluppo, non una dichiarazione di funzioni già implementate o provate sul mixer.

## Base documentale

La mappa dei nodi usa il documento locale **WING Remote Protocols V3.1.2-a — WING FW 3.1.2 and above**, di Patrick-Gilles Maillot, che si dichiara autorizzato da Behringer a pubblicare e mantenere il protocollo. File consultato: `wing_remote_protocols_v3.1.2a.md`.

La pagina ufficiale WING RACK consultata oggi elenca firmware 3.1.2 e WING Edit 3.3.4. Il download ufficiale del protocollo è etichettato 3.1: non è stato assunto che il PDF coincida byte per byte con la revisione locale 3.1.2-a. Le fonti primarie correnti sono elencate in fondo.

## Matrice delle aree da coprire

I percorsi con `{n}`, `{gruppo}` e simili sono schemi esplicativi; vanno risolti negli indici e nei nomi effettivamente annunciati dal banco. Non sono comandi da inviare letteralmente.

| Area | Funzioni da prevedere | Nodi o interfaccia documentata | Limiti da rispettare |
| --- | --- | --- | --- |
| Identificazione | Nome, modello, firmware, hardware, seriale, scheda e modulo installati | Discovery `WING?`; `/$syscfg/$firmware`, `$cnscfg`, `$cnsmdl`, `$hwversion`, `opt_mod`; `/cards/$type` | Costruire le capacità dal dispositivo collegato. Non usare la scheda marketing come schema del protocollo. |
| Sorgenti I/O | Nome, colore, icona, tag; mono/stereo/M/S; mute e polarità della sorgente | `/io/in/{gruppo}/{n}` | La sorgente è distinta dal canale di processing. La modifica di una sorgente può interessare più canali che la utilizzano. |
| Preamplificatori | Gain analogico e +48 V, HA remote, stato della sorgente remota, compensazione ricezione dove disponibile | `/io/in/LCL/{n}/g`, `vph`; analoghi sotto A/B/C/SC; `rmt`, `$ract`, `$rdest`, `rcvc`; `/$globals/harmt/{a,b,c}` | Esporre solo controlli realmente presenti. Gain analogico e trim digitale sono parametri diversi. Il comportamento dipende da preamp, stagebox e ownership. |
| Patch dei canali | Main e Alt per tutti i 40 CH e gli 8 AUX, selezione individuale e globale, automazione del cambio sorgente | `/ch/{n}/in/conn/{grp,in,altgrp,altin}`; equivalente `/aux`; `/in/set/{srcauto,altsrc}`; `/io/{altsw,autoaltovr}` | Non confondere Main/Alt delle sorgenti con i quattro bus MAIN. Leggere entrambi i patch prima di una modifica. |
| Controlli d’ingresso | Trim, bilanciamento, polarità, ritardo e unità, stato mono/stereo/M/S | `/ch/{n}/in/set`; `/aux/{n}/in/set` | Il modo del canale deriva dalla sorgente. Per gain e phantom leggere anche la disponibilità effettiva del controllo. |
| Patch delle uscite | Assegnazione di ogni uscita fisica/digitale a una sorgente, BUS, MAIN, MTX, SEND, MON o USER | `/io/out/{gruppo}/{n}/{grp,in}` | Routing interno alla WING: non equivale alla configurazione della rete audio esterna. Il numero delle porte dipende dall’hardware. |
| USER SIGNAL / USER PATCH | Creare routing interno con tap e selezione L/R; combinare sorgenti fisiche non adiacenti | `/io/in/USR/{n}/user/{grp,in,tap,lr}` | La tabella 3.1.2-a distingue **1–24 User Signals** e **25–56 User Patches**. Alcuni testi narrativi e la tabella safes conservano vecchi conteggi: verificare il nodo live. |
| Processing e insert | Ordine di Gate/EQ/Dynamics/Insert, insert pre/post, stato di assegnazione, EQ dedicato al tap, sidechain | `/ch/{n}/proc`, `/preins`, `/postins`, `/peq`; alberi specifici di CH/AUX/BUS/MAIN/MTX | Le famiglie non hanno tutte gli stessi slot. La selezione algoritmo cambia il sottoalbero di parametri. Gli FX condivisi sono risorse del rack. |
| Send e SOF | Mandate a BUS/MTX/MAIN, PRE/POST/GRP, pan, pan link, comportamento rispetto al mute, tap | `/ch/{n}/send/{b}`, `/send/MX{m}`, `/main/{m}`; equivalenti consentiti per AUX/BUS/MAIN | La UI deve rispettare i percorsi legali. Il parametro `pon` e il pan link non sono una semplice copia del mute/pan principale. |
| DCA e mute groups | Livelli, mute, solo, nomi, colori, assegnazioni, spill e override | `/dca/{n}`, `/mgrp/{n}`, tag delle strip; `/cfg/dcamgrp`; `/$ctl/cfg/{muteovr,dcaspill}` | **16 DCA e 8 mute groups** nel protocollo 3.1.2-a. Le vecchie schede che riportano 8 DCA non sono una base corretta per lo sviluppo attuale. |
| Automix | Gruppi X/Y, partecipazione e peso dei canali | `/cfg/amix/{x,y}`; `/ch/{n}/postins/{mode,w}` | La modalità post insert comprende FX/AUTO_X/AUTO_Y. Non è solo un pulsante globale. |
| Monitor e solo | Monitor A/B, sorgenti, direct in, livelli, pan/width/polarità, EQ, limiter, delay, dim, mono, PFL/AFL e SIP | `/cfg/mon/{1,2}`, `/cfg/solo` | Alcuni livelli sono assenti o in sola lettura quando il modello li controlla con potenziometri fisici. Capability discovery obbligatoria. |
| Talkback | Sorgente CH40/AUX8, Talk A/B, momentaneo/latch/auto, destinazioni BUS/MTX/MAIN, dim e livelli individuali | `/cfg/talk`, `/cfg/talk/{A,B}`, assegnazioni `B1…B16`, `MX1…MX8`, `M1…M4` | L’app controlla il talkback del banco. L’audio del microfono iPhone non è automaticamente una sorgente WING. |
| Oscillatori | Due generatori, modo/segnale, frequenza e livello; routing come sorgente | `/io/in/OSC/{1,2}/osc/{lvl,mode,f}` | Il generatore audio rimane nel DSP della WING. |
| Meter e RTA | Meter di sorgenti, canali, gruppi e FX; GR, stati gate/dyn, analisi RTA, tap, range, detector e decay | Canale binario metering; `/cfg/{mtr,rta}`; `/$ctl/cfg/rta` | RTA e meter richiedono streaming, rinnovo delle sottoscrizioni e conversioni corrette. Non basta leggere saltuariamente un fader. Alcuni controlli RTA sono marcati RO o specifici della vista. |
| USB Player/Recorder | Playlist/file attivo, transport, seek, repeat, metadati; registrazione 2/4 canali, 16/24 bit, nome file | `/play`, `/rec`; routing `/io/in/PLAY`, `/io/out/REC` | I file sono sulla memoria del mixer. Un trasferimento file da iPhone alla WING non è dimostrato da questi soli nodi di transport. |
| WING-LIVE | SD A/B, transport, sessioni, nomi, marker, tempo, loop, numero tracce, link, spazio e stato; cambio Main/Alt legato a transport | `/cards/wlive`, `/cards/wlive/{1,2}/{$ctl,cfg,$stat}` | Solo quando WING-LIVE è installata. Sostituire la scheda con W-DANTE modifica le risorse disponibili; un modulo Dante interno può invece coesistere con WING-LIVE. |
| Library e Show | Show, scene, snapshot, snippet, preset canale/FX, audio clip, richiami e navigazione | `/$ctl/lib/{$scenes,$actshow,$active,$action,$actionidx,$activeid}`; formato snapshot JSON | I comandi GO/NEXT/PREV/GONEXT/GOPREV/GOTAG sono documentati per uno show già aperto. **Creazione, apertura, modifica, import/export e gestione file completa richiedono verifica dedicata:** non sono provati da quel solo elenco OSC. |
| Recall scope e safes | Ambiti di richiamo, safes per strip, sorgenti, uscite, FX, DCA, mute, setup e superficie | `/$ctl/safes`; oggetto `scopes` nei file snapshot; appendice Scopes and Safes | Safes e scope sono distinti. RESTORE e INITIALIZE non hanno la stessa semantica di LOAD/GO. Non emulare un richiamo WING con una scrittura indistinta di tutto lo stato. |
| Setup audio | Clock e lock, sample rate, USB channel count, Main link, mute startup, StageCONNECT | `/$globals/{clkrate,clksrc,usbacfg,startmute,sccfg}`; `/cfg/mainlink`; `/$stat/{lock,ppm}` | Clock esterno e hardware installato condizionano le scelte. Mostrare stato confermato dal mixer. |
| Setup rete e remoto | DHCP/statico, IP/mask/gateway, nome, modo Ethernet, remote lock, MIDI, DAW | `/$syscfg`; `/$ctl/OSC/ronly`; `/$ctl/midi`; `/$ctl/daw` | Cambiare rete può interrompere la connessione. Alcune tabelle hanno refusi nei percorsi: verificare via descrizione live dei nodi. |
| Custom Controls e superficie | Pulsanti/encoder, GPIO, layer, spill, assegnazioni CC/MIDI/FX/scene, preferenze | `/$ctl/user`, `/$ctl/gpio`, `/$ctl/layer`, `/$ctl/cfg` | Alcuni elementi sono specifici Full/Compact/Rack. Separare layout locali Sculpt da layout della superficie hardware. |
| Diagnostica | Stato AES50, dispositivi, errori corretti/non corretti, StageCONNECT, card, SD, sincronismo | `/$stat/{A,B,C}`, `/$stat/sc_*`, `/cards`, `/cards/wlive/{n}/$stat` | Gli errori di rete audio non vanno ridotti a un solo indicatore “connesso”. |

## Struttura del menu I/O proposta

Cinque viste, mantenendo riconoscibile il percorso WING:

1. **Sorgenti** — lista per gruppo, nome, modo, gain, phantom e stato; ricerca e assegnazioni dei canali che usano la sorgente.
2. **Ingressi** — 40 CH + 8 AUX, patch Main/Alt affiancato, cambio globale e individuale.
3. **Uscite** — destinazioni fisiche/digitali a sinistra, sorgenti selezionabili a destra; patch singola e sequenziale con riepilogo delle assegnazioni.
4. **User** — User Signals e User Patches, tap e L/R dove previsti dal nodo.
5. **Dispositivi e clock** — AES50, StageCONNECT, card/modulo, USB e sincronismo, con capacità e stato reale.

Il banco della demo resta la pagina principale. Un menu compatto può aprire Mixer, Canale, FX, I/O, Monitor, Meter/RTA, Recorder, Library e Setup senza ripristinare una testata ingombrante.

## Gruppi I/O e configurazione WING RACK

| Gruppo del protocollo | Significato | Dimensione documentata / vincolo |
| --- | --- | --- |
| LCL | Analogico locale | Rack: 24 ingressi e 8 uscite. Full-size: non assumere i medesimi ingressi. |
| AUX | Prese analogiche AUX della famiglia WING | Il Rack non ha le prese AUX analogiche del full-size. Questo **non elimina** gli 8 canali AUX di processing. Alcune destinazioni AUX/monitor richiedono verifica del modello. |
| A, B, C | AES50 | Fino a 48 ingressi e 48 uscite per porta; stato e controlli dipendono dai dispositivi connessi. |
| SC | StageCONNECT | 32 canali complessivi con ripartizione upstream/downstream configurabile, non 32+32 simultanei. |
| USB | Interfaccia audio USB | Fino a 48×48; configurazione 2/2, 8/8, 16/16, 32/32 o 48/48. |
| CRD | Scheda di espansione | Fino a 64×64; WING-LIVE, W-DANTE, W-MADI o altra scheda rilevata. |
| MOD | Modulo interno | Fino a 64×64 se installato; tipo rilevabile. |
| PLAY / REC | USB player / recorder | Fino a 4 canali del sistema di riproduzione/registrazione. |
| AES | AES/EBU | Due canali in/out. |
| USR | User Signal / User Patch | Tabella 3.1.2-a: 24 Signals + 32 Patches. Verificare enum e nodi reali. |
| OSC | Oscillatori | Due sorgenti interne. |

Sul Rack, le quattro uscite cuffie IEM riprendono le coppie delle uscite locali 1/2, 3/4, 5/6 e 7/8. Non presentarle come otto nuovi bus o otto destinazioni audio indipendenti dalle uscite locali. La quinta uscita cuffie è quella generale di monitoraggio.

### Confine Dante

È documentato il routing WING verso/da card o modulo Dante e la selezione della relativa sorgente di clock. **Non è stata trovata evidenza in questo protocollo di API per gestire le subscription tra dispositivi Dante, i flow multicast o tutta la configurazione Dante Controller.** Il menu I/O deve includere i canali Dante disponibili sul mixer; una eventuale gestione della rete Dante completa costituisce un’integrazione ulteriore da verificare.

## Condizioni per poter dichiarare una funzione completa

Per ogni area servono: UI specifica, stato offline coerente, lettura iniziale reale, scrittura con riscontro, aggiornamento quando il banco o un’altra app modifica il parametro, ripristino dopo disconnessione e prova sul modello/firmware selezionato. Un controllo disegnato nella demo non soddisfa gli ultimi quattro punti.

La descrizione dei nodi deve guidare range, unità, enum e flag di sola lettura. Questa scelta risolve anche differenze hardware e refusi della documentazione, senza cambiare arbitrariamente valori.

Per più controller contemporanei il protocollo segnala un limite di 24 client TCP; una singola app può usarne più di uno. La sottoscrizione OSC è unica e passa all’ultimo richiedente, con rinnovo entro 10 secondi. I meter nativi hanno rinnovo entro 5 secondi. Sono vincoli da includere nell’adattatore di controllo, soprattutto se Sculpt deve convivere con Mixing Station o WING Edit.

Le seguenti operazioni rimangono punti espliciti da verificare: gestione file e Library completa, RESTORE/INIT, aggiornamento firmware, accesso ai supporti USB/SD da tablet, diagnostica e configurazioni della scheda specifica, controlli legati a potenziometri fisici. Non ridurre l’obiettivo, ma non dichiarare parità totale prima di averli coperti.

## Fonti e verifica

- Protocollo locale analizzato: **WING Remote Protocols V3.1.2-a**, sezioni General Configuration, System Settings, Input/Output Settings, Channel/Aux/Bus/Main/Matrix Settings, Cards, USB, Control, Global Settings; appendici Routing, Shows/Scenes, Scopes/Safes, Dante/WSG e Metering.
- Scheda e download ufficiali WING RACK: https://behringer.com/en/products/0604-AAE — consultata il 13 novembre 2026; identifica firmware 3.1.2, I/O del Rack e documenti correnti.
- Manuale linkato dalla pagina ufficiale: https://cdn-media.empowertribe.com/25951c6f808c0a79abc407c07d5639d1/User-Manual_WING-series_2025-10-20.pdf — il lettore web ha rifiutato il download per dimensione; non usato per attribuire passaggi non letti.
- Protocollo linkato dalla pagina ufficiale: https://cdn-media.empowertribe.com/2106004e217b8eb2639d93672823eef5/WING_Remote-Protocols-3.1-03.pdf — lettore web limitato dalla dimensione; inventario tratto dalla copia locale identificata sopra.
- Note firmware 3.1.2: https://cdn-media.empowertribe.com/9773eacaebb1ba29df804c96d69cfca1/WING-firmware-3.1.2_release-notes.pdf — verificate: correzioni a indicazione pan link delle mandate, avvio di specifiche card Dante e latenza al cambio ordine dei processori.
- Copia precedente indicizzata del protocollo presso CDN Music Tribe: https://cdn.mediavalet.com/aunsw/musictribe/XMBvOXMlIUC8kWwelBIOpg/NFeKk1IPIkiPCjtv1L-YVQ/Original/WING%20Remote%20Protocols%20FW%203.1.pdf — non assumere identità di revisione con il locale 3.1.2-a.

Nessuna prova hardware svolta in questa analisi; nessuna modifica all’interfaccia pubblicata.
