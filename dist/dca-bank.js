(() => {
  'use strict';
  const C=window.SculptController,D=window.SculptDesk,U=window.SculptUI;
  if(!C||!D||!U)return;
  const {toPosition,toDb,format}=C.faderScale,clamp=window.SculptModel.clamp;
  const section=document.querySelector('.mixer-row.outputs'),scroller=document.getElementById('outputs-scroll'),bank=document.getElementById('outputs-bank');
  // DCA masters share the upper row with BUS, MTX and MAIN. The shortcut only
  // scrolls that row; it never replaces the bank or hides its pinned strips.
  const access=U.button('DCA',()=>open(),'dca-bank-button');access.id='dca-bank-button';access.setAttribute('aria-label','Banco DCA 1–16');access.setAttribute('aria-pressed','false');
  section.querySelector('.bank-navigation').append(access);
  const items=new Map(),configRefreshers=new Set();let active=false,lastMode='',loading=false,loadGeneration=0;
  const live=()=>window.SculptLive,group=id=>D.get().dca.find(g=>g.id===id),path=(id,key)=>`/dca/${id}/${key}`;
  const wireKnown=node=>!live()?.isLive()||!!(live().isConnected?.()&&live().hasValue?.(node)&&live().metadata?.(node));
  const wireEditable=node=>!live()?.isLive()||!!(wireKnown(node)&&live().isWritable?.()&&!live().metadata(node).readOnly);
  const known=(id,key)=>wireKnown(path(id,key)),editable=(id,key)=>wireEditable(path(id,key));
  const tagsPath=strip=>`${window.SculptWingMap?.stripPath(strip.id)||'/'+strip.id.replace('-','/')}/tags`;
  const memberKnown=strip=>wireKnown(tagsPath(strip));
  const memberEditable=(id,strip)=>known(id,'fdr')&&wireEditable(tagsPath(strip));
  const membersKnown=()=>C.listStrips().every(memberKnown);
  function change(id,key,value){
    const node={level:'fdr',solo:'$solo'}[key]||key;
    if(!group(id)||!editable(id,node))return false;
    if(Object.is(group(id)[key],value))return true;
    const index=D.get().dca.findIndex(item=>item.id===id);
    return D.change(d=>{const g=d.dca[index];if(g)g[key]=value;},'dca',{paths:[['desk','dca',index]],id:`dca-${id}`});
  }
  function levelDialog(id){
    const g=group(id),session=live()?.sessionToken?.();if(!g||!editable(id,'fdr'))return;
    const content=U.el('form','dca-level-form'),input=U.el('input','desk-input');input.type='number';input.min=-90;input.max=10;input.step=.1;input.required=true;input.value=g.level;input.inputMode='decimal';input.setAttribute('aria-label',`Livello DCA ${id} in dB`);
    const apply=U.button('Applica livello',null,'desk-primary');apply.type='submit';
    const zero=U.button('0 dB',()=>{input.value='0';});
    content.append(U.field('Livello in dB',input),zero,apply);
    const modal=U.modal(`Livello DCA ${id} · ${g.name}`,content);
    content.addEventListener('submit',event=>{event.preventDefault();if(session!==live()?.sessionToken?.()){modal.close();C.toast('La sessione WING è cambiata. Riapri il livello DCA.');return;}if(input.checkValidity()&&Number.isFinite(input.valueAsNumber)&&change(id,'level',Math.round(clamp(input.valueAsNumber,-90,10)*10)/10)!==false)modal.close();});input.focus();input.select();
  }
  function configure(id){
    const g=group(id);if(!g)return;
    const content=U.el('div','dca-config'),name=U.el('input','desk-input'),search=U.el('input','desk-input'),list=U.el('div','dca-members'),count=U.el('p','desk-note');
    name.value=known(id,'name')?g.name:'';name.maxLength=8;name.setAttribute('aria-label',`Nome DCA ${id}`);name.disabled=!editable(id,'name');
    name.addEventListener('change',()=>{const value=name.value.trim();if(!value||change(id,'name',value)===false)name.value=known(id,'name')?group(id)?.name||'':'';});
    search.type='search';search.placeholder='Cerca un canale';search.setAttribute('aria-label',`Cerca membri DCA ${id}`);
    const checks=[];
    for(const strip of C.listStrips()){
      const label=`${strip.kind} ${String(strip.number).padStart(2,'0')} · ${strip.name}`,item=U.el('label','dca-member'),check=U.el('input'),chip=U.el('i');check.type='checkbox';check.setAttribute('aria-label',`Assegna ${label} a DCA ${id}`);chip.style.backgroundColor=strip.color;item.append(check,chip,U.el('span','',label));
      check.addEventListener('change',()=>{
        // The permission can change while this dialog is open or a click is
        // queued. Never submit an assignment based on an unread tag list.
        if(!memberEditable(id,strip)){refreshConfig();return;}
        const assigned=check.checked;
        D.change(d=>{const current=d.dca.find(item=>item.id===id);if(current)current.members=assigned?[...new Set([...current.members,strip.id])]:current.members.filter(value=>value!==strip.id);},'groups');
        refreshConfig();
      });
      list.append(item);checks.push({item,check,strip,text:label.toLowerCase()});
    }
    search.addEventListener('input',()=>checks.forEach(item=>{item.item.hidden=!item.text.includes(search.value.trim().toLowerCase());}));
    content.append(U.field('Nome del gruppo',name),count,search,list);
    const retry=U.button('Rileggi DCA',()=>loadGroups(true));content.append(retry);
    content.append(U.button('Apri DCA / Mute Groups',()=>{modal.close();U.open('groups');}));
    const modal=U.modal(`DCA ${id} · nome e membri`,content);
    function refreshConfig(){
      const current=group(id);if(!current){modal.close();return;}
      const canRename=editable(id,'name');name.disabled=!canRename;
      if(document.activeElement!==name||!canRename)name.value=known(id,'name')?current.name:'';
      let loaded=0,assigned=0;
      for(const {check,strip}of checks){
        const ready=memberKnown(strip);if(ready)loaded++;
        check.checked=ready&&current.members.includes(strip.id);check.indeterminate=!ready;check.disabled=!memberEditable(id,strip);
        if(check.checked)assigned++;
        check.title=!ready?'Assegnazione non ancora letta dalla WING':check.disabled?'Assegnazione in sola lettura':'';
      }
      count.textContent=loaded===checks.length?`${assigned} canali assegnati`:`${assigned} assegnati tra ${loaded} canali letti · ${checks.length-loaded} da leggere`;
      retry.hidden=!live()?.isLive();retry.disabled=loading||!live()?.isConnected?.();
    }
    configRefreshers.add(refreshConfig);modal.dialog.addEventListener('close',()=>configRefreshers.delete(refreshConfig),{once:true});name.addEventListener('blur',refreshConfig);refreshConfig();
    if(!known(id,'fdr')||!membersKnown())void loadGroups();
  }
  function makeStrip(id){
    const article=U.el('article',`strip dca-strip${id===1?' group-first':''}`);article.dataset.dca=id;article.dataset.id=`dca-${id}`;article.style.setProperty('--color','#c78cd9');
    article.innerHTML=`<button type="button" class="strip-label"><span class="strip-index"><span>DCA ${String(id).padStart(2,'0')}</span><i>GRUPPO</i></span><span class="strip-name"></span></button>
      <button type="button" class="level-readout"><span></span><small>dB</small></button>
      <div class="fader-well"><div class="fader" role="slider" tabindex="0" aria-valuemin="-90" aria-valuemax="10" aria-orientation="vertical"><div class="fader-scale" aria-hidden="true">${[10,0,-10,-20,-40,-90].map(v=>`<div class="tick${v===0?' zero':''}" style="top:${(1-toPosition(v))*100}%"><span>${v===-90?'−∞':v>0?'+'+v:String(v).replace('-','−')}</span></div>`).join('')}</div><div class="fader-cap" aria-hidden="true"></div></div></div>
      <button type="button" class="dca-members-button"></button><div class="strip-buttons"><button type="button" class="mute-button">MUTE</button><button type="button" class="sof-button dca-solo-button">SOLO</button></div>`;
    const item={article,fader:article.querySelector('.fader'),name:article.querySelector('.strip-name'),label:article.querySelector('.strip-label'),readout:article.querySelector('.level-readout'),value:article.querySelector('.level-readout span'),mute:article.querySelector('.mute-button'),solo:article.querySelector('.dca-solo-button'),members:article.querySelector('.dca-members-button')};items.set(id,item);
    item.label.addEventListener('click',()=>configure(id));item.members.addEventListener('click',()=>configure(id));item.readout.addEventListener('click',()=>levelDialog(id));
    item.mute.addEventListener('click',()=>change(id,'mute',!group(id).mute));item.solo.addEventListener('click',()=>change(id,'solo',!group(id).solo));
    item.fader.title='Trascina la testa · doppio clic: 0 dB · Maiusc: regolazione fine';
    let drag=null;
    const end=event=>{if(!drag||drag.pointer!==event.pointerId)return;const pointer=drag.pointer;drag=null;article.classList.remove('dragging');if(item.fader.hasPointerCapture?.(pointer))item.fader.releasePointerCapture(pointer);C.endGesture?.();};
    item.fader.addEventListener('pointerdown',event=>{
      if(drag||event.button!==0||!event.target.closest('.fader-cap')||!editable(id,'fdr'))return;
      const inset=parseFloat(getComputedStyle(item.fader).getPropertyValue('--fader-inset'))||12;
      drag={pointer:event.pointerId,y:event.clientY,position:toPosition(group(id).level),session:live()?.sessionToken?.(),travel:Math.max(20,item.fader.getBoundingClientRect().height-inset*2)};C.beginGesture?.();item.fader.focus({preventScroll:true});item.fader.setPointerCapture(event.pointerId);article.classList.add('dragging');event.preventDefault();
    });
    item.fader.addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;if(drag.session!==live()?.sessionToken?.()||!editable(id,'fdr')){end(event);return;}change(id,'level',toDb(drag.position+(drag.y-event.clientY)/drag.travel*(event.shiftKey?.2:1)));event.preventDefault();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])item.fader.addEventListener(event,end);
    window.addEventListener('blur',()=>{if(drag)end({pointerId:drag.pointer});});
    item.fader.addEventListener('dblclick',event=>{if(event.button!==0)return;change(id,'level',0);event.preventDefault();event.stopPropagation();});
    item.fader.addEventListener('keydown',event=>{
      if(!editable(id,'fdr'))return;let value=group(id).level;const step=event.shiftKey?.1:.5;
      if(['ArrowUp','ArrowRight'].includes(event.key))value+=step;else if(['ArrowDown','ArrowLeft'].includes(event.key))value-=step;else if(event.key==='PageUp')value+=5;else if(event.key==='PageDown')value-=5;else if(event.key==='Home')value=-90;else if(event.key==='End')value=10;else if(event.key==='Enter'){levelDialog(id);event.preventDefault();return;}else return;
      change(id,'level',Math.round(clamp(value,-90,10)*10)/10);event.preventDefault();
    });bank.append(article);
  }
  function refreshProgress(){
    const total=Math.max(scroller.scrollWidth,scroller.clientWidth,1),progress=document.getElementById('outputs-progress');progress.style.width=`${Math.min(100,scroller.clientWidth/total*100)}%`;progress.style.left=`${scroller.scrollLeft/total*100}%`;
  }
  function refresh(){
    for(const refreshConfig of [...configRefreshers])refreshConfig();
    const assignmentsReady=membersKnown();
    for(const g of D.get().dca){
      if(!items.has(g.id))makeStrip(g.id);const item=items.get(g.id),loaded=known(g.id,'fdr'),writable=editable(g.id,'fdr');
      const name=known(g.id,'name')?g.name:`DCA ${g.id}`,mute=known(g.id,'mute')&&!!g.mute,solo=known(g.id,'$solo')&&!!g.solo;
      const muteEditable=editable(g.id,'mute'),soloEditable=editable(g.id,'$solo');
      const signature=JSON.stringify([name,loaded,loaded?g.level:null,writable,mute,solo,muteEditable,soloEditable,assignmentsReady,assignmentsReady?g.members.length:null,loading]);
      if(item.signature===signature)continue;item.signature=signature;
      item.name.textContent=name;item.label.setAttribute('aria-label',`Modifica nome e membri DCA ${g.id} · ${name}`);
      item.value.textContent=loaded?format(g.level):'—';item.readout.setAttribute('aria-label',`Inserisci livello DCA ${g.id}`);item.readout.disabled=!writable;
      item.fader.style.setProperty('--position',loaded?toPosition(g.level):0);item.fader.setAttribute('aria-label',`Livello DCA ${g.id} · ${item.name.textContent}`);item.fader.setAttribute('aria-disabled',String(!writable));item.fader.setAttribute('aria-valuetext',loaded?format(g.level,true):'Valore non letto dalla WING');
      if(loaded)item.fader.setAttribute('aria-valuenow',g.level);else item.fader.removeAttribute('aria-valuenow');
      item.article.classList.toggle('live-unknown',!loaded);item.article.classList.toggle('muted',mute);
      for(const [key,node,on,enabled]of [['mute',item.mute,mute,muteEditable],['solo',item.solo,solo,soloEditable]]){node.setAttribute('aria-label',`${key==='mute'?'Mute':'Solo'} DCA ${g.id}`);node.setAttribute('aria-pressed',String(on));node.classList.toggle('active',on);node.disabled=!enabled;}
      item.members.textContent=assignmentsReady?`${g.members.length} membri`:'— membri';item.members.setAttribute('aria-label',`Assegna membri DCA ${g.id}`);item.members.title=assignmentsReady?'Modifica i membri':'Assegnazioni non ancora lette dalla WING';item.members.disabled=loading;
    }
    if(!section.classList.contains('layer-active')){const counter=section.querySelector('.row-count'),count=String(C.getState().outputs.length+D.get().dca.length);if(counter.textContent!==count)counter.textContent=count;}
    if(active){const mode=document.getElementById('outputs-mode'),text=loading?'LETTURA DCA DALLA WING…':'BUS · MATRICI · MASTER · DCA';if(mode.textContent!==text)mode.textContent=text;}
  }
  async function loadGroups(force=false){
    if(!live()?.isLive()||!live()?.isConnected?.()||loading)return;
    const generation=++loadGeneration;loading=true;refresh();
    try{
      if(force&&live().readNode){
        for(const path of window.SculptWingMap.readPaths(C.getState(),'dca')){
          if(generation!==loadGeneration||!live()?.isConnected?.())return;
          await live().readNode(path,{force:true});
        }
      }else await live().loadScope('dca');
    }
    catch(error){if(generation===loadGeneration&&live()?.isConnected?.())C.toast(error.message||'Lettura DCA non riuscita');}
    finally{if(generation===loadGeneration){loading=false;refresh();}}
  }
  function setActive(value){
    if(active===value)return;
    active=value;access.classList.toggle('active',active);access.setAttribute('aria-pressed',String(active));section.classList.toggle('dca-bank-active',active);
    if(!active&&!section.classList.contains('layer-active'))document.getElementById('outputs-mode').textContent=C.getSof()?'MANDATE / MASTER · DCA':'BUS · MATRICI · MASTER · DCA';
    window.dispatchEvent(new CustomEvent('sculpt-dca-bank',{detail:{open:active}}));
  }
  function syncNavigation(first){
    const visibleDca=!!first?.dataset.dca&&!section.classList.contains('layer-active');
    setActive(visibleDca);
    if(visibleDca){section.querySelectorAll('.bank-button').forEach(button=>{button.classList.remove('active');button.setAttribute('aria-pressed','false');});if(!known(Number(first.dataset.dca),'fdr'))loadGroups();}
  }
  function setLayerRows(layout){
    const ids=layout?.top||null;
    for(const [id,item]of items){bank.append(item.article);item.article.hidden=!!ids&&!ids.includes(`dca-${id}`);}
    // Run after regular channels are placed so mixed channel/DCA layouts keep
    // their chosen order while DCA masters always stay in the upper row.
    if(ids)for(const id of ids){const node=section.querySelector(`.strip[data-id="${id}"]`);if(node)bank.append(node);}
  }
  function open(){
    window.SculptEditor?.close();
    if(window.SculptMixerView?.mode?.()==='extended')window.SculptMixerView.setBank('outputs');
    if(C.getLayerRows?.())C.showLayer(null);
    setActive(true);refresh();
    const target=[...items.values()].find(item=>!item.article.hidden&&item.article.parentElement===bank)?.article;
    const fixed=!target&&[...items.values()].find(item=>!item.article.hidden&&item.article.closest('.strip-pin-rail'))?.article;
    const behavior=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
    if(target)scroller.scrollTo({left:Math.max(0,target.offsetLeft-3),behavior});
    else if(fixed)fixed.closest('.strip-pin-rail').scrollTo({left:Math.max(0,fixed.offsetLeft-3),behavior});
    section.querySelectorAll('.bank-button').forEach(button=>{button.classList.remove('active');button.setAttribute('aria-pressed','false');});refreshProgress();loadGroups();
  }
  function hide(){setActive(false);}
  for(const g of D.get().dca)makeStrip(g.id);
  setLayerRows(C.getLayerRows?.());
  if(!section.classList.contains('layer-active'))scroller.setAttribute('aria-label','Bus, matrici, master e DCA, scorri orizzontalmente');
  if('IntersectionObserver'in window){
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting&&!entry.target.hidden&&!known(Number(entry.target.dataset.dca),'fdr')))loadGroups();
    },{root:scroller});
    for(const item of items.values())observer.observe(item.article);
  }
  refresh();
  C.subscribe(event=>{
    // A send or selection cannot change a DCA. Avoid repainting sixteen
    // masters on every mouse move or SOF action.
    if(!['selection','send','sof','parameter','processing','macros'].includes(event.type))refresh();
  });
  window.addEventListener('sculpt-strip-pins',event=>{
    if(String(event.detail?.id||'').startsWith('dca-')&&event.detail.side)loadGroups();
  });
  window.addEventListener('sculpt-live-state',event=>{
    const mode=event.detail?.mode,changed=mode!==lastMode;lastMode=mode;
    if(changed&&mode!=='live'){loadGeneration++;loading=false;}
    if(changed&&mode==='live'&&(active||[...items.values()].some(item=>item.article.closest('.strip-pin-rail'))))loadGroups();refresh();
  });
  window.SculptDcaBank=Object.freeze({open,hide,refresh,refreshProgress,syncNavigation,setLayerRows,element:id=>items.get(Number(String(id).replace('dca-','')))?.article||null,isOpen:()=>active});
})();
