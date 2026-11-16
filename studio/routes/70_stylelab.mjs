// Style Lab (references/style-lab.md): clone a style from an edited reference video, or create one from a description,
// with the Claude Code CLI. Work folders live in ~/.ai-video-studio/stylelab/<w>/ (analysis, prompt, Claude output, checks).
//   GET  /api/stylelab/check                     → { ok, version } | { error }  (is `claude` installed?)
//   POST /api/stylelab/upload?name=…             → raw body saved to stylelab/uploads/ → { path }
//   POST /api/stylelab/analyze {path}            → job "stylelab": scripts/style_analyze.py → { ok, w }
//   GET  /api/stylelab/analysis?w=               → analysis.json
//   GET  /api/stylelab/file?w=&f=                → a file inside the work folder (sheets, stills, compare.jpg)
//   POST /api/stylelab/generate {w?, mode:'clone'|'describe', desc, orient, industry, colors, font, images[], name, model} → job → { ok, w }
//   GET  /api/stylelab/result?w=                 → result.json (also written when it failed)
//   GET  /api/stylelab/list · POST /api/stylelab/delete {id}
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export default ctx => {
  const HOME = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
  const ROOT = path.join(HOME, 'stylelab');
  const LAB = path.join(ctx.SKILL, 'scripts/style_lab.mjs');
  let lib = null;
  const L = async () => (lib = lib || await import(pathToFileURL(LAB).href));
  const wdir = w => (/^[\w.-]{1,80}$/.test(w || '') ? path.join(ROOT, w) : null);
  const newW = kind => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '_' + kind + '_' + Math.random().toString(36).slice(2, 6);
  const runLab = (argv, w) => ctx.startJob('stylelab', async () => {
    ctx.job.step = 'Chuẩn bị'; ctx.job.out = w; ctx.job.w = w;
    await ctx.run('node', [LAB, ...argv], l => {
      const m = /^@@ ([\d.]+) (.*)$/.exec(l);
      if (m) { ctx.job.progress = +m[1]; ctx.job.step = m[2]; } else if (/^LỖI: /.test(l)) ctx.job.error = l.slice(5);
    }).catch(e => { throw new Error(ctx.job.error || e.message); });
  });
  return async (req, res, p, u) => {
    if (!p.startsWith('/api/stylelab/')) return false;
    const q = k => u.searchParams.get(k);
    if (p === '/api/stylelab/check') {
      const { execClaude } = await import('../../scripts/platform.mjs');
      return await new Promise(ok => execClaude(['--version'], { timeout: 15000 }, (e, out) => {
        ctx.json(res, e ? { error: e.code === 'ENOENT' ? 'Không tìm thấy Claude Code CLI ("claude"). Cài Claude Code rồi chạy "claude" một lần để đăng nhập.' : 'Không chạy được "claude": ' + e.message } : { ok: true, version: out.trim() }); ok(true);
      }));
    }
    if (p === '/api/stylelab/upload' && req.method === 'POST') {
      const dir = path.join(ROOT, 'uploads'); fs.mkdirSync(dir, { recursive: true });
      const name = path.basename(q('name') || 'video.mp4').replace(/[^\w.\-]+/g, '_').slice(-80);
      const f = path.join(dir, Date.now().toString(36) + '_' + name);
      await new Promise((ok, bad) => { const s = fs.createWriteStream(f); req.pipe(s); s.on('finish', ok); s.on('error', bad); });
      return ctx.json(res, { path: f, size: fs.statSync(f).size }), true;
    }
    if (p === '/api/stylelab/analyze' && req.method === 'POST') {
      const b = await ctx.body(req);
      const src = path.resolve(String(b.path || '').replace(/^~(?=[\\/])/, os.homedir()));
      if (!b.path || !fs.existsSync(src) || !fs.statSync(src).isFile()) return ctx.json(res, { error: 'Không thấy file video: ' + (b.path || '') }), true;
      const w = newW('clone'); fs.mkdirSync(wdir(w), { recursive: true }); fs.writeFileSync(path.join(wdir(w), 'src.txt'), src);
      const ok = runLab(['analyze', src, '--work', wdir(w)], w);
      return ctx.json(res, ok ? { ok, w } : { error: 'Đang có tác vụ khác chạy (xuất video, AI…). Đợi xong rồi thử lại.' }), true;
    }
    if (p === '/api/stylelab/generate' && req.method === 'POST') {
      const b = await ctx.body(req);
      const mode = b.mode === 'describe' ? 'describe' : 'clone';
      const extra = [];
      if (b.name) extra.push('--name', String(b.name).slice(0, 28));
      if (['sonnet', 'opus', 'haiku'].includes(b.model)) extra.push('--model', b.model);
      let w = b.w, argv;
      if (mode === 'clone') {
        const d = wdir(w);
        if (!d || !fs.existsSync(path.join(d, 'analysis.json'))) return ctx.json(res, { error: 'Chưa phân tích video tham chiếu' }), true;
        const src = fs.existsSync(path.join(d, 'src.txt')) ? fs.readFileSync(path.join(d, 'src.txt'), 'utf8') : '';
        argv = ['clone', ...(src ? [src] : []), '--work', d, '--skip-analyze', ...extra];
      } else {
        if (!String(b.desc || '').trim()) return ctx.json(res, { error: 'Hãy mô tả style bạn muốn' }), true;
        w = newW('describe'); const d = wdir(w); fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, 'desc.txt'), String(b.desc).slice(0, 3000));
        argv = ['describe', '--work', d, '--orient', b.orient === 'horizontal' ? 'horizontal' : 'vertical', ...extra];
        for (const k of ['industry', 'colors', 'font']) if (b[k]) argv.push('--' + k, String(b[k]).slice(0, 200));
        const imgs = (Array.isArray(b.images) ? b.images : []).filter(f => typeof f === 'string' && f.startsWith(ROOT) && fs.existsSync(f)).slice(0, 4);
        if (imgs.length) argv.push('--images', imgs.join(','));
      }
      if (ctx.project && !process.env.AVS_FOOTAGE && !fs.existsSync(path.join(HOME, 'footage/clip-mau/timeline.json'))) argv.push('--footage', ctx.project.dir);
      fs.rmSync(path.join(wdir(w), 'result.json'), { force: true });
      const ok = runLab(argv, w);
      return ctx.json(res, ok ? { ok, w } : { error: 'Đang có tác vụ khác chạy. Đợi xong rồi thử lại.' }), true;
    }
    if (p === '/api/stylelab/analysis' || p === '/api/stylelab/result') {
      const d = wdir(q('w')), f = d && path.join(d, p.endsWith('analysis') ? 'analysis.json' : 'result.json');
      return ctx.json(res, f && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { error: 'Chưa có kết quả', none: true }), true;
    }
    if (p === '/api/stylelab/file') {
      const d = wdir(q('w')), f = d && ctx.under(d, q('f') || '');
      return f && fs.existsSync(f) ? ctx.sendFile(req, res, f) : ctx.json(res, { error: 'không có file' }, 404), true;
    }
    if (p === '/api/stylelab/list') return ctx.json(res, (await L()).listStyles()), true;
    if (p === '/api/stylelab/delete' && req.method === 'POST') {
      const b = await ctx.body(req);
      try { return ctx.json(res, { ok: true, removed: (await L()).removeStyle(String(b.id || '')).length }), true; } catch (e) { return ctx.json(res, { error: e.message }, 400), true; }
    }
    return false;
  };
};
