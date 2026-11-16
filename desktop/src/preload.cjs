'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const events = new Set(['packet', 'linkState', 'history', 'mixerView', 'analysis', 'audioState', 'audioError', 'audioScanProgress']);
const registrations = new Set();
const call = (method, options) => ipcRenderer.invoke(`sculpt-wing:${method}`, options);

contextBridge.exposeInMainWorld('SculptDesktop', Object.freeze({
  available: true,
  platform: process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
  version: '0.7.4',
  textHistory: direction => {
    if (!['undo', 'redo'].includes(direction)) return Promise.reject(new Error('Operazione di modifica non valida.'));
    return call('textHistory', { direction });
  },
  connect: options => call('connect', options),
  disconnect: options => call('disconnect', options),
  sendTCP: options => call('sendTCP', options),
  sendUDP: options => call('sendUDP', options),
  sendOSC: options => call('sendOSC', options),
  audioRequest: request => call('audioRequest', request),
  async addListener(name, callback) {
    if (!events.has(name) || typeof callback !== 'function' || registrations.size >= 64) throw new Error('Listener desktop non valido.');
    const channel = `sculpt-wing:event:${name}`;
    // The privileged Electron event must never cross the context bridge.
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    const registration = { channel, listener };
    registrations.add(registration);
    return {
      async remove() {
        if (!registrations.delete(registration)) return;
        ipcRenderer.removeListener(channel, listener);
      }
    };
  }
}));

window.addEventListener('unload', () => {
  for (const { channel, listener } of registrations) ipcRenderer.removeListener(channel, listener);
  registrations.clear();
}, { once: true });
