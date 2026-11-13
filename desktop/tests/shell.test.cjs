'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const vm = require('node:vm');
const policy = require('../src/bridge-policy.cjs');

test('desktop protocol and IPC policy reject remote origins and traversal', () => {
  assert.equal(policy.isAppURL(policy.APP_URL), true);
  assert.equal(policy.isAppURL(policy.APP_URL + '#channel'), true);
  for (const value of ['https://app/index.html', 'file:///app/index.html', 'sculpt://evil/index.html', 'sculpt://app:123/index.html', 'sculpt://user@app/index.html', 'sculpt://app/index.html?url=evil', 'sculpt://app/other.html']) assert.equal(policy.isAppURL(value), false, value);
  const root = path.resolve('/tmp/sculpt-app');
  assert.equal(policy.assetPath('sculpt://app/editor.js', root), path.join(root, 'editor.js'));
  for (const value of ['https://example.org/code.js', 'sculpt://evil/code.js', 'sculpt://app/%2f..%2foutside', 'sculpt://app/%5c..%5coutside', 'sculpt://app/%00', 'sculpt://app/%zz', 'sculpt://app/index.html?path=../../secrets']) assert.equal(policy.assetPath(value, root), null, value);
  assert.deepEqual(policy.validateArguments('connect', { host: '192.168.1.50', requestId: 'request-1', secret: 'ignored' }), { host: '192.168.1.50', requestId: 'request-1' });
  for (const [method, value] of [['exec', {}], ['connect', { host: 'example.org', requestId: 'x' }], ['disconnect', {}], ['disconnect', { sessionId: '../id' }], ['sendTCP', { sessionId: 's', data: 'a'.repeat(1_398_105) }]]) assert.throws(() => policy.validateArguments(method, value));
});

test('preload exposes fixed calls and strips privileged event argument', async () => {
  let bridge, unload;
  const handlers = new Map(), invokes = [], removed = [];
  const ipcRenderer = {
    invoke: async (...args) => { invokes.push(args); return { ok: true }; },
    on: (name, fn) => handlers.set(name, fn),
    removeListener: (name, fn) => { removed.push([name, fn]); if (handlers.get(name) === fn) handlers.delete(name); }
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8'), {
    require: name => { assert.equal(name, 'electron'); return { contextBridge: { exposeInMainWorld(name, value) { assert.equal(name, 'SculptDesktop'); bridge = value; } }, ipcRenderer }; },
    process: { platform: 'win32' }, window: { addEventListener(name, fn) { assert.equal(name, 'unload'); unload = fn; } }, Set, Object, Error
  });
  assert.equal(bridge.platform, 'windows'); assert.equal(bridge.available, true);
  assert.equal(bridge.ipcRenderer, undefined); assert.equal(bridge.send, undefined);
  await bridge.connect({ host: '192.168.1.50', requestId: 'x' });
  assert.equal(invokes[0][0], 'sculpt-wing:connect');
  const received = [];
  const handle = await bridge.addListener('packet', (...args) => received.push(args));
  const data = { sessionId: 'x', transport: 'udp', data: 'V0lORw==' };
  handlers.get('sculpt-wing:event:packet')({ sender: 'privileged' }, data);
  assert.equal(received[0].length, 1); assert.equal(received[0][0], data);
  await handle.remove(); await handle.remove(); assert.equal(removed.length, 1);
  await assert.rejects(bridge.addListener('anything', () => {}));
  await bridge.addListener('linkState', () => {}); unload(); assert.equal(handlers.size, 0);
});

function loadMain({ singleInstance = true } = {}) {
  const windows = [], sockets = [], ipc = new Map(), protocolHandlers = new Map(), fetches = [];
  const app = Object.assign(new EventEmitter(), {
    setName(value) { this.name = value; }, setAppUserModelId(value) { this.id = value; },
    requestSingleInstanceLock: () => singleInstance,
    quit() { this.quitCalls = (this.quitCalls || 0) + 1; }, whenReady: async () => undefined
  });
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false; windows.push(this);
      this.webContents = Object.assign(new EventEmitter(), {
        mainFrame: { url: policy.APP_URL },
        isDestroyed: () => this.destroyed,
        getURL: () => this.url || policy.APP_URL,
        send: (...args) => { this.lastSend = args; },
        setWindowOpenHandler: fn => { this.openHandler = fn; }
      });
    }
    show() { this.shown = true; } focus() { this.focused = true; }
    isDestroyed() { return this.destroyed; } isMinimized() { return false; }
    destroy() { this.destroyed = true; this.emit('closed'); }
    async loadURL(value) { this.url = value; }
  }
  class Socket {
    constructor(options) { this.emitEvent = options.emit; this.suspended = 0; this.closed = 0; sockets.push(this); }
    connect(options) { this.connection = options; return Promise.resolve({ sessionId: 'one', meterPort: 12345 }); }
    disconnect(options) { this.disconnection = options; return Promise.resolve(); }
    sendTCP(options) { this.tcp = options; return Promise.resolve(); }
    sendUDP(options) { this.udp = options; return Promise.resolve(); }
    suspend() { this.suspended++; } close() { this.closed++; }
  }
  const permissions = {}, monitor = new EventEmitter(), protocol = {
    registerSchemesAsPrivileged(value) { this.schemes = value; },
    handle: (name, fn) => protocolHandlers.set(name, fn)
  };
  const electron = {
    app, BrowserWindow: FakeWindow, Menu: { buildFromTemplate: value => value, setApplicationMenu() {} },
    ipcMain: { handle: (name, fn) => ipc.set(name, fn) }, protocol, powerMonitor: monitor,
    net: { fetch: async url => { fetches.push(url); return new Response('local asset', { headers: { 'Content-Type': 'text/javascript' } }); } },
    session: { defaultSession: {
      setPermissionRequestHandler: fn => { permissions.request = fn; }, setPermissionCheckHandler: fn => { permissions.check = fn; },
      webRequest: { onBeforeRequest: (_filter, fn) => { permissions.network = fn; } }
    } }
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8'), {
    require: name => name === 'electron' ? electron : name === './wing-socket.cjs' ? { WingSocket: Socket } : name === './bridge-policy.cjs' ? policy : require(name),
    __dirname: path.resolve(__dirname, '../src'), process: { platform: 'darwin' }, Promise, URL, Response, Headers, console
  });
  return { app, windows, sockets, ipc, monitor, protocol, protocolHandlers, permissions, fetches };
}

test('desktop shell isolates renderer, checks sender, closes stale sessions and blocks navigation', async () => {
  const env = loadMain(); await Promise.resolve();
  const win = env.windows[0], socket = env.sockets[0];
  assert.equal(win.url, policy.APP_URL);
  assert.equal(win.options.webPreferences.contextIsolation, true);
  assert.equal(win.options.webPreferences.sandbox, true);
  assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.equal(win.openHandler().action, 'deny');
  const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  await env.ipc.get('sculpt-wing:connect')(event, { host: '192.168.1.50', requestId: 'test' });
  assert.equal(socket.connection.host, '192.168.1.50');
  await assert.rejects(env.ipc.get('sculpt-wing:connect')({ ...event, senderFrame: { url: policy.APP_URL } }, { host: '192.168.1.50', requestId: 'test' }));
  await assert.rejects(env.ipc.get('sculpt-wing:connect')({ ...event, sender: {} }, { host: '192.168.1.50', requestId: 'test' }));
  win.webContents.mainFrame.url = 'https://example.org';
  await assert.rejects(env.ipc.get('sculpt-wing:connect')(event, { host: '192.168.1.50', requestId: 'test' }));
  win.webContents.mainFrame.url = policy.APP_URL;
  let blocked = 0; win.webContents.emit('will-navigate', { preventDefault: () => blocked++ }); assert.equal(blocked, 1);
  win.webContents.emit('did-start-navigation', {}, policy.APP_URL, false, true); assert.equal(socket.suspended, 1);
  env.monitor.emit('suspend'); assert.equal(socket.suspended, 2);
  socket.emitEvent('packet', { data: 'AA==' }); assert.equal(win.lastSend[0], 'sculpt-wing:event:packet');
  socket.emitEvent('unsafe', {}); assert.equal(win.lastSend[0], 'sculpt-wing:event:packet');
  assert.equal(env.permissions.check(), false);
  env.permissions.network({}, result => assert.equal(result.cancel, true));
  const protocol = env.protocolHandlers.get('sculpt');
  const response = await protocol({ url: 'sculpt://app/editor.js', method: 'GET' });
  assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Security-Policy'), policy.CSP);
  assert.equal(env.fetches[0].startsWith('file:'), true);
  assert.equal((await protocol({ url: 'sculpt://evil/editor.js', method: 'GET' })).status, 404);
  win.destroy(); assert.equal(socket.closed, 1);
  env.app.emit('second-instance'); assert.equal(env.windows.length, 2); assert.notEqual(env.sockets[1], socket);
  env.app.emit('activate'); assert.equal(env.windows.length, 2, 'activate reuses the existing window');
});

test('second app instance exits before opening a window', async () => {
  const env = loadMain({ singleInstance: false }); await Promise.resolve();
  assert.equal(env.app.quitCalls, 1); assert.equal(env.windows.length, 0); assert.equal(env.ipc.size, 0);
});
