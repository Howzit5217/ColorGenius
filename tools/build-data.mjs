// Converts the raw brand downloads into the app's compact color files.
// Usage: node tools/build-data.mjs <raw-download-folder>
// Writes data/brands.js and data/colors/<brand>.js
//
// Row format in every color file: [code, name, hex, lrv, flags, extra]
//   flags bit 1 = interior, 2 = exterior (neither set = brand didn't say),
//         4 = discontinued, 8 = LRV calculated from the color (brand didn't publish one),
//         16 = popular / best seller, 32 = on the in-store chip display
//   extra = strip locator or collection, when the brand gives one

import fs from 'fs';
import path from 'path';

const RAW = process.argv[2];
if (!RAW) { console.error('Usage: node tools/build-data.mjs <raw-download-folder>'); process.exit(1); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'data');
fs.mkdirSync(path.join(OUT, 'colors'), { recursive: true });

const F = { INT: 1, EXT: 2, DISC: 4, LRV_EST: 8, POPULAR: 16, RACK: 32 };
const raw = p => path.join(RAW, p);
const exists = p => fs.existsSync(raw(p));
const readJSON = p => JSON.parse(fs.readFileSync(raw(p), 'utf8'));
const readJSONL = p => fs.readFileSync(raw(p), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

function decode(s) {
  return String(s ?? '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;|&#039;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
function titleCase(s) {
  return decode(s).toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/'([A-Z])(\b)/g, (m, a, b) => "'" + a.toLowerCase() + b);
}
function normHex(h) {
  h = String(h || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map(c => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? h.toUpperCase() : null;
}
function rgbToHex(r, g, b) { return [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(+v))).toString(16).padStart(2, '0')).join('').toUpperCase(); }
function parseRgb(s) { const m = String(s || '').match(/(\d+)\D+(\d+)\D+(\d+)/); return m ? rgbToHex(m[1], m[2], m[3]) : null; }
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lrvFromHex(hex) {
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return Math.round((0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)) * 1000) / 10;
}
function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : null; }

// Names the store sees as staples. Matched by exact color name within the brand.
const POPULAR_NAMES = {
  sw: ['Alabaster', 'Pure White', 'Extra White', 'Agreeable Gray', 'Repose Gray', 'Accessible Beige', 'Sea Salt', 'Naval',
    'Tricorn Black', 'Iron Ore', 'Creamy', 'Snowbound', 'Worldly Gray', 'Mindful Gray', 'Dorian Gray', 'High Reflective White',
    'Drift of Mist', 'Urbane Bronze', 'Oyster Bay', 'Evergreen Fog', 'Greek Villa', 'Colonnade Gray', 'Amazing Gray',
    'Aesthetic White', 'Balanced Beige', 'Mega Greige', 'Gauntlet Gray', 'Dover White', 'Shoji White', 'Westhighland White',
    'Clary Sage', 'Rosemary', 'Pewter Green', 'Peppercorn', 'Origami White', 'Silver Strand', 'Natural Linen', 'Kilim Beige',
    'Edgy Gold', 'Nebulous White', 'Upward', 'Redend Point', 'Cyberspace', 'Indigo Batik', 'Uncertain Gray', 'Passive', 'Popular Gray'],
  behr: ['Swiss Coffee', 'Polar Bear', 'Ultra Pure White', 'Silver Drop', 'Blank Canvas', 'Cracked Pepper', 'Light French Gray',
    'Whisper White', 'Cameo White', 'Bit of Sugar', 'Smoky White', 'Natural Gray', 'Wheat Bread', 'Sculptor Clay', 'Watery',
    'Graphic Charcoal', 'Dragon Fruit', 'Breezeway', 'Wet Cement', 'Silky White', 'Campfire Ash', 'Shoji White', 'Evening Hush'],
  valspar: ['Bistro White', 'Woodlawn Snow', 'Filtered Shade', 'Rocky Ridge', 'Comfortable Gray', 'Frosty White', 'Mountain Smoke'],
};

const brands = [];
const report = [];

function emit(meta, rows) {
  // de-duplicate by code (keep the first), drop invalid hex
  const seen = new Set(); const out = [];
  for (const r of rows) {
    if (!r || !r[2]) continue;
    const k = String(r[0]).toUpperCase() + '|' + r[1].toUpperCase();
    const kc = String(r[0]).toUpperCase();
    if (seen.has(kc) && kc) continue;
    seen.add(kc); seen.add(k);
    if (r[3] == null) { r[3] = lrvFromHex(r[2]); r[4] |= F.LRV_EST; }
    out.push(r);
  }
  const pop = new Set((POPULAR_NAMES[meta.id] || []).map(s => s.toLowerCase()));
  if (pop.size) for (const r of out) if (pop.has(r[1].toLowerCase())) r[4] |= F.POPULAR;
  out.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en', { numeric: true }));
  const active = out.filter(r => !(r[4] & F.DISC)).length;
  const lrvOfficial = out.filter(r => !(r[4] & F.LRV_EST)).length;
  meta.count = out.length; meta.active = active;
  const js = `/* ${meta.name}: ${out.length} colors. Source: ${meta.source}. Built ${new Date().toISOString().slice(0, 10)}. */\n` +
    `(window.CG_COLORS = window.CG_COLORS || {})[${JSON.stringify(meta.id)}] = ` + JSON.stringify(out).replace(/\],\[/g, '],\n[') + ';\n';
  fs.writeFileSync(path.join(OUT, 'colors', meta.id + '.js'), js);
  brands.push(meta);
  report.push(`${meta.name.padEnd(34)} ${String(out.length).padStart(5)} colors  (${active} current, ${lrvOfficial} with brand LRV)`);
}

const today = new Date().toISOString().slice(0, 10);

// ---------- Sherwin-Williams family (official color service) ----------
if (exists('sw_prism.json')) {
  const rows = readJSON('sw_prism.json').map(c => {
    let f = 0; if (c.isInterior) f |= F.INT; if (c.isExterior) f |= F.EXT; if (c.archived) f |= F.DISC;
    if (c.storeStripLocator && !c.archived) f |= F.RACK;
    return [c.colorNumber, decode(c.name), normHex(c.hex), num(c.lrv), f, c.storeStripLocator || ''];
  });
  emit({ id: 'sw', name: 'Sherwin-Williams', prefix: 'SW', region: 'US', group: 'us', source: 'Sherwin-Williams color service', date: today, lrv: 'official', mixNote: 'Order by SW number.' }, rows);
}
const lowesLrv = new Map();
if (exists('prism_lowes.json')) for (const c of readJSON('prism_lowes.json')) lowesLrv.set(c.colorNumber + '|' + (c.brandKey || 'V'), num(c.lrv));
if (exists('prism_valspar.json')) {
  const rows = readJSON('prism_valspar.json').map(c => {
    let f = 0; if (c.storeStripLocator) f |= F.RACK;
    return [c.colorNumber, decode(c.name), normHex(c.hex), lowesLrv.get(c.colorNumber + '|V') ?? null, f, c.storeStripLocator || ''];
  });
  emit({ id: 'valspar', name: 'Valspar', prefix: '', region: 'US', group: 'us', source: 'Sherwin-Williams color service (Valspar / Lowe’s palette)', date: today, lrv: 'official', mixNote: 'Sold at Lowe’s.' }, rows);
}
if (exists('prism_hgsw.json')) {
  const rows = readJSON('prism_hgsw.json').map(c => {
    let f = 0; if (c.storeStripLocator) f |= F.RACK;
    return [c.colorNumber, decode(c.name), normHex(c.hex), lowesLrv.get(c.colorNumber + '|HGSW') ?? null, f, c.storeStripLocator || ''];
  });
  emit({ id: 'hgsw', name: 'HGTV Home by Sherwin-Williams', prefix: 'HGSW', region: 'US', group: 'us', source: 'Sherwin-Williams color service (HGTV Home palette)', date: today, lrv: 'official', mixNote: 'Same numbers as Sherwin-Williams. Sold at Lowe’s.' }, rows);
}
if (exists('prism_dutchboy.json')) {
  const rows = readJSON('prism_dutchboy.json').map(c => {
    let f = 0; if (c.archived) f |= F.DISC;
    return [c.colorNumber, decode(c.name), normHex(c.hex), num(c.lrv), f, ''];
  });
  emit({ id: 'dutchboy', name: 'Dutch Boy', prefix: '', region: 'US', group: 'us', source: 'Sherwin-Williams color service (Dutch Boy palette)', date: today, lrv: 'official', mixNote: 'Sold at Menards.' }, rows);
}

// ---------- Benjamin Moore (collection pages) ----------
if (exists('bm/bm_all.json')) {
  const j = readJSON('bm/bm_all.json');
  const collOf = new Map();
  const nice = { 'affinity-color-collection': 'Affinity', 'benjamin-moore-classics': 'Classics', 'color-preview': 'Color Preview', 'color-stories': 'Color Stories', 'designer-classics': 'Designer Classics', 'historical-collection': 'Historical', 'off-white-collection': 'Off-White', 'williamsburg-paint-color-collection': 'Williamsburg' };
  for (const [k, list] of Object.entries(j.collections)) if (nice[k]) for (const n of list) if (!collOf.has(n)) collOf.set(n, nice[k]);
  const rows = j.colors.map(c => {
    // Most collection pages don't say; only set the flags when the brand does.
    let f = 0; const ext = String(c.exterior_availability || '').toLowerCase();
    if (ext === 'available') f |= F.INT | F.EXT;
    else if (ext === 'unavailable' || ext === 'not recommended') f |= F.INT;
    else if (ext.includes('exterior only')) f |= F.EXT;
    if (c.is_best_selling) f |= F.POPULAR;
    return [c.number, decode(c.name), normHex(c.hex), num(c.lrv), f, collOf.get(c.number) || (Array.isArray(c.collections) ? c.collections[0] || '' : '')];
  });
  emit({ id: 'bm', name: 'Benjamin Moore', prefix: '', region: 'US / Canada', group: 'us', source: 'benjaminmoore.com color collections', date: today, lrv: 'official', mixNote: 'Order by color number.' }, rows);
}

// ---------- Behr (official color data file) ----------
if (exists('behr_all.js')) {
  const t = fs.readFileSync(raw('behr_all.js'), 'utf8');
  const a = JSON.parse(t.match(/var colorData = (\[[\s\S]*?\]);/)[1]);
  const H = a[0]; const ix = k => H.indexOf(k);
  const rows = a.slice(1).map(r => {
    let f = 0; if (r[ix('islegacycolor')] === 'true') f |= F.DISC;
    if (r[ix('israck')] === 'true' || r[ix('israckultra')] === 'true') f |= F.RACK;
    return [r[ix('id')], titleCase(r[ix('name')]), normHex(r[ix('rgb')]), null, f, ''];
  });
  emit({ id: 'behr', name: 'Behr', prefix: '', region: 'US', group: 'us', source: 'behr.com color data', date: today, lrv: 'calculated', mixNote: 'Sold at The Home Depot.' }, rows);
}

// ---------- PPG / Pittsburgh Paints and Glidden (color pages) ----------
const ppgByCode = new Map();
let ppgRows = [];
if (exists('pitt/pitt.jsonl')) {
  for (const r of readJSONL('pitt/pitt.jsonl')) {
    if (!r.title || !r.rgb) continue;
    const m = decode(r.title).match(/^(.*?)\s+-\s+(.+?)\s+Paint Colou?r/i);
    const name = m ? m[1] : decode(r.title).split('|')[0].replace(/Paint Colou?r/i, '').trim();
    const code = r.code || (m ? m[2] : '');
    const hex = parseRgb(r.rgb); const lrv = num(r.lrv);
    if (!hex || !code) continue;
    ppgByCode.set(code.toUpperCase(), lrv);
    ppgRows.push([code, name, hex, lrv, 0, '']);
  }
  emit({ id: 'ppg', name: 'PPG / Pittsburgh Paints', prefix: '', region: 'US', group: 'us', source: 'pittsburghpaints.com color pages', date: today, lrv: 'official', mixNote: 'PPG’s US paint business is now Pittsburgh Paints. Glidden uses the same color numbers.' }, ppgRows);
}
if (exists('glidden/glidden.jsonl')) {
  const rows = [];
  for (const r of readJSONL('glidden/glidden.jsonl')) {
    if (!r.rgb || !r.code) continue;
    const code = decode(r.code);
    let name = decode(r.ldName || r.title || '');
    if (name.endsWith(code)) name = name.slice(0, -code.length).trim();
    name = name.replace(/\s*Paint Colou?r.*$/i, '').trim();
    const groups = decode(r.group || '').split(';').map(s => s.trim()).filter(Boolean);
    rows.push([code, name, parseRgb(r.rgb), ppgByCode.get(code.toUpperCase()) ?? null, 0, groups[0] || '']);
  }
  emit({ id: 'glidden', name: 'Glidden', prefix: '', region: 'US', group: 'us', source: 'glidden.com color pages', date: today, lrv: 'official where PPG lists it, otherwise calculated', mixNote: 'Sold at The Home Depot.' }, rows);
}

// ---------- Dunn-Edwards (color pages, older community list fills gaps) ----------
if (exists('de/de.jsonl')) {
  const rows = []; const have = new Set();
  for (const r of readJSONL('de/de.jsonl')) {
    if (!r.hex || !r.code) continue;
    const name = decode(r.title || '').replace(/\s*Paint Colou?r.*$/i, '').trim();
    rows.push([r.code, name, normHex(r.hex), num(r.lrv), 0, '']); have.add(r.code.toUpperCase());
  }
  let filled = 0;
  if (exists('cn_de.json')) for (const c of readJSON('cn_de.json')) {
    const code = String(c.label).trim(); if (have.has(code.toUpperCase())) continue;
    rows.push([code, decode(c.name), normHex(c.hex), null, 0, '']); filled++;
  }
  emit({ id: 'de', name: 'Dunn-Edwards', prefix: '', region: 'US Southwest', group: 'us', source: `dunnedwards.com color pages${filled ? ` (+${filled} from an older public list)` : ''}`, date: today, lrv: 'official', mixNote: '' }, rows);
}

// ---------- Diamond Vogel (color finder page) ----------
if (exists('misc/dv.json')) {
  const rows = readJSON('misc/dv.json').map(c => [c.code, decode(c.name), normHex(c.hex), null, 0, c.collections[0] || '']);
  emit({ id: 'dv', name: 'Diamond Vogel', prefix: '', region: 'US Midwest', group: 'us', source: 'diamondvogel.com color finder', date: today, lrv: 'calculated', mixNote: '' }, rows);
}

// ---------- Other US brands from public community lists ----------
if (exists('cn_kilz.json')) {
  const rows = readJSON('cn_kilz.json').map(c => [String(c.label).trim(), decode(c.name), normHex(c.hex), null, 0, '']);
  emit({ id: 'kilz', name: 'KILZ', prefix: '', region: 'US', group: 'us-more', source: 'public community list (may be a few years old)', date: today, lrv: 'calculated', mixNote: 'Sold at Walmart.' }, rows);
}
if (exists('cn_vista.json')) {
  const rows = readJSON('cn_vista.json').map(c => [String(c.label).trim(), decode(c.name), normHex(c.hex), null, 0, '']);
  emit({ id: 'vista', name: 'Vista Paint', prefix: '', region: 'US (California)', group: 'us-more', source: 'public community list (may be a few years old)', date: today, lrv: 'calculated', mixNote: '' }, rows);
}

// ---------- International ----------
if (exists('intl/resene.json')) {
  const rows = readJSON('intl/resene.json').map(c => {
    const m = c.name.match(/^Resene\s+(.*?)\s+([A-Z]{1,3}\d{2,3}-\d{3}-\d{3}|\S+-\S+-\S+)$/);
    const name = m ? m[1] : c.name.replace(/^Resene\s+/, '');
    const code = m ? m[2] : name;
    return [code, name, rgbToHex(c.vals[0] * 255, c.vals[1] * 255, c.vals[2] * 255), null, 0, ''];
  });
  emit({ id: 'resene', name: 'Resene', prefix: '', region: 'New Zealand / Australia', group: 'intl', source: 'Resene official swatch file (2021)', date: today, lrv: 'calculated', mixNote: 'Resene colors are usually ordered by name.' }, rows);
}
if (exists('intl/cn_fb.json')) {
  const rows = readJSON('intl/cn_fb.json').map(c => [String(c.label).trim(), decode(c.name), normHex(c.hex), null, 0, '']);
  emit({ id: 'fb', name: 'Farrow & Ball', prefix: 'No.', region: 'UK', group: 'intl', source: 'public community list (older; recent additions missing)', date: today, lrv: 'calculated', mixNote: '' }, rows);
}

const order = ['sw', 'bm', 'behr', 'valspar', 'ppg', 'glidden', 'hgsw', 'dutchboy', 'de', 'dv', 'kilz', 'vista', 'resene', 'fb'];
brands.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
fs.writeFileSync(path.join(OUT, 'brands.js'),
  `/* Brand list. Generated by tools/build-data.mjs on ${today}. */\nwindow.CG_BRANDS = ${JSON.stringify(brands, null, 1)};\n`);
// list of data files for the offline cache (sw.js)
fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify(brands.map(b => `data/colors/${b.id}.js`), null, 1) + '\n');
console.log(report.join('\n'));
console.log('Total colors:', brands.reduce((s, b) => s + b.count, 0));
