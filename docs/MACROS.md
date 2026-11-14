# Macro Sculpt Wing — 16 pulsanti assegnabili

La barra inferiore contiene **M1–M16**. Le otto macro già presenti conservano le proprie assegnazioni; gli otto pulsanti aggiunti, **M9–M16**, partono vuoti.

## Assegnare un pulsante

Premi **Assegna** su un pulsante libero. Si apre la configurazione di quella macro: in **Cosa vuoi assegnare?** scegli il tipo e premi **Assegna azione**, poi scegli la destinazione e gli eventuali valori. Puoi darle un nome e aggiungere più azioni nella stessa sequenza.

Una macro configurata si esegue con un clic. Per modificarla, usa il tasto destro sul pulsante; da tastiera sono disponibili **F2** o **Maiusc + Invio**. La configurazione permette di riordinare o rimuovere le azioni. **Svuota pulsante** elimina nome e azioni, ripristinando **Assegna**.

## Cosa puoi assegnare

| Tipo | Esempi |
| --- | --- |
| Menu e pagine | Menu del banco, I/O, rack FX, DCA, monitor, meter, scene, recorder, setup, Custom Layer, connessione, parametri WING, OSC / Sculpt Show e importazione channel list |
| Editor di un canale | Aprire direttamente Canale, Processo, EQ, Dinamica, Mandate o Gruppi di un ingresso o di un’uscita |
| Vista del mixer | Raggiungere i DCA nella riga superiore, SOF su un BUS/MTX, ritorno ai fader normali e richiamo di un Custom Layer |
| Comandi del mixer | Fader, mute, solo, mandate, DCA, mute group, talkback, Dim, sorgente Main/Alt, attivazione FX e oscillatore |
| Parametri dei processori | Un parametro del modello scelto su una strip o su uno slot FX |
| Parametri WING | Un parametro scrivibile esposto dal firmware del mixer collegato, con tipo e limiti letti dal banco |
| Invia OSC / Sculpt Show | Preset GO, stop, pausa, ripresa, fade e navigazione; comandi per cue/lista/alias; messaggi OSC personalizzati |
| Sequenze | Più azioni, regolazioni dei livelli nel tempo, attese e comandi recorder disponibili nel profilo attivo |
| Scene Sculpt | Richiamo di una scena del progetto offline |

I menu e gli editor si aprono anche quando la connessione WING è in sola lettura: sono azioni dell’interfaccia. Per modificare parametri audio sul banco, una macro richiede il collegamento e **Controllo** attivo.

Le scene del progetto Sculpt rimangono scene offline. I comandi disponibili sul banco dipendono dalle funzioni esposte dal firmware e dai trasporti già supportati dall’app.

## Parametri del banco e dei processori

Per i processori, scegli il contesto, il modello e il parametro. La macro conserva il modello atteso: se il processore viene sostituito con un algoritmo diverso, l’esecuzione segnala l’incompatibilità.

Per un parametro WING specifico, premi **Scegli dal banco** e sfoglia la struttura del mixer collegato. **Usa nella macro** assegna il parametro scelto. La scelta legge il parametro e le sue proprietà; non lo modifica. All’esecuzione vengono controllati di nuovo disponibilità, scrivibilità, tipo, intervallo e sessione corrente. Un parametro di sola lettura o non disponibile non viene trasformato in un comando inventato.

Le macro con comandi al banco verificano l’intera sequenza prima di iniziare. Durante l’esecuzione attendono il riscontro delle scritture; una disconnessione, una modifica dello schema o un comando rifiutato interrompe la sequenza. **Interrompi** ferma le azioni ancora da eseguire.

## OSC e Sculpt Show

Scegli **Invia OSC / Sculpt Show** come tipo di azione. Il profilo **Sculpt Show** propone i comandi del ricevitore **1.0.0 RC3, build 3**, con destinazione iniziale **127.0.0.1:53000**. I comandi di una cue o lista specifica richiedono il suo **UUID**, non il numero visualizzato. Il profilo **OSC personalizzato** permette di scegliere indirizzo e argomenti interi, decimali, stringhe e booleani.

Puoi anche preparare un messaggio nella pagina **OSC / Sculpt Show** e premere **Aggiungi alla macro**. Il messaggio viene aggiunto alle azioni già presenti senza eseguirlo. Per impostazione iniziale segue la destinazione del profilo nella pagina OSC; **Destinazione specifica per questa azione** permette di usare un IP e una porta diversi.

L’app Mac invia direttamente via UDP. Non serve un’app ponte e una macro con soli messaggi OSC e navigazione non richiede la connessione alla WING. Nel browser si possono preparare le assegnazioni, ma l’invio richiede il trasporto dell’app Mac.

Le macro possono combinare messaggi OSC, comandi WING, attese e apertura di menu. La verifica preventiva comprende tutta la sequenza: un indirizzo non valido, un UUID mancante o un comando WING successivo incompatibile impediscono di iniziare. La destinazione OSC viene fissata durante questa preparazione e rimane la stessa durante l’esecuzione.

**Inviato** significa che il sistema ha accettato il datagramma UDP, non che Show abbia eseguito il comando. **Verifica Sculpt Show**, nella pagina OSC, richiede invece una risposta di stato e non avvia cue. Configurazione completa, comandi supportati e limiti sono nella [guida OSC e Sculpt Show](OSC_SCULPT_SHOW.md).

## Annullamento e azioni già eseguite

Le modifiche registrate allo stato del mixer durante una macro vengono raggruppate come operazione della macro. **Cmd+Z** e **Maiusc+Cmd+Z** restano soggetti ai controlli sui valori correnti, sul modello del processore e sulla sessione WING, oltre al riscontro delle scritture live. Il cambio di algoritmo live richiede un preset per essere ripristinato.

Questo raggruppamento non rende reversibili tutte le azioni della sequenza. I messaggi OSC già inviati non si possono ritirare e **Cmd+Z non invia comandi inversi a Show**. Anche **Interrompi** riguarda solo le azioni ancora da eseguire: non equivale a Stop All nel destinatario. Nei campi di testo le scorciatoie di annullamento restano dedicate alla modifica del testo.

## Salvataggio

I nomi e le assegnazioni si salvano automaticamente come configurazione locale; il nome viene conservato anche mentre lo si scrive. Rimangono disponibili dopo il riavvio e possono essere modificati durante la connessione WING senza salvare i valori audio live nel progetto demo. I progetti completi esportati conservano anche le definizioni delle macro.

L’importazione della channel list non modifica le macro. Le operazioni sui gruppi di strumenti e sui nomi MON/IEM rimangono separate dalla configurazione dei pulsanti.
