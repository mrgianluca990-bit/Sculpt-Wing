'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const Model = require('../dist/model.js');
const Scene = require('../dist/channel-list-scene.js');
const base = path.join(__dirname, '../dist');
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), { url: 'https://sculpt.test', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0;
  w.HTMLElement.prototype.scrollTo = function () {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.setPointerCapture = function () {};
  w.HTMLDialogElement.prototype.show = function () { this.open = true; };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  for (const file of ['plugin-data.js', 'model.js', 'app.js', 'desk.js', 'shell.js', 'editor.js', 'io.js', 'wing-map.js']) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  const C = w.SculptController, D = w.SculptDesk, E = w.SculptEditor;
  const name = () => w.document.getElementById('editor-channel-name');
  const key = (node, value) => node.dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  const change = (node, value) => { node.value = value; node.dispatchEvent(new w.Event('change', { bubbles: true })); };
  return { w, C, D, E, name, key, change };
}

test('explicitly clearing an input or output name restores its family and channel number only', () => {
  const state = Model.defaults();
  for (const id of ['ch-1', 'ch-40', 'aux-3', 'bus-7', 'mtx-2', 'main-4']) {
    const strip = Model.find(state, id), before = plain(strip);
    Model.patchStrip(strip, { name: '  \t\n ' });
    assert.equal(strip.name, `${strip.kind} ${strip.number}`);
    assert.deepEqual({ ...plain(strip), name: before.name }, before, `${id}: no level, color, processing or routing fields change`);
  }
  const strip = Model.find(state, 'ch-1');
  Model.patchStrip(strip, { name: '  Voce ospite  ' }); assert.equal(strip.name, 'Voce ospite');
  Model.patchStrip(strip, { name: null }); assert.equal(strip.name, 'Voce ospite', 'an omitted or non-string patch is not a clear-name command');
});

test('editor allows a blank while typing and restores the default on Enter, blur or change', t => {
  const f = fixture(t);
  for (const [id, event] of [['ch-1', 'Enter'], ['aux-2', 'blur'], ['bus-3', 'change'], ['mtx-4', 'Enter'], ['main-2', 'blur']]) {
    f.C.updateStrip(id, { name: 'Custom' }); f.E.openSection(id, 'channel');
    const input = f.name(); input.focus(); input.value = '   '; input.dispatchEvent(new f.w.Event('input', { bubbles: true }));
    assert.equal(f.C.getStrip(id).name, 'Custom'); assert.equal(input.value, '   ', 'typing does not immediately reinsert a name');
    if (event === 'Enter') f.key(input, 'Enter'); else if (event === 'blur') input.blur(); else input.dispatchEvent(new f.w.Event('change', { bubbles: true }));
    const expected = Model.defaultName(f.C.getStrip(id));
    assert.equal(f.C.getStrip(id).name, expected); assert.equal(input.value, expected);
    assert.equal(f.w.document.getElementById('editor-title').textContent, expected);
    assert.equal(f.w.document.querySelector(`.strip[data-id="${id}"] .strip-name`).textContent, expected);
  }
});

test('rename shortcut and pending empty names stay attached to the correct channel', t => {
  const f = fixture(t); f.C.updateStrip('ch-1', { name: 'Voce' }); f.C.updateStrip('ch-2', { name: 'Chitarra' });
  f.E.open('ch-1'); f.w.document.querySelector('[aria-label="Rinomina canale"]').click();
  assert.equal(f.w.document.activeElement, f.name());
  f.name().value = ''; f.E.open('ch-2');
  assert.equal(f.C.getStrip('ch-1').name, 'CH 1'); assert.equal(f.C.getStrip('ch-2').name, 'Chitarra');
  assert.equal(f.name().value, 'Chitarra');
});

test('offline output source modal shows the normalized name and physical source names retain their separate behavior', t => {
  const f = fixture(t); f.C.updateStrip('bus-4', { name: 'IEM' });
  f.w.SculptIO.sourceEditor('BUS:4');
  let input = f.w.document.querySelector('dialog[open] input[aria-label="Nome sorgente"]');
  assert.ok(input); input.focus(); input.value = ''; f.key(input, 'Enter');
  assert.equal(f.C.getStrip('bus-4').name, 'BUS 4'); assert.equal(input.value, 'BUS 4');
  f.w.document.querySelector('dialog[open]').close();
  const oldChannel = f.C.getStrip('ch-1').name;
  f.D.patchSource('LCL:1', { name: 'Physical input' }); f.w.SculptIO.sourceEditor('LCL:1');
  input = f.w.document.querySelector('dialog[open] input[aria-label="Nome sorgente"]'); f.change(input, '');
  assert.equal(f.D.source('LCL:1').name, '', 'physical input names do not acquire a channel default');
  assert.equal(f.C.getStrip('ch-1').name, oldChannel);
});

test('live readonly metadata, a stale control and mutation rejection restore the confirmed channel name', async t => {
  const f = fixture(t); f.C.updateStrip('ch-1', { name: 'Confirmed' }); f.E.openSection('ch-1', 'channel'); f.E.close();
  let writable = true, metadataReadOnly = false, accept = true, reviews = 0;
  f.w.SculptLive = {
    isLive: () => true, isConnected: () => true, isWritable: () => writable, applying: () => false,
    reviewMutation: () => { reviews++; return accept; }, canPersist: () => false,
    snapshot: () => ({ mode: 'live', writable, pending: 0 }), hasStripValue: () => true,
    value: path => path.endsWith('/clink') ? 0 : 'Confirmed', hasValue: () => true,
    metadata: () => ({ type: 7, maxLength: 16, readOnly: metadataReadOnly }),
    loadScope: async () => {}, readNode: async () => {}, subscribe: () => () => {}
  };
  f.E.openSection('ch-1', 'channel'); await new Promise(resolve => setImmediate(resolve));
  let input = f.name(); assert.ok(input); assert.equal(input.disabled, false);
  input.focus(); input.value = ''; writable = false; f.key(input, 'Enter');
  assert.equal(f.C.getStrip('ch-1').name, 'Confirmed'); assert.equal(input.value, 'Confirmed'); assert.equal(reviews, 0);
  writable = true; metadataReadOnly = true; f.change(input, ' ');
  assert.equal(f.C.getStrip('ch-1').name, 'Confirmed'); assert.equal(reviews, 0);
  metadataReadOnly = false; accept = false; f.change(input, '');
  assert.equal(reviews, 1); assert.equal(f.C.getStrip('ch-1').name, 'Confirmed'); assert.equal(input.value, 'Confirmed');
  accept = true; f.change(input, ''); assert.equal(f.C.getStrip('ch-1').name, 'CH 1'); assert.equal(input.value, 'CH 1');
  f.E.close(); delete f.w.SculptLive;
});

test('clearing a live source-linked channel name keeps the existing shared-source path and routing', t => {
  const f = fixture(t), W = f.w.SculptWingMap, state = f.C.getState();
  f.D.patchChannel('ch-2', { source: 'LCL:1' });
  for (const id of ['ch-1', 'ch-2']) {
    const base = W.stripPath(id); W.apply(state, base + '/clink', 1); W.apply(state, base + '/name', 'Unused local'); W.apply(state, base + '/$name', 'Mic A');
  }
  W.apply(state, '/io/in/LCL/1/name', 'Mic A');
  const before = W.capture(state), routing = plain(state.desk.channels), sourceBefore = plain(state.desk.sources['LCL:1']);
  f.C.updateStrip('ch-1', { name: '' });
  const after = W.capture(state), writable = new Set(W.descriptors(state).filter(d => !d.readOnly).map(d => d.path));
  const changed = [...after].filter(([path, value]) => writable.has(path) && before.get(path) !== value);
  assert.deepEqual(plain(changed), [['/io/in/LCL/1/name', 'CH 1']]);
  assert.deepEqual(plain(state.desk.channels), routing, 'name reset does not alter source assignment or routing');
  W.apply(state, '/io/in/LCL/1/name', 'CH 1');
  assert.equal(f.C.getStrip('ch-1').name, 'CH 1'); assert.equal(f.C.getStrip('ch-2').name, 'CH 1', 'existing linked-source readback updates both users');
  assert.deepEqual({ ...plain(state.desk.sources['LCL:1']), name: sourceBefore.name }, sourceBefore);
});

test('the channel-list preview still validates empty proposed names before applying', () => {
  const state = Model.defaults();
  const draft = Scene.prepareDraft({ rows: [{ id: 'row-1', targetId: 'ch-1', sourceNumber: '1', name: 'Kick', originalName: 'Kick', selected: true, color: '#e31b44', instrumentKey: 'drums', instrumentName: 'Batteria' }], warnings: [] }, state);
  draft.rows[0].name = '';
  const result = Scene.validateDraft(draft, state);
  assert.equal(result.ok, false); assert.equal(draft.rows[0].name, '', 'the pending import remains an editable proposal');
});
