import { describe, expect, it } from 'vitest';
import { decodeStripMeterPacket, encodeStripMeterRequest, RTA_FREQUENCIES_HZ, type StripMeterReport } from '../src/wing/protocol';

const hex = (value: string) => Uint8Array.from(value.replace(/\s/g, '').match(/.{2}/g)!.map(pair => parseInt(pair, 16)));

describe('native WING RTA report contract', () => {
  it('appends singleton 0xAA without an index and keeps all 76 strips plus RTA below the IPv4 Ethernet MTU', () => {
    expect(encodeStripMeterRequest(14135, { reportId: 0x12df3456, selection: { ch: [1], mtx: [8] }, rta: true }))
      .toEqual(hex('df d3 d3 37 37 d4 12 df de 34 56 dc a0 00 a4 07 aa de'));
    const report: StripMeterReport = { reportId: 7, rta: true, selection: {
      ch: Array.from({ length: 40 }, (_, i) => i + 1), aux: Array.from({ length: 8 }, (_, i) => i + 1),
      bus: Array.from({ length: 16 }, (_, i) => i + 1), main: [1, 2, 3, 4], mtx: [1, 2, 3, 4, 5, 6, 7, 8],
    } };
    const packet = new Uint8Array(4 + 76 * 16 + 120 * 2); new DataView(packet.buffer).setUint32(0, 7);
    expect(packet.byteLength).toBe(1460); expect(packet.byteLength + 20 + 8).toBeLessThanOrEqual(1500);
    const frame = decodeStripMeterPacket(packet, report)!;
    expect(Object.keys(frame.strips.ch)).toHaveLength(40); expect(Object.keys(frame.strips.mtx)).toHaveLength(8);
    expect(frame.rta?.binsRaw).toHaveLength(120);
  });

  it('preserves signed big-endian RTA words independently from strip dB and rejects stale report framing', () => {
    const report: StripMeterReport = { reportId: 19, selection: { ch: [1] }, rta: true };
    const packet = new Uint8Array(4 + 16 + 240), view = new DataView(packet.buffer);
    view.setUint32(0, 19); view.setInt16(4, -12 * 256); view.setInt16(6, -15 * 256);
    for (let i = 0; i < 120; i++) view.setInt16(20 + i * 2, -32768 + i * 100);
    view.setInt16(20, -32768); view.setInt16(22, 32767); view.setInt16(24, -1); view.setInt16(26, -8448); // DF00 is unescaped on UDP.
    const frame = decodeStripMeterPacket(packet, report, 1234)!;
    expect(frame.channels[1]).toBe(-12);
    expect(frame.rta).toMatchObject({ reportId: 19, receivedAt: 1234 });
    expect(frame.rta!.binsRaw.slice(0, 4)).toEqual([-32768, 32767, -1, -8448]);
    expect(frame.rta!.binsRaw[119]).toBe(-20868);
    expect(decodeStripMeterPacket(packet, { ...report, reportId: 20 })).toBeUndefined();
    expect(decodeStripMeterPacket(packet, { ...report, rta: false })).toBeUndefined();
    expect(decodeStripMeterPacket(packet.subarray(0, -1), report)).toBeUndefined();
    expect(decodeStripMeterPacket(new Uint8Array(packet.length + 1), report)).toBeUndefined();
    expect(decodeStripMeterPacket(packet, report, NaN)).toBeUndefined();
  });

  it('uses the published semitone centres rather than linear FFT-bin assumptions', () => {
    expect(RTA_FREQUENCIES_HZ).toHaveLength(120);
    expect(RTA_FREQUENCIES_HZ[0]).toBeCloseTo(20.601722, 5);
    expect(RTA_FREQUENCIES_HZ[53]).toBe(440);
    expect(RTA_FREQUENCIES_HZ[119]).toBeCloseTo(19912.126958, 5);
    expect(RTA_FREQUENCIES_HZ[12] / RTA_FREQUENCIES_HZ[0]).toBeCloseTo(2, 12);
    expect(() => encodeStripMeterRequest(14135, { reportId: 1, selection: { ch: [1] }, rta: 1 as unknown as boolean })).toThrow(/RTA/);
  });
});
