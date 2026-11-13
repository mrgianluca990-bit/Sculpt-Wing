'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{Worker:NodeWorker}=require('node:worker_threads');
const Importer=require('../dist/channel-list.js'),Scene=require('../dist/channel-list-scene.js'),Model=require('../dist/model.js');
const root=path.resolve(__dirname,'..'),fixtureDir=path.join(__dirname,'fixtures/pdf');
const expected=JSON.parse(fs.readFileSync(path.join(fixtureDir,'producer-expected.json'),'utf8'));
const activeWorkers=new Set();
class LocalPdfWorker extends EventTarget{
  constructor(url,options){
    super();assert.equal(options.type,'module');assert.equal(url.href,pathToFileURL(path.join(root,'dist/pdf.worker.js')).href);
    this.thread=new NodeWorker(path.join(__dirname,'helpers/pdf-worker-host.mjs'),{workerData:{url:url.href}});activeWorkers.add(this);
    this.thread.on('message',data=>this.dispatchEvent(new MessageEvent('message',{data})));
    this.thread.on('error',()=>this.dispatchEvent(new Event('error')));
    this.thread.on('messageerror',()=>this.dispatchEvent(new Event('messageerror')));
  }
  postMessage(data,transfer){this.thread.postMessage(data,transfer);}
  terminate(){activeWorkers.delete(this);return this.thread.terminate();}
}
// Exercise the shipped reader and worker bundles. Only the browser's Worker
// transport is adapted for Node; extraction and parsing use production code.
globalThis.Worker=LocalPdfWorker;
globalThis.document={baseURI:pathToFileURL(path.join(root,'dist/index.html')).href};
require('../dist/pdf-reader.js');
const parsedFiles=new Map();
async function parseFixture(name){
  if(!parsedFiles.has(name))parsedFiles.set(name,(async()=>{
    const file=new File([fs.readFileSync(path.join(fixtureDir,name))],name,{type:'application/pdf'});
    const document=await globalThis.SculptPdfReader.readFile(file);
    assert.equal(activeWorkers.size,0,'the real PDF worker is released');
    return Importer.parseDocument(document);
  })());
  return structuredClone(await parsedFiles.get(name));
}
function fixture(){
  const state=Model.defaults();
  state.desk={channels:{},sources:{'A:7':{gain:29,phantom:true,trim:-3,mode:'M'},'CRD:9':{gain:0,phantom:false,mode:'ST'}},outputs:{'LCL:1':{source:'BUS:12',side:'R',tap:'POST'},'A:3':{source:'CH:9',side:'L',tap:'PRE'}},users:[{id:1,source:'CH:18',tap:'POST'}],io:{globalAlt:true},fx:[{slot:1,stripId:'ch-1',position:'post',model:'HALL',params:{decay:2.4}}],layers:[{id:'custom',rows:{top:['bus-12','ch-4'],bottom:['ch-1','ch-22']}}],macros:[{id:1,name:'Preserved macro'}]};
  for(const strip of Model.list(state))state.desk.channels[strip.id]={source:'A:7',altSource:'CRD:9',useAlt:true,sourceAuto:false,mode:'ST',tap:'PFL',preFx:null,postFx:strip.id==='ch-1'?1:null,preFxOn:false,postFxOn:true,order:['eq','gate','dyn','insert'],gateSC:{source:'CH:8',tap:'IN'},dynSC:{source:'CH:9',tap:'FILT'}};
  Model.setSend(state,'ch-1','bus-1',{on:false,level:-23,pre:false,pan:37,panLink:false,tap:'PRE_EQ',followMute:false});
  Model.setSend(state,'ch-1','bus-12',{on:true,level:-2,pre:true});
  Model.setSend(state,'ch-1','main-1',{on:true,level:-3,pre:false});
  Model.setSend(state,'ch-22','bus-1',{on:true,level:-17,pre:true});
  let transactions=0;
  return {state,get transactions(){return transactions;},env:{model:Model,controller:{getState:()=>state,transact(fn){transactions++;fn(state);return true;}},live:{isLive:()=>false,canPersist:()=>true}}};
}

test('actual Producer channel-list and complete PDFs retain every source, ignore non-input sections and combine stereo monitor rows',async()=>{
  for(const [filename,pages]of [['producer-channel-list.pdf',2],['producer-complete.pdf',4]]){
    const parsed=await parseFixture(filename);
    assert.equal(parsed.pageCount,pages);
    assert.deepEqual(parsed.rows.map(row=>row.originalName),expected.channelNames,'DI / Mic, stand and notes must never enter names; wrapped source lines must stay in their numbered row');
    assert.deepEqual(parsed.rows.map(row=>row.targetId),expected.channelNames.map((_,i)=>'ch-'+(i+1)));
    assert(parsed.rows.every(row=>row.selected));
    assert.equal(parsed.monitors.length,4,'five physical AUX rows describe four logical monitor mixes');
    assert.deepEqual(parsed.monitors.map(m=>[m.originalName,m.sourceNumbers,m.format]),[
      ['Batteria',['AUX 1'],'Mono'],['Basso',['AUX 2'],'Mono'],
      ['IEM Tastiere Nord',['AUX 3','AUX 4'],'L/R'],
      ['Monitor voce con destinazione molto lunga su due righe',['AUX 7'],'Mono']
    ]);
    const group=indices=>new Set(indices.map(i=>parsed.rows[i-1].instrumentKey));
    assert.equal(group([1,2,3,4,5,6,7,8]).size,1,'eight drum inputs share one instrument');
    assert.equal(group([12,13]).size,1,'a named stereo keyboard remains one instrument');
    assert.equal(group([14,15,16]).size,1,'Piano L/R/Buca retain the complete wrapped descriptor');
    assert.equal(group([19,20,21]).size,1,'sequences and their click share one instrument');
    assert.equal(group([10,11]).size,2,'separate guitars cannot be merged by colour');
    assert.equal(group([17,18]).size,2,'separate voices cannot be merged by colour');
    assert.equal(parsed.rows[0].color,'#e31b44');assert.equal(parsed.rows[8].color,'#00b43d');assert.equal(parsed.rows[11].color,'#e0e0e0');
  }
});

test('Producer PDF permits optional principals and applies linked monitor choices while preserving all saved routing',async()=>{
  const f=fixture(),before=structuredClone(f.state),beforeSaved=Model.serialize(before),parsed=await parseFixture('producer-complete.pdf'),draft=Scene.prepareDraft(parsed,f.state);
  assert.deepEqual(f.state,before,'reading and preview preparation are side-effect free');
  assert.deepEqual(draft.rows.slice(0,8).map(row=>row.primaryBusId),Array(8).fill('bus-1'));
  assert.equal(draft.rows[8].primaryBusId,'bus-2');
  assert.deepEqual(draft.rows.slice(11,13).map(row=>row.primaryBusId),['bus-3','bus-3']);
  const unmatched=[9,10,13,14,15,16,17,18,19,20];
  assert(unmatched.every(index=>draft.rows[index].primaryBusId===''),'ambiguous or absent associations stay available for explicit review');
  assert.equal(Scene.validateDraft(draft,f.state).ok,true,'unmatched principal is optional');assert.equal(f.transactions,0);assert.deepEqual(f.state,before);
  // Simulate the user's explicit choices in the editable preview.
  assert.equal(Scene.setMonitorBus(draft,draft.monitors[3].id,'bus-10').ok,true);
  const selectedGroups=new Set();
  for(const index of unmatched){const row=draft.rows[index];if(selectedGroups.has(row.instrumentKey))continue;selectedGroups.add(row.instrumentKey);assert.equal(Scene.setPrimary(draft,row.id,'bus-10').ok,true);}
  assert.equal(selectedGroups.size,6,'six instrument choices assign ten related channels');
  assert.equal(Scene.changeRemainingMode(draft,'initialize',f.state).ok,true);
  draft.remaining.find(row=>row.targetId==='ch-22').initialize=false;
  assert.equal(Scene.validateDraft(draft,f.state).ok,true);
  const result=Scene.applyDraft(draft,f.env);
  assert.equal(result.ok,true);assert.equal(f.transactions,1);assert.equal(result.importedCount,21);assert.equal(result.sendCount,84);assert.equal(result.remainingCount,26);
  for(const row of draft.rows){
    const strip=Model.find(f.state,row.targetId);
    assert.equal(strip.name,row.name);assert.equal(strip.color,row.color);assert.equal(strip.mute,true);assert.equal(strip.level,-90);
    for(const monitor of draft.monitors){
      const send=Model.getSend(f.state,row.targetId,monitor.busId),primary=monitor.busId===row.primaryBusId;
      assert.equal(send.on,true);assert.equal(send.followMute,true);
      assert.equal(send.level,primary?-5:-8);assert.equal(send.mode,primary?'PRE':'POST');assert.equal(send.pre,primary);
    }
  }
  assert.equal(JSON.stringify(f.state.desk),JSON.stringify(before.desk),'input/alternate sources, inserts, output patch, preamps and shared taps remain byte-for-byte identical');
  assert.deepEqual(Model.find(f.state,'ch-22'),Model.find(before,'ch-22'),'the user can exempt a remaining input');
  assert.deepEqual(f.state.sends['ch-22>bus-1'],before.sends['ch-22>bus-1']);
  assert.deepEqual(f.state.sends['ch-1>bus-12'],before.sends['ch-1>bus-12']);
  assert.deepEqual(f.state.sends['ch-1>main-1'],before.sends['ch-1>main-1']);
  const send=Model.getSend(f.state,'ch-1','bus-1');assert.equal(send.pan,37);assert.equal(send.panLink,false);assert.equal(send.tap,'PRE_EQ');
  const saved=JSON.parse(JSON.stringify(Model.serialize(f.state))),restored=Model.restore(saved);
  assert.equal(JSON.stringify(saved.desk),JSON.stringify(beforeSaved.desk));assert.equal(JSON.stringify(restored.desk),JSON.stringify(beforeSaved.desk),'routing survives project serialization and reload');
  assert.equal(Model.find(restored,'ch-21').mute,true);assert.equal(Model.find(restored,'ch-21').level,-90);assert.equal(Model.getSend(restored,'ch-21','bus-10').mode,'PRE');
  assert.equal(Scene.undoDraft(result.undo,f.env).ok,true);assert.deepEqual(Model.serialize(f.state),beforeSaved,'undo restores exactly the pre-import project when no later edits conflict');
});
