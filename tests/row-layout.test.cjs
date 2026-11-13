'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const key = 'sculpt-wing-row-layout-v1';
const code = fs.readFileSync(path.join(__dirname, '../dist/row-layout.js'), 'utf8');
function fixture(t, saved, { total = 800, viewport = 936 } = {}) {
  const dom = new JSDOM('<!doctype html><main class="console"><section class="mixer-row outputs"><div id="outputs-scroll"></div></section><div id="sof-bar" class="console-divider"><span id="sof-target">LIVELLI</span><button id="exit-sof">Livelli</button></div><section class="mixer-row inputs"><div id="inputs-scroll"></div></section><footer class="macro-rail"></footer></main>', { url: 'https://sculpt.test', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, captures = new Map(), consoleNode = w.document.querySelector('.console'), observers = [];
  Object.defineProperty(w, 'innerHeight', { value: viewport, configurable: true });
  let available = total, exitClicks = 0;
  for (const row of w.document.querySelectorAll('.mixer-row')) row.getBoundingClientRect = () => ({ height: available / 2 });
  w.HTMLElement.prototype.setPointerCapture = function (id) { captures.set(id, this); };
  w.HTMLElement.prototype.hasPointerCapture = function (id) { return captures.get(id) === this; };
  w.HTMLElement.prototype.releasePointerCapture = function (id) { captures.delete(id); };
  w.ResizeObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} };
  w.document.getElementById('exit-sof').addEventListener('click', () => exitClicks++);
  if (saved !== undefined) w.localStorage.setItem(key, typeof saved === 'string' ? saved : JSON.stringify(saved));
  vm.runInContext(code, dom.getInternalVMContext());
  const handle = w.document.querySelector('.row-resize-handle');
  const ratio = () => Number(consoleNode.style.getPropertyValue('--sculpt-upper-row'));
  const keyboard = (key, options = {}) => handle.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }));
  const pointer = (type, y, options = {}) => {
    const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, button: 0, ...options });
    Object.defineProperties(event, { pointerId: { value: options.id || 1 }, pointerType: { value: options.touch ? 'touch' : 'mouse' }, isPrimary: { value: options.primary !== false } });
    handle.dispatchEvent(event); return event;
  };
  const resize = (height, viewport) => { available = height; if (viewport) Object.defineProperty(w, 'innerHeight', { value: viewport, configurable: true }); observers[0].callback(); };
  return { w, consoleNode, handle, ratio, keyboard, pointer, captures, resize, exitClicks: () => exitClicks, saved: () => JSON.parse(w.localStorage.getItem(key)) };
}

test('row heights start equally and keyboard changes persist a separate layout preference', t => {
  const f = fixture(t); assert.equal(f.ratio(), .5); assert.equal(f.handle.getAttribute('role'), 'separator');
  assert.equal(f.handle.getAttribute('aria-orientation'), 'horizontal');
  f.keyboard('ArrowDown'); assert.equal(f.ratio(), .51);
  f.keyboard('ArrowUp', { shiftKey: true }); assert.equal(f.ratio(), .46);
  assert.equal(f.saved().version, 1); assert.equal(f.saved().ratio, .46);
  assert.match(f.handle.getAttribute('aria-valuetext'), /superiore 46%, riga inferiore 54%/);
  const restarted = fixture(t, f.saved()); assert.equal(restarted.ratio(), .46);
});

test('pointer and touch resize clamp both rows, release capture and keep SOF independent', t => {
  const f = fixture(t); f.pointer('pointerdown', 400, { touch: true });
  assert.equal(f.w.document.activeElement, f.handle);
  f.pointer('pointermove', 480, { touch: true }); assert.equal(f.ratio(), .6);
  f.pointer('pointermove', 5000, { touch: true }); assert.equal(f.ratio(), .73, 'lower row retains its 216px minimum');
  f.pointer('pointerup', 5000, { touch: true }); assert.equal(f.captures.size, 0); assert.equal(f.saved().ratio, .73);
  assert.equal(f.consoleNode.classList.contains('row-resizing'), false);
  f.pointer('pointermove', 10); assert.equal(f.ratio(), .73, 'released pointers do not continue resizing');
  f.handle.click(); assert.equal(f.exitClicks(), 0);
  f.w.document.getElementById('exit-sof').click(); assert.equal(f.exitClicks(), 1, 'the existing SOF exit remains its own button');
});

test('cancel, blur, Escape and other pointers terminate or reject the appropriate resize', t => {
  const f = fixture(t);
  f.pointer('pointerdown', 400, { button: 2 }); f.pointer('pointermove', 480); assert.equal(f.ratio(), .5);
  f.pointer('pointerdown', 400); f.pointer('pointermove', 480, { id: 2 }); assert.equal(f.ratio(), .5);
  f.pointer('pointermove', 480); f.pointer('pointercancel', 480); assert.equal(f.ratio(), .6); assert.equal(f.captures.size, 0);
  f.pointer('pointerdown', 400); f.pointer('pointermove', 440); f.w.dispatchEvent(new f.w.Event('blur')); assert.equal(f.ratio(), .65); assert.equal(f.captures.size, 0);
  f.pointer('pointerdown', 400); f.pointer('pointermove', 440); f.keyboard('Escape'); assert.equal(f.ratio(), .65, 'Escape restores the ratio from gesture start'); assert.equal(f.captures.size, 0);
});

test('double click and Enter restore 50/50, including the stored preference', t => {
  const f = fixture(t, { version: 1, ratio: .64 });
  f.handle.dispatchEvent(new f.w.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  assert.equal(f.ratio(), .5); assert.equal(f.saved().ratio, .5);
  f.keyboard('End'); assert.equal(f.ratio(), .73); f.keyboard('Enter'); assert.equal(f.ratio(), .5);
  f.keyboard('Home'); assert.equal(f.ratio(), .27); f.keyboard('0'); assert.equal(f.ratio(), .5);
});

test('responsive minimum heights constrain the visible ratio without losing the preferred ratio', t => {
  const f = fixture(t, { version: 1, ratio: .7 });
  f.resize(500, 700); assert.ok(Math.abs(f.ratio() - .568) < 1e-9);
  assert.equal(f.saved().ratio, .7, 'resizing the window does not overwrite the chosen proportion');
  f.resize(800, 936); assert.equal(f.ratio(), .7);
  f.resize(400, 600); assert.ok(Math.abs(f.ratio() - .59) < 1e-9);
  f.resize(200, 360); assert.equal(f.ratio(), .5, 'extremely short windows retain both rows equally');
});

test('invalid or blocked storage cannot disable the divider', t => {
  const malformed = fixture(t, '{broken'); assert.equal(malformed.ratio(), .5);
  const invalid = fixture(t, { version: 1, ratio: 4 }); assert.equal(invalid.ratio(), .5);
  const f = fixture(t);
  f.w.Storage.prototype.setItem = () => { throw new Error('blocked'); };
  f.keyboard('PageDown'); assert.equal(f.ratio(), .6);
  assert.doesNotThrow(() => f.pointer('pointerup', 500));
});
