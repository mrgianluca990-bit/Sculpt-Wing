import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(root, '../dist');
const out = resolve(root, 'dist');
await build({entryPoints:[resolve(root,'src/live-entry.ts')],bundle:true,format:'iife',
  platform:'browser',target:'safari15',outfile:resolve(web,'native-bridge.js'),minify:true,
  legalComments:'eof',logLevel:'warning'});
// Both PDF.js entry points are shipped with the app. An explicit module Worker
// port lets the renderer run under sculpt://app with worker-src 'self' and no
// network permission, blob wrapper, CDN or Node API in the browser bundle.
const pdfEntry=resolve(root,'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const pdfNotice=(await readFile(pdfEntry,'utf8')).match(/^\/\*\*[\s\S]*?\*\//)?.[0];
if(!pdfNotice?.includes('Mozilla Foundation'))throw new Error('PDF.js copyright notice not found');
const pdfBuild={bundle:true,platform:'browser',target:'safari15',minify:true,
  define:{process:'undefined'},banner:{js:pdfNotice},legalComments:'eof',logLevel:'warning'};
await build({...pdfBuild,entryPoints:[resolve(root,'src/pdf-reader.mjs')],format:'iife',
  outfile:resolve(web,'pdf-reader.js')});
await build({...pdfBuild,entryPoints:[resolve(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')],format:'esm',
  outfile:resolve(web,'pdf.worker.js')});
await cp(resolve(root,'node_modules/pdfjs-dist/LICENSE'),resolve(web,'LICENSE-PDFJS.txt'));
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await cp(web,out,{recursive:true,filter:source=>!source.endsWith('.zip')&&!source.split('/').at(-1).startsWith('qa-')});
let html = await readFile(resolve(out,'index.html'),'utf8');
html = html.replace('<html lang="it">','<html lang="it" data-native-bundle="true">');
await writeFile(resolve(out,'index.html'),html);
// The Xcode project can be opened without Node. Include its web bundle here.
const embedded = resolve(root,'ios/App/App/public');
await rm(embedded,{recursive:true,force:true});
await cp(out,embedded,{recursive:true});
await writeFile(resolve(root,'ios/App/App/capacitor.config.json'),JSON.stringify({
  appId:'it.sculpt.control',appName:'Sculpt Wing',webDir:'dist',
  ios:{contentInset:'never',preferredContentMode:'mobile'},
  packageClassList:[]
},null,2));
console.log('Sculpt Wing: bundle app e lettore PDF locale aggiornati.');
