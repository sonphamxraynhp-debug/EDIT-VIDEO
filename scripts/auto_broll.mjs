// One-shot automatic b-roll for a project (spec: references/autofill.md). No npm deps; Claude/stock/AI images optional.
//   node auto_broll.mjs <timeline.json> [--goal auto|banhang|bds|khoahoc|review|tintuc|kechuyen|doanhnghiep|amthuc|giaitri]
//        [--density thua|vua|day|ratday] [--variety 0..1] [--src preset,hf,text,emoji,logo,aroll,media,lib,stock,stockvid,aiimg]
//        [--claude] [--seed 1] [--dry] [--clear] [--out other.json]
// Each insert point gets a role from the sentence (number, money, list, compare, proof, tool, place, time, emotion, hook, cta…);
// the goal (assets/broll/goals.json) says which sources suit which role; candidates from 11 sources are scored by goal × role ×
// variety (no source twice in a row, no template within 3–5), the best wins and up to 3 cheap runners-up are kept on the scene
// as _alts (Studio: "Phương án khác"). Sources: catalog presets (9 000+, 55 templates), HyperFrames blocks with vars from the
// speech, keyword text, 3D emoji, brand logos of tools named, effects on the speaker (push / punch / mono, in TL.fx), the
// project's media/, the personal library (scripts/broll_lib.mjs), stock video / photos, AI images (own OpenAI/Gemini key).
// Layouts rotate (card / right / left / pip / full / person-behind) and never cover TL.face; full 9:16 presets use fit:"portrait".
// Skips 0–1.5 s, the outro/title card and existing non-auto big scenes. Every inserted scene has _auto:true -> a re-run replaces
// only those (scenes you edited — _orig — are kept). Writes the timeline in place (timeline.json.bak first). Progress: "@@ p step".
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { search as stockSearch, fetchMedia, sentences } from './ai_broll.mjs';
import { spawnClaude } from './platform.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = k => args.includes(k);
const say = (p, s) => console.log(`@@ ${p.toFixed(2)} ${s}`);
const fold = s => String(s).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
const r2 = v => Math.round(v * 100) / 100;

const DENS = { thua: 8, vua: 5, day: 3, ratday: 2, 'rat day': 2, 'rất dày': 2, 'thưa': 8, 'vừa': 5, 'dày': 3 };
const PACK_PAL = { slate: 'ocean', hypecam: 'ember', bubble: 'ember', basic: 'violet', course: 'forest', luxury: 'gold', neon: 'neon', keynote: 'mono',
  glow: 'sunset', podcast: 'violet', kinetic: 'candy', realestate: 'gold', review: 'ember', share: 'sunset', split: 'ocean', transform: 'violet',
  greenscreen: 'ocean', news: 'ocean', multicam: 'neon', qa: 'violet', topn: 'ember', cinema: 'mono', beatslide: 'neon', screencast: 'ocean' };
const SECOND = { ember: 'gold', neon: 'violet', ocean: 'violet', forest: 'ocean', gold: 'ember', violet: 'neon', mono: 'ember', sunset: 'violet', light: 'candy', candy: 'light' };
const PAL_HUE = { ember: 8, neon: 190, ocean: 200, forest: 150, gold: 42, violet: 260, sunset: 340 };
const NUM_TPL = ['counter_big', 'bar_chart', 'line_chart', 'pie', 'progress'];
const BG_TPL = new Set(['particles', 'blobs', 'wave_lines', 'hex_grid', 'grid_tunnel', 'starfield', 'equalizer']);
const GENERIC = ['sunburst', 'rings', 'icon_hero', 'spotlight', 'particles', 'glitch_text', 'starfield', 'quote_card', 'wave_lines'];
const STOP = new Set(('la va thi ma cua cac nhung mot cai nay do day kia roi da se dang co duoc bi cho voi de tu den o tren duoi trong ngoai ' +
  'ban chung ta toi minh em anh chi no ho nguoi ai gi sao nao the vay nhe a ah oi u um nhu khi neu vi nen cung con van chi can phai ' +
  'lam di len xuong ra vao bay gio hien nay luc sau truoc nua hay hoac rat qua lam nhieu it moi tung ca hon nhat ma thi dau').split(' '));
const EMOJI = [['tien', '💰'], ['doanh thu', '📈'], ['tang', '📈'], ['giam', '📉'], ['nhanh', '⚡'], ['thoi gian', '⏰'], ['phut', '⏱️'], ['gio', '⏰'],
  ['ai', '🤖'], ['robot', '🤖'], ['video', '🎬'], ['clip', '🎬'], ['edit', '✂️'], ['thanh cong', '🏆'], ['chuc', '🎉'], ['vui', '😄'], ['buon', '😢'],
  ['bat ngo', '😱'], ['soc', '😱'], ['yeu', '❤️'], ['thich', '😍'], ['hot', '🔥'], ['y tuong', '💡'], ['sai', '❌'], ['dung', '✅'], ['dien thoai', '📱'],
  ['may tinh', '💻'], ['nha', '🏠'], ['can ho', '🏢'], ['xe', '🚗'], ['hoc', '📚'], ['suc khoe', '💪'], ['cong cu', '🛠️'], ['tool', '🛠️'], ['de', '👌'],
  ['kho', '😓'], ['cam on', '🙏'], ['nhac', '🎵'], ['hinh anh', '🖼️'], ['anh', '📸'], ['chu', '🔤'], ['phong chu', '🔤'], ['keo tha', '🖱️'], ['tu dong', '⚙️'],
  ['hieu ung', '✨'], ['dep', '✨'], ['tuyet', '🤩'], ['wow', '🤩'], ['khach hang', '🤝'], ['ban hang', '🛒'], ['mien phi', '🎁'], ['qua', '🎁'],
  ['muc tieu', '🎯'], ['tien hoa', '🚀'], ['phat trien', '🚀'], ['xa', '🚀'], ['bi mat', '🤫'], ['canh bao', '⚠️'], ['nguy hiem', '⚠️'], ['nghi', '🤔'], ['hoi', '❓']];
const EMOTION = new Set(['tuyet', 'wow', 'bat ngo', 'soc', 'yeu', 'thich', 'vui', 'buon', 'thanh cong', 'chuc', 'hot', 'dep', 'tien hoa', 'tu dong', 'mien phi', 'bi mat', 'canh bao', 'nhanh chong', 'de dang']);

// ---------- inputs ----------
const tlPath = path.resolve(args[0] || '');
if (!args[0] || !fs.existsSync(tlPath)) { console.error('usage: node auto_broll.mjs <timeline.json> [--density vua] [--src preset,text,emoji,media] [--claude]'); process.exit(1); }
const DIR = path.dirname(tlPath);
const TL = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
const density = DENS[fold(opt('--density', 'vua')).replace(/\s+/g, ' ')] ?? DENS[opt('--density', 'vua')] ?? 5;
const SRC = new Set(String(opt('--src', 'preset,hf,text,emoji,logo,aroll,media,lib')).split(',').map(s => s.trim()).filter(Boolean));
const SEED = +opt('--seed', 1);
let rs = SEED * 9301 + 49297; const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280);

const before = (TL.scenes || []).length;
const keepScene = s => !s._auto || s._orig;
TL.scenes = (TL.scenes || []).filter(keepScene);
if (TL.fx) TL.fx = TL.fx.filter(f => !f._auto);
const removed = before - TL.scenes.length;
function write(note) {
  const out = path.resolve(opt('--out', tlPath));
  if (!has('--dry')) {
    if (out === tlPath) fs.copyFileSync(tlPath, tlPath + '.bak');
    fs.writeFileSync(out, JSON.stringify(TL, null, 1));
  }
  console.log(JSON.stringify(note));
}
if (has('--clear')) { write({ removed, added: 0 }); process.exit(0); }

let caps = TL.captions;
if (typeof caps === 'string') caps = JSON.parse(fs.readFileSync(path.resolve(DIR, caps), 'utf8'));
if (!Array.isArray(caps) || !caps.length) { const f = path.join(DIR, 'work/captions.json'); caps = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []; }
caps = caps.filter(c => !c.hidden && c.words?.length);
if (!caps.length) { console.error('LỖI: chưa có phụ đề — cần lời thoại để chọn b-roll'); process.exit(2); }
const WORDS = caps.flatMap((c, ci) => c.words.filter(w => w.w).map(w => ({ w: w.w, s: +w.s, e: +w.e, hl: !!w.hl, ci, f: fold(w.w).replace(/[^a-z0-9%$]/g, '') })));
const DUR = TL.duration || caps.at(-1).t1;
const VERT = (TL.height || 720) > (TL.width || 1280);
const [DW, DH] = VERT ? [720, 1280] : [1280, 720];
const face = TL.face || (VERT ? { x: 360, y: 520 } : { x: 760, y: 300 });
const FR = { x: face.x, y: face.y, rx: Math.max(VERT ? 150 : 160, (face.w || 0) * .65), ry: Math.max(VERT ? 180 : 190, (face.h || 0) * .65) };
// person-behind needs real cutouts and the speaker drawn full-frame (not inside a slate card)
const CUT = !!((TL.clips || []).length ? TL.clips.some(c => c.cutouts) : TL.aroll?.cutouts) && !(TL.scenes || []).some(s => s.type === 'frame_grid' && !s._auto);
// keep clear of the slate badge / pack headers at the very top in vertical
const TOPMIN = VERT ? ((TL.scenes || []).some(s => s.type === 'frame_grid' && s.badge !== false) ? 200 : 100) : 60;
let cardFlip = 0;

// ---------- palette: pack default, brand accent wins ----------
function hueOf(hex) {
  const m = /^#?([\da-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return null;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < .12) return null;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
let PAL = PACK_PAL[TL.pack] || 'ember';
const bh = hueOf(TL.brand?.accent) ?? hueOf(TL.brand?.primary);
if (bh != null) PAL = Object.entries(PAL_HUE).sort((a, b) => Math.min(Math.abs(a[1] - bh), 360 - Math.abs(a[1] - bh)) - Math.min(Math.abs(b[1] - bh), 360 - Math.abs(b[1] - bh)))[0][0];

// ---------- blocked windows ----------
const BASE_RX = /(frame|grade|scrim|progress|dip|letterbox|backdrop|wave|cursor|facecam|grid_bg|waveform|^mood$|lowerthird|ticker|names)/;
const SMALL = new Set(['emoji_pop', 'sticker', 'stickers', 'pill', 'question_marks', 'flash_ring', 'light_leak', 'iris', 'ring', 'black']);
const OUTRO_RX = /(title_card|end_card|outro|endcard|follow_cta|_cta$|credits)/;
const blocks = [[0, 1.5, 'all']];
let outroAt = DUR - .6;
for (const s of TL.scenes) {
  if (s.hidden) continue;
  const t0 = +s.t0 || 0, t1 = +s.t1 || t0;
  if (OUTRO_RX.test(s.type) && t0 > DUR * .5) outroAt = Math.min(outroAt, t0);
  if (BASE_RX.test(s.type) || t1 - t0 > DUR * .6) continue;
  blocks.push([t0 - .2, t1 + .2, SMALL.has(s.type) ? 'small' : 'all']);
}
blocks.push([outroAt - .3, DUR + 1, 'all']);
const lastSpeech = WORDS.at(-1)?.e ?? DUR;
const END = Math.min(outroAt - .3, lastSpeech + .3, DUR - .6);
const blockedAt = (t0, t1, kind) => blocks.find(([a, b, k]) => t0 < b && t1 > a && (k === 'all' || kind === 'text' || kind === 'emoji'));

// ---------- geometry (never over the face) ----------
const hitsFace = ([x, y, w, h]) => {
  const cx = Math.max(x, Math.min(FR.x, x + w)), cy = Math.max(y, Math.min(FR.y, y + h));
  return ((cx - FR.x) / FR.rx) ** 2 + ((cy - FR.y) / FR.ry) ** 2 < 1;
};
function boxFor(lay) {
  const fit = (w, h) => [Math.round(w), Math.round(h)];
  if (VERT) {
    const top = FR.y - FR.ry - 30, botY = Math.max(FR.y + FR.ry + 30, 870);
    if (lay === 'card') {
      const cands = [];
      const hT = Math.min(360, top - TOPMIN); if (hT >= 180) { const [w, h] = fit(Math.min(640, hT * 16 / 9), hT); cands.push([(DW - w) / 2, Math.max(TOPMIN, top - h), w, h]); }
      const hB = Math.min(360, DH - 90 - botY); if (hB >= 180) { const [w, h] = fit(Math.min(640, hB * 16 / 9), hB); cands.push([(DW - w) / 2, botY, w, h]); }
      const ok = cands.filter(b => !hitsFace(b)).sort((a, b) => b[3] - a[3]);
      return ok.length > 1 && Math.abs(ok[0][3] - ok[1][3]) < 60 ? ok[cardFlip++ % 2] : ok[0];
    }
    if (lay === 'right' || lay === 'left') {
      const [w, h] = [330, 186], y = Math.max(TOPMIN, Math.min(top - h, 260));
      const b = [lay === 'right' ? DW - w - 28 : 28, y, w, h];
      if (!hitsFace(b)) return b;
      const b2 = [lay === 'right' ? DW - w - 28 : 28, botY, w, h];
      return hitsFace(b2) ? null : b2;
    }
    if (lay === 'pip') { const b = [FR.x > DW / 2 ? 28 : DW - 328, 70, 300, 169]; return hitsFace(b) ? null : b; }
    return null;
  }
  const B = { card: [190, 90, 900, 506], right: [660, 70, 580, 326], left: [40, 70, 580, 326], pip: [860, 60, 380, 214] }[lay];
  if (!B) return null;
  if (!hitsFace(B)) return B;
  if (lay === 'card') { const b = [FR.x > DW / 2 ? 40 : 660, 70, 580, 326]; return hitsFace(b) ? null : b; }
  if (lay === 'pip') { const b = [FR.x > DW / 2 ? 40 : 860, 60, 380, 214]; return hitsFace(b) ? null : b; }
  return null;
}
const LAYOUTS = ['card', 'right', 'full', 'pip', 'person', 'left'];
let layI = 0;
function nextLayout(allowFull = true) {
  for (let k = 0; k < LAYOUTS.length; k++) {
    const lay = LAYOUTS[(layI + k) % LAYOUTS.length];
    if (lay === 'full' && !allowFull) continue;
    if (lay === 'person' && !CUT) continue;
    if (lay === 'full' || lay === 'person' || boxFor(lay)) { layI += k + 1; return lay; }
  }
  layI++; return 'full';
}
const textY = () => {
  const top = FR.y - FR.ry - 70;
  return VERT ? (top >= 150 ? Math.round(Math.max(170, top - 30)) : Math.round(Math.min(DH - 260, FR.y + FR.ry + 120))) : Math.round(top >= 90 ? Math.max(100, top) : Math.min(DH - 150, FR.y + FR.ry + 70));
};
function emojiXY(size) {
  const right = FR.x + FR.rx + size * .55, left = FR.x - FR.rx - size * .55;
  const x = right + size / 2 < DW - 10 ? right : left - size / 2 > 10 ? left : FR.x + (FR.x > DW / 2 ? -1 : 1) * (FR.rx + size * .6);
  return [Math.round(Math.max(size / 2 + 10, Math.min(DW - size / 2 - 10, x))), Math.round(Math.max(size / 2 + 60, FR.y - FR.ry * .55))];
}

// ---------- language helpers ----------
const catalog = JSON.parse(fs.readFileSync(path.join(SKILL, 'assets/broll/catalog.json'), 'utf8'));
const tsv = {};
for (const l of fs.readFileSync(path.join(SKILL, 'assets/broll/keywords_vi_en.tsv'), 'utf8').split('\n')) if (l.includes('\t') && !l.startsWith('#')) { const [vi, en] = l.split('\t'); tsv[fold(vi)] = en.trim(); }
const wordsIn = (t0, t1) => WORDS.filter(w => w.s >= t0 - .05 && w.s < t1);
const emojiFor = ws => { const f = ' ' + ws.map(w => w.f).join(' ') + ' '; const hit = EMOJI.find(([k]) => f.includes(' ' + k + ' ')); return hit && { emoji: hit[1], key: hit[0] }; };
const emotional = ws => ws.some(w => w.hl) || (() => { const f = ' ' + ws.map(w => w.f).join(' ') + ' '; return [...EMOTION].some(k => f.includes(' ' + k + ' ')); })();
function numberIn(ws) {
  for (let i = 0; i < ws.length; i++) {
    const m = /^(\d+(?:[.,]\d+)?)(%|k)?$/.exec(ws[i].w.replace(/[^\d.,%k]/gi, '').replace(/[.,]+$/, ''));
    if (m && /\d/.test(ws[i].w)) {
      const unit = m[2] === '%' ? '%' : ws[i + 1] && !/\d/.test(ws[i + 1].w) && !STOP.has(ws[i + 1].f) ? ws[i + 1].w.toUpperCase() : '';
      return { num: parseFloat(m[1].replace(',', '.')), unit, at: ws[i].s, word: ws[i] };
    }
  }
  return null;
}
const KW_EDGE = /^(thu|nhat|tiep|theo|cuoi|cung|dau|tien|buoc|sao|tren|duoi|qua|roi)$/; // ordinals / connectives never start or end a keyword
function keyword(ws, max = 3) {
  // longest run of content words (≤ max syllables), preferring a run that hits the b-roll catalog tags
  let best = null;
  for (let i = 0; i < ws.length; i++) for (let n = Math.min(max, ws.length - i); n >= 1; n--) {
    const run = ws.slice(i, i + n);
    if (run.some(w => STOP.has(w.f) || !w.f || /\d/.test(w.w)) || run.slice(0, -1).some(w => /[.,!?…;:]$/.test(w.w)) || KW_EDGE.test(run[0].f) || KW_EDGE.test(run.at(-1).f) || run.some(w => w.f === "thu")) continue;
    const f = run.map(w => w.f).join(' '), score = n * 2 + (tsv[f] ? 3 : 0) + (run.some(w => w.hl) ? 4 : 0) + (catalog.some(e => e.pal === PAL && e.tags?.some(t => fold(t) === f)) ? 3 : 0);
    if (!best || score > best.score) best = { score, text: run.map(w => w.w.replace(/[.,!?…;:"“”]/g, '')).join(' ').toUpperCase(), f, at: run[0].s };
  }
  return best;
}
const ABSTRACT = new Set(['thanh cong', 'y tuong', 'muc tieu', 'ke hoach', 'chien luoc', 'dong luc', 'hanh trinh', 'tu duy', 'kien thuc', 'tuong lai', 'van de', 'giai phap', 'co hoi', 'rui ro', 'that bai', 'hanh phuc', 'kinh nghiem', 'phat trien', 'hieu qua', 'chat luong']);
const concrete = ws => { const f = ws.map(w => w.f); for (let i = 0; i < f.length; i++) for (let n = 3; n >= 1; n--) { const k = f.slice(i, i + n).join(' '); if (n <= f.length - i && tsv[k] && !STOP.has(k) && !ABSTRACT.has(k)) return { vi: k, en: tsv[k] }; } return null; };
function presets(text, pal, avoid, numeric) {
  const q = fold(text).split(/[^a-z0-9%]+/).filter(w => w.length > 1 && !STOP.has(w)), bi = q.slice(1).map((w, i) => q[i] + ' ' + w);
  const scored = [];
  for (const e of catalog) {
    if (e.pal !== pal || avoid.has(e.template)) continue;
    if (numeric && !(numeric === '%' ? ['pie', 'progress', 'counter_big', 'bar_chart'] : ['counter_big', 'bar_chart', 'line_chart']).includes(e.template)) continue;
    const hay = fold([...(e.tags || []), e.topic, e.text].join(' | '));
    let s = 0; for (const b of bi) if (hay.includes(b)) s += 3; for (const w of q) if (new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(hay)) s += 1;
    if (BG_TPL.has(e.template)) s -= .5;
    if (s > 0 || numeric) scored.push([s + rnd() * .3, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const out = []; for (const [, e] of scored) { if (out.some(o => o.template === e.template)) continue; out.push(e); if (out.length >= 6) break; }
  return out;
}

// ---------- media of my own ----------
const MEDIA = [];
const mdir = path.join(DIR, 'media');
if (SRC.has('media') && fs.existsSync(mdir)) {
  for (const f of fs.readdirSync(mdir).sort()) {
    if (/^(sticker_|ai_)|_cut\.png$|^\./.test(f)) continue;
    if (/\.(jpe?g|png|webp)$/i.test(f)) MEDIA.push({ path: `media/${f}`, kind: 'image', name: f });
    else if (/\.(mp4|mov|webm)$/i.test(f)) {
      const fr = path.join(mdir, f.replace(/\.\w+$/, '') + '_frames');
      if (fs.existsSync(fr)) MEDIA.push({ kind: 'video', name: f, seq: { seq: `media/${path.basename(fr)}/%05d.jpg`, fps: 30, count: fs.readdirSync(fr).filter(x => x.endsWith('.jpg')).length } });
    }
  }
  const used = new Set((TL.scenes || []).map(s => typeof s.media === 'string' ? s.media : s.media?.seq).filter(Boolean));
  for (let i = MEDIA.length - 1; i >= 0; i--) if (used.has(MEDIA[i].path) || used.has(MEDIA[i].seq?.seq)) MEDIA.splice(i, 1);
}

const TEXT_STY = TL.pack === 'slate' ? ['grad_teal', 'hl', 'grad_blue', 'yellow'] : ['yellow', 'fire', 'white', 'glow', 'ink'];

// ---------- goal (assets/broll/goals.json): which sources and templates suit this kind of video ----------
const GJ = JSON.parse(fs.readFileSync(path.join(SKILL, 'assets/broll/goals.json'), 'utf8'));
const capText = ' ' + fold(caps.map(c => c.words.map(w => w.w).join(' ')).join(' ')).replace(/[^a-z0-9%]+/g, ' ') + ' ';
function detectGoal() {
  if (GJ.auto_from_pack[TL.pack]) return { id: GJ.auto_from_pack[TL.pack], why: `gói ${TL.pack}` };
  // vote: how often each goal's topic tags are spoken
  const votes = {};
  for (const g of GJ.goals.filter(g => g.topics)) {
    let v = 0;
    for (const tp of g.topics) for (const e of catalog.filter(e => e.topic === tp && e.pal === 'ember').slice(0, 1)) for (const t of e.tags) { const k = fold(t).replace(/[^a-z0-9%]+/g, ' ').trim(); if (k.length > 2 && capText.includes(' ' + k + ' ')) v += k.includes(' ') ? 2 : 1; }
    votes[g.id] = v;
  }
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? { id: best[0], why: 'lời thoại' } : { id: 'kechuyen', why: 'mặc định' };
}
const gArg = opt('--goal', 'auto');
const goalPick = gArg === 'auto' || !GJ.goals.some(g => g.id === gArg && g.mix) ? detectGoal() : { id: gArg, why: 'chọn tay' };
const G = GJ.goals.find(g => g.id === goalPick.id);
const VARIETY = Math.max(0, Math.min(1, +opt('--variety', .6)));
if (!PACK_PAL[TL.pack] && bh == null && G.pal) PAL = G.pal;
const PAL2b = SECOND[PAL] || 'violet';
const goalTopics = new Set(G.topics || []), goalTpl = new Set(G.templates || []);

// ---------- what each sentence is doing ----------
const RW = Object.fromEntries(Object.entries(GJ.role_words).map(([k, v]) => [k, v.map(fold)]));
const hasAny = (f, list) => list.some(k => f.includes(' ' + k + ' '));
const LOGOS = JSON.parse(fs.readFileSync(path.join(SKILL, 'assets/broll/logos.json'), 'utf8')).logos;
const logoIn = ws => { const f = ' ' + ws.map(w => w.f).join(' ') + ' '; for (const l of LOGOS) for (const n of l.names) if (f.includes(' ' + fold(n).replace(/[^a-z0-9]+/g, ' ').trim() + ' ')) return l; return null; };
function roleOf(ws, wsSent, t0, num) {
  const norm = x => (' ' + x.map(w => w.f).join(' ') + ' ').replace(/ danh gia /g, ' danhgia ').replace(/ gia dinh /g, ' giadinh ');
  const f = norm(wsSent || ws), fw = norm(ws);
  if (num && num.num <= 5 && / (sao|diem|danhgia) /.test(f)) return 'proof';
  if (num) return /tỷ|triệu|nghìn|đ|k$/i.test(num.unit) || hasAny(fw, RW.money) ? 'money' : 'number';
  if (logoIn(ws)) return 'tool';
  if (t0 > DUR * .72 && hasAny(f, RW.cta)) return 'cta';
  if (t0 < 4.5 || hasAny(fw, RW.hook) || /\?$/.test((wsSent || ws).at(-1)?.w || '')) return 'hook';
  if (hasAny(f, RW.list)) return 'list';
  if (hasAny(f, RW.compare)) return 'compare';
  if (hasAny(f, RW.proof)) return 'proof';
  if (hasAny(fw, RW.money)) return 'money';
  if (concrete(wsSent || ws)) return 'place';
  if (hasAny(fw, RW.time)) return 'time';
  if (emotional(ws)) return 'emotion';
  if (hasAny(f, RW.cta)) return 'cta';
  return 'general';
}
// Short phrases said in the sentence (list items / compare sides). Captions carry no punctuation, but each caption line is
// about one clause: one phrase per line, starting at the first list marker ("thứ nhất", "đầu tiên", "bước 1"…) if any.
const LIST_START = /\b(thu nhat|dau tien|buoc (1|mot)|mot la|meo (1|so 1)|cach (1|thu nhat)|truoc het)\b/;
const ORD = /^(thu|nhat|hai|ba|tu|nam|sau|bay|dau|tien|tiep|theo|cuoi|cung|mot|la|buoc|meo|cach|so|truoc|het|\d+)$/;
function phrasesIn(ws, n = 5, max = 3) {
  const groups = [];
  for (const w of ws) { if (!groups.length || groups.at(-1).ci !== w.ci) groups.push({ ci: w.ci, ws: [] }); groups.at(-1).ws.push(w); }
  const k = groups.findIndex(g => LIST_START.test(g.ws.map(w => w.f).join(' ')));
  const out = [];
  for (const g of k > 0 ? groups.slice(k) : groups) {
    let run = g.ws.filter(w => !STOP.has(w.f) && !/\d/.test(w.w));
    while (run.length > 1 && ORD.test(run[0].f)) run = run.slice(1);
    if (run.length && !(run.length === 1 && ORD.test(run[0].f))) out.push(run.slice(0, max).map(w => w.w.replace(/[.,!?…]/g, '')).join(' '));
  }
  return [...new Set(out.filter(x => x.length >= 2).map(x => x[0].toUpperCase() + x.slice(1)))].slice(0, n);
}

// ---------- HyperFrames blocks as b-roll: vars written from the speech ----------
let HF = {}; try { const w = {}; new Function('window', fs.readFileSync(path.join(SKILL, 'engine/hf/catalog.js'), 'utf8'))(w); HF = w.HF_CATALOG || {}; } catch {}
const cap1 = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const sentShort = (s, n = 60) => { const t = String(s || '').trim(); return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…'; };
const HF_SPEC = {
  'count-up': { roles: ['number', 'money'], need: x => x.num && x.num.num < 1e7, vars: x => ({ start: 0, end: x.num.num, prefix: '\u200b', suffix: x.num.unit === '%' ? '%' : x.num.unit ? ' ' + x.num.unit.toLowerCase() : '' }) },
  'number-pop-in': { roles: ['number', 'money'], need: x => x.num, vars: x => ({ value: String(x.num.num).replace('.', ','), unit: x.num.unit === '%' ? '%' : (x.num.unit || '').toLowerCase().slice(0, 8) }) },
  'conic-progress-ring': { roles: ['number'], need: x => x.num && x.num.unit === '%' && x.num.num <= 100, vars: x => ({ progress: x.num.num, label: `${x.num.num}%` }) },
  'decline-chart': { roles: ['number', 'compare'], need: x => x.nums?.length >= 2 && x.nums[0] > x.nums[1], vars: x => ({ label: x.kw || 'Giảm', start_value: x.nums[0], end_value: x.nums[1] }) },
  'star-rating-fill': { roles: ['proof'], need: () => true, vars: x => ({ rating: x.num && x.num.num <= 5 ? x.num.num : 4.9 }) },
  'testimonial-card': { roles: ['proof'], need: x => x.sent.length > 20, vars: x => ({ quote: sentShort(cap1(x.sent), 70), author: 'Khách hàng', handle: '', rating: 5 }) },
  'native-notification-pop': { roles: ['money', 'proof', 'number', 'cta'], need: () => G.id === 'banhang', vars: x => ({ title: x.kw ? cap1(x.kw.toLowerCase()) : 'Có đơn hàng mới', body: sentShort(cap1(x.sent), 46), app_label: TL.brand?.name || 'Cửa hàng' }) },
  'notification-stack': { roles: ['proof', 'list'], need: x => x.items.length >= 2, vars: x => ({ titles: x.items.slice(0, 3).join(','), bodies: x.items.slice(0, 3).map(() => TL.brand?.name || 'Vừa xong').join(',') }) },
  'grid-card-assemble': { roles: ['list'], need: x => x.items.length >= 3, vars: x => ({ items: x.items.slice(0, 4).join(',') }) },
  'radial-surround': { roles: ['list', 'tool'], need: x => x.items.length >= 3, vars: x => ({ center_label: x.kw ? cap1(x.kw.toLowerCase()) : 'Bạn', chips: x.items.slice(0, 6).join(',') }) },
  'cta-close': { roles: ['cta'], need: () => true, vars: x => ({ action_line: sentShort(cap1(x.sent), 32), button_label: x.kw ? cap1(x.kw.toLowerCase()).slice(0, 18) : 'Xem ngay' }) },
  'success-check': { roles: ['emotion', 'proof'], need: () => true, vars: () => ({}) },
  confetti: { roles: ['emotion'], need: () => true, vars: () => ({}), texts: { 0: '', 1: '' } },
  'badge-pop': { roles: ['emotion', 'number'], need: x => x.num && x.num.num < 100, vars: x => ({ count: String(x.num.num) }) },
  'press-ripple': { roles: ['tool', 'cta'], need: x => !!x.kw, vars: x => ({ label: cap1(x.kw.toLowerCase()).slice(0, 18), done_label: 'Xong!' }) },
  'split-flap-board': { roles: ['hook', 'time'], need: x => !!x.kw && x.kw.length <= 14, vars: x => ({ boardText: fold(x.kw).toUpperCase().replace(/[^A-Z0-9 .,']/g, ''), cellCount: Math.max(8, x.kw.length + 2) }) },
  'spring-pop': { roles: ['hook', 'emotion'], need: x => !!x.kw && x.kw.length <= 14, vars: x => ({ text: x.kw }) },
  'ticker-takeover': { roles: ['hook'], need: x => x.items.length >= 3, vars: x => ({ options: x.items.slice(0, 4).join(','), final_word: x.items[0] }), texts: { 0: '' } },
};

// ---------- personal library + AI image availability ----------
let LIB = null;
if (SRC.has('lib')) { try { LIB = await import('./broll_lib.mjs'); if (!LIB.load().length) LIB = null; } catch { LIB = null; } }
let KEYS = {}; try { KEYS = (await import('./ai_broll.mjs')).readKeys(); } catch {}
const AIKEY = !!(KEYS.openai || KEYS.gemini);
const STOCK_SRC = ['pexels', 'pixabay'].filter(k => KEYS[k]).concat(['openverse', 'commons']).join(',');
// Stock video only from Pexels / Pixabay (free keys): Commons video search returns scans and documents far too often.
const VIDKEY = !!(KEYS.pexels || KEYS.pixabay);
// Free photo libraries index by title/tags: keep a hit only if its title shares a word with the query.
const relevant = (it, q) => !['commons', 'openverse'].includes(it.provider) || String(q).toLowerCase().split(/\s+/).filter(w => w.length > 2).some(w => String(it.title || '').toLowerCase().includes(w));

// ---------- plan slots (timing) ----------
say(.05, `Đọc lời thoại · mục tiêu: ${G.name}`);
const sents = sentences(caps);
const slots = [];
let t = 1.5 + Math.min(.6, density * .1);
const usedNum = new Set();
while (t < END - .8) {
  const snap = WORDS.filter(w => w.s >= t - .5 && w.s <= t + .8).sort((a, b) => Math.abs(a.s - t) - Math.abs(b.s - t))[0];
  const t0 = snap ? snap.s : t;
  const sent = sents.find(s => t0 >= s.t0 - .05 && t0 < s.t1) || sents.find(s => s.t0 > t0) || sents.at(-1);
  const ws = wordsIn(t0, Math.min(END, t0 + Math.max(2.2, density * .8)));
  const wsSent = sent ? wordsIn(sent.t0, sent.t1 + .05) : ws;
  let num = numberIn(ws); if (num && usedNum.has(num.at)) num = null;
  const dur0 = Math.min(3.4, Math.max(1.6, density * .7));
  const t1 = Math.min(END, t0 + dur0);
  const b = blockedAt(t0, t1, 'card');
  if (b) { t = Math.max(t + .5, b[1] + .1); continue; }
  if (t1 - t0 < .9) break;
  if (num) usedNum.add(num.at);
  const nums = (wsSent || ws).map(w => parseFloat(w.w.replace(/[^\d.,]/g, '').replace(',', '.'))).filter(v => !isNaN(v));
  const role = roleOf(ws, wsSent, t0, num), kw = (keyword(ws) || keyword(wsSent || []))?.text;
  slots.push({ i: slots.length, t0: r2(t0), t1: r2(t1), ws, wsSent, sent, num, nums, role, kw, emo: emojiFor(ws), conc: concrete(wsSent), logo: logoIn(ws),
    items: phrasesIn(wsSent || ws), text: (sent?.text || ws.map(w => w.w).join(' ')) });
  t = t0 + density * (.85 + rnd() * .3);
  if (t < t1 + .15) t = t1 + .15;
}
say(.15, `${slots.length} chỗ chèn (mỗi ~${density} s) · ${Object.entries(slots.reduce((m, s) => ((m[s.role] = (m[s.role] || 0) + 1), m), {})).map(([k, v]) => `${GJ.roles[k] || k} ${v}`).join(', ')}`);

// ---------- candidates per slot, scored by goal × role × variety ----------
const ROLE_TPL = {
  number: NUM_TPL.concat(['gauge', 'kpi']), money: ['price_tag', 'counter_big', 'money_rain', 'shopping_cart', 'bar_chart'], list: ['checklist', 'timeline_steps', 'progress'],
  compare: ['versus', 'bar_chart'], proof: ['star_rating', 'trophy', 'quote_card', 'likes'], time: ['clock', 'calendar', 'countdown', 'timeline_steps'],
  hook: ['glitch_text', 'typewriter', 'sunburst', 'spotlight', 'search'], emotion: ['emoji_burst', 'sunburst', 'rings', 'trophy', 'icon_hero'], cta: ['likes', 'icon_hero', 'rocket'],
};
function presetFor(s, pal, avoid) {
  const numeric = s.num && ['number', 'money'].includes(s.role) ? (s.num.unit === '%' ? '%' : 'n') : null;
  let c = presets(s.text, pal, avoid, numeric);
  if (s.num && s.role === 'money' && !numeric) c = c.filter(e => ROLE_TPL.money.includes(e.template));
  const roleT = ROLE_TPL[s.role];
  // goal topics/templates and the role's natural templates float up
  const sc = e => (goalTopics.has(e.topic) ? 2 : 0) + (goalTpl.has(e.template) ? 1.5 : 0) + (roleT?.includes(e.template) ? 1.5 : 0);
  c = c.map((e, i) => [sc(e) - i * .4, e]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  if (!c.length && roleT) { const tp = roleT.find(x => !avoid.has(x)); const e = catalog.find(e => e.template === tp && e.pal === pal); if (e) c = [e]; }
  const own = [];
  if (s.role === 'list' && s.items.length >= 2) own.push({ template: s.items.length >= 3 ? 'checklist' : 'timeline_steps', items: s.items.slice(0, 5) });
  if (s.role === 'compare' && s.items.length === 2) own.push({ template: 'versus', items: s.items.map(x => x.toUpperCase().slice(0, 12)) });
  if (s.role === 'proof' && s.num && s.num.num <= 5) own.push({ template: 'star_rating', num: s.num.num });
  if (s.role === 'money' && s.num && (s.num.num >= 1000 || /nghin|trieu|k/.test(fold(s.num.unit)))) own.push({ template: 'price_tag', num: s.num.num * (/nghin|k/.test(fold(s.num.unit)) ? 1000 : /trieu/.test(fold(s.num.unit)) ? 1e6 : 1), unit: 'đ' });
  if (s.role === 'number' && s.num?.unit === '%' && s.num.num <= 100) own.push({ template: 'gauge', num: s.num.num, unit: '%' });
  const mine = own.filter(o => !avoid.has(o.template)).map(o => ({ ...o, pal, topic: 'speech', seed: s.i + 3, own: true }));
  return [...mine, ...c];
}
const lastKinds = [], recentTpl = [], usedLib = new Set(), usedHF = [];
const quota = { stock: 3, stockvid: 4, aiimg: 2, aroll: Math.max(1, Math.round(DUR / 9)), logo: 4, lib: 99, media: 99 };
const used = { stock: 0, stockvid: 0, aiimg: 0, aroll: 0, logo: 0 };
let lastAroll = -99, lastEmojiI = -9, lastTextI = -9, fullN = 0, mediaI = 0;
function candidates(s) {
  const C = [], mix = G.mix || {}, pref = G.roles?.[s.role] || G.roles?.general || [];
  const base = k => (mix[k] ?? 1) + (pref.indexOf(k) >= 0 ? 3 - pref.indexOf(k) : 0)
    - (lastKinds.at(-1) === k ? 3 * VARIETY : 0) - (lastKinds.at(-2) === k ? 1.5 * VARIETY : 0) - lastKinds.slice(-5).filter(x => x === k).length * .4 * VARIETY + rnd() * VARIETY;
  const add = (kind, extra, data) => { if (!SRC.has(kind) || (mix[kind] ?? 1) <= 0) return; C.push({ kind, score: base(kind) + extra, ...data }); };
  if (s.logo && used.logo < quota.logo) add('logo', s.role === 'tool' ? 3 : 1.5, { logo: s.logo });
  { const avoid = new Set(recentTpl.slice(-Math.round(2 + VARIETY * 3))); const pal = s.i % 4 === 3 ? PAL2b : PAL; const c = presetFor(s, pal, avoid);
    if (c.length) add('preset', s.num ? 1 : 0, { preset: c[0], cands: c, pal }); }
  for (const blk of G.hf || []) {
    const sp = HF_SPEC[blk]; if (!sp || !HF[blk] || !sp.roles.includes(s.role)) continue;
    const x = { num: s.num, nums: s.nums, kw: s.kw, items: s.items, sent: s.text };
    if (!sp.need(x) || usedHF.slice(-3).includes(blk)) continue;
    add('hf', .5, { block: blk, vars: sp.vars(x), texts: sp.texts });
  }
  if (s.kw && s.i - lastTextI >= 2) add('text', s.role === 'hook' || s.role === 'cta' ? 1 : 0, { text: s.kw });
  if (s.emo && s.i - lastEmojiI >= (density <= 2 ? 3 : 2)) add('emoji', emotional(s.ws) ? 1 : -1, { emoji: s.emo.emoji });
  if (used.aroll < quota.aroll && s.t0 - lastAroll > 6) add('aroll', ['emotion', 'hook', 'compare'].includes(s.role) ? 1 : -1, {});
  if (MEDIA.length) add('media', 0, {});
  if (LIB) { const hit = LIB.search(s.text, { n: 1, exclude: usedLib })[0]; if (hit) add('lib', Math.min(3, hit.score), { lib: hit }); }
  if (s.conc) {
    if (VIDKEY && used.stockvid < quota.stockvid) add('stockvid', 0, { q: s.conc });
    if (used.stock < quota.stock) add('stock', -.5, { q: s.conc });
  }
  if (AIKEY && used.aiimg < quota.aiimg && ['place', 'general', 'emotion', 'hook'].includes(s.role)) add('aiimg', -1, { q: s.conc || { en: (s.kw || '').toLowerCase() } });
  return C.sort((a, b) => b.score - a.score);
}
const CHEAP = new Set(['preset', 'hf', 'text', 'emoji', 'logo']);
for (const s of slots) {
  const C = candidates(s);
  if (!C.length) { s.skip = true; continue; }
  s.C = C; s.pick = C[0];
  s.alts = []; for (const c of C.slice(1)) if (CHEAP.has(c.kind) && !s.alts.some(a => a.kind === c.kind) && s.alts.length < 3) s.alts.push(c);
  lastKinds.push(s.pick.kind);
  if (s.pick.kind === 'preset') recentTpl.push(s.pick.preset.template);
  if (s.pick.kind === 'hf') usedHF.push(s.pick.block);
  if (s.pick.kind === 'aroll') { used.aroll++; lastAroll = s.t0; }
  if (s.pick.kind === 'emoji') lastEmojiI = s.i;
  if (s.pick.kind === 'text') lastTextI = s.i;
  if (s.pick.kind === 'lib') usedLib.add(s.pick.lib.id);
  if (s.pick.kind in used && s.pick.kind !== 'aroll') used[s.pick.kind]++;
}

// ---------- Claude (optional): choose among each slot's candidates + write the words ----------
let claudeNote = '';
const live = slots.filter(s => !s.skip);
if (has('--claude') && live.length) {
  say(.25, `Hỏi Claude chọn b-roll cho ${live.length} chỗ (20–90 giây)`);
  const desc = c => c.kind === 'preset' ? `preset ${c.preset.template} (${c.preset.topic})` : c.kind === 'hf' ? `khối ${c.block} — ${HF[c.block]?.label || ''} vars ${JSON.stringify(c.vars)}` : c.kind === 'logo' ? `logo ${c.logo.title}` : c.kind === 'aroll' ? 'hiệu ứng trên chính người nói (không chèn hình)' : c.kind === 'stockvid' || c.kind === 'stock' || c.kind === 'aiimg' ? `${GJ.sources[c.kind]} (cần "query")` : GJ.sources[c.kind];
  const req = live.map(s => ({ i: s.i, role: GJ.roles[s.role], sentence: s.text, options: s.C.slice(0, 6).map((c, j) => ({ o: j, kind: c.kind, what: desc(c) })) }));
  const prompt = `Bạn là editor video ngắn tiếng Việt. Mục tiêu video: ${G.name} — ${G.desc}. Mỗi chỗ chèn b-roll dưới đây có câu đang nói, vai trò của câu và vài phương án (options). Với MỖI chỗ:
- chọn "o" = phương án minh hoạ đúng ý câu nhất; ưu tiên đa dạng: không để 2 chỗ liền nhau cùng kind, xen kẽ hình thật / graphic / hiệu ứng trên người nói;
- "text" = chữ ngắn IN HOA tiếng Việt có dấu ≤ 18 ký tự tóm ý câu (dùng cho preset/text/logo);
- nếu chọn khối (kind hf): "vars" = sửa lại giá trị vars cho đúng nội dung câu, tiếng Việt, giữ độ dài tương tự;
- nếu chọn stockvid/stock/aiimg: "query" = 2–4 từ khoá TIẾNG ANH mô tả cảnh thật cần tìm;
- nếu chọn emoji: "emoji" = 1 emoji.
Trả về DUY NHẤT mảng JSON: [{"i":0,"o":1,"text":"…","vars":{},"query":"…","emoji":"…"}]

${JSON.stringify(req)}`;
  try {
    const out = await new Promise((ok, bad) => {
      const p = spawnClaude(['-p', '--output-format', 'json', '--model', opt('--model', 'sonnet')], { stdio: ['pipe', 'pipe', 'pipe'] });
      p.stdin.on('error', () => {}); p.stdin.end(prompt); // stdin: long prompts exceed Windows' command-line limit
      let o = '', e = ''; const t0c = Date.now(), tick = setInterval(() => say(Math.min(.5, .25 + (Date.now() - t0c) / 400000), `Claude đang chọn b-roll… ${Math.round((Date.now() - t0c) / 1000)}s`), 2000);
      const tm = setTimeout(() => { p.kill(); bad(new Error('Claude quá 180 giây')); }, 180000);
      p.stdout.on('data', d => (o += d)); p.stderr.on('data', d => (e += d));
      p.on('error', () => { clearInterval(tick); clearTimeout(tm); bad(new Error('Không tìm thấy Claude Code CLI (lệnh "claude")')); });
      p.on('close', c => { clearInterval(tick); clearTimeout(tm); c ? bad(new Error(`claude -p lỗi (mã ${c}): ${(e || o).slice(-200)}`)) : ok(o); });
    });
    let txt = out; try { txt = JSON.parse(out).result ?? out; } catch {}
    const m = String(txt).match(/\[[\s\S]*\]/); if (!m) throw new Error('Claude không trả về JSON');
    let n = 0;
    for (const x of JSON.parse(m[0])) {
      const s = slots[x.i]; if (!s || s.skip) continue;
      const c = s.C[+x.o];
      if (c && (c.kind !== 'aroll' || used.aroll <= quota.aroll)) { if (c !== s.pick) { s.alts = [s.pick, ...s.alts.filter(a => a !== c && a.kind !== s.pick.kind)].filter(a => CHEAP.has(a.kind)).slice(0, 3); s.pick = c; } n++; }
      if (typeof x.text === 'string' && x.text.trim()) { s.kw = x.text.trim().slice(0, 22).toUpperCase(); s.kwAI = true; }
      if (s.pick.kind === 'hf' && x.vars && typeof x.vars === 'object') for (const [k, v] of Object.entries(x.vars)) if (k in s.pick.vars && typeof v === typeof s.pick.vars[k]) s.pick.vars[k] = v === '' ? '\u200b' : v; // '' would bring back the block's demo value
      if (typeof x.query === 'string' && /^[\x00-\x7F]+$/.test(x.query)) s.pick.q = { ...(s.pick.q || {}), en: x.query.slice(0, 60), vi: s.pick.q?.vi || x.query };
      if (s.pick.kind === 'emoji' && x.emoji && [...x.emoji].length <= 3) s.pick.emoji = x.emoji;
    }
    // keep the variety rules even when Claude ignored them: the same kind / template / block never twice in a row
    for (let i = 1; i < live.length; i++) {
      const a = live[i - 1].pick, s = live[i], b = s.pick;
      const same = a.kind === b.kind && (b.kind !== 'preset' || a.preset?.template === b.preset?.template) && (b.kind !== 'hf' || a.block === b.block) && !['stock', 'stockvid', 'media', 'lib'].includes(b.kind);
      if (!same) continue;
      const alt = s.C.find(c => c.kind !== a.kind && (c.kind !== 'aroll' || used.aroll < quota.aroll));
      if (alt) { s.alts = [b, ...s.alts.filter(x => x !== alt && x.kind !== b.kind)].filter(x => CHEAP.has(x.kind)).slice(0, 3); s.pick = alt; if (alt.kind === 'aroll') used.aroll++; }
    }
    claudeNote = `Claude chọn ${n}/${live.length} chỗ`;
  } catch (e) { claudeNote = `Claude lỗi → dùng luật offline (${e.message})`; console.log(claudeNote); }
}

// ---------- fetch real footage (stock video / photo, AI image) ----------
const vidDur = s => Math.min(4, Math.max(2, s.t1 - s.t0 + .5));
const fallback = s => { const a = s.alts.shift() || (SRC.has('text') && s.kw ? { kind: 'text', text: s.kw } : null); if (a) s.pick = a; else s.skip = true; };
const fetchable = live.filter(s => ['stockvid', 'stock', 'aiimg'].includes(s.pick.kind));
let fi = 0;
for (const s of fetchable) {
  const p = s.pick, q = p.q || {}, en = q.en || '';
  say(.55 + .2 * (fi++ / Math.max(1, fetchable.length)), `${p.kind === 'aiimg' ? 'Tạo ảnh AI' : p.kind === 'stockvid' ? 'Tìm video stock' : 'Tìm ảnh stock'}: ${en || q.vi}`);
  try {
    if (p.kind === 'aiimg') {
      const { genImage } = await import('./ai_broll.mjs');
      const out = path.join(DIR, 'media', `ai_${String(s.i).padStart(2, '0')}_${Date.now() % 1e5}.png`);
      await genImage(`${en || q.vi}, cinematic photo, natural light, no text, no logo`, out, { vertical: VERT });
      p.media = { path: path.relative(DIR, out).split(path.sep).join('/'), credit: 'Ảnh AI' };
      continue;
    }
    const ws = String(en).split(/\s+/).filter(Boolean), tries = [...new Set([en, ws.slice(0, 2).join(' '), ws[0]].filter(Boolean))];
    let it = null, kind = p.kind === 'stockvid' ? 'video' : 'photo';
    for (const qq of tries) {
      const r = await stockSearch(q.vi || qq, { kind, src: kind === 'video' ? ['pexels', 'pixabay'].filter(k => KEYS[k]).join(',') : STOCK_SRC, n: 8, en: qq });
      it = r.items.find(x => relevant(x, qq) && (kind === 'video' ? (x.dur || 3) >= 2 : (x.w || 1000) >= 640));
      if (it) break;
    }
    if (!it && kind === 'video') { // no clip for this → a photo of it, with motion
      kind = 'photo';
      const r = await stockSearch(q.vi || en, { kind, src: STOCK_SRC, n: 8, en }); it = r.items.find(x => relevant(x, en) && (x.w || 1000) >= 640);
    }
    if (!it) throw new Error('không có kết quả');
    const m = await fetchMedia(it.url, DIR, { kind, dur: vidDur(s), name: (en || 'broll').split(' ')[0], vertical: VERT, meta: { author: it.author, license: it.license, provider: it.provider, page: it.page, title: it.title } });
    p.media = { path: m.path, seq: m.seq, credit: `${it.author || ''} · ${it.license || ''} · ${it.provider}` };
    if (kind === 'photo' && p.kind === 'stockvid') p.kind = 'stock';
  } catch (e) { console.log(`${p.kind} "${en || q.vi}" bỏ qua: ${e.message}`); fallback(s); }
}

// ---------- build scenes ----------
say(.78, 'Đặt b-roll lên timeline');
const added = [], fxAdded = [];
let styI = 0;
const fitSize = (txt, size, w = DW - 80) => Math.max(34, Math.min(size, Math.floor(w / (Math.max(1, [...String(txt)].length) * .62))));
const wantFull = () => fullN / Math.max(1, added.length + 1) < (G.full ?? .3);
// one scene for candidate c at slot s with layout lay (shared by the pick and its alternatives so a swap keeps the place)
function sceneFor(s, c, lay) {
  const base = { t0: s.t0, t1: s.t1, _auto: true, note: 'tự động' };
  const box = lay === 'full' || lay === 'person' ? null : boxFor(lay);
  const full = lay === 'full' || !box;
  if (c.kind === 'text') {
    const txt = c.text || s.kw; if (!txt) return null;
    return { ...base, t1: r2(Math.min(s.t1, s.t0 + Math.min(1.8, Math.max(1.1, density * .45)))), type: 'text', hideCaptions: false,
      lines: [{ text: txt, t: s.t0, style: TEXT_STY[styI++ % TEXT_STY.length], size: fitSize(txt, VERT ? 84 : 92), x: DW / 2, y: textY(), anim: ['pop', 'blur_zoom', 'slide_l', 'drop', 'tumble'][styI % 5] }] };
  }
  if (c.kind === 'emoji') { const size = VERT ? 150 : 130, [x, y] = emojiXY(size); return { ...base, t1: r2(Math.min(s.t1, s.t0 + Math.min(1.4, density * .6))), type: 'emoji_pop', src: c.emoji, x, y, size }; }
  if (['media', 'lib', 'stock', 'stockvid', 'aiimg'].includes(c.kind)) {
    const m = c.media; if (!m) return null;
    const media = m.seq ? { ...m.seq, t0: s.t0 } : m.path, credit = m.credit ? { credit: m.credit } : {};
    if (full) return { ...base, t1: r2(Math.min(s.t1, s.t0 + (m.seq ? 2.2 : 1.6))), type: 'photo', mode: 'full', media, kb: m.seq ? .04 : .12, kb_dir: s.i % 2 ? -1 : 1, ...credit };
    return { ...base, type: 'photo', mode: 'card', media, kb: .08, card: { x: box[0], y: box[1], w: box[2], h: box[3], r: 20 }, ...credit };
  }
  if (c.kind === 'hf') {
    const b = HF[c.block]; if (!b) return null;
    const t1 = r2(Math.min(s.t1 + .6, s.t0 + Math.max(1.8, Math.min(b.dur, 3.6))));
    const sc = { ...base, t1, type: 'hf', block: c.block, vars: c.vars, ...(c.texts ? { texts: c.texts } : {}), fade: .2 };
    if (!full) { const nat = b.layer === 'full' ? Math.min(DW / b.w, DH / b.h) : 1; Object.assign(sc, { x: Math.round(box[0] + box[2] / 2), y: Math.round(box[1] + box[3] / 2), size: b.layer === 'full' ? Math.round(box[2] / (b.w * nat) * 100) : 70 }); }
    else if (VERT && b.layer === 'full') { const bb = boxFor('card'); if (bb) Object.assign(sc, { x: Math.round(DW / 2), y: Math.round(bb[1] + bb[3] / 2), size: 100 }); }
    return sc;
  }
  // preset / logo -> procedural b-roll
  let params;
  if (c.kind === 'logo') params = { template: 'logo_hero', pal: PAL, icon: 'si:' + c.logo.slug, hex: c.logo.hex, text: c.logo.title.toUpperCase().slice(0, 18), sub: s.kw && fold(s.kw) !== fold(c.logo.title) ? s.kw.toLowerCase() : '', seed: s.i + 1 };
  else {
    const e = c.preset; if (!e) return null;
    params = Object.fromEntries(Object.entries(e).filter(([k]) => !['id', 'topic', 'tags', 'score', 'own'].includes(k)));
    if (s.kw) params.text = String(s.kw).slice(0, 22);
    if (s.num && ['number', 'money', 'proof'].includes(s.role)) {
      if (!e.own) { params.num = s.num.num; if (s.num.unit) params.unit = s.num.unit === '%' ? '%' : ' ' + s.num.unit.toLowerCase(); }
      if (!s.kwAI) { // label = words said right after the number, in the same sentence ("45 nghìn MỘT TÔ")
        const i0 = WORDS.indexOf(s.num.word), after = [], before = [];
        if (!/[.!?…]$/.test(s.num.word?.w || '')) for (let i = i0 + 1; i < WORDS.length && WORDS[i].s - s.num.at < 1.6; i++) { after.push(WORDS[i]); if (/[.,!?…;]$/.test(WORDS[i].w)) break; }
        for (let i = i0 - 1; i >= 0 && s.num.at - WORDS[i].s < 1.8 && !/[.!?…]$/.test(WORDS[i].w); i--) before.unshift(WORDS[i]);
        params.text = (keyword(after.filter(w => !/\d/.test(w.w)), 3)?.text || keyword(before, 3)?.text || params.text || '').slice(0, 22);
      }
    }
    if (['checklist', 'timeline_steps', 'progress'].includes(params.template) && s.items.length >= 2 && !e.own) params.items = s.items;
    if (params.template === 'versus' && s.items.length === 2) params.items = s.items.map(x => x.toUpperCase().slice(0, 12));
    params.pal = c.pal || PAL;
    const em = emojiFor(s.wsSent || s.ws); if (em) params.icon = em.emoji;
  }
  if (lay === 'person') {
    delete params.text; delete params.sub;
    return { ...base, t1: r2(Math.min(s.t1, s.t0 + 2.5)), type: 'broll', ...params, template: BG_TPL.has(params.template) ? params.template : ['particles', 'grid_tunnel', 'hex_grid', 'starfield'][s.i % 4], layout: 'full', person: true, ...(VERT ? { fit: 'portrait' } : {}) };
  }
  const t1 = full ? r2(Math.min(s.t1, s.t0 + 1.6)) : s.t1;
  if (full) return { ...base, t1, type: 'broll', ...params, layout: 'full', ...(VERT ? { fit: 'portrait' } : {}) };
  if (VERT) return { ...base, t1, type: 'media_card', card: { x: box[0], y: box[1], w: box[2], h: box[3], r: 18 }, screen: { broll: { ...(c.preset?.id ? { id: c.preset.id } : {}), ...params } } };
  return { ...base, t1, type: 'broll', ...params, layout: 'card', x: box[0], y: box[1], w: box[2], h: box[3] };
}
const fxPick = s => {
  const f = ' ' + s.ws.map(w => w.f).join(' ') + ' ', sad = /\s(buon|that bai|kho khan|met|chan|tiec|mat)\s/.test(f);
  const hl = s.ws.find(w => w.hl) || s.ws.find(w => !STOP.has(w.f) && w.f.length > 3) || s.ws[0];
  if (sad || (s.role === 'compare' && /\s(truoc day|ngay xua)\s/.test(f))) return { t: s.t0, type: 'mono', dur: r2(Math.min(2.2, s.t1 - s.t0)) };
  if (s.role === 'emotion' || s.role === 'hook') return { t: r2(hl?.s ?? s.t0), type: 'punch', amp: .1 };
  return { t: s.t0, type: 'push', dur: r2(Math.max(1.8, Math.min(3, s.t1 - s.t0 + .6))), amp: .09 };
};
for (const s of slots) {
  if (s.skip) continue;
  const c = s.pick;
  if (c.kind === 'aroll') { fxAdded.push({ ...fxPick(s), _auto: true }); continue; }
  if (c.kind === 'media') { const m = MEDIA[mediaI++ % MEDIA.length]; c.media = m.seq ? { seq: m.seq } : { path: m.path }; }
  if (c.kind === 'lib') c.media = (() => { const r = LIB.useIn(c.lib, DIR); return typeof r === 'string' ? { path: r, credit: 'Thư viện của tôi' } : { seq: r, credit: 'Thư viện của tôi' }; })();
  const isSmall = c.kind === 'text' || c.kind === 'emoji';
  let lay = isSmall ? 'card' : nextLayout(wantFull());
  if (lay === 'person' && (!CUT || c.kind !== 'preset')) lay = 'card';
  // HyperFrames blocks and logos are designed for a big frame: never squeeze them into the small side / pip boxes
  if ((c.kind === 'hf' || c.kind === 'logo') && ['right', 'left', 'pip'].includes(lay)) lay = boxFor('card') ? 'card' : 'full';
  const sc = sceneFor(s, c, lay);
  if (!sc) continue;
  if (!isSmall && (sc.layout === 'full' || sc.mode === 'full' || (sc.type === 'hf' && sc.x == null))) fullN++;
  const altLay = a => (a.kind === 'text' || a.kind === 'emoji' ? 'card' : (a.kind === 'hf' || a.kind === 'logo') && ['right', 'left', 'pip'].includes(lay) ? (boxFor('card') ? 'card' : 'full') : lay);
  const alts = s.alts.map(a => { const x = sceneFor(s, a, altLay(a)); return x && { label: `${GJ.sources[a.kind]}${a.kind === 'preset' ? ' · ' + a.preset.template : a.kind === 'hf' ? ' · ' + (HF[a.block]?.label || a.block) : ''}`, scene: (() => { const { _auto, note, ...r } = x; return r; })() }; }).filter(Boolean);
  if (alts.length) sc._alts = alts;
  sc._src = c.kind; sc._role = s.role;
  added.push(sc);
}
TL.scenes.push(...added);
if (fxAdded.length) TL.fx = [...(TL.fx || []), ...fxAdded];
say(.95, 'Lưu');
const kinds = {}; for (const s of added) kinds[s.type] = (kinds[s.type] || 0) + 1;
const sources = {}; for (const s of added) sources[s._src] = (sources[s._src] || 0) + 1; if (fxAdded.length) sources.aroll = fxAdded.length;
write({ removed, added: added.length + fxAdded.length, kinds, sources, goal: { id: G.id, name: G.name, why: goalPick.why }, variety: VARIETY, density, palette: [PAL, PAL2b],
  roles: slots.reduce((m, s) => ((m[s.role] = (m[s.role] || 0) + 1), m), {}), alts: added.filter(s => s._alts).length, claude: claudeNote || undefined,
  layouts: added.map(s => s.layout || (s.card ? (s.card.w >= DW * .95 ? 'full' : 'card') : s.mode || s.type)), templates: added.map(s => s.template || s.screen?.broll?.template || s.block).filter(Boolean) });
