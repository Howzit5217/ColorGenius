// Downloads the public colour lists of paint brands from around the world, from each brand's own website, into a
// folder for tools/build-data.mjs. Only pages anyone can open in a browser are read, one at a time, with a pause
// between them.
//   node tools/fetch/world_fetch.mjs <raw-download-folder> [dulux_au plascon sico nerolac]
//
// Dulux Australia / New Zealand: the Colour Atlas page carries every colour (name, specifier number, colour, LRV).
// Plascon (South Africa): every page carries the full colour list the site's colour slider uses.
// Sico (Canada): each colour family page lists 100 colours, with Next links to the rest.
// Nerolac (India): the colour catalogue lists 28 colours a page, with a Load More link to the next.
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2];
if (!OUT) { console.error('Usage: node tools/fetch/world_fetch.mjs <raw-download-folder> [brands...]'); process.exit(1); }
const only = process.argv.slice(3);
fs.mkdirSync(path.join(OUT, 'intl'), { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const wait = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let tries = 0; tries < 3; tries++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
      if (r.ok) return await r.text();
      if (r.status === 404) return '';
    } catch (e) { /* try again */ }
    await wait(2000 * (tries + 1));
  }
  throw new Error('Could not load ' + url);
}
const save = (name, rows) => { fs.writeFileSync(path.join(OUT, 'intl', name), JSON.stringify(rows)); console.log(`${name}: ${rows.length} colours`); };
const unent = s => String(s).replace(/&amp;/g, '&').replace(/&#0?39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

const jobs = {
  async dulux_au() {
    const s = (await get('https://www.dulux.com.au/specifier/colour/colour-atlas/')).replace(/\\"/g, '"');
    const re = /"colour":\{"slug":"([^"]*)","displayName":"([^"]*)","imageUrl":"[^"]*","specifierNumber":"([^"]*)","categoryEntries":(\[.*?\]),"brand":\{"name":"([^"]*)"[^}]*\},"rgb":\{"hex":"(#[0-9a-fA-F]{6})"[^}]*\},"lrv":([0-9.]+|null)/g;
    const seen = new Map(); let m;
    while ((m = re.exec(s))) {
      if (m[5] !== 'Dulux' || seen.has(m[3])) continue;
      const cats = [...m[4].matchAll(/"name":"([^"]*)"/g)].map(x => x[1]);
      seen.set(m[3], { code: m[3], name: m[2].replace(/™|®/g, '').trim(), hex: m[6], lrv: m[7] === 'null' ? null : +m[7], family: cats[0] || '' });
    }
    save('dulux_au.json', [...seen.values()]);
  },
  async plascon() {
    const s = await get('https://plascon.co.za/colour-combo-2024');
    const re = /\{\s*"id":\s*"[0-9a-f-]{36}",\s*"name":\s*"([^"]*)",\s*"code":\s*"([^"]*)",\s*"hex":\s*"([0-9a-fA-F]{6})"/g;
    const seen = new Map(); let m;
    while ((m = re.exec(s))) if (!seen.has(m[2])) seen.set(m[2], { code: m[2], name: unent(m[1]), hex: '#' + m[3] });
    save('plascon.json', [...seen.values()]);
  },
  async sico() {
    const home = await get('https://sico.ca/en-ca/nos-couleurs');
    const fams = [...new Set(home.match(/\/en-ca\/colour-families\/[a-z-]+/g) || [])];
    const seen = new Map();
    for (const f of fams) {
      let url = 'https://www.sico.ca' + f, page = 0;
      while (url && page++ < 40) {
        const s = await get(url);
        const re = /href="\/en-ca\/colours\/([a-z0-9-]+)"[^>]*>\s*<div class="swatch-inner"><div[^>]*english-color">([^<]*)<\/div><div[^>]*french-color">([^<]*)<\/div><div class="text-size-medium">([^<]*)<\/div>[\s\S]*?rgb\((\d+),\s*(\d+),\s*(\d+)\)/g;
        let m, n = 0;
        while ((m = re.exec(s))) { n++; const code = m[4].trim(); if (!seen.has(code)) seen.set(code, { code, name: unent(m[2]), fr: unent(m[3]), rgb: [+m[5], +m[6], +m[7]], family: f.split('/').pop() }); }
        const next = s.match(/href="(\?[0-9a-f]+_page=\d+)" aria-label="Next Page"/);
        url = n && next ? 'https://www.sico.ca' + f + next[1] : null;
        await wait(400);
      }
      console.log(`  sico ${f}: ${seen.size} so far`);
    }
    save('sico.json', [...seen.values()]);
  },
  async nerolac() {
    const seen = new Map();
    for (let page = 0; page < 200; page++) {
      const s = await get('https://www.nerolac.com/colour-catalogue' + (page ? '?page=' + page : ''));
      const re = /data-title="([^"]*)" data-colourcode="([^"]*)">\s*<div class="color-code" style="background-color: (#[0-9A-Fa-f]{6});/g;
      let m, n = 0;
      while ((m = re.exec(s))) { n++; const code = m[2].trim(); if (code && !seen.has(code)) seen.set(code, { code, name: unent(m[1]), hex: m[3] }); }
      if (!n || !/rel="next"/.test(s)) break;
      await wait(400);
    }
    save('nerolac.json', [...seen.values()]);
  },
};
for (const [k, run] of Object.entries(jobs)) {
  if (only.length && !only.includes(k)) continue;
  try { await run(); } catch (e) { console.error(k + ': ' + e.message); }
}
