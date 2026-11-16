# Sculpt Wing 0.7.4 · Mac Apple Silicon

## Motore audio incluso nella build

La build precedente poteva riuscire senza includere `SculptWingAudio.app`. Il workflow presente su GitHub costruiva la shell Electron senza compilare prima il motore nativo. All'apertura di Audio USB il processo cercava quindi un eseguibile assente e restituiva `spawn … SculptWingAudio ENOENT`. Il mixer scollegato non causa questo errore.

La 0.7.4 compila il motore ARM64 prima del pacchetto, verifica il file sorgente e quello copiato nel percorso usato dall'app, quindi avvia un controllo del motore già incluso. Una risorsa mancante, un eseguibile Intel o una copia diversa fanno fallire la build. Il messaggio nell'app distingue questo problema da una disconnessione recuperabile.

Per ottenere la correzione occorre caricare anche **`.github/workflows/build-desktop.yml`**, oltre a `audio-host/` e `desktop/`. Copiare soltanto `dist/` non aggiorna il processo di compilazione. I passaggi sono in [CARICA_SU_GITHUB.md](../CARICA_SU_GITHUB.md).

## Compact ed Extended

- Rimossi i pulsanti in linea **Tutti i canali**, **Compact** ed **Extended**. Il cambio vista resta nel menu macOS **Vista** e con **Cmd + =**; il ritorno dal custom layer resta disponibile nel relativo menu.
- Le strip Extended hanno la stessa larghezza delle strip Compact, comprese quelle ancorate e i DCA.
- Selezionare uno slot WING in Extended apre una finestra dedicata al modulo, trascinabile e ridimensionabile, con i controlli del modulo aperti. L'EQ mostra insieme i controlli delle bande. I plugin VST3 mantengono i loro editor nativi.
- Cambiando canale resta selezionato lo stesso modulo. Compact conserva l'editor nella riga opposta.
- **SOF è disponibile in Compact.** Entrando in Extended viene sospesa la visualizzazione SOF e i fader mostrano i livelli dei canali. Tornando in Compact si recupera la destinazione precedente; un richiamo SOF esplicito passa a Compact.

## Analisi dell'impianto con il motore Open Sound Meter

Apri **Analisi impianto** dal menu di Sculpt Wing, oppure **Analisi → Open Sound Meter** nel menu macOS (**Cmd + Maiusc + M**).

L'integrazione usa una parte del motore di misura di **Open Sound Meter 1.5.2**, adattata al processo audio già incluso nell'app: FFT, finestra Hann, medie spettrali/coerenza e deconvoluzione. L'interfaccia è integrata in Sculpt Wing; non si installa un'altra applicazione e non viene aperto un processo OSM separato. Provenienza, modifiche e licenza del codice sono in [audio-host/vendor/open-sound-meter/README.md](../audio-host/vendor/open-sound-meter/README.md).

### Prima misura

1. Apri **Audio USB**, scegli la stessa interfaccia per ingresso e uscita e applica frequenza e buffer. Per una misura WING usa la WING collegata via USB. Consenti l'accesso al microfono quando macOS lo richiede: il permesso serve anche per gli ingressi USB.
2. Nel pannello Analisi scegli l'ingresso **CH/AUX del microfono** e la **reference CH/BUS/MAIN**. Per una sorgente stereo scegli la componente prevista dal patch.
3. Associa due ingressi USB distinti: uno deve portare realmente il microfono, l'altro la reference elettrica. La lettura del patch WING serve a controllare l'associazione; non modifica il routing. Se il patch non è verificabile, l'app indica che l'associazione USB è manuale e non verificata. Selezionare il nome di un canale non crea da solo un collegamento audio.
4. Fornisci un segnale di prova alla reference e all'impianto. Questa prima integrazione non contiene un generatore. Il microfono deve ricevere l'impianto e non entrare nel percorso di amplificazione usato per la prova.
5. Avvia esplicitamente la misura. Apertura del pannello, ripristino della sessione e riconnessione non avviano l'acquisizione.

Il pannello presenta risposta in frequenza, fase, coerenza, RTA del microfono e risposta all'impulso, insieme a livelli e stato del segnale. La reference e il microfono devono essere acquisiti con lo stesso dispositivo e lo stesso clock. Il nome del dispositivo e gli ingressi effettivi sono parte della configurazione.

La misura può funzionare senza alcun rack VST. Quando misura e VST sono attivi insieme condividono il dispositivo: fermare una delle due funzioni non ferma l'altra. Per cambiare dispositivo, sample rate o struttura dei rack occorre prima fermare entrambi. La sospensione del Mac ferma entrambi; non li riavvia automaticamente al risveglio.

### Delay

Il ritardo stimato rappresenta l'arrivo del segnale al microfono rispetto alla reference. **Usa nel misuratore** aggiorna soltanto la compensazione temporale dell'analizzatore, utile per leggere fase e risposta. Non è il ritardo da copiare automaticamente su una matrice e non scrive parametri sulla WING.

La dimensione FFT determina l'intervallo di ricerca del ritardo. Un segnale assente, saturato o non affidabile non deve diventare una proposta di delay. Per verificare il verso e il valore, la prima prova utile è un loopback con un ritardo noto; segue la misura acustica con microfono fermo.

In questa prima versione il finder richiede una reference con almeno 500 Hz di banda eccitata e un picco dell'impulso sufficientemente distinto dal fondo. Un tono singolo o una reference limitata alla sola banda sub possono produrre curve, ma non una stima di delay utilizzabile. Per la reference scegli il segnale a banda larga prima del filtraggio delle matrici. Il picco include propagazione e ritardi introdotti da filtri e trasduttori; l'allineamento PA/sub richiederà anche il confronto della fase nella zona di crossover.

### Calibrazione del microfono

Sono distinte due calibrazioni:

| Calibrazione | Cosa serve | Cosa corregge |
|---|---|---|
| Risposta in frequenza | File TXT/CSV del produttore, frequenza e guadagno, fase facoltativa | Deviazioni della risposta del microfono |
| Livello SPL | Calibratore acustico e livello noto, per esempio 94 o 114 dB | Relazione fra livello digitale acquisito e pressione sonora |

Il profilo del microfono si può abilitare e disabilitare. Per il livello SPL occorre un segnale stabile e non saturato; non è necessaria una reference valida. Dopo un cambio di microfono, ingresso, dispositivo o guadagno va rifatta la calibrazione di livello. Il numero SPL è un livello non ponderato ottenuto dall'ingresso calibrato, non una certificazione da fonometro.

Il profilo corregge ampiezza/fase della funzione di trasferimento e ampiezza del RTA. **Impulso e stima dell'arrivo restano grezzi**, includono la risposta del microfono e usano soltanto la compensazione temporale dell'analizzatore. La taratura SPL usa il valore RMS grezzo e il proprio offset di livello. Servono comunque due ingressi disponibili e distinti sul dispositivo: la sola misura SPL con un'interfaccia mono non è prevista da questa prima acquisizione a due canali.

### Curve salvate

Le acquisizioni possono essere salvate con nome e colore, mostrate/nascoste, eliminate ed esportate/importate in JSON. Il file conserva dati e impostazioni di misura. Le curve di sessioni diverse vanno confrontate tenendo conto di reference, microfono, guadagni, posizione e compensazione temporale.

### Fase successiva

Questa versione acquisisce e visualizza le misure manuali. Non applica automaticamente EQ, delay, mute o patch al mixer. La successiva funzione di allineamento seguirà la regola concordata: **correzioni solo sulle matrici**. Il metodo proposto resta documentato in [SCULPT_WING_MATRIX_ALIGNMENT.md](SCULPT_WING_MATRIX_ALIGNMENT.md).

La pagina nel browser non acquisisce dal motore nativo e non presenta curve live simulate. I grafici richiedono l'app desktop, il dispositivo audio configurato e segnali reali.

## Consegna e verifiche

Il pacchetto di sorgenti include il workflow aggiornato e tutti i componenti necessari alla build Mac M1. Il binario ARM64 viene generato dal workflow su macOS; non è contenuto nello ZIP dei sorgenti.

Le prove effettuate in questo ambiente e quelle ancora da fare sul Mac sono separate in [VERIFICA_0.7.4.md](VERIFICA_0.7.4.md). Restano la verifica del binario macOS, del patch USB effettivo e del comportamento con la WING fisica.
