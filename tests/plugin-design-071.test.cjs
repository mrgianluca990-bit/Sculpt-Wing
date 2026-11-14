'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('../native/node_modules/jsdom');
const Model=require('../dist/model.js'),Catalog=require('../dist/plugin-data.js'),Panels=require('../dist/plugin-panels.js');
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const eq={type:'strip',id:'ch-1',block:'eq'},dyn={type:'strip',id:'ch-1',block:'dyn'};

function fixture(t,{live=false,rta=false}={}){
  const dom=new JSDOM('<!doctype html><main id="panel"></main>',{url:'https://sculpt.invalid',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  const state=Model.defaults(),listeners=new Set(),liveListeners=new Set(),rtaListeners=new Set(),observers=[],gestures=[],requests=[];
  let connected=true,writable=true,epoch=1,ready=true,loading=false,definitions={},rtaMounts=0;
  w.SculptModel=Model;w.SculptCatalog=Catalog;w.SculptPanelLayout=Panels;
  w.SculptController={getState:()=>state,getStrip:id=>Model.find(state,id),listStrips:()=>Model.list(state),transact(fn,type,id){fn(state);for(const listener of [...listeners])listener(type,id);return true;},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},toast(){},beginGesture(label){gestures.push(['begin',label]);},endGesture(){gestures.push(['end']);}};
  w.SculptUI={toast(){},register(){}};
  w.Element.prototype.setPointerCapture=function(id){this._pointer=id;};w.Element.prototype.hasPointerCapture=function(id){return this._pointer===id;};w.Element.prototype.releasePointerCapture=function(){this._pointer=null;};
  w.ResizeObserver=class{constructor(fn){this.fn=fn;this.targets=new Set();this.disposed=false;observers.push(this);}observe(node){this.targets.add(node);}disconnect(){this.disposed=true;this.targets.clear();}};
  const notify=()=>{for(const listener of [...liveListeners])listener();};
  if(live||rta)w.SculptLive={
    isLive:()=>live,isConnected:()=>connected,isWritable:()=>writable,sessionToken:()=>epoch,
    snapshot:()=>({mode:live?'live':'demo',writable}),processorState:()=>({ready,loading,error:''}),parameterDefinition:(_,key)=>definitions[key]||{},ensureProcessor:async()=>{},
    subscribe(fn){liveListeners.add(fn);return()=>liveListeners.delete(fn);},
    rtaState:()=>({status:live?'waiting':'offline'}),setRtaRequest:async request=>{requests.push(request);},onRta(fn){rtaListeners.add(fn);return()=>rtaListeners.delete(fn);}
  };
  const run=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),dom.getInternalVMContext(),{filename:file});
  for(const file of ['desk.js','plugin-original-layouts.js','plugin-original-dynamics.js','plugin-original-eq.js','plugin-original-native.js','plugin-original-filters.js'])run(file);
  if(rta){run('rta.js');const real=w.SculptRTA;w.SculptRTA={...real,mount(...args){rtaMounts++;return real.mount(...args);}};}
  run('plugins.js');const panel=w.document.getElementById('panel'),D=w.SculptDesk;let cleanup=()=>{};
  const show=(ctx,model,{principal=false}={})=>{cleanup();if(model)D.setModel(ctx,model);cleanup=principal?w.SculptFX.renderPrincipal(panel,ctx):w.SculptFX.renderProcessor(panel,ctx);return panel;};
  const pointer=(node,type,x,y,id=9)=>{const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'mouse'}});node.dispatchEvent(event);};
  t.after(()=>{cleanup();dom.window.close();});
  return {w,panel,D,show,gestures,requests,observers,pointer,get rtaMounts(){return rtaMounts;},close(){cleanup();},emit(){for(const listener of [...listeners])listener();},mode(patch,silent=false){if('connected'in patch)connected=patch.connected;if('writable'in patch)writable=patch.writable;if('epoch'in patch)epoch=patch.epoch;if('ready'in patch)ready=patch.ready;if('loading'in patch)loading=patch.loading;if('definitions'in patch)definitions=patch.definitions;if(!silent)notify();},resize(node,width,height){for(const observer of observers)if(observer.targets.has(node))observer.fn([{target:node,contentRect:{width,height}}]);}};
}

test('native EQ, dynamics and filters use one complete surface, with tools in the top toolbar',t=>{
  const f=fixture(t);
  for(const [ctx,id]of [[eq,'STD'],[dyn,'COMP'],[dyn,'EXP'],[dyn,'GATE'],[dyn,'DUCK'],...['TILT','MAX','AP1','AP2'].map(id=>[{...eq,block:'filter'},id])]){
    f.show(ctx,id);const wrapper=f.panel.querySelector('.fx-wing-editor'),model=Catalog.get(ctx,id);
    assert.ok(wrapper,id);assert.equal(wrapper.querySelector('.fx-original-stage'),null,id);
    assert.deepEqual([...wrapper.querySelectorAll('[data-parameter]')].map(node=>node.dataset.parameter).sort(),model.parameters.map(parameter=>parameter.key).sort(),id);
    assert.equal(wrapper.querySelectorAll(':scope > .fx-tools').length,0,id);
    assert.equal(wrapper.querySelectorAll('.fx-processor-toolbar > .fx-tools button').length,5,id);
  }
  f.show(dyn,'76LA');assert.equal(f.panel.querySelectorAll('.fx-processor-toolbar > .fx-tools button').length,5,'analog processor tools share the same top location');
});

test('principal cards reuse live limits and retain controls and typed focus across other parameters',t=>{
  const f=fixture(t,{live:true});f.mode({definitions:{thr:{min:-30,max:-5,step:1}}});f.show(dyn,'COMP',{principal:true});
  const controls=[...f.panel.querySelectorAll('[data-parameter]')];assert.equal(controls.length,4);assert.equal(new Set(controls.map(node=>node.dataset.parameter)).size,4);assert.equal(f.panel.querySelector('svg'),null);assert.equal(f.panel.querySelector('.fx-tools'),null);
  const input=f.panel.querySelector('[data-parameter="thr"] input'),gain=f.panel.querySelector('[data-parameter="gain"]'),gainInput=gain.querySelector('input');assert.equal(input.min,'-30');assert.equal(input.max,'-5');
  gainInput.focus();gainInput.value='3.25';
  const observer=new f.w.MutationObserver(()=>{});observer.observe(gain,{attributes:true,characterData:true,childList:true,subtree:true});
  f.D.setParam(dyn,'thr',-25);assert.equal(f.panel.querySelector('[data-parameter="gain"]'),gain);assert.equal(f.w.document.activeElement,gainInput);assert.equal(gainInput.value,'3.25');assert.equal(observer.takeRecords().length,0,'a neighbouring value does not rewrite this control');
  f.mode({writable:false});assert.equal(f.panel.querySelector('[data-parameter="thr"] input'),input);assert.equal(input.disabled,true);
  f.mode({writable:true});assert.equal(f.panel.querySelector('[data-parameter="thr"] input'),input);assert.equal(input.disabled,false);observer.disconnect();
});

test('changing only control availability preserves full-panel nodes, selected bands and RTA ownership',async t=>{
  const f=fixture(t,{live:true,rta:true});f.show(eq,'STD');await tick();
  const wrapper=f.panel.querySelector('.fx-wing-editor'),svg=wrapper.querySelector('.fx-eq-display svg'),spectrum=svg.querySelector('.sculpt-rta-spectrum');
  const tab=wrapper.querySelector('[aria-label="Banda B3"]');tab.click();
  const input=wrapper.querySelector('[data-parameter="3g"] input');input.focus();input.value='5.5';
  f.D.setParam(eq,'1g',2);f.mode({writable:false});f.mode({writable:true});await tick();
  assert.equal(f.panel.querySelector('.fx-wing-editor'),wrapper);assert.equal(f.panel.querySelector('[data-parameter="3g"] input'),input);assert.equal(tab.getAttribute('aria-selected'),'true');assert.equal(input.value,'5.5');assert.equal(svg.querySelector('.sculpt-rta-spectrum'),spectrum);assert.equal(f.rtaMounts,1);
  assert.equal(f.requests.at(-1).id,'ch-1');
});

test('full EQ resize fills its actual rectangle and keeps both frequency mapping and RTA region aligned',t=>{
  const f=fixture(t,{rta:true});f.show(eq,'STD');
  const plot=f.panel.querySelector('.fx-eq-display'),svg=plot.querySelector('svg'),line=svg.querySelector('.fx-plot-line'),input=f.panel.querySelector('[data-parameter="1g"] input'),before=line.getAttribute('d');
  input.focus();f.resize(svg,1100,320);
  assert.equal(svg.getAttribute('viewBox'),'0 0 1100 320');assert.deepEqual({...plot.plotRegion()},{left:36,top:16,width:1044,height:268});assert.equal(f.w.document.activeElement,input);assert.notEqual(line.getAttribute('d'),before);assert.equal(f.panel.querySelector('.fx-eq-display svg'),svg);
  const point=svg.querySelector('.fx-eq-point[data-band="1"]');svg.getScreenCTM=()=>({inverse:()=>({a:1,b:0,c:0,d:1,e:0,f:0})});
  const values=f.D.processor(eq).params,x=36+Math.log(values['1f']/20)/Math.log(1000)*1044,y=16+134-values['1g']*(268/138*3.5),frequency=values['1f'];
  f.pointer(point,'pointerdown',x,y);f.pointer(point,'pointermove',x+104.4,y);f.pointer(point,'pointerup',x+104.4,y);
  assert.ok(Math.abs(f.D.processor(eq).params['1f']-frequency*1000**.1)<1);
});

test('a new session or loss of control cancels rotary and EQ gestures before a later pointer can write',t=>{
  const f=fixture(t,{live:true});f.show(dyn,'COMP');
  let knob=f.panel.querySelector('[data-parameter="thr"] .fx-knob');f.pointer(knob,'pointerdown',40,160);f.pointer(knob,'pointermove',40,145);const threshold=f.D.processor(dyn).params.thr;
  f.mode({epoch:2});f.pointer(knob,'pointermove',40,50);assert.equal(f.D.processor(dyn).params.thr,threshold);assert.equal(knob.hasPointerCapture(9),false);
  const ratio=f.panel.querySelector('[data-parameter="ratio"] .fx-rotary-choice');f.pointer(ratio,'pointerdown',40,160);const oldRatio=f.D.processor(dyn).params.ratio;f.mode({writable:false});f.pointer(ratio,'pointermove',40,30);assert.equal(f.D.processor(dyn).params.ratio,oldRatio);assert.equal(ratio.hasPointerCapture(9),false);
  f.mode({writable:true});f.show(eq,'STD');const svg=f.panel.querySelector('.fx-eq-display svg'),point=svg.querySelector('.fx-eq-point[data-band="1"]');svg.getScreenCTM=()=>({inverse:()=>({a:1,b:0,c:0,d:1,e:0,f:0})});
  f.pointer(point,'pointerdown',300,85);const before=JSON.stringify(f.D.processor(eq).params);f.mode({epoch:3});f.pointer(point,'pointermove',380,60);assert.equal(JSON.stringify(f.D.processor(eq).params),before);assert.equal(point.hasPointerCapture(9),false);
  assert.equal(f.gestures.filter(item=>item[0]==='begin').length,f.gestures.filter(item=>item[0]==='end').length);
});

test('dynamics graph tabs select one generous chart without recreating inputs or changing audio',t=>{
  const f=fixture(t);f.show(dyn,'GATE');const input=f.panel.querySelector('[data-parameter="thr"] input'),transfer=f.panel.querySelector('.fx-wing-chart-transfer'),envelope=f.panel.querySelector('.fx-wing-chart-envelope'),before=JSON.stringify(f.D.processor(dyn));
  assert.equal(transfer.hidden,false);assert.equal(envelope.hidden,true);
  const tabs=[...f.panel.querySelectorAll('.fx-wing-graph-tab')];tabs[1].click();assert.equal(transfer.hidden,true);assert.equal(envelope.hidden,false);assert.equal(f.panel.querySelector('[data-parameter="thr"] input'),input);assert.equal(JSON.stringify(f.D.processor(dyn)),before);
  tabs[1].dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));assert.equal(transfer.hidden,false);assert.equal(f.w.document.activeElement,tabs[0]);
});

test('EQ automatic RTA changes its request with channel selection and closes every mount on disposal',async t=>{
  const f=fixture(t,{live:true,rta:true});f.show(eq,'STD');await tick();assert.equal(f.requests.at(-1).id,'ch-1');assert.equal(f.requests.at(-1).tap,'PREEQ');
  f.show({...eq,id:'ch-2'},'STD');await tick();assert.equal(f.requests.at(-1).id,'ch-2');assert.equal(f.panel.querySelectorAll('.sculpt-rta-spectrum').length,1);assert.equal(f.panel.querySelector('.sculpt-rta-trace').getAttribute('d'),'');
  f.close();await tick();assert.equal(f.requests.at(-1),null);assert.equal(f.panel.querySelectorAll('.sculpt-rta-spectrum').length,0);assert.equal(f.observers.filter(observer=>!observer.disposed).length,0);
});

test('a missing live parameter displays unknown and cannot become a demo-valued control',t=>{
  const f=fixture(t,{live:true});f.w.SculptLive.hasValue=path=>path!=='/ch/1/eq/1g';f.mode({definitions:Object.fromEntries(Catalog.get(eq,'STD').parameters.map(parameter=>[parameter.key,{path:'/ch/1/eq/'+parameter.key}]))});f.show(eq,'STD');
  const missing=f.panel.querySelector('[data-parameter="1g"]'),input=missing.querySelector('input'),knob=missing.querySelector('.fx-knob');assert.equal(input.value,'');assert.equal(input.disabled,true);assert.equal(input.placeholder,'—');assert.equal(knob.hasAttribute('aria-valuenow'),false);assert.equal(f.panel.querySelector('.fx-eq-display').dataset.known,'false');
  const before=JSON.stringify(f.D.processor(eq));knob.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(JSON.stringify(f.D.processor(eq)),before);
});

test('disposed or session-obsolete numeric, enum, boolean, string and trigger controls cannot commit',async t=>{
  const f=fixture(t,{live:true});f.show(dyn,'COMP');
  const number=f.panel.querySelector('[data-parameter="thr"] input'),choice=f.panel.querySelector('[data-parameter="ratio"] select'),toggle=f.panel.querySelector('[data-parameter="auto"] button');
  number.focus();const before=JSON.stringify(f.D.processor(dyn));f.show({...dyn,id:'ch-2'},'COMP');
  number.value='-12';number.dispatchEvent(new f.w.Event('change'));number.dispatchEvent(new f.w.FocusEvent('blur'));choice.value='4.0';choice.dispatchEvent(new f.w.Event('change'));toggle.click();
  assert.equal(JSON.stringify(f.D.processor(dyn)),before,'late controls cannot change the previous channel');
  const next=f.panel.querySelector('[data-parameter="thr"] input'),ch2={...dyn,id:'ch-2'},prior=f.D.processor(ch2).params.thr;next.focus();f.mode({epoch:2},true);next.value='-8';next.dispatchEvent(new f.w.FocusEvent('blur'));assert.equal(f.D.processor(ch2).params.thr,prior,'token invalidation protects even before the state notification');
  f.mode({epoch:2});const current=f.panel.querySelector('[data-parameter="thr"] input');assert.notEqual(current,next);current.value='-22';current.dispatchEvent(new f.w.Event('change'));assert.equal(f.D.processor(ch2).params.thr,-22,'the new session gets working controls');
  const fx={type:'fx',slot:1};f.mode({definitions:{preset:{type:'string',maxLength:32}}});f.show(fx,'VSS3');let triggered=0;f.w.SculptLive.triggerProcessor=async()=>{triggered++;};
  const name=f.panel.querySelector('[data-parameter="preset"] input'),load=f.panel.querySelector('[data-parameter="load"] button'),old=JSON.stringify(f.D.processor(fx));assert.ok(name);f.close();name.value='Obsolete';name.dispatchEvent(new f.w.Event('change'));load.click();await tick();assert.equal(JSON.stringify(f.D.processor(fx)),old);assert.equal(triggered,0);
});
