// "Bám lời thoại": after a template is applied, fit its scenes to what is actually said in the clip (spec: references/tpl-fit.md).
//   node scripts/tpl_fit.mjs <project_dir | timeline.json> [--claude] [--model sonnet] [--no-images] [--dry]
// Template scenes (_tpl / _recipe, not edited by hand = no _orig) get:
//   1. timing — each starts on the sentence where the speaker talks about it (Claude picks the word; offline: nearest sentence start),
//   2. text — every placeholder ("Tên sản phẩm", "Ưu điểm thứ nhất", HyperFrames vars/texts…) rewritten from the speech,
//   3. images — template sample photos (examples/media) replaced by stock photos found for that sentence (needs internet),
//   4. captions — 1–2 keywords per line highlighted (Claude only).
// Full-length frames/backgrounds and scenes marked keep:true keep their timing. Writes timeline.json in place (+ .bak) and prints
// "@@ p step" progress lines and a final JSON summary line {fit, texts, images, hl, claude, missing[]}.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadProject, callClaude, parseJson } from './ai_edit.mjs';
import { sentences, search as stockSearch, fetchMedia } from './ai_broll.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r2 = v => Math.round(v * 100) / 100;
const fold = s => String(s).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- text slots of a scene ----------
const NONTEXT = new Set(['type', 'id', 'style', 'anim', 'from', 'to', 'icon', 'icons', 'enter', 'color', 'align', 'mode', 'bg', 'kind', 'gradient',
  'glow', 'glow2', 'frame', 'media', 'trans', 'template', 'pal', 'block', 'fit', 'grade', 'side', 'font', 'theme', 'preset', 'hl', 'variant',
  'speaker_pos', 'seq', 'corner', 'screen', 'layout', 'better', 'win', 'tier', 'verdict', 'avatar', 'tiles', 'images', 'image', 'logo', 'emoji',
  'emojis', 'burst', 'e', 'role', 'src', 'url', 'clock', 'coord', 'broll', 'cid', 'note', '_orig', '_tpl', '_recipe', '_auto', '_ai', 'placeholder']);
const EMOJI_KEYS = new Set(['icon', 'emoji', 'e', 'burst', 'src', 'logo']);
const isEmoji = v => typeof v === 'string' && v.length <= 8 && /\p{Extended_Pictographic}/u.test(v) && !/\p{L}/u.test(v);
const IMG_KEYS = new Set(['image', 'media', 'bg', 'before', 'after', 'tiles', 'images', 'avatar', 'src']);
const isImg = v => typeof v === 'string' && /^media\/[^%]+\.(?:jpe?g|png|webp)$/i.test(v);
const isText = v => typeof v === 'string' && /\p{L}/u.test(v) && !/^(#|si:|var\(|https?:|media\/|broll\/|assets\/)/.test(v) && !/\.(jpe?g|png|webp|mp4|svg)$/i.test(v)
  && !/^[a-z_]{1,8}$/.test(v);

let HF = null;
function hfCatalog() {
  if (HF) return HF;
  const win = {};
  for (const f of ['engine/hf/catalog.js', 'engine/hf/vi.js']) {
    try { vm.runInNewContext(fs.readFileSync(path.join(SKILL, f), 'utf8'), { window: win }); } catch { /* engine without HyperFrames */ }
  }
  return (HF = win.HF_CATALOG || {});
}
// [{path:[…keys], ex:"current text"}] — path is relative to the scene; hf scenes expose vars.<id> and texts.<i>.
function textSlots(s) {
  const out = [];
  if (s.type === 'hf') {
    const b = hfCatalog()[s.block]; if (!b) return out;
    for (const v of b.vars || []) if (v.type === 'string') {
      const cur = s.vars?.[v.id] ?? b.vi?.[v.id] ?? v.def;
      if (isText(String(cur ?? ''))) out.push({ path: ['vars', v.id], ex: String(cur), label: v.label });
    }
    for (const t of b.texts || []) {
      const cur = s.texts?.[t.i] ?? b.vit?.[t.i] ?? t.def;
      if (cur && isText(String(cur))) out.push({ path: ['texts', String(t.i)], ex: String(cur) });
    }
    return out;
  }
  const walk = (o, p) => {
    if (Array.isArray(o)) return o.forEach((x, i) => walk(x, [...p, i]));
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (EMOJI_KEYS.has(k) && isEmoji(v)) out.push({ path: [...p, k], ex: v, emoji: true });
        else if (!NONTEXT.has(k) && !(p.length === 0 && /^(t|t0|t1)$/.test(k))) walk(v, [...p, k]);
      }
      return;
    }
    if (isText(o)) out.push({ path: p, ex: o });
  };
  walk(s, []);
  return out;
}
function imageSlots(s, samples) {
  const out = [];
  const walk = (o, p, key) => {
    if (Array.isArray(o)) return o.forEach((x, i) => walk(x, [...p, i], key));
    if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) if (k !== 'seq') walk(v, [...p, k], k); return; }
    if (IMG_KEYS.has(key) && isImg(o) && samples.has(o)) out.push({ path: p, ex: o });
  };
  walk(s, [], '');
  return out;
}
const getP = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o);
function setP(o, p, v) {
  let a = o;
  for (let i = 0; i < p.length - 1; i++) { if (a[p[i]] == null || typeof a[p[i]] !== 'object') a[p[i]] = typeof p[i + 1] === 'number' ? [] : {}; a = a[p[i]]; }
  a[p[p.length - 1]] = v;
}
const key = p => p.join('.');

// ---------- offline text: words from the sentence(s) being said ----------
const STOP = new Set(('la va thi ma cua cac nhung mot cai nay do day kia roi da se dang co duoc bi cho voi de tu den o tren duoi trong ngoai ban ' +
  'chung ta toi minh em anh chi no ho nguoi ai gi sao nao the vay nhe a ah oi u um nhu khi neu vi nen cung con van can phai lam di ' +
  'bay gio hien nay luc sau truoc nua hay hoac rat qua nhieu it moi tung ca hon nhat dau thoi ha ak uh ok oke').split(' '));
function phrase(text, ex) {
  const ws = String(text).replace(/[.,!?…:;"“”()]/g, ' ').split(/\s+/).filter(Boolean);
  const content = ws.map(w => ({ w, stop: STOP.has(fold(w)) }));
  while (content.length && content[0].stop) content.shift();
  while (content.length && content[content.length - 1].stop) content.pop();
  const max = Math.max(10, Math.round(ex.length * 1.25));  // ex padded by callers that already cut to length
  let s = '';
  for (const { w } of content) { if ((s + ' ' + w).trim().length > max) break; s = (s + ' ' + w).trim(); }
  if (!s) return null;
  if (ex === ex.toUpperCase() && /\p{Lu}/u.test(ex)) return s.toUpperCase();
  return s[0].toUpperCase() + s.slice(1);
}
const NUM = /\d+(?:[.,]\d+)?\s*(?:%|tỷ|triệu|nghìn|k|đ|m²|năm|ngày|giờ|phút)?/i;

// ---------- timing ----------
const FRAME = (s, dur) => s.keep || s.t1 - s.t0 >= dur * .4;
function mine(s) { return (s._tpl || s._recipe) && !s._orig && !s._auto; }

export async function fitProject(src, { claude = false, model = 'sonnet', images = true, dry = false, say = () => {} } = {}) {
  const { dir, tlFile, tl, caps } = loadProject(src);
  if (!caps.length) throw new Error('Dự án chưa có lời thoại (phụ đề) — cần tạo lời thoại trước.');
  const dur = tl.duration, sents = sentences(caps);
  const samples = new Set();
  const ex = path.join(SKILL, 'examples/media');
  if (fs.existsSync(ex)) for (const f of fs.readdirSync(ex)) samples.add('media/' + f);
  // every template scene gets speech text; only the ones that are not full-length frames / keep:true are re-timed
  const scenes = (tl.scenes || []).filter(mine).sort((a, b) => a.t0 - b.t0);
  const sum = { fit: scenes.length, texts: 0, images: 0, hl: 0, claude: null, missing: [] };
  if (!scenes.length) { say(1, 'Không có cảnh mẫu cần bám lời thoại'); return sum; }
  const info = scenes.map((s, i) => ({ i, s, fixed: FRAME(s, dur), texts: textSlots(s), imgs: images ? imageSlots(s, samples) : [] })).filter(x => !x.fixed || x.texts.length || x.imgs.length);
  const wordT = (c, w) => { const cap = caps[+c]; if (!cap) return null; const ws = cap.words; return (ws[Math.min(ws.length - 1, Math.max(0, +w || 0))] || {}).s ?? cap.t0; };

  // 1. ask Claude (optional) ------------------------------------------------------------
  let plan = null;
  if (claude) {
    const transcript = caps.map((c, i) => `C${i} [${c.t0.toFixed(2)}–${c.t1.toFixed(2)}] ` + c.words.map((w, j) => `${j}:${w.w}`).join(' ')).join('\n');
    const fixedOf = i => info.find(x => x.i === i)?.fixed;
    const list = info.map(({ i, s, texts, imgs }) => {
      const b = s.type === 'hf' ? hfCatalog()[s.block] : null;
      return `S${i} type=${s.type}${b ? ` (${b.label})` : ''} hiện tại ${s.t0.toFixed(1)}–${s.t1.toFixed(1)}s, dài ${(s.t1 - s.t0).toFixed(1)}s${fixedOf(i) ? ' (khung/kết cố định — chỉ viết chữ, bỏ qua c/w)' : ''}\n` +
        texts.map(t => `  - "${key(t.path)}": ${JSON.stringify(t.ex)} (${t.emoji ? 'một emoji, đổi cho hợp nội dung' : t.ex.length + ' ký tự'}${t.label ? ', ' + t.label : ''})`).join('\n') +
        (imgs.length ? '\n' + imgs.map(m => `  - ẢNH "${key(m.path)}": ${m.ex}`).join('\n') : '');
    }).join('\n');
    const prompt = `Bạn là editor video tiếng Việt. Người dùng vừa chọn một mẫu dựng sẵn cho clip người nói dài ${dur}s. Các cảnh của mẫu đang chứa chữ và ảnh GIỮ CHỖ. Hãy làm cho TOÀN BỘ graphic khớp với lời thoại thật của clip.

# Lời thoại (C<chỉ số dòng> [giây], từng từ <chỉ số>:<từ>; nhận dạng tự động nên có thể sai chính tả)
${transcript}

# Các cảnh của mẫu (giữ thứ tự xuất hiện), các trường chữ cần viết lại và ảnh cần thay
${list}

# Việc cần làm
1. Mỗi cảnh S<i>: chọn thời điểm bắt đầu "c","w" = dòng/từ mà người nói bắt đầu nói tới nội dung của cảnh (cảnh mở đầu đặt ở câu đầu, cảnh kêu gọi/kết ở câu cuối). Giữ đúng thứ tự cảnh, không chồng nhau, "dur" 1.5–8 giây (gợi ý giữ gần độ dài hiện tại, cảnh cuối có thể kéo tới hết video).
2. "texts": viết lại MỌI trường chữ bằng nội dung lấy từ lời thoại (tên sản phẩm, con số, ưu/nhược điểm, giá, lời kêu gọi… đúng như người nói nói; sửa lỗi chính tả). Độ dài xấp xỉ chữ mẫu (graphic thiết kế cho độ dài đó), giữ kiểu viết HOA nếu mẫu viết hoa, giữ định dạng (dấu phẩy ngăn các mục, *nhấn*, \\n xuống dòng). Nếu lời thoại không nhắc tới thông tin đó thì viết nội dung chung hợp với chủ đề clip — KHÔNG để lại chữ mẫu như "Tên sản phẩm", "ví dụ", "mẫu".
3. "images": với mỗi ẢNH, cho 2–4 từ khoá TIẾNG ANH để tìm ảnh stock minh hoạ đúng câu đang nói lúc đó.
4. "hl": với các dòng phụ đề có từ khoá quan trọng, chỉ số 1–2 từ cần nhấn (không phải dòng nào cũng cần).

Chỉ trả về DUY NHẤT một object JSON:
{"scenes":[{"i":0,"c":0,"w":0,"dur":3,"texts":{"<trường>":"…"},"images":{"<trường ảnh>":"english keywords"}}],"hl":[{"c":0,"w":[2]}]}`;
    fs.mkdirSync(path.join(dir, '.studio'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.studio/tplfit_prompt.txt'), prompt);
    const t0 = Date.now();
    say(.15, `Claude đang đọc lời thoại và viết lại ${info.reduce((n, x) => n + x.texts.filter(t => !t.emoji).length, 0)} chữ của mẫu`);
    try {
      for (let a = 0; a < 2 && !plan; a++) {
        const res = await callClaude(a ? prompt + '\n\nLần trước không phải JSON hợp lệ. Chỉ trả về JSON.' : prompt, model,
          () => say(Math.min(.7, .15 + .55 * (1 - Math.exp(-(Date.now() - t0) / 40000))), `Claude đang viết lại chữ theo lời thoại… ${Math.round((Date.now() - t0) / 1000)}s`));
        fs.writeFileSync(path.join(dir, '.studio/tplfit_raw.txt'), res);
        try { plan = parseJson(res); } catch { plan = null; }
      }
      sum.claude = plan ? 'ok' : 'Claude không trả JSON hợp lệ — dùng cách tự động';
    } catch (e) { sum.claude = e.message; }
  }
  const byI = new Map((Array.isArray(plan?.scenes) ? plan.scenes : []).map(x => [+x.i, x]));

  // 2. timing ------------------------------------------------------------------------------
  say(.75, 'Canh thời điểm từng cảnh theo câu nói');
  const starts = sents.map(s => s.t0);
  let prevEnd = 0;
  const moving = info.filter(x => !x.fixed);
  moving.forEach(({ i, s }, n) => {
    const p = byI.get(i), len = s.t1 - s.t0, last = n === moving.length - 1;
    const atStart = s.t0 < .5, atEnd = s.t1 >= dur - .3;
    let t0 = p ? wordT(p.c, p.w) : null;
    if (t0 == null) {
      if (atStart) t0 = s.t0;
      else {
        const cand = starts.filter(t => t >= prevEnd - .01 && t <= dur - .8);
        t0 = cand.length ? cand.reduce((a, b) => (Math.abs(b - s.t0) < Math.abs(a - s.t0) ? b : a)) : s.t0;
        if (Math.abs(t0 - s.t0) > 3) t0 = s.t0;
      }
    } else t0 = Math.max(0, t0 - .05);
    t0 = r2(Math.max(prevEnd, Math.min(dur - .8, t0)));
    let d = p && +p.dur > 0 ? Math.min(8, Math.max(1.2, +p.dur)) : len;
    let t1 = atEnd || (last && p && t0 + d > dur - 1) ? dur : t0 + d;
    const next = moving[n + 1];
    if (next && !byI.get(next.i)) t1 = Math.min(t1, Math.max(t0 + 1.2, next.s.t0));
    t1 = r2(Math.min(dur, Math.max(t0 + .8, t1)));
    shift(s, t0, t1);
    prevEnd = s.t1;
  });

  // 3. texts ------------------------------------------------------------------------------
  say(.8, 'Viết lại chữ của mẫu theo lời thoại');
  const sentAt = t => sents.find(x => x.t1 > t + .05) || sents[sents.length - 1];
  // Offline: the words said from the scene's start on, handed out in order so every field gets a different piece of speech.
  const wordsFrom = t => caps.flatMap(c => c.words.filter(w => (w.s ?? c.t0) >= t - .05).map(w => w.w));
  const taken = (ws, ex) => {
    while (ws.length && STOP.has(fold(ws[0]))) ws.shift();
    const max = Math.max(8, Math.round(ex.length * 1.15)), out = [];
    while (ws.length && (out.join(' ') + ' ' + ws[0]).trim().length <= max) out.push(ws.shift());
    if (!out.length && ws.length) out.push(ws.shift());
    while (out.length > 1 && STOP.has(fold(out[out.length - 1]))) ws.unshift(out.pop());
    return out.length ? phrase(out.join(' '), ex + ' '.repeat(10)) : null;
  };
  for (const { i, s, texts } of info) {
    const p = byI.get(i), given = p?.texts && typeof p.texts === 'object' ? p.texts : {};
    const pool = sents.filter(x => x.t1 > s.t0 && x.t0 < s.t1);
    let ws = wordsFrom(s.t0);
    if (ws.length < 6) ws = caps.flatMap(c => c.words.map(w => w.w)).slice(-40);
    for (const t of texts) {
      let v = given[key(t.path)];
      if (t.emoji) { if (isEmoji(v)) { setP(s, t.path, v); sum.texts++; } continue; } // offline: emojis stay
      if (typeof v !== 'string' || !v.trim()) {
        const money = /đ|tr|tỷ|k\b|\$/i.test(t.ex), pct = /%/.test(t.ex);
        if (/^\s*[\d.,+%-]+/.test(t.ex) || (/\d/.test(t.ex) && t.ex.length <= 14)) {
          // numbers only when the speech says one of the same kind (a price needs a currency word, a percentage needs %)
          const m = (pool.length ? pool : sents).map(x => NUM.exec(x.text)).find(m => m && (!money || /tỷ|triệu|nghìn|k|đ/i.test(m[0])) && (!pct || /%/.test(m[0])));
          v = m ? m[0].trim() : null;
        } else if (t.ex.includes(',') && t.path[0] === 'vars') {
          const parts = t.ex.split(','); v = parts.map(x => taken(ws, x)).filter(Boolean).join(',') || null;
        } else v = taken(ws, t.ex);
        if (!v) { sum.missing.push(t.ex); continue; }
      }
      v = String(v).trim();
      const cap = Math.max(30, Math.ceil(t.ex.length * 2.5));
      if (v.length > cap) v = v.slice(0, cap).replace(/\s+\S*$/, '') || v.slice(0, cap);
      if (t.path[0] === 'vars' && s.type === 'hf') { s.vars = s.vars || {}; s.vars[t.path[1]] = v; }
      else if (t.path[0] === 'texts' && s.type === 'hf') { s.texts = s.texts || {}; s.texts[t.path[1]] = v; }
      else setP(s, t.path, v);
      sum.texts++;
    }
  }

  // 4. images ----------------------------------------------------------------------------
  const want = info.flatMap(({ i, s, imgs }) => imgs.map(m => ({ s, m, q: byI.get(i)?.images?.[key(m.path)] || sentAt(s.t0)?.text || '' })));
  if (want.length && !dry) {
    const vertical = (tl.height || 1920) > (tl.width || 1080), used = new Set();
    let n = 0;
    for (const { s, m, q } of want) {
      say(.82 + .15 * (n++ / want.length), `Tìm ảnh theo lời thoại: ${String(q).slice(0, 40)}`);
      try {
        // free libraries often have nothing for 4 keywords: retry with the first 2, then the first one
        const ws = String(q).split(/\s+/).filter(Boolean), tries = [...new Set([ws.join(' '), ws.slice(0, 2).join(' '), ws[0]].filter(Boolean))];
        let h = null;
        for (const qq of tries) {
          const r = await stockSearch(qq, { kind: 'photo', n: 8, en: /^[\x00-\x7F]+$/.test(qq) ? qq : undefined });
          h = (r.items || []).find(x => !used.has(x.url) && (x.w || 1000) >= 500); if (h) break;
        }
        if (!h) throw new Error('không thấy ảnh');
        used.add(h.url);
        const f = await fetchMedia(h.url, dir, { kind: 'photo', name: 'fit-' + String(q).slice(0, 20), vertical,
          meta: { provider: h.provider, author: h.author, license: h.license, page: h.page, query: q } });
        setP(s, m.path, f.path); sum.images++;
      } catch { sum.missing.push('ảnh ' + m.ex.replace(/^media\//, '')); }
    }
  }

  // 5. caption keywords --------------------------------------------------------------------
  for (const h of Array.isArray(plan?.hl) ? plan.hl : []) {
    const c = caps[+h.c]; if (!c) continue;
    for (const w of (Array.isArray(h.w) ? h.w : [h.w]).slice(0, 2)) if (c.words[+w]) { c.words[+w].hl = true; sum.hl++; }
  }

  for (const s of scenes) s._fit = true;
  if (!dry) {
    fs.copyFileSync(tlFile, tlFile + '.bak');
    if (sum.hl) { const capFile = typeof tl.captions === 'string' ? tl.captions : 'work/captions.json'; fs.mkdirSync(path.dirname(path.join(dir, capFile)), { recursive: true }); fs.writeFileSync(path.join(dir, capFile), JSON.stringify(caps, null, 1)); tl.captions = capFile; }
    fs.writeFileSync(tlFile, JSON.stringify(tl, null, 1));
  }
  say(1, 'Xong');
  return sum;
}

// Move a scene to [t0,t1]: every absolute time inside (t, reveal_t, items[].t …) moves with it, scaled to the new length.
const TKEY = /^(t|out|strike_at|[a-z0-9_]*_t)$/;
function shift(s, t0, t1) {
  const a0 = s.t0, a1 = s.t1, k = (t1 - t0) / Math.max(.01, a1 - a0);
  const walk = o => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    for (const [kk, v] of Object.entries(o)) {
      if (TKEY.test(kk) && typeof v === 'number' && v >= a0 - .01 && v <= a1 + .01) o[kk] = r2(t0 + (v - a0) * k);
      else if (v && typeof v === 'object' && kk !== 'vars' && kk !== 'texts') walk(v);
    }
  };
  walk(s);
  s.t0 = t0; s.t1 = t1;
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const src = a.find(x => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--model');
  if (!src) { console.error('usage: node scripts/tpl_fit.mjs <project_dir|timeline.json> [--claude] [--model sonnet] [--no-images] [--dry]'); process.exit(2); }
  fitProject(src, { claude: a.includes('--claude'), model: opt('--model', 'sonnet'), images: !a.includes('--no-images'), dry: a.includes('--dry'),
    say: (p, s) => console.log(`@@ ${p.toFixed(2)} ${s}`) })
    .then(r => console.log(JSON.stringify(r)))
    .catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
}
