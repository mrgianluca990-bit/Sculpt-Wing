/* Explicit WING routing for the computer VST rack. No audio samples or automatic
 * connection/session replay live here. Reference paths: WING Remote Protocols
 * 3.1; FX SEND pairs: the official AoIP-WSG QSG, figures 7–8, and wing-map.js.
 */
(function (root, factory) {
  'use strict';
  const create = factory();
  if (typeof module === 'object' && module.exports) module.exports = { create };
  if (root) {
    let storage;
    try { storage = root.localStorage; } catch {}
    root.SculptVstRouting = create({
      getLive: () => root.SculptLive,
      getVst: () => root.SculptVst?.snapshot(),
      storage,
      dispatch: detail => root.dispatchEvent(new root.CustomEvent('sculpt-vst-route-state', { detail })),
      subscribe: listener => {
        root.addEventListener('sculpt-live-state', listener); root.addEventListener('sculpt-vst-state', listener);
        root.SculptController?.subscribe?.(event => { if (event.type === 'live-values') listener(); });
      }
    });
  }
})(typeof window === 'object' ? window : null, () => {
  'use strict';
  const KEY = 'sculpt-wing-vst-routing-v1', MAX_BYTES = 512 * 1024;
  const COUNTS = { ch: 40, aux: 8, bus: 16, main: 4, mtx: 8 };
  const STRIPS = Object.entries(COUNTS).flatMap(([family, count]) => Array.from({ length: count }, (_, i) => `${family}-${i + 1}`));
  const INPUTS = STRIPS.filter(id => /^(ch|aux)-/.test(id));
  const PHYSICAL = { LCL: 24, AUX: 8, A: 48, B: 48, C: 48, SC: 32, AES: 2 };
  const EXTERNAL_FIELDS = ['egrp', 'ein', 'emode', 'fxmix', 'trim', 'lat'];
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const equal = (a, b) => Object.is(a, b) || typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-7;
  const fail = message => { throw new Error(message); };
  const baseFor = id => STRIPS.includes(id) ? '/' + id.replace('-', '/') : null;
  const scalar = value => typeof value === 'string' && value.length <= 256 || typeof value === 'number' && Number.isFinite(value);
  const signature = rack => JSON.stringify([rack.id, rack.placement, rack.inputChannels, rack.outputChannels]);
  const audioSignature = vst => JSON.stringify([vst?.audio?.inputDevice, vst?.audio?.outputDevice, vst?.audio?.inputChannels, vst?.audio?.outputChannels]);
  const pair = n => n % 2 ? [n, n + 1] : [n - 1, n];
  const schema = meta => JSON.stringify([meta?.path, meta?.revision, meta?.type, !!meta?.readOnly, meta?.min, meta?.max, meta?.maxLength, meta?.unit, meta?.items?.map(item => item.value) || null]);
  const shape = meta => schema({ ...meta, revision: 0 });
  function cleanMeta(meta, path) {
    if (!object(meta) || meta.path !== path || !Number.isInteger(meta.type) || meta.type < 1 || meta.type > 7) fail(`Parametro WING non disponibile: ${path}`);
    const result = { path, type: meta.type, readOnly: !!meta.readOnly };
    for (const key of ['revision', 'min', 'max', 'maxLength', 'unit']) if (meta[key] !== undefined) {
      if (!Number.isFinite(meta[key])) fail(`Schema WING non valido: ${path}`);
      result[key] = meta[key];
    }
    if (meta.items !== undefined) {
      if (!Array.isArray(meta.items) || meta.items.length > 256 || meta.items.some(item => !object(item) || !scalar(item.value))) fail(`Opzioni WING non valide: ${path}`);
      result.items = meta.items.map(item => ({ value: item.value, label: String(item.label || '').slice(0, 128) }));
    }
    return result;
  }
  const aliases = { MONO: 'M', STEREO: 'ST', 'MID/SIDE': 'M/S', 'USB AUDIO': 'USB', 'LOCAL IN': 'LCL', 'AUX IN': 'AUX', 'AES50-A': 'A', 'AES50-B': 'B', 'AES50-C': 'C' };
  function symbol(meta, value) {
    const raw = typeof value === 'string' ? value : meta?.items?.find(item => equal(item.value, value))?.label;
    if (typeof raw !== 'string') fail(`Valore WING non riconosciuto: ${meta?.path || ''}`);
    const normalized = raw.trim().toUpperCase();
    return aliases[normalized] || normalized;
  }
  function validateValue(meta, value, writable = true) {
    if (writable && meta.readOnly) fail(`Parametro WING di sola lettura: ${meta.path}`);
    if (!scalar(value)) fail(`Valore WING non valido: ${meta.path}`);
    if (meta.items && !meta.items.some(item => equal(item.value, value))) fail(`Opzione non esposta dal firmware: ${meta.path}`);
    if (typeof value === 'number') {
      if (meta.type === 4 && !Number.isInteger(value) || meta.min !== undefined && value < meta.min || meta.max !== undefined && value > meta.max) fail(`Valore fuori dai limiti WING: ${meta.path}`);
      if (meta.type === 7 || meta.type === 5 && !meta.items) fail(`Tipo WING incompatibile: ${meta.path}`);
    } else if (![5, 7].includes(meta.type) || meta.maxLength !== undefined && value.length > meta.maxLength) fail(`Tipo WING incompatibile: ${meta.path}`);
    return value;
  }
  function target(meta, requested, writable = true) {
    let value = requested;
    if (meta.items) {
      const matching = meta.items.filter(item => equal(item.value, requested) || typeof requested === 'string' && symbol({ ...meta, items: [item] }, item.value) === requested);
      if (matching.length !== 1) fail(`Opzione ${requested} non verificabile nel firmware: ${meta.path}`);
      value = matching[0].value;
    }
    return validateValue(meta, value, writable);
  }
  function consoleIdentity(live) {
    const snap = live?.snapshot?.(), info = snap?.info;
    const identity = { host: info?.host || snap?.host, model: info?.model, name: info?.name, firmware: info?.firmware };
    if (Object.values(identity).some(value => typeof value !== 'string' || !value.trim() || value.length > 256)) fail('Identità della WING incompleta: ricollega il mixer prima di preparare il routing.');
    return identity;
  }
  const sameIdentity = (a, b) => a && b && ['host', 'model', 'name', 'firmware'].every(key => a[key] === b[key]);
  function sourceData(group, index, mode) {
    if (!own(PHYSICAL, group) || !Number.isInteger(index) || index < 1 || index > PHYSICAL[group] || !['M', 'ST'].includes(mode) || mode === 'ST' && (index % 2 !== 1 || index + 1 > PHYSICAL[group])) fail('Sorgente PRE non verificabile. Usa un ingresso fisico mono o una coppia stereo dispari/pari.');
    const width = mode === 'ST' ? 2 : 1;
    return { group, index, mode, width, path: `/io/in/${group}/${index}`, indices: Array.from({ length: width }, (_, i) => index + i), sourceId: `${group}:${index}` };
  }
  function pathAllowed(record, path) {
    const base = baseFor(record.rackId);
    if (path === base + '/mute') return true;
    if (record.placement === 'pre') {
      if ([base + '/in/conn/altgrp', base + '/in/conn/altin', base + '/in/set/srcauto', base + '/in/set/altsrc'].includes(path)) return true;
      if (record.returnChannels.some(n => path === `/io/in/USB/${n}/mode`)) return true;
    } else {
      const stage = record.placement === 'insert1' ? 'preins' : 'postins';
      if ([`${base}/${stage}/ins`, `${base}/${stage}/on`, ...(stage === 'postins' ? [`${base}/${stage}/mode`] : [])].includes(path)) return true;
      if (new RegExp(`^/fx/${record.fxSlot}/(?:mdl|egrp|ein|emode|fxmix|trim)$`).test(path)) return true;
    }
    return record.sendChannels.some(n => path === `/io/out/USB/${n}/grp` || path === `/io/out/USB/${n}/in`);
  }
  function readStoredRecord(item) {
    if (!object(item) || !baseFor(item.rackId) || !['pre', 'insert1', 'insert2'].includes(item.placement) || !object(item.identity) || !['host', 'model', 'name', 'firmware'].every(key => typeof item.identity[key] === 'string' && item.identity[key].length > 0 && item.identity[key].length <= 256)) fail('Backup routing non valido.');
    for (const key of ['sendChannels', 'returnChannels']) if (!Array.isArray(item[key]) || ![1, 2].includes(item[key].length) || new Set(item[key]).size !== item[key].length || item[key].some(n => !Number.isInteger(n) || n < 1 || n > 48)) fail('Porte nel backup routing non valide.');
    if (item.sendChannels.length !== item.returnChannels.length || item.returnChannels.length === 2 && (item.returnChannels[0] % 2 !== 1 || item.returnChannels[1] !== item.returnChannels[0] + 1)) fail('Coppia USB nel backup routing non valida.');
    if (item.placement !== 'pre' && (!Number.isInteger(item.fxSlot) || item.fxSlot < 1 || item.fxSlot > 16)) fail('Slot FX nel backup routing non valido.');
    if (item.placement === 'pre' && !/^(ch|aux)-/.test(item.rackId)) fail('Canale PRE nel backup routing non valido.');
    if (!Array.isArray(item.entries) || item.entries.length > 40 || new Set(item.entries.map(entry => entry?.path)).size !== item.entries.length) fail('Journal routing non valido.');
    const record = {
      rackId: item.rackId, placement: item.placement, fxSlot: item.placement === 'pre' ? null : item.fxSlot,
      identity: clone(item.identity), sendChannels: [...item.sendChannels], returnChannels: [...item.returnChannels],
      source: item.placement === 'pre' && item.source ? sourceData(item.source.group, item.source.index, item.source.mode) : null,
      phase: 'restore-required', message: 'Backup disponibile. Il routing non viene riapplicato automaticamente.',
      entries: [], conflicts: [], updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
      modelWasNone: item.modelWasNone === true, modelSnapshot: []
    };
    if (record.placement === 'pre' && (!record.source || record.source.width !== record.sendChannels.length)) fail('Sorgente PRE nel backup routing non valida.');
    for (const entry of item.entries) {
      if (!object(entry) || typeof entry.path !== 'string' || !pathAllowed(record, entry.path) || !scalar(entry.before) || !scalar(entry.after)) fail('Percorso non consentito nel backup routing.');
      const definition = cleanMeta(entry.schema, entry.path);
      validateValue(definition, entry.before); validateValue(definition, entry.after);
      if (entry.path.endsWith('/mdl') && ![entry.before, entry.after].every(value => ['NONE', 'EXT'].includes(symbol(definition, value)))) fail('Modello FX non consentito nel backup routing.');
      record.entries.push({ path: entry.path, before: entry.before, after: entry.after, schema: definition, pending: entry.pending === true });
    }
    if (item.modelSnapshot !== undefined) {
      if (!Array.isArray(item.modelSnapshot) || item.modelSnapshot.length > EXTERNAL_FIELDS.length || new Set(item.modelSnapshot.map(entry => entry?.path)).size !== item.modelSnapshot.length) fail('Backup External non valido.');
      for (const entry of item.modelSnapshot) {
        if (!record.modelWasNone || !object(entry) || !EXTERNAL_FIELDS.some(name => entry.path === `/fx/${record.fxSlot}/${name}`) || !scalar(entry.value)) fail('Percorso External non consentito nel backup.');
        const definition = cleanMeta(entry.schema, entry.path); validateValue(definition, entry.value, false);
        record.modelSnapshot.push({ path: entry.path, value: entry.value, schema: definition });
      }
    }
    return record;
  }

  return function create({ getLive, getVst, storage, dispatch = () => {}, subscribe, now = () => Date.now() } = {}) {
    const records = new Map(), prepared = new Map(), plans = new WeakMap(), transient = new Map();
    const lastNotifications = new Map();
    let busy = false, storageError = '';
    try {
      const serialized = storage?.getItem(KEY);
      if (serialized) {
        if (serialized.length > MAX_BYTES) fail('Backup routing troppo grande.');
        const saved = JSON.parse(serialized);
        if (!object(saved) || saved.version !== 1 || !Array.isArray(saved.records) || saved.records.length > 16) fail('Formato del backup routing non riconosciuto.');
        const loaded = saved.records.map(readStoredRecord);
        if (new Set(loaded.map(record => record.rackId)).size !== loaded.length) fail('Backup routing duplicato.');
        for (const record of loaded) records.set(record.rackId, record);
      }
    } catch (error) { storageError = `Backup routing non leggibile: ${error.message}`; }
    function persist() {
      if (storageError) fail(storageError);
      if (!storage || typeof storage.setItem !== 'function') fail('Impossibile conservare il backup routing su questo dispositivo. Nessun nuovo patch verrà applicato.');
      const serialized = JSON.stringify({ version: 1, records: [...records.values()].map(record => ({
        rackId: record.rackId, placement: record.placement, fxSlot: record.fxSlot, identity: record.identity,
        sendChannels: record.sendChannels, returnChannels: record.returnChannels, source: record.source,
        entries: record.entries, updatedAt: record.updatedAt, modelWasNone: record.modelWasNone, modelSnapshot: record.modelSnapshot || []
      })) });
      if (serialized.length > MAX_BYTES) fail('Backup routing oltre il limite consentito.');
      try { storage.setItem(KEY, serialized); } catch { fail('Salvataggio del backup routing non riuscito.'); }
    }
    function status(rackId) {
      const record = records.get(rackId), temporary = transient.get(rackId);
      let matches = false;
      try { matches = sameIdentity(record?.identity, consoleIdentity(getLive?.())); } catch {}
      const online = !!getLive?.()?.isConnected?.();
      const host = getVst?.(), hostRack = host?.racks?.find(item => item.id === rackId);
      const hostDrift = record?.phase === 'active' && (audioSignature(host) !== record.audioSignature || !hostRack || signature(hostRack) !== signature({ id: rackId, placement: record.placement, inputChannels: record.sendChannels.map(n => n - 1), outputChannels: record.returnChannels.map(n => n - 1) }));
      const sameSession = matches && online && record?.verifiedToken === getLive?.()?.sessionToken?.();
      const drift = sameSession && record?.phase === 'active' ? (record.checks || []).filter(check => !equal(getLive?.()?.value?.(check.path), check.value) || shape(getLive?.()?.metadata?.(check.path)) !== shape(check.schema)).map(check => check.path) : [];
      const state = temporary?.state || (record ? !matches ? 'wrong-console' : record.phase === 'active' && sameSession && host?.connected === true && record.checks?.length && !drift.length && !hostDrift ? 'active' : drift.length || hostDrift || record.conflicts.length ? 'conflict' : 'restore-required' : prepared.has(rackId) ? 'prepared' : 'idle');
      return {
        rackId, managed: !!record, active: state === 'active', busy: !!temporary?.busy,
        state, placement: record?.placement || prepared.get(rackId)?.placement || null, fxSlot: record?.fxSlot || prepared.get(rackId)?.fxSlot || null,
        source: record?.source ? clone(record.source) : null,
        message: temporary?.message || storageError || (record && !matches ? 'Il backup appartiene a una WING diversa o non collegata.' : hostDrift ? 'Il dispositivo audio o i canali USB del rack sono cambiati. Ripristina il percorso WING precedente.' : drift.length ? 'Il percorso WING è stato modificato esternamente. Backup conservato; verifica il routing prima del ripristino.' : record?.message || ''),
        conflicts: [...new Set([...(record?.conflicts || []), ...drift])],
        canRestore: !!record && matches && online && !!getLive?.()?.isWritable?.() && getVst?.()?.connected === true && getVst?.()?.running === false && !busy
      };
    }
    function emit(id) {
      try { const result = status(id), key = JSON.stringify(result); if (lastNotifications.get(id) !== key) { lastNotifications.set(id, key); dispatch(result); } } catch {}
    }
    subscribe?.(() => { for (const id of new Set([...records.keys(), ...prepared.keys()])) emit(id); });
    function stopped() {
      const vst = getVst?.();
      if (!vst || vst.connected !== true) fail('Collega il motore VST prima di preparare il percorso WING.');
      if (vst.running !== false || vst.scanning) fail('Ferma l’audio USB e attendi la scansione prima di modificare il percorso WING.');
      return vst;
    }
    function context(rack, writable = false) {
      const live = getLive?.();
      if (!live?.isConnected?.()) fail('Collega la WING prima di preparare il percorso VST.');
      if (writable && !live.isWritable?.()) fail('Attiva Controllo WING prima di applicare o ripristinare il percorso.');
      stopped();
      const token = live.sessionToken?.();
      if (token === undefined || token === null) fail('La sessione WING non può essere verificata.');
      return { live, token, identity: consoleIdentity(live), rack, guards: new Map(), branches: new Map(), ops: [] };
    }
    function current(ctx, writable = false) {
      if (getLive?.() !== ctx.live || !ctx.live.isConnected?.() || ctx.live.sessionToken?.() !== ctx.token || !sameIdentity(ctx.identity, consoleIdentity(ctx.live))) fail('La connessione WING è cambiata: operazione interrotta.');
      if (writable && !ctx.live.isWritable?.()) fail('Il controllo WING è passato a sola lettura: operazione interrotta.');
      stopped();
    }
    async function branch(ctx, base) {
      current(ctx);
      if (!ctx.branches.has(base)) {
        await ctx.live.readNode(base); current(ctx);
        const values = await ctx.live.readValues(base, { depth: 0 }); current(ctx);
        if (!object(values)) fail(`Lettura WING incompleta: ${base}`);
        ctx.branches.set(base, values);
      }
      return ctx.branches.get(base);
    }
    async function read(ctx, path, base = path) {
      const values = await branch(ctx, base);
      if (!own(values, path) || !scalar(values[path])) fail(`La WING non ha restituito ${path}. Rileggi il mixer.`);
      const definition = cleanMeta(ctx.live.metadata(path), path);
      validateValue(definition, values[path], false);
      if (!ctx.guards.has(path)) ctx.guards.set(path, { path, value: values[path], schema: definition, base });
      return values[path];
    }
    async function word(ctx, path, base = path) { return symbol((await read(ctx, path, base), ctx.guards.get(path).schema), ctx.guards.get(path).value); }
    async function bit(ctx, path, base = path) {
      const value = await read(ctx, path, base);
      if (value !== 0 && value !== 1) fail(`Selettore WING non verificabile: ${path}`);
      return value;
    }
    function push(ctx, path, requested) {
      const guard = ctx.guards.get(path);
      if (!guard) fail(`Backup mancante per ${path}`);
      const after = target(guard.schema, requested);
      const previous = [...ctx.ops].reverse().find(op => op.path === path);
      const before = previous ? previous.after : guard.value;
      if (!equal(before, after)) ctx.ops.push({ path, before, after, schema: guard.schema });
    }
    function validateRack(rack, vst) {
      if (!object(rack) || !baseFor(rack.id) || !['pre', 'insert1', 'insert2'].includes(rack.placement)) fail('Scegli PRE, Insert 1 o Insert 2 per un canale WING valido.');
      const inputCount = vst.audio?.inputChannels, outputCount = vst.audio?.outputChannels;
      if (!Number.isInteger(inputCount) || inputCount < 1 || !Number.isInteger(outputCount) || outputCount < 1) fail('Configura il dispositivo audio USB e verifica il numero di ingressi e uscite prima del patch.');
      for (const [ports, count] of [[rack.inputChannels, inputCount], [rack.outputChannels, outputCount]]) if (!Array.isArray(ports) || ![1, 2].includes(ports.length) || new Set(ports).size !== ports.length || ports.some(n => !Number.isInteger(n) || n < 0 || n >= Math.min(48, count))) fail('Canali USB del rack non disponibili sul dispositivo audio.');
      if (rack.inputChannels.length !== rack.outputChannels.length) fail('Il percorso WING richiede la stessa larghezza mono/stereo in ingresso e uscita.');
      if (rack.outputChannels.length === 2 && (rack.outputChannels[0] % 2 !== 0 || rack.outputChannels[1] !== rack.outputChannels[0] + 1)) fail('Il ritorno USB stereo deve essere una coppia dispari/pari, per esempio 1–2 o 3–4.');
      const existing = vst.racks?.find(item => item.id === rack.id);
      if (!existing || signature(existing) !== signature(rack)) fail('Salva prima posizione e canali USB del rack nel motore audio.');
    }
    function resourceConflicts(rack, identity) {
      const otherRacks = getVst?.()?.racks || [];
      for (const other of otherRacks) if (other.id !== rack.id) {
        if (other.inputChannels?.some(n => rack.inputChannels.includes(n))) fail(`Mandata USB già usata dal rack ${other.id}. Scegli ingressi USB distinti.`);
        if (other.outputChannels?.some(n => rack.outputChannels.includes(n))) fail(`Ritorno USB già usato dal rack ${other.id}.`);
      }
      for (const other of records.values()) if (other.rackId !== rack.id && sameIdentity(other.identity, identity)) {
        if (other.sendChannels.some(n => rack.inputChannels.includes(n - 1)) || other.returnChannels.some(n => rack.outputChannels.includes(n - 1))) fail(`Risorse USB riservate dal backup del rack ${other.rackId}. Ripristinalo prima.`);
      }
    }
    async function inputConsumers(ctx, ports, modeChanging) {
      const affected = new Set(ports);
      if (modeChanging) for (const port of ports) for (const item of pair(port)) affected.add(item);
      async function used(port) {
        if (affected.has(port)) return true;
        if (port % 2 === 1 && affected.has(port + 1)) return await word(ctx, `/io/in/USB/${port}/mode`) !== 'M';
        return false;
      }
      for (const id of INPUTS) {
        const base = baseFor(id) + '/in/conn';
        for (const [groupKey, indexKey] of [['grp', 'in'], ['altgrp', 'altin']]) {
          const group = await word(ctx, `${base}/${groupKey}`, base);
          const index = await read(ctx, `${base}/${indexKey}`, base);
          if (id === ctx.rack.id && ctx.rack.placement === 'pre') continue;
          if (group === 'USB' && await used(index)) fail(`Il ritorno USB ${index} è già assegnato a ${id.toUpperCase()} (${groupKey === 'grp' ? 'MAIN' : 'ALT'}). Scegli un ritorno libero.`);
          if (group === 'USR' && index >= 25) {
            // User Patches may combine non-adjacent physical lanes. Inspect
            // their own assignments; do not derive a physical pair by offset.
            const userMode = await word(ctx, `/io/in/USR/${index}/mode`);
            if (!['M', 'ST', 'M/S'].includes(userMode) || index > 56 || userMode !== 'M' && (index % 2 !== 1 || index === 56)) fail('Coppia USER PATCH non verificabile per il controllo dei ritorni USB.');
            const patches = userMode === 'M' ? [index] : [index, index + 1];
            for (const patch of patches) {
              const user = `/io/in/USR/${patch}/user`;
              const userGroup = await word(ctx, user + '/grp', user), port = await read(ctx, user + '/in', user);
              if (userGroup === 'USB' && await used(port)) fail(`Il ritorno USB ${port} è già usato da USER ${patch} su ${id.toUpperCase()}. Scegli un ritorno libero.`);
            }
          }
        }
      }
    }
    async function externalConsumers(ctx, ports, exceptSlot = null) {
      for (let slot = 1; slot <= 16; slot++) {
        if (slot === exceptSlot) continue;
        const base = `/fx/${slot}`;
        if (await word(ctx, base + '/mdl', base) !== 'EXT') continue;
        if (await word(ctx, base + '/egrp', base) !== 'USB') continue;
        const port = await read(ctx, base + '/ein', base), mode = await word(ctx, base + '/emode', base);
        if (!['M', 'ST', 'M/S'].includes(mode)) fail(`Formato External non verificabile nello slot FX${slot}.`);
        const used = mode === 'M' ? [port] : [port, port + 1];
        if (ports.some(value => used.includes(value))) fail(`Il ritorno USB è già usato dall’External FX${slot}. Scegli un ritorno libero.`);
      }
    }
    async function insertOwners(ctx) {
      const owners = [];
      for (const id of STRIPS) {
        const base = baseFor(id);
        await ctx.live.readNode(base); current(ctx);
        for (const stage of ['preins', 'postins']) {
          if (!ctx.live.metadata(`${base}/${stage}`)) continue;
          const point = `${base}/${stage}`;
          const assignment = await word(ctx, point + '/ins', point);
          const on = await bit(ctx, point + '/on', point);
          if (assignment !== 'NONE' && !/^FX(?:[1-9]|1[0-6])$/.test(assignment)) fail(`Assegnazione insert non riconosciuta: ${point}`);
          if (assignment !== 'NONE') owners.push({ id, stage, slot: Number(assignment.slice(2)), on });
          if (ctx.live.metadata(point + '/mode')) await word(ctx, point + '/mode', point);
        }
      }
      return owners;
    }
    async function verifySendPair(ctx, slot) {
      // The documented 32-lane FX SEND group is 16 L/R slot pairs; it is not
      // indexed by input-channel number. Refuse an unknown firmware profile.
      if (!/^v?3\.(?:0|1)(?:\D|$)/i.test(ctx.identity.firmware)) fail('Mappatura FX SEND non verificata per questo firmware. Usa PRE oppure verifica il protocollo del mixer.');
      await ctx.live.readNode('/io/in/$SEND'); current(ctx);
      for (let n = 1; n <= 32; n++) if (ctx.live.metadata(`/io/in/$SEND/${n}`)?.type !== 0) fail('Il firmware non espone il gruppo verificato di 32 FX SEND.');
      const indices = [slot * 2 - 1, slot * 2];
      for (const n of indices) {
        const base = `/io/in/$SEND/${n}`;
        const mode = await word(ctx, base + '/mode', base);
        if (!ctx.guards.get(base + '/mode').schema.readOnly || !['M', 'ST', 'M/S'].includes(mode)) fail('Metadati FX SEND non verificabili.');
        const values = ctx.branches.get(base);
        if (own(values, base + '/name')) {
          const name = String(await read(ctx, base + '/name', base));
          const label = /\bFX\s*SEND\s*(\d+)\s*([LR])\b/i.exec(name);
          if (label && (Number(label[1]) !== slot || label[2].toUpperCase() !== (n % 2 ? 'L' : 'R'))) fail('I metadati FX SEND non corrispondono alla coppia dello slot scelto.');
        }
      }
      return indices;
    }
    async function externalFields(ctx, fxBase) {
      for (const name of EXTERNAL_FIELDS) await read(ctx, `${fxBase}/${name}`, fxBase);
    }
    function externalOps(ctx, fxBase, mode, port) {
      for (const [name, value] of [['egrp', 'USB'], ['ein', port], ['emode', mode], ['fxmix', 100], ['trim', 0]]) push(ctx, `${fxBase}/${name}`, value);
    }
    async function prepare(rack, { fxSlot } = {}) {
      if (busy) fail('Attendi la fine dell’operazione di routing WING.');
      if (storageError) fail(storageError);
      if (records.has(rack?.id)) fail('Ripristina prima il percorso WING già gestito per questo rack.');
      validateRack(rack, stopped());
      const previousPlan = prepared.get(rack.id);
      if (previousPlan) { const previousContext = plans.get(previousPlan); if (previousContext) previousContext.used = true; prepared.delete(rack.id); }
      const ctx = context(clone(rack)), id = rack.id, base = baseFor(id), width = rack.inputChannels.length;
      const sends = rack.inputChannels.map(n => n + 1), returns = rack.outputChannels.map(n => n + 1), mode = width === 2 ? 'ST' : 'M';
      busy = true; transient.set(id, { state: 'prepared', busy: true, message: 'Lettura del routing e delle risorse WING…' }); emit(id);
      try {
        resourceConflicts(rack, ctx.identity);
        const originalMute = await bit(ctx, base + '/mute');
        let source = null, selectedSlot = null, modelWasNone = false, sendSources;
        if (rack.placement === 'pre') {
          if (!INPUTS.includes(id)) fail('PRE richiede un canale di ingresso CH o AUX con una sorgente fisica diretta.');
          const conn = base + '/in/conn', set = base + '/in/set';
          for (const field of ['grp', 'in', 'altgrp', 'altin']) await read(ctx, `${conn}/${field}`, conn);
          const auto = await bit(ctx, set + '/srcauto', set), localAlt = await bit(ctx, set + '/altsrc', set);
          const globalAlt = await bit(ctx, '/io/altsw');
          await bit(ctx, '/io/autoaltovr');
          if (auto && localAlt !== globalAlt) fail('La selezione MAIN/ALT automatica è discordante. Disattiva AUTO sul canale e conferma la sorgente fisica prima di usare PRE.');
          const alt = auto ? globalAlt : localAlt;
          const group = symbol(ctx.guards.get(`${conn}/${alt ? 'altgrp' : 'grp'}`).schema, ctx.guards.get(`${conn}/${alt ? 'altgrp' : 'grp'}`).value);
          const index = ctx.guards.get(`${conn}/${alt ? 'altin' : 'in'}`).value;
          if (!own(PHYSICAL, group)) fail('PRE richiede una sorgente fisica diretta LCL, AUX, AES50, StageConnect o AES. USB, USER, playback e direct out non vengono usati per evitare loop.');
          const sourceMode = await word(ctx, `/io/in/${group}/${index}/mode`);
          source = sourceData(group, index, sourceMode);
          const channelMode = await word(ctx, set + '/$mode', set);
          if (source.width !== width || channelMode !== source.mode) fail('Il formato mono/stereo del rack non coincide con quello della sorgente WING. M/S richiede un percorso dedicato.');
          const oldReturnMode = await word(ctx, `/io/in/USB/${returns[0]}/mode`);
          await inputConsumers(ctx, returns, oldReturnMode !== mode);
          await externalConsumers(ctx, returns);
          sendSources = source.indices.map(n => [source.group, n]);
          // Make ALT inactive before preparing it; MAIN and both insert points
          // are preserved. The channel is temporarily muted by apply().
          push(ctx, set + '/srcauto', 0); push(ctx, set + '/altsrc', 0);
          for (let i = 0; i < sends.length; i++) {
            const output = `/io/out/USB/${sends[i]}`;
            await read(ctx, output + '/grp', output); await read(ctx, output + '/in', output);
            push(ctx, output + '/in', sendSources[i][1]); push(ctx, output + '/grp', sendSources[i][0]);
          }
          push(ctx, `/io/in/USB/${returns[0]}/mode`, mode);
          push(ctx, conn + '/altin', returns[0]); push(ctx, conn + '/altgrp', 'USB');
          push(ctx, set + '/altsrc', 1);
        } else {
          const stage = rack.placement === 'insert1' ? 'preins' : 'postins', point = `${base}/${stage}`;
          if (INPUTS.includes(id)) {
            if (await word(ctx, base + '/in/set/$mode') !== mode) fail('Il formato mono/stereo del rack non coincide con quello del canale WING.');
          } else if (width !== 2) fail('Bus, Main e Matrix WING richiedono un rack stereo.');
          const owners = await insertOwners(ctx);
          if (!ctx.guards.has(point + '/ins')) fail('Questo canale non espone il punto insert scelto.');
          if (stage === 'postins' && ctx.guards.has(point + '/mode') && symbol(ctx.guards.get(point + '/mode').schema, ctx.guards.get(point + '/mode').value) !== 'FX') fail('Insert 2 è occupato da AutoMix. Liberalo sulla WING prima di assegnare il VST.');
          const assigned = symbol(ctx.guards.get(point + '/ins').schema, ctx.guards.get(point + '/ins').value);
          const existingSlot = assigned === 'NONE' ? null : Number(assigned.slice(2));
          if (fxSlot !== undefined && (!Number.isInteger(fxSlot) || fxSlot < 1 || fxSlot > 16)) fail('Scegli uno slot FX da 1 a 16.');
          if (existingSlot && fxSlot !== undefined && fxSlot !== existingSlot) fail('Il punto insert contiene già uno slot FX: usa quello stesso External o libera il punto sulla WING.');
          const candidates = [fxSlot ?? existingSlot].filter(n => n !== null && n !== undefined);
          if (!candidates.length) for (let n = 1; n <= 16; n++) candidates.push(n);
          for (const candidate of candidates) {
            const occupied = owners.some(owner => owner.slot === candidate && (owner.id !== id || owner.stage !== stage));
            if (occupied || [...records.values()].some(record => sameIdentity(record.identity, ctx.identity) && record.fxSlot === candidate)) { if (candidates.length === 1) fail('Lo slot FX scelto è già assegnato a un altro insert.'); continue; }
            const fxBase = `/fx/${candidate}`;
            const model = await word(ctx, fxBase + '/mdl', fxBase);
            const assignedChannel = await read(ctx, fxBase + '/$a_chn', fxBase);
            const assignedPosition = await read(ctx, fxBase + '/$a_pos', fxBase);
            const ownSlot = existingSlot === candidate;
            if (!['NONE', 'EXT'].includes(model) || ownSlot && model !== 'EXT' || !ownSlot && assignedChannel !== 0 || ownSlot && assignedPosition !== (stage === 'preins' ? 0 : 1)) { if (candidates.length === 1) fail('Lo slot FX non è un External libero o appartenente a questo insert.'); continue; }
            selectedSlot = candidate; modelWasNone = model === 'NONE'; break;
          }
          if (!selectedSlot) fail('Nessuno slot FX NONE/External libero. PRE non richiede uno slot FX.');
          const fxBase = `/fx/${selectedSlot}`;
          const sendIndices = await verifySendPair(ctx, selectedSlot);
          await inputConsumers(ctx, returns, false);
          await externalConsumers(ctx, returns, selectedSlot);
          push(ctx, point + '/on', 0);
          if (modelWasNone) {
            push(ctx, fxBase + '/mdl', 'EXT');
            ctx.ops.push({ deferred: 'external', base: fxBase, mode, port: returns[0] });
          } else {
            await externalFields(ctx, fxBase);
            externalOps(ctx, fxBase, mode, returns[0]);
          }
          for (let i = 0; i < sends.length; i++) {
            const output = `/io/out/USB/${sends[i]}`;
            await read(ctx, output + '/grp', output); await read(ctx, output + '/in', output);
            push(ctx, output + '/in', sendIndices[i]); push(ctx, output + '/grp', 'SEND');
          }
          if (stage === 'postins' && ctx.guards.has(point + '/mode')) push(ctx, point + '/mode', 'FX');
          push(ctx, point + '/ins', `FX${selectedSlot}`); push(ctx, point + '/on', 1);
        }
        current(ctx);
        const plan = Object.freeze({
          rackId: id, placement: rack.placement, fxSlot: selectedSlot, source: source ? clone(source) : null,
          sendChannels: [...sends], returnChannels: [...returns],
          changes: ctx.ops.filter(op => op.path).map(({ path, before, after }) => ({ path, before, after })),
          summary: rack.placement === 'pre' ? `${source.group} ${source.indices.join('/')} → USB ${sends.join('/')} → VST → USB ${returns.join('/')} → ${id.toUpperCase()} ALT. Insert 1/2 invariati.` : `${id.toUpperCase()} ${rack.placement === 'insert1' ? 'Insert 1' : 'Insert 2'} → FX${selectedSlot} External → USB ${sends.join('/')} → VST → USB ${returns.join('/')}.`,
          deferredExternal: modelWasNone
        });
        ctx.originalMute = originalMute; ctx.source = source; ctx.fxSlot = selectedSlot; ctx.modelWasNone = modelWasNone;
        ctx.createdAt = now(); ctx.rackSignature = signature(rack); ctx.audioSignature = audioSignature(getVst());
        plans.set(plan, ctx); prepared.set(id, plan); transient.delete(id); emit(id);
        return plan;
      } catch (error) { transient.set(id, { state: 'idle', busy: false, message: error.message }); emit(id); throw error; }
      finally { busy = false; transient.delete(id); emit(id); }
    }

    async function fresh(ctx, path) {
      current(ctx);
      const values = await ctx.live.readValues(path, { depth: 0 }); current(ctx);
      if (!object(values) || !own(values, path) || !scalar(values[path])) fail(`Readback WING mancante: ${path}`);
      return values[path];
    }
    async function preflight(ctx) {
      current(ctx, true); validateRack(ctx.rack, stopped()); resourceConflicts(ctx.rack, ctx.identity);
      if (now() - ctx.createdAt > 5 * 60 * 1000) fail('Il piano di routing è scaduto. Preparalo di nuovo.');
      if (audioSignature(getVst()) !== ctx.audioSignature) fail('Il dispositivo audio è cambiato dopo la preparazione.');
      if (ctx.live.snapshot?.().pending > 0) fail('Attendi il completamento degli altri comandi WING, poi prepara di nuovo il percorso.');
      const bases = new Map();
      for (const guard of ctx.guards.values()) { if (!bases.has(guard.base)) bases.set(guard.base, []); bases.get(guard.base).push(guard); }
      for (const [base, guards] of bases) {
        current(ctx, true);
        const values = await ctx.live.readValues(base, { depth: 0 }); current(ctx, true);
        for (const guard of guards) if (!own(values, guard.path) || !equal(values[guard.path], guard.value) || schema(ctx.live.metadata(guard.path)) !== schema(guard.schema)) fail(`Il routing o lo schema WING è cambiato dopo la preparazione: ${guard.path}`);
      }
      for (const path of new Set([baseFor(ctx.rack.id) + '/mute', ...ctx.ops.filter(op => op.path).map(op => op.path)])) {
        await ctx.live.readNode(path, { force: true }); current(ctx, true);
        const guard = ctx.guards.get(path);
        if (!guard || schema(ctx.live.metadata(path)) !== schema(guard.schema) || !equal(await fresh(ctx, path), guard.value)) fail(`Parametro WING cambiato: ${path}`);
      }
    }
    async function writeStep(ctx, record, step) {
      current(ctx, true);
      if (!pathAllowed(record, step.path)) fail('Il piano contiene un percorso non consentito.');
      const before = await fresh(ctx, step.path);
      if (!equal(before, step.before)) fail(`Modifica concorrente sulla WING: ${step.path}`);
      const meta = cleanMeta(ctx.live.metadata(step.path), step.path);
      if (schema(meta) !== schema(step.schema)) fail(`Schema WING cambiato: ${step.path}`);
      validateValue(meta, step.after);
      let entry = record.entries.find(item => item.path === step.path);
      if (!entry) { entry = { path: step.path, before, after: step.after, schema: clone(meta), pending: true }; record.entries.push(entry); }
      else { entry.after = step.after; entry.schema = clone(meta); entry.pending = true; }
      const modelEntry = record.modelSnapshot?.find(item => item.path === step.path);
      if (modelEntry) { modelEntry.value = step.after; modelEntry.schema = clone(meta); }
      record.updatedAt = now(); persist(); // Write-ahead backup: also covers an ambiguous transport failure.
      await ctx.live.write(step.path, step.after, { expectedSchema: meta }); current(ctx, true);
      if (!equal(await fresh(ctx, step.path), step.after)) fail(`La WING non ha confermato ${step.path}.`);
      entry.schema = cleanMeta(ctx.live.metadata(step.path), step.path); entry.pending = false;
      if (modelEntry) modelEntry.schema = clone(entry.schema);
      persist();
    }
    async function verifyApplied(ctx, record) {
      const base = baseFor(record.rackId), mode = record.returnChannels.length === 2 ? 'ST' : 'M';
      const targets = [];
      if (record.placement === 'pre') {
        targets.push([base + '/in/set/srcauto', 0], [base + '/in/set/altsrc', 1], [base + '/in/conn/altgrp', 'USB'], [base + '/in/conn/altin', record.returnChannels[0]],
          [`/io/in/USB/${record.returnChannels[0]}/mode`, mode], [record.source.path + '/mode', mode], [base + '/in/set/$mode', mode]);
        for (let i = 0; i < record.sendChannels.length; i++) targets.push([`/io/out/USB/${record.sendChannels[i]}/grp`, record.source.group], [`/io/out/USB/${record.sendChannels[i]}/in`, record.source.indices[i]]);
      } else {
        const point = `${base}/${record.placement === 'insert1' ? 'preins' : 'postins'}`, fx = `/fx/${record.fxSlot}`;
        targets.push([point + '/ins', `FX${record.fxSlot}`], [point + '/on', 1], [fx + '/mdl', 'EXT'], [fx + '/egrp', 'USB'], [fx + '/ein', record.returnChannels[0]], [fx + '/emode', mode], [fx + '/fxmix', 100], [fx + '/trim', 0]);
        if (ctx.live.metadata(point + '/mode')) targets.push([point + '/mode', 'FX']);
        if (INPUTS.includes(record.rackId)) targets.push([base + '/in/set/$mode', mode]);
        for (let i = 0; i < record.sendChannels.length; i++) targets.push([`/io/out/USB/${record.sendChannels[i]}/grp`, 'SEND'], [`/io/out/USB/${record.sendChannels[i]}/in`, record.fxSlot * 2 - 1 + i]);
      }
      const checks = [];
      for (const [path, requested] of targets) {
        const meta = cleanMeta(ctx.live.metadata(path), path), value = target(meta, requested, false);
        if (!equal(await fresh(ctx, path), value)) fail(`Verifica finale del percorso non riuscita: ${path}`);
        checks.push({ path, value, schema: meta });
      }
      return checks;
    }
    async function modelConflicts(ctx, record) {
      if (!record.modelWasNone || !record.modelSnapshot?.length) return [];
      const modelPath = `/fx/${record.fxSlot}/mdl`, model = symbol(ctx.live.metadata(modelPath), await fresh(ctx, modelPath));
      if (model === 'NONE') return [];
      if (model !== 'EXT') return [modelPath];
      const conflicts = [];
      for (const witness of record.modelSnapshot) {
        try {
          const value = await fresh(ctx, witness.path), entry = record.entries.find(item => item.path === witness.path);
          if ((!equal(value, witness.value) && (!entry || !equal(value, entry.before))) || shape(ctx.live.metadata(witness.path)) !== shape(witness.schema)) conflicts.push(witness.path);
        } catch { current(ctx, true); conflicts.push(witness.path); }
      }
      return conflicts;
    }
    async function releaseOwnedMute(ctx, record) {
      current(ctx, true);
      const entry = record.entries.find(item => item.path === baseFor(record.rackId) + '/mute' && !equal(item.before, item.after));
      if (!entry || !equal(await fresh(ctx, entry.path), entry.after)) return;
      const meta = cleanMeta(ctx.live.metadata(entry.path), entry.path);
      if (shape(meta) !== shape(entry.schema)) return;
      await ctx.live.write(entry.path, entry.before, { expectedSchema: meta }); current(ctx, true);
      if (!equal(await fresh(ctx, entry.path), entry.before)) return;
      entry.after = entry.before; entry.pending = false; entry.schema = cleanMeta(ctx.live.metadata(entry.path), entry.path); persist();
    }
    async function recover(ctx, record) {
      current(ctx, true);
      const remaining = record.entries.filter(entry => !equal(entry.before, entry.after));
      const conflicts = await modelConflicts(ctx, record), actual = new Map();
      let modelGone = false;
      if (record.modelWasNone) {
        const modelPath = `/fx/${record.fxSlot}/mdl`;
        try { modelGone = symbol(ctx.live.metadata(modelPath), await fresh(ctx, modelPath)) === 'NONE'; } catch {}
      }
      for (const entry of remaining) {
        if (modelGone && entry.path.startsWith(`/fx/${record.fxSlot}/`) && !entry.path.endsWith('/mdl')) { actual.set(entry.path, entry.before); continue; }
        try {
          const value = await fresh(ctx, entry.path); actual.set(entry.path, value);
          const meta = cleanMeta(ctx.live.metadata(entry.path), entry.path);
          if ((!equal(value, entry.after) && !equal(value, entry.before)) || shape(meta) !== shape(entry.schema)) conflicts.push(entry.path);
        } catch (error) { current(ctx, true); conflicts.push(entry.path); }
      }
      // A concurrent edit makes this a different routing graph. Do not undo
      // its resources piecemeal; only release our temporary channel mute.
      const mutePath = baseFor(record.rackId) + '/mute';
      const undo = conflicts.length ? remaining.filter(entry => entry.path === mutePath) : [...remaining].reverse().sort((a, b) => Number(a.path === mutePath) - Number(b.path === mutePath));
      for (const entry of undo) {
        current(ctx, true);
        if (equal(actual.get(entry.path), entry.before)) continue;
        const currentValue = await fresh(ctx, entry.path);
        if (!equal(currentValue, entry.after)) { conflicts.push(entry.path); break; }
        const meta = cleanMeta(ctx.live.metadata(entry.path), entry.path);
        if (shape(meta) !== shape(entry.schema)) { conflicts.push(entry.path); break; }
        await ctx.live.write(entry.path, entry.before, { expectedSchema: meta }); current(ctx, true);
        if (!equal(await fresh(ctx, entry.path), entry.before)) { conflicts.push(entry.path); break; }
        entry.after = entry.before; entry.pending = false; entry.schema = cleanMeta(ctx.live.metadata(entry.path), entry.path);
        try { persist(); } catch {}
      }
      record.conflicts = [...new Set(conflicts)]; record.verifiedToken = null;
      if (!record.conflicts.length) {
        records.delete(record.rackId); prepared.delete(record.rackId); persist();
      } else {
        record.phase = 'conflict'; record.message = 'Il mixer è stato modificato durante il patch. Backup conservato; nessuna modifica esterna è stata sovrascritta.'; persist();
      }
      return !record.conflicts.length;
    }
    async function apply(plan) {
      const ctx = object(plan) ? plans.get(plan) : null;
      if (!ctx || ctx.used) fail('Piano di routing non valido o già usato. Preparalo di nuovo.');
      if (busy) fail('Attendi la fine dell’operazione di routing WING.');
      if (records.has(ctx.rack.id)) fail('Ripristina prima il percorso WING già gestito.');
      ctx.used = true; busy = true;
      const id = ctx.rack.id, mutePath = baseFor(id) + '/mute';
      transient.set(id, { state: 'applying', busy: true, message: 'Verifica e applicazione esplicita del percorso WING…' }); emit(id);
      let record;
      try {
        await preflight(ctx);
        record = { rackId: id, placement: ctx.rack.placement, fxSlot: ctx.fxSlot, identity: clone(ctx.identity), source: ctx.source, audioSignature: ctx.audioSignature,
          sendChannels: ctx.rack.inputChannels.map(n => n + 1), returnChannels: ctx.rack.outputChannels.map(n => n + 1), entries: [], conflicts: [], updatedAt: now(),
          modelWasNone: ctx.modelWasNone, modelSnapshot: [], phase: 'applying', message: '' };
        records.set(id, record); persist();
        if (ctx.originalMute === 0) await writeStep(ctx, record, { path: mutePath, before: 0, after: 1, schema: ctx.guards.get(mutePath).schema });
        for (const op of ctx.ops) {
          if (!op.deferred) { await writeStep(ctx, record, op); continue; }
          // NONE has no EXT leaves. Verify the new model and all of its fields
          // before the first parameter write; a failure rolls mdl back to NONE.
          const external = context(ctx.rack, true);
          if (external.token !== ctx.token || !sameIdentity(external.identity, ctx.identity)) fail('La WING è cambiata durante il caricamento External.');
          await ctx.live.readNode(op.base, { force: true }); current(ctx, true);
          if (await word(external, op.base + '/mdl', op.base) !== 'EXT') fail('Il firmware non ha caricato External.');
          await externalFields(external, op.base);
          externalOps(external, op.base, op.mode, op.port);
          record.modelSnapshot = EXTERNAL_FIELDS.map(name => { const guard = external.guards.get(`${op.base}/${name}`); return { path: guard.path, value: guard.value, schema: clone(guard.schema) }; });
          persist();
          for (const next of external.ops) await writeStep(ctx, record, next);
        }
        record.checks = await verifyApplied(ctx, record);
        if (ctx.originalMute === 0) await writeStep(ctx, record, { path: mutePath, before: 1, after: 0, schema: cleanMeta(ctx.live.metadata(mutePath), mutePath) });
        record.entries = record.entries.filter(entry => !equal(entry.before, entry.after));
        record.phase = 'active'; record.verifiedToken = ctx.token; record.message = 'Percorso letto e applicato sulla WING collegata.'; record.updatedAt = now(); persist();
        prepared.delete(id);
      } catch (error) {
        if (record) {
          record.phase = 'restore-required'; record.message = error.message;
          try { await recover(ctx, record); } catch (rollbackError) { record.message = `${error.message} Ripristino interrotto: ${rollbackError.message}`; try { await releaseOwnedMute(ctx, record); } catch {} try { persist(); } catch {} }
        }
        throw error;
      } finally { busy = false; transient.delete(id); emit(id); }
      return status(id);
    }
    async function restore(rackId) {
      const record = records.get(rackId);
      if (!record) return status(rackId);
      if (busy) fail('Attendi la fine dell’operazione di routing WING.');
      const rack = { id: rackId, placement: record.placement, inputChannels: record.sendChannels.map(n => n - 1), outputChannels: record.returnChannels.map(n => n - 1) };
      const ctx = context(rack, true);
      if (!sameIdentity(ctx.identity, record.identity)) fail('Il backup appartiene a una WING diversa. Il routing non è stato modificato.');
      busy = true; transient.set(rackId, { state: 'applying', busy: true, message: 'Verifica e ripristino del percorso precedente…' }); emit(rackId);
      try {
        resourceConflicts(rack, ctx.identity);
        // A new consumer/owner must not lose routing as a side effect of undo.
        await inputConsumers(ctx, record.returnChannels, record.entries.some(entry => /^\/io\/in\/USB\/\d+\/mode$/.test(entry.path)));
        await externalConsumers(ctx, record.returnChannels, record.fxSlot);
        if (record.fxSlot) {
          const owners = await insertOwners(ctx), stage = record.placement === 'insert1' ? 'preins' : 'postins';
          if (owners.some(owner => owner.slot === record.fxSlot && (owner.id !== rackId || owner.stage !== stage))) fail('Lo slot External ora appartiene a un altro insert. Backup conservato.');
        }
        const modelDrift = await modelConflicts(ctx, record);
        if (modelDrift.length) { record.conflicts = modelDrift; record.phase = 'conflict'; fail(`External modificato esternamente: ${modelDrift.join(', ')}. Backup conservato.`); }
        const modelGone = record.modelWasNone && symbol(ctx.live.metadata(`/fx/${record.fxSlot}/mdl`), await fresh(ctx, `/fx/${record.fxSlot}/mdl`)) === 'NONE';
        // Check every CAS before muting. recover repeats it before each write.
        for (const entry of record.entries) {
          if (modelGone && entry.path.startsWith(`/fx/${record.fxSlot}/`) && !entry.path.endsWith('/mdl')) continue;
          const value = await fresh(ctx, entry.path);
          if (!equal(value, entry.after) && !equal(value, entry.before)) {
            record.conflicts = [entry.path]; record.phase = 'conflict'; record.message = `Valore WING modificato esternamente: ${entry.path}. Backup conservato.`; persist(); fail(record.message);
          }
        }
        const mutePath = baseFor(rackId) + '/mute', mute = await bit(ctx, mutePath);
        if (mute === 0) await writeStep(ctx, record, { path: mutePath, before: 0, after: 1, schema: ctx.guards.get(mutePath).schema });
        const restored = await recover(ctx, record);
        if (!restored) fail(record.message);
      } catch (error) { if (records.has(rackId)) { record.message = error.message; record.verifiedToken = null; try { await releaseOwnedMute(ctx, record); } catch {} try { persist(); } catch {} } throw error; }
      finally { busy = false; transient.delete(rackId); emit(rackId); }
      return status(rackId);
    }
    function sourceFor(rackId) {
      const record = records.get(rackId);
      if (record?.placement !== 'pre' || !record.source) return null;
      if (!status(rackId).active) return null;
      return clone(record.source);
    }
    return Object.freeze({ prepare, apply, restore, status, sourceFor, backup: rackId => records.has(rackId) ? clone(records.get(rackId)) : null });
  };
});
