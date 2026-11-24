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
  const min = { sw: 1700, bm: 3500, behr: 4000, valspar: 1500, ppg: 3000, glidden: 3000, hgsw: 850, dutchboy: 1200, de: 2000, dv: 1200, ck: 1300, magnolia: 150, hl: 1400, colorhouse: 120, ral: 200 };
  for (const [id, n] of Object.entries(min)) assert.ok((E.getIndex().byBrand[id] || []).length >= n, `${id} has ${(E.getIndex().byBrand[id] || []).length}`);
});

// ---------------- search ----------------
test('Clark+Kensington and Magnolia Home are built in and searchable', () => {
  assert.equal(E.search('13C-1')[0].color.name, 'Colonial Linen');
  assert.equal(E.search('clark+kensington colonial linen')[0].color.brand, 'ck');
  assert.equal(E.search('magnolia shiplap')[0].color.brand, 'magnolia');
  assert.equal(E.search('MAG001')[0].color.name, 'Ella Rose');
  const brands = window.CG_BRANDS.filter(b => b.id === 'ck' || b.id === 'magnolia');
  assert.ok(brands.length === 2 && brands.every(b => b.group === 'us'), 'both are on by default with the US brands');
  assert.ok(E.recommendLines('magnolia', E.search('magnolia shiplap')[0].color, { space: 'living' }, {}).best);
  const m = E.matchesFor(E.search('white dove')[0].color);
  assert.ok(m.some(x => x.color.brand === 'ck') && m.some(x => x.color.brand === 'magnolia'), 'they appear as matches');
});
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
test('paint lines: the right line for the job, and switched-off lines are skipped', () => {
  const white = E.search('white dove')[0].color, navy = E.search('hale navy')[0].color;
  const pick = (brand, space, color, lines) => E.recommendLines(brand, color, { space }, { lines }).best.line.name;
  assert.equal(pick('bm', 'bathroom', white), 'Aura Bath & Spa');
  assert.equal(pick('bm', 'cabinets', navy), 'Advance');
  assert.equal(pick('bm', 'ceiling', white), 'Waterborne Ceiling Paint');
  assert.equal(pick('bm', 'kids', white), 'Scuff-X');
  assert.equal(pick('sw', 'trim', white), 'Emerald Urethane Trim Enamel');
  assert.equal(pick('sw', 'entry', white), 'Duration Home');
  assert.notEqual(pick('bm', 'bathroom', white, { 'bm-aura-bath': false }), 'Aura Bath & Spa');
  const ext = E.recommendLines('sw', white, { space: 'ext_body' }, {});
  assert.ok(ext.all.every(x => x.line.use === 'exterior'));
  const walls = E.recommendLines('bm', white, { space: 'living' }, {});
  assert.ok(walls.byTier.every(x => !x.line.tags.includes('ceiling') && !x.line.tags.includes('enamel') && !x.line.tags.includes('bath')));
  const cab = E.recommendLines('bm', navy, { space: 'cabinets' }, {});
  assert.ok(cab.byTier.every(x => x.line.tags.includes('enamel')));
  for (const [brand, lines] of Object.entries(E.PAINT_LINES)) {
    assert.ok(window.CG_BRANDS.some(b => b.id === brand), brand);
    for (const l of lines) assert.ok([1, 2, 3].includes(l.tier) && ['interior', 'exterior', 'both'].includes(l.use) && l.note, l.id);
  }
  assert.equal(E.recommendLines('dv', white, { space: 'living' }, {}).best, null);
  // floors get a porch & floor paint, and floor paints never show up for walls
  assert.equal(pick('sw', 'porch_floor', navy), 'Porch & Floor Enamel');
  assert.equal(pick('bm', 'floor_paint', white), 'Floor & Patio Latex Enamel');
  assert.ok(E.recommendLines('bm', white, { space: 'living' }, {}).all.every(x => !x.line.tags.includes('floor')));
  assert.equal(E.recommendLines('ppg', white, { space: 'porch_floor' }, {}).best, null, 'no floor paint listed: no wall paint offered instead');
});
test('what is staying: floors, counters, furniture, roof and custom items change the advice', () => {
  const sw = E.getIndex().byBrand.sw.filter(c => !(c.flags & E.F.DISC));
  const coolGray = sw.find(c => c.neutral && c.fam === 'gray' && c.ut === 'blue' && c.C > 3);
  const yellowBeige = sw.find(c => c.fam === 'beige' && c.ut === 'yellow' && c.C > 11);
  const creamy = sw.find(c => c.fam === 'white' && c.ut === 'yellow' && c.C > 5);
  const blue = sw.find(c => c.fam === 'blue' && c.C > 20);
  const titles = (c, a) => E.warningsFor(c, a).map(w => w.level + ':' + w.title);
  assert.ok(titles(coolGray, { fixed: ['warm-wood'] }).some(t => t.startsWith('caution:') && /wood/i.test(t)));
  assert.ok(titles(yellowBeige, { fixed: ['warm-wood'] }).some(t => /too much yellow/i.test(t)));
  assert.ok(titles(creamy, { space: 'kitchen', fixed: ['counter-white'] }).some(t => /creamy/i.test(t)));
  assert.ok(titles(yellowBeige, { fixed: ['cool-tile'] }).some(t => /yellow next to/i.test(t)));
  assert.ok(E.fixedEffects(blue, { fixed: ['warm-wood'] }).reasons.some(r => /complements/i.test(r)));
  assert.ok(E.fixedEffects(coolGray, { fixed: ['warm-wood'] }).score < 0);
  const custom = E.fixedItems({ customFixed: [{ label: 'Rust rug', hex: '#A0522D', kind: 'furniture' }, { label: 'bad', hex: 'zz' }] });
  assert.equal(custom.length, 1);
  assert.equal(custom[0].kind, 'furniture');
  assert.ok(titles(coolGray, { space: 'ext_body', fixed: ['roof-brown'] }).some(t => /roof/i.test(t)));
  const plain = rec({ space: 'living', families: ['warm-neutral'] });
  const withOak = rec({ space: 'living', families: ['warm-neutral'], fixed: ['warm-wood'] });
  assert.notDeepEqual(plain.results.map(r => r.color.id), withOak.results.map(r => r.color.id), 'materials change the picks');
  assert.ok(E.FIXED_ITEMS.length >= 40 && E.FIXED_ITEMS.every(f => /^[0-9A-F]{6}$/.test(f.hex) && f.label && f.kind));
});
test('question 5 adapts to the job, and every listed item exists', () => {
  const titles = s => E.groupsFor(s).map(g => g.title);
  assert.ok(titles('bedroom').includes('Bedding & Furniture') && titles('bedroom').includes('Floor'));
  assert.ok(E.groupsFor('bedroom').find(g => g.key === 'floor').ids.some(id => id.includes('carpet')), 'bedrooms offer carpet');
  assert.ok(!E.groupsFor('kitchen').find(g => g.key === 'floorHard').ids.some(id => id.includes('carpet')), 'kitchens do not');
  assert.ok(titles('kitchen').includes('Countertops') && !titles('kitchen').includes('Bedding & Furniture'));
  assert.ok(titles('bathroom').includes('Vanity'));
  assert.ok(titles('front_door').includes('Siding Staying'));
  assert.ok(!titles('trim').includes('Trim, Baseboards & Crown'), 'the trim job does not ask about existing trim');
  assert.ok(E.groupsFor('living').find(g => g.key === 'trim').flags.crown);
  for (const space of Object.keys(E.SPACES)) for (const g of E.groupsFor(space)) for (const id of g.ids || []) assert.ok(E.FIXED_ITEMS.some(f => f.id === id), `${space}: ${id}`);
  assert.ok(E.allowedFixed('kitchen').has('counter-white') && !E.allowedFixed('kitchen').has('roof-black'));
});
test('ceiling and trim: kind of white, matching walls, crown and trim tips', () => {
  const crisp = rec({ space: 'ceiling', whiteType: 'crisp' });
  for (const x of crisp.results) assert.ok(x.color.fam === 'white' && x.color.temp !== 'warm', x.color.name);
  const warm = rec({ space: 'trim', whiteType: 'warm' });
  assert.ok(warm.results.filter(x => x.color.temp === 'warm').length >= 4);
  const dark = rec({ space: 'trim', whiteType: 'dark' });
  for (const x of dark.results) assert.ok(x.color.lrv < 15 && x.color.C < 14, x.color.name);
  const match = rec({ space: 'trim', whiteType: 'match', fixed: ['walls-gray'] });
  const wall = E.FIXED_ITEMS.find(f => f.id === 'walls-gray');
  assert.ok(C.deltaE2000(match.results[0].color.lab, wall.lab) < 8, 'matches the walls');
  assert.ok(rec({ space: 'trim', whiteType: 'match' }).notices.some(n => /wall color/i.test(n.title)));
  assert.ok(rec({ space: 'living', crown: true }).tips.some(t => /crown/i.test(t.title)));
  assert.ok(rec({ space: 'living', trimPaint: true }).tips.some(t => /trim/i.test(t.title)));
  assert.ok(rec({ space: 'trim' }).tips.some(t => /baseboards/i.test(t.title)));
  const creamy = E.getIndex().byBrand.sw.find(c => c.fam === 'white' && c.ut === 'yellow' && c.C > 5);
  assert.ok(E.warningsFor(creamy, { space: 'living', fixed: ['trim-white'] }).some(w => /creamy/i.test(w.title)));
  const stark = E.getIndex().byBrand.sw.find(c => c.fam === 'white' && c.C < 3 && c.L > 93);
  assert.ok(E.warningsFor(stark, { space: 'living', fixed: ['trim-cream'] }).some(w => /stark/i.test(w.title)));
  const gray = E.getIndex().byBrand.sw.find(c => c.neutral && c.fam === 'gray' && c.ut === 'blue' && c.C > 3);
  assert.ok(E.warningsFor(gray, { space: 'bedroom', fixed: ['floor-carpet-beige'] }).some(w => /carpet/i.test(w.title)), 'carpet sets the undertone');
  const door = rec({ space: 'front_door', fixed: ['siding-dark'] });
  const siding = E.FIXED_ITEMS.find(f => f.id === 'siding-dark');
  assert.ok(door.results.every(x => Math.abs(x.color.L - siding.L) >= 12 || x.color.C > 20), 'doors stand out from the siding');
});
// ---------------- windows on several sides ----------------
test('windows on several sides: facings list, phrases and light', () => {
  const a = Object.assign({}, E.DEFAULT_ANSWERS, { facing: 'north', facings: ['north', 'south'] });
  assert.deepEqual(E.facingsOf(a), ['north', 'south']);
  assert.deepEqual(E.facingsOf({ facing: 'east' }), ['east'], 'the older single answer still works');
  assert.equal(E.facingPhrase(a), 'north- and south-facing');
  assert.equal(E.facingPhrase({ facings: ['north', 'east', 'south'] }), 'three-sided');
  assert.equal(E.lightForAnswers(a), 'sun', 'a south window means sun even with a north one');
  assert.equal(E.lightForAnswers({ facings: ['north'], facing: 'north', amount: 'medium', bulbs: 'unsure' }), 'north');
  assert.ok(E.noWindows({ facing: 'none', facings: [] }));
});
test('north caution softens when another side brings sun; opposite and three sides get tips', () => {
  const cool = E.getIndex().byBrand.bm.find(c => c.neutral && ['blue', 'blue-green', 'green-blue', 'violet'].includes(c.ut) && c.C > 3 && c.lrv > 50);
  assert.ok(cool, 'a cool neutral exists');
  const titles = facings => E.warningsFor(cool, Object.assign({}, E.DEFAULT_ANSWERS, { space: 'living', facing: facings[0], facings })).map(w => w.title);
  assert.ok(titles(['north']).includes('May look icy or dingy in north light'));
  const two = titles(['north', 'south']);
  assert.ok(!two.includes('May look icy or dingy in north light'));
  assert.ok(two.includes('Cooler on the north wall'));
  assert.ok(two.includes('Light differs wall to wall'));
  assert.ok(titles(['east', 'south', 'west']).includes('Bright from several sides'));
  assert.ok(titles(['east', 'west']).includes('Light differs wall to wall'));
});
test('new rooms: stairway, laundry, sunroom and garage', () => {
  for (const space of ['stairs', 'laundry', 'sunroom', 'garage']) {
    assert.ok(E.SPACES[space], space);
    const r = rec(Object.assign({}, E.DEFAULT_ANSWERS, { space }));
    assert.equal(r.results.length, 6, space);
    assert.ok(E.groupsFor(space).length, `${space} asks what is staying`);
  }
  const deep = E.getIndex().byBrand.sw.find(c => c.lrv < 15);
  assert.ok(E.warningsFor(deep, Object.assign({}, E.DEFAULT_ANSWERS, { space: 'stairs' })).some(w => w.title === 'Tall stairwell walls'));
  assert.ok(E.warningsFor(deep, Object.assign({}, E.DEFAULT_ANSWERS, { space: 'garage' })).some(w => w.title === 'Garage lighting'));
  const bright = E.getIndex().byBrand.sw.find(c => c.lrv >= 90);
  assert.ok(E.warningsFor(bright, Object.assign({}, E.DEFAULT_ANSWERS, { space: 'sunroom' })).some(w => w.title === 'Glare in a sunroom'));
});

// ---------------- collections inside a brand ----------------
test('Benjamin Moore collections are recognized by code', () => {
  const ids = Object.fromEntries(E.collectionsFor('bm').map(x => [x.id, x.count]));
  for (const [id, min] of Object.entries({ classic: 1600, preview: 1200, hc: 180, oc: 140, af: 140, csp: 230, cc: 220, cw: 140 })) assert.ok(ids[id] >= min, `${id}: ${ids[id]}`);
  const by = code => E.findColor('bm:' + code);
  assert.equal(by('HC-172').coll, 'hc');
  assert.equal(by('OC-17').coll, 'oc');
  assert.equal(by('2000-10').coll, 'preview');
  assert.equal(E.collectionLabel(by('HC-172')), 'Historical Colors');
  assert.ok(E.getIndex().byBrand.bm.every(c => c.coll), 'every Benjamin Moore color has a collection');
  for (const id of ['magnolia', 'ck', 'ppg', 'glidden', 'dv']) assert.ok(E.collectionsFor(id).length >= 2, id);
  assert.equal(E.collectionsFor('sw').length, 0, 'brands without collections list none');
});
test('switched-off collections are left out of picks, matches and pairings', () => {
  const only = Object.fromEntries(E.getIndex().brands.map(b => [b.id, b.id === 'bm']));
  const offAll = Object.fromEntries(E.collectionsFor('bm').filter(x => x.id !== 'hc').map(x => ['bm:' + x.id, false]));
  const r = E.recommend(Object.assign({}, E.DEFAULT_ANSWERS, { space: 'living' }), { brands: only, resultCount: 6, collections: offAll });
  assert.ok(r.results.length > 0);
  assert.ok(r.results.every(x => x.color.coll === 'hc'), 'only Historical Colors left');
  const sw = E.findColor('sw:SW 7029') || E.getIndex().byBrand.sw[0];
  const m = E.matchesFor(sw, { brands: only, collections: offAll }).find(x => x.color.brand === 'bm');
  assert.equal(m.color.coll, 'hc');
  const p = E.pairings(E.findColor('bm:HC-172'), { collections: offAll });
  assert.ok(p.every(x => x.color.coll === 'hc'));
  assert.ok(!E.allowedColor(E.findColor('bm:OC-17'), E.DEFAULT_ANSWERS, { collections: offAll }));
});
test('more brands: Hallman Lindsay, Colorhouse and RAL Classic', () => {
  const idx = E.getIndex();
  for (const [id, min] of Object.entries({ hl: 1400, colorhouse: 120, ral: 200 })) assert.ok((idx.byBrand[id] || []).length >= min, id);
  assert.equal(idx.brandById.ral.group, 'standard');
  assert.equal(E.search('RAL 9010', { limit: 1 })[0].color.id, 'ral:9010');
  assert.equal(E.search('hallman hint of vanilla', { limit: 1 })[0].color.brand, 'hl');
});

// ---------------- staining ----------------
require(path.join(ROOT, 'data/stains.js'));
const WD = require(path.join(ROOT, 'js/wood.js'));
const ST = require(path.join(ROOT, 'js/stain.js'));
ST.init(window.CG_STAINS);
const stainOf = name => { const s = ST.all().find(x => x.name === name); assert.ok(s, name); return { hex: s.hex, type: s.type }; };
test('stain data: Minwax, Cabot, Olympic and SuperDeck', () => {
  assert.ok(ST.all().length >= 700, `${ST.all().length} stains`);
  const count = id => ST.all().filter(x => x.brand === id).length;
  for (const [id, min] of Object.entries({ minwax: 250, cabot: 180, olympic: 90, swstain: 90, varathane: 70 })) assert.ok(count(id) >= min, `${id}: ${count(id)}`);
  assert.equal(ST.brands().find(b => b.id === 'varathane').use, 'interior');
  assert.match(ST.codeLabel(ST.all().find(x => x.brand === 'varathane')), /Stain/, 'Varathane shows its product line in place of a code');
  const vOnly = ST.recommend({ target: 'floors', wood: 'red_oak', looks: ['warm'] }, { resultCount: 4, stainBrands: { minwax: false } });
  assert.ok(vOnly.results.every(x => x.brand === 'varathane') && vOnly.products.every(p => !/Minwax/.test(p.name)), 'with Minwax off, Varathane picks get Varathane products');
  assert.equal(ST.brands().find(b => b.id === 'minwax').use, 'interior');
  for (const id of ['cabot', 'olympic', 'swstain']) assert.equal(ST.brands().find(b => b.id === id).use, 'exterior', id);
  assert.equal(ST.codeLabel(ST.all().find(x => x.brand === 'cabot' && x.type === 'semisolid')), 'Semi-Solid', 'Cabot shows its opacity in place of a code');
  for (const n of ['Natural', 'Golden Oak', 'Early American', 'Provincial', 'Special Walnut', 'Dark Walnut', 'Jacobean', 'Ebony', 'Classic Gray', 'Weathered Oak']) assert.ok(ST.all().some(s => s.name === n), n);
  for (const s of ST.all()) { assert.match(s.hex, /^[0-9A-F]{6}$/, s.id); assert.ok(['trans', 'semi', 'semisolid', 'solid', 'white'].includes(s.type), s.id); assert.ok(WD.SPECIES[s.ref], s.id + ' reference wood'); }
});
test('every wood species is complete', () => {
  for (const [id, sp] of Object.entries(WD.SPECIES)) {
    assert.match(sp.light, /^[0-9A-F]{6}$/, id); assert.match(sp.dark, /^[0-9A-F]{6}$/, id);
    assert.ok(sp.absorb > 0 && sp.ring > 0 && sp.uses.length, id);
    assert.ok(C.hexToLab(sp.light)[0] > C.hexToLab(sp.dark)[0], `${id}: earlywood lighter than latewood`);
  }
  for (const j of Object.values(ST.JOBS)) assert.ok(WD.SPECIES[j.wood], j.label);
});
test('stain on wood: matches the swatch on red oak, lighter on maple, little change on walnut', () => {
  for (const n of ['Early American', 'Special Walnut', 'Dark Walnut', 'Provincial']) {
    const s = stainOf(n);
    const onOak = WD.predictHex('red_oak', s);
    assert.ok(C.deltaE2000(C.hexToLab(onOak), C.hexToLab(s.hex)) < 2.5, `${n} on red oak ${onOak} vs ${s.hex}`);
    assert.ok(C.hexToLab(WD.predictHex('maple', s))[0] > C.hexToLab(onOak)[0] + 4, `${n} lighter on maple`);
    const walnut = WD.bareHex('walnut');
    assert.ok(C.deltaE2000(C.hexToLab(WD.predictHex('walnut', s)), C.hexToLab(walnut)) < C.deltaE2000(C.hexToLab(onOak), C.hexToLab(WD.bareHex('red_oak'))), `${n} changes walnut less than oak`);
  }
  // every stain darkens bare red oak except the whitewashes, which lighten it
  const bare = C.hexToLab(WD.bareHex('red_oak'))[0];
  const dark = stainOf('Jacobean'), white = ST.all().find(s => s.type === 'white');
  assert.ok(C.hexToLab(WD.predictHex('red_oak', dark))[0] < bare - 25);
  assert.ok(C.hexToLab(WD.predictHex('red_oak', { hex: white.hex, type: 'white' }))[0] > bare - 8);
});
test('stain picks follow the look, the wood and the job', () => {
  const r = ST.recommend({ target: 'floors', wood: 'red_oak', looks: ['dark'] }, { resultCount: 6 });
  assert.equal(r.results.length, 6);
  assert.ok(r.results.every(x => C.hexToLab(x.predicted)[0] < 40), 'dark look gives dark floors');
  assert.ok(r.products.some(p => /polyurethane/i.test(p.name)), 'floors get a topcoat');
  const g = ST.recommend({ target: 'floors', wood: 'white_oak', looks: ['gray'] }, { resultCount: 6 });
  assert.ok(g.results.every(x => C.labToLch(C.hexToLab(x.predicted))[1] < 14), 'gray look is low chroma');
  const pine = ST.recommend({ target: 'furniture', wood: 'pine', looks: ['warm'] }, { resultCount: 4 });
  assert.ok(pine.results[0].warnings.some(w => /blotchy/i.test(w.title)), 'pine warns about blotching');
  assert.ok(pine.products.some(p => /conditioner/i.test(p.name)), 'pine gets a wood conditioner');
  const fin = ST.recommend({ target: 'cabinets', wood: 'maple', condition: 'finished', looks: ['rich'] }, { resultCount: 4 });
  assert.ok(fin.products.some(p => /gel stain/i.test(p.name)), 'finished wood gets a gel stain');
  const deck = ST.recommend({ target: 'deck', looks: ['natural'] }, { resultCount: 4, brands: US });
  assert.equal(deck.wood, 'pt_pine');
  assert.ok(!deck.guide, 'outdoor picks come from outdoor stain brands');
  assert.ok(deck.results.every(x => ['cabot', 'olympic', 'swstain'].includes(x.brand)), 'deck picks are outdoor stains');
  assert.ok(deck.products.some(p => /Cabot|Olympic|SuperDeck/.test(p.name)), 'products name the stain brand lines');
  assert.ok(deck.results[0].warnings.some(w => /pressure-treated/i.test(w.title)));
  const noOutdoor = ST.recommend({ target: 'deck', looks: ['natural'] }, { resultCount: 4, brands: US, stainBrands: { cabot: false, olympic: false, swstain: false } });
  assert.ok(noOutdoor.guide && noOutdoor.results.every(x => ['minwax', 'varathane'].includes(x.brand)), 'with no outdoor brand on, interior stain tones are tone guides');
  const onlyCabot = ST.recommend({ target: 'siding', looks: ['red', 'rich'] }, { resultCount: 6, brands: US, stainBrands: { olympic: false, swstain: false } });
  assert.ok(onlyCabot.results.length && onlyCabot.results.every(x => x.brand === 'cabot'), 'switched-off stain brands are left out');
  const solidDeck = ST.recommend({ target: 'deck', grain: 'hide', looks: ['gray'] }, { resultCount: 4, brands: US });
  assert.ok(solidDeck.results.every(x => x.type === 'solid' && x.kind === 'stain'), 'solid outdoor stains come from the stain brands when they have solid colors');
  const fence = ST.recommend({ target: 'fence', grain: 'hide', looks: ['gray'] }, { resultCount: 4, brands: US, stainBrands: { olympic: false, swstain: false } });
  assert.ok(fence.results.length && fence.results.every(x => x.kind === 'paint' && x.solid), 'with no solid stain colors on, solid stain is tinted to paint colors');
  assert.ok(fence.products.some(p => /solid/i.test(p.name)));
});

// ---------------- advanced questions, primer, furniture ----------------
test('advanced answers steer the picks: undertone, mood and colors to avoid', () => {
  const base = { space: 'living', styles: [], families: [] };
  const warm = rec(Object.assign({}, base, { undertone: 'warm' }));
  const cool = rec(Object.assign({}, base, { undertone: 'cool' }));
  const share = (r, t) => r.results.filter(x => x.color.temp === t).length / r.results.length;
  assert.ok(share(warm, 'warm') > share(cool, 'warm'), 'warm undertone gives warmer picks');
  const airy = rec(Object.assign({}, base, { feel: 'airy' })), dramatic = rec(Object.assign({}, base, { feel: 'dramatic' }));
  const avgL = r => r.results.reduce((t, x) => t + x.color.lrv, 0) / r.results.length;
  assert.ok(avgL(airy) > avgL(dramatic) + 25, 'bright & airy is much lighter than bold & dramatic');
  const noBlue = rec(Object.assign({}, base, { families: ['blue', 'green'], avoid: ['blue'] }));
  assert.ok(noBlue.results.every(x => x.color.fam !== 'blue'), 'avoided colors are left out');
});
test('primer advice follows the surface, the problems and the color change', () => {
  const white = E.getIndex().byBrand.sw.find(c => c.lrv > 85), deep = E.getIndex().byBrand.sw.find(c => c.lrv < 10);
  assert.equal(E.primerFor({ space: 'living', surface: 'painted', nowKind: 'white' }, white).need, '', 'good walls, same color: no primer');
  assert.equal(E.primerFor({ space: 'living', issues: ['stains'] }, white).need, 'stain');
  assert.equal(E.primerFor({ space: 'cabinets', surface: 'laminate' }, white).need, 'bond');
  assert.equal(E.primerFor({ space: 'living', surface: 'drywall_new' }, white).need, 'drywall');
  assert.equal(E.primerFor({ space: 'ext_body', surface: 'bare_wood' }, white).need, 'tannin');
  assert.equal(E.primerFor({ space: 'front_door', surface: 'metal' }, white).need, 'metal');
  assert.equal(E.primerFor({ space: 'living', surface: 'painted', nowKind: 'dark' }, white).need, 'hide', 'dark to light: a hiding primer');
  assert.ok(E.primerFor({ space: 'living', surface: 'painted', nowKind: 'white' }, deep).tips.some(t => /gray/i.test(t)), 'deep colors: gray-tinted primer');
  const store = E.primerFor({ space: 'cabinets', surface: 'laminate' }, white, { brands: US, storeBrand: 'sw' });
  assert.match(store.products[0].name, /Sherwin-Williams/, 'the store brand’s primer comes first');
  assert.ok(E.warningsFor(white, { space: 'living', nowKind: 'dark' }).some(w => w.title === 'Going much lighter'));
});
test('painting furniture, and shadow tips', () => {
  assert.ok(E.SPACES.furniture && E.SPACES.furniture.surface === 'furniture');
  assert.equal(rec({ space: 'furniture' }).results.length, 6);
  assert.ok(E.surfacesFor('furniture').includes('laminate'));
  const c = E.getIndex().byBrand.sw.find(x => x.lrv > 50 && x.lrv < 70);
  assert.ok(E.warningsFor(c, { space: 'living', facing: 'north', facings: ['north'] }).some(w => /Shadows/.test(w.title)), 'light from one side: shadow tip');
});
test('advanced stain answers: matching other wood and pets', () => {
  const dark = ST.recommend({ target: 'floors', wood: 'red_oak', looks: ['natural', 'golden'], matchWood: 'dark' }, { resultCount: 4 });
  const light = ST.recommend({ target: 'floors', wood: 'red_oak', looks: ['natural', 'golden'], matchWood: 'light' }, { resultCount: 4 });
  const avgL = r => r.results.reduce((t, x) => t + C.hexToLab(x.predicted)[0], 0) / r.results.length;
  assert.ok(avgL(dark) < avgL(light), 'matching dark wood gives darker picks than matching light wood');
  assert.ok(ST.recommend({ target: 'floors', wood: 'red_oak', looks: [], pets: true, sheen: 'satin' }).tips.some(t => t.title === 'Sheen'));
});

test('offline file list matches the brand files', () => {
  const files = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/files.json'), 'utf8'));
  assert.deepEqual(files.sort(), window.CG_BRANDS.map(b => `data/colors/${b.id}.js`).sort());
  for (const f of files) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});

test('exact color values: hex, short hex and RGB, with the closest color in each brand', () => {
  assert.equal(E.parseColorValue('#d1cbc1'), 'D1CBC1');
  assert.equal(E.parseColorValue('D1CBC1'), 'D1CBC1');
  assert.equal(E.parseColorValue('#dcb'), 'DDCCBB');
  assert.equal(E.parseColorValue('rgb(209, 203, 193)'), 'D1CBC1');
  assert.equal(E.parseColorValue('209,203,193'), 'D1CBC1');
  assert.equal(E.parseColorValue('209 203 193'), 'D1CBC1');
  assert.equal(E.parseColorValue('300 1 1'), null);
  assert.equal(E.parseColorValue('Agreeable Gray'), null);
  const ag = E.search('Agreeable Gray')[0].color;
  const near = E.closestByBrand(ag.hex, {});
  assert.equal(near[0].color.id, ag.id, 'its own brand matches exactly');
  assert.equal(near[0].dE, 0);
  assert.ok(new Set(near.map(x => x.color.brand)).size === near.length, 'one per brand');
  assert.ok(near.every((x, i) => i === 0 || x.dE >= near[i - 1].dE), 'closest first');
  assert.equal(E.search('rgb(209, 203, 193)')[0].dE != null, true, 'search takes RGB too');
});

test('more things to paint and stain, each with a finish, a preview and primer surfaces', () => {
  for (const k of ['powder', 'closet', 'attic', 'media', 'doors', 'builtins', 'wainscot', 'fireplace', 'floor_paint', 'shutters', 'garage_door', 'porch_floor', 'shed']) {
    const sp = E.SPACES[k];
    assert.ok(sp && sp.label && sp.sheens.length, k);
    assert.ok(E.groupsFor(k).length, k + ' has its own "what is staying" list');
    assert.ok(E.surfacesFor(k).length >= 2, k + ' primer surfaces');
    assert.ok(E.recommend({ space: k }).results.length, k + ' gets picks');
  }
  assert.ok(E.surfacesFor('fireplace').includes('masonry'));
  for (const k of ['doors', 'paneling', 'builtins', 'garage_door', 'shutters', 'shed', 'log', 'playset', 'dock']) {
    const j = ST.JOBS[k];
    assert.ok(j && j.label && j.wood && j.scene, k);
    assert.ok(ST.recommend({ target: k, looks: [] }).results.length, k + ' gets stain picks');
  }
});

// ---------------- popular colors ----------------
// What's popular comes from the paint companies' own websites (tools/popular/find.mjs, run weekly), never a list
// typed into the app. These tests use made-up data so they don't change when the brands' picks do.
const Y = new Date().getFullYear();
test('popular colors are the brands’ own picks, with the reason', () => {
  // no color in the data carries the old hand-made "popular" mark
  assert.equal(E.getIndex().colors.filter(c => c.flags & E.F.POPULAR).length, 0);
  E.setPopular(null);
  assert.equal(E.isPopular(E.findColor('sw:7008')), false);
  E.setPopular({ checked: `${Y}-11-24`, brands: {
    sw: { coty: [{ code: '7008', name: 'Alabaster', year: Y + 1 }, { code: '6258', name: 'Tricorn Black', year: Y - 1 }],
      lists: [{ title: 'Top 50 Colors', colors: [['7005', 'Pure White'], ['7029', 'Agreeable Gray'], ['9999', 'Not a Real Color']] }] },
    bm: { lists: [{ title: 'Most Popular', colors: [['OC-17', 'White Dove'], ['HC-154', 'Hale Navy']] }] },
  } });
  const ala = E.findColor('sw:7008'), pw = E.findColor('sw:7005'), ag = E.findColor('sw:7029');
  assert.equal(E.isPopular(ala), true);
  assert.equal(E.popularity(ala), 1);
  assert.deepEqual(E.popularWhy(ala).map(x => x.text), [`Sherwin-Williams ${Y + 1} Color of the Year`]);
  assert.equal(E.popularWhy(ag)[0].text, 'On Sherwin-Williams’ “Top 50 Colors” list');
  assert.equal(E.popularWhy(E.findColor('bm:OC-17'))[0].text, 'On Benjamin Moore’s “Most Popular” list');
  // higher on the brand's list ranks higher
  assert.ok(E.popularity(pw) > E.popularity(ag));
  // last year's Color of the Year is over, and colors that aren't on any list aren't popular
  assert.equal(E.isPopular(E.findColor('sw:6258')), false);
  assert.equal(E.isPopular(E.findColor('sw:7015')), false);
  // Colors of the Year, and the popular list taking turns between brands
  assert.deepEqual(E.colorsOfYear().map(x => [x.color.id, x.year]), [['sw:7008', Y + 1]]);
  const list = E.popularList({ limit: 10 }).map(c => c.id);
  assert.deepEqual(list, ['bm:OC-17', 'sw:7005', 'bm:HC-154', 'sw:7029']);
  // turned-off brands are left out
  assert.ok(E.popularList({ brands: { sw: false } }).every(c => c.brand !== 'sw'));
  assert.equal(E.colorsOfYear({ brands: { sw: false } }).length, 0);
  assert.deepEqual(E.popularInfo(), { checked: `${Y}-11-24`, brands: ['sw', 'bm'] });
  // a brand word alone in search shows that brand's popular colors first
  assert.equal(E.search('sherwin', { limit: 5 })[0].color.id, 'sw:7008');
  E.setPopular(null);
  assert.equal(E.popularList().length, 0);
});

test('the saved popular colors file is well formed and every color is real', () => {
  const ctx = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'data/popular.js'), 'utf8'))(ctx);
  const P = ctx.CG_POPULAR;
  assert.match(P.checked, /^\d{4}-\d\d-\d\d$/);
  for (const [id, b] of Object.entries(P.brands)) {
    const codes = new Set((window.CG_COLORS[id] || []).map(r => String(r[0])));
    for (const x of b.coty) { assert.ok(codes.has(x.code), `${id} ${x.code}`); assert.ok(x.year >= 2000 && /^https:/.test(x.url)); }
    for (const l of b.lists) { assert.ok(l.title && /^https:/.test(l.url)); for (const [code] of l.colors) assert.ok(codes.has(code), `${id} ${code}`); }
  }
});

test('the finder reads a color only when its name and number are together', async () => {
  const F = await import('../tools/popular/find.mjs');
  const sw = window.CG_BRANDS.find(b => b.id === 'sw'), de = window.CG_BRANDS.find(b => b.id === 'de');
  const names = F.nameIndex(window.CG_COLORS.sw);
  const on = html => F.colorsOnPage(F.readPage(html), sw, names).map(f => f.name);
  // name and number together: found. Name alone, or a number alone, isn't enough.
  assert.deepEqual(on('<li data-color-name="Agreeable Gray" data-color-id="SW 7029"></li>'), ['Agreeable Gray']);
  assert.deepEqual(on('<p>Agreeable Gray is lovely.</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p><p>SW 7029</p>'), []);
  assert.deepEqual(on('<p>Agreeable Gray 7029</p>'), []);   // Sherwin-Williams numbers carry "SW"
  // a Color of the Year page: the color its title names, with the year beside the words
  const page = F.readPage(`<title>Color of the Year ${F.YEAR + 1}, Celery SW 6421 | Sherwin-Williams</title><h2>Pair it with Alabaster SW 7008</h2><p>Celery SW 6421</p>`);
  const c = F.cotyOnPage(page, F.colorsOnPage(page, sw, names), 'https://example.com/color-of-the-year');
  assert.deepEqual([c.name, c.code, c.year], ['Celery', '6421', F.YEAR + 1]);
  // a list of past winners on a hub page doesn't make an old color this year's pick
  const deNames = F.nameIndex(window.CG_COLORS.de);
  const hub = F.readPage(`<p>Midnight Garden DE5657 ${F.YEAR} Color of the Year. Past colors: Honey Glow DE5354 (2017), Terra Rosa DE5096</p><p>${F.YEAR} Color of the Year. To get the look, choose Honey Glow DE5354.</p>`);
  const m = F.cotyMentions(hub, F.colorsOnPage(hub, de, deNames));
  assert.deepEqual(m.map(x => [x.name, x.year]), [['Midnight Garden', F.YEAR]]);
  // links: next year's and this year's pages are followed, older years and other languages aren't
  const links = F.findLinks(`<a href="/color-of-the-year/${F.YEAR + 1}">a</a><a href="/color-of-the-year/${F.YEAR - 2}">b</a><a href="/es/color-of-the-year">c</a><a href="/most-popular">d</a><a href="https://other.com/color-of-the-year">e</a>`, 'https://brand.com/');
  assert.deepEqual(links, [`https://brand.com/color-of-the-year/${F.YEAR + 1}`, 'https://brand.com/most-popular']);
});

test('who a bedroom is for leans the picks, without taking any colors away', () => {
  const fams = who => E.recommend({ space: 'nursery', forWho: who }, { brands: US, resultCount: 6 }).results.map(r => r.color);
  const pinkish = list => list.filter(c => c.fam === 'purple' || c.fam === 'pink' || c.fam === 'red').length;
  const blueish = list => list.filter(c => c.fam === 'blue').length;
  assert.ok(pinkish(fams('girl')) > pinkish(fams('boy')));
  assert.ok(blueish(fams('boy')) > blueish(fams('girl')));
  // the reason says so
  assert.ok(E.recommend({ space: 'nursery', forWho: 'girl' }, { brands: US }).results.some(r => r.reasons.some(x => /girl/.test(x))));
  // an answer that doesn't belong to the room (her room for a kitchen) changes nothing
  const plain = E.recommend({ space: 'kitchen' }, { brands: US }).results.map(r => r.color.id);
  assert.deepEqual(E.recommend({ space: 'kitchen', forWho: 'her' }, { brands: US }).results.map(r => r.color.id), plain);
  // the choices exist for bedrooms, kids' rooms and nurseries only
  assert.deepEqual(Object.keys(E.WHO_FOR).sort(), ['bedroom', 'kids', 'nursery']);
});

test('stains can be looked up by name, number, brand word or color', () => {
  const ids = (q, o) => ST.search(q, o).map(r => r.stain.id);
  assert.equal(ids('special walnut')[0], 'minwax:224');
  assert.equal(ids('1199')[0], 'minwax:1199');                     // a stain number
  assert.ok(ids('minwax early').every(id => id.startsWith('minwax:')));  // a brand word narrows it
  assert.equal(ST.search('superdeck cedar')[0].stain.name, 'Cedar');
  // a switched-off brand is left out
  assert.ok(ids('early american', { stainBrands: { minwax: false } }).every(id => !id.startsWith('minwax:')));
  // a color value gives the closest stains, nearest first
  const near = ST.search('', { hex: '8E4A32', limit: 5 });
  assert.equal(near.length, 5);
  assert.ok(near.every((r, i) => i === 0 || r.dE >= near[i - 1].dE));
  assert.deepEqual(ST.search(''), []);
});

// ---------------- brands from around the world ----------------
test('brands from other countries: searchable by name, number and brand word', () => {
  for (const id of ['duluxau', 'plascon', 'sico', 'nerolac']) assert.ok((E.getIndex().byBrand[id] || []).length > 1000, id);
  assert.equal(E.search('SW1G1')[0].color.brand, 'duluxau');
  assert.equal(E.search('dulux vivid white')[0].color.code, 'SW1G1');
  assert.equal(E.search('plascon moody blue')[0].color.brand, 'plascon');
  assert.equal(E.search('sico london cab')[0].color.code, '6242-83');
  assert.equal(E.search('nerolac cannon ball')[0].color.brand, 'nerolac');
  // a first word that happens to be a brand's isn't taken as that brand
  assert.ok(E.search('diamond white').some(r => r.color.brand !== 'dv'));
  // Dulux publishes its own LRV; the others' is worked out from the color
  const vivid = E.findColor('duluxau:SW1G1');
  assert.equal(vivid.lrv, 94);
  assert.ok(!(vivid.flags & E.F.LRV_EST));
});
