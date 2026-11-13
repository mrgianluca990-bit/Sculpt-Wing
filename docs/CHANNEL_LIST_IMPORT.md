# Dal PDF di Producer alla scena Sculpt Wing

## Flusso della versione 0.6.3

Apri **Menu del banco → Importa channel list**, scegli il PDF esportato da Producer e controlla le tre schede **Canali**, **Mandate** e **Rimanenti**. La lettura avviene sul dispositivo. Il progetto cambia soltanto quando premi **Applica scena**.

Tutti i valori proposti sono modificabili nell’anteprima. Il numero e la pagina del PDF, il nome originale e le informazioni di provenienza restano visibili per aiutare il controllo. **Il routing del canale è sempre conservato.**

## Valori iniziali

| Elemento | Proposta iniziale |
| --- | --- |
| Canali importati | Mute attivo, fader a −∞ |
| Mandata al monitor principale dello strumento | Attiva, −5 dB, PRE |
| Mandate agli altri monitor assegnati | Attive, −8 dB, POST |
| Segue mute | Attivo su tutte le mandate proposte |
| Canali rimanenti | Lasciati come sono |

Il valore interno del fader minimo è −90; nell’interfaccia viene mostrato **−∞**. Nei campi dei livelli puoi scrivere `−∞`, `-inf`, `-90` oppure un valore fino a +10 dB. Sono accettati sia il punto sia la virgola decimale.

Se modifichi mute o fader rispetto alla partenza, l’anteprima lo segnala. Se disattivi **Segue mute**, quella mandata può restare attiva anche con il canale in mute: la scelta resta consentita e viene evidenziata.

## Scheda Canali

Per ciascuna riga puoi:

- Includere o escludere l’ingresso dall’importazione.
- Scegliere la destinazione CH 1–40 oppure AUX 1–8.
- Modificare nome, colore, mute e fader.
- Correggere l’etichetta **Strumento** usata nell’anteprima.
- Scegliere il **Bus principale** e aprire le singole mandate.

Il nome applicato al canale può contenere al massimo 16 caratteri. Il nome completo del PDF rimane visibile anche quando la proposta viene accorciata. La numerazione 1–40 propone gli omonimi CH, conservando eventuali buchi. AUX deve essere esplicito nel testo o scelto manualmente. Il numero 41 non viene convertito automaticamente in AUX 1.

Assegnare una riga a CH 5 significa applicare a quel canale i valori confermati nell’anteprima; il suo ingresso fisico e le sue sorgenti restano quelli già configurati. Due righe selezionate sullo stesso canale bloccano l’applicazione fino alla correzione. Le righe ambigue possono essere escluse o completate; **Aggiungi riga** permette di inserire manualmente un ingresso mancante.

### Strumenti con più canali

Più ingressi possono condividere lo stesso monitor principale: per esempio cassa, rullante, tom e overhead della batteria, oppure L/R di una tastiera. Le proposte usano i nomi completi prima dell’accorciamento, comprese le diciture Producer come `Key L · Mario` e `Key R · Mario`.

Il bus scelto nella colonna **Bus principale** determina l’abbinamento effettivo. **Strumento** è un’etichetta di lettura dell’anteprima: modificarla da sola non sposta le mandate. Chitarra 1 e Chitarra 2, oppure Voce 1 e Voce 2, restano strumenti distinti; il colore comune non basta a riunirli.

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

Scegli un ingresso in **Canale per le mandate** per modificare separatamente ogni invio: **Attiva**, livello, PRE/POST e **Segue mute**. Cambiando il monitor principale, la mandata al nuovo principale riparte da −5 dB PRE e quella al precedente da −8 dB POST; le modifiche alle altre mandate restano conservate. Cambiando invece il numero del BUS di un monitor, i valori già corretti seguono quel monitor.

### Quando il PDF contiene le uscite

Producer stampa **USCITE AUX** con le colonne **Uscita · Destinazione · Formato · Note**. Wing propone i monitor da questo elenco e mostra il nome originale completo, i riferimenti AUX e il formato. Una coppia con lo stesso nome, un lato L e un lato R, viene proposta come **un monitor logico su un BUS**. Questa lettura conserva il formato già impostato sul BUS e il patch delle uscite: non crea collegamenti stereo o assegnazioni fisiche.

I numeri AUX del documento sono riferimenti alla lista di Producer. Non impongono il numero del BUS WING. Puoi quindi associare, per esempio, un monitor indicato come AUX 7 a BUS 10 nell’anteprima.

Il PDF attuale di Producer non stampa gli identificativi degli strumenti né un collegamento esplicito tra ogni ingresso e il suo monitor. L’abbinamento viene quindi proposto dai nomi solo quando è univoco. Uno strumento senza abbinamento resta da assegnare: scegli il suo monitor principale oppure aggiungi un monitor prima di applicare.

Se il PDF non contiene un elenco monitor, Wing propone un BUS per ogni strumento riconosciuto. Oltre 16 strumenti occorre scegliere quali condividono un monitor. Uscite chiaramente destinate a PA, registrazione o altre funzioni vengono escluse dalle proposte monitor e segnalate; possono essere aggiunte manualmente se necessario.

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

L’importazione viene validata e applicata in un’unica transazione. Se una destinazione è duplicata, manca un monitor principale o un valore non è valido, il progetto non viene modificato parzialmente.

**Annulla importazione**, disponibile nello stesso dialogo dopo l’applicazione, ripristina soltanto i valori effettivamente modificati dall’importazione. Se uno di quei valori è stato cambiato successivamente, l’annullamento viene rifiutato interamente per preservare la nuova modifica. Cambiamenti successivi a campi diversi, come il pan, restano conservati. Una seconda applicazione senza cambiamenti conserva l’ultimo annullamento disponibile.

## PDF supportati

Sono supportati PDF con testo selezionabile, anche su più pagine. La lettura riconosce le colonne Producer **CH · Sorgente · DI / Mic · Asta · Note**, ricompone le sorgenti che vanno a capo e separa ingressi, monitor, stage plot e preventivo. Gestisce anche la stampa desktop dello stage plot quando la tabella ingressi compare senza il titolo INGRESSI.

Un rider può avere numerazioni o impaginazioni diverse: le proposte richiedono sempre il controllo dell’anteprima. Sono disponibili anche **Incolla testo** e l’aggiunta manuale delle righe. I PDF scansionati richiedono OCR, che questa versione non include; nei documenti misti vengono segnalate le pagine senza testo.

Il lettore e il worker sono inclusi nell’app. La lettura non richiede Internet, chiavi API o un’app ponte e non carica il PDF su un servizio esterno.

## Riferimenti di implementazione e verifica

- [Riconoscimento PDF e strumenti](../dist/channel-list.js).
- [Proposte, validazione, applicazione e annullamento](../dist/channel-list-scene.js).
- [Anteprima modificabile](../dist/channel-list-preview.js) e [stili](../dist/channel-list.css).
- [Reader locale](../native/src/pdf-reader.mjs).
- [Test parser](../tests/channel-list.test.cjs), [motore scena](../tests/channel-list-scene.test.cjs) e [interfaccia](../tests/channel-list-preview.test.cjs).
- [Prove con PDF prodotti dall’esportatore Producer](../tests/producer-import.test.cjs) e [dati attesi](../tests/fixtures/pdf/producer-expected.json).
- [Note della versione 0.6.3](RELEASE_0.6.3_MAC_M1.md).
