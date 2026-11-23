// Sherwin-Williams SuperDeck stain colors (DB codes) and Deck & Dock coatings (DD codes): each color page in
// sherwin-williams.com's public sitemap names the color and its stain type and shows a swatch photo. This saves
// the swatch's address; the color is the average of that photo (see tools/fetch/average_swatches.js).
// One page at a time, with a pause.
// Usage: node tools/fetch/sw_stain_fetch.mjs <sitemap.xml> <out.json>
import fs from 'fs';
const [sitemap, out] = process.argv.slice(2);
const urls = [...new Set([...fs.readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]*\/homeowners\/[^<]*\/stain-colors\/(?:DB|DD)\d+[^<]*)<\/loc>/g)].map(m => m[1]))];
const UA = { 'User-Agent': 'ColorGenius color list (paint store color tool)' };
const rows = [];
for (const [i, u] of urls.entries()) {
  try {
    const t = await (await fetch(u, { headers: UA })).text();
    const img = t.match(/id="stainColorDetailsMainSwatch" src="([^"]*)" alt="([^"]*)"/);
    if (!img) { console.log('no swatch', u); continue; }
    const src = 'https:' + img[1].replace(/^https?:/, '');
    const alt = img[2].trim(); // "DB 2100 Weathered Gray"
    const m = alt.match(/^([A-Z]{2})\s*(\d+)\s+(.+)$/);
    const text = t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const type = (text.match(new RegExp(alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ((?:Exterior|Interior) [A-Za-z -]*?(?:Stain|Coating))')) || [])[1] || '';
    if (m) rows.push({ code: m[1] + ' ' + m[2], name: m[3], img: src, type, url: u });
    else console.log('skip', alt, img[1]);
    if (i % 20 === 0) console.log(i, '/', urls.length, alt, type);
  } catch (e) { console.log('ERR', u, e.message); }
  await new Promise(r => setTimeout(r, 500));
}
fs.writeFileSync(out, JSON.stringify(rows));
console.log('done', rows.length, 'of', urls.length);
