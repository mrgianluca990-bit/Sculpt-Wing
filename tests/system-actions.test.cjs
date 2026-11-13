const test=require('node:test');
const assert=require('node:assert/strict');
const {executeAction,transportPosition,formatTime,validateProject}=require('../dist/systems.js');
const fs=require('node:fs');
const vm=require('node:vm');
const Model=require('../dist/model.js');
const Catalog=require('../dist/plugin-data.js');

function fixture(){
  const strips={'ch-1':{id:'ch-1',level:-6,mute:false},'bus-1':{id:'bus-1',level:-4,mute:false}};
  const sends={'ch-1>bus-1':{level:-12,on:false}};
  const state={dca:[{id:1,level:0,mute:false}],muteGroups:[{id:1,on:false}],channels:{'ch-1':{solo:false,useAlt:false}},monitor:[{dim:false},{dim:false}],talkback:{a:{on:false},b:{on:false}},oscillators:[{on:false},{on:false}],fx:[{enabled:true}],scenes:[{id:'scene-a',scope:['levels'],snapshot:{version:3,values:{'ch-1':{level:-15}}}}],safes:['ch-1']};
  const calls=[];
  const controller={getStrip:id=>strips[id],updateStrip:(id,patch)=>Object.assign(strips[id],patch),getSend:(id,target)=>sends[id+'>'+target],setSend:(id,target,patch)=>Object.assign(sends[id+'>'+target],patch)};
  const desk={get:()=>state,change:fn=>fn(state),channel:id=>state.channels[id],patchChannel:(id,patch)=>Object.assign(state.channels[id],patch),setSolo:(id,value)=>state.channels[id].solo=value,processor:ctx=>state.fx[ctx.slot-1],enableProcessor:(ctx,value)=>state.fx[ctx.slot-1].enabled=value,recall:(...args)=>calls.push(args)};
  let time=0;
  const env={controller,desk,now:()=>time,sleep:async ms=>{time+=ms;},transport:(...args)=>{calls.push(args);return true;}};
  return {env,state,strips,sends,calls};
}

test('fader offsets and send actions mutate the shared mix without changing destination master',async()=>{
  const f=fixture();
  await executeAction({type:'fader',target:'ch-1',mode:'offset',value:1},f.env);
  assert.equal(f.strips['ch-1'].level,-5);
  await executeAction({type:'send',target:'ch-1',destination:'bus-1',mode:'set',value:-3},f.env);
  assert.deepEqual(f.sends['ch-1>bus-1'],{level:-3,on:true});
  assert.equal(f.strips['bus-1'].level,-4);
  await executeAction({type:'send',target:'ch-1',destination:'bus-1',mode:'toggle'},f.env);
  assert.equal(f.sends['ch-1>bus-1'].on,false);
});

test('groups, talkback and monitor actions change their independent state',async()=>{
  const f=fixture();
  for(const action of [{type:'dca',target:'1',value:-9},{type:'muteGroup',target:'1',mode:'toggle'},{type:'talkback',target:'a',mode:'toggle'},{type:'monitorDim',target:'1',mode:'toggle'},{type:'solo',target:'ch-1',mode:'toggle'},{type:'sourceAlt',target:'ch-1',mode:'toggle'},{type:'oscillator',target:'2',mode:'toggle'},{type:'fxBypass',target:'1',mode:'set',value:false}])await executeAction(action,f.env);
  assert.equal(f.state.dca[0].level,-9);
  assert.equal(f.state.muteGroups[0].on,true);
  assert.equal(f.state.talkback.a.on,true);
  assert.equal(f.state.talkback.b.on,false);
  assert.equal(f.state.monitor[0].dim,false);
  assert.equal(f.state.monitor[1].dim,true);
  assert.equal(f.state.channels['ch-1'].solo,true);
  assert.equal(f.state.channels['ch-1'].useAlt,true);
  assert.equal(f.state.oscillators[1].on,true);
  assert.equal(f.state.fx[0].enabled,false);
});

test('scene macros pass stored scope and current safes into the recall engine',async()=>{
  const f=fixture();
  await executeAction({type:'scene',target:'scene-a'},f.env);
  assert.deepEqual(f.calls[0],[f.state.scenes[0].snapshot,['levels'],['ch-1']]);
  assert.equal(f.state.activeScene,'scene-a');
});

test('invalid targets, numeric inputs and unavailable transports fail visibly',async()=>{
  const f=fixture();
  for(const action of [{type:'fader',target:'missing',value:0},{type:'fader',target:'ch-1',value:'bad'},{type:'scene',target:'missing'},{type:'monitorDim',target:'3'},{type:'fxBypass',target:'NaN'},{type:'send',target:'ch-1',destination:'missing',value:-9}])await assert.rejects(executeAction(action,f.env));
  await assert.rejects(executeAction({type:'recorder',target:'sdA',value:'record'},{...f.env,transport:()=>false}),/Trasporto non disponibile/);
  assert.equal(f.strips['ch-1'].level,-6);
});

test('fades reach their target and cancellation prevents the next action',async()=>{
  const f=fixture();
  await executeAction({type:'fader',target:'ch-1',value:0,duration:.2},f.env);
  assert.equal(f.strips['ch-1'].level,0);
  assert.equal(f.env.now(),200);
  await assert.rejects(executeAction({type:'wait',value:1},{...f.env,cancelled:()=>true}),/Macro interrotta/);
});

test('virtual transport derives elapsed, paused, looping and end positions',()=>{
  const base={state:'playing',position:10,startedAt:1000,duration:100,loop:false};
  assert.equal(transportPosition(base,6000),15);
  assert.equal(transportPosition({...base,state:'paused'},6000),10);
  assert.equal(transportPosition({...base,loop:true,loopStart:2,loopEnd:12},6000),5);
  assert.equal(transportPosition(base,200000),100);
  assert.equal(transportPosition({...base,state:'recording'},200000),209);
  assert.equal(formatTime(3661.9),'01:01:01');
});

test('project importer accepts both export wrappers, checks strip ranges and removes prototype keys',()=>{
  const snapshot={version:3,values:{'ch-1':{level:-6},'aux-8':{level:-12}},desk:{}};
  assert.deepEqual(validateProject({format:'sculpt-control-demo',version:4,state:snapshot}),snapshot);
  assert.deepEqual(validateProject({format:'sculpt-control-project',version:1,snapshot}),snapshot);
  assert.throws(()=>validateProject({version:3,values:{'ch-41':{level:0}}}),/canali non validi/);
  assert.throws(()=>validateProject({version:4,values:{}}),/versione/);
  assert.throws(()=>validateProject({version:3,values:[]}),/versione/);
  const dirty=JSON.parse('{"version":3,"values":{"ch-1":{"level":0,"__proto__":{"polluted":true}}},"desk":{"constructor":{"prototype":{"polluted":true}}}}');
  const clean=validateProject(dirty);
  assert.equal(Object.prototype.hasOwnProperty.call(clean.values['ch-1'],'__proto__'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(clean.desk,'constructor'),false);
  assert.equal({}.polluted,undefined);
});

test('global modules seed useful macros once and survive full restore and reset',async()=>{
  let state=Model.defaults();const listeners=[],pages=[];
  const emit=type=>listeners.forEach(fn=>fn({type}));
  const controller={getState:()=>state,getStrip:id=>Model.find(state,id),listStrips:()=>Model.list(state),subscribe:fn=>{listeners.push(fn);return()=>{};},transact:(fn,type)=>{fn(state);emit(type);},capture:()=>JSON.parse(JSON.stringify(Model.serialize(state))),restore:snapshot=>{state=Model.restore(snapshot);state.desk=context.window.SculptDesk.normalize(state.desk);emit('restore');},updateStrip:(id,patch)=>Model.patchStrip(Model.find(state,id),patch),setSend:(a,b,patch)=>Model.setSend(state,a,b,patch),toast:()=>{}};
  const context={window:{SculptController:controller,SculptModel:Model,SculptCatalog:Catalog,document:{},dispatchEvent:()=>{},SculptUI:{register:(id,definition)=>pages.push({id,definition}),toast:()=>{},refresh:()=>{}}},console,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/desk.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/systems.js'),'utf8'),context);
  const desk=context.window.SculptDesk,systems=context.window.SculptSystems;
  assert.deepEqual(pages.map(p=>p.id),['groups','monitor','meters','scenes','recorder','setup','layers','macros']);
  assert.equal(desk.get().scenes.length,2);
  assert.equal(desk.get().macros.filter(m=>m.actions.length).length,8);
  assert.equal((await systems.runMacro(1)).ok,true);
  assert.equal(desk.get().talkback.a.on,true);
  desk.change(d=>d.scenes=[]);
  controller.restore(controller.capture());
  assert.equal(desk.get().scenes.length,0,'deleted scene library must not be reseeded on restore');
  desk.reset();
  assert.equal(desk.get().scenes.length,2);
  assert.equal(desk.get().macros[0].actions.length,1);
  assert.equal(desk.get().talkback.a.on,false);
});
