import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { TransportPacket, TransportStatus, WingTransport } from './types';

interface SocketPlugin {
  connect(options: { host: string; requestId: string }): Promise<{ sessionId: string; meterPort: number }>;
  disconnect(options: { sessionId?: string; requestId?: string }): Promise<void>;
  sendTCP(options: { sessionId: string; data: string }): Promise<void>;
  sendUDP(options: { sessionId: string; data: string }): Promise<void>;
  addListener(name: 'packet', listener: (event: { sessionId: string; transport: 'tcp' | 'udp'; data: string }) => void): Promise<PluginListenerHandle>;
  addListener(name: 'linkState', listener: (event: TransportStatus) => void): Promise<PluginListenerHandle>;
}

interface DesktopSocketPlugin extends SocketPlugin {
  available: true;
  platform: 'macos' | 'windows' | 'linux';
  version: string;
}

declare global {
  interface Window { SculptDesktop?: DesktopSocketPlugin; }
}

// The desktop preload exposes the same narrow transport contract as the iOS
// plugin. Keep the protocol, readback and session handling shared on all hosts.
const candidate = typeof window !== 'undefined' ? window.SculptDesktop : undefined;
const desktopSocket = candidate?.available === true &&
  ['macos', 'windows', 'linux'].includes(candidate.platform) &&
  ['connect', 'disconnect', 'sendTCP', 'sendUDP', 'addListener'].every(
    key => typeof candidate[key as keyof DesktopSocketPlugin] === 'function'
  ) ? candidate : undefined;
const socket: SocketPlugin = desktopSocket ?? registerPlugin<SocketPlugin>('WingSocket');
export const nativePlatform = desktopSocket?.platform ?? Capacitor.getPlatform();
export const nativeAvailable = !!desktopSocket || nativePlatform === 'ios';

export function isPrivateIPv4(value: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
  const parts = value.split('.');
  if (parts.some(part => part.length > 1 && part.startsWith('0'))) return false;
  const p = parts.map(Number);
  if (p.some(n => n < 0 || n > 255) || p[3] === 0 || p[3] === 255) return false;
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254 && p[2] >= 1 && p[2] <= 254);
}

function encode(bytes: Uint8Array): string {
  let raw = '';
  for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(raw);
}
function decode(value: string): Uint8Array {
  if (value.length > 2_000_000) throw new Error('Pacchetto di rete troppo grande');
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

export class NativeTransport implements WingTransport {
  private sessionId: string | null = null;
  private requestId: string | null = null;
  private handles: PluginListenerHandle[] = [];
  private generation = 0;
  private packets = new Set<(event: TransportPacket) => void>();
  private statuses = new Set<(event: TransportStatus) => void>();

  async connect(host: string) {
    if (!nativeAvailable) throw new Error('Il collegamento alla WING richiede l’app installata su iPhone, iPad, Mac o Windows. Nel browser puoi usare la simulazione.');
    if (!isPrivateIPv4(host)) throw new Error('Inserisci un indirizzo IPv4 locale valido della WING.');
    const closing = this.disconnect();
    const generation = this.generation;
    await closing;
    if (generation !== this.generation) throw new Error('Connessione annullata.');
    const requestId = globalThis.crypto?.randomUUID?.() ?? `sculpt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.requestId = requestId;
    const pendingEvents: ({ kind: 'packet'; event: TransportPacket } | { kind: 'status'; event: TransportStatus })[] = [];
    let pendingBytes = 0;
    let buffering = true;
    let bufferFailed = false;
    const failBuffer = () => {
      if (bufferFailed) return;
      bufferFailed = true;
      void socket.disconnect({ requestId }).catch(() => undefined);
    };
    try {
      const packetHandle = await socket.addListener('packet', event => {
        if (generation !== this.generation) return;
        if (this.sessionId && event.sessionId !== this.sessionId) return;
        try {
          const packet = { ...event, data: decode(event.data) };
          if (buffering) {
            pendingBytes += packet.data.length;
            if (pendingBytes <= 1_048_576 && pendingEvents.length < 512) pendingEvents.push({ kind: 'packet', event: packet });
            else failBuffer();
          } else if (event.sessionId === this.sessionId) this.packets.forEach(fn => fn(packet));
        } catch {
          if (buffering) failBuffer();
          else this.statuses.forEach(fn => fn({ sessionId: event.sessionId, state: 'error', message: 'Dati di rete non validi.' }));
        }
      });
      if (generation !== this.generation) { await packetHandle.remove(); throw new Error('Connessione annullata.'); }
      this.handles.push(packetHandle);
      const statusHandle = await socket.addListener('linkState', event => {
        if (generation !== this.generation) return;
        if (buffering) {
          if (pendingEvents.length < 512) pendingEvents.push({ kind: 'status', event });
          else failBuffer();
        }
        else if (event.sessionId === this.sessionId) this.statuses.forEach(fn => fn(event));
      });
      if (generation !== this.generation) { await statusHandle.remove(); throw new Error('Connessione annullata.'); }
      this.handles.push(statusHandle);
      const result = await socket.connect({ host, requestId });
      if (generation !== this.generation) { await socket.disconnect({ requestId }); throw new Error('Connessione annullata.'); }
      this.sessionId = result.sessionId;
      // Release buffered packets on the following task, after the driver has the session id.
      setTimeout(() => {
        if (generation !== this.generation || this.sessionId !== result.sessionId) return;
        if (bufferFailed) {
          this.statuses.forEach(fn => fn({ sessionId: result.sessionId, state: 'error', message: 'Ricezione iniziale non valida o sovraccarica. Riconnetti la WING.' }));
          void this.disconnect().catch(() => undefined);
          return;
        }
        for (const queued of pendingEvents) {
          if (generation !== this.generation) break;
          if (queued.event.sessionId !== result.sessionId) continue;
          if (queued.kind === 'packet') this.packets.forEach(fn => fn(queued.event));
          else this.statuses.forEach(fn => fn(queued.event));
        }
        pendingEvents.length = 0;
        buffering = false;
      }, 0);
      return result;
    } catch (error) {
      if (generation === this.generation) await this.disconnect();
      throw error;
    }
  }

  async disconnect() {
    ++this.generation;
    const sessionId = this.sessionId, requestId = this.requestId;
    this.sessionId = null;
    this.requestId = null;
    const handles = this.handles.splice(0);
    // Closing an old transport must never close a newer connection in the same
    // native plugin. Scope cancellation to the IDs captured before clearing.
    const closing = nativeAvailable && (sessionId || requestId)
      ? socket.disconnect({ ...(sessionId ? { sessionId } : {}), ...(requestId ? { requestId } : {}) })
      : Promise.resolve();
    await Promise.allSettled(handles.map(h => h.remove()));
    await closing;
  }
  async sendTCP(data: Uint8Array) {
    const sessionId = this.sessionId;
    if (!sessionId) throw new Error('WING non collegata.');
    await socket.sendTCP({ sessionId, data: encode(data) });
  }
  async sendUDP(data: Uint8Array) {
    const sessionId = this.sessionId;
    if (!sessionId) throw new Error('WING non collegata.');
    await socket.sendUDP({ sessionId, data: encode(data) });
  }
  onPacket(listener: (event: TransportPacket) => void) { this.packets.add(listener); return () => { this.packets.delete(listener); }; }
  onStatus(listener: (event: TransportStatus) => void) { this.statuses.add(listener); return () => { this.statuses.delete(listener); }; }
}
