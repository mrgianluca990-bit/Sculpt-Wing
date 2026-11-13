# Importare una channel list in Sculpt Wing

## Flusso della versione 0.6.2

Apri **Menu del banco → Importa channel list** e scegli il PDF. La lettura avviene sul dispositivo. Il PDF non viene caricato su un servizio esterno.

L’anteprima mostra il numero e la pagina di origine, l’ingresso proposto, il nome e il colore. Puoi correggere ogni destinazione, accorciare o riscrivere i nomi, cambiare i colori, escludere una riga o aggiungerne una manualmente. Solo **Applica nomi e colori** modifica il progetto offline.

Il risultato usa gli stessi canali del mixer e rimane salvato nel progetto locale. Il comando **Annulla importazione**, disponibile dopo l’applicazione nello stesso dialogo, ripristina i nomi e i colori precedenti. Se nel frattempo uno di quei nomi o colori è stato modificato, l’annullamento viene rifiutato per evitare di sovrascrivere la modifica successiva. I cambiamenti ai fader intervenuti dopo l’importazione sono conservati.

## Palette richiesta

| Famiglia | Colore proposto |
| --- | --- |
| Batteria | Rosso |
| Basso | Verde |
| Chitarre | Blu |
| Tastiere | Bianco |
| Voci | Rosa |
| Fiati | Giallo |
| Archi | Arancio |

Il riconoscimento usa nomi e intestazioni di gruppo in italiano e inglese. Sono proposte modificabili: un’abbreviazione particolare può richiedere una correzione. Non viene dichiarata la ricostruzione dei colori stampati nel PDF.

## Come viene proposta la destinazione

- I numeri da 1 a 40 propongono CH 1–40, conservando eventuali buchi nella numerazione.
- AUX 1–8 viene proposto solo se AUX è esplicito, oppure può essere scelto manualmente.
- Il numero 41 non viene trasformato in AUX 1. La riga resta visibile, esclusa e non assegnata finché scegli l’ingresso.
- Due righe selezionate sullo stesso ingresso bloccano l’applicazione fino alla correzione.
- Un numero multiplo ambiguo, per esempio “9–12”, richiede una destinazione manuale.
- Una coppia consecutiva esplicitamente L/R può produrre due nomi; questo non crea un link stereo, né un patch hardware.
- Il nome viene limitato ai 16 caratteri supportati dal modello corrente. Il nome originale rimane visibile nell’anteprima e l’accorciamento viene segnalato.

L’assegnazione di una riga a CH 5 significa applicare il suo nome e colore a CH 5. Non significa collegare l’ingresso fisico 5 a quel canale.

## PDF supportati e controllo dell’anteprima

La prima versione legge PDF con testo selezionabile. Riconosce elenchi numerati e tabelle con colonne canale/nome, anche su più pagine; separa le colonne microfono, asta e note quando le intestazioni sono identificabili. Gestisce anche due tabelle affiancate.

PDF scansionati o contenenti soltanto immagini richiedono OCR, che questa versione non include. Il messaggio lo segnala e l’alternativa **Incolla una lista di testo** consente di proseguire. Nei documenti misti, le pagine senza testo sono segnalate.

Un rider non ha un formato universale. L’anteprima è parte del flusso: titoli, impaginazioni insolite, colonne prive di intestazioni e abbreviazioni richiedono verifica. Le righe mancanti si possono aggiungere manualmente. Non viene inventato testo assente dal documento.

## Ambito di questa prima importazione

L’applicazione modifica solamente `name` e `color` degli ingressi selezionati. Non cambia fader, mute, solo, mandate monitor/IEM, bus, patch, preamplificatori, phantom, EQ, dinamiche o Custom Layer. L’utente definirà in un secondo momento il comportamento delle mandate.

L’anteprima può essere letta mentre è aperta una sessione live, ma il comando di applicazione è disponibile nel progetto offline. Il vincolo viene ricontrollato anche al momento della transazione, per non trasformare l’importazione in una serie di scritture al banco durante un cambio di sessione.

La scena di progetto esportabile dall’app è il formato Sculpt. Questa funzione non genera ancora uno snapshot nativo della WING.

## Implementazione

- `native/src/pdf-reader.mjs`: lettura PDF.js incorporata nell’app e worker locale.
- `native/scripts/build-live.mjs`: costruzione del reader e del worker, insieme al bundle dell’app.
- `dist/channel-list.js`: riconoscimento, anteprima, validazione, applicazione e annullamento selettivo.
- `dist/channel-list.css`: dialogo e tabella della lista.
- `tests/channel-list.test.cjs`: parser e integrazione con modello, controller, mixer e persistenza reali.

La lettura usa i byte del file scelto. Non richiede una chiave API, una connessione Internet o un’app ponte. Il worker appartiene al pacchetto; la policy desktop mantiene bloccate le connessioni di rete del renderer.
