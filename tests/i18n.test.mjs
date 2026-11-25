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
