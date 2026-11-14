'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('../native/node_modules/jsdom');
const base=path.join(__dirname,'../dist');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function until(predicate,label){const end=Date.now()+8000;while(Date.now()<end){if(predicate())return;await pause(5);}throw new Error('Timed out: '+label);}

// Native-boundary fixture only: app, Journal, mapping and Session are production
// code. Every attempted driver write and its authoritative readback are observed.
class FixtureWing {
  constructor(catalog){
    this.catalog=catalog;this.values=new Map();this.meta=new Map();this.writes=[];this.handlers={value:new Set(),status:new Set(),schema:new Set(),meters:new Set()};
    this.field=(p,value,type,extra={})=>{this.values.set(p,value);this.meta.set(p,{path:p,name:p.split('/').at(-1),type,revision:1,readOnly:false,...extra});};
    for(const [kind,count]of [['ch',40],['aux',8],['bus',16],['main',4],['mtx',8]])for(let n=1;n<=count;n++){
      const p=`/${kind}/${n}`;this.field(p+'/fdr',-13,3);this.field(p+'/mute',0,4,{min:0,max:1});this.field(p+'/pan',0,1,{min:-100,max:100});this.field(p+'/name',`${kind.toUpperCase()} ${n}`,7,{maxLength:16});this.field(p+'/$name',`${kind.toUpperCase()} ${n}`,7,{readOnly:true,maxLength:16});this.field(p+'/col',9,4,{min:0,max:18});if(['ch','aux'].includes(kind))this.field(p+'/clink',0,4,{min:0,max:1});
    }
    for(let n=1;n<=16;n++){const p=`/dca/${n}`;this.field(p+'/fdr',0,3);this.field(p+'/mute',0,4,{min:0,max:1});this.field(p+'/$solo',0,4,{min:0,max:1});this.field(p+'/name',`DCA ${n}`,7,{maxLength:8});}
    this.field('/fx/1/mdl','VSS3',5,{items:catalog.list({type:'fx',slot:1}).map(m=>({value:m.id,label:m.name}))});this.field('/fx/1/fxmix',100,1,{min:0,max:100});this.setFXParameters('VSS3');
  }
  setFXParameters(model){
    for(const key of [...this.meta.keys()])if(key.startsWith('/fx/1/')&&!['/fx/1/mdl','/fx/1/fxmix'].includes(key)){this.meta.delete(key);this.values.delete(key);}
    for(const param of this.catalog.get({type:'fx',slot:1},model)?.parameters||[])this.field('/fx/1/'+param.sourceKey,param.key==='dcy'?2.7:param.default,param.type==='enum'?5:param.type==='boolean'?4:1,{min:param.min,max:param.max,...(param.type==='enum'?{items:param.options.map(value=>({value,label:value}))}:{})});
  }
  listen(kind,fn){this.handlers[kind].add(fn);return()=>this.handlers[kind].delete(fn);}onValue(fn){return this.listen('value',fn);}onStatus(fn){return this.listen('status',fn);}onSchemaChange(fn){return this.listen('schema',fn);}onStripMeters(fn){return this.listen('meters',fn);}
  emit(kind,...args){for(const fn of this.handlers[kind])fn(...args);}
  async connect(){return {name:'History fixture',model:'WING-RACK',firmware:'3.1.2 test fixture',host:'192.168.1.100'};}
  async disconnect(){this.emit('status','disconnected');}async subscribeStripMeters(){}
  async describe(p){if(this.meta.has(p))return this.meta.get(p);if([...this.meta.keys()].some(key=>key.startsWith(p+'/')))return {path:p,name:p.split('/').at(-1),type:0,revision:1};throw new Error('Unknown fixture node '+p);}
  async list(p){const result=new Map();for(const [key,meta]of this.meta){if(!key.startsWith(p+'/'))continue;const rest=key.slice(p.length+1),first=rest.split('/')[0],child=p+'/'+first;if(!result.has(child))result.set(child,rest.includes('/')?{path:child,name:first,type:0,revision:1}:meta);}return [...result.values()];}
  async readTree(p){const meta=await this.describe(p);if(meta.type!==0)return {[p]:await this.get(p)};const result={};for(const child of await this.list(p))if(child.type!==0)result[child.path]=await this.get(child.path);return result;}
  async get(p){if(!this.values.has(p))throw new Error('Unknown fixture value '+p);return this.values.get(p);}
  async set(p,value){
    this.writes.push({path:p,value});if(this.setHook)await this.setHook(p,value);
    if(this.rejectNext){const error=this.rejectNext;this.rejectNext=null;throw error;}
    this.values.set(p,value);if(p==='/fx/1/mdl')this.setFXParameters(value);this.emit('value',p,value);
  }
  async trigger(p,value){return this.set(p,value);}
}

async function fixture(t){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.setPointerCapture=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const run=file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  for(const file of ['plugin-data.js','model.js','history.js'])run(file);const driver=new FixtureWing(w.SculptCatalog);w.SculptNative={available:true,platform:'macos',driver};
  for(const file of ['app.js','desk.js','shell.js','wing-map.js','live-session.js','live.js'])run(file);
  const C=w.SculptController,D=w.SculptDesk,L=w.SculptLive,U=w.SculptUI;
  t.after(()=>{driver.emit('status','disconnected');dom.window.close();});
  U.open('connection');w.document.querySelector('.live-connect-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>L.isConnected(),'live sync');U.close();C.clearHistory();assert.equal(driver.writes.length,0);
  const arm=value=>{if(L.isWritable()===value)return;U.open('connection');w.document.querySelector('.live-arm').click();U.close();assert.equal(L.isWritable(),value);};
  const up=(id='ch-1')=>w.document.querySelector(`[data-id="${id}"] .fader[role="slider"]`).dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
  const move=async()=>{up();await L.settled();assert.equal(driver.values.get('/ch/1/fdr'),-12.5);assert.equal(C.getStrip('ch-1').level,-12.5);};
  return {w,C,D,L,U,driver,arm,up,move};
}

test('live fader Undo and Redo pass through the real Session and authoritative driver readback',async t=>{
  const f=await fixture(t);f.arm(true);await f.move();assert.equal(f.C.historyState().undoCount,1);
  const undone=await f.C.undo();assert.equal(undone.ok,true);assert.equal(f.driver.values.get('/ch/1/fdr'),-13);assert.equal(f.C.getStrip('ch-1').level,-13);assert.equal(f.C.historyState().redoCount,1);
  const redone=await f.C.redo();assert.equal(redone.ok,true);assert.equal(f.driver.values.get('/ch/1/fdr'),-12.5);assert.equal(f.C.getStrip('ch-1').level,-12.5);assert.deepEqual(f.driver.writes.map(item=>item.value),[-12.5,-13,-12.5]);assert.equal(f.L.snapshot().pending,0);
});

test('read-only fader gestures create no history and read-only Undo cannot write to the mixer',async t=>{
  const f=await fixture(t);f.arm(false);f.up();await f.L.settled();assert.equal(f.C.getStrip('ch-1').level,-13);assert.equal(f.driver.writes.length,0);assert.equal(f.C.historyState().undoCount,0);
  f.arm(true);await f.move();f.arm(false);const count=f.driver.writes.length,result=await f.C.undo();assert.equal(result.ok,false);assert.equal(f.driver.writes.length,count);assert.equal(f.C.getStrip('ch-1').level,-12.5);assert.equal(f.C.historyState().undoCount,1);assert.equal(f.C.historyState().redoCount,0);
});

test('an external WING value update makes a stale Undo fail without replacing the newer level',async t=>{
  const f=await fixture(t);f.arm(true);await f.move();const count=f.driver.writes.length;
  f.driver.values.set('/ch/1/fdr',-5);f.driver.emit('value','/ch/1/fdr',-5);await until(()=>f.C.getStrip('ch-1').level===-5,'external authoritative level');
  const result=await f.C.undo();assert.equal(result.ok,false);assert.match(result.reason,/valore è cambiato/);assert.equal(f.driver.writes.length,count);assert.equal(f.driver.values.get('/ch/1/fdr'),-5);assert.equal(f.C.getStrip('ch-1').level,-5);
});

test('a session epoch change while Undo awaits an in-flight write sends no inverse command',async t=>{
  const f=await fixture(t);f.arm(true);const held=deferred();f.driver.setHook=()=>held.promise;f.up();const pendingUndo=f.C.undo();
  await until(()=>f.driver.writes.length===1,'initial fader request reached driver');const epoch=f.L.sessionToken();assert.equal(f.C.historyState().busy,true);
  f.driver.emit('status','suspended','fixture replacement session');assert.notEqual(f.L.sessionToken(),epoch);held.resolve();const result=await pendingUndo;
  assert.equal(result.ok,false);assert.match(result.reason,/sessione|cronologia/i);assert.deepEqual(f.driver.writes.map(item=>item.value),[-12.5]);assert.equal(f.C.historyState().undoCount,0);assert.equal(f.C.historyState().redoCount,0);
});

test('Undo of a live processor model change is explicitly refused instead of partially restoring parameters',async t=>{
  const f=await fixture(t);f.arm(true);const ctx={type:'fx',slot:1};await f.L.ensureProcessor(ctx);assert.equal(f.D.processor(ctx).model,'VSS3');f.C.clearHistory();
  f.D.setModel(ctx,'NONE');await f.L.settled();assert.equal(f.D.processor(ctx).model,'NONE');assert.equal(f.driver.values.get('/fx/1/mdl'),'NONE');assert.equal(f.C.historyState().undoCount,1);
  const count=f.driver.writes.length,result=await f.C.undo();assert.equal(result.ok,false);assert.match(result.reason,/algoritmo live.*preset/);assert.equal(f.driver.writes.length,count);assert.equal(f.D.processor(ctx).model,'NONE');assert.equal(f.C.historyState().redoCount,0);
});

test('a mixer rejection during Undo restores the authoritative value and does not create Redo',async t=>{
  const f=await fixture(t);f.arm(true);await f.move();f.driver.rejectNext=new Error('Fixture mixer lock');const result=await f.C.undo();
  assert.equal(result.ok,false);assert.match(result.reason,/non ha confermato/);assert.equal(f.driver.values.get('/ch/1/fdr'),-12.5);assert.equal(f.C.getStrip('ch-1').level,-12.5);assert.equal(f.C.historyState().redoCount,0);assert.equal(f.C.historyState().undoCount,1);assert.equal(f.L.snapshot().pending,0);
});
