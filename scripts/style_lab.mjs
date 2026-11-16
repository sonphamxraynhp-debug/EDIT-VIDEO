// Style Lab (references/style-lab.md): Claude Code CLI (`claude -p`) writes a NEW style pack + template + Claude skill,
// either cloned from an edited reference video or from a Vietnamese description. Every pack is validated in the real
// engine (headless Chrome) and sent back to Claude for fixes (≤ 2 rounds) before it is installed.
// usage:
//   node scripts/style_lab.mjs clone <video> [--name "…"] [--model sonnet|opus] [--work dir] [--skip-analyze] [--no-install]
//   node scripts/style_lab.mjs describe "<mô tả>" [--orient vertical|horizontal] [--industry …] [--colors "#111,#C9A44C"] [--font "…"]
//                                                [--images a.jpg,b.png] [--name …] [--model …] [--work dir] [--no-install]
//   node scripts/style_lab.mjs analyze <video> [--work dir]          (only the offline analysis: scripts/style_analyze.py)
//   node scripts/style_lab.mjs validate <pack.js> [--id u_x]         (engine check of a pack file)
//   node scripts/style_lab.mjs apply <id> <project_dir> [--title …]  (apply the style's template to timeline.json)
//   node scripts/style_lab.mjs list | sync [--no-skills] | delete <id> | check
// Common: [--footage <project>] (default ~/.ai-video-studio/footage/clip-mau) — talking-head footage for validation + preview.
// Env: AVS_SKILLS_DIR (default ~/.claude/skills), AVS_HOME (default ~/.ai-video-studio), CLAUDE_BIN.
// Progress lines "@@ <0..1> <step>" on stdout; the run's result is <work>/result.json.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome, pyBin, claudeBin, spawnClaude } from './platform.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
const STORE = path.join(HOME, 'packs');
const SKILLS = process.env.AVS_SKILLS_DIR || path.join(os.homedir(), '.claude', 'skills');
const UPACK = path.join(SKILL, 'engine/packs/user');
const TPL = path.join(process.env.AVS_TEMPLATES || path.join(SKILL, 'templates'));
const UTPL = path.join(TPL, 'user'), UREF = path.join(SKILL, 'references/user');
const PY = pyBin(SKILL);
const CHROME = findChrome();
const args = process.argv.slice(2);
const VAL = ['--name', '--model', '--work', '--footage', '--orient', '--industry', '--colors', '--font', '--images', '--id', '--title', '--rounds', '--category', '--whisper', '--lang', '--desc'];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i && VAL.includes(args[i - 1])));
const say = (p, s) => console.log(`@@ ${Math.max(0, Math.min(1, p)).toFixed(2)} ${s}`);
const rd = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const slugify = (s, sep = '_') => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^${sep}+|${sep}+$`, 'g'), '').slice(0, 24).replace(new RegExp(`${sep}+$`), '');
const CATS = ['bds', 'khoahoc', 'review', 'chiase', 'tintuc', 'banhang', 'ai', 'khac'];
const FONTS = ['Be Vietnam Pro', 'Montserrat', 'Inter', 'Playfair Display', 'DM Serif Display', 'Bungee', 'Lexend', 'Oswald', 'Nunito', 'Pacifico'];
const MOODS = ['corporate', 'epic', 'happy', 'hype', 'inspire', 'lofi', 'mellow', 'sad', 'suspense', 'tech'];
let child = null;
process.on('SIGTERM', () => { try { child?.kill('SIGTERM'); } catch {} process.exit(143); });

// ---------- footage used for validation + previews ----------
function footage() {
  const d = path.resolve(opt('--footage', process.env.AVS_FOOTAGE || path.join(HOME, 'footage/clip-mau')));
  const tlf = ['timeline.base.json', 'timeline.json'].map(f => path.join(d, f)).find(f => fs.existsSync(f));
  if (!tlf) return null;
  const tl = rd(tlf);
  const caps = typeof tl.captions === 'string' ? rd(path.join(d, tl.captions), []) : tl.captions || [];
  return { dir: d, tl, caps };
}
const SAMPLE_CAPS = (() => {
  const txt = 'Xin chào mọi người hôm nay mình chia sẻ ba bí quyết quan trọng giúp bạn làm video đẹp hơn mỗi ngày đầu tiên là ánh sáng thứ hai là âm thanh và cuối cùng là câu chuyện đừng quên theo dõi để xem thêm nhé'.split(' ');
  const out = []; let t = .2;
  for (let i = 0; i < txt.length; i += 4) { const ws = txt.slice(i, i + 4).map(w => { const o = { w, s: +t.toFixed(2), e: +(t + .32).toFixed(2) }; t += .38; return o; }); out.push({ t0: ws[0].s, t1: ws[ws.length - 1].e, words: ws }); t += .15; }
  return out;
})();

// ---------- Claude CLI ----------
export { claudeBin };
const LOGIN = /not logged in|please run \/login|invalid api key|authentication|unauthorized|oauth token|credit balance/i;
// stream-json so we can show live activity (which image Claude opens, thinking, how much it has written) and keep the
// image reads (`Read` tool) on record: res.reads lists the files Claude actually opened.
function callClaude(prompt, { cwd, model, resume, onTick, timeout = 20 * 60e3 }) {
  return new Promise((ok, bad) => {
    const a = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--allowedTools', 'Read'];
    if (model && model !== 'default') a.push('--model', model);
    if (resume) a.push('--resume', resume);
    const p = child = spawnClaude(a, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } });
    let buf = '', err = '', r = null, chars = 0, act = 'đang đọc yêu cầu', usedModel = '', timedOut = false; const reads = [], t0 = Date.now();
    const tick = setInterval(() => onTick?.((Date.now() - t0) / 1000, act), 1000);
    const kill = setTimeout(() => { timedOut = true; p.kill('SIGTERM'); }, timeout);
    const ev = e => {
      if (e.type === 'system' && e.subtype === 'init') usedModel = e.model || '';
      else if (e.type === 'system' && e.subtype === 'thinking_tokens') act = 'đang suy nghĩ';
      else if (e.type === 'stream_event' && e.event?.delta?.text) { chars += e.event.delta.text.length; act = `đang viết (${Math.round(chars / 100) / 10}k ký tự)`; }
      else if (e.type === 'assistant') for (const c of e.message?.content || []) if (c.type === 'tool_use') { const f = path.basename(String(c.input?.file_path || '')); reads.push(f); act = `đang xem ${f}`; }
      if (e.type === 'result') r = e;
    };
    p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { ev(JSON.parse(l)); } catch {} } });
    p.stderr.on('data', d => (err += d));
    const done = () => { clearInterval(tick); clearTimeout(kill); child = null; };
    p.on('error', e => { done(); bad(new Error(e.code === 'ENOENT' ? 'Không tìm thấy lệnh "claude" (Claude Code CLI). Cài Claude Code (https://claude.com/claude-code) rồi chạy "claude" một lần để đăng nhập.' : e.message)); });
    p.on('close', code => {
      done();
      try { if (!r && buf.trim()) ev(JSON.parse(buf)); } catch {}
      const msg = String(r?.result || err || '').slice(-400);
      if (timedOut) return bad(new Error(`Claude chạy quá ${Math.round(timeout / 60e3)} phút nên đã dừng. Thử lại với model Sonnet (nhanh hơn).`));
      if (code !== 0 || !r || r.is_error) {
        if (LOGIN.test(msg)) return bad(new Error('Claude Code CLI chưa đăng nhập. Mở Terminal, chạy "claude" và đăng nhập (/login), rồi thử lại.'));
        return bad(new Error(`claude -p lỗi (mã ${code}): ${msg || 'không có kết quả'}`));
      }
      ok({ text: String(r.result || ''), session: r.session_id, turns: r.num_turns, cost: r.total_cost_usd, model: usedModel, reads, sec: Math.round((Date.now() - t0) / 1000) });
    });
    p.stdin.end(prompt);
  });
}
function sections(txt) {
  const out = {}; const re = /^=====\s*([A-Z_]+)\s*=====\s*$/gm; let m, last = null, idx = 0;
  while ((m = re.exec(txt))) { if (last) out[last] = txt.slice(idx, m.index); last = m[1]; idx = m.index + m[0].length; }
  if (last && last !== 'END') out[last] = txt.slice(idx);
  for (const k of Object.keys(out)) out[k] = out[k].trim().replace(/^```[a-z]*\s*\n/i, '').replace(/\n```\s*$/, '').trim();
  return out;
}
function parseMeta(s) {
  if (!s) return null;
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  try { return JSON.parse(s.slice(a, b + 1)); } catch { try { return JSON.parse(s.slice(a, b + 1).replace(/,\s*([}\]])/g, '$1')); } catch { return null; } }
}

// ---------- prompt ----------
const EXAMPLE = () => fs.readFileSync(path.join(SKILL, 'engine/packs/cinema.js'), 'utf8');
function compactAnalysis(an) {
  const a = JSON.parse(JSON.stringify(an));
  a.palette = a.palette?.map(p => `${p.hex} ${Math.round(p.share * 100)}% (lum ${p.lum}, sat ${p.sat})`);
  a.accents = a.accents?.map(p => `${p.hex} ${Math.round(p.share_of_frame * 100)}%`);
  if (a.audio?.transients?.length > 16) a.audio.transients = a.audio.transients.slice(0, 16);
  a.transcript.text = (a.transcript.text || '').slice(0, 1200);
  delete a.notes;
  return a;
}
function buildPrompt(kind, o) {
  const an = o.analysis, imgs = o.images || [];
  const look = kind === 'clone'
    ? `# Video tham chiếu (đã phân tích tự động)
Thư mục hiện tại chứa ảnh chụp từ video tham chiếu. BẮT BUỘC dùng tool Read mở và xem kỹ TẤT CẢ các ảnh sau trước khi thiết kế:
${an.sheets.map(s => `- ${s.file}: contact sheet ${s.frames} khung từ ${s.from}s đến ${s.to}s (nhãn thời gian ở góc, ô đỏ "CUT" = khung ngay sau điểm cắt cảnh)`).join('\n')}
${an.text_zones_image ? `- ${an.text_zones_image}: các dải chữ/phụ đề cắt từ nhiều khung (phóng to 2×) để xem kiểu chữ, màu, viền, nền hộp` : ''}
Số liệu đo bằng máy (heuristic, có thể sai — ảnh mới là chuẩn):
\`\`\`json
${JSON.stringify(compactAnalysis(an), null, 1)}
\`\`\`
Giải thích: cuts = thời điểm cắt cảnh (giây); text_zones y0/y1/x0/x1 = vị trí dải chữ theo tỉ lệ khung; palette = màu chiếm diện tích; accents = màu bão hoà; audio.music_likely/bpm = có nhạc nền và nhịp; transients = tiếng động mạnh (SFX whoosh/pop) theo giây; speech_ratio = tỉ lệ thời gian có lời nói.
Nhiệm vụ: tái tạo PHONG CÁCH dựng (bố cục, màu, kiểu phụ đề, loại graphic, nhịp, chuyển cảnh) để áp lên video người nói BẤT KỲ — không sao chép nội dung, logo, tên, handle, watermark hay thương hiệu của người làm video tham chiếu. Nếu video tham chiếu có biểu tượng thương hiệu, thay bằng hình trung tính hoặc slIcon(BR().logo) của người dùng.`
    : `# Mô tả của người dùng
"""${o.desc}"""
Tuỳ chọn: khổ ${o.orient === 'horizontal' ? 'ngang 16:9 (thiết kế chính 1280×720, vẫn phải chạy được dọc)' : 'dọc 9:16 (thiết kế chính 720×1280, vẫn phải chạy được ngang)'}${o.industry ? `; ngành: ${o.industry}` : ''}${o.colors ? `; màu thương hiệu: ${o.colors}` : ''}${o.font ? `; font mong muốn: ${o.font}` : ''}.
${imgs.length ? `Ảnh tham khảo của người dùng (dùng tool Read để xem từng ảnh trong thư mục hiện tại trước khi thiết kế): ${imgs.join(', ')}` : ''}
Nhiệm vụ: thiết kế một style dựng video hoàn chỉnh đúng mô tả, áp được lên video người nói (talking head) bất kỳ.`;
  return `Bạn là motion designer kiêm lập trình viên engine video. Hãy tạo một GÓI STYLE mới cho engine AI Video Studio (HTML → MP4, mỗi khung là HTML render theo thời gian t).

${look}

# Footage sẽ dùng style này
Video người nói chính diện (talking head) ${o.vertical ? 'dọc 9:16 — mặt thường ở khoảng y 330–700 trong khung 720×1280' : 'ngang 16:9 — mặt ở khoảng giữa khung 1280×720'}. Video là một cú máy liền: nếu style gốc cắt cảnh nhanh, mô phỏng nhịp đó bằng fx (punch / zoom_in / whip / flash / glitch) và graphic xuất hiện theo nhịp. Graphic không được che mặt quá 2 giây liên tục (trừ khi là cảnh full-frame ngắn).

# Hợp đồng gói (references/packs.md)
${fs.readFileSync(path.join(SKILL, 'references/packs.md'), 'utf8').split('## Danh sách gói')[0]}
Thêm (đã có sẵn, KHÔNG khai báo lại): VERT(), DIMS() → [W,H]; capWords(captions) → [{w,s,e,low}]; findWord(captions, ['từ khoá', …], after) → giây hoặc null; shiftT(o, T); esc(text); rnd(n) (giả ngẫu nhiên theo số nguyên n); E.outCubic… ; prog(t,t0,dur) → 0..1; fadeIO(t,t0,t1,din,dout).
Recipe có thể trả thêm "fx": [{ t, type: 'punch'|'zoom_in'|'whip'|'flash'|'glitch'|'shake'|'blur_in'|'rgb', amp? }] — hiệu ứng toàn khung (phụ đề vẫn đứng yên).
Lớp CSS có sẵn: "full" = position:absolute; inset:0. Mọi phần tử tự đặt position:absolute theo px trong khung thiết kế.
Font đã nạp sẵn: ${FONTS.join(', ')} (có thể nạp thêm 1 font Google hỗ trợ tiếng Việt bằng thẻ <link> như ví dụ dưới).
Mood nhạc có sẵn: ${MOODS.join(', ')} (+ biến thể _2).

# Ví dụ một gói hoàn chỉnh đang chạy tốt (engine/packs/cinema.js)
\`\`\`js
${EXAMPLE()}
\`\`\`

# Yêu cầu cho gói mới
1. Mở đầu bằng 1–3 dòng comment mô tả, rồi bọc toàn bộ trong IIFE. Dùng đúng \`const P = '__ID__';\`. Mọi module type = \`\${P}_<tên>\` (ví dụ \`[\`\${P}_title\`]\`), kiểu phụ đề \`CAPTION_STYLES[P]\`, \`PACKS.push({ id: P, name, icon, desc, caption: P, items, recipe })\`.
2. 3–8 module thể hiện đúng style (ví dụ: khung/nền/grade cho cả video, intro tiêu đề, thẻ thông tin, nhấn từ khoá, chuyển cảnh, CTA/outro). Mỗi item trong PACKS có make(T) trả về scene đầy đủ tham số mặc định bằng tiếng Việt có dấu (nội dung mẫu, không phải thương hiệu thật).
3. Kiểu phụ đề riêng giống style (vị trí, font, màu, hộp nền, cách nhấn từ hl, hiện từng từ theo w.s…), tôn trọng c.x/c.y/c.size/c.font/c.color/c.weight, có \${cidOf(c)} trên #cap.
4. recipe(ctx): trả { caption_style: P, music: '<mood>', scenes, fx } — khung nền cho toàn bài (nếu style có), intro 0–2,5 s dùng ctx.title, 2–5 graphic đặt theo từ khoá (findWord) hoặc chia đều theo ctx.dur nếu không tìm thấy, CTA/outro cuối; fx theo nhịp dựng của style. Mọi t0 < t1, nằm trong [0, ctx.dur]. Chạy được với captions rỗng.
5. Vẽ được cả dọc 720×1280 và ngang 1280×720 (lấy const [W, H] = DIMS() trong từng hàm).
6. Hoạt ảnh chỉ phụ thuộc t (không Date.now, Math.random, performance.now, setTimeout, setInterval, requestAnimationFrame, fetch). Không dùng ảnh/URL bên ngoài (chỉ HTML/CSS/SVG, emoji(), slIcon()). Dùng esc() cho chữ.
7. Phần tử gốc của mỗi module có \${cidOf(s)}; mỗi module phải VẼ RA THỨ NHÌN THẤY ĐƯỢC trong suốt [t0, t1].
8. Code mới, gọn (≤ 22 KB), không sao chép ví dụ nguyên văn.

# Trả lời
Chỉ trả về đúng 3 phần theo thứ tự, mỗi phần bắt đầu bằng dòng đánh dấu riêng (không thêm gì khác):
=====META=====
{"name":"tên style tiếng Việt ≤ 28 ký tự","slug":"ten-ngan-khong-dau","desc":"1 câu mô tả","category":"${o.category || 'một trong ' + CATS.join('|')}","tags":["…"],"needs":["người dùng cần thay gì"],"title":"tiêu đề intro mẫu","music":"<mood>","seen":"${kind === 'clone' || imgs.length ? '2–3 câu mô tả CỤ THỂ những gì bạn thấy trong các ảnh (màu nền, vị trí và kiểu phụ đề, icon, bố cục…)' : 'để trống'}","skill_description":"mô tả skill Claude Code tiếng Việt ≤ 700 ký tự: style này là gì, dùng khi nào, có các cụm từ kích hoạt như 'edit video kiểu …', 'dựng theo style …'","summary":"2 câu tóm tắt style"}
=====SPEC=====
(STYLE SPEC markdown tiếng Việt: ## Bảng màu (hex + vai trò), ## Font, ## Phụ đề, ## Graphic (từng loại: khi nào dùng, thời lượng, vị trí), ## Chuyển cảnh & hiệu ứng, ## Nhạc & SFX, ## Nhịp dựng, ## Module của gói (type → tham số chính))
=====PACK_JS=====
(mã JS thuần, không bọc \`\`\`)
=====END=====`;
}
const fixPrompt = (problems, warn) => `Gói bạn viết CHƯA qua kiểm tra tự động trong engine thật (headless Chrome, footage người nói, khung 360×640):
${problems.map(p => '- ' + p).join('\n')}${warn.length ? `\nCảnh báo (nên sửa): \n${warn.map(p => '- ' + p).join('\n')}` : ''}
Sửa toàn bộ lỗi trên (giữ nguyên phong cách và id P = '__ID__'). Trả về lại đầy đủ theo đúng định dạng: =====META===== (có thể giữ nguyên), =====SPEC===== (cập nhật nếu đổi module), =====PACK_JS===== (TOÀN BỘ mã đã sửa), =====END=====.`;

// ---------- validation in the real engine ----------
export async function validatePack(code, id, { outDir, vertical = true } = {}) {
  const problems = [], warnings = [], stills = [];
  try { new Function(code); } catch (e) { return { ok: false, problems: ['Lỗi cú pháp JS: ' + e.message], warnings, stills }; }
  const bad = code.match(/Date\.now|Math\.random|performance\.now|setTimeout|setInterval|requestAnimationFrame|\bfetch\s*\(|XMLHttpRequest/g);
  if (bad) problems.push(`Không được dùng ${[...new Set(bad)].join(', ')} (mọi hoạt ảnh phải thuần theo t)`);
  if (!/^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*\(\s*(?:\(\s*\)\s*=>|function\b)/.test(code)) problems.push('Toàn bộ file phải bọc trong IIFE (() => { … })();');
  if (/https?:\/\/(?!fonts\.googleapis\.com|www\.w3\.org)/.test(code)) warnings.push('Có URL ngoài (chỉ được nạp font Google)');
  if (code.length > 40000) warnings.push(`Mã dài ${Math.round(code.length / 1024)} KB (nên ≤ 22 KB)`);
  const ft = footage();
  const { default: puppeteer } = await import('puppeteer-core');
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--force-color-profile=srgb', '--hide-scrollbars'] });
  try {
    const [W, H] = vertical ? [360, 640] : [640, 360];
    const pg = await b.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|net::|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await pg.setViewport({ width: W, height: H });
    await pg.goto(pathToFileURL(path.join(SKILL, 'engine/index.html')).href, { waitUntil: 'networkidle0', timeout: 60e3 });
    const tl = ft ? JSON.parse(JSON.stringify(ft.tl)) : { width: 720, height: 1280, fps: 30, duration: 24, aroll: { frames: 'none/%05d.jpg', count: 1 } };
    const caps = JSON.parse(JSON.stringify(ft?.caps?.length ? ft.caps : SAMPLE_CAPS)).map((c, i) => ({ ...c, cid: 'c' + i }));
    const nFr = ft ? (tl.aroll.count || fs.readdirSync(path.join(ft.dir, path.dirname(tl.aroll.frames))).length) : 1;
    Object.assign(tl, { width: W, height: H, captions: caps, scenes: [], fx: [], base: ft ? pathToFileURL(ft.dir).href + '/' : '', aroll: { ...tl.aroll, count: nFr } });
    delete tl.clips;
    if (vertical !== ((ft?.tl.height || 1280) > (ft?.tl.width || 720)) && ft) tl.clips = [{ src: { seq: ft.tl.aroll.frames, fps: ft.tl.fps || 30, count: nFr }, in: 0, out: +(nFr / (ft.tl.fps || 30)).toFixed(3), fit: 'blurfill' }];
    await pg.evaluate(t => window.init(t), tl);
    errs.length = 0;
    await pg.addScriptTag({ content: code }).catch(e => errs.push(e.message));
    if (errs.length) return { ok: false, problems: ['Lỗi khi nạp gói: ' + [...new Set(errs)].join(' | ')], warnings, stills };
    const meta = await pg.evaluate(P => {
      const pk = PACKS.filter(p => p.id === P);
      if (!pk.length) return { err: `Không có PACKS entry với id "${P}" (phải PACKS.push({ id: P, … }))` };
      const p = pk[pk.length - 1];
      return { name: p.name, caption: p.caption, hasCap: !!CAPTION_STYLES[p.caption], recipe: typeof p.recipe === 'function',
        items: (p.items || []).map(it => ({ type: it.type, label: it.label, mod: typeof MODULES[it.type] === 'function', make: typeof it.make === 'function' })) };
    }, id);
    if (meta.err) return { ok: false, problems: [meta.err], warnings, stills };
    if (meta.items.length < 3 || meta.items.length > 8) problems.push(`Gói có ${meta.items.length} item (cần 3–8)`);
    for (const it of meta.items) {
      if (!String(it.type).startsWith(id + '_')) problems.push(`type "${it.type}" phải bắt đầu bằng "${id}_"`);
      if (!it.mod) problems.push(`Không có MODULES["${it.type}"]`);
      if (!it.make) problems.push(`item ${it.type} thiếu make(T)`);
    }
    if (!meta.caption || !meta.hasCap) problems.push(`Kiểu phụ đề "${meta.caption}" không có trong CAPTION_STYLES`);
    if (!meta.recipe) problems.push('Thiếu recipe(ctx)');
    // screenshot → mean abs pixel difference against the same frame without the scene (decoded in the page)
    const shot = async () => 'data:image/png;base64,' + (await pg.screenshot({ type: 'png', encoding: 'base64' }));
    const diff = (a, c) => pg.evaluate(async (a, c) => {
      const ld = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
      const [x, y] = await Promise.all([ld(a), ld(c)]); const w = 180, h = Math.round(180 * x.height / x.width);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
      g.drawImage(x, 0, 0, w, h); const A = g.getImageData(0, 0, w, h).data; g.drawImage(y, 0, 0, w, h); const B = g.getImageData(0, 0, w, h).data;
      let s = 0, n = 0; for (let i = 0; i < A.length; i += 4) { const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])); s += d; if (d > 28) n++; }
      return Math.max(s / (A.length / 4) / .6, n / (A.length / 4) * 400); // ≥ 1 ≈ visible: mean diff ≥ .6 or ≥ .25 % of pixels clearly changed
    }, a, c);
    const render = async (t, setup) => { errs.length = 0; const r = await pg.evaluate(async (t, setup) => { try { eval(setup); await window.renderFrame(t); return { ok: 1, cids: [...document.querySelectorAll('#stage [data-cid]')].map(e => e.dataset.cid), cap: document.querySelector('#cap')?.innerText || '' }; } catch (e) { return { err: e.message }; } }, t, setup); if (r.err) errs.push(r.err); return r; };
    const save = async (name) => { if (!outDir) return; const f = path.join(outDir, name); fs.writeFileSync(f, await pg.screenshot({ type: 'jpeg', quality: 80 })); stills.push(name); };
    const capSet = `TL.caption_style = ${JSON.stringify(meta.caption)};`;
    const base = {};
    const T = 4;
    for (const [i, it] of meta.items.entries()) {
      if (!it.mod || !it.make) continue;
      const sc = await pg.evaluate((P, i, T) => { try { const p = PACKS.filter(x => x.id === P).pop(); const s = p.items[i].make(T); return s && typeof s === 'object' ? s : { err: 'make() không trả về object' }; } catch (e) { return { err: e.message }; } }, id, i, T);
      if (sc.err) { problems.push(`${it.type}: make(T) lỗi: ${sc.err}`); continue; }
      if (!(sc.t1 > sc.t0)) { problems.push(`${it.type}: make(T) phải có t0 < t1`); continue; }
      const a = Math.max(sc.t0, T), z = Math.min(sc.t1, a + 6);
      const times = [a + Math.min(.25, (z - a) / 4), (a + z) / 2, z - Math.min(.15, (z - a) / 6)].map(x => +x.toFixed(2));
      let maxd = 0, cidOk = false, err = null;
      for (const t of times) {
        if (!base[t]) { await render(t, `${capSet} TL.scenes = []; TL.fx = [];`); base[t] = await shot(); }
        const r = await render(t, `${capSet} TL.fx = []; TL.scenes = [Object.assign(${JSON.stringify(sc)}, { cid: 'v${i}' })];`);
        if (r.err || errs.length) { err = r.err || errs.join(' | '); break; }
        if (r.cids.includes('v' + i)) cidOk = true;
        maxd = Math.max(maxd, await diff(base[t], await shot()));
        if (t === times[1]) await save(`item_${i + 1}_${it.type.slice(id.length + 1)}.jpg`);
      }
      if (err) problems.push(`${it.type} lỗi khi render: ${err}`);
      else {
        if (!cidOk) problems.push(`${it.type}: không có phần tử data-cid (thêm \${cidOf(s)} vào div gốc)`);
        if (maxd < 1) problems.push(`${it.type}: render ra khung gần như trống (không thấy khác biệt so với video gốc)`);
      }
    }
    // captions
    const ci = Math.min(2, caps.length - 1), c = caps[ci];
    if (c) {
      const tc = +(c.words[Math.min(1, c.words.length - 1)].e + .05).toFixed(2);
      const r = await render(tc, `${capSet} TL.scenes = []; TL.fx = []; TL.captions[${ci}].words[0].hl = true;`);
      if (r.err) problems.push(`Kiểu phụ đề lỗi: ${r.err}`);
      else if (!r.cids.includes(c.cid)) problems.push('Phụ đề: #cap thiếu data-cid (dùng ${cidOf(c)})');
      else if (!r.cap.trim()) problems.push('Phụ đề không hiện chữ');
      await save('caption.jpg');
    }
    // recipe on the real captions
    const rec = await pg.evaluate((P) => {
      try {
        const p = PACKS.filter(x => x.id === P).pop();
        const r = p.recipe({ dur: TL.duration, captions: TL.captions, brand: BR(), vertical: VERT(), title: 'Tiêu đề thử', opts: {} });
        if (!r || !Array.isArray(r.scenes)) return { err: 'recipe phải trả về { scenes: [...] }' };
        const bad = r.scenes.filter(s => !MODULES[s.type]).map(s => s.type);
        const badT = r.scenes.filter(s => !(typeof s.t0 === 'number' && typeof s.t1 === 'number' && s.t1 > s.t0 && s.t0 >= 0 && s.t0 < TL.duration)).map(s => s.type);
        const empty = p.recipe({ dur: 12, captions: [], brand: BR(), vertical: VERT(), title: '', opts: {} });
        return { n: r.scenes.length, bad, badT, cap: r.caption_style, music: r.music, fx: (r.fx || []).length, emptyOk: !!empty?.scenes, r };
      } catch (e) { return { err: e.message }; }
    }, id);
    let recipe = null;
    if (rec.err) problems.push('recipe lỗi: ' + rec.err);
    else {
      recipe = { scenes: rec.n, fx: rec.fx, music: rec.music, caption_style: rec.cap, types: [...new Set(rec.r.scenes.map(s => s.type))] };
      if (rec.n < 3) problems.push(`recipe chỉ tạo ${rec.n} cảnh (cần ≥ 3: intro, graphic, CTA)`);
      if (rec.bad.length) problems.push('recipe dùng type không có: ' + rec.bad.join(', '));
      if (rec.badT.length) problems.push('recipe có cảnh sai t0/t1: ' + rec.badT.join(', '));
      if (!rec.emptyOk) problems.push('recipe lỗi khi captions rỗng');
      if (rec.music && !MOODS.includes(String(rec.music).replace(/_2$/, ''))) warnings.push(`music "${rec.music}" không có trong thư viện`);
      const set = `TL.scenes = ${JSON.stringify(rec.r.scenes)}.map((s, i) => ({ ...s, cid: 'r' + i })); TL.fx = ${JSON.stringify(rec.r.fx || [])}; TL.caption_style = ${JSON.stringify(rec.r.caption_style || meta.caption)};`;
      const dur = tl.duration;
      const ts = [.8, 2, dur * .3, dur * .5, dur * .7, dur - 1.2].map(x => +Math.max(.1, Math.min(dur - .1, x)).toFixed(2));
      let firstHtml = null;
      for (const [k, t] of ts.entries()) {
        const r = await render(t, set);
        if (r.err || errs.length) { problems.push(`recipe render lỗi tại ${t}s: ${r.err || errs.join(' | ')}`); break; }
        await save(`recipe_${k + 1}_${t}s.jpg`);
        if (k === 2) firstHtml = await pg.evaluate(() => document.getElementById('stage').innerHTML);
      }
      if (firstHtml) { await render(ts[2], set); const again = await pg.evaluate(() => document.getElementById('stage').innerHTML); if (again !== firstHtml) problems.push('Render không thuần theo t: cùng thời điểm cho ra HTML khác nhau (có state/biến toàn cục thay đổi?)'); }
    }
    // other orientation: no crash
    await pg.setViewport({ width: H, height: W });
    await pg.evaluate((w, h) => { TL.width = w; TL.height = h; delete TL.clips; return window.init(TL); }, H, W);
    const other = [];
    for (const [i, it] of meta.items.entries()) {
      if (!it.mod || !it.make) continue;
      const r = await render(5, `${capSet} TL.fx = []; TL.scenes = [Object.assign(PACKS.filter(x => x.id === ${JSON.stringify(id)}).pop().items[${i}].make(4), { cid: 'h${i}' })];`);
      if (r.err || errs.length) other.push(`${it.type}: ${r.err || errs.join(' | ')}`);
      else if (i === 0) await save(`other_orientation.jpg`);
    }
    if (other.length) problems.push(`Lỗi khi render khổ ${vertical ? 'ngang 16:9' : 'dọc 9:16'}: ` + other.join('; '));
    return { ok: !problems.length, problems, warnings, stills, meta: { name: meta.name, caption: meta.caption, items: meta.items.map(i => i.type) }, recipe };
  } finally { await b.close(); }
}

// ---------- install / list / delete ----------
export function rebuildAll() {
  fs.mkdirSync(UPACK, { recursive: true });
  const files = fs.readdirSync(UPACK).filter(f => f.endsWith('.js') && f !== '_all.js').sort();
  const body = files.map(f => `// ---- ${f} ----\ntry {\n${fs.readFileSync(path.join(UPACK, f), 'utf8')}\n} catch (e) { console.error('user pack ${f}', e); }\n`).join('\n');
  fs.writeFileSync(path.join(UPACK, '_all.js'), `// Gói style của người dùng (Style Lab, scripts/style_lab.mjs) — file tự sinh, đừng sửa tay: sửa engine/packs/user/<id>.js rồi chạy "node scripts/style_lab.mjs sync".\n${body}`);
  return files.length;
}
function uniqueId(slug) {
  let id = 'u_' + (slugify(slug) || 'style');
  for (let k = 2; fs.existsSync(path.join(UPACK, id + '.js')) || fs.existsSync(path.join(STORE, id + '.js')); k++) id = 'u_' + slugify(slug) + '_' + k;
  return id;
}
function skillMd(id, meta, spec, src) {
  const slug = id.replace(/^u_/, '').replace(/_/g, '-');
  let desc = String(meta.skill_description || meta.desc || '').replace(/\s+/g, ' ').replace(/"/g, '\'');
  desc = `Style video "${meta.name}" cho AI Video Studio (gói ${id}). ${desc} Dùng khi người dùng muốn edit video theo style "${meta.name}" hoặc gọi tên skill video-style-${slug}.`.replace(/"/g, '\'');
  if (desc.length > 1000) desc = desc.slice(0, 997) + '…';
  return { name: `video-style-${slug}`, text: `---
name: video-style-${slug}
description: "${desc}"
---
<!-- avs-style-id: ${id} (tạo bởi AI Video Studio Style Lab, ${new Date().toISOString().slice(0, 10)}) -->
# Style "${meta.name}"

${meta.summary || meta.desc || ''}
Nguồn: ${src}. Gói engine: \`${id}\` · template: \`${id}\` · spec: \`references/user/${id}.md\`.

## Cách dùng (cần skill AI Video Studio tại \`~/.claude/skills/ai-video-studio\`, gọi là <skill>)
1. Kiểm tra gói đã có: \`ls <skill>/engine/packs/user/${id}.js\`. Nếu thiếu (ví dụ sau khi cài lại skill): \`node <skill>/scripts/style_lab.mjs sync\` (khôi phục từ \`~/.ai-video-studio/packs/\`).
2. Dự án từ clip thô: \`node <skill>/studio/server.mjs --new clip.mp4 <dir> --port 5186\` (nhận giọng, cắt lặng, phụ đề).
3. Áp style: \`node <skill>/scripts/style_lab.mjs apply ${id} <dir> --title "Tiêu đề"\` — hoặc trong Studio: Mẫu → "${meta.name}" → Dùng mẫu; panel "Tạo style" → Áp dụng cho dự án.
4. Tinh chỉnh như mọi gói: \`TL.pack = "${id}"\`, \`caption_style = "${id}"\`, thêm/sửa scene theo bảng module bên dưới, sửa phụ đề (hl, br).
5. QC + render: \`node <skill>/scripts/render.mjs <dir>/timeline.json x --still 3 qc.jpg\`, rồi mở Studio bấm Xuất (hoặc \`mix_audio.py\` + \`render.mjs\` theo SKILL.md của AI Video Studio).

## Style spec
${spec}
` };
}
export async function install(work, { id, code, spec, meta, kind, src, aspect, footageDir }) {
  for (const d of [UPACK, STORE, UTPL, UREF, path.join(TPL, 'previews')]) fs.mkdirSync(d, { recursive: true });
  const head = `// Style Lab: "${meta.name}" (${kind === 'clone' ? 'clone từ video ' + src : 'tạo từ mô tả'}) — ${new Date().toISOString().slice(0, 10)}. Spec: references/user/${id}.md\n`;
  const js = head + code.trim() + '\n';
  fs.writeFileSync(path.join(UPACK, id + '.js'), js); fs.writeFileSync(path.join(STORE, id + '.js'), js);
  rebuildAll();
  const sk = skillMd(id, meta, spec, kind === 'clone' ? `clone từ video tham chiếu "${src}"` : `mô tả: “${String(src).slice(0, 200)}”`);
  const tpl = {
    id, name: String(meta.name || id).slice(0, 28), category: CATS.includes(meta.category) ? meta.category : 'khac', aspect, pack: id,
    desc: String(meta.desc || '').slice(0, 200), tags: [...(Array.isArray(meta.tags) ? meta.tags.slice(0, 6) : []), 'style của tôi'], title: String(meta.title || meta.name || 'Tiêu đề').slice(0, 60),
    caption_style: id, music: MOODS.includes(String(meta.music).replace(/_2$/, '')) ? meta.music : undefined, use_recipe: true, base_dur: 20.2,
    needs: Array.isArray(meta.needs) ? meta.needs.slice(0, 5) : [], preview: { from: 0, to: 6, still: 2.2 },
    style_lab: { kind, src: String(src).slice(0, 300), created: new Date().toISOString(), seen: meta.seen || '', summary: meta.summary || '', skill: sk.name, skill_desc: String(meta.skill_description || '').slice(0, 800), work },
  };
  fs.writeFileSync(path.join(UTPL, id + '.json'), JSON.stringify(tpl, null, 1)); fs.writeFileSync(path.join(STORE, id + '.json'), JSON.stringify(tpl, null, 1));
  const md = `# Style "${meta.name}" (\`${id}\`)\n\n> ${meta.summary || meta.desc || ''}\n\nNguồn: ${tpl.style_lab.src}. Tạo bởi Style Lab (Claude Code CLI).\n\n${spec}\n`;
  fs.writeFileSync(path.join(UREF, id + '.md'), md); fs.writeFileSync(path.join(STORE, id + '.md'), md);
  const skDir = path.join(SKILLS, sk.name); fs.mkdirSync(skDir, { recursive: true }); fs.writeFileSync(path.join(skDir, 'SKILL.md'), sk.text);
  // preview video on the footage project
  let preview = null;
  if (footageDir) {
    const r = await new Promise(ok => { const p = child = spawn('node', [path.join(SKILL, 'scripts/build_templates.mjs'), footageDir, id], { stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; p.stdout.on('data', d => (o += d)); p.stderr.on('data', d => (o += d)); p.on('close', c => { child = null; ok({ c, o }); }); });
    preview = { ok: r.c === 0, log: r.o.trim().split('\n').slice(-3).join('\n'), mp4: `templates/previews/${id}.mp4`, jpg: `templates/previews/${id}.jpg` };
    for (const e of ['mp4', 'jpg']) { const f = path.join(TPL, 'previews', `${id}.${e}`); if (fs.existsSync(f)) fs.copyFileSync(f, path.join(STORE, `${id}.${e}`)); }
  }
  return { id, pack: path.join(UPACK, id + '.js'), template: path.join(UTPL, id + '.json'), spec: path.join(UREF, id + '.md'), store: STORE, skill: path.join(skDir, 'SKILL.md'), preview };
}
export function listStyles() {
  sync(true);
  if (!fs.existsSync(UTPL)) return [];
  return fs.readdirSync(UTPL).filter(f => f.endsWith('.json')).map(f => rd(path.join(UTPL, f))).filter(t => t?.style_lab)
    .map(t => ({ id: t.id, name: t.name, desc: t.desc, aspect: t.aspect, kind: t.style_lab.kind, src: t.style_lab.src, created: t.style_lab.created, summary: t.style_lab.summary,
      skill: t.style_lab.skill, installed: fs.existsSync(path.join(UPACK, t.id + '.js')), preview: fs.existsSync(path.join(TPL, 'previews', t.id + '.mp4')) ? `/templates/previews/${t.id}.mp4` : null,
      thumb: fs.existsSync(path.join(TPL, 'previews', t.id + '.jpg')) ? `/templates/previews/${t.id}.jpg` : null }))
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
}
// Restore packs/templates/specs from ~/.ai-video-studio/packs (e.g. after the skill folder was reinstalled).
export function sync(quiet) {
  let n = 0;
  if (fs.existsSync(STORE)) for (const f of fs.readdirSync(STORE).filter(f => /^u_.*\.js$/.test(f))) {
    const id = f.slice(0, -3);
    const pairs = [[f, path.join(UPACK, f)], [id + '.json', path.join(UTPL, id + '.json')], [id + '.md', path.join(UREF, id + '.md')], [id + '.mp4', path.join(TPL, 'previews', id + '.mp4')], [id + '.jpg', path.join(TPL, 'previews', id + '.jpg')]];
    for (const [a, b] of pairs) if (fs.existsSync(path.join(STORE, a)) && !fs.existsSync(b)) { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(path.join(STORE, a), b); n++; }
  }
  if (n || !fs.existsSync(path.join(UPACK, '_all.js'))) rebuildAll();
  // Claude skill video-style-* of every installed style (also the bundled ones on a fresh install)
  if (fs.existsSync(UTPL) && !args.includes('--no-skills')) for (const f of fs.readdirSync(UTPL).filter(f => /^u_.*\.json$/.test(f))) {
    const t = rd(path.join(UTPL, f)), id = f.slice(0, -5), ref = path.join(UREF, id + '.md');
    if (!t?.style_lab?.skill || fs.existsSync(path.join(SKILLS, t.style_lab.skill, 'SKILL.md')) || !fs.existsSync(ref)) continue;
    const spec = fs.readFileSync(ref, 'utf8').split('\n').reduce((a, l) => (a.on ? a.out.push(l) : /^Nguồn:/.test(l) && (a.on = true), a), { on: false, out: [] }).out.join('\n').trim();
    const sl = t.style_lab, sk = skillMd(id, { name: t.name, desc: t.desc, skill_description: sl.skill_desc, summary: sl.summary }, spec, sl.kind === 'clone' ? `clone từ video tham chiếu "${sl.src}"` : `mô tả: “${String(sl.src).slice(0, 200)}”`);
    fs.mkdirSync(path.join(SKILLS, sk.name), { recursive: true }); fs.writeFileSync(path.join(SKILLS, sk.name, 'SKILL.md'), sk.text); n++;
  }
  if (!quiet) console.log(`sync: khôi phục ${n} file`);
  return n;
}
export function removeStyle(id) {
  if (!/^u_[a-z0-9_]+$/.test(id)) throw new Error('id không hợp lệ');
  const t = rd(path.join(UTPL, id + '.json'));
  const gone = [];
  const rm = f => { if (fs.existsSync(f)) { fs.rmSync(f, { force: true }); gone.push(f); } };
  rm(path.join(UPACK, id + '.js')); rm(path.join(UTPL, id + '.json')); rm(path.join(UREF, id + '.md'));
  for (const e of ['mp4', 'jpg']) rm(path.join(TPL, 'previews', `${id}.${e}`));
  for (const e of ['js', 'json', 'md', 'mp4', 'jpg']) rm(path.join(STORE, `${id}.${e}`));
  const sk = t?.style_lab?.skill && path.join(SKILLS, t.style_lab.skill, 'SKILL.md');
  if (sk && fs.existsSync(sk) && fs.readFileSync(sk, 'utf8').includes(`avs-style-id: ${id} `)) { fs.rmSync(path.dirname(sk), { recursive: true, force: true }); gone.push(path.dirname(sk)); }
  rebuildAll();
  return gone;
}
// Apply a style's template to a project (same engine function Studio uses).
async function applyToProject(id, dir, title) {
  const tlFile = path.resolve(dir, dir.endsWith('.json') ? '' : 'timeline.json');
  const tl = rd(tlFile), tpl = rd(path.join(UTPL, id + '.json'));
  if (!tl) throw new Error('Không đọc được ' + tlFile);
  if (!tpl) throw new Error('Không có style ' + id);
  const caps = typeof tl.captions === 'string' ? rd(path.join(path.dirname(tlFile), tl.captions), []) : tl.captions || [];
  const { default: puppeteer } = await import('puppeteer-core');
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  try {
    const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(pathToFileURL(path.join(SKILL, 'engine/index.html')).href, { waitUntil: 'domcontentloaded' });
    const out = await pg.evaluate((tl, tpl, caps, title) => { const t = { ...tl, captions: caps }; window.applyTemplate(t, tpl, caps, title || tpl.title); t.captions = tl.captions; return t; }, tl, tpl, caps, title || tl.title || '');
    if (errs.length) throw new Error(errs.join(' | '));
    fs.mkdirSync(path.join(path.dirname(tlFile), '.studio/history'), { recursive: true });
    fs.copyFileSync(tlFile, path.join(path.dirname(tlFile), '.studio/history', `before_${id}_${Date.now()}.json`));
    fs.writeFileSync(tlFile, JSON.stringify(out, null, 1));
    console.log(`đã áp style ${id} → ${tlFile}: ${out.scenes.length} cảnh, phụ đề ${out.caption_style}`);
  } finally { await b.close(); }
}

// ---------- side-by-side comparison still (reference frames over our recipe stills) ----------
function compare(work, an, stills) {
  const ref = an ? fs.readdirSync(path.join(work, 'keyframes')).filter(f => f.endsWith('.jpg')).sort() : [];
  const ours = stills.filter(s => s.startsWith('recipe_')).slice(0, 4);
  if (!ref.length || !ours.length) return null;
  const pick = [0, .3, .6, .9].map(k => ref[Math.min(ref.length - 1, Math.round(k * (ref.length - 1)))]).slice(0, ours.length);
  const [w, h] = (an.height > an.width) ? [270, 480] : [480, 270];
  const inp = [...pick.map(f => path.join(work, 'keyframes', f)), ...ours.map(f => path.join(work, 'check', f))].flatMap(f => ['-i', f]);
  const n = ours.length;
  const sc = [...Array(2 * n).keys()].map(i => `[${i}]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x18181c[v${i}]`).join(';');
  const fc = `${sc};${[...Array(n).keys()].map(i => `[v${i}]`).join('')}hstack=${n}[top];${[...Array(n).keys()].map(i => `[v${n + i}]`).join('')}hstack=${n}[bot];[top][bot]vstack[o]`;
  const out = path.join(work, 'compare.jpg');
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', ...inp, '-filter_complex', n > 1 ? fc : `${sc};[v0][v1]vstack[o]`, '-map', '[o]', '-q:v', '4', out]); return 'compare.jpg'; } catch { return null; }
}

// ---------- the whole pipeline ----------
async function generate(kind) {
  const T0 = Date.now();
  const work = path.resolve(opt('--work', path.join(HOME, 'stylelab', new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '_' + kind)));
  fs.mkdirSync(path.join(work, 'check'), { recursive: true });
  const result = { kind, work, ok: false, started: new Date().toISOString(), rounds: [] };
  const finish = r => { Object.assign(result, r, { sec: Math.round((Date.now() - T0) / 1000) }); fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify(result, null, 1)); return result; };
  try {
    let an = null, src, vertical, images = [];
    if (kind === 'clone') {
      src = pos[1];
      if (!args.includes('--skip-analyze') || !fs.existsSync(path.join(work, 'analysis.json'))) {
        if (!src || !fs.existsSync(src)) throw new Error('Không thấy video tham chiếu: ' + src);
        await analyze(src, work, 0, .22);
      }
      an = rd(path.join(work, 'analysis.json'));
      src = src || an.src; vertical = an.height >= an.width;
    } else {
      src = opt('--desc') || pos[1] || '';
      if (fs.existsSync(path.join(work, 'desc.txt')) && !src) src = fs.readFileSync(path.join(work, 'desc.txt'), 'utf8');
      if (!src.trim()) throw new Error('Thiếu mô tả style');
      fs.writeFileSync(path.join(work, 'desc.txt'), src);
      vertical = opt('--orient', 'vertical') !== 'horizontal';
      for (const [i, f] of (opt('--images', '') || '').split(',').filter(Boolean).entries()) {
        const dst = `ref_${i + 1}.jpg`;
        try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', "scale='min(1280,iw)':-2", '-frames:v', '1', '-q:v', '4', path.join(work, dst)]); images.push(dst); } catch { console.error('bỏ ảnh không đọc được: ' + f); }
      }
    }
    const model = opt('--model', 'default');
    const o = { analysis: an, desc: src, orient: vertical ? 'vertical' : 'horizontal', industry: opt('--industry'), colors: opt('--colors'), font: opt('--font'), images, vertical, category: opt('--category') };
    const prompt = buildPrompt(kind, o);
    fs.writeFileSync(path.join(work, 'prompt.txt'), prompt);
    say(.25, `Claude đang ${kind === 'clone' ? 'xem contact sheet và ' : ''}thiết kế style + viết gói (2–8 phút)`);
    const tick = (p0, p1, label) => (s, act) => say(p0 + (p1 - p0) * (1 - Math.exp(-s / 180)), `${label}: ${act} · ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
    let res = await callClaude(prompt, { cwd: work, model, onTick: tick(.25, .6, 'Claude đang thiết kế style và viết gói') });
    fs.writeFileSync(path.join(work, 'claude_1.txt'), res.text);
    let sec = sections(res.text), meta = parseMeta(sec.META), spec = sec.SPEC, code = sec.PACK_JS;
    result.rounds.push({ sec: res.sec, turns: res.turns, cost: res.cost, model: res.model, reads: res.reads });
    if (!code) throw new Error('Claude không trả về mã gói (PACK_JS). Xem ' + path.join(work, 'claude_1.txt'));
    meta = meta || {}; meta.name = meta.name || opt('--name') || 'Style mới';
    if (opt('--name')) meta.name = opt('--name');
    const id = uniqueId(opt('--name') ? slugify(opt('--name')) : meta.slug || meta.name);
    const fill = c => c.replace(/__ID__/g, id);
    code = fill(code);
    let v, maxR = +opt('--rounds', 2);
    for (let r = 0; ; r++) {
      say(.62 + r * .12, `Kiểm tra gói trong engine (vòng ${r + 1})`);
      fs.writeFileSync(path.join(work, `pack_${r + 1}.js`), code);
      for (const f of fs.readdirSync(path.join(work, 'check'))) fs.rmSync(path.join(work, 'check', f));
      v = await validatePack(code, id, { outDir: path.join(work, 'check'), vertical });
      result.rounds[r] = { ...(result.rounds[r] || {}), problems: v.problems, warnings: v.warnings };
      fs.writeFileSync(path.join(work, 'validation.json'), JSON.stringify(v, null, 1));
      if (v.ok || r >= maxR) break;
      say(.66 + r * .12, `Gói còn ${v.problems.length} lỗi — gửi lại Claude sửa (vòng ${r + 1}/${maxR})`);
      res = await callClaude(fixPrompt(v.problems, v.warnings).replace(/__ID__/g, id), { cwd: work, model, resume: res.session, onTick: tick(.66 + r * .12, .72 + r * .12, `Claude đang sửa lỗi (vòng ${r + 1})`) });
      fs.writeFileSync(path.join(work, `claude_${r + 2}.txt`), res.text);
      result.rounds.push({ sec: res.sec, turns: res.turns, cost: res.cost, model: res.model, reads: res.reads });
      sec = sections(res.text);
      if (sec.PACK_JS) code = fill(sec.PACK_JS);
      if (sec.SPEC) spec = sec.SPEC;
      const m2 = parseMeta(sec.META); if (m2) meta = { ...meta, ...m2, name: opt('--name') || m2.name || meta.name };
    }
    spec = fill(spec || '');
    fs.writeFileSync(path.join(work, 'spec.md'), spec); fs.writeFileSync(path.join(work, 'meta.json'), JSON.stringify(meta, null, 1)); fs.writeFileSync(path.join(work, 'pack.js'), code);
    const cmp = compare(work, an, v.stills);
    const base = { id, name: meta.name, meta, spec, validation: v, stills: v.stills.map(s => 'check/' + s), compare: cmp, turns: result.rounds.map(r => r.turns), seen: meta.seen || '' };
    if (!v.ok) return finish({ ...base, ok: false, error: `Gói chưa qua kiểm tra sau ${maxR} vòng sửa: ${v.problems.slice(0, 4).join('; ')}` });
    if (args.includes('--no-install')) return finish({ ...base, ok: true, installed: false });
    say(.88, 'Cài gói + tạo template, skill, video xem trước');
    const ft = footage();
    const files = await install(work, { id, code, spec, meta, kind, src: kind === 'clone' ? path.basename(src) : src, aspect: vertical ? '9:16' : '16:9', footageDir: ft?.dir });
    say(1, 'Xong');
    return finish({ ...base, ok: true, installed: true, files });
  } catch (e) {
    finish({ ok: false, error: e.message });
    throw e;
  }
}
function analyze(video, work, p0 = 0, p1 = 1) {
  return new Promise((ok, bad) => {
    const p = child = spawn(PY, ['-I', '-X', 'utf8', path.join(SKILL, 'scripts/style_analyze.py'), path.resolve(video), work, '--model', opt('--whisper', 'large-v3-turbo'), '--lang', opt('--lang', 'vi')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = /^@@ ([\d.]+) (.*)$/.exec(l); if (m) say(p0 + (p1 - p0) * +m[1], 'Phân tích video: ' + m[2]); }));
    p.stderr.on('data', d => (err += d));
    p.on('close', c => { child = null; c === 0 ? ok() : bad(new Error('Phân tích video lỗi: ' + (err.match(/LỖI: .*/)?.[0] || err.trim().split('\n').slice(-2).join(' ')))); });
  });
}

async function main() {
  const cmd = pos[0];
  if (cmd === 'clone' || cmd === 'describe') {
    const r = await generate(cmd);
    console.log(JSON.stringify({ ok: r.ok, id: r.id, name: r.name, sec: r.sec, error: r.error, files: r.files, problems: r.validation?.problems, work: r.work }, null, 1));
    if (!r.ok) process.exit(1);
  } else if (cmd === 'analyze') {
    const work = path.resolve(opt('--work', path.join(HOME, 'stylelab', new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '_clone')));
    fs.mkdirSync(work, { recursive: true });
    await analyze(pos[1], work); console.log(work);
  } else if (cmd === 'validate') {
    const code = fs.readFileSync(pos[1], 'utf8'), id = opt('--id', (/const\s+P\s*=\s*['"]([^'"]+)/.exec(code) || [])[1]);
    const out = opt('--work'); if (out) fs.mkdirSync(out, { recursive: true });
    const v = await validatePack(code, id, { outDir: out, vertical: opt('--orient', 'vertical') !== 'horizontal' });
    console.log(JSON.stringify(v, null, 1)); if (!v.ok) process.exit(1);
  } else if (cmd === 'apply') await applyToProject(pos[1], pos[2], opt('--title'));
  else if (cmd === 'list') console.log(JSON.stringify(listStyles(), null, 1));
  else if (cmd === 'sync') sync();
  else if (cmd === 'delete') console.log('đã xoá:\n' + removeStyle(pos[1]).join('\n'));
  else if (cmd === 'check') { const r = await callClaude('Trả lời đúng một từ: OK', { cwd: os.tmpdir(), model: 'haiku', timeout: 60e3 }); console.log('claude:', r.text.trim()); }
  else { console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 14).join('\n')); process.exit(2); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) main().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
