'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../dist/model.js'),K=require('../dist/plugin-data.js'),MapAPI=require('../dist/wing-map.js');
const {Journal}=require('../dist/history.js'),{Session}=require('../dist/live-session.js');
const {create}=require('../dist/channel-chain.js');
const copy=value=>JSON.parse(JSON.stringify(value)),pause=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const permutations=items=>items.length?items.flatMap((item,index)=>permutations(items.filter((_,i)=>i!==index)).map(rest=>item+rest)):[''];
const ORDERS=permutations(['G','E','D','I']),TAPS=['IN','FILT','3','4','5','PFL','AFL','POST'];
const IDS=['home','input','gate','eq','dyn','pre','post','sends','master'];

class Mixer {
  constructor(){
    this.values=new Map();this.meta=new Map();this.reads=[];this.writes=[];this.describes=[];this.omit=new Set();
    this.handlers={value:new Set(),status:new Set(),meters:new Set(),schema:new Set()};
    for(const [kind,count] of [['ch',40],['aux',8],['bus',16],['main',4],['mtx',8],['dca',16]])for(let n=1;n<=count;n++){
      const base='/'+kind+'/'+n;
      this.field(base+'/fdr',-12,3,{min:-144,max:10});this.field(base+'/mute',0,4,{min:0,max:1});
      if(kind==='ch'){
        this.field(base+'/proc','GEDI',5,{items:ORDERS.map(value=>({value}))});
        this.field(base+'/ptap','5',5,{items:TAPS.map(value=>({value}))});
      }
    }
  }
  field(path,value,type,extra={}){this.values.set(path,value);this.meta.set(path,{path,type,revision:1,readOnly:false,...extra});}
  listen(kind,listener){this.handlers[kind].add(listener);return()=>this.handlers[kind].delete(listener);}
  onValue(listener){return this.listen('value',listener);}onStatus(listener){return this.listen('status',listener);}
  onStripMeters(listener){return this.listen('meters',listener);}onSchemaChange(listener){return this.listen('schema',listener);}
  emit(kind,...args){for(const listener of this.handlers[kind])listener(...args);}
  async connect(host){return {host,name:'Chain test WING',model:'WING',firmware:'fixture'};}
  async disconnect(){this.emit('status','disconnected');}async subscribeStripMeters(){}
  async describe(path){
    this.describes.push(path);if(this.describeHook)await this.describeHook(path);
    if(this.meta.has(path))return copy(this.meta.get(path));
    if([...this.meta.keys()].some(key=>key.startsWith(path+'/')))return {path,type:0,revision:1};
    throw new Error('Unknown node '+path);
  }
  async list(path){return [...this.meta].filter(([key])=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')).map(([,meta])=>copy(meta));}
  async readTree(path,options){
    this.reads.push({path,options});if(this.readHook)await this.readHook(path);
    if(this.meta.has(path))return this.omit.has(path)?{}:{[path]:this.values.get(path)};
    return Object.fromEntries([...this.values].filter(([key])=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')&&!this.omit.has(key)));
  }
  async get(path){return this.values.get(path);}
  async set(path,value,options){
    this.writes.push({path,value,options});if(this.setHook)await this.setHook(path,value);
    if(this.rejectWrite)throw new Error('Remote Lock fixture');
    const actual=this.actualOverride??value;this.values.set(path,actual);this.emit('value',path,actual);
    if(actual!==value)throw new Error('Readback fixture mismatch');
  }
}

async function fixture(t,{live=false,application=false}={}){
  const driver=new Mixer(),updates=new Set();let state=M.defaults(),session,journal,C,D,environment,dom;
  if(application){
    const {JSDOM}=require('../native/node_modules/jsdom');
    dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'});
    environment=dom.window;environment.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
    environment.ResizeObserver=class{observe(){}disconnect(){}};environment.requestAnimationFrame=()=>0;
    environment.HTMLElement.prototype.scrollTo=function(){};environment.HTMLElement.prototype.scrollIntoView=function(){};
    environment.HTMLDialogElement.prototype.showModal=function(){this.open=true;};environment.HTMLDialogElement.prototype.close=function(){this.open=false;};
    for(const file of ['plugin-data.js','model.js','history.js','app.js','desk.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),dom.getInternalVMContext(),{filename:file});
    C=environment.SculptController;D=environment.SculptDesk;
  }else{
    const subscribers=new Set();
    environment={SculptModel:M,SculptCatalog:K};
    C={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),
      subscribe(listener){subscribers.add(listener);return()=>subscribers.delete(listener);},
      transact(mutator,type='console',options={}){
        const before=session?.active()&&!session.applying?copy(state):null;
        const token=session?.applying?null:journal?.prepare(state,type,options);
        mutator(state);
        if(before&&!session.review(before,state,type,options.id).ok){state=before;return false;}
        journal?.record(token,state);for(const listener of subscribers)listener({type,id:options.id});return true;
      },capture:()=>copy(M.serialize(state)),toast(){},historyState:()=>journal.status(),clearHistory:()=>journal.clear(),
      undo:()=>journal.run('undo'),redo:()=>journal.run('redo')};
    environment.SculptController=C;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/desk.js'),'utf8'),{window:environment,console});
    D=environment.SculptDesk;
    journal=new Journal({getState:C.getState,context:()=>session?.active()?{live:true,session:session.epoch}:{live:false},
      apply:(fn,type,entry)=>C.transact(fn,type,{record:false,paths:entry.patches.map(patch=>patch.path)}),
      beforeApply:async()=>{if(session?.active())await session.settled();},afterApply:async()=>{if(session?.active())await session.settled();}});
  }
  session=new Session({driver,map:MapAPI,getState:C.getState,mutate:(fn,type)=>C.transact(fn,type,{record:false}),onUpdate:()=>{for(const listener of updates)listener(session.snapshot());}});
  environment.SculptLive={
    isLive:()=>session.active(),isConnected:()=>session.connected(),isWritable:()=>session.writable,sessionToken:()=>session.epoch,
    applying:()=>session.applying,canPersist:()=>!session.active(),snapshot:()=>session.snapshot(),meter:()=>null,gainReduction:()=>null,
    hasStripValue:(id,target)=>session.values.has(target?MapAPI.sendPath(id,target,'level'):MapAPI.stripPath(id)+'/fdr'),
    reviewMutation:(before,after,type,id)=>session.review(before,after,type,id).ok,
    metadata:path=>session.metadata.get(path),hasValue:path=>session.values.has(path),value:path=>session.values.get(path),
    describeNode:path=>session.describeNode(path),readValues:(path,options)=>session.readValues(path,options),settled:()=>session.settled(),
    subscribe(listener){updates.add(listener);return()=>updates.delete(listener);}
  };
  const chain=create(environment);t.after(()=>{session.dispose();dom?.window.close();});
  if(live)await session.connect('192.0.2.10');
  C.clearHistory();driver.reads=[];driver.describes=[];driver.writes=[];
  return {C,D,driver,session,chain,environment,updates};
}

test('all five families expose nine pages, correct fixed output order and unavailable placeholders',async t=>{
  const f=await fixture(t);
  for(const family of ['ch','aux','bus','main','mtx']){
    const s=f.chain.snapshot(family+'-1');assert.equal(s.items.length,9);assert.deepEqual([...s.order].sort(),[...IDS].sort());
    assert.equal(s.order[0],'home');assert.equal(s.order.at(-1),'master');assert.equal(s.items.find(item=>item.id==='input').available,true);
    assert.equal(s.items.find(item=>item.id==='gate').available,family==='ch');
    assert.equal(s.items.find(item=>item.id==='post').available,family!=='aux');
    assert.equal(s.items.find(item=>item.id==='sends').available,family!=='mtx');
    if(family!=='ch')assert.ok(s.items.every(item=>!item.movable));
    if(['bus','main','mtx'].includes(family)){
      assert.deepEqual(s.order,['home','input','gate','dyn','pre','eq','post','sends','master']);
      assert.equal(s.items.find(item=>item.id==='eq').badge,'post-fader');
    }
  }
  assert.deepEqual(f.chain.snapshot('aux-1').order,IDS);
  assert.equal(f.chain.snapshot('ch-41').ready,false);assert.throws(()=>f.chain.begin('ch-41','eq'),/non disponibile/);
});

test('live unknown order never falls back to the demo; prepare reads exactly the two scalar leaves',async t=>{
  const f=await fixture(t,{live:true});f.session.values.delete('/ch/1/proc');f.session.metadata.delete('/ch/1/proc');f.session.values.delete('/ch/1/ptap');
  f.D.channel('ch-1').order=['insert','dyn','eq','gate'];
  let s=f.chain.snapshot('ch-1');assert.equal(s.proc,null);assert.equal(s.tap,null);assert.equal(s.ready,false);assert.deepEqual(s.order,IDS);
  assert.ok(s.items.every(item=>!item.movable));assert.throws(()=>f.chain.begin('ch-1','eq'),/da leggere/);
  s=await f.chain.prepare('ch-1');assert.equal(s.proc,'GEDI');assert.equal(s.tap,'5');assert.equal(s.ready,true);
  assert.deepEqual(f.driver.reads.map(read=>read.path),['/ch/1/proc','/ch/1/ptap']);
  assert.ok(f.driver.reads.every(read=>read.options.depth===0));assert.equal(f.driver.writes.length,0);
  await f.chain.prepare('bus-1');assert.equal(f.driver.reads.length,2,'fixed output page must not invent /bus/1/proc');
});

test('all 24 console permutations preserve the four processing identities and leave tap numeric',async t=>{
  const f=await fixture(t,{live:true}),decode={G:'gate',E:'eq',D:'dyn',I:'pre'};
  for(const value of ORDERS){
    f.driver.values.set('/ch/1/proc',value);f.session.receive('/ch/1/proc',value);f.session.flush();
    const s=f.chain.snapshot('ch-1');assert.equal(s.proc,value);assert.equal(s.tap,'5');
    assert.deepEqual(s.order.filter(id=>['gate','eq','dyn','pre'].includes(id)),[...value].map(letter=>decode[letter]));
    assert.equal(s.order[s.order.indexOf('sends')-1],decode[value[2]],'TAP5 follows the third block, never a fixed named effect');
    const token=f.chain.begin('ch-1','eq');for(const target of f.chain.targets(token))assert.ok(ORDERS.includes(target.value));
  }
});

test('offline reorder and tap selection pass through real Desk history, including Undo and Redo',async t=>{
  const f=await fixture(t);f.D.patchChannel('ch-1',{tap:'5'});f.C.clearHistory();
  await f.chain.commit(f.chain.begin('ch-1','gate'),'proc:after:pre');
  assert.deepEqual(copy(f.D.channel('ch-1').order),['eq','dyn','insert','gate']);assert.equal(f.D.channel('ch-1').tap,'5');
  assert.equal(f.C.historyState().undoCount,1);assert.equal((await f.C.undo()).ok,true);assert.equal(f.chain.snapshot('ch-1').proc,'GEDI');
  assert.equal((await f.C.redo()).ok,true);assert.equal(f.chain.snapshot('ch-1').proc,'EDIG');
  await f.chain.commit(f.chain.begin('ch-1','sends'),'tap:AFL');assert.equal(f.D.channel('ch-1').tap,'AFL');
  assert.equal((await f.C.undo()).ok,true);assert.equal(f.D.channel('ch-1').tap,'5');assert.equal(f.driver.writes.length,0);
});

test('eight semantic Send targets distinguish PFL and AFL at the same page boundary',async t=>{
  const f=await fixture(t),token=f.chain.begin('ch-1','sends'),targets=f.chain.targets(token);
  assert.deepEqual(targets.map(target=>target.value),TAPS);assert.ok(targets.every(target=>typeof target.value==='string'));
  assert.notEqual(targets.find(target=>target.value==='PFL').label,targets.find(target=>target.value==='AFL').label);
  const boundaries={IN:'home',FILT:'input','3':'gate','4':'eq','5':'dyn',PFL:'pre',AFL:'pre',POST:'post'};
  for(const tap of TAPS){
    await f.chain.commit(f.chain.begin('ch-1','sends'),'tap:'+tap);
    const s=f.chain.snapshot('ch-1');assert.equal(s.tap,tap);assert.equal(s.order[s.order.indexOf('sends')-1],boundaries[tap]);assert.equal(s.order.at(-1),'master');
  }
});

test('fixed pages, unsupported families and forged destinations cannot mutate audio',async t=>{
  const f=await fixture(t),before=copy(f.D.get().channels);
  for(const key of ['home','input','post','master'])assert.throws(()=>f.chain.begin('ch-1',key),/fissa|fader/);
  for(const id of ['aux-1','bus-1','main-1','mtx-1'])assert.throws(()=>f.chain.begin(id,'eq'),/Ordine fisso/);
  await assert.rejects(f.chain.commit({id:'ch-1',key:'gate'},'proc:after:pre'),/non preparato/);
  await assert.rejects(f.chain.commit(f.chain.begin('ch-1','gate'),'proc:after:master'),/Destinazione non valida/);
  await assert.rejects(f.chain.commit(f.chain.begin('ch-1','sends'),'tap:BUS'),/Destinazione non valida/);
  assert.deepEqual(copy(f.D.get().channels),before);assert.equal(f.C.historyState().undoCount,0);
});

test('runtime enum subsets and read-only metadata govern target availability',async t=>{
  const f=await fixture(t,{live:true});f.driver.meta.get('/ch/1/proc').items=[{value:'GEDI'},{value:'EGDI'}];
  f.driver.meta.get('/ch/1/ptap').items=[{value:'5'},{value:'PFL'}];await f.chain.prepare('ch-1');
  const token=f.chain.begin('ch-1','gate'),targets=f.chain.targets(token);
  assert.equal(targets.find(target=>target.id==='proc:after:eq').enabled,true);
  assert.equal(targets.find(target=>target.id==='proc:after:pre').enabled,false);
  await assert.rejects(f.chain.commit(token,'proc:after:pre'),/firmware/);
  assert.equal(f.chain.snapshot('ch-1').tapTargets.find(target=>target.value==='AFL').enabled,false);
  f.driver.meta.get('/ch/1/proc').readOnly=true;await f.chain.prepare('ch-1');
  assert.throws(()=>f.chain.begin('ch-1','gate'),/sola lettura/);assert.equal(f.driver.writes.length,0);
});

test('live move stays at the confirmed order while pending, writes once and retains Undo',async t=>{
  const f=await fixture(t,{live:true}),hold=deferred();f.driver.setHook=()=>hold.promise;
  const token=f.chain.begin('ch-1','gate'),work=f.chain.commit(token,'proc:after:pre');
  for(let count=0;count<20&&!f.driver.writes.length;count++)await pause();
  assert.equal(f.driver.writes.length,1);assert.equal(f.chain.snapshot('ch-1').proc,'GEDI');assert.equal(f.chain.snapshot('ch-1').busy,true);
  assert.throws(()=>f.chain.begin('ch-1','eq'),/Attendi/);await assert.rejects(f.chain.commit(token,'proc:after:eq'),/già stato/);
  hold.resolve();const result=await work;assert.equal(result.proc,'EDIG');assert.equal(result.busy,false);assert.equal(result.tap,'5');
  assert.deepEqual(f.driver.writes,[{path:'/ch/1/proc',value:'EDIG',options:{revision:1}}]);
  assert.equal(f.C.historyState().undoCount,1);f.driver.setHook=null;assert.equal((await f.C.undo()).ok,true);
  assert.equal(f.chain.snapshot('ch-1').proc,'GEDI');assert.equal(f.driver.writes.length,2);assert.equal(f.driver.writes[1].path,'/ch/1/proc');
});

test('a fresh console order or tap change cancels the prepared gesture before any write',async t=>{
  const f=await fixture(t,{live:true});
  for(const [path,value]of [['/ch/1/proc','EGDI'],['/ch/1/ptap','AFL']]){
    const token=f.chain.begin('ch-1','gate');f.driver.values.set(path,value);
    await assert.rejects(f.chain.commit(token,'proc:after:pre'),/cambiato durante il gesto/);
    assert.equal(f.driver.writes.length,0);assert.equal(f.environment.SculptLive.value(path),value);
  }
});

test('schema revision, enum and read-only changes during preflight never reach Desk.patchChannel',async t=>{
  const f=await fixture(t,{live:true});
  for(const mutate of [meta=>meta.revision++,meta=>{meta.items=meta.items.slice(0,-1);},meta=>{meta.readOnly=true;}]){
    const token=f.chain.begin('ch-1','gate');mutate(f.driver.meta.get('/ch/1/proc'));
    await assert.rejects(f.chain.commit(token,'proc:after:pre'),/schema WING è cambiato/);
    assert.equal(f.driver.writes.length,0);assert.equal(f.C.historyState().undoCount,0);
  }
});

test('a drag from a previous session or interrupted preflight cannot replay after reconnect',async t=>{
  const f=await fixture(t,{live:true}),old=f.chain.begin('ch-1','gate');
  await f.session.disconnect();await f.session.connect('192.0.2.10');
  await assert.rejects(f.chain.commit(old,'proc:after:pre'),/sessione WING è cambiata/);assert.equal(f.driver.writes.length,0);
  const hold=deferred(),token=f.chain.begin('ch-1','gate');f.driver.readHook=path=>path==='/ch/1/proc'?hold.promise:undefined;
  const work=f.chain.commit(token,'proc:after:pre');await pause();await f.session.disconnect();hold.resolve();
  await assert.rejects(work,/sessione WING è cambiata/);f.driver.readHook=null;await f.session.connect('192.0.2.10');await f.session.settled();
  assert.equal(f.driver.writes.length,0);assert.equal(f.chain.snapshot('ch-1').proc,'GEDI');
});

test('manual read-only state stops an already begun or awaiting move',async t=>{
  const f=await fixture(t,{live:true}),token=f.chain.begin('ch-1','sends');f.session.setWritable(false);
  await assert.rejects(f.chain.commit(token,'tap:AFL'),/Controllo non attivo/);assert.equal(f.driver.writes.length,0);
  f.session.setWritable(true);const hold=deferred();f.driver.readHook=()=>hold.promise;
  const work=f.chain.commit(f.chain.begin('ch-1','sends'),'tap:AFL');await pause();f.session.setWritable(false);hold.resolve();
  await assert.rejects(work,/Controllo non attivo/);assert.equal(f.driver.writes.length,0);
});

test('an omitted fresh value invalidates stale cached data instead of authorizing a move',async t=>{
  const f=await fixture(t,{live:true}),token=f.chain.begin('ch-1','gate');f.driver.omit.add('/ch/1/proc');
  await assert.rejects(f.chain.commit(token,'proc:after:pre'),/non ha restituito/);
  assert.equal(f.chain.snapshot('ch-1').orderKnown,false);assert.equal(f.chain.snapshot('ch-1').proc,null);
  assert.throws(()=>f.chain.begin('ch-1','gate'),/da leggere/);assert.equal(f.driver.writes.length,0);
  f.driver.omit.clear();await f.chain.prepare('ch-1');assert.equal(f.chain.snapshot('ch-1').ready,true);
});

test('failed writes and mismatched readbacks keep actual order without blind rollback',async t=>{
  const f=await fixture(t,{live:true});f.driver.rejectWrite=true;
  await assert.rejects(f.chain.commit(f.chain.begin('ch-1','gate'),'proc:after:pre'),/non ha confermato/);
  assert.equal(f.chain.snapshot('ch-1').proc,'GEDI');assert.deepEqual(copy(f.D.channel('ch-1').order),['gate','eq','dyn','insert']);
  assert.equal(f.driver.writes.length,1);assert.equal((await f.C.undo()).ok,false,'failed request cannot undo an unconfirmed state');
  f.driver.rejectWrite=false;f.driver.actualOverride='EGDI';
  await assert.rejects(f.chain.commit(f.chain.begin('ch-1','gate'),'proc:after:pre'),/ricevuto EGDI/);
  assert.equal(f.chain.snapshot('ch-1').proc,'EGDI');assert.equal(f.driver.writes.length,2,'no rollback or automatic retry');
});

test('no-op targets add no history, while consumed tokens cannot be reused',async t=>{
  const f=await fixture(t),token=f.chain.begin('ch-1','gate');
  const target=f.chain.targets(token).find(item=>item.current);assert.ok(target);await f.chain.commit(token,target.id);
  assert.equal(f.C.historyState().undoCount,0);await assert.rejects(f.chain.commit(token,'proc:after:pre'),/già stato/);
});

test('binding updates relevant state, deduplicates unrelated values and cleans up subscriptions',async t=>{
  const f=await fixture(t,{live:true}),seen=[],stop=f.chain.bind('ch-1',snapshot=>seen.push(snapshot));
  assert.equal(seen.length,1);assert.equal(f.updates.size,1);
  f.session.receive('/ch/2/fdr',-7);f.session.flush();f.session.notify();assert.equal(seen.length,1);
  f.session.receive('/ch/1/proc','EGDI');f.session.flush();assert.equal(seen.at(-1).proc,'EGDI');
  stop();assert.equal(f.updates.size,0);const count=seen.length;f.session.receive('/ch/1/proc','GEDI');f.session.flush();assert.equal(seen.length,count);
});

test('real application Controller, Desk, map and Session retain live proc and ptap Undo/Redo',async t=>{
  const f=await fixture(t,{live:true,application:true});
  await f.chain.commit(f.chain.begin('ch-1','eq'),'proc:before:gate');assert.equal(f.chain.snapshot('ch-1').proc,'EGDI');
  assert.equal(f.C.historyState().undoCount,1);assert.equal((await f.C.undo()).ok,true);assert.equal(f.chain.snapshot('ch-1').proc,'GEDI');
  assert.equal((await f.C.redo()).ok,true);assert.equal(f.chain.snapshot('ch-1').proc,'EGDI');
  await f.chain.commit(f.chain.begin('ch-1','sends'),'tap:AFL');assert.equal(f.chain.snapshot('ch-1').tap,'AFL');
  assert.equal((await f.C.undo()).ok,true);assert.equal(f.chain.snapshot('ch-1').tap,'5');
  assert.equal((await f.C.redo()).ok,true);assert.equal(f.chain.snapshot('ch-1').tap,'AFL');
  assert.deepEqual(f.driver.writes.map(write=>[write.path,write.value]),[
    ['/ch/1/proc','EGDI'],['/ch/1/proc','GEDI'],['/ch/1/proc','EGDI'],
    ['/ch/1/ptap','AFL'],['/ch/1/ptap','5'],['/ch/1/ptap','AFL']
  ]);
});
