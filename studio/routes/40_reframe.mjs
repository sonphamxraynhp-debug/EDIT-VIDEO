// Auto-reframe (face track -> clip.reframe) and translate + dub (scripts/dub.py). Spec: references/reframe-dub.md
//   POST /api/reframe {src}              job: face track of a clip source ({seq,fps,count}), cached in .studio/facetrack/ -> job.out.keys
//   POST /api/dub {lang, tts, voice, voice_gain, translate=true, dub=true, force}   job: translate captions (tr) and/or build the dub track
//   GET  /api/dub/voices?lang=en         macOS `say` voices for a language (+ the edge-tts default)
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

export default ctx => {
  const S = f => path.join(ctx.SKILL, 'scripts', f);
  async function reframe({ src }) {
    const tl = ctx.readProject().timeline, job = ctx.job, c = { src };
    if (typeof c.src === 'string' || !c.src?.seq) throw new Error('Clip là ảnh tĩnh — chỉnh Tâm X/Y bằng tay.');
    const dir = ctx.P(path.dirname(c.src.seq)), fps = c.src.fps || tl.fps || 30;
    if (!fs.existsSync(dir)) throw new Error(`không thấy khung hình ${c.src.seq}`);
    const cache = ctx.P(`.studio/facetrack/${path.dirname(c.src.seq).replace(/[^\p{L}\p{N}_-]+/gu, '_')}.json`);
    if (!fs.existsSync(cache) || fs.statSync(cache).mtimeMs < fs.statSync(dir).mtimeMs) {
      job.step = 'Dò mặt trong video (YuNet, offline)';
      const total = (c.src.count || fs.readdirSync(dir).length) / fps;
      await ctx.run(ctx.PY, ['-I', '-X', 'utf8', S('face_track.py'), dir, '--src-fps', String(fps), '--fps', '5', '--out', cache], l => {
        const m = /^face ([\d.]+)s/.exec(l); if (m) job.progress = Math.min(.95, +m[1] / total);
      });
    }
    const tr = JSON.parse(fs.readFileSync(cache, 'utf8'));
    // the client applies it (undoable): reframe = keys inside each clip's in/out, ar = source aspect, fit = cover
    job.out = { seq: c.src.seq, keys: tr.keys.map(x => ({ t: x.t, ox: x.ox, oy: x.oy })), ar: +(tr.w / tr.h).toFixed(4), found: tr.found, cuts: tr.cuts.length };
  }
  async function dub({ lang = 'en', tts = 'say', voice, voice_gain, translate = true, dub = true, force = false }) {
    const job = ctx.job;
    job.step = translate ? 'Dịch phụ đề bằng Claude' : 'Tạo giọng lồng tiếng';
    let report = null;
    await ctx.run(ctx.PY, ['-I', '-X', 'utf8', S('dub.py'), ctx.project.tlFile, '--lang', lang, '--tts', tts, ...(voice ? ['--voice', voice] : []),
      ...(voice_gain != null ? ['--voice-gain', String(voice_gain)] : []), ...(translate ? [] : ['--no-translate']), ...(dub ? [] : ['--no-tts']), ...(force ? ['--force'] : [])], l => {
      let m;
      if ((m = /^dịch (\d+)\/(\d+)/.exec(l))) { job.step = `Dịch phụ đề ${m[1]}/${m[2]} câu`; job.progress = .5 * m[1] / m[2]; }
      if ((m = /^lồng tiếng (\d+)\/(\d+)/.exec(l))) { job.step = `Đọc lồng tiếng ${m[1]}/${m[2]}`; job.progress = .5 + .5 * m[1] / m[2]; }
      if (l.startsWith('DUB ')) report = JSON.parse(l.slice(4));
    });
    job.out = report;
  }
  return async (req, res, p, u) => {
    if (p === '/api/reframe' && req.method === 'POST') { const b = await ctx.body(req); ctx.json(res, { ok: ctx.startJob('reframe', reframe, b) }); return true; }
    if (p === '/api/dub' && req.method === 'POST') { const b = await ctx.body(req); ctx.json(res, { ok: ctx.startJob('dub', dub, b) }); return true; }
    if (p === '/api/dub/voices') {
      execFile(ctx.PY, ['-I', '-X', 'utf8', S('dub.py'), '--voices', (u.searchParams.get('lang') || 'en').replace(/[^a-z]/g, '')], (e, out) => {
        try { ctx.json(res, JSON.parse(out)); } catch { ctx.json(res, { say: [], edge: null }); }
      });
      return true;
    }
    return false;
  };
};
