export type WingValue = number | string;
export type LinkStatus = 'disconnected' | 'connecting' | 'synchronizing' | 'connected' | 'error' | 'suspended';
export interface ConsoleInfo { name: string; model: string; firmware: string; host: string; }
/** Metadata is discovered from the connected console, never from fixed hashes. */
export interface NodeDefinition {
  parent: number; id: number; index: number; name: string; longName: string;
  flags: number; type: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; readOnly: boolean;
  min?: number; max?: number; steps?: number; maxLength?: number;
  items?: Array<{ value: WingValue; label: string }>;
}
export interface NodeMetadata extends NodeDefinition { path: string; unit: number; revision: number; }
export interface SchemaChange { path: string; revision: number; model?: WingValue; }
export type StripFamily = 'ch' | 'aux' | 'bus' | 'main' | 'mtx';
export type StripMeterSelection = Partial<Record<StripFamily, number[]>>;
export interface StripMeter {
  input: [number, number]; output: [number, number];
  gateKey: number; dynKey: number;
  /** Raw signed words: scaling depends on the selected gate/dynamics model. */
  gateGainRaw: number; dynGainRaw: number;
  /** Signed protocol meter units (raw / 256), not dB. Model scales differ. */
  gateGainNormalized: number; dynGainNormalized: number;
}
export interface MeterFrame {
  channels: Record<number, number>; buses: Record<number, number>; receivedAt: number;
  auxiliaries?: Record<number, number>; mains?: Record<number, number>; matrices?: Record<number, number>;
  strips?: Record<StripFamily, Record<number, StripMeter>>; reportId?: number;
}
export interface StripMeterFrame extends MeterFrame {
  auxiliaries: Record<number, number>; mains: Record<number, number>; matrices: Record<number, number>;
  strips: Record<StripFamily, Record<number, StripMeter>>; reportId: number;
}
export interface TransportPacket { sessionId: string; transport: 'tcp' | 'udp'; data: Uint8Array; }
export interface TransportStatus { sessionId: string; state: 'ready' | 'closed' | 'error' | 'suspended'; message?: string; }
export interface WingTransport {
  connect(host: string): Promise<{ sessionId: string; meterPort: number }>;
  disconnect(): Promise<void>;
  sendTCP(data: Uint8Array): Promise<void>;
  sendUDP(data: Uint8Array): Promise<void>;
  onPacket(listener: (event: TransportPacket) => void): () => void;
  onStatus(listener: (event: TransportStatus) => void): () => void;
}
export interface WingDriver {
  connect(host: string): Promise<ConsoleInfo>;
  disconnect(): Promise<void>;
  get(path: string): Promise<WingValue>;
  set(path: string, value: WingValue): Promise<void>;
  subscribeMeters(channels: number[], bus: number): Promise<void>;
  onValue(listener: (path: string, value: WingValue) => void): () => void;
  onMeters(listener: (frame: MeterFrame) => void): () => void;
  onStatus(listener: (status: LinkStatus, message?: string) => void): () => void;
}
/** Extended native API. The small offline demo may still implement WingDriver. */
export interface WingSchemaDriver extends WingDriver {
  set(path: string, value: WingValue, options?: { revision?: number }): Promise<void>;
  /** A command dispatch/readback, not proof that a momentary action completed. */
  trigger(path: string, value?: WingValue, options?: { revision?: number }): Promise<{ actual?: WingValue }>;
  describe(path: string): Promise<NodeMetadata>;
  list(path: string, options?: { refresh?: boolean }): Promise<NodeMetadata[]>;
  readTree(path: string, options?: { depth?: number }): Promise<Record<string, WingValue>>;
  subscribeStripMeters(selection: StripMeterSelection): Promise<void>;
  onStripMeters(listener: (frame: StripMeterFrame) => void): () => void;
  onSchemaChange(listener: (change: SchemaChange) => void): () => void;
}
