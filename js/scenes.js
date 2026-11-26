/* ColorGenius flat pictures: the drawn room, kitchen, house, deck and fence scenes, and the wood, stone and
   fabric textures they use. These are the pictures on devices without 3D graphics (WebGL), and the wood swatches
   everywhere. Depends on CG.color, CG.engine and CG.wood. The app sets how colors are shown with configure(). */
(function (root) {
  'use strict';
  const C = root.CG.color, E = root.CG.engine, WD = root.CG.wood;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  // how a color is shown (light preview and screen calibration) comes from the app
  const cfg = { paint: (hex) => '#' + hex, cal: () => null };
  function configure(o) { Object.assign(cfg, o || {}); texCache.clear(); }
  const paint = (hex, lightId) => cfg.paint(hex, lightId);
  const settings = { get cal() { return cfg.cal(); } };
  // ---------------- preview scenes ----------------
  // The preview matches what is being painted: a room (walls, accent wall, ceiling, trim), a kitchen (cabinets)
  // or the front of a house (siding, exterior trim, front door). Interiors use one-point perspective with the
  // vanishing point at (500,200) in an 800x480 frame. Every painted surface goes through the same light and
  // calibration pipeline as the chips.
  function sceneKind(space) {
    const sp = E.SPACES[space] || E.SPACES.living;
    if (sp.kind === 'exterior') return 'house';
    if (space === 'cabinets' || space === 'kitchen') return 'kitchen';
    return 'room';
  }
  // extra pieces some jobs need in the preview
  function sceneExtras(space) {
    const o = { shutters: space === 'shutters', garage: space === 'garage_door', porch: space === 'porch_floor', wainscot: space === 'wainscot' };
    if (space === 'shed') o.siding = 'board';
    return o;
  }
  // what stands against the back wall
  function sceneFurniture(space) {
    if (space === 'bedroom' || space === 'nursery' || space === 'kids') return 'bed';
    if (space === 'bathroom' || space === 'powder') return 'vanity';
    if (space === 'office') return 'desk';
    if (space === 'dining') return 'dining';
    if (space === 'entry' || space === 'stairs') return 'console';
    if (space === 'laundry') return 'laundry';
    if (space === 'garage') return 'garage';
    if (space === 'furniture' || space === 'builtins') return 'dresser';
    if (space === 'powder') return 'vanity';
    if (space === 'closet') return 'console';
    if (space === 'fireplace') return 'fireplace';
    return 'sofa';
  }
  function scenePalette(c, answers, pairs) {
    const space = answers.space;
    const trimW = (pairs.find(p => p.role === 'Trim & ceiling') || {}).color;
    const accent = (pairs.find(p => p.role === 'Accent') || {}).color;
    const white = trimW ? trimW.hex : 'F2F1EC';
    const acc = accent ? accent.hex : '5E6B73';
    const soft = c.lrv > 70 ? 'CFC8BC' : 'ECE8E0'; // a neutral that contrasts with the painted color
    const p = { wall: c.hex, side: c.hex, ceil: white, trim: white, door: white, art: acc, art2: c.hex };
    if (space === 'accent') Object.assign(p, { side: c.lrv > 80 ? 'D9D3C8' : 'ECE8E0', art: white, art2: acc });
    if (space === 'ceiling') Object.assign(p, { ceil: c.hex, wall: soft, side: soft, art2: soft });
    if (space === 'trim') Object.assign(p, { trim: c.hex, door: c.hex, wall: soft, side: soft, ceil: 'F2F1EC', art2: soft });
    if (space === 'doors') Object.assign(p, { door: c.hex, wall: soft, side: soft, art2: soft });
    if (space === 'wainscot') Object.assign(p, { wain: c.hex, wall: soft, side: soft, art2: soft });
    if (space === 'fireplace') Object.assign(p, { fire: c.hex, wall: soft, side: soft, art2: soft });
    if (space === 'floor_paint') Object.assign(p, { floor: c.hex, wall: soft, side: soft, art2: soft });
    if (space === 'furniture' || space === 'builtins') Object.assign(p, { cab: c.hex, wall: c.lrv > 75 ? 'D7D1C6' : 'EEEBE4', side: c.lrv > 75 ? 'D7D1C6' : 'EEEBE4' });
    if (space === 'cabinets') Object.assign(p, { cab: c.hex, wall: c.lrv > 75 ? 'D7D1C6' : 'EEEBE4', side: c.lrv > 75 ? 'D7D1C6' : 'EEEBE4', counter: 'ECEAE5', tile: 'F6F5F1', hood: 'B9BDBF' });
    if (space === 'kitchen') Object.assign(p, { cab: c.lrv > 82 ? '3F4A52' : white, counter: 'ECEAE5', tile: 'F6F5F1', hood: 'B9BDBF' });
    if (space === 'bathroom' || space === 'powder') Object.assign(p, { floor: 'CFCBC4', vanity: c.lrv > 82 ? '5B6770' : white, counter: 'ECEAE5' });
    p.duvet = 'F1F0EC'; p.wood = 'A27B55';
    p.rug = c.lrv > 62 ? 'B8AD9C' : 'DDD5C7'; p.curtain = 'EEEAE2';
    if (!p.cab) p.cab = white;
    if (!p.floor) p.floor = { tile: 'CFCBC4', concrete: '9C9B97', carpet: 'BDB3A5' }[floorTypeOf(answers)] || 'A9784B';
    // show what's staying: the chosen floor, counters, cabinets, furniture and roof
    const items = E.fixedItems(answers);
    const first = kind => items.find(f => f.kind === kind);
    const shadeHex = (hex, k) => C.linearToHex(C.hexToLinear(hex).map(v => Math.min(1, v * k)));
    const fl = first('floor'); if (fl) p.floor = fl.hex;
    const ct = first('counter'); if (ct) p.counter = ct.hex;
    const cb = first('cabinet'); if (cb && space !== 'cabinets') { p.cab = cb.hex; if (space === 'bathroom') p.vanity = cb.hex; }
    const fu = first('furniture'); if (fu) { p.sofa = fu.hex; p['sofa-d'] = shadeHex(fu.hex, 0.82); p['sofa-l'] = shadeHex(fu.hex, 1.16); }
    if (sceneKind(space) === 'house') {
      Object.assign(p, { roof: '45484C', lawn: '6E8A4F', shrub: '4E6A3B', walk: 'CFCAC0', step: 'BEB9B0', glass: '33404B', tree: '5D7649' });
      if (space === 'front_door') Object.assign(p, { xdoor: c.hex, body: c.lrv > 55 ? '6B6F72' : 'D9D5CC', xtrim: 'F2F1EC' });
      if (space === 'ext_body') Object.assign(p, { body: c.hex, xtrim: c.lrv > 80 ? '2E3134' : white, xdoor: acc });
      if (space === 'ext_trim') Object.assign(p, { xtrim: c.hex, body: c.lrv > 55 ? '6B6F72' : 'DCD7CE', xdoor: acc });
      if (space === 'shed') Object.assign(p, { body: c.hex, xtrim: c.lrv > 80 ? '2E3134' : white, xdoor: c.hex });
      if (space === 'shutters') Object.assign(p, { shut: c.hex, body: c.lrv > 55 ? '6B6F72' : 'D9D5CC', xtrim: 'F2F1EC', xdoor: c.hex });
      if (space === 'garage_door') Object.assign(p, { gdoor: c.hex, body: Math.abs(c.lrv - 60) < 18 ? 'B9B4AA' : 'D9D5CC', xtrim: 'F2F1EC' });
      if (space === 'porch_floor') Object.assign(p, { step: c.hex });
      const stone = first('stone'); if (stone && space !== 'porch_floor') p.step = stone.hex; // stone or brick shows on the front steps
    }
    const rf = first('roof'); if (rf) p.roof = rf.hex;
    return p;
  }

  const DEFS_COMMON = `
    <linearGradient id="rgSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="r-sky-top"/><stop offset="1" class="r-sky-bot"/></linearGradient>
    <radialGradient id="rgLamp" cx="0.5" cy="0.5" r="0.5"><stop offset="0" class="r-lamp-c" stop-opacity=".75"/><stop offset=".35" class="r-lamp-c" stop-opacity=".28"/><stop offset="1" class="r-lamp-c" stop-opacity="0"/></radialGradient>
    <filter id="rfSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="rfShadow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>`;

  // ---- window slots: each side with windows gets its own window in the preview ----
  // left wall first, then the back wall (where the art would hang), then the right wall (where the door would be)
  // walls: where the windows really are (Set Up the Room), when that's been set
  function windowSlots(answers, furniture, walls) {
    let dirs = E.facingsOf(answers).slice();
    const all = ['sofa', 'bed', 'desk', 'dining'].includes(furniture) ? ['left', 'back', 'right'] : ['left', 'right'];
    if (Array.isArray(walls)) { const on = all.filter(w => walls.includes(w)); if (!dirs.length) dirs = ['?']; return on.map((slot, i) => ({ slot, dir: dirs[i] || dirs[0] })); }
    if (E.noWindows(answers)) return [];
    if (!dirs.length) dirs = ['?'];
    if ((E.SPACES[answers.space] || {}).sunny) while (dirs.length < 3) dirs.push('?'); // a sunroom is mostly windows
    const slots = ['sofa', 'bed', 'desk', 'dining'].includes(furniture) ? ['left', 'back', 'right'] : ['left', 'right'];
    return dirs.slice(0, slots.length).map((d, i) => ({ slot: slots[i], dir: d }));
  }
  function floorTypeOf(answers) {
    const f = E.fixedItems(answers).find(x => x.kind === 'floor' || x.kind === 'carpet');
    if (f && f.kind === 'carpet') return 'carpet';
    if (f && /tile|travertine/.test(f.id + f.label.toLowerCase())) return 'tile';
    if (f && /concrete/.test(f.id)) return 'concrete';
    if (f) return 'wood';
    return { bathroom: 'tile', powder: 'tile', laundry: 'tile', garage: 'concrete', floor_paint: 'concrete' }[answers.space] || 'wood';
  }
  const WIN = {
    left: { frame: '60.5,110 176,130 176,292 60.5,318', glass: '67.5,118.3 168.8,137.5 168.8,283.7 67.5,309.3', mull: [[118.1, 127.9, 118.1, 296.5], [67.5, 213.8, 168.8, 210.6]], sill: '56,318 180,292 182,299 56,327', sun: '118,402 236,372 352,404 236,446' },
    right: { frame: '692,129 755,112 755,313 692,292', glass: '698.8,137.5 748.7,121.7 748.7,304.8 698.8,283.7', mull: [[723.7, 129.6, 723.7, 294.3], [698.8, 210.6, 748.7, 213.3]], sill: '690,292 758,314 760,321 688,299', sun: '682,402 564,372 448,404 564,446' },
  };
  function backWindow(x, y, w, h, dir) {
    return `<rect class="r-trim" x="${x - 8}" y="${y - 8}" width="${w + 16}" height="${h + 16}" rx="2"/>
      <rect x="${x - 8}" y="${y - 8}" width="${w + 16}" height="${h + 16}" rx="2" fill="#000" opacity=".05"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#rgSky)"/>
      <rect class="r-wtint" data-dir="${dir}" x="${x}" y="${y}" width="${w}" height="${h}" opacity="0"/>
      <g class="r-trim-s" stroke-width="4"><line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}"/><line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}"/></g>
      <rect class="r-trim" x="${x - 14}" y="${y + h + 8}" width="${w + 28}" height="8" rx="1"/>
      <rect x="${x - 14}" y="${y + h + 15}" width="${w + 28}" height="4" fill="#000" opacity=".1"/>`;
  }
  function sideWindow(slot, dir) {
    const w = WIN[slot];
    return `<polygon class="r-trim" points="${w.frame}"/>
      <polygon points="${w.frame}" fill="#000" opacity=".06"/>
      <g clip-path="url(#rcWin-${slot})"><rect x="${slot === 'left' ? 60 : 690}" y="100" width="${slot === 'left' ? 120 : 70}" height="225" fill="url(#rgSky)"/></g>
      <polygon class="r-wtint" data-dir="${dir}" points="${w.glass}" opacity="0"/>
      <g class="r-trim-s" stroke-width="4" fill="none"><polygon points="${w.glass}"/>${w.mull.map(([a, b, c2, d]) => `<line x1="${a}" y1="${b}" x2="${c2}" y2="${d}"/>`).join('')}</g>
      <polygon class="r-trim" points="${w.sill}"/>`;
  }
  // the room shell: walls, ceiling, windows, floor (planks, tile joints, carpet or concrete) and baseboards
  // beadboard on the lower third of every wall, with a cap rail (painted, or stained wood boards with tex)
  function wainscotBand(tex) {
    const fill = tex ? 'fill="url(#ptWain)"' : 'class="r-wain"';
    const left = '0,307 225,259 225,354 0,480', right = '665,259 800,307 800,480 665,354';
    const beads = [];
    for (let x = 239; x < 665; x += 14) beads.push(`<line x1="${x}" y1="262" x2="${x}" y2="354"/>`);
    for (let i = 1; i < 14; i++) {
      const t = i / 14;
      const xl = 225 * (1 - Math.pow(1 - t, 1.6)), xr = 800 - (800 - 665) * (1 - Math.pow(1 - t, 1.6));
      beads.push(`<line x1="${xl.toFixed(1)}" y1="${(307 - 48 * xl / 225 + 3).toFixed(1)}" x2="${xl.toFixed(1)}" y2="${(480 - 126 * xl / 225).toFixed(1)}"/>`);
      beads.push(`<line x1="${xr.toFixed(1)}" y1="${(259 + 48 * (xr - 665) / 135 + 3).toFixed(1)}" x2="${xr.toFixed(1)}" y2="${(354 + 126 * (xr - 665) / 135).toFixed(1)}"/>`);
    }
    return `
      <polygon ${fill} points="${left}"/><polygon points="${left}" fill="url(#rgLeft)"/>
      <polygon ${fill} points="${right}"/><polygon points="${right}" fill="url(#rgRight)"/>
      <rect ${fill} x="225" y="259" width="440" height="95"/><rect x="225" y="259" width="440" height="95" fill="url(#rgBackY)"/>
      <g stroke="#000" stroke-opacity=".13" stroke-width="1.2">${beads.join('')}</g>
      <polygon ${fill} points="0,301 225,256 225,262 0,310"/><polygon ${fill} points="665,256 800,301 800,310 665,262"/><rect ${fill} x="225" y="256" width="440" height="6"/>
      <g fill="#000" opacity=".16"><polygon points="0,310 225,262 225,265 0,314"/><polygon points="665,262 800,310 800,314 665,265"/><rect x="225" y="262" width="440" height="3"/></g>`;
  }
  function interiorShell(o) {
    o = o || {};
    const slots = o.windows || [];
    const has = s => slots.find(x => x.slot === s);
    const floor = o.floorType || 'wood';
    let floorLines = '';
    if (o.floorTex) floorLines = '';
    else if (floor === 'wood') {
      const planks = [];
      for (let x0 = -560; x0 <= 1560; x0 += 96) { const xb = 500 + (x0 - 500) * 0.55; planks.push(`<line x1="${x0}" y1="480" x2="${xb.toFixed(1)}" y2="354"/>`); }
      const seams = [[60, 452, 170, 452], [300, 430, 380, 430], [520, 466, 640, 466], [150, 400, 215, 400], [420, 392, 480, 392], [610, 408, 675, 408], [260, 372, 300, 372], [560, 368, 600, 368]].map(([a, b, c2, d]) => `<line x1="${a}" y1="${b}" x2="${c2}" y2="${d}"/>`).join('');
      floorLines = `<g clip-path="url(#rcFloor)" stroke="#000" stroke-opacity=".13" stroke-width="1.4">${planks.join('')}${seams}</g>`;
    } else if (floor === 'tile') {
      const g = [];
      for (let x0 = -900; x0 <= 1900; x0 += 150) { const xb = 500 + (x0 - 500) * 0.55; g.push(`<line x1="${x0}" y1="480" x2="${xb.toFixed(1)}" y2="354"/>`); }
      for (const y of [366, 382, 404, 434, 474]) g.push(`<line x1="0" y1="${y}" x2="800" y2="${y}"/>`);
      floorLines = `<g clip-path="url(#rcFloor)" stroke="#fff" stroke-opacity=".35" stroke-width="1.6">${g.join('')}</g>`;
    } else if (floor === 'concrete') {
      floorLines = `<g clip-path="url(#rcFloor)" stroke="#000" stroke-opacity=".10" stroke-width="1.2"><line x1="0" y1="420" x2="800" y2="420"/><line x1="400" y1="354" x2="400" y2="480"/></g>`;
    }
    const tr = o.trimTex ? 'fill="url(#ptTrimV)"' : 'class="r-trim"', trH = o.trimTex ? 'fill="url(#ptTrim)"' : 'class="r-trim"';
    const door = o.door && !has('right') ? `
      <polygon ${tr} points="681,135 737,118 737,423 681,377"/>
      <polygon ${o.trimTex ? 'fill="url(#ptTrimV)"' : 'class="r-door"'} points="686,142 732,127 732,417 686,373"/>
      <polygon points="686,142 732,127 732,417 686,373" fill="#000" opacity=".10"/>
      <g fill="none" stroke="#000" stroke-opacity=".14" stroke-width="1.4"><polygon points="692,158 726,147 726,262 692,266"/><polygon points="692,282 726,279 726,398 692,360"/></g>
      <circle cx="727" cy="279" r="3.2" fill="#b8963e"/>` : '';
    return `
      <polygon class="r-ceil" points="0,0 800,0 665,90 225,90"/>
      <polygon points="0,0 800,0 665,90 225,90" fill="url(#rgCeil)"/>
      <polygon class="r-side" points="0,0 225,90 225,354 0,480"/>
      <polygon points="0,0 225,90 225,354 0,480" fill="url(#rgLeft)"/>
      <polygon class="r-side" points="800,0 665,90 665,354 800,480"/>
      <polygon points="800,0 665,90 665,354 800,480" fill="url(#rgRight)"/>
      <rect class="r-wall" x="225" y="90" width="440" height="264"/>
      <rect x="225" y="90" width="440" height="264" fill="url(#rgBackX)"/>
      <rect x="225" y="90" width="440" height="264" fill="url(#rgBackY)"/>
      ${has('left') ? '<rect x="225" y="90" width="440" height="264" fill="url(#rgWinGlow)"/>' : ''}
      ${has('right') ? '<rect x="225" y="90" width="440" height="264" fill="url(#rgWinGlowR)"/>' : ''}
      ${o.wainscot ? wainscotBand(o.wainscotTex) : ''}
      ${o.crown ? CROWN : ''}
      ${has('left') ? sideWindow('left', has('left').dir) + (o.curtains ? CURTAINS.left : '') : ''}
      ${has('right') ? sideWindow('right', has('right').dir) + (o.curtains ? CURTAINS.right : '') : ''}
      <polygon class="r-floor" points="0,480 225,354 665,354 800,480"/>
      ${o.floorTex ? `<image data-tex="${esc(JSON.stringify(o.floorTex))}" x="0" y="354" width="800" height="126" preserveAspectRatio="none" clip-path="url(#rcFloor)"/>` : ''}
      ${floorLines}
      <polygon points="0,480 225,354 665,354 800,480" fill="url(#rgFloor)"/>
      ${floor === 'carpet' ? '<polygon points="0,480 225,354 665,354 800,480" fill="url(#rgCarpet)" opacity=".5"/>' : ''}
      ${slots.filter(s => WIN[s.slot]).map(s => `<polygon class="r-sun" data-dir="${s.dir}" points="${WIN[s.slot].sun}" filter="url(#rfSoft)"/>`).join('')}
      ${has('back') ? `<polygon class="r-sun" data-dir="${has('back').dir}" points="${o.backX - 10},362 ${o.backX + 150},362 ${o.backX + 190},404 ${o.backX - 50},404" filter="url(#rfSoft)"/>` : ''}
      <rect ${trH} x="225" y="341" width="440" height="13"/>
      <polygon ${trH} points="0,459 225,341 225,354 0,480"/>
      <polygon ${trH} points="665,341 800,459 800,480 665,354"/>
      <polygon points="665,341 800,459 800,480 665,354" fill="#000" opacity=".12"/>
      <rect x="225" y="352" width="440" height="2" fill="#000" opacity=".12"/>
      ${door}`;
  }
  // crown molding along the top of the walls
  const CROWN = `
      <rect class="r-trim" x="225" y="90" width="440" height="9"/><rect x="225" y="98" width="440" height="2.5" fill="#000" opacity=".12"/>
      <polygon class="r-trim" points="0,0 225,90 225,99 0,14"/><polygon points="0,0 225,90 225,99 0,14" fill="#fff" opacity=".06"/>
      <polygon class="r-trim" points="800,0 665,90 665,99 800,14"/><polygon points="800,0 665,90 665,99 800,14" fill="#000" opacity=".12"/>`;
  // linen curtain panels beside the side windows, drawn on the wall planes with their folds
  const curtainPanel = (pts, folds) => `<polygon class="r-curtain" points="${pts}"/><polygon points="${pts}" fill="url(#rgFold)"/>${folds.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-opacity=".09" stroke-width="2.2"/>`).join('')}`;
  const CURTAINS = {
    left: `<line x1="30" y1="94" x2="204" y2="133" stroke="#3a3632" stroke-width="2.6" stroke-linecap="round"/>
      ${curtainPanel('34,96 58,101 58,446 34,458', [[42, 98, 42, 454], [50, 100, 50, 450]])}
      ${curtainPanel('178,128 200,133 200,366 178,378', [[186, 130, 186, 374], [193, 131, 193, 370]])}`,
    right: `<line x1="682" y1="137" x2="768" y2="106" stroke="#3a3632" stroke-width="2.6" stroke-linecap="round"/>
      ${curtainPanel('684,136 693,133 693,371 684,364', [[688, 135, 688, 368]])}
      ${curtainPanel('755,111 768,107 768,452 755,440', [[761, 109, 761, 446]])}`,
  };
  const INTERIOR_DEFS = `
    <linearGradient id="rgCeil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="rgLeft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".85" stop-color="#000" stop-opacity=".02"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></linearGradient>
    <linearGradient id="rgRight" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".8" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
    <linearGradient id="rgBackX" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset=".07" stop-color="#000" stop-opacity="0"/><stop offset=".93" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
    <linearGradient id="rgBackY" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".08"/><stop offset=".12" stop-color="#000" stop-opacity="0"/><stop offset=".9" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".07"/></linearGradient>
    <radialGradient id="rgWinGlow" cx="0.05" cy="0.45" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="rgWinGlowR" cx="0.95" cy="0.45" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="rgFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".45" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/></linearGradient>
    <radialGradient id="rgCarpet" cx="0.5" cy="0.9" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient>
    <radialGradient id="rgNight" cx="0.36" cy="0.46" r="0.85"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>
    <linearGradient id="rgFold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset=".3" stop-color="#fff" stop-opacity=".10"/><stop offset=".6" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient>
    <radialGradient id="rgCeilLight" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff8e8" stop-opacity=".9"/><stop offset="1" stop-color="#fff8e8" stop-opacity="0"/></radialGradient>
    <clipPath id="rcFloor"><polygon points="0,480 225,354 665,354 800,480"/></clipPath>
    <clipPath id="rcWin-left"><polygon points="67.5,118.3 168.8,137.5 168.8,283.7 67.5,309.3"/></clipPath>
    <clipPath id="rcWin-right"><polygon points="698.8,137.5 748.7,121.7 748.7,304.8 698.8,283.7"/></clipPath>`;
  const LAMP = `
      <circle class="r-lamp-glow" cx="288" cy="214" r="120" fill="url(#rgLamp)"/>
      <ellipse cx="288" cy="388" rx="26" ry="5" fill="#000" opacity=".25" filter="url(#rfShadow)"/>
      <line x1="288" y1="230" x2="288" y2="384" stroke="#2d2a27" stroke-width="3.2" stroke-linecap="round"/>
      <ellipse cx="288" cy="385" rx="17" ry="4" fill="#2d2a27"/>
      <polygon class="r-shade" points="264,196 312,196 322,232 254,232"/>`;

  function sceneSvg(kind, opts) {
    const open = `<svg class="room-svg" viewBox="0 0 800 480" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(opts.label)}">`;
    if (kind === 'house') return open + houseSvg(opts) + '</svg>';
    const furniture = kind === 'kitchen' ? 'kitchen' : (opts.furniture || 'sofa');
    const slots = opts.windows || [];
    const back = slots.find(s => s.slot === 'back');
    // textures: real wood grain on floors and furniture, woven fabric on upholstery, stone on counters
    const woodTex = opts.woodTex || { t: 'boards', sp: 'red_oak', role: 'wood', w: 400, h: 120, cm: 0.3, board: 14, seed: 2 };
    const floorTex = opts.floorTex || (['wood', 'tile', 'carpet', 'concrete'].includes(opts.floorType || 'wood') ? { t: 'floor', kind: opts.floorType || 'wood', sp: 'red_oak', role: 'floor' } : null);
    const texDefs = [
      pattern('ptWood', woodTex, woodTex.w, woodTex.h),
      pattern('ptFabric', { t: 'fabric', tint: 'FFFFFF', w: 96, h: 96 }, 96, 96),
      pattern('ptStone', { t: 'stone', role: 'counter', w: 440, h: 60 }, 440, 60, 226, 258),
      opts.trimTex ? pattern('ptTrim', Object.assign({}, opts.trimTex, { t: 'boards', w: 440, h: 40, cm: 0.5, board: 30 }), 440, 40, 0, 339) : '',
      opts.trimTex ? pattern('ptTrimV', Object.assign({}, opts.trimTex, { t: 'boards', w: 120, h: 340, cm: 0.6, board: 40, vertical: true }), 120, 340, 670, 110) : '',
      opts.wainscotTex ? pattern('ptWain', Object.assign({}, opts.wainscotTex, { t: 'boards', w: 400, h: 120, cm: 0.5, board: 9, vertical: true, seed: 6 }), 400, 120, 0, 256) : '',
      opts.cabTex ? pattern('ptCabBox', Object.assign({}, opts.cabTex, { t: 'boards', w: 440, h: 260, cm: 0.35, board: 18, vertical: true }), 440, 260, 226, 96) : '',
    ].join('');
    const defs = `<defs>${DEFS_COMMON}${INTERIOR_DEFS}${texDefs}${furniture === 'vanity' || furniture === 'console' ? '<linearGradient id="rgMirror" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9eef1"/><stop offset=".5" stop-color="#c9d2d7"/><stop offset="1" stop-color="#dfe5e8"/></linearGradient>' : ''}</defs>`;
    const backX = { bed: 412, desk: 300, dining: 400 }[furniture] || 402; // where the back-wall window sits
    const homey = ['sofa', 'bed', 'dining', 'desk'].includes(furniture);
    const shell = interiorShell({ windows: slots, door: furniture !== 'kitchen', floorType: opts.floorType, backX, floorTex, trimTex: opts.trimTex, crown: opts.crown, curtains: homey, wainscot: opts.wainscot, wainscotTex: opts.wainscotTex });
    const night = '<rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/>';
    const art = (x, y, w, h) => `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#000" opacity=".12" filter="url(#rfShadow)" transform="translate(3 5)"/>
      <rect class="r-frame" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>
      <rect class="r-trim" x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}"/>
      <rect class="r-art" x="${x + 21}" y="${y + 20}" width="${w - 42}" height="${h - 40}"/>
      <rect class="r-art2" x="${x + 21}" y="${y + h - 46}" width="${w - 42}" height="${26}"/>`;
    // a window on the back wall takes the art's place
    const artOrWindow = (x, y, w, h) => back ? backWindow(x + 4, y - 4, w - 8, h - 4, back.dir) + (homey ? backCurtains(x + 4, y - 4, w - 8, h - 4) : '') : art(x, y, w, h);
    // a flush-mount ceiling light, glowing at night
    const ceilLight = homey ? `<circle class="r-lamp-glow" cx="445" cy="58" r="90" fill="url(#rgLamp)"/><ellipse cx="445" cy="50" rx="44" ry="8" fill="#000" opacity=".08"/><ellipse class="r-shade" cx="445" cy="47" rx="38" ry="7"/><ellipse cx="445" cy="45" rx="38" ry="5" fill="#fff" opacity=".35"/>` : '';
    const rug = (pts) => `<polygon class="r-rug" points="${pts}"/><polygon points="${pts}" fill="url(#ptFabric)" style="mix-blend-mode:multiply"/><polygon points="${pts}" fill="none" stroke="#000" stroke-opacity=".10" stroke-width="5" stroke-linejoin="round" transform="translate(0 0)"/>`;
    let body = '';
    if (furniture === 'kitchen') body = `
      <rect x="236" y="98" width="190" height="98" fill="#000" opacity=".14" filter="url(#rfShadow)" transform="translate(0 6)"/>
      <rect x="474" y="98" width="182" height="98" fill="#000" opacity=".14" filter="url(#rfShadow)" transform="translate(0 6)"/>
      <rect class="r-cab" x="236" y="98" width="190" height="98" rx="2"/><rect class="r-cab" x="474" y="98" width="182" height="98" rx="2"/>
      <g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5"><line x1="331" y1="100" x2="331" y2="194"/><line x1="565" y1="100" x2="565" y2="194"/>
        <rect x="244" y="106" width="79" height="82" rx="1.5"/><rect x="339" y="106" width="79" height="82" rx="1.5"/><rect x="482" y="106" width="75" height="82" rx="1.5"/><rect x="573" y="106" width="75" height="82" rx="1.5"/></g>
      <g fill="#8d8f91"><rect x="318" y="168" width="3" height="18" rx="1.5"/><rect x="341" y="168" width="3" height="18" rx="1.5"/><rect x="554" y="168" width="3" height="18" rx="1.5"/><rect x="576" y="168" width="3" height="18" rx="1.5"/></g>
      <polygon class="r-hood" points="432,98 468,98 474,170 426,170"/><rect class="r-hood" x="420" y="168" width="60" height="12" rx="2"/>
      <rect class="r-tile" x="236" y="196" width="420" height="68"/>
      <g stroke="#000" stroke-opacity=".08" stroke-width="1">${Array.from({ length: 4 }, (_, i) => `<line x1="236" y1="${213 + i * 17}" x2="656" y2="${213 + i * 17}"/>`).join('')}${Array.from({ length: 13 }, (_, i) => `<line x1="${270 + i * 32}" y1="196" x2="${270 + i * 32}" y2="264"/>`).join('')}</g>
      <rect x="228" y="270" width="436" height="80" fill="#000" opacity=".18" filter="url(#rfShadow)" transform="translate(0 8)"/>
      <rect class="r-cab" x="232" y="272" width="428" height="72"/>
      <rect x="236" y="344" width="420" height="10" fill="#2a2725" opacity=".55"/>
      <g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5">${[236, 322, 408, 494, 580].map(x => `<rect x="${x + 4}" y="${x === 408 ? 300 : 278}" width="74" height="${x === 408 ? 40 : 62}" rx="1.5"/>`).join('')}<rect x="412" y="278" width="74" height="18" rx="1.5"/></g>
      <g fill="#8d8f91">${[236, 322, 494, 580].map(x => `<rect x="${x + 30}" y="284" width="22" height="3" rx="1.5"/>`).join('')}<rect x="438" y="285" width="22" height="3" rx="1.5"/><rect x="438" y="310" width="22" height="3" rx="1.5"/></g>
      <rect class="r-counter" x="226" y="262" width="440" height="11" rx="2"/>
      <rect x="226" y="262" width="440" height="11" rx="2" fill="url(#ptStone)"/>
      <rect x="226" y="271" width="440" height="3" fill="#000" opacity=".12"/>
      <rect x="512" y="259" width="72" height="5" rx="2" fill="#8d9194"/><path d="M548 260 v-22 q0 -8 9 -8 h8" fill="none" stroke="#9a9c9e" stroke-width="3.5" stroke-linecap="round"/>
      <rect x="282" y="248" width="44" height="14" rx="2" fill="#b9915f"/><circle cx="300" cy="244" r="7" fill="#c9553a"/><circle cx="312" cy="246" r="6" fill="#e0a43a"/>
      ${[350, 600].map(x => `<line x1="${x}" y1="0" x2="${x}" y2="58" stroke="#2d2a27" stroke-width="1.6"/><circle class="r-lamp-glow" cx="${x}" cy="74" r="70" fill="url(#rgLamp)"/><path d="M${x - 18} 76 Q${x - 18} 56 ${x} 56 Q${x + 18} 56 ${x + 18} 76z" fill="#2f3337"/><ellipse class="r-shade" cx="${x}" cy="76" rx="15" ry="3"/>`).join('')}`;
    if (furniture === 'kitchen' && opts.cabTex) {
      // stained cabinets: wood boxes with real cabinet doors laid over them (frame and panel)
      const tex = Object.assign({}, opts.cabTex, { t: 'door', w: 150, h: 160, cm: 0.38 });
      const imgs = list => list.map(([x, y, w, h]) => `<image data-tex="${esc(JSON.stringify(tex))}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>`).join('');
      const upper = [[244, 106, 79, 82], [339, 106, 79, 82], [482, 106, 75, 82], [573, 106, 75, 82]];
      const lower = [[240, 278, 74, 62], [326, 278, 74, 62], [412, 300, 74, 40], [412, 278, 74, 18], [498, 278, 74, 62], [584, 278, 74, 62]];
      body = body.replace(/<rect class="r-cab" /g, '<rect fill="url(#ptCabBox)" ')
        .replace('<g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5"><line x1="331"', imgs(upper) + '<g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5"><line x1="331"')
        .replace('<rect fill="url(#ptCabBox)" x="232" y="272" width="428" height="72"/>', '<rect fill="url(#ptCabBox)" x="232" y="272" width="428" height="72"/>' + imgs(lower));
    }
    else if (furniture === 'bed') body = `${artOrWindow(412, 140, 132, 84)}${rug('290,404 666,404 736,470 220,470')}
      <ellipse cx="478" cy="396" rx="190" ry="14" fill="#000" opacity=".24" filter="url(#rfShadow)"/>
      <rect class="r-sofa-d" x="384" y="252" width="188" height="92" rx="8"/>
      <polygon class="r-duvet" points="378,318 578,318 616,396 340,396"/>
      <polygon points="378,318 578,318 616,396 340,396" fill="#000" opacity=".05"/>
      <path d="M352 372 Q478 360 604 372" fill="none" stroke="#000" stroke-opacity=".10" stroke-width="2"/>
      <rect class="r-duvet" x="398" y="296" width="72" height="28" rx="10"/><rect class="r-duvet" x="486" y="296" width="72" height="28" rx="10"/>
      <rect x="398" y="296" width="72" height="28" rx="10" fill="#000" opacity=".04"/><rect x="486" y="296" width="72" height="28" rx="10" fill="#000" opacity=".04"/>
      <rect class="r-sofa-l" x="340" y="388" width="276" height="10" rx="3"/>
      <rect class="r-art" x="444" y="304" width="68" height="22" rx="9"/><rect x="444" y="304" width="68" height="22" rx="9" fill="url(#ptFabric)" style="mix-blend-mode:multiply"/>
      <polygon class="r-art2" points="380,346 576,346 596,384 360,384" opacity=".55"/>
      ${[322, 594].map(x => `<rect x="${x - 3}" y="314" width="66" height="50" rx="3" fill="#000" opacity=".16" filter="url(#rfShadow)"/><rect class="r-wood" x="${x}" y="312" width="60" height="50" rx="3"/><line x1="${x + 4}" y1="335" x2="${x + 56}" y2="335" stroke="#000" stroke-opacity=".18"/><circle class="r-lamp-glow" cx="${x + 30}" cy="282" r="70" fill="url(#rgLamp)"/><rect x="${x + 28}" y="288" width="4" height="24" fill="#3a3632"/><polygon class="r-shade" points="${x + 18},270 ${x + 42},270 ${x + 47},290 ${x + 13},290"/>`).join('')}`;
    else if (furniture === 'vanity') body = `
      <rect x="398" y="128" width="148" height="126" rx="6" fill="#000" opacity=".14" filter="url(#rfShadow)" transform="translate(2 5)"/>
      <rect class="r-frame" x="398" y="128" width="148" height="126" rx="6"/>
      <rect x="405" y="135" width="134" height="112" rx="3" fill="url(#rgMirror)"/>
      <path d="M420 240 L470 140 M450 240 L500 140" stroke="#fff" stroke-opacity=".35" stroke-width="6"/>
      ${[372, 572].map(x => `<rect x="${x - 4}" y="150" width="8" height="34" rx="3" fill="#3a3632"/><circle class="r-lamp-glow" cx="${x}" cy="160" r="46" fill="url(#rgLamp)"/><rect class="r-shade" x="${x - 9}" y="146" width="18" height="26" rx="8"/>`).join('')}
      <ellipse cx="472" cy="362" rx="120" ry="9" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      <rect class="r-vanity" x="380" y="282" width="184" height="72"/>
      <g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5"><rect x="386" y="288" width="84" height="60" rx="1.5"/><rect x="474" y="288" width="84" height="60" rx="1.5"/></g>
      <rect x="452" y="300" width="3" height="16" rx="1.5" fill="#8d8f91"/><rect x="489" y="300" width="3" height="16" rx="1.5" fill="#8d8f91"/>
      <rect class="r-counter" x="372" y="273" width="200" height="11" rx="2"/>
      <ellipse cx="472" cy="276" rx="34" ry="4.5" fill="#000" opacity=".16"/>
      <path d="M472 274 v-16 q0 -6 8 -6 h6" fill="none" stroke="#9a9c9e" stroke-width="3" stroke-linecap="round"/>
      <rect x="590" y="214" width="40" height="4" rx="2" fill="#8d8f91"/><rect class="r-duvet" x="594" y="218" width="32" height="56" rx="3"/>`;
    else if (furniture === 'desk') body = `${artOrWindow(300, 140, 120, 86)}
      <rect x="456" y="150" width="150" height="10" rx="2" fill="#000" opacity=".1" filter="url(#rfShadow)" transform="translate(0 4)"/>
      <rect class="r-wood" x="456" y="150" width="150" height="8" rx="2"/>
      <rect x="470" y="124" width="14" height="26" fill="#6b5d52"/><rect x="488" y="128" width="12" height="22" fill="#8c7b6d"/><rect x="504" y="120" width="10" height="30" fill="#4d5a63"/>
      <ellipse cx="560" cy="142" rx="14" ry="9" fill="#5e7a4c"/><rect x="552" y="140" width="16" height="10" fill="#b48a63"/>
      <ellipse cx="470" cy="372" rx="150" ry="10" fill="#000" opacity=".24" filter="url(#rfShadow)"/>
      <rect class="r-wood" x="352" y="292" width="236" height="12" rx="2"/>
      <rect x="362" y="304" width="7" height="64" fill="#3a3632"/><rect x="571" y="304" width="7" height="64" fill="#3a3632"/>
      <rect x="430" y="236" width="94" height="56" rx="4" fill="#26282b"/><rect x="436" y="242" width="82" height="44" rx="2" fill="#3c4650"/><rect x="472" y="290" width="10" height="4" fill="#26282b"/>
      <circle class="r-lamp-glow" cx="390" cy="262" r="70" fill="url(#rgLamp)"/><path d="M380 292 l10 -30 l16 6" fill="none" stroke="#2d2a27" stroke-width="3" stroke-linecap="round"/><polygon class="r-shade" points="398,262 420,262 416,276 402,276"/>
      <rect class="r-sofa-d" x="440" y="312" width="70" height="44" rx="10"/><rect x="471" y="356" width="8" height="22" fill="#2d2a27"/><rect x="452" y="376" width="46" height="5" rx="2" fill="#2d2a27"/>`;
    else if (furniture === 'dining') body = `${artOrWindow(400, 132, 156, 96)}${rug('270,380 686,380 752,462 204,462')}
      <line x1="478" y1="90" x2="478" y2="214" stroke="#2d2a27" stroke-width="2"/>
      <circle class="r-lamp-glow" cx="478" cy="236" r="110" fill="url(#rgLamp)"/>
      <polygon class="r-shade" points="452,214 504,214 520,240 436,240"/>
      <ellipse cx="478" cy="400" rx="200" ry="14" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      ${[[352, 300], [418, 296], [538, 296], [604, 300]].map(([x, y]) => `<rect class="r-sofa-d" x="${x - 18}" y="${y}" width="36" height="46" rx="6"/><rect class="r-wood" x="${x - 20}" y="${y + 44}" width="40" height="8" rx="2"/>`).join('')}
      <polygon class="r-wood" points="330,338 626,338 660,370 296,370"/>
      <polygon points="330,338 626,338 660,370 296,370" fill="#000" opacity=".06"/>
      <rect class="r-wood" x="300" y="370" width="356" height="8" rx="2"/>
      <rect x="318" y="378" width="8" height="34" fill="#3a3632"/><rect x="630" y="378" width="8" height="34" fill="#3a3632"/>
      <ellipse cx="478" cy="350" rx="34" ry="6" fill="#e8e2d6"/><ellipse cx="478" cy="346" rx="16" ry="10" fill="#6f8a5a"/>`;
    else if (furniture === 'fireplace') {
      const mortar = [];
      for (let y = 193, r = 0; y < 354; y += 11, r++) {
        mortar.push(`<line x1="345" y1="${y}" x2="545" y2="${y}"/>`);
        for (let x = 345 + (r % 2 ? 0 : 12); x < 545; x += 24) mortar.push(`<line x1="${x}" y1="${y - 11}" x2="${x}" y2="${y}"/>`);
      }
      body = `${artOrWindow(390, 98, 110, 64)}
      <rect x="341" y="186" width="208" height="170" fill="#000" opacity=".16" filter="url(#rfShadow)" transform="translate(0 4)"/>
      <rect class="r-fire" x="345" y="182" width="200" height="172"/>
      <g stroke="#000" stroke-opacity=".16" stroke-width="1.2">${mortar.join('')}</g>
      <rect x="345" y="182" width="200" height="172" fill="url(#rgBackX)" opacity=".5"/>
      <path d="M393 354 V292 Q445 254 497 292 V354 Z" fill="#1b1816"/>
      <path d="M401 354 V296 Q445 264 489 296 V354 Z" fill="#000" opacity=".35"/>
      <circle class="r-lamp-glow" cx="445" cy="336" r="60" fill="url(#rgLamp)"/>
      <ellipse cx="430" cy="346" rx="24" ry="6" fill="#5b3a26"/><ellipse cx="460" cy="343" rx="22" ry="5.5" fill="#6b4630"/>
      <rect class="r-wood" x="330" y="172" width="230" height="12" rx="2"/>
      <rect x="330" y="183" width="230" height="4" fill="#000" opacity=".16"/>
      <polygon points="335,354 555,354 572,372 318,372" fill="#8d8a85"/><polygon points="318,372 572,372 572,377 318,377" fill="#000" opacity=".22"/>
      <rect x="352" y="160" width="20" height="12" rx="2" fill="#b48a63"/><ellipse cx="516" cy="160" rx="14" ry="12" fill="#5e7a4c"/><rect x="510" y="160" width="12" height="12" rx="2" fill="#d9d3c8"/>`;
    }
    else if (furniture === 'console') body = `
      <circle cx="476" cy="190" r="56" fill="#000" opacity=".12" filter="url(#rfShadow)"/>
      <circle class="r-frame" cx="474" cy="186" r="56"/><circle cx="474" cy="186" r="49" fill="url(#rgMirror)"/>
      <path d="M446 214 L496 154" stroke="#fff" stroke-opacity=".35" stroke-width="6"/>
      <ellipse cx="476" cy="372" rx="150" ry="9" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      <rect class="r-wood" x="372" y="276" width="208" height="12" rx="2"/>
      <rect x="380" y="288" width="7" height="80" fill="#3a3632"/><rect x="565" y="288" width="7" height="80" fill="#3a3632"/>
      <rect class="r-wood" x="384" y="336" width="184" height="6" rx="2" opacity=".85"/>
      <circle class="r-lamp-glow" cx="402" cy="236" r="70" fill="url(#rgLamp)"/><rect x="399" y="248" width="6" height="28" fill="#3a3632"/><polygon class="r-shade" points="386,228 418,228 424,250 380,250"/>
      <rect x="532" y="250" width="26" height="26" rx="4" fill="#b48a63"/><ellipse cx="545" cy="238" rx="22" ry="20" fill="#5e7a4c"/>
      <polygon class="r-duvet" points="380,392 580,392 640,470 320,470" opacity=".9"/>
      <polygon points="380,392 580,392 640,470 320,470" fill="#000" opacity=".06"/>`;
    else if (furniture === 'laundry') body = `
      <rect class="r-cab" x="330" y="112" width="290" height="76" rx="2"/>
      <g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.5"><rect x="336" y="118" width="88" height="64" rx="1.5"/><rect x="431" y="118" width="88" height="64" rx="1.5"/><rect x="526" y="118" width="88" height="64" rx="1.5"/></g>
      <rect class="r-wood" x="330" y="228" width="290" height="8" rx="2"/>
      <rect x="352" y="206" width="30" height="22" rx="3" fill="#b9a88f"/><rect x="560" y="200" width="36" height="28" rx="3" fill="#8fa6b6"/>
      <ellipse cx="476" cy="372" rx="160" ry="10" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      ${[350, 482].map(x => `<rect x="${x}" y="250" width="124" height="118" rx="6" fill="#eef0f1"/><rect x="${x}" y="250" width="124" height="18" rx="5" fill="#dfe3e6"/><circle cx="${x + 62}" cy="314" r="36" fill="#cfd6db"/><circle cx="${x + 62}" cy="314" r="27" fill="#5f6b74"/><circle cx="${x + 62}" cy="314" r="27" fill="url(#rgMirror)" opacity=".35"/><rect x="${x + 12}" y="255" width="30" height="7" rx="2" fill="#b9c1c7"/>`).join('')}`;
    else if (furniture === 'dresser') body = `${artOrWindow(400, 116, 150, 96)}
      <ellipse cx="476" cy="372" rx="150" ry="10" fill="#000" opacity=".24" filter="url(#rfShadow)"/>
      <rect ${opts.cabWood ? 'fill="url(#ptWood)"' : 'class="r-cab"'} x="360" y="246" width="232" height="118" rx="3"/>
      <rect x="360" y="246" width="232" height="118" rx="3" fill="url(#rgBackY)"/>
      <rect class="r-woodtex" fill="url(#ptWood)" x="354" y="238" width="244" height="10" rx="2"/>
      <g fill="none" stroke="#000" stroke-opacity=".18" stroke-width="1.5">${[254, 290, 326].map(y => `<rect x="368" y="${y}" width="216" height="32" rx="2"/>`).join('')}<line x1="476" y1="254" x2="476" y2="286"/></g>
      <g fill="#b8963e">${[[420, 270], [532, 270], [440, 306], [512, 306], [440, 342], [512, 342]].map(([x, y]) => `<rect x="${x - 9}" y="${y - 1.5}" width="18" height="3" rx="1.5"/>`).join('')}</g>
      <rect x="368" y="364" width="8" height="12" fill="#2d2a27"/><rect x="576" y="364" width="8" height="12" fill="#2d2a27"/>
      <circle class="r-lamp-glow" cx="400" cy="200" r="70" fill="url(#rgLamp)"/><rect x="397" y="212" width="6" height="26" fill="#3a3632"/><polygon class="r-shade" points="384,192 416,192 422,214 378,214"/>
      <rect x="530" y="222" width="22" height="16" rx="3" fill="#c9b28c"/><ellipse cx="541" cy="212" rx="16" ry="12" fill="#5e7a4c"/>`;
    else if (furniture === 'garage') body = `
      <rect x="300" y="120" width="250" height="120" rx="2" fill="#b88d5c"/>
      <g fill="#8a6640">${Array.from({ length: 10 }, (_, r) => Array.from({ length: 22 }, (_, c2) => `<circle cx="${310 + c2 * 11}" cy="${130 + r * 11}" r="1.4"/>`).join('')).join('')}</g>
      <g stroke="#3a3632" stroke-width="3" stroke-linecap="round"><line x1="330" y1="150" x2="330" y2="190"/><line x1="370" y1="148" x2="382" y2="190"/><line x1="420" y1="150" x2="420" y2="186"/><circle cx="470" cy="166" r="12" fill="none"/><line x1="510" y1="150" x2="510" y2="196"/></g>
      <ellipse cx="430" cy="374" rx="170" ry="10" fill="#000" opacity=".24" filter="url(#rfShadow)"/>
      <rect class="r-wood" x="292" y="262" width="270" height="16" rx="2"/>
      <rect x="300" y="278" width="10" height="90" fill="#4a4a4a"/><rect x="544" y="278" width="10" height="90" fill="#4a4a4a"/>
      <rect x="300" y="330" width="254" height="8" fill="#5a5a5a"/>
      <rect x="320" y="296" width="60" height="34" rx="3" fill="#b5362e"/><rect x="470" y="300" width="40" height="30" rx="3" fill="#2f5d86"/>
      <rect x="590" y="160" width="58" height="200" rx="2" fill="#8c8f92"/>${[190, 240, 290, 340].map(y => `<rect x="590" y="${y}" width="58" height="5" fill="#6d7174"/>`).join('')}`;
    else if (furniture !== 'kitchen') body = `${artOrWindow(402, 140, 150, 104)}
      <ellipse cx="480" cy="374" rx="168" ry="11" fill="#000" opacity=".26" filter="url(#rfShadow)"/>
      <rect class="r-sofa-d" x="352" y="282" width="256" height="62" rx="14"/>
      <rect class="r-sofa" x="336" y="318" width="288" height="44" rx="10"/>
      <rect class="r-sofa-l" x="352" y="314" width="126" height="20" rx="8"/>
      <rect class="r-sofa-l" x="482" y="314" width="126" height="20" rx="8"/>
      <rect class="r-sofa-d" x="322" y="298" width="36" height="66" rx="12"/>
      <rect class="r-sofa-d" x="602" y="298" width="36" height="66" rx="12"/>
      <rect x="334" y="362" width="6" height="10" rx="2" fill="#2a2522"/><rect x="620" y="362" width="6" height="10" rx="2" fill="#2a2522"/>
      <g style="mix-blend-mode:multiply"><rect x="352" y="282" width="256" height="62" rx="14" fill="url(#ptFabric)"/><rect x="336" y="318" width="288" height="44" rx="10" fill="url(#ptFabric)"/><rect x="322" y="298" width="36" height="66" rx="12" fill="url(#ptFabric)"/><rect x="602" y="298" width="36" height="66" rx="12" fill="url(#ptFabric)"/></g>
      <rect class="r-art" x="368" y="292" width="50" height="36" rx="10" transform="rotate(-8 393 310)"/><rect class="r-art2" x="540" y="292" width="50" height="36" rx="10" transform="rotate(7 565 310)"/>
      <rect x="368" y="292" width="50" height="36" rx="10" transform="rotate(-8 393 310)" fill="url(#ptFabric)" style="mix-blend-mode:multiply"/><rect x="540" y="292" width="50" height="36" rx="10" transform="rotate(7 565 310)" fill="url(#ptFabric)" style="mix-blend-mode:multiply"/>
      ${LAMP}
      <ellipse cx="648" cy="372" rx="22" ry="5" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      <path d="M634 336 h28 l-4 36 h-20z" fill="#d9d2c6"/><path d="M634 336 h28 l-1 6 h-26z" fill="#000" opacity=".08"/>
      <g fill="#5e7a4c"><path d="M648 338 C628 318 620 296 626 276 C636 292 644 312 648 338z"/><path d="M648 338 C664 314 678 300 684 282 C670 290 656 308 648 338z" fill="#4e6a3e"/><path d="M648 338 C646 310 650 284 660 262 C664 286 656 314 648 338z" fill="#6b8a58"/><path d="M648 338 C636 322 618 316 604 318 C620 326 634 332 648 338z" fill="#57744a"/></g>`;
    // the rug goes under the sofa, the coffee table in front of it
    if (furniture === 'sofa') body = rug('300,384 660,384 720,452 240,452') + body + `
      <ellipse cx="480" cy="424" rx="96" ry="7" fill="#000" opacity=".22" filter="url(#rfShadow)"/>
      <polygon class="r-woodtex" fill="url(#ptWood)" points="404,392 556,392 572,406 388,406"/><rect class="r-woodtex" fill="url(#ptWood)" x="388" y="406" width="184" height="6"/><rect x="388" y="406" width="184" height="6" fill="#000" opacity=".18"/>
      <rect x="396" y="412" width="5" height="14" fill="#2d2a27"/><rect x="559" y="412" width="5" height="14" fill="#2d2a27"/>
      <rect x="430" y="388" width="44" height="5" rx="1" fill="#3f5a6b"/><rect x="434" y="384" width="36" height="5" rx="1" fill="#c9b28c"/><circle cx="526" cy="390" r="7" fill="#e9e4da"/>`;
    body = body.replace(/class="r-wood"/g, 'class="r-woodtex" fill="url(#ptWood)"');
    const shade = slots.map(w => w.slot === 'left' ? `<polygon class="r-wshade" data-dir="${w.dir}" points="0,0 225,90 225,354 0,480" fill="#000"/><polygon class="r-cast" data-dir="${w.dir}" points="330,372 640,372 720,400 410,400" fill="#000" filter="url(#rfSoft)"/>`
      : w.slot === 'right' ? `<polygon class="r-wshade" data-dir="${w.dir}" points="800,0 665,90 665,354 800,480" fill="#000"/><polygon class="r-cast" data-dir="${w.dir}" points="320,372 630,372 550,400 240,400" fill="#000" filter="url(#rfSoft)"/>`
      : `<rect class="r-wshade" data-dir="${w.dir}" x="225" y="90" width="440" height="264" fill="#000"/>`).join('');
    body = shade.replace(/<polygon class="r-cast"[^>]*>/g, '') + body.replace(/(<ellipse cx="4\d\d" cy="3[67]\d"[^>]*filter="url\(#rfShadow\)"\/>)/, '$1' + (shade.match(/<polygon class="r-cast"[^>]*>/g) || []).slice(0, 1).join(''));
    return `${open}${defs}${shell}${ceilLight}${body}${night}</svg>`;
  }

  // Front of a house, straight on. Siding texture follows the siding answer.
  // a sectional garage door where the right window would be (painted, or stained wood with tex)
  function garageDoor(tex) {
    const x = 494, y = 262, w = 162, h = 148;
    const panels = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) panels.push(`<rect x="${x + 8 + c * 37}" y="${y + 8 + r * 35}" width="31" height="27" rx="1"/>`);
    return `
      <rect class="r-xtrim" x="${x - 9}" y="${y - 9}" width="${w + 18}" height="${h + 9}" rx="1"/>
      <rect class="r-gdoor" x="${x}" y="${y}" width="${w}" height="${h}"/>
      ${tex ? `<image data-tex="${esc(JSON.stringify(Object.assign({}, tex, { t: 'boards', w, h, cm: 1.7, board: 16, seed: 5 })))}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>` : ''}
      <g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.4">${panels.join('')}</g>
      <g stroke="#000" stroke-opacity=".22" stroke-width="1.4">${[1, 2, 3].map(r => `<line x1="${x}" y1="${y + r * 37}" x2="${x + w}" y2="${y + r * 37}"/>`).join('')}</g>
      <rect x="${x}" y="${y}" width="${w}" height="14" fill="#000" opacity=".10"/>`;
  }
  // a painted porch floor with steps, in front of the door
  function porchSvg() {
    const boards = Array.from({ length: 13 }, (_, i) => `<line x1="${(262 + i * 23).toFixed(1)}" y1="394" x2="${(248 + i * 25.33).toFixed(1)}" y2="410"/>`).join('');
    return `
      <polygon class="r-step" points="262,394 538,394 552,410 248,410"/>
      <g stroke="#000" stroke-opacity=".12" stroke-width="1">${boards}</g>
      <rect class="r-step" x="248" y="410" width="304" height="10"/><rect x="248" y="410" width="304" height="10" fill="#000" opacity=".2"/>
      <rect class="r-step" x="330" y="420" width="140" height="8"/><rect x="330" y="426" width="140" height="2" fill="#000" opacity=".18"/>
      <rect class="r-step" x="318" y="428" width="164" height="8"/><rect x="318" y="434" width="164" height="2" fill="#000" opacity=".18"/>`;
  }
  // louvered shutters either side of a window
  function shutterPair(x, tex) {
    const one = sx => `
      <rect class="r-shut" x="${sx}" y="211" width="30" height="128" rx="1"/>
      ${tex ? `<image data-tex="${esc(JSON.stringify(Object.assign({}, tex, { t: 'boards', w: 30, h: 128, cm: 1.3, board: 10, vertical: true, seed: sx })))}" x="${sx}" y="211" width="30" height="128" preserveAspectRatio="none"/>` : ''}
      <g stroke="#000" stroke-opacity=".20" stroke-width="1.2">${Array.from({ length: 14 }, (_, i) => `<line x1="${sx + 4}" y1="${219 + i * 8.4}" x2="${sx + 26}" y2="${219 + i * 8.4}"/>`).join('')}</g>
      <rect x="${sx}" y="211" width="30" height="128" rx="1" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="2"/>
      <rect x="${sx + 30}" y="213" width="3" height="126" fill="#000" opacity=".12"/>`;
    return one(x - 44) + one(x + 124);
  }
  function houseSvg(opts) {
    const siding = opts.siding || 'wood';
    let texture = '';
    if (siding === 'brick') {
      const rows = [];
      for (let y = 190, r = 0; y < 410; y += 11, r++) {
        rows.push(`<line x1="120" y1="${y}" x2="680" y2="${y}"/>`);
        for (let x = 120 + (r % 2 ? 0 : 17); x < 680; x += 34) rows.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 11}"/>`);
      }
      texture = `<g clip-path="url(#rcBody)" stroke="#000" stroke-opacity=".13" stroke-width="1.1">${rows.join('')}</g>`;
    } else if (opts.sidingTex) {
      // stained lap boards: the boards carry their own grain; these are the shadow lines under each lap
      const lines = [];
      for (let y = 193; y < 410; y += 13) lines.push(`<line x1="120" y1="${y}" x2="680" y2="${y}"/>`);
      texture = `<g clip-path="url(#rcBody)" stroke="#000" stroke-opacity=".22" stroke-width="1.6">${lines.join('')}</g>`;
    } else if (siding === 'shake') {
      const rows = [];
      for (let y = 196, r = 0; y < 410; y += 15, r++) {
        rows.push(`<line x1="120" y1="${y}" x2="680" y2="${y}"/>`);
        for (let x = 120 + ((r * 13) % 29); x < 680; x += 22 + ((x * 7 + r * 5) % 13)) rows.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 15}"/>`);
      }
      texture = `<g clip-path="url(#rcBody)" stroke="#000" stroke-opacity=".15" stroke-width="1.2">${rows.join('')}</g>`;
    } else if (siding === 'board') {
      const bats = [];
      for (let x = 146; x < 680; x += 36) bats.push(`<rect x="${x}" y="180" width="7" height="230" fill="#000" opacity=".10"/><rect x="${x - 1}" y="180" width="2" height="230" fill="#fff" opacity=".08"/>`);
      texture = `<g clip-path="url(#rcBody)">${bats.join('')}</g>`;
    } else if (siding !== 'stucco') {
      const lines = [];
      for (let y = 196; y < 410; y += 13) lines.push(`<line x1="120" y1="${y}" x2="680" y2="${y}"/>`, `<line x1="120" y1="${y + 1.5}" x2="680" y2="${y + 1.5}" stroke="#fff" stroke-opacity=".10"/>`);
      texture = `<g clip-path="url(#rcBody)" stroke="#000" stroke-opacity=".16" stroke-width="1.2">${lines.join('')}</g>`;
    } else {
      texture = `<rect x="120" y="180" width="560" height="230" fill="url(#rgStucco)" opacity=".5"/>`;
    }
    const win = x => `
      <rect class="r-xtrim" x="${x - 9}" y="211" width="128" height="128" rx="1"/>
      <rect class="r-glass" x="${x}" y="220" width="110" height="110"/>
      <rect x="${x}" y="220" width="110" height="110" fill="url(#rgGlass)"/>
      <g class="r-xtrim-s" stroke-width="5"><line x1="${x + 55}" y1="220" x2="${x + 55}" y2="330"/><line x1="${x}" y1="275" x2="${x + 110}" y2="275"/></g>
      <rect class="r-xtrim" x="${x - 14}" y="337" width="138" height="9" rx="1"/>
      <rect x="${x - 14}" y="345" width="138" height="5" fill="#000" opacity=".12"/>`;
    return `<defs>${DEFS_COMMON}
        <linearGradient id="rgGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient>
        <linearGradient id="rgEave" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".30"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
        <linearGradient id="rgBodyShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></linearGradient>
        <linearGradient id="rgLawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient>
        <radialGradient id="rgStucco" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></radialGradient>
        <radialGradient id="rgNight" cx="0.58" cy="0.6" r="0.75"><stop offset="0" stop-color="#000" stop-opacity=".05"/><stop offset=".5" stop-color="#000" stop-opacity=".32"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
        <clipPath id="rcBody"><rect x="120" y="180" width="560" height="230"/></clipPath>
        ${opts.sidingTex ? pattern('ptSiding', Object.assign({}, opts.sidingTex, { t: 'boards', w: 560, h: 230, cm: 14 / 13, board: 14, seed: 8, ends: false }), 560, 230, 120, 180) : ''}
      </defs>
      <rect x="0" y="0" width="800" height="480" fill="url(#rgSky)"/>
      <ellipse class="r-tree" cx="40" cy="300" rx="90" ry="140"/><ellipse class="r-tree" cx="770" cy="310" rx="80" ry="130"/>
      <ellipse cx="40" cy="300" rx="90" ry="140" fill="#000" opacity=".12"/><ellipse cx="770" cy="310" rx="80" ry="130" fill="#000" opacity=".18"/>
      <rect class="r-lawn" x="0" y="404" width="800" height="76"/><rect x="0" y="404" width="800" height="76" fill="url(#rgLawn)"/>
      <!-- body -->
      <rect class="r-body" x="120" y="180" width="560" height="230"/>
      ${opts.sidingTex ? '<rect x="120" y="180" width="560" height="230" fill="url(#ptSiding)"/>' : ''}
      ${texture}
      <rect x="120" y="180" width="560" height="230" fill="url(#rgBodyShade)"/>
      <rect class="r-xtrim" x="120" y="180" width="12" height="230"/><rect class="r-xtrim" x="668" y="180" width="12" height="230"/>
      <!-- roof -->
      <polygon class="r-roof" points="84,186 400,58 716,186"/>
      <g stroke="#000" stroke-opacity=".18" stroke-width="1.2">${Array.from({ length: 8 }, (_, i) => { const y = 82 + i * 13.5; const half = (y - 58) / (186 - 58) * 316; return `<line x1="${400 - half}" y1="${y}" x2="${400 + half}" y2="${y}"/>`; }).join('')}</g>
      <polygon class="r-xtrim" points="76,190 400,60 724,190 724,198 400,68 76,198"/>
      <rect class="r-xtrim" x="108" y="182" width="584" height="10"/>
      <rect x="120" y="192" width="560" height="22" fill="url(#rgEave)"/>
      <!-- gable vent -->
      <polygon class="r-xtrim" points="400,96 430,134 370,134"/><polygon points="400,104 422,130 378,130" fill="#000" opacity=".35"/>
      <!-- windows, or a garage door in place of the right one -->
      ${win(176)}${opts.garage ? garageDoor(opts.garageTex) : win(514)}
      ${opts.shutters ? shutterPair(176, opts.shutterTex) + (opts.garage ? '' : shutterPair(514, opts.shutterTex)) : ''}
      <!-- door -->
      <rect class="r-xtrim" x="344" y="236" width="112" height="176" rx="1"/>
      <rect class="r-xdoor" x="356" y="248" width="88" height="160"/>
      ${opts.doorTex ? `<image data-tex="${esc(JSON.stringify(Object.assign({}, opts.doorTex, { t: 'door', w: 88, h: 160, cm: 1.27, frame: 12 })))}" x="356" y="248" width="88" height="160" preserveAspectRatio="none"/>` : ''}
      <g fill="none" stroke="#000" stroke-opacity="${opts.doorTex ? 0 : '.22'}" stroke-width="1.6"><rect x="366" y="262" width="29" height="58" rx="1"/><rect x="405" y="262" width="29" height="58" rx="1"/><rect x="366" y="332" width="29" height="64" rx="1"/><rect x="405" y="332" width="29" height="64" rx="1"/></g>
      <g fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1"><rect x="367" y="263" width="27" height="56" rx="1"/><rect x="406" y="263" width="27" height="56" rx="1"/></g>
      <circle cx="434" cy="330" r="4" fill="#c4a24c"/><circle cx="434" cy="330" r="4" fill="none" stroke="#000" stroke-opacity=".25"/>
      <rect x="356" y="248" width="88" height="160" fill="#000" opacity=".06"/>
      ${opts.shutters && !opts.garage ? '' : `<!-- porch light -->
      <circle class="r-lamp-glow" cx="474" cy="282" r="90" fill="url(#rgLamp)"/>
      <rect x="466" y="268" width="16" height="26" rx="3" fill="#2b2b2b"/><rect class="r-shade" x="469" y="272" width="10" height="18" rx="2"/>`}
      <!-- steps and walk -->
      ${opts.garage ? '<polygon class="r-walk" points="494,410 656,410 740,480 430,480"/>' : ''}
      <rect class="r-step" x="330" y="408" width="140" height="12"/><rect class="r-step" x="316" y="420" width="168" height="12"/>
      <rect x="316" y="430" width="168" height="3" fill="#000" opacity=".12"/>
      <polygon class="r-walk" points="340,433 460,433 520,480 280,480"/>
      <!-- shrubs -->
      <ellipse cx="236" cy="410" rx="72" ry="10" fill="#000" opacity=".25" filter="url(#rfShadow)"/>${opts.garage ? '' : '<ellipse cx="572" cy="410" rx="72" ry="10" fill="#000" opacity=".25" filter="url(#rfShadow)"/>'}
      <ellipse class="r-shrub" cx="200" cy="396" rx="42" ry="26"/><ellipse class="r-shrub" cx="262" cy="400" rx="36" ry="22"/>${opts.garage ? '' : '<ellipse class="r-shrub" cx="540" cy="398" rx="38" ry="24"/><ellipse class="r-shrub" cx="602" cy="396" rx="42" ry="26"/>'}
      <ellipse cx="208" cy="388" rx="26" ry="12" fill="#fff" opacity=".06"/>${opts.garage ? '' : '<ellipse cx="596" cy="388" rx="26" ry="12" fill="#fff" opacity=".06"/>'}
      ${opts.porch ? porchSvg() : ''}
      <rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/>`;
  }

  const SKY = {
    none: ['#cfe1f3', '#eef4f8'], daylight: ['#bcd6ef', '#eaf2f8'], north: ['#b7c7d8', '#dfe7ee'], sun: ['#9cc6ef', '#fff2d9'],
    golden: ['#f2a65a', '#ffd9a0'], warm: ['#141b26', '#2c3647'], soft: ['#141b26', '#2c3647'], bright: ['#141b26', '#2c3647'], cool: ['#141b26', '#2c3647'], dim: ['#8e979f', '#b9c0c5'],
  };
  const FIXED_FILL = { wain: 'F2F1EC', fire: 'A65A44', shut: '2F3B4C', gdoor: 'F2F1EC', rug: 'CFC6B8', curtain: 'ECE7DD', counter: 'ECEAE5', cab: 'F2F1EC', body: 'CFC8BC', xtrim: 'F2F1EC', glass: '33404B', lawn: '6E8A4F', tree: '5D7649', shrub: '4E6A3B', roof: '45484C', floor: 'A9784B', frame: '2B2926', sofa: '8A857E', 'sofa-d': '77726B', 'sofa-l': '9A958E', shade: 'ECE6DA', duvet: 'F1F0EC', wood: 'A27B55' };

  const lightOf = id => (id && id !== 'none' ? E.lightFor(id) : null);   // (a slider bulb too: k2850)
  const woodGain = id => WD.gainFor(lightOf(id), settings.cal);
  // an <image> that applyTextures() fills in, inside a tiling pattern
  const texImg = (spec, w, h) => `<image data-tex="${esc(JSON.stringify(spec))}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
  const pattern = (id, spec, w, h, x, y) => `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${x || 0}" y="${y || 0}" width="${w}" height="${h}">${texImg(spec, w, h)}</pattern>`;
  // curtains either side of a back-wall window
  const backCurtains = (x, y, w, h) => {
    const top = y - 18, bot = Math.min(340, y + h + 70);
    const panel = (x0, x1) => `<rect class="r-curtain" x="${x0}" y="${top + 4}" width="${x1 - x0}" height="${bot - top - 4}"/><rect x="${x0}" y="${top + 4}" width="${x1 - x0}" height="${bot - top - 4}" fill="url(#rgFold)"/><line x1="${(x0 + x1) / 2}" y1="${top + 6}" x2="${(x0 + x1) / 2}" y2="${bot}" stroke="#000" stroke-opacity=".08" stroke-width="2"/>`;
    return `<line x1="${x - 34}" y1="${top}" x2="${x + w + 34}" y2="${top}" stroke="#3a3632" stroke-width="2.4" stroke-linecap="round"/>${panel(x - 32, x - 12)}${panel(x + w + 12, x + w + 32)}`;
  };
  const texCache = new Map();
  function texUrl(spec, lightId, roles) {
    const tint = spec.role ? (roles[spec.role] || FIXED_FILL[spec.role]) : spec.tint;
    const key = JSON.stringify([spec, tint, lightId, settings.cal]);
    if (texCache.has(key)) return texCache.get(key);
    let f; const sp = spec.sp || 'red_oak';
    if (spec.t === 'floor') f = WD.floorField(sp, spec.kind || 'wood', { hex: tint });
    else if (spec.t === 'door') f = WD.doorField(sp, spec.w, spec.h, { cm: spec.cm, frameCm: spec.frame });
    else if (spec.t === 'stone') f = WD.stoneField(spec.w, spec.h, { hex: tint || 'ECEAE5', speckle: spec.speckle });
    else if (spec.t === 'fabric') f = WD.fabricField(spec.w, spec.h, { hex: tint || 'FFFFFF' });
    else f = WD.boardsField(sp, spec.w, spec.h, { cm: spec.cm, boardCm: spec.board, gapCm: spec.gap, vertical: !!spec.vertical, seed: spec.seed || 0, ends: spec.ends });
    const woodish = spec.t === 'boards' || spec.t === 'door' || (spec.t === 'floor' && ['wood', 'deck'].includes(spec.kind || 'wood'));
    const cv = document.createElement('canvas');
    WD.paintField(cv, f, { sp, stain: spec.stain || null, tint: !spec.stain && woodish ? tint : null, gain: woodGain(lightId), sheen: spec.sheen || 0 });
    const url = cv.toDataURL(spec.gap ? 'image/png' : 'image/jpeg', 0.9);
    texCache.set(key, url);
    if (texCache.size > 60) texCache.delete(texCache.keys().next().value);
    return url;
  }
  let texTimer = 0;
  function applyTextures(root, lightId) {
    clearTimeout(texTimer);
    // after the sheet has started to slide in, so the first paint isn't held up
    texTimer = setTimeout(() => {
      if (!document.contains(root)) return;
      let roles = {};
      try { roles = JSON.parse(root.dataset.roles || '{}'); } catch (e) { roles = {}; }
      $$('image[data-tex]', root).forEach(img => {
        let spec; try { spec = JSON.parse(img.dataset.tex); } catch (e) { return; }
        img.setAttribute('href', texUrl(spec, lightId, roles));
      });
      paintWoods(root, lightId);
    }, 30);
  }

  // ---- wood canvases (cards, the before/after board, the wood and look questions) ----
  // woodCv draws a <canvas> that paintWoods() fills: data-wood (species), data-stain (JSON), data-split (0..1, left stays bare)
  function woodCv(o) {
    const d = { wood: o.sp, w: o.w || 480, h: o.h || 260, cm: o.cm || 0.22, board: o.board || 12, seed: o.seed || 0 };
    if (o.stain) d.stain = JSON.stringify(o.stain);
    if (o.split != null) d.split = o.split;
    if (o.layout) d.layout = o.layout;
    if (o.sheen) d.sheen = o.sheen;
    if (o.look) d.look = o.look;
    return `<canvas class="wood-cv ${o.cls || ''}"${o.id ? ` id="${o.id}"` : ''} width="${d.w}" height="${d.h}" ${Object.entries(d).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} role="img" aria-label="${esc(o.label || WD.SPECIES[o.sp].label)}"></canvas>`;
  }
  let woodQueue = [], woodTimer = 0;
  function paintWoods(scope, lightId) {
    const list = $$('canvas[data-wood]', scope);
    woodQueue = woodQueue.filter(x => !list.includes(x.cv)).concat(list.map(cv => ({ cv, lightId })));
    if (!woodTimer) woodTimer = setTimeout(drainWoods, 0);
  }
  function drainWoods() {
    woodTimer = 0;
    const t0 = performance.now();
    while (woodQueue.length && performance.now() - t0 < 20) { const { cv, lightId } = woodQueue.shift(); if (document.contains(cv)) paintWoodCanvas(cv, lightId); }
    if (woodQueue.length) woodTimer = setTimeout(drainWoods, 0);
  }
  function paintWoodCanvas(cv, lightId) {
    const d = cv.dataset, w = +d.w, h = +d.h;
    const f = d.layout === 'door' ? WD.doorField(d.wood, w, h, { cm: +d.cm }) : WD.boardsField(d.wood, w, h, { cm: +d.cm, boardCm: +d.board, seed: +d.seed });
    let stain = null; try { stain = d.stain ? JSON.parse(d.stain) : null; } catch (e) { stain = null; }
    WD.paintField(cv, f, { sp: d.wood, stain, split: d.split ? +d.split : null, gain: woodGain(lightId), sheen: +d.sheen || 0 });
    cv.classList.add('ready');
  }

  // ---- scenes for staining ----
  function stainScene(scene, tex, a, label) {
    const open = `<svg class="room-svg" viewBox="0 0 800 480" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(label)}">`;
    const wood = Object.assign({ t: 'boards', w: 400, h: 120, cm: 0.3, board: 14, seed: 2 }, tex);
    if (scene === 'floor') return sceneSvg('room', { label, furniture: 'sofa', windows: [{ slot: 'left', dir: 'south' }], floorTex: Object.assign({ t: 'floor', kind: 'wood' }, tex) });
    if (scene === 'cabinets') return sceneSvg('kitchen', { label, windows: [{ slot: 'left', dir: 'east' }], cabTex: tex, floorType: 'tile' });
    if (scene === 'furniture') return sceneSvg('room', { label, furniture: 'dining', windows: [{ slot: 'left', dir: 'south' }], woodTex: wood });
    if (scene === 'trim') return sceneSvg('room', { label, furniture: 'sofa', windows: [{ slot: 'left', dir: 'south' }], trimTex: tex, crown: false });
    if (scene === 'deck') return open + deckSvg(tex, a) + '</svg>';
    if (scene === 'fence') return open + fenceSvg(tex) + '</svg>';
    if (scene === 'siding') return open + houseSvg({ siding: 'wood', sidingTex: tex }) + '</svg>';
    if (scene === 'door') return open + houseSvg({ siding: 'fiber', doorTex: tex }) + '</svg>';
    if (scene === 'garage') return open + houseSvg({ siding: 'fiber', garage: true, garageTex: tex }) + '</svg>';
    if (scene === 'shutters') return open + houseSvg({ siding: 'fiber', shutters: true, shutterTex: tex }) + '</svg>';
    if (scene === 'paneling') return sceneSvg('room', { label, furniture: 'sofa', windows: [{ slot: 'left', dir: 'south' }], wainscot: true, wainscotTex: tex });
    if (scene === 'builtins') return sceneSvg('room', { label, furniture: 'dresser', cabWood: true, windows: [{ slot: 'left', dir: 'south' }], woodTex: wood });
    return sceneSvg('room', { label, furniture: 'sofa', floorTex: Object.assign({ t: 'floor', kind: 'wood' }, tex) });
  }
  // A deck behind the house, seen from the yard: deck boards in perspective, railings, and chairs or a pergola.
  function deckSvg(tex, a) {
    const posts = side => [0.08, 0.5, 0.92].map(t => { const xb = side === 'l' ? 225 * t : 800 - 135 * t, yb = 480 - 126 * t, h = 0.5 * (yb - 200); return { x: xb, yb, yt: yb - h, w: Math.max(6, 16 * (yb - 200) / 280) }; });
    const rail = side => {
      const ps = posts(side);
      const top = ps.map(p => `${p.x},${p.yt}`).join(' ');
      const bal = []; for (let t = 0.1; t < 0.95; t += 0.045) { const xb = side === 'l' ? 225 * t : 800 - 135 * t, yb = 480 - 126 * t, h = 0.5 * (yb - 200); bal.push(`<line x1="${xb}" y1="${yb}" x2="${xb}" y2="${yb - h}" stroke="url(#ptRailV)" stroke-width="${Math.max(2, 5 * (yb - 200) / 280)}"/>`); }
      return `${bal.join('')}${ps.map(p => `<rect x="${p.x - p.w / 2}" y="${p.yt - 4}" width="${p.w}" height="${p.yb - p.yt + 4}" fill="url(#ptRailV)"/><rect x="${p.x - p.w / 2}" y="${p.yt - 4}" width="${p.w}" height="${p.yb - p.yt + 4}" fill="#000" opacity=".12"/>`).join('')}<polyline points="${top}" fill="none" stroke="url(#ptRail)" stroke-width="${10}" stroke-linejoin="round"/><polyline points="${top}" fill="none" stroke="#000" stroke-opacity=".15" stroke-width="2" transform="translate(0 5)"/>`;
    };
    const chairs = a.target === 'outdoor';
    const pergola = a.target === 'pergola';
    const chair = (x, s, flip) => `<g transform="translate(${x} ${390 - 60 * s}) scale(${s}) ${flip ? 'scale(-1 1)' : ''}">
        <ellipse cx="0" cy="96" rx="58" ry="8" fill="#000" opacity=".25" filter="url(#rfShadow)"/>
        ${[-30, -15, 0, 15, 30].map(dx => `<rect x="${dx - 6}" y="-10" width="12" height="70" rx="5" fill="url(#ptRailV)"/>`).join('')}
        <rect x="-46" y="38" width="92" height="12" rx="3" fill="url(#ptRail)"/><rect x="-50" y="50" width="100" height="22" rx="3" fill="url(#ptRail)"/>
        <rect x="-56" y="30" width="22" height="7" rx="2" fill="url(#ptRail)"/><rect x="34" y="30" width="22" height="7" rx="2" fill="url(#ptRail)"/>
        <rect x="-50" y="56" width="7" height="40" fill="url(#ptRailV)"/><rect x="43" y="56" width="7" height="40" fill="url(#ptRailV)"/>
        <rect x="-50" y="-10" width="100" height="106" fill="#000" opacity=".06"/></g>`;
    return `<defs>${DEFS_COMMON}${INTERIOR_DEFS}
        ${pattern('ptRail', Object.assign({}, tex, { t: 'boards', w: 400, h: 40, cm: 0.6, board: 12, seed: 9 }), 400, 40)}
        ${pattern('ptRailV', Object.assign({}, tex, { t: 'boards', w: 40, h: 300, cm: 0.6, board: 12, vertical: true, seed: 12 }), 40, 300)}
        <linearGradient id="rgEaveD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
        <linearGradient id="rgDeckShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".5" stop-color="#000" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient>
        <radialGradient id="rgNight" cx="0.5" cy="0.6" r="0.8"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient></defs>
      <rect x="0" y="0" width="800" height="480" fill="url(#rgSky)"/>
      <ellipse class="r-tree" cx="60" cy="210" rx="120" ry="150"/><ellipse class="r-tree" cx="760" cy="200" rx="110" ry="160"/>
      <ellipse cx="60" cy="210" rx="120" ry="150" fill="#000" opacity=".15"/><ellipse cx="760" cy="200" rx="110" ry="160" fill="#000" opacity=".22"/>
      <rect class="r-lawn" x="0" y="330" width="800" height="40"/>
      <rect class="r-body" x="150" y="40" width="600" height="314"/>
      <polygon class="r-roof" points="110,0 790,0 790,30 110,30"/><rect class="r-xtrim" x="120" y="28" width="660" height="12"/><rect x="150" y="40" width="600" height="18" fill="url(#rgEaveD)"/>
      <g stroke="#000" stroke-opacity=".12" stroke-width="1.2">${Array.from({ length: 23 }, (_, i) => `<line x1="150" y1="${52 + i * 13}" x2="750" y2="${52 + i * 13}"/>`).join('')}</g>
      <rect class="r-xtrim" x="365" y="148" width="200" height="206"/><rect class="r-glass" x="375" y="158" width="88" height="196"/><rect class="r-glass" x="467" y="158" width="88" height="196"/>
      <rect x="375" y="158" width="180" height="196" fill="url(#rgSky)" opacity=".35"/>
      <rect class="r-xtrim" x="196" y="118" width="112" height="112"/><rect class="r-glass" x="204" y="126" width="96" height="96"/><rect x="204" y="126" width="96" height="96" fill="url(#rgSky)" opacity=".35"/>
      <rect class="r-xtrim" x="610" y="118" width="112" height="112"/><rect class="r-glass" x="618" y="126" width="96" height="96"/><rect x="618" y="126" width="96" height="96" fill="url(#rgSky)" opacity=".35"/>
      <circle class="r-lamp-glow" cx="590" cy="190" r="80" fill="url(#rgLamp)"/><rect x="584" y="178" width="12" height="20" rx="2" fill="#2b2b2b"/>
      <image data-tex="${esc(JSON.stringify(Object.assign({ t: 'floor', kind: 'deck' }, tex)))}" x="0" y="354" width="800" height="126" preserveAspectRatio="none"/>
      <rect x="0" y="354" width="800" height="126" fill="url(#rgDeckShade)"/>
      <rect x="150" y="350" width="600" height="6" fill="#000" opacity=".18"/>
      ${pergola ? `<g>${[230, 330, 430, 530, 630].map((x, i) => `<rect x="${x}" y="0" width="16" height="30" fill="url(#ptRailV)"/>`).join('')}<rect x="0" y="24" width="800" height="18" fill="url(#ptRail)"/><rect x="0" y="40" width="800" height="5" fill="#000" opacity=".18"/>${[60, 740].map(x => `<rect x="${x - 12}" y="24" width="24" height="440" fill="url(#ptRailV)"/><rect x="${x - 12}" y="24" width="24" height="440" fill="#000" opacity=".1"/>`).join('')}</g>` : ''}
      ${rail('l')}${rail('r')}
      ${chairs ? chair(320, 0.95) + chair(500, 0.95, true) + '<rect x="384" y="410" width="60" height="8" rx="2" fill="url(#ptRail)"/><rect x="390" y="418" width="6" height="22" fill="url(#ptRailV)"/><rect x="432" y="418" width="6" height="22" fill="url(#ptRailV)"/>' : `<ellipse cx="660" cy="452" rx="34" ry="7" fill="#000" opacity=".25" filter="url(#rfShadow)"/><path d="M636 404 h48 l-6 48 h-36z" fill="#b6a58e"/><g fill="#5e7a4c"><ellipse cx="660" cy="392" rx="30" ry="20"/><ellipse cx="648" cy="380" rx="16" ry="12" fill="#6b8a58"/></g>`}
      <rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/>`;
  }
  // A fence across a back yard, straight on: boards with gaps, posts and a top cap.
  function fenceSvg(tex) {
    return `<defs>${DEFS_COMMON}
        ${pattern('ptPost', Object.assign({}, tex, { t: 'boards', w: 30, h: 260, cm: 0.6, board: 9, vertical: true, seed: 21 }), 30, 260)}
        ${pattern('ptCap', Object.assign({}, tex, { t: 'boards', w: 400, h: 14, cm: 0.7, board: 9, seed: 23 }), 400, 14)}
        <radialGradient id="rgNight" cx="0.5" cy="0.6" r="0.8"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>
        <linearGradient id="rgFenceShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>
        <linearGradient id="rgLawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient></defs>
      <rect x="0" y="0" width="800" height="480" fill="url(#rgSky)"/>
      <ellipse class="r-tree" cx="140" cy="170" rx="150" ry="120"/><ellipse class="r-tree" cx="520" cy="150" rx="190" ry="130"/><ellipse class="r-tree" cx="790" cy="190" rx="120" ry="110"/>
      <ellipse cx="520" cy="150" rx="190" ry="130" fill="#000" opacity=".14"/>
      <rect class="r-lawn" x="0" y="330" width="800" height="150"/><rect x="0" y="330" width="800" height="150" fill="url(#rgLawn)"/>
      <rect x="0" y="162" width="800" height="186" fill="#1f2a1e" opacity=".72"/>
      <image data-tex="${esc(JSON.stringify(Object.assign({ t: 'boards', w: 800, h: 190, cm: 0.55, board: 14, gap: 0.7, vertical: true, seed: 6 }, tex)))}" x="0" y="160" width="800" height="190" preserveAspectRatio="none"/>
      <rect x="0" y="160" width="800" height="190" fill="url(#rgFenceShade)"/>
      ${[0, 200, 400, 600, 800].map(x => `<rect x="${x - 13}" y="148" width="26" height="206" fill="url(#ptPost)"/><rect x="${x - 13}" y="148" width="26" height="206" fill="#000" opacity=".14"/><rect x="${x - 16}" y="142" width="32" height="8" fill="url(#ptCap)"/>`).join('')}
      <rect x="0" y="154" width="800" height="10" fill="url(#ptCap)"/><rect x="0" y="163" width="800" height="3" fill="#000" opacity=".2"/>
      <rect x="0" y="346" width="800" height="10" fill="#000" opacity=".14" filter="url(#rfShadow)"/>
      ${[[90, 360, 60, 26], [300, 366, 46, 20], [560, 362, 70, 28], [720, 366, 40, 18]].map(([x, y, rx, ry]) => `<ellipse class="r-shrub" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/><ellipse cx="${x - rx * 0.3}" cy="${y - ry * 0.4}" rx="${rx * 0.5}" ry="${ry * 0.4}" fill="#fff" opacity=".06"/>`).join('')}
      <rect class="r-night" x="0" y="0" width="800" height="480" fill="url(#rgNight)"/>`;
  }
  // Paints a drawn scene for a light: every role's color, the sky, lamps at night, sun patches by window direction.
  // Returns the label for the light ("Chip color", "Night, porch light"...).
  function paintScene(room, id) {
    if (!room) return '';
    const L = id === 'none' ? null : id;
    const lt = lightOf(id);
    let roles = {};
    try { roles = JSON.parse(room.dataset.roles || '{}'); } catch (e) { roles = {}; }
    const set = (sel, prop, val) => $$(sel, room).forEach(el => el.setAttribute(prop, val));
    for (const [role, hex] of Object.entries(Object.assign({}, FIXED_FILL, roles))) {
      if (!/^[0-9A-F]{6}$/i.test(hex)) continue;
      const v = paint(hex, L);
      set('.r-' + role, 'fill', v);
      set('.r-' + role + '-s', 'stroke', v);
    }
    const sky = SKY[id] || (lt && lt.bulb ? SKY.soft : SKY.daylight);
    set('.r-sky-top', 'stop-color', sky[0]); set('.r-sky-bot', 'stop-color', sky[1]);
    const night = !!(lt && lt.bulb);
    const lampColor = lt ? C.displayCss('FFFFFF', { light: Object.assign({}, lt, { adapt: 0.85, intensity: 1 }) }) : '#fff4dc';
    set('.r-lamp-c', 'stop-color', lampColor);
    set('.r-lamp-glow', 'opacity', night ? 1 : id === 'dim' ? 0.45 : 0);
    const SUN = { none: { south: 0.2, east: 0.2, west: 0.2, north: 0.08, '?': 0.16 }, daylight: { south: 0.24, east: 0.24, west: 0.24, north: 0.1, '?': 0.22 },
      sun: { south: 0.5, west: 0.5, east: 0.22, north: 0.06, '?': 0.45 }, golden: { west: 0.52, south: 0.3, east: 0.08, north: 0.04, '?': 0.42 } };
    const sunMap = SUN[id] || {};
    const SHADE = { none: 0.08, daylight: 0.1, north: 0.06, sun: 0.16, golden: 0.14, dim: 0.04 };
    $$('.r-wshade', room).forEach(el => el.setAttribute('opacity', night ? 0 : (SHADE[id] || 0.06) * (el.dataset.dir === 'north' ? 0.6 : 1)));
    $$('.r-cast', room).forEach(el => el.setAttribute('opacity', night ? 0 : (SHADE[id] || 0.06) * (['south', 'west'].includes(el.dataset.dir) && (id === 'sun' || id === 'golden') ? 1.8 : 1.1)));
    $$('.r-sun', room).forEach(el => { el.setAttribute('fill', id === 'golden' ? '#ffc777' : id === 'sun' ? '#fff0cf' : '#ffffff'); el.setAttribute('opacity', sunMap[el.dataset.dir] || 0); });
    $$('.r-wtint', room).forEach(el => { const d = el.dataset.dir; const golden = id === 'golden' && d === 'west', cool = d === 'north' && !night;
      el.setAttribute('fill', golden ? '#ffb45c' : '#7f9bb8'); el.setAttribute('opacity', golden ? 0.35 : cool ? 0.22 : 0); });
    set('.r-night', 'opacity', night ? 1 : id === 'dim' ? 0.7 : 0);
    applyTextures(room, id);
    const isHouse = ['house', 'deck', 'fence', 'siding', 'door', 'garage', 'shutters'].includes(room.dataset.scene);
    return !lt ? 'Chip color' : isHouse && night ? 'Night, porch light' : isHouse && id === 'north' ? 'Shade / overcast' : lt.label;
  }

  const api = { configure, sceneKind, sceneExtras, sceneFurniture, scenePalette, windowSlots, floorTypeOf, sceneSvg, houseSvg, deckSvg, fenceSvg, stainScene, paintScene, applyTextures, texUrl, woodCv, paintWoods, paintWoodCanvas, FIXED_FILL, SKY };
  root.CG = root.CG || {};
  root.CG.scenes = api;
})(window);
