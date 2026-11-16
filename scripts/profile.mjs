// Hồ sơ kênh (channel profiles) for Tự lái: ~/.ai-video-studio/profiles.json (AVS_HOME overrides), plus "Học từ chỉnh sửa".
// Spec: references/autopilot.md. CLI:
//   node scripts/profile.mjs list | show <id> | default <id> | learn <project_dir> | reset-learned <id>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const AVS_HOME = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
const FILE = path.join(AVS_HOME, 'profiles.json');

export const DEFAULT_PROFILE = {
  id: 'mac-dinh', name: 'Mặc định',
  brand: '',                 // brand kit id (~/.ai-video-studio/brands.json), '' = none
  pack: 'auto',              // 'auto' = AI chọn · 'keep' · pack id
  template: '',              // template id (templates/*.json) instead of AI dựng giúp; '' = AI
  caption_style: '',         // force a caption style ('' = what the pack/AI chooses)
  goal: 'Chia sẻ', tone: 'Tự nhiên, gần gũi', ai_density: 'vua', extra: '',
  ai: true,                  // AI dựng giúp (claude -p)
  broll_density: 'vua',      // off | thua | vua | day | ratday
  broll_src: ['preset', 'hf', 'text', 'emoji', 'logo', 'aroll', 'lib'],
  broll_goal: 'auto',
  broll_claude: false,
  sound: 'vua',              // off | nhe | vua | phongphu  (auto_sfx.py --level)
  music: 'auto',             // auto (AI's pick, else a bed per section) | off | <mood>
  clean: 'vua',              // off | nhe | vua | manh  (TL.audio.clean)
  fillers: true, fillers_claude: false,
  whisper: 'large-v3-turbo', lang: 'vi', orient: 'auto',
  aspects: ['9:16'],         // formats to deliver; the native one is always rendered
  quality: '1080',
  qc: true,                  // A2's scripts/ai_qc.mjs --fix when present
  cta: '',                   // call to action (outro + publish texts)
  platforms: ['tiktok', 'youtube', 'facebook'],
  slot: '19:00',             // default schedule slot (Lịch đăng, A4)
  learn: true,               // learn from the user's edits of autopilot projects
  learned: null,
};
const STEPS_DENS = ['off', 'thua', 'vua', 'day', 'ratday'];
const STEPS_SOUND = ['off', 'nhe', 'vua', 'phongphu'];
const STEPS_AI = ['thua', 'vua', 'day'];

const slug = s => String(s || 'kenh').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'kenh';
function writeAtomic(f, obj) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1)); fs.renameSync(tmp, f);
}
export function loadStore() {
  let s; try { s = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { s = null; }
  if (!s || !Array.isArray(s.profiles) || !s.profiles.length) s = { version: 1, default: 'mac-dinh', profiles: [{ ...DEFAULT_PROFILE }] };
  s.profiles = s.profiles.map(p => ({ ...DEFAULT_PROFILE, ...p }));
  if (!s.profiles.find(p => p.id === s.default)) s.default = s.profiles[0].id;
  return s;
}
export const saveStore = s => writeAtomic(FILE, s);
export function getProfile(id) {
  const s = loadStore();
  const p = s.profiles.find(x => x.id === (id || s.default));
  if (!p && id) throw new Error(`Không có hồ sơ kênh "${id}"`);
  return p || s.profiles[0];
}
const CLEAN = (src, cur = {}) => {
  const o = { ...cur };
  for (const k of Object.keys(DEFAULT_PROFILE)) if (k in src && !['id', 'learned'].includes(k)) o[k] = src[k];
  for (const k of ['broll_src', 'aspects', 'platforms']) if (typeof o[k] === 'string') o[k] = o[k].split(',').map(x => x.trim()).filter(Boolean);
  for (const k of ['ai', 'fillers', 'fillers_claude', 'broll_claude', 'qc', 'learn']) o[k] = !!o[k];
  o.name = String(o.name || 'Hồ sơ').slice(0, 60); o.cta = String(o.cta || '').slice(0, 200); o.extra = String(o.extra || '').slice(0, 600);
  return o;
};
export function upsertProfile(src) {
  const s = loadStore();
  let p = src.id && s.profiles.find(x => x.id === src.id);
  if (!p) { p = { ...DEFAULT_PROFILE, id: slug(src.name) + '-' + crypto.randomBytes(2).toString('hex'), learned: null, created: new Date().toISOString() }; s.profiles.push(p); }
  Object.assign(p, CLEAN(src, p), { updated: new Date().toISOString() });
  saveStore(s); return p;
}
export function duplicateProfile(id) {
  const s = loadStore(), p = s.profiles.find(x => x.id === id);
  if (!p) throw new Error('không thấy hồ sơ');
  const c = { ...JSON.parse(JSON.stringify(p)), id: slug(p.name) + '-' + crypto.randomBytes(2).toString('hex'), name: p.name + ' (bản sao)', learned: null, created: new Date().toISOString() };
  s.profiles.push(c); saveStore(s); return c;
}
export function deleteProfile(id) {
  const s = loadStore();
  if (s.profiles.length <= 1) throw new Error('Cần giữ ít nhất 1 hồ sơ');
  s.profiles = s.profiles.filter(p => p.id !== id);
  if (s.default === id) s.default = s.profiles[0].id;
  saveStore(s); return true;
}
export function setDefault(id) { const s = loadStore(); if (!s.profiles.find(p => p.id === id)) throw new Error('không thấy hồ sơ'); s.default = id; saveStore(s); return true; }
export function resetLearned(id) { const s = loadStore(), p = s.profiles.find(x => x.id === id); if (!p) throw new Error('không thấy hồ sơ'); p.learned = null; saveStore(s); return p; }

// ---------- "Học từ chỉnh sửa" ----------
// Observation of ONE autopilot project: what the autopilot delivered (.studio/autopilot_result.json) vs the timeline the user saved.
// scenes the autopilot inserted: b-roll pass (_auto) and AI dựng giúp (_ai, except long _base backgrounds)
const KIND = s => s.type === 'emoji_pop' ? 'emoji' : s.type === 'text' ? 'text' : s.type === 'photo' ? 'photo' : 'preset';
const MINE = s => (s._auto || s._ai) && !s._base;
export function observe(before, after) {
  const count = (tl, pred) => (tl.scenes || []).filter(pred);
  const o = { auto: {}, ai: [0, 0], sfx: [0, 0], moved: 0 };
  for (const k of ['emoji', 'text', 'photo', 'preset']) o.auto[k] = [count(before, s => MINE(s) && KIND(s) === k).length, count(after, s => MINE(s) && KIND(s) === k).length];
  o.moved = count(after, s => (s._auto || s._ai) && s._orig).length;
  o.ai = [count(before, s => s._ai && !s._base).length, count(after, s => s._ai && !s._base).length];
  const sfxN = tl => (tl.audio?.sfx || []).filter(x => x._auto || x._ai).length;
  o.sfx = [sfxN(before), sfxN(after)];
  const mus = tl => (tl.audio?.music || []).filter(m => !m.hidden && !m.mute);
  o.music = { before: mus(before).length, after: mus(after).length, gain: mus(after).length && mus(before).length ? +(mus(after)[0].gain ?? -20) - +(mus(before)[0].gain ?? -20) : 0 };
  if ((after.caption_style || '') !== (before.caption_style || '')) o.caption_style = after.caption_style || '';
  if ((after.pack || '') !== (before.pack || '')) o.pack = after.pack || '';
  o.edited = JSON.stringify({ s: after.scenes, a: after.audio, c: after.caption_style, p: after.pack }) !== JSON.stringify({ s: before.scenes, a: before.audio, c: before.caption_style, p: before.pack });
  return o;
}
// Aggregate the newest ≤ 10 observations into small, explainable adjustments.
export function deriveRules(learned) {
  const obs = Object.values(learned?.projects || {}).filter(o => o.edited).sort((a, b) => (b.t || '').localeCompare(a.t || '')).slice(0, 10);
  const rules = { n: obs.length, adjust: {}, notes: [] };
  if (!obs.length) return rules;
  const sum = (f) => obs.reduce((a, o) => [a[0] + f(o)[0], a[1] + f(o)[1]], [0, 0]);
  const rem = ([b, a]) => (b ? Math.max(0, b - a) / b : 0);
  const pct = x => Math.round(x * 100) + '%';
  const enough = obs.length >= 2;
  for (const [k, label] of [['emoji', 'emoji pop'], ['text', 'chữ nổi'], ['photo', 'ảnh']]) {
    const s = sum(o => o.auto[k] || [0, 0]), r = rem(s);
    if (enough && s[0] >= 4 && r >= .6) { rules.adjust.drop_src = [...(rules.adjust.drop_src || []), k]; rules.notes.push(`Bạn thường xoá ${label} tự động (${pct(r)} trong ${obs.length} video) → không chèn ${label} nữa`); }
  }
  const all = sum(o => Object.values(o.auto).reduce((a, x) => [a[0] + x[0], a[1] + x[1]], [0, 0])), rAll = rem(all);
  if (enough && all[0] >= 6 && rAll >= .45) { rules.adjust.broll_step = -1; rules.notes.push(`Bạn xoá ${pct(rAll)} b-roll tự động → giảm mật độ b-roll một bậc`); }
  const ai = sum(o => o.ai), rAi = rem(ai);
  if (enough && ai[0] >= 6 && rAi >= .45) { rules.adjust.ai_step = -1; rules.notes.push(`Bạn xoá ${pct(rAi)} graphic của AI → AI đặt thưa hơn một bậc`); }
  const sf = sum(o => o.sfx), rSf = rem(sf);
  if (enough && sf[0] >= 6 && rSf >= .5) { rules.adjust.sound_step = -1; rules.notes.push(`Bạn xoá ${pct(rSf)} SFX tự động → giảm mức âm thanh một bậc`); }
  const musOff = obs.filter(o => o.music.before && !o.music.after).length;
  if (musOff >= 2 && musOff / obs.length >= .6) { rules.adjust.music = 'off'; rules.notes.push(`Bạn tắt nhạc nền ở ${musOff}/${obs.length} video → không thêm nhạc`); }
  const gains = obs.filter(o => o.music.after && o.music.gain).map(o => o.music.gain);
  if (gains.length >= 2 && gains.every(g => Math.sign(g) === Math.sign(gains[0]))) { const g = +(gains.reduce((a, b) => a + b, 0) / gains.length).toFixed(1); rules.adjust.music_gain = g; rules.notes.push(`Bạn thường chỉnh nhạc ${g > 0 ? 'to' : 'nhỏ'} hơn ${Math.abs(g)} dB → áp sẵn`); }
  for (const [k, label] of [['caption_style', 'kiểu phụ đề'], ['pack', 'gói style']]) {
    const v = obs.slice(0, 3).map(o => o[k]).filter(x => x != null);
    if (v.length >= 2 && v.every(x => x === v[0]) && v[0]) { rules.adjust[k] = v[0]; rules.notes.push(`Bạn đổi ${label} sang “${v[0]}” ở ${v.length} video gần nhất → dùng luôn`); }
  }
  const moved = obs.reduce((a, o) => a + o.moved, 0);
  if (moved) rules.notes.push(`(Thống kê) ${moved} cảnh tự động đã bị bạn chỉnh vị trí/nội dung — chưa tự áp, chỉ ghi nhận`);
  return rules;
}
// Ratings/tags/comments from Telegram & Studio (scripts/feedback.mjs improve() → p.fb) on top of the profile.
function applyFeedback(p, out) {
  const f = p.fb; if (!f || p.learn === false) return out;
  const step = (list, v, d) => list[Math.max(1, Math.min(list.length - 1, list.indexOf(v) + d))] || v;
  if (f.broll_step && p.broll_density !== 'off') out.broll_density = step(STEPS_DENS, p.broll_density, f.broll_step);
  if (f.ai_step) out.ai_density = STEPS_AI[Math.max(0, Math.min(STEPS_AI.length - 1, STEPS_AI.indexOf(p.ai_density) + f.ai_step))] || p.ai_density;
  if (f.sound_step && p.sound !== 'off') out.sound = step(STEPS_SOUND, p.sound, f.sound_step);
  if (f.music_gain) out.music_gain = (out.music_gain || 0) + f.music_gain;
  if (f.caption_style && !p.caption_style) out.caption_style = f.caption_style;
  if (f.extra) out.extra = [out.extra, f.extra].filter(Boolean).join(' ');
  out.applied = [...(out.applied || []), ...(f.notes || []).map(n => '[phản hồi] ' + n)];
  return out;
}
// Profile with learned adjustments applied (+ list of what changed). Explicit profile fields always win for caption_style/pack.
export function effectiveProfile(p) {
  const out = applyFeedback(p, { ...p, applied: [] });
  if (!p.learn || !p.learned) return out;
  const r = deriveRules(p.learned), a = r.adjust;
  const step = (list, v, d) => list[Math.max(1, Math.min(list.length - 1, list.indexOf(v) + d))] || v;
  if (a.drop_src) {
    out.broll_src = (p.broll_src || []).filter(x => !a.drop_src.includes(x));
    const no = { emoji: 'emoji_pop/emoji', text: 'chữ nổi to (text pop)', photo: 'ảnh' };
    out.extra = [out.extra, `Không chèn ${a.drop_src.map(k => no[k]).filter(Boolean).join(', ')} (người dùng hay xoá).`].filter(Boolean).join(' ');
  }
  if (a.broll_step && p.broll_density !== 'off') out.broll_density = step(STEPS_DENS, p.broll_density, a.broll_step);
  if (a.ai_step) out.ai_density = STEPS_AI[Math.max(0, STEPS_AI.indexOf(p.ai_density) + a.ai_step)] || p.ai_density;
  if (a.sound_step && p.sound !== 'off') out.sound = step(STEPS_SOUND, p.sound, a.sound_step);
  if (a.music) out.music = a.music;
  if (a.music_gain) out.music_gain = (out.music_gain || 0) + a.music_gain;
  if (a.caption_style && !p.caption_style) out.caption_style = a.caption_style;
  if (a.pack && (p.pack === 'auto' || !p.pack)) out.pack = a.pack;
  out.applied = [...out.applied, ...r.notes];
  return out;
}
// Learn from one project the autopilot produced (called by the Studio lane after the user saves it, or by CLI).
export function learnFromProject(dir) {
  const st = path.join(dir, '.studio');
  const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const ap = rd(path.join(st, 'autopilot.json')), before = rd(path.join(st, 'autopilot_result.json')), after = rd(path.join(dir, 'timeline.json'));
  if (!ap?.profile || !before || !after) return { ok: false, why: 'không phải dự án Tự lái hoặc chưa chạy xong' };
  const mt = fs.statSync(path.join(dir, 'timeline.json')).mtimeMs;
  if (mt <= (ap.finishedMs || 0) + 1000) return { ok: false, why: 'chưa có chỉnh sửa sau Tự lái' };
  const s = loadStore(), p = s.profiles.find(x => x.id === ap.profile);
  if (!p) return { ok: false, why: 'hồ sơ đã bị xoá' };
  if (!p.learn) return { ok: false, why: 'hồ sơ tắt “Học từ chỉnh sửa”' };
  const key = crypto.createHash('md5').update(path.resolve(dir)).digest('hex').slice(0, 10);
  const o = { ...observe(before, after), t: new Date().toISOString(), dir: path.resolve(dir), name: path.basename(dir) };
  p.learned = p.learned || { projects: {} };
  p.learned.projects[key] = o; // re-saving the same project replaces its observation (never double counts)
  const keys = Object.keys(p.learned.projects).sort((a, b) => (p.learned.projects[b].t || '').localeCompare(p.learned.projects[a].t || ''));
  for (const k of keys.slice(20)) delete p.learned.projects[k];
  p.learned.updated = o.t;
  saveStore(s);
  return { ok: true, profile: p.id, observation: o, rules: deriveRules(p.learned) };
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const [cmd, a] = process.argv.slice(2);
  try {
    if (cmd === 'list') { const s = loadStore(); for (const p of s.profiles) console.log(`${p.id === s.default ? '*' : ' '} ${p.id}  ${p.name}`); }
    else if (cmd === 'show') { const p = getProfile(a); const e = effectiveProfile(p); console.log(JSON.stringify({ ...p, effective: e.applied }, null, 1)); }
    else if (cmd === 'default') { setDefault(a); console.log('ok'); }
    else if (cmd === 'learn') console.log(JSON.stringify(learnFromProject(path.resolve(a)), null, 1));
    else if (cmd === 'reset-learned') { resetLearned(a); console.log('ok'); }
    else { console.error('usage: node scripts/profile.mjs list | show [id] | default <id> | learn <project_dir> | reset-learned <id>'); process.exit(2); }
  } catch (e) { console.error('LỖI: ' + e.message); process.exit(1); }
}
