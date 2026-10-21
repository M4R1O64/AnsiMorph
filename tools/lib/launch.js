// Shared browser launcher for the test and evaluation scripts.
// Uses the `puppeteer` package (downloads its own Chrome on `npm install`), or
// `puppeteer-core` with CHROME_PATH=/path/to/chrome if you prefer a local browser.
const path = require('path');

function loadPuppeteer() {
  try { return { pptr: require('puppeteer'), core: false }; } catch (e) { /* fall through */ }
  try { return { pptr: require('puppeteer-core'), core: true }; } catch (e) { /* fall through */ }
  throw new Error('Install puppeteer first: npm install');
}

async function launch(extraArgs = []) {
  const { pptr, core } = loadPuppeteer();
  const opts = { headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', ...extraArgs], protocolTimeout: 600000 };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  else if (core) throw new Error('puppeteer-core needs CHROME_PATH');
  return pptr.launch(opts);
}

// Absolute file:// URL of the app (default: index.html at the repository root)
function appUrl(p) {
  const abs = path.resolve(p || path.join(__dirname, '..', '..', 'index.html'));
  return 'file://' + abs;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { launch, appUrl, sleep };
