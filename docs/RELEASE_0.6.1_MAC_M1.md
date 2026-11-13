# Sculpt Wing 0.6.1 — aggiornamento Mac M1

## Consegna

Aggiornamento dei sorgenti del repository [mrgianluca990-bit/Sculpt-Wing](https://github.com/mrgianluca990-bit/Sculpt-Wing), preparato sul commit `d64a2261095ab49acde2bc39bb72ba7e874c4a6f`. Il ramo remoto risultava ancora su quel commit al controllo prima della consegna.

Lo ZIP contiene soltanto i file modificati e aggiunti, con i percorsi da conservare nel repository. Le istruzioni di caricamento sono in `LEGGIMI.txt`. Dopo il commit, il workflow **Build Sculpt Wing - Mac M1** produce l'artifact **Sculpt-Wing-Mac-M1**, con `Sculpt-Wing-0.6.1-mac-arm64.zip` e `Sculpt Wing.app`.

La scrittura tramite l'integrazione GitHub disponibile ha restituito `403 Resource not accessible by integration`. Nessun aggiornamento remoto è stato effettuato. Il pacchetto consegnato è un aggiornamento dei sorgenti; la nuova app macOS deve essere compilata da Actions.

## Mixer: trascinamento e fader

Entrambi i banchi scorrono orizzontalmente con mouse o penna trascinando il corpo delle strip. Il movimento si attiva dopo una soglia di 6 pixel e quando prevale lo spostamento orizzontale. Se la gesture inizia su un pulsante, il click viene soppresso dopo lo scorrimento: non vengono attivati Mute, SOF o l'editor per effetto del trascinamento. Il touch conserva lo scorrimento nativo.

La regolazione dei fader parte soltanto dalla testa visibile. Click, doppio click e trascinamento sulla pista del fader del mixer non impostano un nuovo livello. La stessa regola vale per le mandate verticali e per i fader verticali e orizzontali disegnati nei pannelli dei plugin. Tastiera e inserimento numerico restano disponibili. In Send on Fader viene regolata la mandata al destinatario selezionato.

## Custom Layer su due righe

Il comando **Menu del banco → Custom Layer** apre la gestione delle due righe:

- **Riga 1 — superiore** e **Riga 2 — inferiore** accettano CH, AUX, BUS, MTX e MAIN.
- Ogni riga ha un ordine esplicito. Si possono spostare le strip a sinistra/destra, trasferirle all'altra riga o rimuoverle dal layer.
- Una strip compare una sola volta nel layer. Una riga vuota rimane visibile.
- I fader mantengono identità, valori, listener e semantica di ingresso/uscita. Spostarli nel layer non crea canali o valori audio duplicati.
- Uscendo dal layer viene ripristinato l'ordine originale di tutte le 76 strip.
- I layer precedenti, memorizzati come elenco unico, vengono migrati sulle due righe in base al banco originale.

La preferenza locale `sculpt-wing-layers-v1` conserva solo layer e selezione del layer attivo. Funziona anche quando il salvataggio locale dei valori audio è disabilitato per una sessione live; non ripristina automaticamente livelli o mandate del banco.

## Pannelli dei plugin

Le figure della **WING Effects Guide, Firmware Version 3.0, V0.0** sono il riferimento della nuova geometria. Sono state ricostruite **99 delle 109 definizioni del catalogo**, incluse famiglie condivise fra rack e canali. Tutte le 109 definizioni conservano i propri controlli.

Fra i cambiamenti: disposizione originale del 76 e del LA, corone e nuclei indipendenti dell'Even 84, fader e libreria VSS3, 31 bande del GEQ, schede delle Channel FX, selezione della banda del Combinator e interfacce digitali delle dinamiche WING. I metadati live del firmware restano autorevoli per tipi, limiti e opzioni dei parametri.

Questa copertura non significa identità pixel per pixel con ogni versione del firmware o con ogni pagina interna. Font, materiali e alcuni dettagli differiscono; i parametri non raffigurati nella guida rimangono nella sezione aggiuntiva. I meter senza dati audio/GR restano inattivi. Le curve di riferimento descrivono le impostazioni, non misure del segnale o una replica del DSP proprietario.

La tabella completa, le dieci definizioni con pannello precedente e le limitazioni specifiche di VSS3, Speaker Manager ed EQ delle uscite sono in [PLUGIN_ORIGINAL_SURFACES.md](PLUGIN_ORIGINAL_SURFACES.md), insieme ai collegamenti alla fonte.

## Compilazione Mac M1

Il workflow usa un job di verifica su Linux e un solo job di confezionamento macOS arm64. Controlla architettura del runner, test TCP/UDP su Mac, architettura dell'eseguibile e firma ad hoc del bundle prima di pubblicare l'artifact della build.

La versione desktop, il lockfile e la versione visibile nell'app sono allineati a **0.6.1**. La cache web è aggiornata a `sculpt-control-v12` e include i sei file di layout nell'ordine di dipendenza corretto. La preparazione desktop incorpora gli stessi asset e i flag nativi, con la policy CSP esistente; i file temporanei di QA non vengono inclusi.

## Verifiche eseguite

Ambiente di sviluppo Linux, Node 24; nessuna WING fisica collegata.

| Verifica | Esito |
| --- | --- |
| Suite native, protocollo e controller | 99 test superati |
| Suite web completa dopo integrazione | 102 test superati |
| Editor del canale | 456 rendering su 76 strip superati |
| Suite desktop TCP/UDP e policy | 17 test superati |
| Suite plugin mirata | 14 test superati, compresi 109 modelli e l'EQ output |
| Build TypeScript / bundle nativo | Completata |
| Preparazione asset desktop | Completata; ordine dei sei layout, versioni e flag verificati |
| Controllo differenze e sintassi | Superato |

La prova nel browser ha verificato anche il comportamento reale degli eventi del mouse:

- Trascinamento orizzontale indipendente della riga superiore e inferiore, con livelli invariati.
- Pista e doppio click sul fader del mixer inerti; testa del fader funzionante.
- Mandate verticali: pista inerte e testa funzionante.
- Custom Layer misto CH/BUS/MAIN su entrambe le righe, ordine e persistenza dopo reload.
- Even 84: corona della frequenza seguita dal nucleo del gain, con valori indipendenti.
- WING EQ: cambio banda e modifica del relativo gain; WING Compressor con interfaccia digitale.
- Vintage Channel: passaggio fra DYN, EQ e LVL.
- GEQ: trascinamento sulla pista lascia 0 dB; trascinamento della testa regola il parametro.
- Combinator: la selezione della banda mostra i controlli corrispondenti.
- LA: etichette sotto le scale e interruttore POWER sincronizzato con il bypass nell'intestazione.

Non sono comparsi errori JavaScript dell'app nei log della prova finale. Le verifiche automatiche e nel browser non sostituiscono l'esecuzione della nuova build sul Mac M1 e il collaudo con una WING fisica, ancora da effettuare.

## Ambito

Le macro sono rimandate al passaggio successivo richiesto dall'utente. Il trasporto diretto della WING e il lavoro separato su Show Remote non sono oggetto di questa consegna.
