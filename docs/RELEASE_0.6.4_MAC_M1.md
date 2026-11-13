# Sculpt Wing 0.6.4 — strumenti collegati, monitor + IEM, editor nella riga opposta

## Risultato

La versione aggiorna l’importazione della channel list e l’editor del mixer secondo le richieste dell’utente. Il target di distribuzione resta **Mac M1 / Apple Silicon ARM64**.

| Richiesta | Comportamento implementato |
| --- | --- |
| Aggiungere un canale vuoto | Pulsante disponibile anche senza PDF; propone il primo ingresso libero con nome standard modificabile, grigio, mute ON, fader −∞ e mandate monitor OFF/−∞. |
| Non assegnare obbligatoriamente un principale | Entrambi i selettori comprendono Nessuno. La scena si può applicare con zero, uno o due principali per strumento, anche senza alcun monitor nell’elenco. |
| Monitor da palco e IEM per un musicista | Due BUS principali distinti, ciascuno proposto ON a −5 dB PRE; gli altri monitor assegnati restano proposti a −8 dB POST. |
| Collegare i canali dello strumento | Una sola intestazione per gruppo; l’assegnazione dei principali aggiorna insieme tutti i membri. L’appartenenza si modifica per canale ed è possibile rendere un ingresso indipendente. |
| Correggere le singole mandate | Scelta Tutto lo strumento oppure Solo questo canale. Una modifica di gruppo cambia soltanto il parametro interessato; eventuali valori differenti vengono evidenziati. |
| Editor nella riga opposta | Apertura in alto dalla riga inferiore e in basso dalla riga superiore, secondo la posizione reale anche nel Custom Layer. La riga sorgente resta interattiva. |

Il collegamento tra strumenti riguarda le proposte dell’importazione e non crea link stereo sul banco. I nomi dei singoli canali restano indipendenti dal nome del gruppo.

## Importazione

Le coppie e gli strumenti multicanale riconosciuti dal PDF vengono presentati insieme. Sono stati migliorati anche i casi Piano numerato L/R/Buca, Drum pad numerati e chitarra DI/Mic. Coppie stereo anonime ripetute vengono separate per evitare di unire automaticamente musicisti diversi. L’utente può sempre correggere il raggruppamento nell’anteprima.

Un BUS non può essere scelto in entrambi gli slot principali dello stesso strumento. Cambiando un principale, la nuova mandata parte da −5 dB PRE; quella precedente torna a −8 dB POST se non occupa più nessuno dei due slot. Le altre mandate conservano le correzioni già effettuate. Sulle righe aggiunte come canali vuoti, la rimozione del principale ripristina invece OFF/−∞ per quel BUS.

Il canale vuoto occupa un CH/AUX libero nella proposta, senza spostare gli altri canali. Il nome iniziale segue la destinazione se è ancora quello standard. Nessun monitor viene creato automaticamente. Le destinazioni già presenti anche nelle righe escluse sono considerate occupate, per evitare sovrapposizioni involontarie quando vengono riattivate.

I canali rimanenti mantengono la scelta Lascia come sono oppure l’inizializzazione limitata a nome, colore, mute e fader, con eccezioni per canale. Restano valide la palette richiesta, la modifica di tutti i valori proposti, l’applicazione atomica e l’annullamento selettivo con controllo dei conflitti.

## Routing e limiti

L’importazione conserva sorgenti e sorgenti alternative, patch delle uscite, preamplificatori, phantom, processing, insert, ordine dei processori, punti PRE condivisi, invii MAIN/MTX e invii ai BUS esclusi dalla proposta. Fader e mute dei BUS restano conservati. L’assenza di monitor nell’anteprima conserva tutte le mandate preesistenti.

La proposta PRE attiva resta bloccata quando il punto condiviso del CH è AFL/POST: l’importatore non riscrive quel parametro. Le operazioni Applica e Annulla rimangono limitate al progetto offline. Questa funzione non produce uno snapshot nativo WING né applica automaticamente una scena al banco fisico.

## Editor del mixer

Il dialogo non modale è inserito nella riga opposta e segue il layout della finestra. Soltanto i controlli della riga coperta escono temporaneamente dall’ordine di tabulazione. La riga sorgente, la barra SOF e le macro rimangono utilizzabili.

La navigazione precedente/successivo segue l’ordine visibile della riga, anche nel Custom Layer. Escape chiude l’editor e ripristina il focus sul nome del canale; un’eventuale finestra modale sovrapposta conserva la priorità sulla tastiera. Le sei sezioni, i pannelli dei plugin e le mandate verticali restano disponibili, con scorrimento nell’area dell’editor.

## Verifiche eseguite

Verifica nell’ambiente Linux con Node 24.22.1:

| Controllo | Esito |
| --- | --- |
| Suite protocollo e app nativa | 99 test superati |
| Suite modello, importazione e interfaccia web | 173 test superati |
| Suite desktop, socket e policy PDF | 18 test superati |
| Totale | **290 test superati** |
| Rendering degli editor | 456 render su tutte le 76 strip |
| TypeScript, bridge e reader PDF | Build riuscita |
| Preparazione pacchetto desktop | Riuscita |
| Moduli modificati nei bundle dist, native/dist e desktop/app | Identici |
| Versioni e cache | 0.6.4; cache v15 |

Le nuove prove coprono principali facoltativi, due BUS distinti, propagazione ai gruppi, collegamento/separazione, modifiche individuali, canali vuoti, esaurimento delle destinazioni, riassegnazione dei BUS, applicazione/annullamento e conservazione del routing. Il reader viene esercitato anche sui PDF generati dall’esportatore Producer reale, con dati di prova.

### Prova nel browser

È stato verificato il frontend preparato per il desktop, con la sua policy locale:

- Aggiunta di un canale vuoto senza PDF, applicazione senza monitor e annullamento riusciti.
- Importazione del PDF Producer di prova: 21 ingressi, nove strumenti e quattro monitor logici.
- Aggiunta di IEM Batteria su BUS 5, assegnato come secondo principale agli otto canali del gruppo con un’unica scelta.
- Rimozione del principale dal gruppo tastiere e aggiunta di CH 22 vuoto, mantenendo l’applicazione disponibile.
- Modifica della mandata BUS 1 per gli otto canali a −4,5 dB; verifica su CH 8 e successiva eccezione individuale a −6 dB. L’anteprima mostra Valori diversi senza cancellare l’eccezione.
- Verifica del secondo principale a −5 dB PRE e degli altri monitor a −8 dB POST; tutte le cinque mandate di CH 22 restano OFF/−∞.
- Applicazione di 22 ingressi e 110 proposte di mandata, annullamento, nuova applicazione e riapertura. I valori sono rimasti salvati; l’editor del mixer mostra BUS 1 a −4,5 dB PRE e BUS 5 a −5 dB PRE.
- Nel Custom Layer, apertura del CH inferiore nell’editor superiore, cambio del canale sorgente con editor aperto, azionamento del fader e apertura di un CH superiore nell’editor inferiore. Escape ripristina il focus sulla strip.

Immagini: [mandate di gruppo e IEM](images/mandate-strumento-iem-0.6.4.jpg), [editor nella riga opposta](images/editor-riga-opposta-0.6.4.jpg).

## Consegna e compilazione Mac M1

Lo ZIP di aggiornamento contiene i soli file modificati rispetto alla 0.6.3 e una copia del workflow M1, da applicare al repository esistente conservando i percorsi e gli altri file. La guida operativa è [LEGGIMI.txt](../LEGGIMI.txt).

Il workflow corretto è già presente sul repository al commit `bd89e3dbe9a331d29aecfb6746f299ff82fee9df`. La compilazione della **0.6.3** è riuscita nel [run 43496123183](https://github.com/mrgianluca990-bit/Sculpt-Wing/actions/runs/43496123183). La 0.6.4 conserva quel workflow: runner macOS Intel, destinazione esplicita ARM64, controllo dell’architettura dell’eseguibile e della firma ad hoc.

La nuova **0.6.4 non è stata caricata o compilata su GitHub da questa consegna**. L’integrazione aveva rifiutato le scritture e il rilancio dei job con 403. Dopo il caricamento dell’aggiornamento, il workflow deve produrre l’artifact **Sculpt-Wing-Mac-M1**, contenente `Sculpt-Wing-0.6.4-mac-arm64.zip`. Il test di avvio della nuova app sul Mac M1 e il collaudo su una WING fisica rimangono distinti dalle prove eseguite qui.

Guida completa: [Importare una channel list](CHANNEL_LIST_IMPORT.md).
