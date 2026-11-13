'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const base=path.join(__dirname,'../dist');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function until(predicate,label){const end=Date.now()+15000;while(Date.now()<end){if(predicate())return;await pause(10);}throw new Error('Timed out: '+label);}
class FixtureWing {
  constructor(catalog){
    this.values=new Map();this.meta=new Map();this.writes=[];this.reads=[];this.handlers={value:new Set(),status:new Set(),schema:new Set(),meters:new Set()};
    const field=(p,value,type,extra={})=>{this.values.set(p,value);this.meta.set(p,{path:p,name:p.split('/').at(-1),longName:p.split('/').at(-1),type,revision:1,readOnly:false,...extra});};
    this.field=field;
    for(const [kind,count]of [['ch',40],['aux',8],['bus',16],['main',4],['mtx',8]])for(let n=1;n<=count;n++){
      const p=`/${kind}/${n}`;field(p+'/fdr',-13,3);field(p+'/mute',0,4,{min:0,max:1});field(p+'/pan',0,1,{min:-100,max:100});field(p+'/name',`${kind.toUpperCase()} ${n}`,7,{maxLength:16});field(p+'/$name',`${kind.toUpperCase()} ${n}`,7,{readOnly:true,maxLength:16});field(p+'/col',9,4,{min:0,max:18});
      if(['ch','aux'].includes(kind))field(p+'/clink',0,4,{min:0,max:1});
      for(const stage of kind==='aux'?['preins']:['preins','postins']){field(p+'/'+stage+'/ins','NONE',5,{items:[{value:'NONE',label:'NONE'},...Array.from({length:16},(_,i)=>({value:'FX'+(i+1),label:'FX'+(i+1)}))]});field(p+'/'+stage+'/on',0,4,{min:0,max:1});}
    }
    for(let slot=1;slot<=16;slot++){
      const model=slot===1?'VSS3':'NONE',p='/fx/'+slot;field(p+'/mdl',model,5,{items:catalog.list({type:'fx',slot}).map(m=>({value:m.id,label:m.name}))});field(p+'/fxmix',100,1,{min:0,max:100});
      for(const param of catalog.get({type:'fx',slot},model).parameters){const value=slot===1&&param.key==='dcy'?2.7:param.default,type=param.type==='enum'?5:param.type==='boolean'?4:1;field(p+'/'+param.sourceKey,value,type,{min:param.min,max:param.max,...(param.type==='enum'?{items:param.options.map(v=>({value:v,label:v}))}:{})});}
    }
  }
  listen(kind,fn){this.handlers[kind].add(fn);return()=>this.handlers[kind].delete(fn);}onValue(fn){return this.listen('value',fn);}onStatus(fn){return this.listen('status',fn);}onSchemaChange(fn){return this.listen('schema',fn);}onStripMeters(fn){return this.listen('meters',fn);}
  emit(kind,...args){for(const fn of this.handlers[kind])fn(...args);}
  group(path){return [...this.meta.keys()].some(p=>p.startsWith(path+'/'));}
  async connect(){return{name:'Hardware fixture',model:'WING-RACK',firmware:'3.1.2 test fixture',host:'192.168.1.100'};}
  async disconnect(){this.emit('status','disconnected');}
  async subscribeStripMeters(){}
  async describe(path){if(this.describeHook)await this.describeHook(path);if(this.meta.has(path))return this.meta.get(path);if(this.group(path))return{path,name:path.split('/').at(-1),type:0,revision:1};throw new Error('Fixture does not expose '+path);}
  async list(path,{refresh=false}={}){
    if(refresh)this.emit('schema',{path,revision:1});
    const children=new Map();for(const [p,m]of this.meta){if(!p.startsWith(path+'/'))continue;const suffix=p.slice(path.length+1),first=suffix.split('/')[0],child=path+'/'+first;if(!children.has(child))children.set(child,suffix.includes('/')?{path:child,name:first,type:0,revision:1}:m);}return [...children.values()];
  }
  async readTree(path){const own=await this.describe(path);if(own.type!==0)return{[path]:await this.get(path)};const out={};for(const m of await this.list(path))if(m.type!==0)out[m.path]=await this.get(m.path);return out;}
  async get(path){this.reads.push(path);if(!this.values.has(path))throw new Error('Unknown fixture leaf '+path);return this.values.get(path);}
  async set(path,value){this.writes.push({path,value});if(this.rejectNext){const error=this.rejectNext;this.rejectNext=null;throw error;}this.values.set(path,value);this.emit('value',path,value);}
  async trigger(path,value){return this.set(path,value);}
}

// This executes the actual app mutation checkpoint/reconcile code and registered
// DOM handlers. It is not a controller stub and does not claim native I/O proof.
test('real app connects through the native boundary, guards edits, reads back and hydrates the plugin UI',async t=>{
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window;
  t.after(()=>dom.window.close());
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
  w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.setPointerCapture=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const run=file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  run('plugin-data.js');run('plugin-panels.js');run('model.js');
  const driver=new FixtureWing(w.SculptCatalog);w.SculptNative={available:true,platform:'ios',driver};
  for(const file of ['app.js','desk.js','shell.js','plugins.js','editor.js','wing-map.js','live-session.js','live.js'])run(file);
  const C=w.SculptController,D=w.SculptDesk,initialLevel=C.getStrip('ch-1').level,stripRef=C.getStrip('ch-1'),readout=()=>w.document.querySelector('[data-id="ch-1"] .level-readout span');
  assert.equal(w.SculptLive.snapshot().mode,'disconnected');assert.equal(readout().textContent,'—');
  w.document.getElementById('wing-connection').click();
  w.document.querySelector('.live-connect-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>w.SculptLive.isConnected(),'initial mixer synchronization');
  assert.equal(C.getStrip('ch-1').level,-13);assert.equal(C.getStrip('ch-1'),stripRef);assert.equal(driver.writes.length,0);assert.equal(w.SculptLive.isWritable(),false);
  assert.equal(w.SculptLive.gainReduction('ch-1'),null,'live GR waits for an actual meter packet');
  driver.emit('meters',{receivedAt:Date.now(),reportId:1,strips:{ch:{1:{input:[-12,-18],output:[-24,-30],gateGainRaw:128,dynGainRaw:64}}}});
  assert.equal(w.SculptLive.gainReduction('ch-1').gate.fraction,.5);assert.equal(w.SculptLive.gainReduction('ch-1').comp.fraction,.25);assert.equal(w.SculptLive.gainReduction('ch-1').comp.db,null);
  assert.equal(w.SculptLive.meter('ch-1','input').left,-12);assert.equal(w.SculptLive.meter('ch-1','output').left,-24);
  const fader=w.document.querySelector('[data-id="ch-1"] [role="slider"]');fader.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
  assert.equal(C.getStrip('ch-1').level,-13,'read-only edit rolls back through the real app commit');assert.equal(C.getStrip('ch-1'),stripRef,'rollback keeps strip references used by DOM handlers');
  const writesBeforeLocalMacro=driver.writes.length;
  assert.equal(D.change(d=>{d.macros[8].name='Patch rapido';d.macros[8].actions=[{id:'macro-review-open-io',type:'menu',target:'io'}];},'macro'),true);
  assert.equal(D.get().macros[8].name,'Patch rapido','macro configuration remains local in live read-only mode');
  assert.equal(driver.writes.length,writesBeforeLocalMacro,'editing a local macro sends no mixer commands');
  let pickedMacroParameter=null;
  w.SculptLive.openExplorer('/ch/1',{onSelect:entry=>pickedMacroParameter=entry});
  await until(()=>!!w.document.querySelector('[aria-label="Usa nella macro /ch/1/fdr"]'),'read-only WING parameter picker');
  assert.equal([...w.document.querySelectorAll('.wing-nodes button')].some(button=>button.textContent==='Invia'),false,'the assignment picker exposes selection without a send button');
  assert.equal(w.document.querySelector('[aria-label="Usa nella macro /ch/1/$name"]'),null,'read-only WING nodes cannot become writable macro assignments');
  w.document.querySelector('[aria-label="Usa nella macro /ch/1/fdr"]').click();
  assert.equal(pickedMacroParameter.path,'/ch/1/fdr');assert.equal(pickedMacroParameter.value,-13);
  assert.equal(driver.writes.length,writesBeforeLocalMacro,'choosing the parameter does not execute it');
  w.SculptUI.open('connection');
  w.document.querySelector('.live-arm').click();assert.equal(w.SculptLive.isWritable(),true);
  fader.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
  await until(()=>driver.values.get('/ch/1/fdr')===-12.5&&w.SculptLive.snapshot().pending===0,'fader readback');assert.equal(C.getStrip('ch-1').level,-12.5);assert.match(readout().textContent,/12\.5/);
  driver.rejectNext=new Error('Remote lock fixture');fader.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  await until(()=>w.SculptLive.snapshot().failureVersion===1&&w.SculptLive.snapshot().pending===0,'rejected gesture rollback');assert.equal(C.getStrip('ch-1').level,-12.5);assert.equal(C.getStrip('ch-1'),stripRef);
  w.SculptFX.open({type:'fx',slot:1});await until(()=>w.SculptLive.processorState({type:'fx',slot:1}).ready,'plugin metadata hydration');
  let decay=w.document.querySelector('.fx-modal [data-parameter="dcy"] input');assert.equal(decay.value,'2.7');assert.equal(decay.disabled,false);assert.equal(decay.max,'20');
  const processorRef=D.processor({type:'fx',slot:1});decay.value='3.2';decay.dispatchEvent(new w.Event('change',{bubbles:true}));
  await until(()=>driver.values.get('/fx/1/dcy')===3.2&&w.SculptLive.snapshot().pending===0,'plugin readback');assert.equal(D.processor({type:'fx',slot:1}),processorRef);assert.equal(processorRef.params.dcy,3.2);
  assert.equal(D.assignFx(1,'ch-1','pre'),true);
  await until(()=>driver.values.get('/ch/1/preins/ins')==='FX1'&&w.SculptLive.snapshot().pending===0,'insert assignment with derived rack state');
  assert.equal(D.channel('ch-1').preFx,1);assert.equal(D.processor({type:'fx',slot:1}).stripId,'ch-1');
  const beforeMixed=C.getStrip('ch-1').level,writesBeforeMixed=driver.writes.length;
  assert.equal(C.transact(s=>{s.inputs.find(x=>x.id==='ch-1').level=-2;s.desk.setup.unmappedFeature=true;},'mixed'),false);
  assert.equal(C.getStrip('ch-1').level,beforeMixed);assert.equal(driver.writes.length,writesBeforeMixed);assert.equal(D.get().setup.unmappedFeature,undefined);
  // Exercise the editor's actual live read gate. Its first network read is
  // delayed and fails, then a user retries against the same real coordinator.
  const mapped=w.SculptWingMap.capture(C.getState());
  const sourceIds=new Set([D.channel('ch-1').source,D.channel('ch-1').altSource]);
  for(const descriptor of w.SculptWingMap.descriptors(C.getState())){
    if(!(descriptor.stripId==='ch-1'&&descriptor.section!=='sends'||sourceIds.has(descriptor.sourceId)||descriptor.path==='/io/altsw'||descriptor.path==='/io/autoaltovr'))continue;
    const value=mapped.get(descriptor.path);if(value===undefined||driver.values.has(descriptor.path))continue;
    driver.field(descriptor.path,value,typeof value==='string'?7:descriptor.type==='integer'?4:1,{readOnly:!!descriptor.readOnly,min:-144,max:20000,maxLength:256});
  }
  driver.values.set('/io/in/LCL/1/g',23);
  const held=deferred();driver.describeHook=path=>path==='/ch/1/in/set'?held.promise:undefined;
  w.SculptEditor.open('ch-1');
  assert.equal(w.document.querySelector('.editor-live-read').dataset.state,'loading');assert.equal(w.document.querySelector('.editor-panel input'),null,'seeded controls stay hidden while the read is pending');
  held.reject(new Error('Read interruption fixture'));await until(()=>w.document.querySelector('.editor-live-read')?.dataset.state==='error','editor failed read state');
  assert.equal(w.document.querySelector('.editor-panel input'),null,'failed reads never expose seeded controls');
  driver.describeHook=null;[...w.document.querySelectorAll('.editor-panel button')].find(b=>b.textContent==='Riprova lettura').click();
  await until(()=>!!w.document.querySelector('.editor-panel input[aria-label="Gain preamp in dB"]'),'editor hydrated source gain');
  let gain=w.document.querySelector('.editor-panel input[aria-label="Gain preamp in dB"]');assert.equal(gain.value,'23');
  driver.values.set('/io/in/LCL/1/g',27);driver.emit('value','/io/in/LCL/1/g',27);await until(()=>gain.value==='27','external source push updates editor binding');
  const white=[...w.document.querySelectorAll('.editor-colors button')].find(b=>b.getAttribute('aria-label')==='Colore Bianco');white.click();
  await until(()=>w.SculptLive.snapshot().pending===0&&C.getStrip('ch-1').color==='#e0e0e0','palette conversion accepted by mutation guard');
  w.SculptEditor.close();w.SculptFX.open({type:'fx',slot:1});
  w.SculptUI.open('connection');w.document.querySelector('.live-arm').click();
  decay=w.document.querySelector('.fx-modal [data-parameter="dcy"] input');decay.value='7';decay.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(processorRef.params.dcy,3.2);assert.equal(D.processor({type:'fx',slot:1}),processorRef,'processor reference survives rejected edit');
  w.SculptEditor.open('ch-1');await until(()=>!!w.document.querySelector('.editor-panel input[aria-label="Gain preamp in dB"]'),'reopen hydrated editor');
  driver.emit('status','suspended','Background fixture');
  assert.equal(w.SculptLive.snapshot().mode,'suspended');assert.equal(w.document.querySelector('.editor-panel input'),null,'connection status removes stale editor controls immediately');
  assert.equal(w.SculptLive.gainReduction('ch-1'),null,'suspension clears actual GR frames along with stereo metering');
  assert.match(w.document.querySelector('.editor-panel').textContent,/WING non collegata/);
  assert.equal(w.document.querySelector('.fx-modal [data-parameter="dcy"] input').disabled,true,'standalone plugin also responds to connection status');
  w.SculptUI.open('connection');
  const demoButton=[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Torna alla demo');demoButton.click();
  await until(()=>w.SculptLive.snapshot().mode==='demo'&&C.getStrip('ch-1').level===initialLevel,'return to local demo');
  assert.equal(driver.values.get('/ch/1/fdr'),-12.5,'restoring demo never sends it to the mixer');
  assert.equal(D.get().macros[8].name,'Patch rapido','return to demo preserves macro edits made in the live session');
  assert.equal(D.get().macros[8].actions[0].target,'io');
  const savedMacros=JSON.parse(w.localStorage.getItem('sculpt-wing-macros-v1'));
  assert.equal(savedMacros.macros[8].name,'Patch rapido','the independent local macro profile retains the latest definition');
  dom.window.close();
});
