import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = await readFile(resolve(root, 'dist/index.html'), 'utf8');
const scriptPath = index.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)?.[1];
const cssPaths = [...index.matchAll(/<link[^>]+href="([^"]+\.css)"[^>]*>/g)].map(match => match[1]);
if (!scriptPath || !cssPaths.length) throw new Error('Esegui prima npm run build.');
const js = await readFile(resolve(root, 'dist', scriptPath.replace(/^\//, '')), 'utf8');
const css = (await Promise.all(cssPaths.map(path => readFile(resolve(root, 'dist', path.replace(/^\//, '')), 'utf8')))).join('\n');
const icon = await readFile(resolve(root, 'public/icon.svg'));
let html = index
  .replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/, '')
  .replace(/<link[^>]+href="[^"]+\.css"[^>]*>/g, '')
  .replace('href="/icon.svg"', `href="data:image/svg+xml;base64,${icon.toString('base64')}"`)
  .replace('</head>', `<style>${css.replace(/<\/style/gi, '<\\/style')}</style></head>`)
  .replace('</body>', `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script></body>`);
html = html.replace('<title>Sculpt Wing</title>', '<title>Sculpt Wing · demo senza mixer</title>');
await writeFile(resolve(root, 'Sculpt-Wing-Demo.html'), html);
console.log('Sculpt-Wing-Demo.html creato: interfaccia autonoma, collegamento hardware disabilitato nel browser.');
