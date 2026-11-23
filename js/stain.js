/* ColorGenius stain: the staining questions, stain picks, warnings and product advice.
   Stain colors come from data/stains.js (Minwax). Exterior solid stains are tinted to paint colors, so those
   picks come from the paint colors in CG.engine. Each stain is judged by how it will look on the chosen wood
   (CG.wood.predictHex), not by its swatch alone.
   Depends on CG.color and CG.wood (and CG.engine for exterior solid stains). Works in the browser
   (window.CG.stain) and in Node (module.exports). */
(function (root) {
  'use strict';
  const req = p => (typeof require === 'function' ? require(p) : null);
  const C = (root.CG && root.CG.color) || req('./color.js');
  const W = (root.CG && root.CG.wood) || req('./wood.js');
  const E = () => root.CG && root.CG.engine;

  // ---------------- what's being stained ----------------
  const JOBS = {
    floors: { label: 'Floors', kind: 'interior', wood: 'red_oak', sub: 'Hardwood floors and stair treads', scene: 'floor', traffic: true },
    stairs: { label: 'Stairs & railings', kind: 'interior', wood: 'red_oak', sub: 'Treads, handrails, newels', scene: 'floor', traffic: true },
    cabinets: { label: 'Cabinets', kind: 'interior', wood: 'maple', sub: 'Kitchen or bath', scene: 'cabinets' },
    furniture: { label: 'Furniture', kind: 'interior', wood: 'pine', sub: 'Tables, dressers, chairs', scene: 'furniture' },
    tabletop: { label: 'Tabletop or butcher block', kind: 'interior', wood: 'maple', sub: 'Counters, desks, tables', scene: 'furniture', food: true },
    trim: { label: 'Trim & doors', kind: 'interior', wood: 'pine', sub: 'Baseboards, casing, interior doors', scene: 'trim' },
    deck: { label: 'Deck', kind: 'exterior', wood: 'pt_pine', sub: 'Boards, steps, railings', scene: 'deck', traffic: true, horizontal: true },
    fence: { label: 'Fence', kind: 'exterior', wood: 'pt_pine', sub: 'Pickets and panels', scene: 'fence' },
    siding: { label: 'Siding & shakes', kind: 'exterior', wood: 'cedar', sub: 'Cedar siding, shingles, board & batten', scene: 'siding' },
    outdoor: { label: 'Outdoor furniture', kind: 'exterior', wood: 'cedar', sub: 'Chairs, benches, planters', scene: 'deck' },
    pergola: { label: 'Pergola or porch', kind: 'exterior', wood: 'cedar', sub: 'Posts, beams, ceilings', scene: 'deck' },
    front_door: { label: 'Front door', kind: 'exterior', wood: 'fir', sub: 'Wood entry doors', scene: 'door' },
  };
  // ---------------- the look ----------------
  // Targets are on the predicted color (on the chosen wood), in CIE LCh. L = lightness, C = colorfulness, h = hue.
  const LOOKS = {
    natural: { label: 'Natural', sub: 'The wood’s own color, slightly richer', near: true },
    light: { label: 'Light & airy', sub: 'Pale, soft, Scandinavian', L: [62, 86], C: [3, 18] },
    golden: { label: 'Golden honey', sub: 'Warm, glowing, classic oak', L: [48, 66], C: [24, 46], h: [62, 82] },
    warm: { label: 'Warm medium brown', sub: 'Early American, Provincial', L: [40, 54], C: [16, 34], h: [56, 76] },
    rich: { label: 'Rich brown', sub: 'Walnut, chestnut', L: [30, 42], C: [12, 30], h: [52, 78] },
    dark: { label: 'Dark espresso', sub: 'Jacobean, ebony, near black', L: [12, 31], C: [0, 22] },
    red: { label: 'Reddish', sub: 'Cherry, mahogany', L: [24, 52], C: [20, 46], h: [28, 56] },
    gray: { label: 'Gray & weathered', sub: 'Driftwood, barnwood', L: [34, 72], C: [0, 10] },
    white: { label: 'Whitewash', sub: 'Pickled, limed, white-washed', L: [74, 94], C: [0, 14], white: true },
    color: { label: 'A color', sub: 'Blue, green, red and more', color: true },
  };
  const GRAIN = { show: 'Show the grain', hide: 'Hide the grain (solid)' };
  const CONDITION = { bare: 'Bare or sanded', finished: 'Has a finish on it', new_pt: 'New pressure-treated' };
  const DEFAULT = { job: 'stain', target: 'floors', wood: '', condition: 'bare', looks: [], grain: 'show' };

  // ---------------- stain index ----------------
  // colored stains are told apart by hue, and by name for the pale ones (a pale blue reads as gray-white by hue alone)
  const COLOR_WORDS = /blue|navy|green|jade|mint|teal|aqua|turquoise|indigo|purple|violet|lavender|plum|berry|pink|rose|yellow|chartreuse|lime|orange|tangerine|coral|denim|ocean|sea|sky|lagoon|hawaii|marine/i;
  const WOOD_WORDS = /mahogany|cherry|oak|walnut|pine|maple|cedar|redwood|chestnut|wood/i;
  let STAINS = [], BRANDS = {};
  function init(data) {
    data = data || root.CG_STAINS || { brands: [], rows: {} };
    BRANDS = Object.fromEntries((data.brands || []).map(b => [b.id, b]));
    STAINS = [];
    for (const [brand, rows] of Object.entries(data.rows || {})) {
      for (const [code, name, hex, type, light, dark, n, solidHex] of rows) {
        const lab = C.hexToLab(hex), lch = C.labToLch(lab);
        const woodish = (lch[2] > 18 && lch[2] < 95) || lch[1] < 10;
        const colorName = COLOR_WORDS.test(name) && !WOOD_WORDS.test(name);
        STAINS.push({ id: `${brand}:${code}`, brand, code: String(code), name, hex, type, light, dark, n, solidHex: solidHex || '', lab, L: lch[0], C: lch[1], h: lch[2], colored: colorName || !woodish || (lch[1] > 22 && (lch[2] < 18 || lch[2] > 95)), stain: true, lrv: C.lrvFromHex(hex), flags: 0 });
      }
    }
    return STAINS.length;
  }
  const all = () => STAINS;
  const find = id => STAINS.find(s => s.id === id) || null;
  const brandName = id => (BRANDS[id] || {}).name || id;
  const woodFor = a => (W.SPECIES[a.wood] ? a.wood : (JOBS[a.target] || JOBS.floors).wood);

  function lchOf(hex) { const l = C.labToLch(C.hexToLab(hex)); return { L: l[0], C: l[1], h: l[2] }; }
  const hueDist = (h, lo, hi) => (h >= lo && h <= hi ? 0 : Math.min(Math.abs(h - lo), Math.abs(h - hi), 360 - Math.abs(h - lo), 360 - Math.abs(h - hi)));
  const rangeDist = (v, r) => (v < r[0] ? r[0] - v : v > r[1] ? v - r[1] : 0);
  function lookScore(look, p, bare, s) {
    const L = LOOKS[look]; if (!L) return 0;
    if (L.near) { // natural: close to the bare wood, a touch deeper and warmer
      const d = C.deltaE2000(C.hexToLab(p.hex), C.hexToLab(bare.hex));
      return Math.max(0, 1 - Math.abs(d - 6) / 12) * (s && /natural|clear|honey|golden oak/i.test(s.name) ? 1.15 : 1);
    }
    if (L.color) return s && s.colored ? 0.7 + Math.min(0.3, p.C / 100) : 0;
    let d = 0;
    if (L.L) d += rangeDist(p.L, L.L) / 8;
    if (L.C) d += rangeDist(p.C, L.C) / 7;
    if (L.h && p.C > 6) d += hueDist(p.h, L.h[0], L.h[1]) / 10;
    if (L.white && s && s.type === 'white') d -= 0.4;
    if (L.white && s && s.type !== 'white' && p.L < 80) d += 0.6;
    if (!L.color && s && s.colored) d += 2;
    return Math.max(0, 1 - d * 0.5);
  }

  // ---------------- recommend ----------------
  // settings: { resultCount, brands (paint brands on, for exterior solid stains), collections }
  function recommend(answers, settings) {
    const a = Object.assign({}, DEFAULT, answers || {});
    const s = Object.assign({ resultCount: 6 }, settings || {});
    const job = JOBS[a.target] || JOBS.floors;
    const sp = woodFor(a);
    const bare = Object.assign({ hex: W.bareHex(sp) }, lchOf(W.bareHex(sp)));
    const looks = a.looks.length ? a.looks : defaultLooks(a, sp);
    const ext = job.kind === 'exterior';
    const solid = a.grain === 'hide';
    let pool = [];
    if (ext && solid && E()) {
      // exterior solid stain: tinted to paint colors, so the picks are exterior paint colors in stain-like tones
      const en = s.brands || {};
      pool = E().getIndex().colors.filter(c => en[c.brand] !== false && !(c.flags & E().F.DISC) && (!(c.flags & (E().F.INT | E().F.EXT)) || (c.flags & E().F.EXT)) && E().collectionOn(c, s.collections) && c.L < 78)
        .map(c => ({ src: c, kind: 'paint', id: c.id, name: c.name, brand: c.brand, code: c.code, hex: c.hex, solidHex: c.hex }));
    } else {
      pool = STAINS.filter(x => !(a.condition === 'finished' && x.type === 'white')).map(x => ({ src: x, kind: 'stain', id: x.id, name: x.name, brand: x.brand, code: x.code, hex: x.hex, solidHex: x.solidHex, type: x.type }));
    }
    const scored = [];
    for (const x of pool) {
      const st = { hex: x.hex, type: x.type, solid: solid || x.kind === 'paint', solidHex: x.solidHex };
      const hex = x.kind === 'paint' ? W.quickHex(sp, st) : W.predictHex(sp, st);
      const p = Object.assign({ hex }, lchOf(hex));
      let score = 0;
      for (const lk of looks) score = Math.max(score, lookScore(lk, p, bare, x.kind === 'stain' ? x.src : null));
      if (score <= 0.05) continue;
      // finished wood can only go darker without stripping
      if (a.condition === 'finished' && p.L > bare.L - 4 && !solid) score *= 0.35;
      if (x.kind === 'stain' && x.src.n >= 3) score += 0.03; // published in several products: a core color
      if (x.kind === 'paint' && (x.src.flags & E().F.POPULAR)) score += 0.04;
      scored.push({ x, p, score, look: bestLook(looks, p, bare, x) });
    }
    scored.sort((m, n) => n.score - m.score);
    // spread the picks out: no two that look the same on this wood, and each look gets its share
    const out = [];
    const n = s.resultCount || 6;
    const perLook = Math.max(1, Math.ceil(n / looks.length));
    const count = {};
    for (const r of scored) {
      if (out.length >= n) break;
      if ((count[r.look] || 0) >= perLook && looks.length > 1) continue;
      if (out.some(o => C.deltaE2000(o.lab, C.hexToLab(r.p.hex)) < 5)) continue;
      if (out.some(o => o.item.name === r.x.name)) continue;
      count[r.look] = (count[r.look] || 0) + 1;
      out.push({ item: r.x, lab: C.hexToLab(r.p.hex), predicted: r.p.hex, look: r.look, score: r.score });
    }
    for (const r of scored) { if (out.length >= n) break; if (!out.some(o => o.item.id === r.x.id) && !out.some(o => C.deltaE2000(o.lab, C.hexToLab(r.p.hex)) < 3)) out.push({ item: r.x, lab: C.hexToLab(r.p.hex), predicted: r.p.hex, look: r.look, score: r.score }); }
    const results = out.map((o, i) => ({
      id: o.item.id, kind: o.item.kind, item: o.item.src, name: o.item.name, brand: o.item.brand, code: o.item.code, hex: o.item.hex, solidHex: o.item.solidHex,
      predicted: o.predicted, look: o.look, role: i === 0 ? 'Top pick' : LOOKS[o.look].label,
      warnings: warningsFor(o.item, a, o.predicted),
      solid: solid || o.item.kind === 'paint',
    }));
    return { kind: 'stain', answers: a, wood: sp, bare: bare.hex, looks, results, tips: tipsFor(a), products: productsFor(a, s), poolSize: pool.length, guide: ext && !solid };
  }
  function bestLook(looks, p, bare, x) {
    let best = looks[0], bs = -1;
    for (const lk of looks) { const sc = lookScore(lk, p, bare, x.kind === 'stain' ? x.src : null); if (sc > bs) { bs = sc; best = lk; } }
    return best;
  }
  function defaultLooks(a, sp) {
    const j = JOBS[a.target] || JOBS.floors;
    if (j.kind === 'exterior') return a.grain === 'hide' ? ['rich', 'gray', 'dark'] : ['natural', 'golden', 'rich'];
    if (sp === 'walnut') return ['natural', 'dark'];
    return ['natural', 'warm', 'rich'];
  }

  // ---------------- warnings ----------------
  const BLOTCHY = ['pine', 'maple', 'birch', 'cherry', 'poplar', 'fir'];
  function warningsFor(item, a, predicted) {
    const out = [];
    const add = (level, title, text) => out.push({ level, title, text });
    const job = JOBS[a.target] || JOBS.floors;
    const sp = woodFor(a), S = W.SPECIES[sp];
    const p = lchOf(predicted || item.hex), bare = lchOf(W.bareHex(sp));
    const solid = a.grain === 'hide' || item.kind === 'paint';
    if (!solid && BLOTCHY.includes(sp)) add('caution', `Can look blotchy on ${S.label.toLowerCase()}`, 'Brush on a pre-stain wood conditioner first, or use a gel stain. Both even out how the wood soaks up color.');
    if (!solid && ['maple', 'birch'].includes(sp) && p.L < 36) add('caution', `Dark stains go uneven on ${S.label.toLowerCase()}`, 'Dense woods resist dark stain. A gel stain, two thin coats, or a tinted topcoat gets darker and more even.');
    if (sp === 'red_oak' && p.C < 10 && p.L > 30) add('heads-up', 'Grays can turn muddy on red oak', 'Red oak’s pink undertone shows through gray stains. White oak takes gray cleaner; on red oak, test a board first.');
    if (sp === 'cherry') add('tip', 'Cherry darkens with age', 'Cherry deepens noticeably in sunlight over the first months. Pick a stain a step lighter than the look you want.');
    if (sp === 'walnut' && p.L > bare.L - 3 && !solid) add('heads-up', 'Stain won’t lighten walnut', 'Walnut is already dark. A clear finish or oil shows it best; lighter stains barely change it.');
    if (a.condition === 'finished' && !solid) {
      if (p.L > bare.L - 4) add('caution', 'You can only go darker', 'Stain can’t lighten wood that already has a finish. To go lighter, strip or sand back to bare wood first.');
      add('heads-up', 'Penetrating stain needs bare wood', 'Over an existing finish, use a gel stain or a stain-and-poly in one after scuff-sanding, or strip to bare wood.');
    }
    if (a.condition === 'new_pt' || (sp === 'pt_pine' && a.condition !== 'finished')) add('caution', 'Let new pressure-treated wood dry', 'Fresh treated lumber is wet. Wait until water sprinkled on it soaks in instead of beading, often a few weeks to a few months.');
    if (['cedar', 'redwood'].includes(sp) && solid) add('heads-up', 'Tannins can bleed through', 'Cedar and redwood can bleed tan streaks through light solid stains. Use an oil-based or stain-blocking primer under light colors.');
    if (job.horizontal && solid) add('heads-up', 'Solid stain can peel on walking surfaces', 'On deck boards a solid stain acts like paint and can peel where feet and water wear it. Semi-transparent or semi-solid lasts better there.');
    if (job.kind === 'exterior' && !solid) add('tip', 'Recoat every 2–3 years', 'Semi-transparent stains wear away instead of peeling. Plan to clean and recoat sunny decks and fences every couple of years.');
    if (job.kind === 'exterior' && p.L < 30 && job.horizontal) add('heads-up', 'Dark decks get hot', 'Dark stains on decks soak up sun and can get uncomfortable to walk on barefoot.');
    if (job.traffic && p.L < 28 && job.kind === 'interior') add('heads-up', 'Dark floors show dust and scratches', 'Very dark floors show pet hair, dust and light scratches more than mid-tones.');
    if (job.traffic && p.L > 70 && job.kind === 'interior') add('tip', 'Light floors hide wear', 'Pale floors hide dust and scratches well but show dark dirt near entries.');
    if (item.type === 'white' && ['pine', 'fir'].includes(sp)) add('tip', 'Whitewash on pine can look pink or yellow', 'Pine’s yellow and knots can show through white stains. A coat of white-pigmented sealer or a second coat helps.');
    if (job.food) add('tip', 'Food-safe finish for prep surfaces', 'For a counter or board that touches food, skip stain on the cutting area and use a food-safe oil.');
    if (item.colored && !solid) add('tip', 'Colored stains show the wood under them', 'A blue or green stain over yellow wood shifts toward green. Test on the same wood first.');
    if (item.kind === 'paint') add('tip', 'Tinted as a solid stain', 'Ask for this color in a solid exterior stain; most stores tint solid stain to their paint colors.');
    return out;
  }
  function tipsFor(a) {
    const job = JOBS[a.target] || JOBS.floors; const tips = [];
    tips.push({ title: 'Test it first', text: 'Stain color depends on the wood, the sanding grit and how long it sits before wiping. Try it on a scrap or a hidden spot of the same wood.' });
    if (a.condition !== 'finished') tips.push({ title: 'Sanding', text: job.kind === 'interior' ? 'Sand to 120–150 grit for floors and 150–180 for furniture and cabinets. Finer sanding makes stain lighter.' : 'Clean and brighten old decks and fences first. Lightly sand rough or gray wood so stain can soak in.' });
    tips.push({ title: 'Topcoat', text: job.kind === 'interior' ? (job.traffic ? 'Floors need 2–3 coats of floor polyurethane over the stain. Oil-based poly ambers over time; water-based stays clearer.' : 'Protect stained wood with polyurethane or a water-based clear coat. Water-based stays clear over light and gray stains.') : 'Exterior stains seal themselves; don’t put a clear coat over them.' });
    if (job.kind === 'exterior') tips.push({ title: 'Weather', text: 'Stain when it will stay dry for 24–48 hours, out of hot midday sun, above 50 °F.' });
    return tips;
  }

  // ---------------- products ----------------
  // Product types every store will know, with the brand's own names where the brand is in ColorGenius.
  const EXT_LINES = {
    sw: { semi: 'SuperDeck Semi-Transparent or Woodscapes Semi-Transparent', solid: 'SuperDeck Solid Color or Woodscapes Solid Color' },
    bm: { semi: 'Arborcoat Semi-Transparent', solid: 'Arborcoat Solid' },
    behr: { semi: 'Behr Premium Semi-Transparent Waterproofing Stain & Sealer', solid: 'Behr Premium Solid Color Waterproofing Stain & Sealer' },
    ppg: { semi: 'Olympic Elite or Olympic Maximum Semi-Transparent', solid: 'Olympic Elite or Olympic Maximum Solid' },
  };
  function productsFor(a, s) {
    const job = JOBS[a.target] || JOBS.floors; const sp = woodFor(a);
    const solid = a.grain === 'hide';
    const out = [];
    if (job.kind === 'interior') {
      if (a.condition === 'finished') out.push({ name: 'Minwax Gel Stain', why: 'Sits on top of a scuffed finish and goes on evenly, so you don’t have to strip first.' });
      else if (solid) out.push({ name: 'Minwax Water Based Solid Color Stain', why: 'Covers the wood’s color while letting some texture show.' });
      else {
        out.push({ name: 'Minwax Wood Finish', why: 'Oil-based penetrating stain: the classic choice, with the longest working time.' });
        out.push({ name: 'Minwax Water Based Wood Stain', why: 'Dries fast with little odor; good for cabinets and trim.' });
      }
      if (!solid && BLOTCHY.includes(sp) && a.condition !== 'finished') out.push({ name: 'Minwax Pre-Stain Wood Conditioner', why: `Evens out how ${W.SPECIES[sp].label.toLowerCase()} soaks up stain. Use the water-based one under water-based stain.` });
      if (['maple', 'birch'].includes(sp) && a.condition !== 'finished') out.push({ name: 'Minwax Gel Stain', why: 'Easier to get a dark, even color on dense woods.' });
      out.push(job.traffic ? { name: 'Floor polyurethane (oil or water based)', why: 'Two to three coats over the stain for wear.' } : { name: 'Minwax Polycrylic or Fast-Drying Polyurethane', why: 'Polycrylic stays clear over light colors; polyurethane is tougher and warmer.' });
    } else {
      const en = (s && s.brands) || {};
      const store = s && s.storeBrand && EXT_LINES[s.storeBrand] ? [s.storeBrand] : [];
      const ids = store.concat(Object.keys(EXT_LINES).filter(id => en[id] !== false && !store.includes(id))).slice(0, 3);
      for (const id of ids) out.push({ name: EXT_LINES[id][solid ? 'solid' : 'semi'], brand: id, why: solid ? 'Solid exterior stain, tinted to the color.' : 'Semi-transparent exterior stain: shows the grain and wears without peeling.' });
      if (!ids.length) out.push({ name: solid ? 'Solid exterior stain' : 'Semi-transparent exterior stain', why: 'Any exterior wood stain in this opacity.' });
      out.push({ name: 'Deck & siding cleaner or brightener', why: 'Clean, brightened wood takes stain far more evenly.' });
    }
    return out;
  }

  // the same stain on other woods, for the detail sheet
  function onOtherWoods(item, a, list) {
    const st = { hex: item.hex, type: item.type, solid: a.grain === 'hide' || item.kind === 'paint', solidHex: item.solidHex };
    return (list || ['red_oak', 'white_oak', 'pine', 'maple', 'cherry', 'cedar']).map(sp => ({ sp, label: W.SPECIES[sp].label, hex: W.predictHex(sp, st), bare: W.bareHex(sp) }));
  }

  const api = { JOBS, LOOKS, GRAIN, CONDITION, DEFAULT, init, all, find, brandName, woodFor, recommend, warningsFor, tipsFor, productsFor, onOtherWoods, lookScore };
  root.CG = root.CG || {};
  root.CG.stain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
