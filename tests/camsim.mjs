// A made-up phone camera for the color match tests: a chip of known color on white paper (or beside a sheet, on
// a wall), lit and photographed the ways a phone does it. Not a test itself (its name has no .test).
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const M = require(path.join(ROOT, 'js/cammatch.js'));
const sEnc = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const CURVES = {
  srgb: v => sEnc(v),
  // a contrasty phone: an S around the middle after the usual curve
  scurve: v => { const x = sEnc(v), p = 1.3; return Math.pow(x, p) / (Math.pow(x, p) + Math.pow(1 - x, p)); },
  // highlights eased off before the top, as many phones do
  shoulder: v => sEnc(v < 0.7 ? v : 0.7 + 0.3 * Math.tanh((v - 0.7) / 0.3)),
  // a video-style curve (BT.709) read as if it were the usual one: dark colors come out darker
  rec709: v => (v < 0.018 ? 4.5 * v : 1.099 * Math.pow(v, 0.45) - 0.099),
  // middle tones lifted, as phones do to brighten a picture: colors come out lighter than they are
  lift: v => Math.pow(sEnc(v), 0.88),
};
// How a camera mixes its red, green and blue (the sensor isn't the eye, and phones add punch). White stays white
// (each row adds up to 1). vivid: more color all round. twist: uneven by hue, worst for in-between colors like
// teal and red-orange, as real sensors are.
const MIXES = {
  vivid: (() => { const Y = [0.2126, 0.7152, 0.0722], s = 1.25; return [0, 1, 2].map(i => Y.map((y, j) => (1 - s) * y + (i === j ? s : 0))); })(),
  twist: [[1.1, -0.04, -0.06], [-0.1, 1.18, -0.08], [0.03, -0.15, 1.12]],
};
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

// a picture: W×H, the chip a square in the middle (or a wall of the chip color with a sheet of paper to the left)
export function shoot(o) {
  const W = o.W || 320, H = o.H || 240, r = rng(o.seed || 7);
  const chip = M.linOf(o.hex), paperRef = o.paper || [0.86, 0.86, 0.86];
  const cs = o.chip || 84, cx = W / 2 + (o.dx || 0), cy = H / 2;
  const light = o.light || [1, 1, 1];
  const torch = o.torch || null;   // { x, y, r0, share }
  const E = (x, y) => {
    let e = 1 + (o.gx || 0) * (x - W / 2) / W + (o.gy || 0) * (y - H / 2) / H;
    if (torch) { const d = Math.hypot(x - torch.x, y - torch.y) / torch.r0; e *= (1 - torch.share) + torch.share * 2 / Math.pow(1 + d * d, 1.5); }
    if (o.shadow && x < W / 2 - cs * 0.9) e *= o.shadow;
    // the phone's own shadow: darker past a line (at sx from the middle, angled by sa), with a soft edge sw wide
    if (o.phoneShadow) { const p = o.phoneShadow, d = ((x - W / 2) * Math.cos(p.sa || 0) + (y - H / 2) * Math.sin(p.sa || 0)) - p.sx; e *= 1 - (1 - p.k) / (1 + Math.exp(-d / (p.sw || 4))); }
    return e;
  };
  // the camera's white balance gets most (not all) of the way to neutral; its exposure puts the paper at the
  // chip's spot at o.expose (a share of the top)
  const awb = light.map(v => 0.25 + 0.75 / v);
  const k = (o.expose || 0.55) / (E(cx, cy) * 0.86);
  const curve = CURVES[o.curve || 'srgb'];
  const data = new Uint8ClampedArray(W * H * 4);
  const wall = o.mode === 'wall';
  const sheet = wall ? { x0: 24, y0: H / 2 - 60, x1: 24 + 110, y1: H / 2 + 60 } : null;
  // the light reaching the sensor, before the camera's curve
  const rad = new Float64Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let refl;
    if (wall) refl = x >= sheet.x0 && x < sheet.x1 && y >= sheet.y0 && y < sheet.y1 ? paperRef : chip;
    else refl = Math.abs(x - cx) < cs / 2 && Math.abs(y - cy) < cs / 2 ? chip : paperRef;
    const fiber = 1 + (r() - 0.5) * 0.02;
    const e = E(x, y);
    for (let c = 0; c < 3; c++) {
      let v = refl[c] * fiber * light[c] * awb[c] * e * k;
      if (o.glare && Math.hypot(x - cx, y - cy) < o.glare) v += 0.9;
      rad[(y * W + x) * 3 + c] = v;
    }
  }
  // lens flare: a share of the picture's light spread over everything, half evenly and half from close by (so a
  // dark chip in white paper gets lighter, most at its edges)
  if (o.flare) {
    const R = 24, flare = new Float64Array(W * H * 3);
    for (let c = 0; c < 3; c++) {
      let mean = 0; for (let p = 0; p < W * H; p++) mean += rad[p * 3 + c]; mean /= W * H;
      const I = new Float64Array((W + 1) * (H + 1));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) I[(y + 1) * (W + 1) + x + 1] = rad[(y * W + x) * 3 + c] + I[y * (W + 1) + x + 1] + I[(y + 1) * (W + 1) + x] - I[y * (W + 1) + x];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const xa = Math.max(0, x - R), xb = Math.min(W, x + R + 1), ya = Math.max(0, y - R), yb = Math.min(H, y + R + 1);
        const local = (I[yb * (W + 1) + xb] - I[ya * (W + 1) + xb] - I[yb * (W + 1) + xa] + I[ya * (W + 1) + xa]) / ((xb - xa) * (yb - ya));
        flare[(y * W + x) * 3 + c] = o.flare * (0.5 * mean + 0.5 * local);
      }
    }
    for (let p = 0; p < rad.length; p++) rad[p] = rad[p] * (1 - o.flare) + flare[p];
  }
  const mix = o.mix ? (typeof o.mix === 'string' ? MIXES[o.mix] : o.mix) : null;
  if (mix) for (let p = 0; p < W * H; p++) { const v = [rad[p * 3], rad[p * 3 + 1], rad[p * 3 + 2]]; for (let c = 0; c < 3; c++) rad[p * 3 + c] = mix[c][0] * v[0] + mix[c][1] * v[1] + mix[c][2] * v[2]; }
  for (let p = 0; p < W * H; p++) {
    for (let c = 0; c < 3; c++) {
      const g = curve(Math.max(0, rad[p * 3 + c])) * 255 + (o.black || 0) + gauss(r) * (o.noise == null ? 1.2 : o.noise);
      data[p * 4 + c] = Math.max(0, Math.min(255, Math.round(g)));
    }
    data[p * 4 + 3] = 255;
  }
  const bs = o.box || 56;
  const layout = wall ? { mode: 'wall', color: { x0: W / 2 + 40, y0: cy - bs / 2, x1: W / 2 + 40 + bs, y1: cy + bs / 2 }, paper: { x0: sheet.x0 + 12, y0: sheet.y0 + 12, x1: sheet.x1 - 12, y1: sheet.y1 - 12 } }
    : { mode: 'paper', color: { x0: cx - bs / 2, y0: cy - bs / 2, x1: cx + bs / 2, y1: cy + bs / 2 } };
  return { frame: { data, width: W, height: H }, layout };
}

