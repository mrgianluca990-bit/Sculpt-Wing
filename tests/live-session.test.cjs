'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Session}=require('../dist/live-session.js');
const clone=v=>JSON.parse(JSON.stringify(v));
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
class Mixer {
  constructor(){this.data={'/ch/1':{'/ch/1/fdr':-9,'/ch/1/mute':0,'/ch/1/$name':'Voice'},'/ch/1/eq':{'/ch/1/eq/mdl':'STD','/ch/1/eq/gain':1}};this.revision=1;this.listeners={value:new Set(),status:new Set(),schema:new Set(),meters:new Set()};this.writes=[];this.reads=[];this.lists=[];this.closes=0;this.connections=[];}
  listener(kind,fn){this.listeners[kind].add(fn);return()=>this.listeners[kind].delete(fn);}
  onValue(fn){return this.listener('value',fn);}onStatus(fn){return this.listener('status',fn);}onSchemaChange(fn){return this.listener('schema',fn);}onStripMeters(fn){return this.listener('meters',fn);}
  emit(kind,...args){for(const fn of [...this.listeners[kind]])fn(...args);}
  async connect(host){this.connections.push(host);if(this.connectHook)await this.connectHook(host);return{name:'Test WING',model:'WING-RACK',firmware:'fixture',host};}
  async disconnect(){this.closes++;this.emit('status','disconnected');}
  async subscribeStripMeters(selection){this.selection=selection;if(this.meterError)throw this.meterError;}
  meta(path){return {path,name:path.split('/').at(-1),type:path.endsWith('/mdl')?5:path.endsWith('name')?7:path.endsWith('/mute')?4:1,min:path.endsWith('/mute')?0:-144,max:path.endsWith('/mute')?1:10,revision:this.revision,readOnly:path.endsWith('/$name'),...(path.endsWith('/mdl')?{items:[{value:'STD'},{value:'LA'}]}:{})};}
  async describe(path){if(this.describeHook)await this.describeHook(path);return this.data[path]?{path,type:0,revision:this.revision}:this.meta(path);}
  async list(path,{refresh=false}={}){this.lists.push(path);if(refresh)this.emit('schema',{path,revision:++this.revision});if(this.listError)throw this.listError;return Object.keys(this.data[path]||{}).map(p=>this.meta(p));}
  async readTree(path){const values=clone(this.data[path]||{[path]:await this.get(path)});if(this.readHook)await this.readHook(path,values);return values;}
  async get(path){this.reads.push(path);for(const values of Object.values(this.data))if(path in values)return values[path];throw new Error('Missing node '+path);}
  async set(path,value,options){this.writes.push({path,value,options});if(this.setHook)await this.setHook(path,value);if(path.endsWith('/mdl'))this.switchModel(value);else{const parent=path.slice(0,path.lastIndexOf('/'));this.data[parent]||={};this.data[parent][path]=value;this.emit('value',path,value);}}
  async trigger(path,value,options){return this.set(path,value,options);}
  switchModel(value){this.data['/ch/1/eq']=value==='LA'?{'/ch/1/eq/mdl':'LA','/ch/1/eq/peak':44}:{'/ch/1/eq/mdl':'STD','/ch/1/eq/gain':1};this.emit('schema',{path:'/ch/1/eq',model:value,revision:++this.revision});this.emit('value','/ch/1/eq/mdl',value);}
}
const map={
  stripPath:id=>'/'+id.replace('-','/'),readPaths:()=>[],processorSpec:()=>({basePath:'/ch/1/eq',modelPath:'/ch/1/eq/mdl',parameterPath:key=>'/ch/1/eq/'+key}),
  capture:s=>new Map([['/ch/1/fdr',s.values['ch-1'].level],['/ch/1/mute',+s.values['ch-1'].mute],['/ch/1/$name',s.values['ch-1'].name],['/ch/1/eq/mdl',s.desk.processing['ch-1'].eq.model],...Object.entries(s.desk.processing['ch-1'].eq.params).map(([k,v])=>['/ch/1/eq/'+k,v])]),
  descriptors:()=>[{path:'/ch/1/$name',readOnly:true},{path:'/ch/1/eq/mdl',processor:{type:'strip',id:'ch-1',block:'eq'}}],
  apply(s,path,value){const ch=s.values['ch-1'];if(path==='/ch/1/fdr')ch.level=value;else if(path==='/ch/1/mute')ch.mute=!!value;else if(path==='/ch/1/$name')ch.name=value;else if(path==='/ch/1/eq/mdl'){if(s.desk.processing['ch-1'].eq.model!==value){s.desk.processing['ch-1'].eq.model=value;s.desk.processing['ch-1'].eq.params={};}}else if(path.startsWith('/ch/1/eq/'))s.desk.processing['ch-1'].eq.params[path.split('/').at(-1)]=value;}
};
function fixture(customMap=map,initial){
  const driver=new Mixer();let state=initial||{values:{'ch-1':{id:'ch-1',level:-2,mute:false,name:'Demo'}},selected:'ch-1',sof:null,desk:{processing:{'ch-1':{eq:{model:'STD',params:{gain:0}}}},macros:[]}},errors=[];
  const session=new Session({driver,map:customMap,getState:()=>state,mutate:fn=>fn(state),onError:e=>errors.push(e)});
  return {driver,session,errors,get state(){return state;},set state(next){state=next;},edit(mutator){const before=clone(state),after=clone(state);mutator(after);const result=session.review(before,after,'test');if(result.ok)state=after;return result;},close(){session.dispose();}};
}
const ctx={type:'strip',id:'ch-1',block:'eq'};

test('connect enables control only after reading the mixer and never replays the local show',async()=>{
  const f=fixture(),held=deferred();f.driver.readHook=()=>held.promise;
  const connection=f.session.connect('192.168.1.100');await pause();
  assert.equal(f.session.mode,'syncing');assert.equal(f.session.writable,false);
  assert.equal(f.edit(s=>s.values['ch-1'].level=-1).ok,false);assert.equal(f.driver.writes.length,0);
  held.resolve();await connection;assert.equal(f.state.values['ch-1'].level,-9);assert.equal(f.driver.writes.length,0);assert.equal(f.session.writable,true);
  f.session.setWritable(false);
  assert.equal(f.edit(s=>s.values['ch-1'].level=-1).ok,false);assert.equal(f.session.pending.size,0);assert.equal(f.state.values['ch-1'].level,-9);
  assert.deepEqual(Object.keys(f.driver.selection),['ch','aux','bus','main','mtx']);f.close();
});

test('rapid fader edits coalesce and an older meter/control update does not replace an active gesture',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');f.session.setWritable(true);
  for(const value of [-8,-6,-4])assert.equal(f.edit(s=>s.values['ch-1'].level=value).ok,true);
  f.driver.emit('value','/ch/1/fdr',-8);f.session.flush();assert.equal(f.state.values['ch-1'].level,-4);
  await f.session.settled();assert.deepEqual(f.driver.writes.map(x=>[x.path,x.value]),[['/ch/1/fdr',-4]]);assert.equal(f.state.values['ch-1'].level,-4);f.close();
});

test('disconnection drops pending commands and late replies cannot attach to a reconnect',async()=>{
  const f=fixture(),gate=deferred();await f.session.connect('192.168.1.100');f.session.setWritable(true);
  f.driver.setHook=()=>gate.promise;f.edit(s=>s.values['ch-1'].level=-3);const work=f.session.settled();await pause();
  f.edit(s=>s.values['ch-1'].level=-2);await f.session.disconnect();gate.resolve();await work;
  assert.equal(f.session.values.size,0);assert.equal(f.session.pending.size,0);assert.equal(f.driver.writes.length,1);
  f.driver.setHook=null;await f.session.connect('192.168.1.100');assert.equal(f.session.writable,true);assert.equal(f.state.values['ch-1'].level,-3);await f.session.settled();assert.equal(f.driver.writes.length,1);f.close();
});

test('unexpected loss stays visible until one explicit reconnect has completed its fresh sync',async()=>{
  const f=fixture();await f.session.connect('192.168.1.77');
  f.edit(s=>s.values['ch-1'].level=-2);
  f.driver.emit('status','error','TCP interrotto fixture');
  assert.equal(f.session.writable,false);assert.equal(f.session.pending.size,0);
  assert.deepEqual({...f.session.snapshot().connectionLoss,at:0},{host:'192.168.1.77',reason:'TCP interrotto fixture',status:'error',at:0});
  await pause();assert.deepEqual(f.driver.connections,['192.168.1.77'],'loss never reconnects invisibly');
  const identity=deferred(),sync=deferred();f.driver.connectHook=()=>identity.promise;f.driver.readHook=()=>sync.promise;
  const reconnect=f.session.reconnect();await assert.rejects(f.session.reconnect(),/connessione corrente/);
  assert.equal(f.session.mode,'connecting');assert.equal(f.session.writable,false);assert.ok(f.session.snapshot().connectionLoss);
  identity.resolve();await pause();assert.equal(f.session.mode,'syncing');assert.equal(f.session.writable,false);assert.ok(f.session.snapshot().connectionLoss);
  sync.resolve();await reconnect;await f.session.settled();
  assert.equal(f.session.mode,'live');assert.equal(f.session.writable,true);assert.equal(f.session.snapshot().connectionLoss,null);
  assert.deepEqual(f.driver.connections,['192.168.1.77','192.168.1.77']);assert.equal(f.driver.writes.length,0,'the old queued gesture was not replayed');f.close();
});

test('failed reconnect keeps its cause and retry host; manual disconnect clears the notice',async()=>{
  const f=fixture();await f.session.connect('192.168.1.78');f.driver.emit('status','disconnected','Il banco ha chiuso TCP');
  f.driver.connectHook=()=>{throw new Error('Indirizzo non raggiungibile fixture');};
  await assert.rejects(f.session.reconnect(),/non raggiungibile/);
  assert.equal(f.session.mode,'error');assert.equal(f.session.writable,false);
  assert.match(f.session.snapshot().connectionLoss.reason,/non raggiungibile/);assert.equal(f.session.snapshot().connectionLoss.host,'192.168.1.78');
  await f.session.disconnect();assert.equal(f.session.snapshot().connectionLoss,null);
  f.driver.connectHook=null;await f.session.connect('192.168.1.78');await f.session.disconnect();
  assert.equal(f.session.snapshot().connectionLoss,null,'manual close must not appear as a lost connection');f.close();
});

test('high-level I/O reads only direct fields and leaves its large descendants unloaded',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');
  f.driver.data['/io']={'/io/altsw':1,'/io/autoaltovr':0};
  const list=f.driver.list.bind(f.driver);f.driver.list=path=>path==='/io'?Promise.resolve([f.driver.meta('/io/altsw'),f.driver.meta('/io/autoaltovr'),{path:'/io/in',type:0,revision:1}]):list(path);
  f.driver.readHook=path=>{assert.notEqual(path,'/io','must not request all I/O descendants');};
  await f.session.loadNode('/io');assert.equal(f.session.values.get('/io/altsw'),1);assert.equal(f.session.values.get('/io/autoaltovr'),0);
  assert.equal(f.session.metadata.get('/io/in').type,0);assert.equal(f.session.loaded.has('/io/in'),false);assert.equal(f.session.connected(),true);f.close();
});

test('definition APIs preserve the complete catalogue and flags without a broad data read',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');
  const definition={path:'/$ctl/lib/$scenes',name:'$scenes',type:5,flags:0x250,readOnly:true,revision:1,items:Array.from({length:120},(_,i)=>({value:String(i+1),label:'Scene '+(i+1)}))};
  const lists=[];f.driver.list=async(path,options)=>{lists.push([path,options]);return[definition];};
  f.driver.describe=async()=>definition;f.driver.readTree=()=>{throw new Error('No tree values required');};
  const listed=await f.session.listNode('/$ctl/lib',{refresh:true});
  assert.equal(listed[0].items.length,120);assert.equal(listed[0].flags,0x250);
  assert.deepEqual(lists,[['/$ctl/lib',{refresh:true}]]);assert.equal(f.session.values.has(definition.path),false);
  listed[0].items[0].label='Caller edit';assert.equal(f.session.metadata.get(definition.path).items[0].label,'Scene 1');
  assert.deepEqual(await f.session.describeNode(definition.path),definition);f.close();
});

test('definition reads finishing after a session change cannot populate the new session',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');const held=deferred();
  f.driver.list=async()=>{await held.promise;return[{path:'/old/value',type:4,revision:1}];};
  f.driver.describe=async()=>{await held.promise;return{path:'/old',type:0,revision:1};};
  const listing=f.session.listNode('/old'),describing=f.session.describeNode('/old');
  await f.session.disconnect();held.resolve();
  await assert.rejects(listing,/sessione WING è cambiata/);await assert.rejects(describing,/sessione WING è cambiata/);
  assert.equal(f.session.metadata.size,0);f.close();
});

test('fresh grouped values never fill an omitted leaf from cache and reject broad root reads',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');f.session.values.set('/ch/1/eq/missing',99);
  const read=f.driver.readTree.bind(f.driver),requests=[];f.driver.readTree=(path,options)=>{requests.push([path,options]);return read(path);};
  const values=await f.session.readValues('/ch/1/eq');
  assert.deepEqual(values,{'/ch/1/eq/mdl':'STD','/ch/1/eq/gain':1});assert.equal(values['/ch/1/eq/missing'],undefined);
  assert.deepEqual(requests,[['/ch/1/eq',{depth:0}]]);
  await f.session.readValues('/ch/1',{depth:8});assert.deepEqual(requests.at(-1),['/ch/1',{depth:8}]);
  for(const depth of [-1,9,1.5])await assert.rejects(f.session.readValues('/ch/1',{depth}),/Profondità/);
  assert.equal(requests.length,2,'invalid depths never reach the transport');
  for(const path of ['/','/io','/ch','/$ctl/lib'])await assert.rejects(f.session.readValues(path),/più piccolo/);
  const held=deferred();f.driver.readTree=async()=>{await held.promise;return{'/ch/1/eq/gain':88};};
  const loading=f.session.readValues('/ch/1/eq');await f.session.disconnect();held.resolve();
  await assert.rejects(loading,/sessione WING è cambiata/);assert.equal(f.session.values.size,0);f.close();
});

test('turning control off cancels a queued gesture and restores the confirmed value',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');f.session.setWritable(true);f.edit(s=>s.values['ch-1'].level=-2);
  f.session.setWritable(false);await f.session.settled();assert.equal(f.driver.writes.length,0);assert.equal(f.state.values['ch-1'].level,-9);f.close();
});

test('a rejected write rereads the console and rolls back the optimistic fader',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');f.session.setWritable(true);
  f.driver.setHook=async()=>{f.driver.data['/ch/1']['/ch/1/fdr']=-11;throw new Error('Remote lock');};
  f.edit(s=>s.values['ch-1'].level=-3);await f.session.settled();assert.equal(f.state.values['ch-1'].level,-11);assert.ok(f.driver.reads.includes('/ch/1/fdr'));assert.match(f.errors[0],/Remote lock/);assert.equal(f.session.snapshot().failureVersion,1);assert.match(f.session.snapshot().failure,/Remote lock/);await f.session.disconnect();assert.equal(f.session.snapshot().failureVersion,1);f.close();
});

test('a model change discards old queued parameter gestures and blocks new ones until schema loads',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');await f.session.ensureProcessor(ctx);f.session.setWritable(true);
  assert.equal(f.edit(s=>s.desk.processing['ch-1'].eq.params.gain=4).ok,true);
  assert.equal(f.edit(s=>{s.desk.processing['ch-1'].eq.model='LA';s.desk.processing['ch-1'].eq.params.gain=8;}).ok,true);
  assert.equal(f.edit(s=>s.desk.processing['ch-1'].eq.params.gain=6).ok,false);
  await f.session.settled();await pause();await f.session.ensureProcessor(ctx);
  assert.deepEqual(f.driver.writes.map(x=>x.path),['/ch/1/eq/mdl']);assert.equal(f.state.desk.processing['ch-1'].eq.model,'LA');assert.equal(f.state.desk.processing['ch-1'].eq.params.peak,44);assert.equal(f.state.desk.processing['ch-1'].eq.params.gain,undefined);f.close();
});

test('coalesced forced processor refreshes do not recursively refresh their own invalidation events',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');await f.session.ensureProcessor(ctx);const before=f.driver.lists.length;
  await Promise.all([f.session.ensureProcessor(ctx,{force:true}),f.session.ensureProcessor(ctx,{force:true})]);await pause();await pause();
  assert.equal(f.driver.lists.length-before,1);assert.deepEqual(f.session.processorState(ctx),{loading:false,ready:true,error:''});f.close();
});

test('an old schema read cannot hydrate controls after an external model change',async()=>{
  const f=fixture(),gate=deferred();await f.session.connect('192.168.1.100');let blocked=false;
  f.driver.readHook=async path=>{if(path==='/ch/1/eq'&&!blocked){blocked=true;await gate.promise;}};
  const loading=f.session.ensureProcessor(ctx);await pause();f.driver.switchModel('LA');gate.resolve();await loading;
  assert.equal(f.state.desk.processing['ch-1'].eq.model,'LA');assert.deepEqual(f.state.desk.processing['ch-1'].eq.params,{peak:44});assert.equal(f.session.metadata.has('/ch/1/eq/gain'),false);assert.equal(f.session.processorState(ctx).ready,true);f.close();
});

test('direct writes recheck control and session after asynchronous metadata lookup',async()=>{
  const f=fixture(),gate=deferred();await f.session.connect('192.168.1.100');f.session.setWritable(true);f.driver.describeHook=()=>gate.promise;
  const writing=f.session.write('/ch/1/fdr',-2);f.session.setWritable(false);gate.resolve();await assert.rejects(writing,/Controllo/);assert.equal(f.driver.writes.length,0);
  f.driver.describeHook=null;f.close();
});

test('a failed initial sync closes the transport and drops subsequent unbound values',async()=>{
  const f=fixture();f.driver.listError=new Error('Schema unavailable');await assert.rejects(f.session.connect('192.168.1.100'),/Schema unavailable/);
  assert.equal(f.driver.closes,1);assert.equal(f.session.mode,'error');f.driver.emit('value','/ch/1/fdr',7);f.session.flush();assert.equal(f.session.values.size,0);assert.equal(f.state.values['ch-1'].level,-2);f.close();
});

test('leaf nodes can be loaded and unsupported edits are rejected while libraries stay local',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');await f.session.loadNode('/ch/1/mute');assert.equal(f.session.metadata.has('/ch/1/mute'),true);
  assert.equal(f.edit(s=>s.desk.macros.push({name:'Local macro'})).ok,true);assert.equal(f.edit(s=>{s.desk._wing={values:{foo:1}};}).ok,true);
  assert.equal(f.edit(s=>{s.desk.unmapped=true;}).ok,false);f.close();
});

test('the real map writes a linked source name without sending the effective read-only name',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),M=require('../dist/model.js'),Cat=require('../dist/plugin-data.js'),realMap=require('../dist/wing-map.js');
  const state=M.defaults(),context={window:{SculptModel:M,SculptCatalog:Cat,SculptController:{getState:()=>state,listStrips:()=>M.list(state),getStrip:id=>M.find(state,id),transact:fn=>fn(state),subscribe:()=>()=>{}}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/desk.js'),'utf8'),context);
  const f=fixture(realMap,state);f.driver.data={};for(const strip of M.list(state))f.driver.data[realMap.stripPath(strip.id)]={[realMap.stripPath(strip.id)+'/fdr']:-12};
  for(let n=1;n<=16;n++)f.driver.data['/dca/'+n]={[`/dca/${n}/fdr`]:0,[`/dca/${n}/mute`]:0,[`/dca/${n}/$solo`]:0,[`/dca/${n}/name`]:`DCA ${n}`};
  Object.assign(f.driver.data['/ch/1'],{'/ch/1/clink':1,'/ch/1/name':'Unused local','/ch/1/$name':'Mic A'});
  f.driver.data['/io/in/LCL/1']={'/io/in/LCL/1/name':'Mic A'};
  await f.session.connect('192.168.1.100');await f.session.loadNode('/io/in/LCL/1');f.session.setWritable(true);
  assert.equal(f.edit(s=>s.inputs.find(x=>x.id==='ch-1').name='Mic B').ok,true);await f.session.settled();
  assert.deepEqual(f.driver.writes.map(x=>x.path),['/io/in/LCL/1/name']);f.close();
});


test('a mixed mapped/unmapped action is rejected atomically before any wire command',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');f.session.setWritable(true);
  const result=f.edit(s=>{s.values['ch-1'].level=-2;s.desk.unsupportedRoute='BUS2';});
  assert.equal(result.ok,false);assert.equal(f.state.values['ch-1'].level,-9);await f.session.settled();assert.equal(f.driver.writes.length,0);f.close();
});

test('numeric firmware enum candidates preserve their actual wire type',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');await f.session.ensureProcessor(ctx);f.session.setWritable(true);
  f.session.metadata.set('/ch/1/eq/gain',{path:'/ch/1/eq/gain',type:6,items:[{value:1},{value:2},{value:4}],revision:1});
  assert.equal(f.edit(s=>s.desk.processing['ch-1'].eq.params.gain='4').ok,true);await f.session.settled();
  assert.equal(f.driver.writes.at(-1).value,4);assert.equal(typeof f.driver.writes.at(-1).value,'number');f.close();
});

function meterFrame(gateGainRaw=128,dynGainRaw=64,receivedAt=Date.now()){
  return {receivedAt,reportId:7,strips:{ch:{1:{input:[-12,-18],output:[-24,-30],gateKey:-20,dynKey:-22,gateGainRaw,dynGainRaw}},aux:{},bus:{},main:{},mtx:{}}};
}

test('GR bars use genuine normalized gain words, independent of input/output level and unread demo processors',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');
  f.state.desk.processing['ch-1'].gate={model:'GATE',enabled:true};
  f.driver.emit('meters',meterFrame());
  assert.deepEqual(f.session.gainReduction('ch-1'),{gate:{fraction:.5,raw:128,db:null,enabled:null},comp:{fraction:.25,raw:64,db:null,enabled:null}});
  assert.equal(f.session.meter('ch-1','input').left,-12);assert.equal(f.session.meter('ch-1','output').left,-24);
  assert.equal(f.session.gainReduction('dca-1'),null);assert.equal(f.session.gainReduction('ch-40'),null);
  f.driver.emit('meters',meterFrame(0,256));assert.equal(f.session.gainReduction('ch-1').gate.fraction,0);assert.equal(f.session.gainReduction('ch-1').comp.fraction,1);
  f.driver.emit('meters',meterFrame(-128,512));assert.equal(f.session.gainReduction('ch-1').gate.fraction,0);assert.equal(f.session.gainReduction('ch-1').comp.fraction,1);
  f.driver.emit('meters',meterFrame(undefined,NaN));assert.equal(f.session.gainReduction('ch-1').comp,null);
  f.driver.emit('meters',meterFrame('128',32768));assert.deepEqual(f.session.gainReduction('ch-1'),{gate:null,comp:null});f.close();
});

test('GR exposes dB only for a documented model actually read from WING and honors confirmed bypass',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');f.driver.emit('meters',meterFrame());
  f.driver.emit('value','/ch/1/gate/mdl','GATE');f.driver.emit('value','/ch/1/gate/on',1);
  assert.deepEqual(f.session.gainReduction('ch-1').gate,{fraction:.5,raw:128,db:30,enabled:true});
  f.driver.emit('value','/ch/1/gate/on',0);f.driver.emit('value','/ch/1/dyn/on',0);
  assert.deepEqual(f.session.gainReduction('ch-1').gate,{fraction:0,raw:128,db:0,enabled:false});assert.equal(f.session.gainReduction('ch-1').comp.fraction,0);
  f.driver.emit('value','/ch/1/dyn/mdl','COMP');f.driver.emit('value','/ch/1/dyn/on',1);
  assert.equal(f.session.gainReduction('ch-1').comp.db,null);assert.equal(f.session.gainReduction('ch-1').comp.fraction,.25);f.close();
});

test('GR and stereo meters disappear together on stale frames, disconnection, or invalid timestamps',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');
  for(const receivedAt of [Date.now()-1201,NaN,undefined,Date.now()+60000]){
    const frame=meterFrame();frame.receivedAt=receivedAt;f.driver.emit('meters',frame);
    assert.equal(f.session.gainReduction('ch-1'),null);assert.equal(f.session.meter('ch-1'),null);
  }
  f.driver.emit('meters',meterFrame());assert.ok(f.session.gainReduction('ch-1'));
  await f.session.disconnect();f.driver.emit('meters',meterFrame());assert.equal(f.session.gainReduction('ch-1'),null);assert.equal(f.session.meter('ch-1'),null);
  await f.session.connect('192.168.1.100');assert.equal(f.session.gainReduction('ch-1'),null);f.close();
});

test('processor changes retire old GR frames without losing the unaffected block or stereo levels',async()=>{
  const f=fixture();await f.session.connect('192.168.1.100');f.driver.emit('value','/ch/1/gate/mdl','GATE');f.driver.emit('meters',meterFrame());
  assert.equal(f.session.gainReduction('ch-1').gate.db,30);
  f.driver.emit('schema',{path:'/ch/1/gate',model:'DUCK',revision:2});
  assert.equal(f.session.gainReduction('ch-1').gate,null);assert.equal(f.session.gainReduction('ch-1').comp.fraction,.25);assert.equal(f.session.meter('ch-1','input').left,-12);
  f.driver.emit('value','/ch/1/gate/mdl','DUCK');await new Promise(resolve=>setTimeout(resolve,2));f.driver.emit('meters',meterFrame(64,32));
  assert.deepEqual(f.session.gainReduction('ch-1').gate,{fraction:.25,raw:64,db:null,enabled:null});
  f.driver.emit('value','/ch/1/gate/mdl','GATE');assert.equal(f.session.gainReduction('ch-1').gate,null);
  await new Promise(resolve=>setTimeout(resolve,2));f.driver.emit('meters',meterFrame(256,0));assert.equal(f.session.gainReduction('ch-1').gate.db,60);f.close();
});
