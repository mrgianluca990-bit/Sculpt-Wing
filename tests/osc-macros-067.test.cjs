const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../native/node_modules/jsdom');
const OSC=require('../dist/osc.js');
const {prepareActions,executeAction,isLocalAction}=require('../dist/systems.js');
const plain=value=>JSON.parse(JSON.stringify(value));

function fixture(t,{desktop=true}={}){
  const dom=new JSDOM('<!doctype html><body><div id="macro-buttons"></div></body>',{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window,base=path.join(__dirname,'../dist');
  t.after(()=>dom.window.close());w.setInterval=()=>0;w.clearInterval=()=>{};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const calls=[];if(desktop)w.SculptDesktop={available:true,sendOSC:async request=>{calls.push(plain(request));return {sent:true,confirmed:false,...request};}};
  const run=file=>w.eval(fs.readFileSync(path.join(base,file),'utf8'));run('model.js');run('plugin-data.js');
  const M=w.SculptModel,state=M.defaults(),listeners=new Set();
  const C=w.SculptController={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),transact:(fn,type)=>{fn(state);for(const cb of listeners)cb({type});return true;},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},capture:()=>plain(M.serialize(state)),updateStrip:(id,p)=>{M.patchStrip(M.find(state,id),p);return true;},getSend:(a,b)=>M.getSend(state,a,b),setSend:(a,b,p)=>M.setSend(state,a,b,p),canSend:(a,b)=>M.canRoute(M.find(state,a),M.find(state,b)),setSof:id=>M.setSof(state,id),showLayer:()=>{},toast:()=>{}};
  run('desk.js');run('shell.js');run('osc.js');run('systems.js');
  const named=label=>{const node=[...w.document.querySelectorAll('[aria-label]')].find(node=>node.getAttribute('aria-label')===label);assert(node,label);return node;};
  const button=label=>{const node=[...w.document.querySelectorAll('button')].find(node=>node.textContent===label);assert(node,label);return node;};
  const choose=(label,value)=>{const node=named(label);node.value=value;node.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const fill=(label,value)=>{const node=named(label);node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));node.dispatchEvent(new w.Event('change',{bubbles:true}));};
  return {w,C,D:w.SculptDesk,U:w.SculptUI,osc:w.SculptOSC,calls,choose,fill,button,named,env:{controller:C,desk:w.SculptDesk,osc:w.SculptOSC}};
}

test('Show presets match verified RC3 addresses and require identifiers only for targeted commands',()=>{
  for(const command of ['go','stopAll','pauseAll','resumeAll','fadeAll','next','previous','nextList'])assert.deepEqual(OSC.showMessage(command),{address:'/sculpt/'+command,args:[]});
  const id='01234567-89ab-cdef-0123-456789abcdef';
  assert.deepEqual(OSC.showMessage('cueFire',{cueId:id}),{address:'/sculpt/cue/'+id+'/fire',args:[]});
  assert.deepEqual(OSC.showMessage('cueLoopOff',{cueId:id}),{address:'/sculpt/cue/'+id+'/loop',args:[{type:'F'}]});
  assert.equal(OSC.showMessage('listPlay',{listId:id}).address,'/sculpt/list/'+id+'/play');
  assert.equal(OSC.showMessage('trigger',{alias:'intro-1'}).address,'/sculpt/trigger/intro-1');
  assert.throws(()=>OSC.showMessage('cueFire',{cueId:'1'}),/UUID/);assert.throws(()=>OSC.showMessage('trigger',{alias:'intro/*'}),/Alias/);assert.throws(()=>OSC.showMessage('fake'));
});

test('OSC macro runs without WING connection and freezes its destination during preflight',async t=>{
  const f=fixture(t),action={type:'osc',profile:'show',preset:'go',useGlobal:true};
  f.env.live={isLive:()=>true,isConnected:()=>false,isWritable:()=>false,snapshot:()=>{throw new Error('WING state must not be read');}};
  assert.equal(isLocalAction(action),true);await prepareActions([action],f.env);
  f.osc.setDestination('show',{host:'192.168.1.9',port:54000});await executeAction(action,f.env);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].host,'127.0.0.1');assert.equal(f.calls[0].port,53000);assert.equal(f.calls[0].address,'/sculpt/go');
});

test('an invalid later OSC action prevents earlier mixer and menu effects',async t=>{
  const f=fixture(t),before=f.C.getStrip('ch-1').level;
  f.D.change(d=>d.macros[8].actions=[{type:'fader',target:'ch-1',value:-2},{type:'menu',target:'groups'},{type:'osc',profile:'show',preset:'cueFire',cueId:'missing',useGlobal:true}]);
  const result=await f.w.SculptSystems.runMacro(9);assert.equal(result.ok,false);assert.match(result.error,/UUID/);assert.equal(f.C.getStrip('ch-1').level,before);assert.equal(f.U.current(),null);assert.equal(f.calls.length,0);
  f.D.change(d=>d.macros[8].actions=[{type:'osc',profile:'show',preset:'go',useGlobal:true},{type:'dca',target:'999',value:0}]);
  const result2=await f.w.SculptSystems.runMacro(9);assert.equal(result2.ok,false);assert.equal(f.calls.length,0,'the OSC command is not sent before discovering an invalid later mixer action');
});

test('OSC UI assigns Show to a blank macro and preserves destination settings locally',async t=>{
  const f=fixture(t);f.U.open('osc');assert.equal(f.named('IP destinazione show').value,'127.0.0.1');assert.equal(f.named('Porta destinazione show').value,'53000');
  f.fill('IP destinazione show','192.168.1.8');f.fill('Porta destinazione show','53001');f.button('Salva destinazione Show').click();
  assert.deepEqual(plain(f.osc.getConfig().show),{host:'192.168.1.8',port:53001});assert.equal(JSON.parse(f.w.localStorage.getItem('sculpt-wing-osc-v1')).show.port,53001);
  f.choose('Comando Sculpt Show','stopAll');f.choose('Macro per il messaggio OSC','9');f.button('Aggiungi alla macro').click();
  assert.equal(f.U.current(),'macros');const macro=f.D.get().macros[8];assert.equal(macro.actions.length,1);assert.equal(macro.actions[0].type,'osc');assert.equal(macro.actions[0].preset,'stopAll');assert.match(macro.name,/Show/);assert.equal(f.calls.length,0,'assigning a macro does not send OSC');
  const result=await f.w.SculptSystems.runMacro(9);assert.equal(result.ok,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].address,'/sculpt/stopAll');assert.equal(f.calls[0].host,'192.168.1.8');
});

test('custom OSC typed arguments are editable and browser-only execution is clearly unavailable',async t=>{
  const f=fixture(t,{desktop:false});f.U.open('macros',{id:10});f.choose('Cosa vuoi assegnare?','osc');f.button('Assegna azione').click();f.choose('Profilo OSC 1','custom');f.fill('Indirizzo OSC 1','/lighting/scene');f.button('+ Argomento OSC').click();f.choose('Tipo argomento OSC 1 1','s');f.fill('Valore argomento OSC 1 1','Scena A');
  const action=f.D.get().macros[9].actions[0];assert.equal(action.address,'/lighting/scene');assert.deepEqual(plain(action.args),[{type:'s',value:'Scena A'}]);
  const result=await f.w.SculptSystems.runMacro(10);assert.equal(result.ok,false);assert.match(result.error,/app Sculpt Wing per Mac/);assert.equal(f.calls.length,0);
});
