'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Importer=require('../dist/channel-list.js'),Model=require('../dist/model.js');
const {JSDOM}=require('jsdom');
const base=path.join(__dirname,'../dist'),plain=value=>JSON.parse(JSON.stringify(value));
const item=(text,x,y,width=text.length*6)=>({text,x,y,width,height:10});
const header=y=>[item('CH',35,y),item('Instrument',95,y),item('Mic/DI',310,y),item('Stand',420,y)];
const record=(number,name,mic,y)=>[item(String(number),35,y),item(name,95,y),...(mic?[item(mic,310,y)]:[])];
function documentFixture(){
  return {pages:[
    {pageNumber:1,items:[item('CHANNEL LIST',35,20),...header(45),item('DRUMS',35,65),...record(1,'Kick In','Beta 91',85),...record(2,'Snare Top','SM57',105),...record(3,'','',125),item('KEYBOARDS',35,145),...record('15–16','Nord L/R','DI stereo',165),item('Page 1 of 2',250,760)]},
    {pageNumber:2,items:[...header(45),...record(20,'Lead Vocal Gianluca','e935',65),...record(41,'Guest Voice','SM58',85),...record('AUX 2','Walk-in','USB',105),item('OUTPUT LIST',35,150),...header(170),...record(1,'IEM singer','',190),...record(2,'Wedge','',210)]}
  ]};
}
function stateFixture(){
  const state=Model.defaults();state.desk={channels:{'ch-1':{source:'A:7',mode:'M'}},outputs:{'LCL:1':{source:'BUS:6',side:'L'}},sources:{'A:7':{gain:31,phantom:true}},layers:[{id:'custom',rows:{top:['bus-6'],bottom:['ch-1']}}],macros:[{id:1,name:'Keep'}]};
  Model.setSend(state,'ch-1','bus-6',{level:-13.5,on:true,pre:false,pan:28});
  let live=false,transactions=0;
  const env={model:Model,controller:{getState:()=>state,transact(fn){transactions++;fn(state);return true;}},live:{isLive:()=>live,canPersist:()=>!live}};
  return {state,env,get transactions(){return transactions;},setLive:value=>{live=value;}};
}
function appFixture(t){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window;
  t.after(()=>dom.window.close());
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.IntersectionObserver=class{observe(){}disconnect(){}};
  w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.setPointerCapture=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  for(const name of ['plugin-data.js','model.js','app.js','desk.js','shell.js','channel-list.js','channel-list-scene.js','channel-list-preview.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),dom.getInternalVMContext(),{filename:name});
  const C=w.SculptController,liveSubscribers=new Set();let live=false;
  w.SculptLive={isLive:()=>live,canPersist:()=>!live,applying:()=>false,hasStripValue:()=>true,reviewMutation:()=>{throw new Error('Importer must never reach a live write');},subscribe:fn=>{liveSubscribers.add(fn);return()=>liveSubscribers.delete(fn);}};
  return {w,C,dom,liveSubscribers,setLive(value){live=value;for(const fn of liveSubscribers)fn();},button(label){return [...w.document.querySelectorAll('.cl-modal button')].find(b=>b.textContent===label);}};
}

test('a two-page rider imports input columns, preserves gaps and rejects output-list rows',()=>{
  const result=Importer.parseDocument(documentFixture());
  assert.deepEqual(result.rows.map(r=>[r.sourceNumber,r.name,r.targetId]),[
    ['1','Kick In','ch-1'],['2','Snare Top','ch-2'],['3','','ch-3'],['15','Nord L','ch-15'],['16','Nord R','ch-16'],['20','Lead Vocal Gianl','ch-20'],['41','Guest Voice',''],['AUX 2','Walk-in','aux-2']
  ]);
  assert.equal(result.rows[0].color,'#e31b44');assert.equal(result.rows[3].color,'#e0e0e0','group title proposes the keyboard colour');
  assert.equal(result.rows[5].originalName,'Lead Vocal Gianluca');assert.equal(result.rows[5].pageNumber,2);
  assert.equal(result.rows[2].selected,false,'an empty numbered row cannot replace a channel name');assert.equal(result.rows[6].selected,false,'41 is not silently mapped to AUX 1');
  assert(!result.rows.some(r=>/SM57|Beta 91|e935|IEM|Wedge/.test(r.name)));
});

test('separate text runs on the same baseline form one multiword name and preserve numbered duplicates',()=>{
  const result=Importer.parseDocument({pages:[{items:[...header(20),item('1',35,40),item('Acoustic',95,40),item('Guitar',150,40.8),item('DI',310,40),...record(1,'Vocal','SM58',60)]}]});
  assert.equal(result.rows[0].name,'Acoustic Guitar');assert.equal(result.rows.length,2);
  const validation=Importer.validateRows(result.rows);assert.equal(validation.ok,false);assert.match(validation.errors[0],/CH 1.*più righe/);
  result.rows[1].selected=false;assert.equal(Importer.validateRows(result.rows).ok,true);
});

test('side-by-side channel tables keep their own number/name/microphone columns',()=>{
  const rows=Importer.parseDocument({pages:[{items:[item('CH',20,10),item('Name',60,10),item('Mic',190,10),item('CH',320,10),item('Name',360,10),item('Mic',490,10),item('1',20,30),item('Kick',60,30),item('B52',190,30),item('17',320,30),item('Vox',360,30),item('SM58',490,30)]}]}).rows;
  assert.deepEqual(rows.map(r=>[r.targetId,r.name]),[['ch-1','Kick'],['ch-17','Vox']]);
});

test('numberless names remain reviewable and ambiguous channel ranges are not patched',()=>{
  const rows=Importer.parseDocument({pages:[{items:[...header(20),item('Bass DI',95,40),item('DI',310,40),...record('4-7','Drums','',60),...record('8','Keys L/R','',80)]}]}).rows;
  assert.equal(rows[0].targetId,'');assert.equal(rows[0].name,'Bass DI');assert.equal(rows[0].selected,false);
  assert.equal(rows[1].targetId,'');assert.match(rows[1].notes.join(' '),/Numerazione multipla/);
  assert.equal(rows[2].targetId,'ch-8');assert.equal(rows[2].name,'Keys L/R','a single numbered stereo source remains one channel');
});

test('pasted lists accept simple numbering, explicit AUX and tab/pipe-separated columns',()=>{
  const simple=Importer.parseText('1 Kick\n2. Snare\nAUX 8 Playback\n48 Guest\n');
  assert.deepEqual(simple.rows.map(r=>r.targetId),['ch-1','ch-2','aux-8','']);
  for(const separator of ['\t',' | ','   ']){
    const rows=Importer.parseText(['CH'+separator+'Nome'+separator+'Mic','1'+separator+'Kick'+separator+'B52','2'+separator+'Bass DI'+separator+'DI'].join('\n')).rows;
    assert.deepEqual(rows.map(r=>r.name),['Kick','Bass DI']);
  }
  assert.equal(Importer.parseText('Kick\nSnare').rows.every(r=>r.targetId===''&&!r.selected),true);
});

test('image-only PDF reports OCR as unavailable and no text is fabricated',()=>{
  assert.throws(()=>Importer.parseDocument({pages:[{items:[]}]}),/OCR.*non ancora disponibile/);
  const result=Importer.parseDocument({pages:[{items:[item('Technical rider / band details',20,20)]}]});
  assert.equal(result.rows.length,0);assert.match(result.warnings[0],/Non ho riconosciuto/);
  const partial=Importer.parseDocument({pages:[{pageNumber:1,items:[]},{pageNumber:2,items:[...header(20),...record(1,'Kick','B52',40)]}]});
  assert.equal(partial.rows.length,1);assert.match(partial.warnings[0],/non lette: 1/,'mixed scans must not appear to have been fully read');
});

test('validation rejects arbitrary output destinations, missing names and illegal colours together',()=>{
  const row={id:'bad',selected:true,targetId:'bus-1',name:'',color:'url(https://example.invalid)'};
  const result=Importer.validateRows([row]);assert.equal(result.ok,false);assert.equal(result.errors.length,3);
  row.targetId='ch-40';row.name='A name longer than sixteen';row.color='#0089ff';assert.equal(Importer.validateRows([row]).ok,false);
});

test('instrument colours follow Gianluca’s requested palette and remain proposals',()=>{
  const expected=[['Kick','#e31b44'],['Basso','#00b43d'],['Chitarra','#0089ff'],['Keys','#e0e0e0'],['Voce','#ff7679'],['Sax','#f6e100'],['Clarinetto basso','#f6e100'],['Bass clarinet','#f6e100'],['Violino','#ff5a2d']];
  for(const [name,color]of expected)assert.equal(Importer.suggestColor(name).color,color,name);
  const rows=Importer.parseText('1 Kick').rows;rows[0].color='#a52ff6';assert.equal(Importer.validateRows(rows).ok,true,'the proposed colour is editable');
});

test('Producer desktop stage printing enters the input table only at its explicit columns and skips quote rows',()=>{
  const result=Importer.parseDocument({pages:[{items:[item('STAGE PLOT',20,10),item('1 Vocal on stage',80,35),item('AUX 7',270,45),item('CH',20,100),item('Sorgente',80,100),item('DI / Mic',250,100),item('Asta',340,100),item('Note',430,100),item('1',20,125),item('Basso',80,125),item('DI',250,125),item('Asta alta',340,125),item('PREVENTIVO',20,160),item('1 Service luci',20,185)]}]});
  assert.deepEqual(result.rows.map(row=>[row.targetId,row.originalName]),[['ch-1','Basso']]);
});

test('instrument proposals share explicit descriptors and stereo parts while keeping two guitars and voices distinct',()=>{
  const rows=Importer.parseText('1 Kick\n2 Snare up\n3 tom1\n4 Over L\n5 Over R\n6 Key L · Mario\n7 Key R · Mario\n8 Chitarra 1\n9 Chitarra 2\n10 Voce\n11 Voce\n12 Sequenze L\n13 Sequenze R\n14 Click').rows;
  assert.equal(new Set(rows.slice(0,5).map(row=>row.instrumentKey)).size,1);
  assert.equal(rows[5].instrumentKey,rows[6].instrumentKey);assert.equal(rows[5].instrumentName,'Mario');
  assert.notEqual(rows[7].instrumentKey,rows[8].instrumentKey);assert.notEqual(rows[9].instrumentKey,rows[10].instrumentKey);
  assert.deepEqual(rows.slice(9,11).map(row=>row.instrumentName),['Voce 1','Voce 2']);
  assert.equal(new Set(rows.slice(11).map(row=>row.instrumentKey)).size,1);
  assert.equal(rows[2].color,'#e31b44');assert.equal(rows[3].color,'#e31b44');
});

test('public import API prepares the scene in one transaction and preserves patch, processing and unassigned sends',()=>{
  const f=stateFixture(),before=plain(Model.serialize(f.state)),rows=Importer.parseText('1 New Vocal\n2 New Bass\nAUX 1 Player').rows;
  const result=Importer.applyRows(rows,f.env);assert.equal(result.ok,true);assert.equal(f.transactions,1);
  for(const row of rows){const strip=Model.find(f.state,row.targetId);assert.equal(strip.name,row.name);assert.equal(strip.mute,true);assert.equal(strip.level,-90);}
  assert.deepEqual(f.state.desk,before.desk);assert.deepEqual(f.state.sends['ch-1>bus-6'],before.sends['ch-1>bus-6']);
  assert.equal(Model.getSend(f.state,'ch-1','bus-1').level,-5);assert.equal(Model.getSend(f.state,'ch-1','bus-1').mode,'PRE');
  assert.equal(Model.getSend(f.state,'ch-1','bus-2').level,-8);assert.equal(Model.getSend(f.state,'ch-1','bus-2').mode,'POST');
  const restored=Model.restore(Model.serialize(f.state));assert.equal(Model.find(restored,'ch-1').mute,true);assert.equal(Model.find(restored,'ch-2').level,-90);assert.deepEqual(restored.sends,f.state.sends);
  assert.equal(Importer.undoRows(result.undo,f.env).ok,true);assert.deepEqual(plain(Model.serialize(f.state)),before);
});

test('duplicate/unassigned selected rows reject the entire plan without a partial first write',()=>{
  const f=stateFixture(),before=plain(f.state),rows=Importer.parseText('1 First\n1 Second\n41 Guest').rows;
  assert.equal(Importer.applyRows(rows,f.env).ok,false);assert.equal(f.transactions,0);assert.deepEqual(f.state,before);
  rows[1].targetId='ch-2';rows[2].selected=true;assert.equal(Importer.applyRows(rows,f.env).ok,false);assert.deepEqual(f.state,before);
});

test('live mode and a session transition at commit both prohibit every import mutation',()=>{
  const f=stateFixture(),before=plain(f.state),rows=Importer.parseText('1 Imported').rows;
  f.setLive(true);assert.equal(Importer.applyRows(rows,f.env).ok,false);assert.equal(f.transactions,0);assert.deepEqual(f.state,before);
  f.setLive(false);const transact=f.env.controller.transact;f.env.controller.transact=fn=>{f.setLive(true);return transact(fn);};
  assert.equal(Importer.applyRows(rows,f.env).ok,false);assert.deepEqual(f.state,before);
});

test('undo preserves unrelated edits but refuses a later imported fader or name conflict',()=>{
  const f=stateFixture(),oldName=Model.find(f.state,'ch-1').name,rows=Importer.parseText('1 Imported').rows;
  const first=Importer.applyRows(rows,f.env);Model.patchStrip(Model.find(f.state,'ch-1'),{pan:27});
  assert.equal(Importer.undoRows(first.undo,f.env).ok,true);assert.equal(Model.find(f.state,'ch-1').name,oldName);assert.equal(Model.find(f.state,'ch-1').pan,27);
  const second=Importer.applyRows(rows,f.env);Model.patchStrip(Model.find(f.state,'ch-1'),{level:-27});assert.equal(Importer.undoRows(second.undo,f.env).ok,false);assert.equal(Model.find(f.state,'ch-1').level,-27);
  Model.patchStrip(Model.find(f.state,'ch-1'),{name:'Edited later'});assert.equal(Importer.undoRows(second.undo,f.env).ok,false);assert.equal(Model.find(f.state,'ch-1').name,'Edited later');
  f.setLive(true);assert.equal(Importer.undoRows(second.undo,f.env).ok,false);
});

// Editable-preview integration and cancellation are exercised in channel-list-preview.test.cjs.

test('the channel editor selects every imported family colour and preserves custom project colours',t=>{
  const f=appFixture(t),I=f.w.SculptChannelList;
  vm.runInContext(fs.readFileSync(path.join(base,'editor.js'),'utf8'),f.dom.getInternalVMContext(),{filename:'editor.js'});
  const rows=I.parseText('1 Kick\n2 Bass\n3 Guitar\n4 Keys\n5 Vocal\n6 Sax\n7 Violin').rows;
  assert.equal(I.applyRows(rows).ok,true);
  const before=plain(f.C.capture().values),editor=f.w.SculptEditor;
  const swatches=()=>[...f.w.document.querySelectorAll('.editor-colors .editor-color')];
  const selected=()=>swatches().filter(choice=>!choice.hidden&&choice.getAttribute('aria-pressed')==='true');
  const names=['Rosso','Verde','Blu','Bianco','Rosa','Giallo','Arancio'];
  for(let i=0;i<rows.length;i++){
    editor.open(rows[i].targetId);
    assert.equal(swatches().filter(choice=>!choice.hidden).length,19);
    assert.equal(selected().length,1);
    assert.equal(selected()[0].getAttribute('aria-label'),'Colore '+names[i]);
    assert.equal(selected()[0].style.getPropertyValue('--swatch'),rows[i].color);
    editor.close();
  }
  assert.deepEqual(plain(f.C.capture().values),before,'opening identity never normalizes or rewrites imported colours');
  assert.deepEqual(Array.from(I.palette,([color])=>color).sort(),Array.from(require('../dist/wing-map.js').COLORS).sort(),'importer and editor match the live palette values');
  f.C.updateStrip('ch-1',{color:'#abcdef'});editor.open('ch-1');
  assert.equal(selected().length,1);assert.equal(selected()[0].getAttribute('aria-label'),'Colore attuale del progetto #abcdef');assert.equal(f.C.getStrip('ch-1').color,'#abcdef');
  swatches().find(choice=>choice.getAttribute('aria-label')==='Colore Rosso').click();
  assert.equal(f.C.getStrip('ch-1').color,'#e31b44');assert.equal(f.C.getStrip('ch-1').name,'Kick');
  assert.equal(selected().length,1);assert.equal(selected()[0].getAttribute('aria-label'),'Colore Rosso');
  assert.equal(swatches().filter(choice=>!choice.hidden).length,19);
  editor.close();
});
