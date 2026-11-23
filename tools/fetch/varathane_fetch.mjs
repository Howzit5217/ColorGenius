// Varathane (Rust-Oleum) wood stain colors. Each product page in rustoleum.com's public sitemap lists every
// color of that product with its name and a photo of the stain on wood ("color chip"). This saves the names and
// downloads the chip photos; tools/fetch/average_chips.ps1 then averages each photo into one color.
// Usage: node tools/fetch/varathane_fetch.mjs <products-sitemap.xml> <out-folder>
import fs from 'fs';
import path from 'path';
const [sitemap, outDir] = process.argv.slice(2);
fs.mkdirSync(path.join(outDir, 'chips'), { recursive: true });
const UA = { 'User-Agent': 'ColorGenius color list (paint store color tool)' };
// the interior stain lines; one product page per line lists all of its colors
const LINES = { 'varathane-fast-dry-wood-stain': 'Fast Dry Wood Stain', 'premium-wood-stains': 'Premium Wood Stain', 'water-based-wood-stain': 'Water-Based Wood Stain', 'premium-gel-stain': 'Premium Gel Stain' };
const locs = [...fs.readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
const rows = [];
for (const [slug, line] of Object.entries(LINES)) {
  const u = locs.find(l => l.includes(`/varathane/${slug}/sku/`));
  if (!u) { console.log('no page for', slug); continue; }
  const t = await (await fetch(u, { headers: UA })).text();
  const seen = new Set();
  for (const m of t.matchAll(/"color":\{"value":"([^"]+)"\}[\s\S]{0,600}?"colorChip":\{"src":"([^"]*)"\}/g)) {
    const name = m[1].trim(), chip = m[2];
    if (!chip || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const file = `${slug}--${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
    const img = await fetch('https://www.rustoleum.com' + chip, { headers: UA });
    if (img.ok) fs.writeFileSync(path.join(outDir, 'chips', file), Buffer.from(await img.arrayBuffer()));
    rows.push({ line, slug, name, file });
    await new Promise(r => setTimeout(r, 250));
  }
  console.log(line, seen.size, 'colors');
  await new Promise(r => setTimeout(r, 600));
}
fs.writeFileSync(path.join(outDir, 'varathane_list.json'), JSON.stringify(rows));
console.log('done', rows.length);
