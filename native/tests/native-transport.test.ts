import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeTransport } from '../src/wing/native';
import type { TransportPacket, TransportStatus } from '../src/wing/types';

type ConnectionResult = { sessionId: string; meterPort: number };
type ConnectOptions = { host: string; requestId: string };
type DisconnectOptions = { sessionId?: string; requestId?: string };
type SendOptions = { sessionId: string; data: string };
type PacketEvent = { sessionId: string; transport: 'tcp' | 'udp'; data: string };
type NativeEvent = PacketEvent | TransportStatus;
type EventName = 'packet' | 'linkState';
type ListenerHandle = { remove: () => Promise<void> };

const capacitor = vi.hoisted(() => {
  const plugin = {
    connect: vi.fn<(options: ConnectOptions) => Promise<ConnectionResult>>(),
    disconnect: vi.fn<(options: DisconnectOptions) => Promise<void>>(),
    sendTCP: vi.fn<(options: SendOptions) => Promise<void>>(),
    sendUDP: vi.fn<(options: SendOptions) => Promise<void>>(),
    addListener: vi.fn<(name: EventName, listener: (event: NativeEvent) => void) => Promise<ListenerHandle>>(),
  };
  return { plugin, getPlatform: vi.fn<() => string>(), registerPlugin: vi.fn() };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: capacitor.getPlatform },
  registerPlugin: capacitor.registerPlugin,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type Registration = {
  name: EventName;
  callback: (event: NativeEvent) => void;
  handle: { remove: ReturnType<typeof vi.fn<() => Promise<void>>> };
};

let registrations: Registration[];
let NativeTransportClass: typeof NativeTransport;
const transports: NativeTransport[] = [];
const host = '192.168.1.62';
const plugin = capacitor.plugin;

function register(name: EventName, callback: (event: NativeEvent) => void): Registration {
  const entry = { name, callback, handle: { remove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) } };
  registrations.push(entry);
  return entry;
}

function latest(name: EventName) {
  const registration = registrations.filter(entry => entry.name === name).at(-1);
  if (!registration) throw new Error(`Missing ${name} registration`);
  return registration;
}

function setup() {
  const transport = new NativeTransportClass();
  transports.push(transport);
  return transport;
}

function packet(sessionId: string, bytes = [0, 127, 128, 255], transport: 'tcp' | 'udp' = 'tcp'): PacketEvent {
  return { sessionId, transport, data: btoa(String.fromCharCode(...bytes)) };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.resetAllMocks();
  registrations = [];
  capacitor.getPlatform.mockReturnValue('ios');
  capacitor.registerPlugin.mockReturnValue(plugin);
  plugin.connect.mockResolvedValue({ sessionId: 'session-a', meterPort: 14135 });
  plugin.disconnect.mockResolvedValue(undefined);
  plugin.sendTCP.mockResolvedValue(undefined);
  plugin.sendUDP.mockResolvedValue(undefined);
  plugin.addListener.mockImplementation(async (name, callback) => register(name, callback).handle);
  NativeTransportClass = (await import('../src/wing/native')).NativeTransport;
});

afterEach(async () => {
  for (const transport of transports.splice(0)) await transport.disconnect();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// These tests exercise the JavaScript wrapper and its plugin contract only.
// They do not execute Swift, Network.framework, a socket or a physical WING.
describe('NativeTransport session isolation', () => {
  it('closes an established connection with both IDs and removes its listeners once', async () => {
    const transport = setup();
    expect(capacitor.registerPlugin).toHaveBeenCalledWith('WingSocket');
    await expect(transport.connect(host)).resolves.toEqual({ sessionId: 'session-a', meterPort: 14135 });
    const options = plugin.connect.mock.calls[0][0];
    expect(options).toEqual({ host, requestId: expect.any(String) });
    expect(options.requestId).not.toBe('');
    expect(registrations.map(entry => entry.name)).toEqual(['packet', 'linkState']);

    await transport.disconnect();
    expect(plugin.disconnect).toHaveBeenCalledExactlyOnceWith({ sessionId: 'session-a', requestId: options.requestId });
    for (const entry of registrations) expect(entry.handle.remove).toHaveBeenCalledOnce();
    await transport.disconnect();
    expect(plugin.disconnect).toHaveBeenCalledTimes(1);
    for (const entry of registrations) expect(entry.handle.remove).toHaveBeenCalledOnce();
  });

  it.each<EventName>(['packet', 'linkState'])('cancels while the %s listener registration is pending', async pendingName => {
    const registrationStarted = deferred<void>();
    const registrationResult = deferred<ListenerHandle>();
    plugin.addListener.mockImplementation((name, callback) => {
      const entry = register(name, callback);
      if (name === pendingName) {
        registrationStarted.resolve(undefined);
        return registrationResult.promise;
      }
      return Promise.resolve(entry.handle);
    });
    const transport = setup();
    const packets: TransportPacket[] = [], statuses: TransportStatus[] = [];
    transport.onPacket(event => packets.push(event));
    transport.onStatus(event => statuses.push(event));
    const connection = transport.connect(host);
    const cancelled = expect(connection).rejects.toThrow('Connessione annullata.');
    await registrationStarted.promise;

    await transport.disconnect();
    expect(plugin.disconnect).toHaveBeenCalledExactlyOnceWith({ requestId: expect.any(String) });
    expect(plugin.connect).not.toHaveBeenCalled();
    const pending = latest(pendingName);
    registrationResult.resolve(pending.handle);
    await cancelled;
    for (const entry of registrations) {
      expect(entry.handle.remove).toHaveBeenCalledOnce();
      entry.callback(entry.name === 'packet' ? packet('session-late') : { sessionId: 'session-late', state: 'ready' });
    }
    expect(plugin.connect).not.toHaveBeenCalled();
    expect(packets).toEqual([]);
    expect(statuses).toEqual([]);
  });

  it('scopes cancellation of a pending connect and its late result to the old request', async () => {
    const oldStarted = deferred<ConnectOptions>();
    const oldResult = deferred<ConnectionResult>();
    plugin.connect.mockImplementationOnce(options => {
      oldStarted.resolve(options);
      return oldResult.promise;
    }).mockResolvedValueOnce({ sessionId: 'session-new', meterPort: 14136 });
    const transport = setup();
    const connecting = transport.connect(host);
    const cancelled = expect(connecting).rejects.toThrow('Connessione annullata.');
    const oldOptions = await oldStarted.promise;

    await transport.disconnect();
    expect(plugin.disconnect).toHaveBeenLastCalledWith({ requestId: oldOptions.requestId });
    await transport.connect(host);
    const newOptions = plugin.connect.mock.calls[1][0];
    expect(newOptions.requestId).not.toBe(oldOptions.requestId);

    oldResult.resolve({ sessionId: 'session-old', meterPort: 14135 });
    await cancelled;
    expect(plugin.disconnect.mock.calls.map(([options]) => options)).toEqual([
      { requestId: oldOptions.requestId },
      { requestId: oldOptions.requestId },
    ]);
    await transport.sendTCP(Uint8Array.of(0xdf, 0xd1));
    expect(plugin.sendTCP).toHaveBeenLastCalledWith({ sessionId: 'session-new', data: '39E=' });
  });

  it('keeps an older wrapper teardown scoped after another wrapper has connected', async () => {
    plugin.connect.mockResolvedValueOnce({ sessionId: 'session-old', meterPort: 14135 })
      .mockResolvedValueOnce({ sessionId: 'session-new', meterPort: 14136 });
    const oldTransport = setup(), currentTransport = setup();
    await oldTransport.connect(host);
    await currentTransport.connect(host);
    const oldRequest = plugin.connect.mock.calls[0][0].requestId;

    await oldTransport.disconnect();
    expect(plugin.disconnect).toHaveBeenCalledExactlyOnceWith({ sessionId: 'session-old', requestId: oldRequest });
    await currentTransport.sendUDP(Uint8Array.of(1, 2));
    expect(plugin.sendUDP).toHaveBeenCalledExactlyOnceWith({ sessionId: 'session-new', data: 'AQI=' });
  });

  it('starts native cancellation before waiting for slow listener removal', async () => {
    const transport = setup();
    await transport.connect(host);
    const removed = deferred<void>();
    registrations[0].handle.remove.mockReturnValue(removed.promise);
    const closing = transport.disconnect();
    expect(plugin.disconnect).toHaveBeenCalledExactlyOnceWith({
      sessionId: 'session-a', requestId: plugin.connect.mock.calls[0][0].requestId,
    });
    await expect(transport.sendTCP(Uint8Array.of(1))).rejects.toThrow('WING non collegata.');
    removed.resolve(undefined);
    await closing;
  });

  it('cleans up a rejected native connect using its request ID', async () => {
    const failure = new Error('Local network permission denied');
    plugin.connect.mockRejectedValueOnce(failure);
    const transport = setup();
    await expect(transport.connect(host)).rejects.toBe(failure);
    expect(plugin.disconnect).toHaveBeenCalledExactlyOnceWith({ requestId: plugin.connect.mock.calls[0][0].requestId });
    for (const entry of registrations) expect(entry.handle.remove).toHaveBeenCalledOnce();
    await expect(transport.sendTCP(Uint8Array.of(1))).rejects.toThrow('WING non collegata.');
    expect(plugin.sendTCP).not.toHaveBeenCalled();
  });
});

describe('NativeTransport packets and sends', () => {
  it('ignores wrong-session events and callbacks retained from a previous connection', async () => {
    plugin.connect.mockResolvedValueOnce({ sessionId: 'session-a', meterPort: 14135 })
      .mockResolvedValueOnce({ sessionId: 'session-b', meterPort: 14136 });
    const transport = setup();
    const packets: TransportPacket[] = [], statuses: TransportStatus[] = [];
    transport.onPacket(event => packets.push(event));
    transport.onStatus(event => statuses.push(event));
    await transport.connect(host);
    await vi.runOnlyPendingTimersAsync();
    const oldPacket = latest('packet'), oldStatus = latest('linkState');
    oldPacket.callback(packet('unrelated'));
    oldStatus.callback({ sessionId: 'unrelated', state: 'closed' });
    oldPacket.callback(packet('session-a', [10]));
    expect(packets).toEqual([{ sessionId: 'session-a', transport: 'tcp', data: Uint8Array.of(10) }]);

    await transport.connect(host);
    await vi.runOnlyPendingTimersAsync();
    oldPacket.callback(packet('session-b', [20]));
    oldStatus.callback({ sessionId: 'session-b', state: 'error' });
    latest('packet').callback(packet('session-a', [30]));
    latest('linkState').callback({ sessionId: 'session-a', state: 'closed' });
    latest('packet').callback(packet('session-b', [0, 127, 128, 255], 'udp'));
    latest('linkState').callback({ sessionId: 'session-b', state: 'ready' });

    expect(packets).toEqual([
      { sessionId: 'session-a', transport: 'tcp', data: Uint8Array.of(10) },
      { sessionId: 'session-b', transport: 'udp', data: Uint8Array.of(0, 127, 128, 255) },
    ]);
    expect(statuses).toEqual([{ sessionId: 'session-b', state: 'ready' }]);
  });

  it('keeps TCP order across connect resolution and releases only the adopted session', async () => {
    const nativeStarted = deferred<void>(), nativeResult = deferred<ConnectionResult>();
    plugin.connect.mockImplementation(() => { nativeStarted.resolve(undefined); return nativeResult.promise; });
    const transport = setup();
    const packets: TransportPacket[] = [], statuses: TransportStatus[] = [];
    transport.onPacket(event => packets.push(event));
    transport.onStatus(event => statuses.push(event));
    const connecting = transport.connect(host);
    await nativeStarted.promise;
    latest('packet').callback(packet('session-old', [1]));
    latest('packet').callback(packet('session-a', [2]));
    latest('linkState').callback({ sessionId: 'session-old', state: 'closed' });
    latest('linkState').callback({ sessionId: 'session-a', state: 'ready' });
    expect(packets).toEqual([]);
    expect(statuses).toEqual([]);

    nativeResult.resolve({ sessionId: 'session-a', meterPort: 14135 });
    await connecting;
    // This packet arrives after the native connect resolves but before the
    // queued first packet is released. It must not overtake that first packet.
    latest('packet').callback(packet('session-a', [3]));
    expect(packets).toEqual([]);
    expect(statuses).toEqual([]);
    await vi.runOnlyPendingTimersAsync();
    expect(packets).toEqual([
      { sessionId: 'session-a', transport: 'tcp', data: Uint8Array.of(2) },
      { sessionId: 'session-a', transport: 'tcp', data: Uint8Array.of(3) },
    ]);
    expect(statuses).toEqual([{ sessionId: 'session-a', state: 'ready' }]);
  });

  it('encodes bytes and sends only with the current session ID', async () => {
    const transport = setup();
    await expect(transport.sendTCP(Uint8Array.of(1))).rejects.toThrow('WING non collegata.');
    await expect(transport.sendUDP(Uint8Array.of(1))).rejects.toThrow('WING non collegata.');
    expect(plugin.sendTCP).not.toHaveBeenCalled();
    expect(plugin.sendUDP).not.toHaveBeenCalled();

    await transport.connect(host);
    await transport.sendTCP(Uint8Array.of(0, 127, 128, 255));
    expect(plugin.sendTCP).toHaveBeenCalledExactlyOnceWith({ sessionId: 'session-a', data: 'AH+A/w==' });
    plugin.connect.mockResolvedValueOnce({ sessionId: 'session-b', meterPort: 14136 });
    await transport.connect(host);
    await transport.sendUDP(Uint8Array.of(0xdf, 0xd3, 0));
    expect(plugin.sendUDP).toHaveBeenCalledExactlyOnceWith({ sessionId: 'session-b', data: '39MA' });
    await transport.disconnect();
    await expect(transport.sendTCP(Uint8Array.of(1))).rejects.toThrow('WING non collegata.');
    await expect(transport.sendUDP(Uint8Array.of(1))).rejects.toThrow('WING non collegata.');
    expect(plugin.sendTCP).toHaveBeenCalledTimes(1);
    expect(plugin.sendUDP).toHaveBeenCalledTimes(1);
  });

  it('blocks the live transport in a browser before registering listeners or connecting', async () => {
    capacitor.getPlatform.mockReturnValue('web');
    vi.resetModules();
    const browserModule = await import('../src/wing/native');
    expect(browserModule.nativeAvailable).toBe(false);
    const transport = new browserModule.NativeTransport();
    transports.push(transport);
    await expect(transport.connect(host)).rejects.toThrow(/app installata su iPhone, iPad, Mac o Windows/);
    expect(plugin.addListener).not.toHaveBeenCalled();
    expect(plugin.connect).not.toHaveBeenCalled();
    expect(plugin.disconnect).not.toHaveBeenCalled();
  });
});

describe('NativeTransport desktop bridge', () => {
  it.each(['macos', 'windows'] as const)('uses the %s preload bridge and preserves packet ordering', async platform => {
    capacitor.getPlatform.mockReturnValue('web');
    const desktop = {
      ...plugin, available: true, platform, version: '0.6.0',
      connect: vi.fn().mockResolvedValue({ sessionId: 'desktop-session', meterPort: 14137 }),
      sendTCP: vi.fn().mockResolvedValue(undefined),
      sendUDP: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal('window', { SculptDesktop: desktop });
    vi.resetModules();
    const module = await import('../src/wing/native');
    expect(module.nativeAvailable).toBe(true);
    expect(module.nativePlatform).toBe(platform);
    const transport = new module.NativeTransport();
    transports.push(transport);
    const received: TransportPacket[] = [];
    transport.onPacket(event => received.push(event));
    await expect(transport.connect(host)).resolves.toEqual({ sessionId: 'desktop-session', meterPort: 14137 });
    latest('packet').callback(packet('desktop-session', [1, 2]));
    latest('packet').callback(packet('desktop-session', [3, 4]));
    expect(received).toEqual([]);
    await vi.runOnlyPendingTimersAsync();
    expect(received.map(event => [...event.data])).toEqual([[1, 2], [3, 4]]);
    await transport.sendTCP(Uint8Array.of(0, 127, 128, 255));
    await transport.sendUDP(Uint8Array.of(0xdf, 0xd3, 0));
    expect(desktop.sendTCP).toHaveBeenCalledWith({ sessionId: 'desktop-session', data: 'AH+A/w==' });
    expect(desktop.sendUDP).toHaveBeenCalledWith({ sessionId: 'desktop-session', data: '39MA' });
    expect(plugin.connect).not.toHaveBeenCalled();
    await transport.disconnect();
    expect(desktop.disconnect).toHaveBeenCalledWith({ sessionId: 'desktop-session', requestId: expect.any(String) });
    await expect(transport.sendTCP(Uint8Array.of(1))).rejects.toThrow('WING non collegata.');
  });

  it('leaves a normal browser in demo mode when a desktop bridge is incomplete', async () => {
    capacitor.getPlatform.mockReturnValue('web');
    vi.stubGlobal('window', { SculptDesktop: { available: true, platform: 'windows', connect: vi.fn() } });
    vi.resetModules();
    const module = await import('../src/wing/native');
    expect(module.nativeAvailable).toBe(false);
    expect(module.nativePlatform).toBe('web');
  });
});
