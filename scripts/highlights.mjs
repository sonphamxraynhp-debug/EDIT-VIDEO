// Video dài → nhiều clip ngắn (highlights). Spec: references/longform-topic.md
// usage:
//   node scripts/highlights.mjs <long_video> --out <dir> [--n 6] [--min 20 --max 60] [--orient vertical|horizontal]
//        [--model large-v3-turbo] [--claude-model sonnet] [--chunk 480] [--min-score 40] [--pack slate] [--export] [--quality 1080]
//   node scripts/highlights.mjs --export <out_dir> [--only 1,3] [--quality 720|1080]      (render projects listed in highlights.json)
// 1. Transcribe the whole video once (transcribe.py, cached in $AVS_HOME/cache/transcripts/), silences via ffmpeg silencedetect.
// 2. Sentences → chunks of ≤ --chunk seconds (bounded prompt) → `claude -p` picks self-contained moments per chunk (JSON),
//    a short re-rank pass when there are several chunks; boundaries snap to sentence/word edges and silences; dedupe (time + text).
// 3. Each pick → a full project folder made like Studio's newProject (trimmed source, cut.py, frames, captions). Horizontal source
//    into a vertical project: TL.clips + clip.reframe from face_track.py so the speaker stays centred.
// Writes <out>/highlights.json [{dir, title, hook, t0, t1, dur, score, reason, thumb, mode}] and prints "@@ <0..1> <step>".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { callClaude, parseJson } from './ai_edit.mjs';
import { pyBin } from './platform.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL = path.resolve(HERE, '..');
export const PY = pyBin(HERE);
export const AVS_HOME = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
const S = f => path.join(HERE, f);
export const say = (p, s) => console.log(`@@ ${Math.max(0, Math.min(1, p)).toFixed(3)} ${s}`);
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
export const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
export const slug = s => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'clip';
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function sh(cmd, argv, { onLine, cwd } = {}) {
  return new Promise((ok, bad) => {
    const p = spawn(cmd, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const feed = d => { const s = d.toString(); tail = (tail + s).slice(-3000); if (onLine) s.split(/[\r\n]/).forEach(l => l && onLine(l)); };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', e => bad(new Error(e.code === 'ENOENT' ? `không tìm thấy lệnh ${cmd}` : e.message)));
    p.on('close', code => code === 0 ? ok(tail) : bad(new Error(`${path.basename(cmd)} lỗi (mã ${code}): ${tail.split('\n').filter(l => l.trim() && !/^\s+at |^Node\.js v/.test(l)).slice(-3).join(' | ')}`)));
  });
}
export function probe(file) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:stream_tags=rotate:stream_side_data=rotation:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
  const v = (j.streams || []).find(s => s.codec_type === 'video');
  let w = v?.width || 0, h = v?.height || 0;
  const rot = Math.abs(+(v?.tags?.rotate || v?.side_data_list?.find(x => x.rotation != null)?.rotation || 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  return { dur: +j.format.duration || 0, w, h, audio: (j.streams || []).some(s => s.codec_type === 'audio') };
}

// ---------- transcript (cached) + silences ----------
async function transcript(src, model, dur) {
  const st = fs.statSync(src);
  const key = crypto.createHash('sha1').update(`${path.resolve(src)}|${st.size}|${st.mtimeMs}|${model}`).digest('hex').slice(0, 16);
  const dir = path.join(AVS_HOME, 'cache/transcripts'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${key}.json`);
  if (fs.existsSync(f)) { const c = JSON.parse(fs.readFileSync(f, 'utf8')); if (c.words) { say(.3, 'Dùng lại bản nhận giọng đã lưu (cache)'); return c; } }
  const t0 = Date.now(), segs = [];
  say(.01, `Nhận dạng giọng nói toàn bộ video (whisper ${model}, ${mmss(dur)})`);
  // whisper segments (printed by transcribe.py) are the phrase boundaries: Vietnamese output has almost no punctuation
  await sh(PY, ['-I', '-X', 'utf8', S('transcribe.py'), src, f + '.part', '--model', model], { onLine: l => {
    const m = /^\[\s*([\d.]+)-\s*([\d.]+)\]/.exec(l);
    if (!m) return;
    segs.push([+m[1], +m[2]]);
    if (dur) { const k = +m[2] / dur, el = (Date.now() - t0) / 1000; say(.01 + .29 * k, `Nhận giọng ${mmss(+m[2])}/${mmss(dur)}${k > .05 ? ` · còn ~${Math.round(el / k * (1 - k) / 60) || '<1'} phút` : ''}`); }
  } });
  const c = { words: JSON.parse(fs.readFileSync(f + '.part', 'utf8')), segs };
  fs.writeFileSync(f, JSON.stringify(c)); fs.rmSync(f + '.part', { force: true }); fs.rmSync(f + '.part.16k.wav', { force: true });
  return c;
}
async function silences(src) {
  const out = [];
  let cur = null;
  await sh('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-af', 'silencedetect=noise=-35dB:d=0.25', '-f', 'null', '-'], { onLine: l => {
    let m;
    if ((m = /silence_start: ([\d.]+)/.exec(l))) cur = +m[1];
    if ((m = /silence_end: ([\d.]+)/.exec(l)) && cur != null) { out.push([cur, +m[1]]); cur = null; }
  } }).catch(() => {});
  return out;
}
// Sentences: whisper segments when known, split further at punctuation, a pause > 0.7 s, or > 28 words (next comma / largest pause).
export function sentences(words, segs = []) {
  const out = []; let cur = [];
  const segOf = w => { const m = (w.s + w.e) / 2; return segs.findIndex(([a, b]) => m >= a - .05 && m <= b + .05); };
  const flush = () => { if (cur.length) out.push({ i: out.length, w0: cur[0].k, w1: cur[cur.length - 1].k, s: cur[0].s, e: cur[cur.length - 1].e, text: cur.map(w => w.w).join(' ') }); cur = []; };
  let si = segs.length ? segOf(words[0]) : -1;
  words.forEach((w, k) => {
    const nx = words[k + 1];
    cur.push({ ...w, k });
    const gap = nx ? nx.s - w.e : 9;
    let segEnd = false;
    if (nx && segs.length) { const ns = segOf(nx); if (ns !== si && ns >= 0) { segEnd = true; si = ns; } }
    if (segEnd || /[.?!…]$/.test(w.w) || gap > .7 || (cur.length > 28 && (/[,;:]$/.test(w.w) || gap > .25)) || cur.length > 40) flush();
  });
  flush();
  return out;
}

// ---------- Claude: pick moments ----------
function chunkSentences(sents, chunkSec, maxChars = 15000) {
  const chunks = []; let i = 0;
  while (i < sents.length) {
    let j = i, chars = 0;
    while (j < sents.length && (sents[j].e - sents[i].s <= chunkSec || j === i) && chars + sents[j].text.length < maxChars) chars += sents[j++].text.length + 20;
    chunks.push(sents.slice(i, j));
    if (j >= sents.length) break;
    // overlap ~60 s so a moment on a chunk border is seen whole by one of the two calls
    let k = j; while (k > i + 1 && sents[j - 1].e - sents[k - 1].s < 60) k--;
    i = Math.max(i + 1, k);
  }
  return chunks;
}
function pickPrompt(chunk, o, k, total) {
  const lines = chunk.map(s => `[${s.i}] ${mmss(s.s)} (${(s.e - s.s).toFixed(1)}s) ${s.text}`).join('\n');
  return `Bạn là biên tập viên video ngắn (TikTok/Reels/Shorts) người Việt. Dưới đây là lời thoại (đã nhận dạng tự động, có thể sai chính tả) của MỘT ĐOẠN trong một video dài ${mmss(total)}. Mỗi dòng: [số câu] thời điểm bắt đầu (độ dài) nội dung.

${lines}

Nhiệm vụ: đề xuất ${k} khoảnh khắc TỰ ĐỨNG ĐƯỢC (xếp theo chất lượng, chấm điểm thật thà — đoạn yếu thì điểm thấp, máy sẽ lọc theo điểm) để cắt thành video ngắn, mỗi khoảnh khắc là một dải câu liên tiếp [from..to], tổng độ dài ${o.min}–${o.max} giây (cộng độ dài các câu).
Tiêu chí bắt buộc:
- 3 giây đầu là HOOK mạnh: câu mở là câu hỏi, khẳng định gây tò mò, con số, mâu thuẫn hoặc lời hứa lợi ích. Không mở bằng câu chào, câu nối ("và", "thì", "còn nữa", "thứ hai là").
- Ý trọn vẹn: có đầu có kết, câu cuối khép lại ý (không bỏ lửng giữa chừng).
- Không có tham chiếu treo: không nhắc tới thứ người xem không thấy ("như tôi vừa nói", "cái này", "ở trên", "phần trước").
- Ưu tiên giá trị thật: mẹo cụ thể, câu chuyện có kết, quan điểm mạnh, số liệu. Các khoảnh khắc không trùng nhau; nội dung lặp lại (cùng lời nói ở nhiều chỗ) chỉ chọn một lần. Hãy đề xuất đủ ${k} khoảnh khắc khác ý nhau nếu đoạn đủ dài (một phần nói dài có thể cho 2 clip khác ý); chỉ trả ít hơn khi thật sự không còn đoạn nào khác ý và đủ độ dài.
Với mỗi khoảnh khắc, viết:
- "title": tiêu đề đăng video ≤ 60 ký tự, tiếng Việt có dấu.
- "hook": chữ hiện trên màn hình 2 giây đầu, ≤ 40 ký tự, giật tò mò nhưng đúng nội dung.
- "score": 0–100 (khả năng giữ chân người xem: hook × độ trọn ý × giá trị).
- "reason": 1 câu ngắn vì sao chọn.

Chỉ trả về DUY NHẤT JSON (không markdown): {"clips":[{"from":12,"to":19,"title":"…","hook":"…","score":82,"reason":"…"}]}`;
}
function rerankPrompt(cands, n) {
  const lines = cands.map((c, i) => `#${i} (${Math.round(c.dur)}s, điểm ${c.score}) ${c.title} | hook: ${c.hook}\n   ${c.text.slice(0, 260)}${c.text.length > 260 ? '…' : ''}`).join('\n');
  return `Bạn là biên tập viên video ngắn. Đây là các ứng viên clip ngắn cắt từ cùng một video dài (điểm do từng lượt chấm riêng, chưa đồng đều):

${lines}

Chọn ${n} clip TỐT NHẤT (hook mạnh trong 3 giây đầu, ý trọn vẹn, không tham chiếu treo, không trùng nội dung nhau) và chấm lại điểm 0–100 trên cùng thang. Có thể sửa title/hook cho hay hơn (title ≤ 60 ký tự, hook ≤ 40 ký tự).
Chỉ trả về JSON: {"picks":[{"id":3,"score":88,"title":"…","hook":"…"}]} theo thứ tự tốt nhất trước.`;
}
async function ask(prompt, model, label, p) {
  let last;
  for (let a = 0; a < 2; a++) {
    const t0 = Date.now();
    const res = await callClaude(a ? `${prompt}\n\nLần trước bạn trả lời không phải JSON hợp lệ (${last}). Chỉ trả về JSON.` : prompt, model,
      () => { const s = Math.round((Date.now() - t0) / 1000); if (s % 5 === 0) say(p, `${label}… ${s}s`); });
    try { return parseJson(res); } catch (e) { last = e.message; }
  }
  throw new Error(`Claude không trả về JSON hợp lệ (${label}): ${last}`);
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}
const jacc = (a, b) => { const A = new Set(fold(a).split(/\W+/).filter(w => w.length > 1)), B = new Set(fold(b).split(/\W+/).filter(w => w.length > 1)); let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.max(1, Math.min(A.size, B.size)); };

// Snap [t0, t1] to word edges + silences so no word is clipped and the cut lands in a pause.
function snap(words, sil, w0, w1, total) {
  const a = words[w0], b = words[w1], prevE = w0 ? words[w0 - 1].e : 0, nextS = words[w1 + 1] ? words[w1 + 1].s : total;
  let t0 = a.s, t1 = b.e;
  const s0 = sil.find(([ss, se]) => se >= t0 - .6 && se <= t0 + .05);
  t0 = s0 ? Math.max(s0[0], s0[1] - .12, prevE) : Math.max(prevE, t0 - .1);
  const s1 = sil.find(([ss]) => ss >= t1 - .05 && ss <= t1 + .6);
  t1 = s1 ? Math.min(s1[1], s1[0] + .15, nextS) : Math.min(nextS, t1 + .15);
  return [r3(Math.max(0, t0)), r3(Math.min(total, Math.max(t1, b.e)))];
}

export async function findHighlights(src, o) {
  const info = probe(src);
  if (!info.audio) throw new Error('Video không có tiếng — không tìm được đoạn nói hay.');
  const tr = await transcript(src, o.model, info.dur), words = tr.words.filter(w => w.w && w.e > w.s);
  if (words.length < 20) throw new Error(`Nhận giọng chỉ được ${words.length} từ — video quá ngắn hoặc không có lời nói.`);
  say(.31, 'Dò khoảng lặng');
  const sil = await silences(src);
  const sents = sentences(words, tr.segs || []);
  const chunks = chunkSentences(sents, o.chunk);
  const k = Math.min(6, Math.max(2, Math.ceil(o.n * 2 / chunks.length)));
  say(.33, `Claude đọc ${sents.length} câu trong ${chunks.length} phần để chọn khoảnh khắc hay`);
  let done = 0;
  const raw = await pool(chunks, 3, async (ch, ci) => {
    const r = await ask(pickPrompt(ch, o, k, info.dur), o.claudeModel, `Claude chọn khoảnh khắc (phần ${ci + 1}/${chunks.length})`, .33 + .3 * done / chunks.length);
    done++; say(.33 + .3 * done / chunks.length, `Đã đọc ${done}/${chunks.length} phần`);
    return (r.clips || []).map(c => ({ ...c, chunk: ci }));
  });
  // validate: indices inside the chunk, duration within [min, max] (extend/shrink by whole sentences)
  let cands = [];
  for (const c of raw.flat()) {
    const ch = chunks[c.chunk], lo = ch[0].i, hi = ch[ch.length - 1].i;
    let f = Math.round(+c.from), t = Math.round(+c.to);
    if (!(f >= lo && t <= hi && f <= t)) continue;
    const d = () => sents[t].e - sents[f].s;
    while (d() < o.min && t < sents.length - 1 && sents[t + 1].e - sents[f].s <= o.max) t++;
    while (d() > o.max && t > f) t--;
    if (d() < o.min * .75 || d() > o.max * 1.15) continue;
    const [t0, t1] = snap(words, sil, sents[f].w0, sents[t].w1, info.dur);
    cands.push({ from: f, to: t, t0, t1, dur: r2(t1 - t0), score: Math.max(0, Math.min(100, Math.round(+c.score || 50))),
      title: String(c.title || '').trim().slice(0, 80) || sents[f].text.slice(0, 60), hook: String(c.hook || '').trim().slice(0, 60),
      reason: String(c.reason || '').trim(), text: sents.slice(f, t + 1).map(s => s.text).join(' '), w0: sents[f].w0, w1: sents[t].w1 });
  }
  const dedupe = list => {
    const keep = [];
    for (const c of [...list].sort((a, b) => b.score - a.score)) {
      const dup = keep.some(x => { const ov = Math.min(x.t1, c.t1) - Math.max(x.t0, c.t0); return ov > .3 * Math.min(x.dur, c.dur) || jacc(x.text, c.text) > .6; });
      if (!dup) keep.push(c);
    }
    return keep;
  };
  cands = dedupe(cands);
  const strong = cands.filter(c => c.score >= o.minScore);
  if (strong.length) cands = strong;
  if (!cands.length) throw new Error('Claude không tìm được đoạn nào đạt (độ dài ' + o.min + '–' + o.max + ' s, hook mạnh, ý trọn vẹn). Thử nới --min/--max.');
  let picks = cands.slice(0, o.n);
  if (chunks.length > 1 && cands.length > o.n) {
    say(.64, `Claude xếp hạng lại ${cands.length} ứng viên`);
    const pool2 = cands.slice(0, Math.min(cands.length, o.n * 3));
    try {
      const r = await ask(rerankPrompt(pool2, o.n), o.claudeModel, 'Claude xếp hạng lại', .64);
      const sel = [];
      for (const p of r.picks || []) { const c = pool2[+p.id]; if (c && !sel.includes(c)) sel.push(Object.assign(c, { score: Math.round(+p.score || c.score), title: String(p.title || c.title).slice(0, 80), hook: String(p.hook || c.hook).slice(0, 60) })); }
      if (sel.length) picks = sel.slice(0, o.n);
    } catch (e) { console.error('xếp hạng lại lỗi, dùng điểm từng phần: ' + e.message); }
  }
  return { info, words, picks: picks.sort((a, b) => b.score - a.score), candidates: cands, raw: raw.flat(), sentences: sents.length, chunks: chunks.length };
}

// ---------- one highlight → project folder (same steps as Studio's newProject) ----------
export async function buildProject(src, h, dir, o, info, words, onStep = () => {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'work/frames'), { recursive: true }); fs.mkdirSync(path.join(dir, '.studio'), { recursive: true });
  const W = f => path.join(dir, 'work', f);
  onStep('cắt đoạn nguồn');
  await sh('ffmpeg', ['-v', 'error', '-y', '-ss', String(h.t0), '-i', src, '-t', String(r3(h.t1 - h.t0)), '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', W('source.mp4')]);
  // words of the trimmed span (no second whisper pass)
  const ws = words.slice(h.w0, h.w1 + 1).map(w => ({ w: w.w, s: r3(Math.max(0, w.s - h.t0)), e: r3(Math.min(h.t1 - h.t0, w.e - h.t0)) }));
  fs.writeFileSync(W('words_raw.json'), JSON.stringify(ws, null, 1));
  onStep('cắt khoảng lặng');
  await sh(PY, ['-I', '-X', 'utf8', S('cut.py'), W('source.mp4'), W('words_raw.json'), path.join(dir, 'work')]);
  const vertSrc = info.h > info.w, vert = o.orient !== 'horizontal';
  const mode = vert && !vertSrc ? 'reframe' : !vert && vertSrc ? 'blurfill' : 'crop';
  const [FW, FH] = vert ? [720, 1280] : [1280, 720];
  onStep('trích khung hình');
  const vf = mode === 'reframe' ? 'scale=-2:720' : mode === 'blurfill' ? 'scale=-2:1280' : `scale=${FW}:${FH}:force_original_aspect_ratio=increase,crop=${FW}:${FH}`;
  await sh('ffmpeg', ['-v', 'error', '-y', '-i', W('aroll.mp4'), '-vf', vf, '-q:v', '3', path.join(dir, 'work/frames/%05d.jpg')]);
  const count = fs.readdirSync(path.join(dir, 'work/frames')).filter(f => f.endsWith('.jpg')).length, dur = r2(count / 30);
  let face = vert ? { x: 360, y: 520 } : { x: 640, y: 300 }, clips = null, track = null;
  if (mode === 'reframe') {
    onStep('bám mặt (đổi khung ngang → dọc)');
    const cache = path.join(dir, '.studio/facetrack/work_frames.json'); fs.mkdirSync(path.dirname(cache), { recursive: true });
    await sh(PY, ['-I', '-X', 'utf8', S('face_track.py'), path.join(dir, 'work/frames'), '--src-fps', '30', '--fps', '5', '--out', cache]);
    track = JSON.parse(fs.readFileSync(cache, 'utf8'));
    face = { x: 360, y: 538 };
    clips = [{ src: { seq: 'work/frames/%05d.jpg', fps: 30, count }, audio: 'work/aroll.mp4', in: 0, out: dur, fit: 'cover', ar: r3(track.w / track.h),
      reframe: track.keys.map(x => ({ t: x.t, ox: x.ox, oy: x.oy })) }];
  } else if (mode === 'blurfill') {
    clips = [{ src: { seq: 'work/frames/%05d.jpg', fps: 30, count }, audio: 'work/aroll.mp4', in: 0, out: dur, fit: 'blurfill' }];
  } else {
    onStep('tìm vị trí mặt');
    await sh(PY, ['-I', '-X', 'utf8', S('find_face.py'), path.join(dir, 'work/frames'), '--design', `${FW}x${FH}`], { onLine: l => { try { const f = JSON.parse(l); if (f.x != null) face = f; } catch {} } }).catch(() => {});
  }
  onStep('tạo phụ đề');
  await sh(PY, ['-I', '-X', 'utf8', S('captions.py'), W('words.json'), W('captions.json'), '--max', '4']);
  const caps = JSON.parse(fs.readFileSync(W('captions.json'), 'utf8'));
  for (const c of caps) for (const w of c.words) w.w = w.w.replace(/[.,!?]+$/, '').toLowerCase();
  fs.writeFileSync(W('captions.json'), JSON.stringify(caps, null, 1));
  const total = r2(dur + 2.5);
  const tl = {
    width: vert ? 1080 : 1920, height: vert ? 1920 : 1080, fps: 30, duration: total,
    pack: o.pack, _starter: { pack: o.pack, title: h.title, dur: total },
    ...(clips ? { clips } : { aroll: { frames: 'work/frames/%05d.jpg' } }), face, title: h.title,
    caption_style: 'slate', captions: 'work/captions.json',
    scenes: [
      { type: 'frame_grid', t0: 0, t1: dur, badge: { icon: 'si:claude' } },
      { type: 'title_card', t0: dur, t1: total, question: 'Bạn thấy sao?' },
    ],
    audio: { voice: 'work/aroll.mp4', mix: 'work/mix.wav', music: [{ t0: 0, t1: total, mood: 'tech', gain: -20 }], sfx: [] },
    _highlight: { source: path.resolve(src), t0: h.t0, t1: h.t1, title: h.title, hook: h.hook, score: h.score, reason: h.reason, mode },
  };
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(tl, null, 1));
  fs.writeFileSync(path.join(dir, '.studio/highlight.json'), JSON.stringify({ ...h, text: h.text, mode }, null, 1));
  // preview still (what the vertical frame will show; reframe → crop around the tracked face)
  const fr = String(Math.min(count, 31)).padStart(5, '0');
  let tvf = 'scale=360:-2';
  if (mode === 'reframe') { const k0 = track.keys.find(k => k.t >= 1) || track.keys[0] || { ox: 50 }; tvf = `crop=ih*9/16:ih:max(0\\,min(iw-ih*9/16\\,iw*${(k0.ox / 100).toFixed(3)}-ih*9/32)):0,scale=360:-2`; }
  if (mode === 'blurfill') tvf = 'scale=-2:360';
  await sh('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dir, 'work/frames', `${fr}.jpg`), '-vf', tvf, '-q:v', '4', path.join(dir, '.studio/thumb.jpg')]).catch(() => {});
  fs.rmSync(W('source.mp4'), { force: true }); // aroll.mp4 is the cut copy; the trimmed source is not needed any more
  return { dir, dur: total, mode, face, track: track ? { found: track.found, cuts: track.cuts.length } : null };
}

// ---------- export (mix + render) of one project folder ----------
export async function exportProject(dir, { quality = '1080', onProgress = () => {} } = {}) {
  const tlFile = path.join(dir, 'timeline.json'), tl = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  let mix = null;
  if (tl.audio && (tl.audio.voice || tl.audio.music?.length || tl.audio.sfx?.length || tl.audio.tracks?.length || tl.clips?.some(c => c.audio))) {
    onProgress(0, 'trộn âm thanh');
    await sh(PY, ['-I', '-X', 'utf8', S('mix_audio.py'), tlFile]);
    mix = path.resolve(dir, tl.audio.mix || 'work/mix.wav');
  }
  const vert = (tl.height || 720) > (tl.width || 1280), [Wd, Hd] = quality === '720' ? [720, 1280] : [1080, 1920];
  const tmp = path.join(dir, `.export_${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ ...tl, width: vert ? Wd : Hd, height: vert ? Hd : Wd }));
  const out = path.join(dir, 'out', `${path.basename(dir)}.mp4`), part = out.replace(/\.mp4$/, '.part.mp4');
  const go = w => sh('node', [S('render.mjs'), tmp, part, ...(mix ? ['--audio', mix] : []), ...(w ? ['--workers', String(w)] : [])], { onLine: l => { const m = /([\d.]+)s \/ ([\d.]+)s/.exec(l); if (m) onProgress(Math.min(.99, +m[1] / +m[2]), 'render'); } });
  try {
    // one retry with fewer Chrome workers (a busy machine can time a worker out)
    await go().catch(e => { console.error('render lỗi, thử lại với 2 luồng: ' + e.message.slice(0, 200)); return go(2); });
  } finally { fs.rmSync(tmp, { force: true }); }
  fs.renameSync(part, out);
  return out;
}
async function exportAll(outDir, { only, quality }) {
  const f = path.join(outDir, 'highlights.json');
  if (!fs.existsSync(f)) throw new Error(`không thấy ${f}`);
  const list = JSON.parse(fs.readFileSync(f, 'utf8'));
  const idx = only ? String(only).split(',').map(x => +x - 1) : list.map((_, i) => i);
  for (const [n, i] of idx.entries()) {
    const it = list[i]; if (!it) continue;
    const base = n / idx.length, span = 1 / idx.length;
    say(base, `Xuất ${n + 1}/${idx.length}: ${it.title}`);
    it.mp4 = await exportProject(it.dir, { quality, onProgress: (k, s) => say(base + span * k, `Xuất ${n + 1}/${idx.length} (${s}) ${Math.round(k * 100)}%`) });
    fs.writeFileSync(f, JSON.stringify(list, null, 1));
  }
  say(1, 'Xong');
  return list;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
  if (args[0] === '--export') { const l = await exportAll(path.resolve(args[1]), { only: opt('--only'), quality: opt('--quality', '1080') }); console.log('RESULT ' + JSON.stringify({ items: l, outputs: l.map(x => x.mp4).filter(Boolean) })); return; }
  const src = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : null;
  if (!src) throw new Error('cách dùng: node scripts/highlights.mjs <video dài> --out <thư mục> [--n 6] [--min 20 --max 60] [--orient vertical|horizontal]');
  if (!fs.existsSync(src)) throw new Error(`không thấy video ${src}`);
  const o = { n: Math.max(1, Math.min(20, +opt('--n', 6))), min: +opt('--min', 20), max: +opt('--max', 60), orient: opt('--orient', 'vertical'),
    model: opt('--model', 'large-v3-turbo'), claudeModel: opt('--claude-model', 'sonnet'), chunk: Math.max(60, +opt('--chunk', 480)), pack: opt('--pack', 'slate'), minScore: +opt('--min-score', 40) };
  if (!(o.min > 3 && o.max > o.min)) throw new Error('--min/--max không hợp lệ');
  const out = path.resolve(opt('--out', path.join(path.dirname(src), path.basename(src, path.extname(src)) + '_highlights')));
  fs.mkdirSync(out, { recursive: true });
  const r = await findHighlights(src, o);
  fs.writeFileSync(path.join(out, 'candidates.json'), JSON.stringify({ source: src, duration: r.info.dur, sentences: r.sentences, chunks: r.chunks, candidates: r.candidates.map(({ w0, w1, ...c }) => c), claude_raw: r.raw }, null, 1));
  say(.66, `Chọn được ${r.picks.length} đoạn — dựng dự án`);
  const list = [];
  for (const [i, h] of r.picks.entries()) {
    const dir = path.join(out, `${String(i + 1).padStart(2, '0')}_${slug(h.title)}`);
    const base = .66 + .33 * i / r.picks.length;
    const b = await buildProject(src, h, dir, o, r.info, r.words, s => say(base, `Dự án ${i + 1}/${r.picks.length}: ${s}`));
    const { w0, w1, ...rest } = h;
    list.push({ dir, title: h.title, hook: h.hook, t0: h.t0, t1: h.t1, dur: b.dur, score: h.score, reason: h.reason, text: h.text, mode: b.mode, thumb: path.join(dir, '.studio/thumb.jpg'), source: src });
    fs.writeFileSync(path.join(out, 'highlights.json'), JSON.stringify(list, null, 1));
  }
  if (args.includes('--export')) await exportAll(out, { quality: opt('--quality', '1080') });
  say(1, 'Xong');
  console.log('RESULT ' + JSON.stringify({ out, highlights: path.join(out, 'highlights.json'), n: list.length, outputs: list.map(x => x.dir) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
