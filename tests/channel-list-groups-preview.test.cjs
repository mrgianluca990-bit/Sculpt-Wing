'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const base=path.join(__dirname,'../dist'),plain=value=>JSON.parse(JSON.stringify(value));
function fixture(t){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window;
  t.after(()=>dom.window.close());
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.IntersectionObserver=class{observe(){}disconnect(){}};
  w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.setPointerCapture=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  for(const name of ['plugin-data.js','model.js','app.js','desk.js','shell.js','channel-list.js','channel-list-scene.js','channel-list-preview.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),dom.getInternalVMContext(),{filename:name});
  const C=w.SculptController,subscribers=new Set();let live=false;
  w.SculptLive={isLive:()=>live,canPersist:()=>!live,applying:()=>false,hasStripValue:()=>true,reviewMutation:()=>{throw new Error('Preview must never write to a live console');},subscribe:fn=>{subscribers.add(fn);return()=>subscribers.delete(fn);}};
  const button=label=>[...w.document.querySelectorAll('.cl-modal button')].find(el=>el.textContent===label);
  const control=label=>[...w.document.querySelectorAll('.cl-modal [aria-label]')].find(el=>el.getAttribute('aria-label')===label);
  function edit(label,value){const input=control(label);assert(input,'Control exists: '+label);assert(!input.disabled,'Control is editable: '+label);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new w.Event(input.tagName==='SELECT'||input.type==='checkbox'?'change':'input',{bubbles:true}));return input;}
  function importText(text='1 Kick\n2 Bass'){w.SculptChannelPreview.open();edit('Testo della channel list',text);button('Leggi il testo').click();}
  return {w,dom,C,button,control,edit,importText,subscribers,setLive(value){live=value;for(const fn of subscribers)fn();}};
}

const selectedLabel=(channel,name)=>'Seleziona per il gruppo '+channel+' · '+name;
const groupButtons=f=>[...f.w.document.querySelectorAll('.cl-group-choice')];
const groupButton=(f,name)=>groupButtons(f).find(node=>node.querySelector('strong').textContent===name);
const currentGroup=(f)=>f.w.document.querySelector('.cl-group-choice[aria-pressed="true"]');

test('a group shortcut selects its members and a subset can become a named instrument without applying or reactivating inputs',t=>{
  const f=fixture(t),before=plain(f.C.capture());f.importText('1 Kick\n2 Snare\n3 OH L\n4 OH R\n5 Bass');
  f.edit('Importa riga 4 OH R',false);
  f.w.document.querySelector('.cl-edit-group').click();
  assert.equal(f.button('Strumenti').getAttribute('aria-selected'),'true');
  assert.match(f.w.document.querySelector('.cl-group-operations>h3').textContent,/4 canali selezionati/);
  f.edit(selectedLabel('CH 1','Kick'),false);f.edit(selectedLabel('CH 2','Snare'),false);
  f.edit('Nome del nuovo gruppo','Overhead');assert.equal(f.button('Crea gruppo').disabled,false);f.button('Crea gruppo').click();
  assert.equal(currentGroup(f).querySelector('strong').textContent,'Overhead');
  assert.equal(f.w.document.querySelectorAll('.cl-group-channel').length,2);
  assert.match(f.w.document.querySelector('.cl-group-channel-list').textContent,/Escluso dall’importazione/);
  assert.deepEqual(plain(f.C.capture()),before,'editing group membership must not modify any project field');
  f.button('Canali').click();assert.equal(f.control('Importa riga 4 OH R').checked,false);
  assert.equal(f.control('Strumento riga 3').value,f.control('Strumento riga 4').value);
  assert.notEqual(f.control('Strumento riga 1').value,f.control('Strumento riga 3').value);
  assert.equal(f.control('Nome riga 3').value,'OH L');assert.equal(f.control('Nome riga 4').value,'OH R');
  assert.equal(f.control('Mute riga 3').checked,true);assert.equal(f.control('Fader riga 3').value,'−∞');
});

test('selection persists across instrument views and create uses the explicitly chosen reference mains',t=>{
  const f=fixture(t),before=plain(f.C.capture());f.importText('1 Kick\n2 Snare\n3 Bass\n4 Voce');
  f.edit('Monitor principale 2 strumento 2','bus-3');
  f.button('Strumenti').click();f.edit(selectedLabel('CH 1','Kick'),true);
  groupButton(f,'Bass').click();f.edit(selectedLabel('CH 3','Bass'),true);
  assert.match(f.w.document.querySelector('.cl-group-selection-note').textContent,/CH 1 · Kick.*CH 3 · Bass/);
  const ref=[...f.control('Canale di riferimento del nuovo gruppo').options].find(option=>option.textContent.includes('CH 3')).value;
  f.edit('Canale di riferimento del nuovo gruppo',ref);f.edit('Nome del nuovo gruppo','Ritmica');
  assert.match(f.w.document.querySelector('.cl-inheritance-note').textContent,/MON: BUS 2.*IEM: BUS 3/);
  f.button('Crea gruppo').click();assert.equal(currentGroup(f).querySelector('strong').textContent,'Ritmica');
  assert.equal(f.w.document.querySelector('.cl-group-editor select[aria-label^="Monitor principale 1"]').value,'bus-2');
  assert.equal(f.w.document.querySelector('.cl-group-editor select[aria-label^="Monitor principale 2"]').value,'bus-3');
  f.edit('Canali da visualizzare','selected');assert.equal(f.w.document.querySelectorAll('.cl-group-channel').length,2);
  assert.deepEqual(plain(f.C.capture()),before);f.button('Applica scena').click();
  for(const id of ['ch-1','ch-3']){assert.equal(f.C.getSend(id,'bus-2').level,-5);assert.equal(f.C.getSend(id,'bus-2').pre,true);assert.equal(f.C.getSend(id,'bus-3').level,-5);assert.equal(f.C.getSend(id,'bus-3').pre,true);}
  assert.deepEqual(plain(f.C.capture().desk),before.desk,'group edits cannot change routing or processing');
});

test('whole groups can be merged and later separated without removing channels or changing their sends',t=>{
  const f=fixture(t);f.importText('1 Piano L\n2 Piano R\n3 Bass');f.w.document.querySelector('.cl-edit-group').click();
  const bass=groupButtons(f).find(node=>node.querySelector('strong').textContent==='Bass').dataset.groupKey;
  f.edit('Gruppo di destinazione',bass);f.button('Sposta nel gruppo').click();assert.equal(groupButtons(f).length,1);
  assert.equal(currentGroup(f).querySelector('strong').textContent,'Bass');assert.equal(f.w.document.querySelectorAll('.cl-group-channel').length,3);
  f.button('Seleziona tutti i canali').click();f.button('Rendi indipendenti').click();assert.equal(groupButtons(f).length,3);
  assert.equal(f.w.document.querySelectorAll('.cl-group-channel').length,3,'separating does not remove selected members');
  f.button('Applica scena').click();for(const id of ['ch-1','ch-2','ch-3']){assert.equal(f.C.getSend(id,'bus-2').level,-5);assert.equal(f.C.getSend(id,'bus-2').mode,'PRE');}
});

test('renaming a group refreshes navigation and destination labels without interrupting typing',t=>{
  const f=fixture(t);f.importText('1 Kick\n2 Snare\n3 Bass');f.button('Strumenti').click();
  const input=f.control('Nome strumento 1');input.focus();f.edit('Nome strumento 1','Batteria Luca');
  assert.equal(f.w.document.activeElement,input);assert(groupButton(f,'Batteria Luca'));
  assert([...f.control('Gruppo di destinazione').options].some(option=>option.textContent.includes('Batteria Luca')));
  f.button('Canali').click();assert.equal(f.control('Nome riga 1').value,'Kick');assert.equal(f.control('Nome riga 2').value,'Snare');
});

test('group selection and pending operation are reset for a new import, including reused row IDs',t=>{
  const f=fixture(t);f.importText('1 Kick\n2 Snare\n3 Bass');f.w.document.querySelector('.cl-edit-group').click();f.edit('Nome del nuovo gruppo','Old group');
  f.edit('Gruppo di destinazione',groupButton(f,'Bass').dataset.groupKey);
  f.edit('Testo della channel list','1 Piano L\n2 Piano R');f.button('Leggi il testo').click();f.button('Strumenti').click();
  assert.equal(f.control('Nome del nuovo gruppo').value,'');assert.equal(f.control('Gruppo di destinazione').value,'');assert.equal(f.control('Canale di riferimento del nuovo gruppo').value,'');
  assert.equal(f.button('Crea gruppo').disabled,true);assert.equal(f.button('Sposta nel gruppo').disabled,true);assert.equal(f.button('Rendi indipendenti').disabled,true);
  assert.equal(f.w.document.querySelectorAll('.cl-group-channel input:checked').length,0);
});

test('selection repaint preserves scroll and focus and blank channels remain independent of import selection',t=>{
  const f=fixture(t);f.importText('1 Kick\n2 Snare\n3 Bass');f.button('Aggiungi canale vuoto').click();f.button('Strumenti').click();
  f.edit('Canali da visualizzare','all');const members=f.w.document.querySelector('[data-cl-scroll="instrument-members"]'),list=f.w.document.querySelector('[data-cl-scroll="instrument-list"]');members.scrollTop=101;list.scrollTop=32;
  const label=selectedLabel('CH 4','CH 4'),input=f.control(label);input.focus();f.edit(label,true);
  assert.equal(f.w.document.querySelector('[data-cl-scroll="instrument-members"]').scrollTop,101);assert.equal(f.w.document.querySelector('[data-cl-scroll="instrument-list"]').scrollTop,32);assert.equal(f.w.document.activeElement.getAttribute('aria-label'),label);
  f.edit('Nome del nuovo gruppo','Spare');f.button('Crea gruppo').click();assert.equal(currentGroup(f).querySelector('strong').textContent,'Spare');
  assert.equal(f.w.document.querySelector('.cl-group-editor select[aria-label^="Monitor principale 1"]').value,'');assert.equal(f.w.document.querySelector('.cl-group-editor select[aria-label^="Monitor principale 2"]').value,'');
  f.button('Canali').click();assert.equal(f.control('Importa canale vuoto CH 4 ').checked,true);assert.equal(f.control('Mute canale vuoto CH 4').checked,true);assert.equal(f.control('Fader canale vuoto CH 4').value,'−∞');
});

test('typing an instrument name updates both MON and IEM labels while keeping the field focused',t=>{
  const f=fixture(t);f.importText('1 Kick\n2 Snare\n3 Bass');
  f.edit('Monitor principale 1 strumento 2','');
  f.edit('Monitor principale 2 strumento 1','bus-2');
  const name=f.control('Nome strumento 1');name.focus();f.edit('Nome strumento 1','Kit Luca');
  assert.equal(f.w.document.activeElement,name);
  assert.match(f.control('Monitor principale 1 strumento 1').selectedOptions[0].textContent,/Kit Luca MON/);
  assert.match(f.control('Monitor principale 2 strumento 1').selectedOptions[0].textContent,/Kit Luca IEM/);
  f.button('Mandate').click();
  assert.equal(f.control('Nome monitor 1').value,'Kit Luca MON');assert.equal(f.control('Nome monitor 2').value,'Kit Luca IEM');
  assert.equal(f.control('Nome automatico monitor 1').checked,true);assert.equal(f.control('Nome automatico monitor 2').checked,true);
  f.button('Applica scena').click();
  assert.equal(f.w.SculptModel.find(f.C.getState(),'bus-1').name,'Kit Luca MON');assert.equal(f.w.SculptModel.find(f.C.getState(),'bus-2').name,'Kit Luca IEM');
});

test('a shared monitor offers an explicit owner, preserves a manual name, and lets the owner be selected again',t=>{
  const f=fixture(t);f.importText('1 Kick\n2 Snare\n3 Bass');
  f.edit('Nome strumento 1','Batteria');f.edit('Nome strumento 2','Basso');f.edit('Monitor principale 1 strumento 2','bus-1');
  f.button('Mandate').click();
  const origin=f.control('Origine nome monitor 1');assert(origin);assert.equal(origin.value,'');
  assert.equal(f.control('Nome monitor 1').value,'Batteria MON');
  const bass=[...origin.options].find(option=>option.textContent.includes('Basso')).value;
  f.edit('Origine nome monitor 1',bass);assert.equal(f.control('Nome monitor 1').value,'Basso MON');
  f.edit('Nome monitor 1','Wedge Luca');assert.equal(f.control('Nome automatico monitor 1').checked,false);assert.equal(f.control('Origine nome monitor 1').disabled,true);
  f.button('Canali').click();f.edit('Nome strumento 2','Luca');f.button('Mandate').click();
  assert.equal(f.control('Nome monitor 1').value,'Wedge Luca');
  f.edit('Nome automatico monitor 1',true);
  assert.equal(f.control('Origine nome monitor 1').disabled,false);assert.equal(f.control('Origine nome monitor 1').value,'');
  assert.equal(f.control('Nome monitor 1').value,'Wedge Luca','re-enabling automatic names does not silently choose among owners');
  f.edit('Origine nome monitor 1',bass);assert.equal(f.control('Nome monitor 1').value,'Luca MON');
});

test('clearing a manual monitor name commits its BUS default and automatic names can then be restored',t=>{
  const f=fixture(t);f.importText('1 Kick\n2 Bass');f.button('Mandate').click();
  const input=f.edit('Nome monitor 1','');assert.equal(input.value,'');
  input.dispatchEvent(new f.w.Event('blur'));
  assert.equal(f.control('Nome monitor 1').value,'BUS 1');assert.equal(f.control('Nome automatico monitor 1').checked,false);
  f.button('Canali').click();f.edit('Nome strumento 1','Batteria');f.button('Mandate').click();
  assert.equal(f.control('Nome monitor 1').value,'BUS 1');
  f.edit('Nome automatico monitor 1',true);
  assert.equal(f.control('Nome monitor 1').value,'Batteria MON');
  assert.equal(f.control('Nome automatico monitor 1').checked,true);
});
