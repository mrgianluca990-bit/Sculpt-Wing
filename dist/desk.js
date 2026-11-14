(function(root){
  'use strict';
  const C=root.SculptController,M=root.SculptModel,K=root.SculptCatalog;
  if(!C||!M||!K)return;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)));
  const knownId=id=>!!C.getStrip(id);
  const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const MACRO_COUNT=16,MACRO_PROFILE_KEY='sculpt-wing-macros-v1';
  function clean(value,depth=0){
    if(depth>18)return null;
    if(typeof value==='string')return value.slice(0,5000);
    if(typeof value==='number')return Number.isFinite(value)?value:0;
    if(typeof value==='boolean'||value===null)return value;
    if(Array.isArray(value))return value.slice(0,2048).map(v=>clean(v,depth+1));
    if(plain(value)){const out={};for(const [k,v]of Object.entries(value).slice(0,4096))if(!['__proto__','constructor','prototype'].includes(k))out[k]=clean(v,depth+1);return out;}
    return null;
  }
  function merge(base,extra){
    if(!plain(extra))return base;
    for(const [key,value]of Object.entries(extra)){
      if(['__proto__','constructor','prototype'].includes(key))continue;
      if(plain(value)&&plain(base[key]))merge(base[key],value);else base[key]=clean(value);
    }return base;
  }
  function normalizeMacros(input){
    const byId=new Map();
    for(const item of Array.isArray(input)?input:[]){
      const id=Number(item?.id);if(!plain(item)||!Number.isInteger(id)||id<1||id>MACRO_COUNT||byId.has(id))continue;
      const value=clean(item);byId.set(id,{...value,id,name:typeof value.name==='string'?value.name:'',actions:Array.isArray(value.actions)?value.actions.slice(0,32):[]});
    }
    return Array.from({length:MACRO_COUNT},(_,i)=>byId.get(i+1)||{id:i+1,name:'',actions:[]});
  }
  const sourceGroups=[['LCL',24,'Locale'],['AUX',8,'Aux analogico'],['A',48,'AES50 A'],['B',48,'AES50 B'],['C',48,'AES50 C'],['SC',32,'StageCONNECT'],['USB',48,'USB'],['CRD',64,'WING-LIVE'],['MOD',64,'Dante'],['PLAY',4,'Player'],['AES',2,'AES/EBU'],['USR',56,'User'],['OSC',2,'Oscillatore']];
  const outputGroups=[['LCL',8],['AUX',8],['A',48],['B',48],['C',48],['SC',32],['USB',48],['CRD',64],['MOD',64],['AES',2],['REC',4]];
  function proc(ctx,model,enabled=true){return {model,enabled,params:K.defaults(ctx,model)||{},mix:100};}
  function defaults(){
    const d={schema:1,channels:{},processing:{},fx:[],sources:{},outputs:{},users:[],
      dca:Array.from({length:16},(_,i)=>({id:i+1,name:['Voci','Batteria','Strumenti','Playback'][i]||`DCA ${i+1}`,level:0,mute:false,solo:false,members:i===0?['ch-1','ch-2','ch-3']:i===1?Array.from({length:8},(_,j)=>`ch-${j+7}`):[]})),
      muteGroups:Array.from({length:8},(_,i)=>({id:i+1,name:['Voci','FX','Palco','Tutti'][i]||`Mute ${i+1}`,on:false,members:i===0?['ch-1','ch-2','ch-3']:i===1?['bus-13','bus-14','bus-15','bus-16']:[]})),
      automix:{x:{enabled:false,channels:[],weights:{}},y:{enabled:false,channels:[],weights:{}}},
      monitor:[1,2].map(i=>({id:i,name:`Monitor ${i===1?'A':'B'}`,source:'MAIN:1',level:-12,dim:false,dimLevel:-20,mono:false,mute:false,mode:'PFL',delay:0,delayOn:false,width:100,pan:0,polarity:false,eqOn:false,limiter:false})),
      talkback:{source:'ch-40',a:{on:false,latch:false,level:-6,targets:['bus-1','bus-2']},b:{on:false,latch:false,level:-6,targets:['main-1']}},
      oscillators:[1,2].map(i=>({id:i,on:false,mode:'SINE',frequency:i===1?1000:440,level:-30,targets:[]})),
      scenes:[],snippets:[],stripPresets:[],safes:[],macros:Array.from({length:MACRO_COUNT},(_,i)=>({id:i+1,name:['Talk A','Mute FX','Voce +1','Voce −1','SD Record','SD Stop','Dim','Scena GO'][i]||'',actions:[]})),macrosSeeded:false,
      setup:{name:'Sculpt · WING Rack',model:'RACK',firmware:'3.1.2',ip:'192.168.1.100',dhcp:true,sampleRate:48000,clock:'INTERNAL',usbChannels:48,card:'WLIVE',module:'DANTE',stageConnect:{inputs:16,outputs:16,mode:'AUTO',power:true},networkMode:'SWITCH',midiChannel:1,remoteLock:false,startMute:false},
      recorder:{},customControls:[],history:[],pluginPresets:[],pluginClipboard:null,showName:'Live · Sculpt',activeScene:null,
      io:{globalAlt:false,autoAlt:false,haRemote:{A:true,B:true,C:false}},layers:[],activeLayer:null};
    d.sources.OFF={id:'OFF',name:'Non assegnato',group:'OFF',index:0,gain:0,trim:0,phantom:false,polarity:false,mute:false,mode:'M',preamp:false};
    for(const [group,count,label]of sourceGroups)for(let i=1;i<=count;i++){
      const id=`${group}:${i}`,preamp=['LCL','A','B','C','SC'].includes(group);
      d.sources[id]={id,group,index:i,name:`${label} ${i}`,gain:preamp?18:0,gainMin:-3,gainMax:45.5,gainStep:.5,trim:0,phantom:false,polarity:false,mute:false,mode:['USB','PLAY','MOD'].includes(group)?'ST':'M',color:'#8d929c',preamp,remote:'OFF',receiveCustom:false};
    }
    for(const [group,count]of outputGroups)for(let i=1;i<=count;i++)d.outputs[`${group}:${i}`]={id:`${group}:${i}`,group,index:i,source:group==='LCL'?(i<=2?`MAIN:${i===1?1:1}`:i<=6?`BUS:${i-2}`:`MTX:${i-6}`):group==='CRD'||group==='USB'?`CH:${Math.min(i,40)}`:'OFF',side:i%2?'L':'R',tap:'POST'};
    d.users=Array.from({length:56},(_,i)=>({id:i+1,name:`${i<24?'Signal':'Patch'} ${i<24?i+1:i-23}`,type:i<24?'SIGNAL':'PATCH',source:'OFF',tap:'POST',side:'L'}));
    for(const s of C.listStrips()){
      if(['BUS','MAIN','MTX'].includes(s.kind))d.sources[`${s.kind}:${s.number}`]={id:`${s.kind}:${s.number}`,group:s.kind,index:s.number,name:s.name,stripId:s.id,gain:0,trim:0,phantom:false,polarity:false,mute:false,mode:'ST',preamp:false};
      const input=['CH','AUX'].includes(s.kind),source=s.kind==='CH'?(s.number<=24?`LCL:${s.number}`:`A:${s.number-24}`):s.kind==='AUX'?(s.number===1?'PLAY:1':s.number===2?'USB:1':'OFF'):'OFF';
      d.channels[s.id]={source,altSource:input?`CRD:${s.number+(s.kind==='AUX'?40:0)}`:'OFF',useAlt:false,sourceAuto:true,mode:input?d.sources[source]?.mode||'M':'ST',delay:0,delayOn:false,delayUnit:'MS',lowCut:80,highCut:20000,lowCutOn:false,highCutOn:false,lowSlope:12,highSlope:12,order:s.kind==='CH'?['gate','eq','dyn','insert']:['eq','dyn','insert'],preFx:null,postFx:null,preFxOn:true,postFxOn:true,tap:s.kind==='CH'?'PFL':'POST',solo:false,tags:'',icon:'',width:100,tapWidth:100,balance:0,monitor:'A',soloSafe:false,gateSC:{source:'SELF',tap:'IN',type:'OFF',frequency:1000,q:2,listen:false},dynSC:{source:'SELF',tap:s.kind==='CH'?'IN':'BUS',type:'OFF',frequency:1000,q:2,listen:false},dynCrossover:{type:'OFF',frequency:1000,depth:6,q:1,listen:false},sendEQ:{enabled:false,bands:[{freq:100,gain:0,q:1},{freq:1000,gain:0,q:1},{freq:10000,gain:0,q:1}]}};
      d.processing[s.id]={eq:proc({type:'strip',id:s.id,block:'eq'},'STD'),dyn:proc({type:'strip',id:s.id,block:'dyn'},'COMP',false)};
      if(s.kind==='CH'){d.processing[s.id].gate=proc({type:'strip',id:s.id,block:'gate'},'GATE',false);d.processing[s.id].filter=proc({type:'strip',id:s.id,block:'filter'},'TILT');}
    }
    const seed=['VSS3','ST-DL','HALL','PLATE','TAPE-DL','DIMCRS','NONE','NONE','*BUS*','GEQ','SPKMAN','LIMITER','NONE','NONE','NONE','NONE'];
    d.fx=seed.map((model,i)=>({...proc({type:'fx',slot:i+1},model),slot:i+1,stripId:i<4?`bus-${13+i}`:i===8?'main-1':null,position:'pre'}));
    for(const f of d.fx)if(f.stripId)d.channels[f.stripId].preFx=f.slot;
    for(const key of ['sdA','sdB','usb','player'])d.recorder[key]={state:'stopped',position:0,startedAt:null,tracks:key.startsWith('sd')?32:2,session:key==='player'?'Playback demo':'Sessione 01',sessions:key==='player'?[{id:'demo-1',name:'Soundcheck.wav',duration:180}]:[],markers:[],loop:false,loopStart:0,loopEnd:60};
    return d;
  }
  function valueFor(p,value){
    if(p.type==='string')return String(value??'').slice(0,p.maxLength||256);
    if(p.type==='enum'||p.options){const opts=(p.options||[]).map(x=>typeof x==='object'?x.value:x);if(opts.includes(value))return value;const match=opts.find(v=>String(v)===String(value));return match!==undefined?match:p.default;}
    if(p.type==='boolean')return Number(!!Number(value));
    let n=Number(value);if(!Number.isFinite(n))n=Number(p.default)||0;
    n=clamp(n,p.min??-1e9,p.max??1e9);if(p.step>0)n=Math.round((n-(p.min||0))/p.step)*p.step+(p.min||0);
    return Number(clamp(n,p.min??-1e9,p.max??1e9).toFixed(6));
  }
  function normalizeAutomix(d,preferred=new Set()){
    if(!plain(d.automix))d.automix={};
    const entries=[];
    for(const key of ['x','y']){
      if(!plain(d.automix[key]))d.automix[key]={enabled:false,channels:[],weights:{}};
      const group=d.automix[key];if(!plain(group.weights))group.weights={};
      for(const id of Array.isArray(group.channels)?group.channels:[])if(C.getStrip(id)?.kind==='CH')entries.push({key,id});
      group.channels=[];
    }
    const selected=new Set();
    // A limited shared resource must retain safe members before recalled ones.
    for(const entry of [...entries.filter(e=>preferred.has(e.id)),...entries.filter(e=>!preferred.has(e.id))]){
      if(selected.has(entry.id)||selected.size>=16)continue;
      selected.add(entry.id);d.automix[entry.key].channels.push(entry.id);
    }
  }
  function reconcileInserts(d,{keepSlots=new Set(),automixWins=true}={}){
    // Rack ownership is canonical. Channel fields are its derived reverse map.
    for(const ch of Object.values(d.channels))if(plain(ch)){ch.preFx=null;ch.postFx=null;}
    const automix=new Set(['x','y'].flatMap(key=>d.automix[key].channels));
    const slots=[...d.fx].sort((a,b)=>Number(keepSlots.has(b.slot))-Number(keepSlots.has(a.slot))||a.slot-b.slot);
    for(const fx of slots){
      const id=fx.stripId,strip=C.getStrip(id),position=fx.position==='post'?'post':'pre',key=position==='post'?'postFx':'preFx';
      fx.position=position;
      if(!strip||!d.channels[id]||position==='post'&&strip.kind==='AUX'||d.channels[id][key]){fx.stripId=null;continue;}
      if(position==='post'&&automix.has(id)){
        if(automixWins){fx.stripId=null;continue;}
        for(const group of ['x','y'])d.automix[group].channels=d.automix[group].channels.filter(ch=>ch!==id);
        automix.delete(id);
      }
      d.channels[id][key]=fx.slot;
    }
  }
  function layerRows(layer){
    const rows={top:[],bottom:[]},seen=new Set();
    const isDca=id=>typeof id==='string'&&/^dca-(?:[1-9]|1[0-6])$/.test(id);
    const append=(row,id)=>{if(typeof id==='string'&&(knownId(id)||isDca(id))&&!seen.has(id)){seen.add(id);rows[isDca(id)?'top':row].push(id);}};
    if(plain(layer?.rows)){
      for(const row of ['top','bottom'])for(const id of Array.isArray(layer.rows[row])?layer.rows[row]:[])append(row,id);
    }else{
      // Old layers selected members only. Retain their original row and order.
      for(const id of Array.isArray(layer?.members)?layer.members:[]){const strip=C.getStrip(id);if(strip||isDca(id))append(strip&&['CH','AUX'].includes(strip.kind)?'bottom':'top',id);}
    }
    return rows;
  }
  function normalizeLayers(d){
    const ids=new Set();
    d.layers=(Array.isArray(d.layers)?d.layers:[]).filter(plain).map((layer,index)=>{
      let id=typeof layer.id==='string'&&layer.id?layer.id:'layer-'+(index+1);
      while(ids.has(id))id+='-copy';ids.add(id);
      const rows=layerRows(layer);
      return {...layer,id,name:String(layer.name||'Layer '+(index+1)).slice(0,80),rows,members:[...rows.top,...rows.bottom]};
    });
    if(!d.layers.some(layer=>layer.id===d.activeLayer))d.activeLayer=null;
    return d;
  }
  function normalize(input){
    const base=defaults();if(!plain(input))return base;
    const safe=clean(input);const d=merge(clone(base),safe);
    for(const key of ['setup','io','automix','talkback','recorder'])if(!plain(d[key]))d[key]=clone(base[key]);
    for(const key of ['channels','processing','sources','outputs'])if(!plain(d[key]))d[key]=defaults()[key];
    for(const [id,ch]of Object.entries(base.channels)){
      if(!plain(d.channels[id]))d.channels[id]=ch;
      if(!plain(d.processing[id]))d.processing[id]=base.processing[id];
      const c=d.channels[id];if(!d.sources[c.source])c.source='OFF';if(!d.sources[c.altSource])c.altSource='OFF';
      if(c.tap==='PRE_FADER')c.tap='PFL';if(C.getStrip(id).kind!=='CH'&&c.dynSC?.tap==='IN')c.dynSC.tap='BUS';
      if(!Array.isArray(c.order))c.order=['eq','dyn','insert'];
      for(const block of ['eq','dyn','gate','filter']){
        const ctx={type:'strip',id,block},current=d.processing[id]?.[block];if(!current)continue;
        const def=K.get(ctx,current.model);if(!def){delete d.processing[id][block];continue;}
        const params=K.defaults(ctx,current.model)||{};for(const p of def.parameters||[])params[p.key]=valueFor(p,current.params?.[p.key]??params[p.key]);current.params=params;current.enabled=!!current.enabled;
      }
    }
    if(!Array.isArray(d.fx))d.fx=defaults().fx;
    d.fx=Array.from({length:16},(_,i)=>{
      const ctx={type:'fx',slot:i+1},item=plain(d.fx[i])?d.fx[i]:proc(ctx,'NONE'),def=K.get(ctx,item.model);
      const valid=def&&K.list(ctx).some(v=>v.id===item.model);if(!valid)item.model='NONE';
      const spec=K.get(ctx,item.model),params=K.defaults(ctx,item.model)||{};for(const p of spec?.parameters||[])params[p.key]=valueFor(p,item.params?.[p.key]??params[p.key]);
      return {...item,slot:i+1,params,enabled:!!item.enabled,mix:clamp(item.mix??100,0,100),stripId:knownId(item.stripId)?item.stripId:null,position:item.position==='post'?'post':'pre'};
    });
    for(const key of ['dca','muteGroups','users','scenes','snippets','stripPresets','safes','macros','customControls','history','pluginPresets','layers'])if(!Array.isArray(d[key]))d[key]=defaults()[key]||[];
    d.macros=normalizeMacros(d.macros);
    // A loaded macro bank, including intentionally empty slots, is user content.
    // Fresh defaults explicitly carry false so a reset may seed the eight demos.
    if(Array.isArray(safe.macros)&&!Object.prototype.hasOwnProperty.call(safe,'macrosSeeded'))d.macrosSeeded=true;
    d.dca=d.dca.slice(0,16);d.muteGroups=d.muteGroups.slice(0,8);d.scenes=d.scenes.slice(0,20);
    for(const group of [...d.dca,...d.muteGroups]){group.members=Array.isArray(group.members)?group.members.filter(knownId):[];if('level'in group)group.level=clamp(group.level,-90,10);}
    if(!Array.isArray(d.monitor)||d.monitor.length!==2)d.monitor=clone(base.monitor);
    if(!Array.isArray(d.oscillators)||d.oscillators.length!==2)d.oscillators=clone(base.oscillators);
    normalizeAutomix(d);reconcileInserts(d);normalizeLayers(d);
    return d;
  }
  let macroProfile=null;
  try{const saved=JSON.parse(root.localStorage?.getItem(MACRO_PROFILE_KEY)||'null');if(saved?.version===1&&Array.isArray(saved.macros))macroProfile=saved;}catch{}
  C.transact(s=>{
    s.desk=s.desk?normalize(s.desk):defaults();
    if(macroProfile){s.desk.macros=normalizeMacros(macroProfile.macros);s.desk.macrosSeeded=macroProfile.macrosSeeded!==false;}
  },'init');
  const get=()=>C.getState().desk;
  const change=(fn,type='console',options={})=>C.transact(s=>{fn(s.desk);},type,options);
  let macroProfileSignature='',macroStorageWarning=false;
  function persistMacroProfile(event){
    if(event&&['strip','send','parameter','processing','channel','source','routing','dca','live-values','selection','sof','layer','desk-ready'].includes(event.type))return;
    const current=get(),value=JSON.stringify({version:1,macrosSeeded:current.macrosSeeded===true,macros:normalizeMacros(current.macros)});
    if(value===macroProfileSignature)return;
    try{const storage=root.localStorage;if(!storage)return;storage.setItem(MACRO_PROFILE_KEY,value);macroProfileSignature=value;macroStorageWarning=false;}
    catch{if(!macroStorageWarning){macroStorageWarning=true;C.toast?.('Non è stato possibile salvare le macro su questo dispositivo. Esporta il progetto per conservarle.');}}
  }
  // Macro definitions are local controls. Persist only this bank while ordinary
  // project/audio persistence is disabled by an active WING session.
  C.subscribe(persistMacroProfile);
  function processor(ctx){if(ctx?.type==='fx')return get().fx[Number(ctx.slot)-1]||null;return get().processing[ctx?.id]?.[ctx?.block]||null;}
  function setModel(ctx,id){
    const item=processor(ctx);if(!item||!K.list(ctx).some(v=>v.id===id))return false;
    change(d=>{const p=ctx.type==='fx'?d.fx[ctx.slot-1]:d.processing[ctx.id][ctx.block];p.model=id;p.params=K.defaults(ctx,id)||{};p.enabled=true;p.mix=100;},'processing');
    if(ctx.type==='fx'&&id==='NONE')assignFx(ctx.slot,null,'pre');return true;
  }
  function setParam(ctx,key,value){const item=processor(ctx),def=item&&K.get(ctx,item.model),catalogParam=def?.parameters?.find(v=>v.key===key);if(!catalogParam)return false;const liveParam=root.SculptLive?.isLive()?root.SculptLive.parameterDefinition(ctx,key):null;if(root.SculptLive?.isLive()&&(!liveParam||liveParam.readOnly))return false;const p={...catalogParam,...(liveParam||{})};const next=valueFor(p,value);if(Object.is(item.params[key],next))return true;const path=ctx.type==='fx'?['desk','fx',Number(ctx.slot)-1]:['desk','processing',ctx.id,ctx.block];return change(()=>{item.params[key]=next;},'parameter',{id:ctx.id,paths:[path]})!==false;}
  function assignFx(slot,id,position='pre'){
    slot=Number(slot);const fx=get().fx[slot-1];if(!fx||id&&!knownId(id))return false;
    position=position==='post'?'post':'pre';if(id&&C.getStrip(id).kind==='AUX'&&position==='post')return false;
    change(d=>{
      if(fx.stripId&&d.channels[fx.stripId]){const old=d.channels[fx.stripId];if(old.preFx===slot)old.preFx=null;if(old.postFx===slot)old.postFx=null;}
      if(id){const key=position==='post'?'postFx':'preFx',previous=d.channels[id][key];if(previous&&previous!==slot&&d.fx[previous-1])d.fx[previous-1].stripId=null;d.channels[id][key]=slot;}
      if(id&&position==='post')for(const group of Object.values(d.automix))if(Array.isArray(group.channels))group.channels=group.channels.filter(ch=>ch!==id);
      fx.stripId=id||null;fx.position=position;
    },'routing');return true;
  }
  function patchChannel(id,patch){if(!get().channels[id]||!plain(patch))return false;change(d=>{
    const ch=d.channels[id];for(const [key,value]of Object.entries(patch)){
      if(!(key in ch))continue;
      if(['source','altSource'].includes(key)){if(d.sources[value])ch[key]=value;}
      else if(key==='order'){if(Array.isArray(value)&&C.getStrip(id).kind==='CH'&&new Set(value).size===4&&value.every(v=>['gate','eq','dyn','insert'].includes(v)))ch.order=[...value];}
      else if(key==='delay')ch[key]=clamp(value,0,3000);
      else if(['lowCut','highCut'].includes(key))ch[key]=clamp(value,20,20000);
      else if(['width','tapWidth'].includes(key))ch[key]=clamp(value,-150,150);
      else if(key==='balance')ch[key]=clamp(value,-9,9);
      else if(typeof ch[key]==='boolean')ch[key]=!!value;
      else if(plain(ch[key])&&plain(value))merge(ch[key],value);
      else ch[key]=clean(value);
    }
    if('source'in patch||'altSource'in patch||'useAlt'in patch){const src=d.sources[ch.useAlt?ch.altSource:ch.source];if(src)ch.mode=src.mode;}
  },'channel',{id,paths:[['desk','channels',id]]});return true;}
  function patchSource(id,patch){const s=get().sources[id];if(!s||id==='OFF')return false;change(d=>{
    for(const [k,v]of Object.entries(patch)){
      if(k==='gain'&&s.preamp)s.gain=Math.round(clamp(v,s.gainMin,s.gainMax)/s.gainStep)*s.gainStep;
      else if(k==='trim')s.trim=clamp(v,-18,18);
      else if(k==='phantom'&&s.preamp)s.phantom=!!v;
      else if(['polarity','mute','receiveCustom'].includes(k))s[k]=!!v;
      else if(k==='mode'&&['M','ST','M/S'].includes(v)){s.mode=v;for(const ch of Object.values(d.channels))if((ch.useAlt?ch.altSource:ch.source)===id)ch.mode=v;}
      else if(['name','color','remote','icon','tags'].includes(k))s[k]=String(v).slice(0,k==='name'?16:80);
    }
  },'source',{paths:[['desk','sources',id],...('mode'in patch?[['desk','channels']]:[])]});return true;}
  function capacity(group,out=false){
    const s=get().setup,model=String(s.model).toUpperCase(),full=['WING','FULL','FULLSIZE','FULL-SIZE'].includes(model);
    if(group==='LCL')return out?8:full?8:24;
    if(group==='AUX')return full?8:0;
    if(group==='MOD')return ['NONE','OFF',''].includes(String(s.module).toUpperCase())?0:64;
    if(group==='CRD')return ['NONE','OFF',''].includes(String(s.card).toUpperCase())?0:64;
    if(group==='USB')return Number(s.usbChannels)||48;
    if(group==='SC'){const st=s.stageConnect;return plain(st)?Number(out?st.outputs:st.inputs)||0:16;}
    return 1e6;
  }
  const sources=()=>Object.values(get().sources).filter(s=>s.index<=capacity(s.group)).map(s=>s.stripId?{...s,name:C.getStrip(s.stripId)?.name||s.name}:s);
  function signals(){
    const extra=C.listStrips().filter(s=>['CH','AUX'].includes(s.kind)).map(s=>({id:`${s.kind==='AUX'?'AUXP':s.kind}:${s.number}`,group:s.kind==='AUX'?'AUXP':s.kind,index:s.number,name:`${s.kind} ${s.number} · ${s.name}`,stripId:s.id}));
    extra.push({id:'MON:1',group:'MON',index:1,name:'Monitor A'},{id:'MON:2',group:'MON',index:2,name:'Monitor B'});
    return [...sources(),...extra];
  }
  function outputs(){return Object.values(get().outputs).filter(o=>o.index<=capacity(o.group,true));}
  function patchOutput(id,sourceId){const o=get().outputs[id];if(!o||!signals().some(s=>s.id===sourceId))return false;change(()=>{o.source=sourceId;},'routing');return true;}
  function effective(id){
    const strip=C.getStrip(id);if(!strip)return {level:-90,muted:true,solo:false};
    const d=get(),ch=d.channels[id];let level=strip.level,muted=strip.mute,solo=!!ch?.solo;
    for(const g of d.dca)if(g.members?.includes(id)){if(level>-89&&g.level>-89)level+=g.level;else level=-90;muted=muted||g.mute;solo=solo||g.solo;}
    for(const g of d.muteGroups)if(g.on&&g.members?.includes(id))muted=true;
    if(ch&&['CH','AUX'].includes(strip.kind)){const src=d.sources[(ch.useAlt||d.io.globalAlt&&ch.sourceAuto)?ch.altSource:ch.source];if(src?.mute||src?.id==='OFF')muted=true;}
    return {level:clamp(level,-90,10),muted:!!muted,solo};
  }
  function capture(){const snapshot=C.capture();for(const key of ['scenes','snippets','stripPresets','macros','history','pluginPresets','pluginClipboard'])delete snapshot.desk[key];return snapshot;}
  function recall(snapshot,scope=['levels','processing','routing','groups','monitor','setup'],safes=get().safes){
    if(!snapshot?.values||snapshot.version!==3)throw new Error('Scena non valida');
    const scopes=Array.isArray(scope)?scope:Object.entries(scope||{}).filter(([,v])=>v).map(([k])=>k),blocked=new Set(safes||[]),next=normalize(snapshot.desk),current=get();
    const keepSources=new Set([...blocked].flatMap(id=>{const ch=current.channels[id];return ch?[ch.source,ch.altSource]:[];}));
    C.transact(state=>{
      const d=state.desk,recallFx=scopes.includes('fx')||scopes.includes('processing'),recallGroups=scopes.includes('groups');
      const keepSlots=new Set(),oldAutomix=recallGroups?clone(d.automix):null;
      if(scopes.includes('levels'))for(const strip of C.listStrips())if(!blocked.has(strip.id)&&snapshot.values[strip.id])M.patchStrip(strip,snapshot.values[strip.id]);
      if(scopes.includes('levels')){
        for(const key of Object.keys(state.sends))if(!key.split('>').some(id=>blocked.has(id)))delete state.sends[key];
        for(const [key,val]of Object.entries(snapshot.sends||{})){const [a,b]=key.split('>');if(!blocked.has(a)&&!blocked.has(b))M.setSend(state,a,b,val);}
      }
      if(scopes.includes('processing'))for(const id of Object.keys(d.processing))if(!blocked.has(id)&&next.processing[id]){d.processing[id]=clone(next.processing[id]);for(const key of ['delay','delayOn','delayUnit','lowCut','highCut','lowCutOn','highCutOn','lowSlope','highSlope','order','preFxOn','postFxOn','gateSC','dynSC','dynCrossover','sendEQ','tapWidth'])d.channels[id][key]=clone(next.channels[id][key]);}
      if(recallFx)for(let i=0;i<16;i++){
        if(blocked.has(d.fx[i].stripId)||blocked.has(next.fx[i].stripId))keepSlots.add(d.fx[i].slot);
        else d.fx[i]=clone(next.fx[i]);
      }
      if(scopes.includes('routing')){
        for(const id of Object.keys(d.channels))if(!blocked.has(id))for(const key of ['source','altSource','useAlt','mode','tap','sourceAuto'])d.channels[id][key]=clone(next.channels[id][key]);
        for(const id of Object.keys(d.sources))if(!keepSources.has(id)&&next.sources[id])d.sources[id]=clone(next.sources[id]);
        d.outputs=clone(next.outputs);d.users=clone(next.users);d.io=clone(next.io);
      }
      if(recallGroups){
        for(const key of ['dca','muteGroups','automix'])d[key]=clone(next[key]);
        for(const key of ['x','y']){
          const group=d.automix[key],old=oldAutomix[key];
          group.channels=group.channels.filter(id=>!blocked.has(id));
          group.channels.push(...old.channels.filter(id=>blocked.has(id)));
          for(const id of blocked){if(Object.prototype.hasOwnProperty.call(old.weights,id))group.weights[id]=old.weights[id];else delete group.weights[id];}
        }
      }
      if(recallFx||recallGroups){normalizeAutomix(d,blocked);reconcileInserts(d,{keepSlots,automixWins:recallGroups});}
      if(scopes.includes('monitor'))for(const key of ['monitor','talkback','oscillators','solo','meterSettings'])if(next[key]!==undefined)d[key]=clone(next[key]);
      if(scopes.includes('setup'))for(const key of ['setup','customControls','gpio','layers','mainLink'])if(next[key]!==undefined)d[key]=clone(next[key]);
      if(scopes.includes('setup'))normalizeLayers(d);
      if(scopes.includes('recorder'))d.recorder=clone(next.recorder);
      state.sof=null;
    },'recall');return true;
  }
  function reset(){const fresh=M.defaults();fresh.desk=defaults();C.restore(M.serialize(fresh));}
  root.SculptDesk={get,change,subscribe:C.subscribe,defaults,normalize,normalizeMacros,layerRows,normalizeLayers,processor,setModel,setParam,
    setLayerRows(id,rows){const layer=get().layers.find(item=>item.id===id);if(!layer)return false;return change(()=>{layer.rows=layerRows({rows});layer.members=[...layer.rows.top,...layer.rows.bottom];},'layer-layout');},
    enableProcessor(ctx,on){const p=processor(ctx);if(p)change(()=>{p.enabled=!!on;},'processing');},
    setProcessorMix(ctx,value){const p=processor(ctx);if(p)change(()=>{p.mix=clamp(value,0,100);},'parameter');},
    assignFx,channel:id=>get().channels[id],patchChannel,source:id=>{const s=get().sources[id];return s?.stripId?{...s,name:C.getStrip(s.stripId)?.name||s.name}:s;},sources,signals,patchSource,output:id=>get().outputs[id],outputs,patchOutput,capacity,
    setSolo(id,value){if(!get().channels[id])return false;change(d=>{if(value&&d.solo?.exclusive)for(const ch of Object.values(d.channels))ch.solo=false;d.channels[id].solo=!!value;},'solo');if(value&&get().solo?.follow)C.selectStrip(id);return true;},effective,capture,recall,reset,
    log(message){change(d=>{d.history.unshift({time:Date.now(),message:String(message).slice(0,180)});d.history=d.history.slice(0,20);},'history');}};
  C.transact(()=>{},'desk-ready');
})(typeof window!=='undefined'?window:globalThis);
