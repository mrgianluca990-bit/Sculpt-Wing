'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const M=require('../dist/model.js'),K=require('../dist/plugin-data.js'),MapAPI=require('../dist/wing-map.js');
const {Session}=require('../dist/live-session.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const CASES=[
  {id:'ch-1',base:'/ch/1/in/set',modeLeaf:'dlymode',mode:'SMP',type:4,unit:0,min:0,max:96000,initial:4800,next:48000},
  {id:'aux-1',base:'/aux/1/in/set',modeLeaf:'dlymode',mode:'M',type:1,unit:5,min:0,max:171.5,initial:10,next:34.3},
  {id:'bus-1',base:'/bus/1/dly',modeLeaf:'mode',mode:'FT',type:1,unit:0,min:0,max:562.65,initial:20,next:112.53},
  {id:'main-1',base:'/main/1/dly',modeLeaf:'mode',mode:'MS',type:1,unit:3,min:0,max:500,initial:25,next:100},
  {id:'mtx-1',base:'/mtx/1/dly',modeLeaf:'mode',mode:'SMP',type:4,unit:0,min:0,max:96000,initial:2400,next:19200}
];

function fixture(t,{online=true}={}){
  let state=M.defaults(),session,environment;const writes=[],metadata=new Map(),wire=new Map(),listeners=new Set();
  const handlers={value:new Set(),status:new Set(),schema:new Set(),meters:new Set()};
  const emit=(kind,...args)=>{for(const listener of handlers[kind])listener(...args);};
  const subscribe=(kind,listener)=>{handlers[kind].add(listener);return()=>handlers[kind].delete(listener);};
  const driver={
    onValue:listener=>subscribe('value',listener),onStatus:listener=>subscribe('status',listener),
    onSchemaChange:listener=>subscribe('schema',listener),onStripMeters:listener=>subscribe('meters',listener),
    async describe(path){const definition=metadata.get(path);if(!definition)throw new Error('No fixture metadata '+path);return copy(definition);},
    async readTree(path){return wire.has(path)?{[path]:wire.get(path)}:Object.fromEntries([...wire].filter(([leaf])=>leaf.startsWith(path+'/')));},
    async get(path){return wire.get(path);},
    async set(path,value,options){writes.push({path,value,options});const actual=driver.quantize?driver.quantize(path,value):value;wire.set(path,actual);emit('value',path,actual);},
    async disconnect(){emit('status','disconnected');}
  };
  const C={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    transact(mutator,type='console',options={}){
      const before=session?.active()&&!session.applying?copy(state):null;
      mutator(state);
      if(before&&!session.review(before,state,type,options.id).ok){state=before;return false;}
      for(const listener of listeners)listener({type,id:options.id});return true;
    },capture:()=>copy(M.serialize(state)),toast(){}};
  environment={SculptController:C,SculptModel:M,SculptCatalog:K,SculptWingMap:MapAPI};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/desk.js'),'utf8'),{window:environment,console});
  const D=environment.SculptDesk;
  session=new Session({driver,map:MapAPI,getState:C.getState,mutate:(fn,type)=>C.transact(fn,type,{record:false})});
  environment.SculptLive={isLive:()=>session.active(),isConnected:()=>session.connected(),isWritable:()=>session.writable,
    metadata:path=>session.metadata.get(path),hasValue:path=>session.values.has(path),value:path=>session.values.get(path)};
  if(online){
    session.mode='live';session.epoch=1;session.writable=true;
    for(const item of CASES){
      const path=item.base+'/dly',modePath=item.base+'/'+item.modeLeaf,onPath=item.base+(item.modeLeaf==='dlymode'?'/dlyon':'/on');
      for(const [leaf,value,extra]of [
        [path,item.initial,{type:item.type,unit:item.unit,min:item.min,max:item.max}],
        [modePath,item.mode,{type:5,items:['MS','M','FT','SMP'].map(value=>({value}))}],
        [onPath,0,{type:4,min:0,max:1}]
      ]){
        const meta={path:leaf,revision:7,readOnly:false,...extra};metadata.set(leaf,meta);wire.set(leaf,value);session.metadata.set(leaf,copy(meta));session.receive(leaf,value);
      }
    }
    session.flush();
  }
  t.after(()=>session.dispose());
  return {C,D,session,environment,driver,writes,metadata,wire};
}

test('offline delay remains stored in milliseconds with the existing 0…3000 clamp',t=>{
  const f=fixture(t,{online:false});
  assert.equal(f.D.patchChannel('ch-1',{delay:48000}),true);assert.equal(f.D.channel('ch-1').delay,3000);
  assert.equal(f.D.patchChannel('ch-1',{delay:-1}),true);assert.equal(f.D.channel('ch-1').delay,0);
  f.D.patchChannel('ch-1',{delayUnit:'M',delay:100});assert.equal(f.D.channel('ch-1').delay,100);assert.equal(f.D.channel('ch-1').delayUnit,'M');
  f.D.patchChannel('ch-1',{delayUnit:'SMP'});assert.equal(f.D.channel('ch-1').delay,100,'offline unit label does not convert the stored milliseconds');
  assert.equal(f.writes.length,0);
});

test('live raw samples above 3000 round-trip without truncation on input and output paths',async t=>{
  const f=fixture(t);
  for(const item of CASES.filter(item=>item.mode==='SMP')){
    assert.equal(f.D.patchChannel(item.id,{delay:item.next}),true);
    await f.session.settled();const received=await f.session.readValues(item.base+'/dly');
    assert.equal(received[item.base+'/dly'],item.next);assert.equal(f.D.channel(item.id).delay,item.next);
    assert.equal(f.D.channel(item.id).delayUnit,'SMP');assert.equal(MapAPI.capture(f.C.getState()).get(item.base+'/dly'),item.next);
  }
  assert.deepEqual(f.writes.map(write=>[write.path,write.value,write.options.revision]),[
    ['/ch/1/in/set/dly',48000,7],['/mtx/1/dly/dly',19200,7]
  ]);
});

test('metres, feet and milliseconds stay in native wire units for all supported strip families',async t=>{
  const f=fixture(t);
  for(const item of CASES.filter(item=>item.mode!=='SMP')){
    assert.equal(f.D.patchChannel(item.id,{delay:item.next}),true);await f.session.settled();
    assert.equal(f.wire.get(item.base+'/dly'),item.next);assert.equal(f.D.channel(item.id).delay,item.next);
    assert.equal(f.D.channel(item.id).delayUnit,item.mode);
  }
  assert.deepEqual(f.writes.map(write=>[write.path,write.value]),[
    ['/aux/1/in/set/dly',34.3],['/bus/1/dly/dly',112.53],['/main/1/dly/dly',100]
  ]);
});

test('invalid or unconfirmed numeric metadata rejects the entire patch before local mutation',t=>{
  const f=fixture(t),path='/ch/1/in/set/dly',original=copy(f.session.metadata.get(path)),before=copy(f.D.channel('ch-1'));
  const cases=[null,{...original,path:'/bus/1/dly/dly'},{...original,readOnly:true},{...original,type:0},
    {...original,type:3},{...original,type:5,items:[{value:'SMP'}]},{...original,revision:undefined},
    {...original,min:undefined},{...original,max:undefined},{...original,min:Infinity},{...original,max:NaN},
    {...original,min:100,max:0}];
  for(const meta of cases){
    if(meta)f.session.metadata.set(path,meta);else f.session.metadata.delete(path);
    assert.equal(f.D.patchChannel('ch-1',{delay:9600,delayOn:true}),false,JSON.stringify(meta));
    assert.deepEqual(copy(f.D.channel('ch-1')),before);
  }
  f.session.metadata.set(path,original);f.session.values.delete(path);
  assert.equal(f.D.patchChannel('ch-1',{delay:9600}),false);assert.equal(f.writes.length,0);assert.equal(f.session.pending.size,0);
});

test('out-of-range, fractional integer and nonnumeric values are rejected instead of coerced or clamped',t=>{
  const f=fixture(t),before=copy(f.D.channel('ch-1'));
  for(const value of [-1,96001,4800.5,2147483648,NaN,Infinity,-Infinity,1e100,'48000',null,{},Symbol('samples')]){
    assert.equal(f.D.patchChannel('ch-1',{delay:value,delayOn:true}),false,String(value));
    assert.deepEqual(copy(f.D.channel('ch-1')),before);
  }
  assert.equal(f.writes.length,0);assert.equal(f.session.pending.size,0);
});

test('live float bounds are used as supplied and float32 readback becomes the authoritative value',async t=>{
  const f=fixture(t),path='/aux/1/in/set/dly';
  assert.equal(f.D.patchChannel('aux-1',{delay:171.6}),false,'must reject metres above the actual 171.5 bound');
  f.driver.quantize=(leaf,value)=>leaf===path?Math.fround(value):value;
  assert.equal(f.D.patchChannel('aux-1',{delay:34.3}),true);await f.session.settled();
  assert.equal(f.writes[0].value,34.3);assert.equal(f.D.channel('aux-1').delay,Math.fround(34.3));
  assert.equal((await f.session.readValues(path))[path],Math.fround(34.3));
  const meta=f.session.metadata.get(path);meta.max=1e100;
  assert.equal(f.D.patchChannel('aux-1',{delay:1e40}),false,'cannot transmit an infinite float32');
});

test('a mode change must be a separate live transaction before validating a new delay number',async t=>{
  const f=fixture(t),before=copy(f.D.channel('ch-1'));
  assert.equal(f.D.patchChannel('ch-1',{delayUnit:'M',delay:100}),false);assert.deepEqual(copy(f.D.channel('ch-1')),before);
  assert.equal(f.D.patchChannel('ch-1',{delayUnit:'M'}),true);await f.session.settled();
  assert.deepEqual(f.writes.map(write=>[write.path,write.value]),[['/ch/1/in/set/dlymode','M']]);
  assert.equal(f.D.channel('ch-1').delay,before.delay,'the mode-only patch does not invent a converted numeric write');
});

test('Controller and Session still reject read-only or disconnected edits and patchChannel returns that rejection',t=>{
  const f=fixture(t),before=copy(f.D.channel('ch-1'));
  f.session.setWritable(false);
  assert.equal(f.D.patchChannel('ch-1',{delay:9600}),false);assert.deepEqual(copy(f.D.channel('ch-1')),before);
  assert.equal(f.D.patchChannel('ch-1',{delayUnit:'M'}),false,'mode-only writes retain the normal Session gate');
  f.session.writable=true;f.session.mode='disconnected';
  assert.equal(f.D.patchChannel('ch-1',{delay:9600}),false,'even retained metadata cannot authorize a disconnected write');
  assert.deepEqual(copy(f.D.channel('ch-1')),before);assert.equal(f.session.pending.size,0);assert.equal(f.writes.length,0);
});

test('a schema invalidation drops the cached delay so no number is accepted until the new definition and value arrive',async t=>{
  const f=fixture(t),base='/ch/1/in/set',path=base+'/dly';
  f.session.schemaChanged({path:base,revision:8});assert.equal(f.D.patchChannel('ch-1',{delay:9600}),false);
  const meta={path,type:1,min:0,max:171.5,unit:5,revision:8,readOnly:false};
  f.session.metadata.set(path,meta);assert.equal(f.D.patchChannel('ch-1',{delay:34.3}),false,'a definition alone is not a confirmed value');
  f.metadata.set(path,meta);f.wire.set(path,10);await f.session.readValues(path);
  assert.equal(f.D.patchChannel('ch-1',{delay:34.3}),true);await f.session.settled();assert.equal(f.writes.at(-1).value,34.3);
});
