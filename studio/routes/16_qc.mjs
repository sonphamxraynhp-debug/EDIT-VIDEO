// AI QC + A/B variants (references/qc-variants.md):
//   POST /api/qc/run {fix, claude, model, fresh}  → job "qc": scripts/ai_qc.mjs → .studio/qc.json
//   GET  /api/qc                                  → last report (+ backup flag)
//   POST /api/qc/undo                             → restore .studio/qc_backup.json (timeline + captions as before the fix)
//   POST /api/variants/run {n, kind, export, quality} → job "variants": scripts/variants.mjs → <project>_v1.._vN + variants.json
//   GET  /api/variants                            → variants.json of this project (or of its base when a variant is open)
//   GET  /api/variants/file?dir=&f=               → a still / video inside one of the listed variant folders
//   POST /api/variants/open {dir}                 → open a listed variant (or the base) in the Studio
import fs from 'node:fs'; import path from 'node:path';

export default ctx => {
  const S = f => path.join(ctx.SKILL, 'scripts', f);
  const readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const progress = l => { const m = /^@@ ([\d.]+) (.*)$/.exec(l); if (m) { ctx.job.progress = +m[1]; ctx.job.step = m[2]; } else if (/^LỖI: /.test(l)) ctx.job.error = l.slice(5); };
  // variants.json of the open project, or of its base project when a variant is open
  const variantsFile = () => {
    const own = path.join(ctx.project.dir, 'variants.json');
    if (fs.existsSync(own)) return own;
    const tl = readJ(ctx.project.tlFile), base = tl?._variant?.base;
    return base && fs.existsSync(path.join(base, 'variants.json')) ? path.join(base, 'variants.json') : null;
  };
  const allowedDirs = () => { const f = variantsFile(); const v = f ? readJ(f) : null; return v ? [v.base, ...(v.variants || []).map(x => x.dir)].filter(Boolean).map(d => path.resolve(d)) : []; };
  return async (req, res, p, u) => {
    if (!p.startsWith('/api/qc') && !p.startsWith('/api/variants')) return false;
    if (!ctx.project) return ctx.json(res, { error: 'Chưa mở dự án' }, 404), true;
    const st = ctx.P('.studio'); fs.mkdirSync(st, { recursive: true });
    if (p === '/api/qc/run' && req.method === 'POST') {
      const b = await ctx.body(req);
      const argv = [S('ai_qc.mjs'), ctx.project.dir, ...(b.fix ? ['--fix'] : []), ...(b.claude === false ? ['--no-claude'] : []), ...(b.fresh ? ['--fresh'] : []), '--model', String(b.model || 'sonnet').replace(/[^\w.-]/g, '')];
      const ok = ctx.startJob('qc', async () => {
        ctx.job.step = 'Chuẩn bị kiểm tra';
        await ctx.run('node', argv, progress).catch(e => { throw new Error(ctx.job.error || e.message); });
        ctx.job.out = '.studio/qc.json';
      });
      return ctx.json(res, ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }), true;
    }
    if (p === '/api/qc') {
      const r = readJ(path.join(st, 'qc.json'));
      return ctx.json(res, r ? { ...r, can_undo: fs.existsSync(path.join(st, 'qc_backup.json')) } : { none: true, error: 'Chưa kiểm tra' }), true;
    }
    if (p === '/api/qc/undo' && req.method === 'POST') {
      const f = path.join(st, 'qc_backup.json'), b = readJ(f);
      if (!b?.timeline) return ctx.json(res, { error: 'Không có bản sao lưu trước khi sửa' }, 400), true;
      ctx.save({ timeline: b.timeline, captions: b.captions || [] });
      fs.renameSync(f, path.join(st, `qc_backup_undone_${Date.now()}.json`));
      const q = readJ(path.join(st, 'qc.json')); if (q) { q.undone = new Date().toISOString(); fs.writeFileSync(path.join(st, 'qc.json'), JSON.stringify(q, null, 1)); }
      return ctx.json(res, { ok: true }), true;
    }
    if (p === '/api/variants/run' && req.method === 'POST') {
      const b = await ctx.body(req);
      const n = Math.max(2, Math.min(5, +b.n || 3)), kind = ['hook', 'style', 'both'].includes(b.kind) ? b.kind : 'hook';
      const argv = [S('variants.mjs'), ctx.project.dir, '--n', String(n), '--kind', kind, ...(b.export ? ['--export', '--quality', b.quality === '1080' ? '1080' : '720'] : []), ...(b.claude === false ? ['--no-claude'] : [])];
      const ok = ctx.startJob('variants', async () => {
        ctx.job.step = 'Chuẩn bị tạo phiên bản';
        await ctx.run('node', argv, progress).catch(e => { throw new Error(ctx.job.error || e.message); });
        ctx.job.out = 'variants.json';
      });
      return ctx.json(res, ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }), true;
    }
    if (p === '/api/variants') { const f = variantsFile(); return ctx.json(res, f ? { ...readJ(f), current: ctx.project.dir } : { none: true }), true; }
    if (p === '/api/variants/file') {
      const dir = path.resolve(u.searchParams.get('dir') || ''), rel = u.searchParams.get('f') || '';
      if (!allowedDirs().includes(dir)) return ctx.json(res, { error: 'forbidden' }, 403), true;
      const f = ctx.under(dir, rel);
      return f ? (ctx.sendFile(req, res, f), true) : (ctx.json(res, {}, 403), true);
    }
    if (p === '/api/variants/open' && req.method === 'POST') {
      const b = await ctx.body(req), dir = path.resolve(String(b.dir || ''));
      if (!allowedDirs().includes(dir)) return ctx.json(res, { error: 'Không phải phiên bản của dự án này' }, 403), true;
      ctx.openProject(dir);
      return ctx.json(res, { ok: true }), true;
    }
    return false;
  };
};
