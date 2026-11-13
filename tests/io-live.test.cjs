const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../native/node_modules/jsdom');
const base=path.join(__dirname,'..','dist');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(isLive=true){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
  const run=file=>w.eval(fs.readFileSync(path.join(base,file),'utf8'));
  run('model.js');run('plugin-data.js');const M=w.SculptModel,state=M.defaults(),subscriptions=new Set();
  w.SculptController={getState:()=>state,getStrip:id=>M.find(state,id),listStrips:()=>M.list(state),transact:fn=>fn(state),subscribe:fn=>{subscriptions.add(fn);return()=>subscriptions.delete(fn);},capture:()=>JSON.parse(JSON.stringify(M.serialize(state))),updateStrip:(id,p)=>M.patchStrip(M.find(state,id),p),toast:()=>{}};
  run('desk.js');run('wing-map.js');run('shell.js');
  const pending=[],values=new Map(),metadata=new Map(),events=new Set(),explorer=[];
  const wire={
    '/ch/1/in/conn/grp':'USB','/ch/1/in/conn/in':5,
    '/io/in/LCL/1/name':'Stage vocal','/io/in/LCL/1/g':22,'/io/in/LCL/1/vph':0,
    '/io/out/LCL/1/grp':'MAIN','/io/out/LCL/1/in':2
  };
  const L=w.SculptLive={isLive:()=>isLive,isConnected:()=>true,isWritable:()=>true,snapshot:()=>({mode:'live',writable:true}),hasValue:p=>values.has(p),metadata:p=>metadata.get(p),value:p=>values.get(p),hasStripValue:()=>true,openExplorer:p=>explorer.push(p),subscribe:fn=>{events.add(fn);return()=>events.delete(fn);},loadScope(scope,args){return new Promise((resolve,reject)=>pending.push({scope,args,resolve(){
    const nodes=w.SculptWingMap.readPaths(state,scope,args),captured=w.SculptWingMap.capture(state);
    for(const d of w.SculptWingMap.descriptors(state)){if(!nodes.some(n=>d.path.startsWith(n+'/')&&!d.path.slice(n.length+1).includes('/')))continue;const value=Object.prototype.hasOwnProperty.call(wire,d.path)?wire[d.path]:captured.get(d.path);if(value===undefined)continue;values.set(d.path,value);metadata.set(d.path,{path:d.path,type:d.type==='string'?7:d.type==='integer'?4:1,readOnly:d.readOnly||false,min:d.path.endsWith('/g')?-3:undefined,max:d.path.endsWith('/g')?45.5:undefined});w.SculptWingMap.apply(state,d.path,value);}
    resolve();},reject}));}};
  run('io.js');
  const button=(text,scope=w.document)=>[...scope.querySelectorAll('button')].find(n=>n.textContent===text);
  const finish=async()=>{assert(pending.length,'a read is pending');pending.shift().resolve();await settle();};
  return {dom,w,state,L,pending,values,metadata,explorer,button,finish};
}
test('live I/O hides demo patch values until scoped read completes',async()=>{
  const f=fixture();f.w.SculptUI.open('io');const body=f.w.document.querySelector('.io-page-body');
  assert.match(body.textContent,/Lettura dei valori/);assert.equal(body.querySelector('table'),null);
  assert.equal(f.pending[0].scope,'io');assert.equal(f.pending[0].args.direction,'inputs');assert.equal(f.pending[0].args.count,8);
  await f.finish();assert.match(body.textContent,/USB 05/);assert(body.querySelector('table'));
  assert(!f.button('Importa patch'));
  f.button('Uscite').click();assert.match(f.w.document.querySelector('.io-page-body').textContent,/Lettura dei valori/);await f.finish();
  const current=f.w.document.querySelector('.io-page-body');assert.match(current.textContent,/MAIN 01/);assert.match(current.textContent,/Tap tramite USER/);
  assert(![...current.querySelectorAll('select')].some(s=>s.getAttribute('aria-label')?.startsWith('Tap uscita')));
  f.dom.window.close();
});
test('source editor loads the source, uses real gain and omits invented source trim',async()=>{
  const f=fixture();f.w.SculptIO.sourceEditor('LCL:1');
  let modal=f.w.document.querySelector('.desk-modal-body');assert.match(modal.textContent,/Lettura dei valori/);assert.equal(modal.querySelector('input'),null);
  assert.equal(f.pending[0].scope,'source');await f.finish();
  modal=f.w.document.querySelector('.desk-modal-body');assert.equal(modal.querySelector('[aria-label="Nome sorgente"]').value,'Stage vocal');
  const gain=modal.querySelector('[aria-label="Gain headamp"]');assert.equal(gain.value,'22');assert.equal(gain.disabled,false);
  assert(!modal.textContent.includes('Trim sorgente'));assert(f.button('Parametri WING ↗',modal));
  gain.value='22.5';gain.dispatchEvent(new f.w.Event('change'));assert.equal(f.state.desk.sources['LCL:1'].gain,22.5);
  f.dom.window.close();
});
test('failed hydration leaves a clear error and native parameter route',async()=>{
  const f=fixture();f.w.SculptIO.sourceEditor('LCL:1');f.pending.shift().reject(new Error('Connessione interrotta'));await settle();
  const body=f.w.document.querySelector('.desk-modal-body');assert.match(body.textContent,/Connessione interrotta/);assert.equal(body.querySelector('input'),null);
  f.button('Parametri WING ↗',body).click();assert.deepEqual(f.explorer,['/io/in/LCL/1']);f.dom.window.close();
});
test('offline routing remains immediately editable without native reads',()=>{
  const f=fixture(false);f.w.SculptUI.open('io');assert(f.w.document.querySelector('.io-page-body table'));assert.equal(f.pending.length,0);
  assert(f.button('Importa patch'));f.w.SculptIO.sourceEditor('LCL:1');assert(f.w.document.querySelector('[aria-label="Trim sorgente"]'));f.dom.window.close();
});
