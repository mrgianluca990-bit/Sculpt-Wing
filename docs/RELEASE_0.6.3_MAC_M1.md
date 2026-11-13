# Sculpt Wing 0.6.3 — scena da PDF con monitor modificabili

## Risultato

La versione estende il flusso **Producer → PDF → Sculpt Wing**. L’importazione propone ingressi rinominati e colorati, mute inserito, fader a −∞ e mandate monitor. L’anteprima permette di correggere ogni valore prima di applicare la scena al progetto locale.

| Proposta | Valore iniziale |
| --- | --- |
| Ingressi importati | Mute ON, fader −∞ |
| Monitor principale dello strumento | Mandata attiva, −5 dB PRE |
| Altri monitor assegnati | Mandate attive, −8 dB POST |
| Segue mute | ON |
| Ingressi rimanenti | Conservati |

Le tre schede **Canali**, **Mandate** e **Rimanenti** espongono destinazioni, nomi, colori, mute, fader, bus principali e singole mandate. Si possono aggiungere o rimuovere monitor, scegliere i BUS e applicarne facoltativamente nome e colore. I valori iniziali restano proposte modificabili.

La scelta sui rimanenti è esplicita: **Lascia come sono** oppure **Inizializza nome, colore, mute e fader**, con eccezioni e correzioni per ogni canale. L’inizializzazione limitata a quei quattro campi conserva processing e mandate esistenti.

## Compatibilità con Producer

È stato esaminato l’esportatore di Sculpt Production al commit `e69d65b7a5bf1e4aa063f6d3c90b7fde6537568a`, senza modificare o ripubblicare Producer. Il parser riconosce le intestazioni effettive, tra cui **DI / Mic** e **USCITE AUX**, e ricompone i nomi su più righe. Il documento completo conserva separati stage plot, channel list, uscite e preventivo.

Sono riconosciuti i nomi multicanale usati da Producer: i componenti della batteria, le coppie L/R e le diciture come `Key L · Tastiere Nord`. Chitarre e voci diverse restano distinte. La stampa desktop dello stage plot è gestita anche quando la tabella ingressi non ha il titolo INGRESSI.

Il PDF attuale non contiene gli identificativi degli strumenti o l’associazione esplicita ingresso-monitor. Gli abbinamenti derivano quindi dai nomi e restano da rivedere. Quando l’associazione non è univoca, l’applicazione attende una scelta nell’anteprima. Una coppia di uscite L/R con lo stesso nome viene proposta come un solo monitor logico; i numeri AUX del PDF non diventano un nuovo patch WING.

## Routing e stato conservato

L’importatore usa una lista esplicita di campi modificabili e conserva l’intero routing: sorgenti e sorgenti alternative, patch delle uscite, insert, punti PRE condivisi e relativi parametri. Restano conservati preamplificatori, phantom, processing, invii MAIN/MTX, invii ai BUS non assegnati e altri parametri delle mandate, tra cui il pan. Fader e mute dei BUS non vengono inizializzati.

Se un CH ha il punto condiviso PRE già impostato su AFL/POST, l’anteprima segnala che una mandata nominalmente PRE seguirebbe il fader. La proposta non viene applicata finché il conflitto non viene risolto; il punto di prelievo non viene riscritto automaticamente.

L’importazione e l’annullamento operano soltanto nel progetto offline. Il risultato può essere salvato nel formato Sculpt; la funzione non genera uno snapshot WING né applica automaticamente una scena al banco.

## Applicazione e annullamento

Tutte le proposte vengono validate prima di un’unica transazione. Duplicati, monitor mancanti, valori fuori intervallo e passaggio a una sessione live impediscono una scrittura parziale.

L’annullamento ripristina soltanto i campi effettivamente modificati. Un cambiamento successivo su un campo interessato blocca l’intero annullamento, mentre le modifiche a campi diversi vengono conservate. Il ripristino gestisce anche le mandate che prima dell’importazione non avevano una voce esplicita salvata.

## Verifiche funzionali

Le prove mirate esercitano il motore scena e l’anteprima con il modello e il controller reali: preparazione senza modifiche premature, valori predefiniti, correzione di tutti i campi, bus condivisi, cambio dei BUS, eccezioni sui rimanenti, conservazione del routing, persistenza, annullamento e conflitti, blocco live e cancellazione delle letture PDF obsolete.

Due fixture sono state generate dall’esportatore Producer reale con dati sintetici: una channel list su due pagine e un documento completo su quattro pagine. I test usano il reader e il worker distribuiti nell’app, adattando soltanto il trasporto Worker per l’ambiente di test. Verificano 21 nomi completi, colonne separate, quattro monitor logici da cinque righe AUX, assegnazioni mancanti da correggere, una scelta esplicita di BUS 10, 84 mandate e conservazione del routing anche dopo salvataggio e rilettura.

Verifica completata il 13 novembre 2026 nell’ambiente Linux con Node 24.22.1:

| Controllo | Esito |
| --- | --- |
| Suite protocollo/app nativa | 99 test superati |
| Suite web, parser, motore e interfaccia | 156 test superati |
| Suite trasporto desktop e policy PDF | 18 test superati |
| Totale suite automatiche | **273 test superati** |
| Rendering editor | 456 render su 76 strip |
| TypeScript e bundle nativo/lettore PDF | Build riuscita |
| Preparazione pacchetto desktop | Riuscita |
| Risorse pagina e cache offline | 38 riferimenti e 41 risorse presenti |
| Coerenza bundle | Parser, motore, anteprima, CSS, reader e worker identici in dist, native/dist e desktop/app |
| Versioni e lockfile | 0.6.3 coerente; cache offline v14 |
| Controllo whitespace | git diff --check superato |

Dopo l’ultima correzione visiva, i sei test dell’anteprima sono stati rieseguiti con esito positivo e i bundle sono stati rigenerati. I canali rimanenti esclusi dall’inizializzazione mostrano ora i valori effettivi del progetto; riattivando la casella ricompare la proposta già modificata.

La verifica nel browser ha usato lo stesso frontend desktop, con la policy che vieta connessioni al renderer e consente soltanto il worker locale. Il PDF reale generato dall’esportatore Producer ha prodotto 21 ingressi e quattro monitor. Sono stati modificati nomi, bus, fader e singole mandate, quindi applicati 21 ingressi, 84 mandate e 26 inizializzazioni dei rimanenti, con un canale escluso. L’annullamento ha funzionato; la successiva applicazione è rimasta dopo la riapertura. SOF ha mostrato le mandate a −8 dB, mentre il mixer ha mostrato mute e fader −∞ degli ingressi importati. I fader dei BUS presenti nel Custom Layer sono rimasti ai valori precedenti. Nessun errore dell’app o della policy nel browser.

Anteprime verificate: [Canali](images/channel-list-canali-0.6.3.jpg) e [Mandate](images/channel-list-mandate-0.6.3.jpg).


## Continuità e limiti

La versione conserva le superfici dei processori della 0.6.2 e le correzioni precedenti a scorrimento orizzontale, fader dalla sola testa, mandate verticali e Custom Layer a due righe. Le macro restano fuori da questa modifica. La palette richiesta rimane batteria rosso, basso verde, chitarre blu, tastiere bianco, voci rosa, fiati giallo e archi arancio; anche il clarinetto basso riceve il colore dei fiati.

I PDF devono avere testo selezionabile. L’OCR per le scansioni resta escluso; impaginazioni o abbreviazioni ambigue richiedono una correzione nell’anteprima. I PDF di prova sono stati prodotti dall’esportatore effettivo con dati sintetici; non sostituiscono il controllo del documento dell’utente.

L’utente ha confermato il funzionamento della versione 0.6.2. Per la 0.6.3 la compilazione e il collaudo del binario Mac M1 rimangono separati dalle prove del codice nell’ambiente di sviluppo. La connessione a una WING fisica non viene dichiarata collaudata da questo rilascio.

## Pacchetto e GitHub

Il pacchetto contiene sorgenti aggiornati per il repository `mrgianluca990-bit/Sculpt-Wing`. La base 0.6.2 consegnata è stata confrontata con il caricamento su `main`, commit `70b4c8265a60c90e908a540de0daf49323988ee6`: i 42 file del confronto coincidono. Il pacchetto conserva le modifiche precedenti.

Il workflow **Build Sculpt Wing - Mac M1** mantiene il solo target Mac Apple Silicon arm64/M1. Dopo i controlli dell’interfaccia e del trasporto, crea lo ZIP dell’app e verifica architettura e firma ad hoc. L’archivio sorgenti consegnato è destinato al caricamento su GitHub; l’app compilata verrà prodotta dal workflow.

L’accesso GitHub disponibile aveva restituito 403 alla scrittura. Questa consegna non aggiorna automaticamente il repository. I passaggi di caricamento, attesa della build e sostituzione dell’app sono in [LEGGIMI.txt](../LEGGIMI.txt).

Guida completa: [Importare una channel list](CHANNEL_LIST_IMPORT.md).
