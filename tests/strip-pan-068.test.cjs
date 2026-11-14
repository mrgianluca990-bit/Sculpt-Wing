'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const base = path.join(__dirname, '../dist');

function fixture(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), { url: 'https://sculpt.test', runScripts: 'outside-only' });
  const w = dom.window, captures = new Map(), opened = [];
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0;
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.setPointerCapture = function (id) { captures.set(id, this); };
  w.HTMLElement.prototype.hasPointerCapture = function (id) { return captures.get(id) === this; };
  w.HTMLElement.prototype.releasePointerCapture = function (id) {
    if (captures.get(id) !== this) return;
    captures.delete(id);
    const event = new w.Event('lostpointercapture', { bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: id }); this.dispatchEvent(event);
  };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  for (const file of ['model.js', 'history.js', 'app.js', 'plugin-data.js', 'desk.js', 'wing-map.js']) {
    vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  }
  w.SculptEditor = { open: id => opened.push(id) };
  for (const row of ['inputs', 'outputs']) {
    const scroller = w.document.getElementById(`${row}-scroll`);
    Object.defineProperties(scroller, { clientWidth: { value: 320 }, scrollWidth: { value: 2400 } });
    scroller.scrollLeft = 180;
  }
  const C = w.SculptController;
  C.clearHistory(); t.after(() => w.close());
  const strip = id => w.document.querySelector(`.strip[data-id="${id}"]`);
  const pan = id => strip(id).querySelector('.strip-pan');
  const scroll = row => w.document.getElementById(`${row}-scroll`);
  const key = (node, key, options = {}) => node.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }));
  const doubleClick = node => node.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0, detail: 2 }));
  const click = node => node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  function pointer(node, type, { x = 100, y = 200, id = 1, kind = 'mouse', button = 0, shiftKey = false } = {}) {
    if (type !== 'pointerdown' && captures.has(id)) node = captures.get(id);
    const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button, shiftKey });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: kind } });
    node.dispatchEvent(event);
    if (type === 'pointerup' || type === 'pointercancel') captures.delete(id);
    return event;
  }
  return { w, C, D: w.SculptDesk, captures, opened, strip, pan, scroll, key, click, doubleClick, pointer };
}

function liveFixture(t) {
  const f = fixture(t), loaded = new Set(), metadata = new Map(), reviews = [];
  const state = { writable: true, session: 1, accept: true };
  f.w.SculptLive = {
    isLive: () => true, isConnected: () => true, isWritable: () => state.writable,
    applying: () => false, canPersist: () => false, hasStripValue: () => true,
    hasValue: value => loaded.has(value), metadata: value => metadata.get(value),
    sessionToken: () => state.session, snapshot: () => ({ mode: 'live', writable: state.writable, failureVersion: 0 }),
    settled: () => Promise.resolve(),
    reviewMutation(before, after, type, id) { reviews.push({ type, id }); return state.accept; }
  };
  f.C.refresh();
  return { ...f, state, loaded, metadata, reviews, path: id => `${f.w.SculptWingMap.stripPath(id)}/pan`,
    sendPath: (id, target) => f.w.SculptWingMap.sendPath(id, target, 'pan') };
}

test('all 76 channel strips expose an accessible pan which changes only their own pan value', t => {
  const f = fixture(t), channels = f.C.listStrips();
  assert.equal(channels.length, 76); assert.equal(f.w.document.querySelectorAll('.strip-pan').length, 76);
  for (const channel of channels) {
    const knob = f.pan(channel.id), level = channel.level;
    assert.equal(knob.getAttribute('role'), 'slider'); assert.equal(knob.getAttribute('aria-orientation'), 'horizontal');
    assert.equal(knob.getAttribute('aria-valuemin'), '-100'); assert.equal(knob.getAttribute('aria-valuemax'), '100');
    assert.equal(knob.getAttribute('aria-disabled'), 'false'); assert.equal(knob.querySelector('small').textContent, 'PAN');
    f.key(knob, 'ArrowRight');
    assert.equal(channel.pan, 2, channel.id); assert.equal(channel.level, level, channel.id);
    assert.equal(knob.getAttribute('aria-valuenow'), '2'); assert.equal(knob.querySelector('output').textContent, 'R 2');
  }
  assert.deepEqual(f.opened, []); assert.equal(f.scroll('inputs').scrollLeft, 180); assert.equal(f.scroll('outputs').scrollLeft, 180);
});

test('horizontal pan dragging starts from the stored value and is a single undoable gesture', async t => {
  const f = fixture(t), knob = f.pan('ch-1');
  f.C.updateStrip('ch-1', { pan: -24 }); f.C.clearHistory();
  f.pointer(knob.querySelector('i'), 'pointerdown', { x: 721, y: 330 });
  assert.equal(f.C.getStrip('ch-1').pan, -24, 'grabbing away from the center does not jump');
  assert.equal(f.captures.get(1), knob); assert.equal(f.w.document.activeElement, knob);
  f.pointer(f.w, 'pointermove', { x: 722, y: 330 }); assert.equal(f.C.getStrip('ch-1').pan, -24, 'tiny movement remains a click');
  f.pointer(f.w, 'pointermove', { x: 731, y: 330 }); assert.equal(f.C.getStrip('ch-1').pan, -14);
  f.pointer(f.w, 'pointermove', { x: 741, y: 120 }); assert.equal(f.C.getStrip('ch-1').pan, -4, 'the chosen horizontal axis stays fixed');
  f.pointer(f.w, 'pointermove', { x: 741, y: 10 }); assert.equal(f.C.getStrip('ch-1').pan, -4);
  f.pointer(f.w, 'pointerup', { x: 741, y: 10 });
  assert.equal(f.C.historyState().undoCount, 1); assert.equal(f.captures.size, 0);
  assert.equal(f.scroll('inputs').scrollLeft, 180); assert.equal(f.scroll('inputs').classList.contains('panning'), false);
  assert.deepEqual(f.opened, []);
  assert.equal((await f.C.undo()).ok, true); assert.equal(f.C.getStrip('ch-1').pan, -24);
  assert.equal((await f.C.redo()).ok, true); assert.equal(f.C.getStrip('ch-1').pan, -4);
});

test('vertical/touch pan dragging retains its axis and changes fine mode without a discontinuity', t => {
  const f = fixture(t), knob = f.pan('aux-1');
  f.C.updateStrip('aux-1', { pan: 36 }); f.C.clearHistory();
  f.pointer(knob, 'pointerdown', { x: 40, y: 901, kind: 'touch' }); assert.equal(f.C.getStrip('aux-1').pan, 36);
  f.pointer(f.w, 'pointermove', { x: 41, y: 891, kind: 'touch' }); assert.equal(f.C.getStrip('aux-1').pan, 46);
  f.pointer(f.w, 'pointermove', { x: 600, y: 891, kind: 'touch' }); assert.equal(f.C.getStrip('aux-1').pan, 46);
  f.pointer(f.w, 'pointermove', { x: 600, y: 881, kind: 'touch', shiftKey: true }); assert.equal(f.C.getStrip('aux-1').pan, 48);
  f.pointer(f.w, 'pointermove', { x: 600, y: 871, kind: 'touch' }); assert.equal(f.C.getStrip('aux-1').pan, 58);
  f.pointer(f.w, 'pointercancel', { x: 600, y: 871, kind: 'touch' });
  f.pointer(knob, 'pointermove', { x: 600, y: 820, kind: 'touch' }); assert.equal(f.C.getStrip('aux-1').pan, 58);
  assert.equal(f.C.historyState().undoCount, 1); assert.equal(f.captures.size, 0); assert.equal(f.scroll('inputs').scrollLeft, 180);
});

test('double click centers pan without opening editor or level dialog, and keyboard edits stay bounded', async t => {
  const f = fixture(t), knob = f.pan('bus-1'), level = f.C.getStrip('bus-1').level;
  f.C.updateStrip('bus-1', { pan: -63 }); f.C.clearHistory();
  f.click(knob.querySelector('output')); assert.deepEqual(f.opened, []);
  f.doubleClick(knob.querySelector('.strip-pan-dial'));
  assert.equal(f.C.getStrip('bus-1').pan, 0); assert.equal(knob.querySelector('output').textContent, 'C');
  assert.equal(f.C.getStrip('bus-1').level, level); assert.equal(f.w.document.getElementById('level-dialog').open, false);
  assert.equal(f.scroll('outputs').scrollLeft, 180); assert.deepEqual(f.opened, []);
  assert.equal((await f.C.undo()).ok, true); assert.equal(f.C.getStrip('bus-1').pan, -63);
  f.key(knob, 'End'); f.key(knob, 'ArrowRight'); assert.equal(f.C.getStrip('bus-1').pan, 100);
  f.key(knob, 'Home'); f.key(knob, 'ArrowLeft'); assert.equal(f.C.getStrip('bus-1').pan, -100);
  f.key(knob, 'ArrowRight', { shiftKey: true }); assert.equal(f.C.getStrip('bus-1').pan, -99);
  f.key(knob, 'Enter'); assert.equal(f.C.getStrip('bus-1').pan, 0);
});

test('SOF pan edits independent CH/AUX sends and leaves channel pans and output sends untouched', t => {
  const f = fixture(t);
  f.C.updateStrip('ch-1', { pan: -21 }); f.C.updateStrip('aux-1', { pan: 33 });
  f.C.setSend('ch-1', 'bus-2', { pan: 7, panLink: false }); f.C.setSend('aux-1', 'bus-2', { pan: -5, panLink: false });
  f.C.setSof('bus-2');
  for (const [id, initial] of [['ch-1', 7], ['aux-1', -5]]) {
    const knob = f.pan(id);
    assert.equal(knob.querySelector('small').textContent, 'SEND'); assert.equal(knob.getAttribute('aria-disabled'), 'false');
    f.pointer(knob, 'pointerdown'); f.pointer(f.w, 'pointermove', { x: 110 }); f.pointer(f.w, 'pointerup', { x: 110 });
    assert.equal(f.C.getSend(id, 'bus-2').pan, initial + 10);
  }
  assert.equal(f.C.getStrip('ch-1').pan, -21); assert.equal(f.C.getStrip('aux-1').pan, 33);
  const busSend = f.C.getSend('bus-1', 'bus-2').pan;
  assert.equal(f.pan('bus-1').getAttribute('aria-disabled'), 'true');
  f.key(f.pan('bus-1'), 'End'); f.doubleClick(f.pan('bus-1'));
  assert.equal(f.C.getSend('bus-1', 'bus-2').pan, busSend);
  f.C.setSof('mtx-1');
  const mainSend = f.C.getSend('main-1', 'mtx-1').pan;
  assert.equal(f.pan('main-1').getAttribute('aria-disabled'), 'true'); f.key(f.pan('main-1'), 'Home');
  assert.equal(f.C.getSend('main-1', 'mtx-1').pan, mainSend);
});

test('a linked SOF pan shows LINK and the channel value without accepting writes', t => {
  const f = fixture(t), knob = f.pan('ch-1');
  f.C.updateStrip('ch-1', { pan: -30 }); f.C.setSend('ch-1', 'bus-1', { pan: 18, panLink: true }); f.C.setSof('bus-1'); f.C.clearHistory();
  assert.equal(knob.querySelector('small').textContent, 'LINK'); assert.equal(knob.querySelector('output').textContent, 'L 30');
  assert.equal(knob.getAttribute('aria-disabled'), 'true'); assert.match(knob.title, /Pan link/);
  f.pointer(knob, 'pointerdown'); f.pointer(knob, 'pointermove', { x: 150 }); f.pointer(knob, 'pointerup', { x: 150 });
  f.key(knob, 'End'); f.doubleClick(knob);
  assert.equal(f.C.getStrip('ch-1').pan, -30); assert.equal(f.C.getSend('ch-1', 'bus-1').pan, 18);
  assert.equal(f.C.historyState().undoCount, 0); assert.equal(f.captures.size, 0);
  f.C.setSend('ch-1', 'bus-1', { panLink: false });
  assert.equal(knob.querySelector('small').textContent, 'SEND'); assert.equal(knob.querySelector('output').textContent, 'R 18');
  f.key(knob, 'ArrowLeft'); assert.equal(f.C.getSend('ch-1', 'bus-1').pan, 16);
  assert.equal(f.C.getStrip('ch-1').pan, -30);
});

test('changing SOF, linking the send or losing focus interrupts an active pan gesture', t => {
  const f = fixture(t), knob = f.pan('ch-1');
  f.C.setSend('ch-1', 'bus-1', { pan: -10, panLink: false }); f.C.setSend('ch-1', 'bus-2', { pan: 20, panLink: false });
  f.pointer(knob, 'pointerdown'); f.C.setSof('bus-1'); f.pointer(f.w, 'pointermove', { x: 130 });
  assert.equal(f.captures.size, 0); assert.equal(f.C.getStrip('ch-1').pan, 0); assert.equal(f.C.getSend('ch-1', 'bus-1').pan, -10);
  f.pointer(knob, 'pointerdown'); f.C.setSof('bus-2'); f.pointer(f.w, 'pointermove', { x: 130 });
  assert.equal(f.captures.size, 0); assert.equal(f.C.getSend('ch-1', 'bus-1').pan, -10); assert.equal(f.C.getSend('ch-1', 'bus-2').pan, 20);
  f.pointer(knob, 'pointerdown'); f.C.setSend('ch-1', 'bus-2', { panLink: true }); f.pointer(f.w, 'pointermove', { x: 130 });
  assert.equal(f.captures.size, 0); assert.equal(f.C.getSend('ch-1', 'bus-2').pan, 20);
  f.C.setSof(null); f.pointer(knob, 'pointerdown'); f.w.dispatchEvent(new f.w.Event('blur'));
  assert.equal(f.captures.size, 0); f.pointer(knob, 'pointermove', { x: 150 }); assert.equal(f.C.getStrip('ch-1').pan, 0);
  f.pointer(knob, 'pointerdown', { button: 2 }); assert.equal(f.captures.size, 0);
});

test('live pan requires a received value, writable metadata and Control, and rolls back denied writes', t => {
  const f = liveFixture(t), knob = f.pan('ch-1'), path = f.path('ch-1');
  const rejected = () => {
    const before = f.C.getStrip('ch-1').pan, writes = f.reviews.length;
    f.key(knob, 'End'); f.doubleClick(knob); f.pointer(knob, 'pointerdown'); f.pointer(knob, 'pointermove', { x: 150 }); f.pointer(knob, 'pointerup', { x: 150 });
    assert.equal(f.C.getStrip('ch-1').pan, before); assert.equal(f.reviews.length, writes); assert.equal(f.captures.size, 0);
  };
  assert.equal(knob.querySelector('output').textContent, '—'); rejected();
  f.loaded.add(path); f.C.refresh(); assert.equal(knob.getAttribute('aria-disabled'), 'true'); rejected();
  f.metadata.set(path, { readOnly: true, min: -100, max: 100 }); f.C.refresh(); rejected();
  f.metadata.set(path, { readOnly: false, min: -100, max: 100 }); f.state.writable = false; f.C.refresh(); rejected();
  f.state.writable = true; f.C.refresh(); assert.equal(knob.getAttribute('aria-disabled'), 'false');
  f.key(knob, 'ArrowRight'); assert.equal(f.C.getStrip('ch-1').pan, 2); assert.equal(f.reviews.length, 1);
  f.state.accept = false; f.key(knob, 'End');
  assert.equal(f.C.getStrip('ch-1').pan, 2, 'a rejected live mutation does not leave an optimistic UI value');
  assert.equal(knob.getAttribute('aria-valuenow'), '2'); assert.equal(f.reviews.length, 2);
});

test('live pan stops on session changes or loss of write permission, including an independent SOF send', t => {
  const f = liveFixture(t), knob = f.pan('ch-1'), path = f.path('ch-1');
  f.loaded.add(path); f.metadata.set(path, { readOnly: false }); f.C.refresh();
  f.pointer(knob, 'pointerdown'); f.state.session++; f.pointer(f.w, 'pointermove', { x: 150 });
  assert.equal(f.captures.size, 0); assert.equal(f.C.getStrip('ch-1').pan, 0); assert.equal(f.reviews.length, 0);
  f.pointer(knob, 'pointerdown'); f.state.writable = false; f.C.refresh(); f.pointer(f.w, 'pointermove', { x: 150 });
  assert.equal(f.captures.size, 0); assert.equal(f.C.getStrip('ch-1').pan, 0);
  f.state.writable = true;
  f.C.setSend('ch-1', 'bus-1', { pan: 12, panLink: false }); f.C.setSof('bus-1');
  const sendPath = f.sendPath('ch-1', 'bus-1'); f.loaded.add(sendPath); f.metadata.set(sendPath, { readOnly: false }); f.C.refresh();
  f.loaded.add(f.w.SculptWingMap.sendPath('ch-1', 'bus-1', 'panLink')); f.C.refresh();
  f.reviews.length = 0; assert.equal(knob.getAttribute('aria-disabled'), 'false');
  f.pointer(knob, 'pointerdown'); f.pointer(f.w, 'pointermove', { x: 110 });
  assert.equal(f.C.getSend('ch-1', 'bus-1').pan, 22); assert.equal(f.C.getStrip('ch-1').pan, 0);
  f.state.session++; f.pointer(f.w, 'pointermove', { x: 140 });
  assert.equal(f.captures.size, 0); assert.equal(f.C.getSend('ch-1', 'bus-1').pan, 22); assert.equal(f.reviews.length, 1);
  f.pointer(knob, 'pointerdown'); f.metadata.set(sendPath, { readOnly: true }); f.C.refresh(); f.pointer(f.w, 'pointermove', { x: 160 });
  assert.equal(f.captures.size, 0); assert.equal(f.C.getSend('ch-1', 'bus-1').pan, 22);
});

test('pan does not accumulate a rejected drag while a live undo is waiting for readback', async t => {
  const f = liveFixture(t), knob = f.pan('ch-1'), path = f.path('ch-1');
  f.loaded.add(path); f.metadata.set(path, { readOnly: false }); f.C.refresh();
  f.key(knob, 'ArrowRight'); assert.equal(f.C.getStrip('ch-1').pan, 2);
  let release;
  const pendingReadback = new Promise(resolve => { release = resolve; });
  f.w.SculptLive.settled = () => pendingReadback;
  const undo = f.C.undo(); assert.equal(f.C.historyState().busy, true);
  f.pointer(knob, 'pointerdown', { x: 100, y: 200 }); f.pointer(f.w, 'pointermove', { x: 130, y: 200 });
  assert.equal(f.captures.size, 0, 'a gesture cannot start while undo owns the mutation');
  assert.equal(f.C.getStrip('ch-1').pan, 2);
  release(); assert.equal((await undo).ok, true); assert.equal(f.C.getStrip('ch-1').pan, 0);
  f.pointer(knob, 'pointermove', { x: 131, y: 200 });
  assert.equal(f.C.getStrip('ch-1').pan, 0, 'the rejected 30px movement cannot be applied after readback');
  f.pointer(knob, 'pointerdown', { x: 131, y: 200 }); f.pointer(f.w, 'pointermove', { x: 134, y: 200 }); f.pointer(f.w, 'pointerup', { x: 134, y: 200 });
  assert.equal(f.C.getStrip('ch-1').pan, 3, 'a new gesture starts from the confirmed value');
});

test('live linked pan never exposes the previous local pan while link or source values are unknown', t => {
  const f = liveFixture(t), knob = f.pan('ch-1');
  f.C.updateStrip('ch-1', { pan: -35 });
  f.C.setSend('ch-1', 'bus-1', { pan: 18, panLink: true }); f.C.setSof('bus-1');
  const sendPan = f.sendPath('ch-1', 'bus-1'), link = f.w.SculptWingMap.sendPath('ch-1', 'bus-1', 'panLink');
  f.loaded.add(sendPan); f.metadata.set(sendPan, { readOnly: false }); f.C.refresh();
  assert.equal(knob.querySelector('output').textContent, '—', 'unknown pan-link is not inferred from the local scene');
  assert.equal(knob.querySelector('small').textContent, 'SEND', 'unknown pan-link has no LINK label');
  assert.match(knob.title, /In attesa/);
  assert.equal(knob.getAttribute('aria-valuenow'), null);
  f.loaded.add(link); f.C.refresh();
  assert.equal(knob.querySelector('small').textContent, 'LINK');
  assert.equal(knob.querySelector('output').textContent, '—', 'known LINK still waits for the actual channel pan');
  assert.equal(knob.getAttribute('aria-valuenow'), null); assert.equal(knob.getAttribute('aria-valuetext'), 'Non disponibile');
  f.loaded.add(f.path('ch-1')); f.C.refresh();
  assert.equal(knob.querySelector('output').textContent, 'L 35'); assert.equal(knob.getAttribute('aria-valuenow'), '-35');
  assert.equal(knob.getAttribute('aria-disabled'), 'true');
  f.C.setSend('ch-1', 'bus-1', { panLink: false }); f.loaded.delete(f.path('ch-1')); f.C.refresh();
  assert.equal(knob.querySelector('output').textContent, 'R 18'); assert.equal(knob.getAttribute('aria-disabled'), 'false');
});
