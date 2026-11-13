> Documento storico. Per preparare i sorgenti di questo repository prima di aprire Xcode, seguire la [guida iOS aggiornata](../native/README.md): `npm ci` e `npm run ios:sync` nella cartella `native`.

# Stato reale della versione 0.5

## Implementato

| Area | Comportamento implementato |
| --- | --- |
| Trasporto | Plugin Swift TCP/UDP diretto, sessioni isolate, lifecycle, rete locale, IP manuale |
| Schema | Definizioni e hash letti dal firmware, enum tipizzati, limiti/read-only, invalidazione al cambio modello |
| Mixer | Fader/mute/pan/solo delle 76 strip, nomi e colori effettivi, AUX separati dai BUS |
| Mandate | SOF BUS/MTX, mandate e assegnazioni MAIN con percorsi distinti per famiglia |
| Processori | Catalogo di 109 definizioni, 1116 controlli; schema live per parametri, modello, preset e trigger |
| I/O | Main/Alt, sorgenti condivise, preamp/phantom reali ove presenti, uscite fisiche e USER |
| Gruppi e monitor | Mappature documentate DCA, mute group, automix, solo, monitor, talkback, oscillatori |
| Meter | Pacchetti reali IN/OUT stereo di CH, AUX, BUS, MAIN e MTX; valori scaduti nascosti |
| Recorder e show | Comandi documentati SD A/B, USB recorder/player e show control; stato riletto dal banco |
| Explorer | Accesso alla struttura completa dichiarata dal firmware, anche per funzioni senza GUI dedicata |
| Demo | Stessa interfaccia nel browser, stato locale ed esperienza offline; nessun collegamento hardware simulato come reale |

## Confini espliciti

- **Nessun collaudo fisico effettuato**: non era disponibile una WING collegata.
- **Nessuna compilazione Xcode o firma effettuata**: l’ambiente di sviluppo disponibile è Linux. L’archivio contiene il progetto Xcode e il bundle pronto, non un IPA installabile.
- Le interfacce sono originali Sculpt, con organizzazione per modello. Non sono le schermate ufficiali di WING EDIT e non implementano gli algoritmi DSP sull’iPhone.
- RTA, gain reduction calibrata per ogni modello e meter DCA/slot FX non sono ancora acquisiti. In modalità live non vengono sostituiti con animazioni finte.
- La precisione di conferma dei fader nativi e la latenza su Wi-Fi devono essere validate sul banco. Lo schema fader non espone una curva di quantizzazione completa.
- Il catalogo documentale contiene due campi `peak` ambigui nel modello CMB. La GUI non invia quei due comandi finché non è risolta la corrispondenza; l’explorer mostra lo schema effettivo.
- L’assegnazione ai mute group, alcune preferenze monitor, icone arbitrarie, liste di destinazioni degli oscillatori e altri controlli di comodità senza una corrispondenza documentata non vengono tradotti in comandi inventati. Vedi `LIVE_MAPPING.md` per il dettaglio.
- I/O verso CH/AUX processati richiede USER SIGNAL dove previsto da WING; il selettore fisico non inventa ingressi di routing inesistenti.
- Le scene e i progetti JSON della demo restano file Sculpt. Il pannello live usa il controllo dello show già aperto sulla WING. Il browser dei file del mixer e l’import/export di snapshot WING non sono implementati come file manager.
- Nessuna integrazione automatica con altre applicazioni Sculpt è stata inventata: serve il contratto d’interscambio delle altre app.

## Evidenza delle verifiche

Le verifiche del software includono codec con byte attesi, definizioni sintetiche indipendenti, uso degli stessi hash per modelli differenti, annullamento di gesti obsoleti, readback, coda/coalescing e isolamento delle riconnessioni. I test GUI verificano il rendering dei 109 processori e degli editor delle 76 strip. Le prove browser controllano form, layout e interazioni; non dimostrano il funzionamento dell’hardware Apple o WING.

I risultati esatti del rilascio sono in `VERIFICA_0.5.md`.

## Fonti tecniche

- WING Remote Protocols, Patrick-Gilles Maillot / documentazione Behringer: https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md . Riferimento locale 3.1.2a; il driver legge comunque lo schema del mixer collegato.
- Manuale WING series: https://cdn-media.empowertribe.com/25951c6f808c0a79abc407c07d5639d1/User-Manual_WING-series_2025-10-20.pdf .
- Capacitor iOS: https://capacitorjs.com/docs/ios .
