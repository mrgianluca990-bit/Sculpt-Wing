(() => {
  'use strict';
  const C=window.SculptController,D=window.SculptDesk,U=window.SculptUI;
  if(!C||!D||!U)return;
  const {toPosition,toDb,format}=C.faderScale,clamp=window.SculptModel.clamp;
  const section=document.querySelector('.mixer-row.outputs'),scroller=document.getElementById('outputs-scroll'),normalBank=document.getElementById('outputs-bank');
  const bank=U.el('div','strip-bank dca-strip-bank');bank.id='dca-bank';bank.hidden=true;scroller.append(bank);
  const access=U.button('DCA',()=>active?hide():open(),'dca-bank-button');access.id='dca-bank-button';access.setAttribute('aria-label','Banco DCA 1–16');access.setAttribute('aria-pressed','false');
  section.querySelector('.bank-navigation').append(access);
  const items=new Map(),configRefreshers=new Set();let active=false,outputScroll=0,dcaScroll=0,lastMode='',loading=false,loadGeneration=0;
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
    const accepted=D.change(d=>{const g=d.dca.find(item=>item.id===id);if(g)g[key]=value;},'groups');refresh();return accepted;
  }
  function levelDialog(id){
    const g=group(id);if(!g||!editable(id,'fdr'))return;
    const content=U.el('form','dca-level-form'),input=U.el('input','desk-input');input.type='number';input.min=-90;input.max=10;input.step=.1;input.required=true;input.value=g.level;input.inputMode='decimal';input.setAttribute('aria-label',`Livello DCA ${id} in dB`);
    const apply=U.button('Applica livello',null,'desk-primary');apply.type='submit';
    const zero=U.button('0 dB',()=>{input.value='0';});
    content.append(U.field('Livello in dB',input),zero,apply);
    const modal=U.modal(`Livello DCA ${id} · ${g.name}`,content);
    content.addEventListener('submit',event=>{event.preventDefault();if(input.checkValidity()&&Number.isFinite(input.valueAsNumber)&&change(id,'level',Math.round(clamp(input.valueAsNumber,-90,10)*10)/10)!==false)modal.close();});input.focus();input.select();
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
    const retry=U.button('Rileggi DCA',()=>loadGroups());content.append(retry);
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
  }
  function makeStrip(id){
    const article=U.el('article','strip dca-strip');article.dataset.dca=id;article.style.setProperty('--color','#c78cd9');
    article.innerHTML=`<button type="button" class="strip-label"><span class="strip-index"><span>DCA ${String(id).padStart(2,'0')}</span><i>GRUPPO</i></span><span class="strip-name"></span></button>
      <button type="button" class="level-readout"><span></span><small>dB</small></button>
      <div class="fader-well"><div class="fader" role="slider" tabindex="0" aria-valuemin="-90" aria-valuemax="10" aria-orientation="vertical"><div class="fader-scale" aria-hidden="true">${[10,0,-10,-20,-40,-90].map(v=>`<div class="tick${v===0?' zero':''}" style="top:${(1-toPosition(v))*100}%"><span>${v===-90?'−∞':v>0?'+'+v:String(v).replace('-','−')}</span></div>`).join('')}</div><div class="fader-cap" aria-hidden="true"></div></div></div>
      <button type="button" class="dca-members-button"></button><div class="strip-buttons"><button type="button" class="mute-button">MUTE</button><button type="button" class="sof-button dca-solo-button">SOLO</button></div>`;
    const item={article,fader:article.querySelector('.fader'),name:article.querySelector('.strip-name'),label:article.querySelector('.strip-label'),readout:article.querySelector('.level-readout'),mute:article.querySelector('.mute-button'),solo:article.querySelector('.dca-solo-button'),members:article.querySelector('.dca-members-button')};items.set(id,item);
    item.label.addEventListener('click',()=>configure(id));item.members.addEventListener('click',()=>configure(id));item.readout.addEventListener('click',()=>levelDialog(id));
    item.mute.addEventListener('click',()=>change(id,'mute',!group(id).mute));item.solo.addEventListener('click',()=>change(id,'solo',!group(id).solo));
    item.fader.title='Trascina la testa · doppio clic: 0 dB · Maiusc: regolazione fine';
    let drag=null;
    const end=event=>{if(!drag||drag.pointer!==event.pointerId)return;const pointer=drag.pointer;drag=null;article.classList.remove('dragging');if(item.fader.hasPointerCapture?.(pointer))item.fader.releasePointerCapture(pointer);};
    item.fader.addEventListener('pointerdown',event=>{
      if(drag||event.button!==0||!event.target.closest('.fader-cap')||!editable(id,'fdr'))return;
      const inset=parseFloat(getComputedStyle(item.fader).getPropertyValue('--fader-inset'))||12;
      drag={pointer:event.pointerId,y:event.clientY,position:toPosition(group(id).level),travel:Math.max(20,item.fader.getBoundingClientRect().height-inset*2)};item.fader.focus({preventScroll:true});item.fader.setPointerCapture(event.pointerId);article.classList.add('dragging');event.preventDefault();
    });
    item.fader.addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;change(id,'level',toDb(drag.position+(drag.y-event.clientY)/drag.travel*(event.shiftKey?.2:1)));event.preventDefault();});
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
    if(!active)return;
    const assignmentsReady=membersKnown();
    for(const g of D.get().dca){
      if(!items.has(g.id))makeStrip(g.id);const item=items.get(g.id),loaded=known(g.id,'fdr'),writable=editable(g.id,'fdr');
      item.name.textContent=known(g.id,'name')?g.name:`DCA ${g.id}`;item.label.setAttribute('aria-label',`Modifica nome e membri DCA ${g.id} · ${item.name.textContent}`);
      item.readout.querySelector('span').textContent=loaded?format(g.level):'—';item.readout.setAttribute('aria-label',`Inserisci livello DCA ${g.id}`);item.readout.disabled=!writable;
      item.fader.style.setProperty('--position',loaded?toPosition(g.level):0);item.fader.setAttribute('aria-label',`Livello DCA ${g.id} · ${item.name.textContent}`);item.fader.setAttribute('aria-disabled',String(!writable));item.fader.setAttribute('aria-valuetext',loaded?format(g.level,true):'Valore non letto dalla WING');
      if(loaded)item.fader.setAttribute('aria-valuenow',g.level);else item.fader.removeAttribute('aria-valuenow');
      item.article.classList.toggle('live-unknown',!loaded);item.article.classList.toggle('muted',known(g.id,'mute')&&g.mute);
      for(const [key,node,wire]of [['mute',item.mute,'mute'],['solo',item.solo,'$solo']]){const on=known(g.id,wire)&&!!g[key];node.setAttribute('aria-label',`${key==='mute'?'Mute':'Solo'} DCA ${g.id}`);node.setAttribute('aria-pressed',String(on));node.classList.toggle('active',on);node.disabled=!editable(g.id,wire);}
      item.members.textContent=assignmentsReady?`${g.members.length} membri`:'— membri';item.members.setAttribute('aria-label',`Assegna membri DCA ${g.id}`);item.members.title=assignmentsReady?'Modifica i membri':'Assegnazioni non ancora lette dalla WING';item.members.disabled=loading;
    }
    document.getElementById('output-title').textContent='DCA';section.querySelector('.row-count').textContent=D.get().dca.length;
    document.getElementById('outputs-mode').textContent=loading?'LETTURA DCA DALLA WING…':'16 DCA · NOME E ASSEGNAZIONI DALLA STRIP';
    section.querySelectorAll('.bank-button').forEach(button=>{button.classList.remove('active');button.setAttribute('aria-pressed','false');});refreshProgress();
  }
  async function loadGroups(){
    if(!active||!live()?.isLive()||!live()?.isConnected?.()||loading)return;
    const generation=++loadGeneration;loading=true;refresh();
    try{await live().loadScope('groups');}
    catch(error){if(generation===loadGeneration&&live()?.isConnected?.())C.toast(error.message||'Lettura DCA non riuscita');}
    finally{if(generation===loadGeneration){loading=false;refresh();}}
  }
  function open(){
    if(active)return;window.SculptEditor?.close();outputScroll=scroller.scrollLeft;active=true;normalBank.hidden=true;bank.hidden=false;access.classList.add('active');access.setAttribute('aria-pressed','true');section.classList.add('dca-bank-active');scroller.setAttribute('aria-label','DCA da 1 a 16, scorri orizzontalmente');window.dispatchEvent(new CustomEvent('sculpt-dca-bank',{detail:{open:true}}));refresh();scroller.scrollLeft=dcaScroll;refreshProgress();loadGroups();
  }
  function hide(){
    if(!active)return;dcaScroll=scroller.scrollLeft;active=false;normalBank.hidden=false;bank.hidden=true;access.classList.remove('active');access.setAttribute('aria-pressed','false');section.classList.remove('dca-bank-active');section.querySelector('.row-count').textContent=C.getState().outputs.length;scroller.setAttribute('aria-label','Bus, matrici e master, scorri orizzontalmente');window.dispatchEvent(new CustomEvent('sculpt-dca-bank',{detail:{open:false}}));scroller.scrollLeft=outputScroll;C.refresh();scroller.dispatchEvent(new Event('scroll'));
  }
  C.subscribe(refresh);
  window.addEventListener('sculpt-live-state',event=>{
    const mode=event.detail?.mode,changed=mode!==lastMode;lastMode=mode;
    if(changed&&mode!=='live'){loadGeneration++;loading=false;}
    if(changed&&mode==='live')loadGroups();refresh();
  });
  window.SculptDcaBank=Object.freeze({open,hide,refresh,refreshProgress,isOpen:()=>active});
})();
