// Batch: one template (or project) × a spreadsheet → one project folder + MP4 per row. Spec: references/batch-brands-publish.md
//
// usage:
//   node scripts/batch.mjs <template-id | template.json | project_dir> <sheet.csv|.xlsx> <out_dir>
//        [--map mapping.json] [--brand <brand-id>] [--voice auto|tts|none|beat] [--quality 720|1080] [--dur 12] [--rows 1,2|1-3]
//   node scripts/batch.mjs --job <out_dir>/job.json                 (what Studio runs; resumable: finished rows are skipped)
//   node scripts/batch.mjs --job job.json --preview <row> [--t 3] --out still.jpg   (still of one row, no audio, small size)
//   node scripts/batch.mjs --parse <sheet>                          (columns + rows as JSON)
//   node scripts/batch.mjs --targets <template-id | project_dir>    (mappable placeholders / texts / media)
//
// Mapping keys: "p:<placeholder>" ({{placeholder}} anywhere in the JSON), "t:<exact text in the template>", "m:<media/… path>",
// "f:<field>" (title, file_name, script, video, images, dur, brand.name|phone|website|handle|outro). Value = column name.
// Progress lines on stdout: "@@ {json}" (status.json in out_dir has the full per-row state).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { findChrome, linkPath, pyBin } from './platform.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..');
const PY = pyBin(HERE);
export const AVS_HOME = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
const IMG = /\.(jpe?g|png|webp|gif)$/i, VID = /\.(mp4|mov|m4v|webm|mkv)$/i;

// ---------- spreadsheet ----------
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const d = [',', ';', '\t'].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('không phải file .xlsx (zip) hợp lệ');
  const n = buf.readUInt16LE(e + 10), files = new Map();
  for (let i = 0, p = buf.readUInt32LE(e + 16); i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl); p += 46 + nl + xl + cl;
    const at = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28), data = buf.subarray(at, at + size);
    files.set(name, method === 8 ? zlib.inflateRawSync(data) : data);
  }
  return files;
}
const unxml = s => s.replace(/&(lt|gt|quot|apos|amp|#x?[0-9a-f]+);/gi, (m, k) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[k.toLowerCase()] ?? (k[1] === 'x' || k[1] === 'X' ? String.fromCodePoint(parseInt(k.slice(2), 16)) : String.fromCodePoint(+k.slice(1))));
const tText = x => [...x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => unxml(m[1])).join('');
// Minimal .xlsx reader (first sheet; shared/inline strings, numbers, booleans). Dates come out as Excel serial numbers.
export function parseXLSX(buf) {
  const z = unzip(buf), s = n => z.get(n)?.toString('utf8') || '';
  const shared = [...s('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => tText(m[1]));
  const rid = /<sheet\b[^>]*r:id="([^"]+)"/.exec(s('xl/workbook.xml'))?.[1];
  const rel = rid && new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"|<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(s('xl/_rels/workbook.xml.rels'));
  let sheet = rel ? (rel[1] || rel[2]).replace(/^\/?(xl\/)?/, 'xl/') : 'xl/worksheets/sheet1.xml';
  if (!z.has(sheet)) sheet = [...z.keys()].find(k => /^xl\/worksheets\/[^/]+\.xml$/.test(k));
  const rows = [];
  for (const r of s(sheet).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(c[1])?.[1], t = /t="([^"]+)"/.exec(c[1])?.[1], inner = c[2] || '';
      const col = ref ? [...ref].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : row.length;
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let val = '';
      if (t === 's') val = shared[+v] ?? '';
      else if (t === 'inlineStr') val = tText(inner);
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (v != null) val = t === 'str' || t === 'e' ? unxml(v) : String(+v === +v ? +(+v).toPrecision(15) : unxml(v));
      row[col] = val;
    }
    rows.push(Array.from(row, x => x ?? ''));
  }
  return rows;
}
export function parseSheet(file) {
  const buf = fs.readFileSync(file);
  const raw = /\.xlsx$/i.test(file) || buf.readUInt32LE(0) === 0x04034b50 ? parseXLSX(buf) : parseCSV(buf.toString('utf8'));
  const lines = raw.filter(r => r.some(c => String(c).trim() !== ''));
  if (!lines.length) throw new Error('bảng tính trống');
  const columns = lines[0].map((c, i) => String(c).trim() || `cot_${i + 1}`);
  const rows = lines.slice(1).map(r => Object.fromEntries(columns.map((c, i) => [c, String(r[i] ?? '').trim()])));
  return { columns, rows };
}

// ---------- sources & targets ----------
export function loadSource(src) {
  if (src.kind === 'project') {
    const dir = path.resolve(src.dir), tlFile = dir.endsWith('.json') ? dir : path.join(dir, 'timeline.json');
    return { kind: 'project', dir: path.dirname(tlFile), tlFile, doc: JSON.parse(fs.readFileSync(tlFile, 'utf8')) };
  }
  const f = [src.file, path.join(SKILL, 'templates', `${src.id}.json`), path.join(SKILL, 'templates/user', `${src.id}.json`)].find(x => x && fs.existsSync(x));
  if (!f) throw new Error(`không thấy template ${src.id || src.file}`);
  return { kind: 'template', file: f, doc: JSON.parse(fs.readFileSync(f, 'utf8')) };
}
const SKIPK = /^(type|mode|icon|icons|trans|transition|font|disp|kind|anim|style|align|shape|ease|fit|pos|side|dir|layout|variant|theme|preset|caption_style|pack|id|cid|mood|color|bg|tint|accent|primary|dark|light|frames|seq|cutouts|audio|voice|mix|si|emoji|unit|lang|easing|blend|template|palette|motion|sfx|name)$/;
const isMedia = s => /^media\//.test(s) || (IMG.test(s) || VID.test(s)) && !/\s/.test(s);
export const FIELDS = [
  ['title', 'Tiêu đề (intro)'], ['file_name', 'Tên file xuất'], ['script', 'Lời đọc (giọng AI)'], ['video', 'Video người nói'],
  ['images', 'Danh sách ảnh (cách nhau |)'], ['dur', 'Độ dài (giây)'], ['brand.name', 'Thương hiệu: tên'], ['brand.phone', 'Thương hiệu: SĐT'],
  ['brand.website', 'Thương hiệu: website'], ['brand.handle', 'Thương hiệu: kênh'], ['brand.outro', 'Thương hiệu: câu kết'],
];
export function targetsOf(doc) {
  const out = [], seen = new Set(), add = (key, label, kind, sample) => { if (!seen.has(key)) { seen.add(key); out.push({ key, label, kind, sample }); } };
  const { desc, needs, name, tags, preview, ...live } = doc;
  for (const m of JSON.stringify(live).matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) add('p:' + m[1], `{{${m[1]}}}`, 'placeholder', '');
  for (const [k, l] of FIELDS) add('f:' + k, l, 'field', k === 'title' ? doc.title || '' : k.startsWith('brand.') ? doc.brand?.[k.slice(6)] || '' : '');
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (isMedia(v)) return add('m:' + v, path.basename(v), 'media', v);
      if (key && SKIPK.test(key)) return;
      if (/\p{L}|\d/u.test(v) && !/^#[0-9a-f]{3,8}$/i.test(v) && !/^(si|ti|emoji):/.test(v) && !/\{\{/.test(v) && v.length < 200) add('t:' + v, v, 'text', v);
    } else if (Array.isArray(v)) v.forEach(x => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) walk(x, k);
  };
  walk(doc.scenes || []); walk(doc.clips || []);
  return out;
}
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const GUESS = {
  'f:title': ['title', 'tieu_de', 'ten', 'ten_du_an', 'ten_san_pham', 'du_an'], 'f:file_name': ['file_name', 'ten_file', 'ma', 'id'],
  'f:script': ['script', 'loi_doc', 'kich_ban', 'noi_dung_doc', 'voice'], 'f:video': ['video', 'clip', 'video_path'],
  'f:images': ['images', 'anh', 'hinh', 'danh_sach_anh'], 'f:dur': ['dur', 'thoi_luong', 'duration'],
  'f:brand.name': ['brand', 'thuong_hieu', 'moi_gioi', 'ten_moi_gioi', 'shop'], 'f:brand.phone': ['sdt', 'phone', 'dien_thoai', 'so_dien_thoai', 'hotline'],
  'f:brand.website': ['website', 'web', 'link'], 'f:brand.handle': ['handle', 'kenh', 'tiktok'], 'f:brand.outro': ['outro', 'cau_ket', 'loi_ket'],
};
export function autoMap(targets, columns) {
  const map = {}, by = Object.fromEntries(columns.map(c => [norm(c), c]));
  for (const t of targets) {
    if (t.kind === 'placeholder') { const c = by[norm(t.key.slice(2))]; if (c) map[t.key] = c; }
    if (t.kind === 'field') { const c = (GUESS[t.key] || []).map(g => by[g]).find(Boolean); if (c) map[t.key] = c; }
  }
  const imgCols = columns.filter(c => /^(anh|hinh|image|img|photo)_?\d+$/.test(norm(c)));
  targets.filter(t => t.kind === 'media' && IMG.test(t.sample)).forEach((t, i) => { if (imgCols[i]) map[t.key] = imgCols[i]; });
  return map;
}

// ---------- brand kits (~/.ai-video-studio/brands.json, managed by studio/routes/51_brands.mjs) ----------
export function loadBrand(id) {
  if (!id) return null;
  if (typeof id === 'object') return id;
  try { return JSON.parse(fs.readFileSync(path.join(AVS_HOME, 'brands.json'), 'utf8')).brands.find(b => b.id === id) || null; } catch { return null; }
}
// TL.brand fields of a kit; the logo file is copied into <dir>/media/.
export function brandFields(kit, dir) {
  if (!kit) return {};
  const b = {};
  for (const k of ['primary', 'accent', 'dark', 'light', 'font', 'disp', 'name', 'handle', 'phone', 'website', 'outro']) if (kit[k]) b[k] = kit[k];
  if (kit.logo) {
    const src = path.join(AVS_HOME, 'brands', kit.id, kit.logo);
    if (fs.existsSync(src) && dir) { const rel = `media/brand_${kit.id}${path.extname(kit.logo)}`; fs.mkdirSync(path.join(dir, 'media'), { recursive: true }); fs.copyFileSync(src, path.join(dir, rel)); b.logo = rel; }
    else if (/^(si:|emoji|http)/.test(kit.logo)) b.logo = kit.logo;
  }
  return b;
}

// ---------- helpers ----------
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
let CUR = null; // running child process (killed on cancel)
const sh = (cmd, argv, { cwd, onLine } = {}) => new Promise((ok, bad) => {
  const p = spawn(cmd, argv, { cwd }); CUR = p; let log = '';
  const feed = d => { const s = d.toString(); log = (log + s).slice(-3000); if (onLine) s.split(/[\r\n]/).forEach(l => l && onLine(l)); };
  p.stdout.on('data', feed); p.stderr.on('data', feed);
  p.on('error', bad);
  p.on('close', code => { CUR = null; code === 0 ? ok(log) : bad(new Error(`${path.basename(cmd)} lỗi (mã ${code}): ${log.trim().split('\n').slice(-2).join(' | ').slice(-300)}`)); });
});
const probeDur = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim() || 0;
// Resolve a cell value (absolute / ~ / relative to the sheet, the project or examples/) to a local file; URLs are downloaded.
async function resolveFile(v, ctx, destDir) {
  v = String(v || '').trim(); if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    const r = await fetch(v); if (!r.ok) throw new Error(`tải ${v} lỗi ${r.status}`);
    const name = slug(path.basename(new URL(v).pathname).replace(/\.\w+$/, '')) + (path.extname(new URL(v).pathname) || '.jpg');
    const f = path.join(destDir, name); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return f;
  }
  v = v.replace(/^~(?=\/)/, os.homedir());
  const cands = path.isAbsolute(v) ? [v] : [ctx.sheetDir, ctx.projectDir, path.join(SKILL, 'examples/batch'), path.join(SKILL, 'examples'), path.join(SKILL, 'examples/media')].filter(Boolean).map(d => path.resolve(d, v));
  cands.push(path.join(SKILL, 'examples/media', path.basename(v)));
  const f = cands.find(x => fs.existsSync(x) && fs.statSync(x).isFile());
  if (!f) throw new Error(`không thấy file "${v}"`);
  return f;
}
function copyMedia(f, dir) {
  const name = path.basename(f).replace(/[^\w.\-]+/g, '_'), dst = path.join(dir, 'media', name);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (path.resolve(f) !== dst) fs.copyFileSync(f, dst);
  return `media/${name}`;
}
// Replace mapped texts / media and {{placeholders}} in every string of obj.
function substitute(obj, { row, map, media, brand }) {
  const val = c => String(row[c] ?? '');
  const texts = new Map(Object.entries(map).filter(([k, c]) => k.startsWith('t:') && c && c in row).map(([k, c]) => [k.slice(2), val(c)]));
  const cols = Object.fromEntries(Object.keys(row).map(c => [norm(c), c]));
  const ph = s => s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, n) => {
    const c = map['p:' + n] || cols[norm(n)];
    if (c != null && c in row) return val(c);
    if (n.startsWith('brand.') && brand[n.slice(6)] != null) return String(brand[n.slice(6)]);
    return '';
  });
  const walk = v => typeof v === 'string' ? (media.has(v) ? media.get(v) : texts.has(v) ? texts.get(v) : v.includes('{{') ? ph(v) : v)
    : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
  return walk(obj);
}
// Word timings for TTS audio: spread over the voiced length by character count, small pauses after punctuation; ≤ 4 words per caption.
function ttsCaptions(text, dur) {
  const words = text.split(/\s+/).filter(Boolean);
  const w8 = words.map(w => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2 + (/[.,!?;:…]$/.test(w) ? 4 : 0));
  const total = w8.reduce((a, b) => a + b, 0) || 1, lead = .12, span = Math.max(.5, dur - .3);
  let t = lead; const W = words.map((w, i) => { const d = span * w8[i] / total, s = t; t += d; return { w: w.replace(/[.,!?;:…"“”]+$/g, '').replace(/^["“]/, '').toLowerCase(), s: +s.toFixed(2), e: +(s + d * (/[.,!?;:…]$/.test(w) ? .7 : .95)).toFixed(2), p: /[.,!?;:…]$/.test(w) }; });
  const caps = []; let cur = [];
  for (const w of W) { cur.push(w); if (cur.length >= 4 || w.p) { caps.push(cur); cur = []; } }
  if (cur.length) caps.push(cur);
  return caps.map(c => ({ t0: c[0].s, t1: c[c.length - 1].e, words: c.map(({ w, s, e }) => ({ w, s, e })) }));
}

// ---------- one row ----------
let BROWSER = null;
async function browser() {
  if (BROWSER) return BROWSER;
  const { default: puppeteer } = await import('puppeteer-core');
  const CHROME = findChrome();
  BROWSER = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--disable-web-security', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  return BROWSER;
}
// applyTemplate runs inside the engine page (same function Studio uses).
async function applyInEngine(tl, tpl, captions, title, dir) {
  const page = await (await browser()).newPage();
  try {
    await page.goto(pathToFileURL(path.join(SKILL, 'engine', 'index.html')).href, { waitUntil: 'networkidle0' });
    return await page.evaluate(async (t, tp, caps, ti) => {
      await window.init(t); window.applyTemplate(TL, tp, caps, ti);
      const out = JSON.parse(JSON.stringify(TL)); delete out.base; return out;
    }, { ...tl, captions, base: pathToFileURL(dir).href + '/' }, tpl, captions, title);
  } finally { await page.close(); }
}

export async function buildRow(job, i, { preview = false, dirOverride, log = () => {} } = {}) {
  const { rows } = parseSheet(job.sheet);
  const row = rows[i]; if (!row) throw new Error(`không có dòng ${i + 1}`);
  const map = job.mapping || {}, get = k => (map[k] && row[map[k]] != null ? String(row[map[k]]).trim() : '');
  const src = loadSource(job.source);
  const name = slug(get('f:file_name') || get('f:title') || Object.values(row)[0]) || `dong-${i + 1}`;
  const dir = dirOverride || path.join(job.out, `${String(i + 1).padStart(2, '0')}_${name}`);
  if (dirOverride) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  const dl = path.join(dir, src.kind === 'project' ? '.studio' : 'work'); fs.mkdirSync(dl, { recursive: true });
  const ctx = { sheetDir: path.dirname(job.sheet), projectDir: src.kind === 'project' ? src.dir : null };
  // brand: kit < row columns
  const kit = loadBrand(job.brand);
  if (job.brand && !kit) throw new Error(`không thấy thương hiệu "${job.brand}" trong ${AVS_HOME}/brands.json`);
  const brand = { ...brandFields(kit, dir) };
  for (const k of ['name', 'phone', 'website', 'handle', 'outro']) if (get('f:brand.' + k)) brand[k] = get('f:brand.' + k);
  // media: mapped columns + "images" list fill the template's media slots in order
  const media = new Map();
  const list = [];
  for (const v of get('f:images').split(/[|;\n]+/).map(s => s.trim()).filter(Boolean)) list.push(copyMedia(await resolveFile(v, ctx, dl), dir));
  const slots = targetsOf(src.doc).filter(t => t.kind === 'media');
  for (const t of slots) if (map[t.key] && get(t.key)) media.set(t.sample, copyMedia(await resolveFile(get(t.key), ctx, dl), dir));
  slots.filter(t => !media.has(t.sample) && IMG.test(t.sample)).forEach((t, k) => list.length && media.set(t.sample, list[k % list.length]));
  const images = [...new Set([...media.values(), ...list].filter(m => IMG.test(m)))];
  // unmapped template sample media come from examples/ (project mode: the project's own media, linked)
  for (const t of slots) if (!media.has(t.sample)) {
    const base = src.kind === 'project' ? path.join(src.dir, t.sample) : path.join(SKILL, 'examples', t.sample.replace(/%0\dd.*$/, ''));
    const dst = path.join(dir, t.sample.replace(/%0\dd.*$/, ''));
    if (fs.existsSync(base) && !fs.existsSync(dst)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); src.kind === 'project' ? linkPath(base, dst) : fs.cpSync(base, dst, { recursive: true }); }
  }
  const sub = (o, m = media) => substitute(o, { row, map, media: m, brand });
  const title = get('f:title');
  const W = job.quality === '720' ? 720 : 1080, wh = vert => (preview ? (vert ? [540, 960] : [960, 540]) : vert ? [W, W * 16 / 9] : [W * 16 / 9, W]);
  let tl;

  if (src.kind === 'project') {
    // clone: link everything except the timeline, media/, out/, .studio, batch/; texts/media/brand replaced
    for (const e of fs.readdirSync(src.dir)) if (!['timeline.json', 'media', 'out', '.studio', 'batch'].includes(e) && !e.startsWith('.') && !fs.existsSync(path.join(dir, e))) linkPath(path.join(src.dir, e), path.join(dir, e));
    if (fs.existsSync(path.join(src.dir, 'media'))) for (const e of fs.readdirSync(path.join(src.dir, 'media'))) { const d = path.join(dir, 'media', e); if (!fs.existsSync(d)) linkPath(path.join(src.dir, 'media', e), d); }
    tl = sub(JSON.parse(JSON.stringify(src.doc)));
    if (title) tl.title = title;
    tl.brand = { ...(tl.brand || {}), ...brand };
    if (tl.audio) tl.audio.mix = 'out/mix.wav';
    if (get('f:script') || get('f:video')) log('dự án hiện tại: bỏ qua cột lời đọc / video (giữ giọng của dự án)');
  } else {
    const tpl = sub(src.doc), vert = tpl.aspect !== '16:9', [w, h] = wh(vert);
    const video = get('f:video'), script = get('f:script');
    const mode = job.voice === 'auto' || !job.voice ? (video ? 'video' : script ? 'tts' : 'none') : job.voice;
    let caps = [], dur = +get("f:dur") || +job.dur || tpl.base_dur || 20;
    const base = { width: w, height: h, fps: 30, face: vert ? { x: 360, y: 520 } : { x: 640, y: 300 }, brand, audio: { mix: 'work/mix.wav', music: [], sfx: [] } };
    const pics = images.length ? images : slots.filter(t => IMG.test(t.sample)).map(t => t.sample).filter(m => fs.existsSync(path.join(dir, m)));
    const stills = (d, audio) => { const n = Math.max(1, pics.length), seg = d / n; return pics.map((m, k) => ({ src: m, in: +(k * seg).toFixed(3), out: +((k + 1) * seg).toFixed(3), fit: 'cover', zoom: 1.06, ...(audio ? { audio } : {}), ...(k ? { transition: { type: ['zoom', 'slide_l', 'dissolve', 'push'][k % 4], dur: .4 } } : {}) })); };
    if (mode === 'beat') {
      if (!pics.length) throw new Error('chế độ ảnh theo nhịp cần ít nhất 1 ảnh');
      log('dựng ảnh theo nhịp nhạc (beat_project.py)');
      await sh(PY, ['-I', '-X', 'utf8', path.join(HERE, 'beat_project.py'), path.join(dir, 'media'), dir, '--music', tpl.music || 'hype', '--dur', String(dur), '--title', title || tpl.title || '', ...(brand.phone ? ['--phone', brand.phone] : []), ...(brand.website ? ['--website', brand.website] : []), ...(vert ? [] : ['--horizontal'])]);
      tl = sub(JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8')), new Map());
      Object.assign(tl, { width: w, height: h, brand: { ...(tl.brand || {}), ...brand } });
      tl = applyBrandTexts(tl, brand);
    } else {
      if (mode === 'video') {
        if (preview) throw new Error('xem trước không hỗ trợ dòng có video người nói (cần nhận giọng ~1 phút) — bấm Bắt đầu để dựng');
        const v = await resolveFile(video, ctx, dl), S = f => path.join(HERE, f);
        log('nhận giọng nói (whisper)'); await sh(PY, ['-I', '-X', 'utf8', S('transcribe.py'), v, path.join(dir, 'work/words_raw.json'), '--model', job.model || 'large-v3-turbo']);
        log('cắt khoảng lặng'); await sh(PY, ['-I', '-X', 'utf8', S('cut.py'), v, path.join(dir, 'work/words_raw.json'), path.join(dir, 'work')]);
        fs.mkdirSync(path.join(dir, 'work/frames'), { recursive: true });
        const [FW, FH] = vert ? [720, 1280] : [1280, 720];
        log('trích khung hình'); await sh('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dir, 'work/aroll.mp4'), '-vf', `scale=${FW}:${FH}:force_original_aspect_ratio=increase,crop=${FW}:${FH}`, '-q:v', '3', path.join(dir, 'work/frames/%05d.jpg')]);
        log('tạo phụ đề'); await sh(PY, ['-I', '-X', 'utf8', S('captions.py'), path.join(dir, 'work/words.json'), path.join(dir, 'work/captions.json'), '--max', '4']);
        caps = JSON.parse(fs.readFileSync(path.join(dir, 'work/captions.json'), 'utf8'));
        for (const c of caps) for (const w of c.words) w.w = w.w.replace(/[.,!?]+$/, '').toLowerCase();
        dur = +(fs.readdirSync(path.join(dir, 'work/frames')).length / 30 + 2.5).toFixed(2);
        tl = { ...base, duration: dur, aroll: { frames: 'work/frames/%05d.jpg' }, audio: { ...base.audio, voice: 'work/aroll.mp4' } };
      } else if (mode === 'tts') {
        if (!script) throw new Error('chế độ giọng AI cần cột lời đọc');
        const aiff = path.join(dir, process.platform === 'darwin' ? 'work/voice.aiff' : 'work/voice.mp3'), wav = path.join(dir, 'work/voice.wav');
        if (process.platform === 'darwin') { log('đọc lời bằng giọng Linh (say)'); await sh('say', ['-v', job.tts_voice || 'Linh', '-r', String(job.tts_rate || 175), '-o', aiff, script]); }
        else { log('đọc lời bằng giọng HoaiMy (edge-tts, cần mạng)'); await sh(PY, ['-X', 'utf8', '-m', 'edge_tts', '--voice', /Neural$/.test(job.tts_voice || '') ? job.tts_voice : 'vi-VN-HoaiMyNeural', '--text', script, '--write-media', aiff]); }
        await sh('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-af', 'apad=pad_dur=0.2', '-ar', '48000', '-ac', '2', wav]); fs.rmSync(aiff, { force: true });
        const vd = probeDur(wav); caps = ttsCaptions(script, vd);
        dur = +Math.max(vd + 2.4, +get("f:dur") || +job.dur || 0).toFixed(2);
        tl = { ...base, duration: dur, clips: stills(dur, 'work/voice.wav') };
      } else tl = { ...base, duration: +dur.toFixed(2), clips: stills(dur) };
      if (tl.clips && !tl.clips.length) { delete tl.clips; tl.scenes = [{ type: 'frame_grid', t0: 0, t1: tl.duration }]; }
      if (caps.length) fs.writeFileSync(path.join(dir, 'work/captions.json'), JSON.stringify(caps, null, 1));
      log('áp template');
      tl = sub(await applyInEngine(tl, tpl, caps, title || tpl.title, dir), new Map()); // recipe scenes: texts only, media already swapped
      tl.captions = caps.length ? 'work/captions.json' : [];
      if (!caps.length) tl.caption_style = 'none';
      if (tl.clips) delete tl.aroll;
      tl = applyBrandTexts(tl, brand);
    }
  }
  tl._batch = { source: job.source, row: i + 1, sheet: path.basename(job.sheet) };
  if (preview) { const vert = (tl.height || 1) > (tl.width || 1); [tl.width, tl.height] = wh(vert); }
  else if (src.kind === 'project') { const vert = (tl.height || 720) > (tl.width || 1280); [tl.width, tl.height] = wh(vert); }
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(tl, null, 1));
  return { dir, name, tl };
}
// Recipe scenes print the template's sample contact ("09xx xxx xxx", "Tên môi giới"…); swap in the brand kit's values.
function applyBrandTexts(tl, brand) {
  const SAMPLE = [['phone', /^09xx xxx xxx$/], ['website', /vidu\.vn$|^example\.com$/], ['name', /^(Tên môi giới|Thương hiệu|Tên shop)$/]];
  const fix = v => { const k = SAMPLE.find(([k, re]) => brand[k] && re.test(v)); return k ? brand[k[0]] : v; };
  const walk = v => typeof v === 'string' ? fix(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'brand' ? x : walk(x)])) : v;
  return walk(tl);
}

async function renderRow(dir, tl, onProgress) {
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  const tlFile = path.join(dir, 'timeline.json');
  if (tl.audio && (tl.audio.voice || tl.audio.music?.length || tl.audio.sfx?.length || tl.clips?.some(c => c.audio))) {
    onProgress(0, 'trộn âm thanh'); await sh(PY, ['-I', '-X', 'utf8', path.join(HERE, 'mix_audio.py'), tlFile]);
  }
  const out = path.join(dir, 'out', `${path.basename(dir)}.mp4`), part = out.replace(/\.mp4$/, '.part.mp4');
  onProgress(0, 'render');
  await sh('node', [path.join(HERE, 'render.mjs'), tlFile, part], { onLine: l => { const m = /([\d.]+)s \/ ([\d.]+)s/.exec(l); if (m) onProgress(Math.min(.99, +m[1] / +m[2]), 'render'); } });
  fs.renameSync(part, out);
  return out;
}

// ---------- batch run ----------
function rowList(spec, n) {
  if (!spec) return [...Array(n).keys()];
  if (Array.isArray(spec)) return spec.filter(i => i >= 0 && i < n);
  return [...new Set(String(spec).split(',').flatMap(p => { const [a, b] = p.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k - 1) : [a - 1]; }))].filter(i => i >= 0 && i < n);
}
export async function runJob(jobFile) {
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  job.out = job.out || path.dirname(jobFile);
  const { rows } = parseSheet(job.sheet);
  const todo = rowList(job.rows, rows.length);
  const stFile = path.join(job.out, 'status.json');
  const prev = fs.existsSync(stFile) ? JSON.parse(fs.readFileSync(stFile, 'utf8')) : null;
  const st = { name: job.name || path.basename(job.out), total: todo.length, started: prev?.started || new Date().toISOString(), rows: todo.map(i => prev?.rows?.find(r => r.i === i) || { i, state: 'pending' }) };
  const save = () => { st.updated = new Date().toISOString(); fs.writeFileSync(stFile, JSON.stringify(st, null, 1)); };
  const emit = (r, extra = {}) => {
    const done = st.rows.filter(x => x.state === 'done').length;
    const frac = (done + (r && r.state === 'running' ? r.progress || 0 : 0)) / Math.max(1, st.total);
    console.log('@@ ' + JSON.stringify({ progress: +frac.toFixed(3), step: r ? `Dòng ${r.i + 1}/${rows.length}: ${r.step || r.state}` : extra.step, done, total: st.total }));
    save();
  };
  let cur = null;
  const stop = () => { if (CUR) CUR.kill('SIGTERM'); if (cur) { cur.state = 'cancelled'; cur.step = 'đã dừng'; } save(); BROWSER?.close().catch(() => {}); process.exit(130); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  for (const r of st.rows) {
    if (r.state === 'done' && r.out && fs.existsSync(r.out)) continue;
    cur = r; Object.assign(r, { state: 'running', step: 'chuẩn bị', progress: 0, error: undefined }); emit(r);
    try {
      const { dir, tl } = await buildRow(job, r.i, { log: s => { r.step = s; emit(r); } });
      r.dir = dir; r.name = path.basename(dir); r.title = tl.title || r.name;
      r.out = await renderRow(dir, tl, (p, s) => { r.progress = p; r.step = s; emit(r); });
      Object.assign(r, { state: 'done', step: 'xong', progress: 1 });
    } catch (e) { Object.assign(r, { state: 'error', error: e.message }); console.error(`dòng ${r.i + 1}: ${e.message}`); }
    emit(r);
  }
  cur = null;
  await BROWSER?.close();
  const bad = st.rows.filter(r => r.state !== 'done');
  emit(null, { step: `Xong ${st.total - bad.length}/${st.total} video` });
  return st;
}

// ---------- CLI ----------
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  try {
    if (args[0] === '--parse') console.log(JSON.stringify(parseSheet(path.resolve(args[1])), null, 1));
    else if (args[0] === '--targets') {
      const s = fs.existsSync(path.join(path.resolve(args[1]), 'timeline.json')) ? { kind: 'project', dir: args[1] } : /\.json$/.test(args[1]) ? { kind: 'template', file: path.resolve(args[1]) } : { kind: 'template', id: args[1] };
      console.log(JSON.stringify(targetsOf(loadSource(s).doc), null, 1));
    } else if (args[0] === '--job') {
      const jf = path.resolve(args[1]);
      if (args.includes('--preview')) {
        const job = JSON.parse(fs.readFileSync(jf, 'utf8')); job.out = job.out || path.dirname(jf);
        const outJpg = path.resolve(opt('--out', path.join(job.out, '_preview.jpg')));
        const { dir, tl } = await buildRow(job, +opt('--preview', 0), { preview: true, dirOverride: path.join(job.out, '_preview'), log: s => console.log('@@ ' + JSON.stringify({ step: s })) });
        await BROWSER?.close();
        const t = Math.min(+opt('--t', 2.5), tl.duration - .1);
        await sh('node', [path.join(HERE, 'render.mjs'), path.join(dir, 'timeline.json'), outJpg, '--still', String(t), outJpg]);
        console.log(JSON.stringify({ still: outJpg, t, duration: tl.duration, dir }));
      } else { const st = await runJob(jf); process.exitCode = st.rows.some(r => r.state !== 'done') ? 2 : 0; }
    } else if (args.length >= 3) {
      const [srcArg, sheet, out] = args;
      const s = fs.existsSync(path.join(path.resolve(srcArg), 'timeline.json')) ? { kind: 'project', dir: path.resolve(srcArg) } : /\.json$/.test(srcArg) ? { kind: 'template', file: path.resolve(srcArg) } : { kind: 'template', id: srcArg };
      const { columns } = parseSheet(path.resolve(sheet));
      const mapping = opt('--map') ? JSON.parse(fs.readFileSync(opt('--map'), 'utf8')) : autoMap(targetsOf(loadSource(s).doc), columns);
      fs.mkdirSync(path.resolve(out), { recursive: true });
      const jf = path.join(path.resolve(out), 'job.json');
      fs.writeFileSync(jf, JSON.stringify({ source: s, sheet: path.resolve(sheet), mapping: mapping.mapping || mapping, brand: opt('--brand') || null, voice: opt('--voice', 'auto'), quality: opt('--quality', '1080'), dur: +opt('--dur', 0) || null, rows: opt('--rows') || null, out: path.resolve(out) }, null, 1));
      const st = await runJob(jf);
      for (const r of st.rows) console.log(`dòng ${r.i + 1}: ${r.state}${r.out ? ' → ' + r.out : ''}${r.error ? ' — ' + r.error : ''}`);
      process.exitCode = st.rows.some(r => r.state !== 'done') ? 2 : 0;
    } else console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 14).join('\n'));
  } catch (e) { console.error('Lỗi:', e.message); await BROWSER?.close().catch(() => {}); process.exitCode = 1; }
}
