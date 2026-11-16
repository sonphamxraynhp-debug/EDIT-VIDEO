// "AI dựng giúp": Claude reads the transcript and plans the edit (pack, caption fixes, hook, 6–15 graphics on word starts, music, SFX).
// usage: node scripts/ai_edit.mjs <project_dir | timeline.json> [--out .studio/ai_plan.json] [--goal "khoá học"] [--tone "vui"]
//          [--pack keep|auto|<pack id>] [--density thua|vua|day] [--extra "…"] [--model sonnet] [--apply]
// Output plan (references/ai-edit.md): { pack, caption_style, hook, captions:[{i,t0,words:[{w,hl?,br?}]}], scenes:[…full scenes, _ai:true],
//   music:{mood,gain}, sfx:[{t,name,gain}], summary, dropped:[…] }. --apply writes it into timeline.json (replaces earlier _ai items only).
// Progress lines on stdout: "@@ <0..1> <step>" (read by studio/routes/20_ai.mjs).
import fs from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome, spawnClaude } from './platform.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const say = (p, s) => console.log(`@@ ${p.toFixed(2)} ${s}`);
const r2 = v => Math.round(v * 100) / 100;
// Packs that need footage the AI cannot invent (second camera, screen recording, cutouts, before/after photos, photo slideshows).
const SPECIAL = new Set(['hypecam', 'beatslide', 'multicam', 'screencast', 'greenscreen', 'transform']);
const LONG_TEXT = new Set(['code', 'definition', 'text', 'example', 'quote', 'body', 'desc', 'question', 'answer']);

export function loadProject(p) {
  const tlFile = p.endsWith('.json') ? path.resolve(p) : path.resolve(p, 'timeline.json');
  const dir = path.dirname(tlFile), tl = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
  let caps = tl.captions;
  if (typeof caps === 'string') caps = JSON.parse(fs.readFileSync(path.join(dir, caps), 'utf8'));
  return { dir, tlFile, tl, caps: Array.isArray(caps) ? caps : [] };
}

// Pack catalog straight from the engine: every item's make(0) output, caption styles, and each recipe's long background scenes.
export async function engineCatalog(tl, caps, dir) {
  const { default: puppeteer } = await import('puppeteer-core');
  const CHROME = findChrome();
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  try {
    const pg = await b.newPage();
    await pg.goto(pathToFileURL(path.join(SKILL, 'engine/index.html')).href, { waitUntil: 'domcontentloaded' });
    const t = { ...tl, captions: caps, scenes: [], base: pathToFileURL(dir).href + '/' };
    await pg.evaluate(x => Promise.race([window.init(x), new Promise(r => setTimeout(r, 4000))]), t);
    return await pg.evaluate(ctx => ({
      captionStyles: Object.keys(CAPTION_STYLES),
      packs: PACKS.map(p => {
        let base = [], music = null;
        try { const r = p.recipe?.({ ...ctx, brand: BR() }); if (r) { music = r.music || null; base = (r.scenes || []).filter(s => s.t1 - s.t0 >= ctx.dur * .4); } } catch {}
        return { id: p.id, name: p.name, desc: p.desc || '', caption: p.caption || '', horizontal: !!p.horizontal, music, base,
          items: p.items.map(it => { try { return { type: it.type, label: it.label, ex: it.make(0) }; } catch { return null; } }).filter(Boolean) };
      }),
    }), { dur: tl.duration, captions: caps, vertical: (tl.height || 1920) > (tl.width || 1080), title: tl.title || '' });
  } finally { await b.close(); }
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
export function libraries() {
  const broll = readJson(path.join(SKILL, 'assets/broll/catalog.json')) || [];
  const sfx = readJson(path.join(SKILL, 'assets/sfx/catalog.json')) || [];
  const music = readJson(path.join(SKILL, 'assets/music/catalog.json')) || [];
  const tpls = readJson(path.join(SKILL, 'templates/index.json')) || [];
  return { broll, sfx, music, tpls };
}

// Example params made compact for the prompt: no t0/t1/type, long arrays cut to 3, long strings to 60 chars.
function compact(o, top = true) {
  if (Array.isArray(o)) return o.slice(0, 3).map(x => compact(x, false));
  if (o && typeof o === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(o)) if (!(top && ['type', 't0', 't1'].includes(k))) r[k] = compact(v, false);
    return r;
  }
  return typeof o === 'string' && o.length > 60 ? o.slice(0, 57) + '…' : o;
}
const usesMedia = ex => /"(?:src|media|image)":""|"(?:media|broll|ui)\/[^"]+\.(?:jpe?g|png|mp4)"|"src":"media\//.test(JSON.stringify(ex));

export function buildPrompt({ tl, caps, cat, lib, o }) {
  const vertical = (tl.height || 1920) > (tl.width || 1080);
  const keep = o.pack && o.pack !== 'auto';
  const want = keep ? (o.pack === 'keep' ? tl.pack || 'slate' : o.pack) : null;
  const packs = cat.packs.filter(p => p.id === want || (!keep && !SPECIAL.has(p.id) && !(vertical && p.horizontal)) || p.id === 'basic');
  const items = new Map();
  for (const p of packs) for (const it of p.items) if (!usesMedia(it.ex)) items.set(it.type, { ...it, pack: p.id });
  const n = { thua: [5, 7], vua: [8, 11], day: [12, 15] }[o.density] || [8, 11];
  const transcript = caps.map((c, i) => `C${i} [${c.t0.toFixed(2)}–${c.t1.toFixed(2)}] ` + c.words.map((w, j) => `${j}:${w.w}`).join(' ')).join('\n');
  const topics = [...new Set(lib.broll.map(x => x.topic))].join(', ');
  const brTpl = [...new Set(lib.broll.map(x => x.template))].join(', ');
  const sfxNames = [...new Map(lib.sfx.map(x => [x.name.replace(/_\d+$/, ''), x])).values()].map(x => `${x.name.replace(/_\d+$/, '')} (${x.use || x.cat})`.slice(0, 70)).join('; ');
  const moods = [...new Set(lib.music.map(m => m.mood))].map(m => `${m}: ${(lib.music.find(x => x.mood === m)?.use || '').slice(0, 50)}`).join('; ');
  const packList = packs.filter(p => p.id !== 'basic').map(p => `- ${p.id}: ${p.name} — ${p.desc.slice(0, 120)} (phụ đề: ${p.caption || 'mặc định'})`).join('\n');
  const itemList = packs.map(p => `## Gói ${p.id}\n` + p.items.filter(it => items.get(it.type)?.pack === p.id).map(it => `- ${it.type} (${it.label}) ví dụ params: ${JSON.stringify(compact(it.ex))}`).join('\n')).join('\n');
  const tpl = lib.tpls.slice(0, 60).map(t => `${t.name} → ${t.pack}`).join('; ');
  return `Bạn là editor video ngắn tiếng Việt chuyên nghiệp. Hãy lên bản dựng cho video người nói (talking-head) ${vertical ? 'dọc 9:16' : 'ngang 16:9'}, dài ${tl.duration}s.
Mục tiêu video: ${o.goal || 'khác'}. Giọng điệu: ${o.tone || 'tự nhiên'}. Mật độ graphic: ${n[0]}–${n[1]} cảnh.${o.extra ? `\nYêu cầu thêm của người dùng: ${o.extra}` : ''}
Brand: ${JSON.stringify(tl.brand || {})}

# Lời thoại (mỗi dòng là một phụ đề C<chỉ số> [giây bắt đầu–kết thúc], từng từ dạng <chỉ số từ>:<từ>; giọng nói nhận dạng tự động nên có thể sai chính tả)
${transcript}

# Gói style ${keep ? `(BẮT BUỘC dùng gói "${want}")` : '(chọn 1 gói hợp nhất với nội dung)'}
${packList}
Tham khảo mẫu có sẵn (tên mẫu → gói): ${tpl}

# Các loại graphic dùng được (chỉ dùng đúng type trong danh sách; gói "basic" dùng chung được với mọi gói)
${itemList}

# B-roll động (dùng trong params có {"broll":{"id":"<chủ đề>--<template>--<bảng màu>"}})
Chủ đề: ${topics}
Template: ${brTpl}
Bảng màu: ember, light, neon, ocean, violet, gold, forest, sunset, candy, mono

# Nhạc nền (mood): ${moods}
# SFX: ${sfxNames}

# Việc cần làm
1. Chọn "pack" và "caption_style" (một trong: ${cat.captionStyles.join(', ')}; thường dùng kiểu phụ đề của gói).
2. Sửa phụ đề để hiển thị: sửa lỗi nhận dạng (tên riêng, chính tả, dấu), viết hoa tên riêng, có thể rút gọn từ thừa bằng cách để chuỗi rỗng "" cho từ đó. KHÔNG được đổi số lượng từ của dòng (mỗi từ giữ nguyên thời gian). "hl" = chỉ số các từ cần nhấn mạnh (1–2 từ khoá/dòng, không phải dòng nào cũng cần), "br" = chỉ số từ mà sau đó xuống dòng. Chỉ trả về các dòng có thay đổi.
3. Viết "hook": câu mở đầu giật tít ≤ 40 ký tự dựa trên nội dung. Cảnh đầu tiên (c=0,w=0) là cảnh hook hiển thị câu này.
4. Đặt ${n[0]}–${n[1]} cảnh graphic: mỗi cảnh bắt đầu ĐÚNG lúc người nói nói từ khoá liên quan, chỉ định bằng "c" (chỉ số dòng) và "w" (chỉ số từ). "dur" 1.5–6 giây. Các cảnh không chồng lên nhau về thời gian. Cảnh cuối nên là CTA/kết. "params" theo đúng cấu trúc ví dụ của type đó, viết nội dung thật bằng tiếng Việt có dấu, ngắn gọn: mỗi trường chữ dài xấp xỉ chữ trong ví dụ (graphic được thiết kế cho độ dài đó; trường số/giá trị chỉ vài ký tự). Mọi trường thời gian bên trong params (t, reveal_t, …) tính bằng giây KỂ TỪ khi cảnh bắt đầu. Dùng b-roll có chủ đề khớp nội dung.
5. Chọn nhạc nền "music": {"mood": "...", "gain": -18 đến -22} và 3–8 SFX đặt tại từ khoá/chỗ graphic xuất hiện: {"name": "...", "c": số, "w": số}.

Chỉ trả về DUY NHẤT một object JSON (không markdown, không giải thích ngoài JSON) theo dạng:
{"pack":"…","caption_style":"…","hook":"…","captions":[{"c":0,"words":["…"],"hl":[1],"br":[]}],"scenes":[{"type":"…","c":0,"w":0,"dur":2.5,"params":{}}],"music":{"mood":"…","gain":-20},"sfx":[{"name":"…","c":0,"w":0}],"summary":"1–2 câu tiếng Việt: vì sao chọn gói và cách dựng"}`;
}

export function callClaude(prompt, model = 'sonnet', onTick) {
  return new Promise((ok, bad) => {
    const p = spawnClaude(['-p', '--output-format', 'json', '--model', model], { stdio: ['pipe', 'pipe', 'pipe'], cwd: os.tmpdir() });
    let out = '', err = '';
    const tick = setInterval(() => onTick && onTick(), 1000);
    p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (err += d));
    p.on('error', e => { clearInterval(tick); bad(new Error(e.code === 'ENOENT' ? 'Không tìm thấy lệnh "claude" (Claude Code CLI). Cài Claude Code rồi thử lại.' : e.message)); });
    p.on('close', code => {
      clearInterval(tick);
      if (code !== 0) {
        let msg = err || out; try { const r = JSON.parse(out); if (r.result) msg = String(r.result); } catch {}
        if (/not logged in|\/login|invalid api key|authenticat|unauthorized|oauth token/i.test(msg)) return bad(new Error('Claude Code chưa đăng nhập. Mở Terminal, chạy lệnh "claude" một lần để đăng nhập rồi thử lại.'));
        if (/credit balance|usage limit|rate limit|quota/i.test(msg)) return bad(new Error('Tài khoản Claude đã hết lượt dùng tạm thời. Đợi một lúc rồi thử lại. (' + msg.slice(0, 160) + ')'));
        return bad(new Error(`claude -p lỗi (mã ${code}): ${msg.slice(-300)}`));
      }
      try { const r = JSON.parse(out); if (r.is_error) return bad(new Error('Claude báo lỗi: ' + String(r.result).slice(0, 300))); ok(String(r.result || '')); }
      catch { ok(out); }
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

// ---------- validation: everything the model says is checked against the engine catalog and the transcript ----------
const TKEY = /^(t|t0|t1|out|strike_at|[a-z_]*_t)$/;
function shiftRel(o, t0, t1, top = true) {
  if (Array.isArray(o)) return o.map(x => shiftRel(x, t0, t1, false));
  if (!o || typeof o !== 'object') return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (!top && TKEY.test(k) && typeof v === 'number') r[k] = r2(Math.min(t1, Math.max(t0, v <= t1 - t0 + .01 ? t0 + v : v)));
    else if (top && TKEY.test(k) && typeof v === 'number' && !['t0', 't1'].includes(k)) r[k] = r2(Math.min(t1, Math.max(t0, t0 + v)));
    else r[k] = shiftRel(v, t0, t1, false);
  }
  return r;
}
function clampT(o, t0, t1, top = true) {
  if (Array.isArray(o)) return o.forEach(x => clampT(x, t0, t1, false));
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (TKEY.test(k) && typeof v === 'number' && !(top && (k === 't0' || k === 't1'))) o[k] = r2(Math.min(t1, Math.max(t0, v)));
    else if (v && typeof v === 'object') clampT(v, t0, t1, false);
  }
}
// Text length follows the example of the same field (graphics are designed for that much text), with a hard cap.
function cleanText(o, ex, key = '') {
  if (Array.isArray(o)) return o.slice(0, 8).map(x => cleanText(x, Array.isArray(ex) ? ex[0] : undefined, key));
  if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = cleanText(v, ex && typeof ex === 'object' ? ex[k] : undefined, k); return r; }
  if (typeof o === 'string') {
    const max = Math.min(LONG_TEXT.has(key) ? 140 : 70, typeof ex === 'string' && ex.length ? Math.max(12, Math.ceil(ex.length * 1.8)) : 70);
    return o.length > max ? o.slice(0, max - 1).trimEnd() + '…' : o;
  }
  return o;
}
function fixBroll(o, lib, used) {
  if (Array.isArray(o)) return o.forEach(x => fixBroll(x, lib, used));
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (k === 'broll' && v && typeof v === 'object' && typeof v.id === 'string') v.id = resolveBroll(v.id, lib, used);
    else fixBroll(v, lib, used);
  }
}
function resolveBroll(id, lib, used) {
  const all = lib.broll;
  if (all.some(x => x.id === id)) return id;
  const [topic, tpl, pal] = id.split('--');
  const c = all.filter(x => x.topic === topic || x.tags?.some(t => t === topic?.replace(/-/g, ' ')));
  const pick = c.find(x => x.template === tpl && x.pal === pal) || c.find(x => x.template === tpl) || c.find(x => x.pal === pal && !used.has(x.id)) || c.find(x => !used.has(x.id)) || c[0];
  return pick ? (used.add(pick.id), pick.id) : 'cong-nghe-moi--neural--ember';
}
export function validate(raw, { tl, caps, cat, lib, o }) {
  const dropped = [];
  const dur = tl.duration;
  const keep = o.pack && o.pack !== 'auto';
  const vertical = (tl.height || 1920) > (tl.width || 1080);
  const packIds = new Set(cat.packs.map(p => p.id));
  let pack = keep ? (o.pack === 'keep' ? tl.pack || 'slate' : o.pack) : String(raw.pack || '');
  if (!packIds.has(pack) || (!keep && SPECIAL.has(pack))) { dropped.push(`gói "${raw.pack}" không hợp lệ → giữ ${tl.pack || 'slate'}`); pack = tl.pack || 'slate'; }
  const P = cat.packs.find(p => p.id === pack);
  const caption_style = cat.captionStyles.includes(raw.caption_style) ? raw.caption_style : (P.caption || tl.caption_style || 'slate');
  const items = new Map();
  for (const p of cat.packs) if (p.id === pack || p.id === 'basic') for (const it of p.items) if (!usesMedia(it.ex)) items.set(it.type, it);
  const wordT = (c, w) => { const cap = caps[+c]; if (!cap) return null; const ws = cap.words; return (ws[Math.min(ws.length - 1, Math.max(0, +w || 0))] || {}).s ?? cap.t0; };
  // captions: same word count, timings untouched
  const capOut = [];
  for (const e of Array.isArray(raw.captions) ? raw.captions : []) {
    const i = +e.c, cap = caps[i];
    if (!cap || !Array.isArray(e.words) || e.words.length !== cap.words.length) { dropped.push(`phụ đề C${e.c}: sai số từ`); continue; }
    const hl = new Set((e.hl || []).map(Number)), br = new Set((e.br || []).map(Number));
    const words = e.words.map((w, j) => ({ w: String(w ?? '').trim().slice(0, 24), ...(hl.has(j) ? { hl: true } : {}), ...(br.has(j) && j < e.words.length - 1 ? { br: true } : {}) }));
    if (words.every(w => !w.w)) { dropped.push(`phụ đề C${i}: rỗng`); continue; }
    capOut.push({ i, t0: cap.t0, n: cap.words.length, words });
  }
  // scenes: known types only, start on a word, clamp to the video, no overlaps
  const used = new Set(), sc = [];
  for (const s of Array.isArray(raw.scenes) ? raw.scenes : []) {
    const it = items.get(s.type);
    if (!it) { dropped.push(`cảnh "${s.type}" không có trong gói`); continue; }
    let t0 = wordT(s.c, s.w);
    if (t0 == null) t0 = typeof s.t0 === 'number' ? s.t0 : null;
    if (t0 == null) { dropped.push(`cảnh ${s.type}: thiếu thời điểm`); continue; }
    t0 = r2(Math.max(0, Math.min(dur - .8, t0 - .05)));
    const t1 = r2(Math.min(dur, t0 + Math.min(8, Math.max(.8, +s.dur || (it.ex.t1 - it.ex.t0) || 2.5))));
    const params = cleanText(s.params && typeof s.params === 'object' ? s.params : {}, it.ex);
    for (const k of ['type', 't0', 't1', 'cid', '_orig', '_ai']) delete params[k];
    const ex = shiftRel(it.ex, t0, t1);
    const scene = { ...ex, ...shiftRel(params, t0, t1), type: s.type, t0, t1, _ai: true };
    fixBroll(scene, lib, used);
    sc.push(scene);
  }
  sc.sort((a, b) => a.t0 - b.t0);
  const scenes = [];
  for (const s of sc) {
    const prev = scenes[scenes.length - 1];
    if (prev && s.t0 < prev.t1 - .05) {
      if (prev.t1 + .8 <= s.t1) { s.t0 = r2(prev.t1); clampT(s, s.t0, s.t1); }
      else { dropped.push(`cảnh ${s.type} @${s.t0}s chồng lên cảnh trước`); continue; }
    }
    scenes.push(s);
  }
  if (scenes.length > 15) dropped.push(`bớt ${scenes.length - 15} cảnh thừa`), scenes.splice(15);
  // base layer from the chosen pack's recipe (frame, progress bar …) so the AI graphics sit on the right background
  const base = (P.base || []).map(s => ({ ...s, _ai: true, _base: true }));
  const moods = new Set(lib.music.map(m => m.mood));
  const mood = moods.has(raw.music?.mood) ? raw.music.mood : (P.music && moods.has(P.music) ? P.music : 'tech');
  const music = { t0: 0, t1: dur, mood, gain: Math.max(-26, Math.min(-14, +raw.music?.gain || -20)), _ai: true };
  const sfxNames = new Set(lib.sfx.map(x => x.name));
  const sfx = [];
  for (const x of Array.isArray(raw.sfx) ? raw.sfx.slice(0, 10) : []) {
    const name = sfxNames.has(x.name) ? x.name : sfxNames.has(String(x.name).replace(/_\d+$/, '')) ? String(x.name).replace(/_\d+$/, '') : null;
    const t = wordT(x.c, x.w) ?? (typeof x.t === 'number' ? x.t : null);
    if (!name || t == null || t >= dur) { dropped.push(`SFX "${x.name}" không hợp lệ`); continue; }
    sfx.push({ t: r2(Math.max(0, t - .05)), name, gain: -12, _ai: true });
  }
  const hook = String(raw.hook || '').slice(0, 60);
  return { pack, caption_style, hook, captions: capOut, scenes: [...base, ...scenes], music, sfx, summary: String(raw.summary || '').slice(0, 400), dropped, created: new Date().toISOString() };
}

// Apply a plan: earlier AI items (and untouched recipe items) are replaced; anything the user edited (_orig) or added stays.
export function applyPlan(tl, caps, plan) {
  const starter = !!tl._starter; delete tl._starter; // never-opened "Video mới" project: its starter scenes are placeholders
  const mine = s => starter || ((s._ai || s._recipe) && !s._orig);
  tl.pack = plan.pack; tl.caption_style = plan.caption_style || undefined;
  if (plan.hook) tl.title = plan.hook;
  tl.scenes = [...(tl.scenes || []).filter(s => !mine(s)), ...plan.scenes];
  tl.audio = tl.audio || {};
  tl.audio.music = [...(tl.audio.music || []).filter(m => !m._ai && !(m.t0 <= .05 && m.t1 >= tl.duration - .1)), plan.music];
  tl.audio.sfx = [...(tl.audio.sfx || []).filter(x => !x._ai), ...plan.sfx];
  let n = 0;
  for (const e of plan.captions) {
    const c = caps[e.i];
    if (!c || c.words.length !== e.n || Math.abs(c.t0 - e.t0) > .02) continue;
    e.words.forEach((w, j) => { const cw = c.words[j]; cw.w = w.w; if (w.hl) cw.hl = true; else delete cw.hl; if (w.br) cw.br = true; else delete cw.br; });
    c.words = c.words.filter(w => w.w); n++;
  }
  return n;
}

// ---------- CLI ----------
async function main() {
  const src = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--apply'));
  if (!src) { console.error('usage: node scripts/ai_edit.mjs <project_dir|timeline.json> [--out plan.json] [--goal …] [--pack keep|auto|id] [--density thua|vua|day] [--apply]'); process.exit(2); }
  const o = { goal: opt('--goal', ''), tone: opt('--tone', ''), pack: opt('--pack', 'auto'), density: opt('--density', 'vua'), extra: opt('--extra', '') };
  const optFile = opt('--opts'); if (optFile) Object.assign(o, readJson(optFile) || {});
  const { dir, tlFile, tl, caps } = loadProject(src);
  if (!caps.length) throw new Error('Dự án chưa có phụ đề (cần lời thoại để AI đọc).');
  say(.05, 'Đọc danh sách gói style từ engine');
  const cat = await engineCatalog(tl, caps, dir);
  const lib = libraries();
  const ctx = { tl, caps, cat, lib, o };
  const prompt = buildPrompt(ctx);
  fs.mkdirSync(path.join(dir, '.studio'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.studio/ai_prompt.txt'), prompt);
  let p = .15, raw = null, lastErr = null;
  const model = opt('--model', o.model || 'sonnet');
  for (let attempt = 0; attempt < 2 && !raw; attempt++) {
    say(p, attempt ? 'Claude trả lời chưa đúng JSON — hỏi lại' : `Claude đang đọc lời thoại và lên bản dựng (${Math.round(prompt.length / 1000)}k ký tự, 20–90 giây)`);
    const ask = attempt ? `${prompt}\n\nLần trước bạn trả lời không phải JSON hợp lệ (${lastErr}). Chỉ trả về JSON.` : prompt;
    const t0 = Date.now();
    const res = await callClaude(ask, model, () => { const s = (Date.now() - t0) / 1000; say(Math.min(.88, p + .7 * (1 - Math.exp(-s / 45))), `Claude đang lên bản dựng… ${Math.round(s)}s`); });
    fs.writeFileSync(path.join(dir, '.studio/ai_raw.txt'), res);
    try { raw = parseJson(res); } catch (e) { lastErr = e.message; p = .5; }
  }
  if (!raw) throw new Error('Claude không trả về JSON hợp lệ: ' + lastErr);
  say(.92, 'Kiểm tra và sửa kết quả');
  const plan = validate(raw, ctx);
  const out = path.resolve(dir, opt('--out', '.studio/ai_plan.json'));
  fs.writeFileSync(out, JSON.stringify(plan, null, 1));
  console.log(`plan: ${plan.pack} · ${plan.scenes.length} cảnh · ${plan.captions.length} dòng phụ đề sửa · ${plan.sfx.length} sfx · bỏ ${plan.dropped.length}`);
  if (args.includes('--apply')) {
    const n = applyPlan(tl, caps, plan);
    const capFile = typeof tl.captions === 'string' ? tl.captions : 'work/captions.json';
    fs.writeFileSync(path.join(dir, capFile), JSON.stringify(caps, null, 1)); tl.captions = capFile;
    fs.writeFileSync(tlFile, JSON.stringify(tl, null, 1));
    console.log(`applied → ${tlFile} (${n} dòng phụ đề)`);
  }
  say(1, 'Xong');
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
