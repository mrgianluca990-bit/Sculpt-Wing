# Collaudo pratico — Sculpt Wing 0.6.7, WING e Sculpt Show

Questa scheda serve per la prima prova della nuova versione sul Mac M1, con il mixer reale e con Show. **Il collaudo hardware non è stato eseguito nell’ambiente di sviluppo.** La build ARM64 deve prima essere prodotta dal workflow GitHub e aperta sul Mac.

Annotare: data, modello Mac, versione macOS, versione Sculpt Wing, modello e firmware WING, versione/build Show e indirizzi utilizzati. Salvare la scena attuale del banco e usare un canale, un BUS, un DCA e una cue destinati alla prova, con ascolto a livello controllato.

## 1. WING: lettura e controlli

Collegare l’app al mixer in **sola lettura**. Confrontare nome, fader, mute e un parametro EQ sullo stesso canale; confrontare anche un BUS e un DCA. Modificare un valore dal banco e verificare che arrivi nell’app. Un dato non ancora ricevuto deve restare non disponibile, senza assumere un valore demo.

Passare a **Controllo** per le prove seguenti. Per ogni riga annotare OK/KO e il valore osservato sul banco.

| Prova | Risultato da verificare |
| --- | --- |
| DCA nella riga superiore | Raggiungere i DCA con il pulsante dedicato e con lo scorrimento. BUS, matrici e master restano nella stessa riga. Nome, membri, fader, mute e solo corrispondono al banco. |
| Ancoraggi | Ancorare un DCA a sinistra e un BUS a destra; scorrere il centro. I due controlli restano utilizzabili. Riaprire l’app e verificare gli ancoraggi; poi liberarli. |
| WING EQ e Dynamics | Muovere un parametro per volta nel processore già selezionato. Confrontare valore nell’app e nel banco, poi modificarlo dal banco e controllare il ritorno nell’app. Selezionare una banda EQ dal grafico e dalla scheda corrispondente. |
| Mandata | Trascinare la testa del fader, inserire un livello numerico e provare il doppio clic a 0 dB. Il clic sul solo binario non deve cambiare il livello. Verificare PRE/POST sul banco e che il routing estraneo alla prova non cambi. |
| Cmd+Z / Maiusc+Cmd+Z | Eseguire un trascinamento continuo su fader, DCA, mandata e punto EQ. Una pressione annulla l’intero gesto; il ripristino riporta il valore finale. Controllare anche i valori effettivi sul banco, dopo la conferma. |
| Conflitto | Dopo una modifica dall’app, cambiare lo stesso parametro dal banco e attendere che il nuovo valore arrivi. Cmd+Z deve segnalare il conflitto, senza sovrascrivere il valore più recente. |
| Sessione | Eseguire una modifica, scollegare e ricollegare la WING. Un annullamento della vecchia sessione deve essere rifiutato. Verificare che l’app mostri i valori letti nella nuova sessione. |

Nei campi di testo, verificare che Cmd+Z modifichi il testo in corso. Il **cambio di algoritmo live** è escluso dall’annullamento: se lo si prova, predisporre un preset per ripristinare modello e parametri. Le curve EQ e Dynamics sono grafici dei parametri; **non sono un RTA audio**. Controllare separatamente i meter di ingresso e la GR gate/compressore con un segnale noto e con i dati disponibili dal firmware.

## 2. Sculpt Show sullo stesso Mac

Usare **Sculpt Show 1.0.0 RC3, build 3**, oppure una versione che esponga lo stesso contratto OSC. I preset sono documentati nella [guida OSC](OSC_SCULPT_SHOW.md); una build precedente priva del ricevitore non può rispondere.

1. In Show aprire un progetto di prova. In **File → Audio/MIDI/Video Setup → OSC Control**, attivare **Enable OSC control**, porta **53000**, quindi **Apply**.
2. In Wing aprire **OSC / Sculpt Show**, destinazione **127.0.0.1:53000**, e premere **Verifica Sculpt Show**. Controllare nome dello show, cue attive e stato audio. Questa verifica non deve far partire, fermare o selezionare cue.
3. Selezionare la cue di prova in Show. Inviare GO, pausa, ripresa e Stop All, verificando ogni effetto in Show. Provare poi una cue specifica con il suo UUID; usare il numero visualizzato della cue non è equivalente.
4. Assegnare GO a una macro libera con **Invia OSC / Sculpt Show**, oppure dalla pagina OSC con **Aggiungi alla macro**. L’assegnazione non deve inviare il comando. Eseguire la macro con WING scollegata e verificare che Show riceva il messaggio. Riaprire Wing e controllare che nome, comando e destinazione siano conservati.
5. Chiudere Show e ripetere **Verifica Sculpt Show**: deve terminare con un errore o timeout, senza dichiarare il destinatario confermato. Un normale invio UDP può comunque risultare accettato dal sistema anche con Show chiuso; non equivale all’esecuzione della cue.

Per una prova su un secondo computer, impostare l’IPv4 del Mac che esegue Show, usare la stessa porta e attivare **Allow LAN controllers** in Show. Non serve avviare un’app ponte.

In una macro mista, un parametro WING o un UUID non valido deve impedire l’avvio dell’intera sequenza. **Interrompi** ferma le azioni ancora da eseguire: non ritira messaggi già inviati. **Cmd+Z non annulla GO o altri comandi OSC.**

## 3. Esito da conservare

Per ogni anomalia annotare controllo usato, valore iniziale, valore atteso, valore letto su WING/Show e messaggio completo dell’app. Aggiungere una schermata e gli eventuali dati diagnostici della connessione. Separare i risultati della WING da quelli di Show: un trasporto funzionante non certifica automaticamente l’altro.

Segnalare anche eventuali rallentamenti con il contesto preciso: numero di strip visibili/ancorate, editor aperto, meter attivi e operazione effettuata. Il [benchmark di sviluppo](verification/benchmark-ui-results.json) è un riferimento distinto dalla prova sul Mac reale.
