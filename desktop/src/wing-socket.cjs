'use strict';

const net = require('node:net');
const dgram = require('node:dgram');
const { randomUUID } = require('node:crypto');

const LIMITS = Object.freeze({
  tcpBytes: 65_536,
  udpBytes: 32_768,
  receiveChunkBytes: 32_768,
  pendingSends: 64,
  pendingSendBytes: 262_144,
  pendingPackets: 64,
  pendingPacketBytes: 524_288,
});

function isPrivateIPv4(value) {
  if (typeof value !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
  const parts = value.split('.');
  if (parts.some(part => part.length > 1 && part.startsWith('0'))) return false;
  const p = parts.map(Number);
  if (p.some(n => n > 255) || p[3] === 0 || p[3] === 255) return false;
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 169 && p[1] === 254 && p[2] >= 1 && p[2] <= 254);
}

function error(code, message) {
  return Object.assign(new Error(message), { code });
}

function validId(value) {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 128;
}

function decodePacket(value, maxBytes) {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(maxBytes / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw error('INVALID_PACKET', 'Pacchetto di rete non valido.');
  }
  // Buffer.from is deliberately permissive; require canonical, padded base64.
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64') !== value) {
    throw error('INVALID_PACKET', 'Pacchetto di rete non valido o troppo grande.');
  }
  return bytes;
}

/**
 * Direct local WING transport. No protocol parsing, command replay, or server.
 * Only emit is supplied by the Electron main process. Remaining constructor
 * dependencies exist for isolated socket tests; none are accepted through IPC.
 * An emit callback may return a Promise to acknowledge event delivery.
 */
class WingSocket {
  constructor({
    emit = () => {}, netModule = net, dgramModule = dgram,
    validateHost = isPrivateIPv4, port = 2222, bindAddress = '0.0.0.0',
    connectTimeoutMs = 20_000, sendTimeoutMs = 10_000,
  } = {}) {
    if (typeof emit !== 'function' || typeof validateHost !== 'function' ||
        !Number.isInteger(port) || port < 1 || port > 65_535 ||
        !Number.isFinite(connectTimeoutMs) || connectTimeoutMs <= 0 ||
        !Number.isFinite(sendTimeoutMs) || sendTimeoutMs <= 0) {
      throw new TypeError('Configurazione del trasporto WING non valida.');
    }
    this.emit = emit;
    this.net = netModule;
    this.dgram = dgramModule;
    this.validateHost = validateHost;
    this.port = port;
    this.bindAddress = bindAddress;
    this.connectTimeoutMs = connectTimeoutMs;
    this.sendTimeoutMs = sendTimeoutMs;
    this.session = null;
    this.disposed = false;
  }

  async connect({ host, requestId } = {}) {
    if (!this.validateHost(host)) throw error('INVALID_HOST', 'Inserisci un indirizzo IPv4 privato valido della WING.');
    if (requestId !== undefined && !validId(requestId)) throw error('INVALID_REQUEST', 'Identificativo della richiesta non valido.');
    if (this.disposed) throw error('UNAVAILABLE', 'Il trasporto WING è stato chiuso.');
    if (this.session) this._end(this.session, 'closed', 'SESSION_REPLACED', 'Connessione sostituita da una nuova sessione.');

    const session = {
      id: randomUUID(), host, requestId, ready: false, closed: false,
      tcp: null, udp: null, tcpReady: false, udpReady: false, meterPort: 0,
      connectResolve: null, connectReject: null, connectTimer: null, activation: null,
      sends: new Set(), sendBytes: 0, tcpQueue: [], tcpBusy: false,
      packets: [], packetCount: 0, packetBytes: 0, delivering: false,
      deliveryStarted: false, releasedCount: 0, releasedBytes: 0, releaseTask: null,
      droppedUDP: 0,
    };
    this.session = session;
    return new Promise((resolve, reject) => {
      session.connectResolve = resolve;
      session.connectReject = reject;
      session.connectTimer = setTimeout(() => {
        this._end(session, 'error', 'CONNECT_TIMEOUT', 'Connessione scaduta. Verifica IP e rete della WING.');
      }, this.connectTimeoutMs);
      this._start(session);
    });
  }

  async disconnect({ sessionId, requestId } = {}) {
    if ((sessionId !== undefined && !validId(sessionId)) || (requestId !== undefined && !validId(requestId))) {
      throw error('INVALID_REQUEST', 'Identificativo della richiesta non valido.');
    }
    const session = this.session;
    if (session && (sessionId === undefined || sessionId === session.id) &&
        (requestId === undefined || requestId === session.requestId)) {
      this._end(session, 'closed', 'DISCONNECTED', 'Disconnesso.');
    }
  }

  async sendTCP(options) { return this._send('tcp', options); }
  async sendUDP(options) { return this._send('udp', options); }

  async suspend() {
    if (this.session) this._end(this.session, 'suspended', 'APP_SUSPENDED', 'Connessione sospesa. Ricollega esplicitamente la WING.');
  }

  async close() {
    this.disposed = true;
    if (this.session) this._end(this.session, 'closed', 'DISCONNECTED', 'Trasporto WING chiuso.');
  }

  _current(session) { return this.session === session && !session.closed; }

  _start(session) {
    try {
      const udp = this.dgram.createSocket('udp4');
      session.udp = udp;
      udp.on('error', () => this._end(session, 'error', 'NETWORK_ERROR', 'Trasporto UDP WING interrotto.'));
      udp.on('close', () => this._end(session, 'error', 'NETWORK_ERROR', 'Trasporto UDP WING chiuso.'));
      udp.on('listening', () => {
        if (!this._current(session)) { this._closeUDP(udp); return; }
        try {
          const address = udp.address();
          if (!address || !Number.isInteger(address.port) || address.port < 1 || address.port > 65_535) {
            throw new Error('Invalid meter port');
          }
          session.meterPort = address.port;
          session.udpReady = true;
          this._finishConnecting(session);
        } catch {
          this._end(session, 'error', 'NETWORK_ERROR', 'Impossibile assegnare la porta dei meter.');
        }
      });
      udp.on('message', (bytes, peer) => {
        if (!this._current(session) || peer?.address !== session.host || !bytes.length) return;
        if (!Buffer.isBuffer(bytes) || bytes.length > LIMITS.udpBytes) {
          this._end(session, 'error', 'RECEIVE_OVERFLOW', 'Datagramma WING troppo grande.');
          return;
        }
        this._packet(session, 'udp', bytes);
      });
      udp.bind({ port: 0, address: this.bindAddress, exclusive: true });
      if (!this._current(session)) return;

      const tcp = new this.net.Socket();
      session.tcp = tcp;
      tcp.setNoDelay(true);
      tcp.on('error', () => this._end(session, 'error', 'NETWORK_ERROR', 'Connessione TCP WING non disponibile o interrotta.'));
      tcp.on('close', () => this._end(session, 'closed', 'PEER_CLOSED', 'La WING ha chiuso la connessione.'));
      tcp.on('end', () => this._end(session, 'closed', 'PEER_CLOSED', 'La WING ha chiuso la connessione.'));
      tcp.on('connect', () => {
        if (!this._current(session)) return;
        if (tcp.remoteAddress !== session.host) {
          this._end(session, 'error', 'INVALID_PEER', 'La connessione non corrisponde alla WING selezionata.');
          return;
        }
        session.tcpReady = true;
        this._finishConnecting(session);
      });
      tcp.on('data', bytes => {
        if (!this._current(session)) return;
        if (!Buffer.isBuffer(bytes)) {
          this._end(session, 'error', 'INVALID_PACKET', 'Dati TCP WING non validi.');
          return;
        }
        for (let offset = 0; offset < bytes.length && this._current(session); offset += LIMITS.receiveChunkBytes) {
          this._packet(session, 'tcp', bytes.subarray(offset, offset + LIMITS.receiveChunkBytes));
        }
      });
      // Keep the first selector/stream bytes until the caller adopts this session.
      tcp.pause();
      tcp.connect({ host: session.host, port: this.port, family: 4 });
    } catch {
      this._end(session, 'error', 'NETWORK_ERROR', 'Impossibile aprire il trasporto locale WING.');
    }
  }

  _finishConnecting(session) {
    if (!this._current(session) || session.ready || !session.tcpReady || !session.udpReady) return;
    session.ready = true;
    clearTimeout(session.connectTimer);
    session.connectTimer = null;
    const resolve = session.connectResolve;
    session.connectResolve = session.connectReject = null;
    resolve({ sessionId: session.id, meterPort: session.meterPort });
    session.activation = setImmediate(() => {
      session.activation = null;
      if (!this._current(session)) return;
      this._status(session, 'ready');
      if (!this._current(session)) return;
      session.deliveryStarted = true;
      this._deliver(session);
      this._resume(session);
    });
  }

  _packet(session, transport, bytes) {
    if (!bytes.length || !this._current(session)) return;
    // UDP meter/identity datagrams are already best-effort. A burst of stale
    // metering must not close the reliable control stream. Reserve half the
    // bounded delivery budget for TCP; identity discovery has its own retries.
    if (transport === 'udp' && (session.packetCount >= LIMITS.pendingPackets / 2 ||
        session.packetBytes + bytes.length > LIMITS.pendingPacketBytes / 2)) {
      session.droppedUDP += 1;
      return;
    }
    if (session.packetCount >= LIMITS.pendingPackets || session.packetBytes + bytes.length > LIMITS.pendingPacketBytes) {
      this._end(session, 'error', 'RECEIVE_OVERFLOW', 'Ricezione sovraccarica. Riconnetti la WING.');
      return;
    }
    session.packetCount += 1;
    session.packetBytes += bytes.length;
    const packet = { transport, data: bytes.toString('base64'), size: bytes.length };
    const firstUDP = transport === 'tcp' ? session.packets.findIndex(item => item.transport === 'udp') : -1;
    if (firstUDP >= 0) session.packets.splice(firstUDP, 0, packet);
    else session.packets.push(packet);
    if (session.packetCount >= LIMITS.pendingPackets * 0.75 || session.packetBytes >= LIMITS.pendingPacketBytes * 0.75) {
      session.tcp?.pause();
    }
    this._deliver(session);
  }

  _deliver(session) {
    if (!this._current(session) || !session.deliveryStarted || session.delivering) return;
    while (session.packets.length && this._current(session)) {
      const packet = session.packets.shift();
      try {
        const result = this.emit('packet', { sessionId: session.id, transport: packet.transport, data: packet.data });
        if (result && typeof result.then === 'function') {
          session.delivering = true;
          Promise.resolve(result).then(() => {
            if (!this._current(session)) return;
            session.delivering = false;
            this._releasePacket(session, packet.size);
            this._deliver(session);
          }, () => this._end(session, 'error', 'RECEIVE_FAILED', 'Consegna dei dati WING interrotta.'));
          return;
        }
        this._releasePacket(session, packet.size);
      } catch {
        this._end(session, 'error', 'RECEIVE_FAILED', 'Consegna dei dati WING interrotta.');
        return;
      }
    }
  }

  _releasePacket(session, size) {
    if (!this._current(session)) return;
    session.releasedCount += 1;
    session.releasedBytes += size;
    if (session.releaseTask) return;
    // Charge packets until the next event-loop turn, including synchronous IPC.
    session.releaseTask = setImmediate(() => {
      session.releaseTask = null;
      if (!this._current(session)) return;
      session.packetCount -= session.releasedCount;
      session.packetBytes -= session.releasedBytes;
      session.releasedCount = session.releasedBytes = 0;
      this._resume(session);
    });
  }

  _resume(session) {
    if (this._current(session) && session.deliveryStarted &&
        session.packetCount < LIMITS.pendingPackets / 2 && session.packetBytes < LIMITS.pendingPacketBytes / 2) {
      session.tcp?.resume();
    }
  }

  _send(transport, { sessionId, data } = {}) {
    if (!validId(sessionId)) throw error('INVALID_PACKET', 'Identificativo di sessione non valido.');
    const bytes = decodePacket(data, transport === 'tcp' ? LIMITS.tcpBytes : LIMITS.udpBytes);
    const session = this.session;
    if (!session || !session.ready || session.id !== sessionId || !this._current(session)) {
      throw error('STALE_SESSION', 'Sessione scaduta o disconnessa.');
    }
    if (session.sends.size >= LIMITS.pendingSends || session.sendBytes + bytes.length > LIMITS.pendingSendBytes) {
      throw error('SEND_OVERFLOW', 'Troppe richieste WING in attesa.');
    }
    return new Promise((resolve, reject) => {
      const pending = { bytes, resolve, reject, timer: null, drain: null, returned: false, written: false, needsDrain: false, drained: false };
      session.sends.add(pending);
      session.sendBytes += bytes.length;
      pending.timer = setTimeout(() => {
        this._end(session, 'error', 'SEND_TIMEOUT', 'Invio alla WING scaduto. Nessun comando verrà ripetuto.');
      }, this.sendTimeoutMs);
      if (transport === 'tcp') {
        session.tcpQueue.push(pending);
        this._flushTCP(session);
      } else {
        try {
          session.udp.send(bytes, this.port, session.host, err => {
            if (!this._current(session) || !session.sends.has(pending)) return;
            if (err) this._end(session, 'error', 'SEND_FAILED', 'Invio UDP WING fallito.');
            else this._completeSend(session, pending);
          });
        } catch {
          this._end(session, 'error', 'SEND_FAILED', 'Invio UDP WING fallito.');
        }
      }
    });
  }

  _flushTCP(session) {
    if (!this._current(session) || session.tcpBusy || !session.tcpQueue.length) return;
    const pending = session.tcpQueue.shift();
    session.tcpBusy = true;
    const finish = () => {
      if (!this._current(session) || !session.sends.has(pending) || !pending.returned ||
          !pending.written || (pending.needsDrain && !pending.drained)) return;
      this._completeSend(session, pending);
      session.tcpBusy = false;
      this._flushTCP(session);
    };
    pending.drain = () => { pending.drained = true; finish(); };
    session.tcp.once('drain', pending.drain);
    try {
      const accepted = session.tcp.write(pending.bytes, err => {
        if (!this._current(session) || !session.sends.has(pending)) return;
        if (err) { this._end(session, 'error', 'SEND_FAILED', 'Invio TCP WING fallito.'); return; }
        pending.written = true;
        finish();
      });
      pending.needsDrain = !accepted;
      pending.returned = true;
      if (accepted) session.tcp.removeListener('drain', pending.drain);
      finish();
    } catch {
      this._end(session, 'error', 'SEND_FAILED', 'Invio TCP WING fallito.');
    }
  }

  _completeSend(session, pending) {
    if (!this._current(session) || !session.sends.delete(pending)) return;
    clearTimeout(pending.timer);
    if (pending.drain) session.tcp?.removeListener('drain', pending.drain);
    session.sendBytes -= pending.bytes.length;
    // Completion means accepted by the local transport, never mixer acceptance.
    pending.resolve();
  }

  _closeUDP(socket) {
    try { socket.close(); } catch { /* A socket not bound yet is closed by its listening handler. */ }
  }

  _status(session, state, message) {
    try {
      const result = this.emit('linkState', { sessionId: session.id, state, ...(message ? { message } : {}) });
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).catch(() => {
          if (state === 'ready') this._end(session, 'error', 'RECEIVE_FAILED', 'Consegna dello stato WING interrotta.');
        });
      }
    } catch {
      if (state === 'ready') this._end(session, 'error', 'RECEIVE_FAILED', 'Consegna dello stato WING interrotta.');
    }
  }

  _end(session, state, code, message) {
    if (!this._current(session)) return;
    this.session = null;
    session.closed = true;
    session.ready = false;
    clearTimeout(session.connectTimer);
    clearImmediate(session.activation);
    clearImmediate(session.releaseTask);
    const failure = error(code, message);
    if (session.connectReject) session.connectReject(failure);
    session.connectResolve = session.connectReject = null;
    for (const pending of session.sends) {
      clearTimeout(pending.timer);
      if (pending.drain) session.tcp?.removeListener('drain', pending.drain);
      pending.reject(failure);
    }
    session.sends.clear();
    session.sendBytes = 0;
    session.tcpQueue.length = session.packets.length = 0;
    session.packetCount = session.packetBytes = 0;
    try { session.tcp?.destroy(); } catch { /* Resources may already be closed. */ }
    if (session.udp) this._closeUDP(session.udp);
    this._status(session, state, message);
  }
}

module.exports = { WingSocket, isPrivateIPv4, LIMITS };
