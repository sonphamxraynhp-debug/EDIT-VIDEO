// Gói đăng: AI (claude -p) viết tiêu đề / caption / hashtag / bình luận đầu / gợi ý ảnh bìa cho từng nền tảng từ lời thoại.
// Shared by studio/routes/52_publish.mjs (/api/publish/gen) and scripts/autopilot.mjs. Writes <project>/publish/publish.json + <platform>.txt.
//   node scripts/publish_texts.mjs <project_dir> <video.mp4> [--platforms tiktok,youtube] [--notes "…"] [--model sonnet]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PLATFORMS, probe } from '../studio/routes/52_publish.mjs';
import { claudeBin, spawnClaude } from './platform.mjs';

export { claudeBin };
const extractJSON = s => { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < a) throw new Error('AI không trả về JSON'); return JSON.parse(s.slice(a, b + 1)); };
export const asText = (P, d) => [
  `# ${P.name}`, d.title ? `\n## Tiêu đề\n${d.title}` : '', `\n## Caption\n${d.caption || ''}`, `\n## Hashtag\n${(d.hashtags || []).join(' ')}`,
  d.first_comment ? `\n## Bình luận đầu tiên\n${d.first_comment}` : '', d.thumb_time != null ? `\n## Ảnh bìa gợi ý\n${d.thumb_time}s${d.thumb_text ? ` — chữ trên bìa: ${d.thumb_text}` : ''}` : '',
  `\n## Trang upload\n${P.url}`, `\n(Lưu ý: ${P.note})\n`,
].filter(Boolean).join('\n');

export function buildPrompt({ tl, captions, info, plats, notes }) {
  const lines = captions.filter(c => !c.hidden).map(c => `[${c.t0.toFixed(1)}s] ${c.words.map(w => w.w).join(' ')}`).join('\n').slice(0, 9000);
  const onScreen = [...new Set((tl.scenes || []).flatMap(s => [s.title, s.name, s.text, s.question, s.value].filter(x => typeof x === 'string')))].slice(0, 30).join(' | ');
  const B = tl.brand || {};
  return `Bạn là chuyên gia social media Việt Nam. Viết nội dung đăng video ngắn (dọc 9:16, dài ${info?.dur ?? tl.duration}s) cho các nền tảng: ${plats.map(k => PLATFORMS[k].name).join(', ')}.
Thương hiệu: ${B.name || '(không có)'}${B.handle ? ', kênh ' + B.handle : ''}${B.phone ? ', SĐT ' + B.phone : ''}${B.website ? ', web ' + B.website : ''}.
Tiêu đề dự án: ${tl.title || '(không có)'}. Chữ trên màn hình: ${onScreen || '(không có)'}.
${notes ? 'Yêu cầu thêm của người dùng: ' + notes + '\n' : ''}Lời thoại (có mốc thời gian):
${lines || '(video không có lời thoại — dựa vào chữ trên màn hình)'}

Yêu cầu: tiếng Việt có dấu, tự nhiên, đúng văn phong từng nền tảng; không bịa số liệu, giá, cam kết không có trong lời thoại; giữ nguyên chữ "(ví dụ)" nếu nội dung là ví dụ.
- tiktok: caption ngắn có hook ≤ 150 ký tự, 3–6 hashtag.
- youtube: title ≤ 90 ký tự có #Shorts; caption là mô tả 2–4 câu; 3–5 hashtag.
- facebook: caption 2–4 câu có lời kêu gọi; 3–5 hashtag.
- instagram: caption có xuống dòng, 3–5 hashtag.
- zalo: caption ngắn gọn thân thiện, 0–3 hashtag.
thumb_time = giây (số) có khung hình đẹp nhất để làm ảnh bìa (chọn lúc có chữ/tiêu đề rõ, trong khoảng 0–${info?.dur ?? tl.duration}); thumb_text = chữ ngắn ≤ 6 từ nên in trên ảnh bìa.
first_comment = bình luận ghim đầu tiên (câu hỏi gợi tương tác hoặc thông tin liên hệ).
Chỉ trả về JSON đúng dạng, không giải thích:
{${plats.map(k => `"${k}":{"title":"","caption":"","hashtags":["#..."],"first_comment":"","thumb_time":0,"thumb_text":""}`).join(',')}}`;
}

// claude -p … --output-format json → the model's text. onProc(child) lets callers kill it.
export function askClaude(prompt, { model = 'sonnet', onProc } = {}) {
  return new Promise((ok, bad) => {
    const pr = spawnClaude(['-p', '--output-format', 'json', '--model', model], { cwd: os.tmpdir(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    pr.stdin.on('error', () => {}); pr.stdin.end(prompt); // stdin, not argv: long transcripts exceed Windows' command-line limit
    onProc?.(pr); let out = '', err = '';
    pr.stdout.on('data', d => (out += d)); pr.stderr.on('data', d => (err += d));
    pr.on('error', e => bad(new Error(e.code === 'ENOENT' ? 'Không tìm thấy Claude Code CLI (lệnh `claude`). Cài Claude Code rồi chạy `claude` một lần để đăng nhập.' : e.message)));
    pr.on('close', c => {
      if (!(c === 0 || /^\s*\{[\s\S]*"is_error"/.test(out))) return bad(new Error(`claude -p lỗi (mã ${c}): ${(err || out).slice(-400)}`));
      let r; try { r = JSON.parse(out); } catch { return bad(new Error('Kết quả claude -p không đọc được')); }
      if (r.is_error) return bad(new Error(/not logged in|\/login|authenticat|api key/i.test(String(r.result)) ? 'Claude Code chưa đăng nhập. Mở Terminal, chạy lệnh "claude" một lần để đăng nhập rồi thử lại.' : 'Claude báo lỗi: ' + String(r.result).slice(0, 300)));
      ok(String(r.result || ''));
    });
  });
}

/** Generate publish texts. o: { dir, tl, captions, videoAbs, videoRel, platforms?, notes?, model?, onProc? } → publish.json doc */
export async function generatePublish({ dir, tl, captions, videoAbs, videoRel, platforms, notes, model = 'sonnet', onProc }) {
  const plats = (platforms || Object.keys(PLATFORMS)).filter(k => PLATFORMS[k]);
  if (!plats.length) throw new Error('Chưa chọn nền tảng');
  const info = await probe(videoAbs);
  const data = extractJSON(await askClaude(buildPrompt({ tl, captions, info, plats, notes }), { model, onProc }));
  const PUB = path.join(dir, 'publish');
  fs.mkdirSync(PUB, { recursive: true });
  const doc = { video: videoRel, created: new Date().toISOString(), info, platforms: {} };
  for (const k of plats) if (data[k]) {
    const d = data[k]; d.hashtags = (d.hashtags || []).map(h => '#' + String(h).replace(/^#+/, '').replace(/\s+/g, ''));
    doc.platforms[k] = d; fs.writeFileSync(path.join(PUB, `${k}.txt`), asText(PLATFORMS[k], d));
  }
  fs.writeFileSync(path.join(PUB, 'publish.json'), JSON.stringify(doc, null, 1));
  return doc;
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const [dirArg, vid] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!dirArg || !vid) { console.error('usage: node scripts/publish_texts.mjs <project_dir> <video.mp4> [--platforms tiktok,youtube] [--notes …] [--model sonnet]'); process.exit(2); }
  const { loadProject } = await import('./ai_edit.mjs');
  const { dir, tl, caps } = loadProject(dirArg);
  const videoAbs = path.resolve(dir, vid);
  console.log('@@ 0.10 AI đang viết nội dung đăng (claude -p)…');
  generatePublish({ dir, tl, captions: caps, videoAbs, videoRel: path.relative(dir, videoAbs), platforms: opt('--platforms')?.split(','), notes: opt('--notes', ''), model: opt('--model', 'sonnet') })
    .then(doc => { console.log('@@ 1.00 Xong'); console.log(JSON.stringify({ out: path.join(dir, 'publish/publish.json'), platforms: Object.keys(doc.platforms) })); })
    .catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
}
