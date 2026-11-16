'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { AudioHost, validateAudioRequest, audioHostPath } = require('../src/audio-host.cjs');

function fixture(options = {}) {
  const children = [], events = [], spawns = [];
  const spawn = (executable, args, settings) => {
    spawns.push({ executable, args, settings });
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.requests = []; child.signals = [];
    child.reply = (request, result, error) => child.stdout.write(JSON.stringify(error ? { id: request.id, ok: false, error } : { id: request.id, ok: true, result }) + '\n');
    child.stdin = new Writable({ write(chunk, _encoding, callback) {
      const request = JSON.parse(chunk.toString('utf8')); child.requests.push(request); callback();
      if (request.method === 'shutdown') { child.reply(request, { stopped: true }); queueMicrotask(() => child.emit('exit', 0, null)); }
      else if (options.onRequest) options.onRequest(child, request);
    } });
    child.kill = signal => { child.signals.push(signal); child.emit('exit', null, signal); return true; };
    children.push(child); return child;
  };
  const host = new AudioHost({ executablePath: '/fixed/SculptWingAudio', dataDirectory: '/fixed/userData/audio-host', emit: (name, data) => events.push({ name, data }), spawn, shutdownTimeoutMs: 80, requestTimeoutMs: 300, ...options });
  return { host, children, events, spawns };
}

const exampleState = () => ({
  partial: false, running: true, available: true, cpu: 0.3,
  audio: { inputDevice: 'WING', outputDevice: 'WING', sampleRate: 48000, bufferSize: 128, inputChannels: 48, outputChannels: 48, latencySamples: 384 },
  plugins: [{ id: 'vst3-0123456789abcdef', path: '/ignored/catalog/path.vst3' }],
  racks: [{ id: 'voice', name: 'Voce', inputChannels: [0], outputChannels: [0], enabled: false, latencySamples: 16, slots: [{ pluginId: 'vst3-0123456789abcdef', name: 'Missing Compressor', bypass: false, missing: true, state: 'YWJj' }] }]
});

test('audio policy only accepts catalog IDs, bounded channels and explicit operations', () => {
  assert.deepEqual(validateAudioRequest({ method: 'status' }), { method: 'status', params: {} });
  for (const input of [
    { method: 'shutdown' }, { method: 'scan-one' }, { method: 'scanPlugins', params: { paths: ['/arbitrary'] } },
    { method: 'devices', params: { executable: '/bin/sh' } },
    { method: 'configureAudio', params: { inputDevice: 'WING', outputDevice: 'WING', bufferSize: 128, sampleRate: NaN } },
    { method: 'configureAudio', params: { inputDevice: '', outputDevice: 'WING', bufferSize: 128 } },
    { method: 'setRack', params: { ...exampleState().racks[0], executable: '/bin/sh' } },
    { method: 'setRack', params: { id: 'x', inputChannels: [48], outputChannels: [0], enabled: true, slots: [] } },
    { method: 'setRack', params: { id: 'x', inputChannels: [0,0], outputChannels: [0], enabled: true, slots: [] } },
    { method: 'setRack', params: { id: 'x', inputChannels: [0], outputChannels: [0], enabled: true, slots: [{ pluginId: '/tmp/code.vst3', bypass: false }] } },
    { method: 'openEditor', params: { rackId: 'x', slot: 8 } }
  ]) assert.throws(() => validateAudioRequest(input), undefined, JSON.stringify(input));
  const restored = validateAudioRequest({ method: 'restoreState', params: { state: exampleState() } });
  assert.equal(restored.params.state.running, undefined, 'persisted runtime flags never auto-start audio');
  assert.equal(restored.params.state.plugins, undefined, 'restoring a session cannot install a path or replace the native catalog');
  assert.equal(restored.params.state.racks[0].slots[0].state, 'YWJj');
  assert.equal(restored.params.state.racks[0].slots[0].name, 'Missing Compressor');
  assert.equal(restored.params.state.racks[0].slots[0].missing, undefined);
  assert.equal(restored.params.state.racks[0].placement, null, 'legacy sessions do not imply a WING patch');
  const roundTripRack = exampleState().racks[0];
  roundTripRack.missing = true; roundTripRack.slots[0].error = 'Plugin assente'; roundTripRack.slots[0].latencySamples = 128;
  const update = validateAudioRequest({ method: 'setRack', params: roundTripRack });
  assert.equal(update.params.latencySamples, undefined);
  assert.equal(update.params.missing, undefined);
  assert.equal(update.params.placement, null);
  assert.equal(update.params.slots[0].error, undefined);
  assert.equal(update.params.slots[0].latencySamples, undefined);
  assert.equal(audioHostPath({ isPackaged: true, resourcesPath: '/fixed/resources' }), '/fixed/resources/audio-host/SculptWingAudio.app/Contents/MacOS/SculptWingAudio');
});

test('rack placement is validated and round-trips through setRack, getState and restoreState IPC', async t => {
  let state = exampleState();
  const env = fixture({ onRequest(child, request) {
    if (request.method === 'setRack') state = { ...state, racks: [request.params] };
    if (request.method === 'restoreState') state = { ...request.params.state, running: false };
    child.reply(request, state);
  } });
  t.after(() => env.host.close());
  for (const value of ['', 'PRE', 'pre ', 'insert0', 'insert3', 'post', 0, false, [], {}, ['pre']]) {
    await assert.rejects(env.host.request({ method: 'setRack', params: { ...exampleState().racks[0], placement: value } }), { code: 'AUDIO_INVALID_REQUEST' });
    await assert.rejects(env.host.request({ method: 'restoreState', params: { state: { ...exampleState(), racks: [{ ...exampleState().racks[0], placement: value }] } } }), { code: 'AUDIO_INVALID_REQUEST' });
  }
  assert.equal(env.children.length, 0, 'invalid placement never reaches or launches the native helper');
  for (const placement of [null, 'pre', 'insert1', 'insert2']) {
    const updated = await env.host.request({ method: 'setRack', params: { ...exampleState().racks[0], placement } });
    assert.equal(env.children[0].requests.at(-1).params.placement, placement);
    assert.equal(updated.racks[0].placement, placement);
    const snapshot = await env.host.request({ method: 'getState' });
    assert.equal(snapshot.racks[0].placement, placement);
    const restored = await env.host.request({ method: 'restoreState', params: { state: snapshot } });
    assert.equal(env.children[0].requests.at(-1).params.state.racks[0].placement, placement);
    assert.equal(restored.racks[0].placement, placement);
    assert.equal(restored.running, false);
  }
});

test('native helper is lazy, uses fixed argv without a shell, and parses fragmented UTF-8 JSON lines', async t => {
  const env = fixture(); t.after(() => env.host.close());
  assert.equal(env.children.length, 0);
  const pending = env.host.request({ method: 'status' });
  const child = env.children[0], request = child.requests[0];
  assert.equal(env.spawns[0].settings.shell, false);
  assert.deepEqual(env.spawns[0].args, ['--stdio', '--data-dir', '/fixed/userData/audio-host']);
  const reply = Buffer.from(JSON.stringify({ id: request.id, ok: true, result: { label: 'Sì 🎸', running: false } }) + '\n' + JSON.stringify({ event: 'state', data: { partial: true, cpu: 0.4 } }) + '\n');
  for (let offset = 0; offset < reply.length; offset += 3) child.stdout.write(reply.subarray(offset, offset + 3));
  const result = await pending;
  assert.deepEqual(result, { label: 'Sì 🎸', running: false });
  assert.deepEqual(env.events[0], { name: 'audioState', data: { partial: true, cpu: 0.4 } });
  child.stdout.write(JSON.stringify({ event: 'error', data: { message: 'Plugin non disponibile' } }) + '\n');
  assert.equal(env.events.at(-1).data.fatal, false);
});

test('analysis validates independent USB inputs and bounded calibration before forwarding to the shared host', async t => {
  const env = fixture({ onRequest: (child, request) => child.reply(request, { configured: true, running: false, config: request.params }) });
  t.after(() => env.host.close());
  const base = { measurementChannel: 0, referenceChannel: 1 };
  for (const params of [
    { ...base, referenceChannel: 0 }, { ...base, measurementChannel: 48 },
    { ...base, fftSize: 1024 }, { ...base, averages: 1 }, { ...base, delayMs: Infinity },
    { ...base, calibrationEnabled: true }, { ...base, levelOffsetDb: 241 },
    { ...base, calibration: [{ frequency: 100, gainDb: 0 }, { frequency: 50, gainDb: 0 }] },
    { ...base, calibration: [{ frequency: 10, gainDb: NaN }] },
    { ...base, matrixDelayMs: 5 }
  ]) await assert.rejects(env.host.request({ method: 'configureAnalysis', params }), { code: 'AUDIO_INVALID_REQUEST' });
  assert.equal(env.children.length, 0, 'invalid settings never launch the helper');
  const calibration = [{ frequency: 20, gainDb: -1 }, { frequency: 20000, gainDb: 2, phaseDeg: 10 }];
  const configured = await env.host.request({ method: 'configureAnalysis', params: { ...base, calibration, calibrationEnabled: true } });
  assert.deepEqual(configured.config, { ...base, fftSize: 16384, averages: 8, delayMs: 0, calibration: [{ frequency: 20, gainDb: -1, phaseDeg: 0 }, calibration[1]], calibrationEnabled: true, levelOffsetDb: null });
  assert.deepEqual(env.children[0].requests.map(request => request.method), ['configureAnalysis'], 'configuration never starts either audio consumer');
  for (const method of ['startAnalysis', 'getAnalysis', 'stopAnalysis']) await env.host.request({ method });
  assert.deepEqual(env.children[0].requests.map(request => request.method), ['configureAnalysis', 'startAnalysis', 'getAnalysis', 'stopAnalysis']);
  assert.equal(env.spawns.length, 1, 'VST and analysis use the same bundled helper');
});

test('missing bundled audio executable reports a packaging error without suggesting mixer reconnection', async t => {
  for (const synchronous of [false, true]) {
    const error = Object.assign(new Error('spawn /bundle/SculptWingAudio ENOENT'), { code: 'ENOENT' });
    const env = fixture(synchronous ? { spawn: () => { throw error; } } : {});
    t.after(() => env.host.close());
    const pending = env.host.request({ method: 'status' });
    const check = assert.rejects(pending, failure => failure.code === 'AUDIO_HOST_MISSING' && /manca nel pacchetto/.test(failure.message));
    if (!synchronous) env.children[0].emit('error', error);
    await check;
    assert.equal(env.events.at(-1).data.code, 'AUDIO_HOST_MISSING');
    await assert.rejects(env.host.request({ method: 'getState' }), failure => failure.code === 'AUDIO_HOST_MISSING' && !/Usa Riconnetti/.test(failure.message));
    assert.equal(env.host.hasProcess, false);
  }
});

test('crash rejects every in-flight request and does not restart from status or getState', async t => {
  const env = fixture(); t.after(() => env.host.close());
  const first = env.host.request({ method: 'status' }), second = env.host.request({ method: 'devices' });
  const observed = Promise.allSettled([first, second]);
  env.children[0].emit('exit', 9, null);
  assert.deepEqual((await observed).map(result => result.status), ['rejected', 'rejected']);
  assert.equal(env.events.at(-1).data.fatal, true);
  await assert.rejects(env.host.request({ method: 'status' }), /Riconnetti/);
  await assert.rejects(env.host.request({ method: 'getState' }), /Riconnetti/);
  await assert.rejects(env.host.request({ method: 'startAudio' }), /Riconnetti/);
  assert.equal(env.children.length, 1);
  const reconnect = env.host.request({ method: 'devices' });
  assert.equal(env.children.length, 2);
  env.children[1].reply(env.children[1].requests[0], { devices: [] });
  await reconnect;
  assert.deepEqual(env.children[1].requests.map(item => item.method), ['devices'], 'recovery never replays start or stale requests');
});

test('pending and byte limits prevent unbounded work, and late replies cannot resolve a new request', async t => {
  const env = fixture({ maxPending: 2, requestTimeoutMs: 35 }); t.after(() => env.host.close());
  const first = env.host.request({ method: 'status' }), second = env.host.request({ method: 'devices' });
  const observed = Promise.allSettled([first, second]);
  await assert.rejects(env.host.request({ method: 'status' }), /Troppe operazioni/);
  assert.equal(env.children[0].requests.length, 2);
  const results = await observed;
  assert.equal(results.every(item => item.status === 'rejected' && item.reason.code === 'AUDIO_REQUEST_TIMEOUT'), true);
  const third = env.host.request({ method: 'devices' });
  const child = env.children[0];
  child.reply(child.requests[0], { stale: true });
  child.reply(child.requests[2], { devices: ['WING'] });
  assert.deepEqual(await third, { devices: ['WING'] });
  assert.equal(env.host.pendingBytes, 0);
});

test('an oversized or malformed native message kills the helper and fails pending commands', async t => {
  for (const bad of ['x'.repeat(257), '{not json}\n']) {
    const env = fixture({ maxMessageBytes: 256 }); t.after(() => env.host.close());
    const pending = env.host.request({ method: 'status' });
    const check = assert.rejects(pending, { code: 'AUDIO_HOST_PROTOCOL_ERROR' });
    env.children[0].stdout.write(bad);
    await check;
    assert.deepEqual(env.children[0].signals, ['SIGKILL']);
    assert.equal(env.host.hasProcess, false);
    assert.equal(env.events.at(-1).data.fatal, true);
  }
});

test('aggregate request bytes are capped even before the pending-command count is reached', async t => {
  const env = fixture({ maxMessageBytes: 100 }); t.after(() => env.host.close());
  const first = env.host.request({ method: 'status' });
  const second = env.host.request({ method: 'status' });
  await assert.rejects(env.host.request({ method: 'status' }), { code: 'AUDIO_TOO_MANY_REQUESTS' });
  assert.equal(env.children[0].requests.length, 2);
  for (const request of env.children[0].requests) env.children[0].reply(request, {});
  await Promise.all([first, second]);
  assert.equal(env.host.pendingBytes, 0);
});

test('session save is atomic, preserves plugin blobs and missing names, and restore never includes a running flag', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sculpt-wing-audio-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const sessionFile = path.join(directory, 'audio-rack-session.json');
  const state = exampleState();
  state.racks[0].placement = 'insert2';
  const env = fixture({ sessionFile, onRequest(child, request) {
    if (request.method === 'getState') child.reply(request, state);
    else if (request.method === 'restoreState') child.reply(request, { ...request.params.state, running: false });
    else child.reply(request, { running: false });
  } });
  t.after(() => env.host.close());
  assert.deepEqual(await env.host.request({ method: 'loadSession' }), { loaded: false });
  assert.equal(env.children.length, 0, 'a missing session does not start a process');
  assert.deepEqual(await env.host.request({ method: 'saveSession' }), { saved: true });
  const saved = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
  assert.equal(saved.state.racks[0].slots[0].state, 'YWJj');
  assert.equal(saved.state.racks[0].slots[0].name, 'Missing Compressor');
  assert.equal(saved.state.racks[0].placement, 'insert2');
  assert.equal(saved.state.running, undefined);
  assert.equal(saved.state.plugins, undefined);
  const loaded = await env.host.request({ method: 'loadSession' });
  assert.equal(loaded.loaded, true);
  const restore = env.children[0].requests.find(item => item.method === 'restoreState');
  assert.equal(restore.params.state.running, undefined);
  assert.equal(restore.params.state.racks[0].placement, 'insert2');
  assert.equal(loaded.state.racks[0].placement, 'insert2');
  delete saved.state.racks[0].placement;
  await fs.writeFile(sessionFile, JSON.stringify(saved));
  const legacy = await env.host.request({ method: 'loadSession' });
  assert.equal(legacy.state.racks[0].placement, null, 'old saved sessions restore with no assumed WING placement');
  assert.equal(env.children[0].requests.at(-1).params.state.racks[0].placement, null);
  assert.deepEqual(await fs.readdir(directory), ['audio-rack-session.json']);
  await env.host.close();
});

test('sleep stops an existing helper without spawning one and close is idempotent', async () => {
  const env = fixture({ onRequest: (child, request) => child.reply(request, { running: false }) });
  await env.host.suspend(); assert.equal(env.children.length, 0);
  await env.host.request({ method: 'status' });
  await env.host.suspend();
  assert.deepEqual(env.children[0].requests.slice(-2).map(item => item.method), ['stopAudio', 'stopAnalysis'], 'sleep stops both consumers without restarting either one');
  const firstClose = env.host.close(), secondClose = env.host.close();
  assert.equal(firstClose, secondClose);
  await firstClose;
  assert.deepEqual(env.children[0].requests.slice(-3).map(item => item.method), ['stopAudio', 'stopAnalysis', 'shutdown']);
  assert.equal(env.events.some(item => item.data.fatal), false, 'normal shutdown is not presented as a crash');
  await assert.rejects(env.host.request({ method: 'devices' }), { code: 'AUDIO_HOST_CLOSED' });
});
