// Older browsers: ColorGenius runs in browsers back to about 2021 (Safari 14.1 and iPhones on iOS 14.5, Chrome and Edge 84,
// Firefox 78, Samsung Internet 14), and newer features only ever add polish there. These checks keep it that way:
// anything newer either has a fallback written next to it or isn't used. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const css = read('css/app.css');
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat('sw.js');

// each rule as { selector, body }, at any depth (inside @media and @supports too)
function rules(text) {
  const out = [], clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{};]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

test('stylesheet: newer CSS always has a fallback', () => {
  const all = rules(css);
  for (const r of all) {
    const decls = r.body.split(';').map(d => d.trim()).filter(Boolean).map(d => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]);
    decls.forEach(([prop, val], i) => {
      // inset (Safari 14.1+) is written out as top, right, bottom and left
      assert.notEqual(prop, 'inset', `${r.selector}: use top/right/bottom/left, not inset`);
      // color-mix() (Safari 16.2+, Firefox 113+) comes after a plain value for the same property
      if (/color-mix\(/.test(val) && !/^@keyframes|^\d+%|^from|^to/.test(r.selector)) {
        assert.ok(decls.slice(0, i).some(([p, v]) => p === prop && !/color-mix\(/.test(v)), `${r.selector}: ${prop} needs a plain value before its color-mix()`);
      }
      // clamp() (Safari 13.1+) the same way
      if (/clamp\(/.test(val)) assert.ok(decls.slice(0, i).some(([p, v]) => p === prop && !/clamp\(/.test(v)), `${r.selector}: ${prop} needs a plain value before its clamp()`);
    });
    // :has() is Firefox 121+: the app sets a class instead
    assert.ok(!/:has\(/.test(r.selector), `${r.selector}: :has() isn't in older browsers`);
    // an unknown selector drops the whole rule, so :focus-visible gets a rule of its own
    if (/:focus-visible/.test(r.selector)) assert.ok(!r.selector.includes(','), `${r.selector}: give :focus-visible its own rule`);
  }
  // CSS nesting and cascade layers are too new
  assert.ok(!/@layer\b/.test(css), '@layer');
  assert.ok(!/\{[^{}]*&[\s.:#[]/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'CSS nesting');
  // boxes that keep their shape with aspect-ratio (Safari 15+) get a spacer in older browsers
  const fallback = (css.match(/@supports not \(aspect-ratio: 1 \/ 1\) \{([\s\S]*?)\n\}/) || [])[1] || '';
  for (const r of all.filter(r => /aspect-ratio:/.test(r.body) && !r.selector.startsWith('@'))) {
    const sel = r.selector.split(',')[0].trim();
    if (/\b(canvas|img|video)\b/.test(sel)) continue;   // these have their own shape anyway
    assert.ok(fallback.includes(sel + '::before'), `${sel}: needs a spacer in the @supports not (aspect-ratio) block`);
  }
  // overflow: clip (Safari 16+) outside an @supports check gets a fallback
  if (/overflow-x: clip/.test(css)) assert.match(css, /@supports not \(overflow: clip\)/);
});

test('scripts: no syntax or built-ins newer than about 2020 without a check', () => {
  for (const f of jsFiles) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const code = src.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""');   // strings out of the way
    for (const [re, what] of [[/\?\.[^\d]/, 'optional chaining (?.)'], [/\?\?/, '?? and ??='], [/\|\|=|&&=/, '||= and &&='],
      [/\bstructuredClone\(/, 'structuredClone'], [/\.(findLast|findLastIndex|toSorted|toReversed|toSpliced|replaceAll)\(/, 'newer array/string methods'],
      [/Object\.hasOwn\(/, 'Object.hasOwn'], [/\brequestIdleCallback\(/, 'requestIdleCallback'], [/\bstatic\s*\{/, 'static blocks'],
      [/\(\?<[=!]/, 'regex lookbehind'], [/\.at\(\s*-\d+\s*\)/, 'Array.at(-n)']]) {   // (room3d's builder has an .at(x, y, z) of its own)
      assert.ok(!re.test(code), `${f}: ${what} isn't in older browsers`);
    }
    // these exist only in newer browsers, so each use sits behind a check
    for (const api of ['DecompressionStream', 'CompressionStream', 'ResizeObserver']) {
      const uses = code.split('\n').filter(l => new RegExp(`new ${api}\\(`).test(l));
      for (const l of uses) assert.ok(new RegExp(`typeof ${api}`).test(l) || /try\s*\{/.test(l), `${f}: new ${api}() needs a typeof check`);
    }
  }
});

test('page: every script is loaded, the inflate fallback before the app, and old browsers get a note', () => {
  const html = read('index.html'), sw = read('sw.js');
  const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(order.indexOf('js/inflate.js') > -1 && order.indexOf('js/inflate.js') < order.indexOf('js/app.js'));
  for (const f of jsFiles.filter(f => f.startsWith('js/'))) assert.ok(order.includes(f), `${f} is loaded by index.html`);
  for (const f of order) assert.ok(sw.includes(`'${f}'`), `${f} is in the offline list`);
  assert.match(html, /ColorGenius needs a newer web browser/);
  // the note's own script runs in any browser: no arrow functions, let/const or template strings outside its test string
  const note = html.match(/<script>\s*\/\* A browser too old[\s\S]*?<\/script>/)[0].replace(/new Function\('[^']*'\)/, '');
  assert.ok(!/=>|\blet\b|\bconst\b|`/.test(note), 'the old-browser note uses old-style JavaScript');
});

test('updates wait for the Update button', () => {
  const sw = read('sw.js'), app = read('js/app.js'), html = read('index.html');
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('message'"));
  assert.ok(!/skipWaiting\(\)/.test(install), 'a new version must not take over by itself');
  assert.match(sw, /m\.type === 'update'\) self\.skipWaiting\(\)/);
  // the weekly popular colors still refresh on their own; everything else comes from the installed version
  assert.match(sw, /const LIVE = \['data\/popular\.js'\]/);
  assert.match(html, /id="updateBtn" data-update-now="1"[^>]*hidden/);
  // the popup has one button and nothing that closes it
  const gate = app.slice(app.indexOf('function openUpdateGate'), app.indexOf('function onUpdateReady'));
  assert.equal((gate.match(/<button/g) || []).length, 1);
  assert.ok(!/data-modal-close|data-close/.test(gate));
});
