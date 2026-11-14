'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const M = require('../dist/model.js'), K = require('../dist/plugin-data.js'), W = require('../dist/wing-map.js');
const { Session } = require('../dist/live-session.js');
const copy = value => JSON.parse(JSON.stringify(value));
const nextTask = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function deskState() {
  const state = M.defaults(), C = { getState: () => state, listStrips: () => M.list(state), getStrip: id => M.find(state, id), transact: fn => fn(state), subscribe: () => () => {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/desk.js'), 'utf8'), { window: { SculptController: C, SculptModel: M, SculptCatalog: K } });
  return state;
}
class FixtureWing {
  constructor(state) {
    this.values = W.capture(state); this.definitions = new Map(); this.writes = []; this.reads = []; this.listeners = { value: new Set(), status: new Set(), meters: new Set(), schema: new Set() };
    for (const entry of W.descriptors(state)) if (this.values.has(entry.path)) this.definitions.set(entry.path, { path: entry.path, type: entry.type === 'string' ? 7 : entry.type === 'integer' ? 4 : 1, revision: 1, readOnly: !!entry.readOnly });
  }
  listen(kind, fn) { this.listeners[kind].add(fn); return () => this.listeners[kind].delete(fn); }
  onValue(fn) { return this.listen('value', fn); } onStatus(fn) { return this.listen('status', fn); }
  onStripMeters(fn) { return this.listen('meters', fn); } onSchemaChange(fn) { return this.listen('schema', fn); }
  emit(kind, ...args) { for (const listener of this.listeners[kind]) listener(...args); }
  async connect() { return { name: 'Deterministic fixture', model: 'WING', firmware: 'fixture' }; }
  async disconnect() { this.emit('status', 'disconnected'); }
  async describe(path) {
    if (this.definitions.has(path)) return this.definitions.get(path);
    if ([...this.definitions.keys()].some(key => key.startsWith(path + '/'))) return { path, type: 0, revision: 1 };
    throw new Error('Unknown fixture node ' + path);
  }
  async list(path) {
    const children = new Map();
    for (const [key, meta] of this.definitions) if (key.startsWith(path + '/')) {
      const suffix = key.slice(path.length + 1), direct = path + '/' + suffix.split('/')[0];
      if (!children.has(direct)) children.set(direct, direct === key ? meta : { path: direct, type: 0, revision: 1 });
    }
    return [...children.values()];
  }
  async readTree(path) {
    this.reads.push(path); const own = await this.describe(path);
    return own.type === 0 ? Object.fromEntries((await this.list(path)).filter(meta => meta.type !== 0).map(meta => [meta.path, this.values.get(meta.path)])) : { [path]: this.values.get(path) };
  }
  async get(path) { return this.values.get(path); }
  async set(path, value, options) {
    this.writes.push({ path, value, options }); if (this.setHook) await this.setHook(path, value);
    this.values.set(path, value); this.emit('value', path, value);
  }
  async subscribeStripMeters(selection) { this.meterSelection = selection; }
}
function fixture(t, { connected = true } = {}) {
  let state = deskState(); const driver = new FixtureWing(state), captures = [], descriptors = [], errors = [];
  const map = { ...W,
    capture(value, scope) { const result = W.capture(value, scope); captures.push({ scope, size: result.size }); return result; },
    descriptors(value, scope) { const result = W.descriptors(value, scope); descriptors.push({ scope, size: result.length }); return result; }
  };
  const session = new Session({ driver, map, getState: () => state, mutate: fn => fn(state), onError: error => errors.push(error) });
  if (connected) {
    session.mode = 'live'; session.writable = true; session.values = new Map(driver.values); session.metadata = new Map(driver.definitions);
  }
  t.after(() => session.dispose());
  return { driver, session, captures, descriptors, errors, get state() { return state; },
    edit(mutator, type, id) { const before = copy(state), after = copy(state); mutator(after); const result = session.review(before, after, type, id); if (result.ok) state = after; return result; }
  };
}

test('scoped capture and descriptors retain exact values and omit every unrelated console field', () => {
  const state = deskState(), scope = { paths: ['/ch/1/fdr', '/bus/3/pan'], bases: ['/ch/1/eq', '/aux/2/send/MX4'] };
  const all = W.capture(state), small = W.capture(state, scope);
  const inside = path => scope.paths.includes(path) || scope.bases.some(base => path === base || path.startsWith(base + '/'));
  assert.deepEqual([...small].sort(), [...all].filter(([path]) => inside(path)).sort());
  assert.deepEqual(W.descriptors(state, scope).map(x => x.path).sort(), W.descriptors(state).filter(x => inside(x.path)).map(x => x.path).sort());
  assert(small.size < 100); assert(all.size > 20000);
});

test('incoming batches match individual authoritative updates, including model-dependent leaves', () => {
  const before = deskState(), expected = copy(before), actual = copy(before);
  const updates = [['/ch/1/dyn/mdl', '76LA'], ['/ch/2/dyn/mdl', 'LA'], ['/ch/1/dyn/in', -12], ['/ch/1/dyn/out', 4],
    ['/ch/1/fdr', -17.5], ['/ch/2/pan', 21], ['/ch/1/send/3/lvl', -9], ['/ch/1/send/3/mode', 'POST'],
    ['/dca/3/fdr', -6], ['/ch/1/tags', '#D3 voice'], ['/unknown/never', 1], ['/ch/2/fdr', NaN]];
  let written = 0;
  for (const [path, value] of updates) if (W.apply(expected, path, value)) written++;
  assert.equal(W.applyMany(actual, updates), written);
  assert.deepEqual(actual, expected);
  assert.equal(W.capture(actual, { bases: ['/ch/1/dyn'] }).get('/ch/1/dyn/in'), -12);
  assert.equal(W.capture(actual, { bases: ['/ch/1/dyn'] }).has('/ch/1/dyn/thr'), false, 'the old algorithm scope is invalidated');
});

test('CH, AUX, BUS, MAIN, MTX and DCA gestures validate only their exact leaves', async t => {
  const f = fixture(t);
  for (const id of ['ch-1', 'aux-2', 'bus-3', 'main-4', 'mtx-5']) {
    f.captures.length = 0; f.descriptors.length = 0;
    assert.equal(f.edit(s => { M.find(s, id).level = -17.5; M.find(s, id).pan = -31; }, 'strip', id).ok, true);
    assert.deepEqual(f.captures.map(x => x.size), [2, 2]); assert.deepEqual(f.descriptors.map(x => x.size), [2]);
  }
  f.captures.length = 0;
  assert.equal(f.edit(s => { s.desk.dca[7].level = -5.5; }, 'dca', 'dca-8').ok, true);
  assert.deepEqual(f.captures.map(x => x.size), [1, 1]);
  await f.session.settled();
  assert.equal(f.driver.writes.length, 11); assert(f.driver.writes.every(x => x.options.revision === 1));
  assert.deepEqual(f.driver.writes.at(-1), { path: '/dca/8/fdr', value: -5.5, options: { revision: 1 } });
});

test('SOF sends retain coupled pan/link/mode fields and only transmit the final requested values', async t => {
  const f = fixture(t); f.state.sof = 'bus-4';
  assert.equal(f.edit(s => M.setSend(s, 'ch-2', 'bus-4', { level: -18, pan: -23, panLink: false, pre: false }), 'send', 'ch-2').ok, true);
  assert(f.captures.every(x => x.scope?.bases[0] === '/ch/2/send/4' && x.size <= 8));
  assert.equal(f.edit(s => M.setSend(s, 'ch-2', 'bus-4', { level: -8, pan: 31, panLink: true }), 'send', 'ch-2').ok, true);
  assert.equal(f.edit(s => M.setSend(s, 'main-1', 'mtx-4', { level: -11, on: true }), 'send', 'main-1').ok, true);
  const directLevel = M.find(f.state, 'ch-2').level;
  await f.session.settled();
  const writes = new Map(f.driver.writes.map(x => [x.path, x.value]));
  assert.equal(writes.get('/ch/2/send/4/lvl'), -8); assert.equal(writes.get('/ch/2/send/4/pan'), 31); assert.equal(writes.get('/ch/2/send/4/plink'), 1); assert.equal(writes.get('/ch/2/send/4/mode'), 'POST');
  assert.equal(writes.get('/main/1/send/MX4/lvl'), -11); assert.equal(M.find(f.state, 'ch-2').level, directLevel); assert.equal(f.state.sof, 'bus-4');
});

test('multi-axis EQ moves use the actual processor map and preserve read-only and unloaded gates', async t => {
  const f = fixture(t), ctx = { type: 'strip', id: 'ch-1', block: 'eq' }, proc = f.state.desk.processing['ch-1'].eq;
  const definition = K.get(ctx, proc.model), params = definition.parameters.filter(p => p.type === 'number' || p.type === 'float');
  const candidates = (params.length ? params : definition.parameters.filter(p => typeof proc.params[p.key] === 'number')).slice(0, 2);
  assert.equal(candidates.length, 2);
  const spec = W.processorSpec(ctx, proc.model), paths = candidates.map(p => spec.parameterPath(p.key));
  const move = s => { for (const p of candidates) s.desk.processing['ch-1'].eq.params[p.key] = Number(proc.params[p.key]) + 1; };
  assert.equal(f.edit(move, 'parameter').ok, true); assert(f.captures.every(x => x.scope?.bases.includes('/ch/1/eq') && x.size < 100));
  await f.session.settled(); assert.deepEqual(f.driver.writes.map(x => x.path).sort(), paths.sort());
  f.session.metadata.set('/ch/1/pan', { ...f.session.metadata.get('/ch/1/pan'), readOnly: true });
  assert.equal(f.edit(s => { M.find(s, 'ch-1').pan = 22; }, 'strip', 'ch-1').ok, false);
  f.session.values.delete('/ch/1/fdr'); assert.equal(f.edit(s => { M.find(s, 'ch-1').level = -22; }, 'strip', 'ch-1').ok, false);
  assert.equal(f.session.pending.size, 0);
});

test('foreign, unmapped and model edits cannot hide inside a gesture scope', async t => {
  const f = fixture(t);
  const result = f.edit(s => { M.find(s, 'ch-1').level = -22; s.desk.unsupportedRoute = 'BUS3'; }, 'strip', 'ch-1');
  assert.equal(result.ok, false); assert(f.captures.some(x => x.scope === null && x.size > 20000)); assert.equal(f.session.pending.size, 0);
  f.captures.length = 0;
  assert.equal(f.edit(s => { M.find(s, 'ch-1').level = -22; M.find(s, 'bus-3').pan = 12; }, 'strip', 'ch-1').ok, true);
  assert(f.captures.every(x => x.scope === null), 'cross-strip changes use the full validated projection');
  await f.session.settled(); assert.deepEqual(f.driver.writes.map(x => x.path), ['/bus/3/pan', '/ch/1/fdr']);
  f.captures.length = 0;
  f.edit(s => { s.desk.processing['ch-1'].eq.model = 'SOUL'; }, 'parameter');
  assert(f.captures.every(x => x.scope === null), 'model replacement retains the complete invalidation flow');
});

test('the shorter coalescing window never loses the last value behind an in-flight readback', async t => {
  const f = fixture(t), wait = deferred(); f.driver.setHook = () => wait.promise;
  assert.equal(f.edit(s => { M.find(s, 'ch-1').level = -20; }, 'strip', 'ch-1').ok, true);
  const pending = f.session.settled(); await nextTask();
  for (const level of [-17, -14, -11]) assert.equal(f.edit(s => { M.find(s, 'ch-1').level = level; }, 'strip', 'ch-1').ok, true);
  assert.equal(f.driver.writes.length, 1); wait.resolve(); await pending;
  assert.deepEqual(f.driver.writes.map(x => x.value), [-20, -11]); assert.equal(M.find(f.state, 'ch-1').level, -11);
  assert.equal(f.session.pending.size, 0);
});

test('channel-list batches order only requested mute/send changes and still capture the complete map once', async t => {
  const f = fixture(t);
  M.find(f.state, 'ch-1').mute = false; M.find(f.state, 'ch-2').mute = true;
  M.setSend(f.state, 'ch-1', 'bus-1', { on: true, followMute: false }); M.setSend(f.state, 'ch-2', 'bus-1', { on: false, followMute: true });
  f.session.values = W.capture(f.state);
  assert.equal(f.edit(s => {
    M.find(s, 'ch-1').mute = true; M.find(s, 'ch-2').mute = false;
    M.setSend(s, 'ch-1', 'bus-1', { on: false, followMute: true, level: -25 });
    M.setSend(s, 'ch-2', 'bus-1', { on: true, followMute: false, level: -9 });
  }, 'channel-list').ok, true);
  assert.equal(f.captures.length, 2); assert.equal(f.descriptors.length, 1); assert(f.captures.every(x => x.scope === null));
  await f.session.settled();
  const writes = f.driver.writes.map(x => x.path);
  assert.equal(writes[0], '/ch/1/mute'); assert.equal(writes[1], '/ch/1/send/1/on'); assert.equal(writes[2], '/ch/1/send/1/pon');
  assert.deepEqual(writes.slice(-3), ['/ch/2/send/1/pon', '/ch/2/send/1/on', '/ch/2/mute']); assert.equal(writes.length, 8);
});

test('initial live sync reads all 16 DCA names/levels and channel-tag memberships without writing or requesting audio meters', async t => {
  const f = fixture(t, { connected: false });
  for (const path of [...f.driver.values.keys()]) if (!/^\/(?:ch|aux|bus|main|mtx)\/\d+\/(?:fdr|name|mute|tags)$/.test(path) && !/^\/dca\/\d+\/(?:fdr|name|mute|\$solo)$/.test(path)) { f.driver.values.delete(path); f.driver.definitions.delete(path); }
  for (const [path] of f.driver.values) if (path.endsWith('/tags')) f.driver.values.set(path, '');
  f.driver.values.set('/ch/1/tags', 'voice #D2 #D16'); f.driver.values.set('/aux/1/tags', '#D2');
  for (let n = 1; n <= 16; n++) { f.driver.values.set(`/dca/${n}/name`, `Tour ${n}`); f.driver.values.set(`/dca/${n}/fdr`, -n / 2); }
  await f.session.connect('192.168.1.100');
  assert.equal(f.session.snapshot().syncTotal, 92); assert.equal(f.session.snapshot().syncDone, 92); assert.equal(f.session.writable, true);
  for (let n = 1; n <= 16; n++) { assert.equal(f.state.desk.dca[n - 1].name, `Tour ${n}`); assert.equal(f.state.desk.dca[n - 1].level, -n / 2); assert(f.session.metadata.has(`/dca/${n}/name`)); }
  assert.deepEqual(copy(f.state.desk.dca[1].members).sort(), ['aux-1', 'ch-1']); assert.deepEqual(copy(f.state.desk.dca[15].members), ['ch-1']); assert.deepEqual(copy(f.state.desk.dca[0].members), []);
  assert.equal(f.driver.writes.length, 0); assert.equal(f.driver.meterSelection.dca, undefined);
  const reads = f.driver.reads.length; await f.session.loadScope('dca'); assert.equal(f.driver.reads.length, reads, 'opening DCA reuses the already hydrated scalar tags');
  f.driver.values.set('/dca/16/name', 'Updated'); await f.session.loadNode('/dca/16', { force: true }); assert.equal(f.state.desk.dca[15].name, 'Updated');
  f.driver.emit('value', '/dca/2/name', 'Incoming'); f.driver.emit('value', '/dca/2/fdr', -13.5); f.session.flush();
  assert.equal(f.state.desk.dca[1].name, 'Incoming'); assert.equal(f.state.desk.dca[1].level, -13.5);
});
