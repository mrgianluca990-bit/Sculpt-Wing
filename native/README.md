# Sculpt Wing iOS 0.6

Progetto iOS conservato dalla distribuzione precedente. L’interfaccia condivisa
e il driver seguono ora la 0.7.1 destinata al Mac; i metadati del target Xcode
restano quelli della precedente consegna e non indicano una nuova release iOS
compilata o collaudata. Per la consegna corrente: [guida Mac 0.7.1](../docs/RELEASE_0.7.1_MAC_M1.md).

Il progetto iPhone/iPad include la stessa interfaccia completa del sito, più il trasporto WING nativo TCP/UDP.

Questo è il progetto sorgente. La cartella web incorporata e le configurazioni iOS generate non sono incluse nel checkout GitHub: vanno preparate prima di aprire Xcode. Servono macOS, Xcode 26+, Node.js 22+ e npm; target iOS/iPadOS 15.4+.

## Prima apertura dal checkout

Dalla radice del repository:

```sh
cd native
npm ci
npm run ios:sync
./APRI_SU_MAC.command
```

In alternativa, apri `AGGIORNA_INTERFACCIA.command` sul Mac: installa le dipendenze, esegue i test del driver e sincronizza il progetto iOS. Poi apri `APRI_SU_MAC.command`. Quest’ultimo controlla che esistano `ios/App/App/public/index.html`, `capacitor.config.json` e `config.xml` prima di aprire Xcode.

`ios:sync` ricostruisce il bundle e lascia a Capacitor la generazione delle configurazioni necessarie. Non creare `config.xml` a mano. Seleziona il tuo Team e il dispositivo nel target **App** di Xcode, quindi premi **Run**. La prima installazione delle dipendenze e la risoluzione dei pacchetti Swift richiedono accesso a Internet.

**Non è un IPA firmato.** La compilazione Apple e il test sul mixer fisico non sono stati eseguiti nell’ambiente Linux.

## Sorgenti e build

L’entrypoint distribuito è `src/live-entry.ts`; importa `WingClient` e il plugin nativo. L’interfaccia vive nella cartella `../dist`. Il vecchio `src/App.tsx` è un prototipo mantenuto per i test legacy e non viene caricato dalla build corrente.

Dalla cartella `native`, per verificare e aggiornare il progetto:

```sh
npm ci
npm run test:all
npm run ios:sync
```

`npm run build` ricostruisce `../dist/native-bridge.js` e copia il web completo sia in `dist` sia in `ios/App/App/public`. Per preparare un checkout fresco per Xcode usa `npm run ios:sync`, che esegue anche i passaggi Capacitor e genera `config.xml`. I file generati restano esclusi da Git. L’archivio completo mantiene questa struttura di cartelle; per ricostruire non estrarre la sola cartella `native`.

Guide: `../docs/INSTALLAZIONE_0.5.md`, `../docs/STATO_0.5.md`, `docs/API-LIVE-0.5.md`.
