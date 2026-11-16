'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const dist = path.join(__dirname, '../dist'), tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function until(predicate) { const end = Date.now() + 5000; while (Date.now() < end) { if (predicate()) return; await tick(); } assert.fail('Expected editor state was not reached'); }
function fixture(t, { live = false, realPlugins = false, connected = true } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), { url: 'https://sculpt.test', runScripts: 'outside-only' }), w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0; w.cancelAnimationFrame = () => {};
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; }; w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.setPointerCapture = function () {}; w.HTMLElement.prototype.releasePointerCapture = function () {};
  w.HTMLDialogElement.prototype.show = function () { this.open = true; }; w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const mounted = [], disposed = [], vst = [], vstDisposed = [];
  const files = ['plugin-data.js','model.js','history.js','app.js','desk.js','shell.js', ...(realPlugins ? ['plugin-panels.js', ...['layouts','dynamics','eq','fx','channel','native','dynamics-extra','filters'].map(part => 'plugin-original-' + part + '.js'), 'plugins.js'] : []), 'wing-map.js','channel-chain.js','editor.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(dist, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  const renderer = w.SculptFX?.renderProcessor;
  w.SculptFX = { ...w.SculptFX, renderProcessor(host, ctx, options) { mounted.push({ ...ctx }); const cleanup = renderer?.(host, ctx, options); if (!renderer) { const label = w.document.createElement('span'); label.textContent = 'Processor ' + JSON.stringify(ctx); host.append(label); } return () => { disposed.push({ ...ctx }); cleanup?.(); }; }, renderPrincipal: w.SculptFX?.renderPrincipal || (() => () => {}) };
  w.SculptVst = { renderChannel(host, id) { vst.push(id); host.textContent = 'Rack VST3 · ' + id; return () => vstDisposed.push(id); } };
  let mode = 'compact'; w.SculptMixerView = { mode: () => mode };
  const E = w.SculptEditor, C = w.SculptController, D = w.SculptDesk, M = w.SculptWingMap;
  const values = new Map(), metadata = new Map(), listeners = new Set(), reads = [], scopes = [], processorReads = [], writes = [], holds = new Map(), processorHolds = new Map();
  let writable = true, applying = false, scopeHold = null;
  const emit = () => { for (const listener of [...listeners]) listener(); };
  const define = (node, value, meta = {}) => { values.set(node, value); metadata.set(node, { path: node, revision: 1, type: typeof value === 'string' ? 7 : 4, readOnly: false, ...meta }); };
  const receive = entries => { for (const [node, value] of Object.entries(entries)) values.set(node, value); applying = true; try { C.transact(state => M.applyMany(state, Object.entries(entries)), 'live-values', { record: false }); } finally { applying = false; } emit(); };
  if (live) {
    w.SculptLive = {
      isLive: () => true, isConnected: () => connected, isWritable: () => writable, sessionToken: () => 1, applying: () => applying, canPersist: () => false,
      snapshot: () => ({ mode: connected ? 'live' : 'offline', writable, pending: 0, failureVersion: 0 }), hasStripValue: () => true,
      hasValue: node => values.has(node), value: node => values.get(node), metadata: node => metadata.get(node), settled: async () => {},
      readNode: async node => { reads.push(node); await holds.get(node)?.promise; }, loadScope: async (scope, args) => { scopes.push({ scope, args }); await scopeHold?.promise; },
      ensureProcessor: async ctx => { processorReads.push({ ...ctx }); await processorHolds.get(ctx.slot)?.promise; },
      describeNode: async node => metadata.get(node), readValues: async node => values.has(node) ? { [node]: values.get(node) } : {},
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, reviewMutation(before, after, type, id) { writes.push({ type, id }); return writable; }
    };
    define('/ch/1/proc', 'GEDI', { type: 5, items: [{ value: 'GEDI' }] }); define('/ch/1/ptap', 'PFL', { type: 5, items: [{ value: 'PFL' }] });
    receive({ '/ch/1/proc': 'GEDI', '/ch/1/ptap': 'PFL' });
  }
  const editor = () => w.document.querySelector('.editor-dialog'), panel = () => editor().querySelector('.editor-panel'), card = key => editor().querySelector('[data-module="' + key + '"]');
  const named = (name, root = editor()) => root.querySelector('[aria-label="' + name + '"]');
  const tab = name => editor().querySelector('.editor-tabs [data-tab="' + name + '"]').click();
  const selectedTab = () => editor().querySelector('.editor-tabs [aria-selected="true"]').dataset.tab;
  const change = (input, value) => { assert(input, 'Control exists'); input.value = String(value); input.dispatchEvent(new w.Event('change', { bubbles: true })); };
  t.after(async () => { E.close(); await tick(); assert.equal(listeners.size, 0); w.close(); });
  return { w, E, C, D, editor, panel, card, named, tab, selectedTab, change, mounted, disposed, vst, vstDisposed, reads, scopes, processorReads, writes, values, metadata, define, receive, emit, holds, processorHolds, holdScope(wait) { scopeHold = wait; }, setWritable(value) { writable = value; emit(); }, setMode(value) { mode = value; w.dispatchEvent(new w.Event('sculpt-mixer-view')); } };
}

test('only Canale, VST3 and FX are exposed; every legacy section opens its corresponding channel card', t => {
  const f = fixture(t); f.E.open('ch-1');
  assert.deepEqual([...f.editor().querySelectorAll('.editor-tabs [role=tab]')].map(node => node.textContent), ['Canale', 'VST3', 'FX']);
  assert.deepEqual(plain(f.E.sections()), [{ id: 'devices', name: 'Canale' }, { id: 'vst3', name: 'VST3' }, { id: 'fx', name: 'FX' }]);
  const before = plain(f.C.capture().values);
  for (const [section, options, module] of [['channel', {}, 'home'], ['processing', {}, 'input'], ['processing', { device: 'post' }, 'post'], ['eq', {}, 'eq'], ['dynamics', { block: 'gate' }, 'gate'], ['dynamics', {}, 'dyn'], ['sends', {}, 'sends'], ['groups', {}, 'home']]) {
    assert.equal(f.E.openSection('ch-1', section, options), true); assert.equal(f.selectedTab(), 'devices');
    assert.equal(f.card(module).dataset.expanded, 'true'); assert(f.card(module).classList.contains('is-selected')); assert.equal(f.editor().querySelectorAll('.editor-device-panel').length, 9);
  }
  assert.equal(f.card('home').querySelector('.editor-home-groups').open, true); assert.equal(f.E.openSection('bus-1', 'dynamics', { block: 'gate' }), false);
  assert.deepEqual(plain(f.C.capture().values), before, 'Navigation does not change audio state');
  f.setMode('extended'); assert.deepEqual([...f.editor().querySelectorAll('.editor-tabs [role=tab]')].map(node => node.textContent), ['Canale', 'VST3', 'FX']);
  f.named('Rinomina canale').click(); assert.equal(f.w.document.activeElement, f.named('Nome')); assert.equal(f.card('home').dataset.expanded, 'true');
});

test('Home keeps DCA, mute membership, recall safes and atomic automix assignment in the channel view', async t => {
  const f = fixture(t); f.E.openSection('ch-1', 'groups');
  const home = f.card('home'), eq = f.card('eq');
  const dca = home.querySelector('.editor-membership'), member = f.D.get().dca[0].members.includes('ch-1'); dca.click(); assert.equal(f.D.get().dca[0].members.includes('ch-1'), !member);
  const mute = [...home.querySelectorAll('.editor-membership')].find(node => node.getAttribute('aria-label').includes('Mute group 1')), before = f.D.get().muteGroups[0].members.includes('ch-1'); mute.click(); assert.equal(f.D.get().muteGroups[0].members.includes('ch-1'), !before);
  f.named('Proteggi canale dal richiamo scene', home).click(); assert(f.D.get().safes.includes('ch-1'));
  f.D.assignFx(7, 'ch-1', 'post'); f.C.clearHistory(); f.change(f.named('Gruppo automix', home), 'x');
  assert(f.D.get().automix.x.channels.includes('ch-1')); assert.equal(f.D.channel('ch-1').postFx, null); assert.equal(f.D.get().fx[6].stripId, null);
  assert.equal(f.C.historyState().undoCount, 1); assert.equal(f.card('eq'), eq); assert.equal(f.card('home'), home);
  assert.equal((await f.C.undo()).ok, true); assert.equal(f.D.channel('ch-1').postFx, 7); assert(!f.D.get().automix.x.channels.includes('ch-1'));
  f.named('Apri ingresso del canale', home).click(); assert(f.card('input').classList.contains('is-selected')); assert.equal(f.selectedTab(), 'devices');
});

test('Home live group controls require a fresh bounded read and the current leaf metadata', async t => {
  const f = fixture(t, { live: true }), gate = deferred(); f.holds.set('/dca/1', gate);
  f.define('/ch/1/tags', '', { maxLength: 80 }); f.define('/ch/1/postins/mode', 'FX', { type: 5, items: ['FX','AUTO_X','AUTO_Y'].map(value => ({ value })) }); f.define('/ch/1/postins/ins', 'NONE');
  f.define('/dca/1/name', 'Voci'); f.define('/dca/1/fdr', 0, { type: 3 }); f.define('/dca/1/mute', 0);
  f.receive({ '/ch/1/tags': '', '/ch/1/postins/mode': 'FX', '/ch/1/postins/ins': 'NONE' }); f.E.openSection('ch-1', 'groups');
  await until(() => f.reads.includes('/dca/1'));
  let dca = f.card('home').querySelector('.editor-membership'); assert.equal(dca.disabled, true); assert.equal(f.named('Gruppo automix', f.card('home')).disabled, true);
  dca.dispatchEvent(new f.w.MouseEvent('click', { bubbles: true })); assert.equal(f.writes.length, 0);
  gate.resolve(); await until(() => !f.card('home').querySelector('.editor-membership').disabled);
  assert(f.reads.includes('/cfg/amix')); assert(f.reads.includes('/ch/1/postins')); assert(!f.scopes.some(request => request.scope === 'groups'), 'Home never asks for the broad all-strip group scope');
  assert(!f.reads.includes('/ch/2/postins'), 'Reading Home is bounded to the selected channel and group controls');
  dca = f.card('home').querySelector('.editor-membership'); dca.click(); assert(f.D.get().dca[0].members.includes('ch-1'));
  f.metadata.get('/ch/1/tags').readOnly = true; f.emit(); dca = f.card('home').querySelector('.editor-membership'); assert.equal(dca.disabled, true);
  const writes = f.writes.length; dca.dispatchEvent(new f.w.MouseEvent('click', { bubbles: true })); assert.equal(f.writes.length, writes);
  f.setWritable(false); assert.equal(f.named('Gruppo automix', f.card('home')).disabled, true);
});

test('VST3 stays available while WING is disconnected and disposes only the channel surface being left', t => {
  const f = fixture(t, { live: true, connected: false }); f.E.openSection('ch-1', 'vst3');
  assert.equal(f.selectedTab(), 'vst3'); assert.deepEqual(f.vst, ['ch-1']); assert(!f.panel().textContent.includes('WING non collegata')); assert.equal(f.reads.length, 0); assert.equal(f.scopes.length, 0);
  f.E.open('ch-2'); assert.equal(f.selectedTab(), 'vst3'); assert.deepEqual(f.vst, ['ch-1','ch-2']); assert.deepEqual(f.vstDisposed, ['ch-1']);
  f.setWritable(false); assert.deepEqual(f.vst, ['ch-1','ch-2']); f.E.close(); assert.deepEqual(f.vstDisposed, ['ch-1','ch-2']);
});

test('FX offers all sixteen real processors and current-channel insert assignments with disposal and channel continuity', t => {
  const f = fixture(t, { realPlugins: true }); f.E.openDevice('ch-1', 'sends'); f.editor().querySelector('.editor-device-board').scrollLeft = 431; f.tab('fx');
  assert.equal(f.editor().querySelectorAll('.editor-fx-slot').length, 16); assert(f.named('Modello FX 1')); assert(f.named('Assegna Insert 1')); assert(f.named('Assegna Insert 2'));
  const input = f.panel().querySelector('.editor-fx-processor [data-parameter] input[type=number]'), key = input.closest('[data-parameter]').dataset.parameter, before = f.D.processor({ type: 'fx', slot: 1 }).params[key], value = Number(input.max) !== before ? Number(input.max) : Number(input.min);
  f.change(input, value); assert.equal(f.D.processor({ type: 'fx', slot: 1 }).params[key], value);
  f.change(f.named('Assegna Insert 2'), '7'); assert.equal(f.D.channel('ch-1').postFx, 7); f.named('Apri FX di Insert 2').click(); assert(f.named('Modello FX 7'));
  const old = f.named('Assegna Insert 1'); f.E.open('ch-2'); assert.equal(f.selectedTab(), 'fx'); assert(f.named('Modello FX 7')); f.change(old, '3'); assert.notEqual(f.D.channel('ch-2').preFx, 3);
  f.tab('devices'); assert.equal(f.editor().querySelector('.editor-device-board').scrollLeft, 431); assert.equal(f.card('sends').dataset.expanded, 'true');
  assert(f.disposed.some(ctx => ctx.type === 'fx' && ctx.slot === 7));
  f.E.openSection('aux-1', 'fx'); assert(f.named('Assegna Insert 1')); assert.equal(f.named('Assegna Insert 2'), null);
});

test('FX waits for its live scope and processor and ignores an obsolete completion after returning to Canale', async t => {
  const f = fixture(t, { live: true }), scope = deferred(), one = deferred(), two = deferred(); f.holdScope(scope); f.processorHolds.set(1, one); f.processorHolds.set(2, two);
  f.E.openSection('ch-1', 'fx'); await tick(); assert.equal(f.mounted.filter(ctx => ctx.type === 'fx').length, 0); assert(f.panel().querySelector('.editor-live-read'));
  scope.resolve(); await until(() => f.processorReads.some(ctx => ctx.type === 'fx' && ctx.slot === 1)); assert.equal(f.mounted.filter(ctx => ctx.type === 'fx').length, 0);
  assert(f.reads.includes('/ch/1/preins')); assert(f.reads.includes('/ch/1/postins')); one.resolve(); await until(() => f.editor().querySelectorAll('.editor-fx-slot').length === 16);
  assert.equal(f.mounted.filter(ctx => ctx.type === 'fx').length, 1); f.named('Apri FX 2').click(); await until(() => f.processorReads.some(ctx => ctx.slot === 2));
  f.tab('devices'); const board = f.editor().querySelector('.editor-device-board'); two.resolve(); await tick();
  assert.equal(f.selectedTab(), 'devices'); assert.equal(f.editor().querySelector('.editor-device-board'), board); assert(!f.mounted.some(ctx => ctx.type === 'fx' && ctx.slot === 2));
});
