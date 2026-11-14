/* Shared Compact / Extended channel pages.
 * WING Remote Protocols 3.1.2-a: /ch/N/proc and /ch/N/ptap.
 * WING user manual, 2025-09-04, section 6.1: INS1 is the movable I
 * block, INS2 is post-fader; output EQ is post-fader. These are nine
 * control pages, so the fixed final Master page is not a DSP position.
 */
(function(root){
  'use strict';
  const DEFINITIONS=Object.freeze([
    ['home','Home'],['input','Pre'],['gate','Gate'],['eq','EQ'],
    ['dyn','Comp'],['pre','Insert'],['post','Insert'],['sends','Send'],['master','Master']
  ].map(([id,label])=>Object.freeze({id,label})));
  const COUNTS={CH:40,AUX:8,BUS:16,MAIN:4,MTX:8};
  const PROC_IDS=['gate','eq','dyn','pre'],TAPS=['IN','FILT','3','4','5','PFL','AFL','POST'];
  const TO_WIRE={gate:'G',eq:'E',dyn:'D',pre:'I'},FROM_WIRE={G:'gate',E:'eq',D:'dyn',I:'pre'};
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
  const validProc=value=>typeof value==='string'&&value.length===4&&new Set(value).size===4&&/^[GEDI]{4}$/.test(value);
  const schemaKey=meta=>JSON.stringify(meta?[meta.path,meta.revision,meta.type,!!meta.readOnly,meta.min,meta.max,meta.maxLength,meta.unit,(meta.items||[]).map(item=>item.value)]:null);
  const procIds=value=>validProc(value)?[...value].map(letter=>FROM_WIRE[letter]):null;
  const deskProc=value=>Array.isArray(value)&&value.length===4?value.map(key=>TO_WIRE[key==='insert'?'pre':key]||'?').join(''):typeof value==='string'?value:null;
  const errorText=error=>error?.message||String(error);
  const label=id=>DEFINITIONS.find(item=>item.id===id)?.label||id;

  function create(environment){
    const records=new Map(),tokens=new WeakMap(),bindings=new Set();
    const controller=()=>environment.SculptController,desk=()=>environment.SculptDesk,live=()=>environment.SculptLive;
    const context=()=>({live:!!live()?.isLive?.(),epoch:live()?.sessionToken?.()??null,api:live()});
    const sameContext=(a,b)=>a.live===b.live&&a.epoch===b.epoch&&a.api===b.api;
    function record(id){
      const current=context();let entry=records.get(id);
      if(!entry||!sameContext(entry.context,current)){
        entry={context:current,busy:false,loading:false,error:'',invalid:new Set(),preparing:null};records.set(id,entry);
      }
      return entry;
    }
    function identity(id){
      const match=typeof id==='string'&&/^(ch|aux|bus|main|mtx)-([1-9][0-9]*)$/.exec(id);
      const family=match?.[1].toUpperCase(),number=Number(match?.[2]);
      if(!match||number>COUNTS[family]||!controller()?.getStrip?.(id)||!desk()?.channel?.(id))return null;
      return {id,family,number,base:'/'+match[1]+'/'+number};
    }
    function enumReason(meta,path,kind){
      if(!meta||meta.path!==path||meta.type!==5||!Array.isArray(meta.items)||!meta.items.length||!Number.isInteger(meta.revision))return 'Definizione WING da leggere.';
      const accepts=kind==='proc'?validProc:value=>typeof value==='string'&&TAPS.includes(value);
      if(!meta.items.some(item=>accepts(item?.value)))return 'Opzioni non riconosciute nel firmware WING.';
      return '';
    }
    function state(id){
      const item=identity(id),entry=record(id),L=live(),isLive=entry.context.live;
      const connected=!isLive||!!L?.isConnected?.(),writable=!isLive||!!L?.isWritable?.();
      const path=item?.family==='CH'?item.base+'/proc':null,tapPath=item?.family==='CH'?item.base+'/ptap':null;
      const ch=desk()?.channel?.(id),procMeta=path&&isLive?L?.metadata?.(path):null,tapMeta=tapPath&&isLive?L?.metadata?.(tapPath):null;
      const rawProc=isLive?(path&&L?.hasValue?.(path)?L.value(path):null):deskProc(ch?.order);
      const rawTap=isLive?(tapPath&&L?.hasValue?.(tapPath)?L.value(tapPath):null):ch?.tap;
      const orderKnown=!!path&&validProc(rawProc)&&(!isLive||connected&&!entry.invalid.has(path)&&!enumReason(procMeta,path,'proc')&&procMeta.items.some(option=>option.value===rawProc));
      const tapKnown=!!tapPath&&typeof rawTap==='string'&&TAPS.includes(rawTap)&&(!isLive||connected&&!entry.invalid.has(tapPath)&&!enumReason(tapMeta,tapPath,'tap')&&tapMeta.items.some(option=>option.value===rawTap));
      const proc=orderKnown?rawProc:null,tap=tapKnown?rawTap:null;
      return {item,entry,L,isLive,connected,writable,path,tapPath,procMeta,tapMeta,proc,tap,orderKnown,tapKnown};
    }
    function capability(s,key){
      if(!s.item)return 'Canale non disponibile.';
      if(s.item.family!=='CH')return 'Ordine fisso su '+s.item.family+'; nessun comando proc/ptap documentato.';
      if(!PROC_IDS.includes(key)&&key!=='sends')return key==='post'?'INS2 resta dopo il fader.':'Pagina fissa.';
      if(!s.connected)return 'Collega la WING e attendi la sincronizzazione.';
      if(!s.writable)return 'Attiva Controllo per modificare il banco.';
      if(s.entry.loading)return 'Lettura dell’ordine WING in corso.';
      if(s.entry.busy)return 'Attendi la conferma dello spostamento.';
      if(!s.orderKnown)return s.isLive?'Ordine WING da leggere.':'Ordine del canale non valido.';
      if(!s.tapKnown)return s.isLive?'Punto di prelievo WING da leggere.':'Punto di prelievo del canale non valido.';
      const meta=key==='sends'?s.tapMeta:s.procMeta;
      if(s.isLive&&meta?.readOnly)return 'Il banco dichiara questo parametro di sola lettura.';
      return '';
    }
    function tapLabel(value,proc){
      if(value==='IN')return 'IN · prima di Pre';
      if(value==='FILT')return 'FILT · dopo Pre';
      if(['3','4','5'].includes(value)){
        const index=Number(value)-3,key=procIds(proc)?.[index];
        return value+' · dopo '+(key?label(key):'blocco '+(index+1))+' ('+(index+1)+')';
      }
      if(value==='PFL')return 'PFL · prima del fader';
      if(value==='AFL')return 'AFL · dopo il fader, prima di INS2';
      return 'POST · dopo INS2';
    }
    function tapTargets(s,reason=capability(s,'sends')){
      return TAPS.map(value=>{
        const current=s.tap===value,allowed=!s.isLive||!!s.tapMeta?.items?.some(item=>item.value===value);
        const blocked=reason||(!allowed?'Punto di prelievo non disponibile nel firmware.':current?'Punto di prelievo già selezionato.':'');
        return {id:'tap:'+value,kind:'tap',label:tapLabel(value,s.proc),value,current,enabled:!blocked,reason:blocked};
      });
    }
    function ordered(s){
      // An unread live order is deliberately just the neutral page list. It is
      // marked unknown and cannot be dragged; no demo order becomes console data.
      if(!s.item||s.item.family==='CH'&&!s.orderKnown)return DEFINITIONS.map(item=>item.id);
      if(s.item.family!=='CH')return ['home','input','gate',...(s.item.family==='AUX'?['eq','dyn','pre']:['dyn','pre','eq']),'post','sends','master'];
      const processing=procIds(s.proc),result=['home','input',...processing,'post','master'];
      let index=result.indexOf('master');
      if(s.tap==='IN')index=result.indexOf('input');
      else if(s.tap==='FILT')index=result.indexOf(processing[0]);
      else if(['3','4','5'].includes(s.tap))index=result.indexOf(processing[Number(s.tap)-3])+1;
      else if(['PFL','AFL'].includes(s.tap))index=result.indexOf('post');
      result.splice(index,0,'sends');return result;
    }
    function snapshot(id){
      const s=state(id),family=s.item?.family||'',order=ordered(s);
      const items=order.map(key=>{
        const available=!!s.item&&!(key==='gate'&&family!=='CH')&&!(key==='post'&&family==='AUX')&&!(key==='sends'&&family==='MTX');
        const reason=!available?(!s.item?'Canale non disponibile.':key==='gate'?'Gate disponibile solo sui canali CH.':key==='post'?'AUX dispone solo di INS1.':'Le matrici non hanno mandate.'):capability(s,key);
        let badge='';
        if(key==='pre')badge='INS1 · pre-fader';
        if(key==='post'&&available)badge='INS2 · post-fader';
        if(key==='eq'&&['BUS','MAIN','MTX'].includes(family))badge='post-fader';
        if(key==='sends'&&family==='CH')badge=s.tap?'TAP '+s.tap:'TAP da leggere';
        if(key==='master')badge='pagina livello';
        return {id:key,label:label(key),available,movable:available&&!reason,reason,badge};
      });
      return {id,family,items,order,proc:s.proc,tap:s.tap,orderKnown:s.item?.family==='CH'?s.orderKnown:!!s.item,
        tapKnown:s.item?.family==='CH'?s.tapKnown:false,ready:!!s.item&&s.connected&&(family!=='CH'||s.orderKnown&&s.tapKnown),
        loading:s.entry.loading,busy:s.entry.busy,error:s.entry.error,live:s.isLive,epoch:s.entry.context.epoch,
        tapTargets:family==='CH'?tapTargets(s):[]};
    }
    function notify(id){for(const binding of bindings)if(binding.id===id)binding.update();}
    function guard(expected,{writable=false}={}){
      if(!sameContext(expected,context()))throw new Error('La sessione WING è cambiata. Ripeti il gesto dopo la sincronizzazione.');
      if(expected.live&&!live()?.isConnected?.())throw new Error('La WING non è collegata. Nessuno spostamento viene ripetuto alla riconnessione.');
      if(expected.live&&writable&&!live()?.isWritable?.())throw new Error('Controllo non attivo. Ripeti il gesto dopo averlo abilitato.');
    }
    async function readFresh(path,kind,entry,check){
      check();const L=live();
      if(typeof L?.describeNode!=='function'||typeof L?.readValues!=='function')throw new Error('Lettura verificata WING non disponibile.');
      try{
        const meta=await L.describeNode(path);check();
        const reason=enumReason(meta,path,kind);if(reason)throw new Error(reason+' '+path);
        // Read a scalar leaf only. A missing fresh value must never be filled
        // from the cache left by a previous connection or request.
        const values=await L.readValues(path,{depth:0});check();
        if(!own(values,path))throw new Error('La WING non ha restituito '+path+'.');
        const value=values[path],valid=kind==='proc'?validProc(value):typeof value==='string'&&TAPS.includes(value);
        if(!valid||!meta.items.some(item=>item.value===value))throw new Error('Valore WING non riconosciuto per '+path+'.');
        entry.invalid.delete(path);return {value,meta:copy(meta)};
      }catch(error){entry.invalid.add(path);throw error;}
    }
    async function prepare(id){
      const s=state(id),entry=s.entry;
      if(!s.item)throw new Error('Canale non disponibile.');
      if(!s.isLive||s.item.family!=='CH')return snapshot(id);
      guard(entry.context);if(entry.preparing)return entry.preparing;if(entry.busy)return snapshot(id);
      entry.loading=true;entry.error='';notify(id);
      const work=(async()=>{
        try{
          const check=()=>guard(entry.context);
          await readFresh(s.path,'proc',entry,check);await readFresh(s.tapPath,'tap',entry,check);
        }catch(error){entry.error=errorText(error);throw error;}
        finally{entry.loading=false;entry.preparing=null;notify(id);}
        return snapshot(id);
      })();
      entry.preparing=work;return work;
    }
    function begin(id,key){
      const s=state(id),reason=capability(s,key);
      if(reason)throw new Error(reason);
      const token=Object.freeze({id,key,epoch:s.entry.context.epoch,live:s.isLive});
      tokens.set(token,{id,key,context:s.entry.context,proc:s.proc,tap:s.tap,procSchema:copy(s.procMeta),tapSchema:copy(s.tapMeta),used:false});
      return token;
    }
    function tokenRecord(token){const data=token&&typeof token==='object'?tokens.get(token):null;if(!data)throw new Error('Spostamento non preparato.');return data;}
    function staleReason(data,s,{busy=false}={}){
      if(data.used)return 'Questo gesto è già stato utilizzato. Ripeti lo spostamento.';
      try{guard(data.context,{writable:true});}catch(error){return errorText(error);}
      if(s.proc!==data.proc||s.tap!==data.tap)return 'Ordine o punto di prelievo cambiato durante il gesto. Ripeti lo spostamento.';
      if(s.isLive&&(schemaKey(s.procMeta)!==schemaKey(data.procSchema)||schemaKey(s.tapMeta)!==schemaKey(data.tapSchema)))return 'Lo schema WING è cambiato. Rileggi il canale e ripeti il gesto.';
      const reason=capability(s,data.key);
      return busy&&reason==='Attendi la conferma dello spostamento.'?'':reason;
    }
    function planned(data,s,reason){
      if(data.key==='sends')return tapTargets({...s,proc:data.proc,tap:data.tap},reason);
      const order=procIds(data.proc);if(!order)return [];
      return order.filter(key=>key!==data.key).flatMap(targetKey=>['before','after'].map(position=>{
        const next=order.filter(key=>key!==data.key),index=next.indexOf(targetKey)+(position==='after'?1:0);next.splice(index,0,data.key);
        const value=next.map(key=>TO_WIRE[key]).join(''),current=value===data.proc;
        const allowed=!s.isLive||!!s.procMeta?.items?.some(item=>item.value===value);
        const blocked=reason||(!allowed?'Ordine non disponibile nel firmware.':current?'Il blocco è già in questa posizione.':'');
        return {id:'proc:'+position+':'+targetKey,kind:'proc',targetKey,position,label:(position==='before'?'Prima di ':'Dopo ')+label(targetKey),value,current,enabled:!blocked,reason:blocked};
      }));
    }
    function targets(token){const data=tokenRecord(token),s=state(data.id);return planned(data,s,staleReason(data,s));}
    async function commit(token,targetId){
      const data=tokenRecord(token),s=state(data.id),entry=s.entry;
      const reason=staleReason(data,s);if(reason)throw new Error(reason);
      const target=planned(data,s,'').find(item=>item.id===targetId);
      if(!target)throw new Error('Destinazione non valida per questo blocco.');
      if(target.current){data.used=true;return snapshot(data.id);}
      if(!target.enabled)throw new Error(target.reason);
      data.used=true;entry.busy=true;entry.error='';notify(data.id);
      const check=()=>guard(data.context,{writable:true});
      const assertBaseline=()=>{
        check();const current=state(data.id);
        if(current.proc!==data.proc||current.tap!==data.tap)throw new Error('Ordine o punto di prelievo cambiato durante il gesto. Rileggi il canale.');
        if(current.isLive&&(schemaKey(current.procMeta)!==schemaKey(data.procSchema)||schemaKey(current.tapMeta)!==schemaKey(data.tapSchema)))throw new Error('Lo schema WING è cambiato dopo la preparazione. Nessuno spostamento inviato.');
      };
      try{
        if(s.isLive){
          await live().settled();check();
          await readFresh(s.path,'proc',entry,check);await readFresh(s.tapPath,'tap',entry,check);
        }
        assertBaseline();
        const desired=target.kind==='proc'?procIds(target.value).map(key=>key==='pre'?'insert':key):target.value;
        const field=target.kind==='proc'?'order':'tap',D=desk();
        // Keep the existing journal/review/serial write path. Snapshots above
        // use authoritative live values, so this local history transaction is
        // never displayed as an already-confirmed console order.
        const accepted=D.patchChannel(data.id,{[field]:desired});
        if(accepted===false||JSON.stringify(D.channel(data.id)?.[field])!==JSON.stringify(desired))throw new Error('Spostamento non accettato. Controlla la connessione e i dati del canale.');
        if(s.isLive){
          await live().settled();check();
          const path=target.kind==='proc'?s.path:s.tapPath;
          const actual=await readFresh(path,target.kind,entry,check);check();
          const expectedSchema=target.kind==='proc'?data.procSchema:data.tapSchema;
          if(schemaKey(actual.meta)!==schemaKey(expectedSchema))throw new Error('Lo schema WING è cambiato durante la conferma. Controlla il valore letto dal banco.');
          if(actual.value!==target.value)throw new Error('La WING non ha confermato '+path+': richiesto '+target.value+', ricevuto '+actual.value+'.');
        }
      }catch(error){entry.error=errorText(error);throw error;}
      finally{entry.busy=false;notify(data.id);}
      return snapshot(data.id);
    }
    function bind(id,listener){
      if(typeof listener!=='function')throw new Error('Listener della catena non valido.');
      let last='',disposed=false,liveApi=null,stopLive=null;
      const binding={id,update(){
        if(disposed)return;
        if(liveApi!==live()){stopLive?.();liveApi=live();stopLive=liveApi?.subscribe?.(()=>binding.update());}
        const next=snapshot(id),signature=JSON.stringify(next);if(signature===last)return;last=signature;listener(next);
      }};
      const stopController=controller()?.subscribe?.(()=>binding.update());
      const onLive=()=>binding.update();environment.addEventListener?.('sculpt-live-state',onLive);
      bindings.add(binding);binding.update();
      return ()=>{disposed=true;bindings.delete(binding);stopController?.();stopLive?.();environment.removeEventListener?.('sculpt-live-state',onLive);};
    }
    return Object.freeze({snapshot,prepare,bind,begin,targets,commit,ids:Object.freeze(DEFINITIONS.map(item=>item.id))});
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={create};
  else root.SculptChannelChain=create(root);
})(typeof window!=='undefined'?window:globalThis);
