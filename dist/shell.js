(() => {
  'use strict';
  const C=window.SculptController,D=window.SculptDesk;
  const pages=new Map();let current=null,cleanup=null,currentArgs=null,previousFocus=null;
  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
  function button(text,action,className=''){const b=el('button',`desk-button ${className}`,text);b.type='button';if(action)b.addEventListener('click',action);return b;}
  const field=(label,control)=>{const wrap=el('label','desk-field');wrap.append(el('span','desk-field-label',label),control);if(!control.getAttribute('aria-label'))control.setAttribute('aria-label',label);return wrap;};
  function select(label,value,options,onChange){const input=el('select','desk-input');for(const item of options){const o=typeof item==='object'?item:{value:item,label:item};const option=el('option','',o.label??o.value);option.value=String(o.value);input.append(option);}input.value=String(value??'');input.addEventListener('change',()=>onChange(input.value));return field(label,input);}
  function number(label,value,min,max,step,onChange,unit=''){
    const wrap=el('div','desk-parameter'),heading=el('div','desk-parameter-heading'),output=el('output','',`${value} ${unit}`);heading.append(el('span','',label),output);
    const line=el('div','desk-number-line'),range=el('input','desk-range'),input=el('input','desk-input desk-number');
    range.type='range';input.type='number';input.inputMode=step<1?'decimal':'numeric';for(const c of [range,input]){c.min=String(min);c.max=String(max);c.step=String(step);c.value=String(value);c.setAttribute('aria-label',`${label}${c===range?' — cursore':''}`);}
    const display=v=>{output.textContent=`${Number(v).toLocaleString('it-IT',{maximumFractionDigits:3})}${unit?' '+unit:''}`;range.value=String(v);input.value=String(v);};
    range.addEventListener('input',()=>{const v=Number(range.value);display(v);onChange(v);});
    const commit=()=>{if(!input.value.trim()||!Number.isFinite(input.valueAsNumber)){input.value=range.value;return;}const n=Math.min(max,Math.max(min,input.valueAsNumber));const v=Number((Math.round((n-min)/step)*step+min).toFixed(6));if(v!==Number(range.value)){display(v);onChange(v);}else display(v);};
    input.addEventListener('change',commit);input.addEventListener('blur',commit);input.addEventListener('keydown',e=>{if(e.key==='Enter'){commit();input.blur();}});line.append(range,input);wrap.append(heading,line);display(value);return wrap;
  }
  function toggle(label,value,onChange){const b=button(label,()=>{const before=b.getAttribute('aria-pressed')==='true',next=!before;b.setAttribute('aria-pressed',String(next));b.classList.toggle('is-on',next);if(onChange(next)===false){b.setAttribute('aria-pressed',String(before));b.classList.toggle('is-on',before);}},'desk-toggle');b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(!!value));b.classList.toggle('is-on',!!value);return b;}
  const card=(title,...children)=>{const c=el('section','desk-card');if(title)c.append(el('h3','',title));for(const n of children.flat())if(n)c.append(n);return c;};
  const grid=(...children)=>{const g=el('div','desk-grid');g.append(...children.flat().filter(Boolean));return g;};
  function tabs(items,selected,change){const nav=el('div','desk-tabs');nav.setAttribute('role','tablist');for(const item of items){const o=typeof item==='string'?{id:item,label:item}:item;const b=button(o.label,()=>change(o.id));b.setAttribute('role','tab');b.setAttribute('aria-selected',String(o.id===selected));nav.append(b);}return nav;}
  function modal(title,content){
    const dialog=el('dialog','desk-modal'),head=el('header','desk-modal-header'),h=el('h2','',title),x=button('×',()=>dialog.close(),'desk-close');x.setAttribute('aria-label',`Chiudi ${title}`);head.append(h,x);const body=el('div','desk-modal-body');if(content)body.append(content);dialog.append(head,body);document.body.append(dialog);const before=document.activeElement;
    dialog.addEventListener('close',()=>{dialog.remove();before?.focus?.();},{once:true});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});dialog.showModal();return {dialog,body,close:()=>dialog.close()};
  }
  function toast(message){
    const dialogs=[...document.querySelectorAll('dialog[open]')],parent=dialogs.at(-1);
    if(!parent){C.toast(message);return;}
    parent.querySelector('.desk-toast')?.remove();
    const note=el('div','desk-toast',message);note.setAttribute('role','status');parent.append(note);setTimeout(()=>note.remove(),3400);
  }
  function download(filename,text,mime='application/json'){const blob=text instanceof Blob?text:new Blob([text],{type:mime}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  const workspace=el('dialog','desk-workspace'),head=el('header','desk-page-header'),back=button('‹ Mixer',close,'desk-back'),title=el('h1'),subtitle=el('p'),titles=el('div','desk-page-titles'),badge=el('span','desk-badge','DEMO'),menuButton=button('☰',()=>showMenu(),'desk-page-menu');menuButton.setAttribute('aria-label','Menu del banco');titles.append(title,subtitle);head.append(back,titles,badge,menuButton);const body=el('div','desk-page-body');body.id='desk-page-body';workspace.append(head,body);document.body.append(workspace);
  workspace.addEventListener('close',()=>{if(cleanup){cleanup();cleanup=null;}current=null;previousFocus?.focus?.();});
  function render(){const p=pages.get(current);if(!p)return;if(cleanup){cleanup();cleanup=null;}body.replaceChildren();title.textContent=p.title;const live=window.SculptLive?.isLive(),state=live?window.SculptLive.snapshot():null;badge.textContent=live?(state.mode==='live'?(state.writable?'LIVE':'LETTURA'):'WING'):'DEMO';subtitle.textContent=live?({scenes:'Show Control WING',recorder:'WING-LIVE · USB',setup:'Configurazione WING'}[current]||p.subtitle||'WING · controllo remoto'):(p.subtitle||'WING RACK · simulazione locale');body.scrollTop=0;const nativePage=live?window.SculptLivePages?.render(current,body,currentArgs):null;cleanup=nativePage?.handled?nativePage.cleanup:p.render(body,currentArgs)||null;}
  function open(id,args){if(id==='mixer'){close();return;}if(!pages.has(id)){C.toast('Sezione non disponibile');return;}window.SculptEditor?.close();if(!workspace.open)previousFocus=document.activeElement;current=id;currentArgs=args;render();window.SculptLive?.pageOpened?.(id,args);if(!workspace.open)workspace.showModal();}
  function close(){if(workspace.open)workspace.close();}
  let menu=null;
  const icons={connection:'◉',wing:'W',mixer:'▥',io:'↔',fx:'FX',groups:'DCA',monitor:'◉',meters:'▰',scenes:'▤',recorder:'●',setup:'⚙',macros:'M',about:'i'};
  function showMenu(){
    if(menu?.dialog.open)return;
    const live=window.SculptLive?.isLive(),state=live?window.SculptLive.snapshot():null,info=state?.info;const pane=el('div','desk-menu-content'),profile=el('div','desk-profile');profile.append(el('span','desk-badge',live?'WING':'DEMO OFFLINE'),el('strong','',live?(info?.name||'WING non collegata'):D.get().setup.name),el('small','',live?(info?`${info.model} · ${info.firmware}`:'Apri Connessione WING'):`${D.get().setup.model} · ${D.get().setup.firmware}`));pane.append(profile);
    const nav=el('div','desk-menu-grid');
    const ordered=['mixer','connection','wing','io','fx','groups','monitor','meters','scenes','recorder','setup','macros','about'];
    for(const id of ordered){const p=id==='mixer'?{title:'Mixer',subtitle:'76 strip · SOF'}:pages.get(id);if(!p)continue;const liveHint=live?({recorder:'WING-LIVE e USB',scenes:'Show Control del banco',setup:'Parametri del banco',meters:'Meter stereo WING'}[id]):null;const b=button('',()=>{menu.close();open(id);},'desk-menu-tile'),mark=el('span','desk-menu-icon',icons[id]||'›'),name=el('strong','',p.title),hint=el('small','',liveHint||p.menuHint||p.subtitle||'');b.append(mark,name,hint);nav.append(b);}
    pane.append(nav);menu=modal('Banco',pane);
  }
  window.SculptUI={register:(id,config)=>pages.set(id,config),open,close,refresh:render,el,button,card,grid,field,select,number,toggle,tabs,toast,download,modal,showMenu,current:()=>current};
  pages.set('about',{title:'Sculpt Wing',menuHint:'Guida · Offline',render(container){
    const p=el('div','desk-about');p.append(el('img','desk-app-icon'));p.firstChild.src='./icon-red-180.png';p.firstChild.alt='Sculpt Wing';p.append(el('h2','','Il banco, a portata di mano.'),el('p','desk-note','Sculpt Wing · 0.6. Pannelli dei processori, mixer e routing. Nel browser i controlli restano in demo; nelle app per iPhone/iPad, Mac e Windows la connessione WING legge e modifica i parametri del banco.'),card('Prova il flusso',el('p','desk-note','Assegna una sorgente in I/O, apri una strip, scegli un processore, regola le mandate in SOF. Salva una scena e richiama la configurazione. Le macro possono combinare più azioni.')),button('Installa / Offline',()=>window.SculptOffline?.openHelp(),'desk-primary'),button('Esporta progetto completo',()=>download('Sculpt-Wing-progetto.json',JSON.stringify({format:'sculpt-control-project',version:1,snapshot:C.capture()},null,2))));container.append(p);
  }});
  document.getElementById('menu-button')?.addEventListener('click',showMenu);
  const rail=document.getElementById('macro-buttons');
  function updateMacros(){if(!rail)return;const macros=D.get().macros||[];const sig=macros.map(m=>m.id+':'+m.name+':'+(m.actions?.length||0)).join('|');if(rail.dataset.sig===sig)return;rail.dataset.sig=sig;rail.replaceChildren();for(const m of macros){const b=button('',()=>{if(m.actions?.length)window.SculptSystems?.runMacro(m.id);else open('macros',{id:m.id});},'macro-action');b.append(el('small','',`M${m.id}`),el('span','',m.name||'Assegna'));b.setAttribute('aria-label',`Macro ${m.id} · ${m.name}`);b.title='Tocca per eseguire · tasto destro per modificare';b.addEventListener('contextmenu',e=>{e.preventDefault();open('macros',{id:m.id});});rail.append(b);}}
  D.subscribe(updateMacros);updateMacros();
  document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable]'))return;if(e.key==='Escape'&&document.querySelectorAll('dialog[open]').length===0)C.setSof(null);});
})();
