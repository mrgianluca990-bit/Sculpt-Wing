(() => {
  'use strict';
  const M = window.SculptVstModel, C = window.SculptController;
  if (!M || !C) return;
  const KEY = 'sculpt-wing-vst-rack-labels-v1';
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* Labels are optional. Plugin states are stored by the desktop host. */ }
  let state = { running: false, scanning: false, audio: {}, plugins: [], racks: M.metadata(saved).racks, cpu: 0, xruns: 0 };
  let connected = false, initialized = false, initialization = null, busy = false, fault = '', scanMessage = '';
  let modal = null, panel = 'rack', rackId = 'ch-1', selectedSlot = 0, pluginQuery = '', catalogOpen = false;
  let deviceList = [], audioDraft = null, routingDraft = null, priorFocus = null;
  const channelViews = new Set(), routePlans = new Map();
  const routingExpanded = new Set(), editorPending = new Map();
  let draggedSlot = null;
  const routeFingerprint = rack => JSON.stringify(rack ? [rack.placement ?? null, rack.inputChannels, rack.outputChannels] : null);
  const liveControlKey = () => JSON.stringify([!!window.SculptLive?.isConnected?.(), !!window.SculptLive?.isWritable?.(), window.SculptLive?.sessionToken?.() ?? null]);
  let lastLiveControlKey = liveControlKey();
  const available = () => window.SculptDesktop?.platform === 'macos' && typeof window.SculptDesktop?.audioRequest === 'function';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const button = (text, action, cls = '') => { const n = el('button', `vst-button ${cls}`, text); n.type = 'button'; if (action) n.addEventListener('click', action); return n; };
  const note = text => el('p', 'vst-note', text);
  const stripName = id => { const s = C.getStrip(id); return s ? `${s.kind} ${s.number} · ${s.name}` : id.toUpperCase(); };
  const getRack = id => state.racks.find(r => r.id === id) || null;
  const getCount = (kind, fallback = 48) => {
    const value = state.audio?.[kind], count = Array.isArray(value) ? value.length : Number(value) || 0;
    // The native host permits preparing racks before a device is configured.
    // Its channel counts are zero until that explicit configuration occurs.
    return count > 0 ? count : state.audio?.configured ? 0 : fallback;
  };
  const isStructuralLocked = () => busy || state.running || state.analysis?.running || state.scanning || !connected;
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
      const controlsChanged = ('running' in data && data.running !== state.running) || ('scanning' in data && data.scanning !== state.scanning) || ('analysis' in data && data.analysis?.running !== state.analysis?.running);
      for (const key of ['running', 'scanning', 'audio', 'analysis', 'cpu', 'xruns', 'rackMeters']) if (key in data) state[key] = data[key];
      updateStatus();
      if (controlsChanged) { emit(); if (modal?.open && !busy) render(); }
      return;
    }
    const oldRunning = state.running, oldScanning = state.scanning, oldAnalysisRunning = state.analysis?.running;
    if (Array.isArray(data.racks)) for (const id of routePlans.keys()) {
      if (routeFingerprint(getRack(id)) !== routeFingerprint(data.racks.find(rack => rack.id === id))) routePlans.delete(id);
    }
    state = { ...state, ...data, racks: Array.isArray(data.racks) ? data.racks : state.racks, plugins: Array.isArray(data.plugins) ? data.plugins : state.plugins };
    connected = true;
    try { localStorage.setItem(KEY, JSON.stringify(M.metadata(state))); } catch { /* Plugin presets remain in the desktop session file. */ }
    emit(); updateStatus();
    if (modal?.open && !busy && (oldRunning !== state.running || oldScanning !== state.scanning || oldAnalysisRunning !== state.analysis?.running || panel === 'rack')) render();
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
    if (structure && (state.running || state.analysis?.running)) { message('Ferma audio e misura prima di modificare plugin o collegamenti.'); return false; }
    if (state.scanning) { message('Attendi il completamento della scansione VST3.'); return false; }
    busy = true; fault = ''; render();
    try {
      await ensure();
      if (structure && (state.running || state.analysis?.running)) throw new Error('Ferma audio e misura prima di modificare plugin o collegamenti.');
      if (state.scanning) throw new Error('Attendi il completamento della scansione VST3.');
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
  async function choosePlugin(id, index, plugin) {
    const ok = await action(async () => {
      accept(await request('getState'));
      const current = getRack(id);
      const next = current ? JSON.parse(JSON.stringify(current)) : {
        id, enabled: false, placement: /^(ch|aux)-/.test(id) ? 'pre' : 'insert1', slots: [],
        ...M.freeRouting(state.racks, 1, getCount('inputChannels'), getCount('outputChannels'))
      };
      while (next.slots.length <= index) next.slots.push({ pluginId: null, bypass: false });
      next.slots[index] = { pluginId: plugin.id, name: plugin.name, bypass: false };
      M.validateRouting(next, state.racks, getCount('inputChannels'), getCount('outputChannels'));
      await request('setRack', next);
      if (!current && rackId === id) routingDraft = null;
    }, { structure: true });
    if (ok) {
      if (rackId === id && selectedSlot === index) catalogOpen = false;
      render();
      await openSlot(id, index);
    }
    return ok;
  }
  async function moveSlot(id, from, to) {
    if (from === to || from < 0 || to < 0 || from >= M.MAX_SLOTS || to >= M.MAX_SLOTS) return false;
    return editRack(rack => {
      while (rack.slots.length < M.MAX_SLOTS) rack.slots.push({ pluginId: null, bypass: false });
      const moved = rack.slots.splice(from, 1)[0]; rack.slots.splice(to, 0, moved);
      if (rackId === id) selectedSlot = to;
    }, { id });
  }
  function selectSlot(id, index) {
    rackId = id; selectedSlot = index;
    for (const row of document.querySelectorAll('.vst-slot[data-rack-id]')) {
      row.classList.toggle('is-selected', row.dataset.rackId === id && Number(row.dataset.slot) === index);
    }
    const title = modal?.querySelector('.vst-catalog-title');
    if (title) title.textContent = `Plugin · slot ${String.fromCharCode(65 + index)}`;
    for (const control of modal?.querySelectorAll('[data-slot-step]') || []) {
      const next = index + Number(control.dataset.slotStep);
      control.disabled = isStructuralLocked() || !getRack(id)?.slots?.[index]?.pluginId || next < 0 || next >= M.MAX_SLOTS;
    }
    const clear = modal?.querySelector('[data-clear-slot]');
    if (clear) clear.disabled = isStructuralLocked() || !getRack(id)?.slots?.[index]?.pluginId;
  }
  function showBrowser(id, index) { return show('rack', id, index, { choose: true }); }
  function renderSlot(id, index, embedded = false) {
    const slot = getRack(id)?.slots?.[index], occupied = !!slot?.pluginId;
    const row = el('div', `vst-slot${embedded ? ' vst-channel-slot' : ''}${id === rackId && index === selectedSlot ? ' is-selected' : ''}${slot?.missing ? ' is-missing' : ''}${slot?.bypass ? ' is-bypassed' : ''}`);
    row.dataset.rackId = id; row.dataset.slot = String(index);
    const drag = button('⋮⋮', null, 'vst-slot-drag'); drag.title = 'Trascina per riordinare';
    drag.setAttribute('aria-label', `Riordina slot VST3 ${index + 1}`); drag.disabled = isStructuralLocked() || !occupied;
    drag.draggable = !drag.disabled;
    drag.addEventListener('dragstart', event => {
      if (isStructuralLocked() || !occupied) { event.preventDefault(); return; }
      draggedSlot = { id, index }; row.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', `${id}:${index}`);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    drag.addEventListener('dragend', () => { draggedSlot = null; row.classList.remove('is-dragging'); document.querySelectorAll('.vst-slot.is-drop-target').forEach(n => n.classList.remove('is-drop-target')); });
    row.addEventListener('dragover', event => { if (draggedSlot?.id === id && draggedSlot.index !== index && !isStructuralLocked()) { event.preventDefault(); row.classList.add('is-drop-target'); } });
    row.addEventListener('dragleave', event => { if (!row.contains(event.relatedTarget)) row.classList.remove('is-drop-target'); });
    row.addEventListener('drop', event => {
      row.classList.remove('is-drop-target');
      if (draggedSlot?.id !== id || isStructuralLocked()) return;
      event.preventDefault(); const from = draggedSlot.index; draggedSlot = null; moveSlot(id, from, index);
    });
    const name = button('', () => { selectSlot(id, index); if (!occupied || slot.missing) showBrowser(id, index); }, `vst-slot-name${embedded ? ' vst-channel-plugin' : ''}`);
    name.append(el('small', '', String.fromCharCode(65 + index)), el('span', '', slot?.name || (occupied ? 'Plugin VST3' : '+ Aggiungi plugin')));
    name.setAttribute('aria-label', `${occupied ? 'Slot' : 'Scegli'} VST3 ${index + 1} · ${stripName(id)}`);
    name.title = slot?.missing ? 'Plugin non disponibile: scegli un sostituto o aggiorna la scansione' : occupied ? `${slot.name || 'VST3'} · doppio clic per aprire` : 'Scegli un plugin';
    name.disabled = busy;
    name.addEventListener('dblclick', () => { if (occupied && !slot.missing) openSlot(id, index); });
    name.addEventListener('keydown', event => {
      if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key) && !isStructuralLocked()) { event.preventDefault(); moveSlot(id, index, index + (event.key === 'ArrowUp' ? -1 : 1)); }
      else if (event.key === 'Enter' && occupied && !slot.missing) { event.preventDefault(); openSlot(id, index); }
    });
    row.append(drag, name);
    if (occupied) {
      const open = button('Apri', () => openSlot(id, index), 'vst-slot-open'); open.disabled = busy || state.scanning || !!slot.missing || !available();
      open.setAttribute('aria-label', `Apri VST3 ${index + 1} · ${stripName(id)}`);
      const bypass = button('BYP', () => editRack(next => { if (next.slots[index]?.pluginId) next.slots[index].bypass = !next.slots[index].bypass; }, { id, structure: false }), 'vst-slot-bypass');
      bypass.setAttribute('aria-label', `Bypass VST3 ${index + 1} · ${stripName(id)}`); bypass.setAttribute('aria-pressed', String(!!slot.bypass));
      bypass.disabled = busy || state.scanning || !connected || slot.missing;
      const choose = button('▾', () => showBrowser(id, index), 'vst-slot-choose'); choose.title = 'Sostituisci plugin'; choose.setAttribute('aria-label', `Sostituisci VST3 ${index + 1}`); choose.disabled = isStructuralLocked();
      const clear = button('×', () => editRack(next => { next.slots[index] = { pluginId: null, bypass: false }; }, { id }), 'vst-slot-remove'); clear.title = 'Rimuovi plugin'; clear.setAttribute('aria-label', `Rimuovi VST3 ${index + 1}`); clear.disabled = isStructuralLocked();
      row.append(open, bypass, choose, clear);
    }
    return row;
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
        if (!state.audio?.inputDevice || !state.audio?.outputDevice) throw new Error('Scegli prima ingresso e uscita in Audio.');
        if (!state.racks.length) throw new Error('Crea almeno un rack con ingressi e uscite assegnati.');
        await request('startAudio');
      }
    });
  }
  async function refreshDevices() {
    const result = await request('devices');
    deviceList = Array.isArray(result) ? result : result?.devices || [];
    if (!audioDraft) audioDraft = {
      inputDevice: state.audio?.inputDevice || deviceList.find(d => /wing/i.test(d.name) && deviceChannelCount(d, 'inputChannels'))?.name || '',
      outputDevice: state.audio?.outputDevice || deviceList.find(d => /wing/i.test(d.name) && deviceChannelCount(d, 'outputChannels'))?.name || '',
      sampleRate: state.audio?.sampleRate || 48000,
      bufferSize: state.audio?.bufferSize || 128
    };
  }
  const deviceChannelCount = (device, key) => Array.isArray(device?.[key]) ? device[key].length : Math.max(0, Number(device?.[key]) || 0);
  function audioCapabilities(draft) {
    const devices = [...new Set([draft.inputDevice, draft.outputDevice])].map(name => deviceList.find(d => d.name === name)).filter(Boolean);
    const common = (key, fallback) => {
      const lists = devices.map(d => d[key]).filter(values => Array.isArray(values) && values.length).map(values => values.map(Number).filter(n => n > 0));
      return lists.length ? [...new Set(lists[0])].filter(value => lists.every(values => values.includes(value))).sort((a, b) => a - b) : fallback;
    };
    return { rates: common('sampleRates', [44100, 48000]), sizes: common('bufferSizes', [32, 64, 128, 256, 512, 1024]) };
  }
  function routingSummary(id, rack = getRack(id)) {
    const io = rack ? `${rack.inputChannels?.length === 2 ? 'Stereo' : 'Mono'} · In ${M.channelLabel(rack.inputChannels)} → Out ${M.channelLabel(rack.outputChannels)}` : 'I/O da assegnare al primo plugin';
    const route = routingStatus(id);
    return `${io} · WING ${route.state === 'applied' ? 'collegata' : route.managed ? 'da verificare' : 'non applicato'}`;
  }
  function routingDetails(id, cls = '') {
    const details = el('details', `vst-routing-details ${cls}`);
    details.open = routingExpanded.has(id);
    const summary = el('summary'); summary.append(el('strong', '', 'I/O e percorso WING'), el('span', '', routingSummary(id)));
    details.append(summary);
    details.addEventListener('toggle', () => { if (!details.isConnected) return; if (details.open) routingExpanded.add(id); else routingExpanded.delete(id); });
    return details;
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
      const signature = JSON.stringify([busy, connected, state.running, state.scanning, state.analysis?.running, fault, liveControlKey(), M.metadata({ racks: rack ? [rack] : [] }), route.state, route.message, route.managed, route.canRestore, plan?.summary]);
      if (view.signature === signature) continue;
      view.signature = signature;
      const { container, id } = view, scrollTop = container.scrollTop, scrollLeft = container.scrollLeft;
      container.replaceChildren(); container.classList.add('vst-channel-panel');
      const heading = el('div', 'vst-channel-heading');
      heading.append(el('strong', '', stripName(id)), placementControl(id));
      const setup = button('Audio', openAudio); setup.title = 'Dispositivi, frequenza e buffer'; heading.append(setup);
      if (rack) {
        const bypass = button(rack.enabled ? 'Rack attivo' : 'Rack in bypass', () => editRack(next => { next.enabled = !next.enabled; }, { id, structure: false }), 'vst-bypass');
        bypass.setAttribute('aria-pressed', String(!rack.enabled)); bypass.disabled = busy || state.scanning || !connected; heading.append(bypass);
      }
      const audio = button(state.running ? 'Ferma audio' : 'Avvia audio', toggleAudio, state.running ? 'vst-stop' : 'vst-primary');
      audio.disabled = busy || state.scanning || !connected || !available(); heading.append(audio); container.append(heading);
      if (fault) { const alert = el('div', 'vst-channel-alert', fault); alert.setAttribute('role', 'alert'); container.append(alert); }
      const layout = el('div', 'vst-channel-layout'), chain = el('section', 'vst-channel-chain');
      for (let index = 0; index < M.MAX_SLOTS; index++) chain.append(renderSlot(id, index, true));
      const links = el('div', 'vst-channel-links');
      links.append(note('Doppio clic per aprire · trascina ⋮⋮ per riordinare'), button('Apri rack', () => openRack(id)));
      if (!available()) links.append(note('L’elaborazione VST3 e gli editor originali sono disponibili nell’app Mac.'));
      const routing = routingDetails(id, 'vst-channel-routing');
      const settings = el('div', 'vst-channel-routing-content');
      settings.append(button('Modifica I/O', () => show('rack', id, 0, { route: true })));
      renderWingRoute(settings, id); routing.append(settings);
      layout.append(chain, links, routing); container.append(layout);
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
    modal.innerHTML = '<header class="vst-header"><div><p class="vst-eyebrow">SCULPT WING</p><h2 id="vst-panel-title">Rack VST3</h2></div><div class="vst-header-actions"></div></header><nav class="vst-tabs" aria-label="Rack VST3"></nav><div class="vst-statusbar" role="status"></div><div class="vst-alert" role="alert" hidden></div><div class="vst-body"></div><footer class="vst-footer"></footer>';
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
    const status = !available() ? 'VST3 · app Mac' : fault && !connected ? 'Audio · errore' : state.running ? 'Audio · attivo' : 'Audio · fermo';
    const toolbar = document.getElementById('vst-audio-button'); if (toolbar) { toolbar.textContent = status; toolbar.classList.toggle('is-running', !!state.running); toolbar.classList.toggle('has-error', !!fault); toolbar.title = 'Audio del Mac e rack VST3'; }
    if (!modal) return;
    const cpuValue = Number(state.cpu) || 0;
    const cpu = cpuValue <= 1 ? cpuValue * 100 : cpuValue;
    const deviceName = state.audio?.inputDevice === state.audio?.outputDevice ? state.audio?.outputDevice : [state.audio?.inputDevice, state.audio?.outputDevice].filter(Boolean).join(' → ');
    const parts = [status, deviceName || 'Dispositivo da scegliere', state.audio?.sampleRate ? `${(state.audio.sampleRate / 1000).toLocaleString('it-IT')} kHz` : '', state.audio?.bufferSize ? `${state.audio.bufferSize} campioni` : '', connected ? `CPU ${cpu.toFixed(1)}%` : '', connected && state.xruns ? `Dropout ${Number(state.xruns) || 0}` : ''];
    const bar = modal.querySelector('.vst-statusbar'); bar.textContent = parts.filter(Boolean).join('  ·  '); bar.title = bar.textContent; bar.classList.toggle('is-running', !!state.running);
    const measured = modal.querySelector('[data-vst-latency]');
    if (measured) {
      const samples = Number(state.audio?.latencySamples);
      measured.textContent = Number.isFinite(samples) && state.audio.sampleRate > 0 ? `${(samples * 1000 / state.audio.sampleRate).toFixed(2)} ms dichiarati dal dispositivo · escluso ritardo dei plugin` : 'Latenza del dispositivo disponibile dopo la configurazione';
    }
    const rackLatency = modal.querySelector('[data-vst-rack-latency]');
    if (rackLatency) { const rack = getRack(rackId), samples = state.rackMeters?.find(r => r.id === rackId)?.latencySamples ?? rack?.latencySamples; rackLatency.textContent = `Plugin: ${Number(samples) || 0} campioni${state.audio?.sampleRate ? ` · ${((Number(samples) || 0) * 1000 / state.audio.sampleRate).toFixed(2)} ms` : ''}`; }
  }
  function renderAudio(container) {
    if (!available()) { container.append(el('div', 'vst-empty', 'Apri Sculpt Wing sul Mac per scegliere i dispositivi audio e caricare i tuoi VST3.')); return; }
    container.append(note('Scegli i dispositivi del Mac, oppure la WING collegata via USB. Il rack funziona anche senza mixer.'));
    const draft = audioDraft || { inputDevice: state.audio?.inputDevice || '', outputDevice: state.audio?.outputDevice || '', sampleRate: state.audio?.sampleRate || 48000, bufferSize: state.audio?.bufferSize || 128 };
    if (connected) audioDraft = draft;
    const controls = el('div', 'vst-audio-grid');
    for (const [key, channelKey, label, suffix] of [['inputDevice', 'inputChannels', 'Dispositivo ingresso', 'in'], ['outputDevice', 'outputChannels', 'Dispositivo uscita', 'out']]) {
      const options = [{ value: '', label: 'Seleziona dispositivo…' }, ...deviceList.filter(d => deviceChannelCount(d, channelKey) > 0).map(d => ({ value: d.name, label: `${d.name} · ${deviceChannelCount(d, channelKey)} ${suffix}` }))];
      if (draft[key] && !options.some(option => option.value === draft[key])) options.push({ value: draft[key], label: `${draft[key]} · non disponibile`, disabled: true });
      controls.append(select(label, draft[key], options, value => {
        draft[key] = value;
        const { rates, sizes } = audioCapabilities(draft);
        if (rates.length && !rates.includes(draft.sampleRate)) draft.sampleRate = rates.includes(48000) ? 48000 : rates[0];
        if (sizes.length && !sizes.includes(draft.bufferSize)) draft.bufferSize = sizes.includes(128) ? 128 : sizes[0];
        render();
      }, isStructuralLocked() || hasManagedRoute()));
    }
    const { rates, sizes } = audioCapabilities(draft), compatible = rates.length > 0 && sizes.length > 0;
    controls.append(select('Frequenza', draft.sampleRate, rates.map(v => ({ value: v, label: `${v / 1000} kHz` })), v => { draft.sampleRate = Number(v); }, isStructuralLocked()), select('Buffer', draft.bufferSize, sizes.map(v => ({ value: v, label: `${v} campioni` })), v => { draft.bufferSize = Number(v); }, isStructuralLocked()));
    const apply = button('Applica dispositivo', () => action(async () => {
      if (!draft.inputDevice || !draft.outputDevice) throw new Error('Seleziona un dispositivo di ingresso e uno di uscita.');
      if ((draft.inputDevice !== state.audio?.inputDevice || draft.outputDevice !== state.audio?.outputDevice) && hasManagedRoute()) throw new Error('Ripristina prima i percorsi WING dei rack, poi cambia dispositivo audio.');
      if (!compatible || !rates.includes(draft.sampleRate) || !sizes.includes(draft.bufferSize)) throw new Error('Scegli frequenza e buffer supportati da entrambi i dispositivi.');
      await request('configureAudio', { ...draft });
      routePlans.clear();
      audioDraft = null;
    }, { structure: true }), 'vst-primary'); apply.disabled = isStructuralLocked() || !compatible || !draft.inputDevice || !draft.outputDevice;
    const reload = button(connected ? 'Aggiorna dispositivi' : 'Riconnetti motore', async () => {
      if (busy || state.running || state.analysis?.running || state.scanning) return;
      busy = true; fault = ''; render();
      try {
        // devices is an explicit user action and may restart a failed helper.
        await refreshDevices(); connected = true;
        if (!initialized) { const restored = await request('loadSession'); if (restored?.state) accept(restored.state); initialized = true; }
        accept(await request('getState'));
      } catch (error) { message(error); } finally { busy = false; render(); }
    }); reload.disabled = busy || state.running || state.analysis?.running || state.scanning;
    controls.append(apply, reload); container.append(controls);
    if (!compatible) container.append(note('I dispositivi selezionati non hanno frequenza e buffer in comune. Scegli un altro ingresso o un’altra uscita.'));
    if (hasManagedRoute()) container.append(note('Ripristina i percorsi WING dei rack prima di cambiare dispositivo. Buffer e frequenza restano modificabili con audio fermo.'));
    const latency = note(''); latency.dataset.vstLatency = ''; container.append(latency);
    const racks = el('section', 'vst-rack-overview'); racks.append(el('h3', '', `Rack assegnati · ${state.racks.length}/${M.MAX_RACKS}`));
    if (!state.racks.length) racks.append(note('Scegli uno slot vuoto in Rack canale per aggiungere il primo plugin.'));
    for (const rack of state.racks) {
      const row = button('', () => openRack(rack.id), 'vst-overview-row');
      row.append(el('strong', '', stripName(rack.id)), el('span', '', `${M.placementLabel(rack.placement)} · In ${M.channelLabel(rack.inputChannels)} → Out ${M.channelLabel(rack.outputChannels)}`), el('small', '', `${rack.slots?.filter(s => s?.pluginId).length || 0} VST3${rack.enabled ? '' : ' · bypass'}`)); racks.append(row);
    }
    container.append(racks);
  }
  function renderRouting(container, rack) {
    const id = rackId;
    const section = el('section', 'vst-routing'); section.append(el('h3', '', 'Ingressi e uscite del rack sul Mac'));
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
    grid.append(select('Formato rack', draft.width, [{ value: 1, label: 'Mono' }, { value: 2, label: 'Stereo', disabled: Math.min(getCount('inputChannels'), getCount('outputChannels')) < 2 }], v => {
      const width = Number(v); draft.width = width;
      for (const key of ['inputChannels', 'outputChannels']) {
        const first = width === 2 && draft[key][0] + 1 >= getCount(key) ? 0 : draft[key][0];
        draft[key] = width === 1 ? [first] : [first, first + 1];
      }
      render();
    }, isStructuralLocked()));
    for (const [key, label, countKey] of [['inputChannels', 'Ingresso', 'inputChannels'], ['outputChannels', 'Uscita', 'outputChannels']]) {
      for (let ch = 0; ch < draft.width; ch++) grid.append(select(`${label}${draft.width === 2 ? ` ${ch ? 'R' : 'L'}` : ''}`, draft[key][ch], Array.from({ length: Math.min(48, getCount(countKey)) }, (_, i) => ({ value: i, label: `${label} ${i + 1}` })), v => { draft[key][ch] = Number(v); }, isStructuralLocked()));
    }
    const apply = button(rack ? 'Applica collegamenti' : 'Crea rack', () => action(async () => {
      accept(await request('getState'));
      const current = getRack(id);
      const next = { ...(current || { id, enabled: false, slots: [] }), placement: draft.placement ?? null, inputChannels: [...draft.inputChannels], outputChannels: [...draft.outputChannels] };
      if (!current || JSON.stringify([current.placement ?? null, current.inputChannels, current.outputChannels]) !== JSON.stringify([next.placement, next.inputChannels, next.outputChannels])) requireReleasedRoute(id);
      M.validateRouting(next, state.racks, getCount('inputChannels'), getCount('outputChannels'));
      await request('setRack', next); routePlans.delete(id); if (rackId === id) routingDraft = null;
    }, { structure: true }), 'vst-primary'); apply.disabled = isStructuralLocked(); grid.append(apply); section.append(grid);
    section.append(note('Ingressi e uscite appartengono al dispositivo scelto in Audio. Il collegamento alla WING si applica separatamente qui sotto.'));
    if (rack) {
      const remove = button('Rimuovi rack', () => action(async () => { requireReleasedRoute(id); await request('removeRack', { id }); routePlans.delete(id); if (rackId === id) routingDraft = null; }, { structure: true }), 'vst-danger'); remove.disabled = isStructuralLocked(); section.append(remove);
    }
    container.append(section);
    renderWingRoute(container, id);
  }
  function renderRack(container) {
    const id = rackId, rack = getRack(id), summary = el('div', 'vst-rack-summary');
    summary.append(placementControl(id, rack ? rack.placement : /^(ch|aux)-/.test(id) ? 'pre' : 'insert1'));
    if (rack) {
      const bypass = button(rack.enabled ? 'Rack attivo' : 'Rack in bypass', () => editRack(r => { r.enabled = !r.enabled; }, { id, structure: false }), 'vst-bypass');
      bypass.setAttribute('aria-pressed', String(!rack.enabled)); bypass.disabled = busy || state.scanning || !connected;
      summary.append(bypass);
    }
    const lat = el('span', 'vst-latency'); lat.dataset.vstRackLatency = ''; summary.append(lat); container.append(summary);
    if (!available()) container.append(note('Carica i VST3 e apri gli editor originali nell’app Mac.'));
    const layout = el('div', `vst-rack-layout${catalogOpen ? ' has-catalog' : ''}`), chain = el('section', 'vst-chain');
    const chainHeading = el('div', 'vst-chain-heading');
    chainHeading.append(el('h3', '', 'Insert VST3'), el('span', '', `${rack?.slots?.filter(slot => slot?.pluginId).length || 0} / ${M.MAX_SLOTS}`));
    chain.append(chainHeading);
    for (let i = 0; i < M.MAX_SLOTS; i++) chain.append(renderSlot(id, i));
    const order = el('div', 'vst-chain-actions');
    for (const [direction, label] of [[-1, 'Sposta su'], [1, 'Sposta giù']]) {
      const b = button(label, () => { const target = selectedSlot; moveSlot(id, target, target + direction); });
      b.dataset.slotStep = String(direction); b.disabled = isStructuralLocked() || !rack?.slots?.[selectedSlot]?.pluginId || selectedSlot + direction < 0 || selectedSlot + direction >= M.MAX_SLOTS; order.append(b);
    }
    const clear = button('Svuota slot', () => { const target = selectedSlot; editRack(r => { r.slots[target] = { pluginId: null, bypass: false }; }, { id }); }, 'vst-danger');
    clear.dataset.clearSlot = ''; clear.disabled = isStructuralLocked() || !rack?.slots?.[selectedSlot]?.pluginId; order.append(clear); chain.append(order);
    layout.append(chain, renderCatalog()); container.append(layout);
    container.append(note(state.running || state.analysis?.running ? 'Audio o misura attivi: editor e bypass disponibili. Ferma l’audio e la misura per cambiare la catena.' : 'Slot vuoto: scegli un plugin · doppio clic: apri editor · trascina ⋮⋮: riordina'));
    const details = routingDetails(id); renderRouting(details, rack); container.append(details);
  }
  function renderCatalog() {
    const catalog = el('section', 'vst-catalog'); catalog.hidden = !catalogOpen;
    const heading = el('div', 'vst-catalog-heading');
    heading.append(el('h3', 'vst-catalog-title', `Plugin · slot ${String.fromCharCode(65 + selectedSlot)}`));
    const close = button('×', () => { catalogOpen = false; render(); }, 'vst-catalog-close'); close.setAttribute('aria-label', 'Chiudi browser plugin'); heading.append(close);
    const search = el('input', 'vst-search'); search.type = 'search'; search.placeholder = 'Cerca plugin o produttore'; search.value = pluginQuery; search.setAttribute('aria-label', 'Cerca VST3');
    const list = el('div', 'vst-plugin-list');
    const populate = () => {
      const scroll = list.scrollTop; list.replaceChildren();
      const query = pluginQuery.toLocaleLowerCase('it-IT');
      const plugins = state.plugins.filter(p => !p.isInstrument && (p.inputChannels === undefined || p.inputChannels > 0) && (p.outputChannels === undefined || p.outputChannels > 0) && `${p.name || ''} ${p.manufacturer || ''}`.toLocaleLowerCase('it-IT').includes(query)).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it-IT'));
      if (!plugins.length) list.append(note(state.plugins.length ? 'Nessun plugin corrispondente.' : 'Scansiona i VST3 installati sul Mac.'));
      for (const plugin of plugins) {
        const b = button('', () => { const targetId = rackId, targetSlot = selectedSlot; choosePlugin(targetId, targetSlot, plugin); }, 'vst-plugin-item');
        b.append(el('strong', '', plugin.name), el('small', '', plugin.manufacturer || 'VST3')); b.disabled = isStructuralLocked(); list.append(b);
      }
      list.scrollTop = scroll;
    };
    search.addEventListener('input', () => { pluginQuery = search.value; populate(); }); populate();
    search.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); list.querySelector('button:not(:disabled)')?.click(); } });
    const scan = button(state.scanning ? 'Scansione VST3 in corso…' : 'Scansiona VST3', () => action(async () => { scanMessage = 'Scansione…'; await request('scanPlugins'); }, { structure: true, save: false, refresh: false }), 'vst-scan'); scan.disabled = isStructuralLocked();
    catalog.append(heading, search, list, scan); return catalog;
  }
  function render() {
    refreshChannelViews();
    if (!modal?.open) { updateStatus(); return; }
    const body = modal.querySelector('.vst-body'), scroll = body.scrollTop;
    const active = modal.contains(document.activeElement) ? document.activeElement : null;
    const focusLabel = active?.getAttribute('aria-label'), focusStart = active?.selectionStart, focusEnd = active?.selectionEnd;
    modal.dataset.panel = panel; modal.classList.toggle('has-catalog', panel === 'rack' && catalogOpen);
    const title = modal.querySelector('#vst-panel-title'); title.textContent = panel === 'audio' ? 'Audio del Mac' : 'Rack VST3';
    const nav = modal.querySelector('.vst-tabs'); nav.replaceChildren();
    for (const [id, label] of [['rack', 'Rack canale'], ['audio', 'Audio']]) {
      const b = button(label, () => show(id, rackId, selectedSlot)); b.setAttribute('aria-pressed', String(panel === id)); nav.append(b);
    }
    if (panel === 'rack') {
      const channels = C.listStrips().filter(strip => M.validId(strip.id));
      nav.append(select('Canale', rackId, channels.map(s => ({ value: s.id, label: `${s.kind} ${s.number} · ${s.name}` })), id => { rackId = id; routingDraft = null; selectedSlot = 0; C.selectStrip(id); render(); }, busy));
    }
    body.replaceChildren(); if (panel === 'audio') renderAudio(body); else renderRack(body); body.scrollTop = scroll;
    const foot = modal.querySelector('.vst-footer'); foot.replaceChildren();
    const start = button(state.running ? 'Ferma audio' : 'Avvia audio', toggleAudio, state.running ? 'vst-stop' : 'vst-primary'); start.disabled = busy || state.scanning || !connected || !available();
    foot.append(note(busy || state.scanning ? state.scanning && scanMessage || 'Operazione in corso…' : !connected ? 'Motore non collegato · apri Audio per riconnetterlo' : 'Salvataggio automatico'), start);
    updateStatus(); renderAlert();
    if (focusLabel) {
      const next = [...modal.querySelectorAll('[aria-label]')].find(node => node.tagName === active.tagName && node.getAttribute('aria-label') === focusLabel && !node.closest('[hidden]'));
      if (next && !next.disabled) { next.focus({ preventScroll: true }); if (next.type === 'search' && focusStart != null) next.setSelectionRange(focusStart, focusEnd); }
    }
  }
  async function show(nextPanel, id = rackId, slot = 0, options = {}) {
    if (M.validId(id)) rackId = id;
    panel = nextPanel; selectedSlot = Math.max(0, Math.min(7, slot)); routingDraft = null; catalogOpen = !!options.choose;
    if (options.route) routingExpanded.add(rackId);
    makeDialog(); if (!modal.open) { priorFocus = document.activeElement; modal.showModal(); }
    render();
    if (options.connect !== false && available() && !busy && (!initialized || !connected || panel === 'audio' && !deviceList.length)) {
      busy = true; render();
      try { await ensure(); if (panel === 'audio' && !deviceList.length) await refreshDevices(); }
      catch (error) { message(error); }
      finally { busy = false; render(); }
    }
    if (catalogOpen && panel === 'rack') modal.querySelector('.vst-search')?.focus({ preventScroll: true });
  }
  async function openSlot(id, slot = 0) {
    if (!M.validId(id) || !Number.isInteger(slot) || slot < 0 || slot >= M.MAX_SLOTS) return;
    const key = `${id}:${slot}`;
    if (editorPending.has(key)) return editorPending.get(key);
    const pending = (async () => {
      if (!available()) return showBrowser(id, slot);
      try {
        // The first Extended click must restore native racks before consulting
        // UI metadata. Audio need not be running to open a plugin editor.
        await ensure();
        if (state.scanning) { message('Attendi il completamento della scansione VST3.'); return; }
        const plugin = getRack(id)?.slots?.[slot];
        if (!plugin?.pluginId || plugin.missing) return showBrowser(id, slot);
        selectSlot(id, slot);
        await request('openEditor', { rackId: id, slot });
      } catch (error) { await show('rack', id, slot, { connect: false }); message(error); }
    })();
    editorPending.set(key, pending);
    try { return await pending; } finally { editorPending.delete(key); }
  }
  function openRack(id = C.getState().selected) { return show('rack', M.validId(id) ? id : 'ch-1'); }
  function openAudio() { return show('audio'); }
  window.SculptVst = Object.freeze({ getRack, openSlot, openRack, openAudio, renderChannel, setPlacement, routingStatus, ensureHost: async () => { await ensure(); return { ...state, connected }; }, snapshot: () => ({ ...state, connected, error: fault }), available });
  window.addEventListener('sculpt-vst-route-state', event => { if (event.detail?.state !== 'prepared') routePlans.delete(event.detail?.rackId); render(); });
  window.addEventListener('sculpt-live-state', () => {
    const key = liveControlKey();
    if (key === lastLiveControlKey) return;
    lastLiveControlKey = key; routePlans.clear(); refreshChannelViews();
    if (modal?.open && !busy) render();
  });
  const toolbar = button('Audio · fermo', openAudio, 'vst-audio-button'); toolbar.id = 'vst-audio-button';
  toolbar.setAttribute('aria-label', 'Apri audio e rack VST3'); document.querySelector('.macro-rail')?.insertBefore(toolbar, document.getElementById('info-button'));
  if (window.SculptDesktop?.addListener) {
    window.SculptDesktop.addListener('audioState', accept).catch(message);
    window.SculptDesktop.addListener('audioError', error => { if (error?.fatal !== false) { connected = false; state.running = false; state.scanning = false; state.analysis = { ...state.analysis, running: false }; initialized = false; } message(error?.message || error?.error || error); emit(); if (modal?.open) render(); }).catch(message);
    window.SculptDesktop.addListener('audioScanProgress', data => { scanMessage = data?.message || (data?.name ? `Scansione · ${data.name}` : 'Scansione VST3…'); const footer = modal?.querySelector('.vst-footer .vst-note'); if ((busy || state.scanning) && footer) footer.textContent = scanMessage; }).catch(message);
  }
  C.subscribe(event => { if (event.type === 'selection' && modal?.open && panel === 'rack' && !busy && M.validId(event.id) && event.id !== rackId) { rackId = event.id; routingDraft = null; render(); } });
  updateStatus();
})();
