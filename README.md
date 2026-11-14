# Sculpt Wing 0.7.1

Controller WING. La distribuzione attuale è **Mac M1 / Apple Silicon ARM64**; il repository conserva anche i precedenti progetti per altre piattaforme.

La **0.7.1** aggiunge l’editor Compact a dispositivi affiancati, con parametri principali e moduli espandibili in larghezza. Ridisegna i pannelli WING EQ/Dynamics, attiva automaticamente il RTA del canale, abilita Controllo dopo la sincronizzazione e mostra un avviso persistente con Ricollega quando la sessione si interrompe. Corregge macro, catalogo Scene dello Show e prestazioni, e introduce una libreria di scene locali. [Note, istruzioni e verifiche 0.7.1](docs/RELEASE_0.7.1_MAC_M1.md).

Conserva **Extended**, alternata a Compact con **Cmd + =**, e il motore nativo VST3 sul Mac: **USB per l’audio ed Ethernet per il controllo**. Restano l’applicazione al banco della scena preparata dal PDF, la lettura dei DCA e la rinomina con CLINK introdotte nella 0.7.0.

Conserva editor continuo, pan con doppio clic al centro, cronologia delle modifiche e RTA ricevuto dalla WING. [RTA WING](docs/RTA_WING.md).

Restano l’importazione della channel list, i gruppi di strumenti modificabili, i nomi automatici **Batteria MON / Batteria IEM**, le due mandate principali facoltative, le **16 macro**, le righe ridimensionabili e i canali ancorati. I parametri importati sono modificabili nell’anteprima e il routing dei canali viene conservato.

## Compilare con GitHub

Questo pacchetto contiene i sorgenti pronti per il repository **sculpt wing**. Segui [CARICA_SU_GITHUB.md](CARICA_SU_GITHUB.md) per il caricamento e l’avvio della compilazione.

Il workflow è **`.github/workflows/build-desktop.yml`**, incluso anche se Finder nasconde le cartelle che iniziano con un punto. In GitHub compare come **Build Sculpt Wing - Mac M1** e parte con un push su `main` o `master`, una pull request verso questi rami, oppure da **Actions → Build Sculpt Wing - Mac M1 → Run workflow**.

Dopo i test dell’interfaccia, del trasporto e dell’host VST3, produce l’artifact **Sculpt-Wing-Mac-M1**, contenente `Sculpt-Wing-0.7.1-mac-arm64.zip`. Non occorre installare Node sul proprio computer per usare GitHub Actions. Il pacchetto di sorgenti non contiene questo binario già compilato. Runner, firma e verifiche sono descritti nelle [note 0.7.1](docs/RELEASE_0.7.1_MAC_M1.md).

## Cosa aprire

- **Interfaccia nel browser:** `dist/index.html`, servita via HTTP/HTTPS. La pubblicazione della demo web è separata da questo aggiornamento Mac. Safari e Chrome eseguono la demo offline.
- **Progetto iPhone/iPad:** `native/ios/App/App.xcodeproj`, dopo la preparazione con `npm ci` e `npm run ios:sync` nella cartella `native`. Vedi [native/README.md](native/README.md).
- **App desktop:** `desktop/`, con shell Electron e trasporto TCP/UDP diretto. Vedi `desktop/README.md`.
- **Guida iOS per i sorgenti GitHub:** `native/README.md`; i documenti 0.5 descrivono la precedente consegna.
- **Copertura e limiti:** `docs/STATO_0.6.md`, `docs/LIVE_MAPPING.md` e `native/docs/API-LIVE-0.5.md`.

La connessione usa TCP/UDP nativi sulla rete locale: **WING + router + dispositivo con Sculpt Wing**. L’app iPhone/iPad usa il plugin Swift; le app macOS e Windows usano socket Node nel processo principale. Non è richiesto un server o un computer aggiuntivo durante l’uso. La pagina web resta una demo e non apre direttamente i socket del banco.

## Interfaccia

Le **mandate nell’editor canale hanno fader verticali**. Per cambiare nome: apri una strip e premi **Rinomina**. In live il dialogo legge l’identità effettiva del banco, rispetta CLINK e conferma la scrittura; Controllo viene abilitato automaticamente al termine della sincronizzazione. La rinomina demo mantiene il campo locale e il ripristino del nome standard lasciandolo vuoto.

Due file compatte: **16 BUS + 8 MTX + 4 MAIN + 16 DCA** sopra, **40 CH + 8 AUX** sotto. Gli AUX sono ingressi. SOF su ogni BUS/MTX, editor da nome strip, macro nella barra inferiore e tema Sculpt rosso. Il pulsante DCA scorre fino ai gruppi nella stessa riga; i DCA ancorati rimangono visibili quando si torna ai BUS.

**Compact / Extended:** Cmd + = oppure il selettore nella testata. Compact mantiene le due righe e apre tutti i dispositivi del canale nella riga opposta: filtro, gate, EQ, dinamica e insert dove previsti. I parametri principali sono subito disponibili; ogni modulo si espande orizzontalmente senza rimuovere i vicini. Extended mostra il banco scelto, con i moduli WING e quattro slot VST3 visibili sopra i fader; Rack apre gli otto slot della catena. Stato, SOF e ancoraggi rimangono condivisi e il cambio vista non scrive parametri audio.

**EQ e Dynamics:** grafici ampi, fascia di controlli compatta e comandi Preset, Salva, Copia, Incolla e Reset nella barra superiore a destra. L’EQ presenta i controlli della banda selezionata; le altre bande restano raggiungibili dalla relativa selezione. Curve e controlli conservano focus e nodi durante gli aggiornamenti ordinari.

**Scene:** la libreria locale consente salvataggio, elenco, esportazione/importazione e richiamo dei parametri audio realmente letti. La scheda Show WING mostra il catalogo completo dello Show aperto usando le definizioni del banco, con selezione e GO. Non costituisce un file browser della memoria della console: apertura e gestione degli altri Show dipendono dalle funzioni esposte dal protocollo.

**PDF in live:** dal menu Importa channel list, leggi il PDF, modifica l’anteprima e usa Applica scena con Controllo attivo. L’app legge i parametri necessari, verifica l’intera proposta e mostra avanzamento e conferma delle scritture. I/O, gain, phantom e processori non fanno parte di questa importazione. Le identità collegate rispettano CLINK; conflitti sulle sorgenti condivise sono segnalati prima dell’invio.

**VST3 sul Mac:** apri Audio USB, scegli la WING e applica dispositivo, frequenza e buffer. Dal rack di un canale assegna ingressi/ritorni USB, scansiona gli effetti installati, carica i plugin e apri i loro editor nativi dagli slot. Configura il corrispondente loop External sulla WING, quindi avvia esplicitamente l’audio. Il motore è incluso nell’app e resta fermo al lancio; la pagina browser non elabora audio USB o VST3. Vedi [host nativo](audio-host/README.md) e [guida 0.7.0](docs/RELEASE_0.7.0_MAC_M1.md).

**Cmd+Z** annulla e **Maiusc+Cmd+Z** ripristina le modifiche registrate. Un trascinamento equivale a una sola operazione. Nei campi di testo resta l’annullamento della digitazione. In live l’operazione passa dalle stesse verifiche e riletture del mixer; un valore cambiato esternamente non viene sovrascritto da una cronologia obsoleta. Il cambio di algoritmo live richiede il ripristino tramite preset. I comandi OSC già inviati non sono annullabili.

**Editor e pan:** con l’editor aperto, un clic su un altro canale mantiene EQ, Dinamica, Mandate o la sezione selezionata, comprese le sottoviste compatibili. Le macro che richiamano un modulo esplicito aprono quel modulo direttamente. Il pan è sopra il fader di ogni strip audio: trascinamento orizzontale o verticale, Maiusc per precisione, doppio clic per il centro. In SOF controlla il pan della mandata CH/AUX; quando è attivo Pan link mostra LINK e segue il pan del canale. I DCA non hanno pan audio.

**Analizzatori:** l’apertura dell’EQ richiede automaticamente lo spettro sul canale e tap selezionati, anche con il profilo numerico standard WING. Fonte e tap effettivi sono confermati prima di mostrare i dati; un cambio canale scarta i frame precedenti. Il RTA è condiviso con la console: contesa e assenza del flusso vengono segnalate. La scala è relativa, non dBFS/SPL calibrati; senza banco lo spettro resta vuoto. Curve EQ/Dynamics rappresentano i parametri; meter e GR live usano i dati ricevuti. Dettagli: [RTA WING](docs/RTA_WING.md).

**OSC / Show:** apri la relativa pagina dal menu del banco. Il profilo Sculpt Show propone `127.0.0.1:53000` per le due app sullo stesso Mac; IP e porta sono modificabili. “Verifica Sculpt Show” richiede lo stato senza avviare cue. GO, Stop All, pausa, ripresa, fade e navigazione possono essere aggiunti alle macro; sono disponibili anche comandi per UUID e messaggi OSC personalizzati. L’invio è integrato nella shell desktop, indipendente dalla connessione WING. La demo browser permette la configurazione ma non può inviare UDP. Vedi la [guida OSC](docs/OSC_SCULPT_SHOW.md) per la versione Show compatibile e le risposte di verifica.

Il catalogo comprende 109 definizioni di processore fra i diversi contesti e 1116 controlli. I pannelli sono interfacce originali Sculpt: VSS3, FET/ottici, EQ per bande, EQ grafici, multibanda, delay, pitch, amplificatori e channel strip hanno disposizioni specifiche. Non sono immagini statiche né copie grafiche ufficiali Behringer. I processori WING elaborano sulla console; gli effetti VST3 elaborano nel motore nativo sul Mac.

## Modalità WING

1. Inserire l’IP privato del banco in **WING / Connessione**.
2. Attendere identità, struttura e lettura delle 76 strip audio e dei 16 DCA, comprese le assegnazioni insert esposte dal firmware.
3. A sincronizzazione riuscita, **Controllo si abilita automaticamente**. È possibile disattivarlo manualmente per lavorare in sola lettura.
4. Aprire il processore o la pagina: lo schema viene letto dal banco, poi i controlli sono abilitati.
5. Le modifiche vengono confermate con una rilettura. I valori esterni aggiornano l’interfaccia.

Il cambio di modello invalida i parametri precedenti e i gesti accodati. La disconnessione, il background e la riconnessione annullano i comandi pendenti. Il progetto demo non viene mai inviato automaticamente al mixer.

Una perdita inattesa mostra un avviso persistente, anche sopra i dialoghi, con causa e **Ricollega** sullo stesso IP. Il comando esegue una nuova sincronizzazione; nessuna macro, gesto o scrittura precedente viene riprodotta. I picchi dei meter UDP non chiudono più il flusso di controllo TCP. Una rete o una console che smette realmente di rispondere deve ancora risultare disconnessa.

**Parametri WING** permette di navigare l’intera struttura esposta dal firmware, con limiti, enum e proprietà di sola lettura ottenuti dal banco. I controlli senza una mappatura verificata non inviano comandi inventati.

## Sviluppo e verifiche

Da `native/`, con Node 22 aggiornato (almeno 22.13.0 per il progetto nativo):

```sh
npm ci
npm run test:all
npm run build
```

`npm run dev` serve la nuova interfaccia completa; i comandi con suffisso `:prototype` sono riservati al vecchio prototipo.

`build` esegue TypeScript, genera `dist/native-bridge.js` nel progetto web, copia l’interfaccia completa in `native/dist` e nel progetto Xcode. `npm run ios:sync` usa inoltre Capacitor; la firma rimane una configurazione di Xcode.

L’entrypoint distribuito è `native/src/live-entry.ts`. `src/App.tsx` e lo store del prototipo iniziale restano come riferimento storico e per i test legacy; non costituiscono l’interfaccia inclusa nella build corrente.

Il pacchetto contiene codice sorgente, test, documentazione e risorse. **Non contiene un IPA firmato.** Build e test JavaScript/TypeScript sono verificati nell’ambiente Linux; compilazione Xcode, installazione iOS e funzionamento su WING fisica restano da verificare sul dispositivo.

## Versione desktop

Il bundle desktop include la stessa cartella `dist/` e lo stesso driver WING di iOS. Controllo diventa attivo dopo la lettura riuscita del banco. I pacchetti vengono isolati per sessione e i comandi pendenti sono annullati alla disconnessione o alla sospensione.

Il workflow corrente compila soltanto Mac M1 / Apple Silicon ARM64 per la distribuzione. La nuova app macOS deve essere prodotta dal workflow dopo il caricamento autorizzato di questo aggiornamento. Le prove sono elencate in [VERIFICA_0.7.1.md](docs/VERIFICA_0.7.1.md); i test automatici non equivalgono al collaudo della build aggiornata su WING reale.
