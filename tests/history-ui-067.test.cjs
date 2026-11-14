'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),base=path.join(__dirname,'../dist');
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,{desktop=false,systems=false}={}){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window,listeners={},textCalls=[];
  t.after(()=>w.close());w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>0;
  w.HTMLElement.prototype.scrollTo=function({left=0}){this.scrollLeft=left;};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  if(desktop)w.SculptDesktop={addListener:async(name,callback)=>{listeners[name]=callback;return {remove:async()=>{}};},textHistory:async direction=>textCalls.push(direction)};
  for(const file of ['plugin-data.js','model.js','history.js','app.js','desk.js','shell.js','dca-bank.js',...(systems?['osc.js','systems.js']:[])])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  const C=w.SculptController,D=w.SculptDesk;
  const key=(target,options={})=>{const event=new w.KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true,...options});target.dispatchEvent(event);return event;};
  return {w,C,D,key,listeners,textCalls};
}
test('Cmd+Z and Shift+Cmd+Z restore the mixer while text fields retain native undo',async t=>{
  const f=fixture(t),strip=f.C.getStrip('ch-1'),before=strip.level,other=JSON.stringify(f.C.getStrip('ch-2'));
  f.C.updateStrip('ch-1',{level:-1});const event=f.key(f.w.document.body);assert.equal(event.defaultPrevented,true);await nextTurn();assert.equal(strip.level,before);
  f.key(f.w.document.body,{shiftKey:true});await nextTurn();assert.equal(strip.level,-1);assert.equal(JSON.stringify(f.C.getStrip('ch-2')),other);
  const input=f.w.document.createElement('input');input.value='Voce';f.w.document.body.append(input);input.focus();
  assert.equal(f.key(input).defaultPrevented,false);await nextTurn();assert.equal(strip.level,-1);
  const range=f.w.document.createElement('input');range.type='range';f.w.document.body.append(range);range.focus();assert.equal(f.key(range).defaultPrevented,true);await nextTurn();assert.equal(strip.level,before);
});
test('the Mac menu routes undo to the mixer or to text editing according to focus',async t=>{
  const f=fixture(t,{desktop:true}),before=f.C.getStrip('ch-1').level;
  f.C.updateStrip('ch-1',{level:-2});f.listeners.history('undo');await nextTurn();assert.equal(f.C.getStrip('ch-1').level,before);
  const input=f.w.document.createElement('input');f.w.document.body.append(input);input.focus();f.listeners.history('redo');await nextTurn();assert.deepEqual(f.textCalls,['redo']);assert.equal(f.C.getStrip('ch-1').level,before);
  f.listeners.history('invalid');assert.deepEqual(f.textCalls,['redo']);
});
test('DCA and send gestures undo as single operations without modifying input routing',async t=>{
  const f=fixture(t),routing=JSON.stringify(f.D.get().channels),before=f.D.get().dca[1].level,strip=f.C.getStrip('ch-7').level;
  f.C.beginGesture('DCA batteria');for(const level of [-1,-2,-3])f.D.change(d=>d.dca[1].level=level,'dca',{id:'dca-2',paths:[['desk','dca',1]]});f.C.endGesture();
  assert.equal(f.C.historyState().undoCount,1);assert.equal((await f.C.undo()).ok,true);assert.equal(f.D.get().dca[1].level,before);assert.equal(f.C.getStrip('ch-7').level,strip);
  const send=JSON.stringify(f.C.getSend('ch-7','bus-2'));f.C.beginGesture('Mandata');for(const level of [-10,-9,-8])f.C.setSend('ch-7','bus-2',{level});f.C.endGesture();
  assert.equal((await f.C.undo()).ok,true);assert.equal(JSON.stringify(f.C.getSend('ch-7','bus-2')),send);assert.equal(JSON.stringify(f.D.get().channels),routing);
});
test('initial demo content is not an undoable user action and saves are combined',t=>{
  const f=fixture(t,{systems:true});assert.equal(f.C.historyState().undoCount,0);f.C.flushSave();
  const calls=[],original=f.w.Storage.prototype.setItem;f.w.Storage.prototype.setItem=function(key,value){calls.push([key,value]);return original.call(this,key,value);};
  f.C.beginGesture('Fader');for(let n=0;n<120;n++)f.C.updateStrip('ch-1',{level:-30+n/10});f.C.endGesture();
  assert.equal(calls.filter(([key])=>key===f.w.SculptModel.KEY).length,0);f.C.flushSave();assert.equal(calls.filter(([key])=>key===f.w.SculptModel.KEY).length,1);
  assert.equal(f.C.historyState().undoCount,1);assert.equal(JSON.parse(f.w.localStorage.getItem(f.w.SculptModel.KEY)).values['ch-1'].level,-18.1);
});
