/* Channel-list preparation. Text extraction stays on this device. This module
 * edits only strip identity in the offline Sculpt project; it never patches I/O. */
(function(root){
  'use strict';
  const MAX_NAME=16,MAX_ROWS=500;
  const PALETTE=[
    ['#89949c','Grigio'],['#4969b7','Blu scuro'],['#0089ff','Blu'],['#5b33fa','Indaco'],
    ['#2bdfa6','Menta'],['#00b43d','Verde'],['#9acc00','Lime'],['#f6e100','Giallo'],
    ['#bd6a1b','Marrone'],['#e31b44','Rosso'],['#ff7679','Rosa'],['#f129e7','Magenta'],
    ['#a52ff6','Viola'],['#ffb71b','Ambra'],['#21bff0','Azzurro'],['#ff5a2d','Arancio'],
    ['#00c6ca','Turchese'],['#707070','Grigio scuro'],['#e0e0e0','Bianco']
  ];
  const FAMILIES=[
    {id:'drums',label:'Batteria',color:'#e31b44',test:/\b(kick|cassa|snare|rullante|hat|hihat|hi hat|tom|timpano|floor|overhead|oh|drums?|batteria|ride|crash)\b/},
    {id:'percussion',label:'Percussioni',color:'#bd6a1b',test:/\b(perc\w*|conga\w*|bongo\w*|cajon|shaker|timbales?|djembe|marimba|vibrafono)\b/},
    {id:'bass',label:'Basso',color:'#00b43d',test:/\b(bass|basso|contrabbasso|double bass)\b/},
    {id:'guitars',label:'Chitarre',color:'#0089ff',test:/\b(guitar\w*|gtr\w*|chit\w*|acoustic|e gtr|a gtr)\b/},
    {id:'keys',label:'Tastiere',color:'#e0e0e0',test:/\b(keys?|keyb\w*|tast\w*|piano\w*|synth\w*|hammond|organ\w*|rhodes)\b/},
    {id:'vocals',label:'Voci',color:'#ff7679',test:/\b(vox|voc\w*|voce|voci|coro|cori|choir|singer|cant\w*|bvs?)\b/},
    {id:'brass',label:'Fiati',color:'#f6e100',test:/\b(fiati|brass|horns?|sax\w*|trumpet|tromba|trombone|flute|flauto|clarinet\w*)\b/},
    {id:'strings',label:'Archi',color:'#ff5a2d',test:/\b(archi|strings?|violin\w*|viola|cello|violoncell\w*)\b/},
    {id:'playback',label:'Playback',color:'#00c6ca',test:/\b(playback|tracks?|seq\w*|basi|base|click|laptop|computer|ableton)\b/},
    {id:'ambient',label:'Ambienti / talkback',color:'#707070',test:/\b(amb\w*|audience|crowd|talk\w*|tb)\b/}
  ];
  const clean=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/\s+/g,' ').trim();
  const folded=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[._-]+/g,' ');
  const clone=value=>JSON.parse(JSON.stringify(value));
  const validTarget=id=>/^(?:ch-(?:[1-9]|[1-3]\d|40)|aux-[1-8])$/.test(String(id||''));
  const targetFor=(kind,number)=>Number.isInteger(number)&&number>0&&number<=(kind==='aux'?8:40)?`${kind}-${number}`:'';
  const labelFor=id=>String(id||'').replace(/^ch-/,'CH ').replace(/^aux-/,'AUX ');
  function suggestColor(name,group=''){
    const direct=FAMILIES.find(f=>f.test.test(folded(name))),family=direct||FAMILIES.find(f=>f.test.test(folded(group)));
    return family?{color:family.color,family:family.label}:{color:PALETTE[0][0],family:'Da scegliere'};
  }
  function makeRow(info,index){
    const originalName=clean(info.originalName??info.name),identity=suggestColor(originalName,info.group),name=originalName.slice(0,MAX_NAME);
    const targetId=info.targetId??targetFor(info.kind||'ch',info.number),notes=[...(info.notes||[])];
    if(originalName.length>MAX_NAME)notes.push('Nome accorciato a 16 caratteri: puoi modificarlo.');
    if(!targetId)notes.push(info.number?'Numero fuori dagli ingressi disponibili: scegli il canale.':'Scegli il canale di destinazione.');
    if(!name)notes.push('Nome mancante nel PDF.');
    return {id:'channel-list-'+index,sourceNumber:info.sourceNumber??(info.number?String(info.number):'—'),pageNumber:info.pageNumber||1,originalName,name,targetId,color:identity.color,family:identity.family,selected:!!(targetId&&name),notes};
  }
  function linesFromItems(items){
    const pieces=[];
    for(const item of items||[]){
      if(!clean(item.text??item.str))continue;
      const raw=String(item.text??item.str),x=Number(item.x)||0,y=Number(item.y)||0,height=Math.max(1,Number(item.height)||10),width=Math.max(0,Number(item.width)||raw.length*height*.5);
      // Wide spaces are column separators in plain-text and some PDF exports.
      const chunks=[...raw.matchAll(/\S(?:.*?\S)?(?=\s{2,}|\t|$)/g)];
      if(chunks.length>1)for(const part of chunks)pieces.push({text:clean(part[0]),x:x+width*part.index/raw.length,y,height,width:width*part[0].length/raw.length});
      else pieces.push({text:clean(raw),x,y,height,width});
    }
    pieces.sort((a,b)=>a.y-b.y||a.x-b.x);
    const lines=[];
    for(const piece of pieces){
      const recent=lines.slice(-3).find(line=>Math.abs(line.y-piece.y)<=Math.max(2,Math.min(line.height,piece.height)*.45));
      if(recent){recent.items.push(piece);recent.height=Math.max(recent.height,piece.height);}
      else lines.push({y:piece.y,height:piece.height,items:[piece]});
    }
    return lines.sort((a,b)=>a.y-b.y).map(line=>({...line,items:line.items.sort((a,b)=>a.x-b.x),text:line.items.map(i=>i.text).join(' ')}));
  }
  const numberHeader=/^(?:#|n[°º.]?|no\.?|nr\.?|num\.?|number|numero|ch\.?|channel|canale|input|in\.?)(?:\s*(?:#|no\.?|n[°º.]?|number|numero))?$/i;
  const nameHeader=/^(?:name|nome|instrument|instrumento|strumento|source|sorgente|signal|segnale|description|descrizione|channel name|input name|nome canale)$/i;
  const otherHeader=/^(?:mic(?:rophone)?(?:\s*\/\s*di)?|microfono|di|stand|asta|note|notes|patch|stagebox|phantom|48v|gain|insert|output|uscita|monitor|mix)$/i;
  function findHeaders(line){
    const items=line.items,starts=items.map((item,index)=>({item,index})).filter(({item})=>numberHeader.test(item.text)),headers=[];
    for(let i=0;i<starts.length;i++){
      const start=starts[i],end=starts[i+1]?.item.x??Infinity;
      const name=items.find(item=>item.x>=start.item.x&&item.x<end&&nameHeader.test(item.text));
      if(!name)continue;
      const next=items.find(item=>item.x>name.x&&item.x<end&&otherHeader.test(item.text));
      headers.push({left:start.item.x-8,right:end-8,numberX:start.item.x,nameX:name.x,nameEnd:next?.x??end-8});
    }
    return headers;
  }
  function parseNumber(value){
    const text=clean(value).replace(/[–—−]/g,'-'),match=/^(?:(CH(?:ANNEL)?|CAN(?:ALE)?|INPUT|IN|AUX)\s*)?(\d{1,3})(?:\s*([/+-])\s*(\d{1,3}))?(?:[.):])?$/i.exec(text);
    return match?{kind:match[1]?.toUpperCase()==='AUX'?'aux':'ch',number:+match[2],second:match[4]?+match[4]:null,sourceNumber:text}:null;
  }
  function parseLeading(text){
    const match=/^((?:(?:CH(?:ANNEL)?|CAN(?:ALE)?|INPUT|IN|AUX)\s*)?\d{1,3}(?:\s*[/+–—-]\s*\d{1,3})?[.):]?)(?:\s+|\s*[|;]\s*)(.*)$/i.exec(clean(text));
    return match?{...parseNumber(match[1]),name:clean(match[2])}:null;
  }
  const inputTitle=/^(?:input\s*(?:list|patch)|channel\s*list|ch\s*list|lista\s*(?:canali|ingressi)|elenco\s*(?:canali|ingressi)|canali\s*(?:input|ingresso)|ingressi)(?:\b|\s*[:—-])/i;
  const outputTitle=/^(?:output\s*(?:list|patch)|monitor\s*(?:list|mix|outputs?|iem)|lista\s*(?:uscite|monitor)|elenco\s*(?:uscite|monitor)|uscite|outputs?\s*[:—-]|bus\s*list|aux\s*sends)(?:\b|\s*[:—-])/i;
  const groupTitle=/^(?:drums?|batteria|percussion\w*|percussioni|bass|basso|guitars?|chitarre|keys|keyboards?|tastiere|vocals?|voci|cori|brass|fiati|strings|archi|playback|backing tracks?)\s*:?[\s]*$/i;
  function rowInfo(parsed,name,info){
    if(!parsed)return [{...info,name,sourceNumber:'—',targetId:''}];
    if(parsed.second){
      const stereo=/\b(?:stereo|l\s*[/+&-]\s*r|left\s*[/+&-]\s*right)\b/i.test(name),base=clean(name.replace(/\b(?:stereo|l\s*[/+&-]\s*r|left\s*[/+&-]\s*right)\b/ig,''));
      if(stereo&&parsed.second===parsed.number+1)return [parsed.number,parsed.second].map((number,index)=>({...info,kind:parsed.kind,number,sourceNumber:String(number),name:base+' '+(index?'R':'L'),notes:['Coppia numerata L/R nel PDF; controlla i due nomi.']}));
      return [{...info,name,sourceNumber:parsed.sourceNumber,targetId:'',notes:['Numerazione multipla: assegna il primo ingresso e aggiungi le altre righe necessarie.']}];
    }
    return [{...info,...parsed,name}];
  }
  function parseDocument(document,options={}){
    if(!document||!Array.isArray(document.pages))throw new Error('Il PDF non contiene pagine leggibili.');
    const infos=[],warnings=[],emptyPages=[],pageCount=document.pages.length;
    let section='input',group='',anyText=false,hadHeader=false,previousHeaders=[];
    for(const [pageIndex,page]of document.pages.entries()){
      const lines=linesFromItems(page.items),pageNumber=page.pageNumber||pageIndex+1;
      if(lines.length)anyText=true;else emptyPages.push(pageNumber);
      let headers=previousHeaders;
      for(const line of lines){
        const text=clean(line.text);
        if(!text)continue;
        if(inputTitle.test(text)){section='input';headers=[];continue;}
        if(outputTitle.test(text)){section='output';headers=[];continue;}
        if(section==='output')continue;
        const found=findHeaders(line);
        if(found.length){headers=found;hadHeader=true;continue;}
        if(/^(?:#|ch\.?|channel|canale|input|n[°º.]?|nr\.?)\s+(?:name|nome|source|sorgente|instrument|strumento|description|descrizione)\b/i.test(text))continue;
        if(groupTitle.test(text)){group=text.replace(/:$/,'');continue;}
        if(/^(?:page|pagina|pag\.?|foglio)\s*\d|^\d+\s*(?:of|di|\/)\s*\d+$|^(?:date|data|band|artist|artista|venue|location|contatti|contact|tech rider)\b/i.test(text))continue;
        if(infos.length>=MAX_ROWS)throw new Error('La lista contiene più di 500 righe. Importa soltanto le pagine della channel list.');
        if(headers.length){
          for(const header of headers){
            const cells=line.items.filter(i=>i.x>=header.left&&i.x<header.right);
            if(!cells.length)continue;
            const numberText=cells.filter(i=>i.x<header.nameX-5).map(i=>i.text).join(' '),name=cells.filter(i=>i.x>=header.nameX-5&&i.x<header.nameEnd-5).map(i=>i.text).join(' '),parsed=parseNumber(numberText);
            if(parsed){infos.push(...rowInfo(parsed,name,{pageNumber,group}));continue;}
            // Some generators put a whole table row into one text item.
            const leading=parseLeading(cells.map(i=>i.text).join(' '));
            if(leading){infos.push(...rowInfo(leading,leading.name,{pageNumber,group,notes:['Riga senza colonne separate: verifica il nome.']}));continue;}
            if(!numberText&&name&&!nameHeader.test(name)&&!otherHeader.test(name))infos.push(...rowInfo(null,name,{pageNumber,group}));
          }
        }else{
          const leading=parseLeading(text);
          if(leading){
            // Without column headings, separated trailing cells describe mic/stand/patch.
            const first=line.items[0],numberOnly=parseNumber(first?.text),name=numberOnly&&line.items.length>1?line.items[1].text:leading.name;
            infos.push(...rowInfo(leading,name,{pageNumber,group,notes:line.items.length<=1?['Verifica il nome: il PDF non indica le colonne.']:[]}));
          }else if(parseNumber(text))infos.push(...rowInfo(parseNumber(text),'',{pageNumber,group}));
          else if(options.manual&&text&&!numberHeader.test(text)&&!nameHeader.test(text))infos.push(...rowInfo(null,text,{pageNumber,group}));
        }
      }
      previousHeaders=headers;
    }
    if(!anyText)throw new Error('Questo PDF non contiene testo selezionabile. Per le scansioni serve il riconoscimento OCR, non ancora disponibile. Puoi incollare una lista di testo.');
    if(infos.length>MAX_ROWS)throw new Error('La lista contiene più di 500 righe. Importa soltanto le pagine della channel list.');
    if(emptyPages.length)warnings.push('Pagine senza testo selezionabile, non lette: '+emptyPages.join(', ')+'.');
    if(!infos.length)warnings.push('Non ho riconosciuto righe di ingresso. Puoi incollare la lista o aggiungere i canali manualmente.');
    if(infos.length&&!hadHeader)warnings.push('Colonne non riconosciute: controlla che ogni nome contenga soltanto il nome del canale.');
    return {rows:infos.map(makeRow),warnings,pageCount};
  }
  function parseText(text){
    const items=[];
    String(text||'').split(/\r?\n/).forEach((value,index)=>{
      const columns=value.trim().split(/\t+|\s{2,}|\s*[|;]\s*/);
      columns.forEach((column,col)=>items.push({text:column,x:col*240,y:index*16,width:Math.max(1,column.length)*6,height:10}));
    });
    return parseDocument({pages:[{pageNumber:1,items}]},{manual:true});
  }
  function validateRows(rows){
    const errors=[],selected=(rows||[]).filter(row=>row.selected),used=new Map(),rowErrors={};
    const add=(row,message)=>{errors.push(message);(rowErrors[row.id]||(rowErrors[row.id]=[])).push(message);};
    for(const row of selected){
      if(!validTarget(row.targetId))add(row,'Scegli un ingresso CH 1–40 o AUX 1–8.');
      const name=clean(row.name);
      if(!name)add(row,'Inserisci il nome del canale.');
      else if(name.length>MAX_NAME)add(row,'Il nome può contenere al massimo 16 caratteri.');
      if(!/^#[0-9a-f]{6}$/i.test(row.color||''))add(row,'Scegli un colore valido.');
      if(validTarget(row.targetId)){
        if(used.has(row.targetId)){const earlier=used.get(row.targetId),message=labelFor(row.targetId)+' è assegnato a più righe.';add(row,message);if(!rowErrors[earlier.id]?.includes(message))add(earlier,message);}
        else used.set(row.targetId,row);
      }
    }
    return {ok:selected.length>0&&errors.length===0,errors:[...new Set(errors)],rowErrors,selectedCount:selected.length,excludedCount:(rows||[]).length-selected.length};
  }
  const allStrips=state=>state.values?Object.values(state.values):[...(state.inputs||[]),...(state.outputs||[])];
  function identityPlan(rows,state){
    const validation=validateRows(rows);
    if(!validation.ok)return {...validation,changes:[],message:validation.errors[0]||'Seleziona almeno un canale.'};
    const strips=new Map(allStrips(state).map(strip=>[strip.id,strip])),changes=[];
    for(const row of rows.filter(r=>r.selected)){
      const strip=strips.get(row.targetId);
      if(!strip||!['CH','AUX'].includes(strip.kind))return {...validation,ok:false,changes:[],message:'Ingresso non disponibile: '+labelFor(row.targetId)};
      const before={name:strip.name,color:strip.color},after={name:clean(row.name),color:row.color.toLowerCase()};
      if(before.name!==after.name||before.color.toLowerCase()!==after.color)changes.push({id:strip.id,before,after});
    }
    return {...validation,changes,message:changes.length?'':'I nomi e i colori selezionati sono già applicati.'};
  }
  const environment=env=>({controller:env?.controller||root.SculptController,model:env?.model||root.SculptModel,live:env?.live||root.SculptLive});
  const isLive=env=>env.live?.isLive?.()===true||env.live?.canPersist?.()===false;
  function applyRows(rows,env){
    const e=environment(env);
    if(isLive(e))return {ok:false,message:'Passa alla demo offline per applicare la channel list.'};
    if(!e.controller?.getState||!e.controller?.transact||!e.model?.patchStrip)return {ok:false,message:'Il mixer locale non è disponibile.'};
    const plan=identityPlan(rows,e.controller.getState());
    if(!plan.ok||!plan.changes.length)return {...plan,ok:false};
    let applied=false;
    const accepted=e.controller.transact(state=>{
      if(isLive(e))return;
      const current=identityPlan(rows,state);if(!current.ok)return;
      const byId=new Map(allStrips(state).map(strip=>[strip.id,strip]));
      for(const change of plan.changes){const strip=byId.get(change.id);if(!strip||strip.name!==change.before.name||strip.color!==change.before.color)return;}
      for(const change of plan.changes)e.model.patchStrip(byId.get(change.id),change.after);
      applied=true;
    },'channel-list');
    if(accepted===false||!applied)return {ok:false,message:'Il progetto è cambiato. Controlla l’anteprima prima di applicare.'};
    return {ok:true,count:plan.changes.length,undo:clone(plan.changes),message:plan.changes.length+' ingressi aggiornati nel progetto offline.'};
  }
  function undoRows(changes,env){
    const e=environment(env);
    if(isLive(e))return {ok:false,message:'Passa alla demo offline per annullare l’importazione.'};
    if(!Array.isArray(changes)||!changes.length)return {ok:false,message:'Nessuna importazione da annullare.'};
    let restored=false,conflict=false;
    const accepted=e.controller.transact(state=>{
      if(isLive(e))return;
      const byId=new Map(allStrips(state).map(strip=>[strip.id,strip]));
      for(const change of changes){const strip=byId.get(change.id);if(!validTarget(change.id)||!strip||strip.name!==change.after.name||strip.color!==change.after.color){conflict=true;return;}}
      for(const change of changes)e.model.patchStrip(byId.get(change.id),{name:change.before.name,color:change.before.color});
      restored=true;
    },'channel-list-undo');
    return accepted!==false&&restored?{ok:true,message:'Nomi e colori precedenti ripristinati.'}:{ok:false,message:conflict?'Alcuni nomi o colori sono cambiati dopo l’importazione: annullamento non applicato.':'Il progetto non è più disponibile offline.'};
  }
  let active=null;
  function open(){
    if(active?.dialog.open){active.dialog.focus();return active;}
    const U=root.SculptUI;if(!U?.modal)throw new Error('Interfaccia Sculpt non disponibile.');
    const el=U.el,button=U.button,pane=el('section','cl-import'),intro=el('p','cl-intro','Importa il PDF, controlla la lista e scegli quali nomi e colori applicare al progetto offline.'),file=el('input','desk-input cl-file');
    file.type='file';file.accept='.pdf,application/pdf';file.setAttribute('aria-label','Scegli channel list PDF');
    const details=el('details','cl-paste'),summary=el('summary','','Incolla una lista di testo'),textarea=el('textarea','desk-input');textarea.rows=5;textarea.placeholder='1 Kick\n2 Snare\n3 Bass';textarea.setAttribute('aria-label','Testo della channel list');
    const parseButton=button('Leggi il testo',()=>{if(!textarea.value.trim()){status.textContent='Incolla almeno una riga.';return;}cancelRead();try{install(parseText(textarea.value),'Lista incollata');}catch(error){status.textContent=error.message;}},'cl-parse');details.append(summary,textarea,parseButton);
    const status=el('p','cl-status','PDF con testo selezionabile. Lettura sul dispositivo; per le scansioni l’OCR non è ancora disponibile.');status.setAttribute('role','status');
    const preview=el('div','cl-preview'),footer=el('div','cl-footer'),selectionSummary=el('p','cl-selection'),liveNote=el('p','cl-live-note'),apply=button('Applica nomi e colori',()=>{
      const result=applyRows(rows);status.textContent=result.message;
      if(result.ok){undoToken=result.undo;undo.hidden=false;undo.disabled=false;U.toast(result.message);}
      refreshStatus();
    },'desk-primary cl-apply'),undo=button('Annulla importazione',()=>{const result=undoRows(undoToken);status.textContent=result.message;if(result.ok){undoToken=null;undo.hidden=true;U.toast(result.message);}refreshStatus();},'cl-undo');undo.hidden=true;
    const finish=button('Chiudi',()=>handle.close()),actions=el('div','cl-actions');actions.append(undo,finish,apply);footer.append(selectionSummary,liveNote,actions);pane.append(intro,file,details,status,preview,footer);
    const handle=active=U.modal('Importa channel list',pane);handle.dialog.classList.add('cl-modal');
    let rows=[],generation=0,abort=null,busy=false,closed=false,undoToken=null,sourceName='',rowNodes=new Map();
    function cancelRead(){generation++;abort?.abort();abort=null;busy=false;}
    function refreshStatus(){
      if(closed)return;
      const validation=validateRows(rows),blocked=isLive(environment());
      selectionSummary.textContent=rows.length?`${validation.selectedCount} righe selezionate · ${validation.excludedCount} escluse`:'';
      liveNote.textContent=blocked?'Modalità WING attiva. Puoi preparare la lista; passa alla demo offline per applicarla.':validation.errors[0]||'';
      apply.disabled=busy||blocked||!validation.ok;undo.disabled=blocked||busy;
      for(const row of rows){const nodes=rowNodes.get(row.id);if(!nodes)continue;const errors=validation.rowErrors[row.id]||[];nodes.tr.classList.toggle('cl-row-error',errors.length>0);nodes.note.textContent=[...errors,...row.notes].join(' ');nodes.checkbox.checked=row.selected;}
    }
    function paint(){
      preview.replaceChildren();rowNodes=new Map();
      const addRow=()=>{if(rows.length>=MAX_ROWS){status.textContent='Puoi preparare al massimo 500 righe.';return;}rows.push(makeRow({name:'',targetId:''},'manual-'+generation+'-'+rows.length));paint();};
      if(!rows.length){preview.append(button('Aggiungi riga',addRow));refreshStatus();return;}
      const heading=el('div','cl-heading'),title=el('h3','',sourceName),hint=el('p','desk-note','Colori proposti per famiglia di strumenti, modificabili. Il nome sul banco usa al massimo 16 caratteri.');heading.append(title,hint);
      const tools=el('div','cl-toolbar');tools.append(button('Seleziona assegnate',()=>{rows.forEach(row=>row.selected=validTarget(row.targetId)&&!!clean(row.name));refreshStatus();}),button('Deseleziona tutto',()=>{rows.forEach(row=>row.selected=false);refreshStatus();}),button('Aggiungi riga',addRow));
      const wrap=el('div','cl-table-wrap'),table=el('table','cl-table'),head=el('thead'),tr=el('tr');for(const text of ['Usa','PDF','Destinazione','Nome','Colore']){const th=el('th','',text);th.scope='col';tr.append(th);}head.append(tr);table.append(head);const body=el('tbody');
      for(const row of rows){
        const tr=el('tr'),checkCell=el('td'),checkbox=el('input');tr.dataset.rowId=row.id;checkbox.type='checkbox';checkbox.checked=row.selected;checkbox.setAttribute('aria-label','Importa riga '+row.sourceNumber+' '+row.originalName);checkbox.addEventListener('change',()=>{row.selected=checkbox.checked;refreshStatus();});checkCell.append(checkbox);
        const pdfCell=el('td','cl-source');pdfCell.append(el('strong','',row.sourceNumber),el('small','','pag. '+row.pageNumber));
        const destCell=el('td'),destination=el('select','desk-input cl-target');destination.setAttribute('aria-label','Destinazione riga '+row.sourceNumber);let option=el('option','','Non assegnato');option.value='';destination.append(option);
        for(const [kind,count]of [['ch',40],['aux',8]])for(let n=1;n<=count;n++){option=el('option','',labelFor(kind+'-'+n));option.value=kind+'-'+n;destination.append(option);}destination.value=row.targetId;destination.addEventListener('change',()=>{row.targetId=destination.value;row.selected=validTarget(row.targetId)&&!!clean(row.name);row.notes=row.notes.filter(note=>!note.startsWith('Numero fuori')&&!note.startsWith('Scegli il canale'));refreshStatus();});destCell.append(destination);
        const nameCell=el('td','cl-name-cell'),name=el('input','desk-input cl-name');name.type='text';name.maxLength=MAX_NAME;name.value=row.name;name.setAttribute('aria-label','Nome riga '+row.sourceNumber);name.addEventListener('input',()=>{row.name=name.value;refreshStatus();});nameCell.append(name);if(row.originalName)nameCell.append(el('small','cl-original','PDF: '+row.originalName));const note=el('small','cl-row-note');nameCell.append(note);
        const colorCell=el('td'),colorLine=el('div','cl-color-line'),swatch=el('i','cl-swatch'),color=el('select','desk-input cl-color');color.setAttribute('aria-label','Colore riga '+row.sourceNumber);swatch.style.backgroundColor=row.color;swatch.setAttribute('aria-hidden','true');for(const [value,label]of PALETTE){option=el('option','',label);option.value=value;color.append(option);}color.value=row.color;color.addEventListener('change',()=>{row.color=color.value;swatch.style.backgroundColor=row.color;refreshStatus();});colorLine.append(swatch,color);colorCell.append(colorLine,el('small','cl-family',row.family));tr.append(checkCell,pdfCell,destCell,nameCell,colorCell);body.append(tr);rowNodes.set(row.id,{tr,note,checkbox});
      }
      table.append(body);wrap.append(table);preview.append(heading,tools,wrap);refreshStatus();
    }
    function install(result,label){rows=result.rows;sourceName=label;status.textContent=result.warnings.length?result.warnings.join(' '):`${rows.length} righe lette. Controlla l’anteprima prima di applicare.`;paint();}
    file.addEventListener('change',async()=>{
      const selected=file.files?.[0];if(!selected)return;cancelRead();const ticket=generation;abort=new AbortController();busy=true;rows=[];sourceName='';status.textContent='Lettura del PDF…';paint();
      try{if(!root.SculptPdfReader?.readFile)throw new Error('Il lettore PDF non è disponibile. Riapri l’app aggiornata.');const data=await root.SculptPdfReader.readFile(selected,{signal:abort.signal,onProgress:progress=>{if(ticket===generation&&!closed)status.textContent=typeof progress==='string'?progress:progress?.totalPages?'Lettura del PDF · pagina '+progress.pageNumber+' di '+progress.totalPages+'…':'Lettura del PDF…';}});if(ticket!==generation||closed)return;install(parseDocument(data),selected.name);}
      catch(error){if(ticket===generation&&!closed&&error.name!=='AbortError')status.textContent=error.message||'Non è stato possibile leggere il PDF.';}
      finally{if(ticket===generation&&!closed){busy=false;refreshStatus();}}
    });
    const unsubscribe=root.SculptLive?.subscribe?.(refreshStatus);
    handle.dialog.addEventListener('close',()=>{closed=true;cancelRead();unsubscribe?.();if(active===handle)active=null;},{once:true});
    paint();return handle;
  }
  const API={open,parseDocument,parseText,linesFromItems,suggestColor,validateRows,identityPlan,applyRows,undoRows,palette:PALETTE,maxNameLength:MAX_NAME};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;root.SculptChannelList=API;
})(typeof window!=='undefined'?window:globalThis);
