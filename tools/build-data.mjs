// Converts the raw brand downloads into the app's compact color files.
// Usage: node tools/build-data.mjs <raw-download-folder>
// Writes data/brands.js and data/colors/<brand>.js
//
// Row format in every color file: [code, name, hex, lrv, flags, extra]
//   flags bit 1 = interior, 2 = exterior (neither set = brand didn't say),
//         4 = discontinued, 8 = LRV calculated from the color (brand didn't publish one),
//         16 = (unused; was "popular"), 32 = on the in-store chip display
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

// (No list of popular names here: tools/popular/find.mjs reads each brand's Color of the Year and most popular
// colors off the brand's own website every week and writes data/popular.js.)

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

// ---------- Clark+Kensington and Magnolia Home (Ace Hardware's color data, provided by the store) ----------
if (exists('ace/ace-paint-colors.json')) {
  const j = readJSON('ace/ace-paint-colors.json');
  const of = brand => j.colors.filter(c => c.brand === brand).map(c => {
    const cols = c.collections || [];
    let f = 0;
    // the file's LRV is calculated from the color, not measured, so leave it to be marked as calculated
    return [String(c.code).trim(), decode(c.name), normHex(c.hex), null, f, cols.find(x => !/hues$/i.test(x)) || cols[0] || ''];
  });
  const date = (j.meta && j.meta.retrieved) || today;
  emit({ id: 'ck', name: 'Clark+Kensington', prefix: '', region: 'US (Ace Hardware)', group: 'us', source: 'Ace Hardware color data', date, lrv: 'calculated', mixNote: 'Sold at Ace Hardware.' }, of('Clark+Kensington'));
  emit({ id: 'magnolia', name: 'Magnolia Home', prefix: '', region: 'US', group: 'us', source: 'Ace Hardware color data (Magnolia Home by KILZ)', date, lrv: 'calculated', mixNote: 'Magnolia Home by Joanna Gaines, made by KILZ.' }, of('Magnolia Home'));
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
// From tools/fetch/world_fetch.mjs: each brand's own website
if (exists('intl/dulux_au.json')) {
  const rows = readJSON('intl/dulux_au.json').map(c => [c.code, decode(c.name), normHex(c.hex), c.lrv == null ? null : num(c.lrv), 0, '']);
  emit({ id: 'duluxau', name: 'Dulux Australia', prefix: '', region: 'Australia / New Zealand', group: 'intl', source: 'dulux.com.au Colour Atlas', date: today, lrv: 'official', mixNote: 'Order by colour name or specifier number (like SW1G1). The same colours are sold in New Zealand.' }, rows);
}
if (exists('intl/plascon.json')) {
  const rows = readJSON('intl/plascon.json').map(c => [c.code, decode(c.name), normHex(c.hex), null, 0, '']);
  emit({ id: 'plascon', name: 'Plascon', prefix: '', region: 'South Africa', group: 'intl', source: 'plascon.co.za colour list', date: today, lrv: 'calculated', mixNote: 'Order by colour name or code.' }, rows);
}
if (exists('intl/sico.json')) {
  const rows = readJSON('intl/sico.json').map(c => [c.code, titleCase(c.name), rgbToHex(...c.rgb), null, 0, '']);
  emit({ id: 'sico', name: 'Sico', prefix: '', region: 'Canada', group: 'intl', source: 'sico.ca colour families', date: today, lrv: 'calculated', mixNote: 'Sold at RONA and paint stores across Canada. Names are also given in French.' }, rows);
}
if (exists('intl/nerolac.json')) {
  const rows = readJSON('intl/nerolac.json').map(c => [c.code, decode(c.name), normHex(c.hex), null, 0, '']);
  emit({ id: 'nerolac', name: 'Nerolac', prefix: '', region: 'India', group: 'intl', source: 'nerolac.com colour catalogue', date: today, lrv: 'calculated', mixNote: 'Kansai Nerolac, sold across India. Order by shade code.' }, rows);
}

if (exists('cn_hl.json')) {
  const rows = readJSON('cn_hl.json').map(c => [String(c.label).trim(), decode(c.name), normHex(c.hex), null, 0, '']);
  emit({ id: 'hl', name: 'Hallman Lindsay', prefix: '', region: 'US (Wisconsin)', group: 'us-more', source: 'public community list (may be a few years old)', date: today, lrv: 'calculated', mixNote: 'Sold in Hallman Lindsay stores in Wisconsin.' }, rows);
}
if (exists('cn_colorhouse.json')) {
  const rows = readJSON('cn_colorhouse.json').map(c => [String(c.label).trim(), decode(c.name), normHex(c.hex), null, 0, '']);
  emit({ id: 'colorhouse', name: 'Colorhouse', prefix: '', region: 'US (Oregon)', group: 'us-more', source: 'public community list (may be a few years old)', date: today, lrv: 'calculated', mixNote: 'Sold online and through a few retailers.' }, rows);
}
// RAL Classic is a color standard rather than a paint brand: most paint counters can mix it, and it is the usual
// spec for metal doors, garage doors, railings and commercial jobs.
if (exists('cn_ral.json')) {
  const rows = readJSON('cn_ral.json').map(c => [String(c.label).trim(), decode(c.name), normHex(c.hex), null, 0, 'RAL Classic']);
  emit({ id: 'ral', name: 'RAL Classic', prefix: 'RAL', region: 'International standard', group: 'standard', source: 'public community list of the RAL Classic chart', date: today, lrv: 'calculated', mixNote: 'A color standard, not a brand. Most paint counters can mix RAL colors; screen values are approximate.' }, rows);
}

// Wood stains: Minwax, from the same Sherwin-Williams color service as Valspar and HGTV Home. Each stain is
// published as several swatches without saying which product or wood each one shows, so the swatches are
// grouped by code and name: the middle one by lightness stands for the color, and the lightest and darkest
// are kept as its range. Names that only come as "Solid" are the solid color stains (blues, grays, reds);
// a white base means a whitewash or pickling stain.
const stainBrands = [], stainRows = {};
if (exists('prism_minwax.json')) {
  const groups = new Map();
  for (const x of readJSON('prism_minwax.json')) {
    const name = decode(x.name), code = String(x.colorNumber || '').trim(), hex = normHex(x.hex);
    if (!hex || !name) continue;
    const key = (code || name) + '|' + name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { code: code || name, name, swatches: [] });
    groups.get(key).swatches.push({ hex, solid: x.transparency === 'Solid', white: x.base === 'White', L: x.lab ? x.lab.L : 0 });
  }
  const rows = [];
  for (const g of groups.values()) {
    const semi = g.swatches.filter(s => !s.solid);
    const use = (semi.length ? semi : g.swatches).slice().sort((a, b) => a.L - b.L);
    const mid = use[Math.floor((use.length - 1) / 2)];
    const all = g.swatches.slice().sort((a, b) => a.L - b.L);
    const type = g.swatches.some(s => s.white) ? 'white' : semi.length ? 'semi' : 'solid';
    const solid = g.swatches.filter(s => s.solid).sort((a, b) => a.L - b.L);
    rows.push([g.code, titleCase(g.name), mid.hex, type, all[all.length - 1].hex, all[0].hex, g.swatches.length, solid.length ? solid[Math.floor((solid.length - 1) / 2)].hex : '']);
  }
  rows.sort((a, b) => a[1].localeCompare(b[1]) || String(a[0]).localeCompare(String(b[0])));
  stainBrands.push({ id: 'minwax', name: 'Minwax', use: 'interior', ref: 'red_oak', source: 'Sherwin-Williams color service (Minwax)', date: today,
    note: 'Interior wood stains. Screen colors are the brand’s own swatches.' });
  stainRows.minwax = rows;
}
// Cabot: each color page on cabotstain.com (from its public sitemap) gives the swatch value and opacity
// (tools/fetch/cabot_fetch.mjs). Cabot's solid-color pages show no swatch value, so only semi-transparent
// and semi-solid colors are here. Swatches are shown on cedar.
const STAIN_TYPE = { 'semi-transparent': 'semi', 'semi-solid': 'semisolid', solid: 'solid', transparent: 'trans', toner: 'trans' };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
if (exists('cabot_stains.json')) {
  const rows = readJSON('cabot_stains.json').filter(x => STAIN_TYPE[x.opacity] && normHex(x.hex))
    .map(x => [slug(x.url.split('/').pop()), decode(x.name), normHex(x.hex), STAIN_TYPE[x.opacity], '', '', 1, '']);
  rows.sort((a, b) => a[1].localeCompare(b[1]) || a[3].localeCompare(b[3]));
  stainBrands.push({ id: 'cabot', name: 'Cabot', use: 'exterior', ref: 'cedar', refMix: 0.6, codeless: true, source: 'cabotstain.com color pages', date: today,
    note: 'Exterior stains for decks, siding and fences. Cabot doesn’t publish values for its solid colors.' });
  stainRows.cabot = rows;
}
// Olympic (PPG) and Sherwin-Williams SuperDeck show stains only as swatch photos. Each color is the average of
// its own photo (tools/fetch/average_swatches.js); the photos are of the stain on cedar or treated pine.
if (exists('olympic_stains.json')) {
  const rows = readJSON('olympic_stains.json').filter(x => normHex(x.hex) && STAIN_TYPE[x.opacity])
    .map(x => [x.code, decode(x.name), normHex(x.hex), STAIN_TYPE[x.opacity], '', '', 1, '', x.wood && x.wood !== 'cedar' ? x.wood : '']);
  stainBrands.push({ id: 'olympic', name: 'Olympic', use: 'exterior', ref: 'cedar', refMix: 0.35, source: 'olympic.com color page (averaged swatch photos)', date: today,
    note: 'Exterior stains by PPG. Colors are averaged from Olympic’s swatch photos.' });
  stainRows.olympic = rows;
}
if (exists('sw_stains.json')) {
  const rows = readJSON('sw_stains.json').filter(x => normHex(x.hex))
    .map(x => [x.code, decode(x.name), normHex(x.hex), x.type === 'solid' ? 'solid' : 'semi', '', '', 1, '', '', x.line]);
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  stainBrands.push({ id: 'swstain', name: 'Sherwin-Williams SuperDeck', use: 'exterior', ref: 'cedar', refMix: 0.35, source: 'sherwin-williams.com stain color pages (averaged swatch photos)', date: today,
    note: 'SuperDeck exterior stains and Deck & Dock coatings. Colors are averaged from the swatch photos.' });
  stainRows.swstain = rows;
}
// Varathane (Rust-Oleum): every product page lists its colors with a photo of the stain on wood; each color is the
// average of its photo (tools/fetch/varathane_fetch.mjs, tools/fetch/average_chips.ps1). Varathane doesn't number
// its colors, so the product line shows where a code would go.
if (exists('varathane_stains.json')) {
  const rows = readJSON('varathane_stains.json').filter(x => normHex(x.hex)).map(x => {
    const L = (() => { const [r, g, b] = [0, 2, 4].map(i => parseInt(normHex(x.hex).slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; })();
    const white = /white|whitewash|pickled/i.test(x.name) && L > 0.6;
    return [slug(x.line + ' ' + x.name), decode(x.name), normHex(x.hex), white ? 'white' : 'semi', '', '', 1, '', '', x.line];
  });
  rows.sort((a, b) => a[1].localeCompare(b[1]) || a[9].localeCompare(b[9]));
  stainBrands.push({ id: 'varathane', name: 'Varathane', use: 'interior', ref: 'red_oak', refMix: 0.3, codeless: true, source: 'rustoleum.com product pages (averaged color chip photos)', date: today,
    note: 'Interior wood stains by Rust-Oleum: Fast Dry, Premium, Water-Based and Gel. Colors are averaged from the chip photos.' });
  stainRows.varathane = rows;
}
if (stainBrands.length) {
  fs.writeFileSync(path.join(OUT, 'stains.js'),
    `/* Wood stain colors. Generated by tools/build-data.mjs on ${today}.\n   Row: [code, name, hex, type (semi | semisolid | solid | trans | white), lightest swatch, darkest swatch, swatch count, solid-stain swatch, wood the swatch is on (when not the brand's usual), product line] */\n` +
    `window.CG_STAINS = ${JSON.stringify({ brands: stainBrands, rows: stainRows })};\n`);
  for (const b of stainBrands) { const r = stainRows[b.id]; const by = {}; for (const x of r) by[x[3]] = (by[x[3]] || 0) + 1; report.push(`${(b.name + ' (stains)').padEnd(35)} ${String(r.length).padStart(4)} stains  ${JSON.stringify(by)}`); }
}

// Spray paint: Rust-Oleum, Krylon and Montana GOLD, from each brand's own website (tools/fetch/spray_fetch.mjs).
// Row: [code, name, hex, finish, line]. finish is gloss, semigloss, satin, matte, flat, metallic, hammered,
// textured, glitter, chalky, frosted, mirror, glass, neon, glow, effect, chalkboard, clear or primer; line is a key of
// `lines` ([brand, product line name]).
const sprayBrands = [], sprayRows = {}, sprayLines = {};
const SHEEN = s => { s = String(s || '').toLowerCase(); return /high gloss|^gloss|\bgloss\b/.test(s) && !/semi/.test(s) ? 'gloss' : /semi/.test(s) ? 'semigloss' : /satin/.test(s) ? 'satin' : /matte/.test(s) ? 'matte' : /flat/.test(s) ? 'flat' : /metallic/.test(s) ? 'metallic' : /hammered/.test(s) ? 'hammered' : ''; };
// a can's name says its finish when nothing else does ("Gloss Black", "Satin Claret Wine", "Clear")
const nameFinish = n => /\bprimer\b/i.test(n) ? 'primer' : /^clear\b|\bclear$/i.test(n) ? 'clear' : SHEEN(n.split(' ')[0] === 'High' ? 'gloss' : n.split(' ').slice(0, 2).join(' '));
if (exists('rustoleum_sprays.json')) {
  const chips = exists('spray_chips.json') ? readJSON('spray_chips.json') : {};
  Object.assign(sprayLines, { pt2x: ['rustoleum', 'Painter’s Touch 2X Ultra Cover'], universal: ['rustoleum', 'Universal'], stopsrust: ['rustoleum', 'Stops Rust'], highheat: ['rustoleum', 'Specialty High Heat'], specialty: ['rustoleum', 'Specialty'], appliance: ['rustoleum', 'Specialty Appliance Epoxy'], chalked: ['rustoleum', 'Chalked Ultra Matte'], aa2x: ['rustoleum', 'American Accents 2X Ultra Cover'], lowodor: ['rustoleum', 'Low Odor Premium (water-based)'], rusto: ['rustoleum', 'Rust-O Artist'] });
  // which line each product page is, and its finish when the page is all one finish (first match wins)
  const LINE = [['painters-touch-2x-ultra-cover/primer', 'pt2x', 'primer'], ['painters-touch-2x-ultra-cover/', 'pt2x', ''],
    ['universal/universal-clear', 'universal', 'clear'], ['universal/universal-forged-hammered', 'universal', 'hammered'], ['universal/universal-hammered', 'universal', 'hammered'], ['universal/universal-mist-metallic', 'universal', 'metallic'], ['universal/universal-flat-metallic', 'universal', 'metallic'], ['universal/universal-matte-metallic', 'universal', 'metallic'], ['universal/universal-metallic', 'universal', 'metallic'], ['universal/universal-aged-metallic', 'universal', 'metallic'], ['universal/', 'universal', ''],
    ['stops-rust/hammered-spray', 'stopsrust', 'hammered'], ['stops-rust/metallic', 'stopsrust', 'metallic'], ['stops-rust/bright-coat', 'stopsrust', 'metallic'], ['stops-rust/textured-metallic', 'stopsrust', 'textured'], ['stops-rust/textured', 'stopsrust', 'textured'], ['stops-rust/multicolor-textured', 'stopsrust', 'textured'],
    ['stops-rust/clean-metal-primer-spray', 'stopsrust', 'primer'], ['stops-rust/rusty-metal-primer-spray', 'stopsrust', 'primer'], ['stops-rust/automotive-primer-spray', 'stopsrust', 'primer'], ['stops-rust/universal-bonding-primer', 'stopsrust', 'primer'], ['stops-rust/protective-enamel', 'stopsrust', ''], ['stops-rust/stops-rust-protective-enamel-turbo-spray', 'stopsrust', ''],
    ['specialty/high-heat', 'highheat', ''], ['specialty/metallic-spray', 'specialty', 'metallic'], ['specialty/glitter', 'specialty', 'glitter'], ['specialty/fluorescent-spray', 'specialty', 'neon'], ['specialty/glow-in-the-dark', 'specialty', 'glow'], ['specialty/color-shift', 'specialty', 'effect'], ['specialty/frosted-glass-spray', 'specialty', 'frosted'], ['specialty/mirror-effect', 'specialty', 'mirror'], ['specialty/lacquer-spray', 'specialty', ''], ['specialty/stone-spray', 'specialty', 'textured'], ['specialty/marble-spray-paint', 'specialty', 'effect'], ['specialty/appliance-epoxy', 'appliance', ''], ['specialty/plastic-primer-spray', 'specialty', 'primer'], ['specialty/chalkboard', 'specialty', 'chalkboard'],
    ['chalked/ultra-matte-paint-aerosol', 'chalked', 'chalky'],
    ['american-accents-2x/2x-clear', 'aa2x', 'clear'], ['american-accents-2x/2x-metallic', 'aa2x', 'metallic'], ['american-accents-2x/2x-primer', 'aa2x', 'primer'], ['american-accents-2x/2x-ultra-matte', 'aa2x', 'matte'], ['american-accents-2x/', 'aa2x', ''],
    ['low-odor-premium-spray-paint/low-odor-premium-primers', 'lowodor', 'primer'], ['low-odor-premium-spray-paint/', 'lowodor', ''], ['rust-o/artist-spray-paint', 'rusto', '']];
  const rows = [], seen = new Set();
  let photo = 0;
  for (const x of readJSON('rustoleum_sprays.json')) {
    const L = LINE.find(([p]) => x.slug.startsWith(p)); if (!L || seen.has(x.sku)) continue;
    // sprays only: no quarts, gallons, pens, kits or touch-up bottles
    if (/quart|gallon|pint|kit|touch|pen|tool|fl oz/i.test(x.size) || !(/spray|aerosol/i.test(x.size) || /^(\d+(\.\d+)? oz\.?)?$/i.test(String(x.size).trim()))) continue;
    let hex = normHex(x.hex);
    if (!hex && chips[x.sku + '.jpg']) { hex = normHex(chips[x.sku + '.jpg']); photo++; }
    if (!hex) continue;
    const name = decode(x.name);
    const finish = L[2] || (/\bclear\b/i.test(name) ? 'clear' : /\bprimer\b/i.test(name) ? 'primer' : SHEEN(x.sheen) || nameFinish(name) || 'gloss');
    seen.add(x.sku);
    rows.push([x.sku, name, hex, finish, L[1]]);
  }
  rows.sort((a, b) => a[4].localeCompare(b[4]) || a[1].localeCompare(b[1]));
  sprayBrands.push({ id: 'rustoleum', name: 'Rust-Oleum', source: 'rustoleum.com product pages (the brand’s own color values; a few finishes averaged from their photos)', date: today,
    note: 'Painter’s Touch 2X, Universal, Stops Rust, Specialty, Chalked, American Accents 2X and more. The number is the can’s SKU.' });
  sprayRows.rustoleum = rows;
  report.push(`${'Rust-Oleum (spray)'.padEnd(35)} ${String(rows.length).padStart(4)} cans (${photo} from photos)`);
}
if (exists('krylon_sprays.json')) {
  Object.assign(sprayLines, { fusion: ['krylon', 'Fusion All-In-One'], colormaxx: ['krylon', 'COLORmaxx'], rusttough: ['krylon', 'Rust Tough'], kchalky: ['krylon', 'Chalky Finish'], harmony: ['krylon', 'Harmony'], kclassic: ['krylon', 'Classic'], decor: ['krylon', 'Décor Selects'], shortcuts: ['krylon', 'Short Cuts'], kmetal: ['krylon', 'Premium Metallic'], kspecial: ['krylon', 'Specialty Finishes'], krylon: ['krylon', 'Spray Paint'] });
  const K = { 'Fusion All-In-One': ['fusion', ''], 'Fusion All-In-One Metallic': ['fusion', 'metallic'], 'Fusion All-In-One Hammered': ['fusion', 'hammered'], 'Fusion All-In-One Textured': ['fusion', 'textured'],
    'COLORmaxx Spray Paint': ['colormaxx', ''], 'COLORmaxx Metallic Spray Paint': ['colormaxx', 'metallic'], 'Rust Tough Spray Paint': ['rusttough', ''], 'Chalky Finish Paint Spray': ['kchalky', 'chalky'], 'Harmony': ['harmony', ''], 'Classic': ['kclassic', ''],
    'Décor Selects Spray Paint': ['decor', ''], 'Short Cuts Aerosol Paint Sprays': ['shortcuts', ''], 'Premium Metallic Spray Paint': ['kmetal', 'metallic'], 'Premium Foil Metallic Spray Paint': ['kmetal', 'metallic'], 'Brilliant Metallic Finishing Spray': ['kmetal', 'metallic'], 'Metallic Paint Finish': ['kmetal', 'metallic'],
    'Glitter Blast Finish Spray': ['kspecial', 'glitter'], 'Glitter Shimmer Finish Spray': ['kspecial', 'glitter'], 'Shimmer Metallic Finish Spray': ['kspecial', 'glitter'], 'Color Morph Aerosol Paint': ['kspecial', 'effect'], 'Neon Colored Paint Spray': ['kspecial', 'neon'], 'Glowz Spray Paint': ['kspecial', 'glow'],
    'Coarse Stone Textured Finish Spray': ['kspecial', 'textured'], 'Fine Stone Textured Finish Spray': ['kspecial', 'textured'], 'Marbelizing Paint Spray': ['kspecial', 'effect'], 'Crackle Base Coat Spray': ['kspecial', 'effect'], 'Crackle Top Coat Spray': ['kspecial', 'effect'],
    'Stained Glass Paint Spray': ['kspecial', 'glass'], 'Sea Glass Finish Spray': ['kspecial', 'glass'], 'Frosted Glass Finishing Spray': ['kspecial', 'frosted'], 'Chalkboard Paint Finish': ['kspecial', 'chalkboard'] };
  // tags the chart doesn't name: Rust Tough's safety colors, metallics and primer; primers; tractor colors (left out)
  const TAG = { 'cbg:20856103': ['rusttough', ''], 'cbg:20856101': ['rusttough', 'metallic'], 'cbg:20856105': ['rusttough', 'metallic'], 'cbg:20856100': ['rusttough', 'primer'], 'cbg:12954478': ['krylon', 'primer'], 'cbg:9169776': ['krylon', 'primer'], 'cbg:9190330': ['kspecial', 'frosted'] };
  const chips = exists('spray_chips.json') ? readJSON('spray_chips.json') : {};
  const rows = [], seen = new Set();
  for (const x of readJSON('krylon_sprays.json')) {
    const hex = normHex(x.hex) || normHex(chips['kr-' + x.id + '.jpg']); if (!hex) continue;
    let ls = x.lines.map(l => K[l]).filter(Boolean);
    if (!ls.length) ls = x.tags.map(t => TAG[t]).filter(Boolean).slice(0, 1);
    if (!ls.length && !x.lines.length && !x.tags.includes('cbg:25746674')) ls = [['krylon', '']];
    for (const [line, f] of ls) {
      const k = line + '|' + x.id; if (seen.has(k)) continue; seen.add(k);
      const name = decode(x.name);
      const finish = f || (x.kind.includes('Hammered') ? 'hammered' : x.kind.includes('Metallic') ? 'metallic' : x.kind.includes('Stone') ? 'textured' : x.kind.includes('Chalky') ? 'chalky' : /\bprimer\b/i.test(name) ? 'primer' : /^clear\b/i.test(name) ? 'clear' : '');
      rows.push(['', name, hex, finish, line, x.id]);
    }
  }
  rows.sort((a, b) => a[4].localeCompare(b[4]) || a[1].localeCompare(b[1]));
  sprayBrands.push({ id: 'krylon', name: 'Krylon', codeless: true, source: 'krylon.com color chart (the brand’s own color values; metallics, glitters and textures averaged from their photos)', date: today,
    note: 'Fusion All-In-One, COLORmaxx, Rust Tough, Chalky Finish, metallics and specialty finishes. Krylon goes by color name.' });
  sprayRows.krylon = rows;
  report.push(`${'Krylon (spray)'.padEnd(35)} ${String(rows.length).padStart(4)} cans`);
}
if (exists('montana_sprays.json')) {
  sprayLines.mtngold = ['montana', 'Montana GOLD'];
  const rows = [], seen = new Set();
  for (const x of readJSON('montana_sprays.json')) {
    const hex = normHex(x.hex); if (!hex) continue;
    let code = x.code, name = decode(x.name);
    // "CLASSIC 2100 Shrimp Pastel", "3000 100% Magenta": the number is the code
    const m = name.match(/^(?:CLASSIC\s+)?(\d{3,5})\s+(.+)$/); if (!code && m) { code = m[1]; name = m[2]; }
    if (!name || seen.has(code || name)) continue; seen.add(code || name);
    rows.push([code, name, hex, /^F\d/.test(code) ? 'neon' : 'satin', 'mtngold']);
  }
  sprayBrands.push({ id: 'montana', name: 'Montana GOLD', source: 'montana-cans.com color pages (the brand’s own color values)', date: today,
    note: 'Low-pressure artist spray paint with a satin finish, for murals, signs and crafts. Sold at art stores and some hardware stores.' });
  sprayRows.montana = rows;
  report.push(`${'Montana GOLD (spray)'.padEnd(35)} ${String(rows.length).padStart(4)} cans`);
}
if (sprayBrands.length) {
  fs.writeFileSync(path.join(OUT, 'sprays.js'),
    `/* Spray paint colors. Generated by tools/build-data.mjs on ${today}.\n   Row: [code, name, hex, finish, line (a key of lines: [brand, product line]), brand's own id]. */\n` +
    `window.CG_SPRAYS = ${JSON.stringify({ brands: sprayBrands, lines: sprayLines, rows: sprayRows })};\n`);
}

// A brand with no new download in this folder keeps the file and entry it already has, so one brand can be added
// or refreshed without downloading every brand again. (A folder with no paint brands in it, like one with only the
// spray paint downloads, leaves the brand list as it is.)
const freshPaint = brands.length;
try {
  const t = fs.readFileSync(path.join(OUT, 'brands.js'), 'utf8');
  for (const b of JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1))) {
    if (!brands.some(x => x.id === b.id) && fs.existsSync(path.join(OUT, 'colors', b.id + '.js'))) { brands.push(b); report.push(`${b.name.padEnd(34)} kept as it was (${b.count} colors)`); }
  }
} catch (e) { /* first build */ }
const order = ['sw', 'bm', 'behr', 'valspar', 'ppg', 'glidden', 'hgsw', 'dutchboy', 'de', 'dv', 'ck', 'magnolia', 'kilz', 'vista', 'hl', 'colorhouse', 'resene', 'fb', 'duluxau', 'plascon', 'sico', 'nerolac', 'ral'];
const rank = id => (order.includes(id) ? order.indexOf(id) : order.length - 1.5);   // anything new goes just before RAL
brands.sort((a, b) => rank(a.id) - rank(b.id));
if (freshPaint) {
  fs.writeFileSync(path.join(OUT, 'brands.js'),
    `/* Brand list. Generated by tools/build-data.mjs on ${today}. */\nwindow.CG_BRANDS = ${JSON.stringify(brands, null, 1)};\n`);
  // list of data files for the offline cache (sw.js)
  fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify(brands.map(b => `data/colors/${b.id}.js`), null, 1) + '\n');
}
console.log(report.join('\n'));
console.log('Total colors:', brands.reduce((s, b) => s + b.count, 0));
