/* Editable channel-list proposals. Only explicit identity, mute, fader and
 * selected monitor-send fields enter the offline project. I/O stays untouched. */
(function(root){
  'use strict';
  const Model=typeof module!=='undefined'&&module.exports?require('./model.js'):root.SculptModel;
  const MAX_NAME=16,GRAY='#89949c',ROW_FIELDS=['name','color','mute','level'],BUS_FIELDS=['name','color'],SEND_FIELDS=['on','level','mode','pre','followMute'];
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const clean=value=>String(value??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
  const fold=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function instrumentLabel(value){
    return fold(value).replace(/^(?:(?:iem|monitor|mon|wedge|mix)\s*\d*[\s:._-]*)+/,'').replace(/[._·-]+/g,' ').replace(/\b(batteria|batterista|drum|drums|drummer)\b/g,'drums').replace(/\b(basso|bassista|bass)\b/g,'bass').replace(/\b(keyboard|keyboards|key|keys|tastiera|tastiere|tastierista)\b/g,'keys').replace(/\b(chitarra|chitarre|gtr|guitars|guitar|chitarrista)\b/g,'guitar').replace(/\b(voce|vocal|vocals|vox)\b/g,'vocal').replace(/\s+/g,' ').trim();
  }
  const inputId=id=>/^(?:ch-(?:[1-9]|[1-3]\d|40)|aux-[1-8])$/.test(String(id||''));
  const busId=id=>/^bus-(?:[1-9]|1[0-6])$/.test(String(id||''));
  const label=id=>String(id||'').toUpperCase().replace('-',' ');
  const strips=state=>state?.values?Object.values(state.values):[...(state?.inputs||[]),...(state?.outputs||[])];
  const stripMap=state=>new Map(strips(state).map(strip=>[strip.id,strip]));
  function view(state){return state?.values?{inputs:strips(state).filter(s=>['CH','AUX'].includes(s.kind)),outputs:strips(state).filter(s=>!['CH','AUX'].includes(s.kind)),sends:state.sends||{}}:state;}
  function effectiveSend(state,sourceId,targetId){return Model.getSend(view(state),sourceId,targetId);}
  const defaultSend=primary=>({on:true,level:primary?-5:-8,mode:primary?'PRE':'POST',followMute:true});
  const defaultRemaining=strip=>({targetId:strip.id,initialize:false,name:label(strip.id),color:GRAY,mute:true,level:-90});
  const nameFor=(row,index)=>clean(row.instrumentName||row.originalName||row.name)||'Monitor '+(index+1);
  const instrumentFor=(row,index)=>clean(row.instrumentKey)||'row:'+(row.id||index);
  const unique=values=>[...new Set(values)];

  function prepareDraft(parsed,state){
    const rows=(parsed?.rows||[]).map((row,index)=>({...clone(row),id:clean(row.id)||'channel-list-'+index,instrumentKey:instrumentFor(row,index),instrumentName:nameFor(row,index),mute:true,level:-90,primaryBusId:'',sends:{}}));
    const groups=new Map();
    rows.filter(row=>row.selected).forEach((row,index)=>{if(!groups.has(row.instrumentKey))groups.set(row.instrumentKey,{key:row.instrumentKey,name:nameFor(row,index),color:row.color,rows:[]});groups.get(row.instrumentKey).rows.push(row);});
    const proposed=Array.isArray(parsed?.monitors)?parsed.monitors:[],monitors=[],used=new Set(),warnings=[...(parsed?.warnings||[])];
    if(proposed.length){
      for(const [index,monitor]of proposed.entries()){
        if(index>=16){warnings.push('Il PDF propone più di 16 monitor: scegli come condividerli nei 16 BUS disponibili.');break;}
        const available=Array.from({length:16},(_,i)=>'bus-'+(i+1)).find(id=>!used.has(id));
        const target=busId(monitor.busId)&&!used.has(monitor.busId)?monitor.busId:available;used.add(target);
        monitors.push({...clone(monitor),id:clean(monitor.id)||'monitor-'+(index+1),busId:target,name:clean(monitor.name||monitor.instrumentName||'Monitor '+(index+1)).slice(0,MAX_NAME),color:/^#[0-9a-f]{6}$/i.test(monitor.color||'')?monitor.color:GRAY,applyIdentity:monitor.applyIdentity!==false});
      }
      const ordered=[...groups.values()];
      ordered.forEach(group=>{
        const row=group.rows[0];
        const matches=monitors.filter(m=>(m.instrumentKey&&m.instrumentKey===group.key)||(row.monitorNumber!==undefined&&(String(m.number??m.sourceNumber)===String(row.monitorNumber)||m.sourceNumbers?.map(String).includes(String(row.monitorNumber))))||(row.monitorName&&instrumentLabel(m.originalName||m.name)===instrumentLabel(row.monitorName))||(Array.isArray(m.channelNumbers)&&group.rows.some(r=>m.channelNumbers.map(String).includes(String(r.sourceNumber))))||[m.instrumentName,m.originalName,m.name].some(name=>name&&instrumentLabel(name)===instrumentLabel(group.name)));
        const monitor=matches.length===1?matches[0]:null;
        if(monitor){for(const member of group.rows)member.primaryBusId=monitor.busId;if(monitor.color===GRAY&&/^#[0-9a-f]{6}$/i.test(group.color||''))monitor.color=group.color;}
        else warnings.push('Il PDF non indica un monitor univoco per '+group.name+': l’abbinamento richiede una scelta manuale.');
      });
    }else{
      for(const [index,group]of [...groups.values()].entries()){
        if(index>=16)continue;
        const target='bus-'+(index+1);
        monitors.push({id:'monitor-'+(index+1),busId:target,name:group.name.slice(0,MAX_NAME),color:/^#[0-9a-f]{6}$/i.test(group.color||'')?group.color:GRAY,applyIdentity:true});
        for(const row of group.rows)row.primaryBusId=target;
      }
      if(groups.size>16)warnings.push('Sono stati riconosciuti più di 16 strumenti: assegna manualmente i bus principali condivisi.');
    }
    const draft={rows,monitors,remainingMode:'keep',remaining:[],warnings:unique(warnings)};
    syncDraft(draft,state);return draft;
  }

  function syncDraft(draft,state){
    if(!Array.isArray(draft.rows))draft.rows=[];
    if(!Array.isArray(draft.monitors))draft.monitors=[];
    const buses=new Set(draft.monitors.map(m=>m.busId).filter(busId));
    for(const [index,row]of draft.rows.entries()){
      if(!row.id)row.id='channel-list-'+index;
      if(!row.instrumentKey)row.instrumentKey=instrumentFor(row,index);
      if(row.instrumentName===undefined)row.instrumentName=nameFor(row,index);
      if(row.mute===undefined)row.mute=true;
      if(row.level===undefined)row.level=-90;
      if(row.primaryBusId===undefined)row.primaryBusId='';
      if(row.primaryBusId&&!buses.has(row.primaryBusId))row.primaryBusId='';
      if(!row.sends||typeof row.sends!=='object'||Array.isArray(row.sends))row.sends={};
      for(const target of Object.keys(row.sends))if(!buses.has(target))delete row.sends[target];
      for(const target of buses){if(!own(row.sends,target))row.sends[target]=defaultSend(target===row.primaryBusId);else if(row.sends[target]&&row.sends[target].followMute===undefined)row.sends[target].followMute=true;}
    }
    const old=new Map((draft.remaining||[]).map(row=>[row.targetId,row])),imported=new Set(draft.rows.filter(row=>row.selected&&inputId(row.targetId)).map(row=>row.targetId));
    draft.remaining=strips(state).filter(strip=>inputId(strip.id)&&['CH','AUX'].includes(strip.kind)&&!imported.has(strip.id)).map(strip=>old.get(strip.id)||{...defaultRemaining(strip),initialize:draft.remainingMode==='initialize'});
    if(!['keep','initialize'].includes(draft.remainingMode))draft.remainingMode='keep';
    if(!Array.isArray(draft.warnings))draft.warnings=[];
    return draft;
  }

  function setPrimary(draft,rowId,target){
    const row=draft.rows?.find(item=>item.id===rowId);
    if(!row)return {ok:false,message:'Riga non disponibile.'};
    if(target&&!draft.monitors?.some(m=>m.busId===target))return {ok:false,message:'Scegli uno dei monitor assegnati.'};
    const previous=row.primaryBusId;if(previous===target)return {ok:true,changed:false};
    row.sends=row.sends||{};
    if(previous&&row.sends[previous])Object.assign(row.sends[previous],{level:-8,mode:'POST'});
    row.primaryBusId=target;
    if(target)row.sends[target]={...defaultSend(true),...(row.sends[target]||{}),level:-5,mode:'PRE'};
    return {ok:true,changed:true};
  }

  function setMonitorBus(draft,monitorId,target){
    const monitor=draft.monitors?.find(item=>item.id===monitorId);
    if(!monitor)return {ok:false,message:'Monitor non disponibile.'};
    if(!busId(target))return {ok:false,message:'Scegli un BUS da 1 a 16.'};
    if(draft.monitors.some(item=>item!==monitor&&item.busId===target))return {ok:false,message:label(target)+' è già assegnato a un altro monitor.'};
    const previous=monitor.busId;if(previous===target)return {ok:true,changed:false};
    monitor.busId=target;
    for(const row of draft.rows||[]){
      if(row.primaryBusId===previous)row.primaryBusId=target;
      row.sends=row.sends||{};
      if(own(row.sends,previous)){row.sends[target]=row.sends[previous];delete row.sends[previous];}
      else row.sends[target]=defaultSend(row.primaryBusId===target);
    }
    return {ok:true,changed:true};
  }

  function changeRemainingMode(draft,mode,state){
    if(!['keep','initialize'].includes(mode))return {ok:false,message:'Scelta dei canali rimanenti non valida.'};
    syncDraft(draft,state);draft.remainingMode=mode;
    if(mode==='initialize')for(const row of draft.remaining)row.initialize=true;
    return {ok:true};
  }

  function validateDraft(draft,state){
    const errors=[],warnings=unique(draft?.warnings||[]),rowErrors={},monitorErrors={},remainingErrors={},byId=stripMap(state),selected=(draft?.rows||[]).filter(row=>row.selected),monitors=draft?.monitors||[],buses=new Set(),used=new Map(),ids=new Set();
    const add=(where,key,message)=>{errors.push(message);if(where)(where[key]||(where[key]=[])).push(message);};
    const identity=(row,where,key)=>{const name=clean(row.name);if(!name||name.length>MAX_NAME)add(where,key,'Il nome deve contenere da 1 a 16 caratteri.');if(!/^#[0-9a-f]{6}$/i.test(row.color||''))add(where,key,'Scegli un colore valido.');};
    const level=(value,where,key,title)=>{if(!Number.isFinite(value)||value< -90||value>10)add(where,key,title+': usa un livello da −90 (−∞) a +10 dB.');};
    if(!selected.length)add(null,null,'Seleziona almeno un canale da importare.');
    if((draft?.rows||[]).length>500)add(null,null,'La lista supera le 500 righe.');
    if(monitors.length>16)add(null,null,'Sono disponibili al massimo 16 monitor BUS distinti.');
    if(!['keep','initialize'].includes(draft?.remainingMode))add(null,null,'Scegli cosa fare dei canali rimanenti.');
    for(const monitor of monitors){
      if(!monitor.id||ids.has('monitor:'+monitor.id))add(monitorErrors,monitor.id,'Identificativo monitor duplicato o mancante.');ids.add('monitor:'+monitor.id);
      if(!busId(monitor.busId)||byId.get(monitor.busId)?.kind!=='BUS')add(monitorErrors,monitor.id,'Scegli un BUS disponibile da 1 a 16.');
      if(buses.has(monitor.busId))add(monitorErrors,monitor.id,label(monitor.busId)+' è assegnato a più monitor.');buses.add(monitor.busId);
      if(monitor.applyIdentity!==false)identity(monitor,monitorErrors,monitor.id);
    }
    let sendCount=0;
    for(const row of selected){
      if(!row.id||ids.has('row:'+row.id))add(rowErrors,row.id,'Identificativo riga duplicato o mancante.');ids.add('row:'+row.id);
      if(!inputId(row.targetId)||!['CH','AUX'].includes(byId.get(row.targetId)?.kind))add(rowErrors,row.id,'Scegli un ingresso CH 1–40 o AUX 1–8 disponibile.');
      if(used.has(row.targetId)){const message=label(row.targetId)+' è assegnato a più righe.';add(rowErrors,row.id,message);add(rowErrors,used.get(row.targetId),message);}else used.set(row.targetId,row.id);
      identity(row,rowErrors,row.id);level(row.level,rowErrors,row.id,'Fader');
      if(typeof row.mute!=='boolean')add(rowErrors,row.id,'Scegli lo stato mute del canale.');
      if(!busId(row.primaryBusId)||!buses.has(row.primaryBusId))add(rowErrors,row.id,'Assegna il monitor principale di '+clean(row.instrumentName||row.name||label(row.targetId))+' tra i BUS selezionati oppure aggiungi un monitor.');
      for(const monitor of monitors){
        const send=row.sends?.[monitor.busId];
        if(!send||typeof send!=='object'){add(rowErrors,row.id,'Manca la proposta di mandata verso '+label(monitor.busId)+'.');continue;}
        sendCount++;
        level(send.level,rowErrors,row.id,'Mandata a '+label(monitor.busId));
        if(typeof send.on!=='boolean')add(rowErrors,row.id,'Scegli ON/OFF per la mandata a '+label(monitor.busId)+'.');
        if(!['PRE','POST'].includes(send.mode))add(rowErrors,row.id,'Scegli PRE o POST per la mandata a '+label(monitor.busId)+'.');
        if(typeof send.followMute!=='boolean')add(rowErrors,row.id,'Scegli se la mandata a '+label(monitor.busId)+' segue il mute.');
        if(send.on&&send.followMute===false)warnings.push(label(row.targetId)+' → '+label(monitor.busId)+' non segue il mute del canale.');
        const tap=state?.desk?.channels?.[row.targetId]?.tap;
        if(send.on&&send.mode==='PRE'&&row.targetId?.startsWith('ch-')&&['AFL','POST','POST_FADER'].includes(tap))add(rowErrors,row.id,label(row.targetId)+' usa il tap condiviso '+tap+': la mandata PRE seguirebbe il fader. Scegli POST nell’anteprima oppure imposta prima un tap PRE nel canale. Il routing resta invariato.');
      }
    }
    let remainingCount=0;const remainingIds=new Set();
    if(draft?.remainingMode==='initialize')for(const row of draft.remaining||[]){
      if(!row.initialize)continue;remainingCount++;
      if(!inputId(row.targetId)||!['CH','AUX'].includes(byId.get(row.targetId)?.kind))add(remainingErrors,row.targetId,'Ingresso rimanente non disponibile.');
      if(used.has(row.targetId))add(remainingErrors,row.targetId,label(row.targetId)+' è già importato e non può essere inizializzato come rimanente.');
      if(remainingIds.has(row.targetId))add(remainingErrors,row.targetId,'Ingresso rimanente duplicato.');remainingIds.add(row.targetId);
      identity(row,remainingErrors,row.targetId);level(row.level,remainingErrors,row.targetId,'Fader');
      if(typeof row.mute!=='boolean')add(remainingErrors,row.targetId,'Scegli lo stato mute del canale rimanente.');
    }
    return {ok:!errors.length,errors:unique(errors),warnings:unique(warnings),rowErrors,monitorErrors,remainingErrors,selectedCount:selected.length,excludedCount:(draft?.rows||[]).length-selected.length,remainingCount,monitorCount:monitors.filter(m=>m.applyIdentity!==false).length,sendCount};
  }

  function planDraft(draft,state){
    const validation=validateDraft(draft,state),operations=[],guards=[],byId=stripMap(state);
    if(!validation.ok)return {...validation,operations,guards,message:validation.errors[0]};
    function stripPatch(targetId,proposal,fields,source){
      const strip=byId.get(targetId),desired={},before={};
      for(const field of fields){desired[field]=field==='name'?clean(proposal[field]):field==='color'?proposal[field].toLowerCase():field==='level'?Math.round(proposal[field]*10)/10:proposal[field];before[field]=clone(strip[field]);}
      guards.push({kind:'strip',targetId,fields:clone(before)});
      const patch=Object.fromEntries(fields.filter(field=>!equal(before[field],desired[field])).map(field=>[field,desired[field]]));
      if(Object.keys(patch).length)operations.push({kind:'strip',targetId,source,patch});
    }
    for(const row of draft.rows.filter(row=>row.selected)){
      stripPatch(row.targetId,row,ROW_FIELDS,'imported');
      for(const monitor of draft.monitors){
        const send=row.sends[monitor.busId],before=effectiveSend(state,row.targetId,monitor.busId),desired={on:send.on,level:Math.round(send.level*10)/10,mode:send.mode,pre:send.mode==='PRE',followMute:send.followMute};
        guards.push({kind:'send',sourceId:row.targetId,targetId:monitor.busId,fields:Object.fromEntries(SEND_FIELDS.map(field=>[field,clone(before[field])]))});
        const changed=SEND_FIELDS.filter(field=>!equal(before[field],desired[field]));
        if(changed.includes('mode')||changed.includes('pre')){if(!changed.includes('mode'))changed.push('mode');if(!changed.includes('pre'))changed.push('pre');}
        const patch=Object.fromEntries(changed.map(field=>[field,desired[field]]));
        if(changed.length)operations.push({kind:'send',sourceId:row.targetId,targetId:monitor.busId,patch});
      }
    }
    for(const monitor of draft.monitors)if(monitor.applyIdentity!==false)stripPatch(monitor.busId,monitor,BUS_FIELDS,'monitor');
    if(draft.remainingMode==='initialize')for(const row of draft.remaining)if(row.initialize)stripPatch(row.targetId,row,ROW_FIELDS,'remaining');
    return {...validation,operations,guards,message:operations.length?'':'I valori dell’anteprima sono già applicati.'};
  }

  const environment=env=>({controller:env?.controller||root.SculptController,model:env?.model||Model,live:env?.live||root.SculptLive});
  const isLive=env=>env.live?.isLive?.()===true||env.live?.canPersist?.()===false;
  function guardsMatch(guards,state){
    const byId=stripMap(state);
    return guards.every(guard=>{const value=guard.kind==='strip'?byId.get(guard.targetId):effectiveSend(state,guard.sourceId,guard.targetId);return value&&Object.entries(guard.fields).every(([field,before])=>equal(value[field],before));});
  }
  function applyDraft(draft,env){
    const e=environment(env);
    if(isLive(e))return {ok:false,message:'Passa alla demo offline per applicare la channel list.'};
    if(!e.controller?.getState||!e.controller?.transact||!e.model?.patchStrip)return {ok:false,message:'Il progetto locale non è disponibile.'};
    const plan=planDraft(draft,e.controller.getState());
    if(!plan.ok)return {...plan,ok:false};
    if(!plan.operations.length)return {...plan,ok:true,count:0,importedCount:0,undo:[],message:plan.message};
    let applied=false,undo=[];
    const accepted=e.controller.transact(state=>{
      if(isLive(e)||!validateDraft(draft,state).ok||!guardsMatch(plan.guards,state))return;
      const byId=stripMap(state),tokens=[];
      for(const operation of plan.operations){
        if(operation.kind==='strip'){
          const strip=byId.get(operation.targetId),fields=Object.keys(operation.patch),before=Object.fromEntries(fields.map(field=>[field,{exists:own(strip,field),value:clone(strip[field])}]));
          e.model.patchStrip(strip,operation.patch);
          tokens.push({kind:'strip',targetId:operation.targetId,before,after:Object.fromEntries(fields.map(field=>[field,clone(strip[field])]))});
        }else{
          const key=operation.sourceId+'>'+operation.targetId,existed=own(state.sends,key),before=existed?clone(state.sends[key]):undefined,effectiveBefore=clone(effectiveSend(state,operation.sourceId,operation.targetId));
          const after={...(existed?clone(state.sends[key]):effectiveBefore),...clone(operation.patch)};
          state.sends[key]=after;
          tokens.push({kind:'send',sourceId:operation.sourceId,targetId:operation.targetId,key,existed,before,effectiveBefore,fields:Object.keys(operation.patch),after:clone(after)});
        }
      }
      undo=tokens;applied=true;
    },'channel-list');
    if(accepted===false||!applied)return {ok:false,message:'Il progetto è cambiato. Controlla l’anteprima prima di applicare.'};
    return {ok:true,count:plan.selectedCount,importedCount:plan.selectedCount,remainingCount:plan.remainingCount,monitorCount:plan.monitorCount,sendCount:plan.sendCount,undo:clone(undo),message:plan.selectedCount+' ingressi importati, '+plan.sendCount+' mandate preparate'+(plan.remainingCount?', '+plan.remainingCount+' ingressi rimanenti inizializzati':'')+'. Routing conservato.'};
  }

  function undoDraft(tokens,env){
    const e=environment(env);
    if(isLive(e))return {ok:false,message:'Passa alla demo offline per annullare l’importazione.'};
    if(!Array.isArray(tokens)||!tokens.length)return {ok:false,message:'Nessuna importazione da annullare.'};
    if(!e.controller?.transact)return {ok:false,message:'Il progetto locale non è disponibile.'};
    let restored=false,conflict=false;
    const accepted=e.controller.transact(state=>{
      if(isLive(e))return;
      const byId=stripMap(state);
      for(const token of tokens){
        if(token.kind==='strip'){
          const strip=byId.get(token.targetId),allowed=inputId(token.targetId)?ROW_FIELDS:busId(token.targetId)?BUS_FIELDS:[];
          if(!strip||!token.after||!token.before||!Object.keys(token.after).length||Object.entries(token.after).some(([field,value])=>!allowed.includes(field)||!own(token.before,field)||typeof token.before[field]?.exists!=='boolean'||!equal(strip[field],value))){conflict=true;return;}
        }else if(token.kind==='send'){
          if(!inputId(token.sourceId)||!busId(token.targetId)||token.key!==token.sourceId+'>'+token.targetId||!token.after||!token.effectiveBefore||typeof token.existed!=='boolean'||token.existed&&!token.before||!Array.isArray(token.fields)||!token.fields.length||token.fields.some(field=>!SEND_FIELDS.includes(field))){conflict=true;return;}
          const current=effectiveSend(state,token.sourceId,token.targetId);
          if(!current||token.fields.some(field=>!equal(current[field],token.after[field]))){conflict=true;return;}
        }else{conflict=true;return;}
      }
      for(const token of tokens){
        if(token.kind==='strip'){
          const strip=byId.get(token.targetId);
          for(const field of Object.keys(token.after)){const previous=token.before[field];if(previous?.exists)strip[field]=clone(previous.value);else delete strip[field];}
        }else{
          const current=state.sends[token.key];
          if(equal(current,token.after)){
            if(token.existed)state.sends[token.key]=clone(token.before);else delete state.sends[token.key];
          }else{
            const next={...(current||effectiveSend(state,token.sourceId,token.targetId))};
            for(const field of token.fields){
              if(token.existed&&own(token.before,field))next[field]=clone(token.before[field]);
              else if(token.existed)delete next[field];
              else next[field]=clone(token.effectiveBefore[field]);
            }
            state.sends[token.key]=next;
          }
        }
      }
      restored=true;
    },'channel-list-undo');
    return accepted!==false&&restored?{ok:true,message:'Importazione annullata. Ripristinati solo i valori modificati; routing conservato.'}:{ok:false,message:conflict?'Alcuni valori sono cambiati dopo l’importazione: annullamento non applicato.':'Il progetto non è più disponibile offline.'};
  }
  const API={prepareDraft,syncDraft,setPrimary,setMonitorBus,changeRemainingMode,validateDraft,planDraft,applyDraft,undoDraft};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.SculptChannelScene=API;
})(typeof window!=='undefined'?window:globalThis);
