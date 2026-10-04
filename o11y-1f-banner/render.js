// Renders banner.html to PNG.
//   npm install            (installs Playwright; then: npx playwright install chromium)
//   npm run render         -> output/o11y-1f-accenture-dynatrace-banner.png (3840x461)
//                             output/o11y-1f-accenture-dynatrace-banner-1920.png (1920x231)
// Usage: node render.js [in.html] [out.png] [width] [height]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const [inp = 'banner.html', out = 'output/o11y-1f-accenture-dynatrace-banner.png', w = '3840', h = '461'] = process.argv.slice(2);
  const W = parseInt(w, 10), H = parseInt(h, 10);
  const browser = await chromium.launch();

  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(inp), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  if (size.w > W || size.h > H) console.warn('WARNING: content overflows the canvas', size);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });

  // Half-size export for lighter embeds (browser-resampled from the full-size PNG).
  const hw = Math.round(W / 2), hh = Math.round(H / 2);
  const half = out.replace(/\.png$/, '') + '-' + hw + '.png';
  const tmp = path.resolve(out) + '.tmp.html';
  fs.writeFileSync(tmp, '<body style="margin:0"><img src="' + path.basename(out) + '" style="display:block;width:' + hw + 'px;height:' + hh + 'px">');
  const p2 = await browser.newPage({ viewport: { width: hw, height: hh }, deviceScaleFactor: 1 });
  await p2.goto('file://' + tmp, { waitUntil: 'load' });
  await p2.screenshot({ path: half });
  fs.unlinkSync(tmp);

  console.log('rendered', out, W + 'x' + H, 'and', half, hw + 'x' + hh);
  await browser.close();
})();
