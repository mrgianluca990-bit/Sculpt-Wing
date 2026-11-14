'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../native/node_modules/jsdom');
const {prepareActions,executeAction}=require('../dist/systems.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve)),plain=value=>JSON.parse(JSON.stringify(value));

function liveFixture(){
  const status={active:true,connected:true,writable:true,epoch:1,failureVersion:0},strip={id:'ch-1',kind:'CH',number:1,level:-6,mute:false};
  const state={channels:{'ch-1':{solo:false}},dca:[{id:1,level:-4,mute:false}],muteGroups:[{id:1,on:false}],layers:[],fx:[{stripId:'ch-1',position:'pre',enabled:true}]};
  const values=new Map(Object.entries({'/ch/1/fdr':-6,'/ch/1/mute':0,'/ch/1/$solo':0,'/dca/1/fdr':-4,'/ch/1/preins/ins':'FX1','/ch/1/preins/on':1}));
  const metadata=new Map([...values].map(([p,v])=>[p,{path:p,type:typeof v==='string'?5:p.endsWith('/fdr')?3:4,readOnly:false,revision:1,...(typeof v==='string'?{items:[{value:v}]}:p.endsWith('/fdr')?{min:-144,max:10}:{min:0,max:1})}]));
  const reads=[],writes=[],osc=[],views=[];let time=0;
  const live={isLive:()=>status.active,isConnected:()=>status.connected,isWritable:()=>status.writable,sessionToken:()=>status.epoch,snapshot:()=>status,metadata:p=>metadata.get(p),hasValue:p=>values.has(p),value:p=>values.get(p),readNode:async p=>{reads.push(p);},settled:async()=>{}};
  const controller={getStrip:id=>id==='ch-1'?strip:null,updateStrip:(id,patch)=>{writes.push({epoch:status.epoch,id,patch});Object.assign(strip,patch);if(patch.level!==undefined)values.set('/ch/1/fdr',patch.level<=-90?-144:patch.level);if(patch.mute!==undefined)values.set('/ch/1/mute',Number(patch.mute));return true;}};
  const desk={get:()=>state,channel:id=>state.channels[id],processor:ctx=>state.fx[ctx.slot-1],change:fn=>{fn(state);return true;}};
  const env={live,controller,desk,now:()=>time,sleep:async ms=>{time+=ms;env.afterSleep?.(time);},ui:{listPages:()=>[{id:'io'}],open:page=>views.push(page),close(){},showMenu(){}},osc:{prepare:()=>({host:'127.0.0.1',port:53000,address:'/fixture',args:[]}),sendPrepared:async value=>osc.push(value)}};
  return {env,live,status,strip,state,values,metadata,reads,writes,osc,views};
}

test('all legacy parameters are checked before earlier actions, including readonly and unknown values',async()=>{
  for(const problem of ['readonly','missing-value','missing-schema']){
    const f=liveFixture(),path='/dca/1/fdr';if(problem==='readonly')f.metadata.get(path).readOnly=true;else if(problem==='missing-value')f.values.delete(path);else f.metadata.delete(path);
    await assert.rejects(prepareActions([{type:'mute',target:'ch-1',mode:'set',value:true},{type:'dca',target:'1',mode:'set',value:-3}],f.env));
    assert.equal(f.writes.length,0);assert.equal(f.strip.mute,false);
  }
});

test('repeated DCA actions preflight one leaf and reject schema changes before execution',async()=>{
  const f=liveFixture(),actions=[{type:'dca',target:'1',value:-2},{type:'dca',target:'1',value:-3}];
  await prepareActions(actions,f.env);assert.deepEqual(f.reads,['/dca/1/fdr']);
  f.metadata.get('/dca/1/fdr').revision=2;
  await assert.rejects(executeAction(actions[0],f.env),/parametri WING.*cambiati/);assert.equal(f.state.dca[0].level,-4);
});

test('an FX assignment or unavailable navigation target fails before an earlier fader can run',async()=>{
  const f=liveFixture();f.values.set('/ch/1/preins/ins','NONE');
  await assert.rejects(prepareActions([{type:'fader',target:'ch-1',value:0},{type:'fxBypass',target:'1',mode:'toggle'}],f.env),/assegnazione FX/);
  await assert.rejects(prepareActions([{type:'fader',target:'ch-1',value:0},{type:'menu',target:'fx-editor',slot:1}],f.env),/Editor FX/);
  assert.equal(f.writes.length,0);
});

test('an instant send sets and confirms its level before turning on a previously disabled route',async()=>{
  for(const rejected of [false,true]){
    const f=liveFixture(),send={level:0,on:false},patches=[];let release;
    f.env.controller.getSend=()=>send;f.env.controller.setSend=(from,to,patch)=>{patches.push(patch);Object.assign(send,patch);return true;};
    f.live.settled=()=>release?Promise.resolve():new Promise(resolve=>{release=resolve;});
    const operation=executeAction({type:'send',target:'ch-1',destination:'bus-1',value:-20,duration:0},f.env);
    await tick();assert.equal(send.level,-20);assert.equal(send.on,false);assert.deepEqual(patches,[{level:-20}]);
    if(rejected){f.status.failureVersion++;f.status.failure='Send level rejected';}
    release();if(rejected){await assert.rejects(operation,/Send level rejected/);assert.equal(send.on,false);}else{await operation;assert.equal(send.on,true);}
  }
});

test('each fade tick is bound to the original session even if a replacement is writable',async()=>{
  const f=liveFixture(),action={type:'fader',target:'ch-1',value:0,duration:.2};await prepareActions([action],f.env);
  f.env.afterSleep=time=>{if(time>=80)f.status.epoch=2;};
  await assert.rejects(executeAction(action,f.env),/sessione WING.*cambiata/);
  assert.equal(f.writes.length,1,'the initial unchanged interpolation point does not issue a command');
  assert(f.writes.every(write=>write.epoch===1),'no interpolation reaches the replacement connection');
  assert.equal(f.strip.level,-4.8);
});

test('a demo fade cannot continue into a live session and a stopped sequence cannot reach OSC',async()=>{
  const f=liveFixture();f.status.active=false;f.env.afterSleep=()=>{f.status.active=true;};
  const fade={type:'fader',target:'ch-1',value:0,duration:.2};await prepareActions([fade],f.env);
  await assert.rejects(executeAction(fade,f.env),/sessione WING.*cambiata/);assert.equal(f.writes.length,0);
  const g=liveFixture(),actions=[{type:'fader',target:'ch-1',value:-5},{type:'wait',value:1},{type:'osc'}];await prepareActions(actions,g.env);
  g.env.afterSleep=()=>{g.status.epoch++;};
  await assert.rejects((async()=>{for(const action of actions)await executeAction(action,g.env);})(),/sessione WING.*cambiata/);
  assert.equal(g.writes.length,1);assert.equal(g.osc.length,0);
});

function uiFixture(t){
  const dom=new JSDOM('<!doctype html><body><div id="macro-buttons"></div></body>',{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window,base=path.join(__dirname,'../dist');
  t.after(()=>dom.window.close());w.setInterval=()=>0;w.clearInterval=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const statusListeners=new Set(),add=w.addEventListener.bind(w),remove=w.removeEventListener.bind(w);
  w.addEventListener=(type,fn,...args)=>{if(type==='sculpt-macro-status')statusListeners.add(fn);return add(type,fn,...args);};w.removeEventListener=(type,fn,...args)=>{if(type==='sculpt-macro-status')statusListeners.delete(fn);return remove(type,fn,...args);};
  const run=file=>w.eval(fs.readFileSync(path.join(base,file),'utf8'));run('model.js');run('plugin-data.js');
  const M=w.SculptModel,state=M.defaults(),listeners=new Set(),notices=[],gestures=[];
  const C=w.SculptController={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),transact:(fn,type)=>{fn(state);for(const cb of listeners)cb({type});return true;},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},capture:()=>plain(M.serialize(state)),updateStrip:(id,p)=>{M.patchStrip(M.find(state,id),p);return true;},getSend:(a,b)=>M.getSend(state,a,b),setSend:(a,b,p)=>M.setSend(state,a,b,p),canSend:(a,b)=>M.canRoute(M.find(state,a),M.find(state,b)),setSof:id=>M.setSof(state,id),showLayer(){},toast:text=>notices.push(text),beginGesture:label=>gestures.push(['begin',label]),endGesture:()=>gestures.push(['end'])};
  run('desk.js');run('shell.js');run('systems.js');
  const D=w.SculptDesk,U=w.SculptUI,systems=w.SculptSystems;
  const button=text=>[...w.document.querySelectorAll('button')].find(node=>node.textContent===text),rail=id=>w.document.querySelector('.macro-action[data-macro-id="'+id+'"]');
  const set=(actions,name='Test macro')=>D.change(d=>{d.macros[8].name=name;d.macros[8].actions=actions;});
  return {w,C,D,U,systems,button,rail,set,state,notices,gestures,statusListeners};
}

test('Interrompi promptly releases a 30-second wait and never executes the next action',async t=>{
  const f=uiFixture(t);f.set([{type:'wait',value:30},{type:'mute',target:'ch-1',mode:'set',value:true}]);const before=f.C.getStrip('ch-1').mute;
  f.U.open('macros',{id:9});const operation=f.systems.runMacro(9);await tick();
  assert.equal(f.systems.macroStatus().phase,'waiting');assert.equal(f.rail(9).getAttribute('aria-busy'),'true');assert.equal(f.rail(9).disabled,true);
  assert.equal(f.button('▶ Esegui').disabled,true);assert.equal(f.button('■ Interrompi').disabled,false);
  const second=await f.systems.runMacro(9);assert.equal(second.ok,false,'double activation does not start a concurrent macro');
  f.button('■ Interrompi').click();
  const result=await Promise.race([operation,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Cancellation did not release the wait')),500))]);
  assert.equal(result.ok,false);assert.equal(result.completed,0);assert.equal(f.C.getStrip('ch-1').mute,before);
  assert.equal(f.systems.macroStatus().running,false);assert.equal(f.systems.macroStatus().phase,'cancelled');assert.equal(f.rail(9).disabled,false);assert.equal(f.button('■ Interrompi').disabled,true);
  assert.deepEqual(f.gestures.map(v=>v[0]),['begin','end']);f.U.close();assert.equal(f.statusListeners.size,1,'only the permanent rail listener remains');
});

test('a double click does not repeat a short macro after its first execution already completed',async t=>{
  const f=uiFixture(t);f.set([{type:'mute',target:'ch-1',mode:'toggle'}]);const before=f.C.getStrip('ch-1').mute;
  f.rail(9).dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,detail:1}));await tick();assert.equal(f.C.getStrip('ch-1').mute,!before);
  f.rail(9).dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,detail:2}));await tick();assert.equal(f.C.getStrip('ch-1').mute,!before);assert.equal(f.gestures.filter(v=>v[0]==='begin').length,1);
  f.U.open('macros',{id:9});f.button('▶ Esegui').dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,detail:2}));await tick();assert.equal(f.C.getStrip('ch-1').mute,!before);
});

test('offline macro Undo refuses to replace later manual edits',async t=>{
  const f=uiFixture(t);f.set([{type:'fader',target:'ch-1',value:-2}]);assert.equal((await f.systems.runMacro(9)).ok,true);
  f.C.updateStrip('ch-2',{level:-17});f.U.open('macros',{id:9});f.button('Annulla ultima macro').click();
  assert.equal(f.C.getStrip('ch-1').level,-2);assert.equal(f.C.getStrip('ch-2').level,-17);assert.match(f.w.document.querySelector('.desk-toast').textContent,/cambiato dopo la macro/);
});

test('a failed preflight preserves the previous valid macro Undo',async t=>{
  const f=uiFixture(t),before=f.C.getStrip('ch-1').level;f.set([{type:'fader',target:'ch-1',value:-2}]);assert.equal((await f.systems.runMacro(9)).ok,true);
  f.set([{type:'dca',target:'999',value:0}]);assert.equal((await f.systems.runMacro(9)).ok,false);
  f.U.open('macros',{id:9});f.button('Annulla ultima macro').click();assert.equal(f.C.getStrip('ch-1').level,before);
});
