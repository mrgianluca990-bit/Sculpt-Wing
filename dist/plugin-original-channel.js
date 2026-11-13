/* WING channel FX are tabbed racks, as photographed on Effects Guide pp.22–23.
 * Each page composes an inspected processor face, remapping ONLY its real
 * channel-strip parameter keys. No independent audio state or meter data.
 * Load after original layouts, dynamics, EQ and FX definitions in browsers.
 */
(function(root){
  'use strict';
  const sources=typeof module!=='undefined'&&module.exports?Object.assign({},require('./plugin-original-layouts.js'),require('./plugin-original-dynamics.js'),require('./plugin-original-eq.js'),require('./plugin-original-fx.js')):root.SculptOriginalLayouts;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const named=(names,prefix='')=>Object.fromEntries(names.split(' ').map(key=>[key,prefix+key]));
  const enable=(key,x,y,label='IN',size=65)=>({key,x,y,label,size,width:size,height:30,kind:'switch'});
  function panel(sourceKey,mapping,on){
    const source=sources?.[sourceKey];if(!source)throw new Error('Missing WING channel reference: '+sourceKey);
    const layout=clone(source);
    layout.controls=layout.controls.filter(spec=>mapping[spec.key]).map(spec=>({...spec,key:mapping[spec.key]}));
    if(on)layout.controls.push(on);
    delete layout.power;
    if(layout.displays)layout.displays=layout.displays.flatMap(display=>{
      if(display.key){if(!mapping[display.key])return [];display.key=mapping[display.key];}
      if(display.keys){const keys={};for(const [name,key]of Object.entries(display.keys)){if(typeof key!=='string'||!mapping[key])return [];keys[name]=mapping[key];}display.keys=keys;}
      return [display];
    });
    return layout;
  }
  // Some standalone faces have no IN switch in the published image. Their real
  // channel-module bypass is exposed in the page header, never invented on-face.
  const page=(id,label,layout,enableKey)=>({id,label,layout,...(enableKey?{enableKey}: {})});
  function rack(sourcePage,pages){
    const controls=pages.flatMap(item=>[...item.layout.controls.map(spec=>({...spec,page:item.id})),...(item.enableKey?[{...enable(item.enableKey,80,35,item.label+' IN'),page:item.id}]:[])]);
    return {sourcePage,skin:'channel-rack',width:Math.max(...pages.map(item=>item.layout.width)),height:Math.max(...pages.map(item=>item.layout.height))+65,background:'#111414',defaultPage:'eq',pages,controls};
  }
  const definitions={
    '*EVEN*':rack(22,[
      page('gate','GATE',panel('gate_dynamics:E88',named('thr hyst range rel fast m40','g_'),enable('g_on',114,73,'ON',60))),
      page('eq','EQ',panel('eq:E88',named('mix lf lg lq lt lmf lmg lmq hmf hmg hmq hf hg hq ht'),enable('eq_on',65,58,'EQ',62))),
      page('dyn','DYN',panel('gate_dynamics:ECL33',named('gain lon lthr lrec lfast con cthr ratio crec cfast','d_')))
    ]),
    '*SOUL*':rack(22,[
      page('gate','GATE',panel('gate_dynamics:9000G',named('thr range hld rel fast mode','g_'),enable('g_on',140,86,'ON',60))),
      page('eq','EQ',panel('SOUL',named('mix lf lg lmf lmf3 lmq lmg hmf hmf3 hmq hmg hf hg'),enable('eq_on',905,88,'EQ IN',48))),
      page('dyn','DYN',panel('gate_dynamics:9000C',named('thr ratio fast rel peak','d_'),enable('d_on',175,85,'IN',60)))
    ]),
    '*VINTAGE*':rack(22,[
      page('dyn','DYN',panel('76LA',named('in out att rel ratio','d_')),'d_on'),
      page('eq','EQ',panel('PULSAR',named('eq1 1lb 1latt 1lf 1hw 1hb 1hf 1hatt 1hattf eq5 5lb 5lf 5md 5mf 5hb 5hf'))),
      page('lvl','LVL',panel('LA',named('ingain peak mode','l_'),enable('l_on',885,180,'POWER',70)))
    ]),
    '*BUS*':rack(23,[
      page('warm','WARM',panel('gate_dynamics:WARM',named('drv hrm col trim mix','w_'),enable('w_on',178,87,'IN',60))),
      page('eq','EQ',panel('E84',named('mix g lf lg mf mg mq hf hg'),enable('eq_on',915,155,'EQ',67))),
      page('dyn','DYN',panel('SBUS',named('thr ratio att rel gain','d_'),enable('d_on',881,226,'IN',70)))
    ]),
    '*MASTER*':rack(23,[
      page('tape','TAPE',panel('fx_standard:TAPE',named('drv spd low hi','t_')),'t_on'),
      page('eq','EQ',panel('MACH4',named('sub 40 160 650 2k5 air airm'),enable('eq_on',98,247,'IN / OUT',65))),
      page('enh','ENH',panel('fx_standard:ENHANCE',{...named('lmf st m bass mid high bassf midq highf','e_'),stlv:'e_stlvl',lmvl:'e_mlvl'}),'e_on'),
      page('lim','LIM',panel('fx_standard:LIMITER',named('gin gout sqz knee again att rel','l_')),'l_on')
    ]),
    'fx_mode:EXT':{sourcePage:23,skin:'external-effect',width:1000,height:310,background:'#262828',foreground:'#c8cbc7',
      regions:[{x:83,y:87,width:250,height:198,fill:'#222424',stroke:'#4c4f4b',radius:2},{x:410,y:106,width:180,height:178,fill:'#080a08'},{x:708,y:105,width:211,height:180,fill:'#191b19'}],
      labels:[{text:'EXTERNAL EFFECT',x:500,y:30,size:23},{text:'SEND',x:209,y:75,size:16},{text:'FX MODE',x:500,y:75,size:16},{text:'RETURN',x:814,y:75,size:16},{text:'Routing di uscita in I/O',x:208,y:123,size:12,color:'#a4aba2'}],
      controls:[{key:'lat',x:209,y:181,width:185,size:185,height:57,label:'LATENCY',kind:'digital'},{key:'trim',x:209,y:250,width:185,size:185,height:57,label:'TRIM',kind:'digital'},{key:'emode',x:500,y:197,width:177,size:177,height:176,label:'',kind:'buttons',order:['M','ST','M/S']},{key:'egrp',x:814,y:155,width:185,size:185,height:58,label:'RETURN GROUP',kind:'digital'},{key:'ein',x:814,y:239,width:185,size:185,height:58,label:'RETURN INPUT',kind:'digital'}],
      meters:[{kind:'led',x:40,y:105,width:25,height:180,count:16,label:'SEND',orientation:'vertical',color:'#6ca36e'},{kind:'led',x:941,y:105,width:25,height:180,count:16,label:'RETURN',orientation:'vertical',color:'#6ca36e'}]}
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=definitions;
  else root.SculptOriginalLayouts=Object.assign(root.SculptOriginalLayouts||{},definitions);
})(typeof window!=='undefined'?window:globalThis);
