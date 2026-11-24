// The camera color match, on made-up camera pictures: a chip of known color on white paper (or beside it, on a
// wall), lit and photographed the ways a phone really does it: the phone's light making a bright spot, warm and
// cool light, the camera's auto white balance and exposure, its contrast curve, the top it can't go past, shine
// and noise. Each reading is compared with the chip's true color (in Lab units: under 2 is hard to see).
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const M = require(path.join(ROOT, 'js/cammatch.js'));

import { shoot } from './camsim.mjs';
const err = (hex, want) => M.dE(M.lab(M.linOf(hex)), M.lab(M.linOf(want)));
// several pictures (fresh noise each), combined the way the app does
function read(o, opts) {
  const got = [];
  for (let s = 1; s <= 6; s++) { const { frame, layout } = shoot(Object.assign({}, o, { seed: s * 31 + (o.seed || 0) })); got.push(M.analyze(frame, layout, opts)); }
  const c = M.combine(got);
  return { c, problems: got.map(g => g.problem).filter(Boolean) };
}
const CHIPS = ['227459', '5D9A85', 'D1CBC1', 'EDEAE0', '2F3B4C', 'B23C1C', 'E8C547', '7A6E62', '3A3A3C', 'C9D6E3'];

test('even light: every kind of color reads true', () => {
  for (const hex of CHIPS) {
    const { c, problems } = read({ hex });
    assert.ok(c, `${hex}: ${problems.join(',')}`);
    assert.ok(err(c.hex, hex) < 1.5, `${hex} read ${c.hex} (${err(c.hex, hex).toFixed(2)})`);
  }
});

// (r0 is how fast the light falls off, in picture pixels: about the phone's height. 230 is a phone held 10 cm up,
// 120 about 5 cm, 70 about 3 cm, closer than anyone should hold it)
test('the phone’s light: a bright spot off to one side, falling off fast', () => {
  for (const hex of CHIPS) for (const torch of [{ x: 185, y: 125, r0: 230, share: 0.85 }, { x: 200, y: 110, r0: 150, share: 0.8 }, { x: 120, y: 150, r0: 120, share: 0.9 }]) {
    const { c, problems } = read({ hex, torch });
    assert.ok(c, `${hex}: ${problems.join(',')}`);
    assert.ok(err(c.hex, hex) < 1.5, `${hex} with the light at ${torch.x},${torch.y} (r0 ${torch.r0}) read ${c.hex} (${err(c.hex, hex).toFixed(2)})`);
  }
  // far too close: still near, or flagged
  for (const hex of CHIPS) {
    const { c, problems } = read({ hex, torch: { x: 200, y: 110, r0: 70, share: 0.8 } });
    assert.ok(c ? err(c.hex, hex) < 5 : problems.length, `${hex} up close read ${c && c.hex}`);
  }
});

test('warm bulbs, cool daylight and a sloping light all cancel out', () => {
  for (const hex of CHIPS) for (const o of [{ light: [1.35, 1, 0.62] }, { light: [0.85, 1, 1.2] }, { gx: 0.5, gy: -0.3 }]) {
    const { c } = read(Object.assign({ hex }, o));
    assert.ok(c && err(c.hex, hex) < 2, `${hex} ${JSON.stringify(o)} read ${c && c.hex}`);
  }
});

test('the same chip in brighter and dimmer light reads the same (no more two answers for one color)', () => {
  for (const hex of ['227459', '5D9A85', 'D1CBC1']) for (const curve of ['srgb', 'shoulder']) {
    const reads = [0.3, 0.45, 0.6, 0.72].map(expose => read({ hex, expose, curve }).c);
    for (const r of reads) assert.ok(r, `${hex} ${curve}`);
    for (const r of reads) for (const q of reads) assert.ok(err(r.hex, q.hex) < 2.5, `${hex} ${curve}: ${reads.map(x => x.hex).join(' ')}`);
  }
});

test('paper washed out by too much light is refused, not read wrong', () => {
  for (const hex of ['227459', '5D9A85']) {
    const { c, problems } = read({ hex, expose: 1.5 });
    assert.ok(!c || err(c.hex, hex) < 2.5, `${hex} read ${c && c.hex}`);
    if (!c) assert.ok(problems.every(p => p === 'bright'), problems.join(','));
  }
});

test('shine on the chip is left out or flagged', () => {
  const { c, problems } = read({ hex: '2F3B4C', glare: 9 });
  assert.ok(c ? err(c.hex, '2F3B4C') < 2.5 : problems.includes('glare'), `${c && c.hex} ${problems.join(',')}`);
});

test('a chip bigger than the box, and an off-white one, still find the paper past the chip’s edge', () => {
  for (const hex of ['EDEAE0', 'D1CBC1', '227459', 'C9D6E3']) {
    const { c, problems } = read({ hex, chip: 150, box: 56 });
    assert.ok(c, `${hex}: ${problems.join(',')}`);
    assert.ok(err(c.hex, hex) < 2, `${hex} read ${c.hex} (${err(c.hex, hex).toFixed(2)})`);
  }
});

test('no paper around the color is noticed', () => {
  const { frame, layout } = shoot({ hex: '5D9A85', chip: 400 });
  assert.equal(M.analyze(frame, layout).problem, 'ring');
});

test('a contrasty camera, tuned with one known chip, reads the rest close', () => {
  const opts = {};
  const untuned = CHIPS.map(hex => err(read({ hex, curve: 'scurve' }, opts).c.hex, hex));
  // tune with a medium gray chip the store has
  const g = read({ hex: '8C8C88', curve: 'scurve' }).c;
  const tune = M.fitTune([{ m: g.raw, t: M.linOf('8C8C88').map(v => v / M.PAPER) }]);
  const tuned = CHIPS.map(hex => err(read({ hex, curve: 'scurve' }, { tune }).c.hex, hex));
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(avg(tuned) < avg(untuned) * 0.6, `untuned ${avg(untuned).toFixed(2)}, tuned ${avg(tuned).toFixed(2)}`);
  assert.ok(Math.max(...tuned) < 4, `worst tuned ${Math.max(...tuned).toFixed(2)}`);
});

test('on a wall, with a sheet of paper beside the color', () => {
  for (const hex of CHIPS) for (const o of [{}, { gx: 0.35 }, { light: [1.3, 1, 0.7] }]) {
    const { c, problems } = read(Object.assign({ hex, mode: 'wall' }, o));
    assert.ok(c, `${hex}: ${problems.join(',')}`);
    assert.ok(err(c.hex, hex) < 2.5, `${hex} ${JSON.stringify(o)} read ${c.hex} (${err(c.hex, hex).toFixed(2)})`);
  }
});
