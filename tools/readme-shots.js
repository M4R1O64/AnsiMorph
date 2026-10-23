#!/usr/bin/env node
// README screenshots: node tools/readme-shots.js <image> <outDir> [index.html]  → screenshot-<lang>.png (1440×900)
// Env: PUPPETEER (puppeteer-core module path), CHROME_PATH (browser executable).
const path = require('path');
const fs = require('fs');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const APP_FILE = process.argv[4] || ['app.html', 'index.html'].map(f => path.resolve(__dirname, '..', f)).find(f => fs.existsSync(f));
const IMG = process.argv[2], OUT = process.argv[3];
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu'], headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('ansimorph_theme', 'light'); localStorage.setItem('ansimorph_help_seen', '1'); } catch (e) {} });
  await p.goto('file://' + path.resolve(APP_FILE)); await sleep(800);
  await (await p.$('#fileInput')).uploadFile(IMG);
  await p.waitForFunction(() => document.getElementById('asciiText').textContent.length > 50, { timeout: 60000 });
  await p.evaluate(() => renderIdle());
  await p.evaluate(() => { ['input', 'style', 'color'].forEach(openSettingsSection); document.getElementById('sidebar').scrollTop = 0; });
  await sleep(3000); await p.evaluate(() => renderIdle());
  for (const L of ['en', 'ko', 'ja']) {
    await p.evaluate((l) => setLang(l, false), L); await sleep(800);
    await p.evaluate(() => { document.getElementById('sidebar').scrollTop = 0; document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
    await p.screenshot({ path: path.join(OUT, `screenshot-${L}.png`) });
  }
  await b.close();
})();
