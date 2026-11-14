'use strict';

const dgram=require('node:dgram');

// One bounded UDP request per socket; no background connection or second app.
class OSCSender {
  constructor({protocol,createSocket=()=>dgram.createSocket('udp4'),timeout=1500,now=Date.now}={}){
    if(!protocol?.normalizeRequest||!protocol?.encode||!protocol?.decodeShowReply)throw new Error('Protocollo OSC non disponibile.');
    this.protocol=protocol;this.createSocket=createSocket;this.timeout=timeout;this.now=now;this.pending=new Set();this.windowStart=0;this.windowCount=0;
  }
  async send(value){
    const request=this.protocol.normalizeRequest(value),bytes=Buffer.from(this.protocol.encode(request));
    if(this.pending.size>=8)throw new Error('Troppi invii OSC in corso.');
    const now=this.now();if(now-this.windowStart>=1000){this.windowStart=now;this.windowCount=0;}
    if(++this.windowCount>100)throw new Error('Limite invii OSC raggiunto; riprova fra un secondo.');
    const socket=this.createSocket();
    return new Promise((resolve,reject)=>{
      let done=false,timer;
      const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);this.pending.delete(cancel);socket.removeListener('message',message);try{socket.close();}catch{}if(error)reject(error);else resolve(result);};
      const cancel=()=>finish(new Error('Invio OSC interrotto dalla chiusura o sospensione dell’app.'));
      const summary={sent:true,confirmed:false,host:request.host,port:request.port,address:request.address,bytes:bytes.length};
      const message=(packet,peer)=>{
        if(peer.address!==request.host||peer.port!==request.port)return;
        try{const status=this.protocol.decodeShowReply(packet);finish(null,{...summary,confirmed:true,status});}catch(error){finish(error);}
      };
      this.pending.add(cancel);
      socket.on('error',error=>finish(new Error('Invio OSC non riuscito: '+error.message)));
      if(request.expectReply==='show-status')socket.on('message',message);
      timer=setTimeout(()=>finish(new Error(request.expectReply?'Sculpt Show non risponde: verifica OSC attivo, indirizzo e porta.':'Tempo massimo di invio OSC superato.')),this.timeout);
      try{socket.send(bytes,request.port,request.host,error=>{if(error)finish(error);else if(!request.expectReply)finish(null,summary);});}catch(error){finish(error);}
    });
  }
  close(){for(const cancel of [...this.pending])cancel();}
  suspend(){this.close();}
}

module.exports={OSCSender};
