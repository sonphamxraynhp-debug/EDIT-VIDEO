// "Tạo lời thoại tự động": whisper the project's voice as it plays on the timeline (all clips, cuts, speed),
// rebuild captions (scripts/captions.py) and save. Old captions are backed up in .studio/.
// POST /api/transcribe {model: small|medium|large-v3-turbo|large-v3, lang: vi|auto, max: 4}  → job; GET /api/transcribe/status
import fs from 'node:fs';
import path from 'node:path';

export default ctx => async (req, res, p) => {
  if (p === '/api/transcribe/status') {
    const { timeline: tl, captions } = ctx.readProject();
    const hasVoice = !!(tl.audio?.voice || tl.clips?.some(c => c.audio && !c.mute && !c.hidden));
    ctx.json(res, { captions: captions.length, words: captions.reduce((n, c) => n + (c.words?.length || 0), 0), hasVoice });
    return true;
  }
  if (p !== '/api/transcribe' || req.method !== 'POST') return false;
  const b = await ctx.body(req);
  const model = ['small', 'medium', 'large-v3-turbo', 'large-v3'].includes(b.model) ? b.model : 'large-v3-turbo';
  const lang = b.lang === 'auto' ? 'auto' : 'vi';
  const max = Math.min(8, Math.max(2, +b.max || 4));
  const ok = ctx.startJob('transcribe', () => transcribe(ctx, { model, lang, max }), {});
  ctx.json(res, ok ? { ok: true } : { error: 'Đang có tác vụ khác chạy, đợi xong rồi thử lại.' }, ok ? 200 : 409);
  return true;
};

// The job body, also used by "Bám lời thoại" (27_tplfit) when a template is chosen before the project has captions.
export async function transcribe(ctx, { model = 'large-v3-turbo', lang = 'vi', max = 4 } = {}) {
  const S = f => path.join(ctx.SKILL, 'scripts', f);
  const job = ctx.job, P = ctx.P;
  const { timeline: tl, captions: old } = ctx.readProject();
  fs.mkdirSync(P('.studio'), { recursive: true });
  // 1. The voice exactly as it sounds on the timeline: mix_audio.py --stems writes .studio/stem_voice.wav (clips cut,
  //    sped up, muted, cleaned…) aligned to timeline time. Fall back to the raw voice file for projects without clips.
  job.step = 'Lấy tiếng nói từ video'; job.progress = .05;
  let src = null;
  try {
    await ctx.run(ctx.PY, ['-I', '-X', 'utf8', S('mix_audio.py'), ctx.project.tlFile, '--stems']);
    if (fs.existsSync(P('.studio/stem_voice.wav'))) src = P('.studio/stem_voice.wav');
  } catch (e) { job.log += `\n(mix_audio: ${e.message})`; }
  if (!src && tl.audio?.voice && fs.existsSync(P(tl.audio.voice))) src = P(tl.audio.voice);
  if (!src) throw new Error('Video chưa có tiếng nói để nhận dạng (không có clip nào có tiếng).');
  // 2. Whisper → words with timings.
  job.step = `Nhận dạng giọng nói (whisper ${model}${model === 'small' ? '' : ' — lần đầu sẽ tải model'})`; job.progress = .2;
  const words = P('.studio/words_auto.json');
  await ctx.run(ctx.PY, ['-I', '-X', 'utf8', S('transcribe.py'), src, words, '--model', model, '--lang', lang]);
  const W = JSON.parse(fs.readFileSync(words, 'utf8'));
  if (!W.length) throw new Error('Không nghe thấy lời nói nào trong video.');
  // 3. Karaoke chunks.
  job.step = 'Chia dòng phụ đề'; job.progress = .9;
  const capF = P('.studio/captions_auto.json');
  await ctx.run(ctx.PY, ['-I', '-X', 'utf8', S('captions.py'), words, capF, '--max', String(max)]);
  const caps = JSON.parse(fs.readFileSync(capF, 'utf8')).filter(c => c.t0 < (tl.duration || 1e9));
  if (old.length) fs.writeFileSync(P(`.studio/captions_backup_${ctx.stamp()}.json`), JSON.stringify(old));
  fs.mkdirSync(P('work'), { recursive: true });
  fs.writeFileSync(P('work/words.json'), JSON.stringify(W, null, 1));
  if (typeof tl.captions !== 'string') tl.captions = 'work/captions.json';
  ctx.save({ timeline: tl, captions: caps });
  job.out = { captions: caps.length, words: W.length, replaced: old.length };
  job.step = `Xong: ${W.length} từ, ${caps.length} dòng phụ đề`;
}
