// Exports the logos as transparent PNGs into logos-png/.
//   npm run export-logos
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.resolve(__dirname, 'logos-png');
const A = (f) => 'file://' + path.resolve(__dirname, 'assets', f);

// [output file, html body, css width of the element]
const JOBS = [
  ['accenture-logo-fundo-escuro.png', `<img id="x" src="${A('logos/accenture-reversed-white.svg')}" style="width:2000px">`],
  ['accenture-logo-fundo-claro.png',  `<img id="x" src="${A('logos/accenture-black.svg')}" style="width:2000px">`],
  ['dynatrace-logo-fundo-escuro.png', `<img id="x" src="${A('logos/dynatrace-white.svg')}" style="width:2000px">`],
  ['dynatrace-logo-fundo-claro.png',  `<img id="x" src="${A('logos/dynatrace-dark.svg')}" style="width:2000px">`],
  // O11y 1F emblem: native resolution of the source artwork (never upscaled).
  ['o11y-1f-emblema.png', `<img id="x" src="${A('o11y-1f-emblem.png')}" style="width:306px;height:369px">`],
  // Full O11y 1F lockup (emblem + name) exactly as in banner.html, without the banner background.
  ['o11y-1f-logo-completo.png', `
    <style>
      @font-face { font-family: "Open Sans"; font-weight: 700; src: url("${A('fonts/OpenSans-700.woff2')}") format("woff2"); }
      #x { display: inline-flex; align-items: flex-start; height: 369px; }
      .emblem { display: block; height: 369px; width: auto; flex: none; }
      .name { margin-left: 30px; margin-top: 108px; font-family: "Open Sans"; font-weight: 700; line-height: 1; white-space: nowrap; }
      .l1 { display: block; font-size: 84px; letter-spacing: -0.01em; color: #FFFFFF; }
      .l2 { display: block; font-size: 60px; letter-spacing: -0.01em; color: #9E7CC8; margin-top: 2px; padding-left: 66px; }
    </style>
    <div id="x"><img class="emblem" src="${A('o11y-1f-emblem.png')}"><div class="name"><span class="l1">ONE FINANCIAL</span><span class="l2">OBSERVABILITY</span></div></div>`],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2200, height: 900 }, deviceScaleFactor: 1 });
  for (const [file, body] of JOBS) {
    // Loaded from a file:// page (not setContent) so the local assets are allowed to load.
    const tmp = path.join(__dirname, '.export-tmp.html');
    fs.writeFileSync(tmp, `<html><body style="margin:0;background:transparent">${body}</body></html>`);
    await page.goto('file://' + tmp, { waitUntil: 'load' });
    fs.unlinkSync(tmp);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
    const el = await page.$('#x');
    await el.screenshot({ path: path.join(OUT, file), omitBackground: true });
    const box = await el.boundingBox();
    console.log(file, Math.round(box.width) + 'x' + Math.round(box.height));
  }
  await browser.close();
})();
