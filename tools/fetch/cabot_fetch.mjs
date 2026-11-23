// Cabot stain colors: every color page listed in cabotstain.com's public sitemap (allowed by its robots.txt)
// shows the color's name, its opacity and a swatch value. One page at a time, with a pause between requests.
// Usage: node tools/fetch/cabot_fetch.mjs <sitemap.xml> <out.json>
import fs from 'fs';
const [sitemap, out] = process.argv.slice(2);
const urls = [...fs.readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]*\/browse-colors\/[^/<]+\/[^/<]+)<\/loc>/g)].map(m => m[1]);
const rows = [];
const UA = { 'User-Agent': 'ColorGenius color list (paint store color tool)' };
for (const [i, u] of urls.entries()) {
  try {
    const t = await (await fetch(u, { headers: UA })).text();
    const hex = (t.match(/cmp-dynamicCard__dab-card-color-swatch" style="background-color :#([0-9a-f]{6})/i) || t.match(/colorSploch:#([0-9a-f]{6})/i) || [])[1];
    const title = (t.match(/data-color-title="([^"]*)"/) || [])[1];
    const tags = (t.match(/data-color-tags="([^"]*)"/) || [])[1] || '';
    const fam = (t.match(/color_family:"([^"]*)"/) || [])[1] || '';
    const opacity = (tags.match(/cbg:(semi-transparent|semi-solid|solid|transparent|toner|clear|natural)/) || [])[1] || (u.match(/-(semi-transparent|semi-solid|solid|transparent)$/) || [])[1] || '';
    if (hex && title) rows.push({ name: title, hex: hex.toUpperCase(), opacity, family: fam, url: u });
    if (i % 25 === 0) console.log(i, '/', urls.length, title, hex, opacity);
  } catch (e) { console.log('ERR', u, e.message); }
  await new Promise(r => setTimeout(r, 450));
}
fs.writeFileSync(out, JSON.stringify(rows));
console.log('done', rows.length, 'of', urls.length);
