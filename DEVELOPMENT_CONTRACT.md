# Sculpt Wing — obiettivo e contratto di sviluppo

Aggiornato il 13 novembre 2026 a seguito della richiesta dell’utente di prevedere tutte le funzioni della WING, tutti i plugin con i rispettivi editor e il menu I/O.

## Specifica di riferimento

La specifica completa è [docs/WING_COMPLETE_SCOPE.md](docs/WING_COMPLETE_SCOPE.md). Questo documento adotta come obiettivo il controllo completo WING, con priorità WING RACK. La limitazione alle sole mandate monitor del primo prototipo nativo descrive la sua implementazione iniziale; non è più il perimetro finale del prodotto.

## Requisiti vincolanti

1. Preservare il mixer a due file compatte, lo stile Sculpt rosso, l’editor dalla strip, SOF e area macro.
2. Prevedere menu I/O, tutti i modelli dei processori di strip, 16 slot FX e tutte le funzioni globali censite.
3. Creare pannelli specifici dei plugin, coerenti con controlli, scale e identità del processore WING; non dichiarare completo un editor generico.
4. Unificare modello e interfacce dei driver demo/live prima di espandere il controller. Nessuna seconda copia indipendente dello stato tra UI, SOF e rete.
5. Mantenere il requisito mixer + router + tablet per l’uso reale. Il collegamento diretto usa il trasporto nativo dell’app installata; la pagina web pubblicata resta una simulazione finché non dispone di un trasporto adeguato.
6. Rilevare capacità e schema del mixer. Rileggere i parametri dopo cambi di algoritmo o stato che modifichino i nodi. Non trattare ID o range del PDF come invarianti tra firmware e contesti.
7. Preservare isolamento di sessione, riscontro delle scritture e cancellazione dei comandi obsoleti. Non applicare automaticamente dati demo alla WING.
8. Distinguere funzioni documentate, editor implementati, prove demo e prove remote/hardware. Non promettere parità completa prima delle verifiche.

## Stato della consegna 0.4 (storico)

La demo ora comprende le 76 strip, i sei pannelli dell’editor, l’intero catalogo censito dei processori con pannelli interattivi, 16 slot FX, I/O e routing, DCA/mute/automix, monitor/talkback, meter/RTA, scene/librerie, recorder virtuali, setup e macro configurabili. Tutte le sezioni usano lo stato condiviso e sono incluse nella cache offline.

Questo completa il perimetro dimostrativo dell’interfaccia. La parità con il banco reale resta un obiettivo da verificare sul trasporto nativo e sull’hardware: non sono stati implementati DSP nel browser né una connessione remota nella pagina pubblicata. Le precisioni dei controlli, gli editor ricostruiti e i limiti dei preset factory sono documentati nei file di implementazione. La consegna non modifica il prototipo nativo separato.

## Aggiornamento 0.5

La richiesta successiva porta i pannelli a organizzazioni specifiche per modello e collega la stessa interfaccia al trasporto nativo iPhone/iPad. Il driver legge lo schema WING, conferma le scritture e invalida i nodi dinamici al cambio modello. Il progetto nativo è ora in `native/`; la build incorpora `dist/`. Il sito rimane la modalità demo.

La copertura implementata e i limiti ancora presenti sono descritti in `docs/STATO_0.5.md`; i risultati delle verifiche sono in `docs/VERIFICA_0.5.md`. La compilazione con SDK Apple, la firma e il collaudo sul mixer fisico non sono stati eseguiti. La consegna non equivale a parità completa certificata con WING EDIT.

## Aggiornamento 0.6 — richiesta del 13 novembre 2026

L’utente richiede mandate verticali nell’editor, una rinomina facilmente raggiungibile e versioni macOS e Windows. Il supporto Windows è ora esplicitamente incluso. Le app desktop riusano interfaccia e protocollo WING; il loro trasporto TCP/UDP locale non richiede relay, servizi cloud o un secondo computer. Per iPhone/iPad resta valido il funzionamento senza un computer durante l’uso. La pagina web rimane la demo. Non dichiarare installatori firmati, compatibilità hardware o verifiche su un sistema operativo che non sono state effettivamente eseguite.

## Aggiornamento 0.6.2 — Mac M1 e importazione channel list

La priorità attuale dell’utente è la sola app **Mac M1 / Apple Silicon arm64**. Il workflow di questa consegna compila quel target. Le richieste precedenti per Windows e per un controller web iPad non autorizzano ad aggiungere una seconda app ponte o ad ampliare ora quei progetti.

L’utente richiede di completare le superfici dei processori ancora mancanti e di importare una channel list PDF. In questo primo passo l’importazione prepara **destinazioni degli ingressi, nomi e colori**, con anteprima correggibile e applicazione al progetto locale. La numerazione del PDF propone CH 1–40; AUX 1–8 richiede una dicitura AUX esplicita o una scelta manuale. I numeri oltre 40 non diventano AUX automaticamente. L’importazione non equivale a un file snapshot nativo della WING.

La palette automatica richiesta è: batteria rosso, basso verde, chitarre blu, tastiere bianco, voci rosa, fiati giallo, archi arancio. Ogni colore resta modificabile nell’anteprima.

**Monitor e IEM sono rimandati alle istruzioni dell’utente.** L’importazione non imposta mandate, bus, patch, link stereo, gain, phantom o processing. Non genera livelli monitor predefiniti. Le macro restano fuori da questa modifica. Conservare scorrimento orizzontale del mouse, fader dalla sola testa e Custom Layer a due righe della versione 0.6.1.

## Aggiornamento 0.6.3 — scena da Producer e anteprima modificabile

Le nuove istruzioni dell’utente definiscono ora le mandate monitor e superano il rinvio della sezione 0.6.2. Il flusso richiesto è **Producer → PDF → Sculpt Wing**, con canali, nomi, colori e mandate preparati nel progetto locale. La priorità di distribuzione resta **Mac M1 / Apple Silicon arm64**.

L’importatore propone gli ingressi selezionati in mute e con fader a −∞. Ogni strumento ha un monitor principale, eventualmente condiviso da più canali, con mandata attiva a **−5 dB PRE**; verso tutti gli altri monitor assegnati propone **−8 dB POST**. Le mandate proposte seguono il mute del canale. **Tutti i valori proposti devono essere modificabili nell’anteprima**, comprese destinazioni, nomi, colori, mute, fader, BUS, singole mandate, PRE/POST e Segue mute. L’identità dei BUS assegnati è applicabile con esclusione facoltativa; i loro fader e mute restano conservati.

Per gli ingressi rimanenti, la scelta iniziale è conservarli. L’opzione di inizializzazione deve dichiarare esattamente il proprio ambito: **nome standard, colore grigio, mute attivo e fader a −∞**, con eccezioni e correzioni per canale. Processing e mandate preesistenti dei rimanenti restano conservati.

**Il routing del canale non deve mai essere modificato dall’importazione.** Conservare sorgenti, sorgenti alternative, patch delle uscite, preamplificatori, phantom, insert, ordine dei processori, punti PRE condivisi, invii MAIN/MTX, invii ai BUS esclusi e ogni altro campo non esplicitamente previsto. Un tap condiviso AFL/POST che contraddice una proposta PRE deve produrre una segnalazione bloccante, senza riscrivere il tap.

Il PDF Producer attuale non stampa gli identificativi degli strumenti né un’associazione esplicita tra ingressi e monitor. Il riconoscimento dai nomi deve restare una proposta; gli abbinamenti non univoci richiedono una scelta nell’anteprima. I numeri AUX del PDF e le coppie L/R non autorizzano modifiche al patch o alla modalità stereo dei BUS. Conservarne la provenienza visibile per il controllo dell’utente.

L’applicazione deve essere atomica e limitata al progetto offline, con annullamento selettivo e controllo dei conflitti. Nessun dato della preview deve modificare il mixer prima di Applica scena. La funzione non genera uno snapshot nativo WING e non autorizza una nuova procedura di scrittura massiva live. Conservare le funzionalità della 0.6.2 e le correzioni a gesti, fader e Custom Layer della 0.6.1; le macro restano fuori da questa modifica.

## Aggiornamento 0.6.4 — strumenti collegati ed editor nella riga opposta

Le nuove istruzioni rendono il monitor principale **facoltativo**: ogni strumento può avere zero, una o due mandate principali. La seconda serve, per esempio, a un musicista con monitor da palco e IEM. Entrambe le principali partono da **−5 dB PRE**; le altre mandate ai monitor assegnati partono da **−8 dB POST**. I valori restano modificabili. Un BUS non può occupare contemporaneamente entrambi gli slot principali dello stesso strumento.

I canali dello stesso strumento sono collegati nell’anteprima: la scelta delle mandate principali va applicata una volta al gruppo. Il riconoscimento dai nomi resta correggibile; l’utente può associare un canale a un altro strumento o renderlo indipendente. Deve restare possibile correggere le singole mandate senza perdere i valori delle altre. Questo collegamento riguarda la preparazione della scena e non modifica link stereo, routing o patch del banco.

**Aggiungi canale vuoto** deve essere disponibile anche senza PDF e preparare un ingresso libero con nome standard modificabile, colore grigio, mute attivo, fader a −∞, nessun principale e mandate monitor inizialmente disattivate a −∞. La destinazione resta modificabile; non spostare automaticamente il patch degli altri canali. Se non ci sono ingressi liberi, mostrare una spiegazione senza duplicare una destinazione.

L’editor di una strip si apre nella **riga opposta a quella da cui è stato richiamato**, lasciando accessibili i fader della riga sorgente. Usare l’effettiva posizione nel mixer anche nel Custom Layer: un ingresso nella riga superiore apre l’editor in basso, un’uscita nella riga inferiore lo apre in alto. Conservare gesti del mixer, mandate verticali, sei sezioni dell’editor, rinomina, chiusura da tastiera e verifiche della sessione live.

La versione conserva il workflow M1 corretto, già riuscito nel run GitHub `43496123183` sul commit `bd89e3dbe9a331d29aecfb6746f299ff82fee9df`: runner Mac Intel e target esplicito ARM64 con verifica dell’eseguibile e della firma. Questo successo riguarda la 0.6.3; la nuova 0.6.4 richiede la propria compilazione e prova sul Mac M1.

## Aggiornamento 0.6.5 — comandi del mixer e disposizione personalizzabile

Ogni valore numerico modificabile nell’editor del canale deve avere una manopola collegata allo stesso stato del campo numerico e dell’eventuale fader. Conservare la forma dei pannelli dei processori e organizzare i controlli per la vista orizzontale. Le selezioni discrete non numeriche, i nomi e gli interruttori conservano controlli adatti al valore. Le mandate rimangono verticali e l’editor continua a occupare la riga opposta.

Rendere i 16 DCA raggiungibili dal mixer nella riga superiore, con fader, mute, solo, nome e assegnazioni collegati ai gruppi esistenti. Conservare idratazione e controlli di scrittura live: nessun valore demo non ricevuto deve apparire come dato del banco.

L’anteprima della channel list mantiene lo scorrimento durante l’assegnazione dei monitor e ordina numericamente i BUS. Un monitor nuovo usa il primo BUS libero. Dopo un’applicazione riuscita, la finestra si chiude automaticamente; l’annullamento deve rimanere raggiungibile riaprendo l’importatore nella stessa sessione. Errori e conflitti lasciano aperta l’anteprima.

Il doppio clic sul fader lo porta a **0 dB**, compresi i fader DCA e le mandate. In SOF agisce sulla mandata visualizzata. Questa azione esplicita supera il precedente comportamento inerte del doppio clic; il trascinamento resta consentito soltanto dalla testa e il singolo clic sul binario non cambia il livello.

Il meter delle strip CH/AUX misura l’ingresso, indipendentemente da mute, fader, SOF o riga effettiva nel Custom Layer. Aggiungere due piccoli meter G/C per la riduzione di guadagno di gate e compressore. In live utilizzare i dati del protocollo ricevuti e segnalare quelli mancanti o scaduti; non calcolare la GR dal fader né attribuire una conversione in dB non documentata al modello.

La richiesta successiva nella stessa sessione aggiunge **altezza regolabile delle due righe** e **ancoraggio di uno o più canali a sinistra o a destra**. Usare un divisore trascinabile con alternativa da tastiera, limiti minimi leggibili e ripristino 50/50. Le strip ancorate restano visibili durante lo scorrimento del centro, riutilizzando gli stessi elementi e controlli del mixer. La preferenza segue il canale nella sua riga attuale, compreso il Custom Layer; deve poter essere rimossa. Altezza e ancoraggi sono preferenze locali di interfaccia persistenti, distinte dai parametri audio e dal routing.

Il target resta esclusivamente Mac M1 / Apple Silicon ARM64. La base remota osservata per questo aggiornamento è la 0.6.4, commit `d376463b87ba9389f39f33aa1600e23656e21a6b`. Distinguere build e prove locali, compilazione macOS su GitHub, avvio sul Mac e collaudo sul mixer fisico.

La richiesta finale aggiunge una **sfumatura molto tenue del colore assegnato lungo tutta la strip**, visibile anche nelle aree ancorate e aggiornata insieme al colore del canale. Conservare contrasto e leggibilità di nomi, fader e meter.

La cancellazione esplicita del nome di un ingresso o di un’uscita, confermata con Invio o uscita dal campo, ripristina il nome standard della famiglia e del numero (CH 1, AUX 1, BUS 1, MTX 1, MAIN 1). Durante la digitazione il campo può restare vuoto. Conservare le regole dei nomi collegati alla sorgente e i blocchi di scrittura live.

## Aggiornamento 0.6.6 — gruppi di strumenti modificabili nell’anteprima

L’utente richiede di modificare i gruppi di canali riconosciuti durante l’importazione del PDF. Aggiungere una scheda **Strumenti**, raggiungibile anche dall’intestazione del gruppo nella scheda Canali. Permettere di rinominare un gruppo, selezionare più canali, crearne uno nuovo, spostare i canali in un gruppo esistente e separarli in gruppi indipendenti. I gruppi vuoti scompaiono senza cancellare i canali. La selezione per riordinare i gruppi deve restare distinta dall’inclusione nell’importazione.

I gruppi sono identificati indipendentemente dal nome visualizzato. Creare un gruppo richiede almeno un canale e un nome; tutti gli identificativi devono essere validati prima di cambiare la proposta, senza modifiche parziali in caso di errore. Il nuovo gruppo eredita i principali da un canale di riferimento scelto fra i membri selezionati. Spostare dei canali in un gruppo esistente adotta i suoi due principali, anche quando uno o entrambi sono Nessuno. Mostrare queste assegnazioni prima dell’azione.

Separare canali conserva principali e mandate già preparate. Creare o spostare un gruppo aggiorna soltanto le mandate che cambiano ruolo: un nuovo principale è attivo a −5 dB PRE; un precedente principale non più assegnato diventa −8 dB POST, oppure disattivato a −∞ per una riga vuota. Le altre personalizzazioni degli invii restano conservate. Nomi dei canali, colori, destinazioni, mute, fader e inclusione nell’importazione non cambiano spostando i gruppi. I due principali restano facoltativi e modificabili per strumento.

Tutte queste azioni lavorano sulla sola anteprima. Applicazione e annullamento conservano il comportamento offline, i controlli di conflitto e la protezione del routing delle versioni precedenti. Il collegamento dei gruppi non crea link stereo o assegnazioni DCA. La consegna resta cumulativa sulla 0.6.4 remota e include le funzioni della 0.6.5; target esclusivo Mac M1 / Apple Silicon ARM64.

La richiesta aggiuntiva assegna un significato ai due slot: **Principale 1 = MON**, **Principale 2 = IEM**. Il nome dello strumento genera automaticamente il nome del BUS assegnato, ad esempio **Batteria MON** e **Batteria IEM**, e lo aggiorna quando cambia il nome dello strumento. Per rispettare i 16 caratteri, accorciare il nome dello strumento conservando sempre il suffisso MON/IEM. I nomi dei singoli ingressi non sono il nome dello strumento.

I nomi dei BUS restano correggibili nell’anteprima, con scelta esplicita fra nome automatico e manuale. Un BUS condiviso può avere un solo nome: quando più strumenti lo usano, offrire la scelta dello strumento/ruolo da cui derivarlo senza usare implicitamente l’ultimo modificato. Il nome automatico è applicato al BUS solo con l’inclusione dell’identità del monitor e con Applica scena. Non cambiare fader, mute, patch, formato stereo o routing del BUS per rinominarlo.

Rispettare i ruoli espliciti nel PDF: un monitor etichettato IEM/I.E.M. viene proposto nel secondo slot; MON e monitor senza indicazione IEM nel primo. Una coppia univoca MON+IEM può riempire entrambi. Candidati multipli dello stesso ruolo richiedono una scelta nell’anteprima. Il riconoscimento usa il nome originale prima dell’accorciamento.

## Macro aggiuntive — richiesta nella consegna 0.6.6

L’utente richiede altri **otto pulsanti macro vuoti**, per un totale di **16**. Le prime otto assegnazioni esistenti devono rimanere conservate; i pulsanti M9–M16 partono senza azioni. Cliccare un pulsante vuoto apre la scelta di cosa assegnare; una macro configurata si esegue con un clic e deve restare modificabile. Supportare anche apertura di menu, pagine, sezioni dell’editor, SOF e layer, oltre ai comandi del mixer e ai parametri dei processori. Per gli altri parametri WING usare lo schema esposto dal banco e i controlli di lettura/scrittura esistenti, senza inventare percorsi, tipi o intervalli.

Le azioni di navigazione dell’interfaccia non richiedono l’abilitazione delle scritture audio. Le macro che contengono comandi al mixer devono conservare la validazione preventiva dell’intera sequenza, i controlli della sessione, l’abilitazione di Controllo, lo schema dei parametri e il riscontro delle scritture. Una macro con un comando non disponibile non deve eseguire la prima parte della sequenza prima di rilevare il problema. Le definizioni delle macro sono configurazione locale e possono essere modificate e conservate durante una sessione live senza salvare dati audio del banco come progetto demo.

Conservare creazione e modifica di sequenze, scelta del nome, riordino e rimozione delle azioni. Prevedere un’azione esplicita per svuotare una macro senza eliminarne il pulsante. Mantenere il mixer a due righe, il divisore regolabile e la raggiungibilità di tutti i16 pulsanti. Questa richiesta supera il rinvio delle macro indicato nelle versioni precedenti.
