// Tự lái (references/autopilot.md): queue lane inside the Studio server (its own lane — never uses the interactive job slot),
// watch folders, channel profiles, "Học từ chỉnh sửa".
//   GET  /api/autopilot/state                → {items, runner, settings, profiles, steps, kinds, learn}
//   POST /api/autopilot/enqueue {input, kind?, profile?, out?, opts?}
//   POST /api/autopilot/upload?name=&profile= (raw body = the video) → saved in AVS_HOME/autopilot/inbox, queued
//   POST /api/autopilot/item {id, action: cancel|retry|remove|up|down|reveal|open}
//   POST /api/autopilot/clear · /settings {…} · /agent {on} · /profile {action: save|duplicate|delete|default|reset, …} · /learn
// Env AVS_NO_QUEUE=1 → no runner in this server (UI still edits the queue; `node scripts/queue.mjs run` executes it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Runner, AVS_HOME, KINDS, loadQueue, addItem, cancelItem, retryItem, removeItem, moveItem, clearDone, loadSettings, saveSettings, agentInstall, agentUninstall } from '../../scripts/queue.mjs';
import { loadStore, upsertProfile, duplicateProfile, deleteProfile, setDefault, resetLearned, deriveRules, effectiveProfile, learnFromProject } from '../../scripts/profile.mjs';
import { STEPS } from '../../scripts/autopilot.mjs';
import { openPath, revealPath } from '../../scripts/platform.mjs';

const VIDEO = /\.(mp4|mov|m4v|mkv|webm)$/i;
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export default ctx => {
  const runner = process.env.AVS_NO_QUEUE ? null : new Runner({ role: 'server', daemon: true, log: m => console.log(m) }).start();
  if (runner) for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => runner.stop()); // server.mjs exits after every route has cleaned up (Telegram bot, jobs)
  // "Học từ chỉnh sửa": when the open project was made by Tự lái and the user saved it, compare with what Tự lái delivered.
  let learn = null; const seen = new Map();
  const tryLearn = (force) => {
    const d = ctx.project?.dir; if (!d) return null;
    const ap = rd(path.join(d, '.studio/autopilot.json')); if (!ap || ap.state !== 'done') return null;
    let mt = 0; try { mt = fs.statSync(path.join(d, 'timeline.json')).mtimeMs; } catch { return null; }
    if (!force && seen.get(d) === mt) return null;
    seen.set(d, mt);
    const r = learnFromProject(d);
    if (r.ok || force) learn = { ...r, dir: d, at: new Date().toISOString() };
    return r;
  };
  setInterval(() => { try { tryLearn(false); } catch (e) { console.error('learn:', e.message); } }, 15000).unref();

  const profilesOut = () => {
    const s = loadStore();
    return { default: s.default, list: s.profiles.map(p => { const e = effectiveProfile(p); const r = deriveRules(p.learned); return { ...p, learnedNotes: r.notes, learnedN: r.n, effective: { broll_density: e.broll_density, broll_src: e.broll_src, sound: e.sound, music: e.music, caption_style: e.caption_style, pack: e.pack, ai_density: e.ai_density } }; }) };
  };
  const detail = it => {
    if (!it.project) return it;
    const ap = rd(path.join(it.project, '.studio/autopilot.json'));
    return ap ? { ...it, steps: ap.steps, learnedApplied: ap.learnedApplied } : it;
  };
  const reveal = f => { if (f && fs.existsSync(f)) revealPath(f); return !!f; };

  return async (req, res, p, u) => {
    if (!p.startsWith('/api/autopilot')) return false;
    const J = (o, c) => (ctx.json(res, o, c), true);
    try {
      if (p === '/api/autopilot/state') {
        const q = loadQueue();
        return J({ items: q.items.map(it => (it.state === 'running' || u.searchParams.get('id') === it.id ? detail(it) : it)), runner: runner ? runner.status() : { active: false, disabled: true },
          settings: loadSettings(), profiles: profilesOut(), steps: STEPS.map(([id, label, , req]) => ({ id, label, required: !!req })),
          kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, { name: v.name, ok: fs.existsSync(path.join(ctx.SKILL, 'scripts', v.script)) }])),
          learn, project: ctx.project ? { dir: ctx.project.dir, autopilot: !!rd(path.join(ctx.project.dir, '.studio/autopilot.json')) } : null, home: AVS_HOME });
      }
      if (req.method !== 'POST') return false;
      if (p === '/api/autopilot/upload') {
        const name = path.basename(u.searchParams.get('name') || 'video.mp4').replace(/[^\w.\-À-ỹ ()]+/g, '_');
        if (!VIDEO.test(name)) return J({ error: 'Chỉ nhận tệp video (mp4, mov, m4v, mkv)' }, 400);
        const dir = path.join(AVS_HOME, 'autopilot/inbox'); fs.mkdirSync(dir, { recursive: true });
        const dst = path.join(dir, `${Date.now().toString(36)}_${name}`);
        await new Promise((ok, bad) => { const w = fs.createWriteStream(dst); req.pipe(w); w.on('finish', ok); w.on('error', bad); });
        const it = addItem({ kind: 'autopilot', input: dst, opts: { profile: u.searchParams.get('profile') || undefined }, source: 'upload' });
        it.title = name; return J({ ok: true, item: it });
      }
      const b = await ctx.body(req);
      if (p === '/api/autopilot/enqueue') {
        const kind = b.kind || 'autopilot';
        let input = String(b.input || b.video || '').trim().replace(/^~(?=[\\/])/, os.homedir()).replace(/^"(.*)"$/, '$1');
        if (kind !== 'topic') {
          if (!input) return J({ error: 'Nhập đường dẫn video' }, 400);
          input = path.resolve(input);
          if (!fs.existsSync(input)) return J({ error: `Không thấy ${input}` }, 404);
          if (kind === 'autopilot' && !(VIDEO.test(input) || fs.existsSync(path.join(input, 'timeline.json')))) return J({ error: 'Chỉ nhận tệp video hoặc thư mục dự án' }, 400);
        }
        const opts = { ...(b.opts || {}) }; if (b.profile) opts.profile = b.profile; if (b.out) opts.out = path.resolve(String(b.out).replace(/^~(?=[\\/])/, os.homedir()).replace(/^"(.*)"$/, '$1'));
        return J({ ok: true, item: addItem({ kind, input, opts, source: b.source || 'ui' }) });
      }
      if (p === '/api/autopilot/item') {
        const it = loadQueue().items.find(x => x.id === b.id); if (!it) return J({ error: 'không thấy việc này' }, 404);
        const a = b.action;
        if (a === 'cancel') return J({ ok: cancelItem(it.id) });
        if (a === 'retry') return J({ ok: retryItem(it.id) });
        if (a === 'remove') return J({ ok: removeItem(it.id) });
        if (a === 'up' || a === 'down') return J({ ok: moveItem(it.id, a === 'up' ? -1 : 1) });
        if (a === 'reveal') return J({ ok: reveal(it.outputs?.[0] || it.project || it.input) });
        if (a === 'open') {
          if (!it.project || !fs.existsSync(path.join(it.project, 'timeline.json'))) return J({ error: 'Chưa có dự án để mở' }, 400);
          ctx.openProject(it.project); return J({ ok: true, dir: it.project });
        }
        return J({ error: 'hành động lạ' }, 400);
      }
      if (p === '/api/autopilot/clear') return J({ ok: true, removed: clearDone() });
      if (p === '/api/autopilot/settings') {
        const patch = {};
        for (const k of ['notify', 'appDrop', 'profile']) if (k in b) patch[k] = b[k];
        if (b.watch) patch.watch = b.watch;
        return J({ ok: true, settings: saveSettings(patch) });
      }
      if (p === '/api/autopilot/agent') return J(b.on ? await agentInstall() : await agentUninstall());
      if (p === '/api/autopilot/reveal') {
        const f = path.resolve(String(b.path || '').replace(/^~(?=[\\/])/, os.homedir()).replace(/^"(.*)"$/, '$1'));
        if (b.create) fs.mkdirSync(f, { recursive: true });
        if (!fs.existsSync(f)) return J({ error: 'Thư mục chưa có' }, 404);
        if (!fs.statSync(f).isDirectory() && !/\.(mp4|mov|m4v|mkv|jpe?g|png|txt|srt|json)$/i.test(f)) return J({ error: 'Chỉ mở thư mục hoặc file kết quả' }, 400);
        openPath(f); return J({ ok: true });
      }
      if (p === '/api/autopilot/profile') {
        const a = b.action;
        if (a === 'save') return J({ ok: true, profile: upsertProfile(b.profile || {}), profiles: profilesOut() });
        if (a === 'duplicate') return J({ ok: true, profile: duplicateProfile(b.id), profiles: profilesOut() });
        if (a === 'delete') { deleteProfile(b.id); return J({ ok: true, profiles: profilesOut() }); }
        if (a === 'default') { setDefault(b.id); return J({ ok: true, profiles: profilesOut() }); }
        if (a === 'reset') { resetLearned(b.id); return J({ ok: true, profiles: profilesOut() }); }
        return J({ error: 'hành động lạ' }, 400);
      }
      if (p === '/api/autopilot/learn') { const r = tryLearn(true); return J(r ? { ...r, profiles: profilesOut() } : { ok: false, why: 'Dự án đang mở không phải do Tự lái làm (hoặc chưa chạy xong)' }); }
    } catch (e) { return J({ error: e.message }, 500); }
    return false;
  };
};
