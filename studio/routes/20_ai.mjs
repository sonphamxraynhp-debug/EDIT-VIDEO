// AI tools (references/ai-edit.md):
//   POST /api/ai/edit {goal,tone,pack,density,extra}  → job "ai": scripts/ai_edit.mjs (claude -p) writes .studio/ai_plan.json
//   GET  /api/ai/plan                                  → that plan (the Studio applies it client-side, undoable)
//   POST /api/ai/fillers {words,pause,fillers,claude}  → scripts/fillers.py; with claude:true it runs as job "fillers", result at GET /api/ai/fillers
import fs from 'node:fs'; import path from 'node:path'; import { execFile } from 'node:child_process';

export default ctx => {
  const S = f => path.join(ctx.SKILL, 'scripts', f);
  const fillArgs = (b, inF, outF) => [S('fillers.py'), inF, outF, '--pause', String(+b.pause || .7),
    ...(b.fillers ? ['--fillers', String(b.fillers)] : []), ...(b.claude ? ['--claude'] : [])];
  return async (req, res, p) => {
    if (!p.startsWith('/api/ai/')) return false;
    if (!ctx.project) return ctx.json(res, { error: 'Chưa mở dự án' }, 404), true;
    const st = ctx.P('.studio'); fs.mkdirSync(st, { recursive: true });
    if (p === '/api/ai/edit' && req.method === 'POST') {
      const b = await ctx.body(req);
      const o = { goal: String(b.goal || ''), tone: String(b.tone || ''), pack: String(b.pack || 'auto'), density: String(b.density || 'vua'), extra: String(b.extra || '').slice(0, 600) };
      fs.writeFileSync(path.join(st, 'ai_opts.json'), JSON.stringify(o));
      fs.rmSync(path.join(st, 'ai_plan.json'), { force: true });
      const ok = ctx.startJob('ai', async () => {
        ctx.job.step = 'Chuẩn bị';
        await ctx.run('node', [S('ai_edit.mjs'), ctx.project.tlFile, '--opts', path.join(st, 'ai_opts.json'), '--out', path.join(st, 'ai_plan.json')], l => {
          const m = /^@@ ([\d.]+) (.*)$/.exec(l);
          if (m) { ctx.job.progress = +m[1]; ctx.job.step = m[2]; }
          else if (/^LỖI: /.test(l)) ctx.job.error = l.slice(5);
        }).catch(e => { throw new Error(ctx.job.error || e.message); });
        ctx.job.out = '.studio/ai_plan.json';
      });
      return ctx.json(res, { ok }), true;
    }
    if (p === '/api/ai/plan') {
      const f = path.join(st, 'ai_plan.json');
      return ctx.json(res, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { error: 'Chưa có bản dựng AI', none: true }), true;
    }
    if (p === '/api/ai/fillers' && req.method === 'POST') {
      const b = await ctx.body(req);
      const inF = path.join(st, 'fillers_in.json'), outF = path.join(st, 'fillers.json');
      fs.writeFileSync(inF, JSON.stringify(Array.isArray(b.words) ? b.words : ctx.readProject().captions));
      fs.rmSync(outF, { force: true });
      if (b.claude) {
        const ok = ctx.startJob('fillers', async () => {
          ctx.job.step = 'Dò lỗi nói + hỏi Claude câu nói hỏng (20–60 giây)'; ctx.job.progress = .2;
          await ctx.run(ctx.PY, ['-I', '-X', 'utf8', ...fillArgs(b, inF, outF)]);
          ctx.job.out = '.studio/fillers.json';
        });
        return ctx.json(res, { ok, job: true }), true;
      }
      return await new Promise(ok => execFile(ctx.PY, ['-I', '-X', 'utf8', ...fillArgs(b, inF, outF)], (e, out, err) => {
        let r = null;
        if (!e) try { r = JSON.parse(fs.readFileSync(outF, 'utf8')); } catch (x) { err = 'fillers.py không ghi được kết quả: ' + x.message; }
        ctx.json(res, r || { error: (err || e?.message || '').slice(-400) }, r ? 200 : 500); ok(true);
      }));
    }
    if (p === '/api/ai/fillers') {
      const f = path.join(st, 'fillers.json');
      return ctx.json(res, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { error: 'Chưa có kết quả', none: true }), true;
    }
    return false;
  };
};
