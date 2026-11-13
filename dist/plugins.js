(function(){
  'use strict';
  const Cat=window.SculptCatalog;
  const Panels=window.SculptPanelLayout;
  const live=()=>window.SculptLive?.isLive?.()===true;
  const liveState=ctx=>live()?(window.SculptLive?.processorState?.(ctx)||{ready:false}):{ready:true};
  const effectiveParameter=(ctx,p)=>live()?{...p,...(window.SculptLive?.parameterDefinition?.(ctx,p.key)||{})}:p;
  const editable=(ctx,p)=>!live()||!!(liveState(ctx).ready&&!liveState(ctx).loading&&!liveState(ctx).error&&!effectiveParameter(ctx,p).readOnly);

  const desk=()=>window.SculptDesk;
  const ctrl=()=>window.SculptController;
  const ui=()=>window.SculptUI;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const categoryNames={fx_mode:'Slot',fx_premium:'Premium',fx_standard:'Standard',fx_channel_eq:'Equalizzatori',fx_channel_strip:'Channel strip',eq:'EQ',filter:'Filter',gate_dynamics:'Dynamics'};
  const groupNames={'Input / output':'Input / Output','Controls':'Controlli','Master':'Master','Engine':'Engine','Reverb engine':'Riverbero','Reverb tail':'Coda del riverbero','Early reflections':'Prime riflessioni','Tone / decay':'Tono / Decay','Modulation / diffusion':'Modulazione / Diffusione','Tone / mix':'Tono / Mix','Multiband decay':'Decay per banda','Preset / display':'Preset / Vista','Crossover / alignment':'Crossover / Allineamento','Modulation':'Modulazione'};
  let opened=null;
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function btn(text,action,cls=''){const n=el('button',cls,text);n.type='button';if(action)n.addEventListener('click',action);return n;}
  function pretty(v,p){
    if(p?.type==='enum')return String(v);
    const n=Number(v);if(!Number.isFinite(n))return '—';
    if(p?.unit==='dB'&&n<=-90)return '−∞';
    if(p?.unit==='Hz'&&n>=1000)return `${Number((n/1000).toFixed(n<10000?2:1))}k`;
    const digits=(p?.step||1)>=1?0:(p?.step||1)>=.1?1:2;
    return Number(n.toFixed(digits)).toString().replace('-','−');
  }
  function stripName(id){const s=ctrl()?.getStrip(id);return s?`${s.kind} ${String(s.number).padStart(2,'0')} · ${s.name}`:'Non assegnato';}
  function contextLabel(ctx){return ctx.type==='fx'?`FX ${String(ctx.slot).padStart(2,'0')}`:`${stripName(ctx.id)} / ${{eq:'EQ',gate:'Gate',dyn:'Dynamics',filter:'Filter'}[ctx.block]||ctx.block}`;}
  function keyFor(ctx){return ctx.type==='fx'?`fx:${ctx.slot}`:`${ctx.id}:${ctx.block}`;}
  function instance(ctx){return desk().processor(ctx);}
  function rawValue(ctx,p){const value=instance(ctx)?.params?.[p.key];return value===undefined?p.default:value;}
  function normalize(p,value){
    if(p.type==='enum'){const selected=p.options.find(option=>String(option)===String(value));return selected===undefined?p.default:selected;}
    if(p.type==='boolean')return value?1:0;
    if(!Number.isFinite(Number(value)))return p.default;
    const step=Number(p.step)||1;return Number(clamp(p.min+Math.round((Number(value)-p.min)/step)*step,p.min,p.max).toFixed(6));
  }
  function position(p,value){
    const v=Number(value);if(p.log&&p.min>0&&p.max>p.min)return clamp(Math.log(Math.max(v,p.min)/p.min)/Math.log(p.max/p.min),0,1);
    return p.max===p.min?0:clamp((v-p.min)/(p.max-p.min),0,1);
  }
  function atPosition(p,positionValue){
    const v=clamp(positionValue,0,1);return normalize(p,p.log&&p.min>0?p.min*(p.max/p.min)**v:p.min+(p.max-p.min)*v);
  }
  function setParam(ctx,p,value){if(!editable(ctx,p))return;const def=effectiveParameter(ctx,p);desk().setParam(ctx,p.key,normalize(def,value));}
  function svgElement(tag,attrs){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs||{}))n.setAttribute(key,value);return n;}

  function makePlot(model,ctx,bindings){
    const panel=Panels?.forModel(model)||{};
    if(panel.display==='vu'||model.layout==='dynamics'&&!['WARM','WAVE'].includes(model.id)){
      const box=el('div','fx-visual fx-visual-dynamics');
      const meter=el('div','fx-vu fx-vu-unavailable');
      meter.append(el('span','fx-vu-title','GAIN REDUCTION'),el('span','fx-vu-ticks','20     10      7       5       3       1    0'));
      const needle=el('i','fx-vu-needle');needle.style.setProperty('--needle','38deg');
      meter.append(needle,el('span','fx-vu-mark',live()?'GR NON DISPONIBILE':'NESSUN SEGNALE'));
      const emblem=el('div','fx-emblem');emblem.append(el('strong','',model.name),el('span','',panel.subtitle||'DYNAMICS PROCESSOR'));box.append(meter,emblem);
      return box;
    }
    if(panel.display==='reverb'||panel.display==='delay'){
      const box=el('div',`fx-display fx-display-${panel.display}`);const header=el('div','fx-display-heading');
      header.append(el('span','',panel.display==='reverb'?'REVERB ENGINE':'DELAY ENGINE'),el('span','fx-display-source',live()?'WING PARAMETER':'OFFLINE PARAMETER'));box.append(header);
      const values=el('div','fx-display-values'),keys=panel.display==='reverb'?['dcy',model.id==='VSS3'?'rvpdly':'pdel',model.id==='VSS3'?'ertype':'size']:['time','dly','feed','sust'];
      const selected=keys.map(key=>model.parameters.find(p=>p.key===key)).filter(Boolean).slice(0,3);
      selected.forEach((p,i)=>{const cell=el('div',i===0?'fx-display-primary':'fx-display-secondary'),value=el('output'),unit=el('small','',p.unit||'');cell.append(el('label','',p.label),value,unit);values.append(cell);bindings.push(()=>{value.textContent=pretty(rawValue(ctx,p),p);});});
      box.append(values);
      const legend=el('div','fx-display-legend');
      if(model.id==='VSS3'){
        const name=el('span');bindings.push(()=>{name.textContent=String(instance(ctx)?.params?.preset||'Build');});legend.append(el('span','','EARLY → REVERB → MOD'),name);
      }else if(panel.display==='delay'){
        const bpm=el('span');const time=selected.find(p=>['time','dly'].includes(p.key));bindings.push(()=>{const value=Number(time&&rawValue(ctx,time));bpm.textContent=value>0?`${(60000/value).toFixed(1)} BPM · ¼`:'— BPM';});legend.append(el('span','','INPUT → ECHO → FEEDBACK'),bpm);
      }else legend.append(el('span','','EARLY → TAIL'),el('span','','PARAMETRI DEL PROCESSORE'));
      box.append(legend);return box;
    }
    if(panel.display==='amp'){
      const box=el('div','fx-visual fx-visual-amp'),grille=el('div','fx-amp-grille');grille.append(el('strong','',model.name));box.append(grille);return box;
    }
    if(panel.display==='tape'){
      const box=el('div','fx-tape-deck');box.append(el('span','fx-tape-path','INPUT'),el('i','fx-tape-head'),el('span','fx-tape-saturation','SATURATION'),el('i','fx-tape-head'),el('span','fx-tape-path','OUTPUT'));return box;
    }
    if(model.id!=='STD'&&model.layout!=='geq')return null;
    const box=el('div','fx-visual fx-eq-display');
    const svg=svgElement('svg',{viewBox:'0 0 640 190',role:'img','aria-label':model.id==='STD'?'Equalizzatore: trascina i punti per frequenza e guadagno':'Bande impostate dell’equalizzatore grafico'});
    const X=f=>36+Math.log(clamp(f,20,20000)/20)/Math.log(1000)*584,Y=g=>85-clamp(g,-18,18)*3.5;
    [20,50,100,200,500,1000,2000,5000,10000,20000].forEach(f=>{const x=X(f);svg.append(svgElement('line',{x1:x,y1:16,x2:x,y2:154,class:'fx-plot-grid'}));if([20,100,1000,10000,20000].includes(f)){const t=svgElement('text',{x,y:178,'text-anchor':'middle',class:'fx-axis-label'});t.textContent=f>=1000?`${f/1000}k`:f;svg.append(t);}});
    [-15,0,15].forEach(g=>{const y=Y(g);svg.append(svgElement('line',{x1:36,y1:y,x2:620,y2:y,class:g===0?'fx-plot-zero':'fx-plot-grid'}));const t=svgElement('text',{x:27,y:y+3,'text-anchor':'end',class:'fx-axis-label'});t.textContent=g>0?`+${g}`:g;svg.append(t);});
    const fill=svgElement('path',{class:'fx-plot-fill'}),line=svgElement('path',{fill:'none',class:'fx-plot-line'});svg.append(fill,line);box.append(svg);
    const freq=value=>{const t=String(value).toLowerCase();if(t.includes('k')){const [a,b]=t.split('k');return Number(a)*1000+(b?Number(`0.${b}`)*1000:0);}return Number(t);};
    const defs=Object.fromEntries(model.parameters.map(p=>[p.key,p]));
    const bands=model.id==='STD'?['l','1','2','3','4','5','6','h'].filter(k=>defs[k+'g']).map(k=>({g:defs[k+'g'],f:defs[k+'f'],q:defs[k+'q'],type:k==='l'?'low':k==='h'?'high':'peak',label:k.toUpperCase(),prefix:k})):model.parameters.filter(p=>/^\d+(?:k\d*)?$/.test(p.key)).map(p=>({g:p,fixed:freq(p.key),label:p.key}));
    function biquad(band,values){
      const gain=Number(values[band.g.key]??band.g.default),f=Number(values[band.f.key]??band.f.default),q=Math.max(.05,Number(values[band.q.key]??band.q.default));
      const A=10**(gain/40),w=2*Math.PI*f/48000,c=Math.cos(w),sn=Math.sin(w),alpha=sn/(2*q),eq=values[band.prefix+'eq'];
      if(band.type==='low'&&eq==='SHV'){const s=2*Math.sqrt(A)*alpha;return [A*((A+1)-(A-1)*c+s),2*A*((A-1)-(A+1)*c),A*((A+1)-(A-1)*c-s),(A+1)+(A-1)*c+s,-2*((A-1)+(A+1)*c),(A+1)+(A-1)*c-s];}
      if(band.type==='high'&&eq==='SHV'){const s=2*Math.sqrt(A)*alpha;return [A*((A+1)+(A-1)*c+s),-2*A*((A-1)+(A+1)*c),A*((A+1)+(A-1)*c-s),(A+1)-(A-1)*c+s,2*((A-1)-(A+1)*c),(A+1)-(A-1)*c-s];}
      return [1+alpha*A,-2*c,1-alpha*A,1+alpha/A,-2*c,1-alpha/A];
    }
    function response(coeff,f){const w=2*Math.PI*f/48000,[b0,b1,b2,a0,a1,a2]=coeff,c=Math.cos(w),s=Math.sin(w),c2=Math.cos(2*w),s2=Math.sin(2*w);const nr=(b0+b1*c+b2*c2)**2+(-b1*s-b2*s2)**2,dr=(a0+a1*c+a2*c2)**2+(-a1*s-a2*s2)**2;return 10*Math.log10(Math.max(nr,1e-15)/Math.max(dr,1e-15));}
    const markers=bands.map((b,i)=>{const group=svgElement('g',{class:'fx-eq-point','data-band':b.label,tabindex:'0',role:'slider','aria-label':`Banda ${b.label}`,style:`--band-color:${['#e58664','#d1b159','#8ebc80','#62b5af','#6e9dce','#9b8bd0','#ba83ad','#cf7983'][i%8]}`});const label=svgElement('text',{'text-anchor':'middle',y:3});label.textContent=b.label;group.append(svgElement('circle',{r:9}),label);svg.append(group);
      if(model.id==='STD'){
        let drag=null;
        const change=event=>{const rect=svg.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*640,y=(event.clientY-rect.top)/rect.height*190;setParam(ctx,b.f,20*1000**clamp((x-36)/584,0,1));setParam(ctx,b.g,(85-y)/3.5);update();};
        group.addEventListener('pointerdown',event=>{if(!editable(ctx,b.g))return;drag=event.pointerId;group.setPointerCapture(event.pointerId);event.preventDefault();change(event);});
        group.addEventListener('pointermove',event=>{if(drag===event.pointerId){event.preventDefault();change(event);}});for(const name of ['pointerup','pointercancel','lostpointercapture'])group.addEventListener(name,()=>drag=null);
        group.addEventListener('keydown',event=>{const v=instance(ctx)?.params||{};if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();setParam(ctx,b.g,Number(v[b.g.key]??b.g.default)+(event.key==='ArrowUp'?.1:-.1));}else if(['ArrowRight','ArrowLeft'].includes(event.key)){event.preventDefault();setParam(ctx,b.f,Number(v[b.f.key]??b.f.default)*(event.key==='ArrowRight'?1.03:1/1.03));}});
      }else{group.removeAttribute('tabindex');group.removeAttribute('role');}
      return group;
    });
    function update(){const values=instance(ctx)?.params||{};let points;
      if(model.id==='STD'){const coeffs=bands.map(b=>biquad(b,values));points=Array.from({length:193},(_,i)=>{const f=20*1000**(i/192),g=coeffs.reduce((sum,coef)=>sum+response(coef,f),0);return [X(f),Y(g)];});}
      else points=bands.map(b=>[X(b.fixed),Y(Number(values[b.g.key]??b.g.default))]);
      const d=points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');line.setAttribute('d',d);fill.setAttribute('d',`${d} L620,${Y(0)} L36,${Y(0)} Z`);
      bands.forEach((b,i)=>{const f=b.fixed||Number(values[b.f.key]??b.f.default),g=Number(values[b.g.key]??b.g.default);markers[i].setAttribute('transform',`translate(${X(f)},${Y(g)})`);markers[i].setAttribute('aria-valuetext',`${Math.round(f)} Hz, ${g.toFixed(1)} dB`);});
    }
    bindings.push(update);update();box.append(el('span','fx-plot-caption',model.id==='STD'?`TRASCINA I PUNTI · risposta di riferimento a 48 kHz${defs.tilt?' · tilt escluso dal grafico':''}`:'BANDE IMPOSTATE · nessun analizzatore audio'));return box;
  }

  function parameterControl(model,ctx,p,bindings,compact=false,presentation={}){
    p=effectiveParameter(ctx,p);
    const wrap=el('div',`fx-control fx-control-${p.type}${compact?' fx-control-fader':''}`);wrap.dataset.parameter=p.key;
    const gestureAllowed=()=>editable(ctx,p)&&!wrap.closest('[hidden],details:not([open])');
    if(p.readOnly)wrap.classList.add('fx-control-readonly');
    const label=el('label','fx-control-label',p.label);wrap.append(label);
    if(p.type==='string'){
      const input=el('input','fx-select fx-text');input.type='text';input.maxLength=p.maxLength||256;input.setAttribute('aria-label',p.label);input.addEventListener('change',()=>{if(editable(ctx,p))desk().setParam(ctx,p.key,input.value);});wrap.append(input);const sync=()=>{input.disabled=!editable(ctx,p);if(document.activeElement!==input)input.value=String(rawValue(ctx,p)??'');};bindings.push(sync);sync();return wrap;
    }
    if(p.type==='boolean'){
      const isTrigger=p.key==='load';
      const toggle=btn(isTrigger?'LOAD':'',()=>{
        if(isTrigger){if(live()){if(editable(ctx,p))Promise.resolve(window.SculptLive?.triggerProcessor?.(ctx,p.key)).catch(error=>ui().toast(error.message||String(error)));}else loadFactoryDemo(ctx,model);return;}
        setParam(ctx,p,!Number(rawValue(ctx,p)));
      },'fx-toggle');toggle.setAttribute('aria-label',p.label);toggle.setAttribute('role',isTrigger?'button':'switch');
      const lamp=el('i');const text=el('span','',isTrigger?'LOAD':'OFF');toggle.replaceChildren(lamp,text);wrap.append(toggle);
      const sync=()=>{toggle.disabled=!editable(ctx,p);const on=!!Number(rawValue(ctx,p));toggle.classList.toggle('on',on);if(!isTrigger){toggle.setAttribute('aria-checked',String(on));text.textContent=on?'ON':'OFF';}};
      bindings.push(sync);sync();return wrap;
    }
    if(p.type==='enum'){
      if(presentation.kind==='switch'){
        const toggle=btn('',()=>{if(!editable(ctx,p))return;const index=Math.max(0,p.options.findIndex(value=>String(value)===String(rawValue(ctx,p))));setParam(ctx,p,p.options[(index+1)%p.options.length]);},'fx-toggle');toggle.setAttribute('role','switch');toggle.setAttribute('aria-label',p.label);toggle.append(el('i'),el('span'));wrap.append(toggle);
        const sync=()=>{const index=Math.max(0,p.options.findIndex(value=>String(value)===String(rawValue(ctx,p)))),on=index>0;toggle.disabled=!editable(ctx,p);toggle.classList.toggle('on',on);toggle.setAttribute('aria-checked',String(on));toggle.querySelector('span').textContent=p.optionLabels?.[index]||String(p.options[index]);};bindings.push(sync);sync();return wrap;
      }
      const select=el('select','fx-select');select.setAttribute('aria-label',p.label);
      for(const [index,value]of p.options.entries()){const option=el('option','',p.optionLabels?.[index]||String(value));option.value=String(value);select.append(option);}
      select.addEventListener('change',()=>setParam(ctx,p,select.value));wrap.append(select);
      let enumButtons=[];
      if(presentation.kind==='knob'||presentation.kind==='ring'){
        const rotary=el('div','fx-knob fx-rotary-choice');rotary.tabIndex=0;rotary.setAttribute('role','slider');rotary.setAttribute('aria-label',p.label);rotary.setAttribute('aria-valuemin','0');rotary.setAttribute('aria-valuemax',String(p.options.length-1));rotary.append(el('i','fx-knob-pointer'));wrap.insertBefore(rotary,select);
        const selectedIndex=()=>Math.max(0,p.options.findIndex(value=>String(value)===String(rawValue(ctx,p))));
        const choose=index=>setParam(ctx,p,p.options[clamp(Math.round(index),0,p.options.length-1)]);
        let gesture=null;
        rotary.addEventListener('pointerdown',event=>{if(!gestureAllowed()||(event.pointerType==='mouse'&&event.button!==0))return;gesture={pointer:event.pointerId,y:event.clientY,index:selectedIndex()};rotary.setPointerCapture(event.pointerId);rotary.classList.add('dragging');event.preventDefault();});
        rotary.addEventListener('pointermove',event=>{if(!gesture||gesture.pointer!==event.pointerId)return;if(!gestureAllowed()){release(event);return;}choose(gesture.index+(gesture.y-event.clientY)/18*(event.shiftKey?.25:1));event.preventDefault();});
        const release=event=>{if(gesture?.pointer!==event.pointerId)return;gesture=null;rotary.classList.remove('dragging');if(rotary.hasPointerCapture?.(event.pointerId))rotary.releasePointerCapture(event.pointerId);};for(const type of ['pointerup','pointercancel','lostpointercapture'])rotary.addEventListener(type,release);
        rotary.addEventListener('keydown',event=>{const delta={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1}[event.key];if(delta!==undefined){event.preventDefault();choose(selectedIndex()+delta);}else if(event.key==='Home'||event.key==='End'){event.preventDefault();choose(event.key==='Home'?0:p.options.length-1);}});
        bindings.push(()=>{const index=selectedIndex(),writable=editable(ctx,p),pos=index/Math.max(1,p.options.length-1);rotary.style.setProperty('--turn',`${-135+(presentation.reverse?1-pos:pos)*270}deg`);rotary.setAttribute('aria-valuenow',String(index));rotary.setAttribute('aria-valuetext',p.optionLabels?.[index]||String(p.options[index]));rotary.title=`${p.label}: ${p.optionLabels?.[index]||String(p.options[index])}${p.unit?' '+p.unit:''}`;rotary.setAttribute('aria-disabled',String(!writable));rotary.tabIndex=writable?0:-1;});
      }else if((p.options.length<=6||presentation.kind==='buttons')&&!['value','digital','preset'].includes(presentation.kind)){
        const choices=el('div','fx-enum-buttons');select.classList.add('fx-select-with-buttons');
        const ordered=presentation.order?[...p.options].sort((a,b)=>{const ai=presentation.order.findIndex(v=>String(v)===String(a)),bi=presentation.order.findIndex(v=>String(v)===String(b));return (ai<0?999:ai)-(bi<0?999:bi);}):p.options;
        enumButtons=ordered.map(value=>{const index=p.options.indexOf(value),b=btn(p.optionLabels?.[index]||String(value),()=>setParam(ctx,p,value),'fx-enum-button');b.setAttribute('aria-label',`${p.label}: ${value}`);b.dataset.choice=p.optionLabels?.[index]||String(value);choices.append(b);return [b,value];});wrap.append(choices);
      }
      const sync=()=>{select.disabled=!editable(ctx,p);const current=String(rawValue(ctx,p));if(document.activeElement!==select)select.value=current;for(const [b,value]of enumButtons){b.disabled=!editable(ctx,p);b.setAttribute('aria-pressed',String(current===String(value)));}};bindings.push(sync);sync();return wrap;
    }
    const horizontal=compact&&presentation.orientation==='horizontal';
    const knob=el('div',compact?`fx-vertical-fader${horizontal?' fx-horizontal-fader':''}`:'fx-knob');knob.tabIndex=0;knob.setAttribute('role','slider');knob.setAttribute('aria-label',p.label);knob.setAttribute('aria-valuemin',p.min);knob.setAttribute('aria-valuemax',p.max);knob.setAttribute('aria-orientation',horizontal?'horizontal':'vertical');
    const pointer=el('i',compact?'fx-geq-cap':'fx-knob-pointer');knob.append(pointer);wrap.append(knob);
    const valueRow=el('div','fx-value-row');const input=el('input','fx-number');input.type='number';input.inputMode='decimal';input.min=p.min;input.max=p.max;input.step='any';input.setAttribute('aria-label',`${p.label}${p.unit?' in '+p.unit:''}`);
    const suffix=el('span','fx-unit',p.unit||'');valueRow.append(input,suffix);wrap.append(valueRow);
    const limits=el('div','fx-control-limits');limits.append(el('span','',pretty(p.min,p)),el('span','',pretty(p.max,p)));wrap.append(limits);
    const sync=()=>{const writable=editable(ctx,p);input.disabled=!writable;knob.setAttribute('aria-disabled',String(!writable));knob.tabIndex=writable?0:-1;const value=Number(rawValue(ctx,p)),pos=position(p,value);knob.style.setProperty('--turn',`${-135+(presentation.reverse?1-pos:pos)*270}deg`);knob.style.setProperty('--position',pos);knob.setAttribute('aria-valuenow',String(value));knob.setAttribute('aria-valuetext',`${pretty(value,p)} ${p.unit||''}`);knob.title=`${p.label}: ${pretty(value,p)} ${p.unit||''}`;if(document.activeElement!==input)input.value=String(Number(value.toFixed(3)));};
    let drag=null;
    knob.addEventListener('pointerdown',event=>{if(!gestureAllowed())return;if(event.pointerType==='mouse'&&event.button!==0)return;if(compact&&event.target!==pointer&&!pointer.contains(event.target))return;const rect=knob.getBoundingClientRect(),capRect=pointer.getBoundingClientRect();drag={id:event.pointerId,y:event.clientY,x:event.clientX,pos:position(p,rawValue(ctx,p)),travel:compact?Math.max(20,horizontal?rect.width-capRect.width-10:rect.height-capRect.height-10):130};knob.setPointerCapture(event.pointerId);knob.classList.add('dragging');event.preventDefault();});
    knob.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;if(!gestureAllowed()){end(event);return;}const sensitivity=event.shiftKey?.2:1,delta=horizontal?event.clientX-drag.x:drag.y-event.clientY;setParam(ctx,p,atPosition(p,drag.pos+delta/drag.travel*sensitivity));sync();event.preventDefault();});
    const end=event=>{if(drag?.id!==event.pointerId)return;drag=null;knob.classList.remove('dragging');if(knob.hasPointerCapture?.(event.pointerId))knob.releasePointerCapture(event.pointerId);};knob.addEventListener('pointerup',end);knob.addEventListener('pointercancel',end);knob.addEventListener('lostpointercapture',end);
    if(!compact)knob.addEventListener('dblclick',()=>{setParam(ctx,p,p.default);sync();});
    knob.addEventListener('keydown',event=>{
      if(!editable(ctx,p))return;const current=Number(rawValue(ctx,p));let next;
      if(event.key==='ArrowUp'||event.key==='ArrowRight')next=p.log?atPosition(p,position(p,current)+.01):current+p.step*(event.shiftKey?10:1);
      else if(event.key==='ArrowDown'||event.key==='ArrowLeft')next=p.log?atPosition(p,position(p,current)-.01):current-p.step*(event.shiftKey?10:1);
      else if(event.key==='Home')next=p.min;else if(event.key==='End')next=p.max;else return;
      event.preventDefault();setParam(ctx,p,next);sync();
    });
    const commit=()=>{if(input.value.trim()!==''&&Number.isFinite(input.valueAsNumber))setParam(ctx,p,input.valueAsNumber);input.value=String(rawValue(ctx,p));sync();};
    input.addEventListener('change',commit);input.addEventListener('blur',commit);input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit();input.blur();}});
    bindings.push(sync);sync();return wrap;
  }

  function referenceFor(model){const layouts=window.SculptOriginalLayouts||{};return layouts[`${model.category}:${model.id}`]||layouts[model.id]||null;}
  function makeReferenceSurface(model,ctx,reference,bindings,cleanups){
    if(reference.pages?.length){
      const shell=el('div','fx-original-channel'),tabs=el('div','fx-original-page-tabs'),panes=el('div','fx-original-pages'),used=new Set(),buttons=[];tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Sezioni del processore');shell.append(tabs,panes);
      const select=id=>{for(const entry of buttons){const selected=entry.id===id;entry.button.setAttribute('aria-selected',String(selected));entry.button.tabIndex=selected?0:-1;entry.pane.hidden=!selected;}};
      for(const [index,page]of reference.pages.entries()){
        const surface=makeReferenceSurface(model,ctx,{sourcePage:reference.sourcePage,...page.layout},bindings,cleanups),pane=el('section','fx-original-page');surface.used.forEach(key=>used.add(key));
        if(page.enableKey&&!used.has(page.enableKey)){const p=model.parameters.find(p=>p.key===page.enableKey);if(p){used.add(p.key);const enable=parameterControl(model,ctx,p,bindings,false,{kind:'switch'});enable.classList.add('fx-original-page-enable');enable.querySelector('.fx-control-label').textContent=page.label;pane.append(enable);bindings.push(()=>pane.classList.toggle('fx-original-page-bypassed',!Number(rawValue(ctx,p))));}}
        pane.append(surface.element);pane.setAttribute('role','tabpanel');pane.setAttribute('aria-label',page.label);const button=btn(page.label,()=>select(page.id),'fx-original-page-tab');button.setAttribute('role','tab');button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?reference.pages.length-1:(index+(event.key==='ArrowRight'?1:-1)+reference.pages.length)%reference.pages.length;select(reference.pages[next].id);buttons[next].button.focus();});buttons.push({id:page.id,button,pane});tabs.append(button);panes.append(pane);
      }
      select(reference.defaultPage||reference.pages[0].id);return {element:shell,used};
    }
    const viewport=el('div','fx-original-viewport'),sizer=el('div','fx-original-sizer'),stage=el('div',`fx-original-stage fx-original-${reference.skin||'metal'}`);
    stage.dataset.referencePage=String(reference.sourcePage);stage.setAttribute('aria-label',`${model.name} · pannello del processore`);stage.style.width=`${reference.width}px`;stage.style.height=`${reference.height}px`;
    if(reference.background)stage.style.background=reference.background;if(reference.foreground)stage.style.color=reference.foreground;
    for(const corner of ['tl','tr','bl','br'])stage.append(el('i',`fx-original-screw fx-original-screw-${corner}`));
    for(const region of reference.regions||[]){const box=el('div','fx-original-region');Object.assign(box.style,{left:`${region.x}px`,top:`${region.y}px`,width:`${region.width}px`,height:`${region.height}px`,background:region.fill||'transparent',border:region.stroke?`1px solid ${region.stroke}`:'none',borderRadius:`${region.radius||0}px`});stage.append(box);}
    for(const line of reference.lines||[]){const rule=el('div','fx-original-line'),length=Math.hypot(line.x2-line.x1,line.y2-line.y1),angle=Math.atan2(line.y2-line.y1,line.x2-line.x1)*180/Math.PI;Object.assign(rule.style,{left:`${line.x1}px`,top:`${line.y1}px`,width:`${length}px`,background:line.color||'#b4b4a6',transform:`rotate(${angle}deg)`});stage.append(rule);}
    for(const caption of reference.labels||[]){const label=el('div','fx-original-label',caption.text);Object.assign(label.style,{left:`${caption.x}px`,top:`${caption.y}px`,fontSize:`${caption.size||12}px`,color:caption.color||'',transform:`translate(${caption.align==='left'?'0':caption.align==='right'?'-100%':'-50%'},-50%)`});stage.append(label);}
    if(reference.power){const spec=reference.power,size=spec.size||64,power=btn(spec.label||'IN',()=>desk().enableProcessor(ctx,!instance(ctx).enabled),'fx-original-power');Object.assign(power.style,{left:`${spec.x-size/2}px`,top:`${spec.y-16}px`,width:`${size}px`});power.setAttribute('role','switch');power.setAttribute('aria-label',`${model.name}: processore attivo`);bindings.push(()=>{power.classList.toggle('on',!!instance(ctx).enabled);power.setAttribute('aria-checked',String(!!instance(ctx).enabled));power.disabled=live()&&!liveState(ctx).ready;});stage.append(power);}
    for(const spec of reference.meters||[]){
      let meter;
      if(spec.kind==='led'){
        meter=el('div',`fx-original-led-meter ${spec.orientation==='horizontal'?'horizontal':'vertical'}`);const cells=el('div','fx-original-led-cells');for(let i=0;i<(spec.count||12);i++){const cell=el('i');cell.style.setProperty('--led-color',spec.color||(i<3?'#d64b39':'#e8b731'));cells.append(cell);}meter.append(cells,el('span','',spec.label||'GR'));
      }else if(spec.kind==='fader-meter'){
        meter=el('div','fx-original-fader-meter');meter.append(el('i'),el('span','','—'),el('small','',spec.label||'GAIN'));
      }else{
        meter=el('div',`fx-vu fx-vu-unavailable fx-original-vu${spec.dark?' fx-original-vu-dark':''}`);meter.append(el('span','fx-vu-title',spec.label||'GAIN REDUCTION'),el('span','fx-vu-ticks',spec.ticks||(spec.dark?'0      4      8      12      16      20':'−20    −10    −7    −5    −3    −1    0')));const needle=el('i','fx-vu-needle');needle.style.setProperty('--needle','38deg');meter.append(needle,el('span','fx-vu-mark',live()?'GR NON DISPONIBILE':'NESSUN SEGNALE'));
      }
      Object.assign(meter.style,{left:`${spec.x}px`,top:`${spec.y}px`,width:`${spec.width}px`,height:`${spec.height}px`});meter.classList.add('fx-original-meter');meter.setAttribute('aria-label',`${spec.label||'Gain reduction'}: ${live()?'dato non disponibile':'nessun segnale'}`);stage.append(meter);
    }
    for(const spec of reference.displays||[]){
      const display=el('div','fx-original-plot');Object.assign(display.style,{left:`${spec.x}px`,top:`${spec.y}px`,width:`${spec.width}px`,height:`${spec.height}px`});
      if(spec.kind==='parametric-eq'){display.classList.add('fx-original-parametric-eq');const plot=makePlot(model,ctx,bindings);if(plot)display.append(plot);}
      else if(spec.kind==='transfer'){
        const svg=svgElement('svg',{viewBox:'0 0 400 220','aria-label':'Curva di riferimento della soglia e del rapporto impostati'}),curve=svgElement('path',{fill:'none',stroke:'#b4ca72','stroke-width':2.5}),threshold=svgElement('line',{y1:16,y2:190,stroke:'#a7bca080','stroke-dasharray':'4 4'}),min=spec.min??-80,max=spec.max??0,X=value=>35+(value-min)/(max-min)*340,Y=value=>190-(clamp(value,min,max)-min)/(max-min)*174;
        for(let value=min;value<=max;value+=20){svg.append(svgElement('line',{x1:X(value),y1:16,x2:X(value),y2:190}),svgElement('line',{x1:35,y1:Y(value),x2:375,y2:Y(value)}));const label=svgElement('text',{x:X(value),y:210,'text-anchor':'middle',fill:'#b8c4ac','font-size':10,stroke:'none'});label.textContent=value;svg.append(label);}svg.append(svgElement('line',{x1:35,y1:190,x2:375,y2:16,stroke:'#76947f80','stroke-dasharray':'3 5'}),threshold,curve);display.append(svg,el('small','',spec.label||'CURVA SOGLIA / RAPPORTO'));
        const get=(key,fallback)=>{const p=model.parameters.find(p=>p.key===key);return p?rawValue(ctx,p):fallback;};bindings.push(()=>{const t=Number(get(spec.keys?.threshold||'thr',-20)),rawRatio=String(get(spec.keys?.ratio||'ratio',2)),ratio=Math.max(1,parseFloat(rawRatio.split(':').at(-1))||1),range=Number(get(spec.keys?.range||'range',60)),gate=rawRatio.toLowerCase()==='gate';const path=Array.from({length:241},(_,i)=>{const x=min+i/240*(max-min);let y=x;if(spec.mode==='expander'&&x<t)y=t+(x-t)*ratio;else if(spec.mode==='gate'&&x<t)y=x-Math.min(range,gate?range:(t-x)*(ratio-1));else if(spec.mode==='ducker'&&x>=t)y=x-range;else if((!spec.mode||spec.mode==='compressor')&&x>t)y=t+(x-t)/ratio;return `${i?'L':'M'}${X(x).toFixed(2)},${Y(y).toFixed(2)}`;}).join(' ');curve.setAttribute('d',path);threshold.setAttribute('x1',X(t));threshold.setAttribute('x2',X(t));});display.title='Curva statica di riferimento: soglia e rapporto. Knee, inviluppo e audio non sono rappresentati';
      }
      else if(spec.kind==='envelope'){const svg=svgElement('svg',{viewBox:'0 0 400 160','aria-label':'Inviluppo impostato: attack, hold, release'}),curve=svgElement('path',{fill:'#97ba6b22',stroke:'#a5c280','stroke-width':2});svg.append(curve);display.append(svg,el('small','',spec.label||'ENVELOPE'));bindings.push(()=>{const values=['attack','hold','release'].map(name=>{const key=spec.keys?.[name],p=model.parameters.find(p=>p.key===key);return p?Math.max(0,Number(rawValue(ctx,p))||0):0;}),total=Math.max(1,values.reduce((a,b)=>a+b,0)),attack=15+values[0]/total*370,hold=attack+values[1]/total*370;curve.setAttribute('d',`M15,135 L${attack},28 L${hold},28 L385,135 Z`);});}
      else if(spec.kind==='value'){const p=model.parameters.find(p=>p.key===spec.key);if(!p)continue;display.classList.add('fx-original-value-display');display.append(el('small','',spec.label||p.label));const value=el('output');display.append(value);if(spec.color)display.style.color=spec.color;bindings.push(()=>{value.textContent=`${pretty(rawValue(ctx,p),p)}${p.unit?' '+p.unit:''}`;});}
      else if(spec.kind==='text'){display.classList.add('fx-original-text-display');display.textContent=spec.text||spec.label||model.name;if(spec.color)display.style.color=spec.color;}else{const svg=svgElement('svg',{viewBox:'0 0 400 160','aria-hidden':'true'});for(let x=25;x<400;x+=50)svg.append(svgElement('line',{x1:x,y1:12,x2:x,y2:136}));for(let y=12;y<=136;y+=31)svg.append(svgElement('line',{x1:15,y1:y,x2:390,y2:y}));display.append(svg,el('small','',spec.label||'FREQUENCY / GAIN'));display.title='La curva proprietaria e l’analisi del segnale non sono disponibili';}stage.append(display);
    }
    const used=new Set(),grouped=[];
    for(const spec of reference.controls){
      const parameter=model.parameters.find(p=>p.key===spec.key);if(!parameter||used.has(spec.key))continue;used.add(spec.key);
      const isFader=spec.kind==='fader',control=parameterControl(model,ctx,parameter,bindings,isFader,spec),size=spec.size||64;
      control.classList.add('fx-original-control',`fx-original-control-${spec.kind||'knob'}`);if(spec.variant)control.classList.add(`fx-original-${spec.variant}`);if(spec.labelPosition==='below')control.classList.add('fx-original-label-below');control.dataset.surfaceX=String(spec.x);control.dataset.surfaceY=String(spec.y);control.style.setProperty('--original-knob-size',`${size}px`);if(spec.color)control.style.setProperty('--original-knob-color',spec.color);
      const label=control.querySelector('.fx-control-label');if(spec.label!==undefined)label.textContent=spec.label;
      if(isFader){const horizontal=spec.orientation==='horizontal',height=spec.height||(horizontal?40:155),width=spec.width||(horizontal?155:size);Object.assign(control.style,{left:`${spec.x-width/2}px`,top:`${spec.y-height/2-18}px`,width:`${width}px`});const slider=control.querySelector('.fx-vertical-fader');slider.style.height=`${height}px`;if(horizontal)slider.style.width=`${width}px`;else{slider.style.width=`${Math.min(40,width)}px`;control.style.setProperty('--original-cap-width',`${Math.min(27,width-4)}px`);}}
      else if(spec.kind==='value'||spec.kind==='digital'){const width=spec.width||size,height=spec.height||32,digital=spec.kind==='digital';Object.assign(control.style,{left:`${spec.x-width/2}px`,top:`${spec.y-height/2-(digital?0:18)}px`,width:`${width}px`});control.style.setProperty('--original-value-height',`${digital?Math.max(22,height-20):height}px`);const knob=control.querySelector('.fx-knob');if(knob){knob.hidden=true;knob.tabIndex=-1;}}
      else if(spec.kind==='key'){const width=spec.width||size,height=spec.height||80;Object.assign(control.style,{left:`${spec.x-width/2}px`,top:`${spec.y-height/2}px`,width:`${width}px`,height:`${height}px`});control.classList.add('fx-piano-key');control.dataset.note=spec.label||parameter.key.slice(1).toUpperCase();control.style.setProperty('--key-color',spec.color||'#dcded1');label.hidden=true;const button=control.querySelector('button');if(button){button.querySelector('span').textContent=spec.label||parameter.label;bindings.push(()=>button.querySelector('span').textContent=spec.label||parameter.label);}}
      else if(spec.kind==='preset'){
        Object.assign(control.style,{left:`${spec.x-size/2}px`,top:`${spec.y-(spec.height||size)/2}px`,width:`${size}px`,height:`${spec.height||size}px`});const select=control.querySelector('select');if(select)select.size=7;
      }else if(spec.kind==='buttons'){const width=spec.width||size;Object.assign(control.style,{left:`${spec.x-width/2}px`,top:`${spec.y-(spec.height||110)/2}px`,width:`${width}px`,height:`${spec.height||110}px`});if(spec.orientation==='horizontal')control.classList.add('fx-original-buttons-horizontal');if(spec.columns){const choices=control.querySelector('.fx-enum-buttons');if(choices){choices.style.display='grid';choices.style.gridTemplateColumns=`repeat(${spec.columns},1fr)`;}}}
      else if(parameter.type==='boolean'||spec.kind==='switch'){const width=spec.width||size;Object.assign(control.style,{left:`${spec.x-width/2}px`,top:`${spec.y-27}px`,width:`${width}px`});}
      else{
        Object.assign(control.style,{left:`${spec.x-size*.8}px`,top:`${spec.y-size/2-18}px`,width:`${size*1.6}px`});
        const knob=control.querySelector('.fx-knob');if(knob){
          const ring=svgElement('svg',{class:'fx-original-dial-scale',viewBox:'0 0 120 120','aria-hidden':'true'}),marks=spec.scale||null;
          for(let i=0;i<=20;i++){const angle=(-135+i/20*270)*Math.PI/180,outer=54,inner=i%5===0?48:51;ring.append(svgElement('line',{x1:60+Math.sin(angle)*inner,y1:60-Math.cos(angle)*inner,x2:60+Math.sin(angle)*outer,y2:60-Math.cos(angle)*outer}));}
          if(marks)marks.forEach((mark,i)=>{const angle=(-135+i/Math.max(1,marks.length-1)*270)*Math.PI/180,text=svgElement('text',{x:60+Math.sin(angle)*59,y:63-Math.cos(angle)*59,'text-anchor':'middle'});text.textContent=mark;ring.append(text);});
          knob.append(ring);
        }
      }
      if(spec.hideLabel)label.style.visibility='hidden';if(spec.hideValue)control.classList.add('fx-original-hide-value');if(spec.valueOffsetY){const value=control.querySelector('.fx-value-row,.fx-select');if(value)value.style.transform=`translateY(${spec.valueOffsetY}px)`;}
      if(spec.visibleWhen){const condition=spec.visibleWhen;bindings.push(()=>{const p=model.parameters.find(p=>p.key===condition.key);control.hidden=!p||String(rawValue(ctx,p))!==String(condition.value);});}
      if(spec.group)grouped.push({id:spec.group,control});
      stage.append(control);
    }
    if(reference.controlGroups?.length){
      const spec=reference.groupSelector||{x:reference.width-110,y:70,width:95,height:260},selector=el('div','fx-original-group-selector'),buttons=[];Object.assign(selector.style,{left:`${spec.x}px`,top:`${spec.y}px`,width:`${spec.width}px`,height:`${spec.height}px`});selector.setAttribute('role','tablist');selector.setAttribute('aria-label','Bande EQ');
      const select=id=>{if(!reference.controlGroups.some(group=>group.id===id))return;for(const entry of grouped)entry.control.hidden=entry.id!==id;for(const entry of buttons){const on=entry.id===id;entry.button.setAttribute('aria-selected',String(on));}};
      for(const group of reference.controlGroups){const button=btn(group.label,()=>select(group.id),'fx-original-group-button');button.setAttribute('role','tab');buttons.push({id:group.id,button});selector.append(button);}stage.append(selector);select(reference.defaultGroup||reference.controlGroups[0].id);
      const fromPoint=event=>{const point=event.target.closest?.('.fx-eq-point');if(point)select(point.dataset.band.toLowerCase());};stage.addEventListener('pointerdown',fromPoint);stage.addEventListener('focusin',fromPoint);
    }
    sizer.append(stage);viewport.append(sizer);
    const resize=()=>{const available=viewport.clientWidth||reference.width,scale=Math.min(1,Math.max(.7,available/reference.width));stage.style.transform=`scale(${scale})`;sizer.style.width=`${reference.width*scale}px`;sizer.style.height=`${reference.height*scale}px`;};
    if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(resize);observer.observe(viewport);cleanups.push(()=>observer.disconnect());}resize();
    return {element:viewport,used};
  }

  function applyParams(ctx,modelId,params,enabled,mix){
    if(live()){if(!window.SculptLive?.applyProcessorPreset){ui().toast('I preset locali richiedono la sincronizzazione completa del processore.');return false;}Promise.resolve(window.SculptLive.applyProcessorPreset(ctx,{model:modelId,params,enabled,mix})).then(()=>ui().toast('Parametri confermati dalla WING'),error=>ui().toast(error.message||String(error)));return false;}
    if(!Cat.get(ctx,modelId)){ui().toast('Questo modello non è disponibile in questa posizione');return false;}
    desk().setModel(ctx,modelId);const def=Cat.get(ctx,modelId);
    for(const p of def.parameters)if(Object.prototype.hasOwnProperty.call(params||{},p.key))desk().setParam(ctx,p.key,normalize(p,params[p.key]));
    if(typeof enabled==='boolean')desk().enableProcessor(ctx,enabled);
    if(Number.isFinite(mix))desk().setProcessorMix(ctx,mix);
    return true;
  }
  function presetBucket(ctx){return ctx.type==='fx'?'fx':ctx.block;}
  function savePreset(ctx,model){
    const content=el('div','fx-preset-form');content.append(el('p','desk-note','Salva tutti i parametri di questa istanza nella libreria locale.'));
    const input=el('input','desk-input');input.value=`${model.name} · 01`;input.maxLength=60;input.setAttribute('aria-label','Nome preset');content.append(input);
    const footer=el('div','desk-toolbar');const modal=ui().modal('Salva preset',content);
    footer.append(btn('Salva',()=>{
      const name=input.value.trim();if(!name){input.focus();return;}
      const current=clone(instance(ctx));
      desk().change(s=>{s.pluginPresets??=[];s.pluginPresets.push({id:`fxp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,bucket:presetBucket(ctx),model:current.model,params:current.params,enabled:current.enabled,mix:current.mix});});modal.close();ui().toast('Preset salvato');
    },'desk-primary'));content.append(footer);input.focus();input.select();
  }
  function browsePresets(ctx){
    const content=el('div','fx-preset-browser');const modal=ui().modal('Preset del processore',content);
    const render=()=>{
      content.replaceChildren();const presets=(desk().get().pluginPresets||[]).filter(p=>p.bucket===presetBucket(ctx)&&Cat.get(ctx,p.model));
      if(!presets.length)content.append(el('p','desk-note','Nessun preset salvato per questa sezione. Usa “Salva” dopo aver regolato il processore.'));
      for(const p of presets){const row=el('div','fx-preset-row');const text=el('div');text.append(el('strong','',p.name),el('small','',Cat.get(ctx,p.model)?.name||p.model));row.append(text,btn('Carica',()=>{const applied=applyParams(ctx,p.model,p.params,p.enabled,p.mix);modal.close();if(applied)ui().toast(`Preset ${p.name} caricato`);},'desk-primary'),btn('Elimina',()=>{desk().change(s=>s.pluginPresets=s.pluginPresets.filter(item=>item.id!==p.id));render();},'fx-quiet'));content.append(row);}
    };render();
  }
  function loadFactoryDemo(ctx,model){
    const selected=String(instance(ctx)?.params?.preset||'Build');
    const size=/Cathedral|Church|Large|Arena|Swimming|Hall/i.test(selected)?3.6:/Plate|Vocal/i.test(selected)?1.8:.7;
    const values={dcy:size,erpdly:10,rvpdly:/Vocal/i.test(selected)?30:15,diff:10,ldcy:1.2,lmdcy:1,hmdcy:.9,hdcy:.6};
    for(const p of model.parameters)if(values[p.key]!==undefined)setParam(ctx,p,values[p.key]);
    ui().toast('Profilo dimostrativo applicato');
  }

  function renderProcessor(container,context){
    const ctx={...context};let alive=true,bindings=[],surfaceCleanups=[],modelId=null,activeGroup='Tutti',building=false,hydrating=false,hydratedModel=null,liveMode=live(),stateSignature='';
    function hydrate(){
      if(!alive||!live()||hydrating||!window.SculptLive?.ensureProcessor||window.SculptLive.isConnected&& !window.SculptLive.isConnected())return;
      const current=instance(ctx)?.model;if(hydratedModel===current&&liveState(ctx).ready)return;
      hydratedModel=current;hydrating=true;
      Promise.resolve(window.SculptLive.ensureProcessor(ctx)).then(()=>{hydrating=false;if(alive)build();},error=>{hydrating=false;if(alive){build();ui().toast(error.message||String(error));}});
    }
    const synchronize=()=>{
      if(!alive||building)return;
      const proc=instance(ctx);if(!proc)return;
      const nextSignature=JSON.stringify(liveState(ctx));
      if(proc.model!==modelId||liveMode!==live()||nextSignature!==stateSignature){activeGroup='Tutti';build();hydrate();return;}
      for(const update of bindings)update();
    };
    function build(){
      building=true;for(const dispose of surfaceCleanups)dispose();surfaceCleanups=[];bindings=[];container.replaceChildren();
      const proc=instance(ctx),available=Cat.list(ctx);
      if(!proc||!available.length){container.append(el('p','desk-note','Questo blocco non è presente su questa famiglia di canali.'));building=false;return;}
      modelId=proc.model;let model=Cat.get(ctx,modelId);
      if(!model){if(live()){container.append(el('p','desk-note',`Modello ${modelId}: il banco espone questo processore, ma non è presente nel catalogo grafico locale. Usa l’esploratore dei parametri WING.`));building=false;return;}model=available[0];desk().setModel(ctx,model.id);modelId=model.id;}
      const panel=Panels?.forModel(model)||{face:model.layout,sections:[...new Set(model.parameters.map(p=>p.group||'Controls'))].map(title=>({title,keys:model.parameters.filter(p=>(p.group||'Controls')===title).map(p=>p.key)})),heroes:[],subtitle:model.name};
      stateSignature=JSON.stringify(liveState(ctx));liveMode=live();
      const wrapper=el('div',`fx-processor fx-theme-${model.theme} fx-layout-${model.layout} fx-panel-${panel.face}`);wrapper.dataset.model=model.id;wrapper.dataset.context=keyFor(ctx);container.append(wrapper);
      const toolbar=el('div','fx-processor-toolbar');
      const select=el('select','fx-model-select');select.setAttribute('aria-label',`Modello ${ctx.type==='fx'?'FX '+ctx.slot:ctx.block}`);
      let category='';let group;
      available.forEach(item=>{if(item.category!==category){category=item.category;group=el('optgroup');group.label=categoryNames[category]||category;select.append(group);}const opt=el('option','',item.name);opt.value=item.id;group.append(opt);});select.value=model.id;
      select.addEventListener('change',()=>{desk().setModel(ctx,select.value);activeGroup='Tutti';hydratedModel=null;build();hydrate();});toolbar.append(select);
      const power=btn('',()=>desk().enableProcessor(ctx,!instance(ctx).enabled),'fx-power');power.setAttribute('aria-label','Processore attivo');power.setAttribute('role','switch');toolbar.append(power);bindings.push(()=>{const on=!!instance(ctx).enabled;power.textContent=on?'IN':'BYPASS';power.classList.toggle('active',on);power.setAttribute('aria-checked',String(on));wrapper.classList.toggle('fx-bypassed',!on);});
      wrapper.append(toolbar);
      if(live()){const state=liveState(ctx),status=el('div',`fx-connection-status ${state.ready?'ready':''}`);status.append(el('i'),el('span','',window.SculptLive.isConnected&&!window.SculptLive.isConnected()?'WING non collegata':state.error?String(state.error):state.loading||!state.ready?'Lettura del processore dalla WING…':'Parametri sincronizzati con WING'));wrapper.append(status);}
      if(ctx.type==='fx'){
        const routing=el('div','fx-routing');const assign=el('select','fx-assignment');assign.setAttribute('aria-label',`Assegna FX ${ctx.slot}`);
        const empty=el('option','','Non assegnato');empty.value='';assign.append(empty);
        for(const s of ctrl().listStrips()){const opt=el('option','',stripName(s.id));opt.value=s.id;assign.append(opt);}
        assign.value=proc.stripId||'';assign.addEventListener('change',()=>desk().assignFx(ctx.slot,assign.value||null,instance(ctx).position||'post'));
        const pos=el('select','fx-position');pos.setAttribute('aria-label','Posizione insert');for(const [v,name]of [['pre','Pre insert'],['post','Post insert']]){const opt=el('option','',name);opt.value=v;pos.append(opt);}pos.value=proc.position||'post';pos.addEventListener('change',()=>desk().assignFx(ctx.slot,instance(ctx).stripId||null,pos.value));routing.append(assign,pos);wrapper.append(routing);
        bindings.push(()=>{const current=instance(ctx);if(document.activeElement!==assign)assign.value=current.stripId||'';if(document.activeElement!==pos)pos.value=current.position||'post';});
      }
      const face=el('section','fx-face');face.append(el('i','fx-screw fx-screw-tl'),el('i','fx-screw fx-screw-tr'),el('i','fx-screw fx-screw-bl'),el('i','fx-screw fx-screw-br'));
      const brand=el('header','fx-face-heading');const names=el('div');names.append(el('span','fx-face-kicker',ctx.type==='fx'?`${ctx.slot<=8?'PREMIUM / STANDARD':'STANDARD / CHANNEL'} · FX ${String(ctx.slot).padStart(2,'0')}`:contextLabel(ctx)),el('h3','',model.name));brand.append(names,el('span','fx-face-model',model.id.replaceAll('*','')));face.append(brand);face.append(el('p','fx-panel-subtitle',panel.subtitle||''));
      if(model.id==='NONE'){
        const empty=el('div','fx-empty-slot');empty.append(el('span','','+'),el('h4','','Slot disponibile'),el('p','','Scegli un processore dal selettore qui sopra.'));face.append(empty);
      }else{
        const reference=referenceFor(model);let used=new Set(),sectionParent=face;
        if(reference){
          wrapper.classList.add('fx-original-enabled');const original=makeReferenceSurface(model,ctx,reference,bindings,surfaceCleanups);face.append(original.element);used=original.used;
          if(model.parameters.some(p=>!used.has(p.key))){const extras=el('details','fx-original-extras');extras.append(el('summary','','Altri controlli del processore'));face.append(extras);sectionParent=extras;if(model.id==='VSS3'){bindings.push(()=>{extras.open=!!Number(instance(ctx)?.params?.view);});}}
        }else{const plot=makePlot(model,ctx,bindings);if(plot)face.append(plot);}
        const sections=panel.sections.map(part=>({...part,keys:part.keys.filter(key=>!used.has(key))})).filter(part=>part.keys.length);
        const tabs=el('div','fx-section-tabs');
        if(sections.length>1&&!reference){for(const name of ['Tutti',...sections.map(s=>s.title)]){const b=btn(groupNames[name]||name,()=>{activeGroup=name;build();},'fx-section-tab');b.setAttribute('aria-pressed',String(activeGroup===name));tabs.append(b);}sectionParent.append(tabs);}
        const surface=el('div','fx-panel-sections');if(sections.length)sectionParent.append(surface);
        for(const [index,part] of sections.entries()){
          if(activeGroup!=='Tutti'&&activeGroup!==part.title)continue;
          const section=el('section','fx-panel-section');section.dataset.section=part.title;section.style.setProperty('--section-hue',[25,43,105,163,207,258,305,345][index%8]);
          const heading=el('h4','fx-section-title');heading.append(el('span','fx-section-index',String(index+1).padStart(2,'0')),el('span','',groupNames[part.title]||part.title));section.append(heading);
          const isBands=model.layout==='geq'&&part.title==='Bands',isKeys=model.id==='PCORR'&&part.title==='Notes';
          const grid=el('div',isBands?'fx-geq-bank':isKeys?'fx-piano-keyboard':'fx-knob-grid');
          for(const key of part.keys){const p=model.parameters.find(p=>p.key===key);if(!p)continue;
            const control=parameterControl(model,ctx,p,bindings,isBands);if(panel.heroes?.includes(key))control.classList.add('fx-control-primary');
            if(isKeys){const name=key.slice(1).toUpperCase();control.classList.add('fx-piano-key');control.dataset.note=name;const button=control.querySelector('button');if(button){button.querySelector('span').textContent=name;bindings.push(()=>{button.querySelector('span').textContent=name;});}}
            grid.append(control);
          }
          section.append(grid);surface.append(section);
        }
      }
      wrapper.append(face);
      const tools=el('div','fx-tools');
      tools.append(btn('Preset',()=>browsePresets(ctx)),btn('Salva',()=>savePreset(ctx,model)),btn('Copia',()=>{desk().change(s=>s.pluginClipboard={...clone(instance(ctx)),bucket:presetBucket(ctx)});ui().toast('Processore copiato');}),btn('Incolla',()=>{const clip=desk().get().pluginClipboard;if(!clip){ui().toast('Copia prima un processore');return;}if(clip.bucket!==presetBucket(ctx)){ui().toast('Copia un processore della stessa sezione');return;}if(applyParams(ctx,clip.model,clip.params,clip.enabled,clip.mix))ui().toast('Processore incollato');}),btn('Reset',()=>{const params=Cat.defaults(ctx,model.id);if(applyParams(ctx,model.id,params,true,100))ui().toast('Parametri ripristinati');}));
      if(['delay','reverb'].includes(model.layout)){
        const time=model.parameters.find(p=>/^(time|delay|tl|dl|pdel|rvpdly)$/.test(p.key)&&p.type==='number');
        if(time){let lastTap=0;const tap=btn('TAP',()=>{const now=performance.now();if(lastTap&&now-lastTap<3000){setParam(ctx,time,now-lastTap);ui().toast(`${time.label}: ${pretty(rawValue(ctx,time),time)} ${time.unit}`);}lastTap=now;},'fx-tap');tap.setAttribute('aria-label','Tap tempo');tools.append(tap);}
      }
      wrapper.append(tools);
      if(ctx.type==='fx'&&model.id!=='NONE'){
        const mix=el('div','fx-wetdry');mix.append(el('label','','DRY / WET'));
        const range=el('input');range.type='range';range.min='0';range.max='100';range.step='1';range.setAttribute('aria-label','Mix dello slot FX');const output=el('output');
        range.addEventListener('input',()=>desk().setProcessorMix(ctx,Number(range.value)));mix.append(range,output);wrapper.append(mix);
        bindings.push(()=>{range.value=String(instance(ctx).mix??100);output.textContent=`${instance(ctx).mix??100}%`;});
      }
      wrapper.append(el('p','fx-demo-caption',live()?`${model.parameters.length} controlli · valori e disponibilità letti dal banco. L’elaborazione audio avviene sulla WING.`:`${model.parameters.length} controlli · modalità offline: parametri locali, nessuna elaborazione audio.`));
      if(live()&&!liveState(ctx).ready){wrapper.classList.add('fx-awaiting');wrapper.querySelectorAll('button,input,select').forEach(node=>{node.disabled=true;});wrapper.querySelectorAll('[role=slider]').forEach(node=>{node.setAttribute('aria-disabled','true');node.tabIndex=-1;});}
      building=false;for(const update of bindings)update();
    }
    build();hydrate();const unsubscribe=desk().subscribe(synchronize),unsubscribeLive=window.SculptLive?.subscribe?.(synchronize);
    return ()=>{alive=false;unsubscribe?.();unsubscribeLive?.();for(const dispose of surfaceCleanups)dispose();surfaceCleanups=[];bindings=[];};
  }

  function open(context){
    if(opened){opened.cleanup?.();opened.modal.close();opened=null;}
    const content=el('div','fx-modal-content');
    const modal=ui().modal(contextLabel(context),content);modal.dialog.classList.add('fx-modal');
    const cleanup=renderProcessor(content,context);opened={modal,cleanup};
    modal.dialog.addEventListener('close',()=>{cleanup();if(opened?.modal===modal)opened=null;},{once:true});
  }
  function rack(container,args){
    const heading=el('div','fx-rack-heading');heading.append(el('p','desk-note','16 slot stereo · seleziona uno slot per aprire il processore e la sua assegnazione.'));
    const toolbar=el('div','desk-toolbar');
    const filter=el('input','desk-input fx-rack-search');filter.type='search';filter.placeholder='Cerca processore o canale';filter.setAttribute('aria-label','Cerca nel rack FX');toolbar.append(filter,btn('Libreria preset',()=>browsePresets({type:'fx',slot:1}),'fx-quiet'));heading.append(toolbar);container.append(heading);
    const holder=el('div','fx-rack-holder');container.append(holder);let signature='';
    function update(){
      const state=desk().get(),query=filter.value.trim().toLocaleLowerCase();
      const sig=JSON.stringify([state.fx.map(p=>[p.model,p.enabled,p.stripId,p.mix,p.position]),ctrl().listStrips().map(s=>s.name),query]);if(sig===signature)return;signature=sig;
      holder.replaceChildren();let visible=0;
      for(const [from,to,title]of [[1,8,'PREMIUM · STANDARD · CHANNEL'],[9,16,'STANDARD · CHANNEL']]){
        const section=el('section','fx-rack-section');const titleRow=el('div','fx-rack-section-title');titleRow.append(el('h3','',title),el('span','',`SLOT ${from}—${to}`));section.append(titleRow);const grid=el('div','fx-rack-grid');
        for(let slot=from;slot<=to;slot++){
          const ctx={type:'fx',slot},proc=instance(ctx);if(!proc)continue;const model=Cat.get(ctx,proc.model),name=model?.name||proc.model;
          if(query&&!`${name} ${slot} ${stripName(proc.stripId)}`.toLocaleLowerCase().includes(query))continue;
          visible++;
          const card=el('article',`fx-slot fx-theme-${model?.theme||'digital'}${proc.enabled?'':' fx-slot-bypass'}`);card.dataset.slot=slot;
          const top=el('div','fx-slot-top');top.append(el('span','fx-slot-number',String(slot).padStart(2,'0')),el('span','fx-slot-type',slot<=8?'PREMIUM':'STANDARD'));card.append(top);
          const button=btn('',()=>open(ctx),'fx-slot-open');button.setAttribute('aria-label',`Apri FX ${slot} · ${name}`);button.append(el('strong','',name),el('span','fx-slot-glyph',proc.model==='NONE'?'+':model?.layout==='geq'?'▥':model?.layout==='reverb'?'≋':model?.layout==='dynamics'?'◴':'◉'));card.append(button);
          const bottom=el('div','fx-slot-bottom');const route=el('small','',proc.stripId?stripName(proc.stripId):'Non assegnato');route.title=route.textContent;const bypass=btn(proc.enabled?'IN':'BYP',()=>desk().enableProcessor(ctx,!instance(ctx).enabled),'fx-slot-power');bypass.setAttribute('aria-label',`Attiva FX ${slot}`);bypass.setAttribute('aria-pressed',String(!!proc.enabled));bottom.append(route,bypass);card.append(bottom);grid.append(card);
        }
        if(grid.childElementCount){section.append(grid);holder.append(section);}
      }
      if(!visible)holder.append(el('p','desk-empty','Nessun processore corrisponde alla ricerca.'));
    }
    filter.addEventListener('input',update);update();const unsubscribe=desk().subscribe(update);
    if(args?.slot)open({type:'fx',slot:Number(args.slot)});
    return ()=>unsubscribe?.();
  }
  window.SculptFX={renderProcessor,open};
  ui().register('fx',{title:'FX Rack',subtitle:'16 processori stereo',render:rack});
})();
