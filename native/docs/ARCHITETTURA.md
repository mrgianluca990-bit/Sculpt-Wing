# Architettura e integrazione Sculpt

## Collegamento diretto dal tablet

L’interfaccia React è compilata e incorporata nel bundle iOS. Capacitor la ospita nella WebView e registra il plugin locale `WingSocket`. Quel plugin usa Network.framework per aprire un flusso TCP verso la WING e i socket UDP necessari all’identità e ai meter. La connessione al mixer non passa dal browser del tablet né da un servizio cloud.

Il router trasporta i pacchetti tra Wi-Fi ed Ethernet. Il Mac serve per costruire e installare l’app; dopo l’installazione non fa parte della catena di controllo. Non vengono trasmessi campioni audio attraverso l’app: i meter e i parametri sono dati di controllo. L’elaborazione audio rimane nella WING.

## Confini del software

`WingTransport` trasferisce byte, senza conoscere fader o bus. `WingClient` conosce il protocollo e restituisce parametri e meter attraverso `WingDriver`. `ControlStore` applica le regole della sessione e espone lo stato all’interfaccia. `DemoDriver` implementa lo stesso contratto con memoria locale, senza costruire un trasporto reale.

Il controller legge 8 canali e un bus per vista. Le definizioni dei nodi vengono scoperte alla connessione e mantenute nella cache della sola sessione. Gli hash di un mixer o firmware precedente non vengono riutilizzati su una nuova connessione.

I colori usano gli ID WING 1–18 con una palette locale coerente con i nomi; non promettono una corrispondenza RGB calibrata con il display del mixer. La numerazione è stata verificata nella funzione `GetColorDropdown` del [modulo WING di Bitfocus](https://github.com/bitfocus/companion-module-behringer-wing/blob/main/src/choices/common.ts).

Le operazioni di controllo sono serializzate: il terminatore nativo WING non fornisce un identificativo di richiesta. Una richiesta scaduta invalida la sessione, così una risposta tardiva non può essere scambiata per la conferma di una richiesta successiva.

## Scritture e verità dei valori

Il livello mostrato dopo un comando deriva dalla risposta del mixer. Il driver esegue la scrittura e una rilettura fresca; il successo del solo invio del pacchetto non equivale a una conferma della console. L’interfaccia mantiene un’anteprima locale soltanto durante il gesto sul fader.

Le scritture ammesse sono:

- `/ch/{1..40}/send/{1..16}/lvl`
- `/ch/{1..40}/send/{1..16}/on`
- `/bus/{1..16}/fdr`

Il controllo avviene nel controller e nel driver. Un parametro non letto resta sconosciuto e non viene sostituito con zero o un valore salvato. La console resta la fonte dello stato corrente; l’unica preferenza persistita è l’ultimo IP inserito.

La disconnessione elimina richieste, sottoscrizioni e valori conosciuti. Il passaggio in background chiude la sessione nativa. Un nuovo collegamento richiede una nuova lettura e un nuovo consenso alle modifiche. Ogni callback e invio porta l’identità della sessione: un risultato tardivo viene scartato. Le disconnessioni native sono associate a `requestId` e/o `sessionId` per evitare che la chiusura di una vecchia istanza interrompa quella nuova.

## Il punto d’integrazione con le altre app Sculpt

Questa release non dichiara integrazioni esistenti e non modifica progetti delle altre app. Il punto da riutilizzare è il controller, non l’interfaccia grafica: un’azione futura deve identificare esplicitamente console, canale e bus e passare attraverso le stesse regole di sessione e conferma.

Prima di aggiungere automazioni occorre definire, usando i formati reali delle altre app Sculpt:

1. Come un progetto associa un musicista ai canali e al suo bus monitor.
2. Quale app possiede il trasporto mentre viene eseguita l’azione.
3. Quali azioni sono relative al valore attuale e quali richiamano un valore assoluto.
4. Come visualizzare e annullare una sequenza, e come gestire una modifica manuale sulla console.
5. Quale comportamento è atteso se l’iPad va in background.

Per questa versione non c’è un’API HTTP o WebSocket in ascolto sul tablet, un canale tra due browser, un’importazione di show né un motore di cue nascosto dietro la demo. Si tratta della base di trasporto e controllo da validare prima di scegliere il comportamento delle automazioni.

## Scelte della prima versione

| Scelta | Motivo e limite |
|---|---|
| iPad con Capacitor e plugin Swift locale | Interfaccia riutilizzabile e accesso ai socket nativi nello stesso dispositivo |
| IP manuale | Porta rapidamente alla verifica del collegamento senza introdurre discovery/multicast |
| TCP nativo WING | Stato bidirezionale e richieste serializzate sul collegamento aperto |
| UDP per i meter | Rispetta il canale previsto dal protocollo WING |
| Scrittura al rilascio | Una variazione conclusa per gesto, con conferma leggibile; i movimenti continui richiedono un’evoluzione successiva |
| 8 canali per vista | Interfaccia touch e carico di lettura limitati per la prima prova |
| Riconnessione esplicita | Nessuna riattivazione implicita del controllo al rientro nell’app |

Riferimenti tecnici: [protocollo WING dell’autore](https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md), [Network.framework](https://developer.apple.com/documentation/network), [plugin Capacitor](https://capacitorjs.com/docs/plugins/creating-plugins).
