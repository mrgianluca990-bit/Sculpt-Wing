(() => {
  'use strict';
  const M=window.SculptModel;
  const readStorage=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
  const saved=readStorage(M.KEY),legacy=readStorage(M.LEGACY_KEY);
  const state=M.restore(saved,legacy);
  if(!saved&&!legacy)state.meters=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const elements=new Map(),subscribers=new Set(),bankUpdates=new Map(),bankObservers=new Map();let layerMembers=null,layerLayout=null,layerName='';
  const all=()=>M.list(state),stripById=id=>M.find(state,id),clamp=M.clamp;
  const format=(level,unit=false)=>level<=-89?'−∞'+(unit?' dB':''):(level>0?'+':'')+level.toFixed(1).replace('-','−')+(unit?' dB':'');
  const label=strip=>`${strip.kind} ${String(strip.number).padStart(2,'0')} · ${strip.name}`;
  const shortLabel=strip=>`${strip.kind==='MTX'?'MX':strip.kind==='BUS'?'B':strip.kind}${String(strip.number).padStart(2,'0')}`;
  const taper=[[0,-90],[.06,-60],[.2,-40],[.4,-20],[.6,-10],[.8,0],[1,10]];
  function interpolate(value,from,to){for(let i=1;i<taper.length;i++)if(value<=taper[i][from]){const a=taper[i-1],b=taper[i];return a[to]+(value-a[from])/(b[from]-a[from])*(b[to]-a[to]);}return taper.at(-1)[to];}
  const toPosition=db=>clamp(interpolate(db,1,0),0,1);
  const toDb=position=>{const raw=interpolate(clamp(position,0,1),0,1);return raw<=-89?-90:Math.round(raw*10)/10;};
  let storageWarning=false,saveTimer=null,savePending=false;
  function flushSave(){
    if(saveTimer!==null)clearTimeout(saveTimer);saveTimer=null;
    if(!savePending)return;savePending=false;
    if(window.SculptLive?.canPersist?.()===false)return;
    try{localStorage.setItem(M.KEY,JSON.stringify(M.serialize(state)));storageWarning=false;}catch{if(!storageWarning){storageWarning=true;setTimeout(()=>toast('Memoria locale piena: esporta il progetto per conservarlo.'),0);}}
  }
  function save(){if(window.SculptLive?.canPersist?.()===false)return;savePending=true;if(saveTimer===null)saveTimer=setTimeout(flushSave,180);}
  function reconcile(target,source){
    if(Array.isArray(target)&&Array.isArray(source)){while(target.length>source.length)target.pop();for(let i=0;i<source.length;i++){if(source[i]&&typeof source[i]==='object'&&target[i]&&typeof target[i]==='object'&&Array.isArray(source[i])===Array.isArray(target[i]))reconcile(target[i],source[i]);else target[i]=source[i];}return;}
    for(const key of Object.keys(target))if(!(key in source))delete target[key];
    for(const [key,value]of Object.entries(source)){if(value&&typeof value==='object'&&target[key]&&typeof target[key]==='object'&&Array.isArray(value)===Array.isArray(target[key]))reconcile(target[key],value);else target[key]=value;}
  }
  let historyFailure=0;
  const history=window.SculptHistory?new window.SculptHistory.Journal({
    getState:()=>state,context:()=>window.SculptLive?.isLive()?{live:true,session:window.SculptLive.sessionToken?.()??null}:{live:false},
    apply:(mutator,type,entry)=>window.SculptController.transact(mutator,type,{paths:entry.patches.map(p=>p.path),record:false}),
    beforeApply:async entry=>{const live=window.SculptLive;if(live?.isLive()){if(entry.patches.some(p=>p.path[0]==='desk'&&['processing','fx'].includes(p.path[1])&&p.path.at(-1)==='model'))throw new Error('Il cambio di algoritmo live va ripristinato con un preset: annullarlo qui non ripristinerebbe tutti i parametri.');await live.settled?.();historyFailure=live.snapshot?.().failureVersion||0;}},
    afterApply:async()=>{const live=window.SculptLive;if(live?.isLive()){await live.settled?.();if((live.snapshot?.().failureVersion||0)!==historyFailure)throw new Error('Il banco non ha confermato l’annullamento. Controlla i valori ricevuti.');}},
    notify:detail=>window.dispatchEvent(new CustomEvent('sculpt-history-state',{detail}))
  }):null;
  function mutationOptions(type,id,options={}){
    if(options.paths)return options;
    if(type==='strip'&&id){const row=state.outputs.some(s=>s.id===id)?'outputs':'inputs',index=state[row].findIndex(s=>s.id===id);if(index>=0)return {...options,paths:[[row,index]]};}
    if(type==='send')return {...options,paths:[['sends']]};
    return options;
  }
  function commit(mutator,type,id,options={}){
    const live=window.SculptLive,guard=live?.isLive()&&!live.applying();
    if(history?.busy&&!history.replaying&&!live?.applying?.())return false;
    const before=guard?JSON.parse(JSON.stringify(state)):null;
    const token=live?.applying?.()?null:history?.prepare(state,type,mutationOptions(type,id,options));
    mutator(state);
    if(guard&&!live.reviewMutation(before,state,type,id)){reconcile(state,before);return false;}
    history?.record(token,state);
    return true;
  }
  function emit(type,id){for(const callback of subscribers){try{callback({type,id,sof:state.sof});}catch(error){console.warn('Editor notification failed',error);}}requestMeters();}
  function updateSelection(){
    const strip=stripById(state.selected),view=M.display(state,strip.id);
    document.getElementById('selection-summary').textContent=`${label(strip)} · ${view.send&&!view.on?'OFF':!view.send&&strip.mute?'MUTE':format(view.level,true)}`;
  }
  function select(id,persist=true){
    const strip=stripById(id);if(!strip)return false;
    const old=stripById(state.selected);state.selected=id;
    if(old)updateStrip(old);updateStrip(strip);updateSelection();if(persist)save();return true;
  }
  function openEditor(id,origin){select(id);if(window.SculptEditor?.open)window.SculptEditor.open(id,false,origin);}
  function updateStrip(strip){
    const el=elements.get(strip.id);if(!el)return;
    const view=M.display(state,strip.id),target=view.send?stripById(view.targetId):null;
    const effective=window.SculptDesk?.effective(strip.id);
    const loaded=window.SculptLive?.hasStripValue(strip.id,view.targetId)??true;
    const signature=[strip.name,strip.color,strip.mute,state.selected===strip.id,state.sof===strip.id,view.level,view.on,view.send,view.targetId,target?.name,effective?.muted,effective?.solo,loaded,el.row].join('|');
    if(el.signature===signature)return;el.signature=signature;
    const description=view.send?`Mandata ${label(strip)} a ${label(target)}`:`Livello ${label(strip)}`;
    el.article.style.setProperty('--color',strip.color);
    el.article.classList.toggle('selected',state.selected===strip.id);
    el.article.classList.toggle('sof-target',state.sof===strip.id);
    el.article.classList.toggle('send-view',view.send);
    el.article.classList.toggle('muted',!view.on||(!view.send&&!!effective?.muted));
    el.article.classList.toggle('soloed',!!effective?.solo);
    el.labelButton.setAttribute('aria-label',`Apri editor ${label(strip)}`);
    el.labelButton.setAttribute('aria-pressed',String(state.selected===strip.id));
    el.number.textContent=`${strip.kind} ${String(strip.number).padStart(2,'0')}`;
    el.name.textContent=strip.name;
    el.mode.textContent=view.send?`→${shortLabel(target)}`:el.row==='outputs'?'OUT':'IN';
    el.mode.title=view.send?`Mandata a ${label(target)}`:'Livello principale';
    el.fader.style.setProperty('--position',toPosition(view.level));
    el.fader.setAttribute('aria-label',description);
    el.fader.setAttribute('aria-valuenow',view.level.toFixed(1));
    el.fader.setAttribute('aria-valuetext',view.level<=-89?'Meno infinito decibel':`${view.level.toFixed(1)} decibel`);
    el.readout.setAttribute('aria-label',`Inserisci ${view.send?'mandata':'livello'} per ${label(strip)}`);
    el.article.classList.toggle('live-unknown',!loaded);
    el.readout.querySelector('span').textContent=loaded?format(view.level):'—';
    el.mute.textContent=view.send?(view.on?'ON':'OFF'):'MUTE';
    el.mute.setAttribute('aria-label',view.send?`Mandata attiva ${label(strip)} a ${label(target)}`:`Mute ${label(strip)}`);
    el.mute.setAttribute('aria-pressed',String(view.send?view.on:strip.mute));
    el.mute.classList.toggle('active',!view.send&&strip.mute);
    el.mute.classList.toggle('send-on',view.send&&view.on);
    el.mute.classList.toggle('send-off',view.send&&!view.on);
    if(el.sof){el.sof.setAttribute('aria-label',`SOF ${label(strip)}`);el.sof.setAttribute('aria-pressed',String(state.sof===strip.id));el.sof.classList.toggle('active',state.sof===strip.id);}
  }
  function updateMode(){
    const target=state.sof?stripById(state.sof):null;
    const bar=document.getElementById('sof-bar');bar.classList.toggle('sof-active',!!target);
    document.getElementById('sof-target').textContent=target?`SOF → ${label(target)}`:'LIVELLI';
    document.getElementById('exit-sof').hidden=!target;
    document.getElementById('output-title').textContent=layerMembers?`${layerName} · RIGA 1`:target?'USCITE · SOF':'USCITE';
    document.getElementById('input-title').textContent=layerMembers?`${layerName} · RIGA 2`:target?'MANDATE':'INGRESSI';
    document.getElementById('outputs-mode').textContent=layerLayout?`${layerLayout.top.length} STRIP · RIGA SUPERIORE${target?' · SOF':''}`:target?'MANDATE / MASTER · DCA':'BUS · MATRICI · MASTER · DCA';
    document.getElementById('inputs-mode').textContent=layerLayout?`${layerLayout.bottom.length} STRIP · RIGA INFERIORE${target?' · SOF':''}`:target?`48 INGRESSI → ${shortLabel(target)}`:'40 CANALI · 8 AUX';
    all().forEach(updateStrip);updateSelection();window.SculptDcaBank?.refresh();
  }
  function setSof(targetId){if(!M.setSof(state,targetId))return false;updateMode();emit('sof');return true;}
  function changeLevel(id,level,targetId,persist=true){
    const strip=stripById(id);if(!strip)return;
    if(!commit(()=>{if(targetId)M.setSend(state,id,targetId,{level});else M.patchStrip(strip,{level});},targetId?'send':'strip',id))return;
    updateStrip(strip);updateSelection();if(persist){save();emit(targetId?'send':'strip',id);}
  }
  function makeStrip(strip,index,row){
    const article=document.createElement('article');
    article.className=`strip${['CH','AUX'].includes(strip.kind)?' input-strip':''}${(strip.kind==='MTX'||strip.kind==='MAIN'||strip.kind==='AUX')&&strip.number===1?' group-first':''}`;
    article.dataset.id=strip.id;
    article.innerHTML=`<button class="strip-label" type="button"><span class="strip-index"><span class="strip-number"></span><i aria-hidden="true"></i></span><span class="strip-name"></span></button>
      <button class="level-readout" type="button"><span></span><small>dB</small></button>
      <div class="fader-well"><div class="fader" role="slider" tabindex="0" aria-valuemin="-90" aria-valuemax="10" aria-orientation="vertical">
      <div class="fader-scale" aria-hidden="true">${[10,0,-10,-20,-40,-90].map(v=>`<div class="tick${v===0?' zero':''}${v===-10||v===-40?' secondary':''}${v===10||v===-20?' compact-hide':''}" style="top:${(1-toPosition(v))*100}%"><span>${v===-90?'−∞':v>0?'+'+v:String(v).replace('-','−')}</span></div>`).join('')}</div><div class="fader-cap" aria-hidden="true"></div></div>
      <div class="meter-pair" aria-hidden="true"><div class="meter"><i class="meter-fill"></i><i class="meter-peak"></i></div><div class="meter"><i class="meter-fill"></i><i class="meter-peak"></i></div></div>${['CH','AUX'].includes(strip.kind)?'<div class="strip-gr-pair" aria-label="Riduzione di guadagno"><div class="strip-gr gate-gr" role="meter" aria-label="GR gate" aria-valuemin="0" aria-valuemax="100"><span>G</span><i></i></div><div class="strip-gr comp-gr" role="meter" aria-label="GR compressore" aria-valuemin="0" aria-valuemax="100"><span>C</span><i></i></div></div>':''}</div>
      <div class="strip-buttons"><button class="mute-button" type="button" aria-pressed="false">MUTE</button>${strip.kind==='BUS'||strip.kind==='MTX'?'<button class="sof-button" type="button" aria-pressed="false">SOF</button>':''}</div>`;
    const fader=article.querySelector('.fader'),readout=article.querySelector('.level-readout'),mute=article.querySelector('.mute-button'),sof=article.querySelector('.sof-button'),labelButton=article.querySelector('.strip-label');
    elements.set(strip.id,{article,fader,readout,mute,sof,labelButton,number:article.querySelector('.strip-number'),name:article.querySelector('.strip-name'),mode:article.querySelector('.strip-index i'),meters:[...article.querySelectorAll('.meter')],gr:[...article.querySelectorAll('.strip-gr')],visible:true,index,row});
    labelButton.addEventListener('click',()=>openEditor(strip.id,labelButton));
    article.addEventListener('click',event=>{if(!event.target.closest('button,[role="slider"]'))openEditor(strip.id,labelButton);});
    readout.addEventListener('click',()=>openLevel(strip.id));
    mute.addEventListener('click',()=>{const view=M.display(state,strip.id);if(!commit(()=>{if(view.send)M.setSend(state,strip.id,view.targetId,{on:!view.on});else strip.mute=!strip.mute;},view.send?'send':'strip',strip.id))return;select(strip.id);updateStrip(strip);save();emit(view.send?'send':'strip',strip.id);});
    if(sof)sof.addEventListener('click',()=>setSof(state.sof===strip.id?null:strip.id));
    let drag=null;
    fader.addEventListener('pointerdown',event=>{
      if(drag||event.button!==0||!event.target.closest('.fader-cap'))return;
      const view=M.display(state,strip.id);select(strip.id,false);
      const inset=parseFloat(getComputedStyle(fader).getPropertyValue('--fader-inset'))||12;
      drag={pointer:event.pointerId,startY:event.clientY,startPosition:toPosition(view.level),targetId:view.targetId,travel:Math.max(20,fader.getBoundingClientRect().height-inset*2),moved:false};
      history?.begin(view.send?'Mandata':'Fader');
      fader.focus({preventScroll:true});fader.setPointerCapture(event.pointerId);article.classList.add('dragging');event.preventDefault();
    });
    fader.addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;const fine=event.shiftKey?.2:1;if(event.clientY!==drag.startY)drag.moved=true;if(drag.moved)changeLevel(strip.id,toDb(drag.startPosition+(drag.startY-event.clientY)/drag.travel*fine),drag.targetId,false);event.preventDefault();});
    const endDrag=event=>{if(!drag||drag.pointer!==event.pointerId)return;const {targetId,moved,pointer}=drag;drag=null;article.classList.remove('dragging');if(fader.hasPointerCapture?.(pointer))fader.releasePointerCapture(pointer);history?.end();save();if(moved)emit(targetId?'send':'strip',strip.id);};
    fader.addEventListener('pointerup',endDrag);fader.addEventListener('pointercancel',endDrag);fader.addEventListener('lostpointercapture',endDrag);
    window.addEventListener('blur',()=>{if(drag)endDrag({pointerId:drag.pointer});});
    fader.title='Trascina la testa · doppio clic: 0 dB · Maiusc: regolazione fine';
    fader.addEventListener('dblclick',event=>{
      if(event.button!==0)return;
      const view=M.display(state,strip.id);select(strip.id,false);changeLevel(strip.id,0,view.targetId);
      fader.focus({preventScroll:true});event.preventDefault();event.stopPropagation();
    });
    fader.addEventListener('keydown',event=>{
      const view=M.display(state,strip.id);let next=view.level;const step=event.shiftKey?.1:.5;
      if(event.key==='ArrowUp'||event.key==='ArrowRight')next+=step;
      else if(event.key==='ArrowDown'||event.key==='ArrowLeft')next-=step;
      else if(event.key==='PageUp')next+=5;else if(event.key==='PageDown')next-=5;
      else if(event.key==='Home')next=-90;else if(event.key==='End')next=10;
      else if(event.key==='Enter'){openLevel(strip.id);event.preventDefault();return;}else return;
      select(strip.id,false);changeLevel(strip.id,Math.round(clamp(next,-90,10)*10)/10,view.targetId);event.preventDefault();
    });
    return article;
  }
  function bindBankPan(scroller){
    // Touch keeps native momentum scrolling. Mouse/pen can grab the strip,
    // including a button, without firing its action once a pan has started.
    let pan=null,suppressClick=false;
    const finish=event=>{
      if(!pan||(event&&pan.pointer!==event.pointerId))return;
      const {pointer,active}=pan;pan=null;
      scroller.classList.remove('panning');
      if(scroller.hasPointerCapture?.(pointer))scroller.releasePointerCapture(pointer);
      if(active)suppressClick=true;
    };
    scroller.addEventListener('pointerdown',event=>{
      suppressClick=false;
      if(pan||event.defaultPrevented||event.pointerType==='touch'||event.button!==0||event.target.closest('.fader-cap,input,select,textarea,[contenteditable="true"]'))return;
      if(scroller.scrollWidth<=scroller.clientWidth)return;
      pan={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,startScroll:scroller.scrollLeft,active:false};
    });
    window.addEventListener('pointermove',event=>{
      if(!pan||pan.pointer!==event.pointerId)return;
      const dx=event.clientX-pan.startX,dy=event.clientY-pan.startY;
      if(!pan.active){
        if(Math.abs(dx)<6||Math.abs(dx)<=Math.abs(dy))return;
        pan.active=true;scroller.classList.add('panning');scroller.setPointerCapture(event.pointerId);
      }
      scroller.scrollLeft=clamp(pan.startScroll-dx,0,Math.max(0,scroller.scrollWidth-scroller.clientWidth));
      event.preventDefault();
    },{passive:false});
    window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
    scroller.addEventListener('lostpointercapture',finish);window.addEventListener('blur',()=>finish());
    scroller.addEventListener('click',event=>{
      if(!suppressClick||event.detail===0)return;
      suppressClick=false;event.preventDefault();event.stopImmediatePropagation();
    },true);
    scroller.addEventListener('dragstart',event=>event.preventDefault());
  }
  for(const row of ['outputs','inputs']){
    const bank=document.getElementById(`${row}-bank`);for(const [i,strip]of state[row].entries())bank.append(makeStrip(strip,i,row));
    const scroller=document.getElementById(`${row}-scroll`),buttons=[...document.querySelectorAll(`.bank-button[data-row="${row}"]`)];
    bindBankPan(scroller);
    const updateBank=()=>{
      const progress=document.getElementById(`${row}-progress`),total=Math.max(scroller.scrollWidth,scroller.clientWidth,1);
      progress.style.width=`${Math.min(100,scroller.clientWidth/total*100)}%`;progress.style.left=`${scroller.scrollLeft/total*100}%`;
      const visible=[...bank.querySelectorAll('.strip:not([hidden])')],width=visible[0]?.getBoundingClientRect().width||0;
      if(width<=0||layerMembers)return;
      // Use actual nodes: pinned strips have left the center and DCA masters
      // now share its final sixteen positions with the regular outputs.
      const first=visible.find(node=>node.offsetLeft+node.getBoundingClientRect().width*.6>scroller.scrollLeft)||visible.at(-1);
      if(row==='outputs')window.SculptDcaBank?.syncNavigation(first);
      const index=state[row].findIndex(strip=>strip.id===first?.dataset.id),activeIndex=index<0?-1:Math.floor(index/8)*8;
      buttons.forEach(button=>{const active=Number(button.dataset.index)===activeIndex;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    };
    bankUpdates.set(row,updateBank);
    scroller.addEventListener('scroll',updateBank,{passive:true});new ResizeObserver(updateBank).observe(scroller);
    scroller.addEventListener('keydown',event=>{if(event.target!==scroller)return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){scroller.scrollBy({left:(event.key==='ArrowRight'?1:-1)*scroller.clientWidth*.75,behavior:'smooth'});event.preventDefault();}});
  }
  document.querySelectorAll('.bank-button').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.row==='outputs')window.SculptDcaBank?.hide();
    if(window.SculptStripPins?.navigate(button.dataset.row,Number(button.dataset.index)))return;
    const row=button.dataset.row,strip=state[row][Number(button.dataset.index)],el=elements.get(strip.id).article;
    document.getElementById(`${row}-scroll`).scrollTo({left:el.offsetLeft-3,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }));
  document.getElementById('exit-sof').addEventListener('click',()=>setSof(null));
  updateMode();save();
  if('IntersectionObserver' in window)for(const row of ['outputs','inputs']){
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{const item=elements.get(entry.target.dataset.id);if(item&&(item.displayRow||item.row)===row)item.visible=!item.article.hidden&&entry.isIntersecting;}),{root:document.getElementById(`${row}-scroll`)});
    bankObservers.set(row,observer);
    state[row].forEach(strip=>observer.observe(elements.get(strip.id).article));
  }
  let lastFrame=0,meterTimer=null,meterFrame=null;
  const metersVisible=()=>document.visibilityState!=='hidden'&&!document.querySelector('.desk-workspace[open]');
  function requestMeters(){if(meterFrame!==null||meterTimer!==null||!metersVisible())return;meterFrame=requestAnimationFrame(animateMeters);}
  function animateMeters(time){
    meterFrame=null;
    if(!metersVisible())return;
    if(time-lastFrame>120){lastFrame=time;for(const [i,strip]of all().entries()){
      const el=elements.get(strip.id);if(!el.visible&&!window.SculptStripPins?.isPinnedVisible(strip.id))continue;const view=M.display(state,strip.id),t=state.meters?time*.001:12;
      if(window.SculptLive?.isLive()){const m=window.SculptLive.meter(strip.id,['CH','AUX'].includes(strip.kind)?'input':'output');el.meters.forEach((meter,ch)=>{const db=m?(ch?m.right:m.left):-144,pct=clamp((db+60)/60,0,1)*100;meter.style.setProperty('--meter',`${pct}%`);meter.style.setProperty('--peak',`${pct}%`);});updateGr(el,window.SculptLive.gainReduction?.(strip.id));continue;}
      const input=['CH','AUX'].includes(strip.kind),effective=input?null:window.SculptDesk?.effective(strip.id);
      const meterLevel=view.send?view.level:(effective?.level??view.level);
      const base=input?.34+(i%5)*.025:meterLevel<=-89||!view.on||effective?.muted?0:clamp(.32+meterLevel*.012,.035,.68);
      const wave=.15*Math.sin(t*3.1+i*2.3)+.08*Math.sin(t*7.3+i*.9)+.04*Math.sin(t*13+i*2);
      el.meters.forEach((meter,ch)=>{const value=base===0?0:clamp(base+wave+(ch===1?.035*Math.sin(t*4.3+i):0),.015,.96);meter.style.setProperty('--meter',`${value*100}%`);meter.style.setProperty('--peak',`${base===0?0:clamp(base+.18,.05,.97)*100}%`);});
      // Offline movement is explicitly labelled DEMO. Live bars above only use received meter reports.
      const processing=window.SculptDesk?.get().processing[strip.id];
      updateGr(el,{gate:{fraction:processing?.gate?.enabled?clamp(-wave*2,0,.7):0,db:null},comp:{fraction:processing?.dyn?.enabled?clamp((wave+.06)*1.6,0,.65):0,db:null}},true);
    }}
    if(state.meters||window.SculptLive?.isLive())meterTimer=setTimeout(()=>{meterTimer=null;requestMeters();},120);
  }
  requestMeters();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){if(meterTimer!==null)clearTimeout(meterTimer);meterTimer=null;if(meterFrame!==null)window.cancelAnimationFrame?.(meterFrame);meterFrame=null;}else requestMeters();});
  document.addEventListener('close',requestMeters,true);
  window.addEventListener('sculpt-live-state',requestMeters);
  function updateGr(el,reduction,demo=false){
    el.gr.forEach((meter,index)=>{
      const value=reduction?.[index?'comp':'gate'],available=Number.isFinite(value?.fraction),pct=available?clamp(value.fraction,0,1)*100:0;
      const name=index?'Compressore':'Gate',text=!available?'Dato non disponibile':Number.isFinite(value.db)?`${value.db.toFixed(1)} dB di riduzione`:`${Math.round(pct)}% della scala GR`;
      meter.style.setProperty('--gr',`${pct}%`);meter.classList.toggle('gr-unavailable',!available);
      if(available)meter.setAttribute('aria-valuenow',String(Math.round(pct)));else meter.removeAttribute('aria-valuenow');
      meter.setAttribute('aria-valuetext',`${demo?'Demo · ':''}${text}`);meter.title=`GR ${name} · ${demo?'simulata · ':''}${text}`;
    });
  }
  const infoDialog=document.getElementById('info-dialog'),levelDialog=document.getElementById('level-dialog'),meterToggle=document.getElementById('meters-toggle');
  const updateMeterToggle=()=>meterToggle.setAttribute('aria-checked',String(state.meters));updateMeterToggle();
  document.getElementById('info-button').addEventListener('click',()=>{document.getElementById('reset-confirm').hidden=true;infoDialog.showModal();});
  document.querySelector('.close-dialog').addEventListener('click',()=>infoDialog.close());
  for(const dialog of [infoDialog,levelDialog])dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  meterToggle.addEventListener('click',()=>{state.meters=!state.meters;updateMeterToggle();save();requestMeters();});
  document.getElementById('reset-button').addEventListener('click',()=>document.getElementById('reset-confirm').hidden=false);
  document.getElementById('reset-no').addEventListener('click',()=>document.getElementById('reset-confirm').hidden=true);
  document.getElementById('reset-yes').addEventListener('click',()=>{
    if(window.SculptLive?.isLive()){toast('Torna alla demo prima di ripristinare i valori locali.');return;}
    history?.clear();const fresh=M.defaults();for(const strip of all())Object.assign(strip,M.find(fresh,strip.id));
    state.sends={};state.sof=null;state.selected='ch-1';if(window.SculptDesk)state.desk=window.SculptDesk.defaults();updateMode();save();emit('reset');
    document.getElementById('reset-confirm').hidden=true;infoDialog.close();toast('Demo ripristinata');
  });
  function offlineHelp(){infoDialog.close();if(window.SculptOffline?.openHelp)window.SculptOffline.openHelp();else toast('Preparazione offline in corso…');}
  document.getElementById('offline-button').addEventListener('click',offlineHelp);document.getElementById('install-button').addEventListener('click',offlineHelp);
  window.addEventListener('sculpt-offline-status',event=>document.getElementById('offline-button').classList.toggle('ready',event.detail.mode==='ready'));
  let editing=null;
  function openLevel(id){
    const strip=stripById(id),view=M.display(state,id);editing={id,targetId:view.targetId};select(id);
    document.getElementById('level-target').textContent=label(strip);
    document.getElementById('level-heading').textContent=view.send?`Mandata → ${shortLabel(stripById(view.targetId))}`:'Livello';
    const input=document.getElementById('level-input');input.value=view.level.toFixed(1);levelDialog.showModal();input.focus();input.select();
  }
  document.getElementById('close-level').addEventListener('click',()=>levelDialog.close());
  document.querySelectorAll('[data-level]').forEach(button=>button.addEventListener('click',()=>document.getElementById('level-input').value=button.dataset.level));
  document.getElementById('level-form').addEventListener('submit',event=>{
    event.preventDefault();const input=document.getElementById('level-input'),value=Number(input.value);if(!input.checkValidity()||!Number.isFinite(value)||!editing)return;
    changeLevel(editing.id,value,editing.targetId);levelDialog.close();
  });
  let toastTimer;
  function toast(message){const el=document.getElementById('toast');clearTimeout(toastTimer);el.textContent=message;el.classList.add('show');toastTimer=setTimeout(()=>el.classList.remove('show'),2200);}
  window.SculptController=Object.freeze({
    showLayer(members,name='LAYER'){
      window.SculptDcaBank?.hide();
      const supplied=members&&typeof members==='object',layout={top:[],bottom:[]},seen=new Set();
      const isDca=id=>typeof id==='string'&&/^dca-(?:[1-9]|1[0-6])$/.test(id);
      const append=(key,id)=>{if(typeof id==='string'&&(stripById(id)||isDca(id))&&!seen.has(id)){seen.add(id);layout[isDca(id)?'top':key].push(id);}};
      if(Array.isArray(members))for(const id of members){const item=elements.get(id);if(item||isDca(id))append(item?.row==='inputs'?'bottom':'top',id);}
      else if(supplied)for(const key of ['top','bottom'])for(const id of Array.isArray(members[key])?members[key]:[])append(key,id);
      layerLayout=supplied?layout:null;layerMembers=supplied?seen:null;layerName=String(name).toUpperCase().slice(0,24);
      for(const observer of bankObservers.values())observer.disconnect();
      // Reuse each existing strip, its listeners and the shared mixer state.
      // Restoring normal banks also restores their original order exactly.
      for(const row of ['outputs','inputs'])for(const strip of state[row]){
        const item=elements.get(strip.id);document.getElementById(`${row}-bank`).append(item.article);item.displayRow=row;item.article.hidden=!!layerMembers&&!layerMembers.has(strip.id);
      }
      if(layerLayout)for(const [key,row]of [['top','outputs'],['bottom','inputs']])for(const id of layerLayout[key]){
        const item=elements.get(id);if(item){document.getElementById(`${row}-bank`).append(item.article);item.displayRow=row;}
      }
      window.SculptDcaBank?.setLayerRows(layerLayout);
      for(const item of elements.values()){item.visible=!item.article.hidden;if(item.visible)bankObservers.get(item.displayRow)?.observe(item.article);}
      for(const row of ['outputs','inputs']){
        const section=document.querySelector(`.mixer-row.${row}`),key=row==='outputs'?'top':'bottom',bank=document.getElementById(`${row}-bank`),scroller=document.getElementById(`${row}-scroll`);section.classList.toggle('layer-active',!!layerMembers);
        section.querySelector('.row-count').textContent=layerLayout?layerLayout[key].length:state[row].length+(row==='outputs'?16:0);
        section.querySelector('.bank-navigation').hidden=!!layerMembers;
        scroller.setAttribute('aria-label',layerLayout?`${layerName}, riga ${key==='top'?'1 superiore':'2 inferiore'}, scorri orizzontalmente`:row==='outputs'?'Bus, matrici, master e DCA, scorri orizzontalmente':'Canali e ingressi AUX, scorri orizzontalmente');
        let empty=bank.querySelector('.layer-empty');if(!empty){empty=document.createElement('div');empty.className='layer-empty';empty.textContent='Riga vuota · assegna i canali in Custom Layer';bank.append(empty);}empty.hidden=!layerLayout||layerLayout[key].length>0;
        let exit=section.querySelector('.layer-exit');if(!exit){exit=document.createElement('button');exit.className='layer-exit';exit.type='button';exit.textContent='Tutti i canali ×';exit.addEventListener('click',()=>window.SculptController.showLayer(null));section.querySelector('.row-header').append(exit);}exit.hidden=!layerMembers;
        scroller.scrollLeft=0;bankUpdates.get(row)?.();
      }
      if(!layerMembers&&state.desk)state.desk.activeLayer=null;
      save();
      updateMode();emit('layer');
    },
    getLayerRows:()=>layerLayout?{top:[...layerLayout.top],bottom:[...layerLayout.bottom]}:null,
    getState:()=>state,
    capture:()=>JSON.parse(JSON.stringify(M.serialize(state))),
    refresh:updateMode,
    transact(mutator,type='console',options={}){const accepted=commit(mutator,type,options.id,options);if(['parameter','processing'].includes(type)){if(options.id&&stripById(options.id))updateStrip(stripById(options.id));}else updateMode();if(accepted){save();emit(type,options.id);}return accepted;},
    beginGesture:label=>history?.begin(label),endGesture:()=>history?.end(),
    historyState:()=>history?.status()||{canUndo:false,canRedo:false,undoCount:0,redoCount:0},
    clearHistory:()=>history?.clear(),
    async undo(){const result=await history?.run('undo');if(result)toast(result.ok?'Annullato · '+result.label:result.reason);return result||{ok:false};},
    async redo(){const result=await history?.run('redo');if(result)toast(result.ok?'Ripristinato · '+result.label:result.reason);return result||{ok:false};},
    flushSave,
    restore(snapshot){
      if(window.SculptLive?.isLive()&&!window.SculptLive.applying()){toast('Torna alla demo per importare un progetto locale.');return false;}
      if(!snapshot||snapshot.version!==3||!snapshot.values)throw new Error('Il file non contiene un progetto Sculpt Wing valido.');
      history?.clear();
      const next=M.restore(snapshot,null);if(window.SculptDesk)next.desk=window.SculptDesk.normalize(next.desk);
      for(const strip of all())Object.assign(strip,M.find(next,strip.id));
      state.sends=next.sends;state.desk=next.desk;state.selected=next.selected;state.meters=next.meters;state.sof=null;
      updateMode();updateMeterToggle();save();emit('restore');return true;
    },
    toast,
    faderScale:Object.freeze({toPosition,toDb,format}),
    bindStripPan:bindBankPan,
    getStrip:stripById,listStrips:all,
    updateStrip(id,patch){const strip=stripById(id);if(!strip)return false;if(!commit(()=>M.patchStrip(strip,patch),'strip',id))return false;updateStrip(strip);updateSelection();if(state.sof===id)updateMode();save();emit('strip',id);return true;},
    getSend:(sourceId,targetId)=>M.getSend(state,sourceId,targetId),
    setSend(sourceId,targetId,patch){if(!M.canRoute(stripById(sourceId),stripById(targetId)))return false;if(!commit(()=>M.setSend(state,sourceId,targetId,patch),'send',sourceId))return false;updateStrip(stripById(sourceId));updateSelection();save();emit('send',sourceId);return true;},
    canSend:(sourceId,targetId)=>M.canRoute(stripById(sourceId),stripById(targetId)),
    getSof:()=>state.sof,setSof,
    selectStrip(id){const result=select(id);if(result)emit('selection',id);return result;},
    subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);}
  });
  window.dispatchEvent(new CustomEvent('sculpt-ready'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){save();flushSave();}});window.addEventListener('pagehide',()=>{save();flushSave();});
})();
