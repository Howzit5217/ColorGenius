/* ColorGenius QR codes: turns a link into a QR code, with no outside service, so it works offline.
   Byte mode, error correction level M (about 15% of a damaged or dirty code can still be read), versions 1 to 20
   (up to 666 characters), the smallest version that fits, and the mask that scans best.
   CG.qr.make(text) -> { size, dark(x, y) }    CG.qr.svg(text, opts) -> an <svg> string */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CG = root.CG || {}; root.CG.qr = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // level M, per version: [error-correction codewords per block, [blocks, data codewords each], [blocks, data codewords each]]
  const BLOCKS = [null,
    [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
    [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]],
    [30, [1, 50], [4, 51]], [22, [6, 36], [2, 37]], [22, [8, 37], [1, 38]], [24, [4, 40], [5, 41]], [24, [5, 41], [5, 42]],
    [28, [7, 45], [3, 46]], [28, [10, 46], [1, 47]], [26, [9, 43], [4, 44]], [26, [3, 44], [11, 45]], [26, [3, 41], [13, 42]]];
  // where the small square alignment patterns go, per version
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
    [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90]];
  const dataCodewords = v => BLOCKS[v].slice(1).reduce((s, [n, d]) => s + n * d, 0);

  // ---- arithmetic in GF(256), for the Reed-Solomon error correction ----
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsGenerator(n) {   // (x - a^0)(x - a^1)...(x - a^(n-1)), highest power first
    let g = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
      g = next;
    }
    return g;
  }
  function rsRemainder(data, n) {
    const g = rsGenerator(n), r = data.concat(new Array(n).fill(0));
    for (let i = 0; i < data.length; i++) { const c = r[i]; if (c) for (let j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], c); }
    return r.slice(data.length);
  }

  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    return Array.from(unescape(encodeURIComponent(text)), c => c.charCodeAt(0));
  }

  // the message as codewords: mode, length, the bytes, an end marker and padding, then split into blocks with
  // error correction and interleaved
  function codewords(bytes, v) {
    const bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4); put(bytes.length, v <= 9 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(v) * 8;
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((s, b) => (s << 1) | b, 0));
    for (let pad = 0xEC; data.length < dataCodewords(v); pad ^= 0xEC ^ 0x11) data.push(pad);
    const [ec, ...groups] = BLOCKS[v], blocks = [];
    let k = 0;
    for (const [n, d] of groups) for (let i = 0; i < n; i++) { const part = data.slice(k, k + d); k += d; blocks.push({ data: part, ec: rsRemainder(part, ec) }); }
    const out = [], most = Math.max(...blocks.map(b => b.data.length));
    for (let i = 0; i < most; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
    for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.ec[i]);
    return out;
  }

  function make(text) {
    const bytes = utf8(String(text));
    let v = 1;
    while (v <= 20 && 4 + (v <= 9 ? 8 : 16) + bytes.length * 8 > dataCodewords(v) * 8) v++;
    if (v > 20) throw new Error('Too long for a QR code');
    const size = v * 4 + 17;
    const mods = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { mods[y][x] = !!dark; fn[y][x] = true; };

    // timing lines, the three finder squares, the alignment squares
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy)); if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = ALIGN[v], na = al.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    // the format bits (level M and the mask), in both places, and the one always-dark module
    const format = mask => {
      const data = (0 << 3) | mask;   // level M is 00
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412, bit = i => (bits >>> i) & 1;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    format(0);
    // the version, from version 7 up
    if (v >= 7) {
      let rem = v;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (v << 12) | rem;
      for (let i = 0; i < 18; i++) { const b = (bits >>> i) & 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, b); set(c, a, b); }
    }
    // the codewords, in the up-and-down zigzag from the bottom right, two columns at a time
    const cw = codewords(bytes, v);
    let n = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (fn[y][x]) continue;
        if (n < cw.length * 8) mods[y][x] = ((cw[n >>> 3] >>> (7 - (n & 7))) & 1) === 1;
        n++;
      }
    }
    // the mask: tried all eight, kept the one with the fewest patterns that confuse a scanner
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
    const flip = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mods[y][x] = !mods[y][x]; };
    let best = 0, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      flip(m); format(m);
      const s = penalty(mods, size);
      if (s < bestScore) { bestScore = s; best = m; }
      flip(m);
    }
    flip(best); format(best);
    return { size, version: v, mask: best, modules: mods, isFunction: fn, dark: (x, y) => mods[y][x] };
  }

  function penalty(m, size) {
    let s = 0;
    const lines = [];
    for (let y = 0; y < size; y++) lines.push(m[y]);
    for (let x = 0; x < size; x++) lines.push(m.map(r => r[x]));
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) run++;
        else { if (run >= 5) s += 3 + (run - 5); run = 1; }
      }
      // finder-like 1:1:3:1:1 runs with four light modules on one side
      for (let i = 0; i + 7 <= size; i++) {
        const p = [1, 0, 1, 1, 1, 0, 1].every((b, k) => line[i + k] === !!b);
        if (!p) continue;
        const before = i >= 4 && [1, 2, 3, 4].every(k => !line[i - k]);
        const after = i + 11 <= size && [7, 8, 9, 10].every(k => !line[i + k]);
        if (before || after) s += 40;
      }
    }
    for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) s += 3; }
    let dark = 0; for (const r of m) for (const c of r) if (c) dark++;
    s += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return s;
  }

  // a crisp, scalable picture of the code, with the quiet border scanners need
  function svg(text, opts) {
    opts = opts || {};
    const q = make(text), quiet = opts.quiet == null ? 4 : opts.quiet, n = q.size + quiet * 2;
    let d = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"${opts.label ? ` role="img" aria-label="${opts.label}"` : ' aria-hidden="true"'}><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  return { make, svg, _internal: { BLOCKS, ALIGN, rsRemainder, EXP, LOG, mul, dataCodewords } };
});
