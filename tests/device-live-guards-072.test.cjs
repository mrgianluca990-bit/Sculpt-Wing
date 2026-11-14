'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const dist = path.join(__dirname, '../dist');
const tick = () => new Promise(resolve => setImmediate(resolve));
const copy = value => JSON.parse(JSON.stringify(value));

async function until(predicate) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await tick();
  }
  assert.fail('The expected visible state was not reached');
}

function fixture(t, { live = true } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), {
    url: 'https://sculpt.test', runScripts: 'outside-only'
  });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0;
  w.cancelAnimationFrame = () => {};
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.setPointerCapture = function () {};
  w.HTMLElement.prototype.releasePointerCapture = function () {};
  w.HTMLDialogElement.prototype.show = function () { this.open = true; };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event('close'));
  };
  // These tests exercise the real utility cards. Unrelated plugin renderers
  // need no audio engine, graphics surface, or simulated processor schema.
  w.SculptFX = { renderProcessor: () => () => {}, renderPrincipal: () => () => {} };
  for (const file of ['plugin-data.js', 'model.js', 'history.js', 'app.js', 'desk.js',
    'shell.js', 'wing-map.js', 'channel-chain.js', 'editor.js']) {
    vm.runInContext(fs.readFileSync(path.join(dist, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  }

  const E = w.SculptEditor, C = w.SculptController, D = w.SculptDesk, M = w.SculptWingMap;
  const metadata = new Map(), values = new Map(), listeners = new Set();
  const reads = [], failedReads = new Set(), mutations = [];
  let writable = true, applying = false;
  const emit = () => { for (const listener of [...listeners]) listener(); };
  const define = (node, value, extra = {}) => metadata.set(node, {
    path: node, type: typeof value === 'string' ? 4 : 1, revision: 1, readOnly: false, ...extra
  });
  function receive(entries, { definitions = true } = {}) {
    const pairs = Object.entries(entries);
    for (const [node, value] of pairs) {
      values.set(node, value);
      if (definitions) define(node, value);
    }
    applying = true;
    try { C.transact(state => M.applyMany(state, pairs), 'live-values', { record: false }); }
    finally { applying = false; }
    emit();
  }
  if (live) {
    w.SculptLive = {
      isLive: () => true, isConnected: () => true, isWritable: () => writable,
      applying: () => applying, canPersist: () => false, sessionToken: () => 1,
      snapshot: () => ({ mode: 'live', writable, pending: 0, failureVersion: 0 }),
      hasStripValue: () => true, hasValue: node => values.has(node), value: node => values.get(node),
      metadata: node => metadata.get(node), settled: async () => {},
      readNode: async node => {
        reads.push(node);
        if (failedReads.has(node)) throw new Error('Lettura routing non completata');
      },
      describeNode: async node => metadata.get(node),
      readValues: async node => values.has(node) ? { [node]: values.get(node) } : {},
      loadScope: async () => {},
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      reviewMutation(before, after, type, id) { mutations.push({ type, id }); return writable; }
    };
    receive({ '/ch/1/proc': 'GEDI', '/ch/1/ptap': 'PFL' });
    define('/ch/1/proc', 'GEDI', { type: 5, items: [{ value: 'GEDI', label: 'GEDI' }] });
    define('/ch/1/ptap', 'PFL', { type: 5, items: [{ value: 'PFL', label: 'PFL' }] });
  }

  const editor = () => w.document.querySelector('.editor-dialog');
  const card = key => editor().querySelector('.editor-device-panel[data-module="' + key + '"]');
  const named = (key, name) => card(key).querySelector('[aria-label="' + name + '"]');
  const open = (id, key) => E.openDevice(id, key);
  const change = (input, value) => {
    assert(input, 'The requested control is present');
    input.value = String(value);
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  const sourceControls = name => [named('input', 'Gruppo Sorgente ' + name), named('input', 'Sorgente ' + name)];
  const outputSummary = () => [...card('master').querySelectorAll('.editor-module')]
    .find(section => section.querySelector('h3')?.textContent === 'Uscite assegnate');

  t.after(async () => {
    E.close();
    await tick();
    assert.equal(listeners.size, 0, 'Closing the editor releases its live subscriptions');
    w.close();
  });
  return { w, E, C, D, metadata, values, reads, failedReads, mutations, receive, define,
    editor, card, named, open, change, sourceControls, outputSummary, emit,
    setWritable(value) { writable = value; emit(); } };
}

test('Pre hides unread MAIN and ALT routes, including after a failed read and a value without its definition', async t => {
  const f = fixture(t), route = '/ch/1/in/conn/';
  f.failedReads.add('/ch/1/in/conn');
  f.open('ch-1', 'input');
  await until(() => f.card('input').textContent.includes('Lettura routing non completata'));
  for (const name of ['Main', 'Alt']) for (const select of f.sourceControls(name)) {
    assert.equal(select.disabled, true);
    assert.equal(select.value, '', 'A demo route must not look like the confirmed console route');
  }
  const original = f.D.channel('ch-1').source;
  f.change(f.sourceControls('Main')[0], 'A');
  assert.equal(f.D.channel('ch-1').source, original, 'Late events from unread controls do not change routing');
  assert.equal(f.mutations.length, 0);

  f.receive({ [route + 'grp']: 'A' });
  for (const select of f.sourceControls('Main')) assert.equal(select.value, '');
  f.receive({ [route + 'in']: 7 }, { definitions: false });
  for (const select of f.sourceControls('Main')) {
    assert.equal(select.disabled, true);
    assert.equal(select.value, '', 'A cached value without its schema is still unconfirmed');
  }
  f.define(route + 'in', 7);
  f.emit();
  assert.deepEqual(f.sourceControls('Main').map(select => select.value), ['A', 'A:7']);
  assert(f.sourceControls('Main').every(select => !select.disabled));
  assert(f.sourceControls('Alt').every(select => select.disabled && select.value === ''), 'MAIN metadata does not unlock ALT');
});

test('Pre uses confirmed routes and prevents changes in read-only mode or with a read-only routing leaf', t => {
  const f = fixture(t), route = '/ch/1/in/conn/';
  f.receive({ [route + 'grp']: 'A', [route + 'in']: 7, [route + 'altgrp']: 'B', [route + 'altin']: 8 });
  f.open('ch-1', 'input');
  assert.deepEqual(f.sourceControls('Main').map(select => select.value), ['A', 'A:7']);
  assert.deepEqual(f.sourceControls('Alt').map(select => select.value), ['B', 'B:8']);
  f.change(f.sourceControls('Main')[1], 'A:8');
  assert.equal(f.D.channel('ch-1').source, 'A:8');
  assert.equal(f.D.channel('ch-1').altSource, 'B:8');

  f.setWritable(false);
  for (const name of ['Main', 'Alt']) assert(f.sourceControls(name).every(select => select.disabled));
  const before = f.mutations.length;
  f.change(f.sourceControls('Alt')[0], 'C');
  assert.equal(f.D.channel('ch-1').altSource, 'B:8');
  assert.equal(f.mutations.length, before);
  f.setWritable(true);
  f.metadata.get(route + 'altin').readOnly = true;
  f.emit();
  assert(f.sourceControls('Alt').every(select => select.disabled), 'Changing either selector needs both routing leaves writable');
  assert(f.sourceControls('Main').every(select => !select.disabled));
});

test('returning from global ALT to MAIN affects only the selected channel', t => {
  const f = fixture(t);
  f.receive({
    '/ch/1/in/conn/grp': 'LCL', '/ch/1/in/conn/in': 1,
    '/ch/1/in/conn/altgrp': 'A', '/ch/1/in/conn/altin': 2,
    '/ch/1/in/set/srcauto': 1, '/ch/1/in/set/altsrc': 0, '/io/altsw': 1
  });
  const other = copy(f.D.channel('ch-2'));
  f.open('ch-1', 'input');
  const alt = f.named('input', 'ALT');
  assert.equal(alt.disabled, false);
  assert.equal(alt.getAttribute('aria-checked'), 'true');
  alt.click();
  assert.equal(f.D.channel('ch-1').useAlt, false);
  assert.equal(f.D.channel('ch-1').sourceAuto, false);
  assert.equal(f.D.get().io.globalAlt, true, 'The global source switch must remain unchanged');
  assert.deepEqual(copy(f.D.channel('ch-2')), other);
  assert.equal(f.named('input', 'ALT').getAttribute('aria-checked'), 'false');
  assert.equal(f.D.channel('ch-1').source, 'LCL:1');
  assert.equal(f.D.channel('ch-1').altSource, 'A:2');
});

test('Home makes unsupported live icons unavailable while keeping icon editing in Demo', t => {
  const live = fixture(t);
  live.open('ch-1', 'home');
  const icon = live.named('home', 'Icona'), original = live.D.channel('ch-1').icon;
  assert.equal(icon.disabled, true);
  assert.match(live.card('home').textContent, /icone.*Demo/i);
  live.change(icon, 'voice');
  assert.equal(live.D.channel('ch-1').icon, original);
  assert.equal(live.mutations.length, 0);

  const demo = fixture(t, { live: false });
  demo.open('ch-1', 'home');
  assert.equal(demo.named('home', 'Icona').disabled, false);
  demo.change(demo.named('home', 'Icona'), 'voice');
  assert.equal(demo.D.channel('ch-1').icon, 'voice');
});

test('Home offers Solo safe only on CH and AUX, and applies a known supported value', t => {
  const f = fixture(t);
  f.receive({ '/ch/1/solosafe': 0, '/aux/1/solosafe': 1 });
  for (const id of ['ch-1', 'aux-1', 'bus-1', 'main-1', 'mtx-1']) {
    f.open(id, 'home');
    const safe = f.named('home', 'Solo safe');
    if (id === 'ch-1' || id === 'aux-1') {
      assert(safe, id + ' supports Solo safe');
      assert.equal(safe.disabled, false);
      assert.equal(safe.getAttribute('aria-checked'), String(id === 'aux-1'));
    } else assert.equal(safe, null, id + ' has no Solo safe parameter');
  }
  f.open('ch-1', 'home');
  f.named('home', 'Solo safe').click();
  assert.equal(f.D.channel('ch-1').soloSafe, true);
  assert.equal(f.D.channel('aux-1').soloSafe, true);
});

test('Master excludes demo and incomplete output routes and labels a partial patch honestly', t => {
  const f = fixture(t);
  f.open('main-1', 'master');
  const summary = () => f.outputSummary();
  assert.match(summary().textContent, /Patch uscite da leggere/);
  assert.doesNotMatch(summary().textContent, /Local [12](?:\D|$)|Nessuna uscita fisica assegnata/);
  assert(summary().querySelector('button'), 'Patch I/O remains accessible while its routes are unread');

  f.receive({ '/io/out/LCL/3/grp': 'MAIN' });
  assert.match(summary().textContent, /Patch uscite da leggere/, 'One leaf cannot confirm an output assignment');
  f.receive({ '/io/out/LCL/3/in': 1 });
  const tags = () => [...summary().querySelectorAll('.editor-tag')].map(node => node.textContent);
  assert(tags().includes('Local 3'));
  assert(!tags().includes('Local 1') && !tags().includes('Local 2'), 'Unread demo outputs are omitted');
  assert.match(summary().textContent, /Lettura parziale/);

  f.receive({ '/io/out/LCL/3/grp': 'BUS', '/io/out/LCL/3/in': 1 });
  assert(!tags().includes('Local 3'), 'An observed patch change updates the open card');
  assert.match(summary().textContent, /Nessuna assegnazione tra le uscite lette/);
  assert.match(summary().textContent, /Lettura parziale/);
  assert.doesNotMatch(summary().textContent, /Nessuna uscita fisica assegnata/);
});

test('Master reports no physical assignment only after every represented output route is read', t => {
  const f = fixture(t), outputs = f.D.outputs();
  const entries = {};
  for (const output of outputs) {
    const base = '/io/out/' + output.group + '/' + output.index;
    entries[base + '/grp'] = 'OFF';
    entries[base + '/in'] = 1;
  }
  f.receive(entries);
  f.open('main-1', 'master');
  assert.match(f.outputSummary().textContent, /Nessuna uscita fisica assegnata/);
  assert.doesNotMatch(f.outputSummary().textContent, /parziale|da leggere/);
});
