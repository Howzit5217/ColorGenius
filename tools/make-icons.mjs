// Draws the ColorGenius app icons (a fan of three paint chips) as PNGs with no dependencies.
// Usage: node tools/make-icons.mjs   -> writes icons/*.png
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'icons');
fs.mkdirSync(OUT, { recursive: true });

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

// signed distance to a rounded rectangle centred at the origin
function sdRoundRect(px, py, hw, hh, r) {
  const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function draw(size, { scale = 1, bg = 'F3F3F2', rounded = false }) {
  const S = 4; // supersampling per axis
  const buf = Buffer.alloc(size * size * 4);
  const u = size / 100; // design units: a 100 x 100 canvas
  // three chips, pivoting near their bottom like the fan in the app's wordmark
  const chipW = 26 * scale, chipH = 62 * scale, rad = 5 * scale;
  const pivot = [50, 50 + 31 * scale];
  const chips = [
    { a: -26, c: 'D8CBB7' }, { a: 26, c: '2F3B4C' }, { a: 0, c: '6F8F85' },
  ];
  const bgc = hex(bg);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const X = (x + (sx + 0.5) / S) / u, Y = (y + (sy + 0.5) / S) / u;
      let col = bgc.slice(); let alpha = 1;
      if (rounded) { const d = sdRoundRect(X - 50, Y - 50, 50, 50, 22); if (d > 0) alpha = 0; }
      for (const ch of chips) {
        const t = -ch.a * Math.PI / 180;
        // rotate the sample point around the pivot, then test against an upright chip
        const dx = X - pivot[0], dy = Y - pivot[1];
        const lx = dx * Math.cos(t) - dy * Math.sin(t), ly = dx * Math.sin(t) + dy * Math.cos(t);
        const cy = -chipH / 2 + 3 * scale; // chip centre sits above the pivot
        // soft shadow under each chip
        const ds = sdRoundRect(lx - 0.6 * scale, ly - cy - 1.6 * scale, chipW / 2, chipH / 2, rad);
        if (ds < 1.6 * scale) { const k = 0.16 * Math.min(1, (1.6 * scale - ds) / (1.6 * scale)); col = col.map(v => v * (1 - k)); }
        const d = sdRoundRect(lx, ly - cy, chipW / 2, chipH / 2, rad);
        if (d < 0) col = hex(ch.c);
      }
      acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]; acc[3] += alpha * 255;
    }
    const i = (y * size + x) * 4, n = S * S;
    buf[i] = Math.round(acc[0] / n); buf[i + 1] = Math.round(acc[1] / n); buf[i + 2] = Math.round(acc[2] / n); buf[i + 3] = Math.round(acc[3] / n);
  }
  return png(size, buf);
}

const jobs = [
  ['icon-192.png', 192, { scale: 0.92 }],
  ['icon-512.png', 512, { scale: 0.92 }],
  ['icon-maskable-512.png', 512, { scale: 0.68 }], // Android masks to a circle or squircle; keep inside the safe zone
  ['apple-touch-icon.png', 180, { scale: 0.86 }], // iOS rounds the corners itself
  ['favicon-64.png', 64, { scale: 0.95, bg: 'F3F3F2', rounded: true }],
];
for (const [name, size, opts] of jobs) { fs.writeFileSync(path.join(OUT, name), draw(size, opts)); console.log('wrote icons/' + name); }
