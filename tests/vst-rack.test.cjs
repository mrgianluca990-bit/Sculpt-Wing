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

function fixture(t, initialRacks = []) {
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
    if (method === 'devices') return { devices: [{ name: 'WING', inputChannels: Array.from({ length: 48 }, (_, i) => String(i + 1)), outputChannels: Array.from({ length: 48 }, (_, i) => String(i + 1)), sampleRates: [48000], bufferSizes: [64, 128, 256] }] };
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
  assert.match(f.w.document.querySelector('.vst-statusbar').textContent, /USB · fermo/);
  assert.equal(f.w.document.querySelector('[aria-label="Interfaccia USB"]').value, 'WING');
  assert.match(f.w.document.querySelector('[data-vst-latency]').textContent, /6.67 ms/);
  assert.ok(!f.calls.some(c => c.method === 'startAudio'));
});

test('opening a populated Extended slot recalls the native editor for its exact channel and slot', async t => {
  const f = fixture(t, [rack()]);
  await f.w.SculptVst.openAudio(); f.calls.length = 0;
  await f.w.SculptVst.openSlot('ch-1', 0);
  assert.deepEqual(f.calls.at(-1), { method: 'openEditor', params: { rackId: 'ch-1', slot: 0 } });
  assert.ok(!f.calls.some(c => ['startAudio', 'setRack'].includes(c.method)));
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
  f.w.document.querySelector('.vst-scan').click(); await f.tick(); await f.tick();
  assert.equal(f.w.SculptVst.snapshot().scanning, true);
  assert.equal(f.find('Avvia audio USB').disabled, true);
  assert.equal(f.find('Svuota slot').disabled, true);
  f.listeners.get('audioScanProgress')({ name: 'Compressor.vst3' });
  assert.match(f.w.document.querySelector('.vst-footer .vst-note').textContent, /Compressor/);
  f.session.scanning = false;
  f.listeners.get('audioState')({ ...f.session, telemetry: false });
  assert.equal(f.find('Avvia audio USB').disabled, false);
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
