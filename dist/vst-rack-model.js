(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SculptVstModel = api;
})(typeof window === 'object' ? window : null, () => {
  'use strict';
  const MAX_RACKS = 16, MAX_SLOTS = 8, MAX_CHANNELS = 48;
  const PLACEMENTS = Object.freeze([
    Object.freeze({ value: 'pre', label: 'Pre', description: 'Preamplificatore → USB → VST3 → ingresso WING. I due insert restano liberi.' }),
    Object.freeze({ value: 'insert1', label: 'Insert 1', description: 'Rack VST3 nel primo insert WING, nella posizione prevista dalla catena del canale.' }),
    Object.freeze({ value: 'insert2', label: 'Insert 2', description: 'Rack VST3 nel secondo insert WING, dopo il fader.' })
  ]);
  const placement = value => PLACEMENTS.some(item => item.value === value) ? value : null;
  function placementOptions(id) {
    return PLACEMENTS.map(item => ({ ...item, disabled: item.value === 'pre' && !/^(ch|aux)-/.test(id) || item.value === 'insert2' && /^aux-/.test(id) }));
  }
  const placementLabel = value => PLACEMENTS.find(item => item.value === value)?.label || 'Da associare';
  const validId = id => typeof id === 'string' && /^(?:ch-(?:[1-9]|[1-3][0-9]|40)|aux-[1-8]|bus-(?:[1-9]|1[0-6])|mtx-[1-8]|main-[1-4])$/.test(id);
  const cleanText = value => typeof value === 'string' ? value.slice(0, 240) : '';
  const channels = list => Array.isArray(list) ? list.filter(n => Number.isInteger(n) && n >= 0 && n < MAX_CHANNELS).slice(0, 2) : [];
  function metadata(state) {
    return {
      version: 2,
      racks: (Array.isArray(state?.racks) ? state.racks : []).filter(r => validId(r?.id)).slice(0, MAX_RACKS).map(r => ({
        id: r.id, enabled: !!r.enabled, placement: placement(r.placement), inputChannels: channels(r.inputChannels), outputChannels: channels(r.outputChannels),
        slots: (Array.isArray(r.slots) ? r.slots : []).slice(0, MAX_SLOTS).map(s => ({
          pluginId: cleanText(s?.pluginId) || null, name: cleanText(s?.name), bypass: !!s?.bypass, missing: !!s?.missing
        })),
        latencySamples: Math.max(0, Number(r.latencySamples) || 0)
      }))
    };
  }
  function validateRouting(rack, racks = [], availableInputs = MAX_CHANNELS, availableOutputs = MAX_CHANNELS) {
    if (!validId(rack?.id)) throw new Error('Scegli un canale audio WING valido.');
    if (rack.placement != null && !placement(rack.placement)) throw new Error('Scegli Pre, Insert 1 o Insert 2.');
    if (rack.placement && placementOptions(rack.id).find(item => item.value === rack.placement)?.disabled) throw new Error('Questo punto VST3 non è disponibile sulla famiglia di canale selezionata.');
    const ins = rack.inputChannels, outs = rack.outputChannels;
    if (!Array.isArray(ins) || ![1, 2].includes(ins.length) || !Array.isArray(outs) || ins.length !== outs.length) throw new Error('Il rack deve avere uno o due ingressi e altrettante uscite.');
    for (const [values, max, label] of [[ins, availableInputs, 'ingresso'], [outs, availableOutputs, 'uscita']]) {
      if (values.some(n => !Number.isInteger(n) || n < 0 || n >= Math.min(MAX_CHANNELS, max))) throw new Error(`Canale USB di ${label} non disponibile.`);
      if (new Set(values).size !== values.length) throw new Error(`I canali USB di ${label} devono essere distinti.`);
    }
    const conflicts = racks.filter(r => r.id !== rack.id && r.outputChannels?.some(n => outs.includes(n)));
    if (conflicts.length) throw new Error(`Ritorno USB già assegnato al rack ${conflicts.map(r => r.id.toUpperCase()).join(', ')}. Scegli un'uscita libera.`);
    if (!racks.some(r => r.id === rack.id) && racks.length >= MAX_RACKS) throw new Error(`Sono già assegnati ${MAX_RACKS} rack. Rimuovi un rack prima di crearne un altro.`);
    return true;
  }
  function freeRouting(racks, width = 1, inputCount = MAX_CHANNELS, outputCount = MAX_CHANNELS) {
    const used = new Set(racks.flatMap(r => r.outputChannels || []));
    const max = Math.min(MAX_CHANNELS, inputCount, outputCount);
    for (let start = 0; start + width <= max; start++) {
      const ports = Array.from({ length: width }, (_, i) => start + i);
      if (ports.every(n => !used.has(n))) return { inputChannels: ports.slice(), outputChannels: ports.slice() };
    }
    throw new Error('Nessuna coppia di canali USB libera per questo rack.');
  }
  const channelLabel = values => Array.isArray(values) && values.length ? values.map(n => n + 1).join(' / ') : '—';
  return Object.freeze({ MAX_RACKS, MAX_SLOTS, MAX_CHANNELS, PLACEMENTS, placement, placementOptions, placementLabel, validId, metadata, validateRouting, freeRouting, channelLabel });
});
