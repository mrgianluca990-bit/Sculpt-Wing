'use strict';
// Development-only, instrumented Node/JSDOM benchmark. No production files are changed.
// NODE_PATH=../sculpt-wing-068/native/node_modules node --expose-gc benchmark-ui.cjs --versions=067 --runs=3 --output=baseline-067
// Add --profile=strip_switch_eq for a separate, untimed-comparison CPU-profile pass.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),crypto=require('node:crypto'),inspector=require('node:inspector');
const {performance}=require('node:perf_hooks');
const {spawnSync}=require('node:child_process');
const {JSDOM,VirtualConsole}=require('jsdom');
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,...value]=arg.replace(/^--/,'').split('=');return [key,value.join('=')||true];}));
const root=path.resolve(__dirname,'..'),versions=String(args.versions||'067').split(','),repeats=Number(args.runs||3),output=String(args.output||'benchmark-ui');
const scenarios=String(args.scenarios||'strip_switch_eq,open_section_eq,macro_open_eq,eq_gain,channel_fader').split(',');
const navCount=40,gestureCount=120;
const modules=['plugin-data.js','plugin-panels.js',...['layouts','dynamics','eq','fx','channel','native','dynamics-extra','filters'].map(p=>`plugin-original-${p}.js`),'model.js','history.js','app.js','desk.js','shell.js','plugins.js','editor.js','io.js','osc.js','systems.js','wing-map.js','dca-bank.js','row-layout.js','strip-pins.js'];
const probes={
  'plugin-data.js':[['list','catalog.list'],['get','catalog.get'],['defaults','catalog.defaults']],
  'app.js':[['emit','controller.emit'],['updateMode','controller.updateMode'],['updateStrip','controller.renderStrip']],
  'desk.js':[['defaults','desk.defaults'],['normalize','desk.normalize'],['normalizeMacros','desk.normalizeMacros'],['proc','desk.proc'],['processor','desk.processor'],['persistMacroProfile','desk.persistMacroProfile']],
  'editor.js':[['renderPanel','editor.renderPanel'],['renderProcessor','editor.renderProcessor'],['renderChannel','editor.renderChannel'],['sync','editor.sync'],['dockEditor','editor.dockEditor'],['open','editor.open'],['openSection','editor.openSection']],
  'plugins.js':[['renderProcessor','plugins.renderProcessor'],['build','plugins.build'],['makePlot','plugins.makePlot'],['normalize','plugins.normalize']],
  'shell.js':[['render','shell.render'],['updateMacros','shell.updateMacros']]
};
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const quantile=(values,q)=>{const ordered=[...values].sort((a,b)=>a-b);return ordered[Math.min(ordered.length-1,Math.max(0,Math.ceil(q*ordered.length)-1))]||0;};
const rounded=value=>Number(value.toFixed(3));
const snapshots=args.worker?JSON.parse(fs.readFileSync(0,'utf8')):versions.map(version=>{
  const directory=path.join(root,`sculpt-wing-${version}`,'dist'),files=[...modules],html=fs.readFileSync(path.join(directory,'index.html'),'utf8');
  if(fs.existsSync(path.join(directory,'rta.js')))files.splice(files.indexOf('plugins.js'),0,'rta.js');
  const sources=Object.fromEntries(files.map(file=>[file,fs.readFileSync(path.join(directory,file),'utf8')])),missingProbes=[];
  const instrumented=Object.fromEntries(Object.entries(sources).map(([file,source])=>{
    for(const [name,key]of probes[file]||[]){
      const pattern=new RegExp('(function\\s+'+name+'\\s*\\([^)]*\\)\\s*\\{)');
      if(!pattern.test(source)){missingProbes.push(key);continue;}
      source=source.replace(pattern,match=>match+`globalThis.__SculptBench.hit(${JSON.stringify(key)});`);
    }
    return [file,source];
  }));
  return {version,directory,files,html,sources,instrumented,missingProbes,sha256:{'index.html':hash(html),...Object.fromEntries(Object.entries(sources).map(([file,text])=>[file,hash(text)]))}};
});
function fixture(snapshot){
  const jsdomErrors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>jsdomErrors.push(String(error.stack||error)));
  const dom=new JSDOM(snapshot.html,{url:'https://sculpt-benchmark.test',runScripts:'outside-only',pretendToBeVisual:true,storageQuota:50_000_000,virtualConsole}),w=dom.window;
  let active=false,counters={},subscriberCalls={},writes=[],records=[],frames=new Map(),rafId=0;
  const hit=(key,amount=1)=>{if(active)counters[key]=(counters[key]||0)+amount;};
  w.__SculptBench={hit};
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.ResizeObserver=class{observe(){}disconnect(){}};w.IntersectionObserver=class{observe(){}disconnect(){}};
  // Meter animation is not UI navigation. Other queued UI frames are explicitly drained.
  w.requestAnimationFrame=callback=>{const id=++rafId;if(callback.name!=='animateMeters')frames.set(id,callback);return id;};
  w.cancelAnimationFrame=id=>frames.delete(id);
  w.HTMLElement.prototype.scrollTo=function({left=0}){this.scrollLeft=left;};
  w.HTMLElement.prototype.scrollBy=function({left=0}){this.scrollLeft+=left;};
  w.HTMLElement.prototype.scrollIntoView=function(){};w.Element.prototype.setPointerCapture=function(){};
  w.Element.prototype.hasPointerCapture=()=>false;w.Element.prototype.releasePointerCapture=function(){};
  w.HTMLDialogElement.prototype.show=function(){this.open=true;};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const setItem=w.Storage.prototype.setItem;
  w.Storage.prototype.setItem=function(key,value){if(active)writes.push({key:String(key),bytes:Buffer.byteLength(String(value),'utf8')});return setItem.call(this,key,value);};
  const stringify=w.JSON.stringify;
  w.JSON.stringify=function(...args){const value=stringify.apply(this,args);hit('json.stringify');if(typeof value==='string')hit('json.stringifiedChars',value.length);return value;};
  for(const method of ['createElement','createElementNS']){const original=w.Document.prototype[method];w.Document.prototype[method]=function(...args){hit('dom.'+method);return original.apply(this,args);};}
  const replaceChildren=w.Element.prototype.replaceChildren;
  w.Element.prototype.replaceChildren=function(...args){
    if(active&&this.classList.contains('editor-panel'))hit('dom.editorPanelReplace');
    if(active&&this.classList.contains('editor-plugin-host'))hit('dom.processorHostReplace');
    return replaceChildren.apply(this,args);
  };
  for(const file of snapshot.files){
    vm.runInContext(snapshot.instrumented[file],dom.getInternalVMContext(),{filename:`${snapshot.version}/${file}`});
    if(file==='app.js'){
      const controller=w.SculptController,subscribe=controller.subscribe;
      // A facade preserves the real methods/closures; no frozen production API is mutated.
      w.SculptController={...controller,subscribe(fn,...options){
        const caller=new Error().stack.split('\n').find(line=>line.includes(snapshot.version+'/'))?.trim().replaceAll(snapshot.version+'/','')||'unknown';
        const key=`${fn.name||'anonymous'} @ ${caller}`;
        return subscribe(function countedSubscriber(...args){if(active){hit('subscriber.callbacks');subscriberCalls[key]=(subscriberCalls[key]||0)+1;}return fn.apply(this,args);},...options);
      }};
    }
  }
  const C=w.SculptController,D=w.SculptDesk,E=w.SculptEditor,ctx={type:'strip',id:'ch-1',kind:'CH',block:'eq'};
  const settle=async()=>{await Promise.resolve();for(let i=0;frames.size;i++){if(i>=20)throw new Error('UI RAF queue did not settle');const batch=[...frames.values()];frames.clear();for(const cb of batch)cb(performance.now());await Promise.resolve();}};
  const observer=new w.MutationObserver(batch=>{if(active)records.push(...batch);});
  let eqTab=null;
  const selectedEq=()=>{if(!eqTab?.isConnected)eqTab=w.document.getElementById('editor-tab-eq');return eqTab?.getAttribute('aria-selected')==='true';};
  // Real user clicks already have a hit-tested target; don't time benchmark-only selectors.
  const stripLabels=new Map(Array.from({length:8},(_,i)=>[`ch-${i+1}`,w.document.querySelector(`.strip[data-id="ch-${i+1}"] .strip-label`)]));
  D.change(d=>{for(let i=0;i<8;i++){const macro=d.macros.find(m=>m.id===i+9);macro.name=`CH ${i+1} EQ`;macro.actions=[{type:'editor',target:`ch-${i+1}`,tab:'eq'}];}},'macros');
  return {w,dom,C,D,E,ctx,hit,settle,selectedEq,stripLabels,jsdomErrors,
    start(){counters={};subscriberCalls={};writes=[];records=[];observer.observe(w.document.querySelector('.console'),{attributes:true,childList:true,characterData:true,subtree:true});active=true;},
    stop(){records.push(...observer.takeRecords());active=false;observer.disconnect();return {counters,subscriberCalls,writes,records};},
    close(){active=false;observer.disconnect();E.close();dom.window.close();}
  };
}
async function profilerStart(){const session=new inspector.Session();session.connect();const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');return async()=>{const {profile}=await post('Profiler.stop');session.disconnect();return profile;};}
function profileSummary(profile){
  const nodes=new Map(profile.nodes.map(node=>[node.id,node])),parents=new Map();for(const node of profile.nodes)for(const child of node.children||[])parents.set(child,node.id);
  const self=new Map(),inclusive=new Map();let sampledUs=0;
  (profile.samples||[]).forEach((id,i)=>{const us=profile.timeDeltas?.[i]||1000;sampledUs+=us;self.set(id,(self.get(id)||0)+us);const seen=new Set();for(let at=id;at&&!seen.has(at);at=parents.get(at)){seen.add(at);inclusive.set(at,(inclusive.get(at)||0)+us);}});
  const aggregate=new Map();
  for(const [id,node]of nodes){const frame=node.callFrame,key=`${frame.url}:${frame.lineNumber+1}:${frame.functionName||'(anonymous)'}`,row=aggregate.get(key)||{function:frame.functionName||'(anonymous)',file:frame.url,line:frame.lineNumber+1,selfMs:0,inclusiveMs:0};row.selfMs+=(self.get(id)||0)/1000;row.inclusiveMs+=(inclusive.get(id)||0)/1000;aggregate.set(key,row);}
  const rows=[...aggregate.values()].map(row=>({...row,selfMs:rounded(row.selfMs),inclusiveMs:rounded(row.inclusiveMs),selfPct:rounded(row.selfMs/(sampledUs/1000)*100)}));
  return {sampledMs:rounded(sampledUs/1000),samples:profile.samples?.length||0,topSelf:rows.sort((a,b)=>b.selfMs-a.selfMs).slice(0,35),topAppInclusive:rows.filter(row=>/^0\d\d\//.test(row.file)).sort((a,b)=>b.inclusiveMs-a.inclusiveMs).slice(0,35)};
}
async function measure(snapshot,scenario,run,profiled=false){
  global.gc?.();const f=fixture(snapshot),{w,C,D,E,ctx}=f,latencies=[],clickLatencies=[],eqReopenLatencies=[];
  const navigation=['strip_switch_eq','open_section_eq','macro_open_eq'].includes(scenario),count=navigation?navCount:gestureCount;
  const pointDrag=scenario==='eq_point_drag';let selected='ch-1',lastValue,point,svg;
  const dragStartX=36+Math.log(300/20)/Math.log(1000)*584,dragStartY=106;
  const pointer=(type,x,y)=>{const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:type==='pointerup'?0:1,clientX:28+x*1.25,clientY:90+y*1.25});Object.defineProperties(event,{pointerId:{value:7},pointerType:{value:'mouse'},isPrimary:{value:true}});point.dispatchEvent(event);};
  E.openSection('ch-1','eq');await f.settle();
  const fixtureFeatures={rtaModule:typeof w.SculptRTA?.mount==='function',rtaMounted:!!w.document.querySelector('.editor-dialog .sculpt-rta')};
  if(snapshot.files.includes('rta.js')&&(!fixtureFeatures.rtaModule||!fixtureFeatures.rtaMounted))throw new Error('RTA module or actual EQ component missing from benchmark fixture');
  if(pointDrag){
    point=w.document.querySelector('.editor-dialog .fx-eq-point[data-band="1"]');svg=point?.ownerSVGElement;if(!point||!svg)throw new Error('EQ B1 drag point missing');
    svg.getBoundingClientRect=()=>({left:28,top:90,right:828,bottom:327.5,x:28,y:90,width:800,height:237.5,toJSON(){return this;}});
    svg.getScreenCTM=()=>({a:1.25,b:0,c:0,d:1.25,e:28,f:90,inverse:()=>({a:.8,b:0,c:0,d:.8,e:-22.4,f:-72})});
    svg.createSVGPoint=()=>({x:0,y:0,matrixTransform(matrix){return {x:matrix.a*this.x+matrix.c*this.y+matrix.e,y:matrix.b*this.x+matrix.d*this.y+matrix.f};}});
  }
  const operation=async(i,warmup=false)=>{
    const target=`ch-${(i+1)%8+1}`;
    if(scenario==='strip_switch_eq'){
      const node=f.stripLabels.get(target);if(!node)throw new Error('Strip label missing: '+target);
      const started=performance.now();node.click();await f.settle();const clickMs=performance.now()-started;
      if(!warmup)clickLatencies.push(clickMs);
      if(!f.selectedEq()){const started=performance.now();f.hit('workflow.extraEqTabClicks');w.document.getElementById('editor-tab-eq').click();await f.settle();if(!warmup)eqReopenLatencies.push(performance.now()-started);}
      selected=target;
    }else if(scenario==='open_section_eq'){
      if(E.openSection(target,'eq')===false)throw new Error('openSection rejected');await f.settle();selected=target;
    }else if(scenario==='macro_open_eq'){
      const result=await w.SculptSystems.runMacro(9+(i+1)%8);await f.settle();if(!result?.ok)throw new Error(result?.error||'Macro rejected');selected=target;
    }else if(scenario==='eq_gain'){
      lastValue=Math.round((-6+i*.1)*10)/10;if(D.setParam(ctx,'1g',lastValue)===false)throw new Error('EQ update rejected');await f.settle();
    }else if(scenario==='channel_fader'){
      lastValue=Math.round((-30+i*.1)*10)/10;if(C.updateStrip('ch-1',{level:lastValue})===false)throw new Error('Fader update rejected');await f.settle();
    }else if(pointDrag){
      const gain=Math.round((-6+(i+1)*.1)*10)/10;pointer('pointermove',dragStartX+(i+1)*.8,85-gain*3.5);await f.settle();lastValue={gain,frequency:20*1000**((dragStartX+(i+1)*.8-36)/584)};
    }else throw new Error('Unknown scenario '+scenario);
    if(!f.selectedEq())throw new Error('Final EQ panel unavailable: '+scenario);
    if(C.getState().selected!==selected)throw new Error('Wrong selected channel');
  };
  if(pointDrag)pointer('pointerdown',dragStartX,dragStartY);
  for(let i=0;i<(navigation?4:8);i++)await operation(i,true);
  if(pointDrag)pointer('pointerup',dragStartX+6.4,dragStartY-2.8);
  if(navigation){E.openSection('ch-1','eq');selected='ch-1';}else{D.setParam(ctx,'1g',pointDrag?-6:0);if(pointDrag)D.setParam(ctx,'1f',300);C.updateStrip('ch-1',{level:-10});}
  await f.settle();C.endGesture?.();C.clearHistory?.();C.flushSave?.();await Promise.resolve();
  const finishProfile=profiled?await profilerStart():null;
  f.start();const started=performance.now();if(pointDrag)pointer('pointerdown',dragStartX,dragStartY);else if(!navigation)C.beginGesture?.(scenario==='eq_gain'?'Gain EQ':'Fader CH 1');
  for(let i=0;i<count;i++){const before=performance.now();await operation(i);latencies.push(performance.now()-before);}
  if(pointDrag)pointer('pointerup',dragStartX+count*.8,64);else if(!navigation)C.endGesture?.();const flushStart=performance.now();C.flushSave?.();const flushMs=performance.now()-flushStart;
  const elapsedMs=performance.now()-started,{counters,subscriberCalls,writes,records}=f.stop();
  const cpuProfile=finishProfile?await finishProfile():null;
  if(f.jsdomErrors.length)throw new Error(f.jsdomErrors.join('\n'));
  let affected=0,unrelated=0,editor=0;const unrelatedIds=new Set();
  for(const record of records){const element=record.target.nodeType===1?record.target:record.target.parentElement;if(element?.closest?.('.editor-dialog'))editor++;const strip=element?.closest?.('.strip[data-id]');if(!strip)continue;if(navigation?/^ch-[1-8]$/.test(strip.dataset.id):strip.dataset.id==='ch-1')affected++;else{unrelated++;unrelatedIds.add(strip.dataset.id);}}
  const byKey={};for(const {key,bytes}of writes){const row=byKey[key]||(byKey[key]={writes:0,utf8Bytes:0});row.writes++;row.utf8Bytes+=bytes;}
  if(scenario==='eq_gain'&&D.processor(ctx).params['1g']!==lastValue)throw new Error('EQ final state wrong');
  if(scenario==='channel_fader'&&C.getStrip('ch-1').level!==lastValue)throw new Error('Fader final state wrong');
  if(pointDrag){const proc=D.processor(ctx);if(proc.params['1g']!==lastValue.gain||Math.abs(proc.params['1f']-lastValue.frequency)>1.1)throw new Error('EQ drag final state wrong: '+JSON.stringify(proc.params));}
  const result={version:snapshot.version,scenario,run,profiled,fixtureFeatures,operations:count,elapsedMs:rounded(elapsedMs),p50OperationMs:rounded(quantile(latencies,.5)),p95OperationMs:rounded(quantile(latencies,.95)),maxOperationMs:rounded(Math.max(...latencies)),meanOperationMs:rounded(latencies.reduce((a,b)=>a+b,0)/count),finalFlushMs:rounded(flushMs),storageWrites:writes.length,storageUtf8Bytes:writes.reduce((sum,item)=>sum+item.bytes,0),storageByKey:byKey,domMutationRecords:records.length,editorMutationRecords:editor,affectedStripMutationRecords:affected,unrelatedStripMutationRecords:unrelated,unrelatedStripCount:unrelatedIds.size,counters,subscriberCalls,history:C.historyState?.()||null,latenciesMs:latencies.map(rounded)};
  if(clickLatencies.length){result.stripClick={p50Ms:rounded(quantile(clickLatencies,.5)),p95Ms:rounded(quantile(clickLatencies,.95))};result.additionalEqClick={count:eqReopenLatencies.length,p50Ms:rounded(quantile(eqReopenLatencies,.5)),p95Ms:rounded(quantile(eqReopenLatencies,.95))};}
  if(pointDrag)result.pointerGesture={moves:count,down:1,up:1,svgViewBox:'0 0 640 190',screenRect:{left:28,top:90,width:800,height:237.5},initial:{frequency:300,gain:-6},final:{frequency:D.processor(ctx).params['1f'],gain:D.processor(ctx).params['1g']}};
  f.close();if(cpuProfile){const file=`${output}-${snapshot.version}-${scenario}.cpuprofile`;fs.writeFileSync(path.join(__dirname,file),JSON.stringify(cpuProfile));result.cpuProfileFile=file;result.cpuProfile=profileSummary(cpuProfile);}
  return result;
}
async function main(){
  if(args.worker){const result=await measure(snapshots[0],String(args.scenario),Number(args.run||1),args.profiled===true);process.stdout.write(JSON.stringify(result));return;}
  const isolated=(snapshot,scenario,run,profiled=false)=>{
    const options=['--expose-gc',__filename,'--worker',`--scenario=${scenario}`,`--run=${run}`,`--output=${output}`];if(profiled)options.push('--profiled');
    const child=spawnSync(process.execPath,options,{input:JSON.stringify([snapshot]),encoding:'utf8',maxBuffer:32_000_000,env:process.env});
    if(child.status!==0)throw new Error(`Benchmark worker failed (${snapshot.version}/${scenario}/${run}): ${child.stderr||child.error||child.signal}`);
    return JSON.parse(child.stdout);
  };
  const samples=[];
  for(let run=1;run<=repeats;run++)for(const snapshot of run%2?snapshots:[...snapshots].reverse())for(const scenario of scenarios){
    const result=isolated(snapshot,scenario,run);samples.push(result);
    process.stdout.write(`${snapshot.version} ${scenario} run ${run}: ${result.elapsedMs} ms; p50=${result.p50OperationMs} p95=${result.p95OperationMs}; panels=${result.counters['dom.editorPanelReplace']||0} plugins=${result.counters['plugins.build']||0} subscribers=${result.counters['subscriber.callbacks']||0} writes=${result.storageWrites} defaults=${result.counters['catalog.defaults']||0} normalize=${result.counters['desk.normalize']||0}\n`);
    fs.writeFileSync(path.join(__dirname,`${output}-partial.json`),JSON.stringify({samples},null,2)+'\n');
  }
  const profiles=[];
  if(args.profile)for(const snapshot of snapshots)for(const scenario of String(args.profile).split(',')){const result=isolated(snapshot,scenario,0,true);profiles.push(result);process.stdout.write(`${snapshot.version} CPU profile ${scenario}: ${result.elapsedMs} ms; ${result.cpuProfileFile}\n`);}
  const summary=[];
  for(const snapshot of snapshots)for(const scenario of scenarios){const rows=samples.filter(s=>s.version===snapshot.version&&s.scenario===scenario),metric={version:snapshot.version,scenario,operations:rows[0]?.operations,runs:rows.length};if(!rows.length)continue;
    for(const key of ['elapsedMs','p50OperationMs','p95OperationMs','meanOperationMs','finalFlushMs','storageWrites','storageUtf8Bytes','domMutationRecords','editorMutationRecords','affectedStripMutationRecords','unrelatedStripMutationRecords'])metric['median'+key[0].toUpperCase()+key.slice(1)]=rounded(quantile(rows.map(row=>row[key]),.5));
    metric.counters=Object.fromEntries([...new Set(rows.flatMap(row=>Object.keys(row.counters)))].sort().map(key=>[key,quantile(rows.map(row=>row.counters[key]||0),.5)]));summary.push(metric);
  }
  const changedFiles=[];for(const snapshot of snapshots)for(const file of Object.keys(snapshot.sha256))if(hash(fs.readFileSync(path.join(snapshot.directory,file),'utf8'))!==snapshot.sha256[file])changedFiles.push(`${snapshot.version}/${file}`);
  const result={createdAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,kernel:os.release(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,jsdom:require('jsdom/package.json').version},method:{navigationOperations:navCount,gestureOperations:gestureCount,runs:repeats,channels:'CH 1–8, rotated in visible bank order; every navigation ends with WING EQ open',stripClick:'Actual .strip-label.click(); if the application returns to Channel, click the real EQ tab and report that extra action separately',macro:'Eight preassigned macros M9–M16, one editor action per CH1–8; existing runMacro execution; no definition changes, audio, OSC, or wait actions',gesture:'120 successive setParam 1g updates (-6.0 to +5.9 dB), or updateStrip fader updates (-30.0 to -18.1 dB); one begin/endGesture pair; CH 1 EQ stays open',timing:'Per-operation latency includes synchronous app work, microtasks and explicitly drained non-meter RAF callbacks; final project flush timed separately and included in sample total. Initialization, warmup and mutation classification excluded',persistence:'Real JSDOM Storage. Rapid operations without artificial dwell; final flush ensures pending save is included. These counts do not model saves between slow human clicks.',instrumentation:'In-memory counters inserted at named function entries; production source files remain unchanged. Subscriber facade counts actual registered callbacks; createElement and replaceChildren counters plus MutationObserver records. Same probes used for both versions.',profile:'Separate extra pass under Node Inspector 1 ms sampling; profile timings are excluded from comparison medians',excluded:'CSS layout, paint/compositing, meter animation, native macOS/Electron scheduling, UDP/TCP and hardware. This is a CPU/DOM diagnostic, not Mac responsiveness, FPS or audio latency.',isolation:'Each sample runs in a fresh Node child process; source snapshots are passed from the parent. Four navigation or eight parameter warmup operations are excluded. No earlier JSDOM window is retained.',snapshot:'All measured modules read once in the parent before samples; original SHA256 retained, with end-of-run source-change check'},sourceFiles:snapshots.map(({version,directory,sha256,missingProbes})=>({version,directory,sha256,missingProbes})),changedFilesDuringRun:changedFiles,summary,samples,profiles};
  fs.writeFileSync(path.join(__dirname,`${output}-results.json`),JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify({summary,changedFilesDuringRun:changedFiles,missingProbes:snapshots.map(s=>({version:s.version,missing:s.missingProbes}))},null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
