/* ColorGenius 3D rooms: every scene built in 3D and drawn with WebGL 2. Sunlight comes in through real window
   openings and casts shadows; at night the lamps come on. The picked color is shown exactly as the chips are
   (the same light and screen tuning), and a new color rolls onto the walls like a paint roller.
   With the 3D setting off the scene is a still picture from a good camera spot; with it on, drag to look around.
   Depends on CG.color and CG.wood. */
(function (root) {
  'use strict';
  const C = root.CG.color, WD = root.CG.wood;

  // ---------------- small math (matrices are column-major, as WebGL wants) ----------------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function persp(fovy, aspect, n, f) {
    const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
    return new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]);
  }
  function lookAt(e, t, up) {
    const z = norm(sub(e, t)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  }
  function ortho(l, r, b, t, n, f) {
    return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]);
  }
  function mmul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
    return o;
  }
  function inv4(m) {
    const o = new Float32Array(16);
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7], a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return o; det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  }
  const rnd = seed => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

  // ---------------- building a scene: boxes, rounded boxes, cylinders, walls with openings ----------------
  // Everything is grouped by material. Texture coordinates are the world position in meters, projected on the
  // face's main axis, so wood grain and tile patterns keep their real size on every surface.
  class Builder {
    constructor() { this.groups = {}; this.mats = {}; this.M = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]; this.stack = []; this.decals = []; this.lamps = []; this.windows = []; this.lo = [1e9, 1e9, 1e9]; this.hi = [-1e9, -1e9, -1e9]; }
    // the first real definition of a material wins; one made up on first use can still be defined properly later
    mat(name, props) { const ex = this.mats[name]; if (!ex || ex.auto) this.mats[name] = Object.assign({ color: 'FFFFFF' }, props || {}); return name; }
    grp(name) { if (!this.mats[name]) this.mats[name] = { color: 'FFFFFF', auto: true }; return this.groups[name] || (this.groups[name] = { p: [], n: [], u: [], i: [] }); }
    push() { this.stack.push(this.M.slice()); return this; }
    pop() { this.M = this.stack.pop(); return this; }
    // the transform is a 3x3 rotation/scale (row-major) plus a translation
    at(x, y, z, ry) { const M = this.M; const t = this.tp([x, y, z]); if (ry) { const c = Math.cos(ry), s = Math.sin(ry); const R = [c, 0, s, 0, 1, 0, -s, 0, c]; const o = []; for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) o[r * 3 + k] = M[r * 3] * R[k] + M[r * 3 + 1] * R[3 + k] + M[r * 3 + 2] * R[6 + k]; this.M = o.concat(t); } else this.M = M.slice(0, 9).concat(t); return this; }
    tp(p) { const M = this.M; return [M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + M[9], M[3] * p[0] + M[4] * p[1] + M[5] * p[2] + M[10], M[6] * p[0] + M[7] * p[1] + M[8] * p[2] + M[11]]; }
    tn(n) { const M = this.M; return norm([M[0] * n[0] + M[1] * n[1] + M[2] * n[2], M[3] * n[0] + M[4] * n[1] + M[5] * n[2], M[6] * n[0] + M[7] * n[1] + M[8] * n[2]]); }
    vert(g, p, n) {
      const P = this.tp(p), N = this.tn(n);
      const ax = Math.abs(N[0]), ay = Math.abs(N[1]), az = Math.abs(N[2]);
      const uv = ay >= ax && ay >= az ? [P[0], P[2]] : ax >= az ? [P[2], P[1]] : [P[0], P[1]];
      g.p.push(P[0], P[1], P[2]); g.n.push(N[0], N[1], N[2]); g.u.push(uv[0], uv[1]);
      for (let i = 0; i < 3; i++) { if (P[i] < this.lo[i]) this.lo[i] = P[i]; if (P[i] > this.hi[i]) this.hi[i] = P[i]; }
      return g.p.length / 3 - 1;
    }
    // a flat four-sided face; turned so its front faces the normal
    quad(mat, a, b, c, d, n) {
      const g = this.grp(mat);
      const fn = n || norm(cross(sub(b, a), sub(c, a)));
      const flip = dot(cross(sub(b, a), sub(c, a)), fn) < 0;
      const i0 = this.vert(g, a, fn), i1 = this.vert(g, b, fn), i2 = this.vert(g, c, fn), i3 = this.vert(g, d, fn);
      if (flip) g.i.push(i0, i2, i1, i0, i3, i2); else g.i.push(i0, i1, i2, i0, i2, i3);
      return this;
    }
    box(mat, x0, y0, z0, x1, y1, z1, skip) {
      skip = skip || '';
      if (!skip.includes('t')) this.quad(mat, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
      if (!skip.includes('b')) this.quad(mat, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
      if (!skip.includes('f')) this.quad(mat, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
      if (!skip.includes('k')) this.quad(mat, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
      if (!skip.includes('l')) this.quad(mat, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0]);
      if (!skip.includes('r')) this.quad(mat, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
      return this;
    }
    // a box with rounded edges and corners (cushions, mattresses, appliances)
    rbox(mat, x0, y0, z0, x1, y1, z1, r, m) {
      m = m || 3;
      const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2];
      r = Math.min(r, h[0] * 0.98, h[1] * 0.98, h[2] * 0.98);
      const ticks = hh => { const out = []; for (let k = m; k >= 0; k--) out.push(-((hh - r) + r * Math.sin(k / m * Math.PI / 2))); for (let k = 0; k <= m; k++) out.push((hh - r) + r * Math.sin(k / m * Math.PI / 2)); return out; };
      const T = [ticks(h[0]), ticks(h[1]), ticks(h[2])];
      const g = this.grp(mat);
      const faces = [[2, 0, 1, 1], [2, 1, 0, -1], [0, 2, 1, -1], [0, 1, 2, 1], [1, 2, 0, 1], [1, 0, 2, -1]];
      for (const [ax, ua, va, sgn] of faces) {
        const us = T[ua], vs = T[va], idx = [];
        for (let j = 0; j < vs.length; j++) for (let i = 0; i < us.length; i++) {
          const P = [0, 0, 0]; P[ax] = sgn * h[ax]; P[ua] = us[i]; P[va] = vs[j];
          const inner = P.map((v, k) => Math.max(-(h[k] - r), Math.min(h[k] - r, v)));
          let d = sub(P, inner); const l = len(d);
          let pos, nn;
          if (l > 1e-6) { nn = scl(d, 1 / l); pos = add(inner, scl(nn, r)); } else { nn = [0, 0, 0]; nn[ax] = sgn; pos = P; }
          idx.push(this.vert(g, add(pos, c), nn));
        }
        const W = us.length;
        for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < W - 1; i++) {
          const a = idx[j * W + i], b = idx[j * W + i + 1], cc = idx[(j + 1) * W + i + 1], d = idx[(j + 1) * W + i];
          const pa = g.p.slice(a * 3, a * 3 + 3), pb = g.p.slice(b * 3, b * 3 + 3), pc = g.p.slice(cc * 3, cc * 3 + 3);
          const fn = g.n.slice(a * 3, a * 3 + 3);
          if (dot(cross(sub(pb, pa), sub(pc, pa)), fn) < 0) g.i.push(a, cc, b, a, d, cc); else g.i.push(a, b, cc, a, cc, d);
        }
      }
      return this;
    }
    // an upright cylinder (or a cone when r0 and r1 differ)
    cyl(mat, x, y0, z, r0, h, seg, r1, caps) {
      seg = seg || 16; r1 = r1 == null ? r0 : r1; caps = caps == null ? 'tb' : caps;
      const g = this.grp(mat), ring = [];
      const slope = (r0 - r1) / h;
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a);
        const n = norm([cx, slope, sz]);
        ring.push([this.vert(g, [x + cx * r0, y0, z + sz * r0], n), this.vert(g, [x + cx * r1, y0 + h, z + sz * r1], n)]);
      }
      for (let i = 0; i < seg; i++) { const [a, b] = ring[i], [c, d] = ring[i + 1]; g.i.push(a, d, c, a, b, d); }
      if (caps.includes('t') && r1 > 0) this.disc(mat, x, y0 + h, z, r1, seg, 1);
      if (caps.includes('b') && r0 > 0) this.disc(mat, x, y0, z, r0, seg, -1);
      return this;
    }
    disc(mat, x, y, z, r, seg, up) {
      const g = this.grp(mat), n = [0, up, 0], c = this.vert(g, [x, y, z], n), ids = [];
      for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; ids.push(this.vert(g, [x + Math.cos(a) * r, y, z + Math.sin(a) * r], n)); }
      for (let i = 0; i < seg; i++) if (up > 0) g.i.push(c, ids[i + 1], ids[i]); else g.i.push(c, ids[i], ids[i + 1]);
      return this;
    }
    // a horizontal cylinder along x or z (logs, rods, rails)
    rod(mat, axis, x, y, z, r, l, seg) {
      this.push();
      const M = this.M, t = this.tp([x, y, z]);
      // rotate so the cylinder's y axis lies along the chosen axis
      const R = axis === 'x' ? [0, -1, 0, 1, 0, 0, 0, 0, 1] : [1, 0, 0, 0, 0, -1, 0, 1, 0];
      const o = []; for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) o[r * 3 + k] = M[r * 3] * R[k] + M[r * 3 + 1] * R[3 + k] + M[r * 3 + 2] * R[6 + k];
      this.M = o.concat(t);
      this.cyl(mat, 0, -l / 2, 0, r, l, seg || 12);
      return this.pop();
    }
    sphere(mat, x, y, z, rx, ry, rz, seg) {
      seg = seg || 14; const g = this.grp(mat), rows = [];
      for (let j = 0; j <= seg / 2; j++) {
        const v = j / (seg / 2) * Math.PI, row = [];
        for (let i = 0; i <= seg; i++) { const u = i / seg * Math.PI * 2; const d = [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)]; row.push(this.vert(g, [x + d[0] * rx, y + d[1] * ry, z + d[2] * rz], norm([d[0] / rx, d[1] / ry, d[2] / rz]))); }
        rows.push(row);
      }
      for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < seg; i++) { const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i + 1], d = rows[j + 1][i]; g.i.push(a, b, c, a, c, d); }
      return this;
    }
    // a turned shape from a profile of [radius, height] pairs (lamps, vases, pots, bowls)
    lathe(mat, x, y, z, prof, seg) {
      seg = seg || 20; const g = this.grp(mat), rings = [];
      for (let k = 0; k < prof.length; k++) {
        const [r, h] = prof[k], prev = prof[Math.max(0, k - 1)], next = prof[Math.min(prof.length - 1, k + 1)];
        const dr = next[0] - prev[0], dh = next[1] - prev[1];
        const ring = [];
        for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); ring.push(this.vert(g, [x + c * r, y + h, z + s * r], norm([c * dh, -dr, s * dh]))); }
        rings.push(ring);
      }
      for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < seg; i++) { const a = rings[k][i], b = rings[k][i + 1], c = rings[k + 1][i + 1], d = rings[k + 1][i]; g.i.push(a, c, b, a, d, c); }
      return this;
    }
    // a wall with rectangular openings. o = origin (bottom-left), u = unit vector along the wall, n = the side it faces.
    // holes are [u0, u1, v0, v1] in meters along the wall and up from the floor.
    wall(mat, o, u, n, W, H, holes) {
      holes = (holes || []).map(h => [Math.max(0, h[0]), Math.min(W, h[1]), Math.max(0, h[2]), Math.min(H, h[3])]);
      const xs = [0, W]; for (const h of holes) xs.push(h[0], h[1]);
      const cols = Array.from(new Set(xs.map(v => +v.toFixed(4)))).sort((a, b) => a - b);
      const P = (uu, vv) => [o[0] + u[0] * uu, o[1] + vv, o[2] + u[2] * uu];
      for (let i = 0; i < cols.length - 1; i++) {
        const a = cols[i], b = cols[i + 1]; if (b - a < 1e-4) continue;
        const m = (a + b) / 2;
        const cut = holes.filter(h => m > h[0] && m < h[1]).map(h => [h[2], h[3]]).sort((x, y) => x[0] - y[0]);
        let v = 0;
        for (const [v0, v1] of cut) { if (v0 > v) this.quad(mat, P(a, v), P(b, v), P(b, v0), P(a, v0), n); v = Math.max(v, v1); }
        if (v < H) this.quad(mat, P(a, v), P(b, v), P(b, H), P(a, H), n);
      }
      return this;
    }
    // a soft shadow under furniture, on the floor
    shadow(x, z, w, d, strength, ry, y) { const c = this.tp([x, y || 0.003, z]); this.decals.push({ x: c[0], y: c[1], z: c[2], w, d, s: strength == null ? 0.45 : strength, ry: (ry || 0) + Math.atan2(this.M[2], this.M[0]) }); return this; }
    lamp(x, y, z, power, kind) { this.lamps.push({ p: this.tp([x, y, z]), power: power || 1, kind: kind || 'lamp' }); return this; }
  }

  // ---------------- drawing with WebGL 2 ----------------
  // Patterns are worked out in the shader from the surface position: lap siding, shingles, brick, tile, grass...
  const PAT = { plain: 0, lap: 1, shingle: 2, brick: 3, tile: 4, subway: 5, fabric: 6, grass: 7, batten: 8, shake: 9, stucco: 10, concrete: 11, bead: 12, water: 13, louver: 14, carpet: 15, glass: 16, metalroof: 17, walk: 18, sky: 19, leaves: 20, bark: 21, stone: 22, mirror: 23 };
  const VS = `#version 300 es
    layout(location = 0) in vec3 aPos; layout(location = 1) in vec3 aNor; layout(location = 2) in vec2 aUv;
    uniform mat4 uVP; uniform mat4 uLVP;
    out vec3 vPos; out vec3 vNor; out vec2 vUv; out vec4 vLs;
    void main() { vPos = aPos; vNor = aNor; vUv = aUv; vLs = uLVP * vec4(aPos, 1.0); gl_Position = uVP * vec4(aPos, 1.0); }`;
  const FS = `#version 300 es
    precision highp float; precision highp sampler2DShadow;
    in vec3 vPos; in vec3 vNor; in vec2 vUv; in vec4 vLs;
    uniform vec3 uColor, uPrev, uEmit; uniform float uWipe; uniform vec4 uWipePlane;
    uniform float uGloss; uniform int uPat; uniform float uTexMode; uniform sampler2D uTex; uniform vec2 uTexScale; uniform float uTexSwap; uniform float uScale;
    uniform vec3 uSunDir, uSunCol; uniform float uSunOn; uniform sampler2DShadow uShadow; uniform float uTexel;
    uniform vec3 uSky, uGround, uHorizon; uniform float uAmb; uniform vec3 uEye;
    uniform vec4 uLamp[6]; uniform vec3 uLampCol[6]; uniform int uLampN;
    uniform vec3 uRoomMin, uRoomMax; uniform float uRoomAO; uniform float uExposure; uniform float uTime;
    out vec4 oColor;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
    float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
    float line(float x, float w) { float f = fract(x); return smoothstep(0.0, w, f) * smoothstep(1.0, 1.0 - w, f); }
    vec3 pattern(vec3 c, vec2 uv, vec3 p, vec3 n) {
      float s = uScale;
      if (uPat == 1) { float y = p.y / (0.17 * s); float f = fract(y); c *= 0.80 + 0.2 * smoothstep(0.0, 0.16, f) + 0.06 * (1.0 - f); c *= 0.97 + 0.06 * noise(vec2(uv.x * 0.6, floor(y))); }
      else if (uPat == 2) { float y = p.y / 0.15, row = floor(y); float x = uv.x / 0.33 + 0.5 * mod(row, 2.0); float f = fract(y);
        c *= 0.78 + 0.22 * smoothstep(0.0, 0.12, f); c *= 0.86 + 0.28 * hash(vec2(floor(x), row)) * 0.6; c *= 0.92 + 0.08 * line(x, 0.04) + 0.06 * noise(uv * 40.0); }
      else if (uPat == 3) { float y = p.y / 0.075, row = floor(y); float x = (abs(n.x) > 0.5 ? p.z : p.x) / 0.2 + 0.5 * mod(row, 2.0);
        float m = line(y, 0.09) * line(x, 0.035); vec3 brick = c * (0.82 + 0.3 * hash(vec2(floor(x), row)) + 0.08 * noise(uv * 30.0)); c = mix(vec3(0.62, 0.6, 0.56) * 0.75, brick, m); }
      else if (uPat == 4) { vec2 t = uv / (0.45 * s); float m = line(t.x, 0.025) * line(t.y, 0.025); c *= 0.94 + 0.08 * hash(floor(t)); c = mix(c * 0.82 + 0.06, c, m); }
      else if (uPat == 5) { float y = (abs(n.y) > 0.5 ? uv.y : p.y) / 0.075, row = floor(y); float x = uv.x / 0.15 + 0.5 * mod(row, 2.0); float m = line(y, 0.07) * line(x, 0.035); c = mix(c * 0.78, c * (0.97 + 0.05 * hash(vec2(floor(x), row))), m); }
      else if (uPat == 6) { float w = 0.5 + 0.5 * sin(uv.x * 900.0) * sin(uv.y * 900.0); c *= 0.9 + 0.08 * w + 0.08 * (noise(uv * 60.0) - 0.5); }
      else if (uPat == 7) { float g = fbm(uv * 3.0) * 0.5 + 0.5 * noise(uv * 90.0); c *= 0.72 + 0.5 * g; }
      else if (uPat == 8) { float x = (abs(n.x) > 0.5 ? p.z : p.x) / 0.4; float f = fract(x); c *= 0.86 + 0.14 * smoothstep(0.0, 0.03, f) * smoothstep(0.17, 0.14, f) + 0.07 * step(0.17, f); c *= 0.96 + 0.04 * noise(uv * 3.0); }
      else if (uPat == 9) { float y = p.y / 0.18, row = floor(y); float x = (abs(n.x) > 0.5 ? p.z : p.x) / (0.14 + 0.1 * hash(vec2(row, 3.0))) + hash(vec2(row, 7.0));
        float f = fract(y); c *= 0.8 + 0.2 * smoothstep(0.0, 0.1, f); c *= 0.86 + 0.22 * hash(vec2(floor(x), row)); c *= 0.94 + 0.06 * line(x, 0.05); c *= 0.95 + 0.1 * noise(vec2(uv.x * 60.0, p.y * 6.0)); }
      else if (uPat == 10) { c *= 0.9 + 0.12 * fbm(uv * 9.0) + 0.05 * noise(uv * 120.0); }
      else if (uPat == 11) { c *= 0.88 + 0.14 * fbm(uv * 1.5) + 0.06 * noise(uv * 80.0); vec2 j = uv / 3.0; c *= 0.82 + 0.18 * line(j.x, 0.004) * line(j.y, 0.004); }
      else if (uPat == 12) { float x = (abs(n.x) > 0.5 ? p.z : p.x) / 0.1; c *= 0.82 + 0.18 * line(x, 0.12); }
      else if (uPat == 13) { float w = noise(uv * 3.0 + vec2(uTime * 0.25, 0.0)) * 0.6 + noise(uv * 11.0 - vec2(0.0, uTime * 0.3)) * 0.4; c *= 0.75 + 0.35 * w; }
      else if (uPat == 14) { float y = vUv.y / 0.05; c *= 0.72 + 0.28 * smoothstep(0.0, 0.5, fract(y)); }
      else if (uPat == 15) { c *= 0.88 + 0.12 * fbm(uv * 30.0) + 0.04 * noise(uv * 300.0); }
      else if (uPat == 17) { float x = (abs(n.x) > 0.5 ? p.z : p.x) / 0.45; c *= 0.85 + 0.15 * line(x, 0.03); }
      else if (uPat == 18) { vec2 t = uv / 1.2; float m = line(t.x, 0.01) * line(t.y, 0.01); c *= (0.9 + 0.1 * fbm(uv * 6.0)) * (0.85 + 0.15 * m); }
      else if (uPat == 20) { c *= 0.62 + 0.55 * fbm(uv * 4.0 + p.y * 2.0); }
      else if (uPat == 21) { c *= 0.7 + 0.35 * noise(vec2(uv.x * 30.0, p.y * 3.0)); }
      else if (uPat == 22) { c *= 0.85 + 0.2 * fbm(uv * 7.0); vec2 t = uv / vec2(0.5, 0.25); t.x += 0.5 * mod(floor(t.y), 2.0); c *= 0.75 + 0.25 * line(t.x, 0.03) * line(t.y, 0.05); }
      return c;
    }
    float shadowAt(vec4 ls, float ndl) {
      vec3 q = ls.xyz / ls.w * 0.5 + 0.5;
      if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
      float bias = 0.0008 + 0.0025 * (1.0 - ndl);
      float s = 0.0;
      for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) s += texture(uShadow, vec3(q.xy + vec2(x, y) * uTexel * 1.25, q.z - bias));
      return s / 25.0;
    }
    void main() {
      vec3 n = normalize(vNor); if (!gl_FrontFacing) n = -n;
      vec2 uv = uTexSwap > 0.5 ? vUv.yx : vUv;
      vec3 base = uColor;
      if (uWipe > -0.5) { float d = dot(vPos, uWipePlane.xyz) - uWipePlane.w; base = mix(uColor, uPrev, smoothstep(-0.04, 0.04, d)); }
      if (uTexMode > 0.5) { vec3 t = texture(uTex, uv * uTexScale).rgb; base = uTexMode > 1.5 ? base * t : t; }
      if (uPat == 19) { float h = clamp(n.y * 0.5 + 0.5, 0.0, 1.0); oColor = vec4(pow(mix(uHorizon, uSky, smoothstep(0.45, 0.95, h)), vec3(1.0 / 2.2)), 1.0); return; }
      base = pattern(base, uv, vPos, n);
      vec3 V = normalize(uEye - vPos);
      float ndl = dot(n, uSunDir);
      float sh = (uSunOn > 0.5 && ndl > 0.0) ? shadowAt(vLs, ndl) : 0.0;
      vec3 light = uSunCol * max(ndl, 0.0) * sh;
      float ao = 1.0;
      if (uRoomAO > 0.0) {
        vec3 a = vPos - uRoomMin, b = uRoomMax - vPos;
        float dx = min(a.x, b.x), dy = min(a.y, b.y), dz = min(a.z, b.z);
        float e1 = smoothstep(0.0, 0.55, dx + (abs(n.x) > 0.5 ? 9.0 : 0.0)), e2 = smoothstep(0.0, 0.45, dy + (abs(n.y) > 0.5 ? 9.0 : 0.0)), e3 = smoothstep(0.0, 0.55, dz + (abs(n.z) > 0.5 ? 9.0 : 0.0));
        ao = mix(1.0, 0.72 + 0.28 * e1 * e2 * e3, uRoomAO);
      }
      vec3 hemi = mix(uGround, uSky, n.y * 0.5 + 0.5) * uAmb * ao;
      vec3 spec = vec3(0.0);
      float shin = mix(6.0, 180.0, uGloss);
      for (int i = 0; i < 6; i++) {
        if (i >= uLampN) break;
        vec3 L = uLamp[i].xyz - vPos; float d2 = dot(L, L); L *= inversesqrt(d2);
        float r = uLamp[i].w;
        float nl = max(dot(n, L), 0.0) * 0.8 + 0.2 * max(dot(n, L) * 0.5 + 0.5, 0.0) * step(0.0, r);
        float fall = 1.0 / (1.0 + d2 / (abs(r) * abs(r)));
        light += uLampCol[i] * nl * fall * ao;
        spec += uLampCol[i] * pow(max(dot(n, normalize(L + V)), 0.0), shin) * uGloss * 0.5 * fall;
      }
      if (uSunOn > 0.5) spec += uSunCol * pow(max(dot(n, normalize(uSunDir + V)), 0.0), shin) * uGloss * 0.7 * sh;
      float fres = pow(1.0 - max(dot(n, V), 0.0), 5.0);
      vec3 env = mix(uGround, uSky, reflect(-V, n).y * 0.5 + 0.5) * uAmb;
      vec3 col = base * (light + hemi) + spec + env * fres * uGloss * 0.35 + uEmit;
      col *= uExposure;
      col = mix(col, 0.82 + 0.18 * (1.0 - exp(-(col - 0.82) / 0.18)), step(0.82, col));
      oColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
    }`;
  const VS_SH = `#version 300 es
    layout(location = 0) in vec3 aPos; uniform mat4 uLVP; void main() { gl_Position = uLVP * vec4(aPos, 1.0); }`;
  const FS_SH = `#version 300 es
    precision mediump float; out vec4 o; void main() { o = vec4(1.0); }`;
  const VS_DEC = `#version 300 es
    in vec3 aPos; in vec2 aUv; in float aS; uniform mat4 uVP; out vec2 vUv; out float vS;
    void main() { vUv = aUv; vS = aS; gl_Position = uVP * vec4(aPos, 1.0); }`;
  const FS_DEC = `#version 300 es
    precision mediump float; in vec2 vUv; in float vS; out vec4 o;
    void main() { vec2 q = abs(vUv); float d = length(max(q - 0.55, 0.0)) / 0.45; float a = vS * (1.0 - smoothstep(0.0, 1.0, d)) * (1.0 - smoothstep(0.7, 1.0, max(q.x, q.y)) * 0.0); o = vec4(0.0, 0.0, 0.0, a); }`;
  const VS_SKY = `#version 300 es
    in vec2 aPos; uniform mat4 uInv; out vec3 vDir;
    void main() { vec4 p = uInv * vec4(aPos, 1.0, 1.0); vDir = p.xyz / p.w; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
  const FS_SKY = `#version 300 es
    precision highp float; in vec3 vDir; uniform vec3 uSky, uHorizon, uEyeP, uSunDir; uniform float uSunOn; out vec4 o;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
    void main() { vec3 d = normalize(vDir - uEyeP); float h = clamp(d.y, -0.2, 1.0);
      vec3 c = mix(uHorizon, uSky, smoothstep(0.0, 0.55, h));
      vec2 cp = d.xz / max(d.y, 0.06) * 0.35; float cl = smoothstep(0.55, 0.85, noise(cp * 1.3) * 0.65 + noise(cp * 3.1) * 0.35) * smoothstep(0.02, 0.2, d.y);
      c = mix(c, mix(vec3(1.0), uHorizon, 0.25), cl * 0.55);
      if (uSunOn > 0.5) c += vec3(1.0, 0.9, 0.7) * pow(max(dot(d, uSunDir), 0.0), 300.0) * 1.5;
      o = vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0); }`;

  function compile(gl, vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  // ---------------- light: day, sun, golden hour, night with lamps ----------------
  // The paint colors already carry the light's color shift (the same as the chips), so the lights here change
  // brightness, direction, shadows and the sky; lamps add a little warmth at night.
  const LIGHTS = {
    none: { sun: 0.55, el: 50, amb: 0.95, sky: [0.96, 0.97, 1], ground: [0.74, 0.72, 0.68], horizon: [0.88, 0.92, 0.97], skyTop: [0.52, 0.7, 0.9], win: [0.92, 0.95, 1], exp: 1.0 },
    daylight: { sun: 0.9, el: 48, amb: 0.88, sky: [0.94, 0.96, 1], ground: [0.72, 0.7, 0.66], horizon: [0.86, 0.91, 0.97], skyTop: [0.45, 0.66, 0.9], win: [0.9, 0.94, 1], exp: 1.0 },
    north: { sun: 0, el: 40, amb: 1.0, sky: [0.9, 0.94, 1], ground: [0.7, 0.7, 0.7], horizon: [0.78, 0.82, 0.88], skyTop: [0.6, 0.66, 0.74], win: [0.8, 0.86, 0.95], exp: 0.98, overcast: true },
    sun: { sun: 1.35, el: 34, amb: 0.82, sky: [0.95, 0.96, 1], ground: [0.78, 0.74, 0.66], horizon: [0.9, 0.92, 0.95], skyTop: [0.36, 0.6, 0.9], win: [1, 0.98, 0.94], exp: 0.98 },
    golden: { sun: 1.25, el: 11, amb: 0.7, sky: [0.98, 0.9, 0.82], ground: [0.7, 0.6, 0.5], horizon: [1, 0.74, 0.46], skyTop: [0.5, 0.56, 0.74], win: [1, 0.8, 0.56], exp: 1.0, sunTint: [1, 0.86, 0.68] },
    warm: { sun: 0, el: 30, amb: 0.3, sky: [0.5, 0.52, 0.6], ground: [0.4, 0.36, 0.32], horizon: [0.12, 0.14, 0.22], skyTop: [0.04, 0.05, 0.1], win: [0.06, 0.08, 0.16], exp: 1.05, night: true, lampTint: [1, 0.86, 0.68] },
    soft: { sun: 0, el: 30, amb: 0.32, sky: [0.52, 0.54, 0.6], ground: [0.42, 0.38, 0.34], horizon: [0.12, 0.14, 0.22], skyTop: [0.04, 0.05, 0.1], win: [0.06, 0.08, 0.16], exp: 1.05, night: true, lampTint: [1, 0.9, 0.76] },
    cool: { sun: 0, el: 30, amb: 0.36, sky: [0.56, 0.58, 0.64], ground: [0.44, 0.42, 0.4], horizon: [0.12, 0.14, 0.22], skyTop: [0.04, 0.05, 0.1], win: [0.06, 0.08, 0.16], exp: 1.05, night: true, lampTint: [0.96, 0.97, 1] },
    dim: { sun: 0, el: 30, amb: 0.62, sky: [0.82, 0.84, 0.88], ground: [0.6, 0.58, 0.55], horizon: [0.7, 0.74, 0.8], skyTop: [0.55, 0.6, 0.68], win: [0.7, 0.74, 0.8], exp: 0.9, overcast: true },
  };
  // a color as linear light, with the same light shift and screen tuning as the chips
  function linOf(hex, lightObj, cal) {
    let l = C.hexToLinear(String(hex || 'FFFFFF').replace('#', ''));
    if (lightObj) l = C.applyLight(l, lightObj);
    if (cal && cal.enabled) l = C.applyCalibration(l, cal);
    return l.map(v => Math.max(0, Math.min(1.2, v)));
  }

  const texCache = new Map();
  function woodTexture(spec, gain) {
    // spec: { sp, stain, tint, vertical, seed, board, gap }
    const key = JSON.stringify([spec, gain]);
    if (texCache.has(key)) return texCache.get(key);
    const size = 512;
    const f = WD.boardsField(spec.sp || 'red_oak', size, size, { cm: spec.cm || 0.3, boardCm: spec.board || 12, gapCm: spec.gap || 0, vertical: !!spec.vertical, seed: spec.seed || 1 });
    const cv = document.createElement('canvas');
    WD.paintField(cv, f, { sp: spec.sp || 'red_oak', stain: spec.stain || null, tint: spec.stain ? null : spec.tint || null, gain, sheen: 0 });
    const out = { canvas: cv, meters: size * (spec.cm || 0.3) / 100 };
    texCache.set(key, out);
    if (texCache.size > 40) texCache.delete(texCache.keys().next().value);
    return out;
  }
  function stoneTexture(hex) {
    const key = 'stone' + hex;
    if (texCache.has(key)) return texCache.get(key);
    const f = WD.stoneField(256, 256, { hex: hex || 'ECEAE5', speckle: true });
    const cv = document.createElement('canvas'); WD.paintField(cv, f, {});
    const out = { canvas: cv, meters: 0.9 }; texCache.set(key, out); return out;
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'default' });
      this.gl = gl;
      if (!gl) return;
      this.main = compile(gl, VS, FS);
      this.sh = compile(gl, VS_SH, FS_SH);
      this.dec = compile(gl, VS_DEC, FS_DEC);
      this.sky = compile(gl, VS_SKY, FS_SKY);
      this.shadowSize = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
      const st = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, st);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      this.shadowTex = st;
      this.shadowFb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, st, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.white = this.makeTex(null);
      const sq = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sq); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); this.tri = sq;
      this.textures = new Map();
    }
    makeTex(canvas) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (canvas) gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      if (canvas) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); const af = gl.getExtension('EXT_texture_filter_anisotropic'); if (af) gl.texParameterf(gl.TEXTURE_2D, af.TEXTURE_MAX_ANISOTROPY_EXT, 8); }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      return t;
    }
    texFor(tex) { if (!this.textures.has(tex.canvas)) this.textures.set(tex.canvas, this.makeTex(tex.canvas)); return this.textures.get(tex.canvas); }
    upload(b) {
      const gl = this.gl;
      this.draws = [];
      for (const [name, g] of Object.entries(b.groups)) {
        if (!g.i.length) continue;
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        const buf = (data, loc, size) => { const bb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); return bb; };
        const P = 0, N = 1, U = 2;
        buf(g.p, P, 3); buf(g.n, N, 3); buf(g.u, U, 2);
        const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        const big = g.p.length / 3 > 65535;
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(g.i) : new Uint16Array(g.i), gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        this.draws.push({ name, vao, count: g.i.length, type: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT });
      }
      // floor shadows under furniture: one quad each
      const dp = [], du = [], ds = [], di = [];
      for (const d of b.decals) {
        const c = Math.cos(d.ry), s = Math.sin(d.ry), base = dp.length / 3;
        for (const [ux, uz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lx = ux * d.w / 2 * 1.25, lz = uz * d.d / 2 * 1.25; dp.push(d.x + lx * c - lz * s, d.y, d.z + lx * s + lz * c); du.push(ux, uz); ds.push(d.s); }
        di.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
      this.decal = null;
      if (di.length) {
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        const prog = this.dec.p;
        const buf = (data, name, size) => { const loc = gl.getAttribLocation(prog, name); const bb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
        buf(dp, 'aPos', 3); buf(du, 'aUv', 2); buf(ds, 'aS', 1);
        const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(di), gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        this.decal = { vao, count: di.length };
      }
    }
    // frame: { vp, eye, lvp, sunDir, sunCol, sunOn, sky..., mats: { name -> resolved material }, lamps, room, wipe }
    draw(fr) {
      const gl = this.gl, W = this.canvas.width, H = this.canvas.height;
      // 1. shadow map from the sun
      if (fr.sunOn) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
        gl.useProgram(this.sh.p); gl.uniformMatrix4fv(this.sh.u.uLVP, false, fr.lvp);
        for (const d of this.draws) { const m = fr.mats[d.name]; if (!m || m.noShadow) continue; gl.bindVertexArray(d.vao); gl.drawElements(gl.TRIANGLES, d.count, d.type, 0); }
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      // 2. the scene
      gl.viewport(0, 0, W, H);
      gl.clearColor(fr.clear[0], fr.clear[1], fr.clear[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (fr.skyBox) {
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
        gl.useProgram(this.sky.p);
        gl.uniformMatrix4fv(this.sky.u.uInv, false, fr.inv);
        gl.uniform3fv(this.sky.u.uSky, fr.skyTop); gl.uniform3fv(this.sky.u.uHorizon, fr.horizon); gl.uniform3fv(this.sky.u.uEyeP, fr.eye); gl.uniform3fv(this.sky.u.uSunDir, fr.sunDir); gl.uniform1f(this.sky.u.uSunOn, fr.sunOn && fr.showSun ? 1 : 0);
        const loc = gl.getAttribLocation(this.sky.p, 'aPos');
        if (!this.skyVao) { this.skyVao = gl.createVertexArray(); gl.bindVertexArray(this.skyVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.tri); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
        gl.bindVertexArray(this.skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      const P = this.main, u = P.u;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(u.uVP, false, fr.vp); gl.uniformMatrix4fv(u.uLVP, false, fr.lvp);
      gl.uniform3fv(u.uSunDir, fr.sunDir); gl.uniform3fv(u.uSunCol, fr.sunCol); gl.uniform1f(u.uSunOn, fr.sunOn ? 1 : 0);
      gl.uniform1f(u.uTexel, 1 / this.shadowSize);
      gl.uniform3fv(u.uSky, fr.sky); gl.uniform3fv(u.uGround, fr.ground); gl.uniform3fv(u.uHorizon, fr.horizon); gl.uniform1f(u.uAmb, fr.amb);
      gl.uniform3fv(u.uEye, fr.eye); gl.uniform1f(u.uExposure, fr.exp); gl.uniform1f(u.uTime, fr.time || 0);
      gl.uniform3fv(u.uRoomMin, fr.room ? fr.room.min : [0, 0, 0]); gl.uniform3fv(u.uRoomMax, fr.room ? fr.room.max : [0, 0, 0]); gl.uniform1f(u.uRoomAO, fr.room ? 1 : 0);
      const L = fr.lamps.slice(0, 6), lp = new Float32Array(24), lc = new Float32Array(18);
      L.forEach((l, i) => { lp.set([l.p[0], l.p[1], l.p[2], l.r], i * 4); lc.set(l.c, i * 3); });
      gl.uniform4fv(u.uLamp, lp); gl.uniform3fv(u.uLampCol, lc); gl.uniform1i(u.uLampN, L.length);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.uniform1i(u.uShadow, 1);
      gl.uniform1i(u.uTex, 0);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      for (const d of this.draws) {
        const m = fr.mats[d.name]; if (!m || m.hidden) continue;
        if (m.twoSided) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
        gl.uniform3fv(u.uColor, m.lin); gl.uniform3fv(u.uPrev, m.prev || m.lin); gl.uniform3fv(u.uEmit, m.emit || [0, 0, 0]);
        gl.uniform1f(u.uWipe, m.wipe != null ? m.wipe : -1); gl.uniform4fv(u.uWipePlane, fr.wipePlane || [1, 0, 0, 0]);
        gl.uniform1f(u.uGloss, m.gloss || 0); gl.uniform1i(u.uPat, m.pat || 0); gl.uniform1f(u.uScale, m.scale || 1);
        gl.activeTexture(gl.TEXTURE0);
        if (m.tex) { gl.bindTexture(gl.TEXTURE_2D, this.texFor(m.tex)); gl.uniform1f(u.uTexMode, m.texMul ? 2 : 1); gl.uniform2fv(u.uTexScale, [1 / m.tex.meters, 1 / m.tex.meters]); }
        else { gl.bindTexture(gl.TEXTURE_2D, this.white); gl.uniform1f(u.uTexMode, 0); }
        gl.uniform1f(u.uTexSwap, m.swap ? 1 : 0);
        gl.bindVertexArray(d.vao); gl.drawElements(gl.TRIANGLES, d.count, d.type, 0);
      }
      // 3. soft shadows under furniture
      if (this.decal) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -2);
        gl.useProgram(this.dec.p); gl.uniformMatrix4fv(this.dec.u.uVP, false, fr.vp);
        gl.bindVertexArray(this.decal.vao); gl.drawElements(gl.TRIANGLES, this.decal.count, gl.UNSIGNED_SHORT, 0);
        gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true); gl.disable(gl.BLEND);
      }
      gl.bindVertexArray(null);
    }
    dispose() {
      const gl = this.gl; if (!gl) return;
      const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
      this.gl = null;
    }
  }

  // ================================================================
  // MODELS
  // A material either takes a role's color from the look (wall, trim, cab...), or is a fixed material (metal, glass).
  // part: where a stain goes when the job is staining (floor, cab, furn, trim, door, wain, deck, fence, body...).
  // ================================================================
  function stdMats(b) {
    b.mat('wall', { role: 'wall', color: 'E8E4DC', gloss: 0.04, part: 'wallp' });
    b.mat('side', { role: 'side', color: 'E8E4DC', gloss: 0.04, part: 'wallp' });
    b.mat('ceil', { role: 'ceil', color: 'F4F2ED', noShadow: false });
    b.mat('trim', { role: 'trim', color: 'F2F1EC', gloss: 0.3, part: 'trim' });
    b.mat('door', { role: 'door', color: 'F2F1EC', gloss: 0.3, part: 'door' });
    b.mat('glass', { emit: 'win', noShadow: true });
    b.mat('metal', { color: 'B4B7B9', gloss: 0.75 });
    b.mat('steel', { color: 'C9CCCE', gloss: 0.85 });
    b.mat('black', { color: '2A2A2B', gloss: 0.25 });
    b.mat('brass', { color: 'BC9A45', gloss: 0.85 });
    b.mat('wood', { role: 'wood', color: 'A27B55', wood: { sp: 'walnut', board: 14 }, gloss: 0.25, part: 'furn' });
    b.mat('woodlt', { color: 'C9A77A', wood: { sp: 'white_oak', board: 12 }, gloss: 0.2 });
    b.mat('fabric', { role: 'sofa', color: '8A857E', pat: PAT.fabric });
    b.mat('fabricD', { role: 'sofa-d', color: '77726B', pat: PAT.fabric });
    b.mat('fabricL', { role: 'sofa-l', color: '9A958E', pat: PAT.fabric });
    b.mat('art', { role: 'art', color: '5E6B73', pat: PAT.fabric });
    b.mat('art2', { role: 'art2', color: 'C9B79C', pat: PAT.fabric });
    b.mat('linen', { role: 'duvet', color: 'F1F0EC', pat: PAT.fabric });
    b.mat('curtain', { role: 'curtain', color: 'EEEAE2', pat: PAT.fabric, twoSided: true });
    b.mat('rug', { role: 'rug', color: 'CFC6B8', pat: PAT.carpet });
    b.mat('shade', { role: 'shade', color: 'ECE6DA', emit: 'lamp', twoSided: true, noShadow: true });
    b.mat('leaf', { color: '5E7A4C', pat: PAT.leaves });
    b.mat('pot', { color: 'D9D2C6', gloss: 0.3 });
    b.mat('ceramic', { color: 'F4F4F2', gloss: 0.8 });
    b.mat('counter', { role: 'counter', color: 'ECEAE5', stone: true, gloss: 0.55 });
    b.mat('cab', { role: 'cab', color: 'F2F1EC', gloss: 0.3, part: 'cab' });
    b.mat('tile', { role: 'tile', color: 'F6F5F1', pat: PAT.subway, gloss: 0.5 });
    b.mat('books', { color: '6B5D52' });
    b.mat('wain', { role: 'wain', color: 'F2F1EC', pat: PAT.bead, gloss: 0.3, part: 'wain' });
  }
  // the floor: wood boards (tinted to the floor color), tile, carpet or concrete
  function floorMat(b, kind) {
    if (kind === 'tile') return b.mat('floor', { role: 'floor', color: 'CFCBC4', pat: PAT.tile, gloss: 0.35, part: 'floor' });
    if (kind === 'carpet') return b.mat('floor', { role: 'floor', color: 'BDB3A5', pat: PAT.carpet, part: 'floor' });
    if (kind === 'concrete') return b.mat('floor', { role: 'floor', color: '9C9B97', pat: PAT.concrete, gloss: 0.15, part: 'floor' });
    return b.mat('floor', { role: 'floor', color: 'A9784B', wood: { sp: 'red_oak', board: 12.7, cm: 0.32 }, gloss: 0.3, part: 'floor' });
  }

  // ---- the room: floor, ceiling, walls with real openings, windows, a door, baseboards, crown, wainscoting ----
  // windows: [{ wall: 'left'|'back'|'right', at, w, y0, y1, dir }], door: { wall, at, w, h }
  function room(b, o) {
    const W = o.w || 5.4, D = o.d || 4.8, H = o.h || 2.7;
    const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
    stdMats(b);
    floorMat(b, o.floor || 'wood');
    const walls = {
      back: { o: [x0, 0, z0], u: [1, 0, 0], n: [0, 0, 1], len: W, mat: 'wall' },
      left: { o: [x0, 0, z0], u: [0, 0, 1], n: [1, 0, 0], len: D, mat: o.accentSides ? 'wall' : 'side' },
      right: { o: [x1, 0, z0], u: [0, 0, 1], n: [-1, 0, 0], len: D, mat: o.accentSides ? 'wall' : 'side' },
      // the wall behind the camera: out of the picture, but there when the room is turned around in 3D
      front: { o: [x1, 0, z1], u: [-1, 0, 0], n: [0, 0, -1], len: W, mat: o.accentSides ? 'wall' : 'side' },
    };
    const holes = { back: [], left: [], right: [], front: [] };
    for (const w of o.windows || []) holes[w.wall].push([w.at - w.w / 2, w.at + w.w / 2, w.y0, w.y1]);
    if (o.door) holes[o.door.wall].push([o.door.at - o.door.w / 2, o.door.at + o.door.w / 2, 0, o.door.h]);
    for (const k of Object.keys(walls)) { const wl = walls[k]; b.wall(wl.mat, wl.o, wl.u, wl.n, wl.len, H, holes[k]); }
    b.quad('floor', [x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [0, 1, 0]);
    b.quad('ceil', [x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], [0, -1, 0]);
    const P = (wl, u, y, out) => [wl.o[0] + wl.u[0] * u + wl.n[0] * (out || 0), y, wl.o[2] + wl.u[2] * u + wl.n[2] * (out || 0)];
    // a flat box lying on a wall: from u0 to u1 along it, y0 to y1 up, standing d out from it
    const onWall = (mat, wl, u0, u1, y0, y1, d, back) => {
      const a = P(wl, u0, y0, back || 0), c = P(wl, u1, y1, d);
      b.box(mat, Math.min(a[0], c[0]), y0, Math.min(a[2], c[2]), Math.max(a[0], c[0]), y1, Math.max(a[2], c[2]));
    };
    // baseboards, broken at the door
    for (const k of Object.keys(walls)) {
      const wl = walls[k];
      const cuts = holes[k].filter(h => h[2] <= 0.01).sort((a, c) => a[0] - c[0]);
      let u = 0;
      for (const h of cuts.concat([[wl.len, wl.len]])) { if (h[0] - u > 0.05) onWall('trim', wl, u, h[0], 0, 0.13, 0.018); u = h[1]; }
      if (o.crown) onWall('trim', wl, 0, wl.len, H - 0.11, H, 0.07);
      if (o.wainscot) {
        let u2 = 0;
        for (const h of cuts.concat([[wl.len, wl.len]])) {
          if (h[0] - u2 > 0.05) { onWall('wain', wl, u2, h[0], 0.13, 0.92, 0.012); onWall('wain', wl, u2, h[0], 0.92, 0.97, 0.035); }
          u2 = h[1];
        }
      }
    }
    // windows: recessed glass, casing, sill, muntins and sometimes curtains
    for (const w of o.windows || []) {
      const wl = walls[w.wall], u0 = w.at - w.w / 2, u1 = w.at + w.w / 2, dpt = 0.16;
      // reveals (the wall's thickness around the glass)
      const rv = (a, c, n) => b.quad(wl.mat, a[0], a[1], c[0], c[1], n);
      const A = (u, y, out) => P(wl, u, y, out);
      rv([A(u0, w.y0, 0), A(u0, w.y0, -dpt)], [A(u0, w.y1, -dpt), A(u0, w.y1, 0)], wl.u);
      rv([A(u1, w.y0, 0), A(u1, w.y0, -dpt)], [A(u1, w.y1, -dpt), A(u1, w.y1, 0)], scl(wl.u, -1));
      rv([A(u0, w.y1, 0), A(u1, w.y1, 0)], [A(u1, w.y1, -dpt), A(u0, w.y1, -dpt)], [0, -1, 0]);
      b.quad('trim', A(u0, w.y0, 0), A(u1, w.y0, 0), A(u1, w.y0, -dpt), A(u0, w.y0, -dpt), [0, 1, 0]);
      b.quad('glass', A(u0, w.y0, -dpt + 0.02), A(u1, w.y0, -dpt + 0.02), A(u1, w.y1, -dpt + 0.02), A(u0, w.y1, -dpt + 0.02), wl.n);
      // sashes and muntins
      const mu = (a0, a1, y0, y1) => onWall('trim', wl, a0, a1, y0, y1, -dpt + 0.06, -dpt + 0.025);
      mu(u0, u1, w.y0, w.y0 + 0.05); mu(u0, u1, w.y1 - 0.05, w.y1); mu(u0, u0 + 0.05, w.y0, w.y1); mu(u1 - 0.05, u1, w.y0, w.y1);
      const midY = (w.y0 + w.y1) / 2; mu(u0, u1, midY - 0.03, midY + 0.03);
      if (w.w > 0.9) mu(w.at - 0.015, w.at + 0.015, w.y0, w.y1);
      // casing and stool
      onWall('trim', wl, u0 - 0.09, u0, w.y0 - 0.06, w.y1 + 0.09, 0.022); onWall('trim', wl, u1, u1 + 0.09, w.y0 - 0.06, w.y1 + 0.09, 0.022);
      onWall('trim', wl, u0 - 0.1, u1 + 0.1, w.y1, w.y1 + 0.1, 0.026);
      onWall('trim', wl, u0 - 0.12, u1 + 0.12, w.y0 - 0.03, w.y0, 0.06);
      if (w.curtains) for (const side of [-1, 1]) curtain(b, P(wl, side < 0 ? u0 - 0.25 : u1 + 0.05, 0, 0.1), wl.u, wl.n, 0.22, w.y1 + 0.18);
      if (w.curtains) onWall('black', wl, u0 - 0.35, u1 + 0.35, w.y1 + 0.2, w.y1 + 0.225, 0.12, 0.1);
      b.windows.push({ center: P(wl, w.at, midY, 0), out: scl(wl.n, -1), dir: w.dir || '?', w: w.w, h: w.y1 - w.y0 });
    }
    if (o.door) {
      const d = o.door, wl = walls[d.wall], u0 = d.at - d.w / 2, u1 = d.at + d.w / 2;
      onWall('trim', wl, u0 - 0.08, u0, 0, d.h + 0.08, 0.022); onWall('trim', wl, u1, u1 + 0.08, 0, d.h + 0.08, 0.022); onWall('trim', wl, u0 - 0.09, u1 + 0.09, d.h, d.h + 0.1, 0.026);
      // a closed panel door, set a little back
      onWall('door', wl, u0, u1, 0, d.h, -0.02, -0.06);
      const pan = (a0, a1, y0, y1) => onWall('door', wl, a0, a1, y0, y1, -0.005, -0.03);
      const m = (u0 + u1) / 2;
      pan(u0 + 0.1, m - 0.05, 1.12, d.h - 0.12); pan(m + 0.05, u1 - 0.1, 1.12, d.h - 0.12); pan(u0 + 0.1, m - 0.05, 0.14, 0.98); pan(m + 0.05, u1 - 0.1, 0.14, 0.98);
      const k = P(wl, u1 - 0.09, 1.0, 0.01); b.sphere('brass', k[0], k[1], k[2], 0.03, 0.03, 0.03, 10);
    }
    b.room = { min: [x0, 0, z0], max: [x1, H, z1] };
    return { W, D, H, x0, x1, z0, z1, walls, onWall };
  }
  // a curtain panel with soft folds, hanging along a wall
  function curtain(b, start, u, n, width, top) {
    const folds = 5, seg = folds * 4, g = b.grp('curtain');
    const ids = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, off = Math.sin(t * folds * Math.PI * 2) * 0.035 + 0.04;
      const base = [start[0] + u[0] * width * t + n[0] * off, 0, start[2] + u[2] * width * t + n[2] * off];
      const nn = norm(add(n, scl(u, -Math.cos(t * folds * Math.PI * 2) * 0.8)));
      ids.push([b.vert(g, [base[0], 0.02, base[2]], nn), b.vert(g, [base[0], top, base[2]], nn)]);
    }
    for (let i = 0; i < seg; i++) { const [a, c] = ids[i], [d, e] = ids[i + 1]; g.i.push(a, d, e, a, e, c); }
  }

  // ---- furniture ----
  function sofa(b, x, z, ry, L, o) {
    o = o || {}; L = L || 2.2;
    b.push().at(x, 0, z, ry);
    const D = 0.92, l = -L / 2, r = L / 2;
    b.rbox('fabricD', l + 0.12, 0.12, -D / 2, r - 0.12, 0.42, D / 2 - 0.04, 0.06);
    const n = L > 2 ? 3 : 2, w = (L - 0.36) / n;
    for (let i = 0; i < n; i++) b.rbox('fabric', l + 0.18 + i * w + 0.01, 0.4, -D / 2 + 0.2, l + 0.18 + (i + 1) * w - 0.01, 0.56, D / 2 - 0.02, 0.07);
    for (let i = 0; i < n; i++) b.rbox('fabricL', l + 0.18 + i * w + 0.01, 0.44, -D / 2 + 0.02, l + 0.18 + (i + 1) * w - 0.01, 0.95, -D / 2 + 0.26, 0.08);
    b.rbox('fabricD', l, 0.12, -D / 2, l + 0.2, 0.68, D / 2, 0.07); b.rbox('fabricD', r - 0.2, 0.12, -D / 2, r, 0.68, D / 2, 0.07);
    b.rbox('fabricD', l + 0.1, 0.4, -D / 2, r - 0.1, 0.84, -D / 2 + 0.16, 0.06);
    for (const [px, pz] of [[l + 0.08, -D / 2 + 0.08], [r - 0.08, -D / 2 + 0.08], [l + 0.08, D / 2 - 0.08], [r - 0.08, D / 2 - 0.08]]) b.cyl('black', px, 0, pz, 0.025, 0.12, 8);
    if (!o.noPillows) { b.push().at(l + 0.42, 0.72, -D / 2 + 0.34, 0.25); b.rbox('art', -0.2, -0.17, -0.06, 0.2, 0.17, 0.06, 0.06); b.pop(); b.push().at(r - 0.42, 0.72, -D / 2 + 0.34, -0.25); b.rbox('art2', -0.2, -0.17, -0.06, 0.2, 0.17, 0.06, 0.06); b.pop(); }
    b.shadow(0, 0, L + 0.1, D + 0.1, 0.5);
    b.pop();
  }
  function armchair(b, x, z, ry, mat) {
    b.push().at(x, 0, z, ry);
    b.rbox(mat || 'fabricD', -0.42, 0.12, -0.4, 0.42, 0.42, 0.4, 0.06);
    b.rbox(mat || 'fabric', -0.3, 0.4, -0.22, 0.3, 0.54, 0.38, 0.06);
    b.rbox(mat || 'fabricL', -0.32, 0.42, -0.4, 0.32, 0.92, -0.2, 0.07);
    b.rbox(mat || 'fabricD', -0.42, 0.12, -0.4, -0.28, 0.64, 0.4, 0.06); b.rbox(mat || 'fabricD', 0.28, 0.12, -0.4, 0.42, 0.64, 0.4, 0.06);
    for (const [px, pz] of [[-0.36, -0.34], [0.36, -0.34], [-0.36, 0.34], [0.36, 0.34]]) b.cyl('black', px, 0, pz, 0.022, 0.12, 8);
    b.shadow(0, 0, 0.9, 0.85, 0.45);
    b.pop();
  }
  function coffeeTable(b, x, z, ry, mat) {
    b.push().at(x, 0, z, ry);
    b.rbox(mat || 'wood', -0.6, 0.38, -0.32, 0.6, 0.43, 0.32, 0.012, 2);
    for (const [px, pz] of [[-0.54, -0.26], [0.54, -0.26], [-0.54, 0.26], [0.54, 0.26]]) b.box(mat || 'wood', px - 0.025, 0, pz - 0.025, px + 0.025, 0.38, pz + 0.025);
    b.box(mat || 'wood', -0.54, 0.1, -0.26, 0.54, 0.12, 0.26);
    b.box('books', -0.2, 0.43, -0.12, 0.1, 0.47, 0.08); b.box('art', -0.17, 0.47, -0.1, 0.07, 0.49, 0.06);
    b.lathe('ceramic', 0.3, 0.43, 0.02, [[0.0, 0], [0.07, 0.005], [0.08, 0.04], [0.06, 0.05]], 16);
    b.shadow(0, 0, 1.25, 0.7, 0.35);
    b.pop();
  }
  function rug(b, x, z, w, d, ry) { b.push().at(x, 0, z, ry); b.box('rug', -w / 2, 0.002, -d / 2, w / 2, 0.012, d / 2, 'b'); b.pop(); }
  function floorLamp(b, x, z) {
    b.cyl('black', x, 0, z, 0.16, 0.02, 18); b.cyl('black', x, 0.02, z, 0.013, 1.42, 8);
    b.cyl('shade', x, 1.32, z, 0.23, 0.32, 24, 0.17, ''); b.lamp(x, 1.42, z, 1.1);
    b.shadow(x, z, 0.4, 0.4, 0.4);
  }
  function tableLamp(b, x, y, z) {
    b.lathe('ceramic', x, y, z, [[0.0, 0], [0.07, 0.01], [0.09, 0.1], [0.06, 0.2], [0.02, 0.26], [0.0, 0.27]], 16);
    b.cyl('black', x, y + 0.26, z, 0.008, 0.12, 6);
    b.cyl('shade', x, y + 0.3, z, 0.15, 0.2, 20, 0.11, ''); b.lamp(x, y + 0.38, z, 0.75);
  }
  function plant(b, x, z, s, y) {
    s = s || 1; y = y || 0;
    b.lathe('pot', x, y, z, [[0, 0], [0.13 * s, 0.005], [0.16 * s, 0.3 * s], [0.17 * s, 0.32 * s], [0, 0.32 * s]], 18);
    const R = rnd(Math.round(x * 100 + z * 7 + 3));
    for (let i = 0; i < 9; i++) { const a = R() * Math.PI * 2, rr = R() * 0.18 * s; b.sphere('leaf', x + Math.cos(a) * rr, y + (0.45 + R() * 0.5) * s, z + Math.sin(a) * rr, (0.12 + R() * 0.08) * s, (0.16 + R() * 0.12) * s, (0.12 + R() * 0.08) * s, 10); }
    b.shadow(x, z, 0.45 * s, 0.45 * s, 0.4);
  }
  // a framed picture hanging on a wall (u: along the wall, n: out from it)
  function art(b, c, u, n, w, h) {
    const pt = (du, dv, out) => [c[0] + u[0] * du + n[0] * out, c[1] + dv, c[2] + u[2] * du + n[2] * out];
    const bx = (mat, u0, u1, v0, v1, o0, o1) => { const a = pt(u0, v0, o0), d = pt(u1, v1, o1); b.box(mat, Math.min(a[0], d[0]), Math.min(a[1], d[1]), Math.min(a[2], d[2]), Math.max(a[0], d[0]), Math.max(a[1], d[1]), Math.max(a[2], d[2])); };
    bx('black', -w / 2, w / 2, -h / 2, h / 2, 0, 0.03);
    bx('ceramic', -w / 2 + 0.03, w / 2 - 0.03, -h / 2 + 0.03, h / 2 - 0.03, 0.03, 0.033);
    bx('art', -w / 2 + 0.1, w / 2 - 0.1, -h / 2 + 0.1, h / 2 - 0.1, 0.033, 0.036);
    bx('art2', -w / 2 + 0.1, w / 2 - 0.1, -h / 2 + 0.1, -h / 2 + 0.1 + (h - 0.2) * 0.38, 0.036, 0.038);
  }
  function ceilingLight(b, H, x, z) { b.cyl('ceramic', x, H - 0.08, z, 0.22, 0.08, 24, 0.2, 'b'); b.disc('shade', x, H - 0.081, z, 0.2, 24, -1); b.lamp(x, H - 0.3, z, 1.4); }
  function pendant(b, H, x, z, drop, r) { b.cyl('black', x, H - drop, z, 0.006, drop, 6); b.cyl('shade', x, H - drop - 0.22, z, r || 0.2, 0.22, 24, 0.05, ''); b.lamp(x, H - drop - 0.2, z, 1.1); }
  function bed(b, x, z, ry, Wd, kids) {
    Wd = Wd || 1.65;
    b.push().at(x, 0, z, ry);
    const L = kids ? 1.95 : 2.1, hw = Wd / 2;
    b.rbox('fabricD', -hw - 0.05, 0.05, -L / 2 - 0.06, hw + 0.05, kids ? 0.95 : 1.25, -L / 2 + 0.06, 0.05);
    b.box('wood', -hw, 0.05, -L / 2, hw, 0.3, L / 2);
    for (const [px, pz] of [[-hw + 0.05, -L / 2 + 0.05], [hw - 0.05, -L / 2 + 0.05], [-hw + 0.05, L / 2 - 0.05], [hw - 0.05, L / 2 - 0.05]]) b.box('wood', px - 0.04, 0, pz - 0.04, px + 0.04, 0.05, pz + 0.04);
    b.rbox('linen', -hw + 0.02, 0.3, -L / 2 + 0.04, hw - 0.02, 0.52, L / 2 - 0.02, 0.07);
    b.rbox('linen', -hw - 0.03, 0.42, -L / 2 + 0.6, hw + 0.03, 0.58, L / 2 + 0.02, 0.06);
    b.rbox('art2', -hw - 0.035, 0.42, L / 2 - 0.55, hw + 0.035, 0.6, L / 2 - 0.15, 0.06);
    for (const s of kids ? [0] : [-1, 1]) b.rbox('linen', s * hw * 0.48 - (kids ? 0.36 : 0.34), 0.5, -L / 2 + 0.1, s * hw * 0.48 + (kids ? 0.36 : 0.34), 0.66, -L / 2 + 0.42, 0.07);
    b.push().at(0, 0.66, -L / 2 + 0.47, 0); b.rbox('art', -0.3, -0.1, -0.06, 0.3, 0.12, 0.06, 0.06); b.pop();
    b.shadow(0, 0, Wd + 0.3, L + 0.2, 0.5);
    b.pop();
  }
  function nightstand(b, x, z, ry, lamp) {
    b.push().at(x, 0, z, ry);
    b.box('wood', -0.25, 0.08, -0.2, 0.25, 0.58, 0.2);
    b.box('wood', -0.23, 0.36, 0.2, 0.23, 0.55, 0.215); b.box('brass', -0.05, 0.44, 0.215, 0.05, 0.46, 0.23);
    for (const [px, pz] of [[-0.21, -0.16], [0.21, -0.16], [-0.21, 0.16], [0.21, 0.16]]) b.box('wood', px - 0.02, 0, pz - 0.02, px + 0.02, 0.08, pz + 0.02);
    if (lamp !== false) tableLamp(b, 0, 0.58, -0.02);
    b.shadow(0, 0, 0.55, 0.45, 0.4);
    b.pop();
  }
  function dresser(b, x, z, ry, mat, wide) {
    mat = mat || 'cab'; wide = wide || 1.3;
    b.push().at(x, 0, z, ry);
    const hw = wide / 2;
    b.box(mat, -hw, 0.1, -0.24, hw, 0.92, 0.24);
    b.box('wood', -hw - 0.02, 0.92, -0.26, hw + 0.02, 0.95, 0.26);
    for (let i = 0; i < 3; i++) { const y0 = 0.14 + i * 0.26, y1 = y0 + 0.23; b.box(mat, -hw + 0.03, y0, 0.24, hw - 0.03, y1, 0.255); for (const s of [-1, 1]) b.box('brass', s * hw * 0.5 - 0.06, (y0 + y1) / 2 - 0.008, 0.255, s * hw * 0.5 + 0.06, (y0 + y1) / 2 + 0.008, 0.27); }
    for (const [px, pz] of [[-hw + 0.05, -0.2], [hw - 0.05, -0.2], [-hw + 0.05, 0.2], [hw - 0.05, 0.2]]) b.cyl('wood', px, 0, pz, 0.025, 0.1, 8, 0.03);
    b.shadow(0, 0, wide + 0.1, 0.55, 0.45);
    b.pop();
  }
  function shelves(b, x, z, ry, w, h, mat, rows) {
    mat = mat || 'cab'; rows = rows || 5;
    b.push().at(x, 0, z, ry);
    const hw = w / 2, d = 0.34;
    b.box(mat, -hw, 0, -d / 2, -hw + 0.03, h, d / 2); b.box(mat, hw - 0.03, 0, -d / 2, hw, h, d / 2); b.box(mat, -hw, h - 0.03, -d / 2, hw, h, d / 2);
    b.box(mat, -hw, 0, -d / 2, hw, h, -d / 2 + 0.01);
    const R = rnd(Math.round(x * 100 + 5));
    const bookMats = ['art', 'art2', 'books', 'fabricD', 'woodlt'];
    for (let r = 0; r < rows; r++) {
      const y = 0.08 + r * (h - 0.1) / rows;
      b.box(mat, -hw + 0.03, y - 0.025, -d / 2, hw - 0.03, y, d / 2);
      if (r === 0) { b.box(mat, -hw + 0.03, 0, d / 2 - 0.02, hw - 0.03, y - 0.025, d / 2); continue; }
      let u = -hw + 0.06;
      while (u < hw - 0.12) {
        if (R() < 0.18) { u += 0.12 + R() * 0.15; continue; }
        const bw = 0.025 + R() * 0.03, bh = 0.18 + R() * 0.12;
        b.box(bookMats[Math.floor(R() * bookMats.length)], u, y, -d / 2 + 0.04, u + bw, y + bh, d / 2 - 0.08); u += bw + 0.004;
        if (R() < 0.08) { b.lathe('pot', u + 0.08, y, 0, [[0, 0], [0.05, 0.01], [0.06, 0.12], [0.03, 0.18], [0, 0.18]], 12); u += 0.18; }
      }
    }
    b.shadow(0, 0, w, d + 0.1, 0.35);
    b.pop();
  }
  // a run of base cabinets with a counter and doors (frame and panel), along the back wall
  function cabinets(b, x0, x1, z, o) {
    o = o || {};
    const d = 0.6, h = 0.88, mat = o.mat || 'cab';
    b.box(mat, x0, 0.1, z, x1, h, z + d);
    b.box('black', x0 + 0.02, 0, z + 0.05, x1 - 0.02, 0.1, z + d - 0.06);
    const n = Math.max(1, Math.round((x1 - x0) / 0.6)), w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const a = x0 + i * w + 0.01, c = a + w - 0.02;
      if (o.sinkAt != null && Math.abs((a + c) / 2 - o.sinkAt) < w / 2) { cabDoor(b, mat, a, c, 0.12, h - 0.06, z + d, true); continue; }
      cabDoor(b, mat, a, c, 0.12, h - 0.24, z + d, true);
      cabDoor(b, mat, a, c, h - 0.22, h - 0.04, z + d, false, true);
    }
    b.box('counter', x0 - 0.02, h, z - 0.0, x1 + 0.02, h + 0.035, z + d + 0.03);
    b.shadow((x0 + x1) / 2, z + d / 2 + 0.05, x1 - x0 + 0.1, d + 0.2, 0.35);
  }
  // a cabinet door or drawer front: a frame with a recessed panel and a metal handle
  function cabDoor(b, mat, x0, x1, y0, y1, z, door, drawer) {
    b.box(mat, x0, y0, z, x1, y1, z + 0.02);
    const fr = Math.min(0.06, (x1 - x0) * 0.18, (y1 - y0) * 0.2);
    b.box(mat, x0 + fr, y0 + fr, z + 0.012, x1 - fr, y1 - fr, z + 0.016);
    if (drawer) b.box('steel', (x0 + x1) / 2 - 0.08, (y0 + y1) / 2 - 0.006, z + 0.02, (x0 + x1) / 2 + 0.08, (y0 + y1) / 2 + 0.006, z + 0.04);
    else if (door) b.box('steel', x1 - 0.05, y1 - 0.2, z + 0.02, x1 - 0.038, y1 - 0.05, z + 0.04);
  }
  function upperCabinets(b, x0, x1, z, y0, y1, mat) {
    mat = mat || 'cab'; const d = 0.34;
    b.box(mat, x0, y0, z, x1, y1, z + d);
    const n = Math.max(1, Math.round((x1 - x0) / 0.5)), w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) { const a = x0 + i * w + 0.01; b.box(mat, a, y0 + 0.01, z + d, a + w - 0.02, y1 - 0.01, z + d + 0.02); const fr = 0.06; b.box(mat, a + fr, y0 + fr, z + d + 0.012, a + w - 0.02 - fr, y1 - fr, z + d + 0.016); b.box('steel', i % 2 ? a + 0.04 : a + w - 0.06, y0 + 0.05, z + d + 0.02, i % 2 ? a + 0.052 : a + w - 0.048, y0 + 0.2, z + d + 0.04); }
  }
  function sinkFaucet(b, x, y, z) {
    b.box('black', x - 0.32, y - 0.005, z + 0.12, x + 0.32, y + 0.002, z + 0.5);
    b.cyl('steel', x, y, z + 0.08, 0.025, 0.28, 10); b.rod('steel', 'z', x, y + 0.28, z + 0.17, 0.016, 0.2, 8);
  }
  function range(b, x, z) {
    b.rbox('steel', x - 0.38, 0, z, x + 0.38, 0.9, z + 0.62, 0.01, 1);
    b.box('black', x - 0.38, 0.9, z, x + 0.38, 0.93, z + 0.62);
    b.box('black', x - 0.3, 0.2, z + 0.62, x + 0.3, 0.62, z + 0.63);
    for (let i = 0; i < 5; i++) b.cyl('black', x - 0.28 + i * 0.14, 0.75, z + 0.63, 0.02, 0.03, 10);
  }
  function hood(b, x, z, H) {
    b.box('steel', x - 0.4, 1.62, z, x + 0.4, 1.72, z + 0.5);
    b.cyl('steel', x, 1.72, z + 0.2, 0.18, H - 1.72, 4, 0.14, '');
  }
  function stool(b, x, z) { b.cyl('wood', x, 0.66, z, 0.18, 0.05, 16); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; b.cyl('black', x + Math.cos(a) * 0.12, 0, z + Math.sin(a) * 0.12, 0.012, 0.66, 6); } b.shadow(x, z, 0.4, 0.4, 0.3); }
  function diningTable(b, x, z, mat, chairsMat) {
    mat = mat || 'wood';
    b.box(mat, x - 0.95, 0.72, z - 0.48, x + 0.95, 0.76, z + 0.48);
    for (const [px, pz] of [[-0.85, -0.38], [0.85, -0.38], [-0.85, 0.38], [0.85, 0.38]]) b.box(mat, x + px - 0.035, 0, z + pz - 0.035, x + px + 0.035, 0.72, z + pz + 0.035);
    for (const [cx, cz, ry] of [[-0.5, -0.75, 0], [0.5, -0.75, 0], [-0.5, 0.75, Math.PI], [0.5, 0.75, Math.PI], [-1.25, 0, Math.PI / 2], [1.25, 0, -Math.PI / 2]]) chair(b, x + cx, z + cz, ry, chairsMat || mat);
    b.lathe('ceramic', x, 0.76, z, [[0, 0], [0.16, 0.01], [0.18, 0.05], [0.12, 0.06]], 20);
    for (let i = 0; i < 5; i++) b.sphere('leaf', x - 0.06 + i * 0.03, 0.83, z + (i % 2 ? 0.03 : -0.03), 0.05, 0.04, 0.05, 8);
    b.shadow(x, z, 2.3, 1.6, 0.45);
  }
  function chair(b, x, z, ry, mat) {
    b.push().at(x, 0, z, ry);
    b.box(mat, -0.22, 0.44, -0.2, 0.22, 0.48, 0.22);
    for (const [px, pz] of [[-0.19, -0.17], [0.19, -0.17], [-0.19, 0.19], [0.19, 0.19]]) b.box(mat, px - 0.02, 0, pz - 0.02, px + 0.02, 0.44, pz + 0.02);
    b.box(mat, -0.21, 0.48, -0.21, -0.17, 0.92, -0.17); b.box(mat, 0.17, 0.48, -0.21, 0.21, 0.92, -0.17);
    for (let i = 0; i < 3; i++) b.box(mat, -0.17, 0.62 + i * 0.1, -0.205, 0.17, 0.66 + i * 0.1, -0.175);
    b.rbox('fabricL', -0.2, 0.48, -0.18, 0.2, 0.52, 0.2, 0.02, 1);
    b.pop();
  }
  function desk(b, x, z, ry) {
    b.push().at(x, 0, z, ry);
    b.box('wood', -0.75, 0.72, -0.33, 0.75, 0.76, 0.33);
    for (const s of [-1, 1]) b.box('black', s * 0.7 - 0.02, 0, -0.3, s * 0.7 + 0.02, 0.72, 0.3);
    b.box('black', -0.3, 0.76, -0.18, 0.3, 0.77, -0.04); b.box('black', -0.02, 0.77, -0.12, 0.02, 0.95, -0.1);
    b.box('black', -0.32, 0.92, -0.14, 0.32, 1.28, -0.11); b.box('glass', -0.3, 0.94, -0.11, 0.3, 1.26, -0.105);
    b.box('ceramic', -0.2, 0.76, 0.05, 0.2, 0.775, 0.17);
    tableLamp(b, 0.55, 0.76, -0.15);
    // chair
    b.push().at(0, 0, 0.55, Math.PI); b.rbox('fabricD', -0.25, 0.45, -0.25, 0.25, 0.53, 0.25, 0.04); b.rbox('fabricD', -0.23, 0.55, -0.27, 0.23, 1.05, -0.2, 0.05); b.cyl('black', 0, 0.06, 0, 0.03, 0.4, 8); b.cyl('black', 0, 0, 0, 0.28, 0.06, 5, 0.05, 'tb'); b.pop();
    b.shadow(0, 0.15, 1.6, 1.2, 0.4);
    b.pop();
  }
  function vanity(b, x, z, w, mat) {
    mat = mat || 'vanity';
    b.mat('vanity', { role: 'vanity', color: 'F2F1EC', gloss: 0.3, part: 'cab' });
    const x0 = x - w / 2, x1 = x + w / 2;
    b.box(mat, x0, 0.12, z, x1, 0.84, z + 0.55); b.box('black', x0 + 0.02, 0, z + 0.04, x1 - 0.02, 0.12, z + 0.5);
    const n = Math.max(2, Math.round(w / 0.45)), dw = w / n;
    for (let i = 0; i < n; i++) cabDoor(b, mat, x0 + i * dw + 0.01, x0 + (i + 1) * dw - 0.01, 0.14, 0.82, z + 0.55, true);
    // a stone top with a white vessel sink, a tall faucet, and a framed mirror between two sconces
    b.rbox('counter', x0 - 0.02, 0.84, z, x1 + 0.02, 0.875, z + 0.58, 0.008, 1);
    b.lathe('ceramic', x, 0.875, z + 0.3, [[0.0, 0.002], [0.11, 0.004], [0.17, 0.03], [0.2, 0.1], [0.205, 0.13], [0.195, 0.13], [0.18, 0.1], [0.12, 0.035], [0.0, 0.02]], 32);
    b.cyl('steel', x, 0.875, z + 0.07, 0.017, 0.3, 12); b.rod('steel', 'z', x, 1.17, z + 0.15, 0.013, 0.17, 10); b.cyl('steel', x, 1.11, z + 0.23, 0.01, 0.06, 8);
    b.cyl('steel', x + 0.09, 0.875, z + 0.07, 0.012, 0.06, 8);
    b.mat('mirror', { color: 'C9D2D7', gloss: 1, pat: PAT.plain, emit: 'mirror' });
    b.rbox('black', x - 0.34, 1.22, z, x + 0.34, 2.0, z + 0.035, 0.03, 2); b.box('mirror', x - 0.31, 1.25, z + 0.035, x + 0.31, 1.97, z + 0.037);
    for (const s of [-1, 1]) { const sx = x + s * 0.5; b.cyl('brass', sx, 1.6, z + 0.002, 0.035, 0.012, 14, 0.035); b.push().at(sx, 1.6, z + 0.012, 0); b.rod('brass', 'z', 0, 0.02, 0.05, 0.006, 0.1, 8); b.pop(); b.lathe('shade', sx, 1.56, z + 0.1, [[0.03, 0], [0.055, 0.05], [0.06, 0.12], [0.045, 0.16], [0.0, 0.165]], 16); b.lamp(sx, 1.66, z + 0.25, 0.5); }
    b.shadow(x, z + 0.3, w + 0.1, 0.7, 0.4);
  }
  // an alcove tub: a white shell with a real basin inside, a tiled surround, a shower head and a curtain
  function tub(b, x0, x1, z0, z1, H) {
    const t = 0.075, h = 0.56;
    b.rbox('ceramic', x0, 0, z0, x0 + t, h, z1, 0.03, 2);
    b.rbox('ceramic', x1 - t, 0, z0, x1, h, z1, 0.03, 2);
    b.rbox('ceramic', x0, 0, z0, x1, h, z0 + t, 0.03, 2);
    b.rbox('ceramic', x0, 0, z1 - t, x1, h, z1, 0.03, 2);
    b.box('ceramic', x0 + t, 0.08, z0 + t, x1 - t, 0.12, z1 - t);
    b.cyl('steel', x0 + (x1 - x0) / 2, 0.12, z0 + 0.25, 0.025, 0.004, 14);
    // white subway tile up the walls around it
    b.box('tile', x1 - 0.006, h, z0, x1, 2.05, z1); b.box('tile', x0, h, z0, x1, 2.05, z0 + 0.006);
    // tub spout, handle and shower head on the end wall
    b.push().at(x0 + (x1 - x0) / 2, 0, z0 + 0.006, 0);
    b.rod('steel', 'z', 0, 0.68, 0.06, 0.02, 0.12, 10); b.cyl('steel', 0, 1.0, 0.02, 0.035, 0.04, 14);
    b.rod('steel', 'z', 0, 1.92, 0.07, 0.012, 0.14, 8); b.cyl('steel', 0, 1.86, 0.15, 0.07, 0.06, 18, 0.04);
    b.pop();
    // a curtain rod with the curtain drawn back
    b.rod('steel', 'z', x0 + 0.03, 2.08, (z0 + z1) / 2, 0.012, z1 - z0, 8);
    b.mat('showercurtain', { role: 'art2', color: 'E8E2D6', pat: PAT.fabric, twoSided: true });
    const g = b.grp('showercurtain'), seg = 28, w = (z1 - z0) * 0.3, ids = [];
    for (let i = 0; i <= seg; i++) {
      const tt = i / seg, off = Math.sin(tt * Math.PI * 9) * 0.03;
      const zz = z0 + 0.04 + w * tt, nn = norm([Math.cos(tt * Math.PI * 9) * 0.9, 0, 1]);
      ids.push([b.vert(g, [x0 + 0.03 + off, 0.25, zz], nn), b.vert(g, [x0 + 0.03 + off, 2.06, zz], nn)]);
    }
    for (let i = 0; i < seg; i++) { const [a, c] = ids[i], [d, e] = ids[i + 1]; g.i.push(a, d, e, a, e, c); }
    b.shadow((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 0.1, z1 - z0 + 0.1, 0.35);
  }
  // a toilet: tank against the wall, an elongated bowl, seat and lid
  function toilet(b, x, z, ry) {
    b.push().at(x, 0, z, ry);
    b.rbox('ceramic', -0.21, 0.42, -0.2, 0.21, 0.8, -0.02, 0.04);
    b.rbox('ceramic', -0.22, 0.8, -0.215, 0.22, 0.83, -0.005, 0.015, 1);
    b.cyl('steel', -0.15, 0.71, -0.02, 0.012, 0.01, 10);
    b.lathe('ceramic', 0, 0, 0.17, [[0.1, 0], [0.105, 0.05], [0.12, 0.22], [0.0, 0.22]], 18);
    b.sphere('ceramic', 0, 0.3, 0.17, 0.19, 0.1, 0.25, 20);
    b.rbox('ceramic', -0.185, 0.385, -0.03, 0.185, 0.41, 0.42, 0.04);
    b.rbox('ceramic', -0.18, 0.41, -0.03, 0.18, 0.43, 0.4, 0.04);
    b.shadow(0, 0.15, 0.5, 0.7, 0.4);
    b.pop();
  }
  // a towel hanging over a bar
  function towelBar(b, x, y, z, w, mat) {
    for (const s of [-1, 1]) b.cyl('steel', x + s * w / 2, y - 0.01, z + 0.002, 0.016, 0.06, 10);
    b.rod('steel', 'x', x, y + 0.03, z + 0.06, 0.009, w, 8);
    b.rbox(mat, x - w * 0.42, y - 0.42, z + 0.035, x + w * 0.42, y + 0.05, z + 0.085, 0.02);
    b.rbox(mat, x - w * 0.42, y - 0.12, z + 0.083, x + w * 0.42, y + 0.05, z + 0.095, 0.01, 1);
  }
  function washer(b, x, z) {
    b.rbox('ceramic', x - 0.33, 0, z, x + 0.33, 0.92, z + 0.66, 0.03);
    b.box('metal', x - 0.31, 0.82, z + 0.66, x + 0.31, 0.9, z + 0.67);
    b.push().at(x, 0.45, z + 0.66, 0); b.rod('metal', 'z', 0, 0, 0.005, 0.22, 0.02, 24); b.rod('black', 'z', 0, 0, 0.012, 0.17, 0.02, 24); b.pop();
    b.shadow(x, z + 0.33, 0.75, 0.75, 0.4);
  }
  function crib(b, x, z, ry) {
    b.push().at(x, 0, z, ry);
    const mat = 'cribw'; b.mat('cribw', { color: 'F4F2EC', gloss: 0.3 });
    for (const sx of [-0.68, 0.68]) for (const sz of [-0.37, 0.37]) b.box(mat, sx - 0.025, 0, sz - 0.025, sx + 0.025, 0.95, sz + 0.025);
    for (const sz of [-0.37, 0.37]) { b.box(mat, -0.68, 0.88, sz - 0.02, 0.68, 0.92, sz + 0.02); b.box(mat, -0.68, 0.3, sz - 0.02, 0.68, 0.34, sz + 0.02); for (let i = 1; i < 14; i++) { const px = -0.68 + i * 0.097; b.box(mat, px - 0.01, 0.34, sz - 0.01, px + 0.01, 0.88, sz + 0.01); } }
    for (const sx of [-0.68, 0.68]) { b.box(mat, sx - 0.02, 0.3, -0.37, sx + 0.02, 0.92, 0.37); }
    b.rbox('linen', -0.64, 0.34, -0.33, 0.64, 0.46, 0.33, 0.04);
    b.shadow(0, 0, 1.5, 0.9, 0.4);
    b.pop();
  }
  function tv(b, x, z, w) {
    b.box('black', x - w / 2, 0.95, z, x + w / 2, 0.95 + w * 0.56, z + 0.04);
    b.mat('screen', { color: '0E1114', gloss: 0.9, emit: 'screen' }); b.box('screen', x - w / 2 + 0.015, 0.965, z + 0.04, x + w / 2 - 0.015, 0.935 + w * 0.56, z + 0.041);
    b.box('wood', x - 1, 0.1, z, x + 1, 0.55, z + 0.45); for (const s of [-1, 0, 1]) b.box('wood', x + s * 0.66 - 0.3, 0.14, z + 0.45, x + s * 0.66 + 0.3, 0.52, z + 0.46);
    b.shadow(x, z + 0.22, 2.1, 0.6, 0.4);
  }
  function fireplace(b, x, z, H) {
    b.mat('brick', { role: 'fire', color: 'A65A44', pat: PAT.brick, part: 'fire' });
    b.box('brick', x - 0.95, 0, z, x + 0.95, 1.35, z + 0.42);
    b.box('brick', x - 0.7, 1.35, z, x + 0.7, H, z + 0.3);
    b.mat('firebox', { color: '1A1714' }); b.box('firebox', x - 0.42, 0.12, z + 0.1, x + 0.42, 0.82, z + 0.4201);
    b.box('wood', x - 1.05, 1.35, z, x + 1.05, 1.42, z + 0.5);
    b.box('stonehearth', x - 1.05, 0, z + 0.42, x + 1.05, 0.05, z + 0.85); b.mat('stonehearth', { color: '8D8A85', pat: PAT.stone });
    b.mat('logs', { color: '5B3A26', pat: PAT.bark });
    for (const [dx, dy] of [[-0.12, 0.17], [0.12, 0.17], [0, 0.27]]) b.rod('logs', 'x', x + dx, dy, z + 0.28, 0.05, 0.5, 10);
    b.mat('flame', { color: '000000', emit: 'fire' }); b.box('flame', x - 0.3, 0.22, z + 0.24, x + 0.3, 0.42, z + 0.25);
    b.lamp(x, 0.5, z + 0.6, 0.5, 'fire');
    for (const dx of [-0.6, 0.55]) b.lathe('ceramic', x + dx, 1.42, z + 0.25, [[0, 0], [0.06, 0.01], [0.08, 0.15], [0.03, 0.25], [0, 0.26]], 12);
    b.shadow(x, z + 0.6, 2.2, 0.6, 0.3);
  }
  function stairs(b, x0, x1, zStart, run, rise, n, treadMat) {
    // a straight stair rising toward the back wall, with a railing on the open side
    b.mat('tread', { role: 'floor', color: 'A9784B', wood: { sp: 'red_oak', board: 25, cm: 0.3 }, gloss: 0.3, part: 'floor' });
    for (let i = 0; i < n; i++) {
      const z1 = zStart - i * run, z0 = z1 - run, y0 = i * rise;
      // the stair is closed underneath: a solid block under each step, painted like the walls, with a white riser
      b.box('side', x0, 0, z0, x1, y0 + rise - 0.002, z1 - 0.02, 't');
      b.box('trim', x0, y0, z1 - 0.02, x1, y0 + rise, z1);
      b.box(treadMat || 'tread', x0 - 0.02, y0 + rise, z0, x1 + 0.03, y0 + rise + 0.03, z1 + 0.03);
      for (const t of [0.3, 0.7]) b.box('trim', x1 - 0.04, y0 + rise + 0.03, z0 + run * t - 0.015, x1 - 0.01, y0 + rise + 0.95, z0 + run * t + 0.015);
    }
    const top = n * rise;
    b.box('trim', x1 - 0.06, 0, zStart - 0.06, x1 + 0.04, 1.15, zStart + 0.04);
    b.box('trim', x1 - 0.005, 0, zStart - n * run, x1 + 0.012, 0.12, zStart);
    // the hand rail climbs along the stair
    const steps = 24;
    for (let i = 0; i < steps; i++) { const t0 = i / steps, t1 = (i + 1) / steps; const za = zStart - t0 * n * run, zb = zStart - t1 * n * run, ya = 1.0 + t0 * top, yb = 1.0 + t1 * top; b.box('wood', x1 - 0.06, Math.min(ya, yb) - 0.02, zb, x1 + 0.01, Math.max(ya, yb) + 0.03, za); }
  }

  // ================================================================
  // SCENES
  // Each scene builds its models and returns where the camera stands. Windows go where the answers say the
  // light comes from: the first window side on the left wall, the second behind, the third on the right.
  // ================================================================
  function winPlan(ctx, slots) {
    const a = ctx.a || {};
    if (a.facing === 'none' && !(a.facings || []).length && ctx.useAnswers) return [];
    let dirs = (a.facings || []).slice();
    if (!dirs.length) dirs = [ctx.useAnswers ? '?' : 'south'];
    if (ctx.sunny) while (dirs.length < slots.length) dirs.push('?');
    return dirs.slice(0, slots.length).map((d, i) => ({ wall: slots[i], dir: d }));
  }
  const D2R = Math.PI / 180;
  const IN_CAM = { eye: [0.6, 1.42, 2.25], target: [-0.3, 1.05, -2.4], fov: 54 };
  // window spots for a standard room, by wall
  function winsFor(ctx, spots, slots) {
    return winPlan(ctx, slots || ['left', 'back', 'right']).map(w => Object.assign({ curtains: ctx.curtains }, spots[w.wall], { wall: w.wall, dir: w.dir }));
  }
  const SPOT = { left: { at: 2.0, w: 1.3, y0: 0.85, y1: 2.2 }, back: { at: 2.95, w: 1.4, y0: 1.05, y1: 2.25 }, right: { at: 1.9, w: 1.1, y0: 0.85, y1: 2.2 } };
  function interior(b, ctx, o) {
    const r = room(b, Object.assign({ floor: ctx.floor || 'wood', crown: ctx.a && ctx.a.crown }, o));
    return r;
  }
  const backHasWin = wins => wins.some(w => w.wall === 'back');

  const SCENES = {
    living(b, ctx) {
      ctx.curtains = true;
      const wins = winsFor(ctx, SPOT);
      const r = interior(b, ctx, { windows: wins, door: wins.some(w => w.wall === 'right') ? { wall: 'right', at: 4.05, w: 0.86, h: 2.05 } : { wall: 'right', at: 2.6, w: 0.86, h: 2.05 }, wainscot: ctx.wainscot });
      rug(b, 0.25, -0.85, 3.1, 2.3);
      sofa(b, 0.25, -1.9, 0, 2.3);
      coffeeTable(b, 0.25, -0.8, 0);
      armchair(b, -1.85, -0.35, Math.PI / 2 - 0.35);
      floorLamp(b, -1.3, -2.05);
      plant(b, 1.95, -2.05, 1.1);
      if (!backHasWin(wins)) art(b, [0.25, 1.62, r.z0], [1, 0, 0], [0, 0, 1], 1.3, 0.8);
      ceilingLight(b, r.H, 0.2, -0.5);
      return { cam: IN_CAM };
    },
    fireplace(b, ctx) {
      const wins = winsFor(ctx, SPOT, ['left', 'right']);
      const r = interior(b, ctx, { windows: wins });
      fireplace(b, 0.1, r.z0, r.H);
      rug(b, 0.1, -0.6, 2.8, 2.0);
      armchair(b, -1.35, -0.55, Math.PI / 2 + 0.5); armchair(b, 1.55, -0.55, -Math.PI / 2 - 0.5);
      coffeeTable(b, 0.1, -0.45, 0);
      art(b, [0.1, 1.95, r.z0 + 0.3], [1, 0, 0], [0, 0, 1], 0.9, 0.55);
      plant(b, -2.1, -2.05, 1.1);
      return { cam: IN_CAM };
    },
    bedroom(b, ctx) {
      ctx.curtains = true;
      const wins = winsFor(ctx, Object.assign({}, SPOT, { back: { at: 2.9, w: 1.2, y0: 1.35, y1: 2.25 } }));
      const r = interior(b, ctx, { windows: wins, floor: ctx.floor || 'wood' });
      rug(b, 0.2, -1.1, 2.8, 2.4);
      bed(b, 0.2, -1.33, 0, 1.65);
      nightstand(b, -1.0, -2.15, 0); nightstand(b, 1.4, -2.15, 0);
      dresser(b, -2.42, 0.6, Math.PI / 2, 'wood', 1.2);
      if (!backHasWin(wins)) art(b, [0.2, 1.75, r.z0], [1, 0, 0], [0, 0, 1], 1.1, 0.6);
      plant(b, 2.1, 0.2, 0.9);
      ceilingLight(b, r.H, 0.2, -0.4);
      return { cam: IN_CAM };
    },
    nursery(b, ctx) {
      ctx.curtains = true;
      const wins = winsFor(ctx, SPOT);
      const r = interior(b, ctx, { windows: wins, floor: 'carpet' });
      rug(b, 0, -0.6, 2.2, 1.8);
      crib(b, 0.3, -1.95, 0);
      armchair(b, -1.7, -1.1, Math.PI / 2 - 0.4);
      dresser(b, 2.15, -0.6, -Math.PI / 2, 'cab', 1.1);
      if (!backHasWin(wins)) art(b, [0.3, 1.6, r.z0], [1, 0, 0], [0, 0, 1], 0.7, 0.7);
      floorLamp(b, -2.2, -2.0);
      b.mat('toy', { color: 'E3A02B', gloss: 0.4 }); b.sphere('toy', 0.6, 0.12, -0.3, 0.12, 0.12, 0.12, 12);
      ceilingLight(b, r.H, 0.2, -0.5);
      return { cam: IN_CAM };
    },
    kids(b, ctx) {
      ctx.curtains = true;
      const wins = winsFor(ctx, SPOT, ['back', 'left', 'right']);
      const r = interior(b, ctx, { windows: wins.map(w => w.wall === 'back' ? Object.assign(w, { at: 3.6, w: 1.1, y0: 1.0, y1: 2.15 }) : w), floor: 'carpet' });
      bed(b, -1.55, -1.2, Math.PI / 2, 1.0, true);
      shelves(b, 0.0, r.z0 + 0.18, 0, 1.4, 1.5, 'cab', 4);
      b.mat('rugC', { color: 'C9D6E0', pat: PAT.carpet }); b.cyl('rugC', 0.4, 0, -0.4, 1.0, 0.012, 40);
      b.mat('bean', { role: 'art', color: '5E6B73', pat: PAT.fabric }); b.sphere('bean', 1.7, 0.28, -1.3, 0.42, 0.3, 0.42, 16); b.shadow(1.7, -1.3, 0.9, 0.9, 0.45);
      b.mat('toy', { color: 'D8443A', gloss: 0.4 }); b.box('toy', 0.6, 0, 0.3, 0.9, 0.3, 0.6); b.mat('toy2', { color: '1F6F8B', gloss: 0.4 }); b.box('toy2', 0.65, 0.3, 0.35, 0.85, 0.5, 0.55);
      ceilingLight(b, r.H, 0, -0.5);
      return { cam: IN_CAM };
    },
    kitchen(b, ctx) { return kitchenScene(b, ctx, false); },
    island(b, ctx) { return kitchenScene(b, ctx, true); },
    bath(b, ctx) {
      // a frosted window high on the left wall; the tub along the right wall, the vanity and toilet on the back
      const wins = winsFor(ctx, { left: { at: 1.5, w: 0.8, y0: 1.3, y1: 2.05 } }, ['left']);
      const r = interior(b, ctx, { windows: wins, floor: 'tile', w: 3.8, d: 3.4, h: 2.55, wainscot: ctx.wainscot });
      b.mats.floor.scale = 0.55;
      vanity(b, -0.25, r.z0, 1.15);
      toilet(b, -1.4, r.z0, 0);
      tub(b, r.x1 - 0.78, r.x1, r.z0, r.z0 + 1.6, r.H);
      b.mat('towel', { role: 'art', color: '8FA6A0', pat: PAT.fabric });
      towelBar(b, 0.82, 1.2, r.z0, 0.5, 'towel');
      b.mat('bathmat', { role: 'rug', color: 'D9D3C8', pat: PAT.carpet }); b.rbox('bathmat', r.x1 - 1.45, 0.0, -1.0, r.x1 - 0.85, 0.014, -0.2, 0.006, 1);
      plant(b, -0.62, r.z0 + 0.42, 0.42, 0.875);
      b.mat('soap', { color: 'D9CFC0', gloss: 0.4 }); b.lathe('soap', 0.18, 0.875, r.z0 + 0.12, [[0, 0], [0.03, 0.005], [0.035, 0.1], [0.012, 0.12], [0.006, 0.15], [0, 0.15]], 14);
      ceilingLight(b, r.H, -0.2, -0.3);
      return { cam: { eye: [-0.6, 1.58, 1.62], target: [0.3, 0.72, -1.7], fov: 64 } };
    },
    dining(b, ctx) {
      ctx.curtains = true;
      const wins = winsFor(ctx, SPOT);
      const r = interior(b, ctx, { windows: wins, wainscot: ctx.wainscot });
      rug(b, 0.1, -0.7, 3.0, 2.4);
      diningTable(b, 0.1, -0.7, 'wood', 'wood');
      pendant(b, r.H, 0.1, -0.7, 0.7, 0.32);
      dresser(b, 0.1, r.z0 + 0.26, 0, 'wood', 1.6);
      if (!backHasWin(wins)) art(b, [0.1, 1.72, r.z0], [1, 0, 0], [0, 0, 1], 1.2, 0.7);
      plant(b, 2.0, -2.05, 1.0);
      return { cam: IN_CAM };
    },
    diningset(b, ctx) {
      const wins = winsFor(ctx, SPOT, ['left', 'back']);
      const r = interior(b, ctx, { windows: wins });
      const mat = ctx.part === 'furn' || ctx.paintFurn ? 'piece' : 'wood';
      b.mat('piece', { role: 'cab', color: 'F2F1EC', gloss: 0.35, part: 'furn', wood: ctx.part === 'furn' ? { sp: 'pine', board: 14 } : null });
      rug(b, 0.1, -0.9, 3.0, 2.4);
      diningTable(b, 0.1, -0.9, mat, mat);
      pendant(b, r.H, 0.1, -0.9, 0.7, 0.3);
      return { cam: { eye: [0.9, 1.55, 1.6], target: [0.0, 0.7, -1.2], fov: 52 } };
    },
    dresser(b, ctx) {
      const wins = winsFor(ctx, SPOT, ['left']);
      const r = interior(b, ctx, { windows: wins, w: 4.6, d: 4.2 });
      b.mat('piece', { role: 'cab', color: 'F2F1EC', gloss: 0.35, part: 'furn', wood: ctx.part === 'furn' ? { sp: 'pine', board: 14 } : null });
      dresser(b, 0.2, r.z0 + 0.26, 0, 'piece', 1.4);
      tableLamp(b, -0.25, 0.95, r.z0 + 0.2);
      plant(b, 0.6, r.z0 + 0.22, 0.45, 0.95);
      art(b, [0.2, 1.75, r.z0], [1, 0, 0], [0, 0, 1], 0.9, 0.6);
      rug(b, 0.2, -0.4, 2.2, 1.6);
      armchair(b, -1.5, -0.6, Math.PI / 2 - 0.3);
      return { cam: { eye: [0.55, 1.35, 1.7], target: [0.15, 0.85, -2.1], fov: 50 } };
    },
    office(b, ctx) {
      const wins = winsFor(ctx, SPOT, ['left', 'right']);
      const r = interior(b, ctx, { windows: wins });
      desk(b, 0.3, r.z0 + 0.4, 0);
      shelves(b, -1.5, r.z0 + 0.18, 0, 1.4, 2.1, ctx.part === 'cab' || ctx.paintCab ? 'cab' : 'wood', 5);
      rug(b, 0.3, -1.0, 2.4, 1.8);
      armchair(b, 1.8, -0.4, -Math.PI / 2 + 0.4);
      art(b, [0.3, 1.72, r.z0], [1, 0, 0], [0, 0, 1], 1.0, 0.6);
      plant(b, 2.1, -2.0, 1.0);
      ceilingLight(b, r.H, 0.2, -0.5);
      return { cam: IN_CAM };
    },
    entry(b, ctx) {
      const wins = winsFor(ctx, SPOT, ['left']);
      const r = interior(b, ctx, { windows: wins, w: 4.4, d: 5.0, door: { wall: 'back', at: 2.9, w: 0.95, h: 2.1 }, wainscot: ctx.wainscot });
      // console table and round mirror
      const x = -0.9, z = r.z0;
      b.box('wood', x - 0.6, 0.78, z + 0.02, x + 0.6, 0.82, z + 0.4); for (const dx of [-0.55, 0.55]) b.box('black', x + dx - 0.02, 0, z + 0.04, x + dx + 0.02, 0.78, z + 0.38); b.box('wood', x - 0.55, 0.2, z + 0.05, x + 0.55, 0.23, z + 0.37);
      b.push().at(x, 1.55, z + 0.02, 0); b.rod('brass', 'z', 0, 0, 0.01, 0.4, 0.02, 32); b.mat('mirror', { color: 'C9D2D7', gloss: 1, emit: 'mirror' }); b.rod('mirror', 'z', 0, 0, 0.022, 0.37, 0.005, 32); b.pop();
      tableLamp(b, x - 0.38, 0.82, z + 0.2); plant(b, x + 0.35, z + 0.2, 0.4, 0.82);
      b.shadow(x, z + 0.25, 1.3, 0.5, 0.35);
      b.mat('runner', { role: 'rug', color: 'B8AD9C', pat: PAT.carpet }); b.box('runner', 0.15, 0.002, -2.1, 1.05, 0.012, 1.2);
      // bench on the right wall
      b.box('wood', r.x1 - 0.42, 0.42, -0.8, r.x1 - 0.02, 0.47, 0.5); for (const dz of [-0.75, 0.45]) b.box('wood', r.x1 - 0.4, 0, dz - 0.02, r.x1 - 0.04, 0.42, dz + 0.02);
      b.rbox('fabricD', r.x1 - 0.4, 0.47, -0.75, r.x1 - 0.04, 0.53, 0.45, 0.03);
      for (let i = 0; i < 4; i++) b.cyl('brass', r.x1 - 0.06, 1.7, -0.6 + i * 0.32, 0.012, 0.06, 6);
      pendant(b, r.H, 0.5, -0.6, 0.45, 0.22);
      return { cam: { eye: [0.75, 1.45, 2.4], target: [-0.1, 1.05, -2.5], fov: 54 } };
    },
    stairway(b, ctx) {
      const wins = winsFor(ctx, { right: { at: 1.6, w: 1.0, y0: 1.2, y1: 2.3 }, back: { at: 3.4, w: 1.0, y0: 1.3, y1: 2.4 } }, ['right', 'back']);
      const r = interior(b, ctx, { windows: wins, h: 3.4, w: 4.8, d: 5.2, wainscot: ctx.wainscot });
      stairs(b, r.x0 + 0.02, r.x0 + 1.05, 0.9, 0.26, 0.19, 12, ctx.part === 'floor' ? 'tread' : null);
      art(b, [r.x1, 1.6, -0.5], [0, 0, 1], [-1, 0, 0], 0.8, 1.0);
      b.mat('runner', { role: 'rug', color: 'B8AD9C', pat: PAT.carpet }); b.box('runner', 0.2, 0.002, -1.5, 1.6, 0.012, 1.4);
      plant(b, 1.7, -2.2, 1.0);
      return { cam: { eye: [1.6, 1.55, 2.4], target: [-0.9, 1.6, -1.8], fov: 56 } };
    },
    laundry(b, ctx) {
      const wins = winsFor(ctx, SPOT, ['left']);
      const r = interior(b, ctx, { windows: wins, floor: 'tile', w: 4.0, d: 3.6 });
      washer(b, -0.05, r.z0 + 0.02); washer(b, 0.65, r.z0 + 0.02);
      upperCabinets(b, -0.6, 1.4, r.z0, 1.55, 2.25);
      cabinets(b, -1.7, -0.45, r.z0, {});
      b.box('woodlt', -0.4, 1.3, r.z0, 1.2, 1.33, r.z0 + 0.3);
      b.mat('basket', { color: 'B9A88F', pat: PAT.fabric }); b.lathe('basket', 1.4, 0, -0.6, [[0, 0], [0.2, 0.01], [0.24, 0.36], [0.25, 0.38], [0.23, 0.38], [0, 0.04]], 16);
      return { cam: { eye: [0.45, 1.45, 1.75], target: [-0.1, 1.0, -1.8], fov: 58 } };
    },
    media(b, ctx) {
      const wins = winsFor(ctx, SPOT, ['left']);
      const r = interior(b, ctx, { windows: wins.map(w => Object.assign(w, { curtains: true })), floor: 'carpet' });
      tv(b, 0.1, r.z0, 1.5);
      shelves(b, -1.7, r.z0 + 0.18, 0, 0.9, 1.9, 'wood', 5); shelves(b, 1.9, r.z0 + 0.18, 0, 0.9, 1.9, 'wood', 5);
      sofa(b, 0.1, 0.55, Math.PI, 2.6);
      rug(b, 0.1, -0.6, 3.0, 2.0);
      ceilingLight(b, r.H, 0.1, -0.5);
      return { cam: { eye: [0.7, 1.55, 2.3], target: [-0.1, 0.95, -2.4], fov: 54 } };
    },
    sunroom(b, ctx) {
      ctx.sunny = true;
      const spots = { left: { at: 2.4, w: 2.8, y0: 0.6, y1: 2.35 }, back: { at: 2.7, w: 3.4, y0: 0.6, y1: 2.35 }, right: { at: 2.4, w: 2.8, y0: 0.6, y1: 2.35 } };
      const r = interior(b, ctx, { windows: winsFor(ctx, spots).map(w => Object.assign(w, { curtains: false })), floor: ctx.floor || 'tile' });
      b.mat('wicker', { color: 'B08A5E', pat: PAT.fabric, gloss: 0.15 });
      armchair(b, -0.9, -1.2, 0.3, 'wicker'); armchair(b, 0.9, -1.2, -0.3, 'wicker');
      b.cyl('wicker', 0, 0, -1.0, 0.3, 0.45, 18);
      plant(b, -2.1, -2.0, 1.3); plant(b, 2.1, -2.0, 1.2); plant(b, 2.2, 0.4, 0.9);
      rug(b, 0, -1.0, 2.6, 1.8);
      return { cam: IN_CAM };
    },
    basement(b, ctx) {
      const wins = winsFor(ctx, { left: { at: 2.4, w: 0.9, y0: 1.75, y1: 2.2 }, back: { at: 1.2, w: 0.9, y0: 1.75, y1: 2.2 }, right: { at: 2.4, w: 0.9, y0: 1.75, y1: 2.2 } });
      const r = interior(b, ctx, { windows: wins, floor: ctx.floor || 'concrete', h: 2.4 });
      sofa(b, 0.3, -1.9, 0, 2.4); coffeeTable(b, 0.3, -0.8, 0); rug(b, 0.3, -0.9, 3.0, 2.2);
      tv(b, -2.2, -0.4, 1.0);
      floorLamp(b, 1.8, -2.0);
      return { cam: IN_CAM };
    },
    attic(b, ctx) {
      stdMats(b); floorMat(b, 'wood');
      const W = 5.6, D = 5, knee = 1.15, ridge = 3.0, x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
      b.quad('floor', [x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [0, 1, 0]);
      b.wall('side', [x0, 0, z0], [0, 0, 1], [1, 0, 0], D, knee, []);
      b.wall('side', [x1, 0, z0], [0, 0, 1], [-1, 0, 0], D, knee, []);
      // the sloped ceiling on both sides, the same color as the walls
      const slopeN = norm([knee - ridge, -(x1 - 0), 0]);
      b.quad('side', [x0, knee, z0], [0, ridge, z0], [0, ridge, z1], [x0, knee, z1], norm([ridge - knee, -x1, 0]).map((v, i) => i === 0 ? v : v));
      b.quad('side', [x1, knee, z0], [0, ridge, z0], [0, ridge, z1], [x1, knee, z1], norm([-(ridge - knee), -x1, 0]));
      // the back wall: a gable with a window
      const plan = winPlan(ctx, ['back']), wy0 = 1.25, wy1 = 2.2, wx = 0.6;
      // the back wall: the low part, then the gable in thin strips so a window can sit in it
      b.wall('wall', [x0, 0, z0], [1, 0, 0], [0, 0, 1], W, knee, []);
      const N = 16;
      for (let i = 0; i < N; i++) {
        const xa = x0 + (W / N) * i, xb = xa + W / N;
        const ha = knee + (ridge - knee) * (1 - Math.abs(xa) / x1), hb = knee + (ridge - knee) * (1 - Math.abs(xb) / x1), hm = Math.min(ha, hb);
        const inWin = plan.length && xb > -wx + 1e-6 && xa < wx - 1e-6;
        if (inWin) { b.quad('wall', [xa, knee, z0], [xb, knee, z0], [xb, wy0, z0], [xa, wy0, z0], [0, 0, 1]); if (hm > wy1) b.quad('wall', [xa, wy1, z0], [xb, wy1, z0], [xb, hm, z0], [xa, hm, z0], [0, 0, 1]); }
        else b.quad('wall', [xa, knee, z0], [xb, knee, z0], [xb, hm, z0], [xa, hm, z0], [0, 0, 1]);
        if (Math.abs(ha - hb) > 1e-4) b.quad('wall', [xa, hm, z0], [xb, hm, z0], ha > hb ? [xa, ha, z0] : [xb, hb, z0], ha > hb ? [xa, ha, z0] : [xb, hb, z0], [0, 0, 1]);
      }
      if (plan.length) {
        b.quad('glass', [-wx, wy0, z0 - 0.12], [wx, wy0, z0 - 0.12], [wx, wy1, z0 - 0.12], [-wx, wy1, z0 - 0.12], [0, 0, 1]);
        b.quad('side', [-wx, wy0, z0], [-wx, wy0, z0 - 0.12], [-wx, wy1, z0 - 0.12], [-wx, wy1, z0], [1, 0, 0]); b.quad('side', [wx, wy0, z0], [wx, wy0, z0 - 0.12], [wx, wy1, z0 - 0.12], [wx, wy1, z0], [-1, 0, 0]); b.quad('side', [-wx, wy1, z0], [wx, wy1, z0], [wx, wy1, z0 - 0.12], [-wx, wy1, z0 - 0.12], [0, -1, 0]); b.quad('trim', [-wx, wy0, z0], [wx, wy0, z0], [wx, wy0, z0 - 0.12], [-wx, wy0, z0 - 0.12], [0, 1, 0]);
        for (const [a0, a1, y0, y1] of [[-wx - 0.08, -wx, wy0 - 0.05, wy1 + 0.08], [wx, wx + 0.08, wy0 - 0.05, wy1 + 0.08], [-wx - 0.09, wx + 0.09, wy1, wy1 + 0.09], [-wx - 0.11, wx + 0.11, wy0 - 0.03, wy0]]) b.box('trim', a0, y0, z0, a1, y1, z0 + 0.03);
        b.box('trim', -wx, (wy0 + wy1) / 2 - 0.025, z0 - 0.1, wx, (wy0 + wy1) / 2 + 0.025, z0 - 0.08);
        b.windows.push({ center: [0, (wy0 + wy1) / 2, z0], out: [0, 0, -1], dir: plan[0].dir, w: 2 * wx, h: wy1 - wy0 });
      }
      bed(b, 0, -0.9, 0, 1.5); nightstand(b, -1.25, -1.75, 0); nightstand(b, 1.25, -1.75, 0);
      rug(b, 0, -0.6, 2.6, 2.4);
      b.room = { min: [x0, 0, z0], max: [x1, ridge, z1 + 3] };
      return { cam: { eye: [0.5, 1.5, 2.3], target: [-0.1, 1.2, -2.5], fov: 58 } };
    },
    garage(b, ctx) {
      const wins = winsFor(ctx, { left: { at: 2.0, w: 0.9, y0: 1.3, y1: 2.1 } }, ['left']);
      const r = interior(b, ctx, { windows: wins, floor: 'concrete', w: 6, d: 5.4 });
      b.mat('peg', { color: 'B88D5C', pat: PAT.plain }); b.box('peg', -1.2, 1.05, r.z0, 1.2, 2.0, r.z0 + 0.02);
      b.box('woodlt', -1.3, 0.88, r.z0, 1.3, 0.94, r.z0 + 0.65); for (const dx of [-1.25, 1.25]) b.box('black', dx - 0.03, 0, r.z0 + 0.05, dx + 0.03, 0.88, r.z0 + 0.6); b.box('black', -1.25, 0.25, r.z0 + 0.05, 1.25, 0.28, r.z0 + 0.6);
      b.mat('red', { color: 'B5362E', gloss: 0.5 }); b.box('red', -0.9, 0.94, r.z0 + 0.15, -0.4, 1.2, r.z0 + 0.45);
      b.mat('blue', { color: '2F5D86', gloss: 0.5 }); b.box('blue', 0.4, 0.94, r.z0 + 0.2, 0.8, 1.15, r.z0 + 0.5);
      shelves(b, 2.55, -0.4, -Math.PI / 2, 1.6, 2.0, 'metal', 4);
      b.shadow(0, r.z0 + 0.35, 2.7, 0.8, 0.35);
      return { cam: { eye: [0.4, 1.5, 2.6], target: [-0.1, 1.05, -2.7], fov: 56 } };
    },
    bookcase(b, ctx) {
      const wins = winsFor(ctx, SPOT, ['left']);
      const r = interior(b, ctx, { windows: wins });
      const mat = ctx.part === 'cab' ? 'builtin' : 'cab';
      b.mat('builtin', { role: 'cab', color: 'F2F1EC', gloss: 0.3, part: 'cab', wood: { sp: 'birch', board: 14 } });
      shelves(b, -1.35, r.z0 + 0.18, 0, 1.3, 2.4, mat, 6); shelves(b, 1.35, r.z0 + 0.18, 0, 1.3, 2.4, mat, 6);
      // a window seat between them
      b.box(mat, -0.7, 0, r.z0, 0.7, 0.48, r.z0 + 0.5); cabDoor(b, mat, -0.68, -0.02, 0.06, 0.44, r.z0 + 0.5, true); cabDoor(b, mat, 0.02, 0.68, 0.06, 0.44, r.z0 + 0.5, true);
      b.rbox('fabricL', -0.68, 0.48, r.z0 + 0.02, 0.68, 0.56, r.z0 + 0.5, 0.03);
      b.box(mat, -0.7, 2.3, r.z0, 0.7, 2.7, r.z0 + 0.35);
      art(b, [0, 1.45, r.z0], [1, 0, 0], [0, 0, 1], 0.8, 0.6);
      armchair(b, 1.2, -0.3, -0.5); floorLamp(b, 1.95, 0.0); rug(b, 0, -0.6, 2.6, 2.0);
      return { cam: IN_CAM };
    },
  };
  function kitchenScene(b, ctx, withIsland) {
    const wins = winPlan(ctx, ['back', 'left']).map(w => w.wall === 'back' ? { wall: 'back', at: 3.55, w: 1.1, y0: 1.15, y1: 2.1, dir: w.dir } : { wall: 'left', at: 2.4, w: 1.1, y0: 1.1, y1: 2.15, dir: w.dir });
    const r = room(b, { windows: wins, floor: ctx.floor || 'wood', w: 5.6, d: 5.0, crown: ctx.a && ctx.a.crown });
    const z = r.z0;
    b.mat('cab', { role: 'cab', color: 'F2F1EC', gloss: 0.3, part: 'cab', wood: ctx.part === 'cab' ? { sp: 'maple', board: 16 } : null });
    b.mat('hood', { role: 'hood', color: 'B9BDBF', gloss: 0.7 });
    // fridge, base cabinets with range and sink, uppers and backsplash
    b.rbox('steel', r.x0 + 0.02, 0, z, r.x0 + 0.92, 1.9, z + 0.72, 0.02, 1); b.box('black', r.x0 + 0.47, 0.95, z + 0.72, r.x0 + 0.475, 1.88, z + 0.725); b.box('metal', r.x0 + 0.4, 1.0, z + 0.725, r.x0 + 0.42, 1.5, z + 0.76); b.box('metal', r.x0 + 0.52, 1.0, z + 0.725, r.x0 + 0.54, 1.5, z + 0.76);
    upperCabinets(b, r.x0 + 0.02, r.x0 + 0.92, z, 1.95, 2.3);
    cabinets(b, r.x0 + 0.94, -0.85, z, {});
    range(b, -0.47, z);
    hood(b, -0.47, z, r.H);
    cabinets(b, -0.09, r.x1 - 0.02, z, { sinkAt: 0.85 });
    sinkFaucet(b, 0.85, 0.915, z);
    b.box('tile', r.x0 + 0.94, 0.915, z, r.x1 - 0.02, 1.48, z + 0.004);
    upperCabinets(b, r.x0 + 0.94, -0.92, z, 1.48, 2.3);
    if (wins.some(w => w.wall === 'back')) { upperCabinets(b, 1.5, r.x1 - 0.02, z, 1.48, 2.3); }
    else upperCabinets(b, -0.02, r.x1 - 0.02, z, 1.48, 2.3);
    b.box('woodlt', -1.55, 0.915, z + 0.1, -1.2, 0.93, z + 0.35); b.mat('fruit', { color: 'C9553A', gloss: 0.6 }); b.sphere('fruit', -1.38, 0.97, z + 0.22, 0.04, 0.04, 0.04, 10); b.mat('fruit2', { color: 'E0A43A', gloss: 0.6 }); b.sphere('fruit2', -1.3, 0.965, z + 0.25, 0.035, 0.035, 0.035, 10);
    if (withIsland) {
      const ix = 0.1, iz = -0.35;
      b.box('cab', ix - 1.1, 0.1, iz - 0.42, ix + 1.1, 0.9, iz + 0.42); b.box('black', ix - 1.08, 0, iz - 0.38, ix + 1.08, 0.1, iz + 0.38);
      for (let i = 0; i < 4; i++) cabDoor(b, 'cab', ix - 1.1 + i * 0.55 + 0.01, ix - 1.1 + (i + 1) * 0.55 - 0.01, 0.12, 0.86, iz - 0.42 - 0.02, true);
      b.box('counter', ix - 1.2, 0.9, iz - 0.5, ix + 1.2, 0.94, iz + 0.62);
      for (const dx of [-0.65, 0, 0.65]) stool(b, ix + dx, iz + 0.85);
      for (const dx of [-0.55, 0.55]) pendant(b, r.H, ix + dx, iz, 0.85, 0.16);
      b.shadow(ix, iz, 2.4, 1.1, 0.4);
    } else { pendant(b, r.H, 0.2, -0.6, 0.8, 0.2); }
    return { cam: withIsland ? { eye: [1.2, 1.55, 2.35], target: [-0.2, 0.95, -2.5], fov: 56 } : { eye: [0.7, 1.5, 2.2], target: [-0.2, 1.15, -2.5], fov: 56 } };
  }

  // ---------------- outside ----------------
  function yardMats(b) {
    stdMats(b);
    b.mat('lawn', { role: 'lawn', color: '6E8A4F', pat: PAT.grass });
    b.mat('shrub', { role: 'shrub', color: '4E6A3B', pat: PAT.leaves });
    b.mat('treeL', { role: 'tree', color: '5D7649', pat: PAT.leaves });
    b.mat('trunk', { color: '5A4636', pat: PAT.bark });
    b.mat('walk', { role: 'walk', color: 'CFCAC0', pat: PAT.walk });
    b.mat('mulch', { color: '4A3626', pat: PAT.concrete });
    b.mat('glassx', { color: '1E2A33', gloss: 0.95, emit: 'house' });
    b.mat('roof', { role: 'roof', color: '45484C', pat: PAT.shingle });
    b.mat('xtrim', { role: 'xtrim', color: 'F2F1EC', gloss: 0.3, part: 'xtrim' });
    b.mat('xdoor', { role: 'xdoor', color: '3E4A52', gloss: 0.55, part: 'xdoor' });
    b.mat('step', { role: 'step', color: 'BEB9B0', pat: PAT.concrete, part: 'step' });
    b.mat('shut', { role: 'shut', color: '2F3B4C', pat: PAT.louver, gloss: 0.3, part: 'shut' });
    b.mat('gdoor', { role: 'gdoor', color: 'F2F1EC', gloss: 0.3, part: 'gdoor' });
    b.mat('chimney', { color: '8E5A46', pat: PAT.brick });
    b.mat('found', { color: 'B5B0A6', pat: PAT.concrete });
  }
  function bodyMat(b, siding, ctx) {
    const pat = { brick: PAT.brick, stucco: PAT.stucco, shake: PAT.shake, board: PAT.batten, vinyl: PAT.lap, fiber: PAT.lap, wood: PAT.lap }[siding] || PAT.lap;
    const stained = ctx.part === 'body';
    return b.mat('body', { role: 'body', color: 'CFC8BC', pat: stained ? (siding === 'board' ? PAT.batten : siding === 'shake' ? PAT.shake : PAT.lap) : pat, gloss: siding === 'vinyl' ? 0.25 : 0.08, part: 'body', wood: stained ? { sp: 'cedar', board: 14, vertical: siding === 'board' } : null, swap: siding === 'board' });
  }
  function ground(b, size) {
    b.quad('lawn', [-size, 0, -size], [size, 0, -size], [size, 0, size], [-size, 0, size], [0, 1, 0]);
  }
  function tree(b, x, z, s) {
    s = s || 1; const R = rnd(Math.round(x * 13 + z * 7 + 101));
    b.cyl('trunk', x, 0, z, 0.18 * s, 3.2 * s, 10, 0.12 * s);
    for (let i = 0; i < 6; i++) b.sphere('treeL', x + (R() - 0.5) * 2.2 * s, (3.6 + R() * 2.2) * s, z + (R() - 0.5) * 2.2 * s, (1.4 + R() * 0.8) * s, (1.2 + R() * 0.7) * s, (1.4 + R() * 0.8) * s, 12);
  }
  function shrub(b, x, z, s) { const R = rnd(Math.round(x * 31 + z * 3 + 9)); for (let i = 0; i < 3; i++) b.sphere('shrub', x + (R() - 0.5) * 0.7 * s, 0.38 * s, z + (R() - 0.5) * 0.4 * s, 0.55 * s, 0.45 * s, 0.45 * s, 12); }
  // an outside window: trim frame, dark glass, muntins, a sill, and shutters if wanted
  function xWindow(b, x, y, z, w, h, o) {
    o = o || {};
    b.box('xtrim', x - w / 2 - 0.1, y - 0.06, z, x + w / 2 + 0.1, y + h + 0.12, z + 0.05);
    b.box('glassx', x - w / 2, y, z + 0.02, x + w / 2, y + h, z + 0.051);
    b.box('xtrim', x - 0.02, y, z + 0.05, x + 0.02, y + h, z + 0.07); b.box('xtrim', x - w / 2, y + h / 2 - 0.025, z + 0.05, x + w / 2, y + h / 2 + 0.025, z + 0.07);
    b.box('xtrim', x - w / 2 - 0.15, y - 0.1, z, x + w / 2 + 0.15, y - 0.05, z + 0.1);
    if (o.shutters) for (const s of [-1, 1]) b.box('shut', x + s * (w / 2 + 0.12) - 0.2 + (s > 0 ? 0.2 : 0), y - 0.04, z + 0.02, x + s * (w / 2 + 0.12) + (s > 0 ? 0.2 : 0), y + h + 0.06, z + 0.06);
    if (o.side) b.windows.push({ center: [x, y + h / 2, z], out: [0, 0, 1] });
  }
  function frontDoor(b, x, z, o) {
    o = o || {};
    const w = 0.95, h = 2.1;
    b.box('xtrim', x - w / 2 - 0.12, 0.3, z, x + w / 2 + 0.12, 0.3 + h + 0.18, z + 0.06);
    if (o.sidelights) for (const s of [-1, 1]) { b.box('xtrim', x + s * (w / 2 + 0.12) - 0.2, 0.3, z, x + s * (w / 2 + 0.12) + 0.2, 0.3 + h + 0.18, z + 0.06); b.box('glassx', x + s * (w / 2 + 0.2) - 0.1, 0.55, z + 0.06, x + s * (w / 2 + 0.2) + 0.1, 0.3 + h - 0.1, z + 0.065); }
    b.box('xdoor', x - w / 2, 0.3, z + 0.02, x + w / 2, 0.3 + h, z + 0.07);
    for (const [u0, u1, v0, v1] of [[-0.36, -0.06, 1.35, 2.2], [0.06, 0.36, 1.35, 2.2], [-0.36, -0.06, 0.45, 1.2], [0.06, 0.36, 0.45, 1.2]]) b.box('xdoor', x + u0, v0, z + 0.07, x + u1, v1, z + 0.085);
    b.sphere('brass', x + w / 2 - 0.1, 1.3, z + 0.1, 0.035, 0.035, 0.035, 10);
    b.box('step', x - 1.1, 0, z, x + 1.1, 0.15, z + 1.1); b.box('step', x - 0.9, 0.15, z, x + 0.9, 0.3, z + 0.7);
    // porch light
    b.box('black', x + w / 2 + 0.25, 1.7, z + 0.06, x + w / 2 + 0.37, 1.95, z + 0.2); b.box('shade', x + w / 2 + 0.27, 1.73, z + 0.2, x + w / 2 + 0.35, 1.92, z + 0.205);
    b.lamp(x + w / 2 + 0.31, 1.85, z + 0.5, 1.2, 'porch');
  }
  function garageDoor3(b, x, z, w, h) {
    b.box('xtrim', x - w / 2 - 0.12, 0, z, x + w / 2 + 0.12, h + 0.12, z + 0.05);
    b.box('gdoor', x - w / 2, 0, z + 0.02, x + w / 2, h, z + 0.06);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x0 = x - w / 2 + 0.12 + c * (w - 0.24) / 4, y0 = 0.1 + r * (h - 0.2) / 4; b.box('gdoor', x0 + 0.04, y0 + 0.05, z + 0.06, x0 + (w - 0.24) / 4 - 0.04, y0 + (h - 0.2) / 4 - 0.05, z + 0.075); }
    b.box('walk', x - w / 2, 0.002, z, x + w / 2, 0.01, z + 7);
  }
  // a gable roof over a box: ridge along x (side gable) or z (front gable)
  function gableRoof(b, x0, x1, z0, z1, y, rise, ov, front) {
    if (!front) {
      const zm = (z0 + z1) / 2, d = (z1 - z0) / 2 + ov, s = rise / ((z1 - z0) / 2), yl = y - ov * s;
      b.quad('roof', [x0 - ov, yl, zm - d], [x1 + ov, yl, zm - d], [x1 + ov, y + rise, zm], [x0 - ov, y + rise, zm], norm([0, d, -rise]));
      b.quad('roof', [x0 - ov, yl, zm + d], [x1 + ov, yl, zm + d], [x1 + ov, y + rise, zm], [x0 - ov, y + rise, zm], norm([0, d, rise]));
      for (const sx of [x0, x1]) b.quad('body', [sx, y, z0], [sx, y, z1], [sx, y + rise, zm], [sx, y + rise, zm], [sx === x0 ? -1 : 1, 0, 0]);
      b.box('xtrim', x0 - ov, yl - 0.2, zm + d - 0.04, x1 + ov, yl, zm + d + 0.02); b.box('xtrim', x0 - ov, yl - 0.2, zm - d - 0.02, x1 + ov, yl, zm - d + 0.04);
      b.quad('xtrim', [x0 - ov, yl - 0.2, zm + d - 0.04], [x1 + ov, yl - 0.2, zm + d - 0.04], [x1 + ov, y, z1], [x0 - ov, y, z1], [0, -1, 0]);
      return;
    }
    const xm = (x0 + x1) / 2, d = (x1 - x0) / 2 + ov, s = rise / ((x1 - x0) / 2), yl = y - ov * s;
    b.quad('roof', [xm - d, yl, z0 - ov], [xm - d, yl, z1 + ov], [xm, y + rise, z1 + ov], [xm, y + rise, z0 - ov], norm([-rise, d, 0]));
    b.quad('roof', [xm + d, yl, z0 - ov], [xm + d, yl, z1 + ov], [xm, y + rise, z1 + ov], [xm, y + rise, z0 - ov], norm([rise, d, 0]));
    for (const sz of [z0, z1]) b.quad('body', [x0, y, sz], [x1, y, sz], [xm, y + rise, sz], [xm, y + rise, sz], [0, 0, sz === z0 ? -1 : 1]);
    // rake boards along the front gable
    const steps = 10;
    for (let i = 0; i < steps; i++) for (const sgn of [-1, 1]) { const t0 = i / steps, t1 = (i + 1) / steps; const xa = xm + sgn * d * (1 - t0), xb = xm + sgn * d * (1 - t1); const ya = yl + (y + rise - yl) * t0, yb = yl + (y + rise - yl) * t1; b.box('xtrim', Math.min(xa, xb), Math.min(ya, yb) - 0.18, z1 + ov - 0.05, Math.max(xa, xb), Math.max(ya, yb) + 0.02, z1 + ov + 0.02); }
  }
  function house(b, ctx, style) {
    yardMats(b);
    const a = ctx.a || {}, sp = a.space || '';
    let siding = ctx.siding || a.siding || (style === 'farmhouse' ? 'board' : style === 'modern' ? 'fiber' : 'wood');
    bodyMat(b, siding, ctx);
    ground(b, 60);
    const shutters = style === 'colonial' || sp === 'shutters' || ctx.part === 'shut';
    const wantGarage = sp === 'garage_door' || ctx.part === 'gdoor';
    let cam;
    if (style === 'colonial') {
      const W = 10, D = 7.5, H = 5.8, x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
      b.box('body', x0, 0.3, z0, x1, H, z1, 'b'); b.box('found', x0 - 0.05, 0, z0 - 0.05, x1 + 0.05, 0.3, z1 + 0.05);
      for (const sx of [x0, x1]) b.box('xtrim', sx - 0.07, 0.3, z1 - 0.07, sx + 0.07, H, z1 + 0.07);
      gableRoof(b, x0, x1, z0, z1, H, 2.4, 0.45, false);
      b.box('chimney', x1 - 1.5, H, -0.6, x1 - 0.8, H + 2.6, 0.2);
      for (const x of [-3.4, -1.7, 1.7, 3.4]) xWindow(b, x, 1.15, z1, 1.0, 1.55, { shutters });
      for (const x of [-3.4, -1.7, 0, 1.7, 3.4]) xWindow(b, x, 3.75, z1, 1.0, 1.4, { shutters });
      frontDoor(b, 0, z1, { sidelights: false });
      // portico
      b.box('xtrim', -1.3, 2.75, z1, 1.3, 2.95, z1 + 1.4); for (const sx of [-1.15, 1.15]) b.cyl('xtrim', sx, 0.3, z1 + 1.2, 0.11, 2.45, 16);
      b.quad('roof', [-1.45, 2.95, z1 + 1.55], [1.45, 2.95, z1 + 1.55], [0, 3.7, z1 + 1.55], [0, 3.7, z1 + 1.55], [0, 0, 1]); b.quad('roof', [-1.45, 2.95, z1 + 1.55], [0, 3.7, z1 + 1.55], [0, 3.7, z1], [-1.45, 2.95, z1], norm([-0.75, 1.45, 0])); b.quad('roof', [1.45, 2.95, z1 + 1.55], [0, 3.7, z1 + 1.55], [0, 3.7, z1], [1.45, 2.95, z1], norm([0.75, 1.45, 0]));
      if (wantGarage) { b.box('body', x1, 0, z0 + 1.5, x1 + 6.2, 2.9, z1, 'b'); gableRoof(b, x1, x1 + 6.2, z0 + 1.5, z1, 2.9, 1.3, 0.35, false); garageDoor3(b, x1 + 3.1, z1, 4.8, 2.2); }
      b.box('walk', -0.7, 0.003, z1 + 1.1, 0.7, 0.012, z1 + 12);
      for (const x of [-4.2, -2.6, 2.6, 4.2]) shrub(b, x, z1 + 0.8, 1.1);
      cam = { eye: [wantGarage ? 6.5 : 3.5, 1.9, 19], target: [wantGarage ? 2.5 : 0, 3.3, 0], fov: 46 };
    } else if (style === 'farmhouse') {
      const W = 10.5, D = 7.5, H = 5.6, x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
      b.mat('roof', { role: 'roof', color: '3F4448', pat: PAT.metalroof, gloss: 0.5 });
      b.box('body', x0, 0.5, z0, x1, H, z1, 'b'); b.box('found', x0, 0, z0, x1, 0.5, z1);
      gableRoof(b, x0, x1, z0, z1, H, 2.8, 0.4, false);
      // a front gable over the middle
      b.box('body', -1.6, H - 0.01, z1 - 1, 1.6, H + 0.5, z1, 'b');
      gableRoof(b, -1.6, 1.6, z1 - 3, z1, H, 1.9, 0.3, true);
      xWindow(b, 0, H - 0.1, z1, 0.8, 1.1);
      for (const x of [-3.6, -2.0, 2.0, 3.6]) xWindow(b, x, 3.4, z1, 0.95, 1.4, { shutters });
      for (const x of [-3.4, 3.4]) xWindow(b, x, 1.2, z1, 1.1, 1.6, { shutters });
      frontDoor(b, 0, z1 + 0.001, { sidelights: true });
      porch3(b, x0 + 0.2, x1 - 0.2, z1, 2.6, 0.5, ctx);
      for (const x of [-4.2, 4.2]) shrub(b, x, z1 + 3.0, 1.1);
      b.box('walk', -0.8, 0.003, z1 + 2.8, 0.8, 0.012, z1 + 12);
      cam = sp === 'porch_floor' || ctx.part === 'step' ? { eye: [3.2, 1.8, 11], target: [0, 1.0, z1 + 1.2], fov: 46 } : { eye: [3.6, 1.9, 20], target: [0, 3.1, 0], fov: 46 };
    } else if (style === 'cottage') {
      const W = 7.4, D = 9, H = 3.1, x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
      b.box('body', x0, 0.4, z0, x1, H, z1, 'b'); b.box('found', x0, 0, z0, x1, 0.4, z1);
      gableRoof(b, x0, x1, z0, z1, H, 3.0, 0.45, true);
      xWindow(b, 0, H + 0.6, z1, 0.9, 1.0);
      xWindow(b, -2.1, 1.1, z1, 1.2, 1.5, { shutters }); xWindow(b, 2.1, 1.1, z1, 1.2, 1.5, { shutters });
      frontDoor(b, 0, z1 + 0.001, {});
      porch3(b, -1.6, 1.6, z1, 2.0, 0.4, ctx, true);
      for (const x of [-2.9, 2.9]) shrub(b, x, z1 + 0.7, 1.0);
      b.box('walk', -0.6, 0.003, z1 + 2.2, 0.6, 0.012, z1 + 11);
      cam = { eye: [3.2, 1.8, 16.5], target: [0, 2.6, 0], fov: 46 };
    } else if (style === 'modern') {
      b.mat('xtrim', { role: 'xtrim', color: '2E3134', gloss: 0.3, part: 'xtrim' });
      const W = 11, D = 8;
      b.box('body', -W / 2, 0, -D / 2, 1.5, 6.0, D / 2, 'b'); b.box('body', 1.5, 0, -D / 2 + 1, W / 2, 3.2, D / 2, 'b');
      b.box('xtrim', -W / 2 - 0.3, 6.0, -D / 2 - 0.3, 1.8, 6.25, D / 2 + 0.3); b.box('xtrim', 1.2, 3.2, -D / 2 + 0.7, W / 2 + 0.3, 3.45, D / 2 + 0.3);
      b.box('glassx', -4.5, 0.4, D / 2, -1.2, 2.7, D / 2 + 0.04); b.box('xtrim', -4.6, 0.3, D / 2, -1.1, 2.8, D / 2 + 0.03); b.box('glassx', -4.5, 0.4, D / 2, -1.2, 2.7, D / 2 + 0.045);
      b.box('glassx', -4.5, 3.3, D / 2, -0.5, 5.4, D / 2 + 0.04);
      for (const x of [-3.5, -2.5, -1.5]) b.box('xtrim', x - 0.03, 3.3, D / 2, x + 0.03, 5.4, D / 2 + 0.06);
      frontDoor(b, 0.4, D / 2 + 0.001, {});
      if (wantGarage) garageDoor3(b, 3.6, D / 2, 3.2, 2.3); else xWindow(b, 3.6, 0.9, D / 2, 2.2, 1.5);
      b.box('walk', -0.2, 0.003, D / 2 + 1.1, 1.0, 0.012, D / 2 + 11);
      for (const x of [-4.6, -2.0, 2.2]) shrub(b, x, D / 2 + 0.7, 0.9);
      cam = { eye: [2.8, 1.8, 19], target: [0, 2.8, 0], fov: 46 };
    } else {
      // the ranch house: one story, a low roof and an attached garage
      const W = 12, D = 8, H = 2.9, x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
      b.box('body', x0, 0.3, z0, x1, H, z1, 'b'); b.box('found', x0, 0, z0, x1, 0.3, z1);
      gableRoof(b, x0, x1, z0, z1, H, 1.7, 0.5, false);
      for (const sx of [x0, x1]) b.box('xtrim', sx - 0.07, 0.3, z1 - 0.07, sx + 0.07, H, z1 + 0.07);
      xWindow(b, -4.0, 1.0, z1, 1.3, 1.3, { shutters }); xWindow(b, -1.9, 1.0, z1, 1.3, 1.3, { shutters });
      frontDoor(b, 0.4, z1, {});
      const garage = sp === 'garage_door' || ctx.part === 'gdoor' || !shutters;
      if (garage) garageDoor3(b, 3.6, z1, 3.6, 2.2); else xWindow(b, 3.4, 1.0, z1, 1.3, 1.3, { shutters });
      b.box('walk', -0.25, 0.003, z1 + 1.1, 1.05, 0.012, z1 + 11);
      for (const x of [-4.9, -3.0, -1.1]) shrub(b, x, z1 + 0.75, 1.0);
      if (sp === 'porch_floor') porch3(b, -2.6, 1.6, z1, 2.0, 0.3, ctx, true);
      cam = { eye: [2.4, 1.75, 17], target: [0, 1.7, 0], fov: 46 };
    }
    for (const [x, z, s] of [[-13, -6, 1.2], [12, -7, 1.3], [-17, 4, 1.0], [16, 3, 1.1], [-6, -14, 1.3], [7, -15, 1.4]]) tree(b, x, z, s);
    if (sp === 'front_door' && ctx.closeup) cam = ctx.closeup;
    return { cam, outside: true };
  }
  function porch3(b, x0, x1, z1, depth, y, ctx, small) {
    b.mat('porchfloor', { role: 'step', color: 'A8A39A', wood: ctx.part === 'step' ? null : null, pat: PAT.lap, gloss: 0.3, part: 'step' });
    b.box('porchfloor', x0, y - 0.15, z1, x1, y, z1 + depth);
    b.box('xtrim', x0, 0, z1 + depth - 0.05, x1, y - 0.15, z1 + depth);
    for (let i = 0; i < 3; i++) b.box('porchfloor', -0.9 + i * 0.0, y - 0.15 - i * 0.17 - 0.0, z1 + depth + i * 0.3, 0.9, y - i * 0.17, z1 + depth + (i + 1) * 0.3);
    const posts = small ? [x0 + 0.1, x1 - 0.1] : [x0 + 0.1, x0 + (x1 - x0) * 0.33, x0 + (x1 - x0) * 0.67, x1 - 0.1];
    for (const px of posts) b.box('xtrim', px - 0.09, y, z1 + depth - 0.25, px + 0.09, y + 2.5, z1 + depth - 0.07);
    b.box('xtrim', x0, y + 2.5, z1 + depth - 0.3, x1, y + 2.72, z1 + depth);
    b.quad('roof', [x0 - 0.2, y + 2.75, z1 + depth + 0.3], [x1 + 0.2, y + 2.75, z1 + depth + 0.3], [x1 + 0.2, y + 3.3, z1], [x0 - 0.2, y + 3.3, z1], norm([0, depth, 0.55]));
    b.mat('porchceil', { color: 'DCE8EC' }); b.quad('porchceil', [x0, y + 2.72, z1 + depth], [x1, y + 2.72, z1 + depth], [x1, y + 2.72, z1], [x0, y + 2.72, z1], [0, -1, 0]);
    if (!small) for (const s of [-1, 1]) { const rx0 = s < 0 ? x0 + 0.2 : 1.1, rx1 = s < 0 ? -1.1 : x1 - 0.2; b.box('xtrim', rx0, y + 0.9, z1 + depth - 0.18, rx1, y + 0.96, z1 + depth - 0.12); for (let xx = rx0 + 0.1; xx < rx1; xx += 0.14) b.box('xtrim', xx - 0.018, y, z1 + depth - 0.17, xx + 0.018, y + 0.9, z1 + depth - 0.13); }
    b.mat('rocker', { color: '2E3134', gloss: 0.3 }); if (!small) { armchair(b, -3.0, z1 + 0.9, 0.15, 'rocker'); armchair(b, 3.0, z1 + 0.9, -0.15, 'rocker'); }
  }

  Object.assign(SCENES, {
    house: (b, ctx) => house(b, ctx, 'ranch'),
    colonial: (b, ctx) => house(b, ctx, 'colonial'),
    farmhouse: (b, ctx) => house(b, ctx, 'farmhouse'),
    cottage: (b, ctx) => house(b, ctx, 'cottage'),
    modern: (b, ctx) => house(b, ctx, 'modern'),
    doorway(b, ctx) { const info = house(b, Object.assign({}, ctx, { siding: ctx.siding || (ctx.a && ctx.a.siding) || 'fiber' }), 'ranch'); plant(b, -0.75, 4.6, 1.2, 0.3); plant(b, 1.55, 4.6, 1.2, 0.3); info.cam = { eye: [1.3, 1.45, 9.2], target: [0.4, 1.35, 4], fov: 42 }; return info; },
    porch(b, ctx) { const info = house(b, ctx, 'farmhouse'); info.cam = { eye: [3.4, 1.7, 9.8], target: [0, 0.8, 4.6], fov: 48 }; return info; },
    barn(b, ctx) {
      yardMats(b); bodyMat(b, 'board', ctx); ground(b, 60);
      const W = 6, D = 5, H = 2.7, x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
      b.box('body', x0, 0, z0, x1, H, z1, 'b');
      // a gambrel roof: steep lower slopes, shallow upper ones
      const pts = [[-3.25, H - 0.1], [-2.1, H + 1.35], [0, H + 2.05], [2.1, H + 1.35], [3.25, H - 0.1]];
      for (let i = 0; i < 4; i++) { const [xa, ya] = pts[i], [xb, yb] = pts[i + 1]; b.quad('roof', [xa, ya, z0 - 0.3], [xb, yb, z0 - 0.3], [xb, yb, z1 + 0.3], [xa, ya, z1 + 0.3], norm([-(yb - ya), xb - xa, 0])); }
      for (const sz of [z0, z1]) { const n = [0, 0, sz === z0 ? -1 : 1]; b.quad('body', [x0, H, sz], [-2.0, H + 1.3, sz], [2.0, H + 1.3, sz], [x1, H, sz], n); b.quad('body', [-2.0, H + 1.3, sz], [0, H + 2.0, sz], [0, H + 2.0, sz], [2.0, H + 1.3, sz], n); }
      b.box('xtrim', -1.2, 0, z1, 1.2, 2.2, z1 + 0.04);
      for (const s of [-1, 1]) { const cx = s * 0.6; b.box('xtrim', cx - 0.6, 0, z1 + 0.04, cx + 0.6, 0.1, z1 + 0.07); b.box('xtrim', cx - 0.6, 2.1, z1 + 0.04, cx + 0.6, 2.2, z1 + 0.07); b.box('xtrim', cx - 0.6, 0, z1 + 0.04, cx - 0.5, 2.2, z1 + 0.07); b.box('xtrim', cx + 0.5, 0, z1 + 0.04, cx + 0.6, 2.2, z1 + 0.07);
        const steps = 12; for (let i = 0; i < steps; i++) { const t = (i + 0.5) / steps; b.box('xtrim', cx - 0.5 + t * 1.0 - 0.05, 0.1 + t * 2.0 - 0.05, z1 + 0.05, cx - 0.5 + t * 1.0 + 0.05, 0.1 + t * 2.0 + 0.05, z1 + 0.075); b.box('xtrim', cx + 0.5 - t * 1.0 - 0.05, 0.1 + t * 2.0 - 0.05, z1 + 0.05, cx + 0.5 - t * 1.0 + 0.05, 0.1 + t * 2.0 + 0.05, z1 + 0.075); } }
      xWindow(b, 0, H + 0.4, z1, 0.7, 0.7);
      for (const [x, z, s] of [[-9, -6, 1.2], [8, -5, 1.1], [-12, 5, 1.0], [11, 4, 1.2]]) tree(b, x, z, s);
      shrub(b, -2.4, z1 + 0.6, 0.9);
      return { cam: { eye: [3.2, 1.6, 11.5], target: [0, 1.8, 0], fov: 46 }, outside: true };
    },
    cabin(b, ctx) {
      yardMats(b); ground(b, 60);
      b.mat('logs', { role: 'body', color: '9C6B43', wood: { sp: 'pine', board: 30 }, part: 'body' });
      const W = 8, D = 6.5, H = 2.9, x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2, r = 0.15;
      for (let y = r; y < H; y += r * 2) { b.rod('logs', 'x', 0, y, z1, r, W + 0.5, 12); b.rod('logs', 'x', 0, y, z0, r, W + 0.5, 12); b.rod('logs', 'z', x0, y + r, 0, r, D + 0.5, 12); b.rod('logs', 'z', x1, y + r, 0, r, D + 0.5, 12); }
      b.mat('body', { role: 'body', color: '9C6B43', wood: { sp: 'pine', board: 30 }, part: 'body' });
      b.box('logs', x0, 0, z0, x1, H, z1);
      gableRoof(b, x0 - 0.2, x1 + 0.2, z0, z1, H, 2.0, 0.6, false);
      xWindow(b, -2.4, 1.0, z1 + r, 1.1, 1.2); xWindow(b, 2.4, 1.0, z1 + r, 1.1, 1.2);
      frontDoor(b, 0, z1 + r, {});
      porch3(b, x0 + 0.3, x1 - 0.3, z1 + r, 2.0, 0.3, ctx, true);
      for (const [x, z, s] of [[-10, -6, 1.3], [9, -7, 1.4], [-13, 4, 1.1], [12, 3, 1.2], [-4, -12, 1.5], [5, -13, 1.3]]) tree(b, x, z, s);
      return { cam: { eye: [3.4, 1.8, 15], target: [0, 1.9, 0], fov: 46 }, outside: true };
    },
    deck: (b, ctx) => deckScene(b, ctx, 'deck'),
    pergola: (b, ctx) => deckScene(b, ctx, 'pergola'),
    patioset: (b, ctx) => deckScene(b, ctx, 'patioset'),
    playset: (b, ctx) => deckScene(b, ctx, 'playset'),
    dock: (b, ctx) => deckScene(b, ctx, 'dock'),
    fence: (b, ctx) => fenceScene(b, ctx, false),
    picket: (b, ctx) => fenceScene(b, ctx, true),
  });
  // the stained wood on a deck, fence or outdoor furniture
  function deckWood(b, ctx, name, o) {
    return b.mat(name, Object.assign({ color: 'B58A5C', wood: { sp: ctx.tex ? ctx.tex.sp : 'cedar', board: 14 }, gloss: 0.15, part: 'deck' }, o || {}));
  }
  function adirondack(b, x, z, ry, mat) {
    b.push().at(x, 0, z, ry);
    for (let i = 0; i < 5; i++) b.box(mat, -0.3 + i * 0.13, 0.4, -0.3, -0.3 + i * 0.13 + 0.1, 0.43, 0.32);
    b.push().at(0, 0.42, -0.32, 0); for (let i = 0; i < 5; i++) { const x0 = -0.28 + i * 0.12; b.box(mat, x0, 0, -0.18, x0 + 0.09, 0.62 + (i === 2 ? 0.1 : i === 1 || i === 3 ? 0.06 : 0), -0.14); } b.pop();
    for (const s of [-1, 1]) { b.box(mat, s * 0.36 - 0.06, 0.6, -0.3, s * 0.36 + 0.06, 0.63, 0.45); b.box(mat, s * 0.34 - 0.03, 0, 0.32, s * 0.34 + 0.03, 0.6, 0.38); b.box(mat, s * 0.32 - 0.03, 0, -0.35, s * 0.32 + 0.03, 0.45, -0.29); }
    b.shadow(0, 0.05, 0.85, 0.9, 0.4, 0, 0.62);
    b.pop();
  }
  function deckScene(b, ctx, variant) {
    yardMats(b); ground(b, 70);
    const dk = deckWood(b, ctx, 'deckb', { swap: true });
    const rail = deckWood(b, ctx, 'deckr');
    if (variant === 'dock') {
      b.mat('water', { color: '3F6573', pat: PAT.water, gloss: 0.95 });
      b.quad('water', [-60, 0.02, -60], [60, 0.02, -60], [60, 0.02, 1], [-60, 0.02, 1], [0, 1, 0]);
      b.mat('shore', { color: '8C7A5E', pat: PAT.concrete }); b.box('shore', -60, -0.5, 1, 60, 0.15, 3);
      b.box(dk, -1.2, 0.55, -9, 1.2, 0.62, 2.5);
      for (let z = -8.6; z <= 2; z += 2.1) for (const s of [-1, 1]) b.cyl(rail, s * 1.1, -0.6, z, 0.11, 1.45, 10);
      b.box(rail, -1.22, 0.4, -9.02, 1.22, 0.55, -8.88); for (const s of [-1, 1]) b.box(rail, s * 1.2 - 0.04, 0.4, -9, s * 1.2 + 0.04, 0.55, 2.5);
      adirondack(b, -0.5, -6.8, Math.PI - 0.3, rail); b.shadow(-0.5, -6.8, 0.9, 0.9, 0.35, 0, 0.625);
      for (const [x, s] of [[-30, 1.6], [-18, 1.4], [-6, 1.7], [8, 1.5], [20, 1.8], [34, 1.5]]) tree(b, x, -48, s * 1.4);
      b.mat('farshore', { color: '55704A', pat: PAT.grass }); b.box('farshore', -70, -0.2, -60, 70, 0.4, -44);
      return { cam: { eye: [2.4, 1.9, 5.2], target: [-0.1, 0.4, -5], fov: 50 }, outside: true };
    }
    if (variant === 'playset') {
      const legs = [[-1.8, -1], [-1.8, 1], [1.8, -1], [1.8, 1]];
      b.box(rail, -2.4, 2.4, -0.06, 2.4, 2.56, 0.06);
      for (const sx of [-2.2, 2.2]) for (const sz of [-1, 1]) { const top = [sx, 2.45, 0], foot = [sx + (sx > 0 ? 0.25 : -0.25), 0, sz * 0.9]; const steps = 10; for (let i = 0; i < steps; i++) { const t0 = i / steps, t1 = (i + 1) / steps; const a = add(foot, scl(sub(top, foot), t0)), c = add(foot, scl(sub(top, foot), t1)); b.box(rail, Math.min(a[0], c[0]) - 0.05, Math.min(a[1], c[1]), Math.min(a[2], c[2]) - 0.05, Math.max(a[0], c[0]) + 0.05, Math.max(a[1], c[1]), Math.max(a[2], c[2]) + 0.05); } }
      for (const sx of [-1.0, 0.6]) { for (const dz of [-0.18, 0.18]) b.box('black', sx - 0.008, 0.48, dz - 0.008, sx + 0.008, 2.4, dz + 0.008); b.box('black', sx - 0.25, 0.45, -0.2, sx + 0.25, 0.5, 0.2); }
      b.box(dk, 2.8, 1.4, -0.9, 4.6, 1.48, 0.9); for (const [px, pz] of [[2.85, -0.85], [4.55, -0.85], [2.85, 0.85], [4.55, 0.85]]) b.box(rail, px - 0.06, 0, pz - 0.06, px + 0.06, 2.9, pz + 0.06);
      b.quad('roof', [2.7, 2.9, -1.0], [4.7, 2.9, -1.0], [4.7, 3.5, 0], [2.7, 3.5, 0], norm([0, 1, -0.6])); b.quad('roof', [2.7, 2.9, 1.0], [4.7, 2.9, 1.0], [4.7, 3.5, 0], [2.7, 3.5, 0], norm([0, 1, 0.6]));
      b.mat('slide', { color: '3E8E4A', gloss: 0.6 }); b.quad('slide', [3.1, 1.45, 0.9], [4.3, 1.45, 0.9], [4.3, 0.15, 3.0], [3.1, 0.15, 3.0], norm([0, 2.1, 1.3]));
      b.shadow(0, 0, 4.6, 2.4, 0.3); b.shadow(3.7, 0.3, 2.2, 3.0, 0.3);
      for (const [x, z, s] of [[-8, -9, 1.4], [7, -10, 1.3], [-13, -2, 1.1], [13, -3, 1.2]]) tree(b, x, z, s);
      b.mat('fenceBg', { color: 'A58764', wood: { sp: 'cedar', board: 14, vertical: true }, swap: true }); b.box('fenceBg', -16, 0, -6, 16, 1.8, -5.95);
      return { cam: { eye: [4.6, 2.1, 7.6], target: [1.0, 1.2, 0], fov: 50 }, outside: true };
    }
    // the back of the house, a raised deck with railings and stairs
    bodyMat(b, 'wood', { part: '' });
    b.box('body', -7, 0, -9, 7, 3.0, -3.6, 'b');
    b.box('xtrim', -7.2, 2.9, -3.62, 7.2, 3.15, -3.5); b.quad('roof', [-7.4, 3.1, -3.2], [7.4, 3.1, -3.2], [7.4, 4.8, -6.5], [-7.4, 4.8, -6.5], norm([0, 3.3, 1.7]));
    b.box('xtrim', -1.45, 0.6, -3.6, 1.45, 2.85, -3.55); b.box('glassx', -1.35, 0.65, -3.56, 1.35, 2.75, -3.53); b.box('xtrim', -0.03, 0.65, -3.56, 0.03, 2.75, -3.5);
    xWindow(b, -4.2, 1.3, -3.6, 1.3, 1.25); xWindow(b, 4.2, 1.3, -3.6, 1.3, 1.25);
    const H = 0.62, x0 = -4, x1 = 4, z0 = -3.6, z1 = 0.6;
    b.box(dk, x0, H - 0.05, z0, x1, H, z1);
    b.box(rail, x0, 0.25, z1 - 0.04, x1, H - 0.05, z1); b.box(rail, x0, 0.25, z0, x0 + 0.04, H - 0.05, z1); b.box(rail, x1 - 0.04, 0.25, z0, x1, H - 0.05, z1);
    const sx0 = -0.7, sx1 = 0.7;
    for (let i = 0; i < 3; i++) b.box(dk, sx0, H - 0.05 - (i + 1) * 0.17, z1 + i * 0.28, sx1, H - (i + 1) * 0.17, z1 + (i + 1) * 0.28);
    const post = (x, z) => b.box(rail, x - 0.06, 0, z - 0.06, x + 0.06, H + 1.0, z + 0.06);
    for (const x of [x0 + 0.06, -2, sx0, sx1, 2, x1 - 0.06]) post(x, z1 - 0.06);
    for (const z of [z0 + 0.4, -1.5]) { post(x0 + 0.06, z); post(x1 - 0.06, z); }
    const railRun = (xa, za, xb, zb) => {
      const L = Math.hypot(xb - xa, zb - za), n = Math.floor(L / 0.13);
      b.box(rail, Math.min(xa, xb) - 0.05, H + 0.92, Math.min(za, zb) - 0.05, Math.max(xa, xb) + 0.05, H + 0.97, Math.max(za, zb) + 0.05);
      b.box(rail, Math.min(xa, xb) - 0.03, H + 0.05, Math.min(za, zb) - 0.03, Math.max(xa, xb) + 0.03, H + 0.1, Math.max(za, zb) + 0.03);
      for (let i = 1; i < n; i++) { const t = i / n, x = xa + (xb - xa) * t, z = za + (zb - za) * t; b.box(rail, x - 0.02, H + 0.1, z - 0.02, x + 0.02, H + 0.92, z + 0.02); }
    };
    railRun(x0 + 0.06, z1 - 0.06, sx0, z1 - 0.06); railRun(sx1, z1 - 0.06, x1 - 0.06, z1 - 0.06); railRun(x0 + 0.06, z0 + 0.1, x0 + 0.06, z1 - 0.06); railRun(x1 - 0.06, z0 + 0.1, x1 - 0.06, z1 - 0.06);
    b.shadow(0, -1.5, 8.4, 4.6, 0.25);
    if (variant === 'pergola') {
      for (const [px, pz] of [[-3.7, -0.2], [3.7, -0.2], [-3.7, -3.2], [3.7, -3.2]]) b.box(rail, px - 0.09, H, pz - 0.09, px + 0.09, H + 2.5, pz + 0.09);
      for (const pz of [-0.2, -3.2]) b.box(rail, -4.2, H + 2.35, pz - 0.05, 4.2, H + 2.6, pz + 0.05);
      for (let x = -3.9; x <= 3.9; x += 0.45) b.box(rail, x - 0.03, H + 2.6, -3.6, x + 0.03, H + 2.78, 0.2);
    }
    const chairMat = variant === 'patioset' ? rail : deckWood(b, Object.assign({}, ctx, { tex: null }), 'chairw', { part: 'none', color: 'E9E5DC', wood: null, gloss: 0.3 });
    adirondack(b, -1.6, -1.6, 0.5, chairMat); adirondack(b, 1.5, -1.7, -0.5, chairMat);
    b.box(chairMat, -0.35, H + 0.38, -1.25, 0.35, H + 0.42, -0.75); for (const [px, pz] of [[-0.3, -1.2], [0.3, -1.2], [-0.3, -0.8], [0.3, -0.8]]) b.box(chairMat, px - 0.025, H, pz - 0.025, px + 0.025, H + 0.38, pz + 0.025);
    b.lathe('pot', 3.3, H, -3.0, [[0, 0], [0.22, 0.01], [0.28, 0.5], [0.3, 0.52], [0, 0.52]], 16); for (let i = 0; i < 5; i++) b.sphere('leaf', 3.3 + (i - 2) * 0.08, H + 0.7 + (i % 2) * 0.15, -3.0, 0.2, 0.25, 0.2, 10);
    for (const [x, z, s] of [[-11, -2, 1.3], [11, -4, 1.4], [-6, -16, 1.4], [8, -17, 1.5], [-16, 8, 1.2], [15, 9, 1.3]]) tree(b, x, z, s);
    // chairs sit on the deck, not the ground
    for (const d of b.decals) if (Math.abs(d.y - 0.003) < 0.001 && d.x > x0 && d.x < x1 && d.z > z0 && d.z < z1 && d.w < 2) d.y = H + 0.004;
    return { cam: variant === 'patioset' ? { eye: [2.6, 1.9, 4.4], target: [-0.2, 0.8, -1.6], fov: 50 } : { eye: [5.4, 2.6, 7.6], target: [-0.3, 1.0, -2.2], fov: 50 }, outside: true };
  }
  function fenceScene(b, ctx, picket) {
    yardMats(b); ground(b, 70);
    const fw = deckWood(b, ctx, 'fenceb', { part: 'fence', wood: { sp: ctx.tex ? ctx.tex.sp : 'cedar', board: 14, vertical: true }, swap: true, color: picket ? 'F2F1EC' : 'B58A5C' });
    if (!ctx.tex && picket) b.mats.fenceb.wood = null;
    if (picket) {
      bodyMat(b, 'wood', { part: '' });
      b.box('body', -5, 0.3, -10, 5, 3.0, -4, 'b'); b.box('found', -5, 0, -10, 5, 0.3, -4); gableRoof(b, -5, 5, -10, -4, 3.0, 1.6, 0.45, false);
      xWindow(b, -2.6, 1.0, -4, 1.2, 1.3); xWindow(b, 2.6, 1.0, -4, 1.2, 1.3); frontDoor(b, 0, -4, {});
      b.box('walk', -0.6, 0.003, -2.9, 0.6, 0.012, 6);
      for (let x = -9; x <= 9; x += 0.16) { if (Math.abs(x) < 0.7) continue; b.box(fw, x - 0.045, 0.05, -0.02, x + 0.045, 0.95, 0.02); b.quad(fw, [x - 0.045, 0.95, 0.02], [x + 0.045, 0.95, 0.02], [x, 1.05, 0.02], [x, 1.05, 0.02], [0, 0, 1]); }
      for (const y of [0.25, 0.72]) { b.box(fw, -9.1, y, -0.08, -0.7, y + 0.08, -0.02); b.box(fw, 0.7, y, -0.08, 9.1, y + 0.08, -0.02); }
      for (const x of [-9, -6.6, -4.2, -1.8, -0.75, 0.75, 1.8, 4.2, 6.6, 9]) { b.box(fw, x - 0.06, 0, -0.14, x + 0.06, 1.1, -0.02); b.box(fw, x - 0.08, 1.1, -0.16, x + 0.08, 1.14, 0); }
      for (const x of [-3.8, -2.0, 2.0, 3.8]) shrub(b, x, -3.3, 1.0);
      for (const [x, z, s] of [[-12, -12, 1.4], [12, -13, 1.3], [-16, -2, 1.1]]) tree(b, x, z, s);
      return { cam: { eye: [2.6, 1.5, 6.4], target: [-0.6, 0.9, -1.0], fov: 48 }, outside: true };
    }
    // a privacy fence along the back of the yard
    const z = -3;
    for (let x = -12; x <= 12; x += 0.145) b.box(fw, x - 0.067, 0.04, z - 0.02, x + 0.067, 1.82, z + 0.02);
    for (const y of [0.3, 1.0, 1.6]) b.box(fw, -12.1, y, z - 0.11, 12.1, y + 0.09, z - 0.02);
    for (let x = -12; x <= 12; x += 2.4) { b.box(fw, x - 0.07, 0, z - 0.16, x + 0.07, 1.9, z - 0.02); b.box(fw, x - 0.09, 1.9, z - 0.18, x + 0.09, 1.94, z); }
    b.box(fw, -12.1, 1.82, z - 0.05, 12.1, 1.86, z + 0.05);
    b.box('mulch', -12, 0.003, z + 0.05, 12, 0.03, z + 1.0);
    for (const x of [-6.5, -4, -1.2, 1.6, 4.2, 6.8]) shrub(b, x, z + 0.55, 0.75);
    for (const [x, zz, s] of [[-8, -8, 1.5], [-2, -10, 1.6], [5, -9, 1.5], [11, -11, 1.4], [-13, -11, 1.3]]) tree(b, x, zz, s);
    return { cam: { eye: [2.2, 1.55, 5.6], target: [-0.4, 1.0, -3], fov: 50 }, outside: true };
  }

  // ---------------- product shots for the home screen ----------------
  // A soft studio sweep (floor curving up into the back wall), one key light, and the objects on it.
  function studio(b, bg) {
    b.mat('bd', { color: bg, gloss: 0.04 });
    const zc = -0.32, r = 0.3, W = 3;
    b.quad('bd', [-W, 0, zc], [W, 0, zc], [W, 0, 2.5], [-W, 0, 2.5], [0, 1, 0]);
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI / 2, a1 = (i + 1) / N * Math.PI / 2;
      const p = a => [zc - Math.sin(a) * r, r - Math.cos(a) * r];
      const [z0, y0] = p(a0), [z1, y1] = p(a1), am = (a0 + a1) / 2;
      b.quad('bd', [-W, y0, z0], [W, y0, z0], [W, y1, z1], [-W, y1, z1], norm([0, Math.cos(am), Math.sin(am)]));
    }
    b.quad('bd', [-W, r, zc - r], [W, r, zc - r], [W, 3, zc - r], [-W, 3, zc - r], [0, 0, 1]);
  }
  // a paint chip strip: a white card with three shades of one color on it
  function chipStrip(b, name, hex, len) {
    const L = C.hexToLinear(hex), shade = k => C.linearToHex(L.map(v => Math.min(1, Math.max(0, k > 1 ? v + (1 - v) * (k - 1) : v * k))));
    b.mat(name + 'w', { color: 'F7F6F2', gloss: 0.15 });
    b.rbox(name + 'w', -0.03, 0, -len, 0.03, 0.0035, 0.012, 0.004, 1);
    [[1.35, 0.06], [1, 0.36], [0.62, 0.66]].forEach(([k, t], i) => { b.mat(name + i, { color: shade(k), gloss: 0.2 }); b.box(name + i, -0.026, 0.0036, -len * (t + 0.28), 0.026, 0.0042, -len * t); });
  }
  Object.assign(SCENES, {
    'tile-paint'(b) {
      studio(b, 'EAE4D9');
      const hues = ['E8DFCF', 'C9B79C', 'A9B8A0', '6F8F85', '4F6B7D', '2F3B4C', 'C47F5E'];
      hues.forEach((h, i) => { b.push().at(-0.1, i * 0.0046, 0.14, (i - 3) * 0.24 + 0.05); chipStrip(b, 'chip' + i, h, 0.28); b.pop(); });
      b.cyl('brass', -0.1, 0, 0.14, 0.011, 0.038, 14);
      b.shadow(-0.1, -0.02, 0.5, 0.32, 0.25);
      // a roller with sage paint on it
      b.mat('cover', { color: '6F8F85', pat: PAT.fabric, gloss: 0.25 });
      b.rod('cover', 'x', 0.27, 0.038, 0.06, 0.038, 0.2, 24);
      b.mat('wire', { color: 'B9BCBE', gloss: 0.8 });
      b.rod('wire', 'x', 0.39, 0.038, 0.06, 0.005, 0.04, 8); b.rod('wire', 'z', 0.41, 0.038, 0.115, 0.005, 0.11, 8);
      b.mat('grip', { color: 'B5362E', gloss: 0.45 }); b.rod('grip', 'z', 0.41, 0.038, 0.26, 0.016, 0.19, 14);
      b.shadow(0.3, 0.12, 0.3, 0.38, 0.28);
      return { cam: { eye: [0.07, 0.43, 0.66], target: [0.08, 0.0, 0.01], fov: 33 }, studio: true, shadowC: [0.08, 0, 0.05], shadowR: 0.55 };
    },
    'tile-stain'(b) {
      studio(b, 'E8DFD3');
      const boards = [['b1', null, -0.13, 0.06], ['b2', { hex: 'A3794A', type: 'semi' }, 0.02, -0.03], ['b3', { hex: '5A3E2B', type: 'semi' }, 0.17, 0.04]];
      for (const [n, st, z, ry] of boards) { b.mat(n, { color: 'C9A77A', wood: { sp: 'red_oak', board: 32, cm: 0.12, stain: st, seed: n.length + z * 100 }, gloss: st ? 0.35 : 0.12 }); b.push().at(-0.06, 0, z, ry); b.rbox(n, -0.26, 0, -0.06, 0.26, 0.022, 0.06, 0.003, 1); b.pop(); }
      b.shadow(-0.06, 0.02, 0.6, 0.48, 0.3);
      // a can of stain with a dark label
      b.mat('tin', { color: 'BFC2C4', gloss: 0.85 }); b.mat('label', { color: '3A2A20', gloss: 0.35 }); b.mat('labelB', { color: 'C9A15E', gloss: 0.35 });
      b.cyl('tin', 0.33, 0, -0.02, 0.07, 0.115, 28); b.cyl('label', 0.33, 0.016, -0.02, 0.0708, 0.08, 28, 0.0708, ''); b.cyl('labelB', 0.33, 0.05, -0.02, 0.0712, 0.012, 28, 0.0712, '');
      b.cyl('tin', 0.33, 0.115, -0.02, 0.068, 0.006, 28, 0.066);
      b.shadow(0.33, -0.02, 0.2, 0.2, 0.35);
      return { cam: { eye: [0.06, 0.42, 0.62], target: [0.07, 0.0, 0.0], fov: 34 }, studio: true, shadowC: [0.08, 0, 0.0], shadowR: 0.55 };
    },
    'tile-buy'(b) {
      studio(b, 'DFE8E3');
      // a gallon of paint
      b.mat('tin', { color: 'C4C7C9', gloss: 0.85 }); b.mat('label', { color: '2F6B5E', gloss: 0.35 }); b.mat('labelW', { color: 'F4F2EC', gloss: 0.3 });
      const cx = -0.12, cz = -0.02;
      b.cyl('tin', cx, 0, cz, 0.085, 0.19, 32); b.cyl('label', cx, 0.03, cz, 0.0856, 0.12, 32, 0.0856, ''); b.cyl('labelW', cx, 0.085, cz, 0.0862, 0.018, 32, 0.0862, ''); b.cyl('labelW', cx, 0.115, cz, 0.0862, 0.008, 32, 0.0862, '');
      b.lathe('tin', cx, 0.19, cz, [[0.086, 0], [0.088, 0.006], [0.08, 0.008], [0.077, 0.004], [0, 0.004]], 32);
      b.shadow(cx, cz, 0.22, 0.22, 0.4);
      // an angled brush
      b.push().at(0.14, 0, 0.12, -0.55);
      b.mat('handle', { color: 'B48A63', wood: { sp: 'birch', board: 30 }, gloss: 0.3 }); b.rbox('handle', -0.17, 0, -0.016, -0.02, 0.022, 0.016, 0.01);
      b.mat('ferrule', { color: 'B9BCBE', gloss: 0.9 }); b.rbox('ferrule', -0.025, 0, -0.03, 0.03, 0.026, 0.03, 0.004);
      b.mat('bristle', { color: '2F3B4C', pat: PAT.bead, gloss: 0.1 }); b.rbox('bristle', 0.03, 0.002, -0.028, 0.1, 0.02, 0.028, 0.006);
      b.shadow(-0.03, 0, 0.3, 0.09, 0.3);
      b.pop();
      // a roller resting in a tray of paint
      b.mat('tray', { color: '4A4D50', gloss: 0.4 }); b.mat('pool', { color: 'D9CDB8', gloss: 0.6 });
      b.rbox('tray', 0.12, 0, -0.2, 0.42, 0.028, 0.02, 0.01); b.box('pool', 0.14, 0.028, -0.18, 0.4, 0.0285, -0.01);
      b.mat('cover', { color: 'D9CDB8', pat: PAT.fabric }); b.rod('cover', 'x', 0.27, 0.06, -0.1, 0.03, 0.2, 24);
      b.mat('wire', { color: 'B9BCBE', gloss: 0.8 }); b.rod('wire', 'x', 0.385, 0.06, -0.1, 0.004, 0.03, 8);
      b.shadow(0.27, -0.09, 0.34, 0.26, 0.3);
      return { cam: { eye: [0.09, 0.4, 0.74], target: [0.1, 0.075, -0.03], fov: 34 }, studio: true, shadowC: [0.1, 0, -0.02], shadowR: 0.55 };
    },
    'tile-lookup'(b) {
      studio(b, 'E7E5EF');
      const hues = ['D1CBC1', 'A7B3A0', '8C9FB3', 'C58F73', 'E3D5B8'];
      hues.forEach((h, i) => {
        b.mat('card' + i, { color: 'F8F7F4', gloss: 0.15 }); b.mat('cardc' + i, { color: h, gloss: 0.2 });
        const x = -0.28 + i * 0.13, ry = (i - 2) * 0.05;
        b.push().at(x, 0, 0.02 + Math.abs(i - 2) * 0.012, ry); b.rbox('card' + i, -0.05, 0, -0.08, 0.05, 0.003, 0.08, 0.004, 1); b.box('cardc' + i, -0.044, 0.003, -0.074, 0.044, 0.0036, 0.035); b.pop();
      });
      b.shadow(0, 0.03, 0.75, 0.24, 0.22);
      // a magnifying glass over the middle chip: the glass shows that color, a little larger
      const mx = 0.0, mz = -0.01, R = 0.075, t = 0.009;
      b.mat('ring', { color: '2B2B2C', gloss: 0.6, twoSided: true });
      const prof = []; for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2; prof.push([R + Math.cos(a) * t, 0.05 + Math.sin(a) * t]); }
      b.lathe('ring', mx, 0, mz, prof, 36);
      b.mat('lens', { color: '8C9FB3', gloss: 1, emit: 'none' }); b.cyl('lens', mx, 0.048, mz, R - 0.004, 0.004, 36);
      b.push().at(mx, 0, mz, -0.6); b.rod('ring', 'x', R + 0.08, 0.05, 0, 0.012, 0.15, 14); b.pop();
      b.shadow(mx + 0.06, mz + 0.03, 0.32, 0.2, 0.28);
      return { cam: { eye: [0.0, 0.42, 0.6], target: [0.0, 0.0, 0.0], fov: 34 }, studio: true, shadowC: [0, 0, 0], shadowR: 0.55 };
    },
  });
  // where a stain goes, by the stain job
  const STAIN_PARTS = { floors: ['floor'], stairs: ['floor'], cabinets: ['cab'], builtins: ['cab'], furniture: ['furn'], tabletop: ['furn'], trim: ['trim', 'door'], doors: ['door'], paneling: ['wain'], deck: ['deck'], dock: ['deck'], outdoor: ['deck'], pergola: ['deck'], playset: ['deck'], fence: ['fence'], siding: ['body'], shed: ['body'], log: ['body'], front_door: ['xdoor'], garage_door: ['gdoor'], shutters: ['shut'] };

  // ================================================================
  // THE VIEWER: one scene on one canvas, as a still picture or turned with a finger or mouse
  // ================================================================
  let ok = null;
  function supported() {
    if (ok != null) return ok;
    try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); ok = !!gl; if (gl) { const e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } } catch (e) { ok = false; }
    return ok;
  }
  function emitFor(kind, L, inside) {
    if (kind === 'win') return L.night ? scl(L.win, 0.6) : scl(L.win, inside ? 1.15 : 0.9);
    if (kind === 'lamp') return L.night ? scl(L.lampTint || [1, 0.9, 0.8], 1.25) : [0.06, 0.055, 0.05];
    if (kind === 'house') return L.night ? [0.85, 0.62, 0.36] : [0, 0, 0];
    if (kind === 'fire') return L.night || L.overcast ? [1.1, 0.48, 0.14] : [0.55, 0.22, 0.06];
    if (kind === 'mirror') return scl(L.sky, 0.42);
    if (kind === 'screen') return L.night ? [0.04, 0.06, 0.1] : [0.01, 0.012, 0.016];
    return [0, 0, 0];
  }
  function mount(container, o) {
    if (!supported()) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'gl' + (o.interactive ? '' : ' still');
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    let r;
    try { r = new Renderer(canvas); } catch (e) { ok = false; canvas.remove(); if (window.console) console.warn('3D view off:', e && e.message); return null; }
    if (!r.gl) { canvas.remove(); return null; }
    const a = o.answers || {};
    const target = o.stain ? a.target : '';
    const ctx = { a, useAnswers: !o.stain && !!a.space, stain: !!o.stain, tex: o.tex || null, parts: o.stain ? (STAIN_PARTS[target] || ['floor']) : [], wainscot: a.space === 'wainscot' || target === 'paneling', siding: a.space === 'shed' ? 'board' : '', paintFurn: a.space === 'furniture', paintCab: a.space === 'builtins' };
    ctx.part = ctx.parts[0] || '';
    if (o.floor) ctx.floor = o.floor;
    if (a.space === 'floor_paint') ctx.floor = 'concrete';
    if (['bathroom', 'powder', 'laundry'].includes(a.space)) ctx.floor = 'tile';
    const b = new Builder();
    let info;
    try { info = (SCENES[o.scene] || SCENES.living)(b, ctx) || {}; r.upload(b); } catch (e) { r.dispose(); canvas.remove(); if (window.console) console.warn('3D scene failed:', e && e.message); return null; }
    let look = { roles: Object.assign({}, o.roles || {}), tex: o.tex || null };
    let lightId = o.light || 'daylight';
    const cal = o.cal || null;
    let mats = {};
    let anim = null, raf = 0, dead = false;
    // the materials for the current look and light
    function resolve() {
      const L = LIGHTS[lightId] || LIGHTS.daylight;
      const E3 = root.CG.engine;
      const lightObj = lightId && lightId !== 'none' && E3 ? E3.LIGHTS.find(l => l.id === lightId) || null : null;
      const gain = WD.gainFor(lightObj, cal);
      const out = {};
      for (const [name, d] of Object.entries(b.mats)) {
        const hex = d.role && look.roles[d.role] && /^[0-9A-F]{6}$/i.test(look.roles[d.role]) ? look.roles[d.role] : d.color;
        const m = { lin: linOf(hex, lightObj, cal), gloss: d.gloss || 0, pat: d.pat || 0, scale: d.scale || 1, twoSided: !!d.twoSided, noShadow: !!d.noShadow, swap: !!d.swap, hex };
        if (d.emit) { m.emit = emitFor(d.emit, L, !info.outside); if (d.emit === 'win' || d.emit === 'fire' || d.emit === 'screen') m.lin = [0, 0, 0]; }
        const stained = look.tex && ctx.parts.includes(d.part);
        if (stained) { m.tex = woodTexture({ sp: look.tex.sp, stain: look.tex.stain, board: (d.wood && d.wood.board) || 12, vertical: d.wood && d.wood.vertical, cm: (d.wood && d.wood.cm) || 0.3, seed: 3 }, gain); m.gloss = Math.max(m.gloss, 0.3); if (d.pat === PAT.lap || d.pat === PAT.batten || d.pat === PAT.shake) m.pat = d.pat; else m.pat = 0; m.lin = [1, 1, 1]; }
        else if (d.wood) { m.tex = woodTexture({ sp: d.wood.sp, stain: d.wood.stain || null, tint: d.role && !d.wood.stain ? hex : null, board: d.wood.board, vertical: d.wood.vertical, cm: d.wood.cm || 0.3, seed: d.wood.seed || 2 }, gain); m.pat = d.pat === PAT.lap || d.pat === PAT.batten ? d.pat : 0; }
        else if (d.stone) { m.tex = stoneTexture(hex); }
        const prev = mats[name];
        if (anim && prev && anim.names.includes(name)) { m.prev = anim.prev[name]; m.wipe = 0; }
        out[name] = m;
      }
      mats = out;
    }
    // the camera: a still spot, or orbiting it
    const cam0 = info.cam || IN_CAM;
    // inside, turning happens around the middle of the room (on the same line of sight as the picture), so the
    // camera stays in the room; outside, around the house
    const orbit0 = (() => {
      let target = cam0.target.slice();
      if (!info.outside && b.room) {
        const c = [(b.room.min[0] + b.room.max[0]) / 2, 1.2, (b.room.min[2] + b.room.max[2]) / 2];
        const dir = norm(sub(cam0.target, cam0.eye));
        target = add(cam0.eye, scl(dir, Math.max(0.8, dot(sub(c, cam0.eye), dir))));
      }
      const off = sub(cam0.eye, target), d = len(off);
      return { yaw: Math.atan2(off[0], off[2]), pitch: Math.asin(off[1] / d), dist: d, target };
    })();
    let orbit = Object.assign({}, orbit0, { target: orbit0.target.slice() });
    function eye() { const cp = Math.cos(orbit.pitch); return add(orbit.target, [Math.sin(orbit.yaw) * cp * orbit.dist, Math.sin(orbit.pitch) * orbit.dist, Math.cos(orbit.yaw) * cp * orbit.dist]); }
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round((o.width || container.clientWidth || 600) * dpr)), h = Math.max(2, Math.round((o.height || container.clientHeight || 360) * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    function draw(now) {
      if (dead || !r.gl) return;
      size();
      const L = LIGHTS[lightId] || LIGHTS.daylight;
      const e = eye(), aspect = canvas.width / canvas.height;
      const fov = (cam0.fov || 50) * D2R * (aspect < 1.4 ? Math.min(1.35, 1.4 / aspect) : 1);
      const vp = mmul(persp(fov, aspect, info.outside ? 0.2 : 0.05, info.outside ? 400 : 60), lookAt(e, orbit.target, [0, 1, 0]));
      // the sun
      const el = L.el * D2R;
      let sunOn = false, sunDir = [0, 1, 0], sunCol = [0, 0, 0];
      const lamps = [];
      let amb = L.amb;
      if (info.studio) {
        // a product shot: one soft key light from the upper left, an even fill, nothing else
        sunDir = norm([-0.5, 0.95, 0.42]); sunCol = [0.95, 0.93, 0.9]; sunOn = true; amb = 0.78;
      } else if (info.outside) {
        if (L.sun > 0) { const az = lightId === 'golden' ? -1.15 : -0.7; sunDir = norm([Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]); sunCol = scl(L.sunTint || [1, 1, 1], L.sun * 1.05); sunOn = true; }
        if (L.night) for (const l of b.lamps.filter(l => l.kind === 'porch').slice(0, 6)) lamps.push({ p: l.p, c: scl(L.lampTint || [1, 0.9, 0.8], 2.2), r: 3.5 });
      } else {
        const wins = b.windows;
        const pref = lightId === 'golden' ? ['west', 'south', '?', 'east'] : ['south', 'west', '?', 'east'];
        let sw = null; for (const d of pref) { sw = wins.find(w => w.dir === d); if (sw) break; }
        if (L.sun > 0 && sw && !L.overcast) {
          const side = cross([0, 1, 0], sw.out);
          sunDir = norm(add(add(scl(sw.out, Math.cos(el)), [0, Math.sin(el), 0]), scl(side, 0.35)));
          const weak = sw.dir === 'east' && (lightId === 'golden' || lightId === 'sun') ? 0.45 : sw.dir === '?' ? 0.8 : 1;
          sunCol = scl(L.sunTint || [1, 1, 1], L.sun * weak * 1.15); sunOn = true;
        }
        if (!L.night) for (const w of wins.slice(0, 4)) lamps.push({ p: add(w.center, scl(w.out, -0.7)), c: scl(L.win, 0.5 * Math.min(2.2, (w.w || 1.2) * (w.h || 1.3)) * (lightId === 'dim' ? 0.35 : 1) * (w.dir === 'north' ? 0.85 : 1)), r: -2.4 });
        if (L.night || lightId === 'dim' || !wins.length) for (const l of b.lamps.slice(0, 6 - lamps.length)) lamps.push({ p: l.p, c: scl(L.lampTint || [1, 0.92, 0.82], l.power * (L.night ? 1.2 : !wins.length ? 0.9 : 0.45)), r: 2.3 });
        if (!wins.length && !L.night) amb *= 0.85;
      }
      // the sun's shadow covers the scene
      let lvp = new Float32Array(16);
      if (sunOn) {
        const lo = b.lo, hi = b.hi;
        const c = info.shadowC || (info.outside ? [orbit.target[0], 0, orbit.target[2]] : [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]);
        const R = info.shadowR || (info.outside ? 22 : Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 0.5);
        const lv = lookAt(add(c, scl(sunDir, R * 2)), c, Math.abs(sunDir[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]);
        lvp = mmul(ortho(-R, R, -R, R, 0.1, R * 4), lv);
      }
      // the paint roller sweeping a new color across
      let wipePlane = [1, 0, 0, 0];
      if (anim) {
        const t = Math.min(1, ((now || performance.now()) - anim.start) / anim.dur);
        const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        wipePlane = [1, 0, 0, anim.x0 + (anim.x1 - anim.x0) * k];
        if (t >= 1) { anim = null; for (const m of Object.values(mats)) { delete m.prev; delete m.wipe; } }
      }
      r.draw({ vp, inv: inv4(vp), eye: e, lvp, sunDir, sunCol, sunOn, showSun: info.outside, sky: L.sky, ground: L.ground, horizon: L.horizon, skyTop: L.skyTop, amb, exp: L.exp * (o.exposure || 1), lamps, room: info.outside ? null : b.room, mats, wipePlane, clear: info.outside ? L.horizon : [0.88, 0.87, 0.85], skyBox: !!info.outside, time: (now || 0) / 1000 });
      if (anim || (info.water && o.interactive)) schedule();
    }
    function schedule() { if (!raf && !dead) raf = requestAnimationFrame(t => { raf = 0; draw(t); }); }
    resolve();
    draw(performance.now());
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { draw(performance.now()); }) : null;
    if (ro) ro.observe(container);
    // the device took the 3D drawing away (too many open, or the graphics restarted): show the flat picture.
    // Closing a view on purpose also loses its context, and that must not count.
    let closed = false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); if (closed) return; dead = true; if (o.onLost) o.onLost(); });
    // turning it: drag to orbit, pinch or scroll to zoom, double-tap to reset, arrow keys too
    let hint = null;
    if (o.interactive) {
      canvas.tabIndex = 0; canvas.setAttribute('role', 'img'); canvas.removeAttribute('aria-hidden'); canvas.setAttribute('aria-label', 'A 3D view. Drag to look around, pinch or scroll to zoom, arrow keys to turn.');
      hint = document.createElement('span'); hint.className = 'scene-hint'; hint.textContent = 'Drag to look around'; container.appendChild(hint);
      const ptrs = new Map(); let pinch0 = 0, dist0 = 0;
      const lim = () => { orbit.pitch = Math.max(info.outside ? 0.02 : -0.25, Math.min(1.25, orbit.pitch)); orbit.dist = Math.max(orbit0.dist * 0.35, Math.min(orbit0.dist * (info.outside ? 2.2 : 2.6), orbit.dist)); };
      canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch0 = Math.hypot(p[0] - q[0], p[1] - q[1]); dist0 = orbit.dist; } if (hint) hint.classList.add('gone'); });
      canvas.addEventListener('pointermove', e => {
        if (!ptrs.has(e.pointerId)) return;
        const last = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (pinch0) { orbit.dist = dist0 * pinch0 / d; lim(); schedule(); } return; }
        orbit.yaw -= (e.clientX - last[0]) * 0.007; orbit.pitch += (e.clientY - last[1]) * 0.005; lim(); schedule();
      });
      const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', e => { e.preventDefault(); orbit.dist *= Math.exp(e.deltaY * 0.0012); lim(); schedule(); }, { passive: false });
      canvas.addEventListener('dblclick', () => { orbit = Object.assign({}, orbit0, { target: orbit0.target.slice() }); schedule(); });
      canvas.addEventListener('keydown', e => { const k = e.key; if (k === 'ArrowLeft') orbit.yaw += 0.1; else if (k === 'ArrowRight') orbit.yaw -= 0.1; else if (k === 'ArrowUp') orbit.pitch += 0.06; else if (k === 'ArrowDown') orbit.pitch -= 0.06; else if (k === '+' || k === '=') orbit.dist *= 0.9; else if (k === '-') orbit.dist *= 1.1; else return; e.preventDefault(); lim(); schedule(); });
      setTimeout(() => { if (hint) hint.classList.add('gone'); }, 4000);
    }
    return {
      setLook(next) {
        const old = {}; for (const [n, m] of Object.entries(mats)) old[n] = m.lin;
        const oldHex = {}; for (const [n, m] of Object.entries(mats)) oldHex[n] = m.hex;
        const texChanged = JSON.stringify(next.tex || null) !== JSON.stringify(look.tex || null);
        look = { roles: Object.assign({}, next.roles || {}), tex: next.tex || null };
        // the parts whose color changed roll on with the paint roller
        const names = Object.keys(b.mats).filter(n => { const d = b.mats[n]; const hex = d.role && look.roles[d.role] ? look.roles[d.role] : d.color; return d.role && oldHex[n] && hex !== oldHex[n] && !d.emit; });
        if (names.length && !o.reduced && !texChanged) {
          anim = { names, prev: old, start: performance.now(), dur: 900, x0: b.lo[0] - 0.3, x1: b.hi[0] + 0.3 };
          setTimeout(() => { if (anim) { anim.start = -1e9; draw(performance.now()); } }, 1000);
        }
        resolve(); draw(performance.now());
      },
      setLight(id) { lightId = id; resolve(); draw(performance.now()); },
      destroy() { closed = true; dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); r.dispose(); canvas.remove(); if (hint) hint.remove(); },
    };
  }
  root.CG = root.CG || {};
  // a scene drawn once to a picture (the home screen's product shots): no live 3D left running
  function snapshot(scene, w, h) {
    if (!supported()) return '';
    const host = document.createElement('div');
    const v = mount(host, { scene, width: w, height: h, light: 'daylight', interactive: false, reduced: true });
    if (!v) return '';
    let url = '';
    try { url = host.querySelector('canvas').toDataURL('image/jpeg', 0.9); } catch (e) { url = ''; }
    v.destroy();
    return url;
  }
  root.CG.room3d = { supported, has: id => !!SCENES[id], mount, snapshot, scenes: () => Object.keys(SCENES).filter(k => !k.startsWith('tile-')) };
})(window);
