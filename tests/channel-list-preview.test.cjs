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

test('scene preview imports silence and all monitor sends only after Apply, then persists and undoes them',t=>{
  const f=fixture(t),before=plain(f.C.capture());f.importText();
  assert.deepEqual(plain(f.C.capture()),before,'reading and preparing must leave every project field untouched');
  assert.equal(f.control('Mute riga 1').checked,true);assert.equal(f.control('Fader riga 1').value,'−∞');assert.equal(f.control('Mute riga 2').checked,true);
  assert.equal(f.button('Applica scena').disabled,false);f.button('Mandate').click();
  assert.equal(f.control('Livello mandata BUS 1 CH 1').value,'-5');assert.equal(f.control('Modalità mandata BUS 1 CH 1').value,'PRE');assert.equal(f.control('Segue mute BUS 1 CH 1').checked,true);
  assert.equal(f.control('Livello mandata BUS 2 CH 1').value,'-8');assert.equal(f.control('Modalità mandata BUS 2 CH 1').value,'POST');
  f.button('Applica scena').click();
  for(const id of ['ch-1','ch-2']){assert.equal(f.C.getStrip(id).level,-90);assert.equal(f.C.getStrip(id).mute,true);}
  assert.deepEqual(plain(f.C.getStrip('ch-3')),before.values['ch-3'],'remaining defaults keep all channel state');
  assert.equal(f.C.getSend('ch-1','bus-1').level,-5);assert.equal(f.C.getSend('ch-1','bus-1').pre,true);
  assert.equal(f.C.getSend('ch-1','bus-2').level,-8);assert.equal(f.C.getSend('ch-1','bus-2').mode,'POST');
  assert.equal(f.C.getSend('ch-2','bus-1').level,-8);assert.equal(f.C.getSend('ch-2','bus-1').pre,false);
  assert.equal(f.C.getSend('ch-2','bus-2').level,-5);assert.equal(f.C.getSend('ch-2','bus-2').mode,'PRE');
  assert.deepEqual(plain(f.C.capture().desk),before.desk,'all channel sources, inserts, output routing and preamps stay exact');
  const persisted=JSON.parse(f.w.localStorage.getItem(f.w.SculptModel.KEY));assert.equal(persisted.values['ch-1'].mute,true);assert.equal(persisted.sends['ch-1>bus-2'].mode,'POST');
  f.button('Applica scena').click();assert.equal(f.button('Annulla importazione').disabled,false,'a no-op reapply retains the last usable undo');
  f.button('Annulla importazione').click();assert.deepEqual(plain(f.C.capture()),before);
  f.button('Chiudi').click();assert.equal(f.subscribers.size,0);
});

test('all identity, fader, mute, primary bus, send, monitor and remaining proposals are editable in the actual preview',t=>{
  const f=fixture(t),before=plain(f.C.capture());f.importText();
  f.edit('Destinazione riga 1','ch-3');f.edit('Nome riga 1','Guitar custom');f.edit('Colore riga 1','#0089ff');f.edit('Nome strumento 1','Guitar Alice');f.edit('Mute riga 1',false);f.edit('Fader riga 1','-14,5');f.edit('Monitor principale 1 strumento 1','bus-2');
  assert.match(f.w.document.querySelector('.cl-edited-note').textContent,/1 canali con mute disattivato, 1 fader/);
  f.button('Mandate').click();
  assert.equal(f.control('Modalità mandata BUS 1 CH 3').value,'POST');assert.equal(f.control('Livello mandata BUS 2 CH 3').value,'-5');
  f.edit('Mandata attiva BUS 1 CH 3',false);f.edit('Livello mandata BUS 1 CH 3','-12,3');f.edit('Modalità mandata BUS 1 CH 3','PRE');f.edit('Livello mandata BUS 2 CH 3','-4,5');f.edit('Modalità mandata BUS 2 CH 3','POST');f.edit('Segue mute BUS 2 CH 3',false);
  f.edit('Nome monitor 1','Keep BUS');f.edit('Colore monitor 1','#f6e100');f.edit('Applica nome e colore al bus 1',false);f.edit('Nome monitor 2','Bass IEM');f.edit('Colore monitor 2','#00b43d');f.edit('Bus monitor 1','bus-7');
  assert.equal(f.control('Livello mandata BUS 7 CH 3').value,'-12,3','changing bus preserves edited sends');assert.equal(f.control('Mandata attiva BUS 7 CH 3').checked,false);
  f.button('Aggiungi monitor').click();assert(f.control('Nome monitor 3'));f.control('Rimuovi monitor 3').click();assert.equal(f.control('Nome monitor 3'),undefined);
  f.button('Rimanenti').click();assert.equal(f.control('Canali rimanenti').value,'keep');f.edit('Canali rimanenti','initialize');f.button('Lascia tutti invariati').click();f.edit('Inizializza CH 4',true);f.edit('Nome rimanente CH 4','Spare input');f.edit('Colore rimanente CH 4','#ff5a2d');f.edit('Fader rimanente CH 4','-30');f.edit('Mute rimanente CH 4',false);
  f.edit('Inizializza CH 4',false);
  assert.equal(f.control('Nome rimanente CH 4').value,before.values['ch-4'].name,'unchecked remaining row shows the current project name');
  assert.equal(f.control('Colore rimanente CH 4').value,before.values['ch-4'].color);
  assert.equal(f.control('Fader rimanente CH 4').value,String(before.values['ch-4'].level),'unchecked row shows its current fader, not the stored reset proposal');
  assert.equal(f.control('Mute rimanente CH 4').checked,before.values['ch-4'].mute);assert.equal(f.control('Nome rimanente CH 4').disabled,true);
  f.edit('Inizializza CH 4',true);
  assert.equal(f.control('Nome rimanente CH 4').value,'Spare input','rechecking restores the edited proposal');assert.equal(f.control('Colore rimanente CH 4').value,'#ff5a2d');assert.equal(f.control('Fader rimanente CH 4').value,'-30');assert.equal(f.control('Mute rimanente CH 4').checked,false);
  assert.deepEqual(plain(f.C.capture()),before,'even editing every section is isolated from the project');assert.equal(f.button('Applica scena').disabled,false);f.button('Applica scena').click();
  const imported=f.C.getStrip('ch-3');assert.equal(imported.name,'Guitar custom');assert.equal(imported.color,'#0089ff');assert.equal(imported.mute,false);assert.equal(imported.level,-14.5);
  assert.equal(f.C.getSend('ch-3','bus-7').on,false);assert.equal(f.C.getSend('ch-3','bus-7').level,-12.3);assert.equal(f.C.getSend('ch-3','bus-7').mode,'PRE');assert.equal(f.C.getSend('ch-3','bus-2').level,-4.5);assert.equal(f.C.getSend('ch-3','bus-2').pre,false);assert.equal(f.C.getSend('ch-3','bus-2').followMute,false);
  assert.deepEqual(plain(f.C.getStrip('bus-7')),before.values['bus-7'],'BUS identity opt-out also preserves its entire audio state');
  assert.equal(f.C.getStrip('bus-2').name,'Bass IEM');assert.equal(f.C.getStrip('bus-2').color,'#00b43d');assert.equal(f.C.getStrip('bus-2').level,before.values['bus-2'].level);assert.equal(f.C.getStrip('bus-2').mute,before.values['bus-2'].mute);
  const spare=f.C.getStrip('ch-4');assert.equal(spare.name,'Spare input');assert.equal(spare.color,'#ff5a2d');assert.equal(spare.level,-30);assert.equal(spare.mute,false);
  assert.deepEqual(plain(f.C.getStrip('ch-1')),before.values['ch-1'],'deselected remaining channels are left untouched');assert.deepEqual(plain(f.C.capture().desk),before.desk);
});

test('invalid preview edits block all changes and a preserved post-fader PRE tap is surfaced for correction',t=>{
  const f=fixture(t);f.C.transact(state=>{state.desk.channels['ch-1'].tap='AFL';},'fixture');const before=plain(f.C.capture());f.importText();
  assert.equal(f.button('Applica scena').disabled,true);assert.match(f.w.document.querySelector('.cl-live-note').textContent,/AFL/);
  f.button('Mandate').click();f.edit('Modalità mandata BUS 1 CH 1','POST');assert.equal(f.button('Applica scena').disabled,false);
  f.button('Canali').click();f.edit('Fader riga 1','loud');assert.equal(f.button('Applica scena').disabled,true);f.edit('Fader riga 1','−∞');assert.equal(f.button('Applica scena').disabled,false);
  f.edit('Destinazione riga 2','ch-1');assert.equal(f.button('Applica scena').disabled,true);assert.match(f.w.document.querySelector('.cl-live-note').textContent,/più righe/);
  assert.deepEqual(plain(f.C.capture()),before);f.button('Chiudi').click();assert.deepEqual(plain(f.C.capture()),before);
});

test('live transition disables Apply and Undo and cannot be bypassed by re-enabling the button',t=>{
  const f=fixture(t),before=plain(f.C.capture());f.importText();f.setLive(true);const apply=f.button('Applica scena');assert.equal(apply.disabled,true);
  apply.disabled=false;apply.click();assert.deepEqual(plain(f.C.capture()),before);assert.match(f.w.document.querySelector('.cl-status').textContent,/offline/);
  f.setLive(false);assert.equal(apply.disabled,false);apply.click();assert.equal(f.C.getStrip('ch-1').name,'Kick');f.setLive(true);assert.equal(f.button('Annulla importazione').disabled,true);
});

test('a newer text import cancels a local PDF read and discards its late completion',async t=>{
  const f=fixture(t);let resolveRead,observedSignal,observedFile;f.w.SculptPdfReader={readFile(file,options){observedFile=file;observedSignal=options.signal;return new Promise(resolve=>{resolveRead=resolve;});}};
  f.w.SculptChannelPreview.open();const file=new f.w.File(['sample'],'rider.pdf',{type:'application/pdf'}),input=f.control('Scegli channel list PDF');Object.defineProperty(input,'files',{value:[file]});input.dispatchEvent(new f.w.Event('change',{bubbles:true}));assert.equal(observedFile,file);assert.equal(f.button('Applica scena').disabled,true);
  f.edit('Testo della channel list','9 Current Vox');f.button('Leggi il testo').click();assert.equal(observedSignal.aborted,true);
  resolveRead({pages:[{items:[{text:'1 Old Piano',x:10,y:10,width:80,height:10}]}]});await Promise.resolve();await Promise.resolve();
  assert.equal(f.control('Nome riga 9').value,'Current Vox');assert.equal(f.control('Destinazione riga 9').value,'ch-9');assert.equal(f.w.document.querySelectorAll('.cl-channels-table tbody tr[data-row-id]').length,1);
});

test('monitor preview preserves full PDF names and stereo output references beside editable bus names',t=>{
  const f=fixture(t),before=plain(f.C.capture()),name='IEM Tastierista principale';
  f.importText(['CHANNEL LIST','CH\tStrumento\tMic/DI','1\tPiano L\tDI','2\tPiano R\tDI','Lista uscite','Uscita\tDestinazione\tFormato','AUX 3\t'+name+'\tL','AUX 4\t'+name+'\tR'].join('\n'));
  f.button('Mandate').click();const source=f.w.document.querySelector('.cl-monitor-source');assert(source);assert.match(source.textContent,/IEM Tastierista principale/);assert.match(source.textContent,/AUX 3 \/ AUX 4/);assert.match(source.textContent,/Formato: L\/R/);
  assert.equal(f.control('Nome monitor 1').value,name.slice(0,16).trim());assert.match(f.w.document.querySelector('.cl-monitor-panel .cl-tab-note').textContent,/routing fisico e modalità stereo del bus restano invariati/);
  f.edit('Nome monitor 1','IEM Keys');assert.match(source.textContent,/IEM Tastierista principale/,'editing the proposed name preserves the source reference');assert.deepEqual(plain(f.C.capture()),before);
});


test('blank channels can start a scene, need no monitor, reserve a free slot and apply with full routing preservation',t=>{
  const f=fixture(t),before=plain(f.C.capture());f.w.SculptChannelPreview.open();f.button('Aggiungi canale vuoto').click();
  assert.equal(f.control('Nome canale vuoto CH 1').value,'CH 1');assert.equal(f.control('Mute canale vuoto CH 1').checked,true);assert.equal(f.control('Fader canale vuoto CH 1').value,'−∞');
  assert.equal(f.control('Monitor principale 1 strumento 1').value,'');assert.equal(f.control('Monitor principale 2 strumento 1').value,'');assert.equal(f.button('Applica scena').disabled,false);
  f.button('Aggiungi canale vuoto').click();assert.equal(f.control('Destinazione canale vuoto CH 2').value,'ch-2');
  f.control('Rimuovi canale vuoto CH 2').click();assert.equal(f.control('Destinazione canale vuoto CH 2'),undefined);
  f.button('Mandate').click();assert.match(f.w.document.querySelector('.cl-send-editor').textContent,/Nessun monitor assegnato/);assert.equal(f.button('Applica scena').disabled,false);
  assert.deepEqual(plain(f.C.capture()),before);f.button('Applica scena').click();assert.equal(f.C.getStrip('ch-1').name,'CH 1');assert.equal(f.C.getStrip('ch-1').mute,true);assert.equal(f.C.getStrip('ch-1').level,-90);
  assert.deepEqual(plain(f.C.capture().desk),before.desk);assert.deepEqual(plain(f.C.capture().sends),before.sends,'a blank scene with no monitor must preserve every existing send');
  f.button('Annulla importazione').click();assert.deepEqual(plain(f.C.capture()),before);
});

test('two optional principal monitors are assigned once for every linked instrument channel',t=>{
  const f=fixture(t),before=plain(f.C.capture());f.importText('1 Kick\n2 Snare\n3 Bass\n4 Voce');
  assert.equal(f.w.document.querySelectorAll('.cl-instrument-row').length,3,'Kick and Snare share one assignment row');
  assert.match(f.w.document.querySelector('.cl-group-members').textContent,/2 canali collegati · CH 1, CH 2/);
  f.edit('Monitor principale 1 strumento 1','bus-2');f.edit('Monitor principale 2 strumento 1','bus-3');
  assert(![...f.control('Monitor principale 1 strumento 1').options].some(option=>option.value==='bus-3'),'the second principal cannot be chosen twice');
  f.button('Mandate').click();assert.equal(f.control('Modifica mandate per').value,'instrument');
  assert.equal(f.control('Livello mandata BUS 2 CH 1').value,'-5');assert.equal(f.control('Modalità mandata BUS 3 CH 1').value,'PRE');assert.equal(f.control('Livello mandata BUS 1 CH 1').value,'-8');
  const snare=[...f.control('Canale per le mandate').options].find(option=>option.textContent.includes('CH 2')).value;f.edit('Canale per le mandate',snare);
  assert.equal(f.control('Monitor principale 1 dello strumento').value,'bus-2');assert.equal(f.control('Monitor principale 2 dello strumento').value,'bus-3');assert.equal(f.control('Livello mandata BUS 3 CH 2').value,'-5');
  f.edit('Monitor principale 1 dello strumento','');f.edit('Monitor principale 2 dello strumento','');assert.equal(f.button('Applica scena').disabled,false);
  f.edit('Canale per le mandate',[...f.control('Canale per le mandate').options].find(option=>option.textContent.includes('CH 1')).value);
  assert.equal(f.control('Monitor principale 1 dello strumento').value,'');assert.equal(f.control('Monitor principale 2 dello strumento').value,'');assert.equal(f.control('Modalità mandata BUS 2 CH 1').value,'POST');
  f.edit('Monitor principale 2 dello strumento','bus-3');assert.equal(f.button('Applica scena').disabled,false,'the second slot is usable while the first is None');
  f.button('Applica scena').click();for(const channel of ['ch-1','ch-2']){assert.equal(f.C.getSend(channel,'bus-3').level,-5);assert.equal(f.C.getSend(channel,'bus-3').pre,true);assert.equal(f.C.getSend(channel,'bus-2').level,-8);assert.equal(f.C.getSend(channel,'bus-2').pre,false);}
  assert.deepEqual(plain(f.C.capture().desk),before.desk);f.button('Annulla importazione').click();assert.deepEqual(plain(f.C.capture()),before);
});

test('group send editing propagates only edited fields and individual overrides remain visible as mixed values',t=>{
  const f=fixture(t);f.importText('1 Piano L\n2 Piano R\n3 Bass');f.button('Mandate').click();
  const right=[...f.control('Canale per le mandate').options].find(option=>option.textContent.includes('CH 2')).value,left=f.control('Canale per le mandate').value;
  f.edit('Livello mandata BUS 1 CH 1','-3,2');f.edit('Mandata attiva BUS 2 CH 1',false);f.edit('Canale per le mandate',right);
  assert.equal(f.control('Livello mandata BUS 1 CH 2').value,'-3,2');assert.equal(f.control('Mandata attiva BUS 2 CH 2').checked,false);
  f.edit('Modifica mandate per','channel');f.edit('Livello mandata BUS 1 CH 2','-9');f.edit('Segue mute BUS 2 CH 2',false);
  f.edit('Canale per le mandate',left);assert.equal(f.control('Livello mandata BUS 1 CH 1').value,'-3,2');assert.equal(f.control('Segue mute BUS 2 CH 1').checked,true);
  f.edit('Modifica mandate per','instrument');assert.match(f.w.document.querySelector('[data-bus-id="bus-1"] .cl-send-mixed').textContent,/livello/);
  f.edit('Modalità mandata BUS 1 CH 1','POST');assert.match(f.w.document.querySelector('[data-bus-id="bus-1"] .cl-send-mixed').textContent,/livello/,'editing mode does not overwrite separate gain values');
  f.edit('Livello mandata BUS 1 CH 1','bad');assert.equal(f.button('Applica scena').disabled,true,'invalid typed group values cannot silently apply old sends');f.edit('Livello mandata BUS 1 CH 1','-7');assert.equal(f.button('Applica scena').disabled,false);assert.equal(f.w.document.querySelector('[data-bus-id="bus-1"] .cl-send-mixed').textContent,'');
  f.button('Applica scena').click();for(const channel of ['ch-1','ch-2']){assert.equal(f.C.getSend(channel,'bus-1').level,-7);assert.equal(f.C.getSend(channel,'bus-1').pre,false);assert.equal(f.C.getSend(channel,'bus-2').on,false);}
  assert.equal(f.C.getSend('ch-1','bus-2').followMute,true);assert.equal(f.C.getSend('ch-2','bus-2').followMute,false);
});

test('instrument membership can be joined and split, and a blank row never gains unintended monitor sends',t=>{
  const f=fixture(t);f.importText('1 Kick\n2 Snare\n3 Bass');
  const drums=f.control('Strumento riga 1').value;f.edit('Strumento riga 3',drums);assert.equal(f.w.document.querySelectorAll('.cl-instrument-row').length,1);
  f.edit('Nome strumento 1','Musicista A');f.edit('Monitor principale 2 strumento 1','bus-2');f.edit('Strumento riga 3','');
  assert.equal(f.w.document.querySelectorAll('.cl-instrument-row').length,2);assert.equal(f.control('Monitor principale 2 strumento 2').value,'bus-2','splitting preserves the current proposal');
  f.edit('Monitor principale 1 strumento 1','');assert.equal(f.control('Monitor principale 1 strumento 2').value,'bus-1','independent channel keeps its own primary');
  f.button('Aggiungi canale vuoto').click();assert.equal(f.control('Destinazione canale vuoto CH 4').value,'ch-4');assert.equal(f.control('Monitor principale 1 strumento 3').value,'');assert.equal(f.control('Monitor principale 2 strumento 3').value,'');
  f.control('Modifica mandate canale vuoto CH 4').click();assert.equal(f.control('Modifica mandate per').value,'channel');assert.equal(f.control('Mandata attiva BUS 1 CH 4').checked,false);assert.equal(f.control('Livello mandata BUS 2 CH 4').value,'−∞');
  f.button('Applica scena').click();assert.equal(f.C.getStrip('ch-4').name,'CH 4');assert.equal(f.C.getSend('ch-4','bus-1').on,false);assert.equal(f.C.getSend('ch-4','bus-2').level,-90);assert.equal(f.C.getSend('ch-3','bus-1').pre,true);assert.equal(f.C.getSend('ch-1','bus-1').pre,false);
});

test('starting with a blank channel cancels a pending PDF and cannot be overwritten by its late result',async t=>{
  const f=fixture(t);let resolveRead,signal;f.w.SculptPdfReader={readFile(file,options){signal=options.signal;return new Promise(resolve=>{resolveRead=resolve;});}};
  f.w.SculptChannelPreview.open();const input=f.control('Scegli channel list PDF');Object.defineProperty(input,'files',{value:[new f.w.File(['pdf'],'rider.pdf',{type:'application/pdf'})]});input.dispatchEvent(new f.w.Event('change',{bubbles:true}));
  f.button('Aggiungi canale vuoto').click();assert.equal(signal.aborted,true);assert.equal(f.button('Applica scena').disabled,false);
  resolveRead({pages:[{items:[{text:'9 Late Piano',x:10,y:10,width:80,height:10}]}]});await Promise.resolve();await Promise.resolve();
  assert(f.control('Nome canale vuoto CH 1'));assert.equal(f.control('Nome riga 9'),undefined);
});
