/* ColorGenius service worker: makes the app open instantly, work offline, and update only when you say so.
   Each version's files are saved together. The app keeps running the version it has; a new version is
   downloaded in the background and waits until Update is pressed (the app shows an Update button, and a popup
   when it opens). Bump VERSION with every release so installed apps see it. */
const VERSION = 'cg-2026-11-25-62';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/color.js', 'js/wood.js', 'js/stain.js', 'js/engine.js', 'js/tools.js', 'js/scenes.js', 'js/room3d.js', 'js/qr.js', 'js/inflate.js', 'js/cammatch.js', 'js/config.js', 'js/app.js',
  'data/brands.js', 'data/stains.js', 'data/popular.js', 'data/files.json', 'manifest.webmanifest',
  'img/tile-paint.jpg', 'img/tile-stain.jpg', 'img/tile-buy.jpg', 'img/tile-lookup.jpg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
];
// data that changes on its own between versions (the weekly popular colors): always the newest when online
const LIVE = ['data/popular.js'];

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
    // no skipWaiting here: a new version waits for the Update button (the very first install starts right away)
  })());
});

self.addEventListener('message', event => {
  const m = event.data || {};
  if (m.type === 'update') self.skipWaiting();
  if (m.type === 'version' && event.source) event.source.postMessage({ type: 'version', version: VERSION });
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
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const save = res => { if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone()); return res; };
    const offline = () => new Response('Offline and not saved yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    const fromNetwork = async () => {
      const res = await fetch(req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache' }) : new Request(req, { cache: 'no-cache' }));
      if (!res.ok && res.status !== 304) throw new Error('bad status');
      return save(res);
    };
    // the weekly data: newest when online, the saved copy offline or on a very slow connection
    if (sameOrigin && LIVE.some(p => url.pathname.endsWith('/' + p))) {
      try { return await Promise.race([fromNetwork(), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 6000))]); }
      catch (e) { return (await cache.match(key, { ignoreSearch: true })) || offline(); }
    }
    // the app itself and the color data: this version's saved copy, so nothing changes until Update is pressed.
    // A file this version hasn't saved yet (a brand icon, a picture) comes from the site and is saved.
    if (sameOrigin) {
      const cached = await cache.match(key, { ignoreSearch: true });
      if (cached) return cached;
      try { return await fromNetwork(); } catch (e) { return offline(); }
    }
    // fonts: saved copy right away, refreshed in the background
    const cached = await cache.match(key);
    const network = fetch(req).then(save).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    return (await network) || offline();
  })());
});
