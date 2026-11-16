# Sculpt Wing — allineamento delle matrici

Data: 16 novembre 2026. Stato: studio tecnico e specifica proposta; funzione non ancora implementata o verificata con un mixer.

## Decisioni richieste da Gianluca

- Priorità all'allineamento temporale e di fase; generazione automatica dell'EQ in una fase successiva.
- Reference elettrica selezionabile da un canale, un bus o un master della WING.
- Casse, sub, frontfill e diffusori di ritardo sono alimentati da matrici.
- Le correzioni di EQ e delay si applicano esclusivamente alle matrici selezionate.
- Integrazione dentro Sculpt Wing, con l'host audio già incluso e interfaccia nell'app.
- Anteprima modificabile, applicazione con un clic e ripristino dei valori precedenti.

## 1. Metodo scelto

Misurare separatamente due sistemi A e B, con un solo microfono fermo e la stessa reference elettrica. Conservare le risposte complesse e il loro riferimento temporale. Calcolare una variazione di delay realizzabile sulle matrici, mostrare la somma prevista, applicare e acquisire una verifica acustica.

La reference elettrica è il segnale con cui si misura. Il sistema A è invece il riferimento acustico rispetto al quale allineare B: non sono la stessa selezione.

| Campo | Significato |
|---|---|
| Mic | Ingresso di misura e corrispondente flusso audio ricevuto dal Mac |
| Reference elettrica | CH / BUS / MAIN, componente L o R oppure somma mono esplicitamente scelta |
| Sistema A | Matrice o gruppo di matrici, normalmente mantenuto fisso |
| Sistema B | Matrice o gruppo da allineare |
| Tipo | PA/frontfill/diffusore di ritardo oppure PA/sub |
| Zona | Posizione del microfono e zona di sovrapposizione da ottimizzare |
| Banda | Intervallo utile per il confronto; modificabile |

La reference deve precedere EQ e delay delle matrici e contenere il segnale che eccita entrambe le sorgenti. Per la prima implementazione si usa un segnale di prova mono comune, evitando di confondere componenti stereo diverse.

I due ingressi audio vengono acquisiti nello stesso dispositivo e clock. Il routing verso le casse rimane quello della sessione. L'assistente verifica le copie di mic/reference verso USB e mostra gli eventuali collegamenti necessari prima della prova.

## 2. Procedura operativa

1. Scegliere mic, reference, A e B. Selezionare anche le eventuali altre matrici da silenziare durante la prova.
2. Posizionare il microfono nella zona di sovrapposizione da ottimizzare; mantenerlo fermo per A e B.
3. Acquisire A da sola, poi B da sola, mantenendo riferimento, livelli e processamento stabili.
4. Premere **Calcola allineamento**. Mostrare attuale, variazione e nuovo delay, oltre alla somma prevista.
5. Consentire correzione manuale del valore, scelta della banda, selezione della matrice modificabile e blocco di gruppi già allineati.
6. **Applica e verifica** scrive il piano sulle matrici, rilegge i valori e acquisisce il risultato.
7. Rendere disponibile **Ripristina precedente** e l'operazione nella cronologia di annullamento.

La sequenza di acquisizione può gestire il generatore e i mute soltanto nel gruppo di prova dichiarato. Conservare gli stati iniziali e ripristinare soltanto quelli ancora corrispondenti alle modifiche della sequenza. Non mutare un bus/master comune per isolare una matrice: potrebbe togliere segnale a entrambe. Non usare Solo In Place.

Il comando di applicazione deve essere idempotente rispetto alla stessa proposta: un secondo clic non aggiunge nuovamente il delay. Una nuova proposta parte da una nuova lettura e da misure coerenti con quella lettura.

## 3. Tempo di misura e delay del mixer

Un delay finder stima la differenza di arrivo tra reference e microfono, che comprende propagazione e processamento [1]. Questo tempo serve all'analizzatore; il valore da applicare alla matrice nasce dal confronto A/B.

Ogni acquisizione conserva:

- risposta complessa e impulso;
- stima dell'arrivo originale;
- compensazione temporale usata dall'analizzatore;
- livelli relativi reali, coerenza e validità delle finestre;
- dispositivo, sample rate, canali e patch della reference;
- stato di delay, EQ, insert e polarità delle matrici;
- identificatore della posizione microfonica e della sessione WING.

Le fasi vanno riportate a una base temporale comune. Curve azzerate separatamente possono sembrare allineate anche quando la somma non lo è [2].

Convenzione proposta, da verificare con un loopback noto: se la risposta visualizzata della misura i è `Hc_i = Hraw_i · exp(+j·2π·f·m_i)`, dove `m_i` è il ritardo di misura in secondi, la risposta con riferimento grafico comune T è:

`Hcommon_i = Hc_i · exp(+j·2π·f·(T − m_i))`.

Il delay tracker può aggiornare la visualizzazione, ma non deve eliminare o sovrascrivere l'informazione temporale necessaria al confronto. Lo stesso riferimento grafico viene applicato anche alle curve previste.

## 4. PA, frontfill e diffusori di ritardo

Con A fissa, siano:

- `tA`, `tB`: arrivi misurati, inclusi i delay già attivi;
- `dB`: delay effettivo corrente di B, pari a zero se il delay è bypassato;
- `h`: ritardo aggiuntivo desiderato di B rispetto ad A, inizialmente zero.

Il calcolo proposto è:

`variazione_B = tA + h − tB`

`nuovo_delay_B = dB + variazione_B`.

Esempio puramente illustrativo:

| Sistema | Arrivo misurato | Delay attuale attivo | Variazione | Nuovo delay |
|---|---:|---:|---:|---:|
| PA — matrice A | 28,4 ms | 0,0 ms | 0,0 ms | 0,0 ms |
| Frontfill — matrice B | 11,2 ms | 5,0 ms | +17,2 ms | 22,2 ms |

Se il risultato richiede un valore hardware negativo, verificare prima se basta ridurre un delay già presente. Altrimenti proporre di ritardare A, solo se quel gruppo è modificabile. Non troncare silenziosamente a zero.

Con entrambe le sorgenti modificabili e modalità che aggiunge soltanto ritardo, un riferimento iniziale è `T = max(tA, tB)`, aggiungendo `T − t_i` a ciascuna. Verificare limiti e gruppi per ogni matrice coinvolta.

L'arrivo va ricercato in una finestra plausibile e controllato su più acquisizioni. Consentire la selezione di un altro candidato quando una riflessione domina. Una tabella di tempi relativi e il confronto in banda hanno precedenti documentati nei sistemi professionali [3].

## 5. PA e sub: ottimizzazione in banda

Per PA/sub l'impulso fornisce una stima iniziale, ma la decisione usa la fase nell'intervallo d'incrocio. Il confronto di pendenza, fase e impulsi filtrati è documentato da REW; risonanze dominanti possono rendere ingannevole una correlazione isolata [4].

Proposta algoritmica Sculpt:

1. Individuare una banda in cui entrambe le sorgenti hanno segnale utile; mostrarla e consentirne la modifica.
2. Cercare variazioni temporali intorno alla stima iniziale, includendo i candidati dei cicli vicini compatibili con l'impulso e con i limiti hardware.
3. Pesare i punti per coerenza e sovrapposizione dei livelli, evitando che pochi punti o una risonanza decidano da soli.
4. Confrontare l'errore di fase circolare su tutta la banda e il miglioramento della somma prevista. Penalizzare ritardi aggiuntivi grandi privi di un beneficio misurabile.
5. Mostrare l'ambiguità quando più candidati hanno qualità simile. Una coincidenza a una sola frequenza non è un allineamento sufficiente.

Per una variazione u applicata a B:

`Hpred_B(f) = H_B(f) · exp(−j·2π·f·u)`

`Hsum(f) = H_A(f) + Hpred_B(f)`.

Conservare i livelli relativi reali per questa previsione; non normalizzare separatamente A e B. L'allineamento può richiedere di ritardare il PA anziché il sub, sempre intervenendo sulle rispettive matrici.

L'eventuale inversione di polarità è una proposta distinta, visibile e opzionale. La prima versione può calcolare il risultato con la polarità corrente; un'alternativa invertita diventa applicabile soltanto quando il percorso effettivo e i relativi controlli della matrice sono verificati. La presenza di direct input richiede una verifica specifica.

Per gruppi già allineati internamente, applicare lo stesso incremento temporale a ogni matrice e mantenere le differenze esistenti. Non modificare la struttura temporale di un array di sub basandosi su un solo microfono. La configurazione dei gruppi è esplicita; i nomi L/R non bastano per crearli automaticamente.

## 6. Collegamento alla WING

I rami di correzione sono limitati a `/mtx/N/dly/{on,mode,dly}` e, per la fase successiva, `/mtx/N/eq/…`. Il protocollo distingue le unità MS/M/FT/SMP e i percorsi di polarità normale e direct input [5][6].

La UI legge schema, intervallo e risoluzione reali. Non promettere una precisione fissa indipendente dalla modalità. La proposta deve mostrare anche il residuo dopo quantizzazione.

Per una prima implementazione verificabile, la scrittura automatica può partire dalle matrici configurate in MS. Il supporto delle altre unità richiede una conversione verificata; non presumere che cambiare `mode` mantenga trasparentemente il tempo fisico. Qualunque cambio di configurazione durante le acquisizioni invalida il confronto.

La reference CH può richiedere un USER SIGNAL; BUS/MAIN possono essere copiati sui flussi USB, eventualmente tramite USER per scegliere tap e componente [5]. L'implementazione riusa il codice di routing esistente:

- preferire una copia USB già configurata e corrispondente;
- verificare tap e componente stereo;
- non cambiare il tap condiviso del canale per comodità;
- non occupare o riscrivere USB/USER usati dai rack VST;
- mostrare un piano per le sole nuove copie necessarie, distinto dalle correzioni acustiche;
- mantenere invariati ingressi dei canali e collegamenti delle casse.

## 7. Applicazione e verifica

Prima di applicare, rileggere console, patch e parametri rilevanti. Una proposta viene invalidata se sono cambiati riferimento, posizione mic, sample rate, EQ, delay, polarità o percorso che la rendevano valida.

Conservare i valori originari completi, compresi on/off e modalità. Scrivere soltanto sulle matrici previste e verificare il readback con tolleranza coerente con quantizzazione e float32. Le scritture multiple non sono una transazione atomica: una riuscita parziale deve essere rappresentata esplicitamente e deve essere ripristinabile dove i valori non siano stati modificati da altri controller.

La verifica proposta comprende una nuova misura di B e della somma A+B, con confronto fra previsione e risultato. Il miglioramento vale per la geometria misurata. Un'altra posizione è una nuova coppia A/B, utile per valutare il compromesso, non una media delle fasi da azzerare e sommare senza criterio.

La calibrazione SPL assoluta non è un prerequisito del delay relativo con la stessa catena: il confronto usa il tempo. Conservare comunque il profilo microfono per risposta e livello. La taratura del guadagno non risolve clock, patch o instabilità temporale.

## 8. Integrazione nel codice e verifiche minime

Lettura del repository locale 0.7.3:

- `audio-host/Source/Main.cpp`: un solo callback dispone già degli ingressi; aggiungere un tap mic/reference verso un buffer preallocato e un worker. Separare avvio/stop dell'analisi dal ciclo di vita VST, oggi subordinato alla presenza di un rack.
- `dist/wing-map.js`, `dist/editor.js`: riusare individuazione dei parametri e lettura del ramo delay.
- `dist/live-session.js`: riusare identificazione della sessione e accesso live.
- `native/src/wing/client.ts`: riusare la verifica del readback che considera la quantizzazione.
- `dist/vst-wing-route.js`: riusare il concetto di piano/journal/ripristino, adattando metadata e tolleranze al delay.

Nessun calcolo FFT o serializzazione nel callback audio. Aggiornare i grafici a frequenza controllata e mantenere reattivi fader e processamento VST.

Il motore di misura viene adattato dal sottoinsieme OSM GPL identificato nello studio precedente, conservando attribuzioni e condizioni. Non usare l'API remota come requisito di una seconda applicazione aperta dall'utente. L'ottimizzazione e l'applicazione WING sono moduli Sculpt da realizzare.

Verifiche necessarie alla futura implementazione, non eseguite in questo studio:

1. **Calcolo:** loopback con ritardo noto e due catture con compensazioni grafiche differenti; verificare segno, delay già presente e ricostruzione del riferimento comune.
2. **Sub:** coppia di risposte con crossover e delay noto; verificare candidati di cicli diversi, assenza di overlap e risultato ambiguo.
3. **WING:** applicazione/rilettura/ripristino su una matrice, includendo bypass e modifiche esterne; poi una coppia reale di diffusori e verifica della somma.

Questi controlli non richiedono di ripetere l'intera suite dell'app né di ricompilare durante lo studio.

## Fonti primarie

Le fonti documentano i principi e le funzioni esistenti; flusso, formule operative e criteri del solver sopra descritti sono una proposta progettuale Sculpt.

1. Rational Acoustics, [Delay Finder vs. Delay Tracker](https://support.rationalacoustics.com/support/solutions/articles/150000184350-delay-finder-vs-delay-tracker).
2. Rational Acoustics, [PTR vs. TO and How to Adjust](https://support.rationalacoustics.com/support/solutions/articles/150000196846-ptr-vs-to-and-how-to-adjust).
3. Rational Acoustics, [Advanced Delay Finder: A Guide](https://support.rationalacoustics.com/support/solutions/articles/150000188314-advanced-delay-finder-a-guide).
4. REW, [All SPL Graph — Alignment Tool](https://www.roomeqwizard.com/help/help_en-GB/html/graph_allspl.html).
5. Music Tribe, [WING Remote Protocols 3.1-03](https://cdn-media.empowertribe.com/2106004e217b8eb2639d93672823eef5/WING_Remote-Protocols-3.1-03.pdf), tabelle USER SIGNAL e Matrix Settings, consultate negli estratti indicizzati del documento ufficiale.
6. Music Tribe, [WING Remote Protocols FW 3.0.6](https://cdn-media.empowertribe.com/f255e02a7d164692b3ac2aff862cfcad/WING%20Remote%20Protocols%20FW%203.0.6.pdf), tabella Matrix Settings, consultata negli estratti indicizzati.
7. Open Sound Meter, [manuale 1.5](https://opensoundmeter.com/static/manuals/v1.5.pdf), [release](https://opensoundmeter.com/en/releases), [licenza delle versioni precedentemente GPL](https://opensoundmeter.com/en/eula).
