# Verifica della consegna 0.7.0

Data: 14 novembre 2026. Base: Sculpt-Wing 0.6.8, commit `7720343a47d660dd7ddacf249f4eef5ab219de9a`. Ambiente di verifica locale: Linux x86_64, Node 24.22.1.

## Risultati eseguiti

| Verifica | Esito |
|---|---|
| `npm run build --prefix native` | Passata: TypeScript, bundle del driver, reader PDF e copie degli asset |
| `npm run test:all --prefix native` | Passata, exit 0 |
| Test TypeScript/Vitest | 107 superati, 8 file |
| Test web/modello con Node | 411 superati, nessun fallimento o skip |
| Integrazione dell’editor | 456 rendering di pannelli sulle 76 strip; rinomina asincrona, readonly, sorgenti condivise/ALT e cleanup |
| `npm test --prefix desktop` | 41 superati, nessun fallimento o skip |
| `npm run prepare:app --prefix desktop` | Asset e icona del pacchetto desktop preparati |
| Workflow GitHub YAML | Sintassi valida; presenti test host nativo e passaggi ARM64 |
| Host nativo e fixture VST3 | Compilati e linkati completamente su Linux x86_64 con JUCE 9.0.5 |
| CTest host nativo | 3/3 superati: routing, self-test del binario, protocollo/scanner/plugin reale |
| Test DSP VST3 | Passato: scan/load, mono/stereo, gain, stato serializzato, bypass slot/rack, silenzio su stop/fault |
| Bridge JavaScript → processo nativo reale | Passato: metadata, modifica rack, salvataggio atomico, ripristino a motore fermo |
| `git diff --check` | Nessun errore |

I test JavaScript/TypeScript sono complessivamente **559**. Il rendering dell’editor e le prove native sono indicati separatamente per non sommare scenari diversi come se fossero la stessa misura.

Ricevute:

- [Suite interfaccia e protocollo](verification/tests-070.log).
- [Suite desktop](verification/desktop-tests-070.log).
- [Build frontend](verification/build-070.log).
- [CTest host nativo](verification/native-host-ctest-linux.log).
- [Bridge verso host nativo](verification/native-bridge-integration-linux.log).
- [Benchmark dei gesti live](verification/benchmark-live-review-070.json).

## Casi rilevanti coperti

**PDF live:** controller e Session reali con driver WING simulato; preflight di tutti i campi, CLINK ignoto o condiviso, sorgente incompleta, campi uguali a un valore locale non letto, proposta senza variazioni, quantizzazione numerica, scrittura, Undo, rifiuto, cambio sessione e report parziale. Il risultato non considera confermato un valore della demo mai ricevuto dalla console.

**Rinomina:** percorso dedicato, lettura asincrona indipendente dai processori, selezione MAIN/ALT e AUTO, nome della sorgente CLINK, aggiornamento condiviso, readonly, rifiuto e disconnessione. Le letture nuove usano foglie puntuali di `/io`.

**Scene:** apertura, aggiornamento, polling e GO senza richiesta automatica dell’intero `/$ctl/lib`; elenco opzionale non disponibile senza perdita del collegamento simulato. I download e i collegamenti bloccati non sospendono il socket. I timeout reali mantengono la chiusura della sessione e l’annullamento delle scritture, con diagnostica del parametro.

**DCA:** sincronizzazione iniziale di 16 DCA oltre alle 76 strip audio, membri da tag ricevuti, apertura diretta, rilettura esplicita, aggiornamento di nomi/livelli e comportamento in sola lettura. Nessun meter audio DCA simulato.

**Compact/Extended:** stessi fader e controlli, SOF, ordine e ancoraggi, scroll per vista/rail, continuità dell’editor e del testo in modifica, disponibilità degli slot, stato VST3 e scorciatoia Cmd + = senza doppio toggle o conflitto con lo zoom.

**Host VST3:** le prove native usano un effetto VST3 compilato, non una sostituzione JavaScript del processore. Lo scanner isolato carica la fixture e il test di protocollo verifica catalogo, rack, preset, collisioni di uscita, plugin mancanti, ripristino fermo e arresto. Il test DSP processa buffer audio sintetici. Non viene aperto un dispositivo audio fisico.

Il test diretto fra bridge desktop e binario è ripetibile dopo la compilazione:

```sh
node desktop/scripts/check-audio-host.cjs /percorso/al/binario/SculptWingAudio
```

Il workflow esegue questo passaggio anche sul runner Mac prima del pacchetto ARM64.

## Limiti della verifica

**Non eseguiti in questa consegna:** compilazione macOS ARM64, firma/verifica del bundle Mac prodotto, avvio su Mac M1, rendering grafico su Mac, collegamento fisico della build 0.7.0 alla WING, acquisizione USB reale, misura della latenza completa e compatibilità con i plugin personali dell’utente.

La verifica visiva tramite browser è rimasta indisponibile: l’avvio di Chromium locale è stato bloccato dall’ambiente e il browser cloud non raggiungeva il server del workspace. Le prove dell’interfaccia verificano struttura, stato ed eventi; non sostituiscono un controllo grafico del pacchetto Mac.

Il collegamento della precedente versione alla WING è stato confermato dall’utente. I problemi segnalati sono stati riprodotti o circoscritti nei percorsi software sopra, ma la causa esatta della disconnessione sul banco non è attestata da un log del dispositivo. Non si attribuisce quindi al banco una causa non osservata.

La pubblicazione del ramo GitHub è stata respinta dal controllo automatico perché richiede l’autorizzazione esplicita dell’utente alla pubblicazione dei sorgenti sul repository pubblico. I sorgenti, il workflow e il pacchetto locale sono pronti per tale autorizzazione; la build Mac non è stata avviata.

## Collaudo successivo sul Mac e sulla WING

1. Collegare il banco e verificare il completamento della lettura di 76 strip e 16 DCA. Confrontare nomi, livelli, mute e appartenenze con la console.
2. Aprire Scene, aggiornare la schermata, tornare al mixer e scegliere/esportare un file. Verificare che il collegamento rimanga attivo; se si interrompe, conservare il nuovo messaggio con percorso e timeout.
3. Attivare Controllo e rinominare un canale con identità locale, poi uno con CLINK e uno su sorgente ALT. Verificare nome sulla WING e comportamento dei canali che condividono la sorgente.
4. Importare una channel list, controllare l’anteprima e applicare un gruppo limitato di canali. Confrontare numero di parametri confermati, nomi, mute, fader e mandate; verificare il mantenimento di patch e preamplificatori.
5. Alternare Compact/Extended con Cmd + =; controllare ancoraggi, SOF, editor e DCA e confrontare la risposta ai fader con la versione precedente.
6. Configurare un loop USB e un solo effetto VST3 compatibile ARM64; verificare segnale, preset, bypass e ritorno alla WING. Misurare la latenza sul sistema effettivo prima di estendere il routing ad altri canali.

Questi punti restano prove da eseguire; non sono risultati già acquisiti.
