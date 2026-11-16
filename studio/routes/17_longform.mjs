// "Video dài / Chủ đề" (references/longform-topic.md): long video → several short projects, topic → video without filming.
// Runs scripts/highlights.mjs and scripts/topic_video.mjs in the Studio job slot (progress via /api/job).
//   GET  /api/longform/runs                         → recent runs in $AVS_HOME/longform (highlights + topics)
//   GET  /api/longform/list?dir=                    → highlights.json of a run (+ thumb / mp4 urls)
//   GET  /api/longform/file?p=<abs path>            → image / video under $AVS_HOME (thumbs, exported mp4)
//   POST /api/longform/upload?name=                 → raw body saved to $AVS_HOME/longform/_uploads → {path}
//   POST /api/longform/highlights {video, n, min, max, orient, model}     job → job.out = {dir, items}
//   POST /api/longform/topic {topic, dur, voice, orient, export}          job → job.out = {dir, mp4}
//   POST /api/longform/export {dir, only?, quality?}                      job: render every project of a highlights run
//   POST /api/longform/open {dir}                   → open that project in Studio
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export default ctx => {
  const HOME = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
  const ROOT = path.join(HOME, 'longform');
  const HL = path.join(ctx.SKILL, 'scripts/highlights.mjs'), TOPIC = path.join(ctx.SKILL, 'scripts/topic_video.mjs');
  const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'video';
  const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const inHome = f => { const r = path.resolve(f); return r.startsWith(HOME + path.sep) ? r : null; };
  const furl = f => f && fs.existsSync(f) ? `/api/longform/file?p=${encodeURIComponent(f)}&v=${Math.round(fs.statSync(f).mtimeMs)}` : null;
  const lastMp4 = dir => { const d = path.join(dir, 'out'); if (!fs.existsSync(d)) return null; const f = fs.readdirSync(d).filter(x => x.endsWith('.mp4') && !x.includes('.part')).map(x => path.join(d, x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]; return f || null; };
  const items = dir => (rd(path.join(dir, 'highlights.json')) || []).map((it, i) => {
    const mp4 = it.mp4 && fs.existsSync(it.mp4) ? it.mp4 : lastMp4(it.dir);
    return { ...it, i, thumbUrl: furl(it.thumb), mp4, mp4Url: furl(mp4), exists: fs.existsSync(path.join(it.dir, 'timeline.json')) };
  });
  // run a CLI in the job slot: "@@ p step" → job.progress/step, "RESULT {…}" → parsed result
  const runCli = async (argv, onResult) => {
    const job = ctx.job; let result = null;
    await ctx.run('node', argv, l => {
      const m = /^@@ ([\d.]+) (.*)$/.exec(l);
      if (m) { job.progress = Math.min(.999, +m[1]); job.step = m[2]; }
      else if (l.startsWith('RESULT ')) { try { result = JSON.parse(l.slice(7)); } catch {} }
    }).catch(e => {
      const why = (job.log || '').split('\n').reverse().find(l => l.startsWith('LỖI: '));
      throw new Error(why ? why.slice(5) : e.message);
    });
    onResult(result);
  };
  const raw = req => new Promise((ok, bad) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', bad); });

  return async (req, res, p, u) => {
    if (!p.startsWith('/api/longform/')) return false;
    const J = (o, code) => (ctx.json(res, o, code), true);
    const busy = () => J({ ok: false, error: 'Đang có tác vụ khác chạy — đợi xong hoặc bấm Dừng' }, 409);
    try {
      if (p === '/api/longform/file') {
        const f = inHome(u.searchParams.get('p') || '');
        if (!f || !/\.(jpe?g|png|webp|mp4|mov|wav|m4a)$/i.test(f)) return J({ error: 'forbidden' }, 403);
        ctx.sendFile(req, res, f); return true;
      }
      if (p === '/api/longform/runs') {
        const out = [];
        for (const [kind, d] of [['highlights', path.join(ROOT, 'highlights')], ['topic', path.join(ROOT, 'topics')]]) {
          if (!fs.existsSync(d)) continue;
          for (const e of fs.readdirSync(d)) {
            const dir = path.join(d, e); if (e.startsWith('.') || !fs.statSync(dir).isDirectory()) continue;
            if (kind === 'highlights') { const l = rd(path.join(dir, 'highlights.json')); if (l) out.push({ kind, dir, name: path.basename(l[0]?.source || e), n: l.length, at: fs.statSync(dir).mtimeMs }); }
            else { const s = rd(path.join(dir, 'script.json')); if (s && fs.existsSync(path.join(dir, 'timeline.json'))) out.push({ kind, dir, name: s.title || s.topic, topic: s.topic, at: fs.statSync(dir).mtimeMs, thumbUrl: furl(path.join(dir, '.studio/thumb.jpg')), mp4: lastMp4(dir), mp4Url: furl(lastMp4(dir)) }); }
          }
        }
        return J({ runs: out.sort((a, b) => b.at - a.at).slice(0, 30), queue: fs.existsSync(path.join(ctx.HERE, 'routes/15_autopilot.mjs')) });
      }
      if (p === '/api/longform/list') {
        const dir = inHome(u.searchParams.get('dir') || '') || path.resolve(u.searchParams.get('dir') || '');
        if (!fs.existsSync(path.join(dir, 'highlights.json'))) return J({ error: 'Không thấy highlights.json' }, 404);
        return J({ dir, items: items(dir) });
      }
      if (p === '/api/longform/upload' && req.method === 'POST') {
        const name = path.basename(u.searchParams.get('name') || 'video.mp4').replace(/[^\w.\-À-ỹ ]+/g, '_');
        if (!/\.(mp4|mov|m4v|mkv|webm)$/i.test(name)) return J({ error: 'Chỉ nhận video (mp4, mov, m4v, mkv, webm)' }, 400);
        const d = path.join(ROOT, '_uploads'); fs.mkdirSync(d, { recursive: true });
        const f = path.join(d, `${ctx.stamp()}_${name}`);
        await new Promise((ok, bad) => { const w = fs.createWriteStream(f); req.pipe(w); w.on('finish', ok); w.on('error', bad); req.on('error', bad); });
        return J({ ok: true, path: f });
      }
      if (req.method !== 'POST') return J({ error: 'not found' }, 404);
      const b = await ctx.body(req);
      if (p === '/api/longform/highlights') {
        const video = path.resolve(String(b.video || '').trim().replace(/^~(?=[\\/])/, os.homedir()));
        if (!b.video || !fs.existsSync(video) || !fs.statSync(video).isFile()) return J({ ok: false, error: `Không thấy video ${b.video || ''}` }, 400);
        const out = path.join(ROOT, 'highlights', `${slug(path.basename(video, path.extname(video)))}_${ctx.stamp()}`);
        const argv = [HL, video, '--out', out, '--n', String(Math.max(1, Math.min(12, +b.n || 6))), '--min', String(+b.min || 20), '--max', String(+b.max || 60),
          '--orient', b.orient === 'horizontal' ? 'horizontal' : 'vertical', '--model', ['small', 'medium', 'large-v3-turbo', 'large-v3'].includes(b.model) ? b.model : 'large-v3-turbo'];
        const ok = ctx.startJob('highlights', () => runCli(argv, r => { ctx.job.out = { dir: out, n: r?.n || 0 }; }), b);
        return ok ? J({ ok, dir: out }) : busy();
      }
      if (p === '/api/longform/topic') {
        const topic = String(b.topic || '').trim().slice(0, 400);
        if (topic.length < 4) return J({ ok: false, error: 'Nhập chủ đề (ít nhất vài chữ)' }, 400);
        const out = path.join(ROOT, 'topics', `${slug(topic)}_${ctx.stamp()}`);
        const voice = /^(Linh|edge:[\w-]+)$/.test(b.voice || '') ? b.voice : 'Linh';
        const argv = [TOPIC, topic, '--out', out, '--dur', String(Math.max(15, Math.min(120, +b.dur || 45))), '--voice', voice,
          '--orient', b.orient === 'horizontal' ? 'horizontal' : 'vertical', ...(b.handle ? ['--handle', String(b.handle).slice(0, 40)] : []), ...(b.export ? ['--export'] : [])];
        const ok = ctx.startJob('topic', () => runCli(argv, r => { ctx.job.out = { dir: r?.dir || out, mp4: r?.mp4 || null, title: r?.title }; }), b);
        return ok ? J({ ok, dir: out }) : busy();
      }
      if (p === '/api/longform/export') {
        const dir = path.resolve(String(b.dir || ''));
        if (!fs.existsSync(path.join(dir, 'highlights.json'))) return J({ ok: false, error: 'Không thấy highlights.json' }, 400);
        const argv = [HL, '--export', dir, ...(b.only ? ['--only', String(b.only)] : []), '--quality', b.quality === '720' ? '720' : '1080'];
        const ok = ctx.startJob('longform-export', () => runCli(argv, r => { ctx.job.out = { dir, outputs: r?.outputs || [] }; }), b);
        return ok ? J({ ok }) : busy();
      }
      if (p === '/api/longform/open') {
        const dir = path.resolve(String(b.dir || ''));
        if (!fs.existsSync(path.join(dir, 'timeline.json'))) return J({ ok: false, error: 'Không thấy dự án' }, 400);
        if (ctx.job?.state === 'running') return busy();
        ctx.openProject(dir); return J({ ok: true });
      }
      return J({ error: 'not found' }, 404);
    } catch (e) { return J({ ok: false, error: e.message }, 500); }
  };
};
