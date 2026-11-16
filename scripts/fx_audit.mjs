// Quét chất lượng hiệu ứng của mọi template trên một dự án thật: áp từng mẫu (engine applyTemplate) cho nhiều độ dài clip,
// rồi (1) kiểm tra timeline: cảnh dài quá, cảnh 0 giây / nằm ngoài video, cảnh chồng nhau, fx ngoài video;
// (2) --frames: render khung nhỏ quanh mỗi điểm vào/ra cảnh, đo độ chênh giữa 2 khung liên tiếp → "giật" khi một bước
// nhảy lớn bất thường (vào/ra cảnh không có chuyển động).
//   node scripts/fx_audit.mjs <project_dir> [--durs 15,30,60,120] [--only id1,id2] [--frames] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findChrome } from './platform.mjs';
import { interceptCdn } from './net_cache.mjs';

const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const here = path.dirname(fileURLToPath(import.meta.url)), SKILL = path.join(here, '..');
const proj = path.resolve(a[0] || '.');
const base = JSON.parse(fs.readFileSync(path.join(proj, 'timeline.json'), 'utf8'));
const CAP0 = typeof base.captions === 'string' ? JSON.parse(fs.readFileSync(path.join(proj, base.captions), 'utf8')) : base.captions || [];
const DURS = opt('--durs', '15,30,60,120').split(',').map(Number);
const ONLY = opt('--only', '') ? new Set(opt('--only').split(',')) : null;
const FRAMES = a.includes('--frames');
const tdir = path.join(SKILL, 'templates');
const TPLS = fs.readdirSync(tdir).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => JSON.parse(fs.readFileSync(path.join(tdir, f), 'utf8')))
  .filter(t => !ONLY || ONLY.has(t.id));
const clipLen = (base.clips || []).reduce((s, c) => s + ((c.out ?? 0) - (c.in || 0)) / (c.speed || 1), 0) || base.duration;

// Captions for a clip of length D: the project's own speech, repeated (shifted) until D.
function capsFor(D) {
  const L = Math.max(...CAP0.map(c => c.t1)) + .4, out = [];
  for (let k = 0; k * L < D; k++) for (const c of CAP0) {
    const s = k * L; if (c.t0 + s >= D) break;
    out.push({ ...c, t0: c.t0 + s, t1: Math.min(D, c.t1 + s), words: c.words.map(w => ({ ...w, s: w.s + s, e: w.e + s })) });
  }
  return out;
}
// Background-ish modules that are meant to sit under the whole video (frames, persistent layouts) — not "too long".
const LONG_OK = /frame|layout|bg|backdrop|split|bubble_layout|screen|cinema_bars|letterbox|multicam|greenscreen|ticker|podcast|chrome|grid|watermark|progress|badge|bars|live|reaction|scrim|grade|facecam|strap/;
function checkTl(tl, D) {
  const issues = [];
  const sc = (tl.scenes || []).filter(s => !s.hidden);
  for (const s of sc) {
    const d = s.t1 - s.t0, nm = s.type + (s.hf ? ':' + s.hf : '');
    if (d < .12) issues.push({ k: 'zero', msg: `${nm} ${s.t0}–${s.t1} dài ${d.toFixed(2)}s (không hiện)` });
    else if (s.t0 >= D - .05) issues.push({ k: 'outside', msg: `${nm} bắt đầu ở ${s.t0}s ≥ hết video` });
    else if (d > Math.max(9, D * .3) && !LONG_OK.test(s.type) && d < D - .5) issues.push({ k: 'long', msg: `${nm} ${s.t0}–${s.t1} dài ${d.toFixed(1)}s` });
  }
  for (const f of tl.fx || []) if (f.t >= D - .05) issues.push({ k: 'fx_out', msg: `fx ${f.type} ở ${f.t}s ngoài video` });
  return issues;
}

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--allow-file-access-from-files', '--disable-web-security', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = (await browser.pages())[0] || await browser.newPage();
await interceptCdn(page).catch(() => {});
const W = 216, H = Math.round(216 * (base.height || 1920) / (base.width || 1080));
await page.setViewport({ width: W, height: H });
await page.goto(pathToFileURL(path.join(SKILL, 'engine', 'index.html')).href, { waitUntil: 'networkidle0' });
// pixel diff helper lives in the page: decode two JPEG data-URLs onto a canvas, mean |Δ| per channel (0–255)
await page.evaluate(() => {
  window.__img = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
  window.__diff = async (u1, u2) => {
    const [i1, i2] = await Promise.all([__img(u1), __img(u2)]), c = document.createElement('canvas'); c.width = 108; c.height = Math.round(108 * i1.height / i1.width);
    const g = c.getContext('2d'); g.drawImage(i1, 0, 0, c.width, c.height); const d1 = g.getImageData(0, 0, c.width, c.height).data;
    g.drawImage(i2, 0, 0, c.width, c.height); const d2 = g.getImageData(0, 0, c.width, c.height).data;
    let s = 0; for (let i = 0; i < d1.length; i += 4) s += Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
    return s / (d1.length / 4 * 3);
  };
});

const report = [];
for (const tpl of TPLS) {
  for (const D of DURS) {
    const tl = JSON.parse(JSON.stringify(base));
    tl.base = pathToFileURL(proj).href + '/';
    tl.duration = D; tl.scenes = []; tl.fx = []; tl.captions = capsFor(D);
    // stretch the single a-roll clip so the main track covers D (frames loop is irrelevant for the audit)
    if (tl.clips?.length) tl.clips = [{ ...tl.clips[0], in: 0, out: Math.min(D, clipLen), speed: Math.min(D, clipLen) / D }];
    const applied = await page.evaluate((tl, tpl) => { window.applyTemplate(tl, tpl, tl.captions, tl.title || ''); return tl; }, tl, tpl);
    const issues = checkTl(applied, D);
    let pops = [];
    if (FRAMES && D === DURS[Math.min(1, DURS.length - 1)]) pops = await framePops(applied, D);
    report.push({ id: tpl.id, pack: tpl.pack, D, scenes: applied.scenes.length, issues, pops });
    const bad = issues.length + pops.length;
    if (bad) console.log(`${tpl.id} @${D}s: ${[...issues.map(i => i.msg), ...pops.map(p => `giật ${p.at.toFixed(2)}s Δ${p.d.toFixed(1)} (${p.what})`)].join(' · ')}`);
  }
}
async function framePops(tl, D) {
  await page.evaluate(t => window.init(t), { ...tl, width: W, height: H });
  const shot = async t => { await page.evaluate(x => window.renderFrame(x), t); return 'data:image/jpeg;base64,' + await page.screenshot({ type: 'jpeg', quality: 70, encoding: 'base64' }); };
  const marks = [];
  for (const s of tl.scenes) { marks.push([s.t0, 'vào ' + s.type]); if (s.t1 < D - .1) marks.push([s.t1, 'ra ' + s.type]); }
  // baseline: typical frame-to-frame motion of this edit away from marks
  const base = [];
  for (let i = 0; i < 6; i++) { const t = (i + .5) * D / 6; const x = await shot(t), y = await shot(t + 1 / 30); base.push(await page.evaluate((p, q) => __diff(p, q), x, y)); }
  const med = base.sort((p, q) => p - q)[3] || 1;
  const out = [];
  for (const [t, what] of marks.filter(m => m[0] > .05 && m[0] < D - .05)) {
    const f = []; for (let j = -2; j <= 2; j++) f.push(await shot(Math.max(0, t + j / 30)));
    let best = 0, at = t;
    for (let j = 0; j < 4; j++) { const d = await page.evaluate((p, q) => __diff(p, q), f[j], f[j + 1]); if (d > best) { best = d; at = t + (j - 1.5) / 30; } }
    if (best > 40 && best > med * 6) out.push({ at, d: best, what });
  }
  return out;
}
await browser.close();
const sum = {}; for (const r of report) for (const i of [...r.issues, ...r.pops.map(() => ({ k: 'pop' }))]) sum[i.k] = (sum[i.k] || 0) + 1;
console.log('\nTỔNG:', TPLS.length, 'mẫu ×', DURS.length, 'độ dài —', JSON.stringify(sum));
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(report, null, 1));
