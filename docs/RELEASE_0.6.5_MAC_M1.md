# Sculpt Wing 0.6.5 — mixer personalizzabile, manopole, DCA e meter GR

## Modifiche richieste

| Area | Comportamento |
| --- | --- |
| Editor del canale | Manopole per i valori numerici, con regolazione trascinando, tastiera e campo preciso. Gain, trim e balance sono affiancati; moduli orizzontali e controlli del processore accanto al pannello originale. Anche le scelte numeriche come Ratio hanno una manopola a scatti. |
| DCA | Pulsante **DCA** nella navigazione superiore: 16 master con fader, mute, solo e accesso a nome e membri dalla strip. I gruppi sono quelli già presenti nel progetto. |
| Anteprima channel list | Conserva posizione verticale e orizzontale durante l’assegnazione; ogni scheda ricorda il proprio scorrimento. |
| Applica scena | Chiude la finestra dopo un esito positivo; in caso di errore rimane aperta. Riaprendo Importa channel list si può annullare l’ultima importazione della sessione. |
| Monitor | Ordine numerico crescente dei BUS nelle schede, nei menu e nelle righe delle mandate; il monitor nuovo propone il primo BUS libero. |
| Doppio clic sul fader | Porta il valore visualizzato a 0 dB. In SOF modifica la mandata; nei DCA modifica il master del gruppo. Il singolo clic non sposta il fader e il trascinamento resta dalla testa. |
| Meter | Le strip CH/AUX mostrano il segnale di ingresso, indipendente da fader, mute, SOF e posizione nel Custom Layer. Due piccole barre G/C mostrano la GR di gate e compressore. |
| Altezza delle righe | Divisore trascinabile con percentuali, limiti minimi e regolazione da tastiera. Doppio clic o Invio ripristina 50/50. |
| Canali ancorati | Pulsante a forma di puntina nella strip: sinistra, destra, libera, sposta prima/dopo. Più canali restano visibili ai bordi mentre il centro scorre. |
| Colore | Sfumatura molto tenue del colore assegnato su tutta la strip, anche nei canali ancorati. |
| Nome vuoto | Cancellando il nome e confermando, torna il nome standard della destinazione: CH 1, AUX 1, BUS 1, MTX 1 o MAIN 1. |

La distribuzione resta per **Mac M1 / Apple Silicon ARM64**. Questo pacchetto aggiorna i sorgenti della 0.6.4 nel repository esistente.

## Interazione e disposizione

L’editor continua ad aprirsi nella riga opposta a quella del canale. Quando si cambia l’altezza delle due righe, il pannello segue lo spazio della riga che lo ospita. La riga sorgente rimane utilizzabile. Nei modelli con molti parametri, i controlli hanno scorrimento locale.

Le manopole condividono gli stessi valori dei campi numerici e delle superfici dei processori. Maiusc durante il trascinamento permette la regolazione fine. Le mandate conservano i fader verticali, affiancati dalla manopola del livello. I nomi, le scelte non numeriche e gli interruttori mantengono il loro controllo specifico.

Il divisore centrale supporta frecce su/giù, Maiusc per passi più ampi, Page Up/Down e Home/End. Le proporzioni rispettano un’altezza minima per entrambe le sezioni. Ridurre la finestra può limitare temporaneamente la proporzione visualizzata, senza perdere la preferenza scelta.

Gli ancoraggi spostano gli elementi originali delle strip in fasce laterali della stessa riga: non creano copie di fader o di stato audio. I canali possono essere fissati su entrambi i lati e riordinati nel proprio lato. Se sono numerosi, le fasce laterali scorrono indipendentemente e conservano spazio per il centro. Un canale escluso dal Custom Layer resta nascosto, pur conservando la preferenza; quando cambia riga, l’ancoraggio lo segue.

Il banco DCA nasconde temporaneamente le fasce ancorate della riga superiore e le ripristina all’uscita. Gli ingressi ancorati in basso restano disponibili. I master DCA non hanno un ancoraggio proprio in questa versione.

Proporzioni e ancoraggi sono salvati come preferenze locali dell’interfaccia, anche quando la persistenza dei dati del mixer live è disabilitata. Non alterano audio, mandate, patch o routing.

## DCA e dati live

Il banco DCA legge gli stessi gruppi usati da editor, macro e pagina DCA / Mute Groups. La regolazione del DCA non riscrive i singoli fader dei membri. Le assegnazioni restano gestite attraverso i tag del protocollo esistente.

I controlli live richiedono connessione, valore e schema effettivamente letti, oltre all’abilitazione delle scritture. Le assegnazioni non ancora ricevute sono indicate come sconosciute. La finestra nome/membri segue i cambiamenti del banco e disabilita le azioni in disconnessione; una lettura vecchia non può sovrascrivere lo stato di una nuova sessione.

I nuovi meter GR leggono le parole Gate gain e Dyn gain del report standard già sottoscritto. Sono barre relative alla scala del modello. Il valore in dB viene esposto soltanto quando la scala è documentata e il modello è stato letto dal banco; non viene assunto un fattore unico per tutti i processori. I dati scaduti, assenti o appartenenti alla sessione precedente vengono eliminati. Dettagli, API e fonti in [Meter GR](METER_GAIN_REDUCTION.md).

La modalità demo rimane chiaramente etichettata e usa animazioni dimostrative. Le prove di protocollo non sostituiscono il collaudo con una WING fisica.

## Importazione e routing

Sono conservati i gruppi di strumenti, i due principali facoltativi, l’aggiunta di canali vuoti e tutti i valori modificabili dell’anteprima. I canali importati partono in mute con fader a −∞; ciascuna principale parte a −5 dB PRE e le altre mandate monitor a −8 dB POST. I rimanenti restano invariati salvo scelta esplicita dell’inizializzazione limitata.

L’importazione continua a conservare routing, preamplificatori, phantom, insert, processing, punti PRE condivisi e invii non inclusi nella proposta. Applica e Annulla restano operazioni sul progetto offline. La chiusura automatica non elimina l’annullamento della sessione: si ritrova riaprendo l’importatore. Un riavvio dell’app non conserva quel token.

Guida completa: [Channel list da Producer](CHANNEL_LIST_IMPORT.md).

## Verifiche

Verifiche nell’ambiente Linux con Node 24.22.1:

| Verifica | Esito |
| --- | --- |
| Suite protocollo e app nativa | 100 test superati |
| Suite modello, importazione e interfaccia web | 220 test superati |
| Suite desktop, socket e policy PDF | 18 test superati |
| Totale | **338 test superati**, nessun fallimento |
| Rendering editor | 456 render sulle 76 strip |
| TypeScript, bridge nativo e PDF reader | Build riuscita |
| Preparazione app desktop | Riuscita |
| 19 asset modificati nei bundle dist, native/dist e desktop/app | Hash identici |
| Package e lockfile | Versione 0.6.5 coerente |
| Cache offline | v17, comprendente i nuovi moduli |
| Controllo whitespace | Superato |

Le prove includono pacchetti meter binari, dati scaduti e riconnessione, blocchi live, gruppi DCA non idratati, controlli sincronizzati, gesti delle manopole, scelta Ratio, fader in SOF, nomi vuoti e sorgenti condivise, ridimensionamento, preferenze salvate, ancoraggi e conservazione del routing.

### Prova interattiva del frontend desktop

Il bundle preparato per il desktop è stato aperto nel browser e verificato tramite i controlli dell’app:

- PDF Producer di prova: 21 ingressi e quattro monitor. Assegnando il principale del nono strumento, la tabella è rimasta a **scrollTop 2665**, senza tornare all’inizio. Il ritorno alla scheda Canali ha mantenuto la stessa posizione.
- Spostando il monitor iniziale da BUS 1 a BUS 10, schede e menu sono diventati **BUS 2, 3, 4, 10**. Applicazione di 21 ingressi e 84 mandate, chiusura automatica, riapertura e annullamento riusciti.
- Doppio clic sul fader CH 1 e sulla sua mandata in SOF: 0 dB sul controllo visualizzato. Fader DCA 2 regolato da tastiera e riportato a 0 con doppio clic; nome e membri del DCA 4 modificati dal nuovo banco.
- Divisore trascinato da 50/50 a **63/37**, con altezze misurate di 546,5 e 326,5 pixel. L’editor ha seguito l’altezza della riga superiore. Doppio clic ripristinato a 50/50.
- CH 1 e CH 2 ancorati a sinistra, CH 9 a destra e MAIN 1 in alto a destra. Portando il centro al banco 17–24, gli ingressi ancorati hanno conservato la propria posizione mentre il centro è arrivato a **scrollLeft 1040**. Liberazione e successivo nuovo ancoraggio di CH 2 riusciti.
- In modalità DCA, fascia superiore nascosta e fasce degli ingressi mantenute; uscita dal banco DCA e ripristino della fascia MAIN riusciti.
- Nuova proporzione **45/55** e ancoraggi conservati dopo ricaricamento. Cancellazione del nome di CH 1 con Invio e del nome di MAIN 1 uscendo dal campo: nomi standard applicati e mostrati anche nelle strip ancorate.
- Compressore standard con manopole numeriche visibili accanto al pannello originale. Manopola Ratio azionata da tastiera da 1.1 a 1.2. Sfumature, G/C e due righe controllati nella stessa vista.

Immagini della verifica: [mixer personalizzato](images/mixer-personalizzato-0.6.5.jpg) e [editor con manopole](images/editor-manopole-0.6.5.jpg).

Queste prove riguardano il frontend e il protocollo simulato in test. Non attestano una compilazione della nuova app su macOS né una misura audio su WING fisica.

## Caricamento e app Mac M1

L’aggiornamento parte dalla 0.6.4 osservata su GitHub al commit `d376463b87ba9389f39f33aa1600e23656e21a6b`. Conserva il workflow M1 già corretto: compilazione su runner Mac Intel, target esplicito ARM64, verifica dell’eseguibile e della firma ad hoc.

Estrarre `Sculpt-Wing-0.6.5-Aggiornamento-Mac-M1.zip` e caricarne i file nel repository mantenendo i percorsi. La copia del workflow è inclusa; non occorre sostituirlo separatamente se quello del repository è già corretto. Dopo il commit su main, **Build Sculpt Wing - Mac M1** deve produrre l’artifact **Sculpt-Wing-Mac-M1**, con `Sculpt-Wing-0.6.5-mac-arm64.zip` e l’app.

Questa consegna non ha caricato i file sul repository né generato il nuovo binario su macOS. L’accesso disponibile non autorizza le scritture GitHub, già rifiutate con 403. La build del frontend nell’ambiente Linux, i test automatici e la verifica nel browser sono separati dalla compilazione Mac, dall’avvio sul Mac M1 e dal collaudo del banco.

Istruzioni operative: [LEGGIMI.txt](../LEGGIMI.txt).
