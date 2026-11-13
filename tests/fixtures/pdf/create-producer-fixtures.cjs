/* Reproduce fixtures using the unmodified Sculpt Production exporter.
 * node create-producer-fixtures.cjs PRODUCER_CHECKOUT DEPENDENCY_DIRECTORY
 * Dependency directory requires jspdf@4.2.1, jspdf-autotable@5.0.9 and esbuild.
 * Producer source audited at e69d65b7a5bf1e4aa063f6d3c90b7fde6537568a.
 * Only synthetic data is used; no Production application state is read.
 */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createRequire}=require('node:module');
async function main(){
  const producer=path.resolve(process.argv[2]||''),deps=path.resolve(process.argv[3]||'');
  if(!process.argv[2]||!process.argv[3])throw new Error('Pass Producer checkout and a directory with fixture dependencies.');
  const req=createRequire(path.join(deps,'package.json'));
  const esbuild=req('esbuild');
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'sculpt-production-fixture-'));
  try{
    const entry=`export {createProductionPdf} from ${JSON.stringify(path.join(producer,'lib/production-pdf.ts'))}; export {emptyWorkspace,makeEvent} from ${JSON.stringify(path.join(producer,'lib/production.ts'))};`;
    const bundle=path.join(scratch,'exporter.cjs');
    await esbuild.build({stdin:{contents:entry,resolveDir:producer,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,alias:{jspdf:req.resolve('jspdf'),'jspdf-autotable':req.resolve('jspdf-autotable')}});
    const {createProductionPdf,emptyWorkspace,makeEvent}=require(bundle);
    const data=emptyWorkspace(),event=makeEvent('Prova importazione Wing');
    Object.assign(event,{id:'fixture-event',client:'Evento sintetico',clientEmail:'',venue:'Palco di prova',start:'2026-11-13',end:'2026-11-13',eventDate:'2026-11-13',startTime:'21:00',endTime:'23:00'});
    Object.assign(event.quote,{number:'TEST-001',issuedAt:'2026-11-13',validUntil:'2026-11-30',lines:[{id:'fixture-quote',description:'Servizio audio sintetico',quantity:1,days:1,unitPrice:100,kind:'service'}]});
    const long='Pianoforte acustico con nome deliberatamente lungo';
    const names=['Kick','Snare up','Snare down','tom1','tom2','tom3','Over L','Over R','Basso','Chitarra 1','Chitarra 2','Key L · Tastiere Nord','Key R · Tastiere Nord',`Piano L · ${long}`,`Piano R · ${long}`,`Piano Buca · ${long}`,'Voce 1','Voce 2','Sequenze L','Sequenze R','Click'];
    event.channels=names.map((source,index)=>({id:`fixture-ch-${index+1}`,number:index+1,source,inputType:/^(?:Basso|Key |Sequenze|Click)/.test(source)?'di':'mic',mic:'',phantom:false,stand:index<8?'Asta corta':'Asta alta',patch:'',monitor:'',notes:index===13?'Nota lunga su più righe: questo testo serve a verificare che il parser conservi soltanto la sorgente, senza confonderla con la ripresa, l’asta o le note.':''}));
    event.outputs=[
      {id:'out-1',number:1,destination:'Batteria',side:'mono',patch:'',notes:'Monitor principale batteria'},
      {id:'out-2',number:2,destination:'Basso',side:'mono',patch:'',notes:''},
      {id:'out-3',number:3,destination:'IEM Tastiere Nord',side:'L',patch:'',notes:'Coppia stereo'},
      {id:'out-4',number:4,destination:'IEM Tastiere Nord',side:'R',patch:'',notes:'Coppia stereo'},
      {id:'out-7',number:7,destination:'Monitor voce con destinazione molto lunga su due righe',side:'mono',patch:'',notes:'Numero personalizzato; non indica il patch WING'}
    ];
    data.events=[event];
    globalThis.fetch=async url=>{
      if(!/^\/fonts\/LiberationSans-(?:Regular|Bold)\.ttf$/.test(String(url)))throw new Error('Unexpected fixture fetch: '+url);
      return new Response(await fs.readFile(path.join(producer,'public',String(url))));
    };
    const stageImage={dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAA8CAIAAAAfXYiZAAAA4ElEQVR4nO3ZwQqCQBRAUSf8/1+2nRQEecCYrHtWES304lOnGdu2LTnmNvsArqRYYN0/jTEmHsc32+9U68tvs3u8hhpDUCxQLLC+/8kn6VNl7l11cqxFzn/687oxBMUCxQLFAsUCxQLFAsUCxQLFAsUCxQLzF9LTl8fHTY51rT+yG0NQLFAsUCxQLFAsUCxQLFAsUCxQLFAsUCxQLFAsUCxQLFAsUCxQLFAsYLs7F9q2Ou74DpPFutbO1ekaQ1AsUCxQLFAsUCxQLFAsUCzw9Ab/k6uZE40/X8GQxhAUC9wBqncbg+GKlJ8AAAAASUVORK5CYII=',width:100,height:60};
    for(const [kind,filename]of [['channels','producer-channel-list.pdf'],['complete','producer-complete.pdf']]){
      const {blob}=await createProductionPdf({data,event,kind,stageImage});
      const target=path.join(__dirname,filename);
      await fs.writeFile(target,Buffer.from(await blob.arrayBuffer()));
      console.log(filename,blob.size);
    }
    await fs.writeFile(path.join(__dirname,'producer-expected.json'),JSON.stringify({producerCommit:'e69d65b7a5bf1e4aa063f6d3c90b7fde6537568a',channelNames:names,outputs:event.outputs.map(({number,destination,side})=>({number,destination,side}))},null,2)+'\n');
  }finally{await fs.rm(scratch,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
