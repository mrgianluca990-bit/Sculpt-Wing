(function (root) {
  'use strict';
  const MAX_POINTS = 4096, MAX_TRACES = 16, MAX_BINS = 1024;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
  const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const fail = message => { throw new Error(message); };
  const numberText = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/;
  function csvFields(line, delimiter) {
    const fields = []; let field = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const character = line[i];
      if (character === '"') { if (quoted && line[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
      else if (character === delimiter && !quoted) { fields.push(field.trim()); field = ''; }
      else field += character;
    }
    if (quoted) fail('Virgolette CSV non chiuse.');
    fields.push(field.trim()); return fields;
  }
  function parseCalibration(text, name = 'Microfono') {
    if (typeof text !== 'string' || text.length > 524288) fail('Il file di calibrazione supera 512 KiB.');
    const points = [];
    for (const [index, original] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
      const line = original.trim().replace(/\u2212/g, '-');
      if (!line || /^[#*;!]/.test(line) || !/^"?[+-]?(?:\d|[.,]\d)/.test(line)) continue;
      let fields;
      if (line.includes(';')) fields = csvFields(line, ';');
      else {
        const spaced = line.split(/\s+/);
        fields = spaced.length >= 2 && spaced.every(s => numberText.test(s)) ? spaced : csvFields(line, ',');
      }
      if (fields.length < 2 || fields.length > 3 || !fields.every(s => numberText.test(s))) fail('Riga ' + (index + 1) + ': attesi frequenza, risposta in dB e fase opzionale.');
      const [frequency, gainDb, phaseDeg = 0] = fields.map(s => Number(s.replace(',', '.')));
      if (!finite(frequency, Number.MIN_VALUE, 192000) || !finite(gainDb, -120, 120) || !finite(phaseDeg, -3600, 3600)) fail('Riga ' + (index + 1) + ': valori di calibrazione fuori intervallo.');
      points.push({ frequency, gainDb, phaseDeg });
      if (points.length > MAX_POINTS) fail('Il file contiene più di ' + MAX_POINTS + ' punti.');
    }
    points.sort((a, b) => a.frequency - b.frequency);
    const unique = [];
    for (const point of points) {
      const previous = unique.at(-1);
      if (previous?.frequency === point.frequency) {
        if (previous.gainDb !== point.gainDb || previous.phaseDeg !== point.phaseDeg) fail('Il file contiene valori diversi per la stessa frequenza.');
      } else unique.push(point);
    }
    if (unique.length < 2) fail('Il file deve contenere almeno due frequenze di calibrazione.');
    return { name: String(name).slice(0, 120), points: unique };
  }
  function calibrationProfile(raw) {
    if (!raw || !Array.isArray(raw.points) || raw.points.length > MAX_POINTS) return null;
    return parseCalibration(raw.points.map(p => [p?.frequency, p?.gainDb, p?.phaseDeg ?? 0].join('\t')).join('\n'), raw.name);
  }
  function normaliseConfig(raw = {}) {
    const cfg = {
      measurementChannel: Number(raw.measurementChannel ?? 0), referenceChannel: Number(raw.referenceChannel ?? 1),
      fftSize: Number(raw.fftSize ?? 32768), averages: Number(raw.averages ?? 8), delayMs: Number(raw.delayMs ?? 0),
      calibrationEnabled: !!raw.calibrationEnabled, calibration: Array.isArray(raw.calibration) ? raw.calibration : [],
      levelOffsetDb: raw.levelOffsetDb == null ? null : Number(raw.levelOffsetDb)
    };
    for (const key of ['measurementChannel', 'referenceChannel']) if (!Number.isInteger(cfg[key]) || cfg[key] < 0 || cfg[key] > 47) fail('Scegli un ingresso USB da 1 a 48.');
    if (cfg.measurementChannel === cfg.referenceChannel) fail('Microfono e reference devono usare due ingressi USB distinti.');
    if (![16384, 32768, 65536].includes(cfg.fftSize)) fail('Dimensione FFT non supportata.');
    if (!Number.isInteger(cfg.averages) || cfg.averages < 2 || cfg.averages > 32) fail('La media deve essere compresa fra 2 e 32.');
    if (!finite(cfg.delayMs, -500, 500)) fail('Il ritardo del misuratore deve essere compreso fra −500 e +500 ms.');
    if (cfg.levelOffsetDb !== null && !finite(cfg.levelOffsetDb, -240, 240)) fail('Taratura SPL fuori intervallo.');
    if (cfg.calibration.length) cfg.calibration = calibrationProfile({ points: cfg.calibration })?.points || [];
    if (cfg.calibrationEnabled && !cfg.calibration.length) fail('Importa prima il file di calibrazione del microfono.');
    return cfg;
  }
  function numericArray(value, max, lo, hi, name) {
    if (!Array.isArray(value) || value.length > max || value.some(v => !finite(v, lo, hi))) fail('Dati non validi: ' + name + '.');
    return value.slice();
  }
  function validateTrace(raw) {
    if (!raw || typeof raw !== 'object') fail('Misura non valida.');
    const frequency = numericArray(raw.frequency, MAX_BINS, Number.MIN_VALUE, 192000, 'frequenze');
    if (frequency.length < 2 || frequency.some((f, i) => i && f <= frequency[i - 1])) fail('Frequenze della misura non ordinate.');
    const out = { id: String(raw.id || '').slice(0, 100), name: String(raw.name || 'Misura').slice(0, 80),
      color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#e1bb78', visible: raw.visible !== false,
      createdAt: typeof raw.createdAt === 'string' && Number.isFinite(Date.parse(raw.createdAt)) ? raw.createdAt : new Date().toISOString(),
      sampleRate: finite(raw.sampleRate, 8000, 192000) ? raw.sampleRate : 48000,
      delayMs: finite(raw.delayMs, -500, 500) ? raw.delayMs : 0,
      micLabel: String(raw.micLabel || '').slice(0, 140), referenceLabel: String(raw.referenceLabel || '').slice(0, 140),
      calibrationName: String(raw.calibrationName || '').slice(0, 120), frequency };
    for (const [key, lo, hi] of [['magnitudeDb', -500, 500], ['phaseDeg', -3600, 3600], ['coherence', 0, 1], ['rtaDb', -500, 500]]) {
      out[key] = numericArray(raw[key], MAX_BINS, lo, hi, key);
      if (out[key].length !== frequency.length) fail('Le curve della misura hanno lunghezze diverse.');
    }
    const impulse = raw.impulse || {};
    out.impulse = { timeMs: numericArray(impulse.timeMs || [], MAX_BINS, -10000, 10000, 'tempi impulso'), value: numericArray(impulse.value || [], MAX_BINS, -1e9, 1e9, 'impulso') };
    if (out.impulse.timeMs.length !== out.impulse.value.length) fail('Impulso incompleto.');
    if (out.impulse.timeMs.some((v, i) => i && v < out.impulse.timeMs[i - 1])) fail('Tempi dell’impulso non ordinati.');
    return out;
  }
  function thinIndices(length, limit) {
    return Array.from({ length: Math.min(length, limit) }, (_, i) => Math.round(i * (length - 1) / Math.max(1, Math.min(length, limit) - 1)));
  }
  function snapshot(frame, metadata = {}) {
    if (!frame?.valid || frame.clipped || !Array.isArray(frame.frequency)) fail('Acquisisci una misura valida prima di memorizzarla.');
    const indices = thinIndices(frame.frequency.length, MAX_BINS), points = {};
    for (const key of ['frequency', 'magnitudeDb', 'phaseDeg', 'coherence', 'rtaDb']) points[key] = indices.map(i => frame[key]?.[i]);
    const impulseIndices = thinIndices(frame.impulse?.timeMs?.length || 0, MAX_BINS);
    return validateTrace({ ...metadata, ...points, sampleRate: frame.sampleRate, delayMs: frame.config?.delayMs ?? 0,
      impulse: { timeMs: impulseIndices.map(i => frame.impulse.timeMs[i]), value: impulseIndices.map(i => frame.impulse.value[i]) } });
  }
  function importTraces(text) {
    if (typeof text !== 'string' || text.length > 6291456) fail('Il file misure supera 6 MiB.');
    const data = JSON.parse(text);
    if (data?.format !== 'sculpt-wing-measurements' || data.version !== 1 || !Array.isArray(data.traces) || data.traces.length > MAX_TRACES) fail('Formato misure Sculpt non riconosciuto.');
    return data.traces.map(validateTrace);
  }
  const idParts = id => /^(ch|aux|bus|main)-([1-9]\d*)$/.exec(String(id));
  function activeMicSource(values, id) {
    const match = idParts(id);
    if (!match || !['ch', 'aux'].includes(match[1])) return null;
    const base = '/' + match[1] + '/' + Number(match[2]), setting = base + '/in/set/', conn = base + '/in/conn/';
    const auto = values[setting + 'srcauto'], localAlt = values[setting + 'altsrc'];
    if (![0, 1].includes(auto) || ![0, 1].includes(localAlt)) return null;
    const globalAlt = values['/io/altsw'];
    if (auto && (![0, 1].includes(globalAlt) || globalAlt !== localAlt)) return null;
    const alt = auto ? globalAlt : localAlt;
    const group = values[conn + (alt ? 'altgrp' : 'grp')], index = values[conn + (alt ? 'altin' : 'in')];
    if (!['LCL', 'AUX', 'A', 'B', 'C', 'SC', 'AES'].includes(group) || !Number.isInteger(index) || index < 1) return null;
    const path = '/io/in/' + group + '/' + index;
    if (values[path + '/mode'] !== 'M') return null;
    return { group, index, path, gain: finite(values[path + '/g'], -120, 120) ? values[path + '/g'] : null, alt: !!alt };
  }
  function resolveRouting(values, micId, referenceId, side = 'L') {
    const mic = activeMicSource(values, micId), ref = idParts(referenceId), micMatches = [], referenceMatches = [];
    for (let n = 1; n <= 48; n++) {
      const path = '/io/out/USB/' + n, group = values[path + '/grp'], index = values[path + '/in'];
      if (mic && group === mic.group && index === mic.index) micMatches.push({ channel: n - 1, label: 'USB ' + n + ' · ' + mic.group + ' ' + mic.index + ' dopo preamp' });
      if (!ref) continue;
      const refGroup = ref[1].toUpperCase(), refNumber = Number(ref[2]);
      if (['BUS', 'MAIN'].includes(refGroup) && side !== 'L+R' && group === refGroup && index === refNumber * 2 - (side === 'R' ? 0 : 1)) {
        referenceMatches.push({ channel: n - 1, label: 'USB ' + n + ' · ' + refGroup + ' ' + refNumber + ' ' + side });
      }
      if (group !== 'USR' || !Number.isInteger(index) || index < 1 || index > 24) continue;
      const user = '/io/in/USR/' + index + '/user/';
      if (values[user + 'grp'] === refGroup && values[user + 'in'] === refNumber && values[user + 'lr'] === side && ['PRE', 'POST'].includes(values[user + 'tap'])) {
        referenceMatches.push({ channel: n - 1, label: 'USB ' + n + ' · USER ' + index + ' · ' + values[user + 'tap'] + ' · ' + side });
      }
    }
    return { mic, micMatches, referenceMatches };
  }
  const aliases = { MONO: 'M', STEREO: 'ST', 'MID/SIDE': 'M/S', 'LOCAL IN': 'LCL', 'AUX IN': 'AUX', 'USB AUDIO': 'USB', 'AES50-A': 'A', 'AES50-B': 'B', 'AES50-C': 'C' };
  function normaliseWire(live, path, value) {
    if (!/(?:grp|altgrp|mode|tap|lr)$/.test(path)) return value;
    const text = typeof value === 'string' ? value : live.metadata?.(path)?.items?.find(item => item.value === value)?.label;
    if (typeof text !== 'string') return value;
    const normalized = text.trim().toUpperCase(); return aliases[normalized] || normalized;
  }
  async function readRouting(live, micId, referenceId, side = 'L') {
    if (!live?.isConnected?.() || !live.readValues) fail('Collega la WING per verificare i nomi sul patch USB. Gli ingressi USB restano selezionabili manualmente.');
    const token = live.sessionToken?.(), values = {}, bases = new Set();
    const current = () => { if (!live.isConnected?.() || token !== live.sessionToken?.()) fail('La connessione WING è cambiata durante la lettura.'); };
    const read = async (path, depth = 0, optional = false) => {
      current();
      try {
        const result = await live.readValues(path, { depth }); current(); bases.add(path);
        for (const [key, value] of Object.entries(result || {})) values[key] = normaliseWire(live, key, value);
      } catch (error) { current(); if (!optional) throw error; }
    };
    const mic = idParts(micId), micBase = mic && '/' + mic[1] + '/' + Number(mic[2]);
    if (!micBase) fail('Scegli il canale del microfono.');
    const initial = await Promise.allSettled([read('/io/out/USB', 1), read(micBase + '/in/conn'), read(micBase + '/in/set'), read('/io/altsw')]);
    for (const result of initial) if (result.status === 'rejected') throw result.reason;
    const auto = values[micBase + '/in/set/srcauto'], localAlt = values[micBase + '/in/set/altsrc'], alt = auto === 1 ? values['/io/altsw'] : localAlt;
    const group = values[micBase + '/in/conn/' + (alt ? 'altgrp' : 'grp')], index = values[micBase + '/in/conn/' + (alt ? 'altin' : 'in')];
    if (['LCL', 'AUX', 'A', 'B', 'C', 'SC', 'AES'].includes(group) && Number.isInteger(index) && index > 0) await read('/io/in/' + group + '/' + index);
    const users = new Set();
    for (let n = 1; n <= 48; n++) if (values['/io/out/USB/' + n + '/grp'] === 'USR') {
      const user = values['/io/out/USB/' + n + '/in']; if (Number.isInteger(user) && user >= 1 && user <= 24) users.add(user);
    }
    const pending = [...users];
    for (let start = 0; start < pending.length; start += 4) {
      const batch = await Promise.allSettled(pending.slice(start, start + 4).map(user => read('/io/in/USR/' + user + '/user', 0, true)));
      for (const result of batch) if (result.status === 'rejected') throw result.reason;
    }
    current();
    return { ...resolveRouting(values, micId, referenceId, side), values, token, bases: [...bases], micId, referenceId, side };
  }
  function selectedGuards(route, measurementChannel, referenceChannel) {
    if (!route?.values) return {};
    const guards = {}, v = route.values, mic = idParts(route.micId), micBase = mic && '/' + mic[1] + '/' + Number(mic[2]);
    const add = path => { if (own(v, path)) guards[path] = v[path]; };
    if (micBase) for (const path of ['in/conn/grp', 'in/conn/in', 'in/conn/altgrp', 'in/conn/altin', 'in/set/srcauto', 'in/set/altsrc']) add(micBase + '/' + path);
    add('/io/altsw');
    if (route.mic) for (const field of ['mode', 'g']) add(route.mic.path + '/' + field);
    for (const channel of [measurementChannel, referenceChannel]) {
      const base = '/io/out/USB/' + (channel + 1); add(base + '/grp'); add(base + '/in');
      if (v[base + '/grp'] === 'USR') {
        const user = '/io/in/USR/' + v[base + '/in'] + '/user/';
        for (const field of ['grp', 'in', 'tap', 'lr']) add(user + field);
      }
    }
    return guards;
  }
  function guardsChanged(live, guards) {
    if (!live?.isConnected?.()) return true;
    return Object.entries(guards || {}).some(([path, value]) => live.hasValue?.(path) && normaliseWire(live, path, live.value(path)) !== value);
  }
  async function readGuards(live, route, guards) {
    if (!route || !live?.isConnected?.() || route.token !== live.sessionToken?.()) return false;
    const keys = Object.keys(guards), bases = [...new Set(keys.map(path => path === '/io/altsw' ? path : path.slice(0, path.lastIndexOf('/'))))], fresh = {};
    for (let start = 0; start < bases.length; start += 4) {
      const batch = await Promise.allSettled(bases.slice(start, start + 4).map(path => live.readValues(path, { depth: 0 })));
      for (const result of batch) {
        if (result.status === 'rejected') throw result.reason;
        for (const [path, value] of Object.entries(result.value || {})) fresh[path] = normaliseWire(live, path, value);
      }
    }
    if (!live.isConnected?.() || route.token !== live.sessionToken?.()) return false;
    return keys.every(path => own(fresh, path) && fresh[path] === guards[path]);
  }
  const API = { MAX_POINTS, MAX_TRACES, MAX_BINS, parseCalibration, calibrationProfile, normaliseConfig, validateTrace, snapshot, importTraces, activeMicSource, resolveRouting, readRouting, selectedGuards, guardsChanged, readGuards };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (root) root.SculptAnalysisRouting = Object.freeze(API);
})(typeof window === 'object' ? window : null);
