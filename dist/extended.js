(() => {
  'use strict';
  const C = window.SculptController, D = window.SculptDesk;
  const consoleNode = document.querySelector('.console');
  const rows = { inputs: consoleNode?.querySelector('.mixer-row.inputs'), outputs: consoleNode?.querySelector('.mixer-row.outputs') };
  if (!C || !D || !rows.inputs || !rows.outputs || window.SculptMixerView) return;

  const STORAGE_KEY = 'sculpt-wing-mixer-view-v1';
  const WING_SLOTS = [['input', 'Pre'], ['gate', 'Gate'], ['eq', 'EQ'], ['dyn', 'Comp'], ['pre', 'Insert 1'], ['post', 'Insert 2'], ['sends', 'Send'], ['master', 'Master']];
  const DEVICE_ROLES = { input: 'pre', gate: 'gate', eq: 'eq', dyn: 'comp', pre: 'insert', post: 'insert', sends: 'send', master: 'master' };
  const VST_PLACEMENTS = [['', 'Da associare'], ['pre', 'PRE'], ['insert1', 'Insert 1'], ['insert2', 'Insert 2']];
  const VST_ANCHORS = { pre: 'input', insert1: 'pre', insert2: 'post' };
  const strips = new Map(), scrollPositions = new Map();
  const preparations = new Map();
  let mode = 'compact', bank = 'inputs', savedMode = 'compact', compactSof = null;
  let reorder = null, chainObserver = null, markedDrop = null, suspendingSof = false;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.version === 1) {
      if (saved.mode === 'extended') savedMode = 'extended';
      if (saved.bank === 'outputs') bank = 'outputs';
    }
  } catch (_) { /* View preferences must not prevent the mixer from opening. */ }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className, action) {
    const node = el('button', className, text); node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, mode, bank })); } catch (_) {}
  }
  function isLive() { return !!window.SculptLive?.isLive?.(); }
  function known(path) { return !isLive() || !!(path && window.SculptLive?.hasValue?.(path)); }
  function stripLabel(id) {
    const strip = C.getStrip(id);
    return strip ? `${strip.kind} ${String(strip.number).padStart(2, '0')} · ${strip.name}` : `DCA ${id.slice(4)}`;
  }
  function processorName(ctx, model) { return window.SculptCatalog?.get?.(ctx, model)?.name || model || '—'; }
  function receivesOnly(id) {
    return C.getStrip(id)?.kind === 'MTX' && !!C.listStrips?.().some(peer => C.canSend?.(peer.id, id));
  }

  // Only the bank selector belongs in the mixer. View changes remain available
  // from the native View menu and Cmd/Ctrl+=, keeping both mixer headers clear.
  const toolbar = el('div', 'mixer-view-controls');
  const bankGroup = el('div', 'mixer-bank-switch'); bankGroup.setAttribute('role', 'group'); bankGroup.setAttribute('aria-label', 'Fila della vista Extended');
  const inputButton = button('Ingressi', 'mixer-view-button', () => setBank('inputs'));
  const outputButton = button('Uscite', 'mixer-view-button', () => setBank('outputs'));
  bankGroup.append(inputButton, outputButton); toolbar.append(bankGroup);

  const editorOverlay = el('section', 'extended-editor-host');
  editorOverlay.setAttribute('aria-label', 'Editor sopra i fader');
  consoleNode.append(editorOverlay);
  const reorderStatus = el('p', 'extended-reorder-status');
  reorderStatus.id = 'extended-reorder-help'; reorderStatus.setAttribute('role', 'status'); reorderStatus.setAttribute('aria-live', 'polite');
  const tapPalette = el('section', 'extended-tap-palette'); tapPalette.hidden = true;
  tapPalette.setAttribute('aria-label', 'Punto di prelievo delle mandate PRE');
  consoleNode.append(reorderStatus, tapPalette);

  function rememberScroll() {
    for (const node of consoleNode.querySelectorAll('.fader-scroll, .strip-pin-rail')) {
      if (!node.closest('.extended-row-hidden')) scrollPositions.set(`${mode}:${node.id}`, node.scrollLeft);
    }
  }
  function restoreScroll(previousMode) {
    for (const node of consoleNode.querySelectorAll('.fader-scroll, .strip-pin-rail')) {
      if (node.closest('.extended-row-hidden')) continue;
      const value = scrollPositions.get(`${mode}:${node.id}`) ?? scrollPositions.get(`${previousMode}:${node.id}`);
      if (value !== undefined) {
        const behavior = node.style.scrollBehavior; node.style.scrollBehavior = 'auto';
        node.scrollLeft = value; node.style.scrollBehavior = behavior;
      }
    }
  }
  function placeControls() {
    const row = mode === 'extended' ? rows[bank] : rows.outputs.classList.contains('editor-host') ? rows.inputs : rows.outputs;
    const header = row.querySelector('.row-header');
    if (toolbar.parentElement !== header) header.insertBefore(toolbar, header.querySelector('.bank-navigation'));
  }
  function syncControls() {
    const extended = mode === 'extended', layer = !!C.getLayerRows?.();
    consoleNode.dataset.mixerView = mode; consoleNode.dataset.extendedBank = bank;
    consoleNode.classList.toggle('mixer-extended', extended);
    for (const [name, row] of Object.entries(rows)) row.classList.toggle('extended-row-hidden', extended && name !== bank);
    toolbar.hidden = !extended;
    inputButton.textContent = layer ? 'Riga 2' : 'Ingressi'; outputButton.textContent = layer ? 'Riga 1' : 'Uscite';
    inputButton.setAttribute('aria-pressed', String(bank === 'inputs')); outputButton.setAttribute('aria-pressed', String(bank === 'outputs'));
    placeControls(); syncRackHeight();
  }
  function syncRackHeight() {
    if (mode !== 'extended') return;
    // All faders in a row stay aligned. The rack gets exactly the space needed
    // by its tallest visible chain, rather than an arbitrary viewport fraction.
    // Heights come from ResizeObserver, never from meter or fader updates.
    for (const row of Object.values(rows)) {
      let height = 0;
      for (const record of strips.values()) {
        if (!record.article.hidden && record.article.closest('.mixer-row') === row) height = Math.max(height, record.contentHeight || 0);
      }
      if (!height) continue;
      const value = `${Math.ceil(height)}px`;
      if (row.style.getPropertyValue('--extended-rack-content-height') !== value) row.style.setProperty('--extended-rack-content-height', value);
    }
  }
  function syncEditorGeometry() {
    if (mode !== 'extended') return;
    const rack = [...rows[bank].querySelectorAll('.extended-rack')].find(node => !node.closest('.strip')?.hidden);
    const rect = rack?.getBoundingClientRect(), base = consoleNode.getBoundingClientRect();
    if (rect?.height > 0) {
      editorOverlay.style.top = `${rect.top - base.top}px`;
      editorOverlay.style.height = `${rect.height}px`;
    }
  }
  function notifyView() {
    syncEditorGeometry();
    window.dispatchEvent(new CustomEvent('sculpt-mixer-view', { detail: { mode, bank } }));
  }
  function setMode(next) {
    if (!['compact', 'extended'].includes(next)) return false;
    if (next === mode) return true;
    cancelReorder(); rememberScroll(); const previousMode = mode; mode = next;
    // SOF belongs to Compact. Suspend its target while Extended exposes channel
    // levels, and restore it when returning to the original two-row mixer.
    if (mode === 'extended') {
      compactSof = C.getSof();
      if (compactSof) { suspendingSof = true; try { C.setSof(null); } finally { suspendingSof = false; } }
    }
    else { const target = compactSof; compactSof = null; if (target) C.setSof(target); }
    syncControls(); if (mode === 'extended') { refresh(); prepareChain(strips.get(C.getState().selected)); }
    restoreScroll(previousMode); persist(); notifyView();
    return true;
  }
  function setBank(next) {
    if (!rows[next]) return false;
    if (bank === next) return true;
    cancelReorder(); rememberScroll(); bank = next; syncControls(); restoreScroll(mode); persist(); notifyView();
    return true;
  }

  function slotNode(key, caption, action) {
    const node = button('', 'extended-slot', action); node.dataset.slot = key;
    const label = el('span', 'extended-slot-label', caption);
    const value = el('span', 'extended-slot-name', '—');
    const badge = el('span', 'extended-slot-state'); badge.setAttribute('aria-hidden', 'true');
    const lamp = el('i', 'extended-slot-lamp'); lamp.setAttribute('aria-hidden', 'true');
    node.append(label, value, badge, lamp);
    return { node, value, label, badge, signature: '' };
  }
  function updateSlot(slot, state) {
    const signature = JSON.stringify(state);
    if (slot.signature === signature) return;
    slot.signature = signature;
    slot.value.textContent = state.text;
    slot.badge.textContent = state.state === 'bypass' ? 'BYP' : state.state === 'missing' ? '!' : state.state === 'unknown' ? '?' : state.state === 'ready' ? 'STOP' : '';
    slot.node.dataset.state = state.state;
    slot.node.disabled = state.disabled === true;
    slot.node.title = state.title;
    slot.node.setAttribute('aria-label', state.title);
  }
  function openWing(id, block, origin) {
    cancelReorder();
    if (window.SculptEditor?.openDevice) return window.SculptEditor.openDevice(id, block, { origin, presentation: 'window' });
    const ch = D.channel(id), path = window.SculptWingMap?.stripPath(id);
    if (block === 'home' || block === 'master') return window.SculptEditor?.openSection(id, 'channel', { origin });
    if (block === 'sends') return window.SculptEditor?.openSection(id, 'sends', { origin });
    if (block === 'eq') return window.SculptEditor?.openSection(id, 'eq', { origin });
    if (block === 'gate' || block === 'dyn') return window.SculptEditor?.openSection(id, 'dynamics', { block, origin });
    if (block === 'pre' || block === 'post') {
      const slot = ch?.[`${block}Fx`];
      if (slot && known(`${path}/${block}ins/ins`)) {
        C.selectStrip(id); return window.SculptFX?.open({ type: 'fx', slot });
      }
    }
    const opened = window.SculptEditor?.openSection(id, 'processing', { origin });
    if (opened) document.getElementById(block === 'input' ? 'editor-filter-section' : 'editor-insert-section')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return opened;
  }
  function openVst(id, index) {
    if (window.SculptVst?.openSlot) return window.SculptVst.openSlot(id, index);
    C.toast?.('I rack VST3 richiedono l’app Sculpt Wing per Mac.');
  }
  function openRack(id) {
    if (window.SculptVst?.openRack) return window.SculptVst.openRack(id);
    return openVst(id, 0);
  }
  async function chooseVstPlacement(record) {
    if (record.placementPending) return;
    const value = record.placement.value || null;
    if (!window.SculptVst?.setPlacement) {
      refreshVst(record);
      return openRack(record.id);
    }
    record.placementPending = true; refreshVst(record);
    try {
      // The VST API owns host preparation and WING association. This view never
      // writes routing paths or stops/starts USB audio as a side effect.
      const result = await window.SculptVst.setPlacement(record.id, value);
      if (result?.error) throw new Error(result.error);
    } catch (error) { C.toast?.(error.message || 'Associazione VST3 non applicata.'); }
    finally { record.placementPending = false; refreshVst(record); }
  }
  function placeVst(record, placement) {
    const anchor = placement ? record.wingSlots.get(VST_ANCHORS[placement])?.item : record.wingHeading;
    if (!anchor || record.vst.previousElementSibling === anchor && record.vst.parentElement === record.wing) return;
    const focused = record.vst.contains(document.activeElement) ? document.activeElement : null;
    anchor.after(record.vst);
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  }
  function chainSnapshot(record) {
    return !record?.dca ? window.SculptChannelChain?.snapshot?.(record.id) : null;
  }
  function prepareChain(record, feedback = false) {
    if (!record || record.dca || mode !== 'extended' || !window.SculptChannelChain?.prepare) return Promise.resolve(null);
    const state = chainSnapshot(record);
    if (state?.ready || state?.family !== 'CH' && state?.orderKnown) return Promise.resolve(state);
    if (preparations.has(record.id)) return preparations.get(record.id);
    const pending = Promise.resolve().then(() => window.SculptChannelChain.prepare(record.id)).then(snapshot => {
      if (mode === 'extended') refresh(record.id);
      return snapshot;
    }).catch(error => {
      if (feedback) { status(error.message || 'Impossibile leggere l’ordine WING.', true); C.toast?.(error.message); }
      return null;
    }).finally(() => preparations.delete(record.id));
    preparations.set(record.id, pending); return pending;
  }
  function status(message, visible = false) {
    if (reorderStatus.textContent !== message) reorderStatus.textContent = message;
    reorderStatus.dataset.visible = String(visible);
  }
  function clearDrops() {
    if (markedDrop) { delete markedDrop.dataset.drop; markedDrop = null; }
    if (reorder) reorder.targetId = null;
  }
  function cancelReorder(message = '', focus = false) {
    const active = reorder; reorder = null;
    if (active?.pending && message.includes('annullato')) message = 'Spostamento in verifica.';
    active?.unsubscribe?.();
    if (active) { delete active.record.wing.dataset.reordering; delete active.record.wingSlots.get(active.key)?.item.dataset.dragging; }
    clearDrops(); tapPalette.hidden = true; tapPalette.replaceChildren();
    status(message, false);
    if (focus && active?.record.wingSlots.get(active.key)?.handle.isConnected) active.record.wingSlots.get(active.key).handle.focus({ preventScroll: true });
  }
  function validReorder(active = reorder) {
    if (!active || active !== reorder || mode !== 'extended' || !active.record.rack.isConnected || active.record.article.hidden || active.record.article.closest('.extended-row-hidden')) return false;
    const current = chainSnapshot(active.record);
    if (!current || current.epoch !== active.epoch || current.live !== active.live || !current.items.some(item => item.id === active.key && item.movable)) return false;
    try { return window.SculptChannelChain.targets(active.token).some(target => target.enabled); }
    catch (_) { return false; }
  }
  function showTarget(target) {
    if (reorder?.targetId === target?.id && markedDrop?.isConnected) return;
    clearDrops();
    if (!reorder || !target?.enabled) return;
    reorder.targetId = target.id;
    if (target.kind === 'proc') {
      const item = reorder.record.wingSlots.get(target.targetKey)?.item;
      if (item) { item.dataset.drop = target.position; markedDrop = item; }
    } else {
      const choice = [...tapPalette.querySelectorAll('.extended-tap-choice')].find(node => node.dataset.target === target.id);
      if (choice) { choice.dataset.drop = 'true'; markedDrop = choice; }
    }
    status(`${target.label}. Invio per confermare · Esc per annullare.`, true);
  }
  function renderTapPalette(active) {
    const heading = el('div', 'extended-tap-title');
    heading.append(el('span', '', 'Punto PRE delle mandate'), button('×', '', () => cancelReorder('Spostamento annullato.', true)));
    heading.lastElementChild.setAttribute('aria-label', 'Annulla lo spostamento');
    const choices = el('div', 'extended-tap-options');
    for (const target of active.targets) {
      const choice = button(target.label, 'extended-tap-choice', () => commitReorder(target.id));
      choice.dataset.target = target.id; choice.disabled = !target.enabled;
      choice.setAttribute('aria-pressed', String(!!target.current)); choice.title = target.reason || target.label;
      choice.addEventListener('dragover', event => { if (reorder !== active || active.pending || !target.enabled) return; event.preventDefault(); event.stopPropagation(); showTarget(target); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; });
      choice.addEventListener('drop', event => { if (reorder !== active || active.pending || !target.enabled) return; event.preventDefault(); event.stopPropagation(); commitReorder(target.id); });
      choice.addEventListener('keydown', event => {
        const options = [...choices.querySelectorAll('button:not(:disabled)')], at = options.indexOf(choice);
        const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[event.key];
        if (delta === undefined) return; event.preventDefault(); event.stopPropagation(); options[(at + delta + options.length) % options.length]?.focus();
      });
      choices.append(choice);
    }
    tapPalette.replaceChildren(heading, choices); tapPalette.hidden = false;
    if (active.kind === 'keyboard') (choices.querySelector('[aria-pressed=true]:not(:disabled)') || choices.querySelector('button:not(:disabled)'))?.focus();
  }
  function beginReorder(record, key, kind) {
    cancelReorder();
    if (mode !== 'extended') return false;
    const api = window.SculptChannelChain;
    try {
      if (!api?.begin) throw new Error('Ordine WING non disponibile.');
      const snapshot = chainSnapshot(record), token = api.begin(record.id, key), targets = api.targets(token);
      if (!targets.some(target => target.enabled)) throw new Error(snapshot.items.find(item => item.id === key)?.reason || 'Nessuna posizione disponibile.');
      const active = { record, key, kind, token, targets, epoch: snapshot.epoch, live: snapshot.live, pending: false, targetId: null };
      reorder = active; record.wing.dataset.reordering = 'true'; record.wingSlots.get(key).item.dataset.dragging = 'true';
      status(kind === 'keyboard' ? 'Frecce su/giù: scegli la posizione · Invio: conferma · Esc: annulla.' : 'Trascina su una posizione disponibile · Esc per annullare.', true);
      if (targets.some(target => target.kind === 'tap')) renderTapPalette(active);
      else if (kind === 'keyboard') showTarget(targets.find(target => target.enabled && !target.current) || targets.find(target => target.enabled));
      const unsubscribe = api.bind?.(record.id, () => {
        if (reorder !== active) return;
        refresh(record.id);
        if (!active.pending && !validReorder(active)) cancelReorder('Spostamento annullato: disponibilità WING cambiata.');
      });
      if (reorder === active) active.unsubscribe = unsubscribe; else unsubscribe?.();
      return reorder === active;
    } catch (error) { status(error.message || 'Spostamento non disponibile.', true); prepareChain(record, true); return false; }
  }
  async function commitReorder(targetId) {
    const active = reorder, target = active?.targets.find(item => item.id === targetId);
    if (!active || active.pending || !target?.enabled) return;
    if (!validReorder(active)) { cancelReorder('Spostamento annullato: sessione o disponibilità WING cambiata.'); return; }
    if (target.current) { cancelReorder('La posizione selezionata è già attiva.', true); return; }
    active.pending = true; clearDrops();
    for (const choice of tapPalette.querySelectorAll('button')) choice.disabled = true;
    status(active.live ? 'Verifica e conferma dell’ordine dalla WING…' : 'Aggiornamento dell’ordine…', true);
    try {
      const result = await window.SculptChannelChain.commit(active.token, target.id);
      if (result?.error) throw new Error(result.error);
      refresh(active.record.id);
      if (reorder === active) cancelReorder(active.live ? 'Ordine confermato dalla WING.' : 'Ordine aggiornato.', active.kind === 'keyboard');
    } catch (error) {
      refresh(active.record.id);
      if (reorder === active) cancelReorder(error.message || 'Spostamento non applicato.', active.kind === 'keyboard');
      C.toast?.(error.message || 'Spostamento non applicato.');
    }
  }
  function targetAt(record, key, event) {
    if (!reorder || reorder.record !== record || reorder.kind !== 'pointer' || reorder.pending) return null;
    const item = record.wingSlots.get(key)?.item, rect = item?.getBoundingClientRect();
    const position = rect && event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    return reorder.targets.find(target => target.enabled && target.kind === 'proc' && target.targetKey === key && target.position === position);
  }
  function attachReorder(record, key, slot) {
    const handle = button('', 'extended-device-drag', () => {
      if (reorder?.record === record && reorder.key === key) cancelReorder('Spostamento annullato.', true);
      else beginReorder(record, key, 'keyboard');
    });
    handle.setAttribute('aria-label', `Sposta ${key === 'pre' ? 'Insert 1' : key === 'post' ? 'Insert 2' : slot.label.textContent} · ${stripLabel(record.id)}`);
    handle.setAttribute('aria-describedby', reorderStatus.id); handle.setAttribute('aria-keyshortcuts', 'Space Enter ArrowUp ArrowDown Escape');
    handle.draggable = false; handle.disabled = true; slot.handle = handle; slot.item.prepend(handle);
    handle.addEventListener('dragstart', event => {
      event.stopPropagation();
      if (!beginReorder(record, key, 'pointer')) { event.preventDefault(); return; }
      if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-sculpt-wing-device', JSON.stringify({ id: record.id, key })); event.dataTransfer.setDragImage?.(slot.item, 15, 10); }
    });
    handle.addEventListener('dragend', () => { if (reorder?.record === record && reorder.key === key && !reorder.pending) cancelReorder('Spostamento annullato.'); });
    handle.addEventListener('keydown', event => {
      if (![' ', 'Enter', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const active = reorder;
      if (!active || active.record !== record || active.key !== key) {
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); beginReorder(record, key, 'keyboard'); }
        return;
      }
      event.preventDefault(); event.stopPropagation(); if (active.pending) return;
      if (event.key === ' ' || event.key === 'Enter') { if (active.targetId) commitReorder(active.targetId); return; }
      const targets = active.targets.filter(target => target.enabled), at = targets.findIndex(target => target.id === active.targetId);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? targets.length - 1 : (at + (event.key === 'ArrowUp' ? -1 : 1) + targets.length) % targets.length;
      showTarget(targets[next]);
    });
    slot.item.addEventListener('dragover', event => {
      const target = targetAt(record, key, event); if (!target) { if (reorder?.record === record) clearDrops(); return; }
      event.preventDefault(); event.stopPropagation(); showTarget(target); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    slot.item.addEventListener('drop', event => { const target = targetAt(record, key, event); if (!target) return; event.preventDefault(); event.stopPropagation(); commitReorder(target.id); });
    slot.item.addEventListener('dragleave', event => { if (markedDrop === slot.item && !slot.item.contains(event.relatedTarget)) clearDrops(); });
  }
  function syncChain(record, snapshot) {
    const items = snapshot?.items || WING_SLOTS.map(([id, label]) => ({ id, label, movable: false }));
    const order = items.map(item => item.id).join(',');
    if (record.order !== order) {
      const focused = record.wing.contains(document.activeElement) ? document.activeElement : null;
      let cursor = record.wing.querySelector('.extended-rack-heading').nextElementSibling;
      for (const item of items) {
        const node = record.wingSlots.get(item.id)?.item; if (!node) continue;
        if (node !== cursor) record.wing.insertBefore(node, cursor);
        cursor = node.nextElementSibling;
      }
      record.order = order; if (focused?.isConnected) focused.focus({ preventScroll: true });
    }
    const orderKnown = String(snapshot?.orderKnown === true);
    if (record.wing.dataset.orderKnown !== orderKnown) record.wing.dataset.orderKnown = orderKnown;
    const busy = String(!!snapshot?.busy); if (record.wing.getAttribute('aria-busy') !== busy) record.wing.setAttribute('aria-busy', busy);
    const orderText = snapshot?.error ? 'Errore' : snapshot?.busy ? 'Conferma…' : snapshot?.live && !snapshot.orderKnown ? 'Ordine —' : '';
    const orderTitle = snapshot?.error || (snapshot?.live && !snapshot.orderKnown ? 'Ordine WING da leggere; le caselle mostrano soltanto le pagine disponibili.' : 'Ordine confermato');
    if (record.orderStatus.textContent !== orderText) record.orderStatus.textContent = orderText;
    if (record.orderStatus.title !== orderTitle) record.orderStatus.title = orderTitle;
    for (const item of items) {
      const slot = record.wingSlots.get(item.id); if (!slot) continue;
      const movable = !!item.movable && !snapshot?.busy, title = movable ? 'Trascina per spostare · Spazio e frecce per la tastiera' : item.reason || 'Posizione fissa nel percorso WING';
      if (slot.item.dataset.reorderable !== String(movable)) slot.item.dataset.reorderable = String(movable);
      if (slot.handle.disabled === movable) slot.handle.disabled = !movable;
      if (slot.handle.draggable !== movable) slot.handle.draggable = movable;
      if (slot.handle.title !== title) slot.handle.title = title;
      const state = wingState(record.id, item.id);
      if (item.available === false && !(item.id === 'sends' && receivesOnly(record.id))) { state.disabled = true; state.state = 'unavailable'; state.text = '—'; state.title = `${item.label} · ${stripLabel(record.id)} · ${item.reason || 'Non disponibile su questa famiglia'}`; }
      else {
        if (item.id === 'sends' && snapshot?.family === 'CH') { state.text = snapshot.tapKnown ? 'TAP ' + snapshot.tap : '—'; state.state = snapshot.tapKnown ? 'utility' : 'unknown'; }
        if (item.badge) state.title += ' · ' + item.badge;
      }
      updateSlot(slot, state);
    }
  }
  function createRack(article) {
    const id = article.dataset.id, dca = id.startsWith('dca-');
    const rack = el('div', 'extended-rack'); rack.setAttribute('aria-label', `Processori · ${stripLabel(id)}`);
    rack.addEventListener('click', event => event.stopPropagation());
    const wing = el('section', 'extended-wing');
    const wingHeading = el('div', 'extended-rack-heading'), orderStatus = el('span', 'extended-order-status');
    wingHeading.append(el('span', '', dca ? 'GRUPPO' : 'WING'), orderStatus);
    wing.append(wingHeading); rack.append(wing);
    const record = { id, article, rack, wing, wingHeading, orderStatus, wingSlots: new Map(), vstSlots: [], rackButton: null, dca, group: null, placementPending: false };
    if (dca) {
      const group = button('Membri', 'extended-group-button', () => article.querySelector('.dca-members-button')?.click());
      group.setAttribute('aria-label', `Modifica i membri di ${stripLabel(id)}`);
      wing.append(group, el('p', 'extended-group-note', 'Livello e mute del gruppo'));
      wing.append(el('p', 'extended-dca-note', 'Il DCA controlla i canali assegnati.'));
      record.group = group;
    } else {
      for (const [block, caption] of WING_SLOTS) {
        const slot = slotNode(block, caption, event => openWing(id, block, event.currentTarget));
        const item = el('div', 'extended-device'); item.dataset.module = block; item.dataset.deviceRole = DEVICE_ROLES[block];
        slot.item = item; item.append(slot.node);
        record.wingSlots.set(block, slot); wing.append(item); attachReorder(record, block, slot);
      }
      const vst = el('section', 'extended-vst');
      vst.setAttribute('aria-label', `Rack VST3 · ${stripLabel(id)}`);
      const vstHeading = el('div', 'extended-rack-heading');
      const rackButton = button('Apri', 'extended-rack-button', () => openRack(id));
      rackButton.setAttribute('aria-label', `Apri rack VST3 di ${stripLabel(id)}`);
      vstHeading.append(el('span', '', 'VST3'), rackButton); vst.append(vstHeading);
      const placement = el('select', 'extended-vst-placement');
      placement.setAttribute('aria-label', `Punto VST3 · ${stripLabel(id)}`);
      for (const [value, caption] of VST_PLACEMENTS) {
        const option = el('option', '', caption); option.value = value; placement.append(option);
      }
      placement.addEventListener('change', () => chooseVstPlacement(record));
      const vstStatus = el('span', 'extended-vst-status'), routeStatus = el('span', 'extended-vst-route-status'), vstSlots = el('div', 'extended-vst-slots');
      vstStatus.id = `extended-vst-host-${id}`; routeStatus.id = `extended-vst-route-${id}`;
      placement.setAttribute('aria-describedby', `${routeStatus.id} ${vstStatus.id}`);
      const positionRow = el('div', 'extended-vst-position'); positionRow.append(placement);
      vst.append(positionRow, routeStatus, vstStatus, vstSlots); wingHeading.after(vst);
      Object.assign(record, { vst, vstStatus, routeStatus, vstList: vstSlots, placement, rackButton });
    }
    const label = article.querySelector('.strip-label');
    if (label) {
      label.after(rack);
      if (!dca) label.addEventListener('click', event => {
        if (mode !== 'extended') return;
        // Capture before app.js's shared label handler: one explicit Home
        // request, while Compact keeps its current-module navigation behavior.
        event.preventDefault(); event.stopImmediatePropagation();
        openWing(id, 'home', label);
      }, true);
    } else article.prepend(rack);
    rack.dataset.channelId = id;
    rack.addEventListener('pointerenter', () => prepareChain(record));
    rack.addEventListener('focusin', () => prepareChain(record));
    chainObserver?.observe(rack);
    strips.set(id, record); return record;
  }
  function wingState(id, block) {
    const strip = C.getStrip(id), ch = D.channel(id), label = stripLabel(id);
    const path = window.SculptWingMap?.stripPath(id), caption = WING_SLOTS.find(([key]) => key === block)?.[1];
    const supported = strip && (block !== 'gate' || strip.kind === 'CH') && (block !== 'post' || strip.kind !== 'AUX') && (block !== 'sends' || strip.kind !== 'MTX' || receivesOnly(id));
    if (!supported) return { text: '—', state: 'unavailable', disabled: true, title: `${caption} non previsto su ${strip?.kind || 'questo canale'}` };
    if (block === 'input') return { text: strip.kind === 'CH' ? 'In · filtri' : ['CH', 'AUX'].includes(strip.kind) ? 'Ingresso' : 'Trim · delay', state: 'utility', title: `Pre · ${label} · ingresso e pre-elaborazione` };
    if (block === 'sends') return { text: receivesOnly(id) ? 'Riceve da' : 'Mandate', state: 'utility', title: `Send · ${label} · ${receivesOnly(id) ? 'mandate ricevute dalle sorgenti' : 'mandate e destinazioni'}` };
    if (block === 'master') return { text: 'Livello · pan', state: 'utility', title: `Master · ${label} · fader, pan e mute` };
    if (block === 'pre' || block === 'post') {
      const insertName = `Insert ${block === 'pre' ? 1 : 2}`;
      if (!known(`${path}/${block}ins/ins`)) return { text: '—', state: 'unknown', title: `${insertName} · ${label} · assegnazione da leggere dalla WING` };
      const assigned = ch?.[`${block}Fx`], ctx = { type: 'fx', slot: assigned }, processor = assigned ? D.processor(ctx) : null;
      const modelKnown = assigned && known(`/fx/${assigned}/mdl`);
      const title = assigned ? `FX ${assigned}${modelKnown ? ' · ' + processorName(ctx, processor?.model) : ''}` : 'Nessun insert assegnato';
      const onKnown = known(`${path}/${block}ins/on`), on = ch?.[`${block}FxOn`] !== false;
      return { text: assigned ? (modelKnown ? processorName(ctx, processor?.model) : `FX ${assigned}`) : 'Nessuno',
        state: !assigned ? 'empty' : !onKnown ? 'unknown' : on ? 'active' : 'bypass',
        title: `${insertName} · ${label} · ${title}${assigned && onKnown && !on ? ' · bypass' : ''}` };
    }
    const ctx = { type: 'strip', id, block }, processor = D.processor(ctx), spec = window.SculptWingMap?.processorSpec?.(ctx);
    if (!processor || !known(spec?.modelPath)) return { text: '—', state: 'unknown', title: `${caption} · ${label} · processore da leggere dalla WING` };
    const onKnown = known(spec?.enabledPath), on = processor.enabled !== false, name = processorName(ctx, processor.model);
    return { text: name, state: !onKnown ? 'unknown' : on ? 'active' : 'bypass', title: `${caption} · ${label} · ${name}${!onKnown ? ' · stato da leggere' : on ? ' · attivo' : ' · bypass'}` };
  }
  function refreshVst(record) {
    if (record.dca) return;
    const rack = window.SculptVst?.getRack?.(record.id), slots = Array.isArray(rack?.slots) ? rack.slots : [], engine = window.SculptVst?.snapshot?.();
    const placement = Object.hasOwn(VST_ANCHORS, rack?.placement) ? rack.placement : null;
    const routing = window.SculptVst?.routingStatus?.(record.id);
    const routeState = !placement ? 'unconfigured' : ['unconfigured', 'planned', 'applied', 'stale', 'conflict'].includes(routing?.state) ? routing.state : 'planned';
    const routeText = { unconfigured: 'Da applicare WING', planned: 'Da applicare WING', applied: 'WING associata', stale: 'Da verificare', conflict: 'Conflitto WING' }[routeState];
    if (record.routeStatus.textContent !== routeText) record.routeStatus.textContent = routeText;
    const routeTitle = routing?.reason || routing?.message || routeText;
    if (record.routeStatus.title !== routeTitle) record.routeStatus.title = routeTitle;
    if (record.routeStatus.hidden === !!placement) record.routeStatus.hidden = !placement;
    if (record.vst.dataset.routeState !== routeState) record.vst.dataset.routeState = routeState;
    const maxSlots = window.SculptVstModel?.MAX_SLOTS || 8;
    const nameOf = slot => slot?.name || slot?.plugin?.name || (slot?.pluginId ? 'VST3' : '');
    const loaded = slots.slice(0, maxSlots).filter(nameOf);
    let freeSlot = -1;
    for (let index = 0; index < maxSlots; index++) if (!nameOf(slots[index])) { freeSlot = index; break; }
    const caption = loaded.length ? `Rack · ${loaded.length}` : 'Apri';
    if (record.rackButton.textContent !== caption) record.rackButton.textContent = caption;
    if (record.placement.value !== (placement || '')) record.placement.value = placement || '';
    if (record.placement.disabled !== record.placementPending) record.placement.disabled = record.placementPending;
    const placementTitle = `Punto VST3 · ${stripLabel(record.id)} · ${placement ? VST_PLACEMENTS.find(([value]) => value === placement)[1] : 'Da associare al percorso WING'} · Apri il rack per configurare i collegamenti USB`;
    if (record.placement.title !== placementTitle) record.placement.title = placementTitle;
    const hostUnknown = engine?.connected !== true || typeof engine?.running !== 'boolean';
    const hostState = !loaded.length ? 'empty' : loaded.some(slot => slot.missing) ? 'missing' : hostUnknown ? 'unknown' : rack?.enabled === false ? 'bypass' : engine.running === false ? 'ready' : 'active';
    const state = record.placementPending ? 'pending' : !placement || routeState !== 'applied' ? 'unassigned' : hostState;
    const statusText = record.placementPending ? 'Associazione…' : { empty: 'Rack vuoto', missing: 'Plugin mancante', unknown: engine?.connected === false ? 'Host scollegato' : 'Stato host da leggere', bypass: 'Rack in bypass', ready: 'Audio USB fermo', active: 'Audio USB attivo' }[hostState];
    if (record.vstStatus.textContent !== statusText) record.vstStatus.textContent = statusText;
    const showStatus = record.placementPending || loaded.length > 0;
    if (record.vstStatus.hidden === showStatus) record.vstStatus.hidden = !showStatus;
    if (record.vst.dataset.state !== state) record.vst.dataset.state = state;
    if (record.vst.dataset.placement !== (placement || 'unassigned')) record.vst.dataset.placement = placement || 'unassigned';
    const busy = String(record.placementPending);
    if (record.vst.getAttribute('aria-busy') !== busy) record.vst.setAttribute('aria-busy', busy);
    placeVst(record, placement);
    const count = Math.min(maxSlots, Math.max(slots.length, freeSlot + 1, 1));
    while (record.vstSlots.length < count) {
      const index = record.vstSlots.length;
      const slot = slotNode(`vst-${index}`, String(index + 1), () => openVst(record.id, index));
      slot.node.classList.add('extended-vst-slot'); slot.node.dataset.vstSlot = String(index);
      record.vstSlots.push(slot); record.vstList.append(slot.node);
    }
    for (let index = 0; index < record.vstSlots.length; index++) {
      const slot = slots[index], name = nameOf(slot), control = record.vstSlots[index];
      const visible = !!name || loaded.length > 0 && index === freeSlot;
      if (control.node.hidden === visible) control.node.hidden = !visible;
      if (!visible) continue;
      const state = !name ? 'empty' : slot.missing ? 'missing' : !placement || routeState !== 'applied' ? 'unassigned' : hostUnknown ? 'unknown' : slot.bypass || rack?.enabled === false ? 'bypass' : engine.running === false ? 'ready' : 'active';
      const status = state === 'missing' ? 'plugin non disponibile' : state === 'bypass' ? 'bypass' : state === 'unassigned' ? placement ? routeText : 'Da associare al percorso WING' : state === 'unknown' ? 'configurazione salvata · stato host da verificare' : state === 'ready' ? 'caricato · audio USB fermo' : '';
      updateSlot(control, { text: name || '+ Plugin', state,
        title: `VST3 ${index + 1} · ${stripLabel(record.id)} · ${name || 'Scegli un plugin'}${status ? ' · ' + status : ''}` });
    }
    // Keep real plugin order, with one add action after the occupied slots.
    const visibleSlots = record.vstSlots.filter(slot => !slot.node.hidden && slot.node.dataset.state !== 'empty');
    if (freeSlot >= 0 && loaded.length) visibleSlots.push(record.vstSlots[freeSlot]);
    let cursor = record.vstList.firstElementChild;
    for (const slot of visibleSlots) {
      if (slot.node !== cursor) record.vstList.insertBefore(slot.node, cursor);
      cursor = slot.node.nextElementSibling;
    }
  }
  function refresh(id) {
    const records = id ? strips.has(id) ? [strips.get(id)] : [] : [...strips.values()];
    for (const record of records) {
      if (record.dca) continue;
      syncChain(record, chainSnapshot(record));
      refreshVst(record);
    }
  }
  function keyboard(event) {
    if ((!event.metaKey && !event.ctrlKey) || event.altKey || event.isComposing || event.repeat) return;
    if (event.key !== '=' && !(event.code === 'Equal' && !event.shiftKey)) return;
    // Electron owns this accelerator and emits mixerView once. The web fallback
    // only handles a browser key, including when a text control has focus.
    if (window.SculptDesktop?.available) return;
    event.preventDefault(); event.stopPropagation(); setMode(mode === 'compact' ? 'extended' : 'compact');
  }

  if (typeof IntersectionObserver === 'function') chainObserver = new IntersectionObserver(entries => {
    if (mode !== 'extended') return;
    for (const entry of entries) if (entry.isIntersecting) prepareChain(strips.get(entry.target.dataset.channelId));
  }, { root: consoleNode });
  for (const article of consoleNode.querySelectorAll('.strip[data-id]')) createRack(article);
  window.SculptMixerView = Object.freeze({
    mode: () => mode, bank: () => bank, setMode, setBank,
    toggle: () => setMode(mode === 'compact' ? 'extended' : 'compact'),
    editorHost: () => mode === 'extended' ? editorOverlay : null,
    refresh
  });
  C.subscribe(event => {
    if (event.type === 'sof' && mode === 'extended' && !suspendingSof) compactSof = null;
    if (event.type === 'selection' && mode === 'extended') {
      if (reorder && reorder.record.id !== event.id) cancelReorder('Spostamento annullato: canale cambiato.');
      const row = strips.get(event.id)?.article.closest('.mixer-row');
      if (row) setBank(row.classList.contains('outputs') ? 'outputs' : 'inputs');
      prepareChain(strips.get(event.id));
    }
    if (event.type === 'layer') { cancelReorder('Spostamento annullato: layer cambiato.'); syncControls(); syncEditorGeometry(); }
    // Fader, pan and send gestures never rebuild racks or their controls. Only
    // processing, routing, identity and live readbacks can change slot labels.
    if (mode === 'extended' && !['selection', 'send', 'sof', 'parameter', 'history', 'macros'].includes(event.type)) refresh(event.id);
  });
  function refreshVstEvent(event) {
    if (mode !== 'extended') return;
    const id = event.detail?.id || event.detail?.rackId;
    if (id) { const record = strips.get(id); if (record) refreshVst(record); }
    else for (const record of strips.values()) refreshVst(record);
  }
  window.addEventListener('sculpt-vst-state', refreshVstEvent);
  window.addEventListener('sculpt-vst-route-state', refreshVstEvent);
  window.addEventListener('sculpt-live-state', () => { if (mode === 'extended') refresh(); if (reorder && !reorder.pending && !validReorder()) cancelReorder('Spostamento annullato: sessione WING cambiata.'); });
  window.addEventListener('sculpt-strip-pins', () => { syncRackHeight(); syncEditorGeometry(); });
  window.addEventListener('sculpt-dca-bank', event => { if (mode === 'extended' && event.detail?.open) setBank('outputs'); });
  window.addEventListener('resize', syncEditorGeometry);
  document.addEventListener('keydown', keyboard, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !reorder) return;
    event.preventDefault(); event.stopImmediatePropagation(); cancelReorder('Spostamento annullato.', true);
  }, true);
  document.addEventListener('pointerdown', event => {
    if (!reorder || reorder.pending || tapPalette.contains(event.target) || reorder.record.wingSlots.get(reorder.key)?.handle.contains(event.target)) return;
    cancelReorder('Spostamento annullato.');
  }, true);
  window.addEventListener('blur', () => cancelReorder('Spostamento annullato.'));
  if (window.SculptDesktop?.available && window.SculptDesktop.addListener) {
    window.SculptDesktop.addListener('mixerView', action => {
      if (action === 'toggle' || action?.action === 'toggle') window.SculptMixerView.toggle();
    });
  }
  if (typeof ResizeObserver === 'function') {
    const rackRecords = new Map([...strips.values()].map(record => [record.wing, record]));
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const record = rackRecords.get(entry.target);
        if (record) record.contentHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      }
      syncRackHeight(); syncEditorGeometry();
    });
    observer.observe(consoleNode);
    for (const row of Object.values(rows)) observer.observe(row);
    for (const wing of rackRecords.keys()) observer.observe(wing);
  }
  if (typeof MutationObserver === 'function') {
    // The bank selector follows the active row without adding vertical space.
    const observer = new MutationObserver(placeControls);
    for (const row of Object.values(rows)) observer.observe(row, { attributes: true, attributeFilter: ['class'] });
  }
  syncControls();
  if (savedMode === 'extended') setMode('extended');
})();
