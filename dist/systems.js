(function(root){
  'use strict';
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,Number(n)));
  const copy = value=>JSON.parse(JSON.stringify(value));
  const numeric = (value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const uid = prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
  const formatTime = seconds=>{const n=Math.max(0,Math.floor(numeric(seconds)));return String(Math.floor(n/3600)).padStart(2,'0')+':'+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
  function transportPosition(transport,now=Date.now()){
    let position=numeric(transport.position);
    if(['playing','recording'].includes(transport.state)&&transport.startedAt)position+=(now-transport.startedAt)/1000;
    if(transport.state==='playing'&&transport.loop&&transport.loopEnd>transport.loopStart&&position>=transport.loopEnd)position=transport.loopStart+(position-transport.loopStart)%(transport.loopEnd-transport.loopStart);
    const duration=numeric(transport.duration,3600);
    return clamp(position,0,transport.state==='recording'?86400:duration);
  }
  function validateProject(data){
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Il file non contiene un progetto Sculpt Wing.');
    const value=data.format==='sculpt-control-demo'?data.state:data.format==='sculpt-control-project'?data.snapshot:data;
    if(!value||!value.values||typeof value.values!=='object'||Array.isArray(value.values)||value.version!==3)throw new Error('Formato o versione del progetto non riconosciuti.');
    const ids=Object.keys(value.values);
    if(ids.length>76||ids.some(id=>{const match=/^(ch|aux|bus|main|mtx)-(\d+)$/.exec(id);return !match||Number(match[2])<1||Number(match[2])>({ch:40,aux:8,bus:16,main:4,mtx:8})[match[1]];}))throw new Error('Il progetto contiene canali non validi.');
    if(JSON.stringify(value).length>8000000)throw new Error('Il progetto supera il limite di 8 MB.');
    return JSON.parse(JSON.stringify(value),(key,v)=>['__proto__','prototype','constructor'].includes(key)?undefined:v);
  }
  const UI_ACTIONS=new Set(['menu','editor','sof','layer']);
  const isLocalAction=action=>UI_ACTIONS.has(action?.type)||action?.type==='wait';
  const MENU_PAGES=[['bank-menu','Menu del banco'],['mixer','Mixer'],['channel-list','Importa channel list PDF'],['connection','Connessione WING'],['wing','Parametri WING'],['io','I/O e routing'],['fx','Rack FX'],['fx-editor','Editor di un plugin FX'],['dca-bank','Banco DCA'],['groups','DCA / Mute Groups'],['monitor','Monitor / Talkback'],['meters','Meter / RTA'],['scenes','Scene / Library'],['recorder','Recorder / Player'],['setup','Setup'],['layers','Custom Layer'],['macros','Macro Sculpt'],['about','Informazioni']];
  const MENU_SECTIONS={io:[['inputs','Ingressi'],['sources','Sorgenti'],['outputs','Uscite'],['user','USER'],['devices','Dispositivi']],groups:[['dca','DCA'],['mute','Mute Groups'],['auto','Automix']],monitor:[['a','Monitor A'],['b','Monitor B'],['solo','Solo'],['talk','Talkback']],meters:[['levels','Meter'],['rta','RTA'],['osc','Oscillatori']],scenes:[['show','Show / scene'],['snippets','Snippet'],['presets','Preset canale'],['project','Progetto']],recorder:[['sdA','SD A'],['sdB','SD B'],['usb','USB REC'],['player','Player']],setup:[['audio','Audio / clock'],['hardware','Hardware'],['network','Rete'],['midi','MIDI / GPIO'],['controls','Custom Controls'],['layers','Layer'],['about','Sistema']]};
  const EDITOR_TABS=[['channel','Canale'],['processing','Processo'],['eq','EQ'],['dynamics','Dinamica'],['sends','Mandate'],['groups','Gruppi']];
  const validWingPath=path=>typeof path==='string'&&path.length<=256&&/^\/(?:[A-Za-z0-9_$-]+\/)*[A-Za-z0-9_$-]+$/.test(path)&&path.split('/').length<=17;
  const definitionSignature=definition=>JSON.stringify(definition?{type:definition.type,readOnly:!!definition.readOnly,min:definition.min,max:definition.max,step:definition.step,steps:definition.steps,maxLength:definition.maxLength,items:definition.items,options:definition.options,revision:definition.revision,path:definition.path}:null);
  function assertMacroSession(env){
    if(!env.live?.isLive?.())return;
    if(!env.live.isConnected?.()||!env.live.isWritable?.())throw new Error('Collega la WING e attiva Controllo prima della macro.');
    if(env.macroSessionToken!==undefined&&env.live.sessionToken?.()!==env.macroSessionToken)throw new Error('La sessione WING è cambiata: macro interrotta.');
  }
  function resolveValue(action,definition,current,wire=false){
    if(!definition||definition.readOnly)throw new Error('Parametro non disponibile o di sola lettura.');
    const mode=action.mode||'set';if(!['set','offset','toggle','trigger'].includes(mode))throw new Error('Operazione del parametro non valida.');
    const type=definition.type,enumerated=wire?[5,6].includes(type):type==='enum',boolean=wire?type===4&&definition.min===0&&definition.max===1:type==='boolean',string=wire?type===7:type==='string';
    const choices=wire?(definition.items||[]).map(item=>item.value):(definition.options||[]);
    if(wire&&(!Number.isInteger(type)||type<1||type>7))throw new Error('Il percorso scelto non è un parametro WING.');
    let value=action.value;
    if(mode==='toggle'){
      if(boolean)value=wire?(Number(current)?0:1):!current;
      else if(enumerated&&choices.length===2){const index=choices.findIndex(item=>Object.is(item,current));if(index<0)throw new Error('Il valore corrente non è disponibile.');value=choices[index?0:1];}
      else throw new Error('Alterna richiede un interruttore o un parametro con due valori.');
    }else if(mode==='offset'){
      if(string||enumerated||boolean||!Number.isFinite(Number(current))||!Number.isFinite(Number(value)))throw new Error('La variazione relativa richiede un parametro numerico.');
      value=Number(current)+Number(value);
    }else if(mode==='trigger'&&!wire)throw new Error('Usa il comando WING per le azioni del processore.');
    if(boolean){if(wire){if(value===true)value=1;if(value===false)value=0;if(value==='1'||value==='0')value=Number(value);if(value!==0&&value!==1)throw new Error('Scegli ON oppure OFF.');}else{if(![true,false,0,1,'true','false','on','off','0','1'].includes(value))throw new Error('Scegli ON oppure OFF.');value=[true,1,'true','on','1'].includes(value);}}
    else if(enumerated){const item=choices.find(item=>Object.is(item,value)||String(item)===String(value));if(item===undefined)throw new Error('Il valore non è presente nelle scelte del parametro.');value=item;}
    else if(string){if(typeof value!=='string')throw new Error('Il parametro richiede un testo.');const length=wire?new TextEncoder().encode(value).length:value.length;if(length>(definition.maxLength??(wire?0:256)))throw new Error('Il testo supera il limite del parametro.');}
    else{if(value===''||value===null||typeof value==='boolean'||!Number.isFinite(Number(value))||!Number.isFinite(Math.fround(Number(value))))throw new Error('Il parametro richiede un numero valido.');value=Number(value);if(wire&&type===4&&(!Number.isInteger(value)||value< -0x80000000||value>0x7fffffff))throw new Error('Il parametro richiede un intero a 32 bit.');if((definition.min!==undefined&&value<definition.min)||(definition.max!==undefined&&value>definition.max)||(wire&&type===3&&(value< -144||value>10)))throw new Error('Il valore supera i limiti del parametro.');}
    return value;
  }
  function validateWingParameter(action,env){
    if(!validWingPath(action.path))throw new Error('Scrivi il percorso completo di un parametro WING, ad esempio /ch/1/mute.');
    if(!env.live?.isLive?.())throw new Error('I parametri WING diretti richiedono una connessione al banco; la macro resta configurabile in demo.');
    assertMacroSession(env);
    const meta=env.live.metadata?.(action.path);
    if(!meta)throw new Error('Leggi il parametro WING prima di eseguire la macro.');
    if(action.mode!=='trigger'&&!env.live.hasValue?.(action.path))throw new Error('Il valore del parametro WING non è stato letto.');
    return {definition:meta,value:resolveValue(action,meta,env.live.value?.(action.path),true)};
  }
  function validateProcessorParameter(action,env){
    const ctx=action.context,processor=ctx&&env.desk.processor(ctx);
    if(!processor||!action.model||processor.model!==action.model)throw new Error('Il modello del processore è cambiato: riassegna il parametro della macro.');
    const catalog=env.catalog||root.SculptCatalog,base=catalog?.get(ctx,processor.model)?.parameters?.find(parameter=>parameter.key===action.key);
    if(!base)throw new Error('Parametro del processore non disponibile.');
    const live=env.live?.isLive?.();let definition=base;
    if(live){assertMacroSession(env);const remote=env.live.parameterDefinition?.(ctx,action.key);if(!remote||!remote.path||!env.live.hasValue?.(remote.path))throw new Error('Il parametro del processore non è stato letto dalla WING.');definition={...base,...remote};}
    return {definition,value:resolveValue(action,definition,processor.params?.[action.key]),processor};
  }
  function validateLocalAction(action,env){
    if(action.type==='menu'){
      const known=new Set([...MENU_PAGES.map(item=>item[0]),...(env.ui?.listPages?.()||[]).map(item=>item.id)]);
      if(!known.has(action.target))throw new Error('Menu non disponibile.');
      if(action.tab&&!MENU_SECTIONS[action.target]?.some(item=>item[0]===action.tab))throw new Error('Sezione del menu non disponibile.');
      if(action.target==='fx-editor'&&(!Number.isInteger(Number(action.slot))||Number(action.slot)<1||Number(action.slot)>16))throw new Error('Slot FX non valido.');
      if(action.target==='wing'&&action.path&&action.path!=='/'&&!validWingPath(action.path))throw new Error('Percorso WING non valido.');
    }else if(action.type==='editor'){
      if(!env.controller.getStrip(action.target)||!EDITOR_TABS.some(item=>item[0]===(action.tab||'channel')))throw new Error('Canale o sezione editor non disponibile.');
      if(action.tab==='dynamics'&&action.block&&(!['gate','dyn'].includes(action.block)||!env.desk.processor({type:'strip',id:action.target,block:action.block})))throw new Error('Il processore dinamico non è disponibile su questo canale.');
    }else if(action.type==='sof'){
      if(action.target!=='off'&&!['BUS','MTX'].includes(env.controller.getStrip(action.target)?.kind))throw new Error('Scegli un BUS o una matrice per SOF.');
    }else if(action.type==='layer'&&action.target!=='all'&&!env.desk.get().layers?.some(layer=>layer.id===action.target))throw new Error('Il Custom Layer non è più disponibile.');
  }
  function validateKnownAction(action,env){
    const C=env.controller,D=env.desk,state=D.get(),target=action.target;
    const number=(value,min,max,label)=>{if(value===''||value===null||typeof value==='boolean'||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw new Error(label+' non valido.');};
    const group=(key,max)=>{const id=Number(target);if(!Number.isInteger(id)||id<1||id>max||Array.isArray(state[key])&&!state[key].some(item=>String(item.id)===String(target)))throw new Error('Gruppo '+key+' non disponibile.');};
    if(['fader','mute','solo','send','sourceAlt'].includes(action.type)&&!C.getStrip(target))throw new Error('Canale non disponibile.');
    if(action.type==='sourceAlt'&&!/^(ch|aux)-/.test(target))throw new Error('La sorgente Main/Alt richiede un ingresso.');
    if(['fader','send','dca'].includes(action.type)){
      const modes=action.type==='fader'?['set','offset']:action.type==='send'?['set','toggle']:['set','mute'];
      if(action.mode&&!modes.includes(action.mode))throw new Error('Operazione del livello non valida.');
      if(action.mode!=='toggle'&&action.mode!=='mute')number(action.value,-90,10,'Livello');
      if(action.duration!==undefined)number(action.duration,0,30,'Durata fade');
    }
    if(action.type==='send'){
      if(!/^(?:bus-(?:[1-9]|1[0-6])|mtx-[1-8]|main-[1-4])$/.test(action.destination)||C.canSend&&C.canSend(target,action.destination)!==true||!C.getSend(target,action.destination))throw new Error('Mandata non disponibile.');
    }else if(action.type==='dca')group('dca',16);
    else if(action.type==='muteGroup')group('muteGroups',8);
    else if(action.type==='talkback'&&!['a','b'].includes(target))throw new Error('Talkback non valido.');
    else if(action.type==='monitorDim'&&![0,1].includes(Number(target)))throw new Error('Monitor non valido.');
    else if(action.type==='oscillator'&&![1,2].includes(Number(target)))throw new Error('Oscillatore non valido.');
    else if(action.type==='fxBypass'&&(!Number.isInteger(Number(target))||Number(target)<1||Number(target)>16||!D.processor({type:'fx',slot:Number(target)})))throw new Error('Slot FX non disponibile.');
    else if(action.type==='scene'&&!env.live?.isLive?.()&&!state.scenes?.some(scene=>scene.id===target))throw new Error('Scena non disponibile.');
    else if(action.type==='recorder'&&(!['sdA','sdB','usb','player'].includes(target)||!['play','record','pause','stop','rewind','marker'].includes(action.value||'play')))throw new Error('Comando recorder non disponibile.');
    else if(action.type==='wait')number(action.value,0,30,'Attesa');
    if(['mute','solo','muteGroup','talkback','monitorDim','sourceAlt','fxBypass','oscillator'].includes(action.type)){
      if(action.mode&&!['set','toggle'].includes(action.mode))throw new Error('Operazione ON/OFF non valida.');
      if(action.mode!=='toggle'&&![true,false,0,1,'on','off'].includes(action.value))throw new Error('Scegli ON, OFF oppure Alterna.');
    }
  }
  async function prepareActions(actions,env){
    if(!Array.isArray(actions)||actions.length>32)throw new Error('La macro può contenere al massimo 32 azioni.');
    const supported=new Set([...UI_ACTIONS,'fader','mute','solo','send','dca','muteGroup','talkback','monitorDim','sourceAlt','fxBypass','oscillator','scene','recorder','wait','processorParam','wingParameter']);
    for(const action of actions){if(!action||!supported.has(action.type))throw new Error('Tipo di azione non riconosciuto.');validateLocalAction(action,env);validateKnownAction(action,env);}
    const live=env.live,writing=actions.some(action=>!isLocalAction(action));env.preparedActions=new Map();
    if(live?.isLive?.()&&writing){env.macroSessionToken=live.sessionToken?.();assertMacroSession(env);}
    const done=new Set();
    const load=async(scope,args)=>{const key=scope+JSON.stringify(args||{});if(done.has(key))return;await live.loadScope(scope,args);done.add(key);assertMacroSession(env);};
    for(const action of actions){
      if(env.cancelled?.())throw new Error('Macro interrotta');
      if(isLocalAction(action))continue;
      if(action.type==='processorParam'){
        if(live?.isLive?.()){await live.ensureProcessor(action.context);assertMacroSession(env);}
        const result=validateProcessorParameter(action,env);env.preparedActions.set(action,{signature:definitionSignature(result.definition),model:result.processor.model});continue;
      }
      if(action.type==='wingParameter'){
        if(!live?.isLive?.())throw new Error('I parametri WING diretti richiedono una connessione al banco; la macro resta configurabile in demo.');
        if(!validWingPath(action.path))throw new Error('Percorso WING non valido.');
        await live.readNode(action.path,{force:true});assertMacroSession(env);const result=validateWingParameter(action,env);env.preparedActions.set(action,{signature:definitionSignature(result.definition)});continue;
      }
      if(!live?.isLive?.())continue;
      switch(action.type){
        case 'fader':case 'mute':case 'solo':if(!env.controller.getStrip(action.target))throw new Error('Canale non disponibile');break;
        case 'send':await load('sends',{fromId:action.target,targetId:action.destination});break;
        case 'dca':case 'muteGroup':await load('groups');break;
        case 'talkback':case 'monitorDim':case 'oscillator':await load('monitor');break;
        case 'sourceAlt':await load('strip',{id:action.target});break;
        case 'fxBypass':{
          const slot=Number(action.target);if(!Number.isInteger(slot)||slot<1||slot>16)throw new Error('Slot FX non valido');
          await live.ensureProcessor({type:'fx',slot});assertMacroSession(env);await load('inserts');
          const fx=env.desk.processor({type:'fx',slot});if(!fx?.stripId)throw new Error('FX '+slot+' non assegnato a un insert del banco.');
          await load('strip',{id:fx.stripId});break;
        }
        case 'scene':throw new Error('Le scene Sculpt locali non vengono richiamate sul banco. Usa lo Show WING.');
        case 'recorder':if(!env.nativeTransport)throw new Error('Trasporto recorder WING non disponibile per questa macro.');break;
        default:throw new Error('Azione macro senza collegamento WING verificato.');
      }
    }
  }
  async function executeAction(action,env){
    if(!action||typeof action!=='object')throw new Error('Azione non valida');
    if(['fader','send','dca','wait'].includes(action.type)&&!['toggle','mute'].includes(action.mode)&&!Number.isFinite(Number(action.value)))throw new Error('Valore numerico non valido');
    const C=env.controller,D=env.desk,check=()=>{if(env.cancelled?.())throw new Error('Macro interrotta');};
    check();
    const live=env.live?.isLive?.()===true,writing=!isLocalAction(action),failureBefore=live&&writing?env.live.snapshot().failureVersion:undefined;
    if(live&&writing)assertMacroSession(env);validateLocalAction(action,env);
    const accepted=(result,get,expected,strict=live)=>{if(result===false&&strict||get&&!Object.is(get(),expected))throw new Error('Il banco non ha accettato il controllo della macro.');};
    const target=action.target;
    const flag=(current)=>action.mode==='toggle'?!current:action.value===true||action.value==='on'||action.value===1;
    const fade=async(get,set,to,seconds)=>{
      const from=numeric(get()),duration=clamp(seconds||0,0,30)*1000;
      if(!duration){set(to);return;}
      const started=(env.now||Date.now)();
      let fraction=0;
      while(fraction<1){check();fraction=Math.min(1,((env.now||Date.now)()-started)/duration);set(Math.round((from+(to-from)*fraction)*10)/10);if(fraction<1)await(env.sleep||((ms)=>new Promise(resolve=>setTimeout(resolve,ms))))(40);}
    };
    switch(action.type){
      case 'menu':{
        const ui=env.ui||root.SculptUI;if(!ui)throw new Error('Interfaccia non disponibile.');
        if(action.target==='bank-menu'){ui.close?.();ui.showMenu();}
        else if(action.target==='channel-list'){ui.close?.();const importer=env.channelList||root.SculptChannelList;if(!importer?.open)throw new Error('Importatore PDF non disponibile.');importer.open();}
        else if(action.target==='dca-bank'){ui.close?.();const bank=env.dcaBank||root.SculptDcaBank;if(!bank?.open)throw new Error('Banco DCA non disponibile.');bank.open();}
        else if(action.target==='fx-editor'){ui.close?.();const fx=env.fx||root.SculptFX;if(!fx?.open)throw new Error('Editor FX non disponibile.');fx.open({type:'fx',slot:Number(action.slot)});}
        else if(action.target==='wing'&&action.path){if(!env.live?.openExplorer)throw new Error('Parametri WING non disponibili.');env.live.openExplorer(action.path);}
        else ui.open(action.target,action.tab?{tab:action.tab}:undefined);
        break;
      }
      case 'editor':{const editor=env.editor||root.SculptEditor;if(!editor?.openSection||editor.openSection(target,action.tab||'channel',{block:action.block})===false)throw new Error('Editor del canale non disponibile.');break;}
      case 'sof':{env.ui?.close?.();if(C.setSof(target==='off'?null:target)===false)throw new Error('Vista SOF non disponibile.');break;}
      case 'layer':{const layer=target==='all'?null:D.get().layers.find(item=>item.id===target);const result=D.change(state=>{state.activeLayer=layer?.id||null;},'layer');if(result===false)throw new Error('Custom Layer non disponibile.');C.showLayer?.(layer?D.layerRows(layer):null,layer?.name||'LAYER');env.ui?.close?.();break;}
      case 'processorParam':{
        const result=validateProcessorParameter(action,env),prepared=env.preparedActions?.get(action);
        if(env.preparedActions&&(!prepared||prepared.signature!==definitionSignature(result.definition)||prepared.model!==result.processor.model))throw new Error('Lo schema del processore è cambiato: esegui di nuovo la macro.');
        if(D.setParam(action.context,action.key,result.value)===false)throw new Error('Il banco non ha accettato il parametro del processore.');break;
      }
      case 'wingParameter':{
        const result=validateWingParameter(action,env),prepared=env.preparedActions?.get(action);
        if(env.preparedActions&&(!prepared||prepared.signature!==definitionSignature(result.definition)))throw new Error('Lo schema WING è cambiato: esegui di nuovo la macro.');
        if(await env.live.write(action.path,result.value,{trigger:action.mode==='trigger',expectedSchema:copy(result.definition)})===false)throw new Error('La WING non ha accettato il parametro.');break;
      }
      case 'fader':{
        const strip=C.getStrip(target);if(!strip)throw new Error('Canale non disponibile');
        const to=clamp(action.mode==='offset'?strip.level+numeric(action.value):numeric(action.value),-90,10);
        await fade(()=>C.getStrip(target).level,value=>accepted(C.updateStrip(target,{level:value}),()=>C.getStrip(target).level,value,true),to,action.duration);break;
      }
      case 'mute':{const strip=C.getStrip(target);if(!strip)throw new Error('Canale non disponibile');const value=flag(strip.mute);accepted(C.updateStrip(target,{mute:value}),()=>C.getStrip(target).mute,value,true);break;}
      case 'solo':{const channel=D.channel(target);if(!channel)throw new Error('Canale non disponibile');const value=flag(channel.solo);accepted(D.setSolo(target,value),()=>D.channel(target).solo,value);break;}
      case 'send':{
        const send=C.getSend(target,action.destination);if(!send)throw new Error('Mandata non valida');
        if(action.mode==='toggle'){const value=!send.on;accepted(C.setSend(target,action.destination,{on:value}),()=>C.getSend(target,action.destination).on,value,true);}
        else{accepted(C.setSend(target,action.destination,{on:true}),()=>C.getSend(target,action.destination).on,true,true);await fade(()=>C.getSend(target,action.destination).level,value=>accepted(C.setSend(target,action.destination,{level:value}),()=>C.getSend(target,action.destination).level,value,true),clamp(action.value,-90,10),action.duration);}break;
      }
      case 'dca':{const index=D.get().dca.findIndex(g=>String(g.id)===String(target));if(index<0)throw new Error('DCA non disponibile');if(action.mode==='mute'){const value=flag(D.get().dca[index].mute);accepted(D.change(s=>{s.dca[index].mute=value;}),()=>D.get().dca[index].mute,value);}else await fade(()=>D.get().dca[index].level,value=>accepted(D.change(s=>{s.dca[index].level=value;}),()=>D.get().dca[index].level,value),clamp(action.value,-90,10),action.duration);break;}
      case 'muteGroup':{const index=D.get().muteGroups.findIndex(g=>String(g.id)===String(target));if(index<0)throw new Error('Gruppo non disponibile');const value=flag(D.get().muteGroups[index].on);accepted(D.change(s=>{s.muteGroups[index].on=value;}),()=>D.get().muteGroups[index].on,value);break;}
      case 'scene':{if(live)throw new Error('Le scene Sculpt locali non vengono inviate alla WING.');const scene=D.get().scenes.find(s=>s.id===target);if(!scene)throw new Error('Scena non disponibile');D.recall(scene.snapshot,scene.scope,D.get().safes);D.change(s=>s.activeScene=target);break;}
      case 'talkback':{if(!['a','b'].includes(target))throw new Error('Talkback non valido');const value=flag(D.get().talkback[target].on);accepted(D.change(s=>{s.talkback[target].on=value;}),()=>D.get().talkback[target].on,value);break;}
      case 'monitorDim':{const index=Number(target);if(![0,1].includes(index))throw new Error('Monitor non valido');const value=flag(D.get().monitor[index].dim);accepted(D.change(s=>{s.monitor[index].dim=value;}),()=>D.get().monitor[index].dim,value);break;}
      case 'oscillator':{const index=Number(target)-1;if(![0,1].includes(index))throw new Error('Oscillatore non valido');const value=flag(D.get().oscillators[index].on);accepted(D.change(s=>{s.oscillators[index].on=value;}),()=>D.get().oscillators[index].on,value);break;}
      case 'sourceAlt':{const channel=D.channel(target);if(!channel)throw new Error('Canale non disponibile');const value=flag(channel.useAlt);accepted(D.patchChannel(target,{useAlt:value}),()=>D.channel(target).useAlt,value);break;}
      case 'fxBypass':{const slot=Number(target);if(!Number.isInteger(slot)||slot<1||slot>16)throw new Error('Slot FX non valido');const ctx={type:'fx',slot},value=flag(D.processor(ctx).enabled);accepted(D.enableProcessor(ctx,value),()=>D.processor(ctx).enabled,value);break;}
      case 'recorder':{if(!['sdA','sdB','usb','player'].includes(target))throw new Error('Recorder non disponibile');const transport=live?env.nativeTransport:env.transport;if(!transport||await transport(target,action.value||'play')===false)throw new Error('Trasporto non disponibile nel profilo corrente');break;}
      case 'wait':await(env.sleep||((ms)=>new Promise(resolve=>setTimeout(resolve,ms))))(clamp(action.value||0,0,30)*1000);check();break;
      default:throw new Error('Tipo di azione non riconosciuto');
    }
    if(live&&writing){await env.live.settled();check();assertMacroSession(env);const snapshot=env.live.snapshot();if(!env.live.isConnected()||!env.live.isWritable())throw new Error('Connessione o controllo WING interrotto durante la macro.');if(snapshot.failureVersion!==failureBefore)throw new Error(snapshot.failure||'La WING non ha confermato un comando della macro.');}
    return action.type;
  }
  const Pure={transportPosition,formatTime,validateProject,executeAction,prepareActions,isLocalAction,validateWingParameter,validateProcessorParameter,MENU_PAGES,MENU_SECTIONS,EDITOR_TABS};
  if(typeof module!=='undefined'&&module.exports)module.exports=Pure;
  if(!root.document)return;
  const C=()=>root.SculptController,D=()=>root.SculptDesk,U=()=>root.SculptUI;
  const L=()=>root.SculptLive,live=()=>L()?.isLive?.()===true;
  const h=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const btn=(text,action,cls='')=>{const n=h('button','sys-button '+cls,text);n.type='button';if(action)n.addEventListener('click',action);return n;};
  const note=text=>h('p','desk-note sys-note',text);
  const row=(...children)=>{const n=h('div','sys-row');n.append(...children.filter(Boolean));return n;};
  const grid=(...children)=>{const n=h('div','sys-grid');n.append(...children.filter(Boolean));return n;};
  const card=(title,...children)=>{const n=h('section','sys-card');if(title)n.append(h('h3','sys-card-title',title));n.append(...children.filter(Boolean));return n;};
  const field=(label,control)=>{const n=h('label','sys-field');n.append(h('span','sys-label',label),control);return n;};
  const options=items=>items.map(item=>typeof item==='object'?item:{value:item,label:item});
  const textInput=(label,value,action,placeholder='')=>{const input=h('input','sys-input');input.type='text';input.value=value??'';input.placeholder=placeholder;input.maxLength=80;input.setAttribute('aria-label',label);const commit=()=>action(input.value.trim());input.addEventListener('change',commit);input.addEventListener('keydown',e=>{if(e.key==='Enter'){commit();input.blur();}});return field(label,input);};
  const select=(label,value,items,action)=>{const input=h('select','sys-input');input.setAttribute('aria-label',label);for(const item of options(items)){const option=h('option','',item.label);option.value=String(item.value);input.append(option);}input.value=String(value??'');input.addEventListener('change',()=>action(input.value));return field(label,input);};
  const toggle=(label,value,action)=>{const b=btn(label,()=>{const old=b.getAttribute('aria-pressed')==='true';value=!old;b.setAttribute('aria-pressed',String(value));if(action(value)===false)b.setAttribute('aria-pressed',String(old));},'sys-toggle');b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(!!value));return b;};
  function range(label,value,min,max,step,action,unit=''){
    const wrapper=h('div','sys-param'),top=h('div','sys-param-top'),out=h('output','sys-value');
    const show=v=>numeric(v)<=-89&&unit==='dB'?'−∞ dB':Number(v).toFixed(step<1?1:0)+(unit?' '+unit:'');
    out.textContent=show(value);top.append(h('span','sys-label',label),out);
    const line=h('div','sys-param-controls'),input=h('input','sys-range'),num=h('input','sys-input sys-number');
    input.type='range';input.min=min;input.max=max;input.step=step;input.value=value;input.setAttribute('aria-label',label+' — cursore');
    num.type='number';num.min=min;num.max=max;num.step=step;num.value=value;num.inputMode=step<1?'decimal':'numeric';num.setAttribute('aria-label',label+(unit?' in '+unit:''));
    const apply=v=>{if(!Number.isFinite(Number(v)))return;const before=input.value,normalized=Math.round(clamp(v,min,max)/step)*step;input.value=normalized;num.value=Number(normalized.toFixed(3));out.textContent=show(normalized);if(action(normalized)===false){input.value=before;num.value=before;out.textContent=show(before);}};
    input.addEventListener('input',()=>apply(input.value));num.addEventListener('change',()=>apply(num.value));num.addEventListener('blur',()=>{if(num.value===''){num.value=input.value;return;}apply(num.value);});num.addEventListener('keydown',e=>{if(e.key==='Enter'){apply(num.value);num.blur();}});
    line.append(input,num);wrapper.append(top,line);return wrapper;
  }
  function tabs(items,active,change){const n=h('nav','sys-tabs');n.setAttribute('aria-label','Sezioni');for(const item of items){const b=btn(item.label,()=>change(item.id));b.setAttribute('aria-pressed',String(active===item.id));n.append(b);}return n;}
  const label=s=>s.kind+' '+String(s.number).padStart(2,'0')+' · '+s.name;
  const strips=()=>C().listStrips();
  const stripChoices=()=>strips().map(s=>({value:s.id,label:label(s)}));
  const targetChoices=()=>strips().filter(s=>['BUS','MTX','MAIN'].includes(s.kind)).map(s=>({value:s.id,label:label(s)}));
  const log=message=>D().change(d=>{d.history=d.history||[];d.history.unshift({time:Date.now(),message});d.history=d.history.slice(0,30);});
  const toast=message=>U().toast(message);
  const changed=(fn,notice)=>{const result=D().change(fn);if(result!==false&&notice)toast(notice);return result;};
  function wireControl(control,path,from=value=>value){
    if(!live())return control;
    control.dataset.wingPath=path;
    control.wingSync=()=>{
      const available=L()?.hasValue?.(path),meta=L()?.metadata?.(path),enabled=available&&L()?.isWritable?.()&&!meta?.readOnly;
      const inputs=control.matches('input,select,button')?[control]:[...control.querySelectorAll('input,select,button')];
      for(const input of inputs)input.disabled=!enabled;
      control.title=!available?'Parametro non letto dalla WING':meta?.readOnly?'Sola lettura':!L()?.isWritable?.()?'Controllo WING non attivo':'';
      if(control===document.activeElement||control.contains(document.activeElement))return;
      const raw=available?L().value(path):undefined,value=available?from(raw):undefined;
      for(const input of inputs){if(input.tagName==='BUTTON'&&input.hasAttribute('aria-pressed'))input.setAttribute('aria-pressed',String(!!Number(value)));else if(['INPUT','SELECT'].includes(input.tagName))input.value=value===undefined?'':String(value);}
      const output=control.querySelector('output');if(output){const unit=output.textContent.match(/\s(dB|Hz|ms|s|%)$/)?.[1]||'';output.textContent=value===undefined?'—':Number(value)<=-90&&unit==='dB'?'−∞ dB':Number(value).toLocaleString('it-IT',{maximumFractionDigits:2})+(unit?' '+unit:'');}
    };
    control.wingSync();return control;
  }
  const wingButton=path=>btn('Parametri WING ↗',()=>L()?.openExplorer?.(path),'sys-small');
  const writeButton=(text,action,cls='')=>{const button=btn(text,action,cls);if(live())button.disabled=!L().isWritable();return button;};
  const selection={groups:'dca',monitor:'a',meters:'levels',scenes:'show',recorder:'sdA',setup:'audio',macro:1};
  let currentPage=null,selectedScene=null,selectedSnippet=null,selectedPreset=null,projectCandidate=null,importUndo=null,activeMacro=null,macroUndo=null;
  const SCOPES=[['levels','Livelli / mute'],['processing','Processing / FX'],['routing','I/O e mandate'],['groups','DCA e gruppi'],['monitor','Monitor / talkback'],['recorder','Recorder'],['setup','Setup']];
  let newSceneScope=['levels','processing','routing','groups','monitor'];
  function ensureState(){
    D().change(s=>{
      s.dca=s.dca||[];while(s.dca.length<16)s.dca.push({id:s.dca.length+1,name:'DCA '+(s.dca.length+1),level:0,mute:false,solo:false,members:[]});
      s.muteGroups=s.muteGroups||[];while(s.muteGroups.length<8)s.muteGroups.push({id:s.muteGroups.length+1,name:'Mute '+(s.muteGroups.length+1),on:false,members:[]});
      s.automix=s.automix||{};for(const g of ['x','y'])s.automix[g]=Object.assign({enabled:false,channels:[],weights:{}},s.automix[g]||{});
      s.monitor=s.monitor||[];for(let i=0;i<2;i++)s.monitor[i]=Object.assign({name:'Monitor '+(i?'B':'A'),source:'main-1',level:-12,pan:0,width:100,mute:false,mono:false,dim:false,dimLevel:-20,polarity:false,delay:0,delayOn:false,limiter:true,limit:-3,eqOn:false,eq:[0,0,0,0,0,0,0,0],hpf:20,lpf:20000},s.monitor[i]||{});
      for(const monitor of s.monitor)if(/^(CH|AUX|BUS|MAIN|MTX):/.test(monitor.source))monitor.source=monitor.source.replace(':','-').toLowerCase();
      s.systemsVersion=1;
      s.solo=Object.assign({mode:'PFL',exclusive:false,follow:false,dimOnSolo:false,soloTrim:0},s.solo||{});
      s.talkback=Object.assign({source:'ch-40',dim:true},s.talkback||{});for(const key of ['a','b'])s.talkback[key]=Object.assign({on:false,latch:false,mode:'PUSH',level:-12,targets:[],levels:{}},s.talkback[key]||{});
      s.oscillators=s.oscillators||[];for(let i=0;i<2;i++)s.oscillators[i]=Object.assign({on:false,mode:'SINE',frequency:1000,level:-30,targets:[]},s.oscillators[i]||{});
      s.meterSettings=Object.assign({family:'CH',tap:'POST',hold:true,source:'ch-1',decay:'MED',freeze:false,range:80,peakRevision:0},s.meterSettings||{});
      s.scenes=s.scenes||[];s.snippets=s.snippets||[];s.stripPresets=s.stripPresets||[];s.safes=s.safes||[];s.showName=s.showName||'Sculpt Live';s.activeScene=s.activeScene||null;
      s.recorder=s.recorder||{};for(const id of ['sdA','sdB','usb','player'])s.recorder[id]=Object.assign({state:'stopped',position:0,startedAt:null,tracks:id.startsWith('sd')?32:2,session:id==='player'?'Playback demo':'Sessione 01',sessions:[],markers:[],duration:600,loop:false,loopStart:0,loopEnd:60,repeat:false,bitDepth:24,autoAlt:false},s.recorder[id]||{});
      s.macros=s.macros||[];while(s.macros.length<16)s.macros.push({id:s.macros.length+1,name:'Macro '+(s.macros.length+1),actions:[]});
      s.customControls=s.customControls||[];if(!s.customControls.length)for(let i=0;i<12;i++)s.customControls.push({id:i+1,name:i<8?'Tasto '+(i+1):'Encoder '+(i-7),type:i<8?'button':'encoder',macroId:1,target:'ch-'+(i<8?i+1:i-7),value:0});
      s.gpio=s.gpio||Array.from({length:4},(_,i)=>({id:i+1,name:'GPIO '+(i+1),mode:'PUSH',macroId:1,delay:0}));
      s.layers=s.layers||[];s.history=s.history||[];s.setup=s.setup||{};
      Object.assign(s.setup,Object.assign({name:'Sculpt WING Rack',model:'RACK',firmware:'3.1.2',ip:'192.168.1.100',dhcp:true,sampleRate:48000,clock:'INTERNAL',usbChannels:48,card:'WLIVE',module:'DANTE',stageConnect:{inputs:16,outputs:16,mode:'AUTO',power:true},networkMode:'SWITCH',midiChannel:1,remoteLock:false,startMute:false,midiInput:'USB+DIN',midiOut:true,scenePc:true,haRemoteA:true,haRemoteB:true,haRemoteC:true},s.setup));
    },'systems-init');
  }
  function openMembership(title,members,onChange,allowed=strips(),limit=Infinity){
    const content=h('div','sys-membership'),search=h('input','sys-input'),list=h('div','sys-member-list');search.placeholder='Cerca canale, bus, nome…';search.setAttribute('aria-label','Cerca membri');
    const count=h('span','sys-badge'),selected=new Set(members||[]),cards=[];
    const updateCount=()=>count.textContent=selected.size+' assegnati';
    const commit=()=>{onChange([...selected]);updateCount();};
    const tools=row(btn('Tutti',()=>{selected.clear();allowed.slice(0,limit).forEach(s=>selected.add(s.id));cards.forEach(c=>c.input.checked=selected.has(c.id));commit();}),btn('Nessuno',()=>{selected.clear();cards.forEach(c=>c.input.checked=false);commit();}),count);
    for(const s of allowed){const item=h('label','sys-member'),check=h('input');check.type='checkbox';check.checked=selected.has(s.id);check.setAttribute('aria-label','Assegna '+label(s));const chip=h('i','sys-strip-chip');chip.style.backgroundColor=s.color;item.append(check,chip,h('span','',label(s)));check.addEventListener('change',()=>{if(check.checked&&selected.size>=limit){check.checked=false;toast('Massimo '+limit+' canali disponibili');return;}if(check.checked)selected.add(s.id);else selected.delete(s.id);commit();});list.append(item);cards.push({id:s.id,item,input:check,text:label(s).toLowerCase()});}
    search.addEventListener('input',()=>cards.forEach(c=>c.item.hidden=!c.text.includes(search.value.toLowerCase())));updateCount();content.append(tools,search,list);
    const modal=U().modal(title,content);return modal;
  }
  function spill(title,members){
    const content=h('div','sys-spill');
    if(!members?.length)content.append(note('Nessun canale assegnato.'));
    for(const id of members||[]){const strip=C().getStrip(id);if(!strip)continue;const head=row(h('strong','',label(strip)),btn('Editor',()=>{modal.close();U().close();root.SculptEditor.open(id);},'sys-small'));
      const base=root.SculptWingMap?.stripPath(id);content.append(card('',head,wireControl(range('Livello '+strip.kind+' '+strip.number,strip.level,-90,10,.1,value=>C().updateStrip(id,{level:value}),'dB'),base+'/fdr',v=>Math.max(-90,v)),row(wireControl(toggle('Mute '+strip.kind+' '+strip.number,strip.mute,value=>C().updateStrip(id,{mute:value})),base+'/mute'),wireControl(toggle('Solo '+strip.kind+' '+strip.number,D().channel(id)?.solo,value=>D().setSolo(id,value)),base+'/$solo'))));
    }
    const modal=U().modal(title,content);
  }
  const LAYER_STORAGE='sculpt-wing-layers-v1';
  let layerSignature='';
  function syncLayer(){
    const d=D().get(),layer=d.layers.find(item=>item.id===d.activeLayer),rows=layer?D().layerRows(layer):null;
    const signature=JSON.stringify({id:layer?.id||null,name:layer?.name||'',rows});
    // Only local layout is persisted here. Live WING values are never saved.
    try{root.localStorage?.setItem(LAYER_STORAGE,JSON.stringify({version:1,layers:d.layers,activeLayer:layer?.id||null}));}catch{}
    if(signature===layerSignature)return;
    layerSignature=signature;
    C().showLayer?.(rows,layer?.name||'LAYER');
  }
  function restoreLayerPreference(){
    try{
      const saved=JSON.parse(root.localStorage?.getItem(LAYER_STORAGE)||'null');
      if(saved?.version===1&&Array.isArray(saved.layers))D().change(d=>{d.layers=saved.layers;d.activeLayer=saved.activeLayer;D().normalizeLayers(d);},'layer-layout');
    }catch{}
  }
  function openLayerEditor(id,onChange){
    const content=h('div','sys-layer-editor');
    const paint=()=>{
      const layer=D().get().layers.find(item=>item.id===id);content.replaceChildren();if(!layer)return;
      const rows=D().layerRows(layer);
      content.append(note('Scegli i canali e il loro ordine in ciascuna riga. Puoi mettere ingressi, bus, matrici e master in entrambe le righe.'));
      const apply=next=>{D().setLayerRows(id,next);paint();onChange();};
      for(const [key,title,other]of [['top','Riga 1 · superiore','bottom'],['bottom','Riga 2 · inferiore','top']]){
        const bank=h('section','sys-layer-row'),heading=h('div','sys-layer-row-heading');bank.dataset.layerRow=key;
        const add=btn('Aggiungi canali',()=>openMembership(title,rows[key],members=>{const current=D().layerRows(D().get().layers.find(item=>item.id===id));current[key]=members;current[other]=current[other].filter(stripId=>!members.includes(stripId));apply(current);}),'sys-small');
        add.setAttribute('aria-label','Assegna canali alla '+title.toLowerCase());
        heading.append(h('h3','',title),h('span','sys-badge',rows[key].length+' strip'),add);bank.append(heading);
        const list=h('ol','sys-layer-slots');list.setAttribute('aria-label',title+' — ordine da sinistra a destra');
        for(const [index,stripId]of rows[key].entries()){
          const strip=C().getStrip(stripId),slot=h('li','sys-layer-slot'),caption=h('strong','',label(strip));slot.style.setProperty('--layer-color',strip.color);slot.dataset.stripId=stripId;
          slot.append(h('span','sys-layer-position',String(index+1).padStart(2,'0')),caption);
          const controls=h('div','sys-layer-slot-actions');
          const reorder=(direction)=>{const current=D().layerRows(D().get().layers.find(item=>item.id===id));moveItem(current[key],index,direction);apply(current);};
          const left=btn('←',()=>reorder(-1),'sys-small'),right=btn('→',()=>reorder(1),'sys-small');
          left.disabled=index===0;right.disabled=index===rows[key].length-1;
          left.setAttribute('aria-label','Sposta '+label(strip)+' a sinistra');right.setAttribute('aria-label','Sposta '+label(strip)+' a destra');
          const transfer=btn(key==='top'?'↓ Riga 2':'↑ Riga 1',()=>{const current=D().layerRows(D().get().layers.find(item=>item.id===id));current[key]=current[key].filter(value=>value!==stripId);current[other].push(stripId);apply(current);},'sys-small');
          transfer.setAttribute('aria-label','Sposta '+label(strip)+' nella riga '+(key==='top'?'2':'1'));
          const remove=btn('×',()=>{const current=D().layerRows(D().get().layers.find(item=>item.id===id));current[key]=current[key].filter(value=>value!==stripId);apply(current);},'sys-small');remove.setAttribute('aria-label','Rimuovi '+label(strip)+' dal layer');
          controls.append(left,right,transfer,remove);slot.append(controls);list.append(slot);
        }
        if(!rows[key].length)bank.append(h('p','sys-layer-empty','Riga vuota · aggiungi i canali da visualizzare qui.'));else bank.append(list);
        content.append(bank);
      }
    };
    paint();return U().modal('Custom Layer · due righe',content);
  }
  function renderLayers(container){
    const paint=()=>{
      container.replaceChildren();const d=D().get(),name=h('input','sys-input');name.placeholder='Nome layer';name.setAttribute('aria-label','Nome nuovo layer');
      container.append(card('CUSTOM LAYER · DUE RIGHE',note('Ogni layer conserva una riga superiore e una inferiore, con l’ordine dei fader scelto da te.'),row(name,btn('Crea layer',()=>{const id=uid('layer');changed(x=>x.layers.push({id,name:name.value.trim()||'Layer '+(x.layers.length+1),rows:{top:[],bottom:[]},members:[]}));paint();openLayerEditor(id,paint);},'desk-primary')),btn('Torna a tutti i canali',()=>{changed(x=>x.activeLayer=null);C().showLayer?.(null);U().close();})));
      const list=h('div','sys-layer-list');
      d.layers.forEach((layer,index)=>{
        const rows=D().layerRows(layer),preview=h('div','sys-layer-preview');
        for(const [key,title]of [['top','Riga 1 · superiore'],['bottom','Riga 2 · inferiore']]){
          const band=h('div','sys-layer-preview-row');band.dataset.layerRow=key;band.append(h('strong','',title));const names=h('div','sys-layer-preview-strips');
          for(const stripId of rows[key]){const strip=C().getStrip(stripId),chip=h('span','',label(strip));chip.style.setProperty('--layer-color',strip.color);names.append(chip);}if(!rows[key].length)names.append(h('span','sys-layer-preview-empty','Vuota'));band.append(names);preview.append(band);
        }
        const item=card(layer.name,textInput('Nome layer '+(index+1),layer.name,value=>{changed(x=>x.layers.find(v=>v.id===layer.id).name=value||'Layer '+(index+1));paint();}),preview);
        item.dataset.layerId=layer.id;
        const up=btn('↑',()=>{changed(x=>moveItem(x.layers,index,-1));paint();},'sys-small'),down=btn('↓',()=>{changed(x=>moveItem(x.layers,index,1));paint();},'sys-small');up.disabled=index===0;down.disabled=index===d.layers.length-1;up.setAttribute('aria-label','Sposta il layer '+layer.name+' prima');down.setAttribute('aria-label','Sposta il layer '+layer.name+' dopo');
        item.append(row(btn('Modifica le due righe',()=>openLayerEditor(layer.id,paint)),btn(d.activeLayer===layer.id?'Layer attivo':'Apri layer',()=>{const current=D().get().layers.find(v=>v.id===layer.id),currentRows=D().layerRows(current);if(!currentRows.top.length&&!currentRows.bottom.length){toast('Assegna almeno una strip');return;}changed(x=>x.activeLayer=layer.id);syncLayer();U().close();},'desk-primary'),up,down,btn('Elimina',()=>{changed(x=>{x.layers=x.layers.filter(v=>v.id!==layer.id);if(x.activeLayer===layer.id)x.activeLayer=null;});paint();},'desk-danger')));list.append(item);
      });
      container.append(list);
    };paint();
  }
  function renderGroups(container){
    const paint=()=>{container.replaceChildren();container.append(tabs([{id:'dca',label:'DCA 1–16'},{id:'mute',label:'Mute Groups'},{id:'auto',label:'Automix'}],selection.groups,id=>{selection.groups=id;paint();}));
      const data=D().get();
      if(selection.groups==='dca'){
        const bank=h('div','sys-dca-bank');
        data.dca.forEach((group,index)=>{
          const base='/dca/'+(index+1),c=card('',h('div','sys-dca-number','DCA '+String(index+1).padStart(2,'0')),wireControl(textInput('Nome DCA '+(index+1),group.name,value=>changed(s=>s.dca[index].name=value)),base+'/name'));
          c.append(wireControl(range('Livello DCA '+(index+1),group.level,-90,10,.1,value=>changed(s=>s.dca[index].level=value),'dB'),base+'/fdr',value=>Math.max(-90,value)));
          c.append(row(wireControl(toggle('Mute DCA '+(index+1),group.mute,value=>changed(s=>s.dca[index].mute=value)),base+'/mute'),wireControl(toggle('Solo DCA '+(index+1),group.solo,value=>changed(s=>s.dca[index].solo=value)),base+'/$solo')));
          c.append(row(writeButton((group.members?.length||0)+' membri',()=>openMembership(group.name,group.members,ids=>{changed(s=>s.dca[index].members=ids);}), 'sys-small'),btn('Spill',()=>spill(group.name,D().get().dca[index].members),'sys-small')));bank.append(c);
        });container.append(note('I DCA modificano il livello effettivo dei membri. I fader principali conservano il proprio valore.'),bank);
      }else if(selection.groups==='mute'){
        const bank=h('div','sys-group-grid');data.muteGroups.forEach((group,index)=>{
          const base='/mgrp/'+(index+1);bank.append(card('MUTE GROUP '+(index+1),wireControl(textInput('Nome gruppo '+(index+1),group.name,value=>changed(s=>s.muteGroups[index].name=value)),base+'/name'),wireControl(toggle('Attiva '+group.name,group.on,value=>changed(s=>s.muteGroups[index].on=value)),base+'/mute'),live()?note('Assegnazioni non gestite da questo pannello.'):row(btn((group.members?.length||0)+' membri',()=>openMembership(group.name,group.members,ids=>changed(s=>s.muteGroups[index].members=ids))),btn('Spill',()=>spill(group.name,D().get().muteGroups[index].members)))));
        });container.append(bank);
      }else{
        const bank=grid();for(const key of ['x','y']){const group=data.automix[key],body=card('AUTOMIX '+key.toUpperCase(),wireControl(toggle('Automix '+key.toUpperCase()+' attivo',group.enabled,value=>changed(s=>s.automix[key].enabled=value)),'/cfg/amix/'+key),writeButton('Assegna canali · '+group.channels.length,()=>{const other=D().get().automix[key==='x'?'y':'x'].channels;openMembership('Automix '+key.toUpperCase(),group.channels,ids=>{for(const id of ids){const slot=D().channel(id)?.postFx;if(slot)D().assignFx(slot,null,'post');}changed(s=>{s.automix[key].channels=ids;s.automix[key==='x'?'y':'x'].channels=s.automix[key==='x'?'y':'x'].channels.filter(id=>!ids.includes(id));});paint();},strips().filter(s=>s.kind==='CH'&&!other.includes(s.id)),Math.max(0,16-other.length));}));
          if(!group.channels.length)body.append(note('Assegna i canali parlati e regola i pesi relativi.'));
          group.channels.forEach(id=>{const strip=C().getStrip(id);if(strip)body.append(wireControl(range(label(strip),numeric(group.weights[id]),-12,12,.5,value=>changed(s=>s.automix[key].weights[id]=value),'dB'),window.SculptWingMap?.stripPath(id)+'/postins/w'));});bank.append(body);
        }container.append(note('Automix X/Y: 16 CH complessivi. L’assegnazione occupa il post insert; il suo FX viene disassegnato.'+(live()?' L’elaborazione avviene nella WING.':' Pesi e gruppi sono simulati, senza elaborazione audio.')),bank);
      }
    };paint();
  }
  function renderMonitor(container){
    if(live())return renderLiveMonitor(container);
    let held=[];
    const paint=()=>{container.replaceChildren();container.append(tabs([{id:'a',label:'Monitor A'},{id:'b',label:'Monitor B'},{id:'solo',label:'Solo'},{id:'talk',label:'Talkback'}],selection.monitor,id=>{selection.monitor=id;paint();}));
      const d=D().get();
      if(selection.monitor==='a'||selection.monitor==='b'){
        const index=selection.monitor==='a'?0:1,m=d.monitor[index],patch=(key,value)=>changed(s=>s.monitor[index][key]=value);
        const sources=[{value:'solo',label:'Solo bus'},...stripChoices(),...D().sources().filter(s=>['PLAY','USB','MOD'].includes(s.group)).map(s=>({value:s.id,label:s.name}))];
        const main=card('MONITOR '+selection.monitor.toUpperCase(),select('Sorgente monitor',m.source,sources,value=>patch('source',value)),range('Livello monitor',m.level,-90,10,.1,value=>patch('level',value),'dB'),row(toggle('Mute monitor',m.mute,value=>patch('mute',value)),toggle('Mono',m.mono,value=>patch('mono',value)),toggle('Dim',m.dim,value=>patch('dim',value))),range('Livello DIM',m.dimLevel,-60,0,1,value=>patch('dimLevel',value),'dB'));
        const space=card('STEREO / ALLINEAMENTO',range('Pan monitor',m.pan,-100,100,1,value=>patch('pan',value),'%'),range('Width',m.width,0,200,1,value=>patch('width',value),'%'),row(toggle('Polarità',m.polarity,value=>patch('polarity',value)),toggle('Delay attivo',m.delayOn,value=>patch('delayOn',value))),range('Delay monitor',m.delay,0,500,.1,value=>patch('delay',value),'ms'));
        const eq=card('MONITOR EQ / LIMITER',row(toggle('EQ attivo',m.eqOn,value=>patch('eqOn',value)),toggle('Limiter attivo',m.limiter,value=>patch('limiter',value))),range('Ceiling limiter',m.limit,-24,0,.1,value=>patch('limit',value),'dB'),range('High pass',m.hpf,20,400,1,value=>patch('hpf',value),'Hz'),range('Low pass',m.lpf,1000,20000,100,value=>patch('lpf',value),'Hz'));
        const frequencies=['40 Hz','100 Hz','250 Hz','630 Hz','1.6 kHz','4 kHz','8 kHz','14 kHz'];frequencies.forEach((freq,i)=>eq.append(range(freq,numeric(m.eq?.[i]),-15,15,.5,value=>changed(s=>{s.monitor[index].eq=s.monitor[index].eq||[0,0,0,0,0,0,0,0];s.monitor[index].eq[i]=value;}),'dB')));
        container.append(grid(main,space,eq));
      }else if(selection.monitor==='solo'){
        const solo=d.solo,active=strips().filter(s=>D().channel(s.id)?.solo),list=h('div','sys-list');
        active.forEach(s=>list.append(row(h('span','',label(s)),btn('Rilascia',()=>{D().setSolo(s.id,false);paint();},'sys-small'))));if(!active.length)list.append(note('Nessun canale in solo.'));
        container.append(grid(card('SOLO BUS',select('Modo solo',solo.mode,['PFL','AFL','SIP'],value=>changed(s=>s.solo.mode=value)),toggle('Solo esclusivo',solo.exclusive,value=>changed(s=>s.solo.exclusive=value)),toggle('Segui selezione',solo.follow,value=>changed(s=>s.solo.follow=value)),toggle('Dim su solo',solo.dimOnSolo,value=>changed(s=>s.solo.dimOnSolo=value)),range('Trim solo',solo.soloTrim,-20,20,.1,value=>changed(s=>s.solo.soloTrim=value),'dB')),card('CANALI IN ASCOLTO',list,btn('Clear solo',()=>{strips().forEach(s=>D().setSolo(s.id,false));changed(s=>s.dca.forEach(g=>g.solo=false));paint();},'desk-primary'),btn('Seleziona sorgenti solo',()=>openMembership('Solo',active.map(s=>s.id),ids=>{strips().forEach(s=>D().setSolo(s.id,ids.includes(s.id)));},strips())))));
      }else{
        container.append(card('SORGENTE TALKBACK',select('Sorgente talkback',d.talkback.source,stripChoices().filter(s=>['ch-40','aux-8'].includes(s.value)),value=>changed(s=>s.talkback.source=value)),toggle('Dim durante talkback',d.talkback.dim,value=>changed(s=>s.talkback.dim=value)),note('Il talkback usa la sorgente del banco demo; non acquisisce il microfono del telefono.')));
        const bank=grid();for(const key of ['a','b']){
          const t=d.talkback[key],patch=(k,v)=>changed(s=>s.talkback[key][k]=v),talk=btn('TALK '+key.toUpperCase(),()=>{},'sys-talk');talk.setAttribute('aria-label','Talkback '+key.toUpperCase());talk.setAttribute('aria-pressed',String(t.on));
          const update=on=>{patch('on',on);talk.setAttribute('aria-pressed',String(on));};
          talk.addEventListener('pointerdown',e=>{if(D().get().talkback[key].mode==='PUSH'){e.preventDefault();talk.setPointerCapture?.(e.pointerId);update(true);held.push(key);}});
          for(const event of ['pointerup','pointercancel','lostpointercapture'])talk.addEventListener(event,()=>{if(D().get().talkback[key].mode==='PUSH'){update(false);held=held.filter(v=>v!==key);}});
          talk.addEventListener('click',()=>{if(D().get().talkback[key].mode!=='PUSH')update(!D().get().talkback[key].on);});
          talk.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)&&D().get().talkback[key].mode==='PUSH'){e.preventDefault();update(true);held.push(key);}});talk.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)&&D().get().talkback[key].mode==='PUSH')update(false);});
          const c=card('TALK '+key.toUpperCase(),talk,select('Modo Talk '+key.toUpperCase(),t.mode,['PUSH','LATCH','AUTO'],value=>{patch('mode',value);patch('latch',value!=='PUSH');patch('on',false);paint();}),range('Livello Talk '+key.toUpperCase(),t.level,-60,10,.1,value=>patch('level',value),'dB'),btn('Destinazioni · '+t.targets.length,()=>openMembership('Destinazioni Talk '+key.toUpperCase(),t.targets,ids=>{patch('targets',ids);paint();},strips().filter(s=>['BUS','MAIN','MTX'].includes(s.kind)))));
          for(const id of t.targets){const strip=C().getStrip(id);if(strip)c.append(range(label(strip),numeric(t.levels?.[id]),-40,10,.5,value=>changed(s=>{s.talkback[key].levels=s.talkback[key].levels||{};s.talkback[key].levels[id]=value;}),'dB'));}bank.append(c);
        }container.append(bank);
      }
    };paint();return()=>{for(const key of held)changed(s=>s.talkback[key].on=false);};
  }
  function renderLiveMonitor(container){
    const held=new Set(),release=()=>{for(const key of held)changed(s=>{s.talkback[key].on=false;});held.clear();};
    const paint=()=>{
      container.replaceChildren(tabs([{id:'a',label:'Monitor A'},{id:'b',label:'Monitor B'},{id:'solo',label:'Solo'},{id:'talk',label:'Talkback'}],selection.monitor,id=>{release();selection.monitor=id;paint();}));
      const d=D().get();
      if(['a','b'].includes(selection.monitor)){
        const index=selection.monitor==='a'?0:1,m=d.monitor[index],base='/cfg/mon/'+(index+1),patch=(key,value)=>changed(s=>{s.monitor[index][key]=value;}),local=v=>String(v).replace('.','-').toLowerCase();
        const sourceItems=(L().metadata(base+'/src')?.items||[]).map(item=>({value:local(item.value),label:item.label||String(item.value)}));
        const main=card('MONITOR '+selection.monitor.toUpperCase(),wireControl(select('Sorgente monitor',m.source,sourceItems,value=>patch('source',value)),base+'/src',local),wireControl(range('Livello monitor',m.level,-90,10,.1,value=>patch('level',value),'dB'),base+'/lvl',v=>Math.max(-90,v)),row(wireControl(toggle('Mute ascolto',m.mute,value=>patch('mute',value)),'/cfg/solo/mute'),wireControl(toggle('Mono ascolto',m.mono,value=>patch('mono',value)),'/cfg/solo/$mono'),wireControl(toggle('Dim ascolto',m.dim,value=>patch('dim',value)),'/cfg/solo/$dim')),note('Mute, mono e dim sono controlli condivisi del sistema solo/monitor.'),wireControl(range('Attenuazione DIM',m.dimLevel,-40,0,1,value=>patch('dimLevel',value),'dB'),base+'/dim',v=>-Math.abs(Number(v))));
        const stereo=card('STEREO / ALLINEAMENTO',wireControl(range('Pan monitor',m.pan,-100,100,1,value=>patch('pan',value),'%'),base+'/pan'),wireControl(range('Width monitor',m.width,-150,150,5,value=>patch('width',value),'%'),base+'/wid'),wireControl(toggle('Polarità monitor',m.polarity,value=>patch('polarity',value)),base+'/inv'),wireControl(toggle('Delay monitor attivo',m.delayOn,value=>patch('delayOn',value)),base+'/dly/on'),note('Il ritardo del monitor è espresso in metri sul banco.'),wingButton(base+'/dly'));
        const eq=card('EQ / LIMITER',wireControl(toggle('EQ monitor attivo',m.eqOn,value=>patch('eqOn',value)),base+'/eq/on'),wireControl(range('Soglia limiter',m.limit??-3,-40,0,1,value=>patch('limit',value),'dB'),base+'/lim'));
        for(let b=0;b<8;b++){const g=b===0?'lsg':b===7?'hsg':b+'g',f=b===0?'lsf':b===7?'hsf':b+'f',frequency=L().value(base+'/eq/'+f);eq.append(wireControl(range((b===0?'Low shelf':b===7?'High shelf':'Banda '+b)+(Number.isFinite(frequency)?' · '+Math.round(frequency)+' Hz':''),numeric(m.eq?.[b]),-15,15,.1,value=>changed(s=>{s.monitor[index].eq[b]=value;}),'dB'),base+'/eq/'+g));}
        eq.append(wingButton(base+'/eq'));container.append(grid(main,stereo,eq));
      }else if(selection.monitor==='solo'){
        const active=strips().filter(s=>D().channel(s.id)?.solo),list=h('div','sys-list');
        for(const s of active)list.append(row(h('span','',label(s)),wireControl(btn('Rilascia',()=>{D().setSolo(s.id,false);paint();},'sys-small'),root.SculptWingMap.stripPath(s.id)+'/$solo')));if(!active.length)list.append(note('Nessun canale in solo.'));
        const clear=btn('Clear solo',async()=>{try{await L().loadScope('groups');for(const s of strips())D().setSolo(s.id,false);changed(s=>{s.dca.forEach(g=>{g.solo=false;});});await L().settled();paint();}catch(e){toast(e.message);}},'desk-primary');clear.disabled=!L().isWritable();
        container.append(grid(card('SOLO',wireControl(select('Tap solo canali',d.solo.mode,['PFL','AFL'],value=>changed(s=>{s.solo.mode=value;})),'/cfg/solo/chtap'),wingButton('/cfg/solo')),card('CANALI IN ASCOLTO',list,clear)));
      }else{
        container.append(card('SORGENTE TALKBACK',wireControl(select('Sorgente talkback',d.talkback.source,[{value:'OFF',label:'OFF'},...stripChoices().filter(s=>['ch-40','aux-8'].includes(s.value))],value=>changed(s=>{s.talkback.source=value;})),'/cfg/talk/assign',v=>v==='CH40'?'ch-40':v==='AUX8'?'aux-8':'OFF'),note('Il talkback usa la sorgente CH40 o AUX8 della WING. Il livello è condiviso da Talk A e B.'),wireControl(range('Livello talkback',d.talkback.a.level,-90,10,.1,value=>changed(s=>{s.talkback.a.level=value;s.talkback.b.level=value;}),'dB'),'/cfg/talk/lvl',v=>Math.max(-90,v))));
        const bank=grid();for(const key of ['a','b']){
          const t=d.talkback[key],base='/cfg/talk/'+key.toUpperCase(),patch=(k,v)=>changed(s=>{s.talkback[key][k]=v;}),talk=wireControl(btn('TALK '+key.toUpperCase(),()=>{},'sys-talk'),base+'/$on');talk.setAttribute('aria-label','Talkback '+key.toUpperCase());talk.setAttribute('aria-pressed',String(t.on));
          const press=value=>{if(patch('on',value)!==false)talk.setAttribute('aria-pressed',String(value));};
          talk.addEventListener('pointerdown',e=>{if(!talk.disabled&&D().get().talkback[key].mode==='PUSH'){e.preventDefault();talk.setPointerCapture?.(e.pointerId);held.add(key);press(true);}});
          for(const event of ['pointerup','pointercancel','lostpointercapture'])talk.addEventListener(event,()=>{if(held.has(key)){press(false);held.delete(key);}});
          talk.addEventListener('click',()=>{if(D().get().talkback[key].mode!=='PUSH')press(!D().get().talkback[key].on);});
          talk.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)&&!e.repeat&&D().get().talkback[key].mode==='PUSH'){e.preventDefault();held.add(key);press(true);}});talk.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)&&held.has(key)){press(false);held.delete(key);}});
          const destinations=btn('Destinazioni · '+t.targets.length,()=>openMembership('Destinazioni Talk '+key.toUpperCase(),D().get().talkback[key].targets,ids=>patch('targets',ids),strips().filter(s=>['BUS','MAIN','MTX'].includes(s.kind))));destinations.disabled=!L().isWritable();
          bank.append(card('TALK '+key.toUpperCase(),talk,wireControl(select('Modo Talk '+key.toUpperCase(),t.mode,['PUSH','LATCH','AUTO'],value=>{release();patch('mode',value);}),base+'/mode'),destinations,wingButton(base)));
        }container.append(bank);
      }
    };
    const visibility=()=>{if(document.hidden)release();};root.addEventListener('blur',release);document.addEventListener('visibilitychange',visibility);paint();
    return()=>{release();root.removeEventListener('blur',release);document.removeEventListener('visibilitychange',visibility);};
  }
  function simulatedMeter(strip,time,index,tap='POST'){
    const e=D().effective(strip.id),channel=D().channel(strip.id),source=channel?D().source(channel.useAlt||D().get().io.globalAlt&&channel.sourceAuto?channel.altSource:channel.source):null;
    const preMute=source?.mute||source?.id==='OFF';
    const base=tap==='PRE'?(preMute?-90:-16):(e.muted||e.level<=-89?-90:Math.min(-1,-16+e.level*.5));
    if(base<=-89)return -90;
    return clamp(base+5*Math.sin(time*2.6+index*.67)+2.6*Math.sin(time*7.2+index*1.1),-90,0);
  }
  function renderMeters(container){
    let timer=null,peaks={},bars=[],rtaBars=[],rtaPath=null,lastPeakRevision=D().get().meterSettings.peakRevision,oscReady=false,disposed=false,oscLoading=false;
    const stop=()=>{if(timer)clearInterval(timer);timer=null;};
    const paint=()=>{stop();bars=[];rtaBars=[];container.replaceChildren();const d=D().get(),settings=d.meterSettings;
      container.append(tabs([{id:'levels',label:'Meter bridge'},{id:'rta',label:'RTA'},{id:'osc',label:'Oscillatori'}],selection.meters,id=>{selection.meters=id;paint();}));
      if(selection.meters==='levels'){
        const family=select('Banco meter',settings.family,['CH','AUX','BUS','MAIN','MTX','DCA','FX'],value=>{changed(s=>s.meterSettings.family=value);paint();});
        container.append(row(family,select('Tap meter',settings.tap,['PRE','POST'],value=>changed(s=>s.meterSettings.tap=value)),toggle('Peak hold',settings.hold,value=>changed(s=>s.meterSettings.hold=value)),btn('Reset peak',()=>{peaks={};changed(s=>s.meterSettings.peakRevision++);})),note(live()?'Meter stereo ricevuti dalla WING. «—» indica dati non disponibili o scaduti. La gain reduction dipende dal modello e non viene simulata.':'Meter di livello e gain reduction simulati. Seguono livelli, mute e gruppi del banco demo.'));
        const bridge=h('div','sys-meter-bridge');
        const items=live()&&['DCA','FX'].includes(settings.family)?[]:settings.family==='DCA'?d.dca.map((g,i)=>({id:'dca-'+g.id,name:g.name,number:i+1,kind:'DCA',level:g.level,mute:g.mute})):settings.family==='FX'?d.fx.map((fx,i)=>({id:'fx-'+(i+1),name:fx.model,number:i+1,kind:'FX',level:fx.enabled?0:-90,mute:!fx.enabled})):strips().filter(s=>s.kind===settings.family);
        if(live()&&!items.length)container.append(note('Lo streaming di questo banco meter non è ancora disponibile. Scegli CH, AUX, BUS, MAIN o MTX.'));
        items.forEach((s,index)=>{const meter=h('div','sys-meter-strip'),name=h('span','sys-meter-name',s.kind+' '+String(s.number).padStart(2,'0')),full=h('strong','sys-meter-channel',s.name),stereo=h('div','sys-meter-stereo'),left=h('i','sys-meter-bar'),right=h('i','sys-meter-bar'),peak=h('i','sys-meter-hold'),value=h('output','sys-meter-value','−∞'),gr=h('div','sys-gr');
          left.append(peak);stereo.append(left,right);meter.append(name,full,stereo,value,gr);bridge.append(meter);bars.push({strip:s,index,left,right,peak,value,gr});
        });container.append(bridge);
      }else if(selection.meters==='rta'){
        if(live()){container.append(card('RTA WING',note('Lo streaming RTA non è attivo in questa versione. Non viene mostrato uno spettro simulato durante la connessione.'),wingButton('/cfg/rta')));return;}
        container.append(row(select('Sorgente RTA',settings.source,stripChoices(),value=>changed(s=>s.meterSettings.source=value)),select('Decay RTA',settings.decay,['FAST','MED','SLOW'],value=>changed(s=>s.meterSettings.decay=value)),select('Range RTA',settings.range,[40,60,80,100],value=>changed(s=>s.meterSettings.range=Number(value))),toggle('Freeze RTA',settings.freeze,value=>changed(s=>s.meterSettings.freeze=value))));
        const screen=h('div','sys-rta-screen'),title=row(h('span','sys-badge','SPECTRUM / DEMO'),h('span','sys-dim','20 Hz — 20 kHz'));
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 800 270');svg.setAttribute('role','img');svg.setAttribute('aria-label','Analizzatore di spettro simulato');
        for(let y=30;y<=240;y+=42){const line=document.createElementNS(svg.namespaceURI,'line');line.setAttribute('x1',0);line.setAttribute('x2',800);line.setAttribute('y1',y);line.setAttribute('y2',y);line.setAttribute('class','sys-rta-grid');svg.append(line);}
        for(let i=0;i<48;i++){const rect=document.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('x',i*16.6+2);rect.setAttribute('width',12);rect.setAttribute('y',240);rect.setAttribute('height',0);rect.setAttribute('class','sys-rta-bar');svg.append(rect);rtaBars.push(rect);}
        rtaPath=document.createElementNS(svg.namespaceURI,'polyline');rtaPath.setAttribute('class','sys-rta-curve');svg.append(rtaPath);screen.append(title,svg,row(...['20','50','100','250','500','1k','2k','5k','10k','20k'].map(f=>h('span','sys-rta-label',f))));container.append(screen,note('Visualizzazione dimostrativa: nessun microfono o flusso audio viene analizzato.'));
      }else{
        if(live()){
          if(!oscReady){container.append(note('Lettura degli oscillatori dalla WING…'));if(!oscLoading){oscLoading=true;L().loadScope('monitor').then(()=>{oscReady=true;if(!disposed)paint();}).catch(e=>{if(!disposed){container.append(note(e.message),wingButton('/io/in/OSC'));}}).finally(()=>{oscLoading=false;});}return;}
          const bank=grid();d.oscillators.forEach((osc,index)=>{const source='/io/in/OSC/'+(index+1),base=source+'/osc',patch=(k,v)=>changed(s=>{s.oscillators[index][k]=v;}),levelMeta=L().metadata(base+'/lvl');bank.append(card('OSCILLATORE '+(index+1),wireControl(toggle('Oscillatore '+(index+1)+' attivo',osc.on,value=>patch('on',value)),source+'/mute',v=>Number(v)?0:1),wireControl(select('Segnale OSC '+(index+1),osc.mode,['SINE','PINK','WHITE'],value=>patch('mode',value)),base+'/mode'),wireControl(range('Frequenza OSC '+(index+1),osc.frequency,20,20000,1,value=>patch('frequency',value),'Hz'),base+'/f'),wireControl(range('Livello OSC '+(index+1),osc.level,levelMeta?.min??-40,levelMeta?.max??6,.5,value=>patch('level',value),'dB'),base+'/lvl'),btn('Routing sorgente OSC',()=>U().open('io',{tab:'sources',group:'OSC'})),wingButton(source)));});container.append(note('Il generatore audio risiede nel DSP della WING. Assegna OSC 1/2 come sorgente tramite I/O.'),bank);return;
        }
        const bank=grid();d.oscillators.forEach((osc,index)=>{const patch=(k,v)=>changed(s=>s.oscillators[index][k]=v);bank.append(card('OSCILLATORE '+(index+1),toggle('Oscillatore '+(index+1)+' attivo',osc.on,value=>patch('on',value)),select('Segnale OSC '+(index+1),osc.mode,[{value:'SINE',label:'Sine / sinusoidale'},{value:'PINK',label:'Rumore rosa'},{value:'WHITE',label:'Rumore bianco'}],value=>patch('mode',value)),range('Frequenza OSC '+(index+1),osc.frequency,20,20000,1,value=>patch('frequency',value),'Hz'),range('Livello OSC '+(index+1),osc.level,-90,0,.1,value=>patch('level',value),'dB'),btn('Destinazioni · '+osc.targets.length,()=>openMembership('Routing OSC '+(index+1),osc.targets,ids=>{patch('targets',ids);paint();},strips().filter(s=>['BUS','MAIN','MTX'].includes(s.kind))))));});container.append(note('Configurazione e routing degli oscillatori del banco simulato; la demo non genera audio.'),bank);
      }
      const tick=()=>{
        const time=Date.now()/1000,s=D().get().meterSettings;
        if(lastPeakRevision!==s.peakRevision){peaks={};lastPeakRevision=s.peakRevision;}
        for(const meter of bars){let value,right;if(live()){
            const data=L().meter(meter.strip.id,s.tap==='PRE'?'input':'output');meter.gr.hidden=true;meter.gr.style.setProperty('--sys-gr','0%');
            if(!data||!Number.isFinite(data.left)||!Number.isFinite(data.right)){meter.left.style.setProperty('--sys-meter','0%');meter.right.style.setProperty('--sys-meter','0%');meter.peak.style.bottom='0%';meter.value.textContent='—';delete peaks[meter.strip.id];continue;}
            value=data.left;right=data.right;
          }else if(meter.strip.kind==='DCA'){const g=D().get().dca[meter.index];value=g.mute||g.level<=-89?-90:clamp(-18+g.level*.5+5*Math.sin(time*3+meter.index),-90,0);}else if(meter.strip.kind==='FX'){const fx=D().get().fx[meter.index];value=!fx.enabled||fx.model==='NONE'?-90:clamp(-24+5*Math.sin(time*3+meter.index),-90,0);}else value=simulatedMeter(C().getStrip(meter.strip.id),time,meter.index,s.tap);
          const pct=clamp((value+60)/60*100,0,100);meter.left.style.setProperty('--sys-meter',pct+'%');meter.right.style.setProperty('--sys-meter',live()?clamp((right+60)/60*100,0,100)+'%':Math.max(0,pct-3+2*Math.sin(time*4+meter.index))+'%');
          const peakValue=live()?Math.max(value,right):value;peaks[meter.strip.id]=s.hold?Math.max(peaks[meter.strip.id]??-144,peakValue):peakValue;meter.peak.style.bottom=clamp((peaks[meter.strip.id]+60)/60*100,0,100)+'%';meter.value.textContent=peakValue<=-90?'−∞':peakValue.toFixed(1);if(!live())meter.gr.style.setProperty('--sys-gr',Math.max(0,8*Math.sin(time*1.3+meter.index))+'%');
        }
        if(rtaBars.length&&!s.freeze){const source=C().getStrip(s.source),effective=source?D().effective(source.id):{level:-10,muted:false};const factor=effective.muted||effective.level<=-89?0:clamp((effective.level+60)/60,.1,1);const points=[];
          rtaBars.forEach((bar,i)=>{const envelope=(.25+.38*Math.exp(-Math.pow((i-17)/16,2)))*factor;const slow=s.decay==='SLOW'?.3:s.decay==='FAST'?1.8:.8;const db=-68+envelope*70+5*Math.sin(time*slow*3+i*.45)+3*Math.sin(time*slow*6+i);const height=factor?clamp((1+db/s.range)*230,0,230):0;bar.setAttribute('y',String(240-height));bar.setAttribute('height',String(height));points.push((i*16.6+8)+','+(240-height));});rtaPath.setAttribute('points',points.join(' '));}
      };tick();if(selection.meters!=='osc')timer=setInterval(tick,100);
    };paint();return()=>{disposed=true;stop();};
  }
  function scopePicker(value,onChange){const choices=h('div','sys-scope-grid');for(const [id,title]of SCOPES){const line=h('label','sys-check'),input=h('input');input.type='checkbox';input.checked=value.includes(id);input.setAttribute('aria-label','Scope '+title);input.addEventListener('change',()=>{const next=[...choices.querySelectorAll('input:checked')].map(n=>n.value);onChange(next);});input.value=id;line.append(input,h('span','',title));choices.append(line);}return choices;}
  function captureScene(name,scope=newSceneScope){return {id:uid('scene'),name:name||'Scena '+String(D().get().scenes.length+1).padStart(2,'0'),scope:[...scope],tag:'',createdAt:Date.now(),updatedAt:Date.now(),snapshot:D().capture()};}
  function recallScene(id){const scene=D().get().scenes.find(s=>s.id===id);if(!scene)return false;D().recall(scene.snapshot,scene.scope,D().get().safes);changed(s=>s.activeScene=id);log('Scena richiamata: '+scene.name);toast('Richiamata · '+scene.name);return true;}
  function moveItem(list,index,delta){const next=index+delta;if(next<0||next>=list.length)return;[list[index],list[next]]=[list[next],list[index]];}
  function compactSnapshotInfo(snapshot){const data=snapshot.desk||snapshot.console||{};return Object.keys(snapshot.values||{}).length+' strip · '+(data.fx?.length||16)+' FX';}
  function renderScenes(container,args){
    if(args?.tab&&['show','snippets','presets','project'].includes(args.tab))selection.scenes=args.tab;
    const presetTarget=args?.target;
    const paint=()=>{container.replaceChildren();const d=D().get();container.append(tabs([{id:'show',label:'Show / scene'},{id:'snippets',label:'Snippet'},{id:'presets',label:'Preset canale'},{id:'project',label:'Progetto'}],selection.scenes,id=>{selection.scenes=id;paint();}));
      if(selection.scenes==='show'){
        if(!selectedScene||!d.scenes.some(s=>s.id===selectedScene))selectedScene=d.scenes[0]?.id||null;
        const title=textInput('Nome show',d.showName,value=>changed(s=>s.showName=value));
        const newName=h('input','sys-input');newName.placeholder='Nome nuova scena';newName.setAttribute('aria-label','Nome nuova scena');
        const create=()=>{const scene=captureScene(newName.value.trim());changed(s=>s.scenes.push(scene));selectedScene=scene.id;log('Scena salvata: '+scene.name);paint();};
        const createCard=card('SALVA SCENA',row(newName,btn('Salva',create,'desk-primary')),scopePicker(newSceneScope,value=>newSceneScope=value),note('Lo scope decide quali sezioni verranno richiamate. Le strip Safe restano protette.'));
        const list=h('div','sys-scene-list');d.scenes.forEach((scene,index)=>{const button=btn('',()=>{selectedScene=scene.id;paint();},'sys-scene-row');button.setAttribute('aria-pressed',String(selectedScene===scene.id));button.append(h('span','sys-scene-index',String(index+1).padStart(2,'0')),h('strong','',scene.name),h('small','',scene.tag||''));if(d.activeScene===scene.id)button.append(h('i','sys-scene-live','ATTIVA'));list.append(button);});if(!d.scenes.length)list.append(h('div','sys-empty','Salva il banco corrente come prima scena.'));
        const library=card('SCENE · '+d.scenes.length,list,btn('Safes · '+d.safes.length+' strip',()=>openMembership('Strip protette dal richiamo',d.safes,ids=>changed(s=>s.safes=ids))));
        const selected=d.scenes.find(s=>s.id===selectedScene),details=card('SCENA SELEZIONATA');
        if(selected){const index=d.scenes.findIndex(s=>s.id===selectedScene);details.append(textInput('Nome scena',selected.name,value=>changed(s=>s.scenes.find(x=>x.id===selectedScene).name=value)),textInput('Tag scena',selected.tag||'',value=>changed(s=>s.scenes.find(x=>x.id===selectedScene).tag=value),'Es. intro, brano, pausa'),scopePicker(selected.scope||newSceneScope,value=>changed(s=>s.scenes.find(x=>x.id===selectedScene).scope=value)),note(compactSnapshotInfo(selected.snapshot)));
          details.append(row(btn('◀',()=>{selectedScene=d.scenes[Math.max(0,index-1)].id;paint();}),btn('GO · Richiama',()=>{recallScene(selectedScene);paint();},'sys-go'),btn('▶',()=>{selectedScene=d.scenes[Math.min(d.scenes.length-1,index+1)].id;paint();})));
          details.append(row(btn('Aggiorna',()=>{const snapshot=D().capture();changed(s=>{const item=s.scenes.find(x=>x.id===selectedScene);item.snapshot=snapshot;item.updatedAt=Date.now();});toast('Scena aggiornata');}),btn('Duplica',()=>{const duplicate=copy(selected);duplicate.id=uid('scene');duplicate.name+=' · copia';changed(s=>s.scenes.splice(index+1,0,duplicate));selectedScene=duplicate.id;paint();}),btn('↑',()=>{changed(s=>moveItem(s.scenes,index,-1));paint();}),btn('↓',()=>{changed(s=>moveItem(s.scenes,index,1));paint();})));
          details.append(row(btn('Esporta scena',()=>U().download(selected.name.replace(/[^a-z0-9_-]/gi,'_')+'.sculpt-scene.json',JSON.stringify({format:'sculpt-control-scene',version:1,scene:selected},null,2),'application/json')),btn('Elimina',()=>{changed(s=>{s.scenes=s.scenes.filter(x=>x.id!==selectedScene);if(s.activeScene===selectedScene)s.activeScene=null;});selectedScene=null;paint();},'desk-danger')));
        }else details.append(note('Le scene conservano patch, processori e valori del banco.'));
        container.append(title,grid(library,details),createCard);
      }else if(selection.scenes==='snippets'){
        const name=h('input','sys-input');name.placeholder='Nome snippet';name.setAttribute('aria-label','Nome snippet');let targets=[C().getState().selected||'ch-1'],scope=['levels'];const targetLabel=h('span','sys-badge','1 strip');
        const createCard=card('NUOVO SNIPPET',name,scopePicker(scope,value=>scope=value),row(btn('Scegli strip',()=>openMembership('Ambito snippet',targets,ids=>{targets=ids;targetLabel.textContent=ids.length+' strip';})),targetLabel,btn('Cattura snippet',()=>{if(!targets.length||!scope.length){toast('Scegli strip e sezioni');return;}const item={id:uid('snippet'),name:name.value.trim()||'Snippet '+(d.snippets.length+1),targets,scope,snapshot:D().capture()};changed(s=>s.snippets.push(item));paint();},'desk-primary')));
        const list=h('div','sys-group-grid');d.snippets.forEach(snippet=>{list.append(card(snippet.name,note(snippet.targets.length+' strip · '+snippet.scope.join(', ')),row(btn('Applica',()=>{const protectedIds=[...new Set([...D().get().safes,...strips().map(s=>s.id).filter(id=>!snippet.targets.includes(id))])];D().recall(snippet.snapshot,snippet.scope,protectedIds);log('Snippet: '+snippet.name);toast('Snippet applicato');}),btn('Aggiorna',()=>{const snapshot=D().capture();changed(s=>s.snippets.find(x=>x.id===snippet.id).snapshot=snapshot);toast('Snippet aggiornato');}),btn('Elimina',()=>{changed(s=>s.snippets=s.snippets.filter(x=>x.id!==snippet.id));paint();},'desk-danger'))));});container.append(createCard,list);
      }else if(selection.scenes==='presets'){
        let target=presetTarget||C().getState().selected||'ch-1';const name=h('input','sys-input');name.placeholder='Nome preset';name.setAttribute('aria-label','Nome preset canale');const options=stripChoices();const saveCard=card('PRESET CANALE',select('Canale per preset',target,options,value=>target=value),name,btn('Salva preset',()=>{const strip=C().getStrip(target);const preset={id:uid('preset'),name:name.value.trim()||strip.name+' · preset',kind:strip.kind,strip:copy(strip),channel:copy(D().channel(target)),processing:copy(D().get().processing[target])};changed(s=>s.stripPresets.push(preset));paint();},'desk-primary'));
        const list=h('div','sys-group-grid');d.stripPresets.forEach(preset=>{let destination=target;const compatible=strips().filter(s=>s.kind===preset.kind);if(!compatible.some(s=>s.id===destination))destination=compatible[0]?.id;let withLevels=false;
          list.append(card(preset.name,h('span','sys-badge',preset.kind),select('Destinazione '+preset.name,destination,compatible.map(s=>({value:s.id,label:label(s)})),value=>destination=value),toggle('Includi livello e mute',withLevels,value=>withLevels=value),row(btn('Carica',()=>{if(!destination)return;const source=copy(preset.strip);if(!withLevels){delete source.level;delete source.mute;}delete source.id;delete source.kind;delete source.number;C().updateStrip(destination,source);changed(s=>{s.processing[destination]=copy(preset.processing);const ch=s.channels[destination],saved=copy(preset.channel);delete saved.source;delete saved.altSource;delete saved.preFx;delete saved.postFx;delete saved.solo;Object.assign(ch,saved);});toast('Preset caricato');}),btn('Elimina',()=>{changed(s=>s.stripPresets=s.stripPresets.filter(x=>x.id!==preset.id));paint();},'desk-danger'))));});container.append(saveCard,list);
      }else{
        const exportButton=btn('Esporta progetto completo',()=>{const payload={format:'sculpt-control-demo',version:4,createdAt:new Date().toISOString(),name:D().get().showName,state:C().capture()};U().download('Sculpt-Wing-'+Date.now()+'.json',JSON.stringify(payload,null,2),'application/json');},'desk-primary');
        const input=h('input','sys-input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Importa progetto Sculpt Wing');const status=h('p','sys-note','Scegli un progetto JSON o una scena esportata da questa demo.');const importButton=btn('Applica file',()=>{if(!projectCandidate)return;importUndo=C().capture();if(projectCandidate.kind==='scene'){changed(s=>s.scenes.push(projectCandidate.scene));toast('Scena importata nella libreria');}else{C().restore(projectCandidate.state);toast('Progetto importato');}projectCandidate=null;paint();},'desk-primary');importButton.disabled=true;
        input.addEventListener('change',async()=>{projectCandidate=null;importButton.disabled=true;try{const file=input.files[0];if(!file)return;if(file.size>8000000)throw new Error('Il file supera 8 MB');const data=JSON.parse(await file.text());if(data.format==='sculpt-control-scene'&&data.scene){const snapshot=validateProject(data.scene.snapshot);projectCandidate={kind:'scene',scene:{id:uid('scene'),name:String(data.scene.name||'Scena importata').slice(0,80),tag:String(data.scene.tag||'').slice(0,40),scope:Array.isArray(data.scene.scope)?data.scene.scope.filter(v=>SCOPES.some(s=>s[0]===v)):['levels','processing','routing'],snapshot,createdAt:Date.now()}};status.textContent='Scena pronta: '+projectCandidate.scene.name;}else{const state=validateProject(data);projectCandidate={kind:'project',state};status.textContent='Progetto pronto: '+Object.keys(state.values).length+' strip. Il banco demo verrà sostituito.';}importButton.disabled=false;}catch(error){status.textContent=error.message;}});
        const reset=btn('Ripristina banco demo',()=>{if(D().reset)D().reset();else C().restore({version:4,values:{},sends:{},desk:null});ensureState();seedExamples();toast('Banco demo ripristinato');paint();},'desk-danger');
        const controls=row(importButton);if(importUndo)controls.append(btn('Annulla ultima importazione',()=>{C().restore(importUndo);importUndo=null;toast('Importazione annullata');paint();}));
        container.append(grid(card('PROGETTO LOCALE',note('Esporta banco, I/O, FX, scene, preset e macro in un unico file. Il file descrive la demo Sculpt; non è un file snapshot WING.'),exportButton),card('IMPORTAZIONE',input,status,controls)),card('BANCO INIZIALE',note('Il ripristino riporta i valori dimostrativi. Esporta prima il progetto per conservarli.'),reset));
      }
    };paint();
  }
  function transport(id,command){
    const data=D().get(),r=data.recorder[id];if(!r)throw new Error('Recorder non disponibile');
    if(id.startsWith('sd')&&!['WLIVE','WING-LIVE'].includes(data.setup.card)){toast('Seleziona WING-LIVE nel profilo hardware');return false;}
    const position=transportPosition(r),now=Date.now();
    if(id==='player'&&command==='record'){toast('Il player non registra: usa USB REC o SD');return false;}
    D().change(s=>{const rec=s.recorder[id];
      if(command==='record'){
        if(id==='player')return;
        if(rec.state!=='recording'){rec.position=0;rec.startedAt=now;rec.state='recording';rec.recordingActive=true;rec.markers=[];rec.recordId=uid('take');}
      }else if(command==='play'){
        rec.position=position>=numeric(rec.duration,600)?0:position;rec.startedAt=now;rec.state='playing';rec.recordingActive=false;
        if(rec.autoAlt&&id.startsWith('sd')){rec.altBefore=s.io?.globalAlt||false;if(s.io)s.io.globalAlt=true;}
      }else if(command==='pause'){
        if(['playing','recording'].includes(rec.state)){rec.position=position;rec.startedAt=null;rec.resumeState=rec.state;rec.state='paused';}
        else if(rec.state==='paused'){rec.state=rec.resumeState||'playing';rec.startedAt=now;}
      }else if(command==='stop'){
        if(rec.recordingActive){rec.sessions.push({id:rec.recordId||uid('take'),name:rec.session||'Take '+(rec.sessions.length+1),duration:Math.max(.1,position),tracks:rec.tracks,markers:copy(rec.markers),bitDepth:rec.bitDepth||24,createdAt:now,virtual:true});rec.duration=Math.max(.1,position);rec.recordingActive=false;}
        rec.position=position;rec.startedAt=null;rec.state='stopped';
        if(rec.autoAlt&&id.startsWith('sd')&&s.io&&typeof rec.altBefore==='boolean')s.io.globalAlt=rec.altBefore;
      }else if(command==='rewind'){rec.position=0;if(['playing','recording'].includes(rec.state))rec.startedAt=now;}
      else if(command==='marker'){rec.markers=rec.markers||[];rec.markers.push({id:uid('marker'),name:'Marker '+(rec.markers.length+1),position:Math.round(position*10)/10});}
      else throw new Error('Comando transport non valido');
    },'transport');log(id.toUpperCase()+' · '+command);return true;
  }
  function renderRecorder(container){
    let timer=null;
    const stop=()=>{if(timer)clearInterval(timer);timer=null;};
    const paint=()=>{stop();container.replaceChildren();const id=selection.recorder,r=D().get().recorder[id],titles={sdA:'WING-LIVE · SD A',sdB:'WING-LIVE · SD B',usb:'USB Recorder',player:'USB Player'};
      container.append(tabs([{id:'sdA',label:'SD A'},{id:'sdB',label:'SD B'},{id:'usb',label:'USB REC'},{id:'player',label:'Player'}],id,value=>{selection.recorder=value;paint();}));
      if(id.startsWith('sd')&&!['WLIVE','WING-LIVE'].includes(D().get().setup.card)){container.append(card(titles[id],note('Il profilo hardware non ha WING-LIVE. Puoi selezionarla in Setup per provare il registratore SD.'),btn('Apri Setup',()=>U().open('setup'))));return;}
      const time=h('output','sys-timecode',formatTime(transportPosition(r))),state=h('span','sys-transport-state',r.state.toUpperCase()),transportButtons=row();
      const control=(text,command,cls='')=>btn(text,()=>{transport(id,command);paint();},cls);
      transportButtons.append(control('⏮','rewind'),control('▶ PLAY','play'),control('Ⅱ PAUSE','pause'),control('■ STOP','stop'));
      if(id!=='player')transportButtons.append(control('● REC','record','sys-record'));
      const screen=card(titles[id],row(h('span','sys-badge','TRANSPORT SIMULATO'),state),time,transportButtons);
      const seek=h('input','sys-range');seek.type='range';seek.min=0;seek.max=numeric(r.duration,600);seek.step=.1;seek.value=transportPosition(r);seek.setAttribute('aria-label','Posizione di riproduzione');seek.addEventListener('input',()=>{changed(s=>{s.recorder[id].position=Number(seek.value);if(['playing','recording'].includes(s.recorder[id].state))s.recorder[id].startedAt=Date.now();});time.textContent=formatTime(Number(seek.value));});screen.append(seek);
      const config=card('SESSIONE',textInput(id==='player'?'Nome playlist':'Nome registrazione',r.session,value=>changed(s=>s.recorder[id].session=value)));
      if(id!=='player')config.append(select('Tracce registrate',r.tracks,id.startsWith('sd')?[8,16,32,64]:[2,4],value=>changed(s=>s.recorder[id].tracks=Number(value))),select('Risoluzione',r.bitDepth||24,[16,24],value=>changed(s=>s.recorder[id].bitDepth=Number(value))),btn('Routing registrazione',()=>U().open('io',{tab:'outputs',group:id.startsWith('sd')?'CRD':'REC'})));
      else config.append(btn('Routing player',()=>U().open('io',{tab:'sources',group:'PLAY'})));
      config.append(note('Sessioni e tempo scorrono nella simulazione. Non vengono registrati o riprodotti file audio.'));
      const loopCard=card('LOOP / MARKER',row(toggle('Loop',r.loop,value=>changed(s=>s.recorder[id].loop=value)),toggle('Repeat',r.repeat,value=>changed(s=>s.recorder[id].repeat=value))),range('Inizio loop',r.loopStart,0,3600,.1,value=>changed(s=>{s.recorder[id].loopStart=value;if(s.recorder[id].loopEnd<=value)s.recorder[id].loopEnd=value+1;}),'s'),range('Fine loop',r.loopEnd,1,7200,.1,value=>changed(s=>{s.recorder[id].loopEnd=Math.max(value,s.recorder[id].loopStart+.1);}),'s'),btn('Aggiungi marker',()=>{transport(id,'marker');paint();}));
      if(id.startsWith('sd'))loopCard.append(toggle('ALT automatico in playback',r.autoAlt,value=>changed(s=>s.recorder[id].autoAlt=value)));
      const markerList=h('div','sys-list');(r.markers||[]).forEach(marker=>markerList.append(row(btn(formatTime(marker.position)+' · '+marker.name,()=>{changed(s=>{s.recorder[id].position=marker.position;if(['playing','recording'].includes(s.recorder[id].state))s.recorder[id].startedAt=Date.now();});paint();},'sys-small'),btn('×',()=>{changed(s=>s.recorder[id].markers=s.recorder[id].markers.filter(m=>m.id!==marker.id));paint();},'sys-small'))));loopCard.append(markerList);
      const sessionList=h('div','sys-list');(r.sessions||[]).forEach((session,index)=>{
        const item=row(h('span','',session.name),h('span','sys-dim',formatTime(session.duration)),btn('Carica',()=>{changed(s=>{const rec=s.recorder[id];rec.session=session.name;rec.duration=session.duration;rec.position=0;rec.startedAt=null;rec.state='stopped';rec.markers=copy(session.markers||[]);rec.loadedSession=session.id;});paint();},'sys-small'),btn('↑',()=>{changed(s=>moveItem(s.recorder[id].sessions,index,-1));paint();},'sys-small'),btn('↓',()=>{changed(s=>moveItem(s.recorder[id].sessions,index,1));paint();},'sys-small'),btn('×',()=>{changed(s=>s.recorder[id].sessions=s.recorder[id].sessions.filter(v=>v.id!==session.id));paint();},'sys-small'));sessionList.append(item);
      });if(!r.sessions.length)sessionList.append(note('Nessuna sessione. Registra una take virtuale oppure aggiungi una clip demo.'));
      const clipName=h('input','sys-input');clipName.placeholder='Nome clip demo';clipName.setAttribute('aria-label','Nome clip demo');const duration=h('input','sys-input sys-number');duration.type='number';duration.min=1;duration.max=14400;duration.value=180;duration.setAttribute('aria-label','Durata clip demo in secondi');
      const add=btn('Aggiungi clip demo',()=>{const length=clamp(numeric(duration.value,180),1,14400),session={id:uid('clip'),name:clipName.value.trim()||'Clip '+(r.sessions.length+1)+'.wav',duration:length,tracks:r.tracks,markers:[],virtual:true};changed(s=>s.recorder[id].sessions.push(session));paint();});
      const library=card(id==='player'?'PLAYLIST':'SESSIONI',sessionList,row(clipName,duration,add),btn('Esporta elenco sessioni',()=>U().download('Sculpt-'+id+'-sessioni.json',JSON.stringify({format:'sculpt-demo-sessions',recorder:id,sessions:D().get().recorder[id].sessions},null,2),'application/json')));
      container.append(grid(screen,config,loopCard),library);
      timer=setInterval(()=>{const rec=D().get().recorder[id],position=transportPosition(rec);time.textContent=formatTime(position);state.textContent=rec.state.toUpperCase();state.dataset.state=rec.state;if(document.activeElement!==seek)seek.value=position;if(rec.state==='playing'&&!rec.loop&&position>=numeric(rec.duration,600)){if(rec.repeat){transport(id,'rewind');}else{transport(id,'stop');paint();}}},150);
    };paint();return stop;
  }
  const ACTION_TYPES=[['menu','Apri menu / pagina'],['editor','Apri editor canale'],['sof','Vista Sends on Fader'],['layer','Richiama Custom Layer'],['fader','Fader'],['mute','Mute'],['solo','Solo'],['send','Mandata'],['dca','DCA'],['muteGroup','Mute group'],['processorParam','Parametro di un processore / FX'],['wingParameter','Qualsiasi parametro WING'],['scene','Scena'],['talkback','Talkback'],['monitorDim','Dim monitor'],['sourceAlt','Sorgente Main/Alt'],['fxBypass','Attiva FX'],['oscillator','Oscillatore'],['recorder','Recorder'],['wait','Attesa']];
  function firstProcessorAction(context={type:'strip',id:'ch-1',block:'eq'}){
    const processor=D().processor(context),parameter=root.SculptCatalog?.get(context,processor?.model)?.parameters?.find(item=>item.type!=='trigger'&&!item.readOnly);
    return {context,model:processor?.model||'',key:parameter?.key||'',value:parameter?processor.params?.[parameter.key]??parameter.default:0,mode:'set'};
  }
  function defaultAction(type){
    const action={id:uid('action'),type,target:type==='talkback'?'a':type==='monitorDim'?'0':type==='recorder'?'sdA':type==='scene'?D().get().scenes[0]?.id||'':type==='dca'||type==='muteGroup'||type==='fxBypass'||type==='oscillator'?'1':type==='menu'?'bank-menu':type==='sof'?'bus-1':type==='layer'?'all':'ch-1',destination:'bus-1',mode:['mute','solo','muteGroup','talkback','sourceAlt','fxBypass','oscillator','monitorDim'].includes(type)?'toggle':'set',value:type==='recorder'?'play':type==='wait'?1:0,duration:0};
    if(type==='editor')action.tab='channel';if(type==='menu'){action.tab='';action.slot=1;}
    if(type==='processorParam')Object.assign(action,firstProcessorAction());
    if(type==='wingParameter'){action.path='';action.parameterLabel='';}
    return action;
  }
  function menuChoices(){
    const choices=new Map(MENU_PAGES),registered=U().listPages?.()||[];
    for(const page of registered)if(!choices.has(page.id))choices.set(page.id,page.title||page.id);
    return [...choices].map(([value,label])=>({value,label}));
  }
  function macroParameterValue(label,action,definition,update,wire=false){
    const type=definition?.type,items=wire?definition?.items:definition?.options?.map((value,index)=>({value,label:definition.optionLabels?.[index]||String(value)}));
    if(items?.length&&action.mode!=='offset'&&action.mode!=='trigger')return select(label,action.value,items.map(item=>({value:item.value,label:item.label||String(item.value)})),raw=>{const item=items.find(item=>String(item.value)===raw);update(item?.value??raw);});
    const boolean=wire?type===4&&definition.min===0&&definition.max===1:type==='boolean';
    if(boolean&&action.mode!=='offset')return select(label,action.value===true||action.value===1||action.value==='1'?'1':'0',[{value:'0',label:'OFF'},{value:'1',label:'ON'}],value=>update(wire?Number(value):value==='1'));
    const text=textInput(label,action.value??'',raw=>update(wire&&type===7||!wire&&type==='string'?raw:raw.replace(',','.')),wire&&type===7||!wire&&type==='string'?'Testo':'Valore');
    const input=text.querySelector('input');if(wire&&type===7||!wire&&type==='string')input.maxLength=definition?.maxLength||256;else input.inputMode='decimal';
    return text;
  }
  function seedExamples(){
    if(!D().get().demoContentSeeded&&!D().get().scenes.length){const soundcheck=captureScene('Soundcheck'),concert=copy(soundcheck);concert.id=uid('scene');concert.name='Concerto';concert.snapshot.values['ch-1'].level=-3;concert.snapshot.values['bus-13'].level=-10;changed(s=>s.scenes.push(soundcheck,concert));}
    if(!D().get().demoContentSeeded)changed(s=>s.demoContentSeeded=true);
    if(!D().get().macrosSeeded){const firstScene=D().get().scenes[0]?.id;changed(s=>{
      const samples=[[{type:'talkback',target:'a',mode:'toggle',value:true}],[{type:'muteGroup',target:'2',mode:'toggle',value:true}],[{type:'fader',target:'ch-1',mode:'offset',value:1,duration:.2}],[{type:'fader',target:'ch-1',mode:'offset',value:-1,duration:.2}],[{type:'recorder',target:'sdA',value:'record'}],[{type:'recorder',target:'sdA',value:'stop'}],[{type:'monitorDim',target:'0',mode:'toggle',value:true}],firstScene?[{type:'scene',target:firstScene}]:[]];
      s.macros.slice(0,8).forEach((m,i)=>{if(!m.actions?.length)m.actions=(samples[i]||[]).map(a=>Object.assign(defaultAction(a.type),a));});s.macrosSeeded=true;
    });}
  }
  async function runMacro(id){
    const macro=D().get().macros.find(m=>String(m.id)===String(id));if(!macro){toast('Macro non trovata');return {ok:false};}if(activeMacro){toast('Una macro è già in esecuzione');return {ok:false};}if(!macro.actions?.length){U().open('macros',{id:macro.id});toast('Assegna le azioni della macro');return {ok:false};}
    if(live()&&(!L()?.allowMacro||!L().allowMacro(macro)))return {ok:false,error:'Macro WING non autorizzata dal controllo attivo.'};
    const writing=macro.actions.some(action=>!isLocalAction(action)),run={id:macro.id,cancelled:false};activeMacro=run;if(writing)macroUndo=live()?null:D().capture();root.dispatchEvent(new CustomEvent('sculpt-macro-status',{detail:{id:macro.id,running:true}}));
    try{
      const actions=copy(macro.actions),env={controller:C(),desk:D(),catalog:root.SculptCatalog,ui:U(),editor:root.SculptEditor,dcaBank:root.SculptDcaBank,channelList:root.SculptChannelList,fx:root.SculptFX,cancelled:()=>run.cancelled,transport,live:L(),nativeTransport:root.SculptLivePages?.transport};
      await prepareActions(actions,env);const failureVersion=live()&&writing?L().snapshot().failureVersion:undefined;
      for(const action of actions){
        if(run.cancelled)throw new Error('Macro interrotta');
        await executeAction(action,env);
      }
      if(live()&&writing){await L().settled();assertMacroSession(env);if(run.cancelled)throw new Error('Macro interrotta');if(L().snapshot().failureVersion!==failureVersion)throw new Error(L().snapshot().failure||'Comando non confermato dalla WING.');}
      log('Macro: '+macro.name+' · '+macro.actions.length+' azioni');toast('Eseguita · '+macro.name);return {ok:true,count:macro.actions.length};
    }catch(error){log('Macro '+macro.name+': '+error.message);toast(error.message);return {ok:false,error:error.message};}
    finally{activeMacro=null;root.dispatchEvent(new CustomEvent('sculpt-macro-status',{detail:{id:macro.id,running:false}}));}
  }
  function stopMacros(){if(activeMacro){activeMacro.cancelled=true;toast('Interruzione macro richiesta');}}
  function renderMacros(container,args){
    if(args?.id)selection.macro=Number(args.id);
    const paint=()=>{container.replaceChildren();const d=D().get(),macro=d.macros.find(m=>Number(m.id)===selection.macro)||d.macros[0];selection.macro=Number(macro.id);
      const toolbar=h('div','sys-macro-bank');d.macros.forEach(m=>{const b=btn('M'+m.id+' · '+(m.name||'Vuota'),()=>{selection.macro=Number(m.id);paint();},'sys-macro-pick');b.setAttribute('aria-pressed',String(m.id===macro.id));toolbar.append(b);});container.append(toolbar);
      const runButton=btn('▶ Esegui',async()=>{await runMacro(macro.id);if(U().current?.()==='macros')paint();},'desk-primary');runButton.disabled=!macro.actions?.length;
      const controls=row(runButton,btn('■ Interrompi',stopMacros),btn('Svuota pulsante',()=>{changed(state=>{const item=state.macros.find(item=>item.id===macro.id);item.name='';item.actions=[];});paint();},'sys-small'));if(!live())controls.append(btn('Annulla ultima macro',()=>{if(macroUndo){D().recall(macroUndo,SCOPES.map(s=>s[0]),[]);macroUndo=null;toast('Stato precedente ripristinato');paint();}}));
      const nameField=textInput('Nome macro',macro.name,value=>changed(s=>s.macros.find(m=>m.id===macro.id).name=value));
      nameField.querySelector('input').addEventListener('input',event=>changed(s=>s.macros.find(m=>m.id===macro.id).name=event.target.value));
      const settings=card('MACRO '+macro.id,nameField,controls);
      if(live())settings.append(note('Prima dell’esecuzione vengono letti tutti i parametri coinvolti. Ogni azione attende il riscontro del banco; un errore interrompe la sequenza.'));
      const list=h('div','sys-actions');(macro.actions||[]).forEach((action,index)=>{
        const change=(key,value)=>changed(s=>{const a=s.macros.find(m=>m.id===macro.id).actions.find(a=>a.id===action.id);if(a)a[key]=value;});
        const head=row(h('span','sys-action-number',String(index+1).padStart(2,'0')),select('Tipo azione '+(index+1),action.type,ACTION_TYPES.map(([value,label])=>({value,label})),value=>{changed(s=>{s.macros.find(m=>m.id===macro.id).actions[index]=defaultAction(value);});paint();}),btn('↑',()=>{changed(s=>moveItem(s.macros.find(m=>m.id===macro.id).actions,index,-1));paint();},'sys-small'),btn('↓',()=>{changed(s=>moveItem(s.macros.find(m=>m.id===macro.id).actions,index,1));paint();},'sys-small'),btn('×',()=>{changed(s=>s.macros.find(m=>m.id===macro.id).actions.splice(index,1));paint();},'sys-small'));
        const item=card('',head),number=index+1;let choices=[];
        if(['fader','mute','solo','send','sourceAlt','editor'].includes(action.type))choices=stripChoices().filter(s=>action.type!=='sourceAlt'||/^(ch|aux)-/.test(s.value));
        else if(action.type==='dca')choices=d.dca.map(g=>({value:g.id,label:'DCA '+g.id+' · '+g.name}));
        else if(action.type==='muteGroup')choices=d.muteGroups.map(g=>({value:g.id,label:'Mute '+g.id+' · '+g.name}));
        else if(action.type==='scene')choices=d.scenes.map(g=>({value:g.id,label:g.name}));
        else if(action.type==='talkback')choices=[{value:'a',label:'Talk A'},{value:'b',label:'Talk B'}];
        else if(action.type==='monitorDim')choices=[{value:'0',label:'Monitor A'},{value:'1',label:'Monitor B'}];
        else if(action.type==='fxBypass')choices=d.fx.map(f=>({value:f.slot,label:'FX '+f.slot+' · '+f.model}));
        else if(action.type==='oscillator')choices=[{value:'1',label:'Oscillatore 1'},{value:'2',label:'Oscillatore 2'}];
        else if(action.type==='recorder')choices=[{value:'sdA',label:'SD A'},{value:'sdB',label:'SD B'},{value:'usb',label:'USB REC'},{value:'player',label:'Player'}];
        if(choices.length)item.append(select('Destinazione azione '+number,action.target,choices,value=>{change('target',value);if(action.type==='send')paint();}));
        if(action.type==='menu'){
          item.append(select('Menu da aprire '+number,action.target,menuChoices(),value=>{const old=MENU_PAGES.find(entry=>entry[0]===action.target)?.[1],next=MENU_PAGES.find(entry=>entry[0]===value)?.[1];if(macro.actions.length===1&&(!macro.name||macro.name===old||macro.name==='Apri menu / pagina'))changed(state=>state.macros.find(m=>m.id===macro.id).name=next||'Apri menu');change('target',value);change('tab','');paint();}));
          if(MENU_SECTIONS[action.target])item.append(select('Sezione del menu '+number,action.tab||'',[{value:'',label:'Pagina principale'},...MENU_SECTIONS[action.target].map(([value,label])=>({value,label}))],value=>change('tab',value)));
          if(action.target==='fx-editor')item.append(select('Plugin FX da aprire '+number,action.slot||1,d.fx.map(fx=>({value:fx.slot,label:'FX '+fx.slot+' · '+fx.model})),value=>change('slot',Number(value))));
          if(action.target==='wing')item.append(textInput('Percorso da aprire '+number,action.path||'/',value=>change('path',value),'/ch/1/eq'));
        }else if(action.type==='editor'){
          item.append(select('Sezione editor '+number,action.tab||'channel',EDITOR_TABS.map(([value,label])=>({value,label})),value=>{change('tab',value);paint();}));
          if(action.tab==='dynamics')item.append(select('Processore dinamica '+number,action.block||'dyn',[{value:'gate',label:'Gate'},{value:'dyn',label:'Compressore'}],value=>change('block',value)));
        }else if(action.type==='sof')item.append(select('Bus SOF '+number,action.target,[{value:'off',label:'Esci da SOF'},...stripChoices().filter(choice=>/^(bus|mtx)-/.test(choice.value))],value=>change('target',value)));
        else if(action.type==='layer')item.append(select('Custom Layer '+number,action.target,[{value:'all',label:'Tutti i canali'},...d.layers.map(layer=>({value:layer.id,label:layer.name}))],value=>change('target',value)));
        else if(action.type==='processorParam'){
          const ctx=action.context||{type:'strip',id:'ch-1',block:'eq'},setContext=context=>{const patch=firstProcessorAction(context);changed(state=>Object.assign(state.macros.find(m=>m.id===macro.id).actions.find(a=>a.id===action.id),patch));paint();};
          item.append(select('Ambito processore '+number,ctx.type,[{value:'strip',label:'Processore di un canale'},{value:'fx',label:'Slot FX'}],value=>setContext(value==='fx'?{type:'fx',slot:1}:{type:'strip',id:'ch-1',block:'eq'})));
          if(ctx.type==='fx')item.append(select('Slot processore '+number,ctx.slot,d.fx.map(fx=>({value:fx.slot,label:'FX '+fx.slot+' · '+fx.model})),value=>setContext({type:'fx',slot:Number(value)})));
          else{item.append(select('Canale processore '+number,ctx.id,stripChoices(),value=>setContext({...ctx,id:value})),select('Blocco processore '+number,ctx.block,[['filter','Filtri'],['eq','EQ'],['gate','Gate'],['dyn','Compressore']].filter(([block])=>root.SculptCatalog?.list({...ctx,block}).length).map(([value,label])=>({value,label})),value=>setContext({...ctx,block:value})));}
          const processor=D().processor(ctx),parameters=root.SculptCatalog?.get(ctx,processor?.model)?.parameters?.filter(parameter=>parameter.type!=='trigger'&&!parameter.readOnly)||[],parameter=parameters.find(p=>p.key===action.key),remote=live()?L()?.parameterDefinition?.(ctx,action.key):null,definition={...parameter,...remote};
          item.append(note('Modello assegnato: '+(action.model||'—')+'. Cambiare modello richiede una nuova assegnazione.'));
          if(parameters.length){item.append(select('Parametro processore '+number,action.key,parameters.map(p=>({value:p.key,label:p.label||p.name||p.key})),value=>{const parameter=parameters.find(p=>p.key===value);change('key',value);change('model',processor.model);change('value',processor.params?.[value]??parameter.default);change('mode','set');paint();}),select('Operazione parametro '+number,action.mode,[{value:'set',label:'Imposta valore'},{value:'offset',label:'Variazione relativa'},{value:'toggle',label:'Alterna ON / OFF'}],value=>{change('mode',value);paint();}));if(action.mode!=='toggle')item.append(macroParameterValue('Valore parametro '+number,action,definition,value=>change('value',value)));}
          else item.append(note('Questo processore non espone parametri assegnabili nel modello attuale.'));
        }else if(action.type==='wingParameter'){
          const returnToMacro=()=>U().open('macros',{id:macro.id}),browse=btn('Scegli dal banco',()=>{
            if(!L()?.isConnected?.()){toast('Collega la WING per scegliere i parametri reali.');return;}
            L().openExplorer(action.path||'/',{onSelect:entry=>{changed(state=>{const a=state.macros.find(m=>m.id===macro.id)?.actions.find(a=>a.id===action.id);if(!a)return;a.path=entry.path;a.parameterLabel=entry.label;a.value=entry.value??(entry.metadata?.type===7?'':0);a.mode='set';});returnToMacro();},onCancel:returnToMacro});
          },'desk-primary');
          item.append(browse,textInput('Percorso WING azione '+number,action.path||'',value=>{change('path',value);change('parameterLabel','');paint();},'/ch/1/mute'));
          if(action.parameterLabel)item.append(note(action.parameterLabel));
          const meta=L()?.metadata?.(action.path);
          item.append(select('Operazione WING '+number,action.mode,[{value:'set',label:'Imposta valore'},{value:'offset',label:'Variazione relativa'},{value:'toggle',label:'Alterna ON / OFF'},{value:'trigger',label:'Esegui comando WING'}],value=>{change('mode',value);paint();}));
          if(action.mode!=='toggle')item.append(macroParameterValue('Valore WING '+number,action,meta,value=>change('value',value),true));
          item.append(note(meta?meta.readOnly?'Parametro di sola lettura: scegli un altro controllo.':`Schema letto dal banco${meta.min!==undefined?' · minimo '+meta.min:''}${meta.max!==undefined?' · massimo '+meta.max:''}.`:'Lo schema e i valori reali vengono letti dalla WING prima dell’esecuzione. La macro rimane configurabile offline.'));
        }

        if(action.type==='send')item.append(select('Bus / matrice azione '+number,action.destination,targetChoices().filter(s=>C().canSend(action.target,s.value)),value=>change('destination',value)));
        if(['fader','send','dca'].includes(action.type)){
          if(action.type==='fader')item.append(select('Operazione azione '+number,action.mode,[{value:'set',label:'Livello assoluto'},{value:'offset',label:'Variazione relativa'}],value=>change('mode',value)));
          item.append(range('Valore azione '+number,numeric(action.value),-90,10,.1,value=>change('value',value),'dB'),range('Durata fade '+number,numeric(action.duration),0,30,.1,value=>change('duration',value),'s'));
        }else if(['mute','solo','muteGroup','talkback','monitorDim','sourceAlt','fxBypass','oscillator'].includes(action.type))item.append(select('Stato azione '+number,action.mode==='toggle'?'toggle':action.value?'on':'off',[{value:'toggle',label:'Alterna ON / OFF'},{value:'on',label:'ON'},{value:'off',label:'OFF'}],value=>{change('mode',value==='toggle'?'toggle':'set');change('value',value==='on');}));
        else if(action.type==='recorder')item.append(select('Comando recorder '+number,action.value,[{value:'play',label:'Play'},{value:'record',label:'Record'},{value:'pause',label:'Pause / riprendi'},{value:'stop',label:'Stop'},{value:'rewind',label:'Torna all’inizio'},{value:'marker',label:'Aggiungi marker'}],value=>change('value',value)));
        else if(action.type==='wait')item.append(range('Attesa azione '+number,numeric(action.value,1),0,30,.1,value=>change('value',value),'s'));
        list.append(item);
      });
      let newType='';const choose=select(macro.actions.length?'Aggiungi un’altra azione':'Cosa vuoi assegnare?',newType,[{value:'',label:'Scegli un’azione…'},...ACTION_TYPES.map(([value,label])=>({value,label}))],value=>{newType=value;add.disabled=!value||macro.actions.length>=32;});
      const add=btn(macro.actions.length?'+ Aggiungi azione':'Assegna azione',()=>{if(!newType)return;if(macro.actions.length>=32){toast('Massimo 32 azioni per macro');return;}changed(state=>{const item=state.macros.find(m=>m.id===macro.id);item.actions.push(defaultAction(newType));if(!item.name)item.name=newType==='menu'?'Menu del banco':ACTION_TYPES.find(([type])=>type===newType)?.[1]||'Macro '+item.id;});paint();},'desk-primary');add.disabled=true;
      const assign=card(macro.actions.length?'AGGIUNGI ALLA SEQUENZA':'PULSANTE LIBERO',note(macro.actions.length?'Puoi combinare più comandi e aperture di menu in ordine.':'Scegli una funzione del mixer, un parametro oppure il menu da aprire.'),choose,add);
      container.append(settings,list,assign,note('Le azioni vengono eseguite in ordine. I menu si aprono anche in sola lettura; i comandi audio live richiedono Controllo e riscontro dalla WING.'));

    };paint();
  }
  function renderSetup(container){
    const paint=()=>{container.replaceChildren();const d=D().get(),s=d.setup,patch=(key,value)=>changed(x=>x.setup[key]=value);
      container.append(tabs([{id:'audio',label:'Audio / clock'},{id:'hardware',label:'Hardware'},{id:'network',label:'Rete'},{id:'midi',label:'MIDI / GPIO'},{id:'controls',label:'Custom Controls'},{id:'layers',label:'Layer'},{id:'about',label:'Sistema'}],selection.setup,id=>{selection.setup=id;paint();}));
      if(selection.setup==='audio'){
        const clockOptions=['INTERNAL','AES50 A','AES50 B','AES50 C'];if(!['NONE','OFF'].includes(s.module))clockOptions.push('MOD');if(!['NONE','OFF'].includes(s.card))clockOptions.push('CRD');clockOptions.push('StageCONNECT');
        container.append(grid(card('AUDIO ENGINE',select('Sample rate',s.sampleRate,[{value:44100,label:'44.1 kHz'},{value:48000,label:'48 kHz'}],value=>patch('sampleRate',Number(value))),select('Clock source',s.clock,clockOptions,value=>patch('clock',value)),select('USB Audio',s.usbChannels,[{value:2,label:'2 × 2'},{value:8,label:'8 × 8'},{value:16,label:'16 × 16'},{value:32,label:'32 × 32'},{value:48,label:'48 × 48'}],value=>patch('usbChannels',Number(value))),toggle('Mute all’avvio',s.startMute,value=>patch('startMute',value))),card('AES50 · HEADAMP REMOTE',...['A','B','C'].map(port=>toggle('HA Remote AES50 '+port,!!d.io?.haRemote?.[port],value=>changed(x=>{x.io=x.io||{};x.io.haRemote=x.io.haRemote||{};x.io.haRemote[port]=value;}))),note('Configurazione dei controlli remoti dei preamplificatori. Il profilo della demo conserva queste opzioni.'))));
        const mainLink=d.mainLink||{oneTwo:false,threeFour:false};container.append(card('MAIN LINK',toggle('Link MAIN 1 / 2',mainLink.oneTwo,value=>changed(x=>{x.mainLink=x.mainLink||{};x.mainLink.oneTwo=value;})),toggle('Link MAIN 3 / 4',mainLink.threeFour,value=>changed(x=>{x.mainLink=x.mainLink||{};x.mainLink.threeFour=value;}))));
      }else if(selection.setup==='hardware'){
        const stage=typeof s.stageConnect==='object'?s.stageConnect:{inputs:16,outputs:16,mode:'AUTO',power:true};
        container.append(grid(card('PROFILO DEL BANCO',select('Modello',s.model,[{value:'RACK',label:'WING RACK'},{value:'FULL',label:'WING / WING BLACK'},{value:'COMPACT',label:'WING COMPACT'}],value=>{patch('model',value);paint();}),select('Scheda di espansione',s.card,[{value:'WLIVE',label:'WING-LIVE · SD'},{value:'DANTE',label:'W-DANTE'},{value:'MADI',label:'W-MADI'},{value:'NONE',label:'Nessuna scheda'}],value=>{patch('card',value);paint();}),select('Modulo AoIP',s.module,[{value:'DANTE',label:'Dante'},{value:'WSG',label:'Waves SoundGrid'},{value:'NONE',label:'Nessun modulo'}],value=>{patch('module',value);paint();}),note('Le risorse disponibili nel menu I/O seguono questo profilo. Nessuna modifica viene inviata a un mixer.')),card('STAGECONNECT',select('Modo StageCONNECT',stage.mode,['AUTO','MASTER','SLAVE'],value=>patch('stageConnect',Object.assign({},stage,{mode:value}))),range('Canali ingresso',stage.inputs,0,32,1,value=>{patch('stageConnect',Object.assign({},D().get().setup.stageConnect,{inputs:value,outputs:32-value}));},'ch'),h('p','sys-note','Il budget complessivo è 32 canali: le uscite seguono 32 − ingressi.'),toggle('Alimentazione StageCONNECT',stage.power,value=>patch('stageConnect',Object.assign({},D().get().setup.stageConnect,{power:value}))))));
        const ports=h('div','sys-port-grid');for(const [port,title,count]of [['LCL','Locale',D().capacity?.('LCL')||24],['A','AES50 A',48],['B','AES50 B',48],['C','AES50 C',48],['MOD',s.module,D().capacity?.('MOD')||0],['CRD',s.card,D().capacity?.('CRD')||0]]){const c=card(title,h('strong','sys-port-count',count+' in'),h('span','sys-dim','Profilo simulato'));c.append(btn('Apri I/O',()=>U().open('io',{tab:'sources',group:port}),'sys-small'));ports.append(c);}container.append(ports);
      }else if(selection.setup==='network'){
        let ip=s.ip,mask=s.mask||'255.255.255.0',gateway=s.gateway||'192.168.1.1';const validIp=v=>/^\d{1,3}(\.\d{1,3}){3}$/.test(v)&&v.split('.').every(n=>Number(n)<=255);
        const apply=()=>{if(![ip,mask,gateway].every(validIp)){toast('Inserisci indirizzi IPv4 validi');return;}changed(x=>Object.assign(x.setup,{ip,mask,gateway}));log('Profilo rete demo aggiornato');toast('Profilo rete salvato');};
        container.append(card('IDENTITÀ',textInput('Nome console',s.name,value=>patch('name',value)),h('span','sys-badge','MODALITÀ DEMO · NESSUNA CONNESSIONE')),grid(card('RETE DI CONTROLLO',toggle('DHCP',s.dhcp,value=>patch('dhcp',value)),textInput('Indirizzo IP',ip,value=>ip=value),textInput('Maschera',mask,value=>mask=value),textInput('Gateway',gateway,value=>gateway=value),select('Porte Ethernet',s.networkMode,['SWITCH','SPLIT'],value=>patch('networkMode',value)),btn('Salva profilo rete',apply,'desk-primary')),card('CONTROLLO REMOTO',toggle('Remote lock',s.remoteLock,value=>patch('remoteLock',value)),note('Queste impostazioni preparano il profilo della demo. Non avviano una connessione TCP/UDP e non cambiano la rete del dispositivo.'))));
      }else if(selection.setup==='midi'){
        container.append(card('MIDI',select('Ingresso MIDI',s.midiInput,['USB','DIN','USB+DIN'],value=>patch('midiInput',value)),range('Canale MIDI',s.midiChannel,1,16,1,value=>patch('midiChannel',value)),toggle('MIDI OUT',s.midiOut,value=>patch('midiOut',value)),toggle('Program Change → scene',s.scenePc,value=>patch('scenePc',value)),select('Scena per prova Program Change',selectedScene||d.scenes[0]?.id||'',d.scenes.map(scene=>({value:scene.id,label:scene.name})),value=>selectedScene=value),btn('Simula Program Change',()=>{if(!s.scenePc){toast('Program Change disattivato');return;}if(selectedScene||d.scenes[0]?.id)recallScene(selectedScene||d.scenes[0].id);})));const gpios=h('div','sys-group-grid');d.gpio.forEach((gpio,index)=>{
          const patchG=(key,value)=>changed(x=>x.gpio[index][key]=value);gpios.append(card('GPIO '+gpio.id,textInput('Nome GPIO '+gpio.id,gpio.name,value=>patchG('name',value)),select('Modo GPIO '+gpio.id,gpio.mode,['PUSH','LATCH','DELAY'],value=>patchG('mode',value)),select('Macro GPIO '+gpio.id,gpio.macroId,d.macros.map(m=>({value:m.id,label:'M'+m.id+' · '+m.name})),value=>patchG('macroId',Number(value))),range('Ritardo GPIO '+gpio.id,gpio.delay,0,30,.1,value=>patchG('delay',value),'s'),btn('Simula impulso',()=>{const current=D().get().gpio[index];if(current.mode==='DELAY'&&current.delay>0){toast('Impulso fra '+current.delay+' s');setTimeout(()=>runMacro(current.macroId),current.delay*1000);}else runMacro(current.macroId);})));});container.append(gpios,note('MIDI e GPIO vengono simulati dai pulsanti. Nessuna porta hardware viene aperta.'));
      }else if(selection.setup==='controls'){
        const bank=h('div','sys-group-grid');d.customControls.forEach((control,index)=>{
          const patchControl=(key,value)=>changed(x=>x.customControls[index][key]=value),c=card((control.type==='encoder'?'ENCODER ':'TASTO ')+control.id,textInput('Nome controllo '+control.id,control.name,value=>patchControl('name',value)));
          if(control.type==='encoder'){c.append(select('Fader assegnato '+control.id,control.target,stripChoices(),value=>{patchControl('target',value);paint();}),range('Valore encoder '+control.id,C().getStrip(control.target)?.level||0,-90,10,.1,value=>{patchControl('value',value);C().updateStrip(D().get().customControls[index].target,{level:value});},'dB'));}
          else c.append(select('Macro controllo '+control.id,control.macroId,d.macros.map(m=>({value:m.id,label:'M'+m.id+' · '+m.name})),value=>patchControl('macroId',Number(value))),btn('Premi · '+control.name,()=>runMacro(D().get().customControls[index].macroId),'sys-custom-key'));
          bank.append(c);
        });container.append(note('Assegnazioni dei controlli personalizzati nel profilo demo. I pulsanti eseguono le macro e gli encoder muovono il fader assegnato.'),bank);
      }else if(selection.setup==='layers'){
        const layers=h('div','sys-layers-page');container.append(layers);renderLayers(layers);
      }else{
        const history=h('div','sys-history');d.history.slice(0,20).forEach(event=>history.append(row(h('time','sys-dim',new Date(event.time).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})),h('span','',event.message))));if(!d.history.length)history.append(note('Le azioni della demo appariranno qui.'));
        container.append(grid(card('SCULPT WING',h('strong','sys-version','0.4 · Full console demo'),h('p','sys-note','Profilo: '+s.model+' · Firmware di riferimento '+s.firmware),note('Interfacce e controlli agiscono sul banco locale simulato. Nessun audio, firmware o comando viene trasferito a un mixer.'),btn('Esporta progetto',()=>{selection.scenes='project';U().open('scenes');})),card('STATO DEL PROGETTO',h('p','sys-note',strips().length+' strip · '+d.fx.length+' slot FX · '+d.dca.length+' DCA · '+d.muteGroups.length+' mute groups'),h('p','sys-note',d.scenes.length+' scene · '+d.macros.length+' macro'),btn('Guida offline',()=>root.SculptOffline?.openHelp?.()))),card('REGISTRO AZIONI',history,btn('Svuota registro',()=>{changed(x=>x.history=[]);paint();},'sys-small')));
      }
    };paint();
  }
  function init(){
    if(!C()||!D()||!U())return;
    ensureState();seedExamples();restoreLayerPreference();
    const definitions=[
      ['groups','DCA / Mute Groups','Assegnazioni, gruppi e automix',renderGroups],
      ['monitor','Monitor / Talkback','Ascolti, solo e comunicazione',renderMonitor],
      ['meters','Meter / RTA','Meter bridge e strumenti del banco',renderMeters],
      ['scenes','Scenes / Library','Show, snapshot, snippet e progetti',renderScenes],
      ['recorder','Recorder / Player','WING-LIVE e USB · simulazione',renderRecorder],
      ['setup','Setup','Profilo hardware e configurazione',renderSetup],
      ['layers','Custom Layer','Due righe · ordine dei fader',renderLayers],
      ['macros','Macro Sculpt','Azioni e sequenze del banco',renderMacros]
    ];
    for(const [id,title,subtitle,render]of definitions)U().register(id,{title,subtitle,render(container,args){
      if(args?.tab&&MENU_SECTIONS[id]?.some(item=>item[0]===args.tab)&&id in selection)selection[id]=args.tab;
      currentPage=id;let cleanup=null,disposed=false,mode=live()?L().snapshot().mode+':'+L().isWritable():'demo';
      const draw=()=>{if(disposed)return;container.replaceChildren();cleanup=render(container,args);};
      if(live()&&['groups','monitor'].includes(id)){
        if(!L().isConnected())container.append(note('Collega la WING per leggere i valori del banco.'),btn('Connessione WING',()=>L().open(),'desk-primary'));
        else{container.append(note('Lettura dei valori dalla WING…'));L().loadScope(id).then(draw).catch(e=>{if(!disposed){container.replaceChildren(note(e.message),wingButton(id==='groups'?'/dca':'/cfg/mon'));}});}
      }else draw();
      const sync=()=>{if(disposed||!live())return;for(const control of container.querySelectorAll('[data-wing-path]'))control.wingSync?.();};
      const valuesOff=C().subscribe(event=>{if(event?.type==='live-values')sync();});
      const statusOff=L()?.subscribe?.(state=>{const next=state.mode+':'+state.writable;if(!disposed&&next!==mode){mode=next;U().refresh();}});
      container.addEventListener('focusout',sync);
      return()=>{disposed=true;currentPage=null;cleanup?.();valuesOff?.();statusOff?.();container.removeEventListener('focusout',sync);};
    }});
    D().subscribe(event=>{if(event.type==='restore'){ensureState();seedExamples();}if(['restore','reset','recall','console','layer-layout','layer','systems-init'].includes(event.type))syncLayer();});
    syncLayer();
    root.SculptSystems={runMacro,stopMacros,transport,recallScene,formatTime,validateProject,executeAction,refresh:()=>U().refresh()};
    root.dispatchEvent(new CustomEvent('sculpt-systems-ready'));
  }
  if(root.SculptUI)init();else root.addEventListener('sculpt-ui-ready',init,{once:true});
})(typeof window!=='undefined'?window:globalThis);
