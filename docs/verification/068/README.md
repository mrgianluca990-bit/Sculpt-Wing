# Verifiche Sculpt Wing 0.6.8

Questa cartella conserva i risultati della consegna Mac M1. Le prove automatiche sono state eseguite nell’ambiente Linux; la prova grafica usa il bundle desktop nel browser in modalità demo. Non è stato eseguito un binario Mac né collegato un mixer WING.

## Test e preparazione dei bundle

| Verifica | Esito | Evidenza |
| --- | --- | --- |
| Test nativi | 104 passati | [native-and-web-tests.log](native-and-web-tests.log) |
| Test web | 366 passati | [native-and-web-tests.log](native-and-web-tests.log) |
| Rendering editor | 456 viste su 76 strip | [native-and-web-tests.log](native-and-web-tests.log) |
| Test shell desktop | 28 passati | [desktop-tests.log](desktop-tests.log) |
| TypeScript e bundle frontend | Completati | [build.log](build.log) |
| Preparazione app desktop | Completata | [prepare-desktop.log](prepare-desktop.log) |
| Versioni, asset, copie e SHA del benchmark | PASS, nessun problema | [build-audit-final.json](build-audit-final.json) |

Totale: **498 test passati, 0 falliti**, oltre alla verifica delle 456 viste. La suite comprende controlli su eventi del puntatore, cronologia, metadati live, risposte tardive, nuova sorgente e dati RTA. I trasporti sono controllati tramite fixture o loopback: questi esiti non sono un collaudo del banco fisico.

Dopo la suite è stato corretto soltanto il layout CSS del controllo RTA compatto, spostando il limite di larghezza sul wrapper corretto. Il nuovo CSS è stato sincronizzato nei bundle e verificato visivamente. L’audit confronta 57 asset, oltre all’HTML, in ciascuna delle tre copie generate. Verifica inoltre 47 asset della cache offline, i riferimenti HTML, l’ordine di caricamento, la versione 0.6.8 e il target ARM64 del workflow.

## Benchmark ripetuto

- [benchmark-ui-final.md](benchmark-ui-final.md): risultati, metodo, costi rimasti e limiti.
- [benchmark-ui-final-results.json](benchmark-ui-final-results.json): 36 campioni, percentili, contatori e SHA dei sorgenti.
- [benchmark-ui-final.log](benchmark-ui-final.log): log del confronto.
- [benchmark-ui.cjs](benchmark-ui.cjs): harness di misura.
- [audit-build.py](audit-build.py): audit di versioni, risorse e copie.

Sei scenari, due versioni e tre campioni per versione, in processi Node/JSDOM isolati. Le sorgenti misurate non sono cambiate durante l’esecuzione. Il componente RTA della 0.6.8 è presente nel DOM; non riceve dati hardware né genera uno spettro offline.

La misura riguarda JavaScript e DOM. Esclude rendering CSS, layout reale, GPU, attività dei meter, trasporto nativo, rete e audio WING. Le percentuali non sono misure di FPS o latenza percepita su Mac M1.

Per riprodurre esattamente il comando del report, collocare gli script in una cartella di verifica affiancata alle directory `sculpt-wing-067` e `sculpt-wing-068`, con le dipendenze native disponibili. Il vecchio sorgente corrisponde al commit `765149942d8ef083bfa1c8c8191d30f1a38d12a2`. Gli script conservati qui sono le copie usate nella misura, non un ulteriore passaggio della compilazione dell’app.

## Verifica nel browser

La prova usa una finestra da **1363 × 936** e comprende:

- Pan delle strip: regolazione e doppio clic al centro.
- EQ aperto su Kick, passaggio a Snare up mantenendo la scheda EQ.
- Presa decentrata del punto EQ e trascinamento su entrambi gli assi senza salto iniziale.
- RTA offline: grafico vuoto e messaggio Collega WING.
- Barra RTA compatta: etichetta completa e selettore leggibile dopo la correzione CSS.
- Nessun errore o avviso dell’app nei log console esaminati. Il rumore dell’estensione del browser è escluso.

Evidenza strutturata: [browser-qa.json](browser-qa.json). Immagini: [EQ e pan](../../images/eq-pan-068.jpg), [RTA offline](../../images/rta-068-offline.jpg).

## Riepilogo della consegna e prove successive

[bundle-verification.json](bundle-verification.json) raccoglie esiti, versioni, copie, benchmark e limiti. L’archivio di aggiornamento viene controllato separatamente per integrità ZIP e corrispondenza SHA256 di ciascun file.

Restano da eseguire la build GitHub del nuovo binario ARM64, l’avvio su Mac M1, la prova con una WING reale e l’eventuale calibrazione RTA. La mappatura numerica delle sorgenti non viene dichiarata verificata. I passaggi operativi sono in [COLLAUDO_0.6.8.md](../../COLLAUDO_0.6.8.md); le modifiche sono descritte nelle [note di rilascio](../../RELEASE_0.6.8_MAC_M1.md).
