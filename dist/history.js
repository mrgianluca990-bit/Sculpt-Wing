(function(root){
  'use strict';
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const own=(value,key)=>!!value&&Object.prototype.hasOwnProperty.call(value,key);
  const object=value=>value!==null&&typeof value==='object';
  const same=(a,b)=>Object.is(a,b)||(typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<1e-7)||
    (object(a)&&object(b)&&JSON.stringify(a)===JSON.stringify(b));
  const read=(state,path)=>{let value=state;for(const key of path){if(!own(value,key))return {exists:false,value:undefined};value=value[key];}return {exists:true,value};};
  const ignored=path=>path.length===1&&['selected','sof','meters','version'].includes(path[0])||
    path[0]==='desk'&&['history','_wing','demoContentSeeded','macrosSeeded','pluginClipboard'].includes(path[1]);
  function differences(before,after,path,patches,beforeExists=true,afterExists=true){
    if(ignored(path)||beforeExists===afterExists&&same(before,after))return;
    if(beforeExists&&afterExists&&object(before)&&object(after)&&Array.isArray(before)===Array.isArray(after)&&
      (!Array.isArray(before)||before.length===after.length&&!['members','targets','channels','order'].includes(path.at(-1)))){
      for(const key of new Set([...Object.keys(before),...Object.keys(after)]))differences(before[key],after[key],[...path,key],patches,own(before,key),own(after,key));
      return;
    }
    patches.push({path,before:copy(before),after:copy(after),beforeExists,afterExists});
  }
  function write(state,patch,direction){
    const side=direction==='undo'?'before':'after',path=patch.path;
    let parent=state;
    for(const key of path.slice(0,-1)){if(!object(parent[key]))parent[key]={};parent=parent[key];}
    const key=path.at(-1);
    if(patch[side+'Exists'])parent[key]=copy(patch[side]);else delete parent[key];
  }
  const prefix=(parent,child)=>parent.length<=child.length&&parent.every((part,index)=>String(part)===String(child[index]));
  function mergeChanges(previous,next,state){
    const merged=previous.map(patch=>({...patch}));
    for(const patch of next){
      const ancestor=merged.find(old=>prefix(old.path,patch.path));
      if(ancestor){const value=read(state,ancestor.path);ancestor.after=copy(value.value);ancestor.afterExists=value.exists;continue;}
      const children=merged.filter(old=>prefix(patch.path,old.path));
      let before=copy(patch.before);
      if(children.length){
        for(const child of children)write(before,{...child,path:child.path.slice(patch.path.length)},'undo');
        for(const child of children)merged.splice(merged.indexOf(child),1);
      }
      merged.push({...patch,before});
    }
    return merged.filter(patch=>patch.beforeExists!==patch.afterExists||!same(patch.before,patch.after));
  }
  const labels={strip:'Canale',send:'Mandata',parameter:'Parametro',processing:'Processore',channel:'Canale',source:'Sorgente',routing:'Routing',dca:'DCA',console:'Configurazione','channel-list':'Importazione channel list','channel-list-undo':'Annullamento importazione','layer-layout':'Custom Layer',recall:'Richiamo scena',macro:'Macro'};
  class Journal{
    constructor({getState,apply,beforeApply=()=>{},afterApply=()=>{},context=()=>({live:false}),notify=()=>{},limit=80,maxBytes=6*1024*1024}){
      Object.assign(this,{getState,apply,beforeApply,afterApply,context,notify,limit,maxBytes});
      this.past=[];this.future=[];this.busy=false;this.replaying=false;this.gesture=null;this.serial=0;
    }
    begin(label){if(!this.gesture)this.gesture={id:++this.serial,label:label||''};}
    end(){this.gesture=null;}
    clear(){this.past=[];this.future=[];this.end();this.notify(this.status());}
    status(){return {canUndo:!this.busy&&this.past.length>0,canRedo:!this.busy&&this.future.length>0,busy:this.busy,undoLabel:this.past.at(-1)?.label||'',redoLabel:this.future.at(-1)?.label||'',undoCount:this.past.length,redoCount:this.future.length};}
    prepare(state,type,options={}){
      if(this.replaying||options.record===false||String(type).startsWith('live-')||['init','desk-ready','systems-init','selection','sof','layer','restore','reset'].includes(type))return null;
      const paths=options.paths||[['inputs'],['outputs'],['sends'],['desk']];
      return {type,context:this.context(),gesture:this.gesture?.id||null,label:this.gesture?.label||options.label||labels[type]||'Modifica',
        scopes:paths.map(path=>({path:[...path],...read(state,path),value:copy(read(state,path).value)}))};
    }
    record(token,state){
      if(!token)return;
      const patches=[];
      for(const scope of token.scopes){const now=read(state,scope.path);differences(scope.value,now.value,scope.path,patches,scope.exists,now.exists);}
      if(!patches.length)return;
      const guards=[];
      for(const patch of patches){
        const path=patch.path;
        if(path[0]==='desk'&&path[1]==='processing'&&path.length>4){const modelPath=path.slice(0,4).concat('model');if(!patches.some(p=>same(p.path,modelPath)))guards.push({path:modelPath,value:copy(read(state,modelPath).value)});}
        if(path[0]==='desk'&&path[1]==='fx'&&path.length>3){const modelPath=path.slice(0,3).concat('model');if(!patches.some(p=>same(p.path,modelPath)))guards.push({path:modelPath,value:copy(read(state,modelPath).value)});}
      }
      const now=Date.now(),key=patches.map(p=>p.path.join('/')).sort().join('|'),last=this.past.at(-1);
      const continuous=patches.every(p=>typeof p.before==='number'&&typeof p.after==='number'||typeof p.before==='string'&&typeof p.after==='string'&&p.path.at(-1)==='name');
      const merge=last&&same(last.context,token.context)&&((token.gesture&&last.gesture===token.gesture)||(!token.gesture&&!last.gesture&&continuous&&last.key===key&&now-last.time<450));
      if(merge){
        last.patches=mergeChanges(last.patches,patches,state);last.time=now;
        const mergedGuards=new Map([...last.guards,...guards].map(guard=>[JSON.stringify(guard.path),guard]));
        last.guards=[...mergedGuards.values()].filter(guard=>!last.patches.some(patch=>prefix(patch.path,guard.path)));
        if(!last.patches.length)this.past.pop();
      }else this.past.push({...token,scopes:undefined,patches,guards,time:now,key});
      const current=this.past.at(-1);if(current)current.bytes=JSON.stringify({...current,bytes:undefined}).length;
      this.future=[];
      while(this.past.length>this.limit)this.past.shift();
      let bytes=0;
      for(let i=this.past.length-1;i>=0;i--){bytes+=this.past[i].bytes||0;if(bytes>this.maxBytes&&i<this.past.length-1){this.past.splice(0,i+1);break;}}
      this.notify(this.status());
    }
    async run(direction){
      const from=direction==='undo'?this.past:this.future,to=direction==='undo'?this.future:this.past,entry=from.at(-1);
      if(this.busy||!entry)return {ok:false,reason:this.busy?'Attendi il completamento dell’operazione.':'Nessuna operazione da '+(direction==='undo'?'annullare.':'ripristinare.')};
      this.end();this.busy=true;this.notify(this.status());
      try{
        if(!same(entry.context,this.context()))throw new Error('La sessione è cambiata. Questa operazione non può essere ripristinata.');
        await this.beforeApply(entry,direction);
        if(!same(entry.context,this.context())||from.at(-1)!==entry)throw new Error('La sessione o la cronologia è cambiata durante l’attesa. Nessun annullamento è stato applicato.');
        const state=this.getState(),expected=direction==='undo'?'after':'before';
        for(const guard of entry.guards)if(!same(read(state,guard.path).value,guard.value))throw new Error('Il modello del processore è cambiato: annullamento non disponibile.');
        for(const patch of entry.patches){const value=read(state,patch.path);if(value.exists!==patch[expected+'Exists']||!same(value.value,patch[expected]))throw new Error('Il valore è cambiato dopo questa operazione. L’annullamento non sovrascrive le modifiche più recenti.');}
        this.replaying=true;
        let accepted;
        try{accepted=this.apply(state=>{for(const patch of entry.patches)write(state,patch,direction);},direction,entry);}finally{this.replaying=false;}
        if(accepted===false)throw new Error('Operazione non accettata: controlla la connessione e i valori del banco.');
        await this.afterApply(entry,direction);
        if(!same(entry.context,this.context()))throw new Error('La sessione è cambiata durante la conferma. Controlla i valori del banco.');
        const index=from.indexOf(entry),unchanged=from.at(-1)===entry;
        if(index<0)throw new Error('La cronologia è stata sostituita durante la conferma.');
        from.splice(index,1);if(unchanged)to.push(entry);return {ok:true,label:entry.label};
      }catch(error){return {ok:false,reason:error.message||String(error)};}
      finally{this.busy=false;this.notify(this.status());}
    }
  }
  const api={Journal,read,same};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SculptHistory=api;
})(typeof window!=='undefined'?window:globalThis);
