import { WingClient } from '../wing/client';
import { NativeTransport, nativeAvailable, isPrivateIPv4 } from '../wing/native';
import type { MeterFrame, WingDriver, WingValue } from '../wing/types';
import type { Activity, ControlActions, ControlState, StripState } from './types';
import { DemoDriver } from './demo';

// IDs are one-based. Colors follow the WING 3.1 names; RGB is an app palette,
// not a claim of calibrated identity with the console display. Index 0 is unknown.
// Mapping: bitfocus/companion-module-behringer-wing, src/choices/common.ts.
const colors = ['#89949c','#4969b7','#0089ff','#5b33fa','#2bdfa6','#00b43d','#9acc00','#f6e100','#bd6a1b','#e31b44','#ff7679','#f129e7','#a52ff6','#ffb71b','#21bff0','#ff5a2d','#00c6ca','#707070','#e0e0e0'];
const number = (value: WingValue): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = (value: WingValue, fallback: string) => typeof value === 'string' && value.trim() ? value : fallback;
const clampMeter = (value: number | undefined) => value === undefined || !Number.isFinite(value) ? null : Math.max(-144, Math.min(20, value));
const stripsFor = (bank: number): StripState[] => Array.from({ length: 8 }, (_, i) => ({ channel: bank * 8 + i + 1, name: `CH ${bank * 8 + i + 1}`, color: colors[0], level: null, sendOn: null, meter: null, pending: false }));
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export interface StoreOptions { nativeAvailable?: boolean; driverFactory?: () => WingDriver; storage?: Storage | null; }

export class ControlStore implements ControlActions {
  private state: ControlState;
  private listeners = new Set<() => void>();
  private driver: WingDriver | null = null;
  private unsubscribes: (() => void)[] = [];
  private connectionEpoch = 0;
  private viewEpoch = 0;
  private activityId = 0;
  private storage: Storage | null;
  private factory: () => WingDriver;
  private meterTimer: ReturnType<typeof setInterval>;
  private lastMeterTime = 0;
  private disposed = false;

  constructor(options: StoreOptions = {}) {
    this.factory = options.driverFactory ?? (() => new WingClient(new NativeTransport()));
    try { this.storage = options.storage === undefined ? globalThis.localStorage ?? null : options.storage; } catch { this.storage = null; }
    let host = '';
    try { host = this.storage?.getItem('sculpt-control.wing-ip') ?? ''; } catch { /* Private mode is usable. */ }
    this.state = {
      mode: 'idle', status: 'disconnected', statusMessage: 'Scegli una WING o esplora la simulazione.',
      nativeAvailable: options.nativeAvailable ?? nativeAvailable,
      console: null, host, bus: 1, busName: 'Monitor 1', bank: 0,
      strips: stripsFor(0), busLevel: null, busMeter: null, busPending: false,
      meterFresh: false, editsEnabled: false, syncing: false, activity: [], lastUpdate: null, projectName: 'Sessione WING',
    };
    this.meterTimer = setInterval(() => {
      if (this.state.meterFresh && Date.now() - this.lastMeterTime > 2500) this.update({ meterFresh: false, busMeter: null, strips: this.state.strips.map(s => ({ ...s, meter: null })) });
    }, 1000);
    this.meterTimer.unref?.();
  }

  getSnapshot = (): ControlState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<ControlState>) { if (this.disposed) return; this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()); }
  private log(text: string, kind: Activity['kind'] = 'info') {
    const entry = { id: ++this.activityId, time: new Date().toISOString(), text, kind };
    this.update({ activity: [entry, ...this.state.activity].slice(0, 60) });
  }
  private resetValues() {
    this.update({ strips: stripsFor(this.state.bank), busLevel: null, busMeter: null, busPending: false, meterFresh: false, editsEnabled: false, syncing: false, lastUpdate: null });
  }
  private detach() { for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe(); }

  connect = async (rawHost: string) => {
    const host = rawHost.trim();
    if (!this.state.nativeAvailable) { this.log('Il collegamento reale richiede l’app installata su iPad. La simulazione è disponibile nel browser.', 'error'); return; }
    if (!isPrivateIPv4(host)) { this.log('Indirizzo non valido. Inserisci l’IPv4 locale della WING, per esempio 192.168.1.50.', 'error'); return; }
    await this.begin(this.factory(), 'live', host);
  };

  enterDemo = async () => { await this.begin(new DemoDriver(), 'demo', this.state.host); };

  private async begin(driver: WingDriver, mode: 'live' | 'demo', host: string) {
    const closing = this.disconnect();
    const epoch = this.connectionEpoch;
    await closing;
    // A newer connection attempt or an explicit disconnect wins, even if closing
    // the previous native socket took longer than opening the next dialog.
    if (epoch !== this.connectionEpoch) { await driver.disconnect().catch(() => undefined); return; }
    this.driver = driver;
    this.update({ mode, host, status: 'connecting', statusMessage: mode === 'demo' ? 'Apertura della simulazione…' : 'Collegamento alla WING…', console: null, editsEnabled: false, syncing: true });
    this.unsubscribes = [
      driver.onValue((path, value) => { if (epoch === this.connectionEpoch && driver === this.driver) this.applyValue(path, value); }),
      driver.onMeters(frame => { if (epoch === this.connectionEpoch && driver === this.driver) this.applyMeters(frame); }),
      driver.onStatus((status, message) => {
        if (epoch !== this.connectionEpoch || driver !== this.driver) return;
        if (['error', 'disconnected', 'suspended'].includes(status)) {
          ++this.connectionEpoch; ++this.viewEpoch;
          this.detach(); this.driver = null;
          this.resetValues();
          const label = message ?? (status === 'suspended' ? 'App sospesa. Riconnetti per rileggere il mixer.' : 'Collegamento interrotto. Riconnetti per leggere lo stato attuale.');
          this.update({ status, statusMessage: label }); this.log(label, status === 'suspended' ? 'info' : 'error');
          void driver.disconnect().catch(() => undefined);
        }
      }),
    ];
    try {
      const info = await driver.connect(host);
      if (epoch !== this.connectionEpoch) return;
      this.update({ console: info, status: 'synchronizing', statusMessage: 'Lettura delle mandate dal mixer…' });
      await this.loadView();
      if (epoch !== this.connectionEpoch) return;
      this.update({ status: 'connected', syncing: false, editsEnabled: mode === 'demo', statusMessage: mode === 'demo' ? 'Simulazione · nessun mixer collegato' : 'WING collegata · sola lettura' });
      if (mode === 'live') { try { this.storage?.setItem('sculpt-control.wing-ip', host); } catch { /* Optional preference. */ } }
      this.log(mode === 'demo' ? 'Simulazione avviata. Nessun comando viene inviato in rete.' : `Collegata ${info.name || 'WING'} · stato letto dalla console.`, 'ok');
    } catch (error) {
      if (epoch !== this.connectionEpoch) return;
      this.detach(); this.driver = null; ++this.connectionEpoch; ++this.viewEpoch;
      await driver.disconnect().catch(() => undefined);
      this.resetValues();
      const message = messageOf(error);
      this.update({ status: 'error', statusMessage: message }); this.log(message, 'error');
    }
  }

  disconnect = async () => {
    ++this.connectionEpoch; ++this.viewEpoch;
    this.detach();
    const previous = this.driver; this.driver = null;
    this.resetValues();
    this.update({ mode: 'idle', status: 'disconnected', statusMessage: 'Nessun mixer collegato.', console: null });
    if (previous) await previous.disconnect().catch(error => { this.log(messageOf(error), 'error'); });
  };

  private async loadView() {
    const driver = this.driver;
    if (!driver) return;
    const epoch = this.connectionEpoch, view = ++this.viewEpoch;
    const { bank, bus } = this.state;
    this.update({ syncing: true, strips: stripsFor(bank), busName: `Monitor ${bus}`, busLevel: null, busMeter: null, meterFresh: false });
    const jobs: Promise<void>[] = [];
    const read = (path: string) => driver.get(path).then(value => {
      if (epoch === this.connectionEpoch && view === this.viewEpoch) this.applyValue(path, value);
    });
    for (const strip of this.state.strips) {
      const base = `/ch/${strip.channel}`;
      jobs.push(read(`${base}/$name`), read(`${base}/$col`), read(`${base}/send/${bus}/lvl`), read(`${base}/send/${bus}/on`));
    }
    jobs.push(read(`/bus/${bus}/name`), read(`/bus/${bus}/fdr`));
    const settled = await Promise.allSettled(jobs);
    if (epoch !== this.connectionEpoch || view !== this.viewEpoch) return;
    const failed = settled.filter(result => result.status === 'rejected');
    if (failed.length) this.log(`${failed.length} parametri non disponibili: i relativi controlli restano disabilitati.`, 'error');
    if (this.state.strips.every(strip => strip.level === null) && this.state.busLevel === null) throw new Error('La WING non ha restituito le mandate. Controlla il collegamento e la compatibilità del firmware.');
    try { await driver.subscribeMeters(this.state.strips.map(s => s.channel), bus); }
    catch (error) { if (epoch === this.connectionEpoch && view === this.viewEpoch) this.log(`Meter non disponibili: ${messageOf(error)}`, 'error'); }
    if (epoch === this.connectionEpoch && view === this.viewEpoch) this.update({ syncing: false });
  }

  private applyValue(path: string, value: WingValue) {
    let match = /^\/ch\/(\d+)\/\$?(name|col)$/.exec(path);
    if (match) {
      const ch = Number(match[1]);
      this.update({ strips: this.state.strips.map(strip => strip.channel !== ch ? strip : match![2] === 'name' ? { ...strip, name: text(value, `CH ${ch}`) } : { ...strip, color: colors[typeof value === 'number' ? value : Number(value)] ?? colors[0] }), lastUpdate: Date.now() });
      return;
    }
    match = /^\/ch\/(\d+)\/send\/(\d+)\/(lvl|on)$/.exec(path);
    if (match && Number(match[2]) === this.state.bus) {
      const ch = Number(match[1]), field = match[3];
      this.update({ strips: this.state.strips.map(strip => strip.channel !== ch ? strip : field === 'lvl' ? { ...strip, level: number(value) } : { ...strip, sendOn: value === 0 ? false : value === 1 ? true : null }), lastUpdate: Date.now() });
      return;
    }
    match = /^\/bus\/(\d+)\/(name|fdr)$/.exec(path);
    if (match && Number(match[1]) === this.state.bus) this.update(match[2] === 'name' ? { busName: text(value, `Monitor ${this.state.bus}`), lastUpdate: Date.now() } : { busLevel: number(value), lastUpdate: Date.now() });
  }
  private applyMeters(frame: MeterFrame) {
    this.lastMeterTime = Date.now();
    this.update({ strips: this.state.strips.map(strip => ({ ...strip, meter: clampMeter(frame.channels[strip.channel]) })), busMeter: clampMeter(frame.buses[this.state.bus]), meterFresh: true });
  }
  private hasPending() { return this.state.busPending || this.state.strips.some(s => s.pending); }
  setBus = async (bus: number) => {
    if (!Number.isInteger(bus) || bus < 1 || bus > 16 || bus === this.state.bus || this.state.syncing || this.hasPending()) return;
    this.update({ bus, busName: `Monitor ${bus}`, strips: stripsFor(this.state.bank), busLevel: null });
    await this.refresh();
  };
  setBank = async (bank: number) => {
    if (!Number.isInteger(bank) || bank < 0 || bank > 4 || bank === this.state.bank || this.state.syncing || this.hasPending()) return;
    this.update({ bank, strips: stripsFor(bank) }); await this.refresh();
  };
  refresh = async () => {
    if (!this.driver || this.state.status !== 'connected' || this.state.syncing || this.hasPending()) return;
    const epoch = this.connectionEpoch;
    try { await this.loadView(); }
    catch (error) { if (epoch === this.connectionEpoch) { this.update({ syncing: false, editsEnabled: false }); this.log(messageOf(error), 'error'); } }
  };
  setEditsEnabled = (enabled: boolean) => {
    if (this.state.status !== 'connected' || (enabled && this.state.syncing) || enabled === this.state.editsEnabled) return;
    this.update({ editsEnabled: enabled, statusMessage: this.state.mode === 'demo' ? 'Simulazione · nessun mixer collegato' : enabled ? 'Controllo attivo · mandate monitor' : 'WING collegata · sola lettura' });
    this.log(enabled ? 'Controllo delle mandate abilitato.' : 'Modalità sola lettura.');
  };
  private canWrite() { return this.driver && this.state.status === 'connected' && this.state.editsEnabled && !this.state.syncing; }
  private validLevel(value: number) { return Number.isFinite(value) && value >= -144 && value <= 10; }

  setSendLevel = async (channel: number, value: number) => {
    const strip = this.state.strips.find(s => s.channel === channel);
    if (!this.canWrite() || !strip || strip.pending || strip.level === null || !this.validLevel(value)) return;
    await this.writeSend(channel, 'lvl', Math.round(value * 10) / 10);
  };
  setSendOn = async (channel: number, enabled: boolean) => {
    const strip = this.state.strips.find(s => s.channel === channel);
    if (!this.canWrite() || !strip || strip.pending || strip.sendOn === null) return;
    await this.writeSend(channel, 'on', enabled ? 1 : 0);
  };
  private async writeSend(channel: number, field: 'lvl' | 'on', value: number) {
    const driver = this.driver!;
    const epoch = this.connectionEpoch, view = this.viewEpoch, bus = this.state.bus;
    this.update({ strips: this.state.strips.map(s => s.channel === channel ? { ...s, pending: true, error: undefined } : s) });
    try {
      await driver.set(`/ch/${channel}/send/${bus}/${field}`, value);
      if (epoch !== this.connectionEpoch || view !== this.viewEpoch) return;
      this.update({ strips: this.state.strips.map(s => s.channel === channel ? { ...s, pending: false } : s) });
      this.log(`CH ${channel} → BUS ${bus}: ${field === 'lvl' ? `${value <= -144 ? '−∞' : value.toFixed(1)} dB` : value ? 'mandata attiva' : 'mandata disattivata'}.`, 'ok');
    } catch (error) {
      if (epoch !== this.connectionEpoch || view !== this.viewEpoch) return;
      this.update({ strips: this.state.strips.map(s => s.channel === channel ? { ...s, pending: false, error: messageOf(error) } : s) });
      this.log(`CH ${channel} → BUS ${bus}: ${messageOf(error)}`, 'error');
    }
  }
  setBusLevel = async (value: number) => {
    if (!this.canWrite() || this.state.busPending || this.state.busLevel === null || !this.validLevel(value)) return;
    const driver = this.driver!, epoch = this.connectionEpoch, view = this.viewEpoch, bus = this.state.bus;
    this.update({ busPending: true });
    try {
      await driver.set(`/bus/${bus}/fdr`, Math.round(value * 10) / 10);
      if (epoch !== this.connectionEpoch || view !== this.viewEpoch) return;
      this.update({ busPending: false }); this.log(`Master BUS ${bus}: ${value <= -144 ? '−∞' : value.toFixed(1)} dB.`, 'ok');
    } catch (error) {
      if (epoch !== this.connectionEpoch || view !== this.viewEpoch) return;
      this.update({ busPending: false }); this.log(messageOf(error), 'error');
    }
  };
  exportDiagnostics = () => JSON.stringify({
    format: 'sculpt-control-diagnostics', version: 1, appVersion: '0.1.0', exportedAt: new Date().toISOString(),
    hardwareValidated: false, mode: this.state.mode, status: this.state.status, console: this.state.console,
    selectedBus: this.state.bus, selectedBank: this.state.bank, editsEnabled: this.state.editsEnabled,
    strips: this.state.strips, busLevel: this.state.busLevel, meterFresh: this.state.meterFresh, activity: this.state.activity,
  }, null, 2);
  destroy = async () => {
    await this.disconnect(); this.disposed = true; clearInterval(this.meterTimer);
    this.listeners.clear();
  };
}

export const store = new ControlStore();
