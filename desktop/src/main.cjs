'use strict';

const { app, BrowserWindow, Menu, ipcMain, net, protocol, powerMonitor, session, systemPreferences } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { WingSocket } = require('./wing-socket.cjs');
const { OSCSender } = require('./osc-sender.cjs');
const { AudioHost, AUDIO_EVENTS, validateAudioRequest, audioHostPath } = require('./audio-host.cjs');
const oscProtocol = require('../app/osc.js');
const { APP_URL, CSP, METHODS, EVENTS, isAppURL, assetPath, validateArguments } = require('./bridge-policy.cjs');

app.setName('Sculpt Wing');
app.setAppUserModelId('it.sculpt.wing');
protocol.registerSchemesAsPrivileged([{ scheme: 'sculpt', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let current = null;
let initialized = false;
let quitting = false;
let audioPermissionRequest = null;
const audioHosts = new Set();
const stop = transport => { try { Promise.resolve(transport.close()).catch(() => undefined); } catch {} };
const suspend = transport => { try { Promise.resolve(transport.suspend()).catch(() => undefined); } catch {} };
const closeAudio = audio => {
  const closing = audio.close();
  void Promise.resolve(closing).finally(() => audioHosts.delete(audio)).catch(() => undefined);
  return closing;
};

async function requireAudioInputPermission() {
  if (process.platform !== 'darwin' || systemPreferences.getMediaAccessStatus('microphone') === 'granted') return;
  if (!audioPermissionRequest) audioPermissionRequest = systemPreferences.askForMediaAccess('microphone').finally(() => { audioPermissionRequest = null; });
  if (!await audioPermissionRequest) throw new Error('Consenti a Sculpt Wing l’accesso al microfono in Impostazioni di Sistema → Privacy e sicurezza → Microfono, poi riapri l’app. Il permesso serve a ricevere l’audio USB della WING.');
}

function createWindow() {
  if (current && !current.window.isDestroyed()) { current.window.show(); current.window.focus(); return; }
  const win = new BrowserWindow({
    title: 'Sculpt Wing', width: 1360, height: 900, minWidth: 780, minHeight: 520,
    backgroundColor: '#121214', show: false, autoHideMenuBar: process.platform !== 'darwin',
    icon: path.join(__dirname, '../app/icon-red-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true,
      nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
      webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
      spellcheck: false, safeDialogs: true
    }
  });
  const transport = new WingSocket({ emit(name, event) {
    if (!EVENTS.includes(name) || current?.window !== win || win.isDestroyed() || win.webContents.isDestroyed() || !isAppURL(win.webContents.getURL())) return;
    win.webContents.send(`sculpt-wing:event:${name}`, event);
  } });
  const osc = new OSCSender({ protocol: oscProtocol });
  const audio = new AudioHost({
    executablePath: audioHostPath({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, projectRoot: path.resolve(__dirname, '../..') }),
    dataDirectory: path.join(app.getPath('userData'), 'audio-host'),
    sessionFile: path.join(app.getPath('userData'), 'audio-rack-session.json'),
    emit(name, data) {
      if (!Object.values(AUDIO_EVENTS).includes(name) || current?.window !== win || win.isDestroyed() || win.webContents.isDestroyed() || !isAppURL(win.webContents.getURL())) return;
      win.webContents.send(`sculpt-wing:event:${name}`, data);
    }
  });
  audioHosts.add(audio);
  current = { window: win, transport, osc, audio };
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { stop(transport); osc.close(); closeAudio(audio); if (current?.window === win) current = null; });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-redirect', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.on('did-start-navigation', (_event, url, inPlace, mainFrame) => {
    // A download or a blocked external link is not a renderer replacement.
    // Exporting a scene must not tear down the console's control session.
    if (mainFrame && !inPlace && isAppURL(url)) { suspend(transport); osc.suspend(); }
  });
  win.webContents.on('render-process-gone', () => { suspend(transport); osc.suspend(); });
  win.webContents.on('destroyed', () => { stop(transport); osc.close(); });
  void win.loadURL(APP_URL).catch(error => { console.error('Impossibile aprire Sculpt Wing:', error.message); win.destroy(); });
}

function installIPC() {
  ipcMain.handle('sculpt-wing:audioRequest', async (event, input) => {
    const active = current;
    if (!active || active.window.isDestroyed() || event.sender !== active.window.webContents ||
      event.senderFrame !== active.window.webContents.mainFrame || !isAppURL(event.senderFrame?.url) ||
      !isAppURL(active.window.webContents.getURL())) throw new Error('Origine audio desktop non autorizzata.');
    const request = validateAudioRequest(input);
    if (['configureAudio', 'startAudio'].includes(request.method)) await requireAudioInputPermission();
    const oldHosts = [...audioHosts].filter(audio => audio !== active.audio);
    if (oldHosts.length) await Promise.allSettled(oldHosts.map(closeAudio));
    if (current !== active || active.window.isDestroyed()) throw new Error('Sessione audio desktop terminata.');
    return active.audio.request(request);
  });
  ipcMain.handle('sculpt-wing:textHistory', (event, input) => {
    const active = current;
    if (!active || active.window.isDestroyed() || event.sender !== active.window.webContents ||
      event.senderFrame !== active.window.webContents.mainFrame || !isAppURL(event.senderFrame?.url) ||
      !isAppURL(active.window.webContents.getURL()) || !['undo', 'redo'].includes(input?.direction)) {
      throw new Error('Operazione di modifica non autorizzata.');
    }
    active.window.webContents[input.direction]();
    return { ok: true };
  });
  for (const method of METHODS) {
    ipcMain.handle(`sculpt-wing:${method}`, async (event, input) => {
      const active = current;
      if (!active || active.window.isDestroyed() || event.sender !== active.window.webContents ||
        event.senderFrame !== active.window.webContents.mainFrame || !isAppURL(event.senderFrame?.url) ||
        !isAppURL(active.window.webContents.getURL())) throw new Error('Origine desktop non autorizzata.');
      const options = validateArguments(method, input);
      return method === 'sendOSC' ? active.osc.send(options) : active.transport[method](options);
    });
  }
}

function installMenu() {
  const menus = [];
  if (process.platform === 'darwin') menus.push({ role: 'appMenu' });
  menus.push({ label: 'File', submenu: [{ role: process.platform === 'darwin' ? 'close' : 'quit' }] });
  const historyAction = direction => () => {
    const win = current?.window;
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed() && isAppURL(win.webContents.getURL())) {
      win.webContents.send('sculpt-wing:event:history', direction);
    }
  };
  menus.push({ label: 'Modifica', submenu: [
    { label: 'Annulla', accelerator: 'CmdOrCtrl+Z', click: historyAction('undo') },
    { label: 'Ripristina', accelerator: 'CmdOrCtrl+Shift+Z', click: historyAction('redo') },
    { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
  ] });
  menus.push({ label: 'Vista', submenu: [
    { label: 'Compact / Extended', accelerator: 'CmdOrCtrl+=', click: () => {
      const win = current?.window;
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed() && isAppURL(win.webContents.getURL())) win.webContents.send('sculpt-wing:event:mixerView', 'toggle');
    } },
    { type: 'separator' }, { role: 'resetZoom' },
    { role: 'zoomIn', accelerator: 'CmdOrCtrl+Shift+Plus' }, { role: 'zoomOut' },
    { type: 'separator' }, { role: 'togglefullscreen' }
  ] });
  menus.push({ role: 'windowMenu' });
  Menu.setApplicationMenu(Menu.buildFromTemplate(menus));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!current) { if (initialized) createWindow(); return; }
    if (current.window.isMinimized()) current.window.restore();
    current.window.show(); current.window.focus();
  });
  app.on('activate', () => { if (initialized) createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', event => {
    if (current) { stop(current.transport); current.osc.close(); }
    if (quitting) return;
    const hosts = [...audioHosts];
    if (hosts.some(audio => audio.hasProcess)) {
      event.preventDefault();
      quitting = true;
      void Promise.allSettled(hosts.map(closeAudio)).then(() => app.quit());
    } else hosts.forEach(closeAudio);
  });
  app.whenReady().then(() => {
    const appRoot = path.join(__dirname, '../app');
    protocol.handle('sculpt', async request => {
      const file = request.method === 'GET' ? assetPath(request.url, appRoot) : null;
      if (!file) return new Response('Not found', { status: 404 });
      try {
        const response = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', CSP);
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(response.body, { status: response.status, headers });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    // Renderer network access is unnecessary: all console traffic uses the narrow native bridge.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] }, (_details, callback) => callback({ cancel: true }));
    powerMonitor.on('suspend', () => { if (current) { suspend(current.transport); current.osc.suspend(); void current.audio.suspend(); } });
    powerMonitor.on('lock-screen', () => { if (current) { suspend(current.transport); current.osc.suspend(); } });
    installIPC(); installMenu(); initialized = true; createWindow();
  }).catch(error => { console.error('Avvio Sculpt Wing non riuscito:', error.message); app.quit(); });
}
