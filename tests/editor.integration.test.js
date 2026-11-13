// Integration smoke test: real model, Desk, catalog and processors, minimal DOM.
// The DOM fixture checks render/state contracts; visual and native input behavior
// are checked separately in Safari/Chrome by the browser QA workflow.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.join(__dirname, '..', 'dist');
let document;
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
    this.attributes = {}; this.dataset = {}; this.listeners = {}; this._text = '';
    this.className = ''; this.value = ''; this.scrollTop = 0; this.open = false;
    this.style = { setProperty() {} };
    this.classList = {
      toggle: (name, enabled) => { const names = new Set(this.className.split(/\s+/).filter(Boolean)); const on = enabled === undefined ? !names.has(name) : enabled; on ? names.add(name) : names.delete(name); this.className = [...names].join(' '); return on; },
      add: name => this.classList.toggle(name, true), remove: name => this.classList.toggle(name, false)
    };
  }
  append(...nodes) { for (const node of nodes) { assert(node instanceof Element, 'append must receive DOM nodes'); node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) { for (const node of this.children) node.parentElement = null; this.children = []; this._text = ''; this.append(...nodes); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  get childElementCount() { return this.children.length; }
  get isConnected() { return document.body.contains(this); }
  get valueAsNumber() { return this.value.trim() ? Number(this.value) : NaN; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  removeEventListener(name, listener) { this.listeners[name] = (this.listeners[name] || []).filter(v => v !== listener); }
  dispatchEvent(event) { event.target ||= this; event.preventDefault ||= () => {}; for (const listener of [...(this.listeners[event.type] || [])]) listener(event); return true; }
  click() { if (!this.disabled) this.dispatchEvent({ type: 'click' }); }
  focus() { if (document.activeElement !== this) { document.activeElement?.blur(); document.activeElement = this; } }
  blur() { if (document.activeElement === this) { document.activeElement = document.body; this.dispatchEvent({ type: 'blur' }); } }
  matches(selector) {
    return selector.split(',').some(part => {
      part = part.trim();
      if (part.startsWith('.')) return this.className.split(/\s+/).includes(part.slice(1));
      if (part.startsWith('#')) return this.id === part.slice(1);
      const attribute = part.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      if (attribute) { const key = attribute[1]; const value = key.startsWith('data-') ? this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this.getAttribute(key); return attribute[2] === undefined ? value != null : value === attribute[2]; }
      return this.tagName.toLowerCase() === part;
    });
  }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  scrollIntoView() {}
  select() {}
  setPointerCapture() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 800, bottom: 800 }; }
}
document = { body: new Element('body'), createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag) };
document.activeElement = document.body;
document.querySelector = selector => document.body.querySelector(selector);
document.getElementById = id => document.querySelector('#' + id);
const context = { document, console, setTimeout, clearTimeout, performance, CustomEvent: class { constructor(type) { this.type = type; } } };
context.window = context; context.dispatchEvent = () => {}; context.addEventListener = () => {};
vm.createContext(context);
const run = file => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context, { filename: file });
run('model.js'); run('plugin-data.js');
const M = context.SculptModel, state = M.defaults(), subscriptions = new Set();
let lastToast = '';
const emit = () => { for (const listener of [...subscriptions]) listener(); };
const C = context.SculptController = {
  getState: () => state, getStrip: id => M.find(state, id), listStrips: () => M.list(state),
  transact: fn => { fn(state); emit(); }, subscribe: fn => { subscriptions.add(fn); return () => subscriptions.delete(fn); },
  capture: () => JSON.parse(JSON.stringify(M.serialize(state))),
  updateStrip: (id, patch) => { M.patchStrip(M.find(state, id), patch); emit(); },
  selectStrip: id => { state.selected = id; emit(); }, getSof: () => state.sof,
  setSof: id => { M.setSof(state, id); emit(); },
  canSend: (a, b) => M.canRoute(M.find(state, a), M.find(state, b)),
  getSend: (a, b) => M.getSend(state, a, b),
  setSend: (a, b, patch) => { const result = M.setSend(state, a, b, patch); emit(); return result; },
  toast: value => { lastToast = value; }
};
context.SculptUI = { toast: C.toast, register() {}, open() {}, modal() { throw new Error('No modal expected in this test'); } };
run('desk.js'); run('plugin-panels.js'); run('plugins.js'); run('editor.js');
const D = context.SculptDesk, E = context.SculptEditor;
const editor = () => document.querySelector('.editor-dialog');
const named = (name, scope = editor()) => scope.querySelectorAll('[aria-label]').find(node => node.getAttribute('aria-label') === name);
const textButton = value => editor().querySelectorAll('button').find(node => node.textContent === value);
const tab = name => editor().querySelector(`[data-tab="${name}"]`).click();
const change = (input, value) => { assert(input, 'input exists'); input.value = String(value); input.dispatchEvent({ type: 'change' }); };
let rendered = 0;
for (const strip of C.listStrips()) {
  assert(E.open(strip.id));
  for (const name of ['channel', 'processing', 'eq', 'dynamics', 'sends', 'groups']) {
    tab(name); assert(editor().querySelector('.editor-panel').childElementCount > 0); rendered++;
    for (const select of editor().querySelectorAll('select')) {
      const choices = select.querySelectorAll('option').map(option => option.value);
      assert(choices.includes(String(select.value)), `${strip.id}/${name}: selector ${select.getAttribute('aria-label')} has invalid value ${select.value}`);
    }
  }
  E.close(); assert.equal(subscriptions.size, 0, 'editor/processor subscriptions are disposed');
}
E.open('ch-1'); tab('channel');
const fader = named('Fader in dB');
fader.focus(); fader.value = '-12.3'; fader.dispatchEvent({ type: 'input' });
assert.notEqual(C.getStrip('ch-1').level, -12.3, 'typing does not commit partial numbers');
fader.dispatchEvent({ type: 'keydown', key: 'Enter' });
assert.equal(C.getStrip('ch-1').level, -12.3); assert.equal(named('Fader in dB'), fader, 'value commit keeps the input node');
change(fader, ''); assert.equal(C.getStrip('ch-1').level, -12.3); assert.equal(fader.value, '-12.3');
change(named('Tag'), 'voice, guest'); assert.equal(D.channel('ch-1').tags, 'voice, guest');
change(named('Tag'), ''); assert.equal(D.channel('ch-1').tags, '');
D.patchChannel('ch-2', { source: 'LCL:1' });
change(named('Gain preamp in dB'), 21.5); assert.equal(D.source(D.channel('ch-2').source).gain, 21.5);
named('Alimentazione phantom 48 volt').click(); assert.equal(D.source('LCL:1').phantom, true);
D.change(data => { data.io.globalAlt = true; });
assert.equal(named('Gain preamp in dB'), undefined, 'digital ALT hides analog preamp');
textButton('MAIN').click(); assert.equal(D.channel('ch-1').sourceAuto, false); assert(named('Gain preamp in dB'));
tab('eq'); change(named('Modello eq'), 'SOUL'); assert.equal(D.processor({ type: 'strip', id: 'ch-1', block: 'eq' }).model, 'SOUL');
const eqParam = editor().querySelector('.fx-number'); assert(eqParam); change(eqParam, Number(eqParam.min));
tab('sends');
const sendFader = named('Livello → BUS 01 — cursore');
assert.equal(sendFader.getAttribute('aria-orientation'), 'vertical');
assert.equal(editor().querySelectorAll('[aria-orientation="vertical"]').length, 16, 'all bus send levels use vertical faders');
sendFader.value = '-7.4'; sendFader.dispatchEvent({ type: 'input' });
assert.equal(C.getSend('ch-1', 'bus-1').level, -7.4, 'vertical fader updates the existing send model');
assert.equal(named('Livello → BUS 01 — cursore'), sendFader, 'send updates preserve the fader DOM and pointer gesture');
change(named('Livello → BUS 01 in dB'), -18.2); assert.equal(C.getSend('ch-1', 'bus-1').level, -18.2);
change(named('Punto → BUS 01'), 'GRP'); assert.equal(C.getSend('ch-1', 'bus-1').mode, 'GRP');
change(named('Tap PRE di CH 01'), 'FILT'); assert.equal(D.channel('ch-1').tap, 'FILT');
named('Rinomina canale').click();
assert.equal(editor().querySelector('[data-tab="channel"]').getAttribute('aria-selected'), 'true');
assert.equal(document.activeElement, named('Nome'), 'rename shortcut focuses the existing identity field');
change(named('Nome'), 'Voce Sophia');
assert.equal(C.getStrip('ch-1').name, 'Voce Sophia');
assert.equal(editor().querySelector('#editor-title').textContent, 'Voce Sophia');
tab('processing'); change(named('Insert 2 · post fader'), '7'); assert.equal(D.channel('ch-1').postFx, 7);
tab('groups'); change(named('Gruppo automix'), 'x'); assert(D.get().automix.x.channels.includes('ch-1')); assert.equal(D.channel('ch-1').postFx, null);
D.change(data => { data.automix.x.channels = Array.from({ length: 16 }, (_, i) => `ch-${i + 1}`); data.automix.y.channels = []; });
E.open('ch-17'); tab('groups'); change(named('Gruppo automix'), 'y'); assert(!D.get().automix.y.channels.includes('ch-17')); assert(lastToast.includes('16'));
E.open('aux-1'); tab('processing'); assert.equal(named('Insert 2 · post fader'), undefined); assert.equal(named('Low cut attivo'), undefined);
tab('dynamics'); assert.equal(named('Slot Gate'), undefined); assert.equal(named('Tipo crossover'), undefined);
E.open('ch-1'); tab('channel');
const trim = named('Trim in dB'); trim.focus(); trim.value = '6.2';
E.open('ch-2'); assert.equal(C.getStrip('ch-1').trim, 6.2); assert.equal(C.getStrip('ch-2').trim, 0, 'pending edit remains on the old channel');
D.patchChannel('ch-2', { sourceAuto: false, useAlt: false, altSource: 'A:1' });
const oldGain = named('Gain preamp in dB'); oldGain.focus(); oldGain.value = '9.5';
const altGain = D.source('A:1').gain; D.patchChannel('ch-2', { useAlt: true });
assert.equal(D.source('LCL:1').gain, 9.5); assert.equal(D.source('A:1').gain, altGain, 'pending edit remains on the old preamp');
E.close(); assert.equal(subscriptions.size, 0);
(async () => {
  let writable = true, readOnlyName = false;
  let unblockRead;
  let firstRead = true;
  const heldRead = new Promise(resolve => { unblockRead = resolve; });
  context.SculptWingMap = { stripPath: id => '/' + id.replace('-', '/'), sourcePath: id => '/io/in/' + String(id).replace(':', '/') };
  context.SculptLive = {
    isLive: () => true, isConnected: () => true, isWritable: () => writable,
    snapshot: () => ({ mode: 'live', writable, pending: 0 }), hasStripValue: () => true,
    value: path => path.endsWith('/clink') ? 0 : '', hasValue: () => true,
    metadata: () => ({ type: 7, maxLength: 16, readOnly: readOnlyName }),
    loadScope: async () => { if (firstRead) { firstRead = false; await heldRead; } },
    readNode: async () => {}, subscribe: () => () => {},
  };
  E.open('ch-1');
  named('Rinomina canale').click();
  assert.equal(named('Nome'), undefined, 'rename waits for the channel read instead of exposing seed values');
  unblockRead();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(named('Nome'), 'live identity finishes loading');
  assert.equal(document.activeElement, named('Nome'), 'rename focuses identity after the asynchronous live read');
  assert.equal(named('Nome').disabled, false);
  writable = false; emit();
  assert.equal(named('Rinomina canale').disabled, true, 'read-only live connection disables the shortcut');
  assert.equal(named('Nome').disabled, true, 'read-only live connection disables name input');
  const priorName = C.getStrip('ch-1').name;
  change(named('Nome'), 'Disallowed');
  assert.equal(C.getStrip('ch-1').name, priorName, 'programmatic stale changes cannot commit after controls are disabled');
  writable = true; readOnlyName = true; emit();
  assert.equal(named('Nome').disabled, true, 'firmware read-only metadata disables the field');
  E.close(); delete context.SculptLive; delete context.SculptWingMap;
  assert.equal(subscriptions.size, 0);
  console.log(`PASS: ${rendered} page renders across 76 strips; vertical sends, numeric commits, rename shortcut and asynchronous/read-only live identity, source sharing/ALT, plugins, automix and cleanup.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
