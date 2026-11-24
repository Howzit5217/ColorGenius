// Shared project links in browsers without DecompressionStream: the app's own inflate must undo exactly what the
// browser's CompressionStream('deflate-raw') makes. Node's zlib makes the same format, at every setting.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'zlib';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const inflate = require(path.join(ROOT, 'js/inflate.js'));

test('inflate undoes deflate-raw, for every kind of block', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const project = JSON.stringify({ v: 1, n: 'Kitchen & Hall', t: 'Two coats ✓', s: 'The Home Depot', d: 1764000000000,
    i: Array.from({ length: 60 }, (_, k) => ['paint', 'behr:' + (1000 + k), 'Walls', 'Behr', 'Color ' + k, 'PPU' + k, (k * 123457).toString(16).slice(0, 6), 'Eggshell', 'Ultra Scuff Defense', '', '2 gallons']) });
  const noise = Buffer.from(Array.from({ length: 5000 }, () => Math.floor(rnd() * 256)));
  const inputs = [Buffer.alloc(0), Buffer.from('a'), Buffer.from(project), Buffer.from('ab'.repeat(40000)), noise, Buffer.concat([Buffer.from(project), noise, Buffer.from(project)])];
  for (const buf of inputs) {
    for (const opts of [{ level: 0 }, { level: 1 }, { level: 6 }, { level: 9 }, { level: 9, strategy: zlib.constants.Z_FIXED }, { level: 9, strategy: zlib.constants.Z_HUFFMAN_ONLY }, { level: 9, strategy: zlib.constants.Z_RLE }]) {
      const packed = zlib.deflateRawSync(buf, opts);
      assert.deepEqual(Buffer.from(inflate(packed)), buf, `${buf.length} bytes, ${JSON.stringify(opts)}`);
    }
  }
  // a damaged or cut-off link is refused, never half-read
  const good = zlib.deflateRawSync(Buffer.from(project));
  assert.throws(() => inflate(good.subarray(0, good.length >> 1)));
  assert.throws(() => inflate(Uint8Array.from([0xff, 0xff, 0xff])));
});
