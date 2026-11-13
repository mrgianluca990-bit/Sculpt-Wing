'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const base=path.join(__dirname,'../dist'),storageKey='sculpt-wing-layers-v1';
function fixture(preferences){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window,observers=[];
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
  w.IntersectionObserver=class{constructor(callback,options){this.callback=callback;this.root=options.root;this.targets=new Set();observers.push(this);}observe(node){this.targets.add(node);}disconnect(){this.targets.clear();}};
  w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};
  w.HTMLElement.prototype.scrollTo=function(options){this.scrollLeft=options?.left||0;};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.setPointerCapture=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  if(preferences)w.localStorage.setItem(storageKey,JSON.stringify(preferences));
  for(const file of ['plugin-data.js','model.js','app.js','desk.js','shell.js','systems.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  return {dom,w,C:w.SculptController,D:w.SculptDesk,observers};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const visible=(w,row)=>[...w.document.querySelectorAll(`#${row}-bank>.strip:not([hidden])`)].map(n=>n.dataset.id);
const button=(scope,label)=>[...scope.querySelectorAll('button')].find(b=>b.textContent===label);

test('custom layer renders two independent ordered banks using existing faders and restores the normal mixer',t=>{
  const {dom,w,C,D,observers}=fixture();t.after(()=>dom.window.close());
  const fader=w.document.querySelector('[data-id="ch-2"] .fader'),strip=C.getStrip('ch-2'),before=plain(C.capture().values);
  D.change(d=>{d.layers=[{id:'mix',name:'Live',rows:{top:['ch-2','bus-4','ch-1'],bottom:['main-1','aux-3']},members:['ch-2','bus-4','ch-1','main-1','aux-3']}];d.activeLayer='mix';});
  assert.deepEqual(visible(w,'outputs'),['ch-2','bus-4','ch-1']);assert.deepEqual(visible(w,'inputs'),['main-1','aux-3']);
  assert.equal(w.document.querySelector('[data-id="ch-2"] .fader'),fader);assert.equal(C.getStrip('ch-2'),strip);
  assert.match(w.document.getElementById('output-title').textContent,/RIGA 1/);assert.match(w.document.getElementById('input-title').textContent,/RIGA 2/);
  assert.equal(w.document.querySelector('.outputs .row-count').textContent,'3');assert.equal(w.document.querySelector('.inputs .row-count').textContent,'2');
  assert.equal(w.document.querySelector('[data-id="ch-2"] .strip-index i').textContent,'IN','moving a channel does not turn it into an output');
  assert.equal(w.document.querySelector('[data-id="main-1"] .strip-index i').textContent,'OUT');
  assert.deepEqual([...observers.find(o=>o.root.id==='outputs-scroll').targets].map(n=>n.dataset.id).sort(),['bus-4','ch-1','ch-2']);
  assert.deepEqual([...observers.find(o=>o.root.id==='inputs-scroll').targets].map(n=>n.dataset.id).sort(),['aux-3','main-1']);
  assert.deepEqual(plain(C.capture().values),before,'laying out strips does not mutate audio state');
  C.setSof('bus-4');const sendBefore=C.getSend('ch-2','bus-4').level;fader.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
  assert.equal(C.getStrip('ch-2').level,before['ch-2'].level,'SOF still routes the moved channel to its send');assert(C.getSend('ch-2','bus-4').level>sendBefore);
  w.document.querySelector('.outputs .layer-exit').click();
  assert.equal(D.get().activeLayer,null);assert.deepEqual(visible(w,'outputs'),Array.from(C.getState().outputs,s=>s.id));assert.deepEqual(visible(w,'inputs'),Array.from(C.getState().inputs,s=>s.id));
  assert.equal(w.document.querySelector('[data-id="ch-2"] .fader'),fader);assert.equal(w.document.querySelector('.outputs .bank-navigation').hidden,false);
  assert.equal(JSON.parse(w.localStorage.getItem(storageKey)).activeLayer,null);
});

test('row editor assigns, reorders and moves channels between rows without duplication',t=>{
  const {dom,w,D}=fixture();t.after(()=>dom.window.close());
  D.change(d=>d.layers=[{id:'edit',name:'Band',rows:{top:['ch-1','ch-2'],bottom:['bus-1']},members:['ch-1','ch-2','bus-1']}]);
  w.SculptUI.open('layers');const page=w.document.getElementById('desk-page-body');button(page,'Modifica le due righe').click();
  let editor=w.document.querySelector('.sys-layer-editor');
  const ch2=[...editor.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Sposta CH 02')&&b.getAttribute('aria-label').endsWith('a sinistra'));assert(ch2);ch2.click();
  assert.deepEqual(plain(D.get().layers[0].rows.top),['ch-2','ch-1']);
  editor=w.document.querySelector('.sys-layer-editor');const transfer=[...editor.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Sposta CH 02')&&b.getAttribute('aria-label').endsWith('riga 2'));transfer.click();
  assert.deepEqual(plain(D.get().layers[0].rows),{top:['ch-1'],bottom:['bus-1','ch-2']});
  editor=w.document.querySelector('.sys-layer-editor');button(editor.querySelector('[data-layer-row="top"]'),'Aggiungi canali').click();
  const membership=w.document.querySelector('.sys-membership'),bus=[...membership.querySelectorAll('input[type=checkbox]')].find(el=>el.getAttribute('aria-label').startsWith('Assegna BUS 01'));
  bus.checked=true;bus.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.deepEqual(plain(D.get().layers[0].rows),{top:['ch-1','bus-1'],bottom:['ch-2']});
  assert.deepEqual(plain(D.get().layers[0].members),['ch-1','bus-1','ch-2']);
  assert.equal(w.document.querySelectorAll('.sys-layer-editor>[data-layer-row]').length,2);
});

test('local layout survives blocked mixer persistence and relaunch; legacy members retain original rows',t=>{
  const first=fixture({version:1,layers:[{id:'legacy',name:'Legacy',members:['ch-4','bus-2','ch-1','main-1']}],activeLayer:'legacy'});t.after(()=>first.dom.window.close());
  assert.deepEqual(visible(first.w,'outputs'),['bus-2','main-1']);assert.deepEqual(visible(first.w,'inputs'),['ch-4','ch-1']);
  first.w.SculptLive={isLive:()=>false,canPersist:()=>false,hasStripValue:()=>true};
  first.D.setLayerRows('legacy',{top:['ch-1','main-1'],bottom:['ch-4','bus-2']});
  const saved=JSON.parse(first.w.localStorage.getItem(storageKey));assert.deepEqual(saved.layers[0].rows,{top:['ch-1','main-1'],bottom:['ch-4','bus-2']});
  const second=fixture(saved);t.after(()=>second.dom.window.close());
  assert.deepEqual(visible(second.w,'outputs'),['ch-1','main-1']);assert.deepEqual(visible(second.w,'inputs'),['ch-4','bus-2']);
  second.D.setLayerRows('legacy',{top:['ch-1'],bottom:[]});
  assert.equal(second.w.document.querySelectorAll('.mixer-row').length,2);assert.equal(second.w.document.querySelector('.inputs .layer-empty').hidden,false);
  second.D.change(d=>{d.layers=[];d.activeLayer=null;});assert.equal(visible(second.w,'outputs').length,28);assert.equal(visible(second.w,'inputs').length,48);
});
