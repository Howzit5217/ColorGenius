/* ColorGenius: Quick Answers. The paint-department questions whose answer depends on the job in front of you,
   so a quick search gives a "maybe": which clear coat (it depends on what's under it and where it goes), which
   caulk or filler (what's being filled, how wide, and what goes over it), what to put on a concrete floor or wall
   (where it is and what's on it now), and whether one product can go over another. Each is one screen: tap what
   you have and the answer is there right away, with the steps, the wait times, the shopping list and the catches
   that only come from doing it. No colors here, so nothing about any brand's chips.
   CG.answers.LIST -> the four; .pick(id, picks) -> the picks made whole; .answer(id, picks) -> the answer. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CG = root.CG || {}; root.CG.answers = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // small line pictures, 32 by 32, drawn with the text color (like the Fix a Problem ones)
  const ICONS = {
    clear: '<path d="M9 11h14v15a2 2 0 01-2 2H11a2 2 0 01-2-2z"/><path d="M9 11c0-2 3.1-3 7-3s7 1 7 3"/><path d="M16 15.5c-1.6 2-2.4 3.2-2.4 4.3a2.4 2.4 0 004.8 0c0-1.1-.8-2.3-2.4-4.3z" opacity=".6"/><path d="M23 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" opacity=".55"/>',
    caulk: '<rect x="3" y="10" width="15" height="8" rx="1.5"/><path d="M18 12l7 1.5v1L18 16"/><path d="M25 14h3"/><path d="M6 10V8M10 10V8M14 10V8" opacity=".5"/><path d="M5 24c3.5 0 3.5 2 7 2s3.5-2 7-2 3.5 2 7 2" opacity=".6"/>',
    concrete: '<path d="M4 14L16 6l12 8v14H4z"/><path d="M9 28V18h14v10"/><path d="M9 21.5h14M9 25h14" opacity=".5"/>',
    over: '<path d="M16 5l12 6-12 6-12-6z"/><path d="M4 16l12 6 12-6" opacity=".7"/><path d="M4 21l12 6 12-6" opacity=".45"/>',
  };
  // the answer's one-word verdict
  const VERDICTS = { best: 'Best Pick', yes: 'Yes', prep: 'Yes, After Prep', caution: 'It Depends', no: 'No', skip: 'Not Needed', wait: 'Wait First', notyet: 'Not Yet' };
  const RAGS = 'Oily rags can catch fire on their own as they dry. Lay them flat outside to dry, or keep them in a closed metal can filled with water.';

  // ================================================================
  // CLEAR COAT TO USE
  // ================================================================
  const FIN = {
    wpoly: { head: 'Water-based polyurethane', like: 'Like Minwax Polycrylic, or any water-based polyurethane.', buy: 'Water-based polyurethane (a quart covers about 125 sq ft a coat)', water: true },
    opoly: { head: 'Oil-based polyurethane', like: 'Like Minwax Fast-Drying Polyurethane, or any oil-based polyurethane.', buy: 'Oil-based polyurethane (a quart covers about 125 sq ft a coat)' },
    wspar: { head: 'Water-based spar urethane', like: 'Spar urethane is made for outside, like Minwax Helmsman (water-based).', buy: 'Water-based spar urethane (a quart covers about 125 sq ft a coat)', water: true, out: true },
    ospar: { head: 'Oil-based spar urethane', like: 'Spar urethane is made for outside, like Minwax Helmsman Spar Urethane.', buy: 'Oil-based spar urethane (a quart covers about 125 sq ft a coat)', out: true },
    wfloor: { head: 'Water-based floor finish', like: 'One that says it’s for floors, like Minwax Ultimate Floor Finish.', buy: 'Water-based floor finish (about a gallon for every 400 to 500 sq ft, each coat)', water: true, floor: true },
    ofloor: { head: 'Oil-based floor polyurethane', like: 'One that says it’s for floors, like Minwax Super Fast-Drying Polyurethane for Floors.', buy: 'Oil-based floor polyurethane (about a gallon for every 400 to 500 sq ft, each coat)', floor: true },
  };
  const COATS = { 2: 'Put on 2 coats.', 3: 'Put on 3 coats.', 4: 'Put on 4 coats.' };
  const SPAR_WHY = 'It flexes as wood swells and shrinks, and blocks the sun. Regular polyurethane cracks and peels outside.';
  // the steps, wait and shopping list for one clear finish over what's there now
  function finishPlan(fk, p, coats, why, alt) {
    const f = FIN[fk], w = !!f.water, u = p.under, steps = [], buy = [f.buy], tips = [];
    if (u === 'bare') steps.push(f.floor ? 'Sand the floor with 120-grit, then 150. A rented floor sander makes quick work of a whole room.' : 'Sand with the grain: 150-grit, then 220.');
    else if (u === 'oilstain') steps.push('Let the stain dry at least a day (gel stain 2 to 3 days), longer when it’s cool or damp. It shouldn’t smell or feel tacky.');
    else if (u === 'waterstain') steps.push('Let the stain dry at least 2 hours, longer when it’s cool or damp.');
    else if (u === 'chalk') steps.push('Let the paint dry a day, then smooth it with a fine sanding sponge.');
    else steps.push('Let the paint dry at least a day (3 days is better), then sand very lightly with a fine sanding sponge.');
    if (u === 'oilstain' && w) steps.push('A thin coat of dewaxed shellac (like Zinsser SealCoat) over the stain helps a water-based coat go on evenly and stick.');
    steps.push(w ? 'Wipe off all the dust with a barely damp microfiber cloth. An oily tack cloth can leave a film under water-based finishes.' : 'Wipe off all the dust with a tack cloth.');
    steps.push('Stir it, don’t shake it: shaking makes bubbles that dry in the finish.');
    steps.push(f.floor ? 'Spread thin coats with a floor-finish pad, going with the boards and keeping the edge wet.' : w ? 'Brush on thin coats with a synthetic brush. Lay it on and leave it: going back over it makes bubbles and streaks.' : 'Brush on thin coats with a natural-bristle brush, going with the grain.');
    steps.push(f.floor ? 'Between coats, buff lightly with a fine sanding pad and vacuum.' : w ? 'Let each coat dry (about 2 hours), sand lightly with 220-grit, and wipe off the dust.' : 'Let each coat dry (6 to 24 hours, the can says), sand lightly with 220-grit, and wipe off the dust.');
    steps.push(COATS[coats]);
    const wait = f.out ? 'Keep rain off it for a day. Sand lightly and add a fresh coat every year or two, before it starts to peel.'
      : f.floor ? (w ? 'Socks after a day, furniture back (with felt pads) after about 3 days, rugs after 1 to 2 weeks. The can has exact times.' : 'Socks after a day, furniture back (with felt pads) after about 4 days, rugs after 2 to 4 weeks. The can has exact times.')
      : w ? 'Light use after a few days. It takes about 3 weeks to get fully hard: use coasters and don’t leave things sitting on it until then.' : 'Light use after a few days. It takes about a month to get fully hard, so go easy until then.';
    buy.push(u === 'bare' ? (f.floor ? 'Sanding discs or screens: 120 and 150 grit' : 'Sandpaper: 150 and 220 grit') : f.floor ? 'Fine sanding pad (for between coats)' : 'Fine sanding sponge (220-grit)');
    buy.push(f.floor ? 'Floor-finish applicator pad and pole' : w ? 'Synthetic brush (or foam brush)' : 'Natural-bristle brush');
    buy.push(w ? 'Microfiber cloths' : 'Tack cloth');
    if (!w) buy.push('Mineral spirits (for cleanup)');
    if (u === 'oilstain' && w) buy.push('Dewaxed shellac (optional, over the oil stain)');
    if (f.floor && p.sheen === 'gloss') tips.push('Gloss shows every scratch and footprint on a floor. Satin hides them.');
    if (f.out && (p.sheen === 'matte' || p.sheen === 'satin')) tips.push('Outside, gloss holds up longest in the sun. Satin is fine but wears a little faster.');
    if (f.out) tips.push('Not for decks or porch floors: a clear film peels where people walk. Use a deck stain there.');
    if (w && u === 'lightpaint') tips.push('Some water-based clear coats still go a little amber over white. Pick one that says non-yellowing or crystal clear, and test it on the back first.');
    if (w && u === 'darkpaint') tips.push('Over dark colors, thick coats of water-based finish can look cloudy. Keep every coat thin.');
    return { v: 'best', head: f.head, like: f.like, sheen: p.sheen, why, alt: alt || '', steps, wait, buy, tips, warn: w ? '' : RAGS };
  }
  function clearAnswer(p) {
    const on = p.on, u = p.under;
    const paint = u === 'lightpaint' || u === 'darkpaint';
    if (on === 'outside') {
      if (paint) return { v: 'skip', head: 'No clear coat over outside paint', why: 'Good exterior paint is the protection. A clear coat over it turns yellow or cloudy in the sun and peels in sheets.', steps: ['Wash it with a house wash or mild soap, rinse and let it dry.', 'When it wears, touch up or repaint with exterior paint in the same sheen.'], buy: ['House wash or mild soap', 'Exterior paint (for touch-ups)'] };
      if (u === 'chalk') return { v: 'no', head: 'Use exterior paint instead', why: 'Most chalk-style paints are made for inside and wear fast outdoors, even under a clear coat.', alt: 'If yours says it’s for outdoor use, top it with water-based spar urethane.', steps: ['Sand lightly and wipe off the dust.', 'Prime bare spots, then two coats of exterior paint.'], buy: ['Exterior paint (or a chalk-style paint made for outdoors)', 'Water-based spar urethane (over outdoor chalk-style paint)'] };
      return u === 'waterstain'
        ? finishPlan('wspar', p, 3, SPAR_WHY, 'Oil-based spar is a little tougher outside and adds a warm amber color.')
        : finishPlan('ospar', p, 3, SPAR_WHY, 'Water-based spar stays clearer and dries in hours, but needs a fresh coat sooner.');
    }
    if (on === 'floor') {
      if (u === 'chalk') return { v: 'no', head: 'Not on a floor', why: 'Chalk-style paint is too soft to walk on, even under a clear coat.', alt: 'Use a porch & floor paint instead. It needs no clear coat.', steps: ['Sand lightly and wipe off the dust.', 'Two coats of porch & floor paint.'], buy: ['Porch & floor paint'] };
      if (paint) return finishPlan('wfloor', p, 2, 'Floor paint doesn’t need one: it’s made to be walked on. Over other paint, a water-based floor finish helps it last. Oil-based would turn it yellow.');
      if (u === 'oilstain') return finishPlan('ofloor', p, 3, 'It goes right over an oil-based stain once it’s dry, wears for years and adds a warm amber glow.', 'Want it clear and quicker to dry? Water-based floor finish, once the stain has dried for a couple of days.');
      return finishPlan('wfloor', p, 3, 'Made to be walked on, much harder than furniture finishes. It dries clear in about 2 hours, with little smell.', 'For a warm amber look, oil-based floor polyurethane. It smells strong and needs a day between coats.');
    }
    if ((on === 'cabinets' || on === 'trim') && paint) return { v: 'skip', head: 'Usually none', why: 'A cabinet and trim enamel dries hard and wipes clean on its own. A clear coat over it can turn yellow and makes touch-ups harder.', alt: 'Used regular wall paint? Then 2 coats of water-based polyurethane help it stand up to hands and cleaning.', steps: ['If you used wall paint: let it dry 3 days and sand very lightly.', 'Wipe off the dust with a barely damp microfiber cloth.', 'Brush on 2 thin coats of water-based polyurethane, sanding lightly between.'], buy: ['Cabinet and trim enamel (for touch-ups)', 'Water-based polyurethane (only over wall paint)'] };
    if (u === 'chalk') return finishPlan('wpoly', p, on === 'furniture' || on === 'trim' ? 2 : 3,
      on === 'table' ? 'On a tabletop it beats wax: wax spots with water and heat, and needs redoing.' : on === 'cabinets' ? 'Cabinets get grabbed and wiped every day. Wax isn’t enough.' : 'Tougher than wax, and it never needs redoing.',
      on === 'furniture' ? 'Or wax, for a soft hand-rubbed look on pieces that aren’t handled much. It needs redoing every year or so, and only more wax sticks over it.' : '');
    if (paint) return finishPlan('wpoly', p, on === 'table' ? 3 : 2, 'It stays clear over paint. Oil-based polyurethane would turn it yellow.');
    // wood, bare or stained
    if (on === 'table') return finishPlan('opoly', p, 3, 'The toughest against hot mugs, spills and scratches, with a warm amber glow.', 'Want it to stay light, with no amber? Water-based polyurethane, with 4 coats.');
    if (on === 'furniture') return u === 'waterstain'
      ? finishPlan('wpoly', p, 2, 'It keeps the stain’s color true and dries in hours.', 'Oil-based polyurethane works over it too, with a warmer, amber look.')
      : finishPlan('opoly', p, 2, 'It brings out the grain with a warm glow and wears well.', 'Easiest smooth finish on chairs and spindles: wipe-on polyurethane, 4 to 6 thin coats with a rag.');
    const n = on === 'cabinets' ? 3 : 2;
    return u === 'oilstain'
      ? finishPlan('opoly', p, n, 'It goes right over an oil stain once it’s dry, and it’s tough.', 'Water-based works too, once the stain has dried a full day or more. A thin coat of dewaxed shellac first helps.')
      : finishPlan('wpoly', p, n, 'It stays clear, dries fast and doesn’t smell up the house while you work.', 'Oil-based polyurethane is a little tougher with a warm amber look, but slow to dry.');
  }

  // ================================================================
  // CAULK OR FILLER TO USE
  // ================================================================
  const CUT = 'Cut the tip small and at an angle. You can always cut more.';
  const BEAD = 'Run a thin, steady bead, then smooth it with a wet finger or a damp sponge.';
  const WIPE = 'Wipe off the extra right away with a damp rag.';
  const PAINT_WHEN = 'Paint once it’s dry: the tube says when (30 minutes to a day).';
  const ROD = 'Deeper than 1/4 inch? Push in foam backer rod first, so the caulk is about as deep as it is wide.';
  const GUN = 'Caulk gun', RAG = 'Damp sponge or rag', ROD_BUY = 'Foam backer rod';
  const PAINTERS = 'Painter’s caulk, white (acrylic latex with silicone)';
  const SETTING = 'For deep fills, setting-type compound (a powder marked 20, 45 or 90 minutes) hardens instead of drying, so it won’t shrink or sag.';
  const TEXTURE = 'Textured wall or ceiling? Spray texture in a can (orange peel or knockdown) blends a patch in. Practice on cardboard first.';
  const PRIME_PATCH = 'Sand smooth, then prime the patch before painting.';
  const CONC_CLEAN = 'Clean out loose bits and dust with a wire brush and a vacuum.';
  function caulkAnswer(p) {
    const what = p.what, over = p.over, size = p.size, wide = size === 'wide' || size === 'big';
    if (what === 'trim') {
      if (over === 'stain') return { v: 'best', head: 'Clear or wood-tone caulk', why: 'White caulk stands out against stained wood. Clear caulk goes on white and turns clear as it dries (a day or more); wood-tone caulk blends right away.', steps: [CUT].concat(wide ? [ROD] : [], [BEAD, WIPE, 'Keep the bead thin: thick clear caulk stays cloudy.']), buy: ['Clear or wood-tone caulk', GUN, RAG].concat(wide ? [ROD_BUY] : []) };
      if (size === 'big') return { v: 'prep', head: 'Fill it first, then caulk', why: 'Caulk alone over 1/2 inch sags and cracks. Fill most of the gap first.', steps: ['Push in foam backer rod, or glue in a thin strip of wood where it shows.', 'Caulk over it with an elastomeric caulk.', BEAD, WIPE, PAINT_WHEN], buy: ['Foam backer rod (or a thin wood strip)', 'Elastomeric caulk (paintable)', GUN, RAG] };
      if (size === 'wide') return { v: 'best', head: 'Stretchy (elastomeric) caulk', like: 'Paintable and made to stretch, like DAP Dynaflex 230.', why: 'Wider gaps move more. Elastomeric caulk stretches with them without cracking.', steps: [CUT, ROD, BEAD, WIPE, PAINT_WHEN], buy: ['Elastomeric caulk (paintable)', ROD_BUY, GUN, RAG] };
      return { v: 'best', head: 'Painter’s caulk', like: 'Acrylic latex with silicone, like DAP Alex Plus.', why: 'It’s made to be painted, cleans up with water and flexes a little as the house moves.', steps: [CUT, BEAD, WIPE, PAINT_WHEN], buy: [PAINTERS, GUN, RAG], tips: ['Gaps that open up every winter, like at crown molding? Use a stretchy elastomeric caulk instead. Regular painter’s caulk cracks.', 'Don’t use caulk for nail holes: it shrinks into them. Use spackle or wood filler.'] };
    }
    if (what === 'corner') {
      if (wide) return { v: 'best', head: 'Paper tape and joint compound', why: 'A wide corner crack needs tape to hold it. Paper tape folds neatly into a corner.', steps: ['Scrape out loose bits and old filler.', 'Spread a thin coat of joint compound on both sides of the corner.', 'Fold paper tape down the middle, press it into the corner and smooth it flat with a knife.', 'Two more thin coats once each dries, one side at a time.', PRIME_PATCH], buy: ['Paper drywall tape', 'Lightweight joint compound', 'Corner knife or 4-inch putty knife', 'Sanding sponge', 'Primer'], tips: ['If the same corner keeps cracking wide open, the house may be settling there. Worth having someone look.'] };
      return { v: 'best', head: 'Painter’s caulk', like: 'Acrylic latex with silicone, like DAP Alex Plus.', why: 'Corners move a little with the seasons. Caulk bends with them; spackle and joint compound crack again.', steps: ['Scrape out loose bits from the crack.', 'Run a thin bead into the corner and smooth it with a wet finger.', PAINT_WHEN], buy: [PAINTERS, GUN, RAG] };
    }
    if (what === 'crack') return { v: 'best', head: 'Mesh tape and joint compound', why: 'Spackle alone just cracks again. Tape holds it together.', steps: ['Brush out the crack and any loose bits.', 'Put self-adhesive mesh tape over the crack.', 'Spread a thin coat of joint compound over it with a 6-inch knife, and let it dry.', 'Add a second, wider coat, feathering the edges, and let it dry.', PRIME_PATCH], buy: ['Self-adhesive mesh drywall tape', 'Lightweight joint compound', '6-inch drywall knife', 'Sanding sponge', 'Primer'], tips: ['Plaster walls: the same steps. For deep cracks, setting-type compound (a powder you mix) holds better.', TEXTURE] };
    if (what === 'nail') {
      if (over === 'stain') return { v: 'best', head: 'Colored wood putty, after the finish', why: 'Filler put on before stain almost always comes out lighter or darker than the wood. Putty that matches, pressed in after the clear coat, disappears.', steps: ['Stain and clear-coat the wood first.', 'Press the putty in with a finger or a putty knife.', 'Wipe off the extra with a soft cloth.', 'Mix two colors if one doesn’t match.'], buy: ['Colored wood putty (or wax filler sticks) to match the stain', 'Soft cloth'] };
      return { v: 'best', head: 'Lightweight spackle', why: 'It dries in minutes, barely shrinks and sands easily.', steps: ['Press it in with a putty knife and scrape it flush.', 'Let it dry. Some go on pink and turn white when they’re ready.', 'Sand lightly flush and wipe off the dust.', 'Spot-prime the patches, or they show through the paint as dull spots.'], buy: ['Lightweight spackle', 'Putty knife', 'Fine sanding sponge', 'Primer'], tips: ['On trim, wood filler works too. Don’t use caulk in nail holes: it shrinks.'] };
    }
    if (what === 'hole') {
      if (p.hsize === 'big') return { v: 'best', head: 'A new piece of drywall', why: 'Past about 4 inches, a patch sags. Cut in a piece that fits.', steps: ['Cut the hole into a neat square.', 'Screw wood strips inside, behind the edges.', 'Cut a drywall piece to fit and screw it to the strips.', 'Tape the seams, then 2 or 3 thin coats of joint compound.', PRIME_PATCH], buy: ['Small drywall panel (the same thickness, usually 1/2 inch)', 'Drywall saw', 'Wood strips and drywall screws', 'Mesh drywall tape', 'Joint compound and a 6-inch knife', 'Sanding sponge', 'Primer'], tips: [SETTING, TEXTURE] };
      if (p.hsize === 'wide') return { v: 'best', head: 'Self-adhesive patch and joint compound', why: 'A mesh patch bridges the hole, so the compound has something to hold on to.', steps: ['Trim the edges clean.', 'Stick on a patch a little bigger than the hole.', 'Cover it with thin coats of joint compound, each one wider than the last, letting each dry.', PRIME_PATCH], buy: ['Self-adhesive drywall repair patch', 'Lightweight joint compound', '6-inch drywall knife', 'Sanding sponge', 'Primer'], tips: [SETTING, TEXTURE] };
      return { v: 'best', head: 'Lightweight spackle', why: 'Up to 1/2 inch, spackle fills it in one or two passes.', steps: ['Trim off any torn paper around the hole.', 'Fill it with a putty knife. Deep holes: two thin passes, letting the first dry.', 'Sand flush and wipe off the dust.', 'Spot-prime the patch before painting.'], buy: ['Lightweight spackle', 'Putty knife', 'Fine sanding sponge', 'Primer'], tips: [TEXTURE] };
    }
    if (what === 'tub' || what === 'counter') {
      if (over === 'paint') return { v: 'best', head: 'Paintable kitchen and bath caulk', why: what === 'tub' ? 'For where a tub or sink meets a painted wall. Siliconized acrylic can be painted; 100% silicone can’t. In the tub or shower joint itself, use 100% silicone and leave it unpainted.' : 'For where a counter meets a painted wall. It can be painted to match; silicone can’t.', steps: ['Cut and scrape out the old caulk.', 'Clean off mildew and residue, wipe with rubbing alcohol, and let it dry.'].concat(wide ? [ROD] : [], [BEAD, WIPE, PAINT_WHEN]), buy: ['Paintable kitchen and bath caulk (siliconized acrylic, with mildew protection)', 'Caulk remover or razor scraper', 'Rubbing alcohol', GUN].concat(wide ? [ROD_BUY] : []) };
      if (what === 'counter') return { v: 'best', head: '100% silicone, clear or color-matched', why: 'Waterproof, wipes clean and stays flexible where the counter meets the backsplash or sink.', steps: ['Scrape out the old caulk and clean the joint with rubbing alcohol.'].concat(wide ? [ROD] : [], ['Tape both sides of the joint, run a bead, smooth it, then pull the tape right away.', 'Keep water off it for the time on the tube.']), buy: ['100% silicone, kitchen and bath, clear or color-matched', 'Painter’s tape', 'Rubbing alcohol', GUN].concat(wide ? [ROD_BUY] : []) };
      return { v: 'best', head: '100% silicone, kitchen and bath', why: 'It stays flexible and waterproof and fights mildew. It can’t be painted.', steps: ['Cut and scrape out all the old caulk. New silicone won’t stick to old.', 'Clean off mildew and residue, wipe with rubbing alcohol, and let it dry completely.', 'Caulking a tub? Fill it with water first. The weight opens the joint, so the caulk won’t tear the first time someone takes a bath.'].concat(wide ? [ROD] : [], ['Tape both sides of the joint, run a bead, smooth it, then pull the tape right away.', 'Keep water off it for the time on the tube, often a day.']), buy: ['100% silicone caulk, kitchen and bath (with mildew protection)', 'Caulk remover or razor scraper', 'Rubbing alcohol', 'Painter’s tape', GUN].concat(wide ? [ROD_BUY] : []) };
    }
    if (what === 'outside') {
      const steps = ['Cut out loose and cracked old caulk.', 'Clean the joint and let it dry.'].concat(wide ? [ROD] : [], ['Caulk when it’s at least 40 °F and dry, with no rain coming for a day (the tube has the limits).', BEAD]);
      const tips = ['Don’t caulk the bottom edges of siding boards, or the small weep holes along the bottom of windows. They let water out.'];
      if (over === 'paint') return { v: 'best', head: 'Paintable exterior sealant', like: 'Elastomeric or polymer, like Sashco Big Stretch or DAP Dynaflex 230.', why: 'Outside joints move with heat and cold. These stretch with them for years. Cheap painter’s caulk cracks in a season.', steps: steps.concat([PAINT_WHEN]), buy: ['Paintable exterior sealant (elastomeric or polymer)', GUN, 'Utility knife or caulk remover', RAG].concat(wide ? [ROD_BUY] : []), tips };
      return { v: 'best', head: 'Exterior sealant in a matching color', why: 'For trim and windows you won’t paint. Polymer and silicone sealants last longest outside; pick a color close to the trim.', steps, buy: ['Exterior sealant in a matching color (polymer or silicone)', GUN, 'Utility knife or caulk remover', RAG].concat(wide ? [ROD_BUY] : []), tips };
    }
    if (what === 'rot') {
      if (over === 'stain') return { v: 'caution', head: 'Filler won’t look like stained wood', why: 'Fillers don’t take stain the way wood does. For stained wood, cut in a new piece of wood, or fill it and color the patch to match before the clear coat.', steps: ['Small spots: fill with stainable wood filler, sand, then match the color with stain markers and a fine brush.', 'Bigger damage: cut out the bad part and glue in a matching piece of wood, then stain it all.', 'Test the stain on the patch first.'], buy: ['Stainable wood filler (for small spots)', 'Stain touch-up markers', 'Matching wood and wood glue (for bigger damage)'] };
      return { v: 'best', head: 'Wood hardener, then two-part epoxy filler', why: 'Epoxy bonds to the wood, sets hard and doesn’t shrink, so it lasts outside. Regular wood filler crumbles out.', steps: ['Dig out the soft wood, down to solid wood.', 'Let it dry completely.', 'Brush wood hardener on what’s left, and let it soak in and harden.', 'Mix the two parts and press it in, a little higher than the surface.', 'Once it’s hard, sand or rasp it to shape.', 'Prime and paint it.'], buy: ['Wood hardener', 'Two-part epoxy wood filler', 'Putty knife', 'Rasp or sandpaper', 'Primer and paint'], tips: ['If a third or more of the board is soft, or it holds something up, replace the board instead.'] };
    }
    // concrete
    const paintTip = over === 'paint' ? ['Coating or painting the floor after? Pick a filler or sealant that says it can be painted, and wait the time on the tube.'] : [];
    if (size === 'big') return { v: 'best', head: 'Backer rod and sealant, or concrete patch', why: 'Wide joints: backer rod, then concrete sealant. Broken edges and holes: a concrete patch you trowel in.', steps: [CONC_CLEAN, 'Joints: push in foam backer rod, then run self-leveling concrete sealant over it.', 'Holes and broken edges: dampen the spot, press in concrete patch with a trowel and smooth it.', 'Keep feet and tires off for the time on the package.'], buy: [ROD_BUY, 'Self-leveling concrete sealant', 'Concrete patch (for holes and broken edges)', 'Trowel', GUN, 'Wire brush'], tips: paintTip.concat(['Cracks that keep growing, or one side higher than the other, can mean the ground is moving. Worth having someone look at it.']) };
    if (size === 'wide') return { v: 'best', head: 'Self-leveling concrete sealant', why: 'It flows flat on floors, walks and driveways, and stays flexible as the slab moves. Walls and steps take a non-sag (gun-grade) kind.', steps: [CONC_CLEAN, 'Push in foam backer rod so the sealant is about 1/4 to 1/2 inch deep.', 'Run the sealant in. It flattens out on its own.', 'Keep feet and tires off for the time on the tube.'], buy: ['Self-leveling concrete sealant', ROD_BUY, GUN, 'Wire brush'], tips: paintTip };
    return { v: 'best', head: 'Liquid concrete crack filler', why: 'Thin cracks need a filler thin enough to run down into them.', steps: [CONC_CLEAN, 'Squeeze it into the crack, slightly overfilling.', 'Smooth it, and keep feet off for the time on the bottle.'], buy: ['Concrete crack filler (liquid, for thin cracks)', 'Wire brush', 'Shop vacuum'], tips: paintTip };
  }

  // ================================================================
  // CONCRETE AND GARAGE FLOORS
  // ================================================================
  const WATER_TEST = 'Water test: sprinkle some water. It should soak in and darken the concrete. If it beads up, there’s a sealer to strip first.';
  const PLASTIC_EPOXY = 'Plastic test: tape a 2-foot square of plastic flat on the floor for a day. If it’s damp under it, don’t use epoxy.';
  const PLASTIC_FIX = 'Plastic test: tape a 2-foot square of plastic flat on the floor for a day. If it’s damp under it, fix the moisture first.';
  const NEW_WARN = 'New concrete needs about 28 days to cure before you coat, stain or seal it, or it peels and blotches.';
  const ASPHALT = 'Blacktop (asphalt) driveway? That takes a blacktop sealer, a different product.';
  const SEALER = { head: 'Penetrating concrete sealer', like: 'Silane or siloxane. It soaks in instead of sitting on top.', buy: ['Penetrating concrete sealer (silane or siloxane)', 'Concrete degreaser and cleaner', 'Pump sprayer or roller'], steps: ['Degrease oil spots and clean it, then let it dry a day.', 'Spray or roll it on, one or two coats as the can says.', 'Redo it every few years.'] };
  const WALL_STEPS = ['Fix the outside first: gutters, downspouts, and ground sloping away from the house.', 'Wire-brush off dirt, loose paint and the white powder, then scrub with a masonry cleaner and let it dry.', 'Plug holes and any trickles with hydraulic cement. It sets in minutes, even wet.', 'Brush the first coat in hard with a stiff masonry brush, into every pore.', 'Let it dry (the can says how long), then put on a second coat.'];
  const WALL_BUY = ['Masonry waterproofing paint', 'Stiff masonry brush', 'Wire brush', 'Masonry cleaner', 'Hydraulic cement (for holes and leaks)'];
  const WALL_NOTE = 'Block soaks it up: a gallon covers about 75 to 100 sq ft a coat.';
  const WALL_TIP = 'It handles damp walls and slow seepage, not running water. Water pouring in needs a drainage fix.';
  function concreteAnswer(p) {
    const w = p.where, look = p.look, now = p.now;
    if (w === 'bwall') {
      if (now === 'painted') return look === 'clear'
        ? { v: 'no', head: 'Not over paint', why: 'A clear water repellent has to soak into bare block. Over paint it can’t.', steps: ['To keep it painted: clean it, scrape what’s loose, and repaint with a masonry paint.', 'To waterproof it: strip or wire-brush the paint off, then use masonry waterproofing paint.'], buy: ['Masonry paint (to repaint)', 'Masonry waterproofing paint (on bare block)'] }
        : { v: 'prep', head: 'The old paint has to come off first', why: 'Waterproofing paint has to soak into bare block. Over paint, it only sticks to the paint and comes off with it.', steps: ['Wire-brush, scrape or strip off the old paint.'].concat(WALL_STEPS.slice(0, 1), WALL_STEPS.slice(2)), buy: ['Paint stripper or a wire wheel'].concat(WALL_BUY), note: WALL_NOTE, tips: [WALL_TIP] };
      if (look === 'clear' && now !== 'damp') return { v: 'best', head: 'Clear masonry water repellent', why: 'It keeps the look of the block and sheds dampness, but it won’t stop water seeping through. For that, use a waterproofing paint.', steps: ['Clean it with a masonry cleaner and let it dry.', 'Brush, roll or spray it on until the wall stops soaking it up.'], buy: ['Clear masonry water repellent', 'Masonry cleaner', 'Brush or pump sprayer'] };
      return { v: 'best', head: 'Masonry waterproofing paint', like: 'Like Drylok.', why: now === 'damp' && look === 'clear' ? 'A clear repellent won’t hold back a damp wall. Waterproofing paint soaks into bare block or concrete and holds back dampness and seepage.' : 'It soaks into bare block or concrete and holds back dampness and seepage. It only works on bare masonry.', steps: WALL_STEPS, buy: WALL_BUY, note: WALL_NOTE, tips: [WALL_TIP] };
    }
    if (now === 'damp') return { v: 'notyet', head: 'Fix the moisture first', why: 'Water coming up through concrete pushes coatings off. The white powder is the salt it leaves behind.', steps: ['Tape a 2-foot square of plastic flat on the floor for a day. Damp or darker under it means moisture is coming through.', 'Check gutters, downspouts and the slope of the ground. Most of the water starts there.', 'Scrub off the white powder with a stiff brush and a masonry cleaner.', 'If it stays damp, skip coatings: use a penetrating sealer, which lets it breathe, or leave it bare.'], buy: ['Plastic sheet and tape (for the test)', 'Masonry cleaner', 'Stiff brush', 'Penetrating concrete sealer'] };
    if (now === 'sealed') return look === 'clear'
      ? { v: 'yes', head: 'Reseal with the same kind of sealer', why: 'Clean it and put on the same kind that’s there: water-based over water-based, solvent-based over solvent-based. Mixing kinds can turn it cloudy or peel.', steps: ['Clean it with a concrete cleaner, rinse and let it dry a day.', 'Roll or spray on a thin coat of the same kind of sealer.', 'Keep it thin: thick coats turn white or slippery.'], buy: ['Concrete sealer (the same kind as the old one)', 'Concrete cleaner', 'Roller or pump sprayer'] }
      : { v: 'notyet', head: 'Not until the sealer is off', why: 'Water beading up means a sealer is still on it. Stain can’t soak in, and paint and epoxy peel off it.', steps: ['Strip it with a concrete sealer stripper, or have it ground.', 'Or wait: many sealers wear off outside in a year or two.', 'Then do the water test again: it should soak in and darken.'], buy: ['Concrete sealer stripper', 'Stiff brush'] };
    if (now === 'painted') {
      if (look !== 'solid') return { v: 'no', head: 'Not over paint', why: 'See-through stains and sealers need bare concrete to soak into. Strip the paint first, or paint it again.', steps: ['To keep it painted: clean it, scuff it, and repaint with porch & floor paint.', 'To go back to bare: use a concrete paint stripper, or have it ground.'], buy: ['Concrete paint stripper (to go back to bare)', 'Porch & floor paint (to repaint)'] };
      if (w !== 'drive') return { v: 'prep', head: 'The same kind of floor paint again', why: 'Over old paint that’s still stuck tight, repaint with the same kind after cleaning and scuffing. A 2-part epoxy kit needs bare concrete, so the old paint would have to be ground off first.', steps: ['Scrape off anything loose or peeling.', 'Degrease and scrub it, rinse and let it dry.', 'Scuff shiny spots with a sanding screen.', 'Two thin coats of porch & floor paint.'], buy: ['Porch & floor paint', 'Concrete degreaser', 'Scraper', 'Sanding screen or 80-grit sandpaper', 'Roller (3/8 inch nap) and a pole'] };
    }
    let a;
    if (w === 'drive') {
      a = look === 'solid'
        ? { v: 'no', head: 'Don’t paint a driveway', why: 'Tires, salt and weather peel paint and coatings off a driveway fast. A penetrating sealer protects it without peeling.', steps: SEALER.steps, buy: SEALER.buy, tips: [ASPHALT] }
        : { v: 'best', head: SEALER.head, like: SEALER.like, why: 'It soaks in and helps keep out water, salt and oil, and can’t peel under tires.', steps: SEALER.steps, buy: SEALER.buy, tips: [ASPHALT] };
    } else if (w === 'garage') {
      if (look === 'solid') a = { v: 'best', head: '2-part epoxy garage floor kit', why: 'It holds up to hot tires, oil and salt. One-part epoxy floor paint is easier and cheaper, but hot tires can lift it.', steps: [WATER_TEST, PLASTIC_EPOXY, 'Fill cracks and holes with concrete patch.', 'Scrub oil spots with a degreaser, then clean and etch the whole floor (most kits come with the etcher). After, it should feel like fine sandpaper.', 'Let it dry for at least a day.', 'Mix only what you can roll out in the kit’s working time, often an hour or two. Brush the edges, then roll.', 'Toss the color flakes on while it’s wet, if your kit has them.'], wait: 'Walk on it after about a day. Cars wait the kit’s time, often 3 to 7 days.', buy: ['2-part epoxy garage floor kit (sized for your floor)', 'Concrete degreaser', 'Concrete crack and hole patch', 'Stiff scrub brush or push broom', '9-inch roller, 3/8 inch nap (lint-free), and a pole', 'Spiked shoes (to walk on it wet)', 'Anti-slip additive (optional)'], note: 'Measure the floor (length × width). One kit usually covers about a one-car or two-car garage; the box says how many square feet.', tips: ['Check the box for temperature: most need the floor at 50 °F or warmer, and dry air. Cold or damp slows it and can make it cloudy.'] };
      else if (look === 'stain') a = { v: 'best', head: 'Concrete stain and a garage-rated sealer', why: 'Stain soaks in and won’t peel. Over it, use a clear sealer that says it’s for garages: some sealers soften and lift under hot tires.', steps: [WATER_TEST, 'Degrease oil spots and clean the floor, then let it dry a day.', 'Spray or roll on the stain in small areas so it stays even.', 'Let it dry, then put on the sealer.'], buy: ['Semi-transparent concrete stain', 'Clear sealer rated for garages or vehicle traffic', 'Concrete degreaser and cleaner', 'Pump sprayer or roller'] };
      else a = { v: 'best', head: SEALER.head, like: SEALER.like, why: 'It soaks in, keeps the concrete looking the same, and helps keep out oil, salt and water. It can’t peel, even under hot tires.', steps: SEALER.steps, buy: SEALER.buy };
    } else if (w === 'basement') {
      if (look === 'solid') a = { v: 'best', head: 'Concrete floor paint', like: '1-part epoxy floor paint or porch & floor paint.', why: 'No hot tires, so a one-part floor paint is enough, and much easier than a 2-part kit.', steps: [PLASTIC_FIX, WATER_TEST, 'Clean it with a degreaser. Etch smooth, shiny concrete so the paint grips.', 'Fill cracks with concrete patch.', 'Two thin coats with a roller.'], buy: ['1-part epoxy or porch & floor paint', 'Concrete cleaner and etcher', 'Concrete crack patch', 'Roller (3/8 inch nap) and a pole'] };
      else if (look === 'stain') a = { v: 'best', head: 'Water-based concrete stain, then a clear sealer', why: 'It colors the concrete without covering it, and it can’t peel.', steps: [PLASTIC_FIX, WATER_TEST, 'Clean it and let it dry a day.', 'Spray or roll on the stain in small areas so it stays even.', 'Seal it once it’s dry.'], buy: ['Water-based concrete stain', 'Clear concrete sealer', 'Concrete cleaner', 'Pump sprayer or roller'] };
      else a = { v: 'best', head: SEALER.head, like: SEALER.like, why: 'It soaks in, keeps the dust down, and helps keep out spills and dampness.', steps: SEALER.steps, buy: SEALER.buy };
    } else {
      if (look === 'solid') a = { v: 'best', head: 'Porch & floor paint, with anti-slip', why: 'Made for feet and weather. Skip garage epoxy outside: most turn yellow and chalky in the sun.', steps: [WATER_TEST, 'Scrub or pressure-wash it clean, and let it dry a day or two.', 'Etch smooth, troweled concrete so the paint grips.', 'Two thin coats. On steps, mix anti-slip grit into the last coat.'], wait: 'Feet after about a day, furniture after a few days. The can has exact times.', buy: ['Porch & floor paint (exterior)', 'Concrete cleaner', 'Concrete etcher (for smooth concrete)', 'Anti-slip additive (for steps)', 'Roller (3/8 to 1/2 inch nap), a pole and a stiff brush'] };
      else if (look === 'stain') a = { v: 'best', head: 'Semi-transparent concrete stain', why: 'It soaks in, so it can’t peel the way paint can. It wears slowly where people walk, and you just add more.', steps: [WATER_TEST, 'Clean it and let it dry a day or two.', 'Spray or roll on the stain in small areas so it stays even.', 'Two light coats beat one heavy one.'], buy: ['Semi-transparent concrete stain', 'Concrete cleaner', 'Pump sprayer or roller'], tips: ['A clear “wet look” sealer on top makes the color richer, but it gets slippery when wet. Add anti-slip grit to it.'] };
      else a = { v: 'best', head: SEALER.head, like: SEALER.like, why: 'It keeps the natural look and cuts down on water and freeze-thaw damage.', alt: 'Want a darker, wet look? An acrylic “wet look” sealer, but it’s slippery when wet and needs redoing every year or two.', steps: SEALER.steps, buy: SEALER.buy };
    }
    if (now === 'new' && a.v !== 'no') a = Object.assign({}, a, { v: 'wait', warn: NEW_WARN, steps: ['Wait 28 days after it’s poured.'].concat(a.steps) });
    return a;
  }

  // ================================================================
  // WILL IT GO OVER THAT?
  // ================================================================
  const CLEAN = 'Wash it with a degreaser or TSP substitute, rinse and let it dry.';
  const LOOSE = 'Scrape or sand off anything loose or peeling.';
  const SCUFF = 'Scuff-sand any shiny spots with 220-grit so the new coat can grip, and wipe off the dust.';
  const SCUFF_ALL = 'Scuff-sand the whole surface with 180 to 220-grit until the shine is gone, and wipe off the dust.';
  const TWO = 'Two coats, letting the first dry as long as the can says.';
  const TWO_OIL = 'Two coats with a natural-bristle brush.';
  const TAPE_TEST = 'Not sure it stuck? After a day, press tape on a test spot and pull it off fast. If paint comes off with it, it needs more prep.';
  const SPRAY_COATS = 'Light coats from 10 to 12 inches away, a few minutes apart.';
  const SEAL_CHALK = 'Seal it with a water-based clear coat or wax. Clear Coat to Use has which.';
  const GREASE = 'Clean off grease and polish with a degreaser. Kitchen cabinets need a real scrub.';
  const SILICONE = 'Paint pulling into little craters (“fisheyes”)? That’s old silicone polish. Wipe it with mineral spirits, clean it again, and prime with shellac.';
  const WAX_CHECK = 'Check for wax: a drop of water beads up on wax and soaks in on bare chalk paint.';
  const DRY_TEST = 'Sprinkle water on it. If it soaks in, it’s ready. If it beads up, wait and test again in a few weeks.';
  const METAL_PREP = ['Wire-brush or sand off the rust and loose paint.', 'Wipe it with mineral spirits and let it dry.'];
  const SLICK_PREP = ['Clean it with a degreaser and rinse.', 'Scuff-sand with 220-grit until dull, and wipe off the dust.'];
  const WET_TIP = 'Not inside a shower or tub, where it stays wet: that needs a tub and tile refinishing kit.';
  const COUNTER_TIP = 'Countertops take a beating: use a countertop coating kit instead of paint.';
  const RESURF = 'Lots of cracks and splinters? A thick deck resurfacer can fill them, but it holds water in and is very hard to remove later. Replacing the worst boards is often the better fix.';
  const WAX_OFF = 'Wipe it down with mineral spirits and fine steel wool or a scrub pad, changing rags, until a rag comes away clean.';
  const SHELLAC_TIP = 'Shellac sticks to almost anything, even a trace of wax left behind. It’s a good first coat on old furniture.';
  const SPRAY_LINK = { start: 'spray', label: 'Pick the Spray Paint' };
  const STAIN_LINK = { start: 'stain', label: 'Pick a Stain Color' };
  const CLEAR_LINK = { go: 'ask/clear', label: 'Clear Coat to Use' };
  const CONCRETE_LINK = { go: 'ask/concrete', label: 'Concrete and Garage Floors' };
  const B = { tsp: 'Degreaser or TSP substitute', s220: '220-grit sanding sponge', s180: '180 and 220-grit sanding sponges', nat: 'Natural-bristle brush', syn: 'Synthetic brush', ms: 'Mineral spirits (for cleanup)', chalkSeal: 'Clear coat or wax', spray: 'Spray paint', sprayPrimer: 'Spray primer' };
  const WP_STEPS = ['Let it dry at least a day (3 days is better), then sand lightly with 220-grit and wipe off the dust.', 'Thin coats with a synthetic brush. Don’t brush back over it.', 'Two or three coats, sanding lightly between.'];
  const OP_STEPS = ['Let it dry at least a day, then sand lightly with 220-grit and wipe off the dust.', 'Thin coats with a natural-bristle brush.', 'Two or three coats, sanding lightly between.'];
  const GEL_GLAZE = { v: 'no', head: 'No, stain can’t soak into paint', why: 'Wood stain colors wood by soaking in. Over paint it just sits there and stays tacky.', steps: ['To stain it, strip the paint back to bare wood.', 'For a wood-tone look over the paint, wipe on gel stain like a glaze, let it dry, then seal it with a clear coat.'], buy: ['Paint stripper and a scraper (to go back to wood)', 'Gel stain and a clear coat (for a glaze over paint)'] };
  const DECK_CLEAR = { v: 'no', head: 'No, clear coats peel on decks', why: 'Polyurethane and other clear films crack and peel where people walk and rain sits. Use a clear deck sealer that soaks in.', steps: ['Clean it with a deck cleaner and rinse.', 'Let it dry 2 days.', 'Put on a clear or toned penetrating deck sealer.'], buy: ['Deck cleaner', 'Clear or toned penetrating deck sealer'] };
  const OV = {};
  const put = (keys, a) => keys.split(' ').forEach(k => { OV[k] = a; });
  // over latex paint
  put('latex>latex', { v: 'yes', head: 'Yes, latex goes right over latex', why: 'As long as the old paint is clean and not peeling.', steps: [CLEAN, LOOSE, SCUFF, TWO], buy: [B.tsp, B.s220, 'Latex paint'], tips: ['Big color change? A primer tinted toward the new color saves a coat.'] });
  put('latex>oil', { v: 'yes', head: 'Yes, oil-based paint sticks to latex', why: 'Once the latex is hard. Fresh latex needs a few weeks first.', steps: [CLEAN, SCUFF, TWO_OIL], buy: [B.tsp, B.s220, 'Oil-based paint', B.nat, B.ms] });
  put('latex>chalk', { v: 'yes', head: 'Yes, chalk-style paint sticks to latex', why: 'It grips most painted surfaces with little prep.', steps: [CLEAN, SCUFF, TWO, SEAL_CHALK], buy: [B.tsp, 'Chalk-style paint', B.chalkSeal] });
  put('latex>spray', { v: 'yes', head: 'Yes, once the latex has cured', why: 'Solvents in spray paint can wrinkle latex that’s less than a few weeks old. Older, hard latex is fine.', steps: [CLEAN, SCUFF, SPRAY_COATS], buy: [B.tsp, B.s220, B.spray], link: SPRAY_LINK });
  put('latex>stain oil>stain chalk>stain', GEL_GLAZE);
  put('latex>wpoly', { v: 'yes', head: 'Yes, once the paint is dry', why: 'Water-based clear coats stay clear over paint.', steps: WP_STEPS, buy: ['Water-based polyurethane', B.s220, B.syn], tips: ['Walls don’t need one. On trim and cabinets, a good enamel paint is hard enough on its own.'], link: CLEAR_LINK });
  put('latex>opoly', { v: 'caution', head: 'It sticks, but it turns yellow', why: 'Oil-based clear coats yellow over white and light paint, more so out of the sun. Over light colors, use water-based.', steps: OP_STEPS, buy: ['Oil-based polyurethane', B.s220, B.nat, B.ms], link: CLEAR_LINK });
  // over oil-based paint
  put('oil>latex', { v: 'prep', head: 'Yes, but only over a primer', why: 'Latex can’t grip oil-based paint. Without primer it peels off in strips, sometimes weeks later.', steps: [CLEAN, SCUFF_ALL, 'Prime with a bonding primer (or an oil-based primer).', TWO], buy: [B.tsp, B.s180, 'Bonding primer', 'Latex paint'], tips: [TAPE_TEST] });
  put('oil>oil', { v: 'yes', head: 'Yes, oil goes right over oil', why: 'Once it’s clean and scuffed so the new coat can grip.', steps: [CLEAN, SCUFF, TWO_OIL], buy: [B.tsp, B.s220, 'Oil-based paint', B.nat, B.ms] });
  put('oil>chalk', { v: 'prep', head: 'Yes, after a good scuff', why: 'Chalk-style paint sticks to most things, but glossy oil paint needs a scuff first. On very slick paint, prime.', steps: [CLEAN, SCUFF_ALL, TWO, SEAL_CHALK], buy: [B.tsp, B.s180, 'Chalk-style paint', B.chalkSeal], tips: [TAPE_TEST] });
  put('oil>spray', { v: 'yes', head: 'Yes, after a scuff', why: 'Spray paint grips oil-based paint once the shine is sanded off.', steps: [CLEAN, SCUFF_ALL, SPRAY_COATS], buy: [B.tsp, B.s220, B.spray], link: SPRAY_LINK });
  put('oil>wpoly', { v: 'prep', head: 'Yes, after a good scuff', why: 'Water-based clear coats can bead up or peel on glossy oil paint unless it’s sanded dull.', steps: [CLEAN, SCUFF_ALL, 'Thin coats with a synthetic brush. Don’t brush back over it.', 'Two or three coats, sanding lightly between.'], buy: [B.tsp, B.s180, 'Water-based polyurethane', B.syn], tips: [TAPE_TEST], link: CLEAR_LINK });
  put('oil>opoly', { v: 'caution', head: 'Yes, but it turns yellow over light colors', why: 'It sticks fine once scuffed. Over white and pale colors, it ambers with time.', steps: [CLEAN, SCUFF_ALL, 'Thin coats with a natural-bristle brush.', 'Two or three coats, sanding lightly between.'], buy: [B.tsp, B.s220, 'Oil-based polyurethane', B.nat, B.ms], link: CLEAR_LINK });
  // over a clear finish
  put('clear>latex', { v: 'prep', head: 'Yes, after cleaning, sanding and a bonding primer', why: 'Latex can’t grip a slick clear finish on its own.', steps: [GREASE, SCUFF_ALL, 'Prime with a bonding primer.', 'Two coats. A cabinet and trim enamel holds up best on cabinets and furniture.'], buy: [B.tsp, B.s180, 'Bonding primer', 'Cabinet and trim enamel or latex paint'], tips: [SILICONE, TAPE_TEST] });
  put('clear>oil', { v: 'prep', head: 'Yes, after cleaning, sanding and a primer', why: 'Oil-based paint grips a clear finish better than latex, but it still needs the shine sanded off and a primer.', steps: [GREASE, SCUFF_ALL, 'Prime with an oil-based or bonding primer.', TWO_OIL], buy: [B.tsp, B.s180, 'Oil-based or bonding primer', 'Oil-based paint', B.nat, B.ms], tips: [SILICONE] });
  put('clear>chalk', { v: 'prep', head: 'Yes, after a good clean and scuff', why: 'It’s sold as no-prep, but over a glossy clear finish it lasts much longer with a scuff, and a primer on slick spots.', steps: [GREASE, SCUFF_ALL, TWO, SEAL_CHALK], buy: [B.tsp, B.s180, 'Chalk-style paint', B.chalkSeal], tips: [SILICONE, TAPE_TEST] });
  put('clear>spray', { v: 'prep', head: 'Yes, after a scuff and a spray primer', why: 'Spray paint can’t grip a slick clear finish without them.', steps: [CLEAN, SCUFF_ALL, 'A light coat of spray primer.', SPRAY_COATS], buy: [B.tsp, B.s220, B.sprayPrimer, B.spray], link: SPRAY_LINK });
  put('clear>stain', { v: 'prep', head: 'Only a gel stain, after a scuff', why: 'Regular stain can’t soak through a clear finish. Gel stain sits on top, so it can darken a finish without stripping it.', steps: [CLEAN, 'Scuff-sand with 220-grit until dull, and wipe off the dust.', 'Wipe on gel stain thin with a cloth or foam brush, going with the grain.', 'Let it dry a full day. Add a second coat to go darker.', 'Seal it with a clear coat.'], buy: [B.tsp, B.s220, 'Gel stain', 'Lint-free rags or a foam brush', 'Clear coat'], tips: ['Gel stain over a finish only goes darker, never lighter. Going lighter means stripping to bare wood.'] });
  put('clear>wpoly', { v: 'prep', head: 'Yes, after a scuff', why: 'A new clear coat grips an old one once it’s cleaned and sanded dull.', steps: [CLEAN, 'Scuff-sand with 220 to 320-grit until it’s dull all over, and wipe off the dust.', 'Thin coats with a synthetic brush. Don’t brush back over it.', 'Two coats, sanding lightly between.'], buy: [B.tsp, '220 or 320-grit sanding sponge', 'Water-based polyurethane', B.syn], tips: ['Over an old oil-based finish, test a spot first. Water-based can bead up on some old finishes.', SILICONE] });
  put('clear>opoly', { v: 'prep', head: 'Yes, after a scuff', why: 'A new clear coat grips an old one once it’s cleaned and sanded dull.', steps: [CLEAN, 'Scuff-sand with 220 to 320-grit until it’s dull all over, and wipe off the dust.', 'Thin coats with a natural-bristle brush.', 'Two coats, sanding lightly between.'], buy: [B.tsp, '220 or 320-grit sanding sponge', 'Oil-based polyurethane', B.nat, B.ms], tips: [SILICONE] });
  put('clear>wax', { v: 'yes', head: 'Yes, wax can go over a clear finish', why: 'It adds a soft shine and a little protection. Only more wax sticks over it later.', steps: ['Clean it and let it dry.', 'Rub on a thin coat of paste wax with a cloth, let it haze, then buff.'], buy: ['Paste finishing wax', 'Soft cloths'] });
  // over stain with no clear coat
  put('stain>latex', { v: 'prep', head: 'Yes, over a stain-blocking primer', why: 'Stain can bleed through latex as yellow or pink spots. An oil-based or shellac primer stops it.', steps: ['Make sure the stain is fully dry (a day or more for oil-based).', 'Sand lightly with 180 to 220-grit and wipe off the dust.', 'Prime with an oil-based or shellac stain-blocking primer.', TWO], buy: [B.s180, 'Oil-based or shellac primer', 'Latex paint'] });
  put('stain>oil', { v: 'prep', head: 'Yes, over a primer', why: 'Primer seals the stain in and gives the paint an even base.', steps: ['Make sure the stain is fully dry (a day or more for oil-based).', 'Sand lightly with 180 to 220-grit and wipe off the dust.', 'Prime with an oil-based primer.', TWO_OIL], buy: [B.s180, 'Oil-based primer', 'Oil-based paint', B.nat, B.ms] });
  put('stain>chalk', { v: 'prep', head: 'Yes, but seal red and dark stains first', why: 'Red stains like mahogany and cherry bleed pink through light chalk paint. A coat of shellac first stops it.', steps: ['Clean it and let it dry.', 'Brush on a coat of clear shellac or a stain-blocking primer.', TWO, SEAL_CHALK], buy: ['Clear shellac or stain-blocking primer', 'Chalk-style paint', B.chalkSeal] });
  put('stain>spray', { v: 'prep', head: 'Yes, over a spray primer', why: 'Primer keeps the stain from bleeding through and helps the paint grip.', steps: ['Sand lightly with 220-grit and wipe off the dust.', 'A light coat of spray primer.', SPRAY_COATS], buy: [B.s220, B.sprayPrimer, B.spray], link: SPRAY_LINK });
  put('stain>stain', { v: 'caution', head: 'Darker, yes. Lighter, no.', why: 'A darker stain of the same kind goes on and blends with the old color. Stain can’t make wood lighter: for that, sand or strip back to bare wood.', steps: ['Make sure there’s no clear coat on it: a drop of water soaks in on stained wood and beads up on a clear coat.', 'Sand lightly with 180-grit and wipe off the dust.', 'Test the new stain on a hidden spot. It comes out darker over the old one.', 'Wipe it on, wait a few minutes, and wipe off the extra.'], buy: ['180-grit sandpaper', 'Wood stain (a darker color)', 'Lint-free rags'] });
  put('stain>wpoly', { v: 'yes', head: 'Yes, once the stain is dry', why: 'About 2 hours for water-based stain. Oil-based needs a day at least (gel stain 2 to 3 days), or the clear coat can cloud or peel.', steps: ['Wait until the stain is completely dry. It shouldn’t smell or feel tacky.', 'Over an oil stain, a thin coat of dewaxed shellac first helps a water-based coat go on evenly.', 'Thin coats with a synthetic brush. Don’t brush back over it.', 'Two or three coats, sanding lightly with 220-grit between.'], buy: ['Water-based polyurethane', B.syn, B.s220, 'Dewaxed shellac (over oil stain)'], link: CLEAR_LINK });
  put('stain>opoly', { v: 'yes', head: 'Yes, once the stain is dry', why: 'Oil-based clear coats go over oil and water-based stains alike.', steps: ['Wait until the stain is dry, about 8 to 24 hours for oil-based (the can says).', 'Thin coats with a natural-bristle brush.', 'Two or three coats, sanding lightly with 220-grit between.'], buy: ['Oil-based polyurethane', B.nat, B.s220, B.ms], link: CLEAR_LINK });
  put('stain>wax', { v: 'yes', head: 'Yes, for a soft, low-shine finish', why: 'Fine on pieces that aren’t used hard. Water and heat leave rings through wax.', steps: ['Let the stain dry completely.', 'Rub on a thin coat of paste wax with a cloth, let it haze, then buff.'], buy: ['Paste finishing wax', 'Soft cloths'] });
  // over bare wood
  put('bare>latex', { v: 'prep', head: 'Yes, over a primer', why: 'Primer seals the wood so paint goes on even. Knots, cedar, redwood and oak bleed through latex unless the primer blocks stains.', steps: ['Sand smooth with 120, then 180-grit, and wipe off the dust.', 'Prime. Knots, cedar, redwood or oak: an oil-based or shellac stain-blocking primer.', 'Sand the primer lightly: it raises tiny fibers.', TWO], buy: ['Sandpaper: 120 and 180 grit', 'Primer (stain-blocking for knotty or red woods)', 'Latex paint'] });
  put('bare>oil', { v: 'prep', head: 'Yes, over a primer', why: 'An oil-based primer seals the wood and gives the paint an even base.', steps: ['Sand smooth with 120, then 180-grit, and wipe off the dust.', 'Prime with an oil-based primer.', 'Sand the primer lightly.', TWO_OIL], buy: ['Sandpaper: 120 and 180 grit', 'Oil-based primer', 'Oil-based paint', B.nat, B.ms] });
  put('bare>chalk', { v: 'yes', head: 'Yes. Seal knots first.', why: 'It sticks to bare wood, but knots and some woods bleed yellow or pink through it. A coat of shellac on them stops it.', steps: ['Sand lightly and wipe off the dust.', 'Brush clear shellac over knots and any reddish wood.', TWO, SEAL_CHALK], buy: ['Clear shellac (for knots)', 'Chalk-style paint', B.chalkSeal] });
  put('bare>spray', { v: 'prep', head: 'Yes, over a spray primer', why: 'Bare wood soaks up spray paint unevenly. Primer evens it out.', steps: ['Sand smooth with 180 to 220-grit and wipe off the dust.', 'A light coat of spray primer. Sand it lightly once it’s dry.', SPRAY_COATS], buy: ['Sandpaper: 180 and 220 grit', B.sprayPrimer, B.spray], link: SPRAY_LINK });
  put('bare>stain', { v: 'yes', head: 'Yes, that’s what it’s for', why: 'Sand it right and it takes stain evenly.', steps: ['Sand with the grain: 120, then 150 or 180-grit. Stop there: sanding finer makes the stain come out lighter.', 'Pine, maple, birch and cherry blotch: brush on a pre-stain wood conditioner first.', 'Test on a hidden spot or a scrap.', 'Wipe it on, wait a few minutes, and wipe off the extra.'], buy: ['Sandpaper: 120 and 150 grit', 'Pre-stain wood conditioner (pine, maple, birch, cherry)', 'Wood stain', 'Lint-free rags', 'Gloves'], link: STAIN_LINK });
  put('bare>wpoly', { v: 'yes', head: 'Yes, it keeps wood looking natural', why: 'Water-based clear coats keep light woods light. The first coat raises the grain a little.', steps: ['Sand with 150, then 220-grit, and wipe off the dust with a barely damp cloth.', 'First coat, let it dry, then sand lightly with 220: the water raised tiny fibers.', 'Two or three more thin coats, sanding lightly between.'], buy: ['Sandpaper: 150 and 220 grit', 'Water-based polyurethane', B.syn, 'Microfiber cloths'], link: CLEAR_LINK });
  put('bare>opoly', { v: 'yes', head: 'Yes, with a warm amber glow', why: 'It soaks in a little, brings out the grain and wears well.', steps: ['Sand with 150, then 220-grit, and wipe off the dust with a tack cloth.', 'Thin coats with a natural-bristle brush, going with the grain.', 'Three coats, sanding lightly with 220 between.'], buy: ['Sandpaper: 150 and 220 grit', 'Oil-based polyurethane', B.nat, 'Tack cloth', B.ms], link: CLEAR_LINK });
  put('bare>wax', { v: 'yes', head: 'Yes, for light protection', why: 'A soft, natural look on pieces that aren’t used hard. It won’t stand up to water like a clear coat.', steps: ['Sand smooth with 180, then 220-grit.', 'Rub on a thin coat of paste wax with a cloth, let it haze, then buff.', 'Add a second coat for more shine.'], buy: ['Sandpaper: 180 and 220 grit', 'Paste finishing wax', 'Soft cloths'] });
  put('bare>semi', { v: 'yes', head: 'Yes, once the wood is clean and dry', why: 'New pressure-treated wood is often too wet to take stain for weeks or months.', steps: [DRY_TEST, 'Clean it with a deck cleaner. On new wood, a brightener opens it up to take stain.', 'Let it dry 2 days.', 'One thin coat, or two wet-on-wet. Back-brush so none sits on top.'], buy: ['Deck cleaner', 'Deck brightener', 'Semi-transparent deck stain', 'Stain pad or brush'] });
  put('bare>solid', { v: 'yes', head: 'Yes, once the wood is clean and dry', why: 'New pressure-treated wood is often too wet to take stain for weeks or months.', steps: [DRY_TEST, 'Clean it with a deck cleaner, and let it dry 2 days.', 'Two thin coats. Thick coats peel.'], buy: ['Deck cleaner', 'Solid deck stain', 'Stain pad, roller or brush'] });
  // over wax or furniture polish
  const noWax = (last, extra, v) => ({ v: v || 'prep', head: 'Not until the wax is off', why: 'Nothing sticks to wax, and old furniture polish with silicone makes new finishes pull into little craters.', steps: [WAX_OFF, CLEAN, last], buy: ['Mineral spirits', 'Fine steel wool or a scrub pad', 'Clean rags', B.tsp].concat(extra), tips: [SHELLAC_TIP] });
  put('wax>latex', noWax('Scuff-sand, prime with a shellac primer, then paint.', ['Shellac primer', 'Latex paint']));
  put('wax>oil', noWax('Scuff-sand, prime with a shellac primer, then paint.', ['Shellac primer', 'Oil-based paint']));
  put('wax>chalk', noWax('Scuff-sand, prime with a shellac primer, then paint.', ['Shellac primer', 'Chalk-style paint']));
  put('wax>spray', noWax('Scuff-sand, then a spray primer and light coats.', [B.sprayPrimer, B.spray]));
  put('wax>stain', noWax('Stain only soaks into bare wood: sand or strip off any finish under the wax too.', ['Paint and varnish stripper', 'Wood stain']));
  put('wax>wpoly', noWax('Scuff-sand lightly, test a small spot, then the clear coat.', ['Water-based polyurethane']));
  put('wax>opoly', noWax('Scuff-sand lightly, test a small spot, then the clear coat.', ['Oil-based polyurethane']));
  put('wax>wax', { v: 'yes', head: 'Yes, more wax', why: 'New wax blends with the old. Clean off the dirt first so it doesn’t get sealed in.', steps: ['Wipe it clean with a damp cloth and let it dry.', 'Rub on a thin coat of paste wax, let it haze, then buff.'], buy: ['Paste finishing wax', 'Soft cloths'] });
  // over chalk-style paint (not waxed)
  const chalkOk = 'Unwaxed chalk paint is a little porous, so new paint grips it. If it was waxed, take the wax off first.';
  put('chalk>latex', { v: 'yes', head: 'Yes, if it hasn’t been waxed', why: chalkOk, steps: [WAX_CHECK, 'Wipe off the dust with a damp cloth and let it dry.', TWO], buy: ['Latex paint'] });
  put('chalk>oil', { v: 'yes', head: 'Yes, if it hasn’t been waxed', why: chalkOk, steps: [WAX_CHECK, 'Wipe off the dust with a damp cloth and let it dry.', TWO_OIL], buy: ['Oil-based paint', B.nat, B.ms] });
  put('chalk>chalk', { v: 'yes', head: 'Yes, chalk over chalk', why: 'It goes right on, as long as there’s no wax on it.', steps: [WAX_CHECK, 'Wipe off the dust with a damp cloth and let it dry.', TWO, SEAL_CHALK], buy: ['Chalk-style paint', B.chalkSeal] });
  put('chalk>spray', { v: 'yes', head: 'Yes, if it hasn’t been waxed', why: chalkOk, steps: [WAX_CHECK, 'Smooth it with a fine sanding sponge and wipe off the dust.', SPRAY_COATS], buy: ['Fine sanding sponge', B.spray], link: SPRAY_LINK });
  put('chalk>wpoly', { v: 'yes', head: 'Yes, the usual way to seal it', why: 'It’s tougher than wax and never needs redoing.', steps: ['Let the paint dry a day, then smooth it with a fine sanding sponge.', 'Thin coats with a synthetic brush. On dark colors, don’t overbrush or it can streak.', 'Two or three coats (three on a tabletop).'], buy: ['Water-based polyurethane', 'Fine sanding sponge', B.syn], tips: ['Over white, some clear coats go a little yellow. Pick one that says non-yellowing, and test it first.'], link: CLEAR_LINK });
  put('chalk>opoly', { v: 'caution', head: 'It works, but it turns yellow', why: 'Oil-based clear coats amber over chalk paint, most of all over white and pale colors. Water-based stays clear.', steps: ['Let the paint dry a day, then smooth it with a fine sanding sponge.', 'Thin coats with a natural-bristle brush.', 'Two or three coats, sanding lightly between.'], buy: ['Oil-based polyurethane', B.nat, B.ms], link: CLEAR_LINK });
  put('chalk>wax', { v: 'yes', head: 'Yes, the classic look', why: 'Soft and hand-rubbed, but it wears and needs redoing every year or so, and only more wax sticks over it later.', steps: ['Let the paint dry a day.', 'Work a thin coat of wax in with a wax brush or a lint-free cloth.', 'Wipe off the extra, let it set, then buff.'], buy: ['Chalk paint wax (clear or dark)', 'Wax brush or lint-free cloths'] });
  // over new drywall
  const dryWhy = 'Bare paper and joint compound soak up paint differently, so the patches show through as dull spots.';
  put('drywall>latex', { v: 'prep', head: 'Yes, over a drywall primer', why: dryWhy, steps: ['Sand the joint compound smooth and wipe off the dust.', 'Prime with a drywall (PVA) primer.', TWO], buy: ['Drywall (PVA) primer', 'Sanding sponge', 'Latex paint'], tips: ['Paint-and-primer covers painted walls well, but new drywall still does better with a real drywall primer first.'] });
  put('drywall>oil', { v: 'prep', head: 'Yes, over a latex drywall primer', why: 'Oil-based primer raises the paper fuzz on bare drywall. Prime with latex drywall primer, then oil-based paint goes over it.', steps: ['Sand the joint compound smooth and wipe off the dust.', 'Prime with a latex drywall (PVA) primer.', TWO_OIL], buy: ['Drywall (PVA) primer', 'Sanding sponge', 'Oil-based paint', B.nat] });
  put('drywall>chalk', { v: 'prep', head: 'Yes, over a drywall primer', why: dryWhy, steps: ['Sand the joint compound smooth and wipe off the dust.', 'Prime with a drywall (PVA) primer.', TWO], buy: ['Drywall (PVA) primer', 'Sanding sponge', 'Chalk-style paint'] });
  // over bare or rusty metal
  put('metal>latex', { v: 'prep', head: 'Yes, over a rust-blocking metal primer', why: 'Water-based paint on bare steel lets rust come right through. A metal primer stops it.', steps: METAL_PREP.concat(['Prime with a rust-inhibiting metal primer (one for rusty metal if some rust is left).', 'Two coats of a paint made for metal (direct-to-metal or acrylic enamel).']), buy: ['Wire brush and sandpaper', 'Mineral spirits and rags', 'Rust-inhibiting metal primer', 'Direct-to-metal (DTM) paint'] });
  put('metal>oil', { v: 'prep', head: 'Yes, over a rust-blocking primer', why: 'Oil-based enamel is the classic for metal. Bare or rusty spots still need a primer first.', steps: METAL_PREP.concat(['Prime with a rust-inhibiting primer.', 'Two coats of oil-based enamel.']), buy: ['Wire brush and sandpaper', 'Mineral spirits and rags', 'Rust-inhibiting primer', 'Oil-based enamel'] });
  put('metal>chalk', { v: 'caution', head: 'Inside, over a metal primer', why: 'Chalk-style paint doesn’t stop rust. Outside, use a paint made for metal instead.', steps: METAL_PREP.concat(['Prime with a rust-inhibiting metal primer.', TWO, SEAL_CHALK]), buy: ['Wire brush and sandpaper', 'Rust-inhibiting metal primer', 'Chalk-style paint'] });
  put('metal>spray', { v: 'prep', head: 'Yes, with a rust-stopping spray', why: 'Use a spray paint with rust protection, or a rusty-metal spray primer first.', steps: METAL_PREP.concat([SPRAY_COATS]), buy: ['Wire brush and sandpaper', 'Mineral spirits and rags', 'Rust-stopping spray paint (or a rusty-metal primer)'], link: SPRAY_LINK });
  // over galvanized metal
  const GALV_WASH = 'Wash it with a degreaser and water, rinse and let it dry.';
  put('galv>latex', { v: 'prep', head: 'Yes, after washing and a galvanized-metal primer', why: 'New galvanized metal has an oily film that paint won’t stick to.', steps: [GALV_WASH, 'Prime with a primer that says it’s for galvanized metal.', 'Two coats of 100% acrylic latex paint.'], buy: ['Degreaser', 'Primer for galvanized metal', '100% acrylic latex paint'] });
  put('galv>oil', { v: 'no', head: 'Not right on it', why: 'Oil-based (alkyd) paint reacts with the zinc and peels off in sheets. Over a galvanized-metal primer it can work, but latex is the safer top coat.', steps: [GALV_WASH, 'Prime with a primer that says it’s for galvanized metal.', 'Top it with 100% acrylic latex instead.'], buy: ['Degreaser', 'Primer for galvanized metal', '100% acrylic latex paint'] });
  put('galv>spray', { v: 'prep', head: 'Yes, over a primer made for galvanized metal', why: 'Most spray paints peel off bare galvanized metal. A primer made for it fixes that.', steps: [GALV_WASH, 'A light coat of spray primer that says it’s for galvanized metal.', SPRAY_COATS], buy: ['Degreaser', 'Spray primer for galvanized metal', B.spray], link: SPRAY_LINK });
  // over laminate, tile or plastic
  put('slick>latex', { v: 'prep', head: 'Yes, over a bonding primer', why: 'The bonding primer is what makes it stick. Skip it and the paint scratches off with a fingernail.', steps: SLICK_PREP.concat(['Prime with a bonding primer made for slick surfaces.', 'Two coats. A cabinet and trim enamel holds up best.']), buy: ['Degreaser', B.s220, 'Bonding primer', 'Cabinet and trim enamel or latex paint'], tips: [WET_TIP, COUNTER_TIP] });
  put('slick>oil', { v: 'prep', head: 'Yes, over a bonding primer', why: 'The bonding primer is what makes it stick. Skip it and the paint scratches off with a fingernail.', steps: SLICK_PREP.concat(['Prime with a bonding primer made for slick surfaces.', TWO_OIL]), buy: ['Degreaser', B.s220, 'Bonding primer', 'Oil-based paint', B.nat, B.ms], tips: [WET_TIP, COUNTER_TIP] });
  put('slick>chalk', { v: 'prep', head: 'Yes, over a bonding primer', why: 'Chalk-style paint grips better than most, but on laminate and tile a bonding primer keeps it from scratching off.', steps: SLICK_PREP.concat(['Prime with a bonding primer made for slick surfaces.', TWO, SEAL_CHALK]), buy: ['Degreaser', B.s220, 'Bonding primer', 'Chalk-style paint', B.chalkSeal], tips: [WET_TIP] });
  put('slick>spray', { v: 'prep', head: 'Yes, with the right primer or spray', why: 'Plastic: a spray made to bond to plastic. Laminate and tile: a bonding spray primer first.', steps: SLICK_PREP.concat([SPRAY_COATS]), buy: ['Degreaser', B.s220, 'Plastic-bonding spray paint (or a bonding spray primer)'], tips: [WET_TIP], link: SPRAY_LINK });
  // over wallpaper
  const paper = (paint) => ({ v: 'caution', head: 'Best to take it off. Staying? Prime with oil or shellac.', why: 'Water in latex primer and paint can soften the glue, so the paper bubbles and the seams lift.', steps: ['Try a corner. If it peels off easily, take it all down and wash off the glue.', 'Staying up: glue down loose seams and edges, and let it dry.', 'Prime with an oil-based or shellac primer.', 'Seams show? Skim them with joint compound, sand and spot-prime.', TWO], buy: ['Wallpaper remover and a scoring tool (to take it off)', 'Oil-based or shellac primer (to paint over it)', 'Seam adhesive', 'Joint compound and a knife', paint] });
  put('wallpaper>latex', paper('Latex paint')); put('wallpaper>oil', paper('Oil-based paint')); put('wallpaper>chalk', paper('Chalk-style paint'));
  // over bare concrete, brick or block
  const MASONRY = ['New concrete: wait 28 days after it’s poured.', 'Scrub off dirt and the white powder (efflorescence) with a masonry cleaner, rinse and let it dry.', 'Prime with a masonry primer, or use a self-priming masonry paint.', 'Two coats. A thick-nap roller gets into the texture.'];
  const MASONRY_BUY = ['Masonry cleaner', 'Stiff brush', 'Masonry primer', 'Exterior latex or masonry paint', 'Thick-nap roller (3/4 inch)'];
  put('masonry>latex', { v: 'prep', head: 'Yes, over a masonry primer', why: 'New concrete and mortar are alkaline and need to cure. A masonry primer, or a masonry paint that primes itself, handles it.', steps: MASONRY, buy: MASONRY_BUY, link: CONCRETE_LINK });
  put('masonry>oil', { v: 'no', head: 'No, oil-based paint peels off masonry', why: 'The lime in concrete and mortar breaks oil-based paint down. Use latex masonry paint.', steps: MASONRY, buy: MASONRY_BUY, link: CONCRETE_LINK });
  put('masonry>spray', { v: 'yes', head: 'Yes, for small jobs', why: 'Fine for planters, stepping stones and small spots. For walls and floors, use masonry or floor paint.', steps: ['Clean it and let it dry completely.', SPRAY_COATS], buy: ['Masonry cleaner', B.spray], link: CONCRETE_LINK });
  // over old deck stain
  put('deckSemi>semi', { v: 'yes', head: 'Yes, after a cleaning', why: 'The new coat soaks in where the old one wore off.', steps: ['Clean it with a deck cleaner and rinse.', 'Let it dry 2 days.', 'One thin coat. Back-brush so none sits on top.'], buy: ['Deck cleaner', 'Semi-transparent deck stain', 'Stain pad or brush'], tips: ['Switching from oil-based to water-based? Strip the old one first, or let it weather a season, so the new one can soak in.'] });
  put('deckSemi>solid', { v: 'yes', head: 'Yes, solid goes over see-through', why: 'It covers the old color completely. You can’t go back to see-through later without stripping.', steps: ['Clean it with a deck cleaner and rinse.', 'Let it dry 2 days.', 'Two thin coats. Thick coats peel.'], buy: ['Deck cleaner', 'Solid deck stain', 'Stain pad, roller or brush'] });
  put('deckSemi>latex', { v: 'prep', head: 'Yes, but solid stain usually holds up better', why: 'Paint forms a film that can peel where people walk. If you want paint, use one made for decks and porches.', steps: ['Clean it with a deck cleaner and rinse.', 'Let it dry 2 days.', 'Prime bare spots, then two coats of deck and porch paint.'], buy: ['Deck cleaner', 'Exterior primer', 'Deck and porch paint'] });
  put('deckSemi>wpoly deckSemi>opoly', DECK_CLEAR);
  put('deckSolid>semi', { v: 'no', head: 'No, see-through can’t go over solid', why: 'It can’t soak in through the old coating, and the old color shows through in patches.', steps: ['Stay with solid stain: clean it, scrape what’s loose, and put on a fresh coat.', 'Or strip it to bare wood with a deck stripper, brighten it, let it dry, then stain.'], buy: ['Solid deck stain (to stay solid)', 'Deck stain stripper and brightener (to go back to wood)'], tips: [RESURF] });
  put('deckSolid>solid', { v: 'yes', head: 'Yes, after cleaning and scraping', why: 'Solid over solid is the easy one. Just don’t let it build up thick.', steps: ['Scrape off anything loose or peeling.', 'Clean it with a deck cleaner, rinse and let it dry 2 days.', 'Spot-prime bare wood if the can says to.', 'Two thin coats. Thick coats peel.'], buy: ['Scraper', 'Deck cleaner', 'Solid deck stain', 'Stain pad, roller or brush'], tips: [RESURF] });
  put('deckSolid>latex', { v: 'yes', head: 'Yes, after cleaning and scraping', why: 'Deck and porch paint goes over old solid stain or paint that’s stuck tight.', steps: ['Scrape off anything loose or peeling.', 'Clean it with a deck cleaner, rinse and let it dry 2 days.', 'Spot-prime bare wood.', 'Two thin coats of deck and porch paint.'], buy: ['Scraper', 'Deck cleaner', 'Exterior primer', 'Deck and porch paint'], tips: [RESURF] });
  put('deckSolid>wpoly deckSolid>opoly', { v: 'no', head: 'No, clear coats peel on decks', why: 'Polyurethane and other clear films crack and peel where people walk and rain sits.', steps: ['Stay with solid stain: clean it and put on a fresh coat.'], buy: ['Deck cleaner', 'Solid deck stain'] });
  const PAINT_TEST = 'Find out: rub a hidden spot with a cotton ball and rubbing alcohol. If paint comes off on it, it’s latex. If not, it’s oil-based. Still not sure? The steps below work on both.';
  const P7 = 'latex oil chalk spray stain wpoly opoly';
  const OVER_NEW = {
    latex: P7, oil: P7, notsure: P7, clear: P7 + ' wax', stain: P7 + ' wax', bare: P7 + ' wax semi solid', wax: P7 + ' wax', chalk: P7 + ' wax',
    drywall: 'latex oil chalk', metal: 'latex oil chalk spray', galv: 'latex oil spray', slick: 'latex oil chalk spray', wallpaper: 'latex oil chalk', masonry: 'latex oil spray',
    deckSemi: 'semi solid latex wpoly opoly', deckSolid: 'semi solid latex wpoly opoly',
  };
  function overAnswer(p) {
    const now = p.now === 'notsure' ? 'oil' : p.now;
    const base = OV[now + '>' + p.new];
    const a = Object.assign({}, base);
    if (p.now === 'notsure') a.test = PAINT_TEST;
    if (a.v !== 'no' && (p.new === 'oil' || p.new === 'opoly')) a.warn = RAGS;
    if (['latex', 'oil', 'notsure', 'clear', 'deckSolid'].indexOf(p.now) >= 0) a.lead = true;
    return a;
  }

  // ================================================================
  // THE FOUR, AND WHAT EACH ASKS
  // ================================================================
  const TOOLS = {
    clear: {
      id: 'clear', icon: 'clear', name: 'Clear Coat to Use', short: 'Clear Coat',
      line: 'Polyurethane, Polycrylic, spar urethane or wax: the right one for what’s under it and where it goes.',
      asks: [
        { k: 'on', q: 'What’s getting the clear coat?', opts: [['table', 'Tabletop or Desk'], ['furniture', 'Furniture or Shelves'], ['cabinets', 'Cabinets'], ['trim', 'Trim, Doors or Paneling'], ['floor', 'Wood Floor or Stairs'], ['outside', 'Outside Wood', 'Front door, furniture, trim']] },
        { k: 'under', q: 'What’s on it now?', opts: [['bare', 'Bare Wood'], ['oilstain', 'Oil-Based Stain', 'Cleans up with mineral spirits'], ['waterstain', 'Water-Based Stain', 'Cleans up with water'], ['lightpaint', 'White or Light Paint'], ['darkpaint', 'Colored or Dark Paint'], ['chalk', 'Chalk-Style Paint']] },
        { k: 'sheen', q: 'How shiny?', opts: [['matte', 'Matte'], ['satin', 'Satin'], ['semi', 'Semi-Gloss'], ['gloss', 'Gloss']] },
      ],
      def: { on: 'furniture', under: 'bare', sheen: 'satin' },
      answer: clearAnswer,
    },
    caulk: {
      id: 'caulk', icon: 'caulk', name: 'Caulk or Filler to Use', short: 'Caulk or Filler',
      line: 'Gaps, cracks, holes and rotted wood: which caulk or filler, whether it can be painted, and how long to wait.',
      asks: [
        { k: 'what', q: 'What are you filling?', opts: [['trim', 'Gaps Along Trim', 'Baseboards, crown, door and window trim'], ['corner', 'Crack in a Corner', 'Where walls meet, or the wall and ceiling'], ['crack', 'Crack in a Flat Wall or Ceiling'], ['nail', 'Nail Holes and Dents'], ['hole', 'Bigger Hole in Drywall'], ['tub', 'Tub, Shower or Sink'], ['counter', 'Countertop or Backsplash'], ['outside', 'Outside: Windows, Doors, Siding'], ['rot', 'Rotted or Broken Wood'], ['concrete', 'Crack in Concrete']] },
        { k: 'over', q: 'What goes over it?', opts: [['paint', 'Paint'], ['stain', 'Stain or Clear Finish'], ['none', 'Nothing']] },
        { k: 'size', q: 'How wide is it?', opts: [['small', 'Under 1/4 Inch'], ['wide', '1/4 to 1/2 Inch'], ['big', 'Over 1/2 Inch']] },
        { k: 'hsize', q: 'How big is the hole?', opts: [['small', 'Up to 1/2 Inch'], ['wide', 'Up to About 4 Inches'], ['big', 'Bigger Than 4 Inches']] },
      ],
      def: { what: 'trim', over: 'paint', size: 'small', hsize: 'small' },
      allow(k, p) {
        const w = p.what;
        if (k === 'over') return { trim: ['paint', 'stain'], nail: ['paint', 'stain'], rot: ['paint', 'stain'], tub: ['none', 'paint'], counter: ['none', 'paint'], outside: ['paint', 'none'], concrete: ['none', 'paint'] }[w] || ['paint'];
        if (k === 'size') return ['trim', 'corner', 'tub', 'counter', 'outside', 'concrete'].indexOf(w) >= 0 ? ['small', 'wide', 'big'] : [];
        if (k === 'hsize') return w === 'hole' ? ['small', 'wide', 'big'] : [];
        return null;
      },
      answer: caulkAnswer,
    },
    concrete: {
      id: 'concrete', icon: 'concrete', name: 'Concrete and Garage Floors', short: 'Concrete',
      line: 'Epoxy, floor paint, concrete stain or sealer, and the two quick tests that decide whether it lasts.',
      asks: [
        { k: 'where', q: 'Where is it?', opts: [['garage', 'Garage Floor'], ['basement', 'Basement Floor'], ['bwall', 'Basement Walls'], ['patio', 'Patio, Porch or Steps'], ['drive', 'Driveway or Sidewalk']] },
        { k: 'look', q: 'What do you want?', opts: [['solid', 'Solid Color'], ['stain', 'See-Through Color'], ['clear', 'Keep It Natural', 'Just protect it']] },
        { k: 'now', q: 'What’s it like now?', hint: 'Not sure? Sprinkle some water on it. Soaks in and darkens: bare. Beads up: sealed.', opts: [['bare', 'Bare Concrete'], ['sealed', 'Sealed', 'Water beads up'], ['painted', 'Painted or Coated'], ['damp', 'Damp, or White Powdery Spots'], ['new', 'New', 'Poured in the last month']] },
      ],
      def: { where: 'garage', look: 'solid', now: 'bare' },
      allow(k, p) {
        if (k === 'look') return p.where === 'bwall' || p.where === 'drive' ? ['solid', 'clear'] : null;
        if (k === 'now') return p.where === 'bwall' ? ['bare', 'painted', 'damp'] : p.where === 'drive' ? ['bare', 'sealed', 'painted', 'new'] : null;
        return null;
      },
      answer: concreteAnswer,
    },
    over: {
      id: 'over', icon: 'over', name: 'Will It Go Over That?', short: 'Goes Over',
      line: 'Latex over oil, poly over paint, stain over stain: yes, no, or what to do first.',
      asks: [
        { k: 'now', q: 'What’s on there now?', opts: [['latex', 'Latex Paint', 'Water-based'], ['oil', 'Oil-Based Paint', 'Often old trim, doors and cabinets'], ['notsure', 'Paint, Not Sure Which'], ['clear', 'Clear Finish', 'Polyurethane, varnish, lacquer'], ['stain', 'Wood Stain Only', 'No clear coat on it'], ['bare', 'Bare Wood'], ['wax', 'Wax or Furniture Polish'], ['chalk', 'Chalk-Style Paint'], ['drywall', 'New Drywall'], ['metal', 'Bare or Rusty Metal'], ['galv', 'Galvanized Metal', 'Dull gray: gutters, railings, mailboxes'], ['slick', 'Laminate, Tile or Plastic'], ['wallpaper', 'Wallpaper'], ['masonry', 'Concrete, Brick or Block'], ['deckSemi', 'See-Through Deck Stain'], ['deckSolid', 'Solid Deck Stain or Deck Paint']] },
        { k: 'new', q: 'What do you want to put on?', opts: [['latex', 'Latex Paint'], ['oil', 'Oil-Based Paint'], ['chalk', 'Chalk-Style Paint'], ['spray', 'Spray Paint'], ['stain', 'Wood Stain'], ['wpoly', 'Water-Based Clear Coat'], ['opoly', 'Oil-Based Clear Coat'], ['wax', 'Wax'], ['semi', 'See-Through Deck Stain'], ['solid', 'Solid Deck Stain']] },
      ],
      def: { now: 'oil', new: 'latex' },
      allow(k, p) { return k === 'new' ? OVER_NEW[p.now].split(' ') : null; },
      answer: overAnswer,
    },
  };
  const LIST = ['clear', 'caulk', 'concrete', 'over'].map(k => TOOLS[k]);
  const find = id => TOOLS[id] || null;

  // the choices each question has for these picks ([] means the question doesn't apply)
  function allowed(T, k, p) {
    const a = T.asks.find(x => x.k === k), ok = T.allow ? T.allow(k, p) : null;
    return ok || a.opts.map(o => o[0]);
  }
  // the picks made whole: every question answered with a choice it has
  function pick(id, p) {
    const T = TOOLS[id]; if (!T) return null;
    const q = Object.assign({}, T.def, p || {}), r = {};
    for (const a of T.asks) {
      const list = allowed(T, a.k, q);
      if (!list.length) { q[a.k] = ''; r[a.k] = ''; continue; }
      if (list.indexOf(q[a.k]) < 0) q[a.k] = list.indexOf(T.def[a.k]) >= 0 ? T.def[a.k] : list[0];
      r[a.k] = q[a.k];
    }
    return r;
  }
  // one tap: when it changes what a later question offers (a tub offers Nothing first, not Paint), that question
  // goes back to the usual answer for the new choice; the others keep what was picked
  function tap(id, p, k, v) {
    const T = TOOLS[id]; if (!T) return null;
    const was = pick(id, p), q = Object.assign({}, was, { [k]: v });
    let after = false;
    for (const a of T.asks) {
      if (a.k === k) { after = true; continue; }
      if (!after) continue;
      const before = allowed(T, a.k, was), now = allowed(T, a.k, q);
      if (before.join() !== now.join()) q[a.k] = now.length ? now[0] : '';
    }
    return pick(id, q);
  }
  // the questions to show: the ones with more than one choice
  function shown(id, p) {
    const T = TOOLS[id], out = [];
    // (in the order the helper lists them: for an old deck stain, the deck stains come first)
    for (const a of T.asks) { const list = allowed(T, a.k, p); if (list.length > 1) out.push({ k: a.k, q: a.q, hint: a.hint || '', opts: list.map(v => a.opts.find(o => o[0] === v)).filter(Boolean) }); }
    return out;
  }
  function answer(id, p) {
    const T = TOOLS[id]; if (!T) return null;
    const a = T.answer(pick(id, p));
    return Object.assign({ v: 'best', head: '', like: '', sheen: '', why: '', alt: '', test: '', warn: '', lead: false, steps: [], wait: '', buy: [], note: '', tips: [], link: null }, a);
  }
  // a short name for one answer, kept in a project: ask:clear:table.bare.satin
  const refOf = (id, p) => 'ask:' + id + ':' + TOOLS[id].asks.map(a => p[a.k] || '').join('.');
  function fromRef(ref) {
    const m = /^ask:([a-z]+):(.*)$/.exec(ref || ''); if (!m || !TOOLS[m[1]]) return null;
    const vals = m[2].split('.'), p = {};
    TOOLS[m[1]].asks.forEach((a, i) => { if (vals[i]) p[a.k] = vals[i]; });
    return { id: m[1], picks: pick(m[1], p) };
  }
  // every different set of picks one helper can have (for the tests, and for checking the Spanish)
  function combos(id) {
    const T = TOOLS[id], seen = {}, out = [];
    const walk = (i, p) => {
      if (i === T.asks.length) { const q = pick(id, p), k = refOf(id, q); if (!seen[k]) { seen[k] = 1; out.push(q); } return; }
      for (const o of T.asks[i].opts) walk(i + 1, Object.assign({}, p, { [T.asks[i].k]: o[0] }));
    };
    walk(0, {});
    return out;
  }
  // Look Up: a search that reads like one of these questions opens it ("polyurethane", "caulk", "latex over oil")
  const MATCH = [
    ['over', /\b(over|on top of)\b|\bencima\b|\bsobre\b/],
    ['caulk', /\b(caulk\w*|silicone|spackl\w*|joint compound|wood filler|filler|putty|backer rod|drywall patch|sealant)\b|\b(masilla|silic[oó]n\w*|resanador|calafate\w*)\b/],
    ['concrete', /\b(epoxy|garage floor|concrete|cement|drylok|waterproof\w*|basement|driveway|patio|masonry)\b|\b(ep[oó]xic\w*|concreto|cemento|s[oó]tano|impermeabiliz\w*|cochera)\b/],
    ['clear', /\b(poly|polyurethane|polycrylic|varnish|spar|urethane|lacquer|shellac|top ?coat|clear ?coat|finishing wax|paste wax)\b|\b(poliuretano|barniz|laca|goma laca|cera)\b/],
  ];
  function match(q) {
    const s = ' ' + String(q || '').toLowerCase() + ' ';
    for (const [id, re] of MATCH) if (re.test(s)) return id;
    return null;
  }
  return { TOOLS, LIST, ICONS, VERDICTS, RAGS, find, pick, tap, shown, answer, refOf, fromRef, combos, match };
});
