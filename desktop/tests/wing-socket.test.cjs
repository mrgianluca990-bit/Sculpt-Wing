'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const dgram = require('node:dgram');
const { EventEmitter, once } = require('node:events');
const { WingSocket, isPrivateIPv4, LIMITS } = require('../src/wing-socket.cjs');

const tick = () => new Promise(resolve => setImmediate(resolve));
const encoded = value => Buffer.from(value).toString('base64');
const hasCode = code => err => err?.code === code;

async function until(predicate, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for socket event');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function fakeTransport(options = {}) {
  const tcp = [], udp = [], events = [];
  class TCP extends EventEmitter {
    constructor() { super(); this.writes = []; this.callbacks = []; this.destroyed = false; this.paused = false; tcp.push(this); }
    setNoDelay(value) { this.noDelay = value; }
    pause() { this.paused = true; }
    resume() { this.paused = false; }
    connect(address) {
      this.remoteAddress = address.host;
      this.addressOptions = address;
      if (!options.manualConnect) queueMicrotask(() => { if (!this.destroyed) this.emit('connect'); });
    }
    write(bytes, callback) {
      this.writes.push(Buffer.from(bytes));
      this.callbacks.push(callback);
      if (!options.manualWrites) queueMicrotask(() => callback());
      return options.writeReturns ?? true;
    }
    destroy() { this.destroyed = true; queueMicrotask(() => this.emit('close')); }
  }
  class UDP extends EventEmitter {
    constructor() { super(); this.sent = []; this.closed = false; this.bound = false; udp.push(this); }
    bind(address) {
      this.bindOptions = address;
      if (!options.manualBind) queueMicrotask(() => {
        if (!this.closed) { this.bound = true; this.emit('listening'); }
      });
    }
    address() { return { address: '0.0.0.0', family: 'IPv4', port: 41000 + udp.indexOf(this) }; }
    send(bytes, port, host, callback) {
      this.sent.push({ bytes: Buffer.from(bytes), port, host, callback });
      if (!options.manualUDP) queueMicrotask(() => callback());
    }
    close() {
      if (options.closeBeforeBindThrows && !this.bound) throw Object.assign(new Error('Not bound yet'), { code: 'ERR_SOCKET_DGRAM_NOT_RUNNING' });
      this.closed = true;
      queueMicrotask(() => this.emit('close'));
    }
  }
  const socket = new WingSocket({
    netModule: { Socket: TCP }, dgramModule: { createSocket: () => new UDP() },
    connectTimeoutMs: options.connectTimeoutMs ?? 1000,
    sendTimeoutMs: options.sendTimeoutMs ?? 1000,
    emit: options.emit ?? ((name, event) => events.push({ name, ...event })),
  });
  return { socket, tcp, udp, events };
}

test('private IPv4 boundary matches iOS; invalid connect never replaces a live session', async t => {
  for (const host of ['10.0.0.1', '10.255.255.254', '172.16.0.1', '172.31.255.254', '192.168.1.1', '169.254.1.1', '169.254.254.254']) {
    assert.equal(isPrivateIPv4(host), true, host);
  }
  for (const host of [undefined, null, '', 'wing.local', '127.0.0.1', '8.8.8.8', '172.15.1.1', '172.32.1.1', '169.254.0.1', '169.254.255.1', '10.0.0.0', '10.0.0.255', '010.0.0.1', '10.0.0.01', '10.0.0.256', '10.0.0.1 ', 'http://10.0.0.1', '::1']) {
    assert.equal(isPrivateIPv4(host), false, String(host));
  }
  const f = fakeTransport();
  t.after(() => f.socket.close());
  const active = await f.socket.connect({ host: '192.168.1.20', requestId: 'first' });
  await assert.rejects(f.socket.connect({ host: '8.8.8.8', requestId: 'second' }), hasCode('INVALID_HOST'));
  await assert.rejects(f.socket.connect({ host: '10.0.0.1', requestId: '' }), hasCode('INVALID_REQUEST'));
  await f.socket.sendTCP({ sessionId: active.sessionId, data: encoded('still alive') });
  assert.equal(f.tcp.length, 1);
});

test('real sockets carry ordered initial/TCP bytes, UDP identity and meter frames directly', { timeout: 10_000 }, async t => {
  const peers = new Set(), received = [], events = [];
  let socket;
  const server = net.createServer(peer => {
    peers.add(peer);
    peer.on('close', () => peers.delete(peer));
    peer.on('data', data => { received.push(data); peer.write(data); });
    peer.write(Buffer.from([0xdf, 0xd1, 0x41]));
    peer.write(Buffer.from([0x42, 0x43]));
  });
  const consoleUDP = dgram.createSocket('udp4');
  // Register cleanup before either bind, including partially initialized fixtures.
  t.after(async () => {
    await socket?.close();
    for (const peer of peers) peer.destroy();
    await Promise.all([
      new Promise(resolve => server.close(resolve)),
      new Promise((resolve, reject) => {
        try { consoleUDP.close(resolve); }
        catch (err) {
          if (err.code === 'ERR_SOCKET_DGRAM_NOT_RUNNING') resolve();
          else reject(err);
        }
      }),
    ]);
  });
  const tcpListening = once(server, 'listening', { signal: t.signal });
  server.listen(0, '127.0.0.1');
  await tcpListening;
  const port = server.address().port;
  const udpListening = once(consoleUDP, 'listening', { signal: t.signal });
  consoleUDP.bind(port, '127.0.0.1');
  await udpListening;
  const datagrams = [];
  consoleUDP.on('message', (bytes, peer) => {
    datagrams.push({ bytes, peer });
    consoleUDP.send(Buffer.from('WING,127.0.0.1,Console,WING,serial,3.1.2'), peer.port, peer.address);
  });
  socket = new WingSocket({
    emit: (name, event) => events.push({ name, ...event }),
    // Dependency configuration is confined to this test. Production permits private IPv4 only.
    validateHost: host => host === '127.0.0.1', port, bindAddress: '127.0.0.1',
    connectTimeoutMs: 1000, sendTimeoutMs: 1000,
  });
  const result = await socket.connect({ host: '127.0.0.1', requestId: 'real-one' });
  assert.ok(result.meterPort > 0);
  assert.notEqual(result.meterPort, port);
  await until(() => events.some(event => event.transport === 'tcp'));
  await Promise.all(['one', 'two', 'three'].map(value => socket.sendTCP({ sessionId: result.sessionId, data: encoded(value) })));
  await socket.sendUDP({ sessionId: result.sessionId, data: encoded('WING?') });
  await until(() => Buffer.concat(received).toString() === 'onetwothree' && datagrams.length === 1);
  assert.equal(datagrams[0].bytes.toString(), 'WING?');
  assert.equal(datagrams[0].peer.port, result.meterPort);
  const meter = Buffer.from([0, 0, 0, 7, 0xab, 0xcd]);
  await new Promise((resolve, reject) => consoleUDP.send(meter, result.meterPort, '127.0.0.1', err => err ? reject(err) : resolve()));
  await until(() => events.some(event => event.transport === 'udp' && event.data === meter.toString('base64')));
  const expectedStream = Buffer.concat([Buffer.from([0xdf, 0xd1, 0x41, 0x42, 0x43]), Buffer.from('onetwothree')]);
  const tcpStream = () => Buffer.concat(events.filter(event => event.transport === 'tcp').map(event => Buffer.from(event.data, 'base64')));
  // UDP delivery does not imply that the TCP echo has arrived yet.
  await until(() => tcpStream().length >= expectedStream.length);
  assert.deepEqual(tcpStream(), expectedStream);
  assert.equal(events.filter(event => event.state === 'ready').length, 1);
  assert.ok(events.every(event => event.sessionId === result.sessionId));
  // Foreign-source filtering is covered by fakeTransport below, without requiring
  // an additional loopback address that may not be configured on macOS.
});

test('cancel pending connect by request ID; late completion and old disconnect cannot touch replacement', async t => {
  const f = fakeTransport({ manualConnect: true });
  t.after(() => f.socket.close());
  const first = f.socket.connect({ host: '10.0.0.1', requestId: 'request-one' });
  const firstRejected = assert.rejects(first, hasCode('DISCONNECTED'));
  await f.socket.disconnect({ requestId: 'request-one' });
  await firstRejected;
  assert.ok(f.tcp[0].destroyed && f.udp[0].closed);
  const second = f.socket.connect({ host: '10.0.0.2', requestId: 'request-two' });
  f.tcp[0].emit('connect');
  f.tcp[0].emit('data', Buffer.from('stale'));
  f.tcp[0].emit('error', new Error('late old socket failure'));
  f.tcp[1].emit('connect');
  const active = await second;
  await f.socket.disconnect({ requestId: 'request-one' });
  await f.socket.disconnect({ sessionId: 'old-session' });
  await f.socket.disconnect({ sessionId: active.sessionId, requestId: 'request-one' });
  await f.socket.sendTCP({ sessionId: active.sessionId, data: encoded('new-session') });
  assert.equal(f.tcp[1].destroyed, false);
  assert.equal(f.events.some(event => event.data === encoded('stale')), false);
});

test('new connection rejects old pending connect and old sends, with no replay', async t => {
  const f = fakeTransport({ manualConnect: true, manualWrites: true });
  t.after(() => f.socket.close());
  const pending = f.socket.connect({ host: '10.0.0.1', requestId: 'old' });
  const replaced = assert.rejects(pending, hasCode('SESSION_REPLACED'));
  const next = f.socket.connect({ host: '10.0.0.2', requestId: 'current' });
  f.tcp[1].emit('connect');
  const active = await next;
  await replaced;
  const writes = [1, 2].map(n => f.socket.sendTCP({ sessionId: active.sessionId, data: encoded([n]) }));
  const cancelled = writes.map(promise => assert.rejects(promise, hasCode('SESSION_REPLACED')));
  const third = f.socket.connect({ host: '10.0.0.3', requestId: 'third' });
  f.tcp[2].emit('connect');
  await third;
  await Promise.all(cancelled);
  f.tcp[1].callbacks[0]();
  f.tcp[1].emit('drain');
  assert.equal(f.tcp[1].writes.length, 1);
  assert.equal(f.tcp[2].writes.length, 0);
});

test('disconnect before ready delivery cancels activation; a delayed UDP bind is still closed', async t => {
  const f = fakeTransport();
  t.after(() => f.socket.close());
  const { sessionId } = await f.socket.connect({ host: '10.0.0.1', requestId: 'ready-race' });
  await f.socket.disconnect({ sessionId, requestId: 'ready-race' });
  await tick();
  assert.equal(f.events.some(event => event.state === 'ready'), false);
  assert.equal(f.events.filter(event => event.state === 'closed').length, 1);

  const delayed = fakeTransport({ manualBind: true, closeBeforeBindThrows: true });
  t.after(() => delayed.socket.close());
  const pending = delayed.socket.connect({ host: '10.0.0.1', requestId: 'binding' });
  const rejected = assert.rejects(pending, hasCode('DISCONNECTED'));
  await delayed.socket.disconnect({ requestId: 'binding' });
  await rejected;
  assert.equal(delayed.tcp[0].destroyed, true);
  assert.equal(delayed.udp[0].closed, false);
  delayed.udp[0].bound = true;
  delayed.udp[0].emit('listening');
  assert.equal(delayed.udp[0].closed, true);
  assert.equal(delayed.events.some(event => event.state === 'ready'), false);
});

test('strict base64, send byte boundaries and stale session IDs', async t => {
  const f = fakeTransport();
  t.after(() => f.socket.close());
  const { sessionId } = await f.socket.connect({ host: '192.168.0.2', requestId: 'validation' });
  for (const data of ['', 'a', 'AA', 'AA=', 'AA===', 'AA==\n', 'AA-=', 'Zh==', '@@==', 1, null]) {
    await assert.rejects(f.socket.sendTCP({ sessionId, data }), hasCode('INVALID_PACKET'));
  }
  await assert.rejects(f.socket.sendTCP({ sessionId, data: encoded(Buffer.alloc(LIMITS.tcpBytes + 1)) }), hasCode('INVALID_PACKET'));
  await assert.rejects(f.socket.sendUDP({ sessionId, data: encoded(Buffer.alloc(LIMITS.udpBytes + 1)) }), hasCode('INVALID_PACKET'));
  await assert.rejects(f.socket.sendTCP({ sessionId: 'old', data: encoded('x') }), hasCode('STALE_SESSION'));
  await f.socket.sendTCP({ sessionId, data: encoded(Buffer.alloc(LIMITS.tcpBytes)) });
  await f.socket.sendUDP({ sessionId, data: encoded(Buffer.alloc(LIMITS.udpBytes)) });
  assert.equal(f.tcp[0].writes.length, 1);
  assert.equal(f.udp[0].sent.length, 1);
  assert.equal(f.udp[0].sent[0].port, 2222);
});

test('TCP backpressure waits for callback and drain, preserving queue order', async t => {
  const f = fakeTransport({ manualWrites: true, writeReturns: false });
  t.after(() => f.socket.close());
  const { sessionId } = await f.socket.connect({ host: '10.0.0.1' });
  const first = f.socket.sendTCP({ sessionId, data: encoded('first') });
  const second = f.socket.sendTCP({ sessionId, data: encoded('second') });
  assert.equal(f.tcp[0].writes.length, 1);
  f.tcp[0].callbacks[0]();
  await tick();
  assert.equal(f.tcp[0].writes.length, 1);
  f.tcp[0].emit('drain');
  await first;
  assert.equal(f.tcp[0].writes.length, 2);
  f.tcp[0].emit('drain');
  f.tcp[0].callbacks[1]();
  await second;
  assert.deepEqual(f.tcp[0].writes.map(b => b.toString()), ['first', 'second']);
});

test('pending send count and byte caps reject excess without closing a healthy session', async t => {
  const f = fakeTransport({ manualWrites: true });
  t.after(() => f.socket.close());
  let { sessionId } = await f.socket.connect({ host: '10.0.0.1' });
  const countPending = Array.from({ length: LIMITS.pendingSends }, () => f.socket.sendTCP({ sessionId, data: encoded('x') }));
  const countSettled = Promise.allSettled(countPending);
  await assert.rejects(f.socket.sendUDP({ sessionId, data: encoded('extra') }), hasCode('SEND_OVERFLOW'));
  assert.equal(f.tcp[0].destroyed, false);
  await f.socket.disconnect({ sessionId });
  assert.ok((await countSettled).every(result => result.status === 'rejected'));
  ({ sessionId } = await f.socket.connect({ host: '10.0.0.2' }));
  const bytePending = Array.from({ length: 4 }, () => f.socket.sendTCP({ sessionId, data: encoded(Buffer.alloc(LIMITS.tcpBytes)) }));
  const byteSettled = Promise.allSettled(bytePending);
  await assert.rejects(f.socket.sendTCP({ sessionId, data: encoded('extra') }), hasCode('SEND_OVERFLOW'));
  await f.socket.disconnect({ sessionId });
  assert.ok((await byteSettled).every(result => result.status === 'rejected'));
});

test('connect timeout, network failure and send timeout clean all resources exactly once', async t => {
  const connect = fakeTransport({ manualConnect: true, connectTimeoutMs: 15 });
  t.after(() => connect.socket.close());
  await assert.rejects(connect.socket.connect({ host: '10.0.0.1' }), hasCode('CONNECT_TIMEOUT'));
  assert.ok(connect.tcp[0].destroyed && connect.udp[0].closed);
  assert.equal(connect.events.filter(event => event.state === 'error').length, 1);

  const sending = fakeTransport({ manualWrites: true, sendTimeoutMs: 15 });
  t.after(() => sending.socket.close());
  const { sessionId } = await sending.socket.connect({ host: '10.0.0.1' });
  const results = await Promise.allSettled([
    sending.socket.sendTCP({ sessionId, data: encoded('one') }),
    sending.socket.sendTCP({ sessionId, data: encoded('two') }),
  ]);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.code === 'SEND_TIMEOUT'));
  assert.ok(sending.tcp[0].destroyed && sending.udp[0].closed);
  sending.tcp[0].emit('error', new Error('late'));
  sending.udp[0].emit('error', new Error('late'));
  assert.equal(sending.events.filter(event => event.state === 'error').length, 1);

  const failure = fakeTransport({ manualConnect: true });
  t.after(() => failure.socket.close());
  const pending = failure.socket.connect({ host: '10.0.0.1' });
  const rejected = assert.rejects(pending, hasCode('NETWORK_ERROR'));
  failure.udp[0].emit('error', new Error('bind failed'));
  await rejected;
  assert.ok(failure.tcp[0].destroyed && failure.udp[0].closed);
});

test('TCP callback failure rejects every pending send; invalid UDP size tears down the session', async t => {
  const f = fakeTransport({ manualWrites: true });
  t.after(() => f.socket.close());
  let { sessionId } = await f.socket.connect({ host: '10.0.0.1' });
  const pending = ['first', 'queued'].map(value => f.socket.sendTCP({ sessionId, data: encoded(value) }));
  const rejected = Promise.all(pending.map(promise => assert.rejects(promise, hasCode('SEND_FAILED'))));
  f.tcp[0].callbacks[0](new Error('write failed'));
  await rejected;
  assert.equal(f.tcp[0].writes.length, 1);
  assert.equal(f.events.filter(event => event.state === 'error').length, 1);
  ({ sessionId } = await f.socket.connect({ host: '10.0.0.2' }));
  await tick();
  f.udp[1].emit('message', Buffer.alloc(LIMITS.udpBytes + 1), { address: '10.0.0.2' });
  assert.ok(f.tcp[1].destroyed && f.udp[1].closed);
  assert.equal(f.events.filter(event => event.state === 'error' && event.sessionId === sessionId).length, 1);
});

test('suspend rejects pending writes; reconnect is explicit, close is terminal', async () => {
  const f = fakeTransport({ manualUDP: true });
  const { sessionId } = await f.socket.connect({ host: '10.0.0.1' });
  const write = f.socket.sendUDP({ sessionId, data: encoded('WING?') });
  const rejected = assert.rejects(write, hasCode('APP_SUSPENDED'));
  await f.socket.suspend();
  await rejected;
  assert.equal(f.events.filter(event => event.state === 'suspended').length, 1);
  assert.ok(f.tcp[0].destroyed && f.udp[0].closed);
  await assert.rejects(f.socket.sendTCP({ sessionId, data: encoded('x') }), hasCode('STALE_SESSION'));
  await tick();
  assert.equal(f.tcp.length, 1);
  const reconnected = await f.socket.connect({ host: '10.0.0.1' });
  assert.notEqual(reconnected.sessionId, sessionId);
  await f.socket.close();
  await f.socket.close();
  await assert.rejects(f.socket.connect({ host: '10.0.0.1' }), hasCode('UNAVAILABLE'));
});

test('initial packets stay ordered, foreign peers are ignored, receive queue is bounded', async t => {
  const f = fakeTransport({ manualConnect: true });
  t.after(() => f.socket.close());
  const pending = f.socket.connect({ host: '192.168.1.2' });
  f.tcp[0].emit('data', Buffer.from([0xdf]));
  f.tcp[0].emit('data', Buffer.from([0xd1, 0x01]));
  f.udp[0].emit('message', Buffer.from('foreign'), { address: '192.168.1.3' });
  assert.equal(f.events.filter(event => event.name === 'packet').length, 0);
  f.tcp[0].emit('connect');
  const { sessionId } = await pending;
  await tick();
  f.tcp[0].emit('data', Buffer.from([0x02]));
  const stream = Buffer.concat(f.events.filter(event => event.transport === 'tcp').map(event => Buffer.from(event.data, 'base64')));
  assert.deepEqual(stream, Buffer.from([0xdf, 0xd1, 0x01, 0x02]));
  assert.equal(f.events.some(event => event.data === encoded('foreign')), false);
  for (let i = 0; i <= LIMITS.pendingPackets; i++) {
    f.tcp[0].emit('data', Buffer.from([i]));
  }
  assert.equal(f.events.filter(event => event.state === 'error').length, 1);
  assert.ok(f.tcp[0].destroyed && f.udp[0].closed);
  await assert.rejects(f.socket.sendTCP({ sessionId, data: encoded('x') }), hasCode('STALE_SESSION'));
});

test('a UDP meter burst drops excess datagrams while TCP control stays connected and ordered', async t => {
  const f = fakeTransport(); t.after(() => f.socket.close());
  const { sessionId } = await f.socket.connect({ host: '192.168.1.2' }); await tick();
  for (let i = 0; i < LIMITS.pendingPackets * 4; i++) {
    f.udp[0].emit('message', Buffer.from([i]), { address: '192.168.1.2' });
  }
  f.tcp[0].emit('data', Buffer.from([0xdf, 0xd1, 0x12]));
  f.tcp[0].emit('data', Buffer.from([0x34, 0xde]));
  assert.equal(f.events.some(event => event.state === 'error'), false);
  assert.equal(f.tcp[0].destroyed, false);
  assert(f.events.filter(event => event.transport === 'udp').length <= LIMITS.pendingPackets / 2);
  assert.deepEqual(Buffer.concat(f.events.filter(event => event.transport === 'tcp').map(event => Buffer.from(event.data, 'base64'))), Buffer.from([0xdf, 0xd1, 0x12, 0x34, 0xde]));
  await f.socket.sendTCP({ sessionId, data: encoded('next control request') });
  await tick();
  const before = f.events.filter(event => event.transport === 'udp').length;
  f.udp[0].emit('message', Buffer.from('fresh meter'), { address: '192.168.1.2' });
  assert.equal(f.events.filter(event => event.transport === 'udp').length, before + 1);
});

test('queued control data is delivered before pending meters without changing TCP byte order', async t => {
  const events = [], releases = [];
  const f = fakeTransport({ emit(name, event) {
    events.push({ name, ...event });
    if (name === 'packet') return new Promise(resolve => releases.push(resolve));
  } }); t.after(() => f.socket.close());
  await f.socket.connect({ host: '10.0.0.1' }); await tick();
  f.udp[0].emit('message', Buffer.from('meter1'), { address: '10.0.0.1' });
  f.udp[0].emit('message', Buffer.from('meter2'), { address: '10.0.0.1' });
  f.tcp[0].emit('data', Buffer.from('control1'));
  f.tcp[0].emit('data', Buffer.from('control2'));
  for (let i = 0; i < 4; i++) { releases.shift()(); await tick(); }
  assert.deepEqual(events.filter(event => event.name === 'packet').map(event => Buffer.from(event.data, 'base64').toString()), ['meter1', 'control1', 'control2', 'meter2']);
  assert.equal(f.tcp[0].destroyed, false);
});

test('asynchronous event delivery preserves order and failure tears down without unhandled rejection', async t => {
  const events = [];
  let release;
  const f = fakeTransport({ emit(name, event) {
    events.push({ name, ...event });
    if (name === 'packet') return new Promise((resolve, reject) => { release = { resolve, reject }; });
  } });
  t.after(() => f.socket.close());
  await f.socket.connect({ host: '10.0.0.1' });
  await tick();
  f.tcp[0].emit('data', Buffer.from('first'));
  f.tcp[0].emit('data', Buffer.from('second'));
  assert.equal(events.filter(event => event.name === 'packet').length, 1);
  release.resolve();
  await tick();
  assert.deepEqual(events.filter(event => event.name === 'packet').map(event => Buffer.from(event.data, 'base64').toString()), ['first', 'second']);
  release.reject(new Error('renderer unavailable'));
  await tick();
  assert.equal(events.filter(event => event.state === 'error').length, 1);
  assert.ok(f.tcp[0].destroyed && f.udp[0].closed);
});
