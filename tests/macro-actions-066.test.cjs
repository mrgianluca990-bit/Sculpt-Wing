const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../native/node_modules/jsdom');
const {executeAction,prepareActions}=require('../dist/systems.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(t){
  const dom=new JSDOM('<!doctype html><body><div id="macro-buttons"></div></body>',{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window,base=path.join(__dirname,'..','dist');
  t.after(()=>dom.window.close());w.setInterval=()=>0;w.clearInterval=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const run=file=>w.eval(fs.readFileSync(path.join(base,file),'utf8'));run('model.js');run('plugin-data.js');
  const M=w.SculptModel,state=M.defaults(),listeners=new Set(),views=[],notices=[];
  const C=w.SculptController={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),transact:(fn,type)=>{fn(state);for(const cb of listeners)cb({type});return true;},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},capture:()=>plain(M.serialize(state)),updateStrip:(id,p)=>{M.patchStrip(M.find(state,id),p);return true;},getSend:(a,b)=>M.getSend(state,a,b),setSend:(a,b,p)=>M.setSend(state,a,b,p),canSend:(a,b)=>M.canRoute(M.find(state,a),M.find(state,b)),setSof:id=>M.setSof(state,id),showLayer:(layout,name)=>views.push({layout,name}),toast:text=>notices.push(text)};
  run('desk.js');run('shell.js');run('systems.js');
  const U=w.SculptUI,D=w.SculptDesk;
  const button=text=>[...w.document.querySelectorAll('button')].find(node=>node.textContent===text);
  const input=label=>w.document.querySelector('[aria-label="'+label+'"]');
  const choose=(label,value)=>{const node=input(label);assert(node,label);node.value=value;node.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const env={controller:C,desk:D,catalog:w.SculptCatalog,ui:U};
  return {w,state,C,D,U,env,views,notices,button,input,choose,run};
}
test('menu, FX plugin and editor actions remain local in a disconnected live session',async t=>{
  const f=fixture(t),calls=[],before=f.C.getStrip('ch-1').level;f.env.live={isLive:()=>true,isConnected:()=>false,isWritable:()=>false,snapshot:()=>{throw new Error('no write snapshot expected');}};
  f.env.ui={listPages:()=>[{id:'io'}],open:(...args)=>calls.push(['page',...args]),close:()=>calls.push(['close']),showMenu:()=>calls.push(['bank-menu'])};
  f.env.fx={open:ctx=>calls.push(['fx',ctx])};f.env.editor={openSection:(...args)=>{calls.push(['editor',...args]);return true;}};
  const actions=[{type:'menu',target:'io',tab:'outputs'},{type:'menu',target:'fx-editor',slot:3},{type:'menu',target:'bank-menu'},{type:'editor',target:'ch-1',tab:'sends'}];
  await prepareActions(actions,f.env);for(const action of actions)await executeAction(action,f.env);
  assert(calls.some(call=>call[0]==='page'&&call[1]==='io'&&call[2].tab==='outputs'));assert(calls.some(call=>call[0]==='fx'&&call[1].slot===3));assert(calls.some(call=>call[0]==='editor'&&call[2]==='sends'));
  assert.equal(f.C.getStrip('ch-1').level,before);
});
test('SOF and layers recall the shared view without rewriting strip parameters',async t=>{
  const f=fixture(t),before=plain(f.C.capture().values);f.D.change(d=>d.layers.push({id:'duo',name:'Duo',rows:{top:['bus-2'],bottom:['ch-1','ch-2']},members:['bus-2','ch-1','ch-2']}));
  const actions=[{type:'sof',target:'bus-2'},{type:'layer',target:'duo'},{type:'sof',target:'off'},{type:'layer',target:'all'}];
  await prepareActions(actions,f.env);for(const action of actions)await executeAction(action,f.env);
  assert.equal(f.state.sof,null);assert.equal(f.D.get().activeLayer,null);assert(f.views.some(view=>view.name==='Duo'&&view.layout.bottom.includes('ch-1')));assert.deepEqual(plain(f.C.capture().values),before);
});
test('processor macros use the catalog values and refuse a changed model before a menu action',async t=>{
  const f=fixture(t),context={type:'strip',id:'ch-1',block:'eq'},actions=[{type:'processorParam',context,model:'STD',key:'lg',mode:'set',value:4.5},{type:'processorParam',context,model:'STD',key:'leq',mode:'set',value:'PEQ'}];
  const choices=f.w.SculptCatalog.get(context,'STD').parameters.find(p=>p.key==='leq').options;actions[1].value=choices.at(-1);
  await prepareActions(actions,f.env);for(const action of actions)await executeAction(action,f.env);
  assert.equal(f.D.processor(context).params.lg,4.5);assert.equal(f.D.processor(context).params.leq,choices.at(-1));
  let writes=0;const live={isLive:()=>true,isConnected:()=>true,isWritable:()=>true,readNode:async()=>{},metadata:()=>({path:'/cfg/test',type:4,readOnly:false,revision:1}),hasValue:()=>true,value:()=>0,write:async()=>{writes++;}};
  for(const value of [2147483648,-2147483649])await assert.rejects(prepareActions([{type:'wingParameter',path:'/cfg/test',mode:'set',value}],{...f.env,live}),/32 bit/);
  assert.equal(writes,0,'an out-of-range integer is rejected during preflight even without metadata bounds');

  f.D.change(d=>d.macros[8].actions=[{type:'menu',target:'groups'},...actions]);f.D.setModel(context,'SOUL');const result=await f.w.SculptSystems.runMacro(9);assert.equal(result.ok,false);assert.match(result.error,/modello/);assert.equal(f.U.current(),null);
});
test('known invalid later targets and gate sections fail before earlier audio or navigation',async t=>{
  const f=fixture(t),before=f.C.getStrip('ch-1').level;
  f.D.change(d=>d.macros[8].actions=[{type:'fader',target:'ch-1',value:-2},{type:'dca',target:'999',value:0}]);
  const result=await f.w.SculptSystems.runMacro(9);assert.equal(result.ok,false);assert.equal(f.C.getStrip('ch-1').level,before);
  await assert.rejects(prepareActions([{type:'menu',target:'io'},{type:'editor',target:'bus-1',tab:'dynamics',block:'gate'}],f.env),/dinamico/);
  await assert.rejects(prepareActions([{type:'menu',target:'io'},{type:'fader',target:'missing',value:0}],f.env),/Canale/);
});
test('WING picker selection configures a macro without executing the parameter',t=>{
  const f=fixture(t);let selected,reads=0,writes=0;
  f.w.SculptLive={isLive:()=>false,isConnected:()=>true,metadata:()=>({type:4,min:0,max:1,readOnly:false}),openExplorer:(path,options)=>{reads++;selected=options.onSelect;},write:()=>{writes++;}};
  f.U.open('macros',{id:9});f.choose('Cosa vuoi assegnare?','wingParameter');f.button('Assegna azione').click();f.button('Scegli dal banco').click();assert.equal(reads,1);
  selected({path:'/ch/3/mute',label:'Mute voce',value:1,metadata:{type:4,min:0,max:1}});
  const action=f.D.get().macros[8].actions[0];assert.equal(action.path,'/ch/3/mute');assert.equal(action.value,1);assert.equal(action.parameterLabel,'Mute voce');assert.equal(writes,0);assert.equal(f.U.current(),'macros');
});
