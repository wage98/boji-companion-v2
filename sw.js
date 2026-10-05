// Boji Companion V2 service worker. The release build replaces the channel
// marker so RC and Production have disjoint Cache Storage namespaces.
const RELEASE_CHANNEL = 'rc';
const CACHE_PREFIX = `boji-v2-${RELEASE_CHANNEL}-`;
const CACHE_NAME = `${CACHE_PREFIX}6`;
const BASE_URL = new URL('./', self.registration.scope);
const ASSETS = [
  './', './index.html', './app.js', './data-layer.js', './styles.css',
  './manifest.json', './release-config.js',
  './assets/boji/portrait-master.png', './assets/boji/chibi-base.png',
  './assets/boji/icon-192.png', './assets/boji/icon-512.png'
].map(path => new URL(path, BASE_URL).href);

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await precache();
    if (!self.registration.active) return;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'BOJI_UPDATE_READY', cacheName: CACHE_NAME }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // This registration may remove only older caches owned by its own release
    // channel. Unmanaged and Production caches remain untouched by RC.
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'BOJI_ADOPT_UPDATE') {
    event.waitUntil(self.skipWaiting());
  }
});

function offlinePage() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Boji Companion V2</title><main style="font:16px system-ui;max-width:34rem;margin:12vh auto;padding:1rem;line-height:1.7">' +
    '<h1>暂时无法打开</h1><p>当前页面还没有可用的离线副本。请联网打开一次，再使用离线功能。</p>' +
    '<button onclick="location.reload()">重试</button></main>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function cacheResponse(cache, request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return Promise.resolve();
  return cache.put(request, response.clone());
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(BASE_URL.href)) return;

  const isPage = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  const update = (async () => {
    try {
      const response = await fetch(request);
      try { await cacheResponse(await caches.open(CACHE_NAME), request, response); } catch (_) {}
      return response;
    } catch (_) { return null; }
  })();
  // Keep refresh/cache writes alive after the response has been returned.
  event.waitUntil(update.then(() => undefined));

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(request) || (isPage ? await cache.match(new URL('index.html', BASE_URL).href) : null);
    if (hit) return hit;
    const fresh = await update;
    if (fresh && fresh.status === 200) return fresh;
    return isPage ? offlinePage() : new Response('', { status: 504, statusText: 'offline' });
  })());
});
