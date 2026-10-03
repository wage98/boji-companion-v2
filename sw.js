// 训练日记 · Service Worker（离线缓存 app shell）
// v1.2 启动体验修复要点：
//  1) 页面与静态资源一律「缓存优先 + 后台更新」（stale-while-revalidate）
//     —— 之前页面是网络优先：托管在 GitHub Pages 上时，每次启动都要等网络，
//        网络慢/不通就长时间转圈甚至落到 GitHub 的 404 页。改成本地优先后，
//        二次打开完全走本地缓存，断网也能秒开。
//  2) install 阶段逐条 put（单条失败不影响整体），并缓存 index.html 作为导航兜底，
//     确保任何情况下都能渲染出自己的页面，而不是托管方的错误页。
//  3) 跳过等待 + 立即接管，避免旧 SW 卡住导致更新后仍加载旧资源。
const CACHE = 'boji-1-2-0';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/nahida-card.webp',
  './assets/nahida-icon.webp',
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
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
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
        '<!doctype html><meta charset="utf-8"><title>训练日记</title>' +
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
