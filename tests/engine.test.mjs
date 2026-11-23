// Run with: npm test   (or: node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
globalThis.window = globalThis;
require(path.join(ROOT, 'data/brands.js'));
for (const b of window.CG_BRANDS) require(path.join(ROOT, 'data/colors', b.id + '.js'));
const C = require(path.join(ROOT, 'js/color.js'));
const E = require(path.join(ROOT, 'js/engine.js'));
E.init(window.CG_BRANDS, window.CG_COLORS);
const US = Object.fromEntries(window.CG_BRANDS.map(b => [b.id, b.group === 'us']));
const rec = (answers, settings) => E.recommend(answers, Object.assign({ brands: US, resultCount: 6 }, settings));

// ---------------- color math ----------------
test('Lab of white and black', () => {
  const w = C.hexToLab('FFFFFF'), k = C.hexToLab('000000');
  assert.ok(Math.abs(w[0] - 100) < 0.01 && Math.abs(w[1]) < 0.01 && Math.abs(w[2]) < 0.01);
  assert.ok(Math.abs(k[0]) < 0.01);
});
test('CIEDE2000 matches published reference pairs (Sharma 2005)', () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
    [[50, 2.5, 0], [56, -27, -3], 31.9030],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  ];
  for (const [a, b, want] of pairs) assert.ok(Math.abs(C.deltaE2000(a, b) - want) < 0.001, `${want} vs ${C.deltaE2000(a, b)}`);
});
test('calculated LRV agrees with Sherwin-Williams published LRV', () => {
  const sw = E.getIndex().byBrand.sw;
  const diffs = sw.map(c => Math.abs(C.lrvFromHex(c.hex) - c.lrv));
  const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  assert.ok(mean < 2.5, `mean LRV difference ${mean.toFixed(2)}`);
});
test('daylight leaves colors unchanged, warm bulbs warm them', () => {
  const g = C.illuminantGain(6504);
  g.forEach(v => assert.ok(Math.abs(v - 1) < 0.01));
  const lin = C.hexToLinear('BBBBBB');
  const warm = C.applyLight(lin, { cct: 2700, intensity: 1 });
  assert.ok(warm[0] > warm[2], 'red should exceed blue under 2700K');
});
test('calibration warmth shifts toward red, off by default', () => {
  const lin = C.hexToLinear('CCCCCC');
  assert.deepEqual(C.applyCalibration(lin, { enabled: false, warmth: 80 }), lin);
  const out = C.applyCalibration(lin, { enabled: true, warmth: 80, brightness: 0, vividness: 0 });
  assert.ok(out[0] > out[2]);
  assert.equal(C.displayCss('123456', {}), '#123456');
});
test('describe() names families sensibly', () => {
  assert.equal(C.describe('F2F2F0').family, 'white');
  assert.equal(C.describe('232323').family, 'black');
  assert.equal(C.describe('1F3A6B').family, 'blue');
  assert.equal(C.describe('2E6B3F').family, 'green');
  assert.equal(C.describe('B22222').family, 'red');
  assert.equal(C.describe('C9B79C').family, 'beige');
});

// ---------------- data ----------------
test('every brand file is well formed', () => {
  for (const b of window.CG_BRANDS) {
    const rows = window.CG_COLORS[b.id];
    assert.ok(rows.length > 100, `${b.id} has ${rows.length}`);
    const codes = new Set();
    for (const [code, name, hex, lrv] of rows) {
      assert.match(hex, /^[0-9A-F]{6}$/, `${b.id} ${code}`);
      assert.ok(name && String(code), `${b.id} row missing name/code`);
      assert.ok(lrv >= 0 && lrv <= 100, `${b.id} ${code} LRV ${lrv}`);
      assert.ok(!codes.has(String(code).toUpperCase()), `${b.id} duplicate ${code}`);
      codes.add(String(code).toUpperCase());
    }
  }
});
test('all US national brands are loaded with full palettes', () => {
  const min = { sw: 1700, bm: 3500, behr: 4000, valspar: 1500, ppg: 3000, glidden: 3000, hgsw: 850, dutchboy: 1200, de: 2000, dv: 1200 };
  for (const [id, n] of Object.entries(min)) assert.ok((E.getIndex().byBrand[id] || []).length >= n, `${id} has ${(E.getIndex().byBrand[id] || []).length}`);
});

// ---------------- search ----------------
test('search by code, name, brand word and color value', () => {
  assert.equal(E.search('SW 7029')[0].color.name, 'Agreeable Gray');
  assert.equal(E.search('7029')[0].color.code, '7029');
  assert.equal(E.search('oc-17')[0].color.name, 'White Dove');
  assert.equal(E.search('OC17')[0].color.name, 'White Dove');
  assert.equal(E.search('behr swiss coffee')[0].color.brand, 'behr');
  assert.equal(E.search('hale navy')[0].color.code, 'HC-154');
  const hex = E.search('#D1CBC1');
  assert.ok(hex[0].dE < 1.5);
  assert.deepEqual(E.search(''), []);
  assert.equal(E.search('zzzzqqq').length, 0);
});

// ---------------- recommendations ----------------
test('whites request returns only whites', () => {
  const r = rec({ space: 'living', families: ['white'], depth: 'light' });
  assert.equal(r.results.length, 6);
  for (const x of r.results) assert.equal(x.color.fam, 'white', x.color.name);
});
test('ceiling returns bright whites', () => {
  const r = rec({ space: 'ceiling' });
  for (const x of r.results) { assert.equal(x.color.fam, 'white', x.color.name); assert.ok(x.color.lrv >= 76, `${x.color.name} ${x.color.lrv}`); }
});
test('deep and moody returns deep colors', () => {
  const r = rec({ space: 'office', styles: ['moody'], depth: 'deep' });
  for (const x of r.results) assert.ok(x.color.lrv < 30, `${x.color.name} ${x.color.lrv}`);
});
test('vinyl siding never gets dark colors and explains why', () => {
  const r = rec({ space: 'ext_body', siding: 'vinyl', families: ['dark'], depth: 'deep' });
  for (const x of r.results) assert.ok(x.color.lrv >= 45, `${x.color.name} ${x.color.lrv}`);
  assert.ok(r.notices.some(n => /vinyl/i.test(n.title)));
  assert.deepEqual(r.answers.families, ['dark'], 'the original answers are kept for display');
});
test('store brand only', () => {
  const r = rec({ space: 'bedroom', styles: ['coastal'] }, { storeBrand: 'bm', storeOnly: true });
  for (const x of r.results) assert.equal(x.color.brand, 'bm');
});
test('turned-off brands never appear', () => {
  const brands = Object.assign({}, US, { sw: false, bm: false });
  const r = rec({ space: 'living', styles: ['farmhouse'] }, { brands, resultCount: 12 });
  for (const x of r.results) assert.ok(!['sw', 'bm'].includes(x.color.brand));
});
test('discontinued colors only with the setting on', () => {
  const pool = E.getIndex().colors.filter(c => c.flags & E.F.DISC);
  assert.ok(pool.length > 0);
  const a = { space: 'living' };
  assert.equal(E.allowedColor(pool[0], a, { brands: {}, showDiscontinued: false }), false);
  assert.equal(E.allowedColor(pool[0], a, { brands: {}, showDiscontinued: true }), true);
});
test('exterior jobs skip interior-only colors', () => {
  const r = rec({ space: 'ext_trim' }, { resultCount: 12 });
  for (const x of r.results) { const f = x.color.flags; if (f & (E.F.INT | E.F.EXT)) assert.ok(f & E.F.EXT, x.color.name); }
});
test('result count and spread', () => {
  for (const n of [3, 6, 9, 12]) assert.equal(rec({ space: 'kitchen', styles: ['modern'] }, { resultCount: n }).results.length, n);
  const r = rec({ space: 'living', families: ['green', 'blue'] });
  const fams = new Set(r.results.map(x => x.color.fam));
  assert.ok(fams.has('green') && fams.has('blue'), 'both picked families show up');
  for (let i = 0; i < r.results.length; i++) for (let j = i + 1; j < r.results.length; j++)
    assert.ok(C.deltaE2000(r.results[i].color.lab, r.results[j].color.lab) >= 2.5, 'results are visibly different');
});
test('no answers still gives sensible, mostly neutral picks', () => {
  const r = rec({});
  assert.equal(r.results.length, 6);
  assert.ok(r.results.filter(x => x.color.neutral).length >= 4);
});

// ---------------- warnings ----------------
const W = (search, answers) => E.warningsFor(E.search(search)[0].color, answers).map(w => w.level + ':' + w.title);
test('north light warns on cool grays', () => {
  assert.ok(W('SW 7015', { space: 'living', facing: 'north' }).length >= 0);
  const cool = E.getIndex().byBrand.sw.find(c => c.neutral && c.ut === 'blue' && c.C > 3 && c.lrv > 40);
  assert.ok(E.warningsFor(cool, { space: 'living', facing: 'north' }).some(w => w.level === 'caution' && /north/i.test(w.title)));
});
test('near-black in a small dim room is a caution', () => {
  const w = W('tricorn black', { space: 'bedroom', size: 'small', amount: 'low', facing: 'north' });
  assert.ok(w.some(x => x.startsWith('caution:') && /black/i.test(x)), w.join(' | '));
});
test('dark color on vinyl siding is a caution', () => {
  const w = W('sw naval', { space: 'ext_body', siding: 'vinyl' });
  assert.ok(w.some(x => x.startsWith('caution:') && /vinyl/i.test(x)));
});
test('bright saturated color in a bedroom warns about sleep', () => {
  const red = E.getIndex().byBrand.sw.find(c => c.fam === 'red' && c.C > 50);
  assert.ok(E.warningsFor(red, { space: 'bedroom' }).some(w => /sleep/i.test(w.title)));
});
test('low ceiling color warns', () => {
  const mid = E.search('SW 7016')[0].color;
  assert.ok(E.warningsFor(mid, { space: 'ceiling' }).some(w => /ceiling/i.test(w.title)));
});
test('warm wood plus a cool gray is flagged', () => {
  const cool = E.getIndex().byBrand.bm.find(c => c.neutral && c.ut === 'blue' && c.C > 3 && c.lrv > 40);
  assert.ok(E.warningsFor(cool, { space: 'living', fixed: ['warm-wood'] }).some(w => /wood/i.test(w.title)));
});

// ---------------- matches, pairings, import ----------------
test('cross-brand matches are close and from other brands', () => {
  const wd = E.search('white dove')[0].color;
  const m = E.matchesFor(wd);
  assert.ok(m.length >= 8);
  assert.ok(m[0].dE < 1.5);
  assert.ok(m.every(x => x.color.brand !== 'bm'));
  for (let i = 1; i < m.length; i++) assert.ok(m[i].dE >= m[i - 1].dE);
});
test('pairings include a white for trim', () => {
  const p = E.pairings(E.search('sw naval')[0].color);
  const trim = p.find(x => x.role === 'Trim & ceiling');
  assert.ok(trim && trim.color.fam === 'white');
});
test('CSV import reads headers, hex and rgb', () => {
  const r = E.parseCustomCsv('brand,name,code,hex,lrv\nAce,Zephyr Oat Test,23A-2,#E8DFCF,74\nAce,Night Sky,9B-7,rgb(30 40 60),\n,bad,,nothex,');
  assert.equal(r.brands.Ace.length, 2);
  assert.equal(r.brands.Ace[0][2], 'E8DFCF');
  assert.equal(r.brands.Ace[1][2], '1E283C');
  assert.equal(r.errors.length, 1);
  const n = E.addBrand({ id: 'custom-ace', name: 'Ace', prefix: '', group: 'custom' }, r.brands.Ace);
  assert.equal(n, 2);
  assert.equal(E.search('zephyr oat test')[0].color.brand, 'custom-ace');
  assert.equal(E.getIndex().byBrand['custom-ace'][0].lrv, 74);
});
test('sheens: six finishes, capitalized names, every space recommends valid ones', () => {
  assert.deepEqual(E.SHEENS.map(s => s.name), ['Flat', 'Matte', 'Eggshell', 'Satin', 'Semi-Gloss', 'Gloss']);
  for (const s of E.SHEENS) { assert.ok(s.pros.length >= 2 && s.cons.length >= 2 && s.best); }
  const ids = new Set(E.SHEENS.map(s => s.id));
  for (const [k, sp] of Object.entries(E.SPACES)) {
    assert.ok(sp.sheens.length && sp.sheens.every(i => ids.has(i)), k);
    assert.match(sp.sheen, /^(Flat|Matte|Eggshell|Satin|Semi-Gloss|Gloss)( or (Flat|Matte|Eggshell|Satin|Semi-Gloss|Gloss))?( \(.+\))?$/, sp.sheen);
  }
  assert.equal(E.SPACES.living.sheen, 'Matte or Eggshell');
});
test('advantages and disadvantages', () => {
  const naval = E.search('sw naval')[0].color, white = E.search('sw 7005')[0].color;
  const dark = E.prosCons(naval, { space: 'bedroom', size: 'small', amount: 'low', facing: 'north' });
  assert.ok(dark.pros.length >= 1 && dark.cons.length >= 1);
  assert.ok(dark.cons.some(x => /black|dark|smaller/i.test(x)), dark.cons.join(' | '));
  const kids = E.prosCons(white, { space: 'kids' });
  assert.ok(kids.cons.some(x => /dirt|scuff/i.test(x)));
  const both = E.prosCons(naval, { space: 'living' }, {}, [naval, white]);
  assert.ok(both.compared.includes('Deepest of these options'));
  assert.ok(E.prosCons(white, { space: 'living' }, {}, [naval, white]).compared.includes('Lightest of these options'));
});
test('offline file list matches the brand files', () => {
  const files = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/files.json'), 'utf8'));
  assert.deepEqual(files.sort(), window.CG_BRANDS.map(b => `data/colors/${b.id}.js`).sort());
  for (const f of files) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});
