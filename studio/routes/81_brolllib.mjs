// B-roll goals/sources for the "Tự động" panel + the personal b-roll library (scripts/broll_lib.mjs, references/autofill.md §1c).
//   GET  /api/broll/meta                      → {goals, sources, roles, keys:{stockvid, aiimg}, lib}
//   GET  /api/brolllib                        → items · GET /api/brolllib/file?f=<file in the library>
//   POST /api/brolllib/upload?name=&tags=     → raw body = the file → item
//   POST /api/brolllib/tags {id, tags} · /rm {id} · /tag {ids?, all?} (Claude looks at the pictures; job "brolltag")
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ctx => {
  const L = () => import(pathToFileURL(path.join(ctx.SKILL, 'scripts/broll_lib.mjs')).href);
  return async (req, res, p, u) => {
    if (p === '/api/broll/meta') {
      const g = JSON.parse(fs.readFileSync(path.join(ctx.SKILL, 'assets/broll/goals.json'), 'utf8'));
      const { readKeys } = await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/ai_broll.mjs')).href);
      const k = readKeys(), lib = (await L()).load();
      return ctx.json(res, { goals: g.goals.map(({ id, name, icon, desc }) => ({ id, name, icon, desc })), sources: g.sources, roles: g.roles, auto_from_pack: g.auto_from_pack,
        keys: { stockvid: !!(k.pexels || k.pixabay), aiimg: !!(k.openai || k.gemini) }, lib: lib.length }), true;
    }
    if (!p.startsWith('/api/brolllib')) return false;
    const lib = await L();
    try {
      if (p === '/api/brolllib' && req.method === 'GET') return ctx.json(res, lib.load()), true;
      if (p === '/api/brolllib/file') {
        const f = ctx.under(lib.LIB, String(u.searchParams.get('f') || ''));
        if (!f || !fs.existsSync(f)) return ctx.json(res, { error: 'không thấy file' }, 404), true;
        return ctx.sendFile(req, res, f), true;
      }
      if (req.method !== 'POST') return false;
      if (p === '/api/brolllib/upload') {
        const name = path.basename(String(u.searchParams.get('name') || 'broll.jpg')).replace(/[^\w.\-À-ỹ ]+/g, '_');
        const tmp = path.join(os.tmpdir(), `avs_lib_${process.pid}_${Date.now()}_${name}`);
        await new Promise((ok, bad) => { const w = fs.createWriteStream(tmp); req.pipe(w); w.on('finish', ok); w.on('error', bad); });
        try { return ctx.json(res, lib.add(tmp, { title: name, tags: String(u.searchParams.get('tags') || '') })), true; }
        finally { fs.rmSync(tmp, { force: true }); }
      }
      const b = await ctx.body(req);
      if (p === '/api/brolllib/tags') return ctx.json(res, lib.setTags(String(b.id), b.tags) || { error: 'không thấy' }), true;
      if (p === '/api/brolllib/rm') return ctx.json(res, { ok: lib.remove(String(b.id)) }), true;
      if (p === '/api/brolllib/tag') {
        const ok = ctx.startJob('brolltag', async () => {
          ctx.job.step = 'Claude đang xem ảnh và gắn thẻ'; const t0 = Date.now();
          const r = await lib.autoTag({ ids: Array.isArray(b.ids) ? b.ids : undefined, all: !!b.all, onTick: () => { ctx.job.progress = Math.min(.95, (Date.now() - t0) / 120000); } });
          ctx.job.out = r; ctx.job.step = `Đã gắn thẻ ${r.tagged} mục`;
        }, {});
        return ctx.json(res, ok ? { ok } : { error: 'Đang có tác vụ khác chạy' }), true;
      }
    } catch (e) { return ctx.json(res, { error: e.message }, 400), true; }
    return false;
  };
};
