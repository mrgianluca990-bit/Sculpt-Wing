'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { Journal } = require('../dist/history.js');
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(options = {}) {
  const state = {
    selected: 'ch-1', sof: null, meters: true, version: 3,
    inputs: [{ id: 'ch-1', level: -12, mute: false }, { id: 'ch-2', level: -18, mute: false }],
    outputs: [{ id: 'bus-1', level: -6, mute: false }],
    sends: { 'ch-1': { 'bus-1': { level: -8, on: true, pre: false } } },
    desk: { processing: {
      'ch-1': { eq: { model: 'STD', params: { '1g': 0, '1f': 200, '1q': 1 }, enabled: true }, dyn: { model: 'COMP', params: { thr: -18, ratio: '2.0' }, enabled: true } },
      'ch-2': { eq: { model: 'STD', params: { '1g': 0, '1f': 600, '1q': 1 }, enabled: true } }
    }, fx: [{ model: 'VSS3', params: { dcy: 2 }, enabled: true }], channels: { 'ch-1': { source: 'LCL:1', alternateSource: 'USB:2', phantom: false } }, history: [], macros: [], sceneName: 'Prima' }
  };
  let context = { live: false }, applyCalls = 0;
  const journal = new Journal({ getState: () => state, context: () => copy(context), apply(fn) { applyCalls++; fn(state); return true; }, ...options });
  const edit = (type, fn, paths) => { const token = journal.prepare(state, type, paths ? { paths } : {}); fn(state); journal.record(token, state); };
  return { state, journal, edit, context: value => { context = value; }, applyCalls: () => applyCalls };
}
const eqPath = ['desk', 'processing', 'ch-1', 'eq'];
const dynPath = ['desk', 'processing', 'ch-1', 'dyn'];
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('one fader drag records its initial and final values once and supports undo/redo', async () => {
  const f = fixture(), channel = f.state.inputs[0], routing = f.state.desk.channels['ch-1'], send = copy(f.state.sends);
  f.journal.begin('Fader voce');
  for (let level = -11; level <= 3; level++) f.edit('strip', s => { s.inputs[0].level = level; }, [['inputs', 0]]);
  f.journal.end(); assert.equal(f.journal.status().undoCount, 1);
  assert.equal((await f.journal.run('undo')).ok, true); assert.equal(channel.level, -12);
  assert.equal(f.state.inputs[0], channel); assert.equal(f.state.desk.channels['ch-1'], routing); assert.deepEqual(f.state.sends, send);
  assert.equal((await f.journal.run('redo')).ok, true); assert.equal(channel.level, 3);
  assert.equal(f.journal.status().undoCount, 1); assert.equal(f.journal.status().redoCount, 0);
});

test('one EQ gesture merges frequency, gain and Q and preserves unrelated later routing edits', async () => {
  const f = fixture(), params = f.state.desk.processing['ch-1'].eq.params;
  f.journal.begin('Banda EQ');
  f.edit('parameter', s => { s.desk.processing['ch-1'].eq.params['1f'] = 350; }, [eqPath]);
  f.edit('parameter', s => { s.desk.processing['ch-1'].eq.params['1g'] = 4; }, [eqPath]);
  f.edit('parameter', s => { s.desk.processing['ch-1'].eq.params['1q'] = 2; }, [eqPath]);
  f.journal.end(); f.state.desk.channels['ch-1'].source = 'A:14';
  assert.equal((await f.journal.run('undo')).ok, true); assert.deepEqual(params, { '1g': 0, '1f': 200, '1q': 1 });
  assert.equal(f.state.desk.channels['ch-1'].source, 'A:14'); assert.equal(f.state.desk.processing['ch-1'].eq.params, params);
  assert.equal((await f.journal.run('redo')).ok, true); assert.deepEqual(params, { '1g': 4, '1f': 350, '1q': 2 });
});

test('an external change to any affected value rejects the entire undo before mutation', async () => {
  const f = fixture(); f.journal.begin('Canale');
  f.edit('strip', s => { s.inputs[0].level = -3; s.inputs[0].mute = true; }, [['inputs', 0]]); f.journal.end();
  f.state.inputs[0].level = -9; const before = copy(f.state);
  const result = await f.journal.run('undo'); assert.equal(result.ok, false); assert.match(result.reason, /valore.*cambiato/i);
  assert.deepEqual(f.state, before); assert.equal(f.applyCalls(), 0); assert.equal(f.journal.status().undoCount, 1);
});

test('redo rejects an external edit rather than overwriting its current value', async () => {
  const f = fixture(); f.edit('strip', s => { s.inputs[0].mute = true; }, [['inputs', 0]]);
  assert.equal((await f.journal.run('undo')).ok, true);
  f.state.inputs[0].mute = true; const before = copy(f.state);
  assert.equal((await f.journal.run('redo')).ok, false); assert.deepEqual(f.state, before); assert.equal(f.journal.status().redoCount, 1);
});

test('a new edit after undo clears redo and a gesture returning to its starting value leaves no entry', async () => {
  const f = fixture(); f.edit('strip', s => { s.inputs[0].mute = true; }, [['inputs', 0]]);
  await f.journal.run('undo'); f.edit('strip', s => { s.inputs[1].mute = true; }, [['inputs', 1]]);
  assert.equal(f.journal.status().canRedo, false); assert.equal(f.journal.status().undoCount, 1);
  f.journal.begin('Nessun cambiamento');
  f.edit('strip', s => { s.inputs[0].level = 3; }, [['inputs', 0]]);
  f.edit('strip', s => { s.inputs[0].level = -12; }, [['inputs', 0]]); f.journal.end();
  assert.equal(f.journal.status().undoCount, 1);
});

test('merged gestures retain the model guards of every edited processor', async () => {
  const f = fixture(); f.journal.begin('Due processori');
  f.edit('parameter', s => { s.desk.processing['ch-1'].eq.params['1g'] = 4; }, [eqPath]);
  f.edit('parameter', s => { s.desk.processing['ch-1'].dyn.params.thr = -30; }, [dynPath]); f.journal.end();
  f.state.desk.processing['ch-1'].eq.model = 'E88'; const before = copy(f.state);
  const result = await f.journal.run('undo'); assert.equal(result.ok, false); assert.match(result.reason, /modello/i);
  assert.deepEqual(f.state, before); assert.equal(f.applyCalls(), 0);
});

test('a model deliberately changed inside one offline gesture can restore its former parameters', async () => {
  const f = fixture(), before = copy(f.state.desk.processing['ch-1'].eq);
  f.journal.begin('Sostituisci EQ');
  f.edit('parameter', s => { s.desk.processing['ch-1'].eq.params['1g'] = 4; }, [eqPath]);
  f.edit('processing', s => { s.desk.processing['ch-1'].eq.model = 'E84'; s.desk.processing['ch-1'].eq.params = { lg: 3, lf: '110' }; }, [eqPath]);
  f.edit('parameter', s => { s.desk.processing['ch-1'].eq.params.lg = 5; }, [eqPath]); f.journal.end();
  assert.equal((await f.journal.run('undo')).ok, true); assert.deepEqual(f.state.desk.processing['ch-1'].eq, before);
  assert.equal((await f.journal.run('redo')).ok, true); assert.equal(f.state.desk.processing['ch-1'].eq.model, 'E84'); assert.deepEqual(f.state.desk.processing['ch-1'].eq.params, { lg: 5, lf: '110' });
});

test('changing an FX algorithm externally invalidates its parameter undo', async () => {
  const f = fixture(); f.edit('parameter', s => { s.desk.fx[0].params.dcy = 4; }, [['desk', 'fx', 0]]);
  f.state.desk.fx[0].model = 'HALL'; const result = await f.journal.run('undo');
  assert.equal(result.ok, false); assert.equal(f.state.desk.fx[0].params.dcy, 4); assert.equal(f.applyCalls(), 0);
});

test('a session change invalidates undo before it reaches apply', async () => {
  const f = fixture(); f.context({ live: true, session: 4 });
  f.edit('strip', s => { s.inputs[0].level = -3; }, [['inputs', 0]]); f.context({ live: true, session: 5 });
  const result = await f.journal.run('undo'); assert.equal(result.ok, false); assert.match(result.reason, /sessione/i);
  assert.equal(f.state.inputs[0].level, -3); assert.equal(f.applyCalls(), 0);
});

test('a session change during pending preflight cannot write into the newly connected session', async () => {
  const gate = defer(), f = fixture({ beforeApply: () => gate.promise }); f.context({ live: true, session: 4 });
  f.edit('strip', s => { s.inputs[0].level = -3; }, [['inputs', 0]]);
  const resultPromise = f.journal.run('undo'); assert.equal(f.journal.status().busy, true);
  f.context({ live: true, session: 5 }); gate.resolve(); const result = await resultPromise;
  assert.equal(result.ok, false); assert.equal(f.applyCalls(), 0); assert.equal(f.state.inputs[0].level, -3);
});

test('a new history entry during preflight stops the older undo instead of removing the new entry', async () => {
  const gate = defer(), f = fixture({ beforeApply: () => gate.promise });
  f.edit('strip', s => { s.inputs[0].mute = true; }, [['inputs', 0]]);
  const pending = f.journal.run('undo');
  f.edit('strip', s => { s.inputs[1].mute = true; }, [['inputs', 1]]);
  gate.resolve(); const result = await pending;
  assert.equal(result.ok, false); assert.equal(f.applyCalls(), 0); assert.equal(f.journal.status().undoCount, 2);
  assert.equal(f.state.inputs[0].mute, true); assert.equal(f.state.inputs[1].mute, true);
});

test('hardware values and schema refreshes never create user undo entries', () => {
  const f = fixture();
  f.edit('live-values', s => { s.inputs[0].level = -8; }, [['inputs', 0]]);
  f.edit('live-schema', s => { s.desk.processing['ch-1'].eq.params = {}; }, [eqPath]);
  assert.equal(f.journal.status().undoCount, 0); assert.equal(f.journal.status().canUndo, false);
});

test('a rejected apply keeps the history entry and does not pretend an undo completed', async () => {
  const f = fixture({ apply: () => false }); f.edit('strip', s => { s.inputs[0].mute = true; }, [['inputs', 0]]);
  const result = await f.journal.run('undo'); assert.equal(result.ok, false); assert.equal(f.state.inputs[0].mute, true);
  assert.equal(f.journal.status().undoCount, 1); assert.equal(f.journal.status().redoCount, 0); assert.equal(f.journal.status().busy, false);
});

function application(t) {
  const base = path.join(__dirname, '../dist');
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), { url: 'https://sculpt.invalid', runScripts: 'outside-only' });
  const w = dom.window; w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} }; w.requestAnimationFrame = () => 0;
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; };
  for (const file of ['plugin-data.js', 'model.js', 'history.js', 'app.js', 'desk.js']) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  const C = w.SculptController, D = w.SculptDesk; C.clearHistory();
  t.after(() => dom.window.close()); return { w, C, D };
}

test('real controller/desk hooks undo a grouped EQ edit and preserve channel and routing references', async t => {
  const f = application(t), ctx = { type: 'strip', id: 'ch-1', block: 'eq' }, strip = f.C.getStrip('ch-1'), source = f.D.channel('ch-1');
  const before = copy(f.D.processor(ctx).params), routing = copy(source), sends = copy(f.C.getState().sends);
  f.C.beginGesture('Banda voce'); f.D.setParam(ctx, '1g', 5); f.D.setParam(ctx, '1f', 1500); f.D.setParam(ctx, '1q', 3); f.C.endGesture();
  assert.equal(f.C.historyState().undoCount, 1); assert.equal((await f.C.undo()).ok, true);
  assert.deepEqual(copy(f.D.processor(ctx).params), before); assert.equal(f.C.getStrip('ch-1'), strip); assert.equal(f.D.channel('ch-1'), source);
  assert.deepEqual(copy(source), routing); assert.deepEqual(copy(f.C.getState().sends), sends);
  assert.equal((await f.C.redo()).ok, true); assert.equal(f.D.processor(ctx).params['1g'], 5); assert.equal(f.D.processor(ctx).params['1f'], 1500);
});

test('real controller refuses edits while undo awaits confirmation and preserves the correct stack', async t => {
  const f = application(t), gate = defer(); let waits = 0;
  f.w.SculptLive = { isLive: () => true, isConnected: () => true, isWritable: () => true, sessionToken: () => 7, applying: () => false, hasStripValue: () => true, reviewMutation: () => true, settled: () => ++waits === 1 ? gate.promise : Promise.resolve(), snapshot: () => ({ failureVersion: 0 }), canPersist: () => false };
  const strip = f.C.getStrip('ch-1'), before = strip.level;
  f.C.beginGesture('Fader'); f.C.updateStrip('ch-1', { level: -1 }); f.C.endGesture();
  const pending = f.C.undo(); assert.equal(f.C.historyState().busy, true);
  const otherBefore = f.C.getStrip('ch-2').level;
  assert.equal(f.C.updateStrip('ch-2', { level: 4 }), false); assert.equal(f.C.getStrip('ch-2').level, otherBefore);
  gate.resolve(); assert.equal((await pending).ok, true); assert.equal(strip.level, before);
  assert.equal(f.C.historyState().undoCount, 0); assert.equal(f.C.historyState().redoCount, 1);
});

test('real live undo respects read-only rejection and keeps its strip object and current value', async t => {
  const f = application(t); let writable = true;
  f.w.SculptLive = { isLive: () => true, isConnected: () => true, isWritable: () => writable, sessionToken: () => 7, applying: () => false, hasStripValue: () => true, reviewMutation: () => writable, settled: async () => {}, snapshot: () => ({ failureVersion: 0 }), canPersist: () => false };
  f.C.updateStrip('ch-1', { level: -2 }); const strip = f.C.getStrip('ch-1'); writable = false;
  const result = await f.C.undo(); assert.equal(result.ok, false); assert.equal(strip.level, -2); assert.equal(f.C.getStrip('ch-1'), strip);
  assert.equal(f.C.historyState().undoCount, 1); assert.equal(f.C.historyState().redoCount, 0);
});

test('a send created and then adjusted in one gesture merges into one reversible object patch', async () => {
  const f = fixture(), before = copy(f.state), sendPath = ['sends', 'ch-1', 'bus-2'];
  f.journal.begin('Nuova mandata');
  f.edit('parameter', s => { s.desk.processing['ch-1'].eq.params['1g'] = 2; }, [eqPath]);
  f.edit('send', s => { s.sends['ch-1']['bus-2'] = { level: -90, on: true, pre: false }; }, [['sends']]);
  f.edit('send', s => { s.sends['ch-1']['bus-2'].level = -18; }, [['sends']]);
  f.edit('send', s => { s.sends['ch-1']['bus-2'].level = -5; }, [['sends']]);
  f.journal.end();
  const entry = f.journal.past.at(-1), sendPatches = entry.patches.filter(patch => patch.path[0] === 'sends');
  assert.equal(f.journal.status().undoCount, 1); assert.equal(sendPatches.length, 1);
  assert.deepEqual(sendPatches[0].path, sendPath); assert.equal(sendPatches[0].beforeExists, false);
  assert.deepEqual(sendPatches[0].after, { level: -5, on: true, pre: false });
  assert.ok(entry.guards.some(guard => JSON.stringify(guard.path) === JSON.stringify([...eqPath, 'model'])), 'merging the send must retain the earlier EQ model guard');
  f.state.desk.processing['ch-1'].eq.model = 'E88';
  assert.equal((await f.journal.run('undo')).ok, false, 'a changed EQ model still rejects the whole grouped action');
  assert.equal(f.state.sends['ch-1']['bus-2'].level, -5);
  f.state.desk.processing['ch-1'].eq.model = 'STD';
  assert.equal((await f.journal.run('undo')).ok, true); assert.deepEqual(f.state, before);
  assert.equal((await f.journal.run('redo')).ok, true); assert.deepEqual(f.state.sends['ch-1']['bus-2'], { level: -5, on: true, pre: false });
  assert.deepEqual(f.state.sends['ch-1']['bus-1'], before.sends['ch-1']['bus-1']);
  assert.deepEqual(f.state.desk.channels, before.desk.channels);
});

test('an object edited and deleted in one gesture restores its original content and keeps unrelated model guards', async () => {
  const f = fixture(), before = copy(f.state);
  f.journal.begin('Rimuovi processore');
  f.edit('parameter', s => { s.desk.processing['ch-1'].eq.params['1g'] = 5; }, [eqPath]);
  f.edit('parameter', s => { s.desk.processing['ch-1'].dyn.params.thr = -30; }, [dynPath]);
  f.edit('processing', s => { delete s.desk.processing['ch-1'].eq; }, [['desk', 'processing', 'ch-1']]);
  f.journal.end();
  const entry = f.journal.past.at(-1), eqPatches = entry.patches.filter(patch => patch.path.slice(0, 4).join('/') === eqPath.join('/'));
  assert.equal(eqPatches.length, 1); assert.deepEqual(eqPatches[0].path, eqPath); assert.equal(eqPatches[0].afterExists, false);
  assert.deepEqual(eqPatches[0].before, before.desk.processing['ch-1'].eq, 'the ancestor patch must contain values before any child edit in this gesture');
  assert.equal(entry.guards.some(guard => guard.path.join('/') === [...eqPath, 'model'].join('/')), false, 'the removed model is contained in the object patch itself');
  assert.ok(entry.guards.some(guard => guard.path.join('/') === [...dynPath, 'model'].join('/')), 'the independent dynamics model guard is preserved');
  f.state.desk.processing['ch-1'].dyn.model = 'LA';
  assert.equal((await f.journal.run('undo')).ok, false); assert.equal('eq' in f.state.desk.processing['ch-1'], false);
  f.state.desk.processing['ch-1'].dyn.model = 'COMP';
  assert.equal((await f.journal.run('undo')).ok, true); assert.deepEqual(f.state, before);
  assert.equal((await f.journal.run('redo')).ok, true); assert.equal('eq' in f.state.desk.processing['ch-1'], false);
  assert.equal(f.state.desk.processing['ch-1'].dyn.params.thr, -30); assert.deepEqual(f.state.desk.channels, before.desk.channels);
});
