# Dal PDF di Producer alla scena Sculpt Wing

## Flusso della versione 0.6.4

Apri **Menu del banco → Importa channel list**, scegli il PDF esportato da Producer e controlla le tre schede **Canali**, **Mandate** e **Rimanenti**. Puoi anche iniziare senza PDF con **Aggiungi canale vuoto**. La lettura avviene sul dispositivo. Il progetto cambia soltanto quando premi **Applica scena**.

Tutti i valori proposti sono modificabili nell’anteprima. Il numero e la pagina del PDF, il nome originale e le informazioni di provenienza restano visibili per aiutare il controllo. **Il routing del canale è sempre conservato.**

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

La tabella riunisce i canali per strumento. Ogni gruppo ha una sola intestazione con il nome dello strumento, i due principali facoltativi, l’elenco dei canali collegati e il pulsante **Mandate**. L’assegnazione fatta qui vale per tutti i canali dello strumento: non occorre ripeterla per ogni ingresso.

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

Il collegamento riguarda le assegnazioni nell’anteprima. Scegliendo lo stesso **Strumento collegato** per più righe, il primo e il secondo monitor principale si assegnano una volta per tutto il gruppo. Il nome dello strumento si corregge nella sua intestazione; i nomi dei singoli canali rimangono indipendenti. Dare lo stesso nome a due gruppi non li unisce automaticamente: per unirli usa il selettore del collegamento.

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

## Scheda Mandate

**Monitor assegnati** contiene l’elenco dei BUS coinvolti nell’importazione. Puoi aggiungere o rimuovere monitor, cambiare il BUS di destinazione e correggerne nome e colore. Sono disponibili al massimo **16 BUS distinti**. Più strumenti possono condividere un BUS.

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

Il comando **Applica scena** opera sul progetto Sculpt offline. L’anteprima si può preparare anche durante una sessione live, ma applicazione e annullamento restano bloccati finché quella sessione è attiva o in transizione. Il progetto esportabile usa il formato Sculpt; questa funzione non genera uno snapshot nativo WING e non invia automaticamente la scena al banco.

## Applicazione e annullamento

L’importazione viene validata e applicata in un’unica transazione. Se una destinazione è duplicata, i due principali indicano lo stesso BUS, un riferimento BUS non è valido o un valore non è valido, il progetto non viene modificato parzialmente. L’assenza di uno o di entrambi i principali è consentita.

**Annulla importazione**, disponibile nello stesso dialogo dopo l’applicazione, ripristina soltanto i valori effettivamente modificati dall’importazione. Se uno di quei valori è stato cambiato successivamente, l’annullamento viene rifiutato interamente per preservare la nuova modifica. Cambiamenti successivi a campi diversi, come il pan, restano conservati. Una seconda applicazione senza cambiamenti conserva l’ultimo annullamento disponibile.

## PDF supportati

Sono supportati PDF con testo selezionabile, anche su più pagine. La lettura riconosce le colonne Producer **CH · Sorgente · DI / Mic · Asta · Note**, ricompone le sorgenti che vanno a capo e separa ingressi, monitor, stage plot e preventivo. Gestisce anche la stampa desktop dello stage plot quando la tabella ingressi compare senza il titolo INGRESSI.

Un rider può avere numerazioni o impaginazioni diverse: le proposte richiedono sempre il controllo dell’anteprima. Sono disponibili anche **Incolla testo** e **Aggiungi canale vuoto** per preparare o completare manualmente la lista. I PDF scansionati richiedono OCR, che questa versione non include; nei documenti misti vengono segnalate le pagine senza testo.

Il lettore e il worker sono inclusi nell’app. La lettura non richiede Internet, chiavi API o un’app ponte e non carica il PDF su un servizio esterno.

## Editor del canale nella riga opposta

Fuori dal dialogo di importazione, aprendo l’editor dalla strip del mixer, il pannello occupa la **riga opposta** e lascia visibile quella del canale: un ingresso nella riga inferiore apre l’editor in alto; una strip nella riga superiore lo apre in basso. Nel **Custom Layer** conta la posizione effettiva della strip, anche quando un ingresso è stato collocato sopra o un’uscita sotto. La correzione conserva il mixer a due righe.

## Riferimenti di implementazione e verifica

- [Riconoscimento PDF e strumenti](../dist/channel-list.js).
- [Proposte, validazione, applicazione e annullamento](../dist/channel-list-scene.js).
- [Anteprima modificabile](../dist/channel-list-preview.js) e [stili](../dist/channel-list.css).
- [Reader locale](../native/src/pdf-reader.mjs).
- [Test parser](../tests/channel-list.test.cjs), [motore scena](../tests/channel-list-scene.test.cjs) e [interfaccia](../tests/channel-list-preview.test.cjs).
- [Prove con PDF prodotti dall’esportatore Producer](../tests/producer-import.test.cjs) e [dati attesi](../tests/fixtures/pdf/producer-expected.json).
- [Note della versione 0.6.4](RELEASE_0.6.4_MAC_M1.md).
