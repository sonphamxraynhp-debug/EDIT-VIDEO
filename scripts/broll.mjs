// Procedural b-roll library CLI (templates in engine/broll.js, catalog in assets/broll/catalog.json).
//   node broll.mjs search "doanh thu tăng mạnh" [--n 12] [--pal ember]   -> best catalog ids for a sentence
//   node broll.mjs render <id|template> out.mp4 [--dur 3] [--pal neon] [--text "…"] [--frames dir] [--w 1280 --h 720]
//   node broll.mjs pack <out_dir> [--limit 120] [--q "tiền"] [--pal ember] [--dur 3] [--per-template 3]
//   node broll.mjs sheet out.jpg [--pal ember] [--t 1.8] [--q "…" | --ids a,b,c] [--limit 48]   -> contact sheet for QC / browsing
// --frames writes a JPEG sequence usable anywhere media is accepted: {"seq":"dir/%05d.jpg","fps":30,"count":N}.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findChrome } from './platform.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(here, '..');
const CATALOG = path.join(SKILL, 'assets/broll/catalog.json');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const cmd = args[0];
const catalog = () => (fs.existsSync(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, 'utf8')) : []);

// Vietnamese-aware fuzzy match: strip tones so "doanh thu" ~ "doanh thu", "tiền" ~ "tien".
const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
function search(q, n = 12, pal) {
  const words = fold(q).split(/[^a-z0-9%]+/).filter(w => w.length > 1);
  const bigrams = words.slice(1).map((w, i) => words[i] + ' ' + w);
  const scored = [];
  for (const e of catalog()) {
    if (pal && e.pal !== pal) continue;
    const hay = fold([...(e.tags || []), e.topic, e.text, e.template].join(' | '));
    let s = 0;
    for (const b of bigrams) if (hay.includes(b)) s += 3;
    for (const w of words) if (hay.includes(w)) s += 1;
    if (s) scored.push([s + (e.pal === 'ember' ? .1 : 0), e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const outl = [];
  for (const [s, e] of scored) {  // diversify: at most 2 per template in the top list
    if (outl.filter(o => o.template === e.template).length >= 2) continue;
    outl.push({ score: +s.toFixed(1), ...e });
    if (outl.length >= n) break;
  }
  return outl;
}

function entryFor(idOrTpl) {
  const e = catalog().find(x => x.id === idOrTpl);
  const base = e ? { ...e } : { template: idOrTpl };
  for (const k of ['pal', 'text', 'sub', 'icon', 'unit']) if (opt('--' + k) != null) base[k] = opt('--' + k);
  if (opt('--num') != null) base.num = +opt('--num');
  if (opt('--items') != null) base.items = opt('--items').split('|');
  if (opt('--seed') != null) base.seed = +opt('--seed');
  return base;
}

const CHROME = findChrome();

async function open(W = 1280, H = 720) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--allow-file-access-from-files', '--disable-web-security', '--force-color-profile=srgb', '--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(pathToFileURL(path.join(SKILL, 'engine', 'index.html')).href, { waitUntil: 'networkidle0' });
  return { browser, page, W, H };
}
async function load(page, e, dur, W, H) {
  const { id, tags, topic, ...scene } = e;
  const tl = { width: W, height: H, fps: 30, duration: dur, base: pathToFileURL(SKILL).href + '/',
    scenes: [{ ...scene, type: 'broll', t0: -1, t1: dur + 1, layout: 'full', keep: true }] };
  await page.evaluate(t => window.init(t), tl);
}
async function shot(page, t) {
  await page.evaluate(x => window.renderFrame(x), t);
  return page.screenshot({ type: 'jpeg', quality: 90 });
}

async function renderClip(ctx, e, out, dur, framesDir) {
  await load(ctx.page, e, dur, ctx.W, ctx.H);
  const n = Math.round(dur * 30);
  let ff = null;
  if (out) {
    ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  }
  if (framesDir) fs.mkdirSync(framesDir, { recursive: true });
  for (let i = 0; i < n; i++) {
    const buf = await shot(ctx.page, i / 30);
    if (framesDir) fs.writeFileSync(path.join(framesDir, String(i + 1).padStart(5, '0') + '.jpg'), buf);
    if (ff && !ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  if (ff) { ff.stdin.end(); await new Promise(r => ff.on('close', r)); }
  return n;
}

if (cmd === 'search') {
  const r = search(args[1], +opt('--n', 12), opt('--pal'));
  for (const e of r) console.log(`${String(e.score).padStart(4)}  ${e.id.padEnd(48)} ${e.template.padEnd(14)} ${e.text ?? ''}`);
  if (!r.length) console.log('no match — try broader words, or use a template directly: node broll.mjs render <template> …');
} else if (cmd === 'render') {
  const e = entryFor(args[1]);
  const dur = +opt('--dur', 3);
  const ctx = await open(+opt('--w', 1280), +opt('--h', 720));
  const n = await renderClip(ctx, e, args[2] && !args[2].startsWith('--') ? args[2] : null, dur, opt('--frames'));
  await ctx.browser.close();
  console.log(`rendered ${e.id || e.template} (${n} frames)` + (opt('--frames') ? ` -> {"seq":"${opt('--frames')}/%05d.jpg","fps":30,"count":${n}}` : ''));
} else if (cmd === 'pack') {
  const outDir = args[1];
  fs.mkdirSync(outDir, { recursive: true });
  let list = opt('--q') ? search(opt('--q'), 9999, opt('--pal')) : catalog().filter(e => !opt('--pal') || e.pal === opt('--pal'));
  const per = +opt('--per-template', 0);
  if (per) { const cnt = {}; list = list.filter(e => (cnt[e.template] = (cnt[e.template] || 0) + 1) <= per); }
  list = list.slice(0, +opt('--limit', 60));
  const ctx = await open();
  const t0 = Date.now();
  for (const [i, e] of list.entries()) {
    const f = path.join(outDir, e.id + '.mp4');
    if (!fs.existsSync(f)) await renderClip(ctx, e, f, +opt('--dur', 3));
    process.stdout.write(`\r${i + 1}/${list.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s  ${e.id}`.padEnd(90));
  }
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(list, null, 1));
  await ctx.browser.close();
  console.log(`\npack -> ${outDir}`);
} else if (cmd === 'sheet') {
  const out = args[1];
  const t = +opt('--t', 1.8);
  let list;
  if (opt('--ids')) { const ids = opt('--ids').split(','); list = catalog().filter(e => ids.includes(e.id)); }
  else if (opt('--q')) list = search(opt('--q'), +opt('--limit', 48), opt('--pal'));
  else list = (await (async () => {
    // one tile per template (needs the template list from the page)
    const ctx = await open(); const tpls = await ctx.page.evaluate(() => BR_TEMPLATES); await ctx.browser.close();
    return tpls.map(tp => catalog().find(e => e.template === tp && e.pal === opt('--pal', 'ember')) || { template: tp, pal: opt('--pal', 'ember') });
  })());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'));
  const ctx = await open();
  for (const [i, e] of list.entries()) {
    await load(ctx.page, e, 4, 1280, 720);
    fs.writeFileSync(path.join(tmp, String(i + 1).padStart(3, '0') + '.jpg'), await shot(ctx.page, t));
  }
  await ctx.browser.close();
  const cols = 6, rows = Math.ceil(list.length / cols);
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, '%03d.jpg'),
    '-vf', `scale=320:180,tile=${cols}x${rows}:padding=4:color=black`, '-frames:v', '1', out], { stdio: 'inherit' });
  fs.writeFileSync(out + '.txt', list.map((e, i) => `${i + 1}\t${e.id || e.template}`).join('\n'));
  console.log(`sheet -> ${out} (${list.length} tiles, legend ${out}.txt)`);
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 6).join('\n'));
}
