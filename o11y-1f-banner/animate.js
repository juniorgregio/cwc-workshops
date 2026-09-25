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
//   data-gif-accent (optional) = "x,y,w,h;..." canvas regions whose moving colours get reserved
//                   GIF palette entries (see gif() below)
//
// Outputs (in outDir, default output/animado):
//   <prefix>-loop.gif    1920x231, 20 fps, loops forever        -> Dynatrace dashboards
//   <prefix>-loop.webp   1920x231, 30 fps, lossless, loops forever -> best quality in browsers
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
  const gifAccent = await page.evaluate(() => document.documentElement.dataset.gifAccent || '');
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

  // Each output gets its own numbered sequence of hard links to the captured frames, so ffmpeg reads
  // exactly the intended frames (an image sequence has no duplicated trailing entry, unlike concat).
  const frame = (i) => path.join(framesDir, String(i).padStart(5, '0') + '.png');
  const seq = (name, idx) => {
    const d = path.join(framesDir, name);
    fs.mkdirSync(d);
    idx.forEach((i, k) => fs.linkSync(frame(i), path.join(d, String(k).padStart(5, '0') + '.png')));
    return path.join(d, '%05d.png');
  };
  const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);
  const loopIdx = range(nIntro, nIntro + nLoop);
  const introIdx = range(0, nIntro + 1); // ends on the rest frame (= static banner)
  const fullIdx = [...range(0, nIntro), ...loopIdx, ...loopIdx];
  const count = (idx, rate) => Math.round((idx.length * rate) / fps);

  const small = 'scale=1920:231:flags=lanczos';
  // GIF palette: one global palette (static areas never flicker) built from
  //   * the whole frame (stats_mode=full), plus
  //   * 40 colours per "accent" region declared on <html data-gif-accent="x,y,w,h;..."> (canvas px),
  //     taken only from the pixels that change there (stats_mode=diff).
  // Without the accent colours, small coloured light (e.g. the blue Dynatrace pulse) is mapped to the
  // nearest colours of a palette dominated by the navy background and lavender halo, and turns mauve.
  const accents = gifAccent.split(';').map((r) => r.split(',').map(Number)).filter((r) => r.length === 4 && r.every(Number.isFinite));
  const gif = (seqPattern, n, loopFlag, out) => {
    const input = ['-framerate', String(fps), '-i', seqPattern];
    const pals = [path.join(framesDir, 'pal-full.png')];
    ff([...input, '-vf', `fps=20,${small},palettegen=max_colors=${Math.max(128, 240 - 40 * accents.length)}:stats_mode=full`, '-frames:v', '1', '-update', '1', pals[0]]);
    accents.forEach(([x, y, w, h], k) => {
      const c = [w, h, x, y].map((v) => Math.round(v / 2)).join(':'); // canvas px -> 1920 px
      pals.push(path.join(framesDir, `pal-accent-${k}.png`));
      ff([...input, '-vf', `fps=20,${small},crop=${c},palettegen=max_colors=40:stats_mode=diff`, '-frames:v', '1', '-update', '1', pals[k + 1]]);
    });
    const pal = path.join(framesDir, 'pal.png');
    const stack = pals.length > 1 ? `${pals.map((_, k) => `[${k}]`).join('')}hstack=inputs=${pals.length},` : '';
    ff([...pals.flatMap((p) => ['-i', p]), '-filter_complex', `${stack}palettegen=max_colors=256`, '-frames:v', '1', '-update', '1', pal]);
    // Ordered (bayer) dithering + rectangle diff: temporally stable, no shimmering static areas.
    ff([...input, '-i', pal, '-filter_complex', `[0:v]fps=20,${small}[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      '-frames:v', String(n), '-loop', loopFlag, out]);
  };

  const loopSeq = seq('loop', loopIdx);
  gif(loopSeq, count(loopIdx, 20), '0', path.join(outDir, `${prefix}-loop.gif`));
  // WebP is encoded LOSSLESS: lossy libwebp_anim merges low-contrast frame changes (the halo breath)
  // into blocky patches and leaves ghosts of the moving light.
  ff(['-framerate', String(fps), '-i', loopSeq, '-vf', small, '-c:v', 'libwebp_anim', '-lossless', '1', '-compression_level', '6',
    '-loop', '0', '-frames:v', String(nLoop), path.join(outDir, `${prefix}-loop.webp`)]);
  if (nIntro > 0) {
    // Plays once (-loop -1) and stops on its last frame, the static banner.
    gif(seq('intro', introIdx), count(introIdx.slice(0, -1), 20) + 1, '-1', path.join(outDir, `${prefix}-intro.gif`));
  }
  // One keyframe for the whole clip (-g): avoids the periodic quality "tick" on static areas at keyframes.
  ff(['-framerate', String(fps), '-i', seq('full', fullIdx), '-vf', 'crop=3840:460:0:0', '-frames:v', String(fullIdx.length),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-g', String(fullIdx.length), '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    path.join(outDir, `${prefix}.mp4`)]);

  if (!process.argv.includes('--keep-frames')) fs.rmSync(framesDir, { recursive: true, force: true });
  for (const f of fs.readdirSync(outDir).filter((f) => f.startsWith(prefix))) {
    console.log(f, (fs.statSync(path.join(outDir, f)).size / 1024 / 1024).toFixed(2) + ' MB');
  }
})();
