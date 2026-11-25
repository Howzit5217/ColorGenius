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

test('room calculator: the numbers work out by hand', () => {
  const walls = { kind: 'paint', space: 'living', texture: 'smooth' };
  // 14 x 12 ft, 8 ft high: 2 x (14 + 12) x 8 = 416 sq ft, less a door (20) and two windows (2 x 15) = 366
  const a = T.amount(walls, { l: 14, w: 12, h: 8, doors: 1, windows: 2 }, 2);
  assert.equal(a.area, 366);
  assert.equal(a.coverage, 350);
  // two coats: 732 / 350 = 2.09 gallons, bought as 2 gallons and a quart (2.25)
  assert.equal(a.gallons, 2.09);
  assert.equal(a.buy, '2 gallons + 1 quart');
  // one coat of the same is 1.05 gallons: 1 gallon + 1 quart
  assert.equal(T.amount(walls, { l: 14, w: 12, h: 8, doors: 1, windows: 2 }, 1).buy, '1 gallon + 1 quart');
  // decimals count: 12.5 x 10 ft, 8.5 ft high, no openings = 2 x 22.5 x 8.5 = 382.5 sq ft
  assert.equal(T.amount(walls, { l: 12.5, w: 10, h: 8.5, doors: 0, windows: 0 }, 2).area, 383);
  // rough walls cover less (250 sq ft a gallon), so they take more
  const rough = T.amount({ kind: 'paint', space: 'living', texture: 'rough' }, { l: 14, w: 12, h: 8, doors: 1, windows: 2 }, 2);
  assert.equal(rough.coverage, 250);
  assert.equal(rough.gallons, Math.round(366 * 2 / 250 * 100) / 100);
  // 2.25 gallons is 2 gallons and a quart, even when the math comes out a hair over (366 x 2 / 325 = 2.2523)
  assert.equal(T.amount({ kind: 'paint', space: 'living', texture: 'light' }, { l: 14, w: 12, h: 8, doors: 1, windows: 2 }, 2).buy, '2 gallons + 1 quart');
  assert.equal(T.cartText(T.containers(2.26)), '2 gallons + 1 quart');
  assert.equal(T.cartText(T.containers(2.3)), '2 gallons + 2 quarts');
  // a room full of windows never goes below zero
  assert.equal(T.amount(walls, { l: 6, w: 6, h: 8, doors: 4, windows: 20 }, 2).area, 0);
  // the ceiling is the floor area: 14 x 12 = 168
  assert.equal(T.amount({ kind: 'paint', space: 'ceiling' }, { l: 14, w: 12, h: 8, doors: 1, windows: 2 }, 2).area, 168);
  // a primer coat gets its own line: 366 sq ft at 300 a gallon = 1.22 gallons, a gallon and a quart
  assert.equal(T.amount(Object.assign({ primer: true }, walls), { l: 14, w: 12, h: 8, doors: 1, windows: 2 }, 2).primer, '1 gallon + 1 quart');
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

// ---------------- the weather for outside jobs ----------------
// a made-up hourly forecast: 7 days from midnight, with changes to some hours
function forecast(change) {
  const start = new Date(2026, 5, 1, 0, 0, 0), out = [];
  for (let i = 0; i < 24 * 7; i++) {
    const t = new Date(start.getTime() + i * 3600e3), h = t.getHours();
    const x = { t, temp: 58 + 12 * Math.sin(Math.PI * Math.max(0, Math.min(1, (h - 6) / 14))), rain: 5, wind: 6 };
    if (change) change(x, Math.floor(i / 24), h);
    out.push(x);
  }
  return out;
}
const verdicts = days => days.map(d => d.verdict).join(' ');
test('weather: a dry, mild week is good to paint; the last day is too far out to be sure', () => {
  const days = T.weatherDays(forecast(), T.WEATHER_RULES.paint);
  assert.equal(days.length, 7);
  assert.equal(verdicts(days.slice(0, 6)), 'good good good good good good');
  assert.equal(days[6].verdict, 'okay');
  assert.ok(days[6].why.includes('Too far out to be sure'));
});
test('weather: rain on the day, rain before it dries, cold, heat and wind', () => {
  // rain midday on day 2: day 2 is out, and so is day 1 (it would rain on wet paint)
  let days = T.weatherDays(forecast((x, d, h) => { if (d === 2 && h >= 11 && h <= 14) x.rain = 80; }), T.WEATHER_RULES.paint);
  assert.equal(days[2].verdict, 'bad'); assert.ok(days[2].why.includes('Rain likely'));
  assert.equal(days[1].verdict, 'bad'); assert.ok(days[1].why.includes('Rain before it dries'));
  assert.equal(days[0].verdict, 'good');
  // a cold day and a hot day
  days = T.weatherDays(forecast((x, d) => { if (d === 3) x.temp -= 20; if (d === 4) x.temp += 30; }), T.WEATHER_RULES.paint);
  assert.ok(days[3].why.some(w => w.startsWith('Too cold')), days[3].why.join());
  assert.ok(days[4].why.some(w => w.startsWith('Too hot')), days[4].why.join());
  // a windy day is okay, with why
  days = T.weatherDays(forecast((x, d) => { if (d === 1) x.wind = 25; }), T.WEATHER_RULES.paint);
  assert.equal(days[1].verdict, 'okay'); assert.ok(days[1].why.some(w => w.startsWith('Windy')));
});
test('weather: stain also needs the wood dry from the day before; paint doesn’t', () => {
  const wetNight = forecast((x, d, h) => { if (d === 2 && h >= 19) x.rain = 70; });
  const stain = T.weatherDays(wetNight, T.WEATHER_RULES.stain), paint = T.weatherDays(wetNight, T.WEATHER_RULES.paint);
  assert.equal(stain[3].verdict, 'bad'); assert.ok(stain[3].why.includes('Wet wood from rain the day before'));
  assert.notEqual(paint[3].verdict, 'bad');
});
