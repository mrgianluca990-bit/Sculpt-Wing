# Meter di riduzione del guadagno — 0.6.5

I due piccoli indicatori GR della strip usano i valori **Gate gain** e **Dyn gain** ricevuti dalla WING. Sono distinti dai meter stereo di ingresso e uscita. Non si calcola la riduzione dalla differenza ingresso/uscita, dalla soglia impostata, dal fader o da un'animazione locale.

## Protocollo e unità

Il report standard di ciascuna strip CH, AUX, BUS, MAIN e MTX contiene otto parole signed a 16 bit big endian. La sesta è il gain meter del gate; l'ottava è quello della sezione dinamica. L'app usa già questo report: la 0.6.5 espone i due valori al mixer senza aggiungere un'altra sottoscrizione.

I livelli audio sono espressi in 1/256 dBFS. I due gain meter, invece, sono espressi in **unità del meter del modello**, con divisore 256. Il manuale specifica una scala di 60 dB per il modello standard `GATE`, mentre indica 20 dB per molti altri modelli senza fornire una tabella completa. Per questo la barra usa la frazione normalizzata riportata dal protocollo e non dichiara una conversione universale in dB.

- Raw 0: nessuna riduzione, barra vuota.
- Raw 128: metà della scala normalizzata del modello.
- Raw 256: scala normalizzata completa.
- Valori negativi: non vengono trasformati in riduzione positiva; la barra di GR rimane a zero.
- Valori oltre la scala: la barra si ferma al massimo, conservando il valore raw.

Il valore in dB è disponibile solo quando il modello `GATE` è stato effettivamente letto dal banco. I modelli rimasti nel progetto demo non autorizzano una conversione live. Gli altri modelli mantengono un valore in dB non disponibile, continuando a mostrare il proprio meter relativo reale.

## API dell'interfaccia

`SculptLive.gainReduction(stripId)` restituisce `null` se manca un pacchetto valido per la strip, la sessione non è collegata oppure il pacchetto ha più di 1,2 secondi. Altrimenti restituisce:

```js
{
  gate: { fraction: 0.5, raw: 128, db: null, enabled: null },
  comp: { fraction: 0.25, raw: 64, db: null, enabled: null }
}
```

`fraction` è compresa tra 0 e 1. `enabled` è `true` o `false` soltanto se il relativo `/gate/on` o `/dyn/on` è stato letto dal mixer; diversamente rimane `null`. Un bypass confermato azzera l'indicazione, conservando il valore raw a fini diagnostici. Ciascuna sezione può essere `null` separatamente se il suo valore non è valido o se si attende un pacchetto successivo a un cambio di modello/schema. Disconnessione e riconnessione cancellano i dati precedenti.

## Fonti e verifica

- [WING Remote Protocols 3.1, distribuito da Music Tribe](https://cdn-media.empowertribe.com/2106004e217b8eb2639d93672823eef5/WING_Remote-Protocols-3.1-03.pdf), **Channel 3: Metering**, pagina 98, e tabelle **Meter Data**.
- [Versione mantenuta dall'autore Patrick-Gilles Maillot](https://github.com/pmaillot/WingRemoteProtocols/blob/main/WingRemoteProtocols.md), sezioni **Channel 3: Metering** e **Meter Data**, consultate il 13 novembre 2026.

I test usano pacchetti binari indipendenti e un driver finto per verificare ordine delle parole, segno, normalizzazione, validità temporale, bypass, cambio modello, disconnessione e il passaggio attraverso l'API reale dell'app. La verifica con una WING fisica, inclusi i diversi modelli e firmware, resta da eseguire; i test non equivalgono a una calibrazione hardware di ogni processore.
