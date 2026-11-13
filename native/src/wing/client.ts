import type { ConsoleInfo, LinkStatus, MeterFrame, TransportPacket, TransportStatus, WingSchemaDriver, WingTransport, WingValue,
  NodeMetadata, SchemaChange, StripMeterSelection, StripMeterFrame } from './types';
import {
  decodeIdentity, decodeStripMeterPacket, encodeMeterRenewal, encodeStripMeterRequest,
  encodeRequest, encodeSet, IDENTITY_REQUEST, validateConsoleHost, validateMeterSelection, validateStripMeterSelection, STRIP_FAMILIES,
  WingProtocolError, WingStreamDecoder,
  type ControlToken, type StripMeterReport, type NodeDefinition,
} from './protocol';

export interface WingClientOptions {
  requestTimeoutMs?: number;
  identityTimeoutMs?: number;
  keepaliveMs?: number;
  meterRenewMs?: number;
}

interface Session { id: string; host: string; meterPort: number; epoch: number; }
interface RequestResult { definitions: NodeDefinition[]; value: WingValue | undefined; values: Map<number, WingValue>; }
interface PendingRequest {
  id: number;
  kind: 'data' | 'definition';
  definitions: NodeDefinition[];
  value: WingValue | undefined;
  values: Map<number, WingValue>;
  resolve: (result: RequestResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface PendingIdentity {
  resolve: (info: ConsoleInfo) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  retry: ReturnType<typeof setInterval>;
}

function errorOf(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)); }

function canonicalPath(path: string): string {
  if (path === '/') return path;
  if (path.length > 256 || !/^\/(?:[A-Za-z0-9_$-]+\/)*[A-Za-z0-9_$-]+$/.test(path)
    || path.split('/').length > 17) throw new WingProtocolError('Invalid WING node path');
  return path;
}

function validateCandidate(path: string, value: WingValue): void {
  canonicalPath(path);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) throw new WingProtocolError('Il valore deve essere numerico e finito a 32 bit.');
  } else if (typeof value !== 'string' || new TextEncoder().encode(value).length > 256) {
    throw new WingProtocolError('Il valore deve essere numerico o una stringa di massimo 256 byte.');
  }
}

/** Every writable leaf is supported, using its current firmware definition. */
export function validateWrite(path: string, value: WingValue, node: NodeDefinition): 'float' | 'integer' {
  validateCandidate(path, value);
  if (node.type === 0) throw new WingProtocolError(`Il nodo ${path} non è un parametro.`);
  if (node.readOnly) throw new WingProtocolError(`Il parametro ${path} è di sola lettura.`);
  if (node.type === 5) {
    if (typeof value !== 'string' || !node.items?.some(item => item.value === value)) throw new WingProtocolError('Valore non presente nell’enumerazione della WING.');
  } else if (node.type === 7) {
    if (typeof value !== 'string' || new TextEncoder().encode(value).length > (node.maxLength ?? 0)) throw new WingProtocolError('Stringa oltre il limite dichiarato dalla WING.');
  } else {
    if (typeof value !== 'number') throw new WingProtocolError('Il parametro WING richiede un numero.');
    if (node.type === 4 && (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff)) throw new WingProtocolError('Il parametro WING richiede un intero a 32 bit.');
    if ((node.min !== undefined && value < node.min) || (node.max !== undefined && value > node.max)
      || (node.type === 3 && (value < -144 || value > 10))) throw new WingProtocolError('Il valore supera i limiti dichiarati dalla WING.');
    if (node.type === 6 && !node.items?.some(item => typeof item.value === 'number' && Math.fround(item.value) === Math.fround(value))) {
      throw new WingProtocolError('Valore non presente nell’enumerazione numerica della WING.');
    }
    if (node.type === 4) return 'integer';
  }
  return 'float';
}

/** A float32 readback may be quantized to the nearest documented linear/log step. */
export function readbackMatches(node: NodeDefinition, requested: WingValue, actual: WingValue): boolean {
  if (typeof requested !== 'number' || typeof actual !== 'number') return requested === actual;
  if (!Number.isFinite(actual)) return false;
  if ((node.min !== undefined && actual < node.min) || (node.max !== undefined && actual > node.max)
    || (node.type === 3 && (actual < -144 || actual > 10))) return false;
  if (node.type === 4) return actual === requested;
  if (node.type === 6) return Math.fround(actual) === Math.fround(requested);
  const epsilon = Math.max(Math.abs(Math.fround(requested)), Math.abs(actual), 1e-20) * 2 ** -22;
  if (Math.abs(actual - requested) <= epsilon) return true;
  const { min, max, steps } = node;
  if (min === undefined || max === undefined || !steps || steps <= 1) return false;
  if (node.type === 1) return Math.abs(actual - requested) <= (max - min) / (steps - 1) / 2 + epsilon;
  if (node.type === 2 && min > 0 && max > min && requested > 0 && actual > 0) {
    return Math.abs(Math.log(actual / requested)) <= Math.log(max / min) / (steps - 1) / 2 + 2 ** -22;
  }
  return false;
}

const ROOT: NodeDefinition = { parent: 0, id: 0, index: 0, name: '', longName: 'WING', flags: 0, type: 0, readOnly: true };
function modelRoot(path: string): string | undefined {
  return /^(\/(?:ch|aux|bus|main|mtx)\/[1-9]\d*\/(?:flt|gate|eq|dyn)|\/fx\/[1-9]\d*)(?:\/|$)/.exec(path)?.[1];
}
function within(path: string, root: string): boolean { return root === '/' || path === root || path.startsWith(`${root}/`); }

/**
 * Session-bound native driver. There is one outstanding control request because
 * the protocol's DE terminator has no request ID. A timed-out request closes the
 * session: a delayed DE must never complete a subsequent request or write.
 */
export class WingClient implements WingSchemaDriver {
  private readonly options: Required<WingClientOptions>;
  private readonly decoder = new WingStreamDecoder();
  private epoch = 0;
  private session: Session | undefined;
  private status: LinkStatus = 'disconnected';
  private closing: Promise<void> | undefined;
  private operationTail: Promise<void> = Promise.resolve();
  private pending: PendingRequest | undefined;
  private identity: PendingIdentity | undefined;
  private removers: Array<() => void> = [];
  private keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  private heartbeatPending = false;
  private meterTimer: ReturnType<typeof setInterval> | undefined;
  private meterSelection: StripMeterReport | undefined;
  private reportId = Math.floor(Math.random() * 0xffffffff) >>> 0;
  private readonly children = new Map<number, NodeDefinition[]>();
  private readonly paths = new Map<string, NodeDefinition>();
  private readonly aliases = new Map<number, Set<string>>();
  private readonly modelValues = new Map<string, WingValue>();
  private readonly revisions = new Map<string, number>();
  private schemaClock = 0;
  private readonly valueListeners = new Set<(path: string, value: WingValue) => void>();
  private readonly meterListeners = new Set<(frame: MeterFrame) => void>();
  private readonly stripMeterListeners = new Set<(frame: StripMeterFrame) => void>();
  private readonly schemaListeners = new Set<(change: SchemaChange) => void>();
  private readonly statusListeners = new Set<(status: LinkStatus, message?: string) => void>();

  constructor(private readonly transport: WingTransport, options: WingClientOptions = {}) {
    this.options = {
      requestTimeoutMs: options.requestTimeoutMs ?? 2500,
      identityTimeoutMs: options.identityTimeoutMs ?? 3500,
      keepaliveMs: options.keepaliveMs ?? 4000,
      meterRenewMs: options.meterRenewMs ?? 2500,
    };
    for (const value of Object.values(this.options)) {
      if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid WING client timeout');
    }
    if (this.options.keepaliveMs >= 10000 || this.options.meterRenewMs >= 5000) {
      throw new Error('WING keepalive/renewal must precede console expiry');
    }
  }

  onValue(listener: (path: string, value: WingValue) => void): () => void {
    this.valueListeners.add(listener); return () => this.valueListeners.delete(listener);
  }
  onMeters(listener: (frame: MeterFrame) => void): () => void {
    this.meterListeners.add(listener); return () => this.meterListeners.delete(listener);
  }
  onStripMeters(listener: (frame: StripMeterFrame) => void): () => void {
    this.stripMeterListeners.add(listener); return () => this.stripMeterListeners.delete(listener);
  }
  onSchemaChange(listener: (change: SchemaChange) => void): () => void {
    this.schemaListeners.add(listener); return () => this.schemaListeners.delete(listener);
  }
  onStatus(listener: (status: LinkStatus, message?: string) => void): () => void {
    this.statusListeners.add(listener); return () => this.statusListeners.delete(listener);
  }

  async connect(rawHost: string): Promise<ConsoleInfo> {
    const host = validateConsoleHost(rawHost);
    if (this.closing) await this.closing;
    if (this.session || this.status === 'connecting' || this.status === 'synchronizing') {
      throw new Error('Una connessione WING è già in corso.');
    }
    const epoch = ++this.epoch;
    this.decoder.reset(); this.children.clear(); this.paths.clear(); this.aliases.clear();
    this.modelValues.clear(); this.revisions.clear(); this.revisions.set('/', ++this.schemaClock);
    this.operationTail = Promise.resolve();
    this.removers = [this.transport.onPacket(this.handlePacket), this.transport.onStatus(this.handleTransportStatus)];
    this.publishStatus('connecting', 'Collegamento TCP alla WING…');
    try {
      const connection = await this.transport.connect(host);
      this.assertEpoch(epoch);
      if (!connection.sessionId || !Number.isInteger(connection.meterPort) || connection.meterPort < 1 || connection.meterPort > 65535) {
        throw new WingProtocolError('La connessione nativa non ha restituito una sessione valida.');
      }
      this.session = { id: connection.sessionId, host, meterPort: connection.meterPort, epoch };
      this.publishStatus('synchronizing', 'Verifica identità e struttura dati della WING…');
      this.startTimers(epoch);
      const [info] = await Promise.all([this.identify(epoch), this.loadChildren(0, epoch)]);
      this.assertSession(epoch);
      const roots = this.children.get(0) ?? [];
      if (!roots.some(n => n.name === 'ch' && n.type === 0) || !roots.some(n => n.name === 'bus' && n.type === 0)) {
        throw new WingProtocolError('La WING non espone i nodi ch/bus previsti. Controllare firmware e Remote Lock TCP.');
      }
      this.publishStatus('connected', 'WING verificata; caricamento valori dal mixer.');
      return info;
    } catch (error) {
      if (epoch === this.epoch) this.terminate('error', errorOf(error));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const alreadyClosed = !this.session && this.status === 'disconnected' && !this.removers.length;
    if (!alreadyClosed) this.invalidate(new Error('Connessione WING chiusa.'));
    const close = this.closeTransport();
    if (!alreadyClosed) this.publishStatus('disconnected', 'WING scollegata.');
    await close;
  }

  get(path: string): Promise<WingValue> {
    return this.enqueue(async epoch => {
      await this.ensureModel(canonicalPath(path), epoch);
      const node = await this.resolvePath(path, epoch);
      if (node.type === 0) throw new WingProtocolError(`Il nodo ${path} non è un parametro.`);
      const revision = this.revision(path);
      const value = await this.readValue(node.id, epoch);
      if (!path.endsWith('/mdl')) this.assertRevision(path, revision);
      return value;
    });
  }

  describe(path: string): Promise<NodeMetadata> {
    return this.enqueue(async epoch => {
      await this.ensureModel(canonicalPath(path), epoch);
      return this.metadata(path, await this.resolvePath(path, epoch));
    });
  }

  list(path: string, options: { refresh?: boolean } = {}): Promise<NodeMetadata[]> {
    return this.enqueue(async epoch => {
      canonicalPath(path);
      if (options.refresh) this.invalidateSchema(path);
      await this.ensureModel(path, epoch);
      return this.listInternal(path, epoch);
    });
  }

  /** depth=0 enumerates only direct children; the data request itself is one subtree read. */
  readTree(path: string, options: { depth?: number } = {}): Promise<Record<string, WingValue>> {
    return this.enqueue(async epoch => {
      canonicalPath(path);
      const depth = options.depth ?? 0;
      if (!Number.isInteger(depth) || depth < 0 || depth > 8) throw new WingProtocolError('Profondità readTree non valida (0…8).');
      await this.ensureModel(path, epoch);
      const selected = await this.resolvePath(path, epoch);
      if (selected.type !== 0) {
        const revision = this.revision(path);
        const value = await this.readValue(selected.id, epoch);
        if (!path.endsWith('/mdl')) this.assertRevision(path, revision);
        return { [path]: value };
      }
      const leaves = new Map<number, NodeMetadata>();
      let enumerated = 0;
      const visit = async (branch: string, remaining: number): Promise<void> => {
        await this.ensureModel(branch, epoch);
        for (const child of await this.listInternal(branch, epoch)) {
          if (++enumerated > 4096) throw new WingProtocolError('readTree supera 4096 nodi; selezionare un sottoalbero.');
          if (child.type !== 0) leaves.set(child.id, child);
          else if (remaining > 0) await visit(child.path, remaining - 1);
        }
      };
      await visit(path, depth);
      const snapshot = [...leaves.values()].map(leaf => [leaf.path, this.revision(leaf.path)] as const);
      const response = await this.request(selected.id, 'data', epoch);
      for (const [leaf, revision] of snapshot) this.assertRevision(leaf, revision);
      const values: Record<string, WingValue> = {};
      for (const [id, node] of leaves) {
        const value = response.values.get(id);
        if (value !== undefined) values[node.path] = value;
      }
      return values;
    });
  }

  set(path: string, value: WingValue, options: { revision?: number } = {}): Promise<void> {
    return this.write(path, value, false, options).then(() => undefined);
  }

  trigger(path: string, value: WingValue = 1, options: { revision?: number } = {}): Promise<{ actual?: WingValue }> {
    return this.write(path, value, true, options).then(actual => ({ actual }));
  }

  private write(path: string, value: WingValue, momentary: boolean, options: { revision?: number }): Promise<WingValue> {
    // Reject malformed requests before queueing, but authority is the live definition.
    try { validateCandidate(path, value); } catch (error) { return Promise.reject(error); }
    const revision = options.revision ?? this.revision(path);
    return this.enqueue(async epoch => {
      this.assertRevision(path, revision);
      await this.ensureModel(path, epoch);
      this.assertRevision(path, revision);
      const node = await this.resolvePath(path, epoch);
      const numericType = validateWrite(path, value, node);
      const changesModel = path.endsWith('/mdl');
      if (changesModel && !this.modelValues.has(path.slice(0, -4))) await this.readValue(node.id, epoch);
      this.assertRevision(path, revision);
      await this.transmit(encodeSet(node.id, value, numericType), epoch);
      if (!changesModel) this.assertRevision(path, revision);
      // WING writes have no ACK. Read the actual value even for momentary commands.
      const actual = await this.readValue(node.id, epoch);
      if (!changesModel) this.assertRevision(path, revision);
      if (!momentary && !readbackMatches(node, value, actual)) {
        throw new Error(`La WING non ha confermato ${path}: richiesto ${value}, ricevuto ${String(actual)}. Controllare Remote Lock TCP.`);
      }
      return actual;
    });
  }

  async subscribeMeters(channels: number[], bus: number): Promise<void> {
    validateMeterSelection(channels, bus);
    return this.subscribeStripMeters({ ch: channels, bus: [bus] });
  }

  async subscribeStripMeters(requested: StripMeterSelection): Promise<void> {
    validateStripMeterSelection(requested);
    const epoch = this.epoch, session = this.assertSession(epoch, true);
    this.reportId = (this.reportId + 1) >>> 0;
    if (this.reportId === 0) this.reportId = 1;
    const selection: StripMeterSelection = {};
    for (const family of STRIP_FAMILIES) if (requested[family]?.length) selection[family] = [...requested[family]!];
    const report: StripMeterReport = { reportId: this.reportId, selection };
    this.meterSelection = report;
    try { await this.transmit(encodeStripMeterRequest(session.meterPort, report), epoch); }
    catch (error) {
      if (this.meterSelection === report) this.meterSelection = undefined;
      throw error;
    }
  }

  private enqueue<T>(operation: (epoch: number) => Promise<T>): Promise<T> {
    const epoch = this.epoch;
    // Capture the session at call time. Queued work must not attach to a reconnect.
    try { this.assertSession(epoch, true); } catch (error) { return Promise.reject(error); }
    const result = this.operationTail.then(() => {
      this.assertSession(epoch, true);
      return operation(epoch);
    });
    this.operationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private revision(path: string): number {
    let revision = 0;
    for (const [root, value] of this.revisions) if (within(path, root)) revision = Math.max(revision, value);
    return revision;
  }

  private assertRevision(path: string, revision: number): void {
    if (revision !== this.revision(path)) throw new WingProtocolError(`Lo schema WING di ${path} è cambiato; aggiornare l’editor prima di scrivere.`);
  }

  private metadata(path: string, node: NodeDefinition): NodeMetadata {
    return { ...node, ...(node.items ? { items: node.items.map(item => ({ ...item })) } : {}),
      path, unit: node.flags & 15, revision: this.revision(path) };
  }

  private cachePath(path: string, node: NodeDefinition): void {
    this.paths.set(path, node);
    let aliases = this.aliases.get(node.id);
    if (!aliases) { aliases = new Set(); this.aliases.set(node.id, aliases); }
    aliases.add(path);
  }

  private forgetSubtree(path: string, preserveModel: boolean): void {
    if (path === '/') this.children.clear();
    for (const [key, node] of this.paths) {
      if (!within(key, path)) continue;
      if (node.type === 0) this.children.delete(node.id);
      if (key === path || (preserveModel && key === `${path}/mdl`)) continue;
      this.paths.delete(key);
      const aliases = this.aliases.get(node.id);
      aliases?.delete(key);
      if (!aliases?.size) this.aliases.delete(node.id);
    }
    for (const root of this.modelValues.keys()) {
      if (within(root, path) && !(preserveModel && root === path)) this.modelValues.delete(root);
    }
  }

  private invalidateSchema(path: string, model?: WingValue): void {
    this.forgetSubtree(path, model !== undefined);
    const revision = ++this.schemaClock;
    this.revisions.set(path, revision);
    this.notify(this.schemaListeners, listener => listener({ path, revision, ...(model === undefined ? {} : { model }) }));
  }

  private recordModel(path: string, value: WingValue): void {
    const root = path.slice(0, -4);
    const previous = this.modelValues.get(root);
    this.modelValues.set(root, value);
    if (previous === undefined) {
      // A first model read is a baseline; re-read its children after learning it.
      this.forgetSubtree(root, true);
    } else if (previous !== value) this.invalidateSchema(root, value);
  }

  private async ensureModel(path: string, epoch: number): Promise<void> {
    const root = modelRoot(path);
    if (!root || path.endsWith('/mdl') || this.modelValues.has(root)) return;
    const node = await this.resolvePath(`${root}/mdl`, epoch);
    await this.readValue(node.id, epoch);
  }

  private async listInternal(path: string, epoch: number): Promise<NodeMetadata[]> {
    const parent = await this.resolvePath(path, epoch);
    if (parent.type !== 0) throw new WingProtocolError(`Il nodo ${path} non contiene sottoparametri.`);
    const nodes = await this.loadChildren(parent.id, epoch);
    const names = nodes.map(node => node.name || String(node.index));
    return nodes.map((node, index) => {
      const childPath = `${path === '/' ? '' : path}/${names[index]}`;
      // Duplicate firmware names must never silently select the wrong hash.
      if (names.filter(name => name === names[index]).length === 1) this.cachePath(childPath, node);
      return this.metadata(childPath, node);
    });
  }

  private async resolvePath(path: string, epoch: number): Promise<NodeDefinition> {
    this.assertSession(epoch);
    if (path === '/') return ROOT;
    const cached = this.paths.get(path);
    if (cached) return cached;
    let parent = 0, prefix = '';
    let selected: NodeDefinition | undefined;
    const segments = path.slice(1).split('/');
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]; prefix += `/${segment}`;
      selected = this.paths.get(prefix);
      if (!selected) {
        const nodes = await this.loadChildren(parent, epoch);
        let matches = nodes.filter(n => n.name === segment);
        if (!matches.length && /^[1-9]\d*$/.test(segment)) {
          matches = nodes.filter(n => n.name === '' && n.index === Number(segment));
        }
        if (matches.length !== 1) throw new WingProtocolError(`Nodo WING non disponibile o ambiguo: ${prefix}`);
        selected = matches[0];
        this.cachePath(prefix, selected);
      }
      if (i < segments.length - 1 && selected.type !== 0) throw new WingProtocolError(`Il nodo ${prefix} non contiene sottoparametri.`);
      parent = selected.id;
    }
    if (!selected) throw new WingProtocolError('Empty WING path');
    return selected;
  }

  private async loadChildren(id: number, epoch: number): Promise<NodeDefinition[]> {
    const cached = this.children.get(id);
    if (cached) return cached;
    const revision = this.schemaClock;
    const result = await this.request(id, 'definition', epoch);
    this.assertSession(epoch);
    if (revision !== this.schemaClock) throw new WingProtocolError('Schema WING cambiato durante la lettura; ripetere il caricamento.');
    const children = result.definitions.filter(n => n.parent === id && n.id !== id);
    const unique = new Map<number, NodeDefinition>();
    for (const node of children) unique.set(node.id, node);
    const nodes = [...unique.values()];
    this.children.set(id, nodes);
    return nodes;
  }

  private async readValue(id: number, epoch: number): Promise<WingValue> {
    const result = await this.request(id, 'data', epoch);
    this.assertSession(epoch);
    if (result.value === undefined) throw new WingProtocolError('La WING ha concluso la lettura senza restituire il valore richiesto.');
    return result.value;
  }

  private async request(id: number, kind: 'data' | 'definition', epoch: number): Promise<RequestResult> {
    this.assertSession(epoch);
    if (this.pending) throw new Error('Concurrent WING control request');
    const result = new Promise<RequestResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (epoch === this.epoch) this.terminate('error', new Error('La WING non risponde. Sessione chiusa; le modifiche in attesa sono annullate.'));
      }, this.options.requestTimeoutMs);
      this.pending = { id, kind, definitions: [], value: undefined, values: new Map(), resolve, reject, timer };
    });
    // Attach the result rejection handler before transmitting; the test transport
    // (and a fast native bridge) can deliver a reply synchronously during send.
    const [, response] = await Promise.all([this.transmit(encodeRequest(id, kind), epoch), result]);
    return response;
  }

  private identify(epoch: number): Promise<ConsoleInfo> {
    const result = new Promise<ConsoleInfo>((resolve, reject) => {
      const send = (): void => {
        if (epoch !== this.epoch || !this.identity) return;
        void this.transport.sendUDP(IDENTITY_REQUEST).catch(error => {
          if (epoch === this.epoch) this.terminate('error', errorOf(error));
        });
      };
      const timer = setTimeout(() => {
        if (epoch === this.epoch) this.terminate('error', new Error('Nessuna risposta WING? dall’indirizzo selezionato. Verificare IP e rete locale.'));
      }, this.options.identityTimeoutMs);
      const retry = setInterval(send, Math.min(1000, this.options.identityTimeoutMs / 3));
      this.identity = { resolve, reject, timer, retry };
      send();
    });
    return result;
  }

  private async transmit(bytes: Uint8Array, epoch: number): Promise<void> {
    this.assertSession(epoch);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.transport.sendTCP(bytes),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Invio TCP alla WING scaduto.')), this.options.requestTimeoutMs); }),
      ]);
      this.assertSession(epoch);
    } catch (error) {
      if (epoch === this.epoch) this.terminate('error', errorOf(error));
      throw error;
    } finally { clearTimeout(timer); }
  }

  private startTimers(epoch: number): void {
    this.keepaliveTimer = setInterval(() => {
      if (epoch !== this.epoch || this.status !== 'connected' || this.heartbeatPending) return;
      // A normal leaf read both maintains activity and proves that the console
      // still responds. It shares the control queue and cannot overlap requests.
      const leaf = [...this.paths].find(([, node]) => node.type !== 0)?.[0] ?? '/bus/1/fdr';
      this.heartbeatPending = true;
      void this.get(leaf).catch(error => {
        if (epoch === this.epoch) this.terminate('error', errorOf(error));
      }).finally(() => { if (epoch === this.epoch) this.heartbeatPending = false; });
    }, this.options.keepaliveMs);
    this.meterTimer = setInterval(() => {
      if (epoch !== this.epoch || !this.meterSelection) return;
      void this.transmit(encodeMeterRenewal(this.meterSelection.reportId), epoch).catch(() => undefined);
    }, this.options.meterRenewMs);
  }

  private handlePacket = (packet: TransportPacket): void => {
    const session = this.session;
    if (!session || packet.sessionId !== session.id) return;
    try {
      if (packet.transport === 'tcp') {
        for (const token of this.decoder.feed(packet.data)) this.handleToken(token);
      } else {
        if (this.identity) {
          const info = decodeIdentity(packet.data, session.host);
          if (info) {
            const pending = this.identity; this.identity = undefined;
            clearTimeout(pending.timer); clearInterval(pending.retry); pending.resolve(info);
            return;
          }
        }
        if (this.meterSelection) {
          const frame = decodeStripMeterPacket(packet.data, this.meterSelection);
          if (frame) {
            this.notify(this.meterListeners, listener => listener(frame));
            this.notify(this.stripMeterListeners, listener => listener(frame));
          }
        }
      }
    } catch (error) { this.terminate('error', errorOf(error)); }
  };

  private handleToken(token: ControlToken): void {
    if (token.kind === 'value' && token.id !== undefined && !token.normalized) {
      for (const path of [...(this.aliases.get(token.id) ?? [])]) {
        if (path.endsWith('/mdl')) this.recordModel(path, token.value);
        this.notify(this.valueListeners, listener => listener(path, token.value));
      }
      if (this.pending?.kind === 'data') {
        if (this.pending.values.size >= 100000 && !this.pending.values.has(token.id)) throw new WingProtocolError('Too many WING node values');
        this.pending.values.set(token.id, token.value);
        if (this.pending.id === token.id) this.pending.value = token.value;
      }
    } else if (token.kind === 'definition' && this.pending?.kind === 'definition') {
      if (this.pending.definitions.length >= 100000) throw new WingProtocolError('Too many WING node definitions');
      this.pending.definitions.push(token.definition);
    } else if (token.kind === 'definition') {
      // Firmware may announce a changed definition outside a requested catalogue.
      for (const path of [...(this.aliases.get(token.definition.id) ?? [])]) {
        if (JSON.stringify(this.paths.get(path)) !== JSON.stringify(token.definition)) {
          this.invalidateSchema(path.slice(0, path.lastIndexOf('/')) || '/');
        }
      }
    } else if (token.kind === 'end' && this.pending) {
      const pending = this.pending; this.pending = undefined;
      clearTimeout(pending.timer);
      pending.resolve({ definitions: pending.definitions, value: pending.value, values: pending.values });
    }
  }

  private handleTransportStatus = (event: TransportStatus): void => {
    if (!this.session || event.sessionId !== this.session.id || event.state === 'ready') return;
    const status: LinkStatus = event.state === 'suspended' ? 'suspended' : event.state === 'closed' ? 'disconnected' : 'error';
    this.terminate(status, new Error(event.message ?? (status === 'suspended' ? 'App sospesa; controllo WING disattivato.' : 'Connessione WING interrotta.')));
  };

  private assertEpoch(epoch: number): void {
    if (epoch !== this.epoch) throw new Error('Operazione annullata: la sessione WING è cambiata.');
  }

  private assertSession(epoch: number, connected = false): Session {
    this.assertEpoch(epoch);
    if (!this.session || (connected && this.status !== 'connected')) throw new Error('Nessuna WING pronta per questa operazione.');
    return this.session;
  }

  private invalidate(error: Error): void {
    ++this.epoch; this.session = undefined; this.meterSelection = undefined;
    clearInterval(this.keepaliveTimer); clearInterval(this.meterTimer);
    this.keepaliveTimer = undefined; this.meterTimer = undefined;
    this.heartbeatPending = false;
    if (this.pending) {
      const pending = this.pending; this.pending = undefined;
      clearTimeout(pending.timer); pending.reject(error);
    }
    if (this.identity) {
      const pending = this.identity; this.identity = undefined;
      clearTimeout(pending.timer); clearInterval(pending.retry); pending.reject(error);
    }
    for (const remove of this.removers) remove();
    this.removers = [];
    this.decoder.reset(); this.children.clear(); this.paths.clear(); this.aliases.clear();
    this.modelValues.clear(); this.revisions.clear(); this.revisions.set('/', ++this.schemaClock);
    this.operationTail = Promise.resolve();
  }

  private closeTransport(): Promise<void> {
    if (this.closing) return this.closing;
    const promise = Promise.resolve().then(() => this.transport.disconnect()).finally(() => {
      if (this.closing === promise) this.closing = undefined;
    });
    this.closing = promise;
    return promise;
  }

  private terminate(status: LinkStatus, error: Error): void {
    this.invalidate(error);
    // Establish closing before notifying the store, which may itself disconnect.
    void this.closeTransport().catch(() => undefined);
    this.publishStatus(status, error.message);
  }

  private publishStatus(status: LinkStatus, message?: string): void {
    this.status = status;
    this.notify(this.statusListeners, listener => listener(status, message));
  }

  private notify<T>(listeners: Set<T>, invoke: (listener: T) => void): void {
    for (const listener of listeners) {
      try { invoke(listener); } catch { /* UI subscribers must not corrupt protocol/session state. */ }
    }
  }
}
