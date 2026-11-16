// "Nhiều phiên bản" — A/B variants of a project: sibling full projects <project>_v1.._vN with a different opening hook
// (Claude writes N hook texts with different angles; optionally a cold-open teaser = the strongest sentence copied to the front
// when the transcript gives a clean cut) and/or a different style pack (the pack's own recipe). Spec: references/qc-variants.md.
// usage: node scripts/variants.mjs <project_dir> [--n 3] [--kind hook|style|both] [--export] [--quality 720|1080] [--model sonnet] [--no-claude]
// Writes <project>/variants.json {base, kind, variants:[{dir, name, hook, pack, desc, still, video}]}. Progress: "@@ <0..1> <step>".
import fs from 'node:fs'; import path from 'node:path'; import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { SKILL, PY, loadProject, saveProject, designOf, isBase, openEngine, engineInit, engineShot, askClaude, parseJson } from './ai_qc.mjs';

const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const deep = o => JSON.parse(JSON.stringify(o));
const say = (p, s) => console.log(`@@ ${clamp(p, 0, 1).toFixed(2)} ${s}`);
const capText = c => (c.words || []).map(w => w.w).join(' ');
const SPECIAL = new Set(['hypecam', 'beatslide', 'multicam', 'screencast', 'greenscreen', 'transform']);
const PACK_ORDER = ['share', 'neon', 'luxury', 'kinetic', 'glow', 'slate', 'course', 'review', 'keynote', 'podcast', 'cinema', 'news', 'qa', 'topn', 'realestate', 'split'];
// Hook looks: deliberately different per variant (style/anim/position/sfx of the opening text).
const LOOKS = [
  { style: 'yellow', anim: 'pop', y: .2, sfx: 'impact', fx: 'punch' },
  { style: 'ink', anim: 'tumble', y: .24, sfx: 'whoosh', fx: 'shake' },
  { style: 'glow', anim: 'blur_zoom', y: .17, sfx: 'cinematic_hit', fx: 'flash' },
  { style: 'neon', anim: 'slide_l', y: .22, sfx: 'whoosh_fast', fx: 'whip' },
  { style: 'fire', anim: 'drop', y: .19, sfx: 'boom', fx: 'punch' },
];
const ANGLES = ['câu hỏi gây tò mò', 'tuyên bố mạnh / con số', 'nỗi đau hoặc lợi ích trực tiếp của người xem', 'phản trực giác / bất ngờ', 'lời hứa kết quả'];

// ---------- hooks from Claude ----------
function hookPrompt(tl, caps, n, oldHook) {
  return `Bạn là biên tập viên video ngắn tiếng Việt (TikTok/Reels/Shorts). Viết ${n} câu HOOK mở đầu KHÁC NHAU cho cùng một video, để chạy A/B test.
Lời thoại (id phụ đề, giây, chữ):
${caps.map((c, k) => `c${k} ${c.t0.toFixed(1)}s: ${capText(c)}`).join('\n')}
Tiêu đề hiện tại: ${tl.title || '(chưa có)'} · hook đang dùng: ${oldHook || '(không có)'} · dài ${tl.duration}s.
Yêu cầu:
- Mỗi hook ≤ 7 từ, tiếng Việt CÓ DẤU đúng chính tả, đúng nội dung video (không bịa con số không có trong lời thoại), mỗi cái một góc: ${ANGLES.slice(0, n).join('; ')}.
- "teaser" (tuỳ chọn, tối đa 1 phiên bản): nếu có một câu nói mạnh nhất, trọn ý, nằm sau giây thứ 5, dài 1,5–5 giây, bắt đầu và kết thúc đúng ranh giới câu (c0 = id phụ đề đầu, c1 = id phụ đề cuối), thì đưa ra để chèn lên đầu video làm đoạn mở (cold open). Không chắc cắt sạch thì để null.
Chỉ trả về JSON: {"variants":[{"name":"tên ngắn 2–3 từ","hook":"…","why":"1 câu vì sao hook này giữ chân","teaser":{"c0":12,"c1":13} hoặc null}]}`;
}
function fallbackHooks(tl, caps, n) {
  const first = []; for (const c of caps) { first.push(...c.words.map(w => w.w)); if (first.length >= 6) break; }
  const kw = caps.flatMap(c => c.words.filter(w => w.hl).map(w => w.w))[0] || first.slice(0, 2).join(' ');
  return [tl.title || first.slice(0, 6).join(' '), `Bạn đã biết ${kw}?`, `Đừng bỏ qua điều này`, `Sự thật về ${kw}`, 'Xem hết sẽ bất ngờ'].slice(0, n)
    .map((h, i) => ({ name: ['Tiêu đề', 'Câu hỏi', 'Cảnh báo', 'Sự thật', 'Bất ngờ'][i], hook: h, why: 'Hook dựng sẵn (không dùng Claude)', teaser: null }));
}
function validHooks(raw, caps, n, dur) {
  const out = [];
  for (const v of (raw?.variants || []).slice(0, n)) {
    const hook = String(v.hook || '').trim().replace(/^["“]|["”]$/g, '');
    if (!hook || hook.split(/\s+/).length > 9) continue;
    let teaser = null;
    const c0 = +v.teaser?.c0, c1 = +v.teaser?.c1;
    if (Number.isInteger(c0) && Number.isInteger(c1) && caps[c0] && caps[c1] && c1 >= c0 && caps[c0].t0 >= 4 && caps[c1].t1 <= dur) {
      const a = caps[c0].t0, b = caps[c1].t1;
      if (b - a >= 1.2 && b - a <= 6.5 && !out.some(o => o.teaser)) teaser = { c0, c1, a: r2(a), b: r2(b) };
    }
    out.push({ name: String(v.name || '').slice(0, 30) || `Hook ${out.length + 1}`, hook: hook.slice(0, 60), why: String(v.why || '').slice(0, 200), teaser });
  }
  return out;
}

// ---------- timeline edits ----------
const ABS = new Set(['t', 'out', 't0', 't1', 'reveal_t', 'strike_at', 'highlight_t']);
function shiftAll(tl, caps, d) {
  // everything after 0 moves by d; long layers / music that start at 0 stay at 0 and get longer (they cover the teaser too)
  const walk = (o, top) => { if (Array.isArray(o)) return o.forEach(x => walk(x, false)); if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (k === '_orig') continue; if (!top && ABS.has(k) && typeof v === 'number') o[k] = r2(v + d); else if (v && typeof v === 'object') walk(v, false); } };
  for (const s of tl.scenes || []) { const long = s.t0 <= .05 && isBase(s, tl); walk(s, true); if (long) s.t1 = r2(s.t1 + d); else { s.t0 = r2(s.t0 + d); s.t1 = r2(s.t1 + d); } }
  for (const c of caps) { c.t0 = r2(c.t0 + d); c.t1 = r2(c.t1 + d); for (const w of c.words) { w.s = r2(w.s + d); w.e = r2(w.e + d); } }
  const A = tl.audio || {};
  for (const x of A.sfx || []) x.t = r2(x.t + d);
  for (const m of A.music || []) { if (m.t0 <= .05) m.t1 = r2(m.t1 + d); else { m.t0 = r2(m.t0 + d); m.t1 = r2(m.t1 + d); } }
  for (const f of tl.fx || []) f.t = r2(f.t + d);
  for (const k of ['grade', 'zoom', 'captionsHide']) for (const r of tl[k] || []) { if (r.t0 <= .05 && k === 'grade') r.t1 = r2(r.t1 + d); else { r.t0 = r2(r.t0 + d); r.t1 = r2(r.t1 + d); } }
  tl.duration = r2((tl.duration || 0) + d);
}
function framesCount(dir, tl) { const d = path.resolve(dir, path.dirname(tl.aroll?.frames || 'work/frames/x')); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.jpe?g$/.test(f)).length : 0; }
// Cold open: copy output range [a, b] of the main track to the very front (flash cut into the original start).
function addTeaser(dir, tl, caps, a, b) {
  const fps = tl.fps || 30;
  if (!tl.clips?.length) {
    if (!tl.aroll?.frames) return false;
    const n = framesCount(dir, tl); if (!n) return false;
    tl.clips = [{ src: { seq: tl.aroll.frames, fps, count: n }, ...(tl.audio?.voice ? { audio: tl.audio.voice } : {}), in: 0, out: r2(Math.min(n / fps, tl.duration)) }];
  }
  let t = 0, pick = null;
  for (const c of tl.clips) { if (c.hidden) continue; const d = ((c.out ?? 3) - (c.in || 0)) / (c.speed || 1); if (a >= t && b <= t + d + .02 && typeof c.src !== 'string') { pick = { c, t }; break; } t += d; }
  if (!pick) return false; // range spans a cut between clips: not a clean teaser
  const sp = pick.c.speed || 1, srcA = (pick.c.in || 0) + (a - pick.t) * sp, srcB = (pick.c.in || 0) + (b - pick.t) * sp;
  const teaser = { ...deep(pick.c), in: r2(srcA), out: r2(srcB), _teaser: true }; delete teaser.transition;
  const d = (srcB - srcA) / sp;
  const tc = caps.filter(c => c.t0 >= a - .02 && c.t1 <= b + .02).map(c => ({ ...deep(c), _teaser: true }));
  shiftAll(tl, caps, d);
  for (const c of tc) { c.t0 = r2(c.t0 - a); c.t1 = r2(c.t1 - a); for (const w of c.words) { w.s = r2(w.s - a); w.e = r2(w.e - a); } }
  caps.unshift(...tc);
  tl.clips[0].transition = { type: 'flash', dur: .3 };
  tl.clips.unshift(teaser);
  tl.fx = [...(tl.fx || []), { t: r2(d), type: 'flash', _variant: true }];
  return r2(d);
}
function splitHook(text, DW, width = DW * .8) {
  const T = text.toUpperCase(), w = T.split(/\s+/);
  const lines = T.length > (width < 700 ? 12 : 16) && w.length > 2 ? [w.slice(0, Math.ceil(w.length / 2)).join(' '), w.slice(Math.ceil(w.length / 2)).join(' ')] : [T];
  const longest = Math.max(...lines.map(l => l.length)), size = Math.round(clamp(width / (longest * .62), 34, DW > 1000 ? 84 : 76));
  return { lines, size };
}
// the old opening overlay(s) with text go away (user-edited ones stay)
const dropOldHook = tl => { tl.scenes = (tl.scenes || []).filter(s => isBase(s, tl) || s._orig || s.t0 >= 2.2 || !(s.text || s.lines || s.value || s.question || s.title)); };
function setHook(tl, caps, v, look, sfxOk) {
  const [DW, DH] = designOf(tl);
  const vert = DH > DW, face = tl.face || (vert ? { x: DW / 2, y: DH * .42 } : { x: DW / 2, y: DH * .42 });
  // vertical: above the face (or lower third); horizontal: beside the face, on the emptier side
  const x = vert ? DW / 2 : face.x > DW / 2 ? DW * .27 : DW * .73;
  const { lines, size } = splitHook(v.hook, DW, vert ? DW * .8 : DW * .42), t0 = .05, t1 = Math.min(2.8, tl.duration - .1);
  const y0 = vert ? (face.y > DH * .38 ? DH * look.y : DH * .64) : DH * .36 - (lines.length - 1) * size * .56;
  tl.scenes.push({ type: 'text', t0, t1, hideCaptions: true, _variant: true,
    lines: lines.map((L, i) => ({ text: L, t: r2(t0 + i * .18), x: Math.round(x), y: Math.round(y0 + i * size * 1.12), size, style: look.style, anim: look.anim, upper: false })) });
  tl.fx = [...(tl.fx || []).filter(f => !(f._variant && f.t < .2)), { t: .05, type: look.fx, _variant: true }];
  tl.audio = tl.audio || {};
  tl.audio.sfx = [...(tl.audio.sfx || []).filter(x => x.t > .3), ...(sfxOk(look.sfx) ? [{ t: .05, name: look.sfx, gain: -10, _variant: true }] : [])];
  tl.title = v.hook;
}

// ---------- style packs (engine recipes, run in the same headless Chrome) ----------
async function recipes(E, tl, caps, want) {
  return E.page.evaluate((ctx, want, SPECIAL, ORDER) => {
    const ok = PACKS.filter(p => p.recipe && !SPECIAL.includes(p.id) && p.id !== ctx.cur && !(p.horizontal && ctx.vertical));
    ok.sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));
    return ok.slice(0, want).map(p => { try { const r = p.recipe({ ...ctx, brand: BR() }); return { id: p.id, name: p.name, caption_style: r.caption_style, scenes: r.scenes || [], fx: r.fx || null, music: r.music || null }; } catch (e) { return null; } }).filter(Boolean);
  }, { dur: tl.duration, captions: caps, vertical: (tl.height || 1920) > (tl.width || 1080), title: tl.title || '', cur: tl.pack }, want, [...SPECIAL], PACK_ORDER);
}
function setStyle(tl, r) {
  tl.pack = r.id;
  if (r.caption_style != null) tl.caption_style = r.caption_style || undefined;
  // keep the user's own overlays and universal text/b-roll; drop the old pack's AI/recipe graphics
  tl.scenes = [...(tl.scenes || []).filter(s => s._orig || (!s._ai && !s._recipe && !s._base && !isBase(s, tl) && ['text', 'broll', 'emoji_pop', 'sticker'].includes(s.type))), ...r.scenes.map(s => ({ ...s, _recipe: true }))];
  if (r.fx) tl.fx = [...(tl.fx || []).filter(f => !f._recipe), ...r.fx.map(f => ({ ...f, _recipe: true }))];
  if (r.music) { tl.audio = tl.audio || {}; tl.audio.music = [{ t0: 0, t1: tl.duration, mood: r.music, gain: -20 }]; }
}

// ---------- export (same steps as the Studio's exportVideo: mix_audio.py → render.mjs) ----------
function run(cmd, argv, cwd, onLine) {
  return new Promise((ok, bad) => { const p = spawn(cmd, argv, { cwd }); let err = ''; p.stdout.on('data', d => d.toString().split(/[\r\n]/).forEach(l => l && onLine && onLine(l))); p.stderr.on('data', d => (err = (err + d).slice(-2000))); p.on('close', c => (c ? bad(new Error(`${path.basename(cmd)} lỗi (mã ${c}): ${err.slice(-300)}`)) : ok())); });
}
async function exportProject(dir, quality, onP) {
  const tlFile = path.join(dir, 'timeline.json'), tl = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
  const vert = (tl.height || 720) > (tl.width || 1280), [W, H] = quality === '1080' ? [1080, 1920] : [720, 1280];
  let mix = null;
  if (tl.audio && (tl.audio.voice || tl.audio.music?.length || tl.clips?.some(c => c.audio))) {
    await run(PY, ['-I', '-X', 'utf8', path.join(SKILL, 'scripts/mix_audio.py'), tlFile], dir);
    mix = path.resolve(dir, tl.audio.mix || 'work/mix.wav');
  }
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  const out = `out/${path.basename(dir)}.mp4`, tmp = path.join(dir, `.export_${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ ...tl, width: vert ? W : H, height: vert ? H : W }));
  try { await run('node', [path.join(SKILL, 'scripts/render.mjs'), tmp, path.join(dir, out), ...(mix ? ['--audio', mix] : [])], dir, l => { const m = /([\d.]+)s \/ ([\d.]+)s/.exec(l); if (m) onP(+m[1] / +m[2]); }); }
  finally { fs.rmSync(tmp, { force: true }); }
  return out;
}

// ---------- main ----------
export async function makeVariants(src, o = {}) {
  const base = loadProject(src), dir = base.dir, n = clamp(+o.n || 3, 1, 5), kind = ['hook', 'style', 'both'].includes(o.kind) ? o.kind : 'hook';
  if (!base.caps.length && kind !== 'style') throw new Error('Dự án chưa có phụ đề — cần lời thoại để viết hook.');
  const [DW, DH] = designOf(base.tl);
  const sfxOk = name => ['.flac', '.wav', '.mp3'].some(e => fs.existsSync(path.join(SKILL, 'assets/sfx', name + e)));
  const oldHook = (base.tl.scenes || []).filter(s => !s.hidden && !isBase(s, base.tl) && s.t0 < 1.5).map(s => s.text || s.lines?.map(L => L.text).join(' ') || s.value || '').filter(Boolean)[0] || '';
  // 1. hooks
  let hooks = [];
  if (kind !== 'style') {
    if (!o.noClaude) {
      say(.04, `Claude viết ${n} hook mở đầu (15–40 giây)`);
      try {
        const t0 = Date.now(), raw = await askClaude(hookPrompt(base.tl, base.caps, n, oldHook), { model: o.model || 'sonnet', onTick: s => say(.04 + .2 * (1 - Math.exp(-s / 30)), `Claude đang viết hook… ${Math.round(s)}s`) });
        fs.mkdirSync(path.join(dir, '.studio'), { recursive: true }); fs.writeFileSync(path.join(dir, '.studio/variants_raw.txt'), raw);
        hooks = validHooks(parseJson(raw), base.caps, n, base.tl.duration);
        console.log(`hooks (${((Date.now() - t0) / 1000).toFixed(0)}s): ${hooks.map(h => h.hook).join(' | ')}`);
      } catch (e) { console.error('[variants] Claude: ' + e.message + ' — dùng hook dựng sẵn'); }
    }
    if (hooks.length < n) hooks.push(...fallbackHooks(base.tl, base.caps, n).slice(hooks.length));
  }
  say(.26, 'Mở engine');
  const E = await openEngine(dir);
  const out = [];
  try {
    // 2. packs
    let packs = [];
    if (kind !== 'hook') { await engineInit(E, base.tl, base.caps); packs = await recipes(E, base.tl, base.caps, n); if (!packs.length) throw new Error('Không tìm được gói style nào khác phù hợp khổ hình này.'); }
    // 3. sibling projects
    for (let i = 0; i < n; i++) {
      say(.3 + i / n * .25, `Tạo phiên bản ${i + 1}/${n}`);
      let dst = `${dir}_v${i + 1}`;
      if (fs.existsSync(dst)) {
        const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(dst, 'timeline.json'), 'utf8'))._variant?.base; } catch { return null; } })();
        if (prev && path.resolve(prev) === dir) fs.rmSync(dst, { recursive: true, force: true });
        else { let k = 2; while (fs.existsSync(`${dir}_v${i + 1}_${k}`)) k++; dst = `${dir}_v${i + 1}_${k}`; }
      }
      try { execFileSync('cp', ['-cR', dir, dst]); } catch { fs.cpSync(dir, dst, { recursive: true }); } // APFS clone: instant, no extra disk
      for (const f of ['out', 'variants.json', '.studio/history', '.studio/qc', '.studio/qc.json', '.studio/qc_backup.json']) fs.rmSync(path.join(dst, f), { recursive: true, force: true });
      const P = loadProject(dst); let { tl, caps } = P;
      const v = { dir: dst, kind, name: '', desc: '', hook: '', pack: tl.pack };
      if (kind !== 'hook') { const r = packs[i % packs.length]; setStyle(tl, r); v.pack = r.id; v.name = r.name; v.desc = `Gói ${r.name}`; }
      if (kind !== 'style') {
        const h = hooks[i % hooks.length];
        dropOldHook(tl);
        if (h.teaser) { const d = addTeaser(dst, tl, caps, h.teaser.a, h.teaser.b); if (d) { v.teaser = { from: h.teaser.a, to: h.teaser.b, dur: d }; } }
        setHook(tl, caps, h, LOOKS[i % LOOKS.length], sfxOk);
        v.hook = h.hook; v.name = kind === 'both' ? `${h.name} · ${v.name}` : h.name;
        v.desc = [h.why, v.teaser ? `Mở bằng câu nói ở ${v.teaser.from.toFixed(1)}s (${v.teaser.dur.toFixed(1)}s) rồi cắt flash về đầu.` : '', kind === 'both' ? v.desc : ''].filter(Boolean).join(' ');
      }
      tl._variant = { base: dir, i: i + 1, kind, hook: v.hook, pack: v.pack, created: new Date().toISOString() };
      saveProject(P, tl, caps);
      // hook still (t = 1.2 s, or inside the teaser)
      await engineInit(E, tl, caps);
      v.still = '.studio/hook.jpg'; await engineShot(E, 1.2, path.join(dst, v.still), false);
      out.push(v);
    }
    await engineInit(E, base.tl, base.caps); await engineShot(E, 1.2, path.join(dir, '.studio/hook.jpg'), false);
  } finally { await E.browser.close().catch(() => {}); }
  // 4. optional export of every variant
  if (o.export) for (let i = 0; i < out.length; i++) {
    say(.58 + i / out.length * .4, `Xuất phiên bản ${i + 1}/${out.length}`);
    out[i].video = await exportProject(out[i].dir, o.quality || '720', k => say(.58 + (i + k) / out.length * .4, `Xuất phiên bản ${i + 1}/${out.length} · ${Math.round(k * 100)}%`));
  }
  const baseVid = fs.existsSync(path.join(dir, 'out')) ? fs.readdirSync(path.join(dir, 'out')).filter(f => f.endsWith('.mp4')).map(f => `out/${f}`).sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)[0] : null;
  const res = { base: dir, created: new Date().toISOString(), kind, kind_vi: { hook: 'khác hook mở đầu', style: 'khác gói style', both: 'khác hook + gói style' }[kind], n: out.length,
    base_hook: oldHook || base.tl.title || '', base_still: '.studio/hook.jpg', base_video: baseVid || undefined, size: `${DW}x${DH}`, variants: out };
  fs.writeFileSync(path.join(dir, 'variants.json'), JSON.stringify(res, null, 1));
  return res;
}

async function main() {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const src = args.find((a, i) => !a.startsWith('--') && !(i > 0 && ['--n', '--kind', '--model', '--quality'].includes(args[i - 1])));
  if (!src) { console.error('usage: node scripts/variants.mjs <project_dir> [--n 3] [--kind hook|style|both] [--export] [--quality 720|1080] [--no-claude]'); process.exit(2); }
  const r = await makeVariants(src, { n: +opt('--n', 3), kind: opt('--kind', 'hook'), export: args.includes('--export'), quality: opt('--quality', '720'), model: opt('--model', 'sonnet'), noClaude: args.includes('--no-claude') });
  for (const v of r.variants) console.log(`${path.basename(v.dir)}: ${v.name} · hook “${v.hook}” · ${v.pack}${v.teaser ? ` · teaser ${v.teaser.dur}s` : ''}${v.video ? ` → ${v.video}` : ''}`);
  console.log(`variants: ${path.join(r.base, 'variants.json')}`);
  say(1, 'Xong');
  process.exit(0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
