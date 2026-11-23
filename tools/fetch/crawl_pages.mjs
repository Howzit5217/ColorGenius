// Usage: node crawl_pages.mjs <sitemap.xml> <urlFilterSubstring> <out.jsonl> <parser: glidden|pitt>
import fs from 'fs';
const [,, sitemap, filt, out, parser] = process.argv;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const urls = [...fs.readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => u.includes(filt));
const done = new Set();
if (fs.existsSync(out)) for (const l of fs.readFileSync(out, 'utf8').split('\n')) { if (l) try { done.add(JSON.parse(l).url); } catch {} }
const todo = urls.filter(u => !done.has(u));
console.log(`total ${urls.length}, already ${done.size}, todo ${todo.length}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function dec(s){return s.replace(/&amp;/g,'&').replace(/&#x27;|&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
function parse(html, url) {
  const rec = { url };
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  rec.title = dec(title);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); const arr = Array.isArray(j) ? j : [j];
      for (const o of arr) if (o && o['@type'] === 'Product') {
        rec.ldName = o.name;
        for (const p of (o.additionalProperty || [])) {
          if (p.name === 'Color Number') rec.code = p.value;
          if (p.name === 'RGB') rec.rgb = p.value;
          if (p.name === 'Color Group' && p.value) rec.group = p.value;
          if (/LRV/i.test(p.name)) rec.lrv = p.value;
        }
      }
    } catch {}
  }
  const t = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const rgbT = t.match(/R:\s*(\d+)\s*G:\s*(\d+)\s*B:\s*(\d+)/); if (rgbT && !rec.rgb) rec.rgb = `rgb(${rgbT[1]}, ${rgbT[2]}, ${rgbT[3]})`;
  const lrv = t.match(/LRV:\s*([\d.]+)/); if (lrv && rec.lrv === undefined) rec.lrv = lrv[1];
  const dr = html.match(/data-rgb="(\d+),(\d+),(\d+)"/); if (dr && !rec.rgb) rec.rgb = `rgb(${dr[1]}, ${dr[2]}, ${dr[3]})`;
  const fam = t.match(/Color Family:?\s*([A-Za-z &]+?)\s{1,2}(?:[A-Z][a-z]+:|$)/); if (fam) rec.family = fam[1];
  if (/interior/i.test(t) && /exterior/i.test(t)) rec.intExtMention = true;
  const deId=t.match(/Dunn-Edwards ID:\s*([A-Z0-9]+)/); if(deId) rec.code=deId[1];
  const deL=t.match(/Light Reflectance Value:\s*LRV\s*([\d.]+)/); if(deL) rec.lrv=deL[1];
  const deH=t.match(/Hex color code:\s*([0-9A-Fa-f]{6})/); if(deH) rec.hex=deH[1];
  const deFam=t.match(/Color Family:\s*([A-Za-z &]+?)\s+(?:Color|Collection|Hue|LRV|Dunn)/); if(deFam) rec.family=deFam[1];
  return rec;
}
let i = 0, ok = 0, fail = 0;
async function worker() {
  while (i < todo.length) {
    const u = todo[i++];
    let tries = 0;
    while (tries < 4) {
      try {
        const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
        if (r.status === 429 || r.status >= 500) { tries++; await sleep(5000 * tries); continue; }
        if (r.status !== 200) { fs.appendFileSync(out, JSON.stringify({ url: u, status: r.status }) + '\n'); fail++; break; }
        const h = await r.text();
        fs.appendFileSync(out, JSON.stringify(parse(h, u)) + '\n'); ok++; break;
      } catch (e) { tries++; await sleep(3000 * tries); }
    }
    if ((ok + fail) % 250 === 0) console.log(`${ok + fail}/${todo.length} ok=${ok} fail=${fail}`);
    await sleep(250);
  }
}
const CONC = Number(process.env.CONC || 3);
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`DONE ok=${ok} fail=${fail}`);
