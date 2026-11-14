# Collaudo Sculpt Wing 0.6.8 — Mac M1 e WING

Questa prova completa i test automatici con il Mac e il mixer reali. La compilazione da eseguire su GitHub produce `Sculpt-Wing-0.6.8-mac-arm64.zip` nell’artifact `Sculpt-Wing-Mac-M1`.

## 1. Editor e risposta ai comandi

Apri CH 1, scegli EQ e passa a CH 2, CH 3 e CH 4 cliccando i nomi delle strip. Deve rimanere aperta la scheda EQ, con i valori del canale appena scelto. Ripeti con Dinamica, Gate e Mandate. Sui bus, che non hanno il blocco gate separato del CH, la vista compatibile è Dynamics. Cambia canale anche con le frecce dell’editor e con una macro che richiama espressamente EQ o Mandate.

Se stai digitando un valore, cambia canale senza prima premere Invio: il valore deve essere confermato sul canale precedente. Le letture in corso del vecchio canale non devono sovrascrivere il nuovo pannello. L’editor deve restare nella riga opposta, anche con custom layer e canali ancorati.

## 2. Precisione EQ

1. Scegli WING EQ e una banda centrale.
2. Afferra prima il centro e poi il bordo del punto: il solo clic non deve cambiare frequenza o gain.
3. Trascina in diagonale: il punto deve seguire il puntatore conservando il punto di presa; devono cambiare soltanto frequenza e gain della banda scelta.
4. Premi e rilascia Maiusc durante il gesto. La precisione cambia, senza spostamenti improvvisi.
5. Ridimensiona le righe e ripeti con un pannello alto e uno basso.
6. Usa Cmd+Z: l’intero trascinamento deve essere annullato insieme. Maiusc+Cmd+Z lo ripristina.

In collegamento live controlla anche la conferma dei valori dalla WING. Se il firmware modifica modello o schema durante il gesto, i controlli obsoleti devono essere disabilitati e riletti.

## 3. Pan sulle strip

Trascina il pan di un ingresso e di un’uscita, sia orizzontalmente sia verticalmente. Il nome del canale non deve aprire accidentalmente l’editor, il banco non deve scorrere e il livello del fader deve restare quello impostato. Doppio clic sul pan: centro **C**. Le frecce regolano il valore; Maiusc offre un passo più fine. Annulla e ripristina il gesto con Cmd+Z e Maiusc+Cmd+Z.

Ripeti su un canale ancorato e in un custom layer. In SOF verso un BUS/MTX:

- Con **Pan link** attivo, la strip CH/AUX mostra **LINK** e segue il pan del canale.
- Con Pan link disattivato, regola il pan della mandata e verifica che il pan principale e le altre mandate non cambino.
- Cambiando destinazione durante un gesto, il gesto precedente deve terminare senza scrivere sulla nuova destinazione.

In sola lettura o con valori non ancora ricevuti il pan non deve inviare modifiche. I DCA non hanno pan.

## 4. RTA reale

Apri **Meter / RTA → RTA** con la WING collegata. Controlla la sorgente e il tap effettivi riportati nell’intestazione. Se compare un indice come **Sorgente WING #N**, il firmware non ha fornito una mappatura verificabile al nome del canale: lo spettro è quello globale della console. Non trattarlo automaticamente come l’EQ del canale selezionato nell’app.

Scegli la sorgente sulla console e invia un tono noto, ad esempio 1 kHz, poi un segnale a banda larga. Il picco deve cadere nella zona attesa delle frequenze. La rappresentazione è **relativa**: questo test non calibra dBFS o dB SPL. Negli EQ l’overlay può comparire solo quando l’identità della sorgente è verificabile e coerente; altrimenti usa la vista RTA banco indicata dall’interfaccia.

Sposta la console su un’altra sorgente RTA e verifica che il cambio sia segnalato. Chiudi la vista, riaprila, manda l’app in background e poi in primo piano. Scollega e ricollega il mixer: uno spettro della sessione precedente non deve restare presentato come corrente. Senza mixer non devono apparire bande audio animate.

La WING condivide l’analizzatore fra banco e controller; una pagina aperta sulla console può avere la priorità. L’app non modifica in automatico lock o impostazioni del display per impossessarsene. Dettagli del protocollo, scala e sorgente: [RTA_WING.md](RTA_WING.md).

## 5. Verifica delle funzioni esistenti

Per fader, DCA, mandate, importazione, routing e OSC verso Show usare anche la [procedura WING/Show](COLLAUDO_WING_SHOW_0.6.7.md). Durante il collaudo annotare versione firmware WING, versione macOS, modello Mac, dimensioni della finestra ed eventuali messaggi nell’app: sono necessari per distinguere comportamento del firmware, grafica e trasporto.

I test automatici, il benchmark e le prove nel browser sono documentati nelle [note 0.6.8](RELEASE_0.6.8_MAC_M1.md). Queste prove non attestano da sole un collaudo su hardware fisico.
