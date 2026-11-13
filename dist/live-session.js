(function(root){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const equal=(a,b)=>Object.is(a,b)||(typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<1e-7);
  const inside=(path,base)=>base==='/'||path===base||path.startsWith(base+'/');
  const overlaps=(a,b)=>inside(a,b)||inside(b,a);
  const message=e=>e?.message||String(e);
  const keyFor=ctx=>ctx.type==='fx'?`fx:${ctx.slot}`:`${ctx.id}:${ctx.block}`;
  const localDeskKeys=new Set(['macros','scenes','snippets','stripPresets','safes','pluginPresets','pluginClipboard','customControls','layers','activeLayer','history','showName','activeScene','meterSettings','_wing']);

  // The mixer is authoritative. Connecting only reads; a local show is never
  // replayed. Queued controls belong to one session and one firmware schema.
  class Session {
    constructor({driver,map,getState,mutate,onUpdate=()=>{},onError=()=>{}}){
      Object.assign(this,{driver,map,getState,mutate,onUpdate,onError});
      this.mode='demo';this.writable=false;this.epoch=0;this.info=null;this.error='';this.failureVersion=0;this.failure='';
      this.values=new Map();this.metadata=new Map();this.pending=new Map();this.samples=new Map();
      this.inflight=null;this.nodeLoads=new Map();this.processors=new Map();this.schemaLocks=new Set();this.reloadTimers=new Map();
      this.loaded=new Set();this.batch=new Map();this.applying=false;
      this.meters=null;this.syncDone=0;this.syncTotal=76;this.worker=null;
      this.unsubscribers=[driver.onValue((p,v)=>this.receive(p,v)),
        driver.onStatus((s,m)=>this.status(s,m)),
        (driver.onStripMeters||driver.onMeters).call(driver,f=>{if(this.networkActive()){this.meters=f;this.onUpdate('meters');}}),
        driver.onSchemaChange?.(change=>this.schemaChanged(change))].filter(Boolean);
    }
    active(){return this.mode!=='demo';}
    networkActive(){return ['connecting','syncing','live'].includes(this.mode);}
    connected(){return this.mode==='live';}
    snapshot(){return {mode:this.mode,writable:this.writable,info:this.info,error:this.error,
      pending:this.pending.size+(this.inflight?1:0),loaded:this.values.size,failureVersion:this.failureVersion,failure:this.failure,
      syncDone:this.syncDone,syncTotal:this.syncTotal,meterAge:this.meters?Date.now()-this.meters.receivedAt:null};}
    notify(){this.onUpdate('state');}
    failed(error){this.error=message(error);this.failure=this.error;this.failureVersion++;this.onError(this.error);}
    async connect(host){
      if(this.networkActive())throw new Error('Chiudi prima la connessione corrente.');
      const epoch=++this.epoch;this.clear();this.info=null;this.mode='connecting';this.error='';this.notify();
      try{
        this.info=await this.driver.connect(host);this.assert(epoch);this.mode='syncing';this.notify();
        const state=this.getState(),strips=state.inputs?[...state.outputs,...state.inputs]:Object.values(state.values);
        this.syncTotal=strips.length;this.syncDone=0;
        for(const strip of strips){this.assert(epoch);const base=this.map.stripPath(strip.id);await this.loadNode(base);for(const stage of ['preins','postins'])if(this.metadata.get(base+'/'+stage)?.type===0)await this.loadNode(base+'/'+stage);this.syncDone++;this.notify();}
        this.assert(epoch);this.flush();
        await this.driver.subscribeStripMeters({ch:Array.from({length:40},(_,i)=>i+1),aux:Array.from({length:8},(_,i)=>i+1),bus:Array.from({length:16},(_,i)=>i+1),main:[1,2,3,4],mtx:[1,2,3,4,5,6,7,8]});
        this.assert(epoch);this.mode='live';this.writable=false;this.notify();return this.info;
      }catch(e){
        if(epoch===this.epoch){
          // Invalidate first. A failed sync must not leave a live socket feeding
          // values into an apparently disconnected interface.
          const failure=message(e),failedEpoch=++this.epoch;this.clear();this.mode='error';this.error=failure;
          try{await this.driver.disconnect();}catch{}
          if(this.epoch===failedEpoch){this.mode='error';this.error=failure;this.notify();}
        }throw e;
      }
    }
    async disconnect(toDemo=false){
      ++this.epoch;this.clear();this.mode=toDemo?'demo':'disconnected';this.info=null;this.notify();
      await this.driver.disconnect();
    }
    clear(){
      this.writable=false;this.values.clear();this.metadata.clear();this.pending.clear();this.samples.clear();
      for(const token of this.nodeLoads.values())token.valid=false;
      this.nodeLoads.clear();this.processors.clear();this.schemaLocks.clear();this.loaded.clear();this.batch.clear();
      for(const timer of this.reloadTimers.values())clearTimeout(timer);this.reloadTimers.clear();
      this.inflight=null;this.worker=null;this.meters=null;this.syncDone=0;
      clearTimeout(this.batchTimer);this.batchTimer=null;clearTimeout(this.writeTimer);this.writeTimer=null;
    }
    assert(epoch){if(epoch!==this.epoch||!this.networkActive())throw new Error('La sessione WING è cambiata.');}
    assertWritable(epoch){this.assert(epoch);if(!this.connected()||!this.writable)throw new Error('Attiva «Controllo» nella connessione WING.');}
    status(status,note){
      if(['error','suspended','disconnected'].includes(status)&&this.networkActive()){
        ++this.epoch;this.clear();this.mode=status==='suspended'?'suspended':status==='error'?'error':'disconnected';
        this.error=note||'';this.notify();
      }
    }
    setWritable(value){
      if(value&&!this.connected())throw new Error('Attendi la lettura dei valori dal banco.');
      this.writable=!!value;
      if(!value){this.pending.clear();clearTimeout(this.writeTimer);this.writeTimer=null;this.flushAuthoritative();}
      this.notify();
    }
    receive(path,value){
      if(!this.networkActive())return;
      this.values.set(path,value);this.samples.set(path,(this.samples.get(path)||0)+1);
      if(!this.pending.has(path)&&this.inflight?.path!==path)this.batch.set(path,value);
      if(!this.batchTimer)this.batchTimer=setTimeout(()=>this.flush(),24);
    }
    flush(){
      clearTimeout(this.batchTimer);this.batchTimer=null;if(!this.batch.size)return;
      const entries=[...this.batch];this.batch.clear();
      entries.sort(([a],[b])=>Number(b.endsWith('/mdl'))-Number(a.endsWith('/mdl')));
      this.applying=true;
      try{this.mutate(state=>{for(const [path,value] of entries)this.map.apply(state,path,value);},'live-values');}
      finally{this.applying=false;}
    }
    flushAuthoritative(){for(const [p,v]of this.values)if(this.inflight?.path!==p)this.batch.set(p,v);this.flush();}
    async loadNode(path,{force=false}={}){
      if(!path)throw new Error('Percorso WING non disponibile.');
      const epoch=this.epoch;this.assert(epoch);
      const previous=this.nodeLoads.get(path);
      if(previous){if(previous.valid)return previous.promise;try{await previous.promise;}catch{}this.assert(epoch);return this.loadNode(path,{force});}
      if(this.loaded.has(path)&&!force)return;
      const token={path,epoch,valid:true,refresh:force,promise:null};
      const guard=()=>{this.assert(epoch);if(!token.valid)throw new Error('Lo schema del processore è cambiato durante la lettura.');};
      this.nodeLoads.set(path,token);
      token.promise=Promise.resolve().then(async()=>{
        const own=await this.driver.describe(path);guard();
        const definitions=own.type===0?await this.driver.list(path,{refresh:force}):[own];guard();
        const values=await this.driver.readTree(path);guard();
        // Commit metadata and values together, after the whole read completed.
        for(const def of definitions)this.metadata.set(def.path,def);
        for(const [p,v]of Object.entries(values))this.receive(p,v);
        this.loaded.add(path);this.flush();return definitions;
      });
      try{return await token.promise;}finally{if(this.nodeLoads.get(path)===token)this.nodeLoads.delete(path);}
    }
    async loadPaths(paths){for(const path of [...new Set(paths.filter(Boolean))])await this.loadNode(path);}
    async loadScope(scope,args){if(this.connected())await this.loadPaths(this.map.readPaths(this.getState(),scope,args)||[]);}
    processorState(ctx){
      const record=this.processors.get(keyFor(ctx));
      // Internal promises/contexts are not part of UI state signatures.
      return record?{loading:record.loading,ready:record.ready,error:record.error}:{loading:false,ready:false,error:''};
    }
    async ensureProcessor(ctx,{force=false}={}){
      if(!this.active())return;
      if(!this.connected())throw new Error('Collega la WING per leggere questo processore.');
      const key=keyFor(ctx),old=this.processors.get(key);
      if(old?.promise)return old.promise;if(old?.ready&&!force)return;
      const spec=this.map.processorSpec(ctx);
      if(!spec?.basePath)throw new Error('Posizione del processore non supportata.');
      const epoch=this.epoch,record={loading:true,ready:false,error:'',basePath:spec.basePath,ctx:clone(ctx),promise:null,reload:false};
      this.processors.set(key,record);
      record.promise=Promise.resolve().then(async()=>{
        try{
          // A genuine model change during loading gets one fresh attempt. Manual
          // refresh notifications do not recursively schedule further refreshes.
          for(let attempt=0;attempt<2;attempt++){
            record.reload=false;
            try{
              await this.loadNode(spec.basePath,{force:force||attempt>0});
              const now=this.map.processorSpec(ctx);
              if(now?.parametersBasePath&&now.parametersBasePath!==spec.basePath)await this.loadNode(now.parametersBasePath,{force:force||attempt>0});
              this.assert(epoch);if(record.reload)throw new Error('Schema del processore cambiato.');break;
            }catch(e){if(attempt===0&&record.reload&&epoch===this.epoch)continue;throw e;}
          }
          this.assert(epoch);if(this.processors.get(key)!==record)return;
          record.loading=false;record.ready=true;record.error='';this.schemaLocks.delete(spec.basePath);this.notify();
        }catch(e){if(epoch===this.epoch&&this.processors.get(key)===record){record.loading=false;record.ready=false;record.error=message(e);this.notify();}throw e;}
        finally{record.promise=null;}
      });this.notify();return record.promise;
    }
    scheduleProcessor(record){
      const key=keyFor(record.ctx);if(this.reloadTimers.has(key))return;
      const epoch=this.epoch,timer=setTimeout(()=>{
        this.reloadTimers.delete(key);if(epoch!==this.epoch||!this.connected())return;
        // Waiting for an in-flight request avoids mixing old model data with a
        // replacement model, while ensureProcessor coalesces repeated opens.
        Promise.resolve(record.promise).catch(()=>{}).then(()=>{if(epoch===this.epoch&&this.connected())return this.ensureProcessor(record.ctx,{force:true});}).catch(e=>this.onError(message(e)));
      },0);this.reloadTimers.set(key,timer);
    }
    clearProcessorParameters(base){
      const contexts=new Map();for(const record of this.processors.values())if(overlaps(record.basePath,base))contexts.set(keyFor(record.ctx),record.ctx);
      for(const d of this.map.descriptors?.(this.getState())||[])if(d.processor&&d.path.endsWith('/mdl')&&inside(d.path,base))contexts.set(keyFor(d.processor),d.processor);
      if(!contexts.size)return;this.applying=true;
      try{this.mutate(state=>{for(const ctx of contexts.values()){const p=ctx.type==='fx'?state.desk?.fx?.[ctx.slot-1]:state.desk?.processing?.[ctx.id]?.[ctx.block];if(p)p.params={};}},'live-schema');}
      finally{this.applying=false;}
    }
    schemaChanged(change){
      if(!this.networkActive()||!change?.path)return;
      const base=change.path.endsWith('/mdl')?change.path.slice(0,-4):change.path;
      this.clearProcessorParameters(base);
      const ownRefresh=change.model===undefined&&[...this.nodeLoads.values()].some(token=>token.refresh&&token.path===base&&token.epoch===this.epoch);
      for(const map of [this.metadata,this.values,this.samples,this.batch])for(const path of map.keys())if(inside(path,base))map.delete(path);
      for(const path of this.loaded)if(inside(path,base))this.loaded.delete(path);
      for(const path of this.pending.keys())if(inside(path,base))this.pending.delete(path);
      for(const token of this.nodeLoads.values())if(overlaps(token.path,base)&&!(ownRefresh&&token.path===base))token.valid=false;
      for(const record of this.processors.values())if(overlaps(record.basePath,base)){
        record.ready=false;record.loading=true;record.error='';
        if(!ownRefresh){record.reload=true;if(!record.promise)this.scheduleProcessor(record);}
      }
      this.notify();
    }
    explainedMutation(before,after,changes,bases){
      const projected=clone(before),next=this.map.capture(after),descriptors=this.map.descriptors?.(after)||[];
      // Replay only the changed, mapped leaves into a projection. This detects
      // a compound UI operation that would otherwise silently keep an unmapped
      // half while transmitting its mapped half.
      const ordered=[...changes].sort((a,b)=>Number(b.path.endsWith('/mdl'))-Number(a.path.endsWith('/mdl')));
      for(const change of ordered)this.map.apply(projected,change.path,change.value);
      for(const d of descriptors)if(d.readOnly&&next.has(d.path))this.map.apply(projected,d.path,next.get(d.path));
      const modelRoots=descriptors.filter(d=>d.processor&&d.path.endsWith('/mdl')&&bases.includes(d.path.slice(0,-4))).map(d=>d.processor.type==='fx'?['desk','fx',String(d.processor.slot-1)]:['desk','processing',d.processor.id,d.processor.block]);
      const same=(a,b)=>equal(a,b)||(a!==undefined&&b!==undefined&&['string','number'].includes(typeof a)&&['string','number'].includes(typeof b)&&String(a)===String(b));
      const ignored=path=>path.length===1&&['selected','sof','meters'].includes(path[0])||path[0]==='desk'&&localDeskKeys.has(path[1])||modelRoots.some(root=>root.every((p,i)=>path[i]===p)&&path.length>root.length&&['params','mix','enabled'].includes(path[root.length]));
      const check=(a,b,p,path=[])=>{
        if(ignored(path)||same(a,b))return true;
        // Sculpt's swatches are translated to the closest available console
        // colour. That declared conversion is not an unmapped companion edit.
        if(path.at(-1)==='color'&&/^#[0-9a-f]{6}$/i.test(String(b))&&Array.isArray(this.map.COLORS)){
          const rgb=[1,3,5].map(n=>parseInt(b.slice(n,n+2),16));let nearest,distance=Infinity;
          for(const color of this.map.COLORS.slice(1)){const d=[1,3,5].reduce((sum,n,i)=>sum+(parseInt(color.slice(n,n+2),16)-rgb[i])**2,0);if(d<distance){distance=d;nearest=color;}}
          if(String(nearest).toLowerCase()===String(p).toLowerCase())return true;
        }
        if(Array.isArray(b)&&['members','targets','channels'].includes(path.at(-1))&&Array.isArray(p))return JSON.stringify([...b].sort())===JSON.stringify([...p].sort());
        if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].every(key=>check(a[key],b[key],p?.[key],[...path,key]));
        return same(b,p)||JSON.stringify(b)===JSON.stringify(p);
      };
      return check(before,after,projected);
    }
    review(before,after,type){
      if(!this.active()||this.applying)return {ok:true};
      const previous=this.map.capture(before),next=this.map.capture(after),changes=[];
      const readOnly=new Set((this.map.descriptors?.(after)||[]).filter(d=>d.readOnly).map(d=>d.path));
      for(const [path,value]of next)if(!readOnly.has(path)&&previous.has(path)&&!equal(value,previous.get(path)))changes.push({path,value});
      if(!changes.length){
        const a=clone(before),b=clone(after);
        for(const s of [a,b]){delete s.selected;delete s.sof;delete s.meters;if(s.desk)for(const k of localDeskKeys)delete s.desk[k];}
        return JSON.stringify(a)===JSON.stringify(b)?{ok:true}:{ok:false,reason:'Questo controllo non ha ancora un collegamento verificato. Apri «Parametri WING» per il valore del banco.'};
      }
      if(!this.connected()||!this.writable)return {ok:false,reason:this.connected()?'Attiva «Controllo» nella connessione WING per inviare modifiche.':'La WING non è collegata. Nessun comando è stato accodato.'};
      const models=changes.filter(c=>c.path.endsWith('/mdl')),bases=models.map(c=>c.path.slice(0,-4));
      const filtered=changes.filter(c=>c.path.endsWith('/mdl')||!bases.some(base=>inside(c.path,base)));
      for(const change of filtered){
        if(!change.path.endsWith('/mdl')&&[...this.schemaLocks].some(base=>inside(change.path,base)))return {ok:false,reason:'Attendi il caricamento del nuovo modello prima di modificarne i parametri.'};
        const meta=this.metadata.get(change.path);
        if(!this.values.has(change.path)||!meta)return {ok:false,reason:'Attendi la lettura di questa sezione dal banco prima di modificarla.'};
        if(meta.readOnly)return {ok:false,reason:'Il banco dichiara questo parametro di sola lettura.'};
        if(typeof change.value==='number'&&!Number.isFinite(change.value))return {ok:false,reason:'Valore non valido.'};
        if(meta.items){const item=meta.items.find(item=>equal(item.value,change.value))||meta.items.find(item=>String(item.value)===String(change.value));if(!item)return {ok:false,reason:'Questa opzione non è disponibile nel firmware collegato.'};change.value=item.value;}
        if(typeof change.value==='number'&&((meta.min!==undefined&&change.value<meta.min)||(meta.max!==undefined&&change.value>meta.max)))return {ok:false,reason:'Il valore supera i limiti dichiarati dal banco.'};
      }
      if(!this.explainedMutation(before,after,filtered,bases))return {ok:false,reason:'Questa azione contiene un parametro senza collegamento verificato. Nessuna modifica è stata inviata.'};
      for(const base of bases){
        this.schemaLocks.add(base);
        // Drop parameter gestures before queueing mdl. They belong to the old
        // algorithm even when the socket has not yet reported the new schema.
        for(const path of this.pending.keys())if(inside(path,base)&&path!==base+'/mdl')this.pending.delete(path);
        for(const record of this.processors.values())if(record.basePath===base){record.ready=false;record.loading=true;}
      }
      for(const change of filtered)this.enqueue(change.path,change.value);
      this.notify();return {ok:true};
    }
    enqueue(path,value){
      const meta=this.metadata.get(path);this.pending.set(path,{path,value,revision:meta?.revision,epoch:this.epoch});
      if(!this.writeTimer)this.writeTimer=setTimeout(()=>{this.writeTimer=null;this.drain();},35);
    }
    async recover(path,sample,epoch){
      if(epoch!==this.epoch||!this.connected())return;
      // set() normally emits its readback even when the value was rejected. If
      // it failed earlier, read once to replace the optimistic UI with reality.
      if((this.samples.get(path)||0)===sample&&this.driver.get){try{const value=await this.driver.get(path);if(epoch===this.epoch&&this.connected())this.receive(path,value);}catch{}}
    }
    async drain(){
      if(this.worker)return this.worker;
      const epoch=this.epoch;
      const work=Promise.resolve().then(async()=>{
        while(this.pending.size&&epoch===this.epoch&&this.writable&&this.connected()){
          const entry=this.pending.values().next().value;this.pending.delete(entry.path);
          if(entry.epoch!==epoch)continue;
          this.inflight=entry;this.notify();const sample=this.samples.get(entry.path)||0;
          try{
            await this.driver.set(entry.path,entry.value,{revision:entry.revision});
            if(epoch!==this.epoch)return;
            if(entry.path.endsWith('/mdl')){
              const base=entry.path.slice(0,-4);this.loaded.delete(base);await this.loadNode(base,{force:true});
              this.schemaLocks.delete(base);
              for(const record of this.processors.values())if(record.basePath===base&&!record.promise){record.ready=true;record.loading=false;record.error='';}
            }
          }catch(e){
            if(epoch===this.epoch){this.failed(e);await this.recover(entry.path,sample,epoch);
              if(entry.path.endsWith('/mdl')){const base=entry.path.slice(0,-4);this.schemaLocks.delete(base);for(const record of this.processors.values())if(record.basePath===base){record.loading=false;record.error=this.error;this.scheduleProcessor(record);}}}
          }finally{
            if(epoch===this.epoch){this.inflight=null;if(!this.pending.has(entry.path)&&this.values.has(entry.path)){this.batch.set(entry.path,this.values.get(entry.path));this.flush();}this.notify();}
          }
        }
      });this.worker=work;
      try{await work;}finally{if(this.worker===work){this.worker=null;this.inflight=null;this.notify();}}
    }
    async settled(){clearTimeout(this.writeTimer);this.writeTimer=null;await this.drain();}
    async write(path,value,{trigger=false}={}){
      const epoch=this.epoch;this.assertWritable(epoch);
      const meta=await this.driver.describe(path);this.assertWritable(epoch);this.metadata.set(path,meta);
      if(meta.readOnly)throw new Error('Parametro di sola lettura.');
      await this.settled();this.assertWritable(epoch);
      const sample=this.samples.get(path)||0,isModel=path.endsWith('/mdl'),base=isModel?path.slice(0,-4):null;
      if(isModel)this.schemaLocks.add(base);
      try{
        const result=trigger?await this.driver.trigger(path,value,{revision:meta.revision}):await this.driver.set(path,value,{revision:meta.revision});
        this.assert(epoch);
        if(isModel){this.loaded.delete(base);await this.loadNode(base,{force:true});this.schemaLocks.delete(base);}
        this.flush();return result;
      }catch(e){if(epoch===this.epoch)this.failed(e);await this.recover(path,sample,epoch);this.flush();throw e;}
      finally{if(epoch===this.epoch&&base)this.schemaLocks.delete(base);}
    }
    async processorPreset(ctx,preset){
      const epoch=this.epoch;this.assertWritable(epoch);await this.ensureProcessor(ctx);this.assertWritable(epoch);
      const spec=this.map.processorSpec(ctx,preset.model);if(!spec?.modelPath)throw new Error('Modello non disponibile.');
      await this.write(spec.modelPath,preset.model);this.loaded.delete(spec.basePath);await this.ensureProcessor(ctx,{force:true});
      for(const [key,value]of Object.entries(preset.params||{})){
        this.assertWritable(epoch);const path=spec.parameterPath(key);if(!path||!this.metadata.has(path)||key==='load')continue;
        await this.write(path,value);
      }
      if(spec.enabledPath&&typeof preset.enabled==='boolean')await this.write(spec.enabledPath,preset.enabled?1:0);
      if(spec.mixPath&&Number.isFinite(preset.mix))await this.write(spec.mixPath,preset.mix);
      await this.ensureProcessor(ctx,{force:true});
    }
    meter(id,tap='output'){
      if(!this.meters||Date.now()-this.meters.receivedAt>1200)return null;
      const [family,n]=id.split('-'),meter=this.meters.strips?.[family]?.[Number(n)];
      return meter?{left:meter[tap]?.[0]??-144,right:meter[tap]?.[1]??-144,...meter}:null;
    }
    dispose(){++this.epoch;this.clear();this.mode='demo';this.unsubscribers.forEach(fn=>fn());}
  }
  const api={Session,keyFor};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SculptLiveSession=api;
})(typeof window!=='undefined'?window:globalThis);
