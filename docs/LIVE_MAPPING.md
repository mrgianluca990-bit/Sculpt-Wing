# Mapping WING della versione 0.5

`dist/wing-map.js` traduce lo stato dell'interfaccia in candidati di percorso WING e applica i valori ricevuti al modello locale. Non apre socket e non autorizza scritture. Il coordinatore deve risolvere ogni percorso nella sessione corrente, leggere il valore e rispettare tipo, range, enum e sola lettura dichiarati dal banco. I nomi degli hash e il significato dei parametri cambiano con il modello del processore.

## Contratto

| API | Risultato |
| --- | --- |
| `capture(state)` | `Map<string, number\|string>` dei valori rappresentati, già convertiti nel formato di valore WING; nessuna mutazione dello stato. Comprende valori RO per lettura/riscontro. Esclude i trigger momentanei. |
| `apply(state,path,value)` | Applica un valore ricevuto e ritorna `true` per un percorso mappato; rifiuta percorsi sconosciuti e numeri non validi. |
| `descriptors(state)` | Metadati di mapping: `path`, `type`, `section`, eventuali `stripId`, `targetId`, `processor`, `parameter`, `readOnly`, `trigger`. Non sostituiscono le definizioni live. |
| `processorSpec(ctx,model?)` | `basePath`, `modelPath`, `enabledPath`, `mixPath`, `parameterPath(key)`, `ambiguousKeys`. In browser il modello omesso viene letto da `SculptDesk.processor(ctx)`. |
| `stripPath(id)` | Percorso base validato dei 40 CH, 8 AUX, 16 BUS, 4 MAIN e 8 MTX. |
| `sourcePath(id)` | Percorso della sorgente fisica/digitale, ad esempio `LCL:1` → `/io/in/LCL/1`; non confonde un AUX analogico con un AUX di processing. |
| `sendBasePath(from,to)` | Nodo della mandata o `null` per una relazione non supportata. |
| `sendPath(from,to,key='level')` | Foglia della mandata: `level`, `on`, `pre`, `mode`, `pan`, `panLink`, `followMute`; ritorna `null` quando il parametro non esiste in quella famiglia. |
| `readPaths(state,scope,args)` | Sottoalberi immediati o foglie necessari al contesto. Vedere sotto. |

Lo stato può essere quello vivo con `inputs`/`outputs` oppure uno snapshot `SculptController.capture()` con `values`. `desk._wing.values` conserva i valori ricevuti: evita di riscrivere un livello sotto il fondo scala grafico, un indice colore o il terzo stato del pan link solo perché la UI li rappresenta in modo semplificato. Questa chiave è diagnostica e va esclusa dal confronto dei controlli non mappati e dalle modifiche dell'utente.

`capture()` **non deve essere inviato per intero al mixer**. Si confrontano snapshot prima/dopo un gesto, scartando i descrittori RO e accodando esclusivamente parametri già letti nella sessione. Il collegamento e la riconnessione non devono riprodurre lo stato demo.

### Letture contestuali

- `core`: foglie dei fader, mute, pan, solo e identità delle 76 strip.
- `strip`, `{id:'ch-1'}`: nodo strip e gruppi immediati `in/set`, `in/conn`, processori, insert, sidechain, filtri e routing pertinenti.
- `processor`, un contesto processore: nodo `/fx/N`, `/ch/N/eq`, `/ch/N/dyn`, `/ch/N/gate` o `/ch/N/flt`.
- `sends`, `{targetId:'bus-1'}` o `{fromId:'ch-1'}`: nodi delle mandate, deduplicati.
- `io`, `{direction:'inputs',start:1,count:8}`: otto strip di ingresso con patch Main/Alt.
- `io`, `{direction:'in'|'out',group:'LCL',start:1,count:8}`: porte per pagina. Per USR comprende anche il nodo `user`.
- `source`, `{id:'LCL:1'}`: sorgente e relativo sottogruppo USER/OSC, se presente.
- `inserts`: gruppi `preins`/`postins` delle strip per rilevare la reale assegnazione degli slot FX.
- `groups`, `monitor`, `fx`: gruppi immediati necessari ai rispettivi pannelli.

Le capacità restituite dal firmware prevalgono sui massimi documentali; una porta o una foglia candidata può mancare, essere RO o dipendere da scheda, modulo e preamplificatore.

## Relazioni implementate

| Area | Relazione con il protocollo |
| --- | --- |
| Strip | `fdr`, `mute`, `pan`, `$solo`, `wid`, `mon`, trim/polarità/balance, ritardo e unità. |
| Nomi e colori | `$name`/`$col` sono identità effettive RO. Con `clink=1` una rinomina/colore nell'input viene tradotta verso la sorgente condivisa; `name`/`col` locali restano separati. |
| Ingressi | Main/Alt è `in/conn/{grp,in,altgrp,altin}`, con `srcauto` e `altsrc`. I due componenti della patch sono ricomposti anche se arrivano in ordine opposto. |
| Send CH/AUX | `send/1..16`, `send/MX1..MX8`: `lvl`, `on`, `mode`, `pon`, `plink`, `pan`. `pon=1` equivale a ignorare il mute del canale. |
| Send BUS/MAIN | BUS→BUS/MTX e MAIN→MTX usano `pre` booleano; non hanno il medesimo selector `mode` degli ingressi. Le assegnazioni ai MAIN usano `main/N/{on,lvl,pre}`. |
| Processori | Modelli e chiavi sorgente del catalogo completo. Filter CH usa `/flt` e abilitazione `/tf`. EQ/Dyn/Gate usano `/on`. Il mix del rack è `fxmix`, distinto dal `mix` interno di alcuni algoritmi. |
| Insert | L'assegnazione è `/strip/preins/ins` oppure `/postins/ins`, valore `FX1..FX16`/`NONE`. Il bypass del rack agisce sullo switch dell'insert assegnato; **non viene inventato `/fx/N/on`**. |
| Sorgenti I/O | Mode, mute, polarity, identity, gain/+48 V/HA remoto dove previsti. Un ingresso USB o Card non riceve un gain analogico sintetico. Il trim digitale resta nel canale. |
| Uscite | Coppia `/grp` + `/in`. BUS/MAIN/MTX/MON/SEND usano indici L/R interlacciati. CH/AUX processati passano da USER SIGNAL: non sono tradotti in gruppi inesistenti del selector uscite. |
| USER | 1–24 SIGNAL, 25–56 PATCH; dominio delle sorgenti distinto. Gli AUX di processing sono `AUXP` nella UI ma `AUX` nel selector USER SIGNAL. |
| Gruppi | DCA fader/mute/solo/nome e appartenenza tramite tag riservati `#D1..#D16`, preservando gli altri tag. Mute-group nome/mute. Automix X/Y tramite `postins/mode` e `w`. |
| Monitor/talk | Livello/sorgente/stereo/EQ monitor; dim/mono/mute solo condivisi; Talk A/B, sorgente CH40/AUX8, destinazioni e livello talk condiviso. L'abilitazione oscillatore usa il mute della sua sorgente. |

## Comportamento I/O connesso

`dist/io.js` attende la lettura contestuale prima di mostrare i valori. Nell'editor sorgente carica il nodo richiesto e abilita solo i controlli letti e scrivibili. Non mostra il trim sorgente simulato nella modalità live. L'uscita seleziona soltanto i gruppi compatibili e propone USER per tap e canali processati. La vista Dispositivi porta ai nodi reali del firmware, senza presentare profili di stagebox simulati come rilevamento hardware. L'export live contiene soltanto valori effettivamente letti; l'import di un intero patch demo rimane disponibile in modalità demo.

## Confini espliciti

`coverage.unmapped` elenca i controlli senza una traduzione verificata. In particolare:

- La tabella CMB pubblica due parametri chiamati `peak`. Entrambi vengono esclusi dalla mappa generata; si usa la descrizione live per disambiguare.
- L'appartenenza ai mute groups non viene inventata a partire dai tag DCA.
- Recorder, file, Library/Show, setup rete/audio, custom controls, diagnostica e controlli specifici hardware si raggiungono dal browser dei parametri WING; questa mappa non dichiara pannelli dedicati completi.
- Monitor delay in millisecondi, interruttore limiter, preferenze solo prive di equivalente, livelli Talk A/B separati e lista di destinazioni OSC demo non vengono tradotti arbitrariamente.
- Nomi simbolici delle icone, trim digitale della sorgente e tap delle uscite senza USER restano fuori dalla mappa.

## Verifica

`node --test tests/wing-map.test.cjs` verifica 18 casi: 76 strip, mutazioni pure/snapshot, quantizzazione e silenzio, famiglie send, modelli dinamici, enum numerici ricevuti dal firmware, tutte le chiavi catalogo non ambigue, mix/bypass, filtri, preamp, identità linkata, patch Main/Alt, stereo output, USER, DCA/automix, monitor/talk e letture per contesto.

`node --test tests/io-live.test.cjs` usa jsdom dalle dipendenze native per controllare il blocco dei dati demo prima della lettura, i valori realmente restituiti nel form, il percorso errore, i parametri I/O non inventati e il mantenimento della modalità offline. Non sostituisce una prova Safari o sul mixer.

`node --test tests/systems-live.test.cjs` verifica 8 casi dedicati a prelettura delle macro, rifiuto delle mutazioni, attesa della conferma delle scritture, transport asincrono, meter stereo reali e scaduti, idratazione dei gruppi, aggiornamenti senza perdita di focus, oscillatori e controllo obbligatorio delle macro. Gli 8 test precedenti in `tests/system-actions.test.cjs` restano compatibili.

Le pagine I/O, gruppi e monitor ricevono gli aggiornamenti esterni nei controlli non attualmente modificati. In live il meter bridge usa i valori nativi; GR, RTA, DCA e FX non vengono simulati. I controlli non letti restano disabilitati, e i dettagli non mappati si aprono nell’esploratore nativo.

Fonte: [WING Remote Protocols](https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md), copia locale V3.1.2-a con sezioni Channel/Aux/Bus/Main/Matrix, Input/Output, General Configuration, DCA/Mutegroup, Effects e appendici dei plugin/routing. Nessuna prova hardware è stata eseguita da questo modulo.
