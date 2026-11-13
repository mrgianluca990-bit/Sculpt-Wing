/* Channel-list recognition. Text extraction stays on this device. Scene
 * planning and the editable preview are separate; channel I/O is never patched. */
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
    {id:'drums',label:'Batteria',color:'#e31b44',test:/\b(kick|cassa|snare|rullante|hat|hihat|hi hat|tom\d*|timpano|floor|overhead|over|oh|drums?|batteria|ride|crash)\b/},
    {id:'percussion',label:'Percussioni',color:'#bd6a1b',test:/\b(perc\w*|conga\w*|bongo\w*|cajon|shaker|timbales?|djembe|marimba|vibrafono|tamburello|tammorra|xilofono|glockenspiel|piatti|triangolo|gong|campane tubolari)\b/},
    {id:'bass',label:'Basso',color:'#00b43d',test:/\b(bass|basso|contrabbasso|double bass)\b/},
    {id:'guitars',label:'Chitarre',color:'#0089ff',test:/\b(guitar\w*|gtr\w*|chit\w*|acoustic|e gtr|a gtr)\b/},
    {id:'keys',label:'Tastiere',color:'#e0e0e0',test:/\b(keys?|keyb\w*|tast\w*|piano\w*|synth\w*|hammond|organ\w*|rhodes|fisarmonica|accordion|celesta|clavicembalo)\b/},
    {id:'vocals',label:'Voci',color:'#ff7679',test:/\b(vox|voc\w*|voce|voci|coro|cori|choir|singer|cant\w*|bvs?)\b/},
    {id:'brass',label:'Fiati',color:'#f6e100',test:/\b(fiati|brass|horns?|corno|sax\w*|trumpet|tromba|trombone|flute|flauto|clarinet\w*|ottavino|oboe|fagotto|controfagotto|bassoon|contrabassoon|tuba)\b/},
    {id:'strings',label:'Archi',color:'#ff5a2d',test:/\b(archi|strings?|violin\w*|viola|cello|violoncell\w*)\b/},
    {id:'playback',label:'Playback',color:'#00c6ca',test:/\b(playback|tracks?|seq\w*|basi|base|click|laptop|computer|ableton|dj)\b/},
    {id:'ambient',label:'Ambienti / talkback',color:'#707070',test:/\b(amb\w*|audience|crowd|talk\w*|tb)\b/}
  ];
  const clean=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/\s+/g,' ').trim();
  const folded=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[._-]+/g,' ');
  const clone=value=>JSON.parse(JSON.stringify(value));
  const validTarget=id=>/^(?:ch-(?:[1-9]|[1-3]\d|40)|aux-[1-8])$/.test(String(id||''));
  const targetFor=(kind,number)=>Number.isInteger(number)&&number>0&&number<=(kind==='aux'?8:40)?`${kind}-${number}`:'';
  const labelFor=id=>String(id||'').replace(/^ch-/,'CH ').replace(/^aux-/,'AUX ');
  function suggestColor(name,group=''){
    const text=folded(name),lowWind=/\b(?:clarinet\w*\s+basso|bass\s+(?:clarinet\w*|sax\w*|trombone|trumpet|flute))\b/.test(text);
    const direct=lowWind?FAMILIES.find(f=>f.id==='brass'):FAMILIES.find(f=>f.test.test(text)),family=direct||FAMILIES.find(f=>f.test.test(folded(group)));
    return family?{color:family.color,family:family.label}:{color:PALETTE[0][0],family:'Da scegliere'};
  }
  function makeRow(info,index){
    const originalName=clean(info.originalName??info.name),identity=suggestColor(originalName,info.group),name=originalName.slice(0,MAX_NAME);
    const targetId=info.targetId??targetFor(info.kind||'ch',info.number),notes=[...(info.notes||[])];
    if(originalName.length>MAX_NAME)notes.push('Nome accorciato a 16 caratteri: puoi modificarlo.');
    if(!targetId)notes.push(info.number?'Numero fuori dagli ingressi disponibili: scegli il canale.':'Scegli il canale di destinazione.');
    if(!name)notes.push('Nome mancante nel PDF.');
    return {id:'channel-list-'+index,sourceNumber:info.sourceNumber??(info.number?String(info.number):'—'),pageNumber:info.pageNumber||1,originalName,name,targetId,color:identity.color,family:identity.family,group:clean(info.group),pairKey:info.pairKey||'',instrumentKey:info.instrumentKey||'',instrumentName:info.instrumentName||'',selected:!!(targetId&&name),notes};
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
  const otherHeader=/^(?:mic(?:rophone)?(?:\s*\/\s*di)?|di\s*\/\s*mic(?:rophone)?|microfono|di|stand|asta|note|notes|patch|stagebox|phantom|48v|gain|insert|output|uscita|monitor|mix)$/i;
  function findHeaders(line){
    const items=line.items,starts=items.map((item,index)=>({item,index})).filter(({item})=>numberHeader.test(item.text)),headers=[];
    for(let i=0;i<starts.length;i++){
      const start=starts[i],end=starts[i+1]?.item.x??Infinity;
      const name=items.find(item=>item.x>=start.item.x&&item.x<end&&nameHeader.test(item.text));
      if(!name)continue;
      const next=items.find(item=>item.x>name.x&&item.x<end&&otherHeader.test(item.text));
      headers.push({left:start.item.x-8,right:end-8,numberX:start.item.x,nameX:name.x,nameEnd:next?.x??end-8,producer:items.some(item=>/^di\s*\/\s*mic$/i.test(item.text))});
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
  const otherSection=/^(?:stage\s*plot|preventivo(?:\s|$)|quotation(?:\s|$)|quote(?:\s|$)|lista\s+di\s+carico|packing\s*list|stage\s*plan|pianta\s*palco)/i;
  const groupTitle=/^(?:drums?|batteria|percussion\w*|percussioni|bass|basso|guitars?|chitarre|keys|keyboards?|tastiere|vocals?|voci|cori|brass|fiati|strings|archi|playback|backing tracks?)\s*:?[\s]*$/i;
  function rowInfo(parsed,name,info){
    if(!parsed)return [{...info,name,sourceNumber:'—',targetId:''}];
    if(parsed.second){
      const stereo=/\b(?:stereo|l\s*[/+&-]\s*r|left\s*[/+&-]\s*right)\b/i.test(name),base=clean(name.replace(/\b(?:stereo|l\s*[/+&-]\s*r|left\s*[/+&-]\s*right)\b/ig,''));
      if(stereo&&parsed.second===parsed.number+1)return [parsed.number,parsed.second].map((number,index)=>({...info,kind:parsed.kind,number,sourceNumber:String(number),name:base+' '+(index?'R':'L'),pairKey:info.pageNumber+':'+parsed.sourceNumber+':'+base,instrumentName:base,notes:['Coppia numerata L/R nel PDF; controlla i due nomi.']}));
      return [{...info,name,sourceNumber:parsed.sourceNumber,targetId:'',notes:['Numerazione multipla: assegna il primo ingresso e aggiungi le altre righe necessarie.']}];
    }
    return [{...info,...parsed,name}];
  }
  function instrumentHints(rows){
    const hasSequences=rows.some(row=>/\b(seq\w*|backing tracks?)\b/i.test(row.originalName));
    const drumPart=/^(?:kick|cassa|snare|rullante|hi[ -]?hat|hh|tom\d*|floor|over(?:head)?|oh|ride|crash)(?:\b|\s*\d)/i;
    for(const row of rows){
      const name=clean(row.originalName),suffix=/^(.+?)\s*[·•]\s*(.+)$/.exec(name),stereo=/^(.+?)\s+(?:l|r|left|right|sx|dx)$/i.exec(name);
      let key='',label='';
      if(row.instrumentKey){continue;}
      if(suffix){key='named:'+folded(suffix[2]);label=clean(suffix[2]);}
      else if(row.pairKey){key='pair:'+row.pairKey;label=row.instrumentName||name.replace(/\s+[LR]$/,'');}
      else if(/^drum\s*pad\b/i.test(name)){label=clean(stereo?stereo[1]:name);key='parts:'+folded(label);}
      else if(drumPart.test(name)||/^(?:batteria|drums?)$/i.test(row.group)&&row.family==='Batteria'){key='instrument:batteria';label='Batteria';}
      else if(/^(?:piano|pianoforte)(?:\s+\d+)?\s+(?:l|r|buca|left|right|sx|dx)$/i.test(name)){label=name.replace(/\s+(?:l|r|buca|left|right|sx|dx)$/i,'');key='parts:'+folded(label);}
      else if(/^(?:seq\w*|backing tracks?)(?:\s+[lr])?$/i.test(name)||hasSequences&&/^click$/i.test(name)){key='instrument:sequenze';label='Sequenze';}
      else if(stereo){label=clean(stereo[1]);key='parts:'+folded(label);}
      else if(/\s+(?:di|mic)$/i.test(name)&&['Basso','Chitarre'].includes(row.family)){label=name.replace(/\s+(?:di|mic)$/i,'');key='parts:'+folded(label);}
      else{label=name||'Strumento';key='row:'+row.id;}
      row.instrumentKey=key;row.instrumentName=label;
    }
    // Repeated anonymous L/R (or DI/Mic) pairs can belong to different players.
    // Match the first L with the first R, the second L with the second R, etc.
    // Explicit named descriptors and numbered PDF pairs remain authoritative.
    const parts=new Map();
    for(const row of rows)if(row.instrumentKey.startsWith('parts:')){if(!parts.has(row.instrumentKey))parts.set(row.instrumentKey,[]);parts.get(row.instrumentKey).push(row);}
    for(const [key,members]of parts){
      const counts=new Map(),occurrences=[];
      for(const row of members){
        const raw=/\s+(l|r|left|right|sx|dx|buca|di|mic)$/i.exec(row.originalName)?.[1]?.toLowerCase()||'single';
        const part=['l','left','sx'].includes(raw)?'L':['r','right','dx'].includes(raw)?'R':raw;
        const index=(counts.get(part)||0)+1;counts.set(part,index);occurrences.push([row,index]);
      }
      if([...counts.values()].some(count=>count>1))for(const [row,index]of occurrences){row.instrumentKey=key+':'+index;row.instrumentName+=' '+index;}
    }
    // Repeated anonymous one-channel names are distinct performers; a colour
    // family is never sufficient evidence that they share one monitor.
    const anonymous=new Map();
    for(const row of rows)if(row.instrumentKey.startsWith('row:')){const key=folded(row.instrumentName);if(!anonymous.has(key))anonymous.set(key,[]);anonymous.get(key).push(row);}
    for(const group of anonymous.values())if(group.length>1)group.forEach((row,i)=>{row.instrumentName+=' '+(i+1);});
    return rows;
  }
  function findOutputHeader(line){
    const items=line.items,start=items.find(item=>/^(?:uscita|output|aux|bus|ch|#)$/i.test(item.text)),name=items.find(item=>/^(?:destinazione|destination|name|nome|instrument|strumento|sorgente|source)$/i.test(item.text));
    if(!start||!name||name.x<=start.x)return null;
    const format=items.find(item=>/^(?:formato|format|side|l\/r)$/i.test(item.text)),next=items.find(item=>item.x>name.x&&/^(?:formato|format|side|note|notes|mic(?:\/di)?|stand|asta|patch)$/i.test(item.text));
    return {left:start.x-8,numberX:start.x,nameX:name.x,nameEnd:next?.x??Infinity,formatX:format?.x,formatEnd:items.find(item=>item.x>(format?.x??Infinity))?.x??Infinity,producer:/^uscita$/i.test(start.text)};
  }
  function monitorHints(infos,warnings){
    const monitors=[],paired=new Set();
    for(const [index,info]of infos.entries()){
      if(paired.has(index)||!clean(info.name))continue;
      const originalName=clean(info.name),normal=folded(originalName),explicitMonitor=/\b(iem|in ear|monitor|wedge|mon\d*)\b/.test(normal);
      if(!explicitMonitor&&/\b(main|pa|foh|sub|subwoofer|record\w*|stream\w*|broadcast|frontfill|front fill|delay|matrix|matrice)\b/.test(normal)){
        warnings.push('Uscita «'+originalName+'» esclusa dai monitor: puoi aggiungerla manualmente.');continue;
      }
      const sourceNumbers=[info.sourceNumber],sides=[info.side||'Mono'];
      if(['L','R'].includes(info.side)){
        const partner=infos.findIndex((other,j)=>j>index&&!paired.has(j)&&folded(other.name)===normal&&other.side===(info.side==='L'?'R':'L'));
        if(partner>=0){paired.add(partner);sourceNumbers.push(infos[partner].sourceNumber);sides.push(infos[partner].side);}
        else warnings.push('Uscita «'+originalName+'»: nel PDF è presente soltanto il lato '+info.side+'. Verifica il monitor.');
      }
      const instrumentName=clean(originalName.replace(/^(?:(?:iem|in[- ]?ear|monitor|wedge|mon)\s*[-:·]?\s*)/i,''))||originalName;
      monitors.push({id:'pdf-monitor-'+(monitors.length+1),name:originalName.slice(0,MAX_NAME),originalName,instrumentName,sourceNumbers,format:sides.length===2?'L/R':sides[0],pageNumber:info.pageNumber});
    }
    return monitors;
  }
  function parseDocument(document,options={}){
    if(!document||!Array.isArray(document.pages))throw new Error('Il PDF non contiene pagine leggibili.');
    const infos=[],outputInfos=[],warnings=[],emptyPages=[],pageCount=document.pages.length;
    const pages=document.pages.map((page,index)=>({...page,pageNumber:page.pageNumber||index+1,lines:linesFromItems(page.items)}));
    const hasInputSection=pages.some(page=>page.lines.some(line=>inputTitle.test(clean(line.text))));
    const hasInputTable=pages.some(page=>page.lines.some(line=>findHeaders(line).length));
    let section=hasInputSection?'other':'input',group='',anyText=false,hadHeader=false,previousHeaders=[],outputHeader=null;
    for(const page of pages){
      const lines=page.lines,pageNumber=page.pageNumber;
      if(lines.length)anyText=true;else emptyPages.push(pageNumber);
      let headers=previousHeaders,lastInputByColumn=new Map(),lastOutput=null;
      for(const line of lines){
        const text=clean(line.text);
        if(!text)continue;
        if(inputTitle.test(text)){section='input';headers=[];outputHeader=null;lastInputByColumn.clear();continue;}
        if(outputTitle.test(text)){section='output';headers=[];outputHeader=null;lastInputByColumn.clear();lastOutput=null;continue;}
        if(otherSection.test(text)){section=/^(?:stage|pianta)/i.test(text)?'stage':'other';headers=[];outputHeader=null;lastInputByColumn.clear();continue;}
        if(/^(?:page|pagina|pag\.?|foglio)\s*\d|^\d+\s*(?:of|di|\/)\s*\d+$|^(?:date|data|band|artist|artista|venue|location|contatti|contact|tech rider)\b/i.test(text))continue;
        if(section==='output'){
          const found=findOutputHeader(line);if(found){outputHeader=found;lastOutput=null;continue;}
          if(outputHeader){
            const h=outputHeader,numberText=line.items.filter(i=>i.x>=h.left&&i.x<h.nameX-5).map(i=>i.text).join(' '),parsed=parseNumber(numberText),name=line.items.filter(i=>i.x>=h.nameX-5&&i.x<h.nameEnd-5).map(i=>i.text).join(' '),side=line.items.filter(i=>i.x>=(h.formatX??Infinity)-5&&i.x<h.formatEnd-5).map(i=>i.text).join(' ');
            if(parsed){lastOutput={name,sourceNumber:parsed.sourceNumber,side:/^[lr]$/i.test(side)?side.toUpperCase():'Mono',pageNumber};outputInfos.push(lastOutput);}
            else if(!numberText&&name&&lastOutput&&(h.producer||line.y-(lastOutput.lastY??line.y)<=line.height*1.5)){lastOutput.name=clean(lastOutput.name+' '+name);}
            if(lastOutput)lastOutput.lastY=line.y;
          }else{
            const leading=parseLeading(text);if(leading)outputInfos.push({name:leading.name,sourceNumber:leading.sourceNumber,side:'Mono',pageNumber});
          }
          continue;
        }
        if(section==='stage'){
          // Producer's desktop print puts the input table directly after the
          // stage plot, without a CHANNEL LIST/INGRESSI heading. Its explicit
          // columns are required before accepting any stage labels as inputs.
          const stageHeaders=findHeaders(line);
          if(stageHeaders.length){section='input';headers=stageHeaders;hadHeader=true;lastInputByColumn.clear();}
          continue;
        }
        if(section!=='input')continue;
        const found=findHeaders(line);
        if(found.length){headers=found;hadHeader=true;lastInputByColumn.clear();continue;}
        if(!headers.length&&hasInputTable)continue;
        if(/^(?:#|ch\.?|channel|canale|input|n[°º.]?|nr\.?)\s+(?:name|nome|source|sorgente|instrument|strumento|description|descrizione)\b/i.test(text))continue;
        if(groupTitle.test(text)){group=text.replace(/:$/,'');lastInputByColumn.clear();continue;}
        if(infos.length>=MAX_ROWS)throw new Error('La lista contiene più di 500 righe. Importa soltanto le pagine della channel list.');
        if(headers.length){
          for(const header of headers){
            const cells=line.items.filter(i=>i.x>=header.left&&i.x<header.right);
            if(!cells.length)continue;
            const numberText=cells.filter(i=>i.x<header.nameX-5).map(i=>i.text).join(' '),name=cells.filter(i=>i.x>=header.nameX-5&&i.x<header.nameEnd-5).map(i=>i.text).join(' '),parsed=parseNumber(numberText);
            if(parsed){const newInfos=rowInfo(parsed,name,{pageNumber,group});infos.push(...newInfos);lastInputByColumn.set(header.left,{infos:newInfos,lastY:line.y});continue;}
            // Some generators put a whole table row into one text item.
            const leading=cells[0].x<header.nameX-5?parseLeading(cells.map(i=>i.text).join(' ')):null;
            if(leading){infos.push(...rowInfo(leading,leading.name,{pageNumber,group,notes:['Riga senza colonne separate: verifica il nome.']}));continue;}
            if(!numberText&&name&&!nameHeader.test(name)&&!otherHeader.test(name)){
              const previous=lastInputByColumn.get(header.left);
              if(previous&&previous.infos.length===1&&(header.producer||line.y-previous.lastY<=line.height*1.5)){
                previous.infos[0].name=clean(previous.infos[0].name+' '+name);previous.lastY=line.y;
              }else{const newInfos=rowInfo(null,name,{pageNumber,group});infos.push(...newInfos);lastInputByColumn.set(header.left,{infos:newInfos,lastY:line.y});}
            }
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
    const rows=instrumentHints(infos.map(makeRow)),monitors=monitorHints(outputInfos,warnings);
    if(monitors.length)warnings.push('Monitor letti dal PDF: controlla i bus e gli strumenti assegnati. I numeri AUX del documento non modificano il routing della WING.');
    return {rows,monitors,warnings,pageCount};
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
  function sceneEngine(){
    if(root.SculptChannelScene)return root.SculptChannelScene;
    if(typeof module!=='undefined'&&module.exports)return require('./channel-list-scene.js');
    throw new Error('Il modulo di preparazione scena non è disponibile. Riapri l’app aggiornata.');
  }
  function sceneDraft(rowsOrDraft,env){
    const state=(env?.controller||root.SculptController)?.getState?.();
    return Array.isArray(rowsOrDraft)?sceneEngine().prepareDraft({rows:rowsOrDraft},state):rowsOrDraft;
  }
  function applyRows(rowsOrDraft,env){return sceneEngine().applyDraft(sceneDraft(rowsOrDraft,env),env);}
  function undoRows(token,env){return sceneEngine().undoDraft(token,env);}
  function open(){
    if(!root.SculptChannelPreview?.open)throw new Error('L’anteprima della scena non è disponibile. Riapri l’app aggiornata.');
    return root.SculptChannelPreview.open();
  }
  const API={open,parseDocument,parseText,linesFromItems,suggestColor,validateRows,instrumentHints,applyRows,undoRows,palette:PALETTE,maxNameLength:MAX_NAME};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;root.SculptChannelList=API;
})(typeof window!=='undefined'?window:globalThis);
