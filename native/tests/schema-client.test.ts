import { afterEach, describe, expect, it } from 'vitest';
import { WingClient } from '../src/wing/client';
import {
  decodeStripMeterPacket, encodeStripMeterRequest, validateStripMeterSelection,
} from '../src/wing/protocol';
import type {
  NodeDefinition, SchemaChange, StripMeterFrame, TransportPacket, TransportStatus, WingTransport, WingValue,
} from '../src/wing/types';

type FixtureNode = NodeDefinition & { path: string; value?: WingValue };
type Command = { channel: number; bytes: number[]; kind?: 'get' | 'definition' | 'set'; id?: number; value?: WingValue };
const enc = new TextEncoder();
const bytes32 = (n: number) => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const bytes16 = (n: number) => [n >>> 8 & 255, n & 255];
function float(n: number): number[] {
  const bytes = new Uint8Array(4); new DataView(bytes.buffer).setFloat32(0, n); return [...bytes];
}
function string(s: string): number[] { const bytes = [...enc.encode(s)]; return [bytes.length, ...bytes]; }
function framed(payload: number[]): Uint8Array {
  return Uint8Array.from([0xdf, 0xd1, ...payload.flatMap(byte => byte === 0xdf ? [0xdf, 0xde] : [byte])]);
}
function def(n: FixtureNode): number[] {
  const body = [...bytes32(n.parent), ...bytes32(n.id), ...bytes16(n.index), ...string(n.name), ...string(n.longName), ...bytes16(n.flags)];
  if (n.type === 1 || n.type === 2) body.push(...float(n.min!), ...float(n.max!), ...bytes32(n.steps!));
  if (n.type === 4) body.push(...bytes32(n.min!), ...bytes32(n.max!));
  if (n.type === 5 || n.type === 6) {
    body.push(...bytes16(n.items!.length));
    for (const item of n.items!) body.push(...(n.type === 5 ? string(String(item.value)) : float(Number(item.value))), ...string(item.label));
  }
  if (n.type === 7) body.push(...bytes16(n.maxLength!));
  return [0xdf, ...bytes16(body.length), ...body];
}
function scalar(id: number, value: WingValue): number[] {
  const head = [0xd7, ...bytes32(id)];
  if (typeof value === 'number') return [...head, 0xd5, ...float(value)];
  const bytes = [...enc.encode(value)];
  return [...head, ...(bytes.length === 0 ? [0xd0] : bytes.length <= 64 ? [0x80 + bytes.length - 1, ...bytes] : [0xd1, bytes.length - 1, ...bytes])];
}

/** Independent synthetic firmware, including one reused dynamic parameter hash. */
class SchemaConsole implements WingTransport {
  nodes = new Map<string, FixtureNode>();
  commands: Command[] = [];
  packets = new Set<(p: TransportPacket) => void>();
  statuses = new Set<(s: TransportStatus) => void>();
  session = ''; serial = 0; nextId = 100; host = '';
  held = new Set<number>();
  quantize = new Map<string, (n: number) => number>();
  constructor() {
    for (const family of ['ch', 'aux', 'bus', 'main', 'mtx']) {
      this.add('/' + family + '/1/fdr', 3, -12, { flags: 0x31 });
      this.add('/' + family + '/1/mute', 4, 0, { min: 0, max: 1 });
    }
    this.add('/ch/1/name', 7, 'Voce', { maxLength: 16 });
    this.add('/ch/1/$name', 7, 'Voce', { maxLength: 16, readOnly: true });
    this.add('/ch/1/eq/mdl', 5, 'STD', { items: [{ value: 'STD', label: 'Standard' }, { value: 'SOUL', label: 'Soul' }] });
    this.add('/ch/1/eq/1q', 2, 1, { min: 0.44, max: 10, steps: 181 });
    this.add('/ch/1/eq/mix', 1, 100, { min: 0, max: 100, steps: 101, flags: 0x12 });
    this.add('/ch/1/send/1/mode', 5, 'PRE', { items: [{ value: 'PRE', label: 'Pre' }, { value: 'POST', label: 'Post' }, { value: 'GRP', label: 'Group' }] });
    this.add('/fx/1/mdl', 5, 'VSS3', { items: [{ value: 'VSS3', label: 'VSS3' }] });
    this.add('/fx/1/load', 4, 0, { min: 0, max: 1 });
    this.add('/fx/1/freq', 2, 1000, { min: 20, max: 20000, steps: 961 });
    this.add('/io/out/LCL/1/grp', 5, 'OFF', { items: [{ value: 'OFF', label: 'Off' }, { value: 'MAIN', label: 'Main' }] });
    this.add('/io/out/LCL/1/in', 4, 1, { min: 1, max: 64 });
    this.add('/$globals/clock', 6, 48000, { items: [{ value: 48000, label: '48 kHz' }, { value: 44100, label: '44.1 kHz' }] });
    this.add('/$ctl/label', 7, '', { maxLength: 128 });
  }
  add(path: string, type: NodeDefinition['type'], value?: WingValue, extra: Partial<NodeDefinition> = {}): FixtureNode {
    const split = path.lastIndexOf('/'), parentPath = path.slice(0, split);
    const parent = parentPath ? (this.nodes.get(parentPath) ?? this.add(parentPath, 0)) : undefined;
    const node: FixtureNode = {
      parent: parent?.id ?? 0, id: ++this.nextId, index: 0, path,
      name: path.slice(split + 1), longName: path.slice(split + 1).toUpperCase(),
      type, flags: type << 4, readOnly: false, value, ...extra,
    };
    if (node.readOnly) node.flags |= 0x200;
    this.nodes.set(path, node); return node;
  }
  node(path: string): FixtureNode { const node = this.nodes.get(path); if (!node) throw new Error('No fixture: ' + path); return node; }
  byId(id: number): FixtureNode | undefined { return [...this.nodes.values()].find(n => n.id === id); }
  async connect(host: string) { this.host = host; this.session = 'schema-' + ++this.serial; return { sessionId: this.session, meterPort: 14135 }; }
  async disconnect() {}
  onPacket(listener: (p: TransportPacket) => void) { this.packets.add(listener); return () => { this.packets.delete(listener); }; }
  onStatus(listener: (s: TransportStatus) => void) { this.statuses.add(listener); return () => { this.statuses.delete(listener); }; }
  async sendUDP() { this.emit(enc.encode('WING,' + this.host + ',Test,ngc-rack,SERIAL,3.1.2'), 'udp'); }
  emit(data: Uint8Array, transport: 'tcp' | 'udp' = 'tcp') { for (const listener of this.packets) listener({ sessionId: this.session, transport, data }); }
  push(path: string, value: WingValue) { const node = this.node(path); node.value = value; this.emit(framed(scalar(node.id, value))); }
  switchModel(value: WingValue, emit = false) {
    const mdl = this.node('/ch/1/eq/mdl'); mdl.value = value;
    const old = this.nodes.get('/ch/1/eq/1q') ?? this.node('/ch/1/eq/lmg');
    this.nodes.delete(old.path);
    const next: FixtureNode = value === 'SOUL'
      ? { ...old, path: '/ch/1/eq/lmg', name: 'lmg', longName: 'LOW MID GAIN', type: 1, flags: 0x11, min: -12, max: 12, steps: 97, value: 0 }
      : { ...old, path: '/ch/1/eq/1q', name: '1q', longName: 'Q', type: 2, flags: 0x20, min: 0.44, max: 10, steps: 181, value: 1 };
    this.nodes.set(next.path, next);
    if (emit) this.emit(framed(scalar(mdl.id, value)));
  }
  reply(id: number) {
    const selected = this.byId(id);
    const nodes = [...this.nodes.values()].filter(n => n.value !== undefined
      && (n.id === id || id === 0 || (selected?.type === 0 && n.path.startsWith(selected.path + '/'))));
    this.emit(framed([...nodes.flatMap(n => scalar(n.id, n.value!)), 0xde]));
  }
  async sendTCP(wire: Uint8Array) {
    expect(wire[0]).toBe(0xdf);
    const bytes: number[] = [];
    for (let i = 2; i < wire.length; i++) {
      bytes.push(wire[i]);
      if (wire[i] === 0xdf) expect(wire[++i]).toBe(0xde);
    }
    const command: Command = { channel: wire[1] - 0xd0, bytes }; this.commands.push(command);
    if (command.channel !== 1 || !bytes.length) return;
    const p = bytes[0] === 0xda ? 1 : 5;
    const id = p === 1 ? 0 : new DataView(Uint8Array.from(bytes.slice(1, 5)).buffer).getUint32(0);
    command.id = id;
    if (bytes[p] === 0xdd) {
      command.kind = 'definition';
      this.emit(framed([...this.nodes.values()].filter(n => n.parent === id).flatMap(def).concat(0xde)));
    } else if (bytes[p] === 0xdc) {
      command.kind = 'get';
      if (!this.held.has(id)) this.reply(id);
    } else {
      command.kind = 'set';
      const token = bytes[p], view = new DataView(Uint8Array.from(bytes.slice(p + 1)).buffer);
      let value: WingValue;
      if (token <= 0x3f) value = token;
      else if (token <= 0xbf && token >= 0x80) value = new TextDecoder().decode(Uint8Array.from(bytes.slice(p + 1, p + token - 0x80 + 2)));
      else if (token === 0xd0) value = '';
      else if (token === 0xd1) value = new TextDecoder().decode(Uint8Array.from(bytes.slice(p + 2, p + 3 + bytes[p + 1])));
      else if (token === 0xd3) value = view.getInt16(0);
      else if (token === 0xd4) value = view.getInt32(0);
      else if (token === 0xd5) value = view.getFloat32(0);
      else throw new Error('Unexpected wire token ' + token);
      command.value = value;
      const node = this.byId(id)!;
      node.value = typeof value === 'number' ? (this.quantize.get(node.path)?.(value) ?? value) : value;
      if (node.path === '/ch/1/eq/mdl') this.switchModel(value, true);
      if (node.path === '/fx/1/load') node.value = 0;
    }
  }
}

const active: WingClient[] = [];
async function setup() {
  const transport = new SchemaConsole(), client = new WingClient(transport);
  active.push(client); await client.connect('192.168.1.62'); return { client, transport };
}
async function flush() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
afterEach(async () => { for (const client of active.splice(0)) await client.disconnect(); });

describe('live schema API and authentic typed writes', () => {
  it('lists the root and returns defensive metadata with firmware bounds, units and enums', async () => {
    const { client } = await setup();
    expect(await client.describe('/')).toMatchObject({ path: '/', type: 0, readOnly: true });
    expect((await client.list('/')).map(n => n.path)).toEqual(expect.arrayContaining(['/ch', '/aux', '/bus', '/main', '/mtx', '/fx', '/io']));
    const fader = await client.describe('/aux/1/fdr');
    expect(fader).toMatchObject({ path: '/aux/1/fdr', type: 3, unit: 1, readOnly: false });
    expect(fader.revision).toBeGreaterThan(0);
    const mode = await client.describe('/ch/1/send/1/mode');
    expect(mode.items?.[0]).toEqual({ value: 'PRE', label: 'Pre' });
    mode.items![0].value = 'BAD';
    await expect(client.set('/ch/1/send/1/mode', 'BAD')).rejects.toThrow(/enumerazione/);
    await client.set('/ch/1/send/1/mode', 'POST');
  });

  it('supports CH, AUX, BUS, MAIN, MTX and routing without the old send-only allowlist', async () => {
    const { client, transport } = await setup();
    for (const family of ['ch', 'aux', 'bus', 'main', 'mtx']) {
      await client.set('/' + family + '/1/fdr', -4.5);
      await client.set('/' + family + '/1/mute', 1);
    }
    await client.set('/io/out/LCL/1/grp', 'MAIN');
    await client.set('/io/out/LCL/1/in', 4);
    expect(transport.node('/aux/1/fdr').value).toBe(-4.5);
    expect(transport.node('/main/1/mute').value).toBe(1);
    expect(transport.node('/io/out/LCL/1/grp').value).toBe('MAIN');
    expect(transport.commands.filter(c => c.kind === 'set')).toHaveLength(12);
  });

  it('uses native string tokens for enum values, float tokens for float enums, and long UTF-8 strings', async () => {
    const { client, transport } = await setup();
    await client.set('/ch/1/send/1/mode', 'POST');
    expect(transport.commands.filter(c => c.kind === 'set').at(-1)?.bytes.slice(5)).toEqual([0x83, 0x50, 0x4f, 0x53, 0x54]);
    await client.set('/$globals/clock', 44100);
    expect(transport.commands.filter(c => c.kind === 'set').at(-1)?.bytes[5]).toBe(0xd5);
    const title = 'é'.repeat(40);
    await client.set('/$ctl/label', title);
    expect(transport.node('/$ctl/label').value).toBe(title);
    expect(transport.commands.filter(c => c.kind === 'set').at(-1)?.bytes.slice(5, 7)).toEqual([0xd1, 79]);
    await client.set('/$ctl/label', '');
    expect(transport.commands.filter(c => c.kind === 'set').at(-1)?.bytes[5]).toBe(0xd0);
  });

  it('rejects read-only, out-of-range, mistyped and unknown values before any set reaches the socket', async () => {
    const { client, transport } = await setup();
    for (const [path, value] of [
      ['/ch/1/$name', 'No'], ['/ch/1/name', '12345678901234567'], ['/mtx/1/mute', 2],
      ['/mtx/1/mute', 0.5], ['/aux/1/fdr', -145], ['/$globals/clock', 96000],
      ['/ch/1/send/1/mode', 0], ['/ch/1/send/1/mode', 'pre'], ['/io/noSuchParameter', 0],
    ] as Array<[string, WingValue]>) await expect(client.set(path, value)).rejects.toThrow();
    expect(transport.commands.filter(c => c.kind === 'set')).toHaveLength(0);
  });

  it('reads immediate channel leaves with one subtree data request without recursively enumerating processors', async () => {
    const { client, transport } = await setup();
    const values = await client.readTree('/ch/1');
    expect(values).toMatchObject({ '/ch/1/fdr': -12, '/ch/1/mute': 0, '/ch/1/name': 'Voce' });
    expect(values['/ch/1/eq/1q']).toBeUndefined();
    expect(transport.commands.filter(c => c.kind === 'get')).toHaveLength(1);
    expect(transport.commands.some(c => c.kind === 'definition' && c.id === transport.node('/ch/1/eq').id)).toBe(false);
    const deeper = await client.readTree('/ch/1', { depth: 1 });
    expect(deeper['/ch/1/eq/1q']).toBe(1);
    await expect(client.readTree('/', { depth: 9 })).rejects.toThrow(/Profondità/);
  });

  it('reads an entire selected processor and accepts documented log-frequency quantization', async () => {
    const { client, transport } = await setup();
    expect(await client.readTree('/ch/1/eq')).toMatchObject({ '/ch/1/eq/mdl': 'STD', '/ch/1/eq/1q': 1, '/ch/1/eq/mix': 100 });
    transport.quantize.set('/fx/1/freq', () => 10018.26);
    await client.set('/fx/1/freq', 10000);
    transport.quantize.set('/fx/1/freq', () => 11000);
    await expect(client.set('/fx/1/freq', 10000)).rejects.toThrow(/non ha confermato/);
  });

  it('treats a self-resetting action as dispatch plus actual readback, not a confirmed persistent value', async () => {
    const { client } = await setup();
    expect(await client.trigger('/fx/1/load')).toEqual({ actual: 0 });
    await expect(client.set('/fx/1/load', 1)).rejects.toThrow(/non ha confermato/);
    await expect(client.trigger('/fx/1/load', 2)).rejects.toThrow(/limiti/);
  });
});

describe('dynamic plugin revisions', () => {
  it('invalidates reused hashes on a model change and rejects old queued parameter writes', async () => {
    const { client, transport } = await setup();
    const before = await client.describe('/ch/1/eq/1q');
    const changes: SchemaChange[] = []; client.onSchemaChange(event => changes.push(event));
    const switched = client.set('/ch/1/eq/mdl', 'SOUL');
    const stale = client.set('/ch/1/eq/1q', 2).catch(error => error);
    await switched;
    expect(await stale).toBeInstanceOf(Error);
    expect(transport.commands.filter(c => c.kind === 'set' && c.id === before.id)).toHaveLength(0);
    const after = await client.describe('/ch/1/eq/lmg');
    expect(after.id).toBe(before.id);
    expect(after).toMatchObject({ name: 'lmg', type: 1, min: -12, max: 12, unit: 1 });
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(changes.at(-1)).toMatchObject({ path: '/ch/1/eq', model: 'SOUL', revision: after.revision });
    await expect(client.describe('/ch/1/eq/1q')).rejects.toThrow(/non disponibile/);
    await client.set('/ch/1/eq/lmg', 4);
    expect(transport.node('/ch/1/eq/lmg').value).toBe(4);
  });

  it('drops stale queued edits and old aliases when the model changes on the physical console', async () => {
    const { client, transport } = await setup();
    const before = await client.describe('/ch/1/eq/1q');
    const busId = transport.node('/bus/1/fdr').id;
    transport.held.add(busId);
    const blocked = client.get('/bus/1/fdr');
    const stale = client.set('/ch/1/eq/1q', 2).catch(error => error);
    await flush();
    const changes: Array<[string, WingValue]> = []; client.onValue((p, v) => changes.push([p, v]));
    transport.switchModel('SOUL', true);
    transport.push('/ch/1/eq/lmg', 6);
    expect(changes.some(([path]) => path === '/ch/1/eq/1q')).toBe(false);
    transport.held.delete(busId); transport.reply(busId);
    await blocked; expect(await stale).toBeInstanceOf(Error);
    await expect(client.set('/ch/1/eq/mix', 50, { revision: before.revision })).rejects.toThrow(/schema/);
    await client.get('/ch/1/eq/lmg'); transport.push('/ch/1/eq/lmg', 3);
    expect(changes.at(-1)).toEqual(['/ch/1/eq/lmg', 3]);
  });

  it('establishes model baseline even when the first operation is a model write', async () => {
    const { client, transport } = await setup();
    const switchModel = client.set('/ch/1/eq/mdl', 'SOUL');
    const stale = client.set('/ch/1/eq/mix', 40).catch(error => error);
    await switchModel;
    expect(await stale).toBeInstanceOf(Error);
    expect(transport.node('/ch/1/eq/mix').value).toBe(100);
  });

  it('invalidates explicit refresh and rejects metadata retained across reconnection', async () => {
    const { client } = await setup();
    const before = await client.describe('/ch/1/eq/mix');
    await client.list('/ch/1/eq', { refresh: true });
    await expect(client.set('/ch/1/eq/mix', 50, { revision: before.revision })).rejects.toThrow(/schema/);
    const refreshed = await client.describe('/ch/1/eq/mix');
    await client.disconnect(); await client.connect('192.168.1.62');
    await expect(client.set('/ch/1/eq/mix', 50, { revision: refreshed.revision })).rejects.toThrow(/schema/);
  });
});

describe('real strip metering for every WING family', () => {
  it('encodes the documented group codes and zero-based channel indexes in canonical order', () => {
    const wire = encodeStripMeterRequest(14135, { reportId: 7, selection: { mtx: [8], aux: [8], main: [4], bus: [16], ch: [1, 40] } });
    expect([...wire]).toEqual([0xdf, 0xd3, 0xd3, 0x37, 0x37, 0xd4, 0, 0, 0, 7, 0xdc, 0xa0, 0, 39, 0xa1, 7, 0xa2, 15, 0xa3, 3, 0xa4, 7, 0xde]);
    for (const selection of [{}, { ch: [0] }, { ch: [41] }, { aux: [9] }, { bus: [17] }, { main: [5] }, { mtx: [9] }, { ch: [1, 1] }]) {
      expect(() => validateStripMeterSelection(selection)).toThrow(/selection/);
    }
  });

  it('decodes stereo inputs/outputs and raw processor gain data for all 76 strips', () => {
    const indexes = (count: number) => Array.from({ length: count }, (_, i) => i + 1);
    const report = { reportId: 0x12345678, selection: { ch: indexes(40), aux: indexes(8), bus: indexes(16), main: indexes(4), mtx: indexes(8) } };
    const packet = new Uint8Array(4 + 76 * 16), view = new DataView(packet.buffer);
    view.setUint32(0, report.reportId);
    for (let i = 0; i < 76; i++) {
      const p = 4 + i * 16;
      [-40, -30, -20, -10, -50].forEach((v, n) => view.setInt16(p + 2 * n, v * 256));
      view.setInt16(p + 10, 128); view.setInt16(p + 12, -60 * 256); view.setInt16(p + 14, -33);
    }
    const frame = decodeStripMeterPacket(packet, report, 123)!;
    expect(frame).toMatchObject({ reportId: 0x12345678, receivedAt: 123, channels: { 40: -30 }, auxiliaries: { 8: -30 }, buses: { 16: -10 }, mains: { 4: -10 }, matrices: { 8: -10 } });
    expect(frame.strips.mtx[8]).toEqual({ input: [-40, -30], output: [-20, -10], gateKey: -50, gateGainRaw: 128, dynKey: -60, dynGainRaw: -33 });
    expect(decodeStripMeterPacket(packet, { ...report, reportId: 1 })).toBeUndefined();
    expect(decodeStripMeterPacket(packet.subarray(1), report)).toBeUndefined();
  });

  it('uses the same public meter stream for extended/legacy selections without late report contamination', async () => {
    const { client, transport } = await setup();
    const frames: StripMeterFrame[] = []; client.onStripMeters(frame => frames.push(frame));
    await client.subscribeStripMeters({ aux: [8], main: [4], mtx: [8] });
    const command = transport.commands.at(-1)!;
    const reportId = new DataView(Uint8Array.from(command.bytes.slice(4, 8)).buffer).getUint32(0);
    const packet = new Uint8Array(52), view = new DataView(packet.buffer); view.setUint32(0, reportId);
    view.setInt16(4, -12 * 256); view.setInt16(6, -6 * 256); transport.emit(packet, 'udp');
    expect(frames[0].auxiliaries[8]).toBe(-6);
    await client.subscribeMeters([1], 1);
    transport.emit(packet, 'udp');
    expect(frames).toHaveLength(1);
  });
});
