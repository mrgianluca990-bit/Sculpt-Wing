'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Worker: NodeWorker } = require('node:worker_threads');

const root = path.resolve(__dirname, '..');
const activeWorkers = new Set();
let workerCount = 0;
class LocalWorker extends EventTarget {
  constructor(url, options) {
    super();
    assert.equal(options.type, 'module');
    assert.equal(url.href, pathToFileURL(path.join(root, 'dist/pdf.worker.js')).href);
    this.thread = new NodeWorker(path.join(__dirname, 'helpers/pdf-worker-host.mjs'), { workerData: { url: url.href } });
    activeWorkers.add(this); workerCount++;
    this.thread.on('message', data => this.dispatchEvent(new MessageEvent('message', { data })));
    this.thread.on('error', () => this.dispatchEvent(new Event('error')));
    this.thread.on('messageerror', () => this.dispatchEvent(new Event('messageerror')));
  }
  postMessage(data, transfer) { this.thread.postMessage(data, transfer); }
  terminate() { activeWorkers.delete(this); return this.thread.terminate(); }
}

// Only the browser transport is adapted. Both the reader source and the
// generated PDF.js worker actually parse the committed PDF fixtures.
globalThis.Worker = LocalWorker;
globalThis.document = { baseURI: pathToFileURL(path.join(root, 'dist/index.html')).href };
const readerPromise = import(pathToFileURL(path.join(root, 'native/src/pdf-reader.mjs')).href);
const fixture = name => new File([readFileSync(path.join(__dirname, 'fixtures/pdf', name))], name, { type: 'application/pdf' });
const errorCode = code => error => { assert.equal(error.code, code); assert.ok(error.message); return true; };

test('local PDF worker extracts a real two-page channel table with top-down coordinates', async () => {
  const reader = await readerPromise, progress = [];
  const document = await reader.readFile(fixture('channel-list.pdf'), { onProgress: value => progress.push(value) });
  assert.equal(document.pages.length, 2);
  assert.deepEqual(document.pages.map(page => page.pageNumber), [1, 2]);
  const first = document.pages[0], second = document.pages[1];
  assert.ok(first.width > 595 && first.width < 596);
  assert.ok(first.height > 841 && first.height < 843);
  const item = text => first.items.find(value => value.text === text);
  for (const value of ['BATTERIA', 'CH', 'NOME', 'Kick In', 'Snare Top', 'Overhead L', 'Overhead R']) assert.ok(item(value), value);
  assert.ok(item('CH').y < item('Kick In').y);
  assert.ok(item('Kick In').y < item('Snare Top').y);
  assert.ok(Math.abs(item('1').x - 48) < 0.01);
  assert.ok(Math.abs(item('Kick In').x - 115) < 0.01);
  assert.ok(Math.abs(item('Kick In').y - item('1').y) < 0.01);
  assert.ok(item('Kick In').width > 20 && item('Kick In').height > 5);
  assert.ok(second.items.some(item => item.text === 'Lead Vocal'));
  assert.equal(progress.at(-1).phase, 'complete');
  assert.equal(progress.at(-1).pageNumber, 2);
  assert.equal(progress.at(-1).totalPages, 2);
  assert.ok(progress.some(value => value.phase === 'extracting' && value.pageNumber === 1));
  assert.equal(activeWorkers.size, 0, 'the reader releases its worker after success');
  if (process.env.SCULPT_PDF_TEST_OUTPUT) writeFileSync(process.env.SCULPT_PDF_TEST_OUTPUT, JSON.stringify(document, null, 2) + '\n');
});

test('text bounding boxes account for page rotation, crop box and UserUnit', async () => {
  const reader = await readerPromise;
  const { pages } = await reader.readFile(fixture('geometry.pdf'));
  assert.equal(pages[0].width, 800); assert.equal(pages[0].height, 600);
  const rotated = pages[0].items.find(item => item.text === 'ROTATED TEXT');
  assert.ok(rotated);
  assert.ok(Math.abs(rotated.y - 72) < 0.01);
  assert.ok(rotated.x > 717 && rotated.x < 719);
  assert.ok(rotated.height > 70 && rotated.width > 10 && rotated.width < 15);
  assert.equal(pages[1].width, 1000); assert.equal(pages[1].height, 1400);
  const cropped = pages[1].items.find(item => item.text === 'CROPPED TEXT');
  assert.ok(cropped);
  assert.ok(Math.abs(cropped.x - 100) < 0.01);
  assert.ok(cropped.y > 280 && cropped.y < 285);
  assert.ok(cropped.height > 20 && cropped.height < 25);
  assert.equal(activeWorkers.size, 0);
});

test('image-only, password-protected and overlong real PDFs return clear bounded errors', async () => {
  const reader = await readerPromise;
  for (const [name, code] of [['scan.pdf', 'PDF_NO_TEXT'], ['password.pdf', 'PDF_PASSWORD'], ['too-many-pages.pdf', 'PDF_TOO_MANY_PAGES']]) {
    await assert.rejects(reader.readFile(fixture(name)), errorCode(code));
    assert.equal(activeWorkers.size, 0, name + ': worker terminated');
  }
});

test('cancellation during actual PDF extraction destroys the worker and a new read succeeds', async () => {
  const reader = await readerPromise, abort = new AbortController();
  await assert.rejects(reader.readFile(fixture('channel-list.pdf'), {
    signal: abort.signal,
    onProgress(value) { if (value.phase === 'extracting') abort.abort(); },
  }), error => { assert.equal(error.name, 'AbortError'); return errorCode('PDF_ABORTED')(error); });
  assert.equal(activeWorkers.size, 0);
  assert.equal((await reader.readFile(fixture('channel-list.pdf'))).pages.length, 2);
  assert.equal(activeWorkers.size, 0);
});

test('file limits, invalid headers and already-cancelled reads create no worker', async () => {
  const reader = await readerPromise, before = workerCount;
  await assert.rejects(reader.readFile({ size: reader.limits.maxFileBytes + 1, arrayBuffer() { throw Error('Must not read an oversized file'); } }), errorCode('PDF_FILE_TOO_LARGE'));
  await assert.rejects(reader.readFile(new File(['not a PDF'], 'fake.pdf')), errorCode('PDF_INVALID'));
  const abort = new AbortController(); abort.abort();
  await assert.rejects(reader.readFile(fixture('channel-list.pdf'), { signal: abort.signal }), errorCode('PDF_ABORTED'));
  assert.equal(workerCount, before);
});

test('a stalled local read times out before starting a worker', async t => {
  const reader = await readerPromise;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stalledFile = { size: 64, arrayBuffer: () => new Promise(() => {}) };
  const result = reader.readFile(stalledFile);
  const rejection = assert.rejects(result, errorCode('PDF_TIMEOUT'));
  t.mock.timers.tick(reader.limits.timeoutMs);
  await rejection;
  assert.equal(activeWorkers.size, 0);
});
