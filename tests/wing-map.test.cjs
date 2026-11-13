const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const M=require('../dist/model.js');
const K=require('../dist/plugin-data.js');
const W=require('../dist/wing-map.js');
function fixture(){
  const state=M.defaults();
  const C={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),transact:fn=>fn(state),capture:()=>structuredClone(M.serialize(state)),subscribe:()=>()=>{},toast:()=>{}};
  const ctx={window:{SculptController:C,SculptModel:M,SculptCatalog:K},console};vm.runInNewContext(fs.readFileSync(require.resolve('../dist/desk.js'),'utf8'),ctx);
  return {state,D:ctx.window.SculptDesk,C};
}
test('all 76 strip families resolve exact fader/mute/pan/solo paths',()=>{
  const {state}=fixture(),capture=W.capture(state);
  for(const [kind,count]of Object.entries({ch:40,aux:8,bus:16,main:4,mtx:8}))for(let n=1;n<=count;n++){
    const base=`/${kind}/${n}`;for(const param of ['fdr','mute','pan','$solo'])assert(capture.has(base+'/'+param),base+'/'+param);
  }
  assert.equal(W.stripPath('ch-41'),null);assert.equal(W.stripPath('aux-9'),null);
  assert.equal(W.apply(state,'/main/4/fdr',-6.25),true);assert.equal(M.find(state,'main-4').level,-6.25);
});
test('capture is read-only and works with both live state and serialized snapshots',()=>{
  const {state,C}=fixture(),before=JSON.stringify(state);const live=W.capture(state),snapshot=W.capture(C.capture());
  assert.equal(JSON.stringify(state),before);assert.deepEqual(live,snapshot);assert(live.size>10000);
});
test('silence, low levels and pan-link mode 2 retain exact received wire values',()=>{
  const {state}=fixture();W.apply(state,'/ch/1/fdr',-144);assert.equal(M.find(state,'ch-1').level,-90);assert.equal(W.capture(state).get('/ch/1/fdr'),-144);
  W.apply(state,'/ch/1/fdr',-104.625);assert.equal(W.capture(state).get('/ch/1/fdr'),-104.625);
  M.find(state,'ch-1').level=-20;assert.equal(W.capture(state).get('/ch/1/fdr'),-20);
  W.apply(state,'/ch/1/send/1/plink',2);assert.equal(state.sends['ch-1>bus-1'].panLink,true);assert.equal(W.capture(state).get('/ch/1/send/1/plink'),2);
  state.sends['ch-1>bus-1'].panLink=false;assert.equal(W.capture(state).get('/ch/1/send/1/plink'),0);
});
test('send routes respect WING family-specific addressing and semantics',()=>{
  const {state}=fixture(),map=W.capture(state);
  assert.equal(W.sendPath('ch-40','mtx-8'),'/ch/40/send/MX8/lvl');
  assert.equal(W.sendPath('aux-8','main-4','pre'),'/aux/8/main/4/pre');
  assert.equal(W.sendPath('bus-2','bus-3','pre'),'/bus/2/send/3/pre');
  assert.equal(W.sendPath('main-4','mtx-8','on'),'/main/4/send/MX8/on');
  assert.equal(W.sendPath('main-1','bus-1'),null);assert.equal(W.sendPath('bus-1','bus-1'),null);
  assert.equal(W.sendPath('bus-1','mtx-1','pan'),null);
  assert(map.has('/aux/8/send/MX8/mode'));assert(!map.has('/bus/1/send/MX1/mode'));assert(map.has('/bus/1/send/MX1/pre'));
  W.apply(state,'/ch/1/send/MX1/pon',1);assert.equal(state.sends['ch-1>mtx-1'].followMute,false);
  W.apply(state,'/bus/1/send/MX1/pre',0);assert.equal(state.sends['bus-1>mtx-1'].mode,'POST');
});
test('model changes invalidate old mapped parameters; ambiguous CMB peak fields are blocked',()=>{
  const {state}=fixture();
  assert(W.capture(state).has('/ch/1/eq/1q'));
  W.apply(state,'/ch/1/eq/mdl','SOUL');assert(!W.capture(state).has('/ch/1/eq/1q'));
  assert(W.descriptors(state).some(e=>e.path==='/ch/1/eq/lmg'));
  assert.equal(W.apply(state,'/ch/1/eq/lmg',3),true);assert.equal(state.desk.processing['ch-1'].eq.params.lmg,3);
  const spec=W.processorSpec({type:'strip',id:'ch-1',block:'dyn'},'CMB');assert.equal(spec.parameterPath('peak'),null);assert.equal(spec.parameterPath('peak__2'),null);
  assert.equal(W.processorSpec({type:'strip',id:'aux-1',block:'gate'},'GATE'),null);
});
test('numeric firmware enums retain their wire type despite textual catalog options',()=>{
  const {state}=fixture();W.apply(state,'/ch/1/dyn/ratio',3);assert.equal(W.capture(state).get('/ch/1/dyn/ratio'),3);
  state.desk.processing['ch-1'].dyn.params.ratio=4;assert.equal(W.capture(state).get('/ch/1/dyn/ratio'),4);
  state.desk.processing['ch-1'].dyn.params.ratio='5.0';assert.equal(W.capture(state).get('/ch/1/dyn/ratio'),5);
  W.apply(state,'/ch/1/flt/lcs',12);state.desk.channels['ch-1'].lowSlope=18;assert.equal(W.capture(state).get('/ch/1/flt/lcs'),18);
});
test('all catalog unambiguous source keys produce validated context paths',()=>{
  let count=0;
  for(const ctx of [{type:'fx',slot:1},{type:'fx',slot:16},...['ch-1','aux-1','bus-1','main-1','mtx-1'].flatMap(id=>['eq','dyn','gate','filter'].map(block=>({type:'strip',id,block})))]){
    for(const model of K.list(ctx)){
      const spec=W.processorSpec(ctx,model.id);assert(spec);
      const dup=new Set(model.parameters.filter((p,i)=>model.parameters.some((q,j)=>i!==j&&q.sourceKey===p.sourceKey)).map(p=>p.key));
      for(const p of model.parameters){if(dup.has(p.key)){assert.equal(spec.parameterPath(p.key),null);continue;}assert.equal(spec.parameterPath(p.key),spec.basePath+'/'+p.sourceKey);count++;}
    }
  }assert(count>3000);
});
test('FX overall mix and model mix are distinct, bypass belongs to assigned insert',()=>{
  const {state,D}=fixture();D.setModel({type:'fx',slot:1},'SOUL');D.assignFx(1,'ch-1','pre');
  W.apply(state,'/fx/1/fxmix',75);W.apply(state,'/fx/1/mix',110);
  assert.equal(state.desk.fx[0].mix,75);assert.equal(state.desk.fx[0].params.mix,110);
  state.desk.fx[0].enabled=false;const values=W.capture(state);assert.equal(values.get('/ch/1/preins/on'),0);assert(!values.has('/fx/1/on'));
  W.apply(state,'/ch/1/preins/on',1);assert.equal(state.desk.fx[0].enabled,true);
  W.apply(state,'/ch/1/preins/ins','NONE');assert.equal(state.desk.fx[0].stripId,null);
});
test('filter uses flt/tf and sidechain/crossover controls use their documented nodes',()=>{
  const {state}=fixture(),paths=new Set(W.descriptors(state).map(e=>e.path));
  for(const p of ['/ch/1/flt/tf','/ch/1/flt/lcf','/ch/1/gatesc/$solo','/bus/1/dynxo/q','/aux/1/dynsc/src','/ch/1/peq/3q'])assert(paths.has(p),p);
  assert(!paths.has('/aux/1/flt/tf'));assert(!paths.has('/aux/1/dynxo/q'));assert(!paths.has('/ch/1/filter/on'));
});
test('physical preamps are shared and gain/phantom are never synthesized for digital sources',()=>{
  const {state}=fixture(),paths=new Set(W.descriptors(state).map(e=>e.path));
  assert(paths.has('/io/in/LCL/24/g'));assert(paths.has('/io/in/A/48/vph'));assert(paths.has('/io/in/SC/32/g'));
  assert(!paths.has('/io/in/USB/1/g'));assert(!paths.has('/io/in/USB/1/trim'));
  W.apply(state,'/io/in/LCL/1/g',23);W.apply(state,'/io/in/LCL/1/vph',1);assert.equal(state.desk.sources['LCL:1'].gain,23);assert.equal(state.desk.sources['LCL:1'].phantom,true);
});
test('effective strip identity is read-only, linked rename targets shared source',()=>{
  const {state}=fixture();
  W.apply(state,'/ch/1/clink',1);W.apply(state,'/ch/1/name','Local');W.apply(state,'/ch/1/$name','Vocal');W.apply(state,'/io/in/LCL/1/name','Vocal');
  assert.equal(M.find(state,'ch-1').name,'Vocal');M.find(state,'ch-1').name='Lead';
  const values=W.capture(state);assert.equal(values.get('/ch/1/name'),'Local');assert.equal(values.get('/io/in/LCL/1/name'),'Lead');
  assert(W.descriptors(state).find(e=>e.path==='/ch/1/$name').readOnly);
  W.apply(state,'/io/in/LCL/1/name','Lead');assert.equal(M.find(state,'ch-1').name,'Lead');
  W.apply(state,'/ch/1/$col',9);assert.equal(M.find(state,'ch-1').color,W.COLORS[9]);
});
test('Main/Alt patch application is independent of group/index update order',()=>{
  const {state}=fixture();W.apply(state,'/ch/1/in/conn/in',13);W.apply(state,'/ch/1/in/conn/grp','A');assert.equal(state.desk.channels['ch-1'].source,'A:13');
  W.apply(state,'/aux/8/in/conn/altgrp','CRD');W.apply(state,'/aux/8/in/conn/altin',48);assert.equal(state.desk.channels['aux-8'].altSource,'CRD:48');
  W.apply(state,'/ch/1/in/set/altsrc',1);assert.equal(state.desk.channels['ch-1'].useAlt,true);
});
test('physical output stereo indices encode BUS/MAIN/MTX side and reject direct processed CH',()=>{
  const {state}=fixture(),out=state.desk.outputs['LCL:1'];out.source='BUS:3';out.side='R';let c=W.capture(state);assert.equal(c.get('/io/out/LCL/1/grp'),'BUS');assert.equal(c.get('/io/out/LCL/1/in'),6);
  W.apply(state,'/io/out/LCL/1/grp','MAIN');W.apply(state,'/io/out/LCL/1/in',4);assert.equal(out.source,'MAIN:2');assert.equal(out.side,'R');
  out.source='CH:4';c=W.capture(state);assert(!c.has('/io/out/LCL/1/grp'));assert(!c.has('/io/out/LCL/1/in'));
  out.source='USB:12';assert.equal(W.capture(state).get('/io/out/LCL/1/in'),12);
});
test('USER SIGNAL and USER PATCH use different domains, AUX processing remains distinct',()=>{
  const {state}=fixture();state.desk.users[0].source='AUXP:8';state.desk.users[24].source='AUX:5';
  const c=W.capture(state);assert.equal(c.get('/io/in/USR/1/user/grp'),'AUX');assert.equal(c.get('/io/in/USR/1/user/in'),8);assert.equal(c.get('/io/in/USR/25/user/grp'),'AUX');
  assert(!c.has('/io/in/USR/25/user/tap'));
  W.apply(state,'/io/in/USR/1/user/grp','AUX');W.apply(state,'/io/in/USR/1/user/in',3);assert.equal(state.desk.users[0].source,'AUXP:3');
});
test('DCA membership preserves custom tags and automix uses post insert mode',()=>{
  const {state}=fixture();W.apply(state,'/ch/1/tags','voice #D2 #D16');assert.equal(state.desk.channels['ch-1'].tags,'voice #D2 #D16');assert(!state.desk.dca[0].members.includes('ch-1'));assert(state.desk.dca[1].members.includes('ch-1'));assert(state.desk.dca[15].members.includes('ch-1'));
  state.desk.dca[1].members=[];assert.equal(W.capture(state).get('/ch/1/tags'),'voice #D16');
  W.apply(state,'/ch/1/postins/mode','AUTO_Y');W.apply(state,'/ch/1/postins/w',3.4);assert(state.desk.automix.y.channels.includes('ch-1'));assert.equal(state.desk.automix.y.weights['ch-1'],3.4);assert.equal(state.desk.channels['ch-1'].postFx,null);
});
test('monitor dim and talk level are shared parameters, oscillator enable is source mute',()=>{
  const {state}=fixture();W.apply(state,'/cfg/solo/$dim',1);assert(state.desk.monitor.every(m=>m.dim));state.desk.monitor[1].dim=false;assert.equal(W.capture(state).get('/cfg/solo/$dim'),0);
  W.apply(state,'/cfg/talk/lvl',-5);assert.equal(state.desk.talkback.a.level,-5);assert.equal(state.desk.talkback.b.level,-5);
  W.apply(state,'/cfg/talk/A/MX8',1);assert(state.desk.talkback.a.targets.includes('mtx-8'));
  W.apply(state,'/io/in/OSC/1/mute',0);assert.equal(state.desk.oscillators[0].on,true);assert.equal(W.capture(state).get('/io/in/OSC/1/mute'),0);
});
test('scope hydration returns immediate groups and supports bounded I/O pagination',()=>{
  const {state}=fixture();
  assert.deepEqual(W.readPaths(state,'io',{direction:'in',group:'LCL',start:21,count:8}),['/io/in/LCL/21','/io/in/LCL/22','/io/in/LCL/23','/io/in/LCL/24']);
  const strip=W.readPaths(state,'strip',{id:'ch-1'});for(const p of ['/ch/1','/ch/1/in/set','/ch/1/in/conn','/ch/1/eq','/ch/1/flt','/ch/1/preins'])assert(strip.includes(p),p);
  const sends=W.readPaths(state,'sends',{targetId:'bus-1'});assert(sends.includes('/ch/1/send/1'));assert(!sends.some(p=>p.endsWith('/lvl')));assert(!sends.includes('/bus/1/send/1'));
  assert.deepEqual(W.readPaths(state,'processor',{type:'fx',slot:2}),['/fx/2']);
});
test('unknown and invalid values cannot corrupt application state; LOAD stays an explicit trigger',()=>{
  const {state}=fixture(),before=JSON.stringify(state);assert.equal(W.apply(state,'/not/real',42),false);assert.equal(W.apply(state,'/ch/1/fdr','garbage'),false);assert.equal(JSON.stringify(state),before);
  assert(!W.capture(state).has('/fx/1/load'));assert.equal(W.processorSpec({type:'fx',slot:1},'VSS3').parameterPath('load'),'/fx/1/load');
});
