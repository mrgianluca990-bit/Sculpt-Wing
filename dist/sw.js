/* Bump this version whenever the app shell or its assets change. */
const CACHE_NAME = 'sculpt-control-v22';
const CACHE_PREFIX = 'sculpt-control-';
const LEGACY_CACHES = new Set(['sculpt-control-v1', 'sculpt-control-v2', 'sculpt-control-v3', 'sculpt-control-v4']);
const BASE_URL = new URL('./', self.location.href);
const APP_URL = new URL('index.html', BASE_URL).href;
const ASSETS = [
  ['index.html', 'html'],
  ['styles.css', 'css'],
  ['plugin-data.js', 'js'],
  ['model.js', 'js'],
  ['app.js', 'js'],
  ['dca-bank.js', 'js'],
  ['row-layout.js', 'js'],
  ['row-layout.css', 'css'],
  ['strip-pins.js', 'js'],
  ['strip-pins.css', 'css'],
  ['desk.js', 'js'],
  ['shell.js', 'js'],
  ['shell.css', 'css'],
  ['plugins.js', 'js'],
  ['plugins.css', 'css'],
  ['plugin-panels.js', 'js'],
  ['plugin-original-layouts.js', 'js'],
  ['plugin-original-dynamics.js', 'js'],
  ['plugin-original-eq.js', 'js'],
  ['plugin-original-fx.js', 'js'],
  ['plugin-original-channel.js', 'js'],
  ['plugin-original-native.js', 'js'],
  ['plugin-original-dynamics-extra.js', 'js'],
  ['plugin-original-filters.js', 'js'],
  ['pdf-reader.js', 'js'],
  ['pdf.worker.js', 'js'],
  ['channel-list.js', 'js'],
  ['channel-list-scene.js', 'js'],
  ['channel-list-preview.js', 'js'],
  ['channel-list.css', 'css'],
  ['native-bridge.js', 'js'],
  ['wing-map.js', 'js'],
  ['live-session.js', 'js'],
  ['live.js', 'js'],
  ['live-pages.js', 'js'],
  ['live.css', 'css'],
  ['editor.js', 'js'],
  ['editor.css', 'css'],
  ['io.js', 'js'],
  ['systems.js', 'js'],
  ['systems.css', 'css'],
  ['offline.js', 'js'],
  ['manifest.webmanifest', 'manifest'],
  ['icon-red-180.png', 'png'],
  ['icon-red-192.png', 'png'],
  ['icon-red-512.png', 'png']
].map(([path, kind]) => ({ url: new URL(path, BASE_URL).href, path, kind }));
const ASSET_BY_URL = new Map(ASSETS.map(asset => [asset.url, asset]));
let preparation = null;

async function validAsset(response, asset) {
  if (!response || response.status !== 200 || response.type !== 'basic' || response.redirected) return false;
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (asset.kind === 'html') {
    if (type !== 'text/html') return false;
    const html = await response.clone().text();
    return /<title\s*>\s*Sculpt Wing(?:\s|<|[—–|:])/i.test(html);
  }
  if (asset.kind === 'css') return type === 'text/css';
  if (asset.kind === 'js') return ['application/javascript', 'text/javascript', 'application/x-javascript'].includes(type);
  if (asset.kind === 'manifest') {
    if (!['application/manifest+json', 'application/json'].includes(type)) return false;
    try {
      const manifest = await response.clone().json();
      return manifest.name === 'Sculpt Wing' && typeof manifest.start_url === 'string';
    } catch { return false; }
  }
  if (asset.kind === 'png') {
    if (type !== 'image/png') return false;
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  }
  return false;
}

async function verifyCache() {
  if (!(await caches.has(CACHE_NAME))) return { ready: false, missing: ASSETS.map(asset => asset.path) };
  const cache = await caches.open(CACHE_NAME);
  const checks = await Promise.all(ASSETS.map(async asset => ({
    path: asset.path,
    valid: await validAsset(await cache.match(asset.url), asset)
  })));
  const missing = checks.filter(check => !check.valid).map(check => check.path);
  return { ready: missing.length === 0, missing };
}

async function prepareCache() {
  if (preparation) return preparation;
  preparation = (async () => {
    // Fetch and validate everything before writing: redirects to a sign-in page
    // or a partial download must never produce an "offline ready" installation.
    const responses = await Promise.all(ASSETS.map(async asset => {
      const response = await fetch(asset.url, {
        cache: 'reload', credentials: 'same-origin', redirect: 'error'
      });
      if (!(await validAsset(response, asset))) throw new Error(`Invalid app asset: ${asset.path}`);
      return response;
    }));
    const existed = await caches.has(CACHE_NAME);
    try {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(ASSETS.map((asset, index) => cache.put(asset.url, responses[index])));
      if (!(await verifyCache()).ready) throw new Error('Incomplete offline cache');
    } catch (error) {
      // Never remove a previously working version on a failed first install.
      if (!existed) await caches.delete(CACHE_NAME);
      throw error;
    }
  })();
  try { await preparation; } finally { preparation = null; }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await prepareCache();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (!(await verifyCache()).ready) throw new Error('Offline assets are incomplete');
    const names = await caches.keys();
    const migrateLegacyPage = names.some(name => LEGACY_CACHES.has(name));
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.postMessage({ type: 'SCULPT_CACHE_CHANGED', version: CACHE_NAME }));
    // The first prototype had no update UI: its cached v3 page would report a
    // version mismatch forever after this activation. Migrate those app pages
    // exactly once, only after the full new cache has passed validation. Never
    // navigate login/API paths, query-bearing auth callbacks or a QA wrapper.
    // Local storage is untouched; the old app saves on pagehide.
    if (migrateLegacyPage) {
      const appClients = clients.filter(client => {
        const url = new URL(client.url);
        return url.origin === BASE_URL.origin && !url.search &&
          (url.pathname === BASE_URL.pathname || url.pathname === new URL(APP_URL).pathname);
      });
      // Do not extend activation until navigation finishes: those navigations
      // wait for this worker to finish activating before fetching the app.
      // Awaiting them here creates a circular wait and strands the old page.
      for (const client of appClients) {
        client.navigate(client.url).catch(() => { /* A closed tab needs no retry. */ });
      }
    }
  })());
});

self.addEventListener('message', event => {
  if (!['SCULPT_VERIFY_OFFLINE', 'SCULPT_REPAIR_CACHE'].includes(event.data?.type) || !event.ports?.[0]) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'SCULPT_REPAIR_CACHE') await prepareCache();
      const result = await verifyCache();
      event.ports[0].postMessage({ type: 'SCULPT_OFFLINE_STATUS', version: CACHE_NAME, ...result });
    } catch {
      event.ports[0].postMessage({ type: 'SCULPT_OFFLINE_STATUS', version: CACHE_NAME, ready: false, missing: [] });
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE_URL.origin) return;
  const navigation = request.mode === 'navigate' &&
    (url.pathname === BASE_URL.pathname || url.pathname === new URL(APP_URL).pathname);
  // Authentication paths, APIs, arbitrary URLs and other origins are untouched.
  const exactAsset = !url.search && ASSET_BY_URL.has(url.href);
  if (!navigation && !exactAsset) return;
  const cacheKey = navigation ? APP_URL : url.href;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    // Do not silently add runtime responses to the verified app-shell cache.
    // An uncached online response may be authentication HTML or an error page.
    return fetch(request);
  })());
});
