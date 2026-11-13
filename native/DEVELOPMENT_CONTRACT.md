# Contratto corrente · 0.6

L’istruzione dell’utente di realizzare una versione funzionante estende il precedente prototipo monitor. La build0.5 controlla i parametri definiti dal firmware collegato, con mappature verificabili in `../dist/wing-map.js` e documentazione in `../docs/LIVE_MAPPING.md`.

Restano vincolanti: connessione locale diretta senza computer aggiuntivi durante l’uso; nessun replay dello stato demo al collegamento; tipi/range/readOnly verificati contro il banco; invalidazione delle definizioni al cambio modello; annullamento della coda al termine della sessione; distinzione esplicita fra dato ricevuto, invio e conferma. I limiti della verifica sono dichiarati in `../docs/STATO_0.5.md`.

Dal 13 novembre 2026 il trasporto è condiviso anche con le app macOS/Windows richieste dall’utente. `NativeTransport` usa il bridge iOS o il bridge desktop con lo stesso contratto; `WingClient` resta unico.
