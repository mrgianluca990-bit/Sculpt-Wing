# Sculpt Wing 0.7.3 · Canale, VST3 e FX

Aggiornamento dei sorgenti per **Mac M1 / Apple Silicon ARM64**, basato sulla 0.7.2 del repository. L’editor occupa ancora la riga opposta al canale aperto; passando a un altro canale conserva la scheda e il modulo compatibile.

## Le tre schede

| Scheda | Contenuto |
|---|---|
| **Canale** | Home, Pre, Gate, EQ, Comp, Insert 1, Insert 2, Send e Master. Ogni modulo si espande orizzontalmente. Home raccoglie identità, colore, solo, gruppi DCA/mute, Automix e protezioni richiamo disponibili. |
| **VST3** | Gli otto slot del rack Mac del canale selezionato, editor nativi, bypass, Audio USB, collegamenti e scelta Pre / Insert 1 / Insert 2. |
| **FX** | I 16 slot FX interni della WING, processore dello slot selezionato e assegnazioni ai due insert del canale. |

Le vecchie schede separate Canale, Processo, EQ, Dynamics, Mandate e Gruppi confluiscono nei moduli della scheda Canale. Le macro e le scorciatoie che aprivano quelle sezioni richiamano il modulo corrispondente. **Dispositivi** è rinominato **Canale**.

Nella scheda FX, la selezione di uno slot cambia soltanto l’editor visualizzato. I selettori Insert 1 e Insert 2 eseguono invece l’assegnazione esplicita al canale. Quando un controllo non è esposto dalla famiglia o dal firmware, rimane non disponibile; la modalità live attende le letture reali.

## Send da otto strip

Apri **Canale → Send → Apri mixer · 8 mandate**, oppure espandi la card Send. Ogni banco contiene al massimo otto destinazioni o sorgenti, con:

- numero, nome e colore;
- attivazione ON, fader verticale e valore numerico;
- pan, pre/post e opzioni Pan link / Segue mute quando previste;
- accesso Sends on Fader;
- banchi successivi e gruppi BUS, MTX, MAIN o ingressi secondo la direzione disponibile.

Il fader si prende dalla testa e il doppio clic lo porta a **0 dB**. Il doppio clic sul pan lo centra. Sui CH/AUX il pan può essere collegato al pan del canale. Il cambio banco e le regolazioni preservano le altre card, il focus e lo scorrimento.

BUS e MAIN conservano le direzioni disponibili; le matrici offrono **Riceve da**. Questo non introduce una mandata in uscita o un TAP non esistente sulle matrici. Sui CH, **TAP / EQ delle mandate PRE** resta raggiungibile sotto il mixer compatto. Non sono aggiunti meter di mandata simulati.

## Extended

Le strip sono più larghe e il processing dispone di una zona comprimibile con scorrimento proprio. Fader, pan e mute conservano spazio e nodi durante il cambio vista. Sopra il fader sono presenti i nove moduli del canale.

Il rack VST mostra gli slot occupati e una sola aggiunta al primo slot libero. Un rack vuoto ha un solo comando di apertura. Il rack si dispone vicino a Pre, Insert 1 o Insert 2 secondo la scelta del canale. Il testo distingue **Da associare**, **Da applicare WING**, **WING associata**, **Da verificare** e **Conflitto WING** dall’indicazione **Audio USB attivo**.

**Cmd + =** continua ad alternare Compact ed Extended. Pin, Custom Layer a due righe, SOF, DCA e ridimensionamento delle righe rimangono disponibili.

## VST3: scegliere il punto della catena

| Posizione | Percorso previsto | Risorse WING |
|---|---|---|
| **Pre** | Sorgente fisica dopo la preamplificazione → uscita USB WING → rack sul Mac → ritorno USB → ingresso del canale | Usa ALT per il ritorno; conserva MAIN e i due insert. |
| **Insert 1** | Primo insert del canale → External → USB/Mac → ritorno External | Usa uno slot FX External libero o già appartenente a quell’insert. Segue la posizione di Insert 1 nella catena. |
| **Insert 2** | Secondo insert, post-fader → External → USB/Mac → ritorno External | Usa uno slot FX External; non disponibile sugli AUX. Un punto impegnato da Automix deve essere liberato prima. |

### Preparazione

1. Apri **Audio USB**, scegli la WING come interfaccia, applica frequenza e buffer.
2. Apri la scheda **VST3** del canale e scegli la posizione. In **Plugin e collegamenti USB** imposta mono/stereo e porte di andata/ritorno; scansiona i VST3 installati, carica gli effetti e apri i loro editor nativi.
3. Con WING collegata e audio USB fermo, premi **Leggi percorso WING**. L’app legge sorgente, schema, risorse e assegnazioni e mostra il percorso proposto.
4. Premi **Applica percorso WING** per applicarlo. L’app rilegge i valori prima di scrivere, conserva un backup del patch, applica un mute temporaneo al canale e verifica i risultati. Una modifica esterna o un cambio sessione interrompono l’operazione.
5. Avvia esplicitamente l’audio USB quando il rack e il percorso sono pronti.

La sola scelta **Pre / Insert 1 / Insert 2** salva la posizione nel rack; non modifica il mixer. I rack delle vecchie versioni restano **Da associare** fino a una scelta esplicita. Aprire l’app, ricaricare i rack o riconnettersi non applica automaticamente un patch e non avvia l’audio.

### Pre e preamplificatore

PRE richiede una sorgente fisica diretta verificabile: Local, AUX fisico, AES50, StageConnect o AES, in mono o stereo standard. Il formato del rack deve coincidere con quello del canale; il ritorno stereo usa una coppia USB dispari/pari. Percorsi USER, M/S, USB in ingresso, playback e direct out non vengono risolti automaticamente in questa versione.

Il ritorno passa su **ALT USB**, con selezione automatica disattivata per il percorso gestito. MAIN e gli insert non vengono modificati. Il backup comprende l’ALT precedente e i selettori effettivi, anche se la sorgente fisica originale era ALT. In presenza di selezioni MAIN/ALT automatiche discordanti, l’app richiede una sorgente fisica esplicita prima di preparare PRE.

Nel modulo Pre, **Gain preamp** e **+48 V** continuano a riferirsi al preamplificatore fisico originale finché il percorso rimane verificato. Trim e polarità del canale restano controlli del canale. La sorgente attuale visualizzata è il ritorno USB.

### Ripristino e stato

Per cambiare posizione, porte USB o rimuovere un rack con patch WING gestito, ferma l’audio e usa prima **Ripristina ingresso diretto** oppure **Ripristina percorso WING**. Il ripristino recupera i valori originali soltanto se i valori attuali coincidono ancora con quelli applicati dall’app. Se il banco è stato modificato esternamente, conserva il conflitto da risolvere e non sovrascrive il nuovo lavoro.

Il backup appartiene al mixer identificato durante l’operazione. Riconnessione, cambi di console e riapertura non autorizzano replay automatici. Una corrispondenza dei parametri certifica il **patch di controllo**, non l’arrivo di campioni audio: audio USB, plugin e percorso fisico devono essere provati sul sistema reale.

Il bypass VST mantiene l’audio attraverso il Mac. Fermare il motore rende silenziose le sue uscite; non ripristina da solo l’ingresso diretto. L’app non applica compensazione automatica fra ritorno USB e percorsi dry, e la latenza riportata dall’host non sostituisce una misura del round trip.

Le regole usano i parametri del [protocollo ufficiale WING 3.1](https://cdn.mediavalet.com/aunsw/musictribe/XMBvOXMlIUC8kWwelBIOpg/NFeKk1IPIkiPCjtv1L-YVQ/Original/WING%20Remote%20Protocols%20FW%203.1.pdf) e la struttura External / FX SEND descritta nella [guida ufficiale AoIP-WSG](https://cdn-media.empowertribe.com/fce178bb208e6b9993867ecddff60e89/FACE-PRIN-PH1_QSG_BE_0606-ADN_AoIP-WSG_A4_WW_2024-05-17_Rev.0.pdf). L’uso USB deriva dalle destinazioni esposte dal protocollo WING; non usa il trasporto SoundGrid della guida. Il firmware collegato deve esporre lo schema verificato. Il collaudo hardware resta da eseguire.

## Compilazione Mac M1

Il pacchetto contiene i **sorgenti**, da estrarre e caricare nel repository seguendo [Carica su GitHub](../CARICA_SU_GITHUB.md). Non è un’app macOS già compilata.

Il workflow aggiornato compila anche il motore VST3 prima del packaging, sul runner Mac ARM64, ed esegue i test nativi con un effetto VST3 di prova. L’artifact previsto è **Sculpt-Wing-Mac-M1**, contenente `Sculpt-Wing-0.7.3-mac-arm64.zip`.

Il [report di verifica](VERIFICA_0.7.3.md) distingue test locali, controllo visivo, verifiche previste nel workflow e prove ancora da effettuare con Mac, WING e plugin reali.
