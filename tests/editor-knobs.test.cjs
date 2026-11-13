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
  const w = dom.window, captures = new Map();
  t.after(() => { w.SculptEditor?.close(); dom.window.close(); });
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0;
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.setPointerCapture = function (id) { captures.set(id, this); };
  w.HTMLElement.prototype.hasPointerCapture = function (id) { return captures.get(id) === this; };
  w.HTMLElement.prototype.releasePointerCapture = function (id) { if (captures.get(id) === this) captures.delete(id); };
  w.HTMLDialogElement.prototype.show = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const files = ['plugin-data.js', 'model.js', 'app.js', 'desk.js', 'shell.js', 'plugin-panels.js', ...['layouts', 'dynamics', 'eq', 'fx', 'channel', 'native', 'dynamics-extra', 'filters'].map(part => `plugin-original-${part}.js`), 'plugins.js', 'editor.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  const E = w.SculptEditor, C = w.SculptController, D = w.SculptDesk;
  E.open('ch-1');
  const editor = () => w.document.querySelector('.editor-dialog');
  const named = name => [...editor().querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === name);
  const tab = name => editor().querySelector(`[data-tab="${name}"]`).click();
  const key = (node, key, options = {}) => node.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options }));
  const change = (node, value) => { node.value = String(value); node.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const pointer = (target, type, y, options = {}) => {
    const id = options.id || 1;
    if (type !== 'pointerdown' && captures.has(id)) target = captures.get(id);
    const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, clientX: 100, button: 0, ...options });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: 'mouse' } });
    target.dispatchEvent(event);
    return event;
  };
  return { w, E, C, D, editor, named, tab, key, change, pointer, captures };
}

test('macro navigation opens the requested editor section without changing audio values', t => {
  const f = fixture(t), before = JSON.stringify(f.C.capture());
  assert.equal(f.E.openSection('ch-2', 'eq'), true);
  assert.equal(f.editor().querySelector('[role="tab"][aria-selected="true"]').dataset.tab, 'eq');
  assert.equal(f.E.openSection('ch-2', 'dynamics', { block: 'gate' }), true);
  assert.equal(f.editor().querySelector('[role="tab"][aria-selected="true"]').dataset.tab, 'dynamics');
  assert.equal(f.E.openSection('bus-1', 'dynamics', { block: 'gate' }), false);
  assert.equal(f.E.openSection('ch-2', 'missing'), false);
  assert.equal(f.editor().querySelector('[role="tab"][aria-selected="true"]').dataset.tab, 'dynamics');
  const previous = JSON.parse(before), after = JSON.parse(JSON.stringify(f.C.capture()));
  assert.deepEqual(after.values, previous.values);
  assert.deepEqual(after.sends, previous.sends);
  assert.deepEqual(after.desk.processing, previous.desk.processing);
});

test('every numeric channel parameter has a rotary sharing exact values with typed entry', t => {
  const f = fixture(t);
  for (const tab of ['channel', 'processing', 'sends', 'groups']) {
    f.tab(tab);
    for (const input of f.editor().querySelectorAll('.editor-number')) {
      const knob = input.closest('.editor-parameter').querySelector('.editor-knob');
      assert.ok(knob, `${input.getAttribute('aria-label')} must have a knob`);
      assert.equal(knob.getAttribute('role'), 'slider');
      assert.equal(Number(knob.getAttribute('aria-valuenow')), Number(input.value));
    }
  }
  f.tab('channel');
  const knob = f.named('Trim — manopola');
  f.key(knob, 'ArrowUp'); assert.equal(f.C.getStrip('ch-1').trim, .1);
  f.key(knob, 'PageUp'); assert.equal(f.C.getStrip('ch-1').trim, 1.1);
  f.change(f.named('Trim in dB'), 6.25); assert.equal(f.C.getStrip('ch-1').trim, 6.3);
  assert.equal(Number(knob.getAttribute('aria-valuenow')), 6.3);
  f.key(knob, 'End'); assert.equal(f.C.getStrip('ch-1').trim, 18);
  f.key(knob, 'Home'); assert.equal(f.C.getStrip('ch-1').trim, -18);
});

test('rotary drag keeps continuity when switching fine mode and stops on cancel or editor close', t => {
  const f = fixture(t), knob = f.named('Pan — manopola');
  f.pointer(knob, 'pointerdown', 200);
  f.pointer(f.w, 'pointermove', 182); assert.equal(f.C.getStrip('ch-1').pan, 20);
  f.pointer(f.w, 'pointermove', 164, { shiftKey: true }); assert.equal(f.C.getStrip('ch-1').pan, 23);
  f.pointer(f.w, 'pointermove', 146); assert.equal(f.C.getStrip('ch-1').pan, 43, 'releasing Shift does not jump to an old drag origin');
  f.pointer(f.w, 'pointercancel', 146); f.pointer(knob, 'pointermove', 100); assert.equal(f.C.getStrip('ch-1').pan, 43);
  f.pointer(knob, 'pointerdown', 200); f.E.close();
  assert.equal(f.captures.size, 0, 'closing the editor releases its pointer capture');
  f.pointer(knob, 'pointermove', 100); assert.equal(f.C.getStrip('ch-1').pan, 43);
});

test('logarithmic filter rotary and preamp controls preserve units, source sharing and limits', t => {
  const f = fixture(t);
  f.D.patchChannel('ch-2', { source: 'LCL:1' });
  f.key(f.named('Gain preamp — manopola'), 'End'); assert.equal(f.D.source('LCL:1').gain, 45.5);
  assert.equal(f.D.source(f.D.channel('ch-2').source).gain, 45.5);
  f.tab('processing');
  const knob = f.named('Low cut — manopola');
  f.change(f.named('Low cut in Hz'), 200);
  f.pointer(knob, 'pointerdown', 200); f.pointer(f.w, 'pointermove', 155); f.pointer(f.w, 'pointerup', 155);
  assert.equal(f.D.channel('ch-1').lowCut, 632, 'quarter-travel follows logarithmic frequency scale');
  assert.match(knob.getAttribute('aria-valuetext'), /632 Hz/);
  f.key(knob, 'End'); assert.equal(f.D.channel('ch-1').lowCut, 2000);
  f.change(f.named('Unità delay'), 'M'); f.change(f.named('Delay in m'), 34.3);
  assert.equal(f.D.channel('ch-1').delay, 100, 'distance remains backed by milliseconds');
  assert.match(f.named('Delay — manopola').getAttribute('aria-valuetext'), /34.3 m/);
});

test('vertical sends retain a cap-only drag and share their level with the added knob and zero-dB double click', t => {
  const f = fixture(t); f.tab('sends');
  const slider = f.named('Livello → BUS 01 — cursore'), knob = f.named('Livello → BUS 01 — manopola');
  const rail = slider.closest('.editor-parameter').querySelector('.editor-fader-rail');
  f.C.setSend('ch-1', 'bus-1', { level: -12.3 });
  f.pointer(rail, 'pointerdown', 200); f.pointer(rail, 'pointermove', 120); f.pointer(rail, 'pointerup', 120);
  assert.equal(f.C.getSend('ch-1', 'bus-1').level, -12.3);
  f.key(knob, 'ArrowUp'); assert.equal(f.C.getSend('ch-1', 'bus-1').level, -12.2); assert.equal(Number(slider.value), -12.2);
  rail.dispatchEvent(new f.w.MouseEvent('dblclick', { bubbles: true }));
  assert.equal(f.C.getSend('ch-1', 'bus-1').level, 0); assert.equal(Number(knob.getAttribute('aria-valuenow')), 0);
  assert.equal(f.named('Livello → BUS 01 — cursore'), slider);
});

test('disabling a linked pan or live writes rejects stale gestures and restores typed values', t => {
  const f = fixture(t); f.tab('sends');
  const knob = f.named('Pan → BUS 01 — manopola'), input = f.named('Pan → BUS 01');
  f.C.setSend('ch-1', 'bus-1', { panLink: true, pan: 0 });
  assert.equal(knob.getAttribute('aria-disabled'), 'true');
  f.key(knob, 'End'); f.change(input, 75); assert.equal(f.C.getSend('ch-1', 'bus-1').pan, 0); assert.equal(input.value, '0');
  f.C.setSend('ch-1', 'bus-1', { panLink: false });
  f.pointer(knob, 'pointerdown', 200);
  // A connection can turn read-only after the pointer was captured.
  f.w.SculptLive = { isLive: () => true, isConnected: () => true, isWritable: () => false };
  f.pointer(f.w, 'pointermove', 100); f.change(input, 50);
  assert.equal(f.C.getSend('ch-1', 'bus-1').pan, 0); assert.equal(f.captures.size, 0); assert.equal(input.value, '0');
  delete f.w.SculptLive;
});

test('original digital dynamics have additional rotaries linked to their original display and rebuild on model change', t => {
  const f = fixture(t); f.tab('dynamics');
  const ctx = { type: 'strip', id: 'ch-1', block: 'dyn' };
  const bank = f.editor().querySelector('.fx-supplemental-knobs'); assert.ok(bank, 'standard digital dynamics needs a visible knob bank');
  const control = bank.querySelector('[data-parameter]'), key = control.dataset.parameter, knob = control.querySelector('.fx-knob');
  const original = f.editor().querySelector(`.fx-original-stage [data-parameter="${key}"] .fx-number`);
  assert.ok(original, 'the original numeric display remains on its face');
  f.key(knob, 'End'); assert.equal(f.D.processor(ctx).params[key], Number(knob.getAttribute('aria-valuemax')));
  assert.equal(Number(original.value), f.D.processor(ctx).params[key]);
  f.change(original, Number(original.min)); assert.equal(Number(knob.getAttribute('aria-valuenow')), Number(original.min));
  f.change(f.named('Modello dyn'), '76LA');
  assert.equal(f.editor().querySelectorAll('.fx-supplemental-knobs').length, 0, 'an original rotary model does not duplicate its knobs');
  assert.ok(f.editor().querySelector('.fx-original-stage'));
});

test('numeric ratio choices expose a stepped rotary without changing the stored enum type', t => {
  const f = fixture(t); f.tab('dynamics');
  const ctx = { type: 'strip', id: 'ch-1', block: 'dyn' };
  const bank = f.editor().querySelector('.fx-supplemental-knobs');
  const ratio = bank.querySelector('[data-parameter="ratio"] .fx-rotary-choice');
  assert.ok(ratio, 'numeric ratio options receive an accessible stepped knob');
  const original = f.editor().querySelector('.fx-original-stage [data-parameter="ratio"] select');
  const options = [...original.options].map(option => option.value);
  f.key(ratio, 'End'); assert.equal(String(f.D.processor(ctx).params.ratio), options.at(-1));
  assert.equal(original.value, options.at(-1));
  f.key(ratio, 'Home'); assert.equal(String(f.D.processor(ctx).params.ratio), options[0]);
  f.change(original, options[1]); assert.equal(Number(ratio.getAttribute('aria-valuenow')), 1);
  assert.equal(bank.querySelector('[data-parameter="det"]'), null, 'non-numeric detector choice stays a normal selector');
});
