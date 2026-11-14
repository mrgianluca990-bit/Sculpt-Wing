'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),base=path.join(__dirname,'../dist');
function fixture(t){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window;let nextFrame;
  t.after(()=>w.close());w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=fn=>{nextFrame=fn;return 1;};
  w.HTMLElement.prototype.scrollTo=function({left=0}){this.scrollLeft=left;};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.setPointerCapture=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const run=file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  for(const file of ['plugin-data.js','model.js','app.js','desk.js','shell.js','dca-bank.js'])run(file);
  const key=(node,value)=>node.dispatchEvent(new w.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
  const double=node=>node.dispatchEvent(new w.MouseEvent('dblclick',{button:0,bubbles:true,cancelable:true}));
  return {w,C:w.SculptController,D:w.SculptDesk,bank:w.SculptDcaBank,key,double,run,tick:time=>nextFrame(time),strip:id=>w.document.querySelector(`.strip[data-id="${id}"]`),dca:id=>w.document.querySelector(`.dca-strip[data-dca="${id}"]`)};
}
function liveFixture(f,load=async()=>{}){
  f.run('wing-map.js');const values=new Map(),metadata=new Map(),status={mode:'live',writable:true,loads:0,reviews:0};
  f.w.SculptLive={isLive:()=>true,isConnected:()=>status.mode==='live',isWritable:()=>status.writable,hasValue:p=>values.has(p),metadata:p=>metadata.get(p),hasStripValue:()=>true,canPersist:()=>false,applying:()=>false,reviewMutation:()=>{status.reviews++;return status.mode==='live'&&status.writable;},loadScope:scope=>{assert.equal(scope,'dca');status.loads++;return load();}};
  return {values,metadata,status,read(p,value,meta={}){values.set(p,value);if(meta)metadata.set(p,{path:p,readOnly:false,...meta});else metadata.delete(p);f.w.SculptWingMap.apply(f.C.getState(),p,value);},mode(mode){status.mode=mode;f.w.dispatchEvent(new f.w.CustomEvent('sculpt-live-state',{detail:{mode}}));}};
}
test('DCA masters share the upper bank with outputs and retain the existing shared group controls',t=>{
  const f=fixture(t),button=f.w.document.getElementById('dca-bank-button'),normal=f.w.document.getElementById('outputs-bank');
  const events=[];f.w.addEventListener('sculpt-dca-bank',event=>events.push(event.detail.open));
  assert.equal(normal.querySelectorAll('.dca-strip').length,16);assert.equal(normal.querySelectorAll('.strip').length,44);
  assert.deepEqual([...normal.querySelectorAll('.strip')].slice(-16).map(node=>node.dataset.id),Array.from({length:16},(_,i)=>'dca-'+(i+1)));
  button.click();assert.equal(f.bank.isOpen(),true);assert.equal(normal.hidden,false);assert.equal(f.w.document.querySelectorAll('.dca-strip').length,16);
  assert.equal(f.w.document.getElementById('inputs-bank').hidden,false);assert.equal(f.w.document.getElementById('output-title').textContent,'USCITE');assert.equal(f.w.document.querySelector('.outputs .row-count').textContent,'44');
  const original=f.C.getStrip('ch-7').level;f.key(f.dca(2).querySelector('.fader'),'ArrowDown');assert.equal(f.D.get().dca[1].level,-.5);assert.equal(f.C.getStrip('ch-7').level,original);assert.equal(f.D.effective('ch-7').level,original-.5);
  f.dca(2).querySelector('.mute-button').click();assert.equal(f.D.effective('ch-7').muted,true);assert.equal(f.C.getStrip('ch-7').mute,false);
  f.double(f.dca(2).querySelector('.fader-cap'));assert.equal(f.D.get().dca[1].level,0);
  f.w.document.querySelector('.bank-button[data-row="outputs"][data-index="16"]').click();assert.equal(f.bank.isOpen(),false);assert.equal(normal.hidden,false);assert.equal(f.w.document.getElementById('output-title').textContent,'USCITE');
  f.bank.hide();assert.deepEqual(events,[true,false],'the shortcut tracks navigation without replacing the row');
});
test('DCA members and names edit existing group state and survive project restoration',t=>{
  const f=fixture(t);f.bank.open();f.dca(4).querySelector('.strip-label').click();
  const input=f.w.document.querySelector('[aria-label="Nome DCA 4"]');input.value='Arch';input.dispatchEvent(new f.w.Event('change'));assert.equal(f.D.get().dca[3].name,'Arch');
  const checkbox=f.w.document.querySelector('[aria-label="Assegna CH 25 · Archi L a DCA 4"]');checkbox.click();assert.equal(f.D.get().dca[3].members.includes('ch-25'),true);
  assert.equal(f.dca(4).querySelector('.strip-name').textContent,'Arch');assert.equal(f.dca(4).querySelector('.dca-members-button').textContent,'1 membri');
  const saved=f.C.capture();f.D.change(d=>{d.dca[3].name='Changed';d.dca[3].members=[];});f.C.restore(saved);assert.equal(f.dca(4).querySelector('.strip-name').textContent,'Arch');assert.equal(f.dca(4).querySelector('.dca-members-button').textContent,'1 membri');
});
test('unchanged DCA refreshes do not rewrite strip DOM while values and permissions still repaint',t=>{
  const f=fixture(t),observed=f.dca(1),observer=new f.w.MutationObserver(()=>{});observer.observe(observed,{attributes:true,childList:true,characterData:true,subtree:true});
  f.bank.refresh();f.bank.refresh();assert.equal(observer.takeRecords().length,0);
  f.D.change(d=>d.dca[0].level=-4,'dca');assert(observer.takeRecords().length>0);assert.equal(observed.querySelector('.level-readout span').textContent,'−4.0');
  f.bank.refresh();assert.equal(observer.takeRecords().length,0);
  const l=liveFixture(f);l.read('/dca/1/fdr',-4);l.read('/dca/1/name','Band');l.read('/dca/1/mute',false);l.read('/dca/1/$solo',false);f.bank.refresh();observer.takeRecords();
  l.status.writable=false;f.bank.refresh();assert(observer.takeRecords().length>0);assert.equal(observed.querySelector('.fader').getAttribute('aria-disabled'),'true');
  f.bank.refresh();assert.equal(observer.takeRecords().length,0);observer.disconnect();
});
test('Custom Layer controls DCA visibility while preserving its two-row layout',t=>{
  const f=fixture(t);f.bank.open();f.C.showLayer({top:['ch-3'],bottom:['bus-1']},'Two rows');
  assert.equal(f.bank.isOpen(),false);assert.equal(f.dca(1).hidden,true);assert.equal(f.w.document.querySelector('.outputs .bank-navigation').hidden,true);
  assert.equal(f.strip('ch-3').parentElement.id,'outputs-bank');assert.equal(f.strip('bus-1').parentElement.id,'inputs-bank');
  f.C.showLayer({top:['dca-2','ch-3'],bottom:['bus-1','dca-4']},'DCA above');
  assert.deepEqual([...f.w.document.querySelectorAll('#outputs-bank>.strip:not([hidden])')].map(n=>n.dataset.id),['dca-2','ch-3','dca-4']);
  assert.deepEqual([...f.w.document.querySelectorAll('#inputs-bank>.strip:not([hidden])')].map(n=>n.dataset.id),['bus-1']);
  assert.equal(f.dca(1).hidden,true);assert.equal(f.dca(2).hidden,false);assert.equal(f.dca(4).hidden,false);
  f.bank.open();assert.equal(f.C.getLayerRows(),null);assert.equal(f.w.document.querySelectorAll('#outputs-bank>.strip:not([hidden])').length,44);
});
test('DCA live hydration and guarded controls never display unreceived demo values as live',async t=>{
  const f=fixture(t),values=new Map();let writable=false,loads=0;
  f.w.SculptLive={isLive:()=>true,isConnected:()=>true,isWritable:()=>writable,hasValue:path=>values.has(path),metadata:path=>values.has(path)?{path,readOnly:false}:null,hasStripValue:()=>true,canPersist:()=>false,applying:()=>false,reviewMutation:()=>writable,loadScope:async scope=>{assert.equal(scope,'dca');loads++;}};
  f.bank.open();await Promise.resolve();const slider=f.dca(1).querySelector('.fader');assert.equal(loads,1);assert.equal(f.dca(1).querySelector('.level-readout span').textContent,'—');assert.equal(slider.getAttribute('aria-disabled'),'true');
  f.key(slider,'ArrowDown');assert.equal(f.D.get().dca[0].level,0);
  values.set('/dca/1/fdr',-6);f.C.getState().desk.dca[0].level=-6;f.bank.refresh();assert.equal(f.dca(1).querySelector('.level-readout span').textContent,'−6.0');
  writable=true;f.bank.refresh();f.key(slider,'ArrowDown');assert.equal(f.D.get().dca[0].level,-6.5);
  writable=false;f.bank.refresh();f.double(slider);assert.equal(f.D.get().dca[0].level,-6.5);
});
test('unread DCA memberships stay unknown and cannot be changed even through an already open label',async t=>{
  const f=fixture(t),l=liveFixture(f);f.bank.open();await Promise.resolve();
  assert.equal(f.dca(1).querySelector('.dca-members-button').textContent,'— membri');
  f.dca(1).querySelector('.strip-label').click();const checks=[...f.w.document.querySelectorAll('.dca-members input')],before=JSON.stringify(f.D.get().dca[0].members);
  assert.equal(checks.length,76);assert(checks.every(check=>check.disabled&&check.indeterminate&&!check.checked));assert.match(f.w.document.querySelector('.dca-config .desk-note').textContent,/0 canali letti · 76 da leggere/);
  checks[0].checked=true;checks[0].dispatchEvent(new f.w.Event('change'));assert.equal(l.status.reviews,0);assert.equal(JSON.stringify(f.D.get().dca[0].members),before);assert.equal(checks[0].checked,false);
  // A value arriving before its schema does not enable a scalar control.
  l.read('/dca/1/fdr',-8,null);f.bank.refresh();const slider=f.dca(1).querySelector('.fader');assert.equal(slider.getAttribute('aria-disabled'),'true');assert.equal(f.dca(1).querySelector('.level-readout span').textContent,'—');f.double(slider);assert.equal(l.status.reviews,0);assert.equal(f.D.get().dca[0].level,-8);
});
test('DCA assignment permissions are checked against each actual strip tag path and current metadata',async t=>{
  const f=fixture(t),l=liveFixture(f);l.read('/dca/1/fdr',-6);l.read('/dca/1/name','Band');l.read('/ch/1/tags','#D1');l.read('/ch/2/tags','',{readOnly:true});l.read('/ch/3/tags','',null);
  f.bank.open();await Promise.resolve();f.dca(1).querySelector('.strip-label').click();const checks=[1,2,3].map(n=>f.w.document.querySelector(`.dca-members input[aria-label^="Assegna CH 0${n} ·"]`));
  assert.equal(checks[0].disabled,false);assert.equal(checks[0].checked,true);assert.equal(checks[1].disabled,true);assert.equal(checks[1].checked,false);assert.equal(checks[1].indeterminate,false);assert.equal(checks[2].disabled,true);assert.equal(checks[2].indeterminate,true);
  checks[1].checked=true;checks[1].dispatchEvent(new f.w.Event('change'));assert.equal(l.status.reviews,0);assert.equal(checks[1].checked,false);
  checks[0].click();assert.equal(l.status.reviews,1);assert.equal(f.D.get().dca[0].members.includes('ch-1'),false);
  // Revoke Control before the state notification arrives: the handler itself
  // must recheck permission instead of trusting an enabled checkbox.
  l.status.writable=false;checks[0].checked=true;checks[0].dispatchEvent(new f.w.Event('change'));assert.equal(l.status.reviews,1);assert.equal(checks[0].checked,false);assert.equal(checks[0].disabled,true);
});
test('an open DCA dialog follows live membership and disconnects without resetting search, scroll or focused name',async t=>{
  const f=fixture(t),l=liveFixture(f);l.read('/dca/1/fdr',-4);l.read('/dca/1/name','Band');
  for(const strip of f.C.listStrips())l.read(f.w.SculptWingMap.stripPath(strip.id)+'/tags','');l.read('/ch/1/tags','#D1');
  f.bank.open();await Promise.resolve();f.dca(1).querySelector('.strip-label').click();
  const modal=f.w.document.querySelector('.dca-config').closest('dialog'),name=modal.querySelector('[aria-label="Nome DCA 1"]'),search=modal.querySelector('input[type="search"]'),list=modal.querySelector('.dca-members'),checks=[...list.querySelectorAll('input')],ch1=list.querySelector('[aria-label^="Assegna CH 01 ·"]'),ch2=list.querySelector('[aria-label^="Assegna CH 02 ·"]');
  search.value='CH 01';search.dispatchEvent(new f.w.Event('input'));list.scrollTop=180;name.focus();name.value='Draft';
  l.read('/dca/1/name','Remote');l.read('/ch/1/tags','');l.read('/ch/2/tags','#D1');f.C.refresh();
  assert.equal(ch1.checked,false);assert.equal(ch2.checked,true);assert.equal(f.dca(1).querySelector('.dca-members-button').textContent,'1 membri');assert.equal(name.value,'Draft');assert.equal(f.w.document.activeElement,name);assert.equal(search.value,'CH 01');assert.equal(list.scrollTop,180);assert.equal(ch2.closest('label').hidden,true);
  name.blur();assert.equal(name.value,'Remote');l.status.writable=false;l.mode('live');await Promise.resolve();assert(checks.every(check=>check.disabled));assert.equal(name.disabled,true);
  // Deliberately retain stale fixture values: disconnected controls must clear
  // regardless, not rely only on the driver's map clearing implementation.
  l.mode('disconnected');assert(checks.every(check=>check.disabled&&check.indeterminate&&!check.checked));assert.equal(name.value,'');assert.equal(f.dca(1).querySelector('.level-readout span').textContent,'—');assert.equal(f.dca(1).querySelector('.dca-members-button').textContent,'— membri');
  modal.close();l.status.writable=true;l.mode('live');await Promise.resolve();assert.equal(checks[0].disabled,true,'closing removes the dialog refresh subscription');assert.equal(modal.isConnected,false);
});
test('reconnection starts a fresh DCA read and a late old request cannot finish or fail the new loading state',async t=>{
  const f=fixture(t),pending=[],l=liveFixture(f,()=>new Promise((resolve,reject)=>pending.push({resolve,reject})));f.bank.open();l.mode('live');assert.equal(l.status.loads,1);
  l.mode('disconnected');l.mode('live');assert.equal(l.status.loads,2);assert.match(f.w.document.getElementById('outputs-mode').textContent,/LETTURA DCA/);
  pending[0].reject(new Error('Previous session error'));await Promise.resolve();await Promise.resolve();
  assert.match(f.w.document.getElementById('outputs-mode').textContent,/LETTURA DCA/);assert.doesNotMatch(f.w.document.getElementById('toast').textContent,/Previous session/);
  pending[1].resolve();await Promise.resolve();await Promise.resolve();assert.doesNotMatch(f.w.document.getElementById('outputs-mode').textContent,/LETTURA DCA/);assert.equal(l.status.loads,2);
});
test('opening an unread DCA label hydrates its own scope and explicit reread refreshes names and memberships',async t=>{
  const f=fixture(t),l=liveFixture(f),reads=[];
  f.dca(1).querySelector('.strip-label').click();assert.equal(l.status.loads,1,'a label is sufficient; the Groups page need not be opened');
  await new Promise(resolve=>setImmediate(resolve));
  for(let n=1;n<=16;n++)for(const [key,value]of [['fdr',-n],['name','DCA '+n],['mute',0],['$solo',0]])l.read(`/dca/${n}/${key}`,value);
  for(const strip of f.C.listStrips())l.read(f.w.SculptWingMap.stripPath(strip.id)+'/tags','');
  f.w.SculptLive.readNode=async(path,options)=>{reads.push({path,options});if(path==='/dca/1')l.read('/dca/1/name','Updated');if(path==='/ch/1/tags')l.read(path,'#D1');};
  f.bank.refresh();const retry=[...f.w.document.querySelectorAll('.dca-config button')].find(node=>node.textContent==='Rileggi DCA');
  assert.equal(retry.disabled,false);retry.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads.length,92);assert(reads.every(item=>item.options.force===true));assert.equal(reads.filter(item=>/^\/dca\//.test(item.path)).length,16);
  assert(reads.filter(item=>!/^\/dca\//.test(item.path)).every(item=>item.path.endsWith('/tags')));
  assert.equal(f.dca(1).querySelector('.strip-name').textContent,'Updated');assert.equal(f.dca(1).querySelector('.dca-members-button').textContent,'1 membri');
  assert.equal(f.dca(1).querySelector('.meter'),null,'a DCA has no fabricated audio meter');
});
test('channel meters remain at input through mute, fader changes, SOF and custom row moves',t=>{
  const f=fixture(t),meter=f.strip('ch-1').querySelector('.meter');f.tick(1000);const before=meter.style.getPropertyValue('--meter');
  f.C.updateStrip('ch-1',{mute:true,level:-90});f.C.setSend('ch-1','bus-1',{level:-90,on:false});f.C.setSof('bus-1');f.C.showLayer({top:['ch-1'],bottom:['bus-1']},'Inputs above');
  // Freeze the demo phase; the metering tap must be independent of these changes.
  f.C.getState().meters=false;f.tick(1200);const frozen=meter.style.getPropertyValue('--meter');f.C.updateStrip('ch-1',{mute:false,level:10});f.C.setSend('ch-1','bus-1',{level:0,on:true});f.tick(1400);
  assert.notEqual(before,'0%');assert.notEqual(frozen,'0%');assert.equal(meter.style.getPropertyValue('--meter'),frozen);
  const taps=[];f.w.SculptLive={isLive:()=>true,meter:(id,tap)=>{if(id==='ch-1'||id==='bus-1')taps.push([id,tap]);return {left:-18,right:-24};},gainReduction:()=>null};f.tick(1600);
  assert.deepEqual(taps,[['bus-1','output'],['ch-1','input']]);assert.equal(meter.style.getPropertyValue('--meter'),'70%');
});
test('small GR meters use received gate/comp values and clear unavailable data',t=>{
  const f=fixture(t);let reduction={gate:{fraction:.5,raw:128,db:30},comp:{fraction:.25,raw:64,db:null}};
  f.w.SculptLive={isLive:()=>true,meter:()=>({left:-12,right:-14}),gainReduction:()=>reduction};f.tick(1000);
  const gate=f.strip('ch-1').querySelector('.gate-gr'),comp=f.strip('ch-1').querySelector('.comp-gr');
  assert.equal(gate.style.getPropertyValue('--gr'),'50%');assert.equal(comp.style.getPropertyValue('--gr'),'25%');assert.match(gate.title,/30.0 dB/);assert.match(comp.title,/25%/);assert.doesNotMatch(comp.title,/dB/);
  reduction=null;f.tick(1200);assert.equal(gate.style.getPropertyValue('--gr'),'0%');assert.equal(comp.getAttribute('aria-valuenow'),null);assert.equal(gate.classList.contains('gr-unavailable'),true);assert.match(gate.getAttribute('aria-valuetext'),/non disponibile/);
});
