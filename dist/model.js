(function(root){
  'use strict';
  const KEY='sculpt-control-interface-v3', LEGACY_KEY='sculpt-control-interface-v2';
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const channelNames=['Voce','Voce 2','Voce 3','Chitarra','Chit. ac.','Basso','Cassa','Rullante','Hi-hat','Tom 1','Tom 2','Timpano','OH L','OH R','Keys L','Keys R','Synth L','Synth R','Seq L','Seq R','Perc. 1','Perc. 2','Fiati 1','Fiati 2','Archi L','Archi R','Talkback','Amb. L','Amb. R','Playback','Input 31','Input 32','Input 33','Input 34','Input 35','Input 36','Input 37','Input 38','Input 39','Input 40'];
  const busNames=['Voce','Chitarra','Basso','Batteria','Tastiere','Percuss.','Side L','Side R','Monitor 9','Monitor 10','Monitor 11','Monitor 12','FX 1','FX 2','FX 3','FX 4'];
  const matrixNames=['Front L','Front R','Delay','Frontfill','Record L','Record R','Spare 7','Spare 8'];
  const auxNames=['Player L/R','USB L/R','FX Return 1','FX Return 2','FX Return 3','FX Return 4','Aux 7','Aux 8'];
  const channelLevels=[-4,-8,-10,-6,-9,-3,-2,-4,-13,-8,-9,-8,-12,-12,-6,-6,-9,-9,-7,-7,-10,-11,-8,-8,-7,-7,-90,-18,-18,-12];
  const busLevels=[-5,-7,-6,-4,-8,-9,-10,-10,-90,-90,-90,-90,-12,-14,-16,-16];
  const colors={CH:'#ef7277',AUX:'#d7a25d',BUS:'#ef414b',MTX:'#b28ac8',MAIN:'#e4c780'};
  const list=state=>[...state.outputs,...state.inputs];
  const find=(state,id)=>list(state).find(strip=>strip.id===id);
  const defaultName=strip=>`${strip.kind} ${strip.number}`;
  function makeStrip(kind,n,name,level,color){
    const frequencies=(kind==='CH'||kind==='AUX')?[60,180,600,1800,6000,12000]:[40,100,250,630,1600,4000,8000,14000];
    return {id:`${kind.toLowerCase()}-${n}`,kind,number:n,name,color:color||colors[kind],level,mute:false,pan:0,trim:0,polarity:false,hpfEnabled:false,hpf:80,
      eq:{enabled:true,bands:frequencies.map(freq=>({freq,gain:0,q:1}))},
      dynamics:{compEnabled:false,threshold:-18,ratio:3,attack:10,release:100,makeup:0,gateEnabled:false,gateThreshold:-45}};
  }
  function defaults(){
    return {version:3,outputs:[...busNames.map((name,i)=>makeStrip('BUS',i+1,name,busLevels[i])),...matrixNames.map((name,i)=>makeStrip('MTX',i+1,name,[-3,-3,-8,-10,-6,-6,-90,-90][i])),...['Master 1','Master 2','Master 3','Master 4'].map((name,i)=>makeStrip('MAIN',i+1,name,i? -90:0))],
      inputs:[...channelNames.map((name,i)=>makeStrip('CH',i+1,name,channelLevels[i]??-90,i<3?'#ef7277':i<6?'#a2bc8b':i<14?'#d7ad62':i<20?'#8c9dca':i<26?'#b28ac8':'#99959b')),...auxNames.map((name,i)=>makeStrip('AUX',i+1,name,i<2?-12:-90))],selected:'ch-1',meters:true,sof:null,sends:{}};
  }
  function canRoute(source,target){
    if(!source||!target||source.id===target.id)return false;
    if(source.kind==='CH'||source.kind==='AUX')return ['BUS','MTX','MAIN'].includes(target.kind);
    if(source.kind==='BUS')return ['BUS','MTX','MAIN'].includes(target.kind);
    return source.kind==='MAIN'&&target.kind==='MTX';
  }
  function patchStrip(strip,patch){
    if(!patch||typeof patch!=='object')return strip;
    const number=(key,min,max)=>{if(Number.isFinite(patch[key]))strip[key]=Math.round(clamp(patch[key],min,max)*10)/10;};
    number('level',-90,10);number('pan',-100,100);
    if(['CH','AUX'].includes(strip.kind)){number('trim',-18,18);if(typeof patch.polarity==='boolean')strip.polarity=patch.polarity;}
    if(strip.kind==='CH'){number('hpf',20,2000);if(typeof patch.hpfEnabled==='boolean')strip.hpfEnabled=patch.hpfEnabled;}
    if(typeof patch.name==='string')strip.name=patch.name.trim().slice(0,40)||defaultName(strip);
    if(typeof patch.color==='string'&&/^#[0-9a-f]{6}$/i.test(patch.color))strip.color=patch.color;
    if(typeof patch.mute==='boolean')strip.mute=patch.mute;
    if(patch.eq&&typeof patch.eq==='object'){
      if(typeof patch.eq.enabled==='boolean')strip.eq.enabled=patch.eq.enabled;
      if(Array.isArray(patch.eq.bands))strip.eq.bands=strip.eq.bands.map((band,i)=>{
        const p=patch.eq.bands[i];if(!p||typeof p!=='object')return band;
        return {freq:Number.isFinite(p.freq)?clamp(p.freq,20,20000):band.freq,gain:Number.isFinite(p.gain)?clamp(p.gain,-15,15):band.gain,q:Number.isFinite(p.q)?clamp(p.q,.3,16):band.q};
      });
    }
    if(patch.dynamics&&typeof patch.dynamics==='object'){
      const d=patch.dynamics;
      for(const [key,min,max] of [['threshold',-60,0],['ratio',1,20],['attack',.1,200],['release',10,3000],['makeup',-12,24]])if(Number.isFinite(d[key]))strip.dynamics[key]=clamp(d[key],min,max);
      if(typeof d.compEnabled==='boolean')strip.dynamics.compEnabled=d.compEnabled;
      if(strip.kind==='CH'){
        if(typeof d.gateEnabled==='boolean')strip.dynamics.gateEnabled=d.gateEnabled;
        if(Number.isFinite(d.gateThreshold))strip.dynamics.gateThreshold=clamp(d.gateThreshold,-80,0);
      }
    }
    return strip;
  }
  function getSend(state,sourceId,targetId){
    const source=find(state,sourceId),target=find(state,targetId);
    if(!canRoute(source,target))return null;
    const saved=state.sends[`${sourceId}>${targetId}`];
    if(saved)return {pan:0,panLink:true,tap:'PRE_FADER',followMute:true,mode:saved.pre?'PRE':'POST',...saved};
    // A small monitor mix makes SOF immediately explorable; new paths start off.
    const monitor=target.kind==='BUS'&&target.number<=6&&source.kind==='CH'&&source.number<=8;
    const program=target.kind==='MAIN'&&target.number===1&&['CH','AUX'].includes(source.kind);
    const matrix=target.kind==='MTX'&&target.number<=2&&source.kind==='MAIN'&&source.number===1;
    return {level:monitor?(source.number===target.number?0:-15):(program||matrix?0:-90),on:monitor||program||matrix,pre:target.kind==='BUS',pan:0,panLink:true,tap:'PRE_FADER',followMute:true,mode:target.kind==='BUS'?'PRE':'POST'};
  }
  function setSend(state,sourceId,targetId,patch){
    const send=getSend(state,sourceId,targetId);if(!send||!patch||typeof patch!=='object')return false;
    if(Number.isFinite(patch.level))send.level=Math.round(clamp(patch.level,-90,10)*10)/10;
    if(typeof patch.on==='boolean')send.on=patch.on;
    if(typeof patch.pre==='boolean'){send.pre=patch.pre;send.mode=patch.pre?'PRE':'POST';}
    if(Number.isFinite(patch.pan))send.pan=clamp(patch.pan,-100,100);
    if(typeof patch.panLink==='boolean')send.panLink=patch.panLink;
    if(typeof patch.followMute==='boolean')send.followMute=patch.followMute;
    if(['PRE','POST','GRP'].includes(patch.mode)){send.mode=patch.mode;send.pre=patch.mode==='PRE';}
    if(['IN','FILT','3','4','5','PFL','AFL','POST','BUS','DYN','EQ','INS2','PRE_EQ','POST_EQ','PRE_DYN','POST_DYN','PRE_FADER','POST_FADER','PRE','GRP'].includes(patch.tap))send.tap=patch.tap;
    state.sends[`${sourceId}>${targetId}`]=send;return true;
  }
  function setSof(state,targetId){
    if(targetId===null){state.sof=null;return true;}
    const target=find(state,targetId);
    if(!target||!['BUS','MTX'].includes(target.kind))return false;
    state.sof=targetId;return true;
  }
  function display(state,sourceId){
    const source=find(state,sourceId),send=state.sof?getSend(state,sourceId,state.sof):null;
    return send?{level:send.level,on:send.on,send:true,targetId:state.sof}:{level:source.level,on:!source.mute,send:false,targetId:null};
  }
  function serialize(state){return {version:3,selected:state.selected,meters:state.meters,values:Object.fromEntries(list(state).map(strip=>[strip.id,strip])),sends:state.sends,...(state.desk?{desk:state.desk}:{})};}
  function restore(saved,legacy){
    const state=defaults();
    if(saved?.version===3&&saved.values&&typeof saved.values==='object'){
      for(const strip of list(state))patchStrip(strip,saved.values[strip.id]);
      if(find(state,saved.selected))state.selected=saved.selected;
      if(typeof saved.meters==='boolean')state.meters=saved.meters;
      if(saved.sends&&typeof saved.sends==='object')for(const [key,value]of Object.entries(saved.sends)){const [source,target]=key.split('>');setSend(state,source,target,value);}
      if(saved.desk&&typeof saved.desk==='object'&&!Array.isArray(saved.desk))state.desk=saved.desk;
    }else if(legacy?.version===2){
      for(const strip of list(state)){
        const oldId=strip.kind==='BUS'?`aux-${strip.number}`:strip.kind==='AUX'||strip.kind==='MAIN'?null:strip.id;
        if(oldId)patchStrip(strip,legacy.values?.[oldId]);
      }
      const selected=typeof legacy.selected==='string'?legacy.selected.replace(/^aux-/,'bus-'):null;
      if(find(state,selected))state.selected=selected;
      if(typeof legacy.meters==='boolean')state.meters=legacy.meters;
    }
    return state;
  }
  const API={KEY,LEGACY_KEY,defaults,list,find,defaultName,canRoute,patchStrip,getSend,setSend,setSof,display,serialize,restore,clamp};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.SculptModel=API;
})(typeof window!=='undefined'?window:globalThis);
