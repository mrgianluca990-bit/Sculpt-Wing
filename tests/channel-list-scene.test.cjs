'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Scene=require('../dist/channel-list-scene.js'),Model=require('../dist/model.js');
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
  const state=Model.defaults();
  state.desk={channels:{},sources:{'A:7':{gain:31,phantom:true,trim:-2,mode:'M',custom:'keep'}},outputs:{'LCL:1':{source:'BUS:6',side:'R',tap:'PRE'}},users:[{id:1,source:'CH:7',tap:'POST'}],io:{globalAlt:true},fx:[{slot:1,stripId:'ch-1',position:'post',model:'HALL',params:{decay:2.8}}],processing:{'ch-1':{eq:{model:'STD',enabled:true,params:{gain:4.3}}}},layers:[{id:'custom',rows:{top:['bus-6'],bottom:['ch-1']}}],macros:[{id:1,name:'Keep'}],dca:[{members:['ch-1'],mute:true}],automix:{x:{channels:['ch-9']}}};
  for(const strip of Model.list(state))state.desk.channels[strip.id]={source:'A:7',altSource:'CRD:9',useAlt:true,sourceAuto:false,mode:'ST',tap:'PFL',preFx:null,postFx:strip.id==='ch-1'?1:null,preFxOn:false,postFxOn:true,order:['eq','gate','dyn','insert'],gateSC:{source:'CH:8',tap:'IN'},dynSC:{source:'CH:9',tap:'FILT'},width:88,delay:19,solo:true};
  Model.patchStrip(Model.find(state,'ch-1'),{pan:17,trim:4,polarity:true,eq:{bands:[{gain:6}]},dynamics:{threshold:-34,compEnabled:true}});
  Model.setSend(state,'ch-1','bus-1',{level:-13.5,on:false,pre:false,pan:28,panLink:false,followMute:false,tap:'PRE_EQ'});state.sends['ch-1>bus-1'].custom={keep:7};
  Model.setSend(state,'ch-1','bus-9',{level:-2,on:true,pre:true,pan:-15});
  Model.setSend(state,'ch-1','main-1',{level:-3,on:true,pre:false});
  Model.setSend(state,'ch-1','mtx-1',{level:-9,on:true,pre:false});
  let live=false,transition=false,transactions=0;
  const env={model:Model,controller:{getState:()=>state,transact(fn){transactions++;fn(state);return true;}},live:{isLive:()=>live,canPersist:()=>!(live||transition)}};
  return {state,env,get transactions(){return transactions;},live(value){live=value;},transition(value){transition=value;}};
}
function parsed(){
  return {rows:[
    {id:'kick',sourceNumber:'1',targetId:'ch-1',name:'Kick',originalName:'Kick',color:'#e31b44',selected:true,instrumentKey:'drums',instrumentName:'Batteria'},
    {id:'snare',sourceNumber:'2',targetId:'ch-2',name:'Snare',originalName:'Snare',color:'#e31b44',selected:true,instrumentKey:'drums',instrumentName:'Batteria'},
    {id:'bass',sourceNumber:'3',targetId:'ch-3',name:'Bass',originalName:'Bass',color:'#00b43d',selected:true,instrumentKey:'bass',instrumentName:'Basso'},
    {id:'voice',sourceNumber:'4',targetId:'ch-4',name:'Voce',originalName:'Voce',color:'#ff7679',selected:true,instrumentKey:'voice1',instrumentName:'Voce Gianluca'},
    {id:'player',sourceNumber:'AUX 1',targetId:'aux-1',name:'Player',originalName:'Player',color:'#00c6ca',selected:true,instrumentKey:'player',instrumentName:'Player'}
  ],warnings:['Controlla le proposte.']};
}
function assertOnlyAllowedChanges(before,after,draft){
  const adjusted=clone(after),selected=draft.rows.filter(row=>row.selected),imported=new Set(selected.map(row=>row.targetId)),busIds=new Set(draft.monitors.map(m=>m.busId));
  for(const strip of Model.list(adjusted)){
    const old=Model.find(before,strip.id),monitor=draft.monitors.find(m=>m.busId===strip.id&&m.applyIdentity!==false),reset=draft.remainingMode==='initialize'&&draft.remaining.some(row=>row.targetId===strip.id&&row.initialize);
    for(const key of imported.has(strip.id)||reset?['name','color','mute','level']:monitor?['name','color']:[])strip[key]=clone(old[key]);
  }
  for(const key of Object.keys(adjusted.sends)){const [source,target]=key.split('>');if(imported.has(source)&&busIds.has(target)){if(Object.hasOwn(before.sends,key))adjusted.sends[key]=clone(before.sends[key]);else delete adjusted.sends[key];}}
  assert.deepEqual(adjusted,before,'only the explicitly previewed strip fields and assigned monitor sends may change');
}

test('grouped instruments receive shared primary buses, muted inputs and minimum faders before any state mutation',()=>{
  const f=fixture(),before=clone(f.state),draft=Scene.prepareDraft(parsed(),f.state);
  assert.deepEqual(draft.rows.map(row=>row.primaryBusId),['bus-1','bus-1','bus-2','bus-3','bus-4']);
  assert.equal(draft.monitors.length,4);assert.equal(draft.monitors[0].name,'Batteria');assert.equal(draft.monitors[0].color,'#e31b44');
  assert(draft.rows.every(row=>row.mute===true&&row.level===-90));
  assert.equal(draft.remaining.length,43);assert(draft.remaining.every(row=>row.initialize===false));
  assert.equal(draft.remainingMode,'keep');assert.equal(Scene.validateDraft(draft,f.state).ok,true);assert.deepEqual(f.state,before);
  for(const row of draft.rows)for(const monitor of draft.monitors)assert.deepEqual(row.sends[monitor.busId],{on:true,level:monitor.busId===row.primaryBusId?-5:-8,mode:monitor.busId===row.primaryBusId?'PRE':'POST',followMute:true});
});

test('apply uses one transaction, all four monitor sends per input, and preserves routing, processing and unrelated sends',()=>{
  const f=fixture(),before=clone(f.state),draft=Scene.prepareDraft(parsed(),f.state),result=Scene.applyDraft(draft,f.env);
  assert.equal(result.ok,true);assert.equal(f.transactions,1);assert.equal(result.importedCount,5);assert.equal(result.sendCount,20);
  for(const row of draft.rows){const strip=Model.find(f.state,row.targetId);assert.equal(strip.name,row.name);assert.equal(strip.color,row.color);assert.equal(strip.mute,true);assert.equal(strip.level,-90);
    for(const monitor of draft.monitors){const send=Model.getSend(f.state,row.targetId,monitor.busId),primary=monitor.busId===row.primaryBusId;assert.equal(send.on,true);assert.equal(send.level,primary?-5:-8);assert.equal(send.mode,primary?'PRE':'POST');assert.equal(send.pre,primary);assert.equal(send.followMute,true);}}
  const retained=f.state.sends['ch-1>bus-1'];assert.equal(retained.pan,28);assert.equal(retained.panLink,false);assert.equal(retained.tap,'PRE_EQ');assert.deepEqual(retained.custom,{keep:7});
  assertOnlyAllowedChanges(before,f.state,draft);assert.deepEqual(f.state.desk,before.desk);
  for(const monitor of draft.monitors){assert.equal(Model.find(f.state,monitor.busId).level,Model.find(before,monitor.busId).level);assert.equal(Model.find(f.state,monitor.busId).mute,Model.find(before,monitor.busId).mute);}
  const restored=Model.restore(Model.serialize(f.state));assert.equal(Model.find(restored,'ch-1').mute,true);assert.equal(restored.sends['ch-1>bus-1'].mode,'PRE');assert.deepEqual(restored.desk,before.desk);
});

test('every imported value can be overridden in the draft, including mute, fader, primary and individual send controls',()=>{
  const f=fixture(),draft=Scene.prepareDraft(parsed(),f.state),row=draft.rows[0];
  row.targetId='ch-10';row.name='Cassa esterna';row.color='#0089ff';row.mute=false;row.level=-12.7;row.instrumentName='Kit esterno';
  assert.equal(Scene.setPrimary(draft,row.id,'bus-2').ok,true);
  row.sends['bus-2']={on:true,level:-2.4,mode:'POST',followMute:false};row.sends['bus-3']={on:false,level:-21.2,mode:'PRE',followMute:true};
  draft.monitors[1].name='IEM Batterista';draft.monitors[1].color='#ff5a2d';draft.monitors[0].applyIdentity=false;
  Scene.syncDraft(draft,f.state);const before=clone(f.state),validation=Scene.validateDraft(draft,f.state);
  assert.equal(validation.ok,true);assert(validation.warnings.some(w=>w.includes('non segue il mute')));
  assert.equal(Scene.applyDraft(draft,f.env).ok,true);
  const strip=Model.find(f.state,'ch-10');assert.equal(strip.name,'Cassa esterna');assert.equal(strip.color,'#0089ff');assert.equal(strip.mute,false);assert.equal(strip.level,-12.7);
  assert.equal(Model.getSend(f.state,'ch-10','bus-2').level,-2.4);assert.equal(Model.getSend(f.state,'ch-10','bus-2').mode,'POST');assert.equal(Model.getSend(f.state,'ch-10','bus-2').followMute,false);
  assert.equal(Model.getSend(f.state,'ch-10','bus-3').on,false);assert.equal(Model.find(f.state,'bus-2').name,'IEM Batterista');
  assert.deepEqual(Model.find(f.state,'bus-1'),Model.find(before,'bus-1'));assertOnlyAllowedChanges(before,f.state,draft);
});

test('remaining initialization is limited to four displayed fields and supports per-channel exceptions and edits',()=>{
  const f=fixture(),before=clone(f.state),draft=Scene.prepareDraft(parsed(),f.state);
  Scene.changeRemainingMode(draft,'initialize',f.state);assert(draft.remaining.every(row=>row.initialize));
  draft.remaining.find(row=>row.targetId==='ch-5').initialize=false;
  const chosen=draft.remaining.find(row=>row.targetId==='ch-6');Object.assign(chosen,{name:'Spare bass',color:'#00b43d',mute:false,level:-17.3});
  const result=Scene.applyDraft(draft,f.env);assert.equal(result.ok,true);assert.equal(result.remainingCount,42);
  assert.deepEqual(Model.find(f.state,'ch-5'),Model.find(before,'ch-5'));
  assert.equal(Model.find(f.state,'ch-6').name,'Spare bass');assert.equal(Model.find(f.state,'ch-6').mute,false);assert.equal(Model.find(f.state,'ch-6').level,-17.3);
  assert.equal(Model.find(f.state,'ch-7').name,'CH 7');assert.equal(Model.find(f.state,'ch-7').color,'#89949c');assert.equal(Model.find(f.state,'ch-7').level,-90);assert.equal(Model.find(f.state,'ch-7').mute,true);
  assertOnlyAllowedChanges(before,f.state,draft);assert.deepEqual(f.state.desk,before.desk);
  assert(!Object.keys(f.state.sends).some(key=>key.startsWith('ch-7>')),'remaining initialization must not materialize demo sends');
});

test('keep mode ignores remaining proposals and sync cannot initialize a newly imported target',()=>{
  const f=fixture(),draft=Scene.prepareDraft(parsed(),f.state);Scene.changeRemainingMode(draft,'initialize',f.state);
  const edit=draft.remaining.find(row=>row.targetId==='ch-8');edit.name='Keep proposal';
  Scene.changeRemainingMode(draft,'keep',f.state);assert.equal(draft.remaining.find(row=>row.targetId==='ch-8').name,'Keep proposal');
  draft.rows[0].targetId='ch-8';Scene.syncDraft(draft,f.state);assert(!draft.remaining.some(row=>row.targetId==='ch-8'));assert(draft.remaining.some(row=>row.targetId==='ch-1'));
  const before=clone(f.state);assert.equal(Scene.applyDraft(draft,f.env).ok,true);assert.deepEqual(Model.find(f.state,'ch-7'),Model.find(before,'ch-7'));
  const stale=Scene.prepareDraft(parsed(),f.state);Scene.changeRemainingMode(stale,'initialize',f.state);stale.remaining.push({targetId:'ch-1',initialize:true,name:'Oops',color:'#89949c',mute:true,level:-90});
  assert.equal(Scene.validateDraft(stale,f.state).ok,false);assert.equal(Scene.applyDraft(stale,f.env).ok,false);
});

test('newly remaining channels follow initialize mode after retarget or exclusion while existing exceptions persist',()=>{
  const f=fixture(),draft=Scene.prepareDraft(parsed(),f.state);Scene.changeRemainingMode(draft,'initialize',f.state);
  const exception=draft.remaining.find(row=>row.targetId==='ch-7');exception.initialize=false;exception.name='Reserved';
  draft.rows[0].targetId='ch-8';Scene.syncDraft(draft,f.state);
  assert.equal(draft.remaining.find(row=>row.targetId==='ch-1').initialize,true);assert(!draft.remaining.some(row=>row.targetId==='ch-8'));
  assert.equal(draft.remaining.find(row=>row.targetId==='ch-7').initialize,false);assert.equal(draft.remaining.find(row=>row.targetId==='ch-7').name,'Reserved');
  draft.rows[1].selected=false;Scene.syncDraft(draft,f.state);assert.equal(draft.remaining.find(row=>row.targetId==='ch-2').initialize,true);
  assert.equal(Scene.applyDraft(draft,f.env).ok,true);assert.equal(Model.find(f.state,'ch-1').name,'CH 1');assert.equal(Model.find(f.state,'ch-2').name,'CH 2');assert.equal(Model.find(f.state,'ch-8').name,'Kick');assert.equal(Model.find(f.state,'ch-7').name,'Cassa');
});

test('primary reassignment adjusts only old and new primary defaults and leaves all other edits intact',()=>{
  const f=fixture(),draft=Scene.prepareDraft(parsed(),f.state),row=draft.rows[0];
  Object.assign(row.sends['bus-1'],{on:false,level:-10,followMute:false});Object.assign(row.sends['bus-3'],{on:false,level:-17,mode:'PRE'});
  const other=clone(row.sends['bus-3']);assert.equal(Scene.setPrimary(draft,row.id,'bus-2').ok,true);
  assert.deepEqual(row.sends['bus-1'],{on:false,level:-8,mode:'POST',followMute:false});assert.equal(row.sends['bus-2'].level,-5);assert.equal(row.sends['bus-2'].mode,'PRE');assert.deepEqual(row.sends['bus-3'],other);
  row.sends['bus-2'].level=-1.2;Scene.setPrimary(draft,row.id,'bus-2');assert.equal(row.sends['bus-2'].level,-1.2);
  assert.equal(Scene.setPrimary(draft,row.id,'bus-9').ok,false);assert.equal(row.primaryBusId,'bus-2');
});

test('monitor bus reassignment migrates edited sends and shared primaries; add/remove sync keeps unrelated proposals',()=>{
  const f=fixture(),draft=Scene.prepareDraft(parsed(),f.state),first=draft.monitors[0],row=draft.rows[0];row.sends['bus-1'].level=-3.3;row.sends['bus-2'].level=-11;
  assert.equal(Scene.setMonitorBus(draft,first.id,'bus-8').ok,true);assert.equal(row.primaryBusId,'bus-8');assert.equal(draft.rows[1].primaryBusId,'bus-8');assert.equal(row.sends['bus-8'].level,-3.3);assert(!row.sends['bus-1']);
  assert.equal(Scene.setMonitorBus(draft,first.id,'bus-2').ok,false);assert.equal(first.busId,'bus-8');
  draft.monitors.push({id:'extra',busId:'bus-10',name:'Guest',color:'#ff7679',applyIdentity:true});Scene.syncDraft(draft,f.state);assert.equal(row.sends['bus-2'].level,-11);assert.deepEqual(row.sends['bus-10'],{on:true,level:-8,mode:'POST',followMute:true});
  draft.monitors=draft.monitors.filter(m=>m!==first);Scene.syncDraft(draft,f.state);assert.equal(row.primaryBusId,'');assert(!row.sends['bus-8']);assert.equal(row.sends['bus-2'].level,-11);assert.equal(Scene.validateDraft(draft,f.state).ok,false);
});

test('validation blocks duplicate targets, bus collisions, bad levels and malformed preview fields before a single write',()=>{
  const mutations=[d=>{d.rows[1].targetId=d.rows[0].targetId;},d=>{d.monitors[1].busId=d.monitors[0].busId;},d=>{d.rows[0].targetId='main-1';},d=>{d.rows[0].name='';},d=>{d.rows[0].color='red';},d=>{d.rows[0].level=Infinity;},d=>{d.rows[0].mute='true';},d=>{d.rows[0].sends['bus-1'].level=11;},d=>{d.rows[0].sends['bus-1'].mode='GRP';},d=>{d.rows[0].sends['bus-1'].followMute='yes';},d=>{d.rows[0].primaryBusId='bus-16';},d=>{d.monitors[0].name='This name is much too long';},d=>{d.remainingMode='erase';}];
  for(const mutate of mutations){const f=fixture(),before=clone(f.state),draft=Scene.prepareDraft(parsed(),f.state);mutate(draft);assert.equal(Scene.applyDraft(draft,f.env).ok,false);assert.equal(f.transactions,0);assert.deepEqual(f.state,before);}
});

test('more than sixteen independent instruments requires explicit shared monitor assignment',()=>{
  const f=fixture(),list={rows:Array.from({length:17},(_,i)=>({id:'row-'+i,targetId:'ch-'+(i+1),name:'Inst '+(i+1),originalName:'Inst '+(i+1),color:'#89949c',selected:true,instrumentKey:'inst-'+i,instrumentName:'Inst '+(i+1)}))},draft=Scene.prepareDraft(list,f.state);
  assert.equal(draft.monitors.length,16);assert.equal(draft.rows[16].primaryBusId,'');assert.equal(Scene.validateDraft(draft,f.state).ok,false);
  Scene.setPrimary(draft,draft.rows[16].id,'bus-1');assert.equal(Scene.validateDraft(draft,f.state).ok,true);
});

test('PDF monitor metadata proposes identities without interpreting AUX output numbers as bus patch',()=>{
  const f=fixture(),list=parsed();list.monitors=[{name:'Batteria',instrumentName:'Batteria',sourceNumbers:[11,12],format:'L/R'},{name:'Basso',instrumentKey:'bass',sourceNumbers:[7],format:'Mono'},{name:'Voce Gianluca',sourceNumbers:[3,4],format:'L/R'},{name:'Player',sourceNumbers:[16],format:'Mono'}];
  const draft=Scene.prepareDraft(list,f.state);assert.deepEqual(draft.monitors.map(m=>m.busId),['bus-1','bus-2','bus-3','bus-4']);assert.deepEqual(draft.rows.map(row=>row.primaryBusId),['bus-1','bus-1','bus-2','bus-3','bus-4']);
  const before=clone(f.state.desk);assert.equal(Scene.applyDraft(draft,f.env).ok,true);assert.deepEqual(f.state.desk,before);assert.equal(draft.monitors[0].format,'L/R');
});

test('PDF monitor ownership must match unambiguously; unmatched rows never inherit output-list order',()=>{
  const f=fixture(),list=parsed();list.monitors=[{name:'IEM Keys',originalName:'IEM Keys',sourceNumbers:['AUX 9','AUX 10'],format:'L/R'},{name:'Monitor Drums',instrumentName:'Drums',sourceNumbers:['AUX 1'],format:'Mono'}];
  const draft=Scene.prepareDraft(list,f.state);assert.equal(draft.rows[0].primaryBusId,'bus-2');assert.equal(draft.rows[1].primaryBusId,'bus-2');assert.equal(draft.rows[2].primaryBusId,'');assert.equal(draft.rows[3].primaryBusId,'');assert.equal(Scene.validateDraft(draft,f.state).ok,false);
  assert.equal(draft.rows[2].sends['bus-1'].level,-8);assert.equal(draft.rows[2].sends['bus-2'].mode,'POST');
  list.monitors.push({name:'Wedge Batteria',instrumentName:'Batteria',sourceNumbers:['AUX 8'],format:'Mono'});const ambiguous=Scene.prepareDraft(list,f.state);assert.equal(ambiguous.rows[0].primaryBusId,'');assert.equal(Scene.validateDraft(ambiguous,f.state).ok,false);
});

test('an existing post-fader shared tap prevents false PRE promises and is never rewritten',()=>{
  for(const tap of ['AFL','POST','POST_FADER']){const f=fixture();f.state.desk.channels['ch-1'].tap=tap;const before=clone(f.state),draft=Scene.prepareDraft(parsed(),f.state),validation=Scene.validateDraft(draft,f.state);assert.equal(validation.ok,false);assert.match(validation.rowErrors.kick.join(' '),/tap condiviso/);assert.equal(Scene.applyDraft(draft,f.env).ok,false);assert.deepEqual(f.state,before);
    draft.rows[0].sends['bus-1'].mode='POST';assert.equal(Scene.validateDraft(draft,f.state).ok,true);assert.equal(Scene.applyDraft(draft,f.env).ok,true);assert.equal(f.state.desk.channels['ch-1'].tap,tap);}
});

test('LIVE and connecting states, including transition inside transaction, prevent every importer mutation',()=>{
  for(const flag of ['live','transition']){const f=fixture(),before=clone(f.state),draft=Scene.prepareDraft(parsed(),f.state);f[flag](true);assert.equal(Scene.applyDraft(draft,f.env).ok,false);assert.equal(f.transactions,0);assert.deepEqual(f.state,before);}
  const f=fixture(),before=clone(f.state),draft=Scene.prepareDraft(parsed(),f.state),transact=f.env.controller.transact;f.env.controller.transact=fn=>{f.transition(true);return transact(fn);};assert.equal(Scene.applyDraft(draft,f.env).ok,false);assert.deepEqual(f.state,before);
});

test('commit conflicts reject the complete import but unrelated latest pan changes are preserved',()=>{
  const f=fixture(),draft=Scene.prepareDraft(parsed(),f.state),before=clone(f.state),transact=f.env.controller.transact;
  f.env.controller.transact=fn=>{Model.find(f.state,'ch-4').name='Changed now';return transact(fn);};
  assert.equal(Scene.applyDraft(draft,f.env).ok,false);Model.find(before,'ch-4').name='Changed now';assert.deepEqual(f.state,before);
  const g=fixture(),other=Scene.prepareDraft(parsed(),g.state),tx=g.env.controller.transact;g.env.controller.transact=fn=>{g.state.sends['ch-1>bus-1'].pan=77;return tx(fn);};
  assert.equal(Scene.applyDraft(other,g.env).ok,true);assert.equal(g.state.sends['ch-1>bus-1'].pan,77);
});

test('undo restores exact initial raw state, including absent send entries and edited remaining identities',()=>{
  const f=fixture(),before=clone(f.state),draft=Scene.prepareDraft(parsed(),f.state);Scene.changeRemainingMode(draft,'initialize',f.state);
  const result=Scene.applyDraft(draft,f.env);assert.equal(result.ok,true);assert(Object.hasOwn(f.state.sends,'aux-1>bus-1'));assert.equal(Scene.undoDraft(result.undo,f.env).ok,true);assert.deepEqual(f.state,before);
});

test('undo leaves later unrelated strip and send edits intact, including a newly created send',()=>{
  const f=fixture(),before=clone(f.state),draft=Scene.prepareDraft(parsed(),f.state),result=Scene.applyDraft(draft,f.env);
  Model.find(f.state,'ch-1').pan=55;f.state.sends['ch-1>bus-1'].pan=-31;f.state.sends['aux-1>bus-1'].pan=42;f.state.desk.outputs['LCL:1'].source='MAIN:3';
  assert.equal(Scene.undoDraft(result.undo,f.env).ok,true);
  assert.equal(Model.find(f.state,'ch-1').pan,55);assert.equal(f.state.sends['ch-1>bus-1'].pan,-31);assert.equal(f.state.sends['aux-1>bus-1'].pan,42);assert.equal(f.state.desk.outputs['LCL:1'].source,'MAIN:3');
  for(const field of ['name','color','mute','level'])assert.equal(Model.find(f.state,'ch-1')[field],Model.find(before,'ch-1')[field]);
  const effective=Model.getSend(before,'aux-1','bus-1'),restored=Model.getSend(f.state,'aux-1','bus-1');for(const field of ['level','on','mode','pre','followMute'])assert.equal(restored[field],effective[field]);
});

test('undo refuses all restoration on a later imported fader or send conflict, and while LIVE',()=>{
  for(const mutate of [state=>{Model.find(state,'ch-1').level=-18;},state=>{state.sends['ch-1>bus-1'].level=-20;},state=>{state.sends['ch-1>bus-1'].followMute=false;}]){const f=fixture(),draft=Scene.prepareDraft(parsed(),f.state),result=Scene.applyDraft(draft,f.env);mutate(f.state);const before=clone(f.state);assert.equal(Scene.undoDraft(result.undo,f.env).ok,false);assert.deepEqual(f.state,before);}
  const f=fixture(),result=Scene.applyDraft(Scene.prepareDraft(parsed(),f.state),f.env),before=clone(f.state);f.live(true);assert.equal(Scene.undoDraft(result.undo,f.env).ok,false);assert.deepEqual(f.state,before);
});

test('identical proposals avoid redundant transactions and do not create send entries for matching implicit values',()=>{
  const f=fixture(),draft=Scene.prepareDraft(parsed(),f.state);assert.equal(Scene.applyDraft(draft,f.env).ok,true);const before=clone(f.state),count=f.transactions;
  assert.equal(Scene.planDraft(draft,f.state).operations.length,0);const again=Scene.applyDraft(draft,f.env);assert.equal(again.ok,true);assert.equal(again.undo.length,0);assert.equal(f.transactions,count);assert.deepEqual(f.state,before);
  const g=fixture(),single=Scene.prepareDraft({rows:[{id:'r',targetId:'ch-12',name:'Guitar',color:'#0089ff',selected:true}]},g.state);single.rows[0].sends['bus-1']={on:false,level:-90,mode:'PRE',followMute:true};single.monitors[0].applyIdentity=false;
  assert.equal(Scene.applyDraft(single,g.env).ok,true);assert(!Object.hasOwn(g.state.sends,'ch-12>bus-1'));
});

test('captured project representation is accepted for preparation and validation without mutating it',()=>{
  const f=fixture(),capture=clone(Model.serialize(f.state)),before=clone(capture),draft=Scene.prepareDraft(parsed(),capture);
  assert.equal(Scene.validateDraft(draft,capture).ok,true);assert(Scene.planDraft(draft,capture).operations.length>0);assert.deepEqual(capture,before);
});

test('malformed undo tokens reject atomically before restoring any otherwise valid operation',()=>{
  for(const corrupt of [tokens=>{delete tokens.at(-1).before;},tokens=>{tokens.push({kind:'send',sourceId:'ch-1',targetId:'bus-1',key:'ch-1>bus-1',fields:['level']});},tokens=>{tokens[0].after.source='A:1';}]){
    const f=fixture(),result=Scene.applyDraft(Scene.prepareDraft(parsed(),f.state),f.env),before=clone(f.state),tokens=clone(result.undo);corrupt(tokens);assert.equal(Scene.undoDraft(tokens,f.env).ok,false);assert.deepEqual(f.state,before);
  }
});
