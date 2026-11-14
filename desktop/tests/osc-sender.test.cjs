'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const dgram=require('node:dgram');
const {EventEmitter}=require('node:events');
const protocol=require('../../dist/osc.js');
const {OSCSender}=require('../src/osc-sender.cjs');
const request=(address='/sculpt/go',args=[])=>({host:'127.0.0.1',port:53000,address,args});
async function server(t){
  const socket=dgram.createSocket('udp4');await new Promise((resolve,reject)=>{socket.once('error',reject);socket.bind(0,'127.0.0.1',resolve);});
  t.after(()=>{try{socket.close();}catch{}});return socket;
}

test('OSC encoder writes network-endian typed arguments and padded UTF-8 strings',()=>{
  const bytes=Buffer.from(protocol.encode(request('/test',[{type:'i',value:-7},{type:'f',value:.5},{type:'s',value:'Città'},{type:'T'},{type:'F'}])));
  assert.equal(bytes.subarray(0,8).toString('hex'),'2f74657374000000');
  assert.equal(bytes.subarray(8,16).toString('hex'),'2c69667354460000');
  assert.equal(bytes.readInt32BE(16),-7);assert.equal(bytes.readFloatBE(20),.5);
  assert.equal(bytes.subarray(24).toString('hex'),'43697474c3a00000');assert.equal(bytes.length,32);
});

test('invalid OSC requests fail before any socket is created',async()=>{
  let opened=0;const sender=new OSCSender({protocol,createSocket:()=>{opened++;throw new Error('must not open');}});
  const bad=[{host:'224.0.0.1'},{host:'999.1.1.1'},{host:'1.2.3.255'},{host:'example.com'},{port:0},{port:65536},{address:'/sculpt/*'},{address:'/x\0bad'},{args:[{type:'i',value:2147483648}]},{args:[{type:'i',value:1.5}]},{args:[{type:'f',value:1e39}]},{args:[{type:'f',value:' '}]},{args:[{type:'s',value:'bad\0string'}]},{args:[{type:'b',value:1}]},{args:Array(33).fill({type:'T'})},{args:Array(5).fill({type:'s',value:'a'.repeat(4096)})},{expectReply:'show-status',address:'/sculpt/go'}];
  for(const patch of bad)await assert.rejects(sender.send({...request(),...patch}));assert.equal(opened,0);
});

test('OSC sends a real datagram over loopback and reports transport delivery without execution acknowledgement',{timeout:3000},async t=>{
  const socket=await server(t),sender=new OSCSender({protocol});t.after(()=>sender.close());
  const incoming=new Promise(resolve=>socket.once('message',(bytes,peer)=>resolve({bytes,peer})));
  const message={...request('/sculpt/stopAll'),port:socket.address().port};const result=await sender.send(message),received=await incoming;
  assert.deepEqual(received.bytes,Buffer.from(protocol.encode(message)));assert.equal(received.peer.address,'127.0.0.1');assert.equal(result.sent,true);assert.equal(result.confirmed,false);assert.equal(sender.pending.size,0);
});

test('Show status requires a valid OSC reply from the selected endpoint',{timeout:3000},async t=>{
  const socket=await server(t),sender=new OSCSender({protocol});t.after(()=>sender.close());
  socket.once('message',(bytes,peer)=>{
    assert.deepEqual(bytes,Buffer.from(protocol.encode({...request('/sculpt/status'),port:socket.address().port,expectReply:'show-status'})));
    const state={show:'Città in musica',selectedCue:'cue-id',selectedList:'list-id',active:[{id:'a'}],audioReady:true};
    const reply=Buffer.from(protocol.encode(request('/sculpt/status',[{type:'s',value:JSON.stringify(state)}])));socket.send(reply,peer.port,peer.address);
  });
  const result=await sender.send({...request('/sculpt/status'),port:socket.address().port,expectReply:'show-status'});
  assert.equal(result.confirmed,true);assert.equal(result.status.show,'Città in musica');assert.equal(result.status.activeCount,1);assert.equal(result.status.audioReady,true);
});

test('Show timeout is an error and closes its pending socket',{timeout:3000},async t=>{
  const socket=await server(t),sender=new OSCSender({protocol,timeout:40});
  await assert.rejects(sender.send({...request('/sculpt/status'),port:socket.address().port,expectReply:'show-status'}),/non risponde/);assert.equal(sender.pending.size,0);
});

test('foreign UDP replies are ignored and app suspension cancels the request',{timeout:3000},async()=>{
  let socket;class FakeSocket extends EventEmitter{send(_bytes,_port,_host,callback){callback();}close(){this.closed=true;}}
  const sender=new OSCSender({protocol,createSocket:()=>socket=new FakeSocket(),timeout:500});
  const result=sender.send({...request('/sculpt/status'),expectReply:'show-status'});
  socket.emit('message',Buffer.from('bogus'),{address:'127.0.0.2',port:53000});
  assert.equal(sender.pending.size,1);socket.emit('message',Buffer.from('bogus'),{address:'127.0.0.1',port:53001});assert.equal(sender.pending.size,1);
  sender.suspend();await assert.rejects(result,/interrotto/);assert.equal(socket.closed,true);assert.equal(sender.pending.size,0);
});

test('Show rejects errors and malformed status instead of marking transport delivery as confirmed',()=>{
  const packet=(address,value)=>protocol.encode(request(address,[{type:'s',value}]));
  assert.throws(()=>protocol.decodeShowReply(packet('/sculpt/error','Unknown cue')),/Unknown cue/);
  assert.throws(()=>protocol.decodeShowReply(packet('/sculpt/status','{}')),/incompleto/);
  assert.throws(()=>protocol.decodeShowReply(packet('/other','{}')),/diversa/);
  const good=packet('/sculpt/status',JSON.stringify({show:'Test',selectedCue:'',selectedList:'',active:[],audioReady:false}));
  assert.equal(protocol.decodeShowReply(good).audioReady,false);assert.throws(()=>protocol.decodeShowReply(good.slice(0,-1)));
});

test('OSC sender bounds burst rate and concurrent requests',{timeout:3000},async()=>{
  class FakeSocket extends EventEmitter{send(_bytes,_port,_host,callback){callback();}close(){}}
  let opened=0;const sender=new OSCSender({protocol,createSocket:()=>{opened++;return new FakeSocket();},now:()=>1000});
  for(let i=0;i<100;i++)await sender.send(request());await assert.rejects(sender.send(request()),/Limite/);assert.equal(opened,100);
  const pending=new OSCSender({protocol,createSocket:()=>new FakeSocket(),timeout:500});
  const results=Array.from({length:8},()=>pending.send({...request('/sculpt/status'),expectReply:'show-status'}).catch(e=>e));
  await assert.rejects(pending.send(request()),/Troppi/);pending.close();assert((await Promise.all(results)).every(result=>result instanceof Error));
});
