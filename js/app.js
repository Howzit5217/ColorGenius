/* ColorGenius app: views, interactions and animation. Depends on CG.color and CG.engine. */
(function () {
  'use strict';
  const C = window.CG.color, E = window.CG.engine, S = window.CG.stain, WD = window.CG.wood;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const fmt = n => Number(n).toLocaleString('en-US');

  // ---------------- storage (per-device conveniences; the app works without it) ----------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cg:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cg:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  const DEFAULT_SETTINGS = {
    brands: {}, storeBrand: '', storeOnly: false, resultCount: 6,
    inStoreSamples: true, showDiscontinued: false,
    askBulbs: true, askFixed: true, showWarnings: true, showLrv: true, showMatches: true, lightPreview: true,
    cal: { enabled: false, warmth: 0, brightness: 0, vividness: 0, ref: '' },
    theme: 'system', reduceMotion: false, lines: {}, collections: {}, audience: '', onboarded: false,
    jobs: { paint: true, stain: true }, stainBrands: {}, chain: '',
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
  let shortlist = store.get('shortlist', []);
  const saveSettings = () => store.set('settings', settings);
  const saveShortlist = () => store.set('shortlist', shortlist);

  const state = {
    view: 'find', step: 0, answers: freshAnswers(), results: null,
    gridLight: 'none', roomLight: 'daylight', detailId: null, detailStack: [], query: '',
    screen: detectScreen(), stylePalettes: {}, ready: false, ftype: {},
  };
  // every answer for both jobs: painting (the engine's) and staining (CG.stain's); the first question picks which
  function freshAnswers() { return Object.assign(clone(E.DEFAULT_ANSWERS), clone(S.DEFAULT), { job: settings.jobs && settings.jobs.paint === false ? 'stain' : 'paint' }); }
  // painting and staining can each be switched off; with only one on, the first question is skipped
  const jobOn = j => !settings.jobs || settings.jobs[j] !== false;
  const reduced = () => settings.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------- screen ----------------
  function detectScreen() {
    const mm = q => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
    const rec2020 = mm('(color-gamut: rec2020)'), p3 = mm('(color-gamut: p3)');
    return {
      p3: p3 || rec2020,
      gamut: rec2020 ? 'Rec. 2020 (very wide)' : p3 ? 'Display P3 (wide color)' : 'sRGB (standard)',
      hdr: mm('(dynamic-range: high)'),
      depth: (window.screen && screen.colorDepth) || 24,
      dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
      size: window.screen ? `${screen.width} × ${screen.height}` : 'Unknown',
      contrast: mm('(prefers-contrast: more)') ? 'High contrast mode on' : 'Normal',
    };
  }
  ['(color-gamut: p3)', '(dynamic-range: high)'].forEach(q => {
    try { window.matchMedia(q).addEventListener('change', () => { state.screen = detectScreen(); refreshSwatches(); }); } catch (e) { /* old browsers */ }
  });

  // ---------------- color display ----------------
  const LIGHT_BY_ID = Object.fromEntries(E.LIGHTS.map(l => [l.id, l]));
  function paint(hex, lightId) {
    const light = lightId && lightId !== 'none' ? LIGHT_BY_ID[lightId] : null;
    return C.displayCss(hex, { light, cal: settings.cal, p3: state.screen.p3 });
  }
  function refreshSwatches() {
    $$('[data-hex]').forEach(el => { el.style.backgroundColor = paint(el.dataset.hex, el.dataset.light || 'none'); });
  }

  // ---------------- brands ----------------
  const brandList = () => E.getIndex().brands;
  const brandName = id => (E.getIndex().brandById[id] || {}).name || S.brandName(id);
  function brandsEnabled() {
    const out = {};
    for (const b of brandList()) out[b.id] = settings.brands[b.id] != null ? !!settings.brands[b.id] : b.group === 'us' || b.group === 'custom';
    return out;
  }
  function engineSettings() {
    return { resultCount: settings.resultCount, showDiscontinued: settings.showDiscontinued, brands: brandsEnabled(), collections: settings.collections, storeBrand: settings.storeBrand, storeOnly: settings.storeOnly && !!settings.storeBrand, inStoreSamples: settings.inStoreSamples };
  }
  const enabledCount = () => { const en = brandsEnabled(); return E.getIndex().colors.filter(c => en[c.brand] && (settings.showDiscontinued || !(c.flags & E.F.DISC))).length; };

  // ---------------- loading ----------------
  function loadScript(src) {
    return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(src)); document.head.appendChild(s); });
  }
  async function boot() {
    applyTheme();
    const brands = window.CG_BRANDS || [];
    const failed = [];
    let done = 0;
    await Promise.all(brands.map(b => loadScript(`data/colors/${b.id}.js`).then(() => {
      done++; $('#loadingText').textContent = `Loading paint colors… ${done} of ${brands.length} brands`;
    }).catch(() => failed.push(b.name))));
    const ok = brands.filter(b => window.CG_COLORS && window.CG_COLORS[b.id]);
    E.init(ok, window.CG_COLORS || {});
    S.init(window.CG_STAINS);
    const custom = store.get('custom', {});
    for (const name of Object.keys(custom)) E.addBrand(customMeta(name), custom[name]);
    state.ready = true;
    $('#loading').hidden = true;
    updateShortCount();
    updateInstallUi();
    route(location.hash.replace('#', '') || 'find', true);
    if (!settings.onboarded) openOnboarding(); // first launch on this device
    if (failed.length) toast(`Couldn’t load: ${failed.join(', ')}`);
  }
  function customMeta(name) {
    return { id: 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, prefix: '', region: 'Imported', group: 'custom', source: 'Imported by the store', date: '', lrv: 'as imported', mixNote: '' };
  }

  // ---------------- routing ----------------
  function route(view, first) {
    if (!['find', 'lookup', 'shortlist'].includes(view)) view = 'find';
    state.view = view;
    $$('.tab').forEach(t => t.setAttribute('aria-current', t.dataset.view === view ? 'page' : 'false'));
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
    if (location.hash.replace('#', '') !== view && !first) history.replaceState(null, '', '#' + view);
    if (view !== 'find') updateWizardNav(false);
    if (view === 'find') renderFind();
    if (view === 'lookup') renderLookup();
    if (view === 'shortlist') renderShortlist();
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { if (state.ready) route(location.hash.replace('#', '')); });

  // ================================================================
  // FIND: question flow
  // ================================================================
  function steps() {
    const both = jobOn('paint') && jobOn('stain');
    if (!jobOn('paint')) state.answers.job = 'stain';
    if (!jobOn('stain')) state.answers.job = 'paint';
    // Basic asks the quick questions; Advanced adds more specific ones; Perfect adds a few "which do you like
    // better?" rounds and shows the one color that wins
    const mode = state.answers.mode || 'basic', more = mode !== 'basic', perfect = mode === 'perfect';
    const start = (both ? ['job'] : []).concat(['mode']);
    if (state.answers.job === 'stain') return start.concat(['target', 'wood'], more ? ['around'] : [], ['slook'], more ? ['finish'] : [], perfect ? ['duel'] : []);
    const list = start.concat(['space'], more ? ['now'] : [], ['light', 'look'], more ? ['feel'] : [], ['color']);
    if (settings.askFixed) list.push('room');
    if (perfect) list.push('duel');
    return list;
  }
  const STEP_LABEL = { mode: 'Mode', now: 'Now', feel: 'Feel', around: 'Around', finish: 'Finish', duel: 'Choose', job: 'Paint or Stain', space: 'Space', light: 'Light', look: 'Style', color: 'Color', room: 'Room', target: 'What', wood: 'Wood', slook: 'Look' };

  const SPACE_SUB = {
    living: 'Main gathering space', bedroom: 'Rest and sleep', kitchen: 'Needs a cleanable finish', bathroom: 'Moisture, small windows', dining: 'Often seen at night',
    office: 'Focus and video calls', kids: 'Fun but washable', nursery: 'Soft and calm', entry: 'High traffic, first look', basement: 'Little daylight',
    stairs: 'Tall walls, busy', laundry: 'Moisture and wear', sunroom: 'Light on several sides', garage: 'Tough, often dim',
    accent: 'One feature wall', ceiling: 'Overhead', trim: 'Baseboards, casing, doors', cabinets: 'Kitchen or bath', furniture: 'Dressers, tables, chairs',
    ext_body: 'Main siding color', ext_trim: 'Fascia, windows, corners', front_door: 'The pop of color',
  };
  const STYLE_SUB = {
    modern: 'Crisp, clean, low contrast', cozy: 'Soft, warm, welcoming', coastal: 'Airy whites, sea blues', farmhouse: 'Warm whites, greige, sage', traditional: 'Classic, rich, layered',
    scandi: 'Pale, calm, natural', moody: 'Deep, enveloping color', midcentury: 'Teal, mustard, olive', boho: 'Terracotta, clay, blush', industrial: 'Concrete grays, charcoal',
    japandi: 'Muted, earthy, quiet', mediterranean: 'Sun-washed, earthy, azure',
  };
  const FAMILY_SAMPLE = {
    white: ['F2F0E9', 'EDEAE0', 'E9EBE7'], 'warm-neutral': ['E3D9C9', 'CFC1AA', 'B5A48C'], 'cool-neutral': ['DADBD8', 'B9BBB8', '8E918F'],
    green: ['C9D3BE', '8FA588', '4E6650'], blue: ['C9D6E0', '7F9BB2', '2F4A66'], earthy: ['D9A783', 'B5653F', '7A4A33'],
    'pink-purple': ['EBCFCF', 'C79AA6', '6E4D6A'], dark: ['3A3D42', '2B3A36', '1F2329'], bold: ['D8443A', 'E3A02B', '1F6F8B'],
  };
  // Question 5 chips. Floors ask the type first (wood, carpet, tile, concrete), then show that type's colors.
  const itemChip = (f, g, a) => `<button type="button" class="mchip" data-fixed="${f.id}" data-group="${g.key}" aria-pressed="${a.fixed.includes(f.id)}" aria-label="${esc(f.label)}"><span class="msw" style="background:${matBg(f)}"></span>${esc(f.short)}</button>`;
  function typeOf(g, a) {
    if (state.ftype[g.key]) return state.ftype[g.key];
    return Object.keys(g.types).find(k => g.types[k].ids.some(id => a.fixed.includes(id))) || '';
  }
  function typeRows(g, a) {
    const cur = typeOf(g, a);
    const t = cur && g.types[cur];
    return `<div class="mchips">${Object.entries(g.types).map(([k, tp]) => { const f = E.FIXED_ITEMS.find(x => x.id === tp.ids[Math.min(1, tp.ids.length - 1)]); return `<button type="button" class="mchip mtype" data-ftype="${k}" data-group="${g.key}" aria-pressed="${cur === k}" aria-expanded="${cur === k && tp.ids.length > 1}"><span class="msw" style="background:${matBg(f)}"></span>${esc(tp.label)}</button>`; }).join('')}</div>
      ${t && t.ids.length > 1 ? `<div class="msub"><p class="msub-label">Which ${esc(t.label.split(' ')[0].toLowerCase())} color?</p><div class="mchips">${t.ids.map(id => itemChip(E.FIXED_ITEMS.find(x => x.id === id), g, a)).join('')}</div></div>` : ''}`;
  }
  // A small material sample for each "what's staying" option: planks, tile joints, stone speckle, shingles, metal sheen.
  function matBg(f) {
    const c = '#' + f.hex;
    const label = f.label.toLowerCase();
    if (/brick/.test(label)) return `repeating-linear-gradient(0deg, ${c} 0 9px, #d9cfc4 9px 11px)`;
    if (f.kind === 'floor' && /wood|oak|cherry|walnut|lvp/.test(label)) return `repeating-linear-gradient(90deg, rgba(0,0,0,.14) 0 1px, transparent 1px 25%), linear-gradient(100deg, rgba(255,255,255,.14), rgba(0,0,0,.10)), ${c}`;
    if (f.kind === 'floor' && /tile|travertine/.test(label)) return `repeating-linear-gradient(90deg, transparent 0 32%, rgba(255,255,255,.5) 32% 33.5%), ${c}`;
    if (f.kind === 'floor') return `linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.08)), ${c}`;
    if (f.kind === 'counter' && f.L > 85) return `linear-gradient(125deg, transparent 38%, rgba(0,0,0,.10) 41%, transparent 45%, transparent 70%, rgba(0,0,0,.06) 72%, transparent 75%), ${c}`;
    if (f.kind === 'counter' && /butcher/.test(label)) return `repeating-linear-gradient(90deg, rgba(0,0,0,.10) 0 1px, transparent 1px 12%), ${c}`;
    if (f.kind === 'counter' || f.kind === 'stone') return `radial-gradient(rgba(0,0,0,.22) 1px, transparent 1.6px) 0 0 / 7px 7px, radial-gradient(rgba(255,255,255,.25) 1px, transparent 1.6px) 3px 3px / 9px 9px, ${c}`;
    if (f.kind === 'cabinet') return `linear-gradient(90deg, transparent 48.5%, rgba(0,0,0,.18) 48.5% 51.5%, transparent 51.5%), linear-gradient(180deg, rgba(255,255,255,.08), rgba(0,0,0,.06)), ${c}`;
    if (f.kind === 'fixture') return `linear-gradient(110deg, rgba(0,0,0,.12), rgba(255,255,255,.5) 50%, rgba(0,0,0,.12)), ${c}`;
    if (f.kind === 'roof') return `repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 8px), ${c}`;
    if (f.kind === 'window') return `linear-gradient(180deg, #9fb6c8, #dbe6ee) center / 70% 58% no-repeat, ${c}`;
    return `linear-gradient(180deg, rgba(255,255,255,.12), rgba(0,0,0,.12)), ${c}`;
  }
  const LIGHT_NOTE = {
    north: 'Cool, even, indirect light all day. Colors look cooler and a little darker, so warm undertones help.',
    south: 'Bright, warm light most of the day. Colors look lighter and warmer; cool and deeper colors hold up well.',
    east: 'Warm and bright in the morning, cooler and flatter in the afternoon.',
    west: 'Soft and cool in the morning, strong warm orange light in the evening.',
    unsure: 'No problem. The picks will stay balanced for any light.',
    none: 'Only bulbs light this room, so the bulb type matters most.',
  };
  const LIGHT_NOTE_SHORT = {
    north: 'North: cool, even light all day.', south: 'South: bright, warm light most of the day.',
    east: 'East: warm and bright in the morning.', west: 'West: strong warm light in the evening.',
  };
  const LIGHT_NOTE_MIX = 'Windows on more than one side make the room brighter, and each wall reads a little differently.';
  const GLOW = { north: 'rgba(150,180,230,.55)', south: 'rgba(255,214,140,.6)', east: 'rgba(255,232,180,.6)', west: 'rgba(255,170,110,.6)' };

  const check = '<span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" width="10" height="10"><path d="M2.5 6.2l2.2 2.2 4.8-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  const optBtn = (attrs, pressed, inner) => `<button type="button" class="opt" ${attrs} aria-pressed="${pressed}">${check}${inner}</button>`;
  const seg = (name, map, value, label) => `<div class="seg" role="group" aria-label="${esc(label)}">${Object.entries(map).map(([k, v]) => `<button type="button" data-seg="${name}" data-val="${k}" aria-pressed="${value === k}">${esc(v)}</button>`).join('')}</div>`;

  // ================================================================
  // IN-HOUSE CONTROLS: dropdown menus and color picker (no browser defaults)
  // ================================================================
  const chevron = '<svg class="cg-chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 5.5L7 9l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SELECTS = {};   // id -> { options: [[value, label]], value, onChange }
  const COLORS = {};    // id -> { hex, onChange }
  // Defaults for the controls inside question 5 (their values live in state)
  SELECTS.cfKind = { onChange: v => { state.cfKind = v; } };
  COLORS.cfColor = { onChange: hex => { state.cfColor = hex; } };

  function selectHtml(id, options, value, label) {
    const cur = options.find(o => String(o[0]) === String(value)) || options[0];
    SELECTS[id] = Object.assign(SELECTS[id] || {}, { options, value: cur[0] });
    return `<button type="button" class="cg-select" id="${id}" data-select="${id}" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(label)}: ${esc(cur[1])}"><span class="cg-select-label">${esc(cur[1])}</span>${chevron}</button>`;
  }
  function colorHtml(id, hex, label) {
    hex = String(hex || '8A6F55').replace('#', '').toUpperCase();
    COLORS[id] = Object.assign(COLORS[id] || {}, { hex });
    return `<button type="button" class="cg-color" id="${id}" data-colorpick="${id}" aria-haspopup="dialog" aria-label="${esc(label)}: #${hex}"><span class="cg-color-sw" style="background:#${hex}"></span><span class="cg-color-hex mono">#${hex}</span>${chevron}</button>`;
  }

  // one floating panel shared by menus and the color picker
  let pop = null, popAnchor = null, popKind = '';
  function closePop(focusBack) {
    if (!pop) return;
    const el = pop, anchor = popAnchor;
    pop = null; popAnchor = null; popKind = '';
    if (anchor) anchor.setAttribute('aria-expanded', 'false');
    if (reduced()) el.remove(); else { el.classList.add('out'); setTimeout(() => el.remove(), 160); }
    if (focusBack && anchor && document.contains(anchor)) anchor.focus({ preventScroll: true });
  }
  function placePop(el, anchor) {
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const w = Math.min(Math.max(r.width, el.offsetWidth), vw - 24);
    let left = Math.min(Math.max(12, r.left), vw - w - 12);
    const below = vh - r.bottom, above = r.top;
    const h = el.offsetHeight;
    const up = below < h + 16 && above > below;
    el.style.left = left + 'px';
    el.style.minWidth = Math.min(r.width, vw - 24) + 'px';
    el.style.top = (up ? Math.max(12, r.top - h - 6) : Math.min(vh - h - 12, r.bottom + 6)) + 'px';
    el.style.transformOrigin = up ? 'bottom left' : 'top left';
  }
  function openSelect(anchor) {
    const id = anchor.dataset.select, cfg = SELECTS[id]; if (!cfg) return;
    if (pop && popAnchor === anchor) { closePop(true); return; }
    closePop();
    const el = document.createElement('div');
    el.className = 'cg-pop cg-menu'; el.setAttribute('role', 'listbox'); el.setAttribute('aria-label', anchor.getAttribute('aria-label') || '');
    el.innerHTML = cfg.options.map(([v, l]) => `<button type="button" role="option" class="cg-opt" data-value="${esc(v)}" aria-selected="${String(v) === String(cfg.value)}"><span>${esc(l)}</span><svg class="cg-check" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.2l2.6 2.6L11 4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`).join('');
    document.body.appendChild(el);
    pop = el; popAnchor = anchor; popKind = 'select';
    anchor.setAttribute('aria-expanded', 'true');
    placePop(el, anchor);
    const sel = $('[aria-selected="true"]', el) || $('.cg-opt', el);
    sel.focus({ preventScroll: true }); sel.scrollIntoView({ block: 'nearest' });
    el.addEventListener('click', e => { const o = e.target.closest('.cg-opt'); if (o) chooseOption(id, o.dataset.value); });
    el.addEventListener('keydown', e => {
      const opts = $$('.cg-opt', el); const i = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (opts[i + 1] || opts[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (opts[i - 1] || opts[opts.length - 1]).focus(); }
      else if (e.key === 'Home') { e.preventDefault(); opts[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); opts[opts.length - 1].focus(); }
      else if (e.key === 'Tab') closePop();
      else if (e.key.length === 1 && /\S/.test(e.key)) { const k = e.key.toLowerCase(); const hit = opts.slice(i + 1).concat(opts.slice(0, i + 1)).find(o => o.textContent.trim().toLowerCase().startsWith(k)); if (hit) hit.focus(); }
    });
  }
  function chooseOption(id, value) {
    const cfg = SELECTS[id]; const opt = cfg.options.find(o => String(o[0]) === String(value)); if (!opt) return;
    cfg.value = opt[0];
    const btn = document.getElementById(id);
    if (btn) { $('.cg-select-label', btn).textContent = opt[1]; btn.setAttribute('aria-label', (btn.getAttribute('aria-label') || '').split(':')[0] + ': ' + opt[1]); }
    closePop(true);
    if (cfg.onChange) cfg.onChange(opt[0]);
  }

  // ---- color picker: shade square, hue bar, hex box, quick swatches ----
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
    el.innerHTML = `
      <div class="cp-sv" tabindex="0" aria-label="Shade: use arrow keys"><span class="cp-sv-dot"></span></div>
      <div class="cp-hue" tabindex="0" aria-label="Hue: use arrow keys"><span class="cp-hue-dot"></span></div>
      <div class="cp-row"><span class="cp-prev"></span><label class="cp-hex"><span>#</span><input type="text" class="cg-input mono" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex color"></label><button type="button" class="btn small primary cp-done">Done</button></div>
      <div class="cp-quick">${QUICK.map(q => `<button type="button" class="cp-q" data-q="${q}" style="background:#${q}" aria-label="#${q}"></button>`).join('')}</div>`;
    document.body.appendChild(el);
    pop = el; popAnchor = anchor; popKind = 'color';
    anchor.setAttribute('aria-expanded', 'true');
    const sv = $('.cp-sv', el), hue = $('.cp-hue', el), hexIn = $('.cp-hex input', el);
    const draw = (fromInput) => {
      const hex = hsvToHex(h, s, v);
      sv.style.backgroundColor = '#' + hsvToHex(h, 1, 1);
      $('.cp-sv-dot', el).style.left = (s * 100) + '%'; $('.cp-sv-dot', el).style.top = ((1 - v) * 100) + '%';
      $('.cp-hue-dot', el).style.left = (h / 360 * 100) + '%';
      $('.cp-prev', el).style.background = '#' + hex;
      if (!fromInput) hexIn.value = hex;
      cfg.hex = hex;
      const sw = $('.cg-color-sw', anchor), tx = $('.cg-color-hex', anchor);
      if (sw) sw.style.background = '#' + hex; if (tx) tx.textContent = '#' + hex;
      if (cfg.onChange) cfg.onChange(hex, false);
    };
    const drag = (node, fn) => {
      node.addEventListener('pointerdown', e => {
        e.preventDefault(); node.setPointerCapture(e.pointerId); node.focus({ preventScroll: true });
        const move = ev => { const r = node.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))); draw(); };
        move(e);
        const up = () => { node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); };
        node.addEventListener('pointermove', move); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
      });
    };
    drag(sv, (x, y) => { s = x; v = 1 - y; });
    drag(hue, x => { h = Math.min(359.9, x * 360); });
    sv.addEventListener('keydown', e => { const st = e.shiftKey ? 0.1 : 0.02; if (e.key === 'ArrowLeft') s = Math.max(0, s - st); else if (e.key === 'ArrowRight') s = Math.min(1, s + st); else if (e.key === 'ArrowUp') v = Math.min(1, v + st); else if (e.key === 'ArrowDown') v = Math.max(0, v - st); else return; e.preventDefault(); draw(); });
    hue.addEventListener('keydown', e => { const st = e.shiftKey ? 20 : 4; if (e.key === 'ArrowLeft') h = Math.max(0, h - st); else if (e.key === 'ArrowRight') h = Math.min(359.9, h + st); else return; e.preventDefault(); draw(); });
    hexIn.addEventListener('input', () => { const m = hexIn.value.replace('#', '').match(/^[0-9a-f]{6}$/i); if (m) { [h, s, v] = hexToHsv(m[0]); draw(true); } });
    el.addEventListener('click', e => {
      const q = e.target.closest('.cp-q'); if (q) { [h, s, v] = hexToHsv(q.dataset.q); draw(); return; }
      if (e.target.closest('.cp-done')) { if (cfg.onChange) cfg.onChange(cfg.hex, true); closePop(true); }
    });
    draw();
    placePop(el, anchor);
    sv.focus({ preventScroll: true });
  }

  document.addEventListener('click', e => {
    const s = e.target.closest('[data-select]'); if (s) { openSelect(s); return; }
    const c = e.target.closest('[data-colorpick]'); if (c) { openColor(c); return; }
    if (pop && !e.target.closest('.cg-pop')) closePop();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop) { e.stopImmediatePropagation(); closePop(true); } }, true);
  window.addEventListener('resize', () => closePop());
  document.addEventListener('scroll', e => { if (pop && !(e.target instanceof Element && e.target.closest('.cg-pop'))) closePop(); }, true);
  // remember whether "Add something else" is open across re-renders
  document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('custom-more')) state.customOpen = e.target.open; }, true);

  function renderFind() {
    if (state.results) return renderResults();
    renderWizard(0);
  }

  function renderWizard(dir) {
    const host = $('#view-find');
    const list = steps();
    if (state.step >= list.length) state.step = list.length - 1;
    const id = list[state.step];
    const last = state.step === list.length - 1;
    const optional = ['look', 'color', 'room', 'slook', 'now', 'feel', 'around', 'finish'].includes(id);
    host.innerHTML = `
      <div class="wizard">
        <div class="progress" style="--steps:${list.length}">
          ${list.map((s, i) => `<button type="button" class="progress-step ${i < state.step ? 'done' : ''} ${i === state.step ? 'current' : ''}" data-goto="${i}" ${i > state.step ? 'disabled' : ''}><span class="bar"></span><span class="lbl">${i + 1}. ${s === 'room' && (E.SPACES[state.answers.space] || {}).kind === 'exterior' ? 'House' : STEP_LABEL[s]}</span></button>`).join('')}
        </div>
        <div class="step-stage"><div class="step" id="stepBody">${stepHtml(id)}</div></div>
      </div>`;
    // the bottom bar is one permanent element: only its labels change, so it never jumps between questions
    updateWizardNav(true, { first: state.step === 0, last, optional, duel: id === 'duel' });
    const body = $('#stepBody');
    if (dir && !reduced()) body.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (id === 'look') fillStylePalettes();
    if (id === 'slook') fillLookSamples();
    paintWoods(body, 'none');
  }

  function stepHtml(id) {
    if (['job', 'target', 'wood', 'slook', 'around', 'finish'].includes(id)) return stainStepHtml(id);
    if (['mode', 'now', 'feel', 'duel'].includes(id)) return moreStepHtml(id);
    const a = state.answers;
    const sp = E.SPACES[a.space] || E.SPACES.living;
    if (id === 'space') {
      const groups = [['Rooms', ['living', 'bedroom', 'kitchen', 'bathroom', 'dining', 'office', 'kids', 'nursery', 'entry', 'stairs', 'laundry', 'sunroom', 'basement', 'garage']], ['Surfaces & Furniture', ['accent', 'ceiling', 'trim', 'cabinets', 'furniture']], ['Outside', ['ext_body', 'ext_trim', 'front_door']]];
      const sizeQ = sp.kind === 'interior' && !['ceiling', 'trim', 'cabinets'].includes(sp.surface);
      return `
        <div class="step-head">${qLabel('space')}<h1>What’s being painted?</h1></div>
        ${groups.map(([g, ids]) => `<div class="group"><p class="section-title">${g}</p><div class="options">${ids.map(k => optBtn(`data-space="${k}"`, a.space === k, `<span class="opt-title">${esc(E.SPACES[k].label)}</span><span class="opt-sub">${esc(SPACE_SUB[k])}</span>`)).join('')}</div></div>`).join('')}
        ${sizeQ ? `<div class="group"><p class="group-label">How big is the room?</p>${seg('size', { small: 'Small', medium: 'Medium', large: 'Large or Open Plan' }, a.size, 'Room size')}</div>` : ''}
        ${a.space === 'ext_body' ? `<div class="group"><p class="group-label">What is the siding? <span class="hint">Vinyl limits how dark it can go</span></p>${seg('siding', E.SIDING, a.siding, 'Siding')}</div>` : ''}`;
    }
    if (id === 'light') {
      const ext = sp.kind === 'exterior';
      const pos = { north: [50, 7], east: [93, 50], south: [50, 93], west: [7, 50] };
      const fs = a.facings || [];
      const ang = { north: '180deg', south: '0deg', east: '270deg', west: '90deg' };
      // one glow per window side, so a corner room lights up from two edges
      const glows = fs.map(d => `<span class="glow" style="background: linear-gradient(${ang[d]}, ${GLOW[d]}, transparent 62%)"></span>`).join('');
      const note = fs.length ? fs.map(d => LIGHT_NOTE_SHORT[d]).join(' ') + (fs.length > 1 ? ' ' + LIGHT_NOTE_MIX : '') : LIGHT_NOTE[a.facing === 'none' ? 'none' : 'unsure'];
      return `
        <div class="step-head">${qLabel('light')}<h1>${ext ? 'Which way does this side of the house face?' : 'Which way do the windows face?'}</h1><p>${ext ? 'Sun exposure changes how light or dark an exterior color reads.' : 'Tap every side that has windows. Corner rooms often have two.'}</p></div>
        <div class="light-grid">
          <div>
            <div class="compass">
              <div class="compass-ring"></div>
              <div class="compass-room ${fs.length ? 'has-dir' : ''}">${glows}<span>${ext ? 'House' : 'The room'}</span></div>
              ${Object.entries(pos).map(([k, [x, y]]) => `<button type="button" class="compass-btn" style="left:${x}%;top:${y}%" data-facing="${k}" aria-pressed="${fs.includes(k)}" aria-label="${E.FACING[k]} windows">${k[0].toUpperCase()}</button>`).join('')}
            </div>
          </div>
          <div class="group" style="gap:18px">
            <div class="seg" role="group" aria-label="Other options">
              <button type="button" data-facing="unsure" aria-pressed="${!fs.length && a.facing !== 'none'}">Not Sure</button>
              ${ext ? '' : `<button type="button" data-facing="none" aria-pressed="${a.facing === 'none'}">No Windows</button>`}
            </div>
            <p class="light-note" id="lightNote">${esc(note)}</p>
            <div class="group"><p class="group-label">${ext ? 'Sun exposure' : 'How much daylight?'}</p>${ext ? seg('amount', { low: 'Mostly Shade', medium: 'Partial Sun', high: 'Full Sun' }, a.amount, 'Sun exposure') : seg('amount', E.AMOUNTS, a.amount, 'Daylight')}</div>
            ${!ext && settings.askBulbs ? `<div class="group"><p class="group-label">What bulbs are in the room?</p>${seg('bulbs', E.BULBS, a.bulbs, 'Bulbs')}</div>` : ''}
          </div>
        </div>`;
    }
    if (id === 'look') {
      return `
        <div class="step-head">${qLabel('look')}<h1>What style?</h1><p>Pick up to two, or skip this one.</p></div>
        <div class="options wide">
          ${Object.entries(E.STYLES).map(([k, s]) => optBtn(`data-style="${k}"`, a.styles.includes(k), `<span class="opt-title">${esc(s.label)}</span><span class="opt-sub">${esc(STYLE_SUB[k])}</span><span class="chips" data-palette="${k}"><span></span><span></span><span></span><span></span></span>`)).join('')}
        </div>`;
    }
    if (id === 'color') {
      // ceilings and trim: one quick "what kind of white" choice instead of color families
      const wt = E.WHITE_TYPES[sp.surface];
      if (wt) {
        const sample = { crisp: ['F4F5F3', 'EEF0EF', 'E6E9E9'], warm: ['F4EFE4', 'EFE7D6', 'E9DFCB'], tint: ['E4E7E0', 'E9E1D9', 'DDE3E6'], bold: ['2F4A66', '6E8F7A', 'B5653F'], match: ['D6CCBC', 'C2C4C3', '9DAEA9'], dark: ['2B2C2E', '2F3B4C', '3E3A35'] };
        return `
        <div class="step-head">${qLabel('color')}<h1>What kind of ${sp.surface === 'ceiling' ? 'ceiling' : 'trim'} color?</h1><p>One tap. Skip to get the most popular whites.</p></div>
        <div class="options wide">
          ${Object.entries(wt).map(([k, v]) => optBtn(`data-white="${k}"`, a.whiteType === k, `<span class="opt-title">${esc(v)}</span><span class="chips">${sample[k].map(h => `<span style="background:#${h}"></span>`).join('')}</span>`)).join('')}
        </div>`;
      }
      return `
        <div class="step-head">${qLabel('color')}<h1>Which colors?</h1><p>Pick any, or skip this one.</p></div>
        <div class="options">
          ${Object.entries(E.FAMILY_CHOICES).map(([k, v]) => optBtn(`data-family="${k}"`, a.families.includes(k), `<span class="opt-title">${esc(v)}</span><span class="chips">${FAMILY_SAMPLE[k].map(h => `<span style="background:#${h}"></span>`).join('')}</span>`)).join('')}
        </div>
        <div class="group"><p class="group-label">How light or dark?</p>${seg('depth', E.DEPTHS, a.depth, 'Depth')}</div>`;
    }
    if (id === 'room') {
      const ext = sp.kind === 'exterior';
      const groups = E.groupsFor(a.space);
      const custom = a.customFixed || [];
      const kinds = Object.entries(E.FIXED_KINDS).filter(([k]) => (ext ? ['roof', 'stone', 'siding', 'trim', 'window', 'custom'] : ['floor', 'carpet', 'trim', 'counter', 'cabinet', 'furniture', 'fixture', 'stone', 'wall', 'custom']).includes(k));
      const where = { ceiling: 'around the ceiling', trim: 'around the trim', cabinets: 'around the cabinets', accent: 'in the room' }[a.space] || (ext ? '' : 'in the ' + sp.label.toLowerCase());
      return `
        <div class="step-head">${qLabel('room')}<h1>${ext ? 'What else is on the house?' : `What\u2019s staying ${esc(where)}?`}</h1><p>Tap what’s already there. Skip anything that doesn’t apply.</p></div>
        ${groups.map(g => `<div class="group mgroup"><p class="group-label">${esc(g.title)}${g.max ? ` <span class="hint">up to ${g.max}</span>` : ''}</p>
          ${g.types ? typeRows(g, a) : ''}
          <div class="mchips"${g.types ? ' hidden' : ''}>
            ${(g.types ? [] : g.ids || []).map(fid => itemChip(E.FIXED_ITEMS.find(x => x.id === fid), g, a)).join('')}
            ${Object.entries(g.flags || {}).map(([k, v]) => `<button type="button" class="mchip mchip-flag" data-flag="${k}" aria-pressed="${!!a[k]}"><span class="msw flag-sw" aria-hidden="true">${k === 'crown' ? '<svg viewBox="0 0 20 20" width="14" height="14"><path d="M3 6h14M4 9h12M6 12h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' : '<svg viewBox="0 0 20 20" width="14" height="14"><path d="M4 14l8-8 3 3-8 8H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'}</span>${esc(v)}</button>`).join('')}
          </div></div>`).join('')}
        <div class="group mgroup">
          ${custom.length ? `<div class="custom-list">${custom.map((x, i) => `<span class="custom-chip"><i style="background:#${esc(x.hex)}"></i>${esc(x.label)}<button type="button" data-remove-custom="${i}" aria-label="Remove ${esc(x.label)}">\u00d7</button></span>`).join('')}</div>` : ''}
          <details class="custom-more" ${state.customOpen ? 'open' : ''}><summary>+ Add Something Else</summary>
            <div class="custom-add">
              <input type="text" id="cfLabel" class="cg-input" maxlength="40" placeholder="Name it, like area rug" aria-label="Item name" autocomplete="off">
              ${selectHtml('cfKind', kinds, state.cfKind || 'custom', 'What it is')}
              ${colorHtml('cfColor', state.cfColor || '8A6F55', 'Its color')}
              <button type="button" class="btn small" data-act="add-custom">Add</button>
            </div>
          </details>
        </div>`;
    }
    return '';
  }

  function fillStylePalettes() {
    const key = JSON.stringify([brandsEnabled(), settings.storeBrand, settings.storeOnly, state.answers.space]);
    // Each look shows its two best light colors, its best mid-tone and its best deep color,
    // one look per tick so the page stays responsive.
    const ids = Object.keys(E.STYLES);
    const one = i => {
      const k = ids[i]; if (!k) return;
      const cacheKey = key + k;
      if (!state.stylePalettes[cacheKey]) {
        const base = { space: state.answers.space, styles: [k] };
        const es = engineSettings();
        const pick = (depth, n) => E.recommend(Object.assign({}, base, { depth }), Object.assign({}, es, { resultCount: n })).results.map(x => x.color.hex);
        state.stylePalettes[cacheKey] = E.STYLES[k].depth < 30 ? pick('deep', 3).concat(pick('mid', 1)) : pick('light', 2).concat(pick('mid', 1), pick('deep', 1));
      }
      const host = $(`[data-palette="${k}"]`);
      if (host) $$('span', host).forEach((s, j) => { const h = state.stylePalettes[cacheKey][j]; if (h) { s.dataset.hex = h; s.style.backgroundColor = paint(h); } });
      setTimeout(() => one(i + 1), 0);
    };
    setTimeout(() => one(0), 30);
  }

  // Jump to the top instantly: a smooth scroll makes phone browsers slide their toolbar in and out,
  // which drags anything pinned to the bottom of the screen with it.
  const toTop = () => { if (window.scrollY > 0) window.scrollTo(0, 0); };
  function goStep(i, dir) { state.step = i; renderWizard(dir); toTop(); }
  function finishWizard() {
    const a = state.answers, perfect = a.mode === 'perfect';
    const count = perfect ? { resultCount: DUEL_SIZE } : {};
    if (a.job === 'stain') { state.results = S.recommend(a, Object.assign(stainSettings(), count)); state.roomLight = 'daylight'; }
    else { state.results = E.recommend(a, Object.assign({}, engineSettings(), count)); state.roomLight = E.lightForAnswers(a); }
    if (perfect) {
      // the color picked in the rounds (or the top one) is the answer; the rest are kept as finalists
      const R = state.results, idOf = r => r.id || (r.color && r.color.id);
      const i = Math.max(0, R.results.findIndex(r => idOf(r) === a.perfectPick));
      R.finalists = R.results.filter((_, j) => j !== i);
      R.results = R.results.slice(i, i + 1).map(r => Object.assign(r, { role: 'Your Perfect Color' }));
      R.perfect = true;
    }
    state.gridLight = 'none'; renderResults(true); toTop();
  }

  $('#view-find').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    const a = state.answers;
    if (stainClick(t) || moreClick(t)) return;
    if (t.dataset.space) {
      a.space = t.dataset.space;
      const sp = E.SPACES[a.space];
      // each job has its own "what's staying" list and its own question 4
      state.ftype = {};
      const allowed = E.allowedFixed(a.space);
      a.fixed = a.fixed.filter(id => allowed.has(id));
      if (!E.WHITE_TYPES[sp.surface]) a.whiteType = '';
      if (sp.surface) a.trimPaint = false;
      if (sp.dimByNature && a.amount === 'medium') a.amount = 'low';
      if (sp.sunny && a.amount !== 'high') a.amount = 'high';
      if (sp.kind === 'exterior' && (a.facing === 'none')) a.facing = 'unsure';
      rerenderStep();
      return;
    }
    if (t.dataset.facing) {
      // directions toggle (several sides allowed); "Not sure" and "No windows" clear them
      const d = t.dataset.facing;
      a.facings = a.facings || [];
      if (d === 'unsure' || d === 'none') { a.facings = []; a.facing = d; if (d === 'none') a.amount = 'low'; }
      else {
        a.facings = a.facings.includes(d) ? a.facings.filter(x => x !== d) : E.DIRS.filter(x => x === d || a.facings.includes(x));
        a.facing = a.facings[0] || 'unsure';
        if (a.facings.length >= 2 && a.amount === 'low') a.amount = 'medium';
      }
      rerenderStep(); return;
    }
    if (t.dataset.seg) { a[t.dataset.seg] = t.dataset.seg === 'pets' ? t.dataset.val === 'yes' : t.dataset.val; $$(`[data-seg="${t.dataset.seg}"]`).forEach(b => b.setAttribute('aria-pressed', b.dataset.val === t.dataset.val)); if (t.dataset.seg === 'grain' || t.dataset.seg === 'condition') fillLookSamples(); return; }
    if (t.dataset.style) {
      const k = t.dataset.style; const i = a.styles.indexOf(k);
      if (i >= 0) a.styles.splice(i, 1); else { a.styles.push(k); if (a.styles.length > 2) a.styles.shift(); }
      $$('[data-style]').forEach(b => b.setAttribute('aria-pressed', a.styles.includes(b.dataset.style)));
      return;
    }
    if (t.dataset.family) { toggleIn(a.families, t.dataset.family); t.setAttribute('aria-pressed', a.families.includes(t.dataset.family)); return; }
    if (t.dataset.white) {
      a.whiteType = a.whiteType === t.dataset.white ? '' : t.dataset.white;
      $$('[data-white]').forEach(b => b.setAttribute('aria-pressed', b.dataset.white === a.whiteType));
      return;
    }
    if (t.dataset.fixed) {
      const id = t.dataset.fixed;
      const g = E.FIXED_GROUPS[t.dataset.group] || {};
      const inGroup = x => (g.ids || []).includes(x);
      if (a.fixed.includes(id)) a.fixed = a.fixed.filter(x => x !== id);
      else {
        if (g.one) a.fixed = a.fixed.filter(x => !inGroup(x)); // one per row: tapping another switches
        if (g.max) { const mine = a.fixed.filter(inGroup); if (mine.length >= g.max) a.fixed = a.fixed.filter(x => x !== mine[0]); }
        a.fixed.push(id);
      }
      $$('[data-fixed]').forEach(b => b.setAttribute('aria-pressed', a.fixed.includes(b.dataset.fixed)));
      return;
    }
    if (t.dataset.ftype) {
      const g = Object.assign({ key: t.dataset.group }, E.FIXED_GROUPS[t.dataset.group]); const k = t.dataset.ftype; const tp = g.types[k];
      const inGroup = x => g.ids.includes(x);
      if (typeOf(g, a) === k) { state.ftype[g.key] = ''; a.fixed = a.fixed.filter(x => !inGroup(x)); } // tap again to clear
      else {
        state.ftype[g.key] = k;
        a.fixed = a.fixed.filter(x => !inGroup(x) || tp.ids.includes(x));
        if (tp.ids.length === 1) a.fixed.push(tp.ids[0]); // concrete has only one color
      }
      rerenderStep();
      const sub = $(`[data-group="${g.key}"][data-ftype="${k}"]`); if (sub && !reduced()) { const s = sub.closest('.mgroup').querySelector('.msub'); if (s) s.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
      return;
    }
    if (t.dataset.flag) { a[t.dataset.flag] = !a[t.dataset.flag]; $$(`[data-flag="${t.dataset.flag}"]`).forEach(b => b.setAttribute('aria-pressed', !!a[t.dataset.flag])); return; }
    if (t.dataset.act === 'add-custom') {
      const label = ($('#cfLabel').value || '').trim() || 'Custom item';
      a.customFixed = (a.customFixed || []).concat([{ label: label.slice(0, 40), hex: state.cfColor || '8A6F55', kind: state.cfKind || 'custom' }]);
      state.customOpen = true;
      rerenderStep(); return;
    }
    if (t.dataset.removeCustom != null) { a.customFixed.splice(+t.dataset.removeCustom, 1); rerenderStep(); return; }
    if (t.dataset.goto != null && !t.disabled) { const i = +t.dataset.goto; if (i !== state.step) goStep(i, i < state.step ? -1 : 1); return; }
    if (t.dataset.act) wizardAct(t.dataset.act);
  });
  function wizardAct(act) {
    const a = state.answers;
    if (act === 'back' && state.step > 0) goStep(state.step - 1, -1);
    if (act === 'next' && steps()[state.step] === 'duel') { duelChooseForMe(); return; }
    if (act === 'next' || act === 'skip') {
      const id = steps()[state.step];
      if (act === 'skip') { if (id === 'now') { a.nowKind = ''; a.nowHex = ''; a.surface = ''; a.issues = []; } if (id === 'feel') { a.feel = ''; a.undertone = ''; a.avoid = []; } if (id === 'around') { a.matchWood = ''; a.wallTone = ''; } if (id === 'finish') { a.sheen = ''; a.evenness = ''; a.pets = false; } if (id === 'slook') a.looks = []; if (id === 'look') a.styles = []; if (id === 'color') { a.families = []; a.depth = 'any'; a.whiteType = ''; } if (id === 'room') { a.fixed = []; a.customFixed = []; a.trimPaint = false; a.crown = false; } }
      if (state.step < steps().length - 1) goStep(state.step + 1, 1); else finishWizard();
    }
    if (act === 'skipall') { a.fixed = []; a.customFixed = []; a.trimPaint = false; a.crown = false; finishWizard(); }
  }
  function updateWizardNav(show, o) {
    const nav = $('#wizardNav');
    nav.hidden = !show;
    document.documentElement.classList.toggle('nav-on', !!show); // keeps the page scrollbar above the bar
    if (!show) return;
    const back = $('.nav-back', nav), skip = $('.nav-skip', nav), next = $('.nav-next', nav);
    back.disabled = o.first;
    skip.dataset.act = o.last ? 'skipall' : 'skip';
    skip.disabled = !o.optional; skip.style.visibility = o.optional ? '' : 'hidden'; skip.tabIndex = o.optional ? 0 : -1;
    skip.setAttribute('aria-hidden', o.optional ? 'false' : 'true');
    $('.nav-next-label', next).textContent = o.duel ? 'Choose for Me' : o.last ? (state.answers.job === 'stain' ? 'Show Stains' : 'Show Colors') : 'Next';
  }
  $('#wizardNav').addEventListener('click', e => { const t = e.target.closest('button'); if (t && !t.disabled && state.view === 'find' && !state.results) wizardAct(t.dataset.act); });
  function rerenderStep() {
    const id = steps()[state.step];
    const body = $('#stepBody'); if (!body) return;
    const y = window.scrollY;
    body.innerHTML = stepHtml(id);
    // the step count can change (exterior has no room step)
    const prog = $('.progress');
    if (prog && prog.children.length !== steps().length) { renderWizard(0); }
    if (id === 'look') fillStylePalettes();
    if (id === 'slook') fillLookSamples();
    paintWoods(body, 'none');
    window.scrollTo(0, y);
  }
  function toggleIn(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

  // ================================================================
  // RESULTS
  // ================================================================
  const PHRASE = { living: 'a living room', bedroom: 'a bedroom', kitchen: 'a kitchen', bathroom: 'a bathroom', dining: 'a dining room', office: 'a home office', kids: 'a kids’ room', nursery: 'a nursery', entry: 'an entry or hallway', stairs: 'a stairway', laundry: 'a laundry room or mudroom', sunroom: 'a sunroom', garage: 'a garage', basement: 'a basement', accent: 'an accent wall', ceiling: 'a ceiling', trim: 'trim and doors', cabinets: 'cabinets', furniture: 'furniture', ext_body: 'house siding', ext_trim: 'exterior trim', front_door: 'a front door' };
  function resultTitle(a) {
    let p = PHRASE[a.space] || 'this space';
    const sp = E.SPACES[a.space] || {};
    let adj = '';
    if (sp.kind === 'interior') adj = E.facingPhrase(a);
    if (sp.kind === 'interior' && E.noWindows(a)) adj = 'windowless';
    if (adj && /^an? /.test(p)) p = (/^[aeiou]/.test(adj) ? 'an ' : 'a ') + adj + ' ' + p.replace(/^an? /, '');
    return `Colors for ${p}`;
  }
  function summaryChips(a) {
    const out = [];
    const st = steps();
    const idx = id => st.indexOf(id);
    out.push([idx('space'), E.SPACES[a.space].label + (a.space === 'ext_body' ? ` · ${E.SIDING[a.siding]}` : '')]);
    const lightBits = [];
    const fs = E.facingsOf(a);
    if (E.noWindows(a)) lightBits.push('No windows');
    else if (fs.length) lightBits.push(fs.map(d => E.FACING[d]).join(' + ') + ' light');
    lightBits.push(E.SPACES[a.space].kind === 'exterior' ? { low: 'Shade', medium: 'Partial Sun', high: 'Full Sun' }[a.amount] : E.AMOUNTS[a.amount]);
    if (a.bulbs !== 'unsure' && settings.askBulbs && E.SPACES[a.space].kind === 'interior') lightBits.push(E.BULBS[a.bulbs].replace(/ \(.*/, '') + ' bulbs');
    out.push([idx('light'), lightBits.join(' · ')]);
    if (idx('now') >= 0) out.push([idx('now'), [a.nowHex ? 'Current color picked' : E.NOW_COLORS[a.nowKind] || 'Current color not given', E.SURFACES[a.surface]].filter(Boolean).join(' · ')]);
    out.push([idx('look'), a.styles.length ? a.styles.map(s => E.STYLES[s].label).join(' + ') : 'Any Style']);
    if (idx('feel') >= 0) out.push([idx('feel'), [E.MOODS[a.feel], E.UNDERTONES[a.undertone], (a.avoid || []).length ? 'Avoiding ' + a.avoid.map(f => E.FAMILY_CHOICES[f]).join(', ') : ''].filter(Boolean).join(' · ') || 'Any Feel']);
    const wt = E.WHITE_TYPES[(E.SPACES[a.space] || {}).surface];
    if (wt) out.push([idx('color'), a.whiteType ? wt[a.whiteType] : 'Popular Whites']);
    else out.push([idx('color'), (a.families.length ? a.families.map(f => E.FAMILY_CHOICES[f]).join(', ') : 'Any Color') + (a.depth !== 'any' ? ` · ${E.DEPTHS[a.depth]}` : '')]);
    const staying = a.fixed.map(f => E.FIXED[f]).concat((a.customFixed || []).map(x => x.label));
    if (a.trimPaint) staying.push('Painting trim too');
    if (a.crown) staying.push('Crown molding');
    if (idx('room') >= 0 && staying.length) out.push([idx('room'), staying.join(', ')]);
    return out;
  }
  function flagsFor(r) {
    if (!settings.showWarnings) return '';
    const cau = r.warnings.filter(w => w.level === 'caution').length, hu = r.warnings.filter(w => w.level === 'heads-up').length;
    return `${cau ? `<span class="flag caution">${cau} caution${cau > 1 ? 's' : ''}</span>` : ''}${hu ? `<span class="flag headsup">${hu} heads-up</span>` : ''}`;
  }
  const starSvg = '<svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path d="M10 2.6l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.9l5-.7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  function chipCard(c, extra) {
    extra = extra || {};
    const starred = shortlist.includes(c.id);
    const lrvPos = Math.max(0, Math.min(100, c.lrv));
    return `<article class="chip" data-id="${esc(c.id)}">
      <button type="button" class="chip-open" data-open="${esc(c.id)}" aria-label="${esc(c.name)}, ${esc(brandName(c.brand))} ${esc(E.codeLabel(c))}. Open details">
        <div class="swatch" data-hex="${c.hex}" data-light="${esc(extra.light || 'none')}" style="background-color:${paint(c.hex, extra.light)}">
          <span class="flags">${extra.flags || ''}</span>
        </div>
        <div class="chip-label">
          ${extra.role ? `<span class="chip-role">${esc(extra.role)}</span>` : ''}
          <span class="chip-name">${esc(c.name)}</span>
          <span class="chip-meta"><span class="brand">${esc(brandName(c.brand))}</span><span class="mono">${esc(E.codeLabel(c))}</span></span>
          ${settings.showLrv ? `<span class="lrv"><span>LRV</span><span class="lrv-track"><i style="left:${lrvPos}%"></i></span><span class="mono">${c.lrv}${c.flags & E.F.LRV_EST ? '*' : ''}</span></span>` : ''}
        </div>
      </button>
      <button type="button" class="star" data-star="${esc(c.id)}" aria-pressed="${starred}" aria-label="${starred ? 'Remove from' : 'Add to'} shortlist">${starSvg}</button>
    </article>`;
  }
  // Light preview picker: a row of buttons on wide screens, one compact in-house dropdown on phones
  function lightBar(current, name) {
    const opts = [{ id: 'none', label: 'Chip Color' }].concat(E.LIGHTS);
    const sel = selectHtml('light-' + name, opts.map(l => [l.id, l.label]), current, 'See it in');
    SELECTS['light-' + name].onChange = v => applyLightPick(name, v);
    return `<div class="lightbar"><span class="eyebrow lb-label">See It In</span>
      <div class="seg lb-seg" role="group" aria-label="Light preview">${opts.map(l => `<button type="button" data-light-pick="${name}" data-val="${l.id}" aria-pressed="${current === l.id}">${esc(l.label)}</button>`).join('')}</div>
      <span class="lb-select">${sel}</span></div>`;
  }
  function applyLightPick(which, val) {
    if (which === 'grid') state.gridLight = val; else if (which === 'room') state.roomLight = val; else state.presentLight = val;
    $$(`[data-light-pick="${which}"]`).forEach(b => b.setAttribute('aria-pressed', b.dataset.val === val));
    // keep the dropdown in step with the button row
    const cfg = SELECTS['light-' + which], btn = document.getElementById('light-' + which);
    if (cfg) cfg.value = val;
    if (cfg && btn) { const o = cfg.options.find(x => x[0] === val); if (o) $('.cg-select-label', btn).textContent = o[1]; }
    const scope = which === 'grid' ? document.querySelector('.view:not([hidden])') : which === 'room' ? $('#detailSheet') : $('#present');
    $$('[data-hex]', scope).forEach(el => { if (el.dataset.lightLocked) return; el.dataset.light = val; el.style.backgroundColor = paint(el.dataset.hex, val); });
    if (which === 'grid' && scope) paintWoods(scope, val);
    if (which === 'room') updateRoomScene();
  }

  function renderResults(animate) {
    if (state.results && state.results.kind === 'stain') return renderStainResults(animate);
    updateWizardNav(false);
    const host = $('#view-find');
    const R = state.results;
    const a = R.answers;
    if (!R.results.length) {
      host.innerHTML = `<div class="empty"><h1>No Colors to Show</h1><p>All brands may be turned off, or the store-brand-only setting has no brand selected.</p><div style="display:flex;gap:8px"><button type="button" class="btn primary" data-act="settings">Open settings</button><button type="button" class="btn" data-act="edit">Edit Answers</button></div></div>`;
      return;
    }
    const st = steps();
    host.innerHTML = `
      <div class="results-head">
        <p class="eyebrow">${R.perfect ? `Picked from ${fmt(R.poolSize)} colors` : `${R.results.length} options · picked from ${fmt(R.poolSize)} colors`}</p>
        <h1>${esc(R.perfect ? resultTitle(a).replace(/^Colors for/, 'Your Perfect Color for') : resultTitle(a))}</h1>
        <div class="summary">${summaryChips(a).filter(x => x[0] >= 0).map(([i, label]) => `<button type="button" data-edit="${i}" aria-label="Change: ${esc(label)}">${esc(label)}</button>`).join('')}</div>
      </div>
      <div class="results-tools">
        ${settings.lightPreview ? lightBar(state.gridLight, 'grid') : '<span></span>'}
        <div class="tool-btns"><button type="button" class="btn small" data-compare="results">Compare</button><button type="button" class="btn small hide-sm" data-act="edit">Edit Answers</button><button type="button" class="btn small primary" data-act="restart">Start Over</button></div>
      </div>
      ${(R.notices || []).map((w, i) => `<div class="warn ${w.level === 'heads-up' ? 'headsup' : w.level}" style="--i:${i};margin-bottom:16px"><b>${esc(w.title)}</b><span>${esc(w.text)}</span></div>`).join('')}
      <div class="grid${R.perfect ? ' grid-one' : ''}" id="resultGrid">${R.results.map(r => chipCard(r.color, { role: r.role, flags: flagsFor(r), light: state.gridLight })).join('')}</div>
      ${R.perfect ? perfectWhy(R) : ''}
      <section class="tips-panel" aria-labelledby="tipsTitle"><h2 id="tipsTitle" class="tips-title">Good to Know</h2>
        <div class="tips">${withPaintTip(R).map(t => `<div class="tip-row"><b>${esc(t.title)}</b><p>${esc(t.text)}${t.title === 'Finish' ? ` <button type="button" class="link-btn" data-sheens="${esc(R.results[0].color.id)}">Compare Sheens</button>` : ''}</p></div>`).join('')}</div>
      </section>
      ${st.length ? '' : ''}`;
    if (animate && !reduced()) fanIn($('#resultGrid'));
  }
  function withPaintTip(R) {
    const tips = R.tips.slice();
    const top = R.results[0] && R.results[0].color;
    const p = top && bestLine(top, R.answers);
    if (p) {
      const l = p.r.best.line;
      tips.splice(1, 0, { title: 'Paint', text: `${lineLabel(p.brand, l)} (${E.TIERS[l.tier]}). ${p.r.best.why[0] ? p.r.best.why[0] + '.' : l.note}` });
    }
    if (top) {
      const pr = E.primerFor(R.answers, top, engineSettings());
      tips.splice(2, 0, { title: 'Primer', text: `${pr.need ? pr.title + ': ' + (pr.products[0] ? pr.products[0].name : '') + '. ' : ''}${pr.why} Plan on ${pr.coats} coats of paint.` });
    }
    return tips;
  }
  function fanIn(grid) {
    const cards = Array.from(grid.children); if (!cards.length) return;
    const first = cards[0].getBoundingClientRect();
    const n = cards.length;
    cards.forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const dx = first.left - r.left, dy = first.top - r.top;
      card.animate([
        { transform: `translate(${dx}px, ${dy + 30}px) rotate(${(i - (n - 1) / 2) * 6}deg) scale(.9)`, opacity: 0 },
        { transform: `translate(${dx * 0.15}px, ${dy * 0.15}px) rotate(${(i - (n - 1) / 2) * 1.2}deg) scale(.98)`, opacity: 1, offset: 0.55 },
        { transform: 'none', opacity: 1 },
      ], { duration: 820, delay: i * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    });
  }

  $('#view-find').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !state.results) return;
    if (t.dataset.sopen != null && state.results.kind === 'stain') { openStainDetail(state.results, state.results.results[+t.dataset.sopen]); return; }
    if (t.dataset.act === 'stain-compare' && state.results.kind === 'stain') { openStainCompare(state.results); return; }
    if (t.dataset.edit != null) { const i = +t.dataset.edit; state.results = null; state.step = i; renderWizard(-1); return; }
    if (t.dataset.act === 'edit') { state.results = null; state.step = 0; renderWizard(-1); return; }
    if (t.dataset.act === 'restart') { startOver(); return; }
    if (t.dataset.act === 'settings') { openSettings(); return; }
  });
  function startOver() {
    if (typeof updateWaiting !== 'undefined' && updateWaiting) { applyUpdate(); return; }
    state.answers = freshAnswers(); state.results = null; state.step = 0; state.ftype = {}; state.customOpen = false;
    if (state.view !== 'find') route('find'); else renderWizard(-1);
  }

  // shared clicks: open chip, star, light preview
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.open) { openDetail(t.dataset.open, !!t.closest('#detailSheet')); return; }
    if (t.dataset.star) { toggleStar(t.dataset.star); return; }
    if (t.dataset.lightPick) { applyLightPick(t.dataset.lightPick, t.dataset.val); return; }
  });

  function toggleStar(id) {
    const i = shortlist.indexOf(id);
    if (i >= 0) shortlist.splice(i, 1); else shortlist.push(id);
    saveShortlist();
    const on = shortlist.includes(id);
    $$(`[data-star="${CSS.escape(id)}"]`).forEach(b => { b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', (on ? 'Remove from' : 'Add to') + ' shortlist'); });
    $$(`[data-star-text="${CSS.escape(id)}"]`).forEach(b => { b.textContent = on ? 'Remove from Saved' : 'Save Color'; });
    updateShortCount(true);
    const c = findAny(id);
    toast(on ? `Saved ${c ? c.name : 'the color'}` : 'Removed from saved colors');
    if (state.view === 'shortlist') renderShortlist();
  }
  function updateShortCount(bump) {
    const el = $('#shortCount');
    const n = shortlist.filter(id => findAny(id)).length;
    el.hidden = !n; el.textContent = n;
    if (bump && n && !reduced()) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }

  // ================================================================
  // DETAIL SHEET
  // ================================================================
  function useLabel(c) {
    const i = c.flags & E.F.INT, x = c.flags & E.F.EXT;
    if (i && x) return 'Interior & exterior';
    if (i) return 'Interior only';
    if (x) return 'Exterior only';
    return 'Not listed by brand';
  }
  function sampleNote(c) {
    if (!settings.inStoreSamples) return '<div class="sample-note"><div>Order a sample pot or peel-and-stick sample. Check it on two walls at different times of day.</div></div>';
    const loc = (c.flags & E.F.RACK) && c.extra && ['sw', 'valspar', 'hgsw'].includes(c.brand) ? c.extra : '';
    if (loc) return `<div class="sample-note"><span class="loc">${esc(loc)}</span><div>Pull the chip from the display at this strip location. Hold it flat against the wall in the room’s own light, not under store lights.</div></div>`;
    if (c.flags & E.F.RACK) return '<div class="sample-note"><span class="loc">Rack</span><div>This color is on the in-store chip rack. Hold the chip flat against the wall in the room’s own light.</div></div>';
    if (['sw', 'valspar', 'hgsw', 'behr'].includes(c.brand)) return '<div class="sample-note"><div>Not on the standard chip display. Mix a sample size, or order a sample, and check it in the room’s own light.</div></div>';
    return `<div class="sample-note"><div>Look for it in the ${esc(brandName(c.brand))} chip display or fan deck. If it isn’t there, mix a sample size and check it in the room’s own light.</div></div>`;
  }
  function detailHtml(c) {
    const b = E.getIndex().brandById[c.brand] || {};
    const d = C.describe(c.hex, c.lrv);
    const res = state.results && state.results.results.find(r => r.color.id === c.id);
    const answers = state.results ? state.results.answers : state.answers;
    const warnings = settings.showWarnings ? (res ? res.warnings : E.warningsFor(c, answers)) : [];
    const sp = E.SPACES[answers.space] || E.SPACES.living;
    const pairs = E.pairings(c, { collections: settings.collections });
    const matches = settings.showMatches ? E.matchesFor(c, { brands: brandsEnabled(), showDiscontinued: settings.showDiscontinued, collections: settings.collections }).slice(0, 8) : [];
    const starred = shortlist.includes(c.id);
    const kind = sceneKind(answers.space);
    const roles = scenePalette(c, answers, pairs);
    const sceneLabel = kind === 'house' ? `Front of a house showing ${c.name} on the ${sp.label.toLowerCase()}` : kind === 'kitchen' ? (answers.space === 'cabinets' ? `Kitchen with cabinets in ${c.name}` : `Kitchen with walls in ${c.name}`) : `Room preview showing ${c.name} ${sp.surface ? 'on the' : 'in the'} ${sp.label.toLowerCase()}`;
    return `
      <div class="sheet-head">
        <button type="button" class="icon-btn" data-act="close-detail" aria-label="Close"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
        ${state.detailStack.length ? '<button type="button" class="btn small ghost" data-act="detail-back">Back</button>' : ''}
        <h2 id="detailTitle">${esc(c.name)}</h2>
        <button type="button" class="icon-btn" data-star="${esc(c.id)}" aria-pressed="${starred}" aria-label="${starred ? 'Remove from' : 'Add to'} shortlist">${starSvg}</button>
      </div>
      <div class="sheet-body">
        <div class="room" id="roomScene" data-scene="${kind}" data-roles="${esc(JSON.stringify(roles))}" data-light-locked="1">
          ${sceneSvg(kind, { label: sceneLabel, siding: answers.siding, furniture: sceneFurniture(answers.space), windows: windowSlots(answers, kind === 'kitchen' ? 'kitchen' : sceneFurniture(answers.space)), floorType: floorTypeOf(answers) })}
          <span class="light-label" id="roomLabel"></span>
        </div>
        ${settings.lightPreview ? lightBar(state.roomLight, 'room') : ''}
        <div class="detail-title">
          <h3>${esc(c.name)}</h3>
          <div class="sub"><span>${esc(b.name || c.brand)}</span><span class="mono">${esc(E.codeLabel(c))}</span>${c.flags & E.F.POPULAR ? '<span class="badge good">Best seller</span>' : ''}${c.flags & E.F.DISC ? '<span class="badge">Discontinued</span>' : ''}${E.collectionOn(c, settings.collections) ? '' : '<span class="badge">Collection turned off</span>'}</div>
        </div>
        <div class="detail-actions">
          <button type="button" class="btn small" data-copy="${esc(`${c.name} — ${b.name} ${E.codeLabel(c)}`)}">Copy Name &amp; Code</button>
          <button type="button" class="btn small" data-star="${esc(c.id)}" data-star-text="${esc(c.id)}">${starred ? 'Remove from Saved' : 'Save Color'}</button>
        </div>
        ${res && res.reasons.length ? `<div class="block"><h4>Why It Fits</h4><ul class="reasons">${res.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
        ${warnings.length ? `<div class="block"><h4>Things to Know</h4>${warnings.map((w, i) => `<div class="warn ${w.level === 'heads-up' ? 'headsup' : w.level}" style="--i:${i}"><b>${esc(w.title)}</b><span>${esc(w.text)}</span></div>`).join('')}</div>` : ''}
        ${paintLineHtml(c, answers)}
        ${primerHtml(c, answers)}
        ${prosConsHtml(c, answers, res ? state.results.results.map(r => r.color) : null)}
        ${pairs.length ? `<div class="block"><h4>Goes Well With</h4><div class="pairs">${pairs.map(p => `<button type="button" class="pair" data-open="${esc(p.color.id)}"><span class="p-sw" data-hex="${p.color.hex}" style="background-color:${paint(p.color.hex)}"></span><span class="p-text"><span class="p-role">${esc(p.role)}</span><span class="p-name">${esc(p.color.name)}</span><span class="p-code mono">${esc(E.codeLabel(p.color))}</span></span></button>`).join('')}</div></div>` : ''}
        <div class="block"><h4>Details</h4>
        <div class="facts">
          <div class="fact"><span class="k">Lightness (LRV)</span><span class="v mono">${c.lrv}${c.flags & E.F.LRV_EST ? ' (calculated)' : ''}</span></div>
          <div class="fact"><span class="k">Depth</span><span class="v">${esc(d.depth)}</span></div>
          <div class="fact"><span class="k">Family</span><span class="v">${esc(d.familyName)}</span></div>
          <div class="fact"><span class="k">Undertone</span><span class="v">${esc(d.undertone === 'neutral' ? 'None (true neutral)' : d.undertone[0].toUpperCase() + d.undertone.slice(1))}</span></div>
          <div class="fact"><span class="k">Use</span><span class="v">${esc(useLabel(c))}</span></div>
          <div class="fact"><span class="k">${['sw', 'valspar', 'hgsw'].includes(c.brand) && c.extra ? 'Strip location' : 'Collection'}</span><span class="v">${esc(['sw', 'valspar', 'hgsw'].includes(c.brand) ? (c.extra || '—') : (E.collectionLabel(c) || c.extra || '—'))}</span></div>
          <div class="fact"><span class="k">Screen Color</span><span class="v mono">#${c.hex}</span></div>
          <div class="fact"><span class="k">Best Finish</span><span class="v">${esc(sp.sheen)}</span><button type="button" class="link-btn" data-sheens="${esc(c.id)}">Compare Sheens</button></div>
        </div>
        <p class="muted" style="font-size:13.5px">${esc(d.summary)}.${b.mixNote ? ' ' + esc(b.mixNote) : ''}</p>
        ${sampleNote(c)}
        </div>
        ${settings.showMatches ? `<div class="block"><h4>Same Color in Other Brands</h4>${matches.length ? `<div class="list">${matches.map((m, i) => matchRow(m, i)).join('')}</div><p class="muted" style="font-size:12.5px">Matched by measured color difference (ΔE 2000). Under 2 is hard to tell apart on the wall; always compare chips before mixing a substitute.</p>` : '<p class="muted">Turn on more brands in settings to see matches.</p>'}</div>` : ''}
        <p class="muted" style="font-size:12px">Source: ${esc(b.source || 'brand data')}${b.date ? `, collected ${esc(b.date)}` : ''}. Screen colors are the brand’s digital values; confirm with a physical chip.</p>
      </div>`;
  }
  function primerHtml(c, answers) {
    const pr = E.primerFor(answers, c, engineSettings());
    return `<div class="block"><h4>Primer</h4>
      <div class="primer"><b>${esc(pr.title)}</b><span>${esc(pr.why)} Plan on ${pr.coats} coats of paint.</span>
      ${pr.products.length ? `<ul class="reasons buy">${pr.products.map(x => `<li><b>${esc(x.name)}</b> ${esc(x.why)}</li>`).join('')}</ul>` : ''}
      ${pr.tips.map(t => `<p class="muted" style="font-size:13px;margin:0">${esc(t)}</p>`).join('')}
      ${!(answers.nowKind || answers.nowHex || answers.surface) ? '<p class="muted" style="font-size:12.5px;margin:0">For a primer matched to the wall, answer “What’s on it now?” in Advanced mode.</p>' : ''}</div></div>`;
  }
  function matchRow(m, i) {
    const c = m.color;
    return `<button type="button" class="row" data-open="${esc(c.id)}" style="--i:${i}"><span class="sw" data-hex="${c.hex}" style="background-color:${paint(c.hex)}"></span><span class="row-main"><span class="row-name">${esc(c.name)}</span><span class="row-sub">${esc(brandName(c.brand))} · <span class="mono">${esc(E.codeLabel(c))}</span></span></span><span class="row-end"><span class="badge ${m.dE < 2.5 ? 'good' : ''}">${esc(m.label)}</span><span class="mono">ΔE ${m.dE}</span></span></button>`;
  }
  // ---------------- preview scenes ----------------
  // The preview matches what is being painted: a room (walls, accent wall, ceiling, trim), a kitchen (cabinets)
  // or the front of a house (siding, exterior trim, front door). Interiors use one-point perspective with the
  // vanishing point at (500,200) in an 800x480 frame. Every painted surface goes through the same light and
  // calibration pipeline as the chips.
  function sceneKind(space) {
    const sp = E.SPACES[space] || E.SPACES.living;
    if (sp.kind === 'exterior') return 'house';
    if (space === 'cabinets' || space === 'kitchen') return 'kitchen';
    return 'room';
  }
  // what stands against the back wall
  function sceneFurniture(space) {
    if (space === 'bedroom' || space === 'nursery' || space === 'kids') return 'bed';
    if (space === 'bathroom') return 'vanity';
    if (space === 'office') return 'desk';
    if (space === 'dining') return 'dining';
    if (space === 'entry' || space === 'stairs') return 'console';
    if (space === 'laundry') return 'laundry';
    if (space === 'garage') return 'garage';
    if (space === 'furniture') return 'dresser';
    return 'sofa';
  }
  function scenePalette(c, answers, pairs) {
    const space = answers.space;
    const trimW = (pairs.find(p => p.role === 'Trim & ceiling') || {}).color;
    const accent = (pairs.find(p => p.role === 'Accent') || {}).color;
    const white = trimW ? trimW.hex : 'F2F1EC';
    const acc = accent ? accent.hex : '5E6B73';
    const soft = c.lrv > 70 ? 'CFC8BC' : 'ECE8E0'; // a neutral that contrasts with the painted color
    const p = { wall: c.hex, side: c.hex, ceil: white, trim: white, door: white, art: acc, art2: c.hex };
    if (space === 'accent') Object.assign(p, { side: c.lrv > 80 ? 'D9D3C8' : 'ECE8E0', art: white, art2: acc });
    if (space === 'ceiling') Object.assign(p, { ceil: c.hex, wall: soft, side: soft, art2: soft });
    if (space === 'trim') Object.assign(p, { trim: c.hex, door: c.hex, wall: soft, side: soft, ceil: 'F2F1EC', art2: soft });
    if (space === 'furniture') Object.assign(p, { cab: c.hex, wall: c.lrv > 75 ? 'D7D1C6' : 'EEEBE4', side: c.lrv > 75 ? 'D7D1C6' : 'EEEBE4' });
    if (space === 'cabinets') Object.assign(p, { cab: c.hex, wall: c.lrv > 75 ? 'D7D1C6' : 'EEEBE4', side: c.lrv > 75 ? 'D7D1C6' : 'EEEBE4', counter: 'ECEAE5', tile: 'F6F5F1', hood: 'B9BDBF' });
    if (space === 'kitchen') Object.assign(p, { cab: c.lrv > 82 ? '3F4A52' : white, counter: 'ECEAE5', tile: 'F6F5F1', hood: 'B9BDBF' });
    if (space === 'bathroom') Object.assign(p, { floor: 'CFCBC4', vanity: c.lrv > 82 ? '5B6770' : white, counter: 'ECEAE5' });
    p.duvet = 'F1F0EC'; p.wood = 'A27B55';
    p.rug = c.lrv > 62 ? 'B8AD9C' : 'DDD5C7'; p.curtain = 'EEEAE2';
    if (!p.cab) p.cab = white;
    if (!p.floor) p.floor = { tile: 'CFCBC4', concrete: '9C9B97', carpet: 'BDB3A5' }[floorTypeOf(answers)] || 'A9784B';
    // show what's staying: the chosen floor, counters, cabinets, furniture and roof
    const items = E.fixedItems(answers);
    const first = kind => items.find(f => f.kind === kind);
    const shadeHex = (hex, k) => C.linearToHex(C.hexToLinear(hex).map(v => Math.min(1, v * k)));
    const fl = first('floor'); if (fl) p.floor = fl.hex;
    const ct = first('counter'); if (ct) p.counter = ct.hex;
    const cb = first('cabinet'); if (cb && space !== 'cabinets') { p.cab = cb.hex; if (space === 'bathroom') p.vanity = cb.hex; }
    const fu = first('furniture'); if (fu) { p.sofa = fu.hex; p['sofa-d'] = shadeHex(fu.hex, 0.82); p['sofa-l'] = shadeHex(fu.hex, 1.16); }
    if (sceneKind(space) === 'house') {
      Object.assign(p, { roof: '45484C', lawn: '6E8A4F', shrub: '4E6A3B', walk: 'CFCAC0', step: 'BEB9B0', glass: '33404B', tree: '5D7649' });
      if (space === 'front_door') Object.assign(p, { xdoor: c.hex, body: c.lrv > 55 ? '6B6F72' : 'D9D5CC', xtrim: 'F2F1EC' });
      if (space === 'ext_body') Object.assign(p, { body: c.hex, xtrim: c.lrv > 80 ? '2E3134' : white, xdoor: acc });
      if (space === 'ext_trim') Object.assign(p, { xtrim: c.hex, body: c.lrv > 55 ? '6B6F72' : 'DCD7CE', xdoor: acc });
      const stone = first('stone'); if (stone) p.step = stone.hex; // stone or brick shows on the front steps
    }
    const rf = first('roof'); if (rf) p.roof = rf.hex;
    return p;
  }

  const DEFS_COMMON = `
    <linearGradient id="rgSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="r-sky-top"/><stop offset="1" class="r-sky-bot"/></linearGradient>
    <radialGradient id="rgLamp" cx="0.5" cy="0.5" r="0.5"><stop offset="0" class="r-lamp-c" stop-opacity=".75"/><stop offset=".35" class="r-lamp-c" stop-opacity=".28"/><stop offset="1" class="r-lamp-c" stop-opacity="0"/></radialGradient>
    <filter id="rfSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="rfShadow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>`;

  // ---- window slots: each side with windows gets its own window in the preview ----
  // left wall first, then the back wall (where the art would hang), then the right wall (where the door would be)
  function windowSlots(answers, furniture) {
    if (E.noWindows(answers)) return [];
    let dirs = E.facingsOf(answers).slice();
    if (!dirs.length) dirs = ['?'];
    if ((E.SPACES[answers.space] || {}).sunny) while (dirs.length < 3) dirs.push('?'); // a sunroom is mostly windows
    const slots = ['sofa', 'bed', 'desk', 'dining'].includes(furniture) ? ['left', 'back', 'right'] : ['left', 'right'];
    return dirs.slice(0, slots.length).map((d, i) => ({ slot: slots[i], dir: d }));
  }
  function floorTypeOf(answers) {
    const f = E.fixedItems(answers).find(x => x.kind === 'floor' || x.kind === 'carpet');
    if (f && f.kind === 'carpet') return 'carpet';
    if (f && /tile|travertine/.test(f.id + f.label.toLowerCase())) return 'tile';
    if (f && /concrete/.test(f.id)) return 'concrete';
    if (f) return 'wood';
    return { bathroom: 'tile', laundry: 'tile', garage: 'concrete' }[answers.space] || 'wood';
  }
  const WIN = {
    left: { frame: '60.5,110 176,130 176,292 60.5,318', glass: '67.5,118.3 168.8,137.5 168.8,283.7 67.5,309.3', mull: [[118.1, 127.9, 118.1, 296.5], [67.5, 213.8, 168.8, 210.6]], sill: '56,318 180,292 182,299 56,327', sun: '118,402 236,372 352,404 236,446' },
    right: { frame: '692,129 755,112 755,313 692,292', glass: '698.8,137.5 748.7,121.7 748.7,304.8 698.8,283.7', mull: [[723.7, 129.6, 723.7, 294.3], [698.8, 210.6, 748.7, 213.3]], sill: '690,292 758,314 760,321 688,299', sun: '682,402 564,372 448,404 564,446' },
  };
  function backWindow(x, y, w, h, dir) {
    return `<rect class="r-trim" x="${x - 8}" y="${y - 8}" width="${w + 16}" height="${h + 16}" rx="2"/>
      <rect x="${x - 8}" y="${y - 8}" width="${w + 16}" height="${h + 16}" rx="2" fill="#000" opacity=".05"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#rgSky)"/>
      <rect class="r-wtint" data-dir="${dir}" x="${x}" y="${y}" width="${w}" height="${h}" opacity="0"/>
      <g class="r-trim-s" stroke-width="4"><line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}"/><line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}"/></g>
      <rect class="r-trim" x="${x - 14}" y="${y + h + 8}" width="${w + 28}" height="8" rx="1"/>
      <rect x="${x - 14}" y="${y + h + 15}" width="${w + 28}" height="4" fill="#000" opacity=".1"/>`;
  }
  function sideWindow(slot, dir) {
    const w = WIN[slot];
    return `<polygon class="r-trim" points="${w.frame}"/>
      <polygon points="${w.frame}" fill="#000" opacity=".06"/>
      <g clip-path="url(#rcWin-${slot})"><rect x="${slot === 'left' ? 60 : 690}" y="100" width="${slot === 'left' ? 120 : 70}" height="225" fill="url(#rgSky)"/></g>
      <polygon class="r-wtint" data-dir="${dir}" points="${w.glass}" opacity="0"/>
      <g class="r-trim-s" stroke-width="4" fill="none"><polygon points="${w.glass}"/>${w.mull.map(([a, b, c2, d]) => `<line x1="${a}" y1="${b}" x2="${c2}" y2="${d}"/>`).join('')}</g>
      <polygon class="r-trim" points="${w.sill}"/>`;
  }
  // the room shell: walls, ceiling, windows, floor (planks, tile joints, carpet or concrete) and baseboards
  function interiorShell(o) {
    o = o || {};
    const slots = o.windows || [];
    const has = s => slots.find(x => x.slot === s);
    const floor = o.floorType || 'wood';
    let floorLines = '';
    if (o.floorTex) floorLines = '';
    else if (floor === 'wood') {
      const planks = [];
      for (let x0 = -560; x0 <= 1560; x0 += 96) { const xb = 500 + (x0 - 500) * 0.55; planks.push(`<line x1="${x0}" y1="480" x2="${xb.toFixed(1)}" y2="354"/>`); }
      const seams = [[60, 452, 170, 452], [300, 430, 380, 430], [520, 466, 640, 466], [150, 400, 215, 400], [420, 392, 480, 392], [610, 408, 675, 408], [260, 372, 300, 372], [560, 368, 600, 368]].map(([a, b, c2, d]) => `<line x1="${a}" y1="${b}" x2="${c2}" y2="${d}"/>`).join('');
      floorLines = `<g clip-path="url(#rcFloor)" stroke="#000" stroke-opacity=".13" stroke-width="1.4">${planks.join('')}${seams}</g>`;
    } else if (floor === 'tile') {
      const g = [];
      for (let x0 = -900; x0 <= 1900; x0 += 150) { const xb = 500 + (x0 - 500) * 0.55; g.push(`<line x1="${x0}" y1="480" x2="${xb.toFixed(1)}" y2="354"/>`); }
      for (const y of [366, 382, 404, 434, 474]) g.push(`<line x1="0" y1="${y}" x2="800" y2="${y}"/>`);
      floorLines = `<g clip-path="url(#rcFloor)" stroke="#fff" stroke-opacity=".35" stroke-width="1.6">${g.join('')}</g>`;
    } else if (floor === 'concrete') {
      floorLines = `<g clip-path="url(#rcFloor)" stroke="#000" stroke-opacity=".10" stroke-width="1.2"><line x1="0" y1="420" x2="800" y2="420"/><line x1="400" y1="354" x2="400" y2="480"/></g>`;
    }
    const tr = o.trimTex ? 'fill="url(#ptTrimV)"' : 'class="r-trim"', trH = o.trimTex ? 'fill="url(#ptTrim)"' : 'class="r-trim"';
    const door = o.door && !has('right') ? `
      <polygon ${tr} points="681,135 737,118 737,423 681,377"/>
      <polygon ${o.trimTex ? 'fill="url(#ptTrimV)"' : 'class="r-door"'} points="686,142 732,127 732,417 686,373"/>
      <polygon points="686,142 732,127 732,417 686,373" fill="#000" opacity=".10"/>
      <g fill="none" stroke="#000" stroke-opacity=".14" stroke-width="1.4"><polygon points="692,158 726,147 726,262 692,266"/><polygon points="692,282 726,279 726,398 692,360"/></g>
      <circle cx="727" cy="279" r="3.2" fill="#b8963e"/>` : '';
    return `
      <polygon class="r-ceil" points="0,0 800,0 665,90 225,90"/>
      <polygon points="0,0 800,0 665,90 225,90" fill="url(#rgCeil)"/>
      <polygon class="r-side" points="0,0 225,90 225,354 0,480"/>
      <polygon points="0,0 225,90 225,354 0,480" fill="url(#rgLeft)"/>
      <polygon class="r-side" points="800,0 665,90 665,354 800,480"/>
      <polygon points="800,0 665,90 665,354 800,480" fill="url(#rgRight)"/>
      <rect class="r-wall" x="225" y="90" width="440" height="264"/>
      <rect x="225" y="90" width="440" height="264" fill="url(#rgBackX)"/>
      <rect x="225" y="90" width="440" height="264" fill="url(#rgBackY)"/>
      ${has('left') ? '<rect x="225" y="90" width="440" height="264" fill="url(#rgWinGlow)"/>' : ''}
      ${has('right') ? '<rect x="225" y="90" width="440" height="264" fill="url(#rgWinGlowR)"/>' : ''}
      ${o.crown ? CROWN : ''}
      ${has('left') ? sideWindow('left', has('left').dir) + (o.curtains ? CURTAINS.left : '') : ''}
      ${has('right') ? sideWindow('right', has('right').dir) + (o.curtains ? CURTAINS.right : '') : ''}
      <polygon class="r-floor" points="0,480 225,354 665,354 800,480"/>
      ${o.floorTex ? `<image data-tex="${esc(JSON.stringify(o.floorTex))}" x="0" y="354" width="800" height="126" preserveAspectRatio="none" clip-path="url(#rcFloor)"/>` : ''}
      ${floorLines}
      <polygon points="0,480 225,354 665,354 800,480" fill="url(#rgFloor)"/>
      ${floor === 'carpet' ? '<polygon points="0,480 225,354 665,354 800,480" fill="url(#rgCarpet)" opacity=".5"/>' : ''}
      ${slots.filter(s => WIN[s.slot]).map(s => `<polygon class="r-sun" data-dir="${s.dir}" points="${WIN[s.slot].sun}" filter="url(#rfSoft)"/>`).join('')}
      ${has('back') ? `<polygon class="r-sun" data-dir="${has('back').dir}" points="${o.backX - 10},362 ${o.backX + 150},362 ${o.backX + 190},404 ${o.backX - 50},404" filter="url(#rfSoft)"/>` : ''}
      <rect ${trH} x="225" y="341" width="440" height="13"/>
      <polygon ${trH} points="0,459 225,341 225,354 0,480"/>
      <polygon ${trH} points="665,341 800,459 800,480 665,354"/>
      <polygon points="665,341 800,459 800,480 665,354" fill="#000" opacity=".12"/>
      <rect x="225" y="352" width="440" height="2" fill="#000" opacity=".12"/>
      ${door}`;
  }
  // crown molding along the top of the walls
  const CROWN = `
      <rect class="r-trim" x="225" y="90" width="440" height="9"/><rect x="225" y="98" width="440" height="2.5" fill="#000" opacity=".12"/>
      <polygon class="r-trim" points="0,0 225,90 225,99 0,14"/><polygon points="0,0 225,90 225,99 0,14" fill="#fff" opacity=".06"/>
      <polygon class="r-trim" points="800,0 665,90 665,99 800,14"/><polygon points="800,0 665,90 665,99 800,14" fill="#000" opacity=".12"/>`;
  // linen curtain panels beside the side windows, drawn on the wall planes with their folds
  const curtainPanel = (pts, folds) => `<polygon class="r-curtain" points="${pts}"/><polygon points="${pts}" fill="url(#rgFold)"/>${folds.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-opacity=".09" stroke-width="2.2"/>`).join('')}`;
  const CURTAINS = {
    left: `<line x1="30" y1="94" x2="204" y2="133" stroke="#3a3632" stroke-width="2.6" stroke-linecap="round"/>
      ${curtainPanel('34,96 58,101 58,446 34,458', [[42, 98, 42, 454], [50, 100, 50, 450]])}
      ${curtainPanel('178,128 200,133 200,366 178,378', [[186, 130, 186, 374], [193, 131, 193, 370]])}`,
    right: `<line x1="682" y1="137" x2="768" y2="106" stroke="#3a3632" stroke-width="2.6" stroke-linecap="round"/>
      ${curtainPanel('684,136 693,133 693,371 684,364', [[688, 135, 688, 368]])}
      ${curtainPanel('755,111 768,107 768,452 755,440', [[761, 109, 761, 446]])}`,
  };
  const INTERIOR_DEFS = `
    <linearGradient id="rgCeil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="rgLeft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".85" stop-color="#000" stop-opacity=".02"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></linearGradient>
    <linearGradient id="rgRight" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".8" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
    <linearGradient id="rgBackX" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset=".07" stop-color="#000" stop-opacity="0"/><stop offset=".93" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
    <linearGradient id="rgBackY" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".08"/><stop offset=".12" stop-color="#000" stop-opacity="0"/><stop offset=".9" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".07"/></linearGradient>
    <radialGradient id="rgWinGlow" cx="0.05" cy="0.45" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="rgWinGlowR" cx="0.95" cy="0.45" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="rgFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".45" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/></linearGradient>
    <radialGradient id="rgCarpet" cx="0.5" cy="0.9" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient>
    <radialGradient id="rgNight" cx="0.36" cy="0.46" r="0.85"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>
    <linearGradient id="rgFold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset=".3" stop-color="#fff" stop-opacity=".10"/><stop offset=".6" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient>
    <radialGradient id="rgCeilLight" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff8e8" stop-opacity=".9"/><stop offset="1" stop-color="#fff8e8" stop-opacity="0"/></radialGradient>
    <clipPath id="rcFloor"><polygon points="0,480 225,354 665,354 800,480"/></clipPath>
    <clipPath id="rcWin-left"><polygon points="67.5,118.3 168.8,137.5 168.8,283.7 67.5,309.3"/></clipPath>
    <clipPath id="rcWin-right"><polygon points="698.8,137.5 748.7,121.7 748.7,304.8 698.8,283.7"/></clipPath>`;
  const LAMP = `
      <circle class="r-lamp-glow" cx="288" cy="214" r="120" fill="url(#rgLamp)"/>
      <ellipse cx="288" cy="388" rx="26" ry="5" fill="#000" opacity=".25" filter="url(#rfShadow)"/>
      <line x1="288" y1="230" x2="288" y2="384" stroke="#2d2a27" stroke-width="3.2" stroke-linecap="round"/>
      <ellipse cx="288" cy="385" rx="17" ry="4" fill="#2d2a27"/>
      <polygon class="r-shade" points="264,196 312,196 322,232 254,232"/>`;

  function sceneSvg(kind, opts) {
    const open = `<svg class="room-svg" viewBox="0 0 800 480" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(opts.label)}">`;
    if (kind === 'house') return open + houseSvg(opts) + '</svg>';
    const furniture = kind === 'kitchen' ? 'kitchen' : (opts.furniture || 'sofa');
    const slots = opts.windows || [];
    const back = slots.find(s => s.slot === 'back');
    // textures: real wood grain on floors and furniture, woven fabric on upholstery, stone on counters
    const woodTex = opts.woodTex || { t: 'boards', sp: 'red_oak', role: 'wood', w: 400, h: 120, cm: 0.3, board: 14, seed: 2 };
    const floorTex = opts.floorTex || (['wood', 'tile', 'carpet', 'concrete'].includes(opts.floorType || 'wood') ? { t: 'floor', kind: opts.floorType || 'wood', sp: 'red_oak', role: 'floor' } : null);
    const texDefs = [
      pattern('ptWood', woodTex, woodTex.w, woodTex.h),
      pattern('ptFabric', { t: 'fabric', tint: 'FFFFFF', w: 96, h: 96 }, 96, 96),
      pattern('ptStone', { t: 'stone', role: 'counter', w: 440, h: 60 }, 440, 60, 226, 258),
      opts.trimTex ? pattern('ptTrim', Object.assign({}, opts.trimTex, { t: 'boards', w: 440, h: 40, cm: 0.5, board: 30 }), 440, 40, 0, 339) : '',
      opts.trimTex ? pattern('ptTrimV', Object.assign({}, opts.trimTex, { t: 'boards', w: 120, h: 340, cm: 0.6, board: 40, vertical: true }), 120, 340, 670, 110) : '',
      opts.cabTex ? pattern('ptCabBox', Object.assign({}, opts.cabTex, { t: 'boards', w: 440, h: 260, cm: 0.35, board: 18, vertical: true }), 440, 260, 226, 96) : '',
    ].join('');
    const defs = `<defs>${DEFS_COMMON}${INTERIOR_DEFS}${texDefs}${furniture === 'vanity' || furniture === 'console' ? '<linearGradient id="rgMirror" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9eef1"/><stop offset=".5" stop-color="#c9d2d7"/><stop offset="1" stop-color="#dfe5e8"/></linearGradient>' : ''}</defs>`;
    const backX = { bed: 412, desk: 300, dining: 400 }[furniture] || 402; // where the back-wall window sits
    const homey = ['sofa', 'bed', 'dining', 'desk'].includes(furniture);
    const shell = interiorShell({ windows: slots, door: furniture !== 'kitchen', floorType: opts.floorType, backX, floorTex, trimTex: opts.trimTex, crown: opts.crown, curtains: homey });
    const night = '<rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/>';
    const art = (x, y, w, h) => `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#000" opacity=".12" filter="url(#rfShadow)" transform="translate(3 5)"/>
      <rect class="r-frame" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>
      <rect class="r-trim" x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}"/>
      <rect class="r-art" x="${x + 21}" y="${y + 20}" width="${w - 42}" height="${h - 40}"/>
      <rect class="r-art2" x="${x + 21}" y="${y + h - 46}" width="${w - 42}" height="${26}"/>`;
    // a window on the back wall takes the art's place
    const artOrWindow = (x, y, w, h) => back ? backWindow(x + 4, y - 4, w - 8, h - 4, back.dir) + (homey ? backCurtains(x + 4, y - 4, w - 8, h - 4) : '') : art(x, y, w, h);
    // a flush-mount ceiling light, glowing at night
    const ceilLight = homey ? `<circle class="r-lamp-glow" cx="445" cy="58" r="90" fill="url(#rgLamp)"/><ellipse cx="445" cy="50" rx="44" ry="8" fill="#000" opacity=".08"/><ellipse class="r-shade" cx="445" cy="47" rx="38" ry="7"/><ellipse cx="445" cy="45" rx="38" ry="5" fill="#fff" opacity=".35"/>` : '';
    const rug = (pts) => `<polygon class="r-rug" points="${pts}"/><polygon points="${pts}" fill="url(#ptFabric)" style="mix-blend-mode:multiply"/><polygon points="${pts}" fill="none" stroke="#000" stroke-opacity=".10" stroke-width="5" stroke-linejoin="round" transform="translate(0 0)"/>`;
    let body = '';
    if (furniture === 'kitchen') body = `
      <rect x="236" y="98" width="190" height="98" fill="#000" opacity=".14" filter="url(#rfShadow)" transform="translate(0 6)"/>
      <rect x="474" y="98" width="182" height="98" fill="#000" opacity=".14" filter="url(#rfShadow)" transform="translate(0 6)"/>
      <rect class="r-cab" x="236" y="98" width="190" height="98" rx="2"/><rect class="r-cab" x="474" y="98" width="182" height="98" rx="2"/>
      <g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5"><line x1="331" y1="100" x2="331" y2="194"/><line x1="565" y1="100" x2="565" y2="194"/>
        <rect x="244" y="106" width="79" height="82" rx="1.5"/><rect x="339" y="106" width="79" height="82" rx="1.5"/><rect x="482" y="106" width="75" height="82" rx="1.5"/><rect x="573" y="106" width="75" height="82" rx="1.5"/></g>
      <g fill="#8d8f91"><rect x="318" y="168" width="3" height="18" rx="1.5"/><rect x="341" y="168" width="3" height="18" rx="1.5"/><rect x="554" y="168" width="3" height="18" rx="1.5"/><rect x="576" y="168" width="3" height="18" rx="1.5"/></g>
      <polygon class="r-hood" points="432,98 468,98 474,170 426,170"/><rect class="r-hood" x="420" y="168" width="60" height="12" rx="2"/>
      <rect class="r-tile" x="236" y="196" width="420" height="68"/>
      <g stroke="#000" stroke-opacity=".08" stroke-width="1">${Array.from({ length: 4 }, (_, i) => `<line x1="236" y1="${213 + i * 17}" x2="656" y2="${213 + i * 17}"/>`).join('')}${Array.from({ length: 13 }, (_, i) => `<line x1="${270 + i * 32}" y1="196" x2="${270 + i * 32}" y2="264"/>`).join('')}</g>
      <rect x="228" y="270" width="436" height="80" fill="#000" opacity=".18" filter="url(#rfShadow)" transform="translate(0 8)"/>
      <rect class="r-cab" x="232" y="272" width="428" height="72"/>
      <rect x="236" y="344" width="420" height="10" fill="#2a2725" opacity=".55"/>
      <g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5">${[236, 322, 408, 494, 580].map(x => `<rect x="${x + 4}" y="${x === 408 ? 300 : 278}" width="74" height="${x === 408 ? 40 : 62}" rx="1.5"/>`).join('')}<rect x="412" y="278" width="74" height="18" rx="1.5"/></g>
      <g fill="#8d8f91">${[236, 322, 494, 580].map(x => `<rect x="${x + 30}" y="284" width="22" height="3" rx="1.5"/>`).join('')}<rect x="438" y="285" width="22" height="3" rx="1.5"/><rect x="438" y="310" width="22" height="3" rx="1.5"/></g>
      <rect class="r-counter" x="226" y="262" width="440" height="11" rx="2"/>
      <rect x="226" y="262" width="440" height="11" rx="2" fill="url(#ptStone)"/>
      <rect x="226" y="271" width="440" height="3" fill="#000" opacity=".12"/>
      <rect x="512" y="259" width="72" height="5" rx="2" fill="#8d9194"/><path d="M548 260 v-22 q0 -8 9 -8 h8" fill="none" stroke="#9a9c9e" stroke-width="3.5" stroke-linecap="round"/>
      <rect x="282" y="248" width="44" height="14" rx="2" fill="#b9915f"/><circle cx="300" cy="244" r="7" fill="#c9553a"/><circle cx="312" cy="246" r="6" fill="#e0a43a"/>
      ${[350, 600].map(x => `<line x1="${x}" y1="0" x2="${x}" y2="58" stroke="#2d2a27" stroke-width="1.6"/><circle class="r-lamp-glow" cx="${x}" cy="74" r="70" fill="url(#rgLamp)"/><path d="M${x - 18} 76 Q${x - 18} 56 ${x} 56 Q${x + 18} 56 ${x + 18} 76z" fill="#2f3337"/><ellipse class="r-shade" cx="${x}" cy="76" rx="15" ry="3"/>`).join('')}`;
    if (furniture === 'kitchen' && opts.cabTex) {
      // stained cabinets: wood boxes with real cabinet doors laid over them (frame and panel)
      const tex = Object.assign({}, opts.cabTex, { t: 'door', w: 150, h: 160, cm: 0.38 });
      const imgs = list => list.map(([x, y, w, h]) => `<image data-tex="${esc(JSON.stringify(tex))}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>`).join('');
      const upper = [[244, 106, 79, 82], [339, 106, 79, 82], [482, 106, 75, 82], [573, 106, 75, 82]];
      const lower = [[240, 278, 74, 62], [326, 278, 74, 62], [412, 300, 74, 40], [412, 278, 74, 18], [498, 278, 74, 62], [584, 278, 74, 62]];
      body = body.replace(/<rect class="r-cab" /g, '<rect fill="url(#ptCabBox)" ')
        .replace('<g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5"><line x1="331"', imgs(upper) + '<g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5"><line x1="331"')
        .replace('<rect fill="url(#ptCabBox)" x="232" y="272" width="428" height="72"/>', '<rect fill="url(#ptCabBox)" x="232" y="272" width="428" height="72"/>' + imgs(lower));
    }
    else if (furniture === 'bed') body = `${artOrWindow(412, 140, 132, 84)}${rug('290,404 666,404 736,470 220,470')}
      <ellipse cx="478" cy="396" rx="190" ry="14" fill="#000" opacity=".24" filter="url(#rfShadow)"/>
      <rect class="r-sofa-d" x="384" y="252" width="188" height="92" rx="8"/>
      <polygon class="r-duvet" points="378,318 578,318 616,396 340,396"/>
      <polygon points="378,318 578,318 616,396 340,396" fill="#000" opacity=".05"/>
      <path d="M352 372 Q478 360 604 372" fill="none" stroke="#000" stroke-opacity=".10" stroke-width="2"/>
      <rect class="r-duvet" x="398" y="296" width="72" height="28" rx="10"/><rect class="r-duvet" x="486" y="296" width="72" height="28" rx="10"/>
      <rect x="398" y="296" width="72" height="28" rx="10" fill="#000" opacity=".04"/><rect x="486" y="296" width="72" height="28" rx="10" fill="#000" opacity=".04"/>
      <rect class="r-sofa-l" x="340" y="388" width="276" height="10" rx="3"/>
      <rect class="r-art" x="444" y="304" width="68" height="22" rx="9"/><rect x="444" y="304" width="68" height="22" rx="9" fill="url(#ptFabric)" style="mix-blend-mode:multiply"/>
      <polygon class="r-art2" points="380,346 576,346 596,384 360,384" opacity=".55"/>
      ${[322, 594].map(x => `<rect x="${x - 3}" y="314" width="66" height="50" rx="3" fill="#000" opacity=".16" filter="url(#rfShadow)"/><rect class="r-wood" x="${x}" y="312" width="60" height="50" rx="3"/><line x1="${x + 4}" y1="335" x2="${x + 56}" y2="335" stroke="#000" stroke-opacity=".18"/><circle class="r-lamp-glow" cx="${x + 30}" cy="282" r="70" fill="url(#rgLamp)"/><rect x="${x + 28}" y="288" width="4" height="24" fill="#3a3632"/><polygon class="r-shade" points="${x + 18},270 ${x + 42},270 ${x + 47},290 ${x + 13},290"/>`).join('')}`;
    else if (furniture === 'vanity') body = `
      <rect x="398" y="128" width="148" height="126" rx="6" fill="#000" opacity=".14" filter="url(#rfShadow)" transform="translate(2 5)"/>
      <rect class="r-frame" x="398" y="128" width="148" height="126" rx="6"/>
      <rect x="405" y="135" width="134" height="112" rx="3" fill="url(#rgMirror)"/>
      <path d="M420 240 L470 140 M450 240 L500 140" stroke="#fff" stroke-opacity=".35" stroke-width="6"/>
      ${[372, 572].map(x => `<rect x="${x - 4}" y="150" width="8" height="34" rx="3" fill="#3a3632"/><circle class="r-lamp-glow" cx="${x}" cy="160" r="46" fill="url(#rgLamp)"/><rect class="r-shade" x="${x - 9}" y="146" width="18" height="26" rx="8"/>`).join('')}
      <ellipse cx="472" cy="362" rx="120" ry="9" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      <rect class="r-vanity" x="380" y="282" width="184" height="72"/>
      <g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5"><rect x="386" y="288" width="84" height="60" rx="1.5"/><rect x="474" y="288" width="84" height="60" rx="1.5"/></g>
      <rect x="452" y="300" width="3" height="16" rx="1.5" fill="#8d8f91"/><rect x="489" y="300" width="3" height="16" rx="1.5" fill="#8d8f91"/>
      <rect class="r-counter" x="372" y="273" width="200" height="11" rx="2"/>
      <ellipse cx="472" cy="276" rx="34" ry="4.5" fill="#000" opacity=".16"/>
      <path d="M472 274 v-16 q0 -6 8 -6 h6" fill="none" stroke="#9a9c9e" stroke-width="3" stroke-linecap="round"/>
      <rect x="590" y="214" width="40" height="4" rx="2" fill="#8d8f91"/><rect class="r-duvet" x="594" y="218" width="32" height="56" rx="3"/>`;
    else if (furniture === 'desk') body = `${artOrWindow(300, 140, 120, 86)}
      <rect x="456" y="150" width="150" height="10" rx="2" fill="#000" opacity=".1" filter="url(#rfShadow)" transform="translate(0 4)"/>
      <rect class="r-wood" x="456" y="150" width="150" height="8" rx="2"/>
      <rect x="470" y="124" width="14" height="26" fill="#6b5d52"/><rect x="488" y="128" width="12" height="22" fill="#8c7b6d"/><rect x="504" y="120" width="10" height="30" fill="#4d5a63"/>
      <ellipse cx="560" cy="142" rx="14" ry="9" fill="#5e7a4c"/><rect x="552" y="140" width="16" height="10" fill="#b48a63"/>
      <ellipse cx="470" cy="372" rx="150" ry="10" fill="#000" opacity=".24" filter="url(#rfShadow)"/>
      <rect class="r-wood" x="352" y="292" width="236" height="12" rx="2"/>
      <rect x="362" y="304" width="7" height="64" fill="#3a3632"/><rect x="571" y="304" width="7" height="64" fill="#3a3632"/>
      <rect x="430" y="236" width="94" height="56" rx="4" fill="#26282b"/><rect x="436" y="242" width="82" height="44" rx="2" fill="#3c4650"/><rect x="472" y="290" width="10" height="4" fill="#26282b"/>
      <circle class="r-lamp-glow" cx="390" cy="262" r="70" fill="url(#rgLamp)"/><path d="M380 292 l10 -30 l16 6" fill="none" stroke="#2d2a27" stroke-width="3" stroke-linecap="round"/><polygon class="r-shade" points="398,262 420,262 416,276 402,276"/>
      <rect class="r-sofa-d" x="440" y="312" width="70" height="44" rx="10"/><rect x="471" y="356" width="8" height="22" fill="#2d2a27"/><rect x="452" y="376" width="46" height="5" rx="2" fill="#2d2a27"/>`;
    else if (furniture === 'dining') body = `${artOrWindow(400, 132, 156, 96)}${rug('270,380 686,380 752,462 204,462')}
      <line x1="478" y1="90" x2="478" y2="214" stroke="#2d2a27" stroke-width="2"/>
      <circle class="r-lamp-glow" cx="478" cy="236" r="110" fill="url(#rgLamp)"/>
      <polygon class="r-shade" points="452,214 504,214 520,240 436,240"/>
      <ellipse cx="478" cy="400" rx="200" ry="14" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      ${[[352, 300], [418, 296], [538, 296], [604, 300]].map(([x, y]) => `<rect class="r-sofa-d" x="${x - 18}" y="${y}" width="36" height="46" rx="6"/><rect class="r-wood" x="${x - 20}" y="${y + 44}" width="40" height="8" rx="2"/>`).join('')}
      <polygon class="r-wood" points="330,338 626,338 660,370 296,370"/>
      <polygon points="330,338 626,338 660,370 296,370" fill="#000" opacity=".06"/>
      <rect class="r-wood" x="300" y="370" width="356" height="8" rx="2"/>
      <rect x="318" y="378" width="8" height="34" fill="#3a3632"/><rect x="630" y="378" width="8" height="34" fill="#3a3632"/>
      <ellipse cx="478" cy="350" rx="34" ry="6" fill="#e8e2d6"/><ellipse cx="478" cy="346" rx="16" ry="10" fill="#6f8a5a"/>`;
    else if (furniture === 'console') body = `
      <circle cx="476" cy="190" r="56" fill="#000" opacity=".12" filter="url(#rfShadow)"/>
      <circle class="r-frame" cx="474" cy="186" r="56"/><circle cx="474" cy="186" r="49" fill="url(#rgMirror)"/>
      <path d="M446 214 L496 154" stroke="#fff" stroke-opacity=".35" stroke-width="6"/>
      <ellipse cx="476" cy="372" rx="150" ry="9" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      <rect class="r-wood" x="372" y="276" width="208" height="12" rx="2"/>
      <rect x="380" y="288" width="7" height="80" fill="#3a3632"/><rect x="565" y="288" width="7" height="80" fill="#3a3632"/>
      <rect class="r-wood" x="384" y="336" width="184" height="6" rx="2" opacity=".85"/>
      <circle class="r-lamp-glow" cx="402" cy="236" r="70" fill="url(#rgLamp)"/><rect x="399" y="248" width="6" height="28" fill="#3a3632"/><polygon class="r-shade" points="386,228 418,228 424,250 380,250"/>
      <rect x="532" y="250" width="26" height="26" rx="4" fill="#b48a63"/><ellipse cx="545" cy="238" rx="22" ry="20" fill="#5e7a4c"/>
      <polygon class="r-duvet" points="380,392 580,392 640,470 320,470" opacity=".9"/>
      <polygon points="380,392 580,392 640,470 320,470" fill="#000" opacity=".06"/>`;
    else if (furniture === 'laundry') body = `
      <rect class="r-cab" x="330" y="112" width="290" height="76" rx="2"/>
      <g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5"><rect x="336" y="118" width="88" height="64" rx="1.5"/><rect x="431" y="118" width="88" height="64" rx="1.5"/><rect x="526" y="118" width="88" height="64" rx="1.5"/></g>
      <rect class="r-wood" x="330" y="228" width="290" height="8" rx="2"/>
      <rect x="352" y="206" width="30" height="22" rx="3" fill="#b9a88f"/><rect x="560" y="200" width="36" height="28" rx="3" fill="#8fa6b6"/>
      <ellipse cx="476" cy="372" rx="160" ry="10" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      ${[350, 482].map(x => `<rect x="${x}" y="250" width="124" height="118" rx="6" fill="#eef0f1"/><rect x="${x}" y="250" width="124" height="18" rx="5" fill="#dfe3e6"/><circle cx="${x + 62}" cy="314" r="36" fill="#cfd6db"/><circle cx="${x + 62}" cy="314" r="27" fill="#5f6b74"/><circle cx="${x + 62}" cy="314" r="27" fill="url(#rgMirror)" opacity=".35"/><rect x="${x + 12}" y="255" width="30" height="7" rx="2" fill="#b9c1c7"/>`).join('')}`;
    else if (furniture === 'dresser') body = `${artOrWindow(400, 116, 150, 96)}
      <ellipse cx="476" cy="372" rx="150" ry="10" fill="#000" opacity=".24" filter="url(#rfShadow)"/>
      <rect class="r-cab" x="360" y="246" width="232" height="118" rx="3"/>
      <rect x="360" y="246" width="232" height="118" rx="3" fill="url(#rgBackY)"/>
      <rect class="r-woodtex" fill="url(#ptWood)" x="354" y="238" width="244" height="10" rx="2"/>
      <g fill="none" stroke="#000" stroke-opacity=".18" stroke-width="1.5">${[254, 290, 326].map(y => `<rect x="368" y="${y}" width="216" height="32" rx="2"/>`).join('')}<line x1="476" y1="254" x2="476" y2="286"/></g>
      <g fill="#b8963e">${[[420, 270], [532, 270], [440, 306], [512, 306], [440, 342], [512, 342]].map(([x, y]) => `<rect x="${x - 9}" y="${y - 1.5}" width="18" height="3" rx="1.5"/>`).join('')}</g>
      <rect x="368" y="364" width="8" height="12" fill="#2d2a27"/><rect x="576" y="364" width="8" height="12" fill="#2d2a27"/>
      <circle class="r-lamp-glow" cx="400" cy="200" r="70" fill="url(#rgLamp)"/><rect x="397" y="212" width="6" height="26" fill="#3a3632"/><polygon class="r-shade" points="384,192 416,192 422,214 378,214"/>
      <rect x="530" y="222" width="22" height="16" rx="3" fill="#c9b28c"/><ellipse cx="541" cy="212" rx="16" ry="12" fill="#5e7a4c"/>`;
    else if (furniture === 'garage') body = `
      <rect x="300" y="120" width="250" height="120" rx="2" fill="#b88d5c"/>
      <g fill="#8a6640">${Array.from({ length: 10 }, (_, r) => Array.from({ length: 22 }, (_, c2) => `<circle cx="${310 + c2 * 11}" cy="${130 + r * 11}" r="1.4"/>`).join('')).join('')}</g>
      <g stroke="#3a3632" stroke-width="3" stroke-linecap="round"><line x1="330" y1="150" x2="330" y2="190"/><line x1="370" y1="148" x2="382" y2="190"/><line x1="420" y1="150" x2="420" y2="186"/><circle cx="470" cy="166" r="12" fill="none"/><line x1="510" y1="150" x2="510" y2="196"/></g>
      <ellipse cx="430" cy="374" rx="170" ry="10" fill="#000" opacity=".24" filter="url(#rfShadow)"/>
      <rect class="r-wood" x="292" y="262" width="270" height="16" rx="2"/>
      <rect x="300" y="278" width="10" height="90" fill="#4a4a4a"/><rect x="544" y="278" width="10" height="90" fill="#4a4a4a"/>
      <rect x="300" y="330" width="254" height="8" fill="#5a5a5a"/>
      <rect x="320" y="296" width="60" height="34" rx="3" fill="#b5362e"/><rect x="470" y="300" width="40" height="30" rx="3" fill="#2f5d86"/>
      <rect x="590" y="160" width="58" height="200" rx="2" fill="#8c8f92"/>${[190, 240, 290, 340].map(y => `<rect x="590" y="${y}" width="58" height="5" fill="#6d7174"/>`).join('')}`;
    else body = `${artOrWindow(402, 140, 150, 104)}
      <ellipse cx="480" cy="374" rx="168" ry="11" fill="#000" opacity=".26" filter="url(#rfShadow)"/>
      <rect class="r-sofa-d" x="352" y="282" width="256" height="62" rx="14"/>
      <rect class="r-sofa" x="336" y="318" width="288" height="44" rx="10"/>
      <rect class="r-sofa-l" x="352" y="314" width="126" height="20" rx="8"/>
      <rect class="r-sofa-l" x="482" y="314" width="126" height="20" rx="8"/>
      <rect class="r-sofa-d" x="322" y="298" width="36" height="66" rx="12"/>
      <rect class="r-sofa-d" x="602" y="298" width="36" height="66" rx="12"/>
      <rect x="334" y="362" width="6" height="10" rx="2" fill="#2a2522"/><rect x="620" y="362" width="6" height="10" rx="2" fill="#2a2522"/>
      <g style="mix-blend-mode:multiply"><rect x="352" y="282" width="256" height="62" rx="14" fill="url(#ptFabric)"/><rect x="336" y="318" width="288" height="44" rx="10" fill="url(#ptFabric)"/><rect x="322" y="298" width="36" height="66" rx="12" fill="url(#ptFabric)"/><rect x="602" y="298" width="36" height="66" rx="12" fill="url(#ptFabric)"/></g>
      <rect class="r-art" x="368" y="292" width="50" height="36" rx="10" transform="rotate(-8 393 310)"/><rect class="r-art2" x="540" y="292" width="50" height="36" rx="10" transform="rotate(7 565 310)"/>
      <rect x="368" y="292" width="50" height="36" rx="10" transform="rotate(-8 393 310)" fill="url(#ptFabric)" style="mix-blend-mode:multiply"/><rect x="540" y="292" width="50" height="36" rx="10" transform="rotate(7 565 310)" fill="url(#ptFabric)" style="mix-blend-mode:multiply"/>
      ${LAMP}
      <ellipse cx="648" cy="372" rx="22" ry="5" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      <path d="M634 336 h28 l-4 36 h-20z" fill="#d9d2c6"/><path d="M634 336 h28 l-1 6 h-26z" fill="#000" opacity=".08"/>
      <g fill="#5e7a4c"><path d="M648 338 C628 318 620 296 626 276 C636 292 644 312 648 338z"/><path d="M648 338 C664 314 678 300 684 282 C670 290 656 308 648 338z" fill="#4e6a3e"/><path d="M648 338 C646 310 650 284 660 262 C664 286 656 314 648 338z" fill="#6b8a58"/><path d="M648 338 C636 322 618 316 604 318 C620 326 634 332 648 338z" fill="#57744a"/></g>`;
    // the rug goes under the sofa, the coffee table in front of it
    if (furniture === 'sofa') body = rug('300,384 660,384 720,452 240,452') + body + `
      <ellipse cx="480" cy="424" rx="96" ry="7" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      <polygon class="r-woodtex" fill="url(#ptWood)" points="404,392 556,392 572,406 388,406"/><rect class="r-woodtex" fill="url(#ptWood)" x="388" y="406" width="184" height="6"/><rect x="388" y="406" width="184" height="6" fill="#000" opacity=".18"/>
      <rect x="396" y="412" width="5" height="14" fill="#2d2a27"/><rect x="559" y="412" width="5" height="14" fill="#2d2a27"/>
      <rect x="430" y="388" width="44" height="5" rx="1" fill="#3f5a6b"/><rect x="434" y="384" width="36" height="5" rx="1" fill="#c9b28c"/><circle cx="526" cy="390" r="7" fill="#e9e4da"/>`;
    body = body.replace(/class="r-wood"/g, 'class="r-woodtex" fill="url(#ptWood)"');
    const shade = slots.map(w => w.slot === 'left' ? `<polygon class="r-wshade" data-dir="${w.dir}" points="0,0 225,90 225,354 0,480" fill="#000"/><polygon class="r-cast" data-dir="${w.dir}" points="330,372 640,372 720,400 410,400" fill="#000" filter="url(#rfSoft)"/>`
      : w.slot === 'right' ? `<polygon class="r-wshade" data-dir="${w.dir}" points="800,0 665,90 665,354 800,480" fill="#000"/><polygon class="r-cast" data-dir="${w.dir}" points="320,372 630,372 550,400 240,400" fill="#000" filter="url(#rfSoft)"/>`
      : `<rect class="r-wshade" data-dir="${w.dir}" x="225" y="90" width="440" height="264" fill="#000"/>`).join('');
    body = shade.replace(/<polygon class="r-cast"[^>]*>/g, '') + body.replace(/(<ellipse cx="4\d\d" cy="3[67]\d"[^>]*filter="url\(#rfShadow\)"\/>)/, '$1' + (shade.match(/<polygon class="r-cast"[^>]*>/g) || []).slice(0, 1).join(''));
    return `${open}${defs}${shell}${ceilLight}${body}${night}</svg>`;
  }

  // Front of a house, straight on. Siding texture follows the siding answer.
  function houseSvg(opts) {
    const siding = opts.siding || 'wood';
    let texture = '';
    if (siding === 'brick') {
      const rows = [];
      for (let y = 190, r = 0; y < 410; y += 11, r++) {
        rows.push(`<line x1="120" y1="${y}" x2="680" y2="${y}"/>`);
        for (let x = 120 + (r % 2 ? 0 : 17); x < 680; x += 34) rows.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 11}"/>`);
      }
      texture = `<g clip-path="url(#rcBody)" stroke="#000" stroke-opacity=".13" stroke-width="1.1">${rows.join('')}</g>`;
    } else if (opts.sidingTex) {
      // stained lap boards: the boards carry their own grain; these are the shadow lines under each lap
      const lines = [];
      for (let y = 193; y < 410; y += 13) lines.push(`<line x1="120" y1="${y}" x2="680" y2="${y}"/>`);
      texture = `<g clip-path="url(#rcBody)" stroke="#000" stroke-opacity=".22" stroke-width="1.6">${lines.join('')}</g>`;
    } else if (siding === 'shake') {
      const rows = [];
      for (let y = 196, r = 0; y < 410; y += 15, r++) {
        rows.push(`<line x1="120" y1="${y}" x2="680" y2="${y}"/>`);
        for (let x = 120 + ((r * 13) % 29); x < 680; x += 22 + ((x * 7 + r * 5) % 13)) rows.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 15}"/>`);
      }
      texture = `<g clip-path="url(#rcBody)" stroke="#000" stroke-opacity=".15" stroke-width="1.2">${rows.join('')}</g>`;
    } else if (siding === 'board') {
      const bats = [];
      for (let x = 146; x < 680; x += 36) bats.push(`<rect x="${x}" y="180" width="7" height="230" fill="#000" opacity=".10"/><rect x="${x - 1}" y="180" width="2" height="230" fill="#fff" opacity=".08"/>`);
      texture = `<g clip-path="url(#rcBody)">${bats.join('')}</g>`;
    } else if (siding !== 'stucco') {
      const lines = [];
      for (let y = 196; y < 410; y += 13) lines.push(`<line x1="120" y1="${y}" x2="680" y2="${y}"/>`, `<line x1="120" y1="${y + 1.5}" x2="680" y2="${y + 1.5}" stroke="#fff" stroke-opacity=".10"/>`);
      texture = `<g clip-path="url(#rcBody)" stroke="#000" stroke-opacity=".16" stroke-width="1.2">${lines.join('')}</g>`;
    } else {
      texture = `<rect x="120" y="180" width="560" height="230" fill="url(#rgStucco)" opacity=".5"/>`;
    }
    const win = x => `
      <rect class="r-xtrim" x="${x - 9}" y="211" width="128" height="128" rx="1"/>
      <rect class="r-glass" x="${x}" y="220" width="110" height="110"/>
      <rect x="${x}" y="220" width="110" height="110" fill="url(#rgGlass)"/>
      <g class="r-xtrim-s" stroke-width="5"><line x1="${x + 55}" y1="220" x2="${x + 55}" y2="330"/><line x1="${x}" y1="275" x2="${x + 110}" y2="275"/></g>
      <rect class="r-xtrim" x="${x - 14}" y="337" width="138" height="9" rx="1"/>
      <rect x="${x - 14}" y="345" width="138" height="5" fill="#000" opacity=".12"/>`;
    return `<defs>${DEFS_COMMON}
        <linearGradient id="rgGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient>
        <linearGradient id="rgEave" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".30"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
        <linearGradient id="rgBodyShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></linearGradient>
        <linearGradient id="rgLawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient>
        <radialGradient id="rgStucco" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></radialGradient>
        <radialGradient id="rgNight" cx="0.58" cy="0.6" r="0.75"><stop offset="0" stop-color="#000" stop-opacity=".05"/><stop offset=".5" stop-color="#000" stop-opacity=".32"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
        <clipPath id="rcBody"><rect x="120" y="180" width="560" height="230"/></clipPath>
        ${opts.sidingTex ? pattern('ptSiding', Object.assign({}, opts.sidingTex, { t: 'boards', w: 560, h: 230, cm: 14 / 13, board: 14, seed: 8, ends: false }), 560, 230, 120, 180) : ''}
      </defs>
      <rect x="0" y="0" width="800" height="480" fill="url(#rgSky)"/>
      <ellipse class="r-tree" cx="40" cy="300" rx="90" ry="140"/><ellipse class="r-tree" cx="770" cy="310" rx="80" ry="130"/>
      <ellipse cx="40" cy="300" rx="90" ry="140" fill="#000" opacity=".12"/><ellipse cx="770" cy="310" rx="80" ry="130" fill="#000" opacity=".18"/>
      <rect class="r-lawn" x="0" y="404" width="800" height="76"/><rect x="0" y="404" width="800" height="76" fill="url(#rgLawn)"/>
      <!-- body -->
      <rect class="r-body" x="120" y="180" width="560" height="230"/>
      ${opts.sidingTex ? '<rect x="120" y="180" width="560" height="230" fill="url(#ptSiding)"/>' : ''}
      ${texture}
      <rect x="120" y="180" width="560" height="230" fill="url(#rgBodyShade)"/>
      <rect class="r-xtrim" x="120" y="180" width="12" height="230"/><rect class="r-xtrim" x="668" y="180" width="12" height="230"/>
      <!-- roof -->
      <polygon class="r-roof" points="84,186 400,58 716,186"/>
      <g stroke="#000" stroke-opacity=".18" stroke-width="1.2">${Array.from({ length: 8 }, (_, i) => { const y = 82 + i * 13.5; const half = (y - 58) / (186 - 58) * 316; return `<line x1="${400 - half}" y1="${y}" x2="${400 + half}" y2="${y}"/>`; }).join('')}</g>
      <polygon class="r-xtrim" points="76,190 400,60 724,190 724,198 400,68 76,198"/>
      <rect class="r-xtrim" x="108" y="182" width="584" height="10"/>
      <rect x="120" y="192" width="560" height="22" fill="url(#rgEave)"/>
      <!-- gable vent -->
      <polygon class="r-xtrim" points="400,96 430,134 370,134"/><polygon points="400,104 422,130 378,130" fill="#000" opacity=".35"/>
      <!-- windows -->
      ${win(176)}${win(514)}
      <!-- door -->
      <rect class="r-xtrim" x="344" y="236" width="112" height="176" rx="1"/>
      <rect class="r-xdoor" x="356" y="248" width="88" height="160"/>
      ${opts.doorTex ? `<image data-tex="${esc(JSON.stringify(Object.assign({}, opts.doorTex, { t: 'door', w: 88, h: 160, cm: 1.27, frame: 12 })))}" x="356" y="248" width="88" height="160" preserveAspectRatio="none"/>` : ''}
      <g fill="none" stroke="#000" stroke-opacity="${opts.doorTex ? 0 : '.22'}" stroke-width="1.6"><rect x="366" y="262" width="29" height="58" rx="1"/><rect x="405" y="262" width="29" height="58" rx="1"/><rect x="366" y="332" width="29" height="64" rx="1"/><rect x="405" y="332" width="29" height="64" rx="1"/></g>
      <g fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1"><rect x="367" y="263" width="27" height="56" rx="1"/><rect x="406" y="263" width="27" height="56" rx="1"/></g>
      <circle cx="434" cy="330" r="4" fill="#c4a24c"/><circle cx="434" cy="330" r="4" fill="none" stroke="#000" stroke-opacity=".25"/>
      <rect x="356" y="248" width="88" height="160" fill="#000" opacity=".06"/>
      <!-- porch light -->
      <circle class="r-lamp-glow" cx="474" cy="282" r="90" fill="url(#rgLamp)"/>
      <rect x="466" y="268" width="16" height="26" rx="3" fill="#2b2b2b"/><rect class="r-shade" x="469" y="272" width="10" height="18" rx="2"/>
      <!-- steps and walk -->
      <rect class="r-step" x="330" y="408" width="140" height="12"/><rect class="r-step" x="316" y="420" width="168" height="12"/>
      <rect x="316" y="430" width="168" height="3" fill="#000" opacity=".12"/>
      <polygon class="r-walk" points="340,433 460,433 520,480 280,480"/>
      <!-- shrubs -->
      <ellipse cx="236" cy="410" rx="72" ry="10" fill="#000" opacity=".25" filter="url(#rfShadow)"/><ellipse cx="572" cy="410" rx="72" ry="10" fill="#000" opacity=".25" filter="url(#rfShadow)"/>
      <ellipse class="r-shrub" cx="200" cy="396" rx="42" ry="26"/><ellipse class="r-shrub" cx="262" cy="400" rx="36" ry="22"/><ellipse class="r-shrub" cx="540" cy="398" rx="38" ry="24"/><ellipse class="r-shrub" cx="602" cy="396" rx="42" ry="26"/>
      <ellipse cx="208" cy="388" rx="26" ry="12" fill="#fff" opacity=".06"/><ellipse cx="596" cy="388" rx="26" ry="12" fill="#fff" opacity=".06"/>
      <rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/>`;
  }

  const SKY = {
    none: ['#cfe1f3', '#eef4f8'], daylight: ['#bcd6ef', '#eaf2f8'], north: ['#b7c7d8', '#dfe7ee'], sun: ['#9cc6ef', '#fff2d9'],
    golden: ['#f2a65a', '#ffd9a0'], warm: ['#141b26', '#2c3647'], soft: ['#141b26', '#2c3647'], cool: ['#141b26', '#2c3647'], dim: ['#8e979f', '#b9c0c5'],
  };
  const FIXED_FILL = { rug: 'CFC6B8', curtain: 'ECE7DD', counter: 'ECEAE5', cab: 'F2F1EC', body: 'CFC8BC', xtrim: 'F2F1EC', glass: '33404B', lawn: '6E8A4F', tree: '5D7649', shrub: '4E6A3B', roof: '45484C', floor: 'A9784B', frame: '2B2926', sofa: '8A857E', 'sofa-d': '77726B', 'sofa-l': '9A958E', shade: 'ECE6DA', duvet: 'F1F0EC', wood: 'A27B55' };
  function updateRoomScene() {
    const room = $('#roomScene'); if (!room) return;
    const id = state.roomLight;
    const L = id === 'none' ? null : id;
    const lt = LIGHT_BY_ID[id];
    let roles = {};
    try { roles = JSON.parse(room.dataset.roles || '{}'); } catch (e) { roles = {}; }
    const set = (sel, prop, val) => $$(sel, room).forEach(el => el.setAttribute(prop, val));
    for (const [role, hex] of Object.entries(Object.assign({}, FIXED_FILL, roles))) {
      if (!/^[0-9A-F]{6}$/i.test(hex)) continue;
      const v = paint(hex, L);
      set('.r-' + role, 'fill', v);
      set('.r-' + role + '-s', 'stroke', v);
    }
    const sky = SKY[id] || SKY.daylight;
    set('.r-sky-top', 'stop-color', sky[0]); set('.r-sky-bot', 'stop-color', sky[1]);
    const night = ['warm', 'soft', 'cool'].includes(id);
    const lampColor = lt ? C.displayCss('FFFFFF', { light: Object.assign({}, lt, { adapt: 0.85, intensity: 1 }) }) : '#fff4dc';
    set('.r-lamp-c', 'stop-color', lampColor);
    set('.r-lamp-glow', 'opacity', night ? 1 : id === 'dim' ? 0.45 : 0);
    // each window throws its own patch of sun: south and west get the strong afternoon sun, east only soft light
    const SUN = { none: { south: 0.2, east: 0.2, west: 0.2, north: 0.08, '?': 0.16 }, daylight: { south: 0.24, east: 0.24, west: 0.24, north: 0.1, '?': 0.22 },
      sun: { south: 0.5, west: 0.5, east: 0.22, north: 0.06, '?': 0.45 }, golden: { west: 0.52, south: 0.3, east: 0.08, north: 0.04, '?': 0.42 } };
    const sunMap = SUN[id] || {};
    const SHADE = { none: 0.08, daylight: 0.1, north: 0.06, sun: 0.16, golden: 0.14, dim: 0.04 };
    $$('.r-wshade', room).forEach(el => el.setAttribute('opacity', night ? 0 : (SHADE[id] || 0.06) * (el.dataset.dir === 'north' ? 0.6 : 1)));
    $$('.r-cast', room).forEach(el => el.setAttribute('opacity', night ? 0 : (SHADE[id] || 0.06) * (['south', 'west'].includes(el.dataset.dir) && (id === 'sun' || id === 'golden') ? 1.8 : 1.1)));
    $$('.r-sun', room).forEach(el => { el.setAttribute('fill', id === 'golden' ? '#ffc777' : id === 'sun' ? '#fff0cf' : '#ffffff'); el.setAttribute('opacity', sunMap[el.dataset.dir] || 0); });
    // north-facing glass looks a little bluer, west glass glows at golden hour
    $$('.r-wtint', room).forEach(el => { const d = el.dataset.dir; const golden = id === 'golden' && d === 'west', cool = d === 'north' && !night;
      el.setAttribute('fill', golden ? '#ffb45c' : '#7f9bb8'); el.setAttribute('opacity', golden ? 0.35 : cool ? 0.22 : 0); });
    set('.r-night', 'opacity', night ? 1 : id === 'dim' ? 0.7 : 0);
    applyTextures(room, id);
    paintWoods(sheet, id);
    $$('.mini-sw[data-hex]', sheet).forEach(el => { el.style.backgroundColor = paint(el.dataset.hex, L); });
    const isHouse = ['house', 'deck', 'fence', 'siding', 'door'].includes(room.dataset.scene);
    const label = !lt ? 'Chip color' : isHouse && night ? 'Night, porch light' : isHouse && id === 'north' ? 'Shade / overcast' : lt.label;
    $('#roomLabel').textContent = label;
  }

  const sheet = $('#detailSheet'), scrim = $('#scrim');
  let lastFocus = null;
  function openDetail(id, inSheet) {
    if (!E.findColor(id) || (state.results && state.results.kind === 'stain' && state.results.results.concat(state.results.finalists || []).some(r => r.id === id))) {
      const x = stainResultFor(id); if (x) { openStainDetail(x.R, x.r); return; }
    }
    const c = E.findColor(id); if (!c) return;
    if (inSheet && state.detailId && state.detailId !== id) state.detailStack.push(state.detailId);
    if (!inSheet) state.detailStack = [];
    state.detailId = id;
    const wasOpen = !sheet.hidden;
    if (!wasOpen) lastFocus = document.activeElement;
    sheet.innerHTML = detailHtml(c);
    updateRoomScene();
    if (!wasOpen) { showScrim(); sheet.hidden = false; sheet.classList.remove('out'); $('[data-act="close-detail"]', sheet).focus({ preventScroll: true }); }
    else { sheet.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); if (!reduced()) $('.sheet-body', sheet).animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
  }
  function closeSheet(el) {
    if (el.hidden) return;
    const done = () => { el.hidden = true; el.classList.remove('out'); };
    if (reduced()) done(); else { el.classList.add('out'); setTimeout(done, 300); }
    if ($('#detailSheet').hidden || el.id === 'detailSheet') if ($('#settingsSheet').hidden || el.id === 'settingsSheet') hideScrim();
    if (el.id === 'detailSheet') { state.detailId = null; state.detailStack = []; }
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  function showScrim() { scrim.hidden = false; scrim.classList.remove('out'); }
  function hideScrim() { if (reduced()) { scrim.hidden = true; return; } scrim.classList.add('out'); setTimeout(() => { scrim.hidden = true; scrim.classList.remove('out'); }, 300); }
  scrim.addEventListener('click', () => { closeSheet($('#detailSheet')); closeSheet($('#settingsSheet')); });
  sheet.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.act === 'close-detail') closeSheet(sheet);
    if (t.dataset.act === 'detail-back' && state.detailStack.length) { const prev = state.detailStack.pop(); state.detailId = null; openDetail(prev, false); state.detailStack = state.detailStack; }
    if (t.dataset.copy) copyText(t.dataset.copy, 'Copied');
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#present').hidden) { closePresent(); return; }
    if (!$('#installModal').hidden) { $('#installModal').hidden = true; return; }
    if (!$('#infoModal').hidden) { closeInfo(); return; }
    if (!$('#calModal').hidden) { closeCal(); return; }
    if (!sheet.hidden) { closeSheet(sheet); return; }
    if (!$('#settingsSheet').hidden) closeSheet($('#settingsSheet'));
  });

  // ================================================================
  // LOOKUP & MATCH
  // ================================================================
  function renderLookup() {
    const host = $('#view-lookup');
    host.innerHTML = `
      <div class="lookup-head">
        <h1>Look Up Any Color</h1>
        <p class="muted">Type a name or code from any brand, or pick a color value. Open a color to see its closest match in every brand.</p>
        <div class="searchbox">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12.2 12.2L16 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input type="search" id="lookupInput" aria-label="Search colors" placeholder="Agreeable Gray, SW 7029, OC-17, #D1CBC1" value="${esc(state.query)}" autocomplete="off" spellcheck="false">
          <button type="button" class="search-clear" data-clear="lookupInput" aria-label="Clear search" ${state.query ? '' : 'hidden'}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3L3 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
          ${colorHtml('lookupColor', state.lookupHex || 'D1CBC1', 'Match a color value')}
        </div>
        <p class="lookup-hint">Searching ${fmt(enabledCount())} colors across ${Object.values(brandsEnabled()).filter(Boolean).length} brands. Brand words work too: “behr swiss coffee”.</p>
      </div>
      <div id="lookupResults"></div>`;
    const input = $('#lookupInput');
    let timer;
    const clearBtn = $('[data-clear="lookupInput"]');
    input.addEventListener('input', () => { clearBtn.hidden = !input.value; clearTimeout(timer); timer = setTimeout(() => { state.query = input.value; showLookupResults(); }, 90); });
    clearBtn.addEventListener('click', () => { input.value = ''; state.query = ''; clearBtn.hidden = true; showLookupResults(); input.focus(); });
    COLORS.lookupColor.onChange = hex => { state.lookupHex = hex; input.value = '#' + hex; state.query = input.value; clearBtn.hidden = false; clearTimeout(timer); timer = setTimeout(showLookupResults, 60); };
    showLookupResults();
    if (window.matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
  }
  function showLookupResults() {
    const host = $('#lookupResults'); if (!host) return;
    const q = state.query.trim();
    const opts = { brands: brandsEnabled(), showDiscontinued: settings.showDiscontinued, limit: 60 };
    if (!q) {
      const pop = E.getIndex().colors.filter(c => opts.brands[c.brand] && (c.flags & E.F.POPULAR) && !(c.flags & E.F.DISC));
      pop.sort((x, y) => y.lrv - x.lrv);
      host.innerHTML = `<p class="section-title" style="margin-bottom:12px">Best Sellers</p><div class="list">${pop.slice(0, 40).map((c, i) => lookupRow({ color: c }, i)).join('')}</div>`;
      return;
    }
    const res = E.search(q, opts);
    host.innerHTML = res.length ? `<p class="section-title" style="margin-bottom:12px">${res.length === 60 ? 'Top 60 results' : res.length + ' result' + (res.length > 1 ? 's' : '')}${res[0].dE != null ? ' · closest by color' : ''}</p><div class="list">${res.map((r, i) => lookupRow(r, i)).join('')}</div>`
      : `<div class="empty"><p>No colors match “${esc(q)}”.</p><p class="muted">Check the spelling, try just the number, or paste a hex value like #D1CBC1.</p></div>`;
  }
  function lookupRow(r, i) {
    const c = r.color;
    return `<button type="button" class="row" data-open="${esc(c.id)}" style="--i:${Math.min(i, 20)}"><span class="sw" data-hex="${c.hex}" style="background-color:${paint(c.hex)}"></span><span class="row-main"><span class="row-name">${esc(c.name)}</span><span class="row-sub">${esc(brandName(c.brand))} · <span class="mono">${esc(E.codeLabel(c))}</span>${c.flags & E.F.DISC ? ' · discontinued' : ''}</span></span><span class="row-end">${r.dE != null ? `<span class="badge ${r.dE < 2.5 ? 'good' : ''}">${esc(C.matchLabel(r.dE))}</span><span class="mono">ΔE ${r.dE}</span>` : `<span class="mono">LRV ${c.lrv}</span>`}</span></button>`;
  }

  // ================================================================
  // SHORTLIST + PRESENT
  // ================================================================
  function renderShortlist() {
    const host = $('#view-shortlist');
    const colors = shortlist.map(id => findAny(id)).filter(Boolean);
    host.innerHTML = `
      <div class="short-head">
        <div style="display:grid;gap:6px"><h1>Saved Colors</h1><p class="muted">${colors.length ? `${colors.length} saved color${colors.length > 1 ? 's' : ''}.` : 'Star colors from results or look-ups to compare them here.'}</p></div>
        ${colors.length ? `<div class="short-actions"><button type="button" class="btn primary" data-act="present">Show full screen</button>${colors.length > 1 ? '<button type="button" class="btn" data-compare="saved">Compare</button>' : ''}<button type="button" class="btn" data-act="copy-list">Copy list</button><button type="button" class="btn ghost" data-act="clear-list">Clear</button></div>` : ''}
      </div>
      ${colors.length ? `${settings.lightPreview ? `<div class="results-tools">${lightBar(state.gridLight, 'grid')}</div>` : ''}<div class="grid">${colors.map(c => chipCard(c, { light: state.gridLight })).join('')}</div>`
        : `<div class="empty"><button type="button" class="btn primary" data-act="go-find">Find colors</button></div>`}`;
  }
  $('#view-shortlist').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.act === 'present') openPresent();
    if (t.dataset.act === 'go-find') route('find');
    if (t.dataset.act === 'copy-list') {
      const text = shortlist.map(id => findAny(id)).filter(Boolean).map(c => `${c.name} — ${brandName(c.brand)} ${E.codeLabel(c)} (LRV ${c.lrv})`).join('\n');
      copyText(text, 'List copied');
    }
    if (t.dataset.act === 'clear-list') {
      if (t.dataset.confirm) { shortlist = []; saveShortlist(); updateShortCount(); renderShortlist(); toast('Shortlist cleared'); }
      else { t.dataset.confirm = '1'; t.textContent = 'Tap again to clear'; setTimeout(() => { if (document.contains(t)) { delete t.dataset.confirm; t.textContent = 'Clear'; } }, 3000); }
    }
  });
  function openPresent() {
    const colors = shortlist.map(id => findAny(id)).filter(Boolean); if (!colors.length) return;
    const el = $('#present'); state.presentLight = state.presentLight || 'none';
    el.innerHTML = `<div class="present-strip">${colors.map((c, i) => `<div class="present-col" style="--i:${i};background-color:${paint(c.hex, state.presentLight)}" data-hex="${c.hex}" data-light="${state.presentLight}"><div class="pc-label"><b>${esc(c.name)}</b><span>${esc(brandName(c.brand))} · ${esc(E.codeLabel(c))}</span></div></div>`).join('')}</div>
      <div class="present-bar">${lightBar(state.presentLight, 'present')}<button type="button" class="btn" data-act="close-present">Close</button></div>`;
    el.hidden = false;
    $('[data-act="close-present"]', el).focus();
    el.onclick = e => { const t = e.target.closest('button'); if (t && t.dataset.act === 'close-present') closePresent(); };
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }
  function closePresent() { const el = $('#present'); el.hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }

  // ================================================================
  // PROS & CONS, COMPARE, SHEENS
  // ================================================================
  const currentAnswers = () => (state.results ? state.results.answers : state.answers);
  // Which brand's paint lines to suggest: the store brand when set (any color can be mixed in it), else the color's own brand.
  function lineBrandFor(c) {
    if (settings.storeBrand && E.PAINT_LINES[settings.storeBrand]) return settings.storeBrand;
    return E.PAINT_LINES[c.brand] ? c.brand : null;
  }
  // "Behr Marquee" already names its brand; "Aura" needs "Benjamin Moore" in front
  function lineLabel(brand, line) {
    const bn = brandName(brand);
    return line.name.toLowerCase().startsWith(bn.split(/[ -]/)[0].toLowerCase()) ? line.name : `${bn} ${line.name}`;
  }
  function bestLine(c, answers) {
    const brand = lineBrandFor(c); if (!brand) return null;
    const r = E.recommendLines(brand, c, answers, { lines: settings.lines });
    return r.best ? { brand, r } : null;
  }
  function paintLineHtml(c, answers) {
    const brand = lineBrandFor(c);
    if (!brand) return `<div class="block"><h4>Paint to Use</h4><div class="sample-note"><div>Paint lines for ${esc(brandName(c.brand))} aren’t listed. Set a store brand in settings to see which of your paints to mix this color in.</div></div></div>`;
    const r = E.recommendLines(brand, c, answers, { lines: settings.lines });
    if (!r.best) return `<div class="block"><h4>Paint to Use</h4><div class="sample-note"><div>All ${esc(brandName(brand))} lines for this job are switched off in settings.</div></div></div>`;
    const b = r.best.line;
    const others = r.byTier.filter(x => x.line.id !== b.id);
    return `<div class="block"><h4>Paint to Use</h4>
      <div class="line-card">
        <div class="line-top"><span class="line-name">${esc(lineLabel(brand, b))}</span><span class="tier t${b.tier}">${esc(E.TIERS[b.tier])}</span></div>
        <p>${esc(b.note)}</p>
        ${r.best.why.length ? `<ul class="reasons">${r.best.why.slice(0, 3).map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        ${brand !== c.brand ? `<p class="muted" style="font-size:13px">Mix ${esc(c.name)} (${esc(brandName(c.brand))} ${esc(E.codeLabel(c))}) in this paint with a color match.</p>` : ''}
      </div>
      ${others.length ? `<div class="line-alts">${others.map(x => `<span class="line-alt"><span class="tier t${x.line.tier}">${esc(E.TIERS[x.line.tier])}</span>${esc(x.line.name)}</span>`).join('')}</div>` : ''}
      <p class="muted" style="font-size:12px">Lines and features change; confirm with the current product guide. Turn off lines the store doesn’t carry in settings.</p></div>`;
  }
  function prosConsHtml(c, answers, others) {
    const pc = E.prosCons(c, answers, { inStoreSamples: settings.inStoreSamples }, others);
    return `<div class="block"><h4>Pros &amp; Cons</h4>
      <div class="pc-grid">
        <div class="pc pros"><b>Advantages</b><ul>${pc.pros.map(x => `<li>${esc(x)}</li>`).join('') || '<li>Nothing stands out</li>'}</ul></div>
        <div class="pc cons"><b>Disadvantages</b><ul>${pc.cons.map(x => `<li>${esc(x)}</li>`).join('') || '<li class="none">No problems found for this space</li>'}</ul></div>
      </div>
      ${pc.compared.length ? `<p class="muted" style="font-size:13px">${esc(pc.compared.join(' · '))}</p>` : ''}</div>`;
  }
  const infoEl = () => $('#infoModal');
  function openInfo(html, label) {
    const el = infoEl();
    el.innerHTML = `<div class="modal-card modal-wide" role="document"><div class="modal-head"><h2 id="infoTitle">${esc(label)}</h2><button type="button" class="icon-btn" data-info-close aria-label="Close"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button></div><div class="modal-body">${html}</div></div>`;
    el.hidden = false;
    $('[data-info-close]', el).focus({ preventScroll: true });
  }
  function closeInfo() { infoEl().hidden = true; }

  function openCompare(source) {
    let colors, answers = currentAnswers();
    if (source === 'results' && state.results) colors = state.results.results.map(r => r.color);
    else colors = shortlist.map(id => findAny(id)).filter(Boolean);
    if (colors.length < 2) { toast('Save at least two colors to compare'); return; }
    const sp = E.SPACES[answers.space] || E.SPACES.living;
    const rows = colors.map(c => ({ c, d: C.describe(c.hex, c.lrv), pc: E.prosCons(c, answers, { inStoreSamples: settings.inStoreSamples }, colors) }));
    const cell = (k, f) => `<div class="cmp-k">${k}</div>${rows.map(r => `<div class="cmp-v">${f(r)}</div>`).join('')}`;
    const html = `
      <p class="muted">For ${esc(sp.label.toLowerCase())}${answers.facing && !['unsure', 'none'].includes(answers.facing) ? `, ${esc(answers.facing)} light` : ''}. ${matchMedia('(pointer: coarse)').matches ? 'Swipe' : 'Scroll'} sideways to see every color.</p>
      <div class="cmp-wrap"><div class="cmp" style="--n:${rows.length}">
        <div class="cmp-k"></div>${rows.map(r => `<button type="button" class="cmp-head" data-open="${esc(r.c.id)}"><span class="cmp-sw" data-hex="${r.c.hex}" style="background-color:${paint(r.c.hex)}"></span><b>${esc(r.c.name)}</b><span class="mono">${esc(E.codeLabel(r.c))}</span><span class="muted">${esc(brandName(r.c.brand))}</span></button>`).join('')}
        ${cell('LRV', r => `<span class="mono">${r.c.lrv}</span> · ${esc(r.d.depth)}`)}
        ${cell('Family', r => esc(r.d.familyName))}
        ${cell('Undertone', r => esc(r.d.undertone === 'neutral' ? 'None' : r.d.undertone[0].toUpperCase() + r.d.undertone.slice(1)))}
        ${cell('Compared', r => r.pc.compared.length ? esc(r.pc.compared.join(', ')) : '<span class="muted">In the middle</span>')}
        ${cell('Advantages', r => `<ul class="mini pros">${r.pc.pros.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`)}
        ${cell('Disadvantages', r => r.pc.cons.length ? `<ul class="mini cons">${r.pc.cons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted">None for this space</span>')}
        ${cell('Paint to use', r => { const p = bestLine(r.c, answers); return p ? `<b>${esc(p.r.best.line.name)}</b><br><span class="muted">${esc(brandName(p.brand))} · ${esc(E.TIERS[p.r.best.line.tier])}</span>` : '<span class="muted">No lines listed</span>'; })}
      </div></div>`;
    openInfo(html, `Compare ${colors.length} colors`);
  }

  function openSheens(colorId) {
    const c = E.findColor(colorId) || (state.results && state.results.results[0] && state.results.results[0].color);
    if (!c) return;
    const sp = E.SPACES[currentAnswers().space] || E.SPACES.living;
    const html = `
      <p class="muted">${esc(c.name)} shown in each finish. Higher sheens look slightly richer and darker and clean more easily, but show more wall flaws. Recommended for ${esc(sp.label.toLowerCase())}: <b>${esc(sp.sheen)}</b>.</p>
      <div class="sheen-scale" aria-hidden="true">${E.SHEENS.map(s => `<span class="${sp.sheens.includes(s.id) ? 'on' : ''}">${esc(s.name)}</span>`).join('')}</div>
      <div class="sheen-grid">${E.SHEENS.map((s, i) => `
        <article class="sheen-card ${sp.sheens.includes(s.id) ? 'rec' : ''}" style="--i:${i}">
          <div class="sheen-sw" data-hex="${c.hex}" style="background-color:${paint(c.hex)};--shine:${s.shine}"><span class="sheen-gloss mono">${esc(s.gloss)} gloss</span></div>
          <div class="sheen-body">
            <div class="sheen-title"><b>${esc(s.name)}</b>${sp.sheens.includes(s.id) ? `<span class="badge good">Recommended</span>` : ''}</div>
            <ul class="mini pros">${s.pros.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
            <ul class="mini cons">${s.cons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
            <p class="sheen-best"><span>Best for</span> ${esc(s.best)}</p>
          </div>
        </article>`).join('')}</div>
      <p class="muted" style="font-size:12px">Gloss ranges are typical and vary by brand and product line.</p>`;
    openInfo(html, 'Compare sheens');
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.compare) { openCompare(t.dataset.compare); return; }
    if (t.dataset.sheens) { openSheens(t.dataset.sheens); return; }
    if (t.hasAttribute('data-info-close')) { closeInfo(); return; }
    if (t.dataset.open && t.closest('#infoModal')) closeInfo();
  });
  $('#infoModal').addEventListener('click', e => { if (e.target.id === 'infoModal') closeInfo(); });

  // ================================================================
  // SETTINGS
  // ================================================================
  const sw = (key, on, label, sub) => `<div class="set-row"><div class="set-text"><b id="lbl-${key}">${esc(label)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div><button type="button" class="switch" role="switch" aria-checked="${!!on}" aria-labelledby="lbl-${key}" data-set="${key}"></button></div>`;
  function brandDots(id) {
    const list = (E.getIndex().byBrand[id] || []).filter(c => c.flags & E.F.POPULAR).slice(0, 4);
    const fallback = (E.getIndex().byBrand[id] || []).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 4)) === 0).slice(0, 4);
    return `<span class="brand-dot">${(list.length >= 3 ? list : fallback).map(c => `<i style="background:#${c.hex}"></i>`).join('')}</span>`;
  }
  // a brand's on/off row, plus its color collections (for brands that have them) in a fold-out list
  function collCount(id, cols) { const list = E.collectionsFor(id); return { on: list.filter(x => cols[id + ':' + x.id] !== false).length, all: list.length }; }
  function brandSettingRow(b, en) {
    const colls = E.collectionsFor(b.id);
    const n = collCount(b.id, settings.collections);
    const row = `<div class="set-row brand-row">${brandDots(b.id)}<div class="set-text"><b id="lbl-b-${esc(b.id)}">${esc(b.name)}</b><span>${fmt(b.active != null ? b.active : (E.getIndex().byBrand[b.id] || []).length)} colors · ${esc(b.source || '')}</span></div><button type="button" class="switch" role="switch" aria-checked="${!!en[b.id]}" aria-labelledby="lbl-b-${esc(b.id)}" data-brand="${esc(b.id)}"></button></div>`;
    if (colls.length < 2) return `<div class="brand-item" data-name="${esc(b.name.toLowerCase())}">${row}</div>`;
    return `<div class="brand-item" data-name="${esc(b.name.toLowerCase())} ${esc(colls.map(x => x.label.toLowerCase()).join(' '))}">${row}
      <details class="coll-group"${en[b.id] ? '' : ' hidden'}><summary><span>Color Collections</span><span class="muted" data-coll-count="${esc(b.id)}">${n.on} of ${n.all} on</span></summary>
        ${colls.map(x => `<div class="set-row"><div class="set-text"><b id="lbl-c-${esc(b.id)}-${x.id}">${esc(x.label)}</b><span>${fmt(x.count)} colors${x.note ? ' · ' + esc(x.note) : ''}</span></div><button type="button" class="switch" role="switch" aria-checked="${settings.collections[b.id + ':' + x.id] !== false}" aria-labelledby="lbl-c-${esc(b.id)}-${x.id}" data-coll="${esc(b.id + ':' + x.id)}"></button></div>`).join('')}
      </details></div>`;
  }
  function renderSettings() {
    const el = $('#settingsSheet');
    const en = brandsEnabled();
    const home = settings.audience === 'home';
    const groups = [['us', 'US National Brands'], ['us-more', 'More US Brands'], ['intl', 'International'], ['standard', 'Color Standards'], ['custom', 'Imported']];
    const s = state.screen;
    el.innerHTML = `
      <div class="sheet-head">
        <button type="button" class="icon-btn" data-act="close-settings" aria-label="Close settings"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
        <h2 id="settingsTitle">Settings</h2>
      </div>
      <div class="sheet-body">
        <div class="set-group"><h3>${home ? 'My Brands' : 'Store'}</h3><div class="set-card">
          <div class="set-row"><div class="set-text"><b>Who’s Using It</b><span>${settings.audience === 'kiosk' ? 'Kiosk: big buttons, starts over when left idle. Hold the logo for 3 seconds to open settings.' : home ? 'Simple tips for buying and testing samples' : 'Chip locations and paint lines for the counter'}</span></div>${seg('audience', { store: 'Store Staff', home: 'Homeowner', kiosk: 'Kiosk' }, settings.audience || 'store', 'Who’s using it')}</div>
          <div class="set-row"><div class="set-text"><b>${home ? 'Where You Shop' : 'Store'}</b><span>Sets the brands it usually carries</span></div>${selectHtml('setChain', [['', 'Choose a Store']].concat(Object.entries(CHAINS).filter(([k, ch]) => !ch.other).map(([k, ch]) => [k, ch.label])), settings.chain, 'Store')}</div>
          <div class="set-row"><div class="set-text"><b id="lbl-job-paint">Painting</b><span>Paint colors for walls, trim and the outside</span></div><button type="button" class="switch" role="switch" aria-checked="${jobOn('paint')}" aria-labelledby="lbl-job-paint" data-job-switch="paint"></button></div>
          <div class="set-row"><div class="set-text"><b id="lbl-job-stain">Staining</b><span>Wood stains, shown on real wood</span></div><button type="button" class="switch" role="switch" aria-checked="${jobOn('stain')}" aria-labelledby="lbl-job-stain" data-job-switch="stain"></button></div>
          <div class="set-row"><div class="set-text"><b>${home ? 'Favorite Brand' : 'Store Brand'}</b><span>Shown first and used for top picks</span></div>
            ${selectHtml('setStoreBrand', [['', 'None, Mix Brands']].concat(brandList().map(b => [b.id, b.name])), settings.storeBrand, home ? 'Favorite brand' : 'Store brand')}</div>
          ${sw('storeOnly', settings.storeOnly, home ? 'Only recommend my favorite brand' : 'Only recommend the store brand', 'Other brands still appear as matches')}
          <div class="set-row"><div class="set-text"><b>Colors per Search</b></div>${seg('resultCount', { 3: '3', 6: '6', 9: '9', 12: '12' }, String(settings.resultCount), 'Colors per search')}</div>
        </div></div>

        <div class="set-group"><h3>${home ? 'Samples' : 'In the Store'}</h3><div class="set-card">
          ${sw('inStoreSamples', settings.inStoreSamples, home ? 'Show in-store chip locations' : 'In-store samples', home ? 'Where to find each chip on the store display' : 'Show chip strip locations and display tips')}
          ${sw('showDiscontinued', settings.showDiscontinued, 'Include discontinued colors', 'Older colors many stores can still mix')}
        </div></div>

        <div class="set-group"><h3>Questions &amp; Results</h3><div class="set-card">
          ${sw('askBulbs', settings.askBulbs, 'Ask about light bulbs')}
          ${sw('askFixed', settings.askFixed, 'Ask what’s staying in the room', 'Floors, tile, cabinets, fixtures')}
          ${sw('showWarnings', settings.showWarnings, 'Show warnings')}
          ${sw('showLrv', settings.showLrv, 'Show LRV on chips', 'Light reflectance value, 0 = black, 100 = white')}
          ${sw('showMatches', settings.showMatches, 'Show matches in other brands')}
          ${sw('lightPreview', settings.lightPreview, 'Light preview', 'See colors under north light, bulbs and more')}
        </div></div>

        <div class="set-group"><h3>Screen Accuracy</h3><div class="set-card">
          <div class="screen-info">
            <div><span class="k">Color range</span><span class="v">${esc(s.gamut)}</span></div>
            <div><span class="k">HDR</span><span class="v">${s.hdr ? 'Available' : 'Not detected'}</span></div>
            <div><span class="k">Color depth</span><span class="v mono">${s.depth}-bit</span></div>
            <div><span class="k">Pixel ratio</span><span class="v mono">${s.dpr}×</span></div>
          </div>
          <div class="set-note">Browsers can detect the screen’s color range but not its brightness, color profile or night-light setting. Calibrating adjusts every swatch to this screen.</div>
          ${sw('calEnabled', settings.cal.enabled, 'Use my calibration', settings.cal.enabled ? `Warmth ${settings.cal.warmth}, brightness ${settings.cal.brightness}, vividness ${settings.cal.vividness}` : 'Not calibrated yet')}
          <div class="set-mini"><button type="button" class="btn small primary" data-act="calibrate">Calibrate This Screen</button>${settings.cal.warmth || settings.cal.brightness || settings.cal.vividness ? '<button type="button" class="btn small ghost" data-act="reset-cal">Reset</button>' : ''}</div>
        </div></div>

        <div class="set-group" id="setBrands"><h3>Brands &amp; Collections</h3>
          <p class="set-sub">Paint Brands</p>
          <div class="set-card brand-tools">
            <label class="searchbox brand-find"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input type="search" id="brandFind" placeholder="Find a brand" autocomplete="off" aria-label="Find a brand"></label>
            <div class="set-mini"><button type="button" class="btn small" data-act="brands-all">Turn All On</button><button type="button" class="btn small" data-act="brands-us">US National Only</button></div>
          </div>
          ${groups.map(([g, label]) => { const bs = brandList().filter(b => b.group === g); if (!bs.length) return ''; return `<div class="brand-group" data-group="${g}"><div class="brand-group-head"><p class="eyebrow">${label}</p><span class="spacer"></span><button type="button" class="link-btn" data-brand-group="${g}" data-on="1">All On</button><button type="button" class="link-btn" data-brand-group="${g}" data-on="0">All Off</button></div><div class="set-card">${bs.map(b => brandSettingRow(b, en)).join('')}</div></div>`; }).join('')}
          ${S.brands().length ? `<p class="set-sub">Stain Brands</p>${[['interior', 'Inside'], ['exterior', 'Outside']].map(([use, label]) => { const bs = S.brands().filter(b => b.use === use); if (!bs.length) return ''; return `<div class="brand-group" data-group="stain-${use}"><div class="brand-group-head"><p class="eyebrow">${label}</p></div><div class="set-card">${bs.map(b => `<div class="brand-item" data-name="${esc(b.name.toLowerCase())}"><div class="set-row brand-row">${stainSwatch(b.id)}<div class="set-text"><b id="lbl-s-${esc(b.id)}">${esc(b.name)}</b><span>${fmt(stainCount(b.id))} stain colors · ${esc(b.note || b.source || '')}</span></div><button type="button" class="switch" role="switch" aria-checked="${settings.stainBrands[b.id] !== false}" aria-labelledby="lbl-s-${esc(b.id)}" data-sbrand="${esc(b.id)}"></button></div></div>`).join('')}</div></div>`; }).join('')}` : ''}
          <p class="muted brand-none" hidden>No brand matches that search.</p>
        </div>

        <div class="set-group"><h3>Add Colors</h3><div class="set-card">
          <div class="set-note" style="border-top:0">Import a CSV for any brand not listed. Columns: brand, name, code, hex, and optionally lrv. Example line: <span class="mono">Clark+Kensington, Oat Milk, 23A-2, #E8DFCF, 74</span></div>
          <div class="set-mini"><span class="btn small file-btn">Choose CSV file<input type="file" id="csvInput" accept=".csv,.tsv,.txt,text/csv"></span>${Object.keys(store.get('custom', {})).length ? '<button type="button" class="btn small ghost" data-act="clear-custom">Remove imported</button>' : ''}</div>
        </div></div>

        <div class="set-group"><h3>${home ? 'Paint Lines I’d Buy' : 'Paint Lines the Store Carries'}</h3>
          <div class="set-card"><div class="set-note" style="border-top:0">ColorGenius suggests a line for each job (for example Aura Bath &amp; Spa for a bathroom or Advance for cabinets). ${home ? 'Switch off lines you don’t want suggested.' : 'Switch off lines you don’t stock.'}${settings.storeBrand ? '' : home ? ' Set a favorite brand above to always suggest its paint.' : ' Set a store brand above to always suggest your own paint.'}</div></div>
          ${Object.keys(E.PAINT_LINES).filter(id => E.getIndex().brandById[id] && (en[id] || id === settings.storeBrand)).sort((x, y) => (y === settings.storeBrand) - (x === settings.storeBrand)).map(id => {
            const lines = E.PAINT_LINES[id]; const on = lines.filter(l => settings.lines[l.id] !== false).length;
            return `<details class="set-card line-group" ${id === settings.storeBrand ? 'open' : ''}><summary><span>${esc(brandName(id))}</span><span class="muted">${on} of ${lines.length} on</span></summary>
              ${lines.map(l => `<div class="set-row"><div class="set-text"><b id="lbl-l-${esc(l.id)}">${esc(l.name)}</b><span>${esc(E.TIERS[l.tier])} · ${l.use === 'interior' ? 'Interior' : 'Exterior'} · ${esc(l.note)}</span></div><button type="button" class="switch" role="switch" aria-checked="${settings.lines[l.id] !== false}" aria-labelledby="lbl-l-${esc(l.id)}" data-line="${esc(l.id)}"></button></div>`).join('')}
            </details>`; }).join('')}
        </div>

        <div class="set-group"><h3>Phone App</h3><div class="set-card">
          <div class="set-row"><img src="icons/icon-192.png" width="40" height="40" alt="" style="border-radius:10px;flex:none"><div class="set-text"><b>ColorGenius app</b><span id="installInfo">${esc(INSTALL_STATUS[installState()])}</span></div>
            ${installState() === 'installed' ? '<span class="badge good">Installed</span>' : '<button type="button" class="btn small primary" data-act="install">Get the App</button>'}</div>
        </div></div>

        <div class="set-group"><h3>Appearance</h3><div class="set-card">
          <div class="set-row"><div class="set-text"><b>Theme</b><span>Light mode is best for judging color</span></div>${seg('theme', { system: 'System', light: 'Light', dark: 'Dark' }, settings.theme, 'Theme')}</div>
          ${sw('reduceMotion', settings.reduceMotion, 'Reduce motion')}
        </div></div>

        <div class="set-group"><div class="set-card"><div class="set-mini"><button type="button" class="btn small" data-act="run-setup">Run Setup Again</button><button type="button" class="btn small ghost" data-act="reset-all">Reset All Settings</button></div></div></div>
        <p class="muted" style="font-size:12px">${fmt(E.getIndex().colors.length)} colors loaded from ${brandList().length} brands. Settings, shortlist and calibration are saved on this device only.</p>
      </div>`;
    SELECTS.setChain.onChange = v => {
      settings.chain = v;
      if (chainPreset(v, settings)) { settings.stainBrands = Object.fromEntries(Object.entries(settings.stainBrands).filter(([, on]) => on === false)); toast(`Brands set for ${CHAINS[v].label}`); }
      saveSettings(); keepScroll(el, renderSettings); afterSettingsChange('brands');
    };
    SELECTS.setStoreBrand.onChange = v => {
      settings.storeBrand = v;
      if (settings.storeBrand) settings.brands[settings.storeBrand] = true;
      saveSettings(); renderSettings(); afterSettingsChange();
    };
    $('#csvInput', el).addEventListener('change', importCsv);
  }
  function openSettings() {
    const el = $('#settingsSheet');
    if (!el.hidden) return;
    lastFocus = document.activeElement;
    renderSettings(); showScrim(); el.hidden = false; el.classList.remove('out');
    $('[data-act="close-settings"]', el).focus({ preventScroll: true });
  }
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsSheet').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    const el = $('#settingsSheet');
    if (t.dataset.act === 'close-settings') { closeSheet(el); return; }
    if (t.dataset.set) {
      const k = t.dataset.set; const on = t.getAttribute('aria-checked') !== 'true';
      t.setAttribute('aria-checked', on);
      if (k === 'calEnabled') settings.cal.enabled = on; else settings[k] = on;
      if (k === 'storeOnly' && on && !settings.storeBrand) toast('Choose a store brand above first');
      saveSettings(); applyTheme(); afterSettingsChange(k);
      return;
    }
    if (t.dataset.line) {
      const on = t.getAttribute('aria-checked') !== 'true';
      t.setAttribute('aria-checked', on);
      if (on) delete settings.lines[t.dataset.line]; else settings.lines[t.dataset.line] = false;
      saveSettings();
      const grp = t.closest('details'); if (grp) { const all = $$('[data-line]', grp); $('summary .muted', grp).textContent = `${all.filter(x => x.getAttribute('aria-checked') === 'true').length} of ${all.length} on`; }
      afterSettingsChange('lines'); return;
    }
    if (t.dataset.brand) {
      const on = t.getAttribute('aria-checked') !== 'true';
      t.setAttribute('aria-checked', on); settings.brands[t.dataset.brand] = on; saveSettings();
      const cg = $('.coll-group', t.closest('.brand-item')); if (cg) cg.hidden = !on;
      afterSettingsChange('brands'); return;
    }
    if (t.dataset.jobSwitch) {
      const j = t.dataset.jobSwitch, other = j === 'paint' ? 'stain' : 'paint';
      settings.jobs = Object.assign({ paint: true, stain: true }, settings.jobs);
      if (settings.jobs[j] && !settings.jobs[other]) { toast('Keep painting or staining on'); return; }
      settings.jobs[j] = !settings.jobs[j]; t.setAttribute('aria-checked', settings.jobs[j]);
      saveSettings(); state.answers = freshAnswers(); state.results = null; state.step = 0;
      if (state.view === 'find') renderWizard(0);
      return;
    }
    if (t.dataset.sbrand) {
      const on = t.getAttribute('aria-checked') !== 'true';
      t.setAttribute('aria-checked', on);
      if (on) delete settings.stainBrands[t.dataset.sbrand]; else settings.stainBrands[t.dataset.sbrand] = false;
      saveSettings(); afterSettingsChange('brands'); return;
    }
    if (t.dataset.coll) {
      const on = t.getAttribute('aria-checked') !== 'true';
      t.setAttribute('aria-checked', on);
      if (on) delete settings.collections[t.dataset.coll]; else settings.collections[t.dataset.coll] = false;
      const id = t.dataset.coll.split(':')[0];
      const n = collCount(id, settings.collections);
      if (!n.on) { delete settings.collections[t.dataset.coll]; t.setAttribute('aria-checked', 'true'); toast('Keep at least one collection on, or turn the brand off'); return; }
      saveSettings();
      const cnt = $(`[data-coll-count="${id}"]`, el); if (cnt) cnt.textContent = `${n.on} of ${n.all} on`;
      afterSettingsChange('collections'); return;
    }
    if (t.dataset.brandGroup) {
      const on = t.dataset.on === '1';
      for (const b of brandList()) if (b.group === t.dataset.brandGroup) settings.brands[b.id] = on;
      saveSettings(); keepScroll(el, renderSettings); afterSettingsChange('brands'); return;
    }
    if (t.dataset.seg) {
      const k = t.dataset.seg, v = t.dataset.val;
      $$(`[data-seg="${k}"]`, el).forEach(b => b.setAttribute('aria-pressed', b.dataset.val === v));
      settings[k] = k === 'resultCount' ? +v : v;
      if (k === 'audience') { settings.inStoreSamples = v !== 'home'; applyAudience(); keepScroll(el, renderSettings); }
      saveSettings(); applyTheme(); afterSettingsChange(k); return;
    }
    const act = t.dataset.act;
    if (act === 'install') startInstall();
    if (act === 'run-setup') openOnboarding();
    if (act === 'calibrate') openCal();
    if (act === 'reset-cal') { settings.cal = clone(DEFAULT_SETTINGS.cal); saveSettings(); renderSettings(); refreshSwatches(); toast('Calibration reset'); }
    if (act === 'brands-all') { for (const b of brandList()) settings.brands[b.id] = true; saveSettings(); renderSettings(); afterSettingsChange('brands'); }
    if (act === 'brands-us') { for (const b of brandList()) settings.brands[b.id] = b.group === 'us'; saveSettings(); renderSettings(); afterSettingsChange('brands'); }
    if (act === 'clear-custom') { const custom = store.get('custom', {}); store.set('custom', {}); for (const name of Object.keys(custom)) removeBrand(customMeta(name).id); renderSettings(); afterSettingsChange('brands'); toast('Imported colors removed'); }
    if (act === 'reset-all') {
      if (t.dataset.confirm) { settings = clone(DEFAULT_SETTINGS); saveSettings(); applyTheme(); renderSettings(); afterSettingsChange('all'); toast('Settings reset'); openOnboarding(); }
      else { t.dataset.confirm = '1'; t.textContent = 'Tap again to reset everything'; setTimeout(() => { if (document.contains(t)) { delete t.dataset.confirm; t.textContent = 'Reset all settings'; } }, 3000); }
    }
  });
  // re-render a panel without jumping back to the top
  function keepScroll(el, render) { const body = $('.sheet-body', el); const y = body ? body.scrollTop : 0; render(); const nb = $('.sheet-body', el); if (nb) nb.scrollTop = y; }
  // brand search in settings: filters the rows in place, hides groups with nothing left
  $('#settingsSheet').addEventListener('input', e => {
    if (e.target.id !== 'brandFind') return;
    const q = e.target.value.trim().toLowerCase();
    let any = false;
    $$('#setBrands .brand-group').forEach(g => {
      let n = 0;
      $$('.brand-item', g).forEach(it => { const hit = !q || it.dataset.name.includes(q); it.hidden = !hit; if (hit) n++; });
      g.hidden = !n; if (n) any = true;
    });
    $('#setBrands .brand-none').hidden = any;
  });
  function removeBrand(id) {
    const idx = E.getIndex();
    idx.brands = idx.brands.filter(b => b.id !== id); delete idx.brandById[id];
    idx.colors = idx.colors.filter(c => c.brand !== id); delete idx.byBrand[id];
  }
  function afterSettingsChange(key) {
    state.stylePalettes = {};
    if (state.results) { state.results = state.results.kind === 'stain' ? S.recommend(state.results.answers, stainSettings()) : E.recommend(state.results.answers, engineSettings()); }
    if (state.view === 'find') { if (state.results) renderResults(false); else rerenderStep(); }
    if (state.view === 'lookup') { const p = $('.lookup-hint'); if (p) renderLookup(); }
    if (state.view === 'shortlist') renderShortlist();
    if (key === 'calEnabled' || key === 'all') refreshSwatches();
    if (!$('#detailSheet').hidden && state.detailId) openDetail(state.detailId, false);
    updateShortCount();
  }
  function importCsv(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = E.parseCustomCsv(reader.result);
      const names = Object.keys(parsed.brands);
      if (!names.length) { toast(parsed.errors[0] || 'No colors found in that file'); return; }
      const custom = store.get('custom', {});
      let total = 0;
      for (const n of names) { custom[n] = parsed.brands[n]; total += E.addBrand(customMeta(n), parsed.brands[n]); settings.brands[customMeta(n).id] = true; }
      const saved = store.set('custom', custom); saveSettings();
      renderSettings(); afterSettingsChange('brands');
      toast(`Imported ${fmt(total)} colors${saved ? '' : ' (this device couldn’t save them; they last until the page closes)'}`);
    };
    reader.readAsText(file);
  }
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'light' || settings.theme === 'dark') root.setAttribute('data-theme', settings.theme); else root.removeAttribute('data-theme');
    root.classList.toggle('reduce-motion', !!settings.reduceMotion);
  }

  // ================================================================
  // CALIBRATION
  // ================================================================
  let calDraft = null, calStep = 0, calRef = null;
  function openCal() {
    calDraft = Object.assign({}, settings.cal, { enabled: true });
    calStep = 0;
    calRef = settings.cal.ref ? E.findColor(settings.cal.ref) : (E.search('Agreeable Gray')[0] || {}).color || E.getIndex().colors[0];
    renderCal(); $('#calModal').hidden = false;
  }
  function closeCal() { $('#calModal').hidden = true; }
  function calSlider(key, label, min, max, left, right) {
    return `<div class="slider"><label for="cal-${key}">${label}<span id="calv-${key}">${calDraft[key] > 0 ? '+' : ''}${calDraft[key]}</span></label><input type="range" class="cg-range" id="cal-${key}" min="${min}" max="${max}" step="1" value="${calDraft[key]}" data-cal="${key}" style="--fill:${((calDraft[key] - min) / (max - min) * 100).toFixed(1)}%"><div class="ends"><span>${left}</span><span>${right}</span></div></div>`;
  }
  function renderCal() {
    const el = $('#calModal');
    const s = state.screen;
    const stepsHtml = `<div class="cal-steps">${[0, 1, 2, 3].map(i => `<i class="${i <= calStep ? 'on' : ''}"></i>`).join('')}</div>`;
    let body = '';
    if (calStep === 0) body = `
      <h2 id="calTitle" style="font-size:22px">Calibrate This Screen</h2>
      <p class="muted">Takes about a minute. You’ll match the screen to a sheet of white paper, then to a real paint chip.</p>
      <div class="set-card"><div class="screen-info">
        <div><span class="k">Color range</span><span class="v">${esc(s.gamut)}</span></div><div><span class="k">HDR</span><span class="v">${s.hdr ? 'Available' : 'Not detected'}</span></div>
        <div><span class="k">Color depth</span><span class="v mono">${s.depth}-bit</span></div><div><span class="k">Screen</span><span class="v mono">${esc(s.size)}</span></div></div></div>
      <ul class="reasons"><li>Turn off Night Light, True Tone, or any blue-light filter.</li><li>Set screen brightness to where you normally use it.</li><li>Do this where colors get picked, under the store’s lights.</li></ul>`;
    if (calStep === 1) body = `
      <h2 id="calTitle" style="font-size:22px">Match White Paper</h2>
      <p class="muted">Hold plain white printer paper against the panel. Slide until the panel looks like the paper.</p>
      <div class="cal-panels"><div class="cal-panel" id="calWhite"><span>Adjusted white</span></div><div class="cal-panel" data-hex="F2F1EC" id="calOff" style="background:#F2F1EC"><span>Original screen</span></div></div>
      ${calSlider('warmth', 'Warmth', -100, 100, 'Panel looks too yellow', 'Panel looks too blue')}
      ${calSlider('brightness', 'Brightness', -50, 20, 'Panel glows brighter', 'Panel looks dimmer')}`;
    if (calStep === 2) body = `
      <h2 id="calTitle" style="font-size:22px">Match a Real Chip</h2>
      <p class="muted">Grab any chip from the display, find it here, and hold it next to the screen.</p>
      <div class="searchbox"><input type="search" id="calSearch" aria-label="Find the chip" placeholder="Name or code of the chip in your hand" autocomplete="off"></div>
      <div class="list" id="calHits"></div>
      <div class="cal-panels"><div class="cal-panel" id="calChip"><span id="calChipName">${esc(calRef ? calRef.name + ' · ' + E.codeLabel(calRef) : '')}</span></div><div class="cal-panel" id="calChipOff"><span>Original screen</span></div></div>
      ${calSlider('vividness', 'Vividness', -50, 50, 'Screen looks too strong', 'Screen looks too dull')}
      ${calSlider('warmth', 'Warmth', -100, 100, 'Too yellow', 'Too blue')}
      ${calSlider('brightness', 'Brightness', -50, 20, 'Too bright', 'Too dark')}`;
    if (calStep === 3) {
      const samples = ['Agreeable Gray', 'Naval', 'White Dove', 'Hale Navy', 'Evergreen Fog', 'Swiss Coffee'].map(n => (E.search(n)[0] || {}).color).filter(Boolean).slice(0, 4);
      body = `
      <h2 id="calTitle" style="font-size:22px">Done</h2>
      <p class="muted">Here’s the difference on a few colors. You can turn calibration on or off any time in settings.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px">${samples.map(c => `<div class="set-card"><div style="display:grid;grid-template-columns:1fr 1fr;height:70px"><span style="background:#${c.hex}"></span><span style="background:${C.displayCss(c.hex, { cal: calDraft, p3: s.p3 })}"></span></div><div class="set-note" style="border-top:0">${esc(c.name)}<br><span class="mono">before · after</span></div></div>`).join('')}</div>`;
    }
    el.innerHTML = `<div class="modal-card"><div class="modal-body">${stepsHtml}${body}
      <div class="step-foot" style="margin-top:6px">
        <button type="button" class="btn ghost" data-cal-act="cancel">Cancel</button><span class="spacer"></span>
        ${calStep > 0 ? '<button type="button" class="btn" data-cal-act="back">Back</button>' : ''}
        ${calStep === 2 ? '<button type="button" class="btn ghost" data-cal-act="next">Skip</button>' : ''}
        <button type="button" class="btn primary" data-cal-act="${calStep === 3 ? 'save' : 'next'}">${calStep === 3 ? 'Save calibration' : calStep === 0 ? 'Start' : 'Next'}</button>
      </div></div></div>`;
    paintCal();
    const search = $('#calSearch', el);
    if (search) search.addEventListener('input', () => {
      const hits = E.search(search.value, { limit: 5, brands: brandsEnabled() });
      $('#calHits', el).innerHTML = hits.map((r, i) => `<button type="button" class="row" data-cal-pick="${esc(r.color.id)}" style="--i:${i}"><span class="sw" style="background:#${r.color.hex}"></span><span class="row-main"><span class="row-name">${esc(r.color.name)}</span><span class="row-sub">${esc(brandName(r.color.brand))} · ${esc(E.codeLabel(r.color))}</span></span><span></span></button>`).join('');
    });
    const first = $('button.primary', el); if (first) first.focus({ preventScroll: true });
  }
  function paintCal() {
    const el = $('#calModal');
    const w = $('#calWhite', el); if (w) w.style.backgroundColor = C.displayCss('FFFFFF', { cal: calDraft, p3: state.screen.p3 });
    const off = $('#calOff', el); if (off) off.style.backgroundColor = '#FFFFFF';
    if (calRef) {
      const ch = $('#calChip', el); if (ch) ch.style.backgroundColor = C.displayCss(calRef.hex, { cal: calDraft, p3: state.screen.p3 });
      const o2 = $('#calChipOff', el); if (o2) o2.style.backgroundColor = '#' + calRef.hex;
    }
  }
  $('#calModal').addEventListener('input', e => {
    const k = e.target.dataset.cal; if (!k) return;
    calDraft[k] = +e.target.value;
    $$(`[data-cal="${k}"]`).forEach(i => { if (i !== e.target) i.value = calDraft[k]; i.style.setProperty('--fill', ((calDraft[k] - +i.min) / (+i.max - +i.min) * 100).toFixed(1) + '%'); });
    const v = $('#calv-' + k); if (v) v.textContent = (calDraft[k] > 0 ? '+' : '') + calDraft[k];
    paintCal();
  });
  $('#calModal').addEventListener('click', e => {
    if (e.target.id === 'calModal') { closeCal(); return; }
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.calPick) { calRef = E.findColor(t.dataset.calPick); $('#calChipName').textContent = calRef.name + ' · ' + E.codeLabel(calRef); $('#calHits').innerHTML = ''; paintCal(); return; }
    const a = t.dataset.calAct;
    if (a === 'cancel') closeCal();
    if (a === 'back') { calStep--; renderCal(); }
    if (a === 'next') { calStep++; renderCal(); }
    if (a === 'save') {
      settings.cal = Object.assign({}, calDraft, { enabled: true, ref: calRef ? calRef.id : '' });
      saveSettings(); closeCal(); refreshSwatches(); if (!$('#settingsSheet').hidden) renderSettings();
      if (!$('#detailSheet').hidden) updateRoomScene();
      toast('Calibration saved and turned on');
    }
  });

  // ================================================================
  // FIRST-LAUNCH SETUP: who's using this device, brands, screen tuning
  // Runs once per device (and once after this update for existing users, with their choices filled in).
  // ================================================================
  let ob = null;
  // What the big chains usually carry. A starting point: every brand can still be switched on or off below it.
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
  // a chain's brands, written into a brand map (paint) and a stain-brand map
  function chainPreset(id, target) {
    const ch = CHAINS[id]; if (!ch || ch.other) return false;
    for (const b of brandList()) target.brands[b.id] = ch.paint.includes(b.id);
    for (const b of S.brands()) target.stainBrands[b.id] = ch.stain.includes(b.id);
    target.storeBrand = ch.main && E.getIndex().brandById[ch.main] ? ch.main : '';
    return true;
  }
  const chainBrandNames = ch => ch.paint.map(id => (E.getIndex().brandById[id] || {}).name).filter(Boolean).concat(ch.stain.map(id => S.brandName(id))).join(', ');
  function stainSwatch(id) {
    const hx = S.all().filter(x => x.brand === id).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 4)) === 0).slice(0, 4).map(x => '#' + x.hex);
    while (hx.length < 4) hx.push('#b58a5c');
    return `<span class="msw" style="background:conic-gradient(${hx[0]} 0 25%, ${hx[1]} 0 50%, ${hx[2]} 0 75%, ${hx[3]} 0)"></span>`;
  }
  const stainCount = id => S.all().filter(x => x.brand === id).length;
  const obHasCarry = id => E.collectionsFor(id).length > 1 || (ob && ob.audience !== 'home' && (E.PAINT_LINES[id] || []).length > 1);
  const obCarryBrands = () => brandList().filter(b => ob.brands[b.id] && obHasCarry(b.id)).sort((x, y) => (y.id === ob.storeBrand) - (x.id === ob.storeBrand));
  const obSteps = () => ['who', 'store', 'brands', ob && obCarryBrands().length ? 'carry' : '', 'screen', 'done'].filter(Boolean);
  const obStep = id => `<p class="eyebrow">Step ${obSteps().indexOf(id)} of ${obSteps().length - 2}</p>`;
  const OB_GROUPS = [['us', 'US National Brands'], ['us-more', 'More US Brands'], ['intl', 'International'], ['standard', 'Color Standards'], ['custom', 'Imported']];
  function brandSwatch(id) {
    const list = (E.getIndex().byBrand[id] || []).filter(c => c.flags & E.F.POPULAR);
    const pool = list.length >= 4 ? list : (E.getIndex().byBrand[id] || []).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 4)) === 0);
    const hx = pool.slice(0, 4).map(c => '#' + c.hex);
    while (hx.length < 4) hx.push('#ddd');
    return `<span class="msw" style="background:conic-gradient(${hx[0]} 0 25%, ${hx[1]} 0 50%, ${hx[2]} 0 75%, ${hx[3]} 0)"></span>`;
  }
  function openOnboarding() {
    ob = {
      step: 0, dir: 0, audience: settings.audience || '', brands: Object.assign({}, brandsEnabled()), storeBrand: settings.storeBrand || '', find: '',
      collections: Object.assign({}, settings.collections), lines: Object.assign({}, settings.lines),
      chain: settings.chain || '', jobs: Object.assign({ paint: true, stain: true }, settings.jobs), stainBrands: Object.fromEntries(S.brands().map(b => [b.id, settings.stainBrands[b.id] !== false])),
      cal: { warmth: settings.cal.warmth || 0, brightness: settings.cal.brightness || 0 }, calTouched: false,
    };
    closeSheet($('#detailSheet')); closeSheet($('#settingsSheet'));
    const el = $('#onboard'); el.innerHTML = ''; el.hidden = false; el.classList.remove('out');
    document.documentElement.classList.add('ob-open');
    renderOnboarding();
  }
  function closeOnboarding() {
    const el = $('#onboard');
    document.documentElement.classList.remove('ob-open');
    if (reduced()) el.hidden = true; else { el.classList.add('out'); setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 320); }
    ob = null;
  }
  function obSlider(key, label, min, max, left, right) {
    const v = ob.cal[key];
    return `<div class="slider"><label for="ob-${key}">${label}<span id="obv-${key}">${v > 0 ? '+' : ''}${v}</span></label><input type="range" class="cg-range" id="ob-${key}" min="${min}" max="${max}" step="1" value="${v}" data-obcal="${key}" style="--fill:${((v - min) / (max - min) * 100).toFixed(1)}%"><div class="ends"><span>${left}</span><span>${right}</span></div></div>`;
  }
  function renderOnboarding() {
    const el = $('#onboard');
    const id = obSteps()[ob.step];
    const home = ob.audience === 'home';
    const chosen = brandList().filter(b => ob.brands[b.id]);
    let body = '', next = 'Next', nextOff = false, skip = '';
    if (id === 'who') {
      body = `
        <p class="eyebrow">Welcome</p>
        <h1 id="obTitle">Let’s Set Up ColorGenius</h1>
        <p class="muted">About a minute. Everything can be changed later in Settings.</p>
        <div class="ob-cards">
          <button type="button" class="ob-card" data-ob-aud="store" aria-pressed="${ob.audience === 'store'}">
            <span class="ob-ic" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30"><path d="M5 13l2-7h18l2 7M5 13v13h22V13M5 13h22M13 26v-7h6v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></span>
            <b>I Work at a Paint Store</b><span>Picks from the brands we carry, with chip locations and paint lines for the counter.</span></button>
          <button type="button" class="ob-card" data-ob-aud="home" aria-pressed="${ob.audience === 'home'}">
            <span class="ob-ic" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30"><path d="M5 15L16 6l11 9M8 13v13h16V13M13 26v-7h6v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></span>
            <b>I’m Picking Paint for My Home</b><span>Picks from the brands I want to buy, with simple tips for testing samples.</span></button>
          <button type="button" class="ob-card" data-ob-aud="kiosk" aria-pressed="${ob.audience === 'kiosk'}">
            <span class="ob-ic" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30"><rect x="6" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 20v6M11 27h10M13 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <b>Touch-Screen Kiosk in a Store</b><span>Big buttons for shoppers. Starts over by itself when left alone.</span></button>
        </div>`;
      nextOff = !ob.audience;
    }
    if (id === 'store') {
      const kiosk = ob.audience === 'kiosk';
      body = `
        ${obStep('store')}
        <h1 id="obTitle">${home ? 'Where will you shop?' : kiosk ? 'Which store is this kiosk in?' : 'Where do you work?'}</h1>
        <p class="muted">This turns on the brands that store usually carries. You can change any of them on the next screen.</p>
        <div class="chain-opts">${Object.entries(CHAINS).map(([k, ch]) => `<button type="button" class="chain-opt" data-ob-chain="${k}" aria-pressed="${ob.chain === k}">${check}<b>${esc(ch.label)}</b><span>${ch.other ? 'Pick the brands yourself' : esc(chainBrandNames(ch))}</span></button>`).join('')}</div>
        <div class="group mgroup">
          <p class="group-label">${home ? 'What are you working on?' : 'What does the store help with?'} <span class="hint">turn off what you don’t need</span></p>
          <div class="job-toggles">
            <button type="button" class="job-toggle" data-ob-job="paint" aria-pressed="${ob.jobs.paint}">${check}<b>Painting</b><span>Walls, trim, cabinets, outside</span></button>
            <button type="button" class="job-toggle" data-ob-job="stain" aria-pressed="${ob.jobs.stain}">${check}<b>Staining</b><span>Floors, furniture, decks, fences</span></button>
          </div>
        </div>`;
      nextOff = !ob.chain;
    }
    if (id === 'brands') {
      const paintOn = brandList().filter(b => ob.brands[b.id]).length;
      const sb = S.brands();
      const stainOn = sb.filter(b => ob.stainBrands[b.id]).length;
      const groupHtml = ([g, label]) => { const bs = brandList().filter(b => b.group === g); if (!bs.length) return ''; const on = bs.filter(b => ob.brands[b.id]).length; return `<div class="group mgroup ob-group" data-group="${g}"><div class="group-head"><p class="group-label">${label} <span class="hint">${on} of ${bs.length}</span></p><span class="spacer"></span><button type="button" class="link-btn" data-ob-group="${g}" data-on="${on === bs.length ? 0 : 1}">${on === bs.length ? 'None' : 'All'}</button></div><div class="mchips">${bs.map(b => `<button type="button" class="mchip" data-ob-brand="${esc(b.id)}" data-name="${esc(b.name.toLowerCase())}" aria-pressed="${!!ob.brands[b.id]}">${brandSwatch(b.id)}${esc(b.name)}</button>`).join('')}</div></div>`; };
      const stainGroup = (use, label) => { const bs = sb.filter(b => b.use === use); if (!bs.length) return ''; return `<div class="group mgroup ob-group" data-group="stain-${use}"><div class="group-head"><p class="group-label">${label}</p></div><div class="mchips">${bs.map(b => `<button type="button" class="mchip" data-ob-sbrand="${esc(b.id)}" data-name="${esc(b.name.toLowerCase())}" aria-pressed="${!!ob.stainBrands[b.id]}">${stainSwatch(b.id)}${esc(b.name)}<span class="mchip-n">${fmt(stainCount(b.id))}</span></button>`).join('')}</div></div>`; };
      const ch = CHAINS[ob.chain];
      body = `
        ${obStep('brands')}
        <h1 id="obTitle">${home ? 'Which brands would you buy?' : 'Which brands does the store carry?'}</h1>
        <p class="muted">${ch && !ch.other ? `Set for ${esc(ch.label)}. Brands that are off still show here, so you can turn on anything else the store has.` : 'Picks only come from the brands that are on. Colors from other brands can still be matched into them.'}</p>
        <label class="searchbox ob-find"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input type="search" id="obFind" placeholder="Find a brand" autocomplete="off" aria-label="Find a brand" value="${esc(ob.find)}"></label>
        ${ob.jobs.paint ? `<section class="ob-section" aria-labelledby="obPaintH">
          <div class="ob-section-head"><h2 id="obPaintH">Paint Brands</h2><span class="ob-count">${paintOn} of ${brandList().length} on</span><span class="spacer"></span><button type="button" class="link-btn" data-ob="all-us">US National</button><button type="button" class="link-btn" data-ob="none">Clear</button></div>
          ${OB_GROUPS.map(groupHtml).join('')}
        </section>` : ''}
        ${ob.jobs.stain && sb.length ? `<section class="ob-section" aria-labelledby="obStainH">
          <div class="ob-section-head"><h2 id="obStainH">Stain Brands</h2><span class="ob-count">${stainOn} of ${sb.length} on</span><span class="spacer"></span><button type="button" class="link-btn" data-ob-sall="1">All</button><button type="button" class="link-btn" data-ob-sall="0">None</button></div>
          ${stainGroup('interior', 'Inside: Floors, Cabinets, Furniture')}${stainGroup('exterior', 'Outside: Decks, Fences, Siding')}
        </section>` : ''}
        <p class="muted ob-nofind" hidden>No brand matches that search.</p>
        ${ob.jobs.paint && chosen.length ? `<section class="ob-section ob-main"><div class="ob-section-head"><h2>${home ? 'Favorite Paint Brand' : 'Main Paint Brand'}</h2><span class="hint">optional, shown first</span></div><div class="mchips">
          <button type="button" class="mchip" data-ob-main="" aria-pressed="${!ob.storeBrand}"><span class="msw flag-sw" aria-hidden="true"><svg viewBox="0 0 20 20" width="14" height="14"><path d="M5 10h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>No ${home ? 'favorite' : 'main brand'}</button>
          ${chosen.map(b => `<button type="button" class="mchip" data-ob-main="${esc(b.id)}" aria-pressed="${ob.storeBrand === b.id}">${brandSwatch(b.id)}${esc(b.name)}</button>`).join('')}
        </div></section>` : ''}
        ${ob.jobs.paint && !chosen.length ? '<p class="ob-need">Turn on at least one paint brand to continue.</p>' : ''}`;
      nextOff = ob.jobs.paint && !chosen.length;
    }
    if (id === 'carry') {
      const bs = obCarryBrands();
      body = `
        ${obStep('carry')}
        <h1 id="obTitle">${home ? 'Anything to leave out?' : 'What does your store carry?'}</h1>
        <p class="muted">${home ? 'Everything is on. Turn off any collection you don’t want picks from.' : 'Everything is on. Tap to turn off any color collection or paint line you don’t have, and picks will skip it.'}</p>
        ${bs.map(b => {
          const colls = E.collectionsFor(b.id); const lines = home ? [] : (E.PAINT_LINES[b.id] || []);
          return `<div class="ob-carry">
            <div class="ob-carry-head">${brandSwatch(b.id)}<b>${esc(b.name)}</b></div>
            ${colls.length > 1 ? `<p class="group-label">Color Collections</p><div class="mchips">${colls.map(x => `<button type="button" class="mchip" data-ob-coll="${esc(b.id + ':' + x.id)}" aria-pressed="${ob.collections[b.id + ':' + x.id] !== false}" title="${esc(x.note)}">${esc(x.short)}<span class="mchip-n">${fmt(x.count)}</span></button>`).join('')}</div>` : ''}
            ${lines.length > 1 ? `<p class="group-label">Paint Lines</p><div class="mchips">${lines.map(l => `<button type="button" class="mchip" data-ob-line="${esc(l.id)}" aria-pressed="${ob.lines[l.id] !== false}">${esc(l.name)}${l.use === 'exterior' ? '<span class="mchip-n">Exterior</span>' : ''}</button>`).join('')}</div>` : ''}
          </div>`; }).join('')}
        <p class="muted" style="font-size:13px">Change these any time in Settings → Brands &amp; collections.</p>`;
      skip = 'Skip';
    }
    if (id === 'screen') {
      const s = state.screen;
      body = `
        ${obStep('screen')}
        <h1 id="obTitle">Tune This Screen</h1>
        <p class="muted">Screens show color differently. Hold plain white printer paper against the panel and slide until they look the same.</p>
        <p class="ob-screen"><span class="badge">${esc(s.gamut)}</span>${s.hdr ? '<span class="badge">HDR</span>' : ''}<span class="badge mono">${s.depth}-bit</span></p>
        <div class="ob-cal-panel" id="obWhite"><span>Match this to white paper</span></div>
        ${obSlider('warmth', 'Warmth', -100, 100, 'Panel looks too yellow', 'Panel looks too blue')}
        ${obSlider('brightness', 'Brightness', -50, 20, 'Panel glows brighter', 'Panel looks dimmer')}
        <ul class="reasons"><li>Turn off Night Light, True Tone or any blue-light filter first.</li><li>Use your normal screen brightness.</li><li>${home ? 'Do this where you’ll be looking at colors.' : 'Do this under the store’s lights, where colors get picked.'}</li></ul>
        <p class="muted" style="font-size:13px">You can match a real paint chip too, later in Settings → Calibrate this screen.</p>`;
      skip = 'Skip';
    }
    if (id === 'done') {
      const st = installState();
      const names = chosen.map(b => b.name);
      body = `
        <div class="ob-done-mark" aria-hidden="true"><span class="fan"><i></i><i></i><i></i></span></div>
        <h1 id="obTitle">You’re All Set</h1>
        <div class="set-card ob-summary">
          <div class="set-row"><div class="set-text"><b>${ob.audience === 'kiosk' ? 'Store kiosk' : home ? 'Picking paint for a home' : 'Paint store'}</b><span>${ob.audience === 'kiosk' ? 'Starts over after 2 minutes idle. Hold the logo for 3 seconds to open settings.' : home ? 'Tips for buying and testing samples' : 'Chip locations and paint lines for the counter'}</span></div></div>
          <div class="set-row"><div class="set-text"><b>${ob.chain && !CHAINS[ob.chain].other ? esc(CHAINS[ob.chain].label) : 'Your own brand list'}</b><span>${[ob.jobs.paint ? 'Painting' : '', ob.jobs.stain ? 'Staining' : ''].filter(Boolean).join(' and ')}${ob.jobs.stain ? ` · ${S.brands().filter(b => ob.stainBrands[b.id]).map(b => b.name).join(', ') || 'no stain brands'}` : ''}</span></div></div>
          <div class="set-row"><div class="set-text"><b>${names.length} paint brand${names.length > 1 ? 's' : ''}</b><span>${esc(names.slice(0, 4).join(', '))}${names.length > 4 ? ` and ${names.length - 4} more` : ''}</span></div></div>
          <div class="set-row"><div class="set-text"><b>${ob.storeBrand ? esc(brandName(ob.storeBrand)) : home ? 'No favorite brand' : 'No main brand'}</b><span>${ob.storeBrand ? (home ? 'Your favorite, shown first' : 'Your main brand, shown first') : 'Picks mix all your brands'}</span></div></div>
          <div class="set-row"><div class="set-text"><b>${ob.calTouched && (ob.cal.warmth || ob.cal.brightness) ? 'Screen tuned' : 'Screen not tuned'}</b><span>${ob.calTouched && (ob.cal.warmth || ob.cal.brightness) ? `Warmth ${ob.cal.warmth}, brightness ${ob.cal.brightness}` : 'You can tune it any time in Settings'}</span></div></div>
        </div>
        ${ob.audience !== 'kiosk' && (st === 'prompt' || st === 'ios' || st === 'android') ? `<div class="sample-note ob-install"><img src="icons/icon-192.png" width="44" height="44" alt="" style="border-radius:11px"><div><b>Put ColorGenius on your home screen</b><br><span class="muted">Opens full screen like an app and works offline.</span></div><button type="button" class="btn small" data-ob="install">Get the App</button></div>` : ''}`;
      next = 'Start Finding Colors';
    }
    // the bottom bar is built once and only updated, so it stays put between steps
    if (!$('.ob-nav', el)) el.innerHTML = `<div class="ob-shell" id="obShell"></div>
      <nav class="wizard-nav ob-nav" aria-label="Setup navigation"><div class="wizard-nav-inner">
        <button type="button" class="btn ghost nav-back" data-ob="back"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>Back</button>
        <span class="spacer"></span>
        <button type="button" class="btn ghost nav-skip" data-ob="skip">Skip</button>
        <button type="button" class="btn primary nav-next" data-ob="next"><span class="nav-next-label">Next</span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></nav>`;
    $('#obShell').innerHTML = `
        <div class="ob-top">
          <span class="wordmark ob-mark" aria-hidden="true"><span class="fan"><i></i><i></i><i></i></span><span class="wordmark-text">ColorGenius</span></span>
          <div class="ob-dots" aria-hidden="true">${obSteps().map((s, i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('')}</div>
          ${id !== 'done' ? '<button type="button" class="btn small ghost" data-ob="skip-setup">Skip Setup</button>' : '<span></span>'}
        </div>
        <div class="ob-body" id="obBody">${body}</div>`;
    const nb = $('.ob-nav [data-ob="back"]'), ns = $('.ob-nav [data-ob="skip"]'), nn = $('.ob-nav [data-ob="next"]');
    nb.disabled = ob.step === 0; nb.style.visibility = ob.step === 0 ? 'hidden' : '';
    ns.disabled = !skip; ns.style.visibility = skip ? '' : 'hidden'; ns.tabIndex = skip ? 0 : -1; ns.textContent = skip || 'Skip';
    nn.disabled = nextOff; $('.nav-next-label', nn).textContent = next;
    const b = $('#obBody');
    if (ob.dir && !reduced()) b.animate([{ opacity: 0, transform: `translateX(${ob.dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    ob.dir = 0;
    el.scrollTo(0, 0);
    if (id === 'screen') paintObPanel();
    if (id === 'brands') obFilter();
  }
  function paintObPanel() {
    const p = $('#obWhite'); if (!p) return;
    p.style.backgroundColor = C.displayCss('FFFFFF', { cal: { enabled: true, warmth: ob.cal.warmth, brightness: ob.cal.brightness, vividness: 0 }, p3: state.screen.p3 });
  }
  function obGo(delta) { ob.step = Math.max(0, Math.min(obSteps().length - 1, ob.step + delta)); ob.dir = delta > 0 ? 1 : -1; renderOnboarding(); }
  function finishOnboarding(skipped) {
    if (!skipped) {
      settings.audience = ob.audience || 'store';
      for (const b of brandList()) settings.brands[b.id] = !!ob.brands[b.id];
      settings.collections = ob.collections; settings.lines = ob.lines;
      settings.chain = ob.chain === 'other' ? '' : ob.chain; settings.jobs = ob.jobs;
      settings.stainBrands = Object.fromEntries(S.brands().filter(b => !ob.stainBrands[b.id]).map(b => [b.id, false]));
      settings.storeBrand = ob.storeBrand && ob.brands[ob.storeBrand] ? ob.storeBrand : '';
      if (!settings.storeBrand) settings.storeOnly = false;
      settings.inStoreSamples = settings.audience !== 'home';
      if (ob.calTouched) settings.cal = Object.assign({}, settings.cal, { warmth: ob.cal.warmth, brightness: ob.cal.brightness, enabled: !!(ob.cal.warmth || ob.cal.brightness || settings.cal.vividness) });
    } else if (!settings.audience) settings.audience = 'store';
    settings.onboarded = true;
    state.answers = freshAnswers(); state.results = null; state.step = 0;
    saveSettings(); applyTheme(); applyAudience(); afterSettingsChange('all');
    closeOnboarding();
    if (!skipped) toast(settings.audience === 'home' ? 'All set. Happy painting!' : settings.audience === 'kiosk' ? 'Kiosk ready' : 'All set for the counter');
  }
  $('#onboard').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !ob) return;
    if (t.dataset.obAud) { ob.audience = t.dataset.obAud; $$('[data-ob-aud]').forEach(x => x.setAttribute('aria-pressed', x.dataset.obAud === ob.audience)); const n = $('[data-ob="next"]'); n.disabled = false; setTimeout(() => { if (ob && obSteps()[ob.step] === 'who') obGo(1); }, 260); return; }
    if (t.dataset.obChain) {
      ob.chain = t.dataset.obChain;
      chainPreset(ob.chain, ob);
      $$('[data-ob-chain]').forEach(x => x.setAttribute('aria-pressed', x.dataset.obChain === ob.chain));
      $('.ob-nav [data-ob="next"]').disabled = false;
      return;
    }
    if (t.dataset.obJob) {
      const j = t.dataset.obJob, other = j === 'paint' ? 'stain' : 'paint';
      if (ob.jobs[j] && !ob.jobs[other]) { toast('Keep painting or staining on'); return; }
      ob.jobs[j] = !ob.jobs[j]; t.setAttribute('aria-pressed', ob.jobs[j]); return;
    }
    if (t.dataset.obSbrand) { const id = t.dataset.obSbrand; ob.stainBrands[id] = !ob.stainBrands[id]; const y = $('#onboard').scrollTop; renderOnboarding(); $('#onboard').scrollTop = y; return; }
    if (t.dataset.obSall) { for (const b of S.brands()) ob.stainBrands[b.id] = t.dataset.obSall === '1'; const y = $('#onboard').scrollTop; renderOnboarding(); $('#onboard').scrollTop = y; return; }
    if (t.dataset.obBrand) { const id = t.dataset.obBrand; ob.brands[id] = !ob.brands[id]; if (!ob.brands[id] && ob.storeBrand === id) ob.storeBrand = ''; const y = $('#onboard').scrollTop; renderOnboarding(); $('#onboard').scrollTop = y; return; }
    if (t.dataset.obGroup) { for (const b of brandList()) if (b.group === t.dataset.obGroup) ob.brands[b.id] = t.dataset.on === '1'; if (ob.storeBrand && !ob.brands[ob.storeBrand]) ob.storeBrand = ''; const y = $('#onboard').scrollTop; renderOnboarding(); $('#onboard').scrollTop = y; return; }
    if (t.dataset.obColl) {
      const k = t.dataset.obColl, id = k.split(':')[0];
      if (ob.collections[k] === false) delete ob.collections[k]; else ob.collections[k] = false;
      if (!collCount(id, ob.collections).on) { delete ob.collections[k]; toast('Keep at least one collection on'); return; }
      t.setAttribute('aria-pressed', ob.collections[k] !== false); return;
    }
    if (t.dataset.obLine) { const k = t.dataset.obLine; if (ob.lines[k] === false) delete ob.lines[k]; else ob.lines[k] = false; t.setAttribute('aria-pressed', ob.lines[k] !== false); return; }
    if (t.dataset.obMain != null) { ob.storeBrand = t.dataset.obMain; $$('[data-ob-main]').forEach(x => x.setAttribute('aria-pressed', x.dataset.obMain === ob.storeBrand)); return; }
    const a = t.dataset.ob;
    if (a === 'next') { if (ob.step === obSteps().length - 1) finishOnboarding(false); else obGo(1); }
    if (a === 'back') obGo(-1);
    if (a === 'skip') { ob.cal = { warmth: settings.cal.warmth || 0, brightness: settings.cal.brightness || 0 }; ob.calTouched = false; obGo(1); }
    if (a === 'skip-setup') finishOnboarding(true);
    if (a === 'install') startInstall();
    if (a === 'all-us' || a === 'none') {
      for (const b of brandList()) ob.brands[b.id] = a === 'all-us' ? b.group === 'us' : false;
      if (ob.storeBrand && !ob.brands[ob.storeBrand]) ob.storeBrand = '';
      const y = $('#onboard').scrollTop; renderOnboarding(); $('#onboard').scrollTop = y;
    }
  });
  function obFilter() {
    const q = (ob.find || '').trim().toLowerCase(); let any = false;
    $$('#onboard .ob-group').forEach(g => { let n = 0; $$('[data-ob-brand], [data-ob-sbrand]', g).forEach(c => { const hit = !q || c.dataset.name.includes(q); c.hidden = !hit; if (hit) n++; }); g.hidden = !n; if (n) any = true; });
    $$('#onboard .ob-section').forEach(sec => { if (sec.classList.contains('ob-main')) return; sec.hidden = !!q && !$$('.ob-group', sec).some(g => !g.hidden); });
    const nf = $('#onboard .ob-nofind'); if (nf) nf.hidden = any;
  }
  $('#onboard').addEventListener('input', e => {
    if (e.target.id === 'obFind' && ob) { ob.find = e.target.value; obFilter(); return; }
    const k = e.target.dataset.obcal; if (!k || !ob) return;
    ob.cal[k] = +e.target.value; ob.calTouched = true;
    e.target.style.setProperty('--fill', ((ob.cal[k] - +e.target.min) / (+e.target.max - +e.target.min) * 100).toFixed(1) + '%');
    const v = $('#obv-' + k); if (v) v.textContent = (ob.cal[k] > 0 ? '+' : '') + ob.cal[k];
    paintObPanel();
  });
  // ================================================================
  // PHONE APP: install from the website itself
  // ================================================================
  let installEvent = null;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone = () => { try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; } };
  function installState() {
    if (isStandalone()) return 'installed';
    if (installEvent) return 'prompt';
    if (location.protocol === 'file:') return 'file';
    if (isIOS) return 'ios';
    return isAndroid ? 'android' : 'manual';
  }
  function updateInstallUi() {
    const st = installState();
    $('#installBtn').hidden = settings.audience === 'kiosk' || !(st === 'prompt' || st === 'ios' || st === 'android');
    const info = $('#installInfo'); if (info) info.textContent = INSTALL_STATUS[st];
  }
  const INSTALL_STATUS = {
    installed: 'Installed. You’re using the app now.',
    prompt: 'Ready to install on this device.',
    ios: 'On iPhone and iPad it installs from the Share menu.',
    android: 'Install from the browser menu.',
    manual: 'Open this site on a phone to install it, or use Chrome or Edge on a computer.',
    file: 'Put the site online at an https address first; phones can’t install a file.',
  };
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; updateInstallUi(); });
  window.addEventListener('appinstalled', () => { installEvent = null; updateInstallUi(); toast('ColorGenius is on your home screen'); });
  async function startInstall() {
    const st = installState();
    if (st === 'prompt') {
      const ev = installEvent; installEvent = null;
      try { ev.prompt(); const choice = await ev.userChoice; if (choice && choice.outcome === 'accepted') toast('Installing ColorGenius'); } catch (e) { openInstallHelp('android'); }
      updateInstallUi();
      return;
    }
    openInstallHelp(st);
  }
  const shareIcon = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M12 3L8 7M12 3l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6.5A1.5 1.5 0 005 11.5v8A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5v-8a1.5 1.5 0 00-1.5-1.5H16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const plusIcon = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8.5v7M8.5 12h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const dotsIcon = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="18.5" r="1.7" fill="currentColor"/></svg>';
  function openInstallHelp(st) {
    const el = $('#installModal');
    const inSafari = isIOS && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    let steps, lead;
    if (st === 'ios') {
      lead = 'Add ColorGenius to the home screen. It opens full screen like any other app and works without a connection once it has loaded.';
      steps = [
        [shareIcon, inSafari ? 'Tap the Share button in Safari’s toolbar.' : 'Tap the Share button next to the address bar.'],
        [plusIcon, 'Scroll down and tap <b>Add to Home Screen</b>.'],
        ['<img src="icons/icon-192.png" width="26" height="26" alt="" style="border-radius:6px">', 'Tap <b>Add</b>. Open ColorGenius from its new icon.'],
      ];
    } else if (st === 'android' || st === 'manual') {
      lead = 'Install ColorGenius so it opens full screen from its own icon and works without a connection.';
      steps = [
        [dotsIcon, 'Open the browser menu (the three dots).'],
        [plusIcon, 'Tap <b>Install app</b> or <b>Add to Home screen</b>.'],
        ['<img src="icons/icon-192.png" width="26" height="26" alt="" style="border-radius:6px">', 'Confirm, then open ColorGenius from its new icon.'],
      ];
    } else if (st === 'file') {
      lead = 'This copy is open as a file on this computer, and phones can only install it from a web address.';
      steps = [[plusIcon, 'Put the ColorGenius folder online at an https address (GitHub Pages works and is free).'], [shareIcon, 'Open that address on the phone and tap <b>Get the app</b>.']];
    } else {
      lead = 'ColorGenius is already installed on this device.'; steps = [];
    }
    el.innerHTML = `<div class="modal-card" style="width:min(460px,100%)"><div class="modal-body">
      <div style="display:flex;gap:14px;align-items:center"><img src="icons/icon-192.png" width="56" height="56" alt="" style="border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.12)"><div><h2 id="installTitle" style="font-size:20px">Get the ColorGenius app</h2><p class="muted" style="font-size:13px">Works on iPhone, iPad and Android</p></div></div>
      <p class="muted">${esc(lead)}</p>
      ${steps.length ? `<ol class="install-steps">${steps.map(([icon, text]) => `<li><span class="is-icon">${icon}</span><span>${text}</span></li>`).join('')}</ol>` : ''}
      ${st === 'ios' ? '<p class="muted" style="font-size:12.5px">The app keeps its own settings and shortlist, separate from the browser.</p>' : ''}
      <div class="step-foot" style="margin-top:4px"><span class="spacer"></span><button type="button" class="btn primary" data-install-act="close">Got it</button></div>
    </div></div>`;
    el.hidden = false;
    $('[data-install-act="close"]', el).focus({ preventScroll: true });
  }
  $('#installModal').addEventListener('click', e => { if (e.target.id === 'installModal' || (e.target.closest('button') || {}).dataset?.installAct === 'close') $('#installModal').hidden = true; });
  $('#installBtn').addEventListener('click', startInstall);
  // Updates: every launch loads the newest files (see sw.js). If the app sat open in the background,
  // it reloads itself when it comes back, but only when nothing is in progress.
  let swReg = null, updateWaiting = false, reloading = false, hiddenAt = 0;
  const idleForUpdate = () => !state.results && state.step === 0 && $('#detailSheet').hidden && $('#settingsSheet').hidden && $('#calModal').hidden && $('#present').hidden && $('#infoModal').hidden && $('#onboard').hidden;
  const applyUpdate = () => { if (reloading) return; reloading = true; location.reload(); };
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController) return; updateWaiting = true; if (idleForUpdate()) applyUpdate(); });
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').then(reg => { swReg = reg; }).catch(() => { /* offline support is optional */ }); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (swReg) swReg.update().catch(() => {});
      const away = hiddenAt && Date.now() - hiddenAt > 20 * 60 * 1000;
      if ((updateWaiting || away) && idleForUpdate()) applyUpdate();
    });
  }

  // ================================================================
  // misc
  // ================================================================
  function copyText(text, msg) {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); toast(ok ? msg : 'Select and copy: ' + text.slice(0, 60)); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(msg), fallback); else fallback();
  }
  let toastTimer;
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }

  $$('.tab').forEach(t => t.addEventListener('click', () => { if (state.ready) route(t.dataset.view); }));
  $('#homeBtn').addEventListener('click', () => { if (state.ready) startOver(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && state.view === 'find' && !state.results && $('#detailSheet').hidden && $('#settingsSheet').hidden && $('#calModal').hidden && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement)) {
      const next = $('[data-act="next"]'); if (next) next.click();
    }
  });

  // ================================================================
  // TEXTURES: real wood grain, stone, fabric and floors drawn on a canvas and placed into the scenes
  // ================================================================
  const lightOf = id => (id && id !== 'none' ? LIGHT_BY_ID[id] : null);
  const woodGain = id => WD.gainFor(lightOf(id), settings.cal);
  // an <image> that applyTextures() fills in, inside a tiling pattern
  const texImg = (spec, w, h) => `<image data-tex="${esc(JSON.stringify(spec))}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
  const pattern = (id, spec, w, h, x, y) => `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${x || 0}" y="${y || 0}" width="${w}" height="${h}">${texImg(spec, w, h)}</pattern>`;
  // curtains either side of a back-wall window
  const backCurtains = (x, y, w, h) => {
    const top = y - 18, bot = Math.min(340, y + h + 70);
    const panel = (x0, x1) => `<rect class="r-curtain" x="${x0}" y="${top + 4}" width="${x1 - x0}" height="${bot - top - 4}"/><rect x="${x0}" y="${top + 4}" width="${x1 - x0}" height="${bot - top - 4}" fill="url(#rgFold)"/><line x1="${(x0 + x1) / 2}" y1="${top + 6}" x2="${(x0 + x1) / 2}" y2="${bot}" stroke="#000" stroke-opacity=".08" stroke-width="2"/>`;
    return `<line x1="${x - 34}" y1="${top}" x2="${x + w + 34}" y2="${top}" stroke="#3a3632" stroke-width="2.4" stroke-linecap="round"/>${panel(x - 32, x - 12)}${panel(x + w + 12, x + w + 32)}`;
  };
  const texCache = new Map();
  function texUrl(spec, lightId, roles) {
    const tint = spec.role ? (roles[spec.role] || FIXED_FILL[spec.role]) : spec.tint;
    const key = JSON.stringify([spec, tint, lightId, settings.cal]);
    if (texCache.has(key)) return texCache.get(key);
    let f; const sp = spec.sp || 'red_oak';
    if (spec.t === 'floor') f = WD.floorField(sp, spec.kind || 'wood', { hex: tint });
    else if (spec.t === 'door') f = WD.doorField(sp, spec.w, spec.h, { cm: spec.cm, frameCm: spec.frame });
    else if (spec.t === 'stone') f = WD.stoneField(spec.w, spec.h, { hex: tint || 'ECEAE5', speckle: spec.speckle });
    else if (spec.t === 'fabric') f = WD.fabricField(spec.w, spec.h, { hex: tint || 'FFFFFF' });
    else f = WD.boardsField(sp, spec.w, spec.h, { cm: spec.cm, boardCm: spec.board, gapCm: spec.gap, vertical: !!spec.vertical, seed: spec.seed || 0, ends: spec.ends });
    const woodish = spec.t === 'boards' || spec.t === 'door' || (spec.t === 'floor' && ['wood', 'deck'].includes(spec.kind || 'wood'));
    const cv = document.createElement('canvas');
    WD.paintField(cv, f, { sp, stain: spec.stain || null, tint: !spec.stain && woodish ? tint : null, gain: woodGain(lightId), sheen: spec.sheen || 0 });
    const url = cv.toDataURL(spec.gap ? 'image/png' : 'image/jpeg', 0.9);
    texCache.set(key, url);
    if (texCache.size > 60) texCache.delete(texCache.keys().next().value);
    return url;
  }
  let texTimer = 0;
  function applyTextures(root, lightId) {
    clearTimeout(texTimer);
    // after the sheet has started to slide in, so the first paint isn't held up
    texTimer = setTimeout(() => {
      if (!document.contains(root)) return;
      let roles = {};
      try { roles = JSON.parse(root.dataset.roles || '{}'); } catch (e) { roles = {}; }
      $$('image[data-tex]', root).forEach(img => {
        let spec; try { spec = JSON.parse(img.dataset.tex); } catch (e) { return; }
        img.setAttribute('href', texUrl(spec, lightId, roles));
      });
      paintWoods(root, lightId);
    }, 30);
  }

  // ---- wood canvases (cards, the before/after board, the wood and look questions) ----
  // woodCv draws a <canvas> that paintWoods() fills: data-wood (species), data-stain (JSON), data-split (0..1, left stays bare)
  function woodCv(o) {
    const d = { wood: o.sp, w: o.w || 480, h: o.h || 260, cm: o.cm || 0.22, board: o.board || 12, seed: o.seed || 0 };
    if (o.stain) d.stain = JSON.stringify(o.stain);
    if (o.split != null) d.split = o.split;
    if (o.layout) d.layout = o.layout;
    if (o.sheen) d.sheen = o.sheen;
    if (o.look) d.look = o.look;
    return `<canvas class="wood-cv ${o.cls || ''}"${o.id ? ` id="${o.id}"` : ''} width="${d.w}" height="${d.h}" ${Object.entries(d).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} role="img" aria-label="${esc(o.label || WD.SPECIES[o.sp].label)}"></canvas>`;
  }
  let woodQueue = [], woodTimer = 0;
  function paintWoods(scope, lightId) {
    const list = $$('canvas[data-wood]', scope);
    woodQueue = woodQueue.filter(x => !list.includes(x.cv)).concat(list.map(cv => ({ cv, lightId })));
    if (!woodTimer) woodTimer = setTimeout(drainWoods, 0);
  }
  function drainWoods() {
    woodTimer = 0;
    const t0 = performance.now();
    while (woodQueue.length && performance.now() - t0 < 20) { const { cv, lightId } = woodQueue.shift(); if (document.contains(cv)) paintWoodCanvas(cv, lightId); }
    if (woodQueue.length) woodTimer = setTimeout(drainWoods, 0);
  }
  function paintWoodCanvas(cv, lightId) {
    const d = cv.dataset, w = +d.w, h = +d.h;
    const f = d.layout === 'door' ? WD.doorField(d.wood, w, h, { cm: +d.cm }) : WD.boardsField(d.wood, w, h, { cm: +d.cm, boardCm: +d.board, seed: +d.seed });
    let stain = null; try { stain = d.stain ? JSON.parse(d.stain) : null; } catch (e) { stain = null; }
    WD.paintField(cv, f, { sp: d.wood, stain, split: d.split ? +d.split : null, gain: woodGain(lightId), sheen: +d.sheen || 0 });
    cv.classList.add('ready');
  }

  // ================================================================
  // STAINING: questions, picks shown on real wood before and after, and the stain detail
  // ================================================================
  const stainSpec = r => ({ hex: r.hex, type: r.type || (r.item && r.item.type) || 'semi', solid: !!r.solid, solidHex: r.solidHex || '', ref: r.ref || (r.item && r.item.ref) || '', refMix: r.refMix || (r.item && r.item.refMix) || 0 });
  const sBrand = r => (r.kind === 'paint' ? brandName(r.brand) : S.brandName(r.brand));
  const sCode = r => (r.kind === 'paint' && r.item ? E.codeLabel(r.item) : r.item ? S.codeLabel(r.item) : r.code);
  const spLabel = sp => WD.SPECIES[sp].label;
  function findAny(id) { return E.findColor(id) || S.find(id) || null; }
  const stainSettings = () => ({ resultCount: settings.resultCount, brands: brandsEnabled(), collections: settings.collections, storeBrand: settings.storeBrand, stainBrands: settings.stainBrands });
  const qLabel = id => `<p class="eyebrow">Question ${steps().indexOf(id) + 1}</p>`;
  const woodUse = t => (t === 'front_door' ? 'door' : t);

  function stainStepHtml(id) {
    const a = state.answers;
    if (id === 'job') {
      const ea = S.find('minwax:230') || { hex: 'A3794A', type: 'semi' };
      return `
        <div class="step-head">${qLabel('job')}<h1>Painting or Staining?</h1><p>Pick one to get started.</p></div>
        <div class="job-cards">
          <button type="button" class="job-card" data-job="paint" aria-pressed="${a.job === 'paint'}">${check}
            <span class="job-art job-paint" aria-hidden="true">${['E9E4DA', 'C9CFC4', '8FA6A0', '5E7386', 'B98A6E', '2F3A45'].map(h => `<i data-hex="${h}" style="background-color:${paint(h)}"></i>`).join('')}</span>
            <span class="job-text"><span class="opt-title">Painting</span><span class="opt-sub">Walls, ceilings, trim, cabinets and the outside of the house</span></span></button>
          <button type="button" class="job-card" data-job="stain" aria-pressed="${a.job === 'stain'}">${check}
            <span class="job-art job-stain" aria-hidden="true">${woodCv({ sp: 'pine', stain: { hex: ea.hex, type: 'semi' }, split: 0.5, w: 440, h: 170, cm: 0.24, seed: 4, sheen: 0.4 })}<span class="ba-tag ba-l">Bare</span><span class="ba-tag ba-r">Stained</span></span>
            <span class="job-text"><span class="opt-title">Staining</span><span class="opt-sub">Floors, cabinets, furniture, decks, fences and wood doors</span></span></button>
        </div>`;
    }
    if (id === 'target') {
      const ids = k => Object.keys(S.JOBS).filter(j => S.JOBS[j].kind === k);
      return `
        <div class="step-head">${qLabel('target')}<h1>What are you staining?</h1></div>
        ${[['Inside', ids('interior')], ['Outside', ids('exterior')]].map(([g, list]) => `<div class="group"><p class="section-title">${g}</p><div class="options">${list.map(k => optBtn(`data-target="${k}"`, a.target === k, `<span class="opt-title">${esc(S.JOBS[k].label)}</span><span class="opt-sub">${esc(S.JOBS[k].sub)}</span>`)).join('')}</div></div>`).join('')}`;
    }
    if (id === 'wood') {
      const job = S.JOBS[a.target] || S.JOBS.floors;
      const cur = S.woodFor(a);
      const keys = Object.keys(WD.SPECIES);
      const fit = keys.filter(k => WD.SPECIES[k].uses.includes(woodUse(a.target)) || (a.target === 'stairs' && WD.SPECIES[k].uses.includes('floors')));
      const rest = keys.filter(k => !fit.includes(k));
      const tile = k => `<button type="button" class="wood-opt" data-wood-pick="${k}" aria-pressed="${cur === k}">${check}<span class="wood-art">${woodCv({ sp: k, w: 330, h: 150, cm: 0.2, seed: 3, sheen: 0.3 })}</span><span class="opt-title">${esc(spLabel(k))}</span><span class="opt-sub">${esc(WD.SPECIES[k].note.split('. ')[0].replace(/\.$/, ''))}</span></button>`;
      const cond = Object.fromEntries(Object.entries(S.CONDITION).filter(([k]) => k !== 'new_pt' || job.kind === 'exterior'));
      return `
        <div class="step-head">${qLabel('wood')}<h1>What kind of wood?</h1><p>Each wood takes stain differently. Not sure? ${esc(spLabel(job.wood))} is the usual one for ${esc(job.label.toLowerCase())}.</p></div>
        <div class="group"><p class="section-title">Usual for ${esc(job.label.toLowerCase())}</p><div class="wood-opts">${fit.map(tile).join('')}</div></div>
        <details class="more-woods"${rest.includes(cur) ? ' open' : ''}><summary>Other Woods</summary><div class="wood-opts">${rest.map(tile).join('')}</div></details>
        <div class="group"><p class="group-label">What shape is it in?</p>${seg('condition', cond, a.condition, 'Condition')}</div>`;
    }
    if (id === 'around') {
      return `
        <div class="step-head">${qLabel('around')}<h1>What’s around it?</h1><p>Optional. Helps the stain go with the room.</p></div>
        <div class="group mgroup"><p class="group-label">Match other wood in the room?</p><div class="mchips">${Object.entries(S.MATCH_WOOD).map(([k, [label, hex]]) => swatchChip(`data-match-wood="${k}"`, a.matchWood === k, hex, label)).join('')}</div></div>
        <div class="group mgroup"><p class="group-label">The wall color next to it</p><div class="mchips">${Object.entries(S.WALL_TONES).map(([k, [label, hex]]) => swatchChip(`data-wall-tone="${k}"`, a.wallTone === k, hex, label)).join('')}</div></div>`;
    }
    if (id === 'finish') {
      return `
        <div class="step-head">${qLabel('finish')}<h1>How should it finish?</h1><p>Optional. These choose the topcoat and fine-tune the picks.</p></div>
        <div class="group"><p class="group-label">How shiny?</p>${seg('sheen', Object.assign({ '': 'Not Sure' }, S.SHEENS), a.sheen || '', 'Sheen')}</div>
        <div class="group"><p class="group-label">How even should the color be?</p>${seg('evenness', { '': 'Not Sure', even: 'Even Color', natural: 'Natural Variation' }, a.evenness || '', 'Evenness')}</div>
        ${(S.JOBS[a.target] || {}).traffic ? `<div class="group"><p class="group-label">Pets or kids?</p>${seg('pets', { no: 'No', yes: 'Yes' }, a.pets ? 'yes' : 'no', 'Pets or kids')}</div>` : ''}`;
    }
    if (id === 'slook') {
      const sp = S.woodFor(a);
      return `
        <div class="step-head">${qLabel('slook')}<h1>What look?</h1><p>Pick up to two. Each sample is a real stain shown on ${esc(spLabel(sp).toLowerCase())}.</p></div>
        <div class="look-opts">${Object.entries(S.LOOKS).map(([k, L]) => `<button type="button" class="look-opt" data-slook="${k}" aria-pressed="${a.looks.includes(k)}">${check}<span class="look-art">${woodCv({ sp, w: 360, h: 120, cm: 0.24, seed: 5, look: k, sheen: 0.35 })}</span><span class="opt-title">${esc(L.label)}</span><span class="opt-sub" data-look-name="${k}">${esc(L.sub)}</span></button>`).join('')}</div>
        <div class="group"><p class="group-label">How much grain should show? <span class="hint">${S.JOBS[a.target].kind === 'exterior' ? 'Solid stain lasts longest on siding and fences' : 'Most interior stain shows the grain'}</span></p>${seg('grain', S.GRAIN, a.grain, 'Grain')}</div>`;
    }
    return '';
  }
  // the look samples: each look's best stain on the chosen wood, one look per tick
  function fillLookSamples() {
    const a = state.answers, sp = S.woodFor(a);
    const keys = Object.keys(S.LOOKS);
    const one = i => {
      const k = keys[i]; if (!k) return;
      const cv = $(`canvas[data-look="${k}"]`); if (!cv) return;
      const r = S.recommend(Object.assign({}, a, { looks: [k] }), Object.assign(stainSettings(), { resultCount: 1 })).results[0];
      if (r) {
        cv.dataset.stain = JSON.stringify(stainSpec(r));
        paintWoodCanvas(cv, 'none');
        const nm = $(`[data-look-name="${k}"]`); if (nm) nm.textContent = `${S.LOOKS[k].sub} · e.g. ${r.name}`;
      }
      setTimeout(() => one(i + 1), 0);
    };
    setTimeout(() => one(0), 20);
  }
  function stainClick(t) {
    const a = state.answers;
    if (t.dataset.job) {
      a.job = t.dataset.job;
      $$('[data-job]').forEach(b => b.setAttribute('aria-pressed', b.dataset.job === a.job));
      setTimeout(() => { if (state.view === 'find' && !state.results && steps()[state.step] === 'job') goStep(1, 1); }, 240);
      return true;
    }
    if (t.dataset.target) {
      const before = (S.JOBS[a.target] || {}).kind;
      a.target = t.dataset.target;
      const job = S.JOBS[a.target];
      if (job.kind !== before || (a.wood && !WD.SPECIES[a.wood].uses.includes(woodUse(a.target)) && !(job.kind === 'interior' && !WD.SPECIES[a.wood].ext))) a.wood = '';
      if (job.kind === 'interior' && a.condition === 'new_pt') a.condition = 'bare';
      $$('[data-target]').forEach(b => b.setAttribute('aria-pressed', b.dataset.target === a.target));
      return true;
    }
    if (t.dataset.woodPick) {
      a.wood = t.dataset.woodPick;
      if (a.wood === 'pt_pine' && a.condition === 'bare') a.condition = 'new_pt';
      $$('[data-wood-pick]').forEach(b => b.setAttribute('aria-pressed', b.dataset.woodPick === a.wood));
      return true;
    }
    if (t.dataset.slook) {
      const k = t.dataset.slook, i = a.looks.indexOf(k);
      if (i >= 0) a.looks.splice(i, 1); else { a.looks.push(k); if (a.looks.length > 2) a.looks.shift(); }
      $$('[data-slook]').forEach(b => b.setAttribute('aria-pressed', a.looks.includes(b.dataset.slook)));
      return true;
    }
    return false;
  }

  // ================================================================
  // MODES: Basic, Advanced, Perfect; the advanced questions; Perfect's "which do you like better?" rounds
  // ================================================================
  const DUEL_SIZE = 4;
  const MODES = {
    basic: { label: 'Basic', time: 'About 1 minute', sub: 'A few quick questions and a handful of colors to pick from.' },
    advanced: { label: 'Advanced', time: 'About 3 minutes', sub: 'More specific questions, so the picks fit even better.' },
    perfect: { label: 'Perfect', time: 'About 4 minutes', sub: 'The advanced questions plus a few quick “which do you like better?” rounds. You get the one best color.' },
  };
  const swatchChip = (attrs, pressed, hex, label) => `<button type="button" class="mchip" ${attrs} aria-pressed="${pressed}"><span class="msw" style="background:#${hex}"></span>${esc(label)}</button>`;
  function moreStepHtml(id) {
    const a = state.answers, sp = E.SPACES[a.space] || E.SPACES.living;
    if (id === 'mode') {
      return `
        <div class="step-head">${qLabel('mode')}<h1>Basic, Advanced or Perfect?</h1><p>Pick how many questions to answer. You can change this any time.</p></div>
        <div class="mode-cards">${Object.entries(MODES).map(([k, m]) => `<button type="button" class="mode-card" data-mode="${k}" aria-pressed="${(a.mode || 'basic') === k}">${check}<span class="mode-time">${esc(m.time)}</span><span class="opt-title">${esc(m.label)}</span><span class="opt-sub">${esc(m.sub)}</span></button>`).join('')}</div>`;
    }
    if (id === 'now') {
      const surfs = E.surfacesFor(a.space);
      const wood = ['bare_wood', 'stained_wood', 'paneling'].includes(a.surface) || sp.kind === 'exterior';
      const issues = Object.entries(E.ISSUES).filter(([k]) => k !== 'knots' || wood);
      return `
        <div class="step-head">${qLabel('now')}<h1>What’s on it now?</h1><p>This decides the primer and how many coats you’ll need.</p></div>
        <div class="group mgroup"><p class="group-label">The color on it now</p><div class="mchips">
          ${Object.entries(E.NOW_COLORS).map(([k, v]) => k === 'none' ? `<button type="button" class="mchip" data-now="none" aria-pressed="${a.nowKind === 'none'}"><span class="msw flag-sw" aria-hidden="true"><svg viewBox="0 0 20 20" width="14" height="14"><path d="M5 10h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>${esc(v)}</button>` : swatchChip(`data-now="${k}"`, a.nowKind === k && !a.nowHex, E.NOW_HEX[k], v)).join('')}
        </div><div class="now-pick"><span class="muted">Or match it exactly:</span>${colorHtml('nowColor', a.nowHex || 'B9AE9C', 'The color on it now')}${a.nowHex ? '<button type="button" class="link-btn" data-now-clear>Clear</button>' : ''}</div></div>
        <div class="group mgroup"><p class="group-label">What is it?</p><div class="mchips">${surfs.map(k => `<button type="button" class="mchip mchip-flag" data-surface="${k}" aria-pressed="${a.surface === k}">${esc(E.SURFACES[k])}</button>`).join('')}</div></div>
        <div class="group mgroup"><p class="group-label">Any problems? <span class="hint">pick any</span></p><div class="mchips">${issues.map(([k, v]) => `<button type="button" class="mchip mchip-flag" data-issue="${k}" aria-pressed="${(a.issues || []).includes(k)}">${esc(v)}</button>`).join('')}</div></div>`;
    }
    if (id === 'feel') {
      return `
        <div class="step-head">${qLabel('feel')}<h1>How should it feel?</h1><p>Optional. Each answer fine-tunes the picks.</p></div>
        <div class="options wide">${Object.entries(E.MOODS).map(([k, v]) => optBtn(`data-feel="${k}"`, a.feel === k, `<span class="opt-title">${esc(v)}</span>`)).join('')}</div>
        <div class="group"><p class="group-label">Warm or cool?</p>${seg('undertone', Object.assign({ '': 'No Preference' }, E.UNDERTONES), a.undertone || '', 'Undertone')}</div>
        <div class="group mgroup"><p class="group-label">Any colors to stay away from? <span class="hint">pick any</span></p><div class="mchips">${Object.entries(E.FAMILY_CHOICES).map(([k, v]) => `<button type="button" class="mchip mchip-flag" data-avoid="${k}" aria-pressed="${(a.avoid || []).includes(k)}">${esc(v)}</button>`).join('')}</div></div>`;
    }
    if (id === 'duel') {
      const d = duelState();
      if (!d.queue.length) return '<div class="step-head"><h1>Nothing to compare</h1><p>Go back and loosen an answer or two.</p></div>';
      const pair = d.queue.slice(0, 2);
      const round = d.total - d.queue.length + 2;
      const opt = (x, i) => a.job === 'stain'
        ? `<button type="button" class="duel-opt" data-duel="${esc(x.id)}">${woodCv({ sp: d.R.wood, stain: stainSpec(x), w: 420, h: 300, cm: 0.18, seed: 7 + i, sheen: 0.5, label: x.name })}<span class="duel-name"><b>${esc(x.name)}</b><span>${esc(sBrand(x))} · ${esc(sCode(x))}</span></span></button>`
        : `<button type="button" class="duel-opt" data-duel="${esc(x.color.id)}"><span class="duel-sw" data-hex="${x.color.hex}" style="background-color:${paint(x.color.hex)}"></span><span class="duel-name"><b>${esc(x.color.name)}</b><span>${esc(brandName(x.color.brand))} · ${esc(E.codeLabel(x.color))}</span></span></button>`;
      return `
        <div class="step-head">${qLabel('duel')}<h1>Which do you like better?</h1><p>Round ${round} of ${d.total}. Tap the one you’d rather live with.</p></div>
        <div class="duel">${pair.map(opt).join('<span class="duel-or">or</span>')}</div>`;
    }
    return '';
  }
  // Perfect's rounds: the top few picks play off in pairs; the winner of each pair goes on to the next round
  function duelState() {
    const a = state.answers;
    const key = JSON.stringify(Object.assign({}, a, { perfectPick: '' }));
    if (!state.duel || state.duel.key !== key || state.duel.queue.length < 2) {
      const R = a.job === 'stain' ? S.recommend(a, Object.assign(stainSettings(), { resultCount: DUEL_SIZE })) : E.recommend(a, Object.assign({}, engineSettings(), { resultCount: DUEL_SIZE }));
      state.duel = { key, R, queue: R.results.slice(), total: Math.max(1, R.results.length - 1) };
    }
    return state.duel;
  }
  function duelPick(id) {
    const d = duelState();
    const idOf = r => r.id || r.color.id;
    const win = d.queue.slice(0, 2).find(r => idOf(r) === id); if (!win) return;
    d.queue = d.queue.slice(2).concat([win]);
    if (d.queue.length <= 1) { state.answers.perfectPick = idOf(d.queue[0] || win); finishWizard(); return; }
    rerenderStep();
  }
  function duelChooseForMe() {
    const d = duelState();
    const first = d.R.results[0];
    state.answers.perfectPick = first ? (first.id || first.color.id) : '';
    finishWizard();
  }
  function perfectWhy(R) {
    const r = R.results[0]; if (!r) return '';
    const reasons = r.reasons || (r.warnings ? [] : []);
    return `<section class="perfect-why" aria-label="Why this one">
      <h2>Why This One</h2>
      <ul class="reasons">${(reasons.length ? reasons : [`It looks best on ${R.wood ? spLabel(R.wood).toLowerCase() : 'your walls'} for everything you told us`]).map(x => `<li>${esc(x)}</li>`).join('')}${state.answers.perfectPick ? '<li>You picked it over the other finalists</li>' : ''}</ul>
      ${(R.finalists || []).length ? `<details class="finalists"><summary>See the Other Finalists</summary><div class="grid">${R.kind === 'stain' ? R.finalists.map((x, i) => stainCard(x, i, Object.assign({}, R, { results: R.finalists })).replace(/data-sopen="d+"/, `data-open="${esc(x.id)}"`)).join('') : R.finalists.map(x => chipCard(x.color, { role: 'Finalist', light: state.gridLight })).join('')}</div></details>` : ''}
    </section>`;
  }
  function moreClick(t) {
    const a = state.answers;
    if (t.dataset.mode) {
      a.mode = t.dataset.mode; state.duel = null;
      $$('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === a.mode));
      setTimeout(() => { if (state.view === 'find' && !state.results && steps()[state.step] === 'mode') goStep(state.step + 1, 1); }, 240);
      return true;
    }
    if (t.dataset.now) { a.nowKind = a.nowKind === t.dataset.now && !a.nowHex ? '' : t.dataset.now; a.nowHex = ''; rerenderStep(); return true; }
    if (t.hasAttribute('data-now-clear')) { a.nowHex = ''; rerenderStep(); return true; }
    if (t.dataset.surface) { a.surface = a.surface === t.dataset.surface ? '' : t.dataset.surface; rerenderStep(); return true; }
    if (t.dataset.issue) { a.issues = a.issues || []; toggleIn(a.issues, t.dataset.issue); t.setAttribute('aria-pressed', a.issues.includes(t.dataset.issue)); return true; }
    if (t.dataset.feel) { a.feel = a.feel === t.dataset.feel ? '' : t.dataset.feel; $$('[data-feel]').forEach(b => b.setAttribute('aria-pressed', b.dataset.feel === a.feel)); return true; }
    if (t.dataset.avoid) { a.avoid = a.avoid || []; toggleIn(a.avoid, t.dataset.avoid); t.setAttribute('aria-pressed', a.avoid.includes(t.dataset.avoid)); return true; }
    if (t.dataset.matchWood != null) { a.matchWood = a.matchWood === t.dataset.matchWood ? '' : t.dataset.matchWood; $$('[data-match-wood]').forEach(b => b.setAttribute('aria-pressed', b.dataset.matchWood === a.matchWood)); return true; }
    if (t.dataset.wallTone != null) { a.wallTone = a.wallTone === t.dataset.wallTone ? '' : t.dataset.wallTone; $$('[data-wall-tone]').forEach(b => b.setAttribute('aria-pressed', b.dataset.wallTone === a.wallTone)); return true; }
    if (t.dataset.duel) { duelPick(t.dataset.duel); return true; }
    return false;
  }
  COLORS.nowColor = { onChange: (hex, done) => { state.answers.nowHex = hex; state.answers.nowKind = ''; if (done) rerenderStep(); } };

  // ---- results ----
  function stainTitle(R) {
    const job = S.JOBS[R.answers.target] || S.JOBS.floors;
    const what = { floors: 'floors', stairs: 'stairs', cabinets: 'cabinets', furniture: 'furniture', tabletop: 'tabletop', trim: 'trim and doors', deck: 'deck', fence: 'fence', siding: 'siding', outdoor: 'outdoor furniture', pergola: 'pergola', front_door: 'front door' }[R.answers.target] || job.label.toLowerCase();
    return `Stains for ${spLabel(R.wood).toLowerCase()} ${what}`;
  }
  function stainSummary(R) {
    const a = R.answers, st = steps(), i = id => st.indexOf(id);
    return [
      [i('target'), S.JOBS[a.target].label],
      [i('wood'), spLabel(R.wood) + (a.condition !== 'bare' ? ' · ' + S.CONDITION[a.condition] : '')],
      [i('around'), [a.matchWood ? 'Matching ' + S.MATCH_WOOD[a.matchWood][0] : '', a.wallTone ? S.WALL_TONES[a.wallTone][0] + ' Walls' : ''].filter(Boolean).join(' · ') || 'Nothing to Match'],
      [i('slook'), (a.looks.length ? a.looks.map(k => S.LOOKS[k].label).join(' + ') : 'Popular Looks') + (a.grain === 'hide' ? ' · Solid' : '')],
      [i('finish'), [S.SHEENS[a.sheen], a.evenness === 'even' ? 'Even Color' : a.evenness === 'natural' ? 'Natural Variation' : '', a.pets ? 'Pets or Kids' : ''].filter(Boolean).join(' · ') || 'Any Finish'],
    ].filter(x => x[0] >= 0);
  }
  function stainCard(r, i, R) {
    const starred = shortlist.includes(r.id);
    return `<article class="chip schip" data-id="${esc(r.id)}">
      <button type="button" class="chip-open" data-sopen="${i}" aria-label="${esc(r.name)}, ${esc(sBrand(r))} ${esc(sCode(r))}, on ${esc(spLabel(R.wood))}. Open details">
        <div class="swatch wood-sw">${woodCv({ sp: R.wood, stain: stainSpec(r), split: 0.34, w: 480, h: 300, cm: 0.19, seed: 7 + (i % 3), sheen: 0.5, label: `${r.name} on ${spLabel(R.wood)}` })}<span class="ba-tag ba-l">Bare</span><span class="flags">${flagsFor(r)}</span></div>
        <div class="chip-label">
          <span class="chip-role">${esc(r.role)}</span>
          <span class="chip-name">${esc(r.name)}</span>
          <span class="chip-meta"><span class="brand">${esc(sBrand(r))}</span><span class="mono">${esc(sCode(r))}</span></span>
          <span class="s-meta">${r.kind === 'paint' ? 'Solid stain' : sCode(r) === S.TYPES[r.type] ? `On ${esc(spLabel(R.wood).toLowerCase())}` : esc(S.TYPES[r.type] || 'Stain')}${R.guide && r.kind === 'stain' ? ' · tone guide' : ''}</span>
        </div>
      </button>
      <button type="button" class="star" data-star="${esc(r.id)}" aria-pressed="${starred}" aria-label="${starred ? 'Remove from' : 'Add to'} shortlist">${starSvg}</button>
    </article>`;
  }
  function renderStainResults(animate) {
    updateWizardNav(false);
    const host = $('#view-find');
    const R = state.results;
    if (!R.results.length) {
      host.innerHTML = `<div class="empty"><h1>No Stains to Show</h1><p>Try another look or opacity, or turn on more stain brands in Settings.</p><div style="display:flex;gap:8px"><button type="button" class="btn primary" data-act="edit">Edit Answers</button></div></div>`;
      return;
    }
    host.innerHTML = `
      <div class="results-head">
        <p class="eyebrow">${R.results.length} options · shown on ${esc(spLabel(R.wood).toLowerCase())}</p>
        <h1>${esc(R.perfect ? stainTitle(R).replace(/^Stains for/, 'Your Perfect Stain for') : stainTitle(R))}</h1>
        <div class="summary">${stainSummary(R).map(([i, label]) => `<button type="button" data-edit="${i}" aria-label="Change: ${esc(label)}">${esc(label)}</button>`).join('')}</div>
      </div>
      <div class="results-tools">
        ${settings.lightPreview ? lightBar(state.gridLight, 'grid') : '<span></span>'}
        <div class="tool-btns"><button type="button" class="btn small" data-act="stain-compare">Compare</button><button type="button" class="btn small hide-sm" data-act="edit">Edit Answers</button><button type="button" class="btn small primary" data-act="restart">Start Over</button></div>
      </div>
      ${R.guide ? `<div class="warn headsup" style="margin-bottom:16px"><b>Tone guides for outdoor stain</b><span>These are Minwax tones, shown on your wood, to pick the look. Then choose the closest color on the store’s exterior stain chip card (see What to buy below).</span></div>` : ''}
      <div class="grid${R.perfect ? ' grid-one' : ''}" id="resultGrid">${R.results.map((r, i) => stainCard(r, i, R)).join('')}</div>
      ${R.perfect ? perfectWhy(R) : ''}
      <section class="tips-panel" aria-labelledby="tipsTitle"><h2 id="tipsTitle" class="tips-title">What to Buy</h2>
        <div class="tips">${R.products.map(p => `<div class="tip-row"><b>${esc(p.name)}</b><p>${esc(p.why)}</p></div>`).join('')}</div>
        <h2 class="tips-title" style="margin-top:18px">Good to Know</h2>
        <div class="tips">${R.tips.map(t => `<div class="tip-row"><b>${esc(t.title)}</b><p>${esc(t.text)}</p></div>`).join('')}</div>
      </section>`;
    paintWoods(host, state.gridLight);
    if (animate && !reduced()) fanIn($('#resultGrid'));
  }

  // ---- the stain detail ----
  // a stain opened from the shortlist or a search has no results around it: judge it on the current answers
  function stainResultFor(id) {
    if (state.results && state.results.kind === 'stain') { const all = state.results.results.concat(state.results.finalists || []); const r = all.find(x => x.id === id); if (r) return { R: state.results, r }; }
    const item = S.find(id); if (!item) return null;
    const a = Object.assign({}, S.DEFAULT, state.answers.job === 'stain' ? state.answers : {});
    const base = S.recommend(Object.assign({}, a, { looks: ['natural'] }), Object.assign(stainSettings(), { resultCount: 1 }));
    const st = { hex: item.hex, type: item.type, solid: a.grain === 'hide', solidHex: item.solidHex };
    const predicted = WD.predictHex(base.wood, st);
    const r = { id, kind: 'stain', item, name: item.name, brand: item.brand, code: item.code, hex: item.hex, solidHex: item.solidHex, type: item.type, predicted, role: 'Saved stain', look: '', warnings: S.warningsFor(item, a, predicted), solid: a.grain === 'hide' };
    return { R: Object.assign({}, base, { results: [r] }), r };
  }
  function openStainDetail(R, r) {
    const wasOpen = !sheet.hidden;
    if (!wasOpen) lastFocus = document.activeElement;
    state.detailId = r.id; state.detailStack = [];
    sheet.innerHTML = stainDetailHtml(R, r);
    updateRoomScene();
    wireBeforeAfter();
    if (!wasOpen) { showScrim(); sheet.hidden = false; sheet.classList.remove('out'); $('[data-act="close-detail"]', sheet).focus({ preventScroll: true }); }
    else sheet.scrollTo({ top: 0, behavior: 'auto' });
  }
  function stainDetailHtml(R, r) {
    const a = R.answers, sp = R.wood, job = S.JOBS[a.target] || S.JOBS.floors;
    const st = stainSpec(r);
    const starred = shortlist.includes(r.id);
    const others = S.onOtherWoods({ hex: r.hex, type: st.type, solidHex: r.solidHex, kind: r.kind, ref: st.ref, refMix: st.refMix }, a, ['red_oak', 'white_oak', 'pine', 'maple', 'cherry', 'cedar'].filter(k => k !== sp).slice(0, 5));
    const tex = { sp, stain: st };
    const roles = { wall: 'E7E2D8', side: 'E7E2D8', ceil: 'F4F2ED', trim: 'F2F1EC', door: 'F2F1EC', art: '5E6B73', art2: 'D9CFC0', cab: 'F2F1EC', counter: 'ECEAE5', tile: 'F6F5F1', hood: 'B9BDBF', rug: 'D6CDBE', curtain: 'ECE7DD', floor: job.scene === 'cabinets' ? 'D3CFC7' : 'A98661', body: 'D8D2C6', xtrim: 'F2F1EC', glass: '33404B', xdoor: '3E4A52', roof: '45484C', lawn: '6E8A4F', shrub: '4E6A3B', tree: '5D7649', walk: 'CFCAC0', step: 'BEB9B0' };
    const label = `${spLabel(sp)} ${job.label.toLowerCase()} stained ${r.name}`;
    return `
      <div class="sheet-head">
        <button type="button" class="icon-btn" data-act="close-detail" aria-label="Close"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
        <h2 id="detailTitle">${esc(r.name)}</h2>
        <button type="button" class="icon-btn" data-star="${esc(r.id)}" aria-pressed="${starred}" aria-label="${starred ? 'Remove from' : 'Add to'} shortlist">${starSvg}</button>
      </div>
      <div class="sheet-body">
        <div class="room" id="roomScene" data-scene="${esc(job.scene)}" data-roles="${esc(JSON.stringify(roles))}" data-light-locked="1">
          ${stainScene(job.scene, tex, a, label)}
          <span class="light-label" id="roomLabel"></span>
        </div>
        ${settings.lightPreview ? lightBar(state.roomLight, 'room') : ''}
        <div class="detail-title">
          <h3>${esc(r.name)}</h3>
          <div class="sub"><span>${esc(sBrand(r))}</span><span class="mono">${esc(sCode(r))}</span>${R.guide && r.kind === 'stain' ? '<span class="badge">Tone guide</span>' : ''}${r.solid ? '<span class="badge">Solid stain</span>' : ''}</div>
        </div>
        <div class="ba-vs" role="group" aria-label="Compare with">
          <span class="ba-vs-label">Compare With</span>
          <button type="button" class="mchip" data-ba-vs="bare" aria-pressed="true">Bare Wood</button>
          ${R.results.filter(x => x.id !== r.id).slice(0, 5).map(x => `<button type="button" class="mchip" data-ba-vs="${esc(x.id)}" aria-pressed="false"><span class="msw" style="background:#${x.predicted}"></span>${esc(x.name)}</button>`).join('')}
        </div>
        <div class="ba" id="baBox" style="--split:50%">
          ${woodCv({ sp, w: 900, h: 340, cm: 0.15, seed: 11, sheen: 0.55, cls: 'ba-bare', label: `Bare ${spLabel(sp)}` })}
          ${woodCv({ sp, stain: st, w: 900, h: 340, cm: 0.15, seed: 11, sheen: 0.55, cls: 'ba-after', label: `${r.name} on ${spLabel(sp)}` })}
          <div class="ba-line" aria-hidden="true"><span class="ba-knob"></span></div>
          <span class="ba-tag ba-l" id="baLeftTag">Bare ${esc(spLabel(sp).toLowerCase())}</span><span class="ba-tag ba-r">${esc(r.name)}</span>
          <input type="range" class="ba-range" min="0" max="100" value="50" aria-label="Compare bare and stained wood">
        </div>
        <p class="muted ba-hint">Drag across the board to compare.</p>
        ${stainPaintHtml(R, r, st)}
        <div class="detail-actions">
          <button type="button" class="btn small" data-copy="${esc(`${r.name} — ${sBrand(r)} ${sCode(r)}`)}">Copy Name &amp; Code</button>
          <button type="button" class="btn small" data-star="${esc(r.id)}" data-star-text="${esc(r.id)}">${starred ? 'Remove from Saved' : 'Save Color'}</button>
        </div>
        <div class="facts">
          <div class="fact"><span class="k">Look</span><span class="v">${esc(r.look ? S.LOOKS[r.look].label : '—')}</span></div>
          <div class="fact"><span class="k">Wood</span><span class="v">${esc(spLabel(sp))}</span></div>
          <div class="fact"><span class="k">Opacity</span><span class="v">${r.kind === 'paint' ? 'Solid (hides the grain)' : esc(S.TYPES[r.type] || 'Semi-transparent')}</span></div>
          <div class="fact"><span class="k">Wood before</span><span class="v"><i class="mini-sw" data-hex="${R.bare}" style="background-color:${paint(R.bare)}"></i><span class="mono">#${R.bare}</span></span></div>
          <div class="fact"><span class="k">Brand swatch</span><span class="v"><i class="mini-sw" data-hex="${r.hex}" style="background-color:${paint(r.hex)}"></i><span class="mono">#${r.hex}</span></span></div>
          <div class="fact"><span class="k">On this wood</span><span class="v"><i class="mini-sw" data-hex="${r.predicted}" style="background-color:${paint(r.predicted)}"></i><span class="mono">#${r.predicted}</span></span></div>
        </div>
        <p class="muted" style="font-size:13.5px">${esc(WD.SPECIES[sp].note)} The stained color is worked out from the brand’s swatch and how much stain ${esc(spLabel(sp).toLowerCase())} soaks up, so treat it as a close preview and test a sample board.</p>
        <div class="block"><h4>The Same Stain on Other Woods</h4><div class="woods-row">${others.map(o => `<div class="wood-tile">${woodCv({ sp: o.sp, stain: st, split: 0.4, w: 300, h: 160, cm: 0.2, seed: 2, sheen: 0.4, label: `${r.name} on ${o.label}` })}<span>${esc(o.label)}</span></div>`).join('')}</div></div>
        ${r.warnings.length && settings.showWarnings ? `<div class="block"><h4>Things to Know</h4>${r.warnings.map((w, i) => `<div class="warn ${w.level === 'heads-up' ? 'headsup' : w.level}" style="--i:${i}"><b>${esc(w.title)}</b><span>${esc(w.text)}</span></div>`).join('')}</div>` : ''}
        <div class="block"><h4>What to Buy</h4><ul class="reasons buy">${R.products.map(p => `<li><b>${esc(p.name)}</b> ${esc(p.why)}</li>`).join('')}</ul></div>
        <div class="block"><h4>Good to Know</h4><ul class="reasons">${R.tips.map(t => `<li><b>${esc(t.title)}.</b> ${esc(t.text)}</li>`).join('')}</ul></div>
        <p class="muted" style="font-size:12px">${r.kind === 'paint' ? `Paint color from ${esc(sBrand(r))}, tinted as a solid stain.` : `Source: ${esc(((window.CG_STAINS && window.CG_STAINS.brands || []).find(b => b.id === r.brand) || {}).source || 'brand data')}. Screen colors are the brand’s digital swatches; stain always looks different on real wood, so test it.`}</p>
      </div>`;
  }
  // the before/after divider: a range input over two stacked canvases, so dragging is instant
  function wireBeforeAfter() {
    const box = $('#baBox', sheet); if (!box) return;
    $$('[data-ba-vs]', sheet).forEach(b => b.addEventListener('click', () => {
      const left = $('.ba-bare', box), tag = $('#baLeftTag', sheet), R = state.results && state.results.kind === 'stain' ? state.results : null;
      const other = b.dataset.baVs === 'bare' ? null : (R && R.results.find(x => x.id === b.dataset.baVs));
      if (other) { left.dataset.stain = JSON.stringify(stainSpec(other)); tag.textContent = other.name; }
      else { delete left.dataset.stain; tag.textContent = 'Bare ' + spLabel(left.dataset.wood).toLowerCase(); }
      paintWoodCanvas(left, state.roomLight);
      $$('[data-ba-vs]', sheet).forEach(x => x.setAttribute('aria-pressed', x === b));
    }));
    $$('[data-wall-paint]', sheet).forEach(b => b.addEventListener('click', () => {
      const room = $('#roomScene', sheet); let roles = {};
      try { roles = JSON.parse(room.dataset.roles || '{}'); } catch (e) { roles = {}; }
      const job = S.JOBS[(state.results || {}).answers ? state.results.answers.target : 'floors'] || S.JOBS.floors;
      for (const role of PAINT_ROLE[job.scene] || []) roles[role] = b.dataset.wallPaint;
      room.dataset.roles = JSON.stringify(roles);
      updateRoomScene();
      $$('[data-wall-paint]', sheet).forEach(x => x.classList.toggle('on', x === b));
      room.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    }));
    const range = $('.ba-range', box);
    const set = v => { box.style.setProperty('--split', v + '%'); };
    range.addEventListener('input', () => set(range.value));
    // drag anywhere on the board too
    box.addEventListener('pointerdown', e => {
      if (e.target === range) return;
      const move = ev => { const r = box.getBoundingClientRect(); const v = Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 100); range.value = v; set(v); };
      move(e); box.setPointerCapture(e.pointerId);
      const up = () => { box.removeEventListener('pointermove', move); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); };
      box.addEventListener('pointermove', move); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    });
  }

  // Paint colors that go with a stain: from the paint brands that are on, light enough to stand apart from the wood,
  // and leaning the same way (warm with warm woods, cooler with grays). Tapping one paints the scene's walls.
  const PAINT_SPACE = { floors: 'living', stairs: 'entry', cabinets: 'kitchen', furniture: 'living', tabletop: 'kitchen', trim: 'living', deck: 'ext_body', fence: 'ext_body', siding: 'ext_trim', outdoor: 'ext_body', pergola: 'ext_body', front_door: 'ext_body' };
  const PAINT_ROLE = { floor: ['wall', 'side'], cabinets: ['wall', 'side'], furniture: ['wall', 'side'], trim: ['wall', 'side'], deck: ['body'], siding: ['xtrim'], door: ['body'] };
  function stainPaints(R, r) {
    if (!jobOn('paint') && !Object.values(brandsEnabled()).some(Boolean)) return [];
    const lab = C.hexToLab(r.predicted), warm = C.temperature(C.labToLch(lab)[1], C.labToLch(lab)[2], lab[0]) === 'warm';
    const space = PAINT_SPACE[R.answers.target] || 'living';
    // whites, soft neutrals and gentle greens or blues sit best with wood; warm woods lean warm, gray woods lean cool
    const families = warm ? ['white', 'warm-neutral', 'green'] : ['white', 'cool-neutral', 'blue'];
    const res = E.recommend(Object.assign({}, E.DEFAULT_ANSWERS, { space, depth: 'any', families }), Object.assign({}, engineSettings(), { resultCount: 18 })).results.map(x => x.color);
    const fits = res.filter(c => C.deltaE2000(c.lab, lab) > 18).sort((a, b) => ((warm ? b.temp === 'warm' : b.temp !== 'warm') - (warm ? a.temp === 'warm' : a.temp !== 'warm')));
    const out = [];
    for (const c of fits) { if (out.length >= 4) break; if (!out.some(o => C.deltaE2000(o.lab, c.lab) < 8)) out.push(c); }
    return out;
  }
  function stainPaintHtml(R, r, st) {
    const job = S.JOBS[R.answers.target] || S.JOBS.floors;
    const paints = stainPaints(R, r);
    if (!paints.length) return '';
    const canTap = !!PAINT_ROLE[job.scene];
    return `<div class="block"><h4>With Paint Colors</h4>
      <p class="muted" style="font-size:13px;margin:0">${canTap ? 'Tap one to see it on the walls in the picture above.' : 'Paint colors that go well with this stain.'}</p>
      <div class="sp-row">${paints.map(c => `<button type="button" class="sp-card"${canTap ? ` data-wall-paint="${c.hex}"` : ''} aria-label="${esc(c.name)}, ${esc(brandName(c.brand))} ${esc(E.codeLabel(c))}">
        <span class="sp-wall" data-hex="${c.hex}" style="background-color:${paint(c.hex)}"></span>
        <span class="sp-wood">${woodCv({ sp: R.wood, stain: st, w: 300, h: 70, cm: 0.22, seed: 4, label: r.name })}</span>
        <span class="sp-text"><b>${esc(c.name)}</b><span>${esc(brandName(c.brand))} · <span class="mono">${esc(E.codeLabel(c))}</span></span></span></button>`).join('')}</div></div>`;
  }
  // every stain pick on the same wood, side by side
  function openStainCompare(R) {
    const html = `
      <p class="muted" style="margin:0 0 12px">All on ${esc(spLabel(R.wood).toLowerCase())}, bare wood first.</p>
      <div class="sc-grid"><div class="sc-col">${woodCv({ sp: R.wood, w: 220, h: 300, cm: 0.2, seed: 9, sheen: 0.4 })}<b>Bare Wood</b><span>${esc(spLabel(R.wood))}</span></div>
        ${R.results.map((x, i) => `<button type="button" class="sc-col" data-open="${esc(x.id)}">${woodCv({ sp: R.wood, stain: stainSpec(x), w: 220, h: 300, cm: 0.2, seed: 9, sheen: 0.4 })}<b>${esc(x.name)}</b><span>${esc(sBrand(x))} · ${esc(sCode(x))}</span></button>`).join('')}</div>`;
    openInfo(html, 'Compare Stains');
    paintWoods(infoEl(), state.gridLight);
  }

  // ---- scenes for staining ----
  function stainScene(scene, tex, a, label) {
    const open = `<svg class="room-svg" viewBox="0 0 800 480" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(label)}">`;
    const wood = Object.assign({ t: 'boards', w: 400, h: 120, cm: 0.3, board: 14, seed: 2 }, tex);
    if (scene === 'floor') return sceneSvg('room', { label, furniture: 'sofa', windows: [{ slot: 'left', dir: 'south' }], floorTex: Object.assign({ t: 'floor', kind: 'wood' }, tex) });
    if (scene === 'cabinets') return sceneSvg('kitchen', { label, windows: [{ slot: 'left', dir: 'east' }], cabTex: tex, floorType: 'tile' });
    if (scene === 'furniture') return sceneSvg('room', { label, furniture: 'dining', windows: [{ slot: 'left', dir: 'south' }], woodTex: wood });
    if (scene === 'trim') return sceneSvg('room', { label, furniture: 'sofa', windows: [{ slot: 'left', dir: 'south' }], trimTex: tex, crown: false });
    if (scene === 'deck') return open + deckSvg(tex, a) + '</svg>';
    if (scene === 'fence') return open + fenceSvg(tex) + '</svg>';
    if (scene === 'siding') return open + houseSvg({ siding: 'wood', sidingTex: tex }) + '</svg>';
    if (scene === 'door') return open + houseSvg({ siding: 'fiber', doorTex: tex }) + '</svg>';
    return sceneSvg('room', { label, furniture: 'sofa', floorTex: Object.assign({ t: 'floor', kind: 'wood' }, tex) });
  }
  // A deck behind the house, seen from the yard: deck boards in perspective, railings, and chairs or a pergola.
  function deckSvg(tex, a) {
    const posts = side => [0.08, 0.5, 0.92].map(t => { const xb = side === 'l' ? 225 * t : 800 - 135 * t, yb = 480 - 126 * t, h = 0.5 * (yb - 200); return { x: xb, yb, yt: yb - h, w: Math.max(6, 16 * (yb - 200) / 280) }; });
    const rail = side => {
      const ps = posts(side);
      const top = ps.map(p => `${p.x},${p.yt}`).join(' ');
      const bal = []; for (let t = 0.1; t < 0.95; t += 0.045) { const xb = side === 'l' ? 225 * t : 800 - 135 * t, yb = 480 - 126 * t, h = 0.5 * (yb - 200); bal.push(`<line x1="${xb}" y1="${yb}" x2="${xb}" y2="${yb - h}" stroke="url(#ptRailV)" stroke-width="${Math.max(2, 5 * (yb - 200) / 280)}"/>`); }
      return `${bal.join('')}${ps.map(p => `<rect x="${p.x - p.w / 2}" y="${p.yt - 4}" width="${p.w}" height="${p.yb - p.yt + 4}" fill="url(#ptRailV)"/><rect x="${p.x - p.w / 2}" y="${p.yt - 4}" width="${p.w}" height="${p.yb - p.yt + 4}" fill="#000" opacity=".12"/>`).join('')}<polyline points="${top}" fill="none" stroke="url(#ptRail)" stroke-width="${10}" stroke-linejoin="round"/><polyline points="${top}" fill="none" stroke="#000" stroke-opacity=".15" stroke-width="2" transform="translate(0 5)"/>`;
    };
    const chairs = a.target === 'outdoor';
    const pergola = a.target === 'pergola';
    const chair = (x, s, flip) => `<g transform="translate(${x} ${390 - 60 * s}) scale(${s}) ${flip ? 'scale(-1 1)' : ''}">
        <ellipse cx="0" cy="96" rx="58" ry="8" fill="#000" opacity=".25" filter="url(#rfShadow)"/>
        ${[-30, -15, 0, 15, 30].map(dx => `<rect x="${dx - 6}" y="-10" width="12" height="70" rx="5" fill="url(#ptRailV)"/>`).join('')}
        <rect x="-46" y="38" width="92" height="12" rx="3" fill="url(#ptRail)"/><rect x="-50" y="50" width="100" height="22" rx="3" fill="url(#ptRail)"/>
        <rect x="-56" y="30" width="22" height="7" rx="2" fill="url(#ptRail)"/><rect x="34" y="30" width="22" height="7" rx="2" fill="url(#ptRail)"/>
        <rect x="-50" y="56" width="7" height="40" fill="url(#ptRailV)"/><rect x="43" y="56" width="7" height="40" fill="url(#ptRailV)"/>
        <rect x="-50" y="-10" width="100" height="106" fill="#000" opacity=".06"/></g>`;
    return `<defs>${DEFS_COMMON}${INTERIOR_DEFS}
        ${pattern('ptRail', Object.assign({}, tex, { t: 'boards', w: 400, h: 40, cm: 0.6, board: 12, seed: 9 }), 400, 40)}
        ${pattern('ptRailV', Object.assign({}, tex, { t: 'boards', w: 40, h: 300, cm: 0.6, board: 12, vertical: true, seed: 12 }), 40, 300)}
        <linearGradient id="rgEaveD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
        <linearGradient id="rgDeckShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".5" stop-color="#000" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient>
        <radialGradient id="rgNight" cx="0.5" cy="0.6" r="0.8"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient></defs>
      <rect x="0" y="0" width="800" height="480" fill="url(#rgSky)"/>
      <ellipse class="r-tree" cx="60" cy="210" rx="120" ry="150"/><ellipse class="r-tree" cx="760" cy="200" rx="110" ry="160"/>
      <ellipse cx="60" cy="210" rx="120" ry="150" fill="#000" opacity=".15"/><ellipse cx="760" cy="200" rx="110" ry="160" fill="#000" opacity=".22"/>
      <rect class="r-lawn" x="0" y="330" width="800" height="40"/>
      <rect class="r-body" x="150" y="40" width="600" height="314"/>
      <polygon class="r-roof" points="110,0 790,0 790,30 110,30"/><rect class="r-xtrim" x="120" y="28" width="660" height="12"/><rect x="150" y="40" width="600" height="18" fill="url(#rgEaveD)"/>
      <g stroke="#000" stroke-opacity=".12" stroke-width="1.2">${Array.from({ length: 23 }, (_, i) => `<line x1="150" y1="${52 + i * 13}" x2="750" y2="${52 + i * 13}"/>`).join('')}</g>
      <rect class="r-xtrim" x="365" y="148" width="200" height="206"/><rect class="r-glass" x="375" y="158" width="88" height="196"/><rect class="r-glass" x="467" y="158" width="88" height="196"/>
      <rect x="375" y="158" width="180" height="196" fill="url(#rgSky)" opacity=".35"/>
      <rect class="r-xtrim" x="196" y="118" width="112" height="112"/><rect class="r-glass" x="204" y="126" width="96" height="96"/><rect x="204" y="126" width="96" height="96" fill="url(#rgSky)" opacity=".35"/>
      <rect class="r-xtrim" x="610" y="118" width="112" height="112"/><rect class="r-glass" x="618" y="126" width="96" height="96"/><rect x="618" y="126" width="96" height="96" fill="url(#rgSky)" opacity=".35"/>
      <circle class="r-lamp-glow" cx="590" cy="190" r="80" fill="url(#rgLamp)"/><rect x="584" y="178" width="12" height="20" rx="2" fill="#2b2b2b"/>
      <image data-tex="${esc(JSON.stringify(Object.assign({ t: 'floor', kind: 'deck' }, tex)))}" x="0" y="354" width="800" height="126" preserveAspectRatio="none"/>
      <rect x="0" y="354" width="800" height="126" fill="url(#rgDeckShade)"/>
      <rect x="150" y="350" width="600" height="6" fill="#000" opacity=".18"/>
      ${pergola ? `<g>${[230, 330, 430, 530, 630].map((x, i) => `<rect x="${x}" y="0" width="16" height="30" fill="url(#ptRailV)"/>`).join('')}<rect x="0" y="24" width="800" height="18" fill="url(#ptRail)"/><rect x="0" y="40" width="800" height="5" fill="#000" opacity=".18"/>${[60, 740].map(x => `<rect x="${x - 12}" y="24" width="24" height="440" fill="url(#ptRailV)"/><rect x="${x - 12}" y="24" width="24" height="440" fill="#000" opacity=".1"/>`).join('')}</g>` : ''}
      ${rail('l')}${rail('r')}
      ${chairs ? chair(320, 0.95) + chair(500, 0.95, true) + '<rect x="384" y="410" width="60" height="8" rx="2" fill="url(#ptRail)"/><rect x="390" y="418" width="6" height="22" fill="url(#ptRailV)"/><rect x="432" y="418" width="6" height="22" fill="url(#ptRailV)"/>' : `<ellipse cx="660" cy="452" rx="34" ry="7" fill="#000" opacity=".25" filter="url(#rfShadow)"/><path d="M636 404 h48 l-6 48 h-36z" fill="#b6a58e"/><g fill="#5e7a4c"><ellipse cx="660" cy="392" rx="30" ry="20"/><ellipse cx="648" cy="380" rx="16" ry="12" fill="#6b8a58"/></g>`}
      <rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/>`;
  }
  // A fence across a back yard, straight on: boards with gaps, posts and a top cap.
  function fenceSvg(tex) {
    return `<defs>${DEFS_COMMON}
        ${pattern('ptPost', Object.assign({}, tex, { t: 'boards', w: 30, h: 260, cm: 0.6, board: 9, vertical: true, seed: 21 }), 30, 260)}
        ${pattern('ptCap', Object.assign({}, tex, { t: 'boards', w: 400, h: 14, cm: 0.7, board: 9, seed: 23 }), 400, 14)}
        <radialGradient id="rgNight" cx="0.5" cy="0.6" r="0.8"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>
        <linearGradient id="rgFenceShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>
        <linearGradient id="rgLawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient></defs>
      <rect x="0" y="0" width="800" height="480" fill="url(#rgSky)"/>
      <ellipse class="r-tree" cx="140" cy="170" rx="150" ry="120"/><ellipse class="r-tree" cx="520" cy="150" rx="190" ry="130"/><ellipse class="r-tree" cx="790" cy="190" rx="120" ry="110"/>
      <ellipse cx="520" cy="150" rx="190" ry="130" fill="#000" opacity=".14"/>
      <rect class="r-lawn" x="0" y="330" width="800" height="150"/><rect x="0" y="330" width="800" height="150" fill="url(#rgLawn)"/>
      <rect x="0" y="162" width="800" height="186" fill="#1f2a1e" opacity=".72"/>
      <image data-tex="${esc(JSON.stringify(Object.assign({ t: 'boards', w: 800, h: 190, cm: 0.55, board: 14, gap: 0.7, vertical: true, seed: 6 }, tex)))}" x="0" y="160" width="800" height="190" preserveAspectRatio="none"/>
      <rect x="0" y="160" width="800" height="190" fill="url(#rgFenceShade)"/>
      ${[0, 200, 400, 600, 800].map(x => `<rect x="${x - 13}" y="148" width="26" height="206" fill="url(#ptPost)"/><rect x="${x - 13}" y="148" width="26" height="206" fill="#000" opacity=".14"/><rect x="${x - 16}" y="142" width="32" height="8" fill="url(#ptCap)"/>`).join('')}
      <rect x="0" y="154" width="800" height="10" fill="url(#ptCap)"/><rect x="0" y="163" width="800" height="3" fill="#000" opacity=".2"/>
      <rect x="0" y="346" width="800" height="10" fill="#000" opacity=".14" filter="url(#rfShadow)"/>
      ${[[90, 360, 60, 26], [300, 366, 46, 20], [560, 362, 70, 28], [720, 366, 40, 18]].map(([x, y, rx, ry]) => `<ellipse class="r-shrub" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/><ellipse cx="${x - rx * 0.3}" cy="${y - ry * 0.4}" rx="${rx * 0.5}" ry="${ry * 0.4}" fill="#fff" opacity=".06"/>`).join('')}
      <rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/>`;
  }

  // ================================================================
  // KIOSK MODE: a touch screen on the store floor
  // Bigger buttons, no install prompt, settings behind a 3-second hold on the logo, and it starts over by
  // itself (clearing saved colors) when nobody has touched it for two minutes.
  // ================================================================
  const KIOSK_IDLE = 120000, KIOSK_WARN = 15;
  let kioskTimer = 0, kioskTick = 0, kioskLeft = 0, holdTimer = 0, holdFired = false;
  const isKiosk = () => settings.audience === 'kiosk';
  function applyAudience() {
    const k = isKiosk();
    document.documentElement.classList.toggle('kiosk', k);
    $('#settingsBtn').hidden = k;
    updateInstallUi();
    kioskArm();
  }
  const kioskAtStart = () => state.view === 'find' && !state.results && state.step === 0 && JSON.stringify(state.answers) === JSON.stringify(freshAnswers()) &&$('#detailSheet').hidden && $('#settingsSheet').hidden && $('#infoModal').hidden && $('#present').hidden && !shortlist.length;
  function kioskArm() {
    clearTimeout(kioskTimer); clearInterval(kioskTick);
    const w = $('#kioskIdle'); if (w) w.hidden = true;
    if (isKiosk()) kioskTimer = setTimeout(kioskWarn, KIOSK_IDLE);
  }
  function kioskWarn() {
    if (!$('#onboard').hidden || kioskAtStart()) { kioskArm(); return; } // nothing to clear
    let w = $('#kioskIdle');
    if (!w) {
      w = document.createElement('div'); w.id = 'kioskIdle'; w.className = 'kiosk-idle'; w.setAttribute('role', 'alertdialog'); w.setAttribute('aria-labelledby', 'kioskIdleT');
      w.innerHTML = '<div class="kiosk-idle-card"><h2 id="kioskIdleT">Still there?</h2><p>Starting over in <b id="kioskIdleN"></b> seconds so the next person gets a fresh start.</p><button type="button" class="btn primary" data-act="kiosk-stay">I’m still here</button></div>';
      document.body.appendChild(w);
    }
    kioskLeft = KIOSK_WARN; $('#kioskIdleN').textContent = kioskLeft; w.hidden = false;
    $('[data-act="kiosk-stay"]', w).focus({ preventScroll: true });
    kioskTick = setInterval(() => { kioskLeft--; const n = $('#kioskIdleN'); if (n) n.textContent = Math.max(0, kioskLeft); if (kioskLeft <= 0) kioskReset(); }, 1000);
  }
  function kioskReset() {
    clearInterval(kioskTick);
    closeSheet($('#detailSheet')); closeSheet($('#settingsSheet')); closeInfo();
    $('#present').hidden = true; $('#calModal').hidden = true; $('#installModal').hidden = true;
    shortlist = []; saveShortlist(); updateShortCount();
    state.detailStack = []; state.query = '';
    startOver();
    window.scrollTo(0, 0);
    kioskArm();
  }
  ['pointerdown', 'keydown', 'wheel'].forEach(ev => document.addEventListener(ev, () => { if (isKiosk()) kioskArm(); }, { passive: true, capture: true }));
  // hold the logo for 3 seconds to reach settings (a plain tap still starts a new search)
  const homeBtn = $('#homeBtn');
  homeBtn.addEventListener('pointerdown', () => { holdFired = false; clearTimeout(holdTimer); if (isKiosk()) holdTimer = setTimeout(() => { holdFired = true; openSettings(); }, 3000); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => homeBtn.addEventListener(ev, () => clearTimeout(holdTimer)));
  homeBtn.addEventListener('click', e => { if (holdFired) { holdFired = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  homeBtn.addEventListener('contextmenu', e => { if (isKiosk()) e.preventDefault(); });

  // expose a tiny surface for debugging and tests
  window.ColorGenius = { state, settings: () => settings, recommend: () => E.recommend(state.answers, engineSettings()), kioskReset, kioskWarn };
  applyAudience();
  boot();
})();
