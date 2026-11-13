> Documento storico. Per preparare i sorgenti di questo repository prima di aprire Xcode, seguire la [guida iOS aggiornata](../native/README.md): `npm ci` e `npm run ios:sync` nella cartella `native`.

# Installare Sculpt Wing 0.5 su iPhone o iPad

## Contenuto della consegna

Questo è un progetto di sviluppo iOS con l’interfaccia completa già inclusa. Non è un file IPA firmato e non si installa toccando un link in Safari.

Servono un Mac con **Xcode 26 o successivo**, un account Apple configurato in Xcode e un iPhone/iPad con **iOS/iPadOS 15.4 o successivo**. La prima apertura può scaricare le dipendenze Swift; durante il successivo controllo WING non occorre Internet. Non sono inclusi certificati o account Apple.

Riferimento ambiente Capacitor 8: https://capacitorjs.com/docs/ios . Il target di questo progetto è 15.4 e la dipendenza Swift è fissata nel file Package.swift.

## Apertura e installazione

1. Estrai `Sculpt-Wing-0.5.zip` sul Mac.
2. Apri `native/APRI_SU_MAC.command`, oppure direttamente `native/ios/App/App.xcodeproj`.
3. Attendi il caricamento del pacchetto Swift Capacitor. La build web è già nella cartella `public`: non serve installare Node per questa prima apertura.
4. Seleziona il target **App**, poi **Signing & Capabilities**. Scegli il tuo **Team**. Se Xcode richiede un identificativo univoco, cambia `it.sculpt.control` con un bundle identifier del tuo account.
5. Collega l’iPhone/iPad, selezionalo come destinazione e premi **Run**. Completa sul dispositivo l’eventuale procedura Developer Mode/trust richiesta da iOS.
6. Al primo accesso alla WING, consenti a Sculpt Wing di usare la **rete locale**.

Se vuoi verificare la compilazione per il simulatore prima della firma, esegui `native/VERIFICA_IOS.command`. Il simulatore non sostituisce il test su iPhone/iPad e WING reali.

## Collegamento al banco

1. WING in Ethernet al router; iPhone/iPad sul Wi-Fi della stessa LAN.
2. Leggi l’IP del mixer nelle impostazioni di rete WING.
3. Apri Sculpt Wing, tocca **WING** nella barra inferiore e inserisci quell’IP.
4. Tocca **Connetti**. L’app controlla l’identità del banco e legge i valori. Non vengono caricati i fader della demo.
5. Quando compare **WING LIVE · LETTURA**, verifica nome, modello e firmware. Attiva **Controllo** per inviare modifiche.
6. Sposta un fader, verifica che il banco risponda, poi sposta lo stesso fader sulla WING e verifica l’aggiornamento nell’app.

L’app usa l’IP IPv4 privato indicato; non richiede discovery multicast. Se l’identità non risponde, verifica IP/LAN e permesso rete locale. Se legge ma non conferma le modifiche, verifica il Remote Lock TCP sul banco. La pagina connessione conserva il messaggio reale di errore ed esporta una diagnostica.

## Prova dei plugin

Apri **Menu → FX Rack → slot**, oppure **strip → EQ / Dinamica / Processo**. In modalità collegata la GUI attende i parametri dal banco. Cambia modello, attendi la nuova lettura e regola un valore. Controlla sia la modifica dal tablet sia quella dal mixer. Per i preset di fabbrica con LOAD viene inviato il trigger WING, seguito dalla rilettura; non si usa il profilo dimostrativo offline.

## Continuità e offline

Il bundle dell’app è locale. La rete del router serve al controllo del mixer, non a scaricare l’interfaccia. Se passi in background o perdi la rete, i comandi in attesa vengono annullati. Torna alla pagina Connessione e riconnetti; la sessione riparte in lettura.

Il sito web continua a funzionare come demo installabile sulla Home con il proprio cache offline. Questa installazione web non equivale all’app nativa con accesso TCP/UDP.
