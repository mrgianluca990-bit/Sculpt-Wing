(() => {
  'use strict';

  const TABS = [
    ['channel', 'Canale'], ['processing', 'Processo'], ['eq', 'EQ'],
    ['dynamics', 'Dinamica'], ['sends', 'Mandate'], ['groups', 'Gruppi']
  ];
  const PALETTE = [
    ['Rosso', '#ef414b'], ['Corallo', '#ef7277'], ['Ambra', '#d7ad62'],
    ['Verde', '#a2bc8b'], ['Blu', '#8c9dca'], ['Viola', '#b28ac8'],
    ['Grigio', '#99959b'], ['Bianco', '#e4e2dc']
  ];
  const GROUP_NAMES = { OFF: 'Non assegnata', LCL: 'Local', AUX: 'Aux analogico', A: 'AES50 A', B: 'AES50 B', C: 'AES50 C', SC: 'StageCONNECT', USB: 'USB', CRD: 'Card', MOD: 'Modulo / Dante', PLAY: 'USB Player', AES: 'AES/EBU', USR: 'User', OSC: 'Oscillatore', BUS: 'Bus', MAIN: 'Main', MTX: 'Matrice' };
  const TAP_INPUT = ['IN', 'FILT', '3', '4', '5', 'PFL', 'AFL', 'POST'];
  const TAP_OUTPUT = ['BUS', 'DYN', 'PFL', 'AFL', 'EQ', 'INS2'];
  const ORDER_LABELS = { gate: 'Gate', eq: 'EQ', dyn: 'Dynamics', insert: 'Insert' };
  const C = () => window.SculptController;
  const D = () => window.SculptDesk;
  const sourceStrip = () => C()?.getStrip(currentId);
  const channel = () => D()?.channel(currentId);
  const isInput = () => ['CH', 'AUX'].includes(sourceStrip()?.kind);
  const isChannel = () => sourceStrip()?.kind === 'CH';
  const label = item => `${item.kind === 'MAIN' ? 'MAIN' : item.kind} ${String(item.number).padStart(2, '0')}`;
  const fullLabel = item => `${label(item)} · ${item.name}`;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const db = value => value <= -89 ? '−∞' : `${value > 0 ? '+' : ''}${Number(value).toFixed(1).replace('-', '−')}`;
  const dec = (value, digits = 1) => Number(value).toFixed(digits).replace('-', '−');
  const clone = value => JSON.parse(JSON.stringify(value));
  const inputTap = id => TAP_INPUT.includes(D()?.channel(id)?.tap) ? D().channel(id).tap : 'PFL';

  let dialog, currentId = null, activeTab = 'channel', dynamicsBlock = 'dyn';
  let sendDirection = 'out', sendGroup = 'BUS', sendFilter = '';
  let panel, tabList, headerName, headerKind, headerDot, headerSof, headerSolo, headerRename;
  let renameFocusId = null;
  let footerStatus, previousFocus, unsubscribe, unsubscribeLive, rendering = false;
  let liveGate = { key: '', phase: 'idle', error: '', token: 0 }, observedLiveMode = '';
  let bindings = [], cleanups = [], structure = '';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, action, className = '', ariaLabel) {
    const node = el('button', className, text);
    node.type = 'button';
    if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
    if (action) node.addEventListener('click', action);
    return node;
  }
  function note(text) { return el('p', 'editor-note', text); }
  function grid(...children) { const node = el('div', 'editor-control-grid'); node.append(...children.filter(Boolean)); return node; }
  function module(title, ...children) {
    const box = el('section', 'editor-module');
    if (title) { const header = el('div', 'editor-module-heading'); header.append(el('h3', '', title)); box.append(header); }
    box.append(...children.filter(Boolean));
    return box;
  }
  function disclosure(title, ...children) {
    const box = el('details', 'editor-disclosure');
    box.append(el('summary', '', title), ...children.filter(Boolean));
    return box;
  }
  function bind(update) { bindings.push(update); update(); }
  function patch(changes) { C().updateStrip(currentId, changes); }
  function patchChannel(changes) { D().patchChannel(currentId, changes); }
  function patchObject(key, changes) { patchChannel({ [key]: { ...(channel()?.[key] || {}), ...changes } }); }
  function toast(message) { (window.SculptUI?.toast || C().toast)?.(message); }

  function toggle(text, get, set, options = {}) {
    const node = button('', () => set(!get()), `editor-toggle ${options.className || ''}`, options.ariaLabel || text);
    node.setAttribute('role', 'switch');
    const caption = el('span', 'editor-toggle-label', text);
    const lamp = el('i', 'editor-toggle-lamp'); lamp.setAttribute('aria-hidden', 'true');
    node.append(caption, lamp);
    bind(() => {
      const value = !!get();
      node.setAttribute('aria-checked', String(value));
      node.classList.toggle('editor-active', value);
      if (options.disabled) node.disabled = !!options.disabled();
    });
    return node;
  }

  function field(caption, input) {
    const box = el('label', 'editor-field');
    box.append(el('span', 'editor-field-label', caption), input);
    return box;
  }

  function textField(caption, get, set, options = {}) {
    const input = el('input', 'editor-text');
    input.type = options.type || 'text'; input.maxLength = options.maxLength || 80;
    input.setAttribute('aria-label', options.ariaLabel || caption);
    if (options.placeholder) input.placeholder = options.placeholder;
    const commit = () => {
      if (input.disabled) { input.value = String(get() ?? ''); return; }
      const value = input.value.trim();
      if (options.allowEmpty || value) set(value);
      input.value = String(get() ?? '');
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commit(); input.blur(); } });
    if (options.id) input.id = options.id;
    bind(() => {
      if (document.activeElement !== input) input.value = String(get() ?? '');
      if (options.disabled) input.disabled = !!options.disabled();
      if (options.limit) input.maxLength = options.limit();
    });
    return field(caption, input);
  }

  function selectField(caption, get, options, set, config = {}) {
    const select = el('select', 'editor-select'); select.setAttribute('aria-label', config.ariaLabel || caption);
    const choices = options.map(value => typeof value === 'object' ? value : { value: String(value), label: String(value) });
    choices.forEach(value => { const option = el('option', '', value.label); option.value = String(value.value); select.append(option); });
    select.addEventListener('change', () => { set(select.value); if (config.rerender) renderPanel(false); });
    bind(() => {
      const value = String(get() ?? choices[0]?.value ?? '');
      if (document.activeElement !== select || select.value !== value) select.value = value;
      if (config.disabled) select.disabled = !!config.disabled();
    });
    return field(caption, select);
  }

  function parameter({ caption, get, set, min, max, step = 1, unit = '', log = false, compact = false, vertical = false, format, disabled }) {
    const wrap = el('div', `editor-parameter${compact ? ' editor-parameter-compact' : ''}${vertical ? ' editor-parameter-vertical' : ''}`);
    const heading = el('div', 'editor-parameter-heading');
    const display = el('output', 'editor-parameter-value');
    const displayValue = value => format ? format(value) : `${dec(value, step < 1 ? (step < .1 ? 2 : 1) : 0)}${unit ? ` ${unit}` : ''}`;
    heading.append(el('span', 'editor-parameter-label', caption), display);
    const row = el('div', 'editor-parameter-controls');
    const slider = el('input', 'editor-range');
    slider.type = 'range'; slider.min = log ? '0' : String(min); slider.max = log ? '1000' : String(max); slider.step = log ? '1' : String(step);
    slider.setAttribute('aria-label', `${caption} — cursore`);
    if (vertical) slider.setAttribute('aria-orientation', 'vertical');
    const input = el('input', 'editor-number');
    input.type = 'number'; input.min = String(min); input.max = String(max); input.step = String(step);
    input.inputMode = step < 1 ? 'decimal' : 'numeric'; input.setAttribute('aria-label', `${caption}${unit ? ` in ${unit}` : ''}`);
    const toSlider = value => log ? Math.log(clamp(value, min, max) / min) / Math.log(max / min) * 1000 : value;
    const fromSlider = value => log ? min * (max / min) ** (value / 1000) : value;
    const normalize = value => Number((Math.round((clamp(value, min, max) - min) / step) * step + min).toFixed(4));
    const update = () => {
      const value = Number(get()); if (!Number.isFinite(value)) return;
      slider.value = String(toSlider(value));
      const position = (Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
      slider.style.setProperty('--editor-fill', `${position * 100}%`);
      if (vertical) wrap.style.setProperty('--editor-position', position);
      slider.setAttribute('aria-valuetext', displayValue(value));
      if (document.activeElement !== input) input.value = String(value);
      display.textContent = displayValue(value);
      if (disabled) { slider.disabled = !!disabled(); input.disabled = !!disabled(); wrap.classList.toggle('editor-disabled', !!disabled()); }
    };
    const commitSlider = () => { if (slider.disabled) { update(); return; } set(normalize(fromSlider(Number(slider.value)))); input.value = String(get()); update(); };
    slider.addEventListener('input', commitSlider);
    const commit = () => {
      if (input.value.trim() && Number.isFinite(input.valueAsNumber)) {
        const value = normalize(input.valueAsNumber);
        if (value !== Number(get())) set(value);
      }
      input.value = String(get()); update();
    };
    input.addEventListener('change', commit); input.addEventListener('blur', commit);
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commit(); input.blur(); } });
    if (vertical) {
      const rail = el('div', 'editor-fader-rail'), scale = el('div', 'editor-fader-scale'), cap = el('span', 'editor-fader-cap');
      scale.setAttribute('aria-hidden', 'true');
      cap.setAttribute('aria-hidden', 'true');
      // Keep the native range for keyboard/accessibility, but make only the
      // visible head a pointer target. Pressing its rail cannot jump a send.
      slider.addEventListener('pointerdown', event => event.preventDefault());
      let drag = null;
      const finish = () => {
        if (!drag) return;
        const pointer = drag.pointer; drag = null; cap.classList.remove('dragging');
        if (cap.hasPointerCapture?.(pointer)) cap.releasePointerCapture(pointer);
      };
      cap.addEventListener('pointerdown', event => {
        if (drag || slider.disabled || event.button !== 0) return;
        drag = { pointer: event.pointerId, startY: event.clientY, startValue: Number(slider.value), travel: Math.max(1, rail.getBoundingClientRect().height - (cap.getBoundingClientRect().height || 22)) };
        slider.focus({ preventScroll: true }); cap.setPointerCapture(event.pointerId); cap.classList.add('dragging'); event.preventDefault();
      });
      cap.addEventListener('pointermove', event => {
        if (!drag || drag.pointer !== event.pointerId) return;
        if (slider.disabled) { finish(); return; }
        const range = Number(slider.max) - Number(slider.min), fine = event.shiftKey ? .2 : 1;
        slider.value = String(clamp(drag.startValue + (drag.startY - event.clientY) / drag.travel * range * fine, Number(slider.min), Number(slider.max)));
        commitSlider(); event.preventDefault();
      });
      const endPointer = event => { if (drag?.pointer === event.pointerId) finish(); };
      cap.addEventListener('pointerup', endPointer); cap.addEventListener('pointercancel', endPointer); cap.addEventListener('lostpointercapture', endPointer);
      window.addEventListener('blur', finish);
      cleanups.push(() => { finish(); window.removeEventListener?.('blur', finish); });
      for (const value of [10, 0, -10, -20, -40, -60, -90]) {
        const tick = el('span', '', value <= -90 ? '−∞' : `${value > 0 ? '+' : ''}${value}`);
        tick.style.top = `${(max - value) / (max - min) * 100}%`;
        if (value === 0) tick.className = 'editor-fader-unity';
        scale.append(tick);
      }
      rail.append(scale, slider, cap); row.append(rail, input);
    } else row.append(slider, input);
    wrap.append(heading, row); bind(update); return wrap;
  }

  function ensureExtras() {
    const ch = channel(); if (!ch) return;
    const additions = {};
    const defaults = {
      width: 100, tapWidth: 100, balance: 0, sourceAuto: false, monitor: 'A', soloSafe: false,
      gateSC: { source: 'SELF', tap: 'IN', type: 'OFF', frequency: 1000, q: 2, listen: false },
      dynSC: { source: 'SELF', tap: isChannel() ? 'IN' : 'BUS', type: 'OFF', frequency: 1000, q: 2, listen: false },
      dynCrossover: { type: 'OFF', frequency: 1000, depth: 6, q: 1, listen: false },
      sendEQ: { enabled: false, bands: [{ freq: 100, gain: 0, q: 1 }, { freq: 1000, gain: 0, q: 1 }, { freq: 10000, gain: 0, q: 1 }] },
      preFxOn: true, postFxOn: true, delayUnit: 'MS', tags: '', icon: 'none'
    };
    for (const [key, value] of Object.entries(defaults)) if (ch[key] === undefined) additions[key] = clone(value);
    if (Object.keys(additions).length) patchChannel(additions);
  }

  const usesAlt = () => !!(channel()?.useAlt || (D()?.get().io?.globalAlt && channel()?.sourceAuto));
  function activeSource() {
    const ch = channel(); return ch ? D().source(usesAlt() ? ch.altSource : ch.source) : null;
  }
  function sourceName(value) {
    return value ? `${GROUP_NAMES[value.group] || value.group} ${value.index || ''}${value.name ? ` · ${value.name}` : ''}`.trim() : 'Non assegnata';
  }
  function sourcePicker(caption, key) {
    const wrap = el('div', 'editor-source-picker');
    const allSources = D().sources();
    const groups = [...new Set(allSources.map(source => source.group))];
    const groupSelect = el('select', 'editor-select'); groupSelect.setAttribute('aria-label', `Gruppo ${caption}`);
    groups.forEach(group => { const option = el('option', '', GROUP_NAMES[group] || group); option.value = group; groupSelect.append(option); });
    const portSelect = el('select', 'editor-select'); portSelect.setAttribute('aria-label', caption);
    let shownGroup;
    const update = () => {
      const current = D().source(channel()?.[key]);
      const group = current?.group || groups[0];
      if (shownGroup !== group) {
        shownGroup = group; portSelect.replaceChildren();
        allSources.filter(source => source.group === group).forEach(source => {
          const option = el('option', '', `${source.index ? String(source.index).padStart(2, '0') + ' · ' : ''}${source.name || GROUP_NAMES[source.group] || source.id}`);
          option.value = source.id; portSelect.append(option);
        });
      }
      groupSelect.value = group || ''; portSelect.value = current?.id || '';
    };
    groupSelect.addEventListener('change', () => {
      const first = allSources.find(source => source.group === groupSelect.value);
      if (first) { patchChannel({ [key]: first.id }); renderPanel(false); }
    });
    portSelect.addEventListener('change', () => { patchChannel({ [key]: portSelect.value }); renderPanel(false); });
    wrap.append(field(caption, groupSelect), field('Porta / segnale', portSelect)); bind(update); return wrap;
  }

  function nameAccess() {
    const live = window.SculptLive;
    if (!live?.isLive?.()) return { enabled: true, maxLength: 16, message: 'Conferma con Invio o tocca fuori dal campo.' };
    if (!live.isConnected?.() || !live.isWritable?.()) return { enabled: false, maxLength: 16, message: 'Attiva Controllo nella connessione WING per rinominare.' };
    const map = window.SculptWingMap, base = map?.stripPath(currentId);
    const linked = isInput() && !!Number(live.value?.(`${base}/clink`));
    const source = linked ? map?.sourcePath(activeSource()?.id) : null;
    const path = linked ? source && `${source}/name` : base && `${base}/name`;
    const meta = path && live.metadata?.(path);
    const enabled = !!meta && !meta.readOnly && !!live.hasValue?.(path);
    return { enabled, maxLength: Number.isInteger(meta?.maxLength) && meta.maxLength > 0 ? Math.min(16, meta.maxLength) : 16,
      message: !enabled ? 'Il nome non è modificabile nei parametri letti dalla WING.' : linked ? 'Nome collegato alla sorgente: si aggiorna anche sui canali che usano questa sorgente.' : 'Conferma con Invio o tocca fuori dal campo.' };
  }
  function focusName() {
    if (renameFocusId !== currentId || activeTab !== 'channel') return;
    const input = panel?.querySelector('#editor-channel-name');
    if (!input) return;
    renameFocusId = null;
    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    if (!input.disabled) { input.focus(); input.select(); }
  }
  function renameChannel() {
    const live = window.SculptLive;
    if (live?.isLive?.() && (!live.isConnected?.() || !live.isWritable?.())) return;
    renameFocusId = currentId;
    switchTab('channel');
    focusName();
  }
  function renderIdentity() {
    const identity = module('Identità', textField('Nome', () => sourceStrip().name, value => { if (nameAccess().enabled && value !== sourceStrip().name) patch({ name: value }); }, { id: 'editor-channel-name', maxLength: 16, disabled: () => !nameAccess().enabled, limit: () => nameAccess().maxLength }));
    const help = note(''); help.id = 'editor-name-help';
    identity.querySelector('#editor-channel-name').setAttribute('aria-describedby', help.id);
    bind(() => { help.textContent = nameAccess().message; }); identity.append(help);
    const colors = el('div', 'editor-colors'); colors.setAttribute('role', 'group'); colors.setAttribute('aria-label', 'Colore canale');
    PALETTE.forEach(([name, color]) => {
      const choice = button('', () => patch({ color }), 'editor-color', `Colore ${name}`);
      choice.style.setProperty('--swatch', color); bind(() => choice.setAttribute('aria-pressed', String(sourceStrip().color.toLowerCase() === color.toLowerCase()))); colors.append(choice);
    });
    identity.append(colors, grid(
      selectField('Icona', () => channel().icon || 'none', [
        ['none', '● Nessuna'], ['voice', 'Voce'], ['guitar', 'Chitarra'], ['bass', 'Basso'], ['drums', 'Batteria'],
        ['keys', 'Tastiere'], ['strings', 'Archi'], ['brass', 'Fiati'], ['playback', 'Playback'], ['monitor', 'Monitor'], ['fx', 'FX']
      ].map(([value, label]) => ({ value, label })), value => patchChannel({ icon: value })),
      textField('Tag', () => Array.isArray(channel().tags) ? channel().tags.join(', ') : channel().tags || '', value => patchChannel({ tags: value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 8).join(', ') }), { allowEmpty: true }),
    ));
    identity.append(note('Fino a 8 tag, separati da virgole.'));
    return identity;
  }

  function renderChannel() {
    const strip = sourceStrip();
    const fader = module('Fader e immagine stereo');
    const mainButtons = el('div', 'editor-button-row');
    mainButtons.append(
      toggle('MUTE', () => sourceStrip().mute, value => patch({ mute: value }), { className: 'editor-mute', ariaLabel: 'Mute del canale' }),
      toggle('SOLO', () => channel().solo, value => D().setSolo(currentId, value), { className: 'editor-solo', ariaLabel: 'Solo del canale' }),
      button('0 dB', () => patch({ level: 0 }), 'editor-small-button', 'Porta fader a zero decibel'),
      button('−∞', () => patch({ level: -90 }), 'editor-small-button', 'Porta fader a meno infinito')
    );
    fader.append(mainButtons, parameter({ caption: 'Fader', get: () => sourceStrip().level, set: value => patch({ level: value }), min: -90, max: 10, step: .1, unit: 'dB', format: value => `${db(value)} dB` }));
    fader.append(grid(
      parameter({ caption: 'Pan', get: () => sourceStrip().pan, set: value => patch({ pan: value }), min: -100, max: 100, step: 1, format: value => value === 0 ? 'C' : `${Math.abs(value)} ${value < 0 ? 'L' : 'R'}` }),
      parameter({ caption: 'Width', get: () => channel().width ?? 100, set: value => patchChannel({ width: value }), min: -150, max: 150, step: 5, unit: '%' })
    ));
    const effective = el('div', 'editor-effective');
    bind(() => {
      const actual = D().effective(currentId);
      effective.textContent = actual.muted ? 'Uscita effettiva: MUTE' : `Livello con DCA: ${db(actual.level)} dB`;
      effective.classList.toggle('editor-effective-muted', actual.muted);
    });
    fader.append(effective);
    panel.append(fader);

    if (isInput()) {
      const sources = module('Sorgente di ingresso');
      const switcher = el('div', 'editor-main-alt');
      for (const [value, text] of [[false, 'MAIN'], [true, 'ALT']]) {
        const choice = button(text, () => { patchChannel({ useAlt: value, ...(!value && D().get().io?.globalAlt ? { sourceAuto: false } : {}) }); renderPanel(false); }, 'editor-segment', `Usa sorgente ${text}`);
        bind(() => choice.setAttribute('aria-pressed', String(usesAlt() === value))); switcher.append(choice);
      }
      switcher.append(toggle('AUTO', () => channel().sourceAuto, value => patchChannel({ sourceAuto: value }), { ariaLabel: 'Cambio sorgente automatico' }));
      sources.append(switcher, sourcePicker('Sorgente Main', 'source'), sourcePicker('Sorgente Alt', 'altSource'));
      const sourceInfo = el('div', 'editor-source-active');
      bind(() => sourceInfo.textContent = `${usesAlt() ? 'ALT' : 'MAIN'}${D().get().io?.globalAlt && channel().sourceAuto ? ' · globale' : ''} → ${sourceName(activeSource())}`);
      sources.append(sourceInfo);
      const src = activeSource();
      if (src && src.group !== 'OFF') {
        sources.append(selectField('Formato sorgente', () => activeSource()?.mode || 'M', [
          { value: 'M', label: 'Mono' }, { value: 'ST', label: 'Stereo' }, { value: 'M/S', label: 'Mid / Side' }
        ], value => D().patchSource(activeSource().id, { mode: value })));
        const sourceButtons = el('div', 'editor-button-row');
        sourceButtons.append(
          toggle('Ø sorgente', () => !!activeSource()?.polarity, value => D().patchSource(activeSource().id, { polarity: value }), { ariaLabel: 'Inverti polarità della sorgente' }),
          toggle('Mute sorgente', () => !!activeSource()?.mute, value => D().patchSource(activeSource().id, { mute: value }), { ariaLabel: 'Mute della sorgente' })
        );
        sources.append(sourceButtons);
        const preamp = src.preamp !== false && (src.preamp === true || ['LCL', 'A', 'B', 'C', 'SC'].includes(src.group));
        if (preamp) {
          const headamp = el('div', 'editor-headamp');
          headamp.append(parameter({ caption: 'Gain preamp', get: () => D().source(src.id)?.gain ?? 0, set: value => D().patchSource(src.id, { gain: value }), min: src.gainMin ?? -3, max: src.gainMax ?? 45.5, step: src.gainStep ?? .5, unit: 'dB' }),
            toggle('+48 V', () => !!activeSource()?.phantom, value => D().patchSource(activeSource().id, { phantom: value }), { className: 'editor-phantom', ariaLabel: 'Alimentazione phantom 48 volt' }));
          sources.append(headamp);
        }
        const users = C().listStrips().filter(item => ['CH', 'AUX'].includes(item.kind) && (() => { const c = D().channel(item.id); return c && (c.source === src.id || c.altSource === src.id); })());
        sources.append(note(`Controlli condivisi della sorgente · ${users.length} ${users.length === 1 ? 'canale assegnato' : 'canali assegnati'}.`));
      }
      const trim = module('Ingresso del canale', grid(
        parameter({ caption: 'Trim', get: () => sourceStrip().trim, set: value => patch({ trim: value }), min: -18, max: 18, step: .1, unit: 'dB' }),
        parameter({ caption: 'Balance ingresso', get: () => channel().balance ?? 0, set: value => patchChannel({ balance: value }), min: -9, max: 9, step: .1, unit: 'dB' })
      ), toggle('Ø canale', () => sourceStrip().polarity, value => patch({ polarity: value }), { ariaLabel: 'Inverti polarità del canale' }));
      panel.append(sources, trim);
    } else {
      panel.append(module('Formato del bus', selectField('Modo', () => channel().mode || 'ST', [{ value: 'ST', label: 'Stereo' }, { value: 'M', label: 'Mono' }], value => patchChannel({ mode: value }))));
      renderOutputAssignments();
    }
    panel.append(renderIdentity(), module('Ascolto', grid(
      selectField('Monitor solo', () => channel().monitor || 'A', ['A', 'B', 'A+B'], value => patchChannel({ monitor: value })),
      toggle('Solo safe', () => !!channel().soloSafe, value => patchChannel({ soloSafe: value }), { ariaLabel: 'Solo safe del canale' })
    )), button('Preset del canale', () => { close(); window.SculptUI?.open('scenes', { tab: 'presets', target: currentId }); }, 'editor-link-button'));
  }

  function renderOutputAssignments() {
    const box = module('Uscite assegnate');
    const ids = (D().outputs ? D().outputs() : Object.values(D().get().outputs || {})).filter(output => output.source === currentId || output.source === `${sourceStrip().kind}:${sourceStrip().number}` || output.source === `${sourceStrip().kind}.${sourceStrip().number}`);
    const tags = el('div', 'editor-tags');
    if (!ids.length) tags.append(el('span', 'editor-tag', 'Nessuna uscita fisica assegnata'));
    ids.forEach(output => tags.append(el('span', 'editor-tag', `${GROUP_NAMES[output.group] || output.group} ${output.index}`)));
    box.append(tags, button('Apri patch I/O', () => { close(); window.SculptUI?.open('io', { tab: 'outputs', source: currentId }); }, 'editor-link-button'));
    panel.append(box);
  }

  function renderProcessor(block, destination = panel) {
    const host = el('div', 'editor-plugin-host');
    host.dataset.processorBlock = block; destination.append(host);
    const cleanup = window.SculptFX?.renderProcessor(host, { type: 'strip', id: currentId, block });
    if (typeof cleanup === 'function') cleanups.push(cleanup);
    if (!window.SculptFX) host.append(note('Caricamento editor del processore…'));
    return host;
  }

  function orderValue() {
    const raw = channel().order;
    if (Array.isArray(raw) && raw.length) return raw.filter(value => Object.hasOwn(ORDER_LABELS, value));
    if (typeof raw === 'string' && /^[GEDI]{4}$/.test(raw)) return [...raw].map(key => ({ G: 'gate', E: 'eq', D: 'dyn', I: 'insert' })[key]);
    return isChannel() ? ['gate', 'eq', 'dyn', 'insert'] : ['eq', 'dyn', 'insert'];
  }
  function renderOrder() {
    const order = orderValue();
    const flow = el('div', 'editor-flow'); flow.setAttribute('aria-label', 'Percorso del segnale');
    flow.append(el('span', 'editor-flow-edge', isInput() ? 'IN' : 'SUM'));
    if (isChannel()) flow.append(button('Filter', () => { document.getElementById('editor-filter-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 'editor-flow-fixed'));
    order.forEach((block, index) => {
      const unit = el('div', 'editor-flow-unit');
      const open = button(ORDER_LABELS[block], () => {
        if (block === 'eq') switchTab('eq');
        else if (block === 'gate' || block === 'dyn') { dynamicsBlock = block; switchTab('dynamics'); }
        else document.getElementById('editor-insert-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 'editor-flow-open'); unit.append(open);
      if (isChannel()) {
        const move = el('div', 'editor-flow-move');
        [-1, 1].forEach(delta => {
          const direction = delta < 0 ? 'prima' : 'dopo';
          const action = button(delta < 0 ? '‹' : '›', () => {
            const next = orderValue(), at = next.indexOf(block), other = at + delta;
            if (other < 0 || other >= next.length) return;
            [next[at], next[other]] = [next[other], next[at]];
            patchChannel({ order: next }); renderPanel(false);
          }, '', `Sposta ${ORDER_LABELS[block]} ${direction}`);
          action.disabled = index + delta < 0 || index + delta >= order.length; move.append(action);
        }); unit.append(move);
      }
      flow.append(unit);
    });
    flow.append(el('span', 'editor-flow-edge', 'FADER'));
    return module('Percorso del segnale', flow, note(isChannel() ? 'Sposta i blocchi con le frecce. Tocca un blocco per aprirlo.' : 'Ordine di processing della famiglia selezionata.'));
  }

  function renderInsert(position) {
    const key = position === 'pre' ? 'preFx' : 'postFx', enabledKey = `${key}On`;
    const wrap = el('div', 'editor-insert');
    const title = position === 'pre' ? 'Insert 1 · pre fader' : 'Insert 2 · post fader';
    const choices = [{ value: '', label: 'Nessuno' }, ...D().get().fx.map(fx => ({
      value: String(fx.slot), label: `FX ${String(fx.slot).padStart(2, '0')} · ${window.SculptCatalog?.get({ type: 'fx', slot: fx.slot }, fx.model)?.name || fx.model}${fx.stripId && fx.stripId !== currentId && C().getStrip(fx.stripId) ? ` ↗ ${fullLabel(C().getStrip(fx.stripId))}` : ''}`
    }))];
    wrap.append(selectField(title, () => channel()[key] || '', choices, value => {
      const old = channel()[key];
      if (value) D().assignFx(Number(value), currentId, position);
      else if (old) D().assignFx(old, null, position);
      renderPanel(false);
    }));
    const actions = el('div', 'editor-button-row');
    actions.append(toggle('INSERT ON', () => channel()[enabledKey] !== false, value => patchChannel({ [enabledKey]: value }), { ariaLabel: `Abilita ${title}`, disabled: () => !channel()[key] }));
    const edit = button('Apri FX', () => {
      const slot = channel()[key]; if (slot) window.SculptFX?.open({ type: 'fx', slot });
    }, 'editor-link-button', `Apri plugin ${title}`);
    bind(() => edit.disabled = !channel()[key]); actions.append(edit); wrap.append(actions);
    return wrap;
  }

  function renderProcessing() {
    panel.append(renderOrder());
    if (isChannel()) {
      const filter = module('Filtri d’ingresso'); filter.id = 'editor-filter-section';
      const low = el('div', 'editor-filter-block');
      low.append(toggle('LOW CUT', () => !!channel().lowCutOn, value => patchChannel({ lowCutOn: value }), { ariaLabel: 'Low cut attivo' }),
        parameter({ caption: 'Low cut', get: () => channel().lowCut ?? 80, set: value => patchChannel({ lowCut: value }), min: 20, max: 2000, step: 1, log: true, unit: 'Hz' }),
        selectField('Pendenza low cut', () => channel().lowSlope ?? 24, [6, 12, 18, 24].map(value => ({ value, label: `${value} dB/oct` })), value => patchChannel({ lowSlope: Number(value) })));
      const high = el('div', 'editor-filter-block');
      high.append(toggle('HIGH CUT', () => !!channel().highCutOn, value => patchChannel({ highCutOn: value }), { ariaLabel: 'High cut attivo' }),
        parameter({ caption: 'High cut', get: () => channel().highCut ?? 20000, set: value => patchChannel({ highCut: value }), min: 50, max: 20000, step: 1, log: true, unit: 'Hz' }),
        selectField('Pendenza high cut', () => channel().highSlope ?? 12, [6, 12].map(value => ({ value, label: `${value} dB/oct` })), value => patchChannel({ highSlope: Number(value) })));
      filter.append(grid(low, high)); renderProcessor('filter', filter); panel.append(filter);
    }
    const delay = module(isInput() ? 'Delay d’ingresso' : 'Delay di uscita');
    const delayUnit = () => channel().delayUnit || 'MS', displayedUnit = delayUnit();
    const convert = ms => displayedUnit === 'M' ? ms * .343 : displayedUnit === 'FT' ? ms * 1.1253 : displayedUnit === 'SMP' ? ms * ((D().get().setup.sampleRate || 48000) / 1000) : ms;
    const unconvert = value => displayedUnit === 'M' ? value / .343 : displayedUnit === 'FT' ? value / 1.1253 : displayedUnit === 'SMP' ? value / ((D().get().setup.sampleRate || 48000) / 1000) : value;
    delay.append(grid(toggle('DELAY ON', () => !!channel().delayOn, value => patchChannel({ delayOn: value }), { ariaLabel: 'Delay attivo' }),
      selectField('Unità delay', delayUnit, [{ value: 'MS', label: 'Millisecondi' }, { value: 'M', label: 'Metri' }, { value: 'FT', label: 'Piedi' }, { value: 'SMP', label: 'Campioni' }], value => { patchChannel({ delayUnit: value }); renderPanel(false); })));
    delay.append(parameter({ caption: 'Delay', get: () => convert(channel().delay || 0), set: value => patchChannel({ delay: Number(unconvert(value).toFixed(3)) }), min: 0, max: convert(500), step: delayUnit() === 'SMP' ? 1 : .1, unit: delayUnit() === 'MS' ? 'ms' : delayUnit() === 'M' ? 'm' : delayUnit() === 'FT' ? 'ft' : 'smp' }));
    panel.append(delay);
    const inserts = module('Insert FX', renderInsert('pre'));
    inserts.id = 'editor-insert-section';
    if (sourceStrip().kind !== 'AUX') inserts.append(renderInsert('post'));
    inserts.append(note('Gli insert usano istanze del rack: assegnare uno slot qui ne sposta l’eventuale assegnazione precedente.'));
    panel.append(inserts);
    if (isChannel()) renderPreSend();
    else if (sourceStrip().kind === 'AUX') panel.append(note('Il tap PRE degli AUX segue il processing e l’insert, prima del fader.'));
  }

  function renderPreSend() {
    const read = () => channel().sendEQ;
    const patchBand = (index, key, value) => {
      const data = clone(read()); data.bands[index][key] = value; patchChannel({ sendEQ: data });
    };
    const wrap = disclosure('Tap e EQ delle mandate PRE');
    wrap.append(selectField('Punto di prelievo PRE', () => inputTap(currentId), TAP_INPUT, value => patchChannel({ tap: value })),
      parameter({ caption: 'Width mandate PRE', get: () => channel().tapWidth ?? 100, set: value => patchChannel({ tapWidth: value }), min: -150, max: 150, step: 5, unit: '%' }),
      toggle('PRE SEND EQ', () => !!read().enabled, value => patchObject('sendEQ', { enabled: value }), { ariaLabel: 'EQ delle mandate PRE attivo' }));
    const bands = el('div', 'editor-pre-eq');
    for (let i = 0; i < 3; i++) {
      const band = module(`Banda ${i + 1}`,
        parameter({ caption: `PRE EQ ${i + 1} frequenza`, get: () => read().bands[i].freq, set: value => patchBand(i, 'freq', value), min: 20, max: 20000, step: 1, log: true, unit: 'Hz', compact: true }),
        parameter({ caption: `PRE EQ ${i + 1} gain`, get: () => read().bands[i].gain, set: value => patchBand(i, 'gain', value), min: -15, max: 15, step: .1, unit: 'dB', compact: true }),
        parameter({ caption: `PRE EQ ${i + 1} Q`, get: () => read().bands[i].q, set: value => patchBand(i, 'q', value), min: .44, max: 10, step: .01, log: true, compact: true })
      ); bands.append(band);
    }
    wrap.append(bands); panel.append(wrap);
  }

  function renderSidechain(block) {
    const key = block === 'gate' ? 'gateSC' : 'dynSC';
    const get = () => channel()[key];
    const patchSC = changes => patchObject(key, changes);
    const scope = isChannel() ? C().listStrips().filter(strip => strip.kind === 'CH') : C().listStrips().filter(strip => strip.kind !== 'CH');
    const srcOptions = [{ value: 'SELF', label: 'Self · questo canale' }, ...scope.map(strip => ({ value: strip.id, label: fullLabel(strip) }))];
    const pane = disclosure(block === 'gate' ? 'Sidechain del gate' : 'Sidechain della dinamica');
    pane.append(grid(
      selectField('Sorgente sidechain', () => get().source || 'SELF', srcOptions, value => patchSC({ source: value })),
      selectField('Tap sidechain', () => (isChannel() ? TAP_INPUT : TAP_OUTPUT).includes(get().tap) ? get().tap : isChannel() ? 'IN' : 'BUS', isChannel() ? TAP_INPUT : TAP_OUTPUT, value => patchSC({ tap: value }))
    ));
    const context = { type: 'strip', id: currentId, block };
    if (!(block === 'dyn' && D().processor(context)?.model === 'CMB')) {
      pane.append(selectField('Filtro sidechain', () => get().type || 'OFF', ['OFF', 'LP12', 'HP12', 'BP', 'NOTCH'], value => patchSC({ type: value })), grid(
        parameter({ caption: 'Sidechain frequenza', get: () => get().frequency || 1000, set: value => patchSC({ frequency: value }), min: 20, max: 20000, step: 1, log: true, unit: 'Hz' }),
        parameter({ caption: 'Sidechain Q', get: () => get().q || 2, set: value => patchSC({ q: value }), min: .44, max: 10, step: .01, log: true })
      ));
    }
    pane.append(toggle('Ascolta key', () => !!get().listen, value => patchSC({ listen: value }), { ariaLabel: 'Solo sidechain' }));
    panel.append(pane);
    if (block === 'dyn' && sourceStrip().kind !== 'AUX') {
      const read = () => channel().dynCrossover;
      const crossover = disclosure('Dynamics crossover');
      crossover.append(selectField('Tipo crossover', () => read().type || 'OFF', ['OFF', 'LO', 'HI', 'S6', 'S12', 'PEAK'], value => patchObject('dynCrossover', { type: value })), grid(
        parameter({ caption: 'Crossover frequenza', get: () => read().frequency || 1000, set: value => patchObject('dynCrossover', { frequency: value }), min: 20, max: 20000, step: 1, log: true, unit: 'Hz' }),
        parameter({ caption: 'Crossover depth', get: () => read().depth ?? 6, set: value => patchObject('dynCrossover', { depth: value }), min: 0, max: 20, step: .5, unit: 'dB' }),
        parameter({ caption: 'Crossover Q', get: () => read().q || 1, set: value => patchObject('dynCrossover', { q: value }), min: .4, max: 4, step: .01, log: true })
      ), toggle('Ascolta crossover', () => !!read().listen, value => patchObject('dynCrossover', { listen: value }), { ariaLabel: 'Solo crossover' }));
      panel.append(crossover);
    }
  }

  function renderDynamics() {
    if (!isChannel()) dynamicsBlock = 'dyn';
    if (isChannel()) {
      const nav = el('div', 'editor-subtabs'); nav.setAttribute('aria-label', 'Punto di elaborazione');
      [['gate', 'Gate'], ['dyn', 'Dynamics']].forEach(([block, caption]) => {
        const choice = button(caption, () => { dynamicsBlock = block; renderPanel(); }, 'editor-segment', `Slot ${caption}`);
        choice.setAttribute('aria-pressed', String(dynamicsBlock === block)); nav.append(choice);
      }); panel.append(nav);
    }
    renderProcessor(dynamicsBlock);
    renderSidechain(dynamicsBlock);
  }

  function allowedGroups(direction) {
    const strip = sourceStrip();
    return [...new Set(C().listStrips().filter(other => direction === 'out' ? C().canSend(strip.id, other.id) : C().canSend(other.id, strip.id)).map(other => other.kind))];
  }
  function renderSends() {
    const strip = sourceStrip(), outGroups = allowedGroups('out'), inGroups = allowedGroups('in');
    if (!outGroups.length) sendDirection = 'in';
    if (!inGroups.length) sendDirection = 'out';
    if (outGroups.length && inGroups.length) {
      const direction = el('div', 'editor-subtabs');
      [['out', 'Invia a'], ['in', 'Riceve da']].forEach(([value, text]) => {
        const choice = button(text, () => { sendDirection = value; sendGroup = ''; sendFilter = ''; renderPanel(); }, 'editor-segment');
        choice.setAttribute('aria-pressed', String(value === sendDirection)); direction.append(choice);
      }); panel.append(direction);
    }
    const groups = allowedGroups(sendDirection);
    if (!groups.includes(sendGroup)) sendGroup = groups[0];
    if (!sendGroup) { panel.append(module('Mandate', note('Nessun percorso disponibile per questa famiglia.'))); return; }
    const groupBar = el('div', 'editor-send-groups'); groupBar.setAttribute('aria-label', sendDirection === 'out' ? 'Destinazioni delle mandate' : 'Sorgenti delle mandate');
    groups.forEach(group => {
      const choice = button(group, () => { sendGroup = group; renderPanel(); }, '', `${sendDirection === 'out' ? 'Mandate verso' : 'Riceve da'} ${group}`);
      choice.setAttribute('aria-pressed', String(sendGroup === group)); groupBar.append(choice);
    });
    panel.append(groupBar);
    const list = el('div', 'editor-send-list'); list.setAttribute('aria-label', 'Fader delle mandate');
    const peers = C().listStrips().filter(other => other.kind === sendGroup && (sendDirection === 'out' ? C().canSend(strip.id, other.id) : C().canSend(other.id, strip.id)));
    peers.forEach(peer => {
      const sourceId = sendDirection === 'out' ? currentId : peer.id;
      const targetId = sendDirection === 'out' ? peer.id : currentId;
      const target = C().getStrip(targetId);
      const get = () => C().getSend(sourceId, targetId);
      const set = patch => C().setSend(sourceId, targetId, patch);
      const row = el('article', 'editor-send-row');
      const head = el('div', 'editor-send-header'), name = el('div', 'editor-send-name');
      name.append(el('span', '', label(peer)), el('strong', '', peer.name));
      const on = button('ON', () => set({ on: !get().on }), 'editor-send-on', `Mandata ${fullLabel(C().getStrip(sourceId))} a ${fullLabel(target)} attiva`);
      on.setAttribute('role', 'switch');
      bind(() => { on.setAttribute('aria-checked', String(!!get().on)); on.setAttribute('aria-pressed', String(!!get().on)); row.classList.toggle('editor-send-enabled', !!get().on); on.textContent = get().on ? 'ON' : 'OFF'; });
      head.append(name, on); row.append(head);
      row.append(parameter({ caption: `Livello → ${label(peer)}`, get: () => get().level, set: value => set({ level: value }), min: -90, max: 10, step: .1, unit: 'dB', compact: true, vertical: true, format: value => `${db(value)} dB` }));
      row.append(selectField(`Punto → ${label(peer)}`, () => get().mode || (get().pre ? 'PRE' : 'POST'), target.kind === 'MAIN' ? ['PRE', 'POST'] : ['PRE', 'POST', 'GRP'], value => set({ mode: value, pre: value === 'PRE' })));
      const extra = disclosure('Pan / dettagli');
      if (C().getStrip(sourceId).kind === 'CH') extra.append(selectField(`Tap PRE di ${label(C().getStrip(sourceId))}`, () => inputTap(sourceId), TAP_INPUT, value => D().patchChannel(sourceId, { tap: value })), note('Il tap PRE è condiviso dalle mandate PRE di questo canale.'));
      if (target.kind !== 'MAIN') {
        extra.append(grid(
          toggle('Pan link', () => !!get().panLink, value => set({ panLink: value }), { ariaLabel: `Pan link → ${label(peer)}` }),
          toggle('Segue mute', () => get().followMute !== false, value => set({ followMute: value }), { ariaLabel: `Mandata segue mute → ${label(peer)}` })
        ), parameter({ caption: `Pan → ${label(peer)}`, get: () => get().pan ?? 0, set: value => set({ pan: value }), min: -100, max: 100, step: 1, compact: true, disabled: () => !!get().panLink, format: value => value === 0 ? 'C' : `${Math.abs(value)} ${value < 0 ? 'L' : 'R'}` }));
      }
      row.append(extra);
      if (target.kind === 'BUS' || target.kind === 'MTX') row.append(button(`SOF ${label(target)}`, () => { C().setSof(targetId); close(); }, 'editor-send-sof', `Apri SOF ${fullLabel(target)}`));
      list.append(row);
    });
    panel.append(list);
  }

  function renderMembership(title, key, stateKey) {
    const box = module(title), list = el('div', 'editor-membership-grid');
    (D().get()[key] || []).forEach((group, index) => {
      const getGroup = () => D().get()[key][index];
      const choice = button('', () => {
        D().change(state => {
          const item = state[key][index];
          item.members = item.members.includes(currentId) ? item.members.filter(id => id !== currentId) : [...item.members, currentId];
        }, 'groups');
      }, 'editor-membership');
      const code = el('span', 'editor-membership-code', `${key === 'dca' ? 'DCA' : 'MUTE'} ${index + 1}`);
      const name = el('strong', '', group.name);
      const state = el('small'); choice.append(code, name, state);
      bind(() => {
        const item = getGroup(), assigned = item.members.includes(currentId);
        choice.setAttribute('aria-label', `${assigned ? 'Rimuovi da' : 'Assegna a'} ${key === 'dca' ? 'DCA' : 'Mute group'} ${index + 1} · ${item.name}`);
        choice.setAttribute('aria-pressed', String(assigned));
        choice.classList.toggle('editor-active', assigned);
        name.textContent = item.name;
        state.textContent = item[stateKey] ? 'MUTE' : key === 'dca' ? `${db(item.level)} dB` : assigned ? 'Assegnato' : '—';
      }); list.append(choice);
    }); box.append(list); return box;
  }

  function renderGroups() {
    panel.append(renderMembership('DCA', 'dca', 'mute'));
    if (window.SculptLive?.isLive?.()) panel.append(module('Mute groups', note('Le assegnazioni ai mute group non sono disponibili in questo editor live.'), button('Apri parametri WING', () => { close(); window.SculptLive.openExplorer?.('/mgrp'); }, 'editor-link-button')));
    else panel.append(renderMembership('Mute groups', 'muteGroups', 'on'));
    if (isChannel()) {
      const selected = () => ['x', 'y'].find(key => D().get().automix[key]?.channels?.includes(currentId)) || 'off';
      const box = module('Automix', selectField('Gruppo automix', selected, [{ value: 'off', label: 'Off' }, { value: 'x', label: 'Automix X' }, { value: 'y', label: 'Automix Y' }], value => {
        const members = new Set(['x', 'y'].flatMap(key => D().get().automix[key]?.channels || []));
        if (value !== 'off' && !members.has(currentId) && members.size >= 16) { toast('Automix: massimo 16 canali complessivi nei gruppi X e Y.'); renderPanel(false); return; }
        if (value !== 'off' && channel().postFx) D().assignFx(channel().postFx, null, 'post');
        D().change(state => {
          for (const key of ['x', 'y']) state.automix[key].channels = state.automix[key].channels.filter(id => id !== currentId);
          if (value !== 'off') state.automix[value].channels.push(currentId);
        }, 'groups'); renderPanel(false);
      }));
      if (selected() !== 'off') {
        const key = selected();
        box.append(parameter({ caption: 'Peso automix', get: () => D().get().automix[key].weights[currentId] ?? 0, set: value => D().change(state => { state.automix[key].weights[currentId] = value; }, 'groups'), min: -12, max: 12, step: .5, unit: 'dB' }));
        box.append(toggle(`AUTOMIX ${key.toUpperCase()} ON`, () => !!D().get().automix[key].enabled, value => D().change(state => { state.automix[key].enabled = value; }, 'groups')));
      }
      box.append(note('Automix usa lo slot post insert del canale. Se lo attivi, l’eventuale insert FX post viene rilasciato.'));
      panel.append(box);
    }
    const safe = module('Richiamo scene', toggle('Recall safe', () => (D().get().safes || []).includes(currentId), value => D().change(state => {
      state.safes = value ? [...new Set([...(state.safes || []), currentId])] : (state.safes || []).filter(id => id !== currentId);
    }), { ariaLabel: 'Proteggi canale dal richiamo scene' }), note('Mantiene questo canale quando richiami una scena con i safes attivi.'));
    if (!window.SculptLive?.isLive?.()) panel.append(safe);
    panel.append(button('Apri gestione gruppi', () => { close(); window.SculptUI?.open('groups'); }, 'editor-primary'));
  }

  function livePanelKey() {
    const live = window.SculptLive;
    if (!live?.isLive?.()) return '';
    const ch = channel();
    return JSON.stringify([currentId, activeTab, activeTab === 'dynamics' ? dynamicsBlock : '', activeTab === 'sends' ? sendDirection : '',
      activeTab === 'channel' ? [ch?.source, ch?.altSource, ch?.useAlt, D()?.get().io?.globalAlt] : null]);
  }
  function resetLiveGate() { liveGate = { key: '', phase: 'idle', error: '', token: liveGate.token + 1 }; }
  function beginLiveRead(key) {
    const live = window.SculptLive, id = currentId, tab = activeTab, block = dynamicsBlock, direction = sendDirection;
    const token = liveGate.token + 1;
    liveGate = { key, phase: 'loading', error: '', token };
    const valid = () => liveGate.token === token && dialog?.open && currentId === id && live?.isConnected?.();
    Promise.resolve().then(async () => {
      if (!valid()) return;
      if (tab === 'eq') await live.ensureProcessor({ type: 'strip', id, block: 'eq' });
      else if (tab === 'sends') await live.loadScope('sends', direction === 'out' ? { fromId: id } : { targetId: id });
      else if (tab === 'groups') await live.loadScope('groups', { id });
      else {
        await live.loadScope('strip', { id });
        if (!valid()) return;
        if (tab === 'dynamics') await live.ensureProcessor({ type: 'strip', id, block });
        if (tab === 'processing') await live.loadScope('fx');
        if (tab === 'channel' && ['CH', 'AUX'].includes(C().getStrip(id)?.kind)) {
          if (live.readNode) await live.readNode('/io');
          if (!valid()) return;
          const ch = D().channel(id);
          for (const sourceId of [...new Set([ch?.source, ch?.altSource].filter(value => value && value !== 'OFF'))]) {
            await live.loadScope('source', { id: sourceId });
            if (!valid()) return;
          }
        }
      }
      if (valid()) { liveGate.phase = 'ready'; liveGate.error = ''; renderPanel(false); }
    }).catch(error => {
      if (!valid()) return;
      liveGate.phase = 'error'; liveGate.error = error?.message || String(error); renderPanel(false);
    });
  }
  function readyLivePanel() {
    const live = window.SculptLive;
    if (!live?.isLive?.()) return true;
    if (!live.isConnected?.()) {
      panel.append(module('WING non collegata', note('Collega il banco per leggere i valori reali di questa sezione.'),
        button('Apri connessione', () => { close(); live.open?.(); }, 'editor-primary')));
      return false;
    }
    const key = livePanelKey();
    if (liveGate.key !== key || liveGate.phase === 'idle') beginLiveRead(key);
    if (liveGate.phase === 'ready') return true;
    const loading = liveGate.phase === 'loading';
    const box = module(loading ? 'Lettura dalla WING…' : 'Lettura non completata',
      note(loading ? 'I controlli compaiono dopo la lettura dei valori e delle sorgenti dal banco.' : liveGate.error));
    box.classList.add('editor-live-read'); box.dataset.state = liveGate.phase; box.setAttribute('role', 'status');
    if (!loading) box.append(button('Riprova lettura', () => { resetLiveGate(); renderPanel(false); }, 'editor-primary'),
      button('Apri parametri WING', () => { const path = window.SculptWingMap?.stripPath(currentId); close(); live.openExplorer?.(path); }, 'editor-link-button'));
    panel.append(box); return false;
  }
  function liveStateChanged() {
    if (!dialog?.open) return;
    const live = window.SculptLive, mode = live?.isLive?.() ? live.snapshot?.().mode || 'live' : 'demo';
    if (mode !== observedLiveMode) { observedLiveMode = mode; resetLiveGate(); renderPanel(false); return; }
    sync();
  }

  function structuralKey() {
    const ch = channel();
    return JSON.stringify([currentId, activeTab, activeTab === 'channel' ? [ch?.source, ch?.altSource, ch?.useAlt, ch?.sourceAuto, D()?.get().io?.globalAlt] : null,
      activeTab === 'processing' ? [ch?.preFx, ch?.postFx, ch?.delayUnit, ch?.order] : null,
      activeTab === 'groups' ? ['x', 'y'].map(key => D()?.get().automix[key]?.channels?.includes(currentId)) : null,
      activeTab === 'dynamics' ? [dynamicsBlock, D()?.processor({ type: 'strip', id: currentId, block: dynamicsBlock })?.model === 'CMB'] : null]);
  }

  function sync() {
    if (!dialog?.open || !sourceStrip()) return;
    const strip = sourceStrip();
    const live = window.SculptLive, liveState = live?.isLive() ? live.snapshot() : null;
    dialog.querySelector('.editor-demo').textContent = !liveState ? 'DEMO' : liveState.mode === 'live' ? (liveState.writable ? 'LIVE' : 'LETTURA') : 'WING';
    headerName.textContent = strip.name; headerKind.textContent = label(strip); headerDot.style.background = strip.color;
    headerRename.disabled = !!liveState && (!live.isConnected?.() || !live.isWritable?.());
    headerRename.title = headerRename.disabled ? 'Attiva Controllo nella connessione WING per rinominare' : 'Modifica il nome del canale';
    headerSolo.setAttribute('aria-pressed', String(!!channel()?.solo));
    headerSof.hidden = !['BUS', 'MTX'].includes(strip.kind);
    headerSof.setAttribute('aria-pressed', String(C().getSof() === currentId));
    headerSof.classList.toggle('editor-active', C().getSof() === currentId);
    headerSof.setAttribute('aria-label', `${C().getSof() === currentId ? 'Disattiva' : 'Attiva'} SOF per ${label(strip)}`);
    if (!rendering && (structure !== structuralKey() || window.SculptLive?.isConnected?.() && liveGate.key !== livePanelKey())) { renderPanel(false); return; }
    for (const update of bindings) update();
    const effective = D()?.effective(currentId);
    footerStatus.textContent = liveState ? (liveState.mode !== 'live' ? 'WING non collegata' : `${live.hasStripValue(currentId) ? db(strip.level) + ' dB' : 'Lettura…'} · ${liveState.pending ? 'scritture in attesa: ' + liveState.pending : liveState.writable ? 'controllo WING' : 'sola lettura'}`) : `${effective?.muted ? 'MUTE · ' : ''}${db(effective?.level ?? strip.level)} dB · salvato sul dispositivo`;
  }

  function disposePanel() { for (const cleanup of cleanups) cleanup(); cleanups = []; }
  function renderPanel(resetScroll = true) {
    if (!panel || !sourceStrip() || rendering) return;
    rendering = true;
    const scrollTop = resetScroll ? 0 : panel.scrollTop;
    if (panel.contains(document.activeElement) && document.activeElement.matches('input,select')) document.activeElement.blur();
    disposePanel(); bindings = []; panel.replaceChildren();
    panel.id = `editor-panel-${activeTab}`; panel.setAttribute('aria-labelledby', `editor-tab-${activeTab}`);
    tabList.querySelectorAll('[role="tab"]').forEach(tab => { const on = tab.dataset.tab === activeTab; tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1; });
    const ready = readyLivePanel();
    if (!ready) { panel.scrollTop = scrollTop; structure = structuralKey(); rendering = false; sync(); return; }
    if (activeTab === 'channel') renderChannel();
    else if (activeTab === 'processing') renderProcessing();
    else if (activeTab === 'eq') renderProcessor('eq');
    else if (activeTab === 'dynamics') renderDynamics();
    else if (activeTab === 'sends') renderSends();
    else if (activeTab === 'groups') renderGroups();
    panel.scrollTop = scrollTop; structure = structuralKey(); rendering = false; sync(); focusName();
  }
  function switchTab(id) {
    if (!TABS.some(([key]) => key === id)) return;
    if (id !== 'channel') renameFocusId = null;
    activeTab = id; renderPanel();
    tabList.querySelector(`[data-tab="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function adjacent(delta) {
    const all = C().listStrips(); const at = all.findIndex(strip => strip.id === currentId);
    if (at >= 0) open(all[(at + delta + all.length) % all.length].id, true);
  }
  function createDialog() {
    dialog = el('dialog', 'editor-dialog'); dialog.setAttribute('aria-labelledby', 'editor-title'); dialog.setAttribute('aria-modal', 'true');
    const header = el('header', 'editor-header');
    headerDot = el('span', 'editor-channel-dot'); headerDot.setAttribute('aria-hidden', 'true');
    const identity = el('div', 'editor-header-identity'), kicker = el('div', 'editor-kicker');
    headerKind = el('span'); kicker.append(headerKind, el('span', 'editor-demo', 'DEMO'));
    headerName = el('h2'); headerName.id = 'editor-title'; identity.append(kicker, headerName);
    const actions = el('div', 'editor-header-actions');
    headerRename = button('Rinomina', renameChannel, 'editor-rename', 'Rinomina canale');
    headerSolo = button('S', () => D().setSolo(currentId, !channel().solo), 'editor-header-solo', 'Solo del canale selezionato');
    headerSof = button('SOF', () => { C().setSof(C().getSof() === currentId ? null : currentId); close(); }, 'editor-sof');
    actions.append(headerRename, headerSolo, headerSof, button('×', close, 'editor-close', 'Chiudi editor del canale'));
    header.append(headerDot, identity, actions);
    const navigation = el('div', 'editor-channel-navigation');
    navigation.append(button('‹', () => adjacent(-1), '', 'Canale precedente'), el('span', '', 'CHANNEL EDITOR'), button('›', () => adjacent(1), '', 'Canale successivo'));
    tabList = el('nav', 'editor-tabs'); tabList.setAttribute('role', 'tablist'); tabList.setAttribute('aria-label', 'Sezioni del canale');
    TABS.forEach(([id, text], index) => {
      const tab = button(text, () => switchTab(id), 'editor-tab'); tab.id = `editor-tab-${id}`; tab.dataset.tab = id;
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `editor-panel-${id}`);
      tab.addEventListener('keydown', event => {
        let target;
        if (event.key === 'ArrowRight') target = (index + 1) % TABS.length;
        if (event.key === 'ArrowLeft') target = (index + TABS.length - 1) % TABS.length;
        if (event.key === 'Home') target = 0;
        if (event.key === 'End') target = TABS.length - 1;
        if (target === undefined) return; event.preventDefault(); switchTab(TABS[target][0]); tabList.querySelector(`[data-tab="${activeTab}"]`).focus();
      }); tabList.append(tab);
    });
    panel = el('div', 'editor-panel'); panel.setAttribute('role', 'tabpanel'); panel.tabIndex = 0;
    const footer = el('footer', 'editor-footer'); footerStatus = el('span'); footer.append(el('i', 'editor-save-dot'), footerStatus);
    dialog.append(header, navigation, tabList, panel, footer);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    });
    document.body.append(dialog);
  }

  function open(id, keepTab = false) {
    if (!C()?.getStrip(id) || !D()) return false;
    if (!dialog) createDialog();
    if (currentId !== id && panel?.contains(document.activeElement) && document.activeElement.matches('input,select')) document.activeElement.blur();
    if (!dialog.open) previousFocus = document.activeElement;
    if (currentId !== id && !keepTab) { activeTab = 'channel'; dynamicsBlock = 'dyn'; sendDirection = 'out'; sendGroup = 'BUS'; }
    if (currentId !== id) renameFocusId = null;
    currentId = id; ensureExtras(); C().selectStrip(id);
    if (!dialog.open) dialog.showModal();
    observedLiveMode = window.SculptLive?.isLive?.() ? window.SculptLive.snapshot?.().mode || 'live' : 'demo';
    renderPanel(); if (!unsubscribe) unsubscribe = C().subscribe(sync);
    if (!unsubscribeLive && window.SculptLive?.subscribe) unsubscribeLive = window.SculptLive.subscribe(liveStateChanged);
    dialog.querySelector('.editor-close').focus(); return true;
  }
  function close() {
    if (!dialog?.open) return;
    if (dialog.contains(document.activeElement) && document.activeElement.matches('input,select')) document.activeElement.blur();
    renameFocusId = null;
    unsubscribe?.(); unsubscribe = null; unsubscribeLive?.(); unsubscribeLive = null; resetLiveGate(); disposePanel(); dialog.close();
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  window.SculptEditor = Object.freeze({ open, close, isOpen: () => !!dialog?.open });
})();
