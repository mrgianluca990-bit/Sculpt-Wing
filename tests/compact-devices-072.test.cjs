'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const base = path.join(__dirname, '../dist');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { const end = Date.now() + 4000; while (Date.now() < end) { if (predicate()) return; await tick(); } throw new Error('Condition was not reached'); }
function fixture(t, extended = false) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), { url: 'https://sculpt.test', runScripts: 'outside-only' }), w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.ResizeObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0; w.cancelAnimationFrame = () => {};
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; }; w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.setPointerCapture = function () {}; w.HTMLElement.prototype.releasePointerCapture = function () {};
  w.HTMLDialogElement.prototype.show = function () { this.open = true; }; w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const rta = [], closed = []; w.SculptRTA = { mount(host, options) { rta.push({ host, ...options }); return () => closed.push(options.sourceId); } };
  const files = ['plugin-data.js','model.js','history.js','app.js','desk.js','shell.js','plugin-panels.js',
    ...['layouts','dynamics','eq','fx','channel','native','dynamics-extra','filters'].map(part => 'plugin-original-' + part + '.js'),
    'plugins.js','wing-map.js','channel-chain.js','editor.js','dca-bank.js', ...(extended ? ['vst-rack-model.js','vst-rack.js','extended.js'] : [])];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  const E = w.SculptEditor, C = w.SculptController, D = w.SculptDesk, Chain = w.SculptChannelChain;
  const editor = () => w.document.querySelector('.editor-dialog'), card = key => editor().querySelector('.editor-device-panel[data-module="' + key + '"]');
  const change = (input, value) => { input.value = String(value); input.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const drag = (node, type, x = 0) => { const e = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x }); Object.defineProperty(e, 'dataTransfer', { value: { setData() {}, effectAllowed: '', dropEffect: '' } }); node.dispatchEvent(e); return e; };
  t.after(() => { E.close(); w.close(); }); return { w, E, C, D, Chain, editor, card, change, drag, rta, closed };
}

test('nine named pages expose Pre, Send and Master parameters and every utility expands in place', t => {
  const f = fixture(t); f.E.open('ch-1');
  assert.deepEqual([...f.editor().querySelectorAll('.editor-device-label')].map(n => n.textContent).sort(), ['Home','Pre','Gate','EQ','Comp','Insert','Insert','Send','Master'].sort());
  const eq = f.card('eq'), nodes = [...f.editor().querySelectorAll('.editor-device-panel')];
  const trim = f.card('input').querySelector('[aria-label="Trim in dB"]'); f.change(trim, 2.4); assert.equal(f.C.getStrip('ch-1').trim, 2.4);
  const sendSelect = f.card('sends').querySelector('[aria-label="Destinazione"]'); f.change(sendSelect, 'bus-3');
  const sendLevel = f.card('sends').querySelector('input[type=number]'); f.change(sendLevel, -12.5); assert.equal(f.C.getSend('ch-1','bus-3').level, -12.5);
  const level = f.card('master').querySelector('[aria-label="Fader in dB"]'); f.change(level, -8.7); assert.equal(f.C.getStrip('ch-1').level, -8.7);
  const pan = f.card('master').querySelector('[aria-label="Pan"]'); f.change(pan, 31); assert.equal(f.C.getStrip('ch-1').pan, 31);
  for (const key of ['home','input','sends','master']) { f.card(key).querySelector('.editor-device-expand').click(); assert.equal(f.card(key).dataset.expanded,'true'); }
  assert(f.card('home').querySelector('[aria-label="Nome"]'));
  assert(f.card('input').querySelector('[aria-label="Sorgente Main"]'));
  assert(f.card('sends').querySelector('[aria-label="PRE EQ 1 frequenza in Hz"]'));
  assert(f.card('master').querySelector('[aria-label="Width in %"]'));
  assert.equal(f.card('eq'),eq); assert.equal(f.rta.length,1); assert.equal(f.closed.length,0);
  assert.deepEqual([...f.editor().querySelectorAll('.editor-device-panel')],nodes);
});

test('processor drag changes only proc, preserves neighbours and the RTA, and is undoable', async t => {
  const f = fixture(t); f.E.open('ch-1'); f.C.clearHistory();
  const eq = f.card('eq'), gate = f.card('gate'), dyn = f.card('dyn'), source = f.card('input'), before = plain(f.C.capture());
  dyn.getBoundingClientRect = () => ({ left:100,width:100 });
  f.drag(gate.querySelector('.editor-device-drag'),'dragstart');
  f.drag(dyn,'dragover',190); assert.equal(dyn.dataset.drop,'after'); f.drag(dyn,'drop',190);
  await until(() => f.Chain.snapshot('ch-1').proc === 'EDGI' && !f.Chain.snapshot('ch-1').busy);
  assert.equal(f.Chain.snapshot('ch-1').tap,'PFL'); assert.equal(f.card('eq'),eq); assert.equal(f.card('gate'),gate); assert.equal(f.card('input'),source);
  assert.equal(f.rta.length,1); assert.equal(f.closed.length,0);
  assert.deepEqual(plain(f.C.capture().values),before.values);
  assert.equal(f.C.historyState().undoCount,1);
  const undo = await f.C.undo(); assert.equal(undo.ok,true); assert.equal(f.Chain.snapshot('ch-1').proc,'GEDI'); assert.equal(f.card('eq'),eq);
});

test('Send palette has eight semantic targets; AFL changes only the shared PRE tap', async t => {
  const f = fixture(t); f.E.open('ch-1'); f.C.clearHistory();
  const before = plain(f.C.capture()), sends = f.card('sends'); sends.querySelector('.editor-device-drag').click();
  const palette = f.editor().querySelector('.editor-device-tap-palette'), options = [...palette.querySelectorAll('[data-target]')];
  assert.equal(options.length,8); assert(options.find(n => n.dataset.target==='tap:PFL').textContent.includes('prima del fader'));
  assert(options.find(n => n.dataset.target==='tap:AFL').textContent.includes('dopo il fader'));
  options.find(n => n.dataset.target==='tap:AFL').click(); await until(() => f.Chain.snapshot('ch-1').tap==='AFL' && !f.Chain.snapshot('ch-1').busy);
  assert.equal(f.Chain.snapshot('ch-1').proc,'GEDI'); assert.deepEqual(plain(f.C.capture().values),before.values); assert.deepEqual(plain(f.C.capture().sends),before.sends);
  assert.equal(f.card('sends'),sends); assert.match(sends.querySelector('.editor-device-model').textContent,/AFL/);
  assert.equal((await f.C.undo()).ok,true); assert.equal(f.Chain.snapshot('ch-1').tap,'PFL');
});

test('cancelled drag and late utility events leave the channel unchanged', t => {
  const f = fixture(t); f.E.open('ch-1'); const before = plain(f.C.capture());
  f.card('gate').querySelector('.editor-device-drag').click(); f.editor().querySelector('.editor-device-tap-palette button').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(f.editor().open,true); assert.equal(f.editor().querySelector('.editor-device-tap-palette'),null); assert.deepEqual(plain(f.C.capture()),before);
  const input = f.card('master').querySelector('[aria-label="Fader in dB"]'), level = f.C.getStrip('ch-1').level;
  f.card('master').querySelector('.editor-device-expand').click(); f.change(input,-6); input.dispatchEvent(new f.w.Event('blur'));
  assert.equal(f.C.getStrip('ch-1').level,level);
  const current = f.card('master').querySelector('[aria-label="Fader in dB"]'); f.E.open('ch-2'); const two = f.C.getStrip('ch-2').level; f.change(current,-2);
  assert.equal(f.C.getStrip('ch-1').level,level); assert.equal(f.C.getStrip('ch-2').level,two);
});

test('all families retain nine identities and only WING-supported pages and moves are enabled', t => {
  const f = fixture(t);
  for (const id of ['ch-1','aux-1','bus-1','main-1','mtx-1']) {
    f.E.open(id); assert.equal(f.editor().querySelectorAll('.editor-device-panel').length,9);
    assert.equal(f.card('input').dataset.state,'active'); assert(f.card('input').querySelector('[aria-label="Trim in dB"]'));
    if (!id.startsWith('ch-')) for (const handle of f.editor().querySelectorAll('.editor-device-drag')) assert.equal(handle.disabled,true);
    if (id.startsWith('aux-')) assert.equal(f.card('post').dataset.state,'unavailable');
    if (id.startsWith('mtx-')) { assert.equal(f.card('sends').dataset.state,'active'); assert.equal(f.card('sends').querySelector('.editor-device-drag').disabled,true); }
  }
});

test('Compact and Extended share the same open device row while retaining the original mixer controls', t => {
  const f = fixture(t,true), strip = f.w.document.querySelector('.strip[data-id="ch-1"]');
  const fader = strip.querySelector('.fader'), mute = strip.querySelector('.mute-button'), original = [...strip.querySelectorAll('[role="slider"]')];
  assert(fader); assert(mute); assert(strip.querySelector('.strip-pan'));
  f.E.open('ch-1'); const eq = f.card('eq'), board = f.editor().querySelector('.editor-device-board');
  f.w.SculptMixerView.setMode('extended'); assert.equal(f.editor().dataset.dockRow,'extended'); assert.equal(f.editor().querySelector('.editor-device-board'),board); assert.equal(f.card('eq'),eq);
  assert.equal(f.editor().querySelectorAll('.editor-device-panel').length,9); assert.equal(strip.querySelector('.fader'),fader); assert.equal(strip.querySelector('.mute-button'),mute);
  for (const slider of original) assert.equal(slider.isConnected,true);
  f.E.openDevice('ch-1','master'); assert.equal(f.card('master').dataset.expanded,'true'); assert(f.card('master').querySelector('[aria-label="Pan"]'));
  f.w.SculptMixerView.setMode('compact'); assert.equal(f.editor().dataset.dockRow,'outputs'); assert.equal(f.card('master').dataset.expanded,'true'); assert.equal(f.rta.length,1);
});
