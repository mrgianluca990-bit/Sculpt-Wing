const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../native/node_modules/jsdom');
const Catalog=require('../dist/plugin-data.js');
const {prepareActions,executeAction}=require('../dist/systems.js');
const {Session}=require('../dist/live-session.js');

const parameterPath='/ch/1/dyn/thr';
const parameterAction=()=>({type:'wingParameter',path:parameterPath,mode:'set',value:-21});
function liveFixture(){
  const calls=[],values=new Map([[parameterPath,-18]]),metadata=new Map([[parameterPath,{path:parameterPath,type:1,min:-60,max:0,readOnly:false,revision:7}]]);
  const status={mode:'live',writable:true,connected:true,failureVersion:0,failure:'',token:4};
  const processor={model:'COMP',enabled:true,params:{thr:-18}};
  const live={
    isLive:()=>true,isConnected:()=>status.connected,isWritable:()=>status.writable,
    snapshot:()=>status,sessionToken:()=>status.token,
    hasValue:p=>values.has(p),value:p=>values.get(p),metadata:p=>metadata.get(p),
    readNode:async(p,options)=>calls.push(['read',p,options]),
    loadScope:async(...args)=>calls.push(['scope',...args]),ensureProcessor:async ctx=>calls.push(['processor-read',ctx]),
    parameterDefinition:()=>({path:parameterPath,type:'number',min:-60,max:0,readOnly:false,revision:metadata.get(parameterPath)?.revision}),
    write:async(p,value,options)=>{calls.push(['write',p,value,options]);values.set(p,value);return value;},
    settled:async()=>calls.push(['settled'])
  };
  const strip={id:'ch-1',kind:'CH',number:1,level:-6,mute:false};
  const controller={getStrip:id=>id==='ch-1'?strip:null,getState:()=>({inputs:[strip],outputs:[],desk:{layers:[]}}),updateStrip:(id,patch)=>{calls.push(['strip-write',id,patch]);Object.assign(strip,patch);return true;}};
  const desk={get:()=>({layers:[],dca:[],macros:[]}),processor:()=>processor,setParam:(ctx,key,value)=>{calls.push(['processor-write',ctx,key,value]);processor.params[key]=value;return true;}};
  const ui={listPages:()=>[{id:'io',title:'I/O'},{id:'macros',title:'Macro Sculpt'}],open:(...args)=>{calls.push(['open',...args]);return true;},close:()=>calls.push(['close']),showMenu:()=>{calls.push(['menu']);return true;}};
  return {env:{controller,desk,ui,live,catalog:Catalog},calls,values,metadata,status,processor,strip};
}

test('navigation-only macros remain local in read-only and disconnected WING modes',async()=>{
  const f=liveFixture();f.status.writable=false;f.status.connected=false;
  const action={type:'menu',target:'io'};
  await prepareActions([action],f.env);await executeAction(action,f.env);
  assert(f.calls.some(call=>call[0]==='open'&&call[1]==='io'));
  assert.equal(f.calls.filter(call=>['read','write','scope','settled','strip-write','processor-write'].includes(call[0])).length,0);
});

test('a missing or read-only generic WING parameter is rejected before any command',async()=>{
  for(const variation of ['missing-value','missing-schema','read-only','container']){
    const f=liveFixture();
    if(variation==='missing-value')f.values.delete(parameterPath);
    if(variation==='missing-schema')f.metadata.delete(parameterPath);
    if(variation==='read-only')f.metadata.get(parameterPath).readOnly=true;
    if(variation==='container')f.metadata.get(parameterPath).type=0;
    await assert.rejects(prepareActions([parameterAction()],f.env));
    assert.equal(f.calls.some(call=>call[0]==='write'),false,variation);
  }
});

test('generic WING parameter preflight validates range and firmware enum values',async()=>{
  const numeric=liveFixture();await assert.rejects(prepareActions([{...parameterAction(),value:3}],numeric.env));
  assert.equal(numeric.calls.some(call=>call[0]==='write'),false);
  const enumeration=liveFixture();enumeration.metadata.set(parameterPath,{path:parameterPath,type:5,readOnly:false,revision:7,items:[{value:'A',label:'A'},{value:'B',label:'B'}]});enumeration.values.set(parameterPath,'A');
  await assert.rejects(prepareActions([{...parameterAction(),value:'C'}],enumeration.env));
  assert.equal(enumeration.calls.some(call=>call[0]==='write'),false);
});

test('an interrupted session cannot execute an already prepared WING parameter',async()=>{
  const f=liveFixture(),action=parameterAction();await prepareActions([action],f.env);
  f.status.token++;
  await assert.rejects(executeAction(action,f.env),/session|connession|interrott|cambiat/i);
  assert.equal(f.calls.some(call=>call[0]==='write'),false);
});

test('a parameter whose schema changes after preflight cannot be written under the new schema',async()=>{
  for(const patch of [{revision:8},{readOnly:true},{type:7,maxLength:16}]){
    const f=liveFixture(),action=parameterAction();await prepareActions([action],f.env);
    Object.assign(f.metadata.get(parameterPath),patch);
    await assert.rejects(executeAction(action,f.env));
    assert.equal(f.calls.some(call=>call[0]==='write'),false);
  }
});

test('processor macros bind the expected model and refuse a replacement processor',async()=>{
  const f=liveFixture(),action={type:'processorParam',context:{type:'strip',id:'ch-1',block:'dyn'},model:'COMP',key:'thr',mode:'set',value:-24};
  await prepareActions([action],f.env);f.processor.model='GATE';
  await assert.rejects(executeAction(action,f.env),/modello|processore|cambiat/i);
  assert.equal(f.calls.some(call=>call[0]==='processor-write'),false);
});

test('a generic parameter awaits write confirmation and propagates native failure',async()=>{
  const f=liveFixture(),action=parameterAction();await prepareActions([action],f.env);
  let release,finished=false;
  f.env.live.write=()=>new Promise((resolve,reject)=>{release=()=>reject(new Error('Readback WING non confermato'));});
  const operation=executeAction(action,f.env).finally(()=>finished=true);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);assert.equal(typeof release,'function');
  release();await assert.rejects(operation,/Readback WING non confermato/);
});

test('the real session refuses a prepared schema changed during its final metadata refresh',async()=>{
  for(const replacement of [{revision:8},{type:7,maxLength:16},{type:5,items:[{value:'A',label:'A'}]},{readOnly:true}]){
    const expected={path:parameterPath,type:1,min:-60,max:0,readOnly:false,revision:7},writes=[];
    let release;
    const driver={onValue:()=>()=>{},onStatus:()=>()=>{},onMeters:()=>()=>{},describe:()=>new Promise(resolve=>release=resolve),set:async(...args)=>writes.push(args)};
    const session=new Session({driver,map:{apply:()=>{}},getState:()=>({}),mutate:fn=>fn({})});session.mode='live';session.writable=true;
    const f=liveFixture(),action=parameterAction();await prepareActions([action],f.env);
    f.env.live.write=(...args)=>session.write(...args);
    const operation=executeAction(action,f.env);
    release({...expected,...replacement});
    await assert.rejects(operation,/schema WING.*cambiato/i);assert.equal(writes.length,0);session.dispose();
  }
});

test('the real session preserves existing callers and rejects a replacement connection during describe',async()=>{
  const meta={path:parameterPath,type:1,min:-60,max:0,readOnly:false,revision:7},writes=[];
  let release;
  const driver={onValue:()=>()=>{},onStatus:()=>()=>{},onMeters:()=>()=>{},describe:async()=>({...meta}),set:async(...args)=>writes.push(args)};
  const session=new Session({driver,map:{apply:()=>{}},getState:()=>({}),mutate:fn=>fn({})});session.mode='live';session.writable=true;
  await session.write(parameterPath,-21);
  assert.equal(writes.length,1,'existing callers without expectedSchema keep their established write path');
  assert.equal(writes[0][2].revision,7);
  driver.describe=()=>new Promise(resolve=>release=resolve);
  const operation=session.write(parameterPath,-24,{expectedSchema:meta});session.epoch++;release(meta);
  await assert.rejects(operation,/session|annullat|interrott/i);assert.equal(writes.length,1);session.dispose();
});

function macroUiFixture(){
  const dom=new JSDOM('<!doctype html><html><body><div id="macro-buttons"></div></body></html>',{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const run=file=>w.eval(fs.readFileSync(path.join(__dirname,'..','dist',file),'utf8'));
  run('model.js');run('plugin-data.js');const M=w.SculptModel,state=M.defaults(),listeners=new Set();
  const C=w.SculptController={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),getSend:(a,b)=>M.getSend(state,a,b),setSend:(a,b,p)=>M.setSend(state,a,b,p),
    transact:(fn,type)=>{fn(state);for(const cb of listeners)cb({type});return true;},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},capture:()=>JSON.parse(JSON.stringify(M.serialize(state))),updateStrip:(id,patch)=>{M.patchStrip(M.find(state,id),patch);return true;},toast:()=>{}};
  run('desk.js');run('wing-map.js');run('shell.js');run('systems.js');
  const f=liveFixture();w.SculptLive={...f.env.live,allowMacro:()=>true};
  w.SculptUI.register('io',{title:'I/O',render:container=>container.append(w.document.createTextNode('Routing'))});
  return {dom,w,state,C,...f};
}

test('a mixed macro rejects a later invalid parameter before opening its first menu or changing audio',async()=>{
  const f=macroUiFixture();
  f.w.SculptDesk.change(d=>{d.macros[8].actions=[{type:'menu',target:'io'},{...parameterAction(),value:7}];});
  const before=f.C.capture(),result=await f.w.SculptSystems.runMacro(9);
  assert.equal(result.ok,false);assert.equal(f.w.SculptUI.current(),null);
  assert.equal(f.calls.some(call=>call[0]==='write'),false);
  assert.deepEqual(f.C.capture().values,before.values);f.dom.window.close();
});

test('unknown actions cannot hide after a valid navigation action in a macro',async()=>{
  const f=macroUiFixture();f.w.SculptDesk.change(d=>{d.macros[8].actions=[{type:'menu',target:'io'},{type:'futureUnsupportedAction'}];});
  const result=await f.w.SculptSystems.runMacro(9);
  assert.equal(result.ok,false);assert.equal(f.w.SculptUI.current(),null);
  assert.equal(f.calls.some(call=>call[0]==='write'),false);f.dom.window.close();
});

test('a malformed later legacy action is rejected before an earlier fader command runs',async()=>{
  const f=macroUiFixture(),level=f.C.getStrip('ch-1').level;
  f.w.SculptDesk.change(d=>{d.macros[8].actions=[{type:'fader',target:'ch-1',mode:'set',value:-2},{type:'dca',target:'999',mode:'set',value:0}];});
  const result=await f.w.SculptSystems.runMacro(9);
  assert.equal(result.ok,false);assert.equal(f.C.getStrip('ch-1').level,level);
  assert.equal(f.calls.some(call=>call[0]==='write'),false);f.dom.window.close();
});
