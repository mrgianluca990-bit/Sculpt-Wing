'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const base = path.join(__dirname, '../dist');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), { url: 'https://sculpt.test', runScripts: 'outside-only' });
  const w = dom.window, captures = new Map(), events = [];
  let panelRenders = 0;
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
  const replaceChildren = w.Element.prototype.replaceChildren;
  w.Element.prototype.replaceChildren = function (...nodes) {
    if (this.classList.contains('editor-panel')) panelRenders++;
    return replaceChildren.apply(this, nodes);
  };
  const files = ['plugin-data.js', 'model.js', 'history.js', 'app.js', 'desk.js', 'shell.js', 'plugin-panels.js',
    ...['layouts', 'dynamics', 'eq', 'fx', 'channel', 'native', 'dynamics-extra', 'filters'].map(part => `plugin-original-${part}.js`), 'plugins.js', 'editor.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  const E = w.SculptEditor, C = w.SculptController, D = w.SculptDesk;
  const renderProcessor = w.SculptFX.renderProcessor;
  w.SculptFX.renderProcessor = (host, ctx, options) => {
    events.push({ type: 'processor', id: ctx.id, block: ctx.block });
    const cleanup = renderProcessor(host, ctx, options);
    return () => { events.push({ type: 'cleanup', id: ctx.id, block: ctx.block }); cleanup?.(); };
  };
  C.subscribe(event => { if (event.type === 'selection') events.push({ type: 'selection', id: event.id }); });
  t.after(() => { E.close(); dom.window.close(); });
  const editor = () => w.document.querySelector('.editor-dialog');
  const panel = () => editor()?.querySelector('.editor-panel');
  const named = name => [...editor().querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === name);
  const selectedTab = () => editor().querySelector('[role="tab"][aria-selected="true"]').dataset.tab;
  const selectedGroup = () => editor().querySelector('.editor-send-groups [aria-pressed="true"]')?.textContent;
  const clickStrip = id => w.document.querySelector(`.strip[data-id="${id}"] .strip-label`).click();
  const change = (input, value) => { input.value = String(value); input.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const pointer = (node, type, y, id = 1) => {
    if (type !== 'pointerdown' && captures.has(id)) node = captures.get(id);
    const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 100, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: 'mouse' } });
    node.dispatchEvent(event);
  };
  return { w, E, C, D, events, captures, editor, panel, named, selectedTab, selectedGroup, clickStrip, change, pointer,
    renders: () => panelRenders, resetCounts: () => { panelRenders = 0; events.length = 0; } };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function liveFixture(t) {
  const f = fixture(t), requests = [], listeners = new Set();
  let session = 1;
  f.w.SculptLive = {
    isLive: () => true, isConnected: () => true, isWritable: () => false, applying: () => false,
    snapshot: () => ({ mode: 'live', writable: false, pending: 0 }), sessionToken: () => session,
    canPersist: () => false, reviewMutation: () => false, hasStripValue: () => true,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    loadScope(scope, args) { requests.push({ type: scope, ...args, session }); return Promise.resolve(); },
    ensureProcessor(ctx) { const wait = deferred(); requests.push({ ...ctx, type: 'processor', session, ...wait }); return wait.promise; }
  };
  // Exercise the editor's hydration/lifecycle boundary independently of plugin
  // firmware metadata and transport. Offline tests above use the real plugins.
  f.w.SculptFX.renderProcessor = (host, ctx) => {
    f.events.push({ type: 'processor', id: ctx.id, block: ctx.block });
    const label = f.w.document.createElement('span'); label.dataset.testContext = `${ctx.id}/${ctx.block}`; host.append(label);
    return () => f.events.push({ type: 'cleanup', id: ctx.id, block: ctx.block });
  };
  return { ...f, requests, nextSession() { session++; for (const fn of [...listeners]) fn(); },
    pending(id, block, epoch = session) { return requests.find(request => request.type === 'processor' && request.id === id && request.block === block && request.session === epoch); } };
}

test('strip navigation keeps all six editor modules and builds only one final panel per channel', t => {
  const f = fixture(t);
  for (const tab of ['channel', 'processing', 'eq', 'dynamics', 'sends', 'groups']) {
    assert.equal(f.E.openSection('ch-1', tab), true);
    f.panel().scrollLeft = 137; f.panel().scrollTop = 41;
    f.resetCounts(); f.clickStrip('ch-2');
    assert.equal(f.editor().dataset.channelId, 'ch-2', tab);
    assert.equal(f.selectedTab(), tab, 'strip selection preserves the current module');
    assert.equal(f.renders(), 1, `${tab}: no selection-triggered intermediate render`);
    assert.equal(f.panel().scrollLeft, 137); assert.equal(f.panel().scrollTop, 41);
    assert.equal(f.editor().dataset.dockRow, 'outputs', 'input editor remains opposite the source row');
    const built = f.events.filter(event => event.type === 'processor');
    assert.equal(built.length, ['processing', 'eq', 'dynamics'].includes(tab) ? 1 : 0, tab);
    assert.ok(built.every(event => event.id === 'ch-2'));
    const cleaned = f.events.findIndex(event => event.type === 'cleanup');
    const selected = f.events.findIndex(event => event.type === 'selection');
    if (cleaned >= 0) assert.ok(cleaned < selected, 'old plugin is disposed before selection and its subscribers run');
  }
});

test('Gate and Dynamics follow strip clicks and arrows with a compatible fallback on AUX/output channels', t => {
  const f = fixture(t); f.E.openSection('ch-1', 'dynamics', { block: 'gate' });
  f.clickStrip('ch-2'); assert.equal(f.named('Slot Gate').getAttribute('aria-pressed'), 'true');
  f.named('Canale successivo').click();
  assert.equal(f.editor().dataset.channelId, 'ch-3'); assert.equal(f.named('Slot Gate').getAttribute('aria-pressed'), 'true');
  f.named('Canale precedente').click();
  assert.equal(f.editor().dataset.channelId, 'ch-2'); assert.equal(f.selectedTab(), 'dynamics');
  f.clickStrip('aux-1');
  assert.equal(f.selectedTab(), 'dynamics'); assert.equal(f.named('Slot Gate'), undefined);
  assert.equal(f.editor().querySelector('.editor-plugin-host').dataset.processorBlock, 'dyn');
  f.E.open('bus-1'); assert.equal(f.selectedTab(), 'dynamics');
  assert.equal(f.editor().dataset.dockRow, 'inputs');
  assert.equal(f.editor().querySelector('.editor-plugin-host').dataset.processorBlock, 'dyn');
});

test('send family and direction survive compatible navigation and normalize before an incompatible family', t => {
  const f = fixture(t); f.E.openSection('ch-1', 'sends');
  for (const [group, target] of [['MTX', 'ch-2'], ['MAIN', 'ch-3'], ['BUS', 'ch-4']]) {
    f.named(`Mandate verso ${group}`).click(); f.clickStrip(target);
    assert.equal(f.selectedTab(), 'sends'); assert.equal(f.selectedGroup(), group);
    assert.equal(f.editor().querySelector('.editor-send-groups').getAttribute('aria-label'), 'Destinazioni delle mandate');
  }
  f.E.open('bus-1');
  [...f.editor().querySelectorAll('.editor-subtabs button')].find(node => node.textContent === 'Riceve da').click();
  f.named('Riceve da CH').click();
  for (const id of ['bus-2', 'main-1', 'mtx-1']) {
    f.clickStrip(id);
    assert.equal(f.selectedGroup(), 'CH');
    assert.equal(f.editor().querySelector('.editor-send-groups').getAttribute('aria-label'), 'Sorgenti delle mandate');
  }
  f.E.open('ch-5');
  assert.equal(f.selectedTab(), 'sends'); assert.equal(f.selectedGroup(), 'BUS');
  assert.equal(f.editor().querySelector('.editor-send-groups').getAttribute('aria-label'), 'Destinazioni delle mandate');
  f.named('Mandate verso MAIN').click(); f.E.open('main-2');
  assert.equal(f.selectedGroup(), 'MTX', 'MAIN can send only to matrices');
});

test('arrows follow the actual Custom Layer row and keep the editor in the opposite row', t => {
  const f = fixture(t);
  f.C.showLayer({ top: ['ch-7', 'bus-3', 'ch-9'], bottom: ['ch-1', 'bus-1'] }, 'Prova');
  f.E.openSection('ch-7', 'eq');
  assert.equal(f.editor().dataset.sourceRow, 'outputs'); assert.equal(f.editor().dataset.dockRow, 'inputs');
  f.named('Canale successivo').click();
  assert.equal(f.editor().dataset.channelId, 'bus-3'); assert.equal(f.selectedTab(), 'eq');
  assert.equal(f.editor().dataset.sourceRow, 'outputs'); assert.equal(f.editor().dataset.dockRow, 'inputs');
  f.named('Canale successivo').click(); assert.equal(f.editor().dataset.channelId, 'ch-9');
  f.named('Canale precedente').click(); assert.equal(f.editor().dataset.channelId, 'bus-3');
});

test('ordinary parameter updates leave docking untouched, but moving the selected strip between rows redocks it', t => {
  const f = fixture(t); f.E.openSection('ch-1', 'eq'); f.resetCounts();
  const observer = new f.w.MutationObserver(() => {});
  observer.observe(f.editor(), { attributes: true, attributeFilter: ['data-source-row', 'data-dock-row', 'data-channel-id'] });
  const querySelector = f.w.document.querySelector.bind(f.w.document);
  let hostQueries = 0;
  f.w.document.querySelector = selector => { if (/^\.mixer-row\.(inputs|outputs)$/.test(selector)) hostQueries++; return querySelector(selector); };
  for (let i = 0; i < 12; i++) f.C.updateStrip('ch-1', { level: -24 + i / 10 });
  assert.equal(f.renders(), 0, 'updating the fader does not rebuild the open EQ');
  assert.equal(observer.takeRecords().length, 0, 'stable docking does not rewrite row attributes');
  assert.equal(hostQueries, 0, 'stable row containers are not queried again for every value notification');
  f.C.showLayer({ top: ['ch-1', 'bus-1'], bottom: ['ch-2'] }, 'Righe');
  assert.equal(f.editor().dataset.sourceRow, 'outputs'); assert.equal(f.editor().dataset.dockRow, 'inputs');
  assert.ok(f.editor().parentElement.classList.contains('inputs'));
  f.C.showLayer(null);
  assert.equal(f.editor().dataset.sourceRow, 'inputs'); assert.equal(f.editor().dataset.dockRow, 'outputs');
  assert.ok(f.editor().parentElement.classList.contains('outputs'));
  observer.disconnect();
});

test('explicit macro sections render their requested module once, including Gate and default Dynamics', t => {
  const f = fixture(t);
  assert.equal(f.E.openSection('ch-2', 'eq'), true);
  assert.equal(f.selectedTab(), 'eq'); assert.equal(f.renders(), 1);
  assert.deepEqual(f.events.filter(event => event.type === 'processor'), [{ type: 'processor', id: 'ch-2', block: 'eq' }]);
  f.resetCounts();
  assert.equal(f.E.openSection('ch-3', 'dynamics', { block: 'gate' }), true);
  assert.equal(f.renders(), 1);
  assert.deepEqual(f.events.filter(event => event.type === 'processor'), [{ type: 'processor', id: 'ch-3', block: 'gate' }]);
  f.resetCounts(); f.E.openSection('ch-3', 'dynamics');
  assert.equal(f.renders(), 1); assert.equal(f.named('Slot Dynamics').getAttribute('aria-pressed'), 'true');
  f.resetCounts(); f.E.openSection('ch-3', 'dynamics');
  assert.equal(f.renders(), 0, 'reopening the already selected section keeps its controls and subscriptions');
  assert.equal(f.E.openSection('bus-1', 'dynamics', { block: 'gate' }), false);
  assert.equal(f.E.openSection('ch-4', 'missing'), false);
  assert.equal(f.editor().dataset.channelId, 'ch-3'); assert.equal(f.renders(), 0);
});

test('blur commits to the old channel/send and detached fields cannot write to the next channel', t => {
  const f = fixture(t); f.E.openSection('ch-1', 'channel');
  const trim = f.named('Trim in dB'); trim.focus(); trim.value = '6.2';
  f.clickStrip('ch-2');
  assert.equal(f.C.getStrip('ch-1').trim, 6.2); assert.equal(f.C.getStrip('ch-2').trim, 0);
  f.change(trim, 17); trim.dispatchEvent(new f.w.Event('blur'));
  assert.equal(f.C.getStrip('ch-1').trim, 6.2); assert.equal(f.C.getStrip('ch-2').trim, 0);
  const name = f.named('Nome'), nextName = f.C.getStrip('ch-3').name;
  name.focus(); name.value = 'Voce prova'; f.E.openSection('ch-3', 'eq');
  assert.equal(f.C.getStrip('ch-2').name, 'Voce prova'); assert.equal(f.C.getStrip('ch-3').name, nextName);
  f.change(name, 'Nome tardivo'); assert.equal(f.C.getStrip('ch-3').name, nextName);
  f.E.openSection('ch-1', 'sends');
  const send = f.named('Livello → BUS 01 in dB'), nextSend = f.C.getSend('ch-2', 'bus-1').level;
  send.focus(); send.value = '-13.2'; f.clickStrip('ch-2');
  assert.equal(f.C.getSend('ch-1', 'bus-1').level, -13.2); assert.equal(f.C.getSend('ch-2', 'bus-1').level, nextSend);
  f.change(send, -3); assert.equal(f.C.getSend('ch-1', 'bus-1').level, -13.2);
  assert.equal(f.C.getSend('ch-2', 'bus-1').level, nextSend);
});

test('channel navigation releases a captured gesture and rejects later events from the previous rotary', t => {
  const f = fixture(t); f.E.openSection('ch-1', 'channel');
  const knob = f.named('Pan — manopola');
  f.pointer(knob, 'pointerdown', 200); f.pointer(f.w, 'pointermove', 182);
  const oldValue = f.C.getStrip('ch-1').pan;
  assert.notEqual(oldValue, 0); assert.equal(f.captures.size, 1);
  f.clickStrip('ch-2'); assert.equal(f.captures.size, 0);
  f.pointer(knob, 'pointermove', 100);
  knob.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(f.C.getStrip('ch-1').pan, oldValue); assert.equal(f.C.getStrip('ch-2').pan, 0);
  assert.equal(f.C.historyState().undoCount, 1, 'the old gesture remains one operation');
});

test('a late successful live read cannot render the old channel over the new editor', async t => {
  const f = liveFixture(t); f.E.openSection('ch-1', 'eq'); await tick();
  assert.ok(f.pending('ch-1', 'eq')); assert.equal(f.editor().querySelector('.editor-live-read').dataset.state, 'loading');
  f.clickStrip('ch-2'); await tick();
  assert.ok(f.pending('ch-2', 'eq')); assert.equal(f.selectedTab(), 'eq');
  f.pending('ch-1', 'eq').resolve(); await tick();
  assert.equal(f.editor().dataset.channelId, 'ch-2'); assert.equal(f.editor().querySelector('.editor-live-read').dataset.state, 'loading');
  assert.equal(f.events.filter(event => event.type === 'processor').length, 0);
  f.pending('ch-2', 'eq').resolve(); await tick();
  assert.equal(f.editor().querySelector('[data-test-context]').dataset.testContext, 'ch-2/eq');
  assert.deepEqual(f.events.filter(event => event.type === 'processor'), [{ type: 'processor', id: 'ch-2', block: 'eq' }]);
});

test('live Gate fallback reads Dynamics on the output, and an obsolete failure stays invisible', async t => {
  const f = liveFixture(t); f.E.openSection('ch-1', 'dynamics', { block: 'gate' }); await tick();
  f.E.open('bus-1'); await tick();
  assert.ok(f.pending('bus-1', 'dyn')); assert.equal(f.pending('bus-1', 'gate'), undefined);
  f.pending('bus-1', 'dyn').resolve(); await tick();
  f.pending('ch-1', 'gate').reject(new Error('lettura obsoleta')); await tick();
  assert.equal(f.editor().dataset.channelId, 'bus-1'); assert.equal(f.selectedTab(), 'dynamics');
  assert.equal(f.editor().querySelector('[data-test-context]').dataset.testContext, 'bus-1/dyn');
  assert.equal(f.editor().querySelector('.editor-live-read'), null);
  assert.doesNotMatch(f.editor().textContent, /lettura obsoleta/);
});

test('same-mode live session changes and closing invalidate pending reads before they can expose controls', async t => {
  const f = liveFixture(t); f.E.openSection('ch-1', 'eq'); await tick();
  const first = f.pending('ch-1', 'eq', 1); f.nextSession(); await tick();
  const second = f.pending('ch-1', 'eq', 2); assert.ok(second);
  first.resolve(); await tick(); assert.equal(f.events.filter(event => event.type === 'processor').length, 0);
  second.resolve(); await tick();
  assert.equal(f.editor().querySelector('[data-test-context]').dataset.testContext, 'ch-1/eq');
  f.clickStrip('ch-2'); await tick(); f.E.close();
  f.pending('ch-2', 'eq').resolve(); await tick();
  assert.equal(f.E.isOpen(), false);
  assert.equal(f.events.filter(event => event.type === 'processor').length, 1);
});
