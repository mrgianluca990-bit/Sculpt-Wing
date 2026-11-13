import type { ConsoleInfo, LinkStatus } from '../wing/types';

export interface StripState {
  channel: number;
  name: string;
  color: string;
  level: number | null;
  sendOn: boolean | null;
  meter: number | null;
  pending: boolean;
  error?: string;
}
export interface Activity { id: number; time: string; text: string; kind: 'info' | 'ok' | 'error'; }
export interface ControlState {
  mode: 'idle' | 'demo' | 'live';
  status: LinkStatus;
  statusMessage: string;
  nativeAvailable: boolean;
  console: ConsoleInfo | null;
  host: string;
  bus: number;
  busName: string;
  bank: number;
  strips: StripState[];
  busLevel: number | null;
  busMeter: number | null;
  busPending: boolean;
  meterFresh: boolean;
  editsEnabled: boolean;
  syncing: boolean;
  activity: Activity[];
  lastUpdate: number | null;
  projectName: string;
}
export interface ControlActions {
  connect(host: string): Promise<void>;
  disconnect(): Promise<void>;
  enterDemo(): Promise<void>;
  setBus(bus: number): Promise<void>;
  setBank(bank: number): Promise<void>;
  setEditsEnabled(enabled: boolean): void;
  setSendLevel(channel: number, value: number): Promise<void>;
  setSendOn(channel: number, enabled: boolean): Promise<void>;
  setBusLevel(value: number): Promise<void>;
  refresh(): Promise<void>;
  exportDiagnostics(): string;
}
