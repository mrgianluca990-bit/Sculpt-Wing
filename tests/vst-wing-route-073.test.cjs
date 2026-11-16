'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { create } = require('../dist/vst-wing-route.js');

const STORAGE_KEY = 'sculpt-wing-vst-routing-v1';
const GROUPS = ['OFF', 'LCL', 'AUX', 'A', 'B', 'C', 'SC', 'USB', 'CRD', 'MOD', 'PLAY', 'AES', 'USR', 'OSC', 'BUS', 'MAIN', 'MTX', 'SEND'];
const MODES = ['M', 'ST', 'M/S'];
const FX = ['NONE', ...Array.from({ length: 16 }, (_, index) => `FX${index + 1}`)];
const COUNTS = { ch: 40, aux: 8, bus: 16, main: 4, mtx: 8 };
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(overrides = {}) {
  const values = new Map(), definitions = new Map(), reads = [], writes = [], events = [], hooks = {};
  const saved = new Map(), listeners = [];
  let storageWrites = 0, epoch = 1, connected = true, writable = true;
  const info = { host: '192.168.1.55', model: 'WING', name: 'Test console', firmware: '3.1.2' };
  function node(path) {
    if (definitions.has(path)) return;
    definitions.set(path, { path, type: 0, readOnly: false, revision: 1 });
    const parent = path.slice(0, path.lastIndexOf('/'));
    if (parent) node(parent);
  }
  function field(path, value, type = 4, extra = {}) {
    node(path.slice(0, path.lastIndexOf('/')));
    definitions.set(path, { path, type, readOnly: false, revision: 1, ...extra });
    values.set(path, value);
  }
  function enumeration(path, value, options, extra = {}) {
    field(path, value, 5, { items: options.map(value => ({ value, label: value })), ...extra });
  }
  function integer(path, value, min = 0, max = 1, extra = {}) { field(path, value, 4, { min, max, ...extra }); }
  for (const [family, count] of Object.entries(COUNTS)) for (let n = 1; n <= count; n++) {
    const base = `/${family}/${n}`;
    integer(base + '/mute', 0);
    for (const stage of family === 'aux' ? ['preins'] : ['preins', 'postins']) {
      integer(`${base}/${stage}/on`, 0);
      enumeration(`${base}/${stage}/ins`, 'NONE', FX);
      if (stage === 'postins' && family === 'ch') enumeration(`${base}/${stage}/mode`, 'FX', ['FX', 'AUTO_X', 'AUTO_Y']);
    }
    if (!['ch', 'aux'].includes(family)) continue;
    const conn = base + '/in/conn', set = base + '/in/set';
    enumeration(conn + '/grp', n <= 24 ? 'LCL' : 'A', GROUPS);
    integer(conn + '/in', n <= 24 ? n : n - 24, 1, 64);
    enumeration(conn + '/altgrp', 'OFF', GROUPS);
    integer(conn + '/altin', 1, 1, 64);
    integer(set + '/srcauto', 0); integer(set + '/altsrc', 0);
    enumeration(set + '/$mode', 'M', MODES, { readOnly: true });
  }
  integer('/io/altsw', 0); integer('/io/autoaltovr', 1);
  for (const [group, count] of Object.entries({ LCL: 24, AUX: 8, A: 48, B: 48, C: 48, SC: 32, AES: 2, USB: 48 })) for (let n = 1; n <= count; n++) {
    enumeration(`/io/in/${group}/${n}/mode`, 'M', MODES);
    if (group !== 'USB') {
      field(`/io/in/${group}/${n}/g`, 20, 1, { min: -12, max: 60, unit: 1 });
      integer(`/io/in/${group}/${n}/vph`, 0);
    }
  }
  for (let n = 1; n <= 48; n++) {
    enumeration(`/io/out/USB/${n}/grp`, 'OFF', GROUPS);
    integer(`/io/out/USB/${n}/in`, 1, 1, 64);
  }
  for (let n = 1; n <= 32; n++) {
    const base = `/io/in/$SEND/${n}`;
    enumeration(base + '/mode', 'M', MODES, { readOnly: true });
    field(base + '/name', `FX SEND ${Math.ceil(n / 2)}${n % 2 ? 'L' : 'R'}`, 7, { maxLength: 16, readOnly: true });
  }
  function model(slot, value) {
    const base = `/fx/${slot}`;
    for (const key of ['egrp', 'ein', 'emode', 'trim', 'lat']) { values.delete(base + '/' + key); definitions.delete(base + '/' + key); }
    if (value === 'EXT') {
      enumeration(base + '/egrp', 'OFF', GROUPS.filter(group => !['USR', 'OSC', 'BUS', 'MAIN', 'MTX', 'SEND'].includes(group)));
      integer(base + '/ein', 1, 1, 64);
      enumeration(base + '/emode', 'M', MODES);
      field(base + '/trim', 0, 1, { min: -18, max: 18, unit: 1 });
      integer(base + '/lat', 0, 0, 200);
    }
    values.set(base + '/mdl', value);
    const revision = (definitions.get(base + '/mdl')?.revision || 0) + 1;
    for (const [path, meta] of definitions) if (path === base || path.startsWith(base + '/')) definitions.set(path, { ...meta, revision });
  }
  for (let slot = 1; slot <= 16; slot++) {
    const base = `/fx/${slot}`;
    enumeration(base + '/mdl', 'NONE', ['NONE', 'EXT', 'HALL']);
    // WING Remote Protocols v3.1 p.25: linear float 0..100, unit 2 = %.
    field(base + '/fxmix', 100, 1, { min: 0, max: 100, unit: 2 });
    integer(base + '/$a_chn', 0, 0, 76, { readOnly: true });
    integer(base + '/$a_pos', 0, 0, 1, { readOnly: true });
  }
  const rack = { id: 'ch-1', placement: 'pre', inputChannels: [8], outputChannels: [10], enabled: false, slots: [], ...overrides };
  const host = { connected: true, running: false, scanning: false, audio: { inputDevice: 'WING', outputDevice: 'WING', inputChannels: 48, outputChannels: 48 }, racks: [rack] };
  const storage = { getItem: key => saved.get(key) || null, setItem: (key, value) => { storageWrites++; saved.set(key, value); } };
  const live = {
    isConnected: () => connected, isWritable: () => writable, sessionToken: () => epoch,
    snapshot: () => ({ info: { ...info }, host: info.host, pending: 0 }),
    metadata: path => definitions.get(path), value: path => values.get(path), hasValue: path => values.has(path),
    async readNode(path, options = {}) {
      reads.push({ method: 'node', path, options: { ...options } });
      await hooks.readNode?.(path, options);
      if (!definitions.has(path)) throw new Error(`Fixture missing node ${path}`);
    },
    async readValues(path) {
      reads.push({ method: 'values', path });
      await hooks.readValues?.(path);
      if (values.has(path)) return { [path]: values.get(path) };
      const result = {};
      for (const [key, value] of values) if (key.slice(0, key.lastIndexOf('/')) === path) result[key] = value;
      return result;
    },
    async write(path, value, options) {
      writes.push({ path, value, schema: copy(options?.expectedSchema) });
      await hooks.beforeWrite?.(path, value);
      assert.equal(options.expectedSchema.path, path);
      assert.equal(options.expectedSchema.revision, definitions.get(path)?.revision, path + ' schema revision');
      assert.equal(definitions.get(path)?.readOnly, false, path + ' writable');
      values.set(path, value);
      const match = /^\/fx\/(\d+)\/mdl$/.exec(path);
      if (match) model(Number(match[1]), value);
      await hooks.afterWrite?.(path, value);
      for (const listener of listeners) listener();
    }
  };
  const options = { getLive: () => live, getVst: () => host, storage, dispatch: event => events.push(copy(event)), subscribe: listener => listeners.push(listener) };
  const api = create(options);
  return {
    api, options, rack, host, live, storage, saved, reads, writes, events, hooks, values, definitions, info, model, field, enumeration,
    storageWrites: () => storageWrites, nextSession: () => { epoch++; }, setConnected: value => { connected = value; }, setWritable: value => { writable = value; },
    update(path, value) { values.set(path, value); for (const listener of listeners) listener(); },
    snapshot: () => Object.fromEntries(values)
  };
}

test('PRE is read-only when prepared, preserves MAIN and both inserts, and restores the original patch', async () => {
  const f = fixture();
  f.values.set('/ch/1/preins/ins', 'FX2'); f.values.set('/ch/1/preins/on', 1);
  f.values.set('/ch/1/postins/ins', 'FX3'); f.values.set('/ch/1/postins/on', 1);
  f.values.set('/ch/1/in/conn/altgrp', 'A'); f.values.set('/ch/1/in/conn/altin', 7);
  const original = f.snapshot();
  assert.equal(f.reads.length, 0, 'module load performs no reads');
  const plan = await f.api.prepare(f.rack);
  assert.equal(f.writes.length, 0); assert.equal(f.storageWrites(), 0);
  assert.equal(plan.source.sourceId, 'LCL:1'); assert.equal(plan.fxSlot, null);
  assert.equal(f.api.status('ch-1').state, 'prepared');
  const applied = await f.api.apply(plan);
  assert.equal(applied.state, 'active'); assert.equal(applied.busy, false);
  assert.equal(f.values.get('/io/out/USB/9/grp'), 'LCL'); assert.equal(f.values.get('/io/out/USB/9/in'), 1);
  assert.equal(f.values.get('/ch/1/in/conn/grp'), 'LCL'); assert.equal(f.values.get('/ch/1/in/conn/in'), 1);
  assert.equal(f.values.get('/ch/1/in/conn/altgrp'), 'USB'); assert.equal(f.values.get('/ch/1/in/conn/altin'), 11);
  assert.equal(f.values.get('/ch/1/in/set/altsrc'), 1); assert.equal(f.values.get('/ch/1/mute'), 0);
  assert(!f.writes.some(write => /\/(preins|postins)\/|^\/fx\/|\/(g|vph)$/.test(write.path)));
  assert.equal(f.api.sourceFor('ch-1').sourceId, 'LCL:1'); assert(f.api.backup('ch-1'));
  assert.equal((await f.api.restore('ch-1')).state, 'idle');
  assert.deepEqual(f.snapshot(), original); assert.equal(f.api.backup('ch-1'), null);
});

test('PRE uses a verified active ALT and snapshots both source selectors', async () => {
  const f = fixture();
  for (const [path, value] of Object.entries({ '/ch/1/in/conn/altgrp': 'A', '/ch/1/in/conn/altin': 7, '/ch/1/in/set/altsrc': 1, '/ch/1/in/set/srcauto': 1, '/io/altsw': 1 })) f.values.set(path, value);
  const original = f.snapshot(), plan = await f.api.prepare(f.rack);
  assert.equal(plan.source.sourceId, 'A:7');
  await f.api.apply(plan);
  assert.equal(f.values.get('/io/out/USB/9/grp'), 'A'); assert.equal(f.values.get('/io/out/USB/9/in'), 7);
  assert.equal(f.values.get('/ch/1/in/set/srcauto'), 0);
  await f.api.restore('ch-1'); assert.deepEqual(f.snapshot(), original);
  f.values.set('/ch/1/in/set/altsrc', 0);
  const writes = f.writes.length;
  await assert.rejects(f.api.prepare(f.rack), /discordante/); assert.equal(f.writes.length, writes);
});

test('PRE stereo routes both physical lanes and requires a matching odd/even USB return', async () => {
  const f = fixture({ inputChannels: [2, 3], outputChannels: [4, 5] });
  f.values.set('/io/in/LCL/1/mode', 'ST'); f.values.set('/ch/1/in/set/$mode', 'ST');
  const original = f.snapshot();
  await f.api.apply(await f.api.prepare(f.rack));
  assert.equal(f.values.get('/io/out/USB/3/in'), 1); assert.equal(f.values.get('/io/out/USB/4/in'), 2);
  assert.equal(f.values.get('/io/out/USB/3/grp'), 'LCL'); assert.equal(f.values.get('/io/out/USB/4/grp'), 'LCL');
  assert.equal(f.values.get('/io/in/USB/5/mode'), 'ST'); assert.equal(f.values.get('/ch/1/in/conn/altin'), 5);
  await f.api.restore('ch-1'); assert.deepEqual(f.snapshot(), original);
  f.rack.outputChannels = [5, 6]; await assert.rejects(f.api.prepare(f.rack), /dispari\/pari/);
  f.rack.outputChannels = [4, 5]; f.values.set('/ch/1/in/set/$mode', 'M'); await assert.rejects(f.api.prepare(f.rack), /mono\/stereo/);
  f.values.set('/ch/1/in/set/$mode', 'M/S'); f.values.set('/io/in/LCL/1/mode', 'M/S'); await assert.rejects(f.api.prepare(f.rack), /Sorgente PRE/);
});

test('PRE refuses USB/USER source loops, rack collisions, and other channel USB consumers', async () => {
  for (const group of ['USB', 'USR', 'BUS']) {
    const f = fixture(); f.values.set('/ch/1/in/conn/grp', group);
    await assert.rejects(f.api.prepare(f.rack), /sorgente fisica/); assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  f.host.racks.push({ id: 'ch-2', placement: null, inputChannels: [8], outputChannels: [20] });
  await assert.rejects(f.api.prepare(f.rack), /Mandata USB.*ch-2/); assert.equal(f.writes.length, 0);
  f.host.racks.pop(); f.values.set('/ch/2/in/conn/grp', 'USB'); f.values.set('/ch/2/in/conn/in', 11);
  await assert.rejects(f.api.prepare(f.rack), /ritorno USB 11.*CH-2/); assert.equal(f.writes.length, 0);
  f.values.set('/ch/2/in/conn/in', 12); f.values.set('/io/in/USB/11/mode', 'ST');
  await assert.rejects(f.api.prepare(f.rack), /ritorno USB 12.*CH-2/); assert.equal(f.writes.length, 0);
});

test('both PRE and inserts reject a USB return consumed by another External slot', async () => {
  for (const placement of ['pre', 'insert1']) {
    const f = fixture({ placement }); f.model(8, 'EXT');
    f.values.set('/fx/8/egrp', 'USB'); f.values.set('/fx/8/ein', 11);
    await assert.rejects(f.api.prepare(f.rack, { fxSlot: 5 }), /già usato.*FX8/);
    assert.equal(f.writes.length, 0);
  }
  const f = fixture({ placement: 'insert1' });
  f.values.set('/ch/1/in/conn/grp', 'USB'); f.values.set('/ch/1/in/conn/in', 11);
  await assert.rejects(f.api.prepare(f.rack, { fxSlot: 5 }), /ritorno USB 11.*CH-1/);
  assert.equal(f.writes.length, 0, 'an insert return must not also feed its own channel input');
});

test('USB collisions inside USER PATCH stereo sources are read from both independent assignments', async () => {
  const f = fixture();
  f.values.set('/ch/2/in/conn/grp', 'USR'); f.values.set('/ch/2/in/conn/in', 25);
  f.enumeration('/io/in/USR/25/mode', 'ST', MODES);
  f.enumeration('/io/in/USR/25/user/grp', 'LCL', GROUPS); f.field('/io/in/USR/25/user/in', 7, 4, { min: 1, max: 64 });
  f.enumeration('/io/in/USR/26/user/grp', 'USB', GROUPS); f.field('/io/in/USR/26/user/in', 11, 4, { min: 1, max: 64 });
  await assert.rejects(f.api.prepare(f.rack), /USB 11.*USER 26.*CH-2/); assert.equal(f.writes.length, 0);
});

test('readonly prepare is allowed; readonly, running, stale values, schema, session, and audio changes block apply before writes', async () => {
  const actions = [
    f => f.setWritable(false),
    f => { f.host.running = true; },
    f => { f.values.set('/ch/1/in/conn/altin', 19); },
    f => { const path = '/ch/1/in/conn/altin'; f.definitions.set(path, { ...f.definitions.get(path), revision: 2 }); },
    f => f.nextSession(),
    f => { f.host.audio.outputDevice = 'Other device'; }
  ];
  for (const action of actions) {
    const f = fixture(), plan = await f.api.prepare(f.rack); action(f);
    await assert.rejects(f.api.apply(plan)); assert.equal(f.writes.length, 0); assert.equal(f.api.backup('ch-1'), null);
  }
  const f = fixture(); f.setWritable(false); await f.api.prepare(f.rack); assert.equal(f.writes.length, 0);
});

test('apply ignores caller mutations of public plan arrays and invalidates superseded plans', async () => {
  const f = fixture(), first = await f.api.prepare(f.rack), plan = await f.api.prepare(f.rack);
  await assert.rejects(f.api.apply(first), /già usato/);
  plan.sendChannels[0] = 48; plan.returnChannels[0] = 48;
  await f.api.apply(plan);
  assert.deepEqual(f.api.backup('ch-1').sendChannels, [9]); assert.deepEqual(f.api.backup('ch-1').returnChannels, [11]);
  await f.api.restore('ch-1');
});

test('failed writes and ambiguous acknowledgements roll back only this operation and restore mute', async () => {
  for (const failAfterWrite of [false, true]) {
    const f = fixture(), original = f.snapshot(); let failed = false;
    f.hooks[failAfterWrite ? 'afterWrite' : 'beforeWrite'] = (path, value) => {
      if (!failed && path === '/ch/1/in/conn/altgrp' && value === 'USB') { failed = true; throw new Error('Simulated transport failure'); }
    };
    await assert.rejects(f.api.apply(await f.api.prepare(f.rack)), /Simulated transport failure/);
    assert.deepEqual(f.snapshot(), original); assert.equal(f.api.backup('ch-1'), null); assert.equal(f.api.status('ch-1').state, 'idle');
  }
});

test('a concurrent console edit survives rollback and leaves an accessible conflict backup', async () => {
  const f = fixture(); let failed = false;
  f.hooks.afterWrite = (path, value) => {
    if (!failed && path === '/ch/1/in/conn/altgrp' && value === 'USB') {
      failed = true; f.values.set('/io/out/USB/9/grp', 'A'); throw new Error('Concurrent console edit');
    }
  };
  await assert.rejects(f.api.apply(await f.api.prepare(f.rack)), /Concurrent console edit/);
  assert.equal(f.values.get('/io/out/USB/9/grp'), 'A'); assert.equal(f.values.get('/ch/1/mute'), 0);
  assert.equal(f.api.status('ch-1').state, 'conflict'); assert(f.api.backup('ch-1'));
  assert.equal(f.api.sourceFor('ch-1'), null);
  const writes = f.writes.length; await assert.rejects(f.api.restore('ch-1'), /modificato esternamente/); assert.equal(f.writes.length, writes);
});

test('session changes interrupt compensation; explicit restore can recover the matching console', async () => {
  const f = fixture(), original = f.snapshot(); let changed = false;
  f.hooks.afterWrite = path => { if (!changed && path === '/io/out/USB/9/grp') { changed = true; f.nextSession(); } };
  await assert.rejects(f.api.apply(await f.api.prepare(f.rack)), /connessione WING.*cambiata/);
  assert.equal(f.writes.at(-1).path, '/io/out/USB/9/grp'); assert(f.api.backup('ch-1'));
  assert.equal(f.api.sourceFor('ch-1'), null);
  await f.api.restore('ch-1'); assert.deepEqual(f.snapshot(), original);
});

test('cached console changes immediately invalidate active PRE and original preamp status without network reads', async () => {
  const f = fixture(); await f.api.apply(await f.api.prepare(f.rack));
  const reads = f.reads.length, writes = f.writes.length, events = f.events.length;
  f.update('/ch/1/in/conn/altgrp', 'A');
  assert.equal(f.api.status('ch-1').state, 'conflict'); assert.equal(f.api.sourceFor('ch-1'), null);
  assert.equal(f.reads.length, reads); assert.equal(f.writes.length, writes);
  assert.equal(f.events.at(-1).state, 'conflict'); assert.equal(f.events.length, events + 1);
  f.update('/ch/2/mute', 1); assert.equal(f.events.length, events + 1, 'unrelated mixer update does not rebuild routing UI');
  f.update('/ch/1/in/conn/altgrp', 'USB'); assert.equal(f.api.status('ch-1').state, 'active');
  f.update('/io/in/LCL/1/mode', 'ST'); assert.equal(f.api.sourceFor('ch-1'), null);
});

test('audio device and native rack mapping changes invalidate the applied route status', async () => {
  const f = fixture(); await f.api.apply(await f.api.prepare(f.rack));
  f.host.audio.outputDevice = 'Other device';
  assert.equal(f.api.status('ch-1').state, 'conflict'); assert.equal(f.api.sourceFor('ch-1'), null);
  f.host.audio.outputDevice = 'WING'; assert.equal(f.api.status('ch-1').state, 'active');
  f.rack.inputChannels = [12]; assert.equal(f.api.status('ch-1').state, 'conflict');
  f.rack.inputChannels = [8]; f.rack.placement = 'insert1'; assert.equal(f.api.status('ch-1').active, false);
});

test('browser integration observes controller live-values and host events without mixer polling', async () => {
  const f = fixture(), handlers = new Map(), controllers = [], events = [];
  const window = {
    localStorage: f.storage, SculptLive: f.live, SculptVst: { snapshot: () => f.host },
    SculptController: { subscribe: listener => controllers.push(listener) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    addEventListener(type, listener) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(listener); },
    dispatchEvent(event) { events.push(event); for (const listener of handlers.get(event.type) || []) listener(event); }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/vst-wing-route.js'), 'utf8'), { window });
  const api = window.SculptVstRouting;
  assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
  await api.apply(await api.prepare(f.rack));
  const reads = f.reads.length, writes = f.writes.length;
  f.values.set('/ch/1/in/set/altsrc', 0);
  for (const listener of controllers) listener({ type: 'live-values' });
  assert.equal(events.at(-1).type, 'sculpt-vst-route-state'); assert.equal(events.at(-1).detail.state, 'conflict');
  f.values.set('/ch/1/in/set/altsrc', 1);
  for (const listener of controllers) listener({ type: 'live-values' });
  assert.equal(events.at(-1).detail.state, 'active');
  f.host.audio.inputDevice = 'Other device'; window.dispatchEvent(new window.CustomEvent('sculpt-vst-state', { detail: {} }));
  assert.equal(events.at(-1).type, 'sculpt-vst-route-state'); assert.equal(events.at(-1).detail.state, 'conflict');
  assert.equal(f.reads.length, reads); assert.equal(f.writes.length, writes);
});

test('Insert 1 uses the chosen FX slot pair, loads verified External, and restores the old patch', async () => {
  const f = fixture({ placement: 'insert1' }), original = f.snapshot();
  const plan = await f.api.prepare(f.rack, { fxSlot: 5 });
  assert.equal(plan.deferredExternal, true); assert.equal(f.writes.length, 0);
  assert.equal((await f.api.apply(plan)).state, 'active');
  assert.equal(f.values.get('/fx/5/mdl'), 'EXT'); assert.equal(f.values.get('/fx/5/egrp'), 'USB');
  assert.equal(f.values.get('/fx/5/ein'), 11); assert.equal(f.values.get('/fx/5/emode'), 'M');
  assert.equal(f.values.get('/fx/5/fxmix'), 100); assert.equal(f.values.get('/fx/5/trim'), 0); assert.equal(f.values.get('/fx/5/lat'), 0);
  assert.equal(f.values.get('/io/out/USB/9/grp'), 'SEND'); assert.equal(f.values.get('/io/out/USB/9/in'), 9, 'FX5 L = SEND9, independent of channel number');
  assert.equal(f.values.get('/ch/1/preins/ins'), 'FX5'); assert.equal(f.values.get('/ch/1/preins/on'), 1);
  assert(!f.writes.some(write => write.path.includes('/in/conn/') || write.path.endsWith('/lat')));
  assert.equal(f.writes.at(-2).path, '/ch/1/preins/on'); assert.equal(f.writes.at(-1).path, '/ch/1/mute');
  await f.api.restore('ch-1'); assert.deepEqual(f.snapshot(), original);
});

test('Insert 2 stereo uses both FX SEND lanes and preserves the External dry latency compensation', async () => {
  const f = fixture({ placement: 'insert2', inputChannels: [2, 3], outputChannels: [4, 5] });
  f.values.set('/ch/1/in/set/$mode', 'ST'); f.model(7, 'EXT');
  for (const [path, value] of Object.entries({ '/ch/1/postins/ins': 'FX7', '/ch/1/postins/on': 1, '/fx/7/$a_chn': 1, '/fx/7/$a_pos': 1, '/fx/7/egrp': 'A', '/fx/7/ein': 9, '/fx/7/emode': 'ST', '/fx/7/fxmix': 55, '/fx/7/trim': 2.5, '/fx/7/lat': 17 })) f.values.set(path, value);
  const original = f.snapshot();
  await f.api.apply(await f.api.prepare(f.rack));
  assert.equal(f.values.get('/io/out/USB/3/in'), 13); assert.equal(f.values.get('/io/out/USB/4/in'), 14);
  assert.equal(f.values.get('/fx/7/ein'), 5); assert.equal(f.values.get('/fx/7/emode'), 'ST'); assert.equal(f.values.get('/fx/7/lat'), 17);
  assert(!f.writes.some(write => write.path.endsWith('/lat')));
  await f.api.restore('ch-1'); assert.deepEqual(f.snapshot(), original);
});

test('NONE to EXT with missing or incompatible fresh metadata compensates back to NONE before routing', async () => {
  for (const damage of ['missing', 'readonly']) {
    const f = fixture({ placement: 'insert1' }), original = f.snapshot();
    f.hooks.afterWrite = (path, value) => {
      if (path === '/fx/5/mdl' && value === 'EXT') {
        if (damage === 'missing') { f.values.delete('/fx/5/emode'); f.definitions.delete('/fx/5/emode'); }
        else f.definitions.set('/fx/5/ein', { ...f.definitions.get('/fx/5/ein'), readOnly: true });
      }
    };
    await assert.rejects(f.api.apply(await f.api.prepare(f.rack, { fxSlot: 5 })));
    assert.equal(f.values.get('/fx/5/mdl'), 'NONE'); assert.deepEqual(f.snapshot(), original);
    assert(!f.writes.some(write => /^\/fx\/5\/(egrp|ein|emode|fxmix|trim)$/.test(write.path)));
    assert.deepEqual(f.writes.map(write => [write.path, write.value]), [['/ch/1/mute', 1], ['/fx/5/mdl', 'EXT'], ['/fx/5/mdl', 'NONE'], ['/ch/1/mute', 0]]);
  }
});

test('a new External cannot be unloaded over external edits to default parameters or latency', async () => {
  for (const [parameter, value] of [['trim', 3], ['lat', 18]]) {
    const f = fixture({ placement: 'insert1' });
    await f.api.apply(await f.api.prepare(f.rack, { fxSlot: 5 }));
    assert(!f.api.backup('ch-1').entries.some(entry => entry.path === `/fx/5/${parameter}`), 'unchanged defaults are witnessed rather than written');
    f.values.set(`/fx/5/${parameter}`, value);
    const writes = f.writes.length, reloaded = create(f.options);
    await assert.rejects(reloaded.restore('ch-1'), /External modificato esternamente/);
    assert.equal(f.writes.length, writes); assert.equal(f.values.get('/fx/5/mdl'), 'EXT'); assert.equal(f.values.get(`/fx/5/${parameter}`), value);
    assert(reloaded.backup('ch-1'));
  }
});

test('a console already returned to NONE can finish restoring its remaining USB and insert patch', async () => {
  const f = fixture({ placement: 'insert1' }), original = f.snapshot();
  await f.api.apply(await f.api.prepare(f.rack, { fxSlot: 5 }));
  f.model(5, 'NONE');
  await f.api.restore('ch-1'); assert.deepEqual(f.snapshot(), original);
});

test('failed explicit restore releases only its temporary mute and keeps the remaining journal', async () => {
  const f = fixture(); await f.api.apply(await f.api.prepare(f.rack)); let failed = false;
  f.hooks.beforeWrite = (path, value) => { if (!failed && path === '/ch/1/in/conn/altgrp' && value === 'OFF') { failed = true; throw new Error('Restore transport failure'); } };
  await assert.rejects(f.api.restore('ch-1'), /Restore transport failure/);
  assert.equal(f.values.get('/ch/1/mute'), 0); assert(f.api.backup('ch-1'));
  await f.api.restore('ch-1'); assert.equal(f.api.backup('ch-1'), null);
});

test('insert ownership, non-External models, AutoMix, unverified SEND metadata and firmware fail closed', async () => {
  const cases = [
    f => { f.values.set('/ch/2/preins/ins', 'FX5'); },
    f => { f.values.set('/fx/5/mdl', 'HALL'); },
    f => { f.values.set('/fx/5/$a_chn', 44); },
    f => { f.rack.placement = 'insert2'; f.values.set('/ch/1/postins/mode', 'AUTO_X'); },
    f => { f.definitions.delete('/io/in/$SEND/32'); },
    f => { f.values.set('/io/in/$SEND/9/name', 'FX SEND 6L'); },
    f => { f.info.firmware = '4.0.0'; }
  ];
  for (const change of cases) {
    const f = fixture({ placement: 'insert1' }); change(f);
    await assert.rejects(f.api.prepare(f.rack, { fxSlot: 5 })); assert.equal(f.writes.length, 0);
  }
});

test('each channel restores independently, persistence never replays, and a different console cannot restore', async () => {
  const f = fixture(), second = { ...f.rack, id: 'ch-2', inputChannels: [9], outputChannels: [12] };
  f.host.racks.push(second);
  await f.api.apply(await f.api.prepare(f.rack)); await f.api.apply(await f.api.prepare(second));
  await f.api.restore('ch-1'); assert.equal(f.api.status('ch-2').active, true);
  assert.equal(f.values.get('/ch/2/in/conn/altgrp'), 'USB'); assert.equal(f.values.get('/io/out/USB/10/in'), 2);
  const reads = f.reads.length, writes = f.writes.length, storageWrites = f.storageWrites();
  const reloaded = create(f.options);
  assert.equal(f.reads.length, reads); assert.equal(f.writes.length, writes); assert.equal(f.storageWrites(), storageWrites);
  assert.equal(reloaded.status('ch-2').state, 'restore-required'); assert.equal(reloaded.sourceFor('ch-2'), null);
  f.info.name = 'Other console';
  await assert.rejects(reloaded.restore('ch-2'), /WING diversa/); assert.equal(f.writes.length, writes);
  f.info.name = 'Test console'; await reloaded.restore('ch-2'); assert.equal(f.values.get('/ch/2/in/conn/altgrp'), 'OFF');
});

test('invalid persisted paths cannot target preamp/phantom or initiate any mixer operation', async () => {
  const f = fixture(); await f.api.apply(await f.api.prepare(f.rack));
  const saved = JSON.parse(f.saved.get(STORAGE_KEY));
  saved.records[0].entries[0] = { path: '/io/in/LCL/1/vph', before: 0, after: 1, schema: copy(f.definitions.get('/io/in/LCL/1/vph')) };
  f.saved.set(STORAGE_KEY, JSON.stringify(saved));
  const reads = f.reads.length, writes = f.writes.length;
  const reloaded = create(f.options);
  await assert.rejects(reloaded.prepare(f.rack), /Backup routing non leggibile/);
  assert.equal(f.reads.length, reads); assert.equal(f.writes.length, writes);
});
