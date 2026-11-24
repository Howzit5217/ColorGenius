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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let refl;
    if (wall) refl = x >= sheet.x0 && x < sheet.x1 && y >= sheet.y0 && y < sheet.y1 ? paperRef : chip;
    else refl = Math.abs(x - cx) < cs / 2 && Math.abs(y - cy) < cs / 2 ? chip : paperRef;
    const fiber = 1 + (r() - 0.5) * 0.02;
    let e = E(x, y);
    const i = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) {
      let v = refl[c] * fiber * light[c] * awb[c] * e * k;
      if (o.glare && Math.hypot(x - cx, y - cy) < o.glare) v += 0.9;
      const g = curve(Math.max(0, v)) * 255 + gauss(r) * (o.noise == null ? 1.2 : o.noise);
      data[i + c] = Math.max(0, Math.min(255, Math.round(g)));
    }
    data[i + 3] = 255;
  }
  const bs = o.box || 56;
  const layout = wall ? { mode: 'wall', color: { x0: W / 2 + 40, y0: cy - bs / 2, x1: W / 2 + 40 + bs, y1: cy + bs / 2 }, paper: { x0: sheet.x0 + 12, y0: sheet.y0 + 12, x1: sheet.x1 - 12, y1: sheet.y1 - 12 } }
    : { mode: 'paper', color: { x0: cx - bs / 2, y0: cy - bs / 2, x1: cx + bs / 2, y1: cy + bs / 2 } };
  return { frame: { data, width: W, height: H }, layout };
}

