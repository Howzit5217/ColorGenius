// Painting a photo of a room: made-up pictures of a wall in uneven light beside white trim and a dark door.
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PP = require(path.join(ROOT, 'js/photopaint.js'));

const lin = h => { const x = parseInt(h, 16) / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
const enc = v => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
// a 200×150 room corner: the wall (light falling off from the left), a white trim board, then a dark door
function room(o) {
  o = o || {};
  const W = 200, H = 150, data = new Uint8ClampedArray(W * H * 4);
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const what = x => (x < 120 ? 'wall' : x < 128 ? 'trim' : 'door');
  const hex = { wall: o.wall || 'D9CBB4', trim: 'F2F1EC', door: '5A3E2B' };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = what(x), light = k === 'wall' ? 1 - 0.35 * x / 120 : 0.95, grain = 1 + (rnd() - 0.5) * (o.grain || 0.03);
    for (let c = 0; c < 3; c++) data[(y * W + x) * 4 + c] = Math.min(255, enc(lin(hex[k].slice(c * 2, c * 2 + 2)) * light * grain));
    data[(y * W + x) * 4 + 3] = 255;
  }
  return { img: { data, width: W, height: H }, what };
}
const share = (mask, what, W, H, kind) => { let n = 0, inK = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (what(x) === kind) { n++; if (mask[y * W + x]) inK++; } return inK / n; };

test('a tap on the wall fills the wall, in light and shade, and stops at the trim', () => {
  const { img, what } = room(), P = PP.prep(img), r = PP.fill(P, 40, 70, 0.5);
  assert.ok(share(r.mask, what, 200, 150, 'wall') > 0.97, 'the whole wall: ' + share(r.mask, what, 200, 150, 'wall'));
  assert.ok(share(r.mask, what, 200, 150, 'trim') < 0.05 && share(r.mask, what, 200, 150, 'door') === 0, 'not the trim or the door');
});
test('the painted wall is the paint color, keeps its light and shadow, and nothing else changes', () => {
  const { img } = room(), P = PP.prep(img), r = PP.fill(P, 40, 70, 0.5);
  const out = PP.render(P, img, [{ mask: r.mask, hex: '6BC0CE', ref: r.ref }]);
  const px = (d, x, y) => [0, 1, 2].map(c => d[(y * 200 + x) * 4 + c]);
  const left = px(out.data, 10, 70), right = px(out.data, 110, 70);
  assert.ok(left[2] > left[0] + 40 && left[1] > left[0] + 40, 'teal: ' + left);
  assert.ok(left[1] > right[1] + 15, 'still lighter near the light: ' + left + ' vs ' + right);
  assert.deepEqual(px(out.data, 180, 70), px(img.data, 180, 70), 'the door is untouched');
  // the brightest part of the wall shows close to the chip itself
  const want = [0x6b, 0xc0, 0xce], got = px(out.data, 4, 70);
  assert.ok(got.every((v, i) => Math.abs(v - want[i]) < 30), 'near the chip in full light: ' + got);
});
test('a grainy wall: more spread takes in more of it; the door stays out', () => {
  const { img, what } = room({ grain: 0.16 }), P = PP.prep(img);
  const tight = PP.fill(P, 40, 70, 0), loose = PP.fill(P, 40, 70, 1);
  const a = share(tight.mask, what, 200, 150, 'wall'), b = share(loose.mask, what, 200, 150, 'wall');
  assert.ok(b >= a && b > 0.9, `tight ${a.toFixed(2)}, loose ${b.toFixed(2)}`);
  assert.equal(share(loose.mask, what, 200, 150, 'door'), 0);
});
