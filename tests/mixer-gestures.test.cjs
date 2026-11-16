'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const base = path.join(__dirname, '../dist');

function fixture(t, withEditor = false) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), { url: 'https://sculpt.test', runScripts: 'outside-only' });
  const w = dom.window, captures = new Map(), opened = [];
  t.after(() => dom.window.close());
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0;
  w.HTMLElement.prototype.setPointerCapture = function (id) { captures.set(id, this); };
  w.HTMLElement.prototype.hasPointerCapture = function (id) { return captures.get(id) === this; };
  w.HTMLElement.prototype.releasePointerCapture = function (id) {
    if (captures.get(id) !== this) return;
    captures.delete(id);
    const event = new w.Event('lostpointercapture', { bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: id });
    this.dispatchEvent(event);
  };
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const run = file => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  run('model.js'); run('app.js');
  if (withEditor) {
    run('plugin-data.js'); run('desk.js'); run('shell.js'); run('plugin-panels.js'); run('plugins.js'); run('editor.js');
  } else w.SculptEditor = { open: id => opened.push(id) };
  for (const row of ['outputs', 'inputs']) {
    const scroller = w.document.getElementById(`${row}-scroll`);
    Object.defineProperties(scroller, { clientWidth: { value: 320 }, scrollWidth: { value: 2400 } });
  }
  for (const slider of w.document.querySelectorAll('.fader')) slider.getBoundingClientRect = () => ({ top: 100, bottom: 324, left: 10, right: 62, width: 52, height: 224 });
  function pointer(target, type, { id = 1, kind = 'mouse', x = 100, y = 200, button = 0, shiftKey = false } = {}) {
    if (type !== 'pointerdown' && captures.has(id)) target = captures.get(id);
    const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button, buttons: type === 'pointerup' ? 0 : 1, shiftKey });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: kind } });
    target.dispatchEvent(event);
    if (type === 'pointerup' || type === 'pointercancel') captures.delete(id);
    return event;
  }
  const click = (target, detail = 1) => target.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, detail }));
  return { w, C: w.SculptController, pointer, click, captures, opened, strip: id => w.document.querySelector(`.strip[data-id="${id}"]`), scroll: row => w.document.getElementById(`${row}-scroll`) };
}

test('both channel banks pan by mouse drag from the rail without moving a fader', t => {
  const f = fixture(t);
  for (const [row, id] of [['inputs', 'ch-1'], ['outputs', 'bus-1']]) {
    const rail = f.strip(id).querySelector('.fader'), scroller = f.scroll(row), before = f.C.getStrip(id).level;
    scroller.scrollLeft = 100;
    f.pointer(rail, 'pointerdown', { x: 220 });
    f.pointer(rail, 'pointermove', { x: 217 });
    assert.equal(scroller.scrollLeft, 100, 'a click-sized movement is not a pan');
    f.pointer(rail, 'pointermove', { x: 120 });
    assert.equal(scroller.scrollLeft, 200);
    assert.equal(f.captures.get(1), scroller, 'the row keeps the gesture outside its initial strip');
    assert.equal(scroller.classList.contains('panning'), true);
    f.pointer(f.w, 'pointerup', { x: 120 });
    assert.equal(f.C.getStrip(id).level, before);
    assert.equal(scroller.classList.contains('panning'), false);
    assert.equal(f.captures.size, 0);
  }
});

test('pan from strip buttons never opens the editor, level dialog, mute or SOF; a normal click still works', t => {
  const f = fixture(t), scroller = f.scroll('outputs'), strip = f.strip('bus-1');
  for (const selector of ['.strip-label', '.level-readout', '.mute-button', '.sof-button']) {
    const button = strip.querySelector(selector);
    f.pointer(button, 'pointerdown', { x: 230 });
    f.pointer(button, 'pointermove', { x: 160 });
    f.pointer(button, 'pointerup', { x: 160 });
    f.click(button);
  }
  assert.deepEqual(f.opened, []);
  assert.equal(f.w.document.getElementById('level-dialog').open, false);
  assert.equal(f.C.getStrip('bus-1').mute, false);
  assert.equal(f.C.getSof(), null);
  const mute = strip.querySelector('.mute-button');
  f.pointer(mute, 'pointerdown'); f.pointer(mute, 'pointerup'); f.click(mute);
  assert.equal(f.C.getStrip('bus-1').mute, true);
  const label = strip.querySelector('.strip-label');
  f.pointer(label, 'pointerdown'); f.pointer(label, 'pointerup'); f.click(label);
  assert.deepEqual(f.opened, ['bus-1']);
  assert.ok(scroller.scrollLeft > 0);
});

test('only the fader head accepts pointer drags; deliberate double click resets to unity', t => {
  const f = fixture(t), strip = f.strip('ch-1'), rail = strip.querySelector('.fader'), cap = strip.querySelector('.fader-cap');
  f.C.updateStrip('ch-1', { level: -10 });
  f.pointer(rail, 'pointerdown'); f.pointer(rail, 'pointermove', { y: 100 }); f.pointer(rail, 'pointerup', { y: 100 });
  assert.equal(f.C.getStrip('ch-1').level, -10);
  rail.dispatchEvent(new f.w.MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 }));
  assert.equal(f.C.getStrip('ch-1').level, 0, 'double click on the fader is an explicit unity action');
  assert.deepEqual(f.opened, [], 'double click must not open the channel editor');
  f.C.updateStrip('ch-1', { level: -10 });
  f.pointer(cap, 'pointerdown', { button: 2 }); f.pointer(rail, 'pointermove', { y: 100 }); f.pointer(rail, 'pointerup');
  assert.equal(f.C.getStrip('ch-1').level, -10, 'secondary mouse button cannot start a level edit');
  f.pointer(cap, 'pointerdown');
  assert.equal(f.w.document.activeElement, rail, 'head grab leaves keyboard controls focused');
  f.pointer(rail, 'pointermove', { id: 2, y: 160 });
  assert.equal(f.C.getStrip('ch-1').level, -10, 'another pointer cannot move an active fader');
  f.pointer(f.w, 'pointermove', { y: 160 });
  assert.equal(f.C.getStrip('ch-1').level, 0);
  assert.equal(f.scroll('inputs').scrollLeft, 0);
  f.pointer(f.w, 'pointermove');
  assert.equal(f.C.getStrip('ch-1').level, -10, 'returning the head to its starting point restores its level');
  f.pointer(f.w, 'pointerup');
  f.pointer(rail, 'pointermove', { y: 100 });
  assert.equal(f.C.getStrip('ch-1').level, -10, 'released pointer cannot keep changing the level');
  rail.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  assert.equal(f.C.getStrip('ch-1').level, -9.5, 'intentional keyboard editing is retained');
});

test('fader double click resets the active SOF send only and obeys a denied live write', t => {
  const f=fixture(t),rail=f.strip('ch-1').querySelector('.fader'),cap=rail.querySelector('.fader-cap'),before=f.C.getStrip('ch-1').level;
  f.C.setSend('ch-1','bus-2',{level:-18});f.C.setSof('bus-2');
  cap.dispatchEvent(new f.w.MouseEvent('dblclick',{bubbles:true,cancelable:true,button:0}));
  assert.equal(f.C.getSend('ch-1','bus-2').level,0);assert.equal(f.C.getStrip('ch-1').level,before);
  f.C.setSend('ch-1','bus-2',{level:-12});
  f.w.SculptLive={isLive:()=>true,applying:()=>false,reviewMutation:()=>false,hasStripValue:()=>true,canPersist:()=>false};
  cap.dispatchEvent(new f.w.MouseEvent('dblclick',{bubbles:true,cancelable:true,button:0}));
  assert.equal(f.C.getSend('ch-1','bus-2').level,-12,'a denied hardware mutation cannot leave an optimistic zero');
});

test('thumb dragging in SOF changes the send only, including touch; touch on the rail remains native pan', t => {
  const f = fixture(t), rail = f.strip('ch-1').querySelector('.fader'), cap = rail.querySelector('.fader-cap');
  const main = f.C.getStrip('ch-1').level;
  f.C.setSend('ch-1', 'bus-1', { level: -20 }); f.C.setSof('bus-1');
  const down = f.pointer(rail, 'pointerdown', { kind: 'touch' });
  const move = f.pointer(rail, 'pointermove', { kind: 'touch', x: 20 });
  f.pointer(rail, 'pointerup', { kind: 'touch', x: 20 });
  assert.equal(down.defaultPrevented, false); assert.equal(move.defaultPrevented, false);
  assert.equal(f.captures.size, 0, 'native touch scrolling is not captured by row pan code');
  assert.equal(f.C.getSend('ch-1', 'bus-1').level, -20);
  f.pointer(cap, 'pointerdown', { kind: 'touch' });
  f.pointer(f.w, 'pointermove', { kind: 'touch', y: 180 });
  f.pointer(f.w, 'pointerup', { kind: 'touch', y: 180 });
  assert.equal(f.C.getSend('ch-1', 'bus-1').level, -15);
  assert.equal(f.C.getStrip('ch-1').level, main);
});

test('cancelled pan and window blur release the gesture; a fresh click remains usable', t => {
  const f = fixture(t), scroller = f.scroll('inputs'), label = f.strip('ch-1').querySelector('.strip-label');
  f.pointer(label, 'pointerdown'); f.pointer(label, 'pointermove', { x: 20 }); f.pointer(f.w, 'pointercancel', { x: 20 });
  assert.equal(scroller.classList.contains('panning'), false);
  f.pointer(label, 'pointerdown'); f.pointer(label, 'pointermove', { x: 10 });
  f.w.dispatchEvent(new f.w.Event('blur'));
  assert.equal(scroller.classList.contains('panning'), false); assert.equal(f.captures.size, 0);
  f.pointer(label, 'pointerdown'); f.pointer(label, 'pointerup'); f.click(label);
  assert.deepEqual(f.opened, ['ch-1']);
});

test('vertical send editor rails are inert while their head and numeric control share the send state', t => {
  const f = fixture(t, true);
  f.C.setSend('ch-1', 'bus-1', { level: -20 });
  assert.equal(f.w.SculptEditor.openDevice('ch-1', 'sends'), true);
  const send = f.w.document.querySelector('.editor-device-panel[data-module="sends"]');
  assert.equal(send.dataset.expanded, 'true');
  assert.equal(f.w.document.querySelector('.editor-tabs [aria-selected="true"]').dataset.tab, 'devices');
  assert.equal(send.querySelectorAll('.editor-parameter-vertical').length, 8, 'the Send card exposes one bank of eight faders');
  const slider = send.querySelector('[aria-label="Livello → BUS 01 — cursore"]');
  const parameter = slider.closest('.editor-parameter'), rail = parameter.querySelector('.editor-fader-rail'), cap = parameter.querySelector('.editor-fader-cap');
  rail.getBoundingClientRect = () => ({ height: 222 }); cap.getBoundingClientRect = () => ({ height: 22 });
  f.pointer(rail, 'pointerdown'); f.pointer(rail, 'pointermove', { y: 100 }); f.pointer(rail, 'pointerup', { y: 100 });
  assert.equal(f.C.getSend('ch-1', 'bus-1').level, -20);
  assert.equal(f.pointer(slider, 'pointerdown').defaultPrevented, true, 'the native rail cannot perform a jump');
  f.pointer(slider, 'pointerup');
  f.pointer(cap, 'pointerdown'); f.pointer(cap, 'pointermove', { y: 180 }); f.pointer(cap, 'pointerup', { y: 180 });
  assert.equal(f.C.getSend('ch-1', 'bus-1').level, -10);
  assert.equal(Number(slider.value), -10);
  assert.equal(parameter.querySelector('.editor-number').value, '-10');
  assert.equal(f.w.document.querySelector('[aria-label="Livello → BUS 01 — cursore"]'), slider, 'send updates preserve the active control node');
  const numeric = parameter.querySelector('.editor-number'); numeric.value = '-7.4'; numeric.dispatchEvent(new f.w.Event('change', { bubbles: true }));
  assert.equal(f.C.getSend('ch-1', 'bus-1').level, -7.4);
  assert.equal(Number(slider.value), -7.4);
  slider.value = '-6.9'; slider.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(f.C.getSend('ch-1', 'bus-1').level, -6.9, 'native range input events still serve keyboard/accessibility edits');
});
