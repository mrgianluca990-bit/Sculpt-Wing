'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),base=path.join(__dirname,'../dist');
const ctx={type:'strip',id:'ch-1',block:'eq'};
const X=f=>36+Math.log(f/20)/Math.log(1000)*584,Y=g=>85-g*3.5;
function fixture(t){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://sculpt.test',runScripts:'outside-only'}),w=dom.window,captures=new Map();
  w.matchMedia=()=>({matches:false});w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=()=>0;
  w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.Element.prototype.setPointerCapture=function(id){captures.set(id,this);};w.Element.prototype.hasPointerCapture=function(id){return captures.get(id)===this;};
  w.Element.prototype.releasePointerCapture=function(id){if(captures.get(id)===this)captures.delete(id);};
  w.SculptUI={toast(){},register(){}};
  for(const file of ['plugin-data.js','model.js','history.js','app.js','desk.js','plugin-panels.js','plugins.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  const C=w.SculptController,D=w.SculptDesk,host=w.document.createElement('section');w.document.body.append(host);
  D.setModel(ctx,'STD');D.setParams(ctx,{'1f':1000,'1g':0});C.clearHistory();
  const cleanup=w.SculptFX.renderProcessor(host,ctx,{rotaryBank:true}),svg=host.querySelector('.fx-eq-display svg'),point=host.querySelector('[data-band="1"]');
  const values=()=>D.processor(ctx).params;
  const pointer=(target,type,x,y,{id=1,button=0,shiftKey=false}={})=>{
    const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button,shiftKey});
    Object.defineProperties(e,{pointerId:{value:id},pointerType:{value:'mouse'}});target.dispatchEvent(e);return e;
  };
  const matrix=(a,b,c,d,e,f)=>{
    svg.getScreenCTM=()=>({inverse(){const det=a*d-b*c;return {a:d/det,b:-b/det,c:-c/det,d:a/det,e:(c*f-d*e)/det,f:(b*e-a*f)/det};}});
    return (x,y)=>({x:a*x+c*y+e,y:b*x+d*y+f});
  };
  t.after(()=>{cleanup();w.close();});
  return {w,C,D,host,svg,point,values,pointer,matrix,captures,cleanup};
}
function closeTo(actual,expected,tolerance=.15){assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} ≈ ${expected}`);}

test('EQ pointer follows the rendered SVG in a wide row and never jumps on pickup',t=>{
  const f=fixture(t),scale=160/190,screen=f.matrix(scale,0,0,scale,50+(1000-640*scale)/2,70);
  f.svg.getBoundingClientRect=()=>({left:50,top:70,width:1000,height:160});
  const before=JSON.stringify(f.values()),start=screen(X(1000)+6,Y(0)+3);
  f.pointer(f.point,'pointerdown',start.x,start.y);assert.equal(JSON.stringify(f.values()),before,'grabbing the edge does not change the band');
  const next=screen(X(1000)+6+58.4,Y(0)+3-10.5);f.pointer(f.point,'pointermove',next.x,next.y);
  closeTo(f.values()['1f'],1000*1000**.1,1);closeTo(f.values()['1g'],3);
  f.pointer(f.point,'pointerup',next.x,next.y);
  const old=JSON.parse(before);for(const [key,value]of Object.entries(old))if(!['1f','1g'].includes(key))assert.equal(f.values()[key],value,`unselected ${key}`);
});

test('EQ fallback respects centered letterboxing in tall and wide layouts',t=>{
  for(const rect of [{left:15,top:40,width:900,height:150},{left:15,top:40,width:320,height:300}]){
    const f=fixture(t);f.svg.getBoundingClientRect=()=>rect;
    const scale=Math.min(rect.width/640,rect.height/190),screen=(x,y)=>({x:rect.left+(rect.width-640*scale)/2+x*scale,y:rect.top+(rect.height-190*scale)/2+y*scale});
    const start=screen(X(1000),Y(0)),next=screen(X(1000)-29.2,Y(-4));
    f.pointer(f.point,'pointerdown',start.x,start.y);f.pointer(f.point,'pointermove',next.x,next.y);f.pointer(f.point,'pointerup',next.x,next.y);
    closeTo(f.values()['1f'],1000*1000**(-.05),1);closeTo(f.values()['1g'],-4);
  }
});

test('EQ uses the complete inverse transform rather than an unscaled bounding rectangle',t=>{
  const f=fixture(t),screen=f.matrix(1.2,.2,-.1,.8,210,125),start=screen(X(1000),Y(0)),next=screen(X(1000)+20,Y(5));
  f.pointer(f.point,'pointerdown',start.x,start.y);f.pointer(f.point,'pointermove',next.x,next.y);f.pointer(f.point,'pointerup',next.x,next.y);
  closeTo(f.values()['1f'],1000*1000**(20/584),1);closeTo(f.values()['1g'],5);
});

test('EQ Shift precision is continuous and other pointers cannot move or end the captured band',t=>{
  const f=fixture(t),screen=f.matrix(1,0,0,1,0,0),start=screen(X(1000),Y(0));
  f.pointer(f.point,'pointerdown',start.x,start.y,{button:2});f.pointer(f.point,'pointermove',start.x+50,start.y);assert.equal(f.values()['1f'],1000);
  f.pointer(f.point,'pointerdown',start.x,start.y);
  f.pointer(f.point,'pointermove',start.x,start.y-7,{id:2});assert.equal(f.values()['1g'],0);
  f.pointer(f.point,'pointerup',start.x,start.y,{id:2});assert.equal(f.captures.has(1),true);
  f.pointer(f.point,'pointermove',start.x,start.y-7);assert.equal(f.values()['1g'],2);
  f.pointer(f.point,'pointermove',start.x,start.y-7,{shiftKey:true});assert.equal(f.values()['1g'],2,'pressing Shift without motion is stable');
  f.pointer(f.point,'pointermove',start.x,start.y-14,{shiftKey:true});closeTo(f.values()['1g'],2.4);
  f.pointer(f.point,'pointermove',start.x,start.y-14);assert.equal(f.values()['1g'],2.4,'releasing Shift without motion is stable');
  f.pointer(f.point,'pointercancel',start.x,start.y-14);assert.equal(f.captures.size,0);
  f.pointer(f.point,'pointermove',start.x,start.y-30);closeTo(f.values()['1g'],2.4);
});

test('each EQ drag step is atomic and the complete gesture undoes as one operation',async t=>{
  const f=fixture(t),before=JSON.stringify(f.values()),screen=f.matrix(.8,0,0,.8,80,25),start=screen(X(1000),Y(0)),changes=[];
  f.C.subscribe(event=>{if(event.type==='parameter')changes.push([f.values()['1f'],f.values()['1g']]);});
  f.pointer(f.point,'pointerdown',start.x,start.y);
  for(const dx of [10,20,30]){const next=screen(X(1000)+dx,Y(dx/10));f.pointer(f.point,'pointermove',next.x,next.y);}
  f.pointer(f.point,'pointerup',start.x,start.y);
  assert.equal(changes.length,3,'one notification for both axes per step');assert.equal(f.C.historyState().undoCount,1);
  assert.equal((await f.C.undo()).ok,true);assert.equal(JSON.stringify(f.values()),before);
  assert.equal((await f.C.redo()).ok,true);closeTo(f.values()['1g'],3);
});

test('batch parameter validation never applies half a band movement',t=>{
  const f=fixture(t),before=JSON.stringify(f.values());
  assert.equal(f.D.setParams(ctx,{'1f':2000,missing:5}),false);assert.equal(JSON.stringify(f.values()),before);
  f.w.SculptLive={isLive:()=>true,parameterDefinition:(_ctx,key)=>key==='1g'?{readOnly:true}:{} };
  assert.equal(f.D.setParams(ctx,{'1f':2000,'1g':5}),false);assert.equal(JSON.stringify(f.values()),before);
});

test('EQ teardown and window blur release the gesture before another channel can be edited',t=>{
  const f=fixture(t),screen=f.matrix(1,0,0,1,0,0),start=screen(X(1000),Y(0));
  f.pointer(f.point,'pointerdown',start.x,start.y);f.pointer(f.point,'pointermove',start.x,start.y-7);
  f.w.dispatchEvent(new f.w.Event('blur'));assert.equal(f.captures.size,0);
  f.pointer(f.point,'pointermove',start.x,start.y-14);assert.equal(f.values()['1g'],2);
  f.pointer(f.point,'pointerdown',start.x,start.y-7);f.cleanup();assert.equal(f.captures.size,0);
  f.pointer(f.point,'pointermove',start.x+100,start.y-30);assert.equal(f.values()['1g'],2);
  f.pointer(f.point,'pointerdown',start.x,start.y);f.pointer(f.point,'pointermove',start.x+100,start.y-30);assert.equal(f.values()['1g'],2,'a disposed surface cannot start a new gesture');
  f.point.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));assert.equal(f.values()['1g'],2);
});

test('a rejected EQ mutation releases the pointer and cannot accumulate an unseen movement',t=>{
  const f=fixture(t),screen=f.matrix(1,0,0,1,0,0),start=screen(X(1000),Y(0)),setParams=f.D.setParams;
  f.pointer(f.point,'pointerdown',start.x,start.y);f.D.setParams=()=>false;
  f.pointer(f.point,'pointermove',start.x+80,start.y-20);assert.equal(f.captures.size,0);assert.equal(f.values()['1g'],0);
  f.D.setParams=setParams;f.pointer(f.point,'pointermove',start.x+81,start.y-21);assert.equal(f.values()['1g'],0);assert.equal(f.values()['1f'],1000);
});

test('a singular or hidden SVG cannot write invalid frequency or gain values',t=>{
  const f=fixture(t),before=JSON.stringify(f.values());f.svg.getScreenCTM=()=>({inverse(){throw new Error('singular');}});
  f.pointer(f.point,'pointerdown',500,90);f.pointer(f.point,'pointermove',600,100);assert.equal(JSON.stringify(f.values()),before);assert.equal(f.captures.size,0);
});
