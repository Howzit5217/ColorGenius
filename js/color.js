/* ColorGenius color science: conversions, color difference, descriptions,
   lighting simulation and screen calibration. No dependencies.
   Works in the browser (window.CG.color) and in Node (module.exports). */
(function (root) {
  'use strict';

  // ---------- basic conversions ----------
  function hexToRgb(hex) {
    hex = String(hex).replace('#', '');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  function rgbToHex(rgb) {
    return rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function toLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function fromLinear(v) { const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055; return s * 255; }
  function hexToLinear(hex) { return hexToRgb(hex).map(toLinear); }
  function linearToHex(lin) { return rgbToHex(lin.map(fromLinear)); }

  // linear sRGB -> XYZ (D65)
  function linToXyz([r, g, b]) {
    return [
      0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
      0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
      0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
    ];
  }
  function xyzToLin([x, y, z]) {
    return [
      3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
      -0.9692660 * x + 1.8760108 * y + 0.0415560 * z,
      0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    ];
  }
  const WHITE = [0.95047, 1.0, 1.08883];
  function xyzToLab([x, y, z]) {
    const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
    const fx = f(x / WHITE[0]), fy = f(y / WHITE[1]), fz = f(z / WHITE[2]);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function hexToLab(hex) { return xyzToLab(linToXyz(hexToLinear(hex))); }
  function labToLch([L, a, b]) {
    let h = Math.atan2(b, a) * 180 / Math.PI; if (h < 0) h += 360;
    return [L, Math.sqrt(a * a + b * b), h];
  }
  function lrvFromHex(hex) { return Math.round(linToXyz(hexToLinear(hex))[1] * 1000) / 10; }

  // OKLab, used for vividness adjustments because it keeps hue steady
  function linToOklab([r, g, b]) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function oklabToLin([L, a, b]) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }

  // ---------- CIEDE2000 color difference ----------
  function deltaE2000(l1, l2) {
    const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
    const rad = Math.PI / 180;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    const Cb = (C1 + C2) / 2, Cb7 = Math.pow(Cb, 7);
    const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + 6103515625)));
    const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h1p = (Math.atan2(b1, a1p) / rad + 360) % 360, h2p = (Math.atan2(b2, a2p) / rad + 360) % 360;
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * rad / 2);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360; hbp /= 2; }
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
    const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const Cbp7 = Math.pow(Cbp, 7);
    const Rc = 2 * Math.sqrt(Cbp7 / (Cbp7 + 6103515625));
    const Sl = 1 + 0.015 * Math.pow(Lbp - 50, 2) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin(2 * dTheta * rad) * Rc;
    return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
  }
  function matchLabel(dE) {
    if (dE < 1.2) return 'Near-identical';
    if (dE < 2.5) return 'Very close';
    if (dE < 4.5) return 'Close';
    if (dE < 7) return 'Similar';
    return 'Loose match';
  }

  // ---------- plain-language description ----------
  // Lab hue angles: red ~30, orange ~60, yellow ~95, green ~140, teal ~200, blue ~270, purple ~320
  function family(L, C, h) {
    // Whites: very light and close to neutral. Pale tints with real color (blue, mint, blush) are not whites.
    if ((L >= 92 && C < 10) || (L >= 89 && C < 7) || (L >= 86 && C < 4.5)) return 'white';
    if (L <= 24 && C < 16) return 'black';
    if (C < 4.5) return 'gray';
    // Low-color neutrals: warm hues (red through yellow) are beige/brown, cool hues are gray.
    // Cool tints with a little more color (pale blue, mint, lilac) fall through to their hue family.
    const warmHue = h < 120 || h >= 335;
    if (!warmHue && C < 6.5) return 'gray';
    if (warmHue && C < 15 && h >= 40 && h < 120) return L >= 55 ? 'beige' : 'brown';
    if (warmHue && C < 10) return L >= 55 ? 'beige' : 'brown';
    if (h >= 345 || h < 22) return L >= 70 || (C < 25 && L >= 58) ? 'pink' : 'red';
    if (h < 50) { if (L >= 72) return 'pink'; if (L < 50 && C < 45) return 'brown'; return h < 38 ? 'red' : 'orange'; }
    if (h < 75) { if (L < 52 && C < 50) return 'brown'; return 'orange'; }
    if (h < 105) { if (L < 58 && C < 50) return h < 90 ? 'brown' : 'green'; if (C < 22 && L >= 58) return 'beige'; return 'yellow'; }
    if (h < 185) return 'green';
    if (h < 290) return 'blue';
    return L >= 68 && h > 320 ? 'pink' : 'purple';
  }
  function undertone(C, h, L) {
    if (C < 2.5 || (L > 88 && C < 3.5)) return 'neutral';
    if (h >= 345 || h < 45) return 'pink';
    if (h < 70) return 'peach';
    if (h < 106) return 'yellow';
    if (h < 140) return 'green';
    if (h < 200) return 'green-blue';
    if (h < 250) return 'blue-green';
    if (h < 305) return 'blue';
    return 'violet';
  }
  function temperature(C, h) {
    if (C < 2.5) return 'neutral';
    if (h >= 345 || h < 112) return 'warm';
    if (h >= 150 && h < 310) return 'cool';
    return 'neutral';
  }
  function depthLabel(lrv) {
    if (lrv >= 82) return 'Very light';
    if (lrv >= 62) return 'Light';
    if (lrv >= 42) return 'Light-mid';
    if (lrv >= 25) return 'Mid-tone';
    if (lrv >= 12) return 'Deep';
    return 'Very deep';
  }
  const FAMILY_NAMES = { white: 'White', gray: 'Gray', beige: 'Beige / greige', brown: 'Brown / taupe', black: 'Black / charcoal', red: 'Red', pink: 'Pink', orange: 'Orange / terracotta', yellow: 'Yellow / ochre', green: 'Green', blue: 'Blue', purple: 'Purple' };
  function describe(hex, lrv) {
    const lab = hexToLab(hex); const [L, C, h] = labToLch(lab);
    if (lrv == null) lrv = lrvFromHex(hex);
    const fam = family(L, C, h);
    const ut = undertone(C, h, L);
    const temp = temperature(C, h);
    const neutral = ['white', 'gray', 'beige', 'brown', 'black'].includes(fam) || C < 12;
    let summary;
    if (neutral) summary = ut === 'neutral' ? 'True neutral, no strong undertone' : `${temp === 'warm' ? 'Warm' : temp === 'cool' ? 'Cool' : 'Balanced'} neutral with a ${ut} undertone`;
    else summary = `${C > 45 ? 'Saturated' : C > 22 ? 'Clear' : 'Muted'} ${FAMILY_NAMES[fam].toLowerCase()}, ${temp} side`;
    return { lab, L, C, h, lrv, family: fam, familyName: FAMILY_NAMES[fam], undertone: ut, temperature: temp, neutral, depth: depthLabel(lrv), summary };
  }

  // ---------- light simulation ----------
  // Correlated color temperature -> CIE xy (Kim et al. cubic spline of the Planckian locus)
  function cctToXy(T) {
    T = Math.max(1667, Math.min(25000, T));
    let x;
    if (T <= 4000) x = -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.179910;
    else x = -3.0258469e9 / T ** 3 + 2.1070379e6 / T ** 2 + 0.2226347e3 / T + 0.240390;
    let y;
    if (T <= 2222) y = -1.1063814 * x ** 3 - 1.34811020 * x ** 2 + 2.18555832 * x - 0.20219683;
    else if (T <= 4000) y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867;
    else y = 3.0817580 * x ** 3 - 5.87338670 * x ** 2 + 3.75112997 * x - 0.37001483;
    return [x, y];
  }
  // Per-channel gain that turns a D65 white into a white lit at temperature T
  function illuminantGain(T) {
    const [x, y] = cctToXy(T);
    const lin = xyzToLin([x / y, 1, (1 - x - y) / y]);
    const ref = xyzToLin(cctToXy(6504).reduce((acc, v, i, a) => (i === 1 ? [a[0] / a[1], 1, (1 - a[0] - a[1]) / a[1]] : acc), null));
    const g = lin.map((v, i) => v / ref[i]);
    const m = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
    return g.map(v => v / m);
  }
  // Eyes adapt to most of a light's tint; `adapt` is how much tint is left over (0 = none, 1 = full camera-like tint)
  function applyLight(lin, light) {
    if (!light) return lin;
    const gain = illuminantGain(light.cct || 6504);
    const left = light.adapt == null ? 0.3 : light.adapt;
    const k = light.intensity == null ? 1 : light.intensity;
    return lin.map((v, i) => v * (1 + left * (gain[i] - 1)) * k);
  }

  // ---------- screen calibration ----------
  // cal = { warmth: -100..100, brightness: -50..50, vividness: -50..50, enabled: bool }
  function applyCalibration(lin, cal) {
    if (!cal || !cal.enabled) return lin;
    let out = lin;
    if (cal.warmth) {
      // Positive warmth: the screen looks too blue, so warm the swatches (lower temperature); negative: the reverse
      const T = cal.warmth > 0 ? 6504 - cal.warmth * 22 : 6504 - cal.warmth * 60;
      const g = illuminantGain(T);
      out = out.map((v, i) => v * (1 + 0.6 * (g[i] - 1)));
    }
    if (cal.vividness) {
      const ok = linToOklab(out); const s = 1 + cal.vividness / 100;
      out = oklabToLin([ok[0], ok[1] * s, ok[2] * s]);
    }
    if (cal.brightness) {
      const k = Math.pow(2, cal.brightness / 50); // -50 -> half, +50 -> double (in linear light)
      out = out.map(v => v * k);
    }
    return out;
  }

  // ---------- output for CSS ----------
  function linToP3(lin) {
    const xyz = linToXyz(lin);
    const [x, y, z] = xyz;
    return [2.4934969 * x - 0.9313836 * y - 0.4027108 * z,
      -0.8294890 * x + 1.7626641 * y + 0.0236247 * z,
      0.0358458 * x - 0.0761724 * y + 0.9568845 * z];
  }
  const inGamut = (v, eps = 0.0005) => v.every(c => c >= -eps && c <= 1 + eps);
  // Soft-clip any channel above 1 by scaling down, which keeps hue
  function fitGamut(lin) {
    let out = lin.map(v => Math.max(0, v));
    const mx = Math.max(...out);
    if (mx > 1) out = out.map(v => v / mx);
    return out;
  }
  // Returns a CSS color for a brand hex after light + calibration. Uses display-p3 only when the screen supports it
  // and the adjusted color falls outside the standard range.
  function displayCss(hex, opts) {
    opts = opts || {};
    if (!opts.light && !(opts.cal && opts.cal.enabled)) return '#' + hex;
    let lin = hexToLinear(hex);
    lin = applyLight(lin, opts.light);
    lin = applyCalibration(lin, opts.cal);
    if (inGamut(lin)) return '#' + linearToHex(lin);
    if (opts.p3) {
      const p3 = linToP3(lin);
      if (inGamut(p3)) return `color(display-p3 ${p3.map(v => (fromLinear(v) / 255).toFixed(4)).join(' ')})`;
    }
    return '#' + linearToHex(fitGamut(lin));
  }
  // Best text color (dark or light) to sit on top of a swatch
  function inkOn(hex) { return lrvFromHex(hex) > 36 ? 'dark' : 'light'; }

  const api = {
    hexToRgb, rgbToHex, toLinear, fromLinear, hexToLinear, linearToHex, linToXyz, xyzToLin, xyzToLab, hexToLab, labToLch,
    lrvFromHex, linToOklab, oklabToLin, deltaE2000, matchLabel, family, undertone, temperature, depthLabel, describe, FAMILY_NAMES,
    cctToXy, illuminantGain, applyLight, applyCalibration, linToP3, displayCss, inkOn,
  };
  root.CG = root.CG || {};
  root.CG.color = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
