// Render timeline.json through engine/index.html with headless Chrome, pipe JPEG frames into ffmpeg.
// usage: node render.mjs <timeline.json> <out.mp4> [--from 0] [--to 10] [--still 12.5 still.jpg] [--audio mix.wav]
//                        [--workers N] [--fast]
// --workers N: N Chrome pages render contiguous chunks in parallel into temp segments, joined losslessly
//              (concat -c copy), audio muxed once at the end. Default min(6, cores-2). --workers 1 = serial.
// --fast:      ffmpeg -preset veryfast (bigger file, quicker encode).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findChrome } from './platform.mjs';
import { interceptCdn } from './net_cache.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [tlPath, outPath] = args;
const here = path.dirname(fileURLToPath(import.meta.url));
const tlDir = path.dirname(path.resolve(tlPath));
const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
tl.base = pathToFileURL(tlDir).href + '/';
if (typeof tl.captions === 'string') tl.captions = JSON.parse(fs.readFileSync(path.resolve(tlDir, tl.captions), 'utf8'));
const W = tl.width || 1280, H = tl.height || 720, fps = tl.fps || 30;
if (tl.aroll && !tl.aroll.count) tl.aroll.count = fs.readdirSync(path.resolve(tlDir, path.dirname(tl.aroll.frames))).filter(f => f.endsWith('.jpg')).length;
const PRESET = args.includes('--fast') ? 'veryfast' : 'medium';

const CHROME = findChrome();

const launchArgs = ['--allow-file-access-from-files', '--disable-web-security', '--force-color-profile=srgb', '--hide-scrollbars',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']; // WebGL for 3D HyperFrames blocks
const browsers = [];
const engineUrl = pathToFileURL(path.join(here, '..', 'engine', 'index.html')).href;
// JPEG frame size from the SOF0/SOF2 marker (sanity check: a background tab can capture a wrong-sized surface).
const jpegSize = b => { for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xff) return null; const m = b[i + 1]; if (m === 0xc0 || m === 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + b.readUInt16BE(i + 2); } return null; };
// One Chrome per worker, using its initial (foreground) tab: parallel tabs in one browser capture wrong-sized surfaces.
async function openPage() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: launchArgs });
  browsers.push(browser);
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') console.error('[page]', m.text()); });
  await interceptCdn(page); // emoji/icons/fonts from the shared disk cache, not once per worker
  await page.goto(engineUrl, { waitUntil: 'networkidle0' });
  await page.evaluate(t => window.init(t), tl);
  const cdp = await page.createCDPSession();
  let fast = true;
  const shot = async (t, quality = 93) => {
    await page.evaluate(x => window.renderFrame(x), t);
    if (fast) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, optimizeForSpeed: true, captureBeyondViewport: false, fromSurface: true });
      const buf = Buffer.from(data, 'base64'), sz = jpegSize(buf);
      if (sz && sz[0] === W && sz[1] === H) return buf;
      fast = false; console.error(`[render] CDP capture ${sz} ≠ ${W}x${H}, dùng page.screenshot`);
    }
    return page.screenshot({ type: 'jpeg', quality });
  };
  return { browser, page, shot };
}
const ffmpeg = (argv) => new Promise((ok, bad) => {
  const p = spawn('ffmpeg', ['-v', 'error', '-y', ...argv], { stdio: ['ignore', 'inherit', 'inherit'] });
  p.on('close', c => c ? bad(new Error(`ffmpeg exit ${c}`)) : ok());
});

const still = opt('--still');
if (still) {
  const { shot } = await openPage();
  fs.writeFileSync(args[args.indexOf('--still') + 2] || outPath, await shot(+still, 92));
  await Promise.all(browsers.map(b => b.close()));
  process.exit(0);
}

const t0 = +opt('--from', 0), t1 = +opt('--to', tl.duration);
const n = Math.round((t1 - t0) * fps);
// Audio: --audio, else tl.audio.mix, else the default mix_audio.py output (work/mix.wav) when it exists.
const defMix = path.resolve(tlDir, tl.audio?.mix || 'work/mix.wav');
const audio = opt('--audio', tl.audio && fs.existsSync(defMix) ? defMix : null);
// Default min(6, cores-2), max 3 above 1080p (each worker is a whole Chrome); never less than ~1 s of frames per worker.
const workers = Math.max(1, Math.min(+opt('--workers', Math.min(W * H > 2.5e6 ? 3 : 6, os.cpus().length - 2)) || 1, Math.ceil(n / fps)));
const venc = ['-c:v', 'libx264', '-preset', PRESET, '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(fps)];

const started = Date.now();
let done = 0, lastShown = -1;
const tick = () => {
  done++;
  const sec = Math.floor(done / (fps * 2));
  if (sec !== lastShown) { lastShown = sec; process.stdout.write(`\r${(t0 + done / fps).toFixed(1)}s / ${t1}s  (${((Date.now() - started) / 1000).toFixed(0)}s elapsed)`); }
};

// Abort (failed worker, or SIGTERM from the studio's cancel): stop every Chrome + ffmpeg, drop temp segments.
const procs = []; let tmp = null;
const abort = () => { for (const p of procs) p.kill('SIGKILL'); for (const b of browsers) b.process()?.kill('SIGKILL'); if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); };
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { abort(); process.exit(130); });
// The studio server died (app quit): progress writes hit a closed pipe — clean up instead of leaving Chrome running.
for (const s of [process.stdout, process.stderr]) s.on('error', () => { abort(); process.exit(1); });

// One worker: frames [a, b) -> ffmpeg (segment file, or the final mp4 when serial).
async function renderRange(a, b, file, withAudio) {
  const { browser, shot } = await openPage();
  const ff = spawn('ffmpeg', [
    '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    ...(withAudio ? ['-ss', String(t0), '-t', String(t1 - t0), '-i', audio] : []),
    '-map', '0:v', ...(withAudio ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest'] : []),
    ...venc, ...(file === outPath ? ['-movflags', '+faststart'] : ['-video_track_timescale', String(fps * 512)]), file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  procs.push(ff);
  const closed = new Promise((ok, bad) => ff.on('close', c => c ? bad(new Error(`ffmpeg exit ${c}`)) : ok()));
  for (let i = a; i < b; i++) {
    const buf = await shot(t0 + i / fps);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    tick();
  }
  ff.stdin.end();
  await closed;
  await browser.close();
}

if (workers === 1) {
  await renderRange(0, n, outPath, !!audio);
} else {
  tmp = fs.mkdtempSync(path.join(path.dirname(path.resolve(outPath)), '.render_'));
  try {
    const per = Math.ceil(n / workers), segs = [];
    for (let w = 0; w < workers; w++) { const a = w * per, b = Math.min(n, a + per); if (a < b) segs.push({ a, b, file: path.join(tmp, `seg${w}.mp4`) }); }
    await Promise.all(segs.map(s => renderRange(s.a, s.b, s.file, false))).catch(e => { abort(); throw e; });
    fs.writeFileSync(path.join(tmp, 'list.txt'), segs.map(s => `file '${s.file.replace(/'/g, "'\\''")}'`).join('\n'));
    await ffmpeg([
      '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'),
      ...(audio ? ['-ss', String(t0), '-t', String(t1 - t0), '-i', audio] : []),
      '-map', '0:v', '-c:v', 'copy', ...(audio ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest'] : []),
      '-movflags', '+faststart', outPath,
    ]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
process.stdout.write(`\r${t1.toFixed(1)}s / ${t1}s  (${((Date.now() - started) / 1000).toFixed(0)}s elapsed)`);
// Explicit exit: a leftover puppeteer handle can otherwise keep node alive ~20 s after the file is written.
process.stdout.write(`\ndone -> ${outPath}  (${n} frames, ${workers} worker${workers > 1 ? 's' : ''}, ${(n / process.uptime()).toFixed(1)} fps, ${process.uptime().toFixed(1)}s)\n`, () => process.exit(0));
