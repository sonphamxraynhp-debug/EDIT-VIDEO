// Mask / background removal / sticker / b-roll AI endpoints (spec: references/keyframes-mask-broll.md).
//   POST /api/segment {src, in, out, fps}        -> job: person cutouts for a clip's source range (scripts/segment.py), out = {cutouts}
//   POST /api/sticker {frame}                    -> job: die-cut sticker PNG from one frame (scripts/make_sticker.py), out = {path}
//   GET  /api/aikeys  · POST /api/aikeys {pexels?, pixabay?, openai?, gemini?}   (~/.ai-video-studio/config.json, mode 600; never returns keys)
//   GET  /api/stock?q=&kind=photo|video&src=     -> search results (no download)
//   POST /api/stock/fetch {url, kind, name, meta} -> download + normalise into media/, returns media item
//   POST /api/broll/suggest {model?}             -> job: claude -p per-sentence b-roll ideas, out = [...]
//   POST /api/genimage {prompt, provider?}       -> job: AI image with the user's own key, out = {path}
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ctx => {
  let AB = null;
  const ab = async () => (AB ||= await import(pathToFileURL(path.join(ctx.SKILL, 'scripts/ai_broll.mjs')).href));
  const vertical = () => { const { timeline: t } = ctx.readProject(); return (t.height || 1920) > (t.width || 1080); };
  const relp = f => path.relative(ctx.project.dir, f).split(path.sep).join('/');

  async function segment({ src, in: a = 0, out: b = 3, fps = 30 }) {
    if (!src) throw new Error('Clip không có nguồn');
    const job = ctx.job;
    if (typeof src === 'string') { // still image clip -> one PNG
      const f = ctx.under(ctx.project.dir, src); if (!f || !fs.existsSync(f)) throw new Error('Không thấy ảnh ' + src);
      const dst = f.replace(/\.\w+$/, '') + '_cut.png';
      job.step = 'Tách nền ảnh';
      await ctx.run(ctx.PY, ['-I', '-X', 'utf8', '-c', 'import sys;from PIL import Image;from rembg import new_session,remove;remove(Image.open(sys.argv[1]),session=new_session("u2net_human_seg"),post_process_mask=True).save(sys.argv[2])', f, dst]);
      job.out = { cutouts: relp(dst), still: true }; return;
    }
    const seq = src.seq || '';
    if (!/%05d\.jpg$/.test(seq)) throw new Error('Chỉ tách nền được chuỗi khung %05d.jpg');
    const frames = ctx.under(ctx.project.dir, path.dirname(seq)); if (!frames || !fs.existsSync(frames)) throw new Error('Không thấy thư mục khung ' + seq);
    const outDir = path.join(ctx.project.dir, 'work', 'cutouts_' + path.basename(frames).replace(/[^\p{L}\p{N}_-]+/gu, '_'));
    const want = Math.max(1, Math.round((b - a) * fps) + 1), count = () => (fs.existsSync(outDir) ? fs.readdirSync(outDir).length : 0), before = count();
    job.step = `Tách nền ${want} khung (rembg, chạy trên máy)`;
    const tick = setInterval(() => { job.progress = Math.min(.98, (count() - before) / want); }, 500);
    try { await ctx.run(ctx.PY, ['-I', '-X', 'utf8', path.join(ctx.SKILL, 'scripts/segment.py'), frames, outDir, '--ranges', `${a.toFixed(2)}-${b.toFixed(2)}`, '--fps', String(fps)]); }
    finally { clearInterval(tick); }
    job.out = { cutouts: relp(outDir) + '/%05d.png', n: count() };
  }
  async function sticker({ frame, emojis = '', disc = '#F7BE48' }) {
    const f = ctx.under(ctx.project.dir, frame || ''); if (!f || !fs.existsSync(f)) throw new Error('Không thấy khung ' + frame);
    fs.mkdirSync(ctx.P('media'), { recursive: true });
    const dst = ctx.P(`media/sticker_${ctx.stamp()}.png`);
    ctx.job.step = 'Cắt người + viền trắng (make_sticker.py)';
    await ctx.run(ctx.PY, ['-I', '-X', 'utf8', path.join(ctx.SKILL, 'scripts/make_sticker.py'), f, dst, '--disc', disc, ...(emojis ? ['--emojis', emojis] : [])]);
    ctx.job.out = { path: relp(dst) };
  }
  async function suggest({ model = 'sonnet', n = 8 }) {
    const { captions } = ctx.readProject();
    if (!captions.length) throw new Error('Dự án chưa có phụ đề để đọc');
    ctx.job.step = 'Claude đang đọc phụ đề và chọn b-roll…'; ctx.job.progress = .1;
    const tick = setInterval(() => { ctx.job.progress = Math.min(.95, ctx.job.progress + .02); }, 1000);
    try { ctx.job.out = await (await ab()).suggest(captions, { model, n }); } finally { clearInterval(tick); }
  }
  async function genimage({ prompt, provider }) {
    if (!prompt) throw new Error('Thiếu mô tả ảnh');
    ctx.job.step = 'Đang tạo ảnh AI…'; ctx.job.progress = .2;
    const out = ctx.P(`media/ai_${ctx.stamp()}.png`);
    const r = await (await ab()).genImage(prompt, out, { provider, vertical: vertical() });
    ctx.job.out = { path: relp(r.out), provider: r.provider };
  }

  return async (req, res, p, u) => {
    if (p === '/api/aikeys') {
      const m = await ab(), cur = (() => { try { return JSON.parse(fs.readFileSync(m.CONFIG, 'utf8')); } catch { return {}; } })();
      if (req.method === 'POST') {
        const b = await ctx.body(req);
        for (const k of ['pexels', 'pixabay', 'openai', 'gemini']) if (typeof b[k] === 'string') { if (b[k].trim()) cur[k] = b[k].trim(); else delete cur[k]; }
        fs.mkdirSync(path.dirname(m.CONFIG), { recursive: true, mode: 0o700 });
        fs.writeFileSync(m.CONFIG, JSON.stringify(cur, null, 1), { mode: 0o600 }); fs.chmodSync(m.CONFIG, 0o600);
      }
      const k = m.readKeys();
      ctx.json(res, { file: m.CONFIG, keys: Object.fromEntries(Object.entries(k).map(([n, v]) => [n, v ? '…' + v.slice(-4) : ''])) }); return true;
    }
    if (p === '/api/stock' && req.method === 'GET') {
      ctx.json(res, await (await ab()).search(u.searchParams.get('q') || '', { kind: u.searchParams.get('kind') || 'photo', src: u.searchParams.get('src') || undefined, en: u.searchParams.get('en') || undefined, n: +(u.searchParams.get('n') || 18) })); return true;
    }
    if (p === '/api/stock/fetch' && req.method === 'POST') {
      const b = await ctx.body(req);
      try { ctx.json(res, await (await ab()).fetchMedia(b.url, ctx.project.dir, { kind: b.kind, name: b.name || b.meta?.title || 'broll', dur: b.dur || 3, vertical: vertical(), meta: b.meta || {} })); }
      catch (e) { ctx.json(res, { error: e.message }, 500); }
      return true;
    }
    const jobs = { '/api/segment': ['segment', segment], '/api/sticker': ['sticker', sticker], '/api/broll/suggest': ['broll_suggest', suggest], '/api/genimage': ['genimage', genimage] };
    if (jobs[p] && req.method === 'POST') { const b = await ctx.body(req); ctx.json(res, { ok: ctx.startJob(jobs[p][0], jobs[p][1], b) }); return true; }
    return false;
  };
};
