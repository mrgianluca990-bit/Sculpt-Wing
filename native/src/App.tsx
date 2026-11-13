import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { store } from './state/store';
import type { StripState } from './state/types';

type IconName = 'headphones' | 'link' | 'lock' | 'unlock' | 'refresh' | 'close' | 'activity' | 'power' | 'arrow' | 'copy' | 'check';

const iconPaths: Record<IconName, ReactNode> = {
    headphones: <><path d="M4 14v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="12" width="4" height="8" rx="2" /><rect x="17" y="12" width="4" height="8" rx="2" /></>,
    link: <><path d="m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(0 -1) scale(.95)" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    unlock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-2M12 14v3" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    activity: <><path d="M3 17h3l3-9 5 13 3-11 2 7h2M3 4h18" /></>,
    power: <><path d="M12 3v9M6.3 5.7a8 8 0 1 0 11.4 0" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
};
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

const pad = (value: number) => String(value).padStart(2, '0');
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const isKnown = (value: number | null): value is number => value !== null && Number.isFinite(value);

function formatLevel(value: number | null) {
  if (!isKnown(value)) return '—';
  if (value <= -143.5) return '−∞';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

// A tapered scale leaves useful travel around unity while retaining true silence.
const taper = [[0, -144], [1, -90], [10, -60], [24, -40], [43, -20], [65, -10], [86, 0], [100, 10]] as const;
function dbToPosition(db: number) {
  const bounded = clamp(db, -144, 10);
  for (let i = 1; i < taper.length; i++) {
    const [p1, d1] = taper[i - 1];
    const [p2, d2] = taper[i];
    if (bounded <= d2) return p1 + ((bounded - d1) / (d2 - d1)) * (p2 - p1);
  }
  return 100;
}
function positionToDb(position: number) {
  if (position < 0.5) return -144;
  for (let i = 1; i < taper.length; i++) {
    const [p1, d1] = taper[i - 1];
    const [p2, d2] = taper[i];
    if (position <= p2) return Math.round((d1 + ((position - p1) / (p2 - p1)) * (d2 - d1)) * 10) / 10;
  }
  return 10;
}

function Meter({ value, fresh, label, shortLabel }: { value: number | null; fresh: boolean; label: string; shortLabel: 'IN' | 'OUT' }) {
  const known = isKnown(value) && fresh;
  const percent = known ? ((clamp(value, -60, 0) + 60) / 60) * 100 : 0;
  return <div className={`meter ${known ? 'meter--fresh' : ''}`} role={known ? 'meter' : undefined} aria-label={label} aria-valuemin={known ? -60 : undefined} aria-valuemax={known ? 0 : undefined} aria-valuenow={known ? clamp(value, -60, 0) : undefined} aria-valuetext={known ? `${value.toFixed(1)} dBFS` : 'Meter non disponibile'}>
    <span className="meter-label" aria-hidden="true">{shortLabel}</span>
    <span className={`meter-clip ${known && value >= -0.1 ? 'meter-clip--on' : ''}`} />
    <div className="meter-track"><div className="meter-fill" style={{ height: `${percent}%` }} /><div className="meter-segments" /></div>
  </div>;
}

interface FaderProps {
  value: number | null;
  disabled: boolean;
  pending: boolean;
  label: string;
  onCommit: (value: number) => void;
}

function Fader({ value, disabled, pending, label, onCommit }: FaderProps) {
  const [preview, setPreview] = useState<number | null>(value);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const previewRef = useRef(value);
  const sourceAtGesture = useRef(value);
  useEffect(() => {
    if (!draggingRef.current && !pending) {
      setPreview(value);
      previewRef.current = value;
    }
  }, [value, pending, dragging]);
  useEffect(() => {
    if (disabled && draggingRef.current) {
      draggingRef.current = false;
      setDragging(false);
      setPreview(value);
      previewRef.current = value;
    }
  }, [disabled, value]);

  const displayValue = isKnown(value) ? preview : null;
  const known = isKnown(displayValue);
  const position = known ? dbToPosition(displayValue) : 0;
  function cancelGesture() {
    draggingRef.current = false;
    setDragging(false);
    previewRef.current = value;
    setPreview(value);
  }
  function finishGesture() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const next = previewRef.current;
    if (!disabled && isKnown(next) && next !== sourceAtGesture.current) onCommit(next);
  }

  return <>
    <div className={`fader-readout ${dragging ? 'fader-readout--active' : ''} ${pending ? 'fader-readout--pending' : ''}`}>
      <span>{formatLevel(displayValue)}</span><small>dB</small>
    </div>
    <div className={`fader-control ${disabled ? 'fader-control--disabled' : ''} ${dragging ? 'fader-control--dragging' : ''} ${known ? '' : 'fader-control--unknown'}`}>
      <div className="fader-scale" aria-hidden="true">{[10, 0, -10, -20, -40, -144].map(tick => <span key={tick} className={tick === 0 ? 'fader-tick fader-tick--unity' : 'fader-tick'} style={{ bottom: `${dbToPosition(tick)}%` }}><i />{tick === -144 ? '−∞' : tick > 0 ? `+${tick}` : tick}</span>)}</div>
      <div className="fader-rail" aria-hidden="true"><span className="fader-rail-fill" style={{ height: `${known ? position : 0}%` }} /></div>
      {known && <div className="fader-cap" style={{ bottom: `${position}%` }} aria-hidden="true"><span /><i /><span /></div>}
      <input
        className="fader-input"
        type="range"
        min="0"
        max="1000"
        step="1"
        value={Math.round(position * 10)}
        disabled={disabled || !isKnown(value)}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuetext={known ? `${formatLevel(displayValue)} decibel` : 'Valore non disponibile'}
        onPointerDown={event => {
          if (disabled) return;
          draggingRef.current = true;
          sourceAtGesture.current = value;
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onChange={event => {
          const next = positionToDb(Number(event.currentTarget.value) / 10);
          previewRef.current = next;
          setPreview(next);
          if (!draggingRef.current && !disabled) onCommit(next);
        }}
        onPointerUp={finishGesture}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={finishGesture}
        onBlur={() => { if (draggingRef.current) cancelGesture(); }}
      />
      <span className="fader-focus-ring" aria-hidden="true" />
    </div>
  </>;
}

function ChannelStrip({ strip, canEdit, fresh, onLevel, onSend }: { strip: StripState; canEdit: boolean; fresh: boolean; onLevel: (channel: number, value: number) => void; onSend: (channel: number, value: boolean) => void }) {
  const enabled = canEdit && !strip.pending;
  return <article className={`channel-strip ${strip.error ? 'channel-strip--error' : ''}`} style={{ '--channel-color': strip.color || '#a4c5b4' } as CSSProperties} aria-label={`Canale ${strip.channel}, ${strip.name || 'nome non disponibile'}`}>
    <div className="strip-color" />
    <div className="strip-heading"><span className="channel-number">{pad(strip.channel)}</span><span className={`strip-state-dot ${strip.pending ? 'strip-state-dot--pending' : ''}`} title={strip.pending ? 'In attesa di conferma' : undefined} /></div>
    <h3 title={strip.name || `Canale ${strip.channel}`}>{strip.name || `Canale ${pad(strip.channel)}`}</h3>
    <div className="strip-path">INPUT <span>→ MIX</span></div>
    <div className="strip-fader-area">
      <Fader value={strip.level} disabled={!enabled || !isKnown(strip.level)} pending={strip.pending} label={`Livello invio canale ${strip.channel}, ${strip.name}`} onCommit={value => onLevel(strip.channel, value)} />
      <Meter value={strip.meter} fresh={fresh} label={`Meter ingresso canale ${strip.channel}`} shortLabel="IN" />
    </div>
    <button type="button" className={`send-button ${strip.sendOn === true ? 'send-button--on' : ''}`} role="switch" aria-checked={strip.sendOn === true} aria-label={`Invio canale ${strip.channel} al mix${strip.sendOn === null ? ', stato sconosciuto' : ''}`} disabled={!enabled || strip.sendOn === null} onClick={() => onSend(strip.channel, !strip.sendOn)}>
      <span className="send-indicator" />{strip.sendOn === null ? '—' : strip.sendOn ? 'INVIO ON' : 'INVIO OFF'}
    </button>
    <div className={`strip-feedback ${strip.error ? 'strip-feedback--error' : ''}`} title={strip.error}>{strip.error ? 'Non confermato' : strip.pending ? 'Conferma…' : ' '}</div>
  </article>;
}

function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog--wide' : ''}`} aria-labelledby={headingId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <div className="dialog-heading"><h2 id={headingId}>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Chiudi pannello"><Icon name="close" /></button></div>
    {children}
  </dialog>;
}

export default function App() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [dialog, setDialog] = useState<'connection' | 'diagnostics' | null>(null);
  const [host, setHost] = useState(state.host);
  const [uiError, setUiError] = useState<string | null>(null);
  const [dismissedActivityId, setDismissedActivityId] = useState(0);
  const [diagnostics, setDiagnostics] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const diagnosticsRef = useRef<HTMLTextAreaElement>(null);
  const connected = state.status === 'connected';
  const busy = state.status === 'connecting' || state.status === 'synchronizing' || state.syncing;
  const canEdit = connected && state.editsEnabled && !state.syncing;
  const isDemo = state.mode === 'demo';
  const canDemo = state.mode === 'idle' && !busy && !connected;
  const latestActivity = state.activity.reduce<(typeof state.activity)[number] | null>((latest, item) => !latest || item.id > latest.id ? item : latest, null);
  const visibleError = uiError || (latestActivity?.kind === 'error' && latestActivity.id > dismissedActivityId ? latestActivity.text : null);
  const statusLabel = isDemo && connected ? 'Simulazione attiva' : isDemo && busy ? 'Preparazione demo…' : ({ disconnected: 'Non collegato', connecting: 'Connessione…', synchronizing: 'Sincronizzazione…', connected: 'WING collegato', error: 'Connessione interrotta', suspended: 'Sessione sospesa' } as const)[state.status];

  async function runAction(action: () => Promise<void>) {
    setUiError(null);
    try { await action(); return true; }
    catch (error) { setUiError(error instanceof Error ? error.message : 'Operazione non riuscita.'); return false; }
  }
  function openConnection() { setHost(state.host); setUiError(null); setDialog('connection'); }
  function openDiagnostics() { setDiagnostics(store.exportDiagnostics()); setCopyState('idle'); setDialog('diagnostics'); }
  async function connect() {
    const success = await runAction(() => store.connect(host.trim()));
    if (success && store.getSnapshot().status === 'connected') setDialog(null);
  }
  async function enterDemo() {
    const success = await runAction(() => store.enterDemo());
    if (success && store.getSnapshot().mode === 'demo') setDialog(null);
  }
  // A gesture begun on another bus or session must never target the current view.
  function stillCurrentView() {
    const current = store.getSnapshot();
    return current.mode === state.mode && current.console === state.console && current.bus === state.bus && current.bank === state.bank && current.status === 'connected' && current.editsEnabled && !current.syncing;
  }
  function commitSendLevel(channel: number, value: number) {
    if (stillCurrentView()) void runAction(() => store.setSendLevel(channel, value));
  }
  function commitSendOn(channel: number, value: boolean) {
    if (stillCurrentView()) void runAction(() => store.setSendOn(channel, value));
  }
  function commitBusLevel(value: number) {
    if (stillCurrentView()) void runAction(() => store.setBusLevel(value));
  }

  return <div className={`app-shell ${isDemo ? 'app-shell--demo' : ''}`}>
    <header className="app-header">
      <a className="brand" href="#main" aria-label="Sculpt Wing, vai al controller"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span className="brand-wordmark">sculpt<span className="brand-point">.</span></span><span className="brand-divider" /><span className="brand-edition">WING<br /><strong>MONITOR</strong></span></a>
      <div className="header-actions"><span className={`connection-status ${connected && !isDemo ? 'connection-status--live' : ''} ${isDemo ? 'connection-status--demo' : ''}`} aria-live="polite"><span className={`status-dot ${busy ? 'status-dot--busy' : ''}`} />{statusLabel}</span><button type="button" className="button button--connection" onClick={openConnection}><Icon name="link" /><span>Connessione</span></button><button type="button" className="icon-button diagnostics-button" onClick={openDiagnostics} aria-label="Apri attività e diagnostica"><Icon name="activity" /></button></div>
    </header>

    <main id="main">
      <section className="workspace-heading" aria-labelledby="workspace-title">
        <div><div className="eyebrow"><span className="eyebrow-line" />IL TUO MIX, SUL PALCO</div><div className="workspace-title-row"><h1 id="workspace-title">Monitor<span>.</span></h1><span className="version-tag">01 / WING</span></div></div>
        <div className="editing-control"><div className="editing-copy"><strong>{state.editsEnabled && connected ? 'Modifiche abilitate' : 'Solo lettura'}</strong><span>{state.editsEnabled && connected ? isDemo ? 'I comandi agiscono sulla demo' : 'I comandi agiscono sul WING' : 'Abilita i comandi quando sei pronto'}</span></div><button type="button" className={`edit-toggle ${state.editsEnabled && connected ? 'edit-toggle--on' : ''}`} role="switch" aria-label="Abilita modifiche al mix" aria-checked={state.editsEnabled && connected} disabled={!connected || state.syncing} onClick={() => store.setEditsEnabled(!state.editsEnabled)}><span><Icon name={state.editsEnabled && connected ? 'unlock' : 'lock'} size={14} /></span></button></div>
      </section>

      {isDemo ? <div className="session-banner session-banner--demo"><div className="session-banner-copy"><span className="demo-label">SIMULAZIONE</span><span>Dati dimostrativi. Nessun mixer collegato.</span></div><button type="button" onClick={() => void runAction(store.disconnect)}>Esci dalla demo <Icon name="close" size={15} /></button></div> : !connected && !busy ? <div className="session-banner session-banner--idle"><div className="session-banner-copy"><span className="banner-symbol"><Icon name="headphones" size={20} /></span><div><strong>{state.status === 'error' || state.status === 'suspended' ? state.statusMessage : 'Il tuo palco, pronto a collegarsi.'}</strong><span>{state.nativeAvailable ? 'Collega l’iPad alla stessa rete del WING, poi inserisci il suo indirizzo IP.' : 'Collega il WING dall’app iPad. Nel browser puoi esplorare la simulazione.'}</span></div></div><button type="button" className="banner-demo-button" disabled={!canDemo} onClick={() => void enterDemo()}>Esplora la demo <Icon name="arrow" size={17} /></button></div> : <div className={`session-banner session-banner--live ${busy ? 'session-banner--busy' : ''}`}><div className="session-banner-copy"><span className={`status-dot ${busy ? 'status-dot--busy' : ''}`} /><strong>{busy ? state.statusMessage || 'Lettura dello stato del mixer…' : state.console?.name || 'WING'}</strong><span>{busy ? 'Attendi la conferma dei valori.' : [state.console?.model, state.console?.host].filter(Boolean).join(' · ')}</span></div><span className="session-mode">{busy ? 'SINCRONIZZAZIONE' : state.editsEnabled ? 'CONTROLLO ATTIVO' : 'LETTURA ATTIVA'}</span></div>}

      {visibleError && <div className="error-notice" role="alert"><span>{visibleError}</span><button className="icon-button" type="button" aria-label="Chiudi errore" onClick={() => { setUiError(null); setDismissedActivityId(latestActivity?.id ?? 0); }}><Icon name="close" size={16} /></button></div>}

      <section className="console-panel" aria-label="Controller dei monitor">
        <div className="mix-toolbar"><div className="mix-identity"><span className="mix-icon"><Icon name="headphones" size={22} /></span><div><span className="small-label">MIX SELEZIONATO</span><h2>{state.busName || `Bus ${pad(state.bus)}`}</h2></div></div><div className="mix-toolbar-right"><span className="bus-label">BUS <strong>{pad(state.bus)}</strong></span><span className="toolbar-divider" /><button type="button" className="icon-button refresh-button" onClick={() => void runAction(store.refresh)} disabled={!connected || busy} aria-label="Rileggi i valori dal mixer" title="Rileggi i valori"><Icon name="refresh" /></button></div></div>
        <div className="bus-selection"><span className="small-label bus-selection-label">USCITA</span><div className="bus-buttons" aria-label="Seleziona bus monitor">{Array.from({ length: 16 }, (_, i) => i + 1).map(bus => <button type="button" key={bus} className={`bus-button ${state.bus === bus ? 'bus-button--selected' : ''}`} aria-label={`Seleziona bus ${bus}`} aria-pressed={state.bus === bus} disabled={busy} onClick={() => void runAction(() => store.setBus(bus))}>{pad(bus)}</button>)}</div></div>
        <div className="bank-toolbar"><div className="bank-title"><span className="small-label">CANALI</span><strong>{pad(state.bank * 8 + 1)}<span>—</span>{pad(Math.min(40, state.bank * 8 + 8))}</strong><span className="bank-total">/ 40</span></div><div className="bank-buttons" aria-label="Banco di canali">{Array.from({ length: 5 }, (_, bank) => <button type="button" key={bank} className={`bank-button ${state.bank === bank ? 'bank-button--selected' : ''}`} aria-label={`Mostra canali da ${bank * 8 + 1} a ${bank * 8 + 8}`} aria-pressed={state.bank === bank} disabled={busy} onClick={() => void runAction(() => store.setBank(bank))}>{pad(bank * 8 + 1)}<span>–</span>{pad(bank * 8 + 8)}</button>)}</div></div>
        <div className="mixer-scroll"><div className="mixing-surface"><div className="channel-bank">{state.strips.map(strip => <ChannelStrip key={`${state.mode}-${state.bus}-${strip.channel}`} strip={strip} canEdit={canEdit} fresh={state.meterFresh && connected} onLevel={commitSendLevel} onSend={commitSendOn} />)}</div><article className="master-strip" aria-label={`Master bus ${state.bus}`}><div className="master-strip-top"><span className="small-label">USCITA</span><span className="master-bus-number">{pad(state.bus)}</span></div><div className="master-heading"><h3>Master</h3><span>BUS {pad(state.bus)}</span></div><div className="master-fader-area"><Fader key={`${state.mode}-${state.bus}`} value={state.busLevel} disabled={!canEdit || state.busPending || !isKnown(state.busLevel)} pending={state.busPending} label={`Livello master bus ${state.bus}`} onCommit={commitBusLevel} /><Meter value={state.busMeter} fresh={state.meterFresh && connected} label={`Meter bus ${state.bus}`} shortLabel="OUT" /></div><div className="master-state"><Icon name={canEdit ? 'unlock' : 'lock'} size={13} /><span>{state.busPending ? 'Conferma…' : canEdit ? 'CONTROLLO' : 'PROTETTO'}</span></div><div className="master-description">Livello del bus</div></article></div></div>
        <div className="console-bottom"><span><span className={`tiny-indicator ${state.meterFresh && connected ? 'tiny-indicator--active' : ''}`} />{state.meterFresh && connected ? 'Meter attivi' : connected ? 'Meter in attesa' : 'Meter non disponibili'}</span><span className="fader-hint">{canEdit ? 'Regola, poi rilascia per inviare.' : 'I fader sono protetti in sola lettura.'}</span><span className="surface-label">40 INPUT <span>/</span> 16 BUS</span></div>
      </section>
    </main>

    <footer className="app-footer"><span className="footer-product">SCULPT WING <span>v0.1</span></span><button type="button" className="activity-summary" onClick={openDiagnostics}><span className={`activity-indicator ${latestActivity?.kind === 'error' ? 'activity-indicator--error' : ''}`} /><span>{latestActivity?.text || 'In attesa di una connessione'}</span></button><span className="footer-environment">{isDemo ? 'AMBIENTE DEMO' : state.nativeAvailable ? 'APP IPAD' : 'ANTEPRIMA WEB'}</span></footer>

    {dialog === 'connection' && <Dialog title="Collega il tuo WING" onClose={() => setDialog(null)}>
      <p className="dialog-description">iPad e mixer sulla stessa rete. Tutto il controllo resta sul palco.</p>
      <div className={`connection-card ${isDemo ? 'connection-card--demo' : ''}`}><span className="status-dot" /><div><strong>{statusLabel}</strong><span>{state.statusMessage || 'Inserisci l’indirizzo del mixer per iniziare.'}</span></div></div>
      {!state.nativeAvailable && <div className="browser-notice"><Icon name="link" size={20} /><p><strong>La connessione richiede l’app iPad.</strong><span>Questa anteprima web esegue solo la simulazione. Apri Sculpt Wing installato sull’iPad per comunicare direttamente con il WING.</span></p></div>}
      <form onSubmit={event => { event.preventDefault(); if (state.nativeAvailable && !busy && state.mode !== 'demo' && !connected) void connect(); }}>
        <label className="field-label" htmlFor="mixer-ip">INDIRIZZO IP DEL WING</label><div className="ip-input-wrap"><Icon name="link" size={18} /><input id="mixer-ip" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="192.168.1.100" value={host} disabled={busy || connected || isDemo || !state.nativeAvailable} onChange={event => setHost(event.currentTarget.value)} aria-describedby="ip-help" /></div><p className="field-help" id="ip-help">Usa l’indirizzo IPv4 indicato nelle impostazioni di rete del mixer.</p>
        {state.console && !isDemo && <dl className="console-info"><div><dt>Console</dt><dd>{state.console.model || '—'}</dd></div><div><dt>Firmware</dt><dd>{state.console.firmware || '—'}</dd></div></dl>}
        {visibleError && <p className="dialog-error" role="alert">{visibleError}</p>}
        {state.mode !== 'idle' || busy ? <button type="button" className="button button--disconnect button--full" onClick={() => void runAction(store.disconnect)}><Icon name="power" />{isDemo ? 'Esci dalla simulazione' : 'Disconnetti'}</button> : <button type="submit" className="button button--primary button--full" disabled={!state.nativeAvailable || busy || !host.trim()}><Icon name="link" />{busy ? 'Connessione…' : 'Collega WING'}<Icon name="arrow" /></button>}
      </form>
      <div className="dialog-demo-section"><div><strong>Vuoi esplorare il controller?</strong><span>La demo usa dati simulati, senza inviare comandi.</span></div><button type="button" className="button button--quiet" disabled={!canDemo} onClick={() => void enterDemo()}>Apri demo <Icon name="arrow" size={16} /></button></div>
    </Dialog>}

    {dialog === 'diagnostics' && <Dialog title="Attività e diagnostica" onClose={() => setDialog(null)} wide>
      <p className="dialog-description">Stato della sessione e ultime operazioni del controller.</p>
      <div className="diagnostic-summary"><div><span className="small-label">AMBIENTE</span><strong>{isDemo ? 'Simulazione' : state.nativeAvailable ? 'App iPad' : 'Browser'}</strong></div><div><span className="small-label">SESSIONE</span><strong>{statusLabel}</strong></div><div><span className="small-label">COMANDI</span><strong>{canEdit ? 'Abilitati' : 'Solo lettura'}</strong></div></div>
      <div className="activity-list" aria-label="Ultime attività">{state.activity.length ? [...state.activity].sort((a, b) => b.id - a.id).slice(0, 15).map(item => <div key={item.id} className={`activity-item activity-item--${item.kind}`}><span className="activity-indicator" /><time>{item.time}</time><span>{item.text}</span></div>) : <p className="activity-empty">Nessuna attività registrata.</p>}</div>
      <details className="diagnostic-details"><summary>Mostra dati diagnostici</summary><textarea ref={diagnosticsRef} readOnly value={diagnostics} aria-label="Dati diagnostici JSON" spellCheck={false} /></details>
      <button type="button" className="button button--primary button--full" onClick={async () => { try { await navigator.clipboard.writeText(diagnostics); setCopyState('copied'); } catch { setCopyState('manual'); diagnosticsRef.current?.closest('details')?.setAttribute('open', ''); diagnosticsRef.current?.focus(); diagnosticsRef.current?.select(); } }}><Icon name={copyState === 'copied' ? 'check' : 'copy'} />{copyState === 'copied' ? 'Diagnostica copiata' : 'Copia diagnostica'}</button>
      {copyState === 'manual' && <p className="field-help">Copia automatica non disponibile. Il testo è selezionato: puoi copiarlo manualmente.</p>}
    </Dialog>}
  </div>;
}
