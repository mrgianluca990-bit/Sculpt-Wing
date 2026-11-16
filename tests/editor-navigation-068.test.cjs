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
    ...['layouts', 'dynamics', 'eq', 'fx', 'channel', 'native', 'dynamics-extra', 'filters'].map(part => `plugin-original-${part}.js`), 'plugins.js', 'wing-map.js', 'channel-chain.js', 'editor.js'];
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
  const card = key => editor()?.querySelector(`.editor-device-panel[data-module="${key}"]`);
  const board = () => editor()?.querySelector('.editor-device-board');
  const named = name => [...editor().querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === name);
  const selectedTab = () => editor().querySelector('[role="tab"][aria-selected="true"]').dataset.tab;
  const selectedModule = () => editor().querySelector('.editor-device-panel.is-selected')?.dataset.module;
  const selectedGroup = () => card('sends').querySelector('.editor-send-groups [aria-pressed="true"]')?.textContent;
  const clickStrip = id => w.document.querySelector(`.strip[data-id="${id}"] .strip-label`).click();
  const change = (input, value) => { input.value = String(value); input.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const pointer = (node, type, y, id = 1) => {
    if (type !== 'pointerdown' && captures.has(id)) node = captures.get(id);
    const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 100, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: 'mouse' } });
    node.dispatchEvent(event);
  };
  return { w, E, C, D, events, captures, editor, panel, board, card, named, selectedTab, selectedModule, selectedGroup, clickStrip, change, pointer,
    renders: () => panelRenders, resetCounts: () => { panelRenders = 0; events.length = 0; } };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function liveFixture(t) {
  const f = fixture(t), requests = [], listeners = new Set(), states = new Map();
  let session = 1;
  const key = (ctx, epoch = session) => `${epoch}:${ctx.id}:${ctx.block}`;
  const notify = () => { for (const fn of [...listeners]) fn(); };
  f.w.SculptLive = {
    isLive: () => true, isConnected: () => true, isWritable: () => false, applying: () => false,
    snapshot: () => ({ mode: 'live', writable: false, pending: 0 }), sessionToken: () => session,
    canPersist: () => false, reviewMutation: () => false, hasStripValue: () => true,
    hasValue: () => true, value: () => undefined, metadata: () => undefined,
    processorState: ctx => states.get(key(ctx)) || { ready: false, loading: true },
    parameterDefinition(ctx, name) {
      const parameter = f.w.SculptCatalog.get(ctx, f.D.processor(ctx)?.model)?.parameters.find(item => item.key === name);
      return parameter ? { ...parameter, path: `/test/${key(ctx)}/${name}`, readOnly: true } : null;
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    loadScope(scope, args) { requests.push({ type: scope, ...args, session }); return Promise.resolve(); },
    ensureProcessor(ctx) {
      const existing = requests.find(request => request.type === 'processor' && request.id === ctx.id && request.block === ctx.block && request.session === session);
      if (existing) return existing.promise;
      const wait = deferred(), epoch = session;
      states.set(key(ctx, epoch), { ready: false, loading: true });
      requests.push({ ...ctx, type: 'processor', session: epoch, promise: wait.promise,
        resolve() { states.set(key(ctx, epoch), { ready: true, loading: false }); wait.resolve(); notify(); },
        reject(error) { states.set(key(ctx, epoch), { ready: false, loading: false, error: error.message }); wait.reject(error); notify(); }
      });
      return wait.promise;
    }
  };
  // Each card now owns its read. Keep the real processor renderer to verify
  // disabled pending surfaces and the cleanup of obsolete async continuations.
  return { ...f, requests, nextSession() { session++; for (const fn of [...listeners]) fn(); },
    pending(id, block, epoch = session) { return requests.find(request => request.type === 'processor' && request.id === id && request.block === block && request.session === epoch); } };
}

test('legacy section navigation selects the corresponding Canale card and builds one final board per channel', t => {
  const f = fixture(t);
  for (const [tab, module] of [['channel', 'home'], ['processing', 'input'], ['eq', 'eq'], ['dynamics', 'dyn'], ['sends', 'sends'], ['groups', 'home']]) {
    assert.equal(f.E.openSection('ch-1', tab), true);
    f.panel().scrollLeft = 137; f.panel().scrollTop = 41; f.board().scrollLeft = 173;
    f.resetCounts(); f.clickStrip('ch-2');
    assert.equal(f.editor().dataset.channelId, 'ch-2', tab);
    assert.equal(f.selectedTab(), 'devices'); assert.equal(f.selectedModule(), module, 'strip selection preserves the active card');
    assert.equal(f.card(module).dataset.expanded, 'true');
    assert.equal(f.renders(), 1, `${tab}: no selection-triggered intermediate render`);
    assert.equal(f.panel().scrollLeft, 137); assert.equal(f.panel().scrollTop, 41); assert.equal(f.board().scrollLeft, 173);
    assert.equal(f.editor().dataset.dockRow, 'outputs', 'input editor remains opposite the source row');
    const built = f.events.filter(event => event.type === 'processor');
    assert.equal(new Set(built.map(event => event.block)).size, built.length, 'each expanded processor is mounted only once');
    assert.ok(built.every(event => event.id === 'ch-2'));
    const cleaned = f.events.findIndex(event => event.type === 'cleanup');
    const selected = f.events.findIndex(event => event.type === 'selection');
    if (cleaned >= 0) assert.ok(cleaned < selected, 'old plugin is disposed before selection and its subscribers run');
  }
});

test('Gate and Dynamics follow strip clicks and arrows with a compatible fallback on AUX/output channels', t => {
  const f = fixture(t); f.E.openSection('ch-1', 'dynamics', { block: 'gate' });
  f.clickStrip('ch-2'); assert.equal(f.selectedModule(), 'gate'); assert.equal(f.card('gate').dataset.expanded, 'true');
  f.named('Canale successivo').click();
  assert.equal(f.editor().dataset.channelId, 'ch-3'); assert.equal(f.selectedModule(), 'gate');
  f.named('Canale precedente').click();
  assert.equal(f.editor().dataset.channelId, 'ch-2'); assert.equal(f.selectedTab(), 'devices');
  f.clickStrip('aux-1');
  assert.equal(f.selectedTab(), 'devices'); assert.equal(f.card('gate').dataset.state, 'unavailable');
  assert.equal(f.selectedModule(), 'dyn'); assert.equal(f.card('dyn').dataset.expanded, 'true');
  f.E.open('bus-1'); assert.equal(f.selectedTab(), 'devices');
  assert.equal(f.editor().dataset.dockRow, 'inputs');
  assert.equal(f.selectedModule(), 'dyn'); assert.ok(f.card('dyn').querySelector('.editor-plugin-host'));
});

test('send family and direction survive compatible navigation and normalize before an incompatible family', t => {
  const f = fixture(t); f.E.openSection('ch-1', 'sends');
  for (const [group, target] of [['MTX', 'ch-2'], ['MAIN', 'ch-3'], ['BUS', 'ch-4']]) {
    f.named(`Mandate verso ${group}`).click(); f.clickStrip(target);
    assert.equal(f.selectedTab(), 'devices'); assert.equal(f.selectedModule(), 'sends'); assert.equal(f.selectedGroup(), group);
    assert.equal(f.card('sends').querySelector('.editor-send-groups').getAttribute('aria-label'), 'Destinazioni delle mandate');
  }
  f.E.open('bus-1');
  [...f.card('sends').querySelectorAll('.editor-subtabs button')].find(node => node.textContent === 'Riceve da').click();
  f.named('Riceve da CH').click();
  for (const id of ['bus-2', 'main-1', 'mtx-1']) {
    f.clickStrip(id);
    assert.equal(f.selectedGroup(), 'CH');
    assert.equal(f.selectedModule(), 'sends'); assert.equal(f.card('sends').querySelector('.editor-send-groups').getAttribute('aria-label'), 'Sorgenti delle mandate');
  }
  f.E.open('ch-5');
  assert.equal(f.selectedTab(), 'devices'); assert.equal(f.selectedGroup(), 'BUS');
  assert.equal(f.card('sends').querySelector('.editor-send-groups').getAttribute('aria-label'), 'Destinazioni delle mandate');
  f.named('Mandate verso MAIN').click(); f.E.open('main-2');
  assert.equal(f.selectedGroup(), 'MTX', 'MAIN can send only to matrices');
});

test('arrows follow the actual Custom Layer row and keep the editor in the opposite row', t => {
  const f = fixture(t);
  f.C.showLayer({ top: ['ch-7', 'bus-3', 'ch-9'], bottom: ['ch-1', 'bus-1'] }, 'Prova');
  f.E.openSection('ch-7', 'eq');
  assert.equal(f.editor().dataset.sourceRow, 'outputs'); assert.equal(f.editor().dataset.dockRow, 'inputs');
  f.named('Canale successivo').click();
  assert.equal(f.editor().dataset.channelId, 'bus-3'); assert.equal(f.selectedTab(), 'devices'); assert.equal(f.selectedModule(), 'eq');
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
  assert.equal(f.selectedTab(), 'devices'); assert.equal(f.selectedModule(), 'eq'); assert.equal(f.renders(), 1);
  assert.deepEqual(f.events.filter(event => event.type === 'processor'), [{ type: 'processor', id: 'ch-2', block: 'eq' }]);
  f.resetCounts();
  assert.equal(f.E.openSection('ch-3', 'dynamics', { block: 'gate' }), true);
  assert.equal(f.renders(), 1);
  assert.equal(f.selectedModule(), 'gate');
  assert.deepEqual(f.events.filter(event => event.type === 'processor' && event.block === 'gate'), [{ type: 'processor', id: 'ch-3', block: 'gate' }]);
  assert.ok(f.events.filter(event => event.type === 'processor').every(event => event.id === 'ch-3'));
  const board = f.board(), eq = f.card('eq'), gate = f.card('gate');
  f.resetCounts(); f.E.openSection('ch-3', 'dynamics');
  assert.equal(f.renders(), 0); assert.equal(f.selectedModule(), 'dyn'); assert.equal(f.card('dyn').dataset.expanded, 'true');
  assert.equal(f.board(), board); assert.equal(f.card('eq'), eq); assert.equal(f.card('gate'), gate);
  assert.deepEqual(f.events.filter(event => event.type === 'processor'), [{ type: 'processor', id: 'ch-3', block: 'dyn' }]);
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
  const f = fixture(t); f.E.openDevice('ch-1', 'master');
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
  assert.ok(f.pending('ch-1', 'eq')); assert.equal(f.card('eq').querySelector('.fx-connection-status').classList.contains('ready'), false);
  f.clickStrip('ch-2'); await tick();
  assert.ok(f.pending('ch-2', 'eq')); assert.equal(f.selectedTab(), 'devices'); assert.equal(f.selectedModule(), 'eq');
  const current = f.card('eq'), plugin = current.querySelector('.fx-processor'), renders = f.renders();
  f.pending('ch-1', 'eq').resolve(); await tick();
  assert.equal(f.editor().dataset.channelId, 'ch-2'); assert.equal(f.card('eq'), current); assert.equal(current.querySelector('.fx-processor'), plugin);
  assert.equal(current.querySelector('.fx-connection-status').classList.contains('ready'), false); assert.equal(f.renders(), renders);
  f.pending('ch-2', 'eq').resolve(); await tick();
  assert.equal(current.querySelector('.fx-connection-status').classList.contains('ready'), true);
  assert.equal(current.querySelector('.fx-processor'), plugin); assert.equal(f.renders(), renders);
  assert.ok(f.events.some(event => event.type === 'cleanup' && event.id === 'ch-1' && event.block === 'eq'));
});

test('live Gate fallback reads Dynamics on the output, and an obsolete failure stays invisible', async t => {
  const f = liveFixture(t); f.E.openSection('ch-1', 'dynamics', { block: 'gate' }); await tick();
  f.E.open('bus-1'); await tick();
  assert.ok(f.pending('bus-1', 'dyn')); assert.equal(f.pending('bus-1', 'gate'), undefined);
  f.pending('bus-1', 'dyn').resolve(); await tick();
  const current = f.card('dyn'), plugin = current.querySelector('.fx-processor');
  f.pending('ch-1', 'gate').reject(new Error('lettura obsoleta')); await tick();
  assert.equal(f.editor().dataset.channelId, 'bus-1'); assert.equal(f.selectedTab(), 'devices'); assert.equal(f.selectedModule(), 'dyn');
  assert.equal(f.card('dyn'), current); assert.equal(current.querySelector('.fx-processor'), plugin);
  assert.equal(current.querySelector('.fx-connection-status').classList.contains('ready'), true);
  assert.doesNotMatch(f.w.document.body.textContent, /lettura obsoleta/);
});

test('same-mode live session changes and closing invalidate pending reads before they can expose controls', async t => {
  const f = liveFixture(t); f.E.openSection('ch-1', 'eq'); await tick();
  const first = f.pending('ch-1', 'eq', 1); f.nextSession(); await tick();
  const second = f.pending('ch-1', 'eq', 2); assert.ok(second);
  const current = f.card('eq');
  first.resolve(); await tick(); assert.equal(f.card('eq'), current); assert.equal(current.querySelector('.fx-connection-status').classList.contains('ready'), false);
  second.resolve(); await tick();
  assert.equal(current.querySelector('.fx-connection-status').classList.contains('ready'), true);
  f.clickStrip('ch-2'); await tick();
  const old = f.card('eq').querySelector('.fx-processor'), count = f.events.filter(event => event.type === 'processor').length;
  f.E.close();
  f.pending('ch-2', 'eq').resolve(); await tick();
  assert.equal(f.E.isOpen(), false);
  assert.equal(f.events.filter(event => event.type === 'processor').length, count);
  assert.equal(old.querySelector('.fx-connection-status').classList.contains('ready'), false, 'closing disposes the pending processor instead of exposing its controls later');
});
