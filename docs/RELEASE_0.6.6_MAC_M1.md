# Sculpt Wing 0.6.6 — gruppi, nomi MON / IEM e 16 macro

## Cosa cambia

L’anteprima della channel list aggiunge la scheda **Strumenti**. Il riconoscimento del PDF propone i gruppi, che ora si possono correggere selezionando più canali insieme. **Modifica gruppo** nella scheda Canali apre direttamente il gruppo interessato.

| Azione | Risultato |
| --- | --- |
| Cambiare il nome dello strumento | Rinomina il gruppo e aggiorna i nomi automatici dei BUS assegnati. I nomi dei singoli ingressi rimangono quelli scelti nella scheda Canali. |
| Crea gruppo | Riunisce i canali selezionati in un nuovo strumento. Scegliere alcuni membri di un gruppo permette di dividerlo. |
| Sposta nel gruppo | Assegna i canali scelti a uno strumento esistente. Spostare tutti i membri permette di unire due gruppi. |
| Rendi indipendenti | Ogni canale scelto diventa un gruppo distinto e conserva le proprie mandate. |
| Principale 1 | Monitor da palco: nome automatico **Nome strumento MON**. |
| Principale 2 | IEM: nome automatico **Nome strumento IEM**. |

Le caselle di selezione della scheda Strumenti servono a scegliere i canali da raggruppare. Sono separate da **Usa**, che decide quali ingressi applicare al progetto. Passando fra gruppi si può comporre una selezione di più strumenti; il conteggio, **Solo selezionati** e **Svuota selezione** permettono di controllarla.

I gruppi non sono identificati dal nome: due gruppi con lo stesso nome restano distinti finché non si spostano i rispettivi membri. I gruppi rimasti senza membri scompaiono, senza eliminare gli ingressi.

## Nome dello strumento, monitor e IEM

La prima preferenza è MON e la seconda è IEM. Entrambe sono facoltative: per un musicista con solo IEM basta lasciare il primo slot su **Nessuno** e assegnare il secondo.

| Nome del gruppo | Assegnazione | Nome del BUS |
| --- | --- | --- |
| Batteria | Principale 1 → BUS 1 | Batteria MON |
| Batteria | Principale 2 → BUS 2 | Batteria IEM |
| Basso | Principale 2 → BUS 3 | Basso IEM |

Se il PDF indica esplicitamente **IEM** nel nome di un monitor, l’abbinamento univoco viene proposto nella seconda assegnazione. Un monitor MON o senza indicazione IEM viene proposto nella prima. Se sono presenti un MON e un IEM abbinati univocamente allo stesso strumento, vengono proposti entrambi; più candidati per lo stesso ruolo richiedono una scelta nell’anteprima.

Il nome automatico segue le modifiche al nome dello strumento. Il limite resta di 16 caratteri: si accorcia la parte dello strumento conservando sempre il suffisso MON o IEM.

Nella scheda **Mandate**, la casella **Nome dal gruppo · MON / IEM** indica il collegamento automatico. Scrivere nel campo del nome rende il valore personalizzato; riattivando la casella si torna al nome del gruppo. I valori possono quindi essere sempre corretti nell’anteprima.

Se più strumenti condividono un BUS, il suo nome può provenire da un solo gruppo/ruolo. L’anteprima mostra una scelta esplicita. Finché non si sceglie, conserva il nome corrente o quello letto dal PDF; una rinomina di un altro gruppo non lo sovrascrive arbitrariamente. Un gruppo interamente escluso dall’importazione non aggiunge candidati a questa scelta.

**Applica nome e colore al bus** rimane la scelta che decide se applicare l’identità proposta. Le modifiche ai nomi avvengono nella sola anteprima fino ad **Applica scena**. Fader, mute, formato stereo e routing del BUS rimangono conservati.

## Mandate durante la modifica dei gruppi

Creando un gruppo, si sceglie il canale da cui ereditare i due principali. Il riferimento iniziale è il primo dei canali scelti nell’ordine della lista. Spostando i canali in un gruppo esistente, si adottano i principali della destinazione. L’interfaccia mostra la coppia prima dell’azione.

Quando la coppia rimane uguale, si conservano i valori delle mandate. Un BUS che diventa principale assume **−5 dB PRE**; un precedente principale che non lo è più assume **−8 dB POST**, oppure torna disattivato a −∞ se appartiene a una riga vuota. Le mandate che non cambiano ruolo mantengono le personalizzazioni. **Rendi indipendenti** conserva tutte le proposte dei canali.

Le modifiche di gruppo mantengono destinazioni, nomi dei singoli ingressi, colori, mute, fader e inclusione nell’importazione. Non creano link stereo o assegnazioni DCA. Il routing e gli altri parametri protetti conservano le regole delle versioni precedenti.

## Otto nuovi pulsanti macro

La barra inferiore passa a **16 macro**. M9–M16 partono vuote e aprono la scelta dell’assegnazione al primo clic. Le macro già configurate conservano nomi e azioni; restano modificabili con tasto destro o da tastiera.

Oltre ai comandi già presenti, si possono assegnare l’apertura dei menu e delle pagine, sezioni specifiche dell’editor, banco DCA, SOF, Custom Layer, parametri dei processori e parametri WING dichiarati scrivibili dallo schema del banco collegato. Si possono comporre più azioni nella stessa macro, riordinarle e svuotare il pulsante.

La navigazione dell’interfaccia è disponibile anche in sola lettura. Le sequenze con scritture audio mantengono la verifica preventiva, l’abilitazione di Controllo e il riscontro dei comandi. Le definizioni vengono conservate come configurazione locale anche durante una sessione live, senza salvare lo stato audio ricevuto nel progetto demo.

I dettagli delle assegnazioni e i limiti dei comandi del banco sono nella [guida alle macro](MACROS.md).

## Aggiornamento cumulativo per Mac M1

Il pacchetto aggiorna i sorgenti della 0.6.4 già presenti nel repository **mrgianluca990-bit/Sculpt-Wing**, osservati al commit `d376463b87ba9389f39f33aa1600e23656e21a6b`. Include anche tutte le modifiche della 0.6.5: manopole nell’editor, DCA, meter G/C, righe ridimensionabili, ancoraggi, sfumature, ripristino del nome standard, doppio clic a 0 dB e correzioni dell’anteprima.

È sufficiente caricare **Sculpt-Wing-0.6.6-Aggiornamento-Mac-M1.zip** estratto, mantenendo i percorsi e gli altri file del repository. Funziona come aggiornamento dalla 0.6.4 o dalla 0.6.5. Le istruzioni sono in [CARICA_SU_GITHUB.md](../CARICA_SU_GITHUB.md).

Il workflow conserva il target esclusivo **Mac M1 / Apple Silicon ARM64**. Dopo il caricamento su main, **Build Sculpt Wing - Mac M1** deve produrre l’artifact **Sculpt-Wing-Mac-M1**, contenente **Sculpt-Wing-0.6.6-mac-arm64.zip** e l’app. La preparazione dei sorgenti e i test Linux restano distinti dalla compilazione macOS e dal collaudo sul banco fisico.

## Verifiche

Esiti finali nell’ambiente Linux, con Node 24.22.1:

| Verifica | Esito |
| --- | --- |
| Protocollo e app nativa | 100 test superati |
| Modello, importazione, interfaccia e macro | 280 test superati |
| Desktop, socket e gestione PDF | 18 test superati |
| Totale | **398 test superati**, nessun fallimento negli esiti finali |
| Rendering dell’editor | 456 render sulle 76 strip |
| TypeScript, bridge nativo e lettore PDF locale | Build riuscita |
| Preparazione dell’app desktop | Riuscita |
| Cache offline della consegna | v22 |

I test dell’importazione comprendono PDF Producer reali, gruppi con nomi uguali, creazione e divisione, spostamento di più canali, righe escluse e vuote, MON e IEM facoltativi, nomi automatici e personalizzati, BUS condivisi, applicazione e annullamento. La verifica confronta anche routing, processing, DCA e mandate estranee all’importazione, che devono rimanere conservati.

I test delle macro coprono la migrazione da otto a sedici pulsanti, la conservazione delle assegnazioni e dei pulsanti volutamente vuoti, apertura di menu e sezioni dell’editor, selezione dei parametri, esecuzione e persistenza. Una macro con un’azione successiva non valida viene respinta prima della prima azione. Il cambio di sessione, modello o schema impedisce di inviare un comando preparato per valori precedenti; un errore nel riscontro del banco interrompe l’esecuzione.

L’integrazione con l’app reale e un driver di prova verifica inoltre che configurare una macro in modalità WING di sola lettura e scegliere un parametro tramite **Usa nella macro** non invii comandi audio. La definizione rimane disponibile tornando alla demo ed è conservata nel profilo locale delle macro.

### Prova interattiva del frontend desktop

Il frontend preparato per il desktop è stato aperto nel browser e provato tramite i controlli dell’app:

- Importato un PDF Producer con **21 ingressi e quattro monitor**. La scheda Strumenti ha permesso di creare il gruppo Overhead con CH 7 e CH 8, riportarlo in Batteria e rendere i canali indipendenti senza eliminarli dalla lista.
- Assegnati alla batteria un MON e un IEM: i BUS hanno assunto i nomi **Batteria MON** e **Batteria IEM**. La rinomina dello strumento ha aggiornato immediatamente le etichette; nome manuale, ritorno automatico e scelta dello strumento per un BUS condiviso sono stati verificati.
- Il monitor **IEM Tastiere Nord** del PDF è stato proposto direttamente nel secondo slot, lasciando il primo su Nessuno e conservando il suffisso IEM nel nome del BUS.
- **Applica scena** ha aggiornato i nomi sulle strip BUS e chiuso la finestra. Riaprendo l’importatore, **Annulla importazione** ha ripristinato i valori precedenti.
- La macro **M9** è stata assegnata all’apertura di **I/O → Uscite**, con nome personalizzato conservato. La macro **M10** ha aperto direttamente l’**EQ di CH 17**.
- **F2** ha riaperto la configurazione di M10; **Svuota pulsante** ha ripristinato la scelta dell’azione e disabilitato Esegui. Dopo il ricaricamento dell’app, M9 ha conservato il nome e l’assegnazione e M10 è rimasta vuota.

Immagini della verifica: [gruppi e assegnazioni MON/IEM](images/gruppi-mon-iem-0.6.6.jpg), [nuovi pulsanti macro](images/macro-vuote-0.6.6.jpg) e [richiamo diretto dell’EQ](images/macro-editor-eq-0.6.6.jpg).

Queste verifiche riguardano i sorgenti, il frontend desktop e il protocollo con driver di prova. **Il binario macOS ARM64 deve essere generato da GitHub Actions dopo il caricamento del pacchetto**: la nuova app non è stata compilata o avviata su un Mac M1 in questo ambiente. Non è stato eseguito un collaudo su una WING fisica.

Guida completa: [Dal PDF di Producer alla scena Sculpt Wing](CHANNEL_LIST_IMPORT.md).
