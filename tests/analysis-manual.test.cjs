'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const R = require('../dist/analysis-routing.js');
const base = path.join(__dirname, '../dist');
const plain = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };

test('manufacturer response accepts headers and decimal CSV, preserves its sign, and bounds imported measurements', () => {
  const profile = R.parseCalibration('Mic serial ABC\nFrequency;Response;Phase\n1000;1,5;-2,0\n20;-0,25;0\n1000;1,5;-2,0', 'Mic.csv');
  assert.deepEqual(profile.points, [{ frequency: 20, gainDb: -.25, phaseDeg: 0 }, { frequency: 1000, gainDb: 1.5, phaseDeg: -2 }]);
  assert.deepEqual(R.parseCalibration('"20","-1,5"\n"1000","2,0"').points, [{ frequency: 20, gainDb: -1.5, phaseDeg: 0 }, { frequency: 1000, gainDb: 2, phaseDeg: 0 }]);
  assert.throws(() => R.parseCalibration('20 0\n20 1\n100 0'), /stessa frequenza/);
  assert.throws(() => R.parseCalibration('20 0\n100 NaN'), /Riga 2/);
  assert.throws(() => R.normaliseConfig({ measurementChannel: 3, referenceChannel: 3 }), /distinti/);
  assert.throws(() => R.importTraces(JSON.stringify({ format: 'sculpt-wing-measurements', version: 1, traces: Array(17).fill({}) })), /Formato/);
});

test('WING names resolve only through the existing USB patch and fresh gain changes invalidate the association', async () => {
  const values = {
    '/ch/7/in/set/srcauto': 0, '/ch/7/in/set/altsrc': 0, '/io/altsw': 0,
    '/ch/7/in/conn/grp': 'LCL', '/ch/7/in/conn/in': 2,
    '/ch/7/in/conn/altgrp': 'A', '/ch/7/in/conn/altin': 9,
    '/io/in/LCL/2/mode': 'M', '/io/in/LCL/2/g': 30,
    '/io/out/USB/3/grp': 'LCL', '/io/out/USB/3/in': 2,
    '/io/out/USB/9/grp': 'BUS', '/io/out/USB/9/in': 5,
    '/io/out/USB/10/grp': 'USR', '/io/out/USB/10/in': 5,
    '/io/in/USR/5/user/grp': 'CH', '/io/in/USR/5/user/in': 18,
    '/io/in/USR/5/user/tap': 'POST', '/io/in/USR/5/user/lr': 'L+R'
  };
  const reads = [];
  const live = {
    isConnected: () => true, sessionToken: () => 'wing-a', hasValue: () => false,
    async readValues(root) {
      reads.push(root);
      return Object.fromEntries(Object.entries(values).filter(([key]) => key === root || key.startsWith(root + '/')));
    },
    write() { assert.fail('analysis must never change WING routing or parameters'); }
  };
  const route = await R.readRouting(live, 'ch-7', 'bus-3', 'L');
  assert.equal(route.micMatches[0].channel, 2);
  assert.equal(route.referenceMatches[0].channel, 8);
  assert.equal(R.resolveRouting(values, 'ch-7', 'ch-18', 'L+R').referenceMatches[0].channel, 9);
  assert.equal(R.resolveRouting(values, 'ch-7', 'bus-3', 'R').referenceMatches.length, 0);
  const guards = R.selectedGuards(route, 2, 8);
  assert.equal(await R.readGuards(live, route, guards), true);
  values['/io/in/LCL/2/g'] = 31;
  assert.equal(await R.readGuards(live, route, guards), false, 'detects external gain without relying on cached live values');
  values['/io/in/LCL/2/mode'] = 'ST';
  assert.equal(R.resolveRouting(values, 'ch-7', 'bus-3').micMatches.length, 0, 'stereo preamp association must be chosen manually');
  assert(reads.every(p => !p.includes('/ptap')), 'reference lookup never changes the shared channel tap');
});

function fixture(t, native = true) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://sculpt.test', runScripts: 'outside-only' });
  const w = dom.window, timers = new Map(), calls = [], downloads = [];
  let timer = 0, running = false, seq = 0, configured = false, mode = 'spl';
  let cfg = R.normaliseConfig();
  const audio = { inputDevice: 'WING USB', outputDevice: 'WING USB', inputChannels: 48, outputChannels: 48, sampleRate: 48000, bufferSize: 256, configured: true };
  const result = () => ({
    running, configured, sequence: ++seq, sampleRate: 48000, config: { ...cfg, calibrationPointCount: cfg.calibration.length, calibration: undefined },
    measurementPeakDb: -17, referencePeakDb: mode === 'spl' ? -160 : -18,
    measurementRmsDb: -20, referenceRmsDb: mode === 'spl' ? -160 : -21,
    splDb: cfg.levelOffsetDb === null ? null : -20 + cfg.levelOffsetDb,
    clipped: false, valid: mode === 'transfer', stale: !running, estimatedDelayMs: mode === 'transfer' ? 12.75 : null,
    delaySearchMs: 341, delayQuality: mode === 'transfer' ? 'Ritardo valido' : 'Reference assente', meanCoherence: mode === 'transfer' ? .99 : 0,
    quality: mode === 'spl' ? 'Reference assente' : 'Misura valida',
    frequency: [20, 100, 1000, 10000], magnitudeDb: [1, 2, 0, -1], phaseDeg: [0, 10, 20, -100], coherence: [.99, .99, .99, .99],
    rtaDb: [-50, -40, -30, -40], impulse: { timeMs: [-1, 0, 1], value: [0, 1, 0] }
  });
  w.requestAnimationFrame = () => 0;
  w.setTimeout = (fn, delay) => { timers.set(++timer, fn); return timer; };
  w.clearTimeout = id => timers.delete(id);
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.HTMLDialogElement.prototype.show = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const strips = [
    { id: 'ch-7', kind: 'CH', number: 7, name: 'Mic misura' }, { id: 'aux-1', kind: 'AUX', number: 1, name: 'Aux' },
    { id: 'bus-3', kind: 'BUS', number: 3, name: 'Impianto' }, { id: 'main-1', kind: 'MAIN', number: 1, name: 'LR' }
  ];
  w.SculptController = { listStrips: () => strips, getStrip: id => strips.find(s => s.id === id) };
  w.SculptUI = { close() {}, download: (...args) => downloads.push(args) };
  w.SculptEditor = { close() {} };
  w.SculptVst = { ensureHost: async () => {}, snapshot: () => ({ audio }), openAudio: async () => {} };
  if (native) w.SculptDesktop = {
    platform: 'macos', addListener: () => Promise.resolve({ remove() {} }),
    async audioRequest({ method, params }) {
      calls.push({ method, params: plain(params) });
      if (method === 'getState') return { audio, running: true, analysis: { running } };
      if (method === 'configureAnalysis') {
        assert.equal(running, false, 'configuration changes stop analysis first');
        cfg = R.normaliseConfig(params); configured = true; return result();
      }
      if (method === 'startAnalysis') { running = true; return result(); }
      if (method === 'stopAnalysis') { running = false; return result(); }
      if (method === 'getAnalysis') return result();
      assert.fail('Unexpected host method ' + method);
    }
  };
  for (const file of ['analysis-routing.js', 'analysis.js']) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  const button = text => [...w.document.querySelectorAll('button')].find(n => n.textContent === text);
  const poll = async () => { const next = timers.entries().next().value; assert(next, 'a single polling callback is scheduled'); timers.delete(next[0]); await next[1](); await settle(); };
  t.after(() => { w.SculptAnalysis.close(); dom.window.close(); });
  return { w, calls, downloads, button, poll, cfg: () => cfg, setMode: value => { mode = value; } };
}

test('manual UI calibrates SPL with silent reference, applies analyzer-only delay, stores real traces and stops only analysis', async t => {
  const f = fixture(t);
  f.w.SculptAnalysis.open(); await settle();
  assert(f.button('Avvia misura'));
  assert.match(f.w.document.querySelector('[aria-label="Reference elettrica"]').textContent, /BUS 3.*Impianto/);
  assert.match(f.w.document.querySelector('[aria-label="Reference elettrica"]').textContent, /MAIN 1.*LR/);
  f.button('Avvia misura').click(); await settle();
  const micInput = f.w.document.querySelector('[aria-label="USB effettivo · Mic"]');
  micInput.value = '1'; micInput.dispatchEvent(new f.w.Event('change')); await settle();
  assert.equal(micInput.value, '0', 'a rejected identical mic/reference selection restores the displayed configuration');
  for (let i = 0; i < 8; i++) await f.poll();
  assert.match(f.w.document.querySelector('.analysis-quality').textContent, /Reference assente/);
  assert.equal(f.button('Calibra SPL').disabled, false, 'SPL depends on stable mic RMS, not transfer-function validity');
  assert.equal(f.button('Usa nel misuratore').disabled, true, 'missing delay never becomes a zero delay');
  f.button('Calibra SPL').click(); await settle();
  assert.equal(f.cfg().levelOffsetDb, 114);
  assert.match(f.w.document.querySelector('.analysis-spl').textContent, /94,0 dB SPL/);
  const calFile = [...f.w.document.querySelectorAll('input[type=file]')].find(n => n.accept.includes('.csv'));
  Object.defineProperty(calFile, 'files', { configurable: true, value: [{ name: 'mic.csv', size: 24, text: async () => 'FREQ,GAIN\n20,-1.5\n1000,2.0' }] });
  calFile.dispatchEvent(new f.w.Event('change')); await settle();
  assert.deepEqual(f.cfg().calibration, [{ frequency: 20, gainDb: -1.5, phaseDeg: 0 }, { frequency: 1000, gainDb: 2, phaseDeg: 0 }], 'native receives microphone response, not a second inverse');
  f.setMode('transfer'); await f.poll();
  f.button('Usa nel misuratore').click(); await settle();
  assert.equal(f.cfg().delayMs, 12.75);
  f.button('Memorizza').click();
  assert.equal(f.w.document.querySelectorAll('.analysis-trace').length, 1);
  f.button('Esporta misure').click();
  const saved = JSON.parse(f.downloads[0][1]);
  assert.equal(saved.traces[0].delayMs, 12.75);
  assert.equal(saved.traces[0].calibrationName, 'mic.csv');
  const channel = f.w.document.querySelector('[aria-label="USB effettivo · Mic"]');
  channel.value = '2'; channel.dispatchEvent(new f.w.Event('change')); await settle();
  assert.equal(f.cfg().levelOffsetDb, null, 'changing input invalidates SPL');
  f.w.SculptAnalysis.close(); await settle();
  assert.equal(f.calls.at(-1).method, 'stopAnalysis');
  assert(f.calls.every(c => ['getState', 'getAnalysis', 'configureAnalysis', 'startAnalysis', 'stopAnalysis'].includes(c.method)), 'no VST stop, mixer write or automatic correction');
});

test('web view stays empty and explains that native audio is required', async t => {
  const f = fixture(t, false);
  f.w.SculptAnalysis.open(); await settle();
  assert.equal(f.button('Avvia misura').disabled, true);
  assert.equal(f.button('Memorizza').disabled, true);
  assert.match(f.w.document.querySelector('.analysis-notice').textContent, /Mac/);
  assert.equal(f.calls.length, 0);
});
