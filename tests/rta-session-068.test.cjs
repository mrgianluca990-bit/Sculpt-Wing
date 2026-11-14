'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Session}=require('../dist/live-session.js');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};

class RtaWing {
  constructor({labels=false}={}){
    this.labels=labels;
    this.listeners={value:new Set(),status:new Set(),meters:new Set(),rta:new Set()};this.writes=[];this.requests=[];this.report=100;this.rtaEnabled=false;
    this.values=new Map([['/ch/1/fdr',-12],['/cfg/rta/$src',1],['/cfg/rta/$tap','IN'],['/cfg/rta/rtasrc',20],['/cfg/rta/rtatap','IN']]);
    this.definitions=new Map([
      ['/ch/1/fdr',{type:3,readOnly:false}],
      ['/cfg/rta/$src',labels?{type:6,readOnly:true,items:[{value:1,label:'CH.1'},{value:5,label:'BUS.9'}]}:{type:4,readOnly:true,min:1,max:76}],
      ['/cfg/rta/$tap',{type:5,readOnly:true,items:['IN','PREEQ','POSTEQ'].map(value=>({value,label:value}))}],
      ['/cfg/rta/rtasrc',labels?{type:6,readOnly:false,items:[{value:20,label:'CH.1'},{value:75,label:'BUS.9'}]}:{type:4,readOnly:false,min:0,max:76}],
      ['/cfg/rta/rtatap',{type:5,readOnly:false,items:['IN','PREEQ','POSTEQ'].map(value=>({value,label:value}))}],
    ]);
  }
  listen(kind,fn){this.listeners[kind].add(fn);return()=>this.listeners[kind].delete(fn);}
  onValue(fn){return this.listen('value',fn);}onStatus(fn){return this.listen('status',fn);}onStripMeters(fn){return this.listen('meters',fn);}onRta(fn){return this.listen('rta',fn);}
  emit(kind,...args){for(const fn of this.listeners[kind])fn(...args);}
  async connect(){return {name:'RTA fixture',model:'WING',firmware:'fixture'};}async disconnect(){this.emit('status','disconnected');}async subscribeStripMeters(){}
  async describe(path){return this.definitions.has(path)?{path,revision:1,...this.definitions.get(path)}:{path,revision:1,type:0,readOnly:false};}
  async list(path){return Promise.all([...this.definitions.keys()].filter(p=>p.startsWith(path+'/')).map(p=>this.describe(p)));}
  async readTree(path){if(this.readHook)await this.readHook(path);return Object.fromEntries([...this.values].filter(([p])=>p.startsWith(path+'/')));}
  async get(path){return this.values.get(path);}
  async set(path,value){this.writes.push({path,value});this.change(path,value);if(path==='/cfg/rta/rtasrc')this.change('/cfg/rta/$src',this.labels?(value===75?5:1):value);if(path==='/cfg/rta/rtatap')this.change('/cfg/rta/$tap',value);}
  async subscribeRta(enabled){this.requests.push(enabled);if(enabled||this.rtaEnabled)this.report++;this.rtaEnabled=enabled;return this.report;}
  change(path,value){this.values.set(path,value);this.emit('value',path,value);}
  frame(report=this.report,extra={}){const frame={reportId:report,receivedAt:Date.now(),binsRaw:Array.from({length:120},(_,i)=>-20000+i*20),...extra};this.emit('rta',frame);return frame;}
}
async function fixture(t,options){
  const driver=new RtaWing(options),state={values:{'ch-1':{id:'ch-1',level:-90}}};let mutations=0;
  const session=new Session({driver,map:{stripPath:()=>'/ch/1',apply:(s,p,v)=>{if(p==='/ch/1/fdr')s.values['ch-1'].level=v;}},getState:()=>state,mutate:fn=>{mutations++;fn(state);}});
  t.after(()=>session.dispose());await session.connect('192.168.1.100');
  return {driver,session,get mutations(){return mutations;}};
}

test('global RTA reads the actual standard source without writing console settings',async t=>{
  const f=await fixture(t),baseline=f.mutations;await f.session.setRtaRequest({followConsole:true});f.driver.frame();
  const state=f.session.rtaSnapshot();assert.equal(state.status,'live');assert.equal(state.sourceIndex,1);assert.equal(state.sourceId,'ch-1');assert.equal(state.mappingVerified,true);assert.equal(state.sourceLabel,'CH 1');assert.equal(state.tap,'IN');assert.equal(state.binsRaw.length,120);assert.equal(state.scale,'relative');assert.equal(f.driver.writes.length,0);assert.equal(f.mutations,baseline);
});

test('standard integer metadata automatically selects all five strip families and their boundaries',async t=>{
  const f=await fixture(t);
  for(const [id,value]of [['ch-1',1],['ch-40',40],['aux-1',41],['aux-8',48],['bus-1',49],['bus-16',64],['main-1',65],['main-4',68],['mtx-1',69],['mtx-8',76]]){
    await f.session.setRtaRequest({id,tap:'PREEQ'});
    assert.equal(f.session.rtaSnapshot().binsRaw,null,'new sources wait for a fresh report');f.driver.frame();
    const state=f.session.rtaSnapshot();assert.equal(state.status,'live');assert.equal(state.sourceId,id);assert.equal(state.sourceIndex,value);assert.equal(state.mappingVerified,true);assert.equal(state.sources.length,76);
    assert.equal(f.driver.writes.filter(w=>w.path==='/cfg/rta/rtasrc').at(-1).value,value);
  }
});

test('unrecognised numeric domains remain unmapped and readonly mode never claims a different source',async t=>{
  const f=await fixture(t);f.driver.definitions.get('/cfg/rta/$src').max=75;
  await f.session.setRtaRequest({id:'ch-2',tap:'PREEQ'});f.driver.frame();
  assert.equal(f.session.rtaSnapshot().status,'unmapped');assert.equal(f.session.rtaSnapshot().binsRaw,null);assert.equal(f.driver.writes.length,0);
  f.driver.definitions.get('/cfg/rta/$src').max=76;f.session.metadata.clear();f.session.loaded.clear();f.session.setWritable(false);
  await f.session.setRtaRequest({id:'ch-2',tap:'PREEQ'});assert.equal(f.session.rtaSnapshot().status,'readonly');assert.equal(f.driver.writes.length,0);
  f.driver.change('/cfg/rta/$src',2);f.driver.change('/cfg/rta/$tap','PREEQ');await f.session.refreshRta(f.session.rtaGeneration,f.session.epoch);f.driver.frame();
  assert.equal(f.session.rtaSnapshot().status,'live');assert.equal(f.session.rtaSnapshot().sourceId,'ch-2');assert.equal(f.driver.writes.length,0);
});

test('explicit firmware enum labels take precedence over the standard numeric source domains',async t=>{
  // Deliberately nonsequential and different GET/SET values: no offset or
  // equality between the two numeric source domains can make this test pass.
  const f=await fixture(t,{labels:true});f.session.setWritable(true);await f.session.setRtaRequest({id:'bus-9',tap:'POSTEQ'});f.driver.frame();
  assert.deepEqual(f.driver.writes,[{path:'/cfg/rta/rtasrc',value:75},{path:'/cfg/rta/rtatap',value:'POSTEQ'}]);
  const state=f.session.rtaSnapshot();assert.equal(state.status,'live');assert.equal(state.sourceId,'bus-9');assert.equal(state.sourceIndex,5);assert.equal(state.mappingVerified,true);assert.equal(state.tap,'POSTEQ');
});

test('source changes invalidate the old RTA immediately and rotate the report before accepting new data',async t=>{
  const f=await fixture(t);await f.session.setRtaRequest({followConsole:true});const first=f.driver.report;f.driver.frame(first);assert.equal(f.session.rtaSnapshot().status,'live');
  f.driver.change('/cfg/rta/$src',32);assert.equal(f.session.rtaSnapshot().binsRaw,null);f.driver.frame(first);assert.equal(f.session.rtaSnapshot().binsRaw,null);
  await f.session.refreshRta(f.session.rtaGeneration,f.session.epoch);const second=f.driver.report;assert.notEqual(second,first);
  f.driver.frame(first);assert.equal(f.session.rtaSnapshot().binsRaw,null);f.driver.frame(second);assert.equal(f.session.rtaSnapshot().status,'live');assert.equal(f.session.rtaSnapshot().sourceLabel,'CH 32');
  f.session.rtaFrame={...f.session.rtaFrame,receivedAt:Date.now()-1300};assert.equal(f.session.rtaSnapshot().status,'stale');assert.equal(f.session.rtaSnapshot().binsRaw,null);
});

test('closing, suspension and a late source read cannot start or repopulate an obsolete RTA subscription',async t=>{
  const f=await fixture(t),gate=defer(),started=defer();f.driver.readHook=async path=>{if(path==='/cfg/rta'){started.resolve();await gate.promise;}};
  const loading=f.session.setRtaRequest({followConsole:true});await started.promise;
  await f.session.setRtaRequest(null);gate.resolve();await loading;assert.equal(f.driver.requests.filter(Boolean).length,0);assert.equal(f.session.rtaRequest,null);
  f.driver.readHook=null;await f.session.setRtaRequest({followConsole:true});const old=f.driver.report;f.driver.frame();assert.equal(f.session.rtaSnapshot().status,'live');
  f.driver.emit('status','suspended');f.driver.frame(old);assert.equal(f.session.rtaSnapshot().status,'disconnected');assert.equal(f.session.rtaSnapshot().binsRaw,null);assert.equal(f.session.rtaTimer,null);
});

test('all source/tap schema checks precede writes, and malformed/future frames remain invisible',async t=>{
  const f=await fixture(t,{labels:true});f.session.setWritable(true);f.driver.definitions.get('/cfg/rta/rtatap').items=[{value:'IN',label:'IN'}];
  await f.session.setRtaRequest({id:'bus-9',tap:'POSTEQ'});assert.equal(f.driver.writes.length,0);assert.equal(f.session.rtaSnapshot().status,'unavailable');
  await f.session.setRtaRequest({followConsole:true});f.driver.frame(f.driver.report,{binsRaw:[1,2]});assert.equal(f.session.rtaSnapshot().binsRaw,null);
  f.driver.frame(f.driver.report,{receivedAt:Date.now()+5000});assert.equal(f.session.rtaSnapshot().binsRaw,null);
  f.driver.frame();assert.equal(f.session.rtaSnapshot().status,'live');await f.session.setRtaRequest(null);f.driver.frame();assert.equal(f.session.rtaSnapshot().status,'inactive');assert.equal(f.session.rtaSnapshot().binsRaw,null);
});

test('FX and monitor tap indices are never labelled as a strip and schema changes retire old frames',async t=>{
  const f=await fixture(t,{labels:true});f.driver.values.set('/cfg/rta/$tap','FXIN');await f.session.setRtaRequest({followConsole:true});f.driver.frame();
  assert.equal(f.session.rtaSnapshot().status,'live');assert.equal(f.session.rtaSnapshot().sourceId,null);assert.equal(f.session.rtaSnapshot().sourceLabel,'Sorgente WING #1');assert.equal(f.session.rtaSnapshot().tap,'FXIN');
  const old=f.driver.report;f.session.schemaChanged({path:'/cfg/rta',revision:2});assert.equal(f.session.rtaSnapshot().binsRaw,null);f.driver.frame(old);assert.equal(f.session.rtaSnapshot().binsRaw,null);
  await f.session.refreshRta(f.session.rtaGeneration,f.session.epoch);assert.notEqual(f.driver.report,old);f.driver.frame();assert.equal(f.session.rtaSnapshot().status,'live');assert.equal(f.session.rtaSnapshot().sourceId,null);
});
