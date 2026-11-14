'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(require.resolve('../dist/local-scenes.js'),'utf8');
const copy=value=>value===undefined?value:JSON.parse(JSON.stringify(value));
// Small asynchronous IndexedDB test double. Transactions stage their writes
// and commit both stores together; failures roll back the complete transaction.
function indexedDB(){
  const databases=new Map(),api={failWrites:false};
  api.open=name=>{const request={};queueMicrotask(()=>{
    const upgrade=!databases.has(name);if(upgrade)databases.set(name,new Map());const stores=databases.get(name);
    const db={close(){},createObjectStore(name){stores.set(name,new Map());},transaction(names,mode){
      const selected=typeof names==='string'?[names]:names,staged=new Map(selected.map(key=>[key,new Map(stores.get(key))]));
      const tx={error:null},queue=[];let failed=false;
      tx.objectStore=name=>({
        get:key=>operation(()=>copy(staged.get(name).get(key))),
        getAll:()=>operation(()=>[...staged.get(name).values()].map(copy)),
        put:value=>operation(()=>{if(api.failWrites){const e=new Error('Quota');e.name='QuotaExceededError';throw e;}staged.get(name).set(value.id,copy(value));return value.id;}),
        delete:key=>operation(()=>staged.get(name).delete(key))
      });
      function operation(fn){const r={};queue.push(()=>{if(failed)return;try{r.result=fn();r.onsuccess?.();}catch(error){failed=true;tx.error=error;r.error=error;r.onerror?.();tx.onerror?.();tx.onabort?.();}});return r;}
      setImmediate(()=>{for(const run of queue)run();if(!failed){if(mode==='readwrite')for(const name of selected)stores.set(name,staged.get(name));tx.oncomplete?.();}});
      return tx;
    }};request.result=db;if(upgrade)request.onupgradeneeded?.();request.onsuccess?.();
  });return request;};return api;
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function flush(){for(let i=0;i<20;i++)await tick();}
function scene(name='Locale'){
  const now=new Date().toISOString();return {format:'sculpt-wing-scene',version:1,id:'fixture',name,createdAt:now,source:{kind:'wing-read',console:{name:'WING palco',model:'ngc',firmware:'3.1.2'},startedAt:now,completedAt:now},scopes:['ch'],entries:[{path:'/ch/1/fdr',value:-8,schema:{type:3,unit:1}},{path:'/ch/1/mute',value:1,schema:{type:4,unit:0,min:0,max:1}}]};
}
function setup(factory=indexedDB(),online=false){
  const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window,d=w.document;
  w.TextEncoder=TextEncoder;Object.defineProperty(w,'indexedDB',{value:factory});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const el=(tag,cls,text)=>{const n=d.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const button=(text,fn,cls)=>{const n=el('button',cls,text);n.type='button';if(fn)n.addEventListener('click',fn);return n;};
  const wrap=(tag,cls,...children)=>{const n=el(tag,cls);n.append(...children);return n;};
  const downloads=[];
  w.SculptUI={el,button,card:(title,...children)=>wrap('section','desk-card',el('h3','',title),...children),grid:(...children)=>wrap('div','desk-grid',...children),field:(label,input)=>wrap('label','desk-field',el('span','',label),input),tabs:(tabs,selected,fn)=>wrap('nav','',...tabs.map(tab=>button(tab.label,()=>fn(tab.id)))),modal:(title,content)=>{const dialog=wrap('dialog','',el('h2','',title),content);d.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());return {dialog,close:()=>dialog.close()};},download:(...args)=>downloads.push(args),open(){},toast(){}};
  const definitions=new Map([['/ch',{path:'/ch',type:0,readOnly:true,unit:0,revision:0}],['/ch/1',{path:'/ch/1',type:0,readOnly:true,unit:0,revision:0}],['/ch/1/fdr',{path:'/ch/1/fdr',type:3,unit:1,readOnly:false,revision:0}],['/ch/1/mute',{path:'/ch/1/mute',type:4,unit:0,min:0,max:1,readOnly:false,revision:0}]]),bank=new Map([['/ch/1/fdr',-1],['/ch/1/mute',1]]),cache=new Map(),metadata=new Map(),listeners=new Set(),writes=[];
  let held=false,release=null;
  w.SculptLive={isLive:()=>true,isConnected:()=>online,isWritable:()=>online,sessionToken:()=>1,snapshot:()=>({info:{name:'WING palco',model:'ngc',firmware:'3.1.2'}}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},settled:async()=>{},metadata:path=>metadata.get(path),hasValue:path=>cache.has(path),value:path=>cache.get(path),describeNode:async path=>{const def=definitions.get(path);if(!def)throw new Error('Missing '+path);metadata.set(path,def);return def;},listNode:async path=>{const defs=[...definitions.values()].filter(def=>def.path.startsWith(path+'/')&&!def.path.slice(path.length+1).includes('/'));for(const def of defs)metadata.set(def.path,def);return defs;},readValues:async(path,{depth=0}={})=>{if(held)await new Promise(resolve=>{release=resolve;});const result={};for(const [key,value]of bank){if(key===path||key.startsWith(path+'/')&&key.slice(path.length+1).split('/').length<=depth+1){result[key]=value;cache.set(key,value);}}return result;},write:async(path,value)=>{writes.push([path,value]);bank.set(path,value);cache.set(path,value);}};
  w.eval(source);const api=w.SculptLocalScenes,pages=[],container=el('div');d.body.append(container);
  return {w,d,api,bank,writes,downloads,listeners,factory,container,render(){const page=api.render(container);pages.push(page);return page;},button(text){const found=[...d.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(found,'Button '+text);return found;},hold(){held=true;},release(){held=false;release?.();},close(){for(const page of pages)page.cleanup();dom.window.close();},online(value){online=value;for(const fn of listeners)fn();}};
}

test('IndexedDB library commits scene and summary atomically, survives reopening, and never uses localStorage',async()=>{
  const env=setup();try{
    const store=new env.api.SceneStore();env.factory.failWrites=true;
    await assert.rejects(store.put(scene()),/Spazio locale insufficiente/);assert.equal((await store.list()).length,0);
    env.factory.failWrites=false;await store.put(scene());await store.close();
    const reopened=new env.api.SceneStore();assert.equal((await reopened.list()).length,1);assert.equal((await reopened.get('fixture')).entries[0].value,-8);
    await reopened.remove('fixture');assert.equal((await reopened.list()).length,0);assert.equal(await reopened.get('fixture'),null);await reopened.close();
    assert.equal(env.w.localStorage.length,0);
  }finally{env.close();}
});

test('offline UI lists, renames, exports and imports real scenes, without modifying the console',async()=>{
  const env=setup();try{
    const store=new env.api.SceneStore();await store.put(scene());env.render();await flush();
    assert.match(env.container.textContent,/SCENE LOCALI · 1/);assert.equal(env.button('Prepara richiamo sulla WING').disabled,true);assert.equal(env.button('Salva WING in locale').disabled,true);
    const name=env.d.querySelector('[aria-label="Nome scena salvata"]');name.value='Rinominata';env.button('Rinomina').click();await flush();assert.equal((await store.get('fixture')).name,'Rinominata');
    env.button('Esporta JSON').click();const exported=JSON.parse(env.downloads[0][1]);assert.equal(exported.format,'sculpt-wing-scene');assert.equal(exported.entries.length,2);
    exported.name='Importata';const input=env.d.querySelector('[aria-label="Importa scena WING locale"]'),text=JSON.stringify(exported);
    Object.defineProperty(input,'files',{value:[{size:text.length,text:async()=>text}]});input.dispatchEvent(new env.w.Event('change'));await flush();
    const index=await store.list();assert.equal(index.length,2);assert.ok(index.some(s=>s.name==='Importata'&&s.id!=='fixture'));assert.match(env.container.textContent,/banco non è stato modificato/);assert.deepEqual(env.writes,[]);
    await store.close();
  }finally{env.close();}
});

test('capture UI enables cancel while awaiting the console and does not save cancelled work',async()=>{
  const env=setup(undefined,true);try{
    env.render();await flush();
    const section=[...env.d.querySelectorAll('section')].find(n=>n.querySelector('h3')?.textContent==='ACQUISISCI IL BANCO');
    for(const input of section.querySelectorAll('input[type=checkbox]')){input.checked=input.parentElement.textContent==='Canali CH';input.dispatchEvent(new env.w.Event('change'));}
    env.hold();env.button('Salva WING in locale').click();await flush();assert.equal(env.button('Interrompi').disabled,false);
    env.button('Interrompi').click();env.release();await flush();assert.match(env.container.querySelector('[role=status]').textContent,/Operazione annullata/);
    const store=new env.api.SceneStore();assert.equal((await store.list()).length,0);
    env.button('Salva WING in locale').click();await flush();assert.equal((await store.list()).length,1);assert.match(env.container.querySelector('[role=status]').textContent,/Salvata/);assert.deepEqual(env.writes,[]);await store.close();
  }finally{env.close();}
});

test('review modal sends nothing before confirmation and ignores duplicate confirm events',async()=>{
  const env=setup(undefined,true);try{
    const store=new env.api.SceneStore();await store.put(scene());env.render();await flush();
    env.button('Prepara richiamo sulla WING').click();await flush();assert.ok(env.d.querySelector('dialog'));assert.deepEqual(env.writes,[]);
    const confirm=env.button('Conferma richiamo');confirm.dispatchEvent(new env.w.Event('click'));confirm.dispatchEvent(new env.w.Event('click'));await flush();
    assert.deepEqual(env.writes,[['/ch/1/fdr',-8]]);assert.match(env.d.querySelector('dialog [role=status]').textContent,/Richiamo completato/);assert.equal(env.button('Chiudi').disabled,false);
    env.button('Chiudi').click();await flush();assert.equal(env.d.querySelector('dialog'),null);assert.match(env.container.textContent,/ULTIMO RICHIAMO/);
    env.online(false);assert.equal(env.button('Prepara richiamo sulla WING').disabled,true);assert.equal(env.button('Esporta JSON').disabled,false);
    await store.close();
  }finally{env.close();assert.equal(env.listeners.size,0);}
});

test('closing the review cancels it with zero writes and removes its live subscription on page cleanup',async()=>{
  const env=setup(undefined,true);try{
    const store=new env.api.SceneStore();await store.put(scene());const page=env.render();await flush();env.button('Prepara richiamo sulla WING').click();await flush();
    env.button('Annulla').click();await flush();assert.deepEqual(env.writes,[]);assert.equal(env.d.querySelector('dialog'),null);assert.match(env.container.querySelector('[role=status]').textContent,/nessun parametro inviato/);
    page.cleanup();assert.equal(env.listeners.size,0);await store.close();
  }finally{env.close();}
});
