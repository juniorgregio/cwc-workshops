#!/usr/bin/env node
// Grava o index.html quadro a quadro e gera um GIF (e, opcionalmente, um MP4).
//
// A página é uma função pura do tempo: para cada quadro a gravação chama FLOW.seek(t) e tira um
// screenshot do palco. Não há gravação de tela em tempo real, então nenhum quadro perde tempo ou
// sai tremido, e o resultado é idêntico a cada execução.
//
// Uso:
//   node tools/gravar-gif.mjs [opções]
//
//   --layout l|p           16:9 (l, padrão) ou vertical (p)
//   --theme light|dark     tema claro (padrão) ou escuro
//   --mode story|loop      story: montagem + um ciclo do loop (padrão); loop: só o loop, sem emenda
//   --fps 25               quadros por segundo (25 dá atraso exato de 4 cs por quadro no GIF)
//   --width N              largura do GIF (padrão: tamanho nativo do palco, 1920 no 16:9)
//   --quality 100          qualidade do gifski (1–100)
//   --out arquivo.gif      caminho de saída (padrão: gif/fluxo-<layout>-<tema>-<modo>.gif)
//   --frames pasta         onde salvar os PNGs (padrão: pasta temporária)
//   --keep-frames          não apaga os PNGs no fim
//   --mp4                  também gera um MP4 H.264 (precisa de ffmpeg)
//   --workers 3            abas do navegador gravando em paralelo
//
// Requisitos: Node 18+, Playwright com Chromium (npm i -D playwright && npx playwright install chromium)
// e o gifski (https://gif.ski) no PATH. Variáveis opcionais: GIFSKI, FFMPEG, CHROMIUM_PATH e
// PLAYWRIGHT_MODULE (caminho do pacote playwright, se ele não estiver instalado no projeto).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// ------------------------------------------------------------------ opções
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const flag = name => argv.includes('--' + name);

const layout = opt('layout', 'l') === 'p' ? 'p' : 'l';
const theme = opt('theme', 'light') === 'dark' ? 'dark' : 'light';
const mode = opt('mode', 'story') === 'loop' ? 'loop' : 'story';
const fps = Math.max(1, Math.min(50, Number(opt('fps', 25))));
const quality = Math.max(1, Math.min(100, Number(opt('quality', 100))));
const width = opt('width', null);
const workers = Math.max(1, Number(opt('workers', 3)));
const names = { l: '16x9', p: 'vertical', light: 'claro', dark: 'escuro', story: 'montagem-e-loop', loop: 'loop' };
const out = path.resolve(opt('out', path.join(ROOT, 'gif', `fluxo-${names[layout]}-${names[theme]}-${names[mode]}.gif`)));
const framesDir = path.resolve(opt('frames', fs.mkdtempSync(path.join(os.tmpdir(), 'fluxo-frames-'))));
const html = path.join(ROOT, 'index.html');

// ------------------------------------------------------------------ ferramentas externas
function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}
const gifski = process.env.GIFSKI || which('gifski');
if (!gifski) {
  console.error('gifski não encontrado. Instale (https://gif.ski, "cargo install gifski" ou "brew install gifski") ou defina GIFSKI.');
  process.exit(1);
}
const ffmpeg = flag('mp4') ? process.env.FFMPEG || which('ffmpeg') : null;
if (flag('mp4') && !ffmpeg) {
  console.error('--mp4 pede o ffmpeg no PATH (ou FFMPEG=/caminho/ffmpeg).');
  process.exit(1);
}
const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const chromium = pw.chromium || (pw.default && pw.default.chromium);

// ------------------------------------------------------------------ gravação
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function openPage() {
  const page = await browser.newPage({ viewport: layout === 'p' ? { width: 1080, height: 1620 } : { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const flags = ['capture', 'paused', layout === 'p' ? 'vertical' : 'landscape', theme === 'dark' ? 'dark' : null].filter(Boolean);
  await page.goto(pathToFileURL(html).href + '#' + flags.join(','));
  await page.waitForFunction(() => window.FLOW && window.FLOW.ready, null, { timeout: 15000 });
  const info = await page.evaluate(async ([l, th]) => {
    FLOW.pause(); FLOW.setLayout(l); FLOW.setTheme(th);
    await document.fonts.ready;
    return { W: FLOW.W, H: FLOW.H, T_INTRO: FLOW.T_INTRO, P: FLOW.P };
  }, [layout, theme]);
  await page.setViewportSize({ width: info.W, height: info.H });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  return { page, info, errors };
}

const first = await openPage();
const { W, H, T_INTRO, P } = first.info;
const t0 = mode === 'loop' ? T_INTRO : 0;
const duration = mode === 'loop' ? P : T_INTRO + P;
const total = Math.round(duration * fps);
const times = Array.from({ length: total }, (_, i) => +(t0 + i / fps).toFixed(6));
fs.mkdirSync(framesDir, { recursive: true });
console.log(`gravando ${total} quadros (${duration}s a ${fps} fps, ${W}x${H}, ${names[layout]}, ${names[theme]}, ${names[mode]}) em ${framesDir}`);

const pages = [first];
for (let i = 1; i < workers; i++) pages.push(await openPage());
let done = 0;
await Promise.all(pages.map(async ({ page }, w) => {
  for (let i = w; i < total; i += workers) {
    await page.evaluate(async t => {
      FLOW.seek(t);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, times[i]);
    await page.screenshot({ path: path.join(framesDir, `f${String(i).padStart(5, '0')}.png`), clip: { x: 0, y: 0, width: W, height: H } });
    if (++done % 50 === 0 || done === total) process.stdout.write(`  ${done}/${total}\n`);
  }
}));
const errors = pages.flatMap(p => p.errors);
await browser.close();
if (errors.length) { console.error('erros na página:\n' + errors.join('\n')); process.exit(1); }

// ------------------------------------------------------------------ codificação
const frames = fs.readdirSync(framesDir).filter(f => /^f\d{5}\.png$/.test(f)).sort().map(f => path.join(framesDir, f));
fs.mkdirSync(path.dirname(out), { recursive: true });
const help = spawnSync(gifski, ['--help'], { encoding: 'utf8' }).stdout || '';
const args = ['--fps', String(fps), '--quality', String(quality), '--repeat', '0', '-o', out];
if (help.includes('--extra')) args.push('--extra');
// sem --width o gifski reduz animações grandes; o padrão aqui é o tamanho nativo do palco
args.push('--width', String(width || W));
console.log(`codificando com ${path.basename(gifski)} (${spawnSync(gifski, ['--version'], { encoding: 'utf8' }).stdout.trim()})…`);
const enc = spawnSync(gifski, [...args, ...frames], { stdio: 'inherit' });
if (enc.status !== 0) process.exit(enc.status || 1);
console.log(`GIF: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);

if (ffmpeg) {
  const mp4 = out.replace(/\.gif$/i, '') + '.mp4';
  const vf = width ? ['-vf', `scale=${width}:-2:flags=lanczos`] : [];
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(framesDir, 'f%05d.png'),
    ...vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
  console.log(`MP4: ${mp4} (${(fs.statSync(mp4).size / 1048576).toFixed(1)} MB)`);
}

if (!flag('keep-frames') && !opt('frames', null)) fs.rmSync(framesDir, { recursive: true, force: true });
else console.log(`quadros mantidos em ${framesDir}`);
