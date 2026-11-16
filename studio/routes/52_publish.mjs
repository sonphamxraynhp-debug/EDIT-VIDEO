// Gói đăng mạng xã hội (bản trung thực: KHÔNG tự đăng). AI (claude -p) viết tiêu đề / caption / hashtag / bình luận đầu / gợi ý ảnh bìa
// cho từng nền tảng từ lời thoại; kiểm tra thông số MP4; xuất ảnh bìa; mở trang upload + hiện file trong Finder; lưu <project>/publish/<nền tảng>.txt.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { openPath } from '../../scripts/platform.mjs';

// Thông số tham khảo (11/2026) — nền tảng đổi thường xuyên, chỉ dùng để cảnh báo.
export const PLATFORMS = {
  tiktok: { name: 'TikTok', url: 'https://www.tiktok.com/tiktokstudio/upload', maxDur: 600, hardDur: 3600, maxMB: 4096, ratio: '9:16', caption: 4000, tags: [3, 6], note: 'App: tối đa 10 phút; web: tới 60 phút.' },
  youtube: { name: 'YouTube Shorts', url: 'https://www.youtube.com/upload', maxDur: 180, maxMB: 256 * 1024, ratio: '9:16', title: 100, caption: 5000, tags: [3, 5], note: 'Shorts: ≤ 3 phút, dọc hoặc vuông. Thêm #Shorts vào tiêu đề/mô tả.' },
  facebook: { name: 'Facebook Reels', url: 'https://www.facebook.com/reels/create', maxDur: 90, maxMB: 4096, ratio: '9:16', caption: 2200, tags: [3, 5], note: 'Reels ≤ 90 giây được phân phối tốt nhất (video dài hơn vẫn đăng được dạng video).' },
  instagram: { name: 'Instagram Reels', url: 'https://www.instagram.com/', maxDur: 180, maxMB: 4096, ratio: '9:16', caption: 2200, tags: [3, 5], note: 'Reels ≤ 3 phút. Web: bấm “Tạo” → chọn file.' },
  zalo: { name: 'Zalo Video', url: 'https://oa.zalo.me/', maxDur: 600, maxMB: 1024, ratio: '9:16', caption: 2000, tags: [0, 3], note: 'Đăng cá nhân: dùng app Zalo trên điện thoại (Nhật ký / Zalo Video). Trang web mở ra là Zalo OA (tài khoản doanh nghiệp).' },
};

export function probe(file) {
  return new Promise(ok => execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate', '-of', 'json', file], (e, out) => {
    if (e) return ok(null);
    const j = JSON.parse(out), v = j.streams.find(s => s.codec_type === 'video'), a = j.streams.find(s => s.codec_type === 'audio');
    const [n, d] = (v?.r_frame_rate || '30/1').split('/').map(Number);
    ok({ dur: +(+j.format.duration).toFixed(2), size: +j.format.size, w: v?.width, h: v?.height, vcodec: v?.codec_name, acodec: a?.codec_name || null, fps: +(n / (d || 1)).toFixed(2) });
  }));
}
export function checks(info, id) {
  const P = PLATFORMS[id], out = [];
  if (!info) return [{ level: 'bad', msg: 'Không đọc được file video' }];
  const r = info.w / info.h, mb = info.size / 1048576;
  if (Math.abs(r - 9 / 16) > .02) out.push({ level: id === 'youtube' && Math.abs(r - 1) < .02 ? 'ok' : 'warn', msg: `Khung ${info.w}×${info.h} không phải 9:16 — nền tảng sẽ thêm viền hoặc cắt` });
  else out.push({ level: 'ok', msg: `Khung 9:16 (${info.w}×${info.h})` });
  if (info.h < 1280 && info.w < 1280) out.push({ level: 'warn', msg: 'Độ phân giải thấp — nên xuất 1080×1920' });
  if (P.hardDur && info.dur > P.hardDur) out.push({ level: 'bad', msg: `Dài ${info.dur}s, vượt giới hạn ${P.hardDur / 60} phút` });
  else if (info.dur > P.maxDur) out.push({ level: id === 'youtube' ? 'bad' : 'warn', msg: `Dài ${info.dur}s > ${P.maxDur}s khuyến nghị. ${P.note}` });
  else out.push({ level: 'ok', msg: `Độ dài ${info.dur}s (≤ ${P.maxDur}s)` });
  if (mb > P.maxMB) out.push({ level: 'bad', msg: `File ${mb.toFixed(0)} MB vượt ${P.maxMB} MB` }); else out.push({ level: 'ok', msg: `Dung lượng ${mb.toFixed(1)} MB` });
  if (info.vcodec !== 'h264') out.push({ level: 'warn', msg: `Codec ${info.vcodec} — nên dùng H.264` });
  if (!info.acodec) out.push({ level: 'warn', msg: 'Video không có tiếng' });
  if (info.fps > 60) out.push({ level: 'warn', msg: `${info.fps} fps — nên ≤ 60` });
  return out;
}
const asText = (P, d) => [
  `# ${P.name}`, d.title ? `\n## Tiêu đề\n${d.title}` : '', `\n## Caption\n${d.caption || ''}`, `\n## Hashtag\n${(d.hashtags || []).join(' ')}`,
  d.first_comment ? `\n## Bình luận đầu tiên\n${d.first_comment}` : '', d.thumb_time != null ? `\n## Ảnh bìa gợi ý\n${d.thumb_time}s${d.thumb_text ? ` — chữ trên bìa: ${d.thumb_text}` : ''}` : '',
  `\n## Trang upload\n${P.url}`, `\n(Lưu ý: ${P.note})\n`,
].filter(Boolean).join('\n');

export default ctx => async (req, res, p, u) => {
  if (!p.startsWith('/api/publish')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
  const PUB = ctx.P('publish');
  const vid = rel => { const f = ctx.under(ctx.project.dir, rel || ''); return f && fs.existsSync(f) ? f : null; };
  if (p === '/api/publish/platforms') return J(Object.fromEntries(Object.entries(PLATFORMS).map(([k, v]) => [k, { name: v.name, note: v.note, maxDur: v.maxDur }])));
  if (p === '/api/publish/videos') {
    const d = ctx.P('out'); const list = fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.mp4') && !f.includes('.part.')).map(f => ({ path: `out/${f}`, mtime: fs.statSync(path.join(d, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime) : [];
    return J(list);
  }
  if (p === '/api/publish/check') {
    const f = vid(u.searchParams.get('video')); if (!f) return J({ error: 'không thấy video' }, 404);
    const info = await probe(f);
    return J({ info, checks: Object.fromEntries(Object.keys(PLATFORMS).map(k => [k, checks(info, k)])) });
  }
  if (p === '/api/publish/data') {
    const f = path.join(PUB, 'publish.json');
    return J(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
  }
  if (req.method !== 'POST') return false;
  const b = await ctx.body(req);
  if (p === '/api/publish/gen') {
    const f = vid(b.video); if (!f) return J({ error: 'Chọn video đã xuất trước' }, 400);
    const plats = (b.platforms || Object.keys(PLATFORMS)).filter(k => PLATFORMS[k]);
    const ok = ctx.startJob('publish', async () => {
      // prompt + claude -p + publish/*.txt live in scripts/publish_texts.mjs (shared with scripts/autopilot.mjs)
      const { generatePublish } = await import('../../scripts/publish_texts.mjs');
      const { timeline: tl, captions } = ctx.readProject();
      ctx.job.step = 'AI đang viết nội dung (claude -p)…'; ctx.job.progress = .15;
      await generatePublish({ dir: ctx.project.dir, tl, captions, videoAbs: f, videoRel: b.video, platforms: plats, notes: b.notes, model: b.model || 'sonnet', onProc: pr => { ctx.job.proc = pr; } });
      ctx.job.out = 'publish/publish.json';
    });
    return J(ok ? { ok: true } : { error: 'Đang có tác vụ khác chạy' }, ok ? 200 : 409);
  }
  if (p === '/api/publish/save') {
    // user edits in the dialog → publish.json + <platform>.txt
    const f = path.join(PUB, 'publish.json'); if (!fs.existsSync(f)) return J({ error: 'chưa có nội dung' }, 404);
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!PLATFORMS[b.platform]) return J({ error: 'nền tảng lạ' }, 400);
    doc.platforms[b.platform] = { ...(doc.platforms[b.platform] || {}), ...b.data };
    fs.writeFileSync(f, JSON.stringify(doc, null, 1)); fs.writeFileSync(path.join(PUB, `${b.platform}.txt`), asText(PLATFORMS[b.platform], doc.platforms[b.platform]));
    return J({ ok: true, file: `publish/${b.platform}.txt` });
  }
  if (p === '/api/publish/cover') {
    // full-size still (render.mjs --still) → publish/cover_<t>s.jpg
    const t = Math.max(0, +b.t || 0);
    const tl = JSON.parse(fs.readFileSync(ctx.project.tlFile, 'utf8')), vert = (tl.height || 720) > (tl.width || 1280);
    const tmp = path.join(ctx.project.dir, `.cover_${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ ...tl, width: vert ? 1080 : 1920, height: vert ? 1920 : 1080 }));
    fs.mkdirSync(PUB, { recursive: true });
    const out = path.join(PUB, `cover_${t.toFixed(1).replace('.', '_')}s.jpg`);
    return new Promise(ok => execFile('node', [path.join(ctx.SKILL, 'scripts/render.mjs'), tmp, out, '--still', String(t), out], { timeout: 120000 }, e => {
      fs.rmSync(tmp, { force: true });
      ok(e ? J({ error: 'Không render được ảnh bìa: ' + e.message }, 500) : J({ out: path.relative(ctx.project.dir, out), url: '/project/' + path.relative(ctx.project.dir, out) + '?' + Date.now() }));
    }));
  }
  if (p === '/api/publish/open') {
    const P = PLATFORMS[b.platform]; if (!P) return J({ error: 'nền tảng lạ' }, 400);
    openPath(P.url); return J({ ok: true, url: P.url });
  }
  return false;
};
