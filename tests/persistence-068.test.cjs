'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),base=path.join(__dirname,'../dist');
function fixture(t){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window,timers=new Map(),idle=new Map(),writes=[];
  let serial=0,now=0;
  w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>0;
  w.setTimeout=(fn,delay=0)=>{const id=++serial;timers.set(id,{fn,at:now+delay});return id;};w.clearTimeout=id=>timers.delete(id);
  w.requestIdleCallback=(fn,options)=>{const id=++serial;idle.set(id,{fn,options});return id;};w.cancelIdleCallback=id=>idle.delete(id);
  const tick=ms=>{const target=now+ms;for(;;){const task=[...timers].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!task)break;now=task[1].at;timers.delete(task[0]);task[1].fn();}now=target;};
  const runIdle=()=>{const tasks=[...idle.values()];idle.clear();for(const {fn}of tasks)fn({didTimeout:false,timeRemaining:()=>10});};
  for(const file of ['model.js','history.js','app.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  const C=w.SculptController;C.flushSave();
  const set=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key,value){if(key===w.SculptModel.KEY)writes.push(JSON.parse(value));return set.call(this,key,value);};
  t.after(()=>w.close());return {w,C,tick,runIdle,timers,idle,writes};
}
test('rapid changes are saved after the gesture pause without serializing the project between moves',t=>{
  const f=fixture(t);f.C.updateStrip('ch-1',{level:-10});f.tick(110);f.C.updateStrip('ch-1',{level:-20});f.tick(110);
  assert.equal(f.writes.length,0);assert.equal(f.idle.size,0,'the original timeout was replaced');
  f.tick(70);assert.equal(f.idle.size,1);assert.equal(f.writes.length,0);assert.equal([...f.idle.values()][0].options.timeout,1500,'idle save has a bounded timeout');
  f.runIdle();assert.equal(f.writes.length,1);assert.equal(f.writes[0].values['ch-1'].level,-20);
});
test('a new change replaces a pending idle save and pagehide flushes the latest values exactly once',t=>{
  const f=fixture(t);f.C.updateStrip('ch-1',{pan:40});f.tick(180);assert.equal(f.idle.size,1);
  f.C.updateStrip('ch-1',{pan:-25});assert.equal(f.idle.size,0);f.tick(180);assert.equal(f.idle.size,1);
  f.w.dispatchEvent(new f.w.Event('pagehide'));assert.equal(f.writes.length,1);assert.equal(f.writes[0].values['ch-1'].pan,-25);
  f.runIdle();f.tick(5000);assert.equal(f.writes.length,1,'cancelled callbacks cannot save again');
});
test('an idle callback never persists the live mixer snapshot as the offline project',t=>{
  const f=fixture(t);f.C.updateStrip('ch-1',{pan:30});f.tick(180);f.w.SculptLive={canPersist:()=>false};f.runIdle();
  assert.equal(f.writes.length,0);f.C.flushSave();assert.equal(f.writes.length,0);
});
