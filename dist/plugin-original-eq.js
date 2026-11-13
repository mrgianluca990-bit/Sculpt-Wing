/* EQ face geometry inspected against the original Behringer WING Effects Guide
 * v3.0, pp. 20–21 and 28. Page 28 refers the analogue strip EQs back to the rack faces.
 * This file describes controls only: audio values and writes remain in SculptDesk.
 */
(function(root){
  'use strict';
  const knob=(key,x,y,size,color,extra={})=>({key,x,y,size,kind:'knob',color,label:'',hideLabel:true,hideValue:true,...extra});
  const toggle=(key,x,y,label,size=58)=>({key,x,y,size,kind:'switch',label});
  const caption=(text,x,y,size=12,extra={})=>({text,x,y,size,...extra});
  const soul={sourcePage:20,skin:'soul-analogue',width:1000,height:310,
    background:'radial-gradient(ellipse at 45% 45%,#52514b,#383a37 70%,#242825)',foreground:'#e6e5dc',
    controls:[
      knob('mix',72,88,65,'#747d77',{scale:['0','50','100','125']}),
      knob('lg',218,88,65,'#747d77',{scale:['−','0','+']}),
      knob('lf',153,222,65,'#747d77',{scale:['30','50','100','200','300','450']}),
      knob('lmg',365,88,65,'#1304cf',{scale:['−','0','+']}),
      toggle('lmf3',459,88,'÷3',36),
      knob('lmq',297,222,65,'#1304cf',{scale:['3.5','1.5','0.8','0.3','0.1']}),
      knob('lmf',433,222,65,'#1304cf',{scale:['0.2','0.3','0.8','1.5','2','2.5']}),
      toggle('hmf3',546,88,'×3',36),
      knob('hmg',642,88,65,'#087019',{scale:['−','0','+']}),
      knob('hmq',575,222,65,'#087019',{scale:['3.5','1.5','0.8','0.3','0.1']}),
      knob('hmf',710,222,65,'#087019',{scale:['0.6','0.8','1.5','3','4.5','6','7']}),
      knob('hg',788,88,65,'#5c2b85',{scale:['−','0','+']}),
      knob('hf',856,222,65,'#5c2b85',{scale:['1.5','2','5','8','10','14','16']})
    ],
    power:{x:905,y:88,size:48,label:'EQ IN'},
    labels:[caption('SOUL Analog',500,23,21),caption('MIX',122,45),caption('LF',271,45),caption('LMF',418,45),caption('HMF',590,45),caption('HF',737,45),caption('%',72,136,10),caption('dB',218,136,10),caption('dB',365,136,10),caption('dB',642,136,10),caption('dB',788,136,10),caption('Hz',153,273,10),caption('Q',297,273,10),caption('kHz',433,273,10),caption('Q',575,273,10),caption('kHz',710,273,10),caption('kHz',856,273,10),caption('EQ',500,292,12)],
    lines:[
      {x1:145,y1:28,x2:145,y2:126},{x1:145,y1:126,x2:79,y2:181},{x1:79,y1:181,x2:79,y2:281},
      {x1:292,y1:28,x2:292,y2:126},{x1:292,y1:126,x2:224,y2:181},{x1:224,y1:181,x2:224,y2:281},
      {x1:502,y1:32,x2:502,y2:281},
      {x1:715,y1:28,x2:715,y2:126},{x1:715,y1:126,x2:782,y2:181},{x1:782,y1:181,x2:782,y2:281},
      {x1:862,y1:28,x2:862,y2:126},{x1:862,y1:126,x2:929,y2:181},{x1:929,y1:181,x2:929,y2:281}
    ]};
  const even88={sourcePage:20,skin:'even88-eq',width:1000,height:310,
    background:'radial-gradient(ellipse at 50% 45%,#263735,#132522 75%,#0c1716)',foreground:'#c3cbc4',
    controls:[
      toggle('lt',65,133,'BELL / SHELF',62),
      knob('lf',65,207,69,'#3f4642',{scale:['33','73','120','200','300','440']}),
      toggle('lq',154,216,'HI-Q',61),
      knob('lg',240,207,69,'#3f4642',{scale:['−','0','+']}),
      knob('lmq',154,102,69,'#00c2df',{scale:['3','Q','0']}),
      knob('lmf',328,102,69,'#00c2df',{scale:['120','330','570','940','1.4k','2k']}),
      knob('lmg',414,207,69,'#00c2df',{scale:['−','0','+']}),
      knob('hmf',503,102,69,'#079ae6',{scale:['0.8','1.4','2.4','3.7','6.0','9.0']}),
      knob('hmq',678,102,69,'#079ae6',{scale:['3','Q','0']}),
      knob('hmg',589,207,69,'#079ae6',{scale:['−','0','+']}),
      knob('hg',764,207,69,'#16821b',{scale:['−','0','+']}),
      knob('mix',853,102,69,'#a4aaa2',{scale:['0','50','100','125']}),
      toggle('hq',853,216,'HI-Q',61),
      toggle('ht',939,133,'BELL / SHELF',62),
      knob('hf',939,207,69,'#16821b',{scale:['1.5','3.2','5.3','8','13','18']})
    ],
    power:{x:65,y:58,size:62,label:'EQ'},
    labels:[caption('LOW',154,257,12),caption('LOW MID',414,278,11),caption('HIGH MID',589,278,11),caption('HIGH',853,257,12),caption('MIX',853,154,10),caption('Hz',65,258,10),caption('Hz',328,154,10),caption('kHz',503,154,10),caption('kHz',939,258,10),caption('dB',240,258,10),caption('dB',414,258,10),caption('dB',589,258,10),caption('dB',764,258,10),caption('Even',780,283,29),caption('88-FORMANT',875,286,16)]};
  const even84={sourcePage:21,skin:'even84-eq',width:1000,height:310,
    background:'repeating-linear-gradient(0deg,#ffffff02 0,#ffffff02 1px,transparent 1px,transparent 4px),linear-gradient(100deg,#1d2933,#35444c 48%,#19252d)',foreground:'#c1c8c7',
    controls:[
      knob('g',131,155,79,'#6f0b0d',{reverse:true,scale:['+20','+10','0','−10','−20']}),
      {key:'lf',x:278,y:155,size:108,kind:'ring',label:'LOW FREQUENCY',hideLabel:true,hideValue:true,valueOffsetY:-150,color:'#717e82',scale:['off','35','60','110','220']},
      knob('lg',278,155,62,'#00c5e8'),
      toggle('mq',392,155,'HI-Q',66),
      {key:'mf',x:512,y:155,size:108,kind:'ring',label:'MID FREQUENCY',hideLabel:true,hideValue:true,valueOffsetY:-150,color:'#717e82',scale:['off','0.35','0.7','1.6','3.2','4.8','7.2']},
      knob('mg',512,155,62,'#00c5e8'),
      {key:'hf',x:659,y:155,size:108,kind:'ring',label:'HIGH FREQUENCY',hideLabel:true,hideValue:true,valueOffsetY:-150,color:'#717e82',scale:['10','12','16','off']},
      knob('hg',659,155,62,'#00c5e8'),
      knob('mix',804,155,79,'#a2a8a2',{scale:['0','50','100','125']})
    ],
    power:{x:915,y:155,size:67,label:'EQ'},
    labels:[caption('GAIN',131,68,14),caption('LOW',278,242,13),caption('MID',512,242,13),caption('HIGH',659,242,13),caption('MIX',804,68,14),caption('dB',131,224,11),caption('Hz',278,220,11),caption('kHz',512,220,11),caption('kHz',659,220,11),caption('%',804,224,11),caption('Even',777,282,29),caption('84',845,285,16)]};
  const fortissimo={sourcePage:21,skin:'fortissimo-eq',width:1000,height:310,
    background:'linear-gradient(115deg,#192a79,#15205e 55%,#0c1753)',foreground:'#eeeeea',
    regions:[{x:19,y:49,width:465,height:212,fill:'#8f9394',stroke:'#d2d4d3',radius:3},{x:491,y:49,width:499,height:116,fill:'#8f9394',stroke:'#d2d4d3',radius:3},{x:491,y:164,width:310,height:97,fill:'#8f9394',stroke:'#d2d4d3',radius:3},{x:810,y:173,width:86,height:88,fill:'#8f9394',stroke:'#d2d4d3',radius:3},{x:905,y:173,width:85,height:88,fill:'#8f9394',stroke:'#d2d4d3',radius:3},{x:256,y:49,width:79,height:50,fill:'#192a79'}],
    controls:[
      toggle('peq',54,100,'PEQ In',48),toggle('lmf3',128,100,'×3',40),
      knob('lmf',200,108,52,'#efed39',{scale:['120','40','110','330','660','200','400','1200']}),
      knob('lmg',87,199,80,'#cfd3ce',{scale:['−','0','+']}),knob('lmq',200,213,52,'#efed39'),
      toggle('hmf3',361,100,'×3',40),knob('hmf',431,108,52,'#efed39',{scale:['1.8','0.6','1.5','4.5','9','3','6','18']}),
      knob('hmg',324,199,80,'#cfd3ce',{scale:['−','0','+']}),knob('hmq',431,213,52,'#efed39'),
      toggle('shv',528,100,'SHEQ In',54),
      knob('lg',659,108,80,'#cfd3ce',{scale:['−','0','+']}),knob('hg',819,108,80,'#cfd3ce',{scale:['−','0','+']}),
      knob('lf',562,213,52,'#efed39',{scale:['33','56','95','160','270','460']}),
      knob('hf',724,213,52,'#efed39',{scale:['3.3','4.7','6.8','10','15','18']}),
      knob('mix',853,213,52,'#efed39'),knob('g',948,213,52,'#efed39')
    ],
    power:{x:947,y:100,size:48,label:'All EQ'},
    labels:[caption('FORTISSIMO',296,65,12),caption('110',296,83,20),caption('MIX',853,252,11),caption('GAIN',948,252,11),caption('LOW MID',87,247,10),caption('Q',200,252,10),caption('HIGH MID',324,247,10),caption('Q',431,252,10)]};
  // Page 28: select a band at the right or on the existing interactive EQ plot;
  // its gain, Q and frequency share the three lower fields. The display reuses
  // makeEqPlot's parameter-derived RBJ response, without a fabricated spectrum.
  // Output-only bands 5/6 and tilt remain in the renderer's additional controls.
  const wingBands=['l','1','2','3','4','h'];
  const wingEq={sourcePage:28,skin:'wing-eq',width:1000,height:550,
    background:'#080a0c',foreground:'#d4d8dc',
    regions:[
      {x:12,y:12,width:976,height:54,fill:'#1b1d20',stroke:'#41474b',radius:1},
      {x:12,y:80,width:805,height:377,fill:'#030506',stroke:'#333b3e',radius:1},
      {x:833,y:80,width:154,height:451,fill:'#202326',stroke:'#42484c',radius:1},
      {x:12,y:468,width:805,height:63,fill:'#101418',stroke:'#323a40',radius:1}
    ],
    power:{x:59,y:39,size:64,label:'EQ'},
    labels:[caption('EQ MODEL',139,27,11,{align:'left',color:'#aeb6bc'}),caption('WING EQ',139,48,19,{align:'left'}),caption('PARAMETRIC EQUALIZER',699,40,12,{color:'#aeb6bc'})],
    displays:[{kind:'parametric-eq',x:18,y:86,width:793,height:370,label:'EQ · RISPOSTA DI RIFERIMENTO'}],
    controlGroups:wingBands.map(id=>({id,label:id.toUpperCase()})),
    groupSelector:{x:843,y:89,width:134,height:330},defaultGroup:'1',
    controls:[
      ...wingBands.flatMap(group=>[
        {key:group+'g',group,x:210,y:497,width:160,height:56,size:160,kind:'digital',label:'GAIN'},
        {key:group+'q',group,x:440,y:497,width:160,height:56,size:160,kind:'digital',label:'Q'},
        {key:group+'f',group,x:680,y:497,width:160,height:56,size:160,kind:'digital',label:'FREQ'}
      ]),
      {key:'leq',group:'l',x:915,y:465,width:140,height:56,size:140,kind:'digital',label:'LOW SHAPE'},
      {key:'heq',group:'h',x:915,y:465,width:140,height:56,size:140,kind:'digital',label:'HIGH SHAPE'}
    ]};
  const definitions={'eq:STD':wingEq,SOUL:soul,'eq:E88':even88,'fx_channel_eq:E88':even88,E84:even84,F110:fortissimo};
  root.SculptOriginalLayouts=Object.assign(root.SculptOriginalLayouts||{},definitions);
  if(typeof module!=='undefined'&&module.exports)module.exports=definitions;
})(typeof window!=='undefined'?window:globalThis);
