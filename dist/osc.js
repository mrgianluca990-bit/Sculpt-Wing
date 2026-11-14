(function(root){
  'use strict';
  const MAX_PACKET=16384,KEY='sculpt-wing-osc-v1';
  const SHOW_SOURCE='https://github.com/mrgianluca990-bit/Sculpt-Show/blob/cc10eb537b61720662b0482083be24b39f0c707d/Sources/SculptShowCore/OSCControlPacket.swift';
  const SHOW_PRESETS=Object.freeze([
    ['go','GO','global'],['stopAll','Stop All','global'],['pauseAll','Pausa tutte','global'],['resumeAll','Riprendi tutte','global'],['fadeAll','Fade All','global'],['next','Cue successiva','global'],['previous','Cue precedente','global'],['nextList','Lista successiva','global'],
    ['cueFire','Avvia cue','cue','fire'],['cueStop','Ferma cue','cue','stop'],['cuePause','Pausa cue','cue','pause'],['cueResume','Riprendi cue','cue','resume'],['cueFade','Fade cue','cue','fade'],['cueSelect','Seleziona cue','cue','select'],['cueLoopOn','Loop cue ON','cue','loop',true],['cueLoopOff','Loop cue OFF','cue','loop',false],
    ['listPlay','Avvia lista','list','play'],['listStop','Ferma lista','list','stop'],['listFade','Fade lista','list','fade'],['trigger','Avvia cue per alias','trigger']
  ].map(([id,label,kind,command,value])=>Object.freeze({id,label,kind,command,value})));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const utf8=text=>new TextEncoder().encode(text);
  function normalizeDestination(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Destinazione OSC non valida.');
    let host=typeof value.host==='string'?value.host.trim():'';
    if(host==='localhost')host='127.0.0.1';
    const parts=host.split('.');
    if(parts.length!==4||parts.some(part=>! /^(0|[1-9]\d{0,2})$/.test(part)||Number(part)>255)||Number(parts[0])===0||Number(parts[0])>=224||Number(parts[3])===255)throw new Error('Usa un indirizzo IPv4 unicast oppure localhost.');
    if(!['number','string'].includes(typeof value.port)||value.port===''||typeof value.port==='string'&&!/^\d{1,5}$/.test(value.port)||!Number.isInteger(Number(value.port))||Number(value.port)<1||Number(value.port)>65535)throw new Error('Porta OSC: usa un numero intero da 1 a 65535.');
    return {host,port:Number(value.port)};
  }
  function normalizeRequest(value){
    const destination=normalizeDestination(value),address=value.address;
    if(typeof address!=='string'||address.length>256||!address.startsWith('/')||address.length<2||! /^[\x21-\x7e]+$/.test(address)||/[ #*,?\[\]{}]/.test(address)||address.includes('//')||address.endsWith('/'))throw new Error('Percorso OSC non valido: usa un indirizzo letterale che inizia con /.');
    if(value.args!==undefined&&!Array.isArray(value.args)||value.args?.length>32)throw new Error('Massimo 32 argomenti OSC.');
    const args=(value.args||[]).map(arg=>{
      if(!arg||typeof arg!=='object'||Array.isArray(arg)||!['i','f','s','T','F'].includes(arg.type))throw new Error('Tipo OSC non supportato: usa int, float, stringa o booleano.');
      if(arg.type==='T'||arg.type==='F')return {type:arg.type};
      if(arg.type==='s'){
        if(typeof arg.value!=='string'||arg.value.length>4096||arg.value.includes('\0')||utf8(arg.value).length>4096)throw new Error('Stringa OSC non valida o troppo lunga.');
        return {type:'s',value:arg.value};
      }
      if(arg.value===''||arg.value===null||typeof arg.value==='boolean'||!['number','string'].includes(typeof arg.value)||typeof arg.value==='string'&&(arg.value.length>64||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(arg.value))||!Number.isFinite(Number(arg.value)))throw new Error('Valore OSC numerico non valido.');
      const number=Number(arg.value);
      if(arg.type==='i'&&(!Number.isInteger(number)||number< -2147483648||number>2147483647))throw new Error('Il valore OSC deve essere un intero a 32 bit.');
      if(arg.type==='f'&&!Number.isFinite(Math.fround(number)))throw new Error('Il valore OSC supera il limite float a 32 bit.');
      return {type:arg.type,value:arg.type==='f'?Math.fround(number):number};
    });
    if(value.expectReply!==undefined&&value.expectReply!==false&&value.expectReply!=='show-status')throw new Error('Richiesta di risposta OSC non valida.');
    const expectReply=value.expectReply==='show-status'?'show-status':false;
    if(expectReply&&(address!=='/sculpt/status'||args.length))throw new Error('La verifica Show deve usare /sculpt/status senza argomenti.');
    const request={...destination,address,args,expectReply};
    if(encodedSize(request)>MAX_PACKET)throw new Error('Il messaggio OSC supera 16 KB.');
    return request;
  }
  const paddedSize=text=>(utf8(text).length+4)&~3;
  function encodedSize(message){return paddedSize(message.address)+paddedSize(','+message.args.map(arg=>arg.type).join(''))+message.args.reduce((sum,arg)=>sum+(arg.type==='s'?paddedSize(arg.value):arg.type==='i'||arg.type==='f'?4:0),0);}
  function encode(value){
    const message=normalizeRequest(value),bytes=new Uint8Array(encodedSize(message)),view=new DataView(bytes.buffer);let cursor=0;
    const string=text=>{const encoded=utf8(text);bytes.set(encoded,cursor);cursor+=(encoded.length+4)&~3;};
    string(message.address);string(','+message.args.map(arg=>arg.type).join(''));
    for(const arg of message.args){if(arg.type==='s')string(arg.value);else if(arg.type==='i'){view.setInt32(cursor,arg.value,false);cursor+=4;}else if(arg.type==='f'){view.setFloat32(cursor,arg.value,false);cursor+=4;}}
    return bytes;
  }
  function showMessage(presetId,options={}){
    const preset=SHOW_PRESETS.find(item=>item.id===presetId);if(!preset)throw new Error('Comando Sculpt Show non disponibile.');
    if(preset.kind==='global')return {address:'/sculpt/'+preset.id,args:[]};
    if(preset.kind==='trigger'){
      const alias=String(options.alias||'').replace(/^\/sculpt\/trigger\//,'');
      if(!/^[A-Za-z0-9_.-]{1,64}$/.test(alias))throw new Error('Alias Show: usa da 1 a 64 lettere, numeri, punti, trattini o underscore.');
      return {address:'/sculpt/trigger/'+alias,args:[]};
    }
    const id=preset.kind==='cue'?options.cueId:options.listId;
    if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new Error('Incolla l’UUID '+(preset.kind==='cue'?'della cue':'della lista')+' mostrato nelle impostazioni OSC di Show.');
    return {address:'/sculpt/'+preset.kind+'/'+id+'/'+preset.command,args:preset.command==='loop'?[{type:preset.value?'T':'F'}]:[]};
  }
  function decodeShowReply(input){
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
    if(!bytes.length||bytes.length>MAX_PACKET||bytes.length%4)throw new Error('Risposta OSC Show non valida.');
    let cursor=0;
    const string=()=>{const start=cursor;while(cursor<bytes.length&&bytes[cursor]!==0)cursor++;if(cursor===bytes.length)throw new Error('Stringa OSC incompleta.');const end=cursor,next=(end+4)&~3;if(next>bytes.length||bytes.slice(end,next).some(value=>value!==0))throw new Error('Padding OSC non valido.');cursor=next;return new TextDecoder('utf-8',{fatal:true}).decode(bytes.slice(start,end));};
    const address=string(),tags=string();if(tags!==',s')throw new Error('Tipo risposta Show non valido.');const value=string();if(cursor!==bytes.length)throw new Error('Dati aggiuntivi nella risposta Show.');
    if(address==='/sculpt/error')throw new Error('Sculpt Show: '+value.slice(0,512));
    if(address!=='/sculpt/status')throw new Error('Risposta diversa da Sculpt Show status.');
    let data;try{data=JSON.parse(value);}catch{throw new Error('Stato Show non leggibile.');}
    if(!data||typeof data!=='object'||typeof data.show!=='string'||data.show.length>1024||typeof data.audioReady!=='boolean'||!Array.isArray(data.active)||data.active.length>1024||typeof data.selectedCue!=='string'||typeof data.selectedList!=='string')throw new Error('Stato Show incompleto.');
    return {show:data.show,selectedCue:data.selectedCue.slice(0,64),selectedList:data.selectedList.slice(0,64),activeCount:data.active.length,audioReady:data.audioReady};
  }
  const Pure={MAX_PACKET,SHOW_SOURCE,SHOW_PRESETS,normalizeDestination,normalizeRequest,encode,showMessage,decodeShowReply};
  if(typeof module!=='undefined'&&module.exports)module.exports=Pure;
  if(!root.document)return;
  let config={version:1,show:{host:'127.0.0.1',port:53000},custom:{host:'127.0.0.1',port:53000}},lastResult=null;
  try{const saved=JSON.parse(root.localStorage.getItem(KEY)||'null');if(saved?.version===1)config={version:1,show:normalizeDestination(saved.show),custom:normalizeDestination(saved.custom)};}catch{}
  const available=()=>root.SculptDesktop?.available===true&&typeof root.SculptDesktop.sendOSC==='function';
  function setDestination(profile,value){
    if(!['show','custom'].includes(profile))throw new Error('Profilo OSC non valido.');
    const next={...config,[profile]:normalizeDestination(value)};
    try{root.localStorage.setItem(KEY,JSON.stringify(next));}catch{throw new Error('Impossibile salvare la destinazione OSC su questo dispositivo.');}
    config=next;return clone(config[profile]);
  }
  function prepare(action){
    if(!available())throw new Error('L’invio OSC richiede l’app Sculpt Wing per Mac. Nel browser puoi preparare le assegnazioni.');
    if(!action||!['show','custom'].includes(action.profile))throw new Error('Scegli Sculpt Show oppure OSC personalizzato.');
    if(action.useGlobal!==undefined&&typeof action.useGlobal!=='boolean')throw new Error('Scelta della destinazione OSC non valida.');
    const destination=action.useGlobal===false?{host:action.host,port:action.port}:config[action.profile];
    const message=action.profile==='show'?showMessage(action.preset,action):{address:action.address,args:action.args};
    return normalizeRequest({...destination,...message});
  }
  async function sendPrepared(value){
    if(!available())throw new Error('Invio OSC disponibile nell’app Mac.');
    const request=normalizeRequest(value),result=await root.SculptDesktop.sendOSC(request);
    if(!result?.sent)throw new Error('Il trasporto desktop non ha confermato l’invio OSC.');
    if(request.expectReply==='show-status'&&(!result.confirmed||!result.status))throw new Error('Sculpt Show non ha risposto alla verifica.');
    lastResult={...result,time:Date.now()};return lastResult;
  }
  root.SculptOSC={...Pure,available,getConfig:()=>clone(config),setDestination,prepare,sendPrepared,send:action=>sendPrepared(prepare(action)),queryShow:()=>sendPrepared({...config.show,address:'/sculpt/status',args:[],expectReply:'show-status'}),lastResult:()=>lastResult&&clone(lastResult)};
})(typeof window!=='undefined'?window:globalThis);
