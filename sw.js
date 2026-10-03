// Boji Companion V2 service worker. The V2 cache namespace is isolated from V1.
const CACHE = 'boji-v2-rc-3';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './assets/icon.svg',
  './assets/boji-icon-192.png',
  './assets/boji-icon-512.png',
  './assets/boji-companion-candidate.png',
];

// 逐条写入：任一资源取不到也不让 install 整体失败
async function precache() {
  const c = await caches.open(CACHE);
  await Promise.all(ASSETS.map(u =>
    c.add(new Request(u, { cache: 'reload' })).catch(() => null)
  ));
  // 导航兜底：显式放一份 index.html，供断网时回落
  try { await c.put('./index.html', await fetch('./index.html')); } catch (_) {}
}

self.addEventListener('install', e => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const managedPrefixes=['boji-v2-rc-','boji-v2-prod-'];
    await Promise.all(keys.filter(k => k !== CACHE && managedPrefixes.some(prefix=>k.startsWith(prefix))).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 后台更新：命中缓存后顺手拉一份新的，下次打开就是最新版（不阻塞当前请求）
function staleWhileRevalidate(cache, request) {
  const net = fetch(request).then(res => {
    if (res && res.status === 200) {
      try { cache.put(request, res.clone()); } catch (_) {}
    }
    return res;
  }).catch(() => null);
  return net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 跨域资源（外链/瓦片）不接管

  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  // —— 页面：缓存优先（首屏秒开）→ 后台更新 → 断网回落缓存 ——
  if (isPage) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req) || await c.match('./index.html');
      const upd = staleWhileRevalidate(c, req);
      if (hit) return hit;                  // 立刻用本地副本渲染
      const fresh = await upd;              // 首次访问：等网络
      if (fresh && fresh.status === 200) {
        // 托管方返回的错误页（如 GitHub Pages 404）不放行，宁可显示自己的兜底
        return fresh;
      }
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>Boji Companion V2</title>' +
        '<body style="font-family:system-ui;padding:24px;line-height:1.8">' +
        '<h3>暂时打不开</h3><p>没有可用的本地缓存，且网络未连通。</p>' +
        '<button onclick="location.reload()">重试</button></body>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    })());
    return;
  }

  // —— 静态资源：缓存优先 + 后台更新 ——
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    if (hit) { staleWhileRevalidate(c, req); return hit; }
    try {
      const res = await fetch(req);
      if (res && res.status === 200) { try { c.put(req, res.clone()); } catch (_) {} }
      return res;
    } catch (_) {
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
