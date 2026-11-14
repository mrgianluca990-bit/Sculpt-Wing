# Sculpt Wing — obiettivo e contratto di sviluppo

Aggiornato il 14 novembre 2026. Le richieste successive sono raccolte nelle sezioni di versione; l’obiettivo resta il controllo delle funzioni WING, dei processori e del menu I/O, con le priorità e i limiti di consegna esplicitati sotto.

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

## Aggiornamento 0.6.7 — DCA, editor, annullamento, prestazioni e OSC

La priorità rimane **Mac M1 / Apple Silicon ARM64**. Questa richiesta riguarda il completamento dell’app Sculpt Wing esistente. L’invio OSC deve essere integrato nel suo trasporto nativo e non autorizza la creazione di un’altra app Mac che faccia da ponte.

### DCA e organizzazione dei controlli

I 16 DCA devono appartenere alla **riga superiore**, insieme a BUS, matrici e master, ed essere ancorabili a sinistra o a destra con gli stessi comandi delle altre strip. Il richiamo DCA serve a raggiungerli tramite lo scorrimento; non deve sostituire gli altri canali della riga. I DCA restano nella riga superiore anche nei Custom Layer. Ancoraggi e ordine locale non modificano i membri del gruppo, i parametri audio o il routing. Non introdurre meter audio fittizi sui DCA.

Riorganizzare i pannelli nativi **WING EQ e WING Dynamics** per la vista orizzontale, con una gerarchia leggibile fra grafici, bande, gruppi di parametri e controlli. Mantenere i modelli, i limiti dichiarati dal banco e le superfici degli altri processori. Evitare controlli duplicati per lo stesso parametro.

Le mandate nell’editor restano verticali, con dimensioni compatte. Il loro livello usa **fader e campo numerico**, senza una seconda manopola che muova lo stesso fader: questa richiesta specifica supera la precedente regola generale della manopola per ogni valore. Pan e gli altri parametri indipendenti conservano i rispettivi controlli. Preservare trascinamento dalla sola testa e doppio clic a 0 dB.

### Cronologia delle modifiche

Rendere disponibili **Cmd+Z** e **Maiusc+Cmd+Z**, oltre ai comandi nel menu Banco. Un trascinamento continuo di fader, manopola o punto EQ deve costituire una sola operazione, compresi i parametri cambiati insieme. Registrare i campi effettivamente modificati; non ripristinare un intero progetto per annullare una singola regolazione. Conservare i valori estranei all’operazione, incluso il routing. Nei campi di testo mantenere il comportamento nativo di annullamento della digitazione.

Prima di applicare annullamento o ripristino, verificare sessione, valori correnti e compatibilità del modello. Non sovrascrivere un conflitto già rilevato con una modifica successiva. Le scritture live devono passare dai controlli esistenti e attendere il riscontro del banco; il cambio di sessione o il mancato riscontro impediscono di dichiarare l’operazione confermata. Durante un annullamento in attesa non accettare nuove modifiche utente prive di registrazione. Gli aggiornamenti ricevuti dal banco non devono diventare nuove azioni utente nella cronologia.

Il **cambio di algoritmo live non è annullabile** tramite questa cronologia: il solo ripristino del modello non ricostruisce tutti i suoi parametri precedenti. Il ripristino completo richiede un preset. Non promettere l’annullamento di comandi esterni già eseguiti, compresi i messaggi OSC.

### Prestazioni e dati reali

Ridurre il lavoro ripetuto durante i gesti: limitare le acquisizioni della cronologia all’ambito modificato, raggruppare i salvataggi locali e aggiornare pannelli, curve e controlli quando i rispettivi dati cambiano. I meter devono considerare visibilità e ancoraggi, e sospendere il lavoro quando la pagina è nascosta o un workspace copre il mixer. Le ottimizzazioni non autorizzano a saltare controlli della sessione, validazioni o riscontri delle scritture.

Distinguere esplicitamente la **curva EQ calcolata** dall’analizzatore audio. Nella 0.6.7 non è disponibile uno streaming RTA reale: i grafici dei parametri EQ/Dynamics non devono essere presentati come misure del segnale. I meter live e la GR possono usare soltanto i dati ricevuti dal mixer; i valori dimostrativi devono restare riconoscibili e separati dal live.

Documentare le misure dell’ambiente di sviluppo in `docs/verification/benchmark-ui-results.json`, mantenendole distinte dalla prestazione sul Mac M1 e dal collaudo con il banco fisico. Non dichiarare un miglioramento quantitativo senza una misura confrontabile.

### OSC e Sculpt Show

Integrare invio OSC UDP, configurazione della destinazione e assegnazione alle macro. Il collegamento OSC è indipendente da WING: le azioni OSC e di navigazione possono essere utilizzate con il mixer scollegato o in sola lettura. Le macro miste mantengono la validazione preventiva dell’intera sequenza e i controlli live delle azioni WING. Fissare le destinazioni durante la preparazione della sequenza per evitare cambi a metà esecuzione.

Predisporre il profilo **Sculpt Show**, destinazione iniziale **127.0.0.1:53000**, secondo il ricevitore **1.0.0 RC3, build 3** verificato nei sorgenti indicati in [docs/OSC_SCULPT_SHOW.md](docs/OSC_SCULPT_SHOW.md). Supportare i comandi documentati, gli UUID per cue e liste, gli alias e un profilo OSC personalizzato con argomenti tipizzati. Una verifica di collegamento a Show deve usare `/sculpt/status`, senza eseguire GO, stop o selezioni di cue.

Un invio UDP riuscito conferma l’accettazione del datagramma da parte del sistema, non l’esecuzione del comando nel destinatario. La verifica di stato richiede una risposta valida dal peer configurato. Messaggi già inviati e azioni esterne non possono essere ritirati con Cmd+Z; Interrompi ferma soltanto le azioni ancora da eseguire. Nel browser si possono preparare le assegnazioni, mentre l’invio UDP usa il trasporto dell’app Mac.

### Stato delle verifiche

Le note della consegna sono in [docs/RELEASE_0.6.7_MAC_M1.md](docs/RELEASE_0.6.7_MAC_M1.md). Distinguere test automatici, frontend nel browser, UDP in loopback, compilazione GitHub ARM64, avvio sul Mac e prova con WING/Show reali. Alla preparazione di questa consegna, la build macOS su GitHub resta da eseguire e non è stato collaudato un banco WING fisico. Usare [docs/COLLAUDO_WING_SHOW_0.6.7.md](docs/COLLAUDO_WING_SHOW_0.6.7.md) per registrare il successivo collaudo pratico.


## Aggiornamento 0.6.8 — editor continuo, precisione EQ, pan e RTA

Richieste di Gianluca: mantenere lo stesso modulo cambiando canale; rendere l’app più scattante; aggiungere RTA dove serve; eliminare gli spostamenti imprecisi delle bande EQ; aggiungere pan ai fader con reset al centro al doppio clic.

- Transizione editor unica: commit dell’eventuale campo del vecchio canale prima del cambio identità; cleanup del processore e delle letture obsolete; conservazione di tab e sottoviste compatibili. Le macro con modulo esplicito devono aprirlo direttamente.
- Il drag EQ converte coordinate client tramite la matrice effettiva SVG. Il semplice afferramento non modifica i valori. Frequenza e gain dello stesso movimento vengono validati e applicati insieme; Shift cambia sensibilità senza saltare. Un gesto è un solo Undo.
- Pan sulle 76 strip audio, compresi i canali ancorati e nei custom layer; niente pan inventato sui DCA. SOF segue la mandata CH/AUX e rispetta Pan link, metadati, disponibilità e permessi live. Doppio clic = centro.
- Prestazioni provate con scenari riproducibili rispetto alla 0.6.7; riportare campioni, p50/p95, ambiente ed esclusioni. Nessuna promessa di FPS o latenza Mac basata su JSDOM.
- RTA da pacchetti reali, mai da animazioni simulate. Nessuna nuova app ponte. Richiedere il flusso soltanto per la vista visibile; scartare report vecchi o non validi e sospendere su background/disconnessione. WING ha un RTA condiviso: identificare fonte/tap effettivi e rendere esplicite le limitazioni. Non attribuire un indice numerico a un canale usando una mappatura soltanto inferita. Scala relativa finché manca una calibrazione verificata sul banco.
- Destinazione di distribuzione: Mac M1 / Apple Silicon ARM64. Separare build frontend/test locali, compilazione ARM64 su GitHub, avvio Mac fisico e collaudo con WING.

Note della consegna: [docs/RELEASE_0.6.8_MAC_M1.md](docs/RELEASE_0.6.8_MAC_M1.md).

## Aggiornamento 0.7.0 — Extended, USB/VST3 e correzioni live

L’utente sceglie due cavi: Ethernet per il controllo della WING e USB per il percorso audio dei VST3 sul Mac. La vista attuale si chiama **Compact**; la nuova vista **Extended** conserva i fader sotto e presenta sopra i moduli WING e gli slot VST3 richiamabili. **Cmd + =** alterna le viste, con un unico evento e senza attivare contemporaneamente lo zoom. Stato audio, selezione, SOF, ancoraggi e ordine rimangono condivisi. Il cambio vista non è una scena e non modifica il mixer.

L’host VST3 è un componente nativo incluso nell’app Mac, separato dal renderer. L’audio non passa da JavaScript. Configurazione e avvio sono espliciti, nessun ripristino automatico dell’elaborazione dopo avvio o errore, nessun cambio automatico verso gli altoparlanti interni. Nomi salvati e plugin mancanti non devono apparire in elaborazione. Il bypass dipende da un motore ancora attivo; non promettere failover hardware o latenza USB misurata senza prova fisica.

Durante la stessa consegna l’utente conferma che il collegamento alla WING funziona, ma segnala: impossibilità di applicare la scena preparata dal PDF, risposta lenta dei controlli, disconnessione aprendo le scene, DCA non letti e rinomina dei canali bloccata dal computer. Trattare questi punti come parte dell’aggiornamento.

L’importazione PDF live deve validare l’intera proposta, leggere i parametri necessari e usare la coda verificata. Applicare soltanto i valori espliciti dell’anteprima; conservare patch, gain, phantom e processori. Rispettare CLINK e individuare conflitti sulle sorgenti condivise prima dell’invio. Riportare riscontri e completamento parziale, senza reinvio su una nuova sessione. Conservare la cronologia delle modifiche.

Includere i 16 DCA nella sincronizzazione iniziale e usare i tag reali per i membri. Rinomina e identità devono poter leggere solo il canale e la sorgente attiva senza dipendere da rami audio non pertinenti. La pagina Scene deve richiedere i dati visualizzati, evitando la lettura automatica dell’intera libreria. I selettori di file e i download non devono interrompere il trasporto. Conservare la chiusura della sessione in caso di timeout effettivo, con diagnostica del percorso richiesto.

Ridurre il lavoro locale dei gesti mantenendo controlli dello schema, permessi, readback, ordine e invalidazione dei comandi. Documentare misure riproducibili della preparazione JavaScript separatamente dalla latenza del Mac e della WING. La consegna resta Mac M1 / Apple Silicon; distinguere sorgenti verificati, build Mac e collaudo sul banco.

## Aggiornamento 0.7.1 — debug, dispositivi Compact, scene e RTA

Le richieste esplicite di Gianluca in questa consegna superano i precedenti default dove indicato:

- **Controllo automatico** soltanto dopo identità e sincronizzazione completate. Rimane disponibile la scelta manuale di sola lettura; nessuna trasmissione della demo o di gesti della sessione precedente.
- **Avviso persistente con Ricollega** per una perdita inattesa, leggibile e azionabile anche sopra i dialoghi. Conservare l’IP, mostrare progresso ed errori e riabilitare Controllo solo dopo la nuova lettura riuscita. Evitare disconnessioni causate dalle code dei meter o da letture sproporzionate. Non nascondere le perdite di rete reali e non promettere continuità fisica non provata.
- **Macro:** verificare l’intera sequenza prima della prima scrittura, controllare sessione e annullamento ad ogni passo del fade, rendere le attese interrompibili, mostrare stato/progresso e impedire doppie esecuzioni involontarie. Livello di una mandata confermato prima di abilitarla; Undo locale non sovrascrive modifiche successive.
- **Compact in stile dispositivi Ableton:** tutti i moduli supportati affiancati nella riga opposta al canale, parametri principali disponibili e singola espansione orizzontale per accedere a tutti i controlli. Gli altri moduli e i fader rimangono presenti. Rispettare ordine reale, famiglie di canali, bypass e assegnazioni degli insert. Extended conserva l’impostazione a slot sopra i fader.
- **Grafici EQ e Dynamics:** spazio prioritario a grafico, analizzatore e riduzione di guadagno, controlli compatti. Preset/Salva/Copia/Incolla/Reset nella barra superiore a destra, senza riga vuota dedicata sotto. Conservare parametri, limiti, tastiera, campi numerici e gesti.
- **RTA automatico:** l’apertura dell’EQ richiede il canale e il tap pertinenti; il cambio canale scarta dati precedenti e richiede la nuova sorgente. Usare profili documentati e metadata effettivi, confermare sorgente/tap ricevuti, mantenere visibili assenza del flusso e contesa. Nessun tracciato inventato o etichetta LIVE prima della verifica.
- **Scene sul banco:** leggere il catalogo completo dello Show aperto mediante definizioni dei nodi, perché il valore scalare può contenere soltanto il primo nome. Non confonderlo con un file browser di tutta la memoria della console. Prima del GO verificare Show, ordine, indice e sessione.
- **Scene locali:** salvare, elencare, importare/esportare e richiamare scene sul computer. In live acquisire soltanto valori realmente letti, con scope esplicito; i dati demo non rappresentano una scena del banco. Persistenza separata, anteprima del richiamo, verifica di schema/limiti/safes/sessione, avanzamento e risultati parziali. Una lettura sequenziale non va presentata come cattura atomica.
- **Prestazioni:** ridurre scansioni ripetute della mappa, copie superflue, aggiornamenti di controlli invariati e sottoscrizioni non visibili. Conservare la verifica integrale delle modifiche, il riscontro del banco e i vincoli di sessione. Misurare con confronto riproducibile, distinguendo CPU locale da latenza hardware.

Il controllo automatico ha respinto il precedente push su GitHub perché la pubblicazione esterna non era stata autorizzata esplicitamente. Il lavoro locale prosegue; pubblicazione del ramo e compilazione remota richiedono la conferma dell’utente sulla consegna concreta.
