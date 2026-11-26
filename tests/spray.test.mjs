// Spray paint: the colors from each brand, the right product line for each job, matching a color, and what to buy.
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
globalThis.window = globalThis;
const C = require(path.join(ROOT, 'js/color.js'));
require(path.join(ROOT, 'data/sprays.js'));
const SP = require(path.join(ROOT, 'js/spray.js'));
SP.init();

test('the colors: three brands, every can with a name, a value, a finish and a known product line', () => {
  const ids = SP.brands().map(b => b.id).sort();
  assert.deepEqual(ids, ['krylon', 'montana', 'rustoleum']);
  const all = SP.all();
  assert.ok(all.length > 1000, all.length + ' cans');
  const seen = new Set();
  for (const x of all) {
    assert.ok(x.name && /^[0-9A-F]{6}$/.test(x.hex), JSON.stringify(x));
    assert.ok(SP.LINES[x.line], 'a line with no notes: ' + x.line);
    assert.ok(!seen.has(x.id), 'two cans with one id: ' + x.id); seen.add(x.id);
    assert.ok(x.finish === '' || SP.finishName(x.finish), 'an unknown finish: ' + x.finish);
  }
  // each brand has the lines a paint department carries
  const lines = new Set(all.map(x => x.line));
  for (const l of ['pt2x', 'universal', 'stopsrust', 'highheat', 'fusion', 'colormaxx', 'rusttough', 'mtngold']) assert.ok(lines.has(l), l);
});

test('each job gets the kind of spray paint made for it', () => {
  const linesOf = a => new Set(SP.recommend(a, {}).results.map(r => r.line));
  // a grill only gets high-heat paint, an appliance only appliance epoxy
  assert.deepEqual([...linesOf({ what: 'grill' })], ['highheat']);
  assert.deepEqual([...linesOf({ what: 'appliance' })], ['appliance']);
  // plastic: lines that bond to plastic, and Krylon Fusion's advice first
  for (const l of linesOf({ what: 'plastic', finish: 'gloss', families: ['blues'] })) assert.ok(SP.FOR.plastic.includes(l), l);
  assert.match(SP.recommend({ what: 'plastic', families: ['greens'] }, {}).products[0].name, /Fusion/);
  // outside metal: a rust-stopping line comes first
  const metal = SP.recommend({ what: 'metal', place: 'outside' }, {});
  assert.ok(SP.LINES[metal.results[0].line].rust, metal.results[0].line);
  // no clears or primers among the colors
  for (const w of Object.keys(SP.JOBS)) for (const r of SP.recommend({ what: w }, {}).results) assert.ok(SP.isColor(r), r.name);
});

test('colors: the families asked for, a spread of them, and a match sorted by how close it is', () => {
  const r = SP.recommend({ what: 'wood', families: ['reds', 'greens'] }, {});
  assert.ok(r.results.length >= 6);
  assert.ok(r.results.every(x => ['reds', 'greens'].includes(x.family)));
  assert.ok(r.results.some(x => x.family === 'reds') && r.results.some(x => x.family === 'greens'), 'both families');
  // not six of nearly the same color
  for (let i = 0; i < r.results.length; i++) for (let j = 0; j < i; j++) assert.ok(C.deltaE2000(r.results[i].lab, r.results[j].lab) > 3, r.results[i].name + ' / ' + r.results[j].name);
  const m = SP.recommend({ what: 'crafts', match: { hex: '2F4A66', name: 'Navy' } }, {});
  const d = m.results.map(x => x.dE);
  assert.deepEqual(d, d.slice().sort((p, q) => p - q));
  assert.ok(d[0] < 6, 'the closest is close: ' + d[0]);
  assert.match(m.results[0].reasons[0], /to Navy$/);
  // the families make sense
  const fam = n => SP.all().find(x => x.name === n).family;
  assert.equal(fam('Gloss Navy'), 'blues'); assert.equal(fam('Gloss Purple'), 'purples'); assert.equal(fam('Flat Black'), 'blacks'); assert.equal(fam('Gloss White'), 'whites');
});

test('a brand switched off (or a store without it) leaves its cans out', () => {
  const off = { sprayBrands: { krylon: false, montana: false } };
  assert.ok(SP.recommend({ what: 'crafts' }, off).results.every(x => x.brand === 'rustoleum'));
  assert.equal(SP.recommend({ what: 'plastic' }, { sprayBrands: { rustoleum: false, krylon: false, montana: false } }).results.length, 0);
  assert.ok(SP.search('fusion', off).length === 0);
});

test('what to buy: the cans, a primer when the surface needs one, a clear coat over chalky paint', () => {
  const rusty = SP.recommend({ what: 'metal', place: 'outside', condition: 'rusty', size: 'large' }, {});
  assert.equal(rusty.cans.color, 4);
  assert.ok(rusty.products.some(p => /Rusty metal primer/.test(p.name)));
  assert.ok(rusty.products.find(p => p.supplies).supplies.includes('Wire brush'));
  const chalky = SP.recommend({ what: 'wood', finish: 'chalky', size: 'small' }, {});
  assert.ok(chalky.products.some(p => /Clear matte top coat/.test(p.name)));
  assert.equal(SP.cansFor({ what: 'plastic', size: 'small' }).primer, 0);
  assert.ok(SP.recommend({ what: 'grill' }, {}).tips.some(t => /cooking grates/.test(t.text)));
});

test('Look Up finds spray paint by name, number, brand or line, and by a color value', () => {
  assert.equal(SP.search('334020')[0].spray.name, 'Flat Black');
  assert.equal(SP.search('G1010')[0].spray.brand, 'montana');
  assert.ok(SP.search('krylon fusion navy').every(x => x.spray.brand === 'krylon'));
  assert.ok(SP.search('gloss black').length >= 3);
  const near = SP.search('', { hex: 'B3262B', limit: 5 });
  assert.equal(near.length, 5);
  assert.ok(near[0].dE <= near[4].dE);
});
