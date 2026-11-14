'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('../native/node_modules/jsdom');
const base = path.join(__dirname, '../dist');
const plain = value => JSON.parse(JSON.stringify(value));
const pause = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate, label) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { if (predicate()) return; await pause(); }
  throw new Error('Timeout: ' + label);
}

class FixtureWing {
  constructor({ links = {}, missingMetadata = [] } = {}) {
    this.values = new Map(); this.meta = new Map(); this.writes = []; this.reads = [];
    this.handlers = { value: new Set(), status: new Set(), schema: new Set(), meters: new Set() };
    this.links = links;
    this.field('/io/altsw', 0, 4, { min: 0, max: 1 });
    for (const [kind, count] of [['ch',40],['aux',8],['bus',16],['main',4],['mtx',8]]) for (let n = 1; n <= count; n++) {
      const p = `/${kind}/${n}`, id = `${kind}-${n}`, source = links[id] || (kind === 'aux' ? 'AUX:' + n : n <= 24 ? 'LCL:' + n : 'A:' + n);
      this.field(p + '/fdr', -13, 3, { min: -144, max: 10 }); this.field(p + '/mute', 0, 4, { min: 0, max: 1 });
      this.field(p + '/pan', 17, 1, { min: -100, max: 100 });
      this.field(p + '/name', `${kind.toUpperCase()} ${n}`, 7, { maxLength: 16 });
      this.field(p + '/$name', links[id] ? 'Mic condiviso' : `${kind.toUpperCase()} ${n}`, 7, { readOnly: true, maxLength: 16 });
      this.field(p + '/col', 9, 4, { min: 0, max: 18 }); this.field(p + '/$col', 9, 4, { readOnly: true });
      if (!['ch','aux'].includes(kind)) continue;
      this.field(p + '/clink', links[id] ? 1 : 0, 4, { min: 0, max: 1 });
      if (kind === 'ch') this.field(p + '/ptap', 'PFL', 5, { items: ['PFL','AFL'].map(value => ({value})) });
      const [group, index] = source.split(':');
      for (const [suffix, value, type] of [['grp',group,5],['in',Number(index),4],['altgrp','CRD',5],['altin',3,4]]) this.field(p + '/in/conn/' + suffix, value, type);
      this.field(p + '/in/set/altsrc', 0, 4); this.field(p + '/in/set/srcauto', 0, 4);
      const sp = '/io/in/' + source.replace(':','/');
      this.field(sp + '/name', links[id] ? 'Mic condiviso' : source, 7, { maxLength: 16 });
      this.field(sp + '/col', 9, 4, { min: 0, max: 18 }); this.field(sp + '/g', 31, 1); this.field(sp + '/vph', 1, 4);
      for (let bus = 1; bus <= 3; bus++) {
        const send = p + '/send/' + bus;
        this.field(send + '/lvl', -19, 3, { min: -144, max: 10 }); this.field(send + '/on', 0, 4, { min: 0, max: 1 });
        this.field(send + '/mode', 'POST', 5, { items: ['PRE','POST','GRP'].map(value => ({value})) });
        this.field(send + '/pon', 1, 4, { min: 0, max: 1 }); this.field(send + '/pan', -20, 1); this.field(send + '/plink', 0, 4);
      }
    }
    for(let n=1;n<=16;n++){
      const p='/dca/'+n;this.field(p+'/name','DCA '+n,7,{maxLength:8});this.field(p+'/fdr',0,3,{min:-144,max:10});this.field(p+'/mute',0,4,{min:0,max:1});
    }
    for(const p of missingMetadata)this.meta.delete(p);
  }
  field(path, value, type, extra = {}) { this.values.set(path,value); this.meta.set(path,{path,name:path.split('/').at(-1),type,revision:1,readOnly:false,...extra}); }
  listen(kind, fn) { this.handlers[kind].add(fn); return () => this.handlers[kind].delete(fn); }
  onValue(fn) { return this.listen('value',fn); } onStatus(fn) { return this.listen('status',fn); }
  onSchemaChange(fn) { return this.listen('schema',fn); } onStripMeters(fn) { return this.listen('meters',fn); }
  emit(kind, ...args) { for (const fn of this.handlers[kind]) fn(...args); }
  async connect() { return { name:'Scene fixture', model:'WING-RACK', firmware:'test', host:'192.168.1.10' }; }
  async disconnect() { this.emit('status','disconnected'); } async subscribeStripMeters() {}
  async describe(p) { if(this.meta.has(p)) return this.meta.get(p); if([...this.meta.keys()].some(key=>key.startsWith(p+'/'))) return {path:p,type:0,revision:1}; throw new Error('Unknown node '+p); }
  async list(p) { const result=new Map(); for(const [key,meta] of this.meta){ if(!key.startsWith(p+'/'))continue; const rest=key.slice(p.length+1),child=p+'/'+rest.split('/')[0]; if(!result.has(child))result.set(child,rest.includes('/')?{path:child,type:0,revision:1}:meta); } return [...result.values()]; }
  async readTree(p) { this.reads.push(p); if(this.readHook)await this.readHook(p); const own=await this.describe(p); if(own.type!==0)return {[p]:await this.get(p)}; return Object.fromEntries((await this.list(p)).filter(item=>item.type!==0).map(item=>[item.path,this.values.get(item.path)])); }
  async get(p) { if(!this.values.has(p))throw new Error('Unknown value '+p); return this.values.get(p); }
  async set(p,value) {
    this.writes.push({path:p,value}); if(this.setHook)await this.setHook(p,value);
    if(this.rejectPath===p){ this.rejectPath=null; throw new Error('Fixture mixer lock'); }
    const actual=this.quantize?this.quantize(p,value):value;
    this.values.set(p,actual); this.emit('value',p,actual);
    const source = /^\/io\/in\/([^/]+)\/(\d+)\/(name|col)$/.exec(p);
    if(source)for(const [id,linked]of Object.entries(this.links))if(linked===source[1]+':'+source[2]){
      const effective='/'+id.replace('-','/')+'/$'+source[3];this.values.set(effective,value);this.emit('value',effective,value);
    }
  }
}

async function fixture(t, options) {
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}}); w.ResizeObserver=class{observe(){}disconnect(){}};
  w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};
  w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.setPointerCapture=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const run=file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  for(const file of ['plugin-data.js','model.js','history.js'])run(file);
  const driver=new FixtureWing(options); w.SculptNative={available:true,platform:'macos',driver};
  for(const file of ['app.js','desk.js','shell.js','editor.js','wing-map.js','live-session.js','live.js','channel-list.js','channel-list-scene.js','channel-list-preview.js'])run(file);
  const C=w.SculptController,L=w.SculptLive,U=w.SculptUI,S=w.SculptChannelScene;
  t.after(()=>{driver.emit('status','disconnected');dom.window.close();});
  U.open('connection');w.document.querySelector('.live-connect-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>L.isConnected()||L.snapshot().mode==='error','connected');assert.equal(L.isConnected(),true,L.snapshot().error);assert.equal(L.isWritable(),true,'successful sync automatically enables Controllo');assert.equal(driver.writes.length,0,'automatic Controllo never replays the demo');U.close();C.clearHistory();
  const control=value=>{if(L.isWritable()!==value){U.open('connection');w.document.querySelector('.live-arm').click();U.close();}assert.equal(L.isWritable(),value);};
  const arm=()=>control(true),disarm=()=>control(false);
  const draft=text=>S.prepareDraft(w.SculptChannelList.parseText(text),C.getState());
  const env={controller:C,model:w.SculptModel,map:w.SculptWingMap,live:L};
  return {w,C,L,U,S,driver,arm,disarm,draft,env};
}

test('live PDF scene applies only its previewed fields through the real Session and reports readback',async t=>{
  const f=await fixture(t);f.arm();const before=plain(f.C.capture()),progress=[];
  const result=await f.S.applyDraftLive(f.draft('1 Kick\n2 Bass'),f.env,{onProgress:p=>progress.push(p)});
  assert.equal(result.ok,true,result.message); assert.equal(result.live,true); assert(result.confirmed>0);assert.equal(f.L.snapshot().pending,0);
  assert.equal(f.driver.values.get('/ch/1/name'),'Kick'); assert.equal(f.driver.values.get('/ch/2/name'),'Bass');
  assert.equal(f.driver.values.get('/ch/1/mute'),1);assert.equal(f.driver.values.get('/ch/1/fdr'),-144);
  assert.equal(f.driver.values.get('/ch/1/send/1/lvl'),-5);assert.equal(f.driver.values.get('/ch/1/send/2/lvl'),-8);
  assert.equal(f.driver.values.get('/ch/1/send/1/mode'),'PRE');assert.equal(f.driver.values.get('/ch/1/send/1/pon'),0);
  assert.equal(f.C.getSend('ch-1','bus-1').pan,-20,'read existing send pan rather than replacing it with preview defaults');
  assert.equal(f.C.getStrip('ch-1').pan,before.values['ch-1'].pan);
  assert(f.driver.writes.every(write=>/^\/(?:ch|bus)\/[12]\/(?:name|col|fdr|mute|send\/[12]\/(?:lvl|on|mode|pon))$/.test(write.path)),JSON.stringify(f.driver.writes));
  assert.equal(f.driver.values.get('/io/in/LCL/1/g'),31);assert.equal(f.driver.values.get('/io/in/LCL/1/vph'),1);
  assert(progress.some(p=>p.phase==='read'));assert(progress.some(p=>p.phase==='write'));
  assert.equal(f.C.historyState().undoCount,1,'the scene is one history operation');
  const undo=await f.C.undo();assert.equal(undo.ok,true,undo.reason);assert.equal(f.driver.values.get('/ch/1/name'),'CH 1');
});

test('read-only or failed preflight sends nothing, and a replacement session is never used',async t=>{
  const f=await fixture(t),proposal=f.draft('1 Kick');
  f.disarm();
  const readonly=await f.S.applyDraftLive(proposal,f.env);assert.equal(readonly.ok,false);assert.match(readonly.message,/Controllo/);assert.equal(f.driver.writes.length,0);
  f.arm();f.driver.readHook=async p=>{if(p==='/ch/1/send/1')f.driver.emit('status','suspended','test');};
  const lost=await f.S.applyDraftLive(proposal,f.env);assert.equal(lost.ok,false);assert.match(lost.message,/sessione/);assert.equal(f.driver.writes.length,0);
});

test('unavailable firmware fields prevent every scene write instead of allowing a partial preflight',async t=>{
  const f=await fixture(t);f.arm();f.driver.meta.get('/ch/1/send/1/pon').readOnly=true;
  const result=await f.S.applyDraftLive(f.draft('1 Kick'),f.env);
  assert.equal(result.ok,false);assert.match(result.message,/non dichiara modificabile/);assert.equal(f.driver.writes.length,0);
});

test('source-linked identity changes detect unselected or conflicting shared channels before transmission',async t=>{
  const f=await fixture(t,{links:{'ch-1':'LCL:1','ch-2':'LCL:1'}});f.arm();
  const outside=await f.S.applyDraftLive(f.draft('1 Kick'),f.env);assert.equal(outside.ok,false);assert.match(outside.message,/CH 2.*sorgente condivisa/);assert.equal(f.driver.writes.length,0);
  const conflict=await f.S.applyDraftLive(f.draft('1 Kick\n2 Bass'),f.env);assert.equal(conflict.ok,false);assert.match(conflict.message,/condivide la sorgente/);assert.equal(f.driver.writes.length,0);
});

test('unknown CLINK on a selected or potentially shared channel blocks identity writes',async t=>{
  for(const missing of ['/ch/1/clink','/ch/2/clink']){
    const f=await fixture(t,{links:{'ch-1':'LCL:1','ch-2':'LCL:1'},missingMetadata:[missing]});f.arm();
    const result=await f.S.applyDraftLive(f.draft('1 Kick'),f.env);
    assert.equal(result.ok,false);assert.match(result.message,/CLINK non letto/);assert.equal(f.driver.writes.length,0);
    assert.equal(f.driver.values.get('/ch/1/$name'),'Mic condiviso');
  }
});

test('preview fields equal to unknown local defaults cannot bypass complete preflight or its no-op branch',async t=>{
  const f=await fixture(t,{missingMetadata:['/ch/1/mute']});f.arm();f.driver.values.set('/ch/1/mute',1);
  for(const unchanged of [false,true]){
    const proposal=f.draft('1 Kick'),row=proposal.rows[0],strip=f.C.getStrip('ch-1');row.mute=strip.mute;
    if(unchanged){Object.assign(row,{name:strip.name,color:strip.color,level:strip.level,primaryBusId:'',secondaryPrimaryBusId:'',sends:{}});proposal.monitors=[];}
    const result=await f.S.applyDraftLive(proposal,f.env);
    assert.equal(result.ok,false);assert.match(result.message,/non ha confermato \/ch\/1\/mute/);assert.equal(f.driver.writes.length,0);assert.equal(f.driver.values.get('/ch/1/mute'),1);
  }
});

test('matching shared source identities are applied once while CLINK, preamp and routing are preserved',async t=>{
  const f=await fixture(t,{links:{'ch-1':'LCL:1','ch-2':'LCL:1'}});f.arm();
  const proposal=f.draft('1 Voce\n2 Voce');
  const result=await f.S.applyDraftLive(proposal,f.env);assert.equal(result.ok,true,result.message);
  assert.equal(f.driver.writes.filter(write=>write.path==='/io/in/LCL/1/name').length,1);
  assert.equal(f.driver.values.get('/io/in/LCL/1/name'),'Voce');assert.equal(f.C.getStrip('ch-2').name,'Voce');
  assert(!f.driver.writes.some(write=>/clink|\/in\/conn|\/g$|vph/.test(write.path)));
  assert(!f.driver.reads.includes('/io'),'source identity does not read the entire I/O tree');
});

test('incomplete linked-source routing and unassigned identities stop before every scene write',async t=>{
  const f=await fixture(t,{links:{'ch-1':'LCL:1'}});f.arm();
  f.driver.meta.delete('/ch/1/in/conn/in');f.driver.values.delete('/ch/1/in/conn/in');
  const result=await f.S.applyDraftLive(f.draft('1 Kick'),f.env);
  assert.equal(result.ok,false);assert.match(result.message,/sorgente incompleta/);assert.equal(f.driver.writes.length,0);
});

test('readback accepts the console documented numeric step and keeps its actual quantized value',async t=>{
  const f=await fixture(t);f.arm();const proposal=f.draft('1 Kick');proposal.rows[0].level=-12.1;
  Object.assign(f.driver.meta.get('/ch/1/fdr'),{type:1,min:-90,max:10,steps:401});
  await f.L.readNode('/ch/1',{force:true});
  f.driver.quantize=(p,value)=>p==='/ch/1/fdr'?Math.round(value*4)/4:value;
  const result=await f.S.applyDraftLive(proposal,f.env);
  assert.equal(result.ok,true,result.message);assert.equal(result.confirmed,result.total);
  assert.equal(f.C.getStrip('ch-1').level,-12,'the UI retains the value read back from the mixer');
});

test('a mixer rejection is reported as partial and the real confirmed values replace the proposed values',async t=>{
  const f=await fixture(t);f.arm();f.driver.rejectPath='/ch/1/name';
  const result=await f.S.applyDraftLive(f.draft('1 Kick'),f.env);
  assert.equal(result.ok,false);assert.equal(result.partial,true);assert(result.confirmed<result.total);assert.match(result.message,/non completata/);
  assert.equal(f.C.getStrip('ch-1').name,'CH 1');assert.equal(f.L.snapshot().pending,0);
});

test('actual PDF preview follows automatic Controllo and explicit readonly / manual re-arm',async t=>{
  const f=await fixture(t),w=f.w;
  w.SculptPdfReader={readFile:async()=>({pages:[{items:[{text:'1 Kick',x:10,y:10,width:80,height:10},{text:'2 Bass',x:10,y:28,width:80,height:10}]}]})};
  w.SculptChannelPreview.open();
  const file=w.document.querySelector('.cl-file');Object.defineProperty(file,'files',{value:[new w.File(['fixture'],'rider.pdf',{type:'application/pdf'})]});file.dispatchEvent(new w.Event('change',{bubbles:true}));
  await until(()=>w.document.querySelectorAll('.cl-channels-table tr[data-row-id]').length===2,'PDF preview');
  const apply=w.document.querySelector('.cl-apply');assert.equal(apply.disabled,false,'automatic Controllo enables a ready live preview');
  f.disarm();assert.equal(apply.disabled,true);assert.equal(f.driver.writes.length,0);
  f.arm();assert.equal(apply.disabled,false);
  apply.click();assert.equal(apply.disabled,true);
  await until(()=>!w.document.querySelector('.cl-modal'),'live apply completes and closes');
  assert.equal(f.driver.values.get('/ch/1/name'),'Kick');assert.equal(f.driver.values.get('/ch/2/name'),'Bass');
});

test('Rinomina reads a linked name even if an unrelated editor processor cannot load',async t=>{
  const f=await fixture(t,{links:{'ch-1':'LCL:1','ch-2':'LCL:1'}});f.arm();const w=f.w;
  w.SculptEditor.openSection('ch-1','eq');
  await until(()=>w.document.querySelector('.editor-live-read')?.dataset.state==='error','unavailable processor blocks full editor');
  assert.equal(w.document.getElementById('editor-channel-name'),null,'the original whole-strip gate cannot show the name');
  w.document.querySelector('[aria-label="Rinomina canale"]').click();
  await until(()=>w.document.querySelector('#editor-live-name')?.disabled===false,'focused linked name read');
  const input=w.document.querySelector('#editor-live-name');assert.equal(input.value,'Mic condiviso');
  input.value='Voce palco';input.closest('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>!w.document.querySelector('#editor-live-name'),'name confirmed');
  assert.deepEqual(plain(f.driver.writes),[{path:'/io/in/LCL/1/name',value:'Voce palco'}]);
  assert.equal(f.C.getStrip('ch-1').name,'Voce palco');assert.equal(f.C.getStrip('ch-2').name,'Voce palco');
  assert.equal(f.driver.values.get('/ch/1/clink'),1);assert.equal(f.driver.values.get('/io/in/LCL/1/g'),31);assert.equal(f.driver.values.get('/io/in/LCL/1/vph'),1);
  assert(!f.driver.reads.includes('/io'),'rename does not read the entire I/O tree');
});

test('Rinomina follows global AUTO to the active ALT source without needing the inactive source',async t=>{
  const f=await fixture(t,{links:{'ch-1':'LCL:1'}});f.arm();const w=f.w;
  f.driver.values.set('/io/altsw',1);f.driver.values.set('/ch/1/in/set/srcauto',1);
  f.driver.field('/io/in/CRD/3/name','Playback ALT',7,{maxLength:16});f.driver.field('/io/in/CRD/3/col',9,4);
  for(const p of [...f.driver.meta.keys()])if(p.startsWith('/io/in/LCL/1/')){f.driver.meta.delete(p);f.driver.values.delete(p);}
  w.SculptEditor.open('ch-1');w.document.querySelector('[aria-label="Rinomina canale"]').click();
  await until(()=>w.document.querySelector('#editor-live-name')?.disabled===false,'active ALT identity');
  const input=w.document.querySelector('#editor-live-name');assert.equal(input.value,'Playback ALT');
  input.value='Cori registrati';input.closest('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>!w.document.querySelector('#editor-live-name'),'ALT name confirmed');
  assert.deepEqual(plain(f.driver.writes),[{path:'/io/in/CRD/3/name',value:'Cori registrati'}]);
  assert.equal(f.driver.values.get('/ch/1/in/conn/grp'),'LCL');assert.equal(f.driver.values.get('/ch/1/in/conn/altgrp'),'CRD');
  assert(f.driver.reads.includes('/io/altsw'));assert(f.driver.reads.includes('/io/in/CRD/3/name'));assert(!f.driver.reads.includes('/io'));
});

test('Rinomina keeps the confirmed value on mixer refusal and cannot write after disconnection',async t=>{
  const f=await fixture(t);f.arm();const w=f.w;
  w.SculptEditor.open('ch-1');w.document.querySelector('[aria-label="Rinomina canale"]').click();
  await until(()=>w.document.querySelector('#editor-live-name')?.disabled===false,'local channel identity');
  const input=w.document.querySelector('#editor-live-name'),form=input.closest('form');f.driver.rejectPath='/ch/1/name';
  input.value='Denied';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>f.L.snapshot().failureVersion>0&&!input.disabled,'rejected rename readback');
  assert.equal(input.value,'CH 1');assert.equal(f.C.getStrip('ch-1').name,'CH 1');assert.match(form.textContent,/Fixture mixer lock/);
  const count=f.driver.writes.length;f.driver.emit('status','suspended','test');
  input.value='Stale';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(input.disabled,true);assert.equal(f.driver.writes.length,count);
});
