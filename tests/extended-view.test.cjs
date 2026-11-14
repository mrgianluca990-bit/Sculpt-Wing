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

function fixture(t, { saved, desktop = false, realVst = false } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), { url: 'https://sculpt.test', runScripts: 'outside-only' });
  const w = dom.window, listeners = new Map(), racks = new Map(), vstOpened = [], fxOpened = [];
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.IntersectionObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0;
  w.cancelAnimationFrame = () => {};
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.setPointerCapture = function () {};
  w.HTMLElement.prototype.hasPointerCapture = () => false;
  w.HTMLElement.prototype.releasePointerCapture = function () {};
  w.HTMLDialogElement.prototype.show = function () { this.open = true; };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  if (saved) w.localStorage.setItem('sculpt-wing-mixer-view-v1', JSON.stringify(saved));
  if (desktop) w.SculptDesktop = { available: true, addListener: (name, fn) => { listeners.set(name, fn); return { remove() {} }; } };
  if (!realVst) w.SculptVst = { getRack: id => racks.get(id), openSlot: (id, index) => vstOpened.push({ id, index }), openRack: id => vstOpened.push({ id, rack: true }) };
  const files = ['plugin-data.js', 'model.js', 'history.js', 'app.js', 'desk.js', 'shell.js', 'systems.js', 'plugin-panels.js',
    ...['layouts', 'dynamics', 'eq', 'fx', 'channel', 'native', 'dynamics-extra', 'filters'].map(part => `plugin-original-${part}.js`),
    'plugins.js', 'editor.js', 'wing-map.js', 'dca-bank.js', 'row-layout.js', 'strip-pins.js',
    ...(realVst ? ['vst-rack-model.js', 'vst-rack.js'] : []), 'extended.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  w.SculptFX.open = ctx => fxOpened.push(plain(ctx));
  const C = w.SculptController, E = w.SculptEditor, V = w.SculptMixerView, P = w.SculptStripPins, D = w.SculptDesk;
  t.after(() => { E.close(); w.close(); });
  const strip = id => w.document.querySelector(`.strip[data-id="${id}"]`);
  const slot = (id, block) => strip(id).querySelector(`.extended-slot[data-slot="${block}"]`);
  const editor = () => w.document.querySelector('.editor-dialog');
  const selectedTab = () => editor()?.querySelector('[role=tab][aria-selected=true]')?.dataset.tab;
  const key = (options = {}, target = w.document.body) => {
    const event = new w.KeyboardEvent('keydown', { key: '=', code: 'Equal', metaKey: true, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event); return event;
  };
  return { w, C, E, V, P, D, strip, slot, editor, selectedTab, key, listeners, racks, vstOpened, fxOpened };
}

test('Compact and Extended reuse every strip, fader, pin and SOF state without changing the audio model', t => {
  const f = fixture(t), root = f.w.document.querySelector('.console');
  f.P.pin('ch-1', 'left'); f.P.pin('aux-2', 'right'); f.P.pin('bus-3', 'left'); f.P.pin('dca-2', 'right');
  f.C.setSof('bus-3'); f.C.selectStrip('ch-4');
  const before = plain(f.C.capture()), preferences = plain(f.P.preferences());
  const nodes = new Map([...root.querySelectorAll('.strip')].map(node => [node.dataset.id, { node, fader: node.querySelector('.fader'), cap: node.querySelector('.fader-cap'), parent: node.parentElement }]));
  const rowRatio = root.style.getPropertyValue('--sculpt-upper-row');
  assert.equal(f.V.mode(), 'compact'); assert.equal(f.V.setMode('extended'), true);
  assert.equal(f.V.mode(), 'extended'); assert.equal(root.querySelector('.mixer-row.outputs').classList.contains('extended-row-hidden'), true);
  assert.equal(f.w.document.querySelectorAll('.strip[data-id]').length, 92);
  for (const [id, item] of nodes) {
    assert.equal(f.strip(id), item.node, id); assert.equal(f.strip(id).querySelector('.fader'), item.fader, id);
    assert.equal(f.strip(id).querySelector('.fader-cap'), item.cap, id); assert.equal(f.strip(id).parentElement, item.parent, id);
  }
  f.V.setBank('outputs'); f.V.toggle();
  assert.equal(root.querySelectorAll('.extended-row-hidden').length, 0);
  assert.equal(root.style.getPropertyValue('--sculpt-upper-row'), rowRatio);
  assert.deepEqual(plain(f.C.capture()), before); assert.deepEqual(plain(f.P.preferences()), preferences);
  assert.equal(f.C.getState().selected, 'ch-4'); assert.equal(f.C.getSof(), 'bus-3');
  const original = f.strip('ch-1').querySelector('.fader'), level = f.C.getStrip('ch-1').level, send = f.C.getSend('ch-1', 'bus-3').level;
  original.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  assert.equal(f.C.getStrip('ch-1').level, level); assert(f.C.getSend('ch-1', 'bus-3').level > send, 'the same pinned fader still controls the active SOF send');
});

test('each view restores independent horizontal scroll offsets, including both pin rails', t => {
  const f = fixture(t); f.P.pin('ch-1', 'left'); f.P.pin('aux-1', 'right');
  const center = f.w.document.getElementById('inputs-scroll'), output = f.w.document.getElementById('outputs-scroll');
  const left = f.w.document.getElementById('inputs-pinned-left'), right = f.w.document.getElementById('inputs-pinned-right');
  center.scrollLeft = 403; output.scrollLeft = 711; left.scrollLeft = 19; right.scrollLeft = 23;
  f.V.toggle(); assert.equal(center.scrollLeft, 403);
  center.scrollLeft = 610; left.scrollLeft = 37; right.scrollLeft = 41;
  f.V.setBank('outputs'); output.scrollLeft = 912;
  f.V.toggle(); assert.equal(center.scrollLeft, 403); assert.equal(output.scrollLeft, 711); assert.equal(left.scrollLeft, 19); assert.equal(right.scrollLeft, 23);
  f.V.toggle(); assert.equal(output.scrollLeft, 912);
  f.V.setBank('inputs'); assert.equal(center.scrollLeft, 610); assert.equal(left.scrollLeft, 37); assert.equal(right.scrollLeft, 41);
});

test('Cmd+= and Ctrl+= toggle once, suppress browser zoom and leave ordinary input keys alone', t => {
  const f = fixture(t), field = f.w.document.createElement('input'); f.w.document.body.append(field); field.value = 'Voce = lead'; field.focus();
  assert.equal(f.key({}, field).defaultPrevented, true); assert.equal(f.V.mode(), 'extended'); assert.equal(field.value, 'Voce = lead');
  assert.equal(f.w.document.activeElement, field);
  f.key({ repeat: true }); assert.equal(f.V.mode(), 'extended');
  f.key({ altKey: true }); assert.equal(f.V.mode(), 'extended');
  f.key({ key: '+', shiftKey: true }); assert.equal(f.V.mode(), 'extended');
  assert.equal(f.key({ metaKey: false }, field).defaultPrevented, false); assert.equal(f.V.mode(), 'extended');
  assert.equal(f.key({ metaKey: false, ctrlKey: true }).defaultPrevented, true); assert.equal(f.V.mode(), 'compact');
  f.w.document.querySelector('.mixer-view-switch button:last-child').click(); assert.equal(f.V.mode(), 'extended');
});

test('Electron accelerator owns Cmd+= while its mixerView event performs a single toggle', t => {
  const f = fixture(t, { desktop: true });
  assert.equal(typeof f.listeners.get('mixerView'), 'function');
  f.key(); assert.equal(f.V.mode(), 'compact', 'the renderer does not toggle a native accelerator twice');
  f.listeners.get('mixerView')('toggle'); assert.equal(f.V.mode(), 'extended');
  f.listeners.get('mixerView')('unknown'); assert.equal(f.V.mode(), 'extended');
  f.listeners.get('mixerView')('toggle'); assert.equal(f.V.mode(), 'compact');
});

test('WING slots open the real EQ, gate, dynamics, filter and insert modules', t => {
  const f = fixture(t); f.V.setMode('extended');
  f.slot('ch-2', 'eq').click(); assert.equal(f.selectedTab(), 'eq'); assert.equal(f.editor().querySelector('.editor-plugin-host').dataset.processorBlock, 'eq');
  f.slot('ch-2', 'gate').click(); assert.equal(f.selectedTab(), 'dynamics'); assert.equal(f.editor().querySelector('.editor-plugin-host').dataset.processorBlock, 'gate');
  f.slot('ch-2', 'dyn').click(); assert.equal(f.editor().querySelector('.editor-plugin-host').dataset.processorBlock, 'dyn');
  f.slot('ch-2', 'filter').click(); assert.equal(f.selectedTab(), 'processing'); assert(f.editor().querySelector('#editor-filter-section'));
  f.slot('ch-2', 'pre').click(); assert.equal(f.selectedTab(), 'processing'); assert(f.editor().querySelector('#editor-insert-section'));
  f.D.assignFx(1, 'ch-2', 'pre'); f.slot('ch-2', 'pre').click(); assert.deepEqual(f.fxOpened, [{ type: 'fx', slot: 1 }]);
  assert.equal(f.slot('bus-1', 'gate').disabled, true); assert.equal(f.slot('aux-1', 'filter').disabled, true); assert.equal(f.slot('aux-1', 'post').disabled, true);
  f.slot('bus-1', 'dyn').click(); assert.equal(f.V.bank(), 'outputs'); assert.equal(f.editor().dataset.dockRow, 'extended');
});

test('open editors redock above the faders and back without replacing controls, tab, text or focus', async t => {
  const f = fixture(t); f.E.openSection('ch-1', 'channel');
  const editor = f.editor(), panel = editor.querySelector('.editor-panel'), field = editor.querySelector('input[aria-label="Nome"]');
  field.focus(); field.value = 'Voce da finire'; field.setSelectionRange(3, 8); panel.scrollLeft = 83;
  f.key({}, field);
  assert.equal(f.editor(), editor); assert.equal(f.editor().dataset.dockRow, 'extended'); assert.equal(f.editor().parentElement, f.V.editorHost());
  assert.equal(f.editor().querySelector('.editor-panel'), panel); assert.equal(panel.scrollLeft, 83); assert.equal(f.selectedTab(), 'channel');
  assert.equal(f.w.document.activeElement, field); assert.equal(field.value, 'Voce da finire'); assert.equal(field.selectionStart, 3); assert.equal(field.selectionEnd, 8);
  assert.equal(f.w.document.querySelector('.inputs .strip-pin-body').inert, undefined, 'source faders remain available');
  f.key({}, field); await tick();
  assert.equal(f.editor(), editor); assert.equal(f.editor().dataset.dockRow, 'outputs'); assert.equal(f.editor().querySelector('.editor-panel'), panel);
  assert.equal(f.w.document.activeElement, field); assert.equal(field.value, 'Voce da finire');
  assert(f.w.document.querySelector('.mixer-view-controls').closest('.mixer-row').classList.contains('inputs'), 'selector stays in the uncovered Compact header');
  f.E.close(); await tick(); assert(f.w.document.querySelector('.mixer-view-controls').closest('.mixer-row').classList.contains('outputs'));
});

test('processor labels follow model and bypass changes without rack or fader reconstruction', t => {
  const f = fixture(t); f.V.setMode('extended');
  const eq = f.slot('ch-1', 'eq'), rack = f.strip('ch-1').querySelector('.extended-rack'), fader = f.strip('ch-1').querySelector('.fader');
  f.D.enableProcessor({ type: 'strip', id: 'ch-1', block: 'eq' }, false); assert.equal(eq.dataset.state, 'bypass');
  const models = f.w.SculptCatalog.list({ type: 'strip', id: 'ch-1', block: 'eq' }), next = models.find(model => model.id !== f.D.processor({ type: 'strip', id: 'ch-1', block: 'eq' }).model);
  f.D.setModel({ type: 'strip', id: 'ch-1', block: 'eq' }, next.id);
  assert.equal(eq.querySelector('.extended-slot-name').textContent, next.name); assert.equal(eq.dataset.state, 'active');
  const observer = new f.w.MutationObserver(() => {}); observer.observe(rack, { childList: true, subtree: true, attributes: true, characterData: true });
  for (let i = 0; i < 10; i++) f.C.updateStrip('ch-1', { level: -20 + i });
  assert.equal(observer.takeRecords().length, 0, 'fader updates do not repaint the unchanged processor rack');
  assert.equal(f.slot('ch-1', 'eq'), eq); assert.equal(f.strip('ch-1').querySelector('.extended-rack'), rack); assert.equal(f.strip('ch-1').querySelector('.fader'), fader);
  observer.disconnect();
});

test('live slots show unknown state until the relevant model, enable and insert paths were read', t => {
  const f = fixture(t), received = new Set();
  f.w.SculptLive = { isLive: () => true, isConnected: () => true, hasValue: path => received.has(path) };
  f.V.setMode('extended');
  for (const block of ['filter', 'gate', 'eq', 'dyn', 'pre', 'post']) {
    assert.equal(f.slot('ch-1', block).dataset.state, 'unknown', block);
    assert.equal(f.slot('ch-1', block).querySelector('.extended-slot-name').textContent, '—', block);
  }
  received.add('/ch/1/eq/mdl'); f.w.dispatchEvent(new f.w.CustomEvent('sculpt-live-state'));
  assert.notEqual(f.slot('ch-1', 'eq').querySelector('.extended-slot-name').textContent, '—'); assert.equal(f.slot('ch-1', 'eq').dataset.state, 'unknown');
  received.add('/ch/1/eq/on'); received.add('/ch/1/preins/ins'); f.w.dispatchEvent(new f.w.CustomEvent('sculpt-live-state'));
  assert.equal(f.slot('ch-1', 'eq').dataset.state, 'active'); assert.equal(f.slot('ch-1', 'pre').dataset.state, 'empty');
  received.clear(); f.w.dispatchEvent(new f.w.CustomEvent('sculpt-live-state')); assert.equal(f.slot('ch-1', 'eq').dataset.state, 'unknown');
});

test('VST3 slots reflect host state, invoke exact slot/rack IDs and never fabricate loaded plugins', t => {
  const f = fixture(t); f.V.setMode('extended');
  for (let i = 0; i < 4; i++) assert.equal(f.slot('ch-3', `vst-${i}`).dataset.state, 'empty');
  f.slot('ch-3', 'vst-2').click(); assert.deepEqual(f.vstOpened, [{ id: 'ch-3', index: 2 }]);
  const slots = [{ name: '<img src=x> EQ', bypass: false }, { name: 'Compressor', bypass: true }, { name: 'Delay', missing: true }, null, { name: 'Limiter' }];
  f.racks.set('ch-3', { slots, enabled: true, inputChannels: [1, 2], outputChannels: [1, 2] });
  f.w.dispatchEvent(new f.w.CustomEvent('sculpt-vst-state'));
  assert.equal(f.slot('ch-3', 'vst-0').querySelector('.extended-slot-name').textContent, '<img src=x> EQ'); assert.equal(f.strip('ch-3').querySelector('.extended-rack img'), null);
  assert.equal(f.slot('ch-3', 'vst-0').dataset.state, 'active'); assert.equal(f.slot('ch-3', 'vst-1').dataset.state, 'bypass'); assert.equal(f.slot('ch-3', 'vst-2').dataset.state, 'missing');
  const rackButton = f.strip('ch-3').querySelector('.extended-rack-button'); assert.equal(rackButton.textContent, 'Rack 5'); rackButton.click();
  assert.deepEqual(f.vstOpened[1], { id: 'ch-3', rack: true });
  assert.equal(f.strip('dca-1').querySelectorAll('.extended-slot').length, 0, 'DCA has neither invented WING processing nor an audio VST3 insert');
  f.strip('dca-1').querySelector('.extended-group-button').click(); assert(f.w.document.querySelector('.dca-member'));
});

test('a DCA navigation command reveals the actual output row in Extended', t => {
  const f = fixture(t); f.V.setMode('extended'); assert.equal(f.V.bank(), 'inputs');
  f.w.SculptDcaBank.open(); assert.equal(f.V.bank(), 'outputs');
  assert.equal(f.strip('dca-1').closest('.mixer-row').classList.contains('extended-row-hidden'), false);
});

test('custom rows retain their real order, pinned membership and selection across view changes', t => {
  const f = fixture(t); f.P.pin('ch-2', 'left');
  f.C.showLayer({ top: ['ch-2', 'bus-4', 'ch-9'], bottom: ['bus-1', 'ch-5', 'aux-2'] }, 'Live');
  f.C.selectStrip('bus-1'); const before = plain(f.C.capture()), order = row => [...f.w.document.querySelectorAll(`.mixer-row.${row} .strip:not([hidden])`)].map(node => node.dataset.id);
  const top = order('outputs'), bottom = order('inputs');
  f.V.toggle(); assert.equal(f.V.bank(), 'inputs'); assert.equal(f.w.document.querySelector('.mixer-bank-switch button').textContent, 'Riga 2');
  f.slot('ch-2', 'eq').click(); assert.equal(f.V.bank(), 'outputs'); assert.equal(f.editor().dataset.sourceRow, 'outputs');
  f.E.close(); f.C.selectStrip('bus-1'); f.V.toggle();
  assert.deepEqual(order('outputs'), top); assert.deepEqual(order('inputs'), bottom); assert.equal(f.P.sideOf('ch-2'), 'left');
  assert.deepEqual(plain(f.C.capture()), before);
});

test('view preference restores safely and remains independent of channel persistence', t => {
  const f = fixture(t, { saved: { version: 1, mode: 'extended', bank: 'outputs' } });
  assert.equal(f.V.mode(), 'extended'); assert.equal(f.V.bank(), 'outputs'); assert.equal(f.C.getState().selected, 'ch-1');
  const before = plain(f.C.capture()); f.V.setBank('inputs'); f.V.toggle();
  assert.deepEqual(plain(f.C.capture()), before);
  assert.deepEqual(JSON.parse(f.w.localStorage.getItem('sculpt-wing-mixer-view-v1')), { version: 1, mode: 'compact', bank: 'inputs' });
  assert.equal(f.V.setMode('zoom'), false); assert.equal(f.V.setBank('third'), false);
});

test('the real browser VST3 panel reports app Mac availability and never simulates devices or audio', async t => {
  const f = fixture(t, { realVst: true }); f.V.setMode('extended');
  const before = plain(f.C.capture()); f.slot('ch-1', 'vst-0').click(); await tick();
  const dialog = f.w.document.getElementById('vst-rack-dialog'); assert.equal(dialog.open, true);
  assert.match(dialog.querySelector('.vst-statusbar').textContent, /VST3 · app Mac/);
  assert.equal(f.w.SculptVst.available(), false); assert.equal(f.w.SculptVst.snapshot().running, false); assert.equal(f.w.SculptVst.snapshot().connected, false);
  assert.equal(f.w.SculptVst.getRack('ch-1'), null);
  await f.w.SculptVst.openAudio();
  assert.match(dialog.querySelector('.vst-body').textContent, /Apri Sculpt Wing sul Mac/);
  assert.equal(dialog.querySelector('[aria-label="Ingresso audio dal mixer"]'), null);
  assert.deepEqual(plain(f.C.capture()), before);
});

test('saved VST3 labels stay distinct from a connected and running native host', t => {
  const f = fixture(t), engine = { connected: false, running: false };
  f.w.SculptVst.snapshot = () => engine;
  f.racks.set('ch-1', { enabled: true, slots: [{ name: 'EQ salvato', bypass: false }] });
  f.V.setMode('extended'); assert.equal(f.slot('ch-1', 'vst-0').dataset.state, 'unknown');
  engine.connected = true; f.w.dispatchEvent(new f.w.CustomEvent('sculpt-vst-state')); assert.equal(f.slot('ch-1', 'vst-0').dataset.state, 'ready');
  engine.running = true; f.w.dispatchEvent(new f.w.CustomEvent('sculpt-vst-state')); assert.equal(f.slot('ch-1', 'vst-0').dataset.state, 'active');
});
