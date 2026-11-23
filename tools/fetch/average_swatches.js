// Averages stain swatch photos into one color each. Brands that show stains only as photos (Olympic, Sherwin-
// Williams SuperDeck) host them with open cross-origin access, so a browser page can read their pixels.
// Paste into the browser console of any page, call averageSwatches([[code, imageUrl], ...]) and copy the result.
// It averages the middle 60% of each photo in linear light, away from any frame or label.
async function averageSwatches(list, concurrency = 6) {
  const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const toS = v => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  const one = url => new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 96; c.height = 96; const x = c.getContext('2d');
      const w = img.naturalWidth, h = img.naturalHeight;
      x.drawImage(img, w * 0.2, h * 0.2, w * 0.6, h * 0.6, 0, 0, 96, 96);
      const d = x.getImageData(0, 0, 96, 96).data; const s = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { s[0] += toLin(d[i]); s[1] += toLin(d[i + 1]); s[2] += toLin(d[i + 2]); }
      const n = d.length / 4; res(s.map(v => toS(v / n).toString(16).padStart(2, '0')).join('').toUpperCase());
    };
    img.onerror = () => res(null);
    img.src = url;
  });
  const out = {}; let i = 0;
  const worker = async () => { while (i < list.length) { const [code, url] = list[i++]; out[code] = await one(url); } };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}
if (typeof module !== 'undefined') module.exports = { averageSwatches };
