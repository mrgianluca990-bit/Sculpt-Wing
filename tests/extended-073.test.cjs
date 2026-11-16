'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const base = path.join(__dirname, '../dist');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), { url: 'https://sculpt.test', runScripts: 'outside-only' });
  const w = dom.window, racks = new Map(), routes = new Map(), opened = [], placements = [], reads = [], engine = { connected: true, running: true };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.IntersectionObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0; w.cancelAnimationFrame = () => {};
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.setPointerCapture = function () {};
  w.HTMLElement.prototype.hasPointerCapture = () => false;
  w.HTMLElement.prototype.releasePointerCapture = function () {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const emit = id => w.dispatchEvent(new w.CustomEvent('sculpt-vst-state', { detail: id ? { id } : {} }));
  w.SculptVst = {
    getRack: id => { reads.push(id); return racks.get(id); },
    snapshot: () => engine,
    routingStatus: id => routes.get(id) || { state: 'applied' },
    openRack: id => opened.push({ id, rack: true }),
    openSlot: (id, index) => opened.push({ id, index }),
    async setPlacement(id, placement) {
      placements.push({ id, placement });
      racks.set(id, { slots: [], ...racks.get(id), placement }); emit(id);
      return racks.get(id);
    }
  };
  w.SculptEditor = { openDevice: (id, block) => opened.push({ id, block }) };
  for (const file of ['plugin-data.js', 'model.js', 'history.js', 'app.js', 'desk.js', 'shell.js', 'wing-map.js', 'channel-chain.js', 'dca-bank.js', 'row-layout.js', 'strip-pins.js', 'extended.js']) {
    vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  }
  const C = w.SculptController, D = w.SculptDesk, V = w.SculptMixerView, P = w.SculptStripPins;
  const strip = id => w.document.querySelector(`.strip[data-id="${id}"]`);
  const vst = id => strip(id).querySelector('.extended-vst');
  const device = (id, key) => strip(id).querySelector(`.extended-device[data-module="${key}"]`);
  const changePlacement = (id, value) => {
    const control = vst(id).querySelector('select'); control.value = value;
    control.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  t.after(() => w.close());
  return { w, C, D, V, P, racks, routes, engine, reads, opened, placements, emit, strip, vst, device, changePlacement };
}

test('unassigned and legacy racks keep eight processing slots and expose no invented WING association', t => {
  const f = fixture(t);
  f.racks.set('ch-2', { enabled: true, slots: [{ name: 'EQ salvato' }] });
  f.racks.set('ch-3', { placement: '__proto__', enabled: true, slots: [{ name: 'Comp salvato' }] });
  const before = plain(f.C.capture()); f.V.setMode('extended');
  const modules = ['input', 'gate', 'eq', 'dyn', 'pre', 'post', 'sends', 'master'];
  for (const id of ['ch-1', 'ch-2', 'ch-3']) {
    assert.equal(f.vst(id).dataset.placement, 'unassigned');
    assert.equal(f.vst(id).dataset.state, 'unassigned');
    assert.equal(f.vst(id).querySelector('select').value, '');
    assert.equal(f.vst(id).querySelector('select').selectedOptions[0].textContent, 'Da associare');
    assert(f.vst(id).previousElementSibling.classList.contains('extended-rack-heading'));
    assert.equal(f.strip(id).querySelectorAll('.extended-device').length, 8);
    assert.equal(f.device(id, 'home'), null);
    for (const key of modules) assert(f.device(id, key), `${id} ${key}`);
  }
  assert.equal(f.vst('ch-1').querySelectorAll('.extended-vst-slot:not([hidden])').length, 0, 'an empty strip has one rack action instead of repeated empty plugin rows');
  assert.equal(f.vst('ch-2').querySelector('[data-slot="vst-0"]').dataset.state, 'unassigned', 'a running host does not imply a WING patch');
  assert.equal(f.device('ch-1', 'pre').querySelector('.extended-slot-label').textContent, 'Insert 1');
  assert.equal(f.device('ch-1', 'post').querySelector('.extended-slot-label').textContent, 'Insert 2');
  f.vst('ch-1').querySelector('.extended-rack-button').click();
  assert.deepEqual(f.opened, [{ id: 'ch-1', rack: true }]);
  const received = f.device('mtx-1', 'sends');
  assert.equal(received.querySelector('.extended-slot').disabled, false);
  assert.equal(received.querySelector('.extended-slot-name').textContent, 'Riceve da');
  assert.equal(received.querySelector('.extended-device-drag').disabled, true, 'receive access does not invent a movable matrix tap');
  assert.deepEqual(f.placements, []); assert.deepEqual(plain(f.C.capture()), before);
});

test('PRE, Insert 1 and Insert 2 placement use only the rack API and move the same panel beside the chosen page', async t => {
  const f = fixture(t); f.V.setMode('extended');
  const rack = f.vst('ch-4'), select = rack.querySelector('select'), before = plain(f.C.capture());
  const controls = [...f.strip('ch-4').querySelectorAll('.fader, .strip-pan, .mute-button, .extended-device')];
  assert.deepEqual([...select.options].map(option => option.value), ['', 'pre', 'insert1', 'insert2']);
  for (const [placement, module] of [['pre', 'input'], ['insert1', 'pre'], ['insert2', 'post']]) {
    f.changePlacement('ch-4', placement); await tick();
    assert.equal(f.vst('ch-4'), rack); assert.equal(rack.querySelector('select'), select);
    assert.equal(rack.previousElementSibling, f.device('ch-4', module));
    assert.equal(rack.dataset.placement, placement); assert.equal(select.value, placement);
    assert.deepEqual([...f.strip('ch-4').querySelectorAll('.fader, .strip-pan, .mute-button, .extended-device')], controls);
  }
  assert.deepEqual(f.placements, [
    { id: 'ch-4', placement: 'pre' }, { id: 'ch-4', placement: 'insert1' }, { id: 'ch-4', placement: 'insert2' }
  ]);
  assert.deepEqual(plain(f.C.capture()), before, 'UI placement never patches the mixer or its undo history');
  assert.equal(f.C.historyState().undoCount, 0);
});

test('a pending or failed association keeps the confirmed position and a working fader', async t => {
  const f = fixture(t); f.racks.set('ch-1', { placement: 'pre', slots: [{ name: 'EQ' }] }); f.V.setMode('extended');
  let reject; const pending = new Promise((resolve, fail) => { reject = fail; });
  f.w.SculptVst.setPlacement = () => pending;
  const rack = f.vst('ch-1'), select = rack.querySelector('select'), fader = f.strip('ch-1').querySelector('.fader');
  f.changePlacement('ch-1', 'insert2');
  assert.equal(select.disabled, true); assert.equal(select.value, 'pre');
  assert.equal(rack.dataset.state, 'pending'); assert.equal(rack.previousElementSibling, f.device('ch-1', 'input'));
  const level = f.C.getStrip('ch-1').level;
  fader.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  assert(f.C.getStrip('ch-1').level > level, 'host preparation does not lock the channel controls');
  reject(new Error('Associazione rifiutata')); await tick();
  assert.equal(select.disabled, false); assert.equal(select.value, 'pre');
  assert.equal(rack.previousElementSibling, f.device('ch-1', 'input'));
  assert.equal(f.strip('ch-1').querySelector('.fader'), fader);
  assert.equal(f.w.document.getElementById('toast').textContent, 'Associazione rifiutata');
});

test('an older VST API opens its rack for configuration and does not pretend the selection was applied', async t => {
  const f = fixture(t); delete f.w.SculptVst.setPlacement; f.V.setMode('extended');
  const before = plain(f.C.capture()); f.changePlacement('ch-1', 'insert1'); await tick();
  assert.deepEqual(f.opened, [{ id: 'ch-1', rack: true }]);
  assert.equal(f.vst('ch-1').querySelector('select').value, '');
  assert.equal(f.vst('ch-1').dataset.placement, 'unassigned');
  assert.deepEqual(plain(f.C.capture()), before);
});

test('the intended placement and running USB engine do not imply a confirmed WING route', t => {
  const f = fixture(t); delete f.w.SculptVst.routingStatus;
  f.racks.set('ch-1', { placement: 'pre', enabled: true, slots: [{ name: 'EQ' }] });
  const before = plain(f.C.capture()); f.V.setMode('extended');
  const rack = f.vst('ch-1'), plugin = rack.querySelector('[data-vst-slot="0"]');
  assert.equal(rack.previousElementSibling, f.device('ch-1', 'input'), 'the rack is visually near its intended point');
  assert.equal(rack.dataset.routeState, 'planned');
  assert.equal(rack.querySelector('.extended-vst-route-status').textContent, 'Da applicare WING');
  assert.equal(rack.querySelector('.extended-vst-status').textContent, 'Audio USB attivo');
  assert.equal(plugin.dataset.state, 'unassigned', 'USB processing is distinct from confirmed WING association');
  f.w.SculptVst.routingStatus = id => f.routes.get(id);
  for (const [state, caption, pluginState] of [
    ['applied', 'WING associata', 'active'], ['stale', 'Da verificare', 'unassigned'], ['conflict', 'Conflitto WING', 'unassigned']
  ]) {
    f.routes.set('ch-1', { state });
    f.w.dispatchEvent(new f.w.CustomEvent('sculpt-vst-route-state', { detail: { rackId: 'ch-1' } }));
    assert.equal(rack.dataset.routeState, state);
    assert.equal(rack.querySelector('.extended-vst-route-status').textContent, caption);
    assert.equal(plugin.dataset.state, pluginState); assert.equal(rack.querySelector('[data-vst-slot="0"]'), plugin);
  }
  assert.deepEqual(plain(f.C.capture()), before); assert.deepEqual(f.placements, []);
});

test('sparse VST racks show every occupied slot in audio order and one add action at the first free slot', t => {
  const f = fixture(t), slots = Array(8).fill(null);
  slots[0] = { name: '<img src=x> EQ' }; slots[3] = { name: 'Comp', bypass: true }; slots[7] = { name: 'Delay', missing: true };
  f.racks.set('ch-1', { placement: 'insert1', enabled: true, slots }); f.V.setMode('extended');
  const rack = f.vst('ch-1'), visible = [...rack.querySelectorAll('.extended-vst-slot:not([hidden])')];
  assert.deepEqual(visible.map(node => node.dataset.vstSlot), ['0', '3', '7', '1']);
  assert.deepEqual(visible.map(node => node.dataset.state), ['active', 'bypass', 'missing', 'empty']);
  assert.equal(rack.querySelector('img'), null); assert.equal(visible[0].querySelector('.extended-slot-name').textContent, '<img src=x> EQ');
  assert.equal(rack.querySelector('.extended-rack-button').textContent, 'Rack · 3');
  assert.equal(rack.querySelectorAll('.extended-vst-slot[data-state=empty]:not([hidden])').length, 1);
  visible[2].click(); visible[3].click();
  assert.deepEqual(f.opened, [{ id: 'ch-1', index: 7 }, { id: 'ch-1', index: 1 }]);
  slots[1] = { name: 'Filtro' }; f.emit('ch-1');
  assert.equal(rack.querySelector('[data-vst-slot="7"]'), visible[2]);
  assert.equal(rack.querySelector('[data-vst-slot="1"]'), visible[3]);
  assert.deepEqual([...rack.querySelectorAll('.extended-vst-slot:not([hidden])')].map(node => node.dataset.vstSlot), ['0', '1', '3', '7', '2']);
});

test('host status remains explicit and scoped events do not repaint unrelated or hidden racks', t => {
  const f = fixture(t); f.engine.connected = false; f.engine.running = false;
  f.racks.set('ch-1', { placement: 'insert1', enabled: true, slots: [{ name: 'EQ' }] }); f.V.setMode('extended');
  const rack = f.vst('ch-1'), plugin = rack.querySelector('[data-vst-slot="0"]');
  assert.equal(plugin.dataset.state, 'unknown'); assert.equal(rack.querySelector('.extended-vst-status').textContent, 'Host scollegato');
  f.engine.connected = true; f.emit('ch-1');
  assert.equal(plugin.dataset.state, 'ready'); assert.equal(rack.querySelector('.extended-vst-status').textContent, 'Audio USB fermo');
  f.engine.running = true; f.emit('ch-1'); assert.equal(plugin.dataset.state, 'active');
  const observer = new f.w.MutationObserver(() => {}); observer.observe(rack, { subtree: true, attributes: true, characterData: true, childList: true });
  f.reads.length = 0; f.emit('ch-2'); assert.deepEqual(f.reads, ['ch-2']); assert.equal(observer.takeRecords().length, 0);
  f.reads.length = 0; f.emit('ch-1'); assert.deepEqual(f.reads, ['ch-1']); assert.equal(observer.takeRecords().length, 0, 'unchanged metadata produces no DOM writes');
  for (let i = 0; i < 5; i++) f.C.updateStrip('ch-1', { level: -20 + i });
  assert.equal(observer.takeRecords().length, 0, 'audio gestures leave the rack unchanged');
  f.V.setMode('compact'); f.reads.length = 0; f.racks.get('ch-1').placement = 'insert2'; f.emit('ch-1');
  assert.deepEqual(f.reads, []); assert.equal(rack.dataset.placement, 'insert1');
  f.V.setMode('extended'); assert.equal(rack.dataset.placement, 'insert2'); assert.equal(rack.querySelector('[data-vst-slot="0"]'), plugin);
  observer.disconnect();
});

test('a rack follows Insert 1 after reordering while extended faders show channel levels and Compact restores SOF', async t => {
  const f = fixture(t); f.racks.set('ch-1', { placement: 'insert1', slots: [{ name: 'EQ' }] });
  f.P.pin('ch-1', 'left'); f.C.setSof('bus-3'); f.C.selectStrip('ch-1'); f.C.clearHistory(); f.V.setMode('extended');
  const strip = f.strip('ch-1'), rack = f.vst('ch-1'), parent = strip.parentElement;
  const fader = strip.querySelector('.fader'), pan = strip.querySelector('.strip-pan'), mute = strip.querySelector('.mute-button');
  const nodes = new Map([...strip.querySelectorAll('.extended-device')].map(node => [node.dataset.module, node]));
  const before = plain(f.D.channel('ch-1').order);
  f.D.patchChannel('ch-1', { order: ['eq', 'dyn', 'insert', 'gate'] });
  assert.equal(rack.previousElementSibling, f.device('ch-1', 'pre')); assert.equal(rack.nextElementSibling, f.device('ch-1', 'gate'));
  for (const [key, node] of nodes) assert.equal(f.device('ch-1', key), node);
  assert.equal(f.strip('ch-1').parentElement, parent); assert.equal(f.P.sideOf('ch-1'), 'left'); assert.equal(f.C.getSof(), null);
  const level = f.C.getStrip('ch-1').level, send = f.C.getSend('ch-1', 'bus-3').level;
  fader.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  assert(f.C.getStrip('ch-1').level > level); assert.equal(f.C.getSend('ch-1', 'bus-3').level, send);
  assert.equal((await f.C.undo()).ok, true); assert.equal(f.C.getStrip('ch-1').level, level);
  assert.equal((await f.C.undo()).ok, true); assert.deepEqual(plain(f.D.channel('ch-1').order), before);
  assert.equal(rack.previousElementSibling, f.device('ch-1', 'pre'));
  assert.equal(strip.querySelector('.fader'), fader); assert.equal(strip.querySelector('.strip-pan'), pan); assert.equal(strip.querySelector('.mute-button'), mute);
  f.strip('ch-1').querySelector('.strip-label').click();
  for (const key of ['input', 'gate', 'eq', 'dyn', 'pre', 'post', 'sends', 'master']) f.device('ch-1', key).querySelector('.extended-slot').click();
  assert.deepEqual(f.opened.map(item => item.block), ['home', 'input', 'gate', 'eq', 'dyn', 'pre', 'post', 'sends', 'master']);
  f.V.setMode('compact'); assert.equal(f.C.getSof(), 'bus-3');
  f.V.setMode('extended'); assert.equal(f.C.getSof(), null);
  f.C.setSof('bus-2'); assert.equal(f.V.mode(), 'compact'); assert.equal(f.C.getSof(), 'bus-2', 'explicit SOF commands reveal their Compact view');
  f.V.setMode('extended'); f.C.setSof(null); f.V.setMode('compact'); assert.equal(f.C.getSof(), null, 'an explicit SOF off command clears the suspended Compact target');
});
