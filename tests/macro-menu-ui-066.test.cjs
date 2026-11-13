const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const base=path.join(__dirname,'../dist');
const copy=value=>JSON.parse(JSON.stringify(value));

function fixture(t){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>0;
  w.HTMLElement.prototype.scrollTo=function({left=0}){this.scrollLeft=left;};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.show=function(){this.open=true;};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const files=['plugin-data.js','plugin-panels.js',...['layouts','dynamics','eq','fx','channel','native','dynamics-extra','filters'].map(part=>'plugin-original-'+part+'.js'),'model.js','app.js','desk.js','shell.js','plugins.js','editor.js','io.js','systems.js'];
  for(const file of files)vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  const C=w.SculptController,D=w.SculptDesk,U=w.SculptUI,E=w.SculptEditor;
  t.after(()=>{E.close();dom.window.close();});
  const named=label=>{const control=[...w.document.querySelectorAll('[aria-label]')].find(node=>node.getAttribute('aria-label')===label);assert(control,'Missing control: '+label);return control;};
  const button=text=>{const control=[...w.document.querySelectorAll('button')].find(node=>node.textContent===text);assert(control,'Missing button: '+text);return control;};
  const choose=(label,value)=>{const control=named(label);assert([...control.options].some(option=>option.value===value),'Missing option '+value+' for '+label);control.value=value;control.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const fill=(label,value)=>{const control=named(label);control.value=value;control.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const rail=id=>w.document.querySelector(`.macro-action[data-macro-id="${id}"]`);
  const run=async(control,id)=>{
    const completed=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{w.removeEventListener('sculpt-macro-status',onStatus);reject(new Error('Macro '+id+' did not finish'));},2000);
      function onStatus(event){if(String(event.detail?.id)===String(id)&&event.detail.running===false){clearTimeout(timeout);w.removeEventListener('sculpt-macro-status',onStatus);resolve();}}
      w.addEventListener('sculpt-macro-status',onStatus);
    });
    control.click();await completed;await Promise.resolve();
  };
  const audio=()=>{const snapshot=C.capture();return copy({values:snapshot.values,sends:snapshot.sends,processing:snapshot.desk.processing,sources:snapshot.desk.sources,outputs:snapshot.desk.outputs});};
  return {dom,w,C,D,U,E,named,button,choose,fill,rail,run,audio};
}

test('a blank M9 assigns an I/O submenu and opens it both from the rail and the macro editor without repainting over it',async t=>{
  const f=fixture(t),before=f.audio();f.rail(9).click();
  assert.equal(f.U.current(),'macros');assert.equal(f.D.get().macros[8].actions.length,0);assert.equal(f.button('Assegna azione').disabled,true);
  f.choose('Cosa vuoi assegnare?','menu');f.button('Assegna azione').click();
  f.choose('Menu da aprire 1','io');f.choose('Sezione del menu 1','outputs');
  const macroName=f.named('Nome macro');macroName.value='Patch uscite';macroName.dispatchEvent(new f.w.Event('input',{bubbles:true}));
  assert.equal(f.D.get().macros[8].name,'Patch uscite','typing a macro name saves it before navigation');
  assert.equal(f.D.get().macros[8].actions[0].type,'menu');assert.equal(f.D.get().macros[8].actions[0].target,'io');assert.equal(f.D.get().macros[8].actions[0].tab,'outputs');
  f.button('‹ Mixer').click();assert.equal(f.U.current(),null);assert.equal(f.rail(9).getAttribute('aria-label'),'Macro 9 · Patch uscite');
  await f.run(f.rail(9),9);assert.equal(f.U.current(),'io');assert.equal(f.w.document.querySelector('.desk-tabs [aria-selected="true"]').textContent,'Uscite');
  assert.equal(f.w.document.querySelector('.desk-page-header h1').textContent,'I/O · Routing');assert.equal(f.w.document.querySelector('[aria-label="Cosa vuoi assegnare?"]'),null);
  f.U.close();f.rail(9).dispatchEvent(new f.w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));assert.equal(f.U.current(),'macros');
  await f.run(f.button('▶ Esegui'),9);assert.equal(f.U.current(),'io');assert.equal(f.w.document.querySelector('.desk-tabs [aria-selected="true"]').textContent,'Uscite');
  assert.equal(f.w.document.querySelector('.sys-macro-bank'),null,'the completed run must not restore the macro page over I/O');assert.deepEqual(f.audio(),before);
});

test('M10 opens the chosen channel EQ through the real editor and clearing the slot restores the action chooser',async t=>{
  const f=fixture(t),before=f.audio();f.rail(10).click();f.choose('Cosa vuoi assegnare?','editor');f.button('Assegna azione').click();
  f.choose('Destinazione azione 1','ch-2');f.choose('Sezione editor 1','eq');f.fill('Nome macro','EQ voce');
  await f.run(f.button('▶ Esegui'),10);
  assert.equal(f.U.current(),null);assert.equal(f.E.isOpen(),true);assert.equal(f.C.getState().selected,'ch-2');
  assert.equal(f.w.document.querySelector('.editor-dialog [role="tab"][aria-selected="true"]').dataset.tab,'eq');assert.equal(f.w.document.querySelector('.desk-workspace').open,false);assert.deepEqual(f.audio(),before);
  f.E.close();f.rail(10).dispatchEvent(new f.w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));f.button('Svuota pulsante').click();
  assert.equal(f.D.get().macros[9].name,'');assert.equal(f.D.get().macros[9].actions.length,0);assert.equal(f.button('▶ Esegui').disabled,true);assert.equal(f.named('Cosa vuoi assegnare?').value,'');
  f.button('‹ Mixer').click();assert.equal(f.rail(10).getAttribute('aria-label'),'Macro 10 · Assegna');assert.equal(f.rail(10).classList.contains('is-empty'),true);
  f.rail(10).click();assert.equal(f.U.current(),'macros');assert.equal(f.button('Assegna azione').disabled,true);assert.equal(f.E.isOpen(),false);
});
