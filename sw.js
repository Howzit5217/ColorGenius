/* ColorGenius service worker: makes the installed app open instantly and work offline.
   App files and color data are saved on first visit; when online the newest versions always load. */
const VERSION = 'cg-2026-11-24-42';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/color.js', 'js/wood.js', 'js/stain.js', 'js/engine.js', 'js/tools.js', 'js/scenes.js', 'js/room3d.js', 'js/config.js', 'js/app.js',
  'data/brands.js', 'data/stains.js', 'data/popular.js', 'data/files.json', 'manifest.webmanifest',
  'img/tile-paint.jpg', 'img/tile-stain.jpg', 'img/tile-buy.jpg', 'img/tile-lookup.jpg',
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
  // Everything from this site (app code and color data): always the newest version when online, so updates
  // show up the moment the app opens. "no-cache" asks the server whether the file changed, which is a tiny
  // request when it hasn't. Offline (or on a very slow connection) the saved copy is used instead.
  // Fonts: saved copy right away, refreshed in the background.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const save = res => { if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone()); return res; };
    const offline = () => new Response('Offline and not saved yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    if (sameOrigin) {
      try {
        const fresh = fetch(req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache' }) : new Request(req, { cache: 'no-cache' }));
        const res = await Promise.race([fresh, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 6000))]);
        if (!res.ok && res.status !== 304) throw new Error('bad status');
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
