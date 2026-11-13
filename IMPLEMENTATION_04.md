# Demo completa 0.4 — contratto di integrazione

Questo file coordina l’implementazione corrente. Root gestisce model.js, app.js, index.html, desk.js, shell.js, shell.css, io.js, PWA, documentazione e pubblicazione. I moduli devono usare lo stato comune; nessun localStorage separato.

## Ordine script

plugin-data.js → model.js → app.js → desk.js → shell.js → plugins.js → editor.js → io.js → systems.js → offline.js.

## Controller esistente, esteso da root

`window.SculptController`: getStrip(id), listStrips(), updateStrip(id, patch), getSend(source,target), setSend(source,target,patch), canSend(source,target), getSof(), setSof(id|null), selectStrip(id), subscribe(callback).

Estensioni: `getState()` restituisce lo stato in lettura; `transact(mutator, type='console')` esegue mutator(state), salva e notifica; `capture()` restituisce snapshot serializzato clonabile; `restore(snapshot)` ripristina uno snapshot; `toast(message)`.

## Desk comune implementato da root

`window.SculptDesk`:

- `get()` → stato console esteso, già inizializzato.
- `change(fn, type='console')` → fn(desk), salva e notifica attraverso Controller.
- `subscribe(fn)` → come controller.
- `processor(context)` → `{model, enabled, params, mix}`. Context: `{type:'strip',id:'ch-1',block:'eq'|'dyn'|'gate'|'filter'}` oppure `{type:'fx',slot:1}`.
- `setModel(context,id)`, `setParam(context,key,value)`, `enableProcessor(context,bool)`, `setProcessorMix(context,value)`.
- `assignFx(slot,stripId,position)` con position pre/post; garantisce assegnazione unica, sposta l’istanza precedente.
- `channel(id)` → `{source,altSource,useAlt,mode,delay,delayOn,lowCut,highCut,lowCutOn,highCutOn,lowSlope,highSlope,order,preFx,postFx,tap,solo,tags,icon}`.
- `patchChannel(id,patch)`.
- `source(id)` → sorgente con id/name/group/index/gain/phantom/trim/polarity/mute/mode/color.
- `sources()` → elenco di sorgenti disponibili.
- `patchSource(id,patch)`.
- `output(id)` e `patchOutput(id,sourceId)`; output = `{id,group,index,source}`.
- `setSolo(stripId,bool)`.
- `capture()` e `recall(snapshot,scope?,safes?)`; per scene usare Controller.capture/restore se non serve scope; root fornirà recall con scope.
- `effective(stripId)` → `{level,muted,solo}` considerando DCA e mute groups.

Forma di `desk` (root garantisce default; i moduli possono inizializzare campi propri se assenti tramite change):

`channels`: dizionario per tutti i 76 stripId. `processing`: per id→filter/eq/gate/dyn. `fx`: array 16 `{slot,model,enabled,params,mix,stripId,position}`. `sources`: dizionario. `outputs`: dizionario. `users`: array56 `{id,name,type,source,tap,side}`. `dca`: array16 `{id,name,level,mute,solo,members:[]}`. `muteGroups`: array8 `{id,name,on,members:[]}`. `automix`: `{x:{enabled,channels:[],weights:{}},y:{...}}`. `monitor`: array2 configurabile. `talkback`: `{source:'ch-40',a:{on,latch,level,targets:[]},b:{...}}`. `oscillators`: array2 `{on,mode,frequency,level,targets:[]}`. `scenes`: array di scene con snapshot. `safes`: array di stripId. `macros`: array8 `{id,name,actions:[]}`. `setup`: oggetto con `name,model,firmware,ip,dhcp,sampleRate,clock,usbChannels,card,module,stageConnect,networkMode,midiChannel,remoteLock,startMute`. `recorder`: `{sdA,sdB,usb,player}`, ciascuno con `state,position,startedAt,tracks,session,sessions:[]}`. `customControls`: array. `history`: array20 eventi.

## Catalogo (agente plugin)

`window.SculptCatalog`: `models` array, `list(context)` → modelli ammessi, `get(context, modelId)` → definizione `{id,name,category,parameters:[{key,label,type,min,max,step,options,unit,default,log,group}],theme,layout}`, `defaults(context,modelId)` → params. Può usare altri campi. Nessun riferimento a DOM o localStorage in plugin-data.js; export CommonJS per test quando disponibile.

## Shell e utilità root

`window.SculptUI.register(id,{title,subtitle,render(container,args)})` registra pagina, render può restituire cleanup. `open(id,args)`, `refresh()`, `close()`.

Helper: `el(tag,className,text)`, `button(text,action,className?)`, `card(title,...children)`, `grid(...children)`, `field(label,control)`, `select(label,value,options,onChange)` (options stringhe oppure {value,label}), `number(label,value,min,max,step,onChange,unit?)`, `toggle(label,value,onChange)`, `tabs(items,current,onChange)` (items {id,label}), `toast(message)`, `download(filename,text,mime?)`, `modal(title,content)` → `{dialog,close}`.

Classi condivise: desk-card, desk-grid, desk-toolbar, desk-row, desk-note, desk-list, desk-badge, desk-primary, desk-danger, desk-field, desk-input, desk-empty, desk-tabs, desk-table-wrap, desk-table.

## Moduli agenti

Plugin: `plugins.js`, `plugins.css`, `plugin-data.js` e script generazione/tests propri. Registra pagina `fx`. Espone `window.SculptFX.renderProcessor(container,context)` → cleanup e `open(context)` per aprire dialog. Editor dedicati per modello, parametri effettivi dalla documentazione, nessun DSP/audio. Registry 63 algoritmi rack più NONE/EXT e tutte le varianti strip; non limitarsi a mostrare elenco nomi.

Editor: `editor.js`, `editor.css`. Conserva `window.SculptEditor.open(id)` e close. Usa Desk e SculptFX. Editor completo con sorgente, preamp, processing, delay, insert, pan, mute/solo, routing, invii, DCA e tag. Non modifica file di altri agenti.

Systems: `systems.js`, `systems.css`, test propri se utili. Registra `groups`, `monitor`, `meters`, `scenes`, `recorder`, `setup`, `macros`; macro reali sullo stato demo, scene richiamabili, import/export locale. Integra solo stato Desk, no localStorage distinto. Espone `window.SculptSystems.runMacro(id)` e rendering macro footer gestito da root. Root fornisce API di scope/safes e test incrociati.

## Qualità

Italiano, pannelli scuri hardware, accento rosso, controlli touch accessibili. Funzioni effettive in simulazione; indicazione DEMO e meter simulati chiara. Nessuna falsa connessione/audio/firmware reale. Ricostruzioni visive adattate, non affermazioni di pixel parity con WING. Interfacce responsive anche 393×852 e 844×390. Gli editor vanno chiusi prima di cambiare pagina globale. Evitare rebuild del DOM ad ogni movimento range per non perdere focus e drag.
