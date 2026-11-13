/* Editable local scene preparation. The preview never writes mixer state until Apply. */
(function(root){
  'use strict';
  const labelFor=id=>String(id||'').replace(/^ch-/,'CH ').replace(/^aux-/,'AUX ').replace(/^bus-/,'BUS ');
  const formatDb=value=>Number.isFinite(value)?value<=-90?'−∞':String(value).replace('.',','):'';
  function parseDb(value){
    const text=String(value??'').trim().replace(/−/g,'-').replace(',','.');
    if(/^-(?:∞|inf(?:inity)?)$/i.test(text))return -90;
    return text&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)?Number(text):NaN;
  }
  const isInput=id=>/^(?:ch-(?:[1-9]|[1-3]\d|40)|aux-[1-8])$/.test(String(id||''));
  // Closing the applied preview must not discard the one-step, conflict-checked undo.
  let active=null,lastUndo=null;
  const environment=()=>({controller:root.SculptController,model:root.SculptModel,live:root.SculptLive});
  const live=()=>root.SculptLive?.isLive?.()===true||root.SculptLive?.canPersist?.()===false;
  const canUndo=()=>!!lastUndo?.length&&!live();
  function undoLast(){
    let result;try{result=root.SculptChannelScene.undoDraft(lastUndo,environment());}catch(error){result={ok:false,message:error.message||'Non è stato possibile annullare l’importazione.'};}
    if(result.ok)lastUndo=null;
    active?.refreshStatus?.();root.SculptUI?.toast?.(result.message);return result;
  }
  function open(){
    if(active?.dialog.open){active.dialog.focus();return active;}
    const U=root.SculptUI,I=root.SculptChannelList,S=root.SculptChannelScene,C=root.SculptController;
    if(!U?.modal||!I||!S?.prepareDraft||!C?.getState)throw new Error('L’anteprima della scena non è disponibile. Riapri l’app aggiornata.');
    const el=U.el,button=U.button,pane=el('section','cl-import cl-scene-import');
    const getState=()=>C.getState();
    let draft=null,tab='channels',renderedTab=null,sendRowId='',sendScope='instrument',generation=0,abort=null,busy=false,closed=false,sourceName='',rowNodes=new Map(),monitorNodes=new Map(),remainingNodes=new Map(),monitorSequence=0;
    const positions=new Map();
    // These checkboxes select an editing operation, independently of the rows to import.
    let groupSelection=new Set(),activeGroupKey='',newGroupName='',groupReferenceId='',moveTargetKey='',groupView='group';
    const intro=el('div','cl-intro-line'),introText=el('p','cl-intro','Dal PDF alla scena: controlla e modifica canali, livelli e mandate prima di applicare.'),protectedBadge=el('span','cl-routing-badge','Routing protetto');
    intro.append(introText,protectedBadge);
    const importLine=el('div','cl-import-line'),file=el('input','desk-input cl-file');file.type='file';file.accept='.pdf,application/pdf';file.setAttribute('aria-label','Scegli channel list PDF');
    const details=el('details','cl-paste'),summary=el('summary','','Incolla testo'),textarea=el('textarea','desk-input');textarea.rows=4;textarea.placeholder='1 Kick\n2 Snare\n3 Bass';textarea.setAttribute('aria-label','Testo della channel list');
    const parseButton=button('Leggi il testo',()=>{
      if(!textarea.value.trim()){status.textContent='Incolla almeno una riga.';return;}
      cancelRead();try{install(I.parseText(textarea.value),'Lista incollata');details.open=false;}catch(error){status.textContent=error.message;}
    },'cl-parse');details.append(summary,textarea,parseButton);importLine.append(file,details);
    const status=el('p','cl-status','Scegli un PDF, incolla la lista oppure aggiungi un canale vuoto. La lettura avviene sul dispositivo.');status.setAttribute('role','status');
    const preview=el('div','cl-preview'),footer=el('div','cl-footer'),selectionSummary=el('p','cl-selection'),validationNote=el('p','cl-live-note'),editedNote=el('p','cl-edited-note');
    const apply=button('Applica scena',()=>{
      if(!draft)return;let result;
      try{result=S.applyDraft(draft,environment());}catch(error){result={ok:false,message:error.message||'Non è stato possibile applicare la scena.'};}
      status.textContent=result.message;
      if(result.ok){if(result.undo?.length)lastUndo=result.undo;handle.close();U.toast(result.message);return;}
      refreshStatus();
    },'desk-primary cl-apply');
    const undo=button('Annulla importazione',()=>{
      const result=undoLast();status.textContent=result.message;refreshStatus();
    },'cl-undo');undo.hidden=!lastUndo?.length;
    undo.title='Annulla l’ultima importazione applicata in questa sessione, se i suoi valori non sono stati modificati.';
    const actions=el('div','cl-actions'),close=button('Chiudi',()=>handle.close());actions.append(undo,close,apply);footer.append(selectionSummary,editedNote,validationNote,actions);pane.append(intro,importLine,status,preview,footer);
    const handle=active=U.modal('Importa channel list',pane);handle.dialog.classList.add('cl-modal','cl-scene-modal');
    function cancelRead(){generation++;abort?.abort();abort=null;busy=false;}
    function validation(){return draft?S.validateDraft(draft,getState()):{ok:false,errors:[],warnings:[],rowErrors:{},selectedCount:0,remainingCount:0,sendCount:0};}
    function refreshStatus(){
      if(closed)return;const v=validation(),blocked=live();
      selectionSummary.textContent=draft?`${v.selectedCount??draft.rows.filter(row=>row.selected).length} canali importati · ${draft.monitors.length} monitor · ${v.remainingCount||0} canali rimanenti da inizializzare`:'';
      validationNote.textContent=blocked?'Modalità WING attiva: puoi preparare l’anteprima. Passa alla demo offline per applicare la scena.':v.errors?.[0]||v.warnings?.[0]||'';
      apply.disabled=busy||blocked||!v.ok;undo.hidden=!lastUndo?.length;undo.disabled=blocked||busy||!lastUndo?.length;
      const selected=draft?.rows.filter(row=>row.selected)||[],opened=selected.filter(row=>row.mute===false).length,raised=selected.filter(row=>Number.isFinite(row.level)&&row.level>-90).length;
      const independent=selected.reduce((count,row)=>count+Object.values(row.sends||{}).filter(send=>send.on&&send.followMute===false).length,0);
      editedNote.textContent=[opened||raised?`Hai modificato i valori iniziali: ${opened} canali con mute disattivato, ${raised} fader sopra −∞.`:'',independent?`${independent} mandate attive non seguono il mute del canale.`:''].filter(Boolean).join(' ');
      for(const [id,nodes]of monitorNodes){const errors=v.monitorErrors?.[id]||[];nodes.note.textContent=errors.join(' ');nodes.card.classList.toggle('cl-row-error',errors.length>0);}
      for(const [id,nodes]of remainingNodes){const errors=v.remainingErrors?.[id]||[];nodes.note.textContent=errors.join(' ');nodes.tr.classList.toggle('cl-row-error',errors.length>0);}
      for(const row of draft?.rows||[]){const nodes=rowNodes.get(row.id);if(!nodes)continue;const errors=v.rowErrors?.[row.id]||[];nodes.tr.classList.toggle('cl-row-error',errors.length>0);nodes.note.textContent=[...errors,...(row.notes||[])].join(' ');nodes.checkbox.checked=!!row.selected;}
    }
    function sync(){S.syncDraft(draft,getState());}
    function change(action,repaint=false){try{action();if(repaint)paint();else refreshStatus();}catch(error){status.textContent=error.message||'Controlla il valore inserito.';refreshStatus();}}
    function textInput(label,value,update,max=16){const input=el('input','desk-input');input.type='text';input.maxLength=max;input.value=value??'';input.setAttribute('aria-label',label);input.addEventListener('input',()=>change(()=>update(input.value)));return input;}
    function stripNameInput(label,value,target,update){
      const input=textInput(label,value,update,I.maxNameLength);
      const commit=()=>{if(input.disabled||input.value.trim())return;const id=target();if(!isInput(id)&&!/^bus-(?:[1-9]|1[0-6])$/.test(String(id||'')))return;input.value=labelFor(id);change(()=>update(input.value));};
      input.addEventListener('blur',commit);input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit();input.blur();}});
      return input;
    }
    function check(label,value,update){const input=el('input');input.type='checkbox';input.checked=!!value;input.setAttribute('aria-label',label);input.addEventListener('change',()=>change(()=>update(input.checked)));return input;}
    function select(label,value,options,update,className=''){const input=el('select','desk-input '+className);input.setAttribute('aria-label',label);for(const [val,text]of options){const option=el('option','',text);option.value=val;input.append(option);}input.value=value??'';input.addEventListener('change',()=>change(()=>update(input.value)));return input;}
    function dbInput(label,value,update){
      const wrap=el('div','cl-db'),input=textInput(label,formatDb(value),text=>{const n=parseDb(text);input.setAttribute('aria-invalid',String(!Number.isFinite(n)||n<-90||n>10));update(n);},12);input.inputMode='decimal';input.title='Da −∞ (−90 dB) a +10 dB';
      input.addEventListener('blur',()=>{const n=parseDb(input.value);if(Number.isFinite(n)&&n>=-90&&n<=10)input.value=formatDb(n);});
      const unit=el('span','','dB');unit.setAttribute('aria-hidden','true');wrap.append(input,unit);return wrap;
    }
    function colorInput(label,value,update){
      const wrap=el('div','cl-color-line'),swatch=el('i','cl-swatch'),options=I.palette.map(p=>[p[0],p[1]]);if(value&&!options.some(([v])=>v.toLowerCase()===String(value).toLowerCase()))options.unshift([value,'Attuale '+value]);
      const input=select(label,value,options,color=>{swatch.style.backgroundColor=color;update(color);},'cl-color');swatch.style.backgroundColor=value;swatch.setAttribute('aria-hidden','true');wrap.append(swatch,input);return wrap;
    }
    function field(title,control){const wrap=el('label','cl-field');wrap.append(el('span','cl-field-label',title),control);return wrap;}
    function table(columns,className){const wrap=el('div','cl-table-wrap'),table=el('table','cl-table '+className),head=el('thead'),tr=el('tr'),body=el('tbody');wrap.dataset.clScroll=className;for(const label of columns){const th=el('th','',label);th.scope='col';tr.append(th);}head.append(tr);table.append(head,body);wrap.append(table);return {wrap,body};}
    function cell(...nodes){const td=el('td');for(const node of nodes)td.append(node);return td;}
    function focusKey(control,key){control.dataset.clFocus=key;return control;}
    function scrollNodes(){return new Map([['dialog',handle.dialog],['body',handle.body],['import',pane],['preview',preview],...[...preview.querySelectorAll('[data-cl-scroll]')].map(node=>[node.dataset.clScroll,node])]);}
    function captureView(){
      const focused=root.document.activeElement,inside=preview.contains(focused),focus=inside?{key:focused.dataset.clFocus||'',id:focused.id||'',label:focused.getAttribute('aria-label'),text:focused.tagName==='BUTTON'?focused.textContent:null,tag:focused.tagName,role:focused.getAttribute('role'),start:focused.selectionStart,end:focused.selectionEnd}:null;
      return {scroll:new Map([...scrollNodes()].map(([key,node])=>[key,{top:node.scrollTop,left:node.scrollLeft}])),focus};
    }
    function restoreView(saved,focus){
      if(focus){
        const node=[...preview.querySelectorAll('input,select,button,textarea,[tabindex]')].find(candidate=>focus.key?candidate.dataset.clFocus===focus.key:focus.id?candidate.id===focus.id:candidate.tagName===focus.tag&&(focus.label?candidate.getAttribute('aria-label')===focus.label:focus.text&&candidate.textContent===focus.text));
        if(node&&!node.disabled){node.focus({preventScroll:true});if(typeof focus.start==='number'&&typeof node.setSelectionRange==='function')try{node.setSelectionRange(focus.start,focus.end);}catch{}}
      }
      // Assign both axes after focus so rebuilding a table or a native select cannot
      // move the operator back to the first channel. Each tab owns its positions.
      for(const [key,node]of scrollNodes()){const point=saved?.scroll.get(key);node.scrollTop=point?.top||0;node.scrollLeft=point?.left||0;}
    }
    function primaryOptions(other=''){return [['','Nessuno'],...draft.monitors.filter(m=>m.busId!==other).map(m=>[m.busId,`${labelFor(m.busId)} · ${m.name||'Monitor'}`])];}
    function choosePrimary(row,bus,slot=1){const result=S.setPrimary(draft,row.id,bus,slot);if(result?.ok===false)status.textContent=result.message;paint();}
    function addEmptyChannel(){
      if(busy)cancelRead();
      if(!draft)draft=S.prepareDraft({rows:[],warnings:[]},getState());
      const result=S.addEmptyRow(draft,getState());
      if(!result.ok){status.textContent=result.message;refreshStatus();return;}
      sourceName=sourceName||'Scena manuale';tab='channels';sendRowId=result.row.id;
      status.textContent=labelFor(result.row.targetId)+' aggiunto: mute attivo, fader a −∞, nessun monitor principale e mandate disattivate.';paint();
      const row=preview.querySelector('[data-row-id="'+result.row.id+'"]');row?.scrollIntoView({block:'nearest'});
    }
    function instrumentControls(row,index,className='cl-instrument-controls'){
      const controls=el('div',className),groups=S.instrumentGroups(draft),group=groups.find(g=>g.key===row.instrumentKey),suffix='strumento '+(index+1);
      const name=textInput('Nome '+suffix,group?.name||row.instrumentName||'',value=>{S.setInstrumentName(draft,row.id,value);refreshGroupLabels();},60);
      name.placeholder=row.empty?'Canale vuoto':'Nome strumento';
      const primary=select('Monitor principale 1 '+suffix,row.primaryBusId,primaryOptions(row.secondaryPrimaryBusId),value=>choosePrimary(row,value,1));
      const secondary=select('Monitor principale 2 '+suffix,row.secondaryPrimaryBusId||'',primaryOptions(row.primaryBusId),value=>choosePrimary(row,value,2));
      focusKey(name,'instrument:'+row.instrumentKey+':name');focusKey(primary,'instrument:'+row.instrumentKey+':primary');focusKey(secondary,'instrument:'+row.instrumentKey+':secondary');
      controls.append(field('Strumento',name),field('Principale 1 · MON',primary),field('Principale 2 · IEM',secondary));
      const sends=button('Mandate',()=>{sendRowId=(group?.selectedRows[0]||row).id;sendScope='instrument';tab='sends';paint();},'cl-group-sends');sends.setAttribute('aria-label','Mandate '+suffix);sends.disabled=!group?.selectedRows.length;sends.title=sends.disabled?'Seleziona almeno un canale dello strumento per modificare le mandate.':'';
      const buttons=el('div','cl-group-buttons');buttons.append(sends);
      if(tab!=='instruments'){
        const edit=button('Modifica gruppo',()=>{groupSelection=new Set(group.rows.map(member=>member.id));activeGroupKey=group.key;groupReferenceId=row.id;groupView='group';tab='instruments';paint();},'cl-edit-group');
        edit.setAttribute('aria-label','Modifica gruppo '+(group?.name||'strumento '+(index+1)));focusKey(edit,'instrument:'+row.instrumentKey+':edit');buttons.prepend(edit);
      }
      controls.append(buttons);return controls;
    }
    function paintChannels(){
      const tools=el('div','cl-toolbar');tools.append(button('Aggiungi canale vuoto',addEmptyChannel),button('Seleziona assegnate',()=>change(()=>{draft.rows.forEach(row=>row.selected=isInput(row.targetId)&&!!row.name.trim());sync();paint();})),button('Deseleziona tutto',()=>change(()=>{draft.rows.forEach(row=>row.selected=false);sync();paint();})));
      const hint=el('p','cl-tab-note','Assegna i monitor una sola volta per strumento: tutti i suoi canali sono collegati. Puoi scegliere nessuno, uno o due principali. I canali partono in mute con fader a −∞.');
      const {wrap,body}=table(['Usa','PDF','Destinazione','Nome e colore','Strumento collegato','Mute','Fader',''],'cl-channels-table');
      const destinations=[['','Non assegnato']];for(const [kind,count]of [['ch',40],['aux',8]])for(let n=1;n<=count;n++)destinations.push([kind+'-'+n,labelFor(kind+'-'+n)]);
      const groups=S.instrumentGroups(draft);
      for(const [index,group]of groups.entries()){
        const leader=group.rows[0],groupRow=el('tr','cl-instrument-row'),groupCell=el('td');groupRow.dataset.instrumentKey=group.key;groupCell.colSpan=8;
        const members=el('p','cl-group-members',`${group.rows.length} ${group.rows.length===1?'canale':'canali collegati'} · ${group.rows.map(row=>labelFor(row.targetId)||'Da assegnare').join(', ')}${group.selectedRows.length!==group.rows.length?' · '+group.selectedRows.length+(group.selectedRows.length===1?' selezionato':' selezionati'):''}`);
        groupCell.append(instrumentControls(leader,index),members);groupRow.append(groupCell);body.append(groupRow);
        for(const row of group.rows){
          const suffix=row.empty?'canale vuoto '+labelFor(row.targetId):'riga '+row.sourceNumber,tr=el('tr'),checkbox=check('Importa '+suffix+' '+row.originalName,row.selected,value=>{row.selected=value;sync();paint();});tr.dataset.rowId=row.id;if(row.empty)tr.classList.add('cl-blank-row');
          const source=el('div','cl-source');source.append(el('strong','',row.sourceNumber),el('small','',row.empty?'Vuoto':'pag. '+row.pageNumber));
          const target=select('Destinazione '+suffix,row.targetId,destinations,value=>{if(row.empty&&row.name===labelFor(row.targetId)&&isInput(value))row.name=labelFor(value);row.targetId=value;row.selected=isInput(value)&&!!row.name.trim();row.notes=(row.notes||[]).filter(note=>!note.startsWith('Numero fuori')&&!note.startsWith('Scegli il canale'));sync();paint();},'cl-target');
          const name=stripNameInput('Nome '+suffix,row.name,()=>row.targetId,value=>row.name=value),note=el('small','cl-row-note'),identity=el('div','cl-identity');identity.append(name,colorInput('Colore '+suffix,row.color,value=>row.color=value));if(row.originalName)identity.append(el('small','cl-original','PDF: '+row.originalName));identity.append(note);
          const instrument=select('Strumento '+suffix,row.instrumentKey,[['','Rendi indipendente'],...groups.map(g=>[g.key,(g.name||'Canale vuoto')+' · '+g.rows.map(member=>labelFor(member.targetId)||'?').join(', ')])],value=>{const result=S.setInstrument(draft,row.id,value);if(result?.ok===false)status.textContent=result.message;sync();paint();});
          instrument.title='I canali dello stesso strumento condividono le assegnazioni dei monitor principali.';
          const sends=button('Mandate',()=>{sendRowId=row.id;sendScope='channel';tab='sends';paint();},'cl-row-sends');sends.setAttribute('aria-label','Modifica mandate '+suffix);sends.disabled=!row.selected;sends.title=row.selected?'':'Seleziona il canale per modificare le sue mandate.';const membership=el('div','cl-primary-cell');membership.append(instrument,sends);
          const remove=button('×',()=>{draft.rows=draft.rows.filter(item=>item.id!==row.id);sync();paint();},'cl-remove-row');remove.setAttribute('aria-label','Rimuovi '+suffix);remove.title='Rimuovi questa riga dall’anteprima';
          tr.append(cell(checkbox),cell(source),cell(target),cell(identity),cell(membership),cell(check('Mute '+suffix,row.mute,value=>row.mute=value)),cell(dbInput('Fader '+suffix,row.level,value=>row.level=value)),cell(remove));body.append(tr);rowNodes.set(row.id,{tr,note,checkbox});
        }
      }
      preview.append(tools,hint,wrap);
    }
    function groupLabel(group){return (group.name||'Senza nome')+' · '+group.rows.map(row=>labelFor(row.targetId)||'?').join(', ');}
    function refreshGroupLabels(){
      if(!draft)return;const groups=S.instrumentGroups(draft),byKey=new Map(groups.map(group=>[group.key,group]));
      for(const node of preview.querySelectorAll('[data-instrument-label]')){const group=byKey.get(node.dataset.instrumentLabel);if(group)node.textContent=group.name||'Senza nome';}
      for(const option of preview.querySelectorAll('.cl-group-destination option')){const group=byKey.get(option.value);if(group)option.textContent=groupLabel(group);}
      refreshMonitorLabels();
    }
    function refreshMonitorLabels(){
      const monitors=new Map(draft.monitors.map(monitor=>[monitor.busId,monitor]));
      for(const select of preview.querySelectorAll('select[aria-label^="Monitor principale"]'))for(const option of select.options){const monitor=monitors.get(option.value);if(monitor)option.textContent=labelFor(monitor.busId)+' · '+(monitor.name||'Monitor');}
      for(const node of preview.querySelectorAll('[data-monitor-label]')){const monitor=monitors.get(node.dataset.monitorLabel);if(monitor)node.textContent=monitor.name||labelFor(monitor.busId);}
      for(const node of preview.querySelectorAll('[data-principals-row]')){const row=draft.rows.find(item=>item.id===node.dataset.principalsRow);if(row)node.textContent=(node.dataset.principalsPrefix||'')+describePrincipals(row);}
    }
    function principalNote(row,prefix=''){
      const note=el('p','cl-inheritance-note',prefix+describePrincipals(row));if(row)note.dataset.principalsRow=row.id;note.dataset.principalsPrefix=prefix;return note;
    }
    function selectedGroupRows(){return draft.rows.filter(row=>groupSelection.has(row.id));}
    function describePrincipals(row){
      if(!row)return 'Seleziona almeno un canale.';
      const describe=id=>id?labelFor(id)+' · '+(draft.monitors.find(m=>m.busId===id)?.name||'Monitor'):'Nessuno';
      return 'MON: '+describe(row.primaryBusId)+'. IEM: '+describe(row.secondaryPrimaryBusId)+'.';
    }
    function finishGroupOperation(result,key){
      if(!result?.ok){status.textContent=result?.message||'Controlla i canali selezionati.';refreshStatus();return;}
      activeGroupKey=result.key||key||selectedGroupRows()[0]?.instrumentKey||activeGroupKey;
      sync();status.textContent=result.message||`${result.count||0} canali aggiornati nell’anteprima.`;paint();
    }
    function paintInstruments(){
      const groups=S.instrumentGroups(draft),existing=new Set(draft.rows.map(row=>row.id));
      groupSelection=new Set([...groupSelection].filter(id=>existing.has(id)));
      let group=groups.find(item=>item.key===activeGroupKey)||groups[0];activeGroupKey=group.key;
      const selected=selectedGroupRows();if(!selected.some(row=>row.id===groupReferenceId))groupReferenceId=selected[0]?.id||'';
      if(!groups.some(item=>item.key===moveTargetKey))moveTargetKey='';
      const layout=el('div','cl-groups-layout'),nav=el('section','cl-groups-nav'),navHead=el('div','cl-groups-heading');
      navHead.append(el('h3','','Strumenti'),el('span','cl-count',groups.length));nav.append(navHead);
      const list=el('div','cl-groups-list');list.dataset.clScroll='instrument-list';list.setAttribute('aria-label','Gruppi di strumenti');
      for(const item of groups){
        const choose=button('',()=>{activeGroupKey=item.key;groupView='group';paint();},'cl-group-choice');choose.setAttribute('aria-pressed',String(item.key===activeGroupKey));focusKey(choose,'group-choice:'+item.key);choose.dataset.groupKey=item.key;
        const name=el('strong','',item.name||'Senza nome'),count=item.rows.filter(row=>groupSelection.has(row.id)).length;name.dataset.instrumentLabel=item.key;
        choose.append(name,el('small','',item.rows.map(row=>labelFor(row.targetId)||'?').join(', ')+(count?' · '+count+(count===1?' selezionato':' selezionati'):'')));list.append(choose);
      }
      nav.append(list,el('p','cl-tab-note','Il nome identifica il gruppo; i nomi dei singoli canali restano modificabili in Canali.'));
      const editor=el('section','cl-group-editor');editor.dataset.clScroll='instrument-editor';
      editor.append(instrumentControls(group.rows[0],groups.indexOf(group),'cl-instrument-controls cl-group-editor-controls'));
      const work=el('div','cl-group-work'),members=el('section','cl-group-channel-panel'),tools=el('div','cl-group-tools');
      const view=select('Canali da visualizzare',groupView,[['group','Canali del gruppo'],['all','Tutti i canali'],['selected','Solo selezionati']],value=>{groupView=value;paint();});focusKey(view,'group-view');
      const allSelected=group.rows.every(row=>groupSelection.has(row.id)),chooseGroup=button(allSelected?'Togli gruppo dalla selezione':'Aggiungi gruppo alla selezione',()=>{for(const row of group.rows)allSelected?groupSelection.delete(row.id):groupSelection.add(row.id);paint();},'cl-choose-group');focusKey(chooseGroup,'select-group:'+group.key);
      tools.append(view,chooseGroup);members.append(tools);
      const memberList=el('div','cl-group-channel-list');memberList.dataset.clScroll='instrument-members';
      const visible=groupView==='all'?draft.rows:groupView==='selected'?selected:group.rows,groupNames=new Map(groups.map(item=>[item.key,item.name]));
      for(const row of visible){
        const line=el('label','cl-group-channel'),target=labelFor(row.targetId)||'Da assegnare',name=row.name||row.originalName||'Senza nome';line.dataset.groupRowId=row.id;
        const checkbox=check('Seleziona per il gruppo '+target+' · '+name,groupSelection.has(row.id),value=>{value?groupSelection.add(row.id):groupSelection.delete(row.id);paint();});focusKey(checkbox,'group-row:'+row.id);
        const identity=el('span','cl-group-channel-name'),title=el('strong','',target+' · '+name),detail=el('small','',[groupView!=='group'?groupNames.get(row.instrumentKey):'',row.empty?'Canale vuoto':row.originalName?'PDF: '+row.originalName:'',row.selected?'Da importare':'Escluso dall’importazione'].filter(Boolean).join(' · '));
        const color=el('i','cl-swatch');color.style.backgroundColor=row.color;color.setAttribute('aria-hidden','true');identity.append(title,detail);line.classList.toggle('is-chosen',groupSelection.has(row.id));line.append(checkbox,color,identity);memberList.append(line);
      }
      if(!visible.length)memberList.append(el('p','cl-empty','Nessun canale selezionato. Sceglili dal gruppo oppure mostra tutti i canali.'));
      const selectionTools=el('div','cl-group-selection-tools');selectionTools.append(button('Seleziona tutti i canali',()=>{groupSelection=new Set(draft.rows.map(row=>row.id));paint();}),button('Svuota selezione',()=>{groupSelection.clear();paint();}));
      members.append(memberList,selectionTools,el('p','cl-tab-note','Queste caselle scelgono i canali da raggruppare. La scelta dei canali da importare rimane nella scheda Canali.'));
      const actions=el('section','cl-group-operations');actions.dataset.clScroll='instrument-operations';
      const count=el('h3','',selected.length+(selected.length===1?' canale selezionato':' canali selezionati'));count.setAttribute('aria-live','polite');
      const selectionNote=el('p','cl-group-selection-note',selected.length?selected.map(row=>(labelFor(row.targetId)||'?')+' · '+(row.name||row.originalName||'Senza nome')).join(', '):'Seleziona i canali da spostare o riunire. Puoi sceglierli anche da gruppi diversi.');
      actions.append(count,selectionNote);
      const createBox=el('section','cl-group-operation'),createName=textInput('Nome del nuovo gruppo',newGroupName,value=>{newGroupName=value;create.disabled=!selected.length||!value.trim();},60);createName.placeholder='Es. Batteria elettronica';focusKey(createName,'new-group-name');
      const reference=select('Canale di riferimento del nuovo gruppo',groupReferenceId,selected.length?selected.map(row=>[row.id,(labelFor(row.targetId)||'?')+' · '+(row.name||row.originalName||'Senza nome')]):[['','Seleziona i canali']],value=>{groupReferenceId=value;paint();});reference.disabled=!selected.length;focusKey(reference,'new-group-reference');
      const create=button('Crea gruppo',()=>{const result=S.createInstrumentGroup(draft,[...groupSelection],newGroupName,groupReferenceId||undefined);if(result?.ok){newGroupName='';groupView='group';}finishGroupOperation(result);},'desk-primary');create.disabled=!selected.length||!newGroupName.trim();focusKey(create,'create-group');
      createBox.append(el('h4','','Crea o dividi un gruppo'),field('Nome del nuovo gruppo',createName),field('Copia i principali da',reference),principalNote(selected.find(row=>row.id===groupReferenceId)),create);
      const moveBox=el('section','cl-group-operation'),destination=select('Gruppo di destinazione',moveTargetKey,[['','Scegli un gruppo'],...groups.map(item=>[item.key,groupLabel(item)])],value=>{moveTargetKey=value;paint();},'cl-group-destination');focusKey(destination,'move-group-target');
      const target=groups.find(item=>item.key===moveTargetKey),move=button('Sposta nel gruppo',()=>{groupView='group';finishGroupOperation(S.moveInstrumentRows(draft,[...groupSelection],moveTargetKey),moveTargetKey);});move.disabled=!selected.length||!target||selected.every(row=>row.instrumentKey===moveTargetKey);focusKey(move,'move-group');
      moveBox.append(el('h4','','Sposta o unisci'),field('Gruppo di destinazione',destination),target?principalNote(target.rows[0],'I canali adotteranno i principali del gruppo. '):el('p','cl-inheritance-note','Scegli il gruppo che deve contenere i canali selezionati.'),move);
      const separate=button('Rendi indipendenti',()=>{groupView='selected';finishGroupOperation(S.separateInstrumentRows(draft,[...groupSelection]));});separate.disabled=!selected.length;focusKey(separate,'separate-group');
      const separateBox=el('section','cl-group-operation');separateBox.append(separate,el('p','cl-tab-note','Ogni canale selezionato diventa uno strumento distinto e conserva le proprie mandate.'));
      actions.append(createBox,moveBox,separateBox,el('p','cl-tab-note','Creando o spostando un gruppo cambiano solo le mandate il cui ruolo principale cambia. Gli altri valori restano conservati.'));
      work.append(members,actions);editor.append(work);layout.append(nav,editor);preview.append(layout);
    }
    function paintSends(){
      const layout=el('div','cl-send-layout'),monitors=el('section','cl-monitor-panel'),monitorHead=el('div','cl-monitor-heading');layout.dataset.clScroll='send-layout';monitorHead.append(el('h3','','Monitor assegnati'),el('span','cl-count',draft.monitors.length+'/16'));
      monitors.append(monitorHead,el('p','cl-tab-note','Le mandate raggiungono tutti questi monitor. Nome e colore del bus sono facoltativi. Numeri e formato L/R del PDF sono riferimenti: routing fisico e modalità stereo del bus restano invariati.'));
      const monitorList=el('div','cl-monitor-list');monitorList.dataset.clScroll='monitor-list';
      for(const [index,monitor]of draft.monitors.entries()){
        const card=el('div','cl-monitor-card'),line=el('div','cl-monitor-line'),options=[];for(let n=1;n<=16;n++)options.push(['bus-'+n,'BUS '+n]);
        card.dataset.monitorId=monitor.id;
        const bus=select('Bus monitor '+(index+1),monitor.busId,options,value=>{const result=S.setMonitorBus(draft,monitor.id,value);if(result?.ok===false)status.textContent=result.message;sync();paint();});
        const remove=button('Rimuovi',()=>change(()=>{draft.monitors=draft.monitors.filter(item=>item.id!==monitor.id);sync();paint();}),'cl-remove');remove.setAttribute('aria-label','Rimuovi monitor '+(index+1));
        line.append(bus,remove);
        const sources=S.monitorNameSources(draft,monitor.id),modeLine=el('label','cl-monitor-name-mode'),modeNote=el('p','cl-monitor-name-note');
        const automatic=check('Nome automatico monitor '+(index+1),monitor.nameMode!=='manual',value=>{const result=value?S.setMonitorNameSource(draft,monitor.id,null):S.setMonitorName(draft,monitor.id,monitor.name);if(result?.ok===false)status.textContent=result.message;paint();});
        modeLine.append(automatic,el('span','','Nome dal gruppo · MON / IEM'));
        const name=stripNameInput('Nome monitor '+(index+1),monitor.name,()=>monitor.busId,value=>{const result=S.setMonitorName(draft,monitor.id,value);if(result?.ok===false)status.textContent=result.message;automatic.checked=false;modeNote.textContent='Nome personalizzato. Riattiva la casella per seguire lo strumento.';const origin=card.querySelector('.cl-monitor-name-source');if(origin)origin.disabled=true;refreshMonitorLabels();});
        const color=colorInput('Colore monitor '+(index+1),monitor.color||I.palette[0][0],value=>monitor.color=value),identity=el('label','cl-monitor-identity'),note=el('p','cl-monitor-note');
        identity.append(check('Applica nome e colore al bus '+(index+1),monitor.applyIdentity!==false,value=>monitor.applyIdentity=value),el('span','','Applica nome e colore al bus'));
        const issues=validation().monitorErrors?.[monitor.id]||[];note.textContent=issues.join(' ');
        const source=el('div','cl-monitor-source');if(monitor.originalName)source.append(el('small','','PDF: '+monitor.originalName));
        const references=Array.isArray(monitor.sourceNumbers)?monitor.sourceNumbers.filter(Boolean).join(' / '):'';
        if(references||monitor.format)source.append(el('small','',[references?'Uscite PDF: '+references:'',monitor.format?'Formato: '+monitor.format:''].filter(Boolean).join(' · ')));
        const chosen=monitor.nameSource,validSource=sources.find(item=>item.instrumentKey===chosen?.instrumentKey&&item.slot===chosen?.slot);
        modeNote.textContent=monitor.nameMode==='manual'?'Nome personalizzato. Riattiva la casella per seguire lo strumento.':sources.length>1&&!validSource?'BUS condiviso: scegli lo strumento e il ruolo da usare nel nome.':sources.length?'Segue il nome dello strumento. Puoi modificarlo a mano.':'Nessuno strumento usa questo BUS come principale. Nome modificabile.';
        card.append(line,modeLine,name);
        if(sources.length>1){
          const origin=select('Origine nome monitor '+(index+1),validSource?JSON.stringify([validSource.instrumentKey,validSource.slot]):'',[['','Scegli strumento e ruolo'],...sources.map(item=>[JSON.stringify([item.instrumentKey,item.slot]),(item.name||'Senza nome')+' · '+(item.slot===1?'MON':'IEM')+' · '+(S.instrumentGroups(draft).find(group=>group.key===item.instrumentKey)?.rows||[]).map(row=>labelFor(row.targetId)||'?').join(', ')])],value=>{const pair=value?JSON.parse(value):null,result=S.setMonitorNameSource(draft,monitor.id,pair?{instrumentKey:pair[0],slot:pair[1]}:null);if(result?.ok===false)status.textContent=result.message;paint();},'cl-monitor-name-source');
          origin.disabled=monitor.nameMode==='manual';focusKey(origin,'monitor:'+monitor.id+':name-source');card.append(origin);
        }
        card.append(modeNote,source,color,identity,note);monitorList.append(card);monitorNodes.set(monitor.id,{card,note});
        for(const [key,control]of [['bus',bus],['remove',remove],['name',name],['name-mode',automatic],['color',color.querySelector('select')],['identity',identity.querySelector('input')]])focusKey(control,'monitor:'+monitor.id+':'+key);
      }
      const add=button('Aggiungi monitor',()=>change(()=>{
        const used=new Set(draft.monitors.map(m=>m.busId)),bus=Array.from({length:16},(_,i)=>'bus-'+(i+1)).find(id=>!used.has(id));if(!bus)return;
        const id='manual-monitor-'+generation+'-'+(++monitorSequence);draft.monitors.push({id,busId:bus,name:'Monitor '+bus.split('-')[1],color:I.palette[0][0],applyIdentity:true});sync();paint();
      }),'cl-add-monitor');add.disabled=draft.monitors.length>=16;monitors.append(monitorList,add);
      const editor=el('section','cl-send-editor'),rows=draft.rows.filter(row=>row.selected);if(!rows.some(row=>row.id===sendRowId))sendRowId=rows[0]?.id||'';
      editor.append(el('h3','','Mandate dello strumento'));
      if(!rows.length)editor.append(el('p','cl-empty','Seleziona almeno un canale nella scheda Canali.'));
      else{
        const row=rows.find(row=>row.id===sendRowId),group=S.instrumentGroups(draft).find(g=>g.key===row.instrumentKey),members=group?.rows||[row];
        const selector=select('Canale per le mandate',row.id,rows.map(r=>[r.id,`${labelFor(r.targetId)} · ${r.name||r.originalName||'Senza nome'}`]),value=>{sendRowId=value;paint();});
        const scope=select('Modifica mandate per',sendScope,[['instrument','Tutto lo strumento ('+members.length+(members.length===1?' canale)':' canali)')],['channel','Solo questo canale']],value=>{sendScope=value;paint();});
        const primary=select('Monitor principale 1 dello strumento',row.primaryBusId,primaryOptions(row.secondaryPrimaryBusId),value=>choosePrimary(row,value,1));
        const secondary=select('Monitor principale 2 dello strumento',row.secondaryPrimaryBusId||'',primaryOptions(row.primaryBusId),value=>choosePrimary(row,value,2));
        const controls=el('div','cl-send-controls');controls.append(field('Canale di riferimento',selector),field('Modifica le mandate per',scope),field('Principale 1 · MON',primary),field('Principale 2 · IEM',secondary));
        const scopeNote=sendScope==='instrument'?`${group?.name||'Strumento'} · ${members.map(member=>labelFor(member.targetId)).join(', ')}. Le modifiche alle mandate valgono per tutti i canali collegati; vengono importati solo quelli selezionati.`:`Stai modificando soltanto ${labelFor(row.targetId)}. Le assegnazioni dei due principali restano condivise dallo strumento.`;
        editor.append(controls,el('p','cl-scope-note',scopeNote),el('p','cl-tab-note','Entrambi i principali partono a −5 dB PRE; gli altri monitor a −8 dB POST. Nessuno è obbligatorio. Cambiare un principale aggiorna solo i bus coinvolti.'));
        if(!draft.monitors.length)editor.append(el('p','cl-empty','Nessun monitor assegnato. Puoi applicare i canali così oppure aggiungere un monitor.'));
        const {wrap,body}=table(['Monitor','Attiva','Livello','Pre / Post','Segue mute'],'cl-sends-table');
        for(const monitor of draft.monitors){
          const send=row.sends?.[monitor.busId];if(!send)continue;const tr=el('tr'),name=el('div','cl-send-name');tr.dataset.busId=monitor.busId;
          const role=row.primaryBusId===monitor.busId?' · Principale 1 · MON':row.secondaryPrimaryBusId===monitor.busId?' · Principale 2 · IEM':'';
          const mixed=el('small','cl-send-mixed'),monitorLabel=el('strong','',monitor.name||labelFor(monitor.busId));monitorLabel.dataset.monitorLabel=monitor.busId;name.append(monitorLabel,el('small','',labelFor(monitor.busId)+role),mixed);
          const suffix=labelFor(monitor.busId)+' '+labelFor(row.targetId),mixedControls={};
          function updateMixed(){
            const labels={on:'ON/OFF',level:'livello',mode:'PRE/POST',followMute:'segue mute'},fields=sendScope==='instrument'?Object.keys(labels).filter(key=>members.some(member=>member.sends?.[monitor.busId]?.[key]!==row.sends[monitor.busId][key])):[];
            mixed.textContent=fields.length?'Valori diversi: '+fields.map(key=>labels[key]).join(', '):'';
            for(const [key,control]of Object.entries(mixedControls)){const differs=fields.includes(key);control.classList.toggle('cl-mixed-value',differs);control.title=differs?'Valori diversi nel gruppo; è mostrato '+labelFor(row.targetId)+'. Modificando questo valore lo applichi a tutto lo strumento.':'';}
          }
          function updateSend(patch){
            if(sendScope==='instrument'){const result=S.patchInstrumentSend(draft,row.id,monitor.busId,patch);if(result?.ok===false)status.textContent=result.message;}
            else Object.assign(row.sends[monitor.busId],patch);
            updateMixed();
          }
          const on=check('Mandata attiva '+suffix,send.on,value=>updateSend({on:value})),level=dbInput('Livello mandata '+suffix,send.level,value=>updateSend({level:value})),mode=select('Modalità mandata '+suffix,send.mode,[['PRE','PRE fader'],['POST','POST fader']],value=>updateSend({mode:value}));
          const follows=check('Segue mute '+suffix,send.followMute!==false,value=>updateSend({followMute:value}));Object.assign(mixedControls,{on,level:level.querySelector('input'),mode,followMute:follows});updateMixed();
          tr.append(cell(name),cell(on),cell(level),cell(mode),cell(follows));body.append(tr);
        }
        editor.append(wrap);
        const tap=getState().desk?.channels?.[row.targetId]?.tap;if(tap)editor.append(el('p','cl-tap-note','Punto PRE del canale conservato: '+tap+'.'));
      }
      layout.append(monitors,editor);preview.append(layout);
    }
    function paintRemaining(){
      const settings=el('div','cl-remaining-settings'),mode=select('Canali rimanenti',draft.remainingMode,[['keep','Lascia come sono'],['initialize','Inizializza nome, colore, mute e fader']],value=>{S.changeRemainingMode(draft,value,getState());paint();});
      settings.append(field('Canali rimanenti',mode),el('p','cl-tab-note','L’inizializzazione riguarda soltanto nome, colore, mute e fader. Routing, gain, phantom, processing e mandate esistenti vengono conservati. Puoi escludere singoli canali e modificare ogni valore proposto.'));preview.append(settings);
      const initializing=draft.remainingMode==='initialize',all=getState(),strips=new Map((all.values?Object.values(all.values):[...(all.inputs||[]),...(all.outputs||[])]).map(s=>[s.id,s]));
      if(initializing){const tools=el('div','cl-toolbar');tools.append(button('Inizializza tutti i rimanenti',()=>change(()=>{draft.remaining.forEach(row=>row.initialize=true);paint();})),button('Lascia tutti invariati',()=>change(()=>{draft.remaining.forEach(row=>row.initialize=false);paint();})));preview.append(tools);}
      const {wrap,body}=table(['Inizializza','Canale','Nome','Colore','Mute','Fader'],'cl-remaining-table');
      for(const row of draft.remaining){
        const tr=el('tr'),label=labelFor(row.targetId),enabled=initializing&&row.initialize,values=enabled?row:(strips.get(row.targetId)||row),choose=check('Inizializza '+label,row.initialize&&initializing,value=>{row.initialize=value;paint();});choose.disabled=!initializing;
        const name=stripNameInput('Nome rimanente '+label,values.name,()=>row.targetId,value=>row.name=value),color=colorInput('Colore rimanente '+label,values.color,value=>row.color=value),mute=check('Mute rimanente '+label,values.mute,value=>row.mute=value),level=dbInput('Fader rimanente '+label,values.level,value=>row.level=value);
        for(const control of [name,...color.querySelectorAll('select'),mute,...level.querySelectorAll('input')])control.disabled=!enabled;
        const note=el('small','cl-row-note');remainingNodes.set(row.targetId,{tr,note});tr.dataset.remainingId=row.targetId;if(!enabled)tr.classList.add('cl-unchanged');tr.append(cell(choose),cell(el('strong','',label)),cell(name,note),cell(color),cell(mute),cell(level));body.append(tr);
      }
      preview.append(wrap);
    }
    function paint(){
      if(closed)return;
      const previous=renderedTab,current=previous?captureView():null;if(previous)positions.set(previous,current);
      const focus=previous===tab||current?.focus?.role==='tab'?current?.focus:null;
      preview.replaceChildren();rowNodes=new Map();monitorNodes=new Map();remainingNodes=new Map();renderedTab=tab;
      if(!draft?.rows.length){const empty=el('div','cl-empty-state');empty.append(el('h3','','Prepara la scena'),el('p','','Importa la channel list oppure inizia da un canale vuoto. Canali in mute, fader abbassati e monitor principali facoltativi.'),button('Aggiungi canale vuoto',addEmptyChannel));preview.append(empty);refreshStatus();restoreView(positions.get(tab),focus);return;}
      const heading=el('div','cl-heading');heading.append(el('h3','',sourceName||'Anteprima della scena'),el('span','cl-editable-badge','Tutti i valori sono modificabili'));
      const nav=el('div','cl-tabs');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Sezioni anteprima');
      for(const [id,label]of [['channels','Canali'],['instruments','Strumenti'],['sends','Mandate'],['remaining','Rimanenti']]){const b=button(label,()=>{tab=id;paint();});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===id));b.id='cl-tab-'+id;b.setAttribute('aria-controls','cl-panel');nav.append(b);}
      preview.append(heading,nav);const before=preview.children.length;
      if(tab==='channels')paintChannels();else if(tab==='instruments')paintInstruments();else if(tab==='sends')paintSends();else paintRemaining();
      const panel=el('div','cl-panel');panel.id='cl-panel';panel.dataset.clScroll='panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','cl-tab-'+tab);for(const node of [...preview.children].slice(before))panel.append(node);preview.append(panel);refreshStatus();restoreView(positions.get(tab),focus);
    }
    function install(result,label){draft=S.prepareDraft(result,getState());sourceName=label;tab='channels';sendRowId='';sendScope='instrument';groupSelection.clear();activeGroupKey='';newGroupName='';groupReferenceId='';moveTargetKey='';groupView='group';positions.clear();renderedTab=null;status.textContent=result.warnings?.length?result.warnings.join(' '):`${draft.rows.length} righe lette. Controlla le quattro schede prima di applicare.`;paint();}
    file.addEventListener('change',async()=>{
      const selected=file.files?.[0];if(!selected)return;cancelRead();const ticket=generation;abort=new AbortController();busy=true;draft=null;sourceName='';status.textContent='Lettura del PDF…';paint();
      try{if(!root.SculptPdfReader?.readFile)throw new Error('Il lettore PDF non è disponibile. Riapri l’app aggiornata.');const data=await root.SculptPdfReader.readFile(selected,{signal:abort.signal,onProgress:progress=>{if(ticket===generation&&!closed)status.textContent=typeof progress==='string'?progress:progress?.totalPages?'Lettura del PDF · pagina '+progress.pageNumber+' di '+progress.totalPages+'…':'Lettura del PDF…';}});if(ticket!==generation||closed)return;install(I.parseDocument(data),selected.name);}
      catch(error){if(ticket===generation&&!closed&&error.name!=='AbortError')status.textContent=error.message||'Non è stato possibile leggere il PDF.';}
      finally{if(ticket===generation&&!closed){busy=false;refreshStatus();}}
    });
    const unsubscribe=root.SculptLive?.subscribe?.(refreshStatus);
    handle.dialog.addEventListener('close',()=>{closed=true;cancelRead();unsubscribe?.();if(active===handle)active=null;},{once:true});
    handle.refreshStatus=refreshStatus;
    paint();return handle;
  }
  const API={open,canUndo,undoLast,formatDb,parseDb};if(typeof module!=='undefined'&&module.exports)module.exports=API;root.SculptChannelPreview=API;
})(typeof window!=='undefined'?window:globalThis);
