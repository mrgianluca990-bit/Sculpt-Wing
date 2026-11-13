import type { ConsoleInfo, LinkStatus, MeterFrame, WingDriver, WingValue } from '../wing/types';

const names = ['Voce', 'Chitarra L', 'Chitarra R', 'Basso', 'Cassa', 'Rullante', 'Tastiere L', 'Tastiere R'];
const levels = [-4, -13, -13, -16, -18, -21, -23, -23];

/** A completely isolated simulation. It has no native transport and sends no network traffic. */
export class DemoDriver implements WingDriver {
  private values = new Map<string, WingValue>();
  private valueListeners = new Set<(path: string, value: WingValue) => void>();
  private meterListeners = new Set<(frame: MeterFrame) => void>();
  private statusListeners = new Set<(status: LinkStatus, message?: string) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private tick = 0;
  private active = false;
  private channels: number[] = [];
  private bus = 1;

  constructor() {
    for (let ch = 1; ch <= 40; ch++) {
      this.values.set(`/ch/${ch}/name`, names[ch - 1] ?? `Canale ${ch}`);
      this.values.set(`/ch/${ch}/col`, [4, 8, 8, 5, 2, 2, 6, 6][(ch - 1) % 8]);
      this.values.set(`/ch/${ch}/$name`, this.values.get(`/ch/${ch}/name`)!);
      this.values.set(`/ch/${ch}/$col`, this.values.get(`/ch/${ch}/col`)!);
      for (let bus = 1; bus <= 16; bus++) {
        this.values.set(`/ch/${ch}/send/${bus}/lvl`, (levels[(ch - 1) % 8] ?? -20) - (bus - 1) * 0.5);
        this.values.set(`/ch/${ch}/send/${bus}/on`, 1);
      }
    }
    for (let bus = 1; bus <= 16; bus++) {
      this.values.set(`/bus/${bus}/name`, ['Voce • IEM', 'Chitarra • IEM', 'Basso • IEM', 'Batteria • IEM'][bus - 1] ?? `Monitor ${bus}`);
      this.values.set(`/bus/${bus}/fdr`, -6);
    }
  }
  async connect(): Promise<ConsoleInfo> {
    this.active = true;
    this.statusListeners.forEach(fn => fn('connected'));
    return { name: 'Studio di prova', model: 'SIMULAZIONE', firmware: 'Demo 0.1', host: 'Nessun mixer collegato' };
  }
  async disconnect() {
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.statusListeners.forEach(fn => fn('disconnected'));
  }
  async get(path: string) {
    if (!this.active) throw new Error('Simulazione chiusa.');
    const value = this.values.get(path);
    if (value === undefined) throw new Error(`Parametro non disponibile: ${path}`);
    return value;
  }
  async set(path: string, value: WingValue) {
    if (!this.active) throw new Error('Simulazione chiusa.');
    if (!/^\/ch\/(?:[1-9]|[1-3]\d|40)\/send\/(?:[1-9]|1[0-6])\/(?:lvl|on)$/.test(path) && !/^\/bus\/(?:[1-9]|1[0-6])\/fdr$/.test(path)) throw new Error('Parametro fuori ambito.');
    this.values.set(path, value);
    this.valueListeners.forEach(fn => fn(path, value));
  }
  async subscribeMeters(channels: number[], bus: number) {
    this.channels = [...channels]; this.bus = bus;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!this.active) return;
      ++this.tick;
      const channels: Record<number, number> = {};
      for (const ch of this.channels) channels[ch] = -29 + 11 * Math.abs(Math.sin(this.tick * 0.11 + ch * 0.8)) + 5 * Math.sin(this.tick * 0.04 + ch);
      const frame = { channels, buses: { [this.bus]: -20 + 6 * Math.abs(Math.sin(this.tick * 0.06)) }, receivedAt: Date.now() };
      this.meterListeners.forEach(fn => fn(frame));
    }, 100);
    this.timer.unref?.();
  }
  onValue(fn: (path: string, value: WingValue) => void) { this.valueListeners.add(fn); return () => { this.valueListeners.delete(fn); }; }
  onMeters(fn: (frame: MeterFrame) => void) { this.meterListeners.add(fn); return () => { this.meterListeners.delete(fn); }; }
  onStatus(fn: (status: LinkStatus, message?: string) => void) { this.statusListeners.add(fn); return () => { this.statusListeners.delete(fn); }; }
}
