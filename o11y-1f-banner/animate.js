// Renders the animated banner (banner-animado.html) into GIF / WebP / MP4.
//
//   npm run animate
//   node animate.js [in.html] [outDir] [--prefix name] [--fps 30]
//
// How it works: the page's animations are pure CSS @keyframes, so every frame is captured
// deterministically by pausing all animations (document.getAnimations()) and seeking them to
// the frame time, then screenshotting. The page declares its timeline on <html>:
//   data-intro-ms = length of the one-time entrance (0 .. intro)
//   data-loop-ms  = length of the seamless ambient loop (starts at intro; every infinite
//                   animation's duration divides it, and loop phase 0 == the static banner)
//
// Outputs (in outDir, default output/animado):
//   <prefix>-loop.gif    1920x231, 20 fps, loops forever        -> Dynatrace dashboards
//   <prefix>-loop.webp   1920x231, 30 fps, loops forever        -> lighter/better than GIF
//   <prefix>-intro.gif   1920x231, 20 fps, plays once and stops on the final banner
//   <prefix>.mp4         3840x460, 30 fps, H.264: entrance + 2 loops (presentations, social)
//
// ffmpeg: uses $FFMPEG, else the optional `ffmpeg-static` package, else `ffmpeg` on PATH.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { return require('ffmpeg-static'); } catch (e) { return 'ffmpeg'; }
}

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : def;
}

(async () => {
  const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
  const inp = path.resolve(pos[0] || 'banner-animado.html');
  const outDir = path.resolve(pos[1] || 'output/animado');
  const prefix = arg('prefix', 'o11y-1f-banner-animado');
  const fps = parseInt(arg('fps', '30'), 10);
  const W = 3840, H = 461;
  const FF = ffmpegPath();
  const ff = (args) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

  fs.mkdirSync(outDir, { recursive: true });
  const framesDir = path.join(outDir, '.frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto('file://' + inp, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  });
  const introMs = await page.evaluate(() => Number(document.documentElement.dataset.introMs || 0));
  const loopMs = await page.evaluate(() => Number(document.documentElement.dataset.loopMs || 0));
  if (!loopMs) throw new Error('<html data-loop-ms> is missing');
  const nIntro = Math.round((introMs / 1000) * fps);
  const nLoop = Math.round((loopMs / 1000) * fps);
  if (Math.abs(nLoop - (loopMs / 1000) * fps) > 1e-6) throw new Error('loop length must be a whole number of frames');

  // Frame i of the timeline is at t = i / fps. Frames 0..nIntro-1 = entrance, nIntro.. = loop.
  const total = nIntro + nLoop + 1; // +1: loop seam check frame (t = intro + loop)
  for (let i = 0; i < total; i++) {
    const t = (i * 1000) / fps;
    await page.evaluate((t) => {
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; }
    }, t);
    await page.screenshot({ path: path.join(framesDir, String(i).padStart(5, '0') + '.png'), clip: { x: 0, y: 0, width: W, height: H } });
  }
  await browser.close();
  console.log(`captured ${total} frames (intro ${introMs} ms, loop ${loopMs} ms, ${fps} fps)`);

  // Build ordered frame lists for each output (ffmpeg concat demuxer).
  const frame = (i) => path.join(framesDir, String(i).padStart(5, '0') + '.png');
  const list = (name, idx) => {
    const p = path.join(framesDir, name + '.txt');
    fs.writeFileSync(p, idx.map((i) => `file '${frame(i)}'\nduration ${1 / fps}\n`).join('') + `file '${frame(idx[idx.length - 1])}'\n`);
    return p;
  };
  const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);
  const loopIdx = range(nIntro, nIntro + nLoop);
  const introIdx = range(0, nIntro + 1); // ends on the rest frame (= static banner)
  const fullIdx = [...range(0, nIntro), ...loopIdx, ...loopIdx];

  const small = `scale=1920:231:flags=lanczos`;
  // Ordered (bayer) dithering + rectangle diff: temporally stable, no shimmering static areas.
  const gifVf = (rate) => `fps=${rate},${small},split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;

  const loopList = list('loop', loopIdx);
  ff(['-f', 'concat', '-safe', '0', '-i', loopList, '-vf', gifVf(20), '-loop', '0', path.join(outDir, `${prefix}-loop.gif`)]);
  ff(['-f', 'concat', '-safe', '0', '-i', loopList, '-vf', `fps=${fps},${small}`, '-c:v', 'libwebp_anim', '-quality', '88', '-compression_level', '6', '-loop', '0', path.join(outDir, `${prefix}-loop.webp`)]);
  if (nIntro > 0) {
    ff(['-f', 'concat', '-safe', '0', '-i', list('intro', introIdx), '-vf', gifVf(20), '-loop', '-1', path.join(outDir, `${prefix}-intro.gif`)]);
  }
  ff(['-f', 'concat', '-safe', '0', '-i', list('full', fullIdx), '-vf', `fps=${fps},crop=3840:460:0:0`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(outDir, `${prefix}.mp4`)]);

  if (!process.argv.includes('--keep-frames')) fs.rmSync(framesDir, { recursive: true, force: true });
  for (const f of fs.readdirSync(outDir).filter((f) => f.startsWith(prefix))) {
    console.log(f, (fs.statSync(path.join(outDir, f)).size / 1024 / 1024).toFixed(2) + ' MB');
  }
})();
