# Verifiche Sculpt Wing 0.6.7

I log di questa cartella documentano i test eseguiti sui sorgenti consegnati. Sono prove nell’ambiente Linux, non un certificato di funzionamento del binario macOS o del mixer fisico.

- `native-and-web-tests.log`: 100 test nativi/driver, 322 test web e 456 aperture delle pagine dei 76 canali.
- `desktop-tests.log`: 28 test della shell, del trasporto WING, dell’invio OSC UDP e del menu Undo/Redo.
- `benchmark-ui-results.json`: campioni, mediane, ambiente, metodo e hash dei sorgenti del confronto 0.6.6 / 0.6.7.
- `benchmark-ui.cjs`: script del confronto con percorsi di ingresso configurabili.

## Ripetere i test

Dalla radice del repository, dopo aver installato le dipendenze:

```sh
npm run test:all --prefix native
npm test --prefix desktop
npm run build --prefix native
npm run prepare:app --prefix desktop
```

## Ripetere il confronto

Occorre una copia separata dei sorgenti 0.6.6, corrispondente al commit `465b4f01f86f0a758c970d45780a3982db972213`. Dalla radice della 0.6.7:

```sh
NODE_PATH="$PWD/native/node_modules" node --expose-gc docs/verification/benchmark-ui.cjs /percorso/della/0.6.6 "$PWD"
```

Il primo argomento è la radice del progetto 0.6.6, il secondo quella del progetto 0.6.7. Lo script aggiorna `benchmark-ui-results.json` nella propria cartella. I due scenari applicano 120 modifiche consecutive al gain di una banda EQ o al fader CH 1, con l’editor EQ aperto; ciascuno viene ripetuto tre volte per versione. I percorsi nel rapporto originale identificano le copie usate durante la misura; lo script distribuito aggiunge soltanto la possibilità di scegliere altri percorsi, senza cambiare lo scenario o il metodo.

Il tempo comprende gestione dei comandi, cronologia, aggiornamenti DOM e salvataggio finale. Sono esclusi caricamento iniziale, rendering CSS, repaint del browser, meter asincroni, comunicazione TCP/UDP, latenza audio e comportamento del Mac. Le scritture Storage contano chiamate e testo passato all’API, non operazioni fisiche sul disco. Le percentuali del rapporto descrivono questi scenari, non una velocità complessiva garantita dell’app.

Per la prova reale usare [Collaudo WING e Show](../COLLAUDO_WING_SHOW_0.6.7.md).
