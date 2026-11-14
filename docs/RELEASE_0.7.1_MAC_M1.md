# Sculpt Wing 0.7.1 · Compact a moduli e correzioni live

Aggiornamento del 14 novembre 2026. Questa consegna contiene i sorgenti completi, i test e il workflow Mac ARM64. La nuova app Mac deve ancora essere compilata e collaudata sulla WING. Le modifiche 0.7.1 seguono il commit locale 0.7.0 `0d69574`; la base pubblicata del progetto resta la 0.6.8.

## Compact: tutti i processori nella riga opposta

Aprendo un canale nella vista **Compact**, la riga opposta ai suoi fader ospita una fila orizzontale di moduli. Le schede seguono l’ordine di elaborazione e le possibilità effettive della famiglia di strip: filtro, gate, EQ, dinamica e insert pre/post dove supportati. I fader conservano stato, selezione e controlli.

Ogni scheda ridotta presenta i parametri principali del processore e il suo stato. Il comando di espansione allarga **soltanto quel modulo**, nella stessa fila, e mostra i controlli completi. Le schede vicine rimangono al loro posto; possono essere espanse indipendentemente. Lo scorrimento orizzontale permette di raggiungere l’intera catena.

L’EQ parte espanso per rendere subito disponibile il grafico e l’analizzatore. I moduli ridotti usano gli stessi parametri, metadati e limiti del pannello completo. Un insert vuoto offre l’assegnazione FX; un parametro live non ancora letto rimane indicato come sconosciuto finché arrivano i dati dal banco.

Le sezioni Canale, Processing, Mandate e Gruppi restano accessibili. I comandi che richiedono esplicitamente un pannello, comprese le macro, aprono quella sezione. La navigazione precedente/successivo è nella testata. Nel normale cambio canale si conserva la vista e si rimuovono correttamente i controlli del canale precedente.

**Cmd + =** continua ad alternare Compact ed Extended. Extended conserva la disposizione con slot WING e VST3 sopra i fader. Il cambio di vista non modifica parametri audio.

### EQ, Dynamics e comandi nella testata

- **EQ WING:** grafico e RTA più ampi, adattati allo spazio reale. Frequenza, gain e Q della banda selezionata occupano una fascia compatta; le altre bande rimangono raggiungibili dalla selezione.
- **Dynamics WING:** grafico ampio, selezione fra curva e inviluppo, controlli organizzati per soglia/rapporto, tempi, uscita e rilevamento.
- **Preset, Salva, Copia, Incolla e Reset:** nella barra superiore a destra. È eliminata la riga inferiore che sottraeva spazio al processore.
- Gli aggiornamenti ordinari mantengono focus, controlli e grafico esistenti. Le curve dipendenti da valori live mancanti attendono la lettura; non rappresentano valori della demo.

I vecchi eventi di un controllo chiuso, ridotto o appartenente a una precedente sessione vengono ignorati. Questo comprende anche un campo numerico che perde il focus dopo un cambio canale.

## RTA automatico sul canale

L’apertura dell’EQ seleziona automaticamente sorgente e tap del RTA, quando **Controllo** è attivo e il firmware espone il profilo riconosciuto. Non occorre avviare separatamente l’analizzatore per ogni canale.

Il profilo numerico standard copre CH, AUX, BUS, MAIN e MTX. Le enum simboliche dichiarate dal firmware hanno precedenza. L’app conferma la sorgente e il tap effettivi e attende un report nuovo prima di mostrare lo spettro: i frame del canale precedente e quelli scaduti non vengono riutilizzati.

Il RTA della console è condiviso: se un altro controllo ne cambia la sorgente, l’interfaccia indica la contesa. In sola lettura l’app non modifica la sorgente. Quando il grafico scorre fuori dalla zona visibile della Compact, la sua attività viene sospesa; tornando sul grafico riprende sullo stesso canale e tap. Un ridimensionamento aggiorna la geometria senza richiedere nuovamente la sorgente.

Lo spettro usa una scala relativa; non è una lettura SPL o dBFS calibrata. Implementazione, profili, fonti e limiti sono descritti in [RTA_WING.md](RTA_WING.md). Il supporto è verificato con metadati e report simulati; il funzionamento della nuova build sul firmware della WING dell’utente resta da collaudare.

## Connessione, controllo e riconnessione

**Controllo si abilita automaticamente al termine di una sincronizzazione riuscita.** Durante collegamento, identità e lettura rimane disattivato. È sempre possibile disabilitarlo manualmente per lavorare in sola lettura.

Una disconnessione inattesa produce un avviso persistente con la causa, l’indirizzo precedente e **Ricollega**. L’avviso resta utilizzabile anche sopra un dialogo. Ricollega avvia un solo tentativo per volta e l’avviso si chiude dopo la nuova sincronizzazione riuscita. Una disconnessione richiesta dall’utente non genera l’allarme di guasto.

Sono corretti due percorsi che potevano compromettere la continuità del collegamento:

1. Un eccesso di pacchetti dei meter UDP non satura più la stessa coda fino a chiudere anche TCP. Il trasporto conserva spazio e priorità per il controllo e limita i datagrammi in attesa.
2. La navigazione di radici e della libreria evita richieste dell’intero grande albero dati quando servono soltanto i campi diretti o le definizioni del catalogo.

La 0.7.1 non aumenta arbitrariamente i timeout. Se la console o la rete smettono davvero di rispondere, la sessione deve terminare e invalidare i comandi pendenti. Il protocollo non permette di associare con sicurezza un terminatore tardivo alla vecchia richiesta. Nessun gesto, richiamo o macro viene ripreso automaticamente sulla connessione successiva.

Queste correzioni risolvono percorsi riprodotti nei test. Non attribuiscono una causa certa alla disconnessione osservata sul banco in assenza del relativo log.

## Scene dello Show e scene locali

La pagina Scene offre **Scene locali**, **Show WING** e **Progetto demo**. Le scene locali contengono parametri effettivamente letti dalla console; gli snapshot della simulazione rimangono riconoscibili come progetto demo.

### Catalogo completo dello Show aperto

**Show WING** legge la definizione del catalogo, che contiene tutte le voci. La lettura scalare del parametro poteva invece restituire soltanto il primo nome. Sono disponibili aggiornamento, filtro, selezione e GO, mantenendo l’ordine e i nomi ricevuti dal banco.

Prima del richiamo vengono verificati sessione, Show e posizione della voce. Un elenco diventato obsoleto richiede una nuova lettura, evitando di richiamare un’altra scena che abbia preso la stessa posizione.

Il catalogo riguarda **tutte le scene dello Show attualmente aperto sulla WING**. Non è un browser di tutti i file e di tutti gli Show nella memoria interna o sulla chiavetta del banco: il protocollo usato non documenta tale esplorazione. Anche la disponibilità degli altri cataloghi dipende dai metadati realmente esposti dalla console.

### Salvare in locale

1. Apri **Scene → Scene locali** con la WING collegata.
2. Inserisci il nome e scegli i gruppi da acquisire.
3. Premi **Salva WING in locale** e attendi la lettura completa.
4. La scena compare nell’elenco e può essere rinominata, esportata, importata o eliminata anche quando il banco è scollegato.

Sono selezionabili CH, AUX, BUS, MAIN, MTX, rack FX, DCA/mute group, sorgenti, patch delle uscite e monitor/talkback/solo. Ogni lettura usa unità limitate; un valore omesso o uno schema cambiato interrompe l’acquisizione e non viene sostituito con un dato precedente della cache.

La cattura è una lettura sequenziale, con istante iniziale/finale e identità della console registrati nel file. Non costituisce uno snapshot atomico di parametri che cambiano durante l’acquisizione.

La libreria è salvata sul dispositivo. **Esporta JSON** crea un file `.sculpt-wing-scene.json` trasferibile e reimportabile. È un formato Sculpt versionato, distinto dal formato Snap nativo WING. Rete, clock, trasporti, comandi momentanei e campi temporanei non fanno parte di questa scena. Se il salvataggio locale fallisce dopo la lettura, resta disponibile l’esportazione della scena acquisita.

### Richiamare una scena locale

1. Seleziona la scena nella libreria.
2. Scegli i gruppi da richiamare e le eventuali strip da proteggere.
3. Premi **Prepara richiamo sulla WING**. L’app legge i valori attuali, controlla schema, limiti, permessi e differenze.
4. Controlla l’anteprima: moduli interessati, valore letto e valore richiesto, esclusioni e cambi di modello.
5. Premi **Conferma richiamo**. Avanzamento e risultato riportano i parametri confermati dalla console.

Gain e phantom sono esclusi dal richiamo per impostazione iniziale; la loro inclusione si sceglie esplicitamente nella scena. Le protezioni CH/AUX/BUS ecc. riguardano i parametri diretti di quelle strip: le sorgenti condivise, i DCA e i bus seguono i rispettivi gruppi selezionati.

Prima della prima scrittura l’app verifica che l’anteprima sia ancora attuale. I modelli vengono applicati per primi; i parametri dipendenti sono riletti e verificati sul nuovo schema prima di proseguire. Un richiamo può essere interrotto. Se si ferma dopo alcune scritture, il report distingue i valori confermati dal parametro eventualmente ancora incerto. Le modifiche già confermate rimangono sul banco; i comandi restanti non vengono ripetuti su una nuova sessione.

Il richiamo locale non è una transazione atomica né un comando Undo globale. Il risultato parziale rimane visibile per permettere una verifica concreta.

## Macro

Le macro eseguono una verifica completa prima dei comandi che modificano il banco. Ogni azione e ogni passo di un fade controllano la sessione corrente. Un cambio connessione invalida la macro; anche le attese lunghe sono interrompibili.

L’interfaccia mostra esecuzione, avanzamento e Stop. Il doppio clic non avvia una seconda esecuzione concorrente. Le letture DCA/monitor sono limitate ai parametri richiesti. Per attivare una mandata precedentemente spenta, l’app conferma prima il livello richiesto e poi ON.

Una verifica fallita non cancella l’Undo precedente. Nella demo, Undo di una macro non sovrascrive modifiche manuali fatte nel frattempo. I comandi esterni OSC già inviati rimangono non annullabili.

## Prestazioni misurate

Il lavoro riduce ricostruzioni ripetute della mappa, confronti completi duplicati e rendering dei processori non necessari. L’applicazione dei valori ricevuti usa una mappa condivisa per il gruppo e gestisce prima i cambi di modello. Le modifiche identiche al valore corrente vengono scartate prima di creare una nuova operazione di cronologia.

Confronto locale con la 0.7.0, 30 campioni dopo 5 riscaldamenti, Node 24.22.1 su Linux x86_64:

| Operazione | Mediana 0.7.0 | Mediana 0.7.1 |
|---|---:|---:|
| Verifica di un gesto fader | 25,528 ms | 7,702 ms |
| Clonazione stato e verifica del fader | 29,239 ms | 13,309 ms |
| Verifica SOF, pan e livello | 34,946 ms | 5,137 ms |
| Clonazione stato e verifica SOF | 38,914 ms | 8,488 ms |
| Applicazione di 244 valori ricevuti | 22,620 ms | 0,483 ms |

Sono misure del codice JavaScript con 76 strip e 16 DCA. Escludono DOM, IPC, socket, audio e hardware: non misurano la latenza USB, il tempo di risposta della console o la fluidità del display del Mac. Dati e condizioni: [benchmark-live-review-071.json](verification/benchmark-live-review-071.json). Script ripetibile: `scripts/bench-live-review.cjs`.

## Funzioni conservate dalla 0.7.0

- **Due cavi:** Ethernet per il controllo, USB per l’audio degli effetti VST3 nel motore nativo sul Mac.
- **Extended:** moduli WING e slot VST3 sopra i fader, Cmd + = per alternare la vista.
- **PDF live:** Importa channel list → anteprima → Applica scena, con verifica dei parametri, CLINK e sorgenti condivise.
- **DCA:** sincronizzazione dei 16 gruppi oltre alle 76 strip audio, nomi, livelli, mute e appartenenze.
- **Rinomina:** lettura dedicata dell’identità effettiva del canale o della sorgente collegata.

Per il percorso VST3, scegli dispositivo/buffer, prepara rack e porte USB, configura il loop External sulla WING e avvia esplicitamente l’audio. Il motore non parte da solo con Controllo. Fermare il motore silenzia le sue uscite USB; il bypass dell’insert sulla console esclude il percorso del computer. Le istruzioni e i limiti del motore sono in [audio-host/README.md](../audio-host/README.md) e nella [guida 0.7.0](RELEASE_0.7.0_MAC_M1.md).

## Compilazione e collaudo

Il workflow `.github/workflows/build-desktop.yml` prepara **Sculpt-Wing-0.7.1-mac-arm64.zip** dopo i test e la compilazione del motore nativo. La consegna locale include i sorgenti, non il nuovo eseguibile Mac. [CARICA_SU_GITHUB.md](../CARICA_SU_GITHUB.md) descrive il procedimento.

La pubblicazione del ramo era stata respinta dal controllo automatico perché mancava l’autorizzazione esplicita alla pubblicazione esterna. Non è stata aggirata e il workflow della nuova versione non è stato avviato.

I risultati eseguiti e le prove ancora necessarie sono in [VERIFICA_0.7.1.md](VERIFICA_0.7.1.md). Rendering su Mac, collegamento della build aggiornata alla WING e latenza del percorso USB reale restano da verificare sul sistema effettivo.
