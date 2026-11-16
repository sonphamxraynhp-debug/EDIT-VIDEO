// "Bám lời thoại" (scripts/tpl_fit.mjs, references/tpl-fit.md): run right after a template is applied in the Studio.
//   POST /api/tplfit {claude=true, images=true, model} → job "tplfit": creates captions first when the project has none
//        (whisper large-v3-turbo, same as 25_transcribe), then rewrites the template's scenes from the speech. job.out = summary.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { transcribe } from './25_transcribe.mjs';

export default ctx => async (req, res, p) => {
  if (p !== '/api/tplfit' || req.method !== 'POST') return false;
  if (!ctx.project) return ctx.json(res, { error: 'Chưa mở dự án' }, 404), true;
  const b = await ctx.body(req);
  const ok = ctx.startJob('tplfit', async () => {
    const job = ctx.job;
    const hd = ctx.P('.studio/history'); fs.mkdirSync(hd, { recursive: true });
    const before = ctx.readProject();
    fs.writeFileSync(path.join(hd, `${ctx.stamp()}_tplfit.json`), JSON.stringify({ timeline: before.timeline, captions: before.captions }));
    let made = null;
    if (!before.captions.length) {
      // transcribe() reports 0..1 on its own; squeeze it into the first 60 % of this job
      const pj = new Proxy(job, { set(t, k, v) { t[k] = k === 'progress' ? v * .6 : k === 'step' ? 'Tạo lời thoại: ' + v : v; return true; } });
      await transcribe({ ...ctx, get job() { return pj; }, P: ctx.P, project: ctx.project }, { lang: 'vi', max: 4 });
      made = job.out;
    }
    const { fitProject } = await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/tpl_fit.mjs')).href);
    const k0 = made ? .6 : 0;
    const sum = await fitProject(ctx.project.tlFile, { claude: b.claude !== false, model: b.model || 'sonnet', images: b.images !== false,
      say: (pr, s) => { job.progress = k0 + (1 - k0) * pr; job.step = s; } });
    job.out = { ...sum, transcribed: made };
    job.step = `Xong: ${sum.texts} chữ, ${sum.images} ảnh theo lời thoại`;
  }, {});
  ctx.json(res, ok ? { ok: true } : { error: 'Đang có tác vụ khác chạy, đợi xong rồi thử lại.' }, ok ? 200 : 409);
  return true;
};
