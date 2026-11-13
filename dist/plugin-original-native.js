/* Digital WING dynamics panels: original Effects Guide pp.24 and 29.
 * The plotted transfer/envelope shapes describe settings, never measured audio.
 * Graph rendering stays in plugins.js so the controls use the real live binding.
 */
(function(root){
  'use strict';
  const digital=(key,x,y,label,width=140)=>({key,x,y,label,kind:'digital',width,height:56,size:width});
  const base=(title,mode,page)=>({sourcePage:page,skin:'wing-digital',width:1000,height:550,background:'#111213',foreground:'#d8dad6',
    power:{x:909,y:34,size:78,label:'ON'},
    labels:[{text:title,x:26,y:34,size:23,align:'left',color:'#ebedeb'}],
    regions:[{x:9,y:9,width:982,height:52,fill:'#242627'},{x:9,y:66,width:982,height:69,fill:'#202223'},{x:9,y:141,width:463,height:335,fill:'#222425'},{x:481,y:141,width:510,height:335,fill:'#222425'},{x:481,y:347,width:510,height:129,fill:'#1d1f20'},{x:9,y:484,width:982,height:57,fill:'#050707'}],
    displays:[{kind:'transfer',mode,x:17,y:148,width:447,height:318,keys:{threshold:'thr',ratio:'ratio',range:'range'},label:'CURVA STATICA DI RIFERIMENTO'},{kind:'envelope',x:490,y:149,width:490,height:190,keys:{attack:'att',hold:'hld',release:'rel'},label:'ENVELOPE'}],
    controls:[]});
  const gate=base('WING GATE / EXPANDER','gate',24);
  gate.controls=[digital('acc',102,101,'ACCENT',158),digital('thr',90,512,'THR'),digital('ratio',250,512,'RATIO'),digital('range',410,512,'RANGE'),digital('att',570,512,'ATTACK'),digital('hld',730,512,'HOLD'),digital('rel',900,512,'RELEASE',160)];
  const ducker=base('WING DUCKER','ducker',24);
  ducker.controls=[digital('thr',90,512,'THR'),digital('range',410,512,'RANGE'),digital('att',570,512,'ATTACK'),digital('hld',730,512,'HOLD'),digital('rel',900,512,'RELEASE',160)];
  function dynamics(title,mode){
    const layout=base(title,mode,29);
    layout.controls=[digital('mix',627,35,'MIX',150),digital('gain',102,101,'GAIN',158),digital('thr',90,512,'THR'),digital('ratio',250,512,'RATIO'),digital('knee',410,512,'KNEE'),digital('att',570,512,'ATTACK'),digital('hld',730,512,'HOLD'),digital('rel',900,512,'RELEASE',160),{key:'det',x:588,y:409,width:170,size:170,height:68,label:'DETECTOR',kind:'buttons',orientation:'horizontal',order:['PEAK','RMS']},digital('env',765,409,'ENVELOPE',120),{key:'auto',x:922,y:410,width:100,size:100,height:32,label:'AUTO ENV',kind:'switch'}];
    return layout;
  }
  const definitions={'gate_dynamics:GATE':gate,'gate_dynamics:DUCK':ducker,'gate_dynamics:COMP':dynamics('WING COMPRESSOR','compressor'),'gate_dynamics:EXP':dynamics('WING EXPANDER','expander')};
  if(typeof module!=='undefined'&&module.exports)module.exports=definitions;
  else root.SculptOriginalLayouts=Object.assign(root.SculptOriginalLayouts||{},definitions);
})(typeof window!=='undefined'?window:globalThis);
