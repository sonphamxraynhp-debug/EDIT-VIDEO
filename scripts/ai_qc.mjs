// "AI tự kiểm tra" — quality check (and optional safe auto-fix) of a project before export. Spec: references/qc-variants.md.
// usage: node scripts/ai_qc.mjs <project_dir | timeline.json> [--fix] [--model sonnet] [--no-claude] [--no-audio] [--fresh]
//   1. deterministic checks: stills rendered through the real engine in ONE headless Chrome (scene entry/mid/exit + every 3 s),
//      element boxes read from the engine DOM (text off canvas, graphic over the speaker's face, caption under a big graphic),
//      face boxes found by YuNet on "base layer" stills, timeline checks (same-layer overlap, > 6 s without a visual event,
//      too dense, caption lines > 5 words, missing media, hook in the first 2 s), audio (LUFS / true peak of the mix,
//      music masking speech from mix stems, silence gaps);
//   2. Claude review (claude -p --allowedTools Read on a folder of stills + timeline summary): hook, readability, spelling,
//      variety, pacing, brand → issues with fixes limited to a safe patch vocabulary;
//   3. --fix: backup → deterministic fixes + validated Claude patches (changed items get _qc:true) → re-check → before/after stills.
// Writes <project>/.studio/qc.json {score, before, after, issues:[{t, kind, severity, msg, fixed}], …} and .studio/qc/sheet.jpg.
// Progress: "@@ <0..1> <step>" on stdout. Errors: Vietnamese on stderr, exit ≠ 0.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome, pyBin, spawnClaude } from './platform.mjs';

export const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PY = pyBin(SKILL);
const CHROME = findChrome();
const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const deep = o => JSON.parse(JSON.stringify(o));
const say = (p, s) => console.log(`@@ ${clamp(p, 0, 1).toFixed(2)} ${s}`);
// Same buckets as the Studio timeline (studio/studio.js trackOf): scenes on the same bucket must not overlap.
const LAYOUT = new Set(['frame_grid', 'title_card', 'spotlight', 'bubble_screen', 'hook_card', 'grid_bg', 'end_card', 'slam_bg', 'split', 'mega']);
const BROLL = new Set(['broll', 'media_card', 'mosaic', 'mosaic_wall', 'photo', 're_gallery']);
const trackOf = s => (s.type === 'text' ? 'add' : LAYOUT.has(s.type) ? 'scene' : BROLL.has(s.type) ? 'broll' : 'gfx');
// Decorative types that are meant to bleed past the frame edge (big background words, text orbiting the head…).
const BLEED = new Set(['orbit', 'mega', 'slam_bg', 'mosaic_wall', 'kinetic', 'light_leak', 'flash_ring', 'iris', 'ticker', 'marquee']);
const WEIGHT = { high: 15, med: 7, low: 3 };
const KIND_VI = {
  text_offcanvas: 'Chữ tràn khung', text_unsafe: 'Chữ ngoài vùng an toàn', face_cover: 'Graphic che mặt', caption_overlap: 'Phụ đề đè graphic',
  overlap: 'Cảnh chồng nhau', empty: 'Khoảng trống', dense: 'Quá dày', caption_long: 'Phụ đề dài', missing_media: 'Thiếu file',
  hook_missing: 'Thiếu hook', loudness: 'Độ to', true_peak: 'Đỉnh âm', music_masking: 'Nhạc át giọng', silence: 'Im lặng',
  hook: 'Hook', readability: 'Dễ đọc', spelling: 'Chính tả', variety: 'Đa dạng', pacing: 'Nhịp', brand: 'Thương hiệu', other: 'Khác',
};

// ---------- project ----------
export function loadProject(p) {
  const tlFile = p.endsWith('.json') ? path.resolve(p) : path.resolve(p, 'timeline.json');
  if (!fs.existsSync(tlFile)) throw new Error(`Không thấy ${tlFile}`);
  const dir = path.dirname(tlFile), tl = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
  let caps = tl.captions;
  if (typeof caps === 'string') caps = fs.existsSync(path.join(dir, caps)) ? JSON.parse(fs.readFileSync(path.join(dir, caps), 'utf8')) : [];
  tl.scenes = tl.scenes || [];
  return { dir, tlFile, tl, caps: Array.isArray(caps) ? caps : [] };
}
export function saveProject({ dir, tlFile }, tl, caps) {
  const capFile = typeof tl.captions === 'string' ? tl.captions : (caps?.length ? 'work/captions.json' : null);
  if (capFile) { fs.mkdirSync(path.dirname(path.join(dir, capFile)), { recursive: true }); fs.writeFileSync(path.join(dir, capFile), JSON.stringify(caps || [], null, 1)); tl.captions = capFile; }
  fs.writeFileSync(tlFile, JSON.stringify(tl, null, 1));
  // a history snapshot, so the Studio's "Lịch sử" list also shows the QC edit
  const h = path.join(dir, '.studio/history'); fs.mkdirSync(h, { recursive: true });
  fs.writeFileSync(path.join(h, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`), JSON.stringify({ timeline: tl, captions: caps }));
}
const isVert = tl => (tl.height || 1920) > (tl.width || 1080);
export const designOf = tl => tl.design || (isVert(tl) ? [720, 1280] : [1280, 720]);
// Long background layers (frame, grade, progress bar…) are the "base" the graphics sit on.
export const isBase = (s, tl) => s._base || (s.t1 - s.t0) >= Math.max(8, (tl.duration || 0) * .4);
const capText = c => (c.words || []).map(w => w.w).join(' ');

// ---------- headless engine (one Chrome, many stills) ----------
export async function openEngine(dir, { scale = .75 } = {}) {
  const { default: puppeteer } = await import('puppeteer-core');
  if (!CHROME) throw new Error('Không tìm thấy Google Chrome (cần để render ảnh kiểm tra).');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--allow-file-access-from-files', '--disable-web-security', '--force-color-profile=srgb', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const page = (await browser.pages())[0] || await browser.newPage();
  const E = { browser, page, dir, scale, failed: [], errors: [], curT: null };
  page.on('requestfailed', r => { const u = r.url(); if (u.startsWith('file:')) E.failed.push({ url: decodeURIComponent(u.replace(/^file:\/\//, '')), t: E.curT }); });
  page.on('pageerror', e => E.errors.push(String(e.message || e).slice(0, 200)));
  await page.goto(pathToFileURL(path.join(SKILL, 'engine/index.html')).href, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    if (window.__qcHooked) return; window.__qcHooked = true;
    // Tag every scene's output so the DOM can be traced back to TL.scenes[i] (display:contents = no layout change).
    for (const k of Object.keys(MODULES)) {
      const f = MODULES[k];
      MODULES[k] = function (s, t, lt) {
        const r = f.call(this, s, t, lt) || {};
        if (s.__qi != null) { const w = (h, l) => (h ? `<div data-qs="${s.__qi}" data-ql="${l}"${r.cover ? ' data-qcover="1"' : ''} style="display:contents">${h}</div>` : h); r.back = w(r.back, 'b'); r.front = w(r.front, 'f'); }
        return r;
      };
    }
    const cap = window.captionHTML;
    window.captionHTML = t => { const h = cap(t); return h ? `<div data-qcap="1" style="display:contents">${h}</div>` : h; };
    window.__qcMeasure = () => {
      const stage = document.getElementById('stage'), sr = stage.getBoundingClientRect(), k = sr.width / stage.offsetWidth;
      const toD = r => ({ x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k });
      const vis = el => { let o = 1; for (let e = el; e && e !== stage; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= +cs.opacity; if (o < .05) return 0; } return o; };
      // rect clipped by ancestors with overflow != visible (marquees, cards) — but NOT by the canvas.
      const clipR = (el, r) => {
        let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
        for (let e = el.parentElement; e && e !== stage; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.overflow !== 'visible' || cs.clipPath !== 'none') { const a = e.getBoundingClientRect(); if (!a.width && !a.height) continue; x0 = Math.max(x0, a.left); y0 = Math.max(y0, a.top); x1 = Math.min(x1, a.right); y1 = Math.min(y1, a.bottom); }
        }
        return x1 > x0 && y1 > y0 ? { left: x0, top: y0, width: x1 - x0, height: y1 - y0 } : null;
      };
      const texts = root => {
        const out = [], tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
        while ((n = tw.nextNode())) {
          const s = n.nodeValue.trim(); if (!s) continue;
          const el = n.parentElement; if (!el || el.closest('style,script')) continue;
          if (vis(el) < .2) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          for (const r of rg.getClientRects()) { if (r.width < 1 || r.height < 1) continue; const c = clipR(el, r); if (c) out.push({ ...toD(c), s: s.slice(0, 60) }); }
        }
        return out;
      };
      const paints = el => {
        if (/^(IMG|VIDEO|CANVAS|svg)$/i.test(el.tagName)) return true;
        const cs = getComputedStyle(el);
        const a = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor); if (a) { const p = a[1].split(',').map(Number); if ((p[3] ?? 1) > .25) return true; }
        if (cs.backgroundImage !== 'none') return true;
        for (const c of el.childNodes) if (c.nodeType === 3 && c.nodeValue.trim()) return true;
        return false;
      };
      const els = root => {
        const out = [], FA = stage.offsetWidth * stage.offsetHeight;
        for (const el of root.querySelectorAll('*')) {
          if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
          if (/^(STYLE|SCRIPT|BR)$/.test(el.tagName) || !paints(el) || vis(el) < .2) continue;
          const r = el.getBoundingClientRect(); const c = clipR(el, r); if (!c) continue;
          const d = toD(c); if (d.w * d.h > FA * .85 || d.w * d.h < FA * .002) continue;
          out.push(d);
        }
        return out;
      };
      const res = { scenes: {}, cap: null };
      for (const w of stage.querySelectorAll('[data-qs]')) {
        const i = w.dataset.qs, o = res.scenes[i] || (res.scenes[i] = { texts: [], els: [], cover: false, words: '' });
        if (w.dataset.qcover) o.cover = true;
        o.texts.push(...texts(w)); o.els.push(...els(w));
        o.words = (o.words + ' ' + w.textContent.replace(/\s+/g, ' ')).trim().slice(0, 300);
      }
      const cw = stage.querySelector('[data-qcap]');
      if (cw) { const tx = texts(cw); if (tx.length) res.cap = { texts: tx, text: cw.textContent.replace(/\s+/g, ' ').trim() }; }
      return res;
    };
  });
  return E;
}
// Load a (patched, in-memory) timeline into the engine. mode 'base' = only background layers, no captions (for face finding).
export async function engineInit(E, tl, caps, mode = 'full') {
  const [DW, DH] = designOf(tl), W = Math.round(DW * 1.5 * E.scale / 2) * 2, H = Math.round(DH * 1.5 * E.scale / 2) * 2;
  const t = deep(tl);
  t.width = W; t.height = H; t.base = pathToFileURL(E.dir).href + '/'; t.captions = deep(caps);
  t.scenes = (t.scenes || []).map((s, i) => ({ ...s, __qi: i }));
  if (mode === 'base') { t.scenes = t.scenes.filter(s => isBase(s, tl)); t.caption_style = 'none'; }
  if (t.aroll?.frames && !t.aroll.count && !t.clips?.length) { const d = path.resolve(E.dir, path.dirname(t.aroll.frames)); t.aroll.count = fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.jpe?g$/.test(f)).length : 0; }
  await E.page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await E.page.evaluate(x => Promise.race([window.init(x), new Promise(r => setTimeout(r, 8000))]), t);
  E.size = [W, H];
}
export async function engineShot(E, t, file, measure = true) {
  E.curT = t;
  await E.page.evaluate(x => window.renderFrame(x), t);
  const m = measure ? await E.page.evaluate(() => window.__qcMeasure()) : null;
  if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); await E.page.screenshot({ path: file, type: 'jpeg', quality: 82 }); }
  return m;
}

// ---------- faces (YuNet, same model as face_track.py) on the base-layer stills ----------
const FACE_PY = `
import sys, json, os
sys.path.insert(0, os.path.join(sys.argv[1], 'scripts'))
import numpy as np
from PIL import Image
from face_track import YuNet, N
det = YuNet(); out = {}
for f in sys.argv[2:]:
    im = Image.open(f).convert('RGB'); W, H = im.size; sc = N / max(W, H)
    rgb = np.asarray(im.resize((max(2, int(W * sc)), max(2, int(H * sc)))))
    out[f] = [list(map(float, d)) for d in det(rgb, 0.6) if 0.03 < d[3] < 0.9]
print(json.dumps(out))`;
function detectFaces(files) {
  if (!files.length || !fs.existsSync(path.join(SKILL, 'assets/models/face_detection_yunet_2023mar.onnx'))) return Promise.resolve({});
  return new Promise(ok => execFile(PY, ['-X', 'utf8', '-c', FACE_PY, SKILL, ...files], { maxBuffer: 1 << 24, cwd: SKILL }, (e, out) => {
    if (e) { console.error('[qc] không dò được mặt:', String(e.message).slice(0, 200)); return ok({}); }
    try { ok(JSON.parse(out.trim().split('\n').pop())); } catch { ok({}); }
  }));
}

// ---------- geometry ----------
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const bbox = rs => { if (!rs.length) return null; const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)); return { x: x0, y: y0, w: Math.max(...rs.map(r => r.x + r.w)) - x0, h: Math.max(...rs.map(r => r.y + r.h)) - y0 }; };
// fraction of box b covered by the union of rects (12×12 point grid — robust to nested/overlapping element boxes)
function covered(rects, b) {
  if (!b || !rects.length) return 0; let n = 0;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { const x = b.x + (i + .5) * b.w / 12, y = b.y + (j + .5) * b.h / 12; if (rects.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) n++; }
  return n / 144;
}
const grow = (r, px, py = px) => ({ x: r.x - px, y: r.y - py, w: r.w + 2 * px, h: r.h + 2 * py });

// ---------- sampling + DOM checks ----------
function sampleTimes(tl, caps, extra = []) {
  const D = tl.duration || 0, T = [];
  for (let t = .5; t < D - .1; t += 3) T.push(t);
  T.push(.5, 1, 1.8);
  (tl.scenes || []).forEach(s => {
    if (s.hidden || isBase(s, tl) || s.t1 - s.t0 < .2) return;
    const d = s.t1 - s.t0;
    T.push(s.t0 + Math.min(.6, d * .3), (s.t0 + s.t1) / 2, s.t1 - Math.min(.25, d * .15));
  });
  T.push(...extra);
  const out = [];
  for (const t of T.map(r2).filter(t => t >= 0 && t < D).sort((a, b) => a - b)) if (!out.length || t - out[out.length - 1] > .08) out.push(t);
  return out;
}
const speakingAt = (caps, t) => caps.some(c => !c.hidden && (c.words || []).some(w => t >= w.s - .1 && t <= w.e + .3));

async function domPass(E, tl, caps, times, stillDir, tag, onP) {
  const [DW, DH] = designOf(tl), samples = [];
  await engineInit(E, tl, caps, 'full');
  E.failed = [];
  for (let k = 0; k < times.length; k++) {
    const t = times[k], file = path.join(stillDir, `${tag}_${String(k).padStart(3, '0')}_t${t.toFixed(2)}.jpg`);
    samples.push({ t, file, m: await engineShot(E, t, file) });
    onP && onP(k / times.length * .7);
  }
  const failed = E.failed.slice();
  // base layer stills → face boxes (only where some overlay is on screen while the person speaks)
  const need = samples.filter(s => speakingAt(caps, s.t) && Object.keys(s.m.scenes).some(i => !isBase(tl.scenes[i], tl)));
  if (need.length) {
    await engineInit(E, tl, caps, 'base');
    for (const s of need) { s.base = s.file.replace(/\.jpg$/, '_base.jpg'); await engineShot(E, s.t, s.base, false); }
    onP && onP(.85);
    const faces = await detectFaces(need.map(s => s.base));
    for (const s of need) {
      const f = (faces[s.base] || []).sort((a, b) => b[3] - a[3])[0];
      if (f) s.face = grow({ x: (f[0] - f[2] / 2) * DW, y: (f[1] - f[3] / 2) * DH, w: f[2] * DW, h: f[3] * DH }, f[2] * DW * .08, f[3] * DH * .12);
      fs.rmSync(s.base, { force: true }); delete s.base;
    }
  }
  return { samples, failed, DW, DH };
}

function domIssues(tl, caps, P) {
  const { samples, DW, DH } = P, M = 6, SAFE = isVert(tl) ? { x: 40, y: 130, w: 600, h: 870 } : { x: 60, y: 40, w: 1160, h: 620 };
  const per = {}; // key -> {kind, i, ts:[], frac, mid}
  const hit = (kind, i, t, extra = {}) => { const k = `${kind}:${i}`; const o = per[k] || (per[k] = { kind, i, ts: [], ...extra }); o.ts.push(t); for (const [a, b] of Object.entries(extra)) if (typeof b === 'number') o[a] = Math.max(o[a] || 0, b); return o; };
  for (const s of samples) {
    const capR = s.m.cap ? bbox(s.m.cap.texts) : null;
    for (const [i, o] of Object.entries(s.m.scenes)) {
      const sc = tl.scenes[i]; if (!sc || isBase(sc, tl)) continue;
      const mid = Math.abs(s.t - (sc.t0 + sc.t1) / 2) < .1;
      if (!BLEED.has(sc.type)) {
        let worst = 0;
        for (const r of o.texts) if (/[\p{L}\d]/u.test(r.s)) worst = Math.max(worst, -r.x, -r.y, r.x + r.w - DW, r.y + r.h - DH);
        if (worst > M) { const h = hit('text_offcanvas', i, s.t, { px: Math.round(worst) }); if (mid) h.mid = true; }
        else if (o.texts.some(r => /[\p{L}\d]/u.test(r.s) && (r.x < SAFE.x - 2 || r.y < SAFE.y - 2 || r.x + r.w > SAFE.x + SAFE.w + 2 || r.y + r.h > SAFE.y + SAFE.h + 2)) && mid) hit('text_unsafe', i, s.t);
      }
      const rects = [...o.els, ...o.texts];
      if (s.face && !o.cover && !LAYOUT.has(sc.type)) { const f = covered(rects, s.face); if (f > .15) hit('face_cover', i, s.t, { frac: r2(f) }); }
      if (capR && !o.cover) { const f = covered(rects.filter(r => r.h > 14), capR); if (f > .25) hit('caption_overlap', i, s.t, { frac: r2(f) }); }
    }
    if (s.m.cap) {
      let worst = 0; for (const r of s.m.cap.texts) worst = Math.max(worst, -r.x, -r.y, r.x + r.w - DW, r.y + r.h - DH);
      if (worst > M) { const c = caps.findIndex(c => s.t >= c.t0 && s.t < c.t1 && !c.hidden); hit('text_offcanvas', 'c' + c, s.t, { px: Math.round(worst) }); }
    }
  }
  const out = [];
  for (const o of Object.values(per)) {
    const sc = String(o.i).startsWith('c') ? null : tl.scenes[+o.i], name = sc ? `“${sceneLabel(sc)}”` : 'Phụ đề';
    if (o.kind === 'text_offcanvas' && sc && !o.mid && o.ts.length < 2) continue; // entrance/exit animation only
    if (o.kind === 'text_offcanvas') out.push({ t: o.ts[0], kind: o.kind, severity: 'high', target: sc ? `s${o.i}` : o.i, msg: `${name}: chữ tràn ra ngoài khung ${o.px}px` });
    if (o.kind === 'text_unsafe') out.push({ t: o.ts[0], kind: o.kind, severity: 'low', target: `s${o.i}`, msg: `${name}: chữ nằm ngoài vùng an toàn (có thể bị nút/caption của app che)` });
    if (o.kind === 'face_cover') out.push({ t: o.ts[0], kind: o.kind, severity: o.frac > .6 ? 'high' : 'med', target: `s${o.i}`, msg: `${name} che ${Math.round(o.frac * 100)}% khuôn mặt khi đang nói` });
    if (o.kind === 'caption_overlap') out.push({ t: o.ts[0], kind: o.kind, severity: 'med', target: `s${o.i}`, msg: `Phụ đề bị ${name} đè lên (${Math.round(o.frac * 100)}%)` });
  }
  // hook: a big non-caption text or graphic in the first 2 s
  const early = samples.filter(s => s.t <= 2);
  const hero = early.some(s => Object.entries(s.m.scenes).some(([i, o]) => o.texts.some(r => r.h >= DH * .028 && /[\p{L}\d]/u.test(r.s)) || (!isBase(tl.scenes[i], tl) && o.els.some(r => r.w * r.h > DW * DH * .04))));
  if (early.length && !hero) out.push({ t: 0, kind: 'hook_missing', severity: 'high', target: null, msg: '2 giây đầu không có chữ lớn / graphic nào làm hook — người xem dễ lướt qua' });
  return out;
}
const sceneLabel = s => String(s.text || s.question || s.title || s.lines?.[0]?.text || s.value || s.type).slice(0, 40);

// ---------- timeline checks (no rendering) ----------
const MEDIA_RE = /\.(jpe?g|png|webp|gif|svg|mp4|mov|m4v|webm|mp3|wav|m4a|aac|flac)$/i;
function staticIssues(tl, caps, dir) {
  const out = [], D = tl.duration || 0, sc = (tl.scenes || []).map((s, i) => ({ s, i })).filter(({ s }) => !s.hidden);
  const over = sc.filter(({ s }) => !isBase(s, tl));
  // same-layer overlap
  const byTrack = {};
  for (const o of over) (byTrack[trackOf(o.s)] = byTrack[trackOf(o.s)] || []).push(o);
  for (const list of Object.values(byTrack)) {
    list.sort((a, b) => a.s.t0 - b.s.t0);
    for (let k = 1; k < list.length; k++) {
      const a = list[k - 1], b = list[k], ov = a.s.t1 - b.s.t0;
      if (ov > .25 && b.s.t0 < a.s.t1) out.push({ t: r2(b.s.t0), kind: 'overlap', severity: 'med', target: `s${a.i}`, other: `s${b.i}`, msg: `“${sceneLabel(a.s)}” và “${sceneLabel(b.s)}” chồng nhau ${ov.toFixed(1)}s trên cùng một lớp` });
    }
  }
  // stretches without a visual event (> 6 s)
  const ev = [0, D];
  for (const { s } of over) ev.push(s.t0, s.t1);
  for (const f of tl.fx || []) ev.push(f.t);
  for (const z of tl.zoom || []) ev.push(z.t0);
  let acc = 0; for (const c of tl.clips || []) { if (c.hidden) continue; const d = ((c.out ?? 3) - (c.in || 0)) / (c.speed || 1); if (acc > 0 && c.transition) ev.push(acc); acc += d; }
  const E = [...new Set(ev.map(r2))].filter(t => t >= 0 && t <= D).sort((a, b) => a - b);
  for (let k = 1; k < E.length; k++) if (E[k] - E[k - 1] > 6) out.push({ t: r2(E[k - 1]), t1: r2(E[k]), kind: 'empty', severity: E[k] - E[k - 1] > 9 ? 'high' : 'med', target: null, msg: `${(E[k] - E[k - 1]).toFixed(1)}s liền (${E[k - 1].toFixed(1)}–${E[k].toFixed(1)}s) không có graphic/hiệu ứng nào — dễ chán` });
  // too dense: > 3 overlay starts inside 4 s
  const starts = over.map(o => o.s.t0).sort((a, b) => a - b);
  for (let k = 0, last = -9; k < starts.length; k++) { const n = starts.filter(t => t >= starts[k] && t < starts[k] + 4).length; if (n > 3 && starts[k] - last > 4) { out.push({ t: r2(starts[k]), kind: 'dense', severity: 'low', target: null, msg: `${n} graphic bật lên trong 4 giây — hơi rối mắt` }); last = starts[k]; } }
  // captions
  caps.forEach((c, k) => { if (!c.hidden && (c.words || []).length > 5) out.push({ t: r2(c.t0), kind: 'caption_long', severity: c.words.length > 7 ? 'med' : 'low', target: `c${k}`, msg: `Phụ đề ${c.words.length} từ (“${capText(c).slice(0, 40)}”) — nên ≤ 4–5 từ/dòng` }); });
  // missing media files referenced anywhere in the timeline
  const seen = new Set();
  const walk = (o, where) => {
    if (Array.isArray(o)) return o.forEach(x => walk(x, where));
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === '_orig' || k === 'captions') continue;
      if (typeof v === 'string' && !/^(https?:|data:|si:|@)/.test(v) && (MEDIA_RE.test(v) || /%0\d+d/.test(v))) {
        const p = path.resolve(dir, v), ok = /%0\d+d/.test(v) ? fs.existsSync(path.dirname(p)) && fs.readdirSync(path.dirname(p)).length > 0 : fs.existsSync(p);
        if (!ok && !seen.has(v + where.target)) { seen.add(v + where.target); out.push({ t: where.t ?? 0, kind: 'missing_media', severity: 'high', target: where.target, file: v, msg: `Thiếu file ${v}` }); }
      } else if (v && typeof v === 'object') walk(v, where);
    }
  };
  (tl.scenes || []).forEach((s, i) => walk(s, { target: `s${i}`, t: s.t0 }));
  (tl.clips || []).forEach((c, i) => walk(c, { target: `k${i}`, t: 0 }));
  if (tl.aroll?.frames && !tl.clips?.length) walk({ f: tl.aroll.frames }, { target: 'aroll', t: 0 });
  const A = tl.audio || {};
  if (A.voice) walk({ v: A.voice }, { target: 'voice', t: 0 });
  (A.tracks || []).forEach(tr => (tr.items || []).forEach(it => walk(it, { target: 'track', t: it.t0 })));
  const sfxDir = A.sfx_dir ? path.resolve(dir, A.sfx_dir) : path.join(SKILL, 'assets/sfx'), musDir = A.music_dir ? path.resolve(dir, A.music_dir) : path.join(SKILL, 'assets/music');
  const has = (d, n) => ['', '.flac', '.wav', '.mp3', '.m4a'].some(e => fs.existsSync(path.join(d, n + e)));
  (A.sfx || []).forEach((x, k) => { if (x.name && !has(sfxDir, x.name)) out.push({ t: r2(x.t), kind: 'missing_media', severity: 'low', target: `a${k}`, file: x.name, msg: `Không có SFX “${x.name}” trong thư viện` }); });
  (A.music || []).forEach((m, k) => { if (m.file ? !fs.existsSync(path.resolve(dir, m.file)) : m.mood && !has(musDir, m.mood)) out.push({ t: r2(m.t0), kind: 'missing_media', severity: 'med', target: `m${k}`, file: m.file || m.mood, msg: `Không có nhạc “${m.file || m.mood}”` }); });
  // b-roll ids must exist in the library catalog
  let cat = null; try { cat = new Set(JSON.parse(fs.readFileSync(path.join(SKILL, 'assets/broll/catalog.json'), 'utf8')).map(b => b.id)); } catch {}
  if (cat) (tl.scenes || []).forEach((s, i) => { const id = s.broll?.id || s.screen?.broll?.id || (s.type === 'broll' ? s.id : null); if (id && !cat.has(id)) out.push({ t: r2(s.t0), kind: 'missing_media', severity: 'high', target: `s${i}`, file: id, msg: `B-roll “${id}” không có trong thư viện` }); });
  return out;
}

// ---------- audio: LUFS / true peak, music masking speech, silence ----------
function runP(cmd, argv, opts = {}) {
  return new Promise((ok, bad) => { const p = spawn(cmd, argv, { cwd: opts.cwd }); let out = '', err = ''; p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (err += d)); p.on('error', bad); p.on('close', c => (c ? bad(new Error(err.slice(-400) || `${cmd} lỗi (${c})`)) : ok({ out, err }))); });
}
async function pcm(file, rate = 4000) {
  const { out } = await new Promise((ok, bad) => execFile('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 1 << 28 }, (e, o) => (e ? bad(e) : ok({ out: o }))));
  return new Float32Array(out.buffer, out.byteOffset, out.length >> 2);
}
const rmsDb = (x, rate, win = .1) => { const n = Math.floor(rate * win), o = []; for (let i = 0; i + n <= x.length; i += n) { let s = 0; for (let j = i; j < i + n; j++) s += x[j] * x[j]; o.push(10 * Math.log10(s / n + 1e-12)); } return o; };
async function audioPass(tl, dir, qcDir) {
  const A = tl.audio; if (!A || !(A.voice || A.music?.length || A.tracks?.length || tl.clips?.some(c => c.audio))) return { issues: [], stats: null };
  const tmp = path.join(dir, `.qc_mix_${process.pid}.json`), mix = path.join(qcDir, 'mix.wav');
  const t = deep(tl); t.audio.mix = path.relative(dir, mix);
  fs.writeFileSync(tmp, JSON.stringify(t));
  try { await runP(PY, ['-I', '-X', 'utf8', path.join(SKILL, 'scripts/mix_audio.py'), tmp, '--stems'], { cwd: dir }); } finally { fs.rmSync(tmp, { force: true }); }
  const issues = [], stats = {};
  const { err } = await runP('ffmpeg', ['-nostats', '-i', mix, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(err.split('Summary:').pop()), TP = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(err.split('Summary:').pop());
  stats.lufs = I ? +I[1] : null; stats.true_peak = TP ? +TP[1] : null;
  if (stats.lufs != null && Math.abs(stats.lufs + 14) > 1.5) issues.push({ t: 0, kind: 'loudness', severity: 'med', target: null, msg: `Độ to ${stats.lufs} LUFS (chuẩn mạng xã hội −14 LUFS)` });
  if (stats.true_peak != null && stats.true_peak > -.5) issues.push({ t: 0, kind: 'true_peak', severity: 'low', target: null, msg: `Đỉnh âm ${stats.true_peak} dBTP (nên ≤ −1 dBTP để không vỡ tiếng)` });
  const R = 4000, sv = path.join(dir, '.studio/stem_voice.wav'), sm = path.join(dir, '.studio/stem_music.wav');
  if (fs.existsSync(sv) && fs.existsSync(sm) && A.music?.length) {
    const v = rmsDb(await pcm(sv, R), R), m = rmsDb(await pcm(sm, R), R);
    const vMax = [...v].sort((a, b) => b - a)[Math.floor(v.length * .1)] ?? -99;
    const sp = v.map((x, i) => (x > vMax - 18 && x > -45 ? i : -1)).filter(i => i >= 0 && i < m.length);
    const diff = sp.map(i => m[i] - v[i]).sort((a, b) => a - b), masked = diff.filter(d => d > -8).length;
    stats.music_vs_voice_db = diff.length ? r2(diff[Math.floor(diff.length / 2)]) : null;
    stats.masked_pct = sp.length ? Math.round(masked / sp.length * 100) : 0;
    if (sp.length && masked / sp.length > .2) {
      const first = sp.find(i => m[i] - v[i] > -8);
      issues.push({ t: r2(first * .1), kind: 'music_masking', severity: masked / sp.length > .45 ? 'high' : 'med', target: 'music', need_db: r2(Math.min(12, Math.max(3, stats.music_vs_voice_db + 14))),
        msg: `Nhạc nền át giọng ở ${stats.masked_pct}% lúc nói (nhạc chỉ thấp hơn giọng ${-stats.music_vs_voice_db} dB, nên ≥ 12 dB)` });
    }
  }
  // silence gaps in the final mix (> 1.2 s below −50 dBFS) inside the video
  const x = rmsDb(await pcm(mix, R), R), D = tl.duration || x.length / 10;
  for (let i = 0; i < x.length;) {
    if (x[i] < -50) { let j = i; while (j < x.length && x[j] < -50) j++; const a = i * .1, b = j * .1; if (b - a > 1.2 && a > .3 && b < D - .3) issues.push({ t: r2(a), kind: 'silence', severity: 'low', target: null, msg: `Im lặng hoàn toàn ${(b - a).toFixed(1)}s (${a.toFixed(1)}–${b.toFixed(1)}s)` }); i = j; } else i++;
  }
  for (const f of [sv, sm]) fs.rmSync(f, { force: true });
  return { issues, stats };
}

// ---------- Claude review ----------
export function askClaude(prompt, { model = 'sonnet', cwd, tools = [], timeout = 360000, onTick } = {}) {
  return new Promise((ok, bad) => {
    const argv = ['-p', '--output-format', 'json', '--model', model];
    if (tools.length) argv.push('--allowedTools', tools.join(','));
    if (cwd) argv.push('--add-dir', cwd);
    const p = spawnClaude(argv, { stdio: ['pipe', 'pipe', 'pipe'], cwd: cwd || os.tmpdir() });
    let out = '', err = '', t0 = Date.now();
    const tick = setInterval(() => { onTick && onTick((Date.now() - t0) / 1000); if (Date.now() - t0 > timeout) { p.kill('SIGTERM'); } }, 1000);
    p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (err += d));
    p.on('error', e => { clearInterval(tick); bad(new Error(e.code === 'ENOENT' ? 'Không tìm thấy lệnh "claude" (Claude Code CLI). Cài Claude Code rồi thử lại, hoặc chạy với --no-claude.' : e.message)); });
    p.on('close', code => {
      clearInterval(tick);
      if (Date.now() - t0 > timeout) return bad(new Error(`Claude trả lời quá ${Math.round(timeout / 1000)} giây — bỏ qua phần nhận xét AI.`));
      let r = null; try { r = JSON.parse(out); } catch {}
      const msg = String(r?.result || err || out);
      if (code !== 0 || r?.is_error) {
        if (/not logged in|\/login|invalid api key|authenticat|unauthorized|oauth token/i.test(msg)) return bad(new Error('Claude Code chưa đăng nhập. Mở Terminal, chạy "claude" một lần để đăng nhập rồi thử lại.'));
        if (/credit balance|usage limit|rate limit|quota/i.test(msg)) return bad(new Error('Tài khoản Claude đã hết lượt dùng tạm thời. Đợi một lúc rồi thử lại.'));
        return bad(new Error(`claude -p lỗi (mã ${code}): ${msg.slice(-300)}`));
      }
      ok(String(r ? r.result || '' : out));
    });
    p.stdin.end(prompt);
  });
}
export function parseJson(s) {
  s = String(s).replace(/^```(?:json)?\s*|```\s*$/gm, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('không có JSON');
  const body = s.slice(a, b + 1);
  try { return JSON.parse(body); } catch { return JSON.parse(body.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')); }
}
function pickStills(samples, issues, max = 14) {
  const want = [.5, 1.8, ...issues.map(i => i.t)];
  const pick = new Set();
  for (const t of want) { const s = samples.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), samples[0]); if (s) pick.add(s); if (pick.size >= max / 2) break; }
  const rest = samples.filter(s => !pick.has(s)), step = Math.max(1, rest.length / (max - pick.size));
  for (let k = 0; k < rest.length && pick.size < max; k += step) pick.add(rest[Math.floor(k)]);
  return [...pick].sort((a, b) => a.t - b.t);
}
function sceneSummary(tl, P) {
  const shown = {};
  for (const s of P.samples) for (const [i, o] of Object.entries(s.m.scenes)) if (o.words) shown[i] = shown[i] && shown[i].length > o.words.length ? shown[i] : o.words;
  const strs = o => { const out = []; const w = (v, k) => { if (typeof v === 'string' && /[\p{L}]{2}/u.test(v) && !/^(#|si:|var\(|rgba?\(|https?:)/.test(v) && !MEDIA_RE.test(v) && !/^[a-z0-9_\-]+$/.test(v) && !['type', 'icon', 'font', 'style', 'anim', 'kind', 'layout', 'id', 'mood', 'color'].includes(k)) out.push(v); else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) if (kk !== '_orig') w(vv, kk); }; w(o, ''); return [...new Set(out)].slice(0, 8); };
  return (tl.scenes || []).map((s, i) => s.hidden ? null : { id: `s${i}`, type: s.type, t0: r2(s.t0), t1: r2(s.t1), base: isBase(s, tl) || undefined, texts: strs(s), on_screen: shown[i] ? shown[i].slice(0, 160) : undefined }).filter(Boolean);
}
function buildPrompt(tl, caps, P, det, stills, styles) {
  const [DW, DH] = designOf(tl);
  const data = {
    size: `${DW}x${DH} (${isVert(tl) ? 'dọc 9:16' : 'ngang 16:9'})`, duration: tl.duration, pack: tl.pack, caption_style: tl.caption_style, title: tl.title || '', brand: tl.brand || null,
    scenes: sceneSummary(tl, P),
    captions: caps.map((c, k) => ({ id: `c${k}`, t: r2(c.t0), text: capText(c) })),
    music: (tl.audio?.music || []).map(m => ({ mood: m.mood || m.file, gain: m.gain })),
    auto_found: det.map(i => ({ t: i.t, kind: i.kind, msg: i.msg })),
  };
  return `Bạn là biên tập viên kiểm tra chất lượng (QC) video ngắn tiếng Việt cho TikTok/Reels/Shorts/YouTube, trước khi xuất bản.
Thư mục hiện tại có ảnh chụp các khung hình (render thật). DÙNG CÔNG CỤ Read để XEM các ảnh sau rồi mới nhận xét:
${stills.map(s => `- t=${s.t.toFixed(2)}s → ${path.basename(s.file)}`).join('\n')}

Dữ liệu timeline (JSON; id cảnh = "sN", id phụ đề = "cN"; toạ độ thiết kế ${DW}×${DH}px; "base" = lớp nền dài, không phải graphic):
${JSON.stringify(data)}

Hãy chấm (0–10) và tìm vấn đề về:
1. hook: 2 giây đầu có đủ mạnh để người xem dừng lướt không (chữ to, rõ, gây tò mò)?
2. readability: chữ có dễ đọc không (cỡ, tương phản, bị che, quá nhiều chữ cùng lúc)?
3. spelling: chính tả / thiếu dấu tiếng Việt / sai tên riêng trong CHỮ TRÊN MÀN HÌNH (graphic và phụ đề). Soi kỹ từng chữ có dấu.
4. variety: hình ảnh có đa dạng không hay lặp một kiểu?
5. pacing: nhịp graphic có đều không, có đoạn chết hay quá dày?
6. brand: màu/font/phong cách có nhất quán không?
"auto_found" là lỗi máy đã tự dò (đừng lặp lại trừ khi bạn có cách sửa tốt hơn).

Mỗi vấn đề có thể kèm MỘT bản sửa, CHỈ dùng các lệnh sau (sai lệnh sẽ bị bỏ):
{"op":"text","target":"s3","from":"chữ sai","to":"chữ đúng"}   sửa/viết lại chữ của cảnh sN hoặc phụ đề cN ("from" phải là đoạn chữ có thật; với phụ đề giữ nguyên số từ)
{"op":"move","target":"s3","dx":0,"dy":-120}                  dời graphic (px thiết kế)
{"op":"resize","target":"s3","scale":0.8}                     0.5–1.5
{"op":"retime","target":"s3","t0":4.2,"t1":6.0}                đổi thời gian (dài 0.6–10s)
{"op":"shorten","target":"s3","t1":5.5}                       cắt ngắn
{"op":"delete","target":"s3"}                                  bỏ cảnh (không bỏ lớp "base")
{"op":"caption_style","value":"…"}                              một trong: ${styles.join(', ')}
{"op":"gain","what":"music","db":-3}                           tăng/giảm nhạc nền (−12…+6 dB)
{"op":"hook","text":"…"}                                       câu hook mới cho 2 giây đầu (≤ 7 từ, có dấu, gây tò mò)

Chỉ trả về DUY NHẤT một object JSON (không markdown):
{"scores":{"hook":0,"readability":0,"spelling":0,"variety":0,"pacing":0,"brand":0},"summary":"2–3 câu tiếng Việt","issues":[{"t":1.2,"kind":"hook|readability|spelling|variety|pacing|brand|other","severity":"high|med|low","msg":"mô tả ngắn tiếng Việt","fix":{…} hoặc null}]}
Tối đa 10 issues, chỉ nêu vấn đề thật (video ổn thì để ít). Chính tả sai thì severity "high" và luôn kèm fix "text".`;
}
function validatePatch(f, tl, caps, styles) {
  if (!f || typeof f !== 'object') return null;
  const D = tl.duration || 0, sc = id => (/^s\d+$/.test(id || '') ? tl.scenes[+id.slice(1)] : null), cp = id => (/^c\d+$/.test(id || '') ? caps[+id.slice(1)] : null);
  const num = (v, a, b) => (Number.isFinite(+v) ? clamp(+v, a, b) : null);
  switch (f.op) {
    case 'text': {
      const from = String(f.from || ''), to = String(f.to || '').slice(0, Math.max(12, Math.ceil(from.length * 1.6) + 8));
      if (!from || !to || from === to) return null;
      const s = sc(f.target), c = cp(f.target);
      if (s) return JSON.stringify(s).includes(JSON.stringify(from).slice(1, -1)) ? { op: 'text', target: f.target, from, to } : null;
      if (c) { const n1 = from.trim().split(/\s+/).length, n2 = to.trim().split(/\s+/).length; return n1 === n2 && capText(c).toLowerCase().includes(from.toLowerCase()) ? { op: 'text', target: f.target, from, to } : null; }
      return null;
    }
    case 'move': { const s = sc(f.target); const dx = num(f.dx || 0, -900, 900), dy = num(f.dy || 0, -900, 900); return s && !isBase(s, tl) && (dx || dy) ? { op: 'move', target: f.target, dx, dy } : null; }
    case 'resize': { const s = sc(f.target), k = num(f.scale, .5, 1.5); return s && !isBase(s, tl) && k && k !== 1 ? { op: 'resize', target: f.target, scale: k } : null; }
    case 'retime': { const s = sc(f.target), a = num(f.t0, 0, D), b = num(f.t1, 0, D); return s && !isBase(s, tl) && a != null && b != null && b - a >= .6 && b - a <= 10 ? { op: 'retime', target: f.target, t0: r2(a), t1: r2(b) } : null; }
    case 'shorten': { const s = sc(f.target), b = num(f.t1, 0, D); return s && !isBase(s, tl) && b != null && b < s.t1 && b - s.t0 >= .6 ? { op: 'shorten', target: f.target, t1: r2(b) } : null; }
    case 'delete': { const s = sc(f.target); return s && !isBase(s, tl) ? { op: 'delete', target: f.target } : null; }
    case 'caption_style': return styles.includes(f.value) ? { op: 'caption_style', value: f.value } : null;
    case 'gain': { const d = num(f.db, -12, 6); return d && (tl.audio?.music || []).length ? { op: 'gain', what: 'music', db: r2(d) } : null; }
    case 'hook': { const t = String(f.text || '').trim().slice(0, 60); return t && t.split(/\s+/).length <= 9 ? { op: 'hook', text: t } : null; }
  }
  return null;
}

// ---------- fixes ----------
const mark = o => { o._qc = true; return o; };
function replaceStr(o, from, to) {
  let n = 0;
  const walk = x => { if (Array.isArray(x)) return x.forEach((v, i) => (typeof v === 'string' ? v.includes(from) && ((x[i] = v.split(from).join(to)), n++) : walk(v))); if (!x || typeof x !== 'object') return; for (const [k, v] of Object.entries(x)) { if (k === '_orig') continue; if (typeof v === 'string') { if (v.includes(from)) { x[k] = v.split(from).join(to); n++; } } else walk(v); } };
  walk(o); return n;
}
// Move/scale a scene via a constant keyframe (engine sceneFx: works for every module, scale around s.anchor).
function kfMove(s, dx, dy, k = 1, anchor) {
  if (s.kf?.length) { for (const key of s.kf) { key.x = r2((key.x || 0) + dx); key.y = r2((key.y || 0) + dy); key.scale = r2((key.scale ?? 1) * k * 1000) / 1000; } }
  else if (!dx && !dy && k === 1) { /* nothing to move */ }
  else { if (anchor) s.anchor = anchor.map(Math.round); s.kf = [{ t: s.t0, x: Math.round(dx), y: Math.round(dy), scale: Math.round(k * 1000) / 1000, ease: 'hold' }]; }
  mark(s);
}
// Font-size parameter of a scene (scaling it keeps the design editable in the Studio instead of a keyframe scale).
const sizeKey = s => (typeof s.size === 'number' ? 'size' : s.type === 'text' && s.lines?.length && s.lines.every(L => typeof (L.size ?? 48) === 'number') ? 'lines' : null);
function scaleSize(s, k) {
  if (sizeKey(s) === 'size') s.size = Math.max(14, Math.floor(s.size * k));
  else for (const L of s.lines) L.size = Math.max(14, Math.floor((L.size || 48) * k));
  mark(s);
}
// Find the smallest move/scale that puts box B inside `inside` while avoiding `avoid` boxes.
function solve(B, inside, avoid) {
  const c = { x: B.x + B.w / 2, y: B.y + B.h / 2 }; let best = null;
  const kFit = Math.min(1, inside.w / B.w, inside.h / B.h);
  const ks = [1, .92, .85, .78, .7, .62, .55].filter(k => k <= kFit + 1e-6); if (kFit < 1 && !ks.includes(kFit)) ks.unshift(Math.floor(kFit * 100) / 100);
  const steps = (lim, st = 8) => { const o = [0]; for (let d = st; d <= lim; d += st) o.push(d, -d); return o; };
  for (const k of ks.sort((a, b) => b - a)) {
    const w = B.w * k, h = B.h * k;
    if (w > inside.w || h > inside.h || k < .2) continue;
    for (const dy of steps(inside.h)) for (const dx of steps(inside.w * .3)) {
      const cost = Math.abs(dx) * 1.2 + Math.abs(dy) + (1 - k) * 700; if (best && cost >= best.cost) continue;
      const R = { x: c.x - w / 2 + dx, y: c.y - h / 2 + dy, w, h };
      if (R.x < inside.x || R.y < inside.y || R.x + R.w > inside.x + inside.w || R.y + R.h > inside.y + inside.h) continue;
      if (avoid.some(a => inter(R, a) > a.w * a.h * .06)) continue;
      best = { dx: Math.round(dx), dy: Math.round(dy), k, cost, anchor: [c.x, c.y] };
    }
  }
  return best;
}
function hookText(tl, caps, claudeHook) {
  if (claudeHook) return claudeHook;
  if (tl.title && tl.title.length <= 42) return tl.title;
  const w = []; for (const c of caps) { for (const x of c.words) w.push(x.w); if (w.length >= 6 || /[.!?]$/.test(capText(c))) break; }
  return w.slice(0, 6).join(' ');
}
const STOP = new Set('là và thì mà của các có được này đó rất một nó chúng ta tôi bạn cho với trong để khi đã sẽ lại cũng nhưng những cái thế nào gì ra vào lên đi nhé nha ạ à ừ ờ thôi rồi hay hoặc nếu vì nên do bị từ tới đến ở như'.split(' '));
const fitSize = (text, DW, max = 66) => Math.round(clamp(DW * .84 / (Math.max(4, text.length) * .6), 30, max));
function textScene(tl, t0, t1, text, y, style = 'yellow', anim = 'pop') {
  const [DW] = designOf(tl), T = text.toUpperCase(), w = T.split(/\s+/);
  const lines = T.length > 16 && w.length > 2 ? [w.slice(0, Math.ceil(w.length / 2)).join(' '), w.slice(Math.ceil(w.length / 2)).join(' ')] : [T];
  const size = Math.min(...lines.map(L => fitSize(L, DW)));
  return mark({ type: 'text', t0: r2(t0), t1: r2(t1), lines: lines.map((L, i) => ({ text: L, t: r2(t0 + .05 + i * .15), x: Math.round(DW / 2), y: Math.round(y + i * size * 1.12), size, style, anim, upper: false })) });
}
// y for a new text: above the face if there is room, else below it (and above the captions).
function freeY(tl, P, t0, t1) {
  const [DW, DH] = designOf(tl);
  const faces = P.samples.filter(s => s.face && s.t >= t0 - .5 && s.t <= t1 + .5).map(s => s.face), f = bbox(faces);
  if (!f) return DH * .2;
  return f.y > DH * .3 ? Math.max(DH * .12, f.y - DH * .08) : Math.min(DH * .62, f.y + f.h + DH * .07);
}

function applyClaude(tl, caps, patches, P) {
  const done = [];
  for (const p of patches) {
    const s = /^s\d+$/.test(p.target || '') ? tl.scenes[+p.target.slice(1)] : null, c = /^c\d+$/.test(p.target || '') ? caps[+p.target.slice(1)] : null;
    let ok = false;
    if (p.op === 'text' && s) ok = replaceStr(s, p.from, p.to) > 0 && !!mark(s);
    if (p.op === 'text' && c) {
      const A = p.from.trim().split(/\s+/), B = p.to.trim().split(/\s+/), W = c.words.map(w => w.w.toLowerCase());
      for (let i = 0; i + A.length <= W.length && !ok; i++) if (A.every((a, j) => W[i + j] === a.toLowerCase())) { B.forEach((b, j) => (c.words[i + j].w = b)); mark(c); ok = true; }
    }
    if (p.op === 'move' && s) { kfMove(s, p.dx, p.dy); ok = true; }
    if (p.op === 'resize' && s) { const b = bbox(P.samples.flatMap(x => (x.m.scenes[p.target.slice(1)]?.els || []).concat(x.m.scenes[p.target.slice(1)]?.texts || []))); kfMove(s, 0, 0, p.scale, b ? [b.x + b.w / 2, b.y + b.h / 2] : undefined); ok = true; }
    if (p.op === 'retime' && s) { const d = p.t0 - s.t0; for (const L of s.lines || []) if (typeof L.t === 'number') L.t = r2(L.t + d); s.t0 = p.t0; s.t1 = p.t1; mark(s); ok = true; }
    if (p.op === 'shorten' && s) { s.t1 = p.t1; mark(s); ok = true; }
    if (p.op === 'delete' && s) { s.hidden = true; mark(s); ok = true; }
    if (p.op === 'caption_style') { tl.caption_style = p.value; tl._qc_caption_style = true; ok = true; }
    if (p.op === 'gain') { for (const m of tl.audio.music || []) { m.gain = r2((m.gain ?? -20) + p.db); mark(m); } ok = true; }
    if (p.op === 'hook') {
      const h = tl.scenes.find(x => !x.hidden && !isBase(x, tl) && x.t0 < 1.5 && (x.text || x.lines?.[0]?.text));
      if (h) { if (h.text) { const L0 = h.text.length; h.text = h.text === h.text.toUpperCase() ? p.text.toUpperCase() : p.text; if (typeof h.size === 'number' && h.text.length > L0) h.size = Math.max(30, Math.round(h.size * L0 / h.text.length)); } else h.lines[0].text = p.text.toUpperCase(); if (h.lines?.[0] && h.type === 'text') h.lines[0].size = fitSize(h.lines[0].text, designOf(tl)[0]); mark(h); }
      else tl.scenes.push(textScene(tl, .05, Math.min(2.4, tl.duration), p.text, freeY(tl, P, 0, 2.4)));
      ok = true;
    }
    if (ok) done.push(p);
  }
  return done;
}
function applyDeterministic(tl, caps, issues, P, touched) {
  const [DW, DH] = designOf(tl), fixed = new Set(), M = { x: 20, y: 24, w: DW - 40, h: DH - 48 };
  const sceneRects = i => P.samples.filter(s => s.m.scenes[i]).map(s => ({ t: s.t, face: s.face, cap: s.m.cap ? bbox(s.m.cap.texts) : null, rects: [...s.m.scenes[i].els, ...s.m.scenes[i].texts] }));
  // 1. per-scene placement (text off canvas, face covered, caption covered) — one solve per scene
  const byScene = {};
  for (const is of issues) if (['text_offcanvas', 'face_cover', 'caption_overlap'].includes(is.kind) && /^s\d+$/.test(is.target || '')) (byScene[is.target] = byScene[is.target] || []).push(is);
  for (const [id, list] of Object.entries(byScene)) {
    const i = +id.slice(1), s = tl.scenes[i];
    const qcKf = s.kf?.length === 1 && s._qc && s.kf[0].ease === 'hold'; // a keyframe QC (or a Claude move) added: can be adjusted again
    if (!s || touched.has(id) || (s.kf?.length && !qcKf) || s._orig) continue;
    const R = sceneRects(i), B = bbox(R.flatMap(r => r.rects).filter(r => r.s == null || r.s.length >= 1));
    if (!B) continue;
    const avoid = [];
    if (list.some(x => x.kind === 'face_cover')) avoid.push(...R.filter(r => r.face && speakingAt(caps, r.t)).map(r => r.face));
    const capB = bbox(R.map(r => r.cap).filter(Boolean));
    if (capB && list.some(x => x.kind === 'caption_overlap')) avoid.push(grow(capB, 6));
    // don't push it onto the base layer's own small furniture (logo badge, progress pill…)
    const seen = new Set();
    for (const smp of P.samples.filter(x => x.m.scenes[i])) for (const [j, o] of Object.entries(smp.m.scenes)) if (tl.scenes[j] && isBase(tl.scenes[j], tl))
      for (const r of o.els) { const k = [r.x, r.y, r.w, r.h].map(Math.round).join(','); if (r.w * r.h < DW * DH * .12 && !seen.has(k)) { seen.add(k); avoid.push(r); } }
    const sol = solve(B, M, avoid);
    const minK = sizeKey(s) ? Math.min(1, 30 / Math.max(...(sizeKey(s) === 'size' ? [s.size] : s.lines.map(L => L.size || 48)))) : .55;
    if ((!sol || (sol.k < Math.max(.55, minK) && !(sizeKey(s) && sol.k >= minK))) && list.some(x => x.kind === 'text_offcanvas')) {
      // too long to shrink readably: reflow a plain one-line text graphic into a 2-line text at the same height
      if (typeof s.text === 'string' && s.text.length > 6 && s.type !== 'text') {
        s.hidden = true; mark(s);
        tl.scenes.push(textScene(tl, s.t0, s.t1, s.text, clamp(B.y + B.h / 2 - 30, DH * .1, DH * .7), 'yellow', 'pop'));
        list.forEach(x => { x.fix = { op: 'reflow', text: s.text }; fixed.add(x); });
      } else list.forEach(x => (x.note = 'chữ quá dài — cần viết ngắn lại'));
      continue;
    }
    if (sol && (sol.dx || sol.dy || sol.k !== 1)) { if (sol.k !== 1 && sizeKey(s)) { scaleSize(s, sol.k); kfMove(s, sol.dx, sol.dy, 1, sol.anchor); } else kfMove(s, sol.dx, sol.dy, sol.k, sol.anchor); list.forEach(x => { x.fix = { op: 'move', dx: sol.dx, dy: sol.dy, scale: sol.k }; fixed.add(x); }); }
    else if (list.some(x => x.kind === 'caption_overlap') && s.t1 - s.t0 <= 3.5) { s.hideCaptions = true; mark(s); list.filter(x => x.kind === 'caption_overlap').forEach(x => { x.fix = { op: 'hide_captions' }; fixed.add(x); }); }
  }
  // caption off canvas → captions back to the style default position (drop manual y), then smaller words via split
  for (const is of issues.filter(x => x.kind === 'text_offcanvas' && /^c\d+$/.test(x.target || ''))) { const c = caps[+is.target.slice(1)]; if (c && c.words.length > 3) { c._qc_split = true; is.fix = { op: 'split_caption' }; fixed.add(is); } }
  // 2. same-layer overlaps → trim the earlier scene
  for (const is of issues.filter(x => x.kind === 'overlap')) {
    const a = tl.scenes[+is.target.slice(1)], b = tl.scenes[+is.other.slice(1)];
    if (!a || !b || touched.has(is.target) || a._orig) continue;
    if (b.t0 - .05 - a.t0 >= .8) { a.t1 = r2(b.t0 - .05); mark(a); is.fix = { op: 'shorten', target: is.target, t1: a.t1 }; fixed.add(is); }
    else if (!b._orig) { (a.t1 - a.t0 < b.t1 - b.t0 ? a : b).hidden = true; mark(a); mark(b); is.fix = { op: 'delete' }; fixed.add(is); }
  }
  // 3. missing media → hide the scene / drop the sfx
  for (const is of issues.filter(x => x.kind === 'missing_media')) {
    if (/^s\d+$/.test(is.target || '')) { const s = tl.scenes[+is.target.slice(1)]; if (s && !isBase(s, tl)) { s.hidden = true; mark(s); is.fix = { op: 'delete' }; fixed.add(is); } }
    if (/^a\d+$/.test(is.target || '')) { const x = tl.audio.sfx[+is.target.slice(1)]; if (x) { x._qc_drop = true; is.fix = { op: 'drop_sfx' }; fixed.add(is); } }
  }
  if (tl.audio?.sfx) tl.audio.sfx = tl.audio.sfx.filter(x => !x._qc_drop);
  // 4. hook missing → hook text (Claude's hook if any)
  for (const is of issues.filter(x => x.kind === 'hook_missing')) {
    // an opening overlay whose text became too small to work as a hook (shrunk to fit) → replace it by a big 2-line text
    const h = (tl.scenes || []).find(x => !x.hidden && !isBase(x, tl) && x.t0 < 1.5 && x.type !== 'text' && typeof x.text === 'string' && x.text.length > 3);
    if (touched.has('hook') && !h && !is.recheck) { fixed.add(is); continue; }
    const txt = h ? h.text : hookText(tl, caps, null); if (!txt) continue;
    if (h) { h.hidden = true; mark(h); }
    tl.scenes.push(textScene(tl, .05, Math.min(2.4, tl.duration), txt, freeY(tl, P, 0, 2.4)));
    tl.fx = [...(tl.fx || []), mark({ t: .05, type: 'punch' })];
    is.fix = { op: 'hook', text: txt }; fixed.add(is);
  }
  // 5. long dead stretch → keyword pop (caption words near the middle of the gap) + punch
  for (const is of issues.filter(x => x.kind === 'empty')) {
    if ((tl.scenes || []).some(s => !s.hidden && !isBase(s, tl) && s.t0 > is.t + .5 && s.t0 < is.t1 - .5)) { is.fix = { op: 'filled', t: r2(tl.scenes.find(s => !s.hidden && !isBase(s, tl) && s.t0 > is.t + .5 && s.t0 < is.t1 - .5).t0) }; fixed.add(is); continue; } // already filled (e.g. a Claude retime); the re-check confirms
    // the most "contentful" caption in the gap (highlighted words, long non-filler words), nearer the middle wins ties
    const mid = (is.t + is.t1) / 2, cand = caps.filter(c => !c.hidden && c.t0 > is.t + .8 && c.t0 < is.t1 - 2);
    const val = c => c.words.reduce((a, w) => a + (w.hl ? 3 : 0) + (STOP.has(w.w.toLowerCase()) ? -1 : w.w.length >= 4 ? 1.2 : .4), 0) - Math.abs((c.t0 + c.t1) / 2 - mid) * .15;
    const splits = cand.filter(c => c.t0 - is.t < 5.8 && is.t1 - c.t0 - 2 < 5.8); // both halves of the gap end up < 6 s
    const c = (splits.length ? splits : cand).sort((a, b) => val(b) - val(a))[0];
    if (!c) continue;
    let ws = c.words.map(w => w.w); while (ws.length > 1 && STOP.has(ws[0].toLowerCase())) ws.shift(); while (ws.length > 1 && STOP.has(ws[ws.length - 1].toLowerCase())) ws.pop();
    const k0 = c.words.findIndex(w => w.w === ws[0]), t0 = c.words[Math.max(0, k0)].s, txt = ws.slice(0, 4).join(' ');
    tl.scenes.push(textScene(tl, t0, Math.min(t0 + 2, is.t1 - .05), txt, freeY(tl, P, t0, t0 + 2), 'white', 'slide_l'));
    tl.fx = [...(tl.fx || []), mark({ t: r2(t0), type: 'punch' })];
    is.fix = { op: 'add_text', text: txt, t: r2(t0) }; fixed.add(is);
  }
  // 6. music masking speech → lower the music bed
  for (const is of issues.filter(x => x.kind === 'music_masking')) if (!touched.has('gain')) { for (const m of tl.audio.music || []) { m.gain = r2((m.gain ?? -20) - is.need_db); mark(m); } is.fix = { op: 'gain', db: -is.need_db }; fixed.add(is); }
  // 7. captions longer than 5 words (or off canvas) → split into ≤ 4-word lines, timing from the words
  const split = [];
  caps.forEach((c, k) => { if ((c.words.length > 5 || c._qc_split) && !c.hidden) split.push(k); delete c._qc_split; });
  for (const k of split.reverse()) {
    const c = caps[k], n = Math.ceil(c.words.length / (c.words.length > 5 ? 4 : Math.ceil(c.words.length / 2))), per = Math.ceil(c.words.length / n), parts = [];
    for (let i = 0; i < c.words.length; i += per) { const w = c.words.slice(i, i + per); parts.push(mark({ ...deep(c), t0: r2(i ? w[0].s : c.t0), t1: r2(i + per >= c.words.length ? c.t1 : c.words[i + per].s), words: w })); }
    for (const p of parts) for (const w of p.words) delete w.br;
    caps.splice(k, 1, ...parts);
  }
  for (const is of issues.filter(x => x.kind === 'caption_long')) { is.fix = { op: 'split_caption' }; fixed.add(is); }
  return fixed;
}

// ---------- report helpers ----------
// Score 0–100: auto issues by severity (a repeated kind counts at most twice), Claude issues lighter and capped at 30,
// skipping Claude remarks that repeat an auto finding at the same moment.
function score(list) {
  const open = list.filter(i => !i.fixed), auto = open.filter(i => i.src !== 'claude'), perKind = {};
  let pen = 0;
  for (const i of auto) { const k = perKind[i.kind] = (perKind[i.kind] || 0) + 1; if (k <= 2) pen += WEIGHT[i.severity] || 3; }
  let c = 0;
  for (const i of open.filter(i => i.src === 'claude')) if (!auto.some(a => Math.abs(a.t - i.t) < 1)) c += { high: 8, med: 4, low: 1.5 }[i.severity] || 1.5;
  return Math.round(clamp(100 - pen - Math.min(30, c), 0, 100));
}
const same = (a, b) => a.kind === b.kind && (a.target || '') === (b.target || '') && Math.abs((a.t || 0) - (b.t || 0)) < 1.5;
async function sheet(files, out, vert) {
  if (!files.length) return null;
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qcsheet_'));
  files.forEach((f, i) => fs.copyFileSync(f, path.join(d, `${String(i).padStart(4, '0')}.jpg`)));
  const cols = vert ? Math.min(6, files.length) : Math.min(4, files.length), rows = Math.ceil(files.length / cols);
  try { await runP('ffmpeg', ['-v', 'error', '-y', '-i', path.join(d, '%04d.jpg'), '-vf', `scale=${vert ? 200 : 320}:-2,pad=iw+6:ih+6:3:3:color=0x111111,tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '4', out]); return out; }
  catch (e) { console.error('[qc] contact sheet:', e.message.slice(0, 200)); return null; }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}

// ---------- main ----------
export async function runQC(src, o = {}) {
  const proj = loadProject(src), { dir } = proj;
  let { tl, caps } = proj;
  const qcDir = path.join(dir, '.studio/qc'), stillDir = path.join(qcDir, 'stills');
  fs.rmSync(stillDir, { recursive: true, force: true }); fs.mkdirSync(stillDir, { recursive: true });
  const hash = crypto.createHash('sha1').update(JSON.stringify({ s: tl.scenes, c: caps, a: tl.audio, cs: tl.caption_style })).digest('hex').slice(0, 16);
  say(.02, 'Kiểm tra timeline (chồng lớp, khoảng trống, phụ đề, file thiếu)');
  const stat = staticIssues(tl, caps, dir);
  say(.06, 'Render ảnh kiểm tra bằng engine (1 Chrome)');
  const E = await openEngine(dir);
  let result;
  try {
    const P = await domPass(E, tl, caps, sampleTimes(tl, caps), stillDir, 'a', k => say(.06 + k * .3, `Render & đo khung hình… ${Math.round(k * 100)}%`));
    const dom = domIssues(tl, caps, P);
    for (const f of P.failed) { const rel = path.relative(dir, f.url); if (!stat.some(i => i.kind === 'missing_media' && i.file === rel)) stat.push({ t: r2(f.t ?? 0), kind: 'missing_media', severity: 'high', target: null, file: rel, msg: `Engine không tải được ${rel}` }); }
    let audio = { issues: [], stats: null };
    if (!o.noAudio) { say(.4, 'Trộn thử âm thanh, đo LUFS / nhạc át giọng'); try { audio = await audioPass(tl, dir, qcDir); } catch (e) { console.error('[qc] audio:', e.message.slice(0, 300)); } }
    let det = [...stat, ...dom, ...audio.issues].map(i => ({ ...i, src: 'auto' }));
    det.sort((a, b) => a.t - b.t);
    // Claude review
    let claude = { used: false }, patches = [];
    const styles = await E.page.evaluate(() => Object.keys(CAPTION_STYLES).concat(['slate'])).then(a => [...new Set(a)]);
    if (!o.noClaude) {
      const cache = path.join(qcDir, 'claude.json');
      const c0 = fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, 'utf8')) : null;
      if (c0 && c0.hash === hash && !o.fresh) { claude = c0.claude; say(.75, 'Dùng lại nhận xét Claude của lần kiểm tra trước (timeline chưa đổi)'); }
      else {
        const pick = pickStills(P.samples, det), revDir = path.join(qcDir, 'review');
        fs.rmSync(revDir, { recursive: true, force: true }); fs.mkdirSync(revDir, { recursive: true });
        const stills = pick.map(s => { const f = path.join(revDir, `t${s.t.toFixed(2).padStart(6, '0')}.jpg`); fs.copyFileSync(s.file, f); return { t: s.t, file: f }; });
        const prompt = buildPrompt(tl, caps, P, det, stills, styles);
        fs.writeFileSync(path.join(qcDir, 'claude_prompt.txt'), prompt);
        try {
          say(.45, `Claude xem ${stills.length} khung hình và nhận xét (30–120 giây)`);
          const raw = await askClaude(prompt, { model: o.model || 'sonnet', cwd: revDir, tools: ['Read'], onTick: s => say(.45 + .3 * (1 - Math.exp(-s / 60)), `Claude đang xem video… ${Math.round(s)}s`) });
          fs.writeFileSync(path.join(qcDir, 'claude_raw.txt'), raw);
          const j = parseJson(raw);
          const issues = (Array.isArray(j.issues) ? j.issues : []).slice(0, 12).map(x => ({
            t: r2(clamp(+x.t || 0, 0, tl.duration || 0)), kind: KIND_VI[x.kind] ? x.kind : 'other', severity: ['high', 'med', 'low'].includes(x.severity) ? x.severity : 'low',
            msg: String(x.msg || '').slice(0, 300), fix: validatePatch(x.fix, tl, caps, styles), proposed: x.fix || null, src: 'claude' }));
          claude = { used: true, model: o.model || 'sonnet', scores: j.scores || {}, summary: String(j.summary || '').slice(0, 600), issues, stills: stills.map(s => path.relative(dir, s.file)) };
          fs.writeFileSync(cache, JSON.stringify({ hash, claude }, null, 1));
        } catch (e) { claude = { used: false, error: e.message }; console.error('[qc] Claude: ' + e.message); }
      }
    }
    const cIssues = (claude.issues || []).map(i => ({ ...i }));
    const before = [...det, ...cIssues];
    const scoreBefore = score(before);
    let after = null, compare = [], backup = null, applied = [];
    if (o.fix) {
      say(.78, 'Sao lưu rồi tự sửa');
      fs.mkdirSync(qcDir, { recursive: true });
      backup = path.join(dir, '.studio/qc_backup.json');
      fs.writeFileSync(backup, JSON.stringify({ created: new Date().toISOString(), timeline: proj.tl, captions: proj.caps }));
      fs.copyFileSync(backup, path.join(qcDir, `backup_${Date.now()}.json`));
      tl = deep(tl); caps = deep(caps);
      // Claude's move/resize on a scene the measured solver will place anyway (face/caption/canvas aware) is superseded by the solver
      const autoPlaced = new Set(det.filter(i => ['text_offcanvas', 'face_cover', 'caption_overlap'].includes(i.kind)).map(i => i.target));
      const superseded = cIssues.filter(i => i.fix && ['move', 'resize'].includes(i.fix.op) && autoPlaced.has(i.fix.target));
      patches = cIssues.filter(i => i.fix && !superseded.includes(i)).map(i => i.fix);
      applied = applyClaude(tl, caps, patches, P);
      for (const i of cIssues) if (i.fix && applied.includes(i.fix)) i.fixed = true;
      const touched = new Set(applied.map(p => (p.op === 'hook' ? 'hook' : p.op === 'gain' ? 'gain' : ['move', 'resize', 'delete', 'retime', 'text'].includes(p.op) ? p.target : null)).filter(Boolean));
      const fixedDet = applyDeterministic(tl, caps, det, P, touched);
      for (const i of det) if (fixedDet.has(i)) i.fixed = true;
      // re-check on the patched timeline (stills at the same times + every issue time); a 2nd placement round uses the new boxes
      const issueTimes = before.flatMap(i => [i.t, (i.fix?.t ?? i.fix?.t0) != null ? (i.fix.t ?? i.fix.t0) + .6 : null]).filter(x => x != null);
      let P2 = null, recheck = [];
      const PLACE = new Set(['text_offcanvas', 'face_cover', 'caption_overlap', 'hook_missing']);
      for (let round = 0; round < 3; round++) {
        say(.8 + round * .05, round ? 'Sửa vị trí lần 2 rồi kiểm tra lại' : 'Kiểm tra lại sau khi sửa');
        P2 = await domPass(E, tl, caps, sampleTimes(tl, caps, issueTimes), stillDir, 'b', k => say(.8 + round * .05 + k * .04, `Kiểm tra lại… ${Math.round(k * 100)}%`));
        recheck = [...staticIssues(tl, caps, dir), ...domIssues(tl, caps, P2)].map(i => ({ ...i, src: 'auto' }));
        const again = recheck.filter(r => PLACE.has(r.kind));
        if (round === 2 || !again.length) break;
        const keep = new Set(applied.filter(p => p.op === 'delete').map(p => p.target));
        for (const r of again) r.recheck = true;
        if (!applyDeterministic(tl, caps, again, P2, keep).size) break;
        for (const r of again) if (r.fix) { const orig = det.find(i => same(i, r)); if (orig) { orig.fix = r.fix; orig.fixed = true; } }
      }
      let a2 = { issues: [] };
      if (!o.noAudio && (applied.some(p => p.op === 'gain') || det.some(i => i.kind === 'music_masking' && i.fixed))) { try { a2 = await audioPass(tl, dir, qcDir); audio.after = a2.stats; } catch {} }
      else a2.issues = audio.issues.filter(i => !i.fixed);
      recheck.push(...a2.issues.map(i => ({ ...i, src: 'auto' })));
      // an auto issue counts as fixed only if the re-check no longer finds it
      for (const i of det) if (i.fixed && recheck.some(r => same(r, i))) { i.fixed = false; i.note = i.note || 'đã thử sửa nhưng kiểm tra lại vẫn còn'; }
      for (const i of det) if (!i.fixed && PLACE.has(i.kind) && !recheck.some(r => same(r, i)) && touched.has(i.target)) i.fixed = true; // solved by a Claude patch
      for (const i of superseded) if (det.some(d => d.target === i.fix.target && d.fixed)) { i.fixed = true; i.note = 'dời bằng bộ xếp chỗ tự động (tránh mặt, phụ đề, logo)'; }
      const remaining = recheck.filter(r => !det.some(i => same(r, i))).map(r => ({ ...r, new: true }));
      after = score([...det.filter(i => !i.fixed), ...remaining, ...cIssues.filter(i => !i.fixed)]);
      det.push(...remaining.filter(r => r.kind !== 'text_unsafe'));
      // before/after stills for every fixed item
      const near = (S, t) => S.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), S[0]);
      const pairs = [];
      for (const i of [...det, ...cIssues].filter(i => i.fixed)) { const ft = i.fix?.t ?? i.fix?.t0, tt = ft != null ? ft + .6 : i.t, b = near(P.samples, tt), a = near(P2.samples, tt); if (b && a && !pairs.some(p => p.b === b.file)) pairs.push({ t: tt, kind: i.kind, b: b.file, a: a.file }); }
      compare = pairs.slice(0, 10).map(p => ({ t: p.t, kind: p.kind, before: path.relative(dir, p.b), after: path.relative(dir, p.a) }));
      if (pairs.length) await sheet(pairs.slice(0, 8).flatMap(p => [p.b, p.a]), path.join(qcDir, 'compare.jpg'), isVert(tl));
      saveProject(proj, tl, caps);
    }
    say(.95, 'Ghép ảnh tổng quan');
    const aStills = fs.readdirSync(stillDir).filter(f => f.startsWith('a_')).sort().map(f => path.join(stillDir, f));
    await sheet(aStills.filter((f, i) => i % Math.max(1, Math.ceil(aStills.length / 24)) === 0), path.join(qcDir, 'sheet.jpg'), isVert(proj.tl));
    const issues = [...det, ...cIssues].sort((a, b) => a.t - b.t).map(i => ({ t: i.t, kind: i.kind, kind_vi: KIND_VI[i.kind] || i.kind, severity: i.severity, msg: i.msg, fixed: !!i.fixed,
      src: i.src, target: i.target || undefined, fix: i.fix || undefined, note: i.note || undefined, new: i.new || undefined }));
    result = {
      version: 1, project: dir, created: new Date().toISOString(), hash, fix: !!o.fix,
      score: after ?? scoreBefore, before: scoreBefore, after,
      counts: { total: issues.length, fixed: issues.filter(i => i.fixed).length, high: issues.filter(i => i.severity === 'high' && !i.fixed).length },
      claude: { used: !!claude.used, model: claude.model, scores: claude.scores, summary: claude.summary, error: claude.error },
      audio: audio.stats, issues, applied, backup: backup ? path.relative(dir, backup) : undefined,
      sheet: fs.existsSync(path.join(qcDir, 'sheet.jpg')) ? '.studio/qc/sheet.jpg' : undefined,
      compare_sheet: o.fix && fs.existsSync(path.join(qcDir, 'compare.jpg')) ? '.studio/qc/compare.jpg' : undefined, compare,
      stills: aStills.map(f => ({ t: +/_t([\d.]+)\.jpg$/.exec(f)[1], file: path.relative(dir, f) })),
      page_errors: E.errors.slice(0, 10),
    };
  } finally { await E.browser.close().catch(() => {}); }
  fs.writeFileSync(path.join(dir, '.studio/qc.json'), JSON.stringify(result, null, 1));
  return result;
}

async function main() {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const src = args.find((a, i) => !a.startsWith('--') && !(i > 0 && ['--model'].includes(args[i - 1])));
  if (!src) { console.error('usage: node scripts/ai_qc.mjs <project_dir> [--fix] [--model sonnet] [--no-claude] [--no-audio] [--fresh]'); process.exit(2); }
  const r = await runQC(src, { fix: args.includes('--fix'), model: opt('--model', 'sonnet'), noClaude: args.includes('--no-claude'), noAudio: args.includes('--no-audio'), fresh: args.includes('--fresh') });
  for (const i of r.issues) console.log(`${i.fixed ? '✔' : '•'} ${i.t.toFixed(2).padStart(6)}s [${i.severity}] ${i.kind_vi}: ${i.msg}${i.fixed ? ' → đã sửa' : ''}${i.note ? ` (${i.note})` : ''}`);
  if (r.claude.summary) console.log(`Claude: ${r.claude.summary}`);
  console.log(`điểm: ${r.before}${r.after != null ? ` → ${r.after}` : ''}/100 · ${r.counts.total} vấn đề, đã sửa ${r.counts.fixed} · ${path.join(r.project, '.studio/qc.json')}`);
  say(1, 'Xong');
  process.exit(0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
