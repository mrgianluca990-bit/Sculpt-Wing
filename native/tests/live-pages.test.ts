// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), '../dist/live-pages.js'), 'utf8');
const w = window as unknown as Record<string, any>;
type Meta = { type: number; readOnly?: boolean; unit?: number; min?: number; max?: number; items?: Array<{ value: string | number; label: string }> };
type Page = { handled: true; cleanup: () => void };
const pages: Page[] = [];
async function flush() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
afterEach(() => {
  for (const page of pages.splice(0)) page.cleanup();
  document.body.replaceChildren(); delete w.SculptLive; delete w.SculptUI; delete w.SculptLivePages;
  vi.useRealTimers();
});
function setup() {
  vi.useFakeTimers();
  const bank = new Map<string, string | number>(), definitions = new Map<string, Meta>();
  const values = new Map<string, string | number>(), metadata = new Map<string, Meta>();
  const listeners = new Set<() => void>();
  const reads: string[] = [], lists: string[] = [], writes: Array<[string, string | number, boolean]> = [], opened: string[] = [];
  let live = true, connected = true, writable = true, epoch = 1, release: (() => void) | null = null, held = false;
  const notify = () => { for (const fn of listeners) fn(); };
  const put = (path: string, value: string | number, meta: Meta) => { bank.set(path, value); definitions.set(path, meta); };
  const string = (path: string, value: string, readOnly = true) => put(path, value, { type: 7, readOnly });
  const integer = (path: string, value: number, readOnly = true, max = 100) => put(path, value, { type: 4, readOnly, min: 0, max });
  const enumeration = (path: string, value: string, options: string[]) => put(path, value, { type: 5, items: options.map(value => ({ value, label: value })) });
  const ms = (path: string, value: number) => put(path, value, { type: 1, readOnly: true, unit: 3 });
  enumeration('/cards/wlive/sdlink', 'IND', ['IND', 'PAR']);
  for (const index of [1, 2]) {
    const base = '/cards/wlive/' + index, stat = base + '/$stat', ctl = base + '/$ctl';
    string(stat + '/state', 'STOP'); ms(stat + '/etime', index * 12000); ms(stat + '/sdfree', 3600000);
    integer(stat + '/sdsize', 32); string(stat + '/sdstate', 'READY'); integer(stat + '/sessionpos', 1);
    string(stat + '/tracks', '32'); string(stat + '/rate', '48'); integer(stat + '/sessions', 2);
    integer(stat + '/markers', 1); integer(stat + '/markerpos', 1); string(stat + '/errormessage', '');
    string(stat + '/snamelist', 'Sessione reale A,Sessione reale B');
    enumeration(ctl + '/control', 'STOP', ['STOP', 'PPAUSE', 'PLAY', 'REC']);
    integer(ctl + '/opensession', 1, false); integer(ctl + '/setmarker', 0, false, 1);
    string(ctl + '/namesession', 'Concerto', false);
    enumeration(base + '/cfg/rectracks', '32', ['32', '16', '8']);
    enumeration(base + '/cfg/playmode', 'PLAY', ['PLAY', 'A->B', 'LOOP']);
  }
  string('/rec/$actstate', 'STOP'); string('/rec/$actfile', 'REAL.WAV'); ms('/rec/$time', 8000);
  enumeration('/rec/$action', 'STOP', ['STOP', 'REC', 'PAUSE', 'NEWFILE']);
  enumeration('/rec/resolution', '24', ['16', '24']); enumeration('/rec/channels', '2', ['2', '4']); string('/rec/path', '/REAL.WAV', false);
  string('/play/$actstate', 'STOP'); string('/play/$actfile', '/Music/real.wav');
  enumeration('/play/$action', 'IDLE', ['IDLE', 'STOP', 'PLAY', 'PAUSE', 'NEXT', 'PREV', 'PLAYFILE']);
  put('/play/$pos', 12, { type: 1, unit: 6 }); put('/play/$total', 180, { type: 1, readOnly: true, unit: 6 });
  integer('/play/repeat', 0, false, 1); string('/play/$playfile', '/Music/real.wav', false);
  string('/play/$format', 'WAV'); string('/play/$song', 'Brano reale'); string('/play/$artist', 'Artista');
  string('/play/$actlist', '/Music'); integer('/play/$actidx', 1); string('/play/$songs', 'Unica voce ricevuta');
  string('/$ctl/lib/$actshow', 'I:Tour'); string('/$ctl/lib/$active', 'I:Tour/Apertura.snap');
  integer('/$ctl/lib/$actidx', 1); integer('/$ctl/lib/$activeid', 0);
  integer('/$ctl/lib/$actionidx', 0, false, 16384);
  enumeration('/$ctl/lib/$action', 'IDLE', ['IDLE', 'GOPREV', 'GONEXT', 'GO', 'PREV', 'NEXT', 'GOTAG']);
  string('/$ctl/lib/$scenes', 'SoloPrimaScena');
  definitions.set('/$ctl/lib/$scenes', { type: 5, readOnly: true, items: Array.from({ length: 150 }, (_, i) => ({ value: i === 0 ? 'Apertura~Luci di sala' : 'Scena ' + (i + 1), label: '' })) });

  const el = (tag: string, cls?: string, text?: unknown) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const button = (text: string, action?: () => void, cls = '') => { const b = el('button', 'desk-button ' + cls, text); if (action) b.addEventListener('click', action); return b; };
  const wrap = (tag: string, cls: string, ...children: HTMLElement[]) => { const n = el(tag, cls); n.append(...children); return n; };
  w.SculptUI = {
    el, button,
    card: (title: string, ...children: HTMLElement[]) => wrap('section', 'desk-card', el('h3', '', title), ...children),
    grid: (...children: HTMLElement[]) => wrap('div', 'desk-grid', ...children),
    field: (label: string, control: HTMLElement) => wrap('label', 'desk-field', el('span', '', label), control),
    tabs: (tabs: Array<{ id: string; label: string }>, selected: string, change: (id: string) => void) => {
      const nav = el('div', 'desk-tabs');
      for (const tab of tabs) { const b = button(tab.label, () => change(tab.id)); b.setAttribute('aria-selected', String(tab.id === selected)); nav.append(b); }
      return nav;
    },
    open: (path: string) => opened.push(path),
  };
  w.SculptLive = {
    isLive: () => live, isConnected: () => connected, isWritable: () => writable,
    sessionToken: () => epoch,
    snapshot: () => ({ info: { name: 'WING palco', model: 'ngc-rack', firmware: '3.1.2', host: '192.168.1.62' } }),
    value: (path: string) => values.get(path), hasValue: (path: string) => values.has(path), metadata: (path: string) => metadata.get(path),
    openExplorer: (path: string) => opened.push(path),
    subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); },
    async listNode(path: string, options: { refresh: boolean }) {
      expect(options.refresh).toBe(true); lists.push(path);
      return [...definitions].filter(([key]) => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/')).map(([path, def]) => ({ ...def, path, name: path.split('/').at(-1) }));
    },
    async readNode(path: string, options: { force: boolean }) {
      expect(options.force).toBe(true); reads.push(path);
      // Mimic force refresh: a parent invalidates cached descendants.
      for (const key of values.keys()) if (key === path || key.startsWith(path + '/')) { values.delete(key); metadata.delete(key); }
      for (const [key, def] of definitions) {
        const rest = key.startsWith(path + '/') ? key.slice(path.length + 1) : null;
        if (key === path || rest !== null && !rest.includes('/')) { values.set(key, bank.get(key)!); metadata.set(key, def); }
      }
      notify();
    },
    async write(path: string, value: string | number, options: { trigger: boolean }) {
      writes.push([path, value, options.trigger]);
      if (held) await new Promise<void>(resolve => { release = resolve; });
      bank.set(path, value);
      const sd = /^\/cards\/wlive\/([12])\/\$ctl\/control$/.exec(path);
      if (sd) bank.set('/cards/wlive/' + sd[1] + '/$stat/state', value);
      if (path === '/rec/$action' && value !== 'NEWFILE') bank.set('/rec/$actstate', value);
      if (path === '/play/$action' && ['STOP', 'PLAY', 'PAUSE'].includes(String(value))) bank.set('/play/$actstate', value);
      if (path === '/$ctl/lib/$action') {
        bank.set(path, 'IDLE');
        if (value === 'GO') { bank.set('/$ctl/lib/$actidx', bank.get('/$ctl/lib/$actionidx') || 2); bank.set('/$ctl/lib/$active', 'I:Tour/ScenaReale.snap'); }
      }
      return { actual: bank.get(path) };
    },
  };
  new Function('window', 'document', source)(window, document);
  const container = el('div'); document.body.append(container);
  const render = (id: string, args = {}) => { const page = w.SculptLivePages.render(id, container, args); if (page) pages.push(page); return page; };
  return {
    container, render, reads, lists, writes, opened, bank, definitions, listeners,
    click: (text: string) => { const b = [...container.querySelectorAll('button')].find(b => b.textContent === text); if (!b) throw new Error('No button: ' + text); b.click(); return b; },
    button: (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent === text)!,
    live: (value: boolean) => { live = value; notify(); },
    connected: (value: boolean) => { connected = value; notify(); },
    writable: (value: boolean) => { writable = value; notify(); },
    replaceSession: () => { ++epoch; notify(); },
    hold: () => { held = true; },
    release: () => { held = false; release?.(); },
  };
}

describe('native recorder/show/setup panels', () => {
  it('uses received SD time and state, never an optimistic recording state or virtual clock', async () => {
    const env = setup(); env.render('recorder'); await flush();
    expect(env.container.querySelector('.lp-clock')?.textContent).toBe('00:00:12');
    expect(env.container.querySelector('.lp-state')?.textContent).toBe('STOP');
    expect((env.container.querySelector('input[aria-label="Nome sessione · in Stop"]') as HTMLInputElement).value).toBe('Concerto');
    expect(env.reads.slice(0, 4)).toEqual(['/cards/wlive', '/cards/wlive/1/$stat', '/cards/wlive/1/$ctl', '/cards/wlive/1/cfg']);
    env.hold(); env.click('● REC'); await flush();
    expect(env.container.querySelector('.lp-state')?.textContent).toBe('STOP');
    expect(env.writes.at(-1)).toEqual(['/cards/wlive/1/$ctl/control', 'REC', true]);
    env.release(); await flush();
    expect(env.container.querySelector('.lp-state')?.textContent).toBe('REC');
    await vi.advanceTimersByTimeAsync(1600); await flush();
    expect(env.container.querySelector('.lp-clock')?.textContent).toBe('00:00:12');
    expect(env.reads).toContain('/cards/wlive/1/$stat/etime');
    expect(env.writes.some(([path]) => /format|delete/.test(path))).toBe(false);
  });

  it('routes SD B, USB recorder and USB player actions to their actual documented paths', async () => {
    const env = setup(); env.render('recorder', { tab: 'sdB' }); await flush();
    env.click('▶ Play'); await flush();
    expect(env.writes.at(-1)).toEqual(['/cards/wlive/2/$ctl/control', 'PLAY', true]);
    env.click('USB REC'); await flush(); env.click('● REC'); await flush();
    expect(env.writes.at(-1)).toEqual(['/rec/$action', 'REC', true]);
    expect(env.container.querySelector('.lp-state')?.textContent).toBe('REC');
    env.click('PLAYER'); await flush(); env.click('▶ Play'); await flush();
    expect(env.writes.at(-1)).toEqual(['/play/$action', 'PLAY', true]);
    expect(env.container.querySelector('.lp-clock')?.textContent).toBe('00:00:12');
    expect(env.container.textContent).toContain('/Music/real.wav');
  });

  it('disables unavailable firmware actions and a read-only connection', async () => {
    const env = setup();
    env.definitions.get('/cards/wlive/1/$ctl/control')!.items = [{ value: 'STOP', label: 'Stop' }];
    env.render('recorder'); await flush();
    expect(env.button('● REC').disabled).toBe(true);
    expect(env.button('■ Stop').disabled).toBe(false);
    env.writable(false); await flush();
    expect(env.button('■ Stop').disabled).toBe(true);
    expect(env.writes).toEqual([]);
  });

  it('sends zero before relative show navigation and uses a numeric index followed by GO', async () => {
    const env = setup(); env.render('scenes'); await flush();
    env.click('NEXT ›'); await flush();
    expect(env.writes.slice(-2)).toEqual([['/$ctl/lib/$actionidx', 0, false], ['/$ctl/lib/$action', 'NEXT', true]]);
    const input = env.container.querySelector('input')!; input.value = '7'; input.dispatchEvent(new Event('input', { bubbles: true }));
    env.click('GO'); await flush();
    expect(env.writes.slice(-2)).toEqual([['/$ctl/lib/$actionidx', 7, false], ['/$ctl/lib/$action', 'GO', true]]);
    expect(env.container.querySelector('.lp-scene-name')?.textContent).toBe('I:Tour/ScenaReale.snap');
    expect(env.container.querySelectorAll('.lp-scene-row')).toHaveLength(150);
    expect(env.container.textContent).toContain('Scena 150');
    expect(env.container.textContent).not.toContain('SoloPrimaScena');
  });

  it('does not enable show recall without an opened show on the console', async () => {
    const env = setup(); env.bank.set('/$ctl/lib/$actshow', ''); env.render('scenes'); await flush();
    expect(env.button('GO').disabled).toBe(true);
    expect(env.button('GO NEXT').disabled).toBe(true);
    expect(env.container.textContent).toContain('Apri uno Show sul banco');
  });

  it('opening and refreshing scenes reads bounded leaves without requesting the whole library', async () => {
    const env = setup();
    const readNode = w.SculptLive.readNode;
    w.SculptLive.readNode = async (path: string, options: { force: boolean }) => {
      if (path === '/$ctl/lib') { env.connected(false); throw new Error('Broad library request exceeded its deadline'); }
      return readNode(path, options);
    };
    env.render('scenes'); await flush();
    const expected = ['$actshow', '$actshow', '$active', '$actidx', '$activeid', '$actionidx', '$action'].map(name => '/$ctl/lib/' + name);
    expect(env.reads).toEqual(expected);
    expect(env.lists).toEqual(['/$ctl/lib']);
    expect(w.SculptLive.isConnected()).toBe(true);
    expect(env.button('GO').disabled).toBe(false);
    env.click('↻ Aggiorna'); await flush();
    expect(env.reads).toEqual([...expected, ...expected]);
    await vi.advanceTimersByTimeAsync(1600); await flush();
    expect(env.reads.slice(-3)).toEqual(['/$ctl/lib/$actidx', '/$ctl/lib/$active', '/$ctl/lib/$actshow']);
    expect(w.SculptLive.isConnected()).toBe(true);
    expect(env.writes).toEqual([]);
  });

  it('an unavailable optional scene list leaves the connection and supported show controls usable', async () => {
    const env = setup();
    w.SculptLive.listNode = async () => { throw new Error('Elenco scene non disponibile su questo firmware'); };
    env.render('scenes'); await flush();
    expect(w.SculptLive.isConnected()).toBe(true);
    expect(env.container.querySelector('.lp-scene-name')?.textContent).toBe('I:Tour/Apertura.snap');
    expect(env.button('GO').disabled).toBe(false);
    expect(env.container.querySelector('.lp-message')?.textContent).toContain('Lettura incompleta');
    expect(env.container.querySelectorAll('.lp-scene-row')).toHaveLength(0);
    expect(env.writes).toEqual([]);
  });

  it('selects every entry of the complete definition and recalls its one-based Show number', async () => {
    const env = setup();
    env.definitions.get('/$ctl/lib/$scenes')!.items![149] = { value: 'Finale, bis~Grazie', label: '' };
    env.render('scenes'); await flush();
    const search = env.container.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'bis'; search.dispatchEvent(new Event('input'));
    expect(env.container.querySelectorAll('.lp-scene-row')).toHaveLength(1);
    (env.container.querySelector('.lp-scene-row') as HTMLButtonElement).click();
    expect(env.writes).toEqual([]);
    env.click('Richiama selezionata'); await flush();
    expect(env.writes).toEqual([['/$ctl/lib/$actionidx', 150, false], ['/$ctl/lib/$action', 'GO', true]]);
    expect(env.container.querySelector('.lp-scene-row')?.textContent).toContain('ATTIVA');
  });

  it('discards a catalogue if the console changes Show while its definition is loading', async () => {
    const env = setup(), list = w.SculptLive.listNode;
    w.SculptLive.listNode = async (...args: any[]) => {
      const result = await list(...args); env.bank.set('/$ctl/lib/$actshow', 'I:Altro'); return result;
    };
    env.render('scenes'); await flush();
    expect(env.container.querySelectorAll('.lp-scene-row')).toHaveLength(0);
    expect(env.container.textContent).toContain('Show è cambiato');
    expect(env.writes).toEqual([]);
  });

  it('refuses a selected name whose Show position changed before recall', async () => {
    const env = setup(); env.render('scenes'); await flush();
    (env.container.querySelector('.lp-scene-row') as HTMLButtonElement).click();
    env.definitions.get('/$ctl/lib/$scenes')!.items![0].value = 'Nuova prima scena';
    env.click('Richiama selezionata'); await flush();
    expect(env.writes).toEqual([]);
    expect(env.container.querySelector('.lp-message')?.textContent).toContain('ordine o il nome');
  });

  it.each(['show', 'session'])('never sends GO after %s changes between selection and recall', async change => {
    const env = setup(); env.render('scenes'); await flush();
    env.hold(); env.click('GO'); await flush();
    expect(env.writes).toEqual([['/$ctl/lib/$actionidx', 0, false]]);
    if (change === 'show') env.bank.set('/$ctl/lib/$actshow', 'I:Altro'); else env.replaceSession();
    env.release(); await flush();
    expect(env.writes).toHaveLength(1);
    expect(env.container.querySelector('.lp-message')?.textContent).toMatch(/cambiat/);
  });

  it('shows the live identity and sends setup navigation to the actual metadata explorer', async () => {
    const env = setup(); env.render('setup'); await flush();
    expect(env.container.textContent).toContain('WING palco');
    expect(env.container.textContent).toContain('ngc-rack');
    expect(env.container.textContent).toContain('192.168.1.62');
    const cards = [...env.container.querySelectorAll('button')].find(b => b.textContent?.startsWith('Schede e WING-LIVE'))!;
    cards.click();
    expect(env.opened.at(-1)).toBe('/cards');
    expect(env.container.querySelectorAll('input')).toHaveLength(0);
    expect(env.writes).toEqual([]);
  });

  it('offers connection when disconnected and cleans up polling/subscriptions on close', async () => {
    const env = setup(); env.connected(false); const page = env.render('recorder'); await flush();
    env.click('Apri connessione'); expect(env.opened.at(-1)).toBe('connection');
    env.connected(true); await flush();
    expect(env.container.querySelector('.lp-state')?.textContent).toBe('STOP');
    page.cleanup(); const count = env.reads.length;
    await vi.advanceTimersByTimeAsync(5000); await flush();
    expect(env.reads).toHaveLength(count); expect(env.listeners.size).toBe(0);
  });

  it('leaves the existing demo renderer in control outside live mode', () => {
    const env = setup(); env.live(false);
    expect(env.render('recorder')).toBeNull();
    expect(env.render('unknown')).toBeNull();
    expect(env.reads).toEqual([]);
  });
});

describe('native recorder macro adapter', () => {
  it('runs SD record and stop without a rendered page, then reads the actual recorder status', async () => {
    const env = setup();
    await expect(w.SculptLivePages.transport('sdA', 'record')).resolves.toBe(true);
    expect(env.writes.at(-1)).toEqual(['/cards/wlive/1/$ctl/control', 'REC', true]);
    expect(w.SculptLive.value('/cards/wlive/1/$stat/state')).toBe('REC');
    await expect(w.SculptLivePages.transport('sdA', 'stop')).resolves.toBe(true);
    expect(env.writes.at(-1)).toEqual(['/cards/wlive/1/$ctl/control', 'STOP', true]);
    expect(w.SculptLive.value('/cards/wlive/1/$stat/state')).toBe('STOP');
    expect(env.reads).toEqual(['/cards/wlive/1/$ctl', '/cards/wlive/1/$stat', '/cards/wlive/1/$ctl', '/cards/wlive/1/$stat']);
  });

  it('rejects unsupported transports without invented writes and rechecks permission after awaiting metadata', async () => {
    const env = setup();
    for (const [id, command] of [['usb', 'play'], ['usb', 'marker'], ['player', 'record'], ['player', 'marker'], ['sdA', 'format'], ['unknown', 'stop']]) {
      await expect(w.SculptLivePages.transport(id, command)).resolves.toBe(false);
    }
    expect(env.reads).toEqual([]); expect(env.writes).toEqual([]);
    env.connected(false);
    await expect(w.SculptLivePages.transport('sdA', 'record')).rejects.toThrow(/collegata/);
    expect(env.reads).toEqual([]);
    env.connected(true);
    const readNode = w.SculptLive.readNode;
    w.SculptLive.readNode = async (...args: unknown[]) => { await readNode(...args); env.writable(false); };
    await expect(w.SculptLivePages.transport('sdA', 'record')).rejects.toThrow(/controllo abilitato/);
    expect(env.writes).toEqual([]);
  });
});
