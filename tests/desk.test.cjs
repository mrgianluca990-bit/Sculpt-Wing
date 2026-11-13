const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const M=require('../dist/model.js');
const K=require('../dist/plugin-data.js');
function fixture(){
  let state=M.defaults();const listeners=[];
  const C={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),subscribe:fn=>{listeners.push(fn);return()=>{};},transact:fn=>fn(state),capture:()=>JSON.parse(JSON.stringify(M.serialize(state))),restore:s=>{state=M.restore(s);state.desk=ctx.window.SculptDesk.normalize(state.desk);},updateStrip:(id,p)=>M.patchStrip(M.find(state,id),p),setSend:(a,b,p)=>M.setSend(state,a,b,p),toast:()=>{}};
  const ctx={window:{SculptController:C,SculptModel:M,SculptCatalog:K},console};vm.runInNewContext(fs.readFileSync(require.resolve('../dist/desk.js'),'utf8'),ctx);
  return {D:ctx.window.SculptDesk,C,get state(){return state;}};
}
function assertInsertOwnership(d){
  const claimed=new Set();
  for(const [id,ch]of Object.entries(d.channels))for(const position of ['pre','post']){
    const slot=ch[position+'Fx'];if(!slot)continue;
    assert(!claimed.has(slot),`slot ${slot} has one owner`);claimed.add(slot);
    assert.equal(d.fx[slot-1].stripId,id,`${id}/${position} matches rack owner`);
    assert.equal(d.fx[slot-1].position,position,`${id}/${position} matches rack position`);
  }
  for(const fx of d.fx)if(fx.stripId)assert.equal(d.channels[fx.stripId][fx.position+'Fx'],fx.slot,`rack slot ${fx.slot} has reverse assignment`);
  const automix=[...d.automix.x.channels,...d.automix.y.channels];
  assert.equal(new Set(automix).size,automix.length,'automix membership is exclusive');
  assert(automix.length<=16,'automix has at most 16 channels');
  for(const id of automix)assert.equal(d.channels[id].postFx,null,`${id} cannot use automix and post FX together`);
}
test('every strip and all FX have valid context-specific processor defaults',()=>{
  const {D,C}=fixture();assert.equal(C.listStrips().length,76);assert.equal(D.get().fx.length,16);
  for(const strip of C.listStrips())for(const [block,p]of Object.entries(D.get().processing[strip.id]))assert.ok(K.get({type:'strip',id:strip.id,block},p.model),`${strip.id}/${block}`);
  assert.equal(D.get().dca.length,16);assert.equal(D.get().muteGroups.length,8);assert.equal(D.get().users.length,56);
});
test('model changes invalidate old parameters and reject illegal slots',()=>{
  const {D}=fixture();const ctx={type:'fx',slot:1};assert.equal(D.setModel(ctx,'GEQ'),true);assert.ok('20'in D.processor(ctx).params);D.setParam(ctx,'20',1000);assert.equal(D.processor(ctx).params['20'],15);
  D.setModel(ctx,'VSS3');assert.ok(!('20'in D.processor(ctx).params));assert.equal(D.setModel({type:'fx',slot:12},'VSS3'),false);
  assert.equal(D.setModel({type:'strip',id:'aux-1',block:'eq'},'MACH4'),false);
});
test('FX assignment is exclusive and AUX has no post insert',()=>{
  const {D}=fixture();D.assignFx(1,'ch-1','pre');assert.equal(D.channel('bus-13').preFx,null);assert.equal(D.channel('ch-1').preFx,1);
  D.assignFx(1,'ch-2','pre');assert.equal(D.channel('ch-1').preFx,null);assert.equal(D.channel('ch-2').preFx,1);
  D.assignFx(2,'ch-2','pre');assert.equal(D.get().fx[0].stripId,null);assert.equal(D.channel('ch-2').preFx,2);assert.equal(D.assignFx(2,'aux-1','post'),false);
});
test('source changes are shared and hardware profile filters I/O capacity',()=>{
  const {D}=fixture();D.patchChannel('ch-2',{source:'LCL:1'});D.patchSource('LCL:1',{phantom:true,mode:'ST'});assert.equal(D.source(D.channel('ch-2').source).phantom,true);assert.equal(D.channel('ch-1').mode,'ST');assert.equal(D.channel('ch-2').mode,'ST');
  assert.equal(D.sources().filter(s=>s.group==='LCL').length,24);D.change(d=>{d.setup.model='FULL';d.setup.module='NONE';d.setup.usbChannels=8;});assert.equal(D.sources().filter(s=>s.group==='LCL').length,8);assert.equal(D.sources().filter(s=>s.group==='MOD').length,0);assert.equal(D.outputs().filter(s=>s.group==='USB').length,8);
});
test('DCA and mute groups affect effective levels without changing channel fader',()=>{
  const {D,C}=fixture();const before=C.getStrip('ch-1').level;D.change(d=>d.dca[0].level=-6);assert.equal(D.effective('ch-1').level,before-6);assert.equal(C.getStrip('ch-1').level,before);D.change(d=>d.muteGroups[0].on=true);assert.equal(D.effective('ch-1').muted,true);
});
test('scene scope and safes protect levels and keep libraries independent',()=>{
  const {D,C}=fixture();const snap=D.capture();assert.equal(snap.desk.scenes,undefined);assert.equal(snap.desk.macros,undefined);
  C.updateStrip('ch-1',{level:-20});C.updateStrip('ch-2',{level:-21});D.setModel({type:'fx',slot:1},'GEQ');D.change(d=>{d.scenes=[{id:'a',name:'A',snapshot:snap}];d.macros[0].name='My macro';});
  D.recall(snap,['levels'],['ch-1']);assert.equal(C.getStrip('ch-1').level,-20);assert.equal(C.getStrip('ch-2').level,snap.values['ch-2'].level);assert.equal(D.processor({type:'fx',slot:1}).model,'GEQ');assert.equal(D.get().scenes.length,1);assert.equal(D.get().macros[0].name,'My macro');
  D.recall(snap,['processing'],[]);assert.equal(D.processor({type:'fx',slot:1}).model,'VSS3');
});
test('processing, routing and source settings survive full serialization',()=>{
  const {D,C}=fixture();D.patchOutput('LCL:1','BUS:4');D.patchChannel('aux-1',{source:'MOD:3'});D.setModel({type:'strip',id:'ch-1',block:'dyn'},'LA');D.patchSource('MOD:3',{polarity:true});const saved=C.capture();C.restore(saved);assert.equal(D.output('LCL:1').source,'BUS:4');assert.equal(D.channel('aux-1').source,'MOD:3');assert.equal(D.processor({type:'strip',id:'ch-1',block:'dyn'}).model,'LA');assert.equal(D.source('MOD:3').polarity,true);
});
test('FX-only recall rebuilds channel ownership without recalling strip processing',()=>{
  const {D}=fixture();const snap=D.capture();D.assignFx(1,'ch-1','post');D.setModel({type:'strip',id:'ch-1',block:'eq'},'SOUL');
  D.recall(snap,['fx'],[]);
  assert.equal(D.get().fx[0].stripId,'bus-13');assert.equal(D.channel('bus-13').preFx,1);assert.equal(D.channel('ch-1').postFx,null);
  assert.equal(D.processor({type:'strip',id:'ch-1',block:'eq'}).model,'SOUL');assertInsertOwnership(D.get());
});
test('processing recall preserves safe slots and clears conflicting recalled assignments',()=>{
  const {D}=fixture();D.assignFx(1,'ch-1','pre');D.assignFx(2,'ch-2','pre');const snap=D.capture();
  D.assignFx(1,'ch-2','pre');D.assignFx(2,'ch-3','pre');D.assignFx(3,'ch-1','pre');D.setModel({type:'fx',slot:3},'GEQ');
  D.recall(snap,['processing'],['ch-1']);
  assert.equal(D.channel('ch-1').preFx,3,'safe channel retains its live insert');
  assert.equal(D.get().fx[2].model,'GEQ','safe insert parameters remain live');
  assert.equal(D.channel('ch-2').preFx,1,'preserved rack slot takes precedence over the incoming assignment');
  assert.equal(D.get().fx[1].stripId,null,'conflicting recalled slot is unassigned');
  assert.equal(D.channel('ch-3').preFx,null);assert.equal(D.channel('bus-15').preFx,null);assertInsertOwnership(D.get());
});
test('groups-only recall releases post FX while preserving safe post-insert modes',()=>{
  const {D}=fixture();D.change(d=>{d.automix.x.channels=['ch-1','ch-2'];d.automix.x.weights['ch-2']=4;});const snap=D.capture();
  D.assignFx(7,'ch-1','post');D.assignFx(8,'ch-2','post');
  D.change(d=>{d.automix.y.channels=['ch-3'];d.automix.y.weights['ch-3']=-2;});
  D.recall(snap,['groups'],['ch-2','ch-3']);
  assert(D.get().automix.x.channels.includes('ch-1'));assert.equal(D.get().fx[6].stripId,null);
  assert(!D.get().automix.x.channels.includes('ch-2'));assert.equal(D.channel('ch-2').postFx,8);
  assert(D.get().automix.y.channels.includes('ch-3'));assert.equal(D.get().automix.y.weights['ch-3'],-2);assertInsertOwnership(D.get());
});
test('FX-only recall selects FX mode and removes a conflicting automix membership',()=>{
  const {D}=fixture();D.assignFx(7,'ch-1','post');const snap=D.capture();D.assignFx(7,null,'post');D.change(d=>d.automix.x.channels=['ch-1']);
  D.recall(snap,['fx'],[]);
  assert.equal(D.channel('ch-1').postFx,7);assert(!D.get().automix.x.channels.includes('ch-1'));assertInsertOwnership(D.get());
});
test('safe automix membership has priority over recalled channels when the 16 slots are full',()=>{
  const {D}=fixture();D.change(d=>{d.automix.x.channels=Array.from({length:16},(_,i)=>`ch-${i+1}`);});const snap=D.capture();
  D.change(d=>{d.automix.x.channels=[];d.automix.y.channels=['ch-40'];d.automix.y.weights['ch-40']=3;});
  D.recall(snap,['groups'],['ch-40']);
  assert(D.get().automix.y.channels.includes('ch-40'));assert.equal(D.get().automix.y.weights['ch-40'],3);
  assert.equal(D.get().automix.x.channels.length,15);assertInsertOwnership(D.get());
});
test('normalization repairs duplicate, stale and forbidden insert assignments',()=>{
  const {D}=fixture();const raw=D.capture().desk;
  raw.fx[0].stripId='ch-1';raw.fx[0].position='pre';raw.fx[1].stripId='ch-1';raw.fx[1].position='pre';
  raw.fx[2].stripId='aux-1';raw.fx[2].position='post';raw.fx[3].stripId='ch-2';raw.fx[3].position='post';
  raw.channels['ch-3'].preFx=1;raw.channels['ch-2'].postFx=null;raw.automix.x.channels=['ch-2'];
  const normalized=D.normalize(raw);
  assert.equal(normalized.channels['ch-1'].preFx,1);assert.equal(normalized.fx[1].stripId,null);
  assert.equal(normalized.fx[2].stripId,null);assert.equal(normalized.fx[3].stripId,null);assert.equal(normalized.channels['ch-3'].preFx,null);
  assertInsertOwnership(normalized);
});
