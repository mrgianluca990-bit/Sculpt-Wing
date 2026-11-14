(() => {
  'use strict';

  // Native WING paths: Remote Protocols 3.1.2-a, W-LIVE / USB / Show Control.
  // This module owns presentation only; no local transport/scene state is simulated.
  const getLive = () => window.SculptLive;
  const getUI = () => window.SculptUI;
  const sections = new Set(['recorder', 'scenes', 'setup']);
  const units = { 1: 'dB', 2: '%', 3: 'ms', 4: 'Hz', 5: 'm', 6: 's', 7: 'oct' };
  const LIB = '/$ctl/lib';
  const messageOf = error => error?.message || String(error);
  const plain = value => value === undefined || value === null ? '—' : String(value);

  function installStyle() {
    if (document.getElementById('sculpt-live-pages-style')) return;
    const style = document.createElement('style');
    style.id = 'sculpt-live-pages-style';
    style.textContent = [
      '.live-pages{--lp-accent:#ed657c;min-width:0}',
      '.live-pages .lp-toolbar,.live-pages .lp-transport{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 14px}',
      '.live-pages .lp-toolbar>p{flex:1;min-width:170px;margin:0}',
      '.live-pages .lp-message{font-size:12px;line-height:1.55;color:#b5a7b3;overflow-wrap:anywhere}',
      '.live-pages .lp-message[data-state=error]{color:#ff9eb1}',
      '.live-pages .lp-message[data-state=busy]{color:#f0c891}',
      '.live-pages .lp-tag{font:700 9px/1.4 inherit;letter-spacing:1.4px;color:#dd91a3}',
      '.live-pages .lp-display{padding:18px;background:linear-gradient(145deg,#15131a,#21151e);border:1px solid #56303f;border-radius:8px;margin:3px 0 16px;overflow:hidden}',
      '.live-pages .lp-display-top{display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.live-pages .lp-state{font-size:12px;font-weight:800;letter-spacing:1.3px;color:#c6bac8}',
      '.live-pages .lp-state[data-state=REC]{color:#ff758d}',
      '.live-pages .lp-state[data-state=PLAY]{color:#a6d9b5}',
      '.live-pages .lp-state[data-state=ERROR]{color:#ffb3a6}',
      '.live-pages .lp-clock{display:block;font:500 clamp(30px,6.5vw,54px)/1.15 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:-1.5px;color:#f1c0cc;margin:20px 0 12px;overflow-wrap:anywhere}',
      '.live-pages .lp-media{display:block;font-size:13px;font-weight:600;color:#f2e6ef;overflow-wrap:anywhere}',
      '.live-pages .lp-transport>.desk-button{flex:1;min-width:76px;min-height:48px}',
      '.live-pages .lp-record{color:#ffd5de;border-color:#ad425b;background:linear-gradient(#6b2438,#3b1724)}',
      '.live-pages .lp-values{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:13px;margin:12px 0}',
      '.live-pages .lp-value{min-width:0;display:flex;flex-direction:column;gap:5px}',
      '.live-pages .lp-value small{font-size:10px;color:#a18e9f}',
      '.live-pages .lp-value strong{font:500 13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#e1ceda;overflow-wrap:anywhere}',
      '.live-pages .lp-control-row{display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin:12px 0}',
      '.live-pages .lp-control-row>.desk-field{flex:1;min-width:140px;margin:0}',
      '.live-pages .lp-control-row>.desk-button{min-height:39px}',
      '.live-pages .lp-raw{white-space:pre-wrap;overflow-wrap:anywhere;max-height:130px;overflow:auto;padding:11px;margin:9px 0;border:1px solid #3b2b39;border-radius:5px;background:#151218;font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#c1afbf}',
      '.live-pages .lp-explore{width:100%;text-align:left;margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:14px}',
      '.live-pages .lp-explore small{color:#b08294;font:10px ui-monospace,monospace}',
      '.live-pages .lp-scene-name{font-size:clamp(20px,4vw,32px);font-weight:650;line-height:1.3;overflow-wrap:anywhere;color:#f6dbe4;margin:15px 0 10px}',
      '.live-pages .lp-scene-list{display:grid;gap:5px;max-height:48vh;overflow:auto}',
      '.live-pages .lp-scene-row{display:grid;grid-template-columns:45px minmax(0,1fr) auto;gap:10px;text-align:left;align-items:center;padding:11px}',
      '.live-pages .lp-scene-row[aria-pressed=true]{border-color:#ed657c;background:#3b202c}',
      '.live-pages .lp-scene-row strong,.live-pages .lp-scene-row small{display:block;overflow-wrap:anywhere}.live-pages .lp-scene-row small{color:#bba5b5;font-size:11px}',
      '.live-pages .lp-connect{max-width:650px;margin:25px auto}',
      '.live-pages button:disabled,.live-pages input:disabled,.live-pages select:disabled{opacity:.45;cursor:not-allowed}',
      '@media(max-width:450px){.live-pages .lp-display{padding:14px}.live-pages .lp-transport{gap:6px}.live-pages .lp-transport>.desk-button{min-width:65px;font-size:11px;padding:9px 8px}.live-pages .lp-values{grid-template-columns:repeat(2,minmax(0,1fr))}.live-pages .lp-clock{font-size:38px}.live-pages .lp-toolbar>.desk-button{font-size:11px}}'
    ].join('\n');
    document.head.append(style);
  }

  function render(id, container, args = {}) {
    if (!sections.has(id) || !getLive()?.isLive?.() || !getUI()) return null;
    installStyle();
    const U = getUI(), L = getLive();
    const shell = U.el('div', 'live-pages'), toolbar = U.el('div', 'lp-toolbar');
    const status = U.el('p', 'lp-message', 'Lettura del banco…');
    status.setAttribute('role', 'status');
    const body = U.el('div');
    const refreshButton = U.button('↻ Aggiorna', () => { refresh(undefined, false); });
    toolbar.append(status, refreshButton); shell.append(toolbar, body); container.append(shell);
    let alive = true, generation = 0, connectedView = null, selected = args?.tab || args?.id || 'sdA';
    if (selected === 'USBrec') selected = 'usb';
    if (!['sdA', 'sdB', 'usb', 'player'].includes(selected)) selected = 'sdA';
    let bindings = [], readPaths = [], pollPaths = [], statePath = null;
    let busy = false, reading = false, pendingRead = null, timer = null, scheduled = false;
    let readErrors = [];
    let actionEpoch = null, sceneCatalog = { show: null, entries: [], error: '', loading: false }, sceneChoice = null;

    const read = path => L.hasValue(path) ? L.value(path) : undefined;
    const node = (tag, cls, text) => U.el(tag, cls, text);
    const note = text => node('p', 'desk-note', text);
    const row = (...children) => { const result = node('div', 'lp-control-row'); result.append(...children.filter(Boolean)); return result; };
    const bind = fn => { bindings.push(fn); fn(); };
    const actual = path => L.isConnected() ? read(path) : undefined;
    const can = (path, value, extra = true) => {
      const meta = L.metadata(path);
      if (!alive || !L.isConnected() || !L.isWritable() || busy || !extra || !meta || meta.type === 0 || meta.readOnly) return false;
      if (value === undefined) return true;
      if ((meta.type === 5 || meta.type === 6) && !meta.items?.some(item => item.value === value)) return false;
      if (typeof value === 'number' && (!Number.isFinite(value) || meta.min !== undefined && value < meta.min || meta.max !== undefined && value > meta.max)) return false;
      return true;
    };
    function showMessage(text, state = '') {
      status.textContent = text; status.dataset.state = state;
    }
    function formatTime(path, milliseconds = false) {
      const value = actual(path);
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
      const unit = L.metadata(path)?.unit;
      if (!milliseconds && unit !== 3 && unit !== 6) return value.toLocaleString('it-IT', { maximumFractionDigits: 3 });
      const seconds = Math.max(0, Math.floor(value / (milliseconds || unit === 3 ? 1000 : 1)));
      const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
      return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
    }
    function valueCard(label, path, format) {
      const wrap = node('div', 'lp-value'), text = node('strong');
      wrap.append(node('small', '', label), text);
      bind(() => { text.textContent = format ? format() : plain(actual(path)); });
      return wrap;
    }
    function values(...items) { const wrap = node('div', 'lp-values'); wrap.append(...items); return wrap; }
    function explorer(label, path) {
      const b = U.button('', () => L.openExplorer(path), 'lp-explore');
      b.append(node('span', '', label), node('small', '', '›'));
      return b;
    }
    function rawCard(title, path, owner) {
      const raw = node('pre', 'lp-raw');
      bind(() => { raw.textContent = plain(actual(path)); });
      return U.card(title, raw, note('Dato ricevuto dal banco. Un elenco può essere restituito solo in parte.'), explorer('Apri i parametri del banco', owner));
    }
    function actionButton(label, path, value, options = {}) {
      const button = U.button(label, () => perform(label, async token => {
        await write(path, value, options.trigger !== false, token);
      }), options.className || '');
      bind(() => {
        button.disabled = !can(path, value, options.allowed ? options.allowed() : true);
        button.title = !L.metadata(path) ? 'Parametro non disponibile o non ancora letto.' : !L.isWritable() ? 'Abilita il controllo WING dalla connessione.' : '';
      });
      return button;
    }
    function selection(label, path) {
      const input = node('select', 'desk-input');
      input.setAttribute('aria-label', label);
      let signature = '';
      bind(() => {
        const meta = L.metadata(path), choices = meta?.items || [];
        const next = JSON.stringify(choices);
        if (next !== signature || !input.options.length) {
          signature = next; input.replaceChildren();
          if (!choices.length) { const option = node('option', '', 'Non disponibile'); option.value = ''; input.append(option); }
          for (const choice of choices) { const option = node('option', '', choice.label || choice.value); option.value = String(choice.value); input.append(option); }
        }
        const current = actual(path);
        if (current !== undefined) input.value = String(current);
        input.disabled = !can(path) || !choices.length || current === undefined;
      });
      input.addEventListener('change', () => {
        const meta = L.metadata(path);
        const item = meta?.items?.find(option => String(option.value) === input.value);
        if (item) perform(label, token => write(path, item.value, false, token));
      });
      return U.field(label, input);
    }
    function inputField(label, path, opts = {}) {
      const input = node('input', 'desk-input');
      input.type = opts.text ? 'text' : 'number'; input.autocomplete = 'off';
      input.setAttribute('aria-label', label);
      if (!opts.text) { input.inputMode = 'numeric'; input.step = '1'; }
      let dirty = false;
      input.addEventListener('input', () => { dirty = true; });
      bind(() => {
        const meta = L.metadata(path);
        const textMode = opts.text || meta?.type === 7;
        input.type = textMode ? 'text' : 'number'; input.inputMode = textMode ? 'text' : 'numeric';
        if (!dirty) input.value = actual(path) === undefined ? '' : String(actual(path));
        if (!opts.text) {
          if (meta?.min !== undefined) input.min = String(meta.min);
          if (meta?.max !== undefined) input.max = String(meta.max);
        }
        input.disabled = !can(path);
      });
      return { input, wrap: U.field(label, input), reset: () => { dirty = false; }, value: () => opts.text ? input.value : input.valueAsNumber };
    }
    function parameterInput(label, path) {
      const field = inputField(label, path, { text: L.metadata(path)?.type === 7 });
      const apply = U.button('Applica', () => perform(label, token => {
        const meta = L.metadata(path), value = meta?.type === 7 ? field.input.value : field.input.valueAsNumber;
        return write(path, value, false, token);
      }, field.reset));
      bind(() => { apply.disabled = !can(path); });
      return row(field.wrap, apply);
    }
    async function write(path, value, trigger, token) {
      if (!alive || token !== generation) throw new Error('Pagina cambiata: operazione interrotta.');
      if (actionEpoch !== null && L.sessionToken?.() !== actionEpoch) throw new Error('La sessione WING è cambiata: comando interrotto.');
      if (!L.isConnected() || !L.isWritable()) throw new Error('Controllo WING non disponibile.');
      const meta = L.metadata(path);
      if (!meta || meta.readOnly || meta.type === 0) throw new Error('Parametro non disponibile sul banco.');
      await L.write(path, value, { trigger });
      if (!alive || token !== generation) throw new Error('Pagina cambiata: operazione interrotta.');
      if (actionEpoch !== null && L.sessionToken?.() !== actionEpoch) throw new Error('La sessione WING è cambiata: comando interrotto.');
    }
    async function perform(label, task, completed) {
      if (busy || !alive || !L.isConnected() || !L.isWritable()) return;
      const token = generation;
      actionEpoch = L.sessionToken?.() ?? null;
      busy = true; showMessage('Invio ' + label + '…', 'busy'); paintBindings();
      try {
        if (pendingRead) await pendingRead;
        if (!alive || generation !== token) return;
        await task(token);
        if (!alive || generation !== token) return;
        await refresh(undefined, true);
        if (!alive || generation !== token) return;
        const state = statePath ? actual(statePath) : undefined;
        showMessage(label + ' inviato.' + (state !== undefined ? ' Stato letto: ' + state + '.' : ' Valori riletti dal banco.') + (readErrors.length ? ' Lettura incompleta: ' + readErrors[0] : ''), readErrors.length ? 'error' : '');
      } catch (error) {
        if (alive && generation === token) {
          try { await refresh(undefined, true); } catch {}
          showMessage(messageOf(error), 'error');
        }
      } finally {
        busy = false; completed?.();
        if (alive && generation === token) paintBindings();
      }
    }
    async function refresh(paths, silent = false) {
      if (!alive || !L.isConnected()) return;
      if (pendingRead) return pendingRead;
      const token = generation, targets = [...new Set(paths || readPaths)];
      const epoch = L.sessionToken?.(), isCurrent = () => alive && generation === token && L.isConnected() && (epoch === undefined || L.sessionToken?.() === epoch);
      reading = true; readErrors = [];
      if (!silent) showMessage('Lettura degli stati WING…', 'busy');
      paintBindings();
      const task = (async () => {
        const catalogRefresh = id === 'scenes' && !paths;
        let catalogShow;
        if (catalogRefresh) {
          sceneCatalog.loading = true; paintBindings();
          try {
            await L.readNode(LIB + '/$actshow', { force: true });
            if (!isCurrent()) return;
            catalogShow = actual(LIB + '/$actshow');
            const definitions = await L.listNode(LIB, { refresh: true });
            if (!isCurrent()) return;
            const meta = definitions.find(item => item.path === LIB + '/$scenes' || item.name === '$scenes');
            if (!Array.isArray(meta?.items)) throw new Error('Il firmware non ha fornito la definizione completa dell’elenco scene.');
            if (meta.items.length > 4096) throw new Error('Il catalogo supera il limite di 4096 scene.');
            const entries = meta.items.map((item, index) => {
              const name = typeof item.value === 'string' ? item.value : item.label;
              if (typeof name !== 'string' || name.length > 2048) throw new Error('Definizione di scena non valida.');
              return { index: index + 1, name, label: item.label || name };
            });
            sceneCatalog = { show: catalogShow, entries, error: '', loading: true };
          } catch (error) { sceneCatalog = { show: catalogShow, entries: [], error: messageOf(error), loading: true }; readErrors.push(messageOf(error)); }
        }
        for (const path of targets) {
          if (!isCurrent()) return;
          try { await L.readNode(path, { force: true }); }
          catch (error) { readErrors.push(messageOf(error)); }
        }
        if (!isCurrent()) return;
        if (catalogRefresh && catalogShow !== actual(LIB + '/$actshow')) {
          sceneCatalog = { show: null, entries: [], error: 'Lo Show è cambiato durante la lettura. Premi Aggiorna per leggerne le scene.', loading: false };
          readErrors.push(sceneCatalog.error);
        }
        if (catalogRefresh) sceneCatalog.loading = false;
        if (!silent) showMessage(readErrors.length ? 'Lettura incompleta: ' + readErrors[0] : 'Stati letti dalla WING.', readErrors.length ? 'error' : '');
      })();
      pendingRead = task;
      try { await task; } finally {
        if (pendingRead === task) pendingRead = null;
        reading = false;
        if (id === 'scenes') sceneCatalog.loading = false;
        if (alive && generation === token) paintBindings();
      }
    }
    function paintBindings() {
      if (!alive) return;
      const connected = L.isConnected();
      if (connectedView !== connected) { build(); return; }
      for (const fn of bindings) fn();
      refreshButton.disabled = !connected || reading || busy || !readPaths.length;
    }
    function schedulePaint() {
      if (scheduled || !alive) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; paintBindings(); });
    }
    function transportDisplay(title, state, time, file, milliseconds = false) {
      const display = node('div', 'lp-display'), top = node('div', 'lp-display-top');
      const stateNode = node('strong', 'lp-state'), clock = node('time', 'lp-clock'), media = node('span', 'lp-media');
      top.append(node('span', 'lp-tag', title), stateNode); display.append(top, clock, media);
      bind(() => {
        const current = actual(state);
        stateNode.textContent = plain(current); stateNode.dataset.state = current || '';
        clock.textContent = formatTime(time, milliseconds);
        clock.removeAttribute('datetime');
        media.textContent = plain(actual(file));
      });
      return display;
    }
    function recorders() {
      const tabs = U.tabs([{ id: 'sdA', label: 'SD A' }, { id: 'sdB', label: 'SD B' }, { id: 'usb', label: 'USB REC' }, { id: 'player', label: 'PLAYER' }], selected, next => {
        if (busy) return;
        selected = next; build();
      });
      bind(() => { for (const button of tabs.querySelectorAll('button')) button.disabled = busy; });
      body.append(tabs);
      if (selected === 'sdA' || selected === 'sdB') sdRecorder(selected === 'sdA' ? 1 : 2);
      else if (selected === 'usb') usbRecorder();
      else usbPlayer();
    }
    function sdRecorder(index) {
      const base = '/cards/wlive/' + index, stat = base + '/$stat', ctl = base + '/$ctl', cfg = base + '/cfg';
      readPaths = ['/cards/wlive', stat, ctl, cfg];
      pollPaths = [stat + '/state', stat + '/etime', stat + '/sdfree'];
      statePath = stat + '/state';
      const transport = node('div', 'lp-transport');
      transport.append(
        actionButton('■ Stop', ctl + '/control', 'STOP'),
        actionButton('Ⅱ Pausa', ctl + '/control', 'PPAUSE'),
        actionButton('▶ Play', ctl + '/control', 'PLAY'),
        actionButton('● REC', ctl + '/control', 'REC', { className: 'lp-record' })
      );
      const deck = U.card('WING-LIVE · SD ' + (index === 1 ? 'A' : 'B'),
        transportDisplay('WING-LIVE', statePath, stat + '/etime', stat + '/sdstate', true), transport,
        values(valueCard('Spazio libero · tempo', stat + '/sdfree', () => formatTime(stat + '/sdfree', true)),
          valueCard('Dimensione SD · GB', stat + '/sdsize'), valueCard('Sessione attiva', stat + '/sessionpos'),
          valueCard('Tracce', stat + '/tracks'), valueCard('Sample rate · kHz', stat + '/rate'), valueCard('Sessioni', stat + '/sessions')),
        note('Il tempo e lo stato provengono dal registratore del banco.'));
      const settings = U.card('REGISTRAZIONE', selection('Tracce registrate', cfg + '/rectracks'),
        selection('Modo playback', cfg + '/playmode'), selection('Collegamento SD A / B', '/cards/wlive/sdlink'),
        parameterInput('Nome sessione · in Stop', ctl + '/namesession'));
      const input = inputField('Indice sessione WING', ctl + '/opensession');
      const open = U.button('Carica sessione', () => perform('Carica sessione', token => write(ctl + '/opensession', input.value(), true, token), input.reset));
      bind(() => { open.disabled = !can(ctl + '/opensession'); });
      const sessions = U.card('SESSIONI E MARKER', row(input.wrap, open),
        values(valueCard('Marker', stat + '/markers'), valueCard('Marker attivo', stat + '/markerpos')),
        actionButton('+ Marker', ctl + '/setmarker', 1),
        explorer('Tutti i parametri WING-LIVE', base));
      const error = node('p', 'lp-message');
      bind(() => { const text = actual(stat + '/errormessage'); error.textContent = text ? 'WING-LIVE: ' + text : ''; error.hidden = !text; error.dataset.state = 'error'; });
      deck.append(error);
      body.append(U.grid(deck, settings), U.grid(sessions, rawCard('NOMI SESSIONI · DATO RICEVUTO', stat + '/snamelist', stat)));
    }
    function usbRecorder() {
      const base = '/rec'; readPaths = [base]; pollPaths = [base + '/$actstate', base + '/$time']; statePath = base + '/$actstate';
      const transport = node('div', 'lp-transport');
      transport.append(actionButton('■ Stop', base + '/$action', 'STOP'), actionButton('Ⅱ Pausa', base + '/$action', 'PAUSE'),
        actionButton('● REC', base + '/$action', 'REC', { className: 'lp-record' }));
      const clockUnit = node('p', 'desk-note');
      bind(() => { const unit = L.metadata(base + '/$time')?.unit; clockUnit.textContent = unit === 3 || unit === 6 ? 'Tempo letto dalla WING.' : 'Tempo restituito dalla WING · ' + (units[unit] || 'valore nativo'); });
      body.append(U.grid(
        U.card('USB RECORDER', transportDisplay('REGISTRAZIONE USB', statePath, base + '/$time', base + '/$actfile'), clockUnit, transport,
          actionButton('Nuovo file', base + '/$action', 'NEWFILE')),
        U.card('FORMATO E DESTINAZIONE', selection('Risoluzione', base + '/resolution'), selection('Canali registrati', base + '/channels'),
          parameterInput('Percorso / nome file', base + '/path'), explorer('Tutti i parametri USB Recorder', base))
      ));
    }
    function usbPlayer() {
      const base = '/play'; readPaths = [base]; pollPaths = [base + '/$actstate', base + '/$pos']; statePath = base + '/$actstate';
      const transport = node('div', 'lp-transport');
      transport.append(actionButton('■ Stop', base + '/$action', 'STOP'), actionButton('Ⅱ Pausa', base + '/$action', 'PAUSE'), actionButton('▶ Play', base + '/$action', 'PLAY'));
      const repeat = U.button('Repeat', () => perform('Repeat', token => write(base + '/repeat', actual(base + '/repeat') === 1 ? 0 : 1, false, token)));
      bind(() => { repeat.disabled = !can(base + '/repeat') || actual(base + '/repeat') === undefined; repeat.setAttribute('aria-pressed', String(actual(base + '/repeat') === 1)); repeat.classList.toggle('is-on', actual(base + '/repeat') === 1); });
      const file = inputField('File USB · percorso completo', base + '/$playfile', { text: true });
      const play = U.button('Riproduci file', () => perform('PLAYFILE', async token => {
        await write(base + '/$playfile', file.value(), false, token);
        await write(base + '/$action', 'PLAYFILE', true, token);
      }, file.reset));
      bind(() => { play.disabled = !can(base + '/$playfile') || !can(base + '/$action', 'PLAYFILE'); });
      body.append(U.grid(
        U.card('USB PLAYER', transportDisplay('PLAYBACK USB', statePath, base + '/$pos', base + '/$actfile'), transport,
          row(actionButton('‹ Precedente', base + '/$action', 'PREV'), actionButton('Successivo ›', base + '/$action', 'NEXT'), repeat),
          values(valueCard('Durata', base + '/$total', () => formatTime(base + '/$total')), valueCard('Formato', base + '/$format'), valueCard('Titolo', base + '/$song'), valueCard('Artista', base + '/$artist'))),
        U.card('SORGENTE', row(file.wrap, play), values(valueCard('Playlist attiva', base + '/$actlist'), valueCard('Indice attivo', base + '/$actidx')),
          explorer('Tutti i parametri USB Player', base))
      ), rawCard('PLAYLIST · DATO RICEVUTO', base + '/$songs', base));
    }
    function scenes() {
      // readTree(depth:0) limits metadata discovery, not the data response.
      // Querying the whole library can also read storage/catalogue branches and
      // hold the single WING TCP request until the control deadline expires.
      readPaths = ['$actshow', '$active', '$actidx', '$activeid', '$actionidx', '$action'].map(name => LIB + '/' + name);
      pollPaths = [LIB + '/$actidx', LIB + '/$active', LIB + '/$actshow']; statePath = LIB + '/$active';
      const display = node('div', 'lp-display'), show = node('div', 'lp-tag'), activeScene = node('div', 'lp-scene-name');
      display.append(show, activeScene, values(valueCard('Indice attivo', LIB + '/$actidx'), valueCard('Tag attivo', LIB + '/$activeid')));
      bind(() => { show.textContent = plain(actual(LIB + '/$actshow')); activeScene.textContent = plain(actual(LIB + '/$active')); });
      const opened = () => typeof actual(LIB + '/$actshow') === 'string' && actual(LIB + '/$actshow').length > 0;
      const input = inputField('Indice scena WING · 0 = selezione del banco', LIB + '/$actionidx');
      async function sameShow(expected, token) {
        if (!alive || token !== generation || actionEpoch !== null && L.sessionToken?.() !== actionEpoch) throw new Error('La sessione WING è cambiata: richiamo interrotto.');
        await L.readNode(LIB + '/$actshow', { force: true });
        if (!alive || token !== generation || !L.isConnected() || actionEpoch !== null && L.sessionToken?.() !== actionEpoch) throw new Error('La sessione WING è cambiata: richiamo interrotto.');
        if (!expected || actual(LIB + '/$actshow') !== expected) throw new Error('Lo Show aperto è cambiato: aggiorna l’elenco prima del richiamo.');
      }
      async function showAction(token, expected, index, command) {
        await sameShow(expected, token);
        await write(LIB + '/$actionidx', index, false, token);
        await sameShow(expected, token);
        await write(LIB + '/$action', command, true, token);
      }
      const go = U.button('GO', () => perform('GO', async token => {
        await showAction(token, actual(LIB + '/$actshow'), input.value(), 'GO');
      }, input.reset), 'desk-primary sys-go');
      bind(() => { go.disabled = !can(LIB + '/$actionidx', undefined, opened()) || !can(LIB + '/$action', 'GO', opened()); });
      const navigate = (label, command) => {
        const button = U.button(label, () => perform(command, async token => {
          // Documented special case: zero lets NEXT/PREV + GO follow the desk selection.
          await showAction(token, actual(LIB + '/$actshow'), 0, command);
        }, input.reset));
        bind(() => { button.disabled = !can(LIB + '/$actionidx', 0, opened()) || !can(LIB + '/$action', command, opened()); });
        return button;
      };
      const openedNote = note('');
      bind(() => { openedNote.textContent = opened() ? 'GO richiama l’indice indicato. Con indice 0 usa la selezione del banco; NEXT / PREV spostano la selezione, GO NEXT / GO PREV richiamano subito.' : 'Apri uno Show sul banco per usare i richiami. I campi qui mostrati arrivano dalla WING.'; });
      const list = node('div', 'lp-scene-list'), catalogNote = note(''), catalogTitle = node('h3'), selectedName = node('p', 'desk-note');
      const search = node('input', 'desk-input'); search.type = 'search'; search.placeholder = 'Cerca nello Show'; search.setAttribute('aria-label', 'Cerca scene nello Show');
      let listSignature = '';
      const recall = U.button('Richiama selezionata', () => {
        const chosen = sceneChoice, expected = sceneCatalog.show;
        if (!chosen) return;
        perform('Richiamo ' + chosen.name, async token => {
          await sameShow(expected, token);
          // The complete node definition is the ordered Show list (protocol
          // footnotes 25–28). Never infer a list by splitting a scalar string.
          const definitions = await L.listNode(LIB, { refresh: true });
          await sameShow(expected, token);
          const items = definitions.find(item => item.path === LIB + '/$scenes' || item.name === '$scenes')?.items;
          const item = items?.[chosen.index - 1], name = typeof item?.value === 'string' ? item.value : item?.label;
          if (name !== chosen.name) throw new Error('L’ordine o il nome delle scene è cambiato. Aggiorna e seleziona di nuovo la scena.');
          for (const path of [LIB + '/$actionidx', LIB + '/$action']) await L.readNode(path, { force: true });
          await showAction(token, expected, chosen.index, 'GO');
        });
      }, 'desk-primary');
      bind(() => {
        const stale = sceneCatalog.show !== actual(LIB + '/$actshow'), entries = stale ? [] : sceneCatalog.entries;
        const signature = JSON.stringify([entries, sceneCatalog.loading, stale, search.value, actual(LIB + '/$actidx'), sceneChoice?.index, busy, reading]);
        catalogTitle.textContent = 'SCENE DELLO SHOW · ' + entries.length;
        catalogNote.textContent = !opened() ? 'Apri uno Show sulla WING per leggerne tutte le voci.' : sceneCatalog.loading ? 'Lettura della definizione completa dello Show…' : stale ? 'Lo Show è cambiato: premi Aggiorna per leggerne le scene.' : sceneCatalog.error || 'Elenco completo dello Show aperto. Ogni voce può richiamare Snap, Snippet, Preset, Audio clip o una loro combinazione. Gli altri Show e i file fuori dallo Show si aprono sulla WING.';
        const valid = !stale && sceneChoice && entries.some(item => item.index === sceneChoice.index && item.name === sceneChoice.name);
        if (!valid) sceneChoice = null;
        selectedName.textContent = valid ? 'Selezionata: ' + sceneChoice.index + ' · ' + sceneChoice.name : 'Seleziona una scena per richiamarla.';
        recall.disabled = !valid || sceneCatalog.loading || reading || !can(LIB + '/$action', 'GO', opened()) || !can(LIB + '/$actionidx', sceneChoice?.index);
        if (signature === listSignature) return;
        listSignature = signature; list.replaceChildren();
        const filter = search.value.trim().toLocaleLowerCase();
        for (const entry of entries) {
          if (filter && !entry.name.toLocaleLowerCase().includes(filter)) continue;
          const b = U.button('', () => { sceneChoice = { ...entry }; paintBindings(); }, 'lp-scene-row'), name = node('span'), parts = entry.name.split('~');
          name.append(node('strong', '', parts[0])); if (parts.length > 1) name.append(node('small', '', parts.slice(1).join('~')));
          b.append(node('span', '', entry.index), name, node('small', '', actual(LIB + '/$actidx') === entry.index ? 'ATTIVA' : ''));
          b.setAttribute('aria-pressed', String(sceneChoice?.index === entry.index)); b.dataset.sceneIndex = entry.index; b.disabled = busy || reading;
          list.append(b);
        }
        if (!list.children.length) list.append(note(filter ? 'Nessuna scena corrisponde alla ricerca.' : 'Nessuna voce disponibile.'));
      });
      search.addEventListener('input', paintBindings);
      const catalog = U.card('', catalogTitle, catalogNote, search, list, selectedName, recall);
      body.append(U.grid(
        U.card('SHOW DEL BANCO', display, openedNote, row(input.wrap, go),
          row(navigate('‹ PREV', 'PREV'), navigate('NEXT ›', 'NEXT')),
          row(navigate('GO PREV', 'GOPREV'), navigate('GO NEXT', 'GONEXT'))),
        U.card('STATO LETTO', values(valueCard('Show aperto', LIB + '/$actshow'), valueCard('Scena attiva', LIB + '/$active'),
          valueCard('Indice comando', LIB + '/$actionidx')), note('Indice attivo 0: nessuna scena dello Show caricata.'),
          explorer('Esplora Show / Scene / Snap', LIB))
      ), catalog);
    }
    function setup() {
      readPaths = []; pollPaths = []; statePath = null;
      const info = U.card('WING COLLEGATA'), fields = node('div', 'lp-values');
      for (const [label, key] of [['Nome', 'name'], ['Modello', 'model'], ['Firmware', 'firmware'], ['Indirizzo IP', 'host']]) {
        const field = node('div', 'lp-value'), value = node('strong'); field.append(node('small', '', label), value); fields.append(field);
        bind(() => { value.textContent = plain(L.snapshot()?.info?.[key]); });
      }
      info.append(fields, note('Identità ricevuta dalla console. Le impostazioni disponibili seguono il firmware collegato.'), U.button('Connessione', () => U.open('connection')));
      const groups = U.card('PARAMETRI DEL BANCO',
        explorer('Audio, monitor e configurazione', '/cfg'), explorer('Ingressi, uscite e routing', '/io'),
        explorer('Superficie, controlli e Show', '/$ctl'), explorer('Schede e WING-LIVE', '/cards'));
      body.append(U.grid(info, groups));
      showMessage('Identità della connessione WING.');
    }
    function build() {
      if (!alive) return;
      ++generation; bindings = []; readPaths = []; pollPaths = []; statePath = null; body.replaceChildren();
      if (id === 'scenes') { sceneChoice = null; sceneCatalog = { show: null, entries: [], error: '', loading: false }; }
      connectedView = L.isConnected();
      if (!connectedView) {
        const snap = L.snapshot?.() || {};
        body.append(U.card('COLLEGA LA WING', note(snap.error || 'Collega la console per leggere e comandare questa sezione.'), U.button('Apri connessione', () => U.open('connection'), 'desk-primary')));
        showMessage('WING non collegata.'); refreshButton.disabled = true; return;
      }
      if (id === 'recorder') recorders();
      else if (id === 'scenes') scenes();
      else setup();
      const token = generation;
      Promise.resolve(pendingRead).catch(() => {}).then(() => { if (alive && generation === token && readPaths.length) refresh(undefined, false); });
      paintBindings();
    }
    function poll() {
      if (!alive) return;
      if (L.isConnected() && !busy && !reading && pollPaths.length) {
        const known = pollPaths.filter(path => L.metadata(path) && L.hasValue(path));
        if (known.length) refresh(known, true).catch(() => {});
      }
      timer = setTimeout(poll, 1500);
    }
    const unsubscribe = L.subscribe(schedulePaint);
    build(); timer = setTimeout(poll, 1500);
    return {
      handled: true,
      cleanup() {
        alive = false; ++generation; clearTimeout(timer); unsubscribe?.(); bindings = [];
      }
    };
  }
  /** Macro adapter: documented transport commands only, with fresh actual-state reads. */
  async function transport(id, command) {
    let steps, controls, status;
    if (id === 'sdA' || id === 'sdB') {
      const base = '/cards/wlive/' + (id === 'sdA' ? 1 : 2), ctl = base + '/$ctl';
      const commands = { record: 'REC', stop: 'STOP', play: 'PLAY', pause: 'PPAUSE' };
      if (Object.prototype.hasOwnProperty.call(commands, command)) {
        steps = [{ path: ctl + '/control', value: commands[command], trigger: true }];
      } else if (command === 'rewind') {
        // stime is effective only after the documented gotomarker 101 command.
        steps = [{ path: ctl + '/stime', value: 0, trigger: false }, { path: ctl + '/gotomarker', value: 101, trigger: true }];
      } else if (command === 'marker') {
        steps = [{ path: ctl + '/setmarker', value: 1, trigger: true }];
      } else return false;
      controls = ctl; status = base + '/$stat';
    } else if (id === 'usb') {
      const commands = { record: 'REC', stop: 'STOP', pause: 'PAUSE' };
      if (!Object.prototype.hasOwnProperty.call(commands, command)) return false;
      steps = [{ path: '/rec/$action', value: commands[command], trigger: true }];
      controls = status = '/rec';
    } else if (id === 'player') {
      const commands = { play: 'PLAY', stop: 'STOP', pause: 'PAUSE' };
      if (Object.prototype.hasOwnProperty.call(commands, command)) {
        steps = [{ path: '/play/$action', value: commands[command], trigger: true }];
      } else if (command === 'rewind') {
        steps = [{ path: '/play/$pos', value: 0, trigger: false }];
      } else return false;
      controls = status = '/play';
    } else return false;

    const L = getLive();
    const guard = () => {
      if (!L?.isLive?.() || !L.isConnected?.() || !L.isWritable?.()) throw new Error('La macro recorder richiede una WING collegata con controllo abilitato.');
    };
    guard();
    await L.readNode(controls, { force: true });
    guard();
    for (const step of steps) {
      const meta = L.metadata(step.path);
      if (!meta || meta.readOnly || meta.type === 0
        || ((meta.type === 5 || meta.type === 6) && !meta.items?.some(item => item.value === step.value))) {
        throw new Error('Comando recorder non disponibile nel firmware collegato.');
      }
      guard();
      await L.write(step.path, step.value, { trigger: step.trigger });
      guard();
    }
    await L.readNode(status, { force: true });
    guard();
    // Means dispatched and state refreshed; it is not an action-completion ACK.
    return true;
  }
  window.SculptLivePages = { render, transport };
})();
