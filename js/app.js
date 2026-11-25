/* ColorGenius app: the paint department, simple enough for anyone.
   Home → one question per screen → results you can see in a room → a color page with everything you need to buy.
   Depends on CG.color, CG.engine, CG.stain, CG.wood, CG.tools, CG.scenes and CG.room3d. */
(function () {
  'use strict';
  const C = window.CG.color, E = window.CG.engine, S = window.CG.stain, WD = window.CG.wood, T = window.CG.tools, SC = window.CG.scenes;
  const R3 = () => window.CG.room3d || { supported: () => false };
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const fmt = n => Number(n).toLocaleString('en-US');
  const cap = s => String(s || '').replace(/^./, m => m.toUpperCase());

  // ---------------- saved on this device (the app works without it) ----------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cg:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cg:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const DEFAULT_SETTINGS = {
    brands: {}, storeBrand: '', storeOnly: false, resultCount: 6,
    inStoreSamples: true, showDiscontinued: false,
    askBulbs: true, askFixed: true, showWarnings: true, showLrv: true, showMatches: true, lightPreview: true,
    cal: { enabled: false, cct: 0, warmth: 0, brightness: 0, vividness: 0, ref: '' },
    theme: 'system', reduceMotion: false, lines: {}, collections: {}, audience: '', onboarded: false,
    jobs: { paint: true, stain: true }, stainBrands: {}, chain: '',
    questions: 'quick', view3d: false, bigText: false, kioskPin: null, kioskPhone: false, camTune: [],
  };
  function merge(base, over) {
    const out = clone(base);
    for (const k of Object.keys(over || {})) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && out[k] && typeof out[k] === 'object') out[k] = Object.assign(out[k], over[k]);
      else if (k in out) out[k] = over[k];
    }
    return out;
  }
  let settings = merge(DEFAULT_SETTINGS, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);
  const reduced = () => settings.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const jobOn = j => !settings.jobs || settings.jobs[j] !== false;
  const detailed = () => settings.questions === 'detailed';
  const isKiosk = () => settings.audience === 'kiosk';
  const home = () => settings.audience === 'home';

  // ---------------- what's on screen ----------------
  const state = {
    ready: false, view: 'home', screen: detectScreen(),
    flows: { paint: null, stain: null, buy: null }, // { a: answers, step }
    results: { paint: null, stain: null, buy: null },
    pick: { paint: '', stain: '' }, light: 'daylight', sceneFor: {}, query: '', lookupHex: '', ftype: {}, duel: null, layout: null, furniture: {}, parts: {},
    lastFlow: 'paint', depth: 0,
  };

  function detectScreen() {
    const mm = q => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
    const rec2020 = mm('(color-gamut: rec2020)'), p3 = mm('(color-gamut: p3)');
    return { p3: p3 || rec2020, gamut: rec2020 ? 'Rec. 2020 (very wide)' : p3 ? 'Display P3 (wide color)' : 'sRGB (standard)', hdr: mm('(dynamic-range: high)'), depth: (window.screen && screen.colorDepth) || 24, size: window.screen ? `${screen.width} × ${screen.height}` : 'Unknown' };
  }

  // ---------------- color display ----------------
  const LIGHT_BY_ID = Object.fromEntries(E.LIGHTS.map(l => [l.id, l]));
  function paint(hex, lightId) {
    const light = lightId && lightId !== 'none' ? LIGHT_BY_ID[lightId] : null;
    return C.displayCss(hex, { light, cal: settings.cal, p3: state.screen.p3 });
  }
  function refreshSwatches(scope) { $$('[data-hex]', scope).forEach(el => { el.style.backgroundColor = paint(el.dataset.hex, el.dataset.light || 'none'); }); }
  SC.configure({ paint, cal: () => settings.cal });
  const swStyle = (hex, light) => `data-hex="${hex}"${light ? ` data-light="${light}"` : ''} style="background-color:${paint(hex, light)}"`;

  // ---------------- brands ----------------
  const brandList = () => E.getIndex().brands;
  // A to Z, for the lists people read and pick from (settings, setup). brandList() keeps the data's own order.
  const azCmp = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
  const brandsAZ = () => brandList().slice().sort((a, b) => azCmp(a.name, b.name));
  const brandName = id => (E.getIndex().brandById[id] || {}).name || S.brandName(id);
  function brandsEnabled() {
    const out = {};
    for (const b of brandList()) out[b.id] = settings.brands[b.id] != null ? !!settings.brands[b.id] : b.group === 'us' || b.group === 'custom';
    return out;
  }
  function engineSettings() {
    return { resultCount: settings.resultCount, showDiscontinued: settings.showDiscontinued, brands: brandsEnabled(), collections: settings.collections, storeBrand: settings.storeBrand, storeOnly: settings.storeOnly && !!settings.storeBrand, inStoreSamples: settings.inStoreSamples };
  }
  const stainSettings = () => ({ resultCount: settings.resultCount, brands: brandsEnabled(), collections: settings.collections, storeBrand: settings.storeBrand, stainBrands: settings.stainBrands });
  const enabledCount = () => { const en = brandsEnabled(); return E.getIndex().colors.filter(c => en[c.brand] && (settings.showDiscontinued || !(c.flags & E.F.DISC))).length; };
  function findAny(id) { return E.findColor(id) || S.find(id) || null; }

  // ---------------- icons: a picture for every choice ----------------
  const P = {
    living: '<rect x="7" y="9" width="18" height="8" rx="2.5"/><rect x="3" y="14" width="5" height="9" rx="2"/><rect x="24" y="14" width="5" height="9" rx="2"/><path d="M8 19h16v4H8zM6 23v3M26 23v3"/>',
    bedroom: '<path d="M3 25V8M3 19h26v6M29 25v-8a3 3 0 00-3-3H14v5"/><rect x="6" y="13" width="6" height="4" rx="1.5"/>',
    kitchen: '<rect x="4" y="12" width="24" height="16" rx="2"/><path d="M4 17h24M9 22.5h3M20 22.5h3"/><path d="M10 9c0-2 2-2 2-4M16 9c0-2 2-2 2-4M22 9c0-2 2-2 2-4"/>',
    bathroom: '<path d="M3 16h26v3a6 6 0 01-6 6H9a6 6 0 01-6-6z"/><path d="M7 16V7a3 3 0 016 0"/><path d="M9 25l-1 3M23 25l1 3"/>',
    powder: '<rect x="9" y="3" width="14" height="10" rx="5"/><path d="M5 17h22v2a6 6 0 01-6 6H11a6 6 0 01-6-6z"/><path d="M16 25v4M12 29h8"/>',
    dining: '<ellipse cx="16" cy="12" rx="12" ry="3"/><path d="M8 14.5V27M24 14.5V27M16 15v12"/><path d="M14 6.5c0-1.5 2-2 2-4 0 2 2 2.5 2 4a2 2 0 01-4 0z"/>',
    office: '<rect x="6" y="7" width="20" height="13" rx="1.5"/><path d="M3 24h26l-2-4H5z"/>',
    kids: '<rect x="4" y="16" width="11" height="11" rx="1.5"/><rect x="17" y="16" width="11" height="11" rx="1.5"/><rect x="10.5" y="5" width="11" height="11" rx="1.5"/><path d="M8 21.5h3M22.5 19v5M14 10.5h4"/>',
    nursery: '<path d="M4 8v20M28 8v20M4 12h24M4 24h24M9 12v12M14 12v12M18 12v12M23 12v12"/>',
    entry: '<path d="M6 28V4h14v24M3 28h26M20 4l6 3v19l-6 2"/><circle cx="17" cy="16" r="1.2" fill="currentColor"/>',
    stairs: '<path d="M3 28h7v-6h6v-6h6v-6h7"/><path d="M3 28v-3M29 10V4"/>',
    laundry: '<rect x="5" y="3" width="22" height="26" rx="2.5"/><circle cx="16" cy="18" r="6.5"/><path d="M5 9h22M9 6h2"/>',
    closet: '<path d="M13 7a3 3 0 116 0c0 2-3 2.5-3 4.5"/><path d="M16 11.5L4 21.5h24z"/>',
    sunroom: '<circle cx="23" cy="8" r="3.5"/><path d="M23 1.5V2.5M29.5 8h-1M27.6 3.4l-.8.8M18.4 3.4l.8.8"/><path d="M3 28V14h16v14M3 21h16M11 14v14"/>',
    basement: '<path d="M3 9h26M3 9v19h26V9"/><path d="M7 9v4h5v4h5v4h5v4"/>',
    attic: '<path d="M3 17L16 5l13 12"/><path d="M6 14.5V28h20V14.5"/><path d="M13 16h6v6h-6zM16 16v6M13 19h6"/>',
    media: '<rect x="3" y="6" width="26" height="16" rx="2"/><path d="M11 27h10M16 22v5"/>',
    garage: '<path d="M5 20l2.5-7a2 2 0 011.9-1.4h13.2a2 2 0 011.9 1.4L27 20"/><rect x="3" y="20" width="26" height="6" rx="2"/><circle cx="9" cy="23" r="1.3" fill="currentColor"/><circle cx="23" cy="23" r="1.3" fill="currentColor"/><path d="M6 26v2.5M26 26v2.5"/>',
    accent: '<rect x="3" y="5" width="26" height="22" rx="1"/><rect x="11" y="5" width="10" height="22" fill="currentColor" opacity=".3"/>',
    ceiling: '<path d="M2 4h28M16 4v7"/><path d="M9 18a7 7 0 0114 0z"/><path d="M13 22l-1 3M19 22l1 3M16 22v4"/>',
    trim: '<path d="M4 3v25h25"/><path d="M4 21h25M4 24h25"/><path d="M12 3v18M16 3v18"/>',
    doors: '<rect x="9" y="3" width="14" height="25" rx="1"/><rect x="12" y="6" width="8" height="8" rx=".5"/><rect x="12" y="17" width="8" height="8" rx=".5"/><path d="M5 28h22"/>',
    wainscot: '<path d="M3 4h26v24H3z"/><path d="M3 15h26"/><path d="M7 15v13M11 15v13M15 15v13M19 15v13M23 15v13M27 15v13"/>',
    fireplace: '<path d="M3 8h26M5 8v20M27 8v20M3 28h26"/><path d="M10 28V18a6 6 0 0112 0v10"/><path d="M16 26c-2 0-3-1.5-2-3.5.5 1 1.3 1 1.3-.5 0-1.5 1.7-2.5 1.7-2.5s2 2 2 4c0 1.5-1 2.5-3 2.5z"/>',
    cabinets: '<rect x="3" y="4" width="26" height="24" rx="1.5"/><path d="M16 4v24M3 13h26"/><path d="M13 18v4M19 18v4M10 8.5h3M19 8.5h3"/>',
    builtins: '<rect x="5" y="3" width="22" height="26" rx="1"/><path d="M5 11h22M5 19h22"/><path d="M8 11V6M10.5 11V6.5M13 11V5.5M18 19v-5M20.5 19v-6l2.5 1v5M9 27v-5M12 27v-5"/>',
    furniture: '<rect x="5" y="5" width="22" height="20" rx="1.5"/><path d="M5 11.5h22M5 18h22M14 8.2h4M14 14.8h4M14 21.4h4M7 25v3M25 25v3"/>',
    floor_paint: '<path d="M2 27l7-6h21l-7 6z"/><rect x="11" y="3" width="15" height="6" rx="2"/><path d="M26 6h3v6H18v5"/>',
    ext_body: '<path d="M3 15L16 4l13 11"/><path d="M6 12.5V28h20V12.5"/><path d="M13 28v-7h6v7"/><path d="M8.5 16h4v4h-4zM19.5 16h4v4h-4z"/>',
    ext_trim: '<path d="M3 15L16 4l13 11"/><path d="M6 12.5V28h20V12.5"/><rect x="11" y="14" width="10" height="9"/><path d="M9 25h14"/>',
    front_door: '<path d="M3 28h26"/><rect x="9" y="5" width="14" height="23" rx="1"/><path d="M7 5h18"/><circle cx="19.5" cy="17" r="1.3" fill="currentColor"/><path d="M12 9h8v5h-8z"/>',
    shutters: '<rect x="11" y="6" width="10" height="20"/><path d="M16 6v20M11 16h10"/><rect x="4" y="6" width="5" height="20"/><rect x="23" y="6" width="5" height="20"/><path d="M5 10h3M5 13h3M5 16h3M5 19h3M5 22h3M24 10h3M24 13h3M24 16h3M24 19h3M24 22h3"/>',
    garage_door: '<path d="M2 12L16 4l14 8"/><path d="M5 10.5V28M27 10.5V28"/><rect x="8" y="14" width="16" height="14"/><path d="M8 17.5h16M8 21h16M8 24.5h16"/>',
    porch_floor: '<path d="M3 13h26M5 13v15M27 13v15"/><path d="M3 9L16 3l13 6"/><path d="M9 28v-3h14v3M11 25v-3h10v3"/>',
    shed: '<path d="M4 28V14l4-7h16l4 7v14z"/><path d="M4 14h24"/><rect x="11" y="18" width="10" height="10"/><path d="M11 18l10 10M21 18L11 28"/>',
    planks: '<path d="M3 6h26v20H3z"/><path d="M3 12.5h26M3 19h26M11 6v6.5M20 12.5V19M8 19v7M24 6v6.5M17 19v7"/>',
    table: '<path d="M2 11h28v3H2z"/><path d="M5 14v14M27 14v14M9 14v6h14v-6"/>',
    chair: '<path d="M9 28l3-10h12l3 10M11 18V6a1 1 0 011-1h12a1 1 0 011 1v12M6 18h24"/>',
    paneling: '<path d="M3 4h26v24H3z"/><path d="M8.2 4v24M13.4 4v24M18.6 4v24M23.8 4v24"/>',
    deck: '<path d="M2 20h28M4 20v8M28 20v8M2 24h28"/><path d="M4 20V10M28 20V10M4 12h24M9 12v8M14 12v8M19 12v8M24 12v8"/>',
    fence: '<path d="M5 28V8l2.5-3L10 8v20M14 28V8l2.5-3L19 8v20M23 28V8l2.5-3L28 8v20M3 13h27M3 22h27"/>',
    pergola: '<path d="M3 8h26M3 12h26M6 8v20M26 8v20M2 28h28"/><path d="M8 4v8M13 4v8M18 4v8M23 4v8"/>',
    log: '<circle cx="9" cy="23" r="5"/><circle cx="23" cy="23" r="5"/><circle cx="16" cy="11" r="5"/><circle cx="9" cy="23" r="1.6"/><circle cx="23" cy="23" r="1.6"/><circle cx="16" cy="11" r="1.6"/>',
    playset: '<path d="M3 28L9 4h14l6 24M9 4h14"/><path d="M13 4v15M19 4v15M12 19h8"/>',
    dock: '<path d="M2 16h28M5 16v8M27 16v8M16 16v8M3 12h26"/><path d="M2 27c3 0 3-2 6-2s3 2 6 2 3-2 6-2 3 2 6 2 3-2 4-2"/>',
    tree: '<path d="M16 29v-8"/><path d="M16 21c-6 0-9-3-9-7a5 5 0 014-5 5 5 0 0110 0 5 5 0 014 5c0 4-3 7-9 7z"/>',
    roller: '<rect x="4" y="4" width="18" height="7" rx="2"/><path d="M22 7.5h4v7H15v4"/><rect x="13" y="18.5" width="4" height="10" rx="1.5"/>',
    drywall: '<rect x="5" y="3" width="22" height="26" rx="1"/><path d="M5 16h22"/><circle cx="9" cy="7" r="1" fill="currentColor"/><circle cx="23" cy="7" r="1" fill="currentColor"/><circle cx="9" cy="25" r="1" fill="currentColor"/><circle cx="23" cy="25" r="1" fill="currentColor"/>',
    plaster: '<path d="M4 19h18l4 6H8z"/><path d="M14 19v-6a3 3 0 013-3h6"/>',
    grain: '<rect x="3" y="7" width="26" height="18" rx="2"/><path d="M3 13c6-3 10 3 16 0s8-2 10-1M3 19c5-2 9 2 14 0s9-3 12-1"/><ellipse cx="20" cy="16" rx="3" ry="1.5"/>',
    stained: '<rect x="3" y="12" width="26" height="15" rx="2"/><path d="M3 18c6-3 10 3 16 0s8-2 10-1M3 23c5-2 9 2 14 0s9-3 12-1"/><path d="M16 3s-3.5 4-3.5 6a3.5 3.5 0 007 0c0-2-3.5-6-3.5-6z"/>',
    laminate: '<path d="M4 12l12-6 12 6-12 6z"/><path d="M4 17l12 6 12-6M4 22l12 6 12-6"/>',
    mdf: '<path d="M3 11l8-5h18l-8 5z"/><path d="M3 11v14h18V11M21 25l8-5V6"/>',
    metal: '<rect x="4" y="6" width="24" height="20" rx="1.5"/><circle cx="8" cy="10" r="1" fill="currentColor"/><circle cx="24" cy="10" r="1" fill="currentColor"/><circle cx="8" cy="22" r="1" fill="currentColor"/><circle cx="24" cy="22" r="1" fill="currentColor"/><path d="M12 13l8 6"/>',
    brick: '<path d="M3 6h26v20H3z"/><path d="M3 12.7h26M3 19.3h26M11 6v6.7M21 6v6.7M7 12.7v6.6M16 12.7v6.6M25 12.7v6.6M11 19.3V26M21 19.3V26"/>',
    siding: '<path d="M3 5h26v22H3z"/><path d="M3 9.5h26M3 14h26M3 18.5h26M3 23h26"/>',
    smooth: '<path d="M3 16h26"/><path d="M3 22h26" opacity=".35"/>',
    light: '<path d="M3 16c3-2 4 2 7 0s4 2 7 0 4 2 7 0 4 2 5 0"/>',
    rough: '<path d="M3 17l3-5 3 7 3-8 3 9 3-6 3 7 3-9 3 6 2-3"/>',
    stains: '<path d="M16 4s-7 8-7 13a7 7 0 0014 0c0-5-7-13-7-13z"/><path d="M13 18a3 3 0 003 3"/>',
    glossy: '<path d="M16 3l2.5 8.5L27 14l-8.5 2.5L16 25l-2.5-8.5L5 14l8.5-2.5z"/>',
    oil: '<path d="M5 14h14l4-4h4l-2 3-4 4v9H5z"/><path d="M9 14v-3h6v3"/>',
    knots: '<rect x="3" y="6" width="26" height="20" rx="2"/><ellipse cx="16" cy="16" rx="5" ry="3.5"/><ellipse cx="16" cy="16" rx="1.8" ry="1"/><path d="M3 11c5 0 7 1.5 8 3M3 21c5 0 7-1.5 8-3M29 11c-5 0-7 1.5-8 3M29 21c-5 0-7-1.5-8-3"/>',
    mildew: '<circle cx="10" cy="12" r="3"/><circle cx="20" cy="9" r="2"/><circle cx="21" cy="20" r="4"/><circle cx="10" cy="22" r="1.6"/><circle cx="26" cy="13" r="1.3"/>',
    flaws: '<rect x="3" y="5" width="26" height="22" rx="1.5"/><path d="M12 5l3 6-4 5 5 4-2 7"/>',
    ok: '<circle cx="16" cy="16" r="12"/><path d="M10.5 16.5l3.8 3.8 7.4-8"/>',
    paw: '<circle cx="9" cy="12" r="2.5"/><circle cx="14" cy="7" r="2.5"/><circle cx="20" cy="7" r="2.5"/><circle cx="25" cy="12" r="2.5"/><path d="M17 15c-4 0-8 6-8 9 0 2 2 3 4 3 1.5 0 2.5-1 4-1s2.5 1 4 1c2 0 4-1 4-3 0-3-4-9-8-9z"/>',
    person: '<circle cx="16" cy="9" r="4.5"/><path d="M7 28c0-5 4-9 9-9s9 4 9 9"/>',
    tag: '<path d="M4 16V5h11l13 13-11 11z"/><circle cx="10" cy="10" r="2"/>',
    scale: '<path d="M16 4v24M10 28h12M5 8h22M5 8l-3 8a3 3 0 006 0zM27 8l-3 8a3 3 0 006 0z"/>',
    star: '<path d="M16 3l3.9 8.1 8.9 1.2-6.5 6.2 1.6 8.8L16 23l-7.9 4.3 1.6-8.8-6.5-6.2 8.9-1.2z"/>',
    cloud: '<path d="M9 24a6 6 0 010-12 8 8 0 0115.5 2A5 5 0 0124 24z"/>',
    partsun: '<circle cx="12" cy="11" r="5"/><path d="M12 2v2M3 11h2M5.6 4.6L7 6M18.4 4.6L17 6"/><path d="M13 27a5 5 0 010-10 7 7 0 0113.5 2A4 4 0 0126 27z"/>',
    sun: '<circle cx="16" cy="16" r="6"/><path d="M16 2v4M16 26v4M2 16h4M26 16h4M6 6l2.8 2.8M23.2 23.2L26 26M6 26l2.8-2.8M23.2 8.8L26 6"/>',
    bulb: '<path d="M11 21a8 8 0 1110 0v3H11z"/><path d="M12 27h8M13 30h6"/>',
    sizeS: '<rect x="11" y="11" width="10" height="10" rx="1"/>',
    sizeM: '<rect x="7" y="7" width="18" height="18" rx="1.5"/>',
    sizeL: '<rect x="3" y="3" width="26" height="26" rx="2"/>',
    unsure: '<circle cx="16" cy="16" r="12"/><path d="M12.5 12.5a3.5 3.5 0 117 0c0 2.5-3.5 3-3.5 5.5"/><circle cx="16" cy="22.5" r="1.2" fill="currentColor"/>',
    weathered: '<rect x="3" y="6" width="26" height="20" rx="2"/><path d="M3 12h9l3 2h14M3 20h6l4-2h16"/>',
    solid: '<rect x="4" y="4" width="24" height="24" rx="3" fill="currentColor" opacity=".35"/><rect x="4" y="4" width="24" height="24" rx="3"/>',
    room: '<path d="M3 26L9 21V6l-6-3zM29 26l-6-5V6l6-3zM9 21h14M9 6h14"/>',
    can: '<path d="M7 9h18v18a2 2 0 01-2 2H9a2 2 0 01-2-2z"/><ellipse cx="16" cy="9" rx="9" ry="3"/><path d="M10 6c0-3 12-3 12 0"/>',
    brush: '<path d="M13 3h6v10h-6z"/><path d="M11 13h10v4l-2 12h-6l-2-12z"/>',
    search: '<circle cx="14" cy="14" r="8.5"/><path d="M20.5 20.5L28 28"/>',
    swatch: '<rect x="5" y="3" width="10" height="26" rx="2"/><path d="M15 9l7-4 5 8.7-12 7"/><circle cx="10" cy="24" r="1.5" fill="currentColor"/>',
    list: '<rect x="6" y="4" width="20" height="25" rx="3"/><path d="M11 11h10M11 16h10M11 21h6"/>',
    print: '<path d="M9 11V4h14v7M9 23H5a2 2 0 01-2-2v-8a2 2 0 012-2h22a2 2 0 012 2v8a2 2 0 01-2 2h-4M9 18h14v10H9z"/>',
    tape: '<circle cx="14" cy="16" r="10"/><circle cx="14" cy="16" r="4"/><path d="M24 16h5v6H14"/>',
    basket: '<path d="M4.5 13h23"/><path d="M6.5 13l2.3 11.3A2.2 2.2 0 0011 26h10a2.2 2.2 0 002.2-1.7L25.5 13"/><path d="M11.5 13l4.5-7 4.5 7"/><path d="M12.5 17.5v4.5M16 17.5v4.5M19.5 17.5v4.5"/>',
    sparkle: '<path d="M14 4l2 7 7 2-7 2-2 7-2-7-7-2 7-2zM25 18l1 3.5 3.5 1-3.5 1-1 3.5-1-3.5-3.5-1 3.5-1z"/>',
    cube: '<path d="M16 3l12 6.5v13L16 29 4 22.5v-13z"/><path d="M4 9.5L16 16l12-6.5M16 16v13"/>',
    camera: '<path d="M4 11a2 2 0 012-2h4.5l2-3h7l2 3H26a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><circle cx="16" cy="17" r="5"/>',
    moon: '<path d="M26.5 19.5A11 11 0 0112.5 5.5a11 11 0 1014 14z"/>',
    flame: '<path d="M16 3c.8 5.5 8 8.2 8 15.5a8 8 0 01-16 0c0-4 1.8-6.4 3.3-8.2.5 3 2.6 4.6 2.6 4.6S12.6 8.6 16 3z"/>',
    snow: '<path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13"/><path d="M12.5 5.5L16 8l3.5-2.5M12.5 26.5L16 24l3.5 2.5M4.5 14l3.8-1.7-.4-4.3M27.5 18l-3.8 1.7.4 4.3M4.5 18l3.8 1.7-.4 4.3M27.5 14l-3.8-1.7.4-4.3"/>',
    drop: '<path d="M16 4s-8.5 9.3-8.5 15.5a8.5 8.5 0 0017 0C24.5 13.3 16 4 16 4z"/>',
    dropFull: '<path d="M16 4s-8.5 9.3-8.5 15.5a8.5 8.5 0 0017 0C24.5 13.3 16 4 16 4z" fill="currentColor"/>',
    undo: '<path d="M8 12.5h13a6.5 6.5 0 010 13h-6"/><path d="M13 7l-5.5 5.5L13 18"/>',
  };
  const ic = (name, size) => `<svg viewBox="0 0 32 32" width="${size || 32}" height="${size || 32}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.unsure}</svg>`;
  const ICON_OF = { living: 'living', bedroom: 'bedroom', kitchen: 'kitchen', bathroom: 'bathroom', powder: 'powder', dining: 'dining', office: 'office', kids: 'kids', nursery: 'nursery', entry: 'entry', stairs: 'stairs', laundry: 'laundry', closet: 'closet', sunroom: 'sunroom', basement: 'basement', attic: 'attic', media: 'media', garage: 'garage', accent: 'accent', ceiling: 'ceiling', trim: 'trim', doors: 'doors', wainscot: 'wainscot', fireplace: 'fireplace', cabinets: 'cabinets', builtins: 'builtins', furniture: 'furniture', floor_paint: 'floor_paint', ext_body: 'ext_body', ext_trim: 'ext_trim', front_door: 'front_door', shutters: 'shutters', garage_door: 'garage_door', porch_floor: 'porch_floor', shed: 'shed' };
  const STAIN_ICON = { floors: 'planks', stairs: 'stairs', cabinets: 'cabinets', furniture: 'furniture', tabletop: 'table', trim: 'trim', doors: 'doors', paneling: 'paneling', builtins: 'builtins', deck: 'deck', fence: 'fence', siding: 'siding', outdoor: 'chair', pergola: 'pergola', front_door: 'front_door', garage_door: 'garage_door', shutters: 'shutters', shed: 'shed', log: 'log', playset: 'playset', dock: 'dock' };
  const SURFACE_ICON = { painted: 'roller', drywall_new: 'drywall', plaster: 'plaster', paneling: 'paneling', bare_wood: 'grain', stained_wood: 'stained', laminate: 'laminate', mdf: 'mdf', metal: 'metal', masonry: 'brick', vinyl: 'siding', fiberglass: 'front_door' };
  const chev = (dir, size) => `<svg viewBox="0 0 20 20" width="${size || 20}" height="${size || 20}" aria-hidden="true"><path d="${dir === 'left' ? 'M12.5 4L6.5 10l6 6' : dir === 'down' ? 'M4 7.5l6 6 6-6' : 'M7.5 4l6 6-6 6'}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const xIcon = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const plusIcon = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  const mailIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/></svg>';
  const checkIcon = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const tick = `<span class="tick" aria-hidden="true">${checkIcon}</span>`;
  const backBtn = (label, attrs) => `<button type="button" class="back-btn" ${attrs || 'data-go="back"'}>${chev('left')}${esc(label || 'Back')}</button>`;

  // ================================================================
  // OUR OWN DROPDOWNS AND COLOR PICKER (they look and work the same on every device)
  // ================================================================
  const SELECTS = {};   // id -> { options: [[value, label, group?]], value, onChange, key }
  const COLORS = {};    // id -> { hex, onChange }
  function selectHtml(id, options, value, label, onChange) {
    const cur = options.find(o => String(o[0]) === String(value)) || options[0];
    SELECTS[id] = { options, value: cur[0], onChange, label };
    return `<button type="button" class="cg-select" id="${id}" data-select="${id}" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(label)}: ${esc(cur[1])}"><span class="k">${esc(label)}</span><span class="v">${esc(cur[1])}</span>${chev('down', 18)}</button>`;
  }
  function colorHtml(id, hex, label, onChange) {
    hex = String(hex || '8A6F55').replace('#', '').toUpperCase();
    COLORS[id] = { hex, onChange };
    return `<button type="button" class="cg-color" id="${id}" data-colorpick="${id}" aria-haspopup="dialog" aria-label="${esc(label)}: #${hex}"><span class="sw" style="background:#${hex}"></span><span class="mono">#${hex}</span>${chev('down', 18)}</button>`;
  }
  let pop = null, popAnchor = null;
  function closePop(focusBack) {
    if (!pop) return;
    const el = pop, anchor = popAnchor;
    pop = null; popAnchor = null;
    if (anchor) anchor.setAttribute('aria-expanded', 'false');
    if (reduced()) el.remove(); else { el.classList.add('out'); setTimeout(() => el.remove(), 150); }
    if (focusBack && anchor && document.contains(anchor)) anchor.focus({ preventScroll: true });
  }
  // A menu opens below its button, or above it when there's more room there, and is as tall as the room allows
  // (so every choice shows when it can, instead of a short list cut off at the bottom)
  function placePop(el, anchor) {
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const w = Math.min(Math.max(r.width, el.offsetWidth), vw - 24);
    const left = Math.min(Math.max(12, r.left), vw - w - 12);
    const below = vh - r.bottom - 18, above = r.top - 18;
    el.style.maxHeight = 'none';
    const natural = el.offsetHeight;
    const up = natural > below && above > below;
    el.style.maxHeight = Math.max(140, Math.min(natural, up ? above : below, 600)) + 'px';
    const h = el.offsetHeight;
    el.style.left = left + 'px';
    el.style.minWidth = Math.min(r.width, vw - 24) + 'px';
    el.style.top = (up ? Math.max(12, r.top - h - 6) : Math.min(vh - h - 12, r.bottom + 6)) + 'px';
    el.style.transformOrigin = up ? 'bottom left' : 'top left';
  }
  // where a menu goes: inside whatever is full screen right now (anything outside it isn't shown), or the page
  // (older Safari only has the webkit-named version of full screen)
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const popHost = () => fsElement() || document.body;
  function openSelect(anchor) {
    const id = anchor.dataset.select, cfg = SELECTS[id]; if (!cfg) return;
    if (pop && popAnchor === anchor) { closePop(true); return; }
    closePop();
    const el = document.createElement('div');
    el.className = 'cg-pop'; el.setAttribute('role', 'listbox'); el.setAttribute('aria-label', cfg.label || '');
    let lastGroup = '';
    el.innerHTML = cfg.options.map(([v, l, g]) => {
      const head = g && g !== lastGroup ? `<div class="cg-opt-group">${esc(g)}</div>` : ''; lastGroup = g || lastGroup;
      return `${head}<button type="button" role="option" class="cg-opt" data-value="${esc(v)}" aria-selected="${String(v) === String(cfg.value)}"><span>${esc(l)}</span><span class="check">${checkIcon}</span></button>`;
    }).join('');
    popHost().appendChild(el);
    pop = el; popAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    placePop(el, anchor);
    const sel = $('[aria-selected="true"]', el) || $('.cg-opt', el);
    sel.focus({ preventScroll: true }); sel.scrollIntoView({ block: 'nearest' });
    el.addEventListener('click', e => { const o = e.target.closest('.cg-opt'); if (o) chooseOption(id, o.dataset.value); });
    el.addEventListener('keydown', e => {
      const opts = $$('.cg-opt', el); const i = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (opts[i + 1] || opts[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (opts[i - 1] || opts[opts.length - 1]).focus(); }
      else if (e.key === 'Tab') closePop();
    });
  }
  function chooseOption(id, value) {
    const cfg = SELECTS[id]; const opt = cfg.options.find(o => String(o[0]) === String(value)); if (!opt) return;
    cfg.value = opt[0];
    const btn = document.getElementById(id);
    if (btn) { $('.v', btn).textContent = opt[1]; btn.setAttribute('aria-label', `${cfg.label}: ${opt[1]}`); }
    closePop(true);
    if (cfg.onChange) cfg.onChange(opt[0]);
  }
  const QUICK = ['F2F1EC', 'D9CEBB', 'C8A57A', 'B5763C', '8C4630', '4A3326', '9A9894', '8E9091', '2F3E5C', '4F6B4C', 'D6A79D', '2B2B2C'];
  function hexToHsv(hex) {
    const [r, g, b] = C.hexToRgb(hex).map(v => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, mx ? d / mx : 0, mx];
  }
  function hsvToHex(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return C.rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
  }
  function openColor(anchor) {
    const id = anchor.dataset.colorpick, cfg = COLORS[id]; if (!cfg) return;
    if (pop && popAnchor === anchor) { closePop(true); return; }
    closePop();
    let [h, s, v] = hexToHsv(cfg.hex);
    const el = document.createElement('div');
    el.className = 'cg-pop cg-picker'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Pick a color');
    el.innerHTML = `<div class="cp-sv" tabindex="0" aria-label="Shade: use the arrow keys"><span class="cp-sv-dot"></span></div>
      <div class="cp-hue" tabindex="0" aria-label="Hue: use the arrow keys"><span class="cp-hue-dot"></span></div>
      <div class="cp-row"><span class="cp-prev"></span><label class="cp-hex"><span>#</span><input type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex color"></label><button type="button" class="btn small primary cp-done">Done</button></div>
      <div class="cp-quick">${QUICK.map(q => `<button type="button" class="cp-q" data-q="${q}" style="background:#${q}" aria-label="#${q}"></button>`).join('')}</div>`;
    popHost().appendChild(el);
    pop = el; popAnchor = anchor; anchor.setAttribute('aria-expanded', 'true');
    const sv = $('.cp-sv', el), hue = $('.cp-hue', el), hexIn = $('.cp-hex input', el);
    const draw = fromInput => {
      const hex = hsvToHex(h, s, v);
      sv.style.backgroundColor = '#' + hsvToHex(h, 1, 1);
      $('.cp-sv-dot', el).style.left = (s * 100) + '%'; $('.cp-sv-dot', el).style.top = ((1 - v) * 100) + '%';
      $('.cp-hue-dot', el).style.left = (h / 360 * 100) + '%';
      $('.cp-prev', el).style.background = '#' + hex;
      if (!fromInput) hexIn.value = hex;
      cfg.hex = hex;
      const sw = $('.sw', anchor), tx = $('.mono', anchor);
      if (sw) sw.style.background = '#' + hex; if (tx) tx.textContent = '#' + hex;
      if (cfg.onChange) cfg.onChange(hex, false);
    };
    const drag = (node, fn) => node.addEventListener('pointerdown', e => {
      e.preventDefault(); node.setPointerCapture(e.pointerId); node.focus({ preventScroll: true });
      const move = ev => { const r = node.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))); draw(); };
      move(e);
      const up = () => { node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); };
      node.addEventListener('pointermove', move); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
    });
    drag(sv, (x, y) => { s = x; v = 1 - y; });
    drag(hue, x => { h = Math.min(359.9, x * 360); });
    sv.addEventListener('keydown', e => { const st = e.shiftKey ? 0.1 : 0.02; if (e.key === 'ArrowLeft') s = Math.max(0, s - st); else if (e.key === 'ArrowRight') s = Math.min(1, s + st); else if (e.key === 'ArrowUp') v = Math.min(1, v + st); else if (e.key === 'ArrowDown') v = Math.max(0, v - st); else return; e.preventDefault(); draw(); });
    hue.addEventListener('keydown', e => { const st = e.shiftKey ? 20 : 4; if (e.key === 'ArrowLeft') h = Math.max(0, h - st); else if (e.key === 'ArrowRight') h = Math.min(359.9, h + st); else return; e.preventDefault(); draw(); });
    hexIn.addEventListener('input', () => { const m = hexIn.value.replace('#', '').match(/^[0-9a-f]{6}$/i); if (m) { [h, s, v] = hexToHsv(m[0]); draw(true); } });
    el.addEventListener('click', e => {
      const q = e.target.closest('.cp-q'); if (q) { [h, s, v] = hexToHsv(q.dataset.q); draw(); return; }
      if (e.target.closest('.cp-done')) { if (cfg.onChange) cfg.onChange(cfg.hex, true); closePop(true); }
    });
    draw(); placePop(el, anchor); sv.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-select]'); if (s) { openSelect(s); return; }
    const c = e.target.closest('[data-colorpick]'); if (c) { openColor(c); return; }
    if (pop && !e.target.closest('.cg-pop')) closePop();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop) { e.stopImmediatePropagation(); closePop(true); } }, true);
  window.addEventListener('resize', () => closePop());
  document.addEventListener('scroll', e => { if (pop && !(e.target instanceof Element && e.target.closest('.cg-pop'))) closePop(); }, true);

  // ================================================================
  // MOVING BETWEEN SCREENS
  // Every screen has its own address (#/paint/2, #/color/sw:7029 ...), so the phone's back button and the
  // browser's back arrow both work, and each step of the questions is its own screen.
  // ================================================================
  const view = () => $('#view');
  function parseHash() {
    const h = decodeURIComponent((location.hash || '').replace(/^#\/?/, ''));
    const [a, b] = [h.split('/')[0], h.split('/').slice(1).join('/')];
    if (['paint', 'stain', 'buy'].includes(a)) return b === 'results' ? { view: 'results', kind: a } : { view: 'flow', kind: a, step: Math.max(0, parseInt(b, 10) || 0) };
    if (a === 'color' && b) return { view: 'color', id: b };
    if (a === 'p' && b) return { view: 'shared', data: b };
    if (a === 't' && b) return { view: 'ticket', data: b };
    if (a === 'fix') return { view: 'fix', id: b || '' };
    if (a === 'kiosk' && b) return { view: 'kiosk', data: b };
    if (['lookup', 'list', 'settings', 'together'].includes(a)) return { view: a };
    return { view: 'home' };
  }
  const pathOf = r => r.view === 'home' ? '' : r.view === 'flow' ? `${r.kind}/${r.step}` : r.view === 'results' ? `${r.kind}/results` : r.view === 'color' ? `color/${r.id}` : r.view === 'shared' ? `p/${r.data}` : r.view === 'ticket' ? `t/${r.data}` : r.view === 'fix' ? (r.id ? `fix/${r.id}` : 'fix') : r.view;
  let navDir = 0;
  function go(path, opts) {
    opts = opts || {};
    const hash = '#/' + path.replace(/^#?\/?/, '');
    const d = (history.state && history.state.d) || 0;
    if (hash === location.hash && !opts.force) { render(); return; }
    navDir = opts.dir != null ? opts.dir : 1;
    if (opts.replace) history.replaceState({ d }, '', hash); else history.pushState({ d: d + 1 }, '', hash);
    render(opts.keepScroll ? null : 0);
  }
  // Back: one step back in this visit, or up to the screen above when there's nothing to go back to
  function goBack() {
    if (history.state && history.state.d > 0) { navDir = -1; history.back(); return; }
    const r = parseHash();
    let up = '';
    if (r.view === 'flow' && r.step > 0) up = `${r.kind}/${r.step - 1}`;
    else if (r.view === 'results') up = `${r.kind}/${Math.max(0, flowSteps(r.kind).length - 1)}`;
    else if (r.view === 'color') up = state.results[state.lastFlow] ? `${state.lastFlow}/results` : '';
    go(up, { replace: true, dir: -1 });
  }
  // back (or forward) always lands at the top of the page, like opening it fresh; the browser isn't left to
  // put back the old scroll spot on its own
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* older browsers */ }
  window.addEventListener('popstate', () => { const dir = navDir || -1; navDir = dir; render(0); });

  let current = null;
  function render(scrollTo) {
    if (!state.ready) return;
    closePop();
    teardownScenes();
    const r = parseHash();
    // the kiosk QR code: set this phone up, then start at home
    if (r.view === 'kiosk') { openKioskLink(r.data); history.replaceState({ d: 0 }, '', '#/'); render(0); return; }
    current = r;
    state.view = r.view;
    const v = view();
    v.hidden = false;
    // the top bar shows where you are, with a Home button everywhere but home
    $('#settingsBtn').setAttribute('aria-current', r.view === 'settings' ? 'page' : 'false');
    $('#projBtn').setAttribute('aria-current', r.view === 'list' ? 'page' : 'false');
    $('#homeNav').hidden = r.view === 'home';
    showBar(false);
    if (r.view === 'home') renderHome();
    else if (r.view === 'flow') renderFlow(r.kind, r.step);
    else if (r.view === 'results') renderResults(r.kind);
    else if (r.view === 'color') renderColor(r.id);
    else if (r.view === 'lookup') renderLookup();
    else if (r.view === 'list') renderList();
    else if (r.view === 'together') renderTogether();
    else if (r.view === 'shared') renderShared(r.data);
    else if (r.view === 'ticket') renderTicket(r.data);
    else if (r.view === 'fix') renderFix(r.id);
    else if (r.view === 'settings') {
      // a locked kiosk keeps Settings behind the PIN
      if (isKiosk() && !state.unlocked) { go('', { replace: true }); openUnlock(); return; }
      renderSettings();
    }
    if (r.view !== 'settings') state.unlocked = false;
    // replay the page entrance
    if (r.view !== 'flow' && !reduced()) { v.style.animation = 'none'; void v.offsetWidth; v.style.animation = ''; }
    if (scrollTo != null) window.scrollTo(0, scrollTo);
    navDir = 0;
    if (isKiosk()) kioskArm();
  }

  // ================================================================
  // HOME: four big choices
  // ================================================================
  const TIPS = [
    ['Test before you buy', 'Paint a big sample on two walls and look at it in the morning and at night.'],
    ['Flat hides, satin cleans', 'Lower sheens hide bumps and patches. Higher sheens wipe clean.'],
    ['Buy it all at once', 'Get every can for a room at the same time so the color matches exactly.'],
    ['Prime the big changes', 'Going dark to light, or over a stain, a primer saves a coat of paint.'],
    ['Cut in, then roll', 'Brush the edges first, then roll the wall while the edges are still wet.'],
    ['Box your paint', 'Pour all your cans into one bucket and mix so every wall matches.'],
    ['North rooms run cool', 'Rooms with north light make colors look cooler. Warmer colors balance it.'],
    ['Stir, don’t shake', 'Stir paint for a full minute, scraping the bottom of the can.'],
    ['Feel the finish', 'Cabinets and trim need enamel. It dries hard and wipes clean.'],
    ['Stain on a scrap first', 'The same stain looks different on oak, pine and maple. Test it on a board.'],
    ['Light changes color', 'Warm bulbs make colors cozier. Daylight bulbs make them crisper.'],
    ['Two thin coats', 'Two thin coats look better and last longer than one thick one.'],
  ];
  // ================================================================
  // FIX A PROBLEM: the paint problems people bring to the desk (the words are in js/fixes.js)
  // ================================================================
  const FX = window.CG.fixes;
  const fixIc = (name, size) => `<svg viewBox="0 0 32 32" width="${size || 32}" height="${size || 32}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FX.ICONS[name] || FX.ICONS.peel}</svg>`;
  const FIX_WHERE = [['', 'All'], ['in', 'Inside'], ['out', 'Outside']];
  const fixItem = p => ({ kind: 'fix', ref: 'fix:' + p.id, area: 'Fix', brand: '', name: p.name, code: '', hex: '', lrv: '', finish: '', product: '', primer: '', loc: '', amount: '', tools: p.buy.join(', ') });
  function renderFix(id) {
    const p = id ? FX.find(id) : null;
    if (!p) {
      const w = state.fixWhere || '', list = FX.LIST.filter(x => !w || x.where === w || x.where === 'both');
      view().innerHTML = `<div class="page">
        <div class="page-head"><p class="eyebrow">Fix a Problem</p><h1>What’s going on with the paint?</h1><p>Tap what you see: why it happens, how to fix it, and what to buy.</p></div>
        <div class="chipset fix-where" role="group" aria-label="Inside or outside">${FIX_WHERE.map(([k, l]) => `<button type="button" class="chip plain" data-fix-where="${k}" aria-pressed="${w === k}">${l}</button>`).join('')}</div>
        <div class="fix-grid">${list.map(x => `<button type="button" class="fix-card" data-go="fix/${x.id}"><span class="fix-ic">${fixIc(x.icon, 30)}</span><span class="fix-txt"><b>${esc(x.name)}</b><span>${esc(x.see)}</span></span></button>`).join('')}</div>
        <p class="fix-note">${esc(FX.LEAD)}</p></div>`;
      return;
    }
    const others = FX.LIST.filter(x => x.id !== p.id && (x.where === p.where || x.where === 'both' || p.where === 'both')).slice(0, 4);
    const on = session.items.some(x => x.ref === 'fix:' + p.id);
    view().innerHTML = `<div class="page narrow fix-page">${backBtn()}
      <div class="page-head"><p class="eyebrow">Fix a Problem</p><h1 class="fix-h"><span class="fix-ic big">${fixIc(p.icon, 36)}</span>${esc(p.name)}</h1><p class="fix-see">${esc(p.see)}</p></div>
      ${p.lead ? `<p class="fix-warn"><b>Old house?</b> ${esc(FX.LEAD)}</p>` : ''}${p.safe ? `<p class="fix-warn"><b>Be safe.</b> ${esc(FX.SAFE)}</p>` : ''}
      ${p.test ? `<section class="fix-sec"><h2>Quick Test</h2><p>${esc(p.test)}</p></section>` : ''}
      <section class="fix-sec"><h2>Why It Happens</h2><ul class="fix-why">${p.why.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
      <section class="fix-sec"><h2>How to Fix It</h2><ol class="fix-steps">${p.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>
      <section class="fix-sec"><h2>What to Buy</h2><ul class="fix-buy">${p.buy.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
      ${p.tip ? `<p class="fix-tip"><b>Tip</b> ${esc(p.tip)}</p>` : ''}
      <div class="actions stack"><button type="button" class="btn big primary${on ? ' done' : ''}" data-add="fix:${esc(p.id)}">${on ? checkIcon + ' In Project' : plusIcon + ' Add to Project'}</button><button type="button" class="btn big" data-fix-print="${esc(p.id)}">${ic('print', 22)}Print</button></div>
      ${others.length ? `<section class="section"><h2>Other Problems</h2><div class="fix-grid">${others.map(x => `<button type="button" class="fix-card" data-go="fix/${x.id}"><span class="fix-ic">${fixIc(x.icon, 30)}</span><span class="fix-txt"><b>${esc(x.name)}</b><span>${esc(x.see)}</span></span></button>`).join('')}</div><div class="actions"><button type="button" class="btn" data-go="fix">See Every Problem</button></div></section>` : ''}
    </div>`;
  }
  // one problem on one page: black and white, the steps numbered and the shopping list with boxes to check
  function printFix(p) {
    printHtml(`<div class="pr-sheet pr-fix"><div class="pr-head"><div><div class="pr-title">${esc(p.name)}</div><div class="pr-sub">${esc(p.see)}</div></div><div class="pr-meta">${[storeName(), new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div></div>
      ${p.lead ? `<p class="pr-notes"><b>Old house?</b> ${esc(FX.LEAD)}</p>` : ''}${p.safe ? `<p class="pr-notes"><b>Be safe.</b> ${esc(FX.SAFE)}</p>` : ''}
      ${p.test ? `<h3>Quick Test</h3><p>${esc(p.test)}</p>` : ''}<h3>Why It Happens</h3><ul>${p.why.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <h3>How to Fix It</h3><ol>${p.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      <h3>What to Buy</h3><ul class="pr-check">${p.buy.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${p.tip ? `<p><b>Tip</b> ${esc(p.tip)}</p>` : ''}
      <div class="pr-foot"><span>Ask at the paint desk if you’re not sure.</span><span>ColorGenius</span></div></div>`, false);
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !state.ready) return;
    if (t.dataset.fixWhere != null) { state.fixWhere = t.dataset.fixWhere; renderFix(''); }
    if (t.dataset.fixPrint) { const p = FX.find(t.dataset.fixPrint); if (p) printFix(p); }
  });
  function renderHome() {
    const tiles = [
      jobOn('paint') && ['paint', 'Paint Colors', 'Find the right color for a room, cabinets, trim or the outside of a house.'],
      jobOn('stain') && ['stain', 'Stain Colors', 'See wood stains on real wood for floors, furniture, decks and fences.'],
      jobOn('paint') && ['buy', 'Which Paint to Buy', 'Answer a few questions to get the paint, finish, primer, roller and brush, and how much.'],
      ['lookup', 'Look Up a Color', 'Have a color name, code or number? Find it and match it in any brand.'],
    ].filter(Boolean);
    const list = session.items;
    const tips = TIPS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    view().innerHTML = `<div class="home">
      <div class="home-head"><h1>${isKiosk() ? 'Welcome! What are you working on?' : 'What would you like to do?'}</h1><p>Tap one to start. Every step has a Back button, so you can always change your mind.</p></div>
      <div class="tiles">${tiles.map(([k, t, s]) => `<button type="button" class="tile" data-start="${k}">
        <span class="tile-art"><img src="img/tile-${k}.jpg" alt="" width="1080" height="510" decoding="async"></span>
        <span class="tile-text"><span class="tile-title">${esc(t)}${chev('right', 22)}</span><span class="tile-sub">${esc(s)}</span></span></button>`).join('')}</div>
      <button type="button" class="home-fix" data-go="fix"><span class="hf-ic">${fixIc('peel', 34)}</span><span class="hf-txt"><b>Fix a Problem</b><span>Peeling, stains bleeding through, mildew, sticky paint, blotchy stain and more: why it happens, how to fix it and what to buy.</span></span>${chev('right', 22)}</button>
      <section class="section" aria-labelledby="projH">
        <div class="page-head"><h2 id="projH">Projects</h2><p>Save the colors, stains and shopping lists for one job in one place, then print it or email it.</p></div>
        <div class="proj-grid">
          ${list.length || (session.name || '').trim() ? `<div class="proj-card current"><span class="mini-sws">${list.slice(0, 5).map(x => `<i ${x.hex ? swStyle(x.hex) : ''}></i>`).join('') || `<i></i>`}</span><span class="proj-text"><span class="eyebrow">Open now</span><b>${esc(sessionTitle())}</b><span class="muted">${list.length} item${list.length === 1 ? '' : 's'}</span></span><button type="button" class="btn big primary" data-go="list">Open Project</button></div>` : ''}
          <button type="button" class="proj-new" data-project-new="1"><span class="plus" aria-hidden="true">${plusIcon}</span><b>Start a Project</b><span>Give it a name, then add colors to it as you go</span></button>
          ${isKiosk() ? '' : past.slice(0, 3).map(s => `<button type="button" class="proj-card" data-past-home="${esc(s.id)}"><span class="mini-sws">${s.items.slice(0, 5).map(x => `<i ${x.hex ? swStyle(x.hex) : ''}></i>`).join('')}</span><span class="proj-text"><b>${esc(titleOf(s))}</b><span class="muted">${s.items.length} item${s.items.length === 1 ? '' : 's'} · ${esc(new Date(s.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span></span>${chev('right')}</button>`).join('')}
        </div>
      </section>
      ${isKiosk() ? '' : `<section class="section" aria-labelledby="tipsH"><h2 id="tipsH">Paint Department Tips</h2><div class="home-tips">${tips.map(([t, s]) => `<div class="tipcard"><b>${esc(t)}</b><span>${esc(s)}</span></div>`).join('')}</div></section>`}
    </div>`;
  }
  // The home pictures are 3D product shots rendered ahead of time (img/tile-*.jpg, made with
  // CG.room3d.snapshot('tile-paint', 1080, 510) and friends), so they're there the moment the app opens.
  document.addEventListener('click', e => {
    const t = e.target.closest('button, a'); if (!t || !state.ready) return;
    if (t.dataset.start) {
      const k = t.dataset.start;
      if (k === 'lookup') { go('lookup'); return; }
      startFlow(k); return;
    }
    if (t.dataset.go) { e.preventDefault(); if (t.dataset.go === 'back') goBack(); else go(t.dataset.go === 'home' ? '' : t.dataset.go); }
  });
  $('#settingsBtn').addEventListener('click', () => { if (state.ready) go('settings'); });
  $('#projBtn').addEventListener('click', () => { if (state.ready) go('list'); });
  // Home (the top bar button or the logo) starts over: the answers, results and search are cleared, so it asks
  // first when there are any. Whatever is in the project stays.
  const houseIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h4.5v-5.5h3V20H18V9.5"/></svg>';
  const hasWork = () => Object.values(state.flows).some(f => f && f.a && f.a._picked && Object.keys(f.a._picked).length) || Object.values(state.results).some(Boolean) || !!state.query.trim();
  function clearWork() {
    state.flows = { paint: null, stain: null, buy: null }; state.results = { paint: null, stain: null, buy: null };
    state.query = ''; state.lookupHex = ''; state.duel = null; state.duelPick = ''; state.pick = { paint: '', stain: '' }; state.ftype = {}; state.layout = null; state.furniture = {}; state.parts = {};
  }
  function homeAsk() {
    if (!state.ready) return;
    if (state.view === 'home' || !hasWork()) { go(''); return; }
    const n = session.items.length;
    openModal('Go Back Home?', `<p style="font-size:1.1rem">This takes you back to the start and clears your answers, results and search.</p>
      <p style="font-size:1.1rem">${n ? `Everything saved in <b>${esc(sessionTitle())}</b> (${n} thing${n === 1 ? '' : 's'}) stays.` : 'Nothing is saved in a project yet. To keep a color, tap <b>Add to Project</b> first.'}</p>
      <p style="font-size:1.1rem">Do you want to continue?</p>
      <div class="modal-foot"><button type="button" class="btn big ghost" data-modal-close="1">Stay Here</button><span class="grow"></span><button type="button" class="btn big primary" data-home-confirm="1">${houseIcon}Go Home</button></div>`);
  }
  $('#modal').addEventListener('click', e => {
    if (!e.target.closest('[data-home-confirm]')) return;
    closeModal(); clearWork();
    go('', { replace: true }); window.scrollTo(0, 0);
  });
  $('#homeNav').addEventListener('click', homeAsk);
  $('#homeBtn').addEventListener('click', homeAsk);

  // ================================================================
  // QUESTIONS: one per screen
  // Three question sets share this: Paint Colors, Stain Colors and Which Paint to Buy. A question with one answer
  // moves on by itself when tapped; questions with several answers have a Next button. Every question that can
  // be left alone starts with a sensible answer already picked ("Any Style", "Not Sure"), so there is no Skip.
  // ================================================================
  const FLOW_INFO = {
    paint: { title: 'Paint Colors', last: 'Show My Colors' },
    stain: { title: 'Stain Colors', last: 'Show My Stains' },
    buy: { title: 'Which Paint to Buy', last: 'Show My Shopping List' },
  };
  const GROUPS = {
    room: { label: 'A Room', sub: 'The walls of a bedroom, kitchen, bathroom or any room', icon: 'room', q: 'Which room?', spaces: ['living', 'bedroom', 'kitchen', 'bathroom', 'powder', 'dining', 'office', 'kids', 'nursery', 'entry', 'stairs', 'laundry', 'closet', 'sunroom', 'basement', 'attic', 'media', 'garage', 'accent'] },
    wood: { label: 'Trim, Doors or a Ceiling', sub: 'Baseboards, doors, ceilings, paneling, a fireplace', icon: 'doors', q: 'Which part?', spaces: ['ceiling', 'trim', 'doors', 'wainscot', 'fireplace'] },
    cab: { label: 'Cabinets, Furniture or Floors', sub: 'Kitchen cabinets, shelves, a dresser, a concrete floor', icon: 'cabinets', q: 'Which one?', spaces: ['cabinets', 'builtins', 'furniture', 'floor_paint'] },
    out: { label: 'Outside the House', sub: 'Siding, trim, the front door, shutters, a shed', icon: 'ext_body', q: 'Which part of the outside?', spaces: ['ext_body', 'ext_trim', 'front_door', 'shutters', 'garage_door', 'porch_floor', 'shed'] },
  };
  const groupOf = space => Object.keys(GROUPS).find(g => GROUPS[g].spaces.includes(space)) || 'room';
  const SPACE_SUB = {
    living: 'Family room, den or great room', bedroom: 'Main or guest bedroom', kitchen: 'Walls around the cabinets', bathroom: 'Full bath with a shower or tub',
    powder: 'Half bath, no shower', dining: 'Formal or everyday dining', office: 'Home office or study', kids: 'Kids’ bedroom or playroom', nursery: 'A baby’s room',
    entry: 'Foyer, hallway or entry', stairs: 'Stairwell and landing', laundry: 'Laundry room or mudroom', closet: 'Walk-in closet or pantry', sunroom: 'Windows on several sides',
    basement: 'Finished basement or rec room', attic: 'Room under the roof', media: 'TV, theater or game room', garage: 'Garage or workshop walls',
    accent: 'Just one feature wall', ceiling: 'Any ceiling inside', trim: 'Baseboards, window and door trim', doors: 'Inside doors', cabinets: 'Kitchen or bathroom cabinets',
    builtins: 'Bookcases, shelves, window seats', wainscot: 'Beadboard or paneling on the lower wall', fireplace: 'Brick or stone around a fireplace', furniture: 'A dresser, table or chairs',
    floor_paint: 'A concrete, basement or old wood floor',
    ext_body: 'The main color of the house', ext_trim: 'Around windows, corners and the roof edge', front_door: 'The front door', shutters: 'Window shutters',
    garage_door: 'The garage door', porch_floor: 'Porch floor and steps', shed: 'A shed or barn',
  };
  const STYLE_SUB = {
    modern: 'Crisp, clean and simple', cozy: 'Soft, warm and welcoming', coastal: 'Airy whites and sea blues', farmhouse: 'Warm whites, greige and sage', traditional: 'Classic, rich and layered',
    scandi: 'Pale, calm and natural', moody: 'Deep, rich color', midcentury: 'Teal, mustard and olive', boho: 'Terracotta, clay and blush', industrial: 'Concrete grays and charcoal',
    japandi: 'Muted, earthy and quiet', mediterranean: 'Sun-washed earth and blue',
  };
  const FAMILY_SAMPLE = {
    white: ['F2F0E9', 'EDEAE0', 'E9EBE7'], 'warm-neutral': ['E3D9C9', 'CFC1AA', 'B5A48C'], 'cool-neutral': ['DADBD8', 'B9BBB8', '8E918F'],
    green: ['C9D3BE', '8FA588', '4E6650'], blue: ['C9D6E0', '7F9BB2', '2F4A66'], earthy: ['D9A783', 'B5653F', '7A4A33'],
    'pink-purple': ['EBCFCF', 'C79AA6', '6E4D6A'], dark: ['3A3D42', '2B3A36', '1F2329'], bold: ['D8443A', 'E3A02B', '1F6F8B'],
  };
  const WHITE_SAMPLE = { crisp: ['F4F5F3', 'EEF0EF', 'E6E9E9'], warm: ['F4EFE4', 'EFE7D6', 'E9DFCB'], tint: ['E4E7E0', 'E9E1D9', 'DDE3E6'], bold: ['2F4A66', '6E8F7A', 'B5653F'], match: ['D6CCBC', 'C2C4C3', '9DAEA9'], dark: ['2B2C2E', '2F3B4C', '3E3A35'] };
  const SIDING_BG = {
    vinyl: 'repeating-linear-gradient(180deg,#e6e3dc 0 8px,#b9b5ad 8px 9px)', wood: 'repeating-linear-gradient(180deg,#c9a37a 0 8px,#8f6d4a 8px 9px)',
    fiber: 'repeating-linear-gradient(180deg,#d9d3c7 0 9px,#a59d91 9px 10px)', shake: 'repeating-linear-gradient(180deg,transparent 0 10px,rgba(0,0,0,.28) 10px 11px),repeating-linear-gradient(90deg,#b38b5e 0 6px,#9e7850 6px 7px,#bb946b 7px 13px,#94704a 13px 14px)',
    board: 'repeating-linear-gradient(90deg,#d3ccc0 0 10px,#9f988c 10px 13px)', stucco: 'radial-gradient(rgba(0,0,0,.16) 1px,transparent 1.6px) 0 0/5px 5px,#e3d8c6', brick: 'repeating-linear-gradient(0deg,#a8553e 0 8px,#d9cfc4 8px 10px)',
  };
  const SIDING_SUB = { vinyl: 'Can’t go very dark', wood: 'Painted wood boards', fiber: 'Like HardiePlank', shake: 'Shingles or cedar shakes', board: 'Tall boards with strips', stucco: 'Smooth or textured', brick: 'Brick, block or stone' };
  const LIGHT_NOTE = {
    north: 'North: cool, even light all day.', south: 'South: bright, warm light most of the day.', east: 'East: warm and bright in the morning.', west: 'West: strong warm light in the evening.',
    unsure: 'No problem. The colors will suit any light.', none: 'Only light bulbs light this room, so the bulbs matter most.',
  };
  const GLOW = { north: 'rgba(150,180,230,.55)', south: 'rgba(255,214,140,.6)', east: 'rgba(255,232,180,.6)', west: 'rgba(255,170,110,.6)' };
  const JOB_SUB = Object.fromEntries(Object.keys(S.JOBS).map(k => [k, S.JOBS[k].sub]));
  const woodUse = t => (S.JOBS[t] && S.JOBS[t].use) || t;
  const spLabel = sp => WD.SPECIES[sp].label;

  // a choice button: a picture (icon, swatch or art), a title and a short line under it
  const choice = (attrs, pressed, title, sub, pic, cls) => `<button type="button" class="choice${pic == null ? ' noic' : ''}${cls ? ' ' + cls : ''}" ${attrs} aria-pressed="${!!pressed}">${tick}${pic != null ? `<span class="ic">${pic}</span>` : ''}<b>${esc(title)}</b>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</button>`;
  const swatchPic = hexes => `<span class="swatches3">${hexes.map(h => `<span ${swStyle(h)}></span>`).join('')}</span>`;
  const chipBtn = (attrs, pressed, label, dot) => `<button type="button" class="chip${dot == null ? ' plain' : ''}" ${attrs} aria-pressed="${!!pressed}">${dot != null ? `<span class="dot" style="background:${dot}"></span>` : ''}${esc(label)}</button>`;

  function freshAnswers(kind) {
    if (kind === 'stain') return Object.assign(clone(S.DEFAULT), { inout: '', _picked: {} });
    const a = Object.assign(clone(E.DEFAULT_ANSWERS), { where: '', _picked: {} });
    if (kind === 'buy') Object.assign(a, { surface: '', texture: '', issues: [], flaws: false, nowKind: '', going: '', kids: null, priority: '', amountSize: '' });
    return a;
  }
  function flowOf(kind) { if (!state.flows[kind]) state.flows[kind] = { a: freshAnswers(kind) }; return state.flows[kind]; }
  // start a question set, optionally with some answers already filled in (a job carried over from another screen)
  function startFlow(kind, preset) {
    const f = { a: freshAnswers(kind) };
    if (preset) Object.assign(f.a, clone(preset));
    state.flows[kind] = f; state.results[kind] = null; state.duel = null; state.ftype = {};
    barAt = { kind, pct: 0 };   // a new set of questions fills the bar from empty
    let first = 0;
    // a carried-over job skips the questions it already answers
    if (preset && preset.space) { f.a.where = groupOf(preset.space); f.a._picked = { where: true, space: true }; first = flowSteps(kind).indexOf('space') + 1; }
    go(`${kind}/${first}`);
  }

  // Which questions, in order, for the answers so far. Each set starts with what's being done and the easy
  // questions, and gets more detailed as it goes. An answer can add or take away a later question (No Windows
  // takes away the daylight one; siding is only asked for the outside of a house), and pruneAnswers() then
  // clears the answer to any question that's gone, so it can't quietly change the picks.
  function flowSteps(kind) {
    const a = flowOf(kind).a;
    if (kind === 'stain') {
      // how much grain shows comes before the looks, so the look samples are solid stain when it's hidden
      const list = ['inout', 'target', 'wood', 'condition', 'grain', 'slook'];
      if (detailed()) list.push('around', 'finish');
      return list;
    }
    const sp = E.SPACES[a.space] || E.SPACES.living;
    const ext = sp.kind === 'exterior';
    if (kind === 'buy') {
      const list = ['where', 'space'];
      if (a.space === 'ext_body') list.push('siding');
      list.push('amount', 'nowcolor', 'going');
      if (!ext) list.push('kids');
      list.push('surface');
      if (a.space !== 'ext_body' && a.space !== 'fireplace') list.push('texture');
      list.push('issues', 'priority');
      return list;
    }
    const list = ['where', 'space'];
    if (sp.kind === 'interior' && !sp.surface && a.space !== 'accent') list.push('size');
    if (E.WHO_FOR[a.space]) list.push('who');
    if (a.space === 'ext_body') list.push('siding');
    list.push('windows');
    if (ext || a.facing !== 'none') list.push('daylight');
    if (detailed() && settings.askBulbs && !ext) list.push('bulbs');
    list.push('style', 'colors');
    if (detailed() && !E.WHITE_TYPES[sp.surface]) list.push('depth');
    if (detailed()) list.push('feel', 'now');
    if (detailed() && settings.askFixed) list.push('staying');
    return list;
  }
  // Like a guessing game: on the style and color questions, each choice is tried with everything answered so
  // far, and the room's own story decides what's marked. Choices that would come back with cautions for this
  // room (cool grays in north light, dark colors in a small dim room, a moody style on vinyl siding) say
  // "Harder Here", and the rest say "Good Fit". When every choice suits the room, nothing is marked. The look
  // of the question stays the same; the tags sit on the pictures, so nothing moves.
  const fitCache = new Map();
  let fitRun = 0;
  function choiceFit(a, key, val) {
    const test = clone(a); delete test._picked;
    test[key] = val === 'any' ? [] : [val];
    const set = engineSettings();
    const k = JSON.stringify([test, set.brands, set.storeOnly && set.storeBrand]);
    if (fitCache.has(k)) return fitCache.get(k);
    const r = E.recommend(test, Object.assign({}, set, { resultCount: 6 }));
    const res = r.results, cautions = x => (x.warnings || []).filter(w => w.level === 'caution');
    const bad = res.filter(x => cautions(x).length);
    const note = (r.notices || []).find(x => x.level === 'caution');
    const v = { n: res.length, ok: res.length ? 1 - bad.length / res.length : 0, why: note ? note.title : bad.length ? cautions(bad[0])[0].title : '', notice: !!note };
    if (fitCache.size > 400) fitCache.clear();
    fitCache.set(k, v);
    return v;
  }
  function markFits(a, key) {
    const attr = key === 'families' ? 'family' : 'style';
    const btns = $$(`#qBody [data-${attr}]`).filter(b => b.dataset[attr] !== 'any');
    if (!btns.length) return;
    const run = ++fitRun;
    setTimeout(() => {
      if (run !== fitRun || !document.contains(btns[0])) return;
      const fits = btns.map(b => choiceFit(a, key, b.dataset[attr]));
      const hard = fits.map(x => !x.n || x.ok <= 0.5 || x.notice);
      if (!hard.some(Boolean)) return;
      btns.forEach((b, i) => {
        if (!hard[i] && fits[i].ok < 0.99) return;
        const tag = document.createElement('span');
        tag.className = 'fit ' + (hard[i] ? 'hard' : 'good');
        tag.textContent = hard[i] ? 'Harder Here' : 'Good Fit';
        if (hard[i] && fits[i].why) tag.title = fits[i].why;
        ($('.art', b) || b).appendChild(tag);
        b.setAttribute('aria-description', hard[i] ? 'Harder in this room' + (fits[i].why ? ': ' + fits[i].why : '') : 'A good fit for this room');
      });
    }, 40);
  }
  const dayDefault = space => { const sp = E.SPACES[space] || {}; return sp.sunny ? 'high' : sp.dimByNature ? 'low' : 'medium'; };
  // Answers to questions that aren't asked any more go back to how they started, and choices a question no
  // longer offers are dropped (Knots once it isn't wood, Pets once it isn't a floor or a table).
  function pruneAnswers(kind) {
    const a = flowOf(kind).a, list = flowSteps(kind), on = id => list.includes(id);
    const D = kind === 'stain' ? S.DEFAULT : E.DEFAULT_ANSWERS;
    const reset = (...keys) => keys.forEach(k => { a[k] = clone(D[k]); });
    const forget = id => { if (a._picked) delete a._picked[id]; };
    if (kind === 'stain') {
      if (!on('around')) reset('matchWood', 'wallTone');
      if (!on('finish')) reset('sheen', 'evenness', 'pets');
      if (!(S.JOBS[a.target] || {}).traffic) a.pets = false;
      return;
    }
    const sp = E.SPACES[a.space] || E.SPACES.living;
    const wood = ['bare_wood', 'stained_wood', 'paneling'].includes(a.surface) || sp.kind === 'exterior';
    if (!wood && (a.issues || []).includes('knots')) a.issues = a.issues.filter(x => x !== 'knots');
    if (!on('siding')) { reset('siding'); forget('siding'); }
    if (kind === 'buy') {
      if (!on('texture')) { a.texture = ''; forget('texture'); }
      if (!on('kids')) a.kids = null;
      return;
    }
    if (!on('size')) reset('size');
    if (!on('who') || !(E.WHO_FOR[a.space] || {})[a.forWho]) a.forWho = '';
    if (!on('daylight')) forget('daylight');
    if (!on('bulbs')) reset('bulbs');
    if (!on('depth')) reset('depth');
    if (!on('feel')) reset('feel', 'undertone', 'avoid');
    if (!on('now')) reset('nowKind', 'nowHex', 'surface', 'issues');
    if (!on('staying')) reset('fixed', 'customFixed');
    // the kind-of-white question (ceilings, trim, doors) and the colors question never both count
    if (E.WHITE_TYPES[sp.surface]) a.families = []; else a.whiteType = '';
  }

  // ---------------- each question ----------------
  const STEPS = {
    where: {
      title: () => 'What are you painting?', sub: () => 'Pick the closest one. You’ll choose the exact thing next.', auto: true, need: 'where',
      html: a => `<div class="choices big">${Object.entries(GROUPS).map(([k, g]) => choice(`data-v="${k}"`, a.where === k && a._picked.where, g.label, g.sub, ic(g.icon))).join('')}</div>`,
      pick: (a, v) => { a.where = v; if (!GROUPS[v].spaces.includes(a.space)) { a.space = GROUPS[v].spaces[0]; a._picked.space = false; } },
    },
    space: {
      title: a => (GROUPS[a.where] || GROUPS.room).q, sub: () => 'Tap one.', auto: true, need: 'space',
      html: a => `<div class="choices">${(GROUPS[a.where] || GROUPS[groupOf(a.space)]).spaces.map(k => choice(`data-v="${k}"`, a.space === k && a._picked.space, E.SPACES[k].label, SPACE_SUB[k], ic(ICON_OF[k]))).join('')}</div>`,
      pick: (a, v) => {
        a.space = v;
        const sp = E.SPACES[v];
        state.ftype = {};
        const allowed = E.allowedFixed(v);
        a.fixed = (a.fixed || []).filter(id => allowed.has(id));
        if (!E.WHITE_TYPES[sp.surface]) a.whiteType = '';
        if (sp.surface) a.trimPaint = false;
        if (sp.dimByNature && a.amount === 'medium') a.amount = 'low';
        if (sp.sunny && a.amount !== 'high') a.amount = 'high';
        if (sp.kind === 'exterior' && a.facing === 'none') a.facing = 'unsure';
        if (a.surface && !E.surfacesFor(v).includes(a.surface)) { a.surface = ''; a._picked.surface = false; }
      },
    },
    size: {
      title: () => 'How big is the room?', sub: () => 'Big rooms can take deeper colors. Small rooms often look best lighter.', auto: true,
      html: a => `<div class="choices">${[['small', 'Small', 'Like a bathroom or a small bedroom', 'sizeS'], ['medium', 'Medium', 'Like a bedroom or an office', 'sizeM'], ['large', 'Large or Open', 'Like a living room or an open plan', 'sizeL']].map(([k, t, s, i]) => choice(`data-v="${k}"`, a.size === k, t, s, ic(i))).join('')}</div>`,
      pick: (a, v) => { a.size = v; },
    },
    who: {
      title: a => a.space === 'bedroom' ? 'Whose bedroom is it?' : a.space === 'nursery' ? 'Who is the nursery for?' : 'Who is the room for?',
      sub: () => 'Optional. It leans the picks a little. Every color is still there.', auto: true,
      html: a => `<div class="choices">${Object.entries(E.WHO_FOR[a.space] || {}).map(([k, o]) => choice(`data-v="${k}"`, a.forWho === k, o.label, o.sub, swatchPic(o.sw))).join('')}${choice('data-v=""', !a.forWho, 'Not Sure', 'Leave it open', ic('unsure'))}</div>`,
      pick: (a, v) => { a.forWho = v; },
    },
    siding: {
      title: () => 'What is the siding made of?', sub: () => 'Each kind takes paint a little differently.', auto: true,
      html: a => `<div class="choices">${Object.entries(E.SIDING).map(([k, v]) => `<button type="button" class="choice" data-v="${k}" aria-pressed="${a.siding === k}">${tick}<span class="ic sw" style="background:${SIDING_BG[k]}"></span><b>${esc(v)}</b><span class="sub">${esc(SIDING_SUB[k])}</span></button>`).join('')}</div>`,
      pick: (a, v) => { a.siding = v; a.texture = ''; },
    },
    windows: {
      title: a => (E.SPACES[a.space] || {}).kind === 'exterior' ? 'Which way does it face?' : 'Which way do the windows face?',
      sub: a => (E.SPACES[a.space] || {}).kind === 'exterior' ? 'Sun makes outside colors look lighter.' : 'Tap every side that has windows. Not sure? That’s fine.',
      html: a => {
        const ext = (E.SPACES[a.space] || {}).kind === 'exterior';
        const pos = { north: [50, 9], east: [91, 50], south: [50, 91], west: [9, 50] };
        const fs = a.facings || [];
        const ang = { north: '180deg', south: '0deg', east: '270deg', west: '90deg' };
        const glows = fs.map(d => `<span class="glow" style="background: linear-gradient(${ang[d]}, ${GLOW[d]}, transparent 62%)"></span>`).join('');
        const note = fs.length ? fs.map(d => LIGHT_NOTE[d]).join(' ') + (fs.length > 1 ? ' More sides means more light.' : '') : LIGHT_NOTE[a.facing === 'none' ? 'none' : 'unsure'];
        return `<div class="light-q">
          <div class="compass"><div class="compass-ring"></div><div class="compass-room">${glows}<span>${ext ? 'The house' : 'Your room'}</span></div>
            ${Object.entries(pos).map(([k, [x, y]]) => `<button type="button" class="compass-btn" style="left:${x}%;top:${y}%" data-facing="${k}" aria-pressed="${fs.includes(k)}" aria-label="${E.FACING[k]}">${k[0].toUpperCase()}<small>${E.FACING[k]}</small></button>`).join('')}</div>
          <div class="light-side"><div class="chipset">
            ${chipBtn('data-facing="unsure"', !fs.length && a.facing !== 'none', 'Not Sure', null)}
            ${ext ? '' : chipBtn('data-facing="none"', a.facing === 'none', 'No Windows', null)}</div>
            <p class="light-note">${esc(note)}</p></div></div>`;
      },
      click: (a, t) => {
        const d = t.dataset.facing; if (!d) return false;
        a.facings = a.facings || [];
        const wasNone = a.facing === 'none';
        if (d === 'unsure' || d === 'none') { a.facings = []; a.facing = d; if (d === 'none') a.amount = 'low'; else if (wasNone && !(a._picked && a._picked.daylight)) a.amount = dayDefault(a.space); }
        else {
          if (wasNone && !(a._picked && a._picked.daylight)) a.amount = dayDefault(a.space);
          a.facings = a.facings.includes(d) ? a.facings.filter(x => x !== d) : E.DIRS.filter(x => x === d || a.facings.includes(x));
          a.facing = a.facings[0] || 'unsure';
          if (a.facings.length >= 2 && a.amount === 'low') a.amount = 'medium';
        }
        return 'redraw';
      },
    },
    daylight: {
      title: a => (E.SPACES[a.space] || {}).kind === 'exterior' ? 'How much sun does it get?' : 'How much daylight comes in?', sub: () => 'Light changes how dark a color looks.', auto: true,
      html: a => { const ext = (E.SPACES[a.space] || {}).kind === 'exterior'; const L = ext ? { low: ['Mostly Shade', 'Trees or other houses block the sun'], medium: ['Some Sun', 'Sun part of the day'], high: ['Full Sun', 'Sun most of the day'] } : { low: ['Not Much', 'Small windows or a shady side'], medium: ['Some', 'An average room'], high: ['Lots', 'Big windows, a bright room'] };
        return `<div class="choices">${[['low', 'cloud'], ['medium', 'partsun'], ['high', 'sun']].map(([k, i]) => choice(`data-v="${k}"`, a.amount === k, L[k][0], L[k][1], ic(i))).join('')}</div>`; },
      pick: (a, v) => { a.amount = v; },
    },
    bulbs: {
      title: () => 'What light bulbs are in the room?', sub: () => 'Look on the bulb or its box. Not sure is fine.', auto: true,
      html: a => `<div class="choices">${Object.entries(E.BULBS).map(([k, v]) => choice(`data-v="${k}"`, a.bulbs === k, v, { warm: 'Cozy, yellow light', soft: 'The most common bulb', bright: 'Clean, white light', daylight: 'Crisp, a little blue', unsure: 'We’ll plan for any bulb' }[k], k === 'unsure' ? ic('unsure') : `<span style="display:grid;place-items:center;width:100%;height:100%;background:${{ warm: '#ffd69a', soft: '#ffe6bf', bright: '#fff4e2', daylight: '#eef4ff' }[k]};color:#3a3632">${ic('bulb')}</span>`)).join('')}</div>`,
      pick: (a, v) => { a.bulbs = v; },
    },
    now: {
      title: () => 'What’s on it now?', sub: () => 'This helps pick the right primer and how many coats.',
      html: a => {
        const surfs = E.surfacesFor(a.space), sp = E.SPACES[a.space] || E.SPACES.living;
        const wood = ['bare_wood', 'stained_wood', 'paneling'].includes(a.surface) || sp.kind === 'exterior';
        return `<div class="q-group"><p class="q-label">The color on it now</p><div class="chipset">${Object.entries(E.NOW_COLORS).map(([k, v]) => chipBtn(`data-now="${k}"`, a.nowKind === k, v, k === 'none' ? 'var(--surface-2)' : '#' + E.NOW_HEX[k])).join('')}</div></div>
          <div class="q-group"><p class="q-label">What is it?</p><div class="chipset">${surfs.map(k => chipBtn(`data-surface="${k}"`, a.surface === k, E.SURFACES[k], null)).join('')}</div></div>
          <div class="q-group"><p class="q-label">Anything wrong with it? <span class="hint">Pick any</span></p><div class="chipset">${Object.entries(E.ISSUES).filter(([k]) => k !== 'knots' || wood).map(([k, v]) => chipBtn(`data-issue="${k}"`, (a.issues || []).includes(k), v, null)).join('')}</div></div>`;
      },
      click: (a, t) => {
        if (t.dataset.now) { a.nowKind = a.nowKind === t.dataset.now ? '' : t.dataset.now; a.nowHex = ''; return 'redraw'; }
        if (t.dataset.surface) { a.surface = a.surface === t.dataset.surface ? '' : t.dataset.surface; return 'redraw'; }
        if (t.dataset.issue) { a.issues = a.issues || []; toggleIn(a.issues, t.dataset.issue); return 'redraw'; }
        return false;
      },
    },
    style: {
      title: () => 'What style do you like?', sub: () => 'Pick up to two, or keep Any Style.',
      html: a => `<div class="choices has-tall">${choice('data-style="any"', !a.styles.length, 'Any Style', 'Show me a mix of popular colors', ic('sparkle'))}${Object.entries(E.STYLES).map(([k, s]) => `<button type="button" class="choice tall" data-style="${k}" aria-pressed="${a.styles.includes(k)}">${tick}<span class="art"><span class="swatches3" data-palette="${k}"><span></span><span></span><span></span><span></span></span></span><b>${esc(s.label)}</b><span class="sub">${esc(STYLE_SUB[k])}</span></button>`).join('')}</div>`,
      after: a => { fillStylePalettes(); markFits(a, 'styles'); },
      click: (a, t) => {
        const k = t.dataset.style; if (!k) return false;
        if (k === 'any') a.styles = [];
        else { const i = a.styles.indexOf(k); if (i >= 0) a.styles.splice(i, 1); else { a.styles.push(k); if (a.styles.length > 2) a.styles.shift(); } }
        $$('[data-style]').forEach(b => b.setAttribute('aria-pressed', b.dataset.style === 'any' ? !a.styles.length : a.styles.includes(b.dataset.style)));
        return 'update';
      },
    },
    feel: {
      title: () => 'How should it feel?', sub: () => 'Optional. Keep the first choices if you don’t mind.',
      html: a => `<div class="q-group"><p class="q-label">The feeling</p><div class="chipset">${chipBtn('data-feel=""', !a.feel, 'No Preference', null)}${Object.entries(E.MOODS).map(([k, v]) => chipBtn(`data-feel="${k}"`, a.feel === k, v, null)).join('')}</div></div>
        <div class="q-group"><p class="q-label">Warm or cool?</p><div class="chipset">${chipBtn('data-under=""', !a.undertone, 'No Preference', null)}${Object.entries(E.UNDERTONES).map(([k, v]) => chipBtn(`data-under="${k}"`, a.undertone === k, v, { warm: '#e2c9a6', cool: '#b9c6d3', neutral: '#cfcfcb' }[k])).join('')}</div></div>
        <div class="q-group"><p class="q-label">Any colors to stay away from? <span class="hint">Pick any</span></p><div class="chipset">${Object.entries(E.FAMILY_CHOICES).map(([k, v]) => chipBtn(`data-avoid="${k}"`, (a.avoid || []).includes(k), v, '#' + FAMILY_SAMPLE[k][1])).join('')}</div></div>`,
      click: (a, t) => {
        if (t.dataset.feel != null) { a.feel = t.dataset.feel; return 'redraw'; }
        if (t.dataset.under != null) { a.undertone = t.dataset.under; return 'redraw'; }
        if (t.dataset.avoid) { a.avoid = a.avoid || []; toggleIn(a.avoid, t.dataset.avoid); return 'redraw'; }
        return false;
      },
    },
    colors: {
      title: a => { const sp = E.SPACES[a.space] || {}; return E.WHITE_TYPES[sp.surface] ? `What kind of ${sp.surface === 'ceiling' ? 'ceiling' : sp.door ? 'door' : 'trim'} color?` : 'Which colors do you like?'; },
      sub: a => E.WHITE_TYPES[(E.SPACES[a.space] || {}).surface] ? 'Most people pick a white. Tap one.' : 'Pick any, or keep Any Color.',
      auto: a => !!E.WHITE_TYPES[(E.SPACES[a.space] || {}).surface],
      html: a => {
        const wt = E.WHITE_TYPES[(E.SPACES[a.space] || {}).surface];
        if (wt) return `<div class="choices has-tall">${choice('data-white=""', !a.whiteType, 'The Most Popular Whites', 'A handful of best sellers', ic('star'))}${Object.entries(wt).map(([k, v]) => `<button type="button" class="choice tall" data-white="${k}" aria-pressed="${a.whiteType === k}">${tick}<span class="art">${swatchPic(WHITE_SAMPLE[k])}</span><b>${esc(v)}</b></button>`).join('')}</div>`;
        return `<div class="choices has-tall">${choice('data-family="any"', !a.families.length, 'Any Color', 'Show me the best fits', ic('sparkle'))}${Object.entries(E.FAMILY_CHOICES).map(([k, v]) => `<button type="button" class="choice tall" data-family="${k}" aria-pressed="${a.families.includes(k)}">${tick}<span class="art">${swatchPic(FAMILY_SAMPLE[k])}</span><b>${esc(v)}</b></button>`).join('')}</div>`;
      },
      after: a => { if (!E.WHITE_TYPES[(E.SPACES[a.space] || {}).surface]) markFits(a, 'families'); },
      click: (a, t) => {
        if (t.dataset.white != null) { a.whiteType = t.dataset.white; $$('[data-white]').forEach(b => b.setAttribute('aria-pressed', b.dataset.white === a.whiteType)); return 'auto'; }
        const k = t.dataset.family; if (!k) return false;
        if (k === 'any') a.families = []; else toggleIn(a.families, k);
        $$('[data-family]').forEach(b => b.setAttribute('aria-pressed', b.dataset.family === 'any' ? !a.families.length : a.families.includes(b.dataset.family)));
        return 'update';
      },
    },
    depth: {
      title: () => 'How light or dark?', sub: () => 'Tap one.', auto: true,
      html: a => `<div class="choices">${[['light', ['EDEAE2', 'DDE3E0', 'E8DCCB']], ['mid', ['B8AE9C', '93A79A', '8E9FB3']], ['deep', ['3D4651', '2F4038', '5A3E33']], ['any', null]].map(([k, sw]) => choice(`data-v="${k}"`, a.depth === k, E.DEPTHS[k], { light: 'Brightens a room', mid: 'Not too light, not too dark', deep: 'Rich and cozy', any: 'Show me all kinds' }[k], sw ? swatchPic(sw) : ic('unsure'))).join('')}</div>`,
      pick: (a, v) => { a.depth = v; },
    },
    staying: {
      title: a => (E.SPACES[a.space] || {}).kind === 'exterior' ? 'What else is on the house?' : 'What’s staying in the room?',
      sub: () => 'Tap what’s already there, so the colors go with it. Skip anything that doesn’t apply.',
      html: a => stayingHtml(a),
      click: (a, t) => stayingClick(a, t),
    },
    // ---- staining ----
    inout: {
      title: () => 'Is it inside or outside?', sub: () => 'Tap one.', auto: true, need: 'inout',
      html: a => `<div class="choices two">${choice('data-v="interior"', a.inout === 'interior' && a._picked.inout, 'Inside', 'Floors, cabinets, furniture, trim and doors', ic('living'))}${choice('data-v="exterior"', a.inout === 'exterior' && a._picked.inout, 'Outside', 'Decks, fences, siding, doors and outdoor furniture', ic('tree'))}</div>`,
      pick: (a, v) => { a.inout = v; if ((S.JOBS[a.target] || {}).kind !== v) { a.target = Object.keys(S.JOBS).find(k => S.JOBS[k].kind === v); a._picked.target = false; a.wood = ''; } },
    },
    target: {
      title: () => 'What are you staining?', sub: () => 'Tap one.', auto: true, need: 'target',
      html: a => `<div class="choices">${Object.keys(S.JOBS).filter(k => S.JOBS[k].kind === (a.inout || 'interior')).map(k => choice(`data-v="${k}"`, a.target === k && a._picked.target, S.JOBS[k].label, JOB_SUB[k], ic(STAIN_ICON[k]))).join('')}</div>`,
      pick: (a, v) => {
        const before = (S.JOBS[a.target] || {}).kind;
        a.target = v;
        const job = S.JOBS[v];
        if (job.kind !== before || (a.wood && !WD.SPECIES[a.wood].uses.includes(woodUse(v)) && !(job.kind === 'interior' && !WD.SPECIES[a.wood].ext))) a.wood = '';
        if (job.kind === 'interior' && a.condition === 'new_pt') a.condition = 'bare';
      },
    },
    wood: {
      title: () => 'What kind of wood is it?', sub: a => `Not sure? Pick “Not Sure” and we’ll use ${spLabel((S.JOBS[a.target] || S.JOBS.floors).wood).toLowerCase()}, the usual wood for this.`, auto: true,
      html: a => {
        const keys = Object.keys(WD.SPECIES);
        const fit = keys.filter(k => WD.SPECIES[k].uses.includes(woodUse(a.target)) || (a.target === 'stairs' && WD.SPECIES[k].uses.includes('floors')));
        const rest = keys.filter(k => !fit.includes(k));
        const tile = k => `<button type="button" class="wood-pick" data-v="${k}" aria-pressed="${a.wood === k}">${tick}<span class="art">${SC.woodCv({ sp: k, w: 330, h: 150, cm: 0.2, seed: 3, sheen: 0.3 })}</span><b>${esc(spLabel(k))}</b><span class="sub">${esc(WD.SPECIES[k].note.split('. ')[0].replace(/\.$/, ''))}</span></button>`;
        return `<div class="woods">${`<button type="button" class="wood-pick" data-v="" aria-pressed="${!a.wood && !!a._picked.wood}">${tick}<span class="art" style="display:grid;place-items:center;background:var(--surface-2)">${ic('unsure', 48)}</span><b>Not Sure</b><span class="sub">Use the usual wood</span></button>`}${fit.map(tile).join('')}</div>
          ${rest.length ? `<details class="more"${rest.includes(a.wood) ? ' open' : ''}><summary>More Kinds of Wood</summary><div class="woods">${rest.map(tile).join('')}</div></details>` : ''}`;
      },
      pick: (a, v) => { a.wood = v; if (v === 'pt_pine' && a.condition === 'bare') a.condition = 'new_pt'; },
    },
    condition: {
      title: () => 'What shape is the wood in?', sub: () => 'Tap one.', auto: true,
      html: a => { const job = S.JOBS[a.target] || S.JOBS.floors; return `<div class="choices">${Object.entries(S.CONDITION).filter(([k]) => k !== 'new_pt' || job.kind === 'exterior').map(([k, v]) => choice(`data-v="${k}"`, a.condition === k, v, { bare: 'New or sanded down to bare wood', finished: 'Has old stain or a clear coat on it', new_pt: 'New green or brown deck lumber' }[k], ic({ bare: 'grain', finished: 'stained', new_pt: 'deck' }[k]))).join('')}</div>`; },
      pick: (a, v) => { a.condition = v; },
    },
    slook: {
      title: () => 'What look do you like?', sub: a => `Pick up to two. Shown on ${spLabel(S.woodFor(a)).toLowerCase()}.`,
      html: a => { const sp = S.woodFor(a); return `<div class="woods">${`<button type="button" class="wood-pick" data-slook="any" aria-pressed="${!a.looks.length}">${tick}<span class="art" style="display:grid;place-items:center;background:var(--surface-2)">${ic('sparkle', 48)}</span><b>Popular Looks</b><span class="sub">Show me a mix</span></button>`}${Object.entries(S.LOOKS).map(([k, L]) => `<button type="button" class="wood-pick" data-slook="${k}" aria-pressed="${a.looks.includes(k)}">${tick}<span class="art">${SC.woodCv({ sp, w: 360, h: 140, cm: 0.24, seed: 5, look: k, sheen: 0.35 })}</span><b>${esc(L.label)}</b><span class="sub" data-look-name="${k}">${esc(L.sub)}</span></button>`).join('')}</div>`; },
      after: () => fillLookSamples(),
      click: (a, t) => {
        const k = t.dataset.slook; if (!k) return false;
        if (k === 'any') a.looks = []; else { const i = a.looks.indexOf(k); if (i >= 0) a.looks.splice(i, 1); else { a.looks.push(k); if (a.looks.length > 2) a.looks.shift(); } }
        $$('[data-slook]').forEach(b => b.setAttribute('aria-pressed', b.dataset.slook === 'any' ? !a.looks.length : a.looks.includes(b.dataset.slook)));
        return 'update';
      },
    },
    grain: {
      title: () => 'How much wood grain should show?', sub: a => (S.JOBS[a.target] || {}).kind === 'exterior' ? 'Solid stain hides the grain and lasts longest outside.' : 'Most stain inside shows the grain.', auto: true,
      html: a => `<div class="choices two">${choice('data-v="show"', a.grain === 'show', 'Show the Grain', 'See the wood through the color', ic('grain'))}${choice('data-v="hide"', a.grain === 'hide', 'Hide the Grain', 'A solid color, like paint', ic('solid'))}</div>`,
      pick: (a, v) => { a.grain = v; },
    },
    around: {
      title: () => 'What’s around it?', sub: () => 'Optional. Helps the stain go with the room.',
      html: a => `<div class="q-group"><p class="q-label">Match other wood in the room?</p><div class="chipset">${chipBtn('data-mw=""', !a.matchWood, 'Nothing to Match', null)}${Object.entries(S.MATCH_WOOD).map(([k, [l, h]]) => chipBtn(`data-mw="${k}"`, a.matchWood === k, l, '#' + h)).join('')}</div></div>
        <div class="q-group"><p class="q-label">The wall color next to it</p><div class="chipset">${chipBtn('data-wt=""', !a.wallTone, 'Not Sure', null)}${Object.entries(S.WALL_TONES).map(([k, [l, h]]) => chipBtn(`data-wt="${k}"`, a.wallTone === k, l, '#' + h)).join('')}</div></div>`,
      click: (a, t) => { if (t.dataset.mw != null) { a.matchWood = t.dataset.mw; return 'redraw'; } if (t.dataset.wt != null) { a.wallTone = t.dataset.wt; return 'redraw'; } return false; },
    },
    finish: {
      title: () => 'How should it finish?', sub: () => 'Optional. Sets the clear topcoat.',
      html: a => `<div class="q-group"><p class="q-label">How shiny?</p><div class="chipset">${chipBtn('data-sh=""', !a.sheen, 'Not Sure', null)}${Object.entries(S.SHEENS).map(([k, v]) => chipBtn(`data-sh="${k}"`, a.sheen === k, v, null)).join('')}</div></div>
        <div class="q-group"><p class="q-label">How even should the color be?</p><div class="chipset">${[['', 'Not Sure'], ['even', 'Even Color'], ['natural', 'Natural Variation']].map(([k, v]) => chipBtn(`data-ev="${k}"`, (a.evenness || '') === k, v, null)).join('')}</div></div>
        ${(S.JOBS[a.target] || {}).traffic ? `<div class="q-group"><p class="q-label">Pets or kids?</p><div class="chipset">${chipBtn('data-pets="no"', !a.pets, 'No', null)}${chipBtn('data-pets="yes"', !!a.pets, 'Yes', null)}</div></div>` : ''}`,
      click: (a, t) => { if (t.dataset.sh != null) { a.sheen = t.dataset.sh; return 'redraw'; } if (t.dataset.ev != null) { a.evenness = t.dataset.ev; return 'redraw'; } if (t.dataset.pets) { a.pets = t.dataset.pets === 'yes'; return 'redraw'; } return false; },
    },
    // ---- which paint to buy ----
    surface: {
      title: () => 'What is it made of now?', sub: () => 'What you’ll be painting over. Not sure? Pick Already Painted.', auto: true, need: 'surface',
      html: a => `<div class="choices">${E.surfacesFor(a.space).map(k => choice(`data-v="${k}"`, a.surface === k && a._picked.surface, E.SURFACES[k], { painted: 'Has paint on it now', drywall_new: 'New, never painted', plaster: 'Older plaster walls', paneling: 'Wood boards or sheets', bare_wood: 'Raw, unfinished wood', stained_wood: 'Wood with stain or varnish', laminate: 'Smooth plastic coating', mdf: 'Smooth pressed board', metal: 'Steel or aluminum', masonry: 'Brick, stone or concrete', vinyl: 'Plastic siding', fiberglass: 'A fiberglass door' }[k], ic(SURFACE_ICON[k]))).join('')}</div>`,
      pick: (a, v) => { a.surface = v; },
    },
    texture: {
      title: () => 'How smooth is it?', sub: () => 'This picks the right roller. Run your hand over it.', auto: true,
      html: a => { const cls = T.classOf({ kind: 'paint', space: a.space }); const subs = cls === 'ceiling' ? { smooth: 'Flat and even', light: 'A light swirl or spray texture', rough: 'Popcorn or heavy texture' } : cls === 'floor' ? { smooth: 'Smooth concrete or wood', light: 'Brushed concrete', rough: 'Rough or pitted concrete' } : { smooth: 'Flat and even, like a door', light: 'Orange peel or old paint', rough: 'Knockdown, stucco or rough wood' };
        return `<div class="choices">${Object.entries(T.TEXTURES).map(([k, v]) => choice(`data-v="${k}"`, (a.texture || T.textureFor({ kind: 'paint', space: a.space, surface: a.surface })) === k && a._picked.texture, v.label, subs[k], ic(k))).join('')}</div>`; },
      pick: (a, v) => { a.texture = v; },
    },
    issues: {
      title: () => 'Anything wrong with it?', sub: () => 'Pick any you see, or keep “Looks Fine”.',
      html: a => { const wood = ['bare_wood', 'stained_wood', 'paneling'].includes(a.surface) || (E.SPACES[a.space] || {}).kind === 'exterior'; const none = !(a.issues || []).length && !a.flaws;
        return `<div class="choices">${choice('data-issue="none"', none, 'Looks Fine', 'Clean and in good shape', ic('ok'))}${Object.entries(E.ISSUES).filter(([k]) => k !== 'knots' || wood).map(([k, v]) => choice(`data-issue="${k}"`, (a.issues || []).includes(k), v, { stains: 'Water marks, smoke or marker', glossy: 'Shiny old paint', oil: 'Old paint that’s oil-based', knots: 'Dark knots in the wood', mildew: 'Black or green spots' }[k], ic(k))).join('')}${choice('data-issue="flaws"', !!a.flaws, 'Dents, Cracks or Patches', 'Walls that aren’t perfectly smooth', ic('flaws'))}</div>`; },
      click: (a, t) => {
        const k = t.dataset.issue; if (!k) return false;
        a.issues = a.issues || [];
        if (k === 'none') { a.issues = []; a.flaws = false; }
        else if (k === 'flaws') a.flaws = !a.flaws;
        else toggleIn(a.issues, k);
        return 'redraw';
      },
    },
    nowcolor: {
      title: () => 'What color is it now?', sub: () => 'Tap the closest.', auto: true,
      html: a => `<div class="choices">${Object.entries(E.NOW_COLORS).map(([k, v]) => choice(`data-v="${k}"`, a.nowKind === k, v, '', k === 'none' ? ic('grain') : `<span style="display:block;width:100%;height:100%" ${swStyle(E.NOW_HEX[k])}></span>`)).join('')}</div>`,
      pick: (a, v) => { a.nowKind = v; },
    },
    going: {
      title: () => 'What color are you painting it?', sub: () => 'Dark and bright colors need a different paint base and maybe a primer.', auto: true,
      html: a => `<div class="choices">${Object.entries(T.GOING).map(([k, g]) => choice(`data-v="${k}"`, a.going === k, g.label, g.sub, `<span style="display:block;width:100%;height:100%" ${swStyle(g.hex)}></span>`)).join('')}${choice('data-v=""', !a.going && a._picked.going, 'Not Sure Yet', 'Pick a color later', ic('unsure'))}</div>`,
      pick: (a, v) => { a.going = v; },
    },
    kids: {
      title: () => 'Kids or pets in the house?', sub: () => 'Busy homes need a paint that wipes clean.', auto: true,
      html: a => `<div class="choices two">${choice('data-v="yes"', a.kids === true, 'Yes', 'Kids, pets or lots of traffic', ic('paw'))}${choice('data-v="no"', a.kids === false, 'No', 'A quiet home', ic('person'))}</div>`,
      pick: (a, v) => { a.kids = v === 'yes'; },
    },
    priority: {
      title: () => 'What matters most to you?', sub: () => 'Every pick is a good paint. This sets the price level.', auto: true,
      html: a => `<div class="choices">${Object.entries(T.PRIORITIES).map(([k, p]) => choice(`data-v="${k}"`, a.priority === k, p.label, p.sub, ic({ value: 'tag', balanced: 'scale', best: 'star' }[k]))).join('')}</div>`,
      pick: (a, v) => { a.priority = v; },
    },
    amount: {
      title: a => T.sizeKind({ kind: 'paint', space: a.space }) === 'house' ? 'How big is the house?' : T.sizeKind({ kind: 'paint', space: a.space }) === 'kitchen' ? 'How many cabinets?' : T.sizeKind({ kind: 'paint', space: a.space }) === 'piece' ? 'How big is the piece?' : 'How big is the room?',
      sub: () => 'For how much to buy. You can type exact measurements on the shopping list.', auto: true,
      html: a => { const kind = T.sizeKind({ kind: 'paint', space: a.space }); return `<div class="choices">${Object.entries(T.SIZES[kind]).map(([k, s], i) => choice(`data-v="${k}"`, a.amountSize === k, s.label, s.sub, ic(['sizeS', 'sizeM', 'sizeL'][i]))).join('')}</div>`; },
      // a new size answer replaces any measurements typed in before, so the numbers always match the answer
      pick: (a, v) => { a.amountSize = v; a.sizeCustom = null; },
    },
  };
  // the question that needs an answer before Next works
  function stepReady(id, a) {
    const st = STEPS[id];
    if (!st) return true;
    if (st.need) return !!(a._picked && a._picked[st.need]);
    if (id === 'surface') return !!a.surface;
    return true;
  }
  function toggleIn(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

  let barAt = null;   // where the question progress bar was last shown
  function renderFlow(kind, step) {
    if (kind === 'stain' && !jobOn('stain')) { go('', { replace: true }); return; }
    const f = flowOf(kind), a = f.a;
    const list = flowSteps(kind);
    // a step past the end (answers changed the list): go to the last one
    if (step >= list.length) { go(`${kind}/${list.length - 1}`, { replace: true }); return; }
    // a step that needs an earlier answer first: go back to the first unanswered one
    for (let i = 0; i < step; i++) if (!stepReady(list[i], a)) { go(`${kind}/${i}`, { replace: true }); return; }
    f.step = step;
    state.lastFlow = kind;
    const id = list[step], st = STEPS[id];
    const n = list.length;
    // the bar starts where the last question left it and slides to this one, instead of jumping
    const pct = Math.round((step + 1) / n * 100);
    const from = barAt && barAt.kind === kind ? barAt.pct : pct;
    barAt = { kind, pct };
    view().innerHTML = `<div class="flow">
      <div class="flow-top"><div class="progress" aria-hidden="true"><span class="progress-text">${esc(FLOW_INFO[kind].title)} · Question ${step + 1} of ${n}</span><span class="progress-bar"><i style="width:${from}%"></i></span></div></div>
      <div class="q-body${navDir > 0 ? ' slide' : navDir < 0 ? ' slide-back' : ''}" id="qBody">${stepInner(kind, id, a)}</div>
    </div>`;
    if (from !== pct) { const bi = $('.progress-bar i'); void bi.offsetWidth; bi.style.width = pct + '%'; }
    if (st.after) st.after(a);
    SC.paintWoods(view(), 'none');
    showBar(true, kind, step, list);
    // move focus to the question for screen readers, without scrolling
    const h = $('#qTitle'); if (h) h.focus({ preventScroll: true });
  }
  const stepInner = (kind, id, a) => { const st = STEPS[id]; const sub = st.sub ? st.sub(a, kind) : ''; return `<div class="q-head"><h1 id="qTitle" tabindex="-1">${esc(st.title(a, kind))}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${st.html(a, kind)}`; };
  function redrawStep(kind) {
    const f = flowOf(kind), list = flowSteps(kind), id = list[f.step];
    const body = $('#qBody'); if (!body) return;
    const y = window.scrollY;
    body.classList.remove('slide', 'slide-back');
    body.innerHTML = stepInner(kind, id, f.a);
    // an answer can add or take away questions, so the count changes right away
    const pt = $('.progress-text'), pb = $('.progress-bar i');
    if (pt) pt.textContent = `${FLOW_INFO[kind].title} · Question ${f.step + 1} of ${list.length}`;
    if (pb) { const p = Math.round((f.step + 1) / list.length * 100); pb.style.width = p + '%'; barAt = { kind, pct: p }; }
    const st = STEPS[id]; if (st.after) st.after(f.a);
    SC.paintWoods(body, 'none');
    showBar(true, kind, f.step, list);
    window.scrollTo(0, y);
  }

  // ---------------- the Back / Next bar ----------------
  function showBar(on, kind, step, list) {
    const bar = $('#bottomBar');
    bar.hidden = !on;
    document.documentElement.classList.toggle('bar-on', !!on);
    if (!on) return;
    const a = flowOf(kind).a, id = list[step];
    const last = step === list.length - 1;
    const next = $('[data-flow="next"]', bar);
    $('.next-label', next).textContent = last ? FLOW_INFO[kind].last : 'Next';
    next.disabled = !stepReady(id, a);
    bar.dataset.kind = kind;
  }
  $('#bottomBar').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || t.disabled || state.view !== 'flow') return;
    const kind = $('#bottomBar').dataset.kind;
    if (t.dataset.flow === 'back') goBack();
    if (t.dataset.flow === 'next') flowNext(kind);
  });
  function flowNext(kind) {
    const f = flowOf(kind), list = flowSteps(kind);
    if (!stepReady(list[f.step], f.a)) return;
    if (f.step >= list.length - 1) finishFlow(kind); else go(`${kind}/${f.step + 1}`);
  }
  // Picking an answer never moves on by itself: Next always takes you to the next question. The Next button
  // gives a small nudge when an answer is picked, so it's clear what to press.
  function nudgeNext() {
    const n = $('[data-flow="next"]'); if (!n || n.disabled || reduced()) return;
    n.classList.remove('nudge'); void n.offsetWidth; n.classList.add('nudge');
  }
  view().addEventListener('click', e => {
    if (state.view !== 'flow') return;
    const t = e.target.closest('button'); if (!t || t.closest('summary')) return;
    const kind = current.kind, f = flowOf(kind), list = flowSteps(kind), id = list[f.step], st = STEPS[id];
    const a = f.a;
    let res = st.click ? st.click(a, t) : false;
    if (!res && st.pick && t.dataset.v != null) {
      st.pick(a, t.dataset.v);
      if (st.need) a._picked[st.need] = true;
      a._picked[id] = true;
      $$('#qBody [data-v]').forEach(b => b.setAttribute('aria-pressed', b === t));
      res = 'auto';
    }
    if (!res) return;
    pruneAnswers(kind);
    if (res === 'redraw') redrawStep(kind);
    else showBar(true, kind, f.step, flowSteps(kind));
    nudgeNext();
  });
  // Enter goes to the next page, in the questions and in setup. A choice you've moved to with the keyboard but
  // not picked yet is picked first; typing boxes, menus and other buttons keep their own Enter.
  function enterGoesNext(e, next) {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || !next || next.disabled) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (t.closest && t.closest('.cg-pop, summary, [data-select], [data-colorpick]')) return;
    if (t instanceof HTMLButtonElement && t !== next && t.getAttribute('aria-pressed') !== 'true') return;
    e.preventDefault();
    next.click();
  }
  document.addEventListener('keydown', e => {
    if (pop || !$('#modal').hidden) return;
    if (!$('#onboard').hidden) { enterGoesNext(e, $('#onboard [data-ob="next"]')); return; }
    if (state.view === 'flow') enterGoesNext(e, $('[data-flow="next"]'));
  });

  // style palettes: each look's two best light colors, a mid-tone and a deep color, one look per tick
  const stylePalettes = {};
  function fillStylePalettes() {
    const a = flowOf('paint').a;
    const key = JSON.stringify([brandsEnabled(), settings.storeBrand, settings.storeOnly, a.space]);
    const ids = Object.keys(E.STYLES);
    const one = i => {
      const k = ids[i]; if (!k || state.view !== 'flow') return;
      const ck = key + k;
      if (!stylePalettes[ck]) {
        const base = { space: a.space, styles: [k] }, es = engineSettings();
        const pick = (depth, n) => E.recommend(Object.assign({}, base, { depth }), Object.assign({}, es, { resultCount: n })).results.map(x => x.color.hex);
        stylePalettes[ck] = E.STYLES[k].depth < 30 ? pick('deep', 3).concat(pick('mid', 1)) : pick('light', 2).concat(pick('mid', 1), pick('deep', 1));
      }
      const host = $(`[data-palette="${k}"]`);
      if (host) $$('span', host).forEach((s, j) => { const h = stylePalettes[ck][j]; if (h) { s.dataset.hex = h; s.style.backgroundColor = paint(h); } });
      setTimeout(() => one(i + 1), 0);
    };
    setTimeout(() => one(0), 20);
  }
  const stainSpec = r => ({ hex: r.hex, type: r.type || (r.item && r.item.type) || 'semi', solid: !!r.solid, solidHex: r.solidHex || '', ref: r.ref || (r.item && r.item.ref) || '', refMix: r.refMix || (r.item && r.item.refMix) || 0 });
  // each look's best stain on the chosen wood, one look per tick
  function fillLookSamples() {
    const a = flowOf('stain').a, keys = Object.keys(S.LOOKS);
    const one = i => {
      const k = keys[i]; if (!k || state.view !== 'flow') return;
      const cv = $(`canvas[data-look="${k}"]`); if (!cv) return;
      const r = S.recommend(Object.assign({}, a, { looks: [k] }), Object.assign(stainSettings(), { resultCount: 1 })).results[0];
      if (r) { cv.dataset.stain = JSON.stringify(stainSpec(r)); SC.paintWoodCanvas(cv, 'none'); const nm = $(`[data-look-name="${k}"]`); if (nm) nm.textContent = `${S.LOOKS[k].sub}. Like ${r.name}`; }
      setTimeout(() => one(i + 1), 0);
    };
    setTimeout(() => one(0), 20);
  }

  // ---------------- what's staying (detailed questions) ----------------
  function matBg(f) {
    const c = '#' + f.hex, label = f.label.toLowerCase();
    if (/brick/.test(label)) return `repeating-linear-gradient(0deg, ${c} 0 9px, #d9cfc4 9px 11px)`;
    if (f.kind === 'floor' && /wood|oak|cherry|walnut|lvp/.test(label)) return `repeating-linear-gradient(90deg, rgba(0,0,0,.14) 0 1px, transparent 1px 25%), ${c}`;
    if (f.kind === 'floor' && /tile|travertine/.test(label)) return `repeating-linear-gradient(90deg, transparent 0 32%, rgba(255,255,255,.5) 32% 34%), ${c}`;
    if (f.kind === 'counter' || f.kind === 'stone') return `radial-gradient(rgba(0,0,0,.22) 1px, transparent 1.6px) 0 0 / 7px 7px, ${c}`;
    if (f.kind === 'cabinet') return `linear-gradient(90deg, transparent 48%, rgba(0,0,0,.2) 48% 52%, transparent 52%), ${c}`;
    if (f.kind === 'roof') return `repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 8px), ${c}`;
    return c;
  }
  function typeOf(g, a) { if (state.ftype[g.key]) return state.ftype[g.key]; return Object.keys(g.types).find(k => g.types[k].ids.some(id => a.fixed.includes(id))) || ''; }
  const itemChip = (f, g, a) => chipBtn(`data-fixed="${f.id}" data-group="${g.key}"`, a.fixed.includes(f.id), f.short, matBg(f));
  function stayingHtml(a) {
    const groups = E.groupsFor(a.space);
    const custom = a.customFixed || [];
    return groups.map(g => {
      const head = `<p class="q-label">${esc(g.title)}${g.max ? ` <span class="hint">up to ${g.max}</span>` : ''}</p>`;
      if (g.types) {
        const cur = typeOf(g, a), t = cur && g.types[cur];
        return `<div class="q-group">${head}<div class="chipset">${Object.entries(g.types).map(([k, tp]) => { const f = E.FIXED_ITEMS.find(x => x.id === tp.ids[Math.min(1, tp.ids.length - 1)]); return chipBtn(`data-ftype="${k}" data-group="${g.key}"`, cur === k, tp.label, matBg(f)); }).join('')}</div>
          ${t && t.ids.length > 1 ? `<p class="q-label" style="font-size:1rem">Which ${esc(t.label.split(' ')[0].toLowerCase())} color?</p><div class="chipset">${t.ids.map(id => itemChip(E.FIXED_ITEMS.find(x => x.id === id), g, a)).join('')}</div>` : ''}</div>`;
      }
      return `<div class="q-group">${head}<div class="chipset">${(g.ids || []).map(fid => itemChip(E.FIXED_ITEMS.find(x => x.id === fid), g, a)).join('')}${Object.entries(g.flags || {}).map(([k, v]) => chipBtn(`data-flag="${k}"`, !!a[k], v, null)).join('')}</div></div>`;
    }).join('') + `<div class="q-group">${custom.length ? `<div class="chipset">${custom.map((x, i) => `<button type="button" class="chip" data-remove-custom="${i}" aria-label="Remove ${esc(x.label)}"><span class="dot" style="background:#${esc(x.hex)}"></span>${esc(x.label)} ${xIcon}</button>`).join('')}</div>` : ''}
      <details class="more"${state.customOpen ? ' open' : ''}><summary>Add Something Else</summary><div class="actions">
        <input type="text" id="cfLabel" class="input" style="max-width:260px" maxlength="40" placeholder="Name it, like area rug" aria-label="What it is">
        ${colorHtml('cfColor', state.cfColor || '8A6F55', 'Its color', hex => { state.cfColor = hex; })}
        <button type="button" class="btn" data-add-custom="1">${plusIcon}Add It</button></div></details></div>`;
  }
  function stayingClick(a, t) {
    if (t.dataset.fixed) {
      const id = t.dataset.fixed, g = E.FIXED_GROUPS[t.dataset.group] || {};
      const inGroup = x => (g.ids || []).includes(x);
      if (a.fixed.includes(id)) a.fixed = a.fixed.filter(x => x !== id);
      else {
        if (g.one) a.fixed = a.fixed.filter(x => !inGroup(x));
        if (g.max) { const mine = a.fixed.filter(inGroup); if (mine.length >= g.max) a.fixed = a.fixed.filter(x => x !== mine[0]); }
        a.fixed.push(id);
      }
      return 'redraw';
    }
    if (t.dataset.ftype) {
      const g = Object.assign({ key: t.dataset.group }, E.FIXED_GROUPS[t.dataset.group]); const k = t.dataset.ftype, tp = g.types[k];
      const inGroup = x => g.ids.includes(x);
      if (typeOf(g, a) === k) { state.ftype[g.key] = ''; a.fixed = a.fixed.filter(x => !inGroup(x)); }
      else { state.ftype[g.key] = k; a.fixed = a.fixed.filter(x => !inGroup(x) || tp.ids.includes(x)); if (tp.ids.length === 1) a.fixed.push(tp.ids[0]); }
      return 'redraw';
    }
    if (t.dataset.flag) { a[t.dataset.flag] = !a[t.dataset.flag]; return 'redraw'; }
    if (t.dataset.addCustom) {
      const label = ($('#cfLabel').value || '').trim() || 'Something else';
      a.customFixed = (a.customFixed || []).concat([{ label: label.slice(0, 40), hex: state.cfColor || '8A6F55', kind: 'custom' }]);
      state.customOpen = true; return 'redraw';
    }
    if (t.dataset.removeCustom != null) { a.customFixed.splice(+t.dataset.removeCustom, 1); return 'redraw'; }
    return false;
  }
  document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('#qBody details.more') && $('#cfLabel', e.target)) state.customOpen = e.target.open; }, true);

  // ---------------- finishing the questions ----------------
  function finishFlow(kind) {
    const a = flowOf(kind).a;
    if (kind === 'paint') { state.results.paint = E.recommend(a, engineSettings()); state.light = E.lightForAnswers(a); state.pick.paint = (state.results.paint.results[0] || {}).color ? state.results.paint.results[0].color.id : ''; }
    if (kind === 'stain') { state.results.stain = S.recommend(a, stainSettings()); state.light = 'daylight'; state.pick.stain = (state.results.stain.results[0] || {}).id || ''; }
    if (kind === 'buy') state.results.buy = buyPlan(a);
    state.duel = null;
    go(`${kind}/results`);
  }
  const buyPlan = a => T.paintPlan(Object.assign({}, a, { size: a.amountSize || 'medium', sizeCustom: a.sizeCustom }), { brands: brandsEnabled(), storeBrand: settings.storeBrand, storeOnly: settings.storeOnly && !!settings.storeBrand, lines: settings.lines, known: id => !!E.getIndex().brandById[id] });

  // ================================================================
  // SCENES: the color in a room, on a house, on a deck
  // Each job has its own scenes to pick from. The pictures are drawn in 3D when the device can (and can be turned
  // around with the 3D setting on); otherwise the flat drawings are used.
  // ================================================================
  const SCN = {
    living: { label: 'Living Room', kind: 'room', furniture: 'sofa', base: 'living' },
    bedroom: { label: 'Bedroom', kind: 'room', furniture: 'bed', base: 'bedroom' },
    kitchen: { label: 'Kitchen', kind: 'kitchen', base: 'kitchen' },
    island: { label: 'Kitchen Island', kind: 'kitchen', base: 'kitchen' },
    bath: { label: 'Bathroom', kind: 'room', furniture: 'vanity', base: 'bathroom', floor: 'tile' },
    dining: { label: 'Dining Room', kind: 'room', furniture: 'dining', base: 'dining' },
    office: { label: 'Home Office', kind: 'room', furniture: 'desk', base: 'office' },
    nursery: { label: 'Nursery', kind: 'room', furniture: 'bed', base: 'nursery' },
    kids: { label: 'Kids’ Room', kind: 'room', furniture: 'bed', base: 'kids' },
    entry: { label: 'Entry & Hallway', kind: 'room', furniture: 'console', base: 'entry' },
    stairway: { label: 'Stairway', kind: 'room', furniture: 'console', base: 'stairs' },
    laundry: { label: 'Laundry Room', kind: 'room', furniture: 'laundry', base: 'laundry', floor: 'tile' },
    media: { label: 'Media Room', kind: 'room', furniture: 'sofa', base: 'media' },
    sunroom: { label: 'Sunroom', kind: 'room', furniture: 'sofa', base: 'sunroom' },
    basement: { label: 'Basement', kind: 'room', furniture: 'sofa', base: 'basement', floor: 'concrete' },
    attic: { label: 'Attic Room', kind: 'room', furniture: 'bed', base: 'attic' },
    garage: { label: 'Garage', kind: 'room', furniture: 'garage', base: 'garage', floor: 'concrete' },
    fireplace: { label: 'Fireplace Wall', kind: 'room', furniture: 'fireplace', base: 'living' },
    bookcase: { label: 'Bookcase Wall', kind: 'room', furniture: 'dresser', base: 'living' },
    dresser: { label: 'Bedroom Dresser', kind: 'room', furniture: 'dresser', base: 'bedroom' },
    diningset: { label: 'Dining Table & Chairs', kind: 'room', furniture: 'dining', base: 'dining' },
    house: { label: 'Ranch House', kind: 'house', base: 'ext_body' },
    colonial: { label: 'Two-Story House', kind: 'house', base: 'ext_body' },
    farmhouse: { label: 'Farmhouse with Porch', kind: 'house', base: 'ext_body', porch: true },
    cottage: { label: 'Cottage', kind: 'house', base: 'ext_body' },
    modern: { label: 'Modern House', kind: 'house', base: 'ext_body' },
    doorway: { label: 'Front Door Up Close', kind: 'house', base: 'front_door' },
    porch: { label: 'Front Porch', kind: 'house', base: 'ext_body', porch: true },
    barn: { label: 'Shed or Barn', kind: 'house', base: 'shed', siding: 'board' },
    deck: { label: 'Back Deck', kind: 'deck' },
    pergola: { label: 'Deck with Pergola', kind: 'deck' },
    patioset: { label: 'Outdoor Chairs', kind: 'deck' },
    playset: { label: 'Playset', kind: 'deck' },
    dock: { label: 'Dock on a Lake', kind: 'deck' },
    fence: { label: 'Backyard Fence', kind: 'fence' },
    picket: { label: 'Picket Fence', kind: 'fence' },
    cabin: { label: 'Log Cabin', kind: 'house', base: 'ext_body' },
  };
  const WALL_SCENES = ['living', 'bedroom', 'kitchen', 'bath', 'dining', 'office', 'nursery', 'kids', 'entry', 'stairway', 'laundry', 'media', 'sunroom', 'basement', 'attic', 'garage'];
  const OWN_SCENE = { living: 'living', bedroom: 'bedroom', kitchen: 'kitchen', bathroom: 'bath', powder: 'bath', dining: 'dining', office: 'office', kids: 'kids', nursery: 'nursery', entry: 'entry', stairs: 'stairway', laundry: 'laundry', closet: 'entry', sunroom: 'sunroom', basement: 'basement', attic: 'attic', media: 'media', garage: 'garage' };
  const HOUSES = ['house', 'colonial', 'farmhouse', 'cottage', 'modern'];
  function paintScenes(space) {
    const own = OWN_SCENE[space];
    if (own) return [own].concat(WALL_SCENES.filter(x => x !== own));
    return {
      accent: ['living', 'bedroom', 'dining', 'office', 'media', 'kids'], ceiling: ['living', 'bedroom', 'dining', 'kitchen', 'office'],
      trim: ['entry', 'living', 'bedroom', 'dining', 'stairway'], doors: ['entry', 'bedroom', 'living', 'stairway'], wainscot: ['dining', 'living', 'bath', 'entry'],
      fireplace: ['fireplace'], cabinets: ['kitchen', 'island', 'bath', 'laundry'], builtins: ['bookcase', 'office', 'dresser'], furniture: ['dresser', 'diningset', 'nursery'],
      floor_paint: ['basement', 'garage', 'sunroom'], porch_floor: ['porch', 'farmhouse'], shed: ['barn'], front_door: ['doorway', 'house', 'colonial', 'farmhouse', 'cottage'],
      shutters: ['colonial', 'house', 'cottage', 'farmhouse'], garage_door: ['house', 'colonial', 'modern'], ext_body: HOUSES, ext_trim: HOUSES,
    }[space] || ['living'];
  }
  const STAIN_SCENES = {
    floors: ['living', 'bedroom', 'dining', 'entry'], stairs: ['stairway', 'entry'], cabinets: ['kitchen', 'island', 'bath'], furniture: ['diningset', 'dresser', 'office'],
    tabletop: ['diningset', 'island', 'office'], trim: ['entry', 'living', 'bedroom'], doors: ['entry', 'bedroom'], paneling: ['living', 'dining'], builtins: ['bookcase', 'dresser'],
    deck: ['deck', 'pergola'], dock: ['dock', 'deck'], outdoor: ['patioset', 'deck'], pergola: ['pergola', 'deck'], playset: ['playset', 'deck'], fence: ['fence', 'picket'],
    siding: ['house', 'cabin'], shed: ['barn'], log: ['cabin'], front_door: ['doorway', 'house'], garage_door: ['house'], shutters: ['colonial', 'house'],
  };
  // which part of a scene the picked paint color goes on
  function targetFor(space) {
    return { accent: 'accent', ceiling: 'ceil', trim: 'trim', doors: 'door', wainscot: 'wain', fireplace: 'fire', floor_paint: 'floor', cabinets: 'cab', builtins: 'cab', furniture: 'cab', ext_body: 'body', ext_trim: 'xtrim', front_door: 'xdoor', shutters: 'shut', garage_door: 'gdoor', porch_floor: 'step', shed: 'body' }[space] || 'walls';
  }
  // the colors for every part of a scene: the picked color where the job is, sensible colors everywhere else
  function paintRoles(sceneId, c, answers, pairs) {
    const sc = SCN[sceneId] || SCN.living;
    const space = answers ? answers.space : (sc.kind === 'house' ? 'ext_body' : sc.base || 'living');
    const target = targetFor(space);
    const palSpace = target === 'walls' && sc.kind !== 'house' ? (sc.base || 'living') : space;
    const roles = SC.scenePalette(c, Object.assign({}, E.DEFAULT_ANSWERS, answers || {}, { space: palSpace }), pairs);
    if (target === 'walls') { roles.wall = c.hex; roles.side = c.hex; }
    if (target === 'cab') { roles.cab = c.hex; if (sceneId === 'bath') roles.vanity = c.hex; }
    if (sc.kind === 'house' && !roles.body) Object.assign(roles, { body: 'D9D5CC', xtrim: 'F2F1EC', xdoor: '3E4A52', roof: '45484C', lawn: '6E8A4F', shrub: '4E6A3B', walk: 'CFCAC0', step: 'BEB9B0', glass: '33404B', tree: '5D7649' });
    roles.target = target;
    roles.paint = c.hex;
    return roles;
  }
  const STAIN_ROLES = { wall: 'E7E2D8', side: 'E7E2D8', ceil: 'F4F2ED', trim: 'F2F1EC', door: 'F2F1EC', art: '5E6B73', art2: 'D9CFC0', cab: 'F2F1EC', counter: 'ECEAE5', tile: 'F6F5F1', hood: 'B9BDBF', rug: 'D6CDBE', curtain: 'ECE7DD', floor: 'A98661', body: 'D8D2C6', xtrim: 'F2F1EC', glass: '33404B', xdoor: '3E4A52', roof: '45484C', lawn: '6E8A4F', shrub: '4E6A3B', tree: '5D7649', walk: 'CFCAC0', step: 'BEB9B0' };
  const LIGHT_OPTS = () => [['none', 'Chip Color']].concat(E.LIGHTS.map(l => [l.id, l.label]));
  const LIGHT_SHORT = { none: 'Chip color', daylight: 'Daylight', north: 'North light', sun: 'Afternoon sun', golden: 'Golden hour', warm: 'Warm bulbs, 2700K', soft: 'Soft white bulbs, 3000K', bright: 'Bright white bulbs, 4000K', cool: 'Daylight bulbs, 5000K', dim: 'A dim corner' };
  const lightLabel = id => (LIGHT_OPTS().find(o => o[0] === id) || [0, 'Daylight'])[1].replace(/ \(\d+K\)$/, '');
  // The light picker: the bulbs that are in the room (by the number on the bulb or its box), or the daylight.
  // [light, big word, small word, the bulb's own glow]
  const BULB_TILES = [['warm', 'Warm', '2700K', '#ffd48f'], ['soft', 'Soft White', '3000K', '#ffe4b8'], ['bright', 'Bright White', '4000K', '#fff4e2'], ['cool', 'Daylight', '5000K', '#e8f0ff']];
  const DAY_TILES = [['daylight', 'Daytime', 'Sun from windows', '#dcebfa'], ['north', 'North Light', 'Soft and cool', '#d9e1ea'], ['sun', 'Afternoon Sun', 'Strong and warm', '#ffeccb'], ['golden', 'Golden Hour', 'Low orange sun', '#ffcf94'], ['dim', 'Dim Corner', 'Away from windows', '#c9cdd2'], ['none', 'Chip Color', 'No light at all', '#ffffff']];
  function lightTile([id, word, small, glow], yours, attr, on) {
    const bulb = BULB_TILES.some(t => t[0] === id);
    return `<button type="button" class="lt-tile" ${attr || 'data-light-set'}="${id}" aria-pressed="${on == null ? state.light === id : !!on}"><span class="lt-ic" style="background:${glow}">${ic(bulb ? 'bulb' : id === 'none' ? 'swatch' : id === '' ? 'unsure' : 'sun', 22)}</span><b>${esc(word)}</b><small>${esc(small)}</small>${yours && yours === id ? '<span class="lt-yours">Yours</span>' : ''}</button>`;
  }
  // the short row inside the color adjuster: daytime and the four bulbs (and whatever else is picked now)
  function lightRowHtml(yours) {
    const tiles = [DAY_TILES[0]].concat(BULB_TILES);
    if (!tiles.some(t => t[0] === state.light)) tiles.push(DAY_TILES.find(t => t[0] === state.light) || DAY_TILES[0]);
    return `<div class="lt-row">${tiles.map(t => lightTile(t, yours)).join('')}</div>`;
  }
  // the bulbs the answers say are in the room
  const yourBulbs = id => { const L = id && live[id]; return L && L.spec.answers && !L.spec.stain ? E.bulbLight(L.spec.answers) : ''; };
  function openLight(id) {
    const L = live[id]; if (!L) return;
    partPick = null; furnPick = null;
    const house = (SCN[state.sceneFor[L.spec.key]] || {}).kind === 'house', yours = yourBulbs(id);
    openModal(house ? 'Light on the House' : 'Light in the Room', `<p class="part-lead">${house ? 'Pick the light: the sun in the day, or the porch light’s bulbs at night.' : 'What light bulbs are in the room? The number is on the bulb or its box.'} The picture and its colors change right away.</p>
      <div class="setup-group"><h3>${house ? 'Porch Light at Night' : 'Light Bulbs'}</h3><div class="lt-grid bulbs">${BULB_TILES.map(t => lightTile(t, yours)).join('')}</div></div>
      <div class="setup-group"><h3>Daylight</h3><div class="lt-grid">${DAY_TILES.map(t => lightTile(t, yours)).join('')}</div></div>
      <div class="modal-foot"><span class="grow"></span><button type="button" class="btn big primary" data-modal-close="1">Done</button></div>`, peekFor(id));
  }
  function setLight(v) {
    if (!LIGHT_OPTS().some(o => o[0] === v)) return;
    state.light = v;
    for (const k of Object.keys(live)) relight(k);
    $$('[data-light-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lightSet === v)));
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-light-set], [data-light-open]'); if (!t) return;
    if (t.dataset.lightOpen) openLight(t.dataset.lightOpen); else setLight(t.dataset.lightSet);
  });

  // the flat drawing for a scene (used where 3D can't run)
  function svgScene(spec, sceneId, roles) {
    const sc = SCN[sceneId] || SCN.living, a = Object.assign({}, E.DEFAULT_ANSWERS, spec.answers || {});
    const label = spec.label || sc.label;
    if (spec.stain) {
      const job = S.JOBS[spec.answers.target] || S.JOBS.floors;
      const tex = spec.tex;
      if (sc.kind === 'room' && ['floor', 'trim', 'paneling'].includes(job.scene)) {
        const o = { label, furniture: sc.furniture, windows: [{ slot: 'left', dir: 'south' }] };
        if (job.scene === 'floor') o.floorTex = Object.assign({ t: 'floor', kind: 'wood' }, tex);
        if (job.scene === 'trim') o.trimTex = tex;
        if (job.scene === 'paneling') { o.wainscot = true; o.wainscotTex = tex; }
        return SC.sceneSvg('room', o);
      }
      if (sc.kind === 'room' && ['furniture', 'builtins'].includes(job.scene)) return SC.sceneSvg('room', { label, furniture: sceneId === 'diningset' ? 'dining' : 'dresser', cabWood: sceneId !== 'diningset', windows: [{ slot: 'left', dir: 'south' }], woodTex: Object.assign({ t: 'boards', w: 400, h: 120, cm: 0.3, board: 14, seed: 2 }, tex) });
      return SC.stainScene(job.scene, tex, spec.answers, label);
    }
    if (sc.kind === 'house') {
      const ex = SC.sceneExtras(a.space);
      return SC.sceneSvg('house', Object.assign({ label, siding: sc.siding || a.siding }, ex, { porch: ex.porch || !!sc.porch }));
    }
    const kind = sc.kind === 'kitchen' ? 'kitchen' : 'room';
    const furn = sc.furniture;
    return SC.sceneSvg(kind, Object.assign({ label, furniture: furn, windows: SC.windowSlots(a, kind === 'kitchen' ? 'kitchen' : furn, state.layout && state.layout.wins), floorType: sc.floor || SC.floorTypeOf(a), crown: !!a.crown }, SC.sceneExtras(a.space)));
  }

  const live = {};  // scene box id -> { spec, viewer }
  function teardownScenes() { for (const k of Object.keys(live)) { if (live[k].viewer) live[k].viewer.destroy(); delete live[k]; } }
  const sceneBox = id => `<div class="scene" id="${id}"><div class="pic" role="img"></div><span class="scene-tag" hidden></span><button type="button" class="scene-setup" data-room-setup="${id}" hidden>${ic('room', 20)}Set Up Room</button>${R3().supported() ? `<button type="button" class="scene-3d" data-toggle3d="1" aria-pressed="${!!settings.view3d}" aria-label="Turn in 3D">${ic('cube', 22)}3D</button>` : ''}</div><div class="scene-tools" id="${id}-tools"></div>`;
  // spec: { key, ids, roles(sceneId) -> role colors, tex (stain), stain, answers, label }
  function mountScene(id, spec) {
    const box = $('#' + id); if (!box) return;
    const key = spec.key;
    if (!spec.ids.includes(state.sceneFor[key])) state.sceneFor[key] = spec.ids[0];
    live[id] = { spec, viewer: null };
    $('#' + id + '-tools').innerHTML = [
      spec.ids.length > 1 ? selectHtml(id + '-scene', spec.ids.map(s => [s, SCN[s].label]), state.sceneFor[key], 'Scene', v => { state.sceneFor[key] = v; drawScene(id); }) : '',
      settings.lightPreview ? `<button type="button" class="cg-select" id="${id}-light" data-light-open="${id}" aria-haspopup="dialog" aria-label="Light: ${esc(lightLabel(state.light))}"><span class="k">Light</span><span class="v">${esc(lightLabel(state.light))}</span>${chev('down', 18)}</button>` : '',
    ].join('');
    drawScene(id);
  }
  function drawScene(id) {
    const L = live[id]; if (!L) return;
    const box = $('#' + id), pic = $('.pic', box), spec = L.spec;
    const sceneId = state.sceneFor[spec.key];
    const roles = rolesFor(spec, sceneId);
    if (L.viewer) { L.viewer.destroy(); L.viewer = null; }
    const setupBtn = $('[data-room-setup]', box); if (setupBtn) setupBtn.hidden = !['room', 'kitchen'].includes((SCN[sceneId] || {}).kind);
    const r3 = R3();
    pic.setAttribute('aria-label', `${spec.label || ''} in a ${(SCN[sceneId] || {}).label || 'room'}`);
    if (r3.supported() && r3.has && r3.has(sceneId)) {
      pic.innerHTML = '';
      const floor = (SCN[sceneId] || {}).floor || (spec.answers && !spec.stain ? SC.floorTypeOf(Object.assign({}, E.DEFAULT_ANSWERS, spec.answers)) : null);
      L.viewer = r3.mount(pic, { scene: sceneId, roles, tex: spec.tex || null, texParts: spec.texParts || null, show: spec.show || null, stain: !!spec.stain, answers: spec.answers || {}, layout: state.layout, furniture: state.furniture, onPick: what => onScenePick(id, what), light: state.light, interactive: !!settings.view3d, reduced: reduced(), cal: settings.cal, floor, onLost: () => { if (live[id] && live[id].viewer) { live[id].viewer = null; pic.innerHTML = svgScene(spec, sceneId, roles); pic.dataset.roles = JSON.stringify(roles); pic.dataset.scene = (SCN[sceneId] || {}).kind === 'house' ? 'house' : 'room'; SC.paintScene(pic, state.light); } } });
      if (L.viewer) { setTag(id); showTapCoach(box); return; }
    }
    pic.innerHTML = svgScene(spec, sceneId, roles);
    pic.dataset.roles = JSON.stringify(roles);
    pic.dataset.scene = (SCN[sceneId] || {}).kind === 'house' ? 'house' : spec.stain ? (S.JOBS[spec.answers.target] || {}).scene : 'room';
    setTag(id, SC.paintScene(pic, state.light));
  }
  // ---- furniture in its real color and material: tap it in 3D ----
  const PART_LABEL = { upholstery: 'Upholstery', pillows: 'Pillows', bedding: 'Bedding', wood: 'Wood', curtains: 'Curtains', rug: 'Rug', towels: 'Towels', counter: 'Counters', tile: 'Backsplash' };
  const FURN_SWATCHES = {
    upholstery: [['3A3A3C', 'Charcoal'], ['77726B', 'Gray'], ['B9B2A6', 'Light Gray'], ['E6E0D4', 'Cream'], ['2F3B4C', 'Navy'], ['4E5B47', 'Olive'], ['8B5A3C', 'Cognac'], ['1F1F20', 'Black']],
    wood: [['5A3E2B', 'Walnut'], ['8E6A48', 'Medium Oak'], ['C9A77A', 'Light Oak'], ['3B2A20', 'Espresso'], ['F2F1EC', 'White'], ['2A2A2B', 'Black']],
    _: [['F1F0EC', 'White'], ['E6E0D4', 'Cream'], ['CFC6B8', 'Beige'], ['9A958E', 'Gray'], ['5E6B73', 'Slate'], ['2F3B4C', 'Navy'], ['8E4A32', 'Rust'], ['4E5B47', 'Green']],
  };
  const FINISHES = { upholstery: [['fabric', 'Fabric'], ['leather', 'Leather'], ['velvet', 'Velvet']], wood: [['grain', 'Wood Grain'], ['painted', 'Painted']] };
  let furnPick = null;
  function applyFurniture() { for (const k of Object.keys(live)) if (live[k].viewer && live[k].viewer.setFurniture) live[k].viewer.setFurniture(state.furniture); }
  function openFurniture(what, id) {
    partPick = null;
    furnPick = Object.assign({}, what, { draft: Object.assign({ hex: what.hex, finish: what.finish || (what.part === 'upholstery' ? 'fabric' : what.part === 'wood' ? 'grain' : '') }, state.furniture[what.key] || {}) });
    const title = what.piece ? (what.piece === PART_LABEL[what.part] ? what.piece : `${what.piece}: ${PART_LABEL[what.part]}`) : PART_LABEL[what.part];
    const sw = FURN_SWATCHES[what.part] || FURN_SWATCHES._, fin = FINISHES[what.part];
    openModal(title, `<p class="part-lead">What color is yours? Tap the closest one. It changes in the picture right away, so you see the paint with your own things.</p>
      <div class="setup-group"><h3>Color</h3><div class="chipset furn-sws">${sw.map(([h, l]) => `<button type="button" class="chip plain furn-sw" data-furn-hex="${h}" aria-pressed="${furnPick.draft.hex === h}"><span class="dot" ${swStyle(h)}></span>${esc(l)}</button>`).join('')}</div>
        <div class="actions"><span class="muted">or any color:</span>${colorHtml('furnColor', furnPick.draft.hex, 'Pick its color', hex => { furnSet({ hex }); })}</div></div>
      ${fin ? `<div class="setup-group"><h3>What It's Made Of</h3><div class="chipset">${fin.map(([k, l]) => `<button type="button" class="chip plain" data-furn-finish="${k}" aria-pressed="${furnPick.draft.finish === k}">${l}</button>`).join('')}</div></div>` : ''}
      <div class="modal-foot"><button type="button" class="btn big ghost" data-furn-reset="1">Put It Back</button><span class="grow"></span><button type="button" class="btn big primary" data-modal-close="1">Done</button></div>`, peekFor(id));
  }

  // ---- tap any part of the room or house to change its color ----
  // The painted parts, by the "role" the scenes give them (the two walls of a room are one part). Each gets
  // colors that go with the color being looked at: whites for trim, accents for a front door, close shades for
  // the part that's showing the color itself.
  const PARTS = {
    walls: { roles: ['wall', 'side'], label: 'Walls', kind: 'wall' }, ceil: { roles: ['ceil'], label: 'Ceiling', kind: 'white' },
    trim: { roles: ['trim'], label: 'Trim', kind: 'white' }, door: { roles: ['door'], label: 'Doors', kind: 'white' },
    wain: { roles: ['wain'], label: 'Wainscoting', kind: 'white' }, fire: { roles: ['fire'], label: 'Fireplace', kind: 'accent' },
    cab: { roles: ['cab'], label: 'Cabinets', kind: 'cab' }, vanity: { roles: ['vanity'], label: 'Vanity', kind: 'cab' },
    floor: { roles: ['floor'], label: 'Floor', kind: 'floor' }, body: { roles: ['body'], label: 'Siding', kind: 'wall' },
    xtrim: { roles: ['xtrim'], label: 'Trim', kind: 'white' }, xdoor: { roles: ['xdoor'], label: 'Front Door', kind: 'accent' },
    shut: { roles: ['shut'], label: 'Shutters', kind: 'accent' }, gdoor: { roles: ['gdoor'], label: 'Garage Door', kind: 'white' },
    step: { roles: ['step'], label: 'Porch Steps', kind: 'accent' }, roof: { roles: ['roof'], label: 'Roof', kind: 'roof' },
  };
  const PART_OF_ROLE = {};
  for (const [k, p] of Object.entries(PARTS)) for (const r of p.roles) PART_OF_ROLE[r] = k;
  const NOT_PAINTED = { lawn: 'That’s the lawn. Tap the house to change its colors.', shrub: 'Those are bushes. Tap the house to change its colors.', tree: 'That’s a tree. Tap the house to change its colors.', walk: 'That’s the walkway. Tap the house to change its colors.', glass: 'That’s a window. Tap the walls or trim around it.', hood: 'The range hood is metal. Tap the cabinets or walls.', shade: 'That’s a lamp. Tap the walls or furniture.' };
  // a roof or a floor isn't paint: set it to the one that's really there, so the paint is seen with it
  const ROOF_COLORS = [['3F4246', 'Charcoal Shingles'], ['2B2C2E', 'Black Shingles'], ['7B6F63', 'Weathered Wood'], ['594536', 'Brown Shingles'], ['6D7378', 'Slate Gray'], ['A65B3B', 'Clay Tile'], ['3F5A47', 'Green Metal'], ['8E9497', 'Silver Metal']];
  const FLOOR_COLORS = [['C9A77A', 'Light Oak'], ['A9784B', 'Medium Oak'], ['6B4A32', 'Walnut'], ['3B2A20', 'Espresso'], ['9A958E', 'Gray Wood'], ['E8E6E1', 'White Tile'], ['9E9B96', 'Gray Tile'], ['BDB3A5', 'Beige Carpet']];
  const PLAIN_COLORS = [['F2F1EC', 'White'], ['ECE6DA', 'Cream'], ['D9D3C8', 'Greige'], ['B9B5AE', 'Light Gray'], ['6B7378', 'Slate'], ['2F3B4C', 'Navy'], ['4E5B47', 'Green'], ['2A2A2B', 'Black']];
  const partKey = spec => spec.partKey || (spec.color ? spec.color.id : spec.key);
  // a scene's colors with the parts that were changed by tapping
  function rolesFor(spec, sceneId) {
    const roles = Object.assign({}, spec.roles(sceneId));
    const own = state.parts[partKey(spec)] || {};
    for (const [k, v] of Object.entries(own)) for (const r of (PARTS[k] || { roles: [] }).roles) roles[r] = v.hex;
    return roles;
  }
  // the panel sits low (or to one side), so the picture it's changing stays in view
  function peekFor(id) {
    const box = id && $('#' + id); if (!box) return { peek: true };
    const r = box.getBoundingClientRect();
    if (window.innerWidth <= 600) { const top = r.top + window.scrollY - 70; if (Math.abs(window.scrollY - top) > 4) window.scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' }); }
    return { peek: true, left: r.left + r.width / 2 > window.innerWidth * 0.55 };
  }
  // the brand color nearest a Lab value, skipping some (and anything switched off or discontinued)
  function nearestIn(brand, lab, skip, filter) {
    let best = null, bd = Infinity;
    for (const x of E.getIndex().byBrand[brand] || []) {
      if ((x.flags & E.F.DISC) || skip.has(x.id) || (filter && !filter(x)) || (x.coll && settings.collections[x.brand + ':' + x.coll] === false)) continue;
      const d = C.deltaE2000(lab, x.lab); if (d < bd) { bd = d; best = x; }
    }
    return best;
  }
  const labAt = (L, Cc, h) => { const r = h * Math.PI / 180; return [L, Cc * Math.cos(r), Cc * Math.sin(r)]; };
  function partChoices(group, c, isTarget) {
    const P = PARTS[group], out = [], skip = new Set();
    const add = (x, why) => { if (x && !skip.has(x.id)) { skip.add(x.id); out.push({ hex: x.hex, name: x.name, code: E.codeLabel(x), id: x.id, why }); } };
    const plain = list => list.map(([hex, name]) => ({ hex, name, code: '', id: '', why: '' }));
    if (P.kind === 'roof') return plain(ROOF_COLORS);
    if (P.kind === 'floor' && !isTarget) return plain(FLOOR_COLORS);
    if (!c || !E.getIndex().byBrand[c.brand]) return plain(PLAIN_COLORS);
    const pairs = E.pairings(c, { collections: settings.collections });
    const pair = role => (pairs.find(p => p.role === role) || {}).color;
    const near = (lab, why, filter) => add(nearestIn(c.brand, lab, skip, x => C.deltaE2000(x.lab, c.lab) > 2.5 && (!filter || filter(x))), why);
    // the part showing the color itself has no list: the adjuster steps it lighter, deeper, warmer and so on
    if (isTarget) return out;
    const whites = () => {
      add(pair('Trim & ceiling'), 'Made to go with ' + c.name);
      const warm = c.temp === 'warm';
      const score = w => (warm ? (w.temp === 'cool' ? 6 : 0) + Math.abs(w.C - 4) : (w.temp === 'warm' && w.C > 4 ? 6 : 0) + w.C) - (E.isPopular(w) ? 2.5 : 0) + Math.abs(w.lrv - 86) * 0.15;
      (E.getIndex().byBrand[c.brand] || []).filter(w => !(w.flags & E.F.DISC) && w.lrv >= 78 && w.C <= 10 && !(w.coll && settings.collections[w.brand + ':' + w.coll] === false))
        .sort((x, y) => score(x) - score(y)).slice(0, 8).forEach(w => { if (out.length < 5) add(w, warm ? 'A soft white for a warm color' : 'A clean white for a cool color'); });
    };
    if (P.kind === 'white') {
      whites();
      if (!skip.has(c.id)) out.push({ hex: c.hex, name: c.name, code: E.codeLabel(c), id: c.id, why: group === 'ceil' ? 'Same as the walls' : 'Same color, one look' });
      add(pair('Deeper, same family'), 'A deeper shade of it');
    } else if (P.kind === 'wall') {
      add(pair('Lighter, same family'), 'A lighter shade of ' + c.name);
      near(labAt(90, Math.min(c.C, 5), c.h), 'A soft neutral that goes with it');
      near(labAt(80, Math.min(c.C, 7), c.h), 'A light neutral that goes with it');
      near(labAt(68, Math.min(c.C, 8), c.h), 'A medium neutral that goes with it');
      add(pair('Trim & ceiling'), 'A white that goes with it');
      add(pair('Accent'), 'A bolder color that goes with it');
    } else {
      // front doors, shutters, cabinets, fireplaces: an accent, a deeper shade, and the classics
      add(pair('Accent'), 'An accent made to go with ' + c.name);
      add(pair('Deeper, same family'), 'A deeper shade of it');
      if (P.kind === 'cab') add(pair('Trim & ceiling'), 'A white that goes with it');
      [[labAt(20, 1, 250), 'Classic black'], [labAt(30, 3, 250), 'Classic charcoal'], [labAt(30, 20, 265), 'Classic navy'], [labAt(34, 16, 155), 'Classic deep green'], [labAt(38, 36, 30), 'Classic red']]
        .forEach(([lab, why]) => { if (out.length < 8) near(lab, why); });
    }
    return out.slice(0, 8);
  }
  let partPick = null;
  // ---- the color adjuster: step the color on a part lighter, deeper, warmer, cooler, softer or richer ----
  // Each button shows the real color it goes to (the nearest one in the brand a small step that way), so there's
  // no guessing; tapping again keeps going. Undo steps back one change at a time.
  const ADJ_WORDS = { lighter: 'Lighter', deeper: 'Deeper', warmer: 'Warmer', cooler: 'Cooler', softer: 'Softer', richer: 'Richer' };
  const ADJ_IC = { lighter: 'sun', deeper: 'moon', warmer: 'flame', cooler: 'snow', softer: 'drop', richer: 'dropFull' };
  const ADJ_END = { lighter: 'As light as it goes', deeper: 'As deep as it goes', warmer: 'As warm as it goes', cooler: 'As cool as it goes', softer: 'As soft as it goes', richer: 'No color to add' };
  const collOk = x => !(x.coll && settings.collections[x.brand + ':' + x.coll] === false);
  // the brand a plain color (not a paint color) steps through: the color being looked at, else the store's
  function adjBrand() {
    const idx = E.getIndex().byBrand, c = partPick.c, en = brandsEnabled();
    if (c && idx[c.brand]) return c.brand;
    if (settings.storeBrand && idx[settings.storeBrand]) return settings.storeBrand;
    return Object.keys(idx).find(b => en[b] && idx[b].length) || Object.keys(idx)[0];
  }
  // what's on the part now: its hex, and the brand color it is (if it is one)
  function partNow() {
    const pp = partPick, own = (state.parts[pp.key] || {})[pp.group];
    const hex = ((own && own.hex) || pp.baseHex || 'F2F1EC').toUpperCase();
    let color = own ? (own.id ? E.findColor(own.id) : null) : pp.isTarget ? pp.c : null;
    // the scene's own trim white or door color is usually a real color of the same brand: name it
    if (!color && !own && pp.c) color = (E.getIndex().byBrand[pp.c.brand] || []).find(x => x.hex.toUpperCase() === hex) || null;
    return { hex, color, own };
  }
  function adjSteps() {
    const n = partNow(), lab = n.color ? n.color.lab : C.hexToLab(n.hex), brand = n.color ? n.color.brand : adjBrand();
    const skip = new Set(n.color ? [n.color.id] : []), out = {};
    for (const d of E.ADJUST) out[d] = E.adjustStep(lab, brand, d, { skip, ok: collOk });
    return out;
  }
  function adjNowHtml() {
    const n = partNow(), pp = partPick, c = n.color;
    const mine = c && pp.c && c.id === pp.c.id;
    const note = mine ? 'The color you’re looking at' : `On the ${PARTS[pp.group].label.toLowerCase()} now`;
    return `<span class="adj-sw" ${swStyle(n.hex)}></span><span class="adj-tx"><em>${esc(note)}</em><b>${esc(c ? c.name : (n.own && n.own.name) || '#' + n.hex)}</b>${c ? `<small>${esc(brandName(c.brand))} ${esc(E.codeLabel(c))}</small>` : ''}</span><button type="button" class="btn small ghost adj-undo" data-adj-undo="1" aria-label="Undo"${pp.hist.length ? '' : ' disabled'}>${ic('undo', 18)}<span class="adj-undo-w">Undo</span></button>`;
  }
  // a brand color that isn't the one being looked at can go on the project, or be opened on its own
  function adjActHtml() {
    const c = partNow().color, pp = partPick;
    if (!c || (pp.c && c.id === pp.c.id)) return '';
    const on = session.items.some(x => x.ref === c.id);
    return (`<span class="adj-act"><button type="button" class="btn small" data-part-add="1">${on ? 'On Your Project' : 'Add to Project'}</button><button type="button" class="btn small ghost" data-go="color/${encodeURIComponent(c.id)}">See This Color</button></span>`);
  }
  function adjGridHtml() {
    const steps = partPick.steps = adjSteps();
    return E.ADJUST.map(d => {
      const x = steps[d];
      return `<button type="button" class="adj" data-adj="${d}"${x ? ` aria-label="${ADJ_WORDS[d]}: ${esc(x.name)}"` : ' disabled'}><span class="adj-to"${x ? ' ' + swStyle(x.hex) : ''}></span><span class="adj-w"><b>${ic(ADJ_IC[d], 18)}${ADJ_WORDS[d]}</b><small>${esc(x ? x.name : ADJ_END[d])}</small></span></button>`;
    }).join('');
  }
  // redraws the adjuster for the color on the part now (keeping the keyboard on the same button)
  function drawAdj() {
    if (!partPick) return;
    const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.adj : '';
    const now = $('#adjNow'); if (now) now.innerHTML = adjNowHtml();
    const grid = $('#adjGrid'); if (grid) grid.innerHTML = adjGridHtml();
    const act = $('#adjAct'); if (act) act.innerHTML = adjActHtml();
    const u = $('#modal [data-adj-undo]');
    const hex = partNow().hex;
    $$('#modal [data-part-i]').forEach(b => b.setAttribute('aria-pressed', String(partPick.choices[+b.dataset.partI].hex.toUpperCase() === hex)));
    if (COLORS.partColor) { COLORS.partColor.hex = hex; const pk = $('#partColor'); if (pk) { $('.sw', pk).style.background = '#' + hex; $('.mono', pk).textContent = '#' + hex; } }
    if (focus) { const b = $(`#modal [data-adj="${focus}"]`); if (b && !b.disabled) b.focus({ preventScroll: true }); else if (u && !u.disabled) u.focus({ preventScroll: true }); }
  }
  function openPart(id, group) {
    const L = live[id]; if (!L) return;
    furnPick = null;
    const spec = L.spec, sceneId = state.sceneFor[spec.key], key = partKey(spec), P = PARTS[group];
    const base = spec.roles(sceneId), c = spec.color || null;
    const baseHex = String(base[P.roles[0]] || '').toUpperCase();
    const isTarget = !!c && baseHex === c.hex.toUpperCase();
    // a roof or a floor isn't paint: pick the one that's really there
    const paint = !(P.kind === 'roof' || (P.kind === 'floor' && !isTarget));
    const choices = partChoices(group, c, isTarget);
    partPick = { id, key, group, choices, c, isTarget, baseHex, paint, hist: [], steps: {}, pickAt: 0 };
    const what = P.label.toLowerCase(), house = (SCN[sceneId] || {}).kind === 'house';
    const lead = !paint ? (P.kind === 'roof' ? 'What color is your roof? Tap the closest one, so you see the paint with it.' : 'What floor do you have? Tap the closest one, so you see the paint with it.')
      : `Make the ${what} a little lighter, deeper, warmer and more. Each button shows the color you’ll get.`;
    const listHead = !paint ? '' : c ? `Colors That Go With ${c.name}` : 'Other Colors';
    const list = choices.length ? `<section class="adj-sec">${listHead ? `<div class="adj-head"><h3>${esc(listHead)}</h3></div>` : ''}<div class="part-sws">${choices.map((x, i) => `<button type="button" class="part-sw" data-part-i="${i}" aria-pressed="false"><span class="psw" ${swStyle(x.hex)}></span><span class="ptx"><b>${esc(x.name)}</b>${x.code ? `<small>${esc(x.code)}</small>` : ''}${x.why ? `<em>${esc(x.why)}</em>` : ''}</span></button>`).join('')}</div></section>` : '';
    const light = settings.lightPreview ? `<section class="adj-sec"><div class="adj-head"><h3>${house ? 'Light on the House' : 'Light in the Room'}</h3><button type="button" class="link" data-light-open="${id}">More Light</button></div><p class="adj-note">${house ? 'Daytime, or the porch light’s bulbs at night.' : 'Pick the bulbs in the room. The number is on the bulb or its box.'}</p>${lightRowHtml(yourBulbs(id))}</section>` : '';
    openModal(P.label, `<p class="part-lead">${esc(lead)}</p>
      ${paint ? `<div class="adj-now" id="adjNow"></div>
      <div class="adj-grid" id="adjGrid" role="group" aria-label="Adjust the color"></div><div class="adj-acts" id="adjAct"></div>${light}${list}
      <div class="actions"><span class="muted">or any color:</span>${colorHtml('partColor', baseHex || 'F2F1EC', 'Pick any color', hex => { const recent = Date.now() - partPick.pickAt < 2500; partPick.pickAt = Date.now(); partSet({ hex: hex.toUpperCase(), name: '#' + hex.toUpperCase(), id: '' }, recent); })}</div>` : `${list}${light}`}
      <div class="modal-foot"><button type="button" class="btn big ghost" data-part-reset="1">Put It Back</button><span class="grow"></span><button type="button" class="btn big primary" data-modal-close="1">Done</button></div>`, peekFor(id));
    drawAdj();
  }
  // a change shows on every picture of the same color, rolled on like paint
  function refreshParts(key) {
    for (const k of Object.keys(live)) {
      const L = live[k]; if (partKey(L.spec) !== key) continue;
      const sceneId = state.sceneFor[L.spec.key];
      if (L.viewer && L.viewer.setLook) L.viewer.setLook({ roles: rolesFor(L.spec, sceneId), tex: L.spec.tex || null, texParts: L.spec.texParts || null }); else drawScene(k);
    }
  }
  // choice null puts the part back to the scene's own color; noHist doesn't add an Undo step (Undo itself, or the
  // any-color picker still being dragged)
  function partSet(choice, noHist) {
    if (!partPick) return;
    const own = Object.assign({}, state.parts[partPick.key]), was = own[partPick.group] || null;
    if (choice && was && was.hex.toUpperCase() === choice.hex.toUpperCase()) return;
    if (!noHist) partPick.hist.push(was);
    if (choice) own[partPick.group] = choice; else delete own[partPick.group];
    state.parts[partPick.key] = own;
    refreshParts(partPick.key);
    drawAdj();
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('#modal button'); if (!t || !partPick) return;
    if (t.dataset.partI != null) { const x = partPick.choices[+t.dataset.partI]; if (x) partSet({ hex: x.hex.toUpperCase(), name: x.name, id: x.id }); }
    if (t.dataset.adj) { const x = partPick.steps[t.dataset.adj]; if (x) partSet({ hex: x.hex.toUpperCase(), name: x.name, id: x.id }); }
    if (t.dataset.adjUndo && partPick.hist.length) partSet(partPick.hist.pop(), true);
    if (t.dataset.partAdd) {
      const c = partNow().color;
      if (c && !session.items.some(x => x.ref === c.id)) { addToList(Object.assign(paintItem(c), { area: PARTS[partPick.group].label, part: partPick.group, space: '' })); drawAdj(); }
    }
    if (t.dataset.partReset) {
      const own = state.parts[partPick.key]; if (own) delete own[partPick.group];
      refreshParts(partPick.key); partPick = null; closeModal(); toast('Put back');
    }
  });
  function onScenePick(id, what) {
    tapTried();
    if (what.stained) { toast('That shows the stain you’re looking at. Tap anything else to change its color.'); return; }
    if (what.part) { openFurniture(what, id); return; }
    // a lamp (or the porch light): pick the bulbs that are in the room
    if (what.role === 'shade' && settings.lightPreview) { openLight(id); return; }
    const group = PART_OF_ROLE[what.role];
    if (group) { openPart(id, group); return; }
    toast(NOT_PAINTED[what.role] || 'Tap the walls, trim, doors or furniture to change their color.');
  }
  // the first time: a note in the middle of the picture, until something is tapped (on a kiosk, for each shopper)
  let tapDone = !isKiosk() && !!store.get('tapTried', false);
  function tapTried() { if (tapDone) return; tapDone = true; if (!isKiosk()) store.set('tapTried', true); $$('.tap-coach').forEach(x => { x.classList.add('gone'); setTimeout(() => x.remove(), 400); }); }
  const tapIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 013 0V11"/><path d="M12 10V8.5a1.5 1.5 0 013 0V11"/><path d="M15 10.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-.6a6 6 0 01-4.7-2.3L4.4 16a1.5 1.5 0 012.3-1.9L9 16"/><path d="M5.3 6.5a5 5 0 016.7-3.6" opacity=".55"/></svg>';
  function showTapCoach(box) {
    if (tapDone || !box || $('.tap-coach', box)) return;
    const s = document.createElement('span'); s.className = 'tap-coach'; s.setAttribute('aria-hidden', 'true');
    s.innerHTML = `${tapIcon}Tap any part to change its color`;
    box.appendChild(s);
  }
  // every change shows right away on the room behind
  function furnSet(change) {
    if (!furnPick) return;
    Object.assign(furnPick.draft, change);
    state.furniture[furnPick.key] = Object.assign({}, furnPick.draft);
    applyFurniture();
    $$('#modal [data-furn-hex]').forEach(b => b.setAttribute('aria-pressed', b.dataset.furnHex === furnPick.draft.hex));
    $$('#modal [data-furn-finish]').forEach(b => b.setAttribute('aria-pressed', b.dataset.furnFinish === furnPick.draft.finish));
    if (change.hex && COLORS.furnColor) { COLORS.furnColor.hex = change.hex; const pk = $('#furnColor'); if (pk) { $('.sw', pk).style.background = '#' + change.hex; $('.mono', pk).textContent = '#' + change.hex; } }
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('#modal button'); if (!t || !furnPick) return;
    if (t.dataset.furnHex) furnSet({ hex: t.dataset.furnHex });
    if (t.dataset.furnFinish) furnSet({ finish: t.dataset.furnFinish });
    if (t.dataset.furnReset) { delete state.furniture[furnPick.key]; furnPick = null; applyFurniture(); closeModal(); toast('Back to the usual color'); }
  });

  // ---- Set Up the Room: windows (and in a kitchen the fridge and stove) where they really are ----
  const WALL_LABEL = { left: 'Left Wall', back: 'Back Wall', right: 'Right Wall' };
  let setupFor = null, setupDraft = null;
  function openRoomSetup(id) {
    const L = live[id]; if (!L) return;
    const sceneId = state.sceneFor[L.spec.key], kitchen = (SCN[sceneId] || {}).kind === 'kitchen';
    const v = L.viewer;
    const walls = v && v.walls && v.walls.length ? v.walls : kitchen ? ['left', 'right'] : ['left', 'back', 'right'];
    const cur = state.layout || {};
    setupFor = id;
    setupDraft = { wins: Array.isArray(cur.wins) ? cur.wins.slice() : (v && v.winWalls ? v.winWalls.slice() : walls.slice(0, 1)), fridge: cur.fridge || 'left', stove: cur.stove || cur.fridge || 'left' };
    const chips = (key, opts, on) => `<div class="chipset setup-chips">${opts.map(([val, label]) => `<button type="button" class="chip plain" data-setup-${key}="${val}" aria-pressed="${on(val)}">${label}</button>`).join('')}</div>`;
    openModal('Set Up the Room', `<p style="font-size:1.1rem">Put the windows${kitchen ? ', fridge and stove' : ''} where they really are, so the picture looks like the room at home.${R3().supported() ? ' To set the furniture to its real color and material, turn on 3D and tap it.' : ''}</p>
      <div class="setup-group"><h3>Windows</h3>${chips('win', walls.map(w => [w, WALL_LABEL[w]]), w => setupDraft.wins.includes(w))}<p class="muted small">Tap to add or take one away. None picked means no windows.${kitchen && walls.includes('back') ? ' A window on the back wall goes over the sink.' : ''}</p></div>
      ${kitchen ? `<div class="setup-group"><h3>Fridge</h3>${chips('fridge', [['left', 'On the Left'], ['right', 'On the Right']], x => setupDraft.fridge === x)}</div>
      <div class="setup-group"><h3>Stove</h3>${chips('stove', [['left', 'Left of the Sink'], ['right', 'Right of the Sink']], x => setupDraft.stove === x)}</div>` : ''}
      <div class="modal-foot"><button type="button" class="btn big ghost" data-setup-reset="1">Start Over</button><span class="grow"></span><button type="button" class="btn big primary" data-setup-done="1">Done</button></div>`);
  }
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-room-setup]'); if (open) { openRoomSetup(open.dataset.roomSetup); return; }
    const t = e.target.closest('#modal button'); if (!t || !setupDraft) return;
    const d = t.dataset;
    if (d.setupWin) { const i = setupDraft.wins.indexOf(d.setupWin); if (i >= 0) setupDraft.wins.splice(i, 1); else setupDraft.wins.push(d.setupWin); t.setAttribute('aria-pressed', i < 0); }
    if (d.setupFridge || d.setupStove) {
      const k = d.setupFridge ? 'fridge' : 'stove'; setupDraft[k] = d.setupFridge || d.setupStove;
      $$(`#modal [data-setup-${k}]`).forEach(b => b.setAttribute('aria-pressed', b === t));
    }
    if (d.setupDone || d.setupReset) {
      state.layout = d.setupDone ? setupDraft : null;
      if (d.setupReset) { state.furniture = {}; applyFurniture(); }
      setupDraft = null; closeModal();
      for (const k of Object.keys(live)) if (['room', 'kitchen'].includes((SCN[state.sceneFor[live[k].spec.key]] || {}).kind)) drawScene(k);
      toast(d.setupDone ? 'The room is set up' : 'Back to the standard room');
    }
  });
  function setTag(id, text) {
    const tag = $('#' + id + ' .scene-tag'); if (!tag) return;
    const t = text || LIGHT_SHORT[state.light] || '';
    tag.textContent = t; tag.hidden = !settings.lightPreview || !t;
  }
  // a new color (or stain) on the same scene: the 3D view rolls it on; the drawing repaints
  function recolorScene(id, spec) {
    const L = live[id]; if (!L) return;
    L.spec = Object.assign(L.spec, spec);
    const roles = L.spec.roles(state.sceneFor[L.spec.key]);
    if (L.viewer && L.viewer.setLook) { L.viewer.setLook({ roles, tex: L.spec.tex || null }); return; }
    if (L.spec.stain) { drawScene(id); return; }
    const pic = $('#' + id + ' .pic');
    pic.dataset.roles = JSON.stringify(roles);
    SC.paintScene(pic, state.light);
  }
  function relight(id) {
    const L = live[id]; if (!L) return;
    const b = document.getElementById(id + '-light'); if (b) { $('.v', b).textContent = lightLabel(state.light); b.setAttribute('aria-label', 'Light: ' + lightLabel(state.light)); }
    if (L.viewer && L.viewer.setLight) { L.viewer.setLight(state.light); setTag(id); return; }
    setTag(id, SC.paintScene($('#' + id + ' .pic'), state.light));
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-toggle3d]'); if (!t) return;
    settings.view3d = !settings.view3d; saveSettings();
    $$('[data-toggle3d]').forEach(b => b.setAttribute('aria-pressed', settings.view3d));
    for (const k of Object.keys(live)) drawScene(k);
    toast(settings.view3d ? 'Drag the picture to look around. Tap furniture to set its real color.' : '3D turned off');
  });

  // ================================================================
  // RESULTS: tap a color to see it in the room
  // ================================================================
  const PHRASE = { living: 'your living room', bedroom: 'your bedroom', kitchen: 'your kitchen', bathroom: 'your bathroom', dining: 'your dining room', office: 'your home office', kids: 'a kids’ room', nursery: 'a nursery', entry: 'your entry or hallway', stairs: 'your stairway', laundry: 'your laundry room', sunroom: 'your sunroom', garage: 'your garage', basement: 'your basement', accent: 'an accent wall', ceiling: 'your ceiling', trim: 'your trim', cabinets: 'your cabinets', furniture: 'your furniture', ext_body: 'your house', ext_trim: 'your outside trim', front_door: 'your front door', powder: 'your powder room', closet: 'your closet or pantry', attic: 'your attic room', media: 'your media room', doors: 'your doors', builtins: 'your built-ins', wainscot: 'your wainscoting', fireplace: 'your fireplace', floor_paint: 'your floor', shutters: 'your shutters', garage_door: 'your garage door', porch_floor: 'your porch floor', shed: 'your shed or barn' };
  const sheenName = id => (E.SHEENS.find(s => s.id === id) || {}).name || '';
  const lineBrandFor = c => (settings.storeBrand && E.PAINT_LINES[settings.storeBrand] ? settings.storeBrand : E.PAINT_LINES[c.brand] ? c.brand : null);
  function lineLabel(brand, line) { const bn = brandName(brand); return line.name.toLowerCase().startsWith(bn.split(/[ -]/)[0].toLowerCase()) ? line.name : `${bn} ${line.name}`; }
  function bestLine(c, answers) { const brand = lineBrandFor(c); if (!brand) return null; const r = E.recommendLines(brand, c, answers, { lines: settings.lines }); return r.best ? { brand, r } : null; }
  const sBrand = r => (r.kind === 'paint' ? brandName(r.brand) : S.brandName(r.brand));
  const sCode = r => (r.kind === 'paint' && r.item ? E.codeLabel(r.item) : r.item ? S.codeLabel(r.item) : r.code);
  const idOf = r => r.id || (r.color && r.color.id);

  // the answers in one line; tap one to change it
  function answerChips(kind) {
    const a = flowOf(kind).a, list = flowSteps(kind), out = [];
    const add = (id, label) => { const i = list.indexOf(id); if (i >= 0 && label) out.push([i, label]); };
    if (kind === 'stain') {
      add('target', (S.JOBS[a.target] || {}).label);
      add('wood', spLabel(S.woodFor(a)) + (a.condition !== 'bare' ? ', ' + S.CONDITION[a.condition].toLowerCase() : ''));
      add('slook', a.looks.length ? a.looks.map(k => S.LOOKS[k].label).join(' + ') : 'Popular looks');
      add('grain', a.grain === 'hide' ? 'Solid color' : 'Grain shows');
      return out;
    }
    const sp = E.SPACES[a.space] || E.SPACES.living;
    add('space', sp.label + (a.space === 'ext_body' ? ', ' + E.SIDING[a.siding] : ''));
    if (kind === 'buy') {
      add('surface', E.SURFACES[a.surface]);
      add('texture', (T.TEXTURES[a.texture] || {}).label);
      add('issues', (a.issues || []).length || a.flaws ? (a.issues || []).map(k => E.ISSUES[k]).concat(a.flaws ? ['Dents or patches'] : []).join(', ') : 'Looks fine');
      add('going', a.going ? T.GOING[a.going].label : 'Color not picked');
      add('kids', a.kids ? 'Kids or pets' : a.kids === false ? 'No kids or pets' : '');
      add('priority', (T.PRIORITIES[a.priority] || {}).label);
      add('amount', ((T.SIZES[T.sizeKind({ kind: 'paint', space: a.space })] || {})[a.amountSize] || {}).label);
      return out;
    }
    add('size', { small: 'Small room', medium: 'Medium room', large: 'Large room' }[a.size]);
    add('who', ((E.WHO_FOR[a.space] || {})[a.forWho] || {}).label);
    const fs = E.facingsOf(a);
    add('windows', E.noWindows(a) ? 'No windows' : fs.length ? fs.map(d => E.FACING[d]).join(' + ') + ' light' : 'Any light');
    add('daylight', sp.kind === 'exterior' ? { low: 'Mostly shade', medium: 'Some sun', high: 'Full sun' }[a.amount] : { low: 'Not much daylight', medium: 'Some daylight', high: 'Lots of daylight' }[a.amount]);
    add('style', a.styles.length ? a.styles.map(s => E.STYLES[s].label).join(' + ') : 'Any style');
    const wt = E.WHITE_TYPES[sp.surface];
    add('colors', wt ? (a.whiteType ? wt[a.whiteType] : 'Popular whites') : a.families.length ? a.families.map(f => E.FAMILY_CHOICES[f]).join(', ') : 'Any color');
    return out;
  }
  const chipsLine = kind => `<div class="answers-line" aria-label="Your answers">${answerChips(kind).map(([i, l]) => `<button type="button" data-go="${kind}/${i}" aria-label="Change: ${esc(l)}">${esc(l)}</button>`).join('')}</div>`;

  function ensureResults(kind) {
    if (state.results[kind]) return state.results[kind];
    if (!state.flows[kind]) return null;
    const a = flowOf(kind).a;
    if (kind === 'paint') { state.results.paint = E.recommend(a, engineSettings()); state.light = E.lightForAnswers(a); }
    if (kind === 'stain') state.results.stain = S.recommend(a, stainSettings());
    if (kind === 'buy') state.results.buy = buyPlan(a);
    return state.results[kind];
  }
  function renderResults(kind) {
    const R = ensureResults(kind);
    if (!R) { go('', { replace: true }); return; }
    if (kind === 'buy') { renderPlan(R); return; }
    const stain = kind === 'stain';
    const list = R.results;
    if (!list.length) {
      view().innerHTML = `<div class="page">${backBtn()}<div class="empty"><h1>No ${stain ? 'stains' : 'colors'} to show</h1><p class="muted">${stain ? 'Try another look, or turn on more stain brands in Settings.' : 'Try fewer color choices, or turn on more brands in Settings.'}</p><div class="actions"><button type="button" class="btn primary big" data-go="${kind}/0">Change My Answers</button><button type="button" class="btn big" data-go="settings">Open Settings</button></div></div></div>`;
      return;
    }
    if (!list.some(r => idOf(r) === state.pick[kind])) state.pick[kind] = idOf(list[0]);
    const a = R.answers;
    const title = stain ? `Stains for ${spLabel(R.wood).toLowerCase()} ${(S.JOBS[a.target] || {}).label.toLowerCase()}` : `Colors for ${PHRASE[a.space] || 'your room'}`;
    const tips = stain ? R.tips : withPaintTips(R);
    view().innerHTML = `<div class="results">
      ${backBtn('Change Answers')}
      <div class="results-head"><p class="eyebrow">${stain ? `${list.length} stains, shown on real ${esc(spLabel(R.wood).toLowerCase())}` : `${list.length} colors picked from ${fmt(R.poolSize)}`}</p><h1>${esc(title)}</h1>${chipsLine(kind)}</div>
      ${(R.notices || []).map(w => `<div class="warn ${w.level === 'heads-up' ? 'headsup' : ''}"><b>${esc(w.title)}</b><span>${esc(w.text)}</span></div>`).join('')}
      ${R.guide ? '<div class="warn headsup"><b>Tone guides for outdoor stain</b><span>These Minwax tones show the look on your wood. Match the one you like on the store’s exterior stain card.</span></div>' : ''}
      <div class="res-grid">
        <div class="res-scene">${sceneBox('resScene')}</div>
        <div class="res-side">
          <div class="section"><h2>Tap a ${stain ? 'stain' : 'color'} to see it</h2><div class="picks" id="picks">${list.map((r, i) => pickCard(kind, R, r, i)).join('')}</div>${list.length > 2 ? '<p class="swipe-hint muted">Swipe for more →</p>' : ''}</div>
          <div class="chosen" id="chosen"></div>
          <div class="actions">${list.length > 1 ? `<button type="button" class="btn big" data-duel="${kind}">${ic('sparkle', 22)}Help Me Pick One</button>` : ''}<button type="button" class="btn big ghost" data-restart="${kind}">Start Over</button></div>
        </div>
      </div>
      ${stain ? '' : samplePlanHtml(list.map(x => x.color))}
      ${tips.length || (stain && R.products.length) ? `<section class="section" aria-labelledby="gtk"><h2 id="gtk">Good to Know</h2><div class="home-tips">${(stain ? R.products.slice(0, 3).map(p => ({ title: p.name, text: p.why })) : []).concat(tips).slice(0, 6).map(t => `<div class="tipcard"><b>${esc(t.title)}</b><span>${esc(t.text)}</span></div>`).join('')}</div></section>` : ''}
    </div>`;
    SC.paintWoods(view(), 'none');
    fillChosen(kind);
    const cur = list.find(r => idOf(r) === state.pick[kind]);
    mountScene('resScene', stain ? stainSceneSpec(R, cur) : paintSceneSpec(cur.color, a, true));
  }
  function withPaintTips(R) {
    const tips = R.tips.slice();
    const top = R.results[0] && R.results[0].color;
    const p = top && bestLine(top, R.answers);
    if (p) tips.unshift({ title: 'Paint to Use', text: `${lineLabel(p.brand, p.r.best.line)}. ${p.r.best.why[0] ? p.r.best.why[0] + '.' : p.r.best.line.note}` });
    return tips;
  }
  function pickCard(kind, R, r, i) {
    const id = idOf(r), on = id === state.pick[kind];
    const flag = '';
    if (kind === 'stain') return `<button type="button" class="pick" data-pick="${esc(id)}" aria-pressed="${on}"><span class="sw">${SC.woodCv({ sp: R.wood, stain: stainSpec(r), split: 0.3, w: 360, h: 190, cm: 0.2, seed: 7 + (i % 3), sheen: 0.5, label: `${r.name} on ${spLabel(R.wood)}` })}${flag}${state.duelPick === id ? '<span class="yours">Your Pick</span>' : ''}</span><span class="txt"><span class="role">${esc(r.role || '')}</span><span class="nm">${esc(r.name)}</span><span class="cd">${esc(sBrand(r))} ${esc(sCode(r) === S.TYPES[r.type] ? '' : sCode(r))}</span></span></button>`;
    const c = r.color;
    return `<button type="button" class="pick" data-pick="${esc(id)}" aria-pressed="${on}"><span class="sw" ${swStyle(c.hex)}>${flag}${state.duelPick === id ? '<span class="yours">Your Pick</span>' : ''}</span><span class="txt"><span class="role">${esc(r.role || '')}</span><span class="nm">${esc(c.name)}</span><span class="cd">${esc(brandName(c.brand))} ${esc(E.codeLabel(c))}</span></span></button>`;
  }
  function fillChosen(kind) {
    const R = state.results[kind], el = $('#chosen'); if (!R || !el) return;
    const r = R.results.find(x => idOf(x) === state.pick[kind]) || R.results[0];
    const id = idOf(r), onList = session.items.some(x => x.ref === id);
    const stain = kind === 'stain';
    const name = stain ? r.name : r.color.name, meta = stain ? `${sBrand(r)} ${sCode(r) === S.TYPES[r.type] ? '' : sCode(r)} · ${S.TYPES[r.type] || 'Stain'}` : `${brandName(r.color.brand)} ${E.codeLabel(r.color)}${settings.showLrv ? ` · LRV ${r.color.lrv}` : ''}`;
    const reasons = (r.reasons || []).slice(0, 3);
    const warns = settings.showWarnings ? (r.warnings || []) : [];
    el.innerHTML = `<div class="chosen-top"><span class="chosen-sw"${stain ? '' : ' ' + swStyle(r.color.hex)}>${stain ? SC.woodCv({ sp: R.wood, stain: stainSpec(r), w: 160, h: 160, cm: 0.2, seed: 3, sheen: 0.5, label: name }) : ''}</span><div><h2>${esc(name)}</h2><p class="meta">${esc(meta)}</p></div></div>
      ${reasons.length ? `<ul class="why">${reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${warns.length ? `<p class="muted">${warns.length === 1 ? 'There’s 1 thing to know' : `There are ${warns.length} things to know`} about it. See Everything to read ${warns.length === 1 ? 'it' : 'them'}.</p>` : ''}
      <div class="actions stack"><button type="button" class="btn big primary${onList ? ' done' : ''}" data-add="${esc(id)}">${onList ? checkIcon + ' In Project' : plusIcon + ' Add to Project'}</button><button type="button" class="btn big" data-go="color/${esc(encodeURIComponent(id))}">See Everything${chev('right')}</button></div>`;
    if (stain) SC.paintWoods(el, 'none');
  }
  view().addEventListener('click', e => {
    if (state.view !== 'results') return;
    const t = e.target.closest('button'); if (!t) return;
    const kind = current.kind;
    if (t.dataset.pick) {
      state.pick[kind] = t.dataset.pick;
      $$('#picks .pick').forEach(b => b.setAttribute('aria-pressed', b.dataset.pick === t.dataset.pick));
      fillChosen(kind);
      const R = state.results[kind], r = R.results.find(x => idOf(x) === t.dataset.pick);
      recolorScene('resScene', kind === 'stain' ? stainSceneSpec(R, r) : paintSceneSpec(r.color, R.answers, true));
      if (window.matchMedia('(max-width: 999px)').matches) { const sc = $('#resScene'); const top = sc.getBoundingClientRect().top; if (top < 0 || top > window.innerHeight * 0.5) sc.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); }
      return;
    }
    if (t.dataset.duel) { openDuel(t.dataset.duel); return; }
    if (t.dataset.restart) { startFlow(t.dataset.restart); return; }
  });
  function paintSceneSpec(c, answers, fromResults) {
    const pairs = E.pairings(c, { collections: settings.collections });
    const ids = answers ? paintScenes(answers.space) : ['living', 'bedroom', 'kitchen', 'bath', 'dining', 'office', 'entry', 'house', 'colonial'];
    return { key: answers ? 'paint:' + answers.space : 'paint:any', ids, answers: answers || null, label: c.name, color: c, roles: sid => paintRoles(sid, c, answers, pairs), stain: false };
  }
  function stainSceneSpec(R, r) {
    const a = R.answers;
    const tex = { sp: R.wood, stain: stainSpec(r) };
    return { key: 'stain:' + a.target, ids: STAIN_SCENES[a.target] || ['living'], answers: a, label: r.name, tex, stain: true, roles: () => Object.assign({}, STAIN_ROLES, { floor: (S.JOBS[a.target] || {}).scene === 'cabinets' ? 'D3CFC7' : 'A98661' }, state.wallPaint || {}) };
  }

  // ---------------- Help Me Pick One: this or that ----------------
  function openDuel(kind) {
    const R = state.results[kind]; if (!R || R.results.length < 2) return;
    state.duel = { kind, queue: R.results.slice(), total: R.results.length - 1, round: 1 };
    drawDuel();
  }
  function drawDuel() {
    const d = state.duel, R = state.results[d.kind];
    const pair = d.queue.slice(0, 2), stain = d.kind === 'stain';
    const opt = (x, i) => stain
      ? `<button type="button" class="duel-opt" data-duel-pick="${esc(idOf(x))}"><span class="sw">${SC.woodCv({ sp: R.wood, stain: stainSpec(x), w: 480, h: 300, cm: 0.18, seed: 7 + i, sheen: 0.5, label: x.name })}</span><span class="txt"><b>${esc(x.name)}</b><span class="muted">${esc(sBrand(x))}</span></span></button>`
      : `<button type="button" class="duel-opt" data-duel-pick="${esc(idOf(x))}"><span class="sw" ${swStyle(x.color.hex, state.light)}></span><span class="txt"><b>${esc(x.color.name)}</b><span class="muted">${esc(brandName(x.color.brand))} ${esc(E.codeLabel(x.color))}</span></span></button>`;
    openModal('Which do you like better?', `<p class="muted" style="font-size:1.05rem">Round ${d.round} of ${d.total}. Tap the one you like more. The winner moves on.</p>
      <div class="duel">${opt(pair[0], 0)}<span class="duel-or">or</span>${opt(pair[1], 1)}</div>`, { wide: true });
    SC.paintWoods($('#modal'), 'none');
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-duel-pick]'); if (!t || !state.duel) return;
    const d = state.duel;
    const win = d.queue.slice(0, 2).find(r => idOf(r) === t.dataset.duelPick); if (!win) return;
    d.queue = d.queue.slice(2).concat([win]); d.round++;
    if (d.queue.length > 1) { drawDuel(); return; }
    closeModal();
    state.pick[d.kind] = idOf(win); state.duelPick = idOf(win); state.duel = null;
    const name = win.color ? win.color.name : win.name;
    if (state.view === 'results') renderResults(d.kind);
    toast(`Your pick: ${name}`);
  });

  // ================================================================
  // THE COLOR PAGE: everything about one color, and what to buy for it
  // ================================================================
  function useLabel(c) { const i = c.flags & E.F.INT, x = c.flags & E.F.EXT; return i && x ? 'Inside and outside' : i ? 'Inside only' : x ? 'Outside only' : 'Not listed by the brand'; }
  function sampleNote(c) {
    if (!settings.inStoreSamples) return '<div class="sample-note">Get a sample and look at it on two walls, in the morning and at night.</div>';
    const loc = (c.flags & E.F.RACK) && c.extra && ['sw', 'valspar', 'hgsw'].includes(c.brand) ? c.extra : '';
    if (loc) return `<div class="sample-note"><span class="loc">${esc(loc)}</span><div>Find the chip at this spot on the color display.</div></div>`;
    if (c.flags & E.F.RACK) return '<div class="sample-note"><span class="loc">Rack</span><div>On the color chip display in the store.</div></div>';
    if (['sw', 'valspar', 'hgsw', 'behr'].includes(c.brand)) return '<div class="sample-note">Not on the chip display. The paint desk can mix a sample.</div>';
    return `<div class="sample-note">Look for it in the ${esc(brandName(c.brand))} chip display or fan deck, or have a sample mixed.</div>`;
  }
  const lrvWords = lrv => lrv >= 80 ? 'Very light: bounces back most of the light' : lrv >= 60 ? 'Light: keeps a room bright' : lrv >= 40 ? 'Medium-light' : lrv >= 25 ? 'Medium: a room will feel a little darker' : lrv >= 10 ? 'Dark: cozy and dramatic' : 'Very dark: soaks up light';
  function needRow(icon, k, title, text, extra) { return `<div class="need-row"><span class="need-ic">${ic(icon, 30)}</span><div><span class="k">${esc(k)}</span><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}${extra || ''}</div></div>`; }
  function toolRows(tools) {
    let h = '';
    if (tools.roller) h += needRow('roller', 'Roller', `${tools.roller.width} roller, ${tools.roller.nap} nap`, `${tools.roller.cover}. ${tools.roller.why}${tools.roller.pole ? ' Use an extension pole.' : ''}`);
    if (tools.brush) h += needRow('brush', 'Brush', `${tools.brush.size} ${tools.brush.shape.toLowerCase()} brush`, `${tools.brush.fiber}. ${tools.brush.why}`);
    for (const o of tools.other) h += needRow('swatch', 'Also handy', o.name, o.why);
    return h;
  }
  // a likely "what color is it going to be" for a paint color, for the shopping list
  const goingOf = c => c.C > 45 && c.L < 70 ? 'bright' : c.lrv >= 60 ? 'light' : c.lrv >= 22 ? 'mid' : 'dark';

  function renderColor(rawId) {
    const id = rawId;
    const inStainResults = state.results.stain && state.results.stain.results.concat(state.results.stain.finalists || []).some(r => r.id === id);
    if (inStainResults || (!E.findColor(id) && S.find(id))) { renderStainColor(id); return; }
    const c = E.findColor(id);
    if (!c) { view().innerHTML = `<div class="page">${backBtn()}<div class="empty"><h1>Color not found</h1><p class="muted">It may be from a brand that’s turned off.</p><button type="button" class="btn primary big" data-go="lookup">Look Up a Color</button></div></div>`; return; }
    const R = state.results.paint;
    const res = R && R.results.concat(R.finalists || []).find(r => r.color.id === c.id);
    const answers = res ? R.answers : null;
    const a = answers || Object.assign({}, E.DEFAULT_ANSWERS);
    const sp = E.SPACES[a.space] || E.SPACES.living;
    const b = E.getIndex().brandById[c.brand] || {};
    const d = C.describe(c.hex, c.lrv);
    const warnings = settings.showWarnings ? (res ? res.warnings : answers ? E.warningsFor(c, a) : []) : [];
    const pairs = E.pairings(c, { collections: settings.collections });
    const matches = settings.showMatches ? E.matchesFor(c, { brands: brandsEnabled(), showDiscontinued: settings.showDiscontinued, collections: settings.collections }).slice(0, 8) : [];
    const onList = session.items.some(x => x.ref === c.id);
    const pl = bestLine(c, a);
    const pr = E.primerFor(a, c, engineSettings());
    const job = { kind: 'paint', space: a.space, siding: a.siding, sheen: sp.sheens[0] };
    const tools = T.applicators(job);
    const amt = T.amount(job, a.size || 'medium', pr.coats);
    const pc = E.prosCons(c, a, { inStoreSamples: settings.inStoreSamples }, res ? R.results.map(r => r.color) : null);
    view().innerHTML = `<div class="detail">
      ${backBtn()}
      <div class="detail-hero">
        <div>${sceneBox('colorScene')}</div>
        <div class="id-card">
          <div class="id-top"><button type="button" class="id-sw" ${swStyle(c.hex)} data-fullscreen="${esc(c.id)}" aria-label="Show ${esc(c.name)} full screen"><span class="id-sw-hint" aria-hidden="true">${expandIcon(16)}</span></button><div><h1>${esc(c.name)}</h1><p class="meta">${esc(b.name || c.brand)} · <span class="mono">${esc(E.codeLabel(c))}</span></p></div></div>
          <div class="badges">${popBadge(c)}<span class="badge">${esc(d.familyName)}</span><span class="badge">${esc(d.undertone === 'neutral' ? 'True neutral' : cap(d.undertone) + ' undertone')}</span>${c.flags & E.F.DISC ? '<span class="badge">Discontinued</span>' : ''}</div>
          ${popWhyLine(c)}
          ${settings.showLrv ? `<div class="lrv-box"><div class="lrv-top"><span>Light Reflectance (LRV)</span><span class="mono">${c.lrv} of 100</span></div><div class="lrv-bar"><i style="left:${Math.max(0, Math.min(100, c.lrv))}%"></i></div><p>${esc(lrvWords(c.lrv))}.</p></div>` : ''}
          <div class="actions stack"><button type="button" class="btn big primary${onList ? ' done' : ''}" data-add="${esc(c.id)}">${onList ? checkIcon + ' In Project' : plusIcon + ' Add to Project'}</button><button type="button" class="btn big" data-sample-one="${esc(c.id)}">${ic('swatch', 22)}Add a Sample</button><button type="button" class="btn big" data-copy="${esc(`${c.name}, ${b.name} ${E.codeLabel(c)}`)}">Copy Name &amp; Code</button></div>
          ${sampleNote(c)}
        </div>
      </div>
      <div class="blocks">
        ${res && res.reasons.length ? `<div class="block"><h2><span class="ic">${ic('ok', 24)}</span>Why It Fits</h2><ul class="why">${res.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${warnings.length ? `<div class="block"><h2><span class="ic">${ic('unsure', 24)}</span>Things to Know</h2><div class="warns">${warnings.map(w => `<div class="warn ${w.level === 'heads-up' ? 'headsup' : ''}"><b>${esc(w.title)}</b><span>${esc(w.text)}</span></div>`).join('')}</div></div>` : ''}
        <div class="block wide"><h2><span class="ic">${ic('can', 24)}</span>What You’ll Need${answers ? ` for ${esc(PHRASE[a.space] || 'it')}` : ''}</h2><div class="need">
          ${pl ? needRow('can', 'Paint', lineLabel(pl.brand, pl.r.best.line), `${E.TIERS[pl.r.best.line.tier]} quality. ${pl.r.best.why[0] ? pl.r.best.why[0] + '.' : pl.r.best.line.note}${pl.brand !== c.brand ? ` The paint desk can mix ${c.name} in it.` : ''}`) : needRow('can', 'Paint', `${brandName(c.brand)} paint`, settings.storeBrand ? '' : 'Set a store brand in Settings to see which paint to mix it in.')}
          ${needRow('sparkle', 'Finish', sp.sheen, 'How shiny the paint dries.', `<div class="alts"><button type="button" class="btn small" data-sheens="${esc(c.id)}">Compare the Finishes</button></div>`)}
          ${needRow('drywall', 'Primer', pr.title, `${pr.why} Plan on ${pr.coats} coats of paint.${pr.products[0] ? ' Try ' + pr.products[0].name + '.' : ''}`)}
          ${toolRows(tools)}
          ${needRow('list', 'How much', amt.buy, `${amt.what}, ${amt.coats} coats. Buy it all at once so the color matches.`)}
        </div><div class="actions"><button type="button" class="btn big" data-plan-for="${esc(c.id)}">${ic('list', 22)}See the Full Shopping List</button></div></div>
        ${pairs.length ? `<div class="block"><h2><span class="ic">${ic('swatch', 24)}</span>Goes Well With</h2><div class="pairs">${pairs.map(p => `<button type="button" class="pair" data-go="color/${esc(encodeURIComponent(p.color.id))}"><span class="sw" ${swStyle(p.color.hex)}></span><span class="txt"><span class="role">${esc(p.role)}</span><span class="nm">${esc(p.color.name)}</span><span class="cd">${esc(brandName(p.color.brand))} ${esc(E.codeLabel(p.color))}</span></span></button>`).join('')}</div></div>` : ''}
        ${settings.showMatches ? `<div class="block"><h2><span class="ic">${ic('search', 24)}</span>Same Color in Other Brands</h2>${matches.length ? `<div class="rows">${matches.map(m => colorRow(m.color, m.dE)).join('')}</div><p class="muted small">Closest by measured color difference (ΔE). Under 2 is very hard to tell apart.</p>` : '<p class="muted">Turn on more brands in Settings to see matches.</p>'}</div>` : ''}
        <div class="block wide"><details class="more"><summary>More Details</summary><div style="display:grid;gap:16px">
          <div class="facts"><div class="fact"><span class="k">Screen color</span><span class="v mono">#${c.hex}</span></div><div class="fact"><span class="k">Use</span><span class="v">${esc(useLabel(c))}</span></div><div class="fact"><span class="k">Depth</span><span class="v">${esc(d.depth)}</span></div><div class="fact"><span class="k">${['sw', 'valspar', 'hgsw'].includes(c.brand) && c.extra ? 'Chip spot' : 'Collection'}</span><span class="v">${esc(['sw', 'valspar', 'hgsw'].includes(c.brand) ? (c.extra || '—') : (E.collectionLabel(c) || c.extra || '—'))}</span></div></div>
          <div class="pc-grid"><div class="pc pros"><b>Good things</b><ul>${pc.pros.map(x => `<li>${esc(x)}</li>`).join('') || '<li>Nothing stands out</li>'}</ul></div><div class="pc cons"><b>Watch out for</b><ul>${pc.cons.map(x => `<li>${esc(x)}</li>`).join('') || '<li>No problems found for this job</li>'}</ul></div></div>
          <p class="muted small">${esc(d.summary)}.${b.mixNote ? ' ' + esc(b.mixNote) : ''} Source: ${esc(b.source || 'brand data')}${b.date ? `, collected ${esc(b.date)}` : ''}. Screen colors are the brand’s own digital values. Check a real chip before buying.</p>
        </div></details></div>
      </div>
    </div>`;
    mountScene('colorScene', paintSceneSpec(c, answers, !!res));
  }
  // ---------- the brands' own popular colors (data/popular.js, looked up on their websites every week) ----------
  const popDate = iso => { const d = iso ? new Date(iso + 'T12:00:00') : null; return d && !isNaN(d) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
  const andList = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a.join('');
  function popBadge(c) {
    const why = E.popularWhy(c);
    if (!why.length) return '';
    const coty = why.find(x => x.coty);
    return `<span class="badge good">${coty ? esc(coty.coty + ' Color of the Year') : 'Popular'}</span>`;
  }
  function popWhyLine(c) {
    const why = E.popularWhy(c);
    return why.length ? `<p class="pop-why">${ic('star', 18)}<span>${why.map(x => esc(x.text)).join('<br>')}</span></p>` : '';
  }
  function popNote() {
    const info = E.popularInfo();
    return 'Each paint company’s own Color of the Year and most popular colors, looked up on their websites every week. ' + (info.checked ? `Last checked ${popDate(info.checked)}.` : 'Not loaded yet.');
  }
  function popularLookup(brands) {
    const opts = { brands, collections: settings.collections };
    const coty = E.colorsOfYear(opts);
    const popular = E.popularList(Object.assign({ limit: 40 }, opts));
    const info = E.popularInfo();
    const none = E.getIndex().brands.filter(b => brands[b.id] !== false && b.group !== 'standard' && b.group !== 'custom' && !info.brands.includes(b.id)).map(b => b.name);
    let h = '';
    if (coty.length) h += `<h2>Colors of the Year</h2><div class="rows">${coty.map(x => colorRow(x.color, null, String(x.year))).join('')}</div>`;
    if (popular.length) h += `<h2>Popular Right Now</h2><div class="rows">${popular.map(c => colorRow(c)).join('')}</div>`;
    if (!h) h = '<h2>Popular Colors</h2><p class="muted">The brands’ popular colors couldn’t be loaded. Type a color name or number above.</p>';
    h += `<p class="muted small pop-note">${info.checked ? `From each paint company’s own website, checked ${esc(popDate(info.checked))}.` : ''}${none.length ? ` Nothing posted where the app can read it yet for ${esc(andList(none))}.` : ''}</p>`;
    return h;
  }
  const stainRow = (s, dE) => `<button type="button" class="row" data-go="color/${esc(encodeURIComponent(s.id))}"><span class="sw" ${swStyle(s.hex)}></span><span><span class="nm">${esc(s.name)}</span><span class="sub">${esc([S.brandName(s.brand), S.codeLabel(s) === S.TYPES[s.type] ? '' : S.codeLabel(s), S.TYPES[s.type] + ' stain'].filter(Boolean).join(' · '))}</span></span><span class="end">${dE != null ? `<span class="badge${dE < 2.5 ? ' good' : ''}">${esc(C.matchLabel(dE))}</span><span class="mono">ΔE ${dE}</span>` : '<span class="badge">Stain</span>'}</span></button>`;
  const colorRow = (c, dE, tag) => `<button type="button" class="row" data-go="color/${esc(encodeURIComponent(c.id))}"><span class="sw" ${swStyle(c.hex)}></span><span><span class="nm">${esc(c.name)}</span><span class="sub">${esc(brandName(c.brand))} · <span class="mono">${esc(E.codeLabel(c))}</span>${c.flags & E.F.DISC ? ' · discontinued' : ''}</span></span><span class="end">${tag ? `<span class="badge good">${esc(tag)}</span>` : dE != null ? `<span class="badge${dE < 2.5 ? ' good' : ''}">${esc(C.matchLabel(dE))}</span><span class="mono">ΔE ${dE}</span>` : settings.showLrv ? `<span class="mono">LRV ${c.lrv}</span>` : ''}</span></button>`;
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-plan-for]'); if (!t) return;
    const c = E.findColor(t.dataset.planFor); if (!c) return;
    const R = state.results.paint;
    const res = R && R.results.concat(R.finalists || []).find(r => r.color.id === c.id);
    const a0 = res ? R.answers : E.DEFAULT_ANSWERS;
    const sp = E.SPACES[a0.space] || E.SPACES.living;
    const preset = { space: a0.space, siding: a0.siding, surface: E.surfacesFor(a0.space)[0], issues: [], going: goingOf(c), kids: sp.kid || sp.busy ? true : false, priority: 'balanced', amountSize: a0.size || 'medium', color: c.id };
    const f = { a: Object.assign(freshAnswers('buy'), preset) };
    f.a.where = groupOf(f.a.space); f.a._picked = { where: true, space: true, surface: true, going: true, texture: true };
    state.flows.buy = f; state.results.buy = buyPlan(f.a);
    go('buy/results');
  });

  // ---------------- a stain's page ----------------
  function stainResultFor(id) {
    const R0 = state.results.stain;
    if (R0) { const r = R0.results.concat(R0.finalists || []).find(x => x.id === id); if (r) return { R: R0, r }; }
    const item = S.find(id); if (!item) return null;
    const a = Object.assign({}, S.DEFAULT, state.flows.stain ? state.flows.stain.a : item.use === 'exterior' ? { inout: 'exterior', target: 'deck' } : {});
    const base = S.recommend(Object.assign({}, a, { looks: ['natural'] }), Object.assign(stainSettings(), { resultCount: 1 }));
    const st = { hex: item.hex, type: item.type, solid: a.grain === 'hide', solidHex: item.solidHex };
    const predicted = WD.predictHex(base.wood, st);
    const r = { id, kind: 'stain', item, name: item.name, brand: item.brand, code: item.code, hex: item.hex, solidHex: item.solidHex, type: item.type, predicted, role: 'Stain', look: '', warnings: S.warningsFor(item, a, predicted), solid: a.grain === 'hide' };
    return { R: Object.assign({}, base, { results: [r] }), r };
  }
  // paint colors that go with a stain; tapping one paints the walls in the picture
  const PAINT_SPACE = { floors: 'living', stairs: 'entry', cabinets: 'kitchen', furniture: 'living', tabletop: 'kitchen', trim: 'living', doors: 'living', paneling: 'living', builtins: 'living', deck: 'ext_body', fence: 'ext_body', siding: 'ext_trim', outdoor: 'ext_body', pergola: 'ext_body', front_door: 'ext_body', garage_door: 'ext_body', shutters: 'ext_body', shed: 'ext_trim', log: 'ext_trim', playset: 'ext_body', dock: 'ext_body' };
  function stainPaints(R, r) {
    const lab = C.hexToLab(r.predicted), lch = C.labToLch(lab), warm = C.temperature(lch[1], lch[2], lab[0]) === 'warm';
    const space = PAINT_SPACE[R.answers.target] || 'living';
    const families = warm ? ['white', 'warm-neutral', 'green'] : ['white', 'cool-neutral', 'blue'];
    const res = E.recommend(Object.assign({}, E.DEFAULT_ANSWERS, { space, depth: 'any', families }), Object.assign({}, engineSettings(), { resultCount: 18 })).results.map(x => x.color);
    const fits = res.filter(c => C.deltaE2000(c.lab, lab) > 18);
    const out = [];
    for (const c of fits) { if (out.length >= 4) break; if (!out.some(o => C.deltaE2000(o.lab, c.lab) < 8)) out.push(c); }
    return out;
  }
  function renderStainColor(id) {
    const x = stainResultFor(id);
    if (!x) { view().innerHTML = `<div class="page">${backBtn()}<div class="empty"><h1>Stain not found</h1></div></div>`; return; }
    const { R, r } = x, a = R.answers, sp = R.wood, job = S.JOBS[a.target] || S.JOBS.floors;
    const st = stainSpec(r);
    const onList = session.items.some(i => i.ref === r.id);
    const others = S.onOtherWoods({ hex: r.hex, type: st.type, solidHex: r.solidHex, kind: r.kind, ref: st.ref, refMix: st.refMix }, a, ['red_oak', 'white_oak', 'pine', 'maple', 'cherry', 'cedar'].filter(k => k !== sp).slice(0, 5));
    const plan = T.stainPlan(Object.assign({}, a), R.products);
    const paints = stainPaints(R, r);
    state.wallPaint = null;
    view().innerHTML = `<div class="detail">
      ${backBtn()}
      <div class="detail-hero">
        <div>${sceneBox('colorScene')}</div>
        <div class="id-card">
          <div class="id-top"><span class="id-sw">${SC.woodCv({ sp, stain: st, w: 200, h: 200, cm: 0.2, seed: 3, sheen: 0.5, label: r.name })}</span><div><h1>${esc(r.name)}</h1><p class="meta">${esc(sBrand(r))} ${esc(sCode(r) === S.TYPES[r.type] ? '' : sCode(r))}</p></div></div>
          <div class="badges"><span class="badge">${r.kind === 'paint' ? 'Solid stain' : esc(S.TYPES[r.type] || 'Stain')}</span><span class="badge">On ${esc(spLabel(sp).toLowerCase())}</span>${R.guide && r.kind === 'stain' ? '<span class="badge">Tone guide</span>' : ''}</div>
          <div class="actions stack"><button type="button" class="btn big primary${onList ? ' done' : ''}" data-add="${esc(r.id)}">${onList ? checkIcon + ' In Project' : plusIcon + ' Add to Project'}</button><button type="button" class="btn big" data-copy="${esc(`${r.name}, ${sBrand(r)} ${sCode(r)}`)}">Copy Name &amp; Code</button></div>
          <p class="muted small">${esc(WD.SPECIES[sp].note)} Stain always looks a little different on real wood, so try it on a scrap or a hidden spot first.</p>
        </div>
      </div>
      <section class="section"><h2>Before and After</h2>
        <div class="chipset" role="group" aria-label="Compare with">${chipBtn('data-ba-vs="bare"', true, 'Bare Wood', null)}${R.results.filter(o => o.id !== r.id).slice(0, 4).map(o => chipBtn(`data-ba-vs="${esc(o.id)}"`, false, o.name, '#' + o.predicted)).join('')}</div>
        <div class="ba" id="baBox" style="--split:50%">${SC.woodCv({ sp, w: 900, h: 340, cm: 0.15, seed: 11, sheen: 0.55, cls: 'ba-bare', label: `Bare ${spLabel(sp)}` })}${SC.woodCv({ sp, stain: st, w: 900, h: 340, cm: 0.15, seed: 11, sheen: 0.55, cls: 'after', label: `${r.name} on ${spLabel(sp)}` })}
          <div class="ba-line" aria-hidden="true"><span class="ba-knob">${chev('left', 16)}${chev('right', 16)}</span></div><span class="ba-tag l" id="baLeftTag">Bare ${esc(spLabel(sp).toLowerCase())}</span><span class="ba-tag r">${esc(r.name)}</span>
          <input type="range" min="0" max="100" value="50" aria-label="Slide to compare"></div>
        <p class="muted">Slide across the board to compare.</p></section>
      <div class="blocks">
        <div class="block wide"><h2><span class="ic">${ic('can', 24)}</span>What You’ll Need</h2><div class="need">
          ${R.products.map(p => needRow('can', p.brand ? 'Stain' : 'Also get', p.name, p.why)).join('')}
          ${toolRows(plan.tools)}
          ${needRow('list', 'How much', plan.amount.buy, `${plan.amount.what}.${plan.amount.topcoat ? ` Plus ${plan.amount.topcoat} of clear topcoat for ${plan.amount.topcoatCoats} coats.` : ''}`)}
        </div>
        <details class="more"><summary>Also Grab (${plan.supplies.length})</summary><div>${checklistHtml(plan.supplies)}</div></details>
        ${plan.safety.map(s => `<div class="warn headsup"><b>Safety</b><span>${esc(s)}</span></div>`).join('')}</div>
        ${paints.length ? `<div class="block"><h2><span class="ic">${ic('swatch', 24)}</span>Paint Colors That Go With It</h2><p class="muted">Tap one to see it on the walls in the picture.</p><div class="paint-with">${paints.map(c => `<button type="button" data-wall-paint="${c.hex}" aria-pressed="false"><span ${swStyle(c.hex)}></span><span>${SC.woodCv({ sp, stain: st, w: 300, h: 60, cm: 0.22, seed: 4, label: r.name })}</span><span class="txt"><b>${esc(c.name)}</b><span class="muted">${esc(brandName(c.brand))} ${esc(E.codeLabel(c))}</span></span></button>`).join('')}</div></div>` : ''}
        <div class="block"><h2><span class="ic">${ic('grain', 24)}</span>The Same Stain on Other Woods</h2><div class="wood-row">${others.map(o => `<div class="wood-tile">${SC.woodCv({ sp: o.sp, stain: st, split: 0.4, w: 300, h: 160, cm: 0.2, seed: 2, sheen: 0.4, label: `${r.name} on ${o.label}` })}<span>${esc(o.label)}</span></div>`).join('')}</div></div>
        ${r.warnings.length && settings.showWarnings ? `<div class="block"><h2><span class="ic">${ic('unsure', 24)}</span>Things to Know</h2><div class="warns">${r.warnings.map(w => `<div class="warn ${w.level === 'heads-up' ? 'headsup' : ''}"><b>${esc(w.title)}</b><span>${esc(w.text)}</span></div>`).join('')}</div></div>` : ''}
        <div class="block"><h2><span class="ic">${ic('ok', 24)}</span>Good to Know</h2><ul class="why">${R.tips.map(t => `<li><b>${esc(t.title)}.</b> ${esc(t.text)}</li>`).join('')}</ul></div>
      </div>
    </div>`;
    SC.paintWoods(view(), state.light);
    wireBeforeAfter(R);
    mountScene('colorScene', stainSceneSpec(R, r));
  }
  function wireBeforeAfter(R) {
    const box = $('#baBox'); if (!box) return;
    const range = $('input', box), set = v => box.style.setProperty('--split', v + '%');
    range.addEventListener('input', () => set(range.value));
    box.addEventListener('pointerdown', e => {
      if (e.target === range) return;
      const move = ev => { const r = box.getBoundingClientRect(); const v = Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 100); range.value = v; set(v); };
      move(e); box.setPointerCapture(e.pointerId);
      const up = () => { box.removeEventListener('pointermove', move); box.removeEventListener('pointerup', up); };
      box.addEventListener('pointermove', move); box.addEventListener('pointerup', up);
    });
    $$('[data-ba-vs]').forEach(b => b.addEventListener('click', () => {
      const left = $('.ba-bare', box), tag = $('#baLeftTag');
      const other = b.dataset.baVs === 'bare' ? null : R.results.find(x => x.id === b.dataset.baVs);
      if (other) { left.dataset.stain = JSON.stringify(stainSpec(other)); tag.textContent = other.name; } else { delete left.dataset.stain; tag.textContent = 'Bare ' + spLabel(left.dataset.wood).toLowerCase(); }
      SC.paintWoodCanvas(left, state.light);
      $$('[data-ba-vs]').forEach(x => x.setAttribute('aria-pressed', x === b));
    }));
    $$('[data-wall-paint]').forEach(b => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      $$('[data-wall-paint]').forEach(x => x.setAttribute('aria-pressed', on && x === b));
      const hex = b.dataset.wallPaint, kind = (SCN[state.sceneFor[live.colorScene ? live.colorScene.spec.key : ''] || 'living'] || {}).kind;
      state.wallPaint = on ? (kind === 'house' ? { body: hex } : kind === 'deck' ? { body: hex } : { wall: hex, side: hex }) : null;
      if (live.colorScene) recolorScene('colorScene', {});
      $('#colorScene').scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    }));
  }

  // ================================================================
  // WHICH PAINT TO BUY: the shopping list
  // ================================================================
  function checklistHtml(list) { return `<ul class="checklist">${list.map((x, i) => `<li><label><input type="checkbox" aria-label="${esc(x.name)}"><span><b>${esc(x.name)}</b><span>${esc(x.why)}</span></span></label></li>`).join('')}</ul>`; }
  // a picture of the roller cover, its nap drawn to scale, and the brush
  function rollerArt(nap) {
    const n = { '3/16': 2, '1/4': 3, '3/8': 5, '1/2': 7, '3/4': 10, '1': 13, '1-1/4': 16 }[nap] || 5;
    const fibers = Array.from({ length: 26 }, (_, i) => `<line x1="${22 + i * 6}" y1="${30 - n}" x2="${22 + i * 6 + 1}" y2="30"/><line x1="${22 + i * 6}" y1="62" x2="${22 + i * 6 + 1}" y2="${62 + n}"/>`).join('');
    return `<svg class="tool-art" viewBox="0 0 240 92" aria-hidden="true"><rect x="20" y="30" width="160" height="32" rx="6" fill="#d9cfc0"/><g stroke="#b8a98f" stroke-width="2.2" stroke-linecap="round">${fibers}</g><path d="M180 46h22v34h-40" fill="none" stroke="#3a3632" stroke-width="5" stroke-linejoin="round"/><rect x="150" y="74" width="16" height="16" rx="3" fill="#3a3632"/><text x="100" y="51" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="13" fill="#3a3632">${esc(T.NAP[nap] || '')} nap</text></svg>`;
  }
  function renderPlan(P) {
    const a = flowOf('buy').a, sp = P.space;
    const job = { kind: 'paint', space: a.space, texture: a.texture, siding: a.siding, surface: a.surface, primer: !!P.primer.need };
    const kind = T.sizeKind(job);
    const color = a.color ? E.findColor(a.color) : null;
    const top = P.lines[0];
    view().innerHTML = `<div class="plan">
      ${backBtn('Change Answers')}
      <div class="results-head"><p class="eyebrow">Your Shopping List</p><h1>What to buy for ${esc(PHRASE[a.space] || 'it')}</h1>${chipsLine('buy')}</div>
      <div class="plan-hero">
        ${color ? `<div class="chosen-top"><span class="chosen-sw" ${swStyle(color.hex)}></span><div><p class="eyebrow">Your color</p><h2>${esc(color.name)}</h2><p class="meta">${esc(brandName(color.brand))} ${esc(E.codeLabel(color))}</p></div></div>` : ''}
        <div class="plan-main">
          <div class="big-pick hl"><span class="k">Paint</span><b>${esc(top ? lineLabel(top.brand, top.line) : P.type)}</b><p>${esc(top ? `${P.type}. ${top.why[0] ? top.why[0] + '.' : top.line.note}` : P.typeWhy)}</p></div>
          <div class="big-pick"><span class="k">Finish</span><b>${esc(P.finish.name)}</b><p>${esc(P.finish.why)}.</p></div>
          <div class="big-pick"><span class="k">Primer</span><b>${esc(P.primer.title)}</b><p>${esc(P.primer.why)}${P.primer.products[0] ? ` Try ${esc(P.primer.products[0].name)}.` : ''}</p></div>
          <div class="big-pick"><span class="k">How much</span><b id="planBuy">${esc(P.amount.buy)}</b><p id="planWhat">${esc(P.amount.what)}, ${P.coats} coats.</p></div>
        </div>
        <div class="actions stack"><button type="button" class="btn big primary" data-add-plan="1">${plusIcon}Add to Project</button>${color ? '' : `<button type="button" class="btn big" data-color-for="${esc(a.space)}">${ic('swatch', 22)}Find a Color for This</button>`}<button type="button" class="btn big ghost" data-print-plan="1">${ic('print', 22)}Print</button><button type="button" class="btn big ghost" data-email-plan="1">${mailIcon}Email</button></div>
      </div>
      <div class="blocks">
        <div class="block"><h2><span class="ic">${ic('can', 24)}</span>The Paint</h2>
          <p class="muted">${esc(P.typeWhy)}</p>
          <div class="lines">${P.lines.length ? P.lines.map(l => `<div class="line-card"><div class="top"><b>${esc(lineLabel(l.brand, l.line))}</b><span class="tier t${l.line.tier}">${esc(E.TIERS[l.line.tier])}</span></div><span class="muted">${esc(l.why[0] ? l.why[0] + '. ' : '')}${esc(l.line.note)}</span>${l.tiers.length > 1 ? `<span class="small muted">Other ${esc(brandName(l.brand))} choices: ${l.tiers.filter(x => x.id !== l.line.id).map(x => `${esc(x.name)} (${esc(E.TIERS[x.tier])})`).join(', ')}</span>` : ''}</div>`).join('') : `<p class="muted">No paint lines are listed for the brands that are on. Any ${esc(P.type.toLowerCase())} made for this job works.</p>`}</div>
          <p class="muted small">Product lines change, so check the current label for the finish and coverage.</p></div>
        <div class="block"><h2><span class="ic">${ic('roller', 24)}</span>Roller &amp; Brush</h2>${P.tools.roller ? rollerArt(P.tools.roller.napId) : ''}<div class="need">${toolRows(P.tools)}</div>${P.tools.tips.map(t => `<div class="q-note">${ic('ok', 22)}<span>${esc(t)}</span></div>`).join('')}</div>
        <div class="block wide"><h2><span class="ic">${ic('list', 24)}</span>How Much to Buy</h2><div class="calc" id="calc">${calcInputs(kind, a, P)}<div class="calc-out"><span class="can">${ic('can', 44)}</span><span><b id="calcBuy">${esc(P.amount.buy)}</b><span id="calcWhat">${esc(amountLine(P.amount))}</span></span></div><p class="muted small">Coverage is about ${P.amount.coverage} sq ft per gallon for this job. Rough or porous surfaces soak up more.</p></div></div>
        <div class="block"><h2><span class="ic">${ic('basket', 24)}</span>Also Grab</h2><p class="muted">Check things off as you go.</p>${checklistHtml(P.supplies)}</div>
        ${P.primer.tips.length || P.safety.length ? `<div class="block"><h2><span class="ic">${ic('ok', 24)}</span>Good to Know</h2><ul class="why">${P.primer.tips.concat(P.safety).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
      </div>
    </div>`;
    wireCalc(kind, a, P);
  }
  // A number box with the app's own up and down arrows inside it (the browser's tiny ones are hidden). Tap an arrow
  // to go up or down by `step`; hold it to keep going. Typing works too, decimals included.
  const arrowSvg = up => `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="${up ? 'M5 12.5l5-5 5 5' : 'M5 7.5l5 5 5-5'}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  function numField(id, label, v, step) {
    step = step || 1;
    return `<label class="field">${esc(label)}<span class="num"><input class="input" type="number" inputmode="decimal" min="0" step="any" id="${id}" value="${esc(v)}">
      <span class="num-arrows"><button type="button" class="num-btn up" data-num-for="${id}" data-num-step="${step}" tabindex="-1" aria-label="${esc(label)}: up ${step}">${arrowSvg(true)}</button><button type="button" class="num-btn down" data-num-for="${id}" data-num-step="${-step}" tabindex="-1" aria-label="${esc(label)}: down ${step}">${arrowSvg(false)}</button></span></span></label>`;
  }
  function nudgeNum(btn) {
    const inp = document.getElementById(btn.dataset.numFor); if (!inp) return;
    const step = +btn.dataset.numStep, min = inp.min !== '' ? +inp.min : -Infinity;
    const v = Math.max(min, Math.round(((parseFloat(inp.value) || 0) + step) * 100) / 100);
    inp.value = String(v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
  let numHold = 0;
  const stopHold = () => { clearTimeout(numHold); clearInterval(numHold); numHold = 0; };
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-num-step]'); if (!b || e.button > 0) return;
    e.preventDefault();
    nudgeNum(b);
    stopHold(); numHold = setTimeout(() => { numHold = setInterval(() => nudgeNum(b), 90); }, 420);
    b.addEventListener('pointerleave', stopHold, { once: true });
  });
  ['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, stopHold, true));
  window.addEventListener('blur', stopHold);
  // the line under "what to buy": the area, the coats, and the actual gallons, so the numbers can be checked
  function amountLine(amt) {
    const g = Math.round(amt.gallons * 100) / 100;
    return `${amt.what}. ${amt.coats} coat${amt.coats > 1 ? 's' : ''} at about ${amt.coverage} sq ft a gallon is ${g} gallon${g === 1 ? '' : 's'}${amt.primer ? `, plus ${amt.primer} of primer` : ''}.`;
  }
  function calcInputs(kind, a, P) {
    const s = a.sizeCustom || {};
    const base = (T.SIZES[kind] || {})[a.amountSize || 'medium'] || {};
    const f = (id, label, v, step) => numField(id, label, v, step);
    let h = '';
    if (kind === 'room') h = f('cL', 'Length (ft)', s.l || base.l) + f('cW', 'Width (ft)', s.w || base.w) + f('cH', 'Height (ft)', s.h || base.h) + f('cD', 'Doors', s.doors != null ? s.doors : base.doors) + f('cWi', 'Windows', s.windows != null ? s.windows : base.windows);
    else if (kind === 'fence') h = f('cLen', 'Fence length (ft)', s.len || base.len, 5) + f('cFh', 'Height (ft)', s.h || 6);
    else h = f('cA', 'Square feet', s.area || base.area, 10);
    return `<div class="calc-in">${h}</div><div class="q-group"><p class="q-label">Coats</p><div class="seg" role="group" aria-label="Coats">${[1, 2, 3].map(n => `<button type="button" data-coats="${n}" aria-pressed="${(a.coats || P.coats) === n}">${n} coat${n > 1 ? 's' : ''}</button>`).join('')}</div></div>`;
  }
  function wireCalc(kind, a, P) {
    const el = $('#calc'); if (!el) return;
    const num = id => { const i = $('#' + id); return i ? Math.max(0, parseFloat(i.value) || 0) : undefined; };
    const update = () => {
      const size = kind === 'room' ? { l: num('cL'), w: num('cW'), h: num('cH'), doors: num('cD'), windows: num('cWi') } : kind === 'fence' ? { len: num('cLen'), h: num('cFh'), sides: 2 } : { area: num('cA') };
      // a size left empty (or 0) gets asked for, rather than quietly filled in with a guess
      const missing = kind === 'room' ? !(size.l && size.w && size.h) : kind === 'fence' ? !(size.len && size.h) : !size.area;
      if (missing) {
        $('#calcBuy').textContent = 'Fill in the size';
        $('#calcWhat').textContent = kind === 'room' ? 'Type the room’s length, width and height to see how much paint it takes.' : 'Type the size to see how much it takes.';
        return;
      }
      a.sizeCustom = size;
      const job = { kind: 'paint', space: a.space, texture: a.texture, siding: a.siding, surface: a.surface, primer: !!P.primer.need };
      const amt = T.amount(job, size, a.coats || P.coats);
      P.amount = amt;
      $('#calcBuy').textContent = amt.buy; $('#planBuy').textContent = amt.buy;
      $('#calcWhat').textContent = amountLine(amt);
      $('#planWhat').textContent = `${amt.what}, ${amt.coats} coats.`;
    };
    el.addEventListener('input', update);
    el.addEventListener('click', e => { const b = e.target.closest('[data-coats]'); if (!b) return; a.coats = +b.dataset.coats; $$('[data-coats]', el).forEach(x => x.setAttribute('aria-pressed', x === b)); update(); });
  }
  function planItem(P) {
    const a = flowOf('buy').a, top = P.lines[0], color = a.color ? E.findColor(a.color) : null;
    const t = P.tools;
    return { kind: 'plan', ref: 'plan:' + a.space + ':' + Date.now().toString(36), area: P.space.label, brand: color ? brandName(color.brand) : top ? brandName(top.brand) : '', name: color ? color.name : 'Color to pick', code: color ? E.codeLabel(color) : '', hex: color ? color.hex : '', lrv: color ? String(color.lrv) : '', finish: P.finish.name, product: top ? lineLabel(top.brand, top.line) : P.type, primer: P.primer.need ? (P.primer.products[0] ? P.primer.products[0].name : P.primer.title.replace(/^An? /, '')) : '', loc: '', amount: P.amount.buy, tools: [t.roller ? `${t.roller.nap} nap roller` : '', t.brush ? `${t.brush.size} ${t.brush.shape.toLowerCase()} brush` : ''].filter(Boolean).join(', ') };
  }
  view().addEventListener('click', e => {
    if (state.view !== 'results' || current.kind !== 'buy') return;
    const t = e.target.closest('button'); if (!t) return;
    const P = state.results.buy;
    if (t.dataset.addPlan) { addToList(planItem(P)); t.classList.add('done'); t.innerHTML = checkIcon + ' In Project'; }
    if (t.dataset.colorFor) { const a = flowOf('buy').a; startFlow('paint', { space: a.space, siding: a.siding }); }
    // the shopping list on its own, as a one-off sheet for printing or emailing
    const sheet = () => ({ name: `Shopping List: ${P.space.label}`, notes: [P.type, P.finish.name + ' finish', P.primer.title, P.amount.buy].join(' · '), items: [planItem(P)].concat(P.supplies.map(s => ({ area: 'Supplies', brand: '', name: s.name, code: '', hex: '', finish: '', product: '', primer: '', loc: '' }))) });
    if (t.dataset.printPlan) printSheet(sheet());
    if (t.dataset.emailPlan) openEmail(sheet());
  });

  // ================================================================
  // LOOK UP: any color by name, code or number
  // ================================================================
  function renderLookup() {
    // (no "Home" button on the page itself: the top bar has one)
    view().innerHTML = `<div class="page narrow">
      <div class="page-head"><h1>Look Up a Color</h1><p>Type a color name, a code from a chip, or a color number like #D1CBC1.</p></div>
      <div class="search"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
        <input type="search" id="lookupInput" aria-label="Search colors" placeholder="Agreeable Gray, SW 7029 or #D1CBC1" value="${esc(state.query)}" autocomplete="off" spellcheck="false" enterkeyhint="search">
        <button type="button" class="clear" id="lookupClear" aria-label="Clear" ${state.query ? '' : 'hidden'}>${xIcon}</button></div>
      <div class="actions"><button type="button" class="btn" data-camera="1">${ic('camera', 22)}Match With the Camera</button><span class="muted">or pick a color:</span>${colorHtml('lookupColor', state.lookupHex || 'D1CBC1', 'Match a color', hex => { state.lookupHex = hex; const i = $('#lookupInput'); i.value = '#' + hex; state.query = i.value; $('#lookupClear').hidden = false; clearTimeout(lookTimer); lookTimer = setTimeout(showLookup, 60); })}</div>
      <p class="muted small">Searching ${fmt(enabledCount())} colors from ${Object.values(brandsEnabled()).filter(Boolean).length} brands. Stains too. Brand words work, like “behr swiss coffee” or “minwax early american”.</p>
      <div id="lookupResults" class="section"></div></div>`;
    const input = $('#lookupInput'), clear = $('#lookupClear');
    input.addEventListener('input', () => { clear.hidden = !input.value; clearTimeout(lookTimer); lookTimer = setTimeout(() => { state.query = input.value; showLookup(); }, 90); });
    clear.addEventListener('click', () => { input.value = ''; state.query = ''; clear.hidden = true; showLookup(); input.focus(); });
    showLookup();
    if (window.matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
  }
  // ---- matching a color with the camera ----
  // For when the store's color scanner is down. A camera can't see true color on its own: it keeps changing its
  // brightness and warmth. So plain white paper goes in the same picture, under the same light, and the color is
  // read against it. Two ways: On Paper (the chip or sample lying on the paper, which is read all the way around
  // it, so the light at the color itself is known even with the phone's light making a bright spot) and On a Wall
  // (a sheet held beside the color). How it's worked out, and the checks that refuse a picture that would read
  // wrong (paper washed out, too close, shine, too dark), are in js/cammatch.js, tested on made-up pictures.
  const resetIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/></svg>';
  let cam = null;   // { stream, video, canvas, timer, busy, torch, light }
  let camFocus = null;
  function camStop() {
    if (!cam) return;
    clearInterval(cam.timer);
    if (cam.stream) cam.stream.getTracks().forEach(t => t.stop());
    cam = null;
  }
  const camKeys = e => { if (e.key === 'Escape' && $('#camera')) { e.stopPropagation(); closeCamera(); } };
  function closeCamera() {
    camStop();
    const el = $('#camera'); if (!el) return;
    document.removeEventListener('keydown', camKeys, true);
    const done = () => { el.remove(); document.documentElement.classList.remove('cam-open'); syncBars(); };
    if (reduced()) done(); else { el.classList.add('closing'); setTimeout(done, 200); }
    if (camFocus && document.contains(camFocus)) camFocus.focus({ preventScroll: true });
  }
  // the camera screen: the picture fills it, with the two boxes, a few round buttons and one line of help only
  // when something needs fixing
  async function openCamera() {
    camStop();
    const old = $('#camera'); if (old) old.remove();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('This browser can’t use the camera here. Try Chrome or Safari on a phone or tablet.'); return; }
    camFocus = document.activeElement;
    const el = document.createElement('div');
    el.id = 'camera'; el.className = 'camera';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Match a color with the camera');
    el.innerHTML = `
      <div class="cam-wrap" id="camWrap"><video id="camVideo" playsinline muted autoplay></video>
        <div class="cam-box cam-p" data-cam-box="p"${camMode === 'wall' ? '' : ' hidden'}><span>Paper</span><i class="cam-size" aria-hidden="true"></i></div>
        <div class="cam-box cam-c" data-cam-box="c"><span>Color</span><i class="cam-size" aria-hidden="true"></i></div>
        <i class="cam-glare" id="camGlare" aria-hidden="true" hidden></i>
        <p class="cam-wait" id="camWait">Starting the camera…</p></div>
      <div class="cam-top">
        <button type="button" class="cam-icon" data-cam-close="1" aria-label="Close">${xIcon}</button>
        <span class="grow"></span>
        <div class="cam-mode" role="group" aria-label="Where the color is"><button type="button" data-cam-mode="paper" aria-pressed="${camMode === 'paper'}" aria-label="On paper" title="On paper">${CAM_PAPER_IC}<span class="cm-txt">On Paper</span></button><button type="button" data-cam-mode="wall" aria-pressed="${camMode === 'wall'}" aria-label="On a wall" title="On a wall">${CAM_WALL_IC}<span class="cm-txt">On a Wall</span></button></div>
        <span class="grow"></span>
        <button type="button" class="cam-icon" data-cam-light="1" aria-label="Turn the light on" aria-pressed="false" hidden>${ic('bulb', 24)}</button>
        <button type="button" class="cam-icon" data-cam-reset="1" aria-label="Put the boxes back">${resetIcon}</button>
        <button type="button" class="cam-icon cam-q" data-cam-help="1" aria-label="Tips" aria-expanded="false">?</button>
      </div>
      <p class="cam-hint" id="camNote" aria-live="polite">${camMode === 'wall' ? 'Paper in one box, the color in the other' : 'Lay the color on white paper. Fit the box inside the color.'}</p>
      <div class="cam-tips" id="camTips" hidden>
        <span><b>On Paper:</b> lay the chip or sample on plain white copy paper and fit the box inside it. The paper all around it is read too, so the light is the same.</span>
        <span><b>On a Wall:</b> hold plain white paper flat on the wall right beside the color, and put the Paper box on it.</span>
        <span>Hold the phone a little to one side, so its shadow doesn’t fall on the paper.</span>
        <span>Too dark? The light button turns on the phone’s light. Then a green edge means a good height; yellow or red, move the phone back a little.</span>
        <span>Drag a box to move it. Drag its corner to resize it.</span>
        <span>Shiny paint? Hold the phone at a slight angle, not flat over it. A circle marks any shiny spot.</span>
        <span class="cam-tune-row" id="camTuneRow">${camTuneRow()}</span>
      </div>
      <div class="cam-tune" id="camTune" hidden></div>
      <div class="cam-meter" id="camMeter" hidden aria-hidden="true"><span class="track"></span><i class="mark"></i><b class="lbl"></b></div>
      <div class="cam-bottom">
        <span class="cam-swatch"><span class="sw" id="camSw"></span><span class="mono" id="camHex">——</span></span>
        <button type="button" class="cam-shot" data-cam-read="1" aria-label="Read the color" disabled><span></span></button>
        <span></span>
      </div>`;
    document.body.appendChild(el);
    document.documentElement.classList.add('cam-open'); syncBars();
    document.addEventListener('keydown', camKeys, true);
    camLayout();
    $('[data-cam-close]', el).focus({ preventScroll: true });
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      const w = $('#camWait');
      if (w) w.textContent = e && e.name === 'NotAllowedError' ? 'The camera is blocked for this site. Allow it in the browser’s settings for this site, then try again.' : e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') ? 'No camera was found on this device.' : 'The camera couldn’t start. Close other apps using it and try again.';
      const wrap = $('#camWrap'); if (wrap) wrap.classList.add('off');
      const n = $('#camNote'); if (n) n.hidden = true;
      return;
    }
    const video = $('#camVideo');
    if (!video) { stream.getTracks().forEach(t => t.stop()); return; }   // closed while it was starting
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* plays once it can */ }
    cam = { stream, video, canvas: document.createElement('canvas'), timer: 0, busy: false, torch: false, light: false };
    try { const tr = stream.getVideoTracks()[0], caps = tr && tr.getCapabilities ? tr.getCapabilities() : {}; cam.torch = !!caps.torch; cam.focus = !!caps.focusDistance; const ec = caps.exposureCompensation; if (ec && ec.max > ec.min) cam.ev = { min: ec.min, max: ec.max, step: Math.max(ec.step || 0, 1 / 3), now: 0 }; } catch (e) { cam.torch = false; }
    if (cam.torch) { const lb = $('[data-cam-light]'); if (lb) lb.hidden = false; }   // the light starts off; its button turns it on
    const w = $('#camWait'); if (w) w.hidden = true;
    cam.timer = setInterval(camLive, 250);
  }
  async function camSetLight(on) {
    if (!cam || !cam.torch) return false;
    try { await cam.stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: on }] }); cam.light = on; } catch (e) { return false; }
    const b = $('[data-cam-light]'); if (b) { b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Turn the light off' : 'Turn the light on'); }
    return true;
  }
  // Where the boxes are: the center as a part of the picture's width and height, the size as a part of its shorter
  // side, so a box keeps its place and its shape when the screen turns. Moved or resized boxes are remembered on
  // this device for next time.
  // On paper: one box in the middle. On a wall: the Paper box and the Color box side by side.
  const CAM_DEFAULTS = { paper: { c: { x: 0.5, y: 0.47, w: 0.24, h: 0.24 } }, wall: { p: { x: 0.29, y: 0.5, w: 0.3, h: 0.3 }, c: { x: 0.71, y: 0.5, w: 0.3, h: 0.3 } } };
  let camMode = store.get('camMode', 'paper') === 'wall' ? 'wall' : 'paper';
  let camAll = null, camBoxes = null;
  function camLayout() {
    const wrap = $('#camWrap'); if (!wrap) return;
    const W = wrap.clientWidth, H = wrap.clientHeight; if (!W || !H) return;
    if (!camAll) { const saved = store.get('camBoxes4', null); camAll = clone(CAM_DEFAULTS); if (saved && saved.paper && saved.paper.c) camAll.paper = saved.paper; if (saved && saved.wall && saved.wall.p && saved.wall.c) camAll.wall = saved.wall; }
    camBoxes = camAll[camMode];
    const m = Math.min(W, H);
    // clear of the buttons at the top and bottom, so a corner handle is never under one
    const top = 78, bottom = H - 128;
    for (const k of ['p', 'c']) {
      const b = camBoxes[k], el = $(`#camWrap [data-cam-box="${k}"]`); if (!el) continue;
      el.hidden = !b; if (!b) continue;
      const w = Math.max(48, Math.min(W - 70, b.w * m)), h = Math.max(48, Math.min(bottom - top, b.h * m));
      const left = Math.max(14, Math.min(W - w - 52, b.x * W - w / 2)), y = Math.max(top, Math.min(bottom - h, b.y * H - h / 2));
      Object.assign(el.style, { left: left + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    }
  }
  window.addEventListener('resize', () => { if ($('#camWrap')) camLayout(); });
  let camDrag = null;
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('#camWrap [data-cam-box]'); if (!el) return;
    e.preventDefault();
    const wrap = $('#camWrap'), k = el.dataset.camBox;
    camDrag = { k, el, id: e.pointerId, resize: !!e.target.closest('.cam-size'), x0: e.clientX, y0: e.clientY, b0: Object.assign({}, camBoxes[k]), W: wrap.clientWidth, H: wrap.clientHeight, M: Math.min(wrap.clientWidth, wrap.clientHeight) };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* fine without it */ }
    el.classList.add('moving');
  });
  document.addEventListener('pointermove', e => {
    if (!camDrag || e.pointerId !== camDrag.id) return;
    const d = camDrag, dx = (e.clientX - d.x0) / d.W, dy = (e.clientY - d.y0) / d.H, b = camBoxes[d.k];
    if (d.resize) {
      // the corner grows or shrinks it, keeping the opposite corner where it was
      const pw = Math.max(48, Math.min(d.W * 0.95, d.b0.w * d.M + (e.clientX - d.x0))), ph = Math.max(48, Math.min(d.H * 0.7, d.b0.h * d.M + (e.clientY - d.y0)));
      b.w = pw / d.M; b.h = ph / d.M;
      b.x = d.b0.x + (pw - d.b0.w * d.M) / 2 / d.W; b.y = d.b0.y + (ph - d.b0.h * d.M) / 2 / d.H;
    } else { const hw = b.w * d.M / 2 / d.W, hh = b.h * d.M / 2 / d.H; b.x = Math.max(hw, Math.min(1 - hw, d.b0.x + dx)); b.y = Math.max(hh, Math.min(1 - hh, d.b0.y + dy)); }
    camLayout();
  });
  const camDragEnd = e => { if (!camDrag || (e && e.pointerId !== camDrag.id)) return; camDrag.el.classList.remove('moving'); camDrag = null; store.set('camBoxes4', camAll); };
  document.addEventListener('pointerup', camDragEnd); document.addEventListener('pointercancel', camDragEnd);
  // ---- reading the picture: the math is in js/cammatch.js, tested on made-up camera pictures ----
  const CM = window.CG.cammatch;
  // the picture as it is now (small), and where a box on the screen falls in it
  function camFrame() {
    const v = cam.video, vw = v.videoWidth, vh = v.videoHeight; if (!vw || !vh) return null;
    const sc = Math.min(1, 360 / Math.max(vw, vh)), fw = Math.round(vw * sc), fh = Math.round(vh * sc);
    const cv = cam.canvas; if (cv.width !== fw || cv.height !== fh) { cv.width = fw; cv.height = fh; }
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(v, 0, 0, fw, fh);
    const img = g.getImageData(0, 0, fw, fh);
    const vr = v.getBoundingClientRect(), k = Math.max(vr.width / vw, vr.height / vh), ox = (vr.width - vw * k) / 2, oy = (vr.height - vh * k) / 2;   // object-fit: cover
    const toF = r => ({ x0: (r.left - vr.left - ox) / k * sc, y0: (r.top - vr.top - oy) / k * sc, x1: (r.right - vr.left - ox) / k * sc, y1: (r.bottom - vr.top - oy) / k * sc });
    const toScreen = (x, y) => ({ x: x / sc * k + ox + vr.left, y: y / sc * k + oy + vr.top });
    return { frame: { data: img.data, width: fw, height: fh }, toF, toScreen, px: k / sc };
  }
  const camTune = () => (settings.camTune && settings.camTune.length ? CM.fitTune(settings.camTune) : null);
  function camSample() {
    if (!cam || !cam.video.videoWidth || !document.contains(cam.video)) return null;
    const F = camFrame(); if (!F) return null;
    const cb = $('#camWrap .cam-c'), pb = $('#camWrap .cam-p');
    const layout = camMode === 'wall' && pb ? { mode: 'wall', color: F.toF(cb.getBoundingClientRect()), paper: F.toF(pb.getBoundingClientRect()) } : { mode: 'paper', color: F.toF(cb.getBoundingClientRect()) };
    const r = CM.analyze(F.frame, layout, { tune: camTune() });
    r.F = F;
    return r;
  }
  // what to fix, in a few plain words
  const CAM_SAY = {
    ring: () => 'Lay the color on white paper, with paper showing all around it. On a wall? Tap “On a Wall”.',
    paper: () => 'Put plain white paper in the Paper box.',
    dark: () => (cam && cam.torch && !cam.light ? 'Too dark. Turn on the light.' : 'Too dark. Add more light.'),
    bright: () => (cam && cam.ev && cam.ev.now > cam.ev.min ? 'Too bright. Adjusting the camera…' : cam && cam.light ? 'Too bright for the camera. Turn the light off, or move the phone back.' : 'Too bright for the camera. Move out of direct light, or move the phone back.'),
    glare: () => 'Shine on the color (circled). Hold the phone at a slight angle, not flat over it, until the circle is out of the box.',
    mixed: () => (camMode === 'wall' ? 'Fill the Color box with one color.' : 'Make the box smaller, so it’s all the color.'),
    uneven: () => (camMode === 'wall' ? 'The light is uneven. Move the boxes closer together.' : cam && cam.light ? 'Too close. Move the phone back a little.' : 'Uneven light. Keep the phone’s shadow off the paper.'),
    brighter: () => 'Use plain white copy paper. The color looks brighter than the paper.',
    small: () => 'Make the box bigger.',
  };
  const camSay = p => (CAM_SAY[p] ? CAM_SAY[p]() : '');
  // a message in the line at the top (rewritten only when it changes, so screen readers say it once)
  function camNote(text, kind) {
    const note = $('#camNote'); if (!note) return;
    note.hidden = !text;
    const key = (kind || '') + '|' + text;
    if (text && note.dataset.msg !== key) { note.dataset.msg = key; note.innerHTML = (kind === 'glare' ? TILT_ICON : kind === 'ready' ? '<span class="dot" aria-hidden="true"></span>' : '') + esc(text); }
    note.classList.toggle('tilt', kind === 'glare'); note.classList.toggle('ready', kind === 'ready');
  }
  // phones that can: turn the exposure down when the paper starts to wash out, and back up when it's dim
  async function camExposure(r) {
    if (!cam || !cam.ev || cam.evBusy) return;
    const top = r.white && r.white.top, ev = cam.ev;
    let want = ev.now;
    if (r.problem === 'bright' || (top && top > 238)) want = Math.max(ev.min, ev.now - ev.step);
    else if (top && top < 165) want = Math.min(Math.min(ev.max, 1), ev.now + ev.step);   // (a white page makes a camera expose it gray: up to one stop brighter)
    if (want === ev.now) return;
    cam.evBusy = true;
    try { await cam.stream.getVideoTracks()[0].applyConstraints({ advanced: [{ exposureCompensation: want }] }); ev.now = want; } catch (e) { cam.ev = null; }
    setTimeout(() => { if (cam) cam.evBusy = false; }, 450);
  }
  // The height guide. How evenly the light falls on the paper (and how far away the phone has focused, on phones
  // that say). The marker runs from too close (bottom, red) through a good height (green) to far (top).
  const FD_POS = [[0.05, 0], [0.12, 0.25], [0.18, 0.45], [0.45, 0.8], [0.9, 1]];
  const fdPos = fd => { for (let i = 1; i < FD_POS.length; i++) { const [d0, p0] = FD_POS[i - 1], [d1, p1] = FD_POS[i]; if (fd <= d1) return p0 + (p1 - p0) * Math.max(0, (fd - d0) / (d1 - d0)); } return 1; };
  function camHeight(r) {
    const w = r.white || {}, lit = cam.light;
    const even = camMode === 'wall' ? Math.abs(w.D || 0) * 3 : w.even || 0;
    cam.eS = cam.eS == null ? even : cam.eS * 0.6 + even * 0.4;
    const e = cam.eS;
    let fd = null;
    if (cam.focus) { try { const f = cam.stream.getVideoTracks()[0].getSettings().focusDistance; if (f > 0.03 && f < 3) fd = f; } catch (err) { fd = null; } }
    let level = e > 1.15 ? 'bad' : e > 0.8 ? 'warn' : 'good';
    let text = level === 'good' ? 'Good height' : lit || camMode === 'paper' ? 'Move back a little' : 'Light is uneven';
    if (fd != null && lit) {
      if (fd < 0.12) { level = 'bad'; text = 'Move back a little'; }
      else if (fd < 0.18 && level === 'good') { level = 'warn'; text = 'Move back a little'; }
      else if (fd > 0.45 && level === 'good') { level = 'warn'; text = 'Move a little closer'; }
    }
    const pos = fd != null ? fdPos(fd) : Math.max(0.05, Math.min(0.78, 0.75 - e * 0.45));
    return { level, pos, text: fd != null ? `${text} · about ${Math.round(fd * 39.37)} in` : text };
  }
  // the two ways of reading: a color lying on a sheet of paper, and a wall of bricks with a sheet held on it
  const CAM_PAPER_IC = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="3" width="15" height="18" rx="1.8"/><rect x="8.5" y="8" width="7" height="7" rx="1" fill="currentColor" stroke="none"/></svg>';
  const CAM_WALL_IC = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="1"/><path d="M2.5 9.3h19M2.5 14.7h19M8.5 4v5.3M15.5 4v5.3M5.5 9.3v5.4M12 9.3v5.4M18.5 9.3v5.4M8.5 14.7V20M15.5 14.7V20"/></svg>';
  // a phone seen from the side, rocking from flat to a slight angle (shown with the glare message)
  const TILT_ICON ='<svg class="tilt-ic" viewBox="0 0 40 32" width="44" height="35" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 28h34" opacity=".6"/><g class="tilt-phone"><rect x="8" y="8" width="24" height="5" rx="2"/><path d="M20 16v7" stroke-dasharray="1.5 3"/></g></svg>';
  function camLive() {
    if (!cam || cam.busy) return;
    const r = camSample();
    if (!r) { if (cam && !document.contains(cam.video)) camStop(); return; }
    camExposure(r);
    const screen = $('#camera'), meter = $('#camMeter');
    // the height guide is for the phone's light (its bright spot gets uneven up close); without it, uneven light
    // is the phone's shadow, and the line at the top says so
    if (r.white && r.white.ok && cam.light) {
      const h = camHeight(r);
      if (screen) screen.dataset.height = h.level;
      if (meter) { meter.hidden = false; $('.mark', meter).style.bottom = (h.pos * 100) + '%'; $('.lbl', meter).textContent = h.text; meter.dataset.level = h.level; }
    } else { if (screen) delete screen.dataset.height; if (meter) meter.hidden = true; }
    const sw = $('#camSw'), hx = $('#camHex'), btn = $('[data-cam-read]');
    if (r.hex && !r.problem) { if (sw) sw.style.background = '#' + r.hex; if (hx) hx.textContent = '#' + r.hex; }
    if (r.problem) camNote(camSay(r.problem), r.problem === 'glare' ? 'glare' : '');
    else camNote(cam.tuning ? 'Ready. Tap the round button to read the chip you know.' : 'Ready. Tap the round button.', 'ready');
    if (btn) btn.disabled = !!r.problem;
    // the circle around a shiny spot
    const ring = $('#camGlare'), wrap = $('#camWrap'), at = r.problem === 'glare' && r.col && r.col.hotAt;
    if (ring && wrap) {
      ring.hidden = !at;
      if (at) {
        const w = wrap.getBoundingClientRect(), p = r.F.toScreen(at.x, at.y), size = Math.max(48, at.r * 2 * r.F.px + 28);
        ring.style.left = (p.x - w.left) + 'px'; ring.style.top = (p.y - w.top) + 'px'; ring.style.width = ring.style.height = size + 'px';
      }
    }
  }
  // ---- tuning: a chip whose color is known, read once, tells how this phone's camera bends the colors ----
  // which kinds of chip the camera is tuned with: a light one sets the paper's own tint (for whites and off-whites),
  // a dark one sets how the camera handles dark colors
  const tuneLum = p => 0.2126 * p.t[0] + 0.7152 * p.t[1] + 0.0722 * p.t[2];
  const tuneColorful = p => { const L = CM.lab(p.t.map(v => v * CM.PAPER)); return Math.hypot(L[1], L[2]) >= 12; };
  const tuneKinds = () => { const ps = settings.camTune || []; return { light: ps.some(p => !tuneColorful(p) && tuneLum(p) > 0.64), dark: ps.some(p => !tuneColorful(p) && tuneLum(p) < 0.15), colorful: ps.filter(tuneColorful).length }; };
  const TUNE_MAX = 12;
  function camTuneRow() {
    const n = (settings.camTune || []).length, k = tuneKinds();
    const say = !n ? 'Best: one white chip (for whites), one dark chip (for dark colors), and a few colorful ones, like a teal and a red-orange (for the colors in between).'
      : !k.light ? 'Add a white or off-white chip too, for whites.' : !k.dark ? 'Add a dark chip too, for dark colors.' : k.colorful < 2 ? 'Add a colorful chip or two, like a teal or a red-orange, for the colors in between.' : `It has a white, a dark and ${k.colorful} colorful chips.`;
    return `<b>Make it more exact:</b> tune the camera with chips you know. ${say}<span class="cam-tune-btns"><button type="button" class="cam-chip" data-cam-tune="1">${n ? 'Tune With Another Chip' : 'Tune the Camera'}</button>${n ? `<button type="button" class="cam-chip ghost" data-cam-untune="1">Undo Tuning (${n} chip${n > 1 ? 's' : ''})</button>` : ''}</span>`;
  }
  function camTunePick(c) {
    const box = $('#camTune'); if (!box) return;
    cam.tuneRead = c;
    box.hidden = false;
    box.innerHTML = `<h2>Which chip is it?</h2><p>Type its name or number from the chip.</p>
      <label class="search"><input type="search" id="camTuneQ" placeholder="Agreeable Gray, SW 7029..." aria-label="The chip's name or number" autocomplete="off"></label>
      <div class="cam-tune-list" id="camTuneList"></div>
      <div class="cam-tune-foot"><button type="button" class="cam-chip ghost" data-cam-tune-cancel="1">Cancel</button></div>`;
    const q = $('#camTuneQ');
    q.addEventListener('input', () => {
      const list = q.value.trim() ? E.search(q.value, { brands: brandsEnabled(), limit: 6 }) : [];
      $('#camTuneList').innerHTML = list.map(x => `<button type="button" class="cam-tune-item" data-cam-tune-pick="${esc(x.color.id)}"><span class="sw" ${swStyle(x.color.hex)}></span><span><b>${esc(x.color.name)}</b><small>${esc(brandName(x.color.brand))} ${esc(E.codeLabel(x.color))}</small></span></button>`).join('');
    });
    q.focus({ preventScroll: true });
  }
  function camTuneDone(id) {
    const chip = E.findColor(id), c = cam && cam.tuneRead; if (!chip || !c) return;
    const pair = { m: c.raw, t: CM.linOf(chip.hex).map(v => v / CM.PAPER) };
    settings.camTune = (settings.camTune || []).concat([pair]).slice(-TUNE_MAX); saveSettings();
    cam.tuning = false; cam.tuneRead = null;
    const box = $('#camTune'); if (box) { box.hidden = true; box.innerHTML = ''; }
    const row = $('#camTuneRow'); if (row) row.innerHTML = camTuneRow();
    const k = tuneKinds();
    toast(`Tuned with ${chip.name}.` + (!k.light ? ' A white chip next makes whites closer too.' : !k.dark ? ' A dark chip next makes dark colors closer too.' : k.colorful < 2 ? ' A colorful chip next makes in-between colors closer too.' : ' Readings now fit this phone.'), 5000);
  }
  document.addEventListener('click', async e => {
    if (e.target.closest('[data-camera]')) { openCamera(); return; }
    const t = e.target.closest('#camera button'); if (!t) return;
    const d = t.dataset;
    if (d.camClose) { closeCamera(); return; }
    if (d.camMode) {
      const was = camMode;
      camMode = d.camMode === 'wall' ? 'wall' : 'paper'; store.set('camMode', camMode);
      $$('[data-cam-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.camMode === camMode)));
      if (cam) cam.eS = null;
      camLayout();
      // the buttons are just pictures on a phone, so say what each one means when it's picked
      if (was !== camMode) toast(camMode === 'wall' ? 'On a wall: hold white paper beside the color. Paper box on the paper, Color box on the color.' : 'On paper: lay the color on white paper and fit the box inside it.');
      return;
    }
    if (d.camTune) { cam && (cam.tuning = true); const tips = $('#camTips'); if (tips) tips.hidden = true; $('#camera').classList.remove('tips-open'); $$('[data-cam-help]').forEach(b => b.setAttribute('aria-expanded', 'false')); toast('Lay a chip you know on the paper, fit the box in it, then tap the round button.'); return; }
    if (d.camUntune) { settings.camTune = []; saveSettings(); const row = $('#camTuneRow'); if (row) row.innerHTML = camTuneRow(); toast('Camera tuning undone'); return; }
    if (d.camTuneCancel) { if (cam) { cam.tuning = false; cam.tuneRead = null; } const box = $('#camTune'); if (box) { box.hidden = true; box.innerHTML = ''; } return; }
    if (d.camTunePick) { camTuneDone(d.camTunePick); return; }
    if (d.camHelp) { const tips = $('#camTips'), open = tips.hidden; tips.hidden = !open; t.setAttribute('aria-expanded', String(open)); $('#camera').classList.toggle('tips-open', open); return; }
    if (d.camLight) { if (!(await camSetLight(!(cam && cam.light)))) toast('The light couldn’t change here'); return; }
    if (d.camReset) {
      const wrap = $('#camWrap'); if (!wrap) return;
      camAll[camMode] = clone(CAM_DEFAULTS[camMode]); store.set('camBoxes4', camAll);
      $$('#camWrap .cam-box').forEach(b => b.classList.add('resetting'));
      camLayout();
      setTimeout(() => $$('#camWrap .cam-box').forEach(b => b.classList.remove('resetting')), 320);
      return;
    }
    if (d.camRead && cam && !cam.busy) {
      // Pictures, each read on its own, until the camera has settled: a camera keeps nudging its brightness and
      // warmth for a moment, so the color is the middle of the first ten in a row that agree closely (or, after
      // about three seconds, of the steadiest ten). Only if they agree.
      cam.busy = true; t.disabled = true; t.classList.add('busy');
      camNote('Hold still…', 'ready');
      const got = [];
      let c = null;
      for (let i = 0; i < 40; i++) {
        const r = camSample(); if (r) got.push(r);
        if (got.length >= 10) { const run = CM.combine(got.slice(-10)); if (run && run.n >= 8 && (!c || run.spread < c.spread)) c = run; if (c && c.spread <= 1.2) break; }
        await new Promise(res => setTimeout(res, 70));
        if (!cam) return;
      }
      cam.busy = false; t.classList.remove('busy');
      const bad = got.slice(-10).find(g => g.problem);
      if (!c) { t.disabled = false; camNote(bad ? camSay(bad.problem) : 'Hold still and try again.', bad && bad.problem === 'glare' ? 'glare' : ''); return; }
      if (c.spread > 2.5) { t.disabled = false; camNote('The color kept changing. Hold the phone still and try again.'); return; }
      if (cam.tuning) { t.disabled = false; camTunePick(c); return; }
      closeCamera();
      state.query = '#' + c.hex; state.lookupHex = c.hex;
      if (state.view === 'lookup') renderLookup(); else go('lookup');
      const lit = C.hexToLab(c.hex)[0], k = tuneKinds();
      const tip = lit > 85 && !k.light ? ' Whites read closer once the camera is tuned with a white chip (in the camera’s ? tips).' : lit < 32 && !k.dark ? ' Dark colors read closer once the camera is tuned with a dark chip (in the camera’s ? tips).' : '';
      toast(`Read #${c.hex}. Check it against a real chip.${tip}`, tip ? 6500 : 2800);
    }
  });
  let lookTimer = 0;
  function exactCard(hex, c) {
    const rgb = C.hexToRgb(hex).map(v => Math.round(v)), lrv = c ? c.lrv : C.lrvFromHex(hex), ref = c ? c.id : '#' + hex, on = session.items.some(x => x.ref === ref);
    return `<div class="exact"><span class="exact-sw" ${swStyle(hex)}></span><div class="exact-info">
      <p class="eyebrow">${c ? `${esc(brandName(c.brand))} · ${esc(E.codeLabel(c))}` : 'Exact Color'}</p><h2>${c ? esc(c.name) : '#' + hex}</h2>
      <div class="vals"><button type="button" class="val" data-copy="#${hex}"><span>Hex · tap to copy</span><b>#${hex}</b></button><button type="button" class="val" data-copy="${rgb.join(', ')}"><span>RGB · tap to copy</span><b>${rgb.join(', ')}</b></button><div class="val"><span>Light Reflectance</span><b>${lrv}</b></div></div>
      <div class="actions">${c ? `<button type="button" class="btn big" data-go="color/${esc(encodeURIComponent(c.id))}">See Everything${chev('right')}</button>` : ''}<button type="button" class="btn big primary${on ? ' done' : ''}" data-add="${esc(ref)}">${on ? checkIcon + ' In Project' : plusIcon + ' Add to Project'}</button></div></div></div>`;
  }
  function nearLists(all, title) {
    const en = brandsEnabled();
    const on = all.filter(r => en[r.color.brand] !== false), off = all.filter(r => en[r.color.brand] === false);
    return `<h2>${esc(title)}</h2>${on.length ? `<div class="rows">${on.map(r => colorRow(r.color, r.dE)).join('')}</div>` : '<p class="muted">No brands are turned on.</p>'}${off.length ? `<details class="more"><summary>Brands That Are Turned Off (${off.length})</summary><div class="rows">${off.map(r => colorRow(r.color, r.dE)).join('')}</div></details>` : ''}`;
  }
  function showLookup() {
    const host = $('#lookupResults'); if (!host) return;
    const q = state.query.trim();
    const opts = { brands: brandsEnabled(), showDiscontinued: settings.showDiscontinued, limit: 60 };
    if (!q) {
      host.innerHTML = popularLookup(opts.brands);
      return;
    }
    const hex = E.parseColorValue(q);
    if (hex) {
      state.lookupHex = hex;
      const pick = $('#lookupColor'); if (pick) { COLORS.lookupColor.hex = hex; $('.sw', pick).style.background = '#' + hex; $('.mono', pick).textContent = '#' + hex; }
      const near = jobOn('stain') ? S.search('', { hex, stainBrands: settings.stainBrands, limit: 6 }) : [];
      host.innerHTML = exactCard(hex) + nearLists(E.closestByBrand(hex, { showDiscontinued: settings.showDiscontinued, collections: settings.collections }), 'Closest in Each Brand')
        + (near.length ? `<h2>Closest Stains</h2><div class="rows">${near.map(r => stainRow(r.stain, r.dE)).join('')}</div>` : '');
      return;
    }
    let res = E.search(q, opts);
    if (!res.length) res = E.search(q, Object.assign({}, opts, { brands: null }));
    // stains too (when the store does stain), in their own list
    const stains = jobOn('stain') ? S.search(q, { stainBrands: settings.stainBrands, limit: 24 }) : [];
    const stainList = (title, list) => list.length ? `<h2>${esc(title)}</h2><div class="rows">${list.map(r => stainRow(r.stain, r.dE)).join('')}</div>` : '';
    if (!res.length && !stains.length) { host.innerHTML = `<div class="empty"><h2>No colors or stains match “${esc(q)}”</h2><p class="muted">Try just the number from the chip, or a color number like #D1CBC1.</p></div>`; return; }
    if (!res.length) { host.innerHTML = stainList(stains.length === 1 ? '1 stain' : `${stains.length} stains`, stains); return; }
    const top = res[0].color, norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, ''), nq = norm(q);
    const exact = nq && (norm(top.name) === nq || norm(E.codeLabel(top)) === nq || norm(top.code) === nq || norm(brandName(top.brand) + top.name) === nq || norm(brandName(top.brand) + top.code) === nq);
    if (exact) {
      host.innerHTML = exactCard(top.hex, top) + nearLists(E.matchesFor(top, { showDiscontinued: settings.showDiscontinued, collections: settings.collections }), 'Closest in Other Brands')
        + (res.length > 1 ? `<h2>Other Names Like This</h2><div class="rows">${res.slice(1).map(r => colorRow(r.color)).join('')}</div>` : '') + stainList('Stains', stains);
      return;
    }
    const paintList = `<h2>${res.length === 60 ? 'Top 60 paint colors' : res.length + ' paint color' + (res.length > 1 ? 's' : '')}</h2><div class="rows">${res.map(r => colorRow(r.color)).join('')}</div>`;
    // a stain named exactly (or by its number) comes first
    host.innerHTML = stains.length && stains[0].score >= 95 ? stainList('Stains', stains) + paintList : paintList + stainList('Stains', stains);
  }

  // ================================================================
  // PROJECTS: everything for one job in one place, ready to print or email
  // `session` is the open project. Starting a new one keeps the old one under Earlier Projects
  // (the last 10 on this device; none on a shared kiosk).
  // ================================================================
  const PAST_MAX = 10;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const blankSession = () => ({ id: newId(), name: '', notes: '', created: Date.now(), updated: Date.now(), items: [] });
  const fixSession = s => (s && Array.isArray(s.items) ? Object.assign(blankSession(), s, { id: s.id || newId() }) : blankSession());
  let session = fixSession(store.get('session', null));
  let past = (store.get('sessions', []) || []).filter(s => s && Array.isArray(s.items)).map(fixSession).slice(0, PAST_MAX);
  const saveSession = () => { session.updated = Date.now(); store.set('session', session); };
  const savePast = () => store.set('sessions', past);
  const titleOf = s => (s.name || '').trim() || (s === session ? 'New Project' : 'Untitled Project');
  const sessionTitle = () => titleOf(session);
  const whenOf = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  // keeps the top bar's Project button (with how many things are in it) and every Add to Project button current
  function updateListBtn(bump) {
    const n = session.items.length, btn = $('#projBtn'), cnt = $('#projCount');
    if (btn) {
      btn.hidden = !n && !(session.name || '').trim();
      cnt.textContent = n; cnt.hidden = !n;
      btn.setAttribute('aria-label', `Your project, ${sessionTitle()}${n ? `, ${n} item${n === 1 ? '' : 's'}` : ''}`);
      if (bump && n && !reduced()) { cnt.classList.remove('bump'); void cnt.offsetWidth; cnt.classList.add('bump'); }
    }
    $$('[data-add]').forEach(b => { const on = session.items.some(x => x.ref === b.dataset.add); b.classList.toggle('done', on); b.innerHTML = on ? checkIcon + ' In Project' : plusIcon + ' Add to Project'; });
  }
  function paintItem(c) {
    const R = state.results.paint;
    const res = R && R.results.concat(R.finalists || []).some(r => r.color.id === c.id);
    const a = res ? R.answers : null, sp = a ? E.SPACES[a.space] : null;
    const item = { kind: 'paint', ref: c.id, space: a ? a.space : '', area: sp ? sp.label : '', brand: brandName(c.brand), name: c.name, code: E.codeLabel(c), hex: c.hex, lrv: String(c.lrv), finish: sp ? sheenName(sp.sheens[0]) : '', product: '', primer: '', loc: '' };
    item.loc = (c.flags & E.F.RACK) && c.extra && ['sw', 'valspar', 'hgsw'].includes(c.brand) ? c.extra : (c.flags & E.F.RACK) ? 'Rack' : '';
    const lb = lineBrandFor(c);
    if (lb) { const r = E.recommendLines(lb, c, a || { space: 'living' }, { lines: settings.lines }); if (r.best) { item.product = lineLabel(lb, r.best.line); item.line = r.best.line.id; } }
    if (a) { const pr = E.primerFor(a, c, engineSettings()); if (pr.need) item.primer = pr.products[0] ? pr.products[0].name : pr.title.replace(/^An? /, ''); }
    return item;
  }
  function stainItem(R, r) {
    const job = S.JOBS[R.answers.target] || S.JOBS.floors;
    const prods = S.productsFor(R.answers, stainSettings(), [r]);
    return { kind: 'stain', ref: r.id, target: R.answers.target, wood: R.wood, area: `${job.label}, ${spLabel(R.wood)}`, brand: sBrand(r), name: r.name, code: sCode(r) === S.TYPES[r.type] ? '' : sCode(r), hex: r.predicted || r.hex, lrv: '', finish: S.TYPES[r.type] || '', product: (prods[0] || {}).name || '', primer: '', loc: '' };
  }
  function customItem(hex) {
    const best = E.closestByBrand(hex, { brands: brandsEnabled() })[0];
    return { kind: 'custom', ref: '#' + hex, area: '', brand: 'Exact Color', name: best ? `Closest: ${brandName(best.color.brand)} ${best.color.name}` : 'Exact color', code: best ? E.codeLabel(best.color) : '', hex, lrv: String(C.lrvFromHex(hex)), finish: '', product: '', primer: '', loc: '' };
  }
  // ---- how much of each: counts of each size of can ----
  const CAN_SIZES = [['sample', 'Sample', 'Samples'], ['quart', 'Quart', 'Quarts'], ['gallon', 'Gallon', 'Gallons'], ['bucket', '5-Gallon Bucket', '5-Gallon Buckets']];
  const CAN_OF = { sample: 'sample', quart: 'quart', gallon: 'gallon', '5-gallon bucket': 'bucket', bucket: 'bucket' };
  // an item's cart: its own counts, or read from its amount line ("2 gallons + 1 quart")
  function cartOf(x) {
    const c = { sample: 0, quart: 0, gallon: 0, bucket: 0 };
    if (x.cart && typeof x.cart === 'object') { for (const k of Object.keys(c)) c[k] = Math.max(0, Math.min(99, Math.round(+x.cart[k] || 0))); return c; }
    String(x.amount || '').replace(/(\d+)\s*(5-gallon bucket|gallon|quart|sample)s?/gi, (m, n, z) => { c[CAN_OF[z.toLowerCase()]] += +n; return m; });
    return c;
  }
  const cartLine = c => CAN_SIZES.filter(([k]) => c[k]).map(([k, one, many]) => `${c[k]} ${(c[k] === 1 ? one : many).toLowerCase()}`).join(' + ');
  const cartEmpty = c => !CAN_SIZES.some(([k]) => c[k]);
  // what a paint item still needs before it can be mixed
  const needsInfo = x => { if (x.kind === 'fix') return false; const c = cartOf(x), onlySamples = c.sample && !c.quart && !c.gallon && !c.bucket; return cartEmpty(c) || (x.kind !== 'stain' && !x.finish && !onlySamples); };
  // the paint lines a color can be mixed in, for inside or outside
  function linesFor(x) {
    const c = x.kind !== 'stain' && E.findColor(x.ref), lb = c ? lineBrandFor(c) : null; if (!lb) return { lb: null, lines: [] };
    const sp = E.SPACES[x.space], use = sp ? (sp.kind === 'exterior' ? 'exterior' : 'interior') : '';
    const lines = (E.PAINT_LINES[lb] || []).filter(l => settings.lines[l.id] !== false && (!use || l.use === use || l.use === 'both'));
    return { lb, lines };
  }
  let itemEdit = null;
  function openItemEdit(id) {
    const x = session.items.find(i => i.id === id); if (!x) return;
    itemEdit = id;
    const { lb, lines } = linesFor(x), c = cartOf(x);
    const chips = (attr, list, on) => `<div class="chipset">${list.map(([v, l]) => `<button type="button" class="chip plain" ${attr}="${esc(v)}" aria-pressed="${on(v)}">${esc(l)}</button>`).join('')}</div>`;
    openModal([x.brand, x.name].filter(Boolean).join(' ') || 'This Color', `<p class="part-lead">What the paint desk needs to mix it: the sheen, the paint and how much.</p>
      ${x.kind !== 'stain' ? `<div class="setup-group"><h3>Sheen</h3>${chips('data-ie-finish', E.SHEENS.map(z => [z.name, z.name]), v => v === x.finish)}</div>` : ''}
      ${lines.length > 1 ? `<div class="setup-group"><h3>Which Paint</h3>${selectHtml('ieLine', [['', 'Not picked yet']].concat(lines.map(l => [l.id, l.name, { interior: 'Inside', exterior: 'Outside', both: 'Floors' }[l.use]])), (lines.find(l => lineLabel(lb, l) === x.product) || {}).id || '', brandName(lb), v => {
        const y = session.items.find(i => i.id === itemEdit), l = lines.find(q => q.id === v); if (!y) return;
        if (l) { y.product = lineLabel(lb, l); y.line = l.id; } else { y.product = ''; y.line = ''; }
        saveSession(); if (state.view === 'list') { const sy = window.scrollY; renderList(); window.scrollTo(0, sy); }
      })}</div>` : ''}
      <div class="setup-group"><h3>How Much</h3><div class="ie-steps">${CAN_SIZES.map(([k, one, many]) => `<div class="ie-step"><span>${many}</span><button type="button" class="ie-pm" data-ie-minus="${k}" aria-label="One less ${one.toLowerCase()}">−</button><b id="ie-${k}" aria-live="polite">${c[k]}</b><button type="button" class="ie-pm" data-ie-plus="${k}" aria-label="One more ${one.toLowerCase()}">+</button></div>`).join('')}</div>
        ${x.kind === 'plan' || x.space ? '' : '<p class="muted small" style="margin:0">Not sure how much? Which Paint to Buy works it out from the room’s size.</p>'}</div>
      <div class="modal-foot"><span class="grow"></span><button type="button" class="btn big primary" data-modal-close="1">Done</button></div>`);
  }
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-item-edit]'); if (open) { openItemEdit(open.dataset.itemEdit); return; }
    const t = e.target.closest('#modal button'); if (!t || !itemEdit) return;
    const x = session.items.find(i => i.id === itemEdit); if (!x) return;
    const d = t.dataset;
    if (d.ieFinish) { x.finish = d.ieFinish; $$('#modal [data-ie-finish]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); }
    if (d.iePlus || d.ieMinus) {
      const k = d.iePlus || d.ieMinus, c = cartOf(x);
      c[k] = Math.max(0, Math.min(99, c[k] + (d.iePlus ? 1 : -1)));
      x.cart = c; x.amount = cartLine(c);
      const b = $('#ie-' + k); if (b) b.textContent = c[k];
    }
    if (d.ieFinish || d.iePlus || d.ieMinus) { saveSession(); if (state.view === 'list') { const y = window.scrollY; renderList(); window.scrollTo(0, y); } }
  });
  // ---- samples: test the top colors at home before buying gallons ----
  const SAMPLE_STEPS = [
    'Paint two coats on a big piece of white poster board, about 2 feet square, or right on the wall. A chip is too small to judge.',
    'Let it dry for a few hours. Wet paint looks darker than it will be.',
    'Look at it on each wall, in the morning, the afternoon and at night with the lights on. Color changes a lot with the light.',
    'Hold it next to what’s staying: the trim, floor, counters, cabinets and furniture.',
    'Keep it away from the old wall color, with white paper around it, so the old color doesn’t fool your eye.',
    'Live with it a day or two before you choose.',
  ];
  let samplePicks = null;
  function samplePlanHtml(colors) {
    const top = colors.slice(0, 3);
    if (!top.length) return '';
    if (state.duelPick) { const i = top.findIndex(c => c.id === state.duelPick); if (i > 0) top.unshift(top.splice(i, 1)[0]); }
    samplePicks = new Set(top.map(c => c.id));
    return `<section class="section sample-plan" aria-labelledby="spH"><h2 id="spH">Try Before You Buy</h2>
      <p>Not sure yet? Get a sample of your top ${top.length === 1 ? 'color' : top.length === 2 ? 'two' : 'three'} and test ${top.length === 1 ? 'it' : 'them'} at home. A few samples cost a lot less than painting a room twice.</p>
      <div class="sp-picks">${top.map(c => `<button type="button" class="sp-pick" data-sp="${esc(c.id)}" aria-pressed="true"><span class="sw" ${swStyle(c.hex)}></span><span class="sp-txt"><b>${esc(c.name)}</b><small>${esc(brandName(c.brand))} ${esc(E.codeLabel(c))}</small></span><span class="sp-box" aria-hidden="true"></span></button>`).join('')}</div>
      <div class="actions"><button type="button" class="btn big primary" data-sp-add="1">${plusIcon}Add Samples to Project</button></div>
      <details class="more sp-how"><summary>How to Test a Sample</summary><ol class="fix-steps">${SAMPLE_STEPS.map(x => `<li>${esc(x)}</li>`).join('')}</ol></details></section>`;
  }
  // a sample of a color on the project: one more on its line if it's there, or a line of its own
  function addSample(c) {
    const x = session.items.find(i => i.ref === c.id);
    if (x) { const k = cartOf(x); k.sample = Math.max(1, k.sample + (k.sample ? 0 : 1)); x.cart = k; x.amount = cartLine(k); return false; }
    const it = paintItem(c); it.cart = { sample: 1, quart: 0, gallon: 0, bucket: 0 }; it.amount = cartLine(it.cart);
    session.items.push(Object.assign({ id: newId() }, it));
    return true;
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !state.ready) return;
    if (t.dataset.sp && samplePicks) { const id = t.dataset.sp, on = !samplePicks.has(id); if (on) samplePicks.add(id); else samplePicks.delete(id); t.setAttribute('aria-pressed', String(on)); }
    if (t.dataset.spAdd && samplePicks) {
      const cs = [...samplePicks].map(id => E.findColor(id)).filter(Boolean);
      if (!cs.length) { toast('Tap the colors to sample first'); return; }
      cs.forEach(addSample); saveSession(); updateListBtn(true);
      toast(`Added ${cs.length === 1 ? 'a sample' : cs.length + ' samples'} to ${sessionTitle()}`);
    }
    if (t.dataset.sampleOne) { const c = E.findColor(t.dataset.sampleOne); if (c) { addSample(c); saveSession(); updateListBtn(true); toast(`Added a sample of ${c.name} to ${sessionTitle()}`); } }
  });
  function addToList(item) {
    if (!item) return;
    session.items.push(Object.assign({ id: newId() }, item));
    saveSession(); updateListBtn(true);
    toast(`Added ${item.kind === 'custom' ? '#' + item.hex : item.name} to ${sessionTitle()}`);
  }
  // the Add to Project buttons: tap again to take it back off
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-add]'); if (!t || !state.ready) return;
    const ref = t.dataset.add;
    const i = session.items.findIndex(x => x.ref === ref);
    if (i >= 0) { const was = session.items[i]; session.items.splice(i, 1); saveSession(); updateListBtn(); toast(`Took ${was.name} off ${sessionTitle()}`); return; }
    if (ref.startsWith('#')) addToList(customItem(ref.slice(1)));
    else if (ref.startsWith('fix:')) { const p = FX.find(ref.slice(4)); if (p) addToList(fixItem(p)); }
    else {
      const stainHit = state.results.stain && state.results.stain.results.concat(state.results.stain.finalists || []).some(r => r.id === ref);
      const c = E.findColor(ref);
      if (c && !stainHit) addToList(paintItem(c)); else { const x = stainResultFor(ref); if (x) addToList(stainItem(x.R, x.r)); }
    }
    updateListBtn();
  });
  function fileSession(s) {
    // an empty project is only kept if someone gave it a name
    if (isKiosk() || (!s.items.length && !(s.name || '').trim())) return false;
    past = [s].concat(past.filter(p => p.id !== s.id)).slice(0, PAST_MAX);
    savePast(); return true;
  }
  // ================================================================
  // SEE IT ALL TOGETHER: every color in the project at once, each where it goes: the walls, trim and cabinets
  // inside; the siding, trim and front door on the house; the stain on the deck out back (with the back of the
  // house, so the house color and the deck stain are seen side by side) and on the fence.
  // ================================================================
  const WHERE = {
    walls: ['Walls', 'in'], ceil: ['Ceiling', 'in'], trim: ['Trim', 'in'], door: ['Doors', 'in'], cab: ['Cabinets', 'in'], wain: ['Wainscoting', 'in'],
    fire: ['Fireplace', 'in'], floor: ['Floor', 'in'], furn: ['Furniture', 'in'],
    body: ['House Siding', 'out'], xtrim: ['House Trim', 'out'], xdoor: ['Front Door', 'out'], shut: ['Shutters', 'out'], gdoor: ['Garage Door', 'out'], step: ['Porch Floor', 'out'],
    deck: ['Deck', 'deck'], fence: ['Fence', 'fence'], none: ['Don’t Show It', ''],
  };
  const PAINT_WHERE = ['walls', 'ceil', 'trim', 'door', 'cab', 'wain', 'fire', 'floor', 'body', 'xtrim', 'xdoor', 'shut', 'gdoor', 'step', 'deck', 'fence', 'none'];
  const STAIN_WHERE = ['floor', 'cab', 'furn', 'trim', 'door', 'wain', 'body', 'xdoor', 'gdoor', 'shut', 'deck', 'fence', 'none'];
  const STAIN_TO = { floors: 'floor', stairs: 'floor', cabinets: 'cab', builtins: 'cab', furniture: 'furn', tabletop: 'furn', trim: 'trim', doors: 'door', paneling: 'wain', deck: 'deck', dock: 'deck', outdoor: 'deck', pergola: 'deck', playset: 'deck', fence: 'fence', siding: 'body', shed: 'body', log: 'body', front_door: 'xdoor', garage_door: 'gdoor', shutters: 'shut' };
  const ZONES = [['in', 'Inside'], ['out', 'Front of the House'], ['deck', 'Out Back'], ['fence', 'The Fence']];
  // words people type in "Where it goes" (and older items, saved before the app kept the job)
  const PLACE_WORDS = [[/front door|entry door/, 'xdoor'], [/garage/, 'gdoor'], [/shutter/, 'shut'], [/deck|dock|pergola|patio|playset|swing ?set|outdoor/, 'deck'], [/fence/, 'fence'], [/porch/, 'step'],
    [/siding|exterior|outside|house body/, 'body'], [/ceiling/, 'ceil'], [/cabinet|vanity|built.?in|island/, 'cab'], [/wainscot|panel/, 'wain'], [/fireplace|mantel/, 'fire'], [/floor|stair/, 'floor'],
    [/trim|baseboard|molding|moulding|casing/, 'trim'], [/door/, 'door'], [/furniture|table|dresser|chair/, 'furn'],
    [/wall|room|living|bed|kitchen|bath|dining|office|entry|hall|nursery|kid|laundry|basement|den/, 'walls']];
  const isStainItem = x => x.kind === 'stain' && !!S.find(x.ref);
  const placeOfTarget = t => (t === 'accent' ? 'walls' : t);
  function guessPlace(x) {
    const stain = isStainItem(x), ok = stain ? STAIN_WHERE : PAINT_WHERE;
    if (x.place && ok.includes(x.place)) return x.place;
    if (x.part && ok.includes(x.part)) return x.part;
    if (stain && STAIN_TO[x.target]) return STAIN_TO[x.target];
    if (!stain && x.space && E.SPACES[x.space]) { const t = placeOfTarget(targetFor(x.space)); return ok.includes(t) ? t : 'walls'; }
    const txt = String(x.area || '').toLowerCase().trim();
    if (!stain) { const sp = Object.entries(E.SPACES).find(([, v]) => v.label.toLowerCase() === txt); if (sp) { const t = placeOfTarget(targetFor(sp[0])); if (ok.includes(t)) return t; } }
    else { const j = Object.entries(S.JOBS).find(([, v]) => txt.startsWith(v.label.toLowerCase())); if (j && STAIN_TO[j[0]]) return STAIN_TO[j[0]]; }
    for (const [re, p] of PLACE_WORDS) if (re.test(txt) && ok.includes(p)) return p === 'trim' && /house|exterior|outside/.test(txt) ? 'xtrim' : p;
    return '';
  }
  // every item's place: the ones it can tell, then the others where nothing's been put yet
  function placements(items) {
    const out = new Map(), used = new Set();
    for (const x of items) { const p = guessPlace(x); if (p) { out.set(x.id, p); if (p !== 'none') used.add(p); } }
    const side = s => [...used].some(p => WHERE[p] && WHERE[p][1] === s);
    const outside = side('out') || side('deck') || side('fence'), inside = side('in');
    for (const x of items) {
      if (out.has(x.id)) continue;
      let order;
      if (isStainItem(x)) order = S.find(x.ref).use === 'exterior' ? ['deck', 'fence', 'body'] : ['floor', 'cab', 'furn'];
      else {
        const c = E.findColor(x.ref), white = (c ? c.lrv : C.lrvFromHex(x.hex || 'CCCCCC')) >= 80;
        const ins = white ? ['trim', 'ceil', 'door'] : ['walls', 'cab', 'door', 'fire'], outs = white ? ['xtrim', 'body', 'xdoor'] : ['body', 'xdoor', 'shut'];
        // a project that's only outside keeps it outside; otherwise inside first, then the house
        order = outside && !inside ? outs : ins.concat(outs);
      }
      const p = order.find(q => !used.has(q)) || order[0];
      out.set(x.id, p); used.add(p);
    }
    return out;
  }
  // a stain item's look on its wood (the wood it was picked for, or the usual one for that job)
  function stainTexOf(x) {
    const st = S.find(x.ref); if (!st) return null;
    let sp = x.wood && WD.SPECIES[x.wood] ? x.wood : '';
    if (!sp) { const lbl = String(x.area || '').split(',').pop().trim().toLowerCase(); const hit = Object.entries(WD.SPECIES).find(([, v]) => v.label.toLowerCase() === lbl); if (hit) sp = hit[0]; }
    if (!sp) sp = (S.JOBS[x.target] || {}).wood || st.ref || 'pine';
    if (!WD.SPECIES[sp]) sp = 'pine';
    return { sp, stain: stainSpec(st) };
  }
  // a paint color on a deck or fence: a solid color over the boards
  const solidTex = hex => ({ sp: 'pine', stain: { hex, type: 'solid', solid: true, solidHex: hex, ref: '', refMix: 0 } });
  function togetherZones(items, place) {
    const zones = {};
    for (const x of items) { const p = place.get(x.id), z = p && WHERE[p] ? WHERE[p][1] : ''; if (z) (zones[z] = zones[z] || []).push({ x, p }); }
    // the deck picture has the back of the house in it, so the siding and house trim show there too
    if (zones.deck) for (const e of zones.out || []) if (['body', 'xtrim'].includes(e.p)) zones.deck.push(e);
    return zones;
  }
  const ROOMS_TOGETHER = ['living', 'bedroom', 'dining', 'kitchen', 'office', 'entry', 'bath'];
  function togetherSpec(zone, list) {
    const at = p => list.filter(e => e.p === p).map(e => e.x).pop();   // two colors in one place: the later one shows
    const mainItem = zone === 'in' ? at('walls') : at('body');
    const main = mainItem && mainItem.kind !== 'stain' ? E.findColor(mainItem.ref) : null;
    const places = new Set(list.map(e => e.p));
    let ids;
    if (zone === 'in') {
      ids = places.has('cab') ? ['kitchen', 'island', 'bath', 'laundry'] : places.has('furn') ? ['diningset', 'dresser', 'office'] : places.has('fire') ? ['fireplace', 'living'] : places.has('wain') ? ['dining', 'living', 'bath', 'entry'] : null;
      if (!ids) { const own = list.map(e => OWN_SCENE[e.x.space]).find(Boolean); ids = own ? [own].concat(ROOMS_TOGETHER.filter(s => s !== own)) : ROOMS_TOGETHER.slice(); }
    }
    if (zone === 'out') ids = places.has('shut') ? ['colonial', 'house', 'cottage', 'farmhouse'] : places.has('step') ? ['porch', 'farmhouse', 'colonial'] : places.has('gdoor') ? ['house', 'colonial', 'modern'] : HOUSES.slice();
    if (zone === 'deck') ids = ['deck', 'pergola', 'patioset', 'dock'];
    if (zone === 'fence') ids = ['fence', 'picket'];
    const texParts = {}, show = [];
    for (const e of list) {
      if (e.x.kind === 'stain') { const t = stainTexOf(e.x); if (t) texParts[e.p] = t; }
      else if (['deck', 'fence'].includes(e.p) && e.x.hex) texParts[e.p] = solidTex(e.x.hex.toUpperCase());
      if (['shut', 'gdoor'].includes(e.p)) show.push(e.p);
    }
    const pairs = main ? E.pairings(main, { collections: settings.collections }) : null;
    const roles = sceneId => {
      const r = main ? paintRoles(sceneId, main, { space: zone === 'in' ? 'living' : 'ext_body' }, pairs) : Object.assign({}, STAIN_ROLES);
      for (const e of list) {
        if (e.x.kind === 'stain' || !e.x.hex || ['deck', 'fence'].includes(e.p)) continue;
        const hex = e.x.hex.toUpperCase();
        for (const role of (PARTS[e.p] || { roles: [] }).roles) r[role] = hex;
        if (e.p === 'cab') r.vanity = hex;
      }
      return r;
    };
    return { key: 'together:' + zone, partKey: 'together:' + zone, ids, answers: null, label: (ZONES.find(z => z[0] === zone) || [])[1], roles, texParts, show, stain: false, color: main };
  }
  function renderTogether() {
    const items = session.items.filter(x => /^[0-9A-F]{6}$/i.test(x.hex || ''));
    const place = placements(items), zones = togetherZones(items, place);
    const shown = ZONES.filter(([z]) => zones[z] && zones[z].length);
    const whereOpts = x => (isStainItem(x) ? STAIN_WHERE : PAINT_WHERE).map(k => [k, WHERE[k][0]]);
    const line = x => [x.brand, x.name, x.code].filter(Boolean).join(' ');
    view().innerHTML = `<div class="page together">
      ${backBtn('Back to the Project', 'data-go="list"')}
      <div class="page-head"><p class="eyebrow">${esc(sessionTitle())}</p><h1>See It All Together</h1><p>Every color in the project at once, each where it goes. Change where a color goes at the bottom, or tap any part of a picture to try something else.</p></div>
      ${!items.length ? `<div class="empty"><h2>Nothing to show yet</h2><p class="muted">Add paint or stain colors to the project, then come back to see them together.</p><div class="actions stack"><button type="button" class="btn big primary" data-go="list">Back to the Project</button></div></div>`
        : !shown.length ? '<p class="muted">Every color is set to “Don’t Show It”. Pick where one goes below.</p>' : ''}
      ${shown.map(([z, label]) => `<section class="tg-zone" aria-labelledby="tg-${z}-h"><h2 id="tg-${z}-h">${esc(label)}</h2>${sceneBox('tg-' + z)}
        <ul class="tg-legend">${zones[z].map(e => `<li><span class="sw" ${swStyle(e.x.hex)}></span><span><b>${esc(WHERE[e.p][0])}:</b> ${esc(line(e.x))}</span></li>`).join('')}</ul></section>`).join('')}
      ${items.length ? `<section class="section tg-where-sec" aria-labelledby="tgWhereH"><h2 id="tgWhereH">Where Each Color Goes</h2><div class="tg-where">${items.map(x => `<div class="tg-row"><span class="sw" ${swStyle(x.hex)}></span><span class="tg-name"><b>${esc(x.name)}</b><small>${esc([x.brand, x.code, x.kind === 'stain' ? 'Stain' : ''].filter(Boolean).join(' · '))}</small></span>${selectHtml('tgw-' + x.id, whereOpts(x), place.get(x.id), 'Goes on', v => { x.place = v; saveSession(); const y = window.scrollY; teardownScenes(); renderTogether(); window.scrollTo(0, y); })}</div>`).join('')}</div></section>` : ''}
    </div>`;
    for (const [z] of shown) mountScene('tg-' + z, togetherSpec(z, zones[z]));
  }
  function renderList() {
    const items = session.items;
    const paintRefs = items.filter(x => E.findColor(x.ref));
    view().innerHTML = `<div class="page narrow">
      <div class="page-head"><p class="eyebrow">Project</p><h1>${esc(sessionTitle())}</h1><p>Everything for this job in one place. Print it, email it, or bring it to the paint desk.</p></div>
      <div class="list-head"><label class="field">What’s this project for?<input type="text" class="input" id="listName" value="${esc(session.name || '')}" placeholder="Smith kitchen, Mom’s porch..." maxlength="60" autocomplete="off"></label>
        <label class="field">Notes for the printout<input type="text" class="input" id="listNotes" value="${esc(session.notes || '')}" placeholder="Phone number, due date..." maxlength="160" autocomplete="off"></label></div>
      ${items.length ? `<ol class="items">${items.map((x, i) => `<li class="item"><span class="n">${i + 1}</span><button type="button" class="sw${x.kind === 'fix' ? ' fix-sw' : ''}" ${x.hex ? swStyle(x.hex) : 'style="background:var(--surface-2)"'} data-open-item="${esc(x.ref)}" aria-label="Open ${esc(x.name)}">${x.kind === 'fix' ? fixIc((FX.find(x.ref.slice(4)) || {}).icon, 30) : ''}</button>
          <span class="what"><input type="text" class="area" data-area="${esc(x.id)}" value="${esc(x.area)}" placeholder="Where it goes" aria-label="Where item ${i + 1} goes" maxlength="40"><b>${esc([x.brand, x.name, x.code].filter(Boolean).join(' '))}</b><span>${esc(x.kind === 'fix' ? x.tools : [x.finish, x.product, x.amount].filter(Boolean).join(' · '))}</span>${x.kind === 'fix' ? '' : `<button type="button" class="ie-btn${needsInfo(x) ? ' need' : ''}" data-item-edit="${esc(x.id)}">${needsInfo(x) ? (x.kind === 'stain' ? 'Add how much' : 'Add sheen & amount') : (x.kind === 'stain' ? 'Change how much' : 'Change sheen & amount')}</button>`}</span>
          <button type="button" class="icon-btn" data-del-item="${esc(x.id)}" aria-label="Remove ${esc(x.name)}">${xIcon}</button></li>`).join('')}</ol>
        <button type="button" class="tg-cta" data-go="together"><span class="tg-cta-sws" aria-hidden="true">${items.slice(0, 4).map(x => `<i ${x.hex ? swStyle(x.hex) : ''}></i>`).join('')}</span><span class="tg-cta-txt"><b>See It All Together</b><span>Every color in this project at once, each where it goes${items.some(x => x.kind === 'stain') ? ', the stain too' : ''}</span></span>${chev('right', 22)}</button>
        <button type="button" class="ticket-cta" data-list="ticket">${QR_IC}<span><b>Paint Desk Ticket</b><span>A code the paint desk scans to see exactly what to mix</span></span>${chev('right', 22)}</button>
        <div class="actions stack"><button type="button" class="btn big primary" data-list="print">${ic('print', 22)}Print</button><button type="button" class="btn big primary" data-list="email">${mailIcon}Email It</button><button type="button" class="btn big" data-go="home">${plusIcon}Add More</button></div>
        <details class="more"><summary>More Things to Do</summary><div class="actions">${paintRefs.length ? '<button type="button" class="btn" data-list="present">Show Colors Full Screen</button>' : ''}${paintRefs.length > 1 ? '<button type="button" class="btn" data-list="compare">Compare the Colors</button>' : ''}<button type="button" class="btn" data-list="copy">Copy as Text</button><button type="button" class="btn" data-list="link">Copy a Link to It</button><button type="button" class="btn ghost" data-project-new="1">Start a New Project</button></div></details>`
        : `<div class="empty"><h2>Nothing in this project yet</h2><p class="muted">Find a color, then tap Add to Project. Everything you add lands here.</p><div class="actions stack"><button type="button" class="btn big primary" data-start="paint">Find a Paint Color</button>${jobOn('stain') ? '<button type="button" class="btn big" data-start="stain">Find a Stain</button>' : ''}<button type="button" class="btn big" data-go="lookup">Look Up a Color</button></div></div>`}
      ${items.length || (session.name || '').trim() ? `<div class="proj-delete"><button type="button" class="btn ghost danger" data-list="delete">${trashIcon}Delete This Project</button></div>` : ''}
      ${isKiosk() ? '' : `<section class="section" aria-labelledby="pastH"><h2 id="pastH">Earlier Projects</h2>${past.length ? `<div class="past">${past.map(s => `<div class="past-item"><span class="mini-sws">${s.items.slice(0, 5).map(x => `<i ${x.hex ? swStyle(x.hex) : ''}></i>`).join('')}</span><span><b>${esc(titleOf(s))}</b><span class="when">${s.items.length} item${s.items.length === 1 ? '' : 's'} · ${esc(whenOf(s.updated))}</span></span>
          <span class="btns"><button type="button" class="btn small" data-past-open="${esc(s.id)}">Open</button><button type="button" class="btn small" data-past-print="${esc(s.id)}">Print</button><button type="button" class="btn small" data-past-email="${esc(s.id)}">Email</button><button type="button" class="btn small ghost danger" data-past-del="${esc(s.id)}" aria-label="Delete ${esc(titleOf(s))}">Delete</button></span></div>`).join('')}</div><p class="muted small">The last ${PAST_MAX} projects stay on this device.</p>` : '<p class="muted">When you start a new project, this one is kept here.</p>'}</section>`}
    </div>`;
    $('#listName').addEventListener('input', e => { session.name = e.target.value; saveSession(); $('.page-head h1').textContent = sessionTitle(); updateListBtn(); });
    $('#listNotes').addEventListener('input', e => { session.notes = e.target.value; saveSession(); });
    $$('[data-area]').forEach(inp => inp.addEventListener('input', () => { const x = session.items.find(i => i.id === inp.dataset.area); if (x) { x.area = inp.value; saveSession(); } }));
  }
  view().addEventListener('click', e => {
    if (state.view !== 'list') return;
    const t = e.target.closest('button'); if (!t) return;
    const act = t.dataset.list;
    if (act === 'print') printPreview(session);
    if (act === 'email') openEmail(session);
    if (act === 'present') openPresent();
    if (act === 'compare') openCompare();
    if (act === 'copy') copyText(sheetText(session), 'Copied the whole project');
    if (act === 'link') shareLink(session).then(l => copyText(l, 'Copied a link. Anyone who opens it sees these colors.'));
    if (act === 'delete') askDelete(session);
    if (act === 'ticket') openTicketCode(session);
    if (t.dataset.delItem) {
      const id = t.dataset.delItem, li = t.closest('li');
      const done = () => { session.items = session.items.filter(x => x.id !== id); saveSession(); updateListBtn(); if (state.view === 'list') renderList(); };
      if (li && !reduced()) { li.classList.add('leaving'); setTimeout(done, 190); } else done();
    }
    if (t.dataset.openItem) {
      const ref = t.dataset.openItem;
      if (ref.startsWith('#')) { state.query = ref; go('lookup'); }
      else if (ref.startsWith('fix:')) go('fix/' + ref.slice(4));
      else if (E.findColor(ref) || S.find(ref)) go('color/' + encodeURIComponent(ref));
    }
    if (t.dataset.pastOpen) {
      const p = past.find(s => s.id === t.dataset.pastOpen); if (!p) return;
      fileSession(session); past = past.filter(s => s.id !== p.id); savePast();
      session = p; saveSession(); updateListBtn(); renderList(); toast(`Opened ${sessionTitle()}`);
    }
    if (t.dataset.pastPrint) { const p = past.find(s => s.id === t.dataset.pastPrint); if (p) printPreview(p); }
    if (t.dataset.pastEmail) { const p = past.find(s => s.id === t.dataset.pastEmail); if (p) openEmail(p); }
    if (t.dataset.pastDel) { const p = past.find(s => s.id === t.dataset.pastDel); if (p) askDelete(p); }
  });

  // ---- deleting a project (the open one or an earlier one): asked once, plainly, because it can't be undone ----
  const trashIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>';
  let deleting = null;
  function askDelete(s) {
    deleting = s;
    const n = s.items.length;
    openModal('Delete This Project?', `<p style="font-size:1.1rem"><b>${esc(titleOf(s))}</b>${n ? ` and the ${n} thing${n === 1 ? '' : 's'} in it` : ''} will be deleted from this device. This can’t be undone.</p>
      <div class="modal-foot"><button type="button" class="btn big ghost" data-modal-close="1">Keep It</button><span class="grow"></span><button type="button" class="btn big danger" data-del-confirm="1">${trashIcon}Delete Project</button></div>`);
  }
  $('#modal').addEventListener('click', e => {
    if (!e.target.closest('[data-del-confirm]') || !deleting) return;
    const s = deleting, name = titleOf(s);
    deleting = null; closeModal();
    if (s === session) {
      // the open one: it's gone, a fresh empty project takes its place, and you're back home
      session = blankSession(); saveSession(); updateListBtn();
      go('');
    } else { past = past.filter(p => p.id !== s.id); savePast(); renderList(); }
    toast(`Deleted ${name}`);
  });

  // ---- starting a project: name it, and the one that was open is kept under Earlier Projects ----
  function openPast(id) {
    const p = past.find(s => s.id === id); if (!p) return;
    fileSession(session); past = past.filter(s => s.id !== p.id); savePast();
    session = p; saveSession(); updateListBtn();
  }
  function openStartProject() {
    openModal('Start a Project', `<p style="font-size:1.1rem">A project keeps the colors, stains and shopping lists for one job together, so you can print or email them all at once.</p>
      <label class="field">What’s it for?<input type="text" class="input" id="projName" placeholder="Smith kitchen, Mom’s porch, back deck..." maxlength="60" autocomplete="off" enterkeyhint="go"></label>
      ${session.items.length ? `<p class="muted">${esc(sessionTitle())} (${session.items.length} item${session.items.length === 1 ? '' : 's'}) will be kept under Earlier Projects.</p>` : ''}
      <div class="modal-foot"><button type="button" class="btn big ghost" data-modal-close="1">Cancel</button><span class="grow"></span><button type="button" class="btn big primary" data-project-start="1">${plusIcon}Start Project</button></div>`);
    const inp = $('#projName'); inp.focus();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-project-start]').click(); } });
  }
  function startProject(name) {
    const filed = fileSession(session);
    session = Object.assign(blankSession(), { name: (name || '').trim().slice(0, 60) });
    saveSession(); updateListBtn(); closeModal();
    if (state.view === 'list') { renderList(); window.scrollTo(0, 0); } else go('list');
    toast(`Started ${sessionTitle()}${filed ? '. The last project is under Earlier Projects.' : ''}`);
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !state.ready) return;
    if (t.dataset.projectNew) { openStartProject(); return; }
    if (t.dataset.projectStart) { startProject(($('#projName') || {}).value); return; }
    if (t.dataset.pastHome) { openPast(t.dataset.pastHome); go('list'); toast(`Opened ${sessionTitle()}`); }
  });

  // ---- emailing a project: the person's email app opens with the whole list written in ----
  // ---- a project in a link ----
  // The whole project rides inside the link itself, after the # (which browsers never send to the web host), so
  // there's no server and no account. Whoever opens it sees every color in the app, can tap one to see it in a
  // room, and can save the project to their own device.
  const siteUrl = () => location.origin + location.pathname;
  const SHARE_KEYS = ['kind', 'ref', 'area', 'brand', 'name', 'code', 'hex', 'finish', 'product', 'primer', 'amount', 'tools', 'loc'];
  const toB64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const fromB64u = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)), ch => ch.charCodeAt(0));
  const squeeze = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  async function packProject(s, compact) {
    // compact (for a QR code): a color the app knows travels as its number only, a paint line as its short name,
    // and the roller and brush and where to find it stay behind (the desk doesn't need them)
    const items = s.items.slice(0, 120).map(x => {
      const known = compact && x.kind !== 'stain' && E.findColor(x.ref), lid = compact && (x.line || lineMap().byLabel[x.product]);
      const a = SHARE_KEYS.map(k => (compact && (k === 'loc' || (k === 'tools' && x.kind !== 'fix'))) || (known && ['brand', 'name', 'code', 'hex'].includes(k)) ? '' : k === 'product' && lid && lineMap().byId[lid] ? '@' + lid : String(x[k] || '')); while (a.length && !a[a.length - 1]) a.pop(); return a; });
    const raw = new TextEncoder().encode(JSON.stringify({ v: 1, n: (s.name || '').trim(), t: (s.notes || '').trim(), s: storeName(), d: Date.now(), i: items }));
    // squeezed small when the browser can ("z"), plain otherwise ("j")
    if (typeof CompressionStream === 'function') { try { return 'z' + toB64u(await squeeze(raw, new CompressionStream('deflate-raw'))); } catch (e) { /* plain below */ } }
    return 'j' + toB64u(raw);
  }
  // every paint line by its short name and by the name people see
  let lineMaps = null;
  function lineMap() {
    if (lineMaps) return lineMaps;
    const byId = {}, byLabel = {};
    for (const [b, list] of Object.entries(E.PAINT_LINES)) for (const l of list) { const lab = lineLabel(b, l); byId[l.id] = lab; byLabel[lab] = l.id; }
    return (lineMaps = { byId, byLabel });
  }
  const shareLink = async s => `${siteUrl()}#/p/${await packProject(s)}`;
  const ticketLink = async s => `${siteUrl()}#/t/${await packProject(s, true)}`;
  // the ticket's QR code, or '' when a project is too big for one code
  async function ticketQr(s, label) { try { return window.CG.qr.svg(await ticketLink(s), { label: label || 'QR code for the paint desk' }); } catch (e) { return ''; } }
  const QR_IC = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 18.5h1.5M18.5 14h2" stroke-linecap="round"/></svg>';
  // ---- the paint desk ticket: shown as a code to scan at the desk ----
  async function openTicketCode(s) {
    const missing = s.items.filter(needsInfo);
    openModal('Paint Desk Ticket', '<p class="muted">Making the code…</p>');
    const qr = await ticketQr(s);
    if ($('#modalTitle') && $('#modalTitle').textContent !== 'Paint Desk Ticket') return;   // closed or moved on
    openModal('Paint Desk Ticket', `${qr ? `<div class="ticket-qr">${qr}</div><p style="font-size:1.1rem;margin:0">Show this at the paint desk. They scan it with any phone or tablet and see exactly what to mix: every color’s code, the sheen, the paint and how much, to check off as each can is made.</p>` : '<p style="font-size:1.1rem">This project is too big for one code. Print it (the printout has the list), or email it to the desk.</p>'}
      ${missing.length ? `<p class="ticket-miss">${missing.length === 1 ? `<b>${esc(missing[0].name)}</b> still needs` : `<b>${missing.length} things</b> still need`} a sheen or how much. The desk can ask, or add it now with “Add sheen & amount” on the project.</p>` : ''}
      <div class="modal-foot"><button type="button" class="btn big ghost" data-modal-close="1">Close</button><span class="grow"></span>${qr ? '<button type="button" class="btn big" data-ticket-here="1">Open It Here</button>' : ''}<button type="button" class="btn big primary" data-list-print="1">${ic('print', 22)}Print</button></div>`);
  }
  document.addEventListener('click', async e => {
    const t = e.target.closest('#modal button'); if (!t) return;
    if (t.dataset.ticketHere) { const l = await ticketLink(session); closeModal(); go('t/' + l.split('#/t/')[1]); }
    if (t.dataset.listPrint) { closeModal(); printPreview(session); }
  });
  // what the desk sees: big codes, one line per can to mix, each checked off as it's made (kept on that device)
  let ticket = null;
  const tickKey = code => 'tick:' + code.slice(-40);
  function ticketTicks(code) { const all = store.get('ticks', {}) || {}; return Array.isArray(all[tickKey(code)]) ? all[tickKey(code)] : []; }
  function saveTicks(code, ticks) {
    const all = store.get('ticks', {}) || {};
    all[tickKey(code)] = ticks;
    const keys = Object.keys(all); if (keys.length > 30) delete all[keys[0]];
    store.set('ticks', all);
  }
  async function renderTicket(code) {
    view().innerHTML = '<div class="page narrow"><p class="muted">Opening the ticket…</p></div>';
    let P = null;
    try { P = await unpackProject(code); } catch (e) { P = null; }
    if (!current || current.view !== 'ticket' || current.data !== code) return;
    ticket = P ? { code, P } : null;
    if (!P) { view().innerHTML = '<div class="page narrow"><div class="empty"><h1>This ticket doesn’t open</h1><p class="muted">Try scanning the code again, a little closer.</p></div></div>'; return; }
    const ticks = ticketTicks(code);
    const from = [P.store, P.date ? new Date(P.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''].filter(Boolean).join(' · ');
    const row = (x, i) => {
      const c = cartOf(x), done = ticks.includes(i), stain = x.kind === 'stain';
      const code2 = x.code || (x.hex ? '#' + x.hex : '');
      return `<li class="tk-row${done ? ' done' : ''}"><button type="button" class="tk-check" data-tick="${i}" role="checkbox" aria-checked="${done}" aria-label="${esc(x.name)} is mixed"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
        <span class="tk-sw" ${x.hex ? swStyle(x.hex) : 'style="background:var(--surface-2)"'}></span>
        <span class="tk-what"><span class="tk-code">${esc(code2)}</span><b>${esc([x.brand, x.name].filter(Boolean).join(' '))}</b>
          <span class="tk-facts">${[x.area, x.product, stain ? '' : x.finish || '<i class="tk-ask">Sheen: ask</i>'].filter(Boolean).map(v => v.startsWith('<i') ? v : esc(v)).join(' · ')}</span>
          ${x.primer ? `<span class="tk-facts">Primer: ${esc(x.primer)}</span>` : ''}${x.tools ? `<span class="tk-facts">Also: ${esc(x.tools)}</span>` : ''}</span>
        <span class="tk-amt">${cartEmpty(c) ? '<i class="tk-ask">How much: ask</i>' : esc(cartLine(c))}</span></li>`;
    };
    const mix = P.items.map((x, i) => (x.kind === 'fix' ? -1 : i)).filter(i => i >= 0), fixes = P.items.filter(x => x.kind === 'fix');
    const left = mix.filter(i => !ticks.includes(i)).length;
    view().innerHTML = `<div class="page narrow ticket-page">
      <div class="page-head"><p class="eyebrow">Paint Desk Ticket</p><h1>${esc(P.name || 'Paint and Stain List')}</h1><p>${from ? esc(from) + ' · ' : ''}${mix.length} to mix${left && left < mix.length ? `, ${left} left` : !left && mix.length ? ', all done' : ''}</p>${P.notes ? `<p class="tk-notes"><b>Notes</b> ${esc(P.notes)}</p>` : ''}</div>
      <ol class="tk-list">${P.items.map((x, i) => (x.kind === 'fix' ? '' : row(x, i))).join('')}</ol>
      ${fixes.length ? `<section class="tk-also"><h2>Also for This Job</h2>${fixes.map(x => `<p><b>${esc(x.name)}:</b> ${esc(x.tools)}</p>`).join('')}</section>` : ''}
      <div class="actions stack">${mix.length ? `<button type="button" class="btn big primary" data-tk="all">${left ? 'Mark All Mixed' : 'Clear the Checks'}</button>` : ''}<button type="button" class="btn big" data-tk="print">${ic('print', 22)}Print</button><button type="button" class="btn big" data-tk="open">Open as a Project</button></div>
      <p class="muted small">Colors on a screen are a guide. Mix by the code, and check the sheen and size with the customer.</p></div>`;
  }
  view().addEventListener('click', e => {
    if (state.view !== 'ticket' || !ticket) return;
    const t = e.target.closest('button'); if (!t) return;
    const { code, P } = ticket;
    let ticks = ticketTicks(code);
    if (t.dataset.tick != null) { const i = +t.dataset.tick; ticks = ticks.includes(i) ? ticks.filter(v => v !== i) : ticks.concat([i]); saveTicks(code, ticks); renderTicket(code); return; }
    const act = t.dataset.tk;
    if (act === 'all') { const mix = P.items.map((x, i) => (x.kind === 'fix' ? -1 : i)).filter(i => i >= 0); saveTicks(code, mix.every(i => ticks.includes(i)) ? [] : mix); renderTicket(code); }
    if (act === 'print') printPreview({ name: P.name || 'Paint and Stain List', notes: P.notes, items: P.items });
    if (act === 'open') go('p/' + code);
  });
  // the browser's own un-squeezing where it has it, the app's (js/inflate.js) where it doesn't
  async function unsqueeze(bytes) {
    if (typeof DecompressionStream === 'function') { try { return await squeeze(bytes, new DecompressionStream('deflate-raw')); } catch (e) { /* below */ } }
    return window.CG.inflate(bytes);
  }
  // anyone can make a link, so everything read from one is checked and kept short
  async function unpackProject(code) {
    const bytes = fromB64u(code.slice(1));
    const raw = code[0] === 'z' ? await unsqueeze(bytes) : code[0] === 'j' ? bytes : null;
    const o = JSON.parse(new TextDecoder().decode(raw));
    if (!o || o.v !== 1 || !Array.isArray(o.i)) throw new Error('not a project');
    const str = (v, n) => String(v == null ? '' : v).slice(0, n);
    const items = o.i.slice(0, 120).filter(Array.isArray).map(a => {
      const x = {};
      SHARE_KEYS.forEach((k, j) => { x[k] = str(a[j], k === 'tools' ? 240 : k === 'product' ? 120 : 80); });
      x.hex = /^[0-9A-F]{6}$/i.test(x.hex) ? x.hex.toUpperCase() : '';
      if (x.product[0] === '@') x.product = lineMap().byId[x.product.slice(1)] || '';
      if (!['paint', 'stain', 'custom', 'plan', 'fix'].includes(x.kind)) x.kind = '';
      // a color the app knows shows the app's own name, number and color
      const c = x.kind !== 'stain' && E.findColor(x.ref);
      if (c) Object.assign(x, { brand: brandName(c.brand), name: c.name, code: E.codeLabel(c), hex: c.hex, lrv: String(c.lrv) });
      return x;
    });
    return { name: str(o.n, 60), notes: str(o.t, 160), store: str(o.s, 60), date: +o.d || 0, items };
  }
  let shared = null;   // the project from the link being looked at
  const sharedColors = P => P.items.map(x => x.kind !== 'stain' && E.findColor(x.ref)).filter(Boolean);
  const canOpenItem = x => !!x.ref && !x.ref.startsWith('#') && !!(E.findColor(x.ref) || S.find(x.ref));
  async function renderShared(code) {
    view().innerHTML = '<div class="page narrow"><p class="muted">Opening the project…</p></div>';
    let P = null;
    try { P = await unpackProject(code); } catch (e) { P = null; }
    if (!current || current.view !== 'shared' || current.data !== code) return;   // moved on while it opened
    shared = P;
    if (!P) {
      view().innerHTML = `<div class="page narrow"><div class="empty"><h1>This link doesn’t open</h1><p class="muted">Part of it may have been cut off when it was copied. Try tapping it again in the email, or look the colors up here.</p><div class="actions stack"><button type="button" class="btn big primary" data-go="lookup">Look Up a Color</button><button type="button" class="btn big" data-go="home">Go to ColorGenius</button></div></div></div>`;
      return;
    }
    const from = [P.store, P.date ? new Date(P.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''].filter(Boolean).join(', ');
    const row = (x, i) => {
      const sw = `class="sw" ${x.hex ? swStyle(x.hex) : 'style="background:var(--surface-2)"'}`, open = canOpenItem(x), to = `color/${esc(encodeURIComponent(x.ref))}`;
      return `<li class="item"><span class="n">${i + 1}</span>${open ? `<button type="button" ${sw} data-go="${to}" aria-label="See ${esc(x.name)}"></button>` : `<span ${sw}></span>`}
        <span class="what">${x.area ? `<span class="area-ro">${esc(x.area)}</span>` : ''}<b>${esc([x.brand, x.name, x.code].filter(Boolean).join(' '))}</b><span>${esc([x.finish, x.product, x.primer ? 'Primer: ' + x.primer : '', x.amount, x.tools].filter(Boolean).join(' · '))}</span></span>
        ${open ? `<button type="button" class="icon-btn" data-go="${to}" aria-label="See ${esc(x.name)}">${chev('right')}</button>` : '<span></span>'}</li>`;
    };
    view().innerHTML = `<div class="page narrow">
      <div class="page-head"><p class="eyebrow">Shared Project</p><h1>${esc(P.name || 'Paint and Stain List')}</h1><p>${from ? `From ${esc(from)}. ` : ''}Tap a color to see it in a room. Save the project to keep it on this device.</p>${P.notes ? `<p class="muted">Notes: ${esc(P.notes)}</p>` : ''}</div>
      ${P.items.length ? `<ol class="items">${P.items.map(row).join('')}</ol>` : '<p class="muted">There’s nothing in this project.</p>'}
      <div class="actions stack"><button type="button" class="btn big primary" data-shared="save">${plusIcon}Save to My Projects</button>${sharedColors(P).length ? `<button type="button" class="btn big" data-shared="present">${expandIcon(20)}Show Colors Full Screen</button>` : ''}<button type="button" class="btn big" data-shared="print">${ic('print', 22)}Print</button></div>
      <section class="section"><h2>See More Colors</h2><p class="muted">Every color from the big paint brands is in here. Look one up, or answer a few questions to find the right one for a room.</p><div class="actions"><button type="button" class="btn big" data-go="lookup">Look Up a Color</button><button type="button" class="btn big" data-go="home">Find a Color for a Room</button></div></section>
    </div>`;
  }
  view().addEventListener('click', e => {
    if (state.view !== 'shared' || !shared) return;
    const t = e.target.closest('[data-shared]'); if (!t) return;
    const P = shared, act = t.dataset.shared;
    if (act === 'present') openPresent(sharedColors(P));
    if (act === 'print') printPreview({ name: P.name || 'Paint and Stain List', notes: P.notes, items: P.items });
    if (act === 'save') {
      // the project that was open is kept under Earlier Projects, like starting a new one
      const s = Object.assign(blankSession(), { name: P.name, notes: P.notes, items: P.items.map(x => Object.assign({ id: newId() }, x)) });
      if (session.items.length || (session.name || '').trim()) fileSession(session);
      session = s; saveSession(); updateListBtn();
      toast(`Saved ${titleOf(s)} to your projects`);
      go('list');
    }
  });

  // ---- email ----
  // With the EmailJS IDs filled in (js/config.js) the list is sent straight from the site's do-not-reply address,
  // so no email app is needed (a store kiosk has none). Without them, the device's own email app opens instead.
  const mailCfg = () => { const m = (window.CG_CONFIG || {}).email || {}; return m.serviceId && m.templateId && m.publicKey ? m : null; };
  const MAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
  const MAIL_PER_HOUR = 12;   // a shared screen shouldn't become a way to send lots of email
  const mailSubject = s => 'Paint and stain list: ' + titleOf(s);
  // Most addresses are Gmail, so just the name is enough: "@gmail.com" is added (shown in grey after what's
  // typed). The buttons switch the ending; typing an @ means the whole address was typed.
  const MAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'hotmail.com'];
  let mailDomain = MAIL_DOMAINS[0];
  function fullAddr() {
    const v = (($('#mailTo') || {}).value || '').trim().replace(/\s+/g, '');
    if (!v) return '';
    return v.endsWith('@') ? v + mailDomain : v.includes('@') ? v : v + '@' + mailDomain;
  }
  function syncAt() {
    const inp = $('#mailTo'), wrap = inp && inp.closest('.mail-addr'); if (!wrap) return;
    const v = inp.value, at = $('.mail-at', wrap), meas = $('.mail-meas', wrap), cs = getComputedStyle(inp);
    const typedAt = v.includes('@') && !v.endsWith('@');
    wrap.classList.toggle('has-at', typedAt);
    at.textContent = (v.endsWith('@') ? '' : '@') + mailDomain;
    at.classList.toggle('ph', !v);
    for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing']) { meas.style[k] = cs[k]; at.style[k] = cs[k]; }
    meas.textContent = v || inp.placeholder;
    const left = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) + meas.offsetWidth - inp.scrollLeft;
    at.style.left = Math.max(0, Math.min(left, inp.offsetWidth - at.offsetWidth - 12)) + 'px';
    const dom = typedAt ? v.split('@')[1].toLowerCase() : mailDomain;
    $$('[data-mail-dom]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mailDom === dom)));
    const sr = $('#mailFull'); if (sr) sr.textContent = v ? 'Sends to ' + fullAddr() : '';
  }
  function openEmail(s) {
    const cfg = mailCfg();
    const canShare = !cfg && !!(navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ''));
    const intro = cfg
      ? `<p style="font-size:1.1rem">Sends <b>${esc(titleOf(s))}</b> from ColorGenius’s do-not-reply address: every color, code, finish and product, one per line.</p>`
      : `<p style="font-size:1.1rem">Your email app opens with <b>${esc(titleOf(s))}</b> written in: every color, code, finish and product, one per line. Check it, then press Send.</p>`;
    const field = `<label class="field">Their email address<span class="mail-addr"><input type="email" class="input" id="mailTo" placeholder="name" autocomplete="email" inputmode="email" enterkeyhint="send" maxlength="120" aria-describedby="mailFull"><span class="mail-at ph" aria-hidden="true">@gmail.com</span><span class="mail-meas" aria-hidden="true"></span></span><span class="sr-only" id="mailFull" aria-live="polite"></span></label>
      <div class="mail-doms" role="group" aria-label="Email ends in">${MAIL_DOMAINS.map((d, i) => `<button type="button" class="chip plain" data-mail-dom="${d}" aria-pressed="${i === 0}">@${d}</button>`).join('')}</div>
      <p class="muted small" style="margin:0">Just type the name and the ending is added. For any other address, type all of it.${cfg ? '' : ' You can also leave it empty and type it in the email.'}</p>`;
    // a kiosk has no email app of its own, so it only gets the Send button
    const appBtn = cfg ? (isKiosk() ? '' : `<button type="button" class="btn big" data-mail-open="1">Use My Email App</button>`) : `<button type="button" class="btn big primary" data-mail-open="1">${mailIcon}Open Email</button>`;
    openModal(`Email ${titleOf(s)}`, `${intro}${field}<p class="mail-msg" id="mailMsg" role="status" aria-live="polite"></p>
      <div class="modal-foot"><button type="button" class="btn big ghost" data-modal-close="1">Cancel</button><span class="grow"></span>${canShare ? `<button type="button" class="btn big" data-mail-share="1">Share…</button>` : ''}${appBtn}${cfg ? `<button type="button" class="btn big primary" data-mail-send="1">${mailIcon}Send</button>` : ''}</div>`);
    const inp = $('#mailTo'); inp.focus();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ($('[data-mail-send]') || $('[data-mail-open]')).click(); } });
    inp.addEventListener('input', () => { mailMsg(''); syncAt(); });
    inp.addEventListener('scroll', syncAt);
    mailDomain = MAIL_DOMAINS[0];
    requestAnimationFrame(syncAt);
    emailOf = s;
    emailLink = shareLink(s).catch(() => '');
  }
  let emailOf = null, emailLink = Promise.resolve('');
  function mailBody(s, link) {
    return sheetText(s) + (link ? `\n\nSee these colors in ColorGenius: ${link}\nBrowse every color: ${siteUrl()}` : '') + '\n\nColors look different on screens and paper. Check a real chip or sample before buying.';
  }
  // the email itself: a friendly line, a big button to the project in the app, then the list
  function mailHtml(s, link) {
    const where = storeName() ? `your visit to ${esc(storeName())}` : 'ColorGenius';
    const btn = link ? `<p style="margin:18px 0 6px"><a href="${esc(link)}" style="display:inline-block;background:#2f6b5e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">See These Colors in ColorGenius</a></p><p style="margin:4px 0 18px;font-size:13px;color:#555">Tap a color to see it in a room, or save the project on your phone. You can also <a href="${esc(siteUrl())}" style="color:#2f6b5e">browse every color</a>.</p>` : '';
    return `<p style="margin:0 0 4px">Here are the colors from ${where}.</p>${btn}<div style="white-space:pre-wrap;font-family:inherit">${esc(mailBody(s, ''))}</div>`;
  }

  function mailMsg(text, bad) { const m = $('#mailMsg'); if (m) { m.textContent = text; m.classList.toggle('bad', !!bad); } }
  // sends through EmailJS. The template fills in to_email, subject, message_html (and message, as plain text).
  async function sendMail(cfg, to, s, link) {
    const body = mailBody(s, link);
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ service_id: cfg.serviceId, template_id: cfg.templateId, user_id: cfg.publicKey, template_params: {
          to_email: to, subject: mailSubject(s), project_name: titleOf(s), from_name: cfg.fromName || 'ColorGenius (do not reply)',
          message: body, message_html: mailHtml(s, link),
        } }),
      });
      if (!res.ok) throw new Error(`EmailJS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } finally { clearTimeout(timer); }
  }
  document.addEventListener('click', async e => {
    const t = e.target.closest('button'); if (!t || !emailOf) return;
    if (t.dataset.mailDom) {
      const inp = $('#mailTo'); mailDomain = t.dataset.mailDom;
      if (inp.value.includes('@')) inp.value = inp.value.split('@')[0] + '@' + mailDomain;
      mailMsg(''); syncAt(); inp.focus();
      return;
    }
    if (t.dataset.mailSend) {
      const cfg = mailCfg(); if (!cfg) return;
      const to = fullAddr();
      if (!MAIL_RE.test(to)) { mailMsg(to ? `${to} doesn’t look like an email address. Check it and try again.` : 'Type their email address. For Gmail, just the name is enough.', true); $('#mailTo').focus(); return; }
      const now = Date.now(), log = store.get('mailLog', []).filter(x => now - x < 3600e3);
      if (log.length >= MAIL_PER_HOUR) { mailMsg('That’s a lot of email from this screen in an hour. Try again a little later, or print it.', true); return; }
      const s = emailOf;
      t.disabled = true; t.textContent = 'Sending…'; mailMsg('');
      try {
        await sendMail(cfg, to, s, await emailLink);
        store.set('mailLog', log.concat(now));
        closeModal(); emailOf = null;
        toast(`Sent to ${to}`);
      } catch (err) {
        console.warn(err);
        t.disabled = false; t.innerHTML = `${mailIcon}Send`;
        mailMsg(navigator.onLine === false ? 'This device is offline, so it can’t send right now. Try again when it’s back online, or print it.' : 'It didn’t send. Check the address and try again, or print it instead.', true);
      }
    }
    if (t.dataset.mailOpen) {
      // keep only characters an address can have, so nothing typed can add extra mailto fields
      const to = fullAddr().replace(/[^\w.@+-]/g, '');
      const body = mailBody(emailOf, await emailLink);
      const url = `mailto:${to}?subject=${encodeURIComponent(mailSubject(emailOf))}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
      closeModal(); emailOf = null;
      // some email apps cut off very long links, so a long list is also copied to paste in
      if (url.length > 1800) { copyText(body, 'The list is long, so it’s also copied. Paste it in if the email is cut short.'); }
      else toast('Opening your email app');
      window.location.href = url;
    }
    if (t.dataset.mailShare) {
      const s = emailOf;
      try { await navigator.share({ title: mailSubject(s), text: mailBody(s, await emailLink) }); closeModal(); emailOf = null; } catch (err) { /* closed the share sheet */ }
    }
  });

  // ---- the printout: one page, black and white, letters and numbers only, one line per item ----
  const PR_COLS = [['#', 'n'], ['Area', 'area'], ['Brand', 'brand'], ['Color', 'name'], ['Code', 'code'], ['Hex', 'hex'], ['Finish', 'finish'], ['Product', 'product'], ['Primer', 'primer'], ['Amount', 'amount'], ['Roller & Brush', 'tools'], ['Find It', 'loc']];
  const prCell = (x, k, i) => k === 'n' ? String(i + 1) : k === 'hex' ? (x.hex ? '#' + x.hex.toUpperCase() : '') : (x[k] || '');
  const storeName = () => settings.chain && CHAINS[settings.chain] && !CHAINS[settings.chain].other ? CHAINS[settings.chain].label.replace(/ Store$/, '') : '';
  function sheetOf(s, qr) {
    const cols = PR_COLS.filter(([, k]) => ['n', 'area', 'name'].includes(k) || s.items.some((x, i) => prCell(x, k, i)));
    const est = cols.reduce((w, [h, k]) => w + 8 + 5.1 * Math.min(34, Math.max(h.length, ...s.items.map((x, i) => prCell(x, k, i).length))), 0);
    const landscape = est > 540;
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const n = s.items.length;
    const html = `<div class="pr-sheet"><div class="pr-head"><div><div class="pr-title">${esc(titleOf(s))}</div><div class="pr-sub">Paint and Stain List</div></div>
      <div class="pr-meta">${[storeName(), date, n + (n === 1 ? ' item' : ' items')].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>${qr ? `<div class="pr-qr">${qr}<span>Paint desk: scan to mix</span></div>` : ''}</div>
      ${(s.notes || '').trim() ? `<p class="pr-notes"><b>Notes</b> ${esc(s.notes.trim())}</p>` : ''}
      <table><thead><tr>${cols.map(([h, k]) => `<th class="c-${k}">${h}</th>`).join('')}</tr></thead><tbody>${s.items.map((x, i) => `<tr>${cols.map(([, k]) => `<td class="c-${k}">${esc(prCell(x, k, i))}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <div class="pr-foot"><span>Colors look different on screens and paper. Check a real chip or sample before buying.</span><span>ColorGenius</span></div></div>`;
    return { html, landscape };
  }
  function sheetText(s) {
    const lines = [titleOf(s), [storeName(), new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })].filter(Boolean).join(', ')];
    if ((s.notes || '').trim()) lines.push('Notes: ' + s.notes.trim());
    lines.push('');
    s.items.forEach((x, i) => lines.push(`${i + 1}. ${[x.area, [x.brand, x.name, x.code].filter(Boolean).join(' '), x.hex ? '#' + x.hex.toUpperCase() : '', x.finish, x.product, x.primer ? 'Primer: ' + x.primer : '', x.amount, x.tools, x.loc ? 'Find it: ' + x.loc : ''].filter(Boolean).join(' - ')}`));
    return lines.join('\n');
  }
  function printSheet(s) { const sh = sheetOf(s, previewQr); printHtml(sh.html, sh.landscape); }
  function printHtml(html, landscape) {
    $('#printArea').innerHTML = html;
    const page = document.createElement('style'); page.id = 'printPage';
    page.textContent = `@page { size: letter ${landscape ? 'landscape' : 'portrait'}; margin: 0.5in; }`;
    const old = $('#printPage'); if (old) old.remove();
    document.head.appendChild(page);
    document.documentElement.classList.add('printing');
    const done = () => { document.documentElement.classList.remove('printing'); page.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }
  let previewOf = null, previewQr = '';
  function printPreview(s) {
    previewOf = s; previewQr = '';
    const sh = sheetOf(s);
    // the paint desk code goes on the sheet as soon as it's made
    ticketQr(s, 'QR code: the paint desk scans it to see what to mix').then(qr => { if (previewOf !== s || !qr) return; previewQr = qr; const p = $('#modal .paper'); if (p) { p.innerHTML = sheetOf(s, qr).html; fitPaper(); } });
    openModal(`Print ${titleOf(s)}`, `<div class="paper-wrap"><div class="paper${sh.landscape ? ' landscape' : ''}">${sh.html}</div></div>
      <p class="muted">${sh.landscape ? 'Prints sideways so every column fits.' : 'Prints on one letter page.'} One line per item, black and white.</p>
      <div class="modal-foot"><button type="button" class="btn big ghost" data-modal-close="1">Cancel</button><span class="grow"></span><button type="button" class="btn big" data-copy-list="1">Copy as Text</button><button type="button" class="btn big" data-email-now="1">${mailIcon}Email</button><button type="button" class="btn big primary" data-print-now="1">${ic('print', 22)}Print</button></div>`, { wide: true });
    fitPaper();
  }
  function fitPaper() {
    const wrap = $('#modal .paper-wrap'), paper = $('#modal .paper'); if (!wrap || !paper) return;
    const pageH = paper.classList.contains('landscape') ? 816 : 1056;
    const k = Math.max(0.28, Math.min(1, (wrap.clientWidth - 24) / paper.offsetWidth, (window.innerHeight - 300) / pageH));
    paper.style.transform = `scale(${k})`;
    paper.style.marginLeft = Math.max(0, (wrap.clientWidth - 24 - paper.offsetWidth * k) / 2) + 'px';
    wrap.style.height = Math.ceil(paper.offsetHeight * k + 24) + 'px';
  }
  window.addEventListener('resize', () => { if (!$('#modal').hidden && $('#modal .paper')) fitPaper(); });
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !t.closest('#modal')) return;
    if (t.dataset.printNow && previewOf) printSheet(previewOf);
    if (t.dataset.emailNow && previewOf) openEmail(previewOf);
    if (t.dataset.copyList && previewOf) copyText(sheetText(previewOf), 'Copied the whole project');
  });

  // ---- full screen colors and compare ----
  // Full screen shows the project's paint colors side by side, or one color filling the whole screen (from a
  // color's page, in the light it was being seen in).
  function expandIcon(size) { return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`; }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-fullscreen]'); if (!t || !state.ready) return;
    const c = E.findColor(t.dataset.fullscreen); if (c) openPresent([c], state.light);
  });
  function openPresent(only, light0) {
    const colors = only || session.items.map(x => E.findColor(x.ref)).filter(Boolean); if (!colors.length) return;
    const el = $('#present'); const light = light0 || state.presentLight || 'none';
    if (light0) state.presentLight = light0;
    el.innerHTML = `<div class="present-strip">${colors.map(c => `<div class="present-col" ${swStyle(c.hex, light)}><div class="lbl"><b>${esc(c.name)}</b><span>${esc(brandName(c.brand))} ${esc(E.codeLabel(c))}</span></div></div>`).join('')}</div>
      <div class="present-bar">${selectHtml('presentLight', LIGHT_OPTS(), light, 'Light', v => { state.presentLight = v; $$('#present [data-hex]').forEach(x => { x.dataset.light = v; x.style.backgroundColor = paint(x.dataset.hex, v); }); })}<button type="button" class="btn big" data-present-close="1">Close</button></div>`;
    el.hidden = false; syncBars();
    $('[data-present-close]', el).focus();
    el.onclick = e => { if (e.target.closest('[data-present-close]')) closePresent(); };
    // full screen where the browser allows it (iPhones don't for pages; the colors still fill the window)
    const enter = el.requestFullscreen || el.webkitRequestFullscreen;
    if (enter) { try { const p = enter.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed here */ } }
  }
  function closePresent() {
    closePop(); $('#present').hidden = true; syncBars();
    if (fsElement()) { const leave = document.exitFullscreen || document.webkitExitFullscreen; try { const p = leave && leave.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) { /* already out */ } }
  }
  // leaving full screen some other way (the Esc key, the browser's own button) shouldn't leave a menu stranded
  document.addEventListener('fullscreenchange', () => { if (pop && !popHost().contains(pop)) closePop(); });
  function openCompare() {
    const colors = session.items.map(x => E.findColor(x.ref)).filter(Boolean);
    if (colors.length < 2) { toast('Add at least two paint colors to compare'); return; }
    const answers = state.results.paint ? state.results.paint.answers : E.DEFAULT_ANSWERS;
    const rows = colors.map(c => ({ c, d: C.describe(c.hex, c.lrv), pc: E.prosCons(c, answers, { inStoreSamples: settings.inStoreSamples }, colors) }));
    const cell = (k, f) => `<div class="k">${k}</div>${rows.map(r => `<div>${f(r)}</div>`).join('')}`;
    openModal(`Compare ${colors.length} Colors`, `<p class="muted">Scroll sideways to see every color.</p><div class="cmp-wrap"><div class="cmp" style="--n:${rows.length}">
      <div class="k"></div>${rows.map(r => `<button type="button" class="cmp-head" data-go="color/${esc(encodeURIComponent(r.c.id))}"><span class="sw" ${swStyle(r.c.hex)}></span><b>${esc(r.c.name)}</b><span class="muted">${esc(brandName(r.c.brand))} ${esc(E.codeLabel(r.c))}</span></button>`).join('')}
      ${cell('Light Reflectance', r => `<span class="mono">${r.c.lrv}</span>, ${esc(r.d.depth)}`)}
      ${cell('Color family', r => esc(r.d.familyName))}
      ${cell('Undertone', r => esc(r.d.undertone === 'neutral' ? 'None' : cap(r.d.undertone)))}
      ${cell('Good things', r => `<ul>${r.pc.pros.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`)}
      ${cell('Watch out for', r => r.pc.cons.length ? `<ul>${r.pc.cons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted">Nothing</span>')}
      ${cell('Paint to use', r => { const p = bestLine(r.c, answers); return p ? `<b>${esc(p.r.best.line.name)}</b><br><span class="muted">${esc(brandName(p.brand))}</span>` : '<span class="muted">Not listed</span>'; })}
    </div></div>`, { wide: true });
  }
  function openSheens(colorId) {
    const c = E.findColor(colorId); if (!c) return;
    const R = state.results.paint, sp = E.SPACES[(R && R.answers.space) || 'living'] || E.SPACES.living;
    openModal('Compare the Finishes', `<p class="muted" style="font-size:1.05rem">${esc(c.name)} in each finish. Shinier finishes clean more easily but show more bumps. For ${esc(sp.label.toLowerCase())} we suggest <b>${esc(sp.sheen)}</b>.</p>
      <div class="sheens">${E.SHEENS.map(s => `<div class="sheen${sp.sheens.includes(s.id) ? ' rec' : ''}"><span class="sw" data-hex="${c.hex}" style="background-color:${paint(c.hex)};--shine:${s.shine}"></span><div class="txt"><b>${esc(s.name)}${sp.sheens.includes(s.id) ? ' <span class="badge good">Suggested</span>' : ''}</b><ul>${s.pros.slice(0, 2).map(x => `<li>${esc(x)}</li>`).join('')}</ul><span class="muted">Best for ${esc(s.best.toLowerCase())}</span></div></div>`).join('')}</div>`, { wide: true });
  }
  document.addEventListener('click', e => { const t = e.target.closest('[data-sheens]'); if (t) openSheens(t.dataset.sheens); });

  // ================================================================
  // POPUPS, COPYING AND MESSAGES
  // ================================================================
  let modalFocus = null;
  let modalClosing = 0;
  function openModal(title, body, opts) {
    const el = $('#modal');
    const wasClosing = !!modalClosing;
    if (wasClosing) { clearTimeout(modalClosing); modalClosing = 0; el.classList.remove('closing'); }
    const swap = !el.hidden && !wasClosing; // already open: change what's in it without playing the pop-in again
    if (!swap && !wasClosing) modalFocus = document.activeElement;
    el.innerHTML = `<div class="modal-card${opts && opts.wide ? ' wide' : ''}${swap ? ' swap' : ''}" role="document"><div class="modal-head"><h2 id="modalTitle">${esc(title)}</h2><button type="button" class="icon-btn" data-modal-close="1" aria-label="Close">${xIcon}</button></div><div class="modal-body">${body}</div></div>`;
    // peek: a panel low on the screen (or at one side) with no dimming, so the picture it changes stays in view
    // and can still be tapped
    el.classList.toggle('peek', !!(opts && opts.peek)); el.classList.toggle('peek-left', !!(opts && opts.peek && opts.left));
    el.hidden = false;
    $('[data-modal-close]', el).focus({ preventScroll: true });
  }
  function closeModal() {
    const el = $('#modal'); if (el.hidden || modalClosing) return;
    state.duel = null; pad = null; camStop(); itemEdit = null;
    const done = () => { modalClosing = 0; el.classList.remove('closing'); el.hidden = true; el.innerHTML = ''; };
    if (modalFocus && document.contains(modalFocus)) modalFocus.focus({ preventScroll: true });
    if (reduced()) { done(); return; }
    el.classList.add('closing');
    modalClosing = setTimeout(done, 170);
  }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-modal-close]')) closeModal(); else if (e.target.closest('[data-go]')) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#present').hidden) { closePresent(); return; }
    if (!$('#modal').hidden) { closeModal(); return; }
  });
  function copyText(text, msg) {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); toast(ok ? msg : 'Select and copy: ' + text.slice(0, 60)); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(msg), fallback); else fallback();
  }
  document.addEventListener('click', e => { const t = e.target.closest('[data-copy]'); if (t) copyText(t.dataset.copy, 'Copied ' + t.dataset.copy); });
  let toastTimer;
  function toast(msg, ms) { const el = $('#toast'); el.textContent = msg; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(toastTimer); el.classList.remove('out'); toastTimer = setTimeout(() => { if (reduced()) { el.hidden = true; return; } el.classList.add('out'); toastTimer = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 220); }, ms || 2800); }

  // ================================================================
  // SETTINGS
  // ================================================================
  const CHAINS = {
    homedepot: { label: 'The Home Depot', paint: ['behr', 'glidden', 'ppg', 'kilz'], stain: ['minwax', 'varathane', 'olympic'], main: 'behr' },
    lowes: { label: 'Lowe’s', paint: ['valspar', 'hgsw'], stain: ['cabot', 'minwax'], main: 'valspar' },
    ace: { label: 'Ace Hardware', paint: ['bm', 'ck', 'magnolia'], stain: ['minwax', 'varathane', 'cabot'], main: '' },
    menards: { label: 'Menards', paint: ['dutchboy'], stain: ['minwax', 'varathane'], main: 'dutchboy' },
    walmart: { label: 'Walmart', paint: ['glidden', 'kilz'], stain: ['minwax', 'varathane'], main: '' },
    sw: { label: 'Sherwin-Williams', paint: ['sw'], stain: ['swstain', 'minwax'], main: 'sw' },
    bm: { label: 'Benjamin Moore Store', paint: ['bm'], stain: ['minwax'], main: 'bm' },
    ppg: { label: 'PPG Paints Store', paint: ['ppg', 'glidden'], stain: ['olympic'], main: 'ppg' },
    de: { label: 'Dunn-Edwards', paint: ['de'], stain: [], main: 'de' },
    dv: { label: 'Diamond Vogel', paint: ['dv'], stain: [], main: 'dv' },
    other: { label: 'Another Store', other: true },
  };
  function chainPreset(id, target) {
    const ch = CHAINS[id]; if (!ch || ch.other) return false;
    for (const b of brandList()) target.brands[b.id] = ch.paint.includes(b.id);
    for (const b of S.brands()) target.stainBrands[b.id] = ch.stain.includes(b.id);
    target.storeBrand = ch.main && E.getIndex().brandById[ch.main] ? ch.main : '';
    return true;
  }
  const sw = (key, on, label, sub) => `<div class="set-row"><div class="set-text"><b id="lbl-${key}">${esc(label)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div><button type="button" class="switch" role="switch" aria-checked="${!!on}" aria-labelledby="lbl-${key}" data-set="${key}"></button></div>`;
  const segRow = (key, label, sub, map, value) => `<div class="set-row"><div class="set-text"><b>${esc(label)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div><div class="seg" role="group" aria-label="${esc(label)}">${Object.entries(map).map(([k, v]) => `<button type="button" data-seg="${key}" data-val="${k}" aria-pressed="${String(value) === k}">${esc(v)}</button>`).join('')}</div></div>`;
  // Each brand's own icon, from its own website (img/brands). RAL, Colorhouse, Dulux Australia (a 16-pixel icon only)
  // and Nerolac (a wide wordmark only) have none worth showing, so they keep a few of their colors; a stain brand
  // without one gets its first letter.
  const BRAND_LOGO = { behr: 'behr.png', bm: 'bm.ico', ck: 'ck.png', de: 'de.png', dutchboy: 'dutchboy.png', dv: 'dv.png', fb: 'fb.jpg', glidden: 'glidden.png', hgsw: 'hgsw.png', hl: 'hl.png', kilz: 'kilz.png', magnolia: 'magnolia.png', ppg: 'ppg.png', resene: 'resene.ico', sw: 'sw.png', valspar: 'valspar.png', vista: 'vista.png',
    plascon: 'plascon.png', sico: 'sico.png',
    minwax: 'minwax.png', cabot: 'cabot.png', olympic: 'olympic.png', swstain: 'sw.png' };
  const logoImg = id => `<span class="brand-logo"><img src="img/brands/${BRAND_LOGO[id]}" alt="" width="40" height="40" loading="lazy" decoding="async"></span>`;
  const brandMark = id => BRAND_LOGO[id] ? logoImg(id) : brandDots(id);
  const stainMark = (id, name) => BRAND_LOGO[id] ? logoImg(id) : `<span class="brand-logo letter" aria-hidden="true">${esc((name || '?')[0])}</span>`;
  // the "on" counts at the top of the brand lists, kept current as switches are flipped
  const paintOnText = () => { const en = brandsEnabled(), on = brandList().filter(b => en[b.id]).length; return `${on} of ${brandList().length} on · ${fmt(enabledCount())} colors`; };
  const stainOnText = () => `${S.brands().filter(b => settings.stainBrands[b.id] !== false).length} of ${S.brands().length} on`;
  function bumpCount(id, text) {
    const el = $('#' + id); if (!el || el.textContent === text) return;
    el.textContent = text;
    if (!reduced()) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  function brandDots(id) {
    const all = E.getIndex().byBrand[id] || [];
    const pop = all.filter(c => E.isPopular(c)).sort((x, y) => E.popularity(y) - E.popularity(x));
    const list = (pop.length >= 4 ? pop : all.filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 4)) === 0)).slice(0, 4);
    return `<span class="dots">${list.map(c => `<i style="background:#${c.hex}"></i>`).join('')}</span>`;
  }
  function renderSettings() {
    const en = brandsEnabled();
    const groups = [['us', 'US National Brands'], ['us-more', 'More US Brands'], ['intl', 'International'], ['standard', 'Color Standards'], ['custom', 'Imported']];
    const st = installState();
    view().innerHTML = `<div class="set">
      ${backBtn()}
      <div class="page-head"><h1>Settings</h1><p>Everything here is saved on this device.</p></div>
      <div class="set-group"><h2>Who Uses This</h2><div class="set-card">
        ${segRow('audience', 'This device is for', settings.audience === 'kiosk' ? 'Kiosk: big buttons, and it starts over when nobody has touched it for 2 minutes. The Staff button at the top unlocks it with the PIN.' : home() ? 'Simple tips for buying and testing samples.' : 'Chip locations and paint lines for the paint desk.', { store: 'Store Staff', home: 'My Home', kiosk: 'Kiosk' }, settings.audience || 'store')}
        <div class="set-row"><span class="pin-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/><circle cx="12" cy="15.3" r="1.4" fill="currentColor" stroke="none"/></svg></span><div class="set-text"><b>Kiosk PIN</b><span>${hasPin() ? 'Set. Staff use it to unlock kiosk mode.' : 'Not made yet. You’ll make one (4 to 8 numbers) before kiosk mode turns on.'}</span></div><button type="button" class="btn" data-pin-change="1">${hasPin() ? 'Change PIN' : 'Make a PIN'}</button></div>
      </div></div>
      ${home() ? '' : `<div class="set-group"><h2>No Kiosk? Use Shoppers’ Phones</h2><div class="set-card">
        <div class="set-row kq-row"><div class="kq" id="kioskQr">${kioskQrSvg()}</div><div class="set-text"><b>Shoppers scan this code</b><span>ColorGenius opens on their phone in kiosk mode, with this store’s brands and questions. Settings stay locked. Change the store or brands below and the code changes with them.</span></div></div>
        <div class="set-row"><button type="button" class="btn primary" data-act="kiosk-sign">${ic('print', 20)}Print a Sign</button><button type="button" class="btn" data-act="kiosk-copy">Copy Link</button></div>
      </div></div>`}
      <div class="set-group"><h2>${home() ? 'Where You Shop' : 'Your Store'}</h2><div class="set-card">
        <div class="set-row"><div class="set-text"><b>Store</b><span>Turns on the brands that store carries</span></div>${selectHtml('setChain', [['', 'Choose a Store']].concat(Object.entries(CHAINS).filter(([, ch]) => !ch.other).map(([k, ch]) => [k, ch.label])), settings.chain, 'Store', v => { settings.chain = v; if (chainPreset(v, settings)) { settings.stainBrands = Object.fromEntries(Object.entries(settings.stainBrands).filter(([, on]) => on === false)); toast(`Brands set for ${CHAINS[v].label}`); } saveSettings(); afterSettingsChange(); renderKeep(); })}</div>
        <div class="set-row"><div class="set-text"><b>${home() ? 'Favorite Brand' : 'Store Brand'}</b><span>Shown first, and used for which paint to buy</span></div>${selectHtml('setStoreBrand', [['', 'None, Mix Brands']].concat(brandsAZ().map(b => [b.id, b.name])), settings.storeBrand, home() ? 'Favorite brand' : 'Store brand', v => { settings.storeBrand = v; if (v) settings.brands[v] = true; saveSettings(); afterSettingsChange(); renderKeep(); })}</div>
        ${sw('storeOnly', settings.storeOnly, home() ? 'Only suggest my favorite brand' : 'Only suggest the store brand', 'Other brands still show up as matches')}
        <div class="set-row"><div class="set-text"><b id="lbl-job-paint">Paint</b><span>Paint colors and which paint to buy</span></div><button type="button" class="switch" role="switch" aria-checked="${jobOn('paint')}" aria-labelledby="lbl-job-paint" data-job-switch="paint"></button></div>
        <div class="set-row"><div class="set-text"><b id="lbl-job-stain">Stain</b><span>Wood stains, shown on real wood</span></div><button type="button" class="switch" role="switch" aria-checked="${jobOn('stain')}" aria-labelledby="lbl-job-stain" data-job-switch="stain"></button></div>
      </div></div>
      <div class="set-group"><h2>Questions</h2><div class="set-card">
        ${segRow('questions', 'How many questions', settings.questions === 'detailed' ? 'Detailed: also asks about light bulbs, what’s on the wall now, the feeling you want and what’s staying in the room.' : 'Quick: about 6 easy questions, most need just one tap.', { quick: 'Quick', detailed: 'Detailed' }, settings.questions)}
        ${settings.questions === 'detailed' ? sw('askBulbs', settings.askBulbs, 'Ask about light bulbs') + sw('askFixed', settings.askFixed, 'Ask what’s staying in the room', 'Floors, counters, cabinets, furniture') : ''}
        ${segRow('resultCount', 'Colors to show', '', { 3: '3', 6: '6', 9: '9', 12: '12' }, String(settings.resultCount))}
      </div></div>
      <div class="set-group"><h2>Easy to See</h2><div class="set-card">
        ${sw('bigText', settings.bigText, 'Bigger text', 'Makes all the words and buttons larger')}
        ${R3().supported() ? sw('view3d', settings.view3d, 'Turn rooms in 3D', 'Drag the room pictures to look around, and pinch or scroll to zoom') : '<div class="set-note">3D rooms need a newer browser with WebGL. The flat pictures are shown instead.</div>'}
        ${segRow('theme', 'Light or dark screen', 'Light is best for judging color', { system: 'Automatic', light: 'Light', dark: 'Dark' }, settings.theme)}
        ${sw('lightPreview', settings.lightPreview, 'Show the light picker', 'See colors under the room’s own light bulbs, in daylight and more')}
        ${sw('reduceMotion', settings.reduceMotion, 'Less motion', 'Turns off sliding and fading')}
      </div></div>
      <div class="set-group"><h2>Color Advice</h2><div class="set-card">
        ${sw('showLrv', settings.showLrv, 'Show Light Reflectance (LRV)', 'How light a color is, from 0 for black to 100 for white')}
        ${sw('showWarnings', settings.showWarnings, 'Show things to know', 'Warnings like “looks cooler in north light”')}
        ${sw('showMatches', settings.showMatches, 'Show matches in other brands')}
        ${sw('inStoreSamples', settings.inStoreSamples, 'Show where chips are in the store')}
        ${sw('showDiscontinued', settings.showDiscontinued, 'Include discontinued colors', 'Older colors many stores can still mix')}
        <div class="set-row"><div class="set-text"><b>Popular colors</b><span>${esc(popNote())}</span></div></div>
      </div></div>
      <div class="set-group"><h2>Screen Color</h2><div class="set-card">
        <div class="set-note" style="border-top:0">Screens show colors differently. Matching this screen to white paper and a real chip makes every color truer.</div>
        ${sw('calEnabled', settings.cal.enabled, 'Use my screen tuning', settings.cal.enabled ? `${settings.cal.cct ? `For ${calLightName(settings.cal.cct)}. W` : 'W'}armth ${settings.cal.warmth}, brightness ${settings.cal.brightness}, vividness ${settings.cal.vividness}` : 'Not tuned yet')}
        ${settings.cal.enabled ? `<div class="set-row cal-here"><div class="set-text"><b>Light where this screen is</b><span>In a room with other bulbs now? Tap them, and the tuning moves with them. No need to tune again.</span></div>${calTiles('data-cal-here', settings.cal.cct)}</div>` : ''}
        <div class="set-row"><button type="button" class="btn primary" data-act="calibrate">Tune This Screen</button>${settings.cal.cct || settings.cal.warmth || settings.cal.brightness || settings.cal.vividness ? '<button type="button" class="btn ghost" data-act="reset-cal">Undo Tuning</button>' : ''}</div>
      </div></div>
      <div class="set-group" id="setBrands"><h2>Brands</h2>
        <details class="set-card"><summary>Paint Brands <span class="muted on-count" id="paintOn" aria-live="polite">${paintOnText()}</span></summary>
          <div class="set-row"><label class="search" style="flex:1;min-height:52px"><input type="search" id="brandFind" placeholder="Find a brand" aria-label="Find a brand" autocomplete="off" style="min-height:48px;font-size:1.05rem"></label><button type="button" class="btn small" data-act="brands-us">US National Only</button><button type="button" class="btn small" data-act="brands-all">All On</button></div>
          ${groups.map(([g, label]) => { const bs = brandsAZ().filter(b => b.group === g); if (!bs.length) return ''; return `<div class="brand-group" data-group="${g}"><div class="set-row"><div class="set-text"><b class="eyebrow">${label}</b></div><button type="button" class="link" data-brand-group="${g}" data-on="1">All On</button><button type="button" class="link" data-brand-group="${g}" data-on="0">All Off</button></div>${bs.map(b => `<div class="set-row brand-row" data-name="${esc(b.name.toLowerCase())}">${brandMark(b.id)}<div class="set-text"><b id="lbl-b-${esc(b.id)}">${esc(b.name)}</b><span>${fmt((E.getIndex().byBrand[b.id] || []).length)} colors</span></div><button type="button" class="switch" role="switch" aria-checked="${!!en[b.id]}" aria-labelledby="lbl-b-${esc(b.id)}" data-brand="${esc(b.id)}"></button></div>`).join('')}</div>`; }).join('')}
        </details>
        ${S.brands().length ? `<details class="set-card"><summary>Stain Brands <span class="muted on-count" id="stainOn" aria-live="polite">${stainOnText()}</span></summary>${S.brands().slice().sort((a, b) => azCmp(a.name, b.name)).map(b => `<div class="set-row brand-row">${stainMark(b.id, b.name)}<div class="set-text"><b id="lbl-s-${esc(b.id)}">${esc(b.name)}</b><span>${b.use === 'exterior' ? 'Outside' : 'Inside'}${b.note ? ' · ' + esc(b.note) : ''}</span></div><button type="button" class="switch" role="switch" aria-checked="${settings.stainBrands[b.id] !== false}" aria-labelledby="lbl-s-${esc(b.id)}" data-sbrand="${esc(b.id)}"></button></div>`).join('')}</details>` : ''}
        <details class="set-card"><summary>Color Collections</summary><div class="set-note" style="border-top:0">Turn off fan decks or collections the store doesn’t carry.</div>${brandsAZ().filter(b => en[b.id] && E.collectionsFor(b.id).length > 1).map(b => E.collectionsFor(b.id).slice().sort((p, q) => azCmp(p.label, q.label)).map(x => `<div class="set-row"><div class="set-text"><b id="lbl-c-${esc(b.id)}-${x.id}">${esc(b.name)}: ${esc(x.label)}</b><span>${fmt(x.count)} colors${x.note ? ' · ' + esc(x.note) : ''}</span></div><button type="button" class="switch" role="switch" aria-checked="${settings.collections[b.id + ':' + x.id] !== false}" aria-labelledby="lbl-c-${esc(b.id)}-${x.id}" data-coll="${esc(b.id + ':' + x.id)}"></button></div>`).join('')).join('')}</details>
        <details class="set-card"><summary>Paint Lines ${home() ? 'I’d Buy' : 'the Store Carries'}</summary><div class="set-note" style="border-top:0">Which Paint to Buy suggests a line for each job. Turn off lines ${home() ? 'you don’t want' : 'the store doesn’t stock'}.</div>${Object.keys(E.PAINT_LINES).filter(id => E.getIndex().brandById[id] && (en[id] || id === settings.storeBrand)).sort((a, b) => azCmp(brandName(a), brandName(b))).map(id => E.PAINT_LINES[id].map(l => `<div class="set-row"><div class="set-text"><b id="lbl-l-${esc(l.id)}">${esc(brandName(id))} ${esc(l.name)}</b><span>${esc(E.TIERS[l.tier])} · ${l.use === 'interior' ? 'Inside' : l.use === 'both' ? 'Floors' : 'Outside'} · ${esc(l.note)}</span></div><button type="button" class="switch" role="switch" aria-checked="${settings.lines[l.id] !== false}" aria-labelledby="lbl-l-${esc(l.id)}" data-line="${esc(l.id)}"></button></div>`).join('')).join('')}</details>
        <p class="muted small brand-none" hidden>No brand matches that search.</p>
      </div>
      <div class="set-group"><h2>Add Your Own Colors</h2><div class="set-card">
        <div class="set-note" style="border-top:0">Import a CSV file for a brand that isn’t listed. Columns: brand, name, code, hex, and LRV if you have it. Like this: <span class="mono">Clark+Kensington, Oat Milk, 23A-2, #E8DFCF, 74</span></div>
        <div class="set-row"><span class="btn file-btn">Choose a CSV File<input type="file" id="csvInput" accept=".csv,.tsv,.txt,text/csv"></span>${Object.keys(store.get('custom', {})).length ? '<button type="button" class="btn ghost" data-act="clear-custom">Remove Imported Colors</button>' : ''}</div>
      </div></div>
      <div class="set-group"><h2>The App</h2><div class="set-card">
        <div class="set-row"><img src="icons/icon-192.png" width="48" height="48" alt="" style="border-radius:12px;flex:none"><div class="set-text"><b>ColorGenius on your home screen</b><span>${esc(INSTALL_STATUS[st])}</span></div>${st === 'installed' ? '<span class="badge good">Installed</span>' : '<button type="button" class="btn primary" data-act="install">Get the App</button>'}</div>
        <div class="set-row"><div class="set-text"><b>Updates</b><span id="appVersion">${esc(versionLabel())}</span></div>${updateReady ? '<button type="button" class="btn primary" data-update-now="1"><span class="upd-label">Update Now</span></button>' : '<button type="button" class="btn" data-act="check-update">Check for Updates</button>'}</div>
        <div class="set-row"><button type="button" class="btn" data-act="run-setup">Run Setup Again</button><button type="button" class="btn ghost" data-act="reset-all">Reset All Settings</button></div>
      </div></div>
      <p class="muted small">${fmt(E.getIndex().colors.length)} colors from ${brandList().length} brands are loaded.</p>
    </div>`;
    $('#csvInput').addEventListener('change', importCsv);
    $('#brandFind').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase(); let any = false;
      $$('#setBrands .brand-group').forEach(g => { let n = 0; $$('.brand-row', g).forEach(r => { const hit = !q || r.dataset.name.includes(q); r.hidden = !hit; if (hit) n++; }); g.hidden = !n; if (n) any = true; });
      $('.brand-none').hidden = any;
    });
  }
  // re-draw the settings page without jumping back to the top, keeping open sections open
  function renderKeep() {
    const y = window.scrollY, open = $$('#view details').map(d => d.open);
    renderSettings();
    $$('#view details').forEach((d, i) => { if (open[i]) d.open = true; });
    window.scrollTo(0, y);
  }
  view().addEventListener('click', e => {
    if (state.view !== 'settings') return;
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.set) {
      const k = t.dataset.set, on = t.getAttribute('aria-checked') !== 'true';
      t.setAttribute('aria-checked', on);
      if (k === 'calEnabled') settings.cal.enabled = on; else settings[k] = on;
      if (k === 'storeOnly' && on && !settings.storeBrand) toast('Choose a store brand first');
      saveSettings(); applyTheme(); afterSettingsChange(k);
      if (k === 'calEnabled') renderKeep();
      return;
    }
    if (t.dataset.pinChange) { makePin(() => renderKeep(), hasPin() ? 'Make a New Kiosk PIN' : 'Make a Kiosk PIN'); return; }
    if (t.dataset.seg) {
      const k = t.dataset.seg, v = t.dataset.val;
      // kiosk mode only turns on with a PIN to get back out
      // once it's on, settings close and lock behind the PIN straight away
      if (k === 'audience' && v === 'kiosk') { if (!isKiosk()) turnOnKiosk(() => { afterSettingsChange('audience'); state.unlocked = false; go(''); }); return; }
      settings[k] = k === 'resultCount' ? +v : v;
      if (k === 'audience') { settings.inStoreSamples = v !== 'home'; settings.kioskPhone = false; applyAudience(); }
      saveSettings(); applyTheme(); afterSettingsChange(k); renderKeep(); return;
    }
    if (t.dataset.brand) { const on = t.getAttribute('aria-checked') !== 'true'; t.setAttribute('aria-checked', on); settings.brands[t.dataset.brand] = on; saveSettings(); afterSettingsChange('brands'); bumpCount('paintOn', paintOnText()); return; }
    if (t.dataset.sbrand) { const on = t.getAttribute('aria-checked') !== 'true'; t.setAttribute('aria-checked', on); if (on) delete settings.stainBrands[t.dataset.sbrand]; else settings.stainBrands[t.dataset.sbrand] = false; saveSettings(); afterSettingsChange('brands'); bumpCount('stainOn', stainOnText()); return; }
    if (t.dataset.line) { const on = t.getAttribute('aria-checked') !== 'true'; t.setAttribute('aria-checked', on); if (on) delete settings.lines[t.dataset.line]; else settings.lines[t.dataset.line] = false; saveSettings(); afterSettingsChange('lines'); return; }
    if (t.dataset.coll) {
      const on = t.getAttribute('aria-checked') !== 'true', id = t.dataset.coll.split(':')[0];
      if (on) delete settings.collections[t.dataset.coll]; else settings.collections[t.dataset.coll] = false;
      if (!E.collectionsFor(id).some(x => settings.collections[id + ':' + x.id] !== false)) { delete settings.collections[t.dataset.coll]; toast('Keep at least one collection on, or turn the brand off'); return; }
      t.setAttribute('aria-checked', on); saveSettings(); afterSettingsChange('collections'); return;
    }
    if (t.dataset.jobSwitch) {
      const j = t.dataset.jobSwitch, other = j === 'paint' ? 'stain' : 'paint';
      settings.jobs = Object.assign({ paint: true, stain: true }, settings.jobs);
      if (settings.jobs[j] && !settings.jobs[other]) { toast('Keep paint or stain on'); return; }
      settings.jobs[j] = !settings.jobs[j]; t.setAttribute('aria-checked', settings.jobs[j]); saveSettings(); refreshKioskQr(); return;
    }
    if (t.dataset.brandGroup) { const on = t.dataset.on === '1'; for (const b of brandList()) if (b.group === t.dataset.brandGroup) settings.brands[b.id] = on; saveSettings(); afterSettingsChange('brands'); renderKeep(); return; }
    const act = t.dataset.act;
    if (act === 'calibrate') openCal();
    if (act === 'reset-cal') { settings.cal = clone(DEFAULT_SETTINGS.cal); saveSettings(); refreshSwatches(); renderKeep(); toast('Screen tuning undone'); }
    if (act === 'brands-all') { for (const b of brandList()) settings.brands[b.id] = true; saveSettings(); afterSettingsChange('brands'); renderKeep(); }
    if (act === 'brands-us') { for (const b of brandList()) settings.brands[b.id] = b.group === 'us'; saveSettings(); afterSettingsChange('brands'); renderKeep(); }
    if (act === 'install') startInstall();
    if (act === 'check-update') checkForUpdate();
    if (act === 'kiosk-sign') printKioskSign();
    if (act === 'kiosk-copy') copyText(kioskLink(), 'Kiosk link copied');
    if (act === 'run-setup') openOnboarding();
    if (act === 'clear-custom') { const custom = store.get('custom', {}); store.set('custom', {}); for (const name of Object.keys(custom)) removeBrand(customMeta(name).id); afterSettingsChange('brands'); renderKeep(); toast('Imported colors removed'); }
    if (act === 'reset-all') {
      if (t.dataset.confirm) { settings = clone(DEFAULT_SETTINGS); saveSettings(); applyTheme(); applyAudience(); afterSettingsChange('all'); toast('Settings reset'); openOnboarding(); }
      else { t.dataset.confirm = '1'; t.textContent = 'Tap Again to Reset Everything'; t.classList.add('armed'); setTimeout(() => { if (document.contains(t)) { delete t.dataset.confirm; t.textContent = 'Reset All Settings'; t.classList.remove('armed'); } }, 3500); }
    }
  });
  function afterSettingsChange(key) {
    Object.keys(stylePalettes).forEach(k => delete stylePalettes[k]);
    for (const k of ['paint', 'stain']) if (state.results[k]) state.results[k] = null;
    if (state.results.buy) state.results.buy = buyPlan(flowOf('buy').a);
    if (key === 'calEnabled' || key === 'all') refreshSwatches();
    updateListBtn();
    refreshKioskQr();
  }
  function customMeta(name) { return { id: 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, prefix: '', region: 'Imported', group: 'custom', source: 'Imported by the store', date: '', lrv: 'as imported', mixNote: '' }; }
  function removeBrand(id) { const idx = E.getIndex(); idx.brands = idx.brands.filter(b => b.id !== id); delete idx.brandById[id]; idx.colors = idx.colors.filter(c => c.brand !== id); delete idx.byBrand[id]; }
  function importCsv(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = E.parseCustomCsv(reader.result), names = Object.keys(parsed.brands);
      if (!names.length) { toast(parsed.errors[0] || 'No colors found in that file'); return; }
      const custom = store.get('custom', {}); let total = 0;
      for (const n of names) { custom[n] = parsed.brands[n]; total += E.addBrand(customMeta(n), parsed.brands[n]); settings.brands[customMeta(n).id] = true; }
      const saved = store.set('custom', custom); saveSettings(); afterSettingsChange('brands'); renderKeep();
      toast(`Imported ${fmt(total)} colors${saved ? '' : ' (they last until the page closes)'}`);
    };
    reader.readAsText(file);
  }
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'light' || settings.theme === 'dark') root.setAttribute('data-theme', settings.theme); else root.removeAttribute('data-theme');
    root.classList.toggle('reduce-motion', !!settings.reduceMotion);
    root.classList.toggle('big-text', !!settings.bigText);
    syncBars();
  }
  // The phone's own bars (the one with the clock, the browser's address bar, and on many phones the bottom bar):
  // the app's own background in whichever light or dark the app is showing (its own setting, not just the
  // phone's), and black while the camera or the full-screen colors are up. The form controls and scrollbars go
  // light or dark with it too, and Samsung Internet knows the app has its own dark look.
  function syncBars() {
    const root = document.documentElement;
    const dark = settings.theme === 'dark' || (settings.theme !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.style.colorScheme = settings.theme === 'light' ? 'light' : settings.theme === 'dark' ? 'dark' : 'light dark';
    const full = document.getElementById('camera') ? '#000000' : !$('#present').hidden ? '#111111' : '';
    const bg = full || getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#141413' : '#f5f3ef');
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) if (m.getAttribute('content') !== bg) m.setAttribute('content', bg);
  }
  if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); const on = () => syncBars(); if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on); }

  // ================================================================
  // SCREEN TUNING: match the screen to white paper, then to a real chip
  // ================================================================
  let cal = null;
  // the light where the screen is tuned: daytime or the bulbs, by the number on the bulb or its box
  const CAL_DAY = ['daylight', 'Daytime', 'Window light', '#dcebfa'], CAL_UNSURE = ['', 'Not Sure', 'Use the slider', '#ece9e3'];
  const calCct = id => (E.LIGHTS.find(l => l.id === id) || {}).cct || 0;
  const calTile = cct => [CAL_DAY].concat(BULB_TILES).find(t => calCct(t[0]) === cct) || null;
  const calLightName = cct => { const t = calTile(cct); return !t ? '' : t === CAL_DAY ? 'daylight' : `${t[1]} ${t[2]} bulbs`; };
  const calTiles = (attr, cct) => `<div class="lt-stack"><div class="lt-grid bulbs">${BULB_TILES.map(t => lightTile(t, '', attr, calCct(t[0]) === cct)).join('')}</div><div class="lt-grid bulbs">${[CAL_DAY, CAL_UNSURE].map(t => lightTile(t, '', attr, t[0] ? calCct(t[0]) === cct : !cct)).join('')}</div></div>`;
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-cal-here]'); if (!t) return;
    settings.cal.cct = calCct(t.dataset.calHere); saveSettings(); afterSettingsChange('calEnabled'); renderKeep();
    toast(settings.cal.cct ? 'Screen tuning set for ' + calLightName(settings.cal.cct) : 'Screen tuning set for any light');
  });
  function openCal() { cal = { draft: Object.assign({}, settings.cal, { enabled: true }), step: 0, ref: settings.cal.ref ? E.findColor(settings.cal.ref) : (E.search('Agreeable Gray')[0] || {}).color || E.getIndex().colors[0] }; drawCal(); }
  const calSlider = (key, label, min, max, left, right) => `<label class="field">${label} <span class="mono" id="calv-${key}">${cal.draft[key] > 0 ? '+' : ''}${cal.draft[key]}</span><input type="range" min="${min}" max="${max}" step="1" value="${cal.draft[key]}" data-cal="${key}" style="width:100%;min-height:44px;accent-color:var(--accent)"><span class="muted small" style="display:flex;justify-content:space-between"><span>${left}</span><span>${right}</span></span></label>`;
  function drawCal() {
    const st = cal.step;
    const panels = (a, b) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${a}${b}</div>`;
    const panel = (id, text) => `<div id="${id}" style="min-height:130px;border-radius:16px;display:grid;place-items:end start;padding:10px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"><span class="badge">${text}</span></div>`;
    const body = st === 0 ? `<p style="font-size:1.1rem">This takes about a minute. You’ll need a sheet of plain white paper and any paint chip.</p><ul class="why"><li>Turn off Night Light, True Tone or any blue-light filter.</li><li>Use your normal screen brightness.</li><li>Do it where colors get picked, in that light. You’ll pick that light first.</li></ul>`
      : st === 1 ? `<p style="font-size:1.1rem">What light is on the paper where you are? The number is on the bulb or its box.</p>${calTiles('data-cal-light', cal.draft.cct)}<p class="muted" style="margin:0">This gets the screen close before you fine-tune it. Most stores use 4000K or 5000K lights.</p>`
      : st === 2 ? `<p style="font-size:1.1rem">Hold the white paper against the screen. Slide until the left box looks like the paper.${cal.draft.cct && cal.draft.cct < 6000 ? ` It starts warmer, for ${esc(calLightName(cal.draft.cct))}.` : ''}</p>${panels(panel('calWhite', 'Tuned white'), panel('calOff', 'Untouched'))}${calSlider('warmth', 'Warmth', -100, 100, 'Box looks too yellow', 'Box looks too blue')}${calSlider('brightness', 'Brightness', -50, 20, 'Box glows brighter', 'Box looks dimmer')}`
      : st === 3 ? `<p style="font-size:1.1rem">Find the chip in your hand, then slide until the left box looks like it.</p><div class="search"><input type="search" id="calSearch" placeholder="Name or code of your chip" aria-label="Find your chip" autocomplete="off"></div><div class="rows" id="calHits"></div>${panels(panel('calChip', esc(cal.ref ? cal.ref.name : '')), panel('calChipOff', 'Untouched'))}${calSlider('vividness', 'Vividness', -50, 50, 'Too strong', 'Too dull')}${calSlider('warmth', 'Warmth', -100, 100, 'Too yellow', 'Too blue')}${calSlider('brightness', 'Brightness', -50, 20, 'Too bright', 'Too dark')}`
      : `<p style="font-size:1.1rem">All done${cal.draft.cct ? `, tuned for ${esc(calLightName(cal.draft.cct))}` : ''}. You can turn screen tuning off or on in Settings any time.</p><p class="muted" style="margin:0">In a room with other bulbs later? Pick them in Settings, under Screen Color. There’s no need to tune again.</p>`;
    openModal(['Tune This Screen', 'The Light Here', 'Match White Paper', 'Match a Real Chip', 'Done'][st], `${body}<div class="modal-foot">${st ? '<button type="button" class="btn big ghost" data-cal-act="back">Back</button>' : '<button type="button" class="btn big ghost" data-modal-close="1">Cancel</button>'}<span class="grow"></span>${st === 3 ? '<button type="button" class="btn big ghost" data-cal-act="next">Skip</button>' : ''}<button type="button" class="btn big primary" data-cal-act="${st === 4 ? 'save' : 'next'}">${st === 4 ? 'Save' : st === 0 ? 'Start' : 'Next'}</button></div>`);
    paintCal();
    const s = $('#calSearch');
    if (s) s.addEventListener('input', () => { $('#calHits').innerHTML = E.search(s.value, { limit: 5, brands: brandsEnabled() }).map(r => `<button type="button" class="row" data-cal-pick="${esc(r.color.id)}"><span class="sw" style="background:#${r.color.hex}"></span><span><span class="nm">${esc(r.color.name)}</span><span class="sub">${esc(brandName(r.color.brand))} ${esc(E.codeLabel(r.color))}</span></span><span></span></button>`).join(''); });
  }
  function paintCal() {
    const w = $('#calWhite'); if (w) w.style.backgroundColor = C.displayCss('FFFFFF', { cal: cal.draft, p3: state.screen.p3 });
    const o = $('#calOff'); if (o) o.style.backgroundColor = '#FFFFFF';
    if (cal.ref) { const ch = $('#calChip'); if (ch) ch.style.backgroundColor = C.displayCss(cal.ref.hex, { cal: cal.draft, p3: state.screen.p3 }); const o2 = $('#calChipOff'); if (o2) o2.style.backgroundColor = '#' + cal.ref.hex; }
  }
  $('#modal').addEventListener('input', e => { const k = e.target.dataset.cal; if (!k || !cal) return; cal.draft[k] = +e.target.value; $$(`[data-cal="${k}"]`).forEach(i => { if (i !== e.target) i.value = cal.draft[k]; }); const v = $('#calv-' + k); if (v) v.textContent = (cal.draft[k] > 0 ? '+' : '') + cal.draft[k]; paintCal(); });
  $('#modal').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !cal) return;
    if (t.dataset.calLight != null) { cal.draft.cct = calCct(t.dataset.calLight); $$('#modal [data-cal-light]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); return; }
    if (t.dataset.calPick) { cal.ref = E.findColor(t.dataset.calPick); $('#calChip .badge').textContent = cal.ref.name; $('#calHits').innerHTML = ''; paintCal(); return; }
    const a = t.dataset.calAct;
    if (a === 'back') { cal.step--; drawCal(); }
    if (a === 'next') { cal.step++; drawCal(); }
    if (a === 'save') { settings.cal = Object.assign({}, cal.draft, { enabled: true, ref: cal.ref ? cal.ref.id : '' }); saveSettings(); closeModal(); cal = null; refreshSwatches(); if (state.view === 'settings') renderKeep(); render(window.scrollY); toast('Screen tuning saved and turned on'); }
  });

  // ================================================================
  // FIRST-TIME SETUP: who uses it and which store, in two taps
  // ================================================================
  let ob = null;
  const obSteps = () => ['who', 'store', ob && ob.chain === 'other' ? 'brands' : '', 'done'].filter(Boolean);
  function openOnboarding() {
    ob = { step: 0, audience: settings.audience || '', chain: settings.chain || '', jobs: Object.assign({ paint: true, stain: true }, settings.jobs), brands: Object.assign({}, brandsEnabled()), stainBrands: Object.fromEntries(S.brands().map(b => [b.id, settings.stainBrands[b.id] !== false])), storeBrand: settings.storeBrand || '' };
    closeModal();
    const el = $('#onboard'); el.innerHTML = ''; el.hidden = false; document.documentElement.classList.add('ob-open');
    drawOnboarding(0);
  }
  function closeOnboarding() { $('#onboard').hidden = true; document.documentElement.classList.remove('ob-open'); ob = null; }
  // what one setup screen shows: its body, the Next label, and whether Next works yet
  function obView(id) {
    let body = '', next = 'Next', nextOff = false;
    if (id === 'who') {
      body = `<h1 id="obTitle">Welcome to ColorGenius</h1><p class="muted" style="font-size:1.15rem">Who will use this device? You can change it later in Settings.</p>
        <div class="choices three">${choice('data-ob-aud="store"', ob.audience === 'store', 'Paint Store Staff', 'Help customers at the paint desk', ic('can'))}${choice('data-ob-aud="home"', ob.audience === 'home', 'Me, for My Home', 'Pick colors and paint for my own projects', ic('ext_body'))}${choice('data-ob-aud="kiosk"', ob.audience === 'kiosk', 'A Store Kiosk', 'A touch screen for shoppers that starts over by itself', ic('media'))}</div>`;
      nextOff = !ob.audience;
    }
    if (id === 'store') {
      body = `<h1 id="obTitle">${ob.audience === 'home' ? 'Where will you shop?' : 'Which store is this?'}</h1><p class="muted" style="font-size:1.15rem">We’ll turn on the brands that store carries.</p>
        <div class="choices">${Object.entries(CHAINS).map(([k, ch]) => choice(`data-ob-chain="${k}"`, ob.chain === k, ch.label, ch.other ? 'Pick the brands yourself' : ch.paint.map(b => (E.getIndex().brandById[b] || {}).name).filter(Boolean).join(', '), null)).join('')}</div>
        <div class="q-group"><p class="q-label">What do you need help with?</p><div class="chipset">${chipBtn('data-ob-job="paint"', ob.jobs.paint, 'Paint', null)}${chipBtn('data-ob-job="stain"', ob.jobs.stain, 'Stain', null)}</div></div>`;
      nextOff = !ob.chain;
    }
    if (id === 'brands') {
      body = `<h1 id="obTitle">Which paint brands?</h1><p class="muted" style="font-size:1.15rem">Colors come only from brands that are on.</p>
        <div class="chipset">${brandsAZ().map(b => chipBtn(`data-ob-brand="${esc(b.id)}"`, !!ob.brands[b.id], b.name, null)).join('')}</div>`;
      nextOff = !brandList().some(b => ob.brands[b.id]);
    }
    if (id === 'done') {
      body = `<h1 id="obTitle">You’re all set!</h1><p class="muted" style="font-size:1.15rem">${ob.audience === 'kiosk' ? 'The kiosk starts over after 2 minutes with nobody using it. To unlock it, tap the Staff button at the top and enter your PIN.' : 'Tap Paint Colors, Stain Colors or Which Paint to Buy to begin. Settings has more choices, like bigger text and 3D rooms.'}</p>`;
      next = 'Start';
    }
    return { body, next, nextOff };
  }
  // The frame (logo, dots, Back and Next) is built once and stays put. Only a change of screen slides the new
  // screen in; tapping a choice just marks it, so nothing on the page moves.
  function drawOnboarding(dir) {
    const el = $('#onboard');
    if (!$('.ob-shell', el)) el.innerHTML = `<div class="ob-shell"><div class="ob-top"><span class="logo" aria-hidden="true"><img class="logo-mark" src="icons/icon-192.png" alt="" width="36" height="36">ColorGenius</span><span class="ob-dots" aria-hidden="true"></span><span class="ob-skip"></span></div><div class="ob-body" id="obBody"></div></div>
      <nav class="ob-nav" aria-label="Setup buttons"><div class="bottom-in"><button type="button" class="btn big ghost" data-ob="back">${chev('left')}Back</button><span class="grow"></span><button type="button" class="btn big primary" data-ob="next"><span class="enter-hint" aria-hidden="true">Enter <span class="ret">↵</span></span><span class="next-label">Next</span>${chev('right')}</button></div></nav>`;
    const id = obSteps()[ob.step], v = obView(id);
    obDots();
    $('.ob-skip', el).innerHTML = id !== 'done' ? '<button type="button" class="btn small ghost" data-ob="skip">Skip Setup</button>' : '';
    const body = $('#obBody');
    body.innerHTML = v.body;
    body.classList.remove('slide', 'slide-back');
    if (dir && !reduced()) { void body.offsetWidth; body.classList.add(dir > 0 ? 'slide' : 'slide-back'); }
    const back = $('[data-ob="back"]', el);
    back.style.visibility = ob.step ? '' : 'hidden'; back.disabled = !ob.step;
    $('.next-label', el).textContent = v.next;
    $('[data-ob="next"]', el).disabled = v.nextOff;
    el.scrollTo(0, 0);
    const h = $('#obTitle'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  function obDots() { const d = $('#onboard .ob-dots'); if (d) d.innerHTML = obSteps().map((s, i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join(''); }
  // a choice was tapped: mark it, and let Next work once there's an answer
  function obPicked(attr, value) {
    $$(`#obBody [${attr}]`).forEach(b => b.setAttribute('aria-pressed', b.getAttribute(attr) === value));
    const n = $('#onboard [data-ob="next"]'), was = n.disabled;
    n.disabled = obView(obSteps()[ob.step]).nextOff;
    if (!n.disabled && !reduced()) { n.classList.remove('nudge'); void n.offsetWidth; n.classList.add('nudge'); }
    return was;
  }
  function finishOnboarding(skipped) {
    if (!skipped) {
      settings.audience = ob.audience || 'store';
      if (ob.chain && ob.chain !== 'other') chainPreset(ob.chain, settings);
      else { for (const b of brandList()) settings.brands[b.id] = !!ob.brands[b.id]; }
      settings.chain = ob.chain === 'other' ? '' : ob.chain;
      settings.jobs = ob.jobs;
      settings.inStoreSamples = settings.audience !== 'home';
      if (!settings.storeBrand) settings.storeOnly = false;
    } else if (!settings.audience) settings.audience = 'store';
    settings.onboarded = true;
    saveSettings(); applyTheme(); applyAudience(); afterSettingsChange('all');
    closeOnboarding();
    go('', { replace: true });
    if (!skipped) toast(settings.audience === 'kiosk' ? 'Kiosk ready' : 'All set. Happy painting!');
  }
  $('#onboard').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !ob) return;
    if (t.dataset.obAud) { ob.audience = t.dataset.obAud; obPicked('data-ob-aud', ob.audience); return; }
    if (t.dataset.obChain) { ob.chain = t.dataset.obChain; if (ob.chain !== 'other') chainPreset(ob.chain, ob); obPicked('data-ob-chain', ob.chain); obDots(); return; }
    if (t.dataset.obJob) { const j = t.dataset.obJob, other = j === 'paint' ? 'stain' : 'paint'; if (ob.jobs[j] && !ob.jobs[other]) { toast('Keep paint or stain on'); return; } ob.jobs[j] = !ob.jobs[j]; t.setAttribute('aria-pressed', ob.jobs[j]); return; }
    if (t.dataset.obBrand) { ob.brands[t.dataset.obBrand] = !ob.brands[t.dataset.obBrand]; t.setAttribute('aria-pressed', ob.brands[t.dataset.obBrand]); const n = $('#onboard [data-ob="next"]'); n.disabled = obView('brands').nextOff; return; }
    const a = t.dataset.ob;
    if (a === 'next') {
      // choosing a kiosk: make its PIN before going on
      if (obSteps()[ob.step] === 'who' && ob.audience === 'kiosk' && !hasPin()) { makePin(() => { if (ob) { ob.step++; drawOnboarding(1); } }); return; }
      if (ob.step >= obSteps().length - 1) finishOnboarding(false); else { ob.step++; drawOnboarding(1); }
    }
    if (a === 'back') { ob.step = Math.max(0, ob.step - 1); drawOnboarding(-1); }
    if (a === 'skip') finishOnboarding(true);
  });

  // ================================================================
  // THE PHONE APP: install it, and keep it up to date
  // ================================================================
  let installEvent = null;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone = () => { try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; } };
  function installState() { if (isStandalone()) return 'installed'; if (installEvent) return 'prompt'; if (location.protocol === 'file:') return 'file'; if (isIOS) return 'ios'; return isAndroid ? 'android' : 'manual'; }
  const INSTALL_STATUS = { installed: 'Installed. You’re using the app now.', prompt: 'Ready to add to this device.', ios: 'On iPhone and iPad it’s added from the Share menu.', android: 'Add it from the browser menu.', manual: 'Open this site on a phone to add it, or use Chrome or Edge on a computer.', file: 'Put the site online first; phones can’t add a file.' };
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; });
  window.addEventListener('appinstalled', () => { installEvent = null; toast('ColorGenius is on your home screen'); });
  async function startInstall() {
    const st = installState();
    if (st === 'prompt') { const ev = installEvent; installEvent = null; try { ev.prompt(); const ch = await ev.userChoice; if (ch && ch.outcome === 'accepted') toast('Adding ColorGenius'); } catch (e) { openInstallHelp('android'); } return; }
    openInstallHelp(st);
  }
  function openInstallHelp(st) {
    const steps = st === 'ios' ? ['Tap the Share button (a square with an arrow).', 'Scroll down and tap <b>Add to Home Screen</b>.', 'Tap <b>Add</b>. Open ColorGenius from its new icon.']
      : st === 'installed' ? [] : ['Open the browser menu (the three dots).', 'Tap <b>Install app</b> or <b>Add to Home screen</b>.', 'Open ColorGenius from its new icon.'];
    openModal('Get the ColorGenius App', `<p style="font-size:1.1rem">${st === 'installed' ? 'ColorGenius is already on this device.' : 'It opens full screen and works without the internet.'}</p>${steps.length ? `<ol class="why" style="list-style:none">${steps.map(s => `<li>${s}</li>`).join('')}</ol>` : ''}<div class="modal-foot"><span class="grow"></span><button type="button" class="btn big primary" data-modal-close="1">Got It</button></div>`);
  }
  // ================================================================
  // UPDATES: a new version never loads by itself. sw.js downloads it in the background and holds it. The app then
  // shows an Update button in the top bar, and when the app opens (or comes back after a while) a popup whose only
  // button is Update. Pressing either switches to the new version and reloads; projects and settings stay.
  // ================================================================
  let swReg = null, updateReady = false, updating = false, reloading = false, hiddenAt = 0, appVersion = '';
  const openedAt = Date.now();
  const swOk = 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const applyUpdate = () => { if (reloading) return; reloading = true; location.reload(); };
  const atStart = () => state.view === 'home' && $('#modal').hidden && $('#onboard').hidden && $('#present').hidden && !document.getElementById('camera');
  const versionLabel = () => (appVersion ? 'Version ' + appVersion.replace(/^cg-/, '') : 'This version') + (updateReady ? ' · a new version is ready' : '');
  const refreshIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
  function updateNow() {
    if (updating) return;
    updating = true;
    $$('[data-update-now]').forEach(b => { b.disabled = true; const l = $('.upd-label', b); if (l) l.textContent = 'Updating…'; });
    const w = swReg && swReg.waiting;
    if (w) w.postMessage({ type: 'update' }); else applyUpdate();
    setTimeout(applyUpdate, 5000);   // in case the switch never reports back
  }
  // the popup: nothing behind it can be used, it has no close button, and Escape doesn't close it
  function openUpdateGate(otherWindow) {
    if ($('#updateGate')) return;
    closePop();
    const g = document.createElement('div');
    g.id = 'updateGate'; g.className = 'update-gate';
    g.setAttribute('role', 'alertdialog'); g.setAttribute('aria-modal', 'true'); g.setAttribute('aria-labelledby', 'updT'); g.setAttribute('aria-describedby', 'updD');
    g.innerHTML = `<div class="upd-card"><img src="icons/icon-192.png" width="76" height="76" alt="">
      <h2 id="updT">${otherWindow ? 'ColorGenius Was Updated' : 'Update ColorGenius'}</h2>
      <p id="updD">${otherWindow ? 'It was updated in another window. Press Update to load the new version here too.' : 'A new version is ready. Press Update to start using it.'} Your projects and settings stay.</p>
      <button type="button" class="btn big primary" data-update-now="1">${refreshIcon}<span class="upd-label">Update</span></button></div>`;
    for (const el of document.body.children) if (el !== g && el.id !== 'toast') el.setAttribute('inert', '');
    document.body.appendChild(g);
    document.documentElement.classList.add('gate-open');
    $('[data-update-now]', g).focus({ preventScroll: true });
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-update-now]')) updateNow(); });
  // while the popup is up, the keyboard stays on its Update button
  document.addEventListener('keydown', e => {
    const g = $('#updateGate'); if (!g) return;
    if (e.key === 'Tab' || e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); $('[data-update-now]', g).focus(); }
  }, true);
  function onUpdateReady() {
    if (updateReady) return;
    updateReady = true;
    $('#updateBtn').hidden = false;
    const v = $('#appVersion'); if (v) v.textContent = versionLabel();
    // the app has just opened (and nothing's been started yet): the popup. Later on, just the button.
    const age = Date.now() - openedAt;
    if (age < 15000 || (age < 60000 && atStart())) openUpdateGate();
    else toast('A new version is ready. Press Update at the top when you’re ready.');
  }
  async function checkForUpdate() {
    if (updateReady) { openUpdateGate(); return; }
    if (!swReg) { toast('Updates need the app opened from its web address'); return; }
    toast('Checking for a new version…');
    try { await swReg.update(); } catch (e) { toast('Couldn’t check. Are you online?'); return; }
    setTimeout(() => { if (!updateReady) toast(swReg.installing ? 'Downloading the new version…' : 'You have the newest version'); }, 1800);
  }
  if (swOk) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;            // the very first install taking over: nothing to reload
      if (updating) applyUpdate(); else openUpdateGate(true);   // Update was pressed in another window
    });
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'version') { appVersion = e.data.version; const v = $('#appVersion'); if (v) v.textContent = versionLabel(); }
    });
    const watch = reg => {
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady(); });
      });
    };
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(watch).catch(() => {});
      if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'version' });
    });
    // look for a new version every half hour while the app is open, and whenever it comes back to the front
    setInterval(() => { if (swReg) swReg.update().catch(() => {}); }, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (swReg) swReg.update().catch(() => {});
      // back after 20 minutes or more counts as opening the app again
      if (updateReady && hiddenAt && Date.now() - hiddenAt > 20 * 60 * 1000) openUpdateGate();
    });
  }

  // ================================================================
  // KIOSK: a touch screen on the store floor. Starts over by itself after 2 minutes with nobody using it.
  // ================================================================
  const KIOSK_IDLE = 120000, KIOSK_WARN = 15;
  let kioskTimer = 0, kioskTick = 0, kioskLeft = 0;
  // in a kiosk, the Settings button is swapped for a Staff button with a lock: it asks for the PIN
  function applyAudience() { const k = isKiosk(); document.documentElement.classList.toggle('kiosk', k); document.documentElement.classList.toggle('kiosk-phone', k && !!settings.kioskPhone); $('#settingsBtn').hidden = k; $('#lockBtn').hidden = !k; kioskArm(); }
  const kioskAtStart = () => state.view === 'home' && !session.items.length && $('#modal').hidden && $('#present').hidden;
  function kioskArm() { clearTimeout(kioskTimer); clearInterval(kioskTick); const w = $('#kioskIdle'); if (w) w.hidden = true; if (isKiosk() && !settings.kioskPhone) kioskTimer = setTimeout(kioskWarn, KIOSK_IDLE); }
  function kioskWarn() {
    if (!$('#onboard').hidden || kioskAtStart()) { kioskArm(); return; }
    let w = $('#kioskIdle');
    if (!w) { w = document.createElement('div'); w.id = 'kioskIdle'; w.className = 'kiosk-idle'; w.setAttribute('role', 'alertdialog'); w.setAttribute('aria-labelledby', 'kioskIdleT'); w.innerHTML = '<div class="card"><h2 id="kioskIdleT">Still there?</h2><p style="font-size:1.15rem">Starting over in <b id="kioskIdleN"></b> seconds so the next person gets a fresh start.</p><button type="button" class="btn big primary" data-kiosk-stay="1">I’m Still Here</button></div>'; document.body.appendChild(w); }
    kioskLeft = KIOSK_WARN; $('#kioskIdleN').textContent = kioskLeft; w.hidden = false;
    $('[data-kiosk-stay]', w).focus({ preventScroll: true });
    kioskTick = setInterval(() => { kioskLeft--; const n = $('#kioskIdleN'); if (n) n.textContent = Math.max(0, kioskLeft); if (kioskLeft <= 0) kioskReset(); }, 1000);
  }
  function kioskReset() {
    clearInterval(kioskTick);
    closeModal(); closePresent(); closeCamera();
    session = blankSession(); saveSession(); updateListBtn();
    state.flows = { paint: null, stain: null, buy: null }; state.results = { paint: null, stain: null, buy: null }; state.query = ''; state.duelPick = ''; state.unlocked = false; state.layout = null; state.furniture = {}; state.parts = {};
    go('', { replace: true });
    window.scrollTo(0, 0);
    kioskArm();
    tapDone = false;   // the next shopper sees the tap note too
    // a fresh start is when a waiting update goes in
    if (updateReady) openUpdateGate();
  }
  ['pointerdown', 'keydown', 'wheel'].forEach(ev => document.addEventListener(ev, () => { if (isKiosk()) kioskArm(); }, { passive: true, capture: true }));
  $('#homeBtn').addEventListener('contextmenu', e => { if (isKiosk()) e.preventDefault(); });

  // ================================================================
  // KIOSK PIN: 4 to 8 numbers. It has to be made before kiosk mode can turn on, it's the only way out of kiosk
  // mode, and it can be changed in Settings in normal store mode. Only a scrambled copy (a SHA-256 hash with a
  // random salt) is kept on the device, never the numbers themselves.
  // ================================================================
  const PIN_MIN = 4, PIN_MAX = 8;
  async function hashPin(pin, salt) {
    const data = new TextEncoder().encode(salt + ':' + pin);
    if (window.crypto && crypto.subtle) { const buf = await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join(''); }
    let h = 2166136261; for (const c of data) { h ^= c; h = Math.imul(h, 16777619) >>> 0; } return 'f' + h.toString(16); // pages opened as a file have no crypto
  }
  const hasPin = () => !!(settings.kioskPin && settings.kioskPin.hash);
  async function setPin(pin) { const salt = newId(); settings.kioskPin = { salt, hash: await hashPin(pin, salt) }; saveSettings(); }
  async function checkPin(pin) { return hasPin() && (await hashPin(pin, settings.kioskPin.salt)) === settings.kioskPin.hash; }

  // the number pad: big keys, dots for what's typed, and the keyboard works too
  let pad = null, padFails = 0, padLockUntil = 0;
  function openPinPad(o) {
    pad = Object.assign({ pin: '', error: '', ok: 'OK' }, o);
    openModal(pad.title, `<p class="pin-sub">${esc(pad.sub)}</p>
      <div class="pin-dots" aria-hidden="true">${Array.from({ length: PIN_MAX }, (_, i) => `<i data-i="${i}"></i>`).join('')}</div>
      <p class="pin-count muted" aria-live="polite"></p>
      <p class="pin-error" role="alert"></p>
      <div class="pin-keys" role="group" aria-label="Number pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" class="pin-key" data-pin-key="${n}">${n}</button>`).join('')}
        <button type="button" class="pin-key soft" data-pin-key="clear">Clear</button><button type="button" class="pin-key" data-pin-key="0">0</button><button type="button" class="pin-key soft" data-pin-key="del" aria-label="Delete the last number">${chev('left', 24)}</button></div>
      ${pad.forgot ? '<button type="button" class="link pin-forgot" data-pin-forgot="1">Forgot the PIN?</button>' : ''}
      <div class="modal-foot"><button type="button" class="btn big ghost" data-modal-close="1">Cancel</button><span class="grow"></span><button type="button" class="btn big primary" data-pin-ok="1">${esc(pad.ok)}</button></div>`);
    $('#modal .modal-card').classList.add('pin-card');
    updatePinPad();
  }
  function updatePinPad() {
    if (!pad) return;
    const locked = Date.now() < padLockUntil;
    $$('#modal .pin-dots i').forEach((d, i) => { d.className = i < pad.pin.length ? 'on' : i >= PIN_MIN ? 'opt' : ''; });
    $('#modal .pin-count').textContent = pad.pin.length ? `${pad.pin.length} number${pad.pin.length === 1 ? '' : 's'}` : `${PIN_MIN} to ${PIN_MAX} numbers`;
    $('#modal .pin-error').textContent = locked ? `Too many tries. Wait ${Math.ceil((padLockUntil - Date.now()) / 1000)} seconds.` : pad.error;
    $('#modal [data-pin-ok]').disabled = locked || pad.pin.length < PIN_MIN;
    $$('#modal .pin-key').forEach(k => { k.disabled = locked; });
  }
  function padKey(k) {
    if (!pad || Date.now() < padLockUntil) return;
    pad.error = '';
    if (k === 'del') pad.pin = pad.pin.slice(0, -1);
    else if (k === 'clear') pad.pin = '';
    else if (/^\d$/.test(k) && pad.pin.length < PIN_MAX) pad.pin += k;
    updatePinPad();
  }
  async function padSubmit() {
    if (!pad || pad.pin.length < PIN_MIN || Date.now() < padLockUntil) return;
    const p = pad, res = await p.onDone(p.pin);
    if (res === true || pad !== p) return;
    // wrong: say so, shake the dots, start again
    pad.error = res || 'Try again.'; pad.pin = '';
    const dots = $('#modal .pin-dots'); if (dots && !reduced()) { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); }
    updatePinPad();
  }
  $('#modal').addEventListener('click', e => {
    if (!pad) return;
    const k = e.target.closest('[data-pin-key]'); if (k) { padKey(k.dataset.pinKey); return; }
    if (e.target.closest('[data-pin-ok]')) padSubmit();
  });
  document.addEventListener('keydown', e => {
    if (!pad || $('#modal').hidden) return;
    if (/^\d$/.test(e.key)) { e.preventDefault(); padKey(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); padKey('del'); }
    else if (e.key === 'Enter') { e.preventDefault(); padSubmit(); }
  });

  // the Staff button in a kiosk: the PIN, then leave kiosk mode or open Settings
  const lockOpenIcon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 017.6-1.7"/><circle cx="12" cy="15.3" r="1.4" fill="currentColor" stroke="none"/></svg>';
  const gearIcon = () => $('#settingsBtn svg').outerHTML.replace(/width="22" height="22"/, 'width="24" height="24"');
  function showUnlocked() {
    pad = null;
    openModal('Unlocked', `<p style="font-size:1.1rem">What would you like to do?</p>
      <div class="unlock-acts">
        <button type="button" class="btn big primary" data-unlock="leave">${lockOpenIcon}<span><b>Leave Kiosk Mode</b><small>Back to normal store mode</small></span></button>
        <button type="button" class="btn big" data-unlock="settings">${gearIcon()}<span><b>Open Settings</b><small>Change something, then it locks again</small></span></button>
      </div>
      <div class="modal-foot"><span class="grow"></span><button type="button" class="btn big ghost" data-modal-close="1">Stay Locked</button></div>`);
  }
  function openUnlock() {
    if (!isKiosk()) return;
    if (!hasPin() && settings.kioskPhone) { openPhoneLeave(); return; }
    // a kiosk turned on before PINs existed has none, and no PIN could ever match: make one, then it opens
    if (!hasPin()) { makePin(showUnlocked, 'Make a Kiosk PIN', 'This kiosk doesn’t have a PIN yet. Pick 4 to 8 numbers to lock it with, then it unlocks. Write it down somewhere safe.'); return; }
    openPinPad({
      title: 'Staff Only', sub: 'Enter the kiosk PIN to unlock this screen.', ok: 'Unlock', forgot: true,
      onDone: async pin => {
        if (await checkPin(pin)) {
          padFails = 0;
          showUnlocked();
          return true;
        }
        if (++padFails >= 5) { padFails = 0; padLockUntil = Date.now() + 30000; const tick = setInterval(() => { updatePinPad(); if (Date.now() >= padLockUntil) clearInterval(tick); }, 1000); }
        return 'That PIN isn’t right. Try again.';
      },
    });
  }
  $('#lockBtn').addEventListener('click', () => { if (state.ready) openUnlock(); });

  // a forgotten PIN can't be looked up (only a scrambled copy is kept), so the way back in is to reset the
  // settings and the PIN and run setup again. Holding the button for a few seconds keeps it from happening
  // by a stray tap. Projects and imported colors stay.
  const FORGOT_HOLD = 4000;
  function openForgot() {
    pad = null;
    openModal('Forgot the PIN?', `<p style="font-size:1.1rem">The PIN can’t be looked up. This device only keeps a scrambled copy of it.</p>
      <p style="font-size:1.1rem">To get back in, reset this device’s settings and PIN and run setup again. Projects and imported colors stay.</p>
      <button type="button" class="btn big hold-btn" data-forgot-hold="1"><span class="hold-fill" aria-hidden="true"></span><span class="hold-label">Press and Hold to Reset</span></button>
      <p class="muted small" style="text-align:center;margin-top:-8px">Keep holding for ${FORGOT_HOLD / 1000} seconds.</p>
      <div class="modal-foot"><span class="grow"></span><button type="button" class="btn big ghost" data-modal-close="1">Cancel</button></div>`);
    $('#modal .modal-card').classList.add('pin-card');
    holdToConfirm($('[data-forgot-hold]'), FORGOT_HOLD, resetForForgotPin);
  }
  function holdToConfirm(btn, ms, done, label) {
    let timer = 0;
    btn.style.setProperty('--hold', ms + 'ms');
    const start = e => {
      if (timer || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return;
      if (e.type === 'keydown') e.preventDefault();
      btn.classList.add('holding'); $('.hold-label', btn).textContent = 'Keep Holding…';
      timer = setTimeout(() => { timer = 0; done(); }, ms);
    };
    const stop = () => { if (!timer) return; clearTimeout(timer); timer = 0; btn.classList.remove('holding'); $('.hold-label', btn).textContent = label || 'Press and Hold to Reset'; };
    btn.addEventListener('pointerdown', start); btn.addEventListener('keydown', start);
    ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', e => e.preventDefault());
  }
  function resetForForgotPin() {
    settings = clone(DEFAULT_SETTINGS); saveSettings();
    padFails = 0; padLockUntil = 0; state.unlocked = false;
    closeModal(); applyTheme(); applyAudience(); afterSettingsChange('all');
    go('', { replace: true });
    toast('Settings and PIN reset');
    openOnboarding();
  }
  $('#modal').addEventListener('click', e => { if (e.target.closest('[data-pin-forgot]')) openForgot(); });
  $('#modal').addEventListener('click', e => {
    const t = e.target.closest('[data-unlock]'); if (!t) return;
    closeModal();
    if (t.dataset.unlock === 'leave') leaveKiosk();
    else { state.unlocked = true; go('settings'); }
  });

  // making a PIN: type it, then type it again to be sure
  function makePin(then, title, sub) {
    openPinPad({
      title: title || 'Make a Kiosk PIN', sub: sub || 'Pick 4 to 8 numbers. Staff will need it to unlock the kiosk, so write it down somewhere safe.', ok: 'Next',
      onDone: async first => {
        openPinPad({
          title: 'Type It Again', sub: 'Enter the same PIN once more to make sure.', ok: 'Save PIN',
          onDone: async again => {
            if (again !== first) { makePin(then, title, sub); pad.error = 'Those didn’t match. Make the PIN again.'; updatePinPad(); return true; }
            await setPin(again); closeModal(); toast('Kiosk PIN saved'); if (then) then(); return true;
          },
        });
        return true;
      },
    });
  }
  // ================================================================
  // KIOSK ON SHOPPERS' PHONES: a store without a kiosk puts up a sign with a QR code. Scanning it opens
  // ColorGenius on the shopper's own phone in kiosk mode, set up like this store: its brands, store brand, paint
  // and stain, and how many questions. Everything rides in the link (#/kiosk/...), so there's no server.
  // A phone kiosk keeps normal-size text and doesn't start over by itself (it's the shopper's own phone).
  // ================================================================
  // the address phones should open: this copy's own, or the public one in config.js when this copy runs on
  // this computer (a phone can't open "localhost")
  function kioskSite() {
    const pub = (window.CG_CONFIG || {}).siteUrl;
    const local = !/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[::1\]|.*\.local$)/.test(location.hostname);
    return local && pub ? pub : siteUrl();
  }
  function kioskCode() {
    const en = brandsEnabled(), ids = brandList().map(b => b.id).filter(id => !/^custom-/.test(id));
    const on = ids.filter(id => en[id]), off = ids.filter(id => !en[id]);
    const parts = [];
    if (settings.chain && CHAINS[settings.chain] && !CHAINS[settings.chain].other) parts.push('c=' + settings.chain);
    if (settings.storeBrand && !/^custom-/.test(settings.storeBrand)) parts.push('m=' + settings.storeBrand + (settings.storeOnly ? ';o=1' : ''));
    parts.push(on.length <= off.length ? 'b=' + on.join(',') : 'bx=' + off.join(','));   // whichever list is shorter
    const sOff = S.brands().map(b => b.id).filter(id => settings.stainBrands[id] === false);
    if (sOff.length) parts.push('sx=' + sOff.join(','));
    const cOff = Object.keys(settings.collections).filter(k => settings.collections[k] === false && !/^custom-/.test(k));
    if (cOff.length) parts.push('co=' + cOff.join(','));
    if (!jobOn('paint') || !jobOn('stain')) parts.push('j=' + (jobOn('paint') ? 'p' : 's'));
    if (detailed()) parts.push('q=d');
    return parts.join(';');
  }
  const kioskLink = () => `${kioskSite()}#/kiosk/${kioskCode()}`;
  const kioskQrSvg = () => { try { return window.CG.qr.svg(kioskLink(), { label: 'QR code that opens ColorGenius in kiosk mode on a phone' }); } catch (e) { return ''; } };
  function refreshKioskQr() { const el = $('#kioskQr'); if (el) el.innerHTML = kioskQrSvg(); }
  function openKioskLink(code) {
    // a store's own kiosk stays as it is: its setup only changes behind the PIN
    if (isKiosk() && !settings.kioskPhone) return;
    const p = {};
    for (const part of String(code).split(';')) { const i = part.indexOf('='); if (i > 0) p[part.slice(0, i)] = part.slice(i + 1); }
    const list = k => (p[k] || '').split(',').filter(Boolean);
    // a device that was already set up (a staff member testing the sign) gets its own setup back on leaving
    if (settings.onboarded && !isKiosk()) store.set('beforeKiosk', settings);
    const prev = settings, next = clone(DEFAULT_SETTINGS);
    // what belongs to this screen and this person stays
    for (const k of ['theme', 'bigText', 'reduceMotion', 'view3d', 'cal', 'kioskPin']) next[k] = clone(prev[k]);
    const idx = E.getIndex(), ids = brandList().map(b => b.id).filter(id => !/^custom-/.test(id));
    if (p.b != null) for (const id of ids) next.brands[id] = list('b').includes(id);
    else if (p.bx != null) for (const id of ids) next.brands[id] = !list('bx').includes(id);
    for (const id of list('sx')) if (S.brands().some(b => b.id === id)) next.stainBrands[id] = false;
    for (const k of list('co')) if (/^[a-z0-9-]+:[a-z0-9-]+$/i.test(k)) next.collections[k] = false;
    if (CHAINS[p.c] && !CHAINS[p.c].other) next.chain = p.c;
    if (p.m && idx.brandById[p.m]) { next.storeBrand = p.m; next.brands[p.m] = true; next.storeOnly = p.o === '1'; }
    if (p.j === 'p') next.jobs = { paint: true, stain: false };
    if (p.j === 's') next.jobs = { paint: false, stain: true };
    next.questions = p.q === 'd' ? 'detailed' : 'quick';
    Object.assign(next, { audience: 'kiosk', kioskPhone: true, onboarded: true, inStoreSamples: true });
    settings = next; saveSettings();
    closeModal(); if (!$('#onboard').hidden) closeOnboarding();
    applyTheme(); applyAudience(); afterSettingsChange('all');
    const shop = storeName();
    setTimeout(() => toast(shop ? `Welcome to ${shop}! Tap one to start.` : 'Welcome! Tap one to start.'), 1300);   // once the loading screen has lifted
  }
  function printKioskSign() {
    const shop = storeName(), what = jobOn('paint') && jobOn('stain') ? 'Paint or Stain Color' : jobOn('stain') ? 'Stain Color' : 'Paint Color';
    const site = kioskSite().replace(/^https?:\/\//, '').replace(/\/$/, '');
    printHtml(`<div class="qr-sign">
      <div class="qs-brand"><img src="icons/icon-192.png" alt="" width="56" height="56"><span>ColorGenius</span></div>
      <h1>Find Your ${esc(what)}</h1>
      <p class="qs-sub">Scan with your phone’s camera</p>
      <div class="qs-code">${window.CG.qr.svg(kioskLink())}</div>
      <ol class="qs-steps"><li><b>1</b>Open your phone’s camera</li><li><b>2</b>Point it at the code</li><li><b>3</b>Tap the link that pops up</li></ol>
      <p class="qs-why">A few easy questions about your room, then colors picked for it${shop ? `, from the brands ${esc(shop)} carries` : ''}. Free, no app to download and no sign-up.</p>
      <p class="qs-foot">${shop ? esc(shop) + ' Paint Department · ' : ''}${esc(site)}</p>
    </div>`, false);
  }
  // leaving a phone kiosk: back to how this device was set up before, or to setup
  function leaveKiosk() {
    if (!settings.kioskPhone) { settings.audience = 'store'; settings.inStoreSamples = true; saveSettings(); applyAudience(); go('settings'); toast('Kiosk mode is off'); return; }
    const before = store.get('beforeKiosk', null);
    store.set('beforeKiosk', null);
    const keep = { theme: settings.theme, bigText: settings.bigText, reduceMotion: settings.reduceMotion, cal: settings.cal, kioskPin: settings.kioskPin };
    settings = before ? merge(DEFAULT_SETTINGS, before) : Object.assign(clone(DEFAULT_SETTINGS), keep);
    settings.kioskPhone = false; if (settings.audience === 'kiosk') settings.audience = 'store';
    saveSettings(); state.unlocked = false;
    closeModal(); applyTheme(); applyAudience(); afterSettingsChange('all');
    go('', { replace: true });
    toast('Kiosk mode is off');
    if (!settings.onboarded) openOnboarding();
  }
  function openPhoneLeave() {
    openModal('Leave Kiosk Mode?', `<p style="font-size:1.1rem">This phone opened ColorGenius from a store’s sign, so it’s in kiosk mode with that store’s brands.</p>
      <p style="font-size:1.1rem">${store.get('beforeKiosk', null) ? 'Leaving puts the app back the way it was on this phone.' : 'Leaving starts setup, so you can use ColorGenius your own way.'}</p>
      <button type="button" class="btn big hold-btn" data-leave-hold="1"><span class="hold-fill" aria-hidden="true"></span><span class="hold-label">Press and Hold to Leave</span></button>
      <p class="muted small" style="text-align:center;margin-top:-8px">Keep holding for 2 seconds.</p>
      <div class="modal-foot"><span class="grow"></span><button type="button" class="btn big ghost" data-modal-close="1">Stay in Kiosk Mode</button></div>`);
    $('#modal .modal-card').classList.add('pin-card');
    holdToConfirm($('[data-leave-hold]'), 2000, leaveKiosk, 'Press and Hold to Leave');
  }

  // turning kiosk mode on: a PIN first if there isn't one, otherwise a quick confirm
  function turnOnKiosk(done) {
    const on = () => { settings.audience = 'kiosk'; settings.kioskPhone = false; settings.inStoreSamples = true; saveSettings(); applyAudience(); if (done) done(); toast('Kiosk mode is on. The Staff button unlocks it.'); };
    if (!hasPin()) { makePin(on); return; }
    openModal('Turn On Kiosk Mode?', `<p style="font-size:1.1rem">Shoppers will use this screen. Settings will be locked, and the <b>Staff</b> button at the top asks for your kiosk PIN to unlock it.</p>
      <div class="modal-foot"><button type="button" class="btn big ghost" data-modal-close="1">Cancel</button><span class="grow"></span><button type="button" class="btn big primary" data-kiosk-on="1">Turn On Kiosk Mode</button></div>`);
    pendingKiosk = on;
  }
  let pendingKiosk = null;
  $('#modal').addEventListener('click', e => { if (e.target.closest('[data-kiosk-on]') && pendingKiosk) { const f = pendingKiosk; pendingKiosk = null; closeModal(); f(); } });

  // ================================================================
  // START
  // ================================================================
  function loadScript(src) { return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(src)); document.head.appendChild(s); }); }
  async function boot() {
    applyTheme(); applyAudience();
    const brands = window.CG_BRANDS || [], failed = [];
    let done = 0;
    await Promise.all(brands.map(b => loadScript(`data/colors/${b.id}.js`).then(() => { done++; $('#loadingText').textContent = `Getting the paint colors ready… ${done} of ${brands.length} brands`; }).catch(() => failed.push(b.name))));
    E.init(brands.filter(b => window.CG_COLORS && window.CG_COLORS[b.id]), window.CG_COLORS || {});
    S.init(window.CG_STAINS);
    const custom = store.get('custom', {});
    for (const name of Object.keys(custom)) E.addBrand(customMeta(name), custom[name]);
    // the brands' own Colors of the Year and popular colors, looked up every week from their websites
    try { await loadScript('data/popular.js'); } catch (e) { /* the app works without it, just with no Popular marks */ }
    E.setPopular(window.CG_POPULAR);
    // Saved Colors from older versions are kept as an earlier project, so nothing is lost
    const oldSaved = store.get('shortlist', null);
    if (Array.isArray(oldSaved) && oldSaved.length) {
      const items = oldSaved.map(id => E.findColor(id)).filter(Boolean).map(c => Object.assign({ id: newId() }, { kind: 'paint', ref: c.id, area: '', brand: brandName(c.brand), name: c.name, code: E.codeLabel(c), hex: c.hex, lrv: String(c.lrv), finish: '', product: '', primer: '', loc: '' }));
      if (items.length && !isKiosk()) { past = [Object.assign(blankSession(), { name: 'Saved Colors', items })].concat(past).slice(0, PAST_MAX); savePast(); }
      store.set('shortlist', []);
    }
    state.ready = true;
    updateListBtn();
    if (!history.state) history.replaceState({ d: 0 }, '', location.hash || '#/');
    // The page is drawn behind the loading screen, which only lifts once its words and first pictures are ready (a
    // second at most), so nothing pops in or changes font after it shows. Then it rises in once.
    render(0);
    if (!settings.onboarded && !['shared', 'ticket'].includes(parseHash().view)) openOnboarding();
    const ready = [document.fonts && document.fonts.ready].concat($$('#view img').slice(0, 8).map(i => i.decode ? i.decode().catch(() => {}) : null));
    await Promise.race([Promise.all(ready), new Promise(r => setTimeout(r, 1100))]);
    const ld = $('#loading'), v = view();
    if (reduced()) ld.hidden = true;
    else { v.style.animation = 'none'; void v.offsetWidth; v.style.animation = ''; ld.classList.add('done'); setTimeout(() => { ld.hidden = true; }, 320); }
    if (failed.length) toast(`Couldn’t load: ${failed.join(', ')}`);
  }
  window.ColorGenius = { state, settings: () => settings, go, kioskReset, kioskWarn };
  boot();
})();
