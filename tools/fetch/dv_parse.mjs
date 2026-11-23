import fs from 'fs';
const t = fs.readFileSync(process.argv[2], 'utf8');
const panes = [...t.matchAll(/<div id="([a-z0-9-]+)" role="tabpanel"/g)].map(m => ({ id: m[1], at: m.index }));
const names = Object.fromEntries([...t.matchAll(/href="#([a-z0-9-]+)"[^>]*data-toggle="tab">([^<]+)</g)].map(m => [m[1], m[2]]));
const out = new Map();
for (const m of t.matchAll(/<a href="([^"]+)" class="color-cell" style="background-color: #([0-9A-Fa-f]{6})"[\s\S]{0,600}?data-content="<strong>([^<]+)<\/strong><br>Number: ([^"]+)"/g)) {
  const pane = panes.filter(p => p.at < m.index).pop();
  const coll = pane ? (names[pane.id] || pane.id) : '';
  const code = m[4].trim(); const name = m[3].replace(/&amp;/g, '&').replace(/&#039;/g, "'").trim();
  const key = code + '|' + name;
  if (!out.has(key)) out.set(key, { code, name, hex: m[2].toUpperCase(), collections: [coll], url: m[1] });
  else if (!out.get(key).collections.includes(coll)) out.get(key).collections.push(coll);
}
const arr = [...out.values()];
console.log('panes', panes.map(p => p.id + '=' + (names[p.id] || '')).join(', '), 'colors', arr.length);
const cnt = {}; arr.forEach(c => c.collections.forEach(x => cnt[x] = (cnt[x] || 0) + 1)); console.log(cnt);
fs.writeFileSync(process.argv[3], JSON.stringify(arr));
