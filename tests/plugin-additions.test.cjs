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
const WingMap = require('../dist/wing-map.js');

function fixture() {
  const dom = new JSDOM('<!doctype html><html><body><main id="panel"></main></body></html>', {
    url: 'https://sculpt.invalid', runScripts: 'outside-only'
  });
  const w = dom.window, state = Model.defaults(), listeners = new Set();
  let transactions = 0;
  w.SculptModel = Model; w.SculptCatalog = Catalog; w.SculptPanelLayout = Panels;
  w.SculptController = {
    getState: () => state, getStrip: id => Model.find(state, id), listStrips: () => Model.list(state),
    transact(fn) { transactions++; fn(state); for (const listener of [...listeners]) listener(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, toast() {}
  };
  w.SculptUI = {
    toast() {}, register() {}, modal() { throw new Error('No modal expected'); },
    el(tag, cls, text) {
      const node = w.document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      return node;
    },
    button(label, action, cls) {
      const node = this.el('button', cls, label);
      if (action) node.addEventListener('click', action);
      return node;
    }
  };
  const run = file => vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8'),
    dom.getInternalVMContext(), { filename: file }
  );
  for (const file of ['plugin-original-dynamics-extra.js', 'desk.js', 'plugins.js']) run(file);
  const panel = w.document.getElementById('panel'), ctx = { type: 'strip', id: 'ch-1', block: 'dyn' };
  let cleanup = () => {};
  return {
    dom, w, panel, ctx, run, D: w.SculptDesk, transactionCount: () => transactions,
    show(id) { cleanup(); assert.equal(w.SculptDesk.setModel(ctx, id), true); cleanup = w.SculptFX.renderProcessor(panel, ctx); },
    redraw() { cleanup(); cleanup = w.SculptFX.renderProcessor(panel, ctx); },
    close() { cleanup(); dom.window.close(); }
  };
}

test('five additional dynamics panels expose their real parameters once, including common mix and gain', () => {
  const f = fixture();
  try {
    let face = 0, all = 0;
    for (const id of ['DEQ2', 'CMB', 'E88C', 'LMT', 'ONEC']) {
      f.show(id);
      const model = Catalog.get(f.ctx, id), controls = [...f.panel.querySelectorAll('[data-parameter]')];
      assert.deepEqual(controls.map(c => c.dataset.parameter).sort(), model.parameters.map(p => p.key).sort(), id);
      assert.equal(new Set(controls.map(c => c.dataset.parameter)).size, controls.length, id);
      const stage = f.panel.querySelector('.fx-original-stage');
      assert.ok(stage, `${id}: dedicated face`);
      assert.match(stage.dataset.referenceDocument, /WING Remote Protocols/);
      face += stage.querySelectorAll('[data-parameter]').length;
      all += controls.length;
      if (['E88C', 'LMT', 'ONEC'].includes(id)) {
        assert.ok(f.panel.querySelector('.fx-original-extras [data-parameter="mix"]'));
        assert.ok(f.panel.querySelector('.fx-original-extras [data-parameter="gain"]'));
      }
    }
    assert.equal(face, 41); assert.equal(all, 47);
  } finally { f.close(); }
});

test('Dual Dynamic EQ selects the real page value and isolates its two bands and active gestures', () => {
  const f = fixture();
  try {
    f.show('DEQ2');
    const state = () => f.D.processor(f.ctx).params;
    const pageButtons = [...f.panel.querySelectorAll('[data-parameter="$page"] button')];
    assert.deepEqual(pageButtons.map(b => b.textContent), ['DEQ 1', 'DEQ 2']);
    assert.equal(pageButtons[0].getAttribute('aria-pressed'), 'true');
    const one = f.panel.querySelector('[data-parameter="1-thr"]');
    const two = f.panel.querySelector('[data-parameter="2-thr"]');
    assert.equal(one.hidden, false); assert.equal(two.hidden, true);

    const knob = one.querySelector('[role="slider"]');
    knob.setPointerCapture = () => {}; knob.hasPointerCapture = () => false;
    const pointer = (type, y) => {
      const event = new f.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 30, clientY: y, button: 0 });
      Object.defineProperties(event, { pointerId: { value: 7 }, pointerType: { value: 'mouse' } });
      knob.dispatchEvent(event);
    };
    const initial = state()['1-thr'];
    pointer('pointerdown', 100);
    pageButtons[1].click();
    assert.equal(state().$page, 1); assert.equal(typeof state().$page, 'number');
    assert.equal(one.hidden, true); assert.equal(two.hidden, false);
    pointer('pointermove', 25); pointer('pointerup', 25);
    assert.equal(state()['1-thr'], initial, 'a hidden band cannot keep a drag');

    const input = two.querySelector('input');
    input.value = '-33.5'; input.dispatchEvent(new f.w.Event('change'));
    assert.equal(state()['2-thr'], -33.5); assert.equal(state()['1-thr'], initial);
    f.D.setParam(f.ctx, '$page', 0);
    assert.equal(pageButtons[0].getAttribute('aria-pressed'), 'true');
    assert.equal(pageButtons[1].getAttribute('aria-pressed'), 'false');
    assert.equal(one.hidden, false); assert.equal(two.hidden, true);
    const filter = [...f.panel.querySelectorAll('[data-parameter="1-filt"] button')].find(b => b.textContent === 'LP 6dB');
    filter.click();
    assert.equal(state()['1-filt'], 'LP6', 'the caption must not replace the WING enum value');
    assert.equal(state()['2-filt'], 'OFF');
  } finally { f.close(); }
});

test('original push-button captions preserve independent boolean states and the reversed E88C threshold', () => {
  const f = fixture();
  try {
    f.show('E88C');
    const pull = f.panel.querySelector('[data-parameter="thrpull"] button');
    assert.equal(pull.textContent, '-20'); assert.equal(pull.getAttribute('aria-checked'), 'false');
    pull.click();
    assert.equal(f.D.processor(f.ctx).params.thrpull, 1);
    assert.equal(pull.textContent, '-20'); assert.equal(pull.getAttribute('aria-checked'), 'true');
    const threshold = f.panel.querySelector('[data-parameter="thr"] .fx-knob');
    threshold.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal(f.D.processor(f.ctx).params.thr, 20);
    assert.equal(threshold.style.getPropertyValue('--turn'), '-135deg');

    f.show('LMT');
    const shaper = f.panel.querySelector('[data-parameter="ton"] button');
    const comp = f.panel.querySelector('[data-parameter="con"] button');
    assert.equal(shaper.textContent, 'IN'); assert.equal(comp.textContent, 'IN');
    shaper.click();
    assert.equal(f.D.processor(f.ctx).params.ton, 1); assert.equal(f.D.processor(f.ctx).params.con, 0);
    assert.equal(shaper.getAttribute('aria-checked'), 'true'); assert.equal(comp.getAttribute('aria-checked'), 'false');

    f.show('ONEC');
    const auto = f.panel.querySelector('[data-parameter="dag"] button');
    auto.click();
    const reduction = f.panel.querySelector('[data-parameter="gr"] input');
    reduction.value = '4.2'; reduction.dispatchEvent(new f.w.Event('change'));
    assert.equal(f.D.processor(f.ctx).params.gr, 4.2); assert.equal(f.D.processor(f.ctx).params.dag, 1);
    assert.equal(f.panel.querySelectorAll('.fx-original-meter').length, 0, 'the one knob is a parameter, not an invented meter');
  } finally { f.close(); }
});

test('the real live definition contract locks both ambiguous CMB peak controls before any mutation', () => {
  const f = fixture();
  try {
    f.show('CMB');
    const definition = WingMap.processorSpec(f.ctx, 'CMB');
    assert.equal(definition.parameterPath('peak'), null);
    assert.equal(definition.parameterPath('peak__2'), null);
    const peak = f.panel.querySelector('[data-parameter="peak"] button');
    const reduction = f.panel.querySelector('[data-parameter="peak__2"] input');
    peak.click(); reduction.value = '36'; reduction.dispatchEvent(new f.w.Event('change'));
    assert.equal(f.D.processor(f.ctx).params.peak, 1);
    assert.equal(f.D.processor(f.ctx).params.peak__2, 36);

    // Exercise live.js itself with an in-memory session boundary. This checks
    // definition resolution and DOM handlers, and makes no native I/O claim.
    const writes = [];
    f.w.SculptWingMap = WingMap;
    f.w.SculptLiveSession = { Session: class {
      constructor() {
        this.metadata = new Map(); this.values = new Map(); this.epoch = 1;
        for (const parameter of Catalog.get(f.ctx, 'CMB').parameters) {
          const path = definition.parameterPath(parameter.key);
          if (!path) continue;
          this.values.set(path, f.D.processor(f.ctx).params[parameter.key]);
          this.metadata.set(path, {
            path, readOnly: false, min: parameter.min, max: parameter.max,
            type: parameter.type === 'enum' ? 6 : parameter.type === 'boolean' ? 4 : 1,
            ...(parameter.options ? { items: parameter.options.map(value => ({ value, label: value })) } : {})
          });
        }
        this.writable = true;
      }
      active() { return true; }
      connected() { return true; }
      snapshot() { return { mode: 'live', writable: true, pending: 0 }; }
      processorState() { return { ready: true }; }
      async ensureProcessor() {}
      async write(path, value) { writes.push({ path, value }); }
    } };
    f.run('live.js');
    assert.equal(f.w.SculptLive.parameterDefinition(f.ctx, 'peak').readOnly, true);
    assert.equal(f.w.SculptLive.parameterDefinition(f.ctx, 'peak__2').readOnly, true);
    assert.equal(f.w.SculptLive.parameterDefinition(f.ctx, 'thr').readOnly, false);
    f.redraw();
    const lockedPeak = f.panel.querySelector('[data-parameter="peak"] button');
    const lockedReduction = f.panel.querySelector('[data-parameter="peak__2"] input');
    assert.equal(lockedPeak.disabled, true); assert.equal(lockedReduction.disabled, true);
    const beforeMutations = f.transactionCount();
    lockedPeak.click(); lockedReduction.value = '50'; lockedReduction.dispatchEvent(new f.w.Event('change'));
    assert.equal(f.D.processor(f.ctx).params.peak, 1);
    assert.equal(f.D.processor(f.ctx).params.peak__2, 36);
    assert.equal(f.transactionCount(), beforeMutations, 'disabled controls never reach the mutation boundary');
    assert.equal(writes.length, 0);
    for (const key of ['thr', 'depth', 'fast', 'ingain', 'mode']) {
      const control = f.panel.querySelector(`[data-parameter="${key}"]`);
      assert.equal(control.querySelector('input,button,select').disabled, false, `${key} remains editable`);
    }
  } finally { f.close(); }
});
