# Verifica del pacchetto sorgente GitHub · 0.6.0

Preparazione del 13 novembre 2026, a partire dai sorgenti Sculpt Wing 0.6.0. La copia contiene i workflow GitHub e gli aggiornamenti di portabilità documentati qui.

## Controlli eseguiti sulla copia pulita

| Controllo | Risultato |
| --- | --- |
| Installazione `native` da lockfile | Completata con `npm ci` |
| Installazione `desktop` da lockfile | Completata con `npm ci`; download del runtime Electron saltato per questa prova dei sorgenti |
| TypeScript e bundle condiviso | `npm run build --prefix native` riuscito |
| Driver e interfaccia nativa | 99 test Vitest superati, 7 file |
| Modello e interfaccia web | 84 test Node superati |
| Editor canale | 456 rendering su 76 strip; mandate verticali, rinomina, identità live asincrona e sola lettura verificati |
| Shell e trasporto desktop | 17 test superati, incluse prove locali TCP/UDP |
| Copia dell’interfaccia desktop | `npm run prepare:app --prefix desktop` riuscito |
| Workflow GitHub | `actionlint` 1.7.12 eseguito senza errori; revisione indipendente di runner, comandi, firma e percorsi degli artifact |
| Script di supporto | Sintassi Python/Bash e messaggi per la preparazione di iOS verificati |

## Portabilità

- Il workflow e i sorgenti sono indipendenti dal progetto di hosting del sito: la sua configurazione `.openai` non fa parte dell’export.
- I lockfile non contengono dipendenze `file:`, `link:` o percorsi della macchina di sviluppo. Il repository non richiede symlink o submodule.
- Il generatore opzionale del catalogo riceve il riferimento WING con `--source FILE` o un argomento posizionale.
- La guida iOS e i comandi di apertura richiedono la preparazione con Capacitor prima di Xcode; non dichiarano presenti file generati che il repository non contiene.
- Il requisito Node desktop è allineato a Electron: almeno 22.12.0. GitHub Actions installa una versione aggiornata della serie 22.

## Prove ancora da eseguire

Il workflow è stato controllato localmente e non è ancora stato eseguito nel nuovo repository GitHub. Le build Mac e Windows effettive verranno prodotte dai rispettivi runner dopo il caricamento. Non è stata eseguita una compilazione Xcode per iOS né una prova con una WING fisica durante questa preparazione.

Le build Mac previste usano firma ad-hoc, senza Developer ID o notarizzazione. L’installer Windows previsto non è firmato. Questi aspetti sono separati dalla riuscita della compilazione e dalla verifica dei test.
