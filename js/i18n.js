/* ColorGenius in another language (Spanish for now). The app is written in English; when Spanish is on, every
   screen is translated as it appears: each line of text and each label read aloud (aria-label), placeholder and
   tooltip is looked up in js/i18n-es.js, and a few shapes of sentence with names or numbers in them ("Change:
   Bedroom", "2 gallons + 1 quart", "November 25, 2026") are put together from their parts. Colour, brand and
   product names stay as they are printed on the chips and cans. Back to English reloads the page.
   CG.i18n.set('es' | 'en'), CG.i18n.lang, CG.i18n.tr(text). */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CG = root.CG || {}; root.CG.i18n = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  let DICT = null;
  function dict() {
    if (DICT) return DICT;
    DICT = new Map();
    for (const line of String((root.CG && root.CG.ES_TEXT) || '').split('\n')) {
      const i = line.indexOf('\t'); if (i > 0) DICT.set(line.slice(0, i), line.slice(i + 1));
    }
    return DICT;
  }
  const lower = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const DAYS = { Sunday: 'domingo', Monday: 'lunes', Tuesday: 'martes', Wednesday: 'miércoles', Thursday: 'jueves', Friday: 'viernes', Saturday: 'sábado', Sun: 'dom', Mon: 'lun', Tue: 'mar', Wed: 'mié', Thu: 'jue', Fri: 'vie', Sat: 'sáb' };
  const MONTHS = { January: 'enero', February: 'febrero', March: 'marzo', April: 'abril', May: 'mayo', June: 'junio', July: 'julio', August: 'agosto', September: 'septiembre', October: 'octubre', November: 'noviembre', December: 'diciembre' };
  const MON = { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dic' };
  const CAN = { sample: ['muestra', 'muestras'], quart: ['cuarto', 'cuartos'], gallon: ['galón', 'galones'], '5-gallon bucket': ['cubeta de 5 galones', 'cubetas de 5 galones'] };
  // a part that may or may not be in the list: its translation, or itself
  const part = s => {
    const t = tr(s); if (t != null) return t;
    const m = s.match(/^(.*?)([.!?])$/);   // a sentence whose words are in the list without its full stop
    if (m) { const u = tr(m[1]); if (u != null) return u + m[2]; }
    return s;
  };
  // sentence shapes with a name or a number in them: [pattern, (match) -> Spanish, or null to leave it]
  // a wood or a job in lower case ("red oak", "pressure-treated pine"): looked up in title case
  const word = s => { const t = tr(s.replace(/(^|[ -])(\w)/g, (x, a, b) => a + b.toUpperCase())); return t ? lower(t) : s; };
  const JOB = { floors: 'pisos', 'front door': 'puerta principal', fence: 'cerca', 'siding & shakes': 'revestimiento y tejas', cabinets: 'gabinetes', 'outdoor furniture': 'muebles de exterior', deck: 'terraza', dock: 'muelle', trim: 'molduras', doors: 'puertas', furniture: 'muebles', 'stairs & railings': 'escaleras y barandales', paneling: 'paneles', playset: 'juegos infantiles', pergola: 'pérgola', tabletop: 'cubierta de mesa', 'built-ins': 'muebles empotrados', 'garage door': 'puerta del garaje', shutters: 'contraventanas', 'log home': 'casa de troncos' };
  // the amount lines ("About 285 sq ft of wall (10 × 10 ft, 8 ft high, less doors and windows), 2 coats.")
  const FRAG = [[/^About /, 'Unos '], [/ sq ft of wall \(/g, ' pies² de pared ('], [/, less doors and windows\)/g, ', sin puertas ni ventanas)'], [/ ft high/g, ' pies de alto'], [/ sq ft/g, ' pies²'], [/ ft of baseboard and casing/g, ' pies de zócalo y marcos'], [/ ft\b/g, ' pies'],
    [/ pairs of shutters/g, ' pares de contraventanas'], [/\b(\d+) coats\b/g, '$1 capas'], [/ at about /g, ' a unos '], [/ a gallon is /g, ' por galón son '], [/\bgallons\b/g, 'galones'], [/\bgallon\b/g, 'galón'], [/\bquarts\b/g, 'cuartos'], [/\bquart\b/g, 'cuarto'],
    [/ of primer/g, ' de imprimador'], [/\bplus\b/g, 'más'], [/ Buy it all at once so the color matches\./, ' Cómprala toda de una vez para que el color sea igual.']];
  const LRVW = { 'very light': 'muy claro', light: 'claro', 'light-mid': 'claro medio', mid: 'medio', medium: 'medio', 'mid-dark': 'medio oscuro', dark: 'oscuro', 'very dark': 'muy oscuro' };
  const SHAPES = [
    [/^About [\d,.]+ (?:sq ft|ft of|pairs of)/, m => FRAG.reduce((s, [re, to]) => s.replace(re, to), m.input)],
    [/^Coverage is about ([\d,]+) sq ft per gallon for this job\.(.*)$/, m => `El rendimiento es de unos ${m[1]} pies² por galón para este trabajo.${m[2] ? ' ' + part(m[2].trim()) : ''}`],
    [/^([\d,]+) colors?$/, m => `${m[1]} ${m[1] === '1' ? 'color' : 'colores'}`],
    [/^Codes like (.+)$/, m => `Códigos como ${m[1]}`],
    [/^Numbered (.+)$/, m => `Numerados ${m[1]}`],
    [/^(\d+) coats?$/, m => `${m[1]} ${m[1] === '1' ? 'capa' : 'capas'}`],
    [/^(\d+) stains, shown on real (.+)$/, m => `${m[1]} tintes, sobre ${word(m[2])} real`],
    [/^Pick up to two\. Shown on (.+)\.$/, m => `Elige hasta dos. Se muestra sobre ${word(m[1])}.`],
    [/^Not sure\? Pick “Not Sure” and we’ll use (.+), the usual wood for this\.$/, m => `¿No sabes? Elige “No sé” y usaremos ${word(m[1])}, la madera común para esto.`],
    [/^(.+), already finished$/, m => `${part(m[1])}, ya con acabado`],
    [/^(.+): (up|down) (\d+)$/, m => `${part(m[1])}: ${m[2] === 'up' ? 'subir' : 'bajar'} ${m[3]}`],
    [/^Where item (\d+) goes$/, m => `Dónde va el artículo ${m[1]}`],
    [/^Your project, (.+?)(?:, (\d+) items?)?$/, m => `Tu proyecto, ${part(m[1])}${m[2] ? `, ${m[2]} ${m[2] === '1' ? 'artículo' : 'artículos'}` : ''}`],
    [/^LRV ([\d.]+): ([a-z -]+), right for (this space|in between)$/, m => `LRV ${m[1]}: ${LRVW[m[2]] || m[2]}, adecuado para ${m[3] === 'this space' ? 'este espacio' : 'un punto intermedio'}`],
    [/^Match a color: (.+)$/, m => `Igualar un color: ${m[1]}`],
    [/^Its color: (.+)$/, m => `Su color: ${m[1]}`],
    [/^(\d+) colors picked from ([\d,]+)$/, m => `${m[1]} colores elegidos entre ${m[2]}`],
    [/^Stains for (.+?) (floors|front door|fence|siding & shakes|cabinets|outdoor furniture|deck|dock|trim|doors|furniture|stairs & railings|paneling|playset|pergola|tabletop|built-ins|garage door|shutters|log home)$/, m => `Tintes para ${JOB[m[2]]} de ${word(m[1])}`],
    [/^On (.+)’ “Top (\d+) Colors” list$/, m => `En la lista “Top ${m[2]} Colors” de ${m[1]}`],
    [/^Searching ([\d,]+) colors from (\d+) brands\. (.+)$/, m => `Buscando entre ${m[1]} colores de ${m[2]} marcas. ${part(m[3])}`],
    [/^([\d,]+) colors from (\d+) brands are loaded\.$/, m => `Hay ${m[1]} colores de ${m[2]} marcas cargados.`],
    [/^(\d+) of (\d+) on$/, m => `${m[1]} de ${m[2]} encendidas`],
    [/^Print (.+)$/, m => `Imprimir ${m[1]}`],
    [/^Question (\d+) of (\d+)$/, m => `Pregunta ${m[1]} de ${m[2]}`],
    [/^(\d+) to mix(?:, (\d+) left|(, all done))?$/, m => `${m[1]} por mezclar${m[2] ? `, faltan ${m[2]}` : m[3] ? ', todo listo' : ''}`],
    [/^(\d+) items?$/, m => `${m[1]} ${m[1] === '1' ? 'artículo' : 'artículos'}`],
    [/^(\d+) colors?$/, m => `${m[1]} ${m[1] === '1' ? 'color' : 'colores'}`],
    [/^((?:\d+ (?:5-gallon bucket|gallon|quart|sample)s?)(?: \+ \d+ (?:5-gallon bucket|gallon|quart|sample)s?)*)$/, m => m[1].replace(/(\d+) (5-gallon bucket|gallon|quart|sample)s?/g, (x, n, k) => `${n} ${CAN[k][n === '1' ? 0 : 1]}`)],
    [/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})$/, m => `${m[2]} de ${MONTHS[m[1]]} de ${m[3]}`],
    [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})$/, m => `${m[2]} ${MON[m[1]]}`],
    [/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/, m => DAYS[m[1]]],
    [/^best (day|days) (.+)$/, m => `${m[1] === 'day' ? 'mejor día' : 'mejores días'}: ${m[2].split(', ').map(d => DAYS[d] || d).join(', ')}`],
    [/^Too cold \((-?\d+)°\)$/, m => `Demasiado frío (${m[1]}°)`],
    [/^Too hot \((-?\d+)°\)$/, m => `Demasiado calor (${m[1]}°)`],
    [/^Windy \((\d+) mph\)$/, m => `Viento (${m[1]} mph)`],
    [/^(\d+)% chance of rain$/, m => `${m[1]}% de probabilidad de lluvia`],
    [/^Cold night after \((-?\d+)°\)$/, m => `Noche fría después (${m[1]}°)`],
    [/^Change: (.+)$/, m => `Cambiar: ${part(m[1])}`],
    [/^(Scene|Light|Store|Store brand|Paint|Sheen|Brand): (.+)$/, m => `${part(m[1])}: ${part(m[2])}`],
    [/^(Lighter|Deeper|Warmer|Cooler|Softer|Richer): (.+)$/, m => `${part(m[1])}: ${m[2]}`],
    [/^Fits a (.+) look$/, m => `Va con un estilo ${lower(part(m[1].replace(/\b\w/g, c => c.toUpperCase())))}`],
    [/^Colors for your (.+)$/, m => `Colores para tu ${lower(part(m[1].replace(/\b\w/g, c => c.toUpperCase())))}`],
    [/^What to buy for your (.+)$/, m => `Qué comprar para tu ${lower(part(m[1].replace(/\b\w/g, c => c.toUpperCase())))}`],
    [/^The usual finish for (.+): (.+)$/, m => `El acabado común para ${lower(part(m[1].replace(/\b\w/g, c => c.toUpperCase())))}: ${part(m[2])}`],
    [/^One of the (.+) you picked$/, m => `Uno de los ${lower(part(m[1].replace(/\b\w/g, c => c.toUpperCase())))} que elegiste`],
    [/^One of (.+)’s popular colors$/, m => `Uno de los colores populares de ${m[1]}`],
    [/^Other (.+) choices: (.+)$/, m => `Otras opciones de ${m[1]}: ${m[2].replace(/\(Good\)/g, '(Buena)').replace(/\(Better\)/g, '(Muy buena)').replace(/\(Best\)/g, '(Mejor)')}`],
    [/^Colors That Go With (.+)$/, m => `Colores que combinan con ${m[1]}`],
    [/^Made to go with (.+)$/, m => `Hecho para combinar con ${m[1]}`],
    [/^A lighter shade of (.+)$/, m => `Un tono más claro de ${m[1]}`],
    [/^An accent made to go with (.+)$/, m => `Un acento hecho para combinar con ${m[1]}`],
    [/^(.+) is mixed$/, m => `${m[1]} está mezclado`],
    [/^Show (.+) full screen$/, m => `Mostrar ${m[1]} en pantalla completa`],
    [/^Open (.+)$/, m => `Abrir ${m[1]}`],
    [/^Remove (.+)$/, m => `Quitar ${m[1]}`],
    [/^See (.+)$/, m => `Ver ${m[1]}`],
    [/^Added (a sample|\d+ samples) to (.+)$/, m => (m[1] === 'a sample' ? `Se agregó una muestra a ${part(m[2])}` : `Se agregaron ${m[1].replace('samples', 'muestras')} a ${part(m[2])}`)],
    [/^Added a sample of (.+) to (.+)$/, m => `Se agregó una muestra de ${m[1]} a ${part(m[2])}`],
    [/^Added (.+) to (.+)$/, m => `Se agregó ${m[1]} a ${part(m[2])}`],
    [/^Took (.+) off (.+)$/, m => `Se quitó ${m[1]} de ${part(m[2])}`],
    [/^(.+) in a (.+)$/, m => { const t = tr(m[2]); return t ? `${m[1]} en ${lower(t)}` : null; }],
    [/^(.+) on (.+)$/, m => { const t = tr(m[2]); return t ? `${m[1]} sobre ${lower(t)}` : null; }],
    [/^(.+)\. Like (.+)$/, m => { const t = tr(m[1]); return t ? `${t}. Como ${m[2]}` : null; }],
  ];
  // names that must never be translated (a color called "Navy" or "Blush" stays one), filled by the app
  const keep = new Set();
  function tr(s) {
    if (!s) return null;
    const d = dict();
    if (keep.has(s)) return null;
    if (d.has(s)) return d.get(s);
    for (const [re, fn] of SHAPES) { const m = s.match(re); if (m) { const t = fn(m); if (t != null) return t; } }
    // a line in parts ("Better · Inside · Durable, washable interior.") or several sentences
    if (s.indexOf(' · ') > 0) { const ps = s.split(' · '), ts = ps.map(part); if (ts.some((t, i) => t !== ps[i])) return ts.join(' · '); }
    const bits = s.split(/([.!?]) (?=[A-Z])/), sent = [];   // (the end mark is kept with its sentence)
    for (let i = 0; i < bits.length; i += 2) sent.push(bits[i] + (bits[i + 1] || ''));
    if (sent.length > 1) { const ts = sent.map(part); if (ts.some((t, i) => t !== sent[i])) return ts.join(' '); }
    return null;
  }

  // ---- the page: text and labels translated as they appear ----
  const ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
  const SKIP = 'script,style,textarea,input,select,code,[translate="no"],.notranslate,.mono';
  let lang = 'en', obs = null;
  function doText(n) {
    const v = n.nodeValue; if (!v || !/[A-Za-z]/.test(v)) return;
    if (n.__es === v) return;
    const p = n.parentElement; if (!p || p.closest(SKIP)) return;
    const t = v.replace(/\s+/g, ' ').trim(); if (!t) return;
    const es = tr(t); if (es == null || es === t) return;
    const out = (v.match(/^\s*/) || [''])[0] + es + (v.match(/\s*$/) || [''])[0];
    n.__es = out; n.nodeValue = out;
  }
  function doAttrs(el) {
    if (!el.getAttribute || el.closest('[translate="no"],.notranslate')) return;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const v = el.getAttribute(a); if (!/[A-Za-z]/.test(v)) continue;
      el.__esA = el.__esA || {};
      if (el.__esA[a] === v) continue;
      const es = tr(v.replace(/\s+/g, ' ').trim()); if (es == null) continue;
      el.__esA[a] = es; el.setAttribute(a, es);
    }
  }
  function walk(node) {
    if (node.nodeType === 3) { doText(node); return; }
    if (node.nodeType !== 1) return;
    doAttrs(node);
    if (node.matches && node.matches('script,style')) return;
    const tw = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n; while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function start() {
    if (obs) return;
    walk(document.body);
    obs = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function set(l) {
    l = l === 'es' ? 'es' : 'en';
    if (l === lang) return false;
    if (l === 'en') { location.reload(); return true; }   // the page is written in English: start it fresh
    lang = 'es'; document.documentElement.lang = 'es';
    start();
    return true;
  }
  return { set, tr, keep, get lang() { return lang; } };
});
