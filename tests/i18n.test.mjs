// ColorGenius in Spanish: the list of lines, the sentence shapes, and names that stay as they are.
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
globalThis.self = globalThis;
require(path.join(ROOT, 'js/i18n-es.js'));
const I = require(path.join(ROOT, 'js/i18n.js'));

test('the list: every line is English, a tab, then Spanish, and none is said two ways', () => {
  const lines = globalThis.CG.ES_TEXT.split('\n').filter(Boolean);
  assert.ok(lines.length > 1000, lines.length + ' lines');
  const seen = new Map();
  for (const l of lines) {
    const i = l.indexOf('\t');
    assert.ok(i > 0 && l.slice(i + 1).trim(), 'a line without Spanish: ' + l);
    const en = l.slice(0, i), es = l.slice(i + 1);
    if (seen.has(en)) assert.equal(seen.get(en), es, 'said two ways: ' + en);
    seen.set(en, es);
  }
});
test('the words on the page itself (the top bar, Back and Next, loading) are all in Spanish', () => {
  for (const s of ['Skip to the page', 'Home', 'Project', 'Settings', 'Back', 'Next', 'Getting the paint colors ready…', 'Update', 'Staff: unlock the kiosk', 'Your project', 'Question buttons'].filter(s => s !== 'Your project')) assert.ok(I.tr(s), s);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/id="langBtn"[^>]*translate="no"/.test(html), 'the language button never translates itself');
});
test('sentence shapes: names, numbers and dates put together in Spanish', () => {
  const cases = {
    'Change: Living Room': 'Cambiar: Sala',
    '2 gallons + 1 quart': '2 galones + 1 cuarto',
    '1 5-gallon bucket + 2 gallons': '1 cubeta de 5 galones + 2 galones',
    'November 25, 2026': '25 de noviembre de 2026',
    '3 to mix, 2 left': '3 por mezclar, faltan 2',
    'Best · Inside · Highly scrubbable interior for busy rooms.': 'Mejor · Interior · Interior muy lavable para habitaciones con mucho uso.',
    'Rain likely. Rain before it dries. Windy (31 mph)': 'Probable lluvia. Lluvia antes de que seque. Viento (31 mph)',
    'Stains for red oak floors': 'Tintes para pisos de roble rojo',
    'Added 2 samples to New Project': 'Se agregaron 2 muestras a Proyecto nuevo',
    'best days Saturday, Monday': 'mejores días: sábado, lunes',
  };
  for (const [en, es] of Object.entries(cases)) assert.equal(I.tr(en), es, en);
  assert.equal(I.tr('Something nobody wrote'), null);
});
test('a color with the same name as a word (like “Navy”) keeps its name', () => {
  assert.equal(I.tr('Navy'), 'Azul marino');
  I.keep.add('Navy');
  assert.equal(I.tr('Navy'), null);
  I.keep.delete('Navy');
});
test('every home-screen tip, and the six home tiles, are in Spanish', () => {
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const block = app.slice(app.indexOf('const TIPS = ['), app.indexOf('];', app.indexOf('const TIPS = [')));
  // (the tips use curly apostrophes, so each one is two plain '…' strings)
  const tips = [...block.matchAll(/\['([^']*)', '([^']*)'\]/g)].map(m => [m[1], m[2]]);
  assert.ok(tips.length >= 50, tips.length + ' tips');
  assert.equal(new Set(tips.map(t => t[0])).size, tips.length, 'no tip title twice');
  for (const [t, s] of tips) { assert.ok(I.tr(t), 'tip title: ' + t); assert.ok(I.tr(s), 'tip: ' + s); }
  for (const s of ['Paint Colors', 'Stain Colors', 'Spray Paint', 'Which Paint to Buy', 'Look Up a Color', 'Fix a Problem', 'Peeling, mildew, stains bleeding through or blotchy stain: why it happens, how to fix it and what to buy.',
    'Colors from the brands the store carries, and the right can for metal, plastic, wood or a grill.']) assert.ok(I.tr(s), s);
});
test('spray paint is in Spanish: every question, answer, finish, family, size, product note and tip', () => {
  globalThis.window = globalThis;
  require(path.join(ROOT, 'js/color.js')); require(path.join(ROOT, 'data/sprays.js'));
  const SP = require(path.join(ROOT, 'js/spray.js')); SP.init();
  const want = new Set();
  for (const j of Object.values(SP.JOBS)) want.add(j.label).add(j.sub);
  for (const [t, s] of Object.values(SP.PLACES).concat(Object.values(SP.CONDITION))) want.add(t).add(s);
  for (const f of Object.values(SP.FINISHES)) want.add(f.label).add(f.sub);
  for (const [t] of Object.values(SP.FAMILIES)) want.add(t);
  for (const z of Object.values(SP.SIZES)) want.add(z.label).add(z.sub);
  for (const l of Object.values(SP.LINES)) want.add(l.why);
  for (const b of SP.brands()) want.add(b.note);
  for (const what of Object.keys(SP.JOBS)) for (const condition of ['new', 'painted', 'rusty', 'shiny']) for (const finish of ['', 'chalky', 'glitter']) {
    const r = SP.recommend({ what, condition, finish, place: 'outside' }, {});
    for (const t of r.tips) want.add(t.title).add(t.text);
    // (a product's name is a brand and a line, which stay as they are)
    for (const p of r.products) { if (p.why) want.add(p.why); if (p.supplies) { want.add(p.name); p.supplies.forEach(x => want.add(x)); } else if (!/^(Rust-Oleum|Krylon|Montana)/.test(p.name)) want.add(p.name); }
  }
  for (const s of want) assert.ok(I.tr(s), 'no Spanish for: ' + s);
});
test('Quick Answers are in Spanish: every question, choice, answer, step, wait, shopping line and tip', () => {
  const AN = require(path.join(ROOT, 'js/answers.js'));
  const want = new Set(Object.values(AN.VERDICTS));
  const add = s => { if (s) want.add(s); };
  for (const T of AN.LIST) {
    [T.name, T.short, T.line].forEach(add);
    for (const a of T.asks) { add(a.q); add(a.hint); for (const o of a.opts) { add(o[1]); add(o[2]); } }
    for (const p of AN.combos(T.id)) {
      const A = AN.answer(T.id, p);
      ['head', 'like', 'why', 'alt', 'test', 'warn', 'wait', 'note'].forEach(k => add(A[k]));
      A.steps.concat(A.buy, A.tips).forEach(add);
      if (A.link) add(A.link.label);
    }
  }
  for (const s of ['Quick Answers', 'Quick Answer', 'What do you need to know?', 'Other Quick Answers', 'How to Do It', 'How long to wait', 'Or', 'the answer, the steps and what to buy']) add(s);
  for (const s of want) assert.ok(I.tr(s), 'no Spanish for: ' + s);
  // the email window, which every Print button now has an Email button beside
  assert.equal(I.tr('Email Clear Coat to Use'), 'Enviar por email: Qué capa transparente usar');
  assert.equal(I.tr('Sent to a@b.com'), 'Enviado a a@b.com');
  for (const s of ['Their email address', 'Use My Email App', 'Send', 'Sending…', 'written in: the answer, the steps and what to buy. Check it, then press Send.']) assert.ok(I.tr(s), s);
});
test('bulbs by number and the camera’s paper are in Spanish', () => {
  assert.equal(I.tr('Warm Bulbs (2850K)'), 'Focos cálidos (2850K)');
  assert.equal(I.tr('Soft white bulbs, 3050K'), 'Focos blanco suave, 3050K');
  assert.equal(I.tr('Light: Warm Bulbs, 2850K'), 'Luz: Focos cálidos, 2850K');
  assert.equal(I.tr('Screen tuning set for Warm 2850K bulbs'), 'Ajuste de pantalla para focos cálidos de 2850K');
  assert.match(I.tr('Read #D1CBC1, with the paper as #FFFFFF. Check it against a real chip.'), /^Leído: #D1CBC1, con el papel como #FFFFFF\./);
  // a word that's also a paint color's name ("Soft White") keeps the color's name, except in the app's own controls
  const had = I.keep.has('Soft White'); I.keep.add('Soft White');
  assert.equal(I.tr('Soft White'), null); assert.equal(I.tr('Soft White', true), 'Blanco suave');
  if (!had) I.keep.delete('Soft White');
  assert.equal(I.tr('Lighting'), 'Luz');
  for (const s of ['Extra Warm', 'Soft White', 'Bright White', 'Daylight', 'Or slide to the number on the bulb', 'The paper counts as pure white, #FFFFFF. Tap to count it as copy paper.', 'The paper now counts as copy paper, #EFEFEF, the closest to real paint chips.']) assert.ok(I.tr(s), s);
});
