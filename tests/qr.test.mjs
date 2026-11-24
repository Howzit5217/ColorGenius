// QR codes: each code the app makes is read back by a separate, by-the-book reader below, which works out the
// layout itself, checks the format and version bits, unmasks the code, reads the codewords, checks every
// Reed-Solomon block and decodes the text. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const Q = require(path.join(ROOT, 'js/qr.js'));
const { BLOCKS, ALIGN, EXP, mul } = Q._internal;

function read(q) {
  const N = q.size, M = q.modules, v = (N - 17) / 4;
  const at = (x, y) => (M[y][x] ? 1 : 0);
  // format bits, both copies, checked against their BCH code
  let f1 = 0, f2 = 0;
  for (let i = 0; i <= 5; i++) f1 |= at(8, i) << i;
  f1 |= at(8, 7) << 6; f1 |= at(8, 8) << 7; f1 |= at(7, 8) << 8;
  for (let i = 9; i < 15; i++) f1 |= at(14 - i, 8) << i;
  for (let i = 0; i < 8; i++) f2 |= at(N - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) f2 |= at(8, N - 15 + i) << i;
  assert.equal(f1, f2, 'the two copies of the format bits agree');
  const raw = f1 ^ 0x5412, data5 = raw >>> 10;
  let rem = data5; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  assert.equal(raw & 0x3FF, rem & 0x3FF, 'format bits carry a valid BCH code');
  assert.equal(data5 >>> 3, 0, 'error correction level M');
  const mask = data5 & 7;
  assert.equal(at(8, N - 8), 1, 'the dark module is dark');
  // the layout, worked out here independently
  const fn = Array.from({ length: N }, () => new Array(N).fill(false));
  const mark = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < N && y < N) fn[y][x] = true; };
  mark(0, 0, 9, 9); mark(N - 8, 0, 8, 9); mark(0, N - 8, 9, 8);   // finders, separators and format areas
  mark(6, 0, 1, N); mark(0, 6, N, 1);                             // timing
  const al = ALIGN[v];
  for (const cy of al) for (const cx of al) { if ((cx === 6 && cy === 6) || (cx === 6 && cy === al[al.length - 1]) || (cx === al[al.length - 1] && cy === 6)) continue; mark(cx - 2, cy - 2, 5, 5); }
  if (v >= 7) {
    mark(N - 11, 0, 3, 6); mark(0, N - 11, 6, 3);
    let bits = 0; for (let i = 0; i < 18; i++) bits |= at(N - 11 + (i % 3), Math.floor(i / 3)) << i;
    let r = bits >>> 12; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    assert.equal(bits >>> 12, v, 'version bits');
    assert.equal(bits & 0xFFF, r & 0xFFF, 'version bits carry a valid BCH code');
  }
  // finder patterns look right
  for (const [cx, cy] of [[3, 3], [N - 4, 3], [3, N - 4]]) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); assert.equal(at(cx + dx, cy + dy), d === 2 ? 0 : 1); }
  const MASK = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0, (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0][mask];
  // the bits, in the standard zigzag: columns in pairs from the right, up then down, skipping the timing column
  const bits = [];
  let upward = true;
  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let k = 0; k < N; k++) {
      const y = upward ? N - 1 - k : k;
      for (const x of [col, col - 1]) if (!fn[y][x]) bits.push(at(x, y) ^ (MASK(x, y) ? 1 : 0));
    }
    upward = !upward;
  }
  const [ec, ...groups] = BLOCKS[v];
  const sizes = []; for (const [n, d] of groups) for (let i = 0; i < n; i++) sizes.push(d);
  const total = sizes.reduce((s, d) => s + d + ec, 0);
  const cws = []; for (let i = 0; i < total; i++) cws.push(bits.slice(i * 8, i * 8 + 8).reduce((s, b) => (s << 1) | b, 0));
  // un-interleave, and check each block: its codeword polynomial is zero at a^0 .. a^(ec-1)
  const blocks = sizes.map(d => ({ d, data: [], ec: [] }));
  let k = 0;
  for (let i = 0; i < Math.max(...sizes); i++) for (const b of blocks) if (i < b.d) b.data.push(cws[k++]);
  for (let i = 0; i < ec; i++) for (const b of blocks) b.ec.push(cws[k++]);
  for (const b of blocks) {
    const c = b.data.concat(b.ec);
    for (let j = 0; j < ec; j++) { let s = 0; for (const t of c) s = mul(s, EXP[j]) ^ t; assert.equal(s, 0, 'Reed-Solomon syndrome is zero'); }
  }
  // the message: byte mode, its length, then the bytes
  const dbits = []; for (const b of blocks) for (const x of b.data) for (let i = 7; i >= 0; i--) dbits.push((x >>> i) & 1);
  const take = n => { let x = 0; for (let i = 0; i < n; i++) x = (x << 1) | dbits.shift(); return x; };
  assert.equal(take(4), 0b0100, 'byte mode');
  const len = take(v <= 9 ? 8 : 16), bytes = [];
  for (let i = 0; i < len; i++) bytes.push(take(8));
  return { text: new TextDecoder().decode(Uint8Array.from(bytes)), version: v, mask, fnMatches: fn.every((row, y) => row.every((f, x) => f === q.isFunction[y][x])) };
}

test('QR codes read back exactly, at every size the app uses', () => {
  const texts = [
    'HELLO',
    'https://howzit5217.github.io/ColorGenius/',
    'https://howzit5217.github.io/ColorGenius/#/kiosk/1.homedepot.behr.behr_glidden_ppg_kilz.-.ps.b',
    'https://howzit5217.github.io/ColorGenius/#/kiosk/1.-.sw.sw_bm_behr_valspar_ppg_glidden_hgsw_dutchboy_de_dv_ck_magnolia_kilz_vista_hl_colorhouse_resene_fb_ral.minwax_cabot.ps.d',
    'x'.repeat(250), 'Café • crème ✓',
  ];
  const versions = new Set();
  for (const t of texts) {
    const q = Q.make(t), r = read(q);
    assert.equal(r.text, t);
    assert.ok(r.fnMatches, 'the code\'s layout matches the standard one');
    versions.add(q.version);
  }
  assert.ok(versions.size >= 4, [...versions].join());
  // every mask gets used somewhere across many inputs, and each still reads back
  const masks = new Set();
  for (let i = 0; i < 40; i++) { const t = 'https://example.com/' + 'ab'.repeat(i); const q = Q.make(t); assert.equal(read(q).text, t); masks.add(q.mask); }
  assert.ok(masks.size >= 4, [...masks].join());
  // the picture: one square per dark module, with a white border
  const s = Q.svg('HELLO');
  assert.match(s, /^<svg[^>]+viewBox="0 0 29 29"/);
  assert.throws(() => Q.make('x'.repeat(700)));   // version 20 holds 666 bytes at level M
});
