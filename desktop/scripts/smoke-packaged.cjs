'use strict';
// Run on the Mac runner against the packaged executable. Uses only Node 22
// builtins and the real renderer; no WING connection or audio command is sent.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP_URL = 'sculpt://app/index.html';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function bounded(promise, milliseconds, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
function loopbackEndpoint(value, expectedPort) {
  const url = new URL(value);
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || !/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535
      || url.username || url.password || expectedPort && url.port !== expectedPort
      || !url.pathname.startsWith('/devtools/')) throw new Error(`CDP endpoint non valido: ${value}`);
  return url;
}

async function connectCdp(address, label, timeout) {
  const socket = new WebSocket(address), pending = new Map(), listeners = new Set();
  let sequence = 0, closed = false;
  const fail = error => {
    closed = true;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear();
  };
  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); }
    catch { fail(new Error(`${label}: risposta CDP non valida`)); return; }
    if (message.id !== undefined) {
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message}`));
      else item.resolve(message.result || {});
    } else for (const listener of listeners) listener(message.method, message.params || {});
  });
  socket.addEventListener('close', () => fail(new Error(`${label}: connessione CDP chiusa`)));
  socket.addEventListener('error', () => fail(new Error(`${label}: errore WebSocket CDP`)));
  try {
    await bounded(new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error(`${label}: CDP non raggiungibile`)), { once: true });
      socket.addEventListener('close', () => reject(new Error(`${label}: CDP chiuso prima dell'apertura`)), { once: true });
    }), timeout, `apertura CDP ${label}`);
  } catch (error) { socket.close(); throw error; }
  return {
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    send(method, params = {}, milliseconds = 5000) {
      if (closed || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error(`${label}: CDP non collegato`));
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout CDP: ${method}`)); }, milliseconds);
        pending.set(id, { resolve, reject, timer, method });
        try { socket.send(JSON.stringify({ id, method, params })); }
        catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
      });
    },
    close() { fail(new Error(`${label}: smoke concluso`)); socket.close(); }
  };
}

async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: node smoke-packaged.cjs <packaged-app/Contents/MacOS/executable>');
  if (process.platform !== 'darwin') throw new Error('Lo smoke del bundle richiede macOS; non è una prova simulata.');
  if (typeof fetch !== 'function' || typeof WebSocket !== 'function') throw new Error('Sono richiesti fetch e WebSocket integrati di Node 22.');
  const executable = await fs.realpath(path.resolve(process.argv[2]));
  await fs.access(executable, constants.X_OK);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'sculpt-packaged-smoke-'));
  const deadline = Date.now() + 35000, problems = [], requests = new Map();
  let child, exit, spawnError, browser, renderer, endpoint, output = '', stopping = false, interrupted, result, failure;
  let requestedTermination = false, forcedTermination = false, monitor = false;
  const workTime = () => Math.max(1, Math.min(5000, deadline - Date.now()));
  const problem = text => { if (problems.length < 20) problems.push(String(text).slice(0, 1500)); };
  const groupAlive = () => {
    if (!child?.pid) return false;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  };
  const terminateGroup = signal => {
    if (!child?.pid) return;
    try { process.kill(-child.pid, signal); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  const check = () => {
    if (interrupted) throw interrupted;
    if (spawnError) throw spawnError;
    if (exit && !stopping) throw new Error(`Electron è terminato prima dello smoke: code=${exit.code}, signal=${exit.signal}`);
    if (problems.length) throw new Error(problems.join('\n'));
    if (Date.now() >= deadline) throw new Error('Timeout di 35 s: renderer/CDP o viste del canale non verificati.');
  };
  async function until(label, inspect) {
    while (Date.now() < deadline) {
      check(); const value = await inspect(); check();
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`Timeout: ${label}`);
  }
  const onSignal = signal => { interrupted = new Error(`Smoke interrotto da ${signal}`); };
  const sigint = () => onSignal('SIGINT'), sigterm = () => onSignal('SIGTERM');
  process.on('SIGINT', sigint); process.on('SIGTERM', sigterm);
  const hardStop = setTimeout(() => {
    interrupted = new Error('Timeout totale di 45 s: chiusura del solo gruppo processi dello smoke.');
    forcedTermination = true;
    try { terminateGroup('SIGKILL'); } catch (error) { problem(error.message); }
  }, 45000);
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    child = spawn(executable, [
      `--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0', '--enable-logging'
    ], { detached: true, cwd: path.dirname(executable), env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', error => { spawnError = new Error(`Avvio bundle fallito: ${error.message}`); });
    child.on('exit', (code, signal) => { exit = { code, signal }; });
    const collect = chunk => {
      output = (output + chunk.toString('utf8')).slice(-24000);
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) endpoint = match[1];
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);

    const browserUrl = await until('endpoint CDP del processo Electron', async () => {
      if (!endpoint) {
        try {
          const [port, resource] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
          if (/^\d+$/.test(port) && resource?.startsWith('/devtools/browser/')) endpoint = `ws://127.0.0.1:${port}${resource}`;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return endpoint ? loopbackEndpoint(endpoint) : null;
    });
    const base = `http://127.0.0.1:${browserUrl.port}`;
    async function readJson(resource) {
      const response = await fetch(base + resource, { signal: AbortSignal.timeout(Math.min(1500, workTime())), redirect: 'error' });
      if (!response.ok) throw new Error(`CDP ${resource}: HTTP ${response.status}`);
      return response.json();
    }
    const version = await readJson('/json/version');
    assert.equal(loopbackEndpoint(version.webSocketDebuggerUrl, browserUrl.port).href, browserUrl.href, 'CDP deve appartenere al bundle appena avviato');
    browser = await connectCdp(browserUrl.href, 'browser', workTime());
    await browser.send('Browser.getVersion', {}, workTime());
    const target = await until('renderer sculpt://app', async () => {
      const targets = await readJson('/json/list');
      return targets.find(item => item.type === 'page' && item.url === APP_URL && item.webSocketDebuggerUrl);
    });
    renderer = await connectCdp(loopbackEndpoint(target.webSocketDebuggerUrl, browserUrl.port).href, 'renderer', workTime());
    let loadCount = 0;
    renderer.on((method, params) => {
      if (method === 'Page.loadEventFired') loadCount++;
      if (!monitor) return;
      if (method === 'Runtime.exceptionThrown') problem(`Eccezione renderer: ${params.exceptionDetails?.exception?.description || params.exceptionDetails?.text}`);
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') problem(`Console renderer: ${(params.args || []).map(arg => arg.value ?? arg.description ?? '').join(' ')}`);
      if (method === 'Log.entryAdded' && params.entry?.level === 'error') problem(`Log renderer: ${params.entry.text}`);
      if (method === 'Network.requestWillBeSent') requests.set(params.requestId, params.request.url);
      if (method === 'Network.loadingFailed' && requests.has(params.requestId)) problem(`Caricamento fallito: ${requests.get(params.requestId)} · ${params.errorText}`);
      if (method === 'Network.responseReceived' && params.response.status >= 400) problem(`Asset HTTP ${params.response.status}: ${params.response.url}`);
    });
    for (const method of ['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable']) await renderer.send(method, {}, workTime());
    await renderer.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__sculptPackagedSmokeErrors = [];
      window.addEventListener('error', event => {
        const target = event.target;
        window.__sculptPackagedSmokeErrors.push(target !== window ? 'Asset: ' + (target.src || target.href || target.tagName) : String(event.message));
      }, true);
      window.addEventListener('unhandledrejection', event => window.__sculptPackagedSmokeErrors.push(String(event.reason?.stack || event.reason)));
    ` }, workTime());
    // Observe a complete load after attachment, including early script failures.
    monitor = true; requests.clear(); const previousLoads = loadCount;
    await renderer.send('Page.reload', { ignoreCache: true }, workTime());
    await until('caricamento completo renderer', () => loadCount > previousLoads);
    async function evaluate(expression) {
      check();
      const response = await renderer.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: workTime() }, workTime());
      if (response.exceptionDetails) throw new Error(`Verifica renderer: ${response.exceptionDetails.exception?.description || response.exceptionDetails.text}`);
      check(); return response.result?.value;
    }
    const boot = await evaluate(`(() => {
      const assert = (condition, message) => { if (!condition) throw new Error(message); };
      assert(location.href === ${JSON.stringify(APP_URL)} && document.readyState === 'complete', 'Origine o caricamento renderer errato');
      assert(SculptDesktop?.available === true && SculptDesktop.platform === 'macos', 'Bridge Electron Mac non disponibile');
      for (const method of ['connect', 'disconnect', 'sendTCP', 'sendUDP', 'audioRequest', 'addListener']) assert(typeof SculptDesktop[method] === 'function', 'API desktop mancante: ' + method);
      assert(SculptNative?.available === true && SculptNative.platform === 'macos' && SculptNative.driver, 'Driver nativo non caricato');
      assert(SculptLive?.snapshot().mode === 'demo' && !SculptLive.isConnected(), 'Lo smoke richiede una sessione demo isolata');
      assert(typeof SculptEditor?.openSection === 'function' && typeof SculptFX?.renderProcessor === 'function' && SculptVst?.available(), 'API delle viste non disponibili');
      assert(document.querySelectorAll('.strip[data-id]').length > 0, 'Mixer non renderizzato');
      assert(document.querySelector('.console').getBoundingClientRect().height > 0, 'Mixer non visibile');
      assert(SculptEditor.openSection('ch-1', 'devices'), 'Impossibile aprire CH 1');
      const dialog = document.querySelector('.editor-dialog[open]');
      const tabs = [...dialog.querySelectorAll('.editor-tabs [data-tab]')].filter(node => !node.hidden && getComputedStyle(node).display !== 'none').map(node => [node.dataset.tab, node.textContent.trim()]);
      assert(JSON.stringify(tabs) === JSON.stringify([['devices','Canale'],['vst3','VST3'],['fx','FX']]), 'Le tre schede Canale/VST3/FX non corrispondono');
      assert(dialog.querySelectorAll('.editor-device-panel').length === 9, 'Mancano moduli nella scheda Canale');
      const styles = [...document.querySelectorAll('link[rel="stylesheet"][href]')];
      assert(styles.every(node => node.sheet), 'Un foglio di stile locale non è stato caricato');
      return { tabs, assets: [...document.querySelectorAll('script[src],link[rel="stylesheet"][href]')].map(node => node.src || node.href) };
    })()`);
    const tree = await renderer.send('Page.getResourceTree', {}, workTime());
    const resources = new Map();
    const visit = frame => { for (const item of frame.resources || []) resources.set(item.url, item); for (const childFrame of frame.childFrames || []) visit(childFrame); };
    visit(tree.frameTree);
    for (const asset of boot.assets) {
      const resource = resources.get(asset);
      assert(resource && !resource.failed && !resource.canceled, `Asset locale non verificato dal renderer: ${asset}`);
    }
    assert.equal(await evaluate(`SculptEditor.openSection('ch-1', 'vst3')`), true, 'Apertura VST3 fallita');
    const vst = await until('otto slot VST3 e host nativo fermo', () => evaluate(`(() => {
      const state = SculptVst.snapshot();
      if (state.error) throw new Error('Host VST3: ' + state.error);
      if (!state.connected) return null;
      if (state.running || state.scanning || state.audio?.configured || state.audio?.inputDevice || state.audio?.outputDevice) throw new Error('Lo smoke non deve configurare o avviare audio/scansioni');
      const slots = document.querySelectorAll('.editor-dialog[open] #editor-panel-vst3 .vst-channel-slot');
      if (slots.length !== 8) throw new Error('Attesi 8 slot VST3, trovati ' + slots.length);
      return { slots: slots.length, connected: state.connected, running: state.running };
    })()`));
    assert.equal(await evaluate(`SculptEditor.openSection('ch-1', 'fx')`), true, 'Apertura FX fallita');
    const fx = await evaluate(`(() => {
      const slots = [...document.querySelectorAll('.editor-dialog[open] #editor-panel-fx .editor-fx-slot')];
      if (slots.length !== 16 || slots.some((node, index) => Number(node.dataset.fxSlot) !== index + 1)) throw new Error('Attesi i 16 slot FX interni WING');
      if (SculptController.getState().selected !== 'ch-1' || SculptLive.isConnected() || SculptLive.snapshot().mode !== 'demo') throw new Error('Canale o sessione cambiati durante lo smoke');
      const errors = window.__sculptPackagedSmokeErrors;
      if (!Array.isArray(errors) || errors.length) throw new Error('Errori caricamento/renderer: ' + JSON.stringify(errors));
      SculptEditor.close();
      return slots.length;
    })()`);
    check(); result = { tabs: boot.tabs.map(item => item[1]), vstSlots: vst.slots, fxSlots: fx, assets: boot.assets.length };
  } catch (error) { failure = error; }
  finally {
    stopping = true; monitor = false;
    try {
      if (!exit && browser) await browser.send('Browser.close', {}, 1200).catch(() => {});
      const waitForExit = async milliseconds => { const end = Date.now() + milliseconds; while (!exit && Date.now() < end) await sleep(50); };
      if (child?.pid) {
        await waitForExit(1200);
        if (groupAlive()) {
          requestedTermination = true; terminateGroup('SIGTERM');
          const end = Date.now() + 2000; while (groupAlive() && Date.now() < end) await sleep(50);
        }
        if (groupAlive()) {
          forcedTermination = true; terminateGroup('SIGKILL');
          const end = Date.now() + 1500; while (groupAlive() && Date.now() < end) await sleep(50);
        }
        await waitForExit(300);
        if (groupAlive() || !exit) throw new Error('Impossibile confermare la chiusura di tutti i processi dello smoke.');
        if (forcedTermination) throw new Error('Electron ha richiesto SIGKILL durante la chiusura; smoke non superato.');
        if (exit.code !== 0 && !(requestedTermination && exit.signal === 'SIGTERM')) throw new Error(`Uscita Electron anomala: code=${exit.code}, signal=${exit.signal}`);
      }
    } catch (error) { failure ||= error; }
    renderer?.close(); browser?.close();
    try { await bounded(fs.rm(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }), 1500, 'rimozione profilo temporaneo'); }
    catch (error) { failure ||= error; }
    clearTimeout(hardStop); process.off('SIGINT', sigint); process.off('SIGTERM', sigterm);
  }
  if (interrupted) failure ||= interrupted;
  if (failure) {
    throw new Error(`${failure.message}\n${output ? 'Ultimo output del bundle:\n' + output : 'Il bundle non ha prodotto output.'}`);
  }
  assert(result, 'Nessuna verifica renderer completata');
  console.log(`Packaged Electron smoke passed: sculpt:// renderer, ${result.assets} local assets, ${result.tabs.join('/')}, ${result.vstSlots} VST3 slots, ${result.fxSlots} WING FX slots; demo, USB stopped; owned process group and temporary profile removed.`);
}

main().catch(error => { console.error(`Packaged smoke FAILED: ${error.message}`); process.exitCode = 1; });
