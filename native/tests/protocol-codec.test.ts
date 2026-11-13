import { describe, expect, it } from 'vitest';
import {
  decodeIdentity, decodeMeterPacket, decodeNodeDefinition, encodeChannel, encodeKeepalive,
  encodeMeterRenewal, encodeMeterRequest, encodeRequest, encodeSet, validateConsoleHost,
  WingStreamDecoder, type ControlToken,
} from '../src/wing/protocol';
import { readbackMatches, validateWrite } from '../src/wing/client';
import type { NodeDefinition } from '../src/wing/types';

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.replace(/\s/g, '').match(/.{2}/g)!.map(pair => parseInt(pair, 16)));
}
function values(tokens: ControlToken[]) { return tokens.filter(token => token.kind === 'value'); }

describe('documented native WING control bytes', () => {
  it('encodes root/hash requests and protects literal escape bytes', () => {
    expect(encodeRequest(0, 'definition')).toEqual(hex('df d1 da dd'));
    expect(encodeRequest(0x12dfd456, 'data')).toEqual(hex('df d1 d7 12 df de d4 56 dc'));
    expect(encodeSet(0x12345678, -12.5)).toEqual(hex('df d1 d7 12 34 56 78 d5 c1 48 00 00'));
    expect(encodeSet(0x12345678, 1, 'integer')).toEqual(hex('df d1 d7 12 34 56 78 01'));
    expect(encodeKeepalive()).toEqual(hex('df d1'));
    expect(encodeChannel(1, [0xdf, 0xdf, 0xd1])).toEqual(hex('df d1 df de df de d1'));
  });

  it('decodes the same escaped float reply at every TCP split point', () => {
    // Hash 12DFD456, float -12.5 dB, request end. Fixture does not use our encoder.
    const bytes = hex('df d1 d7 12 df de d4 56 d5 c1 48 00 00 de');
    for (let cut = 0; cut <= bytes.length; cut++) {
      const decoder = new WingStreamDecoder();
      const tokens = [...decoder.feed(bytes.subarray(0, cut)), ...decoder.feed(bytes.subarray(cut))];
      expect(tokens).toEqual([
        { kind: 'select', id: 0x12dfd456 },
        { kind: 'value', id: 0x12dfd456, value: -12.5, normalized: false },
        { kind: 'end' },
      ]);
    }
  });

  it('handles unquoted DF followed by a non-reserved byte, and repeated DF', () => {
    const decoder = new WingStreamDecoder();
    const raw = hex('df d1 d7 df e0 66 c1 d3 00 7f de d7 df df 0e 02 03 de');
    const tokens = [...raw].flatMap(byte => decoder.feed(Uint8Array.of(byte)));
    expect(values(tokens)).toEqual([
      { kind: 'value', id: 0xdfe066c1, value: 127, normalized: false },
      { kind: 'value', id: 0xdfdf0e02, value: 3, normalized: false },
    ]);
  });

  it('preserves a partial control token across another communication channel', () => {
    const decoder = new WingStreamDecoder();
    const tokens = decoder.feed(hex('df d1 d7 00 00 00 05 d5 c1 df d3 d4 01 02 03 04 df d1 48 00 00 de'));
    expect(values(tokens)).toEqual([{ kind: 'value', id: 5, value: -12.5, normalized: false }]);
  });

  it('decodes coalesced signed integers, UTF-8 strings, empty strings, normalized floats', () => {
    const decoder = new WingStreamDecoder();
    const tokens = decoder.feed(hex('df d1 d7 00 00 00 02 d3 ff 7f d4 ff ff 00 00 81 c3 a8 d0 d6 3f 00 00 00 de'));
    expect(values(tokens).map(token => token.kind === 'value' && [token.value, token.normalized]))
      .toEqual([[-129, false], [-65536, false], ['è', false], ['', false], [0.5, true]]);
  });

  it('decodes the definition header, direct string lengths, and extended length prefix', () => {
    // parent 0, id 11223344, index 1, name ch, long name Channels, type node.
    const body = hex('00000000 11223344 0001 02 6368 08 4368616e6e656c73 0000');
    expect(body.length).toBe(24);
    const expected = { parent: 0, id: 0x11223344, index: 1, name: 'ch', longName: 'Channels', flags: 0, type: 0, readOnly: false };
    expect(decodeNodeDefinition(body)).toEqual(expected);
    for (const header of ['df d1 df de 0018', 'df d1 df de 0000 00000018']) {
      const decoder = new WingStreamDecoder();
      const bytes = Uint8Array.from([...hex(header), ...body, 0xde]);
      const tokens = [...bytes].flatMap(byte => decoder.feed(Uint8Array.of(byte)));
      expect(tokens).toEqual([{ kind: 'definition', definition: expected }, { kind: 'end' }]);
    }
  });

  it('decodes read-only integer bounds and enum metadata', () => {
    // parent 1, id 2, index 1, name on, empty long name, RO int, bounds 0..1.
    expect(decodeNodeDefinition(hex('00000001 00000002 0001 02 6f6e 00 0240 00000000 00000001')))
      .toMatchObject({ type: 4, readOnly: true, min: 0, max: 1 });
    // name mode, string enum { PRE: Pre, POST: Post }.
    expect(decodeNodeDefinition(hex('00000001 00000003 0002 04 6d6f6465 00 0050 0002 03 505245 03 507265 04 504f5354 04 506f7374')))
      .toMatchObject({ type: 5, items: [{ value: 'PRE', label: 'Pre' }, { value: 'POST', label: 'Post' }] });
  });

  it('parses actual native definition bodies published in the protocol document', () => {
    // Published root /ch and /bus entries from the native OSC-blob example.
    // These hashes are fixtures only: production discovers them from the mixer.
    expect(decodeNodeDefinition(hex('00000000 70b10139 0000 02 6368 07 4348414e4e454c 0000')))
      .toMatchObject({ parent: 0, id: 0x70b10139, index: 0, name: 'ch', longName: 'CHANNEL', type: 0 });
    expect(decodeNodeDefinition(hex('00000000 f46c185e 0000 03 627573 03 425553 0000')))
      .toMatchObject({ parent: 0, id: 0xf46c185e, index: 0, name: 'bus', type: 0 });
    // Published /$ctl/daw/on child: its parent is the requested DAW hash.
    expect(decodeNodeDefinition(hex('df17c242 3cb129d5 0000 02 6f6e 0a 44415720454e41424c45 0040 00000000 00000001')))
      .toMatchObject({ parent: 0xdf17c242, id: 0x3cb129d5, name: 'on', type: 4, min: 0, max: 1 });
  });

  it('rejects malformed/oversized definitions and unknown/non-finite tokens', () => {
    expect(() => decodeNodeDefinition(hex('00000000 00000001 0001 20 61'))).toThrow(/Truncated/);
    expect(() => new WingStreamDecoder().feed(hex('df d1 df de 0000 00040001'))).toThrow(/length/);
    expect(() => new WingStreamDecoder().feed(hex('df d1 ff'))).toThrow(/Unknown/);
    expect(() => new WingStreamDecoder().feed(hex('df d1 d5 7f800000'))).toThrow(/Non-finite/);
    expect(() => encodeSet(1, Number.NaN)).toThrow(/non-finite/);
    expect(() => encodeSet(1, 1e100)).toThrow(/32-bit/);
    expect(() => encodeSet(1, 'x'.repeat(257))).toThrow(/256/);
  });

  it('retains a partial long string without emitting a premature value', () => {
    const decoder = new WingStreamDecoder();
    expect(decoder.feed(hex('df d1 d7 00000001 d1 02 61'))).toEqual([{ kind: 'select', id: 1 }]);
    expect(decoder.feed(hex('62 63 de'))).toEqual([
      { kind: 'value', id: 1, value: 'abc', normalized: false }, { kind: 'end' },
    ]);
  });
});

describe('native UDP metering and identity', () => {
  it('requests the documented meter channel, UDP port, and zero-based indexes', () => {
    expect(encodeMeterRequest(14135, { reportId: 2, channels: [2], bus: 1 }))
      .toEqual(hex('df d3 d3 3737 d4 00000002 dc a0 01 a2 00 de'));
    expect(encodeMeterRenewal(2)).toEqual(hex('df d3 d4 00000002'));
    expect(() => encodeMeterRequest(14135, { reportId: 2, channels: [1, 1], bus: 1 })).toThrow(/selection/);
  });

  it('reads signed BE dB/256 and picks channel inputs / bus outputs, ignoring stale reports', () => {
    const bytes = hex('11223344 ec00 e200 fb00 fa00 0000 0000 0000 0000 d800 f400 fd00 fc00 0000 0000 0000 0000 0000 0000 ee00 f600 0000 0000 0000 0000');
    const selection = { reportId: 0x11223344, channels: [1, 8], bus: 16 };
    expect(decodeMeterPacket(bytes, selection, 1234)).toEqual({ channels: { 1: -20, 8: -12 }, buses: { 16: -10 }, receivedAt: 1234 });
    expect(decodeMeterPacket(bytes, { ...selection, reportId: 1 })).toBeUndefined();
    expect(decodeMeterPacket(bytes.subarray(0, bytes.length - 1), selection)).toBeUndefined();
    expect(decodeMeterPacket(new Uint8Array(4096), selection)).toBeUndefined();
  });

  it('requires an actual identity reply from the selected IP', () => {
    const bytes = new TextEncoder().encode('WING,192.168.1.62,Stage,ngc-rack,SERIAL,3.1.2\0');
    expect(decodeIdentity(bytes, '192.168.1.62')).toEqual({ host: '192.168.1.62', name: 'Stage', model: 'ngc-rack', firmware: '3.1.2' });
    expect(decodeIdentity(bytes, '192.168.1.63')).toBeUndefined();
    expect(decodeIdentity(new TextEncoder().encode('WING?'), '192.168.1.62')).toBeUndefined();
    expect(decodeIdentity(new TextEncoder().encode('WING,192.168.1.62,Stage,ngc-rack,SERIAL,'), '192.168.1.62')).toBeUndefined();
  });

  it('accepts literal local IPs and rejects public/ambiguous endpoints', () => {
    for (const host of ['192.168.1.62', '10.20.0.2', '172.16.0.2', '172.31.255.2', '169.254.5.2']) expect(validateConsoleHost(host)).toBe(host);
    for (const host of ['wing.local', 'https://192.168.1.62', '127.0.0.1', '8.8.8.8', '192.168.1.256', '192.168.01.2', '192.168.1.255', '224.0.0.1']) {
      expect(() => validateConsoleHost(host)).toThrow();
    }
  });
});

describe('firmware-defined write boundary', () => {
  const node = (type: NodeDefinition['type'], extra: Partial<NodeDefinition> = {}): NodeDefinition => ({
    parent: 0, id: 1, index: 1, name: 'test', longName: 'TEST', flags: type << 4,
    type, readOnly: false, ...extra,
  });
  it('validates all supported leaf types against firmware metadata', () => {
    expect(validateWrite('/ch/40/send/16/lvl', -144, node(3))).toBe('float');
    expect(validateWrite('/io/in/LCL/1/vph', 1, node(4, { min: 0, max: 1 }))).toBe('integer');
    expect(validateWrite('/ch/1/name', 'Voce', node(7, { maxLength: 16 }))).toBe('float');
    expect(validateWrite('/ch/1/send/1/mode', 'PRE', node(5, { items: [{ value: 'PRE', label: 'Pre fader' }] }))).toBe('float');
    expect(validateWrite('/cfg/clock', 48000, node(6, { items: [{ value: 48000, label: '48 kHz' }] }))).toBe('float');
    expect(() => validateWrite('/bus/1/fdr', 10.1, node(3))).toThrow(/limiti/);
    expect(() => validateWrite('/ch/1/mute', 0.5, node(4, { min: 0, max: 1 }))).toThrow(/intero/);
    expect(() => validateWrite('/ch/1/mute', 2, node(4, { min: 0, max: 1 }))).toThrow(/limiti/);
    expect(() => validateWrite('/ch/1/mute', 0, node(4, { readOnly: true }))).toThrow(/sola lettura/);
    expect(() => validateWrite('/ch/1', 0, node(0))).toThrow(/parametro/);
    expect(() => validateWrite('/ch/1/eq/mdl', 0, node(5, { items: [{ value: 'STD', label: 'Standard' }] }))).toThrow(/enumerazione/);
    expect(() => validateWrite('/ch/1/eq/mdl', 'UNKNOWN', node(5, { items: [{ value: 'STD', label: 'Standard' }] }))).toThrow(/enumerazione/);
    expect(() => validateWrite('/ch/1/name', 'èèè', node(7, { maxLength: 5 }))).toThrow(/Stringa/);
    expect(() => validateWrite('/bus/1/fdr/', 0, node(3))).toThrow(/path/);
    expect(() => validateWrite('/bus/1/fdr', '-10', node(3))).toThrow(/numero/);
  });

  it('confirms numeric values with float32 precision and each declared quantization scale', () => {
    expect(readbackMatches(node(1, { min: -15, max: 15, steps: 301 }), 1.04, 1)).toBe(true);
    expect(readbackMatches(node(1, { min: -15, max: 15, steps: 301 }), 1.08, 1)).toBe(false);
    const frequency = node(2, { min: 20, max: 20000, steps: 961 });
    expect(readbackMatches(frequency, 10000, 10018.26)).toBe(true);
    expect(readbackMatches(frequency, 10000, 10100)).toBe(false);
    expect(readbackMatches(node(6), 0.1, Math.fround(0.1))).toBe(true);
    expect(readbackMatches(node(4), 1, 0.999)).toBe(false);
    expect(readbackMatches(node(3), -12, -12.1)).toBe(false);
    expect(readbackMatches(node(3), -12.3, Math.fround(-12.3))).toBe(true);
    expect(readbackMatches(node(5), 'PRE', 'POST')).toBe(false);
  });
});
