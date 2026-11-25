/* ColorGenius paint department advice: which paint to buy, which finish, which roller and brush, what else to
   grab, and how much of it. Works in the browser (window.CG.tools) and in Node (module.exports).
   Depends on CG.color and CG.engine (for paint lines, finishes and primers).

   Roller naps follow the brands' own guides (Benjamin Moore, Sherwin-Williams, Valspar): the rougher the surface,
   the longer the nap. Coverage figures are the usual label numbers: about 350 sq ft per gallon of paint on smooth
   walls, 150 sq ft per quart of interior oil stain, and 200 to 250 sq ft per gallon for a first coat of deck stain. */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const C = root.CG && root.CG.color ? root.CG.color : (isNode ? require('./color.js') : null);
  const E = root.CG && root.CG.engine ? root.CG.engine : (isNode ? require('./engine.js') : null);

  // ---------------- what the tool goes on ----------------
  // Every paint job (engine SPACES) and stain job (stain JOBS) lands on one of these.
  const CLASSES = {
    walls: { label: 'Walls', big: true },
    ceiling: { label: 'Ceiling', big: true, overhead: true },
    trim: { label: 'Trim & Baseboards', detail: true },
    doors: { label: 'Doors', detail: true },
    cabinets: { label: 'Cabinets', detail: true, smooth: true },
    furniture: { label: 'Furniture', detail: true, smooth: true },
    wainscot: { label: 'Wainscoting & Beadboard', detail: true },
    masonry: { label: 'Brick or Stone', rough: true },
    floor: { label: 'Floor', big: true, floor: true },
    siding: { label: 'Siding', big: true, outside: true },
    ext_trim: { label: 'Outside Trim', detail: true, outside: true },
    xdoor: { label: 'Front Door', detail: true, outside: true, smooth: true },
    shutters: { label: 'Shutters', detail: true, outside: true },
    gdoor: { label: 'Garage Door', big: true, outside: true },
    // staining
    floor_stain: { label: 'Wood Floor', big: true, floor: true, stain: true },
    stairs_stain: { label: 'Stairs & Railings', detail: true, stain: true },
    cabinets_stain: { label: 'Cabinets', detail: true, stain: true },
    furniture_stain: { label: 'Furniture', detail: true, stain: true },
    trim_stain: { label: 'Trim & Doors', detail: true, stain: true },
    paneling_stain: { label: 'Paneling', big: true, stain: true },
    deck: { label: 'Deck', big: true, floor: true, outside: true, stain: true },
    fence: { label: 'Fence', big: true, outside: true, stain: true, rough: true },
    siding_stain: { label: 'Siding', big: true, outside: true, stain: true },
    log: { label: 'Log Walls', big: true, outside: true, stain: true, rough: true },
    door_stain: { label: 'Wood Door', detail: true, outside: true, stain: true },
    outdoor_stain: { label: 'Outdoor Wood', detail: true, outside: true, stain: true },
  };
  const ROOMS = ['living', 'bedroom', 'kitchen', 'bathroom', 'powder', 'dining', 'office', 'kids', 'nursery', 'entry', 'stairs', 'laundry', 'closet', 'sunroom', 'basement', 'attic', 'media', 'garage', 'accent'];
  const PAINT_CLASS = { ceiling: 'ceiling', trim: 'trim', doors: 'doors', cabinets: 'cabinets', builtins: 'cabinets', furniture: 'furniture', wainscot: 'wainscot', fireplace: 'masonry', floor_paint: 'floor', porch_floor: 'floor', ext_body: 'siding', shed: 'siding', ext_trim: 'ext_trim', front_door: 'xdoor', shutters: 'shutters', garage_door: 'gdoor' };
  const STAIN_CLASS = { floors: 'floor_stain', stairs: 'stairs_stain', cabinets: 'cabinets_stain', builtins: 'cabinets_stain', furniture: 'furniture_stain', tabletop: 'furniture_stain', trim: 'trim_stain', doors: 'trim_stain', paneling: 'paneling_stain', deck: 'deck', dock: 'deck', fence: 'fence', siding: 'siding_stain', shed: 'siding_stain', shutters: 'siding_stain', log: 'log', front_door: 'door_stain', garage_door: 'door_stain', outdoor: 'outdoor_stain', playset: 'outdoor_stain', pergola: 'outdoor_stain' };
  function classOf(job) {
    if (job.kind === 'stain') return STAIN_CLASS[job.target] || 'furniture_stain';
    if (ROOMS.includes(job.space)) return 'walls';
    return PAINT_CLASS[job.space] || 'walls';
  }

  // ---------------- how rough is it ----------------
  const TEXTURES = {
    smooth: { label: 'Smooth', sub: 'Flat and even, like a door or new drywall' },
    light: { label: 'A Little Texture', sub: 'Orange peel walls, wood grain, old paint' },
    rough: { label: 'Very Rough', sub: 'Popcorn ceiling, stucco, brick, rough-sawn wood' },
  };
  // the usual texture when nobody says: most walls have a light texture, brick and stucco are rough
  function textureFor(job) {
    if (job.texture && TEXTURES[job.texture]) return job.texture;
    const cls = CLASSES[classOf(job)];
    if (job.kind !== 'stain' && job.space === 'ext_body') return { brick: 'rough', stucco: 'rough', shake: 'rough', vinyl: 'smooth', fiber: 'smooth' }[job.siding] || 'light';
    if (job.surface === 'masonry' || cls.rough) return 'rough';
    if (cls.smooth || job.surface === 'laminate' || job.surface === 'mdf' || job.surface === 'metal' || job.surface === 'fiberglass') return 'smooth';
    return 'light';
  }

  // ---------------- the paint or stain going on ----------------
  // latex: water-based wall paint; enamel: water-based alkyd/urethane enamel; oil: oil-based paint;
  // floor: porch & floor paint; stain_oil / stain_water / gel: interior stain; ext_semi / ext_solid: outdoor stain
  const PRODUCTS = {
    latex: 'Water-based (latex) paint', enamel: 'Water-based enamel', oil: 'Oil-based paint', floor: 'Porch & floor paint',
    stain_oil: 'Oil-based wood stain', stain_water: 'Water-based wood stain', gel: 'Gel stain', ext_semi: 'Semi-transparent exterior stain', ext_solid: 'Solid-color exterior stain',
  };
  function productFor(job) {
    if (job.product && PRODUCTS[job.product]) return job.product;
    const cls = classOf(job);
    if (job.kind === 'stain') {
      if (CLASSES[cls].outside) return job.solid ? 'ext_solid' : 'ext_semi';
      if (job.stainType === 'gel') return 'gel';
      if (job.stainType === 'water') return 'stain_water';
      return 'stain_oil';
    }
    if (cls === 'floor') return 'floor';
    if (['trim', 'doors', 'cabinets', 'furniture', 'wainscot'].includes(cls)) return 'enamel';
    return 'latex';
  }
  const isOil = p => p === 'oil' || p === 'stain_oil' || p === 'gel';

  // ---------------- rollers and brushes ----------------
  const NAP = { '3/16': '3/16 inch', '1/4': '1/4 inch', '3/8': '3/8 inch', '1/2': '1/2 inch', '3/4': '3/4 inch', '1': '1 inch', '1-1/4': '1¼ inch' };
  // nap index: 0 = 3/16, 1 = 1/4, 2 = 3/8, 3 = 1/2, 4 = 3/4, 5 = 1, 6 = 1-1/4
  const NAPS = ['3/16', '1/4', '3/8', '1/2', '3/4', '1', '1-1/4'];
  const shiny = sheen => ['semigloss', 'gloss', 'satin'].includes(sheen);

  function applicators(job) {
    const cls = classOf(job), info = CLASSES[cls] || CLASSES.walls;
    const tex = textureFor(job), prod = productFor(job), oil = isOil(prod);
    const sheen = job.sheen || '';
    const brushFiber = oil ? 'Natural (China) bristle' : 'Nylon/polyester';
    const brushWhy = oil ? 'Natural bristle is made for oil-based products. Water-based brushes go limp in them.' : 'Synthetic bristle keeps its shape in water-based products. Natural bristle goes limp in them.';
    const out = { roller: null, brush: null, other: [], tips: [] };
    const roller = (nap, width, cover, why, extra) => Object.assign({ nap: NAP[nap], napId: nap, width, cover, why }, extra || {});
    const brush = (shape, size, why) => ({ shape, size, fiber: brushFiber, why: why + ' ' + brushWhy });
    // pick a nap from the texture, one step shorter for shiny finishes on smooth work
    const napBy = (smooth, light, rough) => NAPS[Math.max(0, (tex === 'rough' ? rough : tex === 'light' ? light : smooth) - (tex === 'smooth' && shiny(sheen) && smooth > 1 ? 1 : 0))];

    if (cls === 'walls') {
      const nap = napBy(2, 3, 4);
      out.roller = roller(nap, '9 inch', oil ? 'Lambswool or natural blend' : 'Woven or microfiber, lint-free', tex === 'rough' ? 'A long nap reaches into deep texture so no spots are missed.' : tex === 'light' ? 'Holds plenty of paint and gets into light texture without heavy stipple.' : 'The all-round wall nap: smooth finish with good paint pickup.', { pole: true });
      out.brush = brush('Angled sash', '2 to 2½ inch', 'For cutting in along the ceiling, corners and trim.');
      out.other.push({ name: 'Corner roller or edger pad', why: 'Optional: paints right into corners and along the ceiling line.' });
    } else if (cls === 'ceiling') {
      const nap = tex === 'rough' ? '3/4' : tex === 'light' ? '1/2' : '3/8';
      out.roller = roller(nap, '9 inch', 'Shed-resistant woven', 'Ceiling naps hold more paint and drip less overhead.', { pole: true });
      out.brush = brush('Angled sash', '2½ inch', 'For cutting in where the ceiling meets the walls.');
      if (tex === 'rough') out.tips.push('Popcorn ceilings can loosen when wet. Test a small spot first, roll once in one direction, or spray it.');
    } else if (cls === 'trim') {
      out.brush = brush('Angled sash', '2 inch (2½ inch for wide trim)', 'Lays a smooth line on baseboards, casing and crown.');
      out.roller = roller('1/4', '4 inch mini', oil ? 'Mohair or fine natural blend' : 'High-density foam or fine microfiber', 'Optional for wide flat trim: lays enamel on fast, then tip it off with the brush.');
    } else if (cls === 'doors') {
      out.roller = roller(shiny(sheen) ? '3/16' : '1/4', '4 to 6 inch mini', oil ? 'Mohair' : 'High-density foam or fine microfiber', 'Gives doors a smooth, factory-like finish with few roller marks.');
      out.brush = brush('Angled sash', '2 inch', 'For the panel edges and door edges.');
      out.tips.push('Paint panel doors in order: panels, then the middle rails, then the outer stiles.');
    } else if (cls === 'cabinets' || cls === 'furniture') {
      out.roller = roller('3/16', '4 inch mini', oil ? 'Mohair' : 'High-density foam or fine microfiber', 'Short, dense covers leave the smoothest enamel finish on flat doors and sides.');
      out.brush = brush('Angled sash', cls === 'furniture' ? '1½ to 2 inch' : '2 inch', 'For profiles, edges and the grooves around panels.');
      out.other.push({ name: 'HVLP paint sprayer', why: 'Optional: gives the smoothest finish on a whole kitchen of doors. Takes more masking.' });
    } else if (cls === 'wainscot') {
      out.brush = brush('Angled sash', '2 inch', 'Works paint into beadboard grooves before rolling.');
      out.roller = roller('3/8', '4 to 6 inch mini', 'Woven or microfiber', 'Rolls the flat boards after the grooves are brushed.');
    } else if (cls === 'masonry') {
      out.roller = roller(tex === 'smooth' ? '3/4' : '1', '9 inch', 'Synthetic masonry cover', 'A thick nap pushes paint into brick, mortar joints and stone.');
      out.brush = { shape: 'Flat masonry brush', size: '3 to 4 inch', fiber: 'Stiff nylon/polyester', why: 'Stiff bristles work paint into the mortar lines the roller misses.' };
    } else if (cls === 'floor') {
      out.roller = roller(tex === 'rough' ? '1/2' : '3/8', '9 inch (18 inch for big floors)', 'Shed-resistant woven', 'Lays an even coat of floor paint without fuzz in the finish.', { pole: true });
      out.brush = brush('Flat', '3 inch', 'For edges along the walls and steps.');
      out.tips.push('Start in the far corner and work toward the door so you don’t paint yourself in.');
    } else if (cls === 'siding' || cls === 'gdoor') {
      const nap = cls === 'gdoor' ? '3/8' : tex === 'rough' ? (job.siding === 'brick' || job.siding === 'stucco' ? '1-1/4' : '3/4') : tex === 'light' ? '1/2' : '3/8';
      out.roller = roller(nap, '9 inch', 'Exterior woven synthetic', cls === 'gdoor' ? 'Rolls the flat panels quickly; the brush gets the grooves.' : 'Matched to the siding: longer naps for shakes, stucco and brick.', { pole: cls !== 'gdoor' });
      out.brush = brush('Flat', '4 inch', cls === 'gdoor' ? 'For the grooves between panels.' : 'Back-brushes the bottom edge of each lap board, where rollers can’t reach.');
      if (cls === 'siding') out.other.push({ name: 'Airless sprayer', why: 'Optional for a whole house. Spray, then back-roll or back-brush for the best bond.' });
    } else if (cls === 'ext_trim') {
      out.brush = brush('Angled sash', '2½ inch', 'For window trim, corner boards and fascia edges.');
      out.roller = roller('3/8', '4 to 6 inch mini', 'Exterior woven synthetic', 'Optional for long fascia and frieze boards.');
    } else if (cls === 'xdoor') {
      out.roller = roller(shiny(sheen) ? '3/16' : '1/4', '4 inch mini', oil ? 'Mohair' : 'High-density foam', 'Short, dense covers give a front door a smooth, glossy finish.');
      out.brush = brush('Angled sash', '2 inch', 'For panel edges and molding.');
      out.tips.push('Take the hardware off, or tape it well, and paint in the morning so the door can be closed by evening.');
    } else if (cls === 'shutters') {
      out.brush = brush('Angled sash', '1½ to 2 inch', 'Reaches between louvers.');
      out.roller = roller('1/4', '4 inch mini', 'High-density foam', 'For flat panel or board-and-batten shutters.');
      out.other.push({ name: 'Paint sprayer', why: 'Optional: by far the fastest way to coat louvered shutters. Take them down first.' });
    } else if (cls === 'floor_stain') {
      out.other.push({ name: prod === 'stain_water' ? 'Synthetic stain pad on a pole' : 'Lint-free cotton rags or a stain applicator pad', why: 'Wipe stain on, wait a few minutes, then wipe off the extra with the grain.' });
      out.other.push({ name: 'Lambswool or microfiber floor applicator', why: 'For the polyurethane topcoat: pulls finish across the floor in thin, even coats.' });
      out.brush = brush('Flat', '3 inch', 'For edges along the baseboards and in corners.');
      out.tips.push('Work in sections about 3 boards wide, keeping a wet edge so lap lines don’t show.');
    } else if (cls === 'stairs_stain' || cls === 'trim_stain' || cls === 'cabinets_stain' || cls === 'furniture_stain' || cls === 'paneling_stain') {
      out.other.push({ name: prod === 'gel' ? 'Foam brush or lint-free rag' : 'Lint-free cotton rags or foam brushes', why: prod === 'gel' ? 'Gel stain goes on thick and wipes off with the grain.' : 'Wipe stain on, let it soak in, then wipe off the extra with the grain.' });
      out.brush = brush('Flat', cls === 'paneling_stain' ? '3 inch' : '2 inch', 'For the clear topcoat (polyurethane), and for corners and profiles.');
      if (cls === 'stairs_stain') out.tips.push('Do every other tread, or stain the treads in two halves, so the stairs stay usable.');
    } else if (cls === 'deck') {
      out.other.push({ name: 'Stain pad applicator on a pole', why: 'Covers deck boards quickly and evenly without bending over.' });
      out.roller = roller(tex === 'rough' ? '3/4' : '1/2', '9 inch', 'Exterior woven synthetic', 'Fast on deck boards. Back-brush so stain soaks in and doesn’t puddle.', { pole: true });
      out.brush = { shape: 'Stain brush', size: '4 inch', fiber: prod === 'ext_semi' && job.oilStain ? 'Natural bristle' : 'Synthetic', why: 'For railings, balusters, stairs and working stain into gaps between boards.' };
      out.tips.push('Stain 2 or 3 boards at a time from end to end so lap marks don’t show.');
    } else if (cls === 'fence' || cls === 'siding_stain' || cls === 'log') {
      out.roller = roller(cls === 'log' ? '1' : '3/4', '9 inch', 'Exterior woven synthetic', 'A thick nap carries stain into rough-sawn and weathered wood.');
      out.brush = { shape: 'Stain brush', size: '4 to 5 inch', fiber: 'Synthetic or natural blend', why: cls === 'log' ? 'Works stain into checks and the joints between logs.' : 'Back-brushes stain into the grain and edges after rolling or spraying.' };
      out.other.push({ name: 'Pump sprayer', why: 'The fastest way to stain a fence or siding. Back-brush right after spraying.' });
    } else if (cls === 'door_stain' || cls === 'outdoor_stain') {
      out.brush = brush('Flat', '2 to 3 inch', cls === 'door_stain' ? 'For panels and the spar urethane topcoat.' : 'For posts, slats and spindles.');
      out.other.push({ name: 'Lint-free rags', why: 'Wipe off extra stain and reach round spindles and slats.' });
    }
    return out;
  }

  // ---------------- what else to grab ----------------
  function supplies(job) {
    const cls = classOf(job), info = CLASSES[cls] || CLASSES.walls, prod = productFor(job), oil = isOil(prod);
    const list = [];
    const add = (name, why) => { if (!list.some(x => x.name === name)) list.push({ name, why }); };
    const issues = job.issues || [];
    if (!info.stain) {
      add('Roller frame, tray and liners', 'Liners make cleanup fast and let you switch colors.');
      if (info.big && !info.outside) add('Drop cloths', 'Canvas stays put on floors better than plastic.');
      if (cls === 'walls' || cls === 'ceiling' || cls === 'wainscot') add('Painter’s tape', 'Along trim and the ceiling line for clean edges.');
      if (cls === 'walls' || cls === 'ceiling') add('Spackle and a putty knife', 'Fill nail holes and dings before painting.');
      if (['walls', 'ceiling', 'floor'].includes(cls) || info.outside) add('Extension pole', 'Reaches ceilings and tall walls from the floor.');
      if (['trim', 'doors', 'wainscot', 'ext_trim'].includes(cls)) add('Paintable acrylic caulk', 'Fills gaps between trim and walls for a crisp, finished look.');
      if (['cabinets', 'furniture', 'doors', 'trim', 'xdoor', 'shutters'].includes(cls)) {
        add('Degreasing cleaner (TSP substitute)', 'Paint won’t stick to grease and hand oils.');
        add('Sanding sponges, 120 and 220 grit', '120 to scuff the old finish, 220 to smooth between coats.');
        add('Tack cloth', 'Picks up sanding dust before each coat.');
      }
      if (cls === 'cabinets' || cls === 'furniture') add('Screwdriver and painter’s pyramids', 'Take off doors and hardware, and prop doors up to paint both sides.');
      if (cls === 'masonry') add('Stiff scrub brush', 'Clean soot and dust off brick before priming.');
      if (cls === 'floor') { add('Concrete cleaner and degreaser', 'Floor paint fails on oily or dusty concrete.'); add('Knee pads', 'For cutting in along the edges.'); }
      if (info.outside) {
        add('Scraper and wire brush', 'Remove loose and peeling paint first.');
        add('Exterior caulk', 'Seal gaps around windows, doors and trim so water stays out.');
        add('Ladder', 'Check it’s rated for your weight plus your supplies.');
      }
      if (issues.includes('mildew')) add('Mildew cleaner', 'Kill mildew before painting or it grows back through the paint.');
      if (oil) add('Mineral spirits', 'Cleans brushes and drips from oil-based paint.');
    } else {
      if (!info.outside) {
        add('Sandpaper: 120, 150 and 180 grit', 'Sand bare wood up through the grits for even stain.');
        add('Pre-stain wood conditioner', 'Stops blotching on pine, maple, birch and cherry.');
        add('Tack cloth', 'Removes sanding dust right before staining.');
        add('Clear topcoat (polyurethane)', cls === 'floor_stain' || cls === 'stairs_stain' ? 'Floors need 2 to 3 coats of floor polyurethane to stand up to feet.' : 'Stain colors the wood; a clear coat protects it.');
        add('Fine sanding pad (220 to 320 grit)', 'Lightly sand between topcoats for a smooth finish.');
        add('Nitrile gloves', 'Stain stains skin, too.');
        if (oil) add('Mineral spirits', 'Cleans brushes and wipes up drips of oil-based stain.');
      } else {
        add('Deck and siding cleaner or brightener', 'Clean, brightened wood takes stain far more evenly.');
        add('Stiff scrub brush', 'Works the cleaner into the grain.');
        add('Garden pump sprayer', 'Puts cleaner on evenly.');
        add('Plastic sheeting', 'Covers plants, siding and stone from overspray.');
        add('Nitrile gloves', 'Stain stains skin, too.');
      }
    }
    add('Stir sticks and rags', 'Stir well, and keep a damp rag handy for drips.');
    return list;
  }

  // safety notes that always apply to a product
  function safety(job) {
    const prod = productFor(job), out = [];
    if (isOil(prod) || prod === 'ext_semi' || prod === 'ext_solid') out.push('Rags soaked with oil-based stain or finish can catch fire on their own. Lay them flat outside to dry, or keep them in a sealed metal can filled with water.');
    if (isOil(prod)) out.push('Open windows and use a fan. Oil-based products give off strong fumes.');
    return out;
  }

  // ---------------- how much to buy ----------------
  const SIZES = {
    room: { small: { label: 'Small', sub: 'About 10 × 10 ft', l: 10, w: 10, h: 8, doors: 1, windows: 1 }, medium: { label: 'Medium', sub: 'About 12 × 14 ft', l: 14, w: 12, h: 8, doors: 1, windows: 2 }, large: { label: 'Large', sub: 'About 16 × 20 ft', l: 20, w: 16, h: 9, doors: 2, windows: 3 } },
    house: { small: { label: 'Small House', sub: 'About 1,000 sq ft home', area: 1300 }, medium: { label: 'Medium House', sub: 'About 2,000 sq ft home', area: 2100 }, large: { label: 'Large House', sub: 'About 3,000 sq ft home', area: 2900 } },
    deck: { small: { label: 'Small Deck', sub: 'About 10 × 12 ft', area: 120 }, medium: { label: 'Medium Deck', sub: 'About 12 × 16 ft', area: 192 }, large: { label: 'Large Deck', sub: 'About 16 × 24 ft', area: 384 } },
    fence: { small: { label: 'Short Run', sub: 'About 50 ft of fence', len: 50 }, medium: { label: 'Medium Yard', sub: 'About 120 ft of fence', len: 120 }, large: { label: 'Large Yard', sub: 'About 200 ft of fence', len: 200 } },
    kitchen: { small: { label: 'Small', sub: 'A bath vanity or a few cabinets', area: 60 }, medium: { label: 'Medium', sub: 'A small kitchen, about 20 doors and drawers', area: 160 }, large: { label: 'Large', sub: 'A big kitchen, about 35 doors and drawers', area: 280 } },
    piece: { small: { label: 'Small Piece', sub: 'A chair or side table', area: 25 }, medium: { label: 'Medium Piece', sub: 'A dresser or coffee table', area: 60 }, large: { label: 'Large Piece', sub: 'A dining set or big bookcase', area: 130 } },
  };
  // which size list a job uses
  function sizeKind(job) {
    const cls = classOf(job);
    if (cls === 'siding' || cls === 'siding_stain' || cls === 'log' || cls === 'ext_trim') return 'house';
    if (cls === 'deck') return 'deck';
    if (cls === 'fence') return 'fence';
    if (cls === 'cabinets' || cls === 'cabinets_stain') return 'kitchen';
    if (cls === 'furniture' || cls === 'furniture_stain' || cls === 'outdoor_stain') return 'piece';
    return 'room';
  }
  // gallons -> what to put in the cart: quarts for small jobs, gallons, and 5-gallon buckets for big ones
  function containers(gal) {
    // coverage figures are rounded anyway, so a tenth of a quart over (about 3 oz) doesn't mean another can
    const q = Math.max(1, Math.ceil(gal * 4 - 0.1));
    if (q <= 2) return [{ n: q, size: 'quart' }];
    let g = Math.floor(q / 4), rq = q % 4;
    if (rq >= 3) { g += 1; rq = 0; }
    const out = [];
    const buckets = Math.floor(g / 5);
    if (buckets) { out.push({ n: buckets, size: '5-gallon bucket' }); g -= buckets * 5; }
    if (g) out.push({ n: g, size: 'gallon' });
    if (rq) out.push({ n: rq, size: 'quart' });
    return out;
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const cartText = list => list.map(x => plural(x.n, x.size)).join(' + ');

  // area for one coat, in square feet, plus what the numbers mean
  function areaFor(job, size) {
    const kind = sizeKind(job), cls = classOf(job);
    const s = typeof size === 'object' && size ? size : (SIZES[kind][size] || SIZES[kind].medium);
    if (kind === 'room') {
      const l = +s.l || 12, w = +s.w || 12, h = +s.h || 8, doors = s.doors != null ? +s.doors : 1, windows = s.windows != null ? +s.windows : 1;
      const walls = Math.max(0, 2 * (l + w) * h - doors * 20 - windows * 15);
      const floor = l * w;
      if (cls === 'ceiling' || cls === 'floor' || cls === 'floor_stain') return { area: floor, what: `${Math.round(floor)} sq ft of ${cls === 'ceiling' ? 'ceiling' : 'floor'}` };
      if (cls === 'trim' || cls === 'trim_stain') { const lf = 2 * (l + w) + doors * 17 + windows * 14; return { area: lf * 0.5, what: `About ${Math.round(lf)} ft of baseboard and casing` }; }
      if (cls === 'doors') { const n = Math.max(1, doors); return { area: n * 42, what: `${plural(n, 'door')}, both sides` }; }
      if (cls === 'wainscot' || cls === 'paneling_stain') { const a = cls === 'wainscot' ? 2 * (l + w) * 3.5 - doors * 9 : walls; return { area: Math.max(0, a), what: `About ${Math.round(a)} sq ft of ${cls === 'wainscot' ? 'lower wall' : 'paneling'}` }; }
      if (cls === 'masonry') return { area: 60, what: 'A typical fireplace surround, about 60 sq ft' };
      if (cls === 'stairs_stain') return { area: 90, what: 'A flight of about 13 treads with railings' };
      if (cls === 'xdoor' || cls === 'door_stain') return { area: 42, what: 'One door, both sides' };
      if (cls === 'shutters') return { area: 60, what: 'About 4 pairs of shutters' };
      if (cls === 'gdoor') return { area: 130, what: 'A two-car garage door, outside face' };
      if (job.space === 'accent') { const a = Math.max(l, w) * h; return { area: a, what: `One wall, about ${Math.round(a)} sq ft` }; }
      return { area: walls, what: `About ${Math.round(walls)} sq ft of wall (${l} × ${w} ft, ${h} ft high, less doors and windows)` };
    }
    if (kind === 'fence') { const len = +s.len || 100, h = +s.h || 6; const sides = s.sides || 2; return { area: len * h * sides, what: `${len} ft of ${h} ft fence, ${sides === 2 ? 'both sides' : 'one side'}` }; }
    const area = +s.area || 100;
    if (kind === 'house' && cls === 'ext_trim') return { area: area * 0.12, what: 'Trim on a house that size' };
    if (kind === 'deck') return { area: area * 1.45, what: `${area} sq ft of deck plus railings and stairs` };
    return { area, what: `About ${Math.round(area)} sq ft` };
  }

  // coverage per gallon for one coat
  function coverageFor(job, tex) {
    const prod = productFor(job), cls = classOf(job);
    if (prod === 'stain_oil' || prod === 'stain_water' || prod === 'gel') return 600;      // about 150 sq ft per quart
    if (prod === 'ext_semi') return tex === 'rough' ? 150 : 200;
    if (prod === 'ext_solid') return tex === 'rough' ? 200 : 300;
    if (cls === 'masonry') return 200;
    if (prod === 'floor') return 300;
    return tex === 'rough' ? 250 : tex === 'light' ? 325 : 350;
  }

  function amount(job, size, coats) {
    const tex = textureFor(job), prod = productFor(job);
    const { area, what } = areaFor(job, size);
    const cover = coverageFor(job, tex);
    coats = coats || (prod === 'ext_semi' ? 2 : 2);
    // exterior stain: the second coat goes on wet and takes about half as much
    const coatFactor = prod === 'ext_semi' ? 1.5 : coats;
    const gal = area * coatFactor / cover;
    const cart = containers(gal);
    const out = { area: Math.round(area), what, coats, coverage: cover, gallons: Math.round(gal * 100) / 100, cart, buy: cartText(cart) };
    // a primer coat and a clear coat get their own lines
    if (job.primer) { const pg = area / (tex === 'rough' ? 200 : 300); out.primer = cartText(containers(pg)); }
    if (CLASSES[classOf(job)].stain && !CLASSES[classOf(job)].outside) {
      const topCoats = CLASSES[classOf(job)].floor || classOf(job) === 'stairs_stain' ? 3 : 2;
      out.topcoat = cartText(containers(area * topCoats / 500));
      out.topcoatCoats = topCoats;
    }
    return out;
  }

  // ---------------- which paint to buy ----------------
  // The questionnaire's answers: what's being painted, what it is, how rough, what's on it now, what color it's
  // going, anything wrong with it, kids or pets, what matters most and how big. Returns a shopping list.
  const GOING = {
    light: { label: 'A Light Color', sub: 'Whites, creams, pale grays', hex: 'E6E1D6' },
    mid: { label: 'A Medium Color', sub: 'Greige, sage, soft blue', hex: 'A89F8F' },
    dark: { label: 'A Dark Color', sub: 'Navy, charcoal, deep green', hex: '2F3B45' },
    bright: { label: 'A Bright Color', sub: 'Red, orange, yellow, bold blue', hex: 'C8452F' },
  };
  const PRIORITIES = {
    value: { label: 'Best Price', sub: 'A solid paint that costs less', tier: 1 },
    balanced: { label: 'Good Balance', sub: 'Durable and easy to use', tier: 2 },
    best: { label: 'Best Quality', sub: 'Lasts longest, covers best, often one coat', tier: 3 },
  };
  function pseudoColor(hex) {
    const lab = C.hexToLab(hex), lch = C.labToLch(lab);
    return { hex, L: lab[0], C: lch[1], lrv: C.lrvFromHex(hex) };
  }
  // the finish: the job's own recommendation, nudged by kids and pets, rough walls and shine preference
  function finishFor(a) {
    const sp = E.SPACES[a.space] || E.SPACES.living;
    const order = E.SHEENS.map(s => s.id);
    let pick = sp.sheens[0];
    const why = [];
    const idx = id => order.indexOf(id);
    if (a.kids && ['flat', 'matte'].includes(pick) && sp.kind === 'interior' && !sp.surface) { pick = 'eggshell'; why.push('Eggshell wipes clean after kids and pets'); }
    if (textureFor({ kind: 'paint', space: a.space, texture: a.texture, siding: a.siding, surface: a.surface }) === 'rough' && idx(pick) > idx('eggshell') && !sp.surface) { pick = 'matte'; why.push('A lower sheen hides rough texture'); }
    if (a.flaws && !sp.surface && idx(pick) > idx('matte')) { pick = sp.kind === 'exterior' ? 'flat' : 'matte'; why.push('A low sheen hides dents and patches'); }
    if (!why.length) why.push(`The usual finish for ${sp.label.toLowerCase()}: ${sp.sheen}`);
    const s = E.SHEENS.find(x => x.id === pick) || E.SHEENS[2];
    return { id: s.id, name: s.name, why: why[0], sheen: s, alts: sp.sheens.filter(x => x !== s.id).map(id => (E.SHEENS.find(x => x.id === id) || {}).name).filter(Boolean) };
  }
  // the paint line from each brand that suits the job at the wanted price level
  function linesFor(a, ctx) {
    ctx = ctx || {};
    const color = a.going && GOING[a.going] ? pseudoColor(GOING[a.going].hex) : null;
    const en = ctx.brands || {};
    const tier = (PRIORITIES[a.priority] || PRIORITIES.balanced).tier;
    let ids = Object.keys(E.PAINT_LINES).filter(id => en[id] !== false && (!ctx.known || ctx.known(id)));
    if (ctx.storeBrand && E.PAINT_LINES[ctx.storeBrand]) ids = [ctx.storeBrand].concat(ids.filter(x => x !== ctx.storeBrand));
    if (ctx.storeOnly && ctx.storeBrand) ids = ids.slice(0, 1);
    const out = [];
    for (const id of ids) {
      const r = E.recommendLines(id, color, a, { lines: ctx.lines });
      if (!r.best) continue;
      // the line at the wanted price level, else the nearest one that suits the job
      const pickT = r.byTier.find(x => x.line.tier === tier) || r.byTier.slice().sort((x, y) => Math.abs(x.line.tier - tier) - Math.abs(y.line.tier - tier))[0] || r.best;
      out.push({ brand: id, line: pickT.line, why: pickT.why, tiers: r.byTier.map(x => x.line) });
      if (out.length >= (ctx.max || 3)) break;
    }
    return out;
  }
  function paintPlan(a, ctx) {
    a = Object.assign({}, E.DEFAULT_ANSWERS, a || {});
    ctx = ctx || {};
    const sp = E.SPACES[a.space] || E.SPACES.living;
    const job = { kind: 'paint', space: a.space, surface: a.surface, texture: a.texture, siding: a.siding, issues: a.issues };
    const finish = finishFor(a);
    job.sheen = finish.id;
    const color = a.going && GOING[a.going] ? pseudoColor(GOING[a.going].hex) : null;
    const primer = E.primerFor(a, color, { brands: ctx.brands, storeBrand: ctx.storeBrand });
    job.primer = !!primer.need;
    const prod = productFor(job);
    const lines = linesFor(a, ctx);
    const type = { latex: sp.kind === 'exterior' ? 'Exterior water-based (acrylic latex) paint' : 'Interior water-based (latex) paint', enamel: sp.kind === 'exterior' ? 'Exterior water-based enamel' : 'Water-based enamel (dries hard like oil, cleans up with water)', floor: 'Porch & floor enamel', oil: 'Oil-based paint' }[prod] || PRODUCTS[prod];
    const typeWhy = {
      latex: sp.kind === 'exterior' ? 'Stays flexible as the house heats and cools, and resists peeling and fading.' : 'Low odor, dries fast and cleans up with soap and water.',
      enamel: 'Levels out smooth and cures hard, so doors, trim and cabinets resist chips and fingerprints.',
      floor: 'Made to be walked on. Wall paint wears through on floors.',
    }[prod] || '';
    const coats = primer.coats || 2;
    const amt = amount(job, a.sizeCustom || a.size || 'medium', coats);
    return {
      answers: a, space: sp, finish, type, typeWhy, product: prod, lines, primer, coats,
      tools: applicators(job), supplies: supplies(job), amount: amt, safety: safety(job),
      cls: classOf(job), texture: textureFor(job),
    };
  }
  // the same shopping list for a stain job (products come from CG.stain)
  function stainPlan(a, products, size) {
    const job = { kind: 'stain', target: a.target, solid: a.grain === 'hide', texture: a.texture, stainType: a.stainType };
    return { tools: applicators(job), supplies: supplies(job), amount: amount(job, size || a.size || 'medium'), safety: safety(job), cls: classOf(job), products: products || [] };
  }

  // ---- the weather for outside jobs: hours of forecast -> which days are good to paint or stain ----
  const WEATHER_RULES = {
    paint: { lo: 50, hi: 90, after: 24, before: 0, what: 'paint' },
    stain: { lo: 50, hi: 90, after: 24, before: 24, what: 'stain' },
  };
  // Each day: the temperatures while working (9 to 5), the chance of rain then and for the drying time after (and
  // the day before, for stain), the night after, and the wind. Good, okay (and why), or not good (and why).
  // hours: [{ t: Date, temp (°F), rain (% chance), wind (mph) }], in order
  function weatherDays(hours, rule) {
    const H = 3600e3, days = new Map();
    for (const h of hours) { const k = h.t.toDateString(); if (!days.has(k)) days.set(k, []); days.get(k).push(h); }
    const last = hours.length ? hours[hours.length - 1].t.getTime() : 0, out = [];
    for (const hs of days.values()) {
      const work = hs.filter(h => h.t.getHours() >= 9 && h.t.getHours() < 17); if (work.length < 5) continue;
      const a = work[0].t.getTime(), b = work[work.length - 1].t.getTime() + H;
      const span = (from, to) => hours.filter(h => h.t.getTime() >= from && h.t.getTime() < to);
      const max = (list, k) => list.reduce((m, h) => Math.max(m, h[k]), 0);
      const lo = Math.min(...work.map(h => h.temp)), hi = Math.max(...work.map(h => h.temp));
      const rainNow = max(work, 'rain'), rainAfter = max(span(b, b + rule.after * H), 'rain'), rainBefore = rule.before ? max(span(a - rule.before * H, a), 'rain') : 0;
      const night = span(b, b + 14 * H), nightLo = night.length ? Math.min(...night.map(h => h.temp)) : lo, wind = max(work, 'wind');
      const bad = [], meh = [];
      if (rainNow >= 50) bad.push('Rain likely'); else if (rainNow >= 25) meh.push(`${Math.round(rainNow)}% chance of rain`);
      if (lo < rule.lo) bad.push(`Too cold (${Math.round(lo)}°)`);
      if (hi > rule.hi) bad.push(`Too hot (${Math.round(hi)}°)`);
      if (rainAfter >= 50) bad.push('Rain before it dries'); else if (rainAfter >= 25) meh.push('Some chance of rain after');
      if (rainBefore >= 50) bad.push('Wet wood from rain the day before'); else if (rainBefore >= 30) meh.push('Maybe rain the day before');
      if (!bad.length && nightLo < rule.lo - 15) meh.push(`Cold night after (${Math.round(nightLo)}°)`);
      if (wind >= 20) meh.push(`Windy (${wind} mph)`);
      if (!bad.length && b + rule.after * H > last) meh.push('Too far out to be sure');
      out.push({ day: work[0].t, lo, hi, rain: Math.max(rainNow, rainAfter), verdict: bad.length ? 'bad' : meh.length ? 'okay' : 'good', why: bad.concat(meh) });
    }
    return out.slice(0, 7);
  }

  const api = { CLASSES, TEXTURES, PRODUCTS, NAP, SIZES, GOING, PRIORITIES, WEATHER_RULES, weatherDays, classOf, textureFor, productFor, applicators, supplies, safety, sizeKind, containers, cartText, areaFor, coverageFor, amount, finishFor, linesFor, paintPlan, stainPlan };
  root.CG = root.CG || {};
  root.CG.tools = api;
  if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
