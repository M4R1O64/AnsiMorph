#!/usr/bin/env node
// Help screenshots: node tools/help-shots.js <image> <outDir> [index.html]
// Takes <lang>_<name>.png for every UI language; then run tools/embed-help.py to embed them.
// Env: PUPPETEER (puppeteer-core module path), CHROME_PATH (browser executable).
const path = require('path');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fs = require('fs');
const APP_FILE = process.argv[4] || ['app.html', 'index.html'].map(f => path.resolve(__dirname, '..', f)).find(f => fs.existsSync(f));
const APP = 'file://' + path.resolve(APP_FILE);
const IMG = process.argv[2], OUT = process.argv[3];
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu'], headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('ansimorph_theme', 'light'); localStorage.setItem('ansimorph_help_seen', '1'); } catch (e) {} });
  await p.goto(APP); await sleep(800);
  await p.evaluate(() => setLang('ko', false));
  await (await p.$('#fileInput')).uploadFile(IMG);
  await p.waitForFunction(() => document.getElementById('asciiText').textContent.length > 50, { timeout: 60000 });
  const idle = async () => { await p.waitForFunction(() => { const x = document.getElementById('busyChip'); return !x || !x.offsetParent || getComputedStyle(x).display === 'none' || getComputedStyle(x).opacity === '0'; }, { timeout: 120000 }).catch(() => {}); await sleep(600); };
  await idle();
  // run the recommender so the suggestion cards are filled
  await p.click('#quickRecBtn');
  await sleep(1500);
  await p.waitForFunction(() => !/중단|Stop|停止/.test(document.getElementById('quickRecBtn').textContent) && document.querySelectorAll('#recommendList > *').length > 0, { timeout: 240000 });
  await p.waitForFunction(() => !/미리 만드는/.test(document.getElementById('recommendList').textContent), { timeout: 120000 }).catch(() => {});
  await sleep(800);
  await p.evaluate(() => document.getElementById('modeHalfBtn').click());   // half blocks read well at full size
  await idle(); await sleep(1500); await idle();
  const rect = (sel, pad = 0) => p.evaluate((s, pd) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - pd), y: Math.max(0, r.y - pd), width: r.width + 2 * pd, height: r.height + 2 * pd }; }, sel, pad);
  const union = async (sels, pad = 8) => { const rs = []; for (const s of sels) rs.push(await rect(s)); const x = Math.min(...rs.map(r => r.x)) - pad, y = Math.min(...rs.map(r => r.y)) - pad; const X = Math.max(...rs.map(r => r.x + r.width)) + pad, Y = Math.max(...rs.map(r => r.y + r.height)) + pad; return { x: Math.max(0, x), y: Math.max(0, y), width: X - Math.max(0, x), height: Y - Math.max(0, y) }; };
  const scrollTo = (sel) => p.evaluate((s) => { const e = document.querySelector(s); e.scrollIntoView({ block: 'start' }); const sb = document.getElementById('sidebar'); if (sb && sb.contains(e)) sb.scrollTop = Math.max(0, sb.scrollTop - 12); }, sel);
  for (const L of ['ko', 'en', 'ja']) {
    await p.evaluate((l) => setLang(l, false), L); await sleep(700); await idle();
    await p.waitForFunction(() => { const b = document.getElementById('recPreState'); return !b || !/\d+\/\d+/.test(b.textContent); }, { timeout: 120000 }).catch(() => {}); await sleep(500);
    const shot = async (name, clip) => { await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur()); await p.screenshot({ path: path.join(OUT, `${L}_${name}.png`), clip }); };
    await p.evaluate(() => { document.getElementById('sidebar').scrollTop = 0; });
    await sleep(200);
    // overview with numbered marks (settings panel as a new user sees it: only Suggestions open)
    await p.evaluate(() => {
      document.querySelectorAll('#sidebar .psec[data-sec]').forEach((sec) => { const want = sec.dataset.sec === 'rec'; if (sec.classList.contains('folded') === want) sec.querySelector('.psec-h').click(); });
      const marks = [['[data-sec="input"] .psec-h'], ['[data-sec="style"] .psec-h'], ['[data-sec="color"] .psec-h'], ['#msgCode'], ['#budget'], ['#discordAnsiBtn']];
      marks.forEach(([sel], i) => {
        const e = document.querySelector(sel); if (!e) return; const r = e.getBoundingClientRect();
        const box = document.createElement('div'); box.className = 'hs-mark';
        Object.assign(box.style, { position: 'fixed', left: (r.left - 4) + 'px', top: (r.top - 4) + 'px', width: (r.width + 8) + 'px', height: (r.height + 8) + 'px', border: '2.5px solid #e8590c', borderRadius: '10px', zIndex: 9998, pointerEvents: 'none' });
        const n = document.createElement('div'); n.className = 'hs-mark'; n.textContent = i + 1;
        const side = r.left > 60 && r.height < 60;   // short header rows: put the number outside on the left
        Object.assign(n.style, { position: 'fixed', left: (side ? r.left - 36 : r.left - 13) + 'px', top: (side ? r.top + r.height / 2 - 13 : r.top - 13) + 'px', width: '26px', height: '26px', borderRadius: '50%', background: '#e8590c', color: '#fff', font: '700 15px/26px system-ui, sans-serif', textAlign: 'center', zIndex: 9999, boxShadow: '0 0 0 2px #fff', pointerEvents: 'none' });
        document.body.append(box, n);
      });
    });
    await shot('overview', { x: 0, y: 0, width: 1280, height: 900 });
    await p.evaluate(() => document.querySelectorAll('.hs-mark').forEach(e => e.remove()));
    // settings panel: use a very tall viewport so nothing needs scrolling
    await p.setViewport({ width: 1280, height: 3400, deviceScaleFactor: 2 }); await sleep(700);
    await p.evaluate(() => { ['style', 'color', 'fine'].forEach(openSettingsSection); document.getElementById('sidebar').scrollTop = 0; });
    await sleep(400);
    await shot('style', await union(['.tiles', '.cseg'], 14));
    await shot('rec', await union(['#recSec .psec-h', '#recommendList .rec-group'], 12));
    await p.evaluate(() => { const g = document.querySelector('.grp[data-key="img"]'); if (g && g.classList.contains('closed')) g.querySelector('.grp-h').click(); });
    await sleep(300);
    { const r = await rect('.psec-fine', 12); r.height = Math.min(r.height, 560); await shot('tune', r); }
    await p.evaluate(() => { const g = document.querySelector('.grp[data-key="img"]'); if (g && !g.classList.contains('closed')) g.querySelector('.grp-h').click(); });
    await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 }); await sleep(700); await idle();
    // bottom bar
    await shot('dock', await rect('#dock', 0));
    // compare: zoomed in with the original shown
    await p.evaluate(() => { resetAscView(); });
    await p.click('#ascZoomIn'); await sleep(100);
    await p.click('#compareBtn'); await sleep(400);
    await shot('view', await union(['#msgCode', '#compareBtn', '#ascZoomIn'], 10));
    await p.click('#compareBtn'); await sleep(100);
    await p.evaluate(() => { resetAscView(); });
    // local saturation editor (paint a stroke once; it persists)
    await p.evaluate(() => { setSatEditing(true); }); await sleep(400);
    if (L === 'ko') {
      const r = await rect('#msgCode');
      const cx = r.x + r.width * 0.5, cy = r.y + r.height * 0.5;
      await p.mouse.move(cx - 200, cy - 60); await p.mouse.down();
      for (let k = 0; k <= 30; k++) await p.mouse.move(cx - 200 + k * 14, cy - 60 + Math.sin(k / 4) * 30);
      await p.mouse.up(); await sleep(600);
    }
    await shot('sat', await union(['#msgCode'], 6));
    await p.evaluate(() => { setSatEditing(false); }); await sleep(200);
  }
  await b.close();
})();
