(function(root){
  'use strict';
  const NS='http://www.w3.org/2000/svg',mounts=new Set();
  const frequencies=Object.freeze(Array.from({length:120},(_,i)=>440*2**((i-53)/12)));
  let owner=null,requestSignature='',reconcileQueued=false,nextMountId=0;
  const el=(name,className,text)=>{const node=document.createElement(name);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const svg=(name,attrs)=>{const node=document.createElementNS(NS,name);for(const [key,value]of Object.entries(attrs||{}))node.setAttribute(key,String(value));return node;};
  const setText=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
  const sourceLabel=id=>{const strip=root.SculptController?.getStrip?.(id);return strip?`${strip.kind} ${strip.number} · ${strip.name}`:id||'Sorgente non identificata';};
  const visible=mount=>!mount.disposed&&mount.enabled&&mount.container.isConnected&&document.visibilityState!=='hidden'&&(!mount.details||mount.details.open);
  function reconcile(){
    reconcileQueued=false;
    const next=[...mounts].filter(visible).at(-1)||null,live=root.SculptLive;
    const ownerChanged=owner!==next;owner=next;
    const connection=live?.snapshot?.(),signature=next?`${next.id}:${next.followConsole}:${next.sourceId}:${next.tap}:${connection?.mode}:${connection?.writable}:${live?.sessionToken?.()}`:'';
    const changed=signature!==requestSignature;
    if(changed){
      requestSignature=signature;
      const request=next&&connection?.mode==='live'?(next.followConsole?{followConsole:true}:{id:next.sourceId,tap:next.tap}):null;
      if(typeof live?.setRtaRequest==='function')Promise.resolve(live.setRtaRequest(request)).catch(error=>{if(owner===next&&next){next.error=error.message||String(error);next.schedule(true);}});
    }
    if(changed||ownerChanged)for(const mount of mounts)mount.schedule(true);
  }
  function queueReconcile(){if(reconcileQueued)return;reconcileQueued=true;queueMicrotask(reconcile);}
  /** Raw console band values shown on a relative vertical scale. No conversion
   * to dBFS, invented FFT or values inferred from fader/EQ positions. */
  function spectrumPath(bins,region={left:36,top:16,width:584,height:138}){
    if(!Array.isArray(bins)||bins.length!==120||bins.some(n=>!Number.isInteger(n)||n<-32768||n>32767))return '';
    const {left,top,width,height}=region,bottom=top+height;
    if(bins.every(n=>n===-32768))return '';
    const peak=Math.max(...bins),span=8192;
    const points=bins.map((value,index)=>{
      const x=left+Math.log(frequencies[index]/20)/Math.log(1000)*width;
      const level=Math.max(0,Math.min(1,(value-peak+span*.94)/span));
      return `${index?'L':'M'}${x.toFixed(2)},${(bottom-level*height).toFixed(2)}`;
    });
    return points.join(' ')+` L${(left+width).toFixed(2)},${bottom} L${left},${bottom} Z`;
  }
  function mount(container,options={}){
    const item={id:++nextMountId,container,sourceId:options.sourceId||'ch-1',followConsole:options.followConsole===true,tap:options.tap||'PREEQ',enabled:options.enabled!==false,details:options.details||null,disposed:false,error:'',timer:null,expiry:null,lastPaint:0,lastFrame:null};
    const box=el('div','sculpt-rta'+(options.compact?' sculpt-rta-compact':'')+(options.overlay?' sculpt-rta-with-overlay':''));
    const toolbar=el('div','sculpt-rta-toolbar'),power=el('button','sculpt-rta-power','RTA'),tap=el('select','sculpt-rta-tap'),status=el('span','sculpt-rta-status'),source=el('span','sculpt-rta-source');
    power.type='button';power.setAttribute('aria-label','Analizzatore RTA');power.setAttribute('aria-pressed',String(item.enabled));
    power.title='Analizzatore condiviso della WING · scala relativa';
    const tapNames={IN:'IN',FILT:'POST FILTRO',PREEQ:'PRE EQ',POSTEQ:'POST EQ',PREFDR:'PRE FADER',POST:'POST FADER',GATEK:'KEY GATE',DYNK:'KEY COMP'};
    for(const value of options.taps||['PREEQ','POSTEQ']){const opt=el('option','',tapNames[value]||value);opt.value=value;tap.append(opt);}tap.value=item.tap;tap.setAttribute('aria-label','Punto di analisi RTA');
    toolbar.append(power);let sourceSelect=null,sourceOptionsSignature='';
    if(options.selectSource){
      sourceSelect=el('select','sculpt-rta-source-select');sourceSelect.setAttribute('aria-label','Sorgente RTA');
      const follow=el('option','','RTA del banco');follow.value='console';sourceSelect.append(follow);
      sourceSelect.addEventListener('change',()=>{item.followConsole=sourceSelect.value==='console';if(!item.followConsole)item.sourceId=sourceSelect.value;item.error='';options.onSourceChange?.(sourceSelect.value);queueReconcile();});toolbar.append(sourceSelect);
    }
    const bank=el('button','sculpt-rta-bank','Banco');bank.type='button';bank.hidden=true;bank.title='Apri il vero spettro del banco senza attribuirlo a un canale non identificato';bank.addEventListener('click',()=>root.SculptUI?.open?.('meters',{tab:'rta'}));
    toolbar.append(tap,status,bank);box.append(toolbar);
    source.classList.add('sculpt-rta-caption');box.append(source);container.append(box);
    let graph=options.overlay,group;
    if(!graph){
      graph=svg('svg',{viewBox:'0 0 640 190',class:'sculpt-rta-graph',role:'img','aria-label':'Spettro RTA reale della WING · scala relativa'});
      for(const f of [20,50,100,200,500,1000,2000,5000,10000,20000]){const x=36+Math.log(f/20)/Math.log(1000)*584;graph.append(svg('line',{x1:x,y1:16,x2:x,y2:154,class:'sculpt-rta-grid'}));if([20,100,1000,10000,20000].includes(f)){const label=svg('text',{x,y:178,'text-anchor':'middle',class:'sculpt-rta-axis'});label.textContent=f>=1000?f/1000+'k':String(f);graph.append(label);}}
      for(const y of [16,62,108,154])graph.append(svg('line',{x1:36,y1:y,x2:620,y2:y,class:'sculpt-rta-grid'}));
      box.append(graph);
    }
    group=svg('g',{class:'sculpt-rta-spectrum','pointer-events':'none','aria-hidden':'true'});
    const trace=svg('path',{class:'sculpt-rta-trace',d:''});group.append(trace);
    graph.insertBefore(group,graph.querySelector('.fx-plot-fill')||null);
    let signature='';
    const paint=()=>{
      item.timer=null;if(item.disposed)return;item.lastPaint=Date.now();
      const live=root.SculptLive,state=live?.rtaState?.()||{status:'offline'},active=owner===item&&visible(item);
      let label=!item.enabled?'OFF':!active?(document.visibilityState==='hidden'?'In pausa':owner?'Altro pannello':'In pausa'):{offline:'Collega WING',disconnected:'WING scollegata',inactive:'In attesa',loading:'Lettura sorgente…',readonly:'Sorgente diversa · sola lettura',occupied:'RTA occupato dal banco',unmapped:'Fonte non associata al canale',waiting:'In attesa del segnale',live:'LIVE · relativo',stale:'Dati scaduti',unavailable:'Non disponibile'}[state.status]||'In attesa';
      if(item.error)label='Non disponibile';
      const valid=active&&state.status==='live'&&(item.followConsole?state.followConsole:!state.followConsole&&state.mappingVerified&&state.requestedId===item.sourceId&&state.requestedTap===item.tap)&&Array.isArray(state.binsRaw);
      const actual=state.sourceId?sourceLabel(state.sourceId):state.sourceLabel||'Sorgente WING non identificata',caption=active&&state.tap?`${actual} · ${tapNames[state.tap]||state.tap} · scala relativa`:`${item.followConsole?'RTA del banco':sourceLabel(item.sourceId)} · scala relativa`;
      tap.hidden=item.followConsole;bank.hidden=!options.compact||!active||!['unmapped','occupied','readonly'].includes(state.status);
      if(sourceSelect){const list=state.sources||[],nextOptions=list.map(item=>item.id+':'+item.label).join('|');if(nextOptions!==sourceOptionsSignature){sourceOptionsSignature=nextOptions;sourceSelect.replaceChildren();const follow=el('option','','RTA del banco');follow.value='console';sourceSelect.append(follow);for(const entry of list){const option=el('option','',sourceLabel(entry.id));option.value=entry.id;sourceSelect.append(option);}sourceSelect.value=item.followConsole?'console':item.sourceId;}}
      const nextSignature=[label,caption,state.error,item.error,item.enabled,valid].join('|');
      if(nextSignature!==signature){signature=nextSignature;setText(status,label);setText(source,caption);status.title=caption+' · '+(item.error||state.error||(state.status==='unmapped'?'Il firmware riporta solo un indice numerico, senza identificazione verificata del canale. Apri Banco per vedere il flusso globale reale.':state.status==='occupied'?'Il RTA della console ha priorità. Chiudi il suo RTA oppure disattiva l’overlay Home dal menu del banco. Spegni e riaccendi RTA per riprovare.':'120 bande misurate dalla WING; la scala verticale è relativa, non una misura calibrata in dBFS.'));box.dataset.state=valid?'live':state.status;power.setAttribute('aria-pressed',String(item.enabled));options.onStatus?.({label,state:valid?'live':state.status});}
      if(!valid){if(trace.getAttribute('d'))trace.setAttribute('d','');item.lastFrame=null;}
      else if(item.lastFrame!==state.binsRaw){item.lastFrame=state.binsRaw;trace.setAttribute('d',spectrumPath(state.binsRaw,options.region));}
      clearTimeout(item.expiry);item.expiry=null;
      if(valid&&Number.isFinite(state.receivedAt))item.expiry=setTimeout(()=>item.schedule(true),Math.max(1,1201-(Date.now()-state.receivedAt)));
    };
    item.schedule=immediate=>{
      if(item.disposed)return;
      if(immediate){clearTimeout(item.timer);item.timer=null;paint();return;}
      if(!item.timer)item.timer=setTimeout(paint,Math.max(0,100-(Date.now()-item.lastPaint)));
    };
    const live=root.SculptLive;
    const unsubscribe=live?.onRta?.(()=>item.schedule(false)),unsubscribeState=live?.subscribe?.(()=>{item.error='';queueReconcile();});
    const visibility=()=>{clearTimeout(item.timer);clearTimeout(item.expiry);item.timer=null;item.expiry=null;queueReconcile();};
    const detailsToggle=()=>queueReconcile();
    document.addEventListener('visibilitychange',visibility);item.details?.addEventListener('toggle',detailsToggle);
    power.addEventListener('click',()=>{item.enabled=!item.enabled;item.error='';queueReconcile();});
    tap.addEventListener('change',()=>{item.tap=tap.value;item.error='';queueReconcile();});
    mounts.add(item);queueReconcile();paint();
    return ()=>{if(item.disposed)return;item.disposed=true;mounts.delete(item);clearTimeout(item.timer);clearTimeout(item.expiry);unsubscribe?.();unsubscribeState?.();document.removeEventListener('visibilitychange',visibility);item.details?.removeEventListener('toggle',detailsToggle);group.remove();box.remove();queueReconcile();};
  }
  root.SculptRTA=Object.freeze({mount,frequencies,spectrumPath});
})(typeof window!=='undefined'?window:globalThis);
