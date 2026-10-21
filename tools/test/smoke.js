#!/usr/bin/env node
// Smoke test: node tools/test/smoke.js [path/to/index.html]
// - converts a generated test picture in every main mode and checks the Discord length limit
// - checks the background worker gives exactly the same output as the main thread
// - checks that no Korean text is left on screen in English and Japanese
// Exit code 1 on any failure.
const { launch, appUrl, sleep } = require('../lib/launch');

const CONFIGS = [
  { algorithm: 'braille', colorMode: 'discord_true' },
  { algorithm: 'braille', colorMode: 'discord_dual' },
  { algorithm: 'half_block', colorMode: 'discord_true' },
  { algorithm: 'hog_ssim', colorMode: 'discord_true' },
  { algorithm: 'hog_ssim', colorMode: 'discord_dual' },
];

(async () => {
  const fails = [];
  const browser = await launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(appUrl(process.argv[2]));
  await page.waitForFunction(() => typeof loadSampleImage === 'function' && typeof state === 'object');

  // A synthetic test picture (gradients, shapes, text) — no external image needed
  await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 320;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 480, 320); gr.addColorStop(0, '#1d4ed8'); gr.addColorStop(0.5, '#f59e0b'); gr.addColorStop(1, '#be123c');
    g.fillStyle = gr; g.fillRect(0, 0, 480, 320);
    g.fillStyle = '#f8fafc'; g.beginPath(); g.arc(150, 160, 90, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111827'; g.fillRect(280, 60, 140, 200);
    g.fillStyle = '#22c55e'; g.font = 'bold 64px sans-serif'; g.fillText('Hi', 300, 190);
    loadSampleImage(c.toDataURL('image/png'));
  });
  await page.waitForFunction(() => document.getElementById('asciiText').textContent.length > 50, { timeout: 120000 });
  await page.evaluate(() => renderIdle());

  for (const cfg of CONFIGS) {
    const r = await page.evaluate((cfg) => {
      Object.assign(state, cfg, { resolution: 60, targetLen: 2000 });
      rebuildEntryMap(); state.noRenderWorker = true; state.activeFg = null; state.activeBg = null; state.lastLambda = null;
      const t = performance.now(); processAndRenderASCII();
      return { len: state.lastAnsiText.length, ms: Math.round(performance.now() - t) };
    }, cfg);
    const ok = r.len > 100 && r.len <= 2000;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${cfg.algorithm}/${cfg.colorMode}: ${r.len} chars, ${r.ms} ms`);
    if (!ok) fails.push(`length ${cfg.algorithm}/${cfg.colorMode}: ${r.len}`);
  }

  // Worker (with progressive refinement) must equal the main-thread result
  const same = await page.evaluate(async () => {
    Object.assign(state, { algorithm: 'hog_ssim', colorMode: 'discord_true', resolution: 60, noRenderWorker: false });
    rebuildEntryMap(); state.activeFg = null; state.activeBg = null; state.lastLambda = null;
    triggerRender(); await new Promise((r) => setTimeout(r, 50)); await renderIdle();
    const w = state.lastAnsiText;
    state.noRenderWorker = true; state.activeFg = null; state.activeBg = null; state.lastLambda = null; processAndRenderASCII(); state.noRenderWorker = false;
    return w === state.lastAnsiText;
  });
  console.log(`${same ? 'ok  ' : 'FAIL'} worker output equals main-thread output`);
  if (!same) fails.push('worker != main');

  // Languages: nothing Korean left on screen
  for (const L of ['en', 'ja']) {
    const left = await page.evaluate(async (L) => {
      setLang(L, false); triggerRender(); await new Promise((r) => setTimeout(r, 50)); await renderIdle();
      const out = new Set();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const p = n.parentElement; if (!p || p.closest('#asciiText,#ansiPreview,script,style,.no-i18n,textarea')) continue; if (/[가-힣]/.test(n.nodeValue)) out.add(n.nodeValue.trim().slice(0, 60)); }
      document.querySelectorAll('[title],[placeholder],[aria-label]').forEach((el) => { if (el.closest('.no-i18n')) return; for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v && /[가-힣]/.test(v)) out.add('@' + v.slice(0, 60)); } });
      return [...out];
    }, L);
    console.log(`${left.length ? 'FAIL' : 'ok  '} ${L}: ${left.length} untranslated strings${left.length ? ' — ' + left.slice(0, 5).join(' | ') : ''}`);
    if (left.length) fails.push(`${L} untranslated: ${left.length}`);
  }
  await sleep(100);
  if (errors.length) { console.log('FAIL page errors:', errors.slice(0, 5)); fails.push('page errors'); }
  await browser.close();
  if (fails.length) { console.log(`\n${fails.length} failure(s)`); process.exit(1); }
  console.log('\nall smoke tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
