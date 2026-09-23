// node build.mjs  ->  writes ./index.html (self-contained: fonts, CSS, JS and SVG icons inlined)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = process.env.ICONS_DIR || path.join(HERE, 'icons');
const FONTS_DIR = process.env.FONTS_DIR || path.join(HERE, 'fonts');
const SRC = path.join(HERE, 'src');
const OUT = path.join(HERE, 'index.html');
const read = f => fs.readFileSync(f, 'utf8');

const missing = [];
function placeholder(name) {
  missing.push(name);
  return `<svg class="ic ic-${name} ic-missing" viewBox="0 0 64 64" aria-hidden="true" focusable="false">` +
    `<rect x="3" y="3" width="58" height="58" rx="10" fill="none" stroke="#e3136b" stroke-width="2.5" stroke-dasharray="6 5"/>` +
    `<text x="32" y="30" text-anchor="middle" font-size="8.5" font-family="monospace" fill="#e3136b">ícone</text>` +
    `<text x="32" y="42" text-anchor="middle" font-size="8.5" font-family="monospace" fill="#e3136b">${name}</text></svg>`;
}

function icon(name, suffix) {
  const file = path.join(ICONS_DIR, name + '.svg');
  if (!fs.existsSync(file)) return placeholder(name);
  let s = read(file).trim()
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  if (!/^<svg\b/.test(s)) return placeholder(name);
  // per-instance id prefix so gradients / clipPaths never collide
  if (suffix) s = s.split(`ic-${name}-`).join(`ic-${name}-${suffix}-`);
  // root tag: add classes, a11y attrs, drop fixed width/height
  s = s.replace(/^<svg\b([^>]*)>/, (m, attrs) => {
    attrs = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    let cls = `ic ic-${name}`;
    const cm = attrs.match(/\sclass="([^"]*)"/);
    if (cm) { cls += ' ' + cm[1]; attrs = attrs.replace(cm[0], ''); }
    // line icons: make their hue themeable (dark mode brightens it) but keep the reference colour as fallback
    attrs = attrs.replace(/style="color:\s*(#[0-9a-fA-F]{3,8})\s*;?"/, (mm, c) => `style="color:var(--ic-${name}, ${c})"`);
    return `<svg class="${cls}"${attrs} aria-hidden="true" focusable="false">`;
  });
  return s.replace(/>\s+</g, '><');
}

let html = read(path.join(SRC, 'template.html'));
html = html.replace(/<!--ICON:([a-z0-9_]+)(?:#([a-z0-9]+))?-->/g, (m, n, suf) => icon(n, suf));
// function replacers so `$` sequences inside the payloads are never interpreted
// fonts are embedded as base64 woff2 so the page works offline
const fontFace = (family, file) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:400 800;font-display:block;` +
  `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(FONTS_DIR, file)).toString('base64')}) format('woff2');}`;
const FONT_CSS = fontFace('Plus Jakarta Sans', 'PlusJakartaSans.woff2') + '\n' + fontFace('JetBrains Mono', 'JetBrainsMono.woff2') + '\n';
html = html.replace('/*FONTS*/', () => FONT_CSS);
html = html.replace('/*CSS*/', () => read(path.join(SRC, 'style.css')));
html = html.replace('/*JS*/', () => read(path.join(SRC, 'app.js')));
fs.writeFileSync(OUT, html);

const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`wrote ${OUT} (${kb} KB)` + (missing.length ? `  — placeholders for missing icons: ${[...new Set(missing)].join(', ')}` : '  — all icons present'));
