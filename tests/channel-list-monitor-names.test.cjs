'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Scene=require('../dist/channel-list-scene.js'),Model=require('../dist/model.js');
const clone=value=>structuredClone(value);

function fixture(){
  const state=Model.defaults();
  const parsed={rows:[
    {id:'kick',sourceNumber:'1',targetId:'ch-1',name:'Kick',originalName:'Kick',color:'#e31b44',selected:true,instrumentKey:'drums',instrumentName:'Batteria'},
    {id:'snare',sourceNumber:'2',targetId:'ch-2',name:'Snare',originalName:'Snare',color:'#e31b44',selected:true,instrumentKey:'drums',instrumentName:'Batteria'},
    {id:'bass',sourceNumber:'3',targetId:'ch-3',name:'Bass',originalName:'Bass',color:'#00b43d',selected:true,instrumentKey:'bass',instrumentName:'Basso'},
    {id:'keys',sourceNumber:'4',targetId:'ch-4',name:'Keys',originalName:'Keys',color:'#e0e0e0',selected:true,instrumentKey:'keys',instrumentName:'Tastiere'}
  ],monitors:[
    {id:'drum-monitor',busId:'bus-1',name:'Batteria',originalName:'Monitor Batteria',instrumentKey:'drums',sourceNumbers:['AUX 1'],format:'Mono'},
    {id:'bass-monitor',busId:'bus-2',name:'Basso',originalName:'Monitor Basso',instrumentKey:'bass'},
    {id:'keys-monitor',busId:'bus-3',name:'Tastiere',originalName:'IEM Tastiere',instrumentKey:'keys'},
    {id:'spare-monitor',busId:'bus-4',name:'Spare',originalName:'Spare'}
  ]};
  const draft=Scene.prepareDraft(parsed,state);
  const monitor=id=>draft.monitors.find(item=>item.id===id);
  const row=id=>draft.rows.find(item=>item.id===id);
  return {state,parsed,draft,monitor,row};
}

test('automatic monitor names derive from the instrument and retain PDF provenance',()=>{
  const {state,parsed,draft,monitor}=fixture(),before=clone(state);
  assert.equal(monitor('drum-monitor').name,'Batteria MON');
  assert.equal(monitor('bass-monitor').name,'Basso MON');
  assert.equal(monitor('keys-monitor').name,'Tastiere IEM','the explicit IEM label is retained in the second principal slot');
  assert.equal(draft.rows.find(row=>row.id==='keys').primaryBusId,'');
  assert.equal(draft.rows.find(row=>row.id==='keys').secondaryPrimaryBusId,'bus-3');
  assert.equal(monitor('spare-monitor').name,'Spare','a monitor with no principal owner keeps its visible proposal');
  assert.equal(monitor('drum-monitor').originalName,'Monitor Batteria');
  assert.deepEqual(monitor('drum-monitor').sourceNumbers,['AUX 1']);
  assert.deepEqual(parsed.monitors.map(item=>item.name),['Batteria','Basso','Tastiere','Spare']);
  assert.deepEqual(state,before,'automatic names are draft-only');
  const sources=Scene.monitorNameSources(draft,'drum-monitor');
  assert.equal(sources.length,1);assert.equal(sources[0].instrumentKey,'drums');assert.equal(sources[0].slot,1);assert.equal(sources[0].label,'Batteria MON');
});

test('renaming an instrument keeps both MON and IEM names in sync without renaming its input channels',()=>{
  const {draft,monitor,row}=fixture(),inputNames=draft.rows.map(item=>item.name);
  assert.equal(Scene.setPrimary(draft,'kick','bus-4',2).ok,true);
  assert.equal(monitor('spare-monitor').name,'Batteria IEM');
  assert.equal(Scene.setInstrumentName(draft,'snare','Percussioni').ok,true);
  assert.equal(monitor('drum-monitor').name,'Percussioni MON');
  assert.equal(monitor('spare-monitor').name,'Percussioni IEM');
  assert.equal(row('kick').instrumentName,'Percussioni');assert.equal(row('snare').instrumentName,'Percussioni');
  assert.deepEqual(draft.rows.map(item=>item.name),inputNames);
});

test('generated names keep the complete role suffix within the existing 16-character field limit',()=>{
  const {state,draft,monitor}=fixture();
  assert.equal(Scene.setPrimary(draft,'kick','bus-4',2).ok,true);
  for(const name of ['Batteria elettronica del batterista','🎹🎹🎹🎹🎹🎹🎹🎹 Tastiere','Èrika e le percussioni']){
    assert.equal(Scene.setInstrumentName(draft,'kick',name).ok,true);
    for(const [id,suffix]of [['drum-monitor',' MON'],['spare-monitor',' IEM']]){
      const value=monitor(id).name;
      assert(value.endsWith(suffix));assert(value.length<=16,`${value} exceeds the channel-name limit`);
      assert(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value),'truncation must not leave half a Unicode character');
    }
    assert.equal(Scene.validateDraft(draft,state).ok,true);
  }
});

test('a shared bus exposes each principal owner and follows the chosen instrument',()=>{
  const {draft,monitor}=fixture();
  const oldName=monitor('drum-monitor').name;
  assert.equal(Scene.setPrimary(draft,'bass','bus-1').ok,true);
  const sources=Scene.monitorNameSources(draft,'drum-monitor');
  assert.deepEqual(sources.map(({instrumentKey,slot})=>({instrumentKey,slot})),[{instrumentKey:'drums',slot:1},{instrumentKey:'bass',slot:1}]);
  assert.equal(monitor('drum-monitor').name,oldName,'adding another owner must not silently replace the visible bus name');
  assert.equal(Scene.setMonitorNameSource(draft,'drum-monitor',{instrumentKey:'bass',slot:1}).ok,true);
  assert.equal(monitor('drum-monitor').name,'Basso MON');
  assert.equal(Scene.setInstrumentName(draft,'bass','Francesco').ok,true);
  assert.equal(monitor('drum-monitor').name,'Francesco MON');
  assert.deepEqual(monitor('drum-monitor').nameSource,{instrumentKey:'bass',slot:1});
});

test('a shared bus can take its IEM name from a second principal of another instrument',()=>{
  const {draft,monitor}=fixture();
  assert.equal(Scene.setPrimary(draft,'bass','bus-1',2).ok,true);
  const sources=Scene.monitorNameSources(draft,'drum-monitor');
  assert.deepEqual(sources.map(({instrumentKey,slot,label})=>({instrumentKey,slot,label})),[
    {instrumentKey:'drums',slot:1,label:'Batteria MON'},
    {instrumentKey:'bass',slot:2,label:'Basso IEM'}
  ]);
  assert.equal(Scene.setMonitorNameSource(draft,'drum-monitor',{instrumentKey:'bass',slot:2}).ok,true);
  assert.equal(monitor('drum-monitor').name,'Basso IEM');
  assert.equal(monitor('bass-monitor').name,'Basso MON');
});

test('manual monitor names survive regrouping and renaming, and automatic naming can be restored',()=>{
  const {draft,monitor}=fixture();
  assert.equal(Scene.setMonitorName(draft,'drum-monitor','Wedge palco').ok,true);
  assert.equal(monitor('drum-monitor').nameMode,'manual');
  assert.equal(Scene.setInstrumentName(draft,'kick','Percussioni').ok,true);
  assert.equal(monitor('drum-monitor').name,'Wedge palco');
  const created=Scene.createInstrumentGroup(draft,['kick','snare'],'Drum kit');assert.equal(created.ok,true);
  assert.equal(monitor('drum-monitor').name,'Wedge palco');
  assert.equal(Scene.setMonitorNameSource(draft,'drum-monitor',null).ok,true);
  assert.equal(monitor('drum-monitor').nameMode,'auto');
  assert.equal(monitor('drum-monitor').name,'Drum kit MON');
});

test('fully excluded groups cannot conflict with the imported owner of a shared monitor',()=>{
  const {state,draft,monitor,row}=fixture();
  assert.equal(Scene.setPrimary(draft,'bass','bus-1').ok,true);
  assert.equal(Scene.setMonitorNameSource(draft,'drum-monitor',{instrumentKey:'bass',slot:1}).ok,true);
  row('bass').selected=false;Scene.syncDraft(draft,state);
  const sources=Scene.monitorNameSources(draft,'drum-monitor');
  assert.equal(sources.length,1);assert.equal(sources[0].instrumentKey,'drums');
  assert.equal(monitor('drum-monitor').name,'Batteria MON');
  Scene.setInstrumentName(draft,'bass','Escluso');
  assert.equal(monitor('drum-monitor').name,'Batteria MON');
  row('bass').selected=true;Scene.syncDraft(draft,state);
  assert.equal(Scene.monitorNameSources(draft,'drum-monitor').length,2);
});

test('moving a monitor to another BUS retains its explicit instrument and MON/IEM role',()=>{
  const {draft,monitor,row}=fixture();
  Scene.setPrimary(draft,'bass','bus-1',2);
  Scene.setMonitorNameSource(draft,'drum-monitor',{instrumentKey:'bass',slot:2});
  const source=clone(monitor('drum-monitor').nameSource);
  assert.equal(Scene.setMonitorBus(draft,'drum-monitor','bus-10').ok,true);
  assert.deepEqual(monitor('drum-monitor').nameSource,source);assert.equal(monitor('drum-monitor').name,'Basso IEM');
  assert.equal(row('bass').secondaryPrimaryBusId,'bus-10');assert.equal(row('kick').primaryBusId,'bus-10');
  assert.equal(Scene.setInstrumentName(draft,'bass','Bassista').ok,true);
  assert.equal(monitor('drum-monitor').name,'Bassista IEM');
});

test('bulk create, move, and separate update name candidates without deleting physical monitor proposals',()=>{
  const {draft,monitor,row}=fixture(),monitorIds=draft.monitors.map(item=>item.id);
  Scene.setPrimary(draft,'kick','bus-4',2);
  const created=Scene.createInstrumentGroup(draft,['kick','snare'],'Kit ospite');assert.equal(created.ok,true);
  assert.equal(monitor('drum-monitor').name,'Kit ospite MON');assert.equal(monitor('spare-monitor').name,'Kit ospite IEM');
  assert.equal(Scene.moveInstrumentRows(draft,['bass'],created.key).ok,true);
  assert.equal(Scene.monitorNameSources(draft,'bass-monitor').length,0);
  assert.equal(Scene.monitorNameSources(draft,'drum-monitor').length,1,'three channels in one group contribute one naming source');
  assert.equal(Scene.separateInstrumentRows(draft,['snare']).ok,true);
  assert.equal(Scene.monitorNameSources(draft,'drum-monitor').length,2);
  assert.equal(Scene.setMonitorNameSource(draft,'drum-monitor',{instrumentKey:row('snare').instrumentKey,slot:1}).ok,true);
  assert.equal(monitor('drum-monitor').name,'Snare MON');
  assert.deepEqual(draft.monitors.map(item=>item.id),monitorIds,'group editing never removes a bus or renumbers the physical patch');
});

test('invalid monitor naming choices fail before changing any proposal',()=>{
  const {draft}=fixture();
  for(const source of [{instrumentKey:'missing',slot:1},{instrumentKey:'drums',slot:2},{instrumentKey:'drums',slot:3}]){
    const before=clone(draft);assert.equal(Scene.setMonitorNameSource(draft,'drum-monitor',source).ok,false);assert.deepEqual(draft,before);
  }
  const before=clone(draft);assert.equal(Scene.setMonitorName(draft,'missing','Test').ok,false);assert.deepEqual(draft,before);
  assert.equal(Scene.setMonitorNameSource(draft,'missing',null).ok,false);assert.deepEqual(draft,before);
});

test('a manual name may be blank while typing and is not overwritten by an unrelated instrument edit',()=>{
  const {draft,monitor}=fixture();
  assert.equal(Scene.setMonitorName(draft,'drum-monitor','').ok,true);
  Scene.setInstrumentName(draft,'bass','Bassista');
  assert.equal(monitor('drum-monitor').name,'');assert.equal(monitor('drum-monitor').nameMode,'manual');
  assert.equal(Scene.setMonitorName(draft,'drum-monitor','BUS 1').ok,true);
  assert.equal(monitor('drum-monitor').name,'BUS 1');
});
