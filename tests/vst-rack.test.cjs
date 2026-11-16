'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../native/node_modules/jsdom');
const M = require('../dist/vst-rack-model.js');
const pluginId = 'vst3-0123456789abcdef';
const rack = (id = 'ch-1', output = 0) => ({ id, enabled: true, inputChannels: [output], outputChannels: [output], slots: [{ pluginId, name: 'Test Compressor', bypass: false, state: 'native-preset' }], latencySamples: 16 });

test('USB routing rejects collisions, duplicate stereo ports and invalid WING families', () => {
  assert.equal(M.validateRouting(rack(), []), true);
  assert.throws(() => M.validateRouting(rack('ch-2'), [rack()]), /già assegnato/);
  assert.throws(() => M.validateRouting({ ...rack(), inputChannels: [0, 0], outputChannels: [2, 3] }), /distinti/);
  assert.throws(() => M.validateRouting({ ...rack(), inputChannels: [0], outputChannels: [0, 1] }), /altrettante/);
  assert.throws(() => M.validateRouting(rack('dca-1')), /canale audio/);
  assert.throws(() => M.validateRouting(rack('ch-1', 8), [], 8, 8), /non disponibile/);
  assert.equal(M.validateRouting({ ...rack('ch-2', 1), inputChannels: [0] }, [rack()]), true, 'two racks may share an input but never the return port');
  assert.throws(() => M.validateRouting(rack('ch-17', 20), Array.from({ length: 16 }, (_, i) => rack(`ch-${i + 1}`, i))), /16 rack/);
  assert.equal(M.validateRouting(rack('ch-1'), [rack()]), true, 'editing an existing rack does not collide with itself');
});

test('free ports account for bypassed racks; cached UI contains no plugin state or paths', () => {
  assert.deepEqual(M.freeRouting([{ ...rack(), enabled: false }, rack('ch-2', 1)], 2, 8, 8), { inputChannels: [2, 3], outputChannels: [2, 3] });
  assert.throws(() => M.freeRouting([rack()], 2, 2, 2), /Nessuna/);
  const cached = M.metadata({ running: true, plugins: [{ path: '/Library/private' }], racks: [{ ...rack(), slots: [{ ...rack().slots[0], path: '/tmp/plugin', arbitrary: 'secret' }] }] });
  assert.equal(cached.racks[0].slots[0].name, 'Test Compressor');
  assert.equal(cached.running, undefined); assert.equal(cached.plugins, undefined);
  for (const value of ['native-preset', '/Library/private', '/tmp/plugin', 'secret']) assert.ok(!JSON.stringify(cached).includes(value));
});

function fixture(t, initialRacks = [], audioDevices) {
  const dom = new JSDOM('<!doctype html><html><body><footer class="macro-rail"><button id="info-button">Info</button></footer></body></html>', { url: 'https://sculpt.test/', runScripts: 'outside-only' });
  const w = dom.window, calls = [], listeners = new Map();
  let session = { running: false, audio: { inputDevice: 'WING', outputDevice: 'WING', sampleRate: 48000, bufferSize: 128, inputChannels: 48, outputChannels: 48, latencySamples: 320 }, plugins: [{ id: pluginId, name: 'Test Compressor', manufacturer: 'Sculpt' }], racks: initialRacks, cpu: 0, xruns: 0 };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const copy = value => JSON.parse(JSON.stringify(value));
  w.SculptDesktop = { platform: 'macos', available: true, addListener: async (name, cb) => { listeners.set(name, cb); return { remove() {} }; }, audioRequest: async ({ method, params }) => {
    calls.push({ method, params: copy(params) });
    if (['status', 'getState'].includes(method)) return copy(session);
    if (method === 'loadSession') return { loaded: false };
    if (method === 'saveSession') return { saved: true };
    if (method === 'scanPlugins') { session.scanning = true; return { scanning: true }; }
    if (method === 'devices') return { devices: audioDevices || [{ name: 'WING', inputChannels: Array.from({ length: 48 }, (_, i) => String(i + 1)), outputChannels: Array.from({ length: 48 }, (_, i) => String(i + 1)), sampleRates: [48000], bufferSizes: [64, 128, 256] }] };
    if (method === 'configureAudio') { session.audio = { ...session.audio, ...copy(params) }; return copy(session); }
    if (method === 'setRack') { const index = session.racks.findIndex(r => r.id === params.id); if (index < 0) session.racks.push(copy(params)); else session.racks[index] = copy(params); return copy(session); }
    if (method === 'startAudio') { session.running = true; return copy(session); }
    if (method === 'stopAudio') { session.running = false; return copy(session); }
    return {};
  } };
  const strips = Array.from({ length: 40 }, (_, i) => ({ id: `ch-${i + 1}`, kind: 'CH', number: i + 1, name: `Channel ${i + 1}` }));
  const controllerState = { selected: 'ch-1' };
  w.SculptController = { getStrip: id => strips.find(s => s.id === id), getState: () => controllerState, listStrips: () => strips, selectStrip(id) { controllerState.selected = id; }, subscribe() {}, toast() {} };
  for (const file of ['vst-rack-model.js', 'vst-rack.js']) w.eval(readFileSync(path.join(__dirname, '../dist', file), 'utf8'));
  t.after(() => dom.window.close());
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const find = label => [...w.document.querySelectorAll('.vst-dialog button')].find(b => b.textContent === label);
  return { w, calls, listeners, get session() { return session; }, tick, find };
}

test('opening USB configuration restores a stopped session without starting audio or scanning plugins', async t => {
  const f = fixture(t);
  await f.w.SculptVst.openAudio();
  assert.deepEqual(f.calls.map(c => c.method), ['status', 'loadSession', 'getState', 'devices']);
  assert.equal(f.session.running, false);
  assert.match(f.w.document.querySelector('.vst-statusbar').textContent, /Audio · fermo/);
  assert.equal(f.w.document.querySelector('[aria-label="Dispositivo ingresso"]').value, 'WING');
  assert.match(f.w.document.querySelector('[data-vst-latency]').textContent, /6.67 ms/);
  assert.ok(!f.calls.some(c => c.method === 'startAudio'));
});

test('active analysis locks device edits but a stopped failed helper can still reconnect explicitly', async t => {
  const f = fixture(t, [rack()]);
  await f.w.SculptVst.openAudio();
  f.listeners.get('audioState')({ partial: true, analysis: { running: true } });
  assert.equal(f.find('Applica dispositivo').disabled, true);
  assert.equal(f.find('Aggiorna dispositivi').disabled, true);
  assert.equal(f.find('Avvia audio').disabled, false, 'VST may start on the existing shared device');
  f.listeners.get('audioError')({ fatal: true, message: 'Motore audio terminato' });
  assert.equal(f.find('Riconnetti motore').disabled, false);
  f.calls.length = 0;
  f.find('Riconnetti motore').click(); await f.tick(); await f.tick();
  assert.equal(f.calls[0].method, 'devices');
  assert.ok(!f.calls.some(c => ['startAudio', 'startAnalysis'].includes(c.method)), 'reconnect never restarts either consumer');
});

test('first Extended open restores uncached native slots and coalesces duplicate editor requests with audio stopped', async t => {
  const f = fixture(t, [{ ...rack(), enabled: false }]);
  await Promise.all([f.w.SculptVst.openSlot('ch-1', 0), f.w.SculptVst.openSlot('ch-1', 0)]);
  assert.deepEqual(f.calls.at(-1), { method: 'openEditor', params: { rackId: 'ch-1', slot: 0 } });
  assert.equal(f.calls.filter(c => c.method === 'openEditor').length, 1);
  assert.ok(!f.calls.some(c => ['startAudio', 'setRack', 'devices'].includes(c.method)));
  assert.equal(f.session.running, false);
  assert.equal(f.session.racks[0].enabled, false);
});

test('slot selection keeps its DOM node for double click; browser replacement follows the selected slot', async t => {
  const f = fixture(t, [{ ...rack(), slots: [rack().slots[0], { ...rack().slots[0], name: 'Second compressor', state: 'second-preset' }] }]);
  await f.w.SculptVst.openRack('ch-1');
  const second = f.w.document.querySelector('[data-slot="1"] .vst-slot-name');
  second.click(); assert.equal(f.w.document.querySelector('[data-slot="1"] .vst-slot-name'), second);
  second.dispatchEvent(new f.w.MouseEvent('dblclick', { bubbles: true })); await f.tick();
  assert.deepEqual(f.calls.at(-1), { method: 'openEditor', params: { rackId: 'ch-1', slot: 1 } });
  f.w.document.querySelector('[data-slot="0"] .vst-slot-choose').click(); await f.tick();
  const search = f.w.document.querySelector('.vst-search');
  f.w.document.querySelector('[data-slot="1"] .vst-slot-name').click();
  assert.equal(f.w.document.querySelector('.vst-search'), search);
  f.session.racks[0].slots[0].state = 'latest-first-preset';
  f.w.document.querySelector('.vst-plugin-item').click(); await f.tick(); await f.tick();
  assert.equal(f.session.racks[0].slots[0].state, 'latest-first-preset');
  assert.equal(f.session.racks[0].slots[1].name, 'Test Compressor');
  assert.equal(f.session.racks[0].slots[1].state, undefined);
  assert.equal(f.w.document.querySelector('.vst-catalog').hidden, true);
});

test('choosing the first plugin creates a bypassed rack on free ports and opens its editor without audio or WING writes', async t => {
  const f = fixture(t, [rack()]);
  f.session.audio = { inputDevice: '', outputDevice: '', inputChannels: 0, outputChannels: 0, configured: false };
  await f.w.SculptVst.openSlot('ch-2', 0);
  assert.equal(f.w.document.querySelector('.vst-catalog').hidden, false);
  f.w.document.querySelector('.vst-plugin-item').click(); await f.tick(); await f.tick();
  const created = f.session.racks.find(r => r.id === 'ch-2');
  assert.equal(created.enabled, false); assert.equal(created.placement, 'pre');
  assert.deepEqual(created.inputChannels, [1]); assert.deepEqual(created.outputChannels, [1]);
  assert.equal(created.slots[0].pluginId, pluginId);
  assert.deepEqual(f.calls.at(-1), { method: 'openEditor', params: { rackId: 'ch-2', slot: 0 } });
  assert.ok(f.calls.some(c => c.method === 'saveSession'));
  assert.ok(!f.calls.some(c => ['startAudio', 'configureAudio', 'sendTCP', 'sendUDP'].includes(c.method)));
});

test('Mac input-only and output-only devices can be selected independently with common audio settings', async t => {
  const f = fixture(t, [], [
    { name: 'Microfono MacBook Pro', inputChannels: ['Mic'], outputChannels: [], sampleRates: [44100, 48000], bufferSizes: [64, 128] },
    { name: 'Altoparlanti MacBook Pro', inputChannels: [], outputChannels: ['L', 'R'], sampleRates: [48000, 96000], bufferSizes: [128, 256] }
  ]);
  await f.w.SculptVst.openAudio();
  const input = f.w.document.querySelector('[aria-label="Dispositivo ingresso"]');
  assert.ok([...input.options].some(option => option.value === 'Microfono MacBook Pro' && !option.disabled));
  assert.ok(![...input.options].some(option => option.value === 'Altoparlanti MacBook Pro'));
  input.value = 'Microfono MacBook Pro'; input.dispatchEvent(new f.w.Event('change'));
  const output = f.w.document.querySelector('[aria-label="Dispositivo uscita"]');
  assert.ok([...output.options].some(option => option.value === 'Altoparlanti MacBook Pro' && !option.disabled));
  assert.ok(![...output.options].some(option => option.value === 'Microfono MacBook Pro'));
  output.value = 'Altoparlanti MacBook Pro'; output.dispatchEvent(new f.w.Event('change'));
  assert.deepEqual([...f.w.document.querySelector('[aria-label="Frequenza"]').options].map(o => o.value), ['48000']);
  assert.deepEqual([...f.w.document.querySelector('[aria-label="Buffer"]').options].map(o => o.value), ['128']);
  f.find('Applica dispositivo').click(); await f.tick(); await f.tick();
  assert.deepEqual(f.calls.findLast(c => c.method === 'configureAudio').params, { inputDevice: 'Microfono MacBook Pro', outputDevice: 'Altoparlanti MacBook Pro', sampleRate: 48000, bufferSize: 128 });
  assert.match(f.w.document.querySelector('.vst-statusbar').textContent, /Microfono MacBook Pro → Altoparlanti MacBook Pro/);
  assert.ok(!f.calls.some(c => ['startAudio', 'startAnalysis', 'setRack', 'sendTCP', 'sendUDP'].includes(c.method)));
});

test('bypass uses current native preset state and remains available during live audio', async t => {
  const f = fixture(t, [rack()]);
  await f.w.SculptVst.openRack('ch-1');
  f.session.racks[0].slots[0].state = 'edited-in-native-window';
  f.session.running = true;
  f.listeners.get('audioState')({ ...f.session, telemetry: false });
  const bypass = f.w.document.querySelector('.vst-slot-bypass');
  assert.equal(bypass.disabled, false); bypass.click(); await f.tick(); await f.tick();
  const write = f.calls.findLast(c => c.method === 'setRack');
  assert.equal(write.params.slots[0].state, 'edited-in-native-window');
  assert.equal(write.params.slots[0].bypass, true);
  assert.equal(f.session.running, true);
  assert.ok(f.find('Svuota slot').disabled);
  assert.ok(f.w.document.querySelector('.vst-scan').disabled);
});

test('telemetry does not rebuild focused plugin search; a fatal crash never triggers automatic restart', async t => {
  const f = fixture(t, [rack()]); await f.w.SculptVst.openRack('ch-1');
  f.w.document.querySelector('.vst-slot-choose').click(); await f.tick();
  f.session.running = true;
  f.listeners.get('audioState')({ ...f.session, telemetry: false });
  const search = f.w.document.querySelector('.vst-search'); search.value = 'comp'; search.focus();
  f.calls.length = 0;
  f.listeners.get('audioState')({ partial: true, telemetry: true, running: true, cpu: 0.25, xruns: 3, audio: f.session.audio });
  assert.equal(f.w.document.querySelector('.vst-search'), search);
  assert.equal(f.w.document.activeElement, search);
  assert.match(f.w.document.querySelector('.vst-statusbar').textContent, /CPU 25.0%/);
  f.listeners.get('audioError')({ fatal: false, message: 'Un plugin non è disponibile' });
  assert.equal(f.w.SculptVst.snapshot().running, true);
  f.listeners.get('audioError')({ fatal: true, message: 'Motore audio terminato' });
  await f.tick();
  assert.equal(f.w.SculptVst.snapshot().running, false);
  assert.equal(f.w.SculptVst.snapshot().connected, false);
  assert.deepEqual(f.calls, []);
  assert.match(f.w.document.querySelector('.vst-alert').textContent, /Motore audio terminato/);
});

test('an asynchronous scan keeps edits and audio start locked until its completion event', async t => {
  const f = fixture(t, [rack()]); await f.w.SculptVst.openRack('ch-1');
  f.w.document.querySelector('.vst-slot-choose').click(); await f.tick();
  f.w.document.querySelector('.vst-scan').click(); await f.tick(); await f.tick();
  assert.equal(f.w.SculptVst.snapshot().scanning, true);
  assert.equal(f.find('Avvia audio').disabled, true);
  assert.equal(f.find('Svuota slot').disabled, true);
  f.listeners.get('audioScanProgress')({ name: 'Compressor.vst3' });
  assert.match(f.w.document.querySelector('.vst-footer .vst-note').textContent, /Compressor/);
  f.session.scanning = false;
  f.listeners.get('audioState')({ ...f.session, telemetry: false });
  assert.equal(f.find('Avvia audio').disabled, false);
  assert.equal(f.find('Svuota slot').disabled, false);
});

test('new rack creation reserves a free USB return and never changes WING mixer state', async t => {
  const f = fixture(t, [rack()]); await f.w.SculptVst.openRack('ch-2');
  const create = f.find('Crea rack'); assert.ok(create); create.click(); await f.tick(); await f.tick();
  const created = f.session.racks.find(r => r.id === 'ch-2');
  assert.deepEqual(created.inputChannels, [1]); assert.deepEqual(created.outputChannels, [1]);
  assert.equal(created.enabled, false);
  assert.ok(f.calls.some(c => c.method === 'saveSession'));
  assert.ok(!f.calls.some(c => ['startAudio', 'sendTCP', 'sendUDP'].includes(c.method)));
});

test('placement metadata migrates older racks without assuming a WING insert', () => {
  assert.equal(M.metadata({ racks: [rack()] }).racks[0].placement, null);
  for (const placement of ['pre', 'insert1', 'insert2']) {
    const value = { ...rack(), placement };
    assert.equal(M.validateRouting(value), true);
    assert.equal(M.metadata({ racks: [value] }).racks[0].placement, placement);
  }
  assert.throws(() => M.validateRouting({ ...rack(), placement: 'post' }), /Pre, Insert 1 o Insert 2/);
  assert.throws(() => M.validateRouting({ ...rack('bus-1'), placement: 'pre' }), /famiglia/);
  assert.throws(() => M.validateRouting({ ...rack('aux-1'), placement: 'insert2' }), /famiglia/);
});

test('per-channel placement persists through the host while leaving other racks and WING untouched', async t => {
  const f = fixture(t, [rack(), { ...rack('ch-2', 1), placement: 'insert2' }]);
  await f.w.SculptVst.openAudio(); f.calls.length = 0;
  assert.equal(await f.w.SculptVst.setPlacement('ch-1', 'pre'), true);
  assert.equal(f.session.racks[0].placement, 'pre');
  assert.equal(f.session.racks[1].placement, 'insert2');
  assert.equal(f.session.racks[0].slots[0].state, 'native-preset');
  assert.ok(f.calls.some(call => call.method === 'saveSession'));
  assert.ok(!f.calls.some(call => ['startAudio', 'sendTCP', 'sendUDP'].includes(call.method)));
  assert.equal(f.w.SculptVst.routingStatus('ch-1').state, 'planned');
});

test('placement is blocked during audio and until an applied WING route has been restored', async t => {
  const f = fixture(t, [{ ...rack(), placement: 'pre' }]);
  await f.w.SculptVst.openAudio(); f.calls.length = 0;
  f.session.running = true; f.listeners.get('audioState')({ ...f.session, telemetry: true });
  assert.equal(await f.w.SculptVst.setPlacement('ch-1', 'insert1'), false);
  assert.ok(!f.calls.some(call => call.method === 'setRack'));
  f.session.running = false; f.listeners.get('audioState')({ ...f.session, telemetry: true });
  f.w.SculptVstRouting = { status: () => ({ managed: true, active: true, state: 'active' }) };
  assert.equal(await f.w.SculptVst.setPlacement('ch-1', 'insert1'), false);
  assert.equal(f.session.racks[0].placement, 'pre');
  assert.match(f.w.SculptVst.snapshot().error, /Ripristina prima/);
  assert.ok(!f.calls.some(call => call.method === 'setRack'));
});

test('embedded VST3 view has eight channel slots and disposes cleanly on navigation', async t => {
  const f = fixture(t, [rack()]);
  const host = f.w.document.createElement('section'); f.w.document.body.append(host);
  const dispose = f.w.SculptVst.renderChannel(host, 'ch-1');
  await f.tick(); await f.tick();
  assert.equal(host.querySelectorAll('.vst-channel-slot').length, 8);
  assert.deepEqual([...host.querySelectorAll('[aria-label="Posizione VST3 nel canale"] option')].map(option => option.value), ['', 'pre', 'insert1', 'insert2']);
  host.querySelector('[aria-label="Apri VST3 1 · CH 1 · Channel 1"]').click(); await f.tick();
  assert.deepEqual(f.calls.at(-1), { method: 'openEditor', params: { rackId: 'ch-1', slot: 0 } });
  const before = host.innerHTML; dispose();
  await f.w.SculptVst.setPlacement('ch-1', 'insert1');
  assert.equal(host.innerHTML, before, 'a disposed channel cannot be rebuilt by later host events');
  assert.equal(host.classList.contains('vst-channel-panel'), false);
});

test('WING preview does not apply routing until its separate Apply action', async t => {
  const f = fixture(t, [{ ...rack(), placement: 'pre' }]);
  const routeCalls = []; let applied = false;
  f.w.SculptLive = { isConnected: () => true, isWritable: () => true, sessionToken: () => 1 };
  const plan = { rackId: 'ch-1', placement: 'pre', summary: ['Local 1 → USB 1 → VST3 → USB 1 → CH 1'] };
  f.w.SculptVstRouting = {
    status: () => ({ managed: applied, active: applied, state: applied ? 'active' : 'idle' }),
    prepare: async value => { routeCalls.push(['prepare', value.id]); return plan; },
    apply: async value => { assert.equal(value, plan); routeCalls.push(['apply', value.rackId]); applied = true; }
  };
  await f.w.SculptVst.openAudio();
  const host = f.w.document.createElement('section'); f.w.document.body.append(host);
  const dispose = f.w.SculptVst.renderChannel(host, 'ch-1'); t.after(dispose);
  const find = text => [...host.querySelectorAll('button')].find(button => button.textContent === text);
  find('Leggi percorso WING').click(); await f.tick(); await f.tick();
  assert.deepEqual(routeCalls, [['prepare', 'ch-1']]);
  assert.match(host.textContent, /Local 1 → USB 1/);
  assert.ok(find('Applica percorso WING'));
  find('Applica percorso WING').click(); await f.tick(); await f.tick();
  assert.deepEqual(routeCalls, [['prepare', 'ch-1'], ['apply', 'ch-1']]);
  assert.equal(f.w.SculptVst.routingStatus('ch-1').state, 'applied');
  assert.match(host.textContent, /Ripristina ingresso diretto/);
});

test('delayed native edits retain their original channel and slot after navigation', async t => {
  const second = { ...rack('ch-2', 1), slots: [{ pluginId, name: 'Second rack', bypass: false, state: 'second-preset' }] };
  const f = fixture(t, [rack(), second]); await f.w.SculptVst.openRack('ch-1');
  const nativeRequest = f.w.SculptDesktop.audioRequest; let release, waiting = false;
  f.w.SculptDesktop.audioRequest = async request => {
    if (!waiting && request.method === 'getState') { waiting = true; await new Promise(resolve => { release = resolve; }); }
    return nativeRequest(request);
  };
  f.find('Svuota slot').click(); await f.tick();
  assert.equal(waiting, true);
  await f.w.SculptVst.openRack('ch-2');
  release(); await f.tick(); await f.tick();
  assert.equal(f.session.racks[0].slots[0].pluginId, null);
  assert.equal(f.session.racks[1].slots[0].state, 'second-preset');
  assert.equal(f.session.racks[1].slots[0].pluginId, pluginId);
});

test('ordinary WING state updates do not replace a focused plugin search', async t => {
  const f = fixture(t, [rack()]);
  f.w.SculptLive = { isConnected: () => true, isWritable: () => true, sessionToken: () => 4 };
  f.w.dispatchEvent(new f.w.CustomEvent('sculpt-live-state'));
  await f.w.SculptVst.openRack('ch-1');
  f.w.document.querySelector('.vst-slot-choose').click(); await f.tick();
  const search = f.w.document.querySelector('.vst-search'); search.focus(); search.value = 'comp';
  for (let i = 0; i < 20; i++) f.w.dispatchEvent(new f.w.CustomEvent('sculpt-live-state'));
  assert.equal(f.w.document.querySelector('.vst-search'), search);
  assert.equal(f.w.document.activeElement, search);
});

test('an applied WING route locks device changes while allowing a stopped buffer change', async t => {
  const f = fixture(t, [{ ...rack(), placement: 'pre' }]);
  f.w.SculptVstRouting = { status: id => ({ managed: id === 'ch-1', active: id === 'ch-1', state: id === 'ch-1' ? 'active' : 'idle' }) };
  await f.w.SculptVst.openAudio();
  const device = f.w.document.querySelector('[aria-label="Dispositivo ingresso"]');
  assert.equal(device.disabled, true);
  const other = f.w.document.createElement('option'); other.value = other.textContent = 'Other interface'; device.append(other); device.value = other.value;
  device.dispatchEvent(new f.w.Event('change'));
  f.find('Applica dispositivo').click(); await f.tick(); await f.tick();
  assert.ok(!f.calls.some(call => call.method === 'configureAudio'));
  assert.match(f.w.SculptVst.snapshot().error, /Ripristina prima i percorsi WING/);
  const same = f.w.document.querySelector('[aria-label="Dispositivo ingresso"]'); same.value = 'WING'; same.dispatchEvent(new f.w.Event('change'));
  const buffer = f.w.document.querySelector('[aria-label="Buffer"]'); assert.equal(buffer.disabled, false);
  buffer.value = '256'; buffer.dispatchEvent(new f.w.Event('change'));
  f.find('Applica dispositivo').click(); await f.tick(); await f.tick();
  assert.equal(f.calls.findLast(call => call.method === 'configureAudio').params.bufferSize, 256);
});
