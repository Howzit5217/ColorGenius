// Quick Answers: which clear coat, which caulk or filler, what goes on concrete, and what goes over what.
// Every set of taps gets a whole answer, and the answers say what the paint desk would.
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const AN = require(path.join(ROOT, 'js/answers.js'));
const say = (id, p) => AN.answer(id, p);
const all = a => [a.head, a.like, a.why, a.alt, a.test, a.warn, a.wait, a.note].concat(a.steps, a.buy, a.tips).join(' ');

test('every set of taps on every helper gets a whole answer', () => {
  assert.deepEqual(AN.LIST.map(T => T.id), ['clear', 'caulk', 'concrete', 'over']);
  for (const T of AN.LIST) {
    const combos = AN.combos(T.id);
    assert.ok(combos.length > 10, T.id + ': ' + combos.length);
    for (const p of combos) {
      const a = say(T.id, p), where = AN.refOf(T.id, p);
      assert.ok(AN.VERDICTS[a.v], where + ': verdict ' + a.v);
      assert.ok(a.head && a.why, where + ': head and why');
      assert.ok(a.steps.length >= 1 && a.buy.length >= 1, where + ': steps and a shopping list');
      for (const s of a.steps.concat(a.buy, a.tips)) assert.ok(typeof s === 'string' && s.length > 2, where + ': ' + s);
      assert.equal(new Set(a.steps).size, a.steps.length, where + ': a step twice');
      // a saved answer comes back the same
      const back = AN.fromRef(where);
      assert.equal(back.id, T.id); assert.deepEqual(back.picks, p);
    }
    // the screen shows only the questions that have a choice to make
    for (const g of AN.shown(T.id, AN.pick(T.id))) assert.ok(g.opts.length > 1, T.id + ' ' + g.k);
  }
});

test('clear coat: it depends on what’s under it and where it goes', () => {
  // over white paint: water-based, which stays clear (oil turns it yellow)
  const white = say('clear', { on: 'table', under: 'lightpaint' });
  assert.match(white.head, /^Water-based/); assert.match(white.why, /yellow/);
  // a tabletop of bare wood: oil-based, with the oily-rag warning
  const table = say('clear', { on: 'table', under: 'bare' });
  assert.match(table.head, /^Oil-based polyurethane/); assert.match(table.warn, /catch fire/);
  // outside wood takes spar urethane; outside paint takes none
  assert.match(say('clear', { on: 'outside', under: 'bare' }).head, /spar urethane/);
  assert.equal(say('clear', { on: 'outside', under: 'darkpaint' }).v, 'skip');
  // floors get a floor finish; chalk paint isn't for floors
  assert.match(say('clear', { on: 'floor', under: 'bare' }).head, /floor/i);
  assert.equal(say('clear', { on: 'floor', under: 'chalk' }).v, 'no');
  // painted cabinets don't need one when the paint is an enamel
  assert.equal(say('clear', { on: 'cabinets', under: 'lightpaint' }).v, 'skip');
  // over an oil stain: oil-based, and the water-based choice says to wait and use dewaxed shellac first
  const overOil = say('clear', { on: 'cabinets', under: 'oilstain' });
  assert.match(overOil.head, /^Oil-based/); assert.match(overOil.alt, /dewaxed shellac/);
  assert.match(overOil.steps[0], /at least a day/);
  // water-based finishes carry no oily-rag warning
  assert.ok(!say('clear', { on: 'table', under: 'lightpaint' }).warn);
  // the sheen picked shows with the answer, and gloss on a floor gets a word of warning
  assert.equal(say('clear', { on: 'floor', under: 'bare', sheen: 'gloss' }).sheen, 'gloss');
  assert.ok(say('clear', { on: 'floor', under: 'bare', sheen: 'gloss' }).tips.some(t => /scratch/.test(t)));
});

test('caulk or filler: the right one for the gap, and the catches', () => {
  // the tub: 100% silicone, out with all the old, and fill the tub first
  const tub = say('caulk', { what: 'tub', over: 'none' });
  assert.match(tub.head, /100% silicone/); assert.match(all(tub), /Fill it with water first/); assert.match(all(tub), /won’t stick to old/);
  // painted trim: painter's caulk; nail holes never get caulk
  assert.match(say('caulk', { what: 'trim', over: 'paint', size: 'small' }).head, /Painter’s caulk/);
  assert.match(say('caulk', { what: 'nail', over: 'paint' }).head, /spackle/);
  // stained wood: colored putty after the finish, not filler under the stain
  assert.match(say('caulk', { what: 'nail', over: 'stain' }).head, /putty, after the finish/);
  // outside: a stretchy exterior sealant, and don't seal the weep holes
  const out = say('caulk', { what: 'outside', over: 'paint', size: 'small' });
  assert.match(out.head, /exterior sealant/); assert.match(all(out), /weep holes/);
  // wide gaps get backer rod; a corner crack gets caulk, a flat one tape
  assert.match(all(say('caulk', { what: 'outside', over: 'paint', size: 'wide' })), /backer rod/);
  assert.match(say('caulk', { what: 'corner', size: 'small' }).head, /caulk/);
  assert.match(say('caulk', { what: 'crack' }).head, /tape/);
  // a hole asks how big, not how wide; a big one gets a new piece
  const hole = AN.shown('caulk', AN.pick('caulk', { what: 'hole' })).map(g => g.k);
  assert.ok(hole.includes('hsize') && !hole.includes('size'));
  assert.match(say('caulk', { what: 'hole', hsize: 'big' }).head, /new piece of drywall/);
  // rot: hardener then epoxy
  assert.match(say('caulk', { what: 'rot', over: 'paint' }).head, /epoxy/);
});

test('concrete: the tests first, the right coating for the place, and when to stop', () => {
  const garage = say('concrete', { where: 'garage', look: 'solid', now: 'bare' });
  assert.match(garage.head, /2-part epoxy/);
  assert.match(all(garage), /Water test/); assert.match(all(garage), /Plastic test/);
  // outside: floor paint, and no garage epoxy (it yellows in the sun)
  const patio = say('concrete', { where: 'patio', look: 'solid', now: 'bare' });
  assert.match(patio.head, /Porch & floor paint/); assert.match(patio.why, /yellow/);
  // damp floors and sealed concrete: not yet; new concrete: wait 28 days
  assert.equal(say('concrete', { where: 'basement', look: 'solid', now: 'damp' }).v, 'notyet');
  assert.equal(say('concrete', { where: 'garage', look: 'stain', now: 'sealed' }).v, 'notyet');
  const fresh = say('concrete', { where: 'patio', look: 'stain', now: 'new' });
  assert.equal(fresh.v, 'wait'); assert.match(fresh.steps[0], /28 days/);
  // a driveway doesn't get painted; damp basement walls get a waterproofer, and it needs bare block
  assert.equal(say('concrete', { where: 'drive', look: 'solid', now: 'bare' }).v, 'no');
  assert.match(say('concrete', { where: 'bwall', look: 'solid', now: 'damp' }).head, /waterproofing/);
  assert.equal(say('concrete', { where: 'bwall', look: 'solid', now: 'painted' }).v, 'prep');
  // basement walls don't offer a see-through stain, driveways can't be "new and damp"
  assert.ok(!AN.shown('concrete', AN.pick('concrete', { where: 'bwall' })).find(g => g.k === 'look').opts.some(o => o[0] === 'stain'));
});

test('will it go over that: the classic yes, no and prime-first answers', () => {
  const v = (now, nw) => say('over', { now, new: nw }).v;
  // latex over oil needs a bonding primer; oil over latex is fine
  assert.equal(v('oil', 'latex'), 'prep'); assert.match(say('over', { now: 'oil', new: 'latex' }).steps.join(' '), /bonding primer/);
  assert.equal(v('latex', 'oil'), 'yes');
  // not sure which paint: the alcohol test, and steps that work on both
  const unsure = say('over', { now: 'notsure', new: 'latex' });
  assert.match(unsure.test, /rubbing alcohol/); assert.equal(unsure.v, 'prep');
  // stain can't go on paint; see-through can't go over solid deck stain; clear coats peel on decks
  assert.equal(v('latex', 'stain'), 'no'); assert.equal(v('deckSolid', 'semi'), 'no'); assert.equal(v('deckSemi', 'wpoly'), 'no');
  // oil paint peels off galvanized metal and masonry
  assert.equal(v('galv', 'oil'), 'no'); assert.equal(v('masonry', 'oil'), 'no');
  // nothing sticks to wax until it's off; oil-based clear coats yellow over light paint
  for (const nw of ['latex', 'chalk', 'wpoly']) assert.equal(v('wax', nw), 'prep');
  assert.equal(v('latex', 'opoly'), 'caution');
  // the things that go with oil-based products: the rag warning; old paint: the lead note
  assert.match(say('over', { now: 'latex', new: 'oil' }).warn, /catch fire/);
  assert.ok(say('over', { now: 'oil', new: 'latex' }).lead);
  // what's offered fits what's there (no deck stain over drywall)
  const onDrywall = AN.shown('over', AN.pick('over', { now: 'drywall' })).find(g => g.k === 'new').opts.map(o => o[0]);
  assert.deepEqual(onDrywall, ['latex', 'oil', 'chalk']);
  // for an old deck stain, the deck stains come first
  assert.equal(AN.shown('over', AN.pick('over', { now: 'deckSolid' })).find(g => g.k === 'new').opts[0][0], 'semi');
});

test('a tap that changes what a later question offers starts it at the usual answer, and keeps the rest', () => {
  // from painted trim to the tub: Nothing (so 100% silicone), not the Paint left over from the trim; the width stays
  const tub = AN.tap('caulk', AN.pick('caulk', { what: 'trim', over: 'paint', size: 'wide' }), 'what', 'tub');
  assert.equal(tub.over, 'none'); assert.equal(tub.size, 'wide');
  assert.match(say('caulk', tub).head, /^100% silicone/);
  // a deck stain offers the deck stains, first the see-through one; paint to paint keeps the pick
  assert.equal(AN.tap('over', AN.pick('over', { now: 'latex', new: 'wpoly' }), 'now', 'deckSolid').new, 'semi');
  assert.equal(AN.tap('over', AN.pick('over', { now: 'latex', new: 'wpoly' }), 'now', 'oil').new, 'wpoly');
  // basement walls: solid and bare; a patio keeps the look and condition picked for the garage
  assert.deepEqual(AN.tap('concrete', AN.pick('concrete', { where: 'garage', look: 'stain', now: 'sealed' }), 'where', 'bwall'), { where: 'bwall', look: 'solid', now: 'bare' });
  assert.deepEqual(AN.tap('concrete', AN.pick('concrete', { where: 'garage', look: 'stain', now: 'sealed' }), 'where', 'patio'), { where: 'patio', look: 'stain', now: 'sealed' });
});

test('Look Up opens the right Quick Answer for a question-like search', () => {
  const m = AN.match;
  assert.equal(m('polyurethane'), 'clear'); assert.equal(m('spar urethane'), 'clear');
  assert.equal(m('caulk'), 'caulk'); assert.equal(m('silicone for tub'), 'caulk'); assert.equal(m('spackle'), 'caulk');
  assert.equal(m('garage floor epoxy'), 'concrete'); assert.equal(m('drylok'), 'concrete');
  assert.equal(m('latex over oil'), 'over'); assert.equal(m('poly over paint'), 'over');
  assert.equal(m('masilla'), 'caulk'); assert.equal(m('poliuretano'), 'clear');
  // a color search isn't one
  for (const q of ['Agreeable Gray', 'SW 7029', 'navy', 'Hale Navy', 'gloss black']) assert.equal(m(q), null, q);
});
