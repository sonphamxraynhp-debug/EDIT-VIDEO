// B-roll AI helper for Studio (spec: references/keyframes-mask-broll.md). No npm deps (Node ≥ 18 fetch) + ffmpeg + claude CLI.
//   node ai_broll.mjs search "<query>" [--kind photo|video] [--src commons,openverse,pexels,pixabay] [--n 18]  -> JSON results (no download)
//   node ai_broll.mjs fetch <url> <project_dir> --kind photo|video [--name base] [--dur 3] [--meta '{json}']  -> JSON media item in <project>/media
//   node ai_broll.mjs suggest <captions.json> [--model sonnet] [--n 8]       -> JSON [{i,t0,t1,text,kind:'preset',id,...}|{kind:'stock',query}]
//   node ai_broll.mjs genimage "<prompt>" <out.png> [--provider openai|gemini] [--vertical]
//   node ai_broll.mjs keys                                                    -> which keys are configured (never prints them)
// Keys: ~/.ai-video-studio/config.json (mode 600) {pexels, pixabay, openai, gemini} or env PEXELS_API_KEY, PIXABAY_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { spawnClaude } from './platform.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG = path.join(process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio'), 'config.json');
const UA = 'ai-video-studio/4.0 (b-roll search; local editor)';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

export function readKeys() {
  let c = {}; try { c = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch {}
  const env = { pexels: 'PEXELS_API_KEY', pixabay: 'PIXABAY_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };
  return Object.fromEntries(Object.entries(env).map(([k, e]) => [k, c[k] || process.env[e] || '']));
}

// ---------- Vietnamese -> English (same table as broll_fetch.py) ----------
const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
function translate(q) {
  const f = path.join(SKILL, 'assets/broll/keywords_vi_en.tsv'), table = {};
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) if (l.includes('\t') && !l.startsWith('#')) { const [vi, en] = l.split('\t'); table[fold(vi)] = en.trim(); }
  const orig = q.toLowerCase().split(/\s+/).filter(Boolean), w = orig.map(fold), out = [];
  for (let i = 0; i < w.length;) {
    let hit = 0;
    for (let n = Math.min(5, w.length - i); n > 0; n--) { const k = w.slice(i, i + n).join(' '); if (table[k]) { out.push(table[k]); hit = n; break; } }
    if (hit) i += hit; else { if (/^[\x00-\x7f]+$/.test(orig[i]) && orig[i].length > 2) out.push(w[i]); i++; }
  }
  return [...new Set(out.join(' ').split(' '))].join(' ').trim() || q;
}

async function getJson(u, headers = {}) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(20000) }); return r.ok ? await r.json() : null; } catch { return null; }
}

// ---------- providers -> [{provider, kind, thumb, preview, url, w, h, dur, title, author, license, page}] ----------
const P = {
  async pexels(q, kind, n, key) {
    if (!key) return [];
    if (kind === 'video') {
      const d = await getJson(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=${n}`, { Authorization: key });
      return (d?.videos || []).map(v => {
        const fs_ = v.video_files.filter(f => f.height).sort((a, b) => a.height - b.height), big = fs_.find(f => f.height >= 720) || fs_.at(-1), small = fs_[0];
        return big && { provider: 'pexels', kind, thumb: v.image, preview: small?.link, url: big.link, w: big.width, h: big.height, dur: v.duration, title: q, author: v.user?.name, license: 'Pexels License', page: v.url };
      }).filter(Boolean);
    }
    const d = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${n}`, { Authorization: key });
    return (d?.photos || []).map(p => ({ provider: 'pexels', kind, thumb: p.src.medium, url: p.src.large2x, w: p.width, h: p.height, title: p.alt || q, author: p.photographer, license: 'Pexels License', page: p.url }));
  },
  async pixabay(q, kind, n, key) {
    if (!key) return [];
    if (kind === 'video') {
      const d = await getJson(`https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(q)}&per_page=${Math.max(3, n)}&safesearch=true`);
      return (d?.hits || []).map(h => ({ provider: 'pixabay', kind, thumb: h.videos?.tiny?.thumbnail || h.videos?.small?.thumbnail, preview: h.videos?.tiny?.url, url: (h.videos.medium || h.videos.small).url, dur: h.duration, title: h.tags, author: h.user, license: 'Pixabay Content License', page: h.pageURL }));
    }
    const d = await getJson(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&image_type=photo&per_page=${Math.max(3, n)}&safesearch=true`);
    return (d?.hits || []).map(h => ({ provider: 'pixabay', kind, thumb: h.webformatURL, url: h.largeImageURL, w: h.imageWidth, h: h.imageHeight, title: h.tags, author: h.user, license: 'Pixabay Content License', page: h.pageURL }));
  },
  async commons(q, kind, n) {
    const ft = kind === 'video' ? 'video' : 'bitmap';
    const d = await getJson('https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&format=json'
      + `&gsrsearch=${encodeURIComponent(`filetype:${ft} ${q}`)}&gsrlimit=${n * 2}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=480`);
    const out = [];
    for (const p of Object.values(d?.query?.pages || {}).sort((a, b) => a.index - b.index)) {
      const ii = p.imageinfo?.[0] || {}, m = ii.extmetadata || {}, lic = m.LicenseShortName?.value || '';
      if (!/CC0|Public domain|CC BY|PD/i.test(lic) || /NC|ND/.test(lic)) continue;
      if (kind === 'video' && ((ii.height || 0) < 360 || (ii.duration || 0) < 2)) continue;
      const big = kind === 'photo' ? ii.thumburl?.replace(/\/\d+px-/, '/1920px-') : ii.url;
      out.push({ provider: 'commons', kind, thumb: ii.thumburl, preview: kind === 'video' ? ii.url : undefined, url: (ii.width || 0) > 1920 ? big : ii.url, w: ii.width, h: ii.height, dur: ii.duration,
        title: p.title.replace(/^File:/, '').replace(/\.\w+$/, ''), author: (m.Artist?.value || 'unknown').replace(/<[^>]+>/g, '').trim(), license: lic, page: ii.descriptionurl });
    }
    return out;
  },
  async openverse(q, kind, n) { // thumb = the image itself: Openverse's /thumb proxy is often too slow for a grid
    if (kind === 'video') return [];
    const d = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license_type=commercial&page_size=${n}`);
    return (d?.results || []).map(r => ({ provider: 'openverse', kind, thumb: r.url, url: r.url, w: r.width, h: r.height, title: r.title || q, author: r.creator || 'unknown',
      license: `CC ${(r.license || '').toUpperCase()} ${r.license_version || ''}`.trim(), page: r.foreign_landing_url }));
  },
};

export async function search(query, { kind = 'photo', src = 'pexels,pixabay,commons,openverse', n = 18, en } = {}) {
  const q = en || translate(query), keys = readKeys(), names = src.split(',').filter(x => P[x]);
  const lists = await Promise.all(names.map(x => P[x](q, kind, Math.ceil(n / Math.max(1, names.filter(y => y === 'commons' || y === 'openverse' || keys[y]).length)) + 2, keys[x]).catch(() => [])));
  const missing = ['pexels', 'pixabay'].filter(x => names.includes(x) && !keys[x]);
  const seen = new Set(), items = [];
  for (let i = 0; items.length < n && lists.some(l => l[i]); i++) for (const l of lists) if (l[i] && l[i].url && !seen.has(l[i].page)) { seen.add(l[i].page); items.push(l[i]); }
  return { query, en: q, kind, missing, items: items.slice(0, n) };
}

// ---------- download + normalise into <project>/media ----------
const run = (cmd, a) => { const r = spawnSync(cmd, a, { encoding: 'utf8' }); if (r.status) throw new Error(`${cmd}: ${(r.stderr || '').slice(-300)}`); return r.stdout; };
const slug = s => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'broll';
export async function fetchMedia(u, dir, { kind = 'photo', name = 'broll', dur = 3, vertical = true, meta = {} } = {}) {
  const md = path.join(dir, 'media'); fs.mkdirSync(md, { recursive: true });
  let base = `${slug(name)}`; for (let i = 1; fs.existsSync(path.join(md, base + (kind === 'video' ? '.mp4' : '.jpg'))); i++) base = `${slug(name)}_${i}`;
  const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`tải thất bại (${r.status})`);
  const tmp = path.join(os.tmpdir(), `avs_dl_${process.pid}_${Date.now()}`); fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  const [W, H] = vertical ? [1080, 1920] : [1920, 1080];
  try {
    if (kind === 'video') {
      const dst = path.join(md, base + '.mp4'), total = +run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp]).trim() || 0;
      const ss = total > dur + 1 ? total / 2 - dur / 2 : 0;
      run('ffmpeg', ['-v', 'error', '-y', '-ss', ss.toFixed(2), '-i', tmp, '-t', String(dur), '-an', '-vf', `fps=30,scale=${W / 1.5}:${H / 1.5}:force_original_aspect_ratio=increase,crop=${W / 1.5}:${H / 1.5},setsar=1`,
        '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst]);
      const fr = path.join(md, base + '_frames'); fs.mkdirSync(fr, { recursive: true });
      run('ffmpeg', ['-v', 'error', '-y', '-i', dst, '-q:v', '3', path.join(fr, '%05d.jpg')]);
      const count = fs.readdirSync(fr).filter(f => f.endsWith('.jpg')).length;
      credit(md, { file: base + '.mp4', ...meta });
      return { name: base + '.mp4', path: `media/${base}.mp4`, kind: 'video', seq: { seq: `media/${base}_frames/%05d.jpg`, fps: 30, count }, thumb: `media/${base}_frames/00001.jpg`, dur: +(count / 30).toFixed(2) };
    }
    // Photos keep their own aspect (max 1920 px); the photo scene covers/contains as needed.
    const dst = path.join(md, base + '.jpg');
    run('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-vf', 'scale=w=1920:h=1920:force_original_aspect_ratio=decrease', '-q:v', '2', '-frames:v', '1', dst]);
    credit(md, { file: base + '.jpg', ...meta });
    return { name: base + '.jpg', path: `media/${base}.jpg`, kind: 'image', thumb: `media/${base}.jpg` };
  } finally { fs.rmSync(tmp, { force: true }); }
}
function credit(md, rec) {
  const f = path.join(md, 'credits.json'); let c = []; try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  c.push({ ...rec, at: new Date().toISOString() }); fs.writeFileSync(f, JSON.stringify(c, null, 1));
}

// ---------- AI suggestions (claude -p) ----------
const CATALOG = () => JSON.parse(fs.readFileSync(path.join(SKILL, 'assets/broll/catalog.json'), 'utf8'));
function presetSearch(cat, q, n = 6) {
  const words = fold(q).split(/[^a-z0-9%]+/).filter(w => w.length > 1), bi = words.slice(1).map((w, i) => words[i] + ' ' + w), out = [];
  const scored = [];
  for (const e of cat) {
    if (e.pal !== 'ember') continue;
    const hay = fold([...(e.tags || []), e.topic, e.text, e.template].join(' | '));
    let s = 0; for (const b of bi) if (hay.includes(b)) s += 3; for (const w of words) if (hay.includes(w)) s += 1;
    if (s) scored.push([s, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  for (const [, e] of scored) { if (out.filter(o => o.template === e.template).length >= 1) continue; out.push(e); if (out.length >= n) break; }
  return out;
}
export function sentences(caps) {
  // Merge caption chunks into sentences of 2–6 s (gap > 0.6 s or sentence punctuation ends one).
  const out = []; let cur = null;
  for (const c of caps) {
    const text = c.words.map(w => w.w).join(' ');
    if (cur && (c.t0 - cur.t1 > .6 || cur.t1 - cur.t0 > 4 || /[.!?…]$/.test(cur.text))) { out.push(cur); cur = null; }
    cur = cur ? { ...cur, t1: c.t1, text: cur.text + ' ' + text } : { t0: c.t0, t1: c.t1, text };
  }
  if (cur) out.push(cur);
  return out.map((s, i) => ({ i, t0: +s.t0.toFixed(2), t1: +s.t1.toFixed(2), text: s.text }));
}
export async function suggest(caps, { model = 'sonnet', n = 8 } = {}) {
  const cat = CATALOG(), ids = new Set(cat.map(e => e.id)), sents = sentences(caps);
  const cands = sents.map(s => ({ ...s, presets: presetSearch(cat, s.text).map(e => ({ id: e.id, template: e.template, text: e.text })) }));
  const prompt = `Bạn là editor video ngắn tiếng Việt. Dưới đây là các câu thoại (JSON, có thời gian) của một video dọc, kèm danh sách preset b-roll động có sẵn phù hợp với mỗi câu (chỉ được chọn id trong "presets" của chính câu đó).
Chọn tối đa ${n} câu đáng chèn b-roll nhất (minh hoạ ý chính, số liệu, khái niệm, địa điểm, đồ vật). Với mỗi câu chọn MỘT trong hai:
- "preset": b-roll động dựng sẵn (khi câu nói về số liệu, khái niệm trừu tượng, công nghệ, cảm xúc) — ghi "id" lấy đúng từ presets, và "text" = chữ ngắn IN HOA tiếng Việt (≤ 18 ký tự) hiện trên b-roll;
- "stock": ảnh/video thật (khi câu nói về người, nơi chốn, đồ vật cụ thể) — ghi "query" = 2–4 từ khoá TIẾNG ANH để tìm ảnh stock.
Thêm "why" (≤ 12 từ tiếng Việt). Trả về DUY NHẤT một mảng JSON, không giải thích: [{"i":0,"kind":"preset","id":"...","text":"...","why":"..."},{"i":3,"kind":"stock","query":"...","why":"..."}]

${JSON.stringify(cands)}`;
  const r = await new Promise((ok, bad) => {
    // Prompt on stdin: as an argument it passes Windows' 32K command-line limit for normal-length videos.
    const p = spawnClaude(['-p', '--output-format', 'json', '--model', model], { stdio: ['pipe', 'pipe', 'pipe'] });
    p.stdin.on('error', () => {}); p.stdin.end(prompt);
    let o = '', e = ''; p.stdout.on('data', d => (o += d)); p.stderr.on('data', d => (e += d));
    p.on('error', () => bad(new Error('Không tìm thấy Claude Code CLI (lệnh "claude"). Cài Claude Code rồi đăng nhập để dùng gợi ý AI.')));
    p.on('close', code => {
      let res = e || o, isErr = !!code; try { const j = JSON.parse(o); if (j.result) res = String(j.result); isErr ||= !!j.is_error; } catch {}
      if (!isErr) return ok(o);
      bad(new Error(/not logged in|\/login|authenticat|unauthorized|api key/i.test(res) ? 'Claude Code chưa đăng nhập. Mở Terminal, chạy lệnh "claude" một lần để đăng nhập rồi thử lại.' : `claude -p lỗi (mã ${code}): ${res.slice(-300)}`));
    });
  });
  let txt = r; try { txt = JSON.parse(r).result ?? r; } catch {}
  const m = String(txt).match(/\[[\s\S]*\]/); if (!m) throw new Error('Claude không trả về JSON hợp lệ');
  const byI = Object.fromEntries(sents.map(s => [s.i, s]));
  return JSON.parse(m[0]).filter(x => byI[x.i] && (x.kind === 'stock' ? x.query : ids.has(x.id)))
    .map(x => ({ ...byI[x.i], ...x, text: byI[x.i].text, ...(x.kind === 'preset' ? { label: String(x.text || '').slice(0, 24), preset: cat.find(e => e.id === x.id) } : {}) }));
}

// ---------- AI image generation (only with the user's own key) ----------
export async function genImage(prompt, out, { provider, vertical = true } = {}) {
  const keys = readKeys(); provider = provider || (keys.openai ? 'openai' : keys.gemini ? 'gemini' : '');
  if (!provider || !keys[provider]) throw new Error('Chưa có API key tạo ảnh (OpenAI hoặc Google Gemini). Dán key trong mục Cài đặt key của panel B-roll AI.');
  let b64;
  if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', signal: AbortSignal.timeout(180000),
      headers: { Authorization: `Bearer ${keys.openai}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-image-1', prompt, size: vertical ? '1024x1536' : '1536x1024', n: 1 }) });
    const d = await r.json(); if (!r.ok) throw new Error(`OpenAI: ${d.error?.message || r.status}`); b64 = d.data?.[0]?.b64_json;
  } else {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict`, { method: 'POST', signal: AbortSignal.timeout(180000),
      headers: { 'x-goog-api-key': keys.gemini, 'Content-Type': 'application/json' }, body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: vertical ? '9:16' : '16:9' } }) });
    const d = await r.json(); if (!r.ok) throw new Error(`Gemini: ${d.error?.message || r.status}`); b64 = d.predictions?.[0]?.bytesBase64Encoded;
  }
  if (!b64) throw new Error('Dịch vụ không trả về ảnh');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  return { out, provider };
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  const [cmd, a1, a2] = args, J = o => console.log(JSON.stringify(o, null, 1));
  try {
    if (cmd === 'search') J(await search(a1, { kind: opt('--kind', 'photo'), src: opt('--src'), n: +opt('--n', 18) }));
    else if (cmd === 'fetch') J(await fetchMedia(a1, a2, { kind: opt('--kind', 'photo'), name: opt('--name', 'broll'), dur: +opt('--dur', 3), vertical: !args.includes('--horizontal'), meta: JSON.parse(opt('--meta', '{}')) }));
    else if (cmd === 'suggest') J(await suggest(JSON.parse(fs.readFileSync(a1, 'utf8')), { model: opt('--model', 'sonnet'), n: +opt('--n', 8) }));
    else if (cmd === 'genimage') J(await genImage(a1, a2, { provider: opt('--provider'), vertical: !args.includes('--horizontal') }));
    else if (cmd === 'keys') J(Object.fromEntries(Object.entries(readKeys()).map(([k, v]) => [k, !!v])));
    else console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 7).join('\n'));
  } catch (e) { console.error(e.message); process.exit(1); }
}
