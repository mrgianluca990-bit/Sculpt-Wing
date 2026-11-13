const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../dist/plugin-data.js');
const fx=slot=>({type:'fx',slot});
const strip=(id,block)=>({type:'strip',id,block});

test('catalogue covers every rack algorithm and prevents premium slots 9–16',()=>{
  assert.equal(C.models.length,109);
  assert.equal(C.list(fx(1)).length,65);
  assert.equal(C.list(fx(9)).length,39);
  assert.ok(C.get(fx(1),'VSS3'));
  assert.equal(C.get(fx(9),'VSS3'),null);
  assert.ok(C.get(fx(16),'*MASTER*'));
  assert.ok(C.get(fx(12),'PIA'));
  assert.ok(C.get(fx(1),'ROOM'));
  assert.ok(C.get(fx(1),'FLANGER'));
  assert.ok(C.get(fx(1),'V-IMG'));
});

test('strip contexts preserve actual CH/AUX/output model differences',()=>{
  assert.equal(C.list(strip('ch-1','filter')).length,4);
  assert.equal(C.list(strip('ch-1','gate')).length,32);
  assert.equal(C.list(strip('aux-1','dyn')).length,28);
  assert.equal(C.list(strip('aux-1','gate')).length,0);
  assert.equal(C.list(strip('aux-1','filter')).length,0);
  assert.ok(C.get(strip('ch-1','eq'),'MACH4'));
  assert.equal(C.get(strip('aux-1','eq'),'MACH4'),null);
  assert.equal(C.get(strip('bus-1','eq'),'MACH4'),null);
  assert.ok(C.get(strip('bus-1','eq'),'PIA'));
  assert.equal(C.get(strip('aux-1','dyn'),'WARM'),null);
  assert.equal(C.get(strip('ch-1','gate'),'E88').layout,'dynamics');
  assert.equal(C.get(strip('ch-1','eq'),'E88').layout,'eq');
});

test('every non-empty model has distinct typed, bounded and defaulted parameters',()=>{
  let parameterCount=0;
  for(const model of C.models){
    if(model.id!=='NONE')assert.ok(model.parameters.length>0,model.id);
    assert.equal(new Set(model.parameters.map(p=>p.key)).size,model.parameters.length,`${model.id} duplicate`);
    for(const p of model.parameters){
      parameterCount++;
      assert.ok(p.label&&p.group,`${model.id} ${p.key}`);
      if(p.type==='enum')assert.ok(p.options.includes(p.default),`${model.id}/${p.key} invalid enum default`);
      else{
        assert.ok(Number.isFinite(p.default),`${model.id}/${p.key} finite`);
        assert.ok(p.default>=p.min&&p.default<=p.max,`${model.id}/${p.key} bounds`);
        assert.ok(Number.isFinite(p.step)&&p.step>0,`${model.id}/${p.key} step`);
      }
    }
  }
  assert.equal(parameterCount,1116);
});

test('six/eight band EQ, reverb levels and documented parser corrections are retained',()=>{
  assert.equal(C.get(strip('ch-1','eq'),'STD').parameters.length,20);
  const output=C.get(strip('main-1','eq'),'STD');
  assert.equal(output.parameters.length,27);
  assert.ok(output.parameters.find(p=>p.key==='6q'));
  assert.equal(output.parameters.find(p=>p.key==='7q'),undefined);
  assert.equal(C.get(fx(1),'VSS3').parameters.length,32);
  assert.equal(C.get(fx(1),'VSS3').parameters.find(p=>p.key==='erlvl').unit,'dB');
  assert.equal(C.get(fx(1),'VSS3').parameters.find(p=>p.key==='rvlvl').type,'number');
  assert.equal(C.get(fx(1),'PULSAR').parameters.find(p=>p.key==='eq5').type,'boolean');
  assert.equal(C.get(fx(1),'F110').parameters.find(p=>p.key==='shv').type,'boolean');
  assert.equal(C.get(fx(1),'C5-CMB').parameters.find(p=>p.key==='bandsel').max,5);
  assert.equal(C.get(fx(1),'*EVEN*').parameters.find(p=>p.key==='mix').max,125);
  assert.equal(C.get(fx(1),'SUB-M').parameters.find(p=>p.key==='mix').max,100);
});

test('defaults are isolated between processor instances and ambiguous names are not collapsed',()=>{
  const a=C.defaults(fx(1),'VSS3'),b=C.defaults(fx(2),'VSS3');
  a.dcy=12;assert.notEqual(b.dcy,12);
  const cmb=C.get(strip('ch-1','dyn'),'CMB');
  assert.ok(cmb.parameters.some(p=>p.key==='peak'&&p.type==='boolean'));
  assert.ok(cmb.parameters.some(p=>p.key==='peak__2'&&p.type==='number'));
});

test('display editing does not turn logarithmic step counts into linear physical quantisation',()=>{
  const vss=C.get(fx(1),'VSS3').parameters.find(p=>p.key==='dcy');
  assert.equal(vss.step,.01);
  assert.equal(vss.log,false);
  assert.equal(vss.referenceSteps,280);
  assert.equal(vss.stepSource,'demo_display_resolution');
  assert.equal(Number((vss.min+Math.round((2.8-vss.min)/vss.step)*vss.step).toFixed(6)),2.8);
  const hall=C.get(fx(1),'HALL').parameters.find(p=>p.key==='dcy');
  assert.equal(hall.log,true);
  assert.equal(hall.step,.01);
  const low=C.get(strip('ch-1','eq'),'STD').parameters.find(p=>p.key==='lf');
  assert.equal(low.log,true);
  assert.equal(low.step,1);
  assert.equal(low.default,80);
  assert.equal(low.referenceSteps,641);
});
