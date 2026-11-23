/* ColorGenius wood: the woods people stain, what the bare wood looks like, and what a stain does to it.
   It draws real-looking grain on a canvas (boards, floors in perspective, cabinet doors, decks) and predicts
   a stain's color on each wood. The texture recipes (hash, value noise, growth rings, plank seams, stone
   veins, carpet pile) are adapted from the house builder's WebGL shader in Flowchart Producer
   (38-view3d-gl.js), rewritten here for a 2D canvas.
   Depends on CG.color. Works in the browser (window.CG.wood) and in Node (module.exports) for the color math. */
(function (root) {
  'use strict';
  const C = (root.CG && root.CG.color) || (typeof require === 'function' ? require('./color.js') : null);

  // ---------------- noise ----------------
  function hash(ix, iy) {
    let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const fract = x => x - Math.floor(x);
  const mix = (a, b, t) => a + (b - a) * t;
  // fade a detail into its average once it is finer than a pixel (the shader's `fa`), so far boards don't shimmer
  const fade = (x, mean, freq, foot) => mix(x, mean, smooth(0.5, 1.2, foot * freq));

  // ---------------- species ----------------
  // light = earlywood, dark = latewood (unfinished, sanded). ring = cm per growth ring. grain: cathedral (flat-sawn
  // arches), straight (rift or vertical grain), fine (tight, faint). pores: open grain that soaks up stain.
  // absorb: how much stain it takes compared with red oak. blotch: how unevenly. reversal: soft earlywood soaking
  // up more than the latewood (pine, fir). tone: board-to-board color spread.
  const SPECIES = {
    red_oak: { label: 'Red oak', light: 'DDB894', dark: 'B88660', ring: 0.55, grain: 'cathedral', pores: 0.85, contrast: 0.75, absorb: 1, blotch: 0.08, tone: 0.06, uses: ['floors', 'cabinets', 'stairs', 'trim', 'furniture'], note: 'Open grain with a pink-orange cast. Takes stain evenly and darkly in its pores.' },
    white_oak: { label: 'White oak', light: 'D9C29C', dark: 'B39470', ring: 0.45, grain: 'cathedral', pores: 0.6, rays: 0.6, contrast: 0.6, absorb: 0.95, blotch: 0.05, tone: 0.06, uses: ['floors', 'cabinets', 'stairs', 'furniture'], note: 'Tan to olive with ray flecks. Grays and naturals look clean on it.' },
    pine: { label: 'Pine', light: 'EDD7AA', dark: 'C9965C', ring: 0.7, grain: 'cathedral', knots: 1, contrast: 0.9, absorb: 1, blotch: 0.75, reversal: 0.8, tone: 0.08, uses: ['furniture', 'trim', 'floors', 'tabletop'], note: 'Soft, with bold grain and knots. Soaks up stain unevenly unless conditioned first.' },
    maple: { label: 'Maple', light: 'F0E0C6', dark: 'E0C7A2', ring: 0.4, grain: 'fine', contrast: 0.35, absorb: 0.62, blotch: 0.7, tone: 0.05, uses: ['cabinets', 'floors', 'furniture', 'tabletop'], note: 'Hard and pale with faint grain. Resists stain and can blotch, so stains look lighter.' },
    birch: { label: 'Birch', light: 'EBD8B8', dark: 'D3B68D', ring: 0.45, grain: 'fine', contrast: 0.45, absorb: 0.72, blotch: 0.6, tone: 0.06, uses: ['cabinets', 'furniture', 'trim'], note: 'Pale and smooth, often used for cabinets. Can blotch like maple.' },
    cherry: { label: 'Cherry', light: 'DCA77F', dark: 'BE8058', ring: 0.4, grain: 'fine', pores: 0.05, contrast: 0.45, absorb: 0.8, blotch: 0.55, tone: 0.07, uses: ['cabinets', 'furniture'], note: 'Warm pink-brown that darkens a lot with age and sun.' },
    walnut: { label: 'Walnut', light: '8C6B51', dark: '5E4330', ring: 0.5, grain: 'straight', pores: 0.45, contrast: 0.6, absorb: 0.5, blotch: 0.05, tone: 0.1, uses: ['furniture', 'tabletop', 'floors'], note: 'Naturally dark chocolate brown. Usually just oiled or clear-coated.' },
    hickory: { label: 'Hickory', light: 'E8CDA6', dark: '9E7350', ring: 0.6, grain: 'cathedral', pores: 0.6, contrast: 0.9, absorb: 0.95, blotch: 0.1, tone: 0.2, uses: ['floors', 'cabinets'], note: 'Very hard with big color swings from board to board.' },
    ash: { label: 'Ash', light: 'E4D1AC', dark: 'B39670', ring: 0.6, grain: 'cathedral', pores: 0.75, contrast: 0.75, absorb: 1, blotch: 0.06, tone: 0.06, uses: ['floors', 'furniture', 'cabinets'], note: 'Light with bold open grain, a lot like oak.' },
    poplar: { label: 'Poplar', light: 'E0D8B6', dark: 'C4BB92', ring: 0.5, grain: 'fine', streak: 0.5, contrast: 0.35, absorb: 0.85, blotch: 0.65, tone: 0.1, uses: ['trim', 'furniture'], note: 'Paint-grade wood with green and gray streaks. Stains blotchy.' },
    fir: { label: 'Douglas fir', light: 'E3B98C', dark: 'B57D4C', ring: 0.35, grain: 'straight', contrast: 0.85, absorb: 0.95, blotch: 0.35, reversal: 0.5, tone: 0.08, uses: ['door', 'trim', 'floors', 'pergola'], note: 'Straight, striped grain. Common for doors and old floors.' },
    cedar: { label: 'Cedar', light: 'D49C70', dark: 'A9693F', ring: 0.4, grain: 'straight', contrast: 0.55, absorb: 0.9, blotch: 0.15, tone: 0.22, ext: true, uses: ['deck', 'fence', 'siding', 'outdoor', 'pergola'], note: 'Naturally rot resistant, with boards from honey to reddish brown.' },
    redwood: { label: 'Redwood', light: 'C27C5C', dark: '93513A', ring: 0.35, grain: 'straight', contrast: 0.5, absorb: 0.8, blotch: 0.1, tone: 0.15, ext: true, uses: ['deck', 'fence', 'siding', 'outdoor'], note: 'Deep red-brown and naturally weather resistant.' },
    pt_pine: { label: 'Pressure-treated pine', light: 'D9C79A', dark: 'B39C69', ring: 0.75, grain: 'cathedral', knots: 0.7, contrast: 0.7, absorb: 0.85, blotch: 0.4, reversal: 0.4, tone: 0.1, ext: true, uses: ['deck', 'fence', 'outdoor', 'pergola'], note: 'The usual deck and fence lumber. Starts green-tan and must dry before staining.' },
    mahogany: { label: 'Mahogany', light: 'BC7A5C', dark: '91553B', ring: 0.4, grain: 'straight', pores: 0.35, contrast: 0.45, absorb: 0.85, blotch: 0.1, tone: 0.08, uses: ['door', 'furniture', 'deck'], note: 'Rich red-brown with a ribbon figure. Used for doors and fine decks.' },
  };
  const linCache = {};
  const lin = hex => linCache[hex] || (linCache[hex] = C.hexToLinear(hex));
  const lum = v => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];

  // ---------------- one point of wood ----------------
  // u runs along the grain and v across it, both in centimetres. b is the board (its own seed, ring center,
  // tone and knots). foot is how many centimetres one pixel covers, for fading detail.
  // Returns [r, g, b] in linear light, and how much stain this point soaks up (1 = like red oak) in out[3].
  function board(sp, seed, widthCm, lengthCm) {
    const s = SPECIES[sp] || SPECIES.red_oak;
    const r = k => hash(seed * 7 + k, seed * 13 - k);
    const knots = [];
    if (s.knots && r(1) < 0.55 * s.knots) knots.push({ u: r(2) * lengthCm, v: (0.2 + 0.6 * r(3)) * widthCm, r: 0.6 + 1.2 * r(4) });
    if (s.knots && r(5) < 0.2 * s.knots) knots.push({ u: r(6) * lengthCm, v: (0.2 + 0.6 * r(7)) * widthCm, r: 0.4 + 0.8 * r(8) });
    return { sp, seed, center: (0.3 + 0.4 * r(9)) * widthCm, peak: r(10) * lengthCm, cut: 0.6 + 0.9 * r(11), tone: 1 + (r(12) - 0.5) * 2 * (s.tone || 0.05), hue: (r(13) - 0.5) * (s.tone || 0.05), knots, rift: r(14) < 0.3 };
  }
  function woodAt(b, u, v, foot, out) {
    const s = SPECIES[b.sp];
    const sd = b.seed * 3.17;
    const w = fbm(u * 0.012 + sd, v * 0.09 + sd * 1.7, 3) - 0.5;
    let rc;
    if (s.grain === 'cathedral' && !b.rift) { const d = v - b.center; rc = d * d * 0.06 * b.cut + (u - b.peak) * 0.035 + w * 2.6; }
    else rc = v * (s.grain === 'fine' ? 1.15 : 0.85) + w * 1.6 + u * 0.002;
    let knot = 0;
    for (const k of b.knots) {
      const du = (u - k.u) * 0.35, dv = v - k.v, dd = Math.sqrt(du * du + dv * dv);
      rc += k.r * 3.2 / (dd + 0.8);
      knot = Math.max(knot, 1 - smooth(k.r * 0.55, k.r * 1.05, dd));
    }
    const f = fract(rc / s.ring);
    const ringFreq = 1 / s.ring;
    let late = smooth(0.5, 0.85, f) * (1 - smooth(0.93, 1, f));
    late = fade(late, 0.3, ringFreq * 0.6, foot);
    const early = 1 - smooth(0, 0.3, f);
    let pore = 0;
    if (s.pores) pore = smooth(0.6, 0.8, fade(noise(u * 0.35 + sd, v * 9), 0.5, 9, foot)) * s.pores * (0.35 + 0.65 * early);
    let fleck = 0;
    if (s.rays) fleck = smooth(0.72, 0.86, fade(noise(u * 0.22 + sd, v * 2.4), 0.5, 2.4, foot)) * s.rays;
    const fine = fade(noise(u * 1.6, v * 26 + sd), 0.5, 26, foot);
    const mottle = fbm(u * 0.02 - sd, v * 0.3, 2);
    const L = lin(s.light), D = lin(s.dark);
    const t = Math.min(1, late * s.contrast + 0.12 * (mottle - 0.5) + 0.08);
    const k = b.tone * (1 - 0.34 * pore) * (1 + 0.14 * fleck) * (0.965 + 0.07 * fine);
    for (let i = 0; i < 3; i++) out[i] = mix(L[i], D[i], t) * k;
    if (b.hue) { out[0] *= 1 + b.hue; out[2] *= 1 - b.hue; }
    if (s.streak) { const st = smooth(0.62, 0.8, fbm(u * 0.01 + sd, v * 0.35, 2)) * s.streak; out[0] *= 1 - 0.25 * st; out[2] *= 1 - 0.05 * st; out[1] *= 1 - 0.12 * st; }
    if (knot) { const kc = lin('5E3B22'); for (let i = 0; i < 3; i++) out[i] = mix(out[i], kc[i], knot * 0.85); }
    const blot = s.blotch ? (fbm(u * 0.03 + sd * 2, v * 0.28, 2) - 0.5) * 2 : 0;
    out[3] = s.absorb * (1 + 0.9 * pore + 0.55 * (s.pores || 0) * early * (1 - late) + (s.reversal || 0) * (0.35 * (1 - late) - 0.25 * late) + (s.blotch || 0) * blot * 0.55 + knot * 0.6);
    return out;
  }

  // ---------------- stains ----------------
  // A stain's published swatch is taken as how it looks on red oak. Its "filter" is that swatch divided by red
  // oak's own color, applied to any wood as wood × filter^absorb, so a wood that soaks up less (maple) comes out
  // lighter and open pores come out darker. Whitewashes and solid stains add pigment that sits on top.
  // the wood a brand shows its swatches on: Minwax on red oak, the deck and siding brands on cedar or treated pine
  const refCache = {};
  // mixAmt pulls the reference toward a gray of the same lightness: for brands whose swatches are flat color
  // samples rather than photos on wood, so their own hue carries over to every wood instead of being undone twice
  const refLin = (sp, mixAmt) => { const k = (sp || 'red_oak') + '|' + (mixAmt || 0); return refCache[k] || (refCache[k] = (() => { const s = SPECIES[sp] || SPECIES.red_oak, L = C.hexToLinear(s.light), D = C.hexToLinear(s.dark); const r = L.map((v, i) => mix(v, D[i], 0.38)); const g = lum(r); return r.map(v => mix(v, g, mixAmt || 0)); })()); };
  function filterFor(stain) {
    const REF = refLin(stain && stain.ref, stain && stain.refMix);
    if (!stain) return null;
    if (stain.clear) return { T: stain.clear === 'water' ? [0.97, 0.965, 0.95] : [0.93, 0.84, 0.66], a: 0, P: [0, 0, 0], wet: stain.clear === 'water' ? 0.97 : 0.9 };
    const S = lin(stain.solid && stain.solidHex ? stain.solidHex : stain.hex);
    if (stain.solid) return { T: S.map((v, i) => Math.min(1, v / REF[i])), a: 0.84, P: S, wet: 1 };
    const lighter = stain.type === 'white' || lum(S) > lum(REF) * 0.96;
    if (lighter) {
      const a = 0.6;
      return { T: [1, 1, 1], a, P: S.map((v, i) => Math.min(1, Math.max(0, (v - (1 - a) * REF[i]) / a))), wet: 1 };
    }
    const a = 0.12;
    return { T: S.map((v, i) => Math.min(1, Math.max(0.004, v / REF[i]))), a, P: S, wet: 1 };
  }
  // the stained color of one point: w = wood [r, g, b, absorb]
  function stainPoint(w, F, out, grainLum) {
    const e = w[3];
    if (F.a >= 0.8) { // solid: mostly the stain's own color, with a little of the grain showing through
      const sh = Math.pow(Math.max(0.2, grainLum), 0.28);
      for (let i = 0; i < 3; i++) out[i] = mix(w[i] * Math.pow(F.T[i], e), F.P[i] * sh, F.a);
      return out;
    }
    for (let i = 0; i < 3; i++) out[i] = (1 - F.a) * w[i] * Math.pow(F.T[i], e) * F.wet + F.a * F.P[i] * (0.85 + 0.15 * Math.min(1.4, e));
    return out;
  }

  // ---------------- average color, for picking and for plain swatches ----------------
  const avgCache = {};
  const SAMPLE_BOARDS = [0, 1, 2, 3].map(i => i);
  function predictLin(sp, stain) {
    const key = sp + '|' + (stain ? (stain.clear || '') + (stain.solid ? 'S' : '') + (stain.solidHex || '') + stain.hex + (stain.ref || '') + (stain.refMix || '') : 'bare');
    if (avgCache[key]) return avgCache[key];
    const F = filterFor(stain);
    const acc = [0, 0, 0]; const w = [0, 0, 0, 0], o = [0, 0, 0];
    let n = 0;
    for (const bi of SAMPLE_BOARDS) {
      const b = board(sp, 101 + bi, 12, 120);
      for (let j = 0; j < 48; j++) {
        const u = hash(bi * 97 + j, 3) * 120, v = hash(bi * 31 + j, 7) * 12;
        woodAt(b, u, v, 0.2, w);
        const r = F ? stainPoint(w, F, o, lum(w) / Math.max(1e-4, lum(lin(SPECIES[sp].light)))) : w;
        acc[0] += r[0]; acc[1] += r[1]; acc[2] += r[2]; n++;
      }
    }
    return (avgCache[key] = acc.map(v => v / n));
  }
  const predictHex = (sp, stain) => C.linearToHex(predictLin(sp, stain).map(v => Math.min(1, v)));
  // A fast estimate from the bare wood's average, for sorting through thousands of paint colors (solid stains)
  function quickHex(sp, stain) {
    const F = filterFor(stain), bare = predictLin(sp, null), e = (SPECIES[sp] || SPECIES.red_oak).absorb;
    const o = stainPoint([bare[0], bare[1], bare[2], e], F, [0, 0, 0], 1);
    return C.linearToHex(o.map(v => Math.min(1, v)));
  }
  const bareHex = sp => predictHex(sp, null);

  // ---------------- canvas fields ----------------
  // A field is the bare wood sampled once for every pixel (color + how much stain it takes + a mask for seams
  // and gaps). Stain, light and the before/after split are then painted on top quickly, so dragging the
  // divider or switching the light doesn't recompute the grain.
  const fieldCache = new Map();
  function makeField(w, h, fn, key) {
    if (key && fieldCache.has(key)) return fieldCache.get(key);
    const col = new Float32Array(w * h * 4), shade = new Float32Array(w * h);
    const out = [0, 0, 0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = fn(x, y, out);
      if (!r) { shade[i] = -1; continue; }
      col[i * 4] = out[0]; col[i * 4 + 1] = out[1]; col[i * 4 + 2] = out[2]; col[i * 4 + 3] = out[3];
      shade[i] = r === true ? 1 : r;
    }
    const f = { w, h, col, shade, kind: 'wood' };
    if (key) { fieldCache.set(key, f); if (fieldCache.size > 24) fieldCache.delete(fieldCache.keys().next().value); }
    return f;
  }
  // Flat boards, grain running across the picture: a floor or tabletop seen from above, a deck from above,
  // or (vertical) a fence, siding or a cabinet door. cm = centimetres per pixel.
  function boardsField(sp, w, h, o) {
    o = o || {};
    const cm = o.cm || 0.25, bw = o.boardCm || 12, gap = o.gapCm || 0, vertical = !!o.vertical;
    const key = ['boards', sp, w, h, cm, bw, gap, vertical, o.seed || 0].join('|');
    return makeField(w, h, (x, y, out) => {
      const along = (vertical ? y : x) * cm, across = (vertical ? x : y) * cm;
      const row = Math.floor(across / (bw + gap)), inRow = across - row * (bw + gap);
      if (inRow > bw) return false; // gap between deck boards
      const len = 90 + 90 * hash(row, 5 + (o.seed || 0));
      const off = hash(row, 11) * len;
      const seg = Math.floor((along + off) / len);
      const b = board(sp, (o.seed || 0) * 1000 + row * 31 + seg * 7 + 1, bw, len);
      woodAt(b, along + off - seg * len, inRow, cm, out);
      const edge = Math.min(inRow, bw - inRow), endc = Math.min(fract((along + off) / len) * len, len - fract((along + off) / len) * len);
      let sh = 1;
      if (edge < 0.35) sh *= 0.72 + 0.28 * (edge / 0.35);
      if (!vertical && o.ends !== false && endc < 0.25) sh *= 0.7;
      if (gap && edge < 0.6) sh *= 0.85 + 0.15 * (edge / 0.6);
      return sh;
    }, key);
  }
  // A cabinet door: frame (rails and stiles) around a flat center panel, grain along each piece.
  function doorField(sp, w, h, o) {
    o = o || {};
    const cm = o.cm || 0.2, fr = o.frameCm || 6.5;
    const key = ['door', sp, w, h, cm, fr].join('|');
    const pieces = { stileL: board(sp, 11, fr, 80), stileR: board(sp, 12, fr, 80), railT: board(sp, 13, fr, 60), railB: board(sp, 14, fr, 60), panel: board(sp, 15, 40, 80) };
    return makeField(w, h, (x, y, out) => {
      const X = x * cm, Y = y * cm, W = w * cm, H = h * cm;
      let sh = 1;
      if (X < fr) { woodAt(pieces.stileL, Y, X, cm, out); }
      else if (X > W - fr) { woodAt(pieces.stileR, Y, X - (W - fr), cm, out); }
      else if (Y < fr) { woodAt(pieces.railT, X, Y, cm, out); }
      else if (Y > H - fr) { woodAt(pieces.railB, X, Y - (H - fr), cm, out); }
      else { woodAt(pieces.panel, Y, X, cm, out); const d = Math.min(X - fr, W - fr - X, Y - fr, H - fr - Y); if (d < 1.2) sh *= 0.62 + 0.38 * (d / 1.2); }
      const d2 = Math.min(Math.abs(X - fr), Math.abs(X - (W - fr)), Math.abs(Y - fr), Math.abs(Y - (H - fr)));
      if (d2 < 0.15) sh *= 0.8;
      return sh;
    }, key);
  }
  // The floor of a room scene, in the same one-point perspective as the room drawing: vanishing point (500, 200),
  // the back wall's foot at y 354, the front edge at y 480. Planks run toward the back wall.
  // kind: wood | tile | carpet | concrete | deck (deck boards run across, with gaps).
  function floorField(sp, kind, o) {
    o = o || {};
    const W = 800, top = 354, H = 480 - top;
    const key = ['floor', sp, kind, o.seed || 0].join('|');
    const K = 171100, scale = 147;
    const tileCm = 45;
    return makeField(W, H, (x, yy, out) => {
      const sy = yy + top + 0.5, dy = sy - 200;
      const depth = K / dy, X = (x + 0.5 - 500) / dy * scale * (1 + 0 * depth);
      const foot = Math.max(K / (dy * dy), scale / dy);
      if (kind === 'wood' || kind === 'deck') {
        const across = kind === 'deck' ? depth : X + 1000, along = kind === 'deck' ? X + 1000 : depth;
        const bw = kind === 'deck' ? 14 : 12.7, gap = kind === 'deck' ? 0.6 : 0;
        const row = Math.floor(across / (bw + gap)), inRow = across - row * (bw + gap);
        if (inRow > bw) { out[0] = out[1] = out[2] = 0.012; out[3] = 0; return 0.35; }
        const len = kind === 'deck' ? 360 : 90 + 110 * hash(row, 5);
        const off = hash(row, 11) * len, seg = Math.floor((along + off) / len);
        const b = board(sp, (o.seed || 0) * 1000 + row * 31 + seg * 7 + 1, bw, len);
        woodAt(b, along + off - seg * len, inRow, foot, out);
        const edge = Math.min(inRow, bw - inRow), lp = fract((along + off) / len) * len, endc = Math.min(lp, len - lp);
        let sh = 1;
        const ew = Math.max(0.25, foot * 0.8);
        if (edge < ew) sh *= 0.74 + 0.26 * (edge / ew);
        if (endc < Math.max(0.25, foot * 0.8) && kind === 'wood') sh *= 0.74;
        return sh;
      }
      const L = lin(o.hex || 'C9C4BA');
      if (kind === 'tile') {
        const tx = (X + 1000) / tileCm, tz = depth / tileCm;
        const gx = Math.min(fract(tx), 1 - fract(tx)) * tileCm, gz = Math.min(fract(tz), 1 - fract(tz)) * tileCm;
        const gw = Math.max(0.35, foot * 0.7);
        const grout = gx < gw || gz < gw;
        const tone = 0.94 + 0.08 * hash(Math.floor(tx), Math.floor(tz)) + 0.04 * (fade(fbm(X * 0.08, depth * 0.08, 2), 0.5, 0.16, foot) - 0.5);
        for (let i = 0; i < 3; i++) out[i] = grout ? Math.min(1, L[i] * 0.78 + 0.05) : L[i] * tone;
        out[3] = 0; return 1;
      }
      if (kind === 'carpet') {
        const pile = fade(noise(X * 2.2, depth * 2.2), 0.5, 2.2, foot);
        const t = 0.9 + 0.12 * pile + 0.06 * (fbm(X * 0.05, depth * 0.05, 2) - 0.5);
        for (let i = 0; i < 3; i++) out[i] = L[i] * t;
        out[3] = 0; return 1;
      }
      const m = fbm(X * 0.02, depth * 0.02, 3), sp2 = fade(noise(X * 0.9, depth * 0.9), 0.5, 0.9, foot); // concrete
      const joint = Math.min(fract((X + 1000) / 300), 1 - fract((X + 1000) / 300)) * 300 < Math.max(0.4, foot) || Math.min(fract(depth / 300), 1 - fract(depth / 300)) * 300 < Math.max(0.4, foot);
      const t = (0.9 + 0.16 * (m - 0.5) + 0.05 * (sp2 - 0.5)) * (joint ? 0.82 : 1);
      for (let i = 0; i < 3; i++) out[i] = L[i] * t;
      out[3] = 0; return 1;
    }, key + '|' + (o.hex || ''));
  }
  // Stone countertop: soft clouds and fine veins (from the shader's marble), or speckled granite.
  function stoneField(w, h, o) {
    o = o || {};
    const key = ['stone', w, h, o.hex, o.speckle ? 1 : 0].join('|');
    const L = lin(o.hex || 'ECEAE5');
    return makeField(w, h, (x, y, out) => {
      let t;
      if (o.speckle) {
        const s1 = hash(x * 3 + 1, y * 5 + 2), s2 = noise(x * 0.35, y * 0.35);
        t = 0.93 + 0.1 * (s2 - 0.5) + (s1 > 0.93 ? -0.35 : s1 < 0.05 ? 0.12 : 0);
      } else {
        const sx = x * 0.012, sy = y * 0.012;
        const v1 = Math.abs(Math.sin((sx * 2.3 + sy * 0.9) * 2.2 + fbm(sx * 2.4, sy * 2.4, 3) * 5));
        const veins = (1 - smooth(0, 0.05, v1)) * (0.5 + 0.5 * noise(sx * 1.3, sy * 1.3));
        t = (0.96 + 0.05 * noise(sx * 1.7, sy * 1.7)) * (1 - 0.2 * veins);
      }
      for (let i = 0; i < 3; i++) out[i] = L[i] * t;
      out[3] = 0; return 1;
    }, key);
  }
  // Woven fabric for upholstery.
  function fabricField(w, h, o) {
    o = o || {};
    const key = ['fabric', w, h, o.hex].join('|');
    const L = lin(o.hex || '8A857E');
    return makeField(w, h, (x, y, out) => {
      const weave = 0.5 + 0.5 * Math.sin(x * 1.9) * Math.sin(y * 1.9);
      const t = 0.92 + 0.06 * weave + 0.06 * (noise(x * 0.4, y * 0.4) - 0.5) + 0.04 * (fbm(x * 0.03, y * 0.03, 2) - 0.5);
      for (let i = 0; i < 3; i++) out[i] = L[i] * t;
      out[3] = 0; return 1;
    }, key);
  }

  // Paint a field onto a canvas. o: { stain, tint (hex: scale the wood so its average matches this color),
  // split (0..1: left of it stays bare), gain ([r, g, b] light and calibration multipliers in linear light),
  // sheen (0..1: a soft highlight band), alpha }
  function paintField(canvas, f, o) {
    o = o || {};
    if (canvas.width !== f.w) canvas.width = f.w;
    if (canvas.height !== f.h) canvas.height = f.h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(f.w, f.h), d = img.data;
    const F = filterFor(o.stain);
    const gain = o.gain || [1, 1, 1];
    let k = [1, 1, 1];
    if (o.tint && o.sp) { const avg = predictLin(o.sp, null), t = lin(o.tint); k = t.map((v, i) => v / Math.max(1e-4, avg[i])); }
    const splitX = o.split == null ? -1 : Math.round(o.split * f.w);
    const ref = o.sp ? lum(lin(SPECIES[o.sp].light)) : 1;
    const w = [0, 0, 0, 0], s = [0, 0, 0];
    const lut = SRGB_LUT;
    for (let y = 0; y < f.h; y++) {
      const band = o.sheen ? 1 + o.sheen * 0.16 * Math.exp(-Math.pow((y / f.h - 0.32) * 3.2, 2)) : 1;
      for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x, sh = f.shade[i];
        const p = i * 4;
        if (sh < 0) { d[p + 3] = 0; continue; }
        w[0] = f.col[p] * k[0]; w[1] = f.col[p + 1] * k[1]; w[2] = f.col[p + 2] * k[2]; w[3] = f.col[p + 3];
        let r = w;
        if (F && x >= splitX) r = stainPoint(w, F, s, lum(w) / ref);
        const m = sh * band;
        d[p] = lut[Math.min(4095, Math.max(0, (r[0] * m * gain[0] * 4095) | 0))];
        d[p + 1] = lut[Math.min(4095, Math.max(0, (r[1] * m * gain[1] * 4095) | 0))];
        d[p + 2] = lut[Math.min(4095, Math.max(0, (r[2] * m * gain[2] * 4095) | 0))];
        d[p + 3] = o.alpha == null ? 255 : o.alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
  const SRGB_LUT = (() => { const t = new Uint8ClampedArray(4096); for (let i = 0; i < 4096; i++) t[i] = Math.round(C.fromLinear(i / 4095)); return t; })();
  // light + calibration as three channel multipliers (close enough for textures)
  function gainFor(light, cal) {
    let g = C.applyLight([1, 1, 1], light);
    g = C.applyCalibration(g, cal);
    return g;
  }

  const api = {
    SPECIES, hash, noise, fbm, board, woodAt, filterFor, stainPoint, predictLin, predictHex, quickHex, bareHex,
    boardsField, doorField, floorField, stoneField, fabricField, paintField, gainFor,
  };
  root.CG = root.CG || {};
  root.CG.wood = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
