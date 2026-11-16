// Lịch đăng + Kết nối YouTube (scripts/publish.mjs làm phần việc thật). Lịch dùng chung cho mọi dự án: ~/.ai-video-studio/schedule.json.
// Có hẹn giờ dự phòng: mỗi 60 s chạy `publish.mjs run-due` (khoá chung publish.lock với hàng đợi Tự lái, nên không bao giờ chạy trùng).
// Tắt bằng AVS_NO_SCHEDULE_TIMER=1. Spec: references/publish-schedule.md
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import * as PUB from '../../scripts/publish.mjs';
import { revealPath } from '../../scripts/platform.mjs';

const VID = /\.(mp4|mov|m4v|webm)$/i;
export default ctx => {
  const CLI = path.join(ctx.SKILL, 'scripts/publish.mjs');
  const RUN = { child: null, step: '', last: null, auth: null };
  function runDue(manual) {
    if (RUN.child) return false;
    const s = PUB.loadSchedule();
    if (!manual && !s.items.some(x => x.state === 'planned' || x.state === 'uploading')) return false;
    const ch = spawn('node', [CLI, 'run-due', '--json'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    RUN.child = ch; RUN.step = 'Đang kiểm tra lịch…'; let out = '', err = '';
    ch.stdout.on('data', d => { out += d; const m = String(d).match(/@@ [\d.]+ (.*)/g); if (m) RUN.step = m.pop().replace(/^@@ [\d.]+ /, ''); });
    ch.stderr.on('data', d => (err += d));
    ch.on('close', code => { RUN.child = null; RUN.step = ''; try { RUN.last = JSON.parse(out.trim().split('\n').pop()); } catch { RUN.last = { error: (err || out).trim().slice(-300) || 'run-due lỗi ' + code }; } RUN.last.at = new Date().toISOString(); });
    return true;
  }
  if (process.env.AVS_NO_SCHEDULE_TIMER !== '1') setInterval(() => { try { runDue(false); } catch (e) { console.error('schedule timer:', e.message); } }, 60e3).unref();

  const durCache = new Map();
  const probe = f => new Promise(ok => {
    const k = f + fs.statSync(f).mtimeMs; if (durCache.has(k)) return ok(durCache.get(k));
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-select_streams', 'v:0', '-of', 'json', f], (e, o) => {
      let r = null; try { const j = JSON.parse(o); r = { dur: +(+j.format.duration).toFixed(1), w: j.streams[0]?.width, h: j.streams[0]?.height }; } catch {}
      durCache.set(k, r); ok(r);
    });
  });
  // finished videos: current project's out/ + outputs of the Autopilot queue (A1, if present) + files already in the schedule
  async function videos() {
    const seen = new Map(), add = (f, src) => { f = path.resolve(f); if (VID.test(f) && !/\.part\./.test(f) && fs.existsSync(f) && !seen.has(f)) seen.set(f, { file: f, src, name: path.basename(f), project: PUB.projectOf(f), mtime: fs.statSync(f).mtimeMs }); };
    const outDir = d => { const o = path.join(d, 'out'); if (fs.existsSync(o)) for (const x of fs.readdirSync(o)) add(path.join(o, x), path.basename(d)); };
    if (ctx.project) outDir(ctx.project.dir);
    try {
      const q = JSON.parse(fs.readFileSync(path.join(PUB.HOME(), 'queue.json'), 'utf8')); const items = Array.isArray(q) ? q : q.items || [];
      for (const it of items.filter(x => x.state === 'done')) for (const o of it.outputs || []) { if (VID.test(o)) add(o, 'Tự lái'); else if (fs.existsSync(path.join(o, 'out'))) outDir(o); }
    } catch {}
    for (const it of PUB.loadSchedule().items) add(it.file, 'Lịch');
    const list = [...seen.values()].sort((a, b) => b.mtime - a.mtime).slice(0, 80);
    for (const v of list) { v.info = await probe(v.file); v.scheduled = [...new Set(PUB.loadSchedule().items.filter(x => x.file === v.file && x.state !== 'error').map(x => x.platform))]; v.hasCaptions = !!(v.project && fs.existsSync(path.join(v.project, 'publish/publish.json'))); }
    return list;
  }
  const resolveFile = f => { if (!f) return null; if (path.isAbsolute(f)) return f; return ctx.project ? ctx.under(ctx.project.dir, f) : null; };
  const view = () => {
    const s = PUB.loadSchedule();
    return { now: PUB.now().toISOString(), settings: s.settings, items: s.items.sort((a, b) => Date.parse(a.when) - Date.parse(b.when)).map(x => ({ ...x, name: path.basename(x.file || ''), exists: !!x.file && fs.existsSync(x.file) })),
      platforms: Object.fromEntries(Object.entries(PUB.PLATFORMS).map(([k, v]) => [k, v.name])), youtube: { ...PUB.ytStatus(), authError: RUN.auth?.error || null }, run: { busy: !!RUN.child, step: RUN.step, last: RUN.last } };
  };

  return async (req, res, p, u) => {
    if (!p.startsWith('/api/schedule') && !p.startsWith('/api/youtube')) return false;
    const J = (o, c) => (ctx.json(res, o, c), true);
    try {
      if (req.method === 'GET') {
        if (p === '/api/schedule') return J(view());
        if (p === '/api/schedule/videos') return J(await videos());
        if (p === '/api/schedule/captions') { const f = resolveFile(u.searchParams.get('file')); return J(f ? PUB.captionsFor(f, u.searchParams.get('platform') || 'tiktok') : {}); }
        if (p === '/api/youtube/status') return J({ ...PUB.ytStatus(), authError: RUN.auth?.error || null });
        if (p === '/api/schedule/poster') {
          // small poster frame for the calendar cards
          const f = resolveFile(u.searchParams.get('file')); if (!f || !fs.existsSync(f)) return J({ error: 'không thấy' }, 404);
          const dir = path.join(PUB.HOME(), 'cache/posters'); fs.mkdirSync(dir, { recursive: true });
          const out = path.join(dir, Buffer.from(f).toString('base64url').slice(-60) + '_' + Math.round(fs.statSync(f).mtimeMs) + '.jpg');
          if (!fs.existsSync(out)) await new Promise(ok => execFile('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', f, '-frames:v', '1', '-vf', 'scale=160:-2', out], ok));
          if (!fs.existsSync(out)) return J({ error: 'không tạo được ảnh' }, 500);
          ctx.sendFile(req, res, out); return true;
        }
        return false;
      }
      if (req.method !== 'POST') return false;
      const b = await ctx.body(req);
      if (p === '/api/schedule/add') {
        const file = resolveFile(b.file || b.video); if (!file || !fs.existsSync(file)) return J({ error: 'Không thấy file video' }, 400);
        const plats = [].concat(b.platforms || b.platform || []); if (!plats.length) return J({ error: 'Chọn nền tảng' }, 400);
        const items = plats.map(k => { const per = b.perPlatform?.[k] || {}, cap = PUB.captionsFor(file, k); return PUB.addItem({ ...cap, ...pick(b), ...pick(per), file, platform: k, when: b.when }); });
        return J({ ok: true, items });
      }
      if (p === '/api/schedule/update') return J({ ok: true, item: PUB.updateItem(b.id, pick(b, true)) });
      if (p === '/api/schedule/remove') { PUB.removeItem(b.id); return J({ ok: true }); }
      if (p === '/api/schedule/settings') return J({ ok: true, settings: PUB.setSettings(b) });
      if (p === '/api/schedule/auto') return J({ ok: true, items: PUB.autoSchedule((b.files || []).map(resolveFile).filter(Boolean), b.platforms || [], { from: b.from }) });
      if (p === '/api/schedule/run') return J(runDue(true) ? { ok: true } : { error: 'Đang chạy rồi' });
      if (p === '/api/schedule/reveal') { const it = PUB.loadSchedule().items.find(x => x.id === b.id); if (it && fs.existsSync(it.file)) revealPath(it.file); return J({ ok: !!it }); }
      if (p === '/api/schedule/copy') { const it = PUB.loadSchedule().items.find(x => x.id === b.id); return J(it ? { text: PUB.postText(it) } : { error: 'không thấy' }); }
      if (p === '/api/youtube/client') return J({ ok: true, ...PUB.saveClient(b.json) });
      if (p === '/api/youtube/connect') {
        const { url, done } = await PUB.startYoutubeAuth({ open: b.open !== false });
        RUN.auth = { pending: true };
        done.then(r => (RUN.auth = { ok: true, channel: r.channel })).catch(e => (RUN.auth = { error: e.message }));
        return J({ ok: true, url });
      }
      if (p === '/api/youtube/check') { const ch = await PUB.ytChannel(); return J({ ok: true, channel: ch }); }
      if (p === '/api/youtube/disconnect') { RUN.auth = null; return J(await PUB.ytDisconnect({ forgetClient: !!b.forgetClient })); }
      return false;
    } catch (e) { return J({ error: e.message }, 400); }
  };
};
function pick(o, all) {
  const r = {};
  for (const k of ['title', 'caption', 'hashtags', 'privacy', 'thumb', 'first_comment', 'madeForKids', 'categoryId', ...(all ? ['when', 'platform', 'file', 'state'] : [])]) if (o[k] != null) r[k] = o[k];
  return r;
}
