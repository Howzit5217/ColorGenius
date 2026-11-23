import fs from 'fs';
const b = fs.readFileSync(process.argv[2]);
if (b.toString('ascii', 0, 4) !== 'ASEF') { console.log('not ASE', b.toString('ascii',0,40)); process.exit(1); }
let o = 12; const n = b.readUInt32BE(8); const out = []; let group = '';
for (let i = 0; i < n && o < b.length; i++) {
  const type = b.readUInt16BE(o); const len = b.readUInt32BE(o + 2); const s = o + 6;
  if (type === 0x0001 || type === 0xC001) {
    const nl = b.readUInt16BE(s); let name = '';
    for (let k = 0; k < nl - 1; k++) name += String.fromCharCode(b.readUInt16BE(s + 2 + k * 2));
    if (type === 0xC001) group = name;
    else {
      const mo = s + 2 + nl * 2; const model = b.toString('ascii', mo, mo + 4).trim();
      const vals = []; const cnt = model === 'CMYK' ? 4 : model === 'Gray' ? 1 : 3;
      for (let k = 0; k < cnt; k++) vals.push(b.readFloatBE(mo + 4 + k * 4));
      out.push({ name, model, vals, group });
    }
  } else if (type === 0xC002) group = '';
  o = s + len;
}
console.log('entries', out.length, 'models', [...new Set(out.map(x => x.model))], out.slice(0, 3));
fs.writeFileSync(process.argv[3], JSON.stringify(out));
