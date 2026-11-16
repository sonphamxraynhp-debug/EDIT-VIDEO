// Lịch đăng + tự tải lên YouTube (OAuth client riêng của người dùng). Spec: references/publish-schedule.md
//
// usage:
//   node scripts/publish.mjs schedule-list [--json] [--all]
//   node scripts/publish.mjs schedule-add --file <mp4> --platform youtube[,tiktok…] --when "2026-11-05 19:30" [--title …] [--caption …]
//                                         [--hashtags "#a #b"] [--privacy public|unlisted|private] [--project <dir>]
//   node scripts/publish.mjs schedule-update <id> [--when …] [--title …] [--caption …] [--hashtags …] [--privacy …] [--state planned]
//   node scripts/publish.mjs schedule-remove <id>
//   node scripts/publish.mjs schedule-auto --files a.mp4,b.mp4 --platforms youtube,tiktok [--from ISO]   (rải vào các khung giờ đăng)
//   node scripts/publish.mjs run-due [--json]          (A1 queue / Studio gọi mỗi phút; tự giữ khoá ~/.ai-video-studio/publish.lock)
//   node scripts/publish.mjs youtube-client <client_secret.json>   (lưu OAuth client "Desktop app" của bạn)
//   node scripts/publish.mjs youtube-auth | youtube-status | youtube-disconnect
//   node scripts/publish.mjs youtube-upload <mp4> --meta <json|file.json> [--schedule ISO] [--thumb cover.jpg]
//
// Dữ liệu ở AVS_HOME (mặc định ~/.ai-video-studio, quyền 600): schedule.json, youtube_client.json, youtube_token.json,
// youtube_quota.json, uploads/<phiên>.json (để tải tiếp khi bị ngắt). Không bao giờ in token.
// Biến môi trường cho kiểm thử: AVS_NOW (giờ giả), AVS_DRY_OPEN=1 (ghi log thay vì mở trình duyệt / thông báo),
// AVS_YT_API, AVS_YT_TOKEN_URI, AVS_YT_AUTH_URI, AVS_YT_REVOKE_URI (máy chủ giả), AVS_YT_CHUNK (byte), AVS_YT_BACKOFF_MS.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { openPath, revealPath, notifyDesktop, copyText } from './platform.mjs';

export const HOME = () => process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
const F = name => path.join(HOME(), name);
export const PLATFORMS = {
  youtube: { name: 'YouTube', url: 'https://www.youtube.com/upload' },
  tiktok: { name: 'TikTok', url: 'https://www.tiktok.com/tiktokstudio/upload' },
  facebook: { name: 'Facebook', url: 'https://www.facebook.com/reels/create' },
  instagram: { name: 'Instagram', url: 'https://www.instagram.com/' },
  zalo: { name: 'Zalo', url: 'https://oa.zalo.me/' },
};
export const DEFAULT_SETTINGS = { slots: ['11:30', '19:30'], remindMin: 10, ytLeadMin: 120, privacy: 'public', madeForKids: false, categoryId: '22' };
export const QUOTA = { daily: 10000, upload: 1600, thumbnail: 50, list: 1 };
const TZ = 'Asia/Ho_Chi_Minh', TZ_OFF = '+07:00';

export const now = () => (process.env.AVS_NOW ? new Date(process.env.AVS_NOW) : new Date());
const progress = (f, s) => console.log(`@@ ${Math.max(0, Math.min(1, f)).toFixed(3)} ${s}`);
function writePrivate(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 1), { mode: 0o600 });
  fs.chmodSync(tmp, 0o600); fs.renameSync(tmp, file);
}
const readJSON = (file, d) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return d; } };

// ---------- time (hiển thị theo giờ Việt Nam, lưu ISO UTC) ----------
export function parseWhen(s) {
  if (s instanceof Date) return s;
  s = String(s || '').trim();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s); // không có múi giờ → giờ Việt Nam
  const d = m ? new Date(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:${m[4] || '00'}${TZ_OFF}`) : new Date(s);
  if (isNaN(d)) throw new Error(`Thời điểm không hợp lệ: "${s}" (dạng 2026-11-05 19:30)`);
  return d;
}
export const fmtVN = d => { // "T5 05/11 19:30" (giờ Việt Nam)
  const o = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(d)).map(x => [x.type, x.value]));
  return `${{ Sun: 'CN', Mon: 'T2', Tue: 'T3', Wed: 'T4', Thu: 'T5', Fri: 'T6', Sat: 'T7' }[o.weekday]} ${o.day}/${o.month} ${o.hour}:${o.minute}`;
};
const vnDate = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d)); // YYYY-MM-DD theo giờ VN
const pacificDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(d)); // quota reset 0h Pacific

// ---------- schedule store ----------
export function loadSchedule() {
  const s = readJSON(F('schedule.json'), null) || {};
  return { version: 1, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) }, items: Array.isArray(s.items) ? s.items : [] };
}
export function saveSchedule(s) { writePrivate(F('schedule.json'), { version: 1, settings: s.settings, items: s.items }); return s; }
// read-modify-write in one go so a long upload never overwrites edits made meanwhile in the UI
export function mutate(fn) { const s = loadSchedule(); const r = fn(s); saveSchedule(s); return r; }
const STATES = ['planned', 'uploading', 'done', 'reminded', 'error'];
const cleanTags = h => (Array.isArray(h) ? h : String(h || '').split(/[\s,]+/)).map(t => String(t).trim().replace(/^#+/, '').replace(/\s+/g, '')).filter(Boolean).map(t => '#' + t);
function normItem(o, base = {}) {
  const it = { ...base };
  for (const k of ['project', 'file', 'title', 'caption', 'privacy', 'thumb', 'categoryId', 'first_comment']) if (o[k] != null) it[k] = String(o[k]);
  if (o.platform != null) { if (!PLATFORMS[o.platform]) throw new Error(`Nền tảng lạ: ${o.platform} (youtube|tiktok|facebook|instagram|zalo)`); it.platform = o.platform; }
  if (o.when != null) it.when = parseWhen(o.when).toISOString();
  if (o.hashtags != null) it.hashtags = cleanTags(o.hashtags);
  if (o.madeForKids != null) it.madeForKids = !!o.madeForKids;
  if (o.state != null) { if (!STATES.includes(o.state)) throw new Error('Trạng thái lạ: ' + o.state); it.state = o.state; if (o.state === 'planned') { it.error = null; it.preReminded = false; it.attempts = 0; it.retryAfter = null; } }
  if (it.privacy && !['public', 'unlisted', 'private'].includes(it.privacy)) throw new Error('privacy phải là public|unlisted|private');
  if (it.when !== base.when) it.preReminded = false;
  return it;
}
export function addItem(o) {
  if (!o.file) throw new Error('Thiếu --file (video MP4)');
  const file = path.resolve(o.file); if (!fs.existsSync(file)) throw new Error('Không thấy file video: ' + file);
  const it = normItem({ ...o, file });
  if (!it.platform) throw new Error('Thiếu nền tảng');
  if (!it.when) throw new Error('Thiếu thời điểm đăng');
  Object.assign(it, { id: 's' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), state: 'planned', url: null, error: null, created: now().toISOString() });
  if (!it.project) it.project = projectOf(file) || '';
  return mutate(s => { if (!it.privacy && it.platform === 'youtube') it.privacy = s.settings.privacy; s.items.push(it); return it; });
}
export function updateItem(id, o) {
  return mutate(s => {
    const i = s.items.findIndex(x => x.id === id); if (i < 0) throw new Error('Không thấy mục lịch ' + id);
    if (s.items[i].state === 'uploading' && o.state == null) throw new Error('Mục này đang tải lên, đợi xong rồi sửa');
    s.items[i] = { ...normItem(o, s.items[i]), updated: now().toISOString() }; return s.items[i];
  });
}
export function removeItem(id) { return mutate(s => { const n = s.items.length; s.items = s.items.filter(x => x.id !== id); if (s.items.length === n) throw new Error('Không thấy mục lịch ' + id); return true; }); }
export function setSettings(o) {
  return mutate(s => {
    const n = { ...s.settings };
    if (o.slots != null) {
      const sl = (Array.isArray(o.slots) ? o.slots : String(o.slots).split(/[,\s]+/)).filter(Boolean).map(x => { const m = /^(\d{1,2})[:h.](\d{2})$/.exec(x.trim()); if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('Khung giờ không hợp lệ: ' + x); return m[1].padStart(2, '0') + ':' + m[2]; });
      if (!sl.length) throw new Error('Cần ít nhất 1 khung giờ đăng'); n.slots = [...new Set(sl)].sort();
    }
    for (const k of ['remindMin', 'ytLeadMin']) if (o[k] != null) n[k] = Math.max(0, Math.min(24 * 60, +o[k] || 0));
    if (o.privacy) n.privacy = normItem({ privacy: o.privacy }).privacy;
    if (o.madeForKids != null) n.madeForKids = !!o.madeForKids;
    if (o.categoryId) n.categoryId = String(o.categoryId);
    s.settings = n; return n;
  });
}

// project dir = nearest parent with timeline.json (videos usually live in <project>/out/)
export function projectOf(file) {
  let d = path.dirname(path.resolve(file));
  for (let i = 0; i < 4; i++) { if (fs.existsSync(path.join(d, 'timeline.json'))) return d; const up = path.dirname(d); if (up === d) break; d = up; }
  return null;
}
// AI captions written by the "Đăng" dialog (<project>/publish/publish.json) → title/caption/hashtags for one platform
export function captionsFor(file, platform) {
  const proj = projectOf(file), out = { title: '', caption: '', hashtags: [] };
  if (proj) {
    const pub = readJSON(path.join(proj, 'publish/publish.json'), null);
    const d = pub?.platforms?.[platform] || pub?.platforms?.youtube || pub?.platforms?.tiktok || Object.values(pub?.platforms || {})[0];
    if (d) Object.assign(out, { title: d.title || '', caption: d.caption || '', hashtags: cleanTags(d.hashtags || []), first_comment: d.first_comment || '' });
    if (!out.title) out.title = readJSON(path.join(proj, 'timeline.json'), {}).title || '';
  }
  if (!out.title) out.title = path.basename(file).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  return out;
}

// Spread videos over the next free posting slots (one video per platform per slot).
export function autoSchedule(videos, platforms, { from } = {}) {
  platforms = platforms.filter(p => PLATFORMS[p]); if (!platforms.length) throw new Error('Chọn ít nhất 1 nền tảng');
  if (!videos.length) throw new Error('Chọn ít nhất 1 video');
  const s = loadSchedule(), start = from ? parseWhen(from) : now(), minT = start.getTime() + 10 * 60e3;
  const taken = new Set(s.items.filter(x => x.state !== 'error').map(x => `${x.platform}|${new Date(x.when).getTime()}`));
  const day0 = vnDate(start), added = [];
  let di = 0, si = 0;
  const slotAt = (d, k) => { const t = new Date(new Date(`${day0}T00:00:00${TZ_OFF}`).getTime() + d * 864e5); return parseWhen(`${vnDate(t)} ${s.settings.slots[k]}`); };
  for (const v of videos) {
    const file = path.resolve(typeof v === 'string' ? v : v.file);
    let t;
    for (; di < 120; di++, si = 0) {
      for (; si < s.settings.slots.length; si++) { const c = slotAt(di, si); if (c.getTime() >= minT && platforms.every(p => !taken.has(`${p}|${c.getTime()}`))) { t = c; break; } }
      if (t) break;
    }
    if (!t) throw new Error('Không tìm được khung giờ trống trong 120 ngày tới');
    for (const p of platforms) {
      const cap = { ...captionsFor(file, p), ...(v.meta?.[p] || {}) };
      added.push(addItem({ file, platform: p, when: t, title: cap.title, caption: cap.caption, hashtags: cap.hashtags, first_comment: cap.first_comment, project: v.project }));
      taken.add(`${p}|${t.getTime()}`);
    }
    si++;
  }
  return added;
}

// ---------- side effects (mở trang, thông báo, clipboard) ----------
const DRY = () => process.env.AVS_DRY_OPEN === '1';
function dryLog(kind, v) { const line = `${new Date().toISOString()} ${kind} ${v}`; console.log('[dry] ' + kind + ' ' + v); fs.mkdirSync(HOME(), { recursive: true }); fs.appendFileSync(F('publish_open.log'), line + '\n'); }
export function openURL(url) { if (DRY()) return dryLog('OPEN', url); openPath(url); }
function reveal(file) { if (DRY()) return dryLog('REVEAL', file); revealPath(file); }
export function notify(title, msg) {
  if (DRY()) return dryLog('NOTIFY', `${title} — ${msg}`);
  notifyDesktop(title, msg);
}
function pbcopy(text) {
  return copyText(text);
}
export const postText = it => [it.platform === 'youtube' || it.platform === 'facebook' ? it.title : '', it.caption, '', (it.hashtags || []).join(' ')].filter((x, i) => x || i === 2).join('\n').trim();

// ---------- lock (shared with A1's queue runner) ----------
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
export function acquireLock() {
  const f = F('publish.lock'); fs.mkdirSync(HOME(), { recursive: true });
  for (let k = 0; k < 2; k++) {
    try { const fd = fs.openSync(f, 'wx', 0o600); fs.writeSync(fd, JSON.stringify({ pid: process.pid, started: new Date().toISOString(), by: 'publish.mjs run-due' })); fs.closeSync(fd); return 'own'; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const l = readJSON(f, {}), age = Date.now() - (Date.parse(l.started) || fs.statSync(f).mtimeMs);
      if (l.pid === process.ppid) return 'parent'; // the A1 runner holds it and spawned us
      if (l.pid && alive(l.pid) && age < 6 * 3600e3) return null;
      fs.rmSync(f, { force: true }); // stale (dead pid / > 6 h)
    }
  }
  return null;
}
const releaseLock = how => { if (how === 'own') { const l = readJSON(F('publish.lock'), {}); if (l.pid === process.pid) fs.rmSync(F('publish.lock'), { force: true }); } };

// ---------- run-due ----------
export async function runDue({ log = console.log } = {}) {
  const lock = acquireLock();
  if (!lock) { log('Đang có tiến trình đăng khác chạy (publish.lock) — bỏ qua lượt này'); return { skipped: 'locked' }; }
  const T = now(), res = { now: T.toISOString(), preReminded: [], reminded: [], uploaded: [], errors: [], pending: 0 };
  try {
    const s = loadSchedule(), set = s.settings, at = it => new Date(it.when).getTime();
    // 1) nhắc trước 10 phút (không phải YouTube)
    for (const it of s.items.filter(x => x.state === 'planned' && x.platform !== 'youtube' && !x.preReminded && at(x) > T && at(x) - set.remindMin * 60e3 <= T)) {
      notify('AI Video Studio · sắp đăng', `${Math.round((at(it) - T) / 60e3)} phút nữa: đăng “${(it.title || path.basename(it.file)).slice(0, 60)}” lên ${PLATFORMS[it.platform].name}`);
      mutate(s2 => { const x = s2.items.find(y => y.id === it.id); if (x) x.preReminded = true; });
      res.preReminded.push(it.id);
    }
    // 2) YouTube: tải lên trước giờ đăng (ytLeadMin), YouTube tự công khai đúng giờ (status.publishAt)
    const yts = s.items.filter(x => x.platform === 'youtube' && (x.state === 'planned' || x.state === 'uploading') && at(x) - set.ytLeadMin * 60e3 <= T && !(Date.parse(x.retryAfter) > T)).sort((a, b) => at(a) - at(b));
    for (const it of yts) {
      if (!ytConnected()) { await remind(it, T, 'Chưa kết nối YouTube nên chuyển sang nhắc đăng tay'); res.reminded.push(it.id); continue; }
      const patch = o => mutate(s2 => { const x = s2.items.find(y => y.id === it.id); if (x) Object.assign(x, o, { updated: now().toISOString() }); });
      patch({ state: 'uploading', error: null, retryAfter: null, attempts: (it.attempts || 0) + 1 });
      try {
        if (!fs.existsSync(it.file)) throw new Error('Không thấy file video: ' + it.file);
        const pub = at(it) > T.getTime() + 15 * 60e3 && (it.privacy || set.privacy) === 'public' ? new Date(at(it)).toISOString() : null;
        const r = await youtubeUpload(it.file, { title: it.title, caption: it.caption, hashtags: it.hashtags, privacy: it.privacy || set.privacy, madeForKids: it.madeForKids ?? set.madeForKids, categoryId: it.categoryId || set.categoryId, thumbnail: it.thumb }, { schedule: pub });
        patch({ state: 'done', url: r.url, videoId: r.id, publishAt: pub, warnings: r.warnings, error: null });
        notify('AI Video Studio · YouTube', `Đã tải lên “${(it.title || '').slice(0, 50)}”${pub ? ' — YouTube sẽ công khai lúc ' + fmtVN(pub) : ''}`);
        res.uploaded.push({ id: it.id, url: r.url, publishAt: pub });
      } catch (e) {
        const msg = e.message || String(e), retry = !e.fatal && (it.attempts || 0) + 1 < 5;
        // retryable → back to "planned" with the error shown; quota errors wait an hour, others 5 minutes
        patch({ state: retry ? 'planned' : 'error', error: msg + (retry ? ' (sẽ tự thử lại)' : ''), retryAfter: retry ? new Date(T.getTime() + (e.code === 'quota' ? 60 : 5) * 60e3).toISOString() : null });
        notify('AI Video Studio · lỗi YouTube', msg.slice(0, 120));
        res.errors.push({ id: it.id, error: msg });
        if (e.code === 'reconnect' || e.code === 'quota') break;
      }
    }
    // 3) nền tảng khác: đến giờ → thông báo + mở trang đăng + hiện file + chép caption (mỗi lượt 1 mục để clipboard không bị đè)
    const due = loadSchedule().items.filter(x => x.state === 'planned' && x.platform !== 'youtube' && at(x) <= T).sort((a, b) => at(a) - at(b));
    if (due.length) { await remind(due[0], T, null, due.length - 1); res.reminded.push(due[0].id); res.pending = due.length - 1; }
  } finally { releaseLock(lock); }
  writePrivate(F('publish_last_run.json'), res);
  return res;
}
async function remind(it, T, note, more = 0) {
  const P = PLATFORMS[it.platform], text = postText(it);
  const copied = await pbcopy(text);
  notify(`AI Video Studio · đến giờ đăng ${P.name}`, `“${(it.title || path.basename(it.file)).slice(0, 50)}” — caption đã chép, dán vào ô mô tả.${more ? ` Còn ${more} mục nữa.` : ''}`);
  openURL(P.url); if (fs.existsSync(it.file)) reveal(it.file);
  mutate(s => { const x = s.items.find(y => y.id === it.id); if (x) Object.assign(x, { state: 'reminded', remindedAt: T.toISOString(), url: P.url, error: note || null, copied }); });
}

// ---------- YouTube: OAuth (installed app, PKCE, loopback) ----------
const API = () => (process.env.AVS_YT_API || 'https://www.googleapis.com').replace(/\/$/, '');
const TOKEN_URI = () => process.env.AVS_YT_TOKEN_URI || 'https://oauth2.googleapis.com/token';
const AUTH_URI = () => process.env.AVS_YT_AUTH_URI || 'https://accounts.google.com/o/oauth2/v2/auth';
const REVOKE_URI = () => process.env.AVS_YT_REVOKE_URI || 'https://oauth2.googleapis.com/revoke';
export const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];
class YtError extends Error { constructor(msg, code, fatal = true) { super(msg); this.code = code; this.fatal = fatal; } }
const RECONNECT = 'Kết nối YouTube đã hết hạn hoặc bị thu hồi. Mở Studio → Lịch đăng → “Kết nối YouTube” để kết nối lại.';

export const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function pkce(verifier) {
  verifier = verifier || b64url(crypto.randomBytes(48)); // 64 ký tự [A-Za-z0-9-_] (RFC 7636: 43–128)
  return { verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), method: 'S256' };
}
export function buildAuthUrl({ clientId, redirectUri, challenge, state, scopes = SCOPES }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopes.join(' '), code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' });
  return `${AUTH_URI()}?${q}`;
}
export function saveClient(jsonText) {
  let j; try { j = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText; } catch { throw new Error('File client không phải JSON hợp lệ. Hãy tải lại file JSON từ Google Cloud Console (nút Download JSON).'); }
  if (j?.web) throw new Error('Đây là OAuth client loại “Web application”. Hãy tạo loại “Desktop app” (Ứng dụng dành cho máy tính) rồi tải JSON của nó.');
  const c = j?.installed || j;
  if (!c?.client_id || !/\.apps\.googleusercontent\.com$/.test(c.client_id)) throw new Error('Thiếu client_id hợp lệ (dạng …apps.googleusercontent.com).');
  if (!c.client_secret) throw new Error('Thiếu client_secret trong file JSON.');
  writePrivate(F('youtube_client.json'), { installed: { client_id: c.client_id, client_secret: c.client_secret, project_id: c.project_id || '' } });
  return { client_id: maskId(c.client_id), project_id: c.project_id || '' };
}
const maskId = id => id ? id.replace(/^(\d{4})\d*(-.{4}).*(\.apps\.googleusercontent\.com)$/, '$1…$2…$3') : '';
const loadClient = () => readJSON(F('youtube_client.json'), null)?.installed || null;
const loadToken = () => readJSON(F('youtube_token.json'), null);
export const ytConnected = () => !!loadToken()?.refresh_token && !!loadClient();

function request(method, url, { headers = {}, body, timeout = 120000 } = {}) {
  return new Promise((ok, bad) => {
    const u = new URL(url), mod = u.protocol === 'https:' ? https : http;
    const h = { ...headers }; if (body != null && h['Content-Length'] == null) h['Content-Length'] = Buffer.byteLength(body);
    const rq = mod.request(u, { method, headers: h }, res => {
      const bufs = []; res.on('data', d => bufs.push(d));
      res.on('end', () => { const text = Buffer.concat(bufs).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch {} ok({ status: res.statusCode, headers: res.headers, text, json }); });
      res.on('error', bad);
    });
    rq.setTimeout(timeout, () => rq.destroy(new Error('Hết thời gian chờ mạng')));
    rq.on('error', bad);
    if (body != null) rq.end(body); else rq.end();
  });
}
const form = o => new URLSearchParams(o).toString();
async function tokenCall(params) {
  const r = await request('POST', TOKEN_URI(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(params), timeout: 30000 });
  if (r.status === 200 && r.json?.access_token) return r.json;
  const err = r.json?.error || r.status;
  if (err === 'invalid_grant' || err === 'unauthorized_client') throw new YtError(RECONNECT, 'reconnect');
  if (err === 'invalid_client') throw new YtError('OAuth client không hợp lệ (client_id/secret sai hoặc đã bị xoá). Tải lại file JSON “Desktop app” và kết nối lại.', 'reconnect');
  throw new YtError(`Google từ chối cấp token (${err}${r.json?.error_description ? ': ' + r.json.error_description : ''})`, 'auth', false);
}
function storeToken(tok, extra = {}) {
  const old = loadToken() || {};
  const t = { ...old, ...extra, access_token: tok.access_token, refresh_token: tok.refresh_token || old.refresh_token, scope: tok.scope || old.scope, token_type: tok.token_type || 'Bearer', expires_at: Date.now() + (tok.expires_in || 3600) * 1000, updated: new Date().toISOString() };
  writePrivate(F('youtube_token.json'), t); return t;
}
export async function accessToken(force = false) {
  const c = loadClient(), t = loadToken();
  if (!c || !t?.refresh_token) throw new YtError('Chưa kết nối YouTube. Mở Studio → Lịch đăng → “Kết nối YouTube”.', 'reconnect');
  if (!force && t.access_token && t.expires_at > Date.now() + 60e3) return t.access_token;
  return storeToken(await tokenCall({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: c.client_id, client_secret: c.client_secret })).access_token;
}

let FLOW = null; // one pending consent at a time
// Starts the loopback listener and returns the consent URL; `done` resolves with {channel} once Google redirects back.
export async function startYoutubeAuth({ open = true, timeoutMs = 5 * 60e3 } = {}) {
  const c = loadClient(); if (!c) throw new Error('Chưa có OAuth client. Bước 1: dán/tải file JSON “Desktop app” vào.');
  if (FLOW) FLOW.close('Đã bắt đầu lượt kết nối mới');
  const { verifier, challenge } = pkce(), state = b64url(crypto.randomBytes(16));
  let resolve, reject; const done = new Promise((a, b) => ((resolve = a), (reject = b)));
  const page = (title, msg, ok) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;background:#0B0C0F;color:#E8EAEE;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;max-width:520px"><div style="font-size:42px">${ok ? '✅' : '⚠️'}</div><h2>${title}</h2><p style="color:#A9AFBA">${msg}</p></div>`;
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname !== '/') { res.writeHead(404); return res.end(); }
    const send = (code, html) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); };
    if (u.searchParams.get('state') !== state) return send(400, page('Sai mã state', 'Yêu cầu không khớp lượt kết nối hiện tại. Bấm “Kết nối YouTube” lại.', false));
    if (u.searchParams.get('error')) { send(400, page('Chưa kết nối', `Google báo: ${u.searchParams.get('error')}. Bạn có thể đóng tab này và thử lại.`, false)); return finish(new Error(u.searchParams.get('error') === 'access_denied' ? 'Bạn đã từ chối quyền (hoặc tài khoản chưa được thêm vào “Test users”).' : 'Google báo lỗi: ' + u.searchParams.get('error'))); }
    const code = u.searchParams.get('code'); if (!code) return send(400, page('Thiếu mã', 'Không nhận được mã xác thực.', false));
    try {
      const tok = await tokenCall({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: c.client_id, client_secret: c.client_secret });
      if (!tok.refresh_token) throw new Error('Google không trả refresh token. Vào myaccount.google.com/permissions gỡ quyền ứng dụng rồi kết nối lại.');
      storeToken(tok, { created: new Date().toISOString(), client_id: c.client_id });
      let channel = null;
      try { channel = await ytChannel(tok.access_token); } catch {}
      storeToken({ access_token: tok.access_token, expires_in: tok.expires_in }, { channel });
      send(200, page('Đã kết nối YouTube', `Kênh: <b>${(channel?.title || '(chưa đọc được tên kênh)').replace(/</g, '&lt;')}</b>. Đóng tab này và quay lại AI Video Studio.`, true));
      finish(null, { channel });
    } catch (e) { send(500, page('Kết nối thất bại', String(e.message).replace(/</g, '&lt;'), false)); finish(e); }
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const redirectUri = `http://127.0.0.1:${srv.address().port}`;
  const url = buildAuthUrl({ clientId: c.client_id, redirectUri, challenge, state });
  const timer = setTimeout(() => finish(new Error('Hết 5 phút chờ xác nhận trên trình duyệt. Bấm “Kết nối YouTube” lại.')), timeoutMs);
  function finish(err, val) { clearTimeout(timer); setTimeout(() => srv.close(), 300); if (FLOW?.state === state) FLOW = null; err ? reject(err) : resolve(val); }
  FLOW = { state, url, close: msg => finish(new Error(msg)) };
  done.catch(() => {});
  if (open) openURL(url);
  return { url, redirectUri, done };
}
export async function ytChannel(tokenStr) {
  const r = await request('GET', `${API()}/youtube/v3/channels?part=snippet&mine=true`, { headers: { Authorization: 'Bearer ' + (tokenStr || await accessToken()) }, timeout: 30000 });
  addQuota(QUOTA.list);
  const ch = r.json?.items?.[0]; return ch ? { id: ch.id, title: ch.snippet?.title || '' } : null;
}
export function ytStatus() {
  const c = loadClient(), t = loadToken(), q = readJSON(F('youtube_quota.json'), {}), today = pacificDay(Date.now());
  return { hasClient: !!c, client_id: maskId(c?.client_id), connected: !!(c && t?.refresh_token), channel: t?.channel || null, connectedAt: t?.created || null,
    quota: { day: today, used: q.day === today ? q.used : 0, daily: QUOTA.daily, upload: QUOTA.upload, uploadsLeft: Math.floor((QUOTA.daily - (q.day === today ? q.used : 0)) / QUOTA.upload) }, pending: !!FLOW };
}
export async function ytDisconnect({ forgetClient = false } = {}) {
  const t = loadToken();
  if (t?.refresh_token) { try { await request('POST', REVOKE_URI(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ token: t.refresh_token }), timeout: 8000 }); } catch {} }
  fs.rmSync(F('youtube_token.json'), { force: true });
  if (forgetClient) fs.rmSync(F('youtube_client.json'), { force: true });
  return { ok: true };
}
function addQuota(n) { const f = F('youtube_quota.json'), d = pacificDay(Date.now()), q = readJSON(f, {}); writePrivate(f, { day: d, used: (q.day === d ? q.used : 0) + n }); }

// ---------- YouTube: resumable upload ----------
function probe(file) {
  return new Promise(ok => execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height:stream_tags=rotate', '-of', 'json', file], (e, out) => {
    if (e) return ok(null);
    try { const j = JSON.parse(out), v = j.streams.find(s => s.codec_type === 'video'); const rot = Math.abs(+(v?.tags?.rotate || 0)) % 180 === 90; ok({ dur: +j.format.duration, w: rot ? v?.height : v?.width, h: rot ? v?.width : v?.height }); } catch { ok(null); }
  }));
}
const noAngle = s => String(s || '').replace(/[<>]/g, '');
const cut = (s, n) => [...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s;
// Build the videos.insert resource (title ≤ 100, description ≤ 5000 bytes, tags ≤ 500 chars, #Shorts for short vertical video).
export function ytResource(meta, { info, schedule } = {}) {
  const tagsH = cleanTags(meta.tags || meta.hashtags || []);
  let title = noAngle(meta.title || '').trim() || 'Video';
  let desc = noAngle(meta.description ?? [meta.caption || '', tagsH.join(' ')].filter(Boolean).join('\n\n')).trim();
  const shorts = !!(info && info.h > info.w && info.dur <= 180);
  if (shorts && !/#shorts/i.test(title + ' ' + desc)) { if ([...title].length + 8 <= 100) title += ' #Shorts'; else desc = (desc + '\n#Shorts').trim(); }
  title = cut(title, 100);
  while (Buffer.byteLength(desc) > 5000) desc = [...desc].slice(0, -50).join('');
  const tags = []; let len = 0;
  for (const t of tagsH.map(x => x.slice(1))) { const add = t.length + (t.includes(' ') ? 2 : 0) + (tags.length ? 1 : 0); if (len + add > 480) break; tags.push(t); len += add; }
  const privacy = meta.privacyStatus || meta.privacy || 'public';
  const status = { privacyStatus: schedule ? 'private' : privacy, selfDeclaredMadeForKids: !!meta.madeForKids, embeddable: true };
  if (schedule) status.publishAt = parseWhen(schedule).toISOString();
  return { snippet: { title, description: desc, tags, categoryId: String(meta.categoryId || '22'), defaultLanguage: meta.language || 'vi', defaultAudioLanguage: meta.language || 'vi' }, status, _shorts: shorts };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RETRY = new Set([500, 502, 503, 504, 429]);
function apiError(r, what) {
  const reason = r.json?.error?.errors?.[0]?.reason || r.json?.error?.status || '', msg = r.json?.error?.message || r.text?.slice(0, 200) || '';
  if (/quotaExceeded|dailyLimitExceeded/.test(reason)) return new YtError('Đã hết quota YouTube API hôm nay (mỗi video tốn ~1 600/10 000 đơn vị). Quota đặt lại lúc 0h giờ Thái Bình Dương (~14–15h giờ VN). Lịch sẽ thử lại sau.', 'quota', false);
  if (/uploadLimitExceeded/.test(reason)) return new YtError('Kênh đã chạm giới hạn số video tải lên trong ngày của YouTube. Thử lại ngày mai.', 'quota', false);
  if (r.status === 401) return new YtError(RECONNECT, 'reconnect');
  if (r.status === 403 && /insufficientPermissions|forbidden|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(reason + msg)) return new YtError('Tài khoản chưa cấp quyền tải video (youtube.upload) hoặc chưa có kênh. Kết nối lại và tick đủ quyền.', 'reconnect');
  if (/youtubeSignupRequired/.test(reason)) return new YtError('Tài khoản Google này chưa tạo kênh YouTube. Tạo kênh rồi thử lại.', 'reconnect');
  if (/invalidPublishAt/.test(reason)) return new YtError('Giờ đăng hẹn (publishAt) không hợp lệ — phải ở tương lai.', 'bad');
  return new YtError(`YouTube từ chối ${what} (HTTP ${r.status}${reason ? ' ' + reason : ''}): ${msg}`, 'bad', !RETRY.has(r.status));
}
export async function youtubeUpload(file, meta = {}, { schedule, thumb, onProgress = progress } = {}) {
  file = path.resolve(file); if (!fs.existsSync(file)) throw new YtError('Không thấy file video: ' + file, 'bad');
  const st = fs.statSync(file), size = st.size, info = await probe(file);
  const resource = ytResource(meta, { info, schedule }); const shorts = resource._shorts; delete resource._shorts;
  const CH = Math.max(256 * 1024, Math.floor((+process.env.AVS_YT_CHUNK || 8 * 1024 * 1024) / (256 * 1024)) * 256 * 1024);
  const BACK = +process.env.AVS_YT_BACKOFF_MS || 1000;
  const sessFile = path.join(HOME(), 'uploads', crypto.createHash('sha1').update(`${file}|${size}|${st.mtimeMs}|${resource.snippet.title}`).digest('hex').slice(0, 16) + '.json');
  let token = await accessToken(), retries = 0, refreshed = false, restarted = false;
  const auth = () => ({ Authorization: 'Bearer ' + token });
  const backoff = async why => {
    if (++retries > 10) throw new YtError('Mạng/YouTube lỗi liên tục, đã thử 10 lần: ' + why, 'net', false);
    const ms = Math.min(BACK * 2 ** (retries - 1), 64000) * (0.75 + Math.random() * 0.5);
    onProgress(off / size, `Lỗi tạm thời (${why}) — thử lại sau ${(ms / 1000).toFixed(1)}s (lần ${retries}/10)`); await sleep(ms);
  };
  const on401 = async () => { if (refreshed) throw new YtError(RECONNECT, 'reconnect'); refreshed = true; token = await accessToken(true); };
  let off = 0, uri = null, result = null;
  const sess = readJSON(sessFile, null);
  if (sess?.uri && Date.now() - Date.parse(sess.created) < 6 * 864e5) { uri = sess.uri; onProgress(0, 'Tìm thấy phiên tải dở — hỏi YouTube đã nhận bao nhiêu…'); }
  const init = async () => {
    onProgress(0, 'Khởi tạo phiên tải lên YouTube…');
    for (;;) {
      let r; try { r = await request('POST', `${API()}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, { headers: { ...auth(), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/*' }, body: JSON.stringify(resource), timeout: 60000 }); }
      catch (e) { await backoff(e.message); continue; }
      if (r.status === 200 && r.headers.location) { addQuota(QUOTA.upload); uri = r.headers.location; writePrivate(sessFile, { uri, file, created: new Date().toISOString() }); off = 0; return; }
      if (r.status === 401) { await on401(); continue; }
      const e = apiError(r, 'khởi tạo'); if (RETRY.has(r.status) && e.code === 'bad') { await backoff('HTTP ' + r.status); continue; } throw e;
    }
  };
  // ask the server how much it has (Content-Range: bytes */size) → 308 Range / 200|201 done / 404|410 expired
  const query = async () => {
    for (;;) {
      let r; try { r = await request('PUT', uri, { headers: { ...auth(), 'Content-Range': `bytes */${size}`, 'Content-Length': '0' }, body: '', timeout: 60000 }); }
      catch (e) { await backoff(e.message); continue; }
      if (r.status === 308) { const m = /bytes=0-(\d+)/.exec(r.headers.range || ''); off = m ? +m[1] + 1 : 0; return; }
      if (r.status === 200 || r.status === 201) { result = r.json; return; }
      if (r.status === 404 || r.status === 410) { if (restarted) throw new YtError('Phiên tải lên hết hạn hai lần liên tiếp', 'bad', false); restarted = true; fs.rmSync(sessFile, { force: true }); return init(); }
      if (r.status === 401) { await on401(); continue; }
      if (RETRY.has(r.status)) { await backoff('HTTP ' + r.status); continue; }
      throw apiError(r, 'kiểm tra phiên');
    }
  };
  if (uri) await query(); else await init();
  const fd = fs.openSync(file, 'r');
  try {
    while (!result) {
      const n = Math.min(CH, size - off), buf = Buffer.alloc(n); fs.readSync(fd, buf, 0, n, off);
      onProgress(off / size, `Đang tải lên YouTube ${(off / 1048576).toFixed(1)}/${(size / 1048576).toFixed(1)} MB`);
      let r; try { r = await request('PUT', uri, { headers: { ...auth(), 'Content-Type': 'video/*', 'Content-Length': String(n), 'Content-Range': `bytes ${off}-${off + n - 1}/${size}` }, body: buf, timeout: 300000 }); }
      catch (e) { await backoff(e.message); await query(); continue; }
      if (r.status === 308) { const m = /bytes=0-(\d+)/.exec(r.headers.range || ''); off = m ? +m[1] + 1 : 0; retries = 0; continue; }
      if (r.status === 200 || r.status === 201) { result = r.json; break; }
      if (r.status === 404 || r.status === 410) { await query(); continue; }
      if (r.status === 401) { await on401(); await query(); continue; }
      if (RETRY.has(r.status)) { await backoff('HTTP ' + r.status); await query(); continue; }
      throw apiError(r, 'tải lên');
    }
  } finally { fs.closeSync(fd); }
  if (!result?.id) throw new YtError('YouTube không trả về ID video', 'bad', false);
  fs.rmSync(sessFile, { force: true });
  const warnings = [];
  if (result.status?.uploadStatus === 'rejected' || result.status?.uploadStatus === 'failed') warnings.push('YouTube báo ' + result.status.uploadStatus + ': ' + (result.status.rejectionReason || result.status.failureReason || ''));
  if (thumb || meta.thumbnail) {
    const tf = path.resolve(thumb || meta.thumbnail);
    if (!fs.existsSync(tf)) warnings.push('Không thấy ảnh bìa ' + tf);
    else if (fs.statSync(tf).size > 2 * 1048576) warnings.push('Ảnh bìa > 2 MB, YouTube không nhận — bỏ qua');
    else {
      onProgress(0.99, 'Đặt ảnh bìa…');
      const r = await request('POST', `${API()}/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(result.id)}&uploadType=media`, { headers: { ...auth(), 'Content-Type': /\.png$/i.test(tf) ? 'image/png' : 'image/jpeg' }, body: fs.readFileSync(tf), timeout: 60000 }).catch(e => ({ status: 0, text: e.message }));
      addQuota(QUOTA.thumbnail);
      if (r.status !== 200) warnings.push(r.status === 403 ? 'Chưa đặt được ảnh bìa: kênh cần xác minh số điện thoại (youtube.com/verify) để dùng ảnh bìa tuỳ chỉnh.' : `Chưa đặt được ảnh bìa (HTTP ${r.status})`);
    }
  }
  onProgress(1, 'Đã tải lên YouTube');
  return { id: result.id, url: (shorts ? 'https://youtube.com/shorts/' : 'https://youtu.be/') + result.id, studio: `https://studio.youtube.com/video/${result.id}/edit`, privacy: resource.status.privacyStatus, publishAt: resource.status.publishAt || null, title: resource.snippet.title, shorts, warnings };
}

// ---------- CLI ----------
function cliArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2), v = argv[i + 1]; if (v == null || v.startsWith('--')) o[k] = true; else { o[k] = v; i++; } } else o._.push(a); }
  return o;
}
const ICON = { planned: '○', uploading: '↑', done: '✓', reminded: '🔔', error: '✗' };
async function main() {
  const [cmd, ...rest] = process.argv.slice(2), a = cliArgs(rest);
  const out = o => console.log(JSON.stringify(o, null, a.pretty ? 1 : 0));
  switch (cmd) {
    case 'schedule-list': {
      const s = loadSchedule(), items = s.items.filter(x => a.all || !['done', 'reminded'].includes(x.state) || Date.parse(x.when) > now() - 7 * 864e5).sort((x, y) => Date.parse(x.when) - Date.parse(y.when));
      if (a.json) return out({ settings: s.settings, items });
      if (!items.length) return console.log('(lịch trống)');
      for (const it of items) console.log(`${ICON[it.state] || '?'} ${it.id}  ${fmtVN(it.when)}  ${PLATFORMS[it.platform].name.padEnd(9)} ${it.state.padEnd(9)} ${(it.title || path.basename(it.file)).slice(0, 60)}${it.url ? '  ' + it.url : ''}${it.error ? '  ⚠ ' + it.error : ''}`);
      return console.log(`Khung giờ đăng: ${s.settings.slots.join(', ')} (giờ Việt Nam)`);
    }
    case 'schedule-add': {
      const plats = String(a.platform || '').split(',').filter(Boolean); if (!plats.length) throw new Error('Thiếu --platform');
      const meta = a.meta ? JSON.parse(fs.existsSync(a.meta) ? fs.readFileSync(a.meta, 'utf8') : a.meta) : {};
      const r = plats.map(p => { const cap = captionsFor(a.file, p); return addItem({ ...cap, ...meta, file: a.file, platform: p, when: a.when, project: a.project, ...(a.title ? { title: a.title } : {}), ...(a.caption ? { caption: a.caption } : {}), ...(a.hashtags ? { hashtags: a.hashtags } : {}), ...(a.privacy ? { privacy: a.privacy } : {}) }); });
      return out(r);
    }
    case 'schedule-update': { const o = {}; for (const k of ['when', 'title', 'caption', 'hashtags', 'privacy', 'state', 'platform', 'file']) if (a[k] != null) o[k] = a[k]; return out(updateItem(a._[0], o)); }
    case 'schedule-remove': removeItem(a._[0]); return out({ ok: true, removed: a._[0] });
    case 'schedule-settings': return out(setSettings({ slots: a.slots, remindMin: a.remind, ytLeadMin: a.lead, privacy: a.privacy }));
    case 'schedule-auto': return out(autoSchedule(String(a.files || '').split(',').filter(Boolean), String(a.platforms || 'youtube').split(','), { from: a.from }));
    case 'run-due': { const r = await runDue(); return a.json ? out(r) : console.log(`run-due ${r.skipped ? 'bỏ qua (đang khoá)' : `lúc ${fmtVN(r.now)}: nhắc trước ${r.preReminded.length}, nhắc đăng ${r.reminded.length}, tải YouTube ${r.uploaded.length}, lỗi ${r.errors.length}${r.pending ? `, còn ${r.pending} mục chờ lượt sau` : ''}`}`); }
    case 'youtube-client': { if (!a._[0]) throw new Error('Cần đường dẫn file JSON client'); return out(saveClient(fs.readFileSync(a._[0], 'utf8'))); }
    case 'youtube-auth': {
      const { url, done } = await startYoutubeAuth({ open: !a['no-open'] });
      console.log('Mở link này trong trình duyệt (đã tự mở) và chọn tài khoản có kênh YouTube:\n' + url);
      const r = await done; return console.log(`Đã kết nối YouTube${r.channel ? ': ' + r.channel.title : ''}. Token lưu ở ${F('youtube_token.json')} (quyền 600).`);
    }
    case 'youtube-status': return out(ytStatus());
    case 'youtube-disconnect': return out(await ytDisconnect({ forgetClient: !!a['forget-client'] }));
    case 'youtube-upload': {
      if (!a._[0]) throw new Error('Cần file MP4');
      const meta = a.meta ? JSON.parse(fs.existsSync(a.meta) ? fs.readFileSync(a.meta, 'utf8') : a.meta) : {};
      const r = await youtubeUpload(a._[0], meta, { schedule: a.schedule, thumb: a.thumb });
      if (a.out) writePrivate(path.resolve(a.out), r);
      return out(r);
    }
    default:
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 18).map(l => l.slice(3)).join('\n'));
      if (cmd) process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(() => { if (!FLOW) setTimeout(() => process.exit(process.exitCode || 0), 50); }).catch(e => { console.error('Lỗi: ' + (e.message || e)); process.exit(1); });
}
