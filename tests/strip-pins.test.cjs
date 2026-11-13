'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const base=path.join(__dirname,'../dist'),KEY='sculpt-wing-strip-pins-v1',plain=value=>JSON.parse(JSON.stringify(value));
function fixture(t,{saved,editor=false}={}){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window,captures=new Map(),opened=[];
  t.after(()=>dom.window.close());w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.IntersectionObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};
  w.HTMLElement.prototype.setPointerCapture=function(id){captures.set(id,this);};w.HTMLElement.prototype.hasPointerCapture=function(id){return captures.get(id)===this;};w.HTMLElement.prototype.releasePointerCapture=function(id){captures.delete(id);};
  w.HTMLElement.prototype.scrollTo=function({left=0}){this.scrollLeft=left;};w.HTMLElement.prototype.scrollBy=function({left=0}){this.scrollLeft+=left;};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.show=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  if(saved)w.localStorage.setItem(KEY,JSON.stringify(saved));
  const run=file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  for(const file of ['plugin-data.js','model.js','app.js','desk.js','shell.js','systems.js','dca-bank.js','strip-pins.js'])run(file);
  if(editor)run('editor.js');else w.SculptEditor={open:id=>opened.push(id),close(){}};
  const strip=id=>w.document.querySelector(`.strip[data-id="${id}"]`),rail=(row,side)=>w.document.getElementById(`${row}-pinned-${side}`),ids=(row,side)=>[...rail(row,side).querySelectorAll('.strip:not([hidden])')].map(node=>node.dataset.id);
  const button=text=>[...w.document.querySelectorAll('.strip-pin-modal button')].find(node=>node.textContent===text);
  function pointer(target,type,{id=1,x=150,y=180}={}){
    if(type!=='pointerdown'&&captures.has(id))target=captures.get(id);
    const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'mouse'}});target.dispatchEvent(event);if(type==='pointerup')captures.delete(id);return event;
  }
  return {w,C:w.SculptController,D:w.SculptDesk,P:w.SculptStripPins,strip,rail,ids,button,pointer,opened,captures};
}

test('multiple pins use fixed side rails and the same strips without changing audio or routing',t=>{
  const f=fixture(t),before=plain(f.C.capture()),nodes=new Map(f.C.listStrips().map(strip=>[strip.id,f.strip(strip.id)])),fader=f.strip('ch-1').querySelector('.fader');
  assert.equal(f.P.pin('ch-1','left'),true);f.P.pin('ch-2','left');f.P.pin('aux-1','right');f.P.pin('bus-1','left');f.P.pin('mtx-1','right');f.P.pin('main-1','right');
  assert.deepEqual(f.ids('inputs','left'),['ch-1','ch-2']);assert.deepEqual(f.ids('inputs','right'),['aux-1']);assert.deepEqual(f.ids('outputs','left'),['bus-1']);assert.deepEqual(f.ids('outputs','right'),['mtx-1','main-1']);
  assert.equal(f.rail('inputs','left').closest('#inputs-scroll'),null,'fixed rails are siblings outside the center scrolling viewport');assert.equal(f.rail('inputs','left').parentElement,f.w.document.getElementById('inputs-scroll').parentElement);
  assert.equal(f.w.document.querySelectorAll('.strip[data-id]').length,76);for(const [id,node]of nodes)assert.equal(f.strip(id),node);assert.equal(f.strip('ch-1').querySelector('.fader'),fader);
  assert.deepEqual(plain(f.C.capture()),before,'pinning never enters the audio model or rewrites routing');assert.equal(f.P.isPinnedVisible('ch-1'),true);
  fader.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));assert.equal(f.C.getStrip('ch-1').level,before.values['ch-1'].level+.5,'the original fader listener still controls the same strip');
  f.P.pin('ch-1',null);assert.equal(f.strip('ch-1').parentElement.id,'inputs-bank');assert.equal(f.strip('ch-1').querySelector('.fader'),fader);assert.equal(f.P.isPinnedVisible('ch-1'),false);
  assert.deepEqual([...f.w.document.querySelectorAll('#inputs-bank>.strip:not([hidden])')].slice(0,3).map(node=>node.dataset.id),['ch-1','ch-3','ch-4'],'release restores canonical bank order around other pins');
});

test('pin side and explicit order persist independently of live mixer persistence',t=>{
  const f=fixture(t),before=plain(f.C.capture());f.w.SculptLive={isLive:()=>true,canPersist:()=>false,hasStripValue:()=>true,applying:()=>false,reviewMutation(){throw new Error('Pin preferences must never write to WING');}};
  f.P.pin('ch-2','left');f.P.pin('ch-1','left');f.P.pin('bus-3','right');assert.deepEqual(f.ids('inputs','left'),['ch-2','ch-1']);assert.equal(f.P.move('ch-1',-1),true);assert.deepEqual(f.ids('inputs','left'),['ch-1','ch-2']);assert.equal(f.P.move('ch-1',-1),false);
  const saved=JSON.parse(f.w.localStorage.getItem(KEY));assert.deepEqual(saved,{version:1,left:['ch-1','ch-2'],right:['bus-3']});assert.deepEqual(plain(f.C.capture()),before);
  const restored=fixture(t,{saved});assert.deepEqual(restored.ids('inputs','left'),['ch-1','ch-2']);assert.deepEqual(restored.ids('outputs','right'),['bus-3']);
  restored.P.pin('ch-1','right');assert.deepEqual(restored.ids('inputs','left'),['ch-2']);assert.deepEqual(restored.ids('inputs','right'),['ch-1']);assert.equal(restored.w.document.querySelectorAll('.strip[data-id="ch-1"]').length,1);
  const invalid=fixture(t,{saved:{version:1,left:['ch-1','ch-1','not-a-channel',null],right:['ch-1','bus-2']}});assert.deepEqual(plain(invalid.P.preferences()),{version:1,left:['ch-1'],right:['bus-2']});assert.equal(invalid.P.pin('dca-1','left'),false);
});

test('pins follow actual Custom Layer rows, disappear when excluded and restore in their standard rows',t=>{
  const f=fixture(t,{editor:true}),ch=f.strip('ch-1'),bus=f.strip('bus-1'),before=plain(f.C.capture().values);
  f.P.pin('ch-1','left');f.P.pin('bus-1','right');f.C.showLayer({top:['ch-1','ch-2'],bottom:['bus-1','main-1']},'Custom');
  assert.deepEqual(f.ids('outputs','left'),['ch-1']);assert.deepEqual(f.ids('inputs','right'),['bus-1']);assert.equal(f.strip('ch-1'),ch);assert.equal(f.strip('bus-1'),bus);
  ch.querySelector('.strip-label').click();const editor=f.w.document.querySelector('.editor-dialog');assert.equal(editor.dataset.sourceRow,'outputs');assert.equal(editor.dataset.dockRow,'inputs');assert.equal(editor.parentElement,f.w.document.querySelector('.mixer-row.inputs'));assert.equal(f.w.document.querySelector('.inputs .strip-pin-body').inert,true,'opposite-row editor covers the rails together with its center bank');
  f.w.SculptEditor.close();f.C.setSof('bus-1');const send=f.C.getSend('ch-1','bus-1').level,level=f.C.getStrip('ch-1').level;
  ch.querySelector('.fader').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));assert(f.C.getSend('ch-1','bus-1').level>send);assert.equal(f.C.getStrip('ch-1').level,level,'a pinned moved input still controls its SOF send');
  f.C.showLayer({top:['ch-2'],bottom:['main-1']},'Other');assert.equal(ch.hidden,true);assert.equal(f.P.isPinnedVisible('ch-1'),false);assert.deepEqual(f.ids('outputs','left'),[]);assert.equal(f.P.sideOf('ch-1'),'left','exclusion keeps the preference for a later view');
  f.C.showLayer(null);assert.deepEqual(f.ids('inputs','left'),['ch-1']);assert.deepEqual(f.ids('outputs','right'),['bus-1']);assert.deepEqual(plain(f.C.capture().values),before);
});

test('per-strip pin menu is separate from the editor label and supports sides, ordering and release',t=>{
  const f=fixture(t),strip=f.strip('ch-3'),pin=strip.querySelector('.strip-pin-button');assert(pin);assert.equal(pin.closest('.strip-label'),null);assert.match(pin.getAttribute('aria-label'),/Ancora il canale/);
  pin.click();assert.deepEqual(f.opened,[]);assert(f.w.document.querySelector('.strip-pin-modal[open]'));f.button('Ancora a destra').click();assert.equal(f.w.document.querySelector('.strip-pin-modal'),null);assert.equal(pin.getAttribute('aria-pressed'),'true');assert.equal(pin.dataset.side,'right');
  f.P.pin('ch-4','right');pin.click();assert.equal(f.button('Sposta prima').disabled,true);f.button('Sposta dopo').click();assert.deepEqual(f.ids('inputs','right'),['ch-4','ch-3']);assert.equal(f.button('Sposta dopo').disabled,true);
  f.button('Ancora a sinistra').click();assert.deepEqual(f.ids('inputs','left'),['ch-3']);pin.click();f.button('Libera il canale').click();assert.equal(f.P.sideOf('ch-3'),null);assert.equal(pin.getAttribute('aria-pressed'),'false');assert.equal(strip.parentElement.id,'inputs-bank');
});

test('DCA mode hides only upper fixed rails and restores them when leaving the DCA bank',t=>{
  const f=fixture(t);f.P.pin('bus-1','left');f.P.pin('ch-1','right');f.w.SculptDcaBank.open();
  assert.equal(f.rail('outputs','left').hidden,true);assert.equal(f.rail('inputs','right').hidden,false);assert.equal(f.P.isPinnedVisible('bus-1'),false);assert.equal(f.P.isPinnedVisible('ch-1'),true);
  assert.equal(f.w.document.getElementById('dca-bank').closest('.strip-pin-body'),f.rail('outputs','left').parentElement);assert.equal(f.w.document.querySelectorAll('.dca-strip .strip-pin-button').length,0);
  f.w.SculptDcaBank.hide();assert.equal(f.rail('outputs','left').hidden,false);assert.equal(f.P.isPinnedVisible('bus-1'),true);assert.deepEqual(f.ids('outputs','left'),['bus-1']);
});

test('fixed rails pan independently without editing a channel and preserve cap-only fader gestures',t=>{
  const f=fixture(t),center=f.w.document.getElementById('inputs-scroll');for(const id of ['ch-1','ch-2','ch-3'])f.P.pin(id,'left');
  const rail=f.rail('inputs','left'),label=f.strip('ch-1').querySelector('.strip-label'),fader=f.strip('ch-1').querySelector('.fader'),cap=fader.querySelector('.fader-cap');
  Object.defineProperties(rail,{clientWidth:{value:120},scrollWidth:{value:360}});fader.getBoundingClientRect=()=>({width:52,height:224,top:100,bottom:324,left:10,right:62});center.scrollLeft=333;const before=plain(f.C.capture());
  f.pointer(label,'pointerdown',{x:180});f.pointer(label,'pointermove',{x:100});f.pointer(label,'pointerup',{x:100});label.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));
  assert.equal(rail.scrollLeft,80);assert.equal(center.scrollLeft,333);assert.deepEqual(f.opened,[]);assert.deepEqual(plain(f.C.capture()),before);
  f.pointer(cap,'pointerdown',{x:120,y:220});f.pointer(cap,'pointermove',{x:120,y:180});f.pointer(cap,'pointerup',{x:120,y:180});assert(f.C.getStrip('ch-1').level>before.values['ch-1'].level);assert.equal(rail.scrollLeft,80);
});

test('bank navigation finds the first unpinned channel in its range and handles an entirely pinned bank',t=>{
  const f=fixture(t),center=f.w.document.getElementById('inputs-scroll');f.P.pin('ch-1','left');f.P.pin('ch-2','left');Object.defineProperty(f.strip('ch-3'),'offsetLeft',{value:245,configurable:true});
  f.w.document.querySelector('.bank-button[data-row="inputs"][data-index="0"]').click();assert.equal(center.scrollLeft,242);
  for(let n=3;n<=8;n++)f.P.pin('ch-'+n,'left');center.scrollLeft=180;assert.equal(f.P.navigate('inputs',0),true);assert.equal(center.scrollLeft,180,'a range already present in a rail does not jump the center to an unrelated strip');
  assert.equal(f.P.pin('ch-1','middle'),false);assert.equal(f.w.document.querySelectorAll('.strip[data-id]').length,76);
});
