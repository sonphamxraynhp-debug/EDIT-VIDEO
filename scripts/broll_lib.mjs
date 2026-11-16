// "Thư viện b-roll của tôi": the user's own photos / clips, kept once in ~/.ai-video-studio/broll_lib and reused by every
// project. Each item gets tags (from the file name, typed by the user, or written by Claude looking at the picture); auto b-roll
// (scripts/auto_broll.mjs, source "lib") picks items whose tags match what is being said and copies them into the project.
//   node scripts/broll_lib.mjs add <file…> [--tags "quán, cà phê"] · list · rm <id> · tags <id> "a, b" · tag [--claude] [--all]
//   node scripts/broll_lib.mjs search "câu nói" [--n 5]
// Spec: references/autofill.md §1c.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnClaude } from './platform.mjs';

export const LIB = path.join(process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio'), 'broll_lib');
const IDX = path.join(LIB, 'index.json');
const fold = s => String(s).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
const IMG = /\.(jpe?g|png|webp|heic)$/i, VID = /\.(mp4|mov|m4v|webm|mkv)$/i;
const STOP = new Set('la va thi ma cua cac nhung mot cai nay do day kia roi da se dang co duoc bi cho voi de tu den o tren duoi trong ngoai img dsc pxl screenshot anh video final copy new'.split(' '));

export function load() { try { return JSON.parse(fs.readFileSync(IDX, 'utf8')); } catch { return []; } }
function save(items) { fs.mkdirSync(LIB, { recursive: true }); fs.writeFileSync(IDX, JSON.stringify(items, null, 1)); }
const run = (cmd, a) => { const r = spawnSync(cmd, a, { encoding: 'utf8' }); if (r.status) throw new Error(`${cmd}: ${(r.stderr || '').slice(-300)}`); return r.stdout; };
const slug = s => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'broll';
const nameTags = f => fold(path.basename(f).replace(/\.\w+$/, '')).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
export const tagList = s => (Array.isArray(s) ? s : String(s || '').split(/[,;\n]/)).map(x => x.trim().toLowerCase()).filter(Boolean).slice(0, 24);

// Add a file: photos are normalised to ≤ 1920 px JPEG, clips to a ≤ 8 s 30 fps H.264 + frame sequence (what the engine plays).
export function add(file, { tags = [], title } = {}) {
  if (!fs.existsSync(file)) throw new Error('không thấy file ' + file);
  const items = load(), kind = VID.test(file) ? 'video' : IMG.test(file) ? 'image' : null;
  if (!kind) throw new Error('chỉ nhận ảnh (jpg, png, webp, heic) hoặc video (mp4, mov, webm)');
  let id = slug(title || path.basename(file).replace(/\.\w+$/, ''));
  for (let i = 2; items.some(x => x.id === id); i++) id = `${slug(title || path.basename(file).replace(/\.\w+$/, ''))}-${i}`;
  fs.mkdirSync(LIB, { recursive: true });
  const it = { id, kind, title: title || path.basename(file), tags: [...new Set([...tagList(tags), ...nameTags(file)])], added: new Date().toISOString() };
  if (kind === 'image') {
    it.file = id + '.jpg';
    run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', 'scale=w=1920:h=1920:force_original_aspect_ratio=decrease', '-q:v', '2', '-frames:v', '1', path.join(LIB, it.file)]);
    it.thumb = it.file;
  } else {
    it.file = id + '.mp4';
    const total = +run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim() || 0, dur = Math.min(8, total || 8);
    run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-t', String(dur), '-an', '-vf', 'fps=30,scale=w=1280:h=1280:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(LIB, it.file)]);
    const fr = path.join(LIB, id + '_frames'); fs.mkdirSync(fr, { recursive: true });
    run('ffmpeg', ['-v', 'error', '-y', '-i', path.join(LIB, it.file), '-q:v', '3', path.join(fr, '%05d.jpg')]);
    it.frames = fs.readdirSync(fr).filter(f => f.endsWith('.jpg')).length; it.dur = +(it.frames / 30).toFixed(2);
    it.thumb = `${id}_frames/${String(Math.max(1, Math.round(it.frames / 2))).padStart(5, '0')}.jpg`;
  }
  items.push(it); save(items);
  return it;
}
export function remove(id) {
  const items = load(), it = items.find(x => x.id === id); if (!it) return false;
  fs.rmSync(path.join(LIB, it.file), { force: true }); fs.rmSync(path.join(LIB, id + '_frames'), { recursive: true, force: true });
  save(items.filter(x => x.id !== id)); return true;
}
export function setTags(id, tags) { const items = load(), it = items.find(x => x.id === id); if (!it) return null; it.tags = tagList(tags); it.tagged = 'user'; save(items); return it; }

// Claude looks at each picture (thumbnail via the Read tool) and writes 6–12 Vietnamese tags: subject, place, mood, colours.
export async function autoTag({ ids, all = false, model = 'sonnet', onTick } = {}) {
  const items = load(), todo = items.filter(x => (ids ? ids.includes(x.id) : all || !x.tagged));
  if (!todo.length) return { tagged: 0 };
  const prompt = `Bạn gắn thẻ cho thư viện b-roll của một người làm video tiếng Việt. Hãy dùng công cụ Read mở từng ảnh dưới đây (đường dẫn tương đối trong thư mục hiện tại), rồi viết cho mỗi ảnh 6–12 thẻ TIẾNG VIỆT có dấu, viết thường: chủ thể, đồ vật, địa điểm, hành động, cảm xúc/không khí, ngành nghề liên quan (vd: "quán cà phê, ly cà phê, buổi sáng, ấm cúng, đồ uống, kinh doanh f&b"). Không bịa tên người hay thương hiệu.
Trả về DUY NHẤT một object JSON {"<id>": ["thẻ", …], …}.
${todo.map(x => `- ${x.id}: ${x.thumb}`).join('\n')}`;
  const out = await new Promise((ok, bad) => {
    const p = spawnClaude(['-p', '--output-format', 'json', '--model', model, '--allowedTools', 'Read'], { cwd: LIB, stdio: ['pipe', 'pipe', 'pipe'] });
    p.stdin.on('error', () => {}); p.stdin.end(prompt);
    let o = '', e = ''; const tick = setInterval(() => onTick?.(), 1000), tm = setTimeout(() => { p.kill(); bad(new Error('Claude quá 5 phút')); }, 300000);
    p.stdout.on('data', d => (o += d)); p.stderr.on('data', d => (e += d));
    p.on('error', () => { clearInterval(tick); clearTimeout(tm); bad(new Error('Không tìm thấy Claude Code CLI (lệnh "claude")')); });
    p.on('close', c => { clearInterval(tick); clearTimeout(tm); c ? bad(new Error(`claude -p lỗi (mã ${c}): ${(e || o).slice(-200)}`)) : ok(o); });
  });
  let txt = out; try { txt = JSON.parse(out).result ?? out; } catch {}
  const m = String(txt).match(/\{[\s\S]*\}/); if (!m) throw new Error('Claude không trả về JSON');
  const got = JSON.parse(m[0]); let n = 0;
  for (const it of items) if (Array.isArray(got[it.id])) { it.tags = [...new Set([...tagList(got[it.id]), ...it.tags])].slice(0, 24); it.tagged = 'claude'; n++; }
  save(items);
  return { tagged: n };
}

// Items whose tags appear in the text (2-word tags count more), best first.
export function search(text, { n = 5, exclude = new Set() } = {}) {
  const f = ' ' + fold(text).replace(/[^a-z0-9%]+/g, ' ') + ' ';
  const out = [];
  for (const it of load()) {
    if (exclude.has(it.id)) continue;
    let s = 0;
    for (const t of it.tags) { const k = fold(t).replace(/[^a-z0-9%]+/g, ' ').trim(); if (k.length > 1 && f.includes(' ' + k + ' ')) s += 1 + (k.split(' ').length - 1) * 1.5; }
    if (s > 0) out.push({ ...it, score: s });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}

// Copy an item into <project>/media/lib_<id>… and return what a photo scene's "media" takes.
export function useIn(it, projectDir) {
  const md = path.join(projectDir, 'media'); fs.mkdirSync(md, { recursive: true });
  const dst = path.join(md, 'lib_' + it.file);
  if (!fs.existsSync(dst)) fs.copyFileSync(path.join(LIB, it.file), dst);
  if (it.kind === 'image') return `media/lib_${it.file}`;
  const fr = path.join(md, `lib_${it.id}_frames`);
  if (!fs.existsSync(fr)) fs.cpSync(path.join(LIB, it.id + '_frames'), fr, { recursive: true });
  return { seq: `media/lib_${it.id}_frames/%05d.jpg`, fps: 30, count: it.frames };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const J = o => console.log(JSON.stringify(o, null, 1));
  try {
    if (a[0] === 'add') { const files = a.slice(1).filter((x, i, arr) => !x.startsWith('--') && arr[i] !== opt('--tags')); for (const f of files) J(add(f, { tags: opt('--tags', '') })); }
    else if (a[0] === 'list') J(load());
    else if (a[0] === 'rm') J({ removed: remove(a[1]) });
    else if (a[0] === 'tags') J(setTags(a[1], a[2]));
    else if (a[0] === 'tag') J(await autoTag({ all: a.includes('--all'), model: opt('--model', 'sonnet') }));
    else if (a[0] === 'search') J(search(a[1] || '', { n: +opt('--n', 5) }).map(x => ({ id: x.id, score: x.score, tags: x.tags })));
    else console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 6).join('\n'));
  } catch (e) { console.error('LỖI: ' + e.message); process.exit(1); }
}
