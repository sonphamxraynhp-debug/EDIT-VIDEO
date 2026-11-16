// "Tự động" (references/autofill.md): auto b-roll (scripts/auto_broll.mjs) + richer auto sound (scripts/auto_sfx.py --level).
//   POST /api/autofill {mode:'all'|'broll'|'sfx'|'clear', goal, variety 0..1, density,
//        src:[preset,hf,text,emoji,logo,aroll,media,lib,stock,stockvid,aiimg], claude, level, music}
//        -> job "autofill"; rewrites timeline.json in place (history snapshot + timeline.json.bak first); job.out = summary
import fs from 'node:fs'; import path from 'node:path';

const DENS = ['thua', 'vua', 'day', 'ratday'], LEVELS = ['nhe', 'vua', 'phongphu'], SRCS = ['preset', 'hf', 'text', 'emoji', 'logo', 'aroll', 'media', 'lib', 'stock', 'stockvid', 'aiimg'];
const GOALS = ['auto', 'banhang', 'bds', 'khoahoc', 'review', 'tintuc', 'kechuyen', 'doanhnghiep', 'amthuc', 'giaitri'];

export default ctx => {
  const S = f => path.join(ctx.SKILL, 'scripts', f);
  return async (req, res, p) => {
    if (p !== '/api/autofill' || req.method !== 'POST') return false;
    if (!ctx.project) return ctx.json(res, { error: 'Chưa mở dự án' }, 404), true;
    const b = await ctx.body(req);
    const mode = ['all', 'broll', 'sfx', 'clear'].includes(b.mode) ? b.mode : 'all';
    const density = DENS.includes(b.density) ? b.density : 'vua', level = LEVELS.includes(b.level) ? b.level : 'vua';
    const src = (Array.isArray(b.src) ? b.src : ['preset', 'hf', 'text', 'emoji', 'logo', 'aroll', 'media', 'lib']).filter(x => SRCS.includes(x));
    const goal = GOALS.includes(b.goal) ? b.goal : 'auto', variety = Math.max(0, Math.min(1, b.variety ?? .6));
    const ok = ctx.startJob('autofill', async () => {
      const tlf = ctx.project.tlFile, sum = { mode };
      // snapshot (same format as Studio saves) so "Lịch sử" can bring the previous state back
      const { timeline, captions } = ctx.readProject();
      const hd = ctx.P('.studio/history'); fs.mkdirSync(hd, { recursive: true });
      fs.writeFileSync(path.join(hd, `${ctx.stamp()}_autofill.json`), JSON.stringify({ timeline, captions }));
      const parse = l => { try { const o = JSON.parse(l); if (o && typeof o === 'object') return o; } catch {} return null; };
      if (mode === 'clear') {
        ctx.job.step = 'Xoá phần tự động';
        await ctx.run('node', [S('auto_broll.mjs'), tlf, '--clear'], l => { const o = parse(l); if (o) sum.broll = o; });
        await ctx.run(ctx.PY, ['-I', '-X', 'utf8', S('auto_sfx.py'), tlf, '--level', 'vua', '--clear'], l => { if (/xoá/.test(l)) sum.sfx = l; });
      }
      if (mode === 'all' || mode === 'broll') {
        if (!src.length) throw new Error('Chọn ít nhất một nguồn b-roll');
        ctx.job.step = 'Chọn b-roll theo lời thoại'; ctx.job.progress = .05;
        const k = mode === 'all' ? .7 : 1;
        await ctx.run('node', [S('auto_broll.mjs'), tlf, '--goal', goal, '--variety', String(variety), '--density', density, '--src', src.join(','), ...(b.claude ? ['--claude'] : [])], l => {
          const m = /^@@ ([\d.]+) (.*)$/.exec(l), o = parse(l);
          if (m) { ctx.job.progress = +m[1] * k; ctx.job.step = m[2]; } else if (o) sum.broll = o; else if (/^LỖI: /.test(l)) ctx.job.error = l.slice(5);
        }).catch(e => { throw new Error(ctx.job.error || e.message); });
      }
      if (mode === 'all' || mode === 'sfx') {
        ctx.job.step = b.music ? 'Đặt SFX + chọn nhạc theo đoạn' : 'Đặt SFX'; ctx.job.progress = mode === 'all' ? .75 : .2;
        await ctx.run(ctx.PY, ['-I', '-X', 'utf8', S('auto_sfx.py'), tlf, '--level', level, ...(b.music ? ['--music', 'auto'] : []), ...(b.claude && b.music ? ['--claude'] : [])], l => {
          if (/^level \d/.test(l)) sum.sfx = l;
        });
      }
      ctx.job.out = sum;
    });
    return ctx.json(res, ok ? { ok } : { error: 'Đang có tác vụ khác chạy' }), true;
  };
};
