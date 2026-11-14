'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const Model = require('../dist/model.js');
const Catalog = require('../dist/plugin-data.js');
const Panels = require('../dist/plugin-panels.js');

function fixture(t) {
  const dom = new JSDOM('<!doctype html><html><body><main id="panel"></main></body></html>', { url: 'https://sculpt.invalid', runScripts: 'outside-only' });
  const w = dom.window, state = Model.defaults(), listeners = new Set(), gestures = [];
  w.SculptModel = Model; w.SculptCatalog = Catalog; w.SculptPanelLayout = Panels;
  const C = w.SculptController = {
    getState: () => state, getStrip: id => Model.find(state, id), listStrips: () => Model.list(state),
    transact(fn) { fn(state); for (const listener of [...listeners]) listener(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, toast() {},
    beginGesture(label) { gestures.push(['begin', label]); }, endGesture() { gestures.push(['end']); }
  };
  w.SculptUI = { toast() {}, register() {} };
  w.Element.prototype.setPointerCapture = function () {};
  w.Element.prototype.hasPointerCapture = function () { return false; };
  const files = ['desk.js', ...['layouts', 'dynamics', 'eq', 'fx', 'channel', 'native', 'dynamics-extra', 'filters'].map(part => `plugin-original-${part}.js`), 'plugins.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  const panel = w.document.getElementById('panel'), D = w.SculptDesk;
  let cleanup = () => {};
  const show = (ctx, model) => { cleanup(); if (model) D.setModel(ctx, model); cleanup = w.SculptFX.renderProcessor(panel, ctx, { rotaryBank: true }); return panel; };
  const change = (input, value) => { input.value = String(value); input.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const key = (node, value) => node.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: value }));
  const pointer = (node, type, y, id = 1) => { const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 100, clientY: y, button: 0 }); Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: 'mouse' } }); node.dispatchEvent(event); };
  t.after(() => { cleanup(); dom.window.close(); });
  return { w, D, C, panel, show, change, key, pointer, gestures, closePanel: () => cleanup(), emit: () => { for (const listener of [...listeners]) listener(); } };
}

const channelEq = { type: 'strip', id: 'ch-1', block: 'eq' };
const channelDyn = { type: 'strip', id: 'ch-1', block: 'dyn' };

test('WING EQ has one binding per parameter, linked band tabs and an explicit non-RTA curve', t => {
  const f = fixture(t); f.show(channelEq, 'STD');
  assert.ok(f.panel.querySelector('.fx-wing-eq'));
  assert.equal(f.panel.querySelector('.fx-original-stage'), null);
  assert.equal(f.panel.querySelector('.fx-supplemental-knobs'), null);
  assert.equal(f.panel.querySelectorAll('[data-parameter]').length, 20);
  assert.equal(f.panel.querySelectorAll('.fx-wing-band-tab').length, 6);
  assert.equal(f.panel.querySelectorAll('.fx-wing-band-pane:not([hidden])').length, 1);
  assert.match(f.panel.querySelector('.fx-wing-analysis-status').textContent, /RTA non disponibile/);
  assert.match(f.panel.querySelector('.fx-plot-caption').textContent, /nessun analizzatore audio/);
  const before = JSON.stringify(f.D.processor(channelEq));
  f.panel.querySelector('.fx-wing-band-tab[aria-label="Banda LOW"]').click();
  assert.equal(f.panel.querySelector('[data-parameter="lg"]').closest('.fx-wing-band-pane').hidden, false);
  assert.equal(f.panel.querySelector('[data-parameter="1g"]').closest('.fx-wing-band-pane').hidden, true);
  assert.equal(JSON.stringify(f.D.processor(channelEq)), before, 'selecting a band does not modify processing');
  const curve = f.panel.querySelector('.fx-plot-line'), initial = curve.getAttribute('d');
  f.change(f.panel.querySelector('[data-parameter="lg"] input'), 6);
  assert.equal(f.D.processor(channelEq).params.lg, 6); assert.notEqual(curve.getAttribute('d'), initial);
  f.panel.querySelector('.fx-eq-point[data-band="2"]').dispatchEvent(new f.w.FocusEvent('focusin', { bubbles: true }));
  assert.equal(f.panel.querySelector('[data-parameter="2g"]').closest('.fx-wing-band-pane').hidden, false);
  assert.equal(f.panel.querySelector('.fx-wing-band-tab[aria-label="Banda B2"]').getAttribute('aria-selected'), 'true');
  f.key(f.panel.querySelector('.fx-wing-band-tab[aria-label="Banda B2"]'), 'End');
  assert.equal(f.panel.querySelector('.fx-wing-band-tab[aria-label="Banda HIGH"]').getAttribute('aria-selected'), 'true');
});

test('output WING EQ retains eight bands, both shelf choices and its separate tilt', t => {
  const f = fixture(t), ctx = { type: 'strip', id: 'bus-1', block: 'eq' }; f.show(ctx, 'STD');
  const controls = [...f.panel.querySelectorAll('[data-parameter]')].map(node => node.dataset.parameter);
  assert.equal(new Set(controls).size, 27); assert.equal(controls.length, 27);
  assert.equal(f.panel.querySelectorAll('.fx-wing-band-tab').length, 8);
  assert.equal(f.panel.querySelectorAll('.fx-eq-point').length, 8);
  assert.ok(f.panel.querySelector('[data-parameter="leq"] select'));
  assert.ok(f.panel.querySelector('[data-parameter="heq"] select'));
  const tilt = f.panel.querySelector('.fx-wing-tilt [role="slider"]');
  assert.ok(tilt); f.key(tilt, 'End'); assert.equal(f.D.processor(ctx).params.tilt, Number(tilt.getAttribute('aria-valuemax')));
  assert.match(f.panel.querySelector('.fx-plot-caption').textContent, /tilt escluso/);
});

test('native WING dynamics exposes all real controls once with grouped rotaries and static graphs', t => {
  const f = fixture(t);
  for (const id of ['COMP', 'EXP', 'GATE', 'DUCK']) {
    f.show(channelDyn, id);
    const model = Catalog.get(channelDyn, id), controls = [...f.panel.querySelectorAll('[data-parameter]')];
    assert.deepEqual(controls.map(node => node.dataset.parameter).sort(), model.parameters.map(p => p.key).sort(), id);
    assert.equal(f.panel.querySelector('.fx-supplemental-knobs'), null);
    assert.equal(f.panel.querySelector('.fx-original-stage'), null);
    assert.equal(f.panel.querySelectorAll('.fx-wing-chart').length, 2);
    for (const parameter of model.parameters.filter(p => p.type === 'number')) assert.ok(f.panel.querySelector(`[data-parameter="${parameter.key}"] .fx-knob`), `${id}/${parameter.key}`);
    const curve = f.panel.querySelector('.fx-wing-chart-transfer path'), before = curve.getAttribute('d');
    f.change(f.panel.querySelector('[data-parameter="thr"] input'), -35);
    assert.equal(f.D.processor(channelDyn).params.thr, -35);
    assert.notEqual(curve.getAttribute('d'), before, id);
    const envelope = f.panel.querySelector('.fx-wing-chart-envelope path'), previousEnvelope = envelope.getAttribute('d');
    f.change(f.panel.querySelector('[data-parameter="att"] input'), 80);
    assert.notEqual(envelope.getAttribute('d'), previousEnvelope, id);
    assert.match(f.panel.querySelector('.fx-wing-reference-note').textContent, /nessuna misura audio/);
  }
});

test('unrelated desk events do not redraw processor controls or recalculate the EQ curve', t => {
  const f = fixture(t); f.show(channelEq, 'STD');
  const processor = f.panel.querySelector('.fx-wing-editor'), curve = processor.querySelector('.fx-plot-line'), originalPath = curve.getAttribute('d');
  const observer = new f.w.MutationObserver(() => {}); observer.observe(processor, { attributes: true, characterData: true, childList: true, subtree: true });
  for (let i = 0; i < 120; i++) { f.D.change(state => { state.showName = `Unrelated ${i}`; }); }
  assert.equal(observer.takeRecords().length, 0, '120 unrelated notifications should produce no processor DOM mutations');
  assert.equal(f.panel.querySelector('.fx-wing-editor'), processor, 'the panel is not rebuilt');
  f.D.setParam(channelEq, '1g', 4);
  assert.ok(observer.takeRecords().length > 0, 'a change to this processor still updates its controls');
  assert.notEqual(curve.getAttribute('d'), originalPath); observer.disconnect();
});

test('read-only and firmware limits survive the compact UI and a control-mode change', t => {
  const f = fixture(t); let writable = true;
  f.w.SculptLive = { isLive: () => true, isConnected: () => true, isWritable: () => writable, processorState: () => ({ ready: true }), parameterDefinition: (_, key) => ({ readOnly: !writable, ...(key === 'thr' ? { min: -30, max: -5, step: 1 } : {}) }) };
  f.show(channelDyn, 'COMP');
  const input = f.panel.querySelector('[data-parameter="thr"] input');
  assert.equal(input.min, '-30'); assert.equal(input.max, '-5');
  f.change(input, -100); assert.equal(f.D.processor(channelDyn).params.thr, -30);
  writable = false; f.emit();
  const locked = f.panel.querySelector('[data-parameter="thr"] input'), knob = f.panel.querySelector('[data-parameter="thr"] .fx-knob');
  assert.equal(locked.disabled, true); assert.equal(knob.getAttribute('aria-disabled'), 'true');
  const before = f.D.processor(channelDyn).params.thr; f.key(knob, 'End'); f.change(locked, -10);
  assert.equal(f.D.processor(channelDyn).params.thr, before);
  writable = true; f.emit(); assert.equal(f.panel.querySelector('[data-parameter="thr"] input').disabled, false);
});

test('processor drags bracket one undo gesture and cleanup closes an active gesture', t => {
  const f = fixture(t); f.show(channelDyn, 'COMP');
  const knob = f.panel.querySelector('[data-parameter="thr"] .fx-knob');
  f.pointer(knob, 'pointerdown', 200); f.pointer(knob, 'pointermove', 190); f.pointer(knob, 'pointermove', 180); f.pointer(knob, 'pointerup', 180);
  assert.deepEqual(f.gestures.map(event => event[0]), ['begin', 'end']);
  const ratio = f.panel.querySelector('[data-parameter="ratio"] .fx-rotary-choice');
  f.pointer(ratio, 'pointerdown', 200); f.pointer(ratio, 'pointermove', 160); f.closePanel();
  assert.deepEqual(f.gestures.map(event => event[0]), ['begin', 'end', 'begin', 'end']);
});
