# Verifica della consegna 0.7.1

Data: 14 novembre 2026. Ambiente: Linux x86_64, Node 24.22.1. Confronto delle modifiche con la 0.7.0 locale, commit `0d69574`; base pubblicata 0.6.8, commit `7720343a47d660dd7ddacf249f4eef5ab219de9a`.

## Risultati della verifica integrata

| Verifica | Esito |
|---|---|
| `npm run build --prefix native` | Passata: TypeScript, bridge nativo, lettore PDF e copie degli asset |
| `npm run test:all --prefix native` | Passata, exit 0 |
| Test TypeScript/Vitest | 112 superati, 8 file |
| Test web/modello con Node | 467 superati, nessun fallimento, cancellazione o skip |
| Integrazione dell’editor | 456 rendering di pannelli sulle 76 strip, passati anche nel gate integrato |
| `npm test --prefix desktop` | 43 superati, nessun fallimento, cancellazione o skip |
| `npm run prepare:app --prefix desktop` | Interfaccia e icona desktop preparate |
| Coerenza asset | 64 asset identici in ciascuna copia nativa, iOS e desktop; 55 riferimenti dell’index risolti |
| Versioni | Pacchetti, lock, bridge sorgente/generato, preload e metadati helper 0.7.1; service worker e verifica offline v26 |
| `git diff --check` | Nessun errore |

I test JavaScript/TypeScript sono complessivamente **622** (112 + 467 + 43).
I 456 rendering dell’editor sono riportati separatamente: costituiscono un’altra
verifica d’integrazione, non altrettanti test unitari da sommare al totale.

Ricevute:

- [Build frontend e driver](verification/build-071.log).
- [Suite interfaccia, modello e protocollo](verification/tests-071.log).
- [Suite desktop](verification/desktop-tests-071.log).
- [Preparazione desktop](verification/desktop-prepare-071.log).
- [Verifica delle copie e delle versioni](verification/assets-071.log).
- [Benchmark locale](verification/benchmark-live-review-071.json).

## Comportamenti coperti

### Compact e pannelli WING

Le prove aprono la Compact con tutti i moduli supportati nella riga opposta ai fader. Verificano parametri principali, espansione e riduzione indipendenti, ordine effettivo dei processori, capacità delle diverse famiglie di strip, accesso ai filtri low/high cut e apertura iniziale dell’EQ con RTA.

L’espansione di una scheda conserva nodi, focus e sottoscrizioni delle altre. Il cambio canale esegue il cleanup; un vecchio evento di un campo numerico o di un controllo discreto non può scrivere sul canale precedente. Anche un gesto fader o DCA iniziato prima della riconnessione viene invalidato.

EQ e Dynamics sono verificati per geometria, selezione banda/curva, eventi, metadati e disponibilità dei valori. I controlli ordinari aggiornano i nodi esistenti. Sono conservate le prove precedenti della vista Extended, della scorciatoia Cmd + =, di SOF, ancoraggi e continuità della selezione.

I casi dedicati ai campi della sezione Canale la aprono ora esplicitamente. Le prove dell’apertura normale verificano invece il nuovo default Dispositivi. Gli assert su nomi, colori, rifiuto delle modifiche e valori confermati rimangono attivi.

### Connessione, trasporto e RTA

La sincronizzazione deve terminare prima dell’abilitazione automatica di Controllo, senza inviare lo stato demo. La sola lettura manuale resta disponibile. Le prove verificano avviso persistente, precedenza sopra i dialoghi, un solo tentativo di riconnessione, errore del tentativo, nuova sincronizzazione e assenza di allarme dopo disconnessione manuale.

Il socket viene sottoposto a raffiche UDP, backpressure, pacchetti di sessioni precedenti e dati TCP in coda. L’eccesso di meter non chiude TCP; il controllo mantiene ordine e capacità riservata. Le richieste ai cataloghi e alle radici sono verificate senza letture indiscriminate di grandi sottoalberi.

Il RTA usa report sintetici con metadati numerici e simbolici. Le prove coprono profilo standard, sorgenti/tap non corrispondenti, cambio canale, report scaduti, controllo disabilitato, contesa, cleanup, resize e sospensione/ripresa quando il grafico esce dalla zona visibile. Le fonti della mappatura e la loro distinzione da un collaudo fisico sono in [RTA_WING.md](RTA_WING.md).

### Macro

Le prove coprono preflight, valori e metadati mancanti, sessione cambiata durante una pausa o un fade, annullamento immediato delle attese, doppio avvio e avanzamento. Verificano che il livello di una mandata spenta venga confermato prima di ON, che le letture DCA restino mirate e che l’Undo precedente sopravviva a una verifica fallita. In demo, Undo non sovrascrive modifiche manuali successive.

### Catalogo Show e scene locali

Il catalogo Show viene letto dalla definizione completa degli elementi: un test contiene 150 voci e conserva nomi con separatori e interruzioni di riga. Prima del GO vengono verificati Show, ordine/nome della selezione e sessione. La copertura riguarda il catalogo dello Show aperto; non un file browser di tutta la memoria del banco.

Le scene locali vengono provate con valori realmente restituiti dal driver simulato. Sono coperti campi omessi, valori della cache da non riutilizzare, unità e limiti, enum, importazioni non valide, percorsi non audio, definizioni troppo grandi, cambi di modello/schema/sessione e catture incomplete.

Il richiamo verifica tutti i campi selezionati, anche quelli apparentemente già uguali. Le prove coprono gruppi e protezioni, esclusione iniziale di gain/phantom, invalidazione dell’anteprima, ordine dei comandi, controllo dello schema dopo il cambio di modello, quantizzazione, annullamento e risultati parziali con parametro incerto. Sono verificati doppio clic, chiusura dell’anteprima, importazione/esportazione offline e riapertura dell’archivio.

**La persistenza IndexedDB è verificata con una simulazione asincrona delle transazioni.** Questo dimostra il comportamento del codice di archivio nei casi provati, non la persistenza effettiva dopo chiusura/riapertura dell’app Mac o di un browser reale.

### PDF, DCA e rinomina

Il gate conserva le prove 0.7.0 di applicazione PDF con Session reale e driver simulato: anteprima, CLINK, sorgenti condivise, campi ignoti, quantizzazione, readback, rifiuto, Undo e risultato parziale. I fixture verificano ora l’auto-Controllo e disabilitano esplicitamente il controllo nei casi di sola lettura.

Sono conservate le verifiche di lettura dei 16 DCA oltre alle 76 strip audio, appartenenze e rinomina dedicata. La rinomina continua a funzionare anche se un processore non correlato non può essere caricato.

## Prestazioni

Il benchmark confronta la 0.7.0 locale con i sorgenti 0.7.1, con 30 campioni dopo 5 riscaldamenti. Le mediane passano da 25,528 a 7,702 ms per la verifica di un fader; da 34,946 a 5,137 ms per SOF pan/livello; da 22,620 a 0,483 ms per applicare un gruppo di 244 valori ricevuti.

Lo stato contiene 76 strip, 16 DCA e metadati sintetici completi. Le misure riguardano il solo codice JavaScript: escludono DOM, IPC, rete, dispositivi audio e hardware. Alcuni test indipendenti erano attivi durante il benchmark; i dati non sono una certificazione di prestazioni in tempo reale. Il JSON include distribuzioni, ambiente, numero di campioni e riferimento della base. Non si deducono da questi tempi FPS del Mac o latenza del percorso USB.

## Motore USB/VST3

La 0.7.1 conserva l’implementazione DSP e il protocollo dell’host 0.7.0; ne aggiorna i metadati di versione. Le prove del bridge e del lifecycle desktop sono rieseguite nel gate JavaScript corrente.

La compilazione C++/JUCE, CTest 3/3, fixture VST3 reale e test del bridge verso il binario Linux erano stati eseguiti per la consegna 0.7.0 e sono documentati in [VERIFICA_0.7.0.md](VERIFICA_0.7.0.md). Non vengono conteggiati come una nuova compilazione nativa della 0.7.1. Il workflow conserva tali verifiche prima del pacchetto Mac ARM64.

## Limiti e collaudo successivo

Non sono stati eseguiti: compilazione macOS ARM64 della nuova app, firma e avvio del relativo bundle, rendering sul display del Mac, collegamento della nuova build alla WING fisica, persistenza locale reale del pacchetto Mac, audio USB fisico, latenza del percorso completo e compatibilità con i plugin personali dell’utente.

La verifica visuale tramite browser e desktop è rimasta indisponibile: il browser cloud non raggiungeva il server del workspace e il tentativo locale si è fermato prima dell’apertura della pagina. Le prove DOM, di geometria e di lifecycle non sostituiscono un’ispezione grafica reale. Non è stata pubblicata un’anteprima esterna per aggirare il limite.

La precedente connessione alla WING è stata confermata dall’utente. Le correzioni riguardano percorsi software riprodotti o circoscritti; in assenza di un log del banco non viene attribuita una causa certa alla disconnessione segnalata.

La pubblicazione GitHub era stata respinta dal controllo automatico per mancanza di autorizzazione esplicita alla pubblicazione esterna dei sorgenti. Non è stata ritentata con altri canali. La build Mac resta da avviare dopo tale autorizzazione.

Il collaudo sul sistema reale deve verificare:

1. Sincronizzazione di 76 strip e 16 DCA, Controllo automatico, rinomina e corrispondenza dei dati con il banco.
2. Compact su CH/AUX/BUS/MAIN/MTX: parametri principali, espansioni indipendenti, scorrimento, tastiera e fader della riga conservata; poi Cmd + = ed Extended.
3. EQ e Dynamics alla risoluzione del Mac, toolbar superiore e RTA sul canale/tap richiesto, anche dopo cambio canale e scorrimento.
4. Elenco completo dello Show aperto; acquisizione e riapertura di una scena locale dopo il riavvio dell’app, esportazione/importazione e richiamo di un gruppo controllato.
5. Avviso e Ricollega dopo una perdita di rete provocata durante una prova, senza ripresa dei comandi precedenti; macro interrotte e stato riportato correttamente.
6. PDF live e percorso USB con un effetto VST3 compatibile ARM64, readback dei parametri e misura della latenza sul collegamento effettivo.

Questi punti sono prove da completare, non risultati già acquisiti.
