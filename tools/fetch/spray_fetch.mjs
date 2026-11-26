// Spray paint colors, from each brand's own website: every color's name, number, hex value, sheen and product line.
//  - Rust-Oleum: every spray product page in rustoleum.com's public sitemap lists its SKUs with the color name, sheen,
//    color group and the brand's own hex value (Painter's Touch 2X, Universal, Stops Rust, Specialty, American Accents
//    2X, Chalked and more).
//  - Krylon: the color chart (krylon.com/en/colors) gives every color's hex value and the product lines it comes in.
//  - Montana GOLD: each color page on montana-cans.com shows the color with its code and hex value.
// Usage: node tools/fetch/spray_fetch.mjs <out-folder> [rustoleum|krylon|montana]   (then: node tools/build-data.mjs <out-folder>)
import fs from 'fs';
import path from 'path';
const [outDir, only] = process.argv.slice(2);
if (!outDir) { console.error('Usage: node tools/fetch/spray_fetch.mjs <out-folder>'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; ColorGenius color list; paint store color tool)' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const get = async u => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); };
const unesc = s => String(s || '').replace(/&amp;/g, '&').replace(/&#39;|&#039;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&reg;|®/g, '').replace(/&trade;|™/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// ---------------- Rust-Oleum ----------------
// the consumer spray lines, by the folder their product pages are in; a page's SKUs that aren't sprays (quarts,
// brush-on) are left out below
const RO_DIRS = ['painters-touch-2x-ultra-cover', 'universal', 'stops-rust', 'specialty', 'american-accents-2x', 'chalked', 'low-odor-premium-spray-paint', 'rust-o', 'milk-paint-finish', 'color-spark'];
async function rustoleum() {
  const index = await get('https://www.rustoleum.com/sitemap-products.xml');
  const pages = [...index.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1])
    .filter(u => !u.includes('/sku/') && RO_DIRS.some(d => u.includes('/consumer-brands/' + d + '/')));
  const rows = [], seen = new Set();
  for (const u of pages) {
    let t;
    try { t = await get(u); } catch (e) { console.log('skip', u, e.message); continue; }
    const m = t.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) continue;
    const title = unesc((t.match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/\s*\|.*$/, '');
    const slug = u.split('/consumer-brands/')[1].replace(/\/$/, '');
    let n = 0;
    (function walk(o, size) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(x => walk(x, size)); return; }
      let s = size;
      if (o.sKUSize && o.sKUSize.size && o.sKUSize.size.name) s = o.sKUSize.size.name.value || '';
      if (o.sKUNumber && o.color && o.sKUNumber.value && !seen.has(o.sKUNumber.value)) {
        seen.add(o.sKUNumber.value);
        const list = k => ((o[k] && o[k].list) || []).map(x => (x.text || x.name || {}).value).filter(Boolean);
        const chip = (o.highRescolorChip && o.highRescolorChip.src) || (o.colorChip && o.colorChip.src) || '';
        rows.push({ sku: o.sKUNumber.value, name: unesc(o.color.value), size: s, hex: (o.colorHexCode && o.colorHexCode.value) || '', sheen: list('sheen').join('|'), group: list('colorGroups').join('|'), line: title, slug, chip });
        n++;
      }
      for (const k of Object.keys(o)) if (k !== 'skuGalleries') walk(o[k], s);
    })(JSON.parse(m[1]), '');
    console.log('Rust-Oleum', slug, n);
    await wait(500);
  }
  return rows;
}

// ---------------- Krylon ----------------
async function krylon() {
  const t = await get('https://www.krylon.com/en/colors');
  const opts = {};
  for (const m of t.matchAll(/<input id="(cbg:[^"]+)" type="checkbox" name="([^"]*)" value="[^"]*" data-group-id="([^"]*)"/g)) opts[m[1]] = { name: unesc(m[2]), group: m[3] };
  // the product lines that only show up as a filter title (no checkbox of their own)
  for (const m of t.matchAll(/(cbg:\d+)"[^>]*>[\s\S]{0,600}?data-filter-title="([^"]*)"/g)) if (!opts[m[1]]) opts[m[1]] = { name: unesc(m[2]), group: 'product-line' };
  const cols = new Map();
  for (const m of t.matchAll(/<div class="cbg-cmp-wall-item__swatch-container"([^>]*)>/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/(data-[a-zA-Z-]+)="([^"]*)"/g)].map(x => [x[1], x[2]]));
    if (!a['data-color-id']) continue;
    const c = cols.get(a['data-color-id']) || { id: a['data-color-id'], name: unesc(a['data-color-name']), hex: a['data-hex'] || '', image: a['data-imageUrl'] || '', tags: new Set() };
    String(a['data-tags'] || '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => c.tags.add(x));
    cols.set(c.id, c);
  }
  const rows = [...cols.values()].map(c => {
    const named = [...c.tags].map(x => opts[x]).filter(Boolean);
    return { id: c.id, name: c.name, hex: c.hex, image: c.image, lines: named.filter(x => x.group === 'product-line').map(x => x.name), family: named.filter(x => x.group === 'color-family').map(x => x.name), kind: named.filter(x => x.group !== 'product-line' && x.group !== 'color-family').map(x => x.name), tags: [...c.tags].filter(x => !opts[x]) };
  });
  console.log('Krylon', rows.length);
  return rows;
}

// ---------------- Montana GOLD ----------------
async function montana() {
  const index = await get('https://www.montana-cans.com/sitemap.xml');
  const sub = (index.match(/<loc>([^<]*)<\/loc>/) || [])[1];
  const gz = await fetch(sub, { headers: UA });
  const { gunzipSync } = await import('zlib');
  const list = gunzipSync(Buffer.from(await gz.arrayBuffer())).toString('utf8');
  const pages = [...list.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]).filter(u => /\/Montana-GOLD-400ml-(Colors|Metallic-Colors|Chrome-Effect-Colors|Fluorescent-Colors|Transparent-Colors)\//.test(u));
  const rows = [], seen = new Set();
  for (const u of pages) {
    const t = await get(u);
    const line = /Metallic|Chrome/.test(u) ? 'Metallic' : /Fluorescent/.test(u) ? 'Fluorescent' : /Transparent/.test(u) ? 'Transparent' : 'Colors';
    for (const m of t.matchAll(/style="background-color: (#[0-9a-fA-F]{6});[^"]*"\s+data-title="[^"]*"\s+data-color-title="([^"]*)"/g)) {
      const title = unesc(m[2]), code = (title.match(/^([A-Z]{1,3}\s?\d{3,5}[A-Z]?)\s+/) || [])[1] || '';
      const name = code ? title.slice(code.length).trim() : title;
      if (seen.has(code || name)) continue;
      seen.add(code || name);
      rows.push({ code: code.replace(/\s+/g, ''), name, hex: m[1], line });
    }
    console.log('Montana', line, rows.length);
    await wait(800);
  }
  return rows;
}

// Rust-Oleum and Krylon give a hex value for most colors; metallics, hammered, glitter and stone finishes only have a
// photo of the finish. Those photos are saved, and tools/fetch/average_chips.ps1 averages each into one color:
//   powershell -File tools/fetch/average_chips.ps1 <out-folder>/spray_chips <out-folder>/spray_chips.json
fs.mkdirSync(path.join(outDir, 'spray_chips'), { recursive: true });
const save = async (url, file) => { const img = await fetch(url, { headers: UA }); if (img.ok) fs.writeFileSync(path.join(outDir, 'spray_chips', file), Buffer.from(await img.arrayBuffer())); await wait(200); };
if (!only || only === 'rustoleum') {
  const ro = await rustoleum(); fs.writeFileSync(path.join(outDir, 'rustoleum_sprays.json'), JSON.stringify(ro));
  for (const x of ro.filter(x => !x.hex && x.chip)) await save('https://www.rustoleum.com' + x.chip, x.sku + '.jpg');
}
if (!only || only === 'krylon') {
  const kr = await krylon(); fs.writeFileSync(path.join(outDir, 'krylon_sprays.json'), JSON.stringify(kr));
  // (Krylon's photos are big: a small JPEG of each is plenty for its average)
  for (const x of kr.filter(x => !x.hex && x.image)) await save(x.image.replace('/webp/', '/jpeg/') + '?w=256', 'kr-' + x.id + '.jpg');
}
if (!only || only === 'montana') { const mt = await montana(); fs.writeFileSync(path.join(outDir, 'montana_sprays.json'), JSON.stringify(mt)); }
console.log('done');
