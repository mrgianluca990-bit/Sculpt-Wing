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
