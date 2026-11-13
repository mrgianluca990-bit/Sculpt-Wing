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
  const referenceOrder=['layouts','dynamics','eq','fx','channel','native','dynamics-extra','filters'].map(name=>`plugin-original-${name}.js`);
  const referenceFiles=referenceOrder.filter(file=>fs.existsSync(path.join(__dirname,'../dist',file)));
  for(const file of [...referenceFiles,'desk.js','plugins.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),dom.getInternalVMContext(),{filename:file});
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
  show({type:'fx',slot:1},'VSS3');assert.equal(f.panel.querySelectorAll('.fx-original-control-fader').length,6);assert.equal(f.panel.querySelectorAll('.fx-original-control-preset').length,1);assert.ok(f.panel.querySelector('[data-section="Early reflections"]'));assert.ok(f.panel.querySelector('[data-section="Decay spectrum"]'));
  show({type:'strip',id:'ch-1',block:'dyn'},'76LA');assert.equal(f.panel.querySelectorAll('[data-parameter="ratio"] .fx-enum-button').length,5);f.panel.querySelector('[data-parameter="ratio"] [aria-label="Ratio: 12"]').click();assert.equal(f.D.processor({type:'strip',id:'ch-1',block:'dyn'}).params.ratio,'12');
  show({type:'fx',slot:1},'GEQ');assert.equal(f.panel.querySelectorAll('.fx-vertical-fader').length,31);
  show({type:'fx',slot:1},'PCORR');assert.equal(f.panel.querySelectorAll('.fx-piano-key').length,12);const before=f.D.processor({type:'fx',slot:1}).params._c;f.panel.querySelector('[data-note="C"] button').click();assert.equal(f.D.processor({type:'fx',slot:1}).params._c,1-before);
  cleanup();f.dom.window.close();
});

test('graphic and reverb faders ignore the rail and move only from the cap',()=>{
  const f=fixture();let cleanup=()=>{};
  const pointer=(node,type,y,id=7)=>{const event=new f.w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:20,clientY:y,button:0});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'mouse'}});node.dispatchEvent(event);};
  for(const model of ['GEQ','PIA','VSS3']){
    cleanup();const ctx={type:'fx',slot:1};f.D.setModel(ctx,model);cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx);const control=f.panel.querySelector('.fx-vertical-fader').closest('[data-parameter]'),key=control.dataset.parameter,fader=control.querySelector('.fx-vertical-fader'),cap=fader.querySelector('.fx-geq-cap');
    fader.setPointerCapture=()=>{};fader.hasPointerCapture=()=>false;fader.getBoundingClientRect=()=>({height:155});cap.getBoundingClientRect=()=>({height:20});const before=f.D.processor(ctx).params[key];
    pointer(fader,'pointerdown',100);pointer(fader,'pointermove',30);pointer(fader,'pointerup',30);fader.dispatchEvent(new f.w.MouseEvent('dblclick',{bubbles:true}));assert.equal(f.D.processor(ctx).params[key],before,`${model}: rail does not change parameter`);
    pointer(cap,'pointerdown',100);pointer(fader,'pointermove',75);pointer(fader,'pointerup',75);assert.notEqual(f.D.processor(ctx).params[key],before,`${model}: cap changes parameter`);
    const dragged=f.D.processor(ctx).params[key];pointer(fader,'pointermove',10);assert.equal(f.D.processor(ctx).params[key],dragged,`${model}: released gesture stops`);
    fader.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(f.D.processor(ctx).params[key],Number(fader.getAttribute('aria-valuemin')),`${model}: keyboard remains available`);
  }
  cleanup();f.dom.window.close();
});

test('original rotary selectors preserve exact enum types and advanced controls',()=>{
  const f=fixture(),ctx={type:'strip',id:'ch-1',block:'dyn'};f.D.setModel(ctx,'SBUS');
  f.w.SculptLive={isLive:()=>true,processorState:()=>({ready:true}),parameterDefinition:(_,key)=>key==='ratio'?{type:'enum',options:[1.5,2,3,4,5,10]}:{}};
  const cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx),ratio=f.panel.querySelector('[data-parameter="ratio"] .fx-rotary-choice');
  assert.ok(ratio);ratio.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(f.D.processor(ctx).params.ratio,10);assert.equal(typeof f.D.processor(ctx).params.ratio,'number');
  assert.ok(f.panel.querySelector('.fx-original-extras [data-parameter="mix"]'),'parallel mix stays accessible without changing rack face');cleanup();f.dom.window.close();
});

test('original reference geometries bind each catalog parameter only once',()=>{
  const f=fixture();
  for(const [key,reference]of Object.entries(f.w.SculptOriginalLayouts)){
    const id=key.includes(':')?key.split(':').slice(1).join(':'):key,category=key.includes(':')?key.split(':')[0]:null;
    const models=Cat.models.filter(model=>model.id===id&&(!category||model.category===category));assert.ok(models.length,`${key}: reference has a real model`);
    for(const model of models){const keys=new Set(model.parameters.map(p=>p.key));assert.equal(new Set(reference.controls.map(c=>c.key)).size,reference.controls.length,`${key}: duplicate reference binding`);for(const control of reference.controls)assert.ok(keys.has(control.key),`${key}: unknown control ${control.key}`);}
    assert.ok(Number.isFinite(reference.sourcePage)&&reference.width>0&&reference.height>0,`${key}: source and geometry present`);
  }
  f.dom.window.close();
});

test('concentric EQ controls, model switches and faceplate bypass edit independent shared values',()=>{
  const f=fixture(),ctx={type:'strip',id:'ch-1',block:'eq'};f.D.setModel(ctx,'E84');
  const cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx),frequency=f.panel.querySelector('[data-parameter="lf"] .fx-rotary-choice'),gain=f.panel.querySelector('[data-parameter="lg"] .fx-knob');
  const beforeGain=f.D.processor(ctx).params.lg;frequency.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(f.D.processor(ctx).params.lf,'220');assert.equal(f.D.processor(ctx).params.lg,beforeGain);
  gain.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(f.D.processor(ctx).params.lg,-5);assert.equal(f.D.processor(ctx).params.lf,'220');
  const q=f.panel.querySelector('[data-parameter="mq"] [role="switch"]'),beforeQ=f.D.processor(ctx).params.mq;q.click();assert.notEqual(f.D.processor(ctx).params.mq,beforeQ);assert.ok(['LOW','HIGH'].includes(f.D.processor(ctx).params.mq));
  const beforeEnabled=f.D.processor(ctx).enabled;f.panel.querySelector('.fx-original-power').click();assert.equal(f.D.processor(ctx).enabled,!beforeEnabled);assert.equal(f.panel.querySelector('.fx-power').getAttribute('aria-checked'),String(!beforeEnabled));
  assert.equal(f.panel.querySelectorAll('[data-parameter]').length,9);cleanup();f.dom.window.close();
});

test('channel-strip tabs retain one parameter store and a real section enable control',()=>{
  const f=fixture(),ctx={type:'fx',slot:1};f.D.setModel(ctx,'*VINTAGE*');const cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx),tabs=[...f.panel.querySelectorAll('.fx-original-page-tab')],panes=[...f.panel.querySelectorAll('.fx-original-page')];
  assert.equal(tabs.length,3);assert.equal(panes.filter(pane=>!pane.hidden).length,1);tabs[0].click();assert.equal(panes[0].hidden,false);assert.equal(panes[1].hidden,true);
  const before=f.D.processor(ctx).params.d_on;panes[0].querySelector('[data-parameter="d_on"] button').click();assert.equal(f.D.processor(ctx).params.d_on,1-Number(before));
  const input=panes[0].querySelector('[data-parameter="d_in"] input');input.value='-12';input.dispatchEvent(new f.w.Event('change'));assert.equal(f.D.processor(ctx).params.d_in,-12);
  tabs[1].click();tabs[0].click();assert.equal(panes[0].querySelector('[data-parameter="d_in"] input').value,'-12');assert.equal(f.panel.querySelectorAll('[data-parameter="d_in"]').length,1);cleanup();f.dom.window.close();
});

test('native digital dynamics fields update the reference graph and horizontal faders use their cap',()=>{
  const f=fixture(),ctx={type:'strip',id:'ch-1',block:'dyn'};f.D.setModel(ctx,'COMP');let cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx);assert.equal(f.panel.querySelectorAll('.fx-vu').length,0);const path=f.panel.querySelector('.fx-original-plot svg path'),before=path.getAttribute('d'),input=f.panel.querySelector('[data-parameter="thr"] input');input.value='-30';input.dispatchEvent(new f.w.Event('change'));assert.equal(f.D.processor(ctx).params.thr,-30);assert.notEqual(path.getAttribute('d'),before);cleanup();
  const fx={type:'fx',slot:1};f.D.setModel(fx,'PHASER');f.D.setParam(fx,'stg',4);cleanup=f.w.SculptFX.renderProcessor(f.panel,fx);const slider=f.panel.querySelector('[data-parameter="stg"] .fx-horizontal-fader'),cap=slider.querySelector('.fx-geq-cap');slider.setPointerCapture=()=>{};slider.hasPointerCapture=()=>false;slider.getBoundingClientRect=()=>({width:190,height:40});cap.getBoundingClientRect=()=>({width:20,height:27});const pointer=(node,type,x)=>{const e=new f.w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:30,button:0});Object.defineProperties(e,{pointerId:{value:8},pointerType:{value:'mouse'}});node.dispatchEvent(e);};
  pointer(slider,'pointerdown',30);pointer(slider,'pointermove',150);pointer(slider,'pointerup',150);assert.equal(f.D.processor(fx).params.stg,4);pointer(cap,'pointerdown',30);pointer(slider,'pointermove',100);pointer(slider,'pointerup',100);assert.ok(f.D.processor(fx).params.stg>4);assert.equal(slider.getAttribute('aria-orientation'),'horizontal');cleanup();f.dom.window.close();
});

test('band selection shows only its controls and cancels gestures on a hidden band',()=>{
  const f=fixture(),ctx={type:'fx',slot:1};f.D.setModel(ctx,'C5-CMB');f.D.setParam(ctx,'bandsel',1);let cleanup=f.w.SculptFX.renderProcessor(f.panel,ctx);const one=f.panel.querySelector('[data-parameter="thr_1"]'),five=f.panel.querySelector('[data-parameter="thr_5"]');assert.equal(one.hidden,false);assert.equal(five.hidden,true);
  const knob=one.querySelector('[role="slider"]');knob.setPointerCapture=()=>{};knob.hasPointerCapture=()=>false;const pointer=(type,y)=>{const e=new f.w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:30,clientY:y,button:0});Object.defineProperties(e,{pointerId:{value:9},pointerType:{value:'mouse'}});knob.dispatchEvent(e);};const before=f.D.processor(ctx).params.thr_1;pointer('pointerdown',100);f.D.setParam(ctx,'bandsel',5);assert.equal(one.hidden,true);assert.equal(five.hidden,false);pointer('pointermove',25);pointer('pointerup',25);assert.equal(f.D.processor(ctx).params.thr_1,before,'a no-longer-visible band cannot receive the gesture');
  const select=f.panel.querySelector('[data-parameter="bandsel"] input');select.value='1';select.dispatchEvent(new f.w.Event('change'));assert.equal(one.hidden,false);assert.equal(five.hidden,true);assert.equal(f.panel.querySelectorAll('[data-parameter]').length,Cat.get(ctx,'C5-CMB').parameters.length);cleanup();
  const eq={type:'strip',id:'ch-1',block:'eq'};f.D.setModel(eq,'STD');cleanup=f.w.SculptFX.renderProcessor(f.panel,eq);assert.equal(f.panel.querySelector('[data-parameter="1g"]').hidden,false);assert.equal(f.panel.querySelector('[data-parameter="lg"]').hidden,true);f.panel.querySelector('.fx-eq-point[data-band="L"]').dispatchEvent(new f.w.FocusEvent('focusin',{bubbles:true}));assert.equal(f.panel.querySelector('[data-parameter="lg"]').hidden,false);assert.equal(f.panel.querySelector('[data-parameter="1g"]').hidden,true);assert.equal(f.panel.querySelectorAll('[data-parameter]').length,20);cleanup();f.dom.window.close();
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
  const f=fixture(),ctx={type:'strip',id:'ch-1',block:'dyn'};f.D.setModel(ctx,'SBUS');
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
