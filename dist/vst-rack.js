(() => {
  'use strict';
  const M = window.SculptVstModel, C = window.SculptController;
  if (!M || !C) return;
  const KEY = 'sculpt-wing-vst-rack-labels-v1';
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* Labels are optional. Plugin states are stored by the desktop host. */ }
  let state = { running: false, scanning: false, audio: {}, plugins: [], racks: M.metadata(saved).racks, cpu: 0, xruns: 0 };
  let connected = false, initialized = false, initialization = null, busy = false, fault = '', scanMessage = '';
  let modal = null, panel = 'audio', rackId = 'ch-1', selectedSlot = 0, pluginQuery = '';
  let deviceList = [], audioDraft = null, routingDraft = null, priorFocus = null;
  const channelViews = new Set(), routePlans = new Map();
  const routeFingerprint = rack => JSON.stringify(rack ? [rack.placement ?? null, rack.inputChannels, rack.outputChannels] : null);
  const liveControlKey = () => JSON.stringify([!!window.SculptLive?.isConnected?.(), !!window.SculptLive?.isWritable?.(), window.SculptLive?.sessionToken?.() ?? null]);
  let lastLiveControlKey = liveControlKey();
  const available = () => window.SculptDesktop?.platform === 'macos' && typeof window.SculptDesktop?.audioRequest === 'function';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const button = (text, action, cls = '') => { const n = el('button', `vst-button ${cls}`, text); n.type = 'button'; if (action) n.addEventListener('click', action); return n; };
  const note = text => el('p', 'vst-note', text);
  const stripName = id => { const s = C.getStrip(id); return s ? `${s.kind} ${s.number} · ${s.name}` : id.toUpperCase(); };
  const getRack = id => state.racks.find(r => r.id === id) || null;
  const getCount = (kind, fallback = 48) => { const v = state.audio?.[kind]; return Array.isArray(v) ? v.length : Number.isInteger(v) && v > 0 ? v : fallback; };
  const isStructuralLocked = () => busy || state.running || state.scanning || !connected;
  function message(error) { fault = typeof error === 'string' ? error : error?.message || 'Operazione audio non riuscita.'; updateStatus(); renderAlert(); refreshChannelViews(); }
  function emit(id) { window.dispatchEvent(new CustomEvent('sculpt-vst-state', { detail: { ...(id ? { id } : {}), connected, running: state.running, error: fault, racks: state.racks } })); refreshChannelViews(); }
  function routingStatus(id) {
    const raw = window.SculptVstRouting?.status?.(id) || {};
    const status = raw.active ? 'applied' : ({ idle: getRack(id)?.placement ? 'planned' : 'unconfigured', prepared: 'planned', active: 'applied', 'restore-required': 'stale', 'wrong-console': 'conflict' })[raw.state] || raw.state || (getRack(id)?.placement ? 'planned' : 'unconfigured');
    return { ...raw, state: status };
  }
  function requireReleasedRoute(id) {
    if (window.SculptVstRouting?.status?.(id)?.managed) throw new Error('Ripristina prima il percorso WING di questo canale, poi cambia posizione o collegamenti USB.');
  }
  const hasManagedRoute = () => C.listStrips().some(strip => M.validId(strip.id) && window.SculptVstRouting?.status?.(strip.id)?.managed);
  function accept(data) {
    if (!data || typeof data !== 'object') return;
    if (data.telemetry || data.partial) {
      const controlsChanged = ('running' in data && data.running !== state.running) || ('scanning' in data && data.scanning !== state.scanning);
      for (const key of ['running', 'scanning', 'audio', 'cpu', 'xruns', 'rackMeters']) if (key in data) state[key] = data[key];
      updateStatus();
      if (controlsChanged) { emit(); if (modal?.open && !busy) render(); }
      return;
    }
    const oldRunning = state.running, oldScanning = state.scanning;
    if (Array.isArray(data.racks)) for (const id of routePlans.keys()) {
      if (routeFingerprint(getRack(id)) !== routeFingerprint(data.racks.find(rack => rack.id === id))) routePlans.delete(id);
    }
    state = { ...state, ...data, racks: Array.isArray(data.racks) ? data.racks : state.racks, plugins: Array.isArray(data.plugins) ? data.plugins : state.plugins };
    connected = true;
    try { localStorage.setItem(KEY, JSON.stringify(M.metadata(state))); } catch { /* Plugin presets remain in the desktop session file. */ }
    emit(); updateStatus();
    if (modal?.open && !busy && (oldRunning !== state.running || oldScanning !== state.scanning || panel === 'rack')) render();
  }
  async function request(method, params = {}) {
    if (!available()) throw new Error('Il rack VST3 è disponibile nell’app Sculpt Wing per Mac Apple Silicon.');
    const result = await window.SculptDesktop.audioRequest({ method, params });
    if (result && typeof result === 'object' && ('racks' in result || 'running' in result || 'scanning' in result)) accept(result);
    return result;
  }
  async function ensure() {
    if (initialized && connected) return;
    if (initialization) return initialization;
    initialization = (async () => {
      await request('status');
      const restored = await request('loadSession');
      if (restored?.state) accept(restored.state);
      accept(await request('getState'));
      initialized = true; connected = true; fault = '';
    })();
    try { await initialization; } finally { initialization = null; }
  }
  async function action(work, { structure = false, save = true, refresh = true } = {}) {
    if (busy) return false;
    if (structure && state.running) { message('Ferma l’audio USB prima di modificare plugin o collegamenti.'); return false; }
    if (state.scanning) { message('Attendi il completamento della scansione VST3.'); return false; }
    busy = true; fault = ''; render();
    try {
      await ensure();
      await work();
      if (refresh) accept(await request('getState'));
      if (save) await request('saveSession');
      return true;
    } catch (error) { message(error); return false; }
    finally { busy = false; render(); }
  }
  async function editRack(change, { structure = true, id = rackId } = {}) {
    return action(async () => {
      // Always take a fresh plugin state before a structural edit; an open
      // native editor may have changed a preset since the last UI event.
      accept(await request('getState'));
      let rack = getRack(id);
      if (!rack) throw new Error('Assegna prima gli ingressi e le uscite USB del rack.');
      rack = JSON.parse(JSON.stringify(rack));
      change(rack);
      M.validateRouting(rack, state.racks, getCount('inputChannels'), getCount('outputChannels'));
      await request('setRack', rack);
    }, { structure });
  }
  async function setPlacement(id, value) {
    value = value ?? null;
    if (!M.validId(id) || value != null && !M.placement(value)) return false;
    if (value && M.placementOptions(id).find(option => option.value === value)?.disabled) { message('Questo punto VST3 non è disponibile sul canale selezionato.'); return false; }
    const result = await action(async () => {
      accept(await request('getState'));
      const current = getRack(id);
      if ((current?.placement ?? null) === value) return;
      requireReleasedRoute(id);
      const next = current ? JSON.parse(JSON.stringify(current)) : { id, enabled: false, slots: [], ...M.freeRouting(state.racks, 1, getCount('inputChannels'), getCount('outputChannels')) };
      next.placement = value;
      M.validateRouting(next, state.racks, getCount('inputChannels'), getCount('outputChannels'));
      await request('setRack', next); routePlans.delete(id); if (rackId === id) routingDraft = null;
    }, { structure: true });
    emit(id); return result;
  }
  async function prepareRoute(id) {
    return action(async () => {
      const router = window.SculptVstRouting, rack = getRack(id);
      if (!router || !rack?.placement) throw new Error('Scegli prima la posizione del rack e i collegamenti USB.');
      routePlans.set(id, await router.prepare(JSON.parse(JSON.stringify(rack))));
    }, { structure: true, save: false, refresh: false });
  }
  async function applyRoute(id) {
    return action(async () => {
      const plan = routePlans.get(id);
      if (!plan) throw new Error('Leggi prima il percorso dalla WING.');
      await window.SculptVstRouting.apply(plan); routePlans.delete(id);
    }, { structure: true, save: false, refresh: false });
  }
  async function restoreRoute(id) {
    return action(async () => {
      if (!window.SculptVstRouting) throw new Error('Il routing WING non è disponibile.');
      await window.SculptVstRouting.restore(id); routePlans.delete(id);
    }, { structure: true, save: false, refresh: false });
  }
  async function toggleAudio() {
    return action(async () => {
      if (state.running) await request('stopAudio');
      else {
        if (!state.audio?.inputDevice || !state.audio?.outputDevice) throw new Error('Configura prima l’interfaccia in Audio USB.');
        if (!state.racks.length) throw new Error('Crea almeno un rack con ingressi e uscite assegnati.');
        await request('startAudio');
      }
    });
  }
  async function refreshDevices() {
    const result = await request('devices');
    deviceList = Array.isArray(result) ? result : result?.devices || [];
    if (!audioDraft) audioDraft = {
      inputDevice: state.audio?.inputDevice || deviceList.find(d => /wing/i.test(d.name) && d.inputChannels?.length)?.name || '',
      outputDevice: state.audio?.outputDevice || deviceList.find(d => /wing/i.test(d.name) && d.outputChannels?.length)?.name || '',
      sampleRate: state.audio?.sampleRate || 48000,
      bufferSize: state.audio?.bufferSize || 128
    };
  }
  function field(label, control) { const n = el('label', 'vst-field'); n.append(el('span', '', label), control); control.setAttribute('aria-label', label); return n; }
  function select(label, value, options, onChange, disabled = false) {
    const n = el('select', 'vst-select');
    for (const item of options) { const o = typeof item === 'object' ? item : { value: item, label: item }; const option = el('option', '', o.label); option.value = String(o.value); option.disabled = !!o.disabled; n.append(option); }
    n.value = String(value ?? ''); n.disabled = disabled; n.addEventListener('change', () => onChange(n.value)); return field(label, n);
  }
  function placementControl(id, value = getRack(id)?.placement, onChange = next => setPlacement(id, next)) {
    return select('Posizione VST3 nel canale', value || '', [{ value: '', label: 'Da associare' }, ...M.placementOptions(id)], next => onChange(next || null), isStructuralLocked());
  }
  function routeDescription(id, rack = getRack(id)) {
    const placement = M.PLACEMENTS.find(item => item.value === rack?.placement);
    return placement?.description || 'Scegli Pre, Insert 1 o Insert 2 per questo canale.';
  }
  function renderWingRoute(container, id) {
    const rack = getRack(id), status = routingStatus(id), plan = routePlans.get(id), live = window.SculptLive;
    const section = el('section', 'vst-wing-route'); section.dataset.routeState = status.state;
    const heading = el('div', 'vst-wing-route-heading');
    heading.append(el('strong', '', 'Percorso nella WING'), el('span', 'vst-route-badge', status.state === 'applied' ? 'Verificato' : status.managed ? 'Da verificare / ripristinare' : plan ? 'Pronto da applicare' : rack?.placement ? 'Da applicare' : 'Da associare'));
    section.append(heading, note(routeDescription(id, rack)));
    if (status.source?.sourceId) section.append(note(`Sorgente originale: ${status.source.sourceId.replace(':', ' ')}`));
    if (status.message) section.append(note(status.message));
    if (plan) {
      const summary = el('div', 'vst-route-plan');
      const lines = Array.isArray(plan.summary) ? plan.summary : plan.summary ? [String(plan.summary)] : [`${M.placementLabel(plan.placement)} · USB ${M.channelLabel(rack.inputChannels)} → ${M.channelLabel(rack.outputChannels)}`];
      for (const line of lines) summary.append(el('p', '', typeof line === 'string' ? line : line.label || line.description || 'Collegamento preparato'));
      section.append(summary);
    }
    const actions = el('div', 'vst-route-actions');
    const ready = !!window.SculptVstRouting && !!live?.isConnected?.() && !!live?.isWritable?.() && !isStructuralLocked();
    if (status.managed) {
      const restore = button(rack?.placement === 'pre' ? 'Ripristina ingresso diretto' : 'Ripristina percorso WING', () => restoreRoute(id));
      restore.disabled = !ready || status.canRestore === false; actions.append(restore);
    } else {
      const prepare = button(plan ? 'Rileggi percorso WING' : 'Leggi percorso WING', () => prepareRoute(id));
      prepare.disabled = !ready || !rack?.placement; actions.append(prepare);
      if (plan) { const apply = button('Applica percorso WING', () => applyRoute(id), 'vst-primary'); apply.disabled = !ready; actions.append(apply); }
    }
    section.append(actions);
    if (!live?.isConnected?.()) section.append(note('Collega la WING via Ethernet per leggere e applicare il percorso. La scelta della posizione è conservata nel rack.'));
    else if (!live.isWritable?.()) section.append(note('Attiva Controllo nella connessione WING per applicare il percorso.'));
    else if (state.running) section.append(note('Ferma l’audio USB per cambiare il percorso.'));
    container.append(section);
  }
  function refreshChannelViews() {
    for (const view of channelViews) {
      if (view.disposed) continue;
      const rack = getRack(view.id), route = routingStatus(view.id), plan = routePlans.get(view.id);
      const signature = JSON.stringify([busy, connected, state.running, state.scanning, fault, liveControlKey(), M.metadata({ racks: rack ? [rack] : [] }), route.state, route.message, route.managed, route.canRestore, plan?.summary]);
      if (view.signature === signature) continue;
      view.signature = signature;
      const { container, id } = view, scrollTop = container.scrollTop, scrollLeft = container.scrollLeft;
      container.replaceChildren(); container.classList.add('vst-channel-panel');
      const heading = el('div', 'vst-channel-heading');
      heading.append(el('strong', '', stripName(id)), placementControl(id));
      const setup = button('Audio USB', openAudio); heading.append(setup);
      if (rack) {
        const bypass = button(rack.enabled ? 'Rack attivo' : 'Rack in bypass', () => editRack(next => { next.enabled = !next.enabled; }, { id, structure: false }), 'vst-bypass');
        bypass.setAttribute('aria-pressed', String(!rack.enabled)); bypass.disabled = busy || state.scanning || !connected; heading.append(bypass);
      }
      const audio = button(state.running ? 'Ferma audio USB' : 'Avvia audio USB', toggleAudio, state.running ? 'vst-stop' : 'vst-primary');
      audio.disabled = busy || state.scanning || !connected || !available(); heading.append(audio); container.append(heading);
      if (fault) { const alert = el('div', 'vst-channel-alert', fault); alert.setAttribute('role', 'alert'); container.append(alert); }
      const layout = el('div', 'vst-channel-layout'), chain = el('section', 'vst-channel-chain');
      for (let index = 0; index < M.MAX_SLOTS; index++) {
        const slot = rack?.slots?.[index], item = el('div', `vst-channel-slot${slot?.missing ? ' is-missing' : ''}`);
        const open = button('', () => slot?.pluginId && !slot.missing ? openSlot(id, index) : show('rack', id, index), 'vst-channel-plugin');
        open.append(el('small', '', String.fromCharCode(65 + index)), el('strong', '', slot?.name || (slot?.pluginId ? 'Plugin VST3' : '+ VST3')));
        open.setAttribute('aria-label', `${slot?.pluginId ? 'Apri' : 'Scegli'} VST3 ${index + 1} · ${stripName(id)}`); open.disabled = busy; item.append(open);
        if (slot?.pluginId) {
          const bypass = button('BYP', () => editRack(next => { if (next.slots[index]?.pluginId) next.slots[index].bypass = !next.slots[index].bypass; }, { id, structure: false }), 'vst-slot-bypass');
          bypass.setAttribute('aria-label', `Bypass VST3 ${index + 1} · ${stripName(id)}`); bypass.setAttribute('aria-pressed', String(!!slot.bypass));
          bypass.disabled = busy || state.scanning || !connected || slot.missing; item.append(bypass);
          const choose = button('▾', () => show('rack', id, index), 'vst-slot-choose'); choose.setAttribute('aria-label', `Sostituisci VST3 ${index + 1}`); choose.disabled = isStructuralLocked(); item.append(choose);
        }
        chain.append(item);
      }
      const links = el('div', 'vst-channel-links');
      links.append(note(rack ? `Dal mixer: USB ${M.channelLabel(rack.inputChannels)} · Al mixer: USB ${M.channelLabel(rack.outputChannels)} · ${rack.inputChannels?.length === 2 ? 'Stereo' : 'Mono'}` : 'Scegli la posizione o apri il rack per assegnare gli ingressi e le uscite USB.'), button('Plugin e collegamenti USB', () => openRack(id)));
      if (!available()) links.append(note('L’elaborazione VST3 e gli editor originali sono disponibili nell’app Mac.'));
      chain.append(links);
      const routing = el('div', 'vst-channel-routing'); renderWingRoute(routing, id); layout.append(chain, routing); container.append(layout);
      container.scrollTop = scrollTop; container.scrollLeft = scrollLeft;
    }
  }
  function renderChannel(container, id) {
    if (!M.validId(id)) { container.append(note('Seleziona una strip audio.')); return () => {}; }
    const view = { id, container, disposed: false, signature: '' }; channelViews.add(view); refreshChannelViews();
    if (available() && !connected) ensure().then(refreshChannelViews).catch(message);
    return () => { view.disposed = true; channelViews.delete(view); container.classList.remove('vst-channel-panel'); };
  }
  function makeDialog() {
    if (modal) return;
    modal = el('dialog', 'vst-dialog'); modal.id = 'vst-rack-dialog'; modal.setAttribute('aria-labelledby', 'vst-panel-title');
    modal.innerHTML = '<header class="vst-header"><div><p class="vst-eyebrow">SCULPT WING · VST3</p><h2 id="vst-panel-title">Audio USB</h2></div><div class="vst-header-actions"></div></header><nav class="vst-tabs" aria-label="Rack VST3"></nav><div class="vst-statusbar" role="status"></div><div class="vst-alert" role="alert" hidden></div><div class="vst-body"></div><footer class="vst-footer"></footer>';
    const close = button('×', () => modal.close(), 'vst-close'); close.setAttribute('aria-label', 'Chiudi rack VST3'); modal.querySelector('.vst-header-actions').append(close);
    modal.addEventListener('close', () => {
      if (connected && !busy) request('saveSession').catch(message);
      priorFocus?.isConnected && priorFocus.focus?.({ preventScroll: true });
    });
    document.body.append(modal);
  }
  function renderAlert() {
    if (!modal) return;
    const alert = modal.querySelector('.vst-alert'); alert.hidden = !fault; alert.textContent = fault;
  }
  function updateStatus() {
    const status = !available() ? 'VST3 · app Mac' : fault && !connected ? 'USB · errore' : state.running ? 'USB · audio attivo' : 'USB · fermo';
    const toolbar = document.getElementById('vst-audio-button'); if (toolbar) { toolbar.textContent = status; toolbar.classList.toggle('is-running', !!state.running); toolbar.classList.toggle('has-error', !!fault); toolbar.title = 'Rack VST3 · audio USB separato dal controllo WING Ethernet'; }
    if (!modal) return;
    const cpuValue = Number(state.cpu) || 0;
    const cpu = cpuValue <= 1 ? cpuValue * 100 : cpuValue;
    const parts = [status, state.audio?.sampleRate ? `${(state.audio.sampleRate / 1000).toLocaleString('it-IT')} kHz` : '', state.audio?.bufferSize ? `${state.audio.bufferSize} campioni` : '', connected ? `CPU ${cpu.toFixed(1)}%` : '', connected ? `Dropout ${Number(state.xruns) || 0}` : ''];
    const bar = modal.querySelector('.vst-statusbar'); bar.textContent = parts.filter(Boolean).join('  ·  '); bar.classList.toggle('is-running', !!state.running);
    const measured = modal.querySelector('[data-vst-latency]');
    if (measured) {
      const samples = Number(state.audio?.latencySamples);
      measured.textContent = Number.isFinite(samples) && state.audio.sampleRate > 0 ? `${(samples * 1000 / state.audio.sampleRate).toFixed(2)} ms dichiarati dal dispositivo · escluso ritardo dei plugin` : 'Latenza del dispositivo disponibile dopo la configurazione';
    }
    const rackLatency = modal.querySelector('[data-vst-rack-latency]');
    if (rackLatency) { const rack = getRack(rackId), samples = state.rackMeters?.find(r => r.id === rackId)?.latencySamples ?? rack?.latencySamples; rackLatency.textContent = `Plugin: ${Number(samples) || 0} campioni${state.audio?.sampleRate ? ` · ${((Number(samples) || 0) * 1000 / state.audio.sampleRate).toFixed(2)} ms` : ''}`; }
  }
  function renderAudio(container) {
    container.append(note('Ethernet controlla la WING. Il collegamento USB invia l’audio al Mac, attraversa i VST3 e riporta il segnale al mixer.'));
    if (!available()) { container.append(el('div', 'vst-empty', 'Apri Sculpt Wing sul Mac per scegliere l’interfaccia USB e caricare i tuoi VST3.')); return; }
    const draft = audioDraft || { inputDevice: state.audio?.inputDevice || '', outputDevice: state.audio?.outputDevice || '', sampleRate: state.audio?.sampleRate || 48000, bufferSize: state.audio?.bufferSize || 128 };
    if (connected) audioDraft = draft;
    const controls = el('div', 'vst-audio-grid');
    const channelCount = (device, key) => Array.isArray(device[key]) ? device[key].length : Number(device[key]) || 0;
    const options = [{ value: '', label: 'Seleziona dispositivo…' }, ...deviceList.filter(d => channelCount(d, 'inputChannels') > 0 && channelCount(d, 'outputChannels') > 0).map(d => ({ value: d.name, label: `${d.name} · ${channelCount(d, 'inputChannels')} in / ${channelCount(d, 'outputChannels')} out` }))];
    if (draft.inputDevice && !options.some(o => o.value === draft.inputDevice)) options.push({ value: draft.inputDevice, label: `${draft.inputDevice} · non disponibile`, disabled: true });
    controls.append(select('Interfaccia USB', draft.inputDevice, options, value => {
      draft.inputDevice = value; draft.outputDevice = value;
      const device = deviceList.find(d => d.name === value);
      if (device?.sampleRates?.length && !device.sampleRates.includes(draft.sampleRate)) draft.sampleRate = device.sampleRates.includes(48000) ? 48000 : device.sampleRates[0];
      if (device?.bufferSizes?.length && !device.bufferSizes.includes(draft.bufferSize)) draft.bufferSize = device.bufferSizes.includes(128) ? 128 : device.bufferSizes[0];
      render();
    }, isStructuralLocked() || hasManagedRoute()));
    const out = deviceList.find(d => d.name === draft.outputDevice), rates = out?.sampleRates?.length ? out.sampleRates : [44100, 48000], sizes = out?.bufferSizes?.length ? out.bufferSizes : [32, 64, 128, 256, 512, 1024];
    controls.append(select('Frequenza', draft.sampleRate, rates.map(v => ({ value: v, label: `${v / 1000} kHz` })), v => { draft.sampleRate = Number(v); }, isStructuralLocked()), select('Buffer', draft.bufferSize, sizes.map(v => ({ value: v, label: `${v} campioni` })), v => { draft.bufferSize = Number(v); }, isStructuralLocked()));
    const apply = button('Applica dispositivo', () => action(async () => {
      if (!draft.inputDevice || !draft.outputDevice) throw new Error('Seleziona ingresso e uscita USB.');
      if (draft.inputDevice !== draft.outputDevice) throw new Error('Seleziona una sola interfaccia USB per ingresso e uscita.');
      if ((draft.inputDevice !== state.audio?.inputDevice || draft.outputDevice !== state.audio?.outputDevice) && hasManagedRoute()) throw new Error('Ripristina prima i percorsi WING dei rack, poi cambia interfaccia USB.');
      await request('configureAudio', { ...draft });
      routePlans.clear();
      audioDraft = null;
    }, { structure: true }), 'vst-primary'); apply.disabled = isStructuralLocked();
    const reload = button(connected ? 'Aggiorna dispositivi' : 'Riconnetti motore', async () => {
      if (busy || state.running || state.scanning) return;
      busy = true; fault = ''; render();
      try {
        // devices is an explicit user action and may restart a failed helper.
        await refreshDevices(); connected = true;
        if (!initialized) { const restored = await request('loadSession'); if (restored?.state) accept(restored.state); initialized = true; }
        accept(await request('getState'));
      } catch (error) { message(error); } finally { busy = false; render(); }
    }); reload.disabled = busy || state.running || state.scanning;
    controls.append(apply, reload); container.append(controls);
    if (hasManagedRoute()) container.append(note('Interfaccia associata a un percorso WING: ripristina i percorsi dei rack prima di cambiarla. Buffer e frequenza restano modificabili con audio fermo.'));
    const latency = note(''); latency.dataset.vstLatency = ''; container.append(latency);
    container.append(note('Le catene lavorano sul Mac. Aggiunta, rimozione e riordino dei plugin richiedono audio fermo; parametri e bypass restano utilizzabili durante l’audio.'));
    const racks = el('section', 'vst-rack-overview'); racks.append(el('h3', '', `Rack assegnati · ${state.racks.length}/${M.MAX_RACKS}`));
    if (!state.racks.length) racks.append(note('Apri uno slot VST nella vista Extended per preparare il primo rack.'));
    for (const rack of state.racks) {
      const row = button('', () => openRack(rack.id), 'vst-overview-row');
      row.append(el('strong', '', stripName(rack.id)), el('span', '', `${rack.inputChannels?.length === 2 ? 'Stereo' : 'Mono'} · USB ${M.channelLabel(rack.inputChannels)} → ${M.channelLabel(rack.outputChannels)}`), el('small', '', `${rack.slots?.filter(s => s?.pluginId).length || 0} VST3${rack.enabled ? '' : ' · bypass'}`)); racks.append(row);
    }
    container.append(racks);
  }
  function renderRouting(container, rack) {
    const id = rackId;
    const section = el('section', 'vst-routing'); section.append(el('h3', '', rack ? 'Collegamenti USB' : 'Assegna il percorso USB'));
    let draft = routingDraft;
    if (!draft) {
      if (rack) draft = { width: rack.inputChannels.length, placement: rack.placement ?? null, inputChannels: [...rack.inputChannels], outputChannels: [...rack.outputChannels] };
      else {
        const placement = /^(ch|aux)-/.test(id) ? 'pre' : 'insert1';
        try { draft = { width: 1, placement, ...M.freeRouting(state.racks, 1, getCount('inputChannels'), getCount('outputChannels')) }; }
        catch { draft = { width: 1, placement, inputChannels: [0], outputChannels: [0] }; }
      }
      if (connected) routingDraft = draft;
    }
    const grid = el('div', 'vst-routing-grid');
    grid.append(placementControl(id, draft.placement, value => { draft.placement = value; render(); }));
    grid.append(select('Formato rack', draft.width, [{ value: 1, label: 'Mono' }, { value: 2, label: 'Stereo' }], v => {
      const width = Number(v); draft.width = width;
      for (const key of ['inputChannels', 'outputChannels']) draft[key] = width === 1 ? draft[key].slice(0, 1) : [draft[key][0], Math.min(47, draft[key][0] + 1)]; render();
    }, isStructuralLocked()));
    for (const [key, label, countKey] of [['inputChannels', 'Dal mixer · USB', 'inputChannels'], ['outputChannels', 'Al mixer · USB', 'outputChannels']]) {
      for (let ch = 0; ch < draft.width; ch++) grid.append(select(`${label}${draft.width === 2 ? ` ${ch ? 'R' : 'L'}` : ''}`, draft[key][ch], Array.from({ length: Math.min(48, getCount(countKey)) }, (_, i) => ({ value: i, label: `USB ${i + 1}` })), v => { draft[key][ch] = Number(v); }, isStructuralLocked()));
    }
    const apply = button(rack ? 'Applica collegamenti' : 'Crea rack', () => action(async () => {
      accept(await request('getState'));
      const current = getRack(id);
      const next = { ...(current || { id, enabled: false, slots: [] }), placement: draft.placement ?? null, inputChannels: [...draft.inputChannels], outputChannels: [...draft.outputChannels] };
      if (!current || JSON.stringify([current.placement ?? null, current.inputChannels, current.outputChannels]) !== JSON.stringify([next.placement, next.inputChannels, next.outputChannels])) requireReleasedRoute(id);
      M.validateRouting(next, state.racks, getCount('inputChannels'), getCount('outputChannels'));
      await request('setRack', next); routePlans.delete(id); if (rackId === id) routingDraft = null;
    }, { structure: true }), 'vst-primary'); apply.disabled = isStructuralLocked(); grid.append(apply); section.append(grid);
    section.append(note('Questi collegamenti appartengono al rack sul Mac. Leggi e applica il percorso WING qui sotto per collegarlo al punto scelto del canale.'));
    if (rack) {
      const remove = button('Rimuovi rack', () => action(async () => { requireReleasedRoute(id); await request('removeRack', { id }); routePlans.delete(id); if (rackId === id) routingDraft = null; }, { structure: true }), 'vst-danger'); remove.disabled = isStructuralLocked(); section.append(remove);
    }
    container.append(section);
    renderWingRoute(container, id);
  }
  function renderRack(container) {
    const id = rackId, slotIndex = selectedSlot, rack = getRack(id), summary = el('div', 'vst-rack-summary');
    summary.append(el('h3', '', stripName(id)));
    if (rack) {
      const bypass = button(rack.enabled ? 'Rack attivo' : 'Rack in bypass', () => editRack(r => { r.enabled = !r.enabled; }, { id, structure: false }), 'vst-bypass'); bypass.setAttribute('aria-pressed', String(!rack.enabled)); bypass.disabled = busy || state.scanning || !connected;
      summary.append(bypass);
    }
    const lat = el('span', 'vst-latency'); lat.dataset.vstRackLatency = ''; summary.append(lat); container.append(summary);
    if (!available()) { container.append(note('Per caricare i VST3 e usare l’audio USB apri questa vista nell’app Mac.')); return; }
    const layout = el('div', 'vst-rack-layout'), chain = el('section', 'vst-chain'), catalog = el('section', 'vst-catalog');
    chain.append(el('h3', '', 'Insert VST3 · Mac'));
    for (let i = 0; i < M.MAX_SLOTS; i++) {
      const slot = rack?.slots?.[i], row = el('div', `vst-slot${i === slotIndex ? ' is-selected' : ''}${slot?.missing ? ' is-missing' : ''}`);
      const open = button('', () => {
        selectedSlot = i;
        if (slot?.pluginId && !slot.missing) openSlot(id, i);
        else render();
      }, 'vst-slot-name'); open.append(el('small', '', String.fromCharCode(65 + i)), el('span', '', slot?.name || (slot?.pluginId ? 'Plugin' : 'Scegli VST3…'))); open.disabled = busy;
      if (slot?.missing) open.title = 'Plugin non trovato sul Mac: scegli un altro VST3 o ripeti la scansione.';
      row.append(open);
      const choose = button('▾', () => { selectedSlot = i; render(); modal.querySelector('.vst-search')?.focus(); }, 'vst-slot-choose'); choose.setAttribute('aria-label', `Scegli plugin nello slot ${String.fromCharCode(65 + i)}`); choose.disabled = isStructuralLocked() || !rack; row.append(choose);
      if (slot?.pluginId) {
        const bypass = button('BYP', () => editRack(r => { if (r.slots[i]?.pluginId) r.slots[i].bypass = !r.slots[i].bypass; }, { id, structure: false }), 'vst-slot-bypass'); bypass.setAttribute('aria-label', `Bypass ${slot.name || 'plugin'} slot ${i + 1}`); bypass.setAttribute('aria-pressed', String(!!slot.bypass)); bypass.disabled = busy || state.scanning || !connected || slot.missing; row.append(bypass);
      }
      chain.append(row);
    }
    const order = el('div', 'vst-chain-actions');
    for (const [direction, label] of [[-1, 'Sposta su'], [1, 'Sposta giù']]) {
      const b = button(label, () => editRack(r => {
        while (r.slots.length < M.MAX_SLOTS) r.slots.push({ pluginId: null, bypass: false });
        const next = slotIndex + direction; [r.slots[slotIndex], r.slots[next]] = [r.slots[next], r.slots[slotIndex]]; if (rackId === id) selectedSlot = next;
      }, { id })); b.disabled = isStructuralLocked() || !rack || slotIndex + direction < 0 || slotIndex + direction >= M.MAX_SLOTS; order.append(b);
    }
    const clear = button('Svuota slot', () => editRack(r => { r.slots[slotIndex] = { pluginId: null, bypass: false }; }, { id }), 'vst-danger'); clear.disabled = isStructuralLocked() || !rack?.slots?.[slotIndex]?.pluginId; order.append(clear); chain.append(order);
    catalog.append(el('h3', '', `Scegli per lo slot ${String.fromCharCode(65 + slotIndex)}`));
    const search = el('input', 'vst-search'); search.type = 'search'; search.placeholder = 'Cerca plugin o produttore'; search.value = pluginQuery; search.setAttribute('aria-label', 'Cerca VST3');
    const list = el('div', 'vst-plugin-list');
    const populate = () => {
      list.replaceChildren();
      const query = pluginQuery.toLocaleLowerCase('it-IT'), plugins = state.plugins.filter(p => !p.isInstrument && (p.inputChannels === undefined || p.inputChannels > 0) && (p.outputChannels === undefined || p.outputChannels > 0) && `${p.name || ''} ${p.manufacturer || ''}`.toLocaleLowerCase('it-IT').includes(query));
      if (!plugins.length) list.append(note(state.plugins.length ? 'Nessun plugin corrispondente.' : 'Esegui la scansione dei VST3 installati sul Mac.'));
      for (const plugin of plugins) {
        const b = button('', () => editRack(r => {
          while (r.slots.length <= slotIndex) r.slots.push({ pluginId: null, bypass: false });
          r.slots[slotIndex] = { pluginId: plugin.id, bypass: false };
        }, { id }), 'vst-plugin-item'); b.append(el('strong', '', plugin.name), el('small', '', plugin.manufacturer || 'VST3')); b.disabled = isStructuralLocked() || !rack; list.append(b);
      }
    };
    search.addEventListener('input', () => { pluginQuery = search.value; populate(); }); populate();
    catalog.append(search, list); const scan = button(state.scanning ? 'Scansione VST3 in corso…' : 'Scansiona VST3', () => action(async () => { scanMessage = 'Scansione…'; await request('scanPlugins'); }, { structure: true, save: false, refresh: false }), 'vst-scan'); scan.disabled = isStructuralLocked(); catalog.append(scan);
    layout.append(chain, catalog); container.append(layout); renderRouting(container, rack);
    if (state.running) container.append(note('Audio attivo: apri i plugin o usa BYP. Ferma l’audio per cambiare catena o routing.'));
    container.append(note(rack?.placement === 'pre' ? 'BYP mantiene il percorso attraverso il Mac. «Ripristina ingresso diretto» riporta il canale alla sorgente originale.' : 'BYP mantiene il percorso attraverso il Mac. Per escluderlo ripristina il percorso WING o disattiva l’insert sul banco.'));
  }
  function render() {
    refreshChannelViews();
    if (!modal?.open) { updateStatus(); return; }
    const body = modal.querySelector('.vst-body'), scroll = body.scrollTop;
    const title = modal.querySelector('#vst-panel-title'); title.textContent = panel === 'audio' ? 'Audio USB e rack VST3' : 'Rack VST3';
    const nav = modal.querySelector('.vst-tabs'); nav.replaceChildren();
    for (const [id, label] of [['audio', 'Audio USB'], ['rack', 'Rack canale']]) {
      const b = button(label, () => { panel = id; routingDraft = null; render(); }); b.setAttribute('aria-pressed', String(panel === id)); nav.append(b);
    }
    if (panel === 'rack') {
      const channels = C.listStrips();
      nav.append(select('Canale', rackId, channels.map(s => ({ value: s.id, label: `${s.kind} ${s.number} · ${s.name}` })), id => { rackId = id; routingDraft = null; selectedSlot = 0; C.selectStrip(id); render(); }, busy));
    }
    body.replaceChildren(); if (panel === 'audio') renderAudio(body); else renderRack(body); body.scrollTop = scroll;
    const foot = modal.querySelector('.vst-footer'); foot.replaceChildren();
    const start = button(state.running ? 'Ferma audio USB' : 'Avvia audio USB', toggleAudio, state.running ? 'vst-stop' : 'vst-primary'); start.disabled = busy || state.scanning || !connected || !available();
    const save = button('Salva rack', () => action(async () => {}, { save: true })); save.disabled = busy || state.scanning || !connected;
    foot.append(note(busy || state.scanning ? state.scanning && scanMessage || 'Operazione in corso…' : 'Controllo WING: Ethernet · Audio VST3: USB'), save, start);
    updateStatus(); renderAlert();
  }
  async function show(nextPanel, id = rackId, slot = 0) {
    if (M.validId(id)) rackId = id;
    panel = nextPanel; selectedSlot = Math.max(0, Math.min(7, slot)); routingDraft = null;
    makeDialog(); if (!modal.open) { priorFocus = document.activeElement; modal.showModal(); }
    render();
    if (!available() || busy) return;
    busy = true; render();
    try { await ensure(); if (!deviceList.length) await refreshDevices(); }
    catch (error) { message(error); }
    finally { busy = false; render(); }
  }
  async function openSlot(id, slot = 0) {
    if (!M.validId(id) || !Number.isInteger(slot) || slot < 0 || slot >= M.MAX_SLOTS) return;
    rackId = id; selectedSlot = slot;
    if (!getRack(id)?.slots?.[slot]?.pluginId || getRack(id)?.slots?.[slot]?.missing || !available()) return show('rack', id, slot);
    if (busy) return;
    try { await ensure(); await request('openEditor', { rackId: id, slot }); }
    catch (error) { await show('rack', id, slot); message(error); }
  }
  function openRack(id = C.getState().selected) { return show('rack', M.validId(id) ? id : 'ch-1'); }
  function openAudio() { return show('audio'); }
  window.SculptVst = Object.freeze({ getRack, openSlot, openRack, openAudio, renderChannel, setPlacement, routingStatus, snapshot: () => ({ ...state, connected, error: fault }), available });
  window.addEventListener('sculpt-vst-route-state', event => { if (event.detail?.state !== 'prepared') routePlans.delete(event.detail?.rackId); render(); });
  window.addEventListener('sculpt-live-state', () => {
    const key = liveControlKey();
    if (key === lastLiveControlKey) return;
    lastLiveControlKey = key; routePlans.clear(); refreshChannelViews();
    if (modal?.open && !busy) render();
  });
  const toolbar = button('USB · fermo', openAudio, 'vst-audio-button'); toolbar.id = 'vst-audio-button';
  toolbar.setAttribute('aria-label', 'Apri audio USB e rack VST3'); document.querySelector('.macro-rail')?.insertBefore(toolbar, document.getElementById('info-button'));
  if (window.SculptDesktop?.addListener) {
    window.SculptDesktop.addListener('audioState', accept).catch(message);
    window.SculptDesktop.addListener('audioError', error => { if (error?.fatal !== false) { connected = false; state.running = false; state.scanning = false; initialized = false; } message(error?.message || error?.error || error); emit(); if (modal?.open) render(); }).catch(message);
    window.SculptDesktop.addListener('audioScanProgress', data => { scanMessage = data?.message || (data?.name ? `Scansione · ${data.name}` : 'Scansione VST3…'); const footer = modal?.querySelector('.vst-footer .vst-note'); if ((busy || state.scanning) && footer) footer.textContent = scanMessage; }).catch(message);
  }
  C.subscribe(event => { if (event.type === 'selection' && modal?.open && panel === 'rack' && !busy && M.validId(event.id) && event.id !== rackId) { rackId = event.id; routingDraft = null; render(); } });
  updateStatus();
})();
