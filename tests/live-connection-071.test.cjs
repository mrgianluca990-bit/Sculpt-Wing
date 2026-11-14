'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('../native/node_modules/jsdom');
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await pause();}throw new Error('Connection UI did not settle');}

function fixture(t){
  const dom=new JSDOM('<!doctype html><body><div class="macro-rail"><button id="offline-button"></button></div></body>',{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window;
  const state={values:{'ch-1':{id:'ch-1',level:-2}},desk:{macros:[]}},handlers={value:new Set(),status:new Set(),meters:new Set()},pages=new Map(),messages=[];
  const driver={calls:[],writes:[],connectGate:null,readGate:null,
    onValue:fn=>{handlers.value.add(fn);return()=>handlers.value.delete(fn);},
    onStatus:fn=>{handlers.status.add(fn);return()=>handlers.status.delete(fn);},
    onStripMeters:fn=>{handlers.meters.add(fn);return()=>handlers.meters.delete(fn);},
    emit(kind,...args){for(const fn of handlers[kind])fn(...args);},
    async connect(host){this.calls.push(host);if(this.connectGate)await this.connectGate;return{name:'WING fixture',model:'WING',firmware:'fixture',host};},
    async disconnect(){this.emit('status','disconnected','Disconnesso.');},
    async describe(path){return {path,type:path==='/ch/1'?0:3,revision:1};},
    async list(){return[{path:'/ch/1/fdr',type:3,revision:1}];},
    async readTree(){if(this.readGate)await this.readGate;return{'/ch/1/fdr':-9};},
    async subscribeStripMeters(){},async get(){return -9;},async set(path,value){this.writes.push({path,value});}
  };
  const el=(tag,cls='',text='')=>{const node=w.document.createElement(tag);node.className=cls;node.textContent=text;return node;};
  const button=(label,click,cls='')=>{const node=el('button','desk-button '+cls,label);node.type='button';if(click)node.addEventListener('click',click);return node;};
  const workspace=el('dialog','workspace'),body=el('div');workspace.append(body);w.document.body.append(workspace);
  let cleanup;
  const U=w.SculptUI={el,button,toast:value=>messages.push(value),field:(label,input)=>{const node=el('label','',label);node.append(input);return node;},card:(label,...nodes)=>{const card=el('div','',label);card.append(...nodes);return card;},download(){},
    register:(id,page)=>pages.set(id,page),open(id){cleanup?.();body.replaceChildren();cleanup=pages.get(id)?.render(body);workspace.setAttribute('open','');},close(){workspace.removeAttribute('open');}
  };
  w.SculptController={getState:()=>state,capture:()=>JSON.parse(JSON.stringify(state)),transact:fn=>fn(state),subscribe:()=>()=>{},clearHistory(){},refresh(){},restore(){}};
  w.SculptDesk={get:()=>state.desk};w.SculptWingMap={stripPath:()=>'/ch/1',apply:(s,p,v)=>{if(p==='/ch/1/fdr')s.values['ch-1'].level=v;},readPaths:()=>[]};
  w.SculptNative={available:true,platform:'macos',driver};
  for(const file of ['live-session.js','live.js'])vm.runInContext(fs.readFileSync(require.resolve('../dist/'+file),'utf8'),dom.getInternalVMContext(),{filename:file});
  t.after(()=>{cleanup?.();driver.emit('status','disconnected');dom.window.close();});
  return{w,driver,U,workspace,state,messages,notice:()=>w.document.getElementById('wing-connection-loss'),
    async connect(){U.open('connection');w.document.querySelector('.live-ip').value='192.168.1.66';w.document.querySelector('.live-connect-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>w.SculptLive.isConnected());}
  };
}

test('loss notice stays clickable over dialogs, retries once per click and closes only after sync',async t=>{
  const f=fixture(t);await f.connect();assert.equal(f.w.SculptLive.isWritable(),true);assert.equal(f.driver.writes.length,0);
  f.driver.emit('status','error','Lettura dati /$ctl/lib scaduta fixture');
  assert.equal(f.notice().hidden,false);assert.match(f.notice().textContent,/\$ctl\/lib/);assert.equal(f.notice().parentElement,f.workspace);
  const another=f.w.document.createElement('dialog');another.open=true;f.w.document.body.append(another);await pause();
  assert.equal(f.notice().parentElement,another,'the notice must be in the active modal, not inert beneath it');
  f.workspace.open=false;await pause();f.workspace.open=true;await pause();
  assert.equal(f.notice().parentElement,f.workspace,'reopening an earlier DOM dialog must bring the notice to the new top modal');
  const identity=deferred(),read=deferred();f.driver.connectGate=identity.promise;f.driver.readGate=read.promise;
  const retry=f.notice().querySelector('.live-reconnect');retry.click();retry.click();
  assert.deepEqual(f.driver.calls,['192.168.1.66','192.168.1.66']);assert.equal(retry.disabled,true);assert.equal(f.w.SculptLive.isWritable(),false);
  identity.resolve();await until(()=>f.w.SculptLive.snapshot().mode==='syncing');
  assert.equal(f.notice().hidden,false);assert.equal(f.notice().querySelector('progress').hidden,false);assert.equal(f.w.SculptLive.isWritable(),false);
  read.resolve();await until(()=>f.w.SculptLive.isConnected());
  assert.equal(f.notice().hidden,true);assert.equal(f.w.SculptLive.isWritable(),true);assert.equal(f.driver.writes.length,0);
});

test('failed retry keeps a persistent reason, while a requested disconnect does not show a loss alert',async t=>{
  const f=fixture(t);await f.connect();
  const disconnect=[...f.w.document.querySelectorAll('button')].find(node=>node.textContent==='Disconnetti');disconnect.click();await pause();
  assert.equal(f.notice().hidden,true);await f.connect();
  f.driver.emit('status','disconnected','Banco non raggiungibile');
  const failing=deferred();f.driver.connectGate=failing.promise;f.notice().querySelector('.live-reconnect').click();failing.reject(new Error('TCP non disponibile fixture'));
  await until(()=>f.w.SculptLive.snapshot().mode==='error');
  assert.equal(f.notice().hidden,false);assert.match(f.notice().textContent,/TCP non disponibile fixture/);assert.equal(f.notice().querySelector('.live-reconnect').disabled,false);
  await pause();assert.equal(f.driver.calls.length,3,'failure must not start another automatic retry');
});
