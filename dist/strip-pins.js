/* Local surface preference. A pinned channel is the original strip, never a clone. */
(() => {
  'use strict';
  const C=window.SculptController,U=window.SculptUI;
  if(!C||!U)return;
  const KEY='sculpt-wing-strip-pins-v1',SIDES=['left','right'],ROWS=['outputs','inputs'];
  const strips=new Map(C.listStrips().map(strip=>[strip.id,document.querySelector(`.strip[data-id="${strip.id}"]`)]));
  const rows=new Map(),buttons=new Map();let menu=null,storageWarning=false;
  const label=id=>{const strip=C.getStrip(id);return strip?`${strip.kind} ${String(strip.number).padStart(2,'0')} · ${strip.name}`:id;};
  function readPreferences(){
    let saved;try{saved=JSON.parse(localStorage.getItem(KEY)||'null');}catch{}
    const prefs={version:1,left:[],right:[]},seen=new Set();
    if(saved?.version!==1)return prefs;
    for(const side of SIDES)for(const id of Array.isArray(saved[side])?saved[side]:[]){if(typeof id==='string'&&strips.has(id)&&!seen.has(id)){seen.add(id);prefs[side].push(id);}}
    return prefs;
  }
  const preferences=readPreferences();
  const sideOf=id=>SIDES.find(side=>preferences[side].includes(id))||null;
  const rowOf=id=>{const section=strips.get(id)?.closest('.mixer-row');return section?.classList.contains('outputs')?'outputs':section?.classList.contains('inputs')?'inputs':null;};
  const shown=id=>{const node=strips.get(id);return !!node&&!node.hidden;};
  const pinnedIn=(row,side)=>preferences[side].filter(id=>shown(id)&&rowOf(id)===row);
  const behavior=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify(preferences));storageWarning=false;}
    catch{if(!storageWarning){storageWarning=true;U.toast('Ancoraggio impostato per questa sessione. La memoria locale non è disponibile.');}}
  }
  function updateButtons(){
    for(const [id,button]of buttons){
      const side=sideOf(id),text=side==='left'?'Ancorato a sinistra':side==='right'?'Ancorato a destra':'Ancora il canale';
      button.setAttribute('aria-label',`${text} · ${label(id)}`);button.setAttribute('aria-pressed',String(!!side));button.title=`${text} · scegli sinistra, destra o libera`;
      button.dataset.side=side||'';button.classList.toggle('is-pinned',!!side);strips.get(id).classList.toggle('strip-pinned',!!side);
    }
  }
  function updateBankButtons(row){
    const view=rows.get(row);if(!view||view.section.classList.contains('layer-active')||row==='outputs'&&window.SculptDcaBank?.isOpen())return;
    if(!SIDES.some(side=>pinnedIn(row,side).length))return;
    const visible=[...view.bank.querySelectorAll('.strip:not([hidden])')];if(!visible.length)return;
    const left=view.scroller.scrollLeft,first=visible.find(node=>node.offsetLeft+node.getBoundingClientRect().width*.6>left)||visible.at(-1);
    const index=C.getState()[row].findIndex(strip=>strip.id===first.dataset.id),activeIndex=Math.floor(Math.max(0,index)/8)*8;
    view.section.querySelectorAll('.bank-button').forEach(button=>{const active=Number(button.dataset.index)===activeIndex;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  }
  function updateRails(){
    for(const [row,view]of rows){
      const counts=SIDES.map(side=>pinnedIn(row,side).length),dca=row==='outputs'&&window.SculptDcaBank?.isOpen();
      SIDES.forEach((side,index)=>{view[side].hidden=dca||counts[index]===0;view[side].style.setProperty('--pin-count',String(counts[index]));});
      view.body.classList.toggle('has-pins',!dca&&counts.some(Boolean));view.body.classList.toggle('has-pins-both',!dca&&counts.every(Boolean));
      view.empty.hidden=dca||counts.every(count=>!count)||[...view.bank.querySelectorAll('.strip')].some(node=>!node.hidden);
      view.scroller.dispatchEvent(new Event('scroll'));updateBankButtons(row);
    }
  }
  function captureOrder(){
    // showLayer restores every strip to its original bank before placing the
    // visible Custom rows, so this is the canonical center order for that view.
    for(const view of rows.values())view.order=[...view.bank.querySelectorAll('.strip[data-id]')].map(node=>node.dataset.id);
  }
  function refresh(){
    const focused=document.activeElement,scroll=new Map([...rows].map(([row,view])=>[row,{center:view.scroller.scrollLeft,left:view.left.scrollLeft,right:view.right.scrollLeft}]));
    for(const view of rows.values())for(const id of view.order){const node=strips.get(id);if(node)view.bank.append(node);}
    for(const [row,view]of rows)for(const side of SIDES)for(const id of pinnedIn(row,side))view[side+'Bank'].append(strips.get(id));
    updateButtons();updateRails();
    if(focused?.isConnected&&!focused.closest?.('[hidden]'))focused.focus?.({preventScroll:true});
    for(const [row,view]of rows){const previous=scroll.get(row);view.scroller.scrollLeft=previous.center;view.left.scrollLeft=previous.left;view.right.scrollLeft=previous.right;view.scroller.dispatchEvent(new Event('scroll'));}
  }
  function pin(id,side){
    if(!strips.has(id)||!shown(id)||!rowOf(id)||side!==null&&!SIDES.includes(side))return false;
    if(sideOf(id)===side)return true;
    for(const edge of SIDES)preferences[edge]=preferences[edge].filter(value=>value!==id);
    if(side)preferences[side].push(id);
    save();refresh();return true;
  }
  function move(id,direction){
    const side=sideOf(id),row=rowOf(id);if(!side||!row||![-1,1].includes(direction))return false;
    const ordered=pinnedIn(row,side),index=ordered.indexOf(id),other=ordered[index+direction];if(!other)return false;
    const list=preferences[side],a=list.indexOf(id),b=list.indexOf(other);[list[a],list[b]]=[list[b],list[a]];save();refresh();return true;
  }
  function openMenu(id){
    if(!shown(id))return;
    menu?.close();
    const content=U.el('div','strip-pin-options'),side=sideOf(id),row=rowOf(id),name=label(id);
    content.append(U.el('p','desk-note','Ancora questo canale al bordo della sua riga. Gli altri canali continuano a scorrere al centro.'));
    for(const [value,title]of [['left','Ancora a sinistra'],['right','Ancora a destra'],[null,'Libera il canale']]){
      const button=U.button(title,()=>{if(pin(id,value)){menu.close();U.toast(`${name} · ${value==='left'?'ancorato a sinistra':value==='right'?'ancorato a destra':'liberato'}`);}},value===side?'strip-pin-current':'');
      button.disabled=value===side;content.append(button);
    }
    if(side){
      const ordered=pinnedIn(row,side),index=ordered.indexOf(id),order=U.el('div','strip-pin-order');
      order.append(U.el('p','desk-note',`Posizione ${index+1} di ${ordered.length} sul lato ${side==='left'?'sinistro':'destro'}.`));
      const before=U.button('Sposta prima',()=>{if(move(id,-1))openMenu(id);}),after=U.button('Sposta dopo',()=>{if(move(id,1))openMenu(id);});before.disabled=index<=0;after.disabled=index>=ordered.length-1;order.append(before,after);content.append(order);
    }
    menu=U.modal(`Ancoraggio · ${name}`,content);menu.dialog.classList.add('strip-pin-modal');
  }
  function navigate(row,startIndex){
    const view=rows.get(row);if(!view||!SIDES.some(side=>pinnedIn(row,side).length))return false;
    const candidates=C.getState()[row].slice(startIndex,startIndex+8),target=candidates.map(strip=>strips.get(strip.id)).find(node=>node&&!node.hidden&&node.parentElement===view.bank);
    if(target){view.scroller.scrollTo({left:Math.max(0,target.offsetLeft-3),behavior:behavior()});return true;}
    const fixed=candidates.map(strip=>strips.get(strip.id)).find(node=>node&&!node.hidden&&node.closest('.strip-pin-rail'));
    if(fixed){fixed.closest('.strip-pin-rail').scrollTo({left:Math.max(0,fixed.offsetLeft-3),behavior:behavior()});return true;}
    return false;
  }
  for(const row of ROWS){
    const section=document.querySelector(`.mixer-row.${row}`),scroller=document.getElementById(`${row}-scroll`),bank=document.getElementById(`${row}-bank`),body=U.el('div','strip-pin-body');
    scroller.before(body);const view={section,scroller,bank,body,order:[]};
    for(const side of SIDES){
      const rail=U.el('div',`strip-pin-rail strip-pin-${side}`),railBank=U.el('div','strip-bank strip-pin-bank');rail.id=`${row}-pinned-${side}`;rail.hidden=true;rail.tabIndex=0;rail.setAttribute('role','region');rail.setAttribute('aria-label',`Canali ancorati a ${side==='left'?'sinistra':'destra'}, riga ${row==='outputs'?'superiore':'inferiore'}. Scorri orizzontalmente.`);rail.append(railBank);view[side]=rail;view[side+'Bank']=railBank;
      C.bindStripPan?.(rail);rail.addEventListener('keydown',event=>{if(event.target!==rail||!['ArrowLeft','ArrowRight'].includes(event.key))return;rail.scrollBy({left:(event.key==='ArrowRight'?1:-1)*rail.clientWidth*.75,behavior:behavior()});event.preventDefault();});
    }
    body.append(view.left,scroller,view.right);view.empty=U.el('div','strip-pin-center-empty','Canali ancorati ai lati');view.empty.hidden=true;bank.append(view.empty);rows.set(row,view);
    scroller.addEventListener('scroll',()=>updateBankButtons(row),{passive:true});new ResizeObserver(()=>updateBankButtons(row)).observe(scroller);
  }
  const icon='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6 2h8M7 2v5l-3 4v2h12v-2l-3-4V2M10 13v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  for(const [id,node]of strips){
    if(!node)continue;const button=U.button('',()=>openMenu(id),'strip-pin-button');button.innerHTML=icon;button.setAttribute('aria-haspopup','dialog');node.append(button);node.classList.add('has-pin-control');buttons.set(id,button);
  }
  captureOrder();
  window.SculptStripPins=Object.freeze({pin,move,openMenu,navigate,refresh,sideOf,preferences:()=>({version:1,left:[...preferences.left],right:[...preferences.right]}),isPinnedVisible:id=>{const node=strips.get(id);return !!sideOf(id)&&!!node?.closest('.strip-pin-rail')&&!node.closest('[hidden]');}});
  C.subscribe(event=>{if(event.type==='layer'){captureOrder();refresh();}else if(['restore','reset'].includes(event.type))refresh();else updateButtons();});
  window.addEventListener('sculpt-dca-bank',updateRails);
  refresh();
})();
