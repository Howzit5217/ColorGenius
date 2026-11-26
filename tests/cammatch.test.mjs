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
  const c = M.combine(got, opts);
  return { c, raw: got, problems: got.map(g => g.problem).filter(Boolean) };
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

// ---------------- whites, off-whites and very dark colors ----------------
test('whites: brighter than copy paper, a cool white almost the same as the paper, and off-whites all read', () => {
  // (F7F5EE and F4F4F0 are brighter than copy paper; EEF0F0 and E9EBEA differ from it by a hair)
  for (const hex of ['F7F5EE', 'F4F4F0', 'EEF0F0', 'E9EBEA', 'EDEAE0', 'E8E4DA']) for (const o of [{}, { chip: 150 }, { torch: { x: 185, y: 125, r0: 230, share: 0.85 } }]) {
    const { c, problems } = read(Object.assign({ hex }, o));
    assert.ok(c, `${hex} ${JSON.stringify(o)}: ${problems.join(',')}`);
    assert.ok(err(c.hex, hex) < 1.5, `${hex} ${JSON.stringify(o)} read ${c.hex} (${err(c.hex, hex).toFixed(2)})`);
  }
});
test('very dark colors: a grainy camera and a chip bigger than the box don’t cut the edge short', () => {
  // (the camera's noise in a dark color used to look like its edge, so the "paper" read was the chip itself)
  for (const hex of ['1F2124', '2B2C2E', '22303F', '233024', '3B2620', '2F3B4C']) for (const o of [{ noise: 3.5 }, { chip: 150 }, { chip: 150, noise: 3 }]) {
    const { c, problems } = read(Object.assign({ hex }, o));
    assert.ok(c, `${hex} ${JSON.stringify(o)}: ${problems.join(',')}`);
    assert.ok(err(c.hex, hex) < 1.5, `${hex} ${JSON.stringify(o)} read ${c.hex} (${err(c.hex, hex).toFixed(2)})`);
  }
});
test('tuning: a white chip sets the paper’s own tint, a dark chip the camera’s curve, and neither spoils the other', () => {
  const pair = (hex, o) => ({ m: read(Object.assign({ hex }, o)).c.raw, t: M.linOf(hex).map(v => v / M.PAPER) });
  const avg = (list, o, tune) => list.reduce((s, hex) => s + err(read(Object.assign({ hex }, o), { tune }).c.hex, hex), 0) / list.length;
  const WH = ['F7F5EE', 'EDEAE0', 'E8E4DA'], DK = ['1F2124', '22303F', '3B2620'], MID = ['5D9A85', 'D1CBC1', 'B23C1C'];
  // bluish copy paper turns whites yellow; one white chip puts that right, and doesn't move the dark colors
  const blue = { paper: [0.84, 0.86, 0.92] };
  const white = M.fitTune([pair('F0EDE4', blue)]);
  assert.ok(avg(WH, blue) > 2.5, 'bluish paper throws whites off');
  assert.ok(avg(WH, blue, white) < 0.8, 'a white chip fixes them');
  assert.ok(avg(DK, blue, white) < 1.5 && avg(MID, blue, white) < 1.2, 'and the rest are fine too');
  assert.ok(white.g.every(g => g === 1), 'a white chip leaves the curve alone');
  // a contrasty camera with lens flare on bluish paper: a white and a dark chip together bring everything close
  const hard = { paper: [0.84, 0.86, 0.92], flare: 0.01, curve: 'scurve' };
  const both = M.fitTune([pair('F0EDE4', hard), pair('2E2F33', hard)]);
  assert.ok(avg(DK, hard) > 5, 'untuned, dark colors are far off');
  assert.ok(avg(WH, hard, both) < 1.2 && avg(DK, hard, both) < 2.2 && avg(MID, hard, both) < 2.5, 'tuned with both, all close');
  // a tuning saved by an older version (powers only) still works
  assert.deepEqual(M.applyTune([0.25, 0.5, 1], [2, 1, 1]), [0.0625, 0.5, 1]);
});

// ---------------- colors between two primaries: teal, red-orange ----------------
// A camera's sensor isn't the eye, and phones add punch, so it mixes red, green and blue a little wrong: worst for
// colors between two primaries. (Benjamin Moore 759 Madison Avenue, a teal, read a step lighter, like 758.)
const avgErr = (list, o, tune) => list.reduce((s, hex) => s + err(read(Object.assign({ hex }, o), { tune }).c.hex, hex), 0) / list.length;
const pairOf = (hex, o) => ({ m: read(Object.assign({ hex }, o)).c.raw, t: M.linOf(hex).map(v => v / M.PAPER) });
const MIXCAM = { mix: 'twist', curve: 'lift' };
const TEALS = ['54B1C9', '76C4E2', '45ADBE', '8AD0DB'], REDOR = ['C8553D', 'B84A2E', 'D9714F'], OTHER = ['E07B39', 'A4B83A', '6F5A8C', '2F5DA8', 'E8C547'], NEUTRAL = ['8C8C88', 'EDEAE0', '22303F', 'D1CBC1'];
test('a teal read wrong, then named: it reads right, and so do the teals near it', () => {
  const untuned = err(read(Object.assign({ hex: '6BC0CE' }, MIXCAM)).c.hex, '6BC0CE');
  assert.ok(untuned > 3, 'the camera reads 759 off: ' + untuned.toFixed(2));
  const tune = M.fitTune([pairOf('6BC0CE', MIXCAM)]);
  assert.ok(err(read(Object.assign({ hex: '6BC0CE' }, MIXCAM), { tune }).c.hex, '6BC0CE') < 1, '759 itself');
  const before = avgErr(TEALS, MIXCAM), after = avgErr(TEALS, MIXCAM, tune);
  assert.ok(after < before * 0.45, `teals near it: ${before.toFixed(2)} -> ${after.toFixed(2)}`);
  assert.ok(avgErr(NEUTRAL, MIXCAM, tune) < avgErr(NEUTRAL, MIXCAM) + 0.5, 'grays and whites aren’t made worse');
});
test('a white, a dark and a few colorful chips bring every kind of color close', () => {
  const tune = M.fitTune(['F0EDE4', '2E2F33', '6BC0CE', 'C25A3F', '9DAE3E', '76608F'].map(hex => pairOf(hex, MIXCAM)));
  for (const [name, list] of [['teals', TEALS], ['red-oranges', REDOR], ['others', OTHER], ['neutrals', NEUTRAL]]) {
    const before = avgErr(list, MIXCAM), after = avgErr(list, MIXCAM, tune);
    assert.ok(after < 1.6 && after < before * 0.5, `${name}: ${before.toFixed(2)} -> ${after.toFixed(2)}`);
  }
  // on a camera with nothing to put right, the same tuning changes nothing much
  const fine = M.fitTune(['F0EDE4', '2E2F33', '6BC0CE', 'C25A3F', '9DAE3E', '76608F'].map(hex => pairOf(hex, {})));
  assert.ok(avgErr(TEALS.concat(REDOR, OTHER), {}, fine) < 1, 'an exact camera stays exact');
  // Lab and back is exact
  for (const hex of ['6BC0CE', 'C8553D', '22303F', 'EDEAE0']) assert.equal(M.hexOf(M.linFromLab(M.lab(M.linOf(hex)))), hex);
});
test('a picture with no size yet (the screen turning) is skipped, not an error', () => {
  const frame = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
  assert.equal(M.analyze(frame, { mode: 'paper', color: { x0: NaN, y0: NaN, x1: NaN, y1: NaN } }).problem, 'small');
});
test('without the phone’s light: its shadow over part of the paper doesn’t throw the reading off', () => {
  for (const hex of ['6BC0CE', 'D1CBC1', '22303F', 'C8553D', 'EDEAE0']) for (const phoneShadow of [{ sx: 50, k: 0.6 }, { sx: 70, k: 0.5, sa: 0.6 }, { sx: 48, k: 0.4, sw: 2 }]) {
    const { c, problems } = read({ hex, phoneShadow });
    assert.ok(c ? err(c.hex, hex) < 2.2 : problems.length, `${hex} ${JSON.stringify(phoneShadow)} read ${c && c.hex}`);
  }
});
test('the paper is the white: copy paper by default, or counted as pure #FFFFFF, and the light’s tint comes out either way', () => {
  const asWhite = { paper: M.PAPER_WHITE };
  assert.equal(M.hexOf([M.PAPER, M.PAPER, M.PAPER]), 'EFEFEF');
  assert.equal(M.hexOf([M.PAPER_WHITE, M.PAPER_WHITE, M.PAPER_WHITE]), 'FFFFFF');
  for (const hex of ['D1CBC1', '2F3B4C', 'B23C1C', '5D9A85']) for (const light of [[1.35, 1, 0.62], [0.85, 1, 1.2]]) {
    // counted as copy paper (the default), the chip reads true under warm or cool light
    const copy = read({ hex, light }).c;
    assert.ok(err(copy.hex, hex) < 2, `${hex} under ${light}: ${copy.hex}`);
    // counted as #FFFFFF: the same reading scaled to a perfect white, so the same color only lighter, with no tint
    const white = read({ hex, light }, asWhite);
    const c = M.combine(white.raw, asWhite);
    const want = M.hexOf(M.linOf(hex).map(v => v / M.PAPER));
    assert.ok(err(c.hex, want) < 2, `${hex} as #FFFFFF under ${light}: ${c.hex}, want ${want}`);
    assert.ok(M.lab(M.linOf(c.hex))[0] > M.lab(M.linOf(copy.hex))[0], `${hex}: lighter against #FFFFFF`);
  }
  // what the camera saw on the paper is passed along (warm light: the paper looks warm before it's put right)
  const { frame, layout } = shoot({ hex: 'D1CBC1', light: [1.35, 1, 0.62], seed: 5 });
  const r = M.analyze(frame, layout, asWhite), seen = M.linOf(r.seen.paper);
  assert.ok(seen[0] > seen[2], 'the paper looks warm to the camera (it does its own white balance, so only a little): ' + r.seen.paper);
});
