# Sculpt Wing 0.6.8

Controller WING. La distribuzione attuale è **Mac M1 / Apple Silicon ARM64**; il repository conserva anche i precedenti progetti per altre piattaforme.

La **0.6.8** mantiene aperto lo stesso modulo quando cambi canale, corregge la precisione del trascinamento delle bande EQ e aggiunge il **pan alle strip**, con doppio clic per tornare al centro. Riduce le ricostruzioni dell’editor, il lavoro delle macro di navigazione e gli aggiornamenti delle curve. Include il trasporto **RTA reale WING**, con sorgente e tap effettivi e disponibilità dichiarata. [Note e verifiche 0.6.8](docs/RELEASE_0.6.8_MAC_M1.md) · [RTA WING](docs/RTA_WING.md) · [Collaudo 0.6.8](docs/COLLAUDO_0.6.8.md).

Restano l’importazione della channel list, i gruppi di strumenti modificabili, i nomi automatici **Batteria MON / Batteria IEM**, le due mandate principali facoltative, le **16 macro**, le righe ridimensionabili e i canali ancorati. I parametri importati sono modificabili nell’anteprima e il routing dei canali viene conservato.

## Compilare con GitHub

Questo pacchetto contiene i sorgenti pronti per il repository **sculpt wing**. Segui [CARICA_SU_GITHUB.md](CARICA_SU_GITHUB.md) per il caricamento e l’avvio della compilazione.

Il workflow reale è **`.github/workflows/build-desktop.yml`**, incluso anche se Finder nasconde le cartelle che iniziano con un punto. In GitHub compare come **Build Sculpt Wing - Mac M1** e parte con un push su `main` o `master`, oppure da **Actions → Build Sculpt Wing - Mac M1 → Run workflow**.

Dopo i test produce l’artifact **Sculpt-Wing-Mac-M1**, contenente `Sculpt-Wing-0.6.8-mac-arm64.zip`. Non occorre installare Node sul proprio computer per usare GitHub Actions. Runner, firma e verifiche della consegna sono descritti nelle [note 0.6.8](docs/RELEASE_0.6.8_MAC_M1.md).

## Cosa aprire

- **Interfaccia nel browser:** `dist/index.html`, servita via HTTP/HTTPS. La pubblicazione della demo web è separata da questo aggiornamento Mac. Safari e Chrome eseguono la demo offline.
- **Progetto iPhone/iPad:** `native/ios/App/App.xcodeproj`, dopo la preparazione con `npm ci` e `npm run ios:sync` nella cartella `native`. Vedi [native/README.md](native/README.md).
- **App desktop:** `desktop/`, con shell Electron e trasporto TCP/UDP diretto. Vedi `desktop/README.md`.
- **Guida iOS per i sorgenti GitHub:** `native/README.md`; i documenti 0.5 descrivono la precedente consegna.
- **Copertura e limiti:** `docs/STATO_0.6.md`, `docs/LIVE_MAPPING.md` e `native/docs/API-LIVE-0.5.md`.

La connessione usa TCP/UDP nativi sulla rete locale: **WING + router + dispositivo con Sculpt Wing**. L’app iPhone/iPad usa il plugin Swift; le app macOS e Windows usano socket Node nel processo principale. Non è richiesto un server o un computer aggiuntivo durante l’uso. La pagina web resta una demo e non apre direttamente i socket del banco.

## Interfaccia

Le **mandate nell’editor canale hanno fader verticali**. Per cambiare nome: apri una strip, premi **Rinomina**, modifica **Nome** e conferma con Invio o uscendo dal campo. Lasciando il nome vuoto si ripristina il nome standard del canale. Il comando porta anche a **Canale → Identità**. In collegamento live va prima attivato **Controllo** e attesa la lettura dal mixer.

Due file compatte: **16 BUS + 8 MTX + 4 MAIN + 16 DCA** sopra, **40 CH + 8 AUX** sotto. Gli AUX sono ingressi. SOF su ogni BUS/MTX, editor da nome strip, macro nella barra inferiore e tema Sculpt rosso. Il pulsante DCA scorre fino ai gruppi nella stessa riga; i DCA ancorati rimangono visibili quando si torna ai BUS.

**Cmd+Z** annulla e **Maiusc+Cmd+Z** ripristina le modifiche registrate. Un trascinamento equivale a una sola operazione. Nei campi di testo resta l’annullamento della digitazione. In live l’operazione passa dalle stesse verifiche e riletture del mixer; un valore cambiato esternamente non viene sovrascritto da una cronologia obsoleta. Il cambio di algoritmo live richiede il ripristino tramite preset. I comandi OSC già inviati non sono annullabili.

**Editor e pan:** con l’editor aperto, un clic su un altro canale mantiene EQ, Dinamica, Mandate o la sezione selezionata, comprese le sottoviste compatibili. Le macro che richiamano un modulo esplicito aprono quel modulo direttamente. Il pan è sopra il fader di ogni strip audio: trascinamento orizzontale o verticale, Maiusc per precisione, doppio clic per il centro. In SOF controlla il pan della mandata CH/AUX; quando è attivo Pan link mostra LINK e segue il pan del canale. I DCA non hanno pan audio.

**Analizzatori:** la pagina Meter/RTA riceve le 120 bande dello spettro WING. L’analizzatore è globale e condiviso con la console. Fonte e tap vengono riletti; quando il firmware espone solo un indice numerico, viene mostrato «Sorgente WING #N» senza inventare il canale corrispondente. L’overlay EQ richiede un’identità della sorgente verificabile. La scala è relativa, non un valore dBFS/SPL calibrato; senza banco lo spettro resta vuoto. La curva EQ calcolata e le curve Dynamics continuano a rappresentare i parametri. I meter d’ingresso e GR usano i dati ricevuti in live; in demo sono esplicitamente simulati. Dettagli e limiti: [RTA WING](docs/RTA_WING.md).

**OSC / Show:** apri la relativa pagina dal menu del banco. Il profilo Sculpt Show propone `127.0.0.1:53000` per le due app sullo stesso Mac; IP e porta sono modificabili. “Verifica Sculpt Show” richiede lo stato senza avviare cue. GO, Stop All, pausa, ripresa, fade e navigazione possono essere aggiunti alle macro; sono disponibili anche comandi per UUID e messaggi OSC personalizzati. L’invio è integrato nella shell desktop, indipendente dalla connessione WING. La demo browser permette la configurazione ma non può inviare UDP. Vedi la [guida OSC](docs/OSC_SCULPT_SHOW.md) per la versione Show compatibile e le risposte di verifica.

Il catalogo comprende 109 definizioni di processore fra i diversi contesti e 1116 controlli. I pannelli sono interfacce originali Sculpt: VSS3, FET/ottici, EQ per bande, EQ grafici, multibanda, delay, pitch, amplificatori e channel strip hanno disposizioni specifiche. Non sono immagini statiche né copie grafiche ufficiali Behringer. L’audio viene elaborato dalla WING.

## Modalità WING

1. Inserire l’IP privato del banco in **WING / Connessione**.
2. Attendere identità, struttura e lettura delle 76 strip, comprese le assegnazioni insert esposte dal firmware.
3. Attivare **Controllo** per inviare modifiche. La connessione parte in lettura.
4. Aprire il processore o la pagina: lo schema viene letto dal banco, poi i controlli sono abilitati.
5. Le modifiche vengono confermate con una rilettura. I valori esterni aggiornano l’interfaccia.

Il cambio di modello invalida i parametri precedenti e i gesti accodati. La disconnessione, il background e la riconnessione annullano i comandi pendenti. Il progetto demo non viene mai inviato automaticamente al mixer.

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

Il bundle desktop include la stessa cartella `dist/` e lo stesso driver WING di iOS. La connessione parte in lettura; la modifica dei parametri richiede **Attiva controllo**. I pacchetti del mixer vengono isolati per sessione e i comandi pendenti sono annullati alla disconnessione o alla sospensione.

Il workflow corrente compila soltanto Mac M1 / Apple Silicon ARM64. La nuova app macOS deve essere prodotta dal workflow dopo il caricamento di questo aggiornamento. Le prove effettuate sono elencate in [RELEASE_0.6.8_MAC_M1.md](docs/RELEASE_0.6.8_MAC_M1.md); il codice sorgente non equivale a un collaudo su WING reale.
