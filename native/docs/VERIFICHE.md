> Documento storico. Per preparare i sorgenti di questo repository prima di aprire Xcode, seguire la [guida iOS aggiornata](../README.md): `npm ci` e `npm run ios:sync` nella cartella `native`.

> Documento storico della versione 0.1.0. Per la consegna attuale 0.5 consultare `../../docs/VERIFICA_0.5.md` e `API-LIVE-0.5.md`. I conteggi e i limiti sotto descrivono il prototipo precedente.

# Verifiche della versione 0.1.0

Data: **13 novembre 2026**.

## Esito della consegna

Il progetto comprende sorgenti, test, progetto Xcode, plugin Swift locale, bundle web incorporato e demo HTML autonoma. Non contiene un binario iPad compilato o firmato. Non è stato collegato a una WING fisica.

| Verifica | Esito | Cosa dimostra |
|---|---|---|
| `npm test` | **71 test passati, 5 suite** | Comportamento software nei casi descritti sotto |
| `npm run build` | **Passata** | TypeScript di sorgenti/test e bundle Vite generato |
| `npm run demo:build` | **Passata** | HTML della demo completo, senza script o fogli di stile esterni |
| Demo compilata eseguita in jsdom | **Passata** | Avvio, ingresso in simulazione, 9 fader e passaggio in sola lettura, senza errori JavaScript |
| `cap sync ios` | **Passata** | Asset copiati nel progetto e dipendenza Swift Capacitor risolta nella configurazione |
| Hash degli asset web/copia iOS | **Identici** | Il progetto iOS contiene la stessa interfaccia compilata |
| Parsing progetto Xcode | **Passato** | File Swift presenti nella fase Sources del target App |
| Parsing plist/storyboard | **Passato** | XML valido, descrizione Rete locale e controller personalizzato presenti |
| Compilazione Swift con SDK Apple | **Non eseguita** | Xcode e SDK Apple non disponibili qui |
| Installazione e firma iPad | **Non eseguite** | Richiedono Mac, account di firma e dispositivo |
| Connessione WING Rack reale | **Non eseguita** | Richiede la console e il router del setup |
| Verifica visiva/touch in browser reale | **Non eseguita** | Il browser locale non si avvia in questo ambiente; il browser remoto non raggiunge il server locale |

La verifica della demo compilata usa un ambiente DOM, con lo script già incorporato eseguito come script locale. Non equivale a un rendering in Chrome/Safari, a una prova di moduli su `file://` o a una prova touch su iPad.

## Test automatici

| Suite | Test | Casi significativi |
|---|---:|---|
| `protocol-codec.test.ts` | 15 | Byte documentati, chunk spezzati, escape, definizioni, identità, livelli meter e pacchetti non validi |
| `protocol-client.test.ts` | 10 | Discovery senza hash fissi, aggiornamenti remoti, readback, timeout, heartbeat, riconnessione e rinnovo meter |
| `native-transport.test.ts` | 11 | Plugin Capacitor simulato, request/session ID, cancellazioni, eventi tardivi e ordine dei byte ricevuti all’avvio |
| `controller.test.ts` | 27 | Sola lettura, ambito delle mandate, dati sconosciuti, disconnessione, risultati obsoleti, meter scaduti, isolamento demo e validazione IP |
| `ui.test.tsx` | 8 | Interfaccia con store/demo reali: abilitazione, bus/banchi, on/off, rilascio/annullamento del fader e diagnostica |

I test del bridge TypeScript usano un plugin finto: non eseguono Network.framework. I test UI usano jsdom, con shim per `dialog.showModal` e pointer capture: non misurano layout, leggibilità, hit testing, multitouch, focus trap o comportamento nativo della tastiera/range.

Sono stati corretti e verificati due casi specifici di lifecycle: la chiusura tardiva della vecchia sessione che poteva interferire con la nuova e il possibile riordino dei primi chunk TCP durante la consegna del risultato di connessione al JavaScript.

## Ambiente utilizzato

- Linux, Node 24.22.1.
- TypeScript 5.8.3, Vite 6.4.6, Vitest 3.2.7.
- React / React DOM 19.3.1, Capacitor 8.6.2.
- Dipendenze npm fissate in `package-lock.json`; Swift Package Manager usa Capacitor **8.6.2 exact**.
- Target iPad, deployment target **15.4**, versione app **0.1.0**.

Il target 15.4 permette l’uso del dialog HTML nativo di WebKit. Il progetto Xcode mantiene la firma automatica, ma non contiene un Team, profili o certificati personali.

## Gate da eseguire sul Mac e sul setup

1. **Build nativa.** Esegui `bash VERIFICA_IOS.command` sul Mac. La build senza firma per simulatore verifica compilazione e linking; non dimostra l’installazione sul dispositivo. Registra versione Xcode e risultato.
2. **Avvio su iPad.** Imposta il Team in Xcode, seleziona l’iPad ed esegui Run. Verifica apertura dell’app, dialog, dimensioni dei controlli e orientamento.
3. **Rete locale.** Consenti il permesso iOS, collega mixer e iPad allo stesso router e inserisci l’IP reale. Verifica modello, firmware, nomi effettivi e livelli.
4. **Bidirezionalità.** Varia dalla console i parametri della vista corrente. Verifica aggiornamento nell’app senza premere refresh.
5. **Conferma delle scritture.** Prova livelli, on/off della mandata e master del bus. La tolleranza di rilettura di 0,11 dB è da controllare anche ai livelli più bassi e a −∞; una scrittura segnalata come non confermata potrebbe essere già arrivata alla console.
6. **Meter.** Verifica che arrivino i pacchetti UDP sul tablet, che IN e OUT corrispondano ai rispettivi meter e che un vecchio report non compaia dopo un cambio bus/banco.
7. **Sessione ferma.** Lascia l’app connessa almeno 30 secondi senza gesti, poi muovi un parametro dalla console. L’heartbeat deve mantenere la sessione e verificare le risposte.
8. **Interruzione e background.** Scollega Wi-Fi e sospendi l’app durante prove separate. Alla riconnessione controlla sola lettura iniziale, nuova discovery e assenza di replay dei comandi precedenti.
9. **Compatibilità specifica.** Annota firmware WING, versione iPadOS, router e presenza di altri controller. Estendi la prova a tutti i banchi e ai bus effettivamente usati nel tuo setup.

Questi gate restano **pendenti**. Il file diagnostico dell’app registra lo stato software della sessione; il campo `hardwareValidated: false` è volutamente fisso per questa release e non viene trasformato automaticamente in una certificazione di prova.
