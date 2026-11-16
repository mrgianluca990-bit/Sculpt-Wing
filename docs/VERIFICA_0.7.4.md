# Verifica Sculpt Wing 0.7.4

Data: 16 novembre 2026. Ambito: correzione del packaging Mac M1, misura manuale Open Sound Meter, ritocchi Compact/Extended. Le prove locali sono mirate alle parti cambiate; non è stata eseguita una nuova suite completa dell'app.

## Risultati locali

| Area | Prova | Esito |
|---|---|---|
| Interfaccia e bridge | `npm run build --prefix native`: TypeScript e bundle condiviso | Superata |
| Host desktop e shell | `desktop/tests/audio-host.test.cjs` e `shell.test.cjs`, 22 casi | Superati |
| Packaging | `desktop/tests/packaging.test.cjs`, 2 casi | Superati |
| Misura manuale UI | `tests/analysis-manual.test.cjs`, 4 casi | Superati |
| Condivisione con VST | Dispositivo bloccato durante analisi e riconnessione esplicita dopo fault, 1 caso mirato | Superato |
| Editor slot | Navigazione modulo/canale, finestre Extended, controlli EQ visibili, ritorno Compact e focus | Test mirati superati |
| Strip | Rimozione dei pulsanti, larghezza comune, ancoraggi/DCA e sospensione/ripresa SOF | Test mirati superati |
| DSP nativo | Compilazione C++17 ed esecuzione di `audio-host/Tests/AnalysisTest.cpp` | Superata |
| Integrazione host C++ | Controllo sintattico di `Main.cpp` con gli header JUCE 9.0.5 reali | Superato, senza linking né backend CoreAudio |
| JavaScript e diff | Controlli di sintassi dei file modificati e `git diff --check` | Superati |

### Errore ENOENT

I test desktop riproducono sia l'errore sincrono di spawn sia l'evento asincrono `ENOENT`: l'app segnala il motore mancante nel pacchetto e non suggerisce una riconnessione del mixer come soluzione.

I test dei nuovi hook di packaging rifiutano bundle mancante, eseguibile senza permessi, helper Intel, copia assente nel percorso finale e copia alterata. Accettano la copia integra ARM64 nella posizione usata a runtime. Usano una fixture Mach-O sintetica per verificare i controlli: **non equivalgono all'esecuzione del motore su macOS**.

### Misura manuale

Le prove jsdom verificano lettura di calibrazione con intestazioni e decimali CSV, limiti delle importazioni, associazioni CH/BUS/MAIN al patch USB già presente e invalidazione con gain cambiato. Il flusso della UI usa un host simulato con risposte esplicite per verificare taratura SPL con reference silente, importazione del profilo, compensazione del solo analizzatore, memorizzazione/esportazione e chiusura che ferma soltanto l'analisi. La modalità browser senza host resta priva di misure simulate.

La prova DSP usa campioni sintetici deterministici e controlla guadagno noto, ritardi +5 e −5 ms, conservazione del tempo originale dopo compensazione, fase, coerenza, correzione del profilo, RMS/SPL, silenzio, clipping e passaggio nella coda reale del worker. I casi negativi aggiunti comprendono rumori indipendenti a 2 e 8 medie, un tono a 1 kHz e una reference passa-basso con piccolo rumore indipendente sul microfono: non vengono presentati come delay affidabili.

Comando del test DSP:

```sh
g++ -std=c++17 -O2 -pthread -Wall -Wextra -Wpedantic \
  audio-host/Tests/AnalysisTest.cpp audio-host/Source/Analysis.cpp \
  -o /tmp/sculpt-wing-osm-analysis-test
/tmp/sculpt-wing-osm-analysis-test
```

## Limiti della verifica locale

- **Nessun binario Mac 0.7.4 compilato o avviato in questo ambiente Linux.** Il linking completo del helper non è stato eseguito: mancano CMake e gli header Linux di sviluppo richiesti. Il controllo sintattico usa gli header JUCE con backend Linux disabilitati e non certifica CoreAudio.
- Nessun mixer WING, microfono, interfaccia USB o plugin personale collegato per questa verifica.
- Il tentativo di apertura Chromium per la verifica visiva si è fermato prima del caricamento dell'app: l'ambiente ha rifiutato `socket()` con `Operation not permitted`. Sono disponibili le prove DOM, non nuove schermate o un collaudo grafico di questa versione.
- I test non certificano la precisione di una misura acustica reale, la risposta di ogni firmware WING o l'allineamento di PA e sub.

## Verifiche inserite nel workflow Mac

Il workflow aggiornato compila prima `SculptWingAudio` in ARM64, usando lo stesso requisito minimo macOS del runtime Electron installato. Verifica il DSP, il routing e il protocollo dell'host; prova anche un effetto VST3 di test. I hook confrontano il motore sorgente e la copia nel pacchetto prima della firma.

Dopo la creazione di Sculpt Wing.app, il workflow controlla architettura e firma e avvia **l'eseguibile dentro il bundle finale**. `check-audio-host.cjs` verifica stato, configurazione dell'analisi senza apertura di dispositivi, round-trip dei rack e ripristino fermo della sessione. Questi passaggi sono predisposti nei sorgenti: la nuova esecuzione GitHub deve ancora essere avviata dopo il caricamento.

## Prova minima sul Mac

1. Scarica la nuova build **0.7.4** e sostituisci l'app precedente. Senza mixer, apri Audio USB: il motore deve rispondere con l'elenco dei dispositivi, senza ENOENT e senza avviare audio.
2. Passa a Extended con Cmd + =. Controlla larghezza strip, assenza SOF e apertura dello slot EQ in una finestra con tutti i controlli. Cambia canale e verifica che rimanga EQ.
3. Con interfaccia a due ingressi o WING USB, configura mic e reference. Prova un loopback a ritardo noto prima della misura acustica; verifica anche silenzio, clip e fermata.
4. Importa il file del microfono e, se disponibile, usa un calibratore per SPL. Cambia ingresso/gain e verifica che la taratura venga invalidata o rifatta.
5. Quando ci sono rack VST attivi, avvia e ferma la misura: i VST devono continuare. Ferma i VST mantenendo la misura: l'acquisizione deve continuare sullo stesso dispositivo.

La correzione automatica delle matrici resta fuori da questa versione. La compensazione del misuratore non scrive EQ o delay sulla WING.
