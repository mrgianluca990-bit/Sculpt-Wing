# Sculpt Wing 0.7.2 · Nove moduli condivisi

Compact ed Extended usano le stesse nove pagine del canale: **Home, Pre, Gate, EQ, Comp, Insert 1, Insert 2, Send e Master**. Ordine, disponibilità e controlli seguono la famiglia di strip e i dati ricevuti dalla WING.

## Uso delle due viste

1. Apri un canale in **Compact**: le card occupano la riga opposta ai fader. Le card ridotte mostrano i parametri principali.
2. Premi **Espandi** sulla card desiderata: si allarga orizzontalmente per mostrare i controlli completi. Ogni card si espande e si riduce indipendentemente; scorri la fila per raggiungere le altre.
3. Usa **Cmd + =** per passare a **Extended**. I nove slot sopra il fader aprono le stesse card, mantenendo selezione ed espansione quando cambi vista.

**Fader, pan e mute restano disponibili**, insieme a pin, scorrimento e Sends on Fader. Extended conserva anche i quattro slot VST3 visibili e il comando **Rack**. I DCA mantengono i controlli di gruppo. I due Insert WING sono distinti dagli slot del rack VST3.

Home raccoglie identità e accesso ai gruppi; Pre offre ingresso, gain/trim e filtri disponibili; Master raccoglie livello, pan, mute e invii principali. EQ/RTA e Dynamics conservano i grafici ampi e i comandi Preset/Salva/Copia/Incolla/Reset nella testata.

## Riordinare i moduli WING

Sui **CH 1–40** puoi spostare **Gate, EQ, Comp e Insert 1**. Trascina la maniglia verso una posizione consentita oppure attivala con clic o tastiera e scegli la destinazione. L’indicatore mostra dove inserire il blocco. **Esc** annulla il gesto prima della conferma.

Home, Pre e Master sono pagine fisse; Master è la pagina finale dei controlli di livello, non un ulteriore processore. **Insert 2 resta dopo il fader.** AUX, BUS, MAIN e MTX mantengono il proprio ordine fisso. Le card non previste sono disabilitate: Gate fuori dai CH, Insert 2 sugli AUX e Send sulle matrici.

In live l’ordine visualizzato deriva dai valori confermati dalla console. Finché manca la lettura, compare **Ordine —** e il trascinamento resta disabilitato. Un cambio di sessione, permessi o schema invalida il gesto; i comandi pendenti non vengono ripetuti alla riconnessione.

Gli spostamenti passano dalla cronologia **Undo/Redo**. Anche l’annullamento live rispetta lo stato e i permessi attuali del banco. Riordinare conserva i nodi delle card, i controlli e il RTA; gli aggiornamenti dei fader non ricostruiscono il rack.

## Send: scegliere il punto delle mandate PRE

Sui CH, spostare **Send** modifica il **TAP condiviso dalle mandate PRE del canale**. La maniglia apre otto destinazioni, selezionabili anche da tastiera:

| TAP | Punto di prelievo |
|---|---|
| IN | Ingresso del canale |
| FILT | Dopo i filtri |
| 3 | Dopo il primo blocco del processing riordinabile |
| 4 | Dopo il secondo blocco |
| 5 | Dopo il terzo blocco |
| PFL | Prima del fader |
| AFL | Dopo il fader, prima di Insert 2 |
| POST | Dopo Insert 2 |

**PFL e AFL hanno quindi un comportamento diverso rispetto al fader.** Una mandata impostata su PRE usa questo TAP comune: scegliendo AFL o POST, il suo segnale segue il fader. I TAP 3/4/5 indicano posizioni; spostare un processore conserva il TAP scelto, senza ancorarlo automaticamente al nome del processore.

## Correzioni delle letture live

- I controlli attendono valori e definizioni reali prima di abilitare la modifica; i dati mancanti restano riconoscibili.
- **Uscite assegnate** distingue patch ancora da leggere, lettura parziale e assenza di assegnazioni fra le uscite effettivamente lette.
- La sorgente attiva considera anche **ALT globale** quando AUTO è abilitato. Home e Pre attendono le informazioni necessarie prima di mostrare sorgente e preamplificatore.
- Il delay live usa l’unità e i limiti letti dal banco. Cambiare unità invia soltanto quel comando, poi rilegge definizione e valore prima di riabilitare il numero. Lo stesso controllo è usato in Pre e Processing. La modalità Demo conserva i propri valori in millisecondi.

Le regole di riordino e dei TAP sono confrontate con il [manuale Behringer WING, capitolo 6](https://cdn.mediavalet.com/aunsw/musictribe/8MhCHVCI8U-PY0SGObZkMQ/zVZFahJCT0mx37Goswo6aQ/Original/Manual_WING%252C%2520WING%2520RACK%252C%2520WING%2520Compact.pdf) e con le definizioni `proc` e `ptap` dei [WING Remote Protocols](https://cdn.mediavalet.com/aunsw/musictribe/M7u1XZvRGkWxJAVwCKE5BA/7qQ-l43rn0SEnqyb5ZcETg/Original/WING%20Remote%20Protocols_V3.0.6-30.pdf). In connessione l’app usa le definizioni effettive del firmware collegato.

## Consegna e verifica su Mac M1

La consegna è uno **ZIP dei sorgenti**, da estrarre e caricare nel repository a cura dell’utente seguendo [CARICA_SU_GITHUB.md](../CARICA_SU_GITHUB.md). Da quei sorgenti si compila il pacchetto Mac ARM64.

Le verifiche automatiche locali riguardano codice, stato e DOM. **Compilazione e avvio della nuova app sul Mac, verifica grafica nel browser e collaudo con WING, USB e plugin reali restano da eseguire.** Per il percorso audio e le istruzioni di compilazione consulta [desktop/README.md](../desktop/README.md) e [audio-host/README.md](../audio-host/README.md).

Il [report di verifica 0.7.2](VERIFICA_0.7.2.md) riporta risultati, log e prove da completare sul sistema reale.
