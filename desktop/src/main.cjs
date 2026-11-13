'use strict';

const { app, BrowserWindow, Menu, ipcMain, net, protocol, powerMonitor, session } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { WingSocket } = require('./wing-socket.cjs');
const { APP_URL, CSP, METHODS, EVENTS, isAppURL, assetPath, validateArguments } = require('./bridge-policy.cjs');

app.setName('Sculpt Wing');
app.setAppUserModelId('it.sculpt.wing');
protocol.registerSchemesAsPrivileged([{ scheme: 'sculpt', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let current = null;
let initialized = false;
const stop = transport => { try { Promise.resolve(transport.close()).catch(() => undefined); } catch {} };
const suspend = transport => { try { Promise.resolve(transport.suspend()).catch(() => undefined); } catch {} };

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
  current = { window: win, transport };
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { stop(transport); if (current?.window === win) current = null; });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-redirect', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) suspend(transport); });
  win.webContents.on('render-process-gone', () => suspend(transport));
  win.webContents.on('destroyed', () => stop(transport));
  void win.loadURL(APP_URL).catch(error => { console.error('Impossibile aprire Sculpt Wing:', error.message); win.destroy(); });
}

function installIPC() {
  for (const method of METHODS) {
    ipcMain.handle(`sculpt-wing:${method}`, async (event, input) => {
      const active = current;
      if (!active || active.window.isDestroyed() || event.sender !== active.window.webContents ||
        event.senderFrame !== active.window.webContents.mainFrame || !isAppURL(event.senderFrame?.url) ||
        !isAppURL(active.window.webContents.getURL())) throw new Error('Origine desktop non autorizzata.');
      return active.transport[method](validateArguments(method, input));
    });
  }
}

function installMenu() {
  const menus = [];
  if (process.platform === 'darwin') menus.push({ role: 'appMenu' });
  menus.push({ label: 'File', submenu: [{ role: process.platform === 'darwin' ? 'close' : 'quit' }] });
  menus.push({ label: 'Modifica', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] });
  menus.push({ label: 'Vista', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] });
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
  app.on('before-quit', () => { if (current) stop(current.transport); });
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
    powerMonitor.on('suspend', () => { if (current) suspend(current.transport); });
    powerMonitor.on('lock-screen', () => { if (current) suspend(current.transport); });
    installIPC(); installMenu(); initialized = true; createWindow();
  }).catch(error => { console.error('Avvio Sculpt Wing non riuscito:', error.message); app.quit(); });
}
