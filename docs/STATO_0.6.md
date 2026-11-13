# Stato reale di Sculpt Wing 0.6

## Novità

Le mandate nell’editor canale sono fader verticali affiancati. La banca scorre in orizzontale quando lo spazio non basta; ogni mandata mantiene livello in dB, accensione e punto di prelievo. Pan e impostazioni aggiuntive restano disponibili nei dettagli. Questa modifica vale anche per l’interfaccia su telefono.

Il pulsante **Rinomina** nell’intestazione dell’editor apre **Canale → Identità → Nome**, mette a fuoco il campo e seleziona il nome corrente. Il campo rispetta il percorso effettivo del nome dichiarato dal mixer, le sorgenti condivise, la modalità di sola lettura e i limiti del firmware. Per modificare una WING collegata occorre abilitare **Controllo**.

## App per macOS e Windows

La cartella `desktop/` contiene un’app Electron con la stessa interfaccia e lo stesso driver di protocollo della versione iPhone/iPad. Il processo principale gestisce direttamente TCP e UDP verso l’IPv4 locale della WING. L’interfaccia comunica attraverso un bridge ristretto e non dispone di accesso generale a Node o al sistema operativo.

La prima distribuzione utilizza tre ZIP: macOS Apple Silicon (`arm64`), macOS Intel (`x64`) e Windows `x64`. I bundle Mac dichiarano macOS 13 Ventura o successivo come requisito minimo. Su Mac si estrae l’app e la si sposta in Applicazioni. Su Windows si estrae l’intera cartella e si avvia `Sculpt Wing.exe`, mantenendo accanto i file inclusi. I pacchetti includono l’interfaccia locale; per l’uso non servono Node, un browser o un server separato. Computer e mixer devono trovarsi sulla stessa rete locale. Le istruzioni di uso, compilazione e firma sono in [desktop/README.md](../desktop/README.md).

Il trasporto isola le sessioni, scarta i pacchetti UDP provenienti da indirizzi diversi dal mixer, limita code e dimensioni dei messaggi e gestisce annullamento, timeout e sospensione. Dopo sospensione del computer, blocco dello schermo o ricaricamento della finestra serve una nuova connessione. Le modifiche fatte nella demo non vengono riprodotte sul banco alla connessione.

## Verifiche eseguite

| Area | Evidenza |
| --- | --- |
| Driver condiviso e protocollo | 99 test Vitest superati, inclusi bridge desktop, fallback browser e isolamento delle sessioni |
| Interfaccia web | 84 test Node superati |
| Editor | 456 rendering delle pagine per 76 strip; verificati fader verticali, rinomina, sola lettura e caricamento asincrono del nome |
| Compilazione | Controllo TypeScript e generazione del bundle condiviso completati |
| Layout e interazioni | Prova nel browser a larghezza desktop e a 393 px; modifica del livello, accesso a Rinomina, selezione e aggiornamento del nome |
| Trasporto desktop | 13 test superati, inclusi socket TCP/UDP reali di loopback su Linux, timeout, cancellazioni, code e rifiuto dei pacchetti estranei |
| Shell desktop | Test automatici per il confine IPC, il preload e il ciclo di vita, compresa la riapertura della finestra su macOS |

I test con socket locali verificano il software di trasporto. Non costituiscono un collaudo di una WING fisica o dei pacchetti su macOS e Windows.

## Limiti del rilascio

- I primi pacchetti desktop sono build di prova **non firmate e non notarizzate**. I sistemi operativi possono richiedere una conferma o impedirne l’apertura secondo le proprie impostazioni di sicurezza.
- L’avvio e l’installazione su computer macOS e Windows reali restano da verificare; l’ambiente di produzione dei pacchetti è Linux.
- L’installer Windows NSIS non è stato prodotto: nel runner Linux manca Wine. Il pacchetto ZIP include l’applicazione completa; la configurazione dell’installer resta disponibile per una successiva compilazione su Windows.
- Non è stata disponibile una WING fisica per provare il collegamento, il comportamento con il firmware installato e la latenza sulla rete del banco.
- La versione iOS mantiene il proprio progetto e bundle; questa modifica non produce un IPA firmato né sostituisce una compilazione Xcode.
- Le limitazioni funzionali già documentate nello [stato 0.5](STATO_0.5.md) restano valide quando non esplicitamente aggiornate qui, inclusi RTA, alcuni meter e gestione dei file del mixer.

Prima di utilizzare il controllo durante uno spettacolo, completare la prova su ciascun computer e sulla WING di destinazione: connessione iniziale in sola lettura, lettura del nome e dei meter, attivazione di Controllo, modifica di una mandata di prova e riconnessione dopo sospensione.
