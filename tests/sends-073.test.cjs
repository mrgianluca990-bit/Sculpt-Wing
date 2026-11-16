'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const dist = path.join(__dirname, '../dist'), tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { const end = Date.now() + 4000; while (Date.now() < end) { if (predicate()) return; await tick(); } assert.fail('Expected Send state was not reached'); }
function fixture(t, { live = false, extended = false } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), { url: 'https://sculpt.test', runScripts: 'outside-only' }), w = dom.window, captures = new Map();
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0; w.cancelAnimationFrame = () => {};
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; }; w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.setPointerCapture = function (id) { captures.set(id, this); };
  w.HTMLElement.prototype.hasPointerCapture = function (id) { return captures.get(id) === this; };
  w.HTMLElement.prototype.releasePointerCapture = function (id) { if (captures.get(id) === this) captures.delete(id); };
  w.HTMLDialogElement.prototype.show = function () { this.open = true; }; w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const mounted = [], disposed = [];
  w.SculptFX = { renderProcessor(host, context) { mounted.push(context); return () => disposed.push(context); }, renderPrincipal() { return () => {}; } };
  const files = ['plugin-data.js','model.js','history.js','app.js','desk.js','shell.js','wing-map.js','channel-chain.js','editor.js', ...(extended ? ['dca-bank.js','vst-rack-model.js','vst-rack.js','extended.js'] : [])];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(dist, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  const E = w.SculptEditor, C = w.SculptController, D = w.SculptDesk, M = w.SculptWingMap, metadata = new Map(), values = new Map(), listeners = new Set(), reads = [], mutations = [];
  let writable = true, applying = false;
  const emit = () => { for (const listener of [...listeners]) listener(); };
  const define = (node, value, options = {}) => metadata.set(node, { path: node, revision: 1, type: typeof value === 'string' ? 5 : 4, readOnly: false, ...options });
  const receive = entries => {
    for (const [node, value] of Object.entries(entries)) values.set(node, value);
    applying = true; try { C.transact(state => M.applyMany(state, Object.entries(entries)), 'live-values', { record: false }); } finally { applying = false; }
    emit();
  };
  if (live) {
    w.SculptLive = {
      isLive: () => true, isConnected: () => true, isWritable: () => writable, applying: () => applying,
      canPersist: () => false, sessionToken: () => 1, snapshot: () => ({ mode: 'live', writable, pending: 0, failureVersion: 0 }), hasStripValue: () => true,
      hasValue: node => values.has(node), value: node => values.get(node), metadata: node => metadata.get(node), settled: async () => {},
      readNode: async node => { reads.push(node); }, describeNode: async node => metadata.get(node), readValues: async node => values.has(node) ? { [node]: values.get(node) } : {}, loadScope: async () => {},
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      reviewMutation(before, after, type, id) { mutations.push({ type, id }); return writable; }
    };
    define('/ch/1/proc', 'GEDI', { items: [{ value: 'GEDI' }] }); define('/ch/1/ptap', 'PFL', { items: [{ value: 'PFL' }] });
    receive({ '/ch/1/proc': 'GEDI', '/ch/1/ptap': 'PFL' });
  }
  const editor = () => w.document.querySelector('.editor-dialog'), card = () => editor().querySelector('[data-module="sends"]'), board = () => editor().querySelector('.editor-device-board');
  const named = (name, root = card()) => root.querySelector('[aria-label="' + name + '"]');
  const rows = (root = card()) => [...root.querySelectorAll('.editor-send-row')];
  const change = (node, value) => { assert(node, 'Control is present'); node.value = String(value); node.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const key = (node, value) => node.dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  const pointer = (node, type, y, id = 1) => {
    if (type !== 'pointerdown' && captures.has(id)) node = captures.get(id);
    const event = new w.MouseEvent(type, { button: 0, clientX: 100, clientY: y, bubbles: true, cancelable: true }); Object.defineProperty(event, 'pointerId', { value: id }); node.dispatchEvent(event);
  };
  t.after(async () => { E.close(); await tick(); assert.equal(listeners.size, 0); w.close(); });
  return { w, E, C, D, editor, card, board, named, rows, change, key, pointer, captures, mounted, disposed, reads, metadata, values, define, receive, mutations, emit, setWritable(value) { writable = value; emit(); } };
}

test('expanded Send presents one bank of eight independent routes and keeps the nine device cards mounted', t => {
  const f = fixture(t); f.E.open('ch-1'); f.card().querySelector('.editor-device-content').scrollTop = 93; f.named('Apri otto mandate').click();
  assert.equal(f.card().querySelector('.editor-device-content').scrollTop, 0, 'Opening Send reveals the bank navigation at the top');
  const send = f.card(), board = f.board(), cards = [...board.children], eq = f.editor().querySelector('[data-module="eq"]'), mounts = f.mounted.length;
  assert.equal(send.dataset.expanded, 'true'); assert.equal(cards.length, 9);
  assert.deepEqual(f.rows().map(row => row.dataset.targetId), Array.from({ length: 8 }, (_, i) => 'bus-' + (i + 1)));
  assert.equal(send.querySelectorAll('.editor-parameter-vertical').length, 8);
  assert.equal(send.querySelectorAll('.editor-parameter-vertical .editor-knob').length, 0, 'A level is never duplicated by a rotary');
  assert.equal(send.querySelectorAll('.editor-send-pan .editor-knob').length, 8);
  assert.equal(send.querySelectorAll('[role="meter"], .strip-meter, .send-meter').length, 0, 'No individual send meters are synthesized');
  f.C.updateStrip('bus-1', { name: 'Monitor voce', color: '#21bff0' });
  assert.equal(f.rows()[0].querySelector('strong').textContent, 'Monitor voce'); assert.equal(f.rows()[0].style.getPropertyValue('--send-color'), '#21bff0');
  board.scrollLeft = 583; send.querySelector('.editor-device-content').scrollTop = 27;
  f.named('Banco BUS 9–16').click();
  assert.deepEqual(f.rows().map(row => row.dataset.targetId), Array.from({ length: 8 }, (_, i) => 'bus-' + (i + 9)));
  assert.equal(f.card(), send); assert.equal(f.board(), board); assert.deepEqual([...board.children], cards); assert.equal(f.editor().querySelector('[data-module="eq"]'), eq);
  assert.equal(board.scrollLeft, 583); assert.equal(send.querySelector('.editor-device-content').scrollTop, 27);
  assert.equal(f.w.document.activeElement, f.named('Banco BUS 9–16'));
  assert.equal(f.mounted.length, mounts); assert.equal(f.disposed.length, 0);
  f.change(f.named('Livello → BUS 09 in dB'), -17.3); assert.equal(f.C.getSend('ch-1', 'bus-9').level, -17.3);
  assert.equal(f.card().querySelector('[data-send-page]').dataset.sendPage, '2');
});

test('banks follow keyboard, group, channel and Compact/Extended navigation without returning to the first bank', t => {
  const f = fixture(t, { extended: true }); f.E.openDevice('ch-1', 'sends');
  f.key(f.named('Banco BUS 1–8'), 'ArrowRight'); assert.equal(f.w.document.activeElement, f.named('Banco BUS 9–16'));
  f.named('Mandate verso MTX').click(); assert.equal(f.rows().length, 8); assert.equal(f.rows()[0].dataset.targetId, 'mtx-1');
  f.named('Mandate verso BUS').click(); assert.equal(f.rows()[0].dataset.targetId, 'bus-9');
  f.w.SculptMixerView.setMode('extended');
  assert.equal(f.editor().dataset.dockRow, 'window'); assert.equal(f.editor().dataset.slot, 'sends');
  assert.equal(f.board().children.length, 1, 'Extended opens only the selected Send module');
  assert.equal(f.rows().length, 8); assert.equal(f.rows()[0].dataset.targetId, 'bus-9');
  f.E.open('ch-2'); assert.equal(f.card().dataset.expanded, 'true'); assert.equal(f.rows()[0].dataset.targetId, 'bus-9'); assert.equal(f.rows()[0].dataset.sourceId, 'ch-2');
  f.w.SculptMixerView.setMode('compact'); assert.equal(f.editor().dataset.dockRow, 'outputs');
  assert.equal(f.board().children.length, 9, 'Compact restores the opposite-row channel editor');
  assert.equal(f.rows().length, 8); assert.equal(f.rows()[0].dataset.targetId, 'bus-9');
  f.key(f.named('Banco BUS 9–16'), 'Home'); assert.equal(f.rows()[0].dataset.targetId, 'bus-1');
  f.key(f.named('Banco BUS 1–8'), 'End'); assert.equal(f.rows()[0].dataset.targetId, 'bus-9');
});

test('send fader drags start only on the cap, make one undo step, and reset to zero dB; pan has its own center reset', async t => {
  const f = fixture(t); f.C.setSend('ch-1', 'bus-1', { level: -20, panLink: false, pan: 37 }); f.E.openDevice('ch-1', 'sends');
  const slider = f.named('Livello → BUS 01 — cursore'), rail = slider.closest('.editor-parameter').querySelector('.editor-fader-rail'), cap = rail.querySelector('.editor-fader-cap');
  rail.getBoundingClientRect = () => ({ height: 100 }); cap.getBoundingClientRect = () => ({ height: 20 });
  f.pointer(rail, 'pointerdown', 200); f.pointer(rail, 'pointermove', 160); f.pointer(rail, 'pointerup', 160); assert.equal(f.C.getSend('ch-1', 'bus-1').level, -20);
  f.C.clearHistory(); f.pointer(cap, 'pointerdown', 200); f.pointer(f.w, 'pointermove', 196); f.pointer(f.w, 'pointermove', 192); f.pointer(f.w, 'pointerup', 192);
  assert.equal(f.C.getSend('ch-1', 'bus-1').level, -10); assert.equal(f.C.historyState().undoCount, 1); assert.equal(f.captures.size, 0);
  assert.equal((await f.C.undo()).ok, true); assert.equal(f.C.getSend('ch-1', 'bus-1').level, -20);
  rail.dispatchEvent(new f.w.MouseEvent('dblclick', { bubbles: true })); assert.equal(f.C.getSend('ch-1', 'bus-1').level, 0);
  const pan = f.named('Pan → BUS 01 — manopola'); f.key(pan, 'ArrowRight'); assert.equal(f.C.getSend('ch-1', 'bus-1').pan, 38);
  pan.dispatchEvent(new f.w.MouseEvent('dblclick', { bubbles: true })); assert.equal(f.C.getSend('ch-1', 'bus-1').pan, 0); assert.equal(f.C.getSend('ch-1', 'bus-1').level, 0);
  f.named('Pan link → BUS 01').click(); assert.equal(pan.getAttribute('aria-disabled'), 'true'); f.change(f.named('Pan → BUS 01'), 70); assert.equal(f.C.getSend('ch-1', 'bus-1').pan, 0);
  f.change(f.named('Punto → BUS 01'), 'POST'); assert.equal(f.C.getSend('ch-1', 'bus-1').pre, false);
  const before = f.C.getSend('ch-1', 'bus-1').on; f.rows()[0].querySelector('.editor-send-on').click(); assert.equal(f.C.getSend('ch-1', 'bus-1').on, !before);
  f.named('Mandata segue mute → BUS 01').click(); assert.equal(f.C.getSend('ch-1', 'bus-1').followMute, false);
});

test('switching bank releases an active drag and rejects events from the previous bank and channel', t => {
  const f = fixture(t); f.E.openDevice('ch-1', 'sends');
  const old = f.named('Livello → BUS 01 in dB'), level = f.C.getSend('ch-1', 'bus-1').level, cap = old.closest('.editor-parameter').querySelector('.editor-fader-cap');
  f.pointer(cap, 'pointerdown', 200); assert.equal(f.captures.size, 1); f.named('Banco BUS 9–16').click(); assert.equal(f.captures.size, 0);
  f.change(old, -43); f.pointer(cap, 'pointermove', 100); assert.equal(f.C.getSend('ch-1', 'bus-1').level, level);
  const previous = f.named('Livello → BUS 09 in dB'), one = f.C.getSend('ch-1', 'bus-9').level, two = f.C.getSend('ch-2', 'bus-9').level;
  f.E.open('ch-2'); f.change(previous, -6); assert.equal(f.C.getSend('ch-1', 'bus-9').level, one); assert.equal(f.C.getSend('ch-2', 'bus-9').level, two);
});

test('route controls match the actual WING source and destination families', t => {
  const f = fixture(t); f.E.openDevice('aux-1', 'sends'); assert.equal(f.rows().length, 8); assert.equal(f.card().querySelectorAll('.editor-send-pan').length, 8);
  f.named('Mandate verso MAIN').click(); assert.equal(f.rows().length, 4); assert.equal(f.card().querySelectorAll('.editor-send-pan').length, 0); assert.equal(f.named('Pan link → MAIN 01'), null);
  for (const select of f.card().querySelectorAll('.editor-send-row select')) assert.deepEqual([...select.options].map(option => option.value), ['PRE', 'POST']);
  f.E.open('bus-1'); f.named('Mandate verso BUS').click(); assert.equal(f.rows().length, 8); assert(!f.rows().some(row => row.dataset.targetId === 'bus-1')); assert.equal(f.card().querySelectorAll('.editor-send-pan').length, 0);
  f.named('Mandate verso MTX').click(); assert.equal(f.card().querySelectorAll('.editor-send-switches').length, 0);
  f.E.open('main-1'); assert.equal(f.rows().length, 8); assert(f.rows().every(row => row.dataset.targetId.startsWith('mtx-'))); assert.equal(f.card().querySelectorAll('.editor-send-pan').length, 0);
  f.E.open('mtx-1'); assert.equal(f.card().dataset.state, 'active'); assert.equal(f.rows().length, 8); assert(f.rows().every(row => row.dataset.targetId === 'mtx-1')); assert.equal(f.card().querySelector('.editor-device-drag').disabled, true);
});

test('live Send reads all eight visible routes, waits for each definition and respects firmware enums and read-only controls', async t => {
  const f = fixture(t, { live: true }); f.E.openDevice('ch-1', 'sends');
  await until(() => f.reads.includes('/ch/1/send/8') && !f.card().textContent.includes('Lettura WING…'));
  for (let i = 1; i <= 8; i++) assert(f.reads.includes('/ch/1/send/' + i));
  let input = f.named('Livello → BUS 01 in dB'); assert.equal(input.disabled, true); assert.equal(input.value, '');
  const original = f.C.getSend('ch-1', 'bus-1').level; f.change(input, -25); assert.equal(f.C.getSend('ch-1', 'bus-1').level, original); assert.equal(f.mutations.length, 0);
  const base = '/ch/1/send/1';
  f.define(base + '/lvl', -10, { type: 3, min: -60, max: 6 });
  f.define(base + '/pan', 0, { type: 1, min: -100, max: 100 });
  for (const key of ['on', 'plink', 'pon']) f.define(base + '/' + key, 0);
  f.define(base + '/mode', 'PRE', { items: [{ value: 'PRE' }, { value: 'POST' }] });
  f.receive({ [base + '/lvl']: -10, [base + '/pan']: 0, [base + '/plink']: 0, [base + '/pon']: 0, [base + '/on']: 1, [base + '/mode']: 'PRE' });
  input = f.named('Livello → BUS 01 in dB'); assert.equal(input.disabled, false); assert.equal(input.min, '-60'); assert.equal(input.max, '6');
  f.change(input, 15); assert.equal(f.C.getSend('ch-1', 'bus-1').level, 6);
  assert.equal(f.named('Livello → BUS 02 in dB').disabled, true, 'One known route does not unlock its neighbours');
  assert.deepEqual([...f.named('Punto → BUS 01').options].map(option => option.value), ['PRE', 'POST']);
  f.metadata.get(base + '/mode').items.push({ value: 'GRP' }); f.metadata.get(base + '/mode').revision++; f.emit();
  assert.deepEqual([...f.named('Punto → BUS 01').options].map(option => option.value), ['PRE', 'POST', 'GRP']);
  f.change(f.named('Punto → BUS 01'), 'GRP'); assert.equal(f.C.getSend('ch-1', 'bus-1').mode, 'GRP');
  f.metadata.get(base + '/lvl').readOnly = true; f.emit(); input = f.named('Livello → BUS 01 in dB'); assert.equal(input.disabled, true);
  const writes = f.mutations.length; f.change(input, -44); assert.equal(f.C.getSend('ch-1', 'bus-1').level, 6); assert.equal(f.mutations.length, writes);
  f.setWritable(false); assert.equal(f.rows()[0].querySelector('.editor-send-on').disabled, true); assert.equal(f.named('Pan → BUS 01 — manopola').getAttribute('aria-disabled'), 'true');
  f.named('Banco BUS 9–16').click(); await until(() => f.reads.includes('/ch/1/send/16'));
  assert.equal(f.rows().length, 8); assert(f.rows().every(row => row.querySelector('input[type=number]').disabled));
});
