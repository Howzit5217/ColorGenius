/* ColorGenius service worker: makes the installed app open instantly and work offline.
   App files and color data are saved on first visit, then refreshed in the background. */
const VERSION = 'cg-2026-11-23-2';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/color.js', 'js/engine.js', 'js/app.js',
  'data/brands.js', 'data/files.json', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // one missing file shouldn't stop the rest from being saved
    const saveAll = list => Promise.allSettled(list.map(u => cache.add(new Request(u, { cache: 'no-cache' }))));
    await saveAll(SHELL);
    // the list of brand color files is written by tools/build-data.mjs
    try {
      const files = await (await fetch('data/files.json', { cache: 'no-cache' })).json();
      await saveAll(files);
    } catch (e) { /* colors will be saved the first time they load */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION && key.startsWith('cg-')) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;
  // App code: newest version when online, saved copy when offline.
  // Color data, icons and fonts: saved copy right away, refreshed in the background.
  const appCode = req.mode === 'navigate' || (sameOrigin && /\.(html|js|css|webmanifest)$/.test(url.pathname) && !url.pathname.includes('/data/'));
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const save = res => { if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone()); return res; };
    const offline = () => new Response('Offline and not saved yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    if (appCode) {
      try {
        const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
        return save(res);
      } catch (e) {
        return (await cache.match(key, { ignoreSearch: true })) || offline();
      }
    }
    const cached = await cache.match(key, { ignoreSearch: sameOrigin });
    const network = fetch(req).then(save).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    return (await network) || offline();
  })());
});
