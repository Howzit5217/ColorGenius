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
    stairs: { label: 'Stairs & Railings', kind: 'interior', wood: 'red_oak', sub: 'Treads, handrails, newels', scene: 'floor', traffic: true },
    cabinets: { label: 'Cabinets', kind: 'interior', wood: 'maple', sub: 'Kitchen or bath', scene: 'cabinets' },
    furniture: { label: 'Furniture', kind: 'interior', wood: 'pine', sub: 'Tables, dressers, chairs', scene: 'furniture' },
    tabletop: { label: 'Tabletop or Butcher Block', kind: 'interior', wood: 'maple', sub: 'Counters, desks, tables', scene: 'furniture', food: true },
    trim: { label: 'Trim & Doors', kind: 'interior', wood: 'pine', sub: 'Baseboards, casing, interior doors', scene: 'trim' },
    doors: { label: 'Interior Doors', kind: 'interior', wood: 'pine', sub: 'Panel and slab doors', scene: 'trim', use: 'trim' },
    paneling: { label: 'Paneling & Wood Ceilings', kind: 'interior', wood: 'pine', sub: 'Tongue and groove, beadboard, planks', scene: 'paneling', use: 'trim' },
    builtins: { label: 'Shelves & Built-Ins', kind: 'interior', wood: 'birch', sub: 'Bookcases, shelves, window seats', scene: 'builtins', use: 'cabinets' },
    deck: { label: 'Deck', kind: 'exterior', wood: 'pt_pine', sub: 'Boards, steps, railings', scene: 'deck', traffic: true, horizontal: true },
    fence: { label: 'Fence', kind: 'exterior', wood: 'pt_pine', sub: 'Pickets and panels', scene: 'fence' },
    siding: { label: 'Siding & Shakes', kind: 'exterior', wood: 'cedar', sub: 'Cedar siding, shingles, board & batten', scene: 'siding' },
    outdoor: { label: 'Outdoor Furniture', kind: 'exterior', wood: 'cedar', sub: 'Chairs, benches, planters', scene: 'deck' },
    pergola: { label: 'Pergola or Porch', kind: 'exterior', wood: 'cedar', sub: 'Posts, beams, ceilings', scene: 'deck' },
    front_door: { label: 'Front Door', kind: 'exterior', wood: 'fir', sub: 'Wood entry doors', scene: 'door', use: 'door' },
    garage_door: { label: 'Wood Garage Door', kind: 'exterior', wood: 'cedar', sub: 'Carriage-style and plank doors', scene: 'garage', use: 'door' },
    shutters: { label: 'Shutters', kind: 'exterior', wood: 'cedar', sub: 'Wood window shutters', scene: 'shutters', use: 'siding' },
    shed: { label: 'Shed or Barn', kind: 'exterior', wood: 'cedar', sub: 'Siding, doors and trim', scene: 'siding', use: 'siding' },
    log: { label: 'Log Home', kind: 'exterior', wood: 'pine', sub: 'Log walls and timbers', scene: 'siding', use: 'log' },
    playset: { label: 'Playset or Swing Set', kind: 'exterior', wood: 'cedar', sub: 'Posts, beams and ladders', scene: 'deck', use: 'outdoor' },
    dock: { label: 'Dock', kind: 'exterior', wood: 'pt_pine', sub: 'Boards and posts over water', scene: 'deck', use: 'deck', traffic: true, horizontal: true },
  };
  // ---------------- the look ----------------
  // Targets are on the predicted color (on the chosen wood), in CIE LCh. L = lightness, C = colorfulness, h = hue.
  const LOOKS = {
    natural: { label: 'Natural', sub: 'The wood’s own color, slightly richer', near: true },
    light: { label: 'Light & Airy', sub: 'Pale, soft, Scandinavian', L: [62, 86], C: [3, 18] },
    golden: { label: 'Golden Honey', sub: 'Warm, glowing, classic oak', L: [48, 66], C: [24, 46], h: [62, 82] },
    warm: { label: 'Warm Medium Brown', sub: 'Early American, Provincial', L: [40, 54], C: [16, 34], h: [56, 76] },
    rich: { label: 'Rich Brown', sub: 'Walnut, chestnut', L: [30, 42], C: [12, 30], h: [52, 78] },
    dark: { label: 'Dark Espresso', sub: 'Jacobean, ebony, near black', L: [12, 31], C: [0, 22] },
    red: { label: 'Reddish', sub: 'Cherry, mahogany', L: [24, 52], C: [20, 46], h: [28, 56] },
    gray: { label: 'Gray & Weathered', sub: 'Driftwood, barnwood', L: [34, 72], C: [0, 10] },
    white: { label: 'Whitewash', sub: 'Pickled, limed, white-washed', L: [74, 94], C: [0, 14], white: true },
    color: { label: 'A Color', sub: 'Blue, green, red and more', color: true },
  };
  const GRAIN = { show: 'Show the Grain', hide: 'Hide the Grain (Solid)' };
  // how much each kind of stain covers
  const TYPES = { trans: 'Transparent', semi: 'Semi-Transparent', semisolid: 'Semi-Solid', solid: 'Solid', white: 'Whitewash' };
  const SHOWS_GRAIN = ['trans', 'semi', 'semisolid', 'white'];
  const CONDITION = { bare: 'Bare or Sanded', finished: 'Already Finished', new_pt: 'New Pressure-Treated' };
  const DEFAULT = { job: 'stain', target: 'floors', wood: '', condition: 'bare', looks: [], grain: 'show', matchWood: '', wallTone: '', sheen: '', evenness: '', pets: false };
  // advanced stain questions
  const MATCH_WOOD = { light: ['Light Wood', 'D9B98E'], medium: ['Medium Wood', 'A87447'], dark: ['Dark Wood', '5A3E2B'], reddish: ['Reddish Wood', '8E4A32'], gray: ['Gray Wood', '8C847A'] };
  const WALL_TONES = { white: ['White', 'F1EFE8'], warm: ['Warm Neutral', 'D9CDB8'], gray: ['Gray', 'B9BAB6'], color: ['A Color', '8FA6A0'], dark: ['Dark', '3E4246'] };
  const SHEENS = { matte: 'Matte', satin: 'Satin', semigloss: 'Semi-Gloss', gloss: 'Gloss' };

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
      const meta = BRANDS[brand] || {};
      for (const [code, name, hex, type, light, dark, n, solidHex, ref, line] of rows) {
        const lab = C.hexToLab(hex), lch = C.labToLch(lab);
        const woodish = (lch[2] > 18 && lch[2] < 95) || lch[1] < 10;
        const colorName = COLOR_WORDS.test(name) && !WOOD_WORDS.test(name);
        STAINS.push({ id: `${brand}:${code}`, brand, code: String(code), name, hex, type, light, dark, n, solidHex: solidHex || '', ref: ref || meta.ref || 'red_oak', refMix: meta.refMix || 0, use: meta.use || 'interior', line: line || '', lab, L: lch[0], C: lch[1], h: lch[2], colored: colorName || !woodish || (lch[1] > 22 && (lch[2] < 18 || lch[2] > 95)), stain: true, lrv: C.lrvFromHex(hex), flags: 0 });
      }
    }
    return STAINS.length;
  }
  const all = () => STAINS;
  const find = id => STAINS.find(s => s.id === id) || null;
  const brandName = id => (BRANDS[id] || {}).name || id;
  const brands = () => Object.values(BRANDS);
  const brandOn = (id, s) => !(s && s.stainBrands && s.stainBrands[id] === false);
  // what to show where a code would go: Cabot doesn't number its colors, so its opacity stands in
  const codeLabel = x => ((BRANDS[x.brand] || {}).codeless ? (x.line || TYPES[x.type] || '') : x.code);
  const woodFor = a => (W.SPECIES[a.wood] ? a.wood : (JOBS[a.target] || JOBS.floors).wood);

  // Look Up: stains by name, number or brand word ("early american", "minwax 230", "superdeck cedar"), or with a
  // color value the stains closest to it. opts: { stainBrands (switched-off brands), hex, limit }
  const words = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const BRAND_WORDS = { minwax: 'minwax', cabot: 'cabot', olympic: 'olympic', superdeck: 'swstain', 'super deck': 'swstain', 'sherwin williams superdeck': 'swstain', 'sw superdeck': 'swstain', varathane: 'varathane' };
  function search(query, opts) {
    opts = opts || {};
    const limit = opts.limit || 30;
    const pool = STAINS.filter(s => brandOn(s.brand, opts));
    if (opts.hex) {
      const lab = C.hexToLab(opts.hex);
      return pool.map(s => ({ stain: s, dE: Math.round(C.deltaE2000(lab, s.lab) * 10) / 10, score: 0 })).sort((a, b) => a.dE - b.dE).slice(0, limit);
    }
    let q = words(query);
    if (!q) return [];
    let brand = null;
    for (const k of Object.keys(BRAND_WORDS).sort((a, b) => b.length - a.length)) if (q === k || q.startsWith(k + ' ')) { brand = BRAND_WORDS[k]; q = q.slice(k.length).trim(); break; }
    const ws = q.split(' ').filter(Boolean), qc = q.replace(/ /g, '');
    const out = [];
    for (const s of pool) {
      if (brand && s.brand !== brand) continue;
      const name = words(s.name), code = words(s.code).replace(/ /g, '');
      let score = 0;
      if (!q) score = 10;                                   // just a brand word: its stains
      else if (code && code === qc) score = 100;
      else if (name === q) score = 95;
      else if (code && qc.length >= 2 && /\d/.test(qc) && code.startsWith(qc)) score = 60;
      else if (name.startsWith(q)) score = 50;
      else if (ws.every(w => name.split(' ').some(t => t.startsWith(w)))) score = 35;
      else if (ws.every(w => name.includes(w))) score = 25;
      if (score) out.push({ stain: s, score });
    }
    return out.sort((a, b) => b.score - a.score || a.stain.name.localeCompare(b.stain.name)).slice(0, limit);
  }

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
    if (ext && solid && E() && !STAINS.some(x => x.use === 'exterior' && x.type === 'solid' && brandOn(x.brand, s))) {
      // exterior solid stain with no solid stain colors on: stores tint solid stain to paint colors, so the
      // picks are exterior paint colors in stain-like tones
      const en = s.brands || {};
      pool = E().getIndex().colors.filter(c => en[c.brand] !== false && !(c.flags & E().F.DISC) && (!(c.flags & (E().F.INT | E().F.EXT)) || (c.flags & E().F.EXT)) && E().collectionOn(c, s.collections) && c.L < 78)
        .map(c => ({ src: c, kind: 'paint', id: c.id, name: c.name, brand: c.brand, code: c.code, hex: c.hex, solidHex: c.hex }));
    }
    // stains from the brands that are on: interior jobs use interior stains, exterior jobs exterior stains.
    // Grain showing means transparent to semi-solid; hiding it means solid (or Minwax's solid swatch indoors).
    const use = ext ? 'exterior' : 'interior';
    const fits = x => brandOn(x.brand, s) && !(a.condition === 'finished' && x.type === 'white') && (solid ? (x.type === 'solid' || (!ext && x.solidHex)) : SHOWS_GRAIN.includes(x.type));
    let stains = STAINS.filter(x => x.use === use && fits(x));
    let guide = false;
    if (ext && !stains.length && !solid) { stains = STAINS.filter(x => x.use === 'interior' && fits(x)); guide = stains.length > 0; } // no outdoor brand on: Minwax tones as a guide
    if (stains.length || !pool.length) pool = stains.map(x => ({ src: x, kind: 'stain', id: x.id, name: x.name, brand: x.brand, code: x.code, hex: x.hex, solidHex: x.solidHex, type: x.type, ref: x.ref, refMix: x.refMix }));
    const scored = [];
    for (const x of pool) {
      const st = { hex: x.hex, type: x.type, solid: solid || x.kind === 'paint' || x.type === 'solid', solidHex: x.solidHex, ref: x.ref, refMix: x.refMix };
      const hex = x.kind === 'paint' ? W.quickHex(sp, st) : W.predictHex(sp, st);
      const p = Object.assign({ hex }, lchOf(hex));
      let score = 0;
      for (const lk of looks) score = Math.max(score, lookScore(lk, p, bare, x.kind === 'stain' ? x.src : null));
      if (score <= 0.05) continue;
      // finished wood can only go darker without stripping
      if (a.condition === 'finished' && p.L > bare.L - 4 && !solid) score *= 0.35;
      if (x.kind === 'stain' && x.src.n >= 3) score += 0.03; // published in several products: a core color
      // advanced: match other wood in the room, keep a contrast with the walls, hide wear from pets and kids
      if (a.matchWood && MATCH_WOOD[a.matchWood]) { const close = Math.max(0, 1 - C.deltaE2000(C.hexToLab(hex), C.hexToLab(MATCH_WOOD[a.matchWood][1])) / 16); score = 0.45 * score + 0.55 * close; }
      if (a.wallTone && WALL_TONES[a.wallTone] && C.deltaE2000(C.hexToLab(hex), C.hexToLab(WALL_TONES[a.wallTone][1])) < 12) score -= 0.15;
      if (a.pets && job.traffic && (p.L < 28 || p.L > 76)) score -= 0.15;
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
      solid: solid || o.item.kind === 'paint' || o.item.type === 'solid', type: o.item.type, ref: o.item.ref, refMix: o.item.refMix,
    }));
    return { kind: 'stain', answers: a, wood: sp, bare: bare.hex, looks, results, tips: tipsFor(a), products: productsFor(a, s, results), poolSize: pool.length, guide };
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
    if (!solid && BLOTCHY.includes(sp)) add('caution', `Can look blotchy on ${S.label.toLowerCase()}`, 'Use a pre-stain wood conditioner first, or a gel stain.');
    if (!solid && ['maple', 'birch'].includes(sp) && p.L < 36) add('caution', `Dark stains go uneven on ${S.label.toLowerCase()}`, 'Dense wood resists dark stain. Use a gel stain or two thin coats.');
    if (sp === 'red_oak' && p.C < 10 && p.L > 30) add('heads-up', 'Grays can turn muddy on red oak', 'Red oak’s pink shows through gray stains. Test a board first.');
    if (sp === 'cherry') add('tip', 'Cherry darkens with age', 'It deepens in sunlight over the first months. Go a step lighter.');
    if (sp === 'walnut' && p.L > bare.L - 3 && !solid) add('heads-up', 'Stain won’t lighten walnut', 'Walnut is already dark. A clear finish or oil shows it best.');
    if (a.condition === 'finished' && !solid) {
      if (p.L > bare.L - 4) add('caution', 'You can only go darker', 'Stain can’t lighten finished wood. Strip or sand to bare wood to go lighter.');
      add('heads-up', 'Penetrating stain needs bare wood', 'Over a finish, scuff-sand and use a gel stain, or strip to bare wood.');
    }
    if (a.condition === 'new_pt' || (sp === 'pt_pine' && a.condition !== 'finished')) add('caution', 'Let new pressure-treated wood dry', 'Wait until sprinkled water soaks in instead of beading, often a few weeks or more.');
    if (['cedar', 'redwood'].includes(sp) && solid) add('heads-up', 'Tannins can bleed through', 'Cedar and redwood can bleed through light colors. Prime with a stain-blocking primer.');
    if (job.horizontal && solid) add('heads-up', 'Solid stain can peel on walking surfaces', 'Solid stain can peel where feet and water wear it. Semi-transparent lasts better.');
    if (item.type === 'semisolid') add('tip', 'Semi-solid hides some grain', 'Covers more than semi-transparent and lasts longer. The wood texture still shows.');
    if (job.kind === 'exterior' && !solid) add('tip', 'Recoat every 2–3 years', 'Semi-transparent stain wears away instead of peeling. Clean and recoat every couple of years.');
    if (job.kind === 'exterior' && p.L < 30 && job.horizontal) add('heads-up', 'Dark decks get hot', 'Dark boards get too hot for bare feet in sun.');
    if (job.traffic && p.L < 28 && job.kind === 'interior') add('heads-up', 'Dark floors show dust and scratches', 'Very dark floors show pet hair, dust and scratches.');
    if (job.traffic && p.L > 70 && job.kind === 'interior') add('tip', 'Light floors hide wear', 'Pale floors hide dust and scratches but show dark dirt.');
    if (item.type === 'white' && ['pine', 'fir'].includes(sp)) add('tip', 'Whitewash on pine can look pink or yellow', 'Pine’s yellow and knots can show through. A second coat helps.');
    if (job.food) add('tip', 'Food-safe finish for prep surfaces', 'Skip stain where food is cut. Use a food-safe oil there.');
    if (item.colored && !solid) add('tip', 'Colored stains show the wood under them', 'Blue over yellow wood turns greenish. Test on the same wood.');
    if (item.kind === 'paint') add('tip', 'Tinted as a solid stain', 'Ask for this color in a solid exterior stain. Most stores can tint it.');
    return out;
  }
  function tipsFor(a) {
    const job = JOBS[a.target] || JOBS.floors; const tips = [];
    if (a.sheen && SHEENS[a.sheen]) tips.push({ title: 'Sheen', text: `Get the topcoat in ${SHEENS[a.sheen]}. ${a.sheen === 'matte' ? 'Matte looks natural and hides scratches.' : a.sheen === 'satin' ? 'Satin has a soft glow and cleans easily.' : 'Shinier shows scratches more but wipes clean fastest.'}` });
    if (a.evenness === 'even') tips.push({ title: 'Even Color', text: 'Use a wood conditioner first and wipe the stain off evenly.' });
    if (a.pets && job.traffic) tips.push({ title: 'Pets and Kids', text: 'Mid-tone stains with a satin topcoat hide scratches and dust best.' });
    tips.push({ title: 'Test It First', text: 'Try it on a scrap or hidden spot of the same wood first.' });
    if (a.condition !== 'finished') tips.push({ title: 'Sanding', text: job.kind === 'interior' ? 'Sand floors to 120–150 grit, furniture and cabinets to 150–180. Finer grit makes stain lighter.' : 'Clean and brighten old wood first. Sand rough or gray spots.' });
    tips.push({ title: 'Topcoat', text: job.kind === 'interior' ? (job.traffic ? 'Use 2–3 coats of floor polyurethane. Water-based stays clearest.' : 'Seal it with polyurethane. Water-based stays clear over light colors.') : 'Exterior stain seals itself. No clear coat needed.' });
    if (job.kind === 'exterior') tips.push({ title: 'Weather', text: 'Stain above 50 °F, out of midday sun, with 24–48 dry hours ahead.' });
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
  // the stain brands' own exterior lines, by how much the stain covers
  const STAIN_LINES = {
    cabot: { semi: 'Cabot Semi-Transparent Stain + Sealer', semisolid: 'Cabot Semi-Solid Decking Stain', solid: 'Cabot Solid Color Stain' },
    olympic: { semi: 'Olympic Elite or Olympic Maximum Semi-Transparent', semisolid: 'Olympic Elite Semi-Solid', solid: 'Olympic Maximum Solid Color' },
    swstain: { semi: 'SuperDeck Semi-Transparent Stain', semisolid: 'SuperDeck Semi-Solid Stain', solid: 'SuperDeck Solid Color Stain', dd: 'SuperDeck Deck & Dock Elastomeric Coating' },
  };
  const TYPE_WHY = { semi: 'Shows the grain and wears away instead of peeling.', semisolid: 'Hides some grain and lasts longer than semi-transparent.', solid: 'Covers like paint while keeping the wood texture.', dd: 'A thick coating that fills small cracks in old decks.' };
  function productsFor(a, s, results) {
    const job = JOBS[a.target] || JOBS.floors; const sp = woodFor(a);
    const solid = a.grain === 'hide';
    const out = [];
    if (job.kind === 'interior') {
      // the brands the picks come from (Minwax, Varathane), each with its own products
      const picked = [...new Set((results || []).filter(r => r.kind === 'stain').map(r => r.brand))];
      const brandsIn = picked.length ? picked : ['minwax'];
      const mw = brandsIn.includes('minwax'), vt = brandsIn.includes('varathane');
      const blotchy = !solid && BLOTCHY.includes(sp) && a.condition !== 'finished';
      if (a.condition === 'finished') {
        if (mw) out.push({ name: 'Minwax Gel Stain', why: 'Goes over a scuff-sanded finish evenly, so you don’t have to strip first.' });
        if (vt) out.push({ name: 'Varathane Premium Gel Stain', why: 'Goes over a scuff-sanded finish evenly, so you don’t have to strip first.' });
      } else if (solid && mw) out.push({ name: 'Minwax Water Based Solid Color Stain', why: 'Covers the wood’s color while some texture still shows.' });
      else {
        if (mw) out.push({ name: 'Minwax Wood Finish', why: 'Oil-based stain that soaks in. The classic choice, with the most time to work.' });
        if (vt) {
          const lines = [...new Set((results || []).filter(r => r.brand === 'varathane').map(r => (r.item || {}).line).filter(Boolean))];
          for (const l of (lines.length ? lines : ['Fast Dry Wood Stain']).slice(0, 2)) out.push({ name: 'Varathane ' + l, why: /Fast Dry/.test(l) ? 'Oil-based stain that dries in about an hour.' : /Water/.test(l) ? 'Low odor, quick drying and easy cleanup.' : /Gel/.test(l) ? 'Thick, so it won’t run on doors and cabinets.' : 'Oil-based stain with rich color in one coat.' });
        }
        if (mw) out.push({ name: 'Minwax Water Based Wood Stain', why: 'Dries fast with little odor. Good for cabinets and trim.' });
      }
      if (blotchy) out.push({ name: vt && !mw ? 'Varathane Premium Wood Conditioner' : 'Minwax Pre-Stain Wood Conditioner', why: `Helps ${W.SPECIES[sp].label.toLowerCase()} take stain evenly. Brush it on first.` });
      if (['maple', 'birch'].includes(sp) && a.condition !== 'finished') out.push({ name: vt && !mw ? 'Varathane Premium Gel Stain' : 'Minwax Gel Stain', why: 'Easier to get a dark, even color on dense woods.' });
      if (job.traffic) out.push({ name: vt && !mw ? 'Varathane Premium Floor Finish' : 'Floor polyurethane (oil or water based)', why: 'Two to three coats over the stain so it stands up to wear.' });
      else out.push(vt && !mw ? { name: 'Varathane Ultimate Polyurethane', why: 'The water-based one stays clear over light colors; the oil-based one is warmer.' } : { name: 'Minwax Polycrylic or Fast-Drying Polyurethane', why: 'Polycrylic stays clear over light colors; polyurethane is tougher and warmer.' });
    } else if ((results || []).some(r => r.kind === 'stain' && STAIN_LINES[r.brand])) {
      // the lines the picks actually come in
      const seen = new Set();
      for (const r of results) {
        if (r.kind !== 'stain' || !STAIN_LINES[r.brand]) continue;
        const t = /Deck & Dock/.test((r.item || {}).line || '') ? 'dd' : r.type;
        const name = STAIN_LINES[r.brand][t] || STAIN_LINES[r.brand].semi;
        if (seen.has(name)) continue; seen.add(name);
        out.push({ name, brand: r.brand, why: TYPE_WHY[t] || TYPE_WHY.semi });
      }
      out.push({ name: 'Deck & siding cleaner or brightener', why: 'Clean, brightened wood takes stain far more evenly.' });
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
    const st = { hex: item.hex, type: item.type, solid: a.grain === 'hide' || item.kind === 'paint', solidHex: item.solidHex, ref: item.ref, refMix: item.refMix };
    return (list || ['red_oak', 'white_oak', 'pine', 'maple', 'cherry', 'cedar']).map(sp => ({ sp, label: W.SPECIES[sp].label, hex: W.predictHex(sp, st), bare: W.bareHex(sp) }));
  }

  const api = { search, JOBS, LOOKS, GRAIN, CONDITION, DEFAULT, TYPES, MATCH_WOOD, WALL_TONES, SHEENS, init, all, find, brandName, brands, brandOn, codeLabel, woodFor, recommend, warningsFor, tipsFor, productsFor, onOtherWoods, lookScore };
  root.CG = root.CG || {};
  root.CG.stain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
