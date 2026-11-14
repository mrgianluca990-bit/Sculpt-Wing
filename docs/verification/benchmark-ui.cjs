'use strict';
// Reproducible CPU/DOM comparison, not a browser paint, network or Mac benchmark.
// From the 0.6.7 repository: NODE_PATH="$PWD/native/node_modules" node --expose-gc docs/verification/benchmark-ui.cjs /path/to/0.6.6 "$PWD"
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {JSDOM}=require('jsdom');
const roots={'066':path.resolve(process.argv[2]||path.join(__dirname,'..','..','..','sculpt-wing-066')),'067':path.resolve(process.argv[3]||path.join(__dirname,'..','..'))},count=120,repeats=3;
const common=['plugin-data.js','plugin-panels.js',...['layouts','dynamics','eq','fx','channel','native','dynamics-extra','filters'].map(p=>`plugin-original-${p}.js`),'model.js','app.js','desk.js','shell.js','plugins.js','editor.js','io.js','systems.js','wing-map.js','dca-bank.js','row-layout.js','strip-pins.js'];
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const snapshots=['066','067'].map(version=>{
  const directory=path.join(roots[version],'dist'),files=[...common];
  if(version==='067'){files.splice(files.indexOf('app.js'),0,'history.js');files.splice(files.indexOf('systems.js'),0,'osc.js');}
  const html=fs.readFileSync(path.join(directory,'index.html'),'utf8'),sources=Object.fromEntries(files.map(file=>[file,fs.readFileSync(path.join(directory,file),'utf8')]));
  return {version,directory,files,html,sources,sha256:Object.fromEntries(Object.entries(sources).map(([file,text])=>[file,hash(text)]))};
});
function fixture(snapshot){
  const dom=new JSDOM(snapshot.html,{url:'https://sculpt-benchmark.test',runScripts:'outside-only',pretendToBeVisual:true,storageQuota:50_000_000}),w=dom.window;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.ResizeObserver=class{observe(){}disconnect(){}};
  w.IntersectionObserver=class{observe(){}disconnect(){}};
  // Exclude asynchronous meter animation and layout frames in both versions.
  w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};
  w.HTMLElement.prototype.scrollTo=function({left=0}){this.scrollLeft=left;};
  w.HTMLElement.prototype.scrollBy=function({left=0}){this.scrollLeft+=left;};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLElement.prototype.setPointerCapture=function(){};
  w.HTMLElement.prototype.hasPointerCapture=()=>false;
  w.HTMLElement.prototype.releasePointerCapture=function(){};
  w.HTMLDialogElement.prototype.show=function(){this.open=true;};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  let writes=[];
  const setItem=w.Storage.prototype.setItem;
  w.Storage.prototype.setItem=function(key,value){writes.push({key:String(key),bytes:Buffer.byteLength(String(value),'utf8')});return setItem.call(this,key,value);};
  for(const file of snapshot.files)vm.runInContext(snapshot.sources[file],dom.getInternalVMContext(),{filename:`${snapshot.version}/${file}`});
  const C=w.SculptController,D=w.SculptDesk,E=w.SculptEditor,ctx={type:'strip',id:'ch-1',kind:'CH',block:'eq'};
  D.setModel(ctx,'STD');
  E.openSection('ch-1','eq');
  const def=w.SculptCatalog.get(ctx,D.processor(ctx).model),parameter=def.parameters.find(p=>p.type==='number'&&p.unit==='dB'&&p.key==='1g')||def.parameters.find(p=>p.type==='number'&&p.unit==='dB'&&/gain/i.test(p.label));
  if(!parameter)throw new Error('WING EQ gain parameter unavailable');
  const editor=w.document.querySelector('.editor-dialog[open]');
  if(!editor||editor.querySelector('[data-tab="eq"]')?.getAttribute('aria-selected')!=='true')throw new Error('EQ editor is not open');
  return {w,dom,C,D,E,ctx,parameter,resetWrites:()=>{writes=[];},getWrites:()=>writes};
}
function measure(snapshot,scenario,run){
  global.gc?.();
  const f=fixture(snapshot),{w,C,D,ctx,parameter}=f;
  const operation=scenario==='eq_gain'?value=>D.setParam(ctx,parameter.key,value):value=>C.updateStrip('ch-1',{level:value});
  const start=scenario==='eq_gain'?-6:-30,initial=scenario==='eq_gain'?0:-10;
  for(let i=0;i<8;i++)operation(initial+i*.1);
  operation(initial);C.endGesture?.();C.clearHistory?.();C.flushSave?.();f.resetWrites();
  const observer=new w.MutationObserver(()=>{});observer.observe(w.document.querySelector('.console'),{attributes:true,childList:true,characterData:true,subtree:true});
  const started=performance.now();
  C.beginGesture?.(scenario==='eq_gain'?'Gain EQ':'Fader CH 1');
  for(let i=0;i<count;i++)if(operation(Math.round((start+i*.1)*10)/10)===false)throw new Error('Operation rejected');
  C.endGesture?.();C.flushSave?.();
  const elapsedMs=performance.now()-started;
  const records=observer.takeRecords();observer.disconnect();
  let affected=0,unrelated=0;const unrelatedIds=new Set();
  for(const record of records){
    const element=record.target.nodeType===1?record.target:record.target.parentElement,node=element?.closest?.('.strip[data-id]');
    if(!node)continue;
    if(node.dataset.id==='ch-1')affected++;else{unrelated++;unrelatedIds.add(node.dataset.id);}
  }
  const writes=f.getWrites(),byKey={};for(const {key,bytes}of writes){const metric=byKey[key]||(byKey[key]={writes:0,utf8Bytes:0});metric.writes++;metric.utf8Bytes+=bytes;}
  const finalValue=scenario==='eq_gain'?D.processor(ctx).params[parameter.key]:C.getStrip('ch-1').level;
  if(finalValue!==Math.round((start+(count-1)*.1)*10)/10)throw new Error('Final state does not match the final command');
  const result={version:snapshot.version,scenario,run,operations:count,elapsedMs:+elapsedMs.toFixed(3),meanOperationMs:+(elapsedMs/count).toFixed(3),storageWrites:writes.length,storageUtf8Bytes:writes.reduce((sum,item)=>sum+item.bytes,0),storageByKey:byKey,domMutationRecords:records.length,affectedStripMutationRecords:affected,unrelatedStripMutationRecords:unrelated,unrelatedStripCount:unrelatedIds.size,history:C.historyState?.()||null,eqParameter:{model:'STD',key:parameter.key,label:parameter.label},finalValue};
  f.E.close();f.dom.window.close();return result;
}
const samples=[];
for(let run=1;run<=repeats;run++)for(const snapshot of run%2?snapshots:[...snapshots].reverse())for(const scenario of ['eq_gain','channel_fader']){
  const result=measure(snapshot,scenario,run);samples.push(result);
  process.stdout.write(`${snapshot.version} ${scenario} run ${run}: ${result.elapsedMs} ms; ${result.storageWrites} writes; ${result.unrelatedStripMutationRecords} unrelated strip mutations\n`);
}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const summary=[];
for(const snapshot of snapshots)for(const scenario of ['eq_gain','channel_fader']){
  const rows=samples.filter(s=>s.version===snapshot.version&&s.scenario===scenario),metric={version:snapshot.version,scenario,operations:count,runs:repeats};
  for(const key of ['elapsedMs','meanOperationMs','storageWrites','storageUtf8Bytes','domMutationRecords','affectedStripMutationRecords','unrelatedStripMutationRecords','unrelatedStripCount'])metric['median'+key[0].toUpperCase()+key.slice(1)]=median(rows.map(row=>row[key]));
  summary.push(metric);
}
const changedFiles=[];
for(const snapshot of snapshots)for(const file of snapshot.files)if(hash(fs.readFileSync(path.join(snapshot.directory,file),'utf8'))!==snapshot.sha256[file])changedFiles.push(`${snapshot.version}/${file}`);
const result={createdAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,kernel:os.release(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,jsdom:require('jsdom/package.json').version},method:{operationsPerSample:count,runsPerVersionAndScenario:repeats,editor:'CH 1 / WING EQ STD open in both scenarios',scenarios:{eq_gain:'120 successive updates of one EQ gain, -6.0 through +5.9 dB',channel_fader:'120 updateStrip calls on CH 1, -30.0 through -18.1 dB'},timed:'Synchronous command processing, history grouping where supported, DOM mutations and final persistence flush; module load, initial editor opening, warmup and mutation record classification excluded',storage:'All Storage.setItem calls during the measured gesture including the final flush; real JSDOM Storage, no no-op writer',mutationObservation:'All attributes/text/child-list records in .console; unrelated strips exclude CH 1; observer allocation overhead remains included in timings',excluded:'Browser painting, CSS layout, RAF meter frames, UDP/TCP, hardware, native macOS/Electron scheduling; this is not FPS or an audio-latency measurement',sourceSnapshot:'Source files read once before any sample; hashes retained for reproducibility; changedFilesDuringRun detects later edits'},sourceFiles:snapshots.map(({version,directory,sha256})=>({version,directory,sha256})),changedFilesDuringRun:changedFiles,summary,samples};
fs.writeFileSync(path.join(__dirname,'benchmark-ui-results.json'),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({summary,changedFilesDuringRun:changedFiles},null,2)+'\n');
