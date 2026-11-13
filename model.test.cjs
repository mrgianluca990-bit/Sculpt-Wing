const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('./dist/model.js');

test('WING strip families and legal send directions',()=>{
  const state=M.defaults();
  assert.equal(state.inputs.length,48);assert.equal(state.outputs.length,28);
  assert.deepEqual(Object.fromEntries(['CH','AUX','BUS','MTX','MAIN'].map(kind=>[kind,M.list(state).filter(s=>s.kind===kind).length])),{CH:40,AUX:8,BUS:16,MTX:8,MAIN:4});
  const route=(s,t)=>M.canRoute(M.find(state,s),M.find(state,t));
  for(const pair of [['ch-1','bus-1'],['aux-8','mtx-8'],['ch-40','main-4'],['bus-1','bus-2'],['bus-16','main-2'],['main-4','mtx-2']])assert.equal(route(...pair),true,pair.join(' → '));
  for(const pair of [['bus-1','bus-1'],['main-1','bus-2'],['main-1','main-2'],['mtx-1','mtx-2'],['mtx-1','bus-1'],['ch-1','ch-2']])assert.equal(route(...pair),false,pair.join(' → '));
});

test('legacy output AUX migrate into BUS without becoming new AUX inputs',()=>{
  const legacy={version:2,selected:'aux-15',values:{'aux-1':{level:-2.3,mute:true},'aux-15':{level:3,mute:true},'ch-3':{level:-7.4,mute:true},'mtx-4':{level:-11.5,mute:true}}};
  const state=M.restore(null,legacy);
  assert.equal(M.find(state,'bus-1').level,-2.3);assert.equal(M.find(state,'bus-1').mute,true);
  assert.equal(M.find(state,'aux-1').level,-12);assert.equal(M.find(state,'aux-1').mute,false);
  assert.equal(state.selected,'bus-15');assert.equal(M.find(state,'ch-3').level,-7.4);assert.equal(M.find(state,'mtx-4').level,-11.5);
});

test('SOF preserves master levels/mutes and independent destination sends',()=>{
  const state=M.defaults();const channel=M.find(state,'ch-1'),bus=M.find(state,'bus-2');
  channel.mute=true;const original={channel:channel.level,bus:bus.level};
  M.setSof(state,'bus-1');M.setSend(state,'ch-1','bus-1',{level:-9.2,on:true});M.setSend(state,'bus-2','bus-1',{level:-21,on:true});
  assert.equal(M.display(state,'ch-1').level,-9.2);assert.equal(M.display(state,'bus-2').level,-21);
  assert.equal(M.display(state,'bus-1').send,false);assert.equal(channel.mute,true);
  M.setSof(state,'mtx-2');M.setSend(state,'ch-1','mtx-2',{level:-17,on:false});
  assert.equal(M.display(state,'ch-1').level,-17);assert.equal(M.display(state,'main-1').send,true);assert.equal(M.display(state,'mtx-1').send,false);
  M.setSof(state,null);assert.equal(M.display(state,'ch-1').level,original.channel);assert.equal(M.display(state,'bus-2').level,original.bus);assert.equal(channel.mute,true);
  assert.equal(M.getSend(state,'ch-1','bus-1').level,-9.2);assert.equal(M.getSend(state,'ch-1','mtx-2').level,-17);
});

test('round trip stores editor and sends but never reopens in SOF mode',()=>{
  const state=M.defaults(),strip=M.find(state,'aux-8');
  M.patchStrip(strip,{name:'Ritorno playback',pan:17,trim:-3,eq:{bands:[{freq:90,gain:-2,q:1.3}]},dynamics:{compEnabled:true,threshold:-25}});
  M.setSend(state,'aux-8','bus-4',{level:-6.8,on:true,pre:false,pan:25,panLink:false,tap:'AFL',followMute:false});M.setSof(state,'bus-4');
  const restored=M.restore(JSON.parse(JSON.stringify(M.serialize(state))),null);
  assert.equal(restored.sof,null);assert.equal(M.find(restored,'aux-8').name,'Ritorno playback');assert.equal(M.find(restored,'aux-8').eq.bands[0].gain,-2);
  assert.equal(M.find(restored,'aux-8').eq.bands.length,6);assert.deepEqual(M.getSend(restored,'aux-8','bus-4'),{level:-6.8,on:true,pre:false,pan:25,panLink:false,tap:'AFL',followMute:false,mode:'POST'});
});

test('invalid values and unsupported AUX gate/filter do not corrupt state',()=>{
  const state=M.defaults(),aux=M.find(state,'aux-1');
  M.patchStrip(aux,{level:Infinity,pan:1000,hpfEnabled:true,hpf:200,dynamics:{gateEnabled:true,gateThreshold:-20,ratio:99},eq:{bands:[{freq:90000,gain:-99,q:0}]}});
  assert.equal(aux.level,-12);assert.equal(aux.pan,100);assert.equal(aux.hpfEnabled,false);assert.equal(aux.dynamics.gateEnabled,false);assert.equal(aux.dynamics.ratio,20);
  assert.deepEqual(aux.eq.bands[0],{freq:20000,gain:-15,q:.3});
  assert.equal(M.setSend(state,'mtx-1','bus-1',{level:0,on:true}),false);
  assert.equal(M.setSof(state,'main-1'),false);assert.equal(state.sof,null);
});
