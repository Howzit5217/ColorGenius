/* ColorGenius spray paint: the spray paint questions, color picks, matches to any paint color, and what to buy.
   Colors come from data/sprays.js (Rust-Oleum, Krylon and Montana GOLD, from each brand's own website). Each brand
   makes several product lines, and the line matters as much as the color: plastic needs one that bonds to plastic,
   a grill needs high-heat paint, a rusty railing needs a rust-stopping enamel. So the job decides the lines, and
   the colors come from those lines.
   Depends on CG.color. Works in the browser (window.CG.spray) and in Node (module.exports). */
(function (root) {
  'use strict';
  const req = p => (typeof require === 'function' ? require(p) : null);
  const C = (root.CG && root.CG.color) || req('./color.js');

  // ---------------- what's being sprayed ----------------
  // place: where it usually lives (asked, unless fixed); on: the surface the line has to stick to
  const JOBS = {
    metal: { label: 'Metal Furniture & Railings', sub: 'Patio sets, railings, gates, mailboxes', on: 'metal', place: 'outside', icon: 'metal' },
    hardware: { label: 'Hardware & Light Fixtures', sub: 'Knobs, pulls, hinges, lamps, fixtures', on: 'metal', place: 'inside', icon: 'hardware' },
    wood: { label: 'Wood Furniture & Decor', sub: 'Chairs, side tables, shelves, frames', on: 'wood', place: 'inside', icon: 'chair' },
    plastic: { label: 'Plastic', sub: 'Patio chairs, planters, bins, toys, shutters', on: 'plastic', place: 'outside', icon: 'plastic' },
    wicker: { label: 'Wicker & Rattan', sub: 'Chairs, baskets, lamp shades', on: 'wicker', place: 'inside', icon: 'wicker' },
    glass: { label: 'Glass & Ceramic', sub: 'Vases, jars, bottles, ceramic decor', on: 'glass', place: 'inside', icon: 'vase' },
    pots: { label: 'Pots, Concrete & Stone', sub: 'Terra cotta, concrete planters, garden decor', on: 'masonry', place: 'outside', icon: 'pot' },
    crafts: { label: 'Crafts, Signs & Art', sub: 'Stencils, signs, murals, school projects', on: 'craft', place: 'inside', icon: 'craft' },
    grill: { label: 'Grill, Fire Pit or Stove', sub: 'Anything that gets hot', on: 'hot', place: 'outside', fixed: true, icon: 'grill' },
    appliance: { label: 'Appliances', sub: 'Fridge, dishwasher, washer and dryer fronts', on: 'appliance', place: 'inside', fixed: true, icon: 'fridge' },
  };
  const PLACES = { inside: ['Inside', 'In the house'], outside: ['Outside', 'Outdoors or on a porch'] };
  const CONDITION = {
    new: ['New or Bare', 'Never painted'], painted: ['Already Painted', 'Old paint or a factory finish'],
    rusty: ['Rusty Metal', 'Rust or flaking paint'], shiny: ['Slick or Shiny', 'Glossy, glazed or laminate'],
  };
  // the finishes to pick from, and the cans' finishes each one covers ('' is a can whose sheen the brand doesn't list)
  const FINISHES = {
    gloss: { label: 'Gloss', sub: 'Shiny, easy to wipe clean', has: ['gloss', 'semigloss', ''] },
    satin: { label: 'Satin', sub: 'A soft sheen, hides flaws', has: ['satin', ''] },
    matte: { label: 'Matte or Flat', sub: 'No shine at all', has: ['matte', 'flat', ''] },
    metallic: { label: 'Metallic', sub: 'Gold, silver, bronze, copper', has: ['metallic', 'mirror'] },
    hammered: { label: 'Hammered', sub: 'A dimpled metal look that hides dents', has: ['hammered'] },
    chalky: { label: 'Chalk-Style', sub: 'Ultra-matte, vintage furniture look', has: ['chalky'] },
    textured: { label: 'Stone & Textured', sub: 'Looks like granite or sandstone', has: ['textured'] },
    glitter: { label: 'Glitter & Special', sub: 'Glitter, neon, glow, frosted glass', has: ['glitter', 'neon', 'glow', 'frosted', 'glass', 'effect', 'chalkboard'] },
  };
  // (names that are also real colors' names, like Chalky or Neon, would never be translated, so these have their own)
  const FINISH_NAME = { gloss: 'Gloss', semigloss: 'Semi-Gloss', satin: 'Satin', matte: 'Matte', flat: 'Flat', metallic: 'Metallic', hammered: 'Hammered', textured: 'Textured', glitter: 'Glittery', chalky: 'Chalk-Style', frosted: 'Frosted Glass', mirror: 'Mirror', glass: 'Glass Tint', neon: 'Fluorescent', glow: 'Glow in the Dark', effect: 'Special Effect', chalkboard: 'Chalkboard', clear: 'Clear', primer: 'Primer' };
  // color families, by the color itself (so every brand's colors sort the same way)
  const FAMILIES = {
    whites: ['Whites & Creams', 'F4F2EA'], grays: ['Grays', '9A9C9B'], blacks: ['Blacks', '262626'], browns: ['Browns & Tans', '8A6446'],
    reds: ['Reds', 'B3262B'], pinks: ['Pinks', 'E58FB0'], oranges: ['Oranges', 'E06A28'], yellows: ['Yellows', 'EDC43A'],
    greens: ['Greens & Olives', '4E8A4C'], blues: ['Blues & Teals', '2D5F9A'], purples: ['Purples', '6E4A8E'], metals: ['Gold, Silver & Metal', 'C2A15A'],
  };
  const SIZES = {
    small: { label: 'Small', sub: 'Knobs, a frame, a lamp, a vase', cans: 1 },
    medium: { label: 'Medium', sub: 'A chair, a side table, a planter', cans: 2 },
    large: { label: 'Large', sub: 'A bench, a table, a dresser', cans: 4 },
    set: { label: 'A Set or a Long Railing', sub: 'Four chairs, a patio set, a railing', cans: 6 },
  };
  const DEFAULT = { job: 'spray', what: 'metal', place: 'outside', condition: 'new', finish: '', families: [], match: null, size: 'medium' };

  // ---------------- the product lines ----------------
  // on: the jobs a line suits, best first by its rank in each list below; primer: paint and primer in one;
  // rust: made to stop rust; why: one line on what it's for
  const LINES = {
    // Rust-Oleum
    pt2x: { why: 'Paint and primer in one, with twice the coverage. Sticks to wood, metal, plastic, wicker and unglazed ceramic.', primer: true },
    universal: { why: 'All-surface paint and primer: metal, wood, plastic, vinyl, wicker and concrete. Sprays at any angle, even upside down.', primer: true },
    stopsrust: { why: 'A rust-stopping enamel for metal. Goes right over light rust once the loose rust is brushed off.', rust: true },
    highheat: { why: 'High-heat paint for grills, fire pits, wood stoves and radiators. Check the can for how hot it’s rated.', heat: true },
    appliance: { why: 'A tough, washable epoxy for appliance fronts. Not for stove tops, ovens or anything that gets hot.' },
    chalked: { why: 'An ultra-matte chalk-style finish for furniture and decor. Add a clear top coat where it gets handled.' },
    aa2x: { why: 'Rust-Oleum’s 2X Ultra Cover paint and primer, the same kind of can as Painter’s Touch 2X.', primer: true },
    lowodor: { why: 'Water-based with a low odor, for small projects. Still spray outside or with plenty of fresh air.' },
    specialty: { why: 'Specialty finishes: metallics, glitter, glow, frosted glass, mirror and stone looks.' },
    rusto: { why: 'Artist spray paint for murals, signs and crafts.' },
    // Krylon
    fusion: { why: 'Paint and primer that bonds to plastic without sanding or priming, and to metal, wood, glass, ceramic and wicker.', primer: true, plastic: true },
    colormaxx: { why: 'Paint and primer for wood, metal, plastic, wicker and more, inside or out.', primer: true },
    rusttough: { why: 'A rust-stopping enamel for metal, in gloss and safety colors.', rust: true },
    kchalky: { why: 'An ultra-matte chalky finish for furniture and decor. Add a clear top coat where it gets handled.' },
    harmony: { why: 'Krylon spray paint. Check the can for which surfaces it’s made for.' },
    kclassic: { why: 'Krylon spray paint. Check the can for which surfaces it’s made for.' },
    decor: { why: 'Decorative colors for home decor and crafts.' },
    shortcuts: { why: 'Small cans for crafts, touch-ups and little projects.' },
    kmetal: { why: 'Bright metallic and foil finishes for decor and crafts.' },
    kspecial: { why: 'Specialty finishes: glitter, neon, glow, stone, crackle and glass looks.' },
    krylon: { why: 'Krylon spray paint. Check the can for which surfaces it’s made for.' },
    // Montana
    mtngold: { why: 'Low-pressure artist spray paint with a satin finish, for art, murals, signs and crafts.' },
  };
  // the lines for each job, best first (a line not listed isn't shown for it)
  const FOR = {
    metal: ['stopsrust', 'rusttough', 'universal', 'fusion', 'pt2x', 'colormaxx', 'aa2x'],
    hardware: ['universal', 'pt2x', 'fusion', 'colormaxx', 'aa2x', 'stopsrust', 'rusttough', 'kmetal', 'specialty', 'lowodor'],
    wood: ['pt2x', 'colormaxx', 'universal', 'fusion', 'aa2x', 'chalked', 'kchalky', 'lowodor', 'harmony', 'kclassic', 'decor', 'krylon'],
    plastic: ['fusion', 'universal', 'pt2x', 'colormaxx', 'aa2x'],
    wicker: ['pt2x', 'fusion', 'universal', 'colormaxx', 'aa2x'],
    glass: ['fusion', 'specialty', 'kspecial'],
    masonry: ['universal', 'pt2x', 'fusion', 'stopsrust', 'specialty', 'kspecial', 'aa2x'],
    craft: ['pt2x', 'colormaxx', 'decor', 'shortcuts', 'mtngold', 'rusto', 'kmetal', 'kspecial', 'specialty', 'chalked', 'kchalky', 'fusion', 'universal', 'aa2x', 'harmony', 'kclassic', 'lowodor', 'krylon'],
    hot: ['highheat'],
    appliance: ['appliance'],
  };
  // which finishes each job can have (grills and appliances come in a few)
  const finishesFor = what => {
    const on = (JOBS[what] || JOBS.metal).on;
    if (on === 'hot' || on === 'appliance') return [];
    if (on === 'glass') return ['gloss', 'satin', 'matte', 'metallic', 'glitter'];
    if (on === 'plastic' || on === 'wicker') return ['gloss', 'satin', 'matte', 'metallic', 'hammered'];
    if (on === 'masonry') return ['gloss', 'satin', 'matte', 'metallic', 'textured'];
    if (on === 'metal') return ['gloss', 'satin', 'matte', 'metallic', 'hammered', 'textured'];
    return Object.keys(FINISHES);
  };

  // ---------------- the data ----------------
  let BRANDS = {}, LINE_NAMES = {}, CANS = [];
  // (hues are CIE LCh angles: red is near 35, orange 60, yellow 95, green 140, teal 200, navy 290, purple 320)
  const famOf = (hex, finish, name) => {
    // a metal's name on a can whose sheen isn't a plain one, like "Hammered Copper" or Krylon's "Bright Gold"
    const metalName = /\b(gold|silver|chrome|brass|copper|bronze|nickel|aluminum|pewter|gunmetal)\b/i.test(name || '');
    if (finish === 'metallic' || finish === 'mirror' || (metalName && !['gloss', 'semigloss', 'satin', 'matte', 'flat'].includes(finish))) return 'metals';
    const [L, c, h] = C.labToLch(C.hexToLab(hex));
    if (c < 9) return L > 86 ? 'whites' : L < 24 ? 'blacks' : 'grays';
    if (L > 82 && c < 24 && h > 30 && h < 110) return 'whites';
    if (L < 22 && c < 16) return 'blacks';
    if (h >= 30 && h < 95 && c < 38 && L < 80) return 'browns';
    if (h >= 340 || h < 20) return L > 55 ? 'pinks' : 'reds';
    if (h < 44) return L > 74 ? 'pinks' : 'reds';
    if (h < 72) return 'oranges';
    if (h < 105) return 'yellows';
    if (h < 185) return 'greens';
    if (h < 298) return 'blues';   // (navies are near 285–293; purples start near 300)
    if (h < 340) return L > 66 && h > 326 ? 'pinks' : 'purples';
    return 'reds';
  };
  function init(data) {
    data = data || root.CG_SPRAYS || { brands: [], lines: {}, rows: {} };
    BRANDS = Object.fromEntries((data.brands || []).map(b => [b.id, b]));
    LINE_NAMES = Object.fromEntries(Object.entries(data.lines || {}).map(([k, v]) => [k, v[1]]));
    CANS = [];
    for (const [brand, rows] of Object.entries(data.rows || {})) {
      for (const [code, name, hex, finish, line, own] of rows) {
        const lab = C.hexToLab(hex);
        const id = 'sp:' + brand + ':' + (code || line + '-' + (own || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')));
        CANS.push({ id, kind: 'spray', brand, code: String(code || ''), name, hex, finish: finish || '', line, lineName: LINE_NAMES[line] || line, lab, family: famOf(hex, finish, name) });
      }
    }
    return CANS.length;
  }
  const all = () => CANS;
  const find = id => CANS.find(s => s.id === id) || null;
  const brandName = id => (BRANDS[id] || {}).name || id;
  const brands = () => Object.values(BRANDS);
  const brandOn = (id, s) => !(s && s.sprayBrands && s.sprayBrands[id] === false);
  const lineName = id => LINE_NAMES[id] || id;
  // the brand and its line, once ("Krylon Fusion All-In-One", "Montana GOLD")
  const fullLine = x => (x.lineName.indexOf(brandName(x.brand)) === 0 ? x.lineName : brandName(x.brand) + ' ' + x.lineName);
  const finishName = f => FINISH_NAME[f] || '';
  // the can's own number where the brand has one (Rust-Oleum's SKU, Montana's code); Krylon goes by name
  const codeLabel = x => ((BRANDS[x.brand] || {}).codeless ? '' : x.code);
  const isColor = x => x.finish !== 'clear' && x.finish !== 'primer' && !/\b(clear|sealer|top ?coat)\b/i.test(x.name);
  // plain sheens come before metallics and textures when any finish will do
  const PLAIN = ['gloss', 'semigloss', 'satin', 'matte', 'flat', ''];

  // ---------------- Look Up ----------------
  const words = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const BRAND_WORDS = { 'rust oleum': 'rustoleum', rustoleum: 'rustoleum', 'painters touch': 'rustoleum', krylon: 'krylon', fusion: 'krylon', 'montana gold': 'montana', montana: 'montana', mtn: 'montana' };
  // by name, number, brand or line ("gloss black", "334020", "krylon fusion navy", "montana G1010"), or with a hex,
  // the cans closest to it. opts: { sprayBrands (switched-off brands), hex, limit }
  function search(query, opts) {
    opts = opts || {};
    const limit = opts.limit || 30;
    const pool = CANS.filter(s => isColor(s) && brandOn(s.brand, opts));
    if (opts.hex) {
      const lab = C.hexToLab(opts.hex);
      return dedupe(pool.map(s => ({ spray: s, dE: Math.round(C.deltaE2000(lab, s.lab) * 10) / 10, score: 0 })).sort((a, b) => a.dE - b.dE), x => x.spray).slice(0, limit);
    }
    let q = words(query);
    if (!q) return [];
    let brand = null;
    for (const k of Object.keys(BRAND_WORDS).sort((a, b) => b.length - a.length)) if (q === k || q.startsWith(k + ' ')) { brand = BRAND_WORDS[k]; if (k !== 'fusion' && k !== 'painters touch') q = q.slice(k.length).trim(); break; }
    const ws = q.split(' ').filter(Boolean), qc = q.replace(/ /g, '');
    const out = [];
    for (const s of pool) {
      if (brand && s.brand !== brand) continue;
      const name = words(s.name), code = words(s.code).replace(/ /g, ''), full = name + ' ' + words(s.lineName);
      let score = 0;
      if (!q) score = 10;
      else if (code && code === qc) score = 100;
      else if (name === q) score = 95;
      else if (code && qc.length >= 3 && /\d/.test(qc) && code.startsWith(qc)) score = 60;
      else if (name.startsWith(q)) score = 50;
      else if (ws.every(w => name.split(' ').some(t => t.startsWith(w)))) score = 35;
      else if (ws.every(w => full.includes(w))) score = 25;
      if (score) out.push({ spray: s, score });
    }
    // (the same can in two sizes counts once)
    const seen = new Set();
    return out.sort((a, b) => b.score - a.score || a.spray.name.localeCompare(b.spray.name))
      .filter(x => { const k = x.spray.brand + x.spray.line + x.spray.name + x.spray.hex; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
  }
  // the same color in several lines of one brand ("Gloss Black" in five of them): the first one stays
  function dedupe(list, get) {
    const seen = new Set();
    return list.filter(x => { const s = get(x), k = s.brand + '|' + words(s.name) + '|' + s.hex; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  // how close a match is, in words
  const closeness = dE => dE < 2 ? 'Very close' : dE < 4.5 ? 'Close match' : dE < 9 ? 'Similar' : 'Not as close';
  const closeTo = (dE, name) => (dE < 2 ? 'Very close to ' : dE < 4.5 ? 'Close to ' : dE < 9 ? 'Similar to ' : 'The nearest to ') + name;

  // ---------------- picking ----------------
  // the cans that suit the job (its lines), in the finish asked for; colors only (no clears or primers)
  function poolFor(a, s) {
    const job = JOBS[a.what] || JOBS.metal, lines = FOR[job.on] || [];
    const fin = FINISHES[a.finish];
    return CANS.filter(x => isColor(x) && brandOn(x.brand, s) && lines.includes(x.line) && (!fin || fin.has.includes(x.finish)));
  }
  function recommend(answers, s) {
    const a = Object.assign({}, DEFAULT, answers || {});
    s = s || {};
    const job = JOBS[a.what] || JOBS.metal, lines = FOR[job.on] || [];
    const n = Math.max(6, Math.min(12, (s.resultCount || 6) + 2));
    // outside, metal wants a rust-stopping line first; a store's own order of brands comes next
    const order = s.brandOrder || [];
    const rank = x => lines.indexOf(x.line) * 10 - (a.place === 'outside' && job.on === 'metal' && LINES[x.line] && LINES[x.line].rust ? 25 : 0) + (order.includes(x.brand) ? order.indexOf(x.brand) : order.length) + (!a.finish && !PLAIN.includes(x.finish) ? 200 : 0);
    let pool = poolFor(a, s);
    let results;
    if (a.match && a.match.hex) {
      const lab = C.hexToLab(a.match.hex);
      results = dedupe(pool.map(x => ({ x, dE: C.deltaE2000(lab, x.lab) })).sort((p, q) => p.dE - q.dE || rank(p.x) - rank(q.x)), r => r.x).slice(0, n)
        .map(r => pick(r.x, a, [closeTo(r.dE, a.match.name || '#' + a.match.hex)]));
      results.forEach((r, i) => { r.dE = Math.round(C.deltaE2000(lab, r.lab) * 10) / 10; r.role = i === 0 ? 'Closest' : closeness(r.dE); });
    } else {
      const fams = (a.families || []).filter(f => FAMILIES[f]);
      if (fams.length) pool = pool.filter(x => fams.includes(x.family));
      // the best line for the job first, then spread across the colors, so it isn't six blacks
      const sorted = dedupe(pool.slice().sort((p, q) => rank(p) - rank(q) || p.name.localeCompare(q.name)), x => x);
      const chosen = [];
      for (const gap of [16, 9, 4, 0]) {
        for (const x of sorted) {
          if (chosen.length >= n) break;
          if (chosen.includes(x) || chosen.some(c => C.deltaE2000(c.lab, x.lab) < gap)) continue;
          // more than one family asked for: take turns, so each gets its share
          if (fams.length > 1 && gap > 0) { const mine = chosen.filter(c => c.family === x.family).length; if (mine >= Math.ceil(n / fams.length)) continue; }
          chosen.push(x);
        }
        if (chosen.length >= n) break;
      }
      chosen.sort((p, q) => fams.length > 1 ? fams.indexOf(p.family) - fams.indexOf(q.family) || q.lab[0] - p.lab[0] : q.lab[0] - p.lab[0]);
      results = chosen.map(x => pick(x, a, []));
      results.forEach((r, i) => { r.role = i === 0 && !fams.length ? 'Top Pick' : FAMILIES[r.family] ? FAMILIES[r.family][0] : ''; });
    }
    // what to buy goes by the best line among the picks for the job, not the first color shown
    const best = results.slice().sort((p, q) => rank(p) - rank(q));
    return { kind: 'spray', answers: a, results, poolSize: poolFor(a, s).length, products: productsFor(a, best), tips: tipsFor(a), cans: cansFor(a) };
  }
  function pick(x, a, extra) {
    const why = extra.slice();
    const L = LINES[x.line];
    if (L) why.push(L.why);
    if (x.finish && FINISH_NAME[x.finish]) why.push(`${FINISH_NAME[x.finish]} finish.`);
    else why.push('The sheen is on the can: Krylon makes many colors in gloss, satin or matte.');
    return Object.assign({}, x, { reasons: why });
  }

  // ---------------- what to buy and how ----------------
  function cansFor(a) {
    const size = SIZES[a.size] || SIZES.medium, job = JOBS[a.what] || JOBS.metal;
    const primer = needsPrimer(a) ? Math.max(1, Math.round(size.cans / 2)) : 0;
    const clear = a.finish === 'chalky' || a.finish === 'glitter' ? Math.max(1, Math.round(size.cans / 2)) : 0;
    return { color: size.cans, primer, clear, heat: job.on === 'hot' };
  }
  // a separate primer: rusty or slick surfaces always; bare metal, and plastic unless the line bonds to plastic
  const needsPrimer = a => {
    const on = (JOBS[a.what] || JOBS.metal).on;
    if (on === 'hot' || on === 'appliance' || on === 'craft' || on === 'glass') return false;
    return a.condition === 'rusty' || a.condition === 'shiny' || (on === 'metal' && a.condition === 'new' && a.place === 'outside');
  };
  function productsFor(a, results) {
    const job = JOBS[a.what] || JOBS.metal, out = [], c = cansFor(a);
    const top = results[0];
    const cans = n => `${n} can${n === 1 ? '' : 's'}`;
    if (top) out.push({ name: fullLine(top), why: (LINES[top.line] || {}).why || '', amount: cans(c.color) });
    if (a.condition === 'rusty') out.push({ name: 'Rusty metal primer', why: 'After brushing off the loose rust, it seals what’s left so it can’t come back through.', amount: cans(c.primer) });
    else if (a.condition === 'shiny') out.push({ name: job.on === 'plastic' ? 'Plastic primer' : 'Bonding primer', why: 'Gives the paint something to grip on a slick surface. Scuff it with fine sandpaper first.', amount: cans(c.primer) });
    else if (c.primer && job.on === 'metal') out.push({ name: 'Clean metal primer', why: 'Bare metal outside lasts longest with a rust-stopping primer under the color.', amount: cans(c.primer) });
    if (c.clear) out.push({ name: a.finish === 'chalky' ? 'Clear matte top coat' : 'Clear gloss top coat', why: a.finish === 'chalky' ? 'Chalky paint scuffs easily; a clear coat protects it without adding shine.' : 'Seals the glitter in so it doesn’t rub off.', amount: cans(c.clear) });
    // the things that make a spray job come out well
    const kit = [];
    if (a.condition === 'rusty') kit.push('Wire brush');
    if (job.on === 'hot') kit.push('Degreaser');
    if (job.on !== 'craft' && job.on !== 'glass') kit.push(a.condition === 'painted' || a.condition === 'shiny' ? 'Fine sandpaper (220 grit)' : 'Scuff pad');
    kit.push('Tack cloth', 'Drop cloth or cardboard', 'Painter’s tape', 'Respirator mask and gloves');
    out.push({ name: 'Also Get', supplies: kit });
    return out;
  }
  function tipsFor(a) {
    const job = JOBS[a.what] || JOBS.metal, t = [];
    t.push({ title: 'The Right Day', text: 'Spray on a dry, calm day. Most cans say between 50 and 90°F, with low humidity.' });
    t.push({ title: 'Light Coats', text: 'Shake a full minute after the ball rattles. Hold the can a foot away and spray thin coats: a heavy coat drips.' });
    t.push({ title: 'Second Coats', text: 'Many cans need the next coat within an hour, or after two days. In between, the paint can wrinkle.' });
    if (job.on === 'plastic') t.push({ title: 'Plastic', text: 'Wash it with soapy water and let it dry. A paint made for plastic bonds without sanding.' });
    if (job.on === 'metal') t.push({ title: 'Metal', text: a.condition === 'rusty' ? 'Brush off loose rust and flaking paint, wipe off the dust, then prime what’s left.' : 'Wipe it down to remove grease and dirt. Bare metal outside needs a primer or a rust-stopping enamel.' });
    if (job.on === 'hot') t.push({ title: 'Grills', text: 'Paint only the outside. Never paint the cooking grates or the inside of a grill. Most high-heat paint finishes curing when the grill is first heated.' });
    if (job.on === 'appliance') t.push({ title: 'Appliances', text: 'Unplug it, clean it with a degreaser and tape off the handles and trim. Not for stove tops or ovens.' });
    if (job.on === 'glass') t.push({ title: 'Glass', text: 'Clean it with rubbing alcohol first. Don’t spray anything that holds food or drinks, or the inside of a vase that holds water.' });
    if (job.on === 'masonry') t.push({ title: 'Pots', text: 'For a pot that holds soil, paint the outside and just inside the rim.' });
    if (job.on === 'wicker') t.push({ title: 'Wicker', text: 'Spray from several angles, including from below, to reach the gaps in the weave.' });
    if (job.on === 'wood') t.push({ title: 'Wood', text: 'Sand lightly and wipe off the dust. Fill any holes first.' });
    if (job.on === 'craft') t.push({ title: 'Stay Clean', text: 'A big cardboard box on its side makes a good spray booth.' });
    t.push({ title: 'Let It Cure', text: 'It’s dry to the touch in minutes, but give it a day before using it and about a week before heavy use.' });
    t.push({ title: 'Save the Nozzle', text: 'When you’re done, turn the can upside down and spray for a few seconds until it sprays clear.' });
    t.push({ title: 'Air', text: 'Spray outside or in a garage with the door open, with a respirator mask and gloves.' });
    return t;
  }

  const api = { JOBS, PLACES, CONDITION, FINISHES, FAMILIES, SIZES, DEFAULT, LINES, FOR, init, all, find, brandName, brands, brandOn, lineName, fullLine, finishName, codeLabel, isColor, search, recommend, productsFor, tipsFor, cansFor, needsPrimer, finishesFor, closeness };
  root.CG = root.CG || {};
  root.CG.spray = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
