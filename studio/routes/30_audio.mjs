// Âm thanh+ (references/audio.md): A/B nghe thử làm sạch giọng, đo độ dài file cho track âm thanh, trộn thử (mix_audio.py).
//   POST /api/audio/ab    {src, ss, dur?, clean:{preset,…}} → {a, b}  (5 s gốc / đã làm sạch, cùng -16 LUFS, trong .studio/)
//   GET  /api/audio/probe?file=media/x.mp3 → {dur}
//   POST /api/audio/mix   → job: chạy mix_audio.py → {out: work/mix.wav}
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const sh = (cmd, argv) => new Promise((ok, bad) => execFile(cmd, argv, { maxBuffer: 1 << 24 }, (e, out, err) => (e ? bad(new Error((err || e.message).toString().trim().split('\n').pop())) : ok(out.toString()))));

export default ctx => async (req, res, p, u) => {
  if (!p.startsWith('/api/audio/')) return false;
  const { json, project } = ctx;
  if (!project) return json(res, { error: 'Chưa mở dự án' }, 400), true;
  const inProj = rel => rel && ctx.under(project.dir, rel);
  if (p === '/api/audio/probe') {
    const f = inProj(u.searchParams.get('file') || '');
    if (!f || !fs.existsSync(f)) return json(res, { error: 'không thấy file' }, 404), true;
    const d = await sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).catch(() => '0');
    return json(res, { dur: +(+d || 0).toFixed(3) }), true;
  }
  if (p === '/api/audio/ab' && req.method === 'POST') {
    const b = await ctx.body(req), f = inProj(b.src || '');
    if (!f || !fs.existsSync(f)) return json(res, { error: 'Không thấy file giọng của clip tại playhead' }, 404), true;
    const ss = Math.max(0, +b.ss || 0), dur = Math.min(10, Math.max(1, +b.dur || 5)), st = ctx.stamp();
    const dir = ctx.P('.studio/ab');
    fs.mkdirSync(dir, { recursive: true });
    for (const x of fs.readdirSync(dir)) fs.rmSync(path.join(dir, x), { force: true });
    const A = path.join(dir, `orig_${st}.wav`), B = path.join(dir, `clean_${st}.wav`);
    const { preset = 'vua', ...over } = b.clean || {};
    try {
      // the original is loudness-matched to the cleaned one (-16 LUFS) so A/B judges clarity, not volume
      await Promise.all([
        sh('ffmpeg', ['-v', 'error', '-y', '-ss', String(ss), '-t', String(dur), '-i', f, '-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000', '-ac', '2', A]),
        sh(ctx.PY, ['-I', '-X', 'utf8', path.join(ctx.SKILL, 'scripts/voice_clean.py'), f, B, '--preset', preset === 'off' ? 'vua' : preset, '--json', JSON.stringify(over), '--ss', String(ss), '--t', String(dur)]),
      ]);
    } catch (e) { return json(res, { error: 'Không tạo được bản nghe thử: ' + e.message }, 500), true; }
    return json(res, { a: path.relative(project.dir, A), b: path.relative(project.dir, B) }), true;
  }
  if (p === '/api/audio/mix' && req.method === 'POST') {
    const ok = ctx.startJob('mix', async () => {
      ctx.job.step = 'Trộn âm thanh (làm sạch giọng, hạ nhạc, track phụ, -14 LUFS)';
      await ctx.run(ctx.PY, ['-I', '-X', 'utf8', path.join(ctx.SKILL, 'scripts/mix_audio.py'), project.tlFile]);
      const tl = JSON.parse(fs.readFileSync(project.tlFile, 'utf8'));
      ctx.job.out = tl.audio?.mix || 'work/mix.wav';
    }, {});
    if (ok === false) return json(res, { error: 'Đang có tác vụ khác' }, 409), true;
    return json(res, { ok: true }), true;
  }
  return false;
};
