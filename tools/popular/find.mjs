// Finds each paint brand's Color of the Year and its most popular colors on the brand's own website and
// writes data/popular.js for the app. No color is named anywhere in this script: the brands' pages decide.
//
//   node tools/popular/find.mjs            look everything up and rewrite data/popular.js
//   node tools/popular/find.mjs --dry      look everything up and print what was found, change nothing
//
// A GitHub job runs it every week (.github/workflows/popular.yml) and saves the file when something changed.
//
// How it reads a brand:
//   1. Opens the starting pages in tools/popular/sources.json (a home page, a Color of the Year page, a
//      most-popular page) and follows the links on them to this year's and next year's Color of the Year
//      pages and to the brand's most popular colors.
//   2. A color counts only when the page shows its name AND its color number close together, checked
//      against the brand's own color list in data/colors. Names alone repeat across brands ("Grounded" is a
//      Behr, Sherwin-Williams, HGTV Home and Clark+Kensington color), so the number has to be there too.
//   3. On a Color of the Year page, the color is the one the page's title or heading names, with the year
//      taken from beside the words "Color of the Year" (or from the page address).
//   4. If a brand's site can't be reached this time, what was found there before is kept (popular colors
//      for up to 120 days, a Color of the Year until its year is over).
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'data/popular.js');
const DRY = process.argv.includes('--dry');
const ONLY = (process.argv.find(a => a.startsWith('--brand=')) || '').slice(8);
// An honest, generic name: the job reads public pages the way a shopper's browser would, one page at a time.
const UA = 'Mozilla/5.0 (compatible; paint-color-finder/1.0)';
const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = new Date().getUTCFullYear();
const MAX_PAGES = 10;          // per brand
const NEAR = 160;              // how close (in characters) a color's name and number must be
const KEEP_DAYS = 120;         // how long popular colors from a site that stopped answering are kept

const COTY_PATH = /colou?r[-_ ]?of[-_ ]?the[-_ ]?year|coty/i;
const POPULAR_PATH = /popular|top[-_]?\d+|best[-_]?sell/i;
const COTY_WORDS = /colou?r\s+of\s+the\s+year/gi;
const SKIP_PATH = /\.(pdf|jpe?g|png|webp|gif|svg|mp4|zip|css|js)$|\.amp$|\/(es|fr|fr-ca|en-ca|es-us|es-mx)(\/|$)|\/(search|cart|account|login|press-kit|sitecore)\b/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = s => String(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();

// ---------- the brands' own color lists ----------
function loadBrands() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/brands.js'), 'utf8'), ctx);
  for (const b of ctx.window.CG_BRANDS) {
    const f = path.join(ROOT, 'data/colors', b.id + '.js');
    if (fs.existsSync(f)) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx);
  }
  return { brands: ctx.window.CG_BRANDS, colors: ctx.window.CG_COLORS || {} };
}

// The color number as a brand prints it: "SW 6421", "HGSW6421", "HC-130", "8004-38E", "PPG10-16", "311-7DB".
function codePattern(brand, code) {
  const body = String(code).split(/[\s\-–/.]+/).filter(Boolean).map(esc).join('[\\s\\-–/.]?');
  const prefix = brand.prefix && /^[A-Z]+$/i.test(brand.prefix) ? `${esc(brand.prefix)}[\\s\\-]?` : '';
  return new RegExp(`(?<![A-Za-z0-9])${prefix}${body}(?![A-Za-z0-9])`, 'i');
}

function nameIndex(rows) {
  const byName = new Map();
  for (const r of rows || []) {
    const code = String(r[0]), name = String(r[1] || '');
    if (name.replace(/[^a-z]/gi, '').length < 3) continue;
    const k = norm(name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push({ code, name });
  }
  return byName;
}

// ---------- reading a page ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', reg: '®', trade: '™', copy: '©', hellip: '…' };
const decode = s => String(s)
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m))
  .replace(/\\u([0-9a-f]{4})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
const clean = s => decode(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function readPage(html) {
  const meta = key => {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'));
    return a ? clean(a[1]) : '';
  };
  const title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => clean(m[1])).filter(Boolean).join(' | ');
  const head = [meta('og:title'), meta('twitter:title'), h1].filter(Boolean).join(' | ');
  const desc = [meta('description'), meta('og:description')].filter(Boolean).join(' | ');
  // The page's words, plus the attribute values that carry color names and numbers (alt text, data-color-name …).
  // Script contents stay, since many sites put their color lists in JSON there.
  const text = decode(html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // the end of a paragraph, list item or box is marked ¶, so words from two blocks aren't read as one sentence
    .replace(/<\/(?:p|li|div|h[1-6]|td|th|tr|section|article|header|footer|figcaption|dd|dt)>|<br\s*\/?>/gi, ' ¶ ')
    .replace(/<[a-z][^>]*>/gi, tag => ' ' + [...tag.matchAll(/\s(?:alt|title|aria-label|content|data-[\w-]+)=["']([^"']{1,240})["']/gi)].map(m => m[1]).join(' ') + ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')).replace(/\s+/g, ' ');
  return { title, head, desc, text };
}

async function get(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.8' }, redirect: 'follow', signal: ctrl.signal });
    const body = await r.text();
    const blocked = r.status === 403 || r.status === 429 || /<title>(Just a moment|Attention Required|Access Denied)/i.test(body.slice(0, 4000));
    return { ok: r.ok && !blocked, status: r.status, url: r.url, body, note: blocked ? 'the site turned the request away' : r.ok ? '' : `the site answered ${r.status}` };
  } catch (e) {
    return { ok: false, status: 0, url, body: '', note: e.name === 'AbortError' ? 'timed out' : 'could not connect' };
  } finally { clearTimeout(timer); }
}

// The links on a page that lead to a Color of the Year page or a popular-colors page on the same site.
function findLinks(html, base) {
  const host = new URL(base).host;
  const out = new Map();
  for (const m of html.matchAll(/(?:href\s*=\s*|"(?:url|href|link|path)"\s*:\s*)["']([^"'\s<>]{2,300})["']/gi)) {
    let u;
    try { u = new URL(decode(m[1]), base); } catch { continue; }
    if (u.host !== host || !/^https?:$/.test(u.protocol) || SKIP_PATH.test(u.pathname)) continue;
    const p = u.pathname.replace(/\/{2,}/g, '/');
    const years = [...p.matchAll(/(?<!\d)(20\d\d)(?!\d)/g)].map(y => +y[1]);
    if (years.length && !years.some(y => y >= YEAR && y <= YEAR + 1)) continue;   // last year's pages are old news
    let rank = 0;
    if (COTY_PATH.test(p)) rank = years.includes(YEAR + 1) ? 4 : years.includes(YEAR) ? 3 : 2;
    else if (POPULAR_PATH.test(p)) rank = 1;
    else continue;
    const key = u.origin + p;
    out.set(key, Math.max(out.get(key) || 0, rank));
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
}

// Every brand color whose name and number sit together on the page, with where they were seen.
function colorsOnPage(page, brand, names) {
  const lower = norm(page.text);
  const words = new Set(lower.split(/[^a-z0-9']+/));
  const found = [];
  for (const [k, list] of names) {
    const first = k.split(/[^a-z0-9']+/).find(Boolean);
    if (!first || !words.has(first)) continue;
    const spots = [];
    for (let i = lower.indexOf(k); i >= 0; i = lower.indexOf(k, i + 1)) {
      const before = lower[i - 1], after = lower[i + k.length];
      if ((before && /[a-z0-9]/.test(before)) || (after && /[a-z0-9]/.test(after))) continue;
      spots.push(i);
      if (spots.length > 40) break;
    }
    if (!spots.length) continue;
    for (const c of list) {
      const re = codePattern(brand, c.code);
      const near = spots.filter(i => re.test(lower.slice(Math.max(0, i - NEAR), i + k.length + NEAR)));
      if (near.length) found.push({ code: c.code, name: c.name, key: k, spots: near });
    }
  }
  // in the order the page shows them, so a list keeps the brand's own ranking
  return found.sort((a, b) => a.spots[0] - b.spots[0]);
}

const hasName = (s, k) => { const t = norm(s); for (let i = t.indexOf(k); i >= 0; i = t.indexOf(k, i + 1)) { if (!/[a-z0-9]/.test(t[i - 1] || ' ') && !/[a-z0-9]/.test(t[i + k.length] || ' ')) return true; } return false; };
const validYear = y => y >= YEAR && y <= YEAR + 1;

// The year written beside "Color of the Year": "2027 Color of the Year", "Color of the Year 2027",
// "Color of the Year & Color Trends 2027".
function yearBeside(s) {
  const m = s.match(/(20\d\d)\W{0,3}(?:[A-Za-z®™]+\W{1,3}){0,2}?colou?r\s+of\s+the\s+year/i)
    || s.match(/colou?r\s+of\s+the\s+year\W{0,4}(?:[A-Za-z&®™]+\W{1,3}){0,3}?(20\d\d)(?!\d)/i);
  return m ? +m[1] : 0;
}

function cotyOnPage(page, found, url) {
  if (!found.length) return null;
  const isCotyPage = COTY_PATH.test(new URL(url).pathname) || COTY_WORDS.test(page.title + ' ' + page.head);
  COTY_WORDS.lastIndex = 0;
  if (!isCotyPage) return null;
  const year = yearBeside(page.title) || yearBeside(page.head) || +((new URL(url).pathname.match(/(?<!\d)(20\d\d)(?!\d)/) || [])[1] || 0) || yearBeside(page.desc);
  if (!validYear(year)) return null;
  const lower = norm(page.text);
  const phrases = [...lower.matchAll(/colou?r of the year/g)].map(m => m.index);
  let best = null;
  for (const f of found) {
    let score = 0;
    if (hasName(page.title, f.key)) score += 10;
    if (hasName(page.head, f.key)) score += 6;
    if (hasName(page.desc, f.key)) score += 3;
    score += Math.min(5, f.spots.filter(i => phrases.some(p => Math.abs(p - i) < 200)).length);
    if (!best || score > best.score) best = { f, score };
  }
  return best && best.score >= 6 ? { code: best.f.code, name: best.f.name, year, strength: best.score + (/(?<!\d)20\d\d(?!\d)/.test(new URL(url).pathname) ? 2 : 0) } : null;
}

// "2027 Color of the Year: Artifact" written on a page that isn't only about the Color of the Year, such as a
// home page banner. The year has to sit right beside the words and the color right after (or right before)
// them in the same sentence, so a list of past winners ("2026 Color of the Year … 2017 Honey Glow") or a
// "to get the look, choose …" suggestion doesn't count.
function cotyMentions(page, found) {
  const lower = norm(page.text);
  const out = [];
  for (const m of lower.matchAll(/colou?r of the year/g)) {
    const a = m.index, b = a + m[0].length;
    const y = +((lower.slice(Math.max(0, a - 14), a).match(/(20\d\d)\D{0,8}$/) || lower.slice(b, b + 14).match(/^\D{0,6}(20\d\d)(?!\d)/) || [])[1] || 0);
    if (!validYear(y)) continue;
    let best = null;
    for (const f of found) for (const i of f.spots) {
      const end = i + f.key.length;
      // after the words it may sit in the next box ("2027 Color of the Year" over a heading "Artifact");
      // before them it has to be in the same box and sentence
      const after = i >= b && i - b <= 40 && !/[.!?]\s/.test(lower.slice(b, i));
      const before = end <= a && a - end <= 40 && !/[.!?]\s|¶/.test(lower.slice(end, a));
      if (!after && !before) continue;
      const d = after ? i - b : a - end;
      if (!best || d < best.d) best = { f, d };
    }
    if (best) out.push({ code: best.f.code, name: best.f.name, year: y, strength: 1 });
  }
  return out;
}

const listName = page => ((page.head || page.title).split(/\s[|–-]\s/)[0] || '').trim().slice(0, 80);

async function findBrand(brand, starts, rows) {
  const names = nameIndex(rows);
  const pages = [], coty = [], lists = [];
  const queue = starts.map(u => ({ url: u, start: true }));
  const seen = new Set();
  while (queue.length && pages.length < MAX_PAGES) {
    const { url, start } = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const r = await get(url);
    await sleep(1200);
    if (r.ok) seen.add(r.url.split(/[?#]/)[0]);
    const rec = { url, status: r.status, found: 0 };
    if (r.note) rec.note = r.note;
    pages.push(rec);
    if (!r.ok) continue;
    if (start) for (const l of findLinks(r.body, r.url)) if (!seen.has(l) && !queue.some(q => q.url === l)) queue.push({ url: l, start: false });
    const page = readPage(r.body);
    const found = colorsOnPage(page, brand, names);
    const path_ = new URL(r.url).pathname;
    const c = cotyOnPage(page, found, r.url);
    const mentions = cotyMentions(page, found);
    for (const x of (c ? [c] : []).concat(mentions)) coty.push(Object.assign(x, { url: r.url, seen: TODAY }));
    const isList = POPULAR_PATH.test(path_) && !COTY_PATH.test(path_) && found.length > 0;
    if (isList) {
      // tabs of one list (Interior / Exterior) share a title: they go together
      const title = listName(page) || 'Most popular colors';
      let list = lists.find(l => l.title === title);
      if (!list) lists.push(list = { title, url: r.url, seen: TODAY, colors: [] });
      for (const f of found.slice(0, 80)) if (!list.colors.some(x => x[0] === f.code)) list.colors.push([f.code, f.name]);
    }
    rec.found = (c ? 1 : 0) + mentions.length + (isList ? found.length : 0);
  }
  // One Color of the Year per year. If pages disagree, the brand's own page for that year wins over a
  // banner or a passing mention.
  const byYear = new Map();
  for (const x of coty) if (!byYear.has(x.year) || x.strength > byYear.get(x.year).strength) byYear.set(x.year, x);
  return { coty: [...byYear.values()].sort((a, b) => b.year - a.year).map(({ strength, ...x }) => x), lists, pages };
}

function readOld() {
  try {
    const t = fs.readFileSync(OUT, 'utf8');
    return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch { return { brands: {} }; }
}

// Pages that couldn't be read this time keep what they gave before, for a while.
function keepOld(now, old, okUrls) {
  if (!old) return now;
  const fresh = d => (Date.parse(TODAY) - Date.parse(d)) / 864e5 <= KEEP_DAYS;
  for (const x of old.coty || []) if (!okUrls.has(x.url) && validYear(x.year) && !now.coty.some(y => y.year === x.year)) now.coty.push(x);
  for (const l of old.lists || []) if (!okUrls.has(l.url) && fresh(l.seen) && !now.lists.some(y => y.title === l.title)) now.lists.push(l);
  now.coty.sort((a, b) => b.year - a.year);
  return now;
}

async function main() {
  const { brands, colors } = loadBrands();
  const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/popular/sources.json'), 'utf8')).brands;
  const old = readOld();
  const out = { checked: TODAY, brands: {} };
  for (const b of brands) {
    if (!sources[b.id] || (ONLY && ONLY !== b.id)) { if (old.brands[b.id] && ONLY) out.brands[b.id] = old.brands[b.id]; continue; }
    process.stdout.write(`${b.name}… `);
    const got = await findBrand(b, sources[b.id], colors[b.id]);
    const okUrls = new Set(got.pages.filter(p => p.status >= 200 && p.status < 300 && !p.note).map(p => p.url));
    const res = keepOld(got, old.brands[b.id], okUrls);
    out.brands[b.id] = res;
    const cy = res.coty.map(x => `${x.year} ${x.name} ${x.code}`).join(', ') || 'none';
    const bad = got.pages.filter(p => p.note).map(p => `${p.url} (${p.note})`);
    const pop = res.lists.map(l => `${l.title} (${l.colors.length})`).join(', ') || 'none';
    console.log(`Color of the Year: ${cy}; popular: ${pop}` + (bad.length ? `\n   couldn't read: ${bad.join(', ')}` : ''));
  }
  // one color per line keeps the weekly changes easy to read on GitHub
  const json = JSON.stringify(out, null, 1)
    .replace(/\[\s+("(?:[^"\\]|\\.)*"),\s+("(?:[^"\\]|\\.)*")\s+\]/g, '[$1, $2]')
    .replace(/\{\s+("url"[^{}]*?)\s+\}/g, (m, inner) => '{' + inner.replace(/,\s+/g, ', ') + '}');
  if (DRY) { console.log(json.slice(0, 3000)); return; }
  const js = `/* The brands' own Colors of the Year and most popular colors, read from their websites by tools/popular/find.mjs.\n   Don't edit by hand: a GitHub job looks again every week and rewrites this file. */\nwindow.CG_POPULAR = ${json};\n`;
  fs.writeFileSync(OUT, js);
  console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
}

// the tests use the page-reading parts without going online
export { readPage, nameIndex, colorsOnPage, cotyOnPage, cotyMentions, findLinks, YEAR };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
