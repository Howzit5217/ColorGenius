/* ColorGenius camera color match: the math, apart from the screen, so it can be tested on made-up pictures.

   A camera can't see true color by itself: it keeps changing how bright and how warm the picture is, and every
   phone adds its own contrast. So the color is read against plain white paper in the same picture, under the same
   light: color ÷ paper, times how much light paper reflects. Getting that right takes four things:
   1. The paper's light AT the color. The phone's light makes a bright spot that fades outward, so paper off to one
      side isn't lit like the color. With the color lying on the paper ("on paper"), the paper all around it is
      read in eight places, each just past the color's own edge, and a smooth surface fitted through them gives the
      light right where the color is. On a wall, a sheet held beside the color is used, carried over by its slope.
   2. Paper the camera hasn't washed out. Too bright, and the paper hits the camera's top, reads dimmer than it is,
      and every color comes out too light. That is refused (and phones that can turn their exposure down do).
   3. Only the color's even middle: shadows, shine and texture are left out.
   4. Optionally, the phone's own contrast: tuned once with a chip whose color is known.
   CG.cammatch.analyze(frame, layout, opts) -> one reading. combine(readings) -> the color. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CG = root.CG || {}; root.CG.cammatch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PAPER = 0.86;   // how much light plain white copy paper reflects (about L* 94)
  const LIN = new Float64Array(256);
  for (let v = 0; v < 256; v++) { const x = v / 255; LIN[v] = x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
  const toEnc = v => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const hexOf = lin => lin.map(v => toEnc(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const linOf = hex => [0, 2, 4].map(i => LIN[parseInt(hex.slice(i, i + 2), 16)]);
  // CIE Lab (D65), for how far apart two readings are
  function lab(lin) {
    const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047, Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2], Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // a rectangle of the picture: its even part (between the lo and hi share of pixels, darkest to brightest), how
  // many pixels are at the camera's top, how much is much brighter than the rest (shine), and how even it is
  function patch(f, r, lo, hi) {
    const W = f.width, H = f.height, d = f.data;
    const x0 = Math.max(0, Math.floor(r.x0)), x1 = Math.min(W, Math.ceil(r.x1)), y0 = Math.max(0, Math.floor(r.y0)), y1 = Math.min(H, Math.ceil(r.y1));
    if (x1 - x0 < 2 || y1 - y0 < 2) return null;
    const px = [], tops = [];
    let clip = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4, m = Math.max(d[i], d[i + 1], d[i + 2]);
      const c = [LIN[d[i]], LIN[d[i + 1]], LIN[d[i + 2]]];
      px.push({ c, y: lum(c), x, yy: y }); tops.push(m);
      if (m >= 250) clip++;
    }
    const n = px.length;
    px.sort((p, q) => p.y - q.y); tops.sort((p, q) => p - q);
    const med = px[n >> 1].y;
    const keep = px.slice(Math.floor(n * lo), Math.max(Math.floor(n * lo) + 1, Math.ceil(n * hi)));
    const avg = [0, 1, 2].map(k => keep.reduce((s, p) => s + p.c[k], 0) / keep.length);
    const mean = lum(avg) || 1e-6;
    const spread = Math.sqrt(keep.reduce((s, p) => s + (p.y - mean) * (p.y - mean), 0) / keep.length) / mean;
    let hn = 0, hx = 0, hy = 0;
    for (const p of px) if (p.y > med * 1.6 + 0.02) { hn++; hx += p.x; hy += p.yy; }
    return { avg, L: mean, n, clip: clip / n, top: tops[Math.floor(n * 0.9)], spread, hot: hn / n, hotAt: hn ? { x: hx / hn, y: hy / hn, r: Math.sqrt(hn / Math.PI) } : null };
  }
  // a small average at one spot, for following a line outward
  function spot(f, x, y, s) {
    const W = f.width, H = f.height, d = f.data, c = [0, 0, 0]; let n = 0;
    for (let yy = Math.round(y - s); yy <= Math.round(y + s); yy++) for (let xx = Math.round(x - s); xx <= Math.round(x + s); xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = (yy * W + xx) * 4; c[0] += LIN[d[i]]; c[1] += LIN[d[i + 1]]; c[2] += LIN[d[i + 2]]; n++;
    }
    return n ? c.map(v => v / n) : null;
  }
  const chroma = c => { const l = lum(c) || 1e-6; return c.map(v => v / l); };
  const chromaGap = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

  // Least squares for a few unknowns (normal equations, Gaussian elimination)
  function solve(rows, ys) {
    const k = rows[0].length, A = Array.from({ length: k }, () => new Array(k).fill(0)), B = new Array(k).fill(0);
    rows.forEach((f, r) => { for (let i = 0; i < k; i++) { B[i] += f[i] * ys[r]; for (let j = 0; j < k; j++) A[i][j] += f[i] * f[j]; } });
    for (let i = 0; i < k; i++) {
      let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      if (Math.abs(A[p][i]) < 1e-12) return null;
      [A[i], A[p]] = [A[p], A[i]]; [B[i], B[p]] = [B[p], B[i]];
      for (let r = 0; r < k; r++) if (r !== i) { const q = A[r][i] / A[i][i]; for (let j = i; j < k; j++) A[r][j] -= q * A[i][j]; B[r] -= q * B[i]; }
    }
    return B.map((b, i) => b / A[i][i]);
  }

  // The paper all around the color, in eight directions. Each line outward first crosses the color's own edge (a
  // sudden jump); the paper is read a little past it. Then a smooth surface through those eight readings gives the
  // paper's light at the color's middle, even with the phone's light making a bright spot off to one side.
  function ringWhite(f, box, col) {
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, hw = (box.x1 - box.x0) / 2, hh = (box.y1 - box.y0) / 2;
    const m = Math.min(hw, hh) * 2, t = Math.max(3, m * 0.26), reach = m * 1.6, step = Math.max(1, m / 40);
    const cc = chroma(col.avg), Lc = col.L, out = [];
    for (let a = 0; a < 8; a++) {
      const ang = a * Math.PI / 4, ux = Math.round(Math.cos(ang) * 1e6) / 1e6, uy = Math.round(Math.sin(ang) * 1e6) / 1e6;
      const s0 = Math.min(ux ? hw / Math.abs(ux) : Infinity, uy ? hh / Math.abs(uy) : Infinity);
      // follow the line out from inside the box; the color's edge is where the tint stops being the color's, or the
      // brightness breaks from the steady change it had just before (so the light's smooth fall-off across the
      // color isn't taken for an edge, but a soft real edge is)
      const back = [];
      let edge = -1;
      for (let s = s0 * 0.5; s < s0 + reach; s += step) {
        const c = spot(f, cx + ux * s, cy + uy * s, Math.max(1, m * 0.04)); if (!c) break;
        const lc = Math.log(Math.max(1e-6, lum(c)));
        let jump = 0;
        if (back.length >= 8) { const a = back[back.length - 8], b = back[back.length - 4]; jump = lc - (2 * b - a); }
        if (chromaGap(chroma(c), cc) > 0.03 || Math.abs(jump) > 0.045) { edge = s; break; }
        back.push(lc);
      }
      const found = edge > 0;
      // two readings each way, one just past the edge and one farther out: how the light changes with distance
      // tells how much it curves toward the middle
      const d1 = (found ? edge + m * 0.06 : s0 + m * 0.14) + t / 2;
      for (const d of [d1, d1 + t * 1.15]) {
        const px = cx + ux * d, py = cy + uy * d;
        const p = patch(f, { x0: px - t / 2, y0: py - t / 2, x1: px + t / 2, y1: py + t / 2 }, 0.45, 0.9);
        if (p && p.n > t * t * 0.6) out.push({ u: (px - cx) / m, v: (py - cy) / m, avg: p.avg, L: p.L, clip: p.clip, top: p.top, found });
      }
    }
    if (!out.length) return null;
    // washed out: most of the paper at the camera's top
    if (out.filter(s => s.clip > 0.35).length * 2 >= out.length) return { ok: false, clipped: true, sectors: out, top: 255, clip: 1 };
    // paper: different from the color (brighter, or another tint). Past an edge that was found, a little is enough;
    // where no edge turned up, it has to be clearly different, or it may just be more of the color.
    let cand = out.filter(s => s.clip <= 0.35 && (s.L > Lc * (s.found ? 1.03 : 1.07) || chromaGap(chroma(s.avg), cc) > (s.found ? 0.03 : 0.05)));
    if (cand.length < 4) return { ok: false, sectors: out };
    // and all one tint (paper doesn't change color; a shadow only makes it dimmer)
    const ch = [0, 1, 2].map(i => cand.map(s => chroma(s.avg)[i]).sort((a, b) => a - b)[cand.length >> 1]);
    let use = cand.filter(s => chromaGap(chroma(s.avg), ch) < 0.07);
    if (use.length < 4) return { ok: false, sectors: out };
    // the light where the color is. Light falls off by a share of itself, so the fit is on its logarithm: a full
    // curved surface through seven or more readings, a bowl through five or six, a tilted plane through fewer. A
    // reading that doesn't fit (a shadow, a fold, the paper's edge) is dropped, worst first.
    const rowOf = (s, k) => (k >= 10 ? [1, s.u, s.v, s.u * s.u, s.u * s.v, s.v * s.v] : k >= 6 ? [1, s.u, s.v, s.u * s.u + s.v * s.v] : [1, s.u, s.v]);
    let sol = null, fit = 0;
    for (;;) {
      const rows = use.map(s => rowOf(s, use.length));
      sol = solve(rows, use.map(s => Math.log(Math.max(1e-6, s.L))));
      if (!sol) break;
      const res = use.map((s, i) => rows[i].reduce((q, v, j) => q + v * sol[j], 0) - Math.log(Math.max(1e-6, s.L)));
      fit = Math.sqrt(res.reduce((q, r) => q + r * r, 0) / use.length);
      if (fit <= 0.04 || use.length <= 4) break;
      const worst = res.reduce((w, r, i) => (Math.abs(r) > Math.abs(res[w]) ? i : w), 0);
      use = use.filter((_, i) => i !== worst);
    }
    const meanL = use.reduce((s, x) => s + x.L, 0) / use.length;
    let L0 = sol ? Math.exp(sol[0]) : meanL;
    if (!(L0 > meanL * 0.4 && L0 < meanL * 2.5)) L0 = meanL;
    const tint = [0, 1, 2].map(i => use.reduce((s, x) => s + chroma(x.avg)[i], 0) / use.length);
    // how uneven the light is, over all the paper (not just the readings kept), and how many had to be dropped:
    // either too much means the phone is too close for the light to be followed
    const all = cand.filter(s => chromaGap(chroma(s.avg), ch) < 0.07).map(s => s.L), allMean = all.reduce((s, x) => s + x, 0) / all.length;
    const even = Math.max((Math.max(...all) - Math.min(...all)) / allMean, use.length < all.length * 0.6 ? 1 : 0);
    return { ok: true, W: tint.map(v => v * L0), L: L0, n: use.length, even, fit, top: Math.max(...use.map(s => s.top)), clip: Math.max(...use.map(s => s.clip)), sectors: out };
  }
  // On a wall: a separate sheet of paper beside the color. Its light is carried over to the color with the slope
  // it has across itself (a 3-by-3 grid, a cell darkened by a shadow left out).
  function sideWhite(f, paper, color) {
    const P = patch(f, paper, 0.5, 0.92); if (!P) return null;
    const cells = [], w = (paper.x1 - paper.x0) / 3, h = (paper.y1 - paper.y0) / 3;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const c = patch(f, { x0: paper.x0 + i * w, y0: paper.y0 + j * h, x1: paper.x0 + (i + 1) * w, y1: paper.y0 + (j + 1) * h }, 0.5, 0.9);
      if (c) cells.push({ u: i - 1, v: j - 1, L: c.L });
    }
    const top = Math.max(...cells.map(c => c.L)), use = cells.filter(c => c.L > top * 0.75);
    let D = 0;
    if (use.length >= 5) {
      const sol = solve(use.map(c => [1, c.u, c.v]), use.map(c => c.L));
      if (sol && sol[0] > 0) {
        const pcx = (paper.x0 + paper.x1) / 2, pcy = (paper.y0 + paper.y1) / 2, ccx = (color.x0 + color.x1) / 2, ccy = (color.y0 + color.y1) / 2;
        D = Math.max(-0.3, Math.min(0.3, (sol[1] * (ccx - pcx) / w + sol[2] * (ccy - pcy) / h) / sol[0]));
      }
    }
    const Ls = use.map(c => c.L);
    return { ok: P.spread < 0.12, W: P.avg.map(v => v * (1 + D)), L: P.L * (1 + D), n: use.length, even: Math.abs(D) + (Ls.length ? (Math.max(...Ls) - Math.min(...Ls)) / P.L : 0), fit: 0, top: P.top, clip: P.clip, spread: P.spread, D };
  }

  // a phone's own contrast, tuned with known chips: each channel's reading (as a share of the paper) raised to a
  // power found from the chips, through the paper's own point (paper stays paper)
  function fitTune(pairs) {
    const g = [1, 1, 1];
    for (let i = 0; i < 3; i++) {
      let sxy = 0, sxx = 0;
      for (const p of pairs || []) { const m = p.m[i], t = p.t[i]; if (!(m > 0.02 && m < 0.92 && t > 0.01 && t < 1)) continue; const x = Math.log(m), y = Math.log(t); sxy += x * y; sxx += x * x; }
      if (sxx > 1e-4) g[i] = Math.max(0.55, Math.min(1.8, sxy / sxx));
    }
    return g;
  }
  const applyTune = (rel, g) => rel.map((v, i) => Math.pow(Math.max(1e-5, v), g ? g[i] : 1));

  // One reading of one picture. layout: { mode: 'paper' | 'wall', color: rect, paper: rect (wall only) } in the
  // picture's own pixels. opts.tune: powers from fitTune. Returns the color and anything that needs fixing first.
  function analyze(f, layout, opts) {
    opts = opts || {};
    const box = layout.color, w = box.x1 - box.x0, h = box.y1 - box.y0;
    const inner = { x0: box.x0 + w * 0.12, y0: box.y0 + h * 0.12, x1: box.x1 - w * 0.12, y1: box.y1 - h * 0.12 };
    const col = patch(f, inner, 0.25, 0.75);
    if (!col) return { problem: 'small' };
    const white = layout.mode === 'wall' && layout.paper ? sideWhite(f, layout.paper, box) : ringWhite(f, box, col);
    const res = { col, white, problem: '' };
    if (white && white.clipped) { res.problem = 'bright'; return res; }
    if (!white || !white.ok) { res.problem = layout.mode === 'wall' ? 'paper' : 'ring'; return res; }
    // the order says what to fix first
    if (white.top < 60) res.problem = 'dark';
    else if (white.clip > 0.12 || white.top >= 247) res.problem = 'bright';
    else if (col.hot > 0.18) res.problem = 'glare';
    else if (col.spread > 0.16) res.problem = 'mixed';
    else if (white.fit > 0.1 || white.even > (layout.mode === 'wall' ? 0.45 : 1.15)) res.problem = 'uneven';   // (past 1.15 the phone is too close: its light falls off too fast to follow)
    else if (col.L > white.L * 1.04) res.problem = 'brighter';
    const raw = col.avg.map((v, i) => v / Math.max(1e-6, white.W[i]));
    res.raw = raw;
    res.rel = applyTune(raw, opts.tune);
    res.hex = hexOf(res.rel.map(v => v * PAPER));
    return res;
  }
  // several readings into one color: the middle value of each, and how much they agreed (in Lab units)
  function combine(list, opts) {
    const good = list.filter(r => r && r.rel && !r.problem);
    if (!good.length) return null;
    const med = i => good.map(r => r.rel[i]).sort((a, b) => a - b)[good.length >> 1];
    const rel = [med(0), med(1), med(2)];
    const rawMed = i => good.map(r => r.raw[i]).sort((a, b) => a - b)[good.length >> 1];
    const L0 = lab(rel.map(v => v * PAPER));
    const spread = good.map(r => dE(lab(r.rel.map(v => v * PAPER)), L0)).sort((a, b) => a - b)[Math.floor(good.length * 0.75)] || 0;
    return { rel, raw: [rawMed(0), rawMed(1), rawMed(2)], hex: hexOf(rel.map(v => v * PAPER)), spread, n: good.length };
  }
  return { PAPER, analyze, combine, fitTune, applyTune, patch, hexOf, linOf, lab, dE, LIN, toEnc };
});
