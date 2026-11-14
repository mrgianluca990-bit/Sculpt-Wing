'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const base=path.join(__dirname,'../dist'),storageKey='sculpt-wing-layers-v1';
function fixture(preferences,withEditor=false,withDca=false){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window,observers=[];
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
  w.IntersectionObserver=class{constructor(callback,options){this.callback=callback;this.root=options.root;this.targets=new Set();observers.push(this);}observe(node){this.targets.add(node);}disconnect(){this.targets.clear();}};
  w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};
  w.HTMLElement.prototype.scrollTo=function(options){this.scrollLeft=options?.left||0;};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.setPointerCapture=function(){};
  const openedDialogs=[];
  w.HTMLDialogElement.prototype.showModal=function(){openedDialogs.push({node:this,modal:true});this.open=true;};w.HTMLDialogElement.prototype.show=function(){openedDialogs.push({node:this,modal:false});this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  if(preferences)w.localStorage.setItem(storageKey,JSON.stringify(preferences));
  for(const file of ['plugin-data.js','model.js','app.js','desk.js','shell.js','systems.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  if(withDca)vm.runInContext(fs.readFileSync(path.join(base,'dca-bank.js'),'utf8'),dom.getInternalVMContext(),{filename:'dca-bank.js'});
  if(withEditor)vm.runInContext(fs.readFileSync(path.join(base,'editor.js'),'utf8'),dom.getInternalVMContext(),{filename:'editor.js'});
  return {dom,w,C:w.SculptController,D:w.SculptDesk,observers,openedDialogs};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const visible=(w,row)=>[...w.document.querySelectorAll(`#${row}-bank>.strip:not([hidden])`)].map(n=>n.dataset.id);
const button=(scope,label)=>[...scope.querySelectorAll('button')].find(b=>b.textContent===label);

test('DCA custom rows restore before the DCA module loads and the editor offers DCA only above',t=>{
  const preferences={version:1,layers:[{id:'band',name:'Band',rows:{top:['dca-2','bus-1','ch-2'],bottom:['dca-4','ch-1','dca-2','dca-17']}}],activeLayer:'band'};
  const {dom,w,D}=fixture(preferences,false,true);t.after(()=>dom.window.close());
  assert.deepEqual(plain(D.get().layers[0].rows),{top:['dca-2','bus-1','ch-2','dca-4'],bottom:['ch-1']});
  assert.deepEqual(visible(w,'outputs'),['dca-2','bus-1','ch-2','dca-4']);assert.deepEqual(visible(w,'inputs'),['ch-1']);
  w.SculptUI.open('layers');const page=w.document.getElementById('desk-page-body');assert.match(page.textContent,/DCA 02/);button(page,'Modifica le due righe').click();
  let editor=w.document.querySelector('.sys-layer-editor'),dcaSlot=editor.querySelector('[data-strip-id="dca-2"]');
  assert.equal(button(dcaSlot,'↓ Riga 2').disabled,true);button(dcaSlot,'→').click();assert.deepEqual(plain(D.get().layers[0].rows.top),['bus-1','dca-2','ch-2','dca-4']);
  editor=w.document.querySelector('.sys-layer-editor');button(editor.querySelector('[data-layer-row="top"]'),'Aggiungi canali').click();
  let membership=w.document.querySelector('.sys-membership'),checks=[...membership.querySelectorAll('input[type=checkbox]')],dca9=checks.find(input=>input.getAttribute('aria-label').startsWith('Assegna DCA 09'));
  assert(dca9);dca9.click();assert(D.get().layers[0].rows.top.includes('dca-9'));membership.closest('dialog').close();
  editor=w.document.querySelector('.sys-layer-editor');button(editor.querySelector('[data-layer-row="bottom"]'),'Aggiungi canali').click();
  membership=w.document.querySelector('.sys-membership');assert.equal([...membership.querySelectorAll('input')].some(input=>input.getAttribute('aria-label')?.startsWith('Assegna DCA')),false);
});

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

test('channel editor occupies the opposite bank without blocking source faders; Escape restores focus and tab order',t=>{
  const {dom,w,C,openedDialogs}=fixture(undefined,true);t.after(()=>dom.window.close());
  const strip=id=>w.document.querySelector(`.strip[data-id="${id}"]`),label=id=>strip(id).querySelector('.strip-label');
  const top=w.document.querySelector('.mixer-row.outputs'),bottom=w.document.querySelector('.mixer-row.inputs');
  label('ch-1').click();
  const editor=w.document.querySelector('.editor-dialog');
  assert.equal(editor.open,true);assert.equal(editor.parentElement,top);assert.equal(editor.getAttribute('aria-modal'),'false');
  assert.equal(editor.dataset.sourceRow,'inputs');assert.equal(editor.dataset.dockRow,'outputs');assert.equal(editor.dataset.channelId,'ch-1');
  assert.equal(openedDialogs.at(-1).modal,false,'opening must use show, never showModal');
  assert.equal(w.document.getElementById('outputs-scroll').inert,true,'covered controls leave the tab order');
  assert.equal(!!w.document.getElementById('inputs-scroll').inert,false);assert.equal(!!editor.inert,false);
  assert.equal(!!w.document.querySelector('.macro-rail').inert,false);assert.equal(!!w.document.getElementById('sof-bar').inert,false);
  label('ch-2').click();assert.equal(editor.dataset.channelId,'ch-2');assert.equal(editor.parentElement,top);assert.equal(openedDialogs.length,1,'switching source channels reuses the nonmodal editor');
  const fader=strip('ch-2').querySelector('.fader'),before=C.getStrip('ch-2').level;
  fader.focus();fader.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  assert.equal(C.getStrip('ch-2').level,before-.5);assert.equal(editor.open,true);
  const escape=new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});fader.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented,true);assert.equal(editor.open,false);assert.equal(w.document.activeElement,label('ch-2'));
  assert.equal(!!w.document.getElementById('outputs-scroll').inert,false);assert.equal(top.classList.contains('editor-host'),false);assert.equal(bottom.classList.contains('editor-host'),false);
});

test('editor follows actual Custom Layer rows and their visible order, including a layer change while open',t=>{
  const {dom,w,C}=fixture(undefined,true);t.after(()=>dom.window.close());
  const label=id=>w.document.querySelector(`.strip[data-id="${id}"] .strip-label`);
  C.showLayer({top:['ch-9','ch-1'],bottom:['bus-2','aux-1']},'Band');label('ch-9').click();
  const editor=w.document.querySelector('.editor-dialog');
  assert.equal(editor.dataset.sourceRow,'outputs');assert.equal(editor.dataset.dockRow,'inputs');assert.equal(editor.parentElement,w.document.querySelector('.mixer-row.inputs'),'an input placed in the upper row opens below');
  editor.querySelector('[aria-label="Canale successivo"]').click();assert.equal(editor.dataset.channelId,'ch-1');assert.equal(editor.dataset.dockRow,'inputs');
  editor.querySelector('[aria-label="Canale successivo"]').click();assert.equal(editor.dataset.channelId,'ch-9','navigation wraps within the visible source bank');
  w.SculptEditor.close();label('bus-2').click();assert.equal(editor.dataset.dockRow,'outputs','a BUS in the bottom row opens above');
  C.showLayer({top:['bus-2'],bottom:['ch-1','aux-1']},'Moved');
  assert.equal(editor.dataset.sourceRow,'outputs');assert.equal(editor.dataset.dockRow,'inputs');
  assert.equal(editor.parentElement,w.document.querySelector('.mixer-row.inputs'));assert.equal(!!w.document.getElementById('outputs-scroll').inert,false);assert.equal(w.document.getElementById('inputs-scroll').inert,true);
  assert.deepEqual(visible(w,'outputs'),['bus-2']);assert.deepEqual(visible(w,'inputs'),['ch-1','aux-1']);
  C.showLayer(null);assert.equal(editor.dataset.dockRow,'inputs');w.SculptEditor.close();
});

test('empty opposite row hosts the editor and another modal owns Escape until it closes',t=>{
  const {dom,w,C}=fixture(undefined,true);t.after(()=>dom.window.close());
  C.showLayer({top:['ch-1'],bottom:[]},'Solo');
  const source=w.document.querySelector('.strip[data-id="ch-1"] .strip-label');source.click();
  const editor=w.document.querySelector('.editor-dialog'),empty=w.document.querySelector('.inputs .layer-empty');
  assert.equal(editor.parentElement,w.document.querySelector('.mixer-row.inputs'));assert.equal(empty.hidden,false,'empty-row placeholder remains available when the editor closes');
  const level=w.document.getElementById('level-dialog');level.showModal();
  const firstEscape=new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});level.dispatchEvent(firstEscape);
  assert.equal(firstEscape.defaultPrevented,false);assert.equal(editor.open,true,'a nested level modal must not also close the channel editor');
  level.close();editor.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(editor.open,false);assert.equal(w.document.activeElement,source);
});
