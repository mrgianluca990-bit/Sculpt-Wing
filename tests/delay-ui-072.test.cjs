'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const dist = path.join(__dirname, '../dist');
const tick = () => new Promise(resolve => setImmediate(resolve));
const defer = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
async function until(predicate, message = 'Expected Delay UI state was not reached') {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(message);
}
function paths(id) {
  const input = /^(ch|aux)-/.test(id), base = '/' + id.replace('-', '/') + (input ? '/in/set' : '/dly');
  return { base, mode: base + (input ? '/dlymode' : '/mode'), value: base + '/dly', on: base + (input ? '/dlyon' : '/on') };
}
const units = {
  M: { min: .1, max: 150, step: .1, unit: 5, type: 1 },
  FT: { min: .5, max: 500, step: .5, unit: 7, type: 1 },
  MS: { min: .5, max: 500, step: .1, unit: 3, type: 1 },
  SMP: { min: 16, max: 500, step: 1, unit: 0, type: 4 }
};

function fixture(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), {
    url: 'https://sculpt.test', runScripts: 'outside-only'
  });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.requestAnimationFrame = () => 0;
  w.cancelAnimationFrame = () => {};
  w.HTMLElement.prototype.scrollTo = function ({ left = 0 }) { this.scrollLeft = left; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.setPointerCapture = function () {};
  w.HTMLElement.prototype.releasePointerCapture = function () {};
  w.HTMLDialogElement.prototype.show = function () { this.open = true; };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event('close'));
  };
  w.SculptFX = { renderProcessor: () => () => {}, renderPrincipal: () => () => {} };
  for (const file of ['plugin-data.js', 'model.js', 'history.js', 'app.js', 'desk.js',
    'shell.js', 'wing-map.js', 'channel-chain.js', 'editor.js']) {
    vm.runInContext(fs.readFileSync(path.join(dist, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  }

  const E = w.SculptEditor, C = w.SculptController, D = w.SculptDesk, M = w.SculptWingMap;
  const hardware = new Map(), metadata = new Map(), cache = new Map(), listeners = new Set();
  const requested = [], writes = [], pending = [], calls = [], hooks = {};
  let applying = false, failureVersion = 0, acknowledge = true;
  const emit = () => { for (const listener of [...listeners]) listener(); };
  const publish = entries => {
    const pairs = Object.entries(entries);
    if (!pairs.length) return;
    for (const [node, value] of pairs) cache.set(node, value);
    applying = true;
    try { C.transact(state => M.applyMany(state, pairs), 'live-values', { record: false }); }
    finally { applying = false; }
    emit();
  };
  function configure(id, mode, value, extra = {}) {
    const previous = hardware.get(id);
    const state = { id, mode, value, on: 1, ...units[mode], revision: (previous?.revision || 0) + 1, ...extra };
    hardware.set(id, state);
    return state;
  }
  function define(id) {
    const state = hardware.get(id), p = paths(id), shared = { readOnly: false, revision: state.revision };
    metadata.set(p.mode, { ...shared, path: p.mode, type: 5, items: Object.keys(units).map(value => ({ value, label: value })) });
    metadata.set(p.value, { ...shared, path: p.value, type: state.type, unit: state.unit,
      min: state.min, max: state.max, steps: Math.round((state.max - state.min) / state.step) + 1 });
    metadata.set(p.on, { ...shared, path: p.on, type: 4, min: 0, max: 1 });
  }
  function branch(id) {
    const state = hardware.get(id), p = paths(id);
    return { [p.mode]: state.mode, [p.value]: state.value, [p.on]: state.on };
  }
  function cacheHardware(id) { define(id); publish(branch(id)); }
  const owner = node => [...hardware.keys()].find(id => Object.values(paths(id)).includes(node));
  w.SculptLive = {
    isLive: () => true, isConnected: () => true, isWritable: () => true,
    applying: () => applying, canPersist: () => false, sessionToken: () => 1,
    snapshot: () => ({ mode: 'live', writable: true, pending: pending.length, failureVersion }),
    hasStripValue: () => true, hasValue: node => cache.has(node), value: node => cache.get(node),
    metadata: node => metadata.get(node),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    loadScope: async () => {},
    describeNode: async node => metadata.get(node),
    async readNode(node, options = {}) {
      calls.push({ method: 'readNode', node, force: !!options.force });
      await hooks.readNode?.(node, options);
      const id = owner(node);
      if (id && node === paths(id).base) cacheHardware(id);
    },
    async readValues(node, options = {}) {
      calls.push({ method: 'readValues', node, depth: options.depth });
      const id = owner(node), p = id && paths(id);
      let result = id ? node === p.base ? branch(id) : { [node]: branch(id)[node] }
        : cache.has(node) ? { [node]: cache.get(node) } : {};
      const replacement = await hooks.readValues?.(node, result, options);
      if (replacement !== undefined) result = replacement;
      publish(result);
      return { ...result };
    },
    reviewMutation(before, after) {
      const scope = { paths: [...hardware.keys()].flatMap(id => {
        const p = paths(id); return [p.mode, p.value, p.on];
      }) };
      const previous = M.capture(before, scope), next = M.capture(after, scope);
      for (const [node, value] of next) if (!Object.is(previous.get(node), value)) {
        const request = { path: node, value };
        requested.push(request); pending.push(request);
      }
      return true;
    },
    async settled() {
      calls.push({ method: 'settled' });
      await hooks.settled?.();
      for (const request of pending.splice(0)) {
        if (!acknowledge) { failureVersion++; continue; }
        const id = owner(request.path), state = hardware.get(id), p = paths(id);
        writes.push({ ...request });
        if (request.path === p.mode) {
          const extra = hooks.modeWritten?.(id, request.value) || {};
          configure(id, request.value, state.value, extra);
        } else if (request.path === p.value) state.value = request.value;
        else if (request.path === p.on) state.on = request.value;
        // The mode acknowledgement alone must not refresh the amount/schema.
        // The renderer has to obtain both from a subsequent bounded read.
        publish({ [request.path]: request.value });
      }
    }
  };
  configure('ch-1', 'M', 10);
  cacheHardware('ch-1');
  publish({ '/ch/1/proc': 'GEDI', '/ch/1/ptap': 'PFL' });
  for (const [node, value] of [['/ch/1/proc', 'GEDI'], ['/ch/1/ptap', 'PFL']]) {
    metadata.set(node, { path: node, type: 5, revision: 1, readOnly: false, items: [{ value, label: value }] });
  }

  const editor = () => w.document.querySelector('.editor-dialog');
  const box = () => [...(editor()?.querySelectorAll('.editor-module') || [])]
    .find(section => /^Delay (?:d[’']ingresso|di uscita)$/.test(section.querySelector('h3')?.textContent || ''));
  const number = () => box()?.querySelector('input[type="number"]');
  const unit = () => box()?.querySelector('[aria-label="Unità delay"]');
  const retry = () => [...(box()?.querySelectorAll('button') || [])].find(button => button.textContent === 'Rileggi delay');
  const change = (input, value) => {
    assert(input, 'The Delay control is present');
    input.value = String(value);
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  const ready = () => !!number() && !number().disabled && number().value !== '';
  t.after(async () => {
    E.close();
    await tick();
    assert.equal(listeners.size, 0, 'Closing the editor releases the Delay/live subscriptions');
    w.close();
  });
  return { w, E, C, D, hardware, metadata, cache, requested, writes, calls, hooks,
    configure, cacheHardware, publish, box, number, unit, retry, change, ready,
    open: id => E.openDevice(id, 'input'), drain: () => w.SculptLive.settled(),
    acknowledge(value) { acknowledge = value; } };
}

test('Pre waits for a fresh schema and shows meters raw; Processing uses the same units', async t => {
  const f = fixture(t), p = paths('ch-1'), gate = defer();
  f.hooks.readNode = async (node, options) => { if (node === p.base && options.force) await gate.promise; };
  f.open('ch-1');
  await until(() => f.calls.some(call => call.method === 'readNode' && call.node === p.base && call.force));
  assert.equal(f.number().disabled, true);
  assert.equal(f.number().value, '', 'A populated old cache is insufficient before the fresh read');
  gate.resolve();
  await until(f.ready);
  assert.equal(f.number().getAttribute('aria-label'), 'Delay in m');
  assert.equal(f.number().value, '10');
  assert.equal(f.number().max, '150');
  f.change(f.number(), 12.3);
  assert.deepEqual(f.requested, [{ path: p.value, value: 12.3 }]);
  assert.equal(f.D.channel('ch-1').delay, 12.3, 'Live meters are not converted to milliseconds');
  await f.drain();

  f.E.openSection('ch-1', 'processing');
  await until(f.ready);
  assert.equal(f.number().getAttribute('aria-label'), 'Delay in m');
  assert.equal(f.number().value, '12.3');
  assert.equal(f.unit().value, 'M');
});

test('changing units drains older writes, blocks detached inputs and never converts the numeric amount locally', async t => {
  const f = fixture(t), p = paths('ch-1');
  f.open('ch-1'); await until(f.ready);
  f.change(f.number(), 11);
  const oldInput = f.number(), drain = defer(), schema = defer();
  let draining = false, firstDrain = true;
  f.hooks.settled = async () => { if (firstDrain) { firstDrain = false; draining = true; await drain.promise; } };
  f.hooks.modeWritten = () => ({ value: 42.6 });
  f.hooks.readNode = async (node, options) => { if (node === p.base && options.force) await schema.promise; };
  const before = f.requested.length;
  f.change(f.unit(), 'MS');
  await until(() => draining);
  assert.equal(f.number().disabled, true);
  assert.equal(f.number().value, '');
  assert.equal(f.requested.length, before, 'The unit command waits for the older numeric edit to drain');
  assert.equal(oldInput.isConnected, false);
  f.change(oldInput, 99);
  oldInput.dispatchEvent(new f.w.Event('blur'));
  assert.equal(f.requested.length, before, 'A detached input cannot submit its old-unit value');

  drain.resolve();
  await until(() => f.writes.some(write => write.path === p.mode));
  assert.deepEqual(f.writes, [{ path: p.value, value: 11 }, { path: p.mode, value: 'MS' }]);
  assert.equal(f.number().disabled, true, 'Mode acknowledgement does not substitute for the fresh amount/schema');
  schema.resolve();
  await until(f.ready);
  assert.equal(f.number().getAttribute('aria-label'), 'Delay in ms');
  assert.equal(f.number().value, '42.6', 'The console response, not a guessed conversion, sets the displayed amount');
  assert.deepEqual(f.requested.slice(before), [{ path: p.mode, value: 'MS' }]);
});

test('a remote mode change blanks the old value until its replacement schema and amount are read', async t => {
  const f = fixture(t), p = paths('ch-1');
  f.open('ch-1'); await until(f.ready);
  const gate = defer();
  let forced = false;
  f.hooks.readNode = async (node, options) => {
    if (node === p.base && options.force) { forced = true; await gate.promise; }
  };
  f.configure('ch-1', 'FT', 24.5);
  f.publish({ [p.mode]: 'FT' });
  await until(() => forced);
  assert.equal(f.number().disabled, true);
  assert.equal(f.number().value, '');
  gate.resolve(); await until(f.ready);
  assert.equal(f.unit().value, 'FT');
  assert.equal(f.number().getAttribute('aria-label'), 'Delay in ft');
  assert.equal(f.number().value, '24.5');
  assert.equal(f.number().step, '0.5');
  assert.equal(f.requested.length, 0, 'Observing a remote change produces no corrective write');
});

test('mismatched and incomplete fresh reads remain disabled until an explicit retry succeeds', async t => {
  const f = fixture(t), p = paths('ch-1');
  let modeReads = 0;
  f.hooks.readValues = (node, result) => {
    if (node === p.mode && ++modeReads === 2) return { [p.mode]: 'FT' };
    return result;
  };
  f.open('ch-1'); await until(() => !!f.retry());
  assert.match(f.box().textContent, /cambiate durante la lettura/i);
  assert.equal(f.number().disabled, true);
  assert.equal(f.number().value, '');
  const reads = f.calls.length;
  await tick(); await tick();
  assert.equal(f.calls.length, reads, 'An inconsistent read does not create an automatic retry loop');

  f.hooks.readValues = (node, result) => node === p.base ? { [p.mode]: result[p.mode] } : result;
  f.retry().click();
  await until(() => !!f.retry() && /incompleta/i.test(f.box().textContent));
  assert.equal(f.number().disabled, true);
  assert.equal(f.number().value, '', 'A missing fresh amount cannot be filled from the old cache');
  f.hooks.readValues = undefined;
  f.retry().click(); await until(f.ready);
  assert.equal(f.number().value, '10');
  assert.equal(f.unit().value, 'M');
  assert.equal(f.requested.length, 0);
});

test('an unconfirmed unit command and a failed retry leave the amount blocked without resending the command', async t => {
  const f = fixture(t), p = paths('ch-1');
  f.open('ch-1'); await until(f.ready);
  f.acknowledge(false);
  f.change(f.unit(), 'MS');
  await until(() => !!f.retry());
  assert.match(f.box().textContent, /non ha confermato/i);
  assert.equal(f.number().disabled, true);
  assert.equal(f.number().value, '');
  assert.deepEqual(f.requested, [{ path: p.mode, value: 'MS' }]);

  f.acknowledge(true);
  f.hooks.readNode = (node, options) => {
    if (node === p.base && options.force) throw new Error('Schema delay non raggiungibile');
  };
  f.retry().click();
  await until(() => !!f.retry() && /Schema delay non raggiungibile/.test(f.box().textContent));
  assert.equal(f.number().disabled, true);
  f.hooks.readNode = undefined;
  f.retry().click(); await until(f.ready);
  assert.equal(f.unit().value, 'M');
  assert.equal(f.number().value, '10');
  assert.deepEqual(f.requested, [{ path: p.mode, value: 'MS' }], 'Retry rereads the console; it does not replay the failed unit request');
});

test('sample counts above 3000 remain raw and writable when the live schema permits them', async t => {
  const f = fixture(t), p = paths('ch-1');
  f.configure('ch-1', 'SMP', 7200, { min: 16, max: 120000, step: 1, type: 4 });
  f.cacheHardware('ch-1');
  f.open('ch-1'); await until(f.ready);
  assert.equal(f.number().getAttribute('aria-label'), 'Delay in smp');
  assert.equal(f.number().value, '7200');
  assert.equal(f.number().max, '120000');
  f.change(f.number(), 9000);
  assert.equal(f.D.channel('ch-1').delay, 9000);
  assert.deepEqual(f.requested, [{ path: p.value, value: 9000 }]);
  await f.drain();
  assert.equal(f.number().value, '9000');
});

test('CH and AUX use input delay paths while BUS, MAIN and MTX use their output delay branches', async t => {
  const f = fixture(t);
  const cases = [
    ['ch-1', '/ch/1/in/set', '/ch/1/in/set/dlymode'],
    ['aux-1', '/aux/1/in/set', '/aux/1/in/set/dlymode'],
    ['bus-1', '/bus/1/dly', '/bus/1/dly/mode'],
    ['main-1', '/main/1/dly', '/main/1/dly/mode'],
    ['mtx-1', '/mtx/1/dly', '/mtx/1/dly/mode']
  ];
  for (const [index, [id, branch, mode]] of cases.entries()) {
    f.configure(id, 'MS', 20 + index);
    f.open(id); await until(f.ready);
    assert.equal(f.number().value, String(20 + index));
    assert.equal(f.number().getAttribute('aria-label'), 'Delay in ms');
    assert(f.calls.some(call => call.method === 'readNode' && call.node === branch && call.force), id + ' refreshes its own schema');
    assert(f.calls.some(call => call.method === 'readValues' && call.node === mode), id + ' reads the matching unit selector');
    f.change(f.number(), 30 + index);
    assert.deepEqual(f.requested.at(-1), { path: branch + '/dly', value: 30 + index });
    await f.drain();
  }
  const forced = [...new Set(f.calls.filter(call => call.method === 'readNode' && call.force).map(call => call.node))];
  assert.deepEqual(forced.sort(), cases.map(item => item[1]).sort());
});
