/* ColorGenius app: views, interactions and animation. Depends on CG.color and CG.engine. */
(function () {
  'use strict';
  const C = window.CG.color, E = window.CG.engine;
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
    theme: 'system', reduceMotion: false, lines: {}, audience: '', onboarded: false,
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
    view: 'find', step: 0, answers: clone(E.DEFAULT_ANSWERS), results: null,
    gridLight: 'none', roomLight: 'daylight', detailId: null, detailStack: [], query: '',
    screen: detectScreen(), stylePalettes: {}, ready: false, ftype: {},
  };
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
  const brandName = id => (E.getIndex().brandById[id] || {}).name || id;
  function brandsEnabled() {
    const out = {};
    for (const b of brandList()) out[b.id] = settings.brands[b.id] != null ? !!settings.brands[b.id] : b.group === 'us' || b.group === 'custom';
    return out;
  }
  function engineSettings() {
    return { resultCount: settings.resultCount, showDiscontinued: settings.showDiscontinued, brands: brandsEnabled(), storeBrand: settings.storeBrand, storeOnly: settings.storeOnly && !!settings.storeBrand, inStoreSamples: settings.inStoreSamples };
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
    if (view === 'find') renderFind();
    if (view === 'lookup') renderLookup();
    if (view === 'shortlist') renderShortlist();
    window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  }
  window.addEventListener('hashchange', () => { if (state.ready) route(location.hash.replace('#', '')); });

  // ================================================================
  // FIND: question flow
  // ================================================================
  function steps() {
    const sp = E.SPACES[state.answers.space] || E.SPACES.living;
    const list = ['space', 'light', 'look', 'color'];
    if (settings.askFixed) list.push('room');
    return list;
  }
  const STEP_LABEL = { space: 'Space', light: 'Light', look: 'Style', color: 'Color', room: 'Room' };

  const SPACE_SUB = {
    living: 'Main gathering space', bedroom: 'Rest and sleep', kitchen: 'Needs a cleanable finish', bathroom: 'Moisture, small windows', dining: 'Often seen at night',
    office: 'Focus and video calls', kids: 'Fun but washable', nursery: 'Soft and calm', entry: 'High traffic, first impression', basement: 'Little daylight',
    accent: 'One feature wall', ceiling: 'Overhead', trim: 'Baseboards, casing, doors', cabinets: 'Kitchen or bath',
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
    const optional = id === 'look' || id === 'color' || id === 'room';
    host.innerHTML = `
      <div class="wizard">
        <div class="progress" style="--steps:${list.length}">
          ${list.map((s, i) => `<button type="button" class="progress-step ${i < state.step ? 'done' : ''} ${i === state.step ? 'current' : ''}" data-goto="${i}" ${i > state.step ? 'disabled' : ''}><span class="bar"></span><span class="lbl">${i + 1}. ${s === 'room' && (E.SPACES[state.answers.space] || {}).kind === 'exterior' ? 'House' : STEP_LABEL[s]}</span></button>`).join('')}
        </div>
        <div class="step-stage"><div class="step" id="stepBody">${stepHtml(id)}</div></div>
      </div>
      <nav class="wizard-nav" aria-label="Question navigation"><div class="wizard-nav-inner">
          <button type="button" class="btn ghost nav-back" data-act="back" ${state.step === 0 ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>Back</button>
          <span class="spacer"></span>
          <button type="button" class="btn ghost nav-skip" data-act="${last ? 'skipall' : 'skip'}" ${optional ? '' : 'disabled aria-hidden="true" tabindex="-1" style="visibility:hidden"'}>Skip</button>
          <button type="button" class="btn primary nav-next" data-act="next">${last ? 'Show colors' : 'Next'}
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></nav>`;
    const body = $('#stepBody');
    if (dir && !reduced()) body.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (id === 'look') fillStylePalettes();
  }

  function stepHtml(id) {
    const a = state.answers;
    const sp = E.SPACES[a.space] || E.SPACES.living;
    if (id === 'space') {
      const groups = [['Rooms', ['living', 'bedroom', 'kitchen', 'bathroom', 'dining', 'office', 'kids', 'nursery', 'entry', 'basement']], ['Surfaces', ['accent', 'ceiling', 'trim', 'cabinets']], ['Outside', ['ext_body', 'ext_trim', 'front_door']]];
      const sizeQ = sp.kind === 'interior' && !['ceiling', 'trim', 'cabinets'].includes(sp.surface);
      return `
        <div class="step-head"><p class="eyebrow">Question 1</p><h1>What’s being painted?</h1></div>
        ${groups.map(([g, ids]) => `<div class="group"><p class="section-title">${g}</p><div class="options">${ids.map(k => optBtn(`data-space="${k}"`, a.space === k, `<span class="opt-title">${esc(E.SPACES[k].label)}</span><span class="opt-sub">${esc(SPACE_SUB[k])}</span>`)).join('')}</div></div>`).join('')}
        ${sizeQ ? `<div class="group"><p class="group-label">How big is the room?</p>${seg('size', { small: 'Small', medium: 'Medium', large: 'Large or open plan' }, a.size, 'Room size')}</div>` : ''}
        ${a.space === 'ext_body' ? `<div class="group"><p class="group-label">What is the siding? <span class="hint">Vinyl limits how dark it can go</span></p>${seg('siding', E.SIDING, a.siding, 'Siding')}</div>` : ''}`;
    }
    if (id === 'light') {
      const ext = sp.kind === 'exterior';
      const pos = { north: [50, 7], east: [93, 50], south: [50, 93], west: [7, 50] };
      const dir = a.facing;
      const glow = GLOW[dir] ? `background: linear-gradient(${{ north: '180deg', south: '0deg', east: '270deg', west: '90deg' }[dir]}, ${GLOW[dir]}, transparent 70%)` : '';
      return `
        <div class="step-head"><p class="eyebrow">Question 2</p><h1>${ext ? 'Which way does this side of the house face?' : 'Which way do the main windows face?'}</h1><p>${ext ? 'Sun exposure changes how light or dark an exterior color reads.' : 'Window direction changes the color and strength of daylight in the room.'}</p></div>
        <div class="light-grid">
          <div>
            <div class="compass">
              <div class="compass-ring"></div>
              <div class="compass-room ${GLOW[dir] ? 'has-dir' : ''}"><span class="glow" style="${glow}"></span><span>${ext ? 'House' : 'The room'}</span></div>
              ${Object.entries(pos).map(([k, [x, y]]) => `<button type="button" class="compass-btn" style="left:${x}%;top:${y}%" data-facing="${k}" aria-pressed="${dir === k}" aria-label="${E.FACING[k]}">${k[0].toUpperCase()}</button>`).join('')}
            </div>
          </div>
          <div class="group" style="gap:18px">
            <div class="seg" role="group" aria-label="Other options">
              <button type="button" data-facing="unsure" aria-pressed="${dir === 'unsure'}">Not sure</button>
              ${ext ? '' : `<button type="button" data-facing="none" aria-pressed="${dir === 'none'}">No windows</button>`}
            </div>
            <p class="light-note" id="lightNote">${esc(LIGHT_NOTE[dir] || '')}</p>
            <div class="group"><p class="group-label">${ext ? 'Sun exposure' : 'How much daylight?'}</p>${ext ? seg('amount', { low: 'Mostly shade', medium: 'Partial sun', high: 'Full sun' }, a.amount, 'Sun exposure') : seg('amount', E.AMOUNTS, a.amount, 'Daylight')}</div>
            ${!ext && settings.askBulbs ? `<div class="group"><p class="group-label">What bulbs are in the room?</p>${seg('bulbs', E.BULBS, a.bulbs, 'Bulbs')}</div>` : ''}
          </div>
        </div>`;
    }
    if (id === 'look') {
      return `
        <div class="step-head"><p class="eyebrow">Question 3</p><h1>What style?</h1><p>Pick up to two. The swatches are real colors from the brands you have turned on.</p></div>
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
        <div class="step-head"><p class="eyebrow">Question 4</p><h1>What kind of ${sp.surface === 'ceiling' ? 'ceiling' : 'trim'} color?</h1><p>One tap. Skip to get the most popular whites.</p></div>
        <div class="options wide">
          ${Object.entries(wt).map(([k, v]) => optBtn(`data-white="${k}"`, a.whiteType === k, `<span class="opt-title">${esc(v)}</span><span class="chips">${sample[k].map(h => `<span style="background:#${h}"></span>`).join('')}</span>`)).join('')}
        </div>`;
      }
      return `
        <div class="step-head"><p class="eyebrow">Question 4</p><h1>Which colors?</h1><p>Pick any that apply, or skip to let the style decide.</p></div>
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
        <div class="step-head"><p class="eyebrow">Question 5</p><h1>${ext ? 'What else is on the house?' : `What\u2019s staying ${esc(where)}?`}</h1><p>Tap what matches. One per row unless noted; skip anything that doesn\u2019t apply.</p></div>
        ${groups.map(g => `<div class="group mgroup"><p class="group-label">${esc(g.title)}${g.max ? ` <span class="hint">up to ${g.max}</span>` : ''}</p>
          ${g.types ? typeRows(g, a) : ''}
          <div class="mchips"${g.types ? ' hidden' : ''}>
            ${(g.types ? [] : g.ids || []).map(fid => itemChip(E.FIXED_ITEMS.find(x => x.id === fid), g, a)).join('')}
            ${Object.entries(g.flags || {}).map(([k, v]) => `<button type="button" class="mchip mchip-flag" data-flag="${k}" aria-pressed="${!!a[k]}"><span class="msw flag-sw" aria-hidden="true">${k === 'crown' ? '<svg viewBox="0 0 20 20" width="14" height="14"><path d="M3 6h14M4 9h12M6 12h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' : '<svg viewBox="0 0 20 20" width="14" height="14"><path d="M4 14l8-8 3 3-8 8H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'}</span>${esc(v)}</button>`).join('')}
          </div></div>`).join('')}
        <div class="group mgroup">
          ${custom.length ? `<div class="custom-list">${custom.map((x, i) => `<span class="custom-chip"><i style="background:#${esc(x.hex)}"></i>${esc(x.label)}<button type="button" data-remove-custom="${i}" aria-label="Remove ${esc(x.label)}">\u00d7</button></span>`).join('')}</div>` : ''}
          <details class="custom-more" ${state.customOpen ? 'open' : ''}><summary>+ Add something else</summary>
            <div class="custom-add">
              <input type="text" id="cfLabel" class="cg-input" maxlength="40" placeholder="Name it, e.g. area rug" aria-label="Item name" autocomplete="off">
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

  function goStep(i, dir) { state.step = i; renderWizard(dir); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); }
  function finishWizard() { state.results = E.recommend(state.answers, engineSettings()); state.gridLight = 'none'; state.roomLight = E.lightForAnswers(state.answers); renderResults(true); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); }

  $('#view-find').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    const a = state.answers;
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
      if (sp.kind === 'exterior' && (a.facing === 'none')) a.facing = 'unsure';
      rerenderStep();
      return;
    }
    if (t.dataset.facing) { a.facing = t.dataset.facing; if (a.facing === 'none') a.amount = 'low'; rerenderStep(); return; }
    if (t.dataset.seg) { a[t.dataset.seg] = t.dataset.val; $$(`[data-seg="${t.dataset.seg}"]`).forEach(b => b.setAttribute('aria-pressed', b.dataset.val === t.dataset.val)); return; }
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
    const act = t.dataset.act;
    if (act === 'back' && state.step > 0) goStep(state.step - 1, -1);
    if (act === 'next' || act === 'skip') {
      const id = steps()[state.step];
      if (act === 'skip') { if (id === 'look') a.styles = []; if (id === 'color') { a.families = []; a.depth = 'any'; a.whiteType = ''; } if (id === 'room') { a.fixed = []; a.customFixed = []; a.trimPaint = false; a.crown = false; } }
      if (state.step < steps().length - 1) goStep(state.step + 1, 1); else finishWizard();
    }
    if (act === 'skipall') { a.fixed = []; a.customFixed = []; a.trimPaint = false; a.crown = false; finishWizard(); }
  });
  function rerenderStep() {
    const id = steps()[state.step];
    const body = $('#stepBody'); if (!body) return;
    const y = window.scrollY;
    body.innerHTML = stepHtml(id);
    // the step count can change (exterior has no room step)
    const prog = $('.progress');
    if (prog && prog.children.length !== steps().length) { renderWizard(0); }
    if (id === 'look') fillStylePalettes();
    window.scrollTo(0, y);
  }
  function toggleIn(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

  // ================================================================
  // RESULTS
  // ================================================================
  const PHRASE = { living: 'a living room', bedroom: 'a bedroom', kitchen: 'a kitchen', bathroom: 'a bathroom', dining: 'a dining room', office: 'a home office', kids: 'a kids’ room', nursery: 'a nursery', entry: 'an entry or hallway', basement: 'a basement', accent: 'an accent wall', ceiling: 'a ceiling', trim: 'trim and doors', cabinets: 'cabinets', ext_body: 'house siding', ext_trim: 'exterior trim', front_door: 'a front door' };
  function resultTitle(a) {
    let p = PHRASE[a.space] || 'this space';
    const sp = E.SPACES[a.space] || {};
    let adj = '';
    if (sp.kind === 'interior' && ['north', 'south', 'east', 'west'].includes(a.facing)) adj = `${a.facing}-facing`;
    if (sp.kind === 'interior' && a.facing === 'none') adj = 'windowless';
    if (adj && /^an? /.test(p)) p = (/^[aeiou]/.test(adj) ? 'an ' : 'a ') + adj + ' ' + p.replace(/^an? /, '');
    return `Colors for ${p}`;
  }
  function summaryChips(a) {
    const out = [];
    const st = steps();
    const idx = id => st.indexOf(id);
    out.push([idx('space'), E.SPACES[a.space].label + (a.space === 'ext_body' ? ` · ${E.SIDING[a.siding]}` : '')]);
    const lightBits = [];
    if (a.facing && a.facing !== 'unsure') lightBits.push(a.facing === 'none' ? 'No windows' : `${E.FACING[a.facing]} light`);
    lightBits.push(E.SPACES[a.space].kind === 'exterior' ? { low: 'Shade', medium: 'Partial sun', high: 'Full sun' }[a.amount] : E.AMOUNTS[a.amount]);
    if (a.bulbs !== 'unsure' && settings.askBulbs && E.SPACES[a.space].kind === 'interior') lightBits.push(E.BULBS[a.bulbs].replace(/ \(.*/, '') + ' bulbs');
    out.push([idx('light'), lightBits.join(' · ')]);
    out.push([idx('look'), a.styles.length ? a.styles.map(s => E.STYLES[s].label).join(' + ') : 'Any style']);
    const wt = E.WHITE_TYPES[(E.SPACES[a.space] || {}).surface];
    if (wt) out.push([idx('color'), a.whiteType ? wt[a.whiteType] : 'Popular whites']);
    else out.push([idx('color'), (a.families.length ? a.families.map(f => E.FAMILY_CHOICES[f]).join(', ') : 'Any color') + (a.depth !== 'any' ? ` · ${E.DEPTHS[a.depth]}` : '')]);
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
  function lightBar(current, name) {
    const opts = [{ id: 'none', label: 'Chip color' }].concat(E.LIGHTS);
    return `<div class="lightbar"><span class="eyebrow">See it in</span><div class="seg" role="group" aria-label="Light preview">${opts.map(l => `<button type="button" data-light-pick="${name}" data-val="${l.id}" aria-pressed="${current === l.id}">${esc(l.label)}</button>`).join('')}</div></div>`;
  }

  function renderResults(animate) {
    const host = $('#view-find');
    const R = state.results;
    const a = R.answers;
    if (!R.results.length) {
      host.innerHTML = `<div class="empty"><h1>No colors to show</h1><p>All brands may be turned off, or the store-brand-only setting has no brand selected.</p><div style="display:flex;gap:8px"><button type="button" class="btn primary" data-act="settings">Open settings</button><button type="button" class="btn" data-act="edit">Edit answers</button></div></div>`;
      return;
    }
    const st = steps();
    host.innerHTML = `
      <div class="results-head">
        <p class="eyebrow">${R.results.length} options · picked from ${fmt(R.poolSize)} colors</p>
        <h1>${esc(resultTitle(a))}</h1>
        <div class="summary">${summaryChips(a).filter(x => x[0] >= 0).map(([i, label]) => `<button type="button" data-edit="${i}" aria-label="Change: ${esc(label)}">${esc(label)}</button>`).join('')}</div>
      </div>
      <div class="results-tools">
        ${settings.lightPreview ? lightBar(state.gridLight, 'grid') : '<span></span>'}
        <div class="tool-btns"><button type="button" class="btn small" data-compare="results">Compare</button><button type="button" class="btn small" data-act="edit">Edit answers</button><button type="button" class="btn small primary" data-act="restart">Start over</button></div>
      </div>
      ${(R.notices || []).map((w, i) => `<div class="warn ${w.level === 'heads-up' ? 'headsup' : w.level}" style="--i:${i};margin-bottom:16px"><b>${esc(w.title)}</b><span>${esc(w.text)}</span></div>`).join('')}
      <div class="grid" id="resultGrid">${R.results.map(r => chipCard(r.color, { role: r.role, flags: flagsFor(r), light: state.gridLight })).join('')}</div>
      <div class="tips">${withPaintTip(R).map(t => `<div class="tip-card"><b>${esc(t.title)}</b><p>${esc(t.text)}</p>${t.title === 'Finish' ? `<button type="button" class="btn small" data-sheens="${esc(R.results[0].color.id)}" style="justify-self:start;margin-top:6px">Compare sheens</button>` : ''}</div>`).join('')}</div>
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
    if (t.dataset.edit != null) { const i = +t.dataset.edit; state.results = null; state.step = i; renderWizard(-1); return; }
    if (t.dataset.act === 'edit') { state.results = null; state.step = 0; renderWizard(-1); return; }
    if (t.dataset.act === 'restart') { startOver(); return; }
    if (t.dataset.act === 'settings') { openSettings(); return; }
  });
  function startOver() {
    if (typeof updateWaiting !== 'undefined' && updateWaiting) { applyUpdate(); return; }
    state.answers = clone(E.DEFAULT_ANSWERS); state.results = null; state.step = 0; state.ftype = {}; state.customOpen = false;
    if (state.view !== 'find') route('find'); else renderWizard(-1);
  }

  // shared clicks: open chip, star, light preview
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.open) { openDetail(t.dataset.open, !!t.closest('#detailSheet')); return; }
    if (t.dataset.star) { toggleStar(t.dataset.star); return; }
    if (t.dataset.lightPick) {
      const which = t.dataset.lightPick, val = t.dataset.val;
      if (which === 'grid') state.gridLight = val; else if (which === 'room') state.roomLight = val; else state.presentLight = val;
      $$(`[data-light-pick="${which}"]`).forEach(b => b.setAttribute('aria-pressed', b.dataset.val === val));
      const scope = which === 'grid' ? document.querySelector('.view:not([hidden])') : which === 'room' ? $('#detailSheet') : $('#present');
      $$('[data-hex]', scope).forEach(el => { if (el.dataset.lightLocked) return; el.dataset.light = val; el.style.backgroundColor = paint(el.dataset.hex, val); });
      if (which === 'room') updateRoomScene();
      return;
    }
  });

  function toggleStar(id) {
    const i = shortlist.indexOf(id);
    if (i >= 0) shortlist.splice(i, 1); else shortlist.push(id);
    saveShortlist();
    const on = shortlist.includes(id);
    $$(`[data-star="${CSS.escape(id)}"]`).forEach(b => { b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', (on ? 'Remove from' : 'Add to') + ' shortlist'); });
    $$(`[data-star-text="${CSS.escape(id)}"]`).forEach(b => { b.textContent = on ? 'Remove from shortlist' : 'Add to shortlist'; });
    updateShortCount(true);
    const c = E.findColor(id);
    toast(on ? `Added ${c ? c.name : 'color'} to the shortlist` : 'Removed from the shortlist');
    if (state.view === 'shortlist') renderShortlist();
  }
  function updateShortCount(bump) {
    const el = $('#shortCount');
    const n = shortlist.filter(id => E.findColor(id)).length;
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
    const pairs = E.pairings(c);
    const matches = settings.showMatches ? E.matchesFor(c, { brands: brandsEnabled(), showDiscontinued: settings.showDiscontinued }).slice(0, 8) : [];
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
          ${sceneSvg(kind, { label: sceneLabel, siding: answers.siding, furniture: sceneFurniture(answers.space) })}
          <span class="light-label" id="roomLabel"></span>
        </div>
        ${settings.lightPreview ? lightBar(state.roomLight, 'room') : ''}
        <div class="detail-title">
          <h3>${esc(c.name)}</h3>
          <div class="sub"><span>${esc(b.name || c.brand)}</span><span class="mono">${esc(E.codeLabel(c))}</span>${c.flags & E.F.POPULAR ? '<span class="badge good">Best seller</span>' : ''}${c.flags & E.F.DISC ? '<span class="badge">Discontinued</span>' : ''}</div>
        </div>
        <div class="detail-actions">
          <button type="button" class="btn small" data-copy="${esc(`${c.name} — ${b.name} ${E.codeLabel(c)}`)}">Copy name &amp; code</button>
          <button type="button" class="btn small" data-star="${esc(c.id)}" data-star-text="${esc(c.id)}">${starred ? 'Remove from shortlist' : 'Add to shortlist'}</button>
        </div>
        <div class="facts">
          <div class="fact"><span class="k">LRV (lightness)</span><span class="v mono">${c.lrv}${c.flags & E.F.LRV_EST ? ' (calculated)' : ''}</span></div>
          <div class="fact"><span class="k">Depth</span><span class="v">${esc(d.depth)}</span></div>
          <div class="fact"><span class="k">Family</span><span class="v">${esc(d.familyName)}</span></div>
          <div class="fact"><span class="k">Undertone</span><span class="v">${esc(d.undertone === 'neutral' ? 'None (true neutral)' : d.undertone[0].toUpperCase() + d.undertone.slice(1))}</span></div>
          <div class="fact"><span class="k">Use</span><span class="v">${esc(useLabel(c))}</span></div>
          <div class="fact"><span class="k">${['sw', 'valspar', 'hgsw'].includes(c.brand) && c.extra ? 'Strip location' : 'Collection'}</span><span class="v">${esc(c.extra || '—')}</span></div>
          <div class="fact"><span class="k">Screen value</span><span class="v mono">#${c.hex}</span></div>
          <div class="fact"><span class="k">Finish for ${esc(sp.label.toLowerCase())}</span><span class="v">${esc(sp.sheen)}</span><button type="button" class="link-btn" data-sheens="${esc(c.id)}">Compare sheens</button></div>
        </div>
        <p class="muted" style="font-size:13.5px">${esc(d.summary)}.${b.mixNote ? ' ' + esc(b.mixNote) : ''}</p>
        ${sampleNote(c)}
        ${res && res.reasons.length ? `<div class="block"><h4>Why it fits</h4><ul class="reasons">${res.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
        ${paintLineHtml(c, answers)}
        ${prosConsHtml(c, answers, res ? state.results.results.map(r => r.color) : null)}
        ${warnings.length ? `<div class="block"><h4>Warnings &amp; tips${res ? '' : ' for the current answers'}</h4>${warnings.map((w, i) => `<div class="warn ${w.level === 'heads-up' ? 'headsup' : w.level}" style="--i:${i}"><b>${esc(w.title)}</b><span>${esc(w.text)}</span></div>`).join('')}</div>` : ''}
        ${pairs.length ? `<div class="block"><h4>Pairs well with</h4><div class="pairs">${pairs.map(p => `<button type="button" class="pair" data-open="${esc(p.color.id)}"><span class="p-sw" data-hex="${p.color.hex}" style="background-color:${paint(p.color.hex)}"></span><span class="p-text"><span class="p-role">${esc(p.role)}</span><span class="p-name">${esc(p.color.name)}</span><span class="p-code mono">${esc(E.codeLabel(p.color))}</span></span></button>`).join('')}</div></div>` : ''}
        ${settings.showMatches ? `<div class="block"><h4>Closest in other brands</h4>${matches.length ? `<div class="list">${matches.map((m, i) => matchRow(m, i)).join('')}</div><p class="muted" style="font-size:12.5px">Matched by measured color difference (ΔE 2000). Under 2 is hard to tell apart on the wall; always compare chips before mixing a substitute.</p>` : '<p class="muted">Turn on more brands in settings to see matches.</p>'}</div>` : ''}
        <p class="muted" style="font-size:12px">Source: ${esc(b.source || 'brand data')}${b.date ? `, collected ${esc(b.date)}` : ''}. Screen colors are the brand’s digital values; confirm with a physical chip.</p>
      </div>`;
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
    if (space === 'cabinets') Object.assign(p, { cab: c.hex, wall: c.lrv > 75 ? 'D7D1C6' : 'EEEBE4', side: c.lrv > 75 ? 'D7D1C6' : 'EEEBE4', counter: 'ECEAE5', tile: 'F6F5F1', hood: 'B9BDBF' });
    if (space === 'kitchen') Object.assign(p, { cab: c.lrv > 82 ? '3F4A52' : white, counter: 'ECEAE5', tile: 'F6F5F1', hood: 'B9BDBF' });
    if (space === 'bathroom') Object.assign(p, { floor: 'CFCBC4', vanity: c.lrv > 82 ? '5B6770' : white, counter: 'ECEAE5' });
    p.duvet = 'F1F0EC'; p.wood = 'A27B55';
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

  function interiorShell(withDoor) {
    const planks = [];
    for (let x0 = -560; x0 <= 1560; x0 += 96) { const xb = 500 + (x0 - 500) * 0.55; planks.push(`<line x1="${x0}" y1="480" x2="${xb.toFixed(1)}" y2="354"/>`); }
    const seams = [[60, 452, 170, 452], [300, 430, 380, 430], [520, 466, 640, 466], [150, 400, 215, 400], [420, 392, 480, 392], [610, 408, 675, 408], [260, 372, 300, 372], [560, 368, 600, 368]]
      .map(([a, b, c2, d]) => `<line x1="${a}" y1="${b}" x2="${c2}" y2="${d}"/>`).join('');
    // an interior door on the right wall, drawn in that wall's perspective
    const door = withDoor ? `
      <polygon class="r-trim" points="681,135 737,118 737,423 681,377"/>
      <polygon class="r-door" points="686,142 732,127 732,417 686,373"/>
      <polygon points="686,142 732,127 732,417 686,373" fill="#000" opacity=".10"/>
      <g fill="none" stroke="#000" stroke-opacity=".14" stroke-width="1.4"><polygon points="692,158 726,147 726,262 692,266"/><polygon points="692,282 726,279 726,398 692,360"/></g>
      <circle cx="${727}" cy="${279}" r="3.2" fill="#b8963e"/>` : '';
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
      <rect x="225" y="90" width="440" height="264" fill="url(#rgWinGlow)"/>
      <polygon class="r-trim" points="60.5,110 176,130 176,292 60.5,318"/>
      <polygon points="60.5,110 176,130 176,292 60.5,318" fill="#000" opacity=".06"/>
      <g clip-path="url(#rcWin)"><rect x="60" y="100" width="120" height="220" fill="url(#rgSky)"/></g>
      <g class="r-trim-s" stroke-width="4" fill="none"><polygon points="67.5,118.3 168.8,137.5 168.8,283.7 67.5,309.3"/><line x1="118.1" y1="127.9" x2="118.1" y2="296.5"/><line x1="67.5" y1="213.8" x2="168.8" y2="210.6"/></g>
      <polygon class="r-trim" points="56,318 180,292 182,299 56,327"/>
      <polygon class="r-floor" points="0,480 225,354 665,354 800,480"/>
      <g clip-path="url(#rcFloor)" stroke="#000" stroke-opacity=".13" stroke-width="1.4">${planks.join('')}${seams}</g>
      <polygon points="0,480 225,354 665,354 800,480" fill="url(#rgFloor)"/>
      <polygon class="r-sun" points="118,402 236,372 352,404 236,446" filter="url(#rfSoft)"/>
      <rect class="r-trim" x="225" y="341" width="440" height="13"/>
      <polygon class="r-trim" points="0,459 225,341 225,354 0,480"/>
      <polygon class="r-trim" points="665,341 800,459 800,480 665,354"/>
      <polygon points="665,341 800,459 800,480 665,354" fill="#000" opacity=".12"/>
      <rect x="225" y="352" width="440" height="2" fill="#000" opacity=".12"/>
      ${door}`;
  }
  const INTERIOR_DEFS = `
    <linearGradient id="rgCeil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="rgLeft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".85" stop-color="#000" stop-opacity=".02"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></linearGradient>
    <linearGradient id="rgRight" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".8" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
    <linearGradient id="rgBackX" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset=".07" stop-color="#000" stop-opacity="0"/><stop offset=".93" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
    <linearGradient id="rgBackY" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".08"/><stop offset=".12" stop-color="#000" stop-opacity="0"/><stop offset=".9" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".07"/></linearGradient>
    <radialGradient id="rgWinGlow" cx="0.05" cy="0.45" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="rgFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".45" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/></linearGradient>
    <radialGradient id="rgNight" cx="0.36" cy="0.46" r="0.85"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>
    <clipPath id="rcFloor"><polygon points="0,480 225,354 665,354 800,480"/></clipPath>
    <clipPath id="rcWin"><polygon points="67.5,118.3 168.8,137.5 168.8,283.7 67.5,309.3"/></clipPath>`;
  const LAMP = `
      <circle class="r-lamp-glow" cx="288" cy="214" r="120" fill="url(#rgLamp)"/>
      <ellipse cx="288" cy="388" rx="26" ry="5" fill="#000" opacity=".25" filter="url(#rfShadow)"/>
      <line x1="288" y1="230" x2="288" y2="384" stroke="#2d2a27" stroke-width="3.2" stroke-linecap="round"/>
      <ellipse cx="288" cy="385" rx="17" ry="4" fill="#2d2a27"/>
      <polygon class="r-shade" points="264,196 312,196 322,232 254,232"/>`;

  function sceneSvg(kind, opts) {
    const open = `<svg class="room-svg" viewBox="0 0 800 480" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(opts.label)}">`;
    if (kind === 'house') return open + houseSvg(opts) + '</svg>';
    if (kind === 'kitchen') return `${open}<defs>${DEFS_COMMON}${INTERIOR_DEFS}</defs>${interiorShell(false)}
      <!-- upper cabinets and hood -->
      <rect x="236" y="98" width="190" height="98" fill="#000" opacity=".14" filter="url(#rfShadow)" transform="translate(0 6)"/>
      <rect x="474" y="98" width="182" height="98" fill="#000" opacity=".14" filter="url(#rfShadow)" transform="translate(0 6)"/>
      <rect class="r-cab" x="236" y="98" width="190" height="98" rx="2"/><rect class="r-cab" x="474" y="98" width="182" height="98" rx="2"/>
      <g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5"><line x1="331" y1="100" x2="331" y2="194"/><line x1="565" y1="100" x2="565" y2="194"/>
        <rect x="244" y="106" width="79" height="82" rx="1.5"/><rect x="339" y="106" width="79" height="82" rx="1.5"/><rect x="482" y="106" width="75" height="82" rx="1.5"/><rect x="573" y="106" width="75" height="82" rx="1.5"/></g>
      <g fill="#8d8f91"><rect x="318" y="168" width="3" height="18" rx="1.5"/><rect x="341" y="168" width="3" height="18" rx="1.5"/><rect x="554" y="168" width="3" height="18" rx="1.5"/><rect x="576" y="168" width="3" height="18" rx="1.5"/></g>
      <polygon class="r-hood" points="432,98 468,98 474,170 426,170"/><rect class="r-hood" x="420" y="168" width="60" height="12" rx="2"/>
      <!-- backsplash tile -->
      <rect class="r-tile" x="236" y="196" width="420" height="68"/>
      <g stroke="#000" stroke-opacity=".08" stroke-width="1">${Array.from({ length: 4 }, (_, i) => `<line x1="236" y1="${213 + i * 17}" x2="656" y2="${213 + i * 17}"/>`).join('')}${Array.from({ length: 13 }, (_, i) => `<line x1="${270 + i * 32}" y1="196" x2="${270 + i * 32}" y2="264"/>`).join('')}</g>
      <!-- counter and base cabinets -->
      <rect x="228" y="270" width="436" height="80" fill="#000" opacity=".18" filter="url(#rfShadow)" transform="translate(0 8)"/>
      <rect class="r-cab" x="232" y="272" width="428" height="72"/>
      <rect x="236" y="344" width="420" height="10" fill="#2a2725" opacity=".55"/>
      <g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5">${[236, 322, 408, 494, 580].map(x => `<rect x="${x + 4}" y="${x === 408 ? 300 : 278}" width="${74}" height="${x === 408 ? 40 : 62}" rx="1.5"/>`).join('')}<rect x="412" y="278" width="74" height="18" rx="1.5"/></g>
      <g fill="#8d8f91">${[236, 322, 494, 580].map(x => `<rect x="${x + 30}" y="284" width="22" height="3" rx="1.5"/>`).join('')}<rect x="438" y="285" width="22" height="3" rx="1.5"/><rect x="438" y="310" width="22" height="3" rx="1.5"/></g>
      <rect class="r-counter" x="226" y="262" width="440" height="11" rx="2"/>
      <rect x="226" y="271" width="440" height="3" fill="#000" opacity=".12"/>
      <rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/></svg>`;
    // room
    const art = (x, y, w, h) => `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#000" opacity=".12" filter="url(#rfShadow)" transform="translate(3 5)"/>
      <rect class="r-frame" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>
      <rect class="r-trim" x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}"/>
      <rect class="r-art" x="${x + 21}" y="${y + 20}" width="${w - 42}" height="${h - 40}"/>
      <rect class="r-art2" x="${x + 21}" y="${y + h - 46}" width="${w - 42}" height="${26}"/>`;
    const furniture = opts.furniture || 'sofa';
    if (furniture === 'bed') return `${open}<defs>${DEFS_COMMON}${INTERIOR_DEFS}</defs>${interiorShell(true)}
      ${art(412, 140, 132, 84)}
      <ellipse cx="478" cy="396" rx="190" ry="14" fill="#000" opacity=".24" filter="url(#rfShadow)"/>
      <rect class="r-sofa-d" x="384" y="252" width="188" height="92" rx="8"/>
      <polygon class="r-duvet" points="378,318 578,318 616,396 340,396"/>
      <polygon points="378,318 578,318 616,396 340,396" fill="#000" opacity=".05"/>
      <path d="M352 372 Q478 360 604 372" fill="none" stroke="#000" stroke-opacity=".10" stroke-width="2"/>
      <rect class="r-duvet" x="398" y="296" width="72" height="28" rx="10"/><rect class="r-duvet" x="486" y="296" width="72" height="28" rx="10"/>
      <rect x="398" y="296" width="72" height="28" rx="10" fill="#000" opacity=".04"/><rect x="486" y="296" width="72" height="28" rx="10" fill="#000" opacity=".04"/>
      <rect class="r-sofa-l" x="340" y="388" width="276" height="10" rx="3"/>
      ${[322, 594].map(x => `<rect x="${x - 3}" y="314" width="66" height="50" rx="3" fill="#000" opacity=".16" filter="url(#rfShadow)"/><rect class="r-wood" x="${x}" y="312" width="60" height="50" rx="3"/><line x1="${x + 4}" y1="335" x2="${x + 56}" y2="335" stroke="#000" stroke-opacity=".18"/><circle class="r-lamp-glow" cx="${x + 30}" cy="282" r="70" fill="url(#rgLamp)"/><rect x="${x + 28}" y="288" width="4" height="24" fill="#3a3632"/><polygon class="r-shade" points="${x + 18},270 ${x + 42},270 ${x + 47},290 ${x + 13},290"/>`).join('')}
      <rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/></svg>`;
    if (furniture === 'vanity') return `${open}<defs>${DEFS_COMMON}${INTERIOR_DEFS}
        <linearGradient id="rgMirror" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9eef1"/><stop offset=".5" stop-color="#c9d2d7"/><stop offset="1" stop-color="#dfe5e8"/></linearGradient></defs>${interiorShell(true)}
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
      <rect x="590" y="214" width="40" height="4" rx="2" fill="#8d8f91"/><rect class="r-duvet" x="594" y="218" width="32" height="56" rx="3"/>
      <rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/></svg>`;
    if (furniture === 'desk') return `${open}<defs>${DEFS_COMMON}${INTERIOR_DEFS}</defs>${interiorShell(true)}
      ${art(300, 140, 120, 86)}
      <rect x="456" y="150" width="150" height="10" rx="2" fill="#000" opacity=".1" filter="url(#rfShadow)" transform="translate(0 4)"/>
      <rect class="r-wood" x="456" y="150" width="150" height="8" rx="2"/>
      <rect x="470" y="124" width="14" height="26" fill="#6b5d52"/><rect x="488" y="128" width="12" height="22" fill="#8c7b6d"/><rect x="504" y="120" width="10" height="30" fill="#4d5a63"/>
      <ellipse cx="560" cy="142" rx="14" ry="9" fill="#5e7a4c"/><rect x="552" y="140" width="16" height="10" fill="#b48a63"/>
      <ellipse cx="470" cy="372" rx="150" ry="10" fill="#000" opacity=".24" filter="url(#rfShadow)"/>
      <rect class="r-wood" x="352" y="292" width="236" height="12" rx="2"/>
      <rect x="362" y="304" width="7" height="64" fill="#3a3632"/><rect x="571" y="304" width="7" height="64" fill="#3a3632"/>
      <rect x="430" y="236" width="94" height="56" rx="4" fill="#26282b"/><rect x="436" y="242" width="82" height="44" rx="2" fill="#3c4650"/><rect x="472" y="290" width="10" height="4" fill="#26282b"/>
      <circle class="r-lamp-glow" cx="390" cy="262" r="70" fill="url(#rgLamp)"/><path d="M380 292 l10 -30 l16 6" fill="none" stroke="#2d2a27" stroke-width="3" stroke-linecap="round"/><polygon class="r-shade" points="398,262 420,262 416,276 402,276"/>
      <rect class="r-sofa-d" x="440" y="312" width="70" height="44" rx="10"/><rect x="471" y="356" width="8" height="22" fill="#2d2a27"/><rect x="452" y="376" width="46" height="5" rx="2" fill="#2d2a27"/>
      <rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/></svg>`;
    return `${open}<defs>${DEFS_COMMON}${INTERIOR_DEFS}</defs>${interiorShell(true)}
      ${art(402, 140, 150, 104)}
      <ellipse cx="480" cy="374" rx="168" ry="11" fill="#000" opacity=".26" filter="url(#rfShadow)"/>
      <rect class="r-sofa-d" x="352" y="282" width="256" height="62" rx="14"/>
      <rect class="r-sofa" x="336" y="318" width="288" height="44" rx="10"/>
      <rect class="r-sofa-l" x="352" y="314" width="126" height="20" rx="8"/>
      <rect class="r-sofa-l" x="482" y="314" width="126" height="20" rx="8"/>
      <rect class="r-sofa-d" x="322" y="298" width="36" height="66" rx="12"/>
      <rect class="r-sofa-d" x="602" y="298" width="36" height="66" rx="12"/>
      <rect x="334" y="362" width="6" height="10" rx="2" fill="#2a2522"/><rect x="620" y="362" width="6" height="10" rx="2" fill="#2a2522"/>
      ${LAMP}
      <rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/></svg>`;
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
      </defs>
      <rect x="0" y="0" width="800" height="480" fill="url(#rgSky)"/>
      <ellipse class="r-tree" cx="40" cy="300" rx="90" ry="140"/><ellipse class="r-tree" cx="770" cy="310" rx="80" ry="130"/>
      <ellipse cx="40" cy="300" rx="90" ry="140" fill="#000" opacity=".12"/><ellipse cx="770" cy="310" rx="80" ry="130" fill="#000" opacity=".18"/>
      <rect class="r-lawn" x="0" y="404" width="800" height="76"/><rect x="0" y="404" width="800" height="76" fill="url(#rgLawn)"/>
      <!-- body -->
      <rect class="r-body" x="120" y="180" width="560" height="230"/>
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
      <g fill="none" stroke="#000" stroke-opacity=".22" stroke-width="1.6"><rect x="366" y="262" width="29" height="58" rx="1"/><rect x="405" y="262" width="29" height="58" rx="1"/><rect x="366" y="332" width="29" height="64" rx="1"/><rect x="405" y="332" width="29" height="64" rx="1"/></g>
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
  const FIXED_FILL = { floor: 'A9784B', frame: '2B2926', sofa: '8A857E', 'sofa-d': '77726B', 'sofa-l': '9A958E', shade: 'ECE6DA', duvet: 'F1F0EC', wood: 'A27B55' };
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
    const sunOpacity = { none: 0.16, daylight: 0.22, sun: 0.5, golden: 0.42 }[id] || 0;
    set('.r-sun', 'fill', id === 'golden' ? '#ffc777' : id === 'sun' ? '#fff0cf' : '#ffffff'); set('.r-sun', 'opacity', sunOpacity);
    set('.r-night', 'opacity', night ? 1 : id === 'dim' ? 0.7 : 0);
    const isHouse = room.dataset.scene === 'house';
    const label = !lt ? 'Chip color' : isHouse && night ? 'Night, porch light' : isHouse && id === 'north' ? 'Shade / overcast' : lt.label;
    $('#roomLabel').textContent = label;
  }

  const sheet = $('#detailSheet'), scrim = $('#scrim');
  let lastFocus = null;
  function openDetail(id, inSheet) {
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
        <h1>Look up any color</h1>
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
      host.innerHTML = `<p class="section-title" style="margin-bottom:12px">Best sellers</p><div class="list">${pop.slice(0, 40).map((c, i) => lookupRow({ color: c }, i)).join('')}</div>`;
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
    const colors = shortlist.map(id => E.findColor(id)).filter(Boolean);
    host.innerHTML = `
      <div class="short-head">
        <div style="display:grid;gap:6px"><h1>Shortlist</h1><p class="muted">${colors.length ? `${colors.length} saved color${colors.length > 1 ? 's' : ''}.` : 'Star colors from results or look-ups to compare them here.'}</p></div>
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
      const text = shortlist.map(id => E.findColor(id)).filter(Boolean).map(c => `${c.name} — ${brandName(c.brand)} ${E.codeLabel(c)} (LRV ${c.lrv})`).join('\n');
      copyText(text, 'List copied');
    }
    if (t.dataset.act === 'clear-list') {
      if (t.dataset.confirm) { shortlist = []; saveShortlist(); updateShortCount(); renderShortlist(); toast('Shortlist cleared'); }
      else { t.dataset.confirm = '1'; t.textContent = 'Tap again to clear'; setTimeout(() => { if (document.contains(t)) { delete t.dataset.confirm; t.textContent = 'Clear'; } }, 3000); }
    }
  });
  function openPresent() {
    const colors = shortlist.map(id => E.findColor(id)).filter(Boolean); if (!colors.length) return;
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
    if (!brand) return `<div class="block"><h4>Paint to use</h4><div class="sample-note"><div>Paint lines for ${esc(brandName(c.brand))} aren’t listed. Set a store brand in settings to see which of your paints to mix this color in.</div></div></div>`;
    const r = E.recommendLines(brand, c, answers, { lines: settings.lines });
    if (!r.best) return `<div class="block"><h4>Paint to use</h4><div class="sample-note"><div>All ${esc(brandName(brand))} lines for this job are switched off in settings.</div></div></div>`;
    const b = r.best.line;
    const others = r.byTier.filter(x => x.line.id !== b.id);
    return `<div class="block"><h4>Paint to use</h4>
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
    return `<div class="block"><h4>Advantages &amp; disadvantages</h4>
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
    else colors = shortlist.map(id => E.findColor(id)).filter(Boolean);
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
  function renderSettings() {
    const el = $('#settingsSheet');
    const en = brandsEnabled();
    const home = settings.audience === 'home';
    const groups = [['us', 'US national brands'], ['us-more', 'More US brands'], ['intl', 'International'], ['custom', 'Imported']];
    const s = state.screen;
    el.innerHTML = `
      <div class="sheet-head">
        <button type="button" class="icon-btn" data-act="close-settings" aria-label="Close settings"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
        <h2 id="settingsTitle">Settings</h2>
      </div>
      <div class="sheet-body">
        <div class="set-group"><h3>${home ? 'My brands' : 'Store'}</h3><div class="set-card">
          <div class="set-row"><div class="set-text"><b>${home ? 'Favorite brand' : 'Store brand'}</b><span>Shown first and used for top picks</span></div>
            ${selectHtml('setStoreBrand', [['', 'None, mix brands']].concat(brandList().map(b => [b.id, b.name])), settings.storeBrand, home ? 'Favorite brand' : 'Store brand')}</div>
          ${sw('storeOnly', settings.storeOnly, home ? 'Only recommend my favorite brand' : 'Only recommend the store brand', 'Other brands still appear as matches')}
          <div class="set-row"><div class="set-text"><b>Colors per search</b></div>${seg('resultCount', { 3: '3', 6: '6', 9: '9', 12: '12' }, String(settings.resultCount), 'Colors per search')}</div>
        </div></div>

        <div class="set-group"><h3>${home ? 'Samples' : 'In the store'}</h3><div class="set-card">
          ${sw('inStoreSamples', settings.inStoreSamples, home ? 'Show in-store chip locations' : 'In-store samples', home ? 'Where to find each chip on the store display' : 'Show chip strip locations and display tips')}
          ${sw('showDiscontinued', settings.showDiscontinued, 'Include discontinued colors', 'Older colors many stores can still mix')}
        </div></div>

        <div class="set-group"><h3>Questions &amp; results</h3><div class="set-card">
          ${sw('askBulbs', settings.askBulbs, 'Ask about light bulbs')}
          ${sw('askFixed', settings.askFixed, 'Ask what’s staying in the room', 'Floors, tile, cabinets, fixtures')}
          ${sw('showWarnings', settings.showWarnings, 'Show warnings')}
          ${sw('showLrv', settings.showLrv, 'Show LRV on chips', 'Light reflectance value, 0 = black, 100 = white')}
          ${sw('showMatches', settings.showMatches, 'Show matches in other brands')}
          ${sw('lightPreview', settings.lightPreview, 'Light preview', 'See colors under north light, bulbs and more')}
        </div></div>

        <div class="set-group"><h3>Screen accuracy</h3><div class="set-card">
          <div class="screen-info">
            <div><span class="k">Color range</span><span class="v">${esc(s.gamut)}</span></div>
            <div><span class="k">HDR</span><span class="v">${s.hdr ? 'Available' : 'Not detected'}</span></div>
            <div><span class="k">Color depth</span><span class="v mono">${s.depth}-bit</span></div>
            <div><span class="k">Pixel ratio</span><span class="v mono">${s.dpr}×</span></div>
          </div>
          <div class="set-note">Browsers can detect the screen’s color range but not its brightness, color profile or night-light setting. Calibrating adjusts every swatch to this screen.</div>
          ${sw('calEnabled', settings.cal.enabled, 'Use my calibration', settings.cal.enabled ? `Warmth ${settings.cal.warmth}, brightness ${settings.cal.brightness}, vividness ${settings.cal.vividness}` : 'Not calibrated yet')}
          <div class="set-mini"><button type="button" class="btn small primary" data-act="calibrate">Calibrate this screen</button>${settings.cal.warmth || settings.cal.brightness || settings.cal.vividness ? '<button type="button" class="btn small ghost" data-act="reset-cal">Reset</button>' : ''}</div>
        </div></div>

        <div class="set-group"><h3>Brands</h3>
          ${groups.map(([g, label]) => { const bs = brandList().filter(b => b.group === g); if (!bs.length) return ''; return `<p class="eyebrow" style="margin:6px 0 8px">${label}</p><div class="set-card" style="margin-bottom:12px">${bs.map(b => `<div class="set-row brand-row">${brandDots(b.id)}<div class="set-text"><b id="lbl-b-${esc(b.id)}">${esc(b.name)}</b><span>${fmt(b.active != null ? b.active : (E.getIndex().byBrand[b.id] || []).length)} colors · ${esc(b.source || '')}</span></div><button type="button" class="switch" role="switch" aria-checked="${!!en[b.id]}" aria-labelledby="lbl-b-${esc(b.id)}" data-brand="${esc(b.id)}"></button></div>`).join('')}</div>`; }).join('')}
          <div class="set-card"><div class="set-mini"><button type="button" class="btn small" data-act="brands-all">Turn all on</button><button type="button" class="btn small" data-act="brands-us">US national only</button></div></div>
        </div>

        <div class="set-group"><h3>Add colors</h3><div class="set-card">
          <div class="set-note" style="border-top:0">Import a CSV for any brand not listed. Columns: brand, name, code, hex, and optionally lrv. Example line: <span class="mono">Clark+Kensington, Oat Milk, 23A-2, #E8DFCF, 74</span></div>
          <div class="set-mini"><span class="btn small file-btn">Choose CSV file<input type="file" id="csvInput" accept=".csv,.tsv,.txt,text/csv"></span>${Object.keys(store.get('custom', {})).length ? '<button type="button" class="btn small ghost" data-act="clear-custom">Remove imported</button>' : ''}</div>
        </div></div>

        <div class="set-group"><h3>${home ? 'Paint lines I’d buy' : 'Paint lines the store carries'}</h3>
          <div class="set-card"><div class="set-note" style="border-top:0">ColorGenius suggests a line for each job (for example Aura Bath &amp; Spa for a bathroom or Advance for cabinets). ${home ? 'Switch off lines you don’t want suggested.' : 'Switch off lines you don’t stock.'}${settings.storeBrand ? '' : home ? ' Set a favorite brand above to always suggest its paint.' : ' Set a store brand above to always suggest your own paint.'}</div></div>
          ${Object.keys(E.PAINT_LINES).filter(id => E.getIndex().brandById[id] && (en[id] || id === settings.storeBrand)).sort((x, y) => (y === settings.storeBrand) - (x === settings.storeBrand)).map(id => {
            const lines = E.PAINT_LINES[id]; const on = lines.filter(l => settings.lines[l.id] !== false).length;
            return `<details class="set-card line-group" ${id === settings.storeBrand ? 'open' : ''}><summary><span>${esc(brandName(id))}</span><span class="muted">${on} of ${lines.length} on</span></summary>
              ${lines.map(l => `<div class="set-row"><div class="set-text"><b id="lbl-l-${esc(l.id)}">${esc(l.name)}</b><span>${esc(E.TIERS[l.tier])} · ${l.use === 'interior' ? 'Interior' : 'Exterior'} · ${esc(l.note)}</span></div><button type="button" class="switch" role="switch" aria-checked="${settings.lines[l.id] !== false}" aria-labelledby="lbl-l-${esc(l.id)}" data-line="${esc(l.id)}"></button></div>`).join('')}
            </details>`; }).join('')}
        </div>

        <div class="set-group"><h3>Phone app</h3><div class="set-card">
          <div class="set-row"><img src="icons/icon-192.png" width="40" height="40" alt="" style="border-radius:10px;flex:none"><div class="set-text"><b>ColorGenius app</b><span id="installInfo">${esc(INSTALL_STATUS[installState()])}</span></div>
            ${installState() === 'installed' ? '<span class="badge good">Installed</span>' : '<button type="button" class="btn small primary" data-act="install">Get the app</button>'}</div>
        </div></div>

        <div class="set-group"><h3>Appearance</h3><div class="set-card">
          <div class="set-row"><div class="set-text"><b>Theme</b><span>Light mode is best for judging color</span></div>${seg('theme', { system: 'System', light: 'Light', dark: 'Dark' }, settings.theme, 'Theme')}</div>
          ${sw('reduceMotion', settings.reduceMotion, 'Reduce motion')}
        </div></div>

        <div class="set-group"><div class="set-card"><div class="set-mini"><button type="button" class="btn small" data-act="run-setup">Run setup again</button><button type="button" class="btn small ghost" data-act="reset-all">Reset all settings</button></div></div></div>
        <p class="muted" style="font-size:12px">${fmt(E.getIndex().colors.length)} colors loaded from ${brandList().length} brands. Settings, shortlist and calibration are saved on this device only.</p>
      </div>`;
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
      t.setAttribute('aria-checked', on); settings.brands[t.dataset.brand] = on; saveSettings(); afterSettingsChange('brands'); return;
    }
    if (t.dataset.seg) {
      const k = t.dataset.seg, v = t.dataset.val;
      $$(`[data-seg="${k}"]`, el).forEach(b => b.setAttribute('aria-pressed', b.dataset.val === v));
      settings[k] = k === 'resultCount' ? +v : v; saveSettings(); applyTheme(); afterSettingsChange(k); return;
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
  function removeBrand(id) {
    const idx = E.getIndex();
    idx.brands = idx.brands.filter(b => b.id !== id); delete idx.brandById[id];
    idx.colors = idx.colors.filter(c => c.brand !== id); delete idx.byBrand[id];
  }
  function afterSettingsChange(key) {
    state.stylePalettes = {};
    if (state.results) { state.results = E.recommend(state.results.answers, engineSettings()); }
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
      <h2 id="calTitle" style="font-size:22px">Calibrate this screen</h2>
      <p class="muted">Takes about a minute. You’ll match the screen to a sheet of white paper, then to a real paint chip.</p>
      <div class="set-card"><div class="screen-info">
        <div><span class="k">Color range</span><span class="v">${esc(s.gamut)}</span></div><div><span class="k">HDR</span><span class="v">${s.hdr ? 'Available' : 'Not detected'}</span></div>
        <div><span class="k">Color depth</span><span class="v mono">${s.depth}-bit</span></div><div><span class="k">Screen</span><span class="v mono">${esc(s.size)}</span></div></div></div>
      <ul class="reasons"><li>Turn off Night Light, True Tone, or any blue-light filter.</li><li>Set screen brightness to where you normally use it.</li><li>Do this where colors get picked, under the store’s lights.</li></ul>`;
    if (calStep === 1) body = `
      <h2 id="calTitle" style="font-size:22px">Match white paper</h2>
      <p class="muted">Hold plain white printer paper against the panel. Slide until the panel looks like the paper.</p>
      <div class="cal-panels"><div class="cal-panel" id="calWhite"><span>Adjusted white</span></div><div class="cal-panel" data-hex="F2F1EC" id="calOff" style="background:#F2F1EC"><span>Original screen</span></div></div>
      ${calSlider('warmth', 'Warmth', -100, 100, 'Panel looks too yellow', 'Panel looks too blue')}
      ${calSlider('brightness', 'Brightness', -50, 20, 'Panel glows brighter', 'Panel looks dimmer')}`;
    if (calStep === 2) body = `
      <h2 id="calTitle" style="font-size:22px">Match a real chip</h2>
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
  const OB_STEPS = ['who', 'brands', 'screen', 'done'];
  const OB_GROUPS = [['us', 'US national brands'], ['us-more', 'More US brands'], ['intl', 'International'], ['custom', 'Imported']];
  function brandSwatch(id) {
    const list = (E.getIndex().byBrand[id] || []).filter(c => c.flags & E.F.POPULAR);
    const pool = list.length >= 4 ? list : (E.getIndex().byBrand[id] || []).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 4)) === 0);
    const hx = pool.slice(0, 4).map(c => '#' + c.hex);
    while (hx.length < 4) hx.push('#ddd');
    return `<span class="msw" style="background:conic-gradient(${hx[0]} 0 25%, ${hx[1]} 0 50%, ${hx[2]} 0 75%, ${hx[3]} 0)"></span>`;
  }
  function openOnboarding() {
    ob = {
      step: 0, dir: 0, audience: settings.audience || '', brands: Object.assign({}, brandsEnabled()), storeBrand: settings.storeBrand || '',
      cal: { warmth: settings.cal.warmth || 0, brightness: settings.cal.brightness || 0 }, calTouched: false,
    };
    closeSheet($('#detailSheet')); closeSheet($('#settingsSheet'));
    const el = $('#onboard'); el.hidden = false; el.classList.remove('out');
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
    const id = OB_STEPS[ob.step];
    const home = ob.audience === 'home';
    const chosen = brandList().filter(b => ob.brands[b.id]);
    let body = '', next = 'Next', nextOff = false, skip = '';
    if (id === 'who') {
      body = `
        <p class="eyebrow">Welcome</p>
        <h1 id="obTitle">Let’s set up ColorGenius on this device</h1>
        <p class="muted">About a minute. Everything can be changed later in Settings.</p>
        <div class="ob-cards">
          <button type="button" class="ob-card" data-ob-aud="store" aria-pressed="${ob.audience === 'store'}">
            <span class="ob-ic" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30"><path d="M5 13l2-7h18l2 7M5 13v13h22V13M5 13h22M13 26v-7h6v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></span>
            <b>I work at a paint store</b><span>Picks from the brands we carry, with chip locations and paint lines for the counter.</span></button>
          <button type="button" class="ob-card" data-ob-aud="home" aria-pressed="${ob.audience === 'home'}">
            <span class="ob-ic" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30"><path d="M5 15L16 6l11 9M8 13v13h16V13M13 26v-7h6v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></span>
            <b>I’m picking paint for my home</b><span>Picks from the brands I want to buy, with simple tips for testing samples.</span></button>
        </div>`;
      nextOff = !ob.audience;
    }
    if (id === 'brands') {
      body = `
        <p class="eyebrow">Step 2 of 3</p>
        <h1 id="obTitle">${home ? 'Which brands would you buy?' : 'Which brands does your store carry?'}</h1>
        <p class="muted">${home ? 'Picks only come from these. Turn on any you can get near you.' : 'Picks only come from these. Colors from other brands can still be matched into them.'}</p>
        <div class="ob-quick"><button type="button" class="btn small" data-ob="all-us">All US national brands</button><button type="button" class="btn small ghost" data-ob="none">Clear</button></div>
        ${OB_GROUPS.map(([g, label]) => { const bs = brandList().filter(b => b.group === g); if (!bs.length) return ''; return `<div class="group mgroup"><p class="group-label">${label}</p><div class="mchips">${bs.map(b => `<button type="button" class="mchip" data-ob-brand="${esc(b.id)}" aria-pressed="${!!ob.brands[b.id]}">${brandSwatch(b.id)}${esc(b.name)}</button>`).join('')}</div></div>`; }).join('')}
        ${chosen.length ? `<div class="group mgroup ob-main"><p class="group-label">${home ? 'Favorite brand' : 'Main store brand'} <span class="hint">optional, shown first</span></p><div class="mchips">
          <button type="button" class="mchip" data-ob-main="" aria-pressed="${!ob.storeBrand}"><span class="msw flag-sw" aria-hidden="true"><svg viewBox="0 0 20 20" width="14" height="14"><path d="M5 10h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>No ${home ? 'favorite' : 'main brand'}</button>
          ${chosen.map(b => `<button type="button" class="mchip" data-ob-main="${esc(b.id)}" aria-pressed="${ob.storeBrand === b.id}">${brandSwatch(b.id)}${esc(b.name)}</button>`).join('')}
        </div></div>` : ''}
        ${chosen.length ? '' : '<p class="ob-need">Pick at least one brand to continue.</p>'}`;
      nextOff = !chosen.length;
    }
    if (id === 'screen') {
      const s = state.screen;
      body = `
        <p class="eyebrow">Step 3 of 3</p>
        <h1 id="obTitle">Tune this screen</h1>
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
        <h1 id="obTitle">You’re all set</h1>
        <div class="set-card ob-summary">
          <div class="set-row"><div class="set-text"><b>${home ? 'Picking paint for a home' : 'Paint store'}</b><span>${home ? 'Tips for buying and testing samples' : 'Chip locations and paint lines for the counter'}</span></div></div>
          <div class="set-row"><div class="set-text"><b>${names.length} brand${names.length > 1 ? 's' : ''}</b><span>${esc(names.slice(0, 4).join(', '))}${names.length > 4 ? ` and ${names.length - 4} more` : ''}</span></div></div>
          <div class="set-row"><div class="set-text"><b>${ob.storeBrand ? esc(brandName(ob.storeBrand)) : home ? 'No favorite brand' : 'No main brand'}</b><span>${ob.storeBrand ? (home ? 'Your favorite, shown first' : 'Your main brand, shown first') : 'Picks mix all your brands'}</span></div></div>
          <div class="set-row"><div class="set-text"><b>${ob.calTouched && (ob.cal.warmth || ob.cal.brightness) ? 'Screen tuned' : 'Screen not tuned'}</b><span>${ob.calTouched && (ob.cal.warmth || ob.cal.brightness) ? `Warmth ${ob.cal.warmth}, brightness ${ob.cal.brightness}` : 'You can tune it any time in Settings'}</span></div></div>
        </div>
        ${st === 'prompt' || st === 'ios' || st === 'android' ? `<div class="sample-note ob-install"><img src="icons/icon-192.png" width="44" height="44" alt="" style="border-radius:11px"><div><b>Put ColorGenius on your home screen</b><br><span class="muted">Opens full screen like an app and works offline.</span></div><button type="button" class="btn small" data-ob="install">Get the app</button></div>` : ''}`;
      next = 'Start finding colors';
    }
    el.innerHTML = `
      <div class="ob-shell">
        <div class="ob-top">
          <span class="wordmark ob-mark" aria-hidden="true"><span class="fan"><i></i><i></i><i></i></span><span class="wordmark-text">ColorGenius</span></span>
          <div class="ob-dots" aria-hidden="true">${OB_STEPS.map((s, i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('')}</div>
          ${id !== 'done' ? '<button type="button" class="btn small ghost" data-ob="skip-setup">Skip setup</button>' : '<span></span>'}
        </div>
        <div class="ob-body" id="obBody">${body}</div>
      </div>
      <nav class="wizard-nav ob-nav" aria-label="Setup navigation"><div class="wizard-nav-inner">
        <button type="button" class="btn ghost nav-back" data-ob="back" ${ob.step === 0 ? 'disabled style="visibility:hidden"' : ''}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>Back</button>
        <span class="spacer"></span>
        <button type="button" class="btn ghost nav-skip" data-ob="skip" ${skip ? '' : 'disabled aria-hidden="true" tabindex="-1" style="visibility:hidden"'}>${skip || 'Skip'}</button>
        <button type="button" class="btn primary nav-next" data-ob="next" ${nextOff ? 'disabled' : ''}>${next}
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></nav>`;
    const b = $('#obBody');
    if (ob.dir && !reduced()) b.animate([{ opacity: 0, transform: `translateX(${ob.dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    ob.dir = 0;
    el.scrollTo(0, 0);
    if (id === 'screen') paintObPanel();
  }
  function paintObPanel() {
    const p = $('#obWhite'); if (!p) return;
    p.style.backgroundColor = C.displayCss('FFFFFF', { cal: { enabled: true, warmth: ob.cal.warmth, brightness: ob.cal.brightness, vividness: 0 }, p3: state.screen.p3 });
  }
  function obGo(delta) { ob.step = Math.max(0, Math.min(OB_STEPS.length - 1, ob.step + delta)); ob.dir = delta > 0 ? 1 : -1; renderOnboarding(); }
  function finishOnboarding(skipped) {
    if (!skipped) {
      settings.audience = ob.audience || 'store';
      for (const b of brandList()) settings.brands[b.id] = !!ob.brands[b.id];
      settings.storeBrand = ob.storeBrand && ob.brands[ob.storeBrand] ? ob.storeBrand : '';
      if (!settings.storeBrand) settings.storeOnly = false;
      settings.inStoreSamples = settings.audience !== 'home';
      if (ob.calTouched) settings.cal = Object.assign({}, settings.cal, { warmth: ob.cal.warmth, brightness: ob.cal.brightness, enabled: !!(ob.cal.warmth || ob.cal.brightness || settings.cal.vividness) });
    } else if (!settings.audience) settings.audience = 'store';
    settings.onboarded = true;
    saveSettings(); applyTheme(); afterSettingsChange('all');
    closeOnboarding();
    if (!skipped) toast(settings.audience === 'home' ? 'All set. Happy painting!' : 'All set for the counter');
  }
  $('#onboard').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !ob) return;
    if (t.dataset.obAud) { ob.audience = t.dataset.obAud; $$('[data-ob-aud]').forEach(x => x.setAttribute('aria-pressed', x.dataset.obAud === ob.audience)); const n = $('[data-ob="next"]'); n.disabled = false; setTimeout(() => { if (ob && OB_STEPS[ob.step] === 'who') obGo(1); }, 260); return; }
    if (t.dataset.obBrand) { const id = t.dataset.obBrand; ob.brands[id] = !ob.brands[id]; if (!ob.brands[id] && ob.storeBrand === id) ob.storeBrand = ''; const y = $('#onboard').scrollTop; renderOnboarding(); $('#onboard').scrollTop = y; return; }
    if (t.dataset.obMain != null) { ob.storeBrand = t.dataset.obMain; $$('[data-ob-main]').forEach(x => x.setAttribute('aria-pressed', x.dataset.obMain === ob.storeBrand)); return; }
    const a = t.dataset.ob;
    if (a === 'next') { if (ob.step === OB_STEPS.length - 1) finishOnboarding(false); else obGo(1); }
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
  $('#onboard').addEventListener('input', e => {
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
    $('#installBtn').hidden = !(st === 'prompt' || st === 'ios' || st === 'android');
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
  const idleForUpdate = () => !state.results && state.step === 0 && $('#detailSheet').hidden && $('#settingsSheet').hidden && $('#calModal').hidden && $('#present').hidden && $('#infoModal').hidden;
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

  // expose a tiny surface for debugging and tests
  window.ColorGenius = { state, settings: () => settings, recommend: () => E.recommend(state.answers, engineSettings()) };
  boot();
})();
