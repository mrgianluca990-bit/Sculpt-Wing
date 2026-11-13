(function(){
  'use strict';
  const C=window.SculptController,D=window.SculptDesk,U=window.SculptUI,MapAPI=window.SculptWingMap;
  if(!C||!D||!U||!MapAPI||!window.SculptLiveSession)return;
  const native=window.SculptNative,available=!!native?.available;
  const clone=v=>JSON.parse(JSON.stringify(v));
  let demoSnapshot=null,lastToast=0,lastToastMessage='',explorerPath='/',explorerGeneration=0;
  const noDriver={onValue:()=>()=>{},onStatus:()=>()=>{},onMeters:()=>()=>{}};
  const toast=message=>{const now=Date.now();if(message===lastToastMessage&&now-lastToast<1800)return;lastToast=now;lastToastMessage=message;U.toast(message);};
  const session=new window.SculptLiveSession.Session({driver:native?.driver||noDriver,map:MapAPI,
    getState:()=>C.getState(),mutate:(fn,type)=>C.transact(fn,type),onUpdate:kind=>update(kind),onError:toast});
  const listeners=new Set();let updating=false;
  const statusLabels={demo:'DEMO',disconnected:'WING · scollegata',connecting:'Connessione…',syncing:'Lettura banco…',live:'WING LIVE',suspended:'WING · in pausa',error:'WING · errore'};
  const liveButton=U.button('',()=>U.open('connection'),'live-link');liveButton.id='wing-connection';
  liveButton.setAttribute('aria-label','Connessione WING');liveButton.append(U.el('i','live-link-dot'),U.el('span','live-link-text','WING'));
  document.querySelector('.macro-rail')?.insertBefore(liveButton,document.getElementById('offline-button'));

  function update(kind){
    if(kind!=='meters'){
      const s=session.snapshot();document.documentElement.dataset.wingMode=s.mode;
      liveButton.dataset.mode=s.mode;liveButton.title=s.error||statusLabels[s.mode];
      liveButton.querySelector('span').textContent=s.mode==='live'?(s.pending?`WING · ${s.pending}`:'WING'):s.mode==='syncing'?`${s.syncDone}/${s.syncTotal}`:'WING';
      document.querySelectorAll('.desk-badge:not(.fx-family-badge)').forEach(b=>{if(b.closest('.desk-profile')||b.parentElement?.classList.contains('desk-page-header'))b.textContent=statusLabels[s.mode];});
      const corner=document.querySelector('.demo-corner');if(corner)corner.textContent=s.mode==='demo'?'DEMO · METER SIMULATI':s.mode==='live'?(s.writable?'WING LIVE · CONTROLLO':'WING LIVE · LETTURA'):statusLabels[s.mode].toUpperCase();
      if(!updating){updating=true;try{C.refresh?.();}finally{updating=false;}}
      for(const listener of listeners)listener(s);
      window.dispatchEvent(new CustomEvent('sculpt-live-state',{detail:s}));
    }
  }
  async function connect(host){
    if(!available)throw new Error('La connessione diretta richiede l’app installata su iPhone/iPad, Mac o Windows.');
    if(!demoSnapshot)demoSnapshot=C.capture();
    window.SculptSystems?.stopMacros();
    try{localStorage.setItem('sculpt-wing-host',host);}catch{}
    await session.connect(host);
  }
  async function disconnect(toDemo=false){
    window.SculptSystems?.stopMacros();await session.disconnect(toDemo);
    if(toDemo&&demoSnapshot){const saved=demoSnapshot,macros=clone(D.get().macros||[]),macrosSeeded=D.get().macrosSeeded;saved.desk=saved.desk||{};saved.desk.macros=macros;saved.desk.macrosSeeded=macrosSeeded;demoSnapshot=null;C.restore(saved);}
    update();
  }
  const unitNames={0:'',1:'dB',2:'%',3:'ms',4:'Hz',5:'m',6:'s',7:'oct'};
  function parameterDefinition(ctx,key){
    const spec=MapAPI.processorSpec(ctx,D.processor(ctx)?.model),path=spec?.parameterPath(key),meta=path&&session.metadata.get(path);
    // A duplicated source key cannot address two different controls safely.
    // Keep both visible, but disable them until their wire keys are distinct.
    if(spec?.ambiguousKeys?.includes(key))return {readOnly:true};
    if(!meta)return null;
    const out={readOnly:meta.readOnly,revision:meta.revision,path};if(meta.unit&&unitNames[meta.unit])out.unit=unitNames[meta.unit];
    if(meta.type===5||meta.type===6){out.type='enum';out.options=meta.items.map(item=>item.value);out.optionLabels=meta.items.map(item=>item.label);}
    else if(meta.type===4&&meta.min===0&&meta.max===1){out.type='boolean';out.min=0;out.max=1;out.step=1;}
    else if(meta.type===7){out.type='string';out.maxLength=meta.maxLength;}
    else{out.type='number';if(meta.min!==undefined)out.min=meta.min;if(meta.max!==undefined)out.max=meta.max;if(meta.type===3){out.min=-144;out.max=10;}out.log=meta.type===2;if(meta.type===4)out.step=1;}
    // Keep the catalog's unit label: wire unit codes are not universally physical units.
    return out;
  }
  async function triggerProcessor(ctx,key){
    const spec=MapAPI.processorSpec(ctx,D.processor(ctx)?.model),path=spec?.parameterPath(key);if(!path)throw new Error('Azione non disponibile.');
    await session.write(path,1,{trigger:true});await session.ensureProcessor(ctx,{force:true});toast('Azione inviata; parametri riletti dalla WING.');
  }
  function loadScope(scope,args){return session.loadScope(scope,args).catch(e=>{toast(e.message);throw e;});}
  function hasStripValue(id,target){
    if(!session.active())return true;
    const path=target?MapAPI.sendPath?.(id,target,'level'):MapAPI.stripPath(id)+'/fdr';
    return !!path&&session.values.has(path);
  }
  function allowMacro(macro){
    if(!session.active())return true;
    const local=new Set(['menu','editor','sof','layer','wait']);
    if(macro.actions?.every(action=>local.has(action.type)))return true;
    const supported=new Set(['menu','editor','sof','layer','processorParam','wingParameter','fader','mute','solo','send','dca','muteGroup','talkback','monitorDim','sourceAlt','fxBypass','oscillator','wait']);
    if(typeof window.SculptLivePages?.transport==='function')supported.add('recorder');
    if(!session.connected()||!session.writable){toast('Collega la WING e attiva Controllo prima di eseguire una macro.');return false;}
    if(macro.actions?.some(action=>!supported.has(action.type))){toast('Questa macro contiene azioni locali non disponibili sul banco. Per le scene usa Show Control WING.');return false;}return true;
  }
  window.SculptLive={
    isLive:()=>session.active(),isConnected:()=>session.connected(),isWritable:()=>session.writable,
    canPersist:()=>!session.active(),sessionToken:()=>session.epoch,snapshot:()=>session.snapshot(),meter:(id,tap)=>session.meter(id,tap),
    gainReduction:id=>session.gainReduction(id),
    processorState:ctx=>session.processorState(ctx),parameterDefinition,
    ensureProcessor:(ctx,options)=>session.ensureProcessor(ctx,options),triggerProcessor,
    applyProcessorPreset:(ctx,preset)=>session.processorPreset(ctx,preset).catch(e=>{toast(e.message);throw e;}),
    reviewMutation(before,after,type){const result=session.review(before,after,type);if(!result.ok)toast(result.reason);return result.ok;},
    applying:()=>session.applying,hasStripValue,loadScope,allowMacro,
    hasValue:path=>session.values.has(path),value:path=>session.values.get(path),metadata:path=>session.metadata.get(path),
    nodeState:path=>({loaded:session.loaded.has(path),hasValue:session.values.has(path),metadata:session.metadata.get(path)}),
    readNode:(path,options)=>session.loadNode(path,options),write:(path,value,options)=>session.write(path,value,options),
    settled:()=>session.settled(),
    ready:()=>available,open:()=>U.open('connection'),openExplorer:(path,options={})=>{explorerPath=path||'/';U.open('wing',options);},
    pageOpened(id,args){
      if(!session.connected())return;
      const scopes={fx:'fx',io:'io',groups:'groups',monitor:'monitor',setup:'setup'};
      if(scopes[id])return loadScope(scopes[id],args).catch(()=>{});
    },
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
  };
  C.subscribe(event=>{
    if(session.applying||!session.connected())return;
    if(event.type==='selection')loadScope('strip',{id:event.id}).catch(()=>{});
    if(event.type==='sof'&&event.sof)loadScope('sends',{targetId:event.sof}).catch(()=>{});
  });

  function renderConnection(container){
    const intro=U.el('div','live-intro'),mark=U.el('div','live-icon','W');
    const titles=U.el('div');titles.append(U.el('p','desk-eyebrow','SCULPT WING · 0.6'),U.el('h2','',available?'Collega il tuo banco.':'Un’interfaccia, due modalità.'));
    intro.append(mark,titles);container.append(intro);
    const state=U.el('div','live-connection-state');state.setAttribute('role','status');
    const ip=U.el('input','desk-input live-ip');ip.type='text';ip.inputMode='decimal';ip.autocomplete='off';ip.spellcheck=false;ip.setAttribute('aria-label','Indirizzo IP della WING');
    try{ip.value=localStorage.getItem('sculpt-wing-host')||'192.168.1.100';}catch{ip.value='192.168.1.100';}
    const form=U.el('form','live-connect-form'),connectButton=U.button('Connetti',null,'desk-primary');connectButton.type='submit';
    const disconnectButton=U.button('Disconnetti',()=>disconnect().catch(e=>toast(e.message)));
    form.append(U.field('IP WING',ip),connectButton,disconnectButton);
    form.addEventListener('submit',e=>{e.preventDefault();connect(ip.value.trim()).catch(error=>toast(error.message));});
    const writable=U.button('Attiva controllo',()=>{try{session.setWritable(!session.writable);}catch(e){toast(e.message);}},'live-arm');
    writable.setAttribute('role','switch');
    const progress=U.el('progress','live-progress');progress.max=76;
    const metrics=U.el('div','live-metrics'),controls=U.el('div','live-actions');controls.append(writable,U.button('Parametri WING',()=>U.open('wing')),U.button('Torna alla demo',()=>disconnect(true).catch(e=>toast(e.message))));
    container.append(U.card('RETE LOCALE',state,form,progress,metrics,controls));
    if(!available){
      connectButton.disabled=true;ip.disabled=true;
      container.append(U.card('APP IPHONE / IPAD · MAC · WINDOWS',U.el('p','desk-note','In Safari e Chrome puoi provare e conservare l’interfaccia offline. Le app installate su iPhone/iPad, Mac e Windows usano questa stessa interfaccia e comunicano direttamente con il mixer sulla rete locale.'),U.el('p','desk-note','Apri Sculpt Wing installato sul dispositivo per collegarti al banco. Questa pagina web serve per provare l’interfaccia e preparare la configurazione offline.')));
    }
    container.append(U.card('PRIMO COLLEGAMENTO',U.el('p','desk-note','Collega WING e dispositivo alla stessa rete, inserisci l’IP mostrato dal banco e consenti l’accesso alla rete locale. Il collegamento legge prima i valori WING. Attiva Controllo quando vuoi inviare modifiche.'),U.el('p','desk-note','Le modifiche vengono rilette dal banco. Un’interruzione o la sospensione dell’app annulla i comandi in attesa e richiede una nuova connessione. I valori della demo non vengono caricati sul mixer.')));
    const diagnostic=U.button('Esporta diagnostica',()=>{
      const data={format:'sculpt-control-diagnostics',version:'0.6.0',createdAt:new Date().toISOString(),platform:native?.platform||'web',state:session.snapshot(),nodes:[...session.metadata.values()].map(n=>({path:n.path,type:n.type,min:n.min,max:n.max,revision:n.revision,readOnly:n.readOnly})),coverage:MapAPI.coverage||null};
      U.download('Sculpt-Wing-diagnostica.json',JSON.stringify(data,null,2));
    });container.append(diagnostic);
    const sync=s=>{
      state.replaceChildren(U.el('span','live-state-dot'),U.el('strong','',statusLabels[s.mode]),U.el('span','',s.info?`${s.info.name} · ${s.info.model} · ${s.info.firmware}`:'Nessun mixer connesso'));
      if(s.error)state.append(U.el('p','live-error',s.error));state.dataset.mode=s.mode;
      const busy=['connecting','syncing','live'].includes(s.mode);connectButton.disabled=!available||busy;ip.disabled=!available||busy;disconnectButton.disabled=['demo','disconnected'].includes(s.mode);
      progress.hidden=s.mode!=='syncing';progress.value=s.syncDone;progress.max=s.syncTotal;
      writable.disabled=s.mode!=='live';writable.setAttribute('aria-checked',String(s.writable));writable.classList.toggle('on',s.writable);writable.textContent=s.writable?'Controllo attivo':'Attiva controllo';
      metrics.replaceChildren(U.el('span','',`${s.loaded} valori letti`),U.el('span','',`${s.pending} modifiche in attesa`),U.el('span','',s.mode==='live'?(s.meterAge!==null&&s.meterAge<1200?'Meter UDP ricevuti':'In attesa dei meter UDP'):available?'TCP + UDP diretti':'Anteprima web'));
    };sync(session.snapshot());listeners.add(sync);const timer=setInterval(()=>sync(session.snapshot()),1000);return()=>{listeners.delete(sync);clearInterval(timer);};
  }

  function formatValue(value){if(value===undefined)return '—';if(typeof value==='number')return Number(value.toFixed(5)).toString();return String(value);}
  function renderExplorer(container,args={}){
    let disposed=false;const generation=++explorerGeneration;
    const top=U.el('div','wing-explorer-top'),pathInput=U.el('input','desk-input');pathInput.value=explorerPath;pathInput.placeholder='/ch/1/eq';pathInput.setAttribute('aria-label','Percorso parametro WING');
    const nav=U.el('form','wing-path');nav.append(U.field('Percorso sul banco',pathInput));const go=U.button('Apri',null,'desk-primary');go.type='submit';nav.append(go,U.button('↑',()=>navigate(explorerPath.replace(/\/[^/]+\/?$/,'')||'/')),U.button('Rileggi',()=>load(true)));
    top.append(U.el('p','desk-note',args.onSelect?'Scegli un parametro da assegnare alla macro. La selezione non modifica alcun valore del banco.':'Struttura e parametri dichiarati dal firmware collegato. Qui trovi anche le funzioni che non hanno ancora un pannello Sculpt dedicato.'),nav);
    if(args.onSelect&&args.onCancel)top.append(U.button('Torna alla macro',args.onCancel));
    const status=U.el('p','desk-note'),list=U.el('div','wing-nodes');container.append(top,status,list);
    nav.addEventListener('submit',e=>{e.preventDefault();navigate(pathInput.value.trim()||'/');});
    async function navigate(path){explorerPath=path;pathInput.value=path;await load();}
    async function load(refresh=false){
      if(!session.connected()){status.textContent='Collega la WING per leggere i parametri reali.';list.replaceChildren(U.button('Apri connessione',()=>U.open('connection'),'desk-primary'));return;}
      const target=explorerPath,epoch=session.epoch;status.textContent='Lettura dal banco…';list.replaceChildren();
      try{
        const own=await native.driver.describe(target);
        const definitions=own.type===0?await native.driver.list(target,{refresh}):[own];
        session.assert(epoch);let values;
        if(own.type===0)values=await native.driver.readTree(target);
        else values={[target]:await native.driver.get(target)};
        session.assert(epoch);if(disposed||generation!==explorerGeneration||target!==explorerPath)return;
        for(const def of definitions)session.metadata.set(def.path,def);
        for(const [p,v]of Object.entries(values))session.receive(p,v);session.flush();
        if(disposed||generation!==explorerGeneration||target!==explorerPath)return;
        status.textContent=`${definitions.length} elementi · ${session.writable?'Controllo attivo':'Sola lettura'}`;
        for(const meta of definitions){
          const row=U.el('div','wing-node'),label=U.el('div','wing-node-label');label.append(U.el('strong','',meta.longName||meta.name||'/'),U.el('code','',meta.path));
          row.append(label);
          if(meta.type===0){row.append(U.button('Apri ›',()=>navigate(meta.path)));list.append(row);continue;}
          const value=values[meta.path]??session.values.get(meta.path),valueEl=U.el('output','wing-node-value',formatValue(value));row.append(valueEl);
          if(meta.readOnly){row.append(U.el('span','wing-read-only','LETTURA'));list.append(row);continue;}
          if(typeof args.onSelect==='function'){const choose=U.button('Usa nella macro',()=>{if(!session.connected()||epoch!==session.epoch){toast('La sessione WING è cambiata. Rileggi il parametro.');return;}const current=session.metadata.get(meta.path);if(!current||current.readOnly||current.revision!==meta.revision){toast('Lo schema è cambiato. Rileggi il parametro.');return;}args.onSelect({path:meta.path,label:meta.longName||meta.name||meta.path,value:session.values.get(meta.path),metadata:clone(current)});});choose.setAttribute('aria-label','Usa nella macro '+meta.path);row.append(choose);list.append(row);continue;}
          let input;
          if(meta.items){input=U.el('select','desk-input');for(const item of meta.items){const option=U.el('option','',item.label||String(item.value));option.value=String(item.value);input.append(option);}input.value=String(value??'');}
          else{input=U.el('input','desk-input');input.type=meta.type===7?'text':'number';input.value=formatValue(value)==='—'?'':String(value);if(meta.type===7)input.maxLength=meta.maxLength||256;else{input.inputMode='decimal';input.step=meta.type===4?'1':'any';if(meta.min!==undefined)input.min=meta.min;if(meta.max!==undefined)input.max=meta.max;if(meta.type===3){input.min=-144;input.max=10;}}}
          input.setAttribute('aria-label',`${meta.longName||meta.name} · ${meta.path}`);
          const apply=U.button('Invia',async()=>{
            const raw=meta.items?meta.items.find(item=>String(item.value)===input.value)?.value:meta.type===7?input.value:Number(input.value);
            if(raw===undefined||typeof raw==='number'&&!Number.isFinite(raw)){toast('Inserisci un valore valido.');return;}
            apply.disabled=true;
            try{await session.write(meta.path,raw);valueEl.textContent=formatValue(session.values.get(meta.path)??await native.driver.get(meta.path));toast('Valore riletto dal banco.');}
            catch(e){toast(e.message);valueEl.textContent=formatValue(session.values.get(meta.path));}
            finally{apply.disabled=!session.writable;}
          });input.disabled=!session.writable;apply.disabled=!session.writable;row.append(input,apply);list.append(row);
        }
      }catch(e){if(!disposed){status.textContent=e.message;status.classList.add('live-error');}}
    }
    load();return()=>{disposed=true;};
  }
  U.register('connection',{title:'Connessione WING',subtitle:'Mixer · Router · Dispositivo',menuHint:'Rete · Controllo',render:renderConnection});
  U.register('wing',{title:'Parametri WING',subtitle:'Valori e struttura dal firmware',menuHint:'Editor completo del banco',render:renderExplorer});
  if(available){demoSnapshot=C.capture();session.mode='disconnected';}
  update();
})();
