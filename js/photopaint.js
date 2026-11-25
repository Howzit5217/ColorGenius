/* ColorGenius: paint a photo of your own room. Tap a wall and it fills with the paint color, keeping the photo's
   own light and shadow, and stopping at edges (trim, furniture, the ceiling line). Nothing leaves the device.
   CG.photopaint.prep(imageData) -> what the fills need; fill(prep, x, y, spread) -> the part tapped;
   render(prep, original, regions) -> the painted picture. Works on plain pixel arrays, so it can be tested. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CG = root.CG || {}; root.CG.photopaint = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LIN = new Float32Array(256);
  for (let v = 0; v < 256; v++) { const x = v / 255; LIN[v] = x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
  const ENC = new Uint8ClampedArray(4097);
  for (let i = 0; i <= 4096; i++) { const v = i / 4096; ENC[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
  const enc = v => ENC[Math.max(0, Math.min(4096, Math.round(v * 4096)))];
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const hexLin = hex => [0, 2, 4].map(i => LIN[parseInt(hex.slice(i, i + 2), 16)]);

  // Each pixel's Lab color and brightness, and how sharp the change is around it (an edge), from a 3×3 blur of the
  // lightness so paper-fine texture isn't taken for an edge.
  function prep(img) {
    const W = img.width, H = img.height, d = img.data, n = W * H;
    const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n), Y = new Float32Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const r = LIN[d[i]], g = LIN[d[i + 1]], b = LIN[d[i + 2]];
      const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
      const fy = f(y);
      L[p] = 116 * fy - 16; A[p] = 500 * (f(X) - fy); B[p] = 200 * (fy - f(Z)); Y[p] = y;
    }
    const S = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, c = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; s += L[yy * W + xx]; c++; }
      S[y * W + x] = s / c;
    }
    const E = new Float32Array(n);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      const gx = S[p - W + 1] + 2 * S[p + 1] + S[p + W + 1] - S[p - W - 1] - 2 * S[p - 1] - S[p + W - 1];
      const gy = S[p + W - 1] + 2 * S[p + W] + S[p + W + 1] - S[p - W - 1] - 2 * S[p - W] - S[p - W + 1];
      E[p] = Math.hypot(gx, gy) / 8;
    }
    // how bright the picture is: its brightest parts (a white ceiling, trim, a window) stand for "full light"
    const sorted = Float32Array.from(Y).sort();
    const bright = sorted[Math.floor(n * 0.95)] || 1;
    return { W, H, L, A, B, Y, E, bright };
  }

  // The part of the picture that's one surface with the tapped spot. It grows outward while each next pixel is
  // close to the one it came from (so light falling off across a wall is followed) and to the color where it
  // started (so it can't creep into another color a little at a time), and stops at sharp edges. Brightness counts
  // for less than color: one wall in light and shade is still one wall. spread: 0 (tight) to 1 (loose).
  function fill(P, x0, y0, spread) {
    const { W, H, L, A, B, E } = P, n = W * H;
    x0 = Math.max(0, Math.min(W - 1, Math.round(x0))); y0 = Math.max(0, Math.min(H - 1, Math.round(y0)));
    const s = spread == null ? 0.5 : Math.max(0, Math.min(1, spread));
    const near = 2.2 + 3.5 * s, far = 9 + 18 * s, edge = 2.5 + 5 * s;
    // the starting color: the middle of the spots around the tap (one odd pixel doesn't decide)
    let sL = 0, sA = 0, sB = 0, c = 0;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const xx = x0 + i, yy = y0 + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const p = yy * W + xx; sL += L[p]; sA += A[p]; sB += B[p]; c++; }
    sL /= c; sA /= c; sB /= c;
    const dist = (p, l, a, b, kL) => Math.sqrt((L[p] - l) * (L[p] - l) * kL + (A[p] - a) * (A[p] - a) + (B[p] - b) * (B[p] - b));
    const mask = new Uint8Array(n), queue = new Int32Array(n);
    let head = 0, tail = 0;
    const start = y0 * W + x0;
    mask[start] = 1; queue[tail++] = start;
    while (head < tail) {
      const p = queue[head++], px = p % W;
      const nb = [px > 0 ? p - 1 : -1, px < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p < n - W ? p + W : -1];
      for (const q of nb) {
        if (q < 0 || mask[q]) continue;
        if (E[q] > edge) continue;
        if (dist(q, L[p], A[p], B[p], 0.6) > near) continue;
        if (dist(q, sL, sA, sB, 0.12) > far) continue;
        mask[q] = 1; queue[tail++] = q;
      }
    }
    // close up pinholes (paper-fine texture, a speck of glare) without growing past the edges
    const out = Uint8Array.from(mask);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x; if (mask[p]) continue;
      const k = mask[p - 1] + mask[p + 1] + mask[p - W] + mask[p + W];
      if (k >= 3) out[p] = 1;
    }
    // the surface's own brightness in full light (its brighter tenth), the scale for its light and shadow
    const ys = [];
    for (let p = 0; p < n; p += 2) if (out[p]) ys.push(P.Y[p]);   // (every other pixel is plenty)
    ys.sort((a, b) => a - b);
    const ref = ys.length ? ys[Math.floor(ys.length * 0.9)] : 1;
    return { mask: out, ref: Math.max(1e-4, ref), size: ys.length };
  }

  // The painted picture: each surface's pixels become the paint color, as light and as shaded as the photo had
  // them there (its own brightness against its brightest part), scaled to how bright the picture is overall. The
  // edges of each surface blend half and half, so they don't look cut out.
  function render(P, orig, regions) {
    const { W, H, Y } = P, n = W * H, src = orig.data;
    const out = new Uint8ClampedArray(src);
    const expo = Math.max(0.3, Math.min(1.15, P.bright / 0.8));
    for (const r of regions) {
      const paint = hexLin(r.hex), m = r.mask;
      for (let p = 0; p < n; p++) {
        if (!m[p]) continue;
        const shade = Math.max(0.08, Math.min(1.6, Y[p] / r.ref)) * expo;
        const x = p % W, y = (p - x) / W;
        const inside = (x > 0 ? m[p - 1] : 1) & (x < W - 1 ? m[p + 1] : 1) & (y > 0 ? m[p - W] : 1) & (y < H - 1 ? m[p + W] : 1);
        const i = p * 4;
        for (let k = 0; k < 3; k++) {
          const v = enc(paint[k] * shade);
          out[i + k] = inside ? v : (v + out[i + k]) >> 1;
        }
      }
    }
    return { data: out, width: W, height: H };
  }
  return { prep, fill, render, hexLin };
});
