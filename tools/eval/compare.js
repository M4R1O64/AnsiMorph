// node tools/eval/compare.js <baseLabel> <newLabel> — per setting, mean of each metric over the images both runs share
// (lower is better for dot/cell/midE/fineE, higher for ssim/midS/fineS), plus how many images got better/worse
const path = require('path');
const [A, B] = process.argv.slice(2);
const load = (l) => require(path.resolve('eval-out', l + '.json'));
const ra = load(A), rb = load(B);
const K = ['dot', 'cell', 'ssim', 'midE', 'midS', 'fineE', 'fineS', 'len', 'ms'];
const key = (x) => x.cfg + '|' + x.img; const m = new Map(ra.map((x) => [key(x), x]));
const by = {}; for (const x of rb) { const y = m.get(key(x)); if (y) (by[x.cfg] = by[x.cfg] || []).push([y, x]); }
for (const c in by) {
  const P = by[c]; let w = 0, l = 0;
  for (const [y, x] of P) { const d = (x.dot - y.dot) / y.dot; if (d < -0.001) w++; else if (d > 0.001) l++; }
  const line = K.map((k) => { const va = P.reduce((s, p) => s + (p[0][k] || 0), 0) / P.length, vb = P.reduce((s, p) => s + (p[1][k] || 0), 0) / P.length; const d = va ? 100 * (vb - va) / Math.abs(va) : 0; return `${k} ${k === 'ms' || k === 'len' ? Math.round(vb) : vb.toFixed(k.endsWith('S') || k === 'ssim' ? 4 : 2)}(${d >= 0 ? '+' : ''}${d.toFixed(2)}%)`; }).join(' ');
  console.log(c.replace(/"(algorithm|colorMode|resolution)":/g, '').padEnd(36), `n${P.length} better ${w} worse ${l}`, line);
}
