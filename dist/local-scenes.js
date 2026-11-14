(function(root){
  'use strict';
  const FORMAT='sculpt-wing-scene',VERSION=1,MAX_BYTES=32*1024*1024,MAX_ENTRIES=60000,MAX_UNIT_NODES=4096;
  // Remote Protocols 3.1.2-a: ae_data scopes. Console globals, transport,
  // libraries, $ temporary fields and momentary commands are never snapshots.
  // There is no documented "transient" bit in NodeDefinition.flags.
  const SCOPES=Object.freeze([
    {id:'ch',label:'Canali CH',roots:['/ch']},{id:'aux',label:'AUX',roots:['/aux']},
    {id:'bus',label:'Bus',roots:['/bus']},{id:'main',label:'Main',roots:['/main']},{id:'mtx',label:'Matrix',roots:['/mtx']},
    {id:'fx',label:'Rack FX',roots:['/fx']},{id:'groups',label:'DCA / Mute groups',roots:['/dca','/mgrp','/cfg/dcamgrp','/cfg/amix']},
    {id:'sources',label:'Sorgenti / preamplificatori',roots:['/io/in','/io/altsw','/io/autoaltovr']},
    {id:'outputs',label:'Patch uscite',roots:['/io/out']},
    {id:'monitor',label:'Monitor / Talkback / Solo',roots:['/cfg/mainlink','/cfg/mon','/cfg/solo','/cfg/talk','/cfg/rta','/cfg/mtr']}
  ]);
  const COUNTS={ch:40,aux:8,bus:16,main:4,mtx:8,fx:16,dca:16,mgrp:8};
  const BANKS=new Set(['LCL','AUX','A','B','C','SC','USB','CRD','MOD','PLAY','AES','USR','OSC','REC']);
  const COMMANDS=new Set(['load','save','reset','clear','init','trigger','action','savenow','format','delete','recall','reload','calibrate']);
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),inside=(path,base)=>path===base||path.startsWith(base+'/');
  const clone=v=>JSON.parse(JSON.stringify(v)),message=e=>e?.message||String(e);
  const uid=()=>root.crypto?.randomUUID?.()||'scene-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const scalar=value=>typeof value==='string'||typeof value==='number'&&Number.isFinite(value);
  const plain=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
  function canonical(path){return typeof path==='string'&&path.length<=256&&/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(path)&&!path.split('/').some(p=>['__proto__','constructor','prototype'].includes(p));}
  function unitRoot(path){
    let m=/^\/(ch|aux|bus|main|mtx|fx|dca|mgrp)\/([1-9][0-9]*)(?:\/|$)/.exec(path);
    if(m&&Number(m[2])<=COUNTS[m[1]])return '/'+m[1]+'/'+m[2];
    m=/^\/io\/(in|out)\/([A-Z0-9]+)\/([1-9][0-9]*)(?:\/|$)/.exec(path);
    if(m&&BANKS.has(m[2])&&Number(m[3])<=64)return '/io/'+m[1]+'/'+m[2]+'/'+m[3];
    m=/^\/cfg\/(mon\/[12]|solo|talk|amix|rta|mtr)(?:\/|$)/.exec(path);
    if(m)return '/cfg/'+m[1];
    if(['/cfg/mainlink','/cfg/dcamgrp','/io/altsw','/io/autoaltovr'].includes(path))return path;
    return null;
  }
  function scopeFor(path){return SCOPES.find(scope=>scope.roots.some(base=>inside(path,base)))?.id||null;}
  function allowed(path){return canonical(path)&&!!unitRoot(path)&&!!scopeFor(path)&&!COMMANDS.has(path.split('/').at(-1).toLowerCase());}
  function branchAllowed(path){return canonical(path)&&SCOPES.some(scope=>scope.roots.some(base=>inside(path,base)||inside(base,path)))&&!COMMANDS.has(path.split('/').at(-1).toLowerCase());}
  function cleanScopes(scopes){
    if(!Array.isArray(scopes)||!scopes.length||scopes.length>SCOPES.length||new Set(scopes).size!==scopes.length||scopes.some(id=>!SCOPES.some(s=>s.id===id)))throw new Error('Seleziona almeno un gruppo audio valido.');
    return [...scopes];
  }
  function schemaOf(meta){
    const out={type:meta.type};
    for(const key of ['unit','min','max','steps','maxLength'])if(meta[key]!==undefined)out[key]=meta[key];
    if(meta.type===5||meta.type===6)out.items=(meta.items||[]).map(item=>plain(item)?item.value:item);
    return out;
  }
  function validateValue(value,meta,path){
    if(!meta||meta.readOnly||![1,2,3,4,5,6,7].includes(meta.type))throw new Error('Parametro non scrivibile: '+path);
    if(!scalar(value))throw new Error('Valore non valido: '+path);
    if([1,2,3,4,6].includes(meta.type)&&typeof value!=='number')throw new Error('Valore numerico richiesto: '+path);
    if(typeof value==='number'&&!Number.isFinite(Math.fround(value)))throw new Error('Valore fuori dal formato WING a 32 bit: '+path);
    if(meta.type===4&&(!Number.isInteger(value)||value < -0x80000000||value > 0x7fffffff))throw new Error('Intero a 32 bit richiesto: '+path);
    if([5,7].includes(meta.type)&&typeof value!=='string')throw new Error('Testo richiesto: '+path);
    if(typeof value==='number'&&(meta.min!==undefined&&value<meta.min||meta.max!==undefined&&value>meta.max))throw new Error('Valore fuori intervallo: '+path);
    if(meta.type===3&&(value < -144||value > 10))throw new Error('Livello fader fuori intervallo: '+path);
    if(typeof value==='string'&&(value.includes('\0')||new TextEncoder().encode(value).length>Math.min(256,meta.type===7?(meta.maxLength??0):256)))throw new Error('Testo troppo lungo o limite non disponibile: '+path);
    if([5,6].includes(meta.type)&&(!Array.isArray(meta.items)||!meta.items.some(item=>{const v=plain(item)?item.value:item;return meta.type===6?typeof v==='number'&&Math.fround(v)===Math.fround(value):v===value;})))throw new Error('Opzione non disponibile: '+path+' = '+value);
    return value;
  }
  function sameValue(a,b,meta){
    if(Object.is(a,b))return true;
    if(typeof a!=='number'||typeof b!=='number'||!Number.isFinite(a)||!Number.isFinite(b))return false;
    if(meta?.type===6)return Math.fround(a)===Math.fround(b);
    if(![1,2,3].includes(meta?.type))return false;
    const epsilon=Math.max(Math.abs(Math.fround(b)),Math.abs(a),1e-20)*2**-22;
    if(Math.abs(a-b)<=epsilon)return true;
    if(meta.type===1&&meta.steps>1&&Number.isFinite(meta.min)&&Number.isFinite(meta.max))return Math.abs(a-b)<=(meta.max-meta.min)/(meta.steps-1)/2+epsilon;
    if(meta.type===2&&meta.steps>1&&meta.min>0&&meta.max>meta.min&&a>0&&b>0)return Math.abs(Math.log(a/b))<=Math.log(meta.max/meta.min)/(meta.steps-1)/2+2**-22;
    return false;
  }
  function schemaKey(meta){return JSON.stringify([meta?.path,meta?.revision,!!meta?.readOnly,schemaOf(meta||{})]);}
  function normalize(input){
    if(!plain(input)||input.format!==FORMAT||input.version!==VERSION)throw new Error('Scegli una scena WING esportata da Sculpt (.sculpt-wing-scene.json). I progetti demo e i file Snap nativi hanno un formato diverso.');
    if(typeof input.name!=='string'||!input.name.trim()||input.name.length>200)throw new Error('Nome scena non valido.');
    if(!plain(input.source)||input.source.kind!=='wing-read'||!plain(input.source.console))throw new Error('La scena non contiene la provenienza dei valori WING letti.');
    if(!Array.isArray(input.entries)||!input.entries.length||input.entries.length>MAX_ENTRIES)throw new Error('Numero di parametri della scena non valido.');
    const scopes=cleanScopes(input.scopes),paths=new Set(),entries=[];
    for(const entry of input.entries){
      if(!plain(entry)||!allowed(entry.path)||!scopes.includes(scopeFor(entry.path))||paths.has(entry.path)||!plain(entry.schema))throw new Error('Percorso duplicato, non audio o non supportato nella scena: '+String(entry?.path).slice(0,256));
      const schema=schemaOf(entry.schema);
      for(const key of ['unit','min','max','steps','maxLength'])if(schema[key]!==undefined&&!Number.isFinite(schema[key]))throw new Error('Schema del parametro non valido: '+entry.path);
      if(schema.items&&(schema.items.length>4096||schema.items.some(item=>!scalar(item))))throw new Error('Elenco opzioni non valido: '+entry.path);
      validateValue(entry.value,schema,entry.path);paths.add(entry.path);entries.push({path:entry.path,value:entry.value,schema});
    }
    for(const entry of entries){
      const base=/^(\/(?:ch|aux|bus|main|mtx)\/[1-9]\d*\/(?:flt|gate|eq|dyn)|\/fx\/[1-9]\d*)(?:\/|$)/.exec(entry.path)?.[1];
      if(base&&!paths.has(base+'/mdl'))throw new Error('Manca il modello del processore '+base+'. La scena è incompleta.');
    }
    const source={kind:'wing-read',console:{},startedAt:input.source.startedAt||input.createdAt,completedAt:input.source.completedAt||input.createdAt};
    for(const key of ['name','model','firmware','host','serial'])if(typeof input.source.console[key]==='string')source.console[key]=input.source.console[key].slice(0,256);
    for(const stamp of [input.createdAt,source.startedAt,source.completedAt])if(typeof stamp!=='string'||!Number.isFinite(Date.parse(stamp)))throw new Error('Data di cattura della scena non valida.');
    const scene={format:FORMAT,version:VERSION,id:typeof input.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(input.id)?input.id:uid(),name:input.name.trim(),createdAt:input.createdAt,updatedAt:typeof input.updatedAt==='string'&&Number.isFinite(Date.parse(input.updatedAt))?input.updatedAt:input.createdAt,source,scopes,entries};
    if(new TextEncoder().encode(JSON.stringify(scene)).length>MAX_BYTES)throw new Error('La scena supera 32 MiB.');
    return scene;
  }
  function parse(text){if(typeof text!=='string'||text.length>MAX_BYTES||new TextEncoder().encode(text).length>MAX_BYTES)throw new Error('Il file supera 32 MiB.');let value;try{value=JSON.parse(text);}catch{throw new Error('Il file non contiene JSON valido.');}return normalize(value);}
  function guardFor(live,options={},writable=false){
    if(!live?.isLive?.()||!live.isConnected?.())throw new Error('Collega la WING per leggere o richiamare una scena reale.');
    const epoch=options.epoch??live.sessionToken?.();
    if(epoch===undefined)throw new Error('Questa connessione non supporta la protezione delle sessioni.');
    const check=()=>{
      if(options.signal?.aborted){const e=new Error('Operazione annullata.');e.name='AbortError';throw e;}
      if(!live.isLive()||!live.isConnected()||live.sessionToken()!==epoch)throw new Error('La sessione WING è cambiata. Nessun comando verrà ripreso sulla nuova connessione.');
      if(writable&&!live.isWritable())throw new Error('Attiva Controllo nella connessione WING.');
    };
    check();return {epoch,check};
  }
  async function fresh(live,path,check){
    check();const meta=await live.describeNode(path);check();const values=await live.readValues(path);check();
    if(!own(values,path))throw new Error('La WING non ha restituito il valore di '+path+'.');
    const current=await live.describeNode(path);check();
    if(schemaKey(meta)!==schemaKey(current))throw new Error('Lo schema è cambiato durante la lettura di '+path+'.');
    return {meta:current,value:values[path]};
  }
  async function enumerate(live,path,check,budget,out,depth=0,known){
    check();if(depth>8||++budget.nodes>MAX_UNIT_NODES)throw new Error('Gruppo audio troppo grande: '+path+'. Seleziona un gruppo più piccolo.');
    const meta=known||await live.describeNode(path);check();
    if(meta.type!==0){if(allowed(path)&&!meta.readOnly)out.push({...meta,path});return;}
    let children=await live.listNode(path);check();
    if(children.length>MAX_UNIT_NODES)throw new Error('Troppi nodi nel gruppo '+path+'.');
    const model=children.find(item=>item.path===path+'/mdl'&&!item.readOnly);
    if(model){await fresh(live,model.path,check);children=await live.listNode(path);check();}
    const seen=new Set();
    for(const child of children){
      if(typeof child.path!=='string'||child.path.slice(0,path.length+1)!==path+'/'||child.path.slice(path.length+1).includes('/')||seen.has(child.path))throw new Error('Definizione WING incoerente nel gruppo '+path+'.');
      seen.add(child.path);if(branchAllowed(child.path))await enumerate(live,child.path,check,budget,out,depth+1,child);
    }
  }
  async function collectUnits(live,path,check,result,budget){
    check();if(++budget.nodes>MAX_ENTRIES)throw new Error('Troppi gruppi audio da leggere.');
    if(unitRoot(path)===path){result.add(path);return;}
    const meta=await live.describeNode(path);check();
    if(meta.type!==0)throw new Error('Gruppo audio non disponibile: '+path);
    const children=await live.listNode(path);check();
    for(const child of children){
      if(typeof child.path!=='string'||!child.path.startsWith(path+'/')||child.path.slice(path.length+1).includes('/'))throw new Error('Definizione WING incoerente: '+path);
      if(branchAllowed(child.path))await collectUnits(live,child.path,check,result,budget);
    }
  }
  async function capture(live,options={}){
    const scopes=cleanScopes(options.scopes||SCOPES.map(s=>s.id)),{epoch,check}=guardFor(live,options),startedAt=new Date().toISOString();
    if(typeof live.listNode!=='function'||typeof live.readValues!=='function')throw new Error('Aggiorna il motore WING per acquisire scene reali.');
    await live.settled?.();check();const units=new Set(),entries=[],budget={nodes:0},models=[];
    for(const scope of SCOPES.filter(s=>scopes.includes(s.id)))for(const path of scope.roots)await collectUnits(live,path,check,units,budget);
    let completed=0;
    for(const path of units){
      const definitions=[];await enumerate(live,path,check,{nodes:0},definitions);check();
      const values=await live.readValues(path,{depth:8});check();
      for(const meta of definitions){
        if(!own(values,meta.path))throw new Error('Cattura incompleta: manca '+meta.path+'. La scena non è stata salvata.');
        const current=live.metadata(meta.path);
        if(!current||schemaKey(current)!==schemaKey(meta))throw new Error('Schema cambiato durante la cattura: '+meta.path+'. Ripeti la lettura.');
        validateValue(values[meta.path],meta,meta.path);
        entries.push({path:meta.path,value:values[meta.path],schema:schemaOf(meta)});
        if(meta.path.endsWith('/mdl'))models.push({path:meta.path,value:values[meta.path]});
      }
      if(entries.length>MAX_ENTRIES)throw new Error('La scena supera '+MAX_ENTRIES+' parametri.');
      options.onProgress?.({phase:'capture',path,completed:++completed,total:units.size,parameters:entries.length});
    }
    for(const model of models){const actual=await fresh(live,model.path,check);if(actual.value!==model.value)throw new Error('Modello cambiato durante la cattura: '+model.path+'. La scena non è stata salvata.');}
    check();const completedAt=new Date().toISOString(),info=live.snapshot?.().info||{};
    return normalize({format:FORMAT,version:VERSION,id:uid(),name:options.name?.trim()||'Scena '+new Date().toLocaleString('it-IT'),createdAt:completedAt,updatedAt:completedAt,source:{kind:'wing-read',console:info,startedAt,completedAt},scopes,entries});
  }
  function parseSafes(text){
    if(Array.isArray(text))return [...new Set(text.map(path=>{if(!canonical(path)||unitRoot(path)!==path||!allowed(path))throw new Error('Protezione non valida: '+path);return path;}))];
    if(typeof text!=='string')return [];
    return parseSafes(text.trim()?text.trim().split(/[\s,;]+/).map(part=>{
      if(part.startsWith('/'))return part;
      const match=/^(CH|AUX|BUS|MAIN|MTX|FX|DCA|MGRP)([1-9][0-9]*)$/i.exec(part);
      if(!match)throw new Error('Protezione non valida: '+part+'. Usa per esempio CH1, AUX2, BUS3.');
      return '/'+match[1].toLowerCase()+'/'+match[2];
    }):[]);
  }
  const headamp=path=>/^\/io\/in\/[^/]+\/\d+\/(g|vph)$/.test(path);
  function selectedEntries(scene,options){
    const scopes=cleanScopes(options.scopes||scene.scopes),safes=parseSafes(options.safes||[]);
    if(scopes.some(scope=>!scene.scopes.includes(scope)))throw new Error('La scena non contiene tutti i gruppi selezionati.');
    return {scopes,safes,entries:scene.entries.filter(e=>scopes.includes(scopeFor(e.path))&&!safes.some(path=>inside(e.path,path))&&(options.includeHeadamps||!headamp(e.path)))};
  }
  async function readSelection(live,entries,check,onProgress){
    const groups=new Map(),result=new Map();
    for(const entry of entries){const unit=unitRoot(entry.path);if(!unit)throw new Error('Parametro fuori dai gruppi audio: '+entry.path);if(!groups.has(unit))groups.set(unit,[]);groups.get(unit).push(entry);}
    let completed=0;
    for(const [unit,items]of groups){
      check();const definitions=[];await enumerate(live,unit,check,{nodes:0},definitions);check();
      const byPath=new Map(definitions.map(meta=>[meta.path,meta]));
      // The complete unit was bounded before the single data request. Native
      // readTree also checks 4096 nodes and every leaf revision before returning.
      const values=await live.readValues(unit,{depth:8});check();
      for(const entry of items){
        const meta=byPath.get(entry.path);validateValue(entry.value,meta,entry.path);
        if(entry.schema.type!==meta.type||entry.schema.unit!==undefined&&meta.unit!==entry.schema.unit)throw new Error('Tipo o unità diversi dalla scena: '+entry.path);
        if(schemaKey(live.metadata(entry.path))!==schemaKey(meta))throw new Error('Schema cambiato durante la lettura di '+entry.path);
        if(!own(values,entry.path))throw new Error('Valore corrente non ricevuto: '+entry.path);
        result.set(entry.path,{...entry,before:values[entry.path],meta:clone(meta)});
        onProgress?.({phase:'prepare',path:entry.path,completed:++completed,total:entries.length});
      }
    }
    return result;
  }
  async function prepare(sceneInput,live,options={}){
    const scene=normalize(sceneInput),{epoch,check}=guardFor(live,options,true),selection=selectedEntries(scene,options);
    await live.settled?.();check();
    const models=[],guards=[],deferred=[],changes=[],modelRoots=[];
    for(const entry of selection.entries.filter(e=>e.path.endsWith('/mdl'))){
      const actual=await fresh(live,entry.path,check);validateValue(entry.value,actual.meta,entry.path);
      const guard={...entry,before:actual.value,meta:actual.meta};guards.push(guard);
      if(!sameValue(actual.value,entry.value,actual.meta)){models.push(guard);modelRoots.push(entry.path.slice(0,-4));}
    }
    const immediate=[];
    for(const entry of selection.entries){
      if(entry.path.endsWith('/mdl'))continue;
      if(modelRoots.some(base=>inside(entry.path,base)))deferred.push(entry);else immediate.push(entry);
    }
    const values=await readSelection(live,immediate,check,options.onProgress);check();
    for(const guard of values.values()){guards.push(guard);if(!sameValue(guard.before,guard.value,guard.meta))changes.push(guard);}
    return {scene,epoch,createdAt:Date.now(),scopes:selection.scopes,safes:selection.safes,includeHeadamps:!!options.includeHeadamps,entries:selection.entries,models,deferred,changes,guards,excluded:scene.entries.length-selection.entries.length,unchanged:guards.length-models.length-changes.length,used:false};
  }
  function priority(entry){
    if(entry.path.endsWith('/mdl'))return 0;
    if(/\/mute$/.test(entry.path))return entry.value===1?1:9;
    if(/\/(send\/(?:MX)?\d+|main\/\d+)\/(on|pon)$/.test(entry.path))return entry.value===0?2:8;
    if(/\/(on|pon)$/.test(entry.path))return entry.value===0?3:7;
    return 5;
  }
  async function execute(plan,live,options={}){
    if(!plan||plan.used)throw new Error('Questa anteprima è già stata usata. Prepara un nuovo richiamo.');
    plan.used=true;
    const report={ok:false,cancelled:false,confirmed:0,total:plan.models.length+plan.changes.length+plan.deferred.length,paths:[],error:'',uncertainPath:null,scene:plan.scene.name,excluded:plan.excluded};
    let currentPath=null;
    try{
      const {check}=guardFor(live,{...options,epoch:plan.epoch},true);await live.settled?.();check();
      // Refresh all prepared values before the first write. A changed console
      // or a stale preview requires a new review, not a silently changed plan.
      const baseline=await readSelection(live,plan.guards,check,options.onProgress);check();
      for(const entry of plan.guards){const actual=baseline.get(entry.path);if(schemaKey(actual.meta)!==schemaKey(entry.meta)||!sameValue(actual.before,entry.before,actual.meta))throw new Error('Anteprima scaduta: '+entry.path+' è cambiato. Prepara di nuovo il richiamo.');}
      const send=async entry=>{
        check();const current=live.metadata(entry.path);
        if(!current||schemaKey(current)!==schemaKey(entry.meta))throw new Error('Schema cambiato prima dell’invio: '+entry.path);
        if(!live.hasValue(entry.path)||!sameValue(live.value(entry.path),entry.before,current))throw new Error('Il valore è cambiato prima dell’invio: '+entry.path);
        currentPath=entry.path;await live.write(entry.path,entry.value,{expectedSchema:entry.meta});
        report.confirmed++;report.paths.push(entry.path);currentPath=null;
        options.onProgress?.({phase:'recall',path:entry.path,completed:report.confirmed,total:report.total});check();
      };
      for(const entry of plan.models){await send(entry);await live.listNode(entry.path.slice(0,-4),{refresh:true});check();}
      let remainder=plan.changes;
      if(plan.models.length){
        // All remaining fields are validated against the NEW model before any
        // parameter is sent. Failure here reports the confirmed model changes.
        const next=await prepare(plan.scene,live,{...options,epoch:plan.epoch,scopes:plan.scopes,safes:plan.safes,includeHeadamps:plan.includeHeadamps});check();
        if(next.models.length)throw new Error('Un modello è cambiato di nuovo durante il richiamo.');
        for(const entry of plan.guards){if(plan.models.some(model=>inside(entry.path,model.path.slice(0,-4))))continue;const actual=next.guards.find(g=>g.path===entry.path);if(!actual||!sameValue(actual.before,entry.before,actual.meta))throw new Error('Parametro cambiato durante il cambio modello: '+entry.path);}
        remainder=next.changes;report.total=report.confirmed+remainder.length;
      }
      for(const entry of [...remainder].sort((a,b)=>priority(a)-priority(b)))await send(entry);
      check();report.ok=true;
    }catch(error){report.error=message(error);report.cancelled=error?.name==='AbortError';report.uncertainPath=currentPath;}
    report.remaining=Math.max(0,report.total-report.confirmed);return report;
  }
  const summary=scene=>({id:scene.id,name:scene.name,createdAt:scene.createdAt,updatedAt:scene.updatedAt,source:clone(scene.source),scopes:[...scene.scopes],count:scene.entries.length});
  class SceneStore{
    constructor(indexedDB=root.indexedDB){this.indexedDB=indexedDB;this.pending=null;}
    async db(){
      if(!this.indexedDB)throw new Error('Archivio locale non disponibile in questo ambiente. Esporta le scene in JSON.');
      if(!this.pending)this.pending=new Promise((resolve,reject)=>{
        const request=this.indexedDB.open('sculpt-wing-scene-library',1);
        request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('scenes',{keyPath:'id'});db.createObjectStore('index',{keyPath:'id'});};
        request.onerror=()=>{this.pending=null;reject(request.error||new Error('Impossibile aprire l’archivio scene.'));};
        request.onblocked=()=>{this.pending=null;reject(new Error('Chiudi le altre finestre Sculpt per aprire l’archivio scene.'));};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.pending=null;};resolve(db);};
      });
      return this.pending;
    }
    async request(store,method,arg){
      const db=await this.db();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=arg===undefined?tx.objectStore(store)[method]():tx.objectStore(store)[method](arg);let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||r.error||new Error('Lettura dell’archivio non riuscita.'));});
    }
    async list(){const list=await this.request('index','getAll');return list.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
    async get(id){const scene=await this.request('scenes','get',id);return scene?normalize(scene):null;}
    async put(input){
      const scene=normalize(input),db=await this.db();await new Promise((resolve,reject)=>{const tx=db.transaction(['scenes','index'],'readwrite');tx.objectStore('scenes').put(scene);tx.objectStore('index').put(summary(scene));tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(new Error(tx.error?.name==='QuotaExceededError'?'Spazio locale insufficiente. Esporta la scena e libera spazio.':message(tx.error||'Salvataggio locale non riuscito.')));});return scene;
    }
    async remove(id){const db=await this.db();await new Promise((resolve,reject)=>{const tx=db.transaction(['scenes','index'],'readwrite');tx.objectStore('scenes').delete(id);tx.objectStore('index').delete(id);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Eliminazione della scena non riuscita.'));});}
    async close(){if(this.pending){const db=await this.pending;db.close();this.pending=null;}}
  }
  let store,lastReport=null;
  function styles(){
    if(root.document.getElementById('sculpt-local-scenes-style'))return;
    const style=root.document.createElement('style');style.id='sculpt-local-scenes-style';
    style.textContent=[
      '.local-scenes{min-width:0}.local-scenes .ls-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}',
      '.local-scenes .ls-status{flex:1;min-width:220px;font-size:12px;line-height:1.6;color:#c8b1c2;overflow-wrap:anywhere}',
      '.local-scenes .ls-status[data-error=true]{color:#ffa3b3}.local-scenes .ls-scopes{display:flex;flex-wrap:wrap;gap:9px 16px;margin:14px 0}',
      '.local-scenes .ls-check{display:flex;gap:7px;align-items:center;font-size:12px;color:#d6c2ce}.local-scenes .ls-check input{accent-color:#ed657c}',
      '.local-scenes .ls-library{display:grid;gap:6px;max-height:42vh;overflow:auto}.local-scenes .ls-item{display:flex;align-items:center;gap:10px;text-align:left;min-height:60px}',
      '.local-scenes .ls-item>span{flex:1;min-width:0}.local-scenes .ls-item strong,.local-scenes .ls-item small{display:block;overflow-wrap:anywhere}.local-scenes .ls-item small{font-size:10px;color:#b69dae;margin-top:4px}',
      '.local-scenes .ls-item[aria-pressed=true]{border-color:#ed657c;background:#35202d}.local-scenes .ls-meta{font-size:12px;line-height:1.7;color:#bca8b9;overflow-wrap:anywhere}',
      '.local-scenes .ls-parameters{max-height:38vh;overflow:auto;margin:12px 0}.local-scenes .ls-param{display:grid;grid-template-columns:minmax(160px,1.4fr) minmax(90px,1fr) minmax(90px,1fr);gap:8px;font:11px/1.5 ui-monospace,monospace;padding:7px 2px;border-bottom:1px solid #3a2b37;overflow-wrap:anywhere}',
      '.local-scenes .ls-param span{min-width:0;white-space:pre-wrap}.local-scenes .ls-param span:last-child{color:#f3b8c7}.local-scenes .ls-subtitle{font-size:12px;color:#d2bacb;margin:8px 0}',
      '.local-scenes .ls-report{padding:12px;border:1px solid #644452;background:#21161e;border-radius:6px;font-size:12px;line-height:1.6;white-space:pre-wrap}',
      '.local-scenes button:disabled{opacity:.45;cursor:not-allowed}@media(max-width:600px){.local-scenes .ls-param{grid-template-columns:minmax(130px,1.2fr) minmax(65px,1fr) minmax(65px,1fr);font-size:10px}.local-scenes .ls-status{min-width:170px}}'
    ].join('\n');root.document.head.append(style);
  }
  const reportText=report=>report.ok?'Richiamo completato · '+report.confirmed+' parametri confermati dalla WING.':(report.cancelled?'Richiamo interrotto':'Richiamo non completato')+' · '+report.confirmed+' parametri confermati su '+report.total+'.\n'+report.error+(report.uncertainPath?'\nEsito da verificare sul banco: '+report.uncertainPath+'. Il comando può essere arrivato prima dell’interruzione.':'')+'\nLe modifiche confermate restano sul banco; i comandi restanti non verranno ripresi automaticamente.';
  function render(container,args={},renderDemo){
    const U=root.SculptUI,L=root.SculptLive;if(!U)return null;styles();if(!store)store=new SceneStore();
    const el=(tag,cls,text)=>U.el(tag,cls,text),note=text=>el('p','desk-note',text),button=(text,fn,cls)=>U.button(text,fn,cls||'');
    const shell=el('div','local-scenes'),tabsHost=el('div'),body=el('div');shell.append(tabsHost,body);container.append(shell);
    let alive=true,busy=false,controller=null,childCleanup=null,preview=null,selected=null,loaded=null,index=[],status=null,localControls=[],epochPaint=0;
    let tab=args?.tab==='bank'?'bank':['show','snippets','presets','project'].includes(args?.tab)?(args.tab==='show'&&L?.isLive?.()?'bank':'demo'):'local';
    let scopeSelection=SCOPES.map(s=>s.id),recallScopes=null,safeText='',includeHeadamps=false,unsaved=null;
    const connected=()=>!!L?.isLive?.()&&L.isConnected(),writable=()=>connected()&&L.isWritable();
    const line=(...nodes)=>{const row=el('div','ls-toolbar');row.append(...nodes);return row;};
    const say=(text,error=false)=>{if(alive&&status){status.textContent=text;status.dataset.error=String(error);}};
    const availability=()=>{if(!alive)return;for(const item of localControls)item.node.disabled=item.cancel?!busy:busy||!item.can();for(const b of tabsHost.querySelectorAll('button'))b.disabled=busy;};
    const control=(node,can=()=>true)=>{localControls.push({node,can});return node;};
    const abort=()=>{controller?.abort();say('Interruzione richiesta: attendo l’esito della richiesta già inviata.');};
    const progress=data=>{const now=Date.now();if(now-epochPaint<70&&data.completed!==data.total)return;epochPaint=now;say((data.phase==='capture'?'Lettura WING':data.phase==='prepare'?'Preparazione richiamo':'Richiamo')+' · '+data.completed+'/'+data.total+(data.parameters?' · '+data.parameters+' parametri':'')+' · '+data.path);};
    async function task(fn){
      if(busy||!alive)return;busy=true;controller=new AbortController();availability();
      try{await fn(controller);}catch(error){say(message(error),true);}finally{busy=false;controller=null;availability();}
    }
    function exportScene(scene){U.download(scene.name.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,120)+'.sculpt-wing-scene.json',JSON.stringify(scene,null,2),'application/json');}
    function check(label,checked,change){const wrap=el('label','ls-check'),input=el('input');input.type='checkbox';input.checked=checked;input.addEventListener('change',()=>change(input.checked));wrap.append(input,el('span','',label));control(input);return wrap;}
    function scopePicker(values,available,change){const panel=el('div','ls-scopes');for(const scope of SCOPES.filter(s=>available.includes(s.id)))panel.append(check(scope.label,values.includes(scope.id),value=>{const next=value?[...new Set([...values,scope.id])]:values.filter(id=>id!==scope.id);values=next;change(next);}));return panel;}
    async function loadLibrary(){
      const list=await store.list();if(!alive)return;index=list;if(!selected||!list.some(scene=>scene.id===selected))selected=list[0]?.id||null;
      loaded=selected?await store.get(selected):null;if(!alive)return;paintLocal();
    }
    async function reviewDialog(plan,signalController){
      const content=el('div','local-scenes'),heading=el('p','ls-meta'),rows=el('div','ls-parameters'),position=el('span','ls-meta'),feedback=el('p','ls-status');
      feedback.setAttribute('role','status');
      const all=[...plan.models,...plan.changes,...plan.deferred.map(entry=>({...entry,before:'dopo il cambio modello'}))];
      const modules=new Map();for(const item of all){const key=unitRoot(item.path);modules.set(key,(modules.get(key)||0)+1);}
      heading.textContent=plan.scene.name+' · '+all.length+' valori previsti in '+modules.size+' moduli. '+plan.models.length+' cambi di modello; '+plan.deferred.length+' parametri da verificare nel nuovo schema. '+plan.unchanged+' valori già uguali; '+plan.excluded+' esclusi da gruppi, protezioni o gain/phantom.';
      const consoleInfo=L.snapshot?.().info||{};
      content.append(heading,note('Destinazione: '+(consoleInfo.name||'WING')+' · '+(consoleInfo.model||'')+' · '+(consoleInfo.host||'')),
        note('Gruppi: '+plan.scopes.map(id=>SCOPES.find(s=>s.id===id).label).join(', ')+'. Protezioni dirette: '+(plan.safes.join(', ')||'nessuna')+'. Gain e phantom: '+(plan.includeHeadamps?'inclusi':'esclusi')+'.'),
        note('I modelli vengono impostati per primi. I parametri dipendenti vengono riletti e validati nel nuovo schema prima di proseguire. Se un campo non è compatibile, il richiamo si ferma e riporta quanto è già stato confermato.'));
      const moduleDetails=el('details'),moduleNames=el('p','ls-meta');moduleDetails.append(el('summary','','Moduli interessati'));moduleNames.textContent=[...modules].map(([path,count])=>path+' ('+count+')').join(' · ');moduleDetails.append(moduleNames);content.append(moduleDetails);
      const query=el('input','desk-input');query.type='search';query.placeholder='Filtra i parametri';query.setAttribute('aria-label','Filtra parametri del richiamo');
      let page=0;const previous=button('‹ Indietro',()=>{--page;paintRows();}),next=button('Altri 200 ›',()=>{++page;paintRows();});
      function paintRows(){const filtered=all.filter(entry=>entry.path.toLowerCase().includes(query.value.trim().toLowerCase()));page=Math.min(Math.max(0,page),Math.max(0,Math.ceil(filtered.length/200)-1));rows.replaceChildren();for(const entry of filtered.slice(page*200,(page+1)*200)){const row=el('div','ls-param');row.append(el('span','',entry.path),el('span','',String(entry.before)),el('span','',String(entry.value)));rows.append(row);}position.textContent=filtered.length?(page*200+1)+'–'+Math.min((page+1)*200,filtered.length)+' / '+filtered.length:'Nessun cambiamento';previous.disabled=page===0;next.disabled=(page+1)*200>=filtered.length;}
      query.addEventListener('input',()=>{page=0;paintRows();});paintRows();
      content.append(line(query),el('p','ls-subtitle','Parametro · valore letto · valore della scena'),rows,line(previous,position,next));
      let running=false,finished=false,result=null;
      const confirm=button(all.length?'Conferma richiamo':'Nessun parametro da inviare',async()=>{
        if(running||finished||!all.length)return;running=true;confirm.disabled=true;cancel.textContent='Interrompi';feedback.textContent='Verifico che l’anteprima sia ancora valida…';
        result=await execute(plan,L,{signal:signalController.signal,onProgress:data=>{feedback.textContent=(data.phase==='prepare'?'Verifica':'Invio')+' · '+data.completed+'/'+data.total+' · '+data.path;}});
        lastReport=result;feedback.textContent=reportText(result);feedback.dataset.error=String(!result.ok);running=false;finished=true;cancel.textContent='Chiudi';cancel.disabled=false;
        if(!preview||!preview.dialog?.isConnected)resolveDialog(result);
      },'desk-primary'),cancel=button('Annulla',()=>{if(running){signalController.abort();cancel.disabled=true;feedback.textContent='Interruzione richiesta: attendo la conferma della richiesta in corso.';}else preview?.close();});
      confirm.disabled=!all.length;content.append(feedback,line(cancel,confirm));
      let resolveDialog;const done=new Promise(resolve=>{resolveDialog=resolve;});
      preview=U.modal('Anteprima · '+plan.scene.name,content);
      preview.dialog.addEventListener('close',()=>{signalController.abort();preview=null;if(!running)resolveDialog(result);},{once:true});
      return done;
    }
    function paintLocal(){
      if(!alive||tab!=='local')return;body.replaceChildren();localControls=[];
      const stop=button('Interrompi',abort);stop.disabled=!busy;
      status=el('p','ls-status',connected()?'Scene reali WING: lettura e salvataggio locale.':'Libreria locale disponibile. Collega la WING per acquisire o richiamare i valori.');status.setAttribute('role','status');
      body.append(line(status,stop));localControls.push({node:stop,cancel:true});
      const name=el('input','desk-input');name.type='text';name.placeholder='Nome della nuova scena';name.maxLength=200;name.setAttribute('aria-label','Nome nuova scena WING');control(name);
      const create=button('Salva WING in locale',()=>task(async ctl=>{
        const scene=await capture(L,{name:name.value,scopes:scopeSelection,signal:ctl.signal,onProgress:progress});unsaved=scene;
        try{await store.put(scene);}catch(error){if(alive){const exportButton=button('Esporta la scena non salvata',()=>exportScene(scene));body.prepend(U.card('Salvataggio locale non riuscito',note(message(error)),exportButton));}throw error;}
        unsaved=null;selected=scene.id;recallScopes=null;await loadLibrary();say('Salvata «'+scene.name+'» · '+scene.entries.length+' parametri letti dalla WING.');
      }),'desk-primary');control(create,connected);
      const picker=scopePicker(scopeSelection,SCOPES.map(s=>s.id),values=>{scopeSelection=values;});
      body.append(U.card('ACQUISISCI IL BANCO',U.field('Nome scena',name),picker,line(create),note('Legge i gruppi selezionati dal banco collegato. La scena conserva origine e intervallo della lettura. Rete, clock, trasporti, comandi momentanei e parametri temporanei non fanno parte di questo formato Sculpt.')));
      const file=el('input','desk-input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','Importa scena WING locale');control(file);
      file.addEventListener('change',()=>{const source=file.files?.[0];if(!source)return;task(async()=>{if(source.size>MAX_BYTES)throw new Error('Il file supera 32 MiB.');const scene=parse(await source.text());scene.id=uid();scene.updatedAt=new Date().toISOString();await store.put(scene);selected=scene.id;recallScopes=null;await loadLibrary();say('Importata «'+scene.name+'». Il banco non è stato modificato.');});});
      const refresh=button('Aggiorna libreria',()=>task(async()=>{await loadLibrary();say('Libreria locale aggiornata.');}));control(refresh);
      const list=el('div','ls-library');
      for(const item of index){const b=button('',()=>task(async()=>{selected=item.id;loaded=await store.get(selected);recallScopes=null;paintLocal();}),'ls-item'),text=el('span');text.append(el('strong','',item.name),el('small','',item.count+' parametri · '+new Date(item.createdAt).toLocaleString('it-IT')+' · '+(item.source.console.name||item.source.console.model||'WING')));b.append(text);b.setAttribute('aria-pressed',String(item.id===selected));control(b);list.append(b);}
      if(!index.length)list.append(note('Nessuna scena locale. Acquisisci la WING oppure importa una scena Sculpt esportata.'));
      const library=U.card('SCENE LOCALI · '+index.length,list,line(refresh),U.field('Importa JSON Sculpt WING',file)),details=U.card('SCENA SELEZIONATA');
      if(loaded){
        const scene=loaded;recallScopes=recallScopes?.filter(id=>scene.scopes.includes(id))||[...scene.scopes];
        const title=el('input','desk-input');title.value=scene.name;title.maxLength=200;title.setAttribute('aria-label','Nome scena salvata');control(title);
        const rename=button('Rinomina',()=>task(async()=>{const next={...scene,name:title.value,updatedAt:new Date().toISOString()};await store.put(next);await loadLibrary();say('Nome scena aggiornato.');}));control(rename);
        const info=scene.source.console;
        details.append(line(U.field('Nome',title),rename),el('p','ls-meta',(info.name||'WING')+' · '+(info.model||'modello non indicato')+' · firmware '+(info.firmware||'non indicato')+'\n'+scene.entries.length+' parametri. Lettura: '+new Date(scene.source.startedAt).toLocaleString('it-IT')+' → '+new Date(scene.source.completedAt).toLocaleString('it-IT')+'.'));
        details.append(scopePicker(recallScopes,scene.scopes,values=>{recallScopes=values;}));
        const safes=el('input','desk-input');safes.type='text';safes.value=safeText;safes.placeholder='CH1, CH2, AUX1, BUS3…';safes.setAttribute('aria-label','Parametri delle strip protetti');safes.addEventListener('input',()=>{safeText=safes.value;});control(safes);
        details.append(U.field('Proteggi parametri delle strip',safes),note('Le protezioni escludono i parametri diretti indicati. Sorgenti condivise, DCA e bus seguono i rispettivi gruppi: deselezionali per escluderli dal richiamo.'),check('Richiama anche gain e phantom delle sorgenti',includeHeadamps,value=>{includeHeadamps=value;}));
        const recall=button('Prepara richiamo sulla WING',()=>task(async ctl=>{
          const plan=await prepare(scene,L,{scopes:recallScopes,safes:safeText,includeHeadamps,signal:ctl.signal,onProgress:progress});if(!alive||ctl.signal.aborted)return;
          const report=await reviewDialog(plan,ctl);if(alive&&report){paintLocal();say(reportText(report),!report.ok);}else say('Richiamo annullato: nessun parametro inviato.');
        }),'desk-primary');control(recall,writable);
        const download=button('Esporta JSON',()=>exportScene(scene));control(download);
        const remove=button('Elimina scena locale',()=>task(async()=>{await store.remove(scene.id);selected=null;recallScopes=null;await loadLibrary();say('Scena locale eliminata.');}),'desk-danger');control(remove);
        details.append(line(recall,download,remove),note(connected()?'L’anteprima mostra parametri, moduli, gruppi e protezioni prima dell’invio.':'Puoi rinominare, esportare o eliminare questa scena anche senza una WING collegata.'));
      }else details.append(note('Seleziona una scena dalla libreria.'));
      body.append(U.grid(library,details));
      if(lastReport)body.append(U.card('ULTIMO RICHIAMO',el('div','ls-report',reportText(lastReport))));
      availability();stop.disabled=!busy;
    }
    function paintTabs(){
      tabsHost.replaceChildren(U.tabs([{id:'local',label:'Scene locali'},{id:'bank',label:'Show WING'},{id:'demo',label:'Progetto demo'}],tab,next=>{if(!busy){tab=next;paint();}}));availability();
    }
    function paint(){
      childCleanup?.();childCleanup=null;body.replaceChildren();localControls=[];status=null;paintTabs();
      if(tab==='local'){
        paintLocal();loadLibrary().catch(error=>say(message(error),true));
      }else if(tab==='bank'){
        const page=root.SculptLivePages?.render('scenes',body,{tab:'show'});if(page?.handled)childCleanup=page.cleanup;
        else body.append(U.card('SHOW DELLA WING',note('Collega la WING per leggere tutte le scene dello Show aperto sul banco.'),button('Apri connessione',()=>U.open('connection'))));
      }else{
        body.append(U.card('PROGETTO DEMO',note('Questi snapshot appartengono alla simulazione Sculpt. Le scene reali del banco si salvano nella scheda Scene locali.')));
        if(renderDemo){const area=el('div');body.append(area);childCleanup=renderDemo(area,args)||null;}
      }
    }
    const unsubscribe=L?.subscribe?.(()=>{availability();});paint();
    return {handled:true,cleanup(){alive=false;controller?.abort();preview?.close();childCleanup?.();unsubscribe?.();localControls=[];}};
  }
  const api={FORMAT,VERSION,SCOPES,MAX_BYTES,allowed,unitRoot,scopeFor,normalize,parse,parseSafes,sameValue,capture,prepare,execute,SceneStore,render};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.SculptLocalScenes=api;
})(typeof window!=='undefined'?window:globalThis);
