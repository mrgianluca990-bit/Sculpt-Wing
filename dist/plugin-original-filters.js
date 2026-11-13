/* WING tool-filter screens inspected in Patrick-Gilles Maillot's
 * WING Remote Protocols V3.1.2-a, p. 171. The public author copy is linked from
 * https://sites.google.com/site/patrickmaillot/wing .
 *
 * The four reference images show the frequency grid and the right-hand
 * TOOL FILTER panel. This standalone view adds an accessible parameter row
 * below that area; its controls are the actual catalog parameters, not an
 * assertion that the cropped reference contains that lower row.
 * LC/HC are separate channel-input filters, so they are not synthesized as
 * parameters of TILT/MAX/AP1/AP2. No spectrum or proprietary response is
 * invented. The AP marker is derived only from its real frequency parameter.
 */
(function(root){
  'use strict';
  const sourceURL='https://drive.google.com/file/d/1-iptgd2Uxw4qPEbmegG2Sqccf8AbRRfk/view';
  const sourceDocument='WING Remote Protocols V3.1.2-a';
  const caption=(text,x,y,size=12,extra={})=>({text,x,y,size,...extra});
  const digital=(key,label,x)=>({key,label,x,y:552,width:182,height:62,size:182,kind:'digital'});
  const panel=(name,controls,frequencyKey)=>({
    sourcePage:171,sourceURL,sourceDocument,
    referenceScope:'Tool-filter plot and right sidebar; accessible parameter row added below the reference crop',
    skin:'wing-tool-filter',width:1000,height:608,
    background:'#020303',foreground:'#d7d9d8',
    regions:[
      {x:9,y:9,width:818,height:490,fill:'#000000',stroke:'#303535',radius:0},
      {x:835,y:9,width:155,height:490,fill:'#444545',stroke:'#666867',radius:0},
      {x:843,y:18,width:139,height:54,fill:'#282a2a',stroke:'#777b79',radius:0},
      {x:9,y:514,width:981,height:78,fill:'#111516',stroke:'#3b4244',radius:0}
    ],
    // The active tool has the same position as in the documented sidebar.
    // enableProcessor uses the existing instance state and live-readiness gate.
    power:{x:912,y:450,size:112,label:name},
    labels:[
      caption('TOOL FILTER',851,33,12,{align:'left'}),
      caption(name,851,55,19,{align:'left',color:'#f1f2f1'}),
      caption('FILTRI DI INGRESSO',912,240,10,{color:'#b6b9b6'}),
      caption('LC / HC',912,260,14,{color:'#d0d2d0'}),
      caption('nel pannello canale',912,278,10,{color:'#b6b9b6'})
    ],
    lines:[{x1:861,y1:387,x2:966,y2:387,color:'#252827'}],
    displays:[{
      kind:'tool-filter',x:14,y:89,width:808,height:406,
      ...(frequencyKey?{frequencyKey}:{}),
      label:frequencyKey?'FREQUENZA ALL PASS · NESSUNA ANALISI AUDIO':'RISPOSTA AUDIO NON DISPONIBILE'
    }],
    controls
  });
  const definitions={
    'filter:TILT':panel('TILT EQ',[digital('tilt','TILT',416)]),
    'filter:MAX':panel('MAXER',[digital('low','LOW CONTOUR',282),digital('proc','HIGH PROCESS',550)]),
    'filter:AP1':panel('AP 90',[digital('freq','FREQ',416)],'freq'),
    'filter:AP2':panel('AP 180',[digital('f','FREQ',282),digital('q','Q',550)],'f')
  };
  root.SculptOriginalLayouts=Object.assign(root.SculptOriginalLayouts||{},definitions);
  if(typeof module!=='undefined'&&module.exports)module.exports=definitions;
})(typeof window!=='undefined'?window:globalThis);
