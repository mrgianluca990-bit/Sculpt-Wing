const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const PROFILE='sculpt-wing-macros-v1';
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture({profile,desk,live=false}={}){
  const dom=new JSDOM('<!doctype html><body><button id="menu-button">Menu</button><div id="macro-buttons"></div></body>',{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  if(profile)w.localStorage.setItem(PROFILE,JSON.stringify(profile));
  const run=name=>w.eval(fs.readFileSync(path.join(__dirname,'../dist',name),'utf8'));
  run('model.js');run('plugin-data.js');const M=w.SculptModel;let state=M.defaults();if(desk)state.desk=copy(desk);
  const events=new Set(),messages=[],executed=[],opened=[];
  const emit=type=>{for(const fn of events)fn({type});};
  const C=w.SculptController={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),subscribe:fn=>{events.add(fn);return()=>events.delete(fn);},transact:(fn,type='console')=>{fn(state);emit(type);return true;},capture:()=>copy(M.serialize(state)),restore:snapshot=>{state=M.restore(copy(snapshot));state.desk=w.SculptDesk.normalize(state.desk);emit('restore');return true;},toast:message=>messages.push(message),setSof:()=>{}};
  if(live)w.SculptLive={isLive:()=>true,canPersist:()=>false,snapshot:()=>({mode:'disconnected',writable:false}),pageOpened:()=>{}};
  run('desk.js');run('shell.js');const D=w.SculptDesk,U=w.SculptUI;
  U.register('macros',{title:'Macro Sculpt',subtitle:'Assegnazioni',render:(node,args)=>{opened.push(copy(args));const input=w.document.createElement('input');input.setAttribute('aria-label','Nome macro di prova');node.append(input);}});
  w.SculptSystems={runMacro:id=>executed.push(id)};
  const railButton=id=>w.document.querySelector(`.macro-action[data-macro-id="${id}"]`);
  return {dom,w,M,C,D,U,run,executed,opened,messages,railButton,get state(){return state;}};
}

test('legacy eight-slot banks gain eight empty slots without changing stored actions or intentional empties',()=>{
  const bank=Array.from({length:8},(_,i)=>({id:i+1,name:'Utente '+(i+1),actions:i===2?[]:[{id:'old-'+i,type:'mute',target:'ch-'+(i+1),mode:'toggle'}]}));
  const f=fixture({desk:{macros:bank}});
  assert.equal(f.D.get().macros.length,16);assert.deepEqual(copy(f.D.get().macros.slice(0,8)),bank);
  assert.deepEqual(copy(f.D.get().macros.slice(8)),Array.from({length:8},(_,i)=>({id:i+9,name:'',actions:[]})));
  assert.equal(f.D.get().macrosSeeded,true);
  const sparse=f.D.normalize({macros:[{id:16,name:'Finale',actions:[{type:'menu',target:'mixer'}]},{id:'2',name:'Due',actions:[]},{id:16,name:'Duplicato',actions:[]} ]});
  assert.equal(sparse.macros.length,16);assert.equal(sparse.macros[15].name,'Finale');assert.equal(sparse.macros[1].name,'Due');assert.equal(sparse.macros[8].actions.length,0);
  f.dom.window.close();
});

test('local macro edits persist while live project persistence is disabled and contain no audio state',()=>{
  const f=fixture({live:true}),before=copy(f.C.capture());
  f.D.change(d=>{d.macros[8]={id:9,name:'Routing',actions:[{id:'menu-9',type:'menu',target:'io'}]};d.macrosSeeded=true;});
  const saved=JSON.parse(f.w.localStorage.getItem(PROFILE));
  assert.deepEqual(Object.keys(saved).sort(),['macros','macrosSeeded','version']);assert.equal(saved.macros[8].name,'Routing');assert.equal(saved.macros.length,16);
  const after=copy(f.C.capture());for(const value of [before,after]){delete value.desk.macros;delete value.desk.macrosSeeded;}assert.deepEqual(after,before);
  const reboot=fixture({profile:saved});assert.equal(reboot.D.get().macros[8].name,'Routing');assert.equal(reboot.D.get().macros[8].actions[0].target,'io');assert.equal(reboot.D.get().macrosSeeded,true);assert.equal(reboot.D.get().macros[9].actions.length,0);
  f.dom.window.close();reboot.dom.window.close();
});

test('explicit project import and reset replace the macro profile instead of reapplying an older bank',()=>{
  const profile={version:1,macrosSeeded:true,macros:[{id:9,name:'Profilo precedente',actions:[{type:'menu',target:'io'}]}]},f=fixture({profile});
  const project=f.C.capture();project.desk.macros[8]={id:9,name:'Nel progetto',actions:[{id:'scene-menu',type:'menu',target:'scenes'}]};
  f.C.restore(project);assert.equal(f.D.get().macros[8].name,'Nel progetto');assert.equal(JSON.parse(f.w.localStorage.getItem(PROFILE)).macros[8].name,'Nel progetto');
  f.D.reset();assert.equal(f.D.get().macros[8].name,'');assert.equal(f.D.get().macros[8].actions.length,0);assert.equal(JSON.parse(f.w.localStorage.getItem(PROFILE)).macros[8].actions.length,0);
  f.dom.window.close();
});

test('all sixteen rail buttons stay reachable and empty, configured, and edit gestures have distinct outcomes',()=>{
  const f=fixture();f.D.change(d=>{for(let i=0;i<8;i++)d.macros[i].actions=[{id:'seed-'+i,type:'mute',target:'ch-'+(i+1),mode:'toggle'}];d.macrosSeeded=true;});
  assert.equal(f.w.document.querySelectorAll('.macro-action').length,16);assert.equal(f.w.document.querySelectorAll('.macro-action.is-empty').length,8);
  f.railButton(16).click();assert.equal(f.opened.at(-1).id,16);assert.equal(f.executed.length,0);f.U.close();
  f.D.change(d=>{d.macros[15].name='Menu I/O';d.macros[15].actions=[{id:'io',type:'menu',target:'io'}];});
  f.railButton(16).click();assert.deepEqual(f.executed,[16]);assert.equal(f.railButton(16).classList.contains('is-empty'),false);
  f.railButton(16).dispatchEvent(new f.w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));assert.equal(f.opened.at(-1).id,16);assert.deepEqual(f.executed,[16]);f.U.close();
  f.railButton(16).focus();f.railButton(16).dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'F2',bubbles:true,cancelable:true}));assert.equal(f.U.current(),'macros');assert.deepEqual(f.executed,[16]);
  f.D.change(d=>d.macros[15].name='Menu routing');f.U.close();assert.equal(f.w.document.activeElement,f.railButton(16));
  f.railButton(9).dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.opened.at(-1).id,9);assert.deepEqual(f.executed,[16]);
  f.dom.window.close();
});

test('navigation registry exposes current page titles without exposing or mutating renderers',()=>{
  const f=fixture();const render=()=>{};f.U.register('io',{title:'Ingressi / uscite',subtitle:'Routing',render});
  const first=f.U.listPages(),io=first.find(page=>page.id==='io');assert.deepEqual(copy(io),{id:'io',title:'Ingressi / uscite',subtitle:'Routing'});io.title='Changed';
  assert.equal(f.U.listPages().find(page=>page.id==='io').title,'Ingressi / uscite');f.U.register('fx',{title:'Rack FX',menuHint:'Processori',render});assert.equal(f.U.listPages().find(page=>page.id==='fx').subtitle,'Processori');
  f.dom.window.close();
});
