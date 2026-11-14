'use strict';
// CPU-only benchmark; no network, native driver, WING or audio hardware is used.
// node scripts/bench-live-review.cjs --baseline-ref <git commit> --samples 30
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..'), M = require('../dist/model.js'), K = require('../dist/plugin-data.js');
const arg = (key, fallback) => { const index = process.argv.indexOf(key); return index < 0 ? fallback : process.argv[index + 1]; };
const baselineRef = arg('--baseline-ref', '0d69574');
const samples = Math.min(500, Math.max(5, Number(arg('--samples', 30)) || 30)), warmups = 5;
const copy = value => JSON.parse(JSON.stringify(value));
function sources(ref, name) { return ref ? execFileSync('git', ['show', `${ref}:dist/${name}`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'dist', name), 'utf8'); }
function version(ref) {
  const context = vm.createContext({ SculptModel: M, SculptCatalog: K, module: { exports: {} }, setTimeout, clearTimeout, console });
  vm.runInContext(sources(ref, 'wing-map.js'), context); const map = context.module.exports;
  context.module = { exports: {} }; vm.runInContext(sources(ref, 'live-session.js'), context);
  return { map, Session: context.module.exports.Session };
}
function makeState() {
  const state = M.defaults(), C = { getState: () => state, listStrips: () => M.list(state), getStrip: id => M.find(state, id), transact: fn => fn(state), subscribe: () => () => {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'dist/desk.js'), 'utf8'), { window: { SculptModel: M, SculptCatalog: K, SculptController: C } });
  return state;
}
function stats(times) {
  const ordered = [...times].sort((a, b) => a - b), at = p => Number(ordered[Math.max(0, Math.min(ordered.length - 1, Math.ceil(p * ordered.length) - 1))].toFixed(3));
  return { samples: times.length, minMs: at(0), medianMs: at(.5), p95Ms: at(.95), maxMs: at(1), meanMs: Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(3)) };
}
function run(v, kind) {
  const state = makeState(), driver = { onValue: () => () => {}, onStatus: () => () => {}, onMeters: () => () => {} };
  const session = new v.Session({ driver, map: v.map, getState: () => state, mutate: fn => fn(state) }); session.mode = 'live'; session.writable = true;
  session.values = v.map.capture(state);
  for (const e of v.map.descriptors(state)) session.metadata.set(e.path, { path: e.path, type: e.type === 'integer' ? 4 : e.type === 'string' ? 7 : 1, revision: 1, readOnly: !!e.readOnly });
  const times = [], total = [];
  try {
    for (let i = 0; i < warmups + samples; i++) {
      const start = performance.now(), before = copy(state);
      if (kind === 'fader') M.find(state, 'ch-1').level = -24 + i % 20 * .1;
      else M.setSend(state, 'ch-1', 'bus-2', { level: -22 + i % 20 * .1, pan: i % 31, panLink: false });
      const reviewing = performance.now(), result = session.review(before, state, kind === 'fader' ? 'strip' : 'send', 'ch-1');
      if (!result.ok) throw new Error(result.reason);
      const end = performance.now(); if (i >= warmups) { times.push(end - reviewing); total.push(end - start); }
    }
    return { review: stats(times), cloneAndReview: stats(total), mappedValues: v.map.capture(state).size };
  } finally { session.dispose(); }
}
function runIncoming(v) {
  const state = makeState(), driver = { onValue: () => () => {}, onStatus: () => () => {}, onMeters: () => () => {} };
  const session = new v.Session({ driver, map: v.map, getState: () => state, mutate: fn => fn(state) }), times = [];
  const paths = M.list(state).flatMap(strip => ['fdr', 'pan', 'mute'].map(suffix => v.map.stripPath(strip.id) + '/' + suffix))
    .concat(Array.from({ length: 16 }, (_, i) => `/dca/${i + 1}/fdr`));
  try {
    for (let i = 0; i < samples + warmups; i++) {
      for (const parameter of paths) session.batch.set(parameter, parameter.endsWith('/mute') ? i % 2 : parameter.endsWith('/pan') ? i % 31 : -25 + (i % 20) * .1);
      const start = performance.now(); session.flush();
      if (i >= warmups) times.push(performance.now() - start);
    }
    return { leaves: paths.length, apply: stats(times) };
  } finally { session.dispose(); }
}
const baseline = version(baselineRef), current = version(null);
const results = { conditions: { timestamp: new Date().toISOString(), node: process.version, platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0]?.model, baselineRef, samples, warmups, state: '76 audio strips, 16 DCA, default desk and complete synthetic metadata; no DOM, IPC, socket, audio or hardware', note: 'Durations measure JavaScript preparation only. They are not WING transport or audio latency.' }, fader: { baseline: run(baseline, 'fader'), current: run(current, 'fader') }, sofPanAndLevel: { baseline: run(baseline, 'send'), current: run(current, 'send') }, incomingBatch: { baseline: runIncoming(baseline), current: runIncoming(current) } };
console.log(JSON.stringify(results, null, 2));
