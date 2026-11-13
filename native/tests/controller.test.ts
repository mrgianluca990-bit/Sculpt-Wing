import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlStore } from '../src/state/store';
import { isPrivateIPv4 } from '../src/wing/native';
import type { ConsoleInfo, LinkStatus, MeterFrame, WingDriver, WingValue } from '../src/wing/types';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class FakeWing implements WingDriver {
  values = new Map<string, WingValue>();
  reads: string[] = [];
  writes: [string, WingValue][] = [];
  connections: string[] = [];
  subscriptions: [number[], number][] = [];
  disconnected = 0;
  writeGate: ReturnType<typeof deferred> | null = null;
  connectGate: ReturnType<typeof deferred> | null = null;
  disconnectGate: ReturnType<typeof deferred> | null = null;
  private valueListeners = new Set<(path: string, value: WingValue) => void>();
  private meterListeners = new Set<(frame: MeterFrame) => void>();
  private statusListeners = new Set<(status: LinkStatus, message?: string) => void>();
  constructor() {
    for (let channel = 1; channel <= 40; channel++) {
      this.values.set(`/ch/${channel}/$name`, `Source ${channel}`);
      this.values.set(`/ch/${channel}/$col`, channel % 8);
      for (let bus = 1; bus <= 16; bus++) {
        this.values.set(`/ch/${channel}/send/${bus}/lvl`, -12 - bus);
        this.values.set(`/ch/${channel}/send/${bus}/on`, 1);
      }
    }
    for (let bus = 1; bus <= 16; bus++) {
      this.values.set(`/bus/${bus}/name`, `IEM ${bus}`);
      this.values.set(`/bus/${bus}/fdr`, -6);
    }
  }
  async connect(host: string): Promise<ConsoleInfo> {
    this.connections.push(host);
    if (this.connectGate) await this.connectGate.promise;
    return { name: 'Stage rack', model: 'WING-RACK', firmware: 'test', host };
  }
  async disconnect() { this.disconnected++; if (this.disconnectGate) await this.disconnectGate.promise; }
  async get(path: string) {
    this.reads.push(path);
    if (!this.values.has(path)) throw new Error(`Missing ${path}`);
    return this.values.get(path)!;
  }
  async set(path: string, value: WingValue) {
    this.writes.push([path, value]);
    if (this.writeGate) await this.writeGate.promise;
    this.emitValue(path, value);
  }
  async subscribeMeters(channels: number[], bus: number) { this.subscriptions.push([[...channels], bus]); }
  onValue(fn: (path: string, value: WingValue) => void) { this.valueListeners.add(fn); return () => { this.valueListeners.delete(fn); }; }
  onMeters(fn: (frame: MeterFrame) => void) { this.meterListeners.add(fn); return () => { this.meterListeners.delete(fn); }; }
  onStatus(fn: (status: LinkStatus, message?: string) => void) { this.statusListeners.add(fn); return () => { this.statusListeners.delete(fn); }; }
  emitValue(path: string, value: WingValue) { this.values.set(path, value); this.valueListeners.forEach(fn => fn(path, value)); }
  emitStatus(status: LinkStatus, message?: string) { this.statusListeners.forEach(fn => fn(status, message)); }
  emitMeters(channels: Record<number, number>, buses: Record<number, number>) {
    this.meterListeners.forEach(fn => fn({ channels, buses, receivedAt: Date.now() }));
  }
}

const stores: ControlStore[] = [];
function makeStore(drivers: FakeWing[] = [new FakeWing()]) {
  let next = 0;
  const factory = vi.fn(() => drivers[next++] ?? drivers[drivers.length - 1]);
  const store = new ControlStore({ nativeAvailable: true, driverFactory: factory, storage: null });
  stores.push(store);
  return { store, driver: drivers[0], factory };
}
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.destroy())); vi.useRealTimers(); });

describe('controller with a responding mixer double', () => {
  it('reads effective source names and one monitor view before enabling any writes', async () => {
    const { store, driver } = makeStore();
    await store.connect('192.168.1.50');
    expect(store.getSnapshot()).toMatchObject({ status: 'connected', mode: 'live', editsEnabled: false, bus: 1, busName: 'IEM 1', busLevel: -6 });
    expect(store.getSnapshot().strips[0]).toMatchObject({ channel: 1, name: 'Source 1', level: -13, sendOn: true });
    expect(driver.reads).toHaveLength(34);
    expect(driver.reads).toContain('/ch/1/$name');
    expect(driver.subscriptions).toEqual([[[1, 2, 3, 4, 5, 6, 7, 8], 1]]);
    await store.setSendLevel(1, 0);
    await store.setSendOn(1, false);
    await store.setBusLevel(0);
    expect(driver.writes).toEqual([]);
  });

  it('writes only the selected monitor send and bus master after explicit enable', async () => {
    const { store, driver } = makeStore();
    await store.connect('192.168.1.50');
    await store.setBus(7);
    await store.setBank(4);
    store.setEditsEnabled(true);
    await store.setSendLevel(33, -2.35);
    await store.setSendOn(33, false);
    await store.setBusLevel(-8);
    await store.setSendLevel(1, 1); // Channel is outside the visible bank.
    await store.setSendLevel(33, Number.NaN);
    await store.setBusLevel(11);
    expect(driver.writes).toEqual([
      ['/ch/33/send/7/lvl', -2.3], ['/ch/33/send/7/on', 0], ['/bus/7/fdr', -8],
    ]);
    expect(store.getSnapshot().strips[0]).toMatchObject({ channel: 33, level: -2.3, sendOn: false, pending: false });
    expect(store.getSnapshot().busLevel).toBe(-8);
  });

  it('keeps the returned mixer value authoritative and prevents changing view mid-write', async () => {
    const { store, driver } = makeStore();
    await store.connect('192.168.1.50');
    store.setEditsEnabled(true);
    driver.writeGate = deferred();
    const write = store.setSendLevel(1, -4);
    expect(store.getSnapshot().strips[0]).toMatchObject({ level: -13, pending: true });
    await store.setBus(2); await store.setBank(1);
    expect(store.getSnapshot()).toMatchObject({ bus: 1, bank: 0 });
    driver.writeGate.resolve(); await write;
    driver.emitValue('/ch/1/send/1/lvl', -9);
    expect(store.getSnapshot().strips[0].level).toBe(-9);
    driver.emitValue('/ch/1/send/2/lvl', 4);
    expect(store.getSnapshot().strips[0].level).toBe(-9);
  });

  it('drops stale write results and reconnects in read-only without replaying a command', async () => {
    const old = new FakeWing(), fresh = new FakeWing();
    fresh.values.set('/ch/1/send/1/lvl', -26);
    const { store } = makeStore([old, fresh]);
    await store.connect('192.168.1.50'); store.setEditsEnabled(true);
    old.writeGate = deferred();
    const staleWrite = store.setSendLevel(1, -1);
    old.emitStatus('error', 'Link lost');
    expect(store.getSnapshot()).toMatchObject({ status: 'error', editsEnabled: false });
    expect(store.getSnapshot().strips[0].level).toBeNull();
    await store.connect('192.168.1.50');
    old.writeGate.resolve(); await staleWrite;
    expect(store.getSnapshot().strips[0]).toMatchObject({ level: -26, pending: false });
    expect(store.getSnapshot().editsEnabled).toBe(false);
    expect(fresh.writes).toEqual([]);
  });

  it('does not revive a connection that was cancelled while opening', async () => {
    const { store, driver } = makeStore();
    driver.connectGate = deferred();
    const connection = store.connect('192.168.1.50');
    await vi.waitFor(() => expect(driver.connections).toHaveLength(1));
    await store.disconnect();
    driver.connectGate.resolve(); await connection;
    expect(store.getSnapshot()).toMatchObject({ status: 'disconnected', mode: 'idle', console: null, editsEnabled: false });
    expect(driver.reads).toHaveLength(0);
  });

  it('lets the latest connection intent win when closing the previous socket is slow', async () => {
    const old = new FakeWing(), cancelled = new FakeWing(), newest = new FakeWing();
    const { store } = makeStore([old, cancelled, newest]);
    await store.connect('192.168.1.50');
    old.disconnectGate = deferred();
    const second = store.connect('192.168.1.51');
    const third = store.connect('192.168.1.52');
    await third;
    old.disconnectGate.resolve(); await second;
    expect(store.getSnapshot().console?.host).toBe('192.168.1.52');
    expect(cancelled.connections).toEqual([]);
    expect(newest.connections).toEqual(['192.168.1.52']);
  });

  it('clears stale meters and all write access on suspension', async () => {
    vi.useFakeTimers();
    const { store, driver } = makeStore();
    await store.connect('192.168.1.50'); store.setEditsEnabled(true);
    driver.emitMeters({ 1: -18 }, { 1: -8 });
    expect(store.getSnapshot()).toMatchObject({ busMeter: -8, meterFresh: true });
    vi.advanceTimersByTime(3001);
    expect(store.getSnapshot()).toMatchObject({ busMeter: null, meterFresh: false });
    driver.emitStatus('suspended', 'App in background');
    expect(store.getSnapshot()).toMatchObject({ status: 'suspended', editsEnabled: false, busLevel: null });
  });

  it('leaves unavailable parameters disabled instead of inventing default values', async () => {
    const driver = new FakeWing();
    driver.values.delete('/ch/1/send/1/lvl');
    const { store } = makeStore([driver]);
    await store.connect('192.168.1.50'); store.setEditsEnabled(true);
    expect(store.getSnapshot().strips[0].level).toBeNull();
    await store.setSendLevel(1, 0);
    expect(driver.writes).toEqual([]);
    expect(store.getSnapshot().activity.some(event => event.text.includes('parametri non disponibili'))).toBe(true);
  });

  it('keeps simulation completely separate from the native driver', async () => {
    const { store, factory } = makeStore();
    await store.enterDemo();
    await store.setSendLevel(1, -9);
    expect(factory).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({ mode: 'demo', status: 'connected', editsEnabled: true });
    expect(store.getSnapshot().strips[0].level).toBe(-9);
    expect(JSON.parse(store.exportDiagnostics())).toMatchObject({ mode: 'demo', hardwareValidated: false });
  });
});

describe('local address selection', () => {
  it.each(['192.168.1.50', '10.5.2.3', '172.16.0.1', '172.31.255.254', '169.254.2.4'])('accepts local unicast %s', address => {
    expect(isPrivateIPv4(address)).toBe(true);
  });
  it.each(['', 'https://192.168.1.50', '127.0.0.1', '192.168.1.255', '192.168.1.0', '224.0.0.1', '172.32.1.1', '256.1.1.1', 'wing.local', '192.168.1.50:2222', '192.168.001.50', '169.254.0.1', '169.254.255.1'])('rejects unsupported target %s', address => {
    expect(isPrivateIPv4(address)).toBe(false);
  });
});
