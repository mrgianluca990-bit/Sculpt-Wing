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
  if (!realVst) w.SculptVst = { getRack: id => racks.get(id), snapshot: () => ({ connected: true, running: true }), routingStatus: () => ({ state: 'applied' }), openSlot: (id, index) => vstOpened.push({ id, index }), openRack: id => vstOpened.push({ id, rack: true }) };
  const files = ['plugin-data.js', 'model.js', 'history.js', 'app.js', 'desk.js', 'channel-chain.js', 'shell.js', 'systems.js', 'plugin-panels.js',
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

test('Compact and Extended reuse every strip, fader and pin while SOF is suspended in Extended', t => {
  const f = fixture(t), root = f.w.document.querySelector('.console');
  f.P.pin('ch-1', 'left'); f.P.pin('aux-2', 'right'); f.P.pin('bus-3', 'left'); f.P.pin('dca-2', 'right');
  f.C.setSof('bus-3'); f.C.selectStrip('ch-4');
  const before = plain(f.C.capture()), preferences = plain(f.P.preferences());
  const nodes = new Map([...root.querySelectorAll('.strip')].map(node => [node.dataset.id, { node, fader: node.querySelector('.fader'), cap: node.querySelector('.fader-cap'), pan: node.querySelector('.strip-pan'), mute: node.querySelector('.mute-button'), parent: node.parentElement }]));
  const rowRatio = root.style.getPropertyValue('--sculpt-upper-row');
  assert.equal(f.V.mode(), 'compact'); assert.equal(f.V.setMode('extended'), true);
  assert.equal(f.C.getSof(), null, 'Extended faders expose channel levels');
  assert.equal(f.w.document.querySelector('.mixer-view-switch'), null);
  assert.equal(f.V.mode(), 'extended'); assert.equal(root.querySelector('.mixer-row.outputs').classList.contains('extended-row-hidden'), true);
  assert.equal(f.w.document.querySelectorAll('.strip[data-id]').length, 92);
  for (const [id, item] of nodes) {
    assert.equal(f.strip(id), item.node, id); assert.equal(f.strip(id).querySelector('.fader'), item.fader, id);
    assert.equal(f.strip(id).querySelector('.fader-cap'), item.cap, id); assert.equal(f.strip(id).parentElement, item.parent, id);
    assert.equal(f.strip(id).querySelector('.strip-pan'), item.pan, id); assert.equal(f.strip(id).querySelector('.mute-button'), item.mute, id);
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
  assert.equal(f.w.document.querySelector('.mixer-view-switch'), null, 'view switches are absent from the mixer headers');
  f.V.setMode('extended'); assert.equal(f.V.mode(), 'extended');
});

test('Electron accelerator owns Cmd+= while its mixerView event performs a single toggle', t => {
  const f = fixture(t, { desktop: true });
  assert.equal(typeof f.listeners.get('mixerView'), 'function');
  f.key(); assert.equal(f.V.mode(), 'compact', 'the renderer does not toggle a native accelerator twice');
  f.listeners.get('mixerView')('toggle'); assert.equal(f.V.mode(), 'extended');
  f.listeners.get('mixerView')('unknown'); assert.equal(f.V.mode(), 'extended');
  f.listeners.get('mixerView')('toggle'); assert.equal(f.V.mode(), 'compact');
});

test('the channel name opens Home and eight WING slots retain their full-control floating windows', t => {
  const f = fixture(t); f.V.setMode('extended');
  const modules = ['input', 'gate', 'eq', 'dyn', 'pre', 'post', 'sends', 'master'];
  assert.equal(f.strip('ch-2').querySelectorAll('.extended-device > .extended-slot').length, 8);
  assert.equal(f.slot('ch-2', 'home'), null);
  assert.deepEqual(modules.map(key => f.slot('ch-2', key).querySelector('.extended-slot-label').textContent), ['Pre', 'Gate', 'EQ', 'Comp', 'Insert 1', 'Insert 2', 'Send', 'Master']);
  for (const key of modules) {
    f.slot('ch-2', key).click(); assert.equal(f.selectedTab(), 'devices');
    const card = f.editor().querySelector(`.editor-device-panel[data-module="${key}"]`);
    assert.ok(card); assert.equal(card.dataset.expanded, 'true'); assert.equal(card.classList.contains('is-selected'), true);
    assert.equal(f.editor().parentElement, f.w.document.body); assert.equal(f.editor().dataset.dockRow, 'window');
    assert(f.editor().classList.contains('editor-slot-window')); assert.equal(f.editor().querySelectorAll('.editor-device-panel').length, 1);
    assert.equal(f.editor().querySelector('.editor-tabs').hidden, true);
    if (key === 'eq') {
      assert.equal(card.querySelectorAll('.fx-wing-band-pane:not([hidden])').length, 6);
      const gain = card.querySelector('[data-parameter="2g"] input[type=number]'); gain.value = '3'; gain.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      assert.equal(f.D.processor({ type: 'strip', id: 'ch-2', block: 'eq' }).params['2g'], 3, 'a nonselected EQ band is visible and writable');
    }
  }
  f.strip('ch-2').querySelector('.strip-name').click();
  assert.equal(f.editor().dataset.slot, 'home', 'the name explicitly opens Home even after another slot');
  assert.equal(f.editor().dataset.dockRow, 'window');
  const name = f.editor().querySelector('input[aria-label="Nome"]');
  name.value = 'Voce'; name.dispatchEvent(new f.w.Event('change', { bubbles: true }));
  assert.equal(f.C.getStrip('ch-2').name, 'Voce');
  name.value = ''; name.dispatchEvent(new f.w.Event('change', { bubbles: true }));
  assert.equal(f.C.getStrip('ch-2').name, 'CH 2', 'clearing the Home name still restores its default');
  assert.equal(f.strip('ch-2').querySelector('.strip-name').textContent, 'CH 2');
  f.D.assignFx(1, 'ch-2', 'pre'); f.slot('ch-2', 'pre').click();
  assert.equal(f.editor().querySelector('.editor-device-panel[data-module="pre"] .fx-processor').dataset.model, f.D.processor({ type: 'fx', slot: 1 }).model);
  assert.deepEqual(f.fxOpened, [], 'the assigned insert uses the selected slot window, without a duplicate modal');
  assert.equal(f.slot('bus-1', 'gate').disabled, true); assert.equal(f.slot('aux-1', 'input').disabled, false); assert.equal(f.slot('aux-1', 'post').disabled, true); assert.equal(f.slot('mtx-1', 'sends').disabled, false, 'a matrix can inspect its received sends');
  f.slot('bus-1', 'dyn').click(); assert.equal(f.V.bank(), 'outputs'); assert.equal(f.editor().dataset.dockRow, 'window');
  assert.equal(f.editor().querySelector('.editor-sof').hidden, true);
});

test('view changes preserve the editing value and focus between the full slot window and compact board', async t => {
  const f = fixture(t); f.E.openSection('ch-1', 'channel');
  const editor = f.editor(), panel = editor.querySelector('.editor-panel'), field = editor.querySelector('input[aria-label="Nome"]');
  field.focus(); field.value = 'Voce da finire'; field.setSelectionRange(3, 8); panel.scrollLeft = 83;
  f.key({}, field);
  assert.equal(f.editor(), editor); assert.equal(f.editor().dataset.dockRow, 'window'); assert.equal(f.editor().parentElement, f.w.document.body);
  assert.equal(f.editor().querySelector('.editor-panel'), panel); assert.equal(panel.scrollLeft, 83); assert.equal(f.selectedTab(), 'devices');
  const windowField = editor.querySelector('input[aria-label="Nome"]');
  assert.equal(f.w.document.activeElement, windowField); assert.equal(windowField.value, 'Voce da finire'); assert.equal(windowField.selectionStart, 3); assert.equal(windowField.selectionEnd, 8);
  assert.equal(editor.querySelectorAll('.editor-device-panel').length, 1);
  assert.equal(f.w.document.querySelector('.inputs .strip-pin-body').inert, undefined, 'source faders remain available');
  f.key({}, windowField); await tick();
  assert.equal(f.editor(), editor); assert.equal(f.editor().dataset.dockRow, 'outputs'); assert.equal(f.editor().querySelector('.editor-panel'), panel);
  const compactField = editor.querySelector('input[aria-label="Nome"]');
  assert.equal(f.w.document.activeElement, compactField); assert.equal(compactField.value, 'Voce da finire');
  assert.equal(editor.querySelectorAll('.editor-device-panel').length, 9);
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
  for (const block of ['gate', 'eq', 'dyn', 'pre', 'post']) {
    assert.equal(f.slot('ch-1', block).dataset.state, 'unknown', block);
    assert.equal(f.slot('ch-1', block).querySelector('.extended-slot-name').textContent, '—', block);
  }
  received.add('/ch/1/eq/mdl'); f.w.dispatchEvent(new f.w.CustomEvent('sculpt-live-state'));
  assert.notEqual(f.slot('ch-1', 'eq').querySelector('.extended-slot-name').textContent, '—'); assert.equal(f.slot('ch-1', 'eq').dataset.state, 'unknown');
  received.add('/ch/1/eq/on'); received.add('/ch/1/preins/ins'); f.w.dispatchEvent(new f.w.CustomEvent('sculpt-live-state'));
  assert.equal(f.slot('ch-1', 'eq').dataset.state, 'active'); assert.equal(f.slot('ch-1', 'pre').dataset.state, 'empty');
  received.clear(); f.w.dispatchEvent(new f.w.CustomEvent('sculpt-live-state')); assert.equal(f.slot('ch-1', 'eq').dataset.state, 'unknown');
});

test('VST3 shows one rack action before association, then real plugins and their exact slot IDs', t => {
  const f = fixture(t); f.V.setMode('extended');
  assert.equal(f.strip('ch-3').querySelectorAll('.extended-vst-slot:not([hidden])').length, 0);
  f.strip('ch-3').querySelector('.extended-rack-button').click(); assert.deepEqual(f.vstOpened, [{ id: 'ch-3', rack: true }]);
  const slots = [{ name: '<img src=x> EQ', bypass: false }, { name: 'Compressor', bypass: true }, { name: 'Delay', missing: true }, null, { name: 'Limiter' }];
  f.racks.set('ch-3', { slots, placement: 'insert1', enabled: true, inputChannels: [1, 2], outputChannels: [1, 2] });
  f.w.dispatchEvent(new f.w.CustomEvent('sculpt-vst-state'));
  assert.equal(f.slot('ch-3', 'vst-0').querySelector('.extended-slot-name').textContent, '<img src=x> EQ'); assert.equal(f.strip('ch-3').querySelector('.extended-rack img'), null);
  assert.equal(f.slot('ch-3', 'vst-0').dataset.state, 'active'); assert.equal(f.slot('ch-3', 'vst-1').dataset.state, 'bypass'); assert.equal(f.slot('ch-3', 'vst-2').dataset.state, 'missing');
  f.slot('ch-3', 'vst-2').click(); assert.deepEqual(f.vstOpened[1], { id: 'ch-3', index: 2 });
  const rackButton = f.strip('ch-3').querySelector('.extended-rack-button'); assert.equal(rackButton.textContent, 'Rack · 4'); rackButton.click();
  assert.deepEqual(f.vstOpened[2], { id: 'ch-3', rack: true });
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
  const before = plain(f.C.capture()); f.strip('ch-1').querySelector('.extended-rack-button').click(); await tick();
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
  f.racks.set('ch-1', { placement: 'pre', enabled: true, slots: [{ name: 'EQ salvato', bypass: false }] });
  f.V.setMode('extended'); assert.equal(f.slot('ch-1', 'vst-0').dataset.state, 'unknown');
  engine.connected = true; f.w.dispatchEvent(new f.w.CustomEvent('sculpt-vst-state')); assert.equal(f.slot('ch-1', 'vst-0').dataset.state, 'ready');
  engine.running = true; f.w.dispatchEvent(new f.w.CustomEvent('sculpt-vst-state')); assert.equal(f.slot('ch-1', 'vst-0').dataset.state, 'active');
});

function device(f, id, key) { return f.strip(id).querySelector(`.extended-device[data-module="${key}"]`); }
function deviceOrder(f, id) { return [...f.strip(id).querySelectorAll('.extended-wing > .extended-device')].map(node => node.dataset.module); }
function dragEvent(f, node, type, y = 0) {
  const event = new f.w.MouseEvent(type, { clientY: y, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { setData() {}, setDragImage() {}, effectAllowed: '', dropEffect: '' } });
  node.dispatchEvent(event); return event;
}
function deviceKey(f, node, key) { return node.dispatchEvent(new f.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); }

test('Extended drag uses the shared real proc order, changes no other field and preserves every slot node', async t => {
  const f = fixture(t); f.D.patchChannel('ch-1', { tap: '4' }); f.V.setMode('extended');
  const before = plain(f.C.capture()), nodes = new Map([...f.strip('ch-1').querySelectorAll('.extended-device')].map(node => [node.dataset.module, node]));
  const source = device(f, 'ch-1', 'gate').querySelector('.extended-device-drag'), target = device(f, 'ch-1', 'dyn');
  target.getBoundingClientRect = () => ({ top: 50, height: 20 });
  assert.equal(dragEvent(f, source, 'dragstart').defaultPrevented, false);
  assert.equal(dragEvent(f, device(f, 'ch-2', 'dyn'), 'dragover', 69).defaultPrevented, false, 'a device cannot be transferred to a different channel');
  dragEvent(f, device(f, 'ch-2', 'dyn'), 'drop', 69); assert.deepEqual(plain(f.C.capture()), before);
  assert.equal(dragEvent(f, target, 'dragover', 69).defaultPrevented, true); assert.equal(target.dataset.drop, 'after');
  assert.deepEqual(plain(f.C.capture()), before, 'a drop marker never previews an audio mutation');
  dragEvent(f, target, 'drop', 69); await tick();
  assert.deepEqual(plain(f.D.channel('ch-1').order), ['eq', 'dyn', 'gate', 'insert']); assert.equal(f.D.channel('ch-1').tap, '4');
  const expected = plain(before); expected.desk.channels['ch-1'].order = ['eq', 'dyn', 'gate', 'insert'];
  assert.deepEqual(plain(f.C.capture()), expected, 'only the requested proc order changes');
  for (const [key, node] of nodes) assert.equal(device(f, 'ch-1', key), node, key);
  assert.deepEqual(deviceOrder(f, 'ch-1'), ['input', 'eq', 'dyn', 'sends', 'gate', 'pre', 'post', 'master']);
  f.V.setMode('compact'); f.E.openDevice('ch-1', 'eq');
  assert.deepEqual([...f.editor().querySelectorAll('.editor-device-board > .editor-device-panel')].map(node => node.dataset.module), ['home', ...deviceOrder(f, 'ch-1')], 'Compact retains Home and both views follow the same confirmed processing order');
});

test('the Send drag palette offers eight actual taps and changes ptap independently from proc', async t => {
  const f = fixture(t); f.V.setMode('extended'); const before = plain(f.C.capture());
  const handle = device(f, 'ch-1', 'sends').querySelector('.extended-device-drag'); handle.click();
  const palette = f.w.document.querySelector('.extended-tap-palette'); assert.equal(palette.hidden, false);
  assert.deepEqual([...palette.querySelectorAll('.extended-tap-choice')].map(node => node.dataset.target), ['tap:IN', 'tap:FILT', 'tap:3', 'tap:4', 'tap:5', 'tap:PFL', 'tap:AFL', 'tap:POST']);
  assert.equal(palette.querySelector('[data-target="tap:PFL"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(plain(f.C.capture()), before);
  const choice = palette.querySelector('[data-target="tap:IN"]'); choice.click(); await tick();
  const expected = plain(before); expected.desk.channels['ch-1'].tap = 'IN';
  assert.deepEqual(plain(f.C.capture()), expected); assert.deepEqual(deviceOrder(f, 'ch-1').slice(0, 2), ['sends', 'input']);
  assert.equal(f.slot('ch-1', 'sends').querySelector('.extended-slot-name').textContent, 'TAP IN');
  assert.equal(palette.hidden, true); assert.equal(f.w.document.activeElement, handle);
  assert.equal(device(f, 'ch-1', 'post').querySelector('.extended-device-drag').disabled, true, 'INS2 is fixed after the fader');
  assert.match(f.slot('ch-1', 'post').getAttribute('aria-label'), /post-fader/);
  assert.equal(device(f, 'bus-1', 'eq').querySelector('.extended-device-drag').disabled, true, 'output processing remains fixed');
  dragEvent(f, handle, 'dragstart'); const post = palette.querySelector('[data-target="tap:POST"]');
  assert.equal(dragEvent(f, post, 'dragover').defaultPrevented, true); assert.equal(post.dataset.drop, 'true');
  dragEvent(f, post, 'drop'); await tick(); expected.desk.channels['ch-1'].tap = 'POST';
  assert.deepEqual(plain(f.C.capture()), expected, 'the same semantic tap also accepts pointer drop');
});

test('keyboard ordering supports preview, Escape and confirmation without requiring a pointer drag', async t => {
  const f = fixture(t); f.V.setMode('extended'); const before = plain(f.C.capture());
  const handle = device(f, 'ch-1', 'gate').querySelector('.extended-device-drag'); handle.focus();
  deviceKey(f, handle, ' '); deviceKey(f, handle, 'End');
  assert.equal(device(f, 'ch-1', 'pre').dataset.drop, 'after'); assert.deepEqual(plain(f.C.capture()), before);
  deviceKey(f, handle, 'Escape'); assert.equal(f.w.document.querySelector('.extended-device[data-drop]'), null); assert.equal(f.w.document.activeElement, handle);
  assert.deepEqual(plain(f.C.capture()), before);
  deviceKey(f, handle, ' '); deviceKey(f, handle, 'End'); deviceKey(f, handle, 'Enter'); await tick();
  const expected = plain(before); expected.desk.channels['ch-1'].order = ['eq', 'dyn', 'insert', 'gate'];
  assert.deepEqual(plain(f.C.capture()), expected); assert.equal(f.w.document.activeElement, handle);
});

test('a control loss, session or schema change, and a view change cancel old Extended drag tokens before any commit', async t => {
  const f = fixture(t); f.V.setMode('extended');
  let epoch = 1, writable = true, commits = 0;
  const proc = ['GEDI', 'EDGI'], path = '/ch/1/proc', tapPath = '/ch/1/ptap', values = new Map([[path, 'GEDI'], [tapPath, 'PFL']]);
  const metadata = new Map([[path, { path, type: 5, revision: 1, readOnly: false, items: proc.map(value => ({ value })) }], [tapPath, { path: tapPath, type: 5, revision: 1, readOnly: false, items: ['IN', 'FILT', '3', '4', '5', 'PFL', 'AFL', 'POST'].map(value => ({ value })) }]]);
  f.w.SculptLive = { isLive: () => true, isConnected: () => true, isWritable: () => writable, sessionToken: () => epoch,
    hasValue: key => values.has(key), value: key => values.get(key), metadata: key => metadata.get(key),
    describeNode: async key => metadata.get(key), readValues: async key => ({ [key]: values.get(key) }) };
  const api = f.w.SculptChannelChain;
  f.w.SculptChannelChain = { ...api, commit: (...args) => { commits++; return api.commit(...args); } };
  f.V.refresh('ch-1'); const before = plain(f.C.capture());
  const source = device(f, 'ch-1', 'gate').querySelector('.extended-device-drag'), target = device(f, 'ch-1', 'dyn');
  target.getBoundingClientRect = () => ({ top: 50, height: 20 });
  for (const change of [() => { writable = false; }, () => { epoch++; }, () => { metadata.get(path).revision++; }, () => f.V.setMode('compact')]) {
    writable = true; f.V.setMode('extended'); f.V.refresh('ch-1');
    assert.equal(source.disabled, false); dragEvent(f, source, 'dragstart'); dragEvent(f, target, 'dragover', 69);
    assert.equal(target.dataset.drop, 'after'); change(); f.w.dispatchEvent(new f.w.CustomEvent('sculpt-live-state'));
    dragEvent(f, target, 'drop', 69); await tick();
    assert.equal(commits, 0); assert.equal(f.w.document.querySelector('.extended-device[data-dragging]'), null);
    assert.deepEqual(plain(f.C.capture()), before);
  }
});

test('a pending shared commit keeps the actual rack order and leaves the native fader usable', async t => {
  const f = fixture(t); f.V.setMode('extended');
  const api = f.w.SculptChannelChain, beforeOrder = deviceOrder(f, 'ch-1');
  let release; const gate = new Promise(resolve => { release = resolve; });
  f.w.SculptChannelChain = { ...api, commit: async (...args) => { await gate; return api.commit(...args); } };
  const source = device(f, 'ch-1', 'gate').querySelector('.extended-device-drag'), target = device(f, 'ch-1', 'dyn');
  target.getBoundingClientRect = () => ({ top: 50, height: 20 });
  dragEvent(f, source, 'dragstart'); dragEvent(f, target, 'drop', 69);
  assert.deepEqual(deviceOrder(f, 'ch-1'), beforeOrder); assert.deepEqual(plain(f.D.channel('ch-1').order), ['gate', 'eq', 'dyn', 'insert']);
  const fader = f.strip('ch-1').querySelector('.fader'), level = f.C.getStrip('ch-1').level;
  deviceKey(f, fader, 'ArrowUp'); assert(f.C.getStrip('ch-1').level > level);
  const changedLevel = f.C.getStrip('ch-1').level; release(); await tick();
  assert.deepEqual(plain(f.D.channel('ch-1').order), ['eq', 'dyn', 'gate', 'insert']);
  assert.equal(f.C.getStrip('ch-1').level, changedLevel); assert.equal(f.strip('ch-1').querySelector('.fader'), fader);
});
