(() => {
  'use strict';

  const TABS = [['devices', 'Canale'], ['vst3', 'VST3'], ['fx', 'FX']];
  const LEGACY_SECTIONS = new Set(['channel', 'processing', 'eq', 'dynamics', 'sends', 'groups']);
  // Use the channel-list/WING palette without rewriting existing project RGBs.
  // The fallback keeps the editor usable when loaded without the importer.
  const PALETTE = (window.SculptChannelList?.palette || [
    ['#89949c', 'Grigio'], ['#4969b7', 'Blu scuro'], ['#0089ff', 'Blu'], ['#5b33fa', 'Indaco'],
    ['#2bdfa6', 'Menta'], ['#00b43d', 'Verde'], ['#9acc00', 'Lime'], ['#f6e100', 'Giallo'],
    ['#bd6a1b', 'Marrone'], ['#e31b44', 'Rosso'], ['#ff7679', 'Rosa'], ['#f129e7', 'Magenta'],
    ['#a52ff6', 'Viola'], ['#ffb71b', 'Ambra'], ['#21bff0', 'Azzurro'], ['#ff5a2d', 'Arancio'],
    ['#00c6ca', 'Turchese'], ['#707070', 'Grigio scuro'], ['#e0e0e0', 'Bianco']
  ]).map(([color, name]) => [name, color]);
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

  let dialog, currentId = null, activeTab = 'devices', dynamicsBlock = 'dyn', processingDevice = '';
  let sendDirection = 'out', sendGroup = 'BUS', sendFilter = '';
  let panel, tabList, deviceChain, headerName, headerKind, headerDot, headerSof, headerSolo, headerRename;
  let deviceChainKey = '', deviceScrollLeft = 0, homeGroupsExpanded = false;
  const deviceNodes = new Map();
  const expandedDevices = new Set(['eq']);
  let activeDevice = 'eq', refreshingDevices = false;
  let deviceControlScope = null, deviceDrag = null, deviceTapPalette = null, deviceDragHelp = null;
  const DEVICE_IDS = ['home', 'input', 'gate', 'eq', 'dyn', 'pre', 'post', 'sends', 'master'];
  const DEVICE_LABELS = { home: 'Home', input: 'Pre', gate: 'Gate', eq: 'EQ', dyn: 'Comp', pre: 'Insert', post: 'Insert', sends: 'Send', master: 'Master' };
  let deviceSendId = '', deviceReadSerial = 0, selectedFxSlot = 1, fxScrollTop = 0, fxFocusPending = false;
  const delayReads = new Map();
  const compactEditor = () => window.SculptMixerView?.mode?.() !== 'extended';
  const floatingEditor = () => !compactEditor();
  const slotWindow = () => floatingEditor() && activeTab === 'devices';
  let windowDrag = null;
  let renameFocusId = null, liveNameDialog = null;
  let footerStatus, previousFocus, unsubscribe, unsubscribeLive, rendering = false, navigating = false, panelVersion = 0;
  let sourceControl, dockHost, coveredChildren = [];
  const rowHosts = new Map();
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
    if (action) {
      const active = rendering ? controlActive() : () => true;
      node.addEventListener('click', event => { if (active()) action(event); });
    }
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
  function controlActive() {
    const id = currentId, version = panelVersion, session = window.SculptLive?.sessionToken?.(), scope = deviceControlScope;
    return () => !!dialog?.open && id === currentId && version === panelVersion && session === window.SculptLive?.sessionToken?.() && (!scope || scope.active);
  }
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
    const active = controlActive();
    const input = el('input', 'editor-text');
    input.type = options.type || 'text'; input.maxLength = options.maxLength || 80;
    input.setAttribute('aria-label', options.ariaLabel || caption);
    if (options.placeholder) input.placeholder = options.placeholder;
    const commit = () => {
      if (!active()) return;
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
    const active = controlActive();
    const select = el('select', 'editor-select'); select.setAttribute('aria-label', config.ariaLabel || caption);
    const choices = options.map(value => typeof value === 'object' ? value : { value: String(value), label: String(value) });
    choices.forEach(value => { const option = el('option', '', value.label); option.value = String(value.value); select.append(option); });
    select.addEventListener('change', () => { if (!active() || select.disabled) return; set(select.value); if (config.rerender && active()) renderPanel(false); });
    bind(() => {
      const value = String(get() ?? choices[0]?.value ?? '');
      if (document.activeElement !== select || select.value !== value) select.value = value;
      if (config.disabled) select.disabled = !!config.disabled();
    });
    return field(caption, select);
  }

  function parameter({ caption, get, set, min, max, step = 1, unit = '', log = false, compact = false, vertical = false, format, disabled }) {
    const active = controlActive();
    const wrap = el('div', `editor-parameter${vertical ? ' editor-parameter-vertical' : ' editor-parameter-rotary'}${compact ? ' editor-parameter-compact' : ''}`);
    const heading = el('div', 'editor-parameter-heading'), display = el('output', 'editor-parameter-value');
    const displayValue = value => format ? format(value) : `${dec(value, step < 1 ? (step < .1 ? 2 : 1) : 0)}${unit ? ` ${unit}` : ''}`;
    heading.append(el('span', 'editor-parameter-label', caption), display);
    const row = el('div', 'editor-parameter-controls');
    const knob = vertical ? null : el('div', 'editor-knob');
    if (knob) {
      knob.tabIndex = 0; knob.setAttribute('role', 'slider'); knob.setAttribute('aria-label', `${caption} — manopola`);
      knob.setAttribute('aria-valuemin', String(min)); knob.setAttribute('aria-valuemax', String(max));
      knob.append(el('i', 'editor-knob-pointer'));
    }
    const input = el('input', 'editor-number');
    input.type = 'number'; input.min = String(min); input.max = String(max); input.step = String(step);
    input.inputMode = step < 1 ? 'decimal' : 'numeric'; input.setAttribute('aria-label', `${caption}${unit ? ` in ${unit}` : ''}`);
    const slider = vertical ? el('input', 'editor-range') : null;
    if (slider) {
      slider.type = 'range'; slider.min = '0'; slider.max = '1000'; slider.step = '1';
      // Keep the send's native value and keyboard step. Other parameters use the rotary only.
      if (!log) { slider.min = String(min); slider.max = String(max); slider.step = String(step); }
      slider.setAttribute('aria-label', `${caption} — cursore`); slider.setAttribute('aria-orientation', 'vertical');
    }
    const toPosition = value => log ? Math.log(clamp(value, min, max) / min) / Math.log(max / min) : (clamp(value, min, max) - min) / (max - min);
    const fromPosition = position => log ? min * (max / min) ** clamp(position, 0, 1) : min + clamp(position, 0, 1) * (max - min);
    const normalize = value => Number((Math.round((clamp(value, min, max) - min) / step) * step + min).toFixed(4));
    const writable = () => active() && !disabled?.() && !(window.SculptLive?.isLive?.() && (!window.SculptLive.isConnected?.() || !window.SculptLive.isWritable?.()));
    const update = () => {
      if (!active()) return;
      const value = Number(get()); if (!Number.isFinite(value)) return;
      const position = toPosition(value), enabled = writable();
      if (knob) {
      knob.style.setProperty('--editor-turn', `${-135 + position * 270}deg`);
      knob.style.setProperty('--editor-sweep', `${position * 270}deg`);
      knob.setAttribute('aria-valuenow', String(value)); knob.setAttribute('aria-valuetext', displayValue(value));
      knob.setAttribute('aria-disabled', String(!enabled)); knob.tabIndex = enabled ? 0 : -1;
      knob.title = `${caption}: ${displayValue(value)} · trascina su/giù, Maiusc per la regolazione fine`;
      }
      if (slider) {
        slider.value = String(log ? position * 1000 : value); slider.disabled = !enabled;
        slider.style.setProperty('--editor-fill', `${position * 100}%`); slider.setAttribute('aria-valuetext', displayValue(value));
        wrap.style.setProperty('--editor-position', position);
      }
      if (document.activeElement !== input) input.value = String(value);
      input.disabled = !enabled; display.textContent = displayValue(value); wrap.classList.toggle('editor-disabled', !enabled);
    };
    const commitValue = value => {
      if (writable() && Number.isFinite(value)) { const next = normalize(value); if (next !== Number(get())) set(next); }
      update();
    };
    let rotaryDrag = null;
    const finishRotary = () => {
      if (!rotaryDrag) return;
      const pointer = rotaryDrag.pointer; rotaryDrag = null; knob.classList.remove('dragging');
      if (knob.hasPointerCapture?.(pointer)) knob.releasePointerCapture(pointer);
      C().endGesture?.();
    };
    if (knob) {
    knob.addEventListener('pointerdown', event => {
      if (rotaryDrag || !writable() || event.button !== 0) return;
      C().beginGesture?.(caption);
      rotaryDrag = { pointer: event.pointerId, y: event.clientY, position: toPosition(Number(get())) };
      knob.focus({ preventScroll: true }); knob.setPointerCapture?.(event.pointerId); knob.classList.add('dragging'); event.preventDefault();
    });
    knob.addEventListener('pointermove', event => {
      if (!rotaryDrag || rotaryDrag.pointer !== event.pointerId) return;
      if (!writable()) { finishRotary(); return; }
      // Incremental deltas keep a continuous value when Shift changes mid-drag.
      rotaryDrag.position = clamp(rotaryDrag.position + (rotaryDrag.y - event.clientY) / 180 * (event.shiftKey ? .15 : 1), 0, 1);
      rotaryDrag.y = event.clientY; commitValue(fromPosition(rotaryDrag.position)); event.preventDefault();
    });
    const endRotary = event => { if (rotaryDrag?.pointer === event.pointerId) finishRotary(); };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) knob.addEventListener(type, endRotary);
    knob.addEventListener('keydown', event => {
      if (!writable()) return;
      const direction = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[event.key];
      let value;
      if (direction !== undefined) value = Number(get()) + direction * step * (event.shiftKey ? 10 : 1);
      else if (event.key === 'Home') value = min;
      else if (event.key === 'End') value = max;
      else return;
      event.preventDefault(); commitValue(value);
    });
    if (caption === 'Fader') knob.addEventListener('dblclick', () => commitValue(0));
    }
    const commit = () => {
      if (!active()) return;
      if (input.value.trim() && Number.isFinite(input.valueAsNumber)) commitValue(input.valueAsNumber);
      input.value = String(get()); update();
    };
    input.addEventListener('change', commit); input.addEventListener('blur', commit);
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commit(); input.blur(); } });
    if (knob) {
      window.addEventListener('blur', finishRotary);
      cleanups.push(() => { finishRotary(); window.removeEventListener?.('blur', finishRotary); });
    }
    if (vertical) {
      const rail = el('div', 'editor-fader-rail'), scale = el('div', 'editor-fader-scale'), cap = el('span', 'editor-fader-cap');
      scale.setAttribute('aria-hidden', 'true'); cap.setAttribute('aria-hidden', 'true');
      const commitSlider = () => commitValue(log ? fromPosition(Number(slider.value) / 1000) : Number(slider.value));
      slider.addEventListener('input', commitSlider);
      slider.addEventListener('pointerdown', event => event.preventDefault());
      let drag = null;
      const finish = () => {
        if (!drag) return;
        const pointer = drag.pointer; drag = null; cap.classList.remove('dragging');
        if (cap.hasPointerCapture?.(pointer)) cap.releasePointerCapture(pointer);
        C().endGesture?.();
      };
      cap.addEventListener('pointerdown', event => {
        if (drag || !writable() || event.button !== 0) return;
        C().beginGesture?.(caption);
        drag = { pointer: event.pointerId, startY: event.clientY, startValue: Number(slider.value), travel: Math.max(1, rail.getBoundingClientRect().height - (cap.getBoundingClientRect().height || 22)) };
        slider.focus({ preventScroll: true }); cap.setPointerCapture(event.pointerId); cap.classList.add('dragging'); event.preventDefault();
      });
      cap.addEventListener('pointermove', event => {
        if (!drag || drag.pointer !== event.pointerId) return;
        if (!writable()) { finish(); return; }
        const range = Number(slider.max) - Number(slider.min), fine = event.shiftKey ? .2 : 1;
        slider.value = String(clamp(drag.startValue + (drag.startY - event.clientY) / drag.travel * range * fine, Number(slider.min), Number(slider.max)));
        commitSlider(); event.preventDefault();
      });
      const endPointer = event => { if (drag?.pointer === event.pointerId) finish(); };
      cap.addEventListener('pointerup', endPointer); cap.addEventListener('pointercancel', endPointer); cap.addEventListener('lostpointercapture', endPointer);
      rail.addEventListener('dblclick', () => commitValue(0));
      window.addEventListener('blur', finish); cleanups.push(() => { finish(); window.removeEventListener?.('blur', finish); });
      for (const value of [10, 0, -10, -20, -40, -60, -90]) {
        const tick = el('span', '', value <= -90 ? '−∞' : `${value > 0 ? '+' : ''}${value}`);
        tick.style.top = `${(max - value) / (max - min) * 100}%`;
        if (value === 0) tick.className = 'editor-fader-unity'; scale.append(tick);
      }
      rail.append(scale, slider, cap); row.append(rail, input);
    } else row.append(knob, input);
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
  function headampSource() {
    // PRE USB returns still use the original physical headamp. The routing
    // manager exposes it only while the applied patch is verified on this WING.
    const original = window.SculptVstRouting?.sourceFor?.(currentId);
    return original?.sourceId ? D().source(original.sourceId) : activeSourceKnown() ? activeSource() : null;
  }
  function sourceName(value) {
    return value ? `${GROUP_NAMES[value.group] || value.group} ${value.index || ''}${value.name ? ` · ${value.name}` : ''}`.trim() : 'Non assegnata';
  }
  function sourcePicker(caption, key) {
    const active = controlActive();
    const base = window.SculptWingMap?.stripPath(currentId), leaves = key === 'altSource' ? ['altgrp', 'altin'] : ['grp', 'in'];
    const paths = leaves.map(leaf => base + '/in/conn/' + leaf);
    const known = () => paths.every(wireKnown), editable = () => paths.every(wireEditable);
    const wrap = el('div', 'editor-source-picker');
    const allSources = D().sources();
    const groups = [...new Set(allSources.map(source => source.group))];
    const groupSelect = el('select', 'editor-select'); groupSelect.setAttribute('aria-label', `Gruppo ${caption}`);
    groups.forEach(group => { const option = el('option', '', GROUP_NAMES[group] || group); option.value = group; groupSelect.append(option); });
    const portSelect = el('select', 'editor-select'); portSelect.setAttribute('aria-label', caption);
    let shownGroup;
    const update = () => {
      groupSelect.disabled = portSelect.disabled = !editable();
      wrap.dataset.known = String(known());
      if (!known()) { groupSelect.selectedIndex = -1; portSelect.replaceChildren(); shownGroup = undefined; wrap.title = 'Assegnazione da leggere dalla WING'; return; }
      wrap.title = '';
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
      if (!active() || !editable()) return;
      const first = allSources.find(source => source.group === groupSelect.value);
      if (first) { patchChannel({ [key]: first.id }); if (active()) renderPanel(false); }
    });
    portSelect.addEventListener('change', () => { if (!active() || !editable()) return; patchChannel({ [key]: portSelect.value }); if (active()) renderPanel(false); });
    wrap.append(field(caption, groupSelect), field('Porta / segnale', portSelect)); bind(update); return wrap;
  }

  function nameAccess() {
    const live = window.SculptLive;
    if (!live?.isLive?.()) return { enabled: true, maxLength: 16, message: `Conferma con Invio o tocca fuori dal campo. Vuoto → ${window.SculptModel.defaultName(sourceStrip())}.` };
    if (!live.isConnected?.() || !live.isWritable?.()) return { enabled: false, maxLength: 16, message: 'Attiva Controllo nella connessione WING per rinominare.' };
    const map = window.SculptWingMap, base = map?.stripPath(currentId);
    const linked = isInput() && !!Number(live.value?.(`${base}/clink`));
    const source = linked ? map?.sourcePath(activeSource()?.id) : null;
    const path = linked ? source && `${source}/name` : base && `${base}/name`;
    const meta = path && live.metadata?.(path);
    const enabled = !!meta && !meta.readOnly && !!live.hasValue?.(path);
    return { enabled, maxLength: Number.isInteger(meta?.maxLength) && meta.maxLength > 0 ? Math.min(16, meta.maxLength) : 16,
      message: !enabled ? 'Il nome non è modificabile nei parametri letti dalla WING.' : linked ? `Nome collegato alla sorgente: si aggiorna anche sui canali che usano questa sorgente. Vuoto → ${window.SculptModel.defaultName(sourceStrip())}.` : `Conferma con Invio o tocca fuori dal campo. Vuoto → ${window.SculptModel.defaultName(sourceStrip())}.` };
  }
  function focusName() {
    if (renameFocusId !== currentId || !['channel', 'devices'].includes(activeTab)) return;
    const input = panel?.querySelector('#editor-channel-name');
    if (!input) return;
    renameFocusId = null;
    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    if (!input.disabled) { input.focus(); input.select(); }
  }
  function renameChannel() {
    const live = window.SculptLive;
    if (live?.isLive?.() && (!live.isConnected?.() || !live.isWritable?.())) return;
    if (live?.isLive?.()) { renameLiveChannel(live, currentId); return; }
    renameFocusId = currentId;
    activeDevice = 'home'; expandedDevices.add('home');
    switchTab('devices'); refreshDeviceChain();
    focusName();
  }
  function renameLiveChannel(live, id) {
    const U = window.SculptUI, map = window.SculptWingMap, strip = C().getStrip(id), base = map?.stripPath(id);
    if (!U?.modal || !base || !strip) return;
    if (liveNameDialog?.dialog.open) { liveNameDialog.dialog.querySelector('input')?.focus(); return; }
    const epoch = live.sessionToken?.(), input = el('input', 'desk-input');
    input.id = 'editor-live-name'; input.type = 'text'; input.maxLength = 16; input.autocomplete = 'off'; input.value = strip.name;
    const form = el('form', 'editor-live-rename'), status = note('Lettura del nome dalla WING…'); status.setAttribute('role', 'status');
    const apply = U.button('Rinomina', null, 'desk-primary'); apply.type = 'submit';
    const retry = U.button('Rileggi nome', () => load()), cancel = U.button('Annulla', () => modal.close());
    const actions = el('div', 'desk-actions'); actions.append(apply, retry, cancel); retry.hidden = true;
    form.append(U.field('Nome canale', input), status, actions);
    const modal = U.modal('Rinomina ' + label(strip), form); liveNameDialog = modal;
    let disposed = false, busy = false, loading = false, context = null, generation = 0;
    const sessionValid = () => !disposed && modal.dialog.open && window.SculptLive === live && epoch === live.sessionToken?.() && live.isConnected?.();
    const assertSession = () => { if (!sessionValid()) throw new Error('La sessione WING è cambiata. Riapri Rinomina dopo il collegamento.'); };
    const required = path => {
      if (!live.hasValue?.(path) || !live.metadata?.(path)) throw new Error('Lettura del nome incompleta: ' + path + '. Rileggi prima di modificare.');
      return live.value(path);
    };
    const identity = () => {
      if (!['CH', 'AUX'].includes(strip.kind)) return { path: base + '/name', linked: false, signature: base };
      const linked = !!Number(required(base + '/clink'));
      if (!linked) return { path: base + '/name', linked: false, signature: base + ':local' };
      const useAlt = !!Number(required(base + '/in/set/altsrc')), automatic = !!Number(required(base + '/in/set/srcauto'));
      const globalAlt = automatic ? !!Number(required('/io/altsw')) : false, alt = useAlt || globalAlt;
      const group = required(base + '/in/conn/' + (alt ? 'altgrp' : 'grp'));
      const port = group === 'OFF' ? 0 : required(base + '/in/conn/' + (alt ? 'altin' : 'in'));
      const channel = D().channel(id), sourceId = alt ? channel?.altSource : channel?.source, source = map.sourcePath(sourceId);
      if (!source || group === 'OFF') throw new Error('CLINK è attivo ma la sorgente non ha un nome modificabile disponibile. Controlla la sorgente sul banco.');
      return { path: source + '/name', linked: true, sourceId, signature: JSON.stringify([base, useAlt, automatic, globalAlt, group, port, source]) };
    };
    const validContext = () => {
      if (!context || !sessionValid()) return false;
      try { return identity().signature === context.signature; } catch { return false; }
    };
    const controls = () => {
      const enabled = !loading && !busy && validContext() && live.isWritable?.();
      input.disabled = !enabled; apply.disabled = !enabled; retry.disabled = loading || busy || !sessionValid();
    };
    const observe = () => {
      if (disposed) return;
      if (!sessionValid()) status.textContent = 'WING scollegata. Riapri Rinomina dopo il collegamento.';
      else if (!live.isWritable?.()) status.textContent = 'Attiva Controllo nella connessione WING per rinominare.';
      else if (!loading && !busy && context && !validContext()) { status.textContent = 'La sorgente è cambiata sul banco. Rileggi il nome prima di modificarlo.'; retry.hidden = false; }
      controls();
    };
    const unsubLive = live.subscribe?.(observe), unsubController = C().subscribe(observe);
    modal.dialog.addEventListener('close', () => { disposed = true; generation++; unsubLive?.(); unsubController?.(); if (liveNameDialog === modal) liveNameDialog = null; }, { once: true });
    async function load() {
      const token = ++generation; loading = true; context = null; retry.hidden = true; status.textContent = 'Lettura del nome dalla WING…'; controls();
      try {
        assertSession(); await live.settled?.(); assertSession(); await live.readNode(base); assertSession();
        if (['CH', 'AUX'].includes(strip.kind) && Number(required(base + '/clink'))) {
          // Renaming must not depend on loading every processor or an unused ALT
          // source. Read only the routing that selects the active linked name.
          for (const path of [base + '/in/conn', base + '/in/set']) { await live.readNode(path); assertSession(); }
          if (Number(required(base + '/in/set/srcauto'))) { await live.readNode('/io/altsw'); assertSession(); }
        }
        const target = identity();
        if (target.linked) { await live.readNode(target.path); assertSession(); }
        if (token !== generation) return;
        if (identity().signature !== target.signature) throw new Error('La sorgente è cambiata durante la lettura. Rileggi il nome.');
        const meta = live.metadata?.(target.path); required(target.path);
        if (!meta || meta.readOnly || meta.type !== 7) throw new Error('Il firmware non dichiara modificabile il nome ' + target.path + '.');
        context = target; input.maxLength = Number.isInteger(meta.maxLength) && meta.maxLength > 0 ? Math.min(16, meta.maxLength) : 16;
        input.value = C().getStrip(id).name;
        status.textContent = target.linked ? 'CLINK · ' + target.sourceId + ': il nome si aggiorna anche sugli altri canali collegati a questa sorgente.' : 'Conferma con Invio o Rinomina. Vuoto → ' + window.SculptModel.defaultName(strip) + '.';
      } catch (error) { if (!disposed && token === generation) { status.textContent = error.message || String(error); retry.hidden = false; } }
      finally { if (!disposed && token === generation) { loading = false; controls(); if (!input.disabled) { input.focus(); input.select(); } } }
    }
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || loading || !validContext() || !live.isWritable?.()) { observe(); return; }
      const name = input.value.trim(), meta = live.metadata?.(context.path);
      if (meta?.readOnly || name.length > input.maxLength) { status.textContent = 'Il nome supera i limiti o non è modificabile sul banco.'; return; }
      const target = context, failureVersion = live.snapshot?.().failureVersion || 0;
      busy = true; controls(); status.textContent = 'Invio del nome alla WING…';
      try {
        assertSession();
        if (C().updateStrip(id, { name }) === false) throw new Error('La WING non ha accettato la modifica. Il nome confermato è stato ripristinato.');
        const expected = C().getStrip(id).name;
        await live.settled(); assertSession();
        if ((live.snapshot?.().failureVersion || 0) !== failureVersion || live.value(target.path) !== expected) throw new Error(live.snapshot?.().failure || 'Il banco non ha confermato il nome richiesto.');
        modal.close(); toast('Nome aggiornato sulla WING: ' + C().getStrip(id).name + '.');
      } catch (error) { if (!disposed) { input.value = C().getStrip(id).name; status.textContent = error.message || String(error); retry.hidden = false; } }
      finally { busy = false; if (!disposed) controls(); }
    });
    load();
  }
  function renderIdentity() {
    const base = window.SculptWingMap?.stripPath(currentId), tagsPath = base + '/tags';
    const colorPath = () => {
      const live = window.SculptLive;
      if (!live?.isLive?.()) return base + '/col';
      if (isInput() && !wireKnown(base + '/clink')) return null;
      const linked = isInput() && !!Number(live.value?.(base + '/clink'));
      if (linked && !activeSourceKnown()) return null;
      return (linked ? window.SculptWingMap?.sourcePath(activeSource()?.id) : base) + '/col';
    };
    const identity = module('Identità', textField('Nome', () => sourceStrip().name, value => { if (nameAccess().enabled && value !== sourceStrip().name) patch({ name: value }); }, { id: 'editor-channel-name', maxLength: 16, allowEmpty: true, disabled: () => !nameAccess().enabled, limit: () => nameAccess().maxLength }));
    identity.classList.add('editor-module-identity');
    const help = note(''); help.id = 'editor-name-help';
    identity.querySelector('#editor-channel-name').setAttribute('aria-describedby', help.id);
    bind(() => { help.textContent = nameAccess().message; }); identity.append(help);
    const colors = el('div', 'editor-colors'); colors.setAttribute('role', 'group'); colors.setAttribute('aria-label', 'Colore canale');
    PALETTE.forEach(([name, color]) => {
      const choice = button('', () => { if (wireEditable(colorPath())) patch({ color }); }, 'editor-color', `Colore ${name}`);
      choice.style.setProperty('--swatch', color); bind(() => { choice.setAttribute('aria-pressed', String(sourceStrip().color.toLowerCase() === color.toLowerCase())); choice.disabled = !wireEditable(colorPath()); }); colors.append(choice);
    });
    const currentColor = button('', null, 'editor-color', 'Colore attuale del progetto');
    bind(() => {
      const color = sourceStrip().color;
      const represented = PALETTE.some(([, value]) => value.toLowerCase() === color.toLowerCase());
      currentColor.hidden = represented;
      currentColor.style.setProperty('--swatch', color);
      currentColor.setAttribute('aria-pressed', String(!represented));
      currentColor.setAttribute('aria-label', `Colore attuale del progetto ${color}`);
      currentColor.title = `Colore attuale del progetto ${color}`;
    });
    colors.append(currentColor);
    identity.append(colors, grid(
      selectField('Icona', () => channel().icon || 'none', [
        ['none', '● Nessuna'], ['voice', 'Voce'], ['guitar', 'Chitarra'], ['bass', 'Basso'], ['drums', 'Batteria'],
        ['keys', 'Tastiere'], ['strings', 'Archi'], ['brass', 'Fiati'], ['playback', 'Playback'], ['monitor', 'Monitor'], ['fx', 'FX']
      ].map(([value, label]) => ({ value, label })), value => patchChannel({ icon: value }), { disabled: () => !!window.SculptLive?.isLive?.() }),
      textField('Tag', () => groupKnown(tagsPath) ? Array.isArray(channel().tags) ? channel().tags.join(', ') : channel().tags || '' : '', value => { if (groupEditable(tagsPath)) patchChannel({ tags: value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 8).join(', ') }); }, { allowEmpty: true, disabled: () => !groupEditable(tagsPath), limit: () => window.SculptLive?.isLive?.() ? Math.min(80, window.SculptLive.metadata?.(tagsPath)?.maxLength || 80) : 80 }),
    ));
    if (window.SculptLive?.isLive?.()) identity.append(note('La scelta delle icone è disponibile in Demo.'));
    identity.append(note('Fino a 8 tag, separati da virgole.'));
    return identity;
  }

  function renderChannel() {
    const strip = sourceStrip();
    const fader = module('Fader e immagine stereo'); fader.classList.add('editor-module-fader');
    const mainButtons = el('div', 'editor-button-row');
    mainButtons.append(
      toggle('MUTE', () => sourceStrip().mute, value => patch({ mute: value }), { className: 'editor-mute', ariaLabel: 'Mute del canale' }),
      toggle('SOLO', () => channel().solo, value => D().setSolo(currentId, value), { className: 'editor-solo', ariaLabel: 'Solo del canale' }),
      button('0 dB', () => patch({ level: 0 }), 'editor-small-button', 'Porta fader a zero decibel'),
      button('−∞', () => patch({ level: -90 }), 'editor-small-button', 'Porta fader a meno infinito')
    );
    fader.append(mainButtons);
    const faderControls = grid(parameter({ caption: 'Fader', get: () => sourceStrip().level, set: value => patch({ level: value }), min: -90, max: 10, step: .1, unit: 'dB', format: value => `${db(value)} dB` }),
      parameter({ caption: 'Pan', get: () => sourceStrip().pan, set: value => patch({ pan: value }), min: -100, max: 100, step: 1, format: value => value === 0 ? 'C' : `${Math.abs(value)} ${value < 0 ? 'L' : 'R'}` }),
      parameter({ caption: 'Width', get: () => channel().width ?? 100, set: value => patchChannel({ width: value }), min: -150, max: 150, step: 5, unit: '%' })
    );
    faderControls.classList.add('editor-level-controls'); fader.append(faderControls);
    const effective = el('div', 'editor-effective');
    bind(() => {
      const actual = D().effective(currentId);
      effective.textContent = actual.muted ? 'Uscita effettiva: MUTE' : `Livello con DCA: ${db(actual.level)} dB`;
      effective.classList.toggle('editor-effective-muted', actual.muted);
    });
    fader.append(effective);
    panel.append(fader);

    if (isInput()) {
      const sources = module('Sorgente di ingresso'); sources.classList.add('editor-module-source');
      let inputHeadamp = null;
      const switcher = el('div', 'editor-main-alt');
      for (const [value, text] of [[false, 'MAIN'], [true, 'ALT']]) {
        const choice = button(text, () => { patchChannel({ useAlt: value, ...(!value && D().get().io?.globalAlt ? { sourceAuto: false } : {}) }); renderPanel(false); }, 'editor-segment', `Usa sorgente ${text}`);
        bind(() => choice.setAttribute('aria-pressed', String(usesAlt() === value))); switcher.append(choice);
      }
      switcher.append(toggle('AUTO', () => channel().sourceAuto, value => patchChannel({ sourceAuto: value }), { ariaLabel: 'Cambio sorgente automatico' }));
      sources.append(switcher);
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
          inputHeadamp = headamp;
        }
        const users = C().listStrips().filter(item => ['CH', 'AUX'].includes(item.kind) && (() => { const c = D().channel(item.id); return c && (c.source === src.id || c.altSource === src.id); })());
        sources.append(note(`Sorgente condivisa · ${users.length} ${users.length === 1 ? 'canale assegnato' : 'canali assegnati'}.`));
      }
      sources.append(disclosure('Assegnazione sorgenti Main / Alt', sourcePicker('Sorgente Main', 'source'), sourcePicker('Sorgente Alt', 'altSource')));
      const trim = module('Preamplificatore e ingresso', inputHeadamp, grid(
        parameter({ caption: 'Trim', get: () => sourceStrip().trim, set: value => patch({ trim: value }), min: -18, max: 18, step: .1, unit: 'dB' }),
        parameter({ caption: 'Balance ingresso', get: () => channel().balance ?? 0, set: value => patchChannel({ balance: value }), min: -9, max: 9, step: .1, unit: 'dB' })
      ), toggle('Ø canale', () => sourceStrip().polarity, value => patch({ polarity: value }), { ariaLabel: 'Inverti polarità del canale' }));
      trim.classList.add('editor-module-input'); if (inputHeadamp) trim.classList.add('editor-module-input-with-preamp');
      panel.append(trim, sources);
    } else {
      panel.append(module('Formato del bus', selectField('Modo', () => channel().mode || 'ST', [{ value: 'ST', label: 'Stereo' }, { value: 'M', label: 'Mono' }], value => patchChannel({ mode: value }))));
      renderOutputAssignments();
    }
    const monitor = module('Ascolto', grid(
      selectField('Monitor solo', () => channel().monitor || 'A', ['A', 'B', 'A+B'], value => patchChannel({ monitor: value })),
      toggle('Solo safe', () => !!channel().soloSafe, value => patchChannel({ soloSafe: value }), { ariaLabel: 'Solo safe del canale' })
    ), button('Preset del canale', () => { close(); window.SculptUI?.open('scenes', { tab: 'presets', target: currentId }); }, 'editor-link-button'));
    monitor.classList.add('editor-module-monitor'); panel.append(renderIdentity(), monitor);
  }

  function renderOutputAssignments() {
    const box = module('Uscite assegnate');
    const tags = el('div', 'editor-tags');
    let signature;
    bind(() => {
      const outputs = D().outputs ? D().outputs() : Object.values(D().get().outputs || {}), live = !!window.SculptLive?.isLive?.();
      const known = outputs.filter(output => !live || ['grp', 'in'].every(leaf => wireKnown('/io/out/' + output.group + '/' + output.index + '/' + leaf)));
      const ids = known.filter(output => output.source === currentId || output.source === `${sourceStrip().kind}:${sourceStrip().number}` || output.source === `${sourceStrip().kind}.${sourceStrip().number}`);
      const partial = live && known.length < outputs.length;
      const next = [live, known.length, outputs.length, ...ids.map(output => output.id || output.group + ':' + output.index)].join('|');
      if (signature === next) return; signature = next; tags.replaceChildren();
      if (live && !known.length) tags.append(el('span', 'editor-tag', 'Patch uscite da leggere'));
      else {
        if (!ids.length) tags.append(el('span', 'editor-tag', partial ? 'Nessuna assegnazione tra le uscite lette' : 'Nessuna uscita fisica assegnata'));
        ids.forEach(output => tags.append(el('span', 'editor-tag', `${GROUP_NAMES[output.group] || output.group} ${output.index}`)));
        if (partial) tags.append(el('span', 'editor-tag', 'Lettura parziale · apri patch I/O'));
      }
    });
    box.append(tags, button('Apri patch I/O', () => { close(); window.SculptUI?.open('io', { tab: 'outputs', source: currentId }); }, 'editor-link-button'));
    panel.append(box);
  }

  function renderProcessor(block, destination = panel) {
    const host = el('div', 'editor-plugin-host');
    host.dataset.processorBlock = block; destination.append(host);
    const cleanup = window.SculptFX?.renderProcessor(host, { type: 'strip', id: currentId, block }, { rotaryBank: true, fullControls: slotWindow() });
    if (typeof cleanup === 'function') cleanups.push(cleanup);
    if (!window.SculptFX) host.append(note('Caricamento editor del processore…'));
    return host;
  }

  function wireKnown(path) {
    const live = window.SculptLive;
    return !live?.isLive?.() || !!(path && live.isConnected?.() && live.hasValue?.(path) && live.metadata?.(path));
  }
  function wireEditable(path) {
    const live = window.SculptLive;
    return wireKnown(path) && (!live?.isLive?.() || live.isWritable?.() && !live.metadata(path).readOnly);
  }
  function wireParameter(options, path) {
    const live = window.SculptLive, meta = live?.isLive?.() ? live.metadata?.(path) : null;
    const originalSet = options.set;
    const node = parameter({ ...options, min: meta?.min ?? options.min, max: meta?.max ?? options.max,
      set: value => { if (wireEditable(path) && (!options.known || options.known())) originalSet(value); }, disabled: () => !wireEditable(path) || !!options.disabled?.() || !!options.known && !options.known() });
    bind(() => {
      const known = wireKnown(path) && (!options.known || options.known());
      node.dataset.known = String(known);
      if (known) return;
      const input = node.querySelector('input[type="number"]'), output = node.querySelector('output'), knob = node.querySelector('[role="slider"]');
      if (input) { input.value = ''; input.placeholder = '—'; }
      if (output) output.textContent = '—';
      if (knob) { knob.removeAttribute('aria-valuenow'); knob.setAttribute('aria-valuetext', 'Valore da leggere'); }
    });
    return node;
  }
  function wireToggle(label, get, set, path, options = {}) {
    const node = toggle(label, () => wireKnown(path) && get(), value => { if (wireEditable(path)) set(value); }, { ...options, disabled: () => !wireEditable(path) || !!options.disabled?.() });
    bind(() => { node.dataset.known = String(wireKnown(path)); node.title = wireKnown(path) ? options.title || label : 'Valore da leggere dalla WING'; });
    return node;
  }
  function wireSelect(label, get, choices, set, path, options = {}) {
    const node = selectField(label, () => wireKnown(path) ? get() : '', choices, value => { if (wireEditable(path)) set(value); }, { ...options, disabled: () => !wireEditable(path) || !!options.disabled?.() });
    const select = node.querySelector('select');
    bind(() => { if (!wireKnown(path)) select.selectedIndex = -1; });
    return node;
  }
  function delayPaths(id = currentId) {
    const input = ['CH', 'AUX'].includes(C().getStrip(id)?.kind), base = window.SculptWingMap?.stripPath(id) + (input ? '/in/set' : '/dly');
    return { base, value: base + '/dly', mode: base + (input ? '/dlymode' : '/mode'), on: base + (input ? '/dlyon' : '/on') };
  }
  const DELAY_UNITS = { MS: { unit: 'ms', label: 'Millisecondi', step: .1 }, M: { unit: 'm', label: 'Metri', step: .1 }, FT: { unit: 'ft', label: 'Piedi', step: .5 }, SMP: { unit: 'smp', label: 'Campioni', step: 1 } };
  function delaySchemaKey(id = currentId) {
    const live = window.SculptLive, paths = delayPaths(id), meta = live?.metadata?.(paths.value);
    return JSON.stringify([live?.value?.(paths.mode), meta?.revision, meta?.type, meta?.unit, meta?.min, meta?.max, meta?.readOnly]);
  }
  function delayDisplayKey() {
    const record = delayReads.get(currentId);
    return window.SculptLive?.isLive?.() ? [delaySchemaKey(), record?.phase, record?.serial].join(':') : channel()?.delayUnit || 'MS';
  }
  function refreshDelayUI(id) {
    if (!dialog?.open || currentId !== id) return;
    if (activeTab === 'devices') refreshDeviceChain();
    else if (activeTab === 'processing') renderPanel(false);
  }
  function startDelayRead(id, requestedMode) {
    const live = window.SculptLive, paths = delayPaths(id), epoch = live.sessionToken?.();
    const record = { phase: 'loading', error: '', epoch, mode: '', serial: ++deviceReadSerial, schema: '', promise: null };
    delayReads.set(id, record);
    const valid = () => delayReads.get(id) === record && live.isConnected?.() && live.sessionToken?.() === epoch;
    const assert = () => { if (!valid()) throw new Error('La sessione WING è cambiata.'); };
    const readMode = async () => {
      const values = await live.readValues(paths.mode); assert();
      if (!Object.hasOwn(values || {}, paths.mode) || !Object.hasOwn(DELAY_UNITS, values[paths.mode])) throw new Error('Unità delay non confermata dalla WING.');
      return values[paths.mode];
    };
    record.promise = Promise.resolve().then(async () => {
      if (!live.readNode || !live.readValues) throw new Error('Lettura del delay non disponibile.');
      await live.settled?.(); assert();
      if (requestedMode !== undefined) {
        if (!dialog?.open || currentId !== id || !live.isWritable?.() || !wireEditable(paths.mode)) throw new Error('Cambio unità annullato. Riapri il delay del canale.');
        const failures = live.snapshot?.().failureVersion || 0;
        if (D().patchChannel(id, { delayUnit: requestedMode }) === false) throw new Error('La WING non ha accettato l’unità delay.');
        await live.settled?.(); assert();
        if ((live.snapshot?.().failureVersion || 0) !== failures || live.value?.(paths.mode) !== requestedMode) throw new Error('La WING non ha confermato l’unità delay.');
      }
      // Join any older read first: a forced call may otherwise coalesce into
      // an in-flight cached read. Force the branch, never just the delay leaf.
      await live.readNode(paths.base); assert();
      const before = await readMode();
      if (requestedMode !== undefined && before !== requestedMode) throw new Error('L’unità delay è cambiata sul banco. Rileggi il controllo.');
      await live.readNode(paths.base, { force: true }); assert();
      const schema = delaySchemaKey(id), meta = live.metadata?.(paths.value);
      if (!meta || ![1, 2, 4].includes(meta.type) || !Number.isFinite(meta.min) || !Number.isFinite(meta.max) || meta.max <= meta.min) throw new Error('Definizione del delay non disponibile.');
      const values = await live.readValues(paths.base, { depth: 0 }); assert();
      if (!Object.hasOwn(values || {}, paths.mode) || !Object.hasOwn(values || {}, paths.value) || !Number.isFinite(values[paths.value])) throw new Error('Lettura incompleta del delay.');
      const after = await readMode();
      if (before !== values[paths.mode] || before !== after || schema !== delaySchemaKey(id)) throw new Error('Unità o definizione delay cambiate durante la lettura. Riprova.');
      record.phase = 'ready'; record.mode = after; record.schema = schema; record.error = '';
    }).catch(error => {
      if (valid()) { record.phase = 'error'; record.error = error?.message || String(error); record.schema = delaySchemaKey(id); }
    }).finally(() => { if (valid()) refreshDelayUI(id); });
    return record;
  }
  function ensureDelayRead() {
    const live = window.SculptLive;
    if (!live?.isLive?.() || !live.isConnected?.()) return null;
    const record = delayReads.get(currentId);
    if (record?.epoch === live.sessionToken?.() && (record.phase === 'loading' || record.schema === delaySchemaKey())) return record;
    return startDelayRead(currentId);
  }
  function renderDelay(destination, compact = false) {
    const live = window.SculptLive, online = !!live?.isLive?.(), paths = delayPaths(), record = ensureDelayRead();
    const mode = online ? record?.phase === 'ready' ? record.mode : '' : channel().delayUnit || 'MS';
    const definition = DELAY_UNITS[mode], unit = definition?.unit || '', schema = delaySchemaKey();
    const ready = () => !online || record?.phase === 'ready' && record.schema === delaySchemaKey() && schema === record.schema && wireKnown(paths.mode);
    const factor = mode === 'M' ? .343 : mode === 'FT' ? 1.1253 : mode === 'SMP' ? (D().get().setup.sampleRate || 48000) / 1000 : 1;
    const box = module(isInput() ? 'Delay d’ingresso' : 'Delay di uscita');
    const choices = Object.entries(DELAY_UNITS).map(([value, config]) => ({ value, label: config.label }));
    box.append(wireToggle('DELAY ON', () => !!channel().delayOn, value => patchChannel({ delayOn: value }), paths.on, { ariaLabel: 'Delay attivo' }),
      wireSelect('Unità delay', () => online ? live.value?.(paths.mode) : channel().delayUnit || 'MS', choices, value => {
        if (!ready()) return;
        if (!online) { patchChannel({ delayUnit: value }); refreshDelayUI(currentId); return; }
        if (value === live.value?.(paths.mode)) return;
        startDelayRead(currentId, value); refreshDelayUI(currentId);
      }, paths.mode, { disabled: () => !ready() }));
    box.append(wireParameter({ caption: 'Delay', get: () => (channel().delay || 0) * (online ? 1 : factor), set: value => patchChannel({ delay: online ? value : Number((value / factor).toFixed(3)) }),
      min: 0, max: 500 * (online ? 1 : factor), step: definition?.step || .1, unit, compact, known: ready }, paths.value));
    if (online && record?.phase !== 'ready') {
      box.append(note(record?.phase === 'error' ? record.error : 'Lettura dell’unità e del valore delay…'));
      if (record?.phase === 'error') box.append(button('Rileggi delay', () => { startDelayRead(currentId); refreshDelayUI(currentId); }, 'editor-small-button'));
    }
    destination.append(box);
  }
  function deviceSnapshot() {
    if (window.SculptChannelChain) {
      const snapshot = window.SculptChannelChain.snapshot(currentId);
      return { ...snapshot, items: snapshot.items.map(item => item.id === 'sends' && item.available === false && C().listStrips().some(peer => C().canSend(peer.id, currentId)) ? { ...item, available: true, movable: false, badge: 'Ricezioni' } : item) };
    }
    // A missing optional script may expose the pages, but never enables a move.
    const family = sourceStrip()?.kind;
    return { order: DEVICE_IDS, items: DEVICE_IDS.map(id => ({ id, label: DEVICE_LABELS[id], available: !(id === 'gate' && family !== 'CH' || id === 'post' && family === 'AUX'), movable: false, reason: 'Ordine WING non disponibile', badge: '' })) };
  }
  function devicePeers(mainOnly = false) {
    return C().listStrips().filter(peer => C().canSend(currentId, peer.id) && (mainOnly ? peer.kind === 'MAIN' : peer.kind !== 'MAIN'));
  }
  function selectedDeviceSend() {
    const all = C().listStrips(), outgoing = all.filter(peer => C().canSend(currentId, peer.id)), incoming = all.filter(peer => C().canSend(peer.id, currentId));
    if (!outgoing.length) sendDirection = 'in';
    else if (!incoming.length) sendDirection = 'out';
    const peers = sendDirection === 'out' ? outgoing : incoming, sof = C().getSof?.();
    if (!peers.some(peer => peer.id === deviceSendId)) deviceSendId = (sendDirection === 'out' ? peers.find(peer => peer.id === sof) : peers.find(peer => peer.kind === 'CH'))?.id || peers[0]?.id || '';
    return deviceSendId;
  }
  function activeSourceKnown() {
    const live = window.SculptLive;
    if (!live?.isLive?.()) return true;
    const base = window.SculptWingMap?.stripPath(currentId);
    if (!['altsrc', 'srcauto'].every(leaf => wireKnown(base + '/in/set/' + leaf))) return false;
    if (channel()?.sourceAuto && !wireKnown('/io/altsw')) return false;
    return (usesAlt() ? ['altgrp', 'altin'] : ['grp', 'in']).every(leaf => wireKnown(base + '/in/conn/' + leaf));
  }
  function renderDeviceHome(destination, expanded) {
    const strip = sourceStrip(), base = window.SculptWingMap?.stripPath(currentId), summary = el('div', 'editor-device-summary');
    bind(() => { summary.textContent = fullLabel(sourceStrip()); summary.style.setProperty('--device-channel-color', sourceStrip().color); });
    destination.append(summary, button('Rinomina', renameChannel, 'editor-small-button', 'Rinomina canale da Home'));
    const source = el('p', 'editor-note');
    bind(() => { source.textContent = isInput() ? activeSourceKnown() ? sourceName(activeSource()) : 'Sorgente in lettura…' : 'Somma ' + sourceStrip().kind; });
    destination.append(source, button(isInput() ? 'Sorgente / ingresso' : 'Formato / ingresso', () => openDevicePage(currentId, 'input'), 'editor-link-button', 'Apri ingresso del canale'));
    if (!expanded) {
      const actions = el('div', 'editor-button-row');
      actions.append(wireToggle('SOLO', () => channel().solo, value => D().setSolo(currentId, value), base + '/$solo', { className: 'editor-solo' }),
        button('Identità / gruppi', () => { expandedDevices.add('home'); refreshDeviceChain(); }, 'editor-link-button'));
      destination.append(actions); return;
    }
    destination.append(renderIdentity());
    const monitor = module('Ascolto', wireToggle('SOLO', () => channel().solo, value => D().setSolo(currentId, value), base + '/$solo', { className: 'editor-solo', ariaLabel: 'Solo del canale' }), wireSelect('Monitor solo', () => channel().monitor || 'A', ['A', 'B', 'A+B'], value => patchChannel({ monitor: value }), base + '/mon'));
    if (isInput()) monitor.append(wireToggle('Solo safe', () => !!channel().soloSafe, value => patchChannel({ soloSafe: value }), base + '/solosafe'));
    const groups = disclosure('DCA / mute groups / automix'); groups.classList.add('editor-home-groups'); groups.open = homeGroupsExpanded;
    const active = controlActive(); groups.addEventListener('toggle', () => { if (active()) homeGroupsExpanded = groups.open; });
    renderGroups(groups);
    destination.append(monitor, groups, button('Preset del canale', () => { close(); window.SculptUI?.open('scenes', { tab: 'presets', target: strip.id }); }, 'editor-link-button'));
  }
  function renderDevicePre(destination, expanded) {
    const base = window.SculptWingMap?.stripPath(currentId), values = el('div', 'editor-device-main-parameters');
    if (isInput()) {
      const src = activeSourceKnown() ? activeSource() : null, sourcePath = src && window.SculptWingMap?.sourcePath(src.id);
      const headamp = headampSource(), headampPath = headamp && window.SculptWingMap?.sourcePath(headamp.id);
      const hasHeadamp = headamp && headamp.group !== 'OFF' && headamp.preamp !== false && (headamp.preamp === true || ['LCL', 'A', 'B', 'C', 'SC'].includes(headamp.group));
      if (hasHeadamp) {
        values.append(wireParameter({ caption: 'Gain preamp', get: () => D().source(headamp.id)?.gain, set: value => D().patchSource(headamp.id, { gain: value }), min: headamp.gainMin ?? -3, max: headamp.gainMax ?? 45.5, step: headamp.gainStep ?? .5, unit: 'dB', compact: true }, headampPath + '/g'));
      }
      values.append(wireParameter({ caption: 'Trim', get: () => sourceStrip().trim, set: value => patch({ trim: value }), min: -18, max: 18, step: .1, unit: 'dB', compact: true }, base + '/in/set/trim'));
      destination.append(values);
      const actions = el('div', 'editor-button-row');
      actions.append(wireToggle('Ø', () => sourceStrip().polarity, value => patch({ polarity: value }), base + '/in/set/inv', { ariaLabel: 'Inverti polarità del canale' }));
      if (hasHeadamp && headampPath) actions.append(wireToggle('+48 V', () => !!D().source(headamp.id)?.phantom, value => D().patchSource(headamp.id, { phantom: value }), headampPath + '/vph', { className: 'editor-phantom', ariaLabel: 'Alimentazione phantom 48 volt' }));
      destination.append(actions);
      if (hasHeadamp && headamp.id !== src?.id) destination.append(note('Preamp originale: ' + sourceName(headamp) + ' · ritorno VST3 via USB'));
      if (isChannel()) renderDeviceCuts(destination, expanded);
      if (expanded) {
        const routing = module('Sorgente di ingresso');
        routing.append(el('p', 'editor-note', activeSourceKnown() ? sourceName(src) : 'Sorgente in lettura…'), wireToggle('ALT', usesAlt, value => patchChannel({ useAlt: value, ...(!value && D().get().io?.globalAlt ? { sourceAuto: false } : {}) }), base + '/in/set/altsrc', { disabled: () => !activeSourceKnown() || !!D().get().io?.globalAlt && !wireEditable(base + '/in/set/srcauto') }),
          wireToggle('AUTO', () => !!channel().sourceAuto, value => patchChannel({ sourceAuto: value }), base + '/in/set/srcauto'),
          sourcePicker('Sorgente Main', 'source'), sourcePicker('Sorgente Alt', 'altSource'));
        if (src && sourcePath) routing.append(wireSelect('Formato sorgente', () => activeSource()?.mode, [{ value: 'M', label: 'Mono' }, { value: 'ST', label: 'Stereo' }, { value: 'M/S', label: 'Mid / Side' }], value => D().patchSource(src.id, { mode: value }), sourcePath + '/mode'),
          wireToggle('Ø sorgente', () => !!activeSource()?.polarity, value => D().patchSource(src.id, { polarity: value }), sourcePath + '/pol'),
          wireToggle('Mute sorgente', () => !!activeSource()?.mute, value => D().patchSource(src.id, { mute: value }), sourcePath + '/mute'));
        destination.append(routing, wireParameter({ caption: 'Balance ingresso', get: () => channel().balance, set: value => patchChannel({ balance: value }), min: -9, max: 9, step: .1, unit: 'dB' }, base + '/in/set/bal'));
        if (isChannel()) renderProcessor('filter', destination);
      }
    } else {
      destination.append(wireParameter({ caption: 'Trim', get: () => sourceStrip().trim, set: value => patch({ trim: value }), min: -18, max: 18, step: .1, unit: 'dB', compact: !expanded }, base + '/in/set/trim'),
        wireToggle('Ø', () => sourceStrip().polarity, value => patch({ polarity: value }), base + '/in/set/inv', { ariaLabel: 'Inverti polarità del canale' }),
        wireSelect('Formato', () => channel().mode || 'ST', [{ value: 'ST', label: 'Stereo' }, { value: 'M', label: 'Mono' }], value => patchChannel({ mode: value }), base + '/busmono'));
      if (expanded) destination.append(wireParameter({ caption: 'Balance ingresso', get: () => channel().balance, set: value => patchChannel({ balance: value }), min: -9, max: 9, step: .1, unit: 'dB' }, base + '/in/set/bal'));
    }
    if (expanded || !isInput()) renderDelay(destination, !expanded);
  }
  function renderDeviceSendControls(destination, targetId, compact = true) {
    const sourceId = currentId, target = C().getStrip(targetId), base = window.SculptWingMap?.sendBasePath(sourceId, targetId);
    if (!target || !base) return;
    const get = () => C().getSend(sourceId, targetId), set = changes => C().setSend(sourceId, targetId, changes);
    const full = isInput() && target.kind !== 'MAIN';
    const box = el('div', 'editor-device-send-controls');
    box.append(wireToggle('ON', () => get().on, value => set({ on: value }), base + '/on', { ariaLabel: 'Mandata a ' + label(target) + ' attiva' }),
      wireParameter({ caption: 'Livello → ' + label(target), get: () => get().level, set: value => set({ level: value }), min: -90, max: 10, step: .1, unit: 'dB', compact, format: value => db(value) + ' dB' }, base + '/lvl'),
      wireSelect('Punto → ' + label(target), () => get().mode || (get().pre ? 'PRE' : 'POST'), full ? ['PRE', 'POST', 'GRP'] : ['PRE', 'POST'], value => set({ mode: value, pre: value === 'PRE' }), base + (full ? '/mode' : '/pre')));
    if (!compact && full) box.append(wireToggle('Pan link', () => get().panLink, value => set({ panLink: value }), base + '/plink'),
      wireParameter({ caption: 'Pan → ' + label(target), get: () => get().pan, set: value => set({ pan: value }), min: -100, max: 100, step: 1, disabled: () => !!get().panLink }, base + '/pan'),
      wireToggle('Segue mute', () => get().followMute !== false, value => set({ followMute: value }), base + '/pon'));
    destination.append(box);
  }
  function renderDeviceSend(destination, expanded) {
    const selected = selectedDeviceSend(), direction = sendDirection, peers = C().listStrips().filter(peer => direction === 'out' ? C().canSend(currentId, peer.id) : C().canSend(peer.id, currentId));
    if (!peers.length) { destination.append(note('Nessuna mandata disponibile per questa famiglia.')); return; }
    if (allowedGroups('out').length && allowedGroups('in').length) {
      const nav = el('div', 'editor-subtabs editor-send-direction'); nav.setAttribute('aria-label', 'Direzione delle mandate');
      for (const [value, label] of [['out', 'Invia a'], ['in', 'Riceve da']]) {
        const choice = button(label, () => { sendDirection = value; deviceSendId = ''; refreshDeviceChain(); }, 'editor-segment'); choice.setAttribute('aria-pressed', String(direction === value)); nav.append(choice);
      }
      destination.append(nav);
    }
    if (expanded) {
      const group = C().getStrip(selected).kind, family = peers.filter(peer => peer.kind === group), page = Math.floor(family.findIndex(peer => peer.id === selected) / SEND_PAGE_SIZE);
      sendBanks.set('device:' + direction + ':' + group, page);
      renderSendMixer(destination, { strip: sourceStrip(), direction, groups: [...new Set(peers.map(peer => peer.kind))], group, page,
        change(group, page) {
          const next = peers.filter(peer => peer.kind === group), bank = clamp(page ?? sendBanks.get('device:' + direction + ':' + group) ?? 0, 0, Math.max(0, Math.ceil(next.length / SEND_PAGE_SIZE) - 1));
          deviceSendId = next[bank * SEND_PAGE_SIZE]?.id || '';
          const scrollLeft = deviceChain?.scrollLeft, scrollTop = destination.scrollTop;
          refreshDeviceChain();
          if (deviceChain) deviceChain.scrollLeft = scrollLeft;
          destination.scrollTop = scrollTop;
        } });
    } else {
      destination.append(selectField(direction === 'out' ? 'Destinazione' : 'Sorgente mandata', () => selectedDeviceSend(), peers.map(peer => ({ value: peer.id, label: fullLabel(peer) })), value => { deviceSendId = value; refreshDeviceChain(); }));
      renderSendSummary(destination, selected, direction);
      destination.append(button('Apri mixer · 8 mandate', () => openDevice('sends'), 'editor-link-button editor-send-open', 'Apri otto mandate'));
    }
    if (isChannel() && direction === 'out') {
      const chain = window.SculptChannelChain;
      const selector = selectField('TAP mandate PRE', () => chain?.snapshot(currentId).tap || '', TAP_INPUT, value => moveDeviceTap(value), { disabled: () => !chain?.snapshot(currentId).items.find(item => item.id === 'sends')?.movable });
      if (expanded) {
        const common = disclosure('TAP / EQ delle mandate PRE', selector, note('Il TAP è comune alle mandate PRE del canale.'));
        common.classList.add('editor-send-common'); renderDevicePreSendEQ(common); destination.append(common);
      } else destination.append(selector, note('Il TAP è comune alle mandate PRE del canale.'));
    }
  }
  function renderDevicePreSendEQ(destination) {
    const base = window.SculptWingMap?.stripPath(currentId), read = () => channel().sendEQ;
    const setBand = (index, key, value) => { const data = clone(read()); data.bands[index][key] = value; patchChannel({ sendEQ: data }); };
    const wrap = disclosure('EQ delle mandate PRE');
    wrap.append(wireParameter({ caption: 'Width mandate PRE', get: () => channel().tapWidth, set: value => patchChannel({ tapWidth: value }), min: -150, max: 150, step: 5, unit: '%' }, base + '/tapwid'),
      wireToggle('PRE SEND EQ', () => !!read().enabled, value => patchObject('sendEQ', { enabled: value }), base + '/peq/on'));
    for (let i = 0; i < 3; i++) {
      const band = module('Banda ' + (i + 1));
      band.append(wireParameter({ caption: 'PRE EQ ' + (i + 1) + ' frequenza', get: () => read().bands[i].freq, set: value => setBand(i, 'freq', value), min: 20, max: 20000, step: 1, log: true, unit: 'Hz' }, base + '/peq/' + (i + 1) + 'f'),
        wireParameter({ caption: 'PRE EQ ' + (i + 1) + ' gain', get: () => read().bands[i].gain, set: value => setBand(i, 'gain', value), min: -15, max: 15, step: .1, unit: 'dB' }, base + '/peq/' + (i + 1) + 'g'),
        wireParameter({ caption: 'PRE EQ ' + (i + 1) + ' Q', get: () => read().bands[i].q, set: value => setBand(i, 'q', value), min: .44, max: 10, step: .01, log: true }, base + '/peq/' + (i + 1) + 'q'));
      wrap.append(band);
    }
    destination.append(wrap);
  }
  function renderDeviceMaster(destination, expanded) {
    const base = window.SculptWingMap?.stripPath(currentId), parameters = el('div', 'editor-device-main-parameters');
    parameters.append(wireParameter({ caption: 'Fader', get: () => sourceStrip().level, set: value => patch({ level: value }), min: -90, max: 10, step: .1, unit: 'dB', compact: !expanded, format: value => db(value) + ' dB' }, base + '/fdr'),
      wireParameter({ caption: 'Pan', get: () => sourceStrip().pan, set: value => patch({ pan: value }), min: -100, max: 100, step: 1, compact: !expanded, format: value => value === 0 ? 'C' : Math.abs(value) + (value < 0 ? ' L' : ' R') }, base + '/pan'));
    destination.append(parameters);
    const actions = el('div', 'editor-button-row');
    actions.append(wireToggle('MUTE', () => sourceStrip().mute, value => patch({ mute: value }), base + '/mute', { className: 'editor-mute', ariaLabel: 'Mute del canale' }),
      wireToggle('SOLO', () => channel().solo, value => D().setSolo(currentId, value), base + '/$solo', { className: 'editor-solo' }));
    destination.append(actions);
    if (expanded) {
      destination.append(wireParameter({ caption: 'Width', get: () => channel().width, set: value => patchChannel({ width: value }), min: -150, max: 150, step: 5, unit: '%' }, base + '/wid'));
      for (const target of devicePeers(true)) { const box = module(label(target)); renderDeviceSendControls(box, target.id, true); destination.append(box); }
      if (!isInput()) { const previous = panel; panel = destination; try { renderOutputAssignments(); } finally { panel = previous; } }
    }
  }
  function deviceReadPaths(key, expanded) {
    const base = window.SculptWingMap?.stripPath(currentId); if (!base) return [];
    if (key === 'home') return [base, ...(expanded ? [...Array.from({ length: 16 }, (_, index) => '/dca/' + (index + 1)), ...Array.from({ length: 8 }, (_, index) => '/mgrp/' + (index + 1)), '/cfg/amix', ...(isChannel() ? [base + '/postins'] : [])] : [])];
    if (key === 'input') {
      const paths = isInput() ? [base + '/in/conn', base + '/in/set', ...(channel()?.sourceAuto ? ['/io/altsw'] : [])] : [base, base + '/in/set', base + '/dly'];
      if (isChannel()) paths.push(base + '/flt');
      const source = isInput() && activeSourceKnown() && activeSource(), sourcePath = source && window.SculptWingMap?.sourcePath(source.id);
      if (sourcePath) paths.push(sourcePath);
      const headamp = isInput() && headampSource(), headampPath = headamp && window.SculptWingMap?.sourcePath(headamp.id);
      if (headampPath && headampPath !== sourcePath) paths.push(headampPath);
      return paths;
    }
    if (key === 'master') return [base, ...(expanded ? devicePeers(true).map(peer => window.SculptWingMap?.sendBasePath(currentId, peer.id)) : [])];
    if (key === 'sends') {
      const selected = selectedDeviceSend(), direction = sendDirection, peers = sendPeers(sourceStrip(), direction, C().getStrip(selected)?.kind);
      const first = Math.floor(peers.findIndex(peer => peer.id === selected) / SEND_PAGE_SIZE) * SEND_PAGE_SIZE;
      const visible = expanded ? peers.slice(first, first + SEND_PAGE_SIZE).map(peer => peer.id) : [selected];
      return [...visible.map(peerId => window.SculptWingMap?.sendBasePath(direction === 'out' ? currentId : peerId, direction === 'out' ? peerId : currentId)),
        ...(direction === 'in' ? visible.filter(peerId => C().getStrip(peerId)?.kind === 'CH').map(peerId => window.SculptWingMap?.stripPath(peerId) + '/ptap') : isChannel() ? [base + '/ptap', ...(expanded ? [base + '/peq', base + '/tapwid'] : [])] : [])].filter(Boolean);
    }
    if (key === 'pre' || key === 'post') return [base + '/' + key + 'ins'];
    if (expanded && (key === 'gate' || key === 'dyn')) return [base + '/' + (key === 'gate' ? 'gatesc' : 'dynsc'), ...(key === 'dyn' && sourceStrip().kind !== 'AUX' ? [base + '/dynxo'] : [])];
    return [];
  }
  function ensureDeviceRead(entry, key, expanded) {
    const live = window.SculptLive;
    if (!live?.isLive?.() || !live.isConnected?.() || !live.readNode) return;
    const paths = deviceReadPaths(key, expanded), id = currentId, epoch = live.sessionToken?.(), readKey = [id, epoch, ...paths].join('|');
    if (!paths.length || entry.readKey === readKey) return;
    entry.readKey = readKey; entry.readPhase = 'loading'; entry.readError = '';
    const token = ++deviceReadSerial; entry.readToken = token;
    const valid = () => dialog?.open && id === currentId && deviceNodes.get(key) === entry && entry.readToken === token && live.sessionToken?.() === epoch && live.isConnected?.();
    Promise.resolve().then(async () => {
      for (const path of paths) { if (!valid()) return; await live.readNode(path); }
      if (valid()) { entry.readPhase = 'ready'; refreshDeviceChain(); }
    }).catch(error => { if (valid()) { entry.readPhase = 'error'; entry.readError = error?.message || String(error); refreshDeviceChain(); } });
  }

  function orderValue() {
    const raw = channel().order;
    if (Array.isArray(raw) && raw.length) return raw.filter(value => Object.hasOwn(ORDER_LABELS, value));
    if (typeof raw === 'string' && /^[GEDI]{4}$/.test(raw)) return [...raw].map(key => ({ G: 'gate', E: 'eq', D: 'dyn', I: 'insert' })[key]);
    return isChannel() ? ['gate', 'eq', 'dyn', 'insert'] : ['eq', 'dyn', 'insert'];
  }
  function selectedDevice() {
    return activeDevice;
  }
  function openDevice(key) {
    if (deviceSnapshot().items.find(item => item.id === key)?.available === false) return;
    activeDevice = key; const opening = !expandedDevices.has(key);
    if (!opening && !slotWindow()) expandedDevices.delete(key); else expandedDevices.add(key);
    refreshDeviceChain();
    if (opening && deviceNodes.get(key)) deviceNodes.get(key).content.scrollTop = 0;
    deviceNodes.get(key)?.item.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  function deviceState(key, descriptor) {
    const live = window.SculptLive, online = !!live?.isLive?.(), id = currentId, base = window.SculptWingMap?.stripPath(id);
    const title = DEVICE_LABELS[key], detail = descriptor || deviceSnapshot().items.find(item => item.id === key);
    if (detail?.available === false) return { name: title, accessibleName: title, model: 'Non disponibile su ' + sourceStrip().kind, state: 'unavailable', available: false, utility: true };
    if (['home', 'input', 'sends', 'master'].includes(key)) {
      const models = { home: 'Identità · stato', input: isInput() ? 'Ingresso · filtri' : 'Ingresso · formato', sends: detail?.badge || 'Mandate', master: 'Fader · pan · mute' };
      return { name: title, accessibleName: title, utility: true, available: true, model: models[key], state: 'active' };
    }
    if (key === 'pre' || key === 'post') {
      const slot = channel()?.[key + 'Fx'], proc = slot ? D().processor({ type: 'fx', slot }) : null;
      const assigned = wireKnown(base + '/' + key + 'ins/ins'), powerPath = base + '/' + key + 'ins/on';
      const modelKnown = slot && wireKnown('/fx/' + slot + '/mdl'), number = key === 'pre' ? 1 : 2;
      const name = !assigned ? 'Da leggere' : !slot ? 'Nessuno' : modelKnown ? window.SculptCatalog?.get({ type: 'fx', slot }, proc?.model)?.name || proc?.model || 'FX ' + slot : 'FX ' + slot;
      return { name: title, accessibleName: 'Insert ' + number, available: true, model: number + ' · ' + name + (key === 'post' ? ' · post-fader' : ''),
        state: !assigned ? 'unknown' : !slot ? 'empty' : !wireKnown(powerPath) ? 'unknown' : channel()[key + 'FxOn'] === false ? 'bypass' : 'active',
        on: assigned && wireKnown(powerPath) && channel()[key + 'FxOn'] !== false, canBypass: assigned && !!slot && wireEditable(powerPath),
        toggle: () => D().patchChannel(id, { [key + 'FxOn']: channel()[key + 'FxOn'] === false }) };
    }
    const ctx = { type: 'strip', id, block: key }, proc = D().processor(ctx), spec = window.SculptWingMap?.processorSpec?.(ctx, proc?.model);
    const modelKnown = !online || wireKnown(spec?.modelPath), powerKnown = !online || wireKnown(spec?.enabledPath);
    return { name: title, accessibleName: title, available: true, model: !modelKnown ? 'Da leggere' : (window.SculptCatalog?.get(ctx, proc?.model)?.name || proc?.model || '—') + (detail?.badge ? ' · ' + detail.badge : ''),
      state: !modelKnown || !powerKnown ? 'unknown' : proc?.enabled === false ? 'bypass' : 'active',
      on: powerKnown && proc?.enabled !== false, canBypass: !!proc && wireEditable(spec?.enabledPath),
      toggle: () => D().enableProcessor(ctx, !D().processor(ctx)?.enabled) };
  }
  function renderDeviceCuts(destination, expanded) {
    const live = window.SculptLive, base = window.SculptWingMap?.stripPath(currentId) + '/flt';
    const known = suffix => !live?.isLive?.() || !!(live.isConnected?.() && live.hasValue?.(base + '/' + suffix) && live.metadata?.(base + '/' + suffix));
    const editable = suffix => known(suffix) && (!live?.isLive?.() || live.isWritable?.() && !live.metadata(base + '/' + suffix).readOnly);
    const cuts = el('div', 'editor-device-cuts'); destination.append(cuts);
    for (const [name, key, wire] of [['Low cut', 'low', 'lc'], ['High cut', 'high', 'hc']]) {
      const group = el('div', 'editor-device-cut'), fieldKey = key + 'Cut', meta = live?.metadata?.(base + '/' + wire + 'f');
      group.append(toggle(name.toUpperCase(), () => known(wire) && !!channel()[fieldKey + 'On'], value => patchChannel({ [fieldKey + 'On']: value }), { disabled: () => !editable(wire) }));
      const value = parameter({ caption: name, get: () => channel()[fieldKey], set: next => patchChannel({ [fieldKey]: next }), min: meta?.min ?? (key === 'low' ? 20 : 50), max: meta?.max ?? (key === 'low' ? 2000 : 20000), step: 1, log: true, unit: 'Hz', compact: true, disabled: () => !editable(wire + 'f') });
      bind(() => { if (!known(wire + 'f')) { const input = value.querySelector('input'); if (input) { input.value = ''; input.placeholder = '—'; } const output = value.querySelector('output'); if (output) output.textContent = '—'; } });
      group.append(value);
      if (expanded) {
        const items = live?.metadata?.(base + '/' + wire + 's')?.items;
        const options = items?.length ? items.map(item => ({ value: String(item.value), label: item.label || String(item.value) + ' dB/oct' })) : (key === 'low' ? [6, 12, 18, 24] : [6, 12]).map(number => ({ value: number, label: number + ' dB/oct' }));
        group.append(selectField('Pendenza ' + name.toLowerCase(), () => channel()[key + 'Slope'], options, value => patchChannel({ [key + 'Slope']: Number(value) }), { disabled: () => !editable(wire + 's') }));
      }
      cuts.append(group);
    }
  }
  function setDeviceStatus(text) {
    if (deviceDragHelp) deviceDragHelp.textContent = text;
  }
  function clearDeviceMove() {
    deviceDrag = null;
    deviceTapPalette?.remove(); deviceTapPalette = null;
    if (deviceChain) deviceChain.dataset.reordering = 'false';
    for (const entry of deviceNodes.values()) { entry.item.dataset.dragging = 'false'; delete entry.item.dataset.drop; entry.drag.setAttribute('aria-pressed', 'false'); }
  }
  async function commitDeviceMove(targetId) {
    const gesture = deviceDrag; if (!gesture) return false;
    clearDeviceMove(); setDeviceStatus('Conferma dello spostamento…');
    try {
      await window.SculptChannelChain.commit(gesture.token, targetId);
      if (dialog?.open && currentId === gesture.id) { refreshDeviceChain(); setDeviceStatus('Spostamento confermato.'); }
      return true;
    } catch (error) {
      if (dialog?.open && currentId === gesture.id) { refreshDeviceChain(); setDeviceStatus(error?.message || String(error)); toast(error?.message || String(error)); }
      return false;
    }
  }
  async function moveDeviceTap(value) {
    if (!startDeviceMove('sends', null, false)) return;
    await commitDeviceMove('tap:' + value);
  }
  function startDeviceMove(key, event, showPalette = true) {
    const chain = window.SculptChannelChain;
    if (!chain) return false;
    clearDeviceMove();
    try {
      const token = chain.begin(currentId, key), targets = chain.targets(token);
      deviceDrag = { id: currentId, key, token, targets };
      deviceChain.dataset.reordering = 'true';
      const entry = deviceNodes.get(key); if (entry) { entry.item.dataset.dragging = 'true'; entry.drag.setAttribute('aria-pressed', 'true'); }
      if (event?.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-sculpt-wing-device', key); event.dataTransfer.setData('text/plain', DEVICE_LABELS[key]); }
      setDeviceStatus(key === 'sends' ? 'Scegli il punto di prelievo delle mandate PRE. PFL precede il fader; AFL lo segue.' : 'Trascina fra Gate, EQ, Comp e Insert 1 oppure scegli una destinazione. Esc annulla.');
      if (showPalette) {
        deviceTapPalette = el('div', 'editor-device-tap-palette'); deviceTapPalette.setAttribute('role', 'group'); deviceTapPalette.setAttribute('aria-label', key === 'sends' ? 'Punti TAP WING' : 'Sposta ' + (entry?.name.textContent || key));
        const heading = el('div', 'editor-device-tap-title'), choices = el('div', 'editor-device-tap-options');
        heading.append(el('strong', '', key === 'sends' ? 'TAP delle mandate PRE' : 'Sposta ' + (entry?.name.textContent || key)), button('×', clearDeviceMove, '', 'Annulla spostamento'));
        for (const target of targets) {
          const choice = button(target.label, () => commitDeviceMove(target.id), 'editor-device-tap-choice');
          choice.dataset.target = target.id; choice.disabled = target.enabled === false; choice.title = target.reason || target.label;
          choice.setAttribute('aria-pressed', String(key === 'sends' && chain.snapshot(currentId).tap === target.value));
          choice.addEventListener('dragover', ev => { if (!deviceDrag || choice.disabled) return; ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'; choice.dataset.drop = 'true'; });
          choice.addEventListener('dragleave', () => { delete choice.dataset.drop; });
          choice.addEventListener('drop', ev => { if (!deviceDrag || choice.disabled) return; ev.preventDefault(); ev.stopPropagation(); commitDeviceMove(target.id); });
          choices.append(choice);
        }
        deviceTapPalette.append(heading, choices); panel.append(deviceTapPalette);
        if (!event) choices.querySelector('button:not(:disabled)')?.focus();
      }
      return true;
    } catch (error) { event?.preventDefault(); setDeviceStatus(error?.message || String(error)); return false; }
  }
  function deviceDropTarget(key, event) {
    if (!deviceDrag || deviceDrag.key === 'sends' || deviceDrag.id !== currentId) return null;
    const node = deviceNodes.get(key)?.item, box = node?.getBoundingClientRect();
    if (!box) return null;
    const position = event.clientX < box.left + box.width / 2 ? 'before' : 'after';
    return deviceDrag.targets.find(target => target.kind === 'proc' && target.targetKey === key && target.position === position && target.enabled !== false) || null;
  }
  function renderDeviceInsertAssignment(destination, key) {
    const base = window.SculptWingMap?.stripPath(currentId), current = currentId;
    const choices = [{ value: '', label: 'Nessuno' }, ...D().get().fx.map(fx => ({ value: String(fx.slot), label: 'FX ' + fx.slot + (wireKnown('/fx/' + fx.slot + '/mdl') ? ' · ' + (window.SculptCatalog?.get({ type: 'fx', slot: fx.slot }, fx.model)?.name || fx.model) : '') }))];
    destination.append(wireSelect('Assegna Insert ' + (key === 'pre' ? '1' : '2'), () => channel()?.[key + 'Fx'] || '', choices, value => {
      const old = channel()?.[key + 'Fx'];
      if (value) D().assignFx(Number(value), current, key); else if (old) D().assignFx(old, null, key);
    }, base + '/' + key + 'ins/ins'));
    if (key === 'post' && isChannel()) destination.append(button('Automix / gruppi', revealHomeGroups, 'editor-link-button'));
  }
  function renderDeviceContents(entry, key, data, expanded) {
    // Finish a typed edit against its captured source before replacing a card
    // after a routing/schema change. Its detached controls are invalidated next.
    if (entry.content.contains(document.activeElement) && document.activeElement.matches('input,select')) document.activeElement.blur();
    entry.cleanup?.(); entry.cleanup = null; entry.content.replaceChildren(); entry.updates = [];
    const scope = { active: true }, localCleanups = [], previousBindings = bindings, previousCleanups = cleanups, previousScope = deviceControlScope, wasRendering = rendering;
    bindings = entry.updates; cleanups = localCleanups; deviceControlScope = scope; rendering = true;
    try {
      if (data.available === false) entry.content.append(note(data.model));
      else if (key === 'home') renderDeviceHome(entry.content, expanded);
      else if (key === 'input') renderDevicePre(entry.content, expanded);
      else if (key === 'sends') renderDeviceSend(entry.content, expanded);
      else if (key === 'master') renderDeviceMaster(entry.content, expanded);
      else {
        const insert = key === 'pre' || key === 'post', slot = insert ? channel()?.[key + 'Fx'] : null;
        if (insert) renderDeviceInsertAssignment(entry.content, key);
        if (insert && (!slot || data.state === 'unknown')) entry.content.append(note(data.state === 'unknown' ? 'Assegnazione da leggere dalla WING.' : 'Nessun FX assegnato a questo insert.'));
        else {
          const ctx = insert ? { type: 'fx', slot } : { type: 'strip', id: currentId, block: key }, host = el('div', expanded ? 'editor-plugin-host editor-device-full' : 'editor-device-principal');
          entry.content.append(host);
          const dispose = expanded ? window.SculptFX?.renderProcessor(host, ctx, { rotaryBank: true, fullControls: slotWindow() }) : window.SculptFX?.renderPrincipal?.(host, ctx);
          if (typeof dispose === 'function') localCleanups.push(dispose);
          if (expanded && ['gate', 'dyn'].includes(key)) {
            const base = window.SculptWingMap?.stripPath(currentId), sc = base + '/' + (key === 'gate' ? 'gatesc' : 'dynsc');
            if (['src', 'tap', 'type', 'f', 'q', '$solo'].every(leaf => wireKnown(sc + '/' + leaf))) renderSidechain(key, entry.content);
            else entry.content.append(note('Sidechain in lettura; i parametri del processore restano disponibili.'));
          }
        }
      }
      entry.readStatus = el('div', 'editor-device-read-status'); entry.readStatus.setAttribute('role', 'status'); entry.content.append(entry.readStatus);
      if (slotWindow()) {
        // Full slot windows start with all auxiliary sections visible. The
        // processor may rebuild asynchronously after reading its live model.
        const opened = new WeakSet();
        const reveal = () => { for (const details of entry.content.querySelectorAll('details')) if (!opened.has(details)) { opened.add(details); details.open = true; } };
        reveal();
        if (typeof MutationObserver === 'function') {
          const observer = new MutationObserver(reveal); observer.observe(entry.content, { childList: true, subtree: true });
          localCleanups.push(() => observer.disconnect());
        }
      }
    } finally { bindings = previousBindings; cleanups = previousCleanups; deviceControlScope = previousScope; rendering = wasRendering; }
    entry.cleanup = () => { scope.active = false; for (const dispose of localCleanups) dispose(); };
  }
  function refreshDeviceChain() {
    if (!deviceChain?.isConnected || !sourceStrip() || refreshingDevices) return;
    refreshingDevices = true;
    try {
      const snapshot = deviceSnapshot(), id = currentId, floating = slotWindow();
      if (floating) snapshot.items = snapshot.items.filter(item => item.id === activeDevice);
      const modules = snapshot.items.map(item => item.id), chainKey = id + (floating ? ':window:' + activeDevice : ':board');
      deviceChain.classList.toggle('editor-device-window', floating);
      deviceChain.setAttribute('aria-label', floating ? 'Tutti i controlli · ' + (DEVICE_LABELS[activeDevice] || activeDevice) : 'Moduli del canale · espansione orizzontale');
      if (deviceChainKey !== chainKey) {
        clearDeviceMove();
        for (const entry of deviceNodes.values()) entry.cleanup?.();
        deviceNodes.clear(); deviceChain.replaceChildren(); deviceChainKey = chainKey;
      }
      for (const descriptor of snapshot.items) {
        const key = descriptor.id; if (deviceNodes.has(key)) continue;
        const item = el('section', 'editor-device editor-device-panel'); item.dataset.module = key;
        item.dataset.deviceRole = ({ input: 'pre', dyn: 'comp', pre: 'insert', post: 'insert', sends: 'send' })[key] || key;
        const head = el('header', 'editor-device-header'), drag = el('button', 'editor-device-drag'); drag.type = 'button'; drag.setAttribute('aria-describedby', 'editor-device-drag-help');
        drag.addEventListener('click', () => { if (dialog.open && id === currentId) { if (deviceDrag?.key === key) clearDeviceMove(); else startDeviceMove(key); } });
        drag.addEventListener('dragstart', event => { if (!dialog.open || id !== currentId || !startDeviceMove(key, event)) event.preventDefault(); });
        drag.addEventListener('dragend', () => { if (deviceDrag) clearDeviceMove(); });
        const choose = el('button', 'editor-device-select'); choose.type = 'button'; choose.id = 'editor-device-' + key;
        const name = el('span', 'editor-device-label'), model = el('span', 'editor-device-model'); choose.append(name, model);
        choose.addEventListener('click', () => { if (dialog.open && currentId === id) openDevice(key); });
        choose.addEventListener('keydown', event => {
          const order = deviceSnapshot().items.filter(item => item.available !== false).map(item => item.id), index = order.indexOf(key); let next;
          if (event.key === 'ArrowRight') next = (index + 1) % order.length;
          else if (event.key === 'ArrowLeft') next = (index + order.length - 1) % order.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = order.length - 1;
          if (next === undefined) return; event.preventDefault(); activeDevice = order[next]; refreshDeviceChain(); deviceNodes.get(order[next])?.choose.focus();
        });
        const power = el('button', 'editor-device-bypass', 'IN'); power.type = 'button';
        power.addEventListener('click', () => { if (!dialog.open || currentId !== id) return; const state = deviceState(key); if (state.canBypass) state.toggle(); });
        const expand = el('button', 'editor-device-expand'); expand.type = 'button'; expand.addEventListener('click', () => { if (dialog.open && currentId === id) openDevice(key); });
        const content = el('div', 'editor-device-content'); content.id = 'editor-device-content-' + key;
        choose.setAttribute('aria-controls', content.id); expand.setAttribute('aria-controls', content.id);
        head.append(drag, power, choose, expand); item.append(head, content); deviceChain.append(item);
        item.addEventListener('dragover', event => {
          const target = deviceDropTarget(key, event); if (!target) return;
          event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          for (const entry of deviceNodes.values()) delete entry.item.dataset.drop;
          item.dataset.drop = target.position;
        });
        item.addEventListener('dragleave', event => { if (!item.contains(event.relatedTarget)) delete item.dataset.drop; });
        item.addEventListener('drop', event => { const target = deviceDropTarget(key, event); if (!target) return; event.preventDefault(); event.stopPropagation(); commitDeviceMove(target.id); });
        deviceNodes.set(key, { item, choose, name, model, power, expand, drag, content, signature: '', contentKey: '', cleanup: null });
      }
      const focused = deviceChain.contains(document.activeElement) ? document.activeElement : null;
      for (let i = 0; i < modules.length; i++) {
        const node = deviceNodes.get(modules[i]).item, before = deviceChain.children[i];
        if (node !== before) { if (typeof deviceChain.moveBefore === 'function') deviceChain.moveBefore(node, before || null); else deviceChain.insertBefore(node, before || null); }
      }
      if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
      for (const descriptor of snapshot.items) {
        const key = descriptor.id, entry = deviceNodes.get(key), data = deviceState(key, descriptor), selected = key === selectedDevice(), expanded = floating || expandedDevices.has(key);
        const headerKey = [data.name, data.model, data.state, data.available, data.utility, data.canBypass, data.on, selected, expanded, descriptor.movable, descriptor.reason].join('|');
        if (headerKey !== entry.signature) {
        entry.signature = headerKey;
        entry.name.textContent = data.name; entry.model.textContent = data.model;
        entry.item.dataset.state = data.state; entry.item.dataset.expanded = String(expanded); entry.item.dataset.reorderable = String(!!descriptor.movable); entry.item.classList.toggle('is-selected', selected);
        entry.choose.setAttribute('aria-pressed', String(selected)); entry.choose.setAttribute('aria-label', data.accessibleName + ' · ' + data.model); entry.choose.setAttribute('aria-expanded', String(expanded));
        entry.expand.disabled = data.available === false; entry.expand.setAttribute('aria-expanded', String(expanded)); entry.expand.setAttribute('aria-label', (expanded ? 'Riduci ' : 'Espandi ') + data.accessibleName); entry.expand.textContent = expanded ? '↔' : '›'; entry.expand.title = expanded ? 'Mostra i parametri principali' : 'Espandi in larghezza · tutti i controlli';
        entry.power.hidden = !!data.utility; entry.power.disabled = !data.canBypass; entry.power.textContent = data.state === 'unknown' ? '—' : data.on ? 'IN' : 'BYP'; entry.power.setAttribute('aria-pressed', String(!!data.on)); entry.power.setAttribute('aria-label', data.accessibleName + ' attivo');
        entry.drag.draggable = !!descriptor.movable; entry.drag.disabled = !descriptor.movable; entry.drag.setAttribute('aria-label', 'Sposta ' + data.accessibleName); entry.drag.title = descriptor.movable ? (key === 'sends' ? 'Sposta il TAP delle mandate PRE' : 'Sposta il blocco nel percorso WING') : descriptor.reason || 'Posizione fissa nella WING';
        entry.choose.disabled = data.available === false;
        }
        if (data.available !== false) ensureDeviceRead(entry, key, expanded);
        if (key === 'input' && (expanded || !isInput())) ensureDelayRead();
        const sourceKey = key === 'input' || key === 'home' ? [channel()?.source, channel()?.altSource, channel()?.useAlt, channel()?.sourceAuto, D().get().io?.globalAlt, activeSource()?.preamp, isInput() ? activeSourceKnown() : true, key === 'input' ? headampSource()?.id : '', key === 'input' ? headampSource()?.preamp : ''].join(',') : '';
        const readPaths = deviceReadPaths(key, expanded), live = window.SculptLive;
        const schema = live?.isLive?.() ? readPaths.map(path => live.metadata?.(path)?.revision || '').join(',') + ':' + entry.readPhase : '';
        const contentKey = [id, key, expanded, data.available, sourceKey, key === 'home' ? homeContentKey() : '', key === 'input' ? delayDisplayKey() : '', key === 'sends' ? selectedDeviceSend() + ':' + sendDirection + ':' + deviceSendSchema(expanded) : '', key === 'pre' || key === 'post' ? channel()?.[key + 'Fx'] || '' : '', live?.sessionToken?.() || '', schema].join('|');
        if (contentKey !== entry.contentKey) { entry.contentKey = contentKey; renderDeviceContents(entry, key, data, expanded); }
        for (const update of entry.updates || []) update();
        if (entry.readStatus) { entry.readStatus.textContent = entry.readPhase === 'error' ? entry.readError : entry.readPhase === 'loading' ? 'Lettura WING…' : ''; entry.readStatus.hidden = !entry.readStatus.textContent; }
      }
    } finally { refreshingDevices = false; }
  }
  function renderDevices() {
    deviceChainKey = ''; deviceChain = el('div', 'editor-device-chain editor-device-board');
    deviceChain.setAttribute('aria-label', 'Moduli del canale · espansione orizzontale');
    deviceDragHelp = el('p', 'editor-device-drag-help', 'Trascina una maniglia per spostare i blocchi consentiti dalla WING.'); deviceDragHelp.id = 'editor-device-drag-help'; deviceDragHelp.setAttribute('role', 'status'); deviceDragHelp.setAttribute('aria-live', 'polite');
    panel.append(deviceChain, deviceDragHelp);
    const cancel = event => { if (event.key === 'Escape' && deviceDrag) { event.preventDefault(); event.stopPropagation(); clearDeviceMove(); } };
    panel.addEventListener('keydown', cancel);
    const board = deviceChain;
    cleanups.push(() => { deviceScrollLeft = board.scrollLeft; clearDeviceMove(); panel.removeEventListener('keydown', cancel); for (const entry of deviceNodes.values()) entry.cleanup?.(); deviceNodes.clear(); deviceChainKey = ''; });
    const chain = window.SculptChannelChain, id = currentId;
    if (chain) {
      const unsubscribe = chain.bind(id, () => { if (currentId === id && activeTab === 'devices') refreshDeviceChain(); });
      if (typeof unsubscribe === 'function') cleanups.push(unsubscribe);
      Promise.resolve(chain.prepare(id)).catch(error => { if (dialog?.open && currentId === id) setDeviceStatus(error?.message || String(error)); });
    }
    refreshDeviceChain();
    deviceChain.scrollLeft = deviceScrollLeft;
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
      const filter = module('Filtri d’ingresso'); filter.classList.add('editor-module-filters'); filter.id = 'editor-filter-section';
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
    renderDelay(panel);
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
    const wrap = disclosure('Tap e EQ delle mandate PRE'); wrap.classList.add('editor-presend');
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

  function renderSidechain(block, destination = panel) {
    const key = block === 'gate' ? 'gateSC' : 'dynSC';
    const get = () => channel()[key];
    const patchSC = changes => patchObject(key, changes);
    const scope = isChannel() ? C().listStrips().filter(strip => strip.kind === 'CH') : C().listStrips().filter(strip => strip.kind !== 'CH');
    const srcOptions = [{ value: 'SELF', label: 'Self · questo canale' }, ...scope.map(strip => ({ value: strip.id, label: fullLabel(strip) }))];
    const pane = disclosure(block === 'gate' ? 'Sidechain del gate' : 'Sidechain della dinamica'); pane.classList.add('editor-sidechain'); pane.open = true;
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
    destination.append(pane);
    if (block === 'dyn' && sourceStrip().kind !== 'AUX') {
      const read = () => channel().dynCrossover;
      const crossover = disclosure('Dynamics crossover'); crossover.classList.add('editor-crossover');
      crossover.append(selectField('Tipo crossover', () => read().type || 'OFF', ['OFF', 'LO', 'HI', 'S6', 'S12', 'PEAK'], value => patchObject('dynCrossover', { type: value })), grid(
        parameter({ caption: 'Crossover frequenza', get: () => read().frequency || 1000, set: value => patchObject('dynCrossover', { frequency: value }), min: 20, max: 20000, step: 1, log: true, unit: 'Hz' }),
        parameter({ caption: 'Crossover depth', get: () => read().depth ?? 6, set: value => patchObject('dynCrossover', { depth: value }), min: 0, max: 20, step: .5, unit: 'dB' }),
        parameter({ caption: 'Crossover Q', get: () => read().q || 1, set: value => patchObject('dynCrossover', { q: value }), min: .4, max: 4, step: .01, log: true })
      ), toggle('Ascolta crossover', () => !!read().listen, value => patchObject('dynCrossover', { listen: value }), { ariaLabel: 'Solo crossover' }));
      destination.append(crossover);
    }
  }

  function renderDynamics() {
    if (isChannel()) {
      const nav = el('div', 'editor-subtabs'); nav.setAttribute('aria-label', 'Punto di elaborazione');
      [['gate', 'Gate'], ['dyn', 'Dynamics']].forEach(([block, caption]) => {
        const choice = button(caption, () => { dynamicsBlock = block; renderPanel(); }, 'editor-segment', `Slot ${caption}`);
        choice.setAttribute('aria-pressed', String(dynamicsBlock === block)); nav.append(choice);
      }); panel.append(nav);
    }
    renderProcessor(dynamicsBlock);
    const details = el('div', 'editor-dynamics-details'); panel.append(details);
    renderSidechain(dynamicsBlock, details);
  }

  function allowedGroups(direction) {
    const strip = sourceStrip();
    return [...new Set(C().listStrips().filter(other => direction === 'out' ? C().canSend(strip.id, other.id) : C().canSend(other.id, strip.id)).map(other => other.kind))];
  }
  function sendView() {
    const strip = sourceStrip(), outGroups = allowedGroups('out'), inGroups = allowedGroups('in');
    if (!outGroups.length) sendDirection = 'in';
    if (!inGroups.length) sendDirection = 'out';
    const groups = sendDirection === 'out' ? outGroups : inGroups;
    if (!groups.includes(sendGroup)) sendGroup = groups[0] || '';
    return { strip, outGroups, inGroups, groups };
  }
  const SEND_PAGE_SIZE = 8;
  const sendBanks = new Map();
  function sendPeers(strip, direction, group) {
    return C().listStrips().filter(peer => peer.kind === group && (direction === 'out' ? C().canSend(strip.id, peer.id) : C().canSend(peer.id, strip.id)));
  }
  function sendSchemaKey(strip, direction, group, page = 0, selected = '') {
    const live = window.SculptLive;
    if (!live?.isLive?.()) return '';
    const peers = sendPeers(strip, direction, group), visible = selected ? peers.filter(peer => peer.id === selected) : peers.slice(page * SEND_PAGE_SIZE, (page + 1) * SEND_PAGE_SIZE);
    return JSON.stringify(visible.map(peer => ['level', 'on', 'mode', 'pan', 'panLink', 'followMute'].map(key => {
      const path = window.SculptWingMap?.sendPath(direction === 'out' ? strip.id : peer.id, direction === 'out' ? peer.id : strip.id, key), meta = live.metadata?.(path);
      return meta ? [meta.revision, meta.type, meta.min, meta.max, meta.step, meta.readOnly, meta.items] : null;
    })));
  }
  function deviceSendSchema(expanded) {
    const selected = selectedDeviceSend(), group = C().getStrip(selected)?.kind, peers = sendPeers(sourceStrip(), sendDirection, group);
    return sendSchemaKey(sourceStrip(), sendDirection, group, Math.floor(peers.findIndex(peer => peer.id === selected) / SEND_PAGE_SIZE), expanded ? '' : selected);
  }
  function sendKnown(path, type = 'number') {
    const live = window.SculptLive;
    if (!live?.isLive?.()) return true;
    if (!wireKnown(path)) return false;
    const meta = live.metadata(path);
    return type === 'mode' ? meta.type === 5 && Array.isArray(meta.items) && meta.items.length > 0 : [1, 2, 3, 4, 6].includes(meta.type);
  }
  function sendEditable(path, type = 'number') {
    return sendKnown(path, type) && wireEditable(path);
  }
  function sendNumeric(options, path) {
    const active = controlActive(), live = window.SculptLive, meta = live?.isLive?.() ? live.metadata?.(path) : null;
    // UI limits also respect the model's representable range (−90 dB is −∞).
    const min = Math.max(options.min, Number.isFinite(meta?.min) ? meta.min : options.min), max = Math.min(options.max, Number.isFinite(meta?.max) ? meta.max : options.max);
    const disabled = () => !sendEditable(path) || !!options.disabled?.();
    const commit = value => {
      if (!active() || disabled() || !Number.isFinite(value)) return;
      const definition = window.SculptLive?.isLive?.() ? window.SculptLive.metadata?.(path) : null;
      const low = Math.max(options.min, Number.isFinite(definition?.min) ? definition.min : options.min), high = Math.min(options.max, Number.isFinite(definition?.max) ? definition.max : options.max);
      const next = clamp(value, low, high);
      if (definition?.type === 6 && !definition.items?.some(item => item.value === next)) return;
      options.set(next);
    };
    const node = parameter({ ...options, min, max, set: commit, disabled });
    bind(() => {
      const known = sendKnown(path); node.dataset.known = String(known);
      if (known) return;
      const input = node.querySelector('.editor-number'), display = node.querySelector('output'), control = node.querySelector('.editor-range, .editor-knob');
      input.value = ''; input.placeholder = '—'; display.textContent = '—';
      control?.removeAttribute('aria-valuenow'); control?.setAttribute('aria-valuetext', 'Valore da leggere dalla WING');
    });
    if (options.pan) node.querySelector('.editor-knob').addEventListener('dblclick', () => commit(0));
    return node;
  }
  function sendModeChoices(path, full) {
    if (!full || !window.SculptLive?.isLive?.()) return ['PRE', 'POST'];
    // GRP is offered only when this exact destination's firmware enum includes it.
    return (window.SculptLive.metadata?.(path)?.items || []).map(item => String(item.value)).filter(value => ['PRE', 'POST', 'GRP'].includes(value));
  }
  function sendModeControl(peer, get, set, path, full) {
    const active = controlActive(), select = el('select', 'editor-select'), caption = 'Punto → ' + label(peer);
    select.setAttribute('aria-label', caption);
    let schema = '';
    select.addEventListener('change', () => {
      if (!active() || !sendEditable(path, full ? 'mode' : 'number')) return;
      const value = select.value;
      if (sendModeChoices(path, full).includes(value)) set({ mode: value, pre: value === 'PRE' });
    });
    bind(() => {
      const choices = sendModeChoices(path, full), key = choices.join('|'), known = sendKnown(path, full ? 'mode' : 'number');
      if (schema !== key || !select.childElementCount) {
        schema = key; select.replaceChildren();
        for (const value of choices) { const choice = el('option', '', value); choice.value = value; select.append(choice); }
      }
      select.value = known ? get().mode || (get().pre ? 'PRE' : 'POST') : '';
      select.disabled = !sendEditable(path, full ? 'mode' : 'number') || !choices.length;
      select.dataset.known = String(known);
    });
    return field(caption, select);
  }
  function renderSendSummary(destination, peerId, direction = 'out') {
    const sourceId = direction === 'out' ? currentId : peerId, targetId = direction === 'out' ? peerId : currentId, target = C().getStrip(targetId), full = ['CH', 'AUX'].includes(C().getStrip(sourceId)?.kind) && target.kind !== 'MAIN';
    const get = () => C().getSend(sourceId, targetId), set = changes => C().setSend(sourceId, targetId, changes), path = key => window.SculptWingMap?.sendPath(sourceId, targetId, key);
    const box = el('div', 'editor-device-send-controls');
    box.append(toggle('ON', () => sendKnown(path('on')) && get().on, value => { if (sendEditable(path('on'))) set({ on: value }); }, { ariaLabel: 'Mandata a ' + label(target) + ' attiva', disabled: () => !sendEditable(path('on')) }),
      sendNumeric({ caption: 'Livello → ' + label(target), get: () => get().level, set: value => set({ level: value }), min: -90, max: 10, step: .1, unit: 'dB', compact: true, format: value => db(value) + ' dB' }, path('level')),
      sendModeControl(target, get, set, path('mode'), full));
    destination.append(box);
  }
  function renderSendStrip(peer, sourceId, targetId, direction) {
    const source = C().getStrip(sourceId), target = C().getStrip(targetId), full = ['CH', 'AUX'].includes(source.kind) && target.kind !== 'MAIN';
    const get = () => C().getSend(sourceId, targetId), set = changes => C().setSend(sourceId, targetId, changes);
    const path = key => window.SculptWingMap?.sendPath(sourceId, targetId, key);
    const row = el('article', 'editor-send-row'); row.dataset.sourceId = sourceId; row.dataset.targetId = targetId; row.dataset.pan = String(full); row.dataset.sof = String(['BUS', 'MTX'].includes(target.kind));
    const head = el('div', 'editor-send-header'), name = el('div', 'editor-send-name'), code = el('span', '', label(peer)), title = el('strong');
    name.append(code, title); head.append(name); row.append(head);
    const on = button('ON', () => { if (sendEditable(path('on'))) set({ on: !get().on }); }, 'editor-send-on', `Mandata ${fullLabel(source)} a ${fullLabel(target)} attiva`);
    on.setAttribute('role', 'switch');
    bind(() => {
      const current = C().getStrip(peer.id), known = sendKnown(path('on')), enabled = known && !!get().on;
      title.textContent = current.name; name.title = fullLabel(current); row.style.setProperty('--send-color', current.color);
      row.setAttribute('aria-label', (direction === 'in' ? 'Da ' : 'A ') + fullLabel(current));
      on.disabled = !sendEditable(path('on')); on.dataset.known = String(known);
      on.setAttribute('aria-checked', String(enabled)); on.setAttribute('aria-pressed', String(enabled));
      row.classList.toggle('editor-send-enabled', enabled); on.textContent = known ? enabled ? 'ON' : 'OFF' : '—';
    });
    row.append(on);
    if (full) {
      const pan = sendNumeric({ caption: 'Pan → ' + label(peer), get: () => get().pan ?? 0, set: value => set({ pan: value }), min: -100, max: 100, step: 1, compact: true, pan: true,
        disabled: () => !sendKnown(path('panLink')) || !!get().panLink, format: value => value === 0 ? 'C' : `${Math.abs(value)} ${value < 0 ? 'L' : 'R'}` }, path('pan'));
      pan.classList.add('editor-send-pan'); row.append(pan);
    }
    row.append(sendNumeric({ caption: 'Livello → ' + label(peer), get: () => get().level, set: value => set({ level: value }), min: -90, max: 10, step: .1, unit: 'dB', compact: true, vertical: true, format: value => db(value) + ' dB' }, path('level')),
      sendModeControl(peer, get, set, path('mode'), full));
    if (full) {
      const controls = el('div', 'editor-send-switches');
      for (const [caption, key, ariaLabel] of [['Pan link', 'panLink', 'Pan link → ' + label(peer)], ['Segue mute', 'followMute', 'Mandata segue mute → ' + label(peer)]]) {
        controls.append(toggle(caption, () => sendKnown(path(key)) && (key === 'followMute' ? get()[key] !== false : !!get()[key]), value => { if (sendEditable(path(key))) set({ [key]: value }); }, { ariaLabel, disabled: () => !sendEditable(path(key)) }));
      }
      row.append(controls);
    }
    if (direction === 'in' && source.kind === 'CH') {
      row.append(disclosure('TAP PRE', wireSelect('Tap PRE di ' + label(source), () => inputTap(sourceId), TAP_INPUT, value => D().patchChannel(sourceId, { tap: value }), window.SculptWingMap?.stripPath(sourceId) + '/ptap'), note('Condiviso dalle mandate PRE di questa sorgente.')));
    }
    if (compactEditor() && ['BUS', 'MTX'].includes(target.kind)) row.append(button('SOF', () => { C().setSof(targetId); close(); }, 'editor-send-sof', 'Apri SOF ' + fullLabel(target)));
    return row;
  }
  function renderSendMixer(destination, { strip, direction, groups, group, page = 0, change }) {
    const active = controlActive();
    const peers = sendPeers(strip, direction, group), pageCount = Math.ceil(peers.length / SEND_PAGE_SIZE), bank = clamp(page, 0, Math.max(0, pageCount - 1));
    const mixer = el('section', 'editor-send-mixer'); mixer.dataset.sendPage = String(bank + 1); mixer.dataset.sendGroup = group;
    const toolbar = el('div', 'editor-send-toolbar'), groupBar = el('div', 'editor-send-groups');
    groupBar.setAttribute('role', 'group'); groupBar.setAttribute('aria-label', direction === 'out' ? 'Destinazioni delle mandate' : 'Sorgenti delle mandate');
    const choose = (nextGroup, nextBank, focus) => {
      if (!active()) return;
      change(nextGroup, nextBank);
      destination.querySelector(focus)?.focus({ preventScroll: true });
    };
    for (const family of groups) {
      const choice = button(family, () => choose(family, undefined, `[data-send-family="${family}"]`), '', `${direction === 'out' ? 'Mandate verso' : 'Riceve da'} ${family}`);
      choice.dataset.sendFamily = family; choice.setAttribute('aria-pressed', String(group === family)); groupBar.append(choice);
    }
    const pager = el('nav', 'editor-send-banks'); pager.setAttribute('aria-label', 'Banchi delle mandate');
    const previous = button('‹', () => choose(group, bank - 1, `[data-send-bank="${bank - 1}"]`), 'editor-send-bank-previous', 'Banco mandate precedente'); previous.disabled = bank === 0;
    const next = button('›', () => choose(group, bank + 1, `[data-send-bank="${bank + 1}"]`), 'editor-send-bank-next', 'Banco mandate successivo'); next.disabled = bank + 1 >= pageCount;
    pager.append(previous);
    for (let index = 0; index < pageCount; index++) {
      const first = index * SEND_PAGE_SIZE, last = Math.min(first + SEND_PAGE_SIZE, peers.length) - 1;
      const range = `${peers[first].number}–${peers[last].number}`;
      const choice = button(range, () => choose(group, index, `[data-send-bank="${index}"]`), 'editor-send-bank', `Banco ${group} ${range}`);
      choice.dataset.sendBank = String(index); choice.setAttribute('aria-pressed', String(bank === index)); choice.tabIndex = bank === index ? 0 : -1;
      choice.addEventListener('keydown', event => {
        const offset = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        const target = offset !== undefined ? clamp(index + offset, 0, pageCount - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? pageCount - 1 : null;
        if (target === null) return;
        event.preventDefault(); choose(group, target, `[data-send-bank="${target}"]`);
      });
      pager.append(choice);
    }
    pager.append(next); toolbar.append(groupBar, pager); mixer.append(toolbar);
    const list = el('div', 'editor-send-list'); list.setAttribute('aria-label', 'Fader delle mandate'); list.style.setProperty('--send-count', String(Math.min(SEND_PAGE_SIZE, peers.length)));
    for (const peer of peers.slice(bank * SEND_PAGE_SIZE, (bank + 1) * SEND_PAGE_SIZE)) list.append(renderSendStrip(peer, direction === 'out' ? strip.id : peer.id, direction === 'out' ? peer.id : strip.id, direction));
    mixer.append(list); destination.append(mixer);
  }
  function renderSends({ strip, outGroups, inGroups, groups }) {
    if (outGroups.length && inGroups.length) {
      const direction = el('div', 'editor-subtabs');
      [['out', 'Invia a'], ['in', 'Riceve da']].forEach(([value, text]) => {
        const choice = button(text, () => { sendDirection = value; sendGroup = ''; sendFilter = ''; renderPanel(false); }, 'editor-segment');
        choice.setAttribute('aria-pressed', String(value === sendDirection)); direction.append(choice);
      }); panel.append(direction);
    }
    if (!sendGroup) { panel.append(module('Mandate', note('Nessun percorso disponibile per questa famiglia.'))); return; }
    const key = 'page:' + sendDirection + ':' + sendGroup;
    renderSendMixer(panel, { strip, direction: sendDirection, groups, group: sendGroup, page: sendBanks.get(key) || 0,
      change(group, bank) {
        sendGroup = group;
        if (bank !== undefined) sendBanks.set('page:' + sendDirection + ':' + group, bank);
        renderPanel(false);
      } });
    if (sendDirection === 'out' && strip.kind === 'CH') {
      const common = disclosure('TAP delle mandate PRE', wireSelect('Tap PRE di ' + label(strip), () => inputTap(strip.id), TAP_INPUT, value => D().patchChannel(strip.id, { tap: value }), window.SculptWingMap?.stripPath(strip.id) + '/ptap'), note('Il TAP è comune alle mandate PRE del canale.'));
      common.classList.add('editor-send-common'); panel.append(common);
    }
  }

  function homeContentKey() {
    const live = window.SculptLive, base = window.SculptWingMap?.stripPath(currentId), mode = ['x', 'y'].find(key => D().get().automix[key]?.channels?.includes(currentId)) || 'off';
    const definitions = live?.isLive?.() ? [base + '/tags', base + '/postins/mode', base + '/postins/w', '/cfg/amix/x', '/cfg/amix/y'].map(path => {
      const meta = live.metadata?.(path); return meta ? [meta.type, meta.revision, meta.readOnly, meta.min, meta.max, meta.items] : null;
    }) : null;
    return JSON.stringify([homeGroupsExpanded, mode, definitions]);
  }
  function homeGroupsReady() {
    return !window.SculptLive?.isLive?.() || deviceNodes.get('home')?.readPhase === 'ready';
  }
  function groupKnown(path) { return homeGroupsReady() && wireKnown(path); }
  function groupEditable(path) { return homeGroupsReady() && wireEditable(path); }
  function revealHomeGroups() {
    homeGroupsExpanded = true; openDevicePage(currentId, 'home');
    const groups = deviceNodes.get('home')?.content.querySelector('.editor-home-groups');
    if (groups) { groups.open = true; groups.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
  }
  function renderMembership(title, key, stateKey) {
    const box = module(title), list = el('div', 'editor-membership-grid'), id = currentId, tags = window.SculptWingMap?.stripPath(id) + '/tags';
    const known = () => key !== 'dca' || groupKnown(tags), editable = () => key !== 'dca' ? !window.SculptLive?.isLive?.() : groupEditable(tags) && (!window.SculptLive?.isLive?.() || window.SculptLive.metadata?.(tags)?.type === 7);
    (D().get()[key] || []).forEach((group, index) => {
      const getGroup = () => D().get()[key][index];
      const choice = button('', () => {
        if (!editable()) return;
        D().change(state => {
          const item = state[key][index];
          item.members = item.members.includes(id) ? item.members.filter(member => member !== id) : [...item.members, id];
        }, 'groups');
      }, 'editor-membership');
      const code = el('span', 'editor-membership-code', `${key === 'dca' ? 'DCA' : 'MUTE'} ${index + 1}`), name = el('strong'), state = el('small'); choice.append(code, name, state);
      bind(() => {
        const item = getGroup(), assigned = known() && item.members.includes(id), base = '/dca/' + item.id;
        const nameKnown = key !== 'dca' || groupKnown(base + '/name'), valueKnown = key !== 'dca' || groupKnown(base + '/mute') && groupKnown(base + '/fdr');
        choice.setAttribute('aria-label', `${assigned ? 'Rimuovi da' : 'Assegna a'} ${key === 'dca' ? 'DCA' : 'Mute group'} ${index + 1} · ${nameKnown ? item.name : 'Da leggere'}`);
        choice.disabled = !editable(); choice.dataset.known = String(known());
        choice.setAttribute('aria-pressed', String(assigned)); choice.classList.toggle('editor-active', assigned);
        name.textContent = nameKnown ? item.name : '—'; state.textContent = !valueKnown ? '—' : item[stateKey] ? 'MUTE' : key === 'dca' ? `${db(item.level)} dB` : assigned ? 'Assegnato' : '—';
      }); list.append(choice);
    }); box.append(list); return box;
  }
  function renderGroups(destination = panel) {
    const id = currentId, base = window.SculptWingMap?.stripPath(id), live = window.SculptLive, online = !!live?.isLive?.();
    destination.append(renderMembership('DCA', 'dca', 'mute'));
    if (online) destination.append(module('Mute groups', note('Le assegnazioni ai mute group non sono esposte dalla mappa WING disponibile.'), button('Apri parametri WING', () => { close(); live.openExplorer?.('/mgrp'); }, 'editor-link-button')));
    else destination.append(renderMembership('Mute groups', 'muteGroups', 'on'));
    if (isChannel()) {
      const selected = () => ['x', 'y'].find(key => D().get().automix[key]?.channels?.includes(id)) || 'off', modePath = base + '/postins/mode';
      const choices = [['off', 'Off', 'FX'], ['x', 'Automix X', 'AUTO_X'], ['y', 'Automix Y', 'AUTO_Y']].filter(([, , wire]) => !online || live.metadata?.(modePath)?.items?.some(item => item.value === wire)).map(([value, label]) => ({ value, label }));
      const editable = () => groupEditable(modePath) && (!online || live.metadata?.(modePath)?.type === 5) && (!channel().postFx || groupEditable(base + '/postins/ins'));
      const box = module('Automix', selectField('Gruppo automix', () => groupKnown(modePath) ? selected() : '', choices, value => {
        if (!editable() || !choices.some(choice => choice.value === value)) return;
        const members = new Set(['x', 'y'].flatMap(key => D().get().automix[key]?.channels || []));
        if (!online && value !== 'off' && !members.has(id) && members.size >= 16) { toast('Automix: massimo 16 canali complessivi nei gruppi X e Y.'); return; }
        D().change(state => {
          if (value !== 'off' && state.channels[id].postFx) {
            const slot = state.channels[id].postFx; state.channels[id].postFx = null;
            if (state.fx[slot - 1]?.stripId === id) state.fx[slot - 1].stripId = null;
          }
          for (const key of ['x', 'y']) state.automix[key].channels = state.automix[key].channels.filter(member => member !== id);
          if (value !== 'off') state.automix[value].channels.push(id);
        }, 'groups');
      }, { disabled: () => !editable() }));
      if (selected() !== 'off' && groupKnown(modePath)) {
        const key = selected();
        box.append(wireParameter({ caption: 'Peso automix', get: () => D().get().automix[key].weights[id] ?? 0, set: value => D().change(state => { state.automix[key].weights[id] = value; }, 'groups'), min: -12, max: 12, step: .5, unit: 'dB', disabled: () => !homeGroupsReady() }, base + '/postins/w'),
          wireToggle(`AUTOMIX ${key.toUpperCase()} ON`, () => !!D().get().automix[key].enabled, value => D().change(state => { state.automix[key].enabled = value; }, 'groups'), '/cfg/amix/' + key, { disabled: () => !homeGroupsReady() }));
      }
      box.append(note('Automix usa lo slot Insert 2 del canale. L’eventuale FX di quello slot viene rilasciato.')); destination.append(box);
    }
    if (!online) destination.append(module('Richiamo scene', toggle('Recall safe', () => (D().get().safes || []).includes(id), value => D().change(state => {
      state.safes = value ? [...new Set([...(state.safes || []), id])] : (state.safes || []).filter(member => member !== id);
    }), { ariaLabel: 'Proteggi canale dal richiamo scene' }), note('Mantiene questo canale quando richiami una scena con i safes attivi.')));
    destination.append(button('Apri gestione gruppi', () => { close(); window.SculptUI?.open('groups'); }, 'editor-primary'));
  }

  function renderVstChannel() {
    const host = el('div', 'editor-vst-channel'); host.dataset.channelId = currentId; panel.append(host);
    if (typeof window.SculptVst?.renderChannel === 'function') {
      const dispose = window.SculptVst.renderChannel(host, currentId);
      if (typeof dispose === 'function') cleanups.push(dispose);
    } else {
      const open = button('Apri rack VST3', () => window.SculptVst?.openRack?.(currentId), 'editor-primary'); open.disabled = !window.SculptVst?.openRack;
      host.append(module('VST3 del canale', note('Gestisci i plugin e il collegamento audio USB nel rack VST3.'), open));
    }
  }
  function renderFxChannel() {
    const active = controlActive(), layout = el('div', 'editor-fx-page'), nav = el('nav', 'editor-fx-slots'), main = el('div', 'editor-fx-main'), slot = selectedFxSlot, id = currentId;
    nav.setAttribute('aria-label', 'Slot FX interni WING');
    const selectSlot = value => {
      if (!active() || selectedFxSlot === value) return;
      fxScrollTop = nav.scrollTop; selectedFxSlot = value; fxFocusPending = true;
      renderPanel(false);
    };
    for (let number = 1; number <= 16; number++) {
      const choice = button('', () => selectSlot(number), 'editor-fx-slot', 'Apri FX ' + number);
      choice.dataset.fxSlot = String(number); choice.setAttribute('aria-pressed', String(number === slot)); choice.tabIndex = number === slot ? 0 : -1;
      const code = el('strong', '', 'FX ' + String(number).padStart(2, '0')), name = el('span', 'editor-fx-slot-name'), state = el('span', 'editor-fx-slot-state'); choice.append(code, name, state);
      bind(() => {
        const proc = D().processor({ type: 'fx', slot: number }), known = wireKnown('/fx/' + number + '/mdl'), spec = window.SculptWingMap?.processorSpec?.({ type: 'fx', slot: number }, proc?.model), powerKnown = wireKnown(spec?.enabledPath);
        name.textContent = known ? window.SculptCatalog?.get({ type: 'fx', slot: number }, proc?.model)?.name || proc?.model || 'Nessuno' : 'Da leggere';
        state.textContent = !powerKnown ? '—' : proc?.model === 'NONE' ? 'VUOTO' : proc?.enabled === false ? 'BYP' : 'IN';
        choice.dataset.state = !known || !powerKnown ? 'unknown' : proc?.model === 'NONE' ? 'empty' : proc?.enabled === false ? 'bypass' : 'active';
        const assigned = ['pre', 'post'].filter(position => wireKnown(window.SculptWingMap?.stripPath(id) + '/' + position + 'ins/ins') && channel()?.[position + 'Fx'] === number);
        choice.classList.toggle('is-channel-insert', !!assigned.length); choice.title = 'FX ' + number + ' · ' + name.textContent + (assigned.length ? ' · Insert ' + assigned.map(position => position === 'pre' ? '1' : '2').join(' / ') + ' del canale' : '');
      });
      choice.addEventListener('keydown', event => {
        const direction = { ArrowDown: 2, ArrowUp: -2, ArrowRight: 1, ArrowLeft: -1 }[event.key];
        const next = direction !== undefined ? clamp(number + direction, 1, 16) : event.key === 'Home' ? 1 : event.key === 'End' ? 16 : null;
        if (next === null) return; event.preventDefault(); selectSlot(next);
      });
      nav.append(choice);
    }
    const assignments = el('div', 'editor-fx-assignments'), base = window.SculptWingMap?.stripPath(id);
    for (const position of sourceStrip().kind === 'AUX' ? ['pre'] : ['pre', 'post']) {
      const index = position === 'pre' ? 1 : 2, box = module('Insert ' + index + (position === 'post' ? ' · post-fader' : ''));
      renderDeviceInsertAssignment(box, position);
      box.append(wireToggle('INSERT ' + index + ' ON', () => channel()[position + 'FxOn'] !== false, value => patchChannel({ [position + 'FxOn']: value }), base + '/' + position + 'ins/on', { disabled: () => !channel()[position + 'Fx'] }));
      const open = button('Apri FX assegnato', () => { const assigned = channel()[position + 'Fx']; if (assigned) selectSlot(assigned); }, 'editor-link-button', 'Apri FX di Insert ' + index);
      bind(() => { open.disabled = !wireKnown(base + '/' + position + 'ins/ins') || !channel()[position + 'Fx']; }); box.append(open); assignments.append(box);
    }
    const host = el('div', 'editor-fx-processor'); host.dataset.fxSlot = String(slot); main.append(assignments, host); layout.append(nav, main); panel.append(layout);
    const dispose = window.SculptFX?.renderProcessor(host, { type: 'fx', slot }, { rotaryBank: true });
    if (typeof dispose === 'function') cleanups.push(dispose);
    if (!window.SculptFX) host.append(note('Caricamento del processore FX…'));
    nav.scrollTop = fxScrollTop;
    if (fxFocusPending) { nav.querySelector('[data-fx-slot="' + slot + '"]')?.focus({ preventScroll: true }); fxFocusPending = false; }
  }

  function livePanelKey() {
    const live = window.SculptLive;
    if (!live?.isLive?.() || activeTab === 'vst3') return '';
    return JSON.stringify([live.sessionToken?.() ?? null, currentId, activeTab, activeTab === 'fx' ? selectedFxSlot : '']);
  }
  function resetLiveGate() { liveGate = { key: '', phase: 'idle', error: '', token: liveGate.token + 1 }; }
  function beginLiveRead(key) {
    const live = window.SculptLive, id = currentId, tab = activeTab, slot = selectedFxSlot;
    const session = live.sessionToken?.();
    const token = liveGate.token + 1;
    liveGate = { key, phase: 'loading', error: '', token };
    const valid = () => liveGate.token === token && dialog?.open && currentId === id && window.SculptLive === live &&
      session === live.sessionToken?.() && live?.isConnected?.();
    Promise.resolve().then(async () => {
      if (!valid()) return;
      if (tab === 'fx') {
        await live.loadScope('fx');
        if (!valid()) return;
        const base = window.SculptWingMap?.stripPath(id);
        for (const position of C().getStrip(id).kind === 'AUX' ? ['pre'] : ['pre', 'post']) {
          if (live.readNode && base) await live.readNode(base + '/' + position + 'ins');
          if (!valid()) return;
        }
        await live.ensureProcessor?.({ type: 'fx', slot });
      }
      if (valid()) { liveGate.phase = 'ready'; liveGate.error = ''; renderPanel(false); }
    }).catch(error => {
      if (!valid()) return;
      liveGate.phase = 'error'; liveGate.error = error?.message || String(error); renderPanel(false);
    });
  }
  function readyLivePanel() {
    const live = window.SculptLive;
    if (!live?.isLive?.() || activeTab === 'vst3') return true;
    if (!live.isConnected?.()) {
      panel.append(module('WING non collegata', note('Collega il banco per leggere i valori reali di questa sezione.'),
        button('Apri connessione', () => { close(); live.open?.(); }, 'editor-primary')));
      return false;
    }
    const key = livePanelKey();
    // Each device owns a bounded processor read. Show the row immediately and
    // let unread controls remain disabled while those reads complete.
    if (activeTab === 'devices') { liveGate = { key, phase: 'ready', error: '', token: liveGate.token }; return true; }
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
    if (!dialog?.open || navigating || rendering) return;
    const live = window.SculptLive, mode = live?.isLive?.() ? live.snapshot?.().mode || 'live' : 'demo';
    if (mode !== observedLiveMode) { observedLiveMode = mode; resetLiveGate(); renderPanel(false); return; }
    sync();
  }

  function structuralKey() {
    const ch = channel();
    return JSON.stringify([currentId, activeTab, floatingEditor(), slotWindow() ? activeDevice : '', activeTab === 'fx' ? [selectedFxSlot, ch?.preFx, ch?.postFx, D()?.get().fx.map(fx => fx.model)] : null]);
  }

  function sync() {
    if (!dialog?.open || navigating || rendering || !sourceStrip()) return;
    dockEditor();
    dialog.classList.toggle('editor-compact-devices', compactEditor());
    dialog.classList.toggle('editor-slot-window', slotWindow());
    dialog.dataset.slot = slotWindow() ? activeDevice : '';
    tabList.hidden = slotWindow();
    const devicesTab = tabList.querySelector('[data-tab="devices"]'); if (devicesTab) devicesTab.hidden = false;
    const strip = sourceStrip();
    const live = window.SculptLive, liveState = live?.isLive() ? live.snapshot() : null;
    dialog.querySelector('.editor-demo').textContent = !liveState ? 'DEMO' : liveState.mode === 'live' ? (liveState.writable ? 'LIVE' : 'LETTURA') : 'WING';
    const slotTitle = activeDevice === 'pre' ? 'Insert 1' : activeDevice === 'post' ? 'Insert 2' : DEVICE_LABELS[activeDevice];
    headerName.textContent = slotWindow() ? slotTitle + ' · ' + strip.name : strip.name; headerKind.textContent = label(strip); headerDot.style.background = strip.color;
    headerRename.disabled = !!liveState && (!live.isConnected?.() || !live.isWritable?.());
    headerRename.title = headerRename.disabled ? 'Attiva Controllo nella connessione WING per rinominare' : 'Modifica il nome del canale';
    headerSolo.setAttribute('aria-pressed', String(!!channel()?.solo));
    headerSof.hidden = floatingEditor() || !['BUS', 'MTX'].includes(strip.kind);
    headerSof.setAttribute('aria-pressed', String(C().getSof() === currentId));
    headerSof.classList.toggle('editor-active', C().getSof() === currentId);
    headerSof.setAttribute('aria-label', `${C().getSof() === currentId ? 'Disattiva' : 'Attiva'} SOF per ${label(strip)}`);
    if (structure !== structuralKey() || activeTab !== 'vst3' && window.SculptLive?.isConnected?.() && liveGate.key !== livePanelKey()) { renderPanel(false); return; }
    refreshDeviceChain();
    for (const update of bindings) update();
    const effective = D()?.effective(currentId);
    footerStatus.textContent = liveState ? (liveState.mode !== 'live' ? 'WING non collegata' : `${live.hasStripValue(currentId) ? db(strip.level) + ' dB' : 'Lettura…'} · ${liveState.pending ? 'scritture in attesa: ' + liveState.pending : liveState.writable ? 'controllo WING' : 'sola lettura'}`) : `${effective?.muted ? 'MUTE · ' : ''}${db(effective?.level ?? strip.level)} dB · salvato sul dispositivo`;
  }

  function disposePanel() {
    // Invalidate queued events from detached controls before selecting another
    // channel. A late change/blur must never resolve the new currentId.
    panelVersion++;
    const previous = cleanups; cleanups = []; bindings = [];
    for (const cleanup of previous) cleanup();
  }
  function renderPanel(resetScroll = true) {
    if (!panel || !sourceStrip() || rendering || navigating) return;
    rendering = true;
    const scrollTop = resetScroll ? 0 : panel.scrollTop, scrollLeft = resetScroll ? 0 : panel.scrollLeft;
    if (panel.contains(document.activeElement) && document.activeElement.matches('input,select')) document.activeElement.blur();
    disposePanel(); bindings = []; panel.replaceChildren();
    panel.id = `editor-panel-${activeTab}`; panel.setAttribute('aria-labelledby', slotWindow() ? 'editor-title' : `editor-tab-${activeTab}`);
    tabList.querySelectorAll('[role="tab"]').forEach(tab => { const on = tab.dataset.tab === activeTab; tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1; });
    const ready = readyLivePanel();
    if (!ready) { panel.scrollTop = scrollTop; panel.scrollLeft = scrollLeft; structure = structuralKey(); rendering = false; sync(); return; }
    if (activeTab === 'devices') renderDevices();
    else if (activeTab === 'vst3') renderVstChannel();
    else if (activeTab === 'fx') renderFxChannel();
    panel.scrollTop = scrollTop; panel.scrollLeft = scrollLeft; structure = structuralKey(); rendering = false; sync(); focusName();
  }
  function switchTab(id, device = '') {
    if (LEGACY_SECTIONS.has(id)) { openSection(currentId, id, { device, block: id === 'dynamics' ? dynamicsBlock : undefined }); return; }
    if (!TABS.some(([key]) => key === id)) return;
    if (id !== 'devices') renameFocusId = null;
    const changed = activeTab !== id || processingDevice !== device;
    processingDevice = device;
    activeTab = id;
    if (changed || structure !== structuralKey()) { resetLiveGate(); renderPanel(); }
    else { sync(); focusName(); }
    tabList.querySelector(`[data-tab="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function adjacent(delta) {
    // Follow the visible bank order, including a Custom Layer containing both
    // inputs and outputs. Changing channels must not move the source faders away.
    const row = sourceRow();
    const visible = row ? [...row.querySelectorAll('.strip:not([hidden])')].map(node => node.dataset.id).filter(id => C().getStrip(id)) : [];
    const ids = visible.includes(currentId) ? visible : C().listStrips().map(strip => strip.id);
    const at = ids.indexOf(currentId);
    if (at >= 0) open(ids[(at + delta + ids.length) % ids.length], true);
  }
  function stripElement(id, origin) {
    const candidate = origin?.closest?.('.strip');
    if (candidate?.dataset.id === id && candidate.isConnected && !candidate.hidden) return candidate;
    return document.querySelector(`.strip[data-id="${id}"]:not([hidden])`) || document.querySelector(`.strip[data-id="${id}"]`);
  }
  function sourceRow() {
    return stripElement(currentId, sourceControl)?.closest?.('.mixer-row') || null;
  }
  function releaseDock() {
    for (const [node, wasInert] of coveredChildren) node.inert = wasInert;
    coveredChildren = [];
    dockHost?.classList.remove('editor-host');
    dockHost = null;
  }
  function dockEditor() {
    if (!dialog || !currentId) return;
    const source = sourceRow();
    const rowName = source?.classList.contains('outputs') ? 'outputs' : source?.classList.contains('inputs') ? 'inputs' : isInput() ? 'inputs' : 'outputs';
    dialog.classList.toggle('editor-floating', floatingEditor());
    if (floatingEditor()) {
      const focused = dialog.contains(document.activeElement) ? document.activeElement : null;
      const selection = focused && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
      releaseDock(); dialog.classList.remove('editor-docked');
      dialog.dataset.sourceRow = rowName; dialog.dataset.dockRow = 'window'; dialog.dataset.channelId = currentId;
      if (dialog.parentElement !== document.body) {
        document.body.append(dialog);
        if (focused?.isConnected && dialog.open) { focused.focus({ preventScroll: true }); if (selection) focused.setSelectionRange(...selection); }
      }
      return;
    }
    const extendedHost = window.SculptMixerView?.editorHost?.();
    const targetName = extendedHost ? 'extended' : rowName === 'inputs' ? 'outputs' : 'inputs';
    let target = extendedHost || rowHosts.get(targetName);
    if (!target?.isConnected) { target = document.querySelector(`.mixer-row.${targetName}`); rowHosts.set(targetName, target); }
    if (dialog.dataset.sourceRow !== rowName) dialog.dataset.sourceRow = rowName;
    if (dialog.dataset.dockRow !== targetName) dialog.dataset.dockRow = targetName;
    if (dialog.dataset.channelId !== currentId) dialog.dataset.channelId = currentId;
    if (target === dockHost) return;
    const focused = dialog.contains(document.activeElement) ? document.activeElement : null;
    const selection = focused && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
    releaseDock();
    dialog.classList.toggle('editor-docked', !!target);
    if (!target) { if (dialog.parentElement !== document.body) document.body.append(dialog); return; }
    dockHost = target;
    dockHost.classList.add('editor-host');
    // Only the covered bank leaves the tab order; the source bank, SOF bar and
    // macro rail stay usable. Original inert values are restored on close/move.
    for (const child of dockHost.children) if (child !== dialog) { coveredChildren.push([child, !!child.inert]); child.inert = true; }
    dockHost.append(dialog);
    if (focused?.isConnected && dialog.open) { focused.focus({ preventScroll: true }); if (selection) focused.setSelectionRange(...selection); }
  }
  function escapeEditor(event) {
    if (event.key !== 'Escape' || event.defaultPrevented || !dialog?.open) return;
    // A level, menu or plugin modal above this editor owns its own Escape key.
    if ([...document.querySelectorAll('dialog[open]')].some(node => node !== dialog)) return;
    event.preventDefault(); close();
  }
  function createDialog() {
    dialog = el('dialog', 'editor-dialog'); dialog.setAttribute('aria-labelledby', 'editor-title'); dialog.setAttribute('aria-modal', 'false');
    const header = el('header', 'editor-header');
    headerDot = el('span', 'editor-channel-dot'); headerDot.setAttribute('aria-hidden', 'true');
    const identity = el('div', 'editor-header-identity'), kicker = el('div', 'editor-kicker');
    headerKind = el('span'); kicker.append(headerKind, el('span', 'editor-demo', 'DEMO'));
    headerName = el('h2'); headerName.id = 'editor-title'; identity.append(kicker, headerName);
    const actions = el('div', 'editor-header-actions');
    headerRename = button('Rinomina', renameChannel, 'editor-rename', 'Rinomina canale');
    headerSolo = button('S', () => D().setSolo(currentId, !channel().solo), 'editor-header-solo', 'Solo del canale selezionato');
    headerSof = button('SOF', () => { C().setSof(C().getSof() === currentId ? null : currentId); close(); }, 'editor-sof');
    actions.append(button('‹', () => adjacent(-1), 'editor-channel-step', 'Canale precedente'), button('›', () => adjacent(1), 'editor-channel-step', 'Canale successivo'), headerRename, headerSolo, headerSof, button('×', close, 'editor-close', 'Chiudi editor del canale'));
    header.append(headerDot, identity, actions);
    header.addEventListener('pointerdown', event => {
      if (!floatingEditor() || event.button !== 0 || event.target.closest('button,input,select,a,[role=slider]')) return;
      const bounds = dialog.getBoundingClientRect();
      windowDrag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top };
      header.setPointerCapture?.(event.pointerId); event.preventDefault();
    });
    header.addEventListener('pointermove', event => {
      if (!windowDrag || windowDrag.pointer !== event.pointerId || !floatingEditor()) return;
      const bounds = dialog.getBoundingClientRect(), width = window.innerWidth, height = window.innerHeight;
      dialog.style.setProperty('--editor-window-left', clamp(windowDrag.left + event.clientX - windowDrag.x, 8, Math.max(8, width - bounds.width - 8)) + 'px');
      dialog.style.setProperty('--editor-window-top', clamp(windowDrag.top + event.clientY - windowDrag.y, 8, Math.max(8, height - bounds.height - 8)) + 'px');
      dialog.dataset.windowPositioned = 'true'; event.preventDefault();
    });
    const finishWindowDrag = event => { if (windowDrag && (!event?.pointerId || windowDrag.pointer === event.pointerId)) { const pointer = windowDrag.pointer; windowDrag = null; if (header.hasPointerCapture?.(pointer)) header.releasePointerCapture(pointer); } };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) header.addEventListener(type, finishWindowDrag);
    window.addEventListener('blur', finishWindowDrag);
    const navigation = el('div', 'editor-channel-navigation');
    navigation.append(button('‹', () => adjacent(-1), '', 'Canale precedente'), el('span', '', 'CHANNEL EDITOR'), button('›', () => adjacent(1), '', 'Canale successivo'));
    tabList = el('nav', 'editor-tabs'); tabList.setAttribute('role', 'tablist'); tabList.setAttribute('aria-label', 'Sezioni del canale');
    TABS.forEach(([id, text], index) => {
      const tab = button(text, () => switchTab(id), 'editor-tab'); tab.id = `editor-tab-${id}`; tab.dataset.tab = id;
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `editor-panel-${id}`);
      tab.addEventListener('keydown', event => {
        const visible = [...tabList.querySelectorAll('[role="tab"]')].filter(item => !item.hidden), position = visible.indexOf(tab);
        let target;
        if (event.key === 'ArrowRight') target = (position + 1) % visible.length;
        if (event.key === 'ArrowLeft') target = (position + visible.length - 1) % visible.length;
        if (event.key === 'Home') target = 0;
        if (event.key === 'End') target = visible.length - 1;
        if (target === undefined) return; event.preventDefault(); switchTab(visible[target].dataset.tab); visible[target].focus();
      }); tabList.append(tab);
    });
    panel = el('div', 'editor-panel'); panel.setAttribute('role', 'tabpanel'); panel.tabIndex = 0;
    const footer = el('footer', 'editor-footer'); footerStatus = el('span'); footer.append(el('i', 'editor-save-dot'), footerStatus);
    dialog.append(header, navigation, tabList, panel, footer);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    document.body.append(dialog);
  }

  function showChannel(id, { keepTab = false, origin = null, tab, block } = {}) {
    if (!C()?.getStrip(id) || !D() || navigating) return false;
    if (!dialog) createDialog();
    const wasOpen = !!dialog.open, changedId = currentId !== id;
    const previousView = [activeTab, dynamicsBlock, sendDirection, sendGroup];
    const nextView = changedId && !keepTab ? ['devices', 'dyn', 'out', 'BUS'] : [...previousView];
    if (tab !== undefined) nextView[0] = tab;
    if (C().getStrip(id).kind !== 'CH' && activeDevice === 'gate') { activeDevice = 'dyn'; expandedDevices.add('dyn'); nextView[1] = 'dyn'; }
    const changedView = previousView.some((value, index) => value !== nextView[index]);
    const rebuild = !wasOpen || changedId || changedView;
    navigating = true;
    try {
      // Commit while all global accessors still refer to the old channel. The
      // commit can notify subscribers; sync must wait for this whole transition.
      if (panel?.contains(document.activeElement) && document.activeElement.matches('input,select')) document.activeElement.blur();
      if (rebuild) { resetLiveGate(); disposePanel(); }
      const clicked = stripElement(id, origin || document.activeElement);
      sourceControl = clicked?.querySelector('.strip-label') || null;
      if (sourceControl) previousFocus = origin?.isConnected ? origin : sourceControl;
      else if (!wasOpen) previousFocus = document.activeElement;
      if (changedId || nextView[0] !== 'devices') renameFocusId = null;
      currentId = id;
      [activeTab, dynamicsBlock, sendDirection, sendGroup] = nextView;
      ensureExtras(); C().selectStrip(id);
      dockEditor();
      if (!dialog.open) { if (typeof dialog.show === 'function') dialog.show(); else dialog.open = true; }
      observedLiveMode = window.SculptLive?.isLive?.() ? window.SculptLive.snapshot?.().mode || 'live' : 'demo';
    } finally { navigating = false; }
    document.addEventListener?.('keydown', escapeEditor);
    if (rebuild) renderPanel(!wasOpen || changedView); else sync();
    if (!unsubscribe) unsubscribe = C().subscribe(sync);
    if (!unsubscribeLive && window.SculptLive?.subscribe) unsubscribeLive = window.SculptLive.subscribe(liveStateChanged);
    if (tab !== undefined) tabList.querySelector(`[data-tab="${activeTab}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    dialog.querySelector('.editor-close').focus(); return true;
  }
  function open(id, keepTab = false, origin = null) {
    // A strip click is navigation while the editor is open. Only an explicit
    // section request (for example a macro) replaces the current module.
    return showChannel(id, { keepTab: keepTab || !!dialog?.open, origin });
  }
  function close() {
    if (!dialog?.open) return;
    navigating = true;
    try {
      if (dialog.contains(document.activeElement) && document.activeElement.matches('input,select')) document.activeElement.blur();
      renameFocusId = null;
      windowDrag = null;
      unsubscribe?.(); unsubscribe = null; unsubscribeLive?.(); unsubscribeLive = null; resetLiveGate(); disposePanel(); dialog.close();
    } finally { navigating = false; }
    document.removeEventListener?.('keydown', escapeEditor);
    releaseDock();
    if (dialog.parentElement !== document.body) document.body.append(dialog);
    if (previousFocus?.isConnected && !previousFocus.closest?.('[hidden]')) previousFocus.focus({ preventScroll: true });
  }
  function openSection(id, tab = 'channel', options = {}) {
    if ((!TABS.some(([key]) => key === tab) && !LEGACY_SECTIONS.has(tab)) || !C()?.getStrip(id) || !D()) return false;
    const block = options?.block;
    if (tab === 'dynamics' && block !== undefined && (!['gate', 'dyn'].includes(block) || !D().processor({ type: 'strip', id, block }))) return false;
    if (LEGACY_SECTIONS.has(tab)) {
      const requested = options?.device || options?.position || block;
      const device = tab === 'channel' || tab === 'groups' ? 'home' : tab === 'eq' ? 'eq' : tab === 'dynamics' ? block || 'dyn' : tab === 'sends' ? 'sends' : ['pre', 'post'].includes(requested) ? requested : 'input';
      if (tab === 'groups') homeGroupsExpanded = true;
      if (tab === 'dynamics') dynamicsBlock = device;
      return openDevicePage(id, device, options);
    }
    if (tab === 'fx' && options.slot !== undefined) {
      if (!Number.isInteger(Number(options.slot)) || Number(options.slot) < 1 || Number(options.slot) > 16) return false;
      selectedFxSlot = Number(options.slot);
    }
    window.SculptUI?.close();
    return showChannel(id, { keepTab: !!dialog?.open, origin: options?.origin, tab, block });
  }
  function openDevicePage(id, key, options = {}) {
    if (!DEVICE_IDS.includes(key) || !C()?.getStrip(id) || !D()) return false;
    if (key === 'gate' && C().getStrip(id).kind !== 'CH' || key === 'post' && C().getStrip(id).kind === 'AUX') return false;
    window.SculptUI?.close?.();
    const opening = !expandedDevices.has(key); activeDevice = key; expandedDevices.add(key);
    const result = showChannel(id, { keepTab: true, tab: 'devices', origin: options.origin });
    refreshDeviceChain(); if (opening && deviceNodes.get(key)) deviceNodes.get(key).content.scrollTop = 0;
    deviceNodes.get(key)?.item.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return result;
  }
  window.addEventListener('sculpt-mixer-view', () => {
    if (!dialog?.open) return;
    const focused = dialog.contains(document.activeElement) ? document.activeElement : null;
    const focusId = focused?.id, focusLabel = focused?.getAttribute('aria-label'), focusTag = focused?.tagName;
    const selection = focused && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
    const focusedDevice = focused?.closest('.editor-device-panel')?.dataset.module;
    if (floatingEditor() && focusedDevice) activeDevice = focusedDevice;
    clearDeviceMove();
    dockEditor(); sync();
    if (focused) {
      const replacement = focused.isConnected ? focused : [...dialog.querySelectorAll('input,select,button,[role=slider]')].find(node => node.tagName === focusTag && (focusId ? node.id === focusId : focusLabel && node.getAttribute('aria-label') === focusLabel));
      if (replacement && !replacement.disabled && !replacement.closest('[hidden]')) {
        replacement.focus({ preventScroll: true });
        if (selection && typeof replacement.setSelectionRange === 'function') replacement.setSelectionRange(...selection);
      }
    }
  });
  window.addEventListener('sculpt-vst-route-state', event => {
    if (dialog?.open && event.detail?.rackId === currentId && activeTab === 'devices') refreshDeviceChain();
  });
  window.SculptEditor = Object.freeze({ open, openSection, openDevice: openDevicePage, close, sections: () => TABS.map(([id, name]) => ({ id, name })), isOpen: () => !!dialog?.open });
})();
