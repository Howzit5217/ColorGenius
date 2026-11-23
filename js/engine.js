/* ColorGenius recommendation engine: questions, scoring, warnings, matches and search.
   Depends on CG.color. Works in the browser (window.CG.engine) and in Node (module.exports). */
(function (root) {
  'use strict';
  const C = root.CG && root.CG.color ? root.CG.color : (typeof require !== 'undefined' ? require('./color.js') : null);

  const F = { INT: 1, EXT: 2, DISC: 4, LRV_EST: 8, POPULAR: 16, RACK: 32 };

  // ---------------- question content ----------------
  // Sheens from least to most shine. Gloss ranges are typical 60-degree gloss units and vary by brand.
  const SHEENS = [
    { id: 'flat', name: 'Flat', gloss: '0–5', shine: 0,
      pros: ['Hides wall flaws, patches and texture best', 'No glare; color looks even from every angle', 'Easiest to touch up invisibly'],
      cons: ['Hardest to clean; scrubbing can leave shiny spots', 'Marks and scuffs easily'],
      best: 'Ceilings, low-traffic walls, textured or patched walls' },
    { id: 'matte', name: 'Matte', gloss: '5–10', shine: 0.06,
      pros: ['Rich, soft, velvety color', 'Hides minor flaws well', 'Many premium mattes are washable'],
      cons: ['Less tough than Eggshell or Satin in busy rooms', 'Can burnish (go shiny) if scrubbed hard'],
      best: 'Living rooms, bedrooms, dining rooms, accent walls' },
    { id: 'eggshell', name: 'Eggshell', gloss: '10–25', shine: 0.14,
      pros: ['Wipes clean easily', 'Low sheen still hides most flaws', 'Good all-round wall finish'],
      cons: ['Touch-ups show more than Flat or Matte', 'Slight sheen shows bumps in low, raking light'],
      best: 'Most walls, hallways, home offices, kids’ rooms' },
    { id: 'satin', name: 'Satin', gloss: '25–35', shine: 0.24,
      pros: ['Scrubbable and stands up to moisture', 'Durable in busy rooms', 'Soft glow that brightens a room'],
      cons: ['Shows roller marks and wall flaws', 'Touch-ups can flash as shiny patches'],
      best: 'Kitchens, bathrooms, kids’ rooms, trim' },
    { id: 'semigloss', name: 'Semi-Gloss', gloss: '35–70', shine: 0.38,
      pros: ['Very durable and easy to clean', 'Resists moisture and mildew', 'Crisp, clean look on trim and doors'],
      cons: ['Highlights every dent and patch', 'Can glare on large walls'],
      best: 'Trim, doors, cabinets, bathrooms' },
    { id: 'gloss', name: 'Gloss', gloss: '70+', shine: 0.55,
      pros: ['Toughest, most cleanable finish', 'Bold, lacquered look that makes color richer'],
      cons: ['Shows every flaw, so it needs smooth prep', 'Hardest to apply evenly'],
      best: 'Front doors, furniture, cabinets, statement trim' },
  ];
  const SHEEN_BY_ID = Object.fromEntries(SHEENS.map(s => [s.id, s]));
  const sheenText = (ids, note) => ids.map(i => SHEEN_BY_ID[i].name).join(' or ') + (note ? ` (${note})` : '');

  const SPACES = {
    living: { label: 'Living Room', kind: 'interior', sheens: ['matte', 'eggshell'] },
    bedroom: { label: 'Bedroom', kind: 'interior', sheens: ['matte', 'eggshell'], sleep: true },
    kitchen: { label: 'Kitchen', kind: 'interior', sheens: ['satin', 'eggshell'], sheenNote: 'scrubbable', wet: true },
    bathroom: { label: 'Bathroom', kind: 'interior', sheens: ['satin', 'semigloss'], sheenNote: 'moisture resistant', wet: true },
    dining: { label: 'Dining Room', kind: 'interior', sheens: ['matte', 'eggshell'] },
    office: { label: 'Home Office', kind: 'interior', sheens: ['eggshell'] },
    kids: { label: 'Kids’ Room', kind: 'interior', sheens: ['eggshell', 'satin'], sheenNote: 'washable', sleep: true, kid: true },
    nursery: { label: 'Nursery', kind: 'interior', sheens: ['eggshell', 'satin'], sheenNote: 'washable', sleep: true, kid: true },
    entry: { label: 'Hallway / Entry', kind: 'interior', sheens: ['eggshell', 'satin'], sheenNote: 'high traffic', busy: true },
    stairs: { label: 'Stairway & Landing', kind: 'interior', sheens: ['eggshell', 'satin'], sheenNote: 'high traffic', busy: true, tall: true },
    laundry: { label: 'Laundry / Mudroom', kind: 'interior', sheens: ['satin', 'semigloss'], sheenNote: 'moisture resistant', wet: true, busy: true },
    sunroom: { label: 'Sunroom', kind: 'interior', sheens: ['matte', 'eggshell'], sunny: true },
    garage: { label: 'Garage', kind: 'interior', sheens: ['eggshell', 'satin'], sheenNote: 'scrubbable', busy: true, dimByNature: true },
    basement: { label: 'Basement', kind: 'interior', sheens: ['eggshell', 'satin'], dimByNature: true },
    accent: { label: 'Accent Wall', kind: 'interior', sheens: ['matte', 'eggshell'], sheenNote: 'match the room', accent: true },
    ceiling: { label: 'Ceiling', kind: 'interior', sheens: ['flat'], sheenNote: 'hides flaws overhead', surface: 'ceiling' },
    trim: { label: 'Trim & Doors', kind: 'interior', sheens: ['semigloss', 'satin'], sheenNote: 'enamel', surface: 'trim' },
    cabinets: { label: 'Cabinets', kind: 'interior', sheens: ['satin', 'semigloss'], sheenNote: 'cabinet enamel', surface: 'cabinets' },
    furniture: { label: 'Furniture', kind: 'interior', sheens: ['satin', 'semigloss'], sheenNote: 'hard-wearing enamel', surface: 'furniture', busy: true },
    ext_body: { label: 'House Siding', kind: 'exterior', sheens: ['flat', 'satin'], sheenNote: 'exterior paint', surface: 'body' },
    ext_trim: { label: 'Exterior Trim', kind: 'exterior', sheens: ['satin', 'semigloss'], sheenNote: 'exterior paint', surface: 'trim' },
    front_door: { label: 'Front Door', kind: 'exterior', sheens: ['semigloss', 'gloss'], sheenNote: 'exterior paint', surface: 'door', accent: true },
  };
  for (const sp of Object.values(SPACES)) sp.sheen = sheenText(sp.sheens, sp.sheenNote);

  const STYLES = {
    modern: { label: 'Modern & Minimal', fam: { white: 1, gray: 1, black: 0.85, beige: 0.55, blue: 0.4, green: 0.35, brown: 0.3 }, chroma: [0, 8], temp: 'neutral', depth: 78 },
    cozy: { label: 'Warm & Cozy', fam: { beige: 1, white: 0.75, brown: 0.85, orange: 0.65, red: 0.5, green: 0.55, yellow: 0.55, pink: 0.4 }, chroma: [3, 30], temp: 'warm', depth: 62 },
    coastal: { label: 'Coastal', fam: { white: 1, blue: 1, green: 0.65, beige: 0.6, gray: 0.55 }, chroma: [2, 24], temp: 'cool', depth: 74 },
    farmhouse: { label: 'Farmhouse', fam: { white: 1, beige: 1, gray: 0.7, green: 0.7, black: 0.5, blue: 0.4, brown: 0.45 }, chroma: [0, 14], temp: 'warm', depth: 72 },
    traditional: { label: 'Traditional', fam: { beige: 1, white: 0.7, green: 0.7, blue: 0.7, red: 0.6, yellow: 0.5, brown: 0.55 }, chroma: [3, 32], temp: 'warm', depth: 58 },
    scandi: { label: 'Scandinavian', fam: { white: 1, gray: 0.9, beige: 0.75, green: 0.5, blue: 0.5, pink: 0.4 }, chroma: [0, 8], temp: 'neutral', depth: 80 },
    moody: { label: 'Moody & Dramatic', fam: { black: 1, blue: 1, green: 1, purple: 0.65, red: 0.6, brown: 0.75, gray: 0.8 }, chroma: [0, 32], temp: null, depth: 12 },
    midcentury: { label: 'Mid-Century Modern', fam: { orange: 1, yellow: 1, green: 1, blue: 0.8, brown: 0.7, white: 0.45, red: 0.5 }, chroma: [12, 55], temp: 'warm', depth: 48 },
    boho: { label: 'Boho', fam: { orange: 1, pink: 0.85, brown: 0.85, green: 0.75, yellow: 0.7, beige: 0.7, purple: 0.3, red: 0.5 }, chroma: [8, 40], temp: 'warm', depth: 55 },
    industrial: { label: 'Industrial', fam: { gray: 1, black: 1, white: 0.5, blue: 0.5, brown: 0.55, green: 0.4 }, chroma: [0, 14], temp: 'cool', depth: 45 },
    japandi: { label: 'Japandi', fam: { beige: 1, white: 0.9, brown: 0.85, green: 0.7, gray: 0.7, black: 0.5 }, chroma: [0, 12], temp: 'warm', depth: 66 },
    mediterranean: { label: 'Mediterranean', fam: { white: 1, orange: 0.9, yellow: 0.8, blue: 0.8, green: 0.8, beige: 0.75 }, chroma: [3, 40], temp: 'warm', depth: 64 },
  };

  const FAMILY_CHOICES = {
    white: 'Whites', 'warm-neutral': 'Beiges & Greiges', 'cool-neutral': 'Grays', green: 'Greens', blue: 'Blues',
    earthy: 'Earthy & Terracotta', 'pink-purple': 'Pinks & Purples', dark: 'Blacks & Deep Darks', bold: 'Bold & Bright',
  };
  const DEPTHS = { light: 'Light & Airy', mid: 'In Between', deep: 'Deep & Moody', any: 'Not Sure' };
  const FACING = { north: 'North', south: 'South', east: 'East', west: 'West', unsure: 'Not Sure', none: 'No Windows' };
  const AMOUNTS = { low: 'Dim', medium: 'Some Light', high: 'Bright' };
  const BULBS = { warm: 'Warm (2700K)', soft: 'Soft White (3000K)', daylight: 'Daylight (5000K)', unsure: 'Not Sure' };
  const SIDING = { vinyl: 'Vinyl', wood: 'Wood Lap', fiber: 'Fiber Cement', shake: 'Shingle or Shake', board: 'Board & Batten', stucco: 'Stucco', brick: 'Brick or Masonry' };
  // Things that stay: floors and carpet, trim and molding, counters, cabinets, furniture, fixtures, walls, and for
  // exteriors the roof, masonry, siding, trim and windows. Each has a typical color so the logic can compare undertones,
  // lightness and hue against every paint color. "kind" decides which rules apply and where it shows in the preview.
  const FX = (id, kind, label, hex) => ({ id, kind, label, hex });
  const FIXED_ITEMS = [
    FX('floor-light-oak', 'floor', 'Light Oak Floors', 'C8A57A'),
    FX('warm-wood', 'floor', 'Honey or Orange Wood Floors', 'B5763C'),
    FX('floor-cherry', 'floor', 'Cherry or Red Oak Floors', '8C4630'),
    FX('floor-walnut', 'floor', 'Dark Walnut or Espresso Floors', '4A3326'),
    FX('floor-gray-wood', 'floor', 'Gray Wood or LVP Floors', '9A9894'),
    FX('floor-blond', 'floor', 'Whitewashed or Blond Wood Floors', 'DCCCB5'),
    FX('floor-carpet-cream', 'carpet', 'Cream Carpet', 'E4DCCB'),
    FX('floor-carpet-beige', 'carpet', 'Beige Carpet', 'CDBFA7'),
    FX('floor-carpet-oatmeal', 'carpet', 'Oatmeal or Greige Carpet', 'BDB4A6'),
    FX('floor-carpet-gray', 'carpet', 'Gray Carpet', 'A6A6A3'),
    FX('floor-carpet-brown', 'carpet', 'Brown or Tan Carpet', '8E7660'),
    FX('cool-tile', 'floor', 'Gray Tile or Stone Floors', 'A8AAAA'),
    FX('floor-white-tile', 'floor', 'White or Marble Tile', 'ECEBE7'),
    FX('floor-travertine', 'floor', 'Beige Tile or Travertine', 'D3C3A5'),
    FX('floor-concrete', 'floor', 'Concrete Floors', 'A4A29D'),
    FX('trim-white', 'trim', 'Bright White Trim', 'F4F4F1'),
    FX('trim-cream', 'trim', 'Cream or Off-White Trim', 'EEE6D5'),
    FX('trim-wood', 'trim', 'Stained Wood Trim', 'A0683A'),
    FX('trim-dark', 'trim', 'Black or Dark Trim', '2C2D2F'),
    FX('counter-white', 'counter', 'White Quartz or Marble Counters', 'EDEDEA'),
    FX('counter-gray', 'counter', 'Gray Quartz or Granite Counters', '9B9C9B'),
    FX('counter-black', 'counter', 'Black Granite Counters', '2A2A2B'),
    FX('counter-beige', 'counter', 'Beige or Brown Granite Counters', 'B5A083'),
    FX('counter-butcher', 'counter', 'Butcher Block Counters', 'B98A58'),
    FX('white-cabinets', 'cabinet', 'White Cabinets', 'F4F3EF'),
    FX('cab-wood', 'cabinet', 'Wood Cabinets', 'A26F3E'),
    FX('cab-gray', 'cabinet', 'Gray Cabinets', '8F9396'),
    FX('cab-dark', 'cabinet', 'Dark or Black Cabinets', '2E2F31'),
    FX('sofa-gray', 'furniture', 'Gray Fabrics', '8E9091'),
    FX('sofa-cream', 'furniture', 'Cream or Beige Fabrics', 'D9CEBB'),
    FX('sofa-leather', 'furniture', 'Brown Leather', '7A4A2C'),
    FX('sofa-navy', 'furniture', 'Navy or Blue Fabrics', '2F3E5C'),
    FX('sofa-green', 'furniture', 'Green Fabrics', '4F6B4C'),
    FX('sofa-blush', 'furniture', 'Blush or Pink Fabrics', 'D6A79D'),
    FX('sofa-mustard', 'furniture', 'Mustard or Rust Fabrics', 'B7832F'),
    FX('furn-light-wood', 'furniture', 'Light Wood Furniture', 'C9A97F'),
    FX('dark-furniture', 'furniture', 'Dark Wood Furniture', '3F2E25'),
    FX('brass', 'fixture', 'Brass or Gold', 'B8954A'),
    FX('fix-chrome', 'fixture', 'Chrome or Nickel', 'C3C6C8'),
    FX('fix-black', 'fixture', 'Matte Black', '2B2B2C'),
    FX('brick', 'stone', 'Red Brick Fireplace', 'A04A33'),
    FX('stone-gray', 'stone', 'Gray Stone Fireplace', '8D8C88'),
    FX('stone-tan', 'stone', 'Tan Stone Fireplace', 'B8A486'),
    FX('walls-white', 'wall', 'White Walls', 'F0EEE8'),
    FX('walls-warm', 'wall', 'Beige or Greige Walls', 'D6CCBC'),
    FX('walls-gray', 'wall', 'Gray Walls', 'C2C4C3'),
    FX('walls-color', 'wall', 'Blue or Green Walls', '9DAEA9'),
    FX('walls-dark', 'wall', 'Dark Walls', '4A4F55'),
    FX('roof-black', 'roof', 'Black or Charcoal Roof', '35373A'),
    FX('roof-gray', 'roof', 'Gray or Weathered Roof', '7A7B79'),
    FX('roof-brown', 'roof', 'Brown Roof', '5F4938'),
    FX('roof-red', 'roof', 'Red or Terracotta Tile Roof', 'A3553C'),
    FX('roof-green', 'roof', 'Green Metal Roof', '3F5A47'),
    FX('ext-brick-red', 'stone', 'Red Brick', '9B4A35'),
    FX('ext-brick-tan', 'stone', 'Tan or Buff Brick', 'C2A27E'),
    FX('ext-stone-gray', 'stone', 'Gray Stone', '8E8D89'),
    FX('ext-stone-tan', 'stone', 'Tan or Brown Stone', 'A68E6E'),
    FX('siding-white', 'siding', 'White Siding', 'EEEDE8'),
    FX('siding-light', 'siding', 'Light Gray or Beige Siding', 'CFCBC2'),
    FX('siding-mid', 'siding', 'Mid Gray or Taupe Siding', '9B968D'),
    FX('siding-dark', 'siding', 'Dark Gray or Charcoal Siding', '4E5256'),
    FX('siding-color', 'siding', 'Blue or Green Siding', '6E8490'),
    FX('xtrim-white', 'trim', 'White Trim', 'F3F2EE'),
    FX('xtrim-cream', 'trim', 'Cream Trim', 'EDE3CF'),
    FX('xtrim-dark', 'trim', 'Black or Dark Trim', '2C2D2F'),
    FX('win-white', 'window', 'White Windows', 'F2F2EE'),
    FX('win-almond', 'window', 'Almond or Tan Windows', 'D8CDB6'),
    FX('win-bronze', 'window', 'Bronze Windows', '4E4036'),
    FX('win-black', 'window', 'Black Windows', '2A2B2C'),
  ];
  // short chip names for question 5 (the full names are used in warnings and summaries)
  const SHORT = {
    'floor-light-oak': 'Light Oak', 'warm-wood': 'Honey Oak', 'floor-cherry': 'Cherry / Red Oak', 'floor-walnut': 'Dark Walnut', 'floor-gray-wood': 'Gray Wood / LVP', 'floor-blond': 'Blond Wood',
    'floor-carpet-cream': 'Cream Carpet', 'floor-carpet-beige': 'Beige Carpet', 'floor-carpet-oatmeal': 'Oatmeal Carpet', 'floor-carpet-gray': 'Gray Carpet', 'floor-carpet-brown': 'Brown Carpet',
    'cool-tile': 'Gray Tile', 'floor-white-tile': 'White Tile', 'floor-travertine': 'Beige Tile', 'floor-concrete': 'Concrete',
    'trim-white': 'Bright White', 'trim-cream': 'Cream', 'trim-wood': 'Stained Wood', 'trim-dark': 'Black',
    'counter-white': 'White Quartz', 'counter-gray': 'Gray Stone', 'counter-black': 'Black Granite', 'counter-beige': 'Beige Granite', 'counter-butcher': 'Butcher Block',
    'white-cabinets': 'White', 'cab-wood': 'Wood', 'cab-gray': 'Gray', 'cab-dark': 'Black',
    'sofa-gray': 'Gray', 'sofa-cream': 'Cream', 'sofa-leather': 'Brown Leather', 'sofa-navy': 'Navy', 'sofa-green': 'Green', 'sofa-blush': 'Blush', 'sofa-mustard': 'Mustard', 'furn-light-wood': 'Light Wood', 'dark-furniture': 'Dark Wood',
    brass: 'Brass', 'fix-chrome': 'Chrome', 'fix-black': 'Matte Black', brick: 'Red Brick', 'stone-gray': 'Gray Stone', 'stone-tan': 'Tan Stone',
    'walls-white': 'White', 'walls-warm': 'Beige', 'walls-gray': 'Gray', 'walls-color': 'Blue / Green', 'walls-dark': 'Dark',
    'roof-black': 'Black', 'roof-gray': 'Gray', 'roof-brown': 'Brown', 'roof-red': 'Red Tile', 'roof-green': 'Green Metal',
    'ext-brick-red': 'Red Brick', 'ext-brick-tan': 'Tan Brick', 'ext-stone-gray': 'Gray Stone', 'ext-stone-tan': 'Tan Stone',
    'siding-white': 'White', 'siding-light': 'Light', 'siding-mid': 'Mid Gray', 'siding-dark': 'Charcoal', 'siding-color': 'Blue / Green',
    'xtrim-white': 'White', 'xtrim-cream': 'Cream', 'xtrim-dark': 'Black', 'win-white': 'White', 'win-almond': 'Almond', 'win-bronze': 'Bronze', 'win-black': 'Black',
  };
  const describeItem = hex => { const d = C.describe(hex); return { lab: d.lab, L: d.L, C: d.C, h: d.h, temp: d.temperature, ut: d.undertone, fam: d.family }; };
  for (const f of FIXED_ITEMS) Object.assign(f, describeItem(f.hex), { short: SHORT[f.id] || f.label });
  const FIXED_BY_ID = Object.fromEntries(FIXED_ITEMS.map(f => [f.id, f]));
  const FIXED = Object.fromEntries(FIXED_ITEMS.map(f => [f.id, f.label]));
  const FIXED_KINDS = { floor: 'Floor', carpet: 'Carpet', trim: 'Trim', counter: 'Countertop', cabinet: 'Cabinets', furniture: 'Furniture or fabric', fixture: 'Fixture', stone: 'Stone or brick', wall: 'Walls', siding: 'Siding', roof: 'Roof', window: 'Windows', custom: 'Other' };
  const ids = kind => FIXED_ITEMS.filter(f => f.kind === kind).map(f => f.id);
  const HARD_FLOORS = ['floor-light-oak', 'warm-wood', 'floor-cherry', 'floor-walnut', 'floor-gray-wood', 'floor-blond', 'cool-tile', 'floor-white-tile', 'floor-travertine', 'floor-concrete'];
  // Question 5 groups. one: true means one pick per group (tap another to switch). Flags are yes/no extras.
  // Floors are asked in two taps: the type first (wood, carpet, tile, concrete), then its color
  const WOOD = ['floor-light-oak', 'warm-wood', 'floor-cherry', 'floor-walnut', 'floor-gray-wood', 'floor-blond'];
  const TILE = ['cool-tile', 'floor-white-tile', 'floor-travertine'];
  const FLOOR_TYPES = { wood: { label: 'Wood or LVP', ids: WOOD }, carpet: { label: 'Carpet', ids: ids('carpet') }, tile: { label: 'Tile or Stone', ids: TILE }, concrete: { label: 'Concrete', ids: ['floor-concrete'] } };
  const HARD_TYPES = { wood: FLOOR_TYPES.wood, tile: FLOOR_TYPES.tile, concrete: FLOOR_TYPES.concrete };
  const FIXED_GROUPS = {
    floor: { title: 'Floor', one: true, types: FLOOR_TYPES, ids: [...WOOD, ...ids('carpet'), ...TILE, 'floor-concrete'] },
    floorHard: { title: 'Floor', one: true, types: HARD_TYPES, ids: HARD_FLOORS },
    trim: { title: 'Trim, Baseboards & Crown', one: true, ids: ['trim-white', 'trim-cream', 'trim-wood', 'trim-dark'], flags: { trimPaint: 'Painting the trim too', crown: 'Has crown molding' } },
    trimFlags: { title: 'Molding', flags: { crown: 'Has crown molding' } },
    furniture: { title: 'Furniture & Fabrics', max: 2, ids: ids('furniture') },
    bedding: { title: 'Bedding & Furniture', max: 2, ids: ids('furniture') },
    fireplace: { title: 'Fireplace', one: true, ids: ['brick', 'stone-gray', 'stone-tan'] },
    cabinets: { title: 'Cabinets', one: true, ids: ids('cabinet') },
    vanity: { title: 'Vanity', one: true, ids: ids('cabinet') },
    counters: { title: 'Countertops', one: true, ids: ids('counter') },
    fixtures: { title: 'Faucets & Hardware', one: true, ids: ids('fixture') },
    walls: { title: 'Walls Staying', one: true, ids: ids('wall') },
    otherWalls: { title: 'Other Walls', one: true, ids: ids('wall') },
    roof: { title: 'Roof', one: true, ids: ids('roof') },
    masonry: { title: 'Brick or Stone', one: true, ids: ['ext-brick-red', 'ext-brick-tan', 'ext-stone-gray', 'ext-stone-tan'] },
    siding: { title: 'Siding Staying', one: true, ids: ids('siding') },
    xtrim: { title: 'Trim Staying', one: true, ids: ['xtrim-white', 'xtrim-cream', 'xtrim-dark'] },
    windows: { title: 'Windows', one: true, ids: ids('window') },
  };
  // Which groups each job asks about, most important first
  const SPACE_GROUPS = {
    living: ['floor', 'trim', 'furniture', 'fireplace'],
    dining: ['floor', 'trim', 'furniture'],
    office: ['floor', 'trim', 'furniture'],
    entry: ['floor', 'trim'],
    stairs: ['floor', 'trim'],
    laundry: ['cabinets', 'counters', 'floorHard', 'trim'],
    sunroom: ['floor', 'trim', 'furniture'],
    garage: ['floorHard', 'trim'],
    basement: ['floor', 'trim', 'furniture'],
    bedroom: ['floor', 'trim', 'bedding'],
    kids: ['floor', 'trim', 'bedding'],
    nursery: ['floor', 'trim', 'bedding'],
    kitchen: ['cabinets', 'counters', 'floorHard', 'fixtures', 'trim'],
    bathroom: ['vanity', 'counters', 'floorHard', 'fixtures', 'trim'],
    accent: ['otherWalls', 'floor', 'furniture'],
    ceiling: ['walls', 'trimFlags'],
    trim: ['walls', 'floor', 'trimFlags'],
    cabinets: ['counters', 'floorHard', 'fixtures', 'walls'],
    furniture: ['floor', 'walls'],
    ext_body: ['roof', 'masonry', 'xtrim', 'windows'],
    ext_trim: ['roof', 'siding', 'windows'],
    front_door: ['siding', 'xtrim', 'roof'],
  };
  const groupsFor = space => (SPACE_GROUPS[space] || SPACE_GROUPS.living).map(k => Object.assign({ key: k }, FIXED_GROUPS[k]));
  const allowedFixed = space => new Set(groupsFor(space).flatMap(g => g.ids || []));
  // Ceiling and trim jobs ask "what kind of white" instead of color families
  const WHITE_TYPES = {
    ceiling: { crisp: 'Crisp, Bright White', warm: 'Soft, Warm White', tint: 'A Light Tint of the Walls', bold: 'Something Bold' },
    trim: { crisp: 'Crisp, Bright White', warm: 'Soft, Warm White', match: 'Match the Walls', dark: 'Black or Dark' },
  };
  const LIGHTS = [
    { id: 'daylight', label: 'Daylight', cct: 6500, intensity: 1 },
    { id: 'north', label: 'North Light', cct: 7600, intensity: 0.86 },
    { id: 'sun', label: 'Afternoon Sun', cct: 4900, intensity: 1.07 },
    { id: 'golden', label: 'Golden Hour', cct: 3100, intensity: 0.92 },
    { id: 'warm', label: 'Warm Bulbs', cct: 2700, intensity: 0.82 },
    { id: 'soft', label: 'Soft White Bulbs', cct: 3000, intensity: 0.86 },
    { id: 'cool', label: 'Daylight Bulbs', cct: 5000, intensity: 0.92 },
    { id: 'dim', label: 'Dim Corner', cct: 3600, intensity: 0.55 },
  ];

  const DEFAULT_ANSWERS = { space: 'living', size: 'medium', siding: 'wood', facing: 'unsure', facings: [], amount: 'medium', bulbs: 'unsure', styles: [], families: [], depth: 'any', fixed: [], customFixed: [], whiteType: '', trimPaint: false, crown: false,
    mode: 'basic', feel: '', undertone: '', avoid: [], nowKind: '', nowHex: '', surface: '', issues: [] };
  // ---------------- advanced questions ----------------
  const MOODS = { calm: 'Calm & Restful', cozy: 'Cozy & Warm', airy: 'Bright & Airy', fresh: 'Fresh & Energizing', dramatic: 'Bold & Dramatic' };
  const UNDERTONES = { warm: 'Warm', cool: 'Cool', neutral: 'True Neutral' };
  const NOW_COLORS = { none: 'Not Painted Yet', white: 'White or Off-White', light: 'A Light Color', mid: 'A Medium Color', dark: 'A Dark Color', bright: 'Bright Red, Orange or Yellow' };
  const NOW_HEX = { white: 'F1EFE8', light: 'DCD3C4', mid: 'A79C8C', dark: '4A4A48', bright: 'C8452F' };
  // what the surface is, by job
  const SURFACES = {
    painted: 'Already Painted', drywall_new: 'New Drywall', plaster: 'Plaster', paneling: 'Wood Paneling',
    bare_wood: 'Bare Wood', stained_wood: 'Stained or Varnished Wood', laminate: 'Laminate or Melamine', mdf: 'MDF',
    metal: 'Metal', masonry: 'Brick, Stucco or Concrete', vinyl: 'Vinyl Siding', fiberglass: 'Fiberglass Door',
  };
  function surfacesFor(space) {
    const sp = SPACES[space] || SPACES.living;
    if (sp.surface === 'cabinets' || sp.surface === 'furniture') return ['painted', 'stained_wood', 'bare_wood', 'laminate', 'mdf'].concat(sp.surface === 'furniture' ? ['metal'] : []);
    if (sp.surface === 'trim') return ['painted', 'bare_wood', 'stained_wood', 'mdf'];
    if (sp.surface === 'ceiling') return ['painted', 'drywall_new', 'plaster'];
    if (sp.surface === 'door') return ['painted', 'bare_wood', 'metal', 'fiberglass'];
    if (sp.kind === 'exterior') return sp.surface === 'body' ? ['painted', 'bare_wood', 'vinyl', 'masonry'] : ['painted', 'bare_wood', 'metal'];
    return ['painted', 'drywall_new', 'plaster', 'paneling', 'masonry'];
  }
  const ISSUES = { stains: 'Water or Smoke Stains', glossy: 'Shiny or Glossy Paint', oil: 'Old Oil-Based Paint', knots: 'Knots or Sap', mildew: 'Mildew' };
  // the color that's on it now, as a hex (a picked color or the chip for the kind of color)
  const nowHexOf = a => (a.nowHex && /^[0-9A-F]{6}$/i.test(a.nowHex) ? a.nowHex : NOW_HEX[a.nowKind] || '');

  // ---------------- primer ----------------
  // Well-known primers by job. A store's own paint brand comes first where it has one for the job; Zinsser and
  // KILZ are sold almost everywhere.
  const PRIMERS = {
    stain: [['zinsser', 'Zinsser B-I-N Shellac Primer', 'Seals water stains, smoke, marker and knots in one coat.'], ['kilz', 'KILZ Original Primer', 'Oil-based stain blocker for water, smoke and tannin stains.'], ['sw', 'Sherwin-Williams PrepRite ProBlock Primer', 'Blocks stains and seals problem surfaces.'], ['bm', 'Benjamin Moore Fresh Start Multi-Purpose Oil-Based Primer', 'Oil-based primer that blocks stains.']],
    bond: [['sw', 'Sherwin-Williams Extreme Bond Primer', 'Sticks to glossy paint, laminate and tile after a light scuff sand.'], ['bm', 'Benjamin Moore Stix Waterborne Bonding Primer', 'Grips slick surfaces like laminate, glass and glossy paint.'], ['behr', 'Behr Bonding Primer', 'Helps paint stick to glossy and hard surfaces.'], ['valspar', 'Valspar Stainblocking Bonding Primer', 'Bonds to glossy surfaces and blocks light stains.'], ['glidden', 'Glidden Gripper Primer', 'Grips glossy and hard-to-paint surfaces.'], ['kilz', 'KILZ Adhesion Primer', 'Made for slick surfaces like laminate, tile and glossy paint.'], ['zinsser', 'Zinsser Bulls Eye 1-2-3 Primer', 'All-purpose primer with good grip.']],
    drywall: [['sw', 'Sherwin-Williams PrepRite 200 Interior Latex Primer', 'Seals new drywall so the paint dries even.'], ['behr', 'Behr Drywall Primer & Sealer', 'Seals new drywall and joint compound.'], ['kilz', 'KILZ PVA Drywall Primer', 'Low-cost sealer for new drywall.'], ['zinsser', 'Zinsser Bulls Eye 1-2-3 Primer', 'Seals new drywall and patches.']],
    hide: [['bm', 'Benjamin Moore Fresh Start High-Hiding All Purpose Primer', 'Covers the old color so the new one needs fewer coats.'], ['sw', 'Sherwin-Williams Multi-Purpose Interior/Exterior Latex Primer', 'Covers the old color and can be tinted toward the new one.'], ['kilz', 'KILZ 2 All-Purpose Primer', 'Hides the old color and seals light stains.'], ['zinsser', 'Zinsser Bulls Eye 1-2-3 Primer', 'Hides the old color and can be tinted.']],
    wood: [['zinsser', 'Zinsser Bulls Eye 1-2-3 Primer', 'Water-based primer for bare wood indoors.'], ['kilz', 'KILZ 2 All-Purpose Primer', 'Seals bare wood before painting.'], ['sw', 'Sherwin-Williams Multi-Purpose Interior/Exterior Latex Primer', 'Seals bare wood before painting.'], ['bm', 'Benjamin Moore Fresh Start High-Hiding All Purpose Primer', 'Seals bare wood before painting.']],
    tannin: [['zinsser', 'Zinsser Cover Stain Primer', 'Oil-based primer that stops cedar, redwood and knots from bleeding through.'], ['kilz', 'KILZ Original Primer', 'Oil-based primer that stops tannin and knot bleed.'], ['sw', 'Sherwin-Williams Exterior Oil-Based Wood Primer', 'Seals bare exterior wood and stops tannin bleed.'], ['bm', 'Benjamin Moore Fresh Start Multi-Purpose Oil-Based Primer', 'Oil-based primer that stops tannin bleed.']],
    masonry: [['sw', 'Sherwin-Williams Loxon Concrete & Masonry Primer', 'Made for stucco, brick and concrete.'], ['', 'A masonry primer', 'Brick, stucco and concrete need a primer made for masonry.']],
    metal: [['rustoleum', 'Rust-Oleum Clean Metal Primer', 'Keeps bare metal from rusting under the paint.'], ['rustoleum', 'Rust-Oleum Rusty Metal Primer', 'For metal with light rust after wire-brushing.']],
  };
  function primerFor(a, color, settings) {
    a = Object.assign({}, DEFAULT_ANSWERS, a || {});
    const s = settings || {};
    const sp = SPACES[a.space] || SPACES.living;
    const issues = a.issues || [];
    const now = nowHexOf(a);
    const tips = [];
    let need = '';
    const surf = a.surface || '';
    if (issues.includes('stains')) need = 'stain';
    else if (surf === 'laminate' || issues.includes('glossy') || issues.includes('oil') || (surf === 'stained_wood')) need = 'bond';
    else if (surf === 'metal') need = 'metal';
    else if (surf === 'masonry') need = 'masonry';
    else if (surf === 'bare_wood' || surf === 'paneling') need = (sp.kind === 'exterior' || issues.includes('knots')) ? 'tannin' : 'wood';
    else if (issues.includes('knots')) need = 'tannin';
    else if (surf === 'drywall_new' || surf === 'plaster' || surf === 'mdf') need = 'drywall';
    // a big jump in color: a hiding primer, tinted toward the new color
    let change = 0;
    if (now && color) {
      change = Math.abs(C.hexToLab(now)[0] - color.L);
      const nowC = C.labToLch(C.hexToLab(now))[1];
      if (!need && (change > 35 || (nowC > 40 && color.L > 60))) need = 'hide';
    }
    if (color && (color.lrv < 15 || (color.C > 45 && color.L < 60))) tips.push('Deep and bright colors cover best over a gray-tinted primer. Ask the counter to tint the primer to the right gray.');
    else if (need && need !== 'metal' && need !== 'masonry') tips.push('Have the primer tinted toward the new color so it covers in fewer coats.');
    if (issues.includes('mildew')) tips.push('Clean mildew with a mildew cleaner and let it dry before priming, or it will grow back through the paint.');
    if (issues.includes('glossy') || issues.includes('oil') || surf === 'laminate' || surf === 'stained_wood') tips.push('Scuff-sand glossy surfaces and wipe off the dust first. Primer sticks far better to a dull surface.');
    if (issues.includes('oil')) tips.push('Not sure if it’s oil-based? Rub a spot with rubbing alcohol: latex paint comes off on the rag, oil-based paint doesn’t.');
    if (surf === 'vinyl') tips.push('Vinyl in good shape usually needs no primer, just a vinyl-safe paint color. Clean it well first.');
    // coats
    let coats = 2;
    if (!need && change > 35) coats = 3;
    if (surf === 'drywall_new' && !need) coats = 3;
    const list = need ? PRIMERS[need] : [];
    const en = s.brands || {};
    const store = s.storeBrand;
    const picks = list.filter(([b]) => !b || b === 'zinsser' || b === 'kilz' || b === 'rustoleum' || en[b] !== false || b === store)
      .sort((x, y) => (y[0] === store) - (x[0] === store));
    const products = picks.slice(0, 3).map(([brand, name, why]) => ({ brand, name, why }));
    const TITLES = { stain: 'A stain-blocking primer', bond: 'A bonding primer', drywall: 'A drywall primer', hide: 'A high-hiding primer', wood: 'A wood primer', tannin: 'An oil-based wood primer', masonry: 'A masonry primer', metal: 'A metal primer' };
    const why = { stain: 'Stains bleed through paint unless they’re sealed first.', bond: 'Paint won’t stick well to shiny or slick surfaces on its own.', drywall: 'New drywall soaks up paint unevenly until it’s sealed.', hide: 'The color is changing a lot, so a primer saves a coat or two.', wood: 'Bare wood soaks up paint and can raise the grain.', tannin: 'Wood like cedar, redwood and knotty pine bleeds tan stains through paint.', masonry: 'Masonry is rough and alkaline, so it needs its own primer.', metal: 'Bare metal rusts under paint without a metal primer.' };
    return { need, title: need ? TITLES[need] : 'No primer needed', why: need ? why[need] : (a.surface || now ? 'Paint and primer in one is enough here. Spot-prime any patches first.' : 'Most walls in good shape don’t need primer. Spot-prime patches, and prime if the color is changing a lot.'), products, tips, coats };
  }

  // ---------------- collections inside a brand ----------------
  // Some brands split their colors into named collections that a store may or may not carry (fan decks, chip
  // displays, premium-only colors). Each color is placed by its code, which is how the brands number them.
  // The first matching test wins; the last entry of each list catches everything else.
  const COLLECTIONS = {
    bm: [
      { id: 'classic', label: 'Classic Color Collection', short: 'Classics', note: 'Numbered 001–1680', test: c => /^\d{3,4}$/.test(c) },
      { id: 'preview', label: 'Color Preview', short: 'Color Preview', note: 'Codes like 2000-10', test: c => /^2\d{3}-\d+$/.test(c) },
      { id: 'hc', label: 'Historical Colors', short: 'Historical', note: 'HC codes', test: c => /^HC-/.test(c) },
      { id: 'oc', label: 'Off-White Collection', short: 'Off-White', note: 'OC codes', test: c => /^OC-/.test(c) },
      { id: 'af', label: 'Affinity', short: 'Affinity', note: 'AF codes', test: c => /^AF-/.test(c) },
      { id: 'csp', label: 'Color Stories', short: 'Color Stories', note: 'CSP codes. Full-spectrum colors that only some premium lines (such as Aura) can mix', test: c => /^CSP-/.test(c) },
      { id: 'cc', label: 'Designer Classics', short: 'Designer Classics', note: 'CC codes', test: c => /^CC-/.test(c) },
      { id: 'cw', label: 'Williamsburg Collection', short: 'Williamsburg', note: 'CW codes', test: c => /^CW-/.test(c) },
      { id: 'es', label: 'Exterior Stain Colors', short: 'Stain Colors', note: 'ES codes', test: c => /^ES-/.test(c) },
      { id: 'other', label: 'Other Colors', short: 'Other', test: () => true },
    ],
    magnolia: [
      { id: 'main', label: 'Magnolia Home Palette', short: 'Main Palette', note: 'MAG codes', test: c => /^MAG\d/.test(c) },
      { id: 'castle', label: 'Castle Collection', short: 'Castle', note: 'MAGCC codes', test: c => /^MAGCC/.test(c) },
      { id: 'lake', label: 'Lake House Collection', short: 'Lake House', note: 'MAGLH codes', test: c => /^MAGLH/.test(c) },
      { id: 'other', label: 'Other Colors', short: 'Other', test: () => true },
    ],
    ck: [
      { id: 'deck', label: 'Color Fan Deck', short: 'Fan Deck', note: 'Codes like 01A-1', test: c => /^\d/.test(c) },
      { id: 'neutrals', label: 'Whites & Neutrals Card', short: 'Whites & Neutrals', note: 'N-, CW- and WNCC codes', test: c => /^(N-|CW-|WNCC)/.test(c) },
      { id: 'ext', label: 'Exterior Color Card', short: 'Exterior Card', note: 'EXTCC codes', test: c => /^EXTCC/.test(c) },
      { id: 'kids', label: 'Kids’ Rooms Card', short: 'Kids’ Rooms', note: 'KIDCC codes', test: c => /^KIDCC/.test(c) },
      { id: 'other', label: 'Other Colors', short: 'Other', test: () => true },
    ],
    ppg: [
      { id: 'ppg', label: 'PPG Color System', short: 'PPG Codes', note: 'Codes like PPG1025-1', test: c => /^PPG\d/.test(c) },
      { id: 'sidingsafe', label: 'Sidingsafe Vinyl Colors', short: 'Sidingsafe', note: 'PPG-SS codes, safe for vinyl siding', test: c => /^PPG-SS/.test(c) },
      { id: 'legacy', label: 'Older Color Codes', short: 'Older Codes', note: 'Codes like 30YY 64/082', test: () => true },
    ],
    glidden: [
      { id: 'ppg', label: 'PPG Color System', short: 'PPG Codes', note: 'Codes like PPG1025-1', test: c => /^PPG\d/.test(c) },
      { id: 'legacy', label: 'Older Color Codes', short: 'Older Codes', note: 'Codes like 30YY 64/082', test: () => true },
    ],
    dv: [
      { id: 'ow', label: 'Interior Whites', short: 'Interior Whites', note: 'OW codes', test: c => /^OW/.test(c) },
      { id: 'main', label: 'Color Essentials', short: 'Color Essentials', test: () => true },
    ],
  };
  function collectionOf(brandId, code) {
    const list = COLLECTIONS[brandId]; if (!list) return '';
    const hit = list.find(x => x.test(String(code)));
    return hit ? hit.id : '';
  }
  // collections listed in display order, each with how many colors it holds (empty ones are left out)
  function collectionsFor(brandId) {
    const list = COLLECTIONS[brandId]; if (!list) return [];
    const counts = {};
    for (const c of INDEX.byBrand[brandId] || []) counts[c.coll] = (counts[c.coll] || 0) + 1;
    return list.filter(x => counts[x.id]).map(x => ({ id: x.id, label: x.label, short: x.short, note: x.note || '', count: counts[x.id] }));
  }
  const collectionLabel = c => { const x = (COLLECTIONS[c.brand] || []).find(k => k.id === c.coll); return x ? x.label : ''; };
  // settings.collections holds only switched-off collections, as { 'bm:csp': false }
  const collectionOn = (c, cols) => !cols || !c.coll || cols[c.brand + ':' + c.coll] !== false;

  // ---------------- data index ----------------
  let INDEX = { colors: [], byBrand: {}, brands: [], brandById: {} };

  function init(brands, colorsByBrand) {
    const colors = []; const byBrand = {};
    for (const b of brands) {
      const rows = colorsByBrand[b.id] || [];
      byBrand[b.id] = [];
      for (const r of rows) {
        const [code, name, hex, lrv, flags, extra] = r;
        if (!/^[0-9A-F]{6}$/i.test(hex)) continue;
        const d = C.describe(hex, lrv);
        const c = { id: b.id + ':' + code, brand: b.id, code: String(code), name, hex: hex.toUpperCase(), lrv: lrv == null ? d.lrv : lrv, flags: flags | 0, extra: extra || '', coll: collectionOf(b.id, code), lab: d.lab, L: d.L, C: d.C, h: d.h, fam: d.family, ut: d.undertone, temp: d.temperature, neutral: d.neutral };
        colors.push(c); byBrand[b.id].push(c);
      }
    }
    INDEX = { colors, byBrand, brands, brandById: Object.fromEntries(brands.map(b => [b.id, b])) };
    return INDEX;
  }
  function addBrand(meta, rows) {
    const existing = INDEX.brands.filter(b => b.id !== meta.id);
    const map = {}; for (const b of existing) map[b.id] = null;
    INDEX.brands = existing.concat([meta]);
    INDEX.brandById[meta.id] = meta;
    const list = [];
    for (const r of rows) {
      const [code, name, hex, lrv, flags, extra] = r; const d = C.describe(hex, lrv);
      list.push({ id: meta.id + ':' + code, brand: meta.id, code: String(code), name, hex: hex.toUpperCase(), lrv: lrv == null ? d.lrv : lrv, flags: flags | 0, extra: extra || '', coll: collectionOf(meta.id, code), lab: d.lab, L: d.L, C: d.C, h: d.h, fam: d.family, ut: d.undertone, temp: d.temperature, neutral: d.neutral });
    }
    INDEX.colors = INDEX.colors.filter(c => c.brand !== meta.id).concat(list);
    INDEX.byBrand[meta.id] = list;
    return list.length;
  }
  const getIndex = () => INDEX;
  const findColor = id => INDEX.colors.find(c => c.id === id) || null;

  function codeLabel(c) {
    const b = INDEX.brandById[c.brand] || {};
    return b.prefix ? `${b.prefix} ${c.code}` : c.code;
  }

  // ---------------- helpers ----------------
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const isWhiteish = c => c.fam === 'white';
  const pinkish = c => c.neutral && (c.ut === 'pink' || c.ut === 'violet') && c.C > 4;
  const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  // Window directions. Rooms can have windows on several sides; `facings` is the list, `facing` the older single answer.
  const DIRS = ['north', 'east', 'south', 'west'];
  function facingsOf(a) {
    if (Array.isArray(a.facings) && a.facings.length) return a.facings.filter(d => DIRS.includes(d));
    return DIRS.includes(a.facing) ? [a.facing] : [];
  }
  const noWindows = a => a.facing === 'none' || (Array.isArray(a.facings) && a.facings.includes('none'));
  const hasDir = (a, d) => facingsOf(a).includes(d);
  const onlyNorth = a => { const f = facingsOf(a); return f.length > 0 && f.every(d => d === 'north'); };
  const lowLight = a => onlyNorth(a) || a.amount === 'low' || noWindows(a) || (SPACES[a.space] || {}).dimByNature;
  const brightWarmLight = a => (hasDir(a, 'south') || hasDir(a, 'west')) && a.amount === 'high';
  // "north-facing", "north- and east-facing", "windows on three sides"
  function facingPhrase(a) {
    const f = facingsOf(a);
    if (!f.length) return '';
    if (f.length === 1) return `${f[0]}-facing`;
    if (f.length === 2) return `${f[0]}- and ${f[1]}-facing`;
    return f.length === 3 ? 'three-sided' : 'four-sided';
  }

  function allowedColor(c, a, s) {
    if (s.brands && s.brands[c.brand] === false) return false;
    if ((c.flags & F.DISC) && !s.showDiscontinued) return false;
    if (!collectionOn(c, s.collections)) return false;
    const sp = SPACES[a.space] || SPACES.living;
    const knownIE = c.flags & (F.INT | F.EXT);
    if (sp.kind === 'exterior' && knownIE && !(c.flags & F.EXT)) return false;
    if (sp.kind === 'interior' && knownIE && !(c.flags & F.INT)) return false;
    return true;
  }

  // ---------------- target ----------------
  function target(a) {
    const sp = SPACES[a.space] || SPACES.living;
    let lo, hi, ideal;
    const depth = a.depth || 'any';
    if (depth === 'light') { lo = 58; hi = 92; ideal = 74; }
    else if (depth === 'mid') { lo = 26; hi = 62; ideal = 44; }
    else if (depth === 'deep') { lo = 2.5; hi = 28; ideal = 12; }
    else {
      lo = 30; hi = 90; ideal = 68;
      const st = (a.styles || []).map(s => STYLES[s]).filter(Boolean);
      if (st.length) { ideal = st.reduce((s, x) => s + x.depth, 0) / st.length; lo = Math.max(3, ideal - 30); hi = Math.min(93, ideal + 22); }
      const fams = a.families || [];
      if (fams.includes('dark')) { ideal = Math.min(ideal, 12); lo = 2.5; hi = Math.max(28, Math.min(hi, 40)); }
      else if (fams.length && fams.every(f => f === 'white')) { ideal = 84; lo = 76; hi = 93; }
    }
    // whites only: whites live around LRV 80-94 whatever "light" means elsewhere
    const famsOnly = a.families || [];
    if (famsOnly.length && famsOnly.every(f => f === 'white') && depth !== 'deep' && depth !== 'mid') { lo = 76; hi = 94; ideal = 86; }
    // surface rules
    if (sp.surface === 'ceiling' && depth !== 'deep' && depth !== 'mid') { lo = 78; hi = 95; ideal = 88; }
    if (sp.surface === 'trim' && depth === 'any') { lo = 72; hi = 94; ideal = 85; }
    if (sp.surface === 'door' && depth === 'any') { lo = 3; hi = 45; ideal = 16; }
    if (sp.surface === 'body' && depth === 'any') { lo = 18; hi = 80; ideal = 52; }
    if (sp.accent && depth === 'any' && !(a.styles || []).length) { lo = 6; hi = 55; ideal = 28; }
    // light and size nudges (dim rooms read darker, so steer a little lighter)
    if (depth !== 'deep' && sp.surface !== 'door') {
      if (lowLight(a)) ideal = Math.min(hi, ideal + 6);
      if (a.amount === 'high') ideal = Math.max(lo, ideal - 4);
      if (a.size === 'small' && sp.kind === 'interior' && !sp.accent) ideal = Math.min(hi, ideal + 3);
    }
    // vinyl siding: keep away from heat-absorbing darks
    if (sp.surface === 'body' && a.siding === 'vinyl') { lo = Math.max(lo, 45); ideal = Math.max(ideal, 58); if (hi < lo + 10) hi = lo + 25; }

    // chroma comfort range
    let cmin = 0, cmax = 30;
    const st = (a.styles || []).map(s => STYLES[s]).filter(Boolean);
    if (st.length) { cmin = Math.min(...st.map(x => x.chroma[0])); cmax = Math.max(...st.map(x => x.chroma[1])); }
    const fams = a.families || [];
    if (fams.includes('bold')) { cmin = Math.max(cmin, 35); cmax = 110; }
    else if (fams.some(f => ['green', 'blue', 'earthy', 'pink-purple'].includes(f))) cmax = Math.max(cmax, 40);
    if (fams.length && fams.every(f => f === 'white' || f === 'cool-neutral' || f === 'warm-neutral')) cmax = Math.min(cmax, 16);
    if (fams.length && fams.every(f => f === 'white')) cmax = Math.min(cmax, 8);
    if (sp.surface === 'ceiling' && depth !== 'deep') cmax = Math.min(cmax, 5);
    if (sp.surface === 'trim' && depth === 'any') cmax = Math.min(cmax, 7);
    if (sp.accent) cmax = Math.max(cmax, 45);
    // "what kind of white" answers for ceilings and trim (set in recommend)
    if (a.prefTemp === 'cool' && fams.length && fams.every(f => f === 'white')) { ideal = Math.max(ideal, 88); cmax = Math.min(cmax, 4.5); }
    if (a.darkTrim) { cmin = 0; cmax = 12; } // black, charcoal, navy, bronze
    if (a.tint) { lo = 58; hi = 90; ideal = 76; cmin = 3; cmax = 14; }
    if (a.bold) { lo = 5; hi = 70; ideal = 35; cmin = 8; cmax = 70; }
    if (a.matchWalls) {
      const w = fixedItems(a).find(f => f.kind === 'wall');
      if (w) { const wl = C.lrvFromHex(w.hex); lo = Math.max(2, wl - 12); hi = Math.min(95, wl + 12); ideal = wl; cmin = 0; cmax = Math.max(14, w.C + 6); }
      else { lo = 40; hi = 88; ideal = 66; cmin = 0; cmax = 16; }
    }
    // how the room should feel (advanced)
    if (a.feel === 'calm') { cmax = Math.min(cmax, 14); if (depth === 'any') ideal = Math.min(hi, ideal + 3); }
    if (a.feel === 'airy' && depth === 'any') { lo = Math.max(lo, 62); ideal = Math.max(ideal, 78); hi = Math.max(hi, 90); cmax = Math.min(cmax, 12); }
    if (a.feel === 'cozy' && depth === 'any') { ideal = Math.max(lo, ideal - 6); }
    if (a.feel === 'fresh') { cmin = Math.max(cmin, 6); cmax = Math.max(cmax, 30); }
    if (a.feel === 'dramatic' && depth === 'any') { lo = 3; hi = Math.min(hi, 45); ideal = 18; }
    if (cmin > cmax) cmin = Math.max(0, cmax - 10);
    return { lo, hi, ideal, cmin, cmax };
  }

  // ---------------- scoring parts ----------------
  function familyMatch(c, f) {
    switch (f) {
      case 'white': return c.fam === 'white' ? 1 : (c.L > 86 && c.C < 12 && (c.fam === 'beige' || c.fam === 'gray')) ? 0.45 : 0;
      case 'warm-neutral':
        if (c.fam === 'beige') return pinkish(c) || (c.ut === 'peach' && c.C > 9) ? 0.45 : 1;
        if (c.fam === 'brown') return c.L > 40 ? 0.8 : 0.5;
        if (c.fam === 'gray') return c.temp === 'warm' ? 0.75 : 0.25;
        if (c.fam === 'white') return c.temp === 'warm' ? 0.55 : 0.2;
        return 0;
      case 'cool-neutral':
        if (c.fam === 'gray') return c.temp === 'warm' ? 0.75 : 1;
        if (c.fam === 'white') return c.temp === 'warm' ? 0.2 : 0.55;
        if (c.fam === 'blue' && c.C < 12) return 0.6;
        if (c.fam === 'beige' && c.C < 7) return 0.5;
        if (c.fam === 'black') return 0.5;
        return 0;
      case 'green':
        if (c.fam === 'green') return 1;
        if (c.fam === 'gray' && c.ut === 'green') return 0.45;
        if (c.fam === 'yellow' && c.h > 95 && c.L < 72) return 0.5;
        return 0;
      case 'blue':
        if (c.fam === 'blue') return 1;
        if (c.fam === 'gray' && (c.ut === 'blue' || c.ut === 'blue-green')) return 0.45;
        if (c.fam === 'purple' && c.h < 300) return 0.3;
        return 0;
      case 'earthy':
        if (c.fam === 'brown') return 1;
        if (c.fam === 'orange') return c.C < 48 ? 1 : 0.6;
        if (c.fam === 'red') return c.C < 48 && c.h > 18 ? 0.8 : 0.35;
        if (c.fam === 'yellow') return c.C < 42 ? 0.8 : 0.4;
        if (c.fam === 'green') return c.C < 32 && c.h < 135 ? 0.7 : 0.1;
        if (c.fam === 'beige') return c.L < 76 ? 0.6 : 0.3;
        if (c.fam === 'pink') return c.C < 25 ? 0.45 : 0.15;
        return 0;
      case 'pink-purple':
        if (c.fam === 'pink' || c.fam === 'purple') return 1;
        if (c.fam === 'red') return c.L > 55 ? 0.5 : 0.25;
        if (c.ut === 'violet' && c.fam === 'gray') return 0.35;
        return 0;
      case 'dark': return c.lrv < 10 ? 1 : c.lrv < 16 ? 0.7 : c.lrv < 25 ? 0.3 : 0;
      case 'bold': return c.C > 45 ? 1 : c.C > 35 ? 0.7 : c.C > 25 ? 0.3 : 0;
      default: return 0;
    }
  }
  function styleMatch(c, styleId) {
    const s = STYLES[styleId]; if (!s) return 0;
    let w = s.fam[c.fam] || 0;
    if (styleId === 'moody' && c.lrv < 14) w = Math.max(w, 0.85);
    if (styleId === 'moody' && c.lrv > 45) w *= 0.35;
    if ((styleId === 'scandi' || styleId === 'coastal') && c.lrv < 30) w *= 0.45;
    if (styleId === 'farmhouse' && c.fam === 'green' && c.C > 22) w *= 0.4; // farmhouse greens are sage, not kelly
    if (styleId === 'coastal' && c.fam === 'blue' && c.C > 35) w *= 0.6;
    if (styleId === 'japandi' && c.C > 14) w *= 0.5;
    if (styleId === 'boho' && c.fam === 'orange' && c.L > 80) w *= 0.6;
    // pink- or purple-leaning neutrals read as blush or mauve, which only some looks want
    if (pinkish(c) && !['boho', 'cozy', 'traditional', 'mediterranean'].includes(styleId)) w *= 0.55;
    return w;
  }
  function depthFit(c, t) {
    const v = c.lrv;
    if (v >= t.lo && v <= t.hi) {
      const span = Math.max(t.ideal - t.lo, t.hi - t.ideal, 1);
      return 1 - 0.5 * Math.abs(v - t.ideal) / span;
    }
    const out = v < t.lo ? t.lo - v : v - t.hi;
    return Math.max(0, 0.45 - out / 18);
  }
  function chromaFit(c, t) {
    if (c.C >= t.cmin && c.C <= t.cmax) return 1;
    const out = c.C < t.cmin ? t.cmin - c.C : c.C - t.cmax;
    return Math.max(0, 1 - out / 18);
  }
  function lightFit(c, a) {
    let u = 0.5; const reasons = [];
    const asked = a.families || [];
    const askedCool = asked.includes('blue') || asked.includes('cool-neutral');
    if (lowLight(a)) {
      if (c.temp === 'warm') { u += 0.22; if (c.neutral) reasons.push('Its warm undertone offsets cool or dim light'); }
      if (c.temp === 'cool') u -= askedCool ? 0.08 : 0.22;
    }
    if (brightWarmLight(a)) {
      if (c.neutral && (c.ut === 'yellow' || c.ut === 'peach') && c.L > 75) u -= 0.15;
      if (c.temp === 'cool' || c.ut === 'neutral') { u += 0.1; if (c.neutral) reasons.push('Its cooler balance keeps strong sun from turning it yellow'); }
    }
    if (hasDir(a, 'south') && a.amount !== 'high' && c.temp === 'cool') u += 0.05;
    if (a.prefTemp === 'warm') { if (c.temp === 'warm') { u += 0.2; reasons.push('Soft, warm white as asked'); } else if (c.temp === 'cool') u -= 0.2; }
    if (a.prefTemp === 'cool') { if (c.temp === 'cool' || c.ut === 'neutral') { u += 0.15; reasons.push('Crisp, clean white as asked'); } else if (c.temp === 'warm' && c.C > 3) u -= 0.2; }
    if (a.bulbs === 'warm' && c.temp === 'cool' && c.neutral) u -= 0.1;
    if (a.bulbs === 'daylight' && c.neutral && (c.ut === 'yellow' || c.ut === 'peach') && c.C > 6) u -= 0.1;
    const st = (a.styles || []).map(s => STYLES[s]).filter(Boolean);
    for (const s of st) {
      if (!s.temp || s.temp === 'neutral') { if (c.neutral && c.C < 5) u += 0.06; continue; }
      if (s.temp === c.temp) u += 0.12; else if (c.temp !== 'neutral') u -= 0.1;
    }
    return { score: clamp01(u), reasons };
  }

  // ---------------- what's staying: floors, counters, furniture, fixtures, roof ----------------
  function fixedItems(a) {
    const out = [];
    for (const id of a.fixed || []) if (FIXED_BY_ID[id]) out.push(FIXED_BY_ID[id]);
    for (const x of a.customFixed || []) {
      const hex = String((x && x.hex) || '').replace('#', '').toUpperCase();
      if (/^[0-9A-F]{6}$/.test(hex)) out.push(Object.assign({ id: 'custom', group: 'Custom', where: 'any', kind: x.kind || 'custom', label: (x.label || 'Custom item').slice(0, 40), hex }, describeItem(hex)));
    }
    return out;
  }
  const isCoolUT = c => ['blue', 'blue-green', 'green-blue', 'violet'].includes(c.ut);
  const isYellowUT = c => c.ut === 'yellow' || c.ut === 'peach';
  const lowerFirst = s => s.toLowerCase();
  // Score nudges, reasons and warnings for one paint color against everything that's staying.
  function fixedEffects(c, a) {
    const items = fixedItems(a);
    const out = { score: 0, reasons: [], warnings: [] };
    if (!items.length) return out;
    const warn = (level, title, text) => { if (!out.warnings.some(w => w.title === title)) out.warnings.push({ level, title, text }); };
    const neutralWall = c.neutral && c.fam !== 'black';
    const sp = SPACES[a.space] || SPACES.living;
    const whiteJob = sp.surface === 'trim' || sp.surface === 'ceiling';
    for (const e of items) {
      const name = lowerFirst(e.label);
      // large surfaces (carpet, walls, siding, roof, masonry) set the room's undertone even when their color is soft
      const big = ['roof', 'stone', 'carpet', 'wall', 'siding'].includes(e.kind);
      const strongWarm = e.temp === 'warm' && e.C >= (big ? 8 : 14) && e.L < 82;      // orange oak, cherry, brass, leather, brick, beige carpet, brown roof
      const reddish = (e.h >= 345 || e.h < 45) && e.C >= 18;                          // cherry, red brick, terracotta
      const orangeWood = e.h >= 45 && e.h < 85 && e.C >= 22 && e.L < 75;              // honey oak, butcher block, wood cabinets, stained trim
      const coolGray = e.C < 7 && e.L > 25 && e.L < 90 && (e.temp !== 'warm' || e.ut === 'neutral'); // gray tile, LVP, carpet, concrete, gray stone
      const whiteSurface = e.L >= 88 && e.C < 6;
      const creamSurface = e.L >= 88 && e.C >= 6 && e.C < 14 && e.temp === 'warm';
      if (neutralWall) {
        if (strongWarm && isCoolUT(c) && c.C > 2.5) { out.score -= e.C >= 14 ? 0.12 : 0.08; warn(e.C >= 14 ? 'caution' : 'heads-up', `Clashes with the ${name}`, `Cool, blue-leaning neutrals fight with warm materials like the ${name} and make them look more orange or yellow.`); }
        else if (strongWarm && c.temp === 'warm') { out.score += 0.05; out.reasons.push(`Warm undertone works with the ${name}`); }
        if (orangeWood && isYellowUT(c) && c.C > 9) { out.score -= 0.07; warn('heads-up', `Too much yellow with the ${name}`, `A yellow-leaning beige next to the ${name} can make the whole room read orange. A greige or a softer white balances it.`); }
        if (reddish && c.ut === 'pink' && c.C > 3) { out.score -= 0.1; warn('heads-up', `Pink shows next to the ${name}`, `Red tones in the ${name} pull the pink out of this color. Hold the chip against it to check.`); }
        if (coolGray && isYellowUT(c) && c.C > 6) { out.score -= 0.08; warn('heads-up', `Yellow next to the ${name}`, `Yellow-leaning neutrals next to the cool ${name} can make both look off. A balanced or cooler neutral is safer.`); }
        else if (coolGray && (c.temp === 'cool' || c.ut === 'neutral')) { out.score += 0.04; out.reasons.push(`Cool balance works with the ${name}`); }
      }
      // whites side by side (bright trim or quartz next to a creamy white, or cream trim next to a stark white)
      if ((whiteSurface || creamSurface) && (c.fam === 'white' || (c.L > 86 && c.C < 12))) {
        const d = C.deltaE2000(c.lab, e.lab);
        if (d >= 1.5 && d < 7) {
          if (c.lab[2] - e.lab[2] > 3) { out.score -= 0.06; warn('heads-up', `Creamy next to the ${name}`, `Next to the ${name}, this white can look dingy or yellow. Either match the whites or choose a clearly different color.`); }
          else if (e.lab[2] - c.lab[2] > 3) { out.score -= 0.05; warn('heads-up', `Stark next to the ${name}`, `Next to the warmer ${name}, this cleaner white can look stark or bluish and make the trim look yellowed. Match the whites or pick a warmer one.`); }
        }
      }
      // painting trim or a ceiling against walls that are staying: keep the white in the walls' temperature family
      if (whiteJob && e.kind === 'wall' && c.fam === 'white') {
        if (e.temp === 'warm' && isCoolUT(c) && c.C > 2) { out.score -= 0.07; warn('heads-up', `Cool white against the ${name}`, `A blue-leaning white next to warm walls can look stark. A white with a little warmth ties in better.`); }
        else if (e.temp !== 'warm' && isYellowUT(c) && c.C > 5) { out.score -= 0.07; warn('heads-up', `Creamy white against the ${name}`, `A yellow-leaning white next to cooler walls can look dingy. A cleaner white sits better.`); }
        else { out.score += 0.04; out.reasons.push(`White suits the ${name}`); }
      }
      // a front door has to stand out from the siding
      if (sp.surface === 'door' && e.kind === 'siding') {
        if (Math.abs(c.L - e.L) < 12 && (hueDiff(c.h, e.h) < 50 || c.C < 12)) { out.score -= 0.1; warn('heads-up', `Won’t stand out from the ${name}`, `The door is close in lightness to the ${name}, so it won’t pop from the street. Go much darker, lighter or more colorful.`); }
        else if (Math.abs(c.L - e.L) >= 25 || c.C > 30) { out.score += 0.05; out.reasons.push(`Stands out against the ${name}`); }
      }
      if (c.C >= 10 && e.C >= 18 && hueDiff(c.h, e.h) >= 120) { out.score += 0.05; out.reasons.push(`Complements the ${name}`); }
      if (Math.abs(c.L - e.L) < 7 && ['floor', 'carpet', 'counter', 'cabinet', 'roof', 'stone', 'trim', 'siding'].includes(e.kind) && c.C < 25 && e.C < 25 && hueDiff(c.h, e.h) < 40)
        warn('tip', `Blends with the ${name}`, `This is close in lightness and tone to the ${name}, so the two will read as one surface. Fine for a calm look; go lighter or darker for definition.`);
      if (c.lrv < 15 && e.L < 32 && ['furniture', 'cabinet', 'floor', 'carpet', 'counter', 'trim'].includes(e.kind))
        warn('tip', `Dark on dark with the ${name}`, `A deep color next to the ${name} has little contrast. Add lighter accents or good lighting so the space doesn’t feel heavy.`);
      if (e.kind === 'carpet' && c.lrv >= 75 && e.L < 60)
        warn('tip', `Carpet darkens the lower wall`, `The ${name} reflects its own color onto the bottom of the walls, so a very light wall can look a touch warmer and darker near the floor.`);
    }
    out.score = Math.max(-0.3, Math.min(0.15, out.score));
    out.reasons = out.reasons.filter((x, i, arr) => arr.indexOf(x) === i);
    return out;
  }

  // ---------------- warnings ----------------
  // level: 'caution' (likely problem), 'heads-up' (watch for this), 'tip'
  function coverageWarnings(c, a, add) {
    const now = nowHexOf(a); if (!now) return;
    const nl = C.hexToLab(now), dL = c.L - nl[0], nowC = C.labToLch(nl)[1];
    if (dL > 35) add('heads-up', 'Going much lighter', 'Covering a darker color takes a primer and two coats, or three coats without primer.');
    else if (dL < -35) add('tip', 'Going much darker', 'A gray-tinted primer helps a deep color cover in two coats.');
    if (nowC > 40 && c.L > 60) add('heads-up', 'Bright color underneath', 'Reds, oranges and yellows show through light paint. Prime first.');
    if (a.nowKind === 'none' && (SPACES[a.space] || {}).kind === 'interior') add('tip', 'Prime new surfaces', 'Unpainted drywall or wood needs a primer first so the paint looks even.');
  }
  function warningsFor(c, a) {
    a = Object.assign({}, DEFAULT_ANSWERS, a || {});
    const sp = SPACES[a.space] || SPACES.living;
    const W = []; const add = (level, title, text) => W.push({ level, title, text });
    const ext = sp.kind === 'exterior';
    const wall = !sp.surface || sp.accent;

    if (c.flags & F.DISC) add('caution', 'Discontinued color', 'This color is no longer in the brand’s current palette. Many stores can still mix it from the formula, so check before promising it.');

    // depth vs light
    if (!ext) {
      if (c.lrv < 10 && (lowLight(a) || a.size === 'small') && !sp.accent && sp.surface !== 'trim' && sp.surface !== 'cabinets')
        add('caution', 'Will read close to black', `LRV ${c.lrv} reflects very little light. In a ${noWindows(a) ? 'windowless' : lowLight(a) ? 'dim' : 'small'} room it will look darker than the chip and make the space feel smaller. Great if that cocoon feel is the goal; otherwise go one or two steps lighter.`);
      else if (c.lrv < 20 && lowLight(a) && wall && !sp.accent)
        add('heads-up', 'Darker in this light', 'Low or north light makes deep colors look darker and flatter than the chip. Expect it to read a step or two deeper.');
      if (c.lrv >= 30 && c.lrv < 55 && c.neutral && lowLight(a) && (c.fam === 'gray' || c.fam === 'beige'))
        add('heads-up', 'Mid-tone neutrals can turn muddy', 'Grays and greiges in this range can look dull or shadowy in dim light. A version one step lighter on the same strip often looks the way people expect.');
      if (c.lrv >= 88 && brightWarmLight(a) && wall)
        add('heads-up', 'Can glare in strong sun', `LRV ${c.lrv} bounces back almost all light. In a bright ${facingPhrase(a)} room it can feel stark or glaring by afternoon.`);
      if (sp.surface === 'ceiling' && c.lrv < 70)
        add('heads-up', 'Ceiling will feel lower', `Ceilings under about LRV 70 visually drop the ceiling. That can feel cozy, but most ceilings sit around LRV 80–90.`);
      if (sp.kid && c.lrv < 12)
        add('heads-up', 'Very dark for a kids’ room', 'Deep colors can feel heavy in a kids’ room. Consider it for one wall or furniture instead.');
      if (a.size === 'small' && c.lrv < 25 && !sp.accent && wall && !(c.lrv < 10 && lowLight(a)))
        add('tip', 'Small room, deep color', 'Deep colors make walls recede at night and can feel cozy, but the room will look smaller in daylight.');
    }

    // light direction and undertone
    const coolUT = c.ut === 'blue' || c.ut === 'blue-green' || c.ut === 'green-blue' || c.ut === 'violet';
    // north-only rooms get the cool-light cautions; a second, sunnier side softens them to a heads-up
    const north = hasDir(a, 'north'), sunnyToo = hasDir(a, 'south') || hasDir(a, 'west') || hasDir(a, 'east');
    if (!ext && north && c.neutral && coolUT && c.C > 2) {
      if (onlyNorth(a)) add('caution', 'May look icy or dingy in north light', 'North light is cool and bluish, which strengthens cool undertones. This color can look colder, grayer or a little blue. A warmer neutral usually holds up better.');
      else if (sunnyToo) add('heads-up', 'Cooler on the north wall', 'The other windows warm the room, but walls near the north window will still read cooler and a little bluer.');
    }
    if (!ext && onlyNorth(a) && isWhiteish(c) && c.lrv < 82)
      add('heads-up', 'Whites look grayer facing north', 'Soft whites can read as light gray in north light. To make it read as white, pick a cleaner, brighter white.');
    if (!ext && brightWarmLight(a) && c.neutral && (c.ut === 'yellow' || c.ut === 'peach') && c.C > 4)
      add('heads-up', 'Strong sun boosts yellow', 'Warm afternoon sun amplifies yellow and peach undertones. This can look noticeably creamier or more golden than the chip.');
    if (!ext && hasDir(a, 'west'))
      add('tip', 'Changes through the day', 'West windows bring cool, flat light in the morning and warm orange light by evening. Check the sample around 5 pm too.');
    if (!ext && hasDir(a, 'east') && !hasDir(a, 'west'))
      add('tip', 'Bright morning, cooler afternoon', 'East light is warm and bright early, then cooler and flatter later. Check the sample in the afternoon.');
    if (!ext && ((north && hasDir(a, 'south')) || (hasDir(a, 'east') && hasDir(a, 'west'))))
      add('tip', 'Light differs wall to wall', 'With windows on opposite sides, the same color reads warmer on one side and cooler on the other. Tape samples on both.');
    if (!ext && facingsOf(a).length >= 3)
      add('tip', 'Bright from several sides', 'Light from three or more sides makes colors look lighter and cleaner than the chip. A step deeper often reads as intended.');
    if (!ext && noWindows(a))
      add('heads-up', 'Bulbs decide everything here', 'With no windows, the color depends entirely on the bulbs. Test the sample under the room’s actual bulbs before committing.');

    // undertone surprises
    if (c.neutral && c.fam !== 'black') {
      if (c.ut === 'green' && c.C >= 3 && c.C < 14)
        add('heads-up', 'Leans green', 'This neutral has a green undertone. It can look greenish next to warm wood or in north light, and looks more khaki in warm bulbs.');
      if (c.ut === 'pink' && c.C >= 3.5 && c.C < 16 && c.L > 50)
        add('heads-up', 'Leans pink', 'This neutral has a pink or mauve undertone that shows up more in warm light and next to red brick or cherry wood.');
      if (c.ut === 'violet' && c.C >= 2.5)
        add('heads-up', 'Leans purple', 'This gray has a violet undertone and can read lavender in some light, especially next to yellow-toned wood.');
    }
    // floors, counters, furniture, fixtures, roof and anything custom
    for (const w of fixedEffects(c, a).warnings) add(w.level, w.title, w.text);

    // bulbs
    if (!ext && a.bulbs === 'warm' && (c.fam === 'blue' || (c.neutral && coolUT && c.C > 2.5)))
      add('heads-up', 'Warm bulbs mute cool colors', 'Warm 2700K bulbs pull blues and cool grays toward gray, green or muddy. Soft white or 3500K bulbs keep them truer.');
    if (!ext && a.bulbs === 'daylight' && c.neutral && (c.ut === 'yellow' || c.ut === 'peach') && c.C > 5)
      add('heads-up', 'Daylight bulbs flatten warm colors', 'Cool 5000K bulbs can make warm creams and beiges look flat or slightly gray.');

    // saturation
    if (c.C > 45 && wall && !sp.accent && !ext)
      add('heads-up', 'Gets bolder on a full wall', 'Strong colors look brighter and more intense on four walls than on a small chip. Consider one step more muted, or use it on an accent wall.');
    if (sp.sleep && c.C > 40 && (c.fam === 'red' || c.fam === 'orange' || c.fam === 'yellow'))
      add('heads-up', 'Energizing for a sleep space', 'Very saturated reds, oranges and yellows feel stimulating. A softer, muted version is easier to sleep in.');
    if ((c.C > 40 && (c.fam === 'red' || c.fam === 'orange' || c.fam === 'yellow')) || c.lrv < 8)
      add('tip', 'Coverage', 'Deep or bright colors like this usually need a gray-tinted primer and two to three coats for even color.');
    if (c.lrv < 15 && !ext && (sp.busy || sp.kid))
      add('tip', 'Shows scuffs', 'Dark colors show scuffs and touch-ups more in high-traffic areas. Use a scrubbable Eggshell or Satin.');
    // space-specific notes
    if (sp.tall && c.lrv < 30) add('tip', 'Tall stairwell walls', 'Stairwell walls are hard to reach and repaint. A deep color here is a big commitment, so test a large sample first.');
    if (a.space === 'garage') add('tip', 'Garage lighting', 'Most garages use cool LED or fluorescent tubes, which make colors look cooler and grayer than the chip.');
    if (sp.sunny && c.C > 30) add('heads-up', 'Strong sun fades color', 'Sunrooms get so much direct light that saturated colors fade faster. A premium line with good fade resistance helps.');
    if (sp.sunny && c.lrv >= 88) add('heads-up', 'Glare in a sunroom', 'Very bright whites bounce a lot of light in a room this sunny. A softer white is easier on the eyes.');

    // exterior
    if (ext) {
      if (sp.surface === 'body' && a.siding === 'vinyl' && c.lrv < 50)
        add('caution', 'Risky on vinyl siding', `Dark colors absorb heat and can warp vinyl. At LRV ${c.lrv}, use the brand’s vinyl-safe formula and check the siding maker’s limit before selling it.`);
      if (c.lrv < 15) add('heads-up', 'Heat and fading', 'Very dark exterior colors absorb heat and show fading and chalking sooner, especially on sunny sides.');
      if (c.C > 38 && (c.fam === 'red' || c.fam === 'yellow' || c.fam === 'orange')) add('heads-up', 'Fades faster in sun', 'Saturated reds, yellows and oranges fade the fastest outdoors. A premium exterior line helps.');
      if (c.lrv >= 85 && a.amount === 'high') add('heads-up', 'Glare in full sun', 'Bright whites on a sunny exterior can glare. A slightly softer white reads white outside without the glare.');
      add('tip', 'Outdoor light washes color out', 'Exterior colors look lighter and less saturated in full sun than on the chip. Many pros choose one step deeper than they think.');
      if (sp.surface === 'body' && a.siding === 'stucco') add('tip', 'Stucco texture', 'Textured stucco casts tiny shadows, so the color will look a little darker than on smooth siding.');
    }
    // shadows: light from one side leaves the window wall and far corners in shade
    if (!ext && wall && facingsOf(a).length === 1 && !noWindows(a)) add('tip', 'Shadows shift it wall to wall', 'The wall with the window sits in its own shadow and looks a shade darker; the wall across from it looks lightest. Check the sample on both.');
    if (!ext && wall && c.lrv < 25 && facingsOf(a).length <= 1) add('tip', 'Deep colors deepen in shadow', 'Corners and the wall around the window can look almost black with a color this deep. Keep lamps on that side.');
    if (ext && a.amount === 'low') add('tip', 'Shade darkens it', 'Under porches, eaves and trees the color looks noticeably darker than in open sun. Look at the sample in both.');
    if (ext && a.amount === 'high' && sp.surface === 'body') add('tip', 'Eaves cast a band of shadow', 'The strip of siding under the roof edge is always in shade, so it reads darker than the rest of the wall.');
    coverageWarnings(c, a, add);
    return W;
  }
  const LEVEL_RANK = { caution: 0, 'heads-up': 1, tip: 2 };
  const sortWarnings = list => list.slice().sort((x, y) => LEVEL_RANK[x.level] - LEVEL_RANK[y.level]);

  function roomTips(a, s, top) {
    a = Object.assign({}, DEFAULT_ANSWERS, a || {});
    const sp = SPACES[a.space] || SPACES.living; const tips = [];
    tips.push({ title: 'Finish', text: sp.sheen + '.' });
    if (sp.surface === 'trim') tips.push({ title: 'Baseboards, Casing & Crown', text: 'Use one color for baseboards, door and window casing, and crown so the trim reads as one. Semi-Gloss on baseboards stands up to scuffs and mopping.' });
    if (a.trimPaint && sp.kind === 'interior' && !sp.surface && top) {
      const w = pairings(top, s).find(p => p.role === 'Trim & ceiling');
      if (w) tips.push({ title: 'Trim & Baseboards', text: `Pair with ${w.color.name} (${codeLabel(w.color)}) on baseboards, casing and doors in Semi-Gloss or Satin.` });
    }
    if (a.crown) tips.push({ title: 'Crown Molding', text: 'Paint crown molding the trim color for a crisp outline, or the ceiling color to make a low ceiling feel taller.' });
    if ((a.fixed || []).includes('trim-wood') && !a.trimPaint) tips.push({ title: 'Stained Trim', text: 'Stained wood trim is warm and orange-leaning, so the picks lean toward warm and earthy colors. Cool blue-grays are flagged.' });
    if (s && s.inStoreSamples) tips.push({ title: 'Samples', text: 'Pull the chips from the display and tape them up on two walls, one near the window and one away from it.' });
    else tips.push({ title: 'Samples', text: 'Get a sample pot or a peel-and-stick sample and check it on two walls at different times of day.' });
    if (sp.wet) tips.push({ title: 'Moisture', text: 'Use a mildew-resistant kitchen and bath paint and allow full cure before showers or cooking steam.' });
    if (lowLight(a) && sp.kind === 'interior') tips.push({ title: 'Low Light', text: 'Colors look one to two steps darker here. When torn between two, pick the lighter one.' });
    if (a.bulbs === 'unsure' && sp.kind === 'interior') tips.push({ title: 'Bulbs', text: 'Ask which bulbs are in the room. Warm bulbs and daylight bulbs can make the same color look very different.' });
    return tips;
  }

  // ---------------- paint lines ----------------
  // Product lines by brand. tier: 1 = good, 2 = better, 3 = best. tags describe what each line is made for.
  // Lineups change, so the app tells staff to confirm against the current product guide, and every line
  // can be switched off in settings to match what the store carries.
  const TIERS = { 1: 'Good', 2: 'Better', 3: 'Best' };
  const pl = (id, name, use, tier, tags, note) => ({ id, name, use, tier, tags, note });
  const PAINT_LINES = {
    bm: [
      pl('bm-ben', 'ben', 'interior', 1, ['value'], 'Good everyday coverage at a lower price.'),
      pl('bm-regal', 'Regal Select', 'interior', 2, ['washable', 'popular'], 'Benjamin Moore’s best-selling interior: durable, washable and easy to apply.'),
      pl('bm-scuffx', 'Scuff-X', 'interior', 2, ['scuff', 'washable'], 'Made to resist scuffs in busy rooms and hallways.'),
      pl('bm-aura', 'Aura', 'interior', 3, ['premium', 'washable', 'onecoat', 'rich'], 'Top-tier color depth and durability, often in one coat.'),
      pl('bm-aura-bath', 'Aura Bath & Spa', 'interior', 3, ['bath', 'washable'], 'Matte finish made for humid bathrooms, mildew resistant.'),
      pl('bm-advance', 'Advance', 'interior', 3, ['enamel'], 'Waterborne alkyd that levels like oil for cabinets, trim and doors.'),
      pl('bm-ceiling', 'Waterborne Ceiling Paint', 'interior', 2, ['ceiling'], 'Ultra-flat ceiling finish that hides flaws and spatters less.'),
      pl('bm-regal-ext', 'Regal Select Exterior', 'exterior', 2, ['popular'], 'Durable, fade-resistant exterior.'),
      pl('bm-element', 'Element Guard', 'exterior', 2, ['mildew'], 'Weather- and mildew-resistant exterior for damp or shaded walls.'),
      pl('bm-aura-ext', 'Aura Exterior', 'exterior', 3, ['premium', 'rich', 'onecoat'], 'Best color retention outdoors, especially for deep colors.'),
    ],
    sw: [
      pl('sw-captivate', 'Captivate', 'interior', 1, ['value'], 'Value interior with good hide.'),
      pl('sw-promar', 'ProMar 200 Zero VOC', 'interior', 1, ['value', 'pro'], 'Contractor favorite: good coverage at a lower price.'),
      pl('sw-superpaint', 'SuperPaint', 'interior', 2, ['washable', 'popular'], 'Durable, washable everyday wall paint.'),
      pl('sw-cashmere', 'Cashmere', 'interior', 2, ['smooth'], 'Very smooth, low-lap finish that’s easy to apply.'),
      pl('sw-duration', 'Duration Home', 'interior', 3, ['scuff', 'washable'], 'Scrubbable and stain resistant, great for kids’ rooms and busy areas.'),
      pl('sw-emerald', 'Emerald', 'interior', 3, ['premium', 'washable', 'onecoat', 'rich'], 'Sherwin-Williams’ best interior: rich color, excellent hide and washability.'),
      pl('sw-urethane', 'Emerald Urethane Trim Enamel', 'interior', 3, ['enamel'], 'Hard, smooth enamel for trim, doors and cabinets.'),
      pl('sw-eminence', 'Eminence Ceiling Paint', 'interior', 2, ['ceiling'], 'High-hide, ultra-flat ceiling paint.'),
      pl('sw-a100', 'A-100 Exterior', 'exterior', 1, ['value'], 'Reliable exterior at a lower price.'),
      pl('sw-superpaint-ext', 'SuperPaint Exterior', 'exterior', 2, ['popular'], 'Solid all-round exterior protection.'),
      pl('sw-duration-ext', 'Duration Exterior', 'exterior', 3, ['mildew', 'premium'], 'Thick, long-lasting exterior that resists peeling and mildew.'),
      pl('sw-emerald-ext', 'Emerald Exterior', 'exterior', 3, ['premium', 'rich', 'onecoat'], 'Top exterior for color retention and hide.'),
      pl('sw-rain', 'Emerald Rain Refresh', 'exterior', 3, ['premium', 'mildew'], 'Sheds dirt when it rains; stays clean longer.'),
    ],
    behr: [
      pl('behr-pp', 'Behr Premium Plus', 'interior', 1, ['value'], 'Budget-friendly interior with good coverage.'),
      pl('behr-ultra', 'Behr Ultra Scuff Defense', 'interior', 2, ['scuff', 'washable'], 'Scuff-resistant and washable for busy rooms.'),
      pl('behr-marquee', 'Behr Marquee', 'interior', 3, ['premium', 'onecoat', 'washable', 'rich'], 'One-coat hide in most colors with strong stain resistance.'),
      pl('behr-dynasty', 'Behr Dynasty', 'interior', 3, ['premium', 'scuff', 'onecoat', 'washable'], 'Behr’s top interior, built to resist scuffs and stains.'),
      pl('behr-cabinet', 'Behr Premium Cabinet & Trim Enamel', 'interior', 2, ['enamel'], 'Smooth, hard enamel for cabinets, trim and doors.'),
      pl('behr-ceiling', 'Behr Premium Plus Ceiling Paint', 'interior', 1, ['ceiling'], 'Flat ceiling paint that hides flaws.'),
      pl('behr-pp-ext', 'Behr Premium Plus Exterior', 'exterior', 1, ['value'], 'Budget-friendly exterior.'),
      pl('behr-ultra-ext', 'Behr Ultra Exterior', 'exterior', 2, ['popular'], 'Durable exterior with stain blocking.'),
      pl('behr-marquee-ext', 'Behr Marquee Exterior', 'exterior', 3, ['premium', 'rich', 'onecoat'], 'Premium exterior for color retention and one-coat hide.'),
      pl('behr-dynasty-ext', 'Behr Dynasty Exterior', 'exterior', 3, ['premium', 'mildew', 'rich'], 'Behr’s most weather-resistant exterior.'),
    ],
    valspar: [
      pl('val-ultra', 'Valspar Ultra', 'interior', 1, ['value'], 'Everyday interior with stain blocking.'),
      pl('val-signature', 'Valspar Signature', 'interior', 2, ['washable', 'popular', 'onecoat'], 'Popular paint-and-primer with good one-coat hide.'),
      pl('val-reserve', 'Valspar Reserve', 'interior', 3, ['premium', 'washable', 'rich'], 'Valspar’s premium interior for durability and rich color.'),
      pl('val-cabinet', 'Valspar Cabinet Enamel', 'interior', 2, ['enamel'], 'Self-leveling enamel for cabinets and trim.'),
      pl('val-duramax', 'Valspar Duramax Exterior', 'exterior', 3, ['premium', 'rich', 'mildew'], 'Premium exterior for weather and fade resistance.'),
    ],
    hgsw: [
      pl('hgsw-showcase', 'Showcase', 'interior', 2, ['washable', 'scuff'], 'Stain-resistant, scrubbable interior.'),
      pl('hgsw-infinity', 'Infinity', 'interior', 3, ['premium', 'onecoat', 'rich'], 'One-coat hide in most colors with a rich finish.'),
    ],
    dutchboy: [
      pl('db-duraclean', 'Dura Clean', 'interior', 2, ['washable', 'scuff'], 'Scrubbable interior for busy rooms.'),
      pl('db-platinum', 'Platinum Plus', 'interior', 3, ['premium', 'onecoat'], 'Dutch Boy’s premium paint-and-primer.'),
    ],
    ppg: [
      pl('ppg-speedhide', 'Speedhide', 'interior', 1, ['value', 'pro'], 'Contractor-grade coverage at a lower price.'),
      pl('ppg-diamond', 'Diamond', 'interior', 2, ['washable', 'scuff'], 'Durable, washable interior.'),
      pl('ppg-timeless', 'Timeless', 'interior', 3, ['premium', 'onecoat', 'rich', 'washable'], 'Premium one-coat interior.'),
      pl('ppg-breakthrough', 'Break-Through!', 'interior', 3, ['enamel'], 'Fast-drying, very hard finish for doors, trim and cabinets.'),
      pl('ppg-timeless-ext', 'Timeless Exterior', 'exterior', 3, ['premium', 'rich', 'onecoat'], 'Premium exterior for color retention.'),
    ],
    glidden: [
      pl('gl-premium', 'Glidden Premium', 'interior', 1, ['value', 'washable'], 'Affordable, washable interior.'),
      pl('gl-onecoat', 'Glidden One Coat', 'interior', 2, ['onecoat'], 'Made to cover in one coat in most colors.'),
      pl('gl-trim', 'Glidden Trim & Door', 'interior', 2, ['enamel'], 'Durable enamel for trim and doors.'),
      pl('gl-premium-ext', 'Glidden Premium Exterior', 'exterior', 1, ['value'], 'Affordable exterior protection.'),
      pl('gl-onecoat-ext', 'Glidden One Coat Exterior', 'exterior', 2, ['onecoat'], 'One-coat exterior in most colors.'),
    ],
    ck: [
      pl('ck-int', 'Clark+Kensington Interior Paint+Primer', 'interior', 2, ['washable', 'onecoat', 'popular'], 'Ace’s own paint-and-primer for interior walls.'),
      pl('ck-ext', 'Clark+Kensington Exterior Paint+Primer', 'exterior', 2, ['popular'], 'Ace’s own paint-and-primer for siding and trim.'),
    ],
    magnolia: [
      pl('mag-int', 'Magnolia Home Interior Paint', 'interior', 3, ['premium', 'washable', 'rich'], 'Magnolia Home’s premium interior paint, made by KILZ.'),
      pl('mag-ext', 'Magnolia Home Exterior Paint', 'exterior', 3, ['premium', 'rich'], 'Magnolia Home’s exterior paint, made by KILZ.'),
    ],
    de: [
      pl('de-spartawall', 'Spartawall', 'interior', 2, ['washable'], 'Durable, low-odor interior.'),
      pl('de-suprema', 'Suprema', 'interior', 3, ['premium', 'washable', 'rich'], 'Dunn-Edwards’ premium interior.'),
      pl('de-everest', 'Everest', 'interior', 3, ['scuff', 'washable'], 'Highly scrubbable interior for busy rooms.'),
      pl('de-aristoshield', 'Aristoshield', 'interior', 3, ['enamel'], 'Smooth enamel for trim, doors and cabinets.'),
      pl('de-spartashield', 'Spartashield', 'exterior', 2, ['popular'], 'All-round exterior.'),
      pl('de-evershield', 'Evershield', 'exterior', 3, ['premium', 'rich', 'mildew'], 'Premium exterior for harsh sun and weather.'),
    ],
  };
  const LINE_BY_ID = {}; for (const [b, list] of Object.entries(PAINT_LINES)) for (const l of list) LINE_BY_ID[l.id] = Object.assign(l, { brand: b });

  // Picks the paint line for this job from one brand. Lines switched off in settings are skipped.
  function recommendLines(brandId, color, answers, settings) {
    const a = Object.assign({}, DEFAULT_ANSWERS, answers || {});
    const lines = (PAINT_LINES[brandId] || []).filter(l => !(settings && settings.lines && settings.lines[l.id] === false));
    const sp = SPACES[a.space] || SPACES.living;
    const use = sp.kind;
    const enamelJob = sp.surface === 'trim' || sp.surface === 'cabinets' || sp.surface === 'furniture' || (sp.surface === 'door' && use === 'interior');
    const deep = color && (color.lrv < 15 || color.C > 40);
    const scored = [];
    for (const l of lines) {
      if (l.use !== use) continue;
      const has = t => l.tags.includes(t);
      let s = l.tier * 0.6; const why = [];
      if (sp.surface === 'ceiling') { if (has('ceiling')) { s += 4; why.push('Made for ceilings'); } }
      else if (has('ceiling')) s -= 5;
      if (enamelJob) { if (has('enamel')) { s += 4; why.push('Hard enamel finish for ' + sp.label.toLowerCase()); } }
      else if (has('enamel')) s -= 5;
      if (a.space === 'bathroom') { if (has('bath')) { s += 3; why.push('Made for humid bathrooms'); } if (has('washable')) { s += 1; if (!has('bath')) why.push('Washable, holds up to bathroom moisture'); } }
      else if (has('bath')) s -= 3;
      if (a.space === 'kitchen' || a.space === 'laundry') { if (has('washable')) { s += 1.5; why.push('Washable for kitchen splatter'); } if (has('scuff')) s += 0.8; }
      if (sp.kid || sp.busy) { if (has('scuff')) { s += 2; why.push('Resists scuffs in a busy space'); } if (has('washable')) s += 0.8; }
      if (use === 'exterior' && (onlyNorth(a) || a.amount === 'low') && has('mildew')) { s += 1.2; why.push('Mildew resistant for a shaded wall'); }
      if (use === 'exterior' && a.amount === 'high' && has('rich')) { s += 0.8; why.push('Holds color in strong sun'); }
      if (deep && (has('rich') || has('onecoat') || has('premium'))) { s += 1; why.push(color.lrv < 15 ? 'Better hide for a deep color' : 'Keeps a bold color rich'); }
      if (!why.length && has('popular')) why.push('A dependable all-rounder');
      if (!why.length && has('premium')) why.push('Best durability and color depth');
      if (!why.length && has('value')) why.push('Lowest cost option');
      scored.push({ line: l, score: s, why });
    }
    scored.sort((x, y) => y.score - x.score || y.line.tier - x.line.tier);
    const best = scored[0] || null;
    // one option per tier that suits the job: ceilings and enamel jobs only list lines made for them,
    // and walls never list ceiling, enamel or bath-only lines
    const needTag = sp.surface === 'ceiling' ? 'ceiling' : enamelJob ? 'enamel' : null;
    const fits = x => (needTag ? x.line.tags.includes(needTag) : x.score >= x.line.tier * 0.6 - 0.01);
    const byTier = [1, 2, 3].map(t => scored.find(x => x.line.tier === t && fits(x))).filter(Boolean);
    return { brand: brandId, best, byTier, all: scored };
  }

  // ---------------- advantages and disadvantages ----------------
  // Plain-language pros and cons of one color for this job. `others` are the other colors on screen,
  // used for "lightest / warmest of these options" comparisons.
  const dedupe = list => list.filter((x, i) => list.indexOf(x) === i);
  function prosCons(c, answers, settings, others) {
    const a = Object.assign({}, DEFAULT_ANSWERS, answers || {});
    const s = settings || {};
    const sp = SPACES[a.space] || SPACES.living;
    const ext = sp.kind === 'exterior';
    const busy = sp.kid || sp.busy || a.space === 'kitchen';
    const pros = [], cons = [];

    const st = (a.styles || []).filter(x => STYLES[x]).map(x => [x, styleMatch(c, x)]).sort((p, q) => q[1] - p[1])[0];
    if (st && st[1] >= 0.6) pros.push(`Fits the ${STYLES[st[0]].label.toLowerCase()} style`);
    if (c.lrv >= 70) pros.push(ext ? 'Stays cooler in the sun and reads bright from the street' : 'Bounces light around, so the room feels brighter and bigger');
    else if (c.lrv >= 45) pros.push('Keeps the space bright, with more presence than a white');
    else if (c.lrv >= 20) pros.push('Mid-tone depth adds warmth and character without going dark');
    else pros.push(ext ? 'Strong curb appeal and contrast' : 'Adds depth and drama, and makes big rooms feel cozier');
    const neutralFam = ['white', 'gray', 'beige', 'brown', 'black'].includes(c.fam);
    if (neutralFam && c.ut === 'neutral') pros.push('True neutral that works with warm and cool decor');
    else if (neutralFam) pros.push('Easy neutral that pairs with most furniture and floors');
    else if (c.C < 14) pros.push('Soft, muted color that’s easy to live with');
    else if (c.C > 35) pros.push('Makes a clear color statement');
    if (lowLight(a) && c.temp === 'warm' && c.neutral) pros.push('Warm undertone holds up in cool or dim light');
    if (brightWarmLight(a) && (c.temp === 'cool' || c.ut === 'neutral')) pros.push('Won’t turn yellow in strong sun');
    if (c.flags & F.POPULAR) pros.push('Proven best seller');
    if (s.inStoreSamples && (c.flags & F.RACK)) pros.push('Chip is on the store display');
    if ((c.flags & F.INT) && (c.flags & F.EXT)) pros.push('Available for inside and outside');
    if (!ext && c.lrv < 40 && busy) pros.push('Hides everyday dirt better than light colors');

    for (const w of sortWarnings(warningsFor(c, a))) if (w.level !== 'tip') cons.push(w.title);
    if (!ext && c.lrv >= 75 && busy) cons.push('Shows dirt and scuffs more in a busy space');
    if (!ext && c.lrv < 15 && !cons.some(x => /black|dark/i.test(x))) cons.push('Makes the room feel smaller and needs good lighting');
    if (c.C > 40 && !cons.some(x => /bolder|energizing/i.test(x))) cons.push('Strong color can feel like a lot on every wall');
    if (c.lrv < 10 || (c.C > 40 && ['red', 'orange', 'yellow'].includes(c.fam))) cons.push('Needs a tinted primer and extra coats');
    if (s.inStoreSamples && ['sw', 'valspar', 'hgsw', 'behr'].includes(c.brand) && !(c.flags & F.RACK)) cons.push('Chip isn’t on the standard display');

    const compared = [];
    const list = (others || []).filter(o => o && o.id !== c.id);
    if (list.length) {
      if (list.every(o => c.lrv > o.lrv + 1)) compared.push('Lightest of these options');
      if (list.every(o => c.lrv < o.lrv - 1)) compared.push('Deepest of these options');
      if (list.every(o => c.lab[2] > o.lab[2] + 0.5)) compared.push('Warmest of these options');
      if (list.every(o => c.lab[2] < o.lab[2] - 0.5)) compared.push('Coolest of these options');
      if (list.every(o => c.C < o.C - 0.5)) compared.push('Most muted of these options');
      if (list.every(o => c.C > o.C + 0.5)) compared.push('Most colorful of these options');
    }
    return { pros: dedupe(pros).slice(0, 5), cons: dedupe(cons).slice(0, 5), compared };
  }

  // ---------------- recommend ----------------
  function scoreColor(c, a, t) {
    const fams = (a.families || []).filter(f => f !== 'any');
    const styles = a.styles || [];
    let fam;
    const fa = fams.length ? Math.max(...fams.map(f => familyMatch(c, f))) : null;
    const sa = styles.length ? Math.max(...styles.map(s => styleMatch(c, s))) : null;
    if (fa != null && sa != null) fam = 0.65 * fa + 0.35 * sa;
    else if (fa != null) fam = fa;
    else if (sa != null) fam = sa;
    else fam = c.neutral ? (pinkish(c) ? 0.5 : 0.8) : 0.35;
    if (fa != null && fa === 0) fam *= 0.3; // color families were picked and this color isn't in any of them
    const sp = SPACES[a.space] || SPACES.living;
    // ceilings and trim with no color preference: whites first
    if ((sp.surface === 'ceiling' || sp.surface === 'trim') && fa == null && a.depth !== 'deep' && a.depth !== 'mid' && !a.tint && !a.bold && !a.matchWalls)
      fam = Math.min(fam, isWhiteish(c) ? 1 : c.neutral && c.C < 8 ? 0.45 : 0.1) + (isWhiteish(c) ? 0.2 : 0);
    // a front door is the place for color when nothing else was asked for
    if (sp.surface === 'door' && fa == null && sa == null) fam = c.C > 25 ? 0.9 : c.C > 12 ? 0.7 : c.lrv < 10 ? 0.75 : 0.45;
    if (a.tint) fam = c.fam === 'white' ? 0.3 : (c.C >= 3 && c.C <= 14 ? 0.95 : 0.4);
    if (a.bold) fam = c.C > 25 ? 1 : c.C > 15 ? 0.6 : 0.2;
    if (a.matchWalls) { const w = fixedItems(a).find(f => f.kind === 'wall'); fam = w ? Math.max(0, 1 - C.deltaE2000(c.lab, w.lab) / 14) : (c.neutral ? 0.8 : 0.3); }
    const d = depthFit(c, t);
    const ch = chromaFit(c, t);
    const lf = lightFit(c, a);
    const fx = (a.fixed && a.fixed.length) || (a.customFixed && a.customFixed.length) ? fixedEffects(c, a) : null;
    let score = 0.40 * fam + 0.27 * d + 0.13 * ch + 0.15 * lf.score + (fx ? fx.score : 0);
    if (c.flags & F.POPULAR) score += (sp.surface === 'ceiling' || sp.surface === 'trim' || !(a.styles || []).length) ? 0.07 : 0.05;
    // "crisp" or "soft, warm" white was asked for: make that the deciding factor among whites
    if (a.prefTemp === 'cool') score += c.temp === 'warm' ? -0.18 : 0.04;
    if (a.prefTemp === 'warm') score += c.temp === 'warm' ? 0.06 : c.temp === 'cool' ? -0.18 : -0.04;
    if (sp.surface === 'body' && a.siding === 'vinyl' && c.lrv < 45) score -= 0.4;
    // advanced: preferred undertone, a feeling, colors to stay away from
    if (a.undertone === 'warm') score += c.temp === 'warm' ? 0.07 : c.temp === 'cool' ? -0.09 : 0;
    if (a.undertone === 'cool') score += c.temp === 'cool' ? 0.07 : c.temp === 'warm' ? -0.09 : 0;
    if (a.undertone === 'neutral') score += c.neutral && c.C < 6 ? 0.06 : -0.04;
    if (a.feel === 'cozy') score += c.temp === 'warm' ? 0.05 : c.temp === 'cool' ? -0.05 : 0;
    if (a.feel === 'calm' && c.C > 18) score -= 0.06;
    for (const f of a.avoid || []) if (FAMILY_CHOICES[f] && familyMatch(c, f) >= 0.6) score -= 0.6;
    return { score, fam, depth: d, chroma: ch, light: lf.score, lightReasons: lf.reasons.concat(fx ? fx.reasons.slice(0, 2) : []) };
  }

  function reasonsFor(c, a, parts, t) {
    const R = [];
    const b = INDEX.brandById[c.brand] || {};
    const styles = (a.styles || []).filter(s => STYLES[s]);
    const best = styles.map(s => [s, styleMatch(c, s)]).sort((x, y) => y[1] - x[1])[0];
    if (best && best[1] >= 0.6) R.push(`Fits a ${STYLES[best[0]].label.toLowerCase()} look`);
    const fams = (a.families || []).filter(f => FAMILY_CHOICES[f]);
    const fb = fams.map(f => [f, familyMatch(c, f)]).sort((x, y) => y[1] - x[1])[0];
    if (fb && fb[1] >= 0.6) R.push(`One of the ${FAMILY_CHOICES[fb[0]].toLowerCase()} you picked`);
    if (parts.depth > 0.75) R.push(`LRV ${c.lrv}: ${C.depthLabel(c.lrv).toLowerCase()}, right for ${a.depth === 'any' ? 'this space' : DEPTHS[a.depth].toLowerCase()}`);
    for (const r of parts.lightReasons) if (R.length < 4) R.push(r);
    if (c.flags & F.POPULAR) R.push(`A ${b.name || 'brand'} best seller`);
    return R.slice(0, 4);
  }

  function roleFor(c, top) {
    if (!top || c === top) return 'Top pick';
    const parts = [];
    const dl = c.lrv - top.lrv;
    if (dl > 5) parts.push('lighter'); else if (dl < -5) parts.push('deeper');
    if (c.fam !== top.fam && C.FAMILY_NAMES[c.fam]) parts.push(C.FAMILY_NAMES[c.fam].split(' /')[0].toLowerCase());
    else {
      // within a family, compare yellow-blue (b*) and red-green (a*) balance
      const db = c.lab[2] - top.lab[2], da = c.lab[1] - top.lab[1];
      if (db > 2.5) parts.push('warmer'); else if (db < -2.5) parts.push('cooler');
      else if (da > 2) parts.push('rosier'); else if (da < -2) parts.push('greener');
    }
    if (parts.length < 2) { if (c.C - top.C > 5) parts.push('richer'); else if (top.C - c.C > 5) parts.push('softer'); }
    if (!parts.length) return 'Close alternative';
    const s = parts.slice(0, 2).join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1) + ' option';
  }

  function recommend(answers, settings) {
    const original = Object.assign({}, DEFAULT_ANSWERS, answers || {});
    const a = clone(original);
    const s = Object.assign({ resultCount: 6, showDiscontinued: false, brands: {}, storeBrand: '', storeOnly: false, inStoreSamples: true }, settings || {});
    const notices = [];
    const spc = SPACES[a.space] || SPACES.living;
    // Vinyl siding can't safely take dark colors: steer to the deepest safe range and say so
    if (spc.surface === 'body' && a.siding === 'vinyl' && (a.depth === 'deep' || (a.families || []).includes('dark'))) {
      a.families = (a.families || []).filter(f => f !== 'dark');
      if (a.depth === 'deep') a.depth = 'mid';
      notices.push({ level: 'caution', title: 'Dark Colors Held Back for Vinyl', text: 'Dark colors absorb heat and can warp vinyl siding, so these are the deepest safe choices. Many brands make vinyl-safe formulas for darker colors; check the brand and the siding maker’s limit before going darker.' });
    }
    if (s.storeOnly && s.storeBrand && s.brands && s.brands[s.storeBrand] === false) notices.push({ level: 'heads-up', title: 'Store Brand Is Turned Off', text: 'Turn the store brand back on in settings to see its colors.' });
    // ceilings and trim answer "what kind of white" instead of color families
    if ((spc.surface === 'ceiling' || spc.surface === 'trim') && a.whiteType) {
      const w = a.whiteType;
      if (w === 'crisp') Object.assign(a, { families: ['white'], depth: 'light', prefTemp: 'cool' });
      if (w === 'warm') Object.assign(a, { families: ['white'], depth: 'light', prefTemp: 'warm' });
      if (w === 'tint') Object.assign(a, { families: [], depth: 'light', tint: true });
      if (w === 'bold') Object.assign(a, { families: [], depth: 'any', bold: true });
      if (w === 'dark') Object.assign(a, { families: ['dark'], depth: 'deep', darkTrim: true });
      if (w === 'match') Object.assign(a, { families: [], depth: 'any', matchWalls: true });
      if (w === 'match' && !fixedItems(a).some(f => f.kind === 'wall')) notices.push({ level: 'heads-up', title: 'Pick the Wall Color to Match', text: 'Choose the walls staying in question 5 so the trim can match them. For now these are versatile light neutrals.' });
    }
    const t = target(a);
    let pool = INDEX.colors.filter(c => allowedColor(c, a, s));
    if (s.storeBrand && s.storeOnly) pool = pool.filter(c => c.brand === s.storeBrand);
    const scored = pool.map(c => { const p = scoreColor(c, a, t); if (s.inStoreSamples && (c.flags & F.RACK)) p.score += 0.015; if (s.storeBrand && c.brand === s.storeBrand) p.score += 0.04; return { c, p }; });
    scored.sort((x, y) => y.p.score - x.p.score);

    const n = Math.max(1, Math.min(12, s.resultCount | 0 || 6));
    const brandCount = new Set(pool.map(c => c.brand)).size;
    const cap = s.storeBrand && s.storeOnly ? n : Math.max(2, Math.ceil(n / Math.min(3, Math.max(1, brandCount))));
    const picks = []; const perBrand = {}; const perFam = {};
    const fams = (a.families || []).filter(f => FAMILY_CHOICES[f]);
    const sp = SPACES[a.space] || SPACES.living;
    // whites sit very close together, so they need a smaller spacing to offer real choices
    const whitesWanted = t.cmax <= 8 && t.ideal >= 80;
    const minDE = whitesWanted ? 2.2 : t.ideal >= 78 ? 4 : 6;
    // one hue family asked for (e.g. only greens), or whites for a ceiling: let it fill the list; otherwise spread across families
    const hueFams = fams.filter(f => f !== 'bold' && f !== 'dark');
    let famCap = Math.max(2, Math.ceil(n / 2));
    if ((hueFams.length === 1 && fams.length === 1) || whitesWanted || sp.surface === 'ceiling' || sp.surface === 'trim') famCap = n;
    else if (!hueFams.length && fams.includes('bold')) famCap = 2;
    const ok = cand => picks.every(p => C.deltaE2000(p.c.lab, cand.c.lab) >= minDE) && (perBrand[cand.c.brand] || 0) < cap && (perFam[cand.c.fam] || 0) < famCap;
    const take = cand => { picks.push(cand); perBrand[cand.c.brand] = (perBrand[cand.c.brand] || 0) + 1; perFam[cand.c.fam] = (perFam[cand.c.fam] || 0) + 1; };

    // make sure every color family picked is represented when possible
    if (fams.length > 1) for (const f of fams) {
      if (picks.length >= n) break;
      const cand = scored.slice(0, 4000).find(x => familyMatch(x.c, f) >= 0.8 && ok(x));
      if (cand) take(cand);
    }
    for (const x of scored) { if (picks.length >= n) break; if (!picks.includes(x) && ok(x)) take(x); }
    // relax the spacing if the pool was too narrow
    if (picks.length < n) for (const x of scored) { if (picks.length >= n) break; if (!picks.includes(x) && picks.every(p => C.deltaE2000(p.c.lab, x.c.lab) >= 2.5)) take(x); }
    picks.sort((x, y) => y.p.score - x.p.score);

    const top = picks[0] && picks[0].c;
    const maxScore = picks[0] ? picks[0].p.score : 1;
    const results = picks.map(x => ({
      color: x.c,
      score: x.p.score,
      fit: Math.round(Math.max(0, Math.min(1, x.p.score / Math.max(maxScore, 0.0001))) * 100),
      parts: x.p,
      role: roleFor(x.c, top),
      reasons: reasonsFor(x.c, a, x.p, t),
      warnings: sortWarnings(warningsFor(x.c, a)),
    }));
    if (fams.length && results.length && results.every(r => Math.max(...fams.map(f => familyMatch(r.color, f))) < 0.5))
      notices.push({ level: 'heads-up', title: 'Nothing Matched Those Color Families Here', text: 'These are the closest fits for the rest of the answers. Try different colors or a different depth.' });
    return { answers: original, target: t, results, tips: roomTips(a, s, results[0] && results[0].color), notices, poolSize: pool.length };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------------- matches, pairings, search ----------------
  function matchesFor(color, opts) {
    opts = opts || {};
    const brands = opts.brands; const out = [];
    for (const b of INDEX.brands) {
      if (brands && brands[b.id] === false) continue;
      if (b.id === color.brand && !opts.includeSameBrand) continue;
      let best = null, bestD = Infinity;
      for (const c of INDEX.byBrand[b.id] || []) {
        if ((c.flags & F.DISC) && !opts.showDiscontinued) continue;
        if (!collectionOn(c, opts.collections)) continue;
        if (c.id === color.id) continue;
        if (Math.abs(c.L - color.L) > bestD * 1.6 + 1) continue; // cheap prune: lightness alone already too far
        const d = C.deltaE2000(color.lab, c.lab);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) out.push({ color: best, dE: Math.round(bestD * 10) / 10, label: C.matchLabel(bestD) });
    }
    out.sort((x, y) => x.dE - y.dE);
    return out;
  }
  function nearestInBrand(lab, brandId, filter, n) {
    const list = (INDEX.byBrand[brandId] || []).filter(c => !(c.flags & F.DISC) && (!filter || filter(c)));
    return list.map(c => ({ c, d: C.deltaE2000(lab, c.lab) })).sort((x, y) => x.d - y.d).slice(0, n || 1).map(x => x.c);
  }
  function labFromLch(L, Cc, h) { const r = h * Math.PI / 180; return [L, Cc * Math.cos(r), Cc * Math.sin(r)]; }
  function pairings(color, opts) {
    const out = [];
    const ok = c => collectionOn(c, opts && opts.collections);
    // trim white: same brand, white, undertone in harmony
    const whites = (INDEX.byBrand[color.brand] || []).filter(c => ok(c) && isWhiteish(c) && c.lrv >= 80 && !(c.flags & F.DISC) && c.id !== color.id);
    if (whites.length) {
      const wantWarm = color.temp === 'warm';
      const scoreW = w => (wantWarm ? (w.temp === 'cool' ? 6 : 0) + Math.abs(w.C - 4) : (w.temp === 'warm' && w.C > 4 ? 6 : 0) + w.C) - (w.flags & F.POPULAR ? 2.5 : 0) + Math.abs(w.lrv - 86) * 0.15;
      const w = whites.slice().sort((x, y) => scoreW(x) - scoreW(y))[0];
      out.push({ role: 'Trim & ceiling', color: w });
    }
    const sameHue = c => hueDiff(c.h, color.h) < 18 || (color.C < 6 && c.C < 8);
    if (color.L < 82) { const l = nearestInBrand(labFromLch(Math.min(96, color.L + 22), color.C * 0.75, color.h), color.brand, c => ok(c) && sameHue(c) && c.id !== color.id)[0]; if (l) out.push({ role: 'Lighter, same family', color: l }); }
    if (color.L > 30) { const dk = nearestInBrand(labFromLch(Math.max(18, color.L - 26), Math.min(color.C * 1.1 + 2, 60), color.h), color.brand, c => ok(c) && sameHue(c) && c.id !== color.id)[0]; if (dk) out.push({ role: 'Deeper, same family', color: dk }); }
    const accH = color.C < 8 ? (color.temp === 'warm' ? 215 : 60) : (color.h + 180) % 360;
    const accent = nearestInBrand(labFromLch(color.L > 60 ? 42 : 70, color.C < 8 ? 24 : Math.min(30, color.C), accH), color.brand, c => ok(c) && c.id !== color.id)[0];
    if (accent) out.push({ role: 'Accent', color: accent });
    return out;
  }

  function normalize(s) { return String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function search(query, opts) {
    opts = opts || {};
    const q = String(query || '').trim(); if (!q) return [];
    const hex = q.replace('#', '').match(/^[0-9a-f]{6}$/i);
    const pool = INDEX.colors.filter(c => (!opts.brands || opts.brands[c.brand] !== false) && (!(c.flags & F.DISC) || opts.showDiscontinued));
    if (hex) {
      const lab = C.hexToLab(hex[0]);
      return pool.map(c => ({ c, d: C.deltaE2000(lab, c.lab) })).sort((x, y) => x.d - y.d).slice(0, opts.limit || 40).map(x => ({ color: x.c, dE: Math.round(x.d * 10) / 10 }));
    }
    let nq = normalize(q);
    // strip a leading brand word or prefix ("sw 7029", "bm oc 17", "behr swiss coffee")
    let brandHint = null;
    const hints = { sw: 'sw', sherwin: 'sw', 'sherwin williams': 'sw', bm: 'bm', benjamin: 'bm', 'benjamin moore': 'bm', behr: 'behr', valspar: 'valspar', glidden: 'glidden', ppg: 'ppg', pittsburgh: 'ppg', hgsw: 'hgsw', hgtv: 'hgsw', 'dutch boy': 'dutchboy', dunn: 'de', 'dunn edwards': 'de', de: 'de', 'diamond vogel': 'dv', clark: 'ck', 'clark kensington': 'ck', 'clark and kensington': 'ck', ck: 'ck', 'c k': 'ck', magnolia: 'magnolia', 'magnolia home': 'magnolia', kilz: 'kilz', vista: 'vista', resene: 'resene', farrow: 'fb', 'farrow ball': 'fb', 'f b': 'fb', hallman: 'hl', 'hallman lindsay': 'hl', colorhouse: 'colorhouse', yolo: 'colorhouse', ral: 'ral' };
    for (const k of Object.keys(hints).sort((x, y) => y.length - x.length)) {
      if (nq === k || nq.startsWith(k + ' ')) { brandHint = hints[k]; nq = nq.slice(k.length).trim(); break; }
    }
    if (!nq && brandHint) return pool.filter(c => c.brand === brandHint && (c.flags & F.POPULAR)).slice(0, opts.limit || 40).map(c => ({ color: c }));
    const qCode = nq.replace(/\s+/g, '');
    const scoredList = [];
    for (const c of pool) {
      if (brandHint && c.brand !== brandHint && !(brandHint === 'ppg' && c.brand === 'glidden')) continue;
      const code = normalize(c.code).replace(/\s+/g, '');
      const name = normalize(c.name);
      let s = 0;
      if (qCode && code === qCode) s = 100;
      else if (qCode.length >= 2 && code.startsWith(qCode)) s = 70 - (code.length - qCode.length);
      else if (name === nq) s = 90;
      else if (name.startsWith(nq)) s = 60;
      else if (nq.length >= 3 && (' ' + name).includes(' ' + nq)) s = 45;
      else if (nq.length >= 3 && name.includes(nq)) s = 30;
      if (s) { if (c.flags & F.POPULAR) s += 3; scoredList.push({ c, s }); }
    }
    scoredList.sort((x, y) => y.s - x.s || x.c.name.localeCompare(y.c.name));
    return scoredList.slice(0, opts.limit || 60).map(x => ({ color: x.c }));
  }

  function lightForAnswers(a) {
    a = a || {};
    if (noWindows(a)) return a.bulbs === 'daylight' ? 'cool' : a.bulbs === 'soft' ? 'soft' : 'warm';
    if (hasDir(a, 'south') || hasDir(a, 'west')) return 'sun';
    if (onlyNorth(a)) return 'north';
    if (a.amount === 'low') return 'dim';
    return 'daylight';
  }

  // Parse a CSV/TSV of custom colors: brand,name,code,hex[,lrv]
  function parseCustomCsv(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return { brands: {}, errors: ['The file is empty.'] };
    const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if ((ch === ',' || ch === '\t' || ch === ';') && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
    let head = split(lines[0]).map(h => h.toLowerCase());
    let start = 1;
    if (!head.some(h => /hex|rgb|colou?r/.test(h)) || head.some(h => /^#?[0-9a-f]{6}$/i.test(h))) { head = ['brand', 'name', 'code', 'hex', 'lrv']; start = 0; }
    const col = k => head.findIndex(h => h.includes(k));
    const iB = col('brand'), iN = col('name'), iC = head.findIndex(h => h.includes('code') || h.includes('number') || h === 'id'), iH = head.findIndex(h => h.includes('hex') || h.includes('rgb') || h === 'color' || h === 'colour'), iL = col('lrv');
    const brands = {}; const errors = [];
    for (let i = start; i < lines.length; i++) {
      const p = split(lines[i]);
      const hexRaw = (p[iH] || '').replace('#', '');
      let hex = /^[0-9a-f]{6}$/i.test(hexRaw) ? hexRaw.toUpperCase() : null;
      if (!hex) { const m = (p[iH] || '').match(/(\d+)\D+(\d+)\D+(\d+)/); if (m) hex = C.rgbToHex([+m[1], +m[2], +m[3]]); }
      if (!hex) { if (errors.length < 5) errors.push(`Line ${i + 1}: no color value found.`); continue; }
      const brand = (iB >= 0 && p[iB]) || 'Custom colors';
      const lrv = iL >= 0 && p[iL] !== '' && Number.isFinite(+p[iL]) ? +p[iL] : null;
      (brands[brand] = brands[brand] || []).push([(iC >= 0 && p[iC]) || String(i), (iN >= 0 && p[iN]) || hex, hex, lrv, lrv == null ? F.LRV_EST : 0, '']);
    }
    return { brands, errors };
  }

  const api = { F, SPACES, SHEENS, STYLES, prosCons, PAINT_LINES, TIERS, recommendLines, FAMILY_CHOICES, DEPTHS, FACING, AMOUNTS, BULBS, SIDING, FIXED, FIXED_ITEMS, FIXED_KINDS, FIXED_GROUPS, SPACE_GROUPS, groupsFor, allowedFixed, WHITE_TYPES, fixedItems, fixedEffects, LIGHTS, DEFAULT_ANSWERS,
    init, addBrand, getIndex, findColor, codeLabel, target, familyMatch, styleMatch, scoreColor, warningsFor, roomTips, recommend,
    matchesFor, pairings, search, lightForAnswers, parseCustomCsv, allowedColor, facingsOf, facingPhrase, noWindows, DIRS,
    MOODS, UNDERTONES, NOW_COLORS, NOW_HEX, SURFACES, surfacesFor, ISSUES, PRIMERS, primerFor, nowHexOf,
    COLLECTIONS, collectionOf, collectionsFor, collectionLabel, collectionOn };
  root.CG = root.CG || {};
  root.CG.engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
