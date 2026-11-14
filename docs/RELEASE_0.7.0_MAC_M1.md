# Sculpt Wing 0.7.0 · Mac M1 / Apple Silicon

Aggiornamento preparato il 14 novembre 2026 dalla base 0.6.8. Questa consegna contiene i sorgenti, i test e il workflow di compilazione; la nuova app Mac deve ancora essere compilata e provata sul banco.

## Correzioni richieste durante la prova con la WING

### Applicare la scena preparata dal PDF

**Importa channel list → PDF → anteprima → Applica scena** è ora disponibile anche con una WING collegata. Occorre attendere la sincronizzazione e attivare **Controllo** nella pagina Connessione WING.

L’anteprima conserva le schede Canali, Strumenti, Mandate e Rimanenti e le rispettive modifiche. Applica prepara una sola operazione di cronologia, legge i parametri necessari e controlla tutta la proposta prima di iniziare l’invio. Durante l’operazione mostra il progresso della lettura e delle scritture. Il risultato riporta quanti parametri sono stati confermati; un invio incompleto non viene presentato come una scena riuscita e non viene ripetuto su una nuova connessione.

Questa importazione applica i valori mostrati nell’anteprima: identità dei canali e dei bus inclusi, mute, fader e mandate monitor. Non ricostruisce da una channel list impostazioni di EQ o compressore assenti dal documento. Patch I/O, gain, phantom e processori rimangono fuori dall’operazione.

**CLINK rimane rispettato.** Un nome collegato è scritto sulla sorgente dichiarata dal banco. Se più canali condividono la stessa sorgente e la proposta richiede nomi/colori incompatibili, la verifica si ferma prima dell’invio e identifica il conflitto. Si può uniformare l’identità nell’anteprima oppure modificare esplicitamente CLINK sul canale interessato.

### Scene e continuità del collegamento

L’apertura della pagina Scene ora richiede le sole foglie visualizzate, invece dell’intero sottoalbero `/$ctl/lib`. Il parametro `depth:0` del driver limitava la scoperta dei metadati, ma la richiesta dati continuava a riguardare tutto il sottoalbero: la lettura poteva quindi essere molto più ampia della schermata.

È stato corretto anche il ciclo di vita della finestra desktop: una navigazione generata da un download o da un collegamento bloccato non deve essere trattata come un ricaricamento dell’app. Aprire un selettore di file o esportare una scena conserva la connessione.

I timeout reali continuano a chiudere la sessione e ad annullare i comandi pendenti. Il protocollo non associa un identificativo al terminatore della risposta: continuare dopo un timeout potrebbe attribuire una risposta tardiva al comando successivo. Il messaggio di errore ora include percorso, identificativo del nodo, tipo di lettura e durata, per distinguere il punto effettivo di un’eventuale nuova interruzione.

Queste correzioni sono verificate nel codice e nelle simulazioni. Non dimostrano quale errore abbia provocato la disconnessione osservata sul banco dell’utente.

### Lettura dei 16 DCA

La sincronizzazione iniziale comprende le **76 strip audio e i 16 DCA**. Nomi, fader, mute e solo dei gruppi vengono letti prima di dichiarare completa la sincronizzazione. Le appartenenze sono ricostruite dai tag `#D` ricevuti sui canali.

Il richiamo DCA carica soltanto DCA e tag necessari; **Rileggi DCA** forza una nuova lettura. Anche l’apertura diretta del nome di un DCA richiede i dati mancanti. Non vengono aggiunti meter audio ai DCA. In Extended il comando DCA rende visibile la riga Uscite e il gruppo richiesto.

### Rinomina dal computer

La rinomina usa una lettura dedicata dell’identità e dell’eventuale sorgente attiva. Non deve dipendere dal completamento della lettura dei processori o di una sorgente ALT non utilizzata. Il parametro effettivo rimane quello indicato da CLINK, con controllo dei metadati, permesso di scrittura e riscontro del banco.

In modalità sola lettura occorre **Attivare Controllo**. Un nome collegato alla sorgente può essere condiviso con altri canali; l’interfaccia deve conservarne la semantica invece di modificare una copia locale del nome ricevuto.

### Comandi più rapidi

La verifica di un gesto semplice non ricostruisce più ripetutamente l’intera mappa del mixer. Controlla l’ambito della modifica e acquisisce i parametri interessati. Le operazioni complesse e i cambi di modello mantengono la verifica completa; schema, limiti, permessi, revisioni, sessione e readback restano obbligatori.

La finestra di accodamento dei gesti passa da **35 a 16 ms** e conserva l’ultimo valore anche se la precedente scrittura è ancora in attesa di conferma.

Benchmark locale, 30 campioni dopo 5 riscaldamenti, Node 24.22.1 / Linux x64:

| Verifica di un gesto | Mediana precedente | Mediana aggiornata |
|---|---:|---:|
| Fader | 117,050 ms | 24,411 ms |
| SOF, pan e livello | 112,351 ms | 28,263 ms |

Il confronto riguarda soltanto la preparazione JavaScript, con 76 strip, 16 DCA e metadati sintetici. Esclude DOM, IPC, rete, audio e hardware. Non è una misura della latenza della WING o del Mac M1. Dati completi: [benchmark-live-review-070.json](verification/benchmark-live-review-070.json). Script: `scripts/bench-live-review.cjs`.

## Compact ed Extended

**Cmd + =** alterna le viste. È disponibile anche il selettore nella testata e il comando **Vista → Compact / Extended** nel menu Mac. La scorciatoia non richiama contemporaneamente lo zoom di Electron.

| Compact | Extended |
|---|---|
| Vista esistente a due righe | Una riga selezionabile, Ingressi o Uscite |
| BUS, MTX, MAIN e DCA sopra; CH e AUX sotto | Rack WING e VST3 sopra i fader |
| Divisore e altezze esistenti conservati | Editor integrato nell’area dei processori |

Le due viste riutilizzano le stesse strip: livelli, mute, pan, meter, selezione, SOF, Custom Layer e ancoraggi sono condivisi. Il cambio vista non scrive parametri audio. Le posizioni di scorrimento sono conservate separatamente per vista e rail.

Gli slot WING richiamano filtri, gate, EQ, dinamica e insert pre/post esistenti. Le posizioni non supportate dalla famiglia restano disabilitate. Sui DCA sono presenti i comandi di gruppo.

Sono visibili quattro slot VST3 per strip; **Rack** apre la catena completa, fino a otto slot. Un nome salvato senza motore collegato non viene indicato come elaborazione attiva. Gli stati distinguono plugin pronto, audio fermo, attivo, bypass e plugin mancante.

## Due cavi e host VST3 integrato

| Collegamento | Funzione |
|---|---|
| Ethernet, Mac ↔ WING | Controllo remoto, letture e meter della console |
| USB, Mac ↔ WING | Audio verso gli effetti VST3 sul Mac e ritorno alla console |

Il processo nativo `SculptWingAudio` è incluso in **Sculpt Wing.app**. L’audio passa da CoreAudio ai plugin e alle uscite USB; non attraversa JavaScript, Electron o il protocollo di controllo. Non occorre installare un’altra app ponte.

### Preparare il primo rack

1. Collega Ethernet e USB. Per controllare il mixer apri Connessione WING e attiva Controllo dopo la lettura.
2. Apri **Audio USB**, scegli la WING come interfaccia, seleziona frequenza e buffer fra quelli dichiarati dal dispositivo e premi **Applica dispositivo**. Su macOS il permesso Microfono è necessario anche per ricevere audio USB.
3. In Extended apri uno slot VST3 o **Rack**, scegli un formato mono/stereo e assegna le porte USB di ingresso e ritorno. Due rack non possono occupare la stessa uscita.
4. Esegui **Scansiona VST3**, scegli gli effetti installati e aprili dagli slot per impostarli. I plugin devono essere compatibili con l’architettura Apple Silicon.
5. Sulla WING prepara il loop External corrispondente: invio sulle uscite USB scelte e ritorno dagli ingressi USB. Il nome del rack in Sculpt non modifica automaticamente il patch della console.
6. Premi **Avvia audio USB**. Il motore non si avvia automaticamente all’apertura dell’app o dopo un errore.

Il bypass di uno slot salta quell’effetto. Il bypass di un rack lascia passare il suo ingresso verso l’uscita mentre il motore è attivo. **Fermare il motore silenzia le sue uscite USB**; per escludere il percorso attraverso il computer si usa il bypass dell’insert sulla WING.

### Funzioni e limiti della prima integrazione

- Fino a 16 rack mono/stereo, 8 slot per rack e 48 ingressi/uscite del dispositivo.
- Effetti VST3 con editor nativo; editor generico dei parametri quando il plugin non ne offre uno.
- Scansione in processi separati, stato dei preset e collegamenti salvati sul Mac, ripristino con audio fermo.
- Parametri e bypass utilizzabili durante l’elaborazione. Modifiche a plugin, ordine, routing o dispositivo richiedono audio fermo.
- Nessun avvio automatico su altoparlanti interni quando l’interfaccia selezionata manca.
- Latenza dichiarata dal dispositivo e dai plugin mostrata separatamente. Non è una misura del percorso analogico completo e non è implementata una compensazione automatica fra tutti i percorsi della console.
- Strumenti MIDI, sidechain esterne, dispositivi aggregati e traduzione Rosetta dei plugin Intel non fanno parte di questa versione.

L’anteprima nel browser mostra l’interfaccia e le disponibilità; l’audio USB/VST3 è una funzione dell’app Mac. Contratto nativo e istruzioni di compilazione: [audio-host/README.md](../audio-host/README.md).

## Compilazione e verifiche

Il workflow `.github/workflows/build-desktop.yml` prepara il target Mac ARM64. Prima del pacchetto esegue i test JavaScript/TypeScript e del trasporto; sul runner Intel compila un host e un effetto VST3 di prova per il test reale di caricamento e processing, poi compila l’host ARM64 e l’app. Controlla l’architettura di entrambi gli eseguibili e la firma ad hoc.

La pubblicazione del ramo su GitHub è rimasta bloccata dal controllo automatico in attesa dell’autorizzazione esplicita dell’utente. Il workflow della 0.7.0 non è stato avviato: l’artefatto Mac sarà disponibile dopo la sua esecuzione.

I risultati locali e le prove ancora necessarie sono registrati in [VERIFICA_0.7.0.md](VERIFICA_0.7.0.md). Dopo la compilazione Mac, il collaudo pratico deve ripercorrere i problemi segnalati: apertura Scene, DCA, rinomina con CLINK, importazione PDF e risposta ai fader, quindi il percorso USB con un effetto e un segnale di prova.
