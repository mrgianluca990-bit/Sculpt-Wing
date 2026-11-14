'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../dist/local-scenes.js');

const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
  const definitions=new Map(),bank=new Map(),cache=new Map(),metadata=new Map(),omitted=new Set(),reads=[],writes=[],lists=[];
  let epoch=1,connected=true,writable=true,readHook=null,writeHook=null,sequence=1;
  function put(path,value,schema={type:1,min:-100,max:100}){
    for(let parent=path.slice(0,path.lastIndexOf('/'));parent;parent=parent.slice(0,parent.lastIndexOf('/')))if(!definitions.has(parent))definitions.set(parent,{path:parent,name:parent.split('/').at(-1),type:0,readOnly:true,unit:0,revision:0,id:sequence++});
    const definition={path,name:path.split('/').at(-1),unit:0,revision:0,readOnly:false,id:sequence++,...schema};
    definitions.set(path,definition);if(value!==undefined)bank.set(path,value);return definition;
  }
  const live={
    isLive:()=>true,isConnected:()=>connected,isWritable:()=>writable,sessionToken:()=>epoch,
    snapshot:()=>({info:{name:'WING reale fixture',model:'ngc-rack',firmware:'3.1.2',host:'192.168.1.12'}}),
    value:path=>cache.get(path),hasValue:path=>cache.has(path),metadata:path=>metadata.get(path),settled:async()=>{},
    async describeNode(path){const meta=definitions.get(path);if(!meta)throw new Error('Nodo non disponibile '+path);metadata.set(path,copy(meta));return copy(meta);},
    async listNode(path,options={}){
      lists.push([path,options]);if(!definitions.has(path))throw new Error('Nodo assente '+path);
      if(options.refresh)for(const [key,meta]of definitions)if(key===path||key.startsWith(path+'/')){meta.revision++;metadata.delete(key);}
      const children=[...definitions.values()].filter(meta=>meta.path.startsWith(path+'/')&&!meta.path.slice(path.length+1).includes('/'));
      for(const meta of children)metadata.set(meta.path,copy(meta));return children.map(copy);
    },
    async readValues(path,options={}){
      reads.push([path,options.depth??0]);await readHook?.(path,options);
      const result={};for(const [key,value]of bank){const suffix=key.startsWith(path+'/')?key.slice(path.length+1):null;if(key===path||suffix!==null&&suffix.split('/').length<=(options.depth??0)+1){if(omitted.has(key))continue;result[key]=value;cache.set(key,value);}}
      return result;
    },
    async write(path,value,options){
      assert.equal(options.expectedSchema.path,path);assert.equal(options.expectedSchema.revision,definitions.get(path).revision);
      writes.push([path,value]);bank.set(path,value);cache.set(path,value);await writeHook?.(path,value);
    },
  };
  put('/ch/1/name','Microfono letto',{type:7,maxLength:16});put('/ch/1/fdr',-8,{type:3});put('/ch/1/mute',1,{type:4,min:0,max:1});
  return {live,put,bank,cache,metadata,definitions,omitted,reads,writes,lists,
    read:fn=>{readHook=fn;},write:fn=>{writeHook=fn;},replace:()=>{epoch++;},disconnect:()=>{connected=false;epoch++;},writable:value=>{writable=value;}};
}
function scene(entries,scopes=['ch']){
  const now=new Date().toISOString();return {format:S.FORMAT,version:1,id:'test-scene',name:'Concerto',createdAt:now,source:{kind:'wing-read',console:{name:'WING origine',model:'ngc',firmware:'3.1.2'},startedAt:now,completedAt:now},scopes,entries};
}
const entry=(path,value,schema)=>({path,value,schema});
const fader=(path,value)=>entry(path,value,{type:3,unit:0});
const mute=(path,value)=>entry(path,value,{type:4,unit:0,min:0,max:1});
const model=(path,value)=>entry(path,value,{type:5,unit:0,items:['A','B']});

test('capture saves actual complete unit values, including unmodeled persistent fields, and excludes commands/read-only/temporary paths',async()=>{
  const env=fixture();env.cache.set('/ch/1/fdr',99);
  env.put('/ch/1/main/1/on',1,{type:4,min:0,max:1});env.put('/ch/1/gatesc/tap','PRE',{type:5,items:[{value:'PRE',label:'Pre'}]});
  env.put('/ch/1/new_audio_option',0.6,{type:1,min:0,max:1});env.put('/ch/1/$solo',1,{type:4,min:0,max:1});
  env.put('/ch/1/readback',52,{type:4,readOnly:true});env.put('/ch/1/LOAD',1,{type:4,min:0,max:1});
  const captured=await S.capture(env.live,{name:'Batteria',scopes:['ch']});
  assert.equal(captured.entries.find(e=>e.path==='/ch/1/fdr').value,-8);
  assert.equal(captured.entries.find(e=>e.path==='/ch/1/new_audio_option').value,0.6);
  assert.equal(captured.entries.find(e=>e.path==='/ch/1/gatesc/tap').value,'PRE');
  assert.ok(!captured.entries.some(e=>/\$|readback|LOAD/.test(e.path)));
  assert.equal(captured.source.console.name,'WING reale fixture');assert.equal(captured.source.kind,'wing-read');
  assert.deepEqual(env.reads,[['/ch/1',8]]);assert.equal(env.writes.length,0);
});

test('capture refuses an omitted value even when a stale cached value exists',async()=>{
  const env=fixture();env.cache.set('/ch/1/mute',0);env.omitted.add('/ch/1/mute');
  await assert.rejects(S.capture(env.live,{scopes:['ch']}),/Cattura incompleta.*mute/);assert.equal(env.writes.length,0);
});

test('capture aborts on a model change near the end and on a replacement session',async()=>{
  for(const replace of [false,true]){
    const env=fixture();env.put('/ch/1/eq/mdl','A',{type:5,items:[{value:'A'},{value:'B'}]});env.put('/ch/1/eq/gain',0,{type:1,min:-12,max:12});
    let reads=0;env.read(async path=>{if(path==='/ch/1/eq/mdl'&&++reads===2){if(replace)env.replace();else env.bank.set(path,'B');}});
    await assert.rejects(S.capture(env.live,{scopes:['ch']}),replace?/sessione WING è cambiata/:/Modello cambiato/);assert.equal(env.writes.length,0);
  }
});

test('capture bounds malformed or enormous definition trees before requesting their data',async()=>{
  const env=fixture();for(let i=0;i<4100;i++)env.put('/ch/1/p'+i,0,{type:4,min:0,max:1});
  await assert.rejects(S.capture(env.live,{scopes:['ch']}),/Troppi nodi|troppo grande/);assert.equal(env.reads.length,0);
});

test('import rejects demo/native formats, unsafe paths, duplicate fields and intrinsic native value limits',()=>{
  assert.throws(()=>S.parse('{"format":"sculpt-control-scene","version":1}'),/formato diverso/);
  for(const path of ['/cfg/network/address','/$ctl/lib/$action','/cards/wlive/1/$ctl/control','/ch/1/load','/ch/1/../mute','/ch/1/__proto__'])assert.throws(()=>S.normalize(scene([mute(path,1)])),/non audio|non supportato/);
  assert.throws(()=>S.normalize(scene([fader('/ch/1/fdr',999)])),/Livello fader fuori/);
  assert.throws(()=>S.normalize(scene([entry('/ch/1/val',1e50,{type:1})])),/32 bit/);
  assert.throws(()=>S.normalize(scene([mute('/ch/1/mute',1),mute('/ch/1/mute',0)])),/duplicato/);
  assert.throws(()=>S.normalize(scene([entry('/ch/1/eq/gain',3,{type:1,min:-12,max:12})])),/Manca il modello/);
});

test('preflight verifies every selected field even when it equals a cached local default',async()=>{
  const env=fixture();env.cache.set('/ch/1/mute',0);env.omitted.add('/ch/1/mute');
  const snapshot=scene([fader('/ch/1/fdr',-3),mute('/ch/1/mute',0)]);
  await assert.rejects(S.prepare(snapshot,env.live),/corrente non ricevuto/);assert.equal(env.writes.length,0);
  env.omitted.clear();env.definitions.get('/ch/1/mute').readOnly=true;
  await assert.rejects(S.prepare(snapshot,env.live),/non scrivibile/);assert.equal(env.writes.length,0);
});

test('scopes, direct strip protections, gain and phantom exclusions are concrete in the plan',async()=>{
  const env=fixture();env.put('/ch/2/fdr',-10,{type:3});env.put('/io/in/LCL/1/g',20,{type:1,min:-3,max:45.5});env.put('/io/in/LCL/1/vph',0,{type:4,min:0,max:1});env.put('/io/in/LCL/1/name','Mic',{type:7,maxLength:16});
  const snapshot=scene([fader('/ch/1/fdr',-3),fader('/ch/2/fdr',-5),entry('/io/in/LCL/1/g',25,{type:1,unit:0,min:-3,max:45.5}),mute('/io/in/LCL/1/vph',1),entry('/io/in/LCL/1/name','Kick',{type:7,unit:0,maxLength:16})],['ch','sources']);
  const plan=await S.prepare(snapshot,env.live,{safes:'CH1'});
  assert.deepEqual(plan.changes.map(e=>e.path),['/ch/2/fdr','/io/in/LCL/1/name']);assert.equal(plan.excluded,3);
  assert.deepEqual(S.parseSafes('CH1, AUX2 BUS3 /fx/1'),['/ch/1','/aux/2','/bus/3','/fx/1']);
  assert.throws(()=>S.parseSafes('CH41'),/Protezione non valida/);assert.throws(()=>S.parseSafes('/io'),/Protezione non valida/);
});

test('the reviewed plan writes only differences, with requested mutes/off first and send ON/unmute last',async()=>{
  const env=fixture();env.bank.set('/ch/1/mute',0);env.put('/ch/2/mute',1,{type:4,min:0,max:1});
  env.put('/ch/1/send/1/on',0,{type:4,min:0,max:1});env.put('/ch/1/send/1/lvl',-30,{type:3});
  const snapshot=scene([mute('/ch/2/mute',0),mute('/ch/1/send/1/on',1),fader('/ch/1/send/1/lvl',-10),fader('/ch/1/fdr',-8),mute('/ch/1/mute',1)]);
  const plan=await S.prepare(snapshot,env.live);assert.equal(env.writes.length,0);assert.equal(plan.unchanged,1);
  const report=await S.execute(plan,env.live);
  assert.equal(report.ok,true);assert.equal(report.confirmed,4);
  assert.deepEqual(env.writes,[['/ch/1/mute',1],['/ch/1/send/1/lvl',-10],['/ch/1/send/1/on',1],['/ch/2/mute',0]]);
  await assert.rejects(S.execute(plan,env.live),/già stata usata/);
});

test('a stale preview, new schema or replacement session prevents every write',async()=>{
  for(const change of ['value','schema','session']){
    const env=fixture(),plan=await S.prepare(scene([fader('/ch/1/fdr',-3),mute('/ch/1/mute',0)]),env.live);
    if(change==='value')env.bank.set('/ch/1/mute',0);else if(change==='schema')env.definitions.get('/ch/1/mute').revision++;else env.replace();
    const report=await S.execute(plan,env.live);assert.equal(report.ok,false);assert.equal(env.writes.length,0);assert.match(report.error,/scaduta|sessione/);
  }
});

test('models precede parameters, and all new-model fields are validated before the remaining writes',async()=>{
  for(const compatible of [true,false]){
    const env=fixture();env.put('/ch/1/eq/mdl','A',{type:5,items:[{value:'A'},{value:'B'}]});env.put('/ch/1/eq/old',0,{type:1,min:0,max:1});
    env.write(async(path,value)=>{if(path==='/ch/1/eq/mdl'){
      env.definitions.delete('/ch/1/eq/old');env.bank.delete('/ch/1/eq/old');
      env.put('/ch/1/eq/new',0,{type:1,min:-5,max:compatible?5:2});
    }});
    const snapshot=scene([fader('/ch/1/fdr',-3),model('/ch/1/eq/mdl','B'),entry('/ch/1/eq/new',3,{type:1,unit:0,min:-5,max:5})]);
    const plan=await S.prepare(snapshot,env.live);assert.equal(plan.deferred.length,1);assert.equal(env.writes.length,0);
    const report=await S.execute(plan,env.live);assert.equal(report.ok,compatible);assert.deepEqual(env.writes[0],['/ch/1/eq/mdl','B']);
    if(compatible){assert.equal(env.writes.length,3);assert.equal(report.confirmed,3);}else{assert.equal(env.writes.length,1);assert.equal(report.confirmed,1);assert.match(report.error,/fuori intervallo/);}
  }
});

test('cancellation and connection replacement stop the next write, without automatic replay',async()=>{
  for(const change of ['cancel','replace']){
    const env=fixture(),controller=new AbortController(),plan=await S.prepare(scene([fader('/ch/1/fdr',-3),mute('/ch/1/mute',0)]),env.live);
    env.write(async()=>{if(change==='cancel')controller.abort();else env.replace();});
    const report=await S.execute(plan,env.live,{signal:controller.signal});
    assert.equal(report.ok,false);assert.equal(report.confirmed,1);assert.equal(env.writes.length,1);assert.equal(report.remaining,1);assert.equal(report.cancelled,change==='cancel');
    await new Promise(resolve=>setTimeout(resolve,5));assert.equal(env.writes.length,1);
  }
});

test('a failed write reports the uncertain path and preserves the confirmed partial result',async()=>{
  const env=fixture(),plan=await S.prepare(scene([fader('/ch/1/fdr',-3),mute('/ch/1/mute',0)]),env.live);
  env.write(async path=>{if(path.endsWith('/mute'))throw new Error('Readback non ricevuto');});
  const report=await S.execute(plan,env.live);
  assert.equal(report.ok,false);assert.equal(report.confirmed,1);assert.equal(report.uncertainPath,'/ch/1/mute');assert.match(report.error,/Readback/);
});

test('linear/log quantization and float32 enums use the native readback tolerance',()=>{
  assert.equal(S.sameValue(6,6.19,{type:1,min:0,max:10,steps:26}),true);
  assert.equal(S.sameValue(6,6.3,{type:1,min:0,max:10,steps:26}),false);
  const ratio=Math.pow(20000/20,1/100);
  assert.equal(S.sameValue(1000*Math.sqrt(ratio),1000,{type:2,min:20,max:20000,steps:101}),true);
  assert.equal(S.sameValue(1000*ratio,1000,{type:2,min:20,max:20000,steps:101}),false);
  assert.equal(S.sameValue(0.1,Math.fround(0.1),{type:6}),true);
});

test('no connection or disabled Control prevents recall, while read-only capture is permitted',async()=>{
  const env=fixture();env.writable(false);
  await assert.rejects(S.prepare(scene([fader('/ch/1/fdr',-3)]),env.live),/Attiva Controllo/);
  const captured=await S.capture(env.live,{scopes:['ch']});assert.ok(captured.entries.length>0);
  env.disconnect();await assert.rejects(S.capture(env.live,{scopes:['ch']}),/Collega la WING/);assert.equal(env.writes.length,0);
});
