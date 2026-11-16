// Build preview videos + thumbnails for the template library (templates/*.json, spec: references/templates.md).
//
// usage: node scripts/build_templates.mjs <footage_project_dir> [id …] [--fps 24] [--keep]
//   <footage_project_dir>  any talking-head project made by the pipeline: timeline.base.json (or timeline.json)
//                          + its captions file + A-roll frames (work/frames/%05d.jpg). Optional media/ folder.
//   id …                   only these templates (default: all built-in). index.json is always rewritten from every built-in template;
//                          templates/user/<id>.json (Style Lab) are built only when named.
//
// For each template: clone the footage timeline, set the preview size (360×640 or 640×360; a 16:9 template on vertical
// footage puts the A-roll on TL.clips with fit:'blurfill'), call window.applyTemplate inside engine/index.html (the
// exact function Studio uses), render tpl.preview.from → to (default 0 → 6 s) to templates/previews/<id>.mp4
// (H.264, no audio, ≤ 400 KB) and a still at tpl.preview.still to templates/previews/<id>.jpg (≤ 60 KB).
// Media referenced as media/<file> resolve to the footage project's media/ first, then examples/media/ (sample photos).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findChrome, linkPath } from './platform.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SK = path.resolve(here, '..');
const TPL = path.join(SK, 'templates'), PREV = path.join(TPL, 'previews');
const args = process.argv.slice(2);
const flag = k => args.includes(k);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--fps'].includes(args[i - 1])));
const [footArg, ...only] = pos;
if (!footArg) { console.error('usage: node scripts/build_templates.mjs <footage_project_dir> [id …] [--fps 24] [--keep]'); process.exit(1); }
const FOOT = path.resolve(footArg);
const FPS = +opt('--fps', 24);
const MAX_MP4 = 400 * 1024, MAX_JPG = 60 * 1024;

// ---------- load templates ----------
// templates/user/*.json (Style Lab, saved templates) are built too when asked for by id, but never listed in index.json.
const readDir = (dir, user) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').sort()
  .map(f => ({ f, user, tpl: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) })) : [];
const all = [...readDir(TPL, false), ...readDir(path.join(TPL, 'user'), true)];
const problems = [];
for (const { f, tpl } of all.filter(x => !x.user || only.includes(x.tpl.id))) {
  for (const k of ['id', 'name', 'category', 'aspect', 'pack', 'desc', 'title', 'base_dur']) if (tpl[k] == null) problems.push(`${f}: thiếu "${k}"`);
  if (tpl.id && f !== tpl.id + '.json') problems.push(`${f}: id "${tpl.id}" khác tên file`);
  if (tpl.name && [...tpl.name].length > 28) problems.push(`${f}: name dài ${[...tpl.name].length} > 28`);
  if (!['bds', 'khoahoc', 'review', 'chiase', 'tintuc', 'banhang', 'doanhnghiep', 'ai', 'khac'].includes(tpl.category)) problems.push(`${f}: category sai`);
  if (!['9:16', '16:9'].includes(tpl.aspect)) problems.push(`${f}: aspect sai`);
}
fs.writeFileSync(path.join(TPL, 'index.json'), JSON.stringify(all.filter(x => !x.user).map(({ tpl: t }) => ({
  id: t.id, name: t.name, category: t.category, aspect: t.aspect, pack: t.pack, desc: t.desc, tags: t.tags || [],
  needs: t.needs || [], preview: `previews/${t.id}.mp4`, thumb: `previews/${t.id}.jpg`,
})), null, 1));
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
const todo = only.length ? all.filter(x => only.includes(x.tpl.id)) : all.filter(x => !x.user);
if (only.length && todo.length !== only.length) console.error('không tìm thấy:', only.filter(i => !all.some(x => x.tpl.id === i)).join(', '));

// ---------- footage project → temp project (symlinks; media/ = footage media over sample media) ----------
const tlFile = ['timeline.base.json', 'timeline.json'].map(f => path.join(FOOT, f)).find(f => fs.existsSync(f));
if (!tlFile) { console.error('không có timeline.base.json / timeline.json trong', FOOT); process.exit(1); }
const base = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avs_tpl_'));
for (const e of fs.readdirSync(FOOT)) if (e !== 'media') linkPath(path.join(FOOT, e), path.join(tmp, e));
fs.mkdirSync(path.join(tmp, 'media'));
for (const dir of [path.join(SK, 'examples', 'media'), path.join(FOOT, 'media')]) {
  if (!fs.existsSync(dir)) continue;
  for (const e of fs.readdirSync(dir)) { const d = path.join(tmp, 'media', e); fs.rmSync(d, { force: true, recursive: false }); linkPath(path.join(dir, e), d); }
}
const captions = typeof base.captions === 'string' ? JSON.parse(fs.readFileSync(path.join(FOOT, base.captions), 'utf8')) : (base.captions || []);
const frameDir = path.join(FOOT, path.dirname(base.aroll.frames));
const nFrames = base.aroll.count || fs.readdirSync(frameDir).filter(f => /\.(jpe?g|png)$/.test(f)).length;
const fps0 = base.fps || 30;
const footVert = (base.height || 720) > (base.width || 1280);

const CHROME = findChrome();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--disable-web-security', '--force-color-profile=srgb', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
fs.mkdirSync(PREV, { recursive: true });

const ff = (a) => new Promise((res, rej) => { const p = spawn('ffmpeg', a, { stdio: ['pipe', 'ignore', 'inherit'] }); p.on('close', c => (c ? rej(new Error('ffmpeg ' + c)) : res())); p.stdin.end(); });
const report = [];
for (const { tpl } of todo) {
  const t0 = Date.now();
  const vert = tpl.aspect !== '16:9';
  const [W, H] = vert ? [360, 640] : [640, 360];
  const tl = JSON.parse(JSON.stringify(base));
  Object.assign(tl, { width: W, height: H, fps: fps0, captions, scenes: [], base: pathToFileURL(tmp).href + '/' });
  tl.aroll = { ...tl.aroll, count: nFrames };
  delete tl.caption_style;
  if (vert !== footVert) {
    tl.clips = [{ src: { seq: base.aroll.frames, fps: fps0, count: nFrames }, in: 0, out: +(nFrames / fps0).toFixed(3), fit: 'blurfill' }];
    if (tl.face && !vert) tl.face = { x: 640, y: 300 };
  }
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|net::/.test(m.text())) errs.push(m.text()); });
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(SK, 'engine', 'index.html')).href, { waitUntil: 'networkidle0' });
  await page.evaluate(t => window.init(t), tl);
  const applied = await page.evaluate(async (tp) => {
    window.applyTemplate(TL, tp, TL.captions, tp.title);
    await window.init(TL);
    const missing = (TL.scenes || []).filter(s => !MODULES[s.type]).map(s => s.type);
    const cap = TL.caption_style;
    const capBad = cap && !CAPTION_STYLES[cap] ? cap : null;
    return { scenes: TL.scenes.length, missing, capBad, pack: TL.pack, music: TL.audio?.music?.[0]?.mood };
  }, tpl);
  if (applied.missing.length) errs.push('module không có: ' + applied.missing.join(','));
  if (applied.capBad) errs.push('caption_style không có: ' + applied.capBad);
  const pv = tpl.preview || {};
  const from = pv.from ?? 0, to = Math.min(pv.to ?? from + 6, tl.duration), still = pv.still ?? Math.min(from + 1.5, to);
  if (flag('--keep')) fs.writeFileSync(path.join(tmp, `applied.${tpl.id}.json`), JSON.stringify(await page.evaluate(() => ({ ...TL, captions: undefined })), null, 1));

  // still
  await page.evaluate(x => window.renderFrame(x), still);
  let q = 82, jpg;
  do { jpg = await page.screenshot({ type: 'jpeg', quality: q }); q -= 6; } while (jpg.length > MAX_JPG && q > 20);
  fs.writeFileSync(path.join(PREV, `${tpl.id}.jpg`), jpg);

  // video: frames → temp dir → x264 (retry with higher crf if too big)
  const fdir = fs.mkdtempSync(path.join(tmp, `f_${tpl.id}_`));
  const n = Math.round((to - from) * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(x => window.renderFrame(x), from + i / FPS);
    fs.writeFileSync(path.join(fdir, String(i).padStart(4, '0') + '.jpg'), await page.screenshot({ type: 'jpeg', quality: 90 }));
  }
  await page.close();
  const out = path.join(PREV, `${tpl.id}.mp4`);
  let crf = 30;
  for (;;) {
    await ff(['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(fdir, '%04d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
    if (fs.statSync(out).size <= MAX_MP4 || crf >= 40) break;
    crf += 2;
  }
  fs.rmSync(fdir, { recursive: true, force: true });
  const r = { id: tpl.id, scenes: applied.scenes, mp4: Math.round(fs.statSync(out).size / 1024) + 'KB', crf, jpg: Math.round(jpg.length / 1024) + 'KB', sec: ((Date.now() - t0) / 1000).toFixed(0), errs: [...new Set(errs)] };
  report.push(r);
  console.log(`${r.id.padEnd(28)} scenes=${r.scenes} mp4=${r.mp4} (crf ${crf}) jpg=${r.jpg} ${r.sec}s${r.errs.length ? '  ERR ' + r.errs.join(' | ') : ''}`);
}
await browser.close();
if (!flag('--keep')) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('temp project kept:', tmp);
const bad = report.filter(r => r.errs.length);
console.log(`\n${report.length} template(s) built, ${bad.length} with errors.`);
process.exit(bad.length ? 2 : 0);
