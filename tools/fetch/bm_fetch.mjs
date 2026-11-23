import fs from 'fs';
const out = process.argv[2];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const pages = ["affinity-color-collection","benjamin-moore-classics","color-preview","color-stories","designer-classics","historical-collection","off-white-collection","williamsburg-paint-color-collection","white","gray","blue","green","red","pink","purple","orange","yellow","brown","black","neutral","exterior","interior","most-popular","stucco","solid-stain","semi-solid-stain","pale","dark","light","soft","ceiling","front-door","cabinet"];
const colors = new Map(); const coll = new Map();
function walk(o, collName) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach(x => walk(x, collName)); return; }
  if (typeof o.number === 'string' && typeof o.hex === 'string' && typeof o.name === 'string' && /^[0-9A-Fa-f]{6}$/.test(o.hex)) {
    const prev = colors.get(o.number) || {};
    const rec = { ...prev };
    for (const k of ['name','number','hex','lrv','family','exterior_availability','is_best_selling','aliases','previous_name','description','collections']) if (o[k] !== undefined && o[k] !== null && rec[k] === undefined) rec[k] = o[k];
    colors.set(o.number, rec);
  }
  if (o.color && o.collections && o.color.number) { const r = colors.get(o.color.number); }
  for (const k of Object.keys(o)) walk(o[k], collName);
}
for (const p of pages) {
  try {
    const r = await fetch("https://www.benjaminmoore.com/en-us/paint-colors/" + p, { headers: { "User-Agent": UA, "Accept": "text/html" } });
    const t = await r.text();
    const m = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    const before = colors.size;
    if (m) { const j = JSON.parse(m[1]); const ns = new Set(); 
      (function w(o){ if(!o||typeof o!=='object')return; if(Array.isArray(o)){o.forEach(w);return;} if(typeof o.number==='string'&&typeof o.hex==='string')ns.add(o.number); for(const k of Object.keys(o))w(o[k]); })(j.props.pageProps);
      coll.set(p, [...ns]); walk(j.props.pageProps, p); }
    console.log(p, r.status, t.length, "colors on page:", (coll.get(p)||[]).length, "new:", colors.size - before, "total:", colors.size);
  } catch (e) { console.log(p, "ERR", e.message); }
  await new Promise(r => setTimeout(r, 800));
}
fs.writeFileSync(out, JSON.stringify({ colors: [...colors.values()], collections: Object.fromEntries(coll) }));
