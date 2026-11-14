(function(root){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const equal=(a,b)=>Object.is(a,b)||(typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<1e-7);
  const inside=(path,base)=>base==='/'||path===base||path.startsWith(base+'/');
  const overlaps=(a,b)=>inside(a,b)||inside(b,a);
  const message=e=>e?.message||String(e);
  const writeSchema=meta=>JSON.stringify([meta.path,meta.revision,meta.type,!!meta.readOnly,meta.min,meta.max,meta.maxLength,meta.unit,Array.isArray(meta.items)?meta.items.map(item=>item.value):null]);
  const keyFor=ctx=>ctx.type==='fx'?`fx:${ctx.slot}`:`${ctx.id}:${ctx.block}`;
  // The public protocol gives a numeric RTA source range, but no verified
  // source-index-to-strip table. Accept only explicit symbolic firmware labels.
  const rtaReference=value=>{if(typeof value!=='string')return null;const match=/^\/?(CH|CHANNEL|AUX|BUS|MAIN|MTX|MATRIX)[.\s/_-]*(\d+)$/i.exec(value.trim());if(!match)return null;const family=({channel:'ch',matrix:'mtx'})[match[1].toLowerCase()]||match[1].toLowerCase(),n=Number(match[2]);return n>=1&&n<=({ch:40,aux:8,bus:16,main:4,mtx:8})[family]?family+'-'+n:null;};
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
      this.meters=null;this.meterInvalidations=new Map();this.syncDone=0;this.syncTotal=76;this.worker=null;
      this.rtaGeneration=0;this.rtaActualRevision=0;this.rtaRequest=null;this.rtaFrame=null;this.rtaReportId=null;this.rtaVerifiedAt=0;this.rtaNeedsReport=true;this.rtaTimer=null;this.rtaError='';this.rtaLoading=false;
      this.unsubscribers=[driver.onValue((p,v)=>this.receive(p,v)),
        driver.onStatus((s,m)=>this.status(s,m)),
        (driver.onStripMeters||driver.onMeters).call(driver,f=>{if(this.networkActive()){this.meters=f;this.onUpdate('meters');}}),
        driver.onRta?.(frame=>this.receiveRta(frame)),
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
      ++this.rtaGeneration;clearTimeout(this.rtaTimer);this.rtaTimer=null;this.rtaRequest=null;this.rtaFrame=null;this.rtaReportId=null;this.rtaVerifiedAt=0;this.rtaNeedsReport=true;this.rtaError='';this.rtaLoading=false;
      this.writable=false;this.values.clear();this.metadata.clear();this.pending.clear();this.samples.clear();
      for(const token of this.nodeLoads.values())token.valid=false;
      this.nodeLoads.clear();this.processors.clear();this.schemaLocks.clear();this.loaded.clear();this.batch.clear();
      for(const timer of this.reloadTimers.values())clearTimeout(timer);this.reloadTimers.clear();
      this.inflight=null;this.worker=null;this.meters=null;this.meterInvalidations.clear();this.syncDone=0;
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
      const previous=this.values.get(path);
      if(/\/(gate|dyn)\/mdl$/.test(path)&&this.values.has(path)&&this.values.get(path)!==value)this.invalidateGainMeters(path.slice(0,-4));
      this.values.set(path,value);this.samples.set(path,(this.samples.get(path)||0)+1);
      // RTA metadata belongs to the live analyser, not to the saved Sculpt
      // show. Polling this small branch must not repaint the whole console.
      if(path.startsWith('/cfg/rta/')){
        if((path==='/cfg/rta/$src'||path==='/cfg/rta/$tap')&&!equal(previous,value)){
          ++this.rtaActualRevision;this.rtaFrame=null;this.rtaNeedsReport=true;this.rtaVerifiedAt=0;
          if(this.rtaRequest)this.onUpdate('rta');
        }return;
      }
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
      if(overlaps(base,'/cfg/rta')){++this.rtaActualRevision;this.rtaFrame=null;this.rtaNeedsReport=true;this.rtaVerifiedAt=0;if(this.rtaRequest)this.onUpdate('rta');}
      this.invalidateGainMeters(base);
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
    async write(path,value,{trigger=false,expectedSchema}={}){
      const epoch=this.epoch;this.assertWritable(epoch);
      if(expectedSchema!==undefined&&(!expectedSchema||typeof expectedSchema!=='object'||Array.isArray(expectedSchema)))throw new Error('Schema atteso del parametro non valido.');
      // A prepared macro binds to the definition it reviewed. Refreshing the
      // metadata must not silently move that command to a replacement model.
      const expected=expectedSchema===undefined?null:writeSchema(expectedSchema);
      const meta=await this.driver.describe(path);this.assertWritable(epoch);
      if(expected!==null&&writeSchema(meta)!==expected)throw new Error('Lo schema WING è cambiato dopo la preparazione della macro. Rileggi il parametro prima di eseguirla.');
      this.metadata.set(path,meta);
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
    rtaIdentity(value=this.values.get('/cfg/rta/$src')){
      const meta=this.metadata.get('/cfg/rta/$src'),item=meta?.items?.find(item=>equal(item.value,value));
      // FXIN/FXOUT reuse the source number for an FX slot. SOLO and monitor
      // taps are also not an EQ strip, even if a future enum has strip labels.
      const stripTap=['IN','POST','FILT','PREEQ','POSTEQ','PREFDR','GATEK','DYNK','DYNXO','PRETAP'].includes(this.values.get('/cfg/rta/$tap'));
      const id=stripTap?(rtaReference(value)||rtaReference(item?.label)):null;
      return {id,label:id?(item?.label||String(value)):Number.isInteger(value)?'Sorgente WING #'+value:'Sorgente WING non identificata'};
    }
    rtaSources(){
      const actual=this.metadata.get('/cfg/rta/$src')?.items||[],requested=this.metadata.get('/cfg/rta/rtasrc')?.items||[];
      const known=new Set(actual.map(item=>rtaReference(item.value)||rtaReference(item.label)).filter(Boolean));
      return requested.map(item=>({id:rtaReference(item.value)||rtaReference(item.label),label:item.label,value:item.value})).filter(item=>item.id&&known.has(item.id));
    }
    rtaMatches(){
      if(!this.rtaRequest)return false;
      return this.rtaRequest.followConsole||this.rtaIdentity().id===this.rtaRequest.id&&this.values.get('/cfg/rta/$tap')===this.rtaRequest.tap;
    }
    rtaSnapshot(){
      const request=this.rtaRequest,sourceIndex=this.values.get('/cfg/rta/$src'),tap=this.values.get('/cfg/rta/$tap'),now=Date.now();
      const identity=this.rtaIdentity(sourceIndex),sourceId=identity.id,matches=this.rtaMatches();
      const age=this.rtaFrame?now-this.rtaFrame.receivedAt:null,verifiedAge=now-this.rtaVerifiedAt;
      const fresh=matches&&!this.rtaNeedsReport&&verifiedAge>=0&&verifiedAge<2500&&age!==null&&age>=0&&age<1200;
      let status=!this.active()?'offline':!this.connected()?'disconnected':!request?'inactive':this.rtaError?'unavailable':this.rtaLoading?'loading':!request.followConsole&&!sourceId?'unmapped':!matches?(this.writable?'occupied':'readonly'):fresh?'live':age!==null?'stale':'waiting';
      return {status,requestedId:request?.id||null,requestedTap:request?.tap||null,sourceId,sourceIndex:Number.isInteger(sourceIndex)?sourceIndex:null,tap:typeof tap==='string'?tap:null,
        sourceLabel:identity.label,mappingVerified:!!sourceId,followConsole:!!request?.followConsole,sources:this.rtaSources(),
        error:this.rtaError,binsRaw:fresh?this.rtaFrame.binsRaw:null,receivedAt:fresh?this.rtaFrame.receivedAt:null,reportId:this.rtaReportId,age,scale:'relative'};
    }
    receiveRta(frame){
      if(!this.connected()||!this.rtaRequest||this.rtaNeedsReport||!frame||frame.reportId!==this.rtaReportId)return;
      if(!Number.isFinite(frame.receivedAt)||frame.receivedAt<this.rtaVerifiedAt||frame.receivedAt>Date.now()+50||Date.now()-frame.receivedAt>=1200)return;
      if(!Array.isArray(frame.binsRaw)||frame.binsRaw.length!==120||frame.binsRaw.some(n=>!Number.isInteger(n)||n<-32768||n>32767))return;
      if(!this.rtaMatches())return;
      this.rtaFrame=frame;this.onUpdate('rta');
    }
    async setRtaRequest(request){
      const followConsole=request?.followConsole===true,requestId=rtaReference(request?.id);
      if(request&&(typeof request!=='object'||Array.isArray(request)||(!followConsole&&(!requestId||!['IN','FILT','PREEQ','POSTEQ','PREFDR','POST','GATEK','DYNK'].includes(request.tap)))))throw new Error('Sorgente o punto RTA non valido.');
      const generation=++this.rtaGeneration,epoch=this.epoch;
      clearTimeout(this.rtaTimer);this.rtaTimer=null;this.rtaFrame=null;this.rtaReportId=null;this.rtaVerifiedAt=0;this.rtaNeedsReport=true;this.rtaError='';
      this.rtaRequest=request?(followConsole?{id:null,tap:null,followConsole:true}:{id:requestId,tap:request.tap,followConsole:false}):null;this.rtaLoading=!!request;this.onUpdate('rta');
      const current=()=>generation===this.rtaGeneration&&epoch===this.epoch&&this.connected()&&!!this.rtaRequest;
      if(typeof this.driver.subscribeRta!=='function'||typeof this.driver.onRta!=='function'){
        this.rtaLoading=false;if(request&&this.connected())this.rtaError='Il trasporto installato non espone il flusso RTA.';this.onUpdate('rta');return;
      }
      try{
        if(this.connected())await this.driver.subscribeRta(false);
        if(generation!==this.rtaGeneration||epoch!==this.epoch)return;
        if(!request||!current()){this.rtaLoading=false;this.onUpdate('rta');return;}
        await this.loadNode('/cfg/rta');if(!current())return;
        if(!this.metadata.has('/cfg/rta/$src')||!this.metadata.has('/cfg/rta/$tap'))throw new Error('Il firmware non espone sorgente e punto effettivi del RTA.');
        // The single DSP analyser is shared with the desk. Request only its
        // documented source/tap, once; never change screen settings or lock
        // the console, and never repeatedly fight another client's selection.
        const mapping=!followConsole&&this.rtaSources().find(item=>item.id===requestId);
        if(this.writable&&mapping){
          const writes=[['/cfg/rta/rtasrc',mapping.value],['/cfg/rta/rtatap',request.tap]].filter(([path,value])=>!equal(this.values.get(path),value));
          for(const [path,value]of writes){const meta=this.metadata.get(path);if(!meta||meta.readOnly||meta.type===0)throw new Error('La sorgente RTA non è modificabile nel firmware collegato.');if(meta.items&&!meta.items.some(item=>equal(item.value,value)))throw new Error('Il punto RTA richiesto non è disponibile nel firmware collegato.');if(typeof value==='number'&&((meta.min!==undefined&&value<meta.min)||(meta.max!==undefined&&value>meta.max)))throw new Error('Indice RTA fuori dai limiti del firmware.');}
          await this.settled();if(!current())return;
          for(const [path,value]of writes){if(!current())return;if(!this.writable)break;const meta=this.metadata.get(path);await this.driver.set(path,value,{revision:meta.revision});if(!current())return;}
        }
        await this.refreshRta(generation,epoch);
      }catch(error){if(current()){this.rtaError=message(error);this.rtaFrame=null;this.rtaLoading=false;this.onUpdate('rta');}}
    }
    async refreshRta(generation,epoch){
      const current=()=>generation===this.rtaGeneration&&epoch===this.epoch&&this.connected()&&!!this.rtaRequest;
      if(!current())return;
      clearTimeout(this.rtaTimer);this.rtaTimer=null;
      try{
        if(!this.metadata.has('/cfg/rta/$src')||!this.metadata.has('/cfg/rta/$tap')){await this.loadNode('/cfg/rta');if(!current())return;}
        const values=await this.driver.readTree('/cfg/rta');if(!current())return;
        const source=values['/cfg/rta/$src'],tap=values['/cfg/rta/$tap'];
        const sourceKnown=this.rtaIdentity(source).id;
        if((!sourceKnown&&(!Number.isInteger(source)||source<1||source>76))||typeof tap!=='string')throw new Error('Sorgente effettiva RTA non identificata dal banco.');
        for(const [path,value]of Object.entries(values))this.receive(path,value);
        const matches=this.rtaMatches();
        this.rtaVerifiedAt=Date.now();this.rtaError='';this.rtaLoading=false;
        if(matches&&this.rtaNeedsReport){
          const revision=this.rtaActualRevision;this.rtaFrame=null;const id=await this.driver.subscribeRta(true);if(!current())return;
          if(!Number.isInteger(id)||id<1)throw new Error('Report RTA non valido.');
          this.rtaReportId=id;this.rtaNeedsReport=revision!==this.rtaActualRevision;
        }else if(!matches){this.rtaFrame=null;this.rtaReportId=null;this.rtaNeedsReport=true;await this.driver.subscribeRta(false);if(!current())return;}
        this.onUpdate('rta');
      }catch(error){if(!current())return;this.rtaError=message(error);this.rtaFrame=null;this.rtaReportId=null;this.rtaNeedsReport=true;this.rtaLoading=false;this.onUpdate('rta');}
      if(current())this.rtaTimer=setTimeout(()=>{this.rtaTimer=null;void this.refreshRta(generation,epoch);},1000);
    }
    stripMeter(id){
      const receivedAt=this.meters?.receivedAt,age=Date.now()-receivedAt;
      if(!this.connected()||!Number.isFinite(receivedAt)||age<0||age>1200||typeof id!=='string')return null;
      const match=/^(ch|aux|bus|main|mtx)-(\d+)$/.exec(id);
      return match?this.meters.strips?.[match[1]]?.[Number(match[2])]||null:null;
    }
    meter(id,tap='output'){
      const meter=this.stripMeter(id);if(!meter)return null;
      const levels=meter[tap==='input'?'input':'output'];
      return {...meter,left:Number.isFinite(levels?.[0])?levels[0]:-144,right:Number.isFinite(levels?.[1])?levels[1]:-144};
    }
    invalidateGainMeters(base){
      // A frame measured before a processor/model change cannot be relabelled
      // with the new model's scale. Wait for the next UDP frame for that block.
      for(const [family,strips]of Object.entries(this.meters?.strips||{}))for(const index of Object.keys(strips))for(const block of ['gate','dyn']){
        const path=`/${family}/${index}/${block}`;if(overlaps(path,base))this.meterInvalidations.set(path,Date.now());
      }
    }
    gainReduction(id){
      const meter=this.stripMeter(id);if(!meter)return null;
      const base='/'+id.replace('-','/');
      const read=(block,raw)=>{
        if(!Number.isInteger(raw)||raw<-32768||raw>32767||this.meters.receivedAt<=(this.meterInvalidations.get(base+'/'+block)??-Infinity))return null;
        const on=this.values.get(base+'/'+block+'/on'),enabled=on===0?false:on===1?true:null;
        const normalized=raw/256,reduction=enabled===false?0:Math.max(0,normalized);
        // The protocol specifies 60 dB only for standard GATE. It says 'most'
        // other models use 20 dB, not which ones: never guess their dB scale.
        const model=this.values.get(base+'/'+block+'/mdl'),scale=model==='GATE'?60:null;
        return {fraction:Math.min(1,reduction),raw,db:scale===null?null:reduction*scale,enabled};
      };
      return {gate:read('gate',meter.gateGainRaw),comp:read('dyn',meter.dynGainRaw)};
    }
    dispose(){++this.epoch;this.clear();this.mode='demo';this.unsubscribers.forEach(fn=>fn());}
  }
  const api={Session,keyFor};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SculptLiveSession=api;
})(typeof window!=='undefined'?window:globalThis);
