'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Scene=require('../dist/channel-list-scene.js'),Model=require('../dist/model.js');
const clone=value=>structuredClone(value);

function fixture(){
  const state=Model.defaults();
  state.desk={channels:{'ch-1':{source:'A:7',altSource:'CRD:9',mode:'ST',tap:'PFL'}},sources:{'A:7':{gain:31,phantom:true}},dca:[{members:['ch-1','ch-2']}]};
  const parsed={rows:[
    {id:'kick',targetId:'ch-1',name:'Kick',originalName:'Kick In',color:'#e31b44',selected:true,instrumentKey:'drums',instrumentName:'Batteria'},
    {id:'snare',targetId:'ch-2',name:'Snare',originalName:'Snare Top',color:'#e31b44',selected:true,instrumentKey:'drums',instrumentName:'Batteria'},
    {id:'overhead',targetId:'ch-3',name:'OH',originalName:'OH L',color:'#e31b44',selected:false,instrumentKey:'drums',instrumentName:'Batteria'},
    {id:'bass',targetId:'ch-4',name:'Bass',originalName:'Bass DI',color:'#00b43d',selected:true,instrumentKey:'bass',instrumentName:'Basso'},
    {id:'keys',targetId:'ch-5',name:'Keys',originalName:'Keys L',color:'#ffffff',selected:true,instrumentKey:'keys',instrumentName:'Tastiere'},
    {id:'voice',targetId:'ch-6',name:'Voice',originalName:'Voice',color:'#ff7679',selected:true,instrumentKey:'voice',instrumentName:'Voce'}
  ]};
  const draft=Scene.prepareDraft(parsed,state),row=id=>draft.rows.find(row=>row.id===id);
  return {state,draft,row};
}
function identity(row){const value=clone(row);delete value.instrumentKey;delete value.instrumentName;delete value.primaryBusId;delete value.secondaryPrimaryBusId;delete value.sends;return value;}

test('splitting a subset creates a named group while retaining edited sends and every channel identity',()=>{
  const {state,draft,row}=fixture(),beforeState=clone(state),before=clone(draft);
  Object.assign(row('snare').sends['bus-1'],{on:false,level:-2.6,mode:'POST',followMute:false});
  Object.assign(row('overhead').sends['bus-3'],{on:false,level:-25,mode:'PRE'});
  const selected=['snare','overhead'],saved=selected.map(id=>clone(row(id))),result=Scene.createInstrumentGroup(draft,selected,'  Percussioni   ospite  ');
  assert.equal(result.ok,true);assert.equal(result.count,2);assert.equal(result.changed,true);assert.notEqual(result.key,'drums');
  assert.deepEqual(Scene.instrumentGroups(draft).find(group=>group.key===result.key).rows.map(row=>row.id),selected);
  assert.equal(row('snare').instrumentName,'Percussioni ospite');assert.equal(row('overhead').instrumentName,'Percussioni ospite');
  for(const old of saved){assert.deepEqual(identity(row(old.id)),identity(old));assert.deepEqual(row(old.id).sends,old.sends);assert.equal(row(old.id).primaryBusId,old.primaryBusId);}
  assert.equal(row('overhead').selected,false,'group editing never adds an excluded row to the import');
  assert.equal(draft.rows.length,before.rows.length);assert.equal(row('kick').instrumentKey,'drums');assert.deepEqual(draft.monitors,before.monitors);assert.deepEqual(state,beforeState);
});

test('a new mixed group uses the first selected PDF row by default and resets only changed monitor roles',()=>{
  const {draft,row}=fixture();
  Object.assign(row('kick').sends['bus-1'],{level:-1.7,mode:'POST',followMute:false});
  Object.assign(row('bass').sends['bus-1'],{on:false,level:-20,followMute:false});
  Object.assign(row('bass').sends['bus-2'],{on:false,level:-3.2,followMute:false});
  Object.assign(row('bass').sends['bus-4'],{on:false,level:-27,mode:'PRE',followMute:false});
  const kickSend=clone(row('kick').sends['bus-1']),unrelated=clone(row('bass').sends['bus-4']),snare=clone(row('snare'));
  const result=Scene.createInstrumentGroup(draft,['bass','kick','bass'],'Sezione ritmica');
  assert.equal(result.count,2);assert.equal(row('bass').primaryBusId,'bus-1');assert.equal(row('kick').primaryBusId,'bus-1');
  assert.deepEqual(row('kick').sends['bus-1'],kickSend,'already principal values retain per-channel edits');
  assert.deepEqual(row('bass').sends['bus-1'],{on:true,level:-5,mode:'PRE',followMute:false});
  assert.deepEqual(row('bass').sends['bus-2'],{on:false,level:-8,mode:'POST',followMute:false});
  assert.deepEqual(row('bass').sends['bus-4'],unrelated);assert.deepEqual(row('snare'),snare);
});

test('an explicit selected reference supports zero, one, two and second-only principals',()=>{
  for(const pair of [['',''],['bus-3',''],['bus-3','bus-4'],['','bus-4']]){
    const {draft,row}=fixture();
    Scene.setPrimary(draft,'keys',pair[0],1);Scene.setPrimary(draft,'keys',pair[1],2);
    const result=Scene.createInstrumentGroup(draft,['kick','keys'],'Riferimento tastiere','keys');
    assert.equal(result.ok,true);
    for(const id of ['kick','keys'])assert.deepEqual([row(id).primaryBusId,row(id).secondaryPrimaryBusId],pair);
    for(const id of pair.filter(Boolean)){assert.equal(row('kick').sends[id].level,-5);assert.equal(row('kick').sends[id].mode,'PRE');}
    assert.equal(row('snare').instrumentKey,'drums');
  }
});

test('moving several rows merges membership and inherits two principals without flattening channel sends',()=>{
  const {draft,row}=fixture();Scene.setPrimary(draft,'keys','bus-4',2);
  Object.assign(row('keys').sends['bus-3'],{on:false,level:-12.3,mode:'POST'});
  Object.assign(row('kick').sends['bus-2'],{on:false,level:-31.4,mode:'PRE',followMute:false});
  const beforeKeys=clone(row('keys')),unrelated=clone(row('kick').sends['bus-2']);
  const result=Scene.moveInstrumentRows(draft,['keys','overhead','kick','overhead'],'keys');
  assert.equal(result.ok,true);assert.equal(result.count,3);assert.equal(result.changed,true);
  assert.deepEqual(Scene.instrumentGroups(draft).find(group=>group.key==='keys').rows.map(row=>row.id),['kick','overhead','keys']);
  for(const id of ['kick','overhead']){assert.deepEqual([row(id).primaryBusId,row(id).secondaryPrimaryBusId],['bus-3','bus-4']);assert.equal(row(id).instrumentName,'Tastiere');}
  assert.deepEqual(row('keys'),beforeKeys);assert.deepEqual(row('kick').sends['bus-2'],unrelated);assert.equal(row('overhead').selected,false);
  assert.equal(draft.rows.length,6);assert.deepEqual(Scene.instrumentGroups(draft).find(group=>group.key==='drums').rows.map(row=>row.id),['snare']);
  const before=clone(draft),again=Scene.moveInstrumentRows(draft,['kick','keys'],'keys');assert.equal(again.changed,false);assert.deepEqual(draft,before);
});

test('a principal shared before and after moving keeps its values even when its slot changes',()=>{
  const {draft,row}=fixture();Scene.setPrimary(draft,'kick','bus-2',2);
  Scene.setPrimary(draft,'keys','bus-2',1);Scene.setPrimary(draft,'keys','bus-1',2);
  Object.assign(row('kick').sends['bus-1'],{on:false,level:-2.5,mode:'POST',followMute:false});
  Object.assign(row('kick').sends['bus-2'],{on:true,level:-14,mode:'POST'});
  const sends=clone(row('kick').sends);
  assert.equal(Scene.moveInstrumentRows(draft,['kick'],'keys').ok,true);
  assert.deepEqual([row('kick').primaryBusId,row('kick').secondaryPrimaryBusId],['bus-2','bus-1']);assert.deepEqual(row('kick').sends,sends);
});

test('duplicate display names do not merge distinct groups and generated keys cannot collide',()=>{
  const {draft,row}=fixture();row('bass').instrumentKey='manual-instrument:1';row('bass').instrumentName='Batteria';
  row('keys').instrumentKey='manual-instrument:2';row('keys').instrumentName='Batteria';
  const result=Scene.createInstrumentGroup(draft,['snare'],'Batteria');
  assert.equal(result.ok,true);assert.equal(result.key,'manual-instrument:3');assert.equal(row('kick').instrumentKey,'drums');
  const groups=Scene.instrumentGroups(draft).filter(group=>group.name==='Batteria');assert.equal(groups.length,4);assert.equal(new Set(groups.map(group=>group.key)).size,4);
  Scene.moveInstrumentRows(draft,['snare'],'manual-instrument:2');assert.equal(row('snare').primaryBusId,row('keys').primaryBusId);assert.equal(row('bass').instrumentKey,'manual-instrument:1');
});

test('invalid create requests reject atomically, including stale selected IDs and reference monitors',()=>{
  const requests=[
    {run:d=>Scene.createInstrumentGroup(d,[],'New')},
    {run:d=>Scene.createInstrumentGroup(d,['kick','missing'],'New')},
    {run:d=>Scene.createInstrumentGroup(d,['kick',null],'New')},
    {run:d=>Scene.createInstrumentGroup(d,'kick','New')},
    {run:d=>Scene.createInstrumentGroup(d,['kick'],'  \n ')},
    {run:d=>Scene.createInstrumentGroup(d,['kick'],{})},
    {run:d=>Scene.createInstrumentGroup(d,['kick'],'New','keys')},
    {run:d=>Scene.createInstrumentGroup(d,['kick'],'New','')},
    {setup:d=>d.rows[0].primaryBusId='bus-16',run:d=>Scene.createInstrumentGroup(d,['kick','keys'],'New','keys')},
    {setup:d=>d.rows[4].secondaryPrimaryBusId='bus-3',run:d=>Scene.createInstrumentGroup(d,['kick','keys'],'New','keys')}
  ];
  for(const request of requests){const {draft}=fixture();request.setup?.(draft);
    const before=clone(draft);assert.equal(request.run(draft).ok,false);assert.deepEqual(draft,before);
  }
  assert.equal(Scene.createInstrumentGroup(null,['kick'],'New').ok,false);
});

test('invalid move or separation never changes a partially resolved selection',()=>{
  for(const action of [
    d=>Scene.moveInstrumentRows(d,['kick','missing'],'keys'),
    d=>Scene.moveInstrumentRows(d,['kick','snare'],'missing'),
    d=>Scene.moveInstrumentRows(d,['kick'],'') ,
    d=>Scene.moveInstrumentRows(d,[],'keys'),
    d=>Scene.moveInstrumentRows(d,['kick'],'keys'),
    d=>Scene.separateInstrumentRows(d,['kick','missing']),
    d=>Scene.separateInstrumentRows(d,['kick',false]),
    d=>Scene.separateInstrumentRows(d,[])
  ].entries()){
    const [index,run]=action,{draft,row}=fixture();if(index===4)row('keys').primaryBusId='bus-16';
    const before=clone(draft);assert.equal(run(draft).ok,false);assert.deepEqual(draft,before);
  }
});

test('separating chosen channels preserves principals and all sends without removing any row',()=>{
  const {draft,row}=fixture();Scene.setPrimary(draft,'kick','bus-4',2);
  Object.assign(row('overhead').sends['bus-1'],{on:false,level:-27,mode:'POST',followMute:false});
  row('bass').instrumentName='Basso custom';const before=clone(draft);
  const result=Scene.separateInstrumentRows(draft,['kick','overhead','bass','kick']);assert.equal(result.ok,true);assert.equal(result.changed,true);assert.equal(result.count,3);
  for(const id of ['kick','overhead']){const previous=before.rows.find(row=>row.id===id),current=row(id);assert.deepEqual({...current,instrumentKey:previous.instrumentKey,instrumentName:previous.instrumentName},previous);}
  assert.equal(row('kick').instrumentName,'Kick In');assert.equal(row('overhead').instrumentName,'OH L');assert.deepEqual(row('bass'),before.rows.find(row=>row.id==='bass'));
  assert.equal(Scene.instrumentGroups(draft).length,6);assert.equal(draft.rows.length,6);
  const unchanged=clone(draft);assert.equal(Scene.separateInstrumentRows(draft,['kick','overhead','bass']).changed,false);assert.deepEqual(draft,unchanged);
});

test('independent group keys avoid retained groups and remain distinct when a whole group is dissolved',()=>{
  const {draft,row}=fixture();row('bass').instrumentKey='row:kick';row('keys').instrumentKey='row:kick:2';
  assert.equal(Scene.separateInstrumentRows(draft,['kick','snare','overhead']).ok,true);
  assert.equal(row('kick').instrumentKey,'row:kick:3');assert.equal(row('snare').instrumentKey,'row:snare');assert.equal(row('overhead').instrumentKey,'row:overhead');
  assert.equal(new Set(draft.rows.map(row=>row.instrumentKey)).size,6);assert.equal(row('bass').instrumentKey,'row:kick');
});

test('blank and excluded channels participate without changing import flags, identities or unrelated silent sends',()=>{
  const {state,draft,row}=fixture(),blank=Scene.addEmptyRow(draft,state).row;blank.selected=false;
  const before=identity(blank),original=clone(blank.sends['bus-4']);
  assert.equal(Scene.moveInstrumentRows(draft,[blank.id,'overhead'],'bass').ok,true);
  assert.equal(blank.primaryBusId,'bus-2');assert.deepEqual(blank.sends['bus-2'],{on:true,level:-5,mode:'PRE',followMute:true});assert.deepEqual(blank.sends['bus-4'],original);
  Scene.setPrimary(draft,'keys','',1);assert.equal(Scene.moveInstrumentRows(draft,[blank.id],'keys').ok,true);
  assert.deepEqual(blank.sends['bus-2'],{on:false,level:-90,mode:'POST',followMute:true});assert.deepEqual(identity(blank),before);
  assert.equal(row('overhead').selected,false);assert.equal(blank.selected,false);assert.equal(Scene.validateDraft(draft,state).ok,true);
});
