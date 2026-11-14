'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const base = path.join(__dirname, '../dist');

function fixture(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), { url: 'https://sculpt.test', runScripts: 'outside-only' });
  const w = dom.window, captures = new Map(), rta = [], disposed = [];
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0; w.cancelAnimationFrame = () => {};
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.setPointerCapture = function (id) { captures.set(id, this); };
  w.HTMLElement.prototype.hasPointerCapture = function (id) { return captures.get(id) === this; };
  w.HTMLElement.prototype.releasePointerCapture = function (id) { captures.delete(id); };
  w.HTMLDialogElement.prototype.show = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.SculptRTA = { mount(host, options) { rta.push({ host, ...options }); return () => disposed.push(options.sourceId); } };
  const files = ['plugin-data.js', 'model.js', 'history.js', 'app.js', 'desk.js', 'shell.js', 'plugin-panels.js',
    ...['layouts', 'dynamics', 'eq', 'fx', 'channel', 'native', 'dynamics-extra', 'filters'].map(part => `plugin-original-${part}.js`),
    'plugins.js', 'wing-map.js', 'editor.js', 'dca-bank.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  const E = w.SculptEditor, C = w.SculptController, D = w.SculptDesk;
  t.after(() => { E.close(); w.close(); });
  const editor = () => w.document.querySelector('.editor-dialog');
  const card = key => editor().querySelector(`.editor-device-panel[data-module="${key}"]`);
  const change = (input, value) => { input.value = String(value); input.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const pointer = (target, type, y, id = 1) => {
    if (type !== 'pointerdown' && captures.has(id)) target = captures.get(id);
    const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, clientX: 100, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: id }); target.dispatchEvent(event);
  };
  return { w, E, C, D, editor, card, change, pointer, rta, disposed };
}

test('Compact opens every supported device in the opposite row with principal controls and an automatic EQ analyser', t => {
  const f = fixture(t), fader = f.w.document.querySelector('.strip[data-id="ch-1"] .fader'), levels = JSON.stringify(f.C.capture().values);
  f.E.open('ch-1');
  assert.equal(f.editor().dataset.dockRow, 'outputs');
  assert.deepEqual([...f.editor().querySelectorAll('.editor-device-panel')].map(node => node.dataset.module), ['filter', 'gate', 'eq', 'dyn', 'pre', 'post']);
  for (const block of ['filter', 'gate', 'dyn']) assert(f.card(block).querySelector('.fx-principal-controls input,.fx-principal-controls select'));
  assert(f.card('filter').querySelector('[aria-label="Low cut in Hz"]'));
  assert(f.card('filter').querySelector('[aria-label="High cut in Hz"]'));
  assert.equal(f.card('eq').dataset.expanded, 'true');
  assert.equal(f.rta.length, 1); assert.equal(f.rta[0].sourceId, 'ch-1'); assert.equal(f.rta[0].tap, 'PREEQ');
  assert.equal(f.w.document.querySelector('.strip[data-id="ch-1"] .fader'), fader);
  assert.equal(JSON.stringify(f.C.capture().values), levels);
});

test('each device expands horizontally in place while its neighbours, focus and EQ subscription survive', t => {
  const f = fixture(t); f.E.open('ch-1');
  const eq = f.card('eq'), gate = f.card('gate'), dyn = f.card('dyn');
  const input = dyn.querySelector('[data-parameter="thr"] input[type=number]') || dyn.querySelector('input[type=number]');
  const key = input.closest('[data-parameter]').dataset.parameter, before = f.D.processor({ type: 'strip', id: 'ch-1', block: 'dyn' }).params[key];
  input.focus(); f.change(input, Number(before) + .5);
  assert.equal(f.card('dyn').querySelector(`[data-parameter="${key}"] input[type=number]`), input);
  assert.equal(f.w.document.activeElement, input); assert.notEqual(f.D.processor({ type: 'strip', id: 'ch-1', block: 'dyn' }).params[key], before);
  gate.querySelector('.editor-device-expand').click();
  assert.equal(f.card('gate'), gate); assert.equal(gate.dataset.expanded, 'true'); assert(gate.querySelector('.editor-device-full'));
  assert.equal(f.card('eq'), eq); assert.equal(f.card('dyn'), dyn); assert.equal(f.rta.length, 1); assert.equal(f.disposed.length, 0);
  gate.querySelector('.editor-device-expand').click();
  assert.equal(gate.dataset.expanded, 'false'); assert(gate.querySelector('.fx-principal'));
  assert.equal(f.card('eq'), eq); assert.equal(f.rta.length, 1);
});

test('device cards follow actual processor order and channel capabilities without inventing slots', t => {
  const f = fixture(t); f.E.open('ch-1');
  f.D.patchChannel('ch-1', { order: ['dyn', 'insert', 'eq', 'gate'] });
  assert.deepEqual([...f.editor().querySelectorAll('.editor-device-panel')].map(node => node.dataset.module), ['filter', 'dyn', 'pre', 'eq', 'gate', 'post']);
  f.E.open('aux-1');
  assert.deepEqual([...f.editor().querySelectorAll('.editor-device-panel')].map(node => node.dataset.module), ['eq', 'dyn', 'pre']);
  f.E.open('bus-1');
  assert.deepEqual([...f.editor().querySelectorAll('.editor-device-panel')].map(node => node.dataset.module), ['eq', 'dyn', 'pre', 'post']);
  assert.equal(f.editor().dataset.dockRow, 'inputs');
});

test('collapsed or detached processor fields cannot submit a late edit to either channel', t => {
  const f = fixture(t); f.E.open('ch-1');
  const input = f.card('dyn').querySelector('input[type=number]'), key = input.closest('[data-parameter]').dataset.parameter;
  const one = f.D.processor({ type: 'strip', id: 'ch-1', block: 'dyn' }).params[key], two = f.D.processor({ type: 'strip', id: 'ch-2', block: 'dyn' }).params[key];
  f.E.open('ch-2'); f.change(input, Number(one) + 2); input.dispatchEvent(new f.w.Event('blur'));
  assert.equal(f.D.processor({ type: 'strip', id: 'ch-1', block: 'dyn' }).params[key], one);
  assert.equal(f.D.processor({ type: 'strip', id: 'ch-2', block: 'dyn' }).params[key], two);
  assert.equal(f.rta.at(-1).sourceId, 'ch-2'); assert(f.disposed.includes('ch-1'));
});

test('a fader or DCA gesture started before reconnect cannot create fresh writes in the new session', t => {
  const f = fixture(t); let epoch = 1, reviews = 0;
  f.w.SculptLive = { isLive: () => true, isConnected: () => true, isWritable: () => true, applying: () => false, canPersist: () => false,
    sessionToken: () => epoch, hasStripValue: () => true, hasValue: () => true, metadata: () => ({ type: 1, readOnly: false }),
    reviewMutation: () => { reviews++; return true; } };
  for (const selector of ['.strip[data-id="ch-1"]', '.strip[data-id="dca-1"]']) {
    const strip = f.w.document.querySelector(selector), fader = strip.querySelector('.fader'), cap = strip.querySelector('.fader-cap');
    fader.getBoundingClientRect = () => ({ height: 180 });
    f.pointer(cap, 'pointerdown', 200); const before = reviews; epoch++;
    f.pointer(fader, 'pointermove', 140); f.pointer(fader, 'pointerup', 140);
    assert.equal(reviews, before); assert.equal(strip.classList.contains('dragging'), false);
  }
});

test('unchanged fader values skip live snapshots and notifications while rejected nested EQ edits roll back', t => {
  const f = fixture(t); let reviews = 0;
  f.w.SculptLive = { isLive: () => true, applying: () => false, canPersist: () => false, reviewMutation: () => { reviews++; return false; } };
  const strip = f.C.getStrip('ch-1'), before = JSON.stringify(strip.eq);
  for (let n = 0; n < 50; n++) assert.equal(f.C.updateStrip('ch-1', { level: strip.level }), true);
  assert.equal(reviews, 0);
  assert.equal(f.C.updateStrip('ch-1', { eq: { enabled: !strip.eq.enabled } }), false);
  assert.equal(JSON.stringify(strip.eq), before); assert.equal(reviews, 1);
});
