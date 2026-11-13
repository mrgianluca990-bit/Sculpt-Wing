(() => {
  'use strict';
  const U=window.SculptUI,D=window.SculptDesk,C=window.SculptController;
  if(!U||!D)return;
  const live=()=>!!window.SculptLive?.isLive(),L=()=>window.SculptLive;
  const inputPath=id=>window.SculptWingMap?.sourcePath(id);
  const read=path=>!live()||!!L()?.hasValue?.(path);
  const editable=path=>!live()||!!(L()?.isWritable?.()&&read(path)&&!L()?.metadata?.(path)?.readOnly);
  function guard(control,path,reason,from=value=>value){
    if(!live())return control;control.dataset.wingPath=path;
    control.wingSync=()=>{
      const enabled=!!path&&editable(path),available=read(path),meta=L()?.metadata?.(path),elements=control.matches?.('input,select,button')?[control]:control.querySelectorAll('input,select,button');
      for(const e of elements)e.disabled=!enabled;control.title=!enabled?reason||(!available?'Parametro non letto dalla WING':L()?.isWritable?.()?'Parametro di sola lettura':'Controllo WING non attivo'):'';
      if(control===document.activeElement||control.contains(document.activeElement))return;
      const value=available?from(L().value(path)):undefined;
      for(const e of elements){if(e.tagName==='BUTTON'&&e.hasAttribute('aria-pressed'))e.setAttribute('aria-pressed',String(!!Number(value)));else if(['INPUT','SELECT'].includes(e.tagName)){e.value=value===undefined?'':String(value);if(meta?.maxLength&&e.type==='text')e.maxLength=meta.maxLength;}}
      const out=control.querySelector('output');if(out){const unit=out.textContent.match(/\s(dB|Hz|ms|s|%)$/)?.[1]||'';out.textContent=value===undefined?'—':Number(value).toLocaleString('it-IT',{maximumFractionDigits:3})+(unit?' '+unit:'');}control.wingRefresh?.();
    };control.wingSync();return control;
  }
  function syncWire(container){for(const control of container.querySelectorAll('[data-wing-path]'))control.wingSync?.();}
  function nativeButton(path='/io'){return U.button('Parametri WING ↗',()=>L()?.openExplorer?.(path));}
  function loading(container,message='Lettura dei valori dalla WING…'){const p=U.el('p','desk-note',message);p.setAttribute('role','status');container.replaceChildren(p);return p;}
  const names={OFF:'Non assegnato',LCL:'Local',AUX:'AUX analogici',A:'AES50 A',B:'AES50 B',C:'AES50 C',SC:'StageCONNECT',USB:'USB Audio',CRD:'Scheda / WING-LIVE',MOD:'Modulo / Dante',PLAY:'USB Player',AES:'AES/EBU',USR:'User',OSC:'Oscillatori',CH:'Canali',AUXP:'AUX processing',BUS:'Bus',MAIN:'Main',MTX:'Matrici',MON:'Monitor',REC:'USB Recorder'};
  const label=id=>{if(id==='OFF')return '—';const s=D.signals().find(v=>v.id===id);if(!s)return id;const known=!live()||s.stripId&&L()?.hasStripValue?.(s.stripId)||read(inputPath(id)+'/name');return `${s.group} ${String(s.index).padStart(2,'0')}${known?' · '+s.name:''}`;};
  const textInput=(caption,value,onChange)=>{const input=U.el('input','desk-input');input.value=value??'';input.maxLength=40;const commit=()=>{const result=onChange(input.value);if(typeof result==='string')input.value=result;};input.addEventListener('change',commit);input.addEventListener('blur',commit);input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit();input.blur();}});return U.field(caption,input);};
  let tab='inputs',inputBank=0,sourceGroup='LCL',outputGroup='LCL',outputBank=0,userBank=0,query='',appliedArgs=null;
  function pickSource(title,current,callback,{signals=false,exclude=null,allowedGroups=null}={}){
    const root=U.el('div'),top=U.el('div','desk-toolbar'),search=U.el('input','desk-input io-search'),grid=U.el('div','io-port-grid');search.placeholder='Cerca sorgente o nome…';search.setAttribute('aria-label','Cerca sorgente');
    const available=()=>(signals?D.signals():D.sources()).filter(x=>x.id!==exclude&&(!allowedGroups||allowedGroups.includes(x.group))),all=available(),groups=[...new Set(all.map(x=>x.group))];let chosen=all.find(x=>x.id===current)?.group||groups[0]||'LCL',drawEpoch=0;
    const selector=U.select('Gruppo',chosen,groups.map(value=>({value,label:names[value]||value})),value=>{chosen=value;hydrate();});top.append(selector,search);root.append(top,grid);const modal=U.modal(title,root);
    function draw(){grid.replaceChildren();const q=search.value.toLowerCase().trim(),items=available().filter(s=>q?`${label(s.id)} ${names[s.group]}`.toLowerCase().includes(q):s.group===chosen);for(const s of items){const b=U.button('',()=>{callback(s.id);modal.close();},`io-port${s.id===current?' active':''}`);b.setAttribute('aria-label',`Assegna ${label(s.id)}`);b.append(U.el('strong','',s.id==='OFF'?'OFF':`${s.group} ${s.index}`),U.el('small','',label(s.id)));if(live())b.disabled=!L().isWritable();grid.append(b);}if(!items.length)grid.append(U.el('p','desk-empty','Nessuna sorgente corrisponde alla ricerca.'));}
    async function hydrate(){const epoch=++drawEpoch;if(live()&&inputPath(chosen+':1')){loading(grid);try{await L().loadScope('io',{direction:'in',group:chosen});}catch(e){if(epoch===drawEpoch)loading(grid,e.message);return;}}if(epoch===drawEpoch&&modal.dialog.open)draw();}
    search.addEventListener('input',draw);hydrate();return modal;
  }
  function sourceEditor(id){
    const s=D.source(id);if(!s||id==='OFF')return;
    if(live()&&s.stripId){U.close();window.SculptEditor?.open(s.stripId);return;}
    const root=U.el('div'),target=U.el('div','desk-toolbar');
    const modal=U.modal(`${s.group} ${s.index} · Sorgente`,root);let lastMode=live()?L().snapshot().mode+':'+L().isWritable():'';
    const unsubscribe=L()?.subscribe?.(status=>{const mode=status.mode+':'+status.writable;if(mode!==lastMode&&modal.dialog.open){lastMode=mode;paint();}}),valuesOff=C.subscribe(event=>{if(event?.type==='live-values')syncWire(root);});modal.dialog.addEventListener('close',()=>{unsubscribe?.();valuesOff?.();U.refresh();},{once:true});
    function paint(){
      root.replaceChildren();target.replaceChildren();const p=inputPath(id);
      if(live()&&!read(p+'/name')){root.append(U.el('p','desk-note','Sorgente non disponibile fra i parametri letti dal banco.'),nativeButton(p));return;}
      root.append(guard(textInput('Nome sorgente',s.name,value=>{if(s.stripId){C.updateStrip(s.stripId,{name:value});return C.getStrip(s.stripId).name;}D.patchSource(id,{name:value});}),p+'/name'),guard(U.select('Formato sorgente',s.mode,['M','ST','M/S'],v=>D.patchSource(id,{mode:v})),p+'/mode'));
      const gain=L()?.metadata?.(p+'/g');
      if(s.preamp&&(!live()||gain)){root.append(guard(U.number('Gain headamp',s.gain,gain?.min??s.gainMin,gain?.max??s.gainMax,.5,v=>D.patchSource(id,{gain:v}),'dB'),p+'/g'));target.append(guard(U.toggle('+48 V',s.phantom,v=>D.patchSource(id,{phantom:v})),p+'/vph'));}
      target.append(guard(U.toggle('Mute sorgente',s.mute,v=>D.patchSource(id,{mute:v})),p+'/mute'));if(!live()||read(p+'/pol'))target.append(guard(U.toggle('Polarità Ø',s.polarity,v=>D.patchSource(id,{polarity:v})),p+'/pol'));root.append(target);
      if(!live())root.append(U.number('Trim sorgente',s.trim??0,-18,18,.1,v=>D.patchSource(id,{trim:v}),'dB'));
      if(s.preamp){if(!live()||read(p+'/rmt'))root.append(guard(U.select('Controllo headamp remoto',s.remote||'OFF',['OFF','AES A','AES B','AES C'],v=>D.patchSource(id,{remote:v})),p+'/rmt'));if(!live()||read(p+'/rcvc'))root.append(guard(U.toggle('Ricevi personalizzazioni',s.receiveCustom,v=>D.patchSource(id,{receiveCustom:v})),p+'/rcvc'));}
      const used=C.listStrips().filter(st=>{const ch=D.channel(st.id);return ch.source===id||ch.altSource===id;});root.append(U.card('Canali assegnati',U.el('p','desk-note',used.length?used.map(st=>`${st.kind} ${st.number} · ${st.name}`).join(' · '):'Questa sorgente non è assegnata ai canali.')));
      if(live())root.append(U.el('p','desk-note','Gain, phantom e formato appartengono alla sorgente condivisa. Il trim digitale si regola nel canale.'),nativeButton(p));
    }
    if(live()){loading(root);L().loadScope('source',{id}).then(()=>{if(modal.dialog.open)paint();}).catch(e=>{if(modal.dialog.open){loading(root,e.message);root.append(nativeButton(inputPath(id)));}});}else paint();
  }
  function patchButton(title,value,onPick,options){let selected=typeof value==='function'?value():value;const current=()=>typeof value==='function'?value():selected,b=U.button(label(current()),()=>pickSource(title,current(),id=>{onPick(id);selected=id;b.textContent=label(current());},options),'io-patch-chip');b.setAttribute('aria-label',title);b.wingRefresh=()=>{b.textContent=label(current());};return b;}
  function table(headers){const wrap=U.el('div','desk-table-wrap'),t=U.el('table','desk-table io-table'),thead=U.el('thead'),tr=U.el('tr'),tbody=U.el('tbody');for(const h of headers)tr.append(U.el('th','',h));thead.append(tr);t.append(thead,tbody);wrap.append(t);return {wrap,tbody};}
  function cell(row,...children){const td=U.el('td');td.append(...children);row.append(td);return td;}
  function banks(items,current,onChange){return U.tabs(items.map((label,i)=>({id:i,label})),current,onChange);}
  function sequenceDialog(mode){
    const isInput=mode==='inputs',root=U.el('div'),all=(isInput?D.sources():D.signals()).filter(s=>!live()||!['CH','AUXP'].includes(s.group)),groups=[...new Set(all.map(s=>s.group))].filter(g=>g!=='OFF');let group=isInput?'LCL':live()?'BUS':'CH',start=1,count=8,dest=isInput?inputBank*8+1:outputBank*16+1,alt=false;
    root.append(U.select('Gruppo sorgenti',group,groups.map(value=>({value,label:names[value]||value})),v=>group=v),U.number('Prima sorgente',start,1,64,1,v=>start=v),U.number(isInput?'Primo ingresso (1–40 CH, 41–48 AUX)':'Prima uscita',dest,1,isInput?48:64,1,v=>dest=v),U.number('Numero assegnazioni',count,1,48,1,v=>count=v));if(isInput)root.append(U.toggle('Applica alla patch ALT',alt,v=>alt=v));else root.append(U.el('p','desk-note',`Destinazione: ${names[outputGroup]||outputGroup}`));
    const status=U.el('p','desk-note');root.append(status);let modal;
    root.append(U.button('Applica patch consecutiva',async()=>{
      const targets=isInput?C.listStrips().filter(s=>['CH','AUX'].includes(s.kind)):D.outputs().filter(o=>o.group===outputGroup),pairs=[];
      for(let i=0;i<count;i++){const s=all.find(x=>x.group===group&&x.index===start+i),target=isInput?targets[dest-1+i]:targets.find(o=>o.index===dest+i);if(!s||!target){status.textContent='La sequenza supera le sorgenti o destinazioni disponibili. Riduci il numero di assegnazioni.';return;}pairs.push([target,s]);}
      if(live())try{status.textContent='Lettura delle destinazioni…';await L().loadScope('io',isInput?{direction:'inputs',start:dest,count}:{direction:'out',group:outputGroup,start:dest,count});if(!L().isWritable())throw new Error('Attiva Controllo WING prima di applicare la patch.');}catch(e){status.textContent=e.message;return;}
      D.change(d=>{for(const [target,source]of pairs)if(isInput){const ch=d.channels[target.id];ch[alt?'altSource':'source']=source.id;if(ch.useAlt===alt&&!live())ch.mode=source.mode||'M';}else d.outputs[target.id].source=source.id;},'routing');modal.close();U.refresh();U.toast(live()?`${pairs.length} assegnazioni richieste al banco`:`${pairs.length} assegnazioni aggiornate`);
    },'desk-primary'));modal=U.modal('Patch consecutiva',root);
  }
  function inputPage(container){
    const state=D.get(),top=U.el('div','desk-toolbar');top.append(guard(U.toggle('ALT globale',state.io.globalAlt,v=>{D.change(d=>d.io.globalAlt=v,'routing');U.refresh();}),'/io/altsw'),guard(U.toggle('ALT da recorder',state.io.autoAlt,v=>D.change(d=>d.io.autoAlt=v,'routing')),'/io/autoaltovr'),U.button('Patch consecutiva',()=>sequenceDialog('inputs')));container.append(top,banks(['CH 1–8','9–16','17–24','25–32','33–40','AUX'],inputBank,i=>{inputBank=i;U.refresh();}));
    const {wrap,tbody}=table(['Canale','MAIN','ALT','Attiva']);
    for(const s of C.listStrips().filter(s=>['CH','AUX'].includes(s.kind)).slice(inputBank*8,inputBank*8+8)){
      const ch=D.channel(s.id),row=U.el('tr'),base=window.SculptWingMap?.stripPath(s.id);cell(row,U.button(`${s.kind} ${s.number} · ${s.name}`,()=>{U.close();window.SculptEditor.open(s.id);}));
      cell(row,read(base+'/in/conn/grp')?guard(patchButton(`Sorgente MAIN ${s.kind} ${s.number}`,()=>D.channel(s.id).source,id=>D.patchChannel(s.id,{source:id})),base+'/in/conn/grp'):U.el('span','desk-note','Non letto'));
      cell(row,read(base+'/in/conn/altgrp')?guard(patchButton(`Sorgente ALT ${s.kind} ${s.number}`,()=>D.channel(s.id).altSource,id=>D.patchChannel(s.id,{altSource:id})),base+'/in/conn/altgrp'):U.el('span','desk-note','Non letto'));
      cell(row,guard(U.toggle('ALT',ch.useAlt,v=>D.patchChannel(s.id,{useAlt:v})),base+'/in/set/altsrc'));tbody.append(row);
    }
    container.append(wrap,U.el('p','desk-note','Le sorgenti sono condivise: gain, phantom e formato si ritrovano anche nell’editor del canale. I bus restano indipendenti dalle uscite fisiche.'));
  }
  function sourcesPage(container){
    const all=D.sources().filter(s=>s.group!=='OFF'),groups=[...new Set(all.map(s=>s.group))];if(!groups.includes(sourceGroup))sourceGroup=groups[0];
    const tools=U.el('div','desk-toolbar'),search=U.el('input','desk-input io-search');search.placeholder='Cerca nome…';search.value=query;search.setAttribute('aria-label','Cerca sorgenti I/O');tools.append(U.select('Gruppo sorgenti',sourceGroup,groups.map(value=>({value,label:names[value]||value})),v=>{sourceGroup=v;query='';U.refresh();}),search);container.append(tools);const grid=U.el('div','io-port-grid');container.append(grid);
    function draw(){grid.replaceChildren();const q=query.toLowerCase(),items=all.filter(s=>s.group===sourceGroup&&`${label(s.id)} ${s.id}`.toLowerCase().includes(q));for(const s of items){const b=U.button('',()=>sourceEditor(s.id),'io-port'),p=inputPath(s.id),known=!live()||s.stripId||read(p+'/mode');b.append(U.el('strong','',`${s.group} ${s.index}${known?' · '+s.mode:''}`),U.el('small','',label(s.id)),U.el('small','',!known?'NON LETTO':s.preamp&&read(p+'/g')?`${s.gain.toFixed(1)} dB${read(p+'/vph')&&s.phantom?' · 48V':''}${s.mute?' · MUTE':''}`:s.mute?'MUTE':s.stripId?'PROCESSING':'DIGITAL'));grid.append(b);}}
    search.addEventListener('input',()=>{query=search.value;draw();});draw();
  }
  function outputPage(container){
    const all=D.outputs(),groups=[...new Set(all.map(o=>o.group))];if(!groups.includes(outputGroup))outputGroup='LCL';const items=all.filter(o=>o.group===outputGroup),nBanks=Math.ceil(items.length/16);outputBank=Math.min(outputBank,nBanks-1);
    const tools=U.el('div','desk-toolbar');tools.append(U.select('Gruppo uscite',outputGroup,groups.map(value=>({value,label:names[value]||value})),v=>{outputGroup=v;outputBank=0;U.refresh();}),U.button('Patch consecutiva',()=>sequenceDialog('outputs')));container.append(tools);if(nBanks>1)container.append(banks(Array.from({length:nBanks},(_,i)=>`${i*16+1}–${Math.min(items.length,(i+1)*16)}`),outputBank,i=>{outputBank=i;U.refresh();}));
    const {wrap,tbody}=table(['Destinazione','Segnale','Canale','Tap']);
    for(const o of items.slice(outputBank*16,outputBank*16+16)){const row=U.el('tr'),base=`/io/out/${o.group}/${o.index}`,stereo=['BUS','MAIN','MTX','MON','SEND'].includes(o.source?.split(':')[0]);cell(row,U.el('strong','',`${o.group} ${o.index}`));cell(row,read(base+'/grp')?guard(patchButton(`Assegna uscita ${o.group} ${o.index}`,()=>D.output(o.id).source,id=>{D.patchOutput(o.id,id);U.refresh();},{signals:true,allowedGroups:live()?['OFF','LCL','AUX','A','B','C','SC','USB','CRD','MOD','PLAY','AES','USR','OSC','BUS','MAIN','MTX','MON','SEND']:null}),base+'/grp'):U.el('span','desk-note','Non letto'));cell(row,live()&&!stereo?U.el('span','desk-note','Porta mono'):guard(U.select(`L/R uscita ${o.id}`,o.side||'L',live()?['L','R']:['L','R','SUM'],v=>D.change(d=>d.outputs[o.id].side=v,'routing')),base+'/in',null,()=>D.output(o.id).side));cell(row,live()?U.el('span','desk-note','Tap tramite USER'):U.select(`Tap uscita ${o.id}`,o.tap||'POST',['IN','PRE_EQ','POST_EQ','PRE_FADER','POST'],v=>D.change(d=>d.outputs[o.id].tap=v,'routing')));tbody.append(row);}
    if(live())container.append(U.el('p','desk-note','Per inviare un CH/AUX processato o scegliere un tap, crea prima un USER SIGNAL. Le uscite BUS/MAIN/MTX distinguono L e R.'));
    container.append(wrap);if(outputGroup==='LCL')container.append(U.el('p','desk-note','WING RACK: le cuffie IEM 1–4 riprendono le coppie locali 1/2, 3/4, 5/6 e 7/8.'));
    if(outputGroup==='MOD')container.append(U.el('p','desk-note','Patch del modulo lato WING. Le subscription fra dispositivi della rete Dante si gestiscono separatamente.'));
  }
  function userPage(container){
    container.append(banks(['Signals 1–12','Signals 13–24','Patches 1–16','Patches 17–32'],userBank,i=>{userBank=i;U.refresh();}));const start=[0,12,24,40][userBank],end=[12,24,40,56][userBank];
    const list=U.el('div','desk-list');for(const user of D.get().users.slice(start,end)){
      const row=U.el('div','desk-card'),heading=U.el('div','desk-row');heading.append(U.el('strong','',`USR ${user.id} · ${user.type==='SIGNAL'?'Signal':'Patch'}`),U.el('span','desk-badge',user.side));row.append(heading,guard(textInput('Nome',read(`/io/in/USR/${user.id}/name`)?user.name:'',v=>D.change(d=>{d.users[user.id-1].name=v;d.sources[`USR:${user.id}`].name=v;},'routing')),`/io/in/USR/${user.id}/name`));
      const route=U.el('div','desk-toolbar'),base=`/io/in/USR/${user.id}/user`;route.append(guard(patchButton(`Sorgente USER ${user.id}`,()=>D.get().users[user.id-1].source,id=>D.change(d=>d.users[user.id-1].source=id,'routing'),{signals:user.type==='SIGNAL',exclude:`USR:${user.id}`,allowedGroups:live()?(user.type==='SIGNAL'?['OFF','CH','AUXP','BUS','MAIN','MTX']:['OFF','LCL','AUX','A','B','C','SC','USB','CRD','MOD','PLAY','AES']):null}),base+'/grp'));if(!live()||user.type==='SIGNAL')route.append(guard(U.select(`L/R USER ${user.id}`,user.side,live()?['L','R','L+R']:['L','R','SUM'],v=>D.change(d=>d.users[user.id-1].side=v,'routing')),base+'/lr'));if(user.type==='SIGNAL')route.append(guard(U.select(`Tap USER ${user.id}`,user.tap,live()?['PRE','POST']:['IN','FILT','PRE_EQ','POST_EQ','PRE_DYN','POST_DYN','PRE_FADER','POST'],v=>D.change(d=>d.users[user.id-1].tap=v,'routing')),base+'/tap'));row.append(route);list.append(row);
    }container.append(list);
  }
  function devicePage(container){
    if(live()){container.append(U.el('p','desk-note','Le capacità e gli stati hardware si leggono dal firmware collegato. Apri il relativo gruppo per consultare e modificare i parametri disponibili.'),U.grid(U.card('Porte AES50',nativeButton('/$stat/A'),U.button('AES50 B',()=>L().openExplorer('/$stat/B')),U.button('AES50 C',()=>L().openExplorer('/$stat/C'))),U.card('Clock / USB / StageCONNECT',nativeButton('/$globals')),U.card('Scheda e modulo',nativeButton('/cards')),U.card('Sistema WING',nativeButton('/$syscfg'))));return;}
    const s=D.get().setup,summary=U.el('div','io-summary');summary.append(U.el('span','',`${s.model} · ${D.capacity('LCL')} IN / 8 OUT locali`),U.el('span','',`${s.sampleRate/1000} kHz · Clock ${s.clock}`),U.el('span','',`${s.module} · ${s.card}`));container.append(summary);
    const deviceGrid=U.grid();for(const group of ['A','B','C']){
      const remote=D.get().io.haRemote[group],card=U.card(`AES50 ${group}`,U.el('p','desk-note',`48 IN / 48 OUT · ${group==='C'?'Porta libera':'DL32 · profilo simulato'}`),U.toggle(`Controllo HA ${group}`,remote,v=>D.change(d=>d.io.haRemote[group]=v,'routing')),U.button('Apri sorgenti',()=>{sourceGroup=group;tab='sources';U.refresh();}));deviceGrid.append(card);
    }
    const sc=typeof s.stageConnect==='object'?s.stageConnect:{inputs:16,outputs:16,mode:'AUTO',power:true};deviceGrid.append(U.card('StageCONNECT',U.number('Canali in ingresso',sc.inputs,0,32,1,v=>{D.change(d=>{d.setup.stageConnect={...sc,inputs:v,outputs:32-v};},'setup');}),U.el('p','desk-note','32 canali complessivi: la quota restante viene riservata alle uscite.'),U.toggle('Alimentazione StageCONNECT',sc.power,v=>D.change(d=>d.setup.stageConnect.power=v,'setup'))));
    deviceGrid.append(U.card('USB Audio',U.select('Canali USB',String(s.usbChannels),['2','8','16','32','48'],v=>D.change(d=>d.setup.usbChannels=Number(v),'setup')),U.el('p','desk-note','Interfaccia audio USB del banco, separata dal player USB e dalla scheda WING-LIVE.')));
    deviceGrid.append(U.card('Scheda e modulo',U.select('Scheda',s.card,['WLIVE','DANTE','MADI','NONE'],v=>D.change(d=>d.setup.card=v,'setup')),U.select('Modulo AoIP',s.module,['DANTE','WSG','NONE'],v=>D.change(d=>d.setup.module=v,'setup')),U.button('Apri Setup',()=>U.open('setup'))));container.append(deviceGrid);
  }
  function exportIO(){const d=D.get();if(live()){const values={};for(const {path,section}of window.SculptWingMap.descriptors(C.getState()))if(['io','routing'].includes(section)&&L().hasValue(path))values[path]=L().value(path);U.download('Sculpt-WING-IO-lettura.json',JSON.stringify({format:'sculpt-wing-io-values',version:1,createdAt:new Date().toISOString(),console:L().snapshot().info,values},null,2));return;}U.download('Sculpt-Wing-patch.json',JSON.stringify({format:'sculpt-control-io',version:1,routing:{channels:d.channels,sources:d.sources,outputs:d.outputs,users:d.users,io:d.io}},null,2));}
  function importIO(){const input=U.el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Importa patch I/O');input.addEventListener('change',async()=>{try{const file=input.files?.[0];if(!file)return;if(file.size>3000000)throw new Error('File troppo grande');const p=JSON.parse(await file.text());if(p.format!=='sculpt-control-io'||!p.routing)throw new Error('Formato patch non valido');const snapshot=C.capture();for(const key of ['channels','sources','outputs','users','io'])if(p.routing[key])snapshot.desk[key]=p.routing[key];D.recall(snapshot,['routing'],[]);U.refresh();U.toast('Patch importata');}catch(e){U.toast(e.message||'Importazione non riuscita');}});input.click();}
  U.register('io',{title:'I/O · Routing',menuHint:'Sorgenti · Patch · Porte',subtitle:'Sorgenti, ingressi, uscite e dispositivi',render(container,args){
    if(args&&args!==appliedArgs){appliedArgs=args;if(['inputs','sources','outputs','user','devices'].includes(args.tab))tab=args.tab;if(args.group){if(tab==='sources')sourceGroup=args.group;if(tab==='outputs'){outputGroup=args.group;outputBank=0;}}}
    container.append(U.tabs([{id:'inputs',label:'Ingressi'},{id:'sources',label:'Sorgenti'},{id:'outputs',label:'Uscite'},{id:'user',label:'USER'},{id:'devices',label:'Dispositivi'}],tab,value=>{tab=value;U.refresh();}));
    const body=U.el('div','io-page-body');container.append(body);let disposed=false,lastMode=live()?L().snapshot().mode+':'+L().isWritable():'';
    const paint=()=>{if(disposed)return;body.replaceChildren();({inputs:inputPage,sources:sourcesPage,outputs:outputPage,user:userPage,devices:devicePage}[tab]||inputPage)(body);};
    async function hydrate(){
      if(!live()){paint();return;}
      if(!L().isConnected()){body.append(U.el('p','desk-note','Collega la WING per leggere il routing del banco.'),U.button('Connessione WING',()=>L().open(),'desk-primary'));return;}
      loading(body);
      try{
        if(tab==='inputs')await L().loadScope('io',{direction:'inputs',start:inputBank*8+1,count:8});
        else if(tab==='sources')await L().loadScope('io',{direction:'in',group:sourceGroup});
        else if(tab==='outputs')await L().loadScope('io',{direction:'out',group:outputGroup,start:outputBank*16+1,count:16});
        else if(tab==='user'){const starts=[1,13,25,41],counts=[12,12,16,16];await L().loadScope('io',{direction:'in',group:'USR',start:starts[userBank],count:counts[userBank]});}
        if(!disposed){if(L().isConnected())paint();else loading(body,'Connessione terminata. I valori non sono più aggiornati.');}
      }catch(e){if(!disposed){loading(body,e.message||'Lettura I/O non riuscita.');body.append(nativeButton('/io'));}}
    }
    const footer=U.el('div','desk-toolbar');footer.style.marginTop='20px';footer.append(U.button(live()?'Esporta valori letti':'Esporta patch',exportIO));
    if(!live())footer.append(U.button('Importa patch',importIO));else footer.append(nativeButton('/io'),U.el('span','desk-note','Sono modificabili solo i parametri letti dal banco.'));
    container.append(footer);hydrate();
    const unsubscribe=L()?.subscribe?.(status=>{const mode=status.mode+':'+status.writable;if(!disposed&&mode!==lastMode){lastMode=mode;U.refresh();}});
    const valuesOff=C.subscribe(event=>{if(event?.type==='live-values'&&!disposed)syncWire(body);});
    return()=>{disposed=true;unsubscribe?.();valuesOff?.();};
  }});
  window.SculptIO={pickSource,sourceEditor,label};
})();
