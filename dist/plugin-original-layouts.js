/* Control geometry redrawn from Behringer WING Effects Guide v3.0.
 * Coordinates refer to the rack face, not to a photograph or an audio simulation.
 * Parameters outside the pictured face remain available below it. */
(function(root){
  'use strict';
  const knob=(key,x,y,size=68,label,extra={})=>({key,x,y,size,label,kind:'knob',...extra});
  const definitions={
    '76LA':{sourcePage:32,skin:'fet',width:1000,height:310,
      controls:[knob('in',140,153,108,'INPUT',{labelPosition:'below',hideValue:true,scale:['−48','−42','−36','−30','−24','−18','−12','−6','0']}),knob('out',340,153,108,'OUTPUT',{labelPosition:'below',hideValue:true,scale:['−48','−42','−36','−30','−24','−18','−12','−6','0']}),knob('att',535,91,66,'ATTACK',{labelPosition:'below',hideValue:true,scale:['1','3','5','7']}),knob('rel',535,225,66,'RELEASE',{labelPosition:'below',hideValue:true,scale:['1','3','5','7']}),{key:'ratio',x:659,y:155,size:68,height:215,label:'RATIO',kind:'buttons',variant:'ratio-column',order:['20','12','8','4','ALL']}],
      meters:[{x:721,y:60,width:230,height:170,label:'dB',ticks:'−20    −10    −7    −5    −3    −1    0'}],labels:[{text:'76 LIMITING AMPLIFIER',x:724,y:268,size:15,align:'left'}]},
    LA:{sourcePage:32,skin:'opto',width:1000,height:310,
      power:{x:885,y:180,size:70,label:'POWER'},
      controls:[{key:'mode',x:87,y:180,size:92,kind:'buttons',label:'LIMIT / COMPRESS',order:['lim','comp']},knob('ingain',265,173,116,'GAIN',{labelPosition:'below',hideValue:true,scale:['0','20','40','60','80','100']}),knob('peak',750,173,116,'PEAK REDUCTION',{labelPosition:'below',hideValue:true,scale:['0','20','40','60','80','100']})],
      meters:[{x:400,y:65,width:236,height:180,label:'DECIBELS'}],labels:[{text:'LEVELING AMPLIFIER',x:44,y:39,size:18,color:'#a14328',align:'left'},{text:'MODEL 2A',x:255,y:61,size:15,align:'left'}]},
    SBUS:{sourcePage:31,skin:'soul-bus',width:1000,height:310,
      controls:[knob('att',509,92,74,'ATTACK',{color:'#19a7e3'}),knob('rel',700,92,74,'RELEASE',{color:'#19a7e3'}),knob('ratio',881,92,74,'RATIO',{color:'#19a7e3'}),knob('thr',509,226,74,'THRESHOLD',{color:'#19a7e3'}),knob('gain',700,226,74,'MAKEUP',{color:'#19a7e3'})],
      meters:[{x:123,y:34,width:230,height:180,label:'COMPRESSION',dark:true}],labels:[{text:'SOUL G',x:238,y:234,size:28},{text:'Bus Compressor',x:238,y:264,size:16}]},
    F670:{sourcePage:32,skin:'fairkid',width:1000,height:310,
      controls:[knob('gain',480,141,72,'OUT GAIN'),knob('in',618,141,87,'INPUT GAIN'),knob('thr',772,141,87,'THRESHOLD'),knob('time',924,141,66,'TIME CONSTANT',{scale:['1','2','3','4','5','6']}),knob('bias',547,260,34,'DC BIAS')],
      meters:[{x:108,y:44,width:250,height:216,label:'DECIBELS'}],labels:[{text:'FAIRKID',x:869,y:253,size:32,color:'#db4c35'},{text:'MODEL 670',x:869,y:284,size:12}]},
    PULSAR:{sourcePage:21,skin:'pulsar',width:1200,height:365,
      controls:[knob('5lf',227,109,50,'LO-MID FREQ'),knob('5mf',348,109,50,'MID FREQ'),knob('5hf',469,109,50,'HI-MID FREQ'),knob('5lb',227,270,64,'LO-MID BOOST'),knob('5md',348,270,64,'MID DIP'),knob('5hb',469,270,64,'HI-MID BOOST'),{key:'eq5',x:61,y:270,size:60,label:'MID EQ5',kind:'switch'},knob('1latt',623,109,67,'LO ATT'),knob('1lf',744,109,50,'LO FREQ'),knob('1hw',865,109,67,'HI WIDTH'),knob('1hf',986,109,50,'HI FREQ'),knob('1hatt',1107,109,67,'HI ATT'),{key:'eq1',x:590,y:270,size:61,label:'HI-LO EQ1',kind:'switch'},knob('1lb',744,270,64,'LOW BOOST'),knob('1hb',925,270,64,'HI BOOST'),knob('1hattf',1107,270,50,'HI-ATT FREQ')],
      labels:[{text:'PULSAR EQ',x:24,y:53,size:25,align:'left'},{text:'P1a / M5',x:24,y:83,size:21,align:'left'}]},
    MACH4:{sourcePage:21,skin:'mach',width:1000,height:310,
      controls:[knob('sub',156,100,77,'SUB',{color:'#383c39'}),knob('160',389,100,77,'160 Hz',{color:'#1caa20'}),knob('2k5',622,100,77,'2.5 kHz',{color:'#f26428'}),knob('airm',855,100,77,'AIR FREQ',{color:'#05a7ef'}),knob('40',273,240,77,'40 Hz',{color:'#04a9ec'}),knob('650',506,240,77,'650 Hz',{color:'#ef1c27'}),knob('air',739,240,77,'AIR GAIN',{color:'#eee829'}),{key:'again',x:935,y:247,size:45,label:'AUTO',kind:'switch'}],
      labels:[{text:'EQ4',x:29,y:41,size:28,align:'left'},{text:'mach',x:969,y:41,size:28,align:'right'}]},
    VSS3:{sourcePage:6,skin:'vss3',width:1100,height:340,
      controls:[{key:'erpdly',x:104,y:184,size:68,height:216,label:'EARLY DELAY',kind:'fader'},{key:'rvpdly',x:218,y:184,size:68,height:216,label:'REV DELAY',kind:'fader'},{key:'dcy',x:332,y:184,size:68,height:216,label:'DECAY',kind:'fader'},{key:'erlvl',x:446,y:184,size:68,height:216,label:'EARLY LEVEL',kind:'fader'},{key:'rvlvl',x:560,y:184,size:68,height:216,label:'REV LEVEL',kind:'fader'},{key:'diff',x:674,y:184,size:68,height:216,label:'DIFFUSION',kind:'fader'},{key:'preset',x:895,y:178,size:278,height:266,label:'PRESET',kind:'preset'},{key:'load',x:1040,y:308,size:72,label:'',kind:'switch'},{key:'view',x:1040,y:31,size:72,label:'VIEW',kind:'switch'}],
      labels:[{text:'tc electronic',x:39,y:27,size:22,align:'left'},{text:'VSS3 · REMOTE SYSTEM',x:196,y:29,size:10,align:'left'}]}
  };
  root.SculptOriginalLayouts=Object.assign(root.SculptOriginalLayouts||{},definitions);
  if(typeof module!=='undefined'&&module.exports)module.exports=definitions;
})(typeof window!=='undefined'?window:globalThis);
