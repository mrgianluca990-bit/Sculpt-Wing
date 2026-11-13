'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Cat=require('../dist/plugin-data.js');
const Panels=require('../dist/plugin-panels.js');
const M=require('../dist/model.js');
const {JSDOM}=require('jsdom');
function fixture(){
  const dom=new JSDOM('<!doctype html><html><body><main id="panel"></main></body></html>',{url:'https://sculpt.invalid',runScripts:'outside-only'});
  const w=dom.window,state=M.defaults(),listeners=new Set(),toasts=[];
  w.SculptModel=M;w.SculptCatalog=Cat;w.SculptPanelLayout=Panels;
  const C=w.SculptController={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),transact:fn=>{fn(state);for(const listener of [...listeners])listener();},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},toast:text=>toasts.push(text)};
  w.SculptUI={toast:C.toast,register(){},modal(){throw new Error('No modal expected');}};
  for(const file of ['desk.js','plugins.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),dom.getInternalVMContext(),{filename:file});
  return {dom,w,C,D:w.SculptDesk,panel:w.document.getElementById('panel'),listeners,toasts,emit(){for(const l of [...listeners])l();}};
}
const contextFor=m=>m.category.startsWith('fx_')?{type:'fx',slot:1}:{type:'strip',id:m.id==='PIA'?'main-1':'ch-1',block:m.category==='gate_dynamics'?'dyn':m.category};

test('every model has an authored surface with each parameter reachable once',()=>{
  for(const model of [...Cat.models,Cat.get({type:'strip',id:'main-1',block:'eq'},'STD')]){
    const spec=Panels.forModel(model),keys=spec.sections.flatMap(s=>s.keys);
    assert.ok(spec.face&&spec.subtitle,model.id);
    assert.equal(new Set(keys).size,keys.length,`${model.category}/${model.id}: duplicate controls`);
    assert.deepEqual([...keys].sort(),model.parameters.map(p=>p.key).sort(),`${model.category}/${model.id}: missing controls`);
  }
  assert.notEqual(Panels.forModel(Cat.get({type:'strip',id:'ch-1',block:'eq'},'E88')).face,Panels.forModel(Cat.get({type:'strip',id:'ch-1',block:'dyn'},'E88')).face);
});

test('all 109 model surfaces render controls with isolated state and dispose their listeners',()=>{
  const f=fixture();let rendered=0;
  for(const model of Cat.models){
    const ctx=contextFor(model);assert.equal(f.D.setModel(ctx,model.id),true,model.id);
    const cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx);
    assert.equal(f.panel.querySelectorAll('[data-parameter]').length,model.parameters.length,`${model.category}/${model.id}`);
    assert.ok(f.panel.querySelector(`[data-model="${model.id}"]`));
    cleanup();assert.equal(f.listeners.size,0,'panel listener released');rendered++;
  }
  const ctx={type:'strip',id:'main-1',block:'eq'};f.D.setModel(ctx,'STD');const cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx);
  assert.equal(f.panel.querySelectorAll('[data-parameter]').length,27);assert.equal(f.panel.querySelectorAll('.fx-eq-point').length,8);cleanup();
  assert.equal(rendered,109);f.dom.window.close();
});

test('dedicated surfaces expose VSS3 engine sections, FET ratio buttons, GEQ faders and pitch keyboard',()=>{
  const f=fixture();let cleanup=()=>{};
  function show(ctx,model){cleanup();f.D.setModel(ctx,model);cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx);}
  show({type:'fx',slot:1},'VSS3');assert.equal(f.panel.querySelectorAll('.fx-display').length,1);assert.ok(f.panel.querySelector('[data-section="Early reflections"]'));assert.ok(f.panel.querySelector('[data-section="Decay spectrum"]'));
  show({type:'strip',id:'ch-1',block:'dyn'},'76LA');assert.equal(f.panel.querySelectorAll('[data-parameter="ratio"] .fx-enum-button').length,5);f.panel.querySelectorAll('[data-parameter="ratio"] .fx-enum-button')[2].click();assert.equal(f.D.processor({type:'strip',id:'ch-1',block:'dyn'}).params.ratio,'12');
  show({type:'fx',slot:1},'GEQ');assert.equal(f.panel.querySelectorAll('.fx-vertical-fader').length,31);
  show({type:'fx',slot:1},'PCORR');assert.equal(f.panel.querySelectorAll('.fx-piano-key').length,12);const before=f.D.processor({type:'fx',slot:1}).params._c;f.panel.querySelector('[data-note="C"] button').click();assert.equal(f.D.processor({type:'fx',slot:1}).params._c,1-before);
  cleanup();f.dom.window.close();
});

test('live panels remain locked until hydration and LOAD sends a hardware trigger only',async()=>{
  const f=fixture(),ctx={type:'fx',slot:1};let ready=false,loadCalls=0,hydrationCalls=0;
  f.w.SculptLive={isLive:()=>true,processorState:()=>({ready,loading:!ready}),ensureProcessor:async()=>{hydrationCalls++;},parameterDefinition:()=>null,triggerProcessor:async(c,key)=>{assert.equal(c.slot,1);assert.equal(key,'load');loadCalls++;}};
  const cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx);
  assert.equal(f.panel.querySelector('[data-parameter="dcy"] input').disabled,true);assert.equal(hydrationCalls,1);
  await Promise.resolve();ready=true;f.emit();
  const before=JSON.stringify(f.D.processor(ctx).params);f.panel.querySelector('[data-parameter="load"] button').click();await Promise.resolve();
  assert.equal(loadCalls,1);assert.equal(JSON.stringify(f.D.processor(ctx).params),before,'factory demo values are never applied on live LOAD');
  cleanup();f.dom.window.close();
});

test('live firmware limits and read-only flags control editing, and GR never follows knobs',async()=>{
  const f=fixture(),ctx={type:'strip',id:'ch-1',block:'dyn'};f.D.setModel(ctx,'COMP');
  f.w.SculptLive={isLive:()=>true,processorState:()=>({ready:true}),ensureProcessor:async()=>{},parameterDefinition:(_,key)=>key==='thr'?{min:-30,max:-5,step:1}:key==='gain'?{readOnly:true}:null};
  const cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx);await Promise.resolve();
  const thr=f.panel.querySelector('[data-parameter="thr"] input');assert.equal(thr.min,'-30');assert.equal(thr.max,'-5');
  const needle=f.panel.querySelector('.fx-vu-needle'),angle=needle.style.getPropertyValue('--needle');thr.value='-100';thr.dispatchEvent(new f.w.Event('change'));assert.equal(f.D.processor(ctx).params.thr,-30);assert.equal(needle.style.getPropertyValue('--needle'),angle);
  assert.equal(f.panel.querySelector('[data-parameter="gain"] input').disabled,true);assert.match(f.panel.querySelector('.fx-vu-mark').textContent,/NON DISPONIBILE/);
  cleanup();f.dom.window.close();
});

test('an unknown live model is never replaced by a local default',()=>{
  const f=fixture(),ctx={type:'fx',slot:1};f.D.processor(ctx).model='NEW-FIRMWARE-ALGORITHM';
  f.w.SculptLive={isLive:()=>true,processorState:()=>({ready:true}),ensureProcessor:async()=>{}};
  const cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx);
  assert.equal(f.D.processor(ctx).model,'NEW-FIRMWARE-ALGORITHM');assert.match(f.panel.textContent,/esploratore/);
  cleanup();f.dom.window.close();
});


test('a firmware numeric enum remains numeric through the rendered selector',async()=>{
  const f=fixture(),ctx={type:'strip',id:'ch-1',block:'dyn'};f.D.setModel(ctx,'76LA');
  f.w.SculptLive={isLive:()=>true,processorState:()=>({ready:true}),ensureProcessor:async()=>{},parameterDefinition:(_,key)=>key==='ratio'?{type:'enum',options:[4,8,12,20,0],optionLabels:['4:1','8:1','12:1','20:1','ALL']}:{}};
  const cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx);await Promise.resolve();
  const select=f.panel.querySelector('[data-parameter="ratio"] select');select.value='12';select.dispatchEvent(new f.w.Event('change'));
  assert.equal(f.D.processor(ctx).params.ratio,12);assert.equal(typeof f.D.processor(ctx).params.ratio,'number');assert.equal(select.options[2].textContent,'12:1');
  cleanup();f.dom.window.close();
});
