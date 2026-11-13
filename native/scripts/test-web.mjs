import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const native=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=resolve(native,'..');
const files=readdirSync(resolve(root,'tests')).filter(name=>name.endsWith('.test.cjs')).map(name=>`tests/${name}`);
for(const args of [['--test','model.test.cjs',...files],['tests/editor.integration.test.js']]){
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,NODE_PATH:resolve(native,'node_modules')}});
  if(result.status!==0)process.exit(result.status||1);
}
