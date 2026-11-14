(() => {
  'use strict';
  const C = window.SculptController, D = window.SculptDesk;
  const consoleNode = document.querySelector('.console');
  const rows = { inputs: consoleNode?.querySelector('.mixer-row.inputs'), outputs: consoleNode?.querySelector('.mixer-row.outputs') };
  if (!C || !D || !rows.inputs || !rows.outputs || window.SculptMixerView) return;

  const STORAGE_KEY = 'sculpt-wing-mixer-view-v1';
  const WING_SLOTS = [['filter', 'Filtri'], ['gate', 'Gate'], ['eq', 'EQ'], ['dyn', 'Dyn'], ['pre', 'Pre'], ['post', 'Post']];
  const strips = new Map(), scrollPositions = new Map();
  let mode = 'compact', bank = 'inputs', savedMode = 'compact';
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

  // This control moves between existing headers; Compact keeps its original row
  // heights and fader geometry. Only the new rack nodes are hidden in Compact.
  const toolbar = el('div', 'mixer-view-controls');
  const viewGroup = el('div', 'mixer-view-switch'); viewGroup.setAttribute('role', 'group'); viewGroup.setAttribute('aria-label', 'Vista mixer');
  const compactButton = button('Compact', 'mixer-view-button', () => setMode('compact'));
  const extendedButton = button('Extended', 'mixer-view-button', () => setMode('extended'));
  for (const node of [compactButton, extendedButton]) {
    node.title = `${node.textContent} · ⌘= / Ctrl+=`;
    node.setAttribute('aria-keyshortcuts', 'Meta+= Control+=');
  }
  viewGroup.append(compactButton, extendedButton);
  const bankGroup = el('div', 'mixer-bank-switch'); bankGroup.setAttribute('role', 'group'); bankGroup.setAttribute('aria-label', 'Fila della vista Extended');
  const inputButton = button('Ingressi', 'mixer-view-button', () => setBank('inputs'));
  const outputButton = button('Uscite', 'mixer-view-button', () => setBank('outputs'));
  bankGroup.append(inputButton, outputButton); toolbar.append(viewGroup, bankGroup);

  const editorOverlay = el('section', 'extended-editor-host');
  editorOverlay.setAttribute('aria-label', 'Editor sopra i fader');
  consoleNode.append(editorOverlay);

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
    compactButton.setAttribute('aria-pressed', String(!extended)); extendedButton.setAttribute('aria-pressed', String(extended));
    bankGroup.hidden = !extended;
    inputButton.textContent = layer ? 'Riga 2' : 'Ingressi'; outputButton.textContent = layer ? 'Riga 1' : 'Uscite';
    inputButton.setAttribute('aria-pressed', String(bank === 'inputs')); outputButton.setAttribute('aria-pressed', String(bank === 'outputs'));
    placeControls();
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
    rememberScroll(); const previousMode = mode; mode = next;
    syncControls(); if (mode === 'extended') refresh();
    restoreScroll(previousMode); persist(); notifyView();
    return true;
  }
  function setBank(next) {
    if (!rows[next]) return false;
    if (bank === next) return true;
    rememberScroll(); bank = next; syncControls(); restoreScroll(mode); persist(); notifyView();
    return true;
  }

  function slotNode(key, caption, action) {
    const node = button('', 'extended-slot', action); node.dataset.slot = key;
    const label = el('span', 'extended-slot-label', caption);
    const value = el('span', 'extended-slot-name', '—');
    const lamp = el('i', 'extended-slot-lamp'); lamp.setAttribute('aria-hidden', 'true');
    node.append(label, value, lamp);
    return { node, value, signature: '' };
  }
  function updateSlot(slot, state) {
    const signature = JSON.stringify(state);
    if (slot.signature === signature) return;
    slot.signature = signature;
    slot.value.textContent = state.text;
    slot.node.dataset.state = state.state;
    slot.node.disabled = state.disabled === true;
    slot.node.title = state.title;
    slot.node.setAttribute('aria-label', state.title);
  }
  function openWing(id, block, origin) {
    const ch = D.channel(id), path = window.SculptWingMap?.stripPath(id);
    if (block === 'eq') return window.SculptEditor?.openSection(id, 'eq', { origin });
    if (block === 'gate' || block === 'dyn') return window.SculptEditor?.openSection(id, 'dynamics', { block, origin });
    if (block === 'pre' || block === 'post') {
      const slot = ch?.[`${block}Fx`];
      if (slot && known(`${path}/${block}ins/ins`)) {
        C.selectStrip(id); return window.SculptFX?.open({ type: 'fx', slot });
      }
    }
    const opened = window.SculptEditor?.openSection(id, 'processing', { origin });
    if (opened) document.getElementById(block === 'filter' ? 'editor-filter-section' : 'editor-insert-section')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
  function createRack(article) {
    const id = article.dataset.id, dca = id.startsWith('dca-');
    const rack = el('div', 'extended-rack'); rack.setAttribute('aria-label', `Processori · ${stripLabel(id)}`);
    rack.addEventListener('click', event => event.stopPropagation());
    const wing = el('section', 'extended-wing');
    const wingHeading = el('div', 'extended-rack-heading'); wingHeading.append(el('span', '', dca ? 'GRUPPO' : 'WING'));
    wing.append(wingHeading); rack.append(wing);
    const record = { id, article, rack, wingSlots: new Map(), vstSlots: [], rackButton: null, dca, group: null };
    if (dca) {
      const group = button('Membri', 'extended-group-button', () => article.querySelector('.dca-members-button')?.click());
      group.setAttribute('aria-label', `Modifica i membri di ${stripLabel(id)}`);
      wing.append(group, el('p', 'extended-group-note', 'Livello e mute del gruppo'));
      rack.append(el('p', 'extended-dca-note', 'Il DCA controlla i canali assegnati.'));
      record.group = group;
    } else {
      for (const [block, caption] of WING_SLOTS) {
        const slot = slotNode(block, caption, event => openWing(id, block, event.currentTarget));
        record.wingSlots.set(block, slot); wing.append(slot.node);
      }
      const vst = el('section', 'extended-vst');
      const vstHeading = el('div', 'extended-rack-heading');
      const rackButton = button('Rack', 'extended-rack-button', () => openRack(id));
      rackButton.setAttribute('aria-label', `Apri rack VST3 di ${stripLabel(id)}`);
      vstHeading.append(el('span', '', 'VST3'), rackButton); vst.append(vstHeading);
      for (let index = 0; index < 4; index++) {
        const slot = slotNode(`vst-${index}`, String(index + 1), () => openVst(id, index));
        slot.node.classList.add('extended-vst-slot'); slot.node.dataset.vstSlot = String(index);
        record.vstSlots.push(slot); vst.append(slot.node);
      }
      record.rackButton = rackButton; rack.append(vst);
    }
    const label = article.querySelector('.strip-label');
    if (label) label.after(rack); else article.prepend(rack);
    strips.set(id, record); return record;
  }
  function wingState(id, block) {
    const strip = C.getStrip(id), ch = D.channel(id), label = stripLabel(id);
    const path = window.SculptWingMap?.stripPath(id), caption = WING_SLOTS.find(([key]) => key === block)?.[1];
    const supported = strip && (!['filter', 'gate'].includes(block) || strip.kind === 'CH') && (block !== 'post' || strip.kind !== 'AUX');
    if (!supported) return { text: '—', state: 'unavailable', disabled: true, title: `${caption} non previsto su ${strip?.kind || 'questo canale'}` };
    if (block === 'pre' || block === 'post') {
      if (!known(`${path}/${block}ins/ins`)) return { text: '—', state: 'unknown', title: `${caption} insert · ${label} · assegnazione da leggere dalla WING` };
      const assigned = ch?.[`${block}Fx`], ctx = { type: 'fx', slot: assigned }, processor = assigned ? D.processor(ctx) : null;
      const modelKnown = assigned && known(`/fx/${assigned}/mdl`);
      const title = assigned ? `FX ${assigned}${modelKnown ? ' · ' + processorName(ctx, processor?.model) : ''}` : 'Nessun insert assegnato';
      const onKnown = known(`${path}/${block}ins/on`), on = ch?.[`${block}FxOn`] !== false;
      return { text: assigned ? (modelKnown ? processorName(ctx, processor?.model) : `FX ${assigned}`) : 'Nessuno',
        state: !assigned ? 'empty' : !onKnown ? 'unknown' : on ? 'active' : 'bypass',
        title: `${caption} insert · ${label} · ${title}${assigned && onKnown && !on ? ' · bypass' : ''}` };
    }
    const ctx = { type: 'strip', id, block }, processor = D.processor(ctx), spec = window.SculptWingMap?.processorSpec?.(ctx);
    if (!processor || !known(spec?.modelPath)) return { text: '—', state: 'unknown', title: `${caption} · ${label} · processore da leggere dalla WING` };
    const onKnown = known(spec?.enabledPath), on = processor.enabled !== false, name = processorName(ctx, processor.model);
    return { text: name, state: !onKnown ? 'unknown' : on ? 'active' : 'bypass', title: `${caption} · ${label} · ${name}${!onKnown ? ' · stato da leggere' : on ? ' · attivo' : ' · bypass'}` };
  }
  function refreshVst(record) {
    if (record.dca) return;
    const rack = window.SculptVst?.getRack?.(record.id), slots = rack?.slots || [], engine = window.SculptVst?.snapshot?.();
    const caption = slots.length > 4 ? `Rack ${slots.length}` : 'Rack';
    if (record.rackButton.textContent !== caption) record.rackButton.textContent = caption;
    for (let index = 0; index < record.vstSlots.length; index++) {
      const slot = slots[index], name = slot?.name || slot?.plugin?.name;
      const state = !name ? 'empty' : slot.missing ? 'missing' : engine?.connected === false ? 'unknown' : slot.bypass || rack?.enabled === false ? 'bypass' : engine?.running === false ? 'ready' : 'active';
      const status = state === 'missing' ? 'plugin non disponibile' : state === 'bypass' ? 'bypass' : state === 'unknown' ? 'configurazione salvata · motore non collegato' : state === 'ready' ? 'caricato · audio USB fermo' : '';
      updateSlot(record.vstSlots[index], { text: name || '+ VST3', state,
        title: `VST3 ${index + 1} · ${stripLabel(record.id)} · ${name || 'Scegli un plugin'}${status ? ' · ' + status : ''}` });
    }
  }
  function refresh(id) {
    const records = id && strips.has(id) ? [strips.get(id)] : [...strips.values()];
    for (const record of records) {
      if (record.dca) continue;
      for (const [block, slot] of record.wingSlots) updateSlot(slot, wingState(record.id, block));
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

  for (const article of consoleNode.querySelectorAll('.strip[data-id]')) createRack(article);
  window.SculptMixerView = Object.freeze({
    mode: () => mode, bank: () => bank, setMode, setBank,
    toggle: () => setMode(mode === 'compact' ? 'extended' : 'compact'),
    editorHost: () => mode === 'extended' ? editorOverlay : null,
    refresh
  });
  C.subscribe(event => {
    if (event.type === 'selection' && mode === 'extended') {
      const row = strips.get(event.id)?.article.closest('.mixer-row');
      if (row) setBank(row.classList.contains('outputs') ? 'outputs' : 'inputs');
    }
    if (event.type === 'layer') { syncControls(); syncEditorGeometry(); }
    // Fader, pan and send gestures never rebuild racks or their controls. Only
    // processing, routing, identity and live readbacks can change slot labels.
    if (mode === 'extended' && !['selection', 'send', 'sof', 'parameter', 'history', 'macros'].includes(event.type)) refresh(event.id);
  });
  window.addEventListener('sculpt-vst-state', () => { for (const record of strips.values()) refreshVst(record); });
  window.addEventListener('sculpt-live-state', () => { if (mode === 'extended') refresh(); });
  window.addEventListener('sculpt-strip-pins', syncEditorGeometry);
  window.addEventListener('sculpt-dca-bank', event => { if (mode === 'extended' && event.detail?.open) setBank('outputs'); });
  window.addEventListener('resize', syncEditorGeometry);
  document.addEventListener('keydown', keyboard, true);
  if (window.SculptDesktop?.available && window.SculptDesktop.addListener) {
    window.SculptDesktop.addListener('mixerView', action => {
      if (action === 'toggle' || action?.action === 'toggle') window.SculptMixerView.toggle();
    });
  }
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(syncEditorGeometry); observer.observe(consoleNode);
    for (const row of Object.values(rows)) observer.observe(row);
  }
  if (typeof MutationObserver === 'function') {
    // In Compact an editor covers the opposite row. Keep the view selector in
    // the uncovered header without adding vertical space or another toolbar.
    const observer = new MutationObserver(placeControls);
    for (const row of Object.values(rows)) observer.observe(row, { attributes: true, attributeFilter: ['class'] });
  }
  syncControls();
  if (savedMode === 'extended') setMode('extended');
})();
