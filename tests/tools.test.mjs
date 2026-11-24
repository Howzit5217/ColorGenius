// Paint department advice: rollers, brushes, supplies, amounts and "which paint to buy". Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
globalThis.window = globalThis;
require(path.join(ROOT, 'data/brands.js'));
for (const b of window.CG_BRANDS) require(path.join(ROOT, 'data/colors', b.id + '.js'));
require(path.join(ROOT, 'js/color.js'));
const E = require(path.join(ROOT, 'js/engine.js'));
E.init(window.CG_BRANDS, window.CG_COLORS);
const S = require(path.join(ROOT, 'js/stain.js'));
const T = require(path.join(ROOT, 'js/tools.js'));
const US = Object.fromEntries(window.CG_BRANDS.map(b => [b.id, b.group === 'us']));

test('every paint and stain job lands on a tool class', () => {
  for (const space of Object.keys(E.SPACES)) assert.ok(T.CLASSES[T.classOf({ kind: 'paint', space })], space);
  for (const target of Object.keys(S.JOBS)) assert.ok(T.CLASSES[T.classOf({ kind: 'stain', target })], target);
});

test('roller nap follows the surface: longer for rough, short for smooth enamel work', () => {
  const nap = job => T.applicators(job).roller.napId;
  assert.equal(nap({ kind: 'paint', space: 'living', texture: 'smooth', sheen: 'eggshell' }), '3/8');
  assert.equal(nap({ kind: 'paint', space: 'living', texture: 'light' }), '1/2');
  assert.equal(nap({ kind: 'paint', space: 'living', texture: 'rough' }), '3/4');
  assert.equal(nap({ kind: 'paint', space: 'living', texture: 'smooth', sheen: 'semigloss' }), '1/4');
  assert.equal(nap({ kind: 'paint', space: 'cabinets' }), '3/16');
  assert.equal(nap({ kind: 'paint', space: 'fireplace' }), '1');
  assert.equal(nap({ kind: 'paint', space: 'ext_body', siding: 'stucco' }), '1-1/4');
  assert.equal(nap({ kind: 'paint', space: 'ext_body', siding: 'vinyl' }), '3/8');
  assert.equal(nap({ kind: 'paint', space: 'ceiling', texture: 'rough' }), '3/4');
});

test('brush bristle follows the product: synthetic for water-based, natural for oil', () => {
  assert.match(T.applicators({ kind: 'paint', space: 'trim' }).brush.fiber, /Nylon/);
  assert.match(T.applicators({ kind: 'paint', space: 'trim', product: 'oil' }).brush.fiber, /Natural/);
  assert.match(T.applicators({ kind: 'stain', target: 'furniture' }).brush.fiber, /Natural/);
  assert.match(T.applicators({ kind: 'stain', target: 'furniture', stainType: 'water' }).brush.fiber, /Nylon/);
  // every job gets at least one way to put it on
  for (const space of Object.keys(E.SPACES)) { const t = T.applicators({ kind: 'paint', space }); assert.ok(t.roller || t.brush, space); }
  for (const target of Object.keys(S.JOBS)) { const t = T.applicators({ kind: 'stain', target }); assert.ok(t.roller || t.brush || t.other.length, target); }
});

test('supplies fit the job', () => {
  const names = job => T.supplies(job).map(x => x.name).join(' | ');
  assert.match(names({ kind: 'paint', space: 'cabinets' }), /Degreasing/);
  assert.match(names({ kind: 'paint', space: 'trim' }), /caulk/);
  assert.match(names({ kind: 'paint', space: 'floor_paint' }), /Concrete cleaner/);
  assert.match(names({ kind: 'stain', target: 'floors' }), /conditioner/);
  assert.match(names({ kind: 'stain', target: 'deck' }), /brightener/);
  assert.doesNotMatch(names({ kind: 'stain', target: 'deck' }), /conditioner/);
  assert.ok(T.safety({ kind: 'stain', target: 'furniture' }).some(x => /catch fire/.test(x)));
  assert.equal(T.safety({ kind: 'paint', space: 'living' }).length, 0);
});

test('containers: quarts for small jobs, gallons, then 5-gallon buckets', () => {
  assert.equal(T.cartText(T.containers(0.2)), '1 quart');
  assert.equal(T.cartText(T.containers(0.45)), '2 quarts');
  assert.equal(T.cartText(T.containers(0.6)), '1 gallon');
  assert.equal(T.cartText(T.containers(1.1)), '1 gallon + 1 quart');
  assert.equal(T.cartText(T.containers(1.8)), '2 gallons');
  assert.equal(T.cartText(T.containers(11.2)), '2 5-gallon buckets + 1 gallon + 1 quart');
});

test('how much paint: a medium room takes about 2 to 3 gallons for two coats', () => {
  const a = T.amount({ kind: 'paint', space: 'living', texture: 'smooth' }, 'medium', 2);
  assert.ok(a.area > 300 && a.area < 450, a.area);
  assert.ok(a.gallons > 1.8 && a.gallons < 2.8, a.gallons);
  const big = T.amount({ kind: 'paint', space: 'living', texture: 'rough' }, 'large', 2);
  assert.ok(big.gallons > a.gallons * 1.5);
  // exact measurements
  const exact = T.amount({ kind: 'paint', space: 'bedroom', texture: 'smooth' }, { l: 10, w: 10, h: 8, doors: 0, windows: 0 }, 2);
  assert.equal(exact.area, 320);
  // ceilings use the floor area
  assert.equal(T.amount({ kind: 'paint', space: 'ceiling' }, 'small').area, 100);
  // a stained floor gets a clear topcoat line with three coats
  const fl = T.amount({ kind: 'stain', target: 'floors' }, 'medium');
  assert.ok(fl.topcoat && fl.topcoatCoats === 3);
  // decks: a medium deck takes a couple of gallons of semi-transparent stain
  const dk = T.amount({ kind: 'stain', target: 'deck' }, 'medium');
  assert.ok(dk.gallons > 1.5 && dk.gallons < 4, dk.gallons);
});

test('which paint to buy: the plan fits the job', () => {
  const ctx = { brands: US };
  const bath = T.paintPlan({ space: 'bathroom', size: 'small' }, ctx);
  assert.ok(['satin', 'semigloss'].includes(bath.finish.id));
  assert.ok(bath.lines.length >= 1);
  assert.ok(bath.tools.roller && bath.tools.brush);
  assert.ok(bath.amount.buy.length);
  // a busy family room nudges a flat or matte finish up to eggshell
  const kids = T.paintPlan({ space: 'living', kids: true }, ctx);
  assert.equal(kids.finish.id, 'eggshell');
  // cabinets get an enamel line and a bonding primer on laminate
  const cab = T.paintPlan({ space: 'cabinets', surface: 'laminate' }, ctx);
  assert.equal(cab.product, 'enamel');
  assert.ok(cab.lines.every(x => x.line.tags.includes('enamel')), cab.lines.map(x => x.line.name).join());
  assert.equal(cab.primer.need, 'bond');
  // floors only ever get floor paint
  const fl = T.paintPlan({ space: 'floor_paint' }, ctx);
  assert.ok(fl.lines.length && fl.lines.every(x => x.line.tags.includes('floor')));
  // the store brand comes first, and price level picks the tier
  const sw = T.paintPlan({ space: 'bedroom', priority: 'best' }, { brands: US, storeBrand: 'sw' });
  assert.equal(sw.lines[0].brand, 'sw');
  assert.equal(sw.lines[0].line.tier, 3);
  const cheap = T.paintPlan({ space: 'bedroom', priority: 'value' }, { brands: US, storeBrand: 'sw', storeOnly: true });
  assert.equal(cheap.lines.length, 1);
  assert.equal(cheap.lines[0].line.tier, 1);
  // a dark color over a light wall gets a primer or an extra coat
  const dark = T.paintPlan({ space: 'living', nowKind: 'white', going: 'dark' }, ctx);
  assert.ok(dark.primer.need || dark.coats >= 3 || dark.primer.tips.some(t => /gray/.test(t)));
  // every space gives a full plan
  for (const space of Object.keys(E.SPACES)) {
    const p = T.paintPlan({ space }, ctx);
    assert.ok(p.finish && p.type && p.amount.buy && (p.tools.roller || p.tools.brush), space);
  }
});

test('stain plan: tools, supplies and amount for every stain job', () => {
  for (const target of Object.keys(S.JOBS)) {
    const p = T.stainPlan(Object.assign({}, S.DEFAULT, { target }), []);
    assert.ok(p.amount.buy && p.supplies.length, target);
  }
});
