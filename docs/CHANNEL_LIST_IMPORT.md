# Dal PDF di Producer alla scena Sculpt Wing

## Flusso della versione 0.7.0

Apri **Menu del banco → Importa channel list**, scegli il PDF esportato da Producer e controlla le quattro schede **Canali**, **Strumenti**, **Mandate** e **Rimanenti**. Puoi anche iniziare senza PDF con **Aggiungi canale vuoto**. La lettura avviene sul dispositivo. Il progetto cambia soltanto quando premi **Applica scena**.

Tutti i valori proposti sono modificabili nell’anteprima. Il numero e la pagina del PDF, il nome originale e le informazioni di provenienza restano visibili per aiutare il controllo. **Il routing del canale è sempre conservato.**

Quando cambi un monitor principale o il BUS assegnato, l’anteprima **mantiene la posizione di scorrimento** della tabella e della lista monitor, sia in verticale sia in orizzontale. Anche tornando da una scheda all’altra ritrovi la posizione precedente. Dopo **Applica scena**, se l’operazione riesce, la finestra si chiude e il mixer mostra la conferma. Offline puoi riaprire **Importa channel list** e usare **Annulla importazione** senza ricaricare il PDF; in live l’operazione usa la cronologia generale con **Cmd + Z** e le sue verifiche sui valori del banco.

## Valori iniziali

| Elemento | Proposta iniziale |
| --- | --- |
| Canali importati | Mute attivo, fader a −∞ |
| Primo e secondo monitor principale, se assegnati | Entrambe le mandate attive, −5 dB, PRE |
| Mandate agli altri monitor assegnati | Attive, −8 dB, POST |
| Segue mute | Attivo su tutte le mandate proposte |
| Canale vuoto aggiunto manualmente | Nome CH n/AUX n, grigio, mute attivo, fader −∞, nessun principale, mandate ai monitor dell’anteprima disattivate a −∞ |
| Canali rimanenti | Lasciati come sono |

Ogni strumento può avere **nessuno, uno o due monitor principali**. Le caselle **Principale 1** e **Principale 2** sono entrambe facoltative e devono indicare BUS diversi. Puoi usare il secondo anche lasciando il primo su **Nessuno**. Senza principali, un ingresso importato continua ad avere le proposte −8 dB POST verso i monitor presenti; un canale vuoto mantiene invece queste mandate disattivate. Puoi modificare ogni invio o rimuovere i monitor dall’elenco.

Il valore interno del fader minimo è −90; nell’interfaccia viene mostrato **−∞**. Nei campi dei livelli puoi scrivere `−∞`, `-inf`, `-90` oppure un valore fino a +10 dB. Sono accettati sia il punto sia la virgola decimale.

Se modifichi mute o fader rispetto alla partenza, l’anteprima lo segnala. Se disattivi **Segue mute**, quella mandata può restare attiva anche con il canale in mute: la scelta resta consentita e viene evidenziata.

## Scheda Canali

La tabella riunisce i canali per strumento. Ogni gruppo ha una sola intestazione con il nome dello strumento, i due principali facoltativi, l’elenco dei canali collegati e i pulsanti **Modifica gruppo** e **Mandate**. L’assegnazione fatta qui vale per tutti i canali dello strumento: non occorre ripeterla per ogni ingresso.

Per ciascuna riga puoi:

- Includere o escludere l’ingresso dall’importazione.
- Scegliere la destinazione CH 1–40 oppure AUX 1–8.
- Modificare nome, colore, mute e fader.
- Scegliere lo **Strumento collegato**, oppure **Rendi indipendente**.
- Aprire le mandate del solo canale o rimuovere la riga dall’anteprima.

Il nome applicato al canale può contenere al massimo 16 caratteri. Il nome completo del PDF rimane visibile anche quando la proposta viene accorciata. La numerazione 1–40 propone gli omonimi CH, conservando eventuali buchi. AUX deve essere esplicito nel testo o scelto manualmente. Il numero 41 non viene convertito automaticamente in AUX 1.

Assegnare una riga a CH 5 significa applicare a quel canale i valori confermati nell’anteprima; il suo ingresso fisico e le sue sorgenti restano quelli già configurati. Due righe selezionate sullo stesso canale bloccano l’applicazione fino alla correzione. Le righe ambigue possono essere escluse o completate.

### Aggiungere un canale vuoto

**Aggiungi canale vuoto** riserva il primo ingresso libero nell’anteprima, cercando prima CH 1–40 e poi AUX 1–8. Anche le destinazioni delle righe escluse sono considerate occupate, così il nuovo canale non si sovrappone a una proposta già presente. Puoi cambiare la destinazione manualmente.

La nuova riga è già selezionata e utilizzabile: nome standard **CH n** o **AUX n**, colore grigio, mute attivo, fader a −∞ e nessun monitor principale. Le mandate verso i monitor dell’anteprima partono **disattivate a −∞**, anche se aggiungi quei monitor in seguito. Nessun monitor viene creato automaticamente per il canale vuoto.

Il canale vuoto può rimanere uno spazio riservato oppure diventare un nuovo ingresso: tutti i suoi campi sono modificabili, può essere collegato a uno strumento ed è possibile attivarne le mandate. Se assegni un principale, la relativa mandata viene attivata a −5 dB PRE. Se rimuovi quel principale dalla riga vuota, il suo invio torna disattivato a −∞. La scelta non sposta le sorgenti fisiche né rinumera gli altri canali. Se tutti i 48 ingressi sono già assegnati nelle proposte, l’anteprima segnala che non c’è una destinazione libera.

### Strumenti con più canali

Cassa, rullante, tom e overhead possono essere collegati come batteria; L/R di una tastiera come un solo strumento. Le proposte usano i nomi completi prima dell’accorciamento, comprese le diciture Producer come `Key L · Mario` e `Key R · Mario`.

Il collegamento riguarda le assegnazioni nell’anteprima. Scegliendo lo stesso **Strumento collegato** per più righe, il primo e il secondo monitor principale si assegnano una volta per tutto il gruppo. Il nome dello strumento si corregge nella sua intestazione; i nomi dei singoli canali rimangono indipendenti. Dare lo stesso nome a due gruppi non li unisce automaticamente: per unirli sposta i membri nella scheda **Strumenti** oppure usa il selettore del collegamento.

Collegare una riga a un altro strumento le fa adottare i due principali di quel gruppo. **Rendi indipendente** separa il canale conservandone le proposte attuali, che da quel momento possono avere principali diversi. Le modifiche di gruppo aggiornano anche le righe escluse nell’anteprima, ma **Applica scena** modifica soltanto quelle selezionate.

Chitarra 1 e Chitarra 2, oppure Voce 1 e Voce 2, restano strumenti distinti; il colore comune non basta a riunirli. Il collegamento dell’anteprima non modifica link stereo, sorgenti o altri collegamenti del banco.

### Palette richiesta

| Famiglia | Colore proposto |
| --- | --- |
| Batteria | Rosso |
| Basso | Verde |
| Chitarre | Blu |
| Tastiere | Bianco |
| Voci | Rosa |
| Fiati | Giallo |
| Archi | Arancio |

I colori sono suggeriti dai nomi e dalle intestazioni in italiano e inglese. Ogni proposta può essere cambiata. Anche `Clarinetto basso` e `Bass clarinet` vengono riconosciuti come fiati e proposti in giallo. I colori personalizzati già presenti nel progetto restano disponibili come colore attuale.

## Scheda Strumenti — correggere i gruppi del PDF

Il riconoscimento propone i gruppi; puoi modificarli prima di applicare. Apri **Strumenti**, oppure premi **Modifica gruppo** nell’intestazione della tabella Canali.

- **Rinomina:** modifica il nome del gruppo. I nomi dei singoli ingressi rimangono quelli scelti nella scheda Canali.
- **Crea un gruppo:** scegli uno o più canali, scrivi il nome del nuovo strumento e scegli il canale da cui ereditare i principali. Se scegli soltanto alcuni membri di un gruppo, lo dividi in due.
- **Sposta in un gruppo:** scegli i canali e lo strumento di destinazione. Per unire due gruppi, sposta tutti i membri del primo nel secondo.
- **Rendi indipendenti:** separa i canali scelti conservando le loro mandate. I gruppi rimasti senza membri scompaiono; i canali rimangono nella lista.

Le caselle di selezione di questa scheda servono a modificare i gruppi. Sono distinte dalle caselle **Usa** che includono o escludono i canali dall’importazione. Puoi passare da un gruppo all’altro per scegliere membri di più strumenti; il conteggio e la vista dei selezionati permettono di controllare l’insieme prima dell’azione.

Il nuovo gruppo eredita i due principali dal canale di riferimento, proposto inizialmente come il primo dei canali scelti nell’ordine della lista. Spostare in un gruppo esistente adotta invece i suoi principali. Le assegnazioni da ereditare sono visibili prima dell’azione. Se la coppia rimane uguale, le mandate già personalizzate restano uguali; quando un BUS cambia ruolo, si applicano i livelli PRE/POST descritti nella scheda Mandate. Separare canali conserva la coppia e tutte le proposte di invio.

Nomi dei canali, colori, destinazioni, mute, fader e inclusione nell’importazione rimangono conservati durante gli spostamenti. Tutto avviene nella proposta: il progetto cambia solo con **Applica scena**.

### Nome automatico del monitor e dell’IEM

La prima assegnazione principale identifica il **monitor da palco (MON)**; la seconda identifica l’**IEM**. Entrambe restano facoltative. Se il musicista ha soltanto un IEM, lascia il primo su Nessuno e usa il secondo.

| Strumento | Assegnazione | Nome proposto del BUS |
| --- | --- | --- |
| Batteria | Principale 1 → BUS 1 | Batteria MON |
| Batteria | Principale 2 → BUS 2 | Batteria IEM |
| Basso | Principale 2 → BUS 3 | Basso IEM |

Se il PDF indica esplicitamente **IEM** nel nome di un monitor, l’abbinamento univoco viene proposto nella seconda assegnazione. Un monitor MON o senza indicazione IEM viene proposto nella prima. Se sono presenti un MON e un IEM abbinati univocamente allo stesso strumento, vengono proposti entrambi; più candidati per lo stesso ruolo richiedono una scelta nell’anteprima.

Cambiare il nome dello strumento aggiorna i nomi automatici dei relativi BUS. Per nomi lunghi, viene accorciata soltanto la parte dello strumento in modo da conservare MON o IEM entro il limite di 16 caratteri. I nomi dei singoli canali non cambiano.

Nella scheda **Mandate** puoi correggere manualmente il nome del BUS e tornare alla generazione automatica. Se un BUS è condiviso, scegli da quale strumento e ruolo deve prendere il nome; un BUS ha una sola etichetta. **Applica nome e colore al bus** resta la scelta che decide se applicare questa identità al progetto. Fader, mute, formato stereo e routing del BUS rimangono conservati.

## Scheda Mandate

**Monitor assegnati** contiene l’elenco dei BUS coinvolti nell’importazione. Puoi aggiungere o rimuovere monitor, cambiare il BUS di destinazione e correggerne nome e colore. Sono disponibili al massimo **16 BUS distinti**. Più strumenti possono condividere un BUS.

I monitor sono ordinati per numero di BUS crescente: **BUS 1, BUS 2, … BUS 10, … BUS 16**. Lo stesso ordine vale nei menu dei principali e nella tabella delle mandate. **Aggiungi monitor** propone il BUS libero con il numero più basso. Se cambi il numero di un BUS, il monitor viene riordinato mantenendo il proprio nome, gli abbinamenti dei principali e le mandate già modificate; lo scorrimento della schermata resta nella posizione corrente.

La casella **Applica nome e colore al bus**, attiva inizialmente, applica l’identità proposta al relativo BUS. Disattivala per conservarne nome e colore esistenti. I fader, i mute e il routing delle uscite BUS vengono sempre conservati.

Scegli un **Canale di riferimento** e usa **Modifica le mandate per** per scegliere l’ambito:

- **Tutto lo strumento**: ogni valore che modifichi viene applicato a tutti i canali collegati. È la scelta iniziale della scheda e quella aperta dal pulsante Mandate dell’intestazione del gruppo.
- **Solo questo canale**: cambia soltanto l’ingresso mostrato. È la scelta aperta dal pulsante Mandate della singola riga.

Puoi correggere **Attiva**, livello, PRE/POST e **Segue mute** per ogni invio. Quando i canali dello strumento hanno valori differenti, compare **Valori diversi** e vengono mostrati quelli del canale di riferimento. Modificare, per esempio, il PRE/POST di tutto lo strumento conserva le eventuali differenze individuali di livello: si aggiorna soltanto il parametro scelto.

Le assegnazioni **Principale 1** e **Principale 2** rimangono condivise dal gruppo anche quando stai correggendo una singola mandata. Un nuovo principale viene attivato a −5 dB PRE su tutti i canali collegati. Il precedente diventa −8 dB POST quando non è più uno dei principali, oppure torna disattivato a −∞ nel caso di una riga vuota. Le altre modifiche restano conservate. Cambiando invece il numero del BUS di un monitor, i valori già corretti e i riferimenti di entrambi i principali seguono quel monitor.

Puoi rimuovere anche tutti i monitor: con valori dei canali validi, **Applica scena** resta disponibile. In quel caso non sono previste modifiche alle mandate e i relativi valori esistenti del progetto vengono conservati.

### Quando il PDF contiene le uscite

Producer stampa **USCITE AUX** con le colonne **Uscita · Destinazione · Formato · Note**. Wing propone i monitor da questo elenco e mostra il nome originale completo, i riferimenti AUX e il formato. Una coppia con lo stesso nome, un lato L e un lato R, viene proposta come **un monitor logico su un BUS**. Questa lettura conserva il formato già impostato sul BUS e il patch delle uscite: non crea collegamenti stereo o assegnazioni fisiche.

I numeri AUX del documento sono riferimenti alla lista di Producer. Non impongono il numero del BUS WING. Puoi quindi associare, per esempio, un monitor indicato come AUX 7 a BUS 10 nell’anteprima.

Il PDF attuale di Producer non stampa gli identificativi degli strumenti né un collegamento esplicito tra ogni ingresso e il suo monitor. L’abbinamento viene quindi proposto dai nomi solo quando è univoco. Uno strumento senza abbinamento rimane su **Nessuno** e non blocca l’applicazione. Puoi lasciarlo così, scegliere uno o due monitor oppure aggiungerne altri.

Se il PDF non contiene un elenco monitor, Wing propone un BUS per ogni strumento riconosciuto. Oltre 16 strumenti, gli ulteriori gruppi possono restare senza principale oppure condividere i monitor già assegnati. Uscite chiaramente destinate a PA, registrazione o altre funzioni vengono escluse dalle proposte monitor e segnalate; possono essere aggiunte manualmente se necessario.

### Punto di prelievo PRE conservato

Su un CH WING, le mandate PRE seguono il punto di prelievo condiviso già impostato sul canale. L’importazione conserva anche questa scelta e la mostra nella scheda Mandate.

Se il punto esistente è **AFL** o **POST**, impostare semplicemente la mandata su PRE non garantirebbe un prelievo prima del fader. In questo caso l’anteprima segnala il conflitto e blocca l’applicazione della mandata PRE attiva. Puoi scegliere POST nell’anteprima, usare un altro canale oppure configurare consapevolmente il punto di prelievo nell’editor del canale prima di importare. L’importatore non lo riscrive automaticamente.

## Scheda Rimanenti

La scelta iniziale è **Lascia come sono**. Tutti gli ingressi CH/AUX non importati conservano il proprio stato.

Scegliendo **Inizializza nome, colore, mute e fader**, per i soli ingressi rimanenti vengono proposti:

| Campo | Proposta |
| --- | --- |
| Nome | CH n oppure AUX n |
| Colore | Grigio |
| Mute | Attivo |
| Fader | −∞ |

Puoi escludere singoli canali dall’inizializzazione e modificare ciascuno di questi valori. Questa inizializzazione riguarda esclusivamente i quattro campi indicati: conserva processing, gain, phantom, insert, routing e mandate esistenti.

L’elenco dei rimanenti si aggiorna quando cambi la destinazione di una riga o la escludi dall’importazione. Se l’inizializzazione è attiva, i nuovi rimanenti ricevono la stessa proposta; le eccezioni già scelte vengono mantenute. Controlla quindi questa scheda dopo gli ultimi cambi di destinazione.

## Ambito e conservazione del progetto

L’applicazione può modificare soltanto:

- Nome, colore, mute e fader degli ingressi importati.
- Attivazione, livello, PRE/POST e Segue mute delle loro mandate verso i monitor assegnati.
- Nome e colore dei BUS con la relativa casella attiva.
- Nome, colore, mute e fader dei rimanenti scelti per l’inizializzazione.

Restano conservati sorgenti e sorgenti alternative dei canali, patch delle uscite, preamplificatori, phantom, processing, insert, ordine dei processori, punti di prelievo condivisi, invii a MAIN/MTX e invii ai BUS esclusi dall’elenco dei monitor. Pan e altri parametri delle mandate non previsti nell’anteprima restano quelli del progetto. DCA, automix, Custom Layer e macro restano conservati.

Il comando **Applica scena** opera sul progetto offline oppure sulla WING collegata con **Controllo** attivo. In live legge i campi della proposta, verifica metadati e valori anche quando sembrano invariati, poi invia attraverso la coda verificata e attende i riscontri. La finestra mostra l’avanzamento; un’interruzione può lasciare una parte dei parametri applicati e viene segnalata senza reinvio automatico. Il progetto esportabile conserva il formato Sculpt: questa funzione prepara i campi della channel list e non genera uno snapshot nativo WING.

**CLINK viene conservato.** Prima di cambiare nomi o colori, l’app deve conoscere il collegamento e la sorgente attiva. Se più canali seguono la stessa sorgente, le identità proposte devono essere compatibili e non alterare indirettamente canali esclusi. In caso contrario l’anteprima identifica il conflitto prima dell’invio. Un dato non ricevuto dal banco non viene trattato come un valore già confermato.

## Applicazione e annullamento

L’importazione viene validata e applicata in un’unica transazione. Se una destinazione è duplicata, i due principali indicano lo stesso BUS, un riferimento BUS non è valido o un valore non è valido, il progetto non viene modificato parzialmente. L’assenza di uno o di entrambi i principali è consentita.

Dopo un’applicazione riuscita la finestra **si chiude automaticamente** e compare la conferma sul mixer. Succede anche se tutte le proposte coincidono già con il progetto e non occorrono ulteriori modifiche. Un errore o un conflitto lascia invece aperta l’anteprima per permettere la correzione.

Per usare **Annulla importazione**, riapri **Menu del banco → Importa channel list**: il pulsante è disponibile anche senza caricare un PDF. Ripristina soltanto i valori effettivamente modificati dall’ultima importazione. Se uno di quei valori è stato cambiato successivamente, l’annullamento viene rifiutato interamente per preservare la nuova modifica. Cambiamenti successivi a campi diversi, come il pan, restano conservati. Una seconda applicazione senza cambiamenti conserva l’ultimo annullamento disponibile.

Il pulsante **Annulla importazione** riguarda l’applicazione offline e rimane disponibile nella sessione corrente, anche chiudendo e riaprendo la finestra di importazione. Non viene salvato per un riavvio dell’app. In live si usa invece **Cmd + Z**, con verifica della sessione e dei valori correnti; una modifica esterna può impedire il ripristino di un dato obsoleto.

## PDF supportati

Sono supportati PDF con testo selezionabile, anche su più pagine. La lettura riconosce le colonne Producer **CH · Sorgente · DI / Mic · Asta · Note**, ricompone le sorgenti che vanno a capo e separa ingressi, monitor, stage plot e preventivo. Gestisce anche la stampa desktop dello stage plot quando la tabella ingressi compare senza il titolo INGRESSI.

Un rider può avere numerazioni o impaginazioni diverse: le proposte richiedono sempre il controllo dell’anteprima. Sono disponibili anche **Incolla testo** e **Aggiungi canale vuoto** per preparare o completare manualmente la lista. I PDF scansionati richiedono OCR, che questa versione non include; nei documenti misti vengono segnalate le pagine senza testo.

Il lettore e il worker sono inclusi nell’app. La lettura non richiede Internet, chiavi API o un’app ponte e non carica il PDF su un servizio esterno.

## Editor del canale nella riga opposta

In vista **Compact**, aprendo l’editor dalla strip, il pannello occupa la **riga opposta** e lascia visibile quella del canale: un ingresso nella riga inferiore apre l’editor in alto; una strip nella riga superiore lo apre in basso. Nel **Custom Layer** conta la posizione effettiva della strip. In **Extended** l’editor occupa l’area dei processori sopra i fader. **Cmd + =** alterna le viste.

## Riferimenti di implementazione e verifica

- [Riconoscimento PDF e strumenti](../dist/channel-list.js).
- [Proposte, validazione, applicazione e annullamento](../dist/channel-list-scene.js).
- [Anteprima modificabile](../dist/channel-list-preview.js) e [stili](../dist/channel-list.css).
- [Reader locale](../native/src/pdf-reader.mjs).
- [Test parser](../tests/channel-list.test.cjs), [motore scena](../tests/channel-list-scene.test.cjs) e [interfaccia](../tests/channel-list-preview.test.cjs).
- [Prove con PDF prodotti dall’esportatore Producer](../tests/producer-import.test.cjs) e [dati attesi](../tests/fixtures/pdf/producer-expected.json).
- [Test applicazione live e rinomina](../tests/channel-list-live-070.test.cjs).
- [Note della versione 0.7.0](RELEASE_0.7.0_MAC_M1.md).
