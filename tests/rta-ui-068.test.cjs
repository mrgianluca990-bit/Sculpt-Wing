'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../native/node_modules/jsdom');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(t,mode='live'){
  const dom=new JSDOM('<!doctype html><main><div id="a"></div><div id="b"></div><svg id="eq" viewBox="0 0 640 190"><path class="fx-plot-fill"/><path class="fx-plot-line"/></svg></main>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  let status={status:mode==='live'?'waiting':'offline'},connection={mode,writable:false};const requests=[],rta=new Set(),state=new Set();let intervalCount=0;
  w.setInterval=()=>{intervalCount++;return 1;};w.clearInterval=()=>{};
  w.SculptController={getStrip:id=>({id,kind:'CH',number:Number(id.split('-')[1]),name:id==='ch-1'?'Voce':'Chitarra'})};
  w.SculptLive={snapshot:()=>connection,sessionToken:()=>1,rtaState:()=>status,setRtaRequest:async request=>{requests.push(request);},onRta:fn=>{rta.add(fn);return()=>rta.delete(fn);},subscribe:fn=>{state.add(fn);return()=>state.delete(fn);}};
  w.eval(fs.readFileSync(path.join(__dirname,'../dist/rta.js'),'utf8'));
  t.after(()=>dom.window.close());
  return {w,requests,rta,state,get intervalCount(){return intervalCount;},emit(value){status=value;for(const fn of rta)fn(value);},connection(value){connection=value;for(const fn of state)fn(value);},frame(extra={}){return {status:'live',sourceId:'ch-1',sourceLabel:'CH.1',mappingVerified:true,requestedId:'ch-1',requestedTap:'PREEQ',tap:'PREEQ',followConsole:false,receivedAt:Date.now(),binsRaw:Array.from({length:120},(_,i)=>-22000+i*40),...extra};}};
}

test('offline RTA draws no spectrum and starts no animation timer',async t=>{
  const f=fixture(t,'demo'),a=f.w.document.getElementById('a');const cleanup=f.w.SculptRTA.mount(a,{sourceId:'ch-1'});await tick();
  assert.equal(a.querySelector('.sculpt-rta-trace').getAttribute('d'),'');assert.match(a.textContent,/Collega WING/);assert.equal(f.intervalCount,0);assert.equal(f.requests.filter(Boolean).length,0);
  assert.equal(f.w.SculptRTA.spectrumPath(Array(120).fill(-32768)),'');assert.equal(f.w.SculptRTA.spectrumPath([NaN]),'');cleanup();await tick();
});

test('global RTA displays received bands with an honest numeric source, then clears on suspension',async t=>{
  const f=fixture(t),a=f.w.document.getElementById('a'),cleanup=f.w.SculptRTA.mount(a,{followConsole:true,selectSource:true});await tick();
  assert.equal(f.requests.at(-1).followConsole,true);
  f.emit(f.frame({sourceId:null,sourceLabel:'Sorgente WING #5',mappingVerified:false,requestedId:null,requestedTap:null,followConsole:true,tap:'IN',sources:[]}));await pause(110);
  assert.ok(a.querySelector('.sculpt-rta-trace').getAttribute('d').length>100);assert.match(a.textContent,/Sorgente WING #5/);assert.match(a.textContent,/scala relativa/);assert.equal(a.querySelector('.sculpt-rta-source-select').options.length,1);
  f.emit({status:'disconnected'});f.connection({mode:'suspended',writable:false});await tick();assert.equal(f.requests.at(-1),null);assert.equal(a.querySelector('.sculpt-rta-trace').getAttribute('d'),'');
  cleanup();await tick();assert.equal(f.rta.size,0);assert.equal(f.state.size,0);
});

test('EQ underlay requires verified matching metadata and closes the old source on channel change or hidden window',async t=>{
  const f=fixture(t),a=f.w.document.getElementById('a'),b=f.w.document.getElementById('b'),eq=f.w.document.getElementById('eq');
  const opened=[];f.w.SculptUI={open:(id,args)=>opened.push({id,tab:args.tab})};
  const first=f.w.SculptRTA.mount(a,{sourceId:'ch-1',overlay:eq,compact:true});await tick();
  f.emit(f.frame({sourceId:null,mappingVerified:false,status:'unmapped',sourceLabel:'Sorgente WING #1',binsRaw:null}));await pause(110);
  assert.equal(eq.querySelector('.sculpt-rta-trace').getAttribute('d'),'');assert.equal(a.querySelector('.sculpt-rta-bank').hidden,false);
  a.querySelector('.sculpt-rta-bank').click();assert.deepEqual(opened,[{id:'meters',tab:'rta'}]);
  f.emit(f.frame());await pause(110);assert.ok(eq.querySelector('.sculpt-rta-trace').getAttribute('d'));assert.equal(eq.querySelector('.sculpt-rta-spectrum').getAttribute('pointer-events'),'none');
  first();const second=f.w.SculptRTA.mount(b,{sourceId:'ch-2',overlay:eq,compact:true});await tick();assert.equal(f.requests.at(-1).id,'ch-2');assert.equal(eq.querySelector('.sculpt-rta-trace').getAttribute('d'),'');
  f.emit(f.frame());await pause(110);assert.equal(eq.querySelector('.sculpt-rta-trace').getAttribute('d'),'');
  f.emit(f.frame({sourceId:'ch-2',sourceLabel:'CH.2',requestedId:'ch-2'}));await pause(110);assert.ok(eq.querySelector('.sculpt-rta-trace').getAttribute('d'));
  Object.defineProperty(f.w.document,'visibilityState',{value:'hidden',configurable:true});f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));await tick();assert.equal(f.requests.at(-1),null);assert.equal(eq.querySelector('.sculpt-rta-trace').getAttribute('d'),'');
  second();await tick();assert.equal(eq.querySelectorAll('.sculpt-rta-spectrum').length,0);assert.equal(f.intervalCount,0);
});

test('resizing an EQ redraws the current RTA in its new bounds without claiming the source again',async t=>{
  const f=fixture(t),a=f.w.document.getElementById('a'),eq=f.w.document.getElementById('eq');let resized,disconnected=false;
  f.w.ResizeObserver=class{constructor(callback){resized=callback;}observe(node){assert.equal(node,eq);}disconnect(){disconnected=true;}};
  let region={left:36,top:16,width:584,height:138};const cleanup=f.w.SculptRTA.mount(a,{sourceId:'ch-1',overlay:eq,region:()=>region});await tick();
  f.emit(f.frame());await pause(110);const trace=eq.querySelector('.sculpt-rta-trace'),before=trace.getAttribute('d'),requests=f.requests.length;
  region={left:50,top:20,width:1000,height:320};resized();await pause(110);
  assert.notEqual(trace.getAttribute('d'),before);assert.match(trace.getAttribute('d'),/L1050\.00,340 L50,340 Z$/);assert.equal(f.requests.length,requests);
  cleanup();await tick();assert.equal(disconnected,true);
});

test('an EQ outside the viewport releases RTA and resumes the same source and tap when visible',async t=>{
  const f=fixture(t),a=f.w.document.getElementById('a'),eq=f.w.document.getElementById('eq');let intersection,disconnected=false;
  f.w.IntersectionObserver=class{constructor(callback){intersection=callback;}observe(node){assert.equal(node,eq);}disconnect(){disconnected=true;}};
  const cleanup=f.w.SculptRTA.mount(a,{sourceId:'ch-1',tap:'PREEQ',overlay:eq});await tick();
  assert.equal(f.requests.length,0,'do not claim a mounted graph before its viewport is known');
  intersection([{target:eq,isIntersecting:false,intersectionRatio:0},{target:eq,isIntersecting:true,intersectionRatio:0.5}]);await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(f.requests.at(-1))),{id:'ch-1',tap:'PREEQ'});
  f.emit(f.frame());await pause(110);assert.ok(eq.querySelector('.sculpt-rta-trace').getAttribute('d'));
  intersection([{target:eq,isIntersecting:false,intersectionRatio:0}]);await tick();
  assert.equal(f.requests.at(-1),null);assert.equal(eq.querySelector('.sculpt-rta-trace').getAttribute('d'),'');
  f.emit({status:'inactive'});
  intersection([{target:eq,isIntersecting:true,intersectionRatio:1}]);await tick();
  assert.equal(f.requests.length,3);assert.deepEqual(JSON.parse(JSON.stringify(f.requests.at(-1))),{id:'ch-1',tap:'PREEQ'});assert.equal(eq.querySelector('.sculpt-rta-trace').getAttribute('d'),'');
  cleanup();await tick();assert.equal(disconnected,true);
});
