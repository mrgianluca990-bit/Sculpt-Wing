'use strict';

const { spawn: spawnProcess } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const NATIVE_METHODS = Object.freeze(['status', 'devices', 'scanPlugins', 'configureAudio', 'startAudio', 'stopAudio', 'setRack', 'removeRack', 'openEditor', 'closeEditors', 'getState', 'restoreState']);
const AUDIO_METHODS = Object.freeze([...NATIVE_METHODS, 'loadSession', 'saveSession']);
const AUDIO_EVENTS = Object.freeze({ state: 'audioState', error: 'audioError', scanProgress: 'audioScanProgress' });
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
const MAX_SLOT_STATE_BYTES = 8 * 1024 * 1024;
const MAX_PENDING = 64;
const RECOVERY_METHODS = new Set(['devices', 'configureAudio', 'scanPlugins']);
const SAVE_AFTER = new Set(['configureAudio', 'setRack', 'removeRack', 'stopAudio', 'closeEditors', 'restoreState']);

function failure(message, code = 'AUDIO_HOST_ERROR') {
  return Object.assign(new Error(message), { code });
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw failure('Parametri del motore audio non validi.', 'AUDIO_INVALID_REQUEST');
}

function text(value, limit, empty = false) {
  if (typeof value !== 'string' || value.length > limit || (!empty && !value.trim()) || value.includes('\0')) throw failure('Testo del rack audio non valido.', 'AUDIO_INVALID_REQUEST');
  return value;
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw failure('Identificativo rack non valido.', 'AUDIO_INVALID_REQUEST');
  return value;
}

function audioConfiguration(value, allowEmpty = false) {
  keys(value, ['inputDevice', 'outputDevice', 'sampleRate', 'bufferSize']);
  const inputDevice = text(value.inputDevice, 1024, allowEmpty);
  const outputDevice = text(value.outputDevice, 1024, allowEmpty);
  const sampleRate = value.sampleRate === undefined ? 48000 : value.sampleRate;
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000 || !Number.isInteger(value.bufferSize) || value.bufferSize < 16 || value.bufferSize > 8192) throw failure('Frequenza o buffer audio non validi.', 'AUDIO_INVALID_REQUEST');
  return { inputDevice, outputDevice, sampleRate, bufferSize: value.bufferSize };
}

function channels(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2 || value.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 47) || new Set(value).size !== value.length) throw failure('Canali USB non validi: scegliere uno o due canali distinti fra 1 e 48.', 'AUDIO_INVALID_REQUEST');
  return [...value];
}

function placement(value) {
  if (value === undefined || value === null) return null;
  if (value !== 'pre' && value !== 'insert1' && value !== 'insert2') throw failure('Posizione VST non valida: scegliere PRE, Insert 1 o Insert 2.', 'AUDIO_INVALID_REQUEST');
  return value;
}

function rack(value, restoring = false) {
  if (!object(value)) throw failure('Rack audio non valido.', 'AUDIO_INVALID_REQUEST');
  if (!restoring) keys(value, ['id', 'name', 'placement', 'inputChannels', 'outputChannels', 'enabled', 'slots', 'latencySamples', 'missing']);
  if (typeof value.enabled !== 'boolean' || !Array.isArray(value.slots) || value.slots.length > 8) throw failure('Configurazione rack non valida.', 'AUDIO_INVALID_REQUEST');
  return {
    id: identifier(value.id),
    placement: placement(value.placement),
    ...(value.name === undefined ? {} : { name: text(value.name, 160, true) }),
    inputChannels: channels(value.inputChannels), outputChannels: channels(value.outputChannels), enabled: value.enabled,
    slots: value.slots.map(slot => {
      if (!object(slot)) throw failure('Slot VST3 non valido.', 'AUDIO_INVALID_REQUEST');
      if (!restoring) keys(slot, ['pluginId', 'bypass', 'state', 'name', 'missing', 'latencySamples', 'error']);
      if (slot.pluginId !== null && (typeof slot.pluginId !== 'string' || !/^vst3-[0-9a-f]{16}$/i.test(slot.pluginId))) throw failure('Plugin VST3 non valido: usare il catalogo della scansione.', 'AUDIO_INVALID_REQUEST');
      if (typeof slot.bypass !== 'boolean') throw failure('Bypass VST3 non valido.', 'AUDIO_INVALID_REQUEST');
      const result = { pluginId: slot.pluginId, bypass: slot.bypass };
      if (slot.name !== undefined) result.name = text(slot.name, 512, true);
      if (slot.state !== undefined) {
        if (typeof slot.state !== 'string' || slot.state.length > MAX_SLOT_STATE_BYTES || slot.state.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(slot.state)) throw failure('Stato VST3 non valido o troppo grande (massimo 8 MiB per slot).', 'AUDIO_INVALID_REQUEST');
        result.state = slot.state;
      }
      return result;
    })
  };
}

function sessionState(value) {
  if (!object(value) || !Array.isArray(value.racks) || value.racks.length > 16) throw failure('Sessione rack non valida.', 'AUDIO_INVALID_REQUEST');
  const racks = value.racks.map(item => rack(item, true));
  if (new Set(racks.map(item => item.id)).size !== racks.length) throw failure('Identificativi rack duplicati.', 'AUDIO_INVALID_REQUEST');
  // Runtime flags, meters, file paths and scanned plugin metadata never become restore commands.
  if (!object(value.audio)) throw failure('Configurazione audio della sessione non valida.', 'AUDIO_INVALID_REQUEST');
  const { inputDevice, outputDevice, sampleRate, bufferSize } = value.audio;
  return { audio: audioConfiguration({ inputDevice, outputDevice, sampleRate, bufferSize }, true), racks };
}

function boundedJSON(value, maximum = MAX_MESSAGE_BYTES) {
  // Check the aggregate before allocating a full JSON string. Many valid 8 MiB plugin blobs
  // can otherwise produce a gigabyte-sized serialization just to discover it exceeds 64 MiB.
  let size = 0;
  const measure = item => {
    if (typeof item === 'string') size += Buffer.byteLength(JSON.stringify(item), 'utf8');
    else if (item === null || typeof item === 'boolean' || typeof item === 'number') size += String(item).length;
    else if (Array.isArray(item)) {
      size += 2 + Math.max(0, item.length - 1);
      for (const child of item) measure(child);
    } else if (object(item)) {
      const entries = Object.entries(item).filter(([, child]) => child !== undefined);
      size += 2 + Math.max(0, entries.length - 1);
      for (const [key, child] of entries) { size += Buffer.byteLength(JSON.stringify(key), 'utf8') + 1; measure(child); }
    } else throw failure('Richiesta audio non serializzabile.', 'AUDIO_INVALID_REQUEST');
    if (size > maximum) throw failure('Sessione audio troppo grande (massimo 64 MiB).', 'AUDIO_MESSAGE_TOO_LARGE');
  };
  measure(value);
  let json;
  try { json = JSON.stringify(value); } catch { throw failure('Richiesta audio non serializzabile.', 'AUDIO_INVALID_REQUEST'); }
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > maximum) throw failure('Sessione audio troppo grande (massimo 64 MiB).', 'AUDIO_MESSAGE_TOO_LARGE');
  return json;
}

function validateAudioRequest(value) {
  keys(value, ['method', 'params']);
  if (!AUDIO_METHODS.includes(value.method)) throw failure('Operazione audio non autorizzata.', 'AUDIO_INVALID_REQUEST');
  const params = value.params === undefined ? {} : value.params;
  let result;
  switch (value.method) {
    case 'configureAudio': result = audioConfiguration(params); break;
    case 'setRack': result = rack(params); break;
    case 'removeRack': keys(params, ['id']); result = { id: identifier(params.id) }; break;
    case 'openEditor':
      keys(params, ['rackId', 'slot']);
      if (!Number.isInteger(params.slot) || params.slot < 0 || params.slot > 7) throw failure('Slot editor VST3 non valido.', 'AUDIO_INVALID_REQUEST');
      result = { rackId: identifier(params.rackId), slot: params.slot }; break;
    case 'restoreState': keys(params, ['state']); result = { state: sessionState(params.state) }; break;
    default: keys(params, []); result = {};
  }
  boundedJSON(result);
  return { method: value.method, params: result };
}

function audioHostPath({ isPackaged, resourcesPath, projectRoot }) {
  const root = isPackaged ? path.join(resourcesPath, 'audio-host') : path.join(projectRoot, 'audio-host', 'build', 'SculptWingAudio_artefacts', 'Release');
  return path.join(root, 'SculptWingAudio.app', 'Contents', 'MacOS', 'SculptWingAudio');
}

class AudioHost {
  constructor({ executablePath, dataDirectory, sessionFile, emit = () => {}, spawn = spawnProcess, requestTimeoutMs = 25000, scanTimeoutMs = 120000, shutdownTimeoutMs = 3000, maxPending = MAX_PENDING, maxMessageBytes = MAX_MESSAGE_BYTES } = {}) {
    this.executablePath = executablePath;
    this.dataDirectory = dataDirectory;
    this.sessionFile = sessionFile;
    this.emit = emit;
    this.spawn = spawn;
    this.requestTimeoutMs = requestTimeoutMs;
    this.scanTimeoutMs = scanTimeoutMs;
    this.shutdownTimeoutMs = shutdownTimeoutMs;
    this.maxPending = maxPending;
    this.maxMessageBytes = maxMessageBytes;
    this.pending = new Map();
    this.pendingBytes = 0;
    this.child = null;
    this.nextId = 0;
    this.fault = null;
    this.closing = false;
    this.closed = false;
    this.fragments = [];
    this.fragmentBytes = 0;
    this.stderr = '';
    this.saveTimer = null;
    this.saveInFlight = null;
    this.writeQueue = Promise.resolve();
    this.writeSequence = 0;
    this.storageId = randomBytes(8).toString('hex');
    this.pendingDiskSave = null;
    this.diskWriterRunning = false;
  }

  get hasProcess() { return this.child !== null; }

  _event(name, data) {
    try { this.emit(name, data); } catch { /* A renderer cannot interrupt the audio process. */ }
  }

  _ensureChild(method) {
    if (this.closed || this.closing) throw failure('Il motore audio è in chiusura.', 'AUDIO_HOST_CLOSED');
    if (this.child) return;
    if (this.fault && !RECOVERY_METHODS.has(method)) throw failure(`${this.fault.message} Usa Riconnetti motore per riaprire il collegamento; l’audio resterà fermo.`, this.fault.code);
    this.fragments = []; this.fragmentBytes = 0; this.stderr = ''; this.fault = null;
    let child;
    try {
      const args = ['--stdio', ...(this.dataDirectory ? ['--data-dir', this.dataDirectory] : [])];
      child = this.spawn(this.executablePath, args, { cwd: path.dirname(this.executablePath), shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      this.fault = failure(`Impossibile aprire il motore audio: ${error.message}`, 'AUDIO_HOST_UNAVAILABLE');
      this._event('audioError', { code: this.fault.code, message: this.fault.message, fatal: true });
      throw this.fault;
    }
    this.child = child;
    child.stdout.on('data', chunk => { if (this.child === child) this._read(chunk); });
    child.stderr.on('data', chunk => { if (this.child === child) this.stderr = (this.stderr + chunk.toString('utf8')).slice(-4096); });
    child.on('error', error => this._crash(child, failure(`Impossibile aprire il motore audio: ${error.message}`, 'AUDIO_HOST_UNAVAILABLE')));
    child.stdin.on('error', error => this._crash(child, failure(`Collegamento al motore audio interrotto: ${error.message}`, 'AUDIO_HOST_PIPE_ERROR')));
    child.stdout.on('error', error => this._crash(child, failure(`Risposta del motore audio interrotta: ${error.message}`, 'AUDIO_HOST_PIPE_ERROR')));
    child.stderr.on('error', () => {});
    child.on('exit', (code, signal) => this._crash(child, failure(`Il motore audio si è chiuso${signal ? ` (${signal})` : code !== null ? ` (codice ${code})` : ''}.`, 'AUDIO_HOST_EXITED')));
  }

  _crash(child, error) {
    if (this.child !== child) return;
    this.child = null;
    this.fragments = []; this.fragmentBytes = 0;
    clearTimeout(this.saveTimer); this.saveTimer = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.pendingBytes = 0;
    if (error.code !== 'AUDIO_HOST_EXITED') { try { child.kill('SIGKILL'); } catch {} }
    if (!this.closing && !this.closed) {
      this.fault = error;
      this._event('audioError', { code: error.code, message: error.message, running: false, fatal: true });
    }
    if (this.finishClose) this.finishClose();
  }

  _protocolFailure(message) {
    const child = this.child;
    if (!child) return;
    this._crash(child, failure(message, 'AUDIO_HOST_PROTOCOL_ERROR'));
  }

  _read(chunk) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    let start = 0;
    while (start < bytes.length && this.child) {
      const newline = bytes.indexOf(10, start);
      const end = newline < 0 ? bytes.length : newline;
      const part = bytes.subarray(start, end);
      if (this.fragmentBytes + part.length > this.maxMessageBytes) { this._protocolFailure('Risposta del motore audio troppo grande.'); return; }
      if (part.length) { this.fragments.push(part); this.fragmentBytes += part.length; }
      if (newline < 0) return;
      const line = Buffer.concat(this.fragments, this.fragmentBytes).toString('utf8').trim();
      this.fragments = []; this.fragmentBytes = 0;
      start = newline + 1;
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { this._protocolFailure('Il motore audio ha inviato una risposta non valida.'); return; }
      if (!object(message)) { this._protocolFailure('Risposta del motore audio non valida.'); return; }
      if (typeof message.event === 'string') {
        const name = Object.hasOwn(AUDIO_EVENTS, message.event) ? AUDIO_EVENTS[message.event] : null;
        if (name) {
          const data = message.event === 'error' ? { ...(object(message.data) ? message.data : { message: String(message.data ?? 'Errore del motore audio.') }), fatal: object(message.data) && message.data.fatal === true } : message.data;
          this._event(name, data);
          if (message.event === 'state' && object(message.data) && message.data.partial === false) this._scheduleSave();
        }
        continue;
      }
      if (!Number.isSafeInteger(message.id) || typeof message.ok !== 'boolean') { this._protocolFailure('Identificativo della risposta audio non valido.'); return; }
      const pending = this.pending.get(message.id);
      if (!pending) continue; // A late response to a timed-out request cannot resolve another command.
      this.pending.delete(message.id); this.pendingBytes -= pending.bytes; clearTimeout(pending.timer);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(failure(typeof message.error === 'string' ? message.error.slice(0,4096) : 'Operazione audio non riuscita.', 'AUDIO_COMMAND_FAILED'));
    }
  }

  _send(method, params, timeoutMs) {
    const child = this.child;
    if (!child) return Promise.reject(this.fault || failure('Motore audio non collegato.', 'AUDIO_HOST_UNAVAILABLE'));
    if (this.pending.size >= this.maxPending) return Promise.reject(failure('Troppe operazioni audio in attesa. Attendi il completamento.', 'AUDIO_TOO_MANY_REQUESTS'));
    const id = ++this.nextId;
    let line;
    try { line = boundedJSON({ id, method, params }, this.maxMessageBytes) + '\n'; } catch (error) { return Promise.reject(error); }
    const bytes = Buffer.byteLength(line, 'utf8');
    if (this.pendingBytes + bytes > this.maxMessageBytes || (child.stdin.writableLength || 0) + bytes > this.maxMessageBytes) return Promise.reject(failure('Il motore audio sta già ricevendo una sessione di grandi dimensioni. Attendi il completamento.', 'AUDIO_TOO_MANY_REQUESTS'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingBytes -= this.pending.get(id)?.bytes || 0;
        this.pending.delete(id);
        reject(failure(`Il motore audio non ha risposto a ${method}. Il comando non viene ripetuto automaticamente.`, 'AUDIO_REQUEST_TIMEOUT'));
      }, timeoutMs ?? (method === 'scanPlugins' ? this.scanTimeoutMs : this.requestTimeoutMs));
      this.pendingBytes += bytes;
      this.pending.set(id, { resolve, reject, timer, bytes });
      try {
        child.stdin.write(line, 'utf8', error => { if (error) this._crash(child, failure(`Invio al motore audio non riuscito: ${error.message}`, 'AUDIO_HOST_PIPE_ERROR')); });
      } catch (error) { this._crash(child, failure(`Invio al motore audio non riuscito: ${error.message}`, 'AUDIO_HOST_PIPE_ERROR')); }
    });
  }

  async request(input) {
    const { method, params } = validateAudioRequest(input);
    if (this.closed || this.closing) throw failure('Il motore audio è in chiusura.', 'AUDIO_HOST_CLOSED');
    if (method === 'loadSession') return this._loadSession();
    this._ensureChild(method);
    if (method === 'saveSession') { await this._saveNow(); return { saved: true }; }
    const result = await this._send(method, params);
    if (method === 'getState') await this._persist(result);
    else if (SAVE_AFTER.has(method)) this._scheduleSave();
    return result;
  }

  async _loadSession() {
    if (!this.sessionFile) return { loaded: false };
    let file;
    try { file = await fs.open(this.sessionFile, 'r'); }
    catch (error) { if (error.code === 'ENOENT') return { loaded: false }; throw failure(`Impossibile leggere la sessione audio: ${error.message}`, 'AUDIO_SESSION_LOAD_FAILED'); }
    let saved;
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > MAX_MESSAGE_BYTES) throw failure('File della sessione audio troppo grande o non valido.', 'AUDIO_SESSION_LOAD_FAILED');
      saved = JSON.parse(await file.readFile('utf8'));
    } catch (error) { throw failure(`Sessione audio non leggibile: ${error.message}`, 'AUDIO_SESSION_LOAD_FAILED'); }
    finally { await file.close(); }
    if (!object(saved) || saved.version !== 1) throw failure('Versione della sessione audio non riconosciuta.', 'AUDIO_SESSION_LOAD_FAILED');
    const params = { state: sessionState(saved.state) };
    boundedJSON(params);
    this._ensureChild('loadSession');
    // Native restore rejects a running engine and never starts audio or changes to a fallback device.
    const state = await this._send('restoreState', params);
    return { loaded: true, state };
  }

  _scheduleSave() {
    if (!this.sessionFile || this.closed || this.closing || this.fault || !this.child || this.saveInFlight) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this._saveNow().catch(error => this._event('audioError', { code: 'AUDIO_SESSION_SAVE_FAILED', message: `Impossibile salvare la sessione audio: ${error.message}`, fatal: false }));
    }, 350);
    this.saveTimer.unref?.();
  }

  _saveNow() {
    if (!this.sessionFile) return Promise.resolve();
    clearTimeout(this.saveTimer); this.saveTimer = null;
    if (this.saveInFlight) return this.saveInFlight;
    this.saveInFlight = this._send('getState', {}).then(state => this._persist(state)).finally(() => { this.saveInFlight = null; });
    return this.saveInFlight;
  }

  _persist(value) {
    if (!this.sessionFile) return Promise.resolve();
    let json;
    try { json = boundedJSON({ version: 1, state: sessionState(value) }); }
    catch (error) { return Promise.reject(error); }
    // At most one write and one latest snapshot are held. Fast UI edits cannot queue unbounded plugin state copies.
    const result = new Promise((resolve, reject) => {
      const waiters = this.pendingDiskSave?.waiters || [];
      waiters.push({ resolve, reject });
      this.pendingDiskSave = { json, waiters };
    });
    if (!this.diskWriterRunning) {
      this.diskWriterRunning = true;
      this.writeQueue = (async () => {
        while (this.pendingDiskSave) {
          const saved = this.pendingDiskSave; this.pendingDiskSave = null;
          const temporary = `${this.sessionFile}.${this.storageId}.${++this.writeSequence}.tmp`;
          try {
            await fs.mkdir(path.dirname(this.sessionFile), { recursive: true, mode: 0o700 });
            await fs.writeFile(temporary, saved.json, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
            await fs.rename(temporary, this.sessionFile);
            for (const waiter of saved.waiters) waiter.resolve();
          } catch (error) { for (const waiter of saved.waiters) waiter.reject(error); }
          finally { await fs.unlink(temporary).catch(() => undefined); }
        }
        this.diskWriterRunning = false;
      })();
    }
    return result;
  }

  suspend() {
    if (!this.child || this.closing || this.closed) return Promise.resolve();
    return this._send('stopAudio', {}).then(result => { this._scheduleSave(); return result; }).catch(error => this._event('audioError', { code: error.code, message: error.message, fatal: false }));
  }

  close() {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    clearTimeout(this.saveTimer); this.saveTimer = null;
    if (!this.child) { this.closed = true; this.closePromise = this.writeQueue; return this.closePromise; }
    const child = this.child;
    this.closePromise = new Promise(resolve => {
      let finished = false;
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
        this._crash(child, failure('Il motore audio è stato chiuso.', 'AUDIO_HOST_CLOSED'));
        finish();
      }, this.shutdownTimeoutMs);
      const finish = () => {
        if (finished) return;
        finished = true; clearTimeout(timer); this.closed = true; this.finishClose = null;
        resolve();
      };
      this.finishClose = finish;
      void (async () => {
        try {
          await this._send('stopAudio', {}, Math.min(1000, this.shutdownTimeoutMs));
          if (this.sessionFile && this.child === child) {
            const state = await this._send('getState', {}, Math.min(1000, this.shutdownTimeoutMs));
            await this._persist(state);
          }
        } catch { /* Shutdown remains necessary even if a plugin cannot serialize its state. */ }
        if (this.child === child) {
          try { await this._send('shutdown', {}, Math.min(500, this.shutdownTimeoutMs)); } catch {}
          try { child.stdin.end(); } catch {}
        }
      })();
    });
    return this.closePromise;
  }
}

module.exports = { AudioHost, AUDIO_METHODS, AUDIO_EVENTS, MAX_MESSAGE_BYTES, MAX_PENDING, validateAudioRequest, audioHostPath };
