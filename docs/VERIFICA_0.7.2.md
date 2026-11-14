# Verifica della consegna 0.7.2

Data: 14 novembre 2026. Ambiente: Linux x86_64, Node 24.22.1. Base delle modifiche: sorgenti locali 0.7.1, commit `ac4e6f30eb7f4e118e0d291c69ff9bce46671041`. Il pacchetto include anche gli aggiornamenti precedenti rispetto alla base pubblicata 0.6.8.

## Risultati integrati

| Verifica | Esito |
|---|---|
| `npm run build --prefix native` | Passata: TypeScript, bridge, lettore PDF e copie dell’interfaccia |
| `npm run test:all --prefix native` | Passata, exit 0 |
| Test TypeScript/Vitest | 112 superati, 8 file |
| Test web, modello e protocollo con Node | 518 superati, nessun fallimento, cancellazione o skip |
| Integrazione dell’editor | 456 rendering di pannelli sulle 76 strip, passati |
| `npm test --prefix desktop` | 43 superati, nessun fallimento, cancellazione o skip |
| `npm run prepare:app --prefix desktop` | Passata: interfaccia e icona desktop preparate |
| Coerenza degli asset | 65 asset non HTML identici in ciascuna copia native, iOS e desktop; 3 wrapper HTML e 223 riferimenti verificati |
| Versione della consegna | 0.7.2; service worker e controllo offline v27 |
| `git diff --check` | Nessun errore |

Il totale è **673 test** (112 + 518 + 43). I 456 rendering dell’editor sono una prova d’integrazione separata e non vengono sommati come test unitari. Le verifiche puntuali svolte durante lo sviluppo sono già comprese nelle suite finali, quindi non vengono contate due volte.

La verifica degli asset comprende il nuovo `channel-chain.js`, i 59 file previsti dalla cache di ogni bundle e 25 metadati di release. Sono allineate anche le configurazioni Debug e Release del progetto Xcode; questo controllo dei file non è una compilazione iOS.

Ricevute del gate finale:

- [Build](verification/build-072.log).
- [Suite native/web e integrazione editor](verification/tests-072.log).
- [Suite desktop](verification/desktop-tests-072.log).
- [Preparazione desktop](verification/desktop-prepare-072.log).
- [Coerenza degli asset e delle versioni](verification/assets-072.log).

## Nove moduli e due viste

Compact ed Extended condividono le identità **Home, Pre, Gate, EQ, Comp, Insert 1, Insert 2, Send e Master**. Le prove controllano il numero e il significato delle caselle, i parametri principali di Pre/Send/Master, l’espansione indipendente e la disponibilità per CH, AUX, BUS, MAIN e MTX. I DCA conservano i controlli di gruppo.

I test Extended verificano che i fader, i pan e i mute siano gli stessi nodi del mixer precedente, ancora operabili. Coprono Cmd + =, selezione, SOF, ancoraggi, apertura degli slot WING, accesso al rack VST3 e conservazione dell’editor aperto fra le due viste. Gli aggiornamenti dei fader non ricostruiscono il rack.

Le prove Compact verificano che riordinare o espandere un modulo conservi i pannelli vicini, il focus e la sottoscrizione RTA dell’EQ. Gli eventi tardivi di un controllo rimosso non possono modificare il vecchio canale né quello selezionato successivamente.

## Riordino e TAP Send

L’helper condiviso copre tutte le 24 permutazioni di Gate/EQ/Comp/Insert 1 e gli otto TAP consentiti sui CH. Le prove distinguono l’ordine dei processori dal TAP comune alle mandate PRE: uno spostamento dei processori modifica soltanto `proc`; una scelta Send modifica soltanto `ptap`, conservando livelli, abilitazioni e destinazioni delle mandate.

Sono verificati PFL e AFL come scelte distinte, i TAP numerici 3/4/5, le famiglie con ordine fisso, le caselle non disponibili, trascinamento prima/dopo, navigazione da tastiera, annullamento con Escape e rifiuto del trasferimento fra canali.

I casi live usano Controller, Desk, mapping e Session reali con un driver simulato. Coprono letture mancanti, schema non compatibile o cambiato, sola lettura, cambio sessione, confronto dei valori prima dell’invio, readback non corrispondente, Undo e Redo. Un gesto non ancora confermato viene invalidato quando cambia il contesto. Un errore non provoca reinvio automatico o un rollback audio inventato.

File principali delle nuove prove: `tests/channel-chain-072.test.cjs`, `tests/compact-devices-072.test.cjs` e `tests/extended-view.test.cjs`.

## Letture live e delay

Le prove di `tests/device-live-guards-072.test.cjs` verificano che i selettori MAIN/ALT rimangano vuoti e disabilitati finché non sono note entrambe le foglie dell’assegnazione; una lettura fallita non espone il routing demo come dato del banco. La sola lettura e i flag `readOnly` disabilitano i comandi. Il ritorno a MAIN quando ALT globale è attivo modifica solo il canale richiesto. Icone locali e Solo safe rispettano le capacità effettivamente mappate.

Il riepilogo delle uscite usa solo porte con gruppo e indice confermati. Sono coperti patch ignoto, parziale e completo e aggiornamenti a Master aperto. Non viene eseguita una lettura indiscriminata di tutte le uscite per aprire questa card.

`tests/delay-wire-model-072.test.cjs` e `tests/delay-ui-072.test.cjs` verificano unità e valori raw live, percorso di input per CH/AUX e percorso di uscita per BUS/MAIN/MTX. Metri, piedi, millisecondi e campioni non vengono reinterpretati come millisecondi quando arrivano dalla WING. Un fixture con limite appropriato conferma campioni superiori a 3000 senza troncamento; questo non afferma che ogni firmware offra quello stesso limite.

Il cambio unità svuota prima le scritture precedenti, invia la sola unità, attende la conferma e forza la lettura dello schema sul ramo del delay. Modalità prima, durante e dopo la lettura devono coincidere. Il numero rimane vuoto e disabilitato finché definizione e valore non sono confermati. Sono coperti vecchie cache, eventi da campi rimossi, cambio remoto, risposta incompleta, mancata conferma e riprova esplicita senza reinvio del comando. Pre e Processing usano lo stesso renderer. La Demo conserva la precedente memorizzazione in millisecondi.

## Funzioni precedenti e limiti della verifica

Il gate completo conserva le prove precedenti di connessione, trasporto TCP/UDP, Controllo automatico, avviso Ricollega, RTA, macro, scene locali, catalogo dello Show aperto, importazione PDF live, DCA, rinomina e bridge USB/VST3. Le correzioni di questa consegna sono documentate nelle [note 0.7.2](RELEASE_0.7.2_MAC_M1.md); il dettaglio delle funzioni precedenti resta nel [report 0.7.1](VERIFICA_0.7.1.md).

Non è stato eseguito un nuovo benchmark delle prestazioni. La conservazione dei nodi e l’assenza di ricostruzioni durante i gesti sono verificate con prove di comportamento; non costituiscono una misura di FPS, velocità della rete o latenza audio.

Il codice DSP C++/JUCE e il protocollo dell’host VST3 restano quelli della precedente implementazione; qui cambiano i metadati di versione. Non è stata ripetuta la compilazione C++ Linux come prova della 0.7.2. Il workflow Mac conserva build e test dell’host prima del confezionamento ARM64.

**Non sono stati eseguiti** la compilazione e l’avvio dell’app macOS aggiornata, una verifica grafica in un browser reale, la connessione della nuova build alla WING fisica, l’audio USB, la misura della latenza del percorso completo o la prova dei plugin personali. Le prove DOM e con driver simulato non sostituiscono questi collaudi.

## Collaudo sul Mac e sulla console

1. Caricare i sorgenti seguendo [CARICA_SU_GITHUB.md](../CARICA_SU_GITHUB.md), completare il workflow Mac M1 e avviare l’app ottenuta.
2. Verificare le nove caselle in entrambe le viste, espansione, scorrimento, Cmd + = e accessibilità continua di fader, pan e mute alla risoluzione abituale.
3. Su un canale di prova, confrontare il riordino con la WING, usare Undo/Redo e controllare la differenza fra PFL e AFL con una mandata PRE. Verificare le posizioni fisse delle altre famiglie.
4. Verificare unità e valore del delay, anche cambiando unità dalla console, oltre a sorgenti MAIN/ALT e riepilogo delle uscite.
5. Confermare RTA, connessione, scene e percorso USB/VST3 nel normale progetto di lavoro.

Queste sono prove ancora da completare. Il pacchetto è consegnato come ZIP dei sorgenti per il caricamento a cura dell’utente; non è stato pubblicato su GitHub da questa sessione.
