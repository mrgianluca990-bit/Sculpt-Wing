# Verifica della demo completa 0.4 — 13 novembre 2026

## Perimetro

Demo statica con stato condiviso, catalogo dei processori, rack FX, editor canale, I/O, gruppi, monitor/talkback, meter/RTA, scene, recorder, setup e macro. Nessuna WING fisica o connessione remota è coinvolta. Le precedenti verifiche 0.3 restano nella cronologia Git.

## Verifiche automatiche

Comandi completati:

```text
node --test model.test.cjs tests/desk.test.cjs tests/plugin-catalog.test.cjs tests/system-actions.test.cjs
node tests/editor.integration.test.js
```

**32 test superati, nessun fallimento**, oltre al test di integrazione che renderizza **456 pagine: sei pannelli per 76 strip**.

I controlli coprono famiglie e direzioni delle mandate, separazione SOF/master, migrazione dello stato precedente, persistenza, limiti dei modelli e degli slot, 1.116 definizioni di parametro tipizzate, 6/8 bande EQ, sorgenti condivise, DCA e mute groups, scene con scope e safes, appartenenza automix, proprietà univoca rack/insert, import/export, macro con fade e cancellazione, trasporti virtuali e ripristino completo.

Le sei regressioni specifiche del recall verificano: richiamo solo FX; processing con slot protetti; gruppi con strip safe; esclusività automix/post FX; priorità delle strip protette al limite16; riparazione di vecchie assegnazioni duplicate, obsolete o vietate. Il catalogo verifica che il numero di step del protocollo non diventi un passo fisico lineare improprio; il controllo VSS3 accetta 2,8 s senza trasformarlo in 2,81 s.

L’integrazione editor verifica selettori validi, commit numerici, modifiche pendenti al cambio di strip/sorgente, Main/Alt globale, gain e phantom condivisi, scelta dei modelli, mandate/tap, automix e cleanup delle sottoscrizioni. Usa i moduli reali con una fixture DOM e non sostituisce la verifica visiva.

## Verifica in Chrome

Eseguita con la distribuzione effettiva nell’anteprima gestita. Un iframe temporaneo è stato usato per le dimensioni CSS; il file QA è stato rimosso dalla distribuzione.

- Mixer compatto osservato a 375×667, layout iPhone ed editor a 393×852, vista orizzontale a 844×390 e tablet a 1024×768.
- Nessun overflow della pagina alle dimensioni controllate. Scorrimenti orizzontali dei banchi, delle schede e delle tabelle restano intenzionali.
- Menu con tutte le sezioni globali raggiungibili.
- Rack a16 slot aperto. VSS3 modificato, assegnato dal BUS13 al CH1 e ritrovato nel relativo pre insert. Valore Decay2,8 accettato nella versione finale.
- Editor Canale, Processo ed EQ osservati su telefono; il gain del preamp Local1 portato a23dB è ricomparso in I/O.
- Patch Main del CH1 spostata aLocal2 in I/O e ritrovata nel selettore del canale.
- DCA, automix, monitor e talkback aperti. Dim commutato e stato verificato.
- Recorder virtuale avviato, aggiunto un marker e fermato: tempo, marker e sessione sono comparsi nella libreria.
- Meter/RTA e Setup aperti.
- Creato un layer con BUS1 e CH1, richiamato sul mixer: due strip visibili. Uscendo dal layer sono tornate tutte76.
- Macro «Voce+1» eseguita: fader CH1 da−4 a−3dB al termine del fade. Richiamo della scena di prova: ritorno a−4dB.
- Scena «Prova completa» salvata e richiamata. Il successivo ripristino ha riportato le due scene iniziali, Soundcheck e Concerto.
- Esportato il progetto completo dalla app alla root; reimportato attraverso il selettore file dopo il ripristino della demo. Validazione76strip, pulsante Annulla importazione presente e Decay VSS3 ritrovato a2,8s.

Il download dal wrapper iframe non ha prodotto l’evento atteso dall’automazione; la stessa esportazione è stata quindi verificata con successo dalla app alla root, insieme alla reimportazione del file ottenuto.

## Offline effettivo

Cache della consegna: **sculpt-control-v8**, con20 asset locali.

1. Aperta la root e verificata l’indicazione **Offline pronto**.
2. Fermato il server con `sites-preview stop`.
3. Ricaricata la root:76strip e **Offline pronto** ancora presenti.
4. Aperto FX Rack e l’editor VSS3, con Decay2,8 conservato.
5. Aperto I/O e verificata la tabella degli otto ingressi del banco selezionato.
6. Aperta Scenes/Library, con Soundcheck e Concerto disponibili; ritorno al mixer.

La cache esclude login, API e origini esterne. Tutte le risorse sono convalidate prima dell’indicazione di disponibilità offline. Le modifiche non richiedono un server per essere salvate sul dispositivo.

## Immagini

- `sculpt-control-complete-mixer.jpg`: mixer orizzontale, due file e macro.
- `sculpt-control-complete-phone.jpg`: mixer compatto375×667.
- `sculpt-control-complete-fx.jpg`: pannello VSS3, coda del riverbero.
- `sculpt-control-complete-io.jpg`: patch delle uscite locali.

## Limiti della verifica

Le dimensioni CSS in Chrome non equivalgono a un iPhone fisico: Safari, tastiera iOS e installazione dalla Home non sono stati provati su hardware. Nessuna verifica su WING, nessuna elaborazione o registrazione audio reale. La prova offline locale non verifica da sola l’autenticazione dell’hosting pubblicato. La pubblicazione viene verificata separatamente dal risultato del servizio di hosting.
