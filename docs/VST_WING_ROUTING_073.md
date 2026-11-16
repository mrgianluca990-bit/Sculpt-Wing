# Percorsi WING del rack VST — 0.7.3

`dist/vst-wing-route.js` separa la posizione desiderata del rack dal routing applicato al mixer. Non modifica il callback DSP e non esegue patch alla connessione, al caricamento della pagina, di una sessione o di un preset.

## API

- `prepare(rack, { fxSlot? })`: legge valori e metadati e restituisce un piano opaco. Non scrive sulla WING né nel journal.
- `apply(plan)`: verifica nuovamente sessione, valori, schemi e motore fermo, quindi applica il piano. Un piano è monouso e scade dopo cinque minuti.
- `restore(rackId)`: ripristina il percorso precedente usando il journal del solo rack.
- `status(rackId)`: stato sincrono, senza rete; `active` richiede anche corrispondenza dei valori in cache, dispositivo audio, placement e porte del rack.
- `sourceFor(rackId)`: restituisce la sorgente fisica originale soltanto per un PRE ancora verificato. Consente alla UI di indirizzare i controlli del preamplificatore originale.
- `backup(rackId)`: copia del journal, disponibile per esportazione o revisione.

Gli stati interni sono `idle`, `prepared`, `applying`, `active`, `restore-required`, `conflict` e `wrong-console`. L’evento `sculpt-vst-route-state` viene emesso solo quando cambia lo stato. I valori remoti ordinari arrivano da `SculptController` con `live-values`; sono osservati anche gli eventi `sculpt-live-state` e `sculpt-vst-state`, senza polling o nuove scritture.

Il modulo CJS espone `create({ getLive, getVst, storage, dispatch, subscribe, now })` per test isolati.

## Percorsi

| Posizione | Mandata al computer | Ritorno | Risorse del mixer |
| --- | --- | --- | --- |
| PRE | Ingresso fisico originale, dopo HA, verso le uscite USB scelte | Sorgente USB su ALT del canale; AUTO disattivato localmente | Nessuno slot FX o insert; MAIN, gain e phantom preservati |
| Insert 1 | FX SEND L/R dello slot External scelto | `egrp=USB`, `ein`, `emode` nello stesso External | `preins`, uno slot FX globale |
| Insert 2 | FX SEND L/R dello slot External scelto | Come Insert 1 | `postins`, uno slot FX globale; AutoMix occupato viene rifiutato |

PRE ammette sorgenti fisiche dirette LCL, AUX, AES50 A/B/C, StageConnect e AES. M/S, USER, playback, USB e direct out come sorgente PRE non vengono convertiti automaticamente. Le selezioni AUTO/ALT discordanti richiedono una selezione manuale verificabile sul banco. Lo stereo richiede larghezze coerenti e un ritorno USB dispari/pari; le assegnazioni USB nei rack sono zero based, mentre il protocollo WING usa indici da 1.

Gli insert usano uno slot NONE/External libero o l’External già assegnato a quello stesso punto. Tutti i 76 canali/bus vengono controllati per le assegnazioni insert, comprese quelle disattivate. Il gruppo SEND è verificato sui 32 nodi read-only; il profilo documentato 3.0/3.1 associa FX1 a SEND1/2, FX2 a SEND3/4 e così via. Non viene calcolato alcun offset dal numero del canale. Firmware diversi richiedono verifica prima di abilitare questo mapping.

Vengono rilevate collisioni fra rack, MAIN/ALT USB, USER PATCH che usano USB e altri External. Il ritorno di un insert non può anche alimentare MAIN/ALT del proprio canale. I controlli USER leggono le assegnazioni delle singole patch; non assumono che le sorgenti fisiche siano adiacenti.

`fxmix` viene impostato a 100%, `trim` a 0 dB. `lat` non viene modificato: è compensazione del percorso dry dell’External, non una misura o riduzione automatica della latenza del computer.

## Scrittura e ripristino

Il canale viene mutato temporaneamente; il ritorno viene attivato dopo le altre assegnazioni. Ogni scrittura usa lo schema atteso e richiede readback. Il protocollo non offre una transazione atomica: vengono usati preflight, journal prima della scrittura e ripristino condizionale.

Il journal locale `sculpt-wing-vst-routing-v1` è limitato in dimensione, con whitelist dei percorsi, e legato a host, modello, nome e firmware della console. Un backup ricaricato resta `restore-required` e non viene eseguito automaticamente. Il restore verifica anche eventuali nuovi utilizzatori delle risorse. Se un valore non coincide più con quello scritto o con quello originale, non viene sovrascritto: il backup rimane accessibile. Un cambio di sessione interrompe l’operazione.

Per NONE→EXT, i parametri del nuovo modello vengono letti e validati dopo il caricamento. Se i metadati non sono sufficienti, il modulo tenta di riportare lo slot a NONE. Prima di un successivo scaricamento del nuovo External vengono controllati anche i parametri originariamente lasciati ai valori di default, compreso `lat`, per preservare modifiche esterne.

## Riferimenti e verifica

- [WING Remote Protocols 3.1, edizione 03](https://cdn-media.empowertribe.com/2106004e217b8eb2639d93672823eef5/WING_Remote-Protocols-3.1-03.pdf): percorsi IO/insert/External; p.43 USER Signals 1–24 e USER Patches 25–56; p.97 tipi e unità numeriche del protocollo.
- [WING Remote Protocols FW 3.1](https://cdn.mediavalet.com/aunsw/musictribe/XMBvOXMlIUC8kWwelBIOpg/NFeKk1IPIkiPCjtv1L-YVQ/Original/WING%20Remote%20Protocols%20FW%203.1.pdf): p.25, `fxmix` linear float 0–100%, `$a_chn` 0–76 e `$a_pos` 0–1.
- [AoIP-WSG Quick Start Guide](https://cdn-media.empowertribe.com/fce178bb208e6b9993867ecddff60e89/FACE-PRIN-PH1_QSG_BE_0606-ADN_AoIP-WSG_A4_WW_2024-05-17_Rev.0.pdf): External FX, FX SEND L/R e routing diretto degli ingressi fisici prima del channel processing, figure 7–8.
- [WING RACK Quick Start Guide](https://cdn-media.empowertribe.com/b23f23043383473399f9cc7c4d812a51/QSG_BE_0604-AAE_WING%20RACK_WW.pdf): insert pre/post, sorgenti mono/stereo, User Patches e USB 2–48 canali.

Verifica mirata: `node --test tests/vst-wing-route-073.test.cjs`. Le fixture riproducono metadati del protocollo, variazioni del modello EXT, readback, modifiche concorrenti e cambi di sessione. Questi test non sostituiscono una prova su WING fisica: questa implementazione non è stata collaudata con hardware o audio USB reale.
