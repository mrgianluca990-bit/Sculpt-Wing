(() => {
  'use strict';
  const C = window.SculptController, R = window.SculptAnalysisRouting;
  if (!C || !R || window.SculptAnalysis) return;
  const KEY = 'sculpt-wing-analysis-v1', COLORS = ['#e0bd79', '#80c9bf', '#c19be5', '#ef9cae', '#8bb7ed', '#ced384'];
  const defaults = () => ({ measurementChannel: 0, referenceChannel: 1, fftSize: 32768, averages: 8, delayMs: 0, calibrationEnabled: false, calibration: [], levelOffsetDb: null });
  let config = defaults(), micId = '', referenceId = '', side = 'L', profile = null, traces = [], splContext = '';
  let dialog = null, refs = {}, plots = [], route = null, guards = {}, device = {}, hostReady = false, hostError = '', busy = false;
  let frame = null, lastValidFrame = null, sequence = -1, stableLevels = [], pollTimer = null, pollPending = false, rpcTail = Promise.resolve();
  let epoch = 0, view = 'transfer', impulseSpan = 50, renderPending = false, calibrationDirty = true, priorFocus = null, routeInvalidating = false;
  let loadError = '', pendingSplContext = '', routeCheckAt = 0, routeCheckPending = false, configurationRevision = 0;
  const available = () => window.SculptDesktop?.platform === 'macos' && typeof window.SculptDesktop?.audioRequest === 'function';
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const num = (v, decimals = 1) => finite(v) ? v.toLocaleString('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const button = (text, action, cls = '') => { const n = el('button', 'analysis-button ' + cls, text); n.type = 'button'; n.addEventListener('click', action); return n; };
  const label = (text, control) => { const n = el('label', 'analysis-field'); n.append(el('span', '', text), control); control.setAttribute('aria-label', text); return n; };
  function select(options, value, change) {
    const n = el('select', 'analysis-select');
    for (const [v, text] of options) { const o = el('option', '', text); o.value = String(v); n.append(o); }
    n.value = String(value); n.addEventListener('change', () => change(n.value)); return n;
  }
  function numeric(value, min, max, step, change) {
    const n = el('input', 'analysis-number'); n.type = 'number'; n.min = min; n.max = max; n.step = step; n.value = value;
    n.addEventListener('change', () => {
      if (!n.checkValidity() || !Number.isFinite(n.valueAsNumber)) { status('Inserisci un valore compreso fra ' + min + ' e ' + max + '.', true); return; }
      change(n.valueAsNumber);
    }); return n;
  }
  function nameOf(id) { const s = C.getStrip(id); return s ? s.kind + ' ' + s.number + ' · ' + s.name : ''; }
  function id() { return 'measure-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function load() {
    try {
      const text = localStorage.getItem(KEY); if (!text) return;
      if (text.length > 4194304) throw new Error('L’archivio locale delle misure supera il limite di lettura.');
      const saved = JSON.parse(text); if (saved?.version !== 1) return;
      profile = R.calibrationProfile(saved.profile);
      config = R.normaliseConfig({ ...saved.config, calibration: profile?.points || [], calibrationEnabled: !!profile && saved.config?.calibrationEnabled });
      micId = typeof saved.micId === 'string' ? saved.micId : ''; referenceId = typeof saved.referenceId === 'string' ? saved.referenceId : '';
      side = ['L', 'R', 'L+R'].includes(saved.side) ? saved.side : 'L';
      traces = Array.isArray(saved.traces) && saved.traces.length <= R.MAX_TRACES ? saved.traces.map(R.validateTrace) : [];
      pendingSplContext = typeof saved.splContext === 'string' ? saved.splContext : '';
      if (!pendingSplContext) config.levelOffsetDb = null;
    } catch (error) { loadError = 'Archivio locale non caricato: ' + error.message; config = defaults(); profile = null; traces = []; }
  }
  function persist() {
    try {
      const text = JSON.stringify({ version: 1, config: { ...config, calibration: [] }, profile, micId, referenceId, side, splContext: splContext || pendingSplContext, traces });
      if (text.length > 4194304) throw new Error('limite locale raggiunto');
      localStorage.setItem(KEY, text);
    } catch { status('Le misure restano aperte, ma non è stato possibile salvarle in locale. Usa Esporta misure.', true); }
  }
  function status(text, error = false) { if (!refs.notice) return; refs.notice.textContent = text || ''; refs.notice.dataset.error = String(error); refs.notice.hidden = !text; }
  function rpc(method, params = {}) {
    const run = () => {
      if (!available()) throw new Error('La misura audio è disponibile nell’app Sculpt Wing per Mac Apple Silicon.');
      return window.SculptDesktop.audioRequest({ method, params });
    };
    const promise = rpcTail.then(run, run); rpcTail = promise.catch(() => {}); return promise;
  }
  function inputCount() { const n = device.inputChannels; return Math.min(48, Array.isArray(n) ? n.length : Number.isInteger(n) && n >= 0 ? n : 48); }
  function deviceKey() { return JSON.stringify([device.inputDevice || '', device.outputDevice || '', device.sampleRate || 0, device.inputChannels ?? 0, config.measurementChannel]); }
  function calibrationContext() {
    const mic = mapping('mic').verified ? route?.mic : null;
    return JSON.stringify([deviceKey(), micId, mic?.group || '', mic?.index || 0, mic?.gain ?? null]);
  }
  function invalidateSpl(reason, save = true) {
    if (config.levelOffsetDb === null && !pendingSplContext && !splContext) return;
    config.levelOffsetDb = null; splContext = ''; pendingSplContext = ''; stableLevels = [];
    if (save) persist(); if (reason) status(reason); updateState();
  }
  function acceptDevice(data) {
    if (!data?.audio) return;
    const previous = deviceKey(); device = { ...data.audio };
    if (previous !== deviceKey()) {
      stableLevels = []; lastValidFrame = null;
      if (splContext) invalidateSpl('Interfaccia o ingresso cambiati: la taratura SPL è da ripetere.');
      if (dialog?.open) fillUsbOptions();
    }
    if (pendingSplContext && device.inputDevice) {
      // A named WING mic requires a fresh gain/patch check before restoring SPL.
      if (!micId && pendingSplContext === calibrationContext()) { splContext = pendingSplContext; pendingSplContext = ''; }
      else if (!micId) invalidateSpl('La taratura SPL salvata appartiene a un’altra configurazione audio.');
    }
    updateState();
  }
  async function action(work) {
    if (busy || routeInvalidating) { syncSettings(); return false; }
    busy = true; updateState();
    try { await work(); persist(); return true; }
    catch (error) { syncSettings(); status(error?.message || String(error), true); return false; }
    finally { busy = false; updateState(); schedulePoll(); }
  }
  async function applyConfiguration(next, restart = !!frame?.running) {
    const turn = epoch, revision = configurationRevision;
    next = R.normaliseConfig({ ...next, calibration: profile?.points || [] });
    if (next.measurementChannel >= inputCount() || next.referenceChannel >= inputCount()) throw new Error('Gli ingressi selezionati non sono disponibili sull’interfaccia audio.');
    if (frame?.running) accept(await rpc('stopAnalysis'));
    if (revision !== configurationRevision) throw new Error('Il patch o il gain sono cambiati: verifica nuovamente la WING.');
    config = next; stableLevels = []; lastValidFrame = null; sequence = -1;
    if (!hostReady) { syncSettings(); return; }
    accept(await rpc('configureAnalysis', config));
    if (restart && dialog?.open && turn === epoch && revision === configurationRevision && !routeInvalidating) accept(await rpc('startAnalysis'));
    syncSettings();
  }
  function changeConfiguration(patch, invalidate = false) {
    return action(async () => {
      if (invalidate) invalidateSpl('Ingresso di misura cambiato: la taratura SPL è da ripetere.', false);
      await applyConfiguration({ ...config, ...patch });
      if (route) guards = R.selectedGuards(route, config.measurementChannel, config.referenceChannel);
    });
  }
  async function initialise() {
    if (!available()) { hostError = 'Apri Sculpt Wing sul Mac per acquisire audio. Qui puoi consultare e importare misure salvate.'; updateState(); return; }
    const turn = epoch;
    await action(async () => {
      if (typeof window.SculptVst?.ensureHost !== 'function') throw new Error('Aggiorna Sculpt Wing: l’host audio condiviso non espone il modulo di analisi.');
      await window.SculptVst.ensureHost();
      if (!dialog?.open || turn !== epoch) return;
      acceptDevice(await rpc('getState'));
      const actual = await rpc('getAnalysis'); hostReady = true; hostError = '';
      if (actual?.running && actual.config) {
        const next = { ...config, ...actual.config, calibration: profile?.points || [] };
        if (actual.config.calibrationPointCount !== (profile?.points.length || 0)) { next.calibrationEnabled = false; next.calibration = []; }
        config = R.normaliseConfig(next);
      }
      accept(actual); syncSettings();
      if (loadError) status(loadError, true);
    });
    if (!hostReady && refs.notice?.textContent) { hostError = refs.notice.textContent; updateState(); }
  }
  async function toggleMeasurement() {
    await action(async () => {
      if (!hostReady) throw new Error(hostError || 'Il motore di analisi non è disponibile.');
      if (frame?.running) { accept(await rpc('stopAnalysis')); return; }
      acceptDevice(await rpc('getState'));
      if (!device.configured || !device.inputDevice) throw new Error('Apri Audio USB e configura l’interfaccia prima di avviare la misura.');
      await requireCurrentRouting();
      if (pendingSplContext) invalidateSpl('Verifica il patch WING prima di richiamare la taratura SPL salvata.', false);
      status('');
      await applyConfiguration(config, true);
    });
  }
  function accept(next) {
    if (!next || typeof next !== 'object') return;
    const previous = frame;
    frame = next;
    if (next.sequence !== sequence) {
      sequence = next.sequence;
      if (next.running && !next.stale && !next.clipped && finite(next.measurementRmsDb) && next.measurementRmsDb > -80) {
        stableLevels.push(next.measurementRmsDb); if (stableLevels.length > 8) stableLevels.shift();
      } else stableLevels = [];
      if (next.valid && !next.clipped && !next.stale && next.running) {
        lastValidFrame = { ...next, capturedAt: new Date().toISOString(), config: { ...next.config } };
      }
      drawSoon();
    }
    if (previous?.running !== next.running || previous?.stale !== next.stale || previous?.valid !== next.valid) drawSoon();
    updateState();
  }
  function schedulePoll() {
    clearTimeout(pollTimer); pollTimer = null;
    if (!dialog?.open || !hostReady) return;
    pollTimer = setTimeout(poll, 125);
  }
  async function poll() {
    if (!dialog?.open || !hostReady) return;
    if (busy || pollPending) { schedulePoll(); return; }
    pollPending = true; const turn = epoch;
    try {
      const next = await rpc('getAnalysis');
      if (dialog?.open && turn === epoch) {
        accept(next);
        if (route && !routeCheckPending && Date.now() - routeCheckAt > 2500) refreshRoutingGuards();
      }
    } catch (error) { hostError = error.message || 'Host audio non raggiungibile.'; hostReady = false; status(hostError, true); updateState(); }
    finally { pollPending = false; schedulePoll(); }
  }
  function namedChange(kind, value) {
    if (kind === 'mic') { micId = value; invalidateSpl('Microfono selezionato: verifica ingresso e taratura SPL.', false); }
    else if (kind === 'reference') referenceId = value;
    else side = value;
    route = null; guards = {}; updateRouting(); persist();
    if (frame?.running && kind === 'mic') changeConfiguration({ levelOffsetDb: null });
  }
  async function verifyRouting() {
    await action(async () => {
      const turn = epoch, previousMic = config.measurementChannel, previousGain = route?.mic?.gain;
      route = null; guards = {}; updateRouting();
      status('Lettura del patch WING…');
      const result = await R.readRouting(window.SculptLive, micId, referenceId, side);
      if (!dialog?.open || turn !== epoch) return;
      route = result;
      const mic = result.micMatches.find(m => m.channel === config.measurementChannel) || result.micMatches.find(m => m.channel < inputCount());
      const ref = result.referenceMatches.find(m => m.channel === config.referenceChannel) || result.referenceMatches.find(m => m.channel < inputCount() && m.channel !== mic?.channel);
      const next = { ...config, measurementChannel: mic?.channel ?? config.measurementChannel, referenceChannel: ref?.channel ?? config.referenceChannel };
      if (previousMic !== next.measurementChannel || previousGain != null && previousGain !== result.mic?.gain) invalidateSpl('Ingresso o gain microfonico cambiati: la taratura SPL è da ripetere.', false);
      config = next; guards = R.selectedGuards(result, next.measurementChannel, next.referenceChannel); routeCheckAt = Date.now();
      if (pendingSplContext) {
        if (pendingSplContext === calibrationContext() && result.mic?.gain != null) { splContext = pendingSplContext; pendingSplContext = ''; }
        else invalidateSpl('La taratura SPL salvata non corrisponde al patch/gain attuale.', false);
      }
      await applyConfiguration(config);
      status(mic && ref ? 'Patch letto dalla WING. Sono state selezionate le copie USB già presenti.' : 'Associazione incompleta: scegli esplicitamente i due ingressi USB. Il patch del mixer resta invariato.');
      updateRouting(); syncSettings();
    });
  }
  function checkRouting() {
    if (!route || routeInvalidating || !dialog?.open) return;
    const live = window.SculptLive;
    if (live?.sessionToken?.() === route.token && !R.guardsChanged(live, guards)) return;
    invalidateRouting();
  }
  function invalidateRouting(reason = 'Patch o gain WING cambiati: verifica nuovamente mic/reference e taratura SPL.') {
    if (routeInvalidating) return;
    configurationRevision++; routeInvalidating = true; route = null; guards = {}; stableLevels = []; lastValidFrame = null;
    invalidateSpl('', false); status(reason, true); persist();
    updateRouting();
    if (!hostReady) { routeInvalidating = false; updateState(); return; }
    rpc('stopAnalysis').then(accept).catch(error => status(error.message, true)).finally(() => { routeInvalidating = false; updateState(); schedulePoll(); });
  }
  async function requireCurrentRouting() {
    if (!route) return;
    const current = route;
    if (!await R.readGuards(window.SculptLive, current, guards) || current !== route) {
      invalidateRouting();
      throw new Error('Il patch o il gain non corrispondono alla misura. Verifica nuovamente la WING.');
    }
    routeCheckAt = Date.now();
  }
  async function refreshRoutingGuards() {
    const current = route, turn = epoch;
    routeCheckPending = true; routeCheckAt = Date.now();
    try {
      const unchanged = await R.readGuards(window.SculptLive, current, guards);
      if (dialog?.open && turn === epoch && route === current && !unchanged) invalidateRouting();
    } catch (error) {
      if (dialog?.open && turn === epoch && route === current) invalidateRouting('Lettura del patch/gain interrotta. La misura è ferma: verifica nuovamente la WING.');
    } finally { routeCheckPending = false; }
  }
  function mapping(kind) {
    const channel = config[kind === 'mic' ? 'measurementChannel' : 'referenceChannel'];
    const match = route?.[kind === 'mic' ? 'micMatches' : 'referenceMatches']?.find(item => item.channel === channel);
    return match ? { verified: true, text: match.label } : { verified: false, text: 'USB ' + (channel + 1) + ' · scelta manuale, associazione al nome non verificata' };
  }
  function updateRouting() {
    if (!refs.micRoute) return;
    for (const kind of ['mic', 'reference']) {
      const m = mapping(kind), node = refs[kind + 'Route']; node.textContent = m.text; node.dataset.verified = String(m.verified);
    }
    if (refs.verify) refs.verify.disabled = busy || !micId || !referenceId || !window.SculptLive?.isConnected?.();
  }
  function stableForSpl() {
    return frame?.running && !frame.stale && !frame.clipped && stableLevels.length >= 8 && Math.max(...stableLevels) - Math.min(...stableLevels) < .5;
  }
  function calibrateSpl() {
    return action(async () => {
      if (!stableForSpl()) throw new Error('Attendi un livello microfonico stabile, senza clip, con il calibratore inserito.');
      const value = Number(refs.splKnown.value);
      if (!finite(value) || value < 40 || value > 140) throw new Error('Inserisci il livello noto del calibratore fra 40 e 140 dB.');
      await requireCurrentRouting();
      if (!stableForSpl()) throw new Error('Il segnale del microfono non è più stabile. Attendi prima di calibrare.');
      const mean = stableLevels.reduce((a, b) => a + b, 0) / stableLevels.length;
      config.levelOffsetDb = value - mean; splContext = calibrationContext(); pendingSplContext = '';
      await applyConfiguration(config);
      status('Taratura SPL salvata per questo ingresso e gain. Lettura RMS non ponderata.');
    });
  }
  async function readFile(file, max) { if (!file) return null; if (file.size > max) throw new Error('Il file supera il limite di ' + Math.round(max / 1024) + ' KiB.'); return file.text(); }
  function importCalibration(file) {
    return action(async () => {
      const text = await readFile(file, 524288); if (text === null) return;
      const next = R.parseCalibration(text, file.name);
      profile = next; calibrationDirty = true;
      await applyConfiguration({ ...config, calibrationEnabled: true, calibration: next.points });
      status('Caricata la risposta del microfono: il motore applica la compensazione inversa.');
      renderCalibration(); drawSoon();
    });
  }
  function captureTrace() {
    try {
      if (traces.length >= R.MAX_TRACES) throw new Error('Sono già presenti ' + R.MAX_TRACES + ' misure. Esporta o elimina una misura prima di aggiungerne altre.');
      const snapshot = R.snapshot(lastValidFrame, {
        id: id(), name: refs.traceName.value.trim() || 'Misura ' + (traces.length + 1), color: refs.traceColor.value,
        createdAt: lastValidFrame?.capturedAt, micLabel: nameOf(micId) + ' · ' + mapping('mic').text,
        referenceLabel: nameOf(referenceId) + ' · ' + mapping('reference').text, calibrationName: config.calibrationEnabled ? profile?.name : ''
      });
      traces.push(snapshot); refs.traceName.value = ''; refs.traceColor.value = COLORS[traces.length % COLORS.length];
      persist(); renderTraces(); drawSoon(); status('Misura memorizzata.');
    } catch (error) { status(error.message, true); }
  }
  function exportTraces() {
    const data = JSON.stringify({ format: 'sculpt-wing-measurements', version: 1, exportedAt: new Date().toISOString(), traces }, null, 2);
    window.SculptUI?.download?.('Sculpt-Wing-misure-' + new Date().toISOString().slice(0, 10) + '.json', data);
  }
  function importSaved(file) {
    return action(async () => {
      const text = await readFile(file, 6291456); if (text === null) return;
      const imported = R.importTraces(text);
      if (traces.length + imported.length > R.MAX_TRACES) throw new Error('Il totale supererebbe ' + R.MAX_TRACES + ' misure. Esporta o elimina quelle che non servono.');
      traces.push(...imported.map(t => ({ ...t, id: id() }))); renderTraces(); drawSoon(); status('Importate ' + imported.length + ' misure.');
    });
  }
  function renderTraces() {
    if (!refs.traces) return;
    refs.traces.replaceChildren();
    if (!traces.length) refs.traces.append(el('p', 'analysis-hint', 'Le misure salvate si sovrappongono ai grafici e restano disponibili alla riapertura.'));
    for (const trace of traces) {
      const row = el('div', 'analysis-trace'), show = el('input'), color = el('input'), name = el('input', 'analysis-trace-name');
      show.type = 'checkbox'; show.checked = trace.visible; show.setAttribute('aria-label', 'Mostra ' + trace.name);
      color.type = 'color'; color.value = trace.color; color.setAttribute('aria-label', 'Colore ' + trace.name);
      name.type = 'text'; name.value = trace.name; name.maxLength = 80; name.setAttribute('aria-label', 'Nome misura');
      show.addEventListener('change', () => { trace.visible = show.checked; persist(); drawSoon(); });
      color.addEventListener('input', () => { trace.color = color.value; drawSoon(); }); color.addEventListener('change', persist);
      name.addEventListener('change', () => { trace.name = name.value.trim() || 'Misura'; name.value = trace.name; show.setAttribute('aria-label', 'Mostra ' + trace.name); persist(); });
      const remove = button('×', () => { traces = traces.filter(t => t !== trace); persist(); renderTraces(); drawSoon(); }, 'analysis-trace-remove'); remove.setAttribute('aria-label', 'Elimina ' + trace.name);
      row.title = [trace.micLabel, trace.referenceLabel, 'Ritardo misura: ' + num(trace.delayMs, 2) + ' ms', new Date(trace.createdAt).toLocaleString('it-IT')].join('\n');
      row.append(show, color, name, remove); refs.traces.append(row);
    }
    refs.export.disabled = !traces.length; refs.traceCount.textContent = traces.length + '/' + R.MAX_TRACES;
  }
  function renderCalibration() {
    if (!refs.profile) return;
    refs.profile.textContent = profile ? profile.name + ' · ' + profile.points.length + ' punti · ' + num(profile.points[0].frequency, 0) + '–' + num(profile.points.at(-1).frequency, 0) + ' Hz' : 'Nessun file di risposta caricato.';
    refs.calEnabled.checked = !!config.calibrationEnabled; refs.calEnabled.disabled = busy || !profile;
    refs.calPlot.hidden = !profile; calibrationDirty = true; drawSoon();
  }
  function fillUsbOptions() {
    for (const key of ['measurementChannel', 'referenceChannel']) {
      const field = refs[key]; if (!field) continue;
      const count = inputCount(); field.replaceChildren();
      for (let i = 0; i < Math.max(count, config[key] + 1); i++) {
        const option = el('option', '', 'USB ' + (i + 1) + (i >= count ? ' · non disponibile' : '')); option.value = String(i); option.disabled = i >= count; field.append(option);
      }
      field.value = String(config[key]);
    }
  }
  function fillNamedOptions() {
    if (!dialog) return;
    const strips = C.listStrips();
    for (const [kind, allowed, selected] of [['mic', ['CH', 'AUX'], micId], ['reference', ['CH', 'BUS', 'MAIN'], referenceId]]) {
      const field = refs[kind]; field.replaceChildren();
      for (const [value, text] of [['', 'Associazione USB manuale'], ...strips.filter(s => allowed.includes(s.kind)).map(s => [s.id, nameOf(s.id)])]) {
        const option = el('option', '', text); option.value = value; field.append(option);
      }
      field.value = selected;
    }
  }
  function syncSettings() {
    if (!dialog) return;
    for (const key of ['measurementChannel', 'referenceChannel', 'fftSize', 'averages', 'delayMs']) refs[key].value = String(config[key]);
    refs.mic.value = micId; refs.reference.value = referenceId; refs.side.value = side; renderCalibration(); updateRouting(); updateState();
  }
  function updateState() {
    if (!dialog) return;
    const running = !!frame?.running, state = !available() ? 'App Mac necessaria' : !hostReady ? 'Host non disponibile' : running ? frame.stale ? 'In attesa di audio' : frame.clipped ? 'Clip ingresso' : frame.valid ? 'Misura attiva' : 'Acquisizione…' : 'Misura ferma';
    refs.state.textContent = state; refs.state.dataset.running = String(running); refs.state.dataset.error = String(!!frame?.clipped);
    refs.device.textContent = device.inputDevice ? device.inputDevice + ' · ' + num((device.sampleRate || 0) / 1000, 1) + ' kHz · ' + inputCount() + ' ingressi' : 'Interfaccia audio da configurare';
    refs.start.textContent = running ? 'Ferma misura' : 'Avvia misura'; refs.start.classList.toggle('analysis-stop', running);
    refs.start.disabled = busy || routeInvalidating || !hostReady; refs.audio.disabled = busy || routeInvalidating || !available();
    for (const field of [refs.measurementChannel, refs.referenceChannel, refs.mic, refs.reference, refs.side, refs.fftSize, refs.averages, refs.delayMs]) field.disabled = busy;
    refs.useDelay.disabled = busy || !running || !frame?.valid || frame.stale || frame.clipped || !finite(frame.estimatedDelayMs) || Math.abs(frame.estimatedDelayMs) > 500;
    refs.delayFound.textContent = finite(frame?.estimatedDelayMs) && frame?.valid ? num(frame.estimatedDelayMs, 2) + ' ms' : '— ms';
    refs.delaySearch.textContent = [finite(frame?.delaySearchMs) ? 'Ricerca residua ±' + num(frame.delaySearchMs, 1) + ' ms' : 'Ritardo fra reference e microfono', frame?.running && typeof frame.delayQuality === 'string' ? frame.delayQuality : ''].filter(Boolean).join(' · ');
    refs.capture.disabled = busy || !lastValidFrame;
    refs.splCal.disabled = busy || !stableForSpl(); refs.splReset.disabled = busy || config.levelOffsetDb === null;
    refs.calEnabled.disabled = busy || !profile;
    refs.spl.textContent = finite(frame?.splDb) && config.levelOffsetDb !== null && !pendingSplContext ? num(frame.splDb, 1) + ' dB SPL' : 'SPL non tarato';
    refs.splHint.textContent = pendingSplContext ? 'Taratura salvata: verifica il patch WING.' : config.levelOffsetDb !== null ? 'RMS non ponderato · offset ' + num(config.levelOffsetDb, 1) + ' dB' : stableForSpl() ? 'Livello stabile: puoi calibrare.' : 'Per calibrare attendi un livello stabile senza clip.';
    for (const kind of ['measurement', 'reference']) {
      const value = frame?.[kind + 'RmsDb'], peak = frame?.[kind + 'PeakDb'];
      refs[kind + 'Meter'].value = finite(value) && running ? Math.min(0, Math.max(-90, value)) : -90;
      refs[kind + 'Level'].textContent = finite(value) && running ? num(value) + ' dBFS · picco ' + num(peak) : '— dBFS';
    }
    refs.quality.textContent = frame?.clipped ? 'Abbassa il livello di ingresso.' : running && frame?.stale ? 'Nessuna finestra audio recente.' : running ? [typeof frame.quality === 'string' ? frame.quality : !frame.valid ? 'Attendi segnale utile su mic e reference.' : 'Misura attiva', finite(frame.meanCoherence) ? 'Coerenza ' + Math.round(Math.max(0, Math.min(1, frame.meanCoherence)) * 100) + '%' : ''].filter(Boolean).join(' · ') : 'Invia un segnale di prova esterno a mic e reference.';
    for (const plot of plots) if (['phase', 'impulse'].includes(plot.kind)) plot.box.querySelector('header span').textContent = (plot.kind === 'phase' ? '°' : 'ms · impulso grezzo') + ' · riferimento comune ' + num(config.delayMs, 2) + ' ms';
    updateRouting();
    if (hostError && !refs.notice.textContent) status(hostError, true);
  }
  function drawSoon() {
    if (!dialog?.open || renderPending) return;
    renderPending = true; requestAnimationFrame(() => { renderPending = false; if (dialog?.open) drawAll(); });
  }
  function graph(kind, title, unit) {
    const box = el('section', 'analysis-graph analysis-graph-' + kind), head = el('header');
    head.append(el('strong', '', title), el('span', '', unit)); const canvas = el('canvas');
    canvas.setAttribute('aria-label', title); canvas.setAttribute('role', 'img'); box.append(head, canvas); plots.push({ kind, box, canvas }); return box;
  }
  function plotData(kind) {
    if (kind === 'calibration') return profile ? [{ color: '#e1bd7e', frequency: profile.points.map(p => p.frequency), magnitudeDb: profile.points.map(p => p.gainDb) }] : [];
    const data = traces.filter(t => t.visible).map(t => ({ ...t, saved: true }));
    if (frame?.frequency?.length && (frame.valid || kind === 'rta')) data.push({ ...frame, color: frame.clipped ? '#ee828b' : '#8bd9cd', saved: false });
    for (const trace of data) {
      const delay = trace.saved ? trace.delayMs : trace.config?.delayMs ?? config.delayMs;
      if (kind === 'phase') trace.phaseDeg = trace.phaseDeg.map((value, index) => value + 360 * trace.frequency[index] * (config.delayMs - delay) / 1000);
      if (kind === 'impulse' && trace.impulse) trace.impulse = { ...trace.impulse, timeMs: trace.impulse.timeMs.map(value => value + delay - config.delayMs) };
    }
    return data;
  }
  function drawAll() {
    for (const item of plots) if (!item.box.hidden && (item.kind !== 'calibration' || calibrationDirty)) drawGraph(item);
    calibrationDirty = false;
  }
  function drawGraph({ kind, canvas }) {
    const rect = canvas.getBoundingClientRect(), width = Math.round(rect.width), height = Math.round(rect.height);
    if (width < 20 || height < 20) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    const data = plotData(kind), pad = { l: 43, r: 12, t: 8, b: 23 }, w = width - pad.l - pad.r, h = height - pad.t - pad.b;
    const key = { magnitude: 'magnitudeDb', phase: 'phaseDeg', coherence: 'coherence', rta: 'rtaDb', calibration: 'magnitudeDb' }[kind];
    let xmin = 20, xmax = Math.max(21, Math.min(20000, (frame?.sampleRate || device.sampleRate || 48000) / 2)), ymin = -24, ymax = 24;
    if (kind === 'phase') { ymin = -180; ymax = 180; }
    if (kind === 'coherence') { ymin = 0; ymax = 1; }
    if (kind === 'rta') { ymin = -120; ymax = 0; }
    if (kind === 'magnitude' || kind === 'calibration') {
      const values = data.flatMap(d => (d[key] || []).filter((v, i) => finite(v) && d.frequency[i] >= xmin && d.frequency[i] <= xmax));
      if (values.length) { ymin = Math.floor(Math.max(-120, Math.min(...values) - 3) / 6) * 6; ymax = Math.ceil(Math.min(120, Math.max(...values) + 3) / 6) * 6; if (ymax - ymin < 12) { ymin -= 6; ymax += 6; } }
    }
    if (kind === 'impulse') {
      const impulses = data.filter(d => d.impulse?.timeMs?.length), primary = impulses.at(-1);
      const xs = impulses.flatMap(d => d.impulse.timeMs), ys = impulses.flatMap(d => d.impulse.value);
      xmin = xs.length ? Math.min(...xs) : -25; xmax = xs.length ? Math.max(...xs) : 25;
      if (impulseSpan && primary) {
        let peak = 0; for (let i = 1; i < primary.impulse.value.length; i++) if (Math.abs(primary.impulse.value[i]) > Math.abs(primary.impulse.value[peak])) peak = i;
        const center = primary.impulse.timeMs[peak]; xmin = center - impulseSpan / 2; xmax = center + impulseSpan / 2;
      }
      const peak = Math.max(1e-9, ...ys.filter(finite).map(Math.abs)); ymin = -peak * 1.05; ymax = peak * 1.05;
    }
    if (!(xmax > xmin)) xmax = xmin + 1;
    const x = value => pad.l + (kind === 'impulse' ? (value - xmin) / (xmax - xmin) : Math.log(value / xmin) / Math.log(xmax / xmin)) * w;
    const y = value => pad.t + (ymax - value) / (ymax - ymin) * h;
    ctx.font = '10px -apple-system, sans-serif'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const value = ymin + (ymax - ymin) * i / 4, py = y(value);
      ctx.strokeStyle = '#364048'; ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(width - pad.r, py); ctx.stroke();
      ctx.fillStyle = '#9baab4'; ctx.textAlign = 'right';
      ctx.fillText(kind === 'coherence' ? Math.round(value * 100) + '%' : kind === 'impulse' ? value.toPrecision(2) : Math.round(value), pad.l - 6, py + 3);
    }
    const ticks = kind === 'impulse' ? Array.from({ length: 6 }, (_, i) => xmin + (xmax - xmin) * i / 5) : [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(v => v <= xmax);
    for (const value of ticks) {
      const px = x(value); ctx.strokeStyle = '#2a343d'; ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, height - pad.b); ctx.stroke();
      ctx.fillStyle = '#9baab4'; ctx.textAlign = 'center'; ctx.fillText(kind === 'impulse' ? num(value, 1) : value >= 1000 ? value / 1000 + 'k' : String(value), px, height - 7);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, w, h); ctx.clip();
    for (const trace of data) {
      const xs = kind === 'impulse' ? trace.impulse?.timeMs || [] : trace.frequency || [], values = kind === 'impulse' ? trace.impulse?.value || [] : trace[key] || [];
      ctx.strokeStyle = trace.color; ctx.globalAlpha = trace.saved ? .78 : frame?.stale || !frame?.running ? .42 : 1; ctx.lineWidth = trace.saved ? 1.3 : 1.7;
      ctx.beginPath(); let pen = false, previous = null;
      for (let i = 0; i < Math.min(xs.length, values.length); i++) {
        let v = values[i]; if (!finite(xs[i]) || !finite(v) || xs[i] < xmin || xs[i] > xmax) { pen = false; continue; }
        if (kind === 'phase') v = ((v + 180) % 360 + 360) % 360 - 180;
        const px = x(xs[i]), py = y(v);
        if (!pen || kind === 'phase' && previous !== null && Math.abs(v - previous) > 180) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        pen = true; previous = v;
      }
      ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
    if (!data.length) { ctx.fillStyle = '#84949e'; ctx.textAlign = 'center'; ctx.font = '12px -apple-system, sans-serif'; ctx.fillText(kind === 'calibration' ? 'Importa una curva microfonica' : 'In attesa di una misura reale', width / 2, height / 2); }
  }
  function setView(next) {
    view = next;
    for (const [key, node] of Object.entries(refs.viewButtons)) node.setAttribute('aria-selected', String(key === next));
    for (const plot of plots) if (plot.kind !== 'calibration') plot.box.hidden = next === 'transfer' ? !['magnitude', 'phase', 'coherence'].includes(plot.kind) : plot.kind !== next;
    refs.impulseZoom.hidden = next !== 'impulse'; drawSoon();
  }
  function build() {
    dialog = el('dialog', 'analysis-dialog'); dialog.id = 'analysis-dialog'; dialog.setAttribute('aria-labelledby', 'analysis-title'); dialog.setAttribute('aria-modal', 'false');
    const header = el('header', 'analysis-header'), heading = el('div'), title = el('h2', '', 'Analisi impianto'); title.id = 'analysis-title';
    heading.append(el('span', 'analysis-eyebrow', 'OPEN SOUND METER · MISURA MANUALE'), title);
    refs.state = el('span', 'analysis-state', 'Misura ferma');
    const x = button('×', close, 'analysis-close'); x.setAttribute('aria-label', 'Chiudi analisi e ferma la misura'); header.append(heading, refs.state, x);
    const body = el('div', 'analysis-body'), toolbar = el('div', 'analysis-toolbar');
    refs.device = el('span', 'analysis-device');
    refs.audio = button('Audio USB', () => action(async () => { if (frame?.running) accept(await rpc('stopAnalysis')); await window.SculptVst?.openAudio?.(); }));
    refs.verify = button('Verifica patch WING', verifyRouting);
    refs.start = button('Avvia misura', toggleMeasurement, 'analysis-primary');
    toolbar.append(refs.device, refs.audio, refs.verify, refs.start);
    refs.notice = el('p', 'analysis-notice'); refs.notice.setAttribute('role', 'status'); refs.notice.hidden = true;
    const sources = el('div', 'analysis-sources'), strips = C.listStrips();
    for (const [kind, caption, allowed, selected] of [['mic', 'Microfono di misura', ['CH', 'AUX'], micId], ['reference', 'Reference elettrica', ['CH', 'BUS', 'MAIN'], referenceId]]) {
      const card = el('section', 'analysis-source');
      refs[kind] = select([['', 'Associazione USB manuale'], ...strips.filter(s => allowed.includes(s.kind)).map(s => [s.id, nameOf(s.id)])], selected, value => namedChange(kind, value));
      const inputKey = kind === 'mic' ? 'measurementChannel' : 'referenceChannel';
      refs[inputKey] = select([], config[inputKey], value => changeConfiguration({ [inputKey]: Number(value) }, kind === 'mic'));
      const controls = el('div', 'analysis-source-controls'); controls.append(label(caption, refs[kind]), label('USB effettivo · ' + (kind === 'mic' ? 'Mic' : 'Reference'), refs[inputKey]));
      if (kind === 'reference') { refs.side = select([['L', 'L / Mono'], ['R', 'R'], ['L+R', 'L+R']], side, value => namedChange('side', value)); controls.append(label('Componente', refs.side)); }
      refs[kind + 'Route'] = el('p', 'analysis-route'); const meterKind = kind === 'mic' ? 'measurement' : 'reference';
      refs[meterKind + 'Meter'] = el('meter', 'analysis-meter'); refs[meterKind + 'Meter'].min = -90; refs[meterKind + 'Meter'].max = 0; refs[meterKind + 'Meter'].low = -55; refs[meterKind + 'Meter'].high = -3; refs[meterKind + 'Meter'].optimum = -18; refs[meterKind + 'Meter'].value = -90;
      refs[meterKind + 'Meter'].setAttribute('aria-label', caption + ' · RMS dBFS');
      refs[meterKind + 'Level'] = el('output', 'analysis-level', '— dBFS'); card.append(controls, refs[kind + 'Route'], refs[meterKind + 'Meter'], refs[meterKind + 'Level']); sources.append(card);
    }
    const settings = el('div', 'analysis-settings');
    refs.fftSize = select([[16384, '16k'], [32768, '32k'], [65536, '64k']], config.fftSize, value => changeConfiguration({ fftSize: Number(value) }));
    refs.averages = numeric(config.averages, 2, 32, 1, value => changeConfiguration({ averages: value }));
    refs.delayMs = numeric(config.delayMs, -500, 500, .01, value => changeConfiguration({ delayMs: value }));
    const delay = el('div', 'analysis-delay-found'); refs.delayFound = el('strong', '', '— ms'); refs.delaySearch = el('span', 'analysis-hint');
    refs.useDelay = button('Usa nel misuratore', () => {
      const value = frame?.estimatedDelayMs;
      if (!frame?.running || !frame.valid || frame.stale || frame.clipped || !finite(value)) { status('Attendi una stima del ritardo valida.', true); return; }
      changeConfiguration({ delayMs: value });
    }); refs.useDelay.title = 'Allinea la reference nel misuratore; non modifica il delay delle matrici.';
    delay.append(el('small', '', 'Ritardo stimato'), refs.delayFound, refs.delaySearch, refs.useDelay);
    settings.append(label('FFT', refs.fftSize), label('Medie', refs.averages), label('Ritardo misura · ms', refs.delayMs), delay);
    const workspace = el('div', 'analysis-workspace'), display = el('section', 'analysis-display'), viewbar = el('div', 'analysis-viewbar');
    viewbar.setAttribute('role', 'tablist'); viewbar.setAttribute('aria-label', 'Grafici di analisi'); refs.viewButtons = {};
    for (const [value, caption] of [['transfer', 'Trasferimento'], ['rta', 'RTA'], ['impulse', 'Impulso']]) {
      const b = button(caption, () => setView(value)); b.setAttribute('role', 'tab'); refs.viewButtons[value] = b; viewbar.append(b);
    }
    refs.impulseZoom = label('Finestra impulso', select([[10, '10 ms'], [25, '25 ms'], [50, '50 ms'], [100, '100 ms'], [0, 'Completa']], impulseSpan, value => { impulseSpan = Number(value); drawSoon(); }));
    refs.quality = el('span', 'analysis-quality'); viewbar.append(refs.impulseZoom, refs.quality);
    const graphs = el('div', 'analysis-graphs');
    graphs.append(graph('magnitude', 'Risposta in frequenza', 'dB'), graph('phase', 'Fase', '°'), graph('coherence', 'Coerenza', '%'), graph('rta', 'Spettro microfono', 'dBFS'), graph('impulse', 'Risposta impulsiva', 'ms · tempo relativo del misuratore'));
    display.append(viewbar, graphs);
    const sidebar = el('aside', 'analysis-sidebar'), snapshots = el('section', 'analysis-snapshots'), snapshotsTitle = el('h3', '', 'Misure salvate');
    refs.traceCount = el('small'); snapshotsTitle.append(refs.traceCount);
    const capture = el('div', 'analysis-capture'); refs.traceName = el('input'); refs.traceName.type = 'text'; refs.traceName.maxLength = 80; refs.traceName.placeholder = 'Nome della misura'; refs.traceName.setAttribute('aria-label', 'Nome nuova misura');
    refs.traceColor = el('input'); refs.traceColor.type = 'color'; refs.traceColor.value = COLORS[traces.length % COLORS.length]; refs.traceColor.setAttribute('aria-label', 'Colore nuova misura');
    refs.capture = button('Memorizza', captureTrace); capture.append(refs.traceName, refs.traceColor, refs.capture);
    refs.traces = el('div', 'analysis-traces'); const traceActions = el('div', 'analysis-trace-actions'), traceFile = el('input'); traceFile.type = 'file'; traceFile.accept = '.json'; traceFile.hidden = true;
    traceFile.addEventListener('change', () => { const file = traceFile.files?.[0]; traceFile.value = ''; if (file) importSaved(file); });
    refs.export = button('Esporta misure', exportTraces); traceActions.append(button('Importa misure', () => traceFile.click()), refs.export, traceFile); snapshots.append(snapshotsTitle, capture, refs.traces, traceActions);
    const calibration = el('details', 'analysis-calibration'); calibration.open = true; calibration.append(el('summary', '', 'Calibrazione microfono'));
    const calibrationBody = el('div', 'analysis-calibration-body'), calFile = el('input'); calFile.type = 'file'; calFile.accept = '.txt,.csv,.cal'; calFile.hidden = true;
    calFile.addEventListener('change', () => { const file = calFile.files?.[0]; calFile.value = ''; if (file) importCalibration(file); });
    refs.profile = el('p', 'analysis-hint'); refs.calEnabled = el('input'); refs.calEnabled.type = 'checkbox'; refs.calEnabled.addEventListener('change', () => changeConfiguration({ calibrationEnabled: refs.calEnabled.checked }));
    const enabled = el('label', 'analysis-check'); enabled.append(refs.calEnabled, el('span', '', 'Compensa la risposta del microfono'));
    refs.calPlot = graph('calibration', 'Risposta del microfono', 'dB');
    calibrationBody.append(button('Importa TXT / CSV', () => calFile.click()), calFile, refs.profile, enabled, refs.calPlot, el('p', 'analysis-hint', 'Il file descrive la risposta del microfono. Gain e fase vengono compensati dal motore.'));
    refs.spl = el('strong', 'analysis-spl', 'SPL non tarato'); refs.splKnown = numeric(94, 40, 140, .1, () => {});
    const knownRow = el('div', 'analysis-spl-known'); knownRow.append(label('Calibratore · dB', refs.splKnown), button('94', () => { refs.splKnown.value = '94'; }), button('114', () => { refs.splKnown.value = '114'; }));
    refs.splCal = button('Calibra SPL', calibrateSpl); refs.splReset = button('Rimuovi taratura', () => action(async () => { invalidateSpl('', false); await applyConfiguration(config); }));
    refs.splHint = el('p', 'analysis-hint'); calibrationBody.append(refs.spl, knownRow, refs.splCal, refs.splReset, refs.splHint);
    calibration.append(calibrationBody); calibration.addEventListener('toggle', () => { calibrationDirty = true; drawSoon(); });
    sidebar.append(snapshots, calibration); workspace.append(display, sidebar);
    body.append(toolbar, refs.notice, sources, settings, workspace);
    const footer = el('footer', 'analysis-footer', 'Misura manuale · la chiusura ferma soltanto l’analisi · il ritardo del misuratore non modifica le matrici.');
    dialog.append(header, body, footer); document.body.append(dialog);
    fillUsbOptions(); renderTraces(); renderCalibration(); setView(view);
    dialog.addEventListener('close', didClose);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    let drag = null;
    header.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button,input,select')) return;
      const rect = dialog.getBoundingClientRect(); drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      dialog.style.left = rect.left + 'px'; dialog.style.top = rect.top + 'px'; dialog.style.transform = 'none'; header.setPointerCapture?.(event.pointerId);
    });
    header.addEventListener('pointermove', event => {
      if (!drag) return;
      dialog.style.left = Math.max(0, Math.min(window.innerWidth - dialog.offsetWidth, drag.left + event.clientX - drag.x)) + 'px';
      dialog.style.top = Math.max(0, Math.min(window.innerHeight - 60, drag.top + event.clientY - drag.y)) + 'px';
    });
    header.addEventListener('pointerup', () => { drag = null; }); header.addEventListener('pointercancel', () => { drag = null; });
    if (typeof ResizeObserver === 'function') { const observer = new ResizeObserver(() => { calibrationDirty = true; drawSoon(); }); observer.observe(dialog); }
  }
  function didClose() {
    epoch++; clearTimeout(pollTimer); pollTimer = null; stableLevels = [];
    if (available() && hostReady) rpc('stopAnalysis').then(accept).catch(() => {});
    priorFocus?.isConnected && priorFocus.focus?.({ preventScroll: true }); persist();
  }
  function close() { if (dialog?.open) dialog.close(); }
  function open() {
    if (!dialog) build();
    if (dialog.open) { dialog.focus(); return; }
    window.SculptUI?.close?.(); window.SculptEditor?.close?.();
    priorFocus = document.activeElement; epoch++; hostError = ''; hostReady = false;
    dialog.style.left = ''; dialog.style.top = ''; dialog.style.transform = '';
    dialog.show(); fillNamedOptions(); syncSettings(); drawSoon();
    if (busy || routeInvalidating) {
      const turn = epoch;
      const retry = () => { if (!dialog?.open || turn !== epoch) return; if (busy || routeInvalidating) setTimeout(retry, 50); else initialise(); };
      setTimeout(retry, 50);
    } else initialise();
  }
  load();
  window.SculptAnalysis = Object.freeze({ open, close, isOpen: () => !!dialog?.open });
  window.addEventListener('sculpt-live-state', checkRouting);
  window.addEventListener('sculpt-vst-state', () => { if (dialog?.open) { const state = window.SculptVst?.snapshot?.(); if (state) acceptDevice(state); } });
  window.addEventListener('resize', () => { if (dialog?.open) { dialog.style.left = ''; dialog.style.top = ''; dialog.style.transform = ''; calibrationDirty = true; drawSoon(); } });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !dialog?.open || event.defaultPrevented) return;
    const active = document.activeElement?.closest?.('dialog'); if (active && active !== dialog) return;
    event.preventDefault(); event.stopPropagation(); close();
  });
  window.SculptDesktop?.addListener?.('analysis', action => { if (action === 'open' || action?.action === 'open') open(); }).catch?.(() => {});
})();
