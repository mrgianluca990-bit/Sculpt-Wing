const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../native/node_modules/jsdom');
const {executeAction,prepareActions}=require('../dist/systems.js');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function actionEnv(){
  const strip={id:'ch-1',level:-4,mute:false},send={level:-10,on:true},state={channels:{'ch-1':{solo:false}},fx:[{stripId:'ch-1',position:'pre',enabled:true}]},calls=[],status={failureVersion:0,failure:''};
  const live={isLive:()=>true,isConnected:()=>true,isWritable:()=>true,snapshot:()=>status,loadScope:async(...args)=>calls.push(['scope',...args]),ensureProcessor:async ctx=>calls.push(['processor',ctx]),settled:async()=>calls.push(['settled'])};
  const controller={getStrip:id=>id==='ch-1'?strip:null,updateStrip:(id,p)=>{Object.assign(strip,p);return true;},getSend:()=>send,setSend:(a,b,p)=>{Object.assign(send,p);return true;}};
  const desk={get:()=>state,processor:ctx=>state.fx[ctx.slot-1],channel:id=>state.channels[id]};
  return {env:{live,controller,desk},strip,send,state,calls,status};
}
test('macro preflight reads all required scopes before any action and coalesces duplicate scopes',async()=>{
  const f=actionEnv();await prepareActions([{type:'fader',target:'ch-1',value:-4},{type:'send',target:'ch-1',destination:'bus-2',value:-10},{type:'dca',target:'1',value:0},{type:'muteGroup',target:'2',mode:'toggle'},{type:'talkback',target:'a',mode:'toggle'},{type:'monitorDim',target:'0',mode:'toggle'},{type:'sourceAlt',target:'ch-1',mode:'toggle'},{type:'fxBypass',target:'1',mode:'toggle'}],f.env);
  assert.equal(f.strip.level,-4);assert.deepEqual(f.calls.filter(c=>c[0]==='scope'&&c[1]==='groups'),[['scope','groups',undefined]]);
  assert(f.calls.some(c=>c[0]==='scope'&&c[1]==='sends'&&c[2].targetId==='bus-2'));
  assert(f.calls.some(c=>c[0]==='scope'&&c[1]==='inserts'));
  await assert.rejects(prepareActions([{type:'scene',target:'local-scene'}],f.env),/scene Sculpt locali/);
});
test('rejected fader/send mutations stop macro execution rather than reporting success',async()=>{
  const f=actionEnv();f.env.controller.updateStrip=()=>false;
  await assert.rejects(executeAction({type:'fader',target:'ch-1',value:-8},f.env),/non ha accettato/);
  f.env.controller.setSend=()=>false;await assert.rejects(executeAction({type:'send',target:'ch-1',destination:'bus-2',mode:'toggle'},f.env),/non ha accettato/);
  assert.equal(f.calls.length,0);assert.equal(f.strip.level,-4);
});
test('an action awaits the native write queue and propagates a confirmation failure',async()=>{
  const f=actionEnv();let release,complete=false;f.env.live.settled=()=>new Promise(resolve=>release=resolve);
  const action=executeAction({type:'mute',target:'ch-1',mode:'set',value:true},f.env).then(()=>{complete=true;});
  await settle();assert.equal(complete,false);f.status.failureVersion++;f.status.failure='Readback WING non confermato';release();await assert.rejects(action,/Readback WING non confermato/);
});
test('recorder actions await asynchronous transport and reject unavailable native results',async()=>{
  const f=actionEnv();let release;f.env.nativeTransport=()=>new Promise(resolve=>release=resolve);
  const action=executeAction({type:'recorder',target:'sdA',value:'record'},f.env);await settle();release(false);await assert.rejects(action,/Trasporto non disponibile/);
});
function uiFixture(){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window,base=path.join(__dirname,'..','dist');
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
  const ticks=new Map();let timer=0;w.setInterval=fn=>{ticks.set(++timer,fn);return timer;};w.clearInterval=id=>ticks.delete(id);
  const run=file=>w.eval(fs.readFileSync(path.join(base,file),'utf8'));
  run('model.js');run('plugin-data.js');const M=w.SculptModel,state=M.defaults(),listeners=new Set(),toasts=[];
  const C=w.SculptController={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),transact:(fn,type)=>{fn(state);for(const cb of listeners)cb({type});return true;},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},capture:()=>JSON.parse(JSON.stringify(M.serialize(state))),updateStrip:(id,p)=>{M.patchStrip(M.find(state,id),p);return true;},getSend:(a,b)=>M.getSend(state,a,b),setSend:(a,b,p)=>M.setSend(state,a,b,p),toast:m=>toasts.push(m)};
  run('desk.js');run('wing-map.js');run('shell.js');run('systems.js');
  const status={mode:'live',writable:true,failureVersion:0,failure:''},values=new Map(),pending=[],events=new Set(),explorer=[];let meter={left:-18,right:-27};
  const L=w.SculptLive={isLive:()=>true,isConnected:()=>true,isWritable:()=>status.writable,snapshot:()=>status,hasValue:p=>values.has(p),value:p=>values.get(p),metadata:p=>({path:p,readOnly:false,...(p.endsWith('/src')?{items:[{value:'MAIN.1',label:'MAIN 1'}]}:{})}),meter:id=>id==='ch-1'?meter:null,subscribe:fn=>{events.add(fn);return()=>events.delete(fn);},openExplorer:p=>explorer.push(p),open:()=>{},allowMacro:()=>true,settled:async()=>{},ensureProcessor:async()=>{},loadScope(scope,args){return new Promise(resolve=>pending.push({scope,args,resolve(){
    const capture=w.SculptWingMap.capture(state);for(const [p,v]of capture)values.set(p,v);
    const initial={'/dca/1/name':'LIVE DCA','/dca/1/fdr':-7,'/cfg/mon/1/lim':-4,'/io/in/OSC/1/osc/f':777};
    for(const [p,v]of Object.entries(initial)){values.set(p,v);w.SculptWingMap.apply(state,p,v);}resolve();
  }}));}};
  const button=(name,scope=w.document)=>[...scope.querySelectorAll('button')].find(b=>b.textContent===name);
  return {dom,w,state,C,L,status,values,pending,ticks,events,explorer,toasts,button,setMeter:m=>{meter=m;},emit:()=>{for(const cb of listeners)cb({type:'live-values'});},finish:async()=>{assert(pending.length);pending.shift().resolve();await settle();}};
}
test('connected meter bridge uses real stereo values and clears stale data without simulated GR/RTA',()=>{
  const f=uiFixture();f.w.SculptUI.open('meters');const first=f.w.document.querySelector('.sys-meter-strip');
  assert.equal(first.querySelector('.sys-meter-value').textContent,'-18.0');assert.equal(first.querySelectorAll('.sys-meter-bar')[0].style.getPropertyValue('--sys-meter'),'70%');assert.equal(first.querySelectorAll('.sys-meter-bar')[1].style.getPropertyValue('--sys-meter'),'55.00000000000001%');assert(first.querySelector('.sys-gr').hidden);
  f.setMeter(null);for(const tick of f.ticks.values())tick();assert.equal(first.querySelector('.sys-meter-value').textContent,'—');assert.equal(first.querySelector('.sys-meter-bar').style.getPropertyValue('--sys-meter'),'0%');
  f.button('RTA').click();assert.equal(f.w.document.querySelector('.sys-rta-screen'),null);assert.match(f.w.document.querySelector('.desk-page-body').textContent,/streaming RTA non è attivo/);f.dom.window.close();
});
test('group pages await hydration and synchronize external values without replacing a focused field',async()=>{
  const f=uiFixture();f.w.SculptUI.open('groups');assert.equal(f.w.document.querySelector('.sys-dca-bank'),null);assert.equal(f.pending[0].scope,'groups');await f.finish();
  const input=f.w.document.querySelector('[aria-label="Livello DCA 1 in dB"]');assert.equal(input.value,'-7');input.focus();input.value='-12.4';f.values.set('/dca/1/fdr',-2);f.emit();assert.equal(f.w.document.querySelector('[aria-label="Livello DCA 1 in dB"]'),input);assert.equal(input.value,'-12.4');f.dom.window.close();
});
test('oscillators wait for native values and show only real source routing controls',async()=>{
  const f=uiFixture();f.w.SculptUI.open('meters');f.button('Oscillatori').click();assert.match(f.w.document.querySelector('.desk-page-body').textContent,/Lettura degli oscillatori/);assert.equal(f.pending[0].scope,'monitor');await f.finish();
  const frequency=f.w.document.querySelector('[aria-label="Frequenza OSC 1 in Hz"]');assert.equal(frequency.value,'777');assert(![...f.w.document.querySelectorAll('button')].some(b=>/^Destinazioni ·/.test(b.textContent)));assert(f.button('Routing sorgente OSC'));f.dom.window.close();
});
test('runMacro requires the live guard and does not execute denied actions',async()=>{
  const f=uiFixture();f.L.allowMacro=()=>false;const before=f.state.desk.talkback.a.on,result=await f.w.SculptSystems.runMacro(1);assert.equal(result.ok,false);assert.equal(f.state.desk.talkback.a.on,before);assert.equal(f.pending.length,0);f.dom.window.close();
});
