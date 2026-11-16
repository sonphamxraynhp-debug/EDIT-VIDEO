// Chủ đề → video (không cần quay). Spec: references/longform-topic.md
// usage: node scripts/topic_video.mjs "<chủ đề>" --out <dir> [--dur 45] [--voice Linh|edge:vi-VN-HoaiMyNeural] [--rate 190]
//        [--orient vertical|horizontal] [--pack kinetic] [--images <dir | a.jpg,b.jpg>] [--stock] [--handle @kenh]
//        [--claude-model sonnet] [--model large-v3-turbo] [--export] [--quality 1080]
// 1. Claude writes a Vietnamese short-video script (hook, 3–5 beats, CTA) with on-screen text + visual intent per beat (JSON).
// 2. TTS per line (macOS `say -v Linh` offline; edge-tts if installed and asked for), real durations measured, lines joined
//    into work/voice.wav; word timings by re-transcribing the TTS audio with transcribe.py and aligning to the script words.
// 3. Main track = graphics: procedural b-roll presets (assets/broll/catalog.json) + kinetic text scenes, optional user images /
//    stock photos (broll_fetch.py) as stills on TL.clips; a still background clip carries the voice. Music + SFX: auto_sfx.py.
// Output: one project folder (opens in Studio) + script.json; --export renders out/<name>.mp4. Progress: "@@ <0..1> <step>".
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { callClaude, parseJson } from './ai_edit.mjs';
import { sh, say, probe, fold, slug, exportProject, PY, SKILL } from './highlights.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = f => path.join(HERE, f);
const r2 = v => Math.round(v * 100) / 100;
const MOODS = ['tech', 'corporate_upbeat', 'happy', 'hype', 'inspire', 'lofi', 'mellow', 'suspense', 'epic', 'acoustic_warm', 'real_estate_luxury', 'news_bg', 'piano_minimal'];
const VISUALS = ['broll', 'number', 'words', 'versus', 'list'];

function scriptPrompt(topic, dur, nBeats) {
  const words = Math.round(dur * 2.7);
  return `Bạn là biên kịch video ngắn (TikTok/Reels/Shorts) tiếng Việt. Viết kịch bản cho chủ đề:
"${topic}"

Video dài khoảng ${dur} giây, đọc bằng giọng máy (TTS) — tổng lời đọc khoảng ${words} từ (±10%). Không có cảnh quay người thật: hình là đồ hoạ chữ động + b-roll minh hoạ.
Cấu trúc:
- "hook": 1 câu đọc (≤ 18 từ) gây tò mò trong 3 giây đầu (câu hỏi, con số, mâu thuẫn, lời hứa lợi ích). "screen" = chữ trên màn hình ≤ 28 ký tự, "screen2" = dòng phụ ≤ 24 ký tự.
- "beats": ${nBeats} ý chính, mỗi ý 1–2 câu đọc, cụ thể, có ví dụ/số liệu hợp lý (không bịa số liệu thống kê giả mạo nguồn).
  Mỗi beat có: "say" (lời đọc), "screen" (từ khoá trên màn hình ≤ 22 ký tự), "sub" (dòng nhỏ ≤ 26 ký tự, có thể rỗng),
  "visual" ∈ ${VISUALS.join(' | ')}:
    broll = minh hoạ chủ đề (cần "broll": 2–5 từ tiếng Việt mô tả hình, vd "điện thoại bán hàng", "doanh thu tăng"),
    number = có một con số nổi bật (cần "num": số, "unit": "%"/"triệu"/""…),
    words = câu chốt/khái niệm (screen là cụm 2–4 từ mạnh),
    versus = so sánh 2 bên (cần "items": ["A","B"] mỗi bên ≤ 12 ký tự),
    list = liệt kê (cần "items": 3–4 mục ≤ 22 ký tự).
  Thêm "emoji": 1 emoji hợp nội dung. Dùng visual đa dạng, ít nhất 2 beat dạng broll.
- "cta": "say" (1 câu kêu gọi theo dõi/bình luận), "screen" ≤ 22 ký tự, "button" ≤ 12 ký tự (vd "FOLLOW").
- "title" (tiêu đề đăng ≤ 60 ký tự), "caption" (mô tả đăng 1–2 câu), "hashtags" (3–6, không dấu #), "mood" ∈ ${MOODS.join(', ')}.
Lời đọc: câu ngắn, tự nhiên, xưng "bạn", có dấu đầy đủ, viết số bằng chữ số khi là số liệu (TTS đọc được), không emoji/ký hiệu lạ trong "say".

Chỉ trả về DUY NHẤT JSON (không markdown):
{"title":"…","caption":"…","hashtags":["…"],"mood":"tech","hook":{"say":"…","screen":"…","screen2":"…"},"beats":[{"say":"…","screen":"…","sub":"…","visual":"broll","broll":"…","emoji":"💡"}],"cta":{"say":"…","screen":"…","button":"FOLLOW"}}`;
}

// ---------- TTS ----------
function hasEdge() { try { execFileSync(process.platform === 'win32' ? 'where' : '/bin/sh', process.platform === 'win32' ? ['edge-tts'] : ['-lc', 'command -v edge-tts'], { stdio: 'pipe' }); return 'edge-tts'; } catch {} const b = path.join(path.dirname(PY), process.platform === 'win32' ? 'edge-tts.exe' : 'edge-tts'); return fs.existsSync(b) ? b : null; }
async function tts(text, voice, rate, outWav) {
  const tmp = outWav.replace(/\.wav$/, '.src');
  if (process.platform !== 'darwin' && !voice.startsWith('edge:')) voice = 'edge:vi-VN-HoaiMyNeural'; // `say` voices exist only on macOS
  if (voice.startsWith('edge:')) {
    const exe = hasEdge(); if (!exe) throw new Error('chưa cài edge-tts (pip install edge-tts) — dùng --voice Linh để đọc offline');
    await sh(exe, ['--voice', voice.slice(5), '--text', text, '--write-media', tmp + '.mp3']); fs.renameSync(tmp + '.mp3', tmp);
  } else {
    await sh('say', ['-v', voice || 'Linh', '-r', String(rate), '-o', tmp + '.aiff', text]); fs.renameSync(tmp + '.aiff', tmp);
  }
  // trim leading/trailing silence, 48 kHz stereo
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse';
  await sh('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-af', trim, '-ar', '48000', '-ac', '2', outWav]);
  fs.rmSync(tmp, { force: true });
  return probe(outWav).dur;
}

// ---------- alignment: script words ← whisper timings on the TTS audio ----------
const norm = w => fold(w).replace(/[^a-z0-9]/g, '');
function lcsAlign(a, b) { // a, b arrays of normalized tokens → pairs [i, j]
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] && a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] && a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  return pairs;
}
export function alignLine(text, s, e, heard) {
  const toks = text.split(/\s+/).filter(Boolean);
  const out = toks.map(w => ({ w, s: null, e: null }));
  const hw = heard.filter(x => (x.s + x.e) / 2 >= s - .05 && (x.s + x.e) / 2 <= e + .05);
  for (const [i, j] of lcsAlign(toks.map(norm), hw.map(x => norm(x.w)))) { out[i].s = hw[j].s; out[i].e = hw[j].e; }
  // unmatched words: spread between matched neighbours by character count
  const len = w => norm(w).length + 1;
  let k = 0;
  while (k < out.length) {
    if (out[k].s != null) { k++; continue; }
    let j = k; while (j < out.length && out[j].s == null) j++;
    const a = k ? out[k - 1].e : s, b = j < out.length ? out[j].s : e;
    const tot = out.slice(k, j).reduce((x, w) => x + len(w.w), 0) || 1;
    let t = a;
    for (let q = k; q < j; q++) { const d = Math.max(0, b - a) * len(out[q].w) / tot; out[q].s = t; out[q].e = t + d; t += d; }
    k = j;
  }
  return out.map(w => ({ w: w.w, s: r2(Math.max(s, w.s)), e: r2(Math.min(e, Math.max(w.e, w.s + .05))) }));
}
function captionsFrom(lines) { // ≤ 4 words / caption, break at punctuation and at line ends
  const caps = [];
  for (const L of lines) {
    let cur = [];
    const push = () => { if (cur.length) caps.push({ t0: cur[0].s, t1: cur[cur.length - 1].e, words: cur.map(w => ({ w: w.w.replace(/[.,!?;:…"“”]+$/g, '').replace(/^["“]/, '').toLowerCase(), s: w.s, e: w.e })) }); cur = []; };
    for (const w of L.words) { cur.push(w); if (cur.length >= 4 || /[.,!?;:…]$/.test(w.w)) push(); }
    push();
  }
  return caps.filter(c => c.words.some(w => w.w));
}

// ---------- b-roll catalog search (same scoring as scripts/broll.mjs search) ----------
let CAT = null;
function brollSearch(q, avoid = new Set()) {
  CAT = CAT || JSON.parse(fs.readFileSync(path.join(SKILL, 'assets/broll/catalog.json'), 'utf8'));
  const words = fold(q).split(/[^a-z0-9%]+/).filter(w => w.length > 1), bigrams = words.slice(1).map((w, i) => words[i] + ' ' + w);
  let best = null, bs = 0;
  for (const e of CAT) {
    if (e.pal !== 'ember' || avoid.has(e.template) || DULL.has(e.template)) continue;
    const hay = fold([...(e.tags || []), e.topic, e.text, e.template].join(' | '));
    let s = 0; for (const b of bigrams) if (hay.includes(b)) s += 3; for (const w of words) if (hay.includes(w)) s += 1;
    if (s > bs) { bs = s; best = e; }
  }
  return best;
}
const ABSTRACT = ['blobs', 'wave_lines', 'hex_grid', 'rings', 'sunburst'];
// Never as illustration: mostly-black presets (weak as the only picture), presets that print a number (the catalog's sample
// number would be a made-up statistic) and presets whose sample items are topic-specific (orders, chat lines, place names).
const DULL = new Set(['starfield', 'particles', 'grid_tunnel', 'counter_big', 'pie', 'kpi', 'money_rain', 'bar_chart', 'line_chart', 'likes', 'countdown',
  'progress', 'versus', 'notifications', 'chat', 'map_pins', 'timeline_steps']);

// Templates whose own text is the point of the shot: they carry the keyword themselves (no second keyword overlay on top).
const TEXTY = new Set(['glitch_text', 'search', 'typewriter', 'ticker', 'quote_card', 'countdown', 'checklist', 'timeline_steps', 'progress', 'kpi', 'icon_hero', 'counter_big']);
function beatScenes(b, t0, t1, used, k, vert) {
  const out = [], d = t1 - t0, kw = String(b.screen || '').slice(0, 26), sub = String(b.sub || '').slice(0, 30), kwY = vert ? 975 : 560;
  // full-frame procedural b-roll for a query; texty templates show the keyword inside, others get the Anton keyword in the lower third
  const brollScene = (q, s0, s1, keyword, small) => {
    const e = brollSearch(q || kw, used) || brollSearch(q || kw) || { template: ABSTRACT[k % ABSTRACT.length], pal: 'ember' };
    used.add(e.template);
    const texty = TEXTY.has(e.template);
    const broll = { template: e.template, pal: 'ember', text: texty ? (keyword || e.text || '').toUpperCase().slice(0, 24) : '', seed: e.seed || k + 3,
      ...(e.num != null ? { num: e.num } : {}), ...(e.icon || b.emoji ? { icon: b.emoji || e.icon } : {}), ...(e.items ? { items: e.items } : {}), ...(texty && e.sub ? { sub: e.sub } : {}) };
    return { type: 'kinetic_broll', t0: s0, t1: s1, layout: 'full', broll, fit: 'blend',
      ...(!texty && keyword ? { keyword, ...(small ? { sub: small } : {}), kw_t: r2(s0 + .3), kw_y: kwY } : {}) };
  };
  const first = Math.min(d, d > 4.6 ? Math.max(2, d * .55) : d), m = r2(t0 + first);
  const v = VISUALS.includes(b.visual) ? b.visual : 'broll';
  if (v === 'number' && b.num != null && isFinite(+b.num)) {
    const n = +b.num;
    out.push({ type: 'kinetic_slam', t0, t1: m, count: { to: n, suffix: b.unit ? (String(b.unit).length <= 2 ? b.unit : ' ' + b.unit) : '', dur: .8 }, top: sub || '', bottom: kw });
  } else if (v === 'versus' && Array.isArray(b.items) && b.items.length >= 2) {
    out.push({ type: 'kinetic_diamonds', t0, t1: m, title: kw, items: b.items.slice(0, 2).map((x, i) => ({ text: String(x).slice(0, 14), icon: i ? '🆚' : b.emoji || '💡', t: r2(t0 + .1 + i * Math.min(.7, first / 3)) })) });
  } else if (v === 'list' && Array.isArray(b.items) && b.items.length) {
    out.push({ type: 'kinetic_broll', t0, t1: m, layout: 'full', broll: { template: 'checklist', pal: 'ember', text: kw.toUpperCase(), items: b.items.slice(0, 4).map(x => String(x).slice(0, 24)) }, fit: 'blend' });
  } else if (v === 'words') {
    const ws = kw.split(/\s+/).filter(Boolean), mid = Math.max(0, Math.floor(ws.length / 2) - (ws.length > 3 ? 1 : 0));
    const rows = ws.length <= 2 ? [{ text: kw, tier: 'l', hl: true }] : [{ text: ws.slice(0, mid || 1).join(' '), tier: 's', align: 'left' }, { text: ws.slice(mid || 1).join(' '), tier: 'l', hl: true }];
    if (sub) rows.push({ text: sub, tier: 'xs', align: 'right' });
    out.push({ type: 'kinetic_words', t0, t1: m, bg: 'arc', words: rows.map((w, i) => ({ ...w, t: r2(t0 + .05 + i * Math.min(.45, first / 4)) })) });
  } else {
    out.push(brollScene(b.broll, t0, m, kw, sub));
  }
  // long beat: a second, different shot (attention reset) — keyword = the sub line, or the keyword again
  if (m < t1 - .3) out.push(brollScene(`${b.broll || ''} ${kw}`, m, t1, v === 'broll' ? (sub || kw) : kw));
  else if (out.length) out[out.length - 1].t1 = t1;
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
  const topic = args[0] && !args[0].startsWith('--') ? args[0].trim() : '';
  if (!topic) throw new Error('cách dùng: node scripts/topic_video.mjs "<chủ đề>" --out <thư mục> [--dur 45] [--voice Linh] [--orient vertical]');
  const dur = Math.max(15, Math.min(120, +opt('--dur', 45))), vert = opt('--orient', 'vertical') !== 'horizontal';
  let voice = opt('--voice', 'Linh'); const rate = +opt('--rate', 190), pack = opt('--pack', 'kinetic');
  if (voice.startsWith('edge:') && !hasEdge()) { console.error('chưa cài edge-tts → dùng giọng Linh (offline)'); voice = 'Linh'; }
  // --out is the project folder; when it is an existing folder holding something else (e.g. a queue's shared "topics" folder),
  // the project goes into <out>/<slug of the topic>[-n] instead of overwriting it.
  let out = path.resolve(opt('--out', path.join(process.cwd(), slug(topic))));
  const sameTopic = d => { try { return JSON.parse(fs.readFileSync(path.join(d, 'script.json'), 'utf8')).topic === topic; } catch { return false; } };
  if (fs.existsSync(out) && fs.readdirSync(out).filter(f => !f.startsWith('.')).length && !sameTopic(out)) {
    let d = path.join(out, slug(topic)); for (let n = 2; fs.existsSync(d) && !sameTopic(d); n++) d = path.join(out, `${slug(topic)}-${n}`);
    out = d;
  }
  fs.rmSync(path.join(out, 'work'), { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'work/tts'), { recursive: true }); fs.mkdirSync(path.join(out, 'media'), { recursive: true }); fs.mkdirSync(path.join(out, '.studio'), { recursive: true });

  // 1. script
  let sc = null;
  if (args.includes('--script') && fs.existsSync(opt('--script'))) sc = JSON.parse(fs.readFileSync(opt('--script'), 'utf8'));
  else {
    const prompt = scriptPrompt(topic, dur, dur <= 30 ? 3 : dur <= 60 ? 4 : 5);
    let last;
    for (let a = 0; a < 2 && !sc; a++) {
      const t0 = Date.now();
      say(.02, a ? 'Claude trả lời chưa đúng JSON — hỏi lại' : 'Claude viết kịch bản (hook, ý chính, CTA)');
      const res = await callClaude(a ? `${prompt}\n\nLần trước không phải JSON hợp lệ (${last}). Chỉ trả về JSON.` : prompt, opt('--claude-model', 'sonnet'),
        () => { const s = Math.round((Date.now() - t0) / 1000); if (s % 5 === 0) say(Math.min(.2, .02 + s / 400), `Claude đang viết kịch bản… ${s}s`); });
      try { sc = parseJson(res); if (!sc.hook?.say || !Array.isArray(sc.beats) || !sc.beats.length) throw new Error('thiếu hook/beats'); } catch (e) { last = e.message; sc = null; }
    }
    if (!sc) throw new Error('Claude không trả về kịch bản hợp lệ: ' + last);
  }
  sc.topic = topic;
  fs.writeFileSync(path.join(out, 'script.json'), JSON.stringify(sc, null, 1));
  const lines = [{ kind: 'hook', ...sc.hook }, ...sc.beats.slice(0, 6).map((b, i) => ({ kind: 'beat', i, ...b })), { kind: 'cta', ...(sc.cta || { say: 'Theo dõi để xem thêm nhé!', screen: 'FOLLOW NGAY' }) }]
    .filter(l => String(l.say || '').trim());

  // 2. TTS per line → measured durations → work/voice.wav
  const GAP = .28;
  const speak = async (r, pass) => {
    let t = .15;
    for (const [i, L] of lines.entries()) {
      say(.22 + .2 * i / lines.length, `Đọc lời ${i + 1}/${lines.length} (${voice}${pass ? `, nhanh hơn ${r}` : ''})`);
      L.say = String(L.say).replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '').replace(/\s+/g, ' ').trim();
      L.file = path.join(out, `work/tts/${String(i).padStart(2, '0')}.wav`);
      L.d = await tts(L.say, voice, r, L.file);
      L.s = r2(t); L.e = r2(t + L.d); t = L.e + GAP;
    }
    return t;
  };
  let rateUsed = rate, end = await speak(rate, 0);
  // too long for --dur (the script ran over its word budget): read faster once (say only, ≤ 240 wpm)
  if (!voice.startsWith('edge:') && end > dur * 1.1) {
    const speech = lines.reduce((a, L) => a + L.d, 0), room = Math.max(5, dur - (end - speech));
    rateUsed = Math.min(240, Math.round(rate * speech / room));
    if (rateUsed > rate + 5) end = await speak(rateUsed, 1);
  }
  const tail = 1.2, total = r2(lines[lines.length - 1].e + tail);
  say(.43, 'Ghép giọng đọc');
  const inputs = lines.flatMap(L => ['-i', L.file]);
  const fc = lines.map((L, i) => `[${i}:a]adelay=${Math.round(L.s * 1000)}|${Math.round(L.s * 1000)}[a${i}]`).join(';') + ';' + lines.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${lines.length}:normalize=0:dropout_transition=0,apad=whole_dur=${total}[o]`;
  await sh('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', fc, '-map', '[o]', '-t', String(total), '-ar', '48000', '-ac', '2', path.join(out, 'work/voice.wav')]);

  // 3. forced alignment: transcribe the TTS audio, align to the script words
  say(.46, 'Căn thời gian từng chữ (nhận giọng lại bản đọc)');
  let heard = [];
  try { await sh(PY, ['-I', '-X', 'utf8', S('transcribe.py'), path.join(out, 'work/voice.wav'), path.join(out, 'work/words_tts.json'), '--model', opt('--model', 'large-v3-turbo')]); heard = JSON.parse(fs.readFileSync(path.join(out, 'work/words_tts.json'), 'utf8')); }
  catch (e) { console.error('nhận giọng bản đọc lỗi, chia thời gian theo số ký tự: ' + e.message); }
  for (const L of lines) L.words = alignLine(L.say, L.s, L.e, heard);
  const matched = lines.reduce((a, L) => a + L.words.length, 0);
  fs.writeFileSync(path.join(out, 'work/words.json'), JSON.stringify(lines.flatMap(L => L.words), null, 1));
  const caps = captionsFrom(lines);
  fs.writeFileSync(path.join(out, 'work/captions.json'), JSON.stringify(caps, null, 1));

  // 4. visuals
  say(.55, 'Dựng hình: b-roll động + chữ kinetic');
  const W = vert ? 1080 : 1920, H = vert ? 1920 : 1080;
  // background still (shows under the hook / CTA): a frame of an abstract preset, else a dark gradient
  const bg = path.join(out, 'media/bg.jpg');
  try {
    const tmpd = path.join(out, '.studio/bg_frames');
    await sh('node', [S('broll.mjs'), 'render', 'bg--blobs--ember', path.join(out, '.studio/bg.mp4'), '--dur', '1', '--frames', tmpd, '--w', String(vert ? 720 : 1280), '--h', String(vert ? 1280 : 720)]);
    const fr = fs.readdirSync(tmpd).filter(f => f.endsWith('.jpg')).sort();
    fs.copyFileSync(path.join(tmpd, fr[Math.floor(fr.length / 2)]), bg);
    fs.rmSync(tmpd, { recursive: true, force: true }); fs.rmSync(path.join(out, '.studio/bg.mp4'), { force: true });
  } catch (e) {
    await sh('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `gradients=s=${vert ? '720x1280' : '1280x720'}:c0=0x2a1510:c1=0x0a0a0a:x0=${vert ? 360 : 640}:y0=${vert ? 500 : 300}:x1=0:y1=0:type=radial`, '-frames:v', '1', bg]);
  }
  // optional user images / stock photos → stills on the main track for the broll beats
  let pics = [];
  const im = opt('--images');
  if (im) for (const f of (fs.existsSync(im) && fs.statSync(im).isDirectory() ? fs.readdirSync(im).sort().map(x => path.join(im, x)) : im.split(','))) {
    if (/\.(jpe?g|png|webp)$/i.test(f) && fs.existsSync(f)) { const d = `media/${String(pics.length + 1).padStart(2, '0')}_${path.basename(f).replace(/[^\w.\-]+/g, '_')}`; fs.copyFileSync(f, path.join(out, d)); pics.push(d); }
  }
  if (args.includes('--stock')) {
    for (const [i, L] of lines.filter(L => L.kind === 'beat' && (L.visual || 'broll') === 'broll').entries()) {
      say(.57, `Tìm ảnh stock ${i + 1}: ${L.broll || L.screen}`);
      try {
        const r = await sh(PY, ['-I', '-X', 'utf8', S('broll_fetch.py'), String(L.broll || L.screen), path.join(out, 'media/stock'), '--kind', 'photo', '--n', '1']);
        const f = fs.existsSync(path.join(out, 'media/stock')) ? fs.readdirSync(path.join(out, 'media/stock')).filter(x => /\.(jpe?g|png|webp)$/i.test(x) && !pics.includes('media/stock/' + x)) : [];
        if (f.length) { pics.push('media/stock/' + f[0]); L.pic = 'media/stock/' + f[0]; }
        void r;
      } catch (e) { console.error('stock lỗi (bỏ qua): ' + e.message.slice(0, 160)); }
    }
  }
  const scenes = [], used = new Set(), clips = [];
  const hook = lines[0], cta = lines[lines.length - 1];
  const hookEnd = r2(Math.max(2.2, Math.min(hook.e + GAP / 2, 4)));
  scenes.push({ type: 'kinetic_broll', t0: 0, t1: hookEnd, layout: 'full', broll: { template: 'sunburst', pal: 'ember', text: '', icon: hook.emoji || '🔥', seed: 7 }, fit: 'cover', zoom: 1.3 });
  scenes.push({ type: 'kinetic_hook', t0: 0, t1: hookEnd, text: String(hook.screen || sc.title || topic).slice(0, 30), ...(hook.screen2 ? { text2: String(hook.screen2).slice(0, 26), text2_t: .5 } : {}), upper: true });
  const beats = lines.filter(L => L.kind === 'beat');
  let picI = 0;
  beats.forEach((L, k) => {
    const b0 = k ? r2(L.s - GAP / 2) : hookEnd, nx = beats[k + 1], b1 = nx ? r2(nx.s - GAP / 2) : r2(cta.s - GAP / 2);
    if (b1 - b0 < .4) return;
    const pic = L.pic || ((L.visual || 'broll') === 'broll' && pics.length && !args.includes('--stock') ? pics[picI++ % pics.length] : null);
    if (pic) scenes.push({ type: 'kinetic_broll', t0: b0, t1: b1, layout: 'full', media: pic, keyword: String(L.screen || '').slice(0, 26), kw_t: r2(b0 + .3), kw_y: vert ? 975 : 560, zoom: 1.12 });
    else scenes.push(...beatScenes(L, b0, b1, used, k, vert));
  });
  const ctaS = r2(cta.s - GAP / 2);
  scenes.push({ type: 'kinetic_broll', t0: ctaS, t1: total, layout: 'full', broll: { template: 'rings', pal: 'ember', text: '', icon: cta.emoji || '🔔', seed: 5 }, fit: 'cover', zoom: 1.1 });
  scenes.push({ type: 'kinetic_cta', t0: ctaS, t1: total, text: String(cta.screen || 'FOLLOW NGAY').slice(0, 24), button: String(cta.button || 'FOLLOW').slice(0, 14), tap_t: r2(Math.min(total - .4, ctaS + 1.2)), ...(opt('--handle') ? { handle: opt('--handle') } : {}), y: vert ? 1180 : 560, hideCaptions: true });
  const chapters = [{ t: 0, text: 'Mở đầu' }, ...beats.map((L, k) => ({ t: k ? r2(L.s - GAP / 2) : hookEnd, text: String(L.screen || `Ý ${k + 1}`).slice(0, 18) }))];
  scenes.push({ type: 'kinetic_progress', t0: 0, t1: total, chapters });
  // main track: one background still for the whole video, carrying the voice
  clips.push({ src: 'media/bg.jpg', in: 0, out: total, fit: 'cover', zoom: 1.04, audio: 'work/voice.wav' });
  const fx = scenes.filter(s => s.type !== 'kinetic_progress' && s.t0 > .1).map(s => ({ t: s.t0, type: s.type === 'kinetic_slam' ? 'punch' : 'flash' })).filter((f, i, a) => !i || f.t - a[i - 1].t > .5);
  const tl = {
    width: W, height: H, fps: 30, duration: total, pack,
    clips, face: vert ? { x: 360, y: 520 } : { x: 640, y: 300 }, title: sc.title || topic,
    caption_style: 'kinetic', captions: 'work/captions.json', scenes, fx,
    audio: { mix: 'work/mix.wav', music: [{ t0: 0, t1: total, mood: MOODS.includes(sc.mood) ? sc.mood : 'tech', gain: -22 }], sfx: [], duck: { on: true, amount_db: -10, attack: 60, release: 400, hold: 250 } },
    _topic: { topic, voice, rate: rateUsed, lines: lines.map(L => ({ kind: L.kind, say: L.say, s: L.s, e: L.e, screen: L.screen, visual: L.visual })), title: sc.title, caption: sc.caption, hashtags: sc.hashtags, aligned: heard.length },
  };
  const tlFile = path.join(out, 'timeline.json');
  fs.writeFileSync(tlFile, JSON.stringify(tl, null, 1));

  // 5. music + SFX
  say(.62, 'Nhạc nền + SFX theo cảnh');
  try { await sh(PY, ['-I', '-X', 'utf8', S('auto_sfx.py'), tlFile, '--level', 'vua', '--music', 'auto']); }
  catch (e) { console.error('auto_sfx lỗi (giữ nhạc mặc định): ' + e.message.slice(0, 200)); }
  // auto_sfx may replace music beds: keep them under the TTS voice
  const tl2 = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
  for (const m of tl2.audio?.music || []) m.gain = Math.min(m.gain ?? -22, -20);
  fs.writeFileSync(tlFile, JSON.stringify(tl2, null, 1));

  // cover still for the panel
  await sh('node', [S('render.mjs'), tlFile, path.join(out, '.studio/thumb_big.jpg'), '--still', String(r2(Math.min(total - .5, hookEnd - .4))), path.join(out, '.studio/thumb_big.jpg')]).catch(() => {});
  if (fs.existsSync(path.join(out, '.studio/thumb_big.jpg'))) { await sh('ffmpeg', ['-v', 'error', '-y', '-i', path.join(out, '.studio/thumb_big.jpg'), '-vf', 'scale=360:-2', '-q:v', '4', path.join(out, '.studio/thumb.jpg')]).catch(() => {}); fs.rmSync(path.join(out, '.studio/thumb_big.jpg'), { force: true }); }

  let mp4 = null;
  if (args.includes('--export')) mp4 = await exportProject(out, { quality: opt('--quality', '1080'), onProgress: (k, s) => say(.66 + .33 * k, `Xuất video (${s}) ${Math.round(k * 100)}%`) });
  say(1, 'Xong');
  console.log('RESULT ' + JSON.stringify({ dir: out, outputs: [out, ...(mp4 ? [mp4] : [])], title: sc.title, duration: total, lines: lines.length, scenes: scenes.length, words: matched, heard: heard.length, mp4 }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
