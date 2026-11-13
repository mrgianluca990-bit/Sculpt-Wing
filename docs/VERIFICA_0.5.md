> Documento storico. Per preparare i sorgenti di questo repository prima di aprire Xcode, seguire la [guida iOS aggiornata](../native/README.md): `npm ci` e `npm run ios:sync` nella cartella `native`.

# Verifica della consegna Sculpt Wing 0.5

Data: 13 novembre 2026. Ambiente di build: Linux, Node 24. L’interfaccia distribuita è quella in `dist/`, incorporata anche nel progetto iOS.

## Risultati automatici

| Verifica | Esito |
| --- | --- |
| `npm test` da `native/` | **96 test superati, 7 suite** |
| Test web Node/JSDOM | **84 test superati, 0 falliti** |
| Editor integrato | **456 rendering di pagine su 76 strip** |
| TypeScript e bundle `npm run build` | **Superati** |
| Superfici dei processori | Tutte le **109 definizioni** renderizzate, con ogni parametro raggiungibile una sola volta |

Le 180 verifiche automatiche includono codec con byte di riferimento, metadata dinamici, invalidazione dopo cambio modello, enum numerici, conferma/rifiuto delle scritture, coalescing dei fader, meter stereo, lifecycle e annullamento dei comandi. L’integrazione usa `app.js`, il modello e la GUI effettivi, con un driver simulato al confine del trasporto nativo.

Il test con l’app reale verifica connessione iniziale in lettura, assenza di invio del progetto demo, fader e readback, rollback di una scrittura fallita, cambio modello e parametro VSS3, assegnazione insert, rifiuto atomico di azioni miste, errore e retry delle letture dell’editor, aggiornamento remoto del preamp, disconnessione/background e ritorno alla demo.

Il test delle macro verifica letture preventive, attesa dell’esito delle scritture, interruzione su errore e trasporto REC/STOP. Il test dei recorder verifica i comandi documentati e la rilettura dello stato; non considera tale rilettura un ACK di completamento dell’azione.

## Verifica visiva e interattiva

Prove eseguite in Chrome remoto con la build web, attraverso un contenitore che espone viewport da telefono/tablet:

- **393 × 852 e 375 × 667:** rack FX e VSS3 accessibili, finestre contenute nella larghezza e scorrimento verticale interno.
- **844 × 390:** due file di fader e barra macro visibili; finestra del plugin entro il viewport.
- **1024 × 768:** mixer senza overflow della pagina; sezioni VSS3 su più colonne e controlli raggiungibili.
- Modifica Decay **2,8 → 3,4 s**, chiusura e riapertura: valore mantenuto.
- Cambio di modello **VSS3 → Graphic EQ**: pannello e controlli sostituiti correttamente.
- Pagina Connessione nel browser: pulsanti di connessione/controllo disabilitati e spiegazione dell’app nativa visibile.
- Corretto il wrapping delle scelte enum per non spezzare le parole nei pulsanti stretti.

Queste prove verificano layout e interazione DOM in Chrome. Non sostituiscono una prova multitouch o WebKit su iPhone/iPad reali.

## Bundle iOS e riproducibilità

`native/scripts/build-live.mjs` genera il bridge nativo e copia gli asset web in `native/dist` e `native/ios/App/App/public`. L’archivio di consegna include questi asset già generati, il progetto Xcode, il plugin Swift e l’icona rossa. Il target supporta le famiglie dispositivo iPhone e iPad; la dipendenza Swift Capacitor è fissata a 8.6.2.

Il file `sculpt-05-tests.log`, incluso in questa cartella, conserva l’output della verifica automatica finale. Per ripeterla: `cd native`, `npm ci`, `npm run test:all`, `npm run build`.

## Non verificato in questo ambiente

- Compilazione Swift e linking con SDK Apple/Xcode.
- Firma e installazione su un dispositivo iOS.
- Connessione a una WING fisica, corrispondenza dei meter, latenza Wi-Fi e precisione del riscontro dei fader.
- Comportamento completo di ogni firmware o variante di hardware WING.

L’archivio è un progetto sorgente pronto per Xcode, **non un IPA firmato né una release collaudata sul banco**. Il prossimo collaudo concreto è descritto in `INSTALLAZIONE_0.5.md`. La copertura funzionale e gli elementi ancora mancanti sono elencati in `STATO_0.5.md`.
