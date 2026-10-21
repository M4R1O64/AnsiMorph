// Quality evaluation: node tools/eval/eval.js [index.html] [label] [configSet|JSON]
// Renders each image × setting with the real pipeline, draws the output like a Discord code block
// (14px text / 18px lines on #2b2d31), screenshots it and compares with the original (no preprocessing)
// at two scales: dot grid (cols×2, rows×4) and cell grid (cols×rows). Also SSIM-style structure scores.
//   IMGDIR=folder with test images (required)   IMGS=a.png,b.jpg (default: every image in IMGDIR)
//   PAR=parallel browsers (default 2)   EXTRA='{"mix256":true}' extra state for every run
// Results: eval-out/<label>.json — compare two runs with tools/eval/compare.js
const fs = require('fs');
const path = require('path');
const { launch, appUrl } = require('../lib/launch');
const IMGDIR = process.env.IMGDIR;
if (!IMGDIR) { console.error('Set IMGDIR to a folder of test images'); process.exit(1); }
const IMGS = process.env.IMGS ? process.env.IMGS.split(',') : fs.readdirSync(IMGDIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
const SETS = {
  main: [
    { algorithm: 'braille', colorMode: 'discord_dual', resolution: 60 },
    { algorithm: 'braille', colorMode: 'discord_dual', resolution: 80, targetLen: 4000 },
    { algorithm: 'braille', colorMode: 'discord_fg', resolution: 60 },
    { algorithm: 'hog_ssim', colorMode: 'discord_dual', resolution: 60 },
    { algorithm: 'half_block', colorMode: 'discord_dual', resolution: 60 },
    { algorithm: 'braille', colorMode: 'discord_true', resolution: 60, targetLen: 4000 },
  ],
  quick: [
    { algorithm: 'braille', colorMode: 'discord_dual', resolution: 60 },
    { algorithm: 'braille', colorMode: 'discord_dual', resolution: 80, targetLen: 4000 },
    { algorithm: 'hog_ssim', colorMode: 'discord_dual', resolution: 60 },
  ],
  v22: [
    { algorithm: 'hog_ssim', colorMode: 'discord_true', resolution: 50 },
    { algorithm: 'hog_ssim', colorMode: 'discord_true', resolution: 60 },
    { algorithm: 'braille', colorMode: 'discord_true', resolution: 60 },
    { algorithm: 'half_block', colorMode: 'discord_true', resolution: 60 },
    { algorithm: 'hog_ssim', colorMode: 'discord_dual', resolution: 60 },
    { algorithm: 'braille', colorMode: 'discord_dual', resolution: 60 },
  ],
  br: [
    { algorithm: 'braille', colorMode: 'discord_dual', resolution: 60 },
    { algorithm: 'braille', colorMode: 'discord_dual', resolution: 80, targetLen: 4000 },
  ],
};
const HELP = fs.readFileSync(__dirname + '/inject.js', 'utf8');

async function runImage(browser, app, img, cfgs, extra) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.setViewport({ width: 1800, height: 1400 });
  await page.goto(appUrl(app));
  await (await page.$('#fileInput')).uploadFile(path.join(IMGDIR, img));
  await page.waitForFunction(() => document.getElementById('asciiText').textContent.length > 50, { timeout: 120000 });
  await page.evaluate(HELP);
  if (process.env.REAL) await page.evaluate((r) => { window.__REAL = r; }, JSON.parse(process.env.REAL));
  const out = [];
  for (const c of cfgs) {
    const info = await page.evaluate((c, extra) => __evPrep(c, extra), c, extra || {}); if (process.env.PRED) await page.evaluate(() => { window.__evPredict = true; });
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: info.W, height: info.H }, encoding: 'base64' });
    const m = await page.evaluate((b64, info) => __evScore(b64, info), shot, info);
    out.push({ img, cfg: JSON.stringify(c), len: info.len, ms: info.ms, ...m });
    if (process.env.SAVE) fs.writeFileSync(path.join('eval-out', `${process.env.SAVE}_${img}_${c.algorithm}_${c.colorMode}_${c.resolution}.png`), Buffer.from(shot, 'base64'));
  }
  if (errors.length) console.log(img, errors.slice(0, 3));
  await page.close();
  return out;
}

(async () => {
  const app = process.argv[2], label = process.argv[3] || 'x', setName = process.argv[4] || 'main';
  fs.mkdirSync('eval-out', { recursive: true });
  const extra = process.env.EXTRA ? JSON.parse(process.env.EXTRA) : {};
  const cfgs = SETS[setName] || JSON.parse(setName);
  const rows = [];
  const P = +(process.env.PAR || 2);
  const q = IMGS.slice();
  await Promise.all(Array.from({ length: P }, async () => {
    const browser = await launch();
    while (q.length) { const img = q.shift(); rows.push(...await runImage(browser, app, img, cfgs, extra)); }
    await browser.close();
  }));
  fs.writeFileSync(path.join('eval-out', `${label}.json`), JSON.stringify(rows));
  const by = {};
  for (const r of rows) (by[r.cfg] = by[r.cfg] || []).push(r);
  let all = 0, n = 0, allOk = 0;
  for (const [c, rs] of Object.entries(by)) {
    const avg = k => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    console.log(label.padEnd(10), c.replace(/"(algorithm|colorMode|resolution)":/g, '').padEnd(52), 'dot', avg('dot').toFixed(2), 'cell', avg('cell').toFixed(2), 'ssim', avg('ssim').toFixed(4), 'ok', avg('okdot').toFixed(2) + '/' + avg('okcell').toFixed(2), 'bL', avg('biasL').toFixed(2), 'bC', avg('biasC').toFixed(2), 'fix', avg('fix').toFixed(2), 'ssimF', avg('ssimFix').toFixed(4), 'len', Math.round(avg('len')), 'ms', Math.round(avg('ms')));
    all += avg('dot') + avg('cell'); n += 2; allOk = (allOk || 0) + avg('okdot') + avg('okcell');
  }
  console.log(label.padEnd(10), 'SCORE(mean dot+cell)', (all / n).toFixed(3), 'OK', (allOk / n).toFixed(3));
})();
