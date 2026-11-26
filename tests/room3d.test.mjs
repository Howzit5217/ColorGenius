// The 3D rooms and houses: no gaps to see through, and what the turning camera checks against.
// (The full check, turning the camera to thousands of spots in every scene and looking for holes, runs in a browser;
// this one needs no WebGL.) Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
globalThis.window = globalThis;
require(path.join(ROOT, 'js/color.js'));
require(path.join(ROOT, 'js/wood.js'));
require(path.join(ROOT, 'js/room3d.js'));
const R = globalThis.CG.room3d;

const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
// lines out every way from a spot, evenly spread
const sphere = n => { const out = [], ga = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y); out.push([Math.cos(i * ga) * r, y, Math.sin(i * ga) * r]); } return out; };
const ROOMS = R.scenes().filter(id => { const i = R.build(id).info; return !i.outside && !i.studio; });

test('the camera checks: a line meets a box from the front outside it and from behind inside it, and knows what is near', () => {
  const { b } = R.build('living');
  const col = R.collider(b);
  assert.ok(col.faces > 1000, col.faces + ' faces');
  // from the middle of the living room, straight up: the ceiling, met from the front
  const up = col.ray([0.1, 1.5, 0.05], norm([0.01, 1, 0.012]), 50);
  assert.ok(up && !up.back && Math.abs(up.t - 1.2) < 0.01, JSON.stringify(up));
  // nothing within 30 cm of the middle of the room; the floor is within 30 cm of a spot 20 cm above it
  assert.equal(col.near([0.1, 1.5, 0.3], 0.3), false);
  assert.equal(col.near([0.1, 0.2, 1.8], 0.3), true);
  // inside the sofa's base: the way out (down) meets its own bottom from behind
  const out = col.ray([0.25, 0.3, -1.9], norm([0.01, -1, 0.012]), 5);
  assert.ok(out && out.back, 'inside the sofa: ' + JSON.stringify(out));
});

test('every room is closed all round: from the middle of it, no line gets out through a gap', () => {
  const dirs = sphere(3000);
  for (const id of ROOMS) {
    for (const opts of [{}, { show: ['wain'], answers: { crown: true }, layout: { wins: ['left', 'back', 'right'] } }]) {
      const { b } = R.build(id, opts);
      const col = R.collider(b), rm = b.room;
      assert.ok(rm, id + ' has no room');
      const cx = (rm.min[0] + rm.max[0]) / 2, cz = (rm.min[2] + rm.max[2]) / 2;
      for (const o of [[cx, 1.6, cz], [cx + 0.6, 1.5, cz + 0.5], [cx - 0.7, 1.7, cz - 0.4]]) {
        let lost = 0, inside = 0;
        for (const d of dirs) {
          const h = col.ray(o, d, 100);
          if (!h) lost++;
          else if (h.back && !h.both) inside++;
        }
        assert.equal(inside, 0, `${id} ${JSON.stringify(opts)}: the spot ${o.map(v => v.toFixed(2))} is inside something`);
        assert.equal(lost, 0, `${id} ${JSON.stringify(opts)}: ${lost} of ${dirs.length} lines from ${o.map(v => v.toFixed(2))} got out of the room`);
      }
    }
  }
});

test('a door is lined all round, so nothing shows past it at an angle', () => {
  // lines from just inside the opening, between the wall and the door set back in it, out to its sides, its head and
  // the floor under it: each meets the lining (a line that got out would show the empty space past the door)
  const { b } = R.build('living', { layout: { wins: ['left'] } });
  const col = R.collider(b);
  // (that door is on the right wall, x = 2.7, centered 2.6 m along it from the back: z = 0.2, 0.86 wide, 2.05 tall)
  for (const [y, z] of [[1.0, 0.2], [0.3, -0.05], [1.9, 0.45]]) {
    for (const d of [[0, 0.002, 1], [0, 0.002, -1], [0, 1, 0.003], [0, -1, 0.003]]) {
      const h = col.ray([2.71, y, z], norm(d), 10);
      assert.ok(h && h.t < 1.2, `a line from the door at y ${y}, z ${z} toward ${d} got out`);
    }
  }
});

test('every scene builds, and each face knows whether it is drawn from both sides', () => {
  for (const id of R.scenes()) {
    const { b, info } = R.build(id);
    assert.ok(info.cam && info.cam.eye && info.cam.target, id + ' has a camera');
    for (const [name, g] of Object.entries(b.groups)) {
      if (name === 'curtain' || /curtain/.test(name)) continue;
      assert.equal(g.o.length, g.i.length / 3, `${id}: ${name} has a side for every face`);
    }
  }
});

test('a new color rolls on once, and quick changes don’t start the roller over or cut it short', () => {
  const { rollOn, rollAt, ROLL } = R;
  // the first change: a sweep from the color that was there
  const a = rollOn(null, 1000, { wall: ['D1CBC1', 'E3DDD3'] }, 0);
  assert.deepEqual(a.prev, { wall: 'D1CBC1' }); assert.equal(a.start, 1000);
  // another tap early in the sweep: the same sweep keeps going, with what was there before still ahead of it
  const b = rollOn(a, 1300, { wall: ['E3DDD3', 'EFEBE4'], trim: ['F2F1EC', 'FFFFFF'] }, 1000);
  assert.equal(b, a); assert.equal(b.start, 1000); assert.equal(b.prev.wall, 'D1CBC1');
  assert.equal(b.prev.trim, 'F2F1EC', 'a part that joins in starts from its own color');
  // a tap late in the sweep starts a new one from what's mostly showing
  const c = rollOn(a, 1700, { wall: ['EFEBE4', 'C6C0B6'] }, 1300);
  assert.notEqual(c, a); assert.equal(c.start, 1700); assert.deepEqual(c.prev, { wall: 'EFEBE4' });
  // a color being dragged: late in the sweep it still keeps going; once it's done, the colors just show
  const d = rollOn(a, 1700, { wall: ['EFEBE4', 'C6C0B6'] }, 1650);
  assert.equal(d, a);
  assert.equal(rollOn(a, 1000 + ROLL.dur + 50, { wall: ['C6C0B6', 'B9B2A6'] }, 1000 + ROLL.dur), null);
  // after a pause, a new change rolls again; nothing changed keeps whatever is running
  assert.ok(rollOn(null, 5000, { wall: ['B9B2A6', 'D1CBC1'] }, 4000));
  assert.equal(rollOn(a, 1200, {}, 1100), a);
  // the roller's spot: starts at the edge, eases across, ends at the other side
  assert.equal(rollAt(a, 1000).k, 0); assert.equal(rollAt(a, 900).k, 0);
  assert.ok(Math.abs(rollAt(a, 1000 + ROLL.dur / 2).k - 0.5) < 1e-9);
  assert.equal(rollAt(a, 1000 + ROLL.dur).t, 1);
});
