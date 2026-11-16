// Feedback loop (references/agent-telegram.md): ratings + tags + comments on delivered videos (Telegram, Studio)
// → improve(): turns them into channel-profile adjustments (profile.fb, applied by effectiveProfile) and, with the Claude CLI,
// into concrete changes + suggestions → suggestions the user (or the bot) applies or dismisses.
//   node scripts/feedback.mjs add <video|project> <1-5> [tag,tag] ["góp ý"]
//   node scripts/feedback.mjs improve [--no-claude] [--apply]        → JSON report
//   node scripts/feedback.mjs suggest [--no-claude]                  → refresh ~/.ai-video-studio/suggestions.json
//   node scripts/feedback.mjs list | suggestions | act <id> apply|dismiss
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AVS_HOME, loadStore, saveStore, getProfile } from './profile.mjs';
import { loadQueue, addItem } from './queue.mjs';
import { loadSchedule } from './publish.mjs';
import { spawnClaude } from './platform.mjs';

const FB = path.join(AVS_HOME, 'feedback.jsonl'), SUG = path.join(AVS_HOME, 'suggestions.json'), LOG = path.join(AVS_HOME, 'improve_log.json');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); };
const id = () => crypto.randomBytes(4).toString('hex');

// Quick tags offered after each video (Telegram buttons, Studio chips). key → effect on the profile.
export const TAGS = {
  tot: 'Tốt rồi', hook: 'Mở đầu yếu', phude: 'Phụ đề khó đọc', nhac_to: 'Nhạc to quá', nhac_nho: 'Nhạc nhỏ quá',
  fx_nhieu: 'Hiệu ứng rối', fx_it: 'Hiệu ứng ít', che_mat: 'Che mặt', dai: 'Dài quá', am_thanh: 'Tiếng động nhiều',
};

// ---------- store ----------
export function projectOfVideo(v) {
  if (!v) return null;
  let d = fs.existsSync(v) && fs.statSync(v).isDirectory() ? v : path.dirname(v);
  for (let i = 0; i < 3; i++, d = path.dirname(d)) if (fs.existsSync(path.join(d, 'timeline.json'))) return d;
  return null;
}
export function addFeedback({ video, project, rating, tags = [], comment = '', source = 'studio', chat }) {
  project = project || projectOfVideo(video);
  const ap = project ? rd(path.join(project, '.studio/autopilot.json'), null) : null, qc = project ? rd(path.join(project, '.studio/qc.json'), null) : null;
  const e = { id: id(), t: new Date().toISOString(), video: video || null, project, profile: ap?.profile || null, rating: rating ? Math.max(1, Math.min(5, +rating)) : null,
    tags: [...new Set(tags)].filter(t => TAGS[t]), comment: String(comment || '').slice(0, 1000), source, chat: chat || undefined, qc: qc?.score ?? null };
  fs.mkdirSync(AVS_HOME, { recursive: true });
  fs.appendFileSync(FB, JSON.stringify(e) + '\n');
  return e;
}
// Later additions to the same entry (tags tapped after the stars, a comment typed afterwards) are merged by id.
export function listFeedback(n = 200) {
  const map = new Map();
  if (fs.existsSync(FB)) for (const l of fs.readFileSync(FB, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { const e = JSON.parse(l); map.set(e.id, e.patch ? { ...map.get(e.id), ...e.patch, tags: [...new Set([...(map.get(e.id)?.tags || []), ...(e.patch.tags || [])])] } : e); } catch { /* torn line */ }
  }
  return [...map.values()].filter(e => e.t).slice(-n);
}
export function patchFeedback(fid, patch) { fs.appendFileSync(FB, JSON.stringify({ id: fid, patch }) + '\n'); return listFeedback().find(e => e.id === fid); }

// ---------- improve: feedback → profile.fb ----------
// Deterministic part (no AI): looks at the last 8 rated videos of each profile.
export function deriveFeedbackRules(entries) {
  const recent = entries.slice(-8), n = recent.length, cnt = k => recent.filter(e => e.tags.includes(k)).length;
  const r = { n, adjust: {}, notes: [], avg: n ? +(recent.filter(e => e.rating).reduce((a, e) => a + e.rating, 0) / (recent.filter(e => e.rating).length || 1)).toFixed(2) : null };
  if (n < 2) return r;
  const want = (k, min = 2) => cnt(k) >= min && cnt(k) / n >= .25;
  if (want('nhac_to')) { r.adjust.music_gain = -3; r.notes.push(`${cnt('nhac_to')}/${n} góp ý "nhạc to" → nhạc nhỏ đi 3 dB`); }
  else if (want('nhac_nho')) { r.adjust.music_gain = 3; r.notes.push(`${cnt('nhac_nho')}/${n} góp ý "nhạc nhỏ" → nhạc to lên 3 dB`); }
  if (want('fx_nhieu') || want('che_mat')) { r.adjust.broll_step = -1; r.adjust.ai_step = -1; r.notes.push(`Hiệu ứng rối / che mặt (${cnt('fx_nhieu') + cnt('che_mat')} lần) → giảm mật độ b-roll và graphic một bậc`); }
  else if (want('fx_it')) { r.adjust.broll_step = 1; r.adjust.ai_step = 1; r.notes.push(`${cnt('fx_it')}/${n} góp ý "ít hiệu ứng" → tăng mật độ một bậc`); }
  if (want('am_thanh')) { r.adjust.sound_step = -1; r.notes.push(`Tiếng động nhiều (${cnt('am_thanh')} lần) → giảm mức SFX`); }
  if (want('phude')) { r.adjust.caption_style = 'hf_pill_karaoke'; r.notes.push(`Phụ đề khó đọc (${cnt('phude')} lần) → đổi sang kiểu có nền "Viên thuốc karaoke"`); }
  const extra = [];
  if (want('hook')) extra.push('Mở đầu phải có hook mạnh trong 2 giây đầu (chữ lớn + con số/câu hỏi), người xem chê mở đầu yếu.');
  if (want('dai')) extra.push('Người xem thấy video dài: cắt khoảng lặng mạnh hơn, bỏ ý lặp.');
  if (want('che_mat')) extra.push('Tuyệt đối không đặt graphic/emoji che mặt người nói.');
  const comments = recent.map(e => e.comment).filter(Boolean).slice(-4);
  if (comments.length) extra.push('Góp ý gần đây của người dùng: ' + comments.map(c => `"${c.slice(0, 140)}"`).join('; '));
  if (extra.length) { r.adjust.extra = extra.join(' '); r.notes.push('Đưa góp ý vào hướng dẫn cho AI dựng giúp'); }
  return r;
}

export function askClaudeJSON(prompt, { model = 'sonnet', timeout = 240000 } = {}) {
  return new Promise((ok, bad) => {
    const p = spawnClaude(['-p', '--output-format', 'json', '--model', model], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; const k = setTimeout(() => p.kill('SIGTERM'), timeout);
    p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (err += d));
    p.on('error', e => { clearTimeout(k); bad(new Error(e.code === 'ENOENT' ? 'Chưa cài Claude Code CLI' : e.message)); });
    p.on('close', c => {
      clearTimeout(k);
      try { const r = JSON.parse(out); if (r.is_error) throw new Error(r.result); const s = String(r.result || ''), a = s.indexOf('{'), b = s.lastIndexOf('}'); ok(JSON.parse(s.slice(a, b + 1))); }
      catch (e) { bad(new Error(c ? (err || out).slice(-300) : 'AI không trả về JSON: ' + e.message)); }
    });
    p.stdin.end(prompt);
  });
}

const qcIssues = dirs => {
  const c = {};
  for (const d of dirs) for (const i of rd(path.join(d, '.studio/qc.json'), {})?.issues || []) c[i.kind] = (c[i.kind] || 0) + 1;
  return c;
};
// Whitelisted fields the AI may change on a profile (anything else becomes a suggestion only).
const SAFE = { ai_density: ['thua', 'vua', 'day'], broll_goal: ['auto', 'banhang', 'bds', 'khoahoc', 'review', 'tintuc', 'kechuyen', 'doanhnghiep', 'amthuc', 'giaitri'], broll_density: ['off', 'thua', 'vua', 'day', 'ratday'], sound: ['off', 'nhe', 'vua', 'phongphu'], clean: ['off', 'nhe', 'vua', 'manh'] };
// A profile patch coming from the AI (or a stored suggestion): only known fields with valid values survive.
export function cleanPatch(patch = {}) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (SAFE[k]) { if (SAFE[k].includes(v)) out[k] = v; }
    else if (k === 'music_gain' && Number.isFinite(+v) && Math.abs(+v) <= 12) out[k] = +v;
    else if (['caption_style', 'extra', 'goal', 'tone', 'cta'].includes(k) && typeof v === 'string') out[k] = v.slice(0, 600);
  }
  return out;
}
const sanitizeAction = a => {
  if (a?.type === 'profile') { const patch = cleanPatch(a.patch); return Object.keys(patch).length ? { ...a, patch } : { type: 'none' }; }
  return ['topic', 'improve', 'schedule', 'retry_failed'].includes(a?.type) ? a : { type: 'none' };
};

export async function improve({ claude = true, apply = false, model = 'sonnet', log = () => {} } = {}) {
  const all = listFeedback(), store = loadStore(), report = { at: new Date().toISOString(), profiles: [], ai: null, suggestions: 0 };
  for (const p of store.profiles) {
    const mine = all.filter(e => (e.profile || store.default) === p.id && (e.rating || e.tags.length || e.comment));
    const r = deriveFeedbackRules(mine);
    if (r.n >= 2) { p.fb = { ...r.adjust, notes: r.notes, n: r.n, avg: r.avg, at: report.at }; }
    report.profiles.push({ id: p.id, name: p.name, n: r.n, avg: r.avg, notes: r.notes });
  }
  saveStore(store);
  log('Đã cập nhật hồ sơ từ phản hồi');
  if (claude && all.length) {
    const projects = [...new Set(all.slice(-12).map(e => e.project).filter(Boolean))];
    const prompt = `Bạn là "giám đốc sản xuất" của AI Video Studio (phần mềm tự dựng video ngắn tiếng Việt). Dưới đây là phản hồi của người dùng về các video đã giao,
điểm AI tự kiểm tra (qc), lỗi QC hay gặp và cấu hình hồ sơ kênh hiện tại. Hãy đề xuất cải tiến cụ thể.
PHẢN HỒI (mới nhất cuối): ${JSON.stringify(all.slice(-20).map(e => ({ rating: e.rating, tags: e.tags.map(t => TAGS[t]), comment: e.comment, qc: e.qc, profile: e.profile })))}
LỖI QC (đếm): ${JSON.stringify(qcIssues(projects))}
HỒ SƠ: ${JSON.stringify(store.profiles.map(p => ({ id: p.id, name: p.name, ai_density: p.ai_density, broll_density: p.broll_density, sound: p.sound, clean: p.clean, caption_style: p.caption_style, goal: p.goal, tone: p.tone, extra: p.extra, fb: p.fb?.notes })))}
Chỉ trả về JSON: {"summary":"1-2 câu tiếng Việt","changes":[{"profile":"<id>","field":"ai_density|broll_density|sound|clean","value":"…","why":"…"}],
"suggestions":[{"title":"≤60 ký tự","detail":"1-2 câu, nói rõ lợi ích","action":{"type":"profile","profile":"<id>","patch":{…}}|{"type":"topic","topic":"…"}|{"type":"none"}}]}
Giá trị hợp lệ cho patch/changes: ai_density thua|vua|day · broll_density off|thua|vua|day|ratday · sound off|nhe|vua|phongphu · clean off|nhe|vua|manh · music_gain số dB (-12..12, âm = nhỏ đi) · caption_style · extra (hướng dẫn thêm cho AI dựng) · goal · tone · cta.
Tối đa 3 changes, 5 suggestions. Chỉ đề xuất điều có căn cứ từ dữ liệu.`;
    try {
      const ai = await askClaudeJSON(prompt, { model }); report.ai = { summary: ai.summary, changes: [] };
      const s2 = loadStore();
      for (const c of (ai.changes || []).slice(0, 3)) {
        const p = s2.profiles.find(x => x.id === c.profile), okv = SAFE[c.field]?.includes(c.value);
        if (!p || !okv) continue;
        if (apply) { p[c.field] = c.value; report.ai.changes.push({ ...c, applied: true }); }
        else addSuggestion({ kind: 'ai', title: `Đổi ${c.field} của "${p.name}" → ${c.value}`, detail: c.why, action: { type: 'profile', profile: p.id, patch: { [c.field]: c.value } } });
      }
      if (apply) saveStore(s2);
      for (const s of (ai.suggestions || []).slice(0, 5)) { addSuggestion({ kind: 'ai', ...s, action: sanitizeAction(s.action) }); report.suggestions++; }
      log('AI đã phân tích phản hồi');
    } catch (e) { report.ai = { error: e.message }; }
  }
  const hist = rd(LOG, []); hist.push(report); wr(LOG, hist.slice(-30));
  return report;
}

// ---------- suggestions ----------
export const loadSuggestions = () => rd(SUG, { items: [] });
export function addSuggestion(s) {
  const st = loadSuggestions(), key = (s.key || s.title || '').toLowerCase();
  const old = st.items.find(x => (x.key || x.title || '').toLowerCase() === key && x.state === 'new');
  if (old) Object.assign(old, s, { id: old.id }); else st.items.push({ id: id(), state: 'new', at: new Date().toISOString(), kind: 'rule', action: { type: 'none' }, ...s });
  st.items = st.items.slice(-60); wr(SUG, st);
  return st;
}
// Rule-based suggestions from what the app already knows; with Claude also content ideas from recent transcripts.
export async function refreshSuggestions({ claude = true, model = 'sonnet' } = {}) {
  const fb = listFeedback(), store = loadStore(), q = loadQueue(), sch = loadSchedule(), now = Date.now();
  const recent = fb.filter(e => now - Date.parse(e.t) < 14 * 864e5);
  const low = recent.filter(e => e.rating && e.rating <= 3);
  if (low.length >= 2) addSuggestion({ key: 'improve-low', title: 'Chạy tự cải tiến từ phản hồi', detail: `${low.length} video gần đây bị chấm ≤3★. Cho AI phân tích để chỉnh hồ sơ kênh.`, action: { type: 'improve' } });
  const unrated = q.items.filter(i => i.state === 'done' && now - Date.parse(i.finished || i.created) < 7 * 864e5 && !fb.some(e => (i.outputs || []).includes(e.video) || e.project === i.project)).length;
  if (unrated >= 3) addSuggestion({ key: 'rate', title: `Chấm điểm ${unrated} video chưa đánh giá`, detail: 'Càng nhiều phản hồi, Tự lái càng dựng đúng gu của bạn.', action: { type: 'none' } });
  const upcoming = (sch.items || []).filter(x => x.state === 'planned' && Date.parse(x.when) > now && Date.parse(x.when) < now + 3 * 864e5).length;
  const ready = q.items.filter(i => i.state === 'done' && (i.outputs || []).some(f => /\.mp4$/i.test(f))).length;
  if (!upcoming && ready) addSuggestion({ key: 'schedule', title: 'Lên lịch đăng cho 3 ngày tới', detail: `Chưa có bài nào được hẹn giờ trong 3 ngày tới, trong khi đã có ${ready} video làm xong.`, action: { type: 'schedule' } });
  const failed = q.items.filter(i => i.state === 'failed').length;
  if (failed) addSuggestion({ key: 'failed', title: `Chạy lại ${failed} việc bị lỗi trong hàng đợi`, detail: 'Tự lái chạy tiếp từ bước dở, không làm lại từ đầu.', action: { type: 'retry_failed' } });
  for (const p of store.profiles) if (p.fb?.avg && p.fb.avg >= 4.3 && p.fb.n >= 4) addSuggestion({ key: 'clone-' + p.id, title: `Hồ sơ "${p.name}" đang được chấm ${p.fb.avg}★`, detail: 'Nhân bản hồ sơ này cho kênh khác để giữ công thức đang hiệu quả.', action: { type: 'none' } });
  if (claude) {
    const texts = [];
    for (const it of q.items.filter(i => i.state === 'done' && i.project).slice(-5)) {
      const caps = rd(path.join(it.project, 'work/captions.json'), null) || rd(path.join(it.project, 'captions.json'), []);
      const t = (Array.isArray(caps) ? caps : []).map(c => (c.words || []).map(w => w.w).join(' ')).join(' ').slice(0, 600);
      if (t) texts.push(t);
    }
    if (texts.length) {
      try {
        const ai = await askClaudeJSON(`Từ lời thoại các video gần đây của một nhà sáng tạo nội dung Việt Nam, đề xuất 4 chủ đề video ngắn tiếp theo (cùng ngách, hook mạnh, khả năng viral).
LỜI THOẠI: ${JSON.stringify(texts)}
Chỉ trả JSON {"ideas":[{"title":"≤60 ký tự","detail":"vì sao nên làm, 1 câu","topic":"mô tả chủ đề để AI viết kịch bản"}]}`, { model });
        for (const i of (ai.ideas || []).slice(0, 4)) addSuggestion({ kind: 'idea', key: 'idea-' + i.title, title: '💡 ' + i.title, detail: i.detail, action: { type: 'topic', topic: i.topic || i.title } });
      } catch { /* no claude → rule suggestions only */ }
    }
  }
  return loadSuggestions();
}
export async function actSuggestion(sid, act, { onImprove } = {}) {
  const st = loadSuggestions(), s = st.items.find(x => x.id === sid);
  if (!s) throw new Error('Không thấy đề xuất');
  let msg = 'Đã bỏ qua';
  if (act === 'apply') {
    const a = s.action || {};
    if (a.type === 'profile') {
      const store = loadStore(), p = store.profiles.find(x => x.id === a.profile) || store.profiles.find(x => x.id === store.default);
      if (!p) throw new Error('Không thấy hồ sơ');
      const patch = cleanPatch(a.patch);
      if (!Object.keys(patch).length) throw new Error('Đề xuất không có thay đổi hợp lệ');
      Object.assign(p, patch); saveStore(store); msg = `Đã cập nhật hồ sơ "${p.name}"`;
    } else if (a.type === 'topic') { const it = addItem({ kind: 'topic', input: a.topic, source: 'suggest' }); msg = `Đã xếp hàng video chủ đề (#${it.id})`; }
    else if (a.type === 'improve') { const r = await (onImprove || improve)(); msg = 'Đã chạy tự cải tiến' + (r?.ai?.summary ? ': ' + r.ai.summary : ''); }
    else if (a.type === 'retry_failed') {
      const { retryItem } = await import('./queue.mjs'); let n = 0;
      for (const it of loadQueue().items.filter(i => i.state === 'failed')) if (retryItem(it.id)) n++;
      msg = `Đã cho chạy lại ${n} việc`;
    } else if (a.type === 'schedule') {
      const { autoSchedule } = await import('./publish.mjs');
      const vids = loadQueue().items.filter(i => i.state === 'done').flatMap(i => (i.outputs || []).filter(f => /\.mp4$/i.test(f))).slice(-3);
      const r = autoSchedule(vids, ['tiktok', 'youtube']); msg = `Đã xếp lịch ${r?.length ?? vids.length} bài`;
    } else msg = 'Đã ghi nhận';
  }
  const st2 = loadSuggestions(), s2 = st2.items.find(x => x.id === sid);
  if (s2) { s2.state = act === 'apply' ? 'applied' : 'dismissed'; s2.result = msg; wr(SUG, st2); }
  return { ok: true, msg };
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const [cmd, ...a] = process.argv.slice(2), flag = k => a.includes(k);
  const out = o => console.log(JSON.stringify(o, null, 1));
  if (cmd === 'add') out(addFeedback({ video: a[0], rating: +a[1], tags: (a[2] || '').split(',').filter(Boolean), comment: a[3] || '', source: 'cli' }));
  else if (cmd === 'list') out(listFeedback(50));
  else if (cmd === 'improve') out(await improve({ claude: !flag('--no-claude'), apply: flag('--apply'), log: m => console.error(m) }));
  else if (cmd === 'suggest') out(await refreshSuggestions({ claude: !flag('--no-claude') }));
  else if (cmd === 'suggestions') out(loadSuggestions());
  else if (cmd === 'act') out(await actSuggestion(a[0], a[1] || 'apply'));
  else { console.error('usage: node scripts/feedback.mjs add|list|improve|suggest|suggestions|act …'); process.exit(2); }
}
