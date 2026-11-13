/* Sculpt Wing ↔ WING native parameter map.
 * Paths are taken from WING Remote Protocols V3.1.2-a. This module does not
 * authorize writes: the live coordinator must resolve every path and use the
 * type, options, range and read-only flag returned by the connected console.
 */
(function(root){
  'use strict';
  const Cat=root.SculptCatalog||(typeof require==='function'?require('./plugin-data.js'):null);
  const Model=root.SculptModel||(typeof require==='function'?require('./model.js'):null);
  const COUNTS={ch:40,aux:8,bus:16,main:4,mtx:8};
  const INPUT_GROUPS={LCL:24,AUX:8,A:48,B:48,C:48,SC:32,USB:48,CRD:64,MOD:64,PLAY:4,AES:2,USR:56,OSC:2};
  const OUTPUT_GROUPS={LCL:8,AUX:8,A:48,B:48,C:48,SC:32,USB:48,CRD:64,MOD:64,AES:2,REC:4};
  const STEREO_GROUPS=new Set(['BUS','MAIN','MTX','MON','SEND']);
  const SOURCE_GROUPS=new Set(['OFF',...Object.keys(INPUT_GROUPS),'BUS','MAIN','MTX']);
  const OUTPUT_SOURCES=new Set([...SOURCE_GROUPS,'MON','SEND']);
  // Console colour indices; these RGB values are an application palette.
  const COLORS=['#89949c','#4969b7','#0089ff','#5b33fa','#2bdfa6','#00b43d','#9acc00','#f6e100','#bd6a1b','#e31b44','#ff7679','#f129e7','#a52ff6','#ffb71b','#21bff0','#ff5a2d','#00c6ca','#707070','#e0e0e0'];
  const indexes=new WeakMap(),sendDefaults=new WeakMap(),sendViews=new WeakMap();
  let cachedSignature='',cachedEntries=[],cachedByPath=new Map();
  const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj||{},key);
  const num=value=>Number.isFinite(Number(value))?Number(value):undefined;
  const flag=value=>!!Number(value);
  const bool=value=>value?1:0;
  const identity=value=>value;
  const levelOut=value=>Number(value)<=-90?-144:Number(value);
  const levelIn=value=>Math.max(-90,Math.min(10,Number(value)));
  const list=state=>state.values?Object.values(state.values):[...(state.outputs||[]),...(state.inputs||[])];
  function strip(state,id){
    if(state.values)return state.values[id];
    let index=indexes.get(state);if(!index){index=Object.fromEntries(list(state).map(s=>[s.id,s]));indexes.set(state,index);}return index[id];
  }
  const desk=state=>state.desk||{};
  const channel=(state,id)=>desk(state).channels?.[id];
  const source=(state,id)=>desk(state).sources?.[id];
  const processor=(state,ctx)=>ctx.type==='fx'?desk(state).fx?.[ctx.slot-1]:desk(state).processing?.[ctx.id]?.[ctx.block];
  const raw=(state,path)=>desk(state)._wing?.values?.[path];
  function remember(state,path,value){
    const d=desk(state);if(!d._wing)d._wing={values:{}};if(!d._wing.values)d._wing.values={};d._wing.values[path]=value;
  }
  function stripPath(id){const match=/^(ch|aux|bus|main|mtx)-(\d+)$/.exec(String(id));return match&&+match[2]>=1&&+match[2]<=COUNTS[match[1]]?`/${match[1]}/${+match[2]}`:null;}
  function sourcePath(id){const [group,indexText]=String(id).split(':'),index=Number(indexText);return INPUT_GROUPS[group]&&Number.isInteger(index)&&index>=1&&index<=INPUT_GROUPS[group]?`/io/in/${group}/${index}`:null;}
  const sourceParts=id=>{const [group,index]=String(id||'OFF').split(':');return {group,index:Number(index)||1};};
  const sourceId=(group,index)=>group==='OFF'?'OFF':`${group}:${Number(index)||1}`;
  function colorIn(value){return COLORS[Number(value)]||COLORS[0];}
  function colorOut(value){
    const hex=String(value||'').toLowerCase(),exact=COLORS.indexOf(hex);if(exact>0)return exact;
    if(!/^#[0-9a-f]{6}$/.test(hex))return undefined;
    const rgb=[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16));let best=1,distance=Infinity;
    COLORS.slice(1).forEach((c,i)=>{const d=[1,3,5].reduce((total,n,j)=>total+(parseInt(c.slice(n,n+2),16)-rgb[j])**2,0);if(d<distance){distance=d;best=i+1;}});return best;
  }
  function canonicalWire(state,path,current,toWire=identity,fromWire=identity){
    const previous=raw(state,path);if(previous!==undefined&&Object.is(fromWire(previous),current))return previous;
    const encoded=toWire(current);
    // Numeric enumerations (native type 6) are described as textual options in
    // the reference catalog. Retain the connected node's numeric value type.
    if(typeof previous==='number'&&typeof encoded==='string'&&/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(encoded))return Number(encoded);
    return encoded;
  }
  function linkedSourceId(state,id){
    const ch=channel(state,id);if(!ch||!flag(raw(state,`${stripPath(id)}/clink`)))return null;
    const alt=ch.useAlt||(desk(state).io?.globalAlt&&ch.sourceAuto);const sid=alt?ch.altSource:ch.source;return sourcePath(sid)?sid:null;
  }
  function sourcePresentation(state,id,key){
    const item=source(state,id);if(!item)return undefined;
    const path=`${sourcePath(id)}/${key==='color'?'col':'name'}`,convert=key==='color'?colorIn:identity;
    const previous=raw(state,path);
    if(previous===undefined||!Object.is(item[key],convert(previous)))return item[key];
    for(const s of list(state)){
      if(linkedSourceId(state,s.id)!==id)continue;
      const effective=raw(state,`${stripPath(s.id)}/$${key==='color'?'col':'name'}`);
      if(effective!==undefined&&!Object.is(s[key],convert(effective)))return s[key];
    }return item[key];
  }
  function updatePresentation(state,id,key,value){
    const item=source(state,id);if(item)item[key]=value;
    if(key==='name'&&id.startsWith('USR:')){const user=desk(state).users?.find(v=>v.id===Number(id.split(':')[1]));if(user)user.name=value;}
    for(const s of list(state))if(linkedSourceId(state,s.id)===id){s[key]=value;remember(state,`${stripPath(s.id)}/$${key==='color'?'col':'name'}`,key==='color'?colorOut(value):value);}
  }
  function sendBasePath(fromId,toId){
    const from=stripPath(fromId),to=stripPath(toId);if(!from||!to||fromId===toId)return null;
    const [fromKind]=fromId.split('-'),[toKind,toIndex]=toId.split('-');
    if(['ch','aux'].includes(fromKind)&&['bus','mtx','main'].includes(toKind)||fromKind==='bus'&&['bus','mtx','main'].includes(toKind)||fromKind==='main'&&toKind==='mtx'){
      return `${from}/${toKind==='main'?'main/'+toIndex:'send/'+(toKind==='mtx'?'MX':'')+toIndex}`;
    }return null;
  }
  function sendPath(fromId,toId,key='level'){
    const base=sendBasePath(fromId,toId);if(!base)return null;
    const full=/^(ch|aux)-/.test(fromId)&&!toId.startsWith('main-');
    const suffix=({level:'lvl',on:'on',pre:full?'mode':'pre',mode:full?'mode':'pre',pan:full?'pan':null,panLink:full?'plink':null,followMute:full?'pon':null})[key];return suffix?base+'/'+suffix:null;
  }
  function send(state,from,to,create=false){
    const key=`${from}>${to}`;if(state.sends?.[key])return state.sends[key];
    let cache=sendDefaults.get(state);if(!cache){cache=new Map();sendDefaults.set(state,cache);}let result=cache.get(key);
    if(!result&&Model){let view=state;if(state.values){view=sendViews.get(state);if(!view){view={inputs:list(state).filter(s=>['CH','AUX'].includes(s.kind)),outputs:list(state).filter(s=>!['CH','AUX'].includes(s.kind)),sends:state.sends||{}};sendViews.set(state,view);}}result=Model.getSend(view,from,to);}
    if(!result)result={level:-90,on:false,pre:true,pan:0,panLink:false,followMute:true,mode:'PRE'};
    if(!cache.has(key))cache.set(key,result);if(create){if(!state.sends)state.sends={};state.sends[key]={...result};return state.sends[key];}return result;
  }
  function setAssignment(state,id,position,value){
    const ch=channel(state,id);if(!ch)return;const match=/^FX(\d+)$/.exec(String(value)),slot=match?Number(match[1]):null,key=position+'Fx';
    const old=ch[key];if(old&&desk(state).fx?.[old-1]?.stripId===id)desk(state).fx[old-1].stripId=null;
    ch[key]=slot;
    if(slot&&desk(state).fx?.[slot-1]){
      const fx=desk(state).fx[slot-1];if(fx.stripId&&channel(state,fx.stripId)?.[fx.position+'Fx']===slot)channel(state,fx.stripId)[fx.position+'Fx']=null;
      fx.stripId=id;fx.position=position;fx.enabled=ch[position+'FxOn']!==false;
    }
  }
  function processorSpec(ctx,model){
    if(model===undefined)model=root.SculptDesk?.processor?.(ctx)?.model;
    let basePath;
    if(ctx?.type==='fx'&&Number.isInteger(Number(ctx.slot))&&ctx.slot>=1&&ctx.slot<=16)basePath=`/fx/${Number(ctx.slot)}`;
    else if(ctx?.type==='strip'&&stripPath(ctx.id)&&['eq','dyn','gate','filter'].includes(ctx.block)){
      if(['gate','filter'].includes(ctx.block)&&!ctx.id.startsWith('ch-'))return null;
      basePath=`${stripPath(ctx.id)}/${ctx.block==='filter'?'flt':ctx.block}`;
    }else return null;
    const definition=Cat?.get(ctx,model),params=definition?.parameters||[];
    const ambiguous=new Set(params.filter((p,i)=>params.some((q,j)=>i!==j&&q.sourceKey===p.sourceKey)).map(p=>p.key));
    return {basePath,modelPath:basePath+'/mdl',enabledPath:ctx.type==='fx'?undefined:basePath+'/'+(ctx.block==='filter'?'tf':'on'),mixPath:ctx.type==='fx'?basePath+'/fxmix':ctx.block==='filter'?undefined:basePath+'/mix',
      parameterPath(key){const p=params.find(p=>p.key===key);if(!p||ambiguous.has(key)||!/^[$A-Za-z0-9_-]+$/.test(p.sourceKey||p.key))return null;return basePath+'/'+(p.sourceKey||p.key);},
      ambiguousKeys:[...ambiguous],definition};
  }
  function membershipTags(state,id){
    const ch=channel(state,id),tags=String(ch?.tags||'').replace(/(?:^|\s|,)#D(?:1[0-6]|[1-9])(?=$|\s|,)/g,' ').replace(/\s+/g,' ').trim();
    const members=(desk(state).dca||[]).filter(g=>g.members?.includes(id)).map(g=>'#D'+g.id);
    return [tags,...members].filter(Boolean).join(' ').slice(0,80);
  }
  function applyTags(state,id,value){
    const ch=channel(state,id);if(!ch)return;ch.tags=String(value);
    const tags=new Set([...String(value).matchAll(/(?:^|\s|,)#D(1[0-6]|[1-9])(?=$|\s|,)/g)].map(m=>Number(m[1])));
    for(const g of desk(state).dca||[]){g.members=(g.members||[]).filter(v=>v!==id);if(tags.has(g.id))g.members.push(id);}
  }
  function makeEntries(state){
    const entries=[],byPath=new Map();
    function add(path,type,section,get,set,meta={}){if(!path||byPath.has(path))return;const e={path,type,section,get,set,...meta};entries.push(e);byPath.set(path,e);}
    function field(path,type,section,object,key,toWire=identity,fromWire=identity,meta={}){
      add(path,type,section,s=>{const target=object(s);return target&&target[key]!==undefined?canonicalWire(s,path,target[key],toWire,fromWire):undefined;},(s,v)=>{const target=object(s);if(target)target[key]=fromWire(v);},meta);
    }
    function linkedFields(id){
      const base=stripPath(id),input=/^(ch|aux)-/.test(id),obj=s=>strip(s,id);
      if(input)add(base+'/clink','integer','strip',s=>raw(s,base+'/clink'),()=>{}, {stripId:id});
      for(const [key,param,to,from]of [['name','name',v=>String(v).slice(0,16),String],['color','col',colorOut,colorIn]]){
        add(`${base}/${param}`,key==='name'?'string':'integer','strip',s=>{
          if(input&&flag(raw(s,base+'/clink')))return raw(s,`${base}/${param}`);
          return canonicalWire(s,`${base}/${param}`,obj(s)?.[key],to,from);
        },(s,v)=>{if(!input||!flag(raw(s,base+'/clink')))obj(s)[key]=from(v);},{stripId:id});
        add(`${base}/$${param}`,key==='name'?'string':'integer','core',s=>canonicalWire(s,`${base}/$${param}`,obj(s)?.[key],to,from),(s,v)=>{obj(s)[key]=from(v);},{stripId:id,readOnly:true});
      }
    }
    const all=list(state);
    for(const item of all){
      const id=item.id,base=stripPath(id);if(!base)continue;const kind=id.split('-')[0],input=['ch','aux'].includes(kind),ch=s=>channel(s,id),st=s=>strip(s,id),meta={stripId:id};
      field(base+'/fdr','float','core',st,'level',levelOut,levelIn,meta);field(base+'/mute','integer','core',st,'mute',bool,flag,meta);field(base+'/pan','float','core',st,'pan',Number,Number,meta);linkedFields(id);
      field(base+'/$solo','integer','core',ch,'solo',bool,flag,meta);field(base+'/wid','float','strip',ch,'width',Number,Number,meta);field(base+'/mon','string','strip',ch,'monitor',String,String,meta);
      if(input)field(base+'/solosafe','integer','strip',ch,'soloSafe',bool,flag,meta);
      field(base+'/in/set/trim','float','strip',st,'trim',Number,Number,meta);field(base+'/in/set/inv','integer','strip',st,'polarity',bool,flag,meta);field(base+'/in/set/bal','float','strip',ch,'balance',Number,Number,meta);
      add(base+'/tags','string','groups',s=>membershipTags(s,id),(s,v)=>applyTags(s,id,v),meta);
      if(input){
        field(base+'/in/set/$mode','string','strip',ch,'mode',String,String,{...meta,readOnly:true});
        field(base+'/in/set/srcauto','integer','routing',ch,'sourceAuto',bool,flag,meta);field(base+'/in/set/altsrc','integer','routing',ch,'useAlt',bool,flag,meta);
        for(const [key,groupKey,indexKey]of [['source','grp','in'],['altSource','altgrp','altin']]){
          const gp=base+'/in/conn/'+groupKey,ip=base+'/in/conn/'+indexKey;
          add(gp,'string','routing',s=>{const p=sourceParts(ch(s)?.[key]);return SOURCE_GROUPS.has(p.group)?p.group:undefined;},(s,v)=>{const current=sourceParts(ch(s)[key]),index=raw(s,ip)??(STEREO_GROUPS.has(current.group)?current.index*2-1:current.index);ch(s)[key]=sourceId(String(v),STEREO_GROUPS.has(String(v))?Math.ceil(index/2):index);},meta);
          add(ip,'integer','routing',s=>{const p=sourceParts(ch(s)?.[key]);const old=raw(s,ip);if(STEREO_GROUPS.has(p.group)&&Number.isFinite(old)&&Math.ceil(old/2)===p.index)return old;return SOURCE_GROUPS.has(p.group)?STEREO_GROUPS.has(p.group)?p.index*2-1:p.index:undefined;},(s,v)=>{const group=String(raw(s,gp)??sourceParts(ch(s)[key]).group);ch(s)[key]=sourceId(group,STEREO_GROUPS.has(group)?Math.ceil(Number(v)/2):Number(v));},meta);
        }
      }else field(base+'/busmono','integer','strip',ch,'mode',v=>v==='M'?1:0,v=>flag(v)?'M':'ST',meta);
      const delayBase=input?base+'/in/set':base+'/dly';
      field(delayBase+'/'+(input?'dlymode':'mode'),'string','strip',ch,'delayUnit',String,String,meta);
      field(delayBase+'/dly','float','strip',ch,'delay',Number,Number,meta);field(delayBase+'/'+(input?'dlyon':'on'),'integer','strip',ch,'delayOn',bool,flag,meta);
      if(kind==='ch'){
        for(const [key,param,type,to,from]of [['lowCutOn','lc','integer',bool,flag],['highCutOn','hc','integer',bool,flag],['lowCut','lcf','float',Number,Number],['highCut','hcf','float',Number,Number],['lowSlope','lcs','string',String,Number],['highSlope','hcs','string',String,Number]])field(base+'/flt/'+param,type,'strip',ch,key,to,from,meta);
        field(base+'/ptap','string','strip',ch,'tap',String,String,meta);field(base+'/tapwid','float','strip',ch,'tapWidth',Number,Number,meta);
        field(base+'/proc','string','strip',ch,'order',v=>v.map(k=>({gate:'G',eq:'E',dyn:'D',insert:'I'})[k]).join(''),v=>String(v).split('').map(k=>({G:'gate',E:'eq',D:'dyn',I:'insert'})[k]),meta);
        field(base+'/peq/on','integer','strip',s=>ch(s)?.sendEQ,'enabled',bool,flag,meta);
        for(let band=1;band<=3;band++)for(const [key,suffix]of [['gain','g'],['freq','f'],['q','q']])field(`${base}/peq/${band}${suffix}`,'float','strip',s=>ch(s)?.sendEQ?.bands?.[band-1],key,Number,Number,meta);
      }
      for(const [stateKey,node]of kind==='ch'?[['gateSC','gatesc'],['dynSC','dynsc']]:[['dynSC','dynsc']]){
        for(const [key,param,type,to,from]of [['type','type','string',String,String],['frequency','f','float',Number,Number],['q','q','float',Number,Number],['source','src','string',String,String],['tap','tap','string',String,String],['listen','$solo','integer',bool,flag]])field(`${base}/${node}/${param}`,type,'strip',s=>ch(s)?.[stateKey],key,to,from,meta);
      }
      if(kind!=='aux')for(const [key,param,type,to,from]of [['type','type','string',String,String],['frequency','f','float',Number,Number],['depth','depth','float',Number,Number],['q','q','float',Number,Number],['listen','$solo','integer',bool,flag]])field(base+'/dynxo/'+param,type,'strip',s=>ch(s)?.dynCrossover,key,to,from,meta);
      for(const position of kind==='aux'?['pre']:['pre','post']){
        const ins=base+'/'+position+'ins',key=position+'Fx';
        add(ins+'/ins','string','routing',s=>ch(s)?.[key]?'FX'+ch(s)[key]:'NONE',(s,v)=>setAssignment(s,id,position,v),meta);
        add(ins+'/on','integer','routing',s=>{const slot=ch(s)?.[key];return bool(ch(s)?.[key+'On']!==false&&(!slot||desk(s).fx?.[slot-1]?.enabled!==false));},(s,v)=>{ch(s)[key+'On']=flag(v);const slot=ch(s)[key];if(slot&&desk(s).fx?.[slot-1])desk(s).fx[slot-1].enabled=flag(v);},meta);
      }
      if(kind==='ch'){
        add(base+'/postins/mode','string','groups',s=>desk(s).automix?.x?.channels?.includes(id)?'AUTO_X':desk(s).automix?.y?.channels?.includes(id)?'AUTO_Y':'FX',(s,v)=>{for(const g of Object.values(desk(s).automix||{}))g.channels=(g.channels||[]).filter(x=>x!==id);if(['AUTO_X','AUTO_Y'].includes(String(v))){const g=desk(s).automix?.[String(v).slice(-1).toLowerCase()];if(g)g.channels.push(id);setAssignment(s,id,'post','NONE');}},meta);
        add(base+'/postins/w','float','groups',s=>{const g=['x','y'].find(k=>desk(s).automix?.[k]?.channels?.includes(id));return g?Number(desk(s).automix[g].weights?.[id]||0):raw(s,base+'/postins/w');},(s,v)=>{for(const g of Object.values(desk(s).automix||{}))if(g.channels?.includes(id)){if(!g.weights)g.weights={};g.weights[id]=Number(v);}},meta);
      }
      for(const target of all){
        const path=sendBasePath(id,target.id);if(!path)continue;const smeta={stripId:id,targetId:target.id};
        const sendField=(suffix,key,type,to,from)=>add(path+'/'+suffix,type,'sends',s=>canonicalWire(s,path+'/'+suffix,send(s,id,target.id)[key],to,from),(s,v)=>{send(s,id,target.id,true)[key]=from(v);},smeta);
        for(const [key,suffix,type,to,from]of [['level','lvl','float',levelOut,levelIn],['on','on','integer',bool,flag]])sendField(suffix,key,type,to,from);
        const full=input&&target.kind!=='MAIN';
        if(full){
          add(path+'/mode','string','sends',s=>send(s,id,target.id).mode||(send(s,id,target.id).pre?'PRE':'POST'),(s,v)=>{const x=send(s,id,target.id,true);x.mode=String(v);x.pre=v==='PRE';},smeta);
          sendField('pon','followMute','integer',v=>v?0:1,v=>!flag(v));
          sendField('pan','pan','float',Number,Number);
          sendField('plink','panLink','integer',bool,flag);
        }else add(path+'/pre','integer','sends',s=>bool(send(s,id,target.id).pre),(s,v)=>{const x=send(s,id,target.id,true);x.pre=flag(v);x.mode=x.pre?'PRE':'POST';},smeta);
      }
    }
    const contexts=[];
    for(const item of all)for(const block of Object.keys(desk(state).processing?.[item.id]||{}))contexts.push({type:'strip',id:item.id,block});
    for(let slot=1;slot<=16;slot++)contexts.push({type:'fx',slot});
    for(const ctx of contexts){
      const proc=processor(state,ctx),spec=processorSpec(ctx,proc?.model);if(!proc||!spec)continue;const obj=s=>processor(s,ctx),meta={processor:{...ctx},stripId:ctx.id,model:proc.model};
      add(spec.modelPath,'string','processing',s=>obj(s)?.model,(s,v)=>{const p=obj(s);if(p.model!==String(v)){p.model=String(v);p.params={};}},meta);
      if(spec.enabledPath)field(spec.enabledPath,'integer','processing',obj,'enabled',bool,flag,meta);
      if(spec.mixPath)add(spec.mixPath,'float','processing',s=>{const p=obj(s),old=raw(s,spec.mixPath);if(ctx.type!=='fx'&&p?.params?.mix!==undefined&&p.params.mix!==old)return Number(p.params.mix);return p?.mix;},(s,v)=>{const p=obj(s);p.mix=Number(v);if(ctx.type!=='fx')p.params.mix=Number(v);},meta);
      for(const p of spec.definition?.parameters||[]){
        const path=spec.parameterPath(p.key);if(!path||path===spec.mixPath)continue;
        field(path,p.type==='enum'?'string':p.type==='boolean'?'integer':'float','processing',s=>obj(s)?.params,p.key,p.type==='enum'?String:Number,p.type==='enum'?String:Number,{...meta,parameter:p.key,trigger:p.key==='load'});
      }
    }
    for(const [id,item]of Object.entries(desk(state).sources||{})){
      const base=sourcePath(id);if(!base)continue;const group=sourceParts(id).group,obj=s=>source(s,id),meta={sourceId:id};
      for(const [key,param,type,to,from]of [['mode','mode','string',String,String],['mute','mute','integer',bool,flag],['polarity','pol','integer',bool,flag]]){
        if(group==='OSC'&&key==='polarity')continue;
        field(base+'/'+param,type,'io',obj,key,to,from,{...meta,readOnly:group==='OSC'&&key==='mode'});
      }
      for(const [key,param,to,from]of [['name','name',v=>String(v).slice(0,16),String],['color','col',colorOut,colorIn]])add(base+'/'+param,key==='name'?'string':'integer','io',s=>canonicalWire(s,base+'/'+param,sourcePresentation(s,id,key),to,from),(s,v)=>updatePresentation(s,id,key,from(v)),meta);
      field(base+'/tags','string','io',obj,'tags',v=>String(v).slice(0,80),String,meta);
      if(['LCL','A','B','C','SC'].includes(group)){
        field(base+'/g','float','io',obj,'gain',Number,Number,meta);field(base+'/vph','integer','io',obj,'phantom',bool,flag,meta);
        field(base+'/rmt','string','io',obj,'remote',String,String,meta);field(base+'/rcvc','integer','io',obj,'receiveCustom',bool,flag,meta);
      }
    }
    field('/io/altsw','integer','routing',s=>desk(s).io,'globalAlt',bool,flag);
    field('/io/autoaltovr','integer','routing',s=>desk(s).io,'autoAlt',bool,flag);
    for(const [id,item]of Object.entries(desk(state).outputs||{})){
      const group=sourceParts(id).group,index=sourceParts(id).index;if(!OUTPUT_GROUPS[group]||index>OUTPUT_GROUPS[group])continue;
      const base=`/io/out/${group}/${index}`,obj=s=>desk(s).outputs?.[id],meta={outputId:id};
      add(base+'/grp','string','io',s=>{const p=sourceParts(obj(s)?.source);return OUTPUT_SOURCES.has(p.group)?p.group:undefined;},(s,v)=>{const prev=sourceParts(obj(s).source),index=raw(s,base+'/in')??prev.index;obj(s).source=sourceId(String(v),STEREO_GROUPS.has(String(v))?Math.ceil(index/2):index);if(STEREO_GROUPS.has(String(v)))obj(s).side=index%2?'L':'R';},meta);
      add(base+'/in','integer','io',s=>{const p=sourceParts(obj(s)?.source);if(!OUTPUT_SOURCES.has(p.group))return undefined;return STEREO_GROUPS.has(p.group)?p.index*2-(obj(s)?.side==='R'?0:1):p.index;},(s,v)=>{const group=String(raw(s,base+'/grp')??sourceParts(obj(s).source).group);obj(s).source=sourceId(group,STEREO_GROUPS.has(group)?Math.ceil(Number(v)/2):Number(v));if(STEREO_GROUPS.has(group))obj(s).side=Number(v)%2?'L':'R';},meta);
    }
    for(const user of desk(state).users||[]){
      const n=Number(user.id);if(n<1||n>56)continue;const base=`/io/in/USR/${n}/user`,obj=s=>desk(s).users.find(u=>u.id===n),signal=n<=24,meta={userId:n};
      const userGroup=value=>{let group=sourceParts(value).group;if(group==='AUXP')group='AUX';return (signal?['OFF','CH','AUX','BUS','MAIN','MTX']:['OFF','LCL','AUX','A','B','C','SC','USB','CRD','MOD','PLAY','AES']).includes(group)?group:undefined;};
      add(base+'/grp','string','io',s=>userGroup(obj(s)?.source),(s,v)=>{const p=sourceParts(obj(s).source);obj(s).source=sourceId(signal&&v==='AUX'?'AUXP':String(v),raw(s,base+'/in')??p.index);},meta);
      add(base+'/in','integer','io',s=>userGroup(obj(s)?.source)===undefined?undefined:sourceParts(obj(s).source).index,(s,v)=>{const group=String(raw(s,base+'/grp')??userGroup(obj(s).source));obj(s).source=sourceId(signal&&group==='AUX'?'AUXP':group,Number(v));},meta);
      if(signal){field(base+'/tap','string','io',obj,'tap',String,String,meta);field(base+'/lr','string','io',obj,'side',String,String,meta);}
    }
    for(const group of desk(state).dca||[]){const i=group.id,obj=s=>desk(s).dca.find(g=>g.id===i);field(`/dca/${i}/fdr`,'float','groups',obj,'level',levelOut,levelIn);field(`/dca/${i}/mute`,'integer','groups',obj,'mute',bool,flag);field(`/dca/${i}/$solo`,'integer','groups',obj,'solo',bool,flag);field(`/dca/${i}/name`,'string','groups',obj,'name',v=>String(v).slice(0,8),String);}
    for(const group of desk(state).muteGroups||[]){const i=group.id,obj=s=>desk(s).muteGroups.find(g=>g.id===i);field(`/mgrp/${i}/mute`,'integer','groups',obj,'on',bool,flag);field(`/mgrp/${i}/name`,'string','groups',obj,'name',v=>String(v).slice(0,8),String);}
    for(const key of ['x','y'])field('/cfg/amix/'+key,'integer','groups',s=>desk(s).automix?.[key],'enabled',bool,flag);
    for(let index=0;index<2;index++){
      const base=`/cfg/mon/${index+1}`,obj=s=>desk(s).monitor?.[index];
      for(const [key,param,type,to,from]of [['level','lvl','float',levelOut,levelIn],['pan','pan','float',Number,Number],['width','wid','float',Number,Number],['polarity','inv','integer',bool,flag],['dimLevel','dim','float',v=>Math.abs(Number(v)),v=>-Math.abs(Number(v))],['eqOn','eq/on','integer',bool,flag],['delayOn','dly/on','integer',bool,flag]])field(base+'/'+param,type,'monitor',obj,key,to,from);
      field(base+'/lim','float','monitor',obj,'limit',Number,Number);
      field(base+'/src','string','monitor',obj,'source',v=>v==='OFF'||v==='off'?'OFF':String(v).replace(/[:-]/,'.').toUpperCase(),v=>String(v).replace('.','-').toLowerCase());
      for(let b=0;b<8;b++)field(base+'/eq/'+(b===0?'lsg':b===7?'hsg':b+'g'),'float','monitor',s=>obj(s)?.eq,b,Number,Number);
      const osc=`/io/in/OSC/${index+1}/osc`,o=s=>desk(s).oscillators?.[index];
      field(osc+'/mode','string','monitor',o,'mode',String,String);field(osc+'/f','float','monitor',o,'frequency',Number,Number);field(osc+'/lvl','float','monitor',o,'level',Number,Number);
      // Oscillator enable is the source mute, not a nonexistent osc/on node.
      const mutePath=`/io/in/OSC/${index+1}/mute`,existing=byPath.get(mutePath);if(existing){existing.get=s=>bool(!o(s)?.on);existing.set=(s,v)=>{if(source(s,`OSC:${index+1}`))source(s,`OSC:${index+1}`).mute=flag(v);if(o(s))o(s).on=!flag(v);};}
    }
    for(const [key,param]of [['dim','$dim'],['mono','$mono'],['mute','mute']])add('/cfg/solo/'+param,'integer','monitor',s=>{
      const prev=raw(s,'/cfg/solo/'+param),m=desk(s).monitor||[];const changed=m.find(v=>v[key]!==undefined&&bool(v[key])!==prev);return changed?bool(changed[key]):prev??bool(m[0]?.[key]);
    },(s,v)=>{for(const m of desk(s).monitor||[])m[key]=flag(v);});
    field('/cfg/solo/chtap','string','monitor',s=>desk(s).solo,'mode',v=>['PFL','AFL'].includes(v)?v:undefined,v=>String(v));
    field('/cfg/talk/assign','string','monitor',s=>desk(s).talkback,'source',v=>v==='ch-40'?'CH40':v==='aux-8'?'AUX8':'OFF',v=>v==='CH40'?'ch-40':v==='AUX8'?'aux-8':'OFF');
    add('/cfg/talk/lvl','float','monitor',s=>{const prev=raw(s,'/cfg/talk/lvl'),t=desk(s).talkback||{};for(const key of ['a','b'])if(t[key]&&canonicalWire(s,'/cfg/talk/lvl',t[key].level,levelOut,levelIn)!==prev)return levelOut(t[key].level);return prev??levelOut(t.a?.level??-90);},(s,v)=>{for(const key of ['a','b'])if(desk(s).talkback?.[key])desk(s).talkback[key].level=levelIn(v);});
    for(const key of ['a','b']){
      const base='/cfg/talk/'+key.toUpperCase(),obj=s=>desk(s).talkback?.[key];field(base+'/$on','integer','monitor',obj,'on',bool,flag);field(base+'/mode','string','monitor',obj,'mode',String,String);
      for(const target of all.filter(s=>['BUS','MAIN','MTX'].includes(s.kind))){const short=target.kind==='BUS'?'B':target.kind==='MTX'?'MX':'M';add(base+'/'+short+target.number,'integer','monitor',s=>bool(obj(s)?.targets?.includes(target.id)),(s,v)=>{const t=obj(s);if(!t)return;t.targets=(t.targets||[]).filter(id=>id!==target.id);if(flag(v))t.targets.push(target.id);});}
    }
    return {entries,byPath};
  }
  function signature(state){return list(state).map(s=>s.id+':'+Object.entries(desk(state).processing?.[s.id]||{}).map(([b,p])=>b+'='+p.model).join(',')).join('|')+';'+(desk(state).fx||[]).map(p=>p.model).join('|')+';'+Object.keys(desk(state).sources||{}).join(',')+';'+Object.keys(desk(state).outputs||{}).join(',');}
  function registry(state){const key=signature(state);if(key!==cachedSignature){const result=makeEntries(state);cachedSignature=key;cachedEntries=result.entries;cachedByPath=result.byPath;}return {entries:cachedEntries,byPath:cachedByPath};}
  function capture(state){const result=new Map();for(const e of registry(state).entries){if(e.trigger)continue;const value=e.get(state);if(typeof value==='string'||typeof value==='number'&&Number.isFinite(value))result.set(e.path,value);}return result;}
  function apply(state,path,value){
    if(typeof value!=='string'&&!(typeof value==='number'&&Number.isFinite(value)))return false;
    const entry=registry(state).byPath.get(path);if(!entry)return false;
    if(['integer','float'].includes(entry.type)&&!Number.isFinite(Number(value)))return false;
    remember(state,path,value);entry.set(state,value);return true;
  }
  function descriptors(state){return registry(state).entries.map(({get,set,...meta})=>meta);}
  function readPaths(state,scope='core',args){
    if(scope==='processor'){const ctx=args?.ctx||args,spec=processorSpec(ctx,processor(state,ctx)?.model);return spec?[spec.basePath]:[];}
    if(scope==='strip'){
      const id=typeof args==='string'?args:args?.id,base=stripPath(id);if(!base)return [];
      return [...new Set(descriptors(state).filter(e=>e.stripId===id&&e.section!=='sends').map(e=>e.path.slice(0,e.path.lastIndexOf('/'))))];
    }
    if(scope==='io'){
      const direction=args?.direction||'in',group=args?.group,start=Math.max(1,Math.floor(args?.start||1)),limit=Math.max(1,Math.min(64,Math.floor(args?.count||64)));
      if(direction==='inputs')return ['/io',...list(state).filter(s=>['CH','AUX'].includes(s.kind)).slice(start-1,start-1+limit).flatMap(s=>[stripPath(s.id)+'/in/conn',stripPath(s.id)+'/in/set'])];
      if(group){const counts=direction==='out'?OUTPUT_GROUPS:INPUT_GROUPS,count=counts[group];if(!count)return [];const paths=[];for(let n=start;n<=Math.min(count,start+limit-1);n++){paths.push(`/io/${direction==='out'?'out':'in'}/${group}/${n}`);if(group==='USR'&&direction!=='out')paths.push(`/io/in/USR/${n}/user`);}return paths;}
      const paths=['/io'];
      for(const s of list(state).filter(s=>['CH','AUX'].includes(s.kind))){const base=stripPath(s.id);paths.push(base+'/in/conn',base+'/in/set');for(const id of [channel(state,s.id)?.source,channel(state,s.id)?.altSource])if(sourcePath(id))paths.push(sourcePath(id));}
      for(let n=1;n<=8;n++)paths.push('/io/out/LCL/'+n);return [...new Set(paths)];
    }
    if(scope==='source'){const id=typeof args==='string'?args:args?.id,path=sourcePath(id);if(path)return [path,...(String(id).startsWith('USR:')?[path+'/user']:String(id).startsWith('OSC:')?[path+'/osc']:[])];const parts=sourceParts(id),base=stripPath(parts.group.toLowerCase()+'-'+parts.index);return base?[base]:[];}
    if(scope==='inserts')return list(state).flatMap(s=>[stripPath(s.id)+'/preins',...(s.kind==='AUX'?[]:[stripPath(s.id)+'/postins'])]);
    if(scope==='groups')return [...Array.from({length:16},(_,i)=>'/dca/'+(i+1)),...Array.from({length:8},(_,i)=>'/mgrp/'+(i+1)),'/cfg/amix',...list(state).map(s=>stripPath(s.id)),...list(state).filter(s=>s.kind==='CH').map(s=>stripPath(s.id)+'/postins')];
    if(scope==='monitor')return ['/cfg/mon/1','/cfg/mon/1/eq','/cfg/mon/1/dly','/cfg/mon/2','/cfg/mon/2/eq','/cfg/mon/2/dly','/cfg/solo','/cfg/talk','/cfg/talk/A','/cfg/talk/B','/io/in/OSC/1','/io/in/OSC/1/osc','/io/in/OSC/2','/io/in/OSC/2/osc'];
    if(scope==='fx')return Array.from({length:16},(_,i)=>`/fx/${i+1}`);
    if(scope==='sends')return [...new Set(descriptors(state).filter(e=>e.section==='sends'&&(!args?.targetId||e.targetId===args.targetId)&&(!args?.fromId||e.stripId===args.fromId)).map(e=>e.path.slice(0,e.path.lastIndexOf('/'))))];
    return descriptors(state).filter(e=>scope==='all'||e.section===scope||scope==='core'&&(/\/(clink|name|col)$/.test(e.path)&&e.stripId)).map(e=>e.path);
  }
  const coverage={mapped:['76 strip fader/mute/pan/solo and source-linked names/colours','CH/AUX Main/Alt routing and physical preamp gain/phantom','BUS/MTX/MAIN sends with family-specific PRE/POST paths','All unambiguous catalog processor model/parameter paths','Channel filters, sidechains, pre-send EQ, insert assignment and delay','Physical I/O and USER signal/patch routing','DCA controls and #D tags; mute-group controls','Automix X/Y assignment and weight','Monitor level/source/EQ, shared solo dim/mono/mute, talkback and oscillator source parameters'],
    unmapped:['CMB duplicate peak parameters until live schema disambiguation','Mute-group membership (no assignment path verified)','Recorder transport and file/library/show operations','Network/audio setup, firmware, custom controls and hardware diagnostics','Monitor limiter switch, delay in milliseconds and unsupported solo preferences','Per-talkback destination levels and separate A/B level (WING has shared talk level)','Oscillator target convenience list (requires explicit source routing)','CH/AUX processed outputs directly (use USER SIGNAL first)','Arbitrary icon names; source digital trim; output tap without USER SIGNAL'],
    constraints:['A descriptor is a candidate, not permission: resolve it on the current firmware before reads/writes.','Do not send capture() wholesale; diff only loaded writable parameters changed by the user.','Model changes invalidate processor definitions and queued parameter gestures.','Read-only effective names/colours are never writable.','Never replay the demo snapshot when connecting or reconnecting.']};
  const API={capture,apply,descriptors,processorSpec,stripPath,sourcePath,sendPath,sendBasePath,readPaths,coverage,COLORS};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.SculptWingMap=API;
})(typeof window!=='undefined'?window:globalThis);
