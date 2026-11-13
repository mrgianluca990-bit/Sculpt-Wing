import type { ConsoleInfo, MeterFrame, WingValue, NodeDefinition, StripMeterSelection, StripFamily, StripMeterFrame } from './types';
export type { NodeDefinition, NodeMetadata } from './types';

/** WING native TCP/UDP protocol. Wire IDs, not the one-based channel labels. */
export const CONTROL_CHANNEL = 1;
export const METER_CHANNEL = 3;
export const MAX_DEFINITION_BYTES = 256 * 1024;
const MAX_STREAM_BUFFER = 1024 * 1024;
const encoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export class WingProtocolError extends Error {
  constructor(message: string) { super(message); this.name = 'WingProtocolError'; }
}

export type ControlToken =
  | { kind: 'select'; id: number }
  | { kind: 'value'; id: number | undefined; value: WingValue; normalized: boolean }
  | { kind: 'definition'; definition: NodeDefinition }
  | { kind: 'end' }
  | { kind: 'request'; request: 'data' | 'definition' }
  | { kind: 'navigate'; direction: 'root' | 'up' | 'index' | 'name'; value?: number | string }
  | { kind: 'action'; action: 'toggle' | 'step'; value?: number };

function fail(message: string): never { throw new WingProtocolError(message); }

class Reader {
  offset = 0;
  private readonly view: DataView;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  need(length: number): void {
    if (length < 0 || this.offset + length > this.bytes.length) fail('Truncated WING node definition');
  }
  u8(): number { this.need(1); return this.bytes[this.offset++]; }
  u16(): number { this.need(2); const v = this.view.getUint16(this.offset); this.offset += 2; return v; }
  u32(): number { this.need(4); const v = this.view.getUint32(this.offset); this.offset += 4; return v; }
  i32(): number { this.need(4); const v = this.view.getInt32(this.offset); this.offset += 4; return v; }
  f32(): number {
    this.need(4); const v = this.view.getFloat32(this.offset); this.offset += 4;
    if (!Number.isFinite(v)) fail('Non-finite value in WING node definition');
    return v;
  }
  string(length: number): string {
    this.need(length);
    const s = decodeText(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return s;
  }
  countedString(): string { return this.string(this.u8()); }
  finish(): void {
    if (this.offset !== this.bytes.length) fail('Unexpected data in WING node definition');
  }
}

function decodeText(bytes: Uint8Array): string {
  try { return textDecoder.decode(bytes); }
  catch { return fail('Invalid UTF-8 in WING response'); }
}

/** Parse a definition body, excluding DF and its length prefix. */
export function decodeNodeDefinition(bytes: Uint8Array): NodeDefinition {
  if (bytes.length > MAX_DEFINITION_BYTES) fail('WING node definition exceeds limit');
  const r = new Reader(bytes);
  const parent = r.u32(), id = r.u32(), index = r.u16();
  const name = r.countedString(), longName = r.countedString(), flags = r.u16();
  const type = (flags >>> 4) & 15;
  if (type > 7) fail(`Unsupported WING node type ${type}`);
  const node: NodeDefinition = {
    parent, id, index, name, longName, flags,
    type: type as NodeDefinition['type'], readOnly: (flags & 0x200) !== 0,
  };
  if (type === 1 || type === 2) {
    node.min = r.f32(); node.max = r.f32(); node.steps = r.i32();
  } else if (type === 4) {
    node.min = r.i32(); node.max = r.i32();
  } else if (type === 5 || type === 6) {
    const count = r.u16();
    // Every enum entry requires at least two bytes. Check before allocating.
    if (count > bytes.length / 2) fail('Invalid WING enum count');
    node.items = [];
    for (let i = 0; i < count; i++) {
      const value = type === 5 ? r.countedString() : r.f32();
      node.items.push({ value, label: r.countedString() });
    }
  } else if (type === 7) {
    node.maxLength = r.u16();
  }
  if (node.min !== undefined && node.max !== undefined && node.min > node.max) fail('Invalid WING node range');
  r.finish();
  return node;
}

/** Incremental escape + token decoder. It never assumes a TCP chunk is a message. */
export class WingStreamDecoder {
  private escaped = false;
  private channel = -1;
  private currentNode: number | undefined = 0;
  private pending: number[] = [];

  reset(): void {
    this.escaped = false; this.channel = -1; this.currentNode = 0; this.pending = [];
  }

  feed(chunk: Uint8Array): ControlToken[] {
    if (chunk.length > MAX_STREAM_BUFFER) fail('Oversized WING TCP chunk');
    for (const byte of chunk) {
      if (byte === 0xdf && !this.escaped) { this.escaped = true; continue; }
      if (this.escaped) {
        // DF DF emits one DF and leaves escape mode active (manufacturer algorithm).
        if (byte !== 0xdf) {
          this.escaped = false;
          if (byte === 0xde) { this.append(0xdf); continue; }
          if (byte >= 0xd0 && byte <= 0xdd) { this.channel = byte - 0xd0; continue; }
          this.append(0xdf);
        }
      }
      this.append(byte);
    }
    return this.parse();
  }

  private append(byte: number): void {
    // Channels other than control may be interleaved; their bytes are not control tokens.
    if (this.channel !== CONTROL_CHANNEL) return;
    if (this.pending.length >= MAX_STREAM_BUFFER) fail('WING stream buffer exceeds limit');
    this.pending.push(byte);
  }

  private parse(): ControlToken[] {
    const data = Uint8Array.from(this.pending);
    const view = new DataView(data.buffer);
    const tokens: ControlToken[] = [];
    let p = 0;
    const value = (v: WingValue, normalized = false): void => {
      if (typeof v === 'number' && !Number.isFinite(v)) fail('Non-finite WING value');
      tokens.push({ kind: 'value', id: this.currentNode, value: v, normalized });
    };
    while (p < data.length) {
      const start = p, token = data[p++];
      let length = 0;
      if (token <= 0x3f) { value(token); continue; }
      if (token <= 0x7f) {
        this.currentNode = undefined;
        tokens.push({ kind: 'navigate', direction: 'index', value: token - 0x40 + 1 });
        continue;
      }
      if (token <= 0xcf) {
        length = token < 0xc0 ? token - 0x80 + 1 : token - 0xc0 + 1;
        if (data.length - p < length) { p = start; break; }
        const s = decodeText(data.subarray(p, p + length)); p += length;
        if (token < 0xc0) value(s);
        else {
          this.currentNode = undefined;
          tokens.push({ kind: 'navigate', direction: 'name', value: s });
        }
        continue;
      }
      switch (token) {
        case 0xd0: value(''); break;
        case 0xd1:
          if (data.length - p < 1) { p = start; break; }
          length = data[p] + 1;
          if (data.length - p - 1 < length) { p = start; break; }
          p++; value(decodeText(data.subarray(p, p + length))); p += length; break;
        case 0xd2:
        case 0xd3:
          if (data.length - p < 2) { p = start; break; }
          if (token === 0xd2) {
            this.currentNode = undefined;
            tokens.push({ kind: 'navigate', direction: 'index', value: view.getUint16(p) + 1 });
          } else value(view.getInt16(p));
          p += 2; break;
        case 0xd4:
        case 0xd5:
        case 0xd6:
        case 0xd7:
          if (data.length - p < 4) { p = start; break; }
          if (token === 0xd7) {
            this.currentNode = view.getUint32(p);
            tokens.push({ kind: 'select', id: this.currentNode });
          } else if (token === 0xd4) value(view.getInt32(p));
          else value(view.getFloat32(p), token === 0xd6);
          p += 4; break;
        case 0xd8: tokens.push({ kind: 'action', action: 'toggle' }); break;
        case 0xd9:
          if (data.length - p < 1) { p = start; break; }
          tokens.push({ kind: 'action', action: 'step', value: view.getInt8(p++) }); break;
        case 0xda:
          this.currentNode = 0;
          tokens.push({ kind: 'navigate', direction: 'root' }); break;
        case 0xdb:
          this.currentNode = undefined;
          tokens.push({ kind: 'navigate', direction: 'up' }); break;
        case 0xdc: tokens.push({ kind: 'request', request: 'data' }); break;
        case 0xdd: tokens.push({ kind: 'request', request: 'definition' }); break;
        case 0xde: tokens.push({ kind: 'end' }); break;
        case 0xdf: {
          if (data.length - p < 2) { p = start; break; }
          length = view.getUint16(p); p += 2;
          if (length === 0) {
            if (data.length - p < 4) { p = start; break; }
            length = view.getUint32(p); p += 4;
          }
          if (length < 14 || length > MAX_DEFINITION_BYTES) fail('Invalid WING definition length');
          if (data.length - p < length) { p = start; break; }
          tokens.push({ kind: 'definition', definition: decodeNodeDefinition(data.subarray(p, p + length)) });
          p += length; break;
        }
        default: fail(`Unknown WING control token 0x${token.toString(16)}`);
      }
      if (p === start) break;
    }
    this.pending = this.pending.slice(p);
    return tokens;
  }
}

function uint32(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) fail('Invalid unsigned 32-bit value');
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

/** Prefix every write with its wire channel and quote all literal DF bytes. */
export function encodeChannel(channel: number, payload: Uint8Array | number[]): Uint8Array {
  if (!Number.isInteger(channel) || channel < 0 || channel > 13) fail('Invalid WING channel');
  const bytes = [0xdf, 0xd0 + channel];
  for (const byte of payload) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) fail('Invalid WING byte');
    bytes.push(byte);
    if (byte === 0xdf) bytes.push(0xde);
  }
  return Uint8Array.from(bytes);
}

export function encodeRequest(id: number, kind: 'data' | 'definition'): Uint8Array {
  const selection = id === 0 ? [0xda] : [0xd7, ...uint32(id)];
  return encodeChannel(CONTROL_CHANNEL, [...selection, kind === 'data' ? 0xdc : 0xdd]);
}

export function encodeSet(id: number, value: WingValue, numericType: 'float' | 'integer' = 'float'): Uint8Array {
  let encoded: number[];
  if (typeof value === 'string') {
    const bytes = encoder.encode(value);
    if (bytes.length > 256) fail('WING string exceeds 256 bytes');
    encoded = bytes.length === 0 ? [0xd0]
      : bytes.length <= 64 ? [0x80 + bytes.length - 1, ...bytes]
      : [0xd1, bytes.length - 1, ...bytes];
  } else {
    if (!Number.isFinite(value)) fail('Cannot write non-finite WING value');
    const data = new Uint8Array(4), view = new DataView(data.buffer);
    if (numericType === 'integer') {
      if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) fail('Invalid WING integer');
      if (value >= 0 && value <= 63) encoded = [value];
      else if (value >= -32768 && value <= 32767) {
        view.setInt16(0, value); encoded = [0xd3, data[0], data[1]];
      } else { view.setInt32(0, value); encoded = [0xd4, ...data]; }
    } else {
      view.setFloat32(0, value);
      if (!Number.isFinite(view.getFloat32(0))) fail('WING float exceeds 32-bit range');
      encoded = [0xd5, ...data];
    }
  }
  return encodeChannel(CONTROL_CHANNEL, [0xd7, ...uint32(id), ...encoded]);
}

export function encodeKeepalive(): Uint8Array { return encodeChannel(CONTROL_CHANNEL, []); }

export interface MeterSelection { reportId: number; channels: number[]; bus: number; }

export function validateMeterSelection(channels: number[], bus: number): void {
  if (channels.length < 1 || channels.length > 8 || new Set(channels).size !== channels.length
    || channels.some(n => !Number.isInteger(n) || n < 1 || n > 40)
    || !Number.isInteger(bus) || bus < 1 || bus > 16) fail('Invalid WING meter selection');
}

export function encodeMeterRequest(port: number, selection: MeterSelection): Uint8Array {
  validateMeterSelection(selection.channels, selection.bus);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('Invalid UDP meter port');
  return encodeChannel(METER_CHANNEL, [
    0xd3, port >>> 8, port & 255, 0xd4, ...uint32(selection.reportId), 0xdc,
    0xa0, ...selection.channels.map(n => n - 1), 0xa2, selection.bus - 1, 0xde,
  ]);
}

export function encodeMeterRenewal(reportId: number): Uint8Array {
  return encodeChannel(METER_CHANNEL, [0xd4, ...uint32(reportId)]);
}

/** Unescaped UDP payload; eight signed BE words per channel/bus, in requested order. */
export function decodeMeterPacket(bytes: Uint8Array, selection: MeterSelection, receivedAt = Date.now()): MeterFrame | undefined {
  if (bytes.length !== 4 + 16 * (selection.channels.length + 1)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== selection.reportId) return undefined;
  const channels: Record<number, number> = {};
  selection.channels.forEach((channel, i) => {
    const p = 4 + i * 16;
    channels[channel] = Math.max(view.getInt16(p), view.getInt16(p + 2)) / 256;
  });
  const busOffset = 4 + selection.channels.length * 16 + 4;
  const busLevel = Math.max(view.getInt16(busOffset), view.getInt16(busOffset + 2)) / 256;
  return { channels, buses: { [selection.bus]: busLevel }, receivedAt };
}

/** Canonical order is part of the UDP report contract. Indexes on wire are zero-based. */
export const STRIP_FAMILIES: readonly StripFamily[] = ['ch', 'aux', 'bus', 'main', 'mtx'];
const STRIP_LIMITS: Record<StripFamily, number> = { ch: 40, aux: 8, bus: 16, main: 4, mtx: 8 };
export interface StripMeterReport { reportId: number; selection: StripMeterSelection; }

export function validateStripMeterSelection(selection: StripMeterSelection): void {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)
    || Object.keys(selection).some(key => !STRIP_FAMILIES.includes(key as StripFamily))) fail('Invalid WING strip meter selection');
  let count = 0;
  for (const family of STRIP_FAMILIES) {
    const indexes = selection[family] ?? [];
    if (!Array.isArray(indexes) || new Set(indexes).size !== indexes.length
      || indexes.some(n => !Number.isInteger(n) || n < 1 || n > STRIP_LIMITS[family])) fail('Invalid WING strip meter selection');
    count += indexes.length;
  }
  if (!count || count > 76) fail('Invalid WING strip meter selection');
}

export function encodeStripMeterRequest(port: number, report: StripMeterReport): Uint8Array {
  validateStripMeterSelection(report.selection);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('Invalid UDP meter port');
  if (!Number.isInteger(report.reportId) || report.reportId < 1 || report.reportId > 0xffffffff) fail('Invalid WING meter report ID');
  const payload = [0xd3, port >>> 8, port & 255, 0xd4, ...uint32(report.reportId), 0xdc];
  STRIP_FAMILIES.forEach((family, i) => {
    const indexes = report.selection[family] ?? [];
    if (indexes.length) payload.push(0xa0 + i, ...indexes.map(n => n - 1));
  });
  return encodeChannel(METER_CHANNEL, [...payload, 0xde]);
}

/** Standard strip reports have eight signed BE words, never fabricated gain reduction. */
export function decodeStripMeterPacket(bytes: Uint8Array, report: StripMeterReport, receivedAt = Date.now()): StripMeterFrame | undefined {
  const count = STRIP_FAMILIES.reduce((n, family) => n + (report.selection[family]?.length ?? 0), 0);
  if (bytes.length !== 4 + 16 * count) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== report.reportId) return undefined;
  const frame: StripMeterFrame = {
    channels: {}, auxiliaries: {}, buses: {}, mains: {}, matrices: {},
    strips: { ch: {}, aux: {}, bus: {}, main: {}, mtx: {} }, reportId: report.reportId, receivedAt,
  };
  const scalarMaps = { ch: frame.channels, aux: frame.auxiliaries, bus: frame.buses, main: frame.mains, mtx: frame.matrices };
  let p = 4;
  for (const family of STRIP_FAMILIES) {
    for (const index of report.selection[family] ?? []) {
      const input: [number, number] = [view.getInt16(p) / 256, view.getInt16(p + 2) / 256];
      const output: [number, number] = [view.getInt16(p + 4) / 256, view.getInt16(p + 6) / 256];
      frame.strips[family][index] = {
        input, output, gateKey: view.getInt16(p + 8) / 256, gateGainRaw: view.getInt16(p + 10),
        dynKey: view.getInt16(p + 12) / 256, dynGainRaw: view.getInt16(p + 14),
      };
      scalarMaps[family][index] = Math.max(...(family === 'ch' || family === 'aux' ? input : output));
      p += 16;
    }
  }
  return frame;
}

export const IDENTITY_REQUEST = encoder.encode('WING?');

/** Literal RFC1918/link-local unicast address. Hostnames/public IPs are intentionally excluded. */
export function validateConsoleHost(host: string): string {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) fail('Enter a literal local IPv4 address');
  const octets = host.split('.').map(Number);
  if (octets.some((n, i) => n > 255 || String(n) !== host.split('.')[i])) fail('Invalid IPv4 address');
  const [a, b, c, d] = octets;
  const local = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 169 && b === 254 && c >= 1 && c <= 254);
  if (!local || d === 0 || d === 255) fail('Use a local, unicast WING IPv4 address');
  return host;
}

export function decodeIdentity(bytes: Uint8Array, host: string): ConsoleInfo | undefined {
  if (bytes.length < 6 || bytes.length > 1024) return undefined;
  // Meter data must not be interpreted as text.
  if (bytes[0] !== 0x57 || bytes[1] !== 0x49 || bytes[2] !== 0x4e || bytes[3] !== 0x47 || bytes[4] !== 0x2c) return undefined;
  let text: string;
  try { text = decodeText(bytes).replace(/[\0\r\n]+$/, ''); } catch { return undefined; }
  const fields = text.split(',');
  if (fields.length !== 6 || fields[0] !== 'WING' || fields[1] !== host
    || !fields[3] || !fields[5] || fields.some(s => /[\u0000-\u001f\u007f]/.test(s))) return undefined;
  return { host, name: fields[2], model: fields[3], firmware: fields[5] };
}
