// Builds a single self-contained index.html from src/ + icons/*.svg + fonts/*.woff2.
// Usage: node build.mjs            (ICONS_DIR / FONTS_DIR env vars override the defaults below)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = process.env.ICONS_DIR || path.join(HERE, 'icons');
const FONTS_DIR = process.env.FONTS_DIR || path.join(HERE, 'fonts');
const OUT = path.join(HERE, 'index.html');

const read = f => fs.readFileSync(path.join(HERE, f), 'utf8');

// ---------- fonts: embed woff2 as base64 so the page works offline ----------
const FONTS = [
  { family: 'Plus Jakarta Sans', file: 'PlusJakartaSans.woff2', weight: '400 800' },
  { family: 'JetBrains Mono', file: 'JetBrainsMono.woff2', weight: '400 800' },
];
const fontCss = FONTS.map(f => {
  const b64 = fs.readFileSync(path.join(FONTS_DIR, f.file)).toString('base64');
  return `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
}).join('\n');

// ---------- icons: inline SVG markup, re-prefix ids per instance ----------
const iconColors = new Map();
function icon(name, suffix) {
  const f = path.join(ICONS_DIR, name + '.svg');
  if (!fs.existsSync(f)) {
    console.warn('missing icon:', name);
    return `<svg class="ic ic-${name} ic-missing" viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="6" width="52" height="52" rx="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="6 5"/></svg>`;
  }
  let svg = fs.readFileSync(f, 'utf8').trim()
    .replace(/<\?xml[^>]*>\s*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const color = (svg.match(/<svg[^>]*\sdata-color="([^"]+)"/) || [])[1];
  if (color) iconColors.set(name, color);
  // root: drop inline style (colour comes from CSS so themes can recolour), add classes + aria-hidden
  svg = svg.replace(/<svg\b([^>]*)>/, (m, attrs) => {
    attrs = attrs.replace(/\sstyle="[^"]*"/, '').replace(/\s(width|height)="[^"]*"/g, '');
    const cls = (attrs.match(/\sclass="([^"]*)"/) || [])[1];
    attrs = attrs.replace(/\sclass="[^"]*"/, '');
    return `<svg${attrs} class="ic ic-${name}${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false">`;
  });
  if (suffix) svg = svg.split(`ic-${name}-`).join(`ic-${name}-${suffix}-`);
  return svg;
}

let html = read('src/template.html');
html = html.replace(/<!--ICON:([a-z0-9_]+)(?::([a-z0-9]+))?-->/g, (m, n, s) => icon(n, s));

// per-icon light-theme colour straight from the icon's data-color (the reference colour)
const iconCss = [...iconColors].map(([n, c]) => `.ic-${n}{color:${c}}`).join('\n');

html = html
  .replace('/*FONTS*/', () => fontCss)
  .replace('/*ICONCSS*/', () => iconCss)
  .replace('/*CSS*/', () => read('src/style.css'))
  .replace('/*JS*/', () => read('src/app.js'));

fs.writeFileSync(OUT, html);
console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(html.length / 1024).toFixed(0)} KB)`);
