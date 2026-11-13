# Macro Sculpt Wing — 16 pulsanti assegnabili

La barra inferiore contiene **M1–M16**. Le otto macro già presenti conservano le proprie assegnazioni; gli otto pulsanti aggiunti, **M9–M16**, partono vuoti.

## Assegnare un pulsante

Premi **Assegna** su un pulsante libero. Si apre la configurazione di quella macro: in **Cosa vuoi assegnare?** scegli il tipo e premi **Assegna azione**, poi scegli la destinazione e gli eventuali valori. Puoi darle un nome e aggiungere più azioni nella stessa sequenza.

Una macro configurata si esegue con un clic. Per modificarla, usa il tasto destro sul pulsante; da tastiera sono disponibili **F2** o **Maiusc + Invio**. La configurazione permette di riordinare o rimuovere le azioni. **Svuota pulsante** elimina nome e azioni, ripristinando **Assegna**.

## Cosa puoi assegnare

| Tipo | Esempi |
| --- | --- |
| Menu e pagine | Menu del banco, I/O, rack FX, DCA, monitor, meter, scene, recorder, setup, Custom Layer, connessione, parametri WING e importazione channel list |
| Editor di un canale | Aprire direttamente Canale, Processo, EQ, Dinamica, Mandate o Gruppi di un ingresso o di un’uscita |
| Vista del mixer | Banco DCA, SOF su un BUS/MTX, ritorno ai fader normali e richiamo di un Custom Layer |
| Comandi del mixer | Fader, mute, solo, mandate, DCA, mute group, talkback, Dim, sorgente Main/Alt, attivazione FX e oscillatore |
| Parametri dei processori | Un parametro del modello scelto su una strip o su uno slot FX |
| Parametri WING | Un parametro scrivibile esposto dal firmware del mixer collegato, con tipo e limiti letti dal banco |
| Sequenze | Più azioni, regolazioni dei livelli nel tempo, attese e comandi recorder disponibili nel profilo attivo |
| Scene Sculpt | Richiamo di una scena del progetto offline |

I menu e gli editor si aprono anche quando la connessione WING è in sola lettura: sono azioni dell’interfaccia. Per modificare parametri audio sul banco, una macro richiede il collegamento e **Controllo** attivo.

Le scene del progetto Sculpt rimangono scene offline. I comandi disponibili sul banco dipendono dalle funzioni esposte dal firmware e dai trasporti già supportati dall’app.

## Parametri del banco e dei processori

Per i processori, scegli il contesto, il modello e il parametro. La macro conserva il modello atteso: se il processore viene sostituito con un algoritmo diverso, l’esecuzione segnala l’incompatibilità.

Per un parametro WING specifico, premi **Scegli dal banco** e sfoglia la struttura del mixer collegato. **Usa nella macro** assegna il parametro scelto. La scelta legge il parametro e le sue proprietà; non lo modifica. All’esecuzione vengono controllati di nuovo disponibilità, scrivibilità, tipo, intervallo e sessione corrente. Un parametro di sola lettura o non disponibile non viene trasformato in un comando inventato.

Le macro con comandi al banco verificano l’intera sequenza prima di iniziare. Durante l’esecuzione attendono il riscontro delle scritture; una disconnessione, una modifica dello schema o un comando rifiutato interrompe la sequenza. **Interrompi** ferma le azioni ancora da eseguire.

## Salvataggio

I nomi e le assegnazioni si salvano automaticamente come configurazione locale; il nome viene conservato anche mentre lo si scrive. Rimangono disponibili dopo il riavvio e possono essere modificati durante la connessione WING senza salvare i valori audio live nel progetto demo. I progetti completi esportati conservano anche le definizioni delle macro.

L’importazione della channel list non modifica le macro. Le operazioni sui gruppi di strumenti e sui nomi MON/IEM rimangono separate dalla configurazione dei pulsanti.
