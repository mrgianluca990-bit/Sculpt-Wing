import { afterEach, describe, expect, it, vi } from 'vitest';
import { WingClient } from '../src/wing/client';
import type { LinkStatus, MeterFrame, RtaFrame, TransportPacket, TransportStatus, WingTransport, WingValue } from '../src/wing/types';

type Node = { id: number; parent: number; index: number; name: string; type: number; readOnly?: boolean; min?: number; max?: number };
type Command = { channel: number; bytes: number[]; kind: 'definition' | 'get' | 'set' | 'other'; id?: number; value?: number };

function u32(value: number): number[] { return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]; }
function u16(value: number): number[] { return [(value >>> 8) & 255, value & 255]; }
function quoted(payload: number[], channel = 1): Uint8Array {
  return Uint8Array.from([0xdf, 0xd0 + channel, ...payload.flatMap(byte => byte === 0xdf ? [0xdf, 0xde] : [byte])]);
}
function definition(node: Node): number[] {
  const name = [...new TextEncoder().encode(node.name)];
  const body = [...u32(node.parent), ...u32(node.id), ...u16(node.index), name.length, ...name, 0,
    ...u16((node.type << 4) | (node.readOnly ? 0x200 : 0))];
  if (node.type === 4) body.push(...u32(node.min ?? 0), ...u32(node.max ?? 1));
  if (node.type === 7) body.push(0, 16);
  return [0xdf, ...u16(body.length), ...body];
}
function scalar(id: number, value: WingValue): number[] {
  const result = [0xd7, ...u32(id)];
  if (typeof value === 'string') {
    const bytes = [...new TextEncoder().encode(value)];
    return [...result, ...(bytes.length ? [0x80 + bytes.length - 1, ...bytes] : [0xd0])];
  }
  const bytes = new Uint8Array(4); new DataView(bytes.buffer).setFloat32(0, value);
  return [...result, 0xd5, ...bytes];
}

/** Small independent fake console: no network or hardware writes occur in these tests. */
class ConsoleTransport implements WingTransport {
  readonly packetListeners = new Set<(event: TransportPacket) => void>();
  readonly statusListeners = new Set<(event: TransportStatus) => void>();
  commands: Command[] = [];
  nodes: Node[] = [];
  values = new Map<number, WingValue>();
  sessionId = '';
  host = '';
  connectionCount = 0;
  disconnectCount = 0;
  identityEnabled = true;
  omitBus = false;
  holdData = false;
  applyWrites = true;
  readOnlyLevel = false;
  fragmentBytes = 0;
  private nextSelected = 0;

  async connect(host: string) {
    this.host = host; this.sessionId = `session-${++this.connectionCount}`;
    // IDs intentionally change on every connection and contain an escape byte.
    const base = 0x10df0000 + this.connectionCount * 256;
    const n = (offset: number, parent: number, name: string, type: number, index = 1): Node => ({ id: base + offset, parent: parent ? base + parent : 0, name, type, index });
    this.nodes = [n(1, 0, 'ch', 0), n(2, 0, 'bus', 0, 2), n(3, 1, '', 0), n(4, 3, '$name', 7),
      { ...n(5, 3, '$col', 4, 2), min: 1, max: 18 }, n(6, 3, 'send', 0, 3), n(7, 6, '', 0),
      { ...n(8, 7, 'lvl', 3), readOnly: this.readOnlyLevel }, n(9, 7, 'on', 4, 2), n(10, 2, '1', 0),
      n(11, 10, 'name', 7), n(12, 10, 'fdr', 3, 2)];
    if (this.omitBus) this.nodes = this.nodes.filter(node => node.name !== 'bus');
    this.values = new Map<number, WingValue>([[base + 4, 'Voce'], [base + 5, 4], [base + 8, -12], [base + 9, 1], [base + 11, 'IEM'], [base + 12, -6]]);
    this.nextSelected = 0;
    return { sessionId: this.sessionId, meterPort: 14135 };
  }
  async disconnect() { this.disconnectCount++; }
  onPacket(listener: (event: TransportPacket) => void) { this.packetListeners.add(listener); return () => { this.packetListeners.delete(listener); }; }
  onStatus(listener: (event: TransportStatus) => void) { this.statusListeners.add(listener); return () => { this.statusListeners.delete(listener); }; }

  async sendUDP(bytes: Uint8Array) {
    expect(new TextDecoder().decode(bytes)).toBe('WING?');
    if (this.identityEnabled) this.emit(new TextEncoder().encode(`WING,${this.host},Stage,ngc-rack,SERIAL,3.1.2`), 'udp');
  }

  async sendTCP(wire: Uint8Array) {
    expect(wire[0]).toBe(0xdf);
    const channel = wire[1] - 0xd0, bytes: number[] = [];
    for (let i = 2; i < wire.length; i++) {
      bytes.push(wire[i]);
      if (wire[i] === 0xdf) { expect(wire[++i]).toBe(0xde); }
    }
    const command: Command = { channel, bytes, kind: 'other' };
    this.commands.push(command);
    if (channel !== 1 || !bytes.length) return;
    let p = 0;
    if (bytes[p] === 0xda) { this.nextSelected = 0; p++; }
    else if (bytes[p] === 0xd7) {
      this.nextSelected = new DataView(Uint8Array.from(bytes.slice(1, 5)).buffer).getUint32(0); p = 5;
    }
    command.id = this.nextSelected;
    if (bytes[p] === 0xdd) {
      command.kind = 'definition';
      this.emit(quoted([...this.nodes.filter(node => node.parent === this.nextSelected).flatMap(definition), 0xde]));
    } else if (bytes[p] === 0xdc) {
      command.kind = 'get';
      if (!this.holdData) this.replyValue(this.nextSelected, this.values.get(this.nextSelected));
    } else {
      command.kind = 'set';
      if (bytes[p] === 0xd5) command.value = new DataView(Uint8Array.from(bytes.slice(p + 1, p + 5)).buffer).getFloat32(0);
      else if (bytes[p] <= 0x3f) command.value = bytes[p];
      else throw new Error('Unsupported test write');
      if (this.applyWrites) this.values.set(this.nextSelected, command.value);
      // Intentionally no ACK: the real protocol does not acknowledge set().
    }
  }
  replyValue(id: number, value: WingValue | undefined, sessionId = this.sessionId) {
    this.emit(quoted([...(value === undefined ? [] : scalar(id, value)), 0xde]), 'tcp', sessionId);
  }
  emit(bytes: Uint8Array, transport: 'tcp' | 'udp' = 'tcp', sessionId = this.sessionId) {
    const size = transport === 'tcp' && this.fragmentBytes ? this.fragmentBytes : bytes.length;
    for (let start = 0; start < bytes.length; start += size) {
      for (const listener of this.packetListeners) listener({ sessionId, transport, data: bytes.subarray(start, start + size) });
    }
  }
  status(state: TransportStatus['state']) {
    for (const listener of this.statusListeners) listener({ sessionId: this.sessionId, state });
  }
  id(name: string) { return this.nodes.find(node => node.name === name)!.id; }
}

const clients: WingClient[] = [];
function setup(transport = new ConsoleTransport(), options = {}) {
  const client = new WingClient(transport, options); clients.push(client); return { client, transport };
}
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
afterEach(async () => { for (const client of clients.splice(0)) await client.disconnect(); vi.useRealTimers(); });

describe('WingClient uses live protocol state', () => {
  it('checks identity, discovers changing hashes, and caches root/collection definitions', async () => {
    const { client, transport } = setup(); transport.fragmentBytes = 1;
    const events: Array<[string, WingValue]> = [];
    client.onValue((path, value) => events.push([path, value]));
    expect(await client.connect('192.168.1.62')).toEqual({ host: '192.168.1.62', name: 'Stage', model: 'ngc-rack', firmware: '3.1.2' });
    expect(await Promise.all([
      client.get('/ch/1/$name'), client.get('/ch/1/$col'), client.get('/ch/1/send/1/lvl'),
      client.get('/ch/1/send/1/on'), client.get('/bus/1/fdr'),
    ])).toEqual(['Voce', 4, -12, 1, -6]);
    expect(events).toContainEqual(['/ch/1/$name', 'Voce']);
    expect(events).toContainEqual(['/ch/1/send/1/lvl', -12]);
    const definitions = transport.commands.filter(command => command.kind === 'definition');
    expect(definitions.filter(command => command.id === 0)).toHaveLength(1);
    expect(new Set(definitions.map(command => command.id)).size).toBe(definitions.length);
    transport.emit(quoted(scalar(transport.id('lvl'), -9)));
    expect(events.at(-1)).toEqual(['/ch/1/send/1/lvl', -9]);
  });

  it('does not resolve a write on transmission or on an unrelated state update', async () => {
    const { client, transport } = setup(); await client.connect('192.168.1.62');
    await client.get('/ch/1/send/1/lvl');
    transport.holdData = true;
    let finished = false;
    const write = client.set('/ch/1/send/1/lvl', -8).then(() => { finished = true; });
    await flush();
    expect(transport.commands.at(-1)).toMatchObject({ kind: 'get', id: transport.id('lvl') });
    expect(finished).toBe(false);
    transport.emit(quoted(scalar(transport.id('on'), -8))); await flush();
    expect(finished).toBe(false);
    transport.emit(quoted(scalar(transport.id('lvl'), -8))); await flush();
    expect(finished).toBe(false); // Matching data still needs this request's end.
    transport.emit(quoted([0xde]));
    await write;
    expect(finished).toBe(true);
  });

  it('rejects ignored writes and publishes actual readback rather than optimistic state', async () => {
    const { client, transport } = setup(); await client.connect('192.168.1.62');
    transport.applyWrites = false;
    const values: WingValue[] = []; client.onValue((path, value) => { if (path.endsWith('/lvl')) values.push(value); });
    await expect(client.set('/ch/1/send/1/lvl', -3)).rejects.toThrow(/non ha confermato/);
    expect(values).toEqual([-12]);
    expect(await client.get('/ch/1/send/1/lvl')).toBe(-12);
  });

  it('blocks read-only definitions and unavailable paths before sending a set', async () => {
    const transport = new ConsoleTransport(); transport.readOnlyLevel = true;
    const { client } = setup(transport); await client.connect('192.168.1.62');
    await expect(client.set('/ch/1/send/1/lvl', -10)).rejects.toThrow(/sola lettura/);
    await expect(client.set('/ch/1/fdr', -10)).rejects.toThrow(/non disponibile/);
    expect(transport.commands.some(command => command.kind === 'set')).toBe(false);
  });

  it('cancels pending/queued writes and ignores old-session packets after reconnect', async () => {
    const { client, transport } = setup(); await client.connect('192.168.1.62');
    await client.get('/ch/1/send/1/lvl');
    const oldId = transport.id('lvl'), oldSession = transport.sessionId;
    transport.holdData = true;
    const first = client.set('/ch/1/send/1/lvl', -8).catch(error => error);
    const queued = client.set('/ch/1/send/1/lvl', -7).catch(error => error);
    await flush(); await client.disconnect();
    expect(await first).toBeInstanceOf(Error); expect(await queued).toBeInstanceOf(Error);
    expect(transport.commands.filter(command => command.kind === 'set')).toHaveLength(1);
    transport.holdData = false;
    await client.connect('192.168.1.62');
    const received: WingValue[] = []; client.onValue((_, value) => received.push(value));
    transport.replyValue(oldId, 10, oldSession);
    expect(received).toEqual([]);
    expect(await client.get('/ch/1/send/1/lvl')).toBe(-12);
    await client.set('/ch/1/send/1/lvl', -4);
    const writes = transport.commands.filter(command => command.kind === 'set');
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({ id: transport.id('lvl'), value: -4 });
    expect(writes[1].id).not.toBe(oldId);
  });

  it('closes a timed-out request instead of allowing a delayed DE to confirm queued work', async () => {
    vi.useFakeTimers();
    const { client, transport } = setup(undefined, { requestTimeoutMs: 50 });
    const statuses: LinkStatus[] = []; client.onStatus(status => statuses.push(status));
    await client.connect('192.168.1.62'); await client.get('/ch/1/send/1/lvl');
    transport.holdData = true;
    const read = client.get('/ch/1/send/1/lvl').catch(error => error);
    const queued = client.set('/ch/1/send/1/lvl', -1).catch(error => error);
    await flush(); await vi.advanceTimersByTimeAsync(51);
    expect(await read).toBeInstanceOf(Error); expect(await queued).toBeInstanceOf(Error);
    expect(statuses.at(-1)).toBe('error');
    transport.replyValue(transport.id('lvl'), -1);
    expect(transport.commands.filter(command => command.kind === 'set')).toHaveLength(0);
    await expect(client.get('/ch/1/send/1/lvl')).rejects.toThrow(/Nessuna WING/);
  });

  it('requires WING identity and the compatible ch/bus schema before connected', async () => {
    vi.useFakeTimers();
    const transport = new ConsoleTransport(); transport.identityEnabled = false;
    const { client } = setup(transport, { identityTimeoutMs: 90 });
    const states: LinkStatus[] = []; client.onStatus(status => states.push(status));
    const connection = client.connect('192.168.1.62').catch(error => error);
    await flush(); await vi.advanceTimersByTimeAsync(91);
    expect(await connection).toBeInstanceOf(Error); expect(states).not.toContain('connected');
    transport.identityEnabled = true; transport.omitBus = true;
    await expect(client.connect('192.168.1.62')).rejects.toThrow(/ch\/bus/);
  });

  it('keeps the session alive with a serialized leaf read and detects a silent console', async () => {
    vi.useFakeTimers();
    const { client, transport } = setup(); const states: LinkStatus[] = [];
    client.onStatus(status => states.push(status));
    await client.connect('192.168.1.62'); await client.get('/ch/1/$name');
    const getsBefore = transport.commands.filter(command => command.kind === 'get').length;
    await vi.advanceTimersByTimeAsync(4001);
    const gets = transport.commands.filter(command => command.kind === 'get');
    expect(gets).toHaveLength(getsBefore + 1);
    expect(gets.at(-1)?.id).toBe(transport.id('$name'));
    expect(transport.commands.some(command => command.channel === 1 && command.bytes.length === 0)).toBe(false);
    transport.holdData = true;
    await vi.advanceTimersByTimeAsync(6500);
    expect(states.at(-1)).toBe('error');
  });

  it('closes on malformed control data or suspension and unsubscribes the transport', async () => {
    const { client, transport } = setup(); const states: LinkStatus[] = [];
    client.onStatus(status => states.push(status));
    await client.connect('192.168.1.62'); transport.emit(Uint8Array.of(0xdf, 0xd1, 0xff));
    expect(states.at(-1)).toBe('error'); expect(transport.packetListeners.size).toBe(0);
    await client.connect('192.168.1.62'); transport.status('suspended');
    expect(states.at(-1)).toBe('suspended');
    await expect(client.set('/bus/1/fdr', -10)).rejects.toThrow(/Nessuna WING/);
  });

  it('requests/renews only the latest meter collection and drops late packets', async () => {
    vi.useFakeTimers();
    const { client, transport } = setup(); await client.connect('192.168.1.62');
    const frames: MeterFrame[] = []; client.onMeters(frame => frames.push(frame));
    const report = () => {
      const request = transport.commands.filter(command => command.channel === 3 && command.bytes[0] === 0xd3).at(-1)!;
      return new DataView(Uint8Array.from(request.bytes.slice(4, 8)).buffer).getUint32(0);
    };
    const meterPacket = (reportId: number) => {
      const bytes = new Uint8Array(36), view = new DataView(bytes.buffer);
      view.setUint32(0, reportId); view.setInt16(4, -30 * 256); view.setInt16(6, -20 * 256);
      view.setInt16(24, -12 * 256); view.setInt16(26, -10 * 256); return bytes;
    };
    await client.subscribeMeters([1], 1); const oldReport = report();
    transport.emit(meterPacket(oldReport), 'udp');
    expect(frames[0]).toMatchObject({ channels: { 1: -20 }, buses: { 1: -10 } });
    await client.subscribeMeters([8], 2); const currentReport = report();
    expect(currentReport).not.toBe(oldReport);
    transport.emit(meterPacket(oldReport), 'udp'); expect(frames).toHaveLength(1);
    transport.emit(meterPacket(currentReport), 'udp'); expect(frames[1]).toMatchObject({ channels: { 8: -20 }, buses: { 2: -10 } });
    await vi.advanceTimersByTimeAsync(2501);
    expect(transport.commands.at(-1)).toMatchObject({ channel: 3, bytes: [0xd4, ...u32(currentReport)] });
    await client.disconnect(); const count = transport.commands.length;
    await vi.advanceTimersByTimeAsync(8000); expect(transport.commands).toHaveLength(count);
  });

  it('adds RTA to the existing UDP report, rotates IDs on source handoff, and stops it on release/suspension', async () => {
    vi.useFakeTimers();
    const { client, transport } = setup(); await client.connect('192.168.1.62');
    const frames: RtaFrame[] = [], meters: MeterFrame[] = [];
    client.onRta(frame => frames.push(frame)); client.onMeters(frame => meters.push(frame));
    await client.subscribeStripMeters({ ch: [1] });
    const packet = (reportId: number, rta = true) => {
      const bytes = new Uint8Array(20 + (rta ? 240 : 0)), view = new DataView(bytes.buffer);
      view.setUint32(0, reportId); view.setInt16(4, -12 * 256); view.setInt16(6, -14 * 256);
      if (rta) for (let i = 0; i < 120; i++) view.setInt16(20 + i * 2, -18000 + i);
      return bytes;
    };
    const first = await client.subscribeRta(true);
    expect(transport.commands.at(-1)?.bytes.slice(-2)).toEqual([0xaa, 0xde]);
    transport.emit(packet(first), 'udp'); expect(frames).toHaveLength(1); expect(meters.at(-1)?.channels[1]).toBe(-12);
    const second = await client.subscribeRta(true); expect(second).not.toBe(first);
    transport.emit(packet(first), 'udp'); expect(frames).toHaveLength(1);
    transport.emit(packet(second), 'udp'); expect(frames).toHaveLength(2); expect(frames[1].binsRaw[119]).toBe(-17881);
    await vi.advanceTimersByTimeAsync(2501);
    expect(transport.commands.at(-1)).toMatchObject({ channel: 3, bytes: [0xd4, ...u32(second)] });
    const plain = await client.subscribeRta(false); expect(plain).not.toBe(second);
    expect(transport.commands.at(-1)?.bytes.slice(8)).not.toContain(0xaa);
    transport.emit(packet(second), 'udp'); expect(frames).toHaveLength(2);
    transport.emit(packet(plain, false), 'udp'); expect(meters.at(-1)?.channels[1]).toBe(-12);
    await client.subscribeRta(true); transport.status('suspended');
    const count = transport.commands.length;
    await vi.advanceTimersByTimeAsync(8000); expect(transport.commands).toHaveLength(count);
    transport.emit(packet(second), 'udp'); expect(frames).toHaveLength(2);
  });
});
