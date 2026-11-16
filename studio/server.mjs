// AI Video Studio — local editor server (no dependencies beyond Node ≥ 18).
// usage: node studio/server.mjs [project_dir | timeline.json] [--port 5186] [--open]
//        node studio/server.mjs --new raw.mp4 [project_dir]      (build a starter project, then open it)
// Serves the editor UI (studio/, incl. studio/thumbs/), the render engine (engine/), the skill's sound/music library (assets/),
// the template gallery (templates/, override with --templates <dir>)
// and the project's files (/project/...). Saves timeline.json with history snapshots in <project>/.studio/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { killTree, openPath, pyBin, revealPath } from '../scripts/platform.mjs';
import { cached } from '../scripts/net_cache.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..');
const PY = pyBin(SKILL);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = +opt('--port', process.env.PORT || 5186);
const VERSION = '4.0';
// Template gallery (GET /api/templates): <skill>/templates/*.json + templates/user/*.json, previews in templates/previews/.
const TPL_DIR = path.resolve(opt('--templates', process.env.AVS_TEMPLATES || path.join(SKILL, 'templates')));

let project = null; // { dir, tlFile }
function openProject(p) {
  const abs = path.resolve(p);
  const tlFile = abs.endsWith('.json') ? abs : path.join(abs, 'timeline.json');
  if (!fs.existsSync(tlFile)) throw new Error(`không thấy ${tlFile}`);
  project = { dir: path.dirname(tlFile), tlFile };
  fs.mkdirSync(path.join(project.dir, '.studio/history'), { recursive: true });
  console.log(`project: ${project.dir}`);
}

// Switching projects from the UI while a job runs would make that job write into the newly opened project.
function switchProject(p) {
  if (job?.state === 'running') throw new Error('Đang có tác vụ chạy (' + (job.step || job.kind) + ') — đợi xong hoặc huỷ rồi mới mở dự án khác');
  openProject(p);
}

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.aac': 'audio/aac' };
function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    // Revalidate with ETag so a reload answers most of the ~200 editor/engine files with an empty 304.
    // Version-pinned libraries (folders named pkg@x.y.z) never change → cached outright.
    const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', ETag: etag, 'Cache-Control': /[\\/](vendor|_lib)[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache' };
    if (!range && req.headers['if-none-match'] === etag) { res.writeHead(304, head); return res.end(); }
    if (range) {
      const a = range[1] ? +range[1] : 0, b = range[2] ? +range[2] : st.size - 1;
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 });
      return fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { ...head, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}
// Resolve url path under root; refuses anything escaping it.
function under(root, rel) {
  let r; try { r = decodeURIComponent(rel); } catch { return null; }
  if (r.includes('\0')) return null;
  const p = path.resolve(root, r.replace(/^\/+/, ''));
  return p === root || p.startsWith(root + path.sep) ? p : null;
}
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, bad) => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(new Error('Dữ liệu gửi lên không phải JSON hợp lệ')); } }); });
const P = rel => path.resolve(project.dir, rel);

function frameCount(tl) {
  if (!tl.aroll?.frames) return 0;
  const d = P(path.dirname(tl.aroll.frames));
  return fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.(jpe?g|png)$/i.test(f)).length : 0;
}
function readProject() {
  const tl = JSON.parse(fs.readFileSync(project.tlFile, 'utf8'));
  let captions = tl.captions;
  if (typeof captions === 'string' && fs.existsSync(P(captions))) captions = JSON.parse(fs.readFileSync(P(captions), 'utf8'));
  const audioSrc = [tl.audio?.voice, tl.audio?.mix].find(a => a && fs.existsSync(P(a))) || null;
  return { timeline: tl, captions: Array.isArray(captions) ? captions : [], meta: {
    name: path.basename(project.dir), dir: project.dir, version: VERSION, frames: frameCount(tl), audio: audioSrc,
    mix: tl.audio?.mix && fs.existsSync(P(tl.audio.mix)) ? tl.audio.mix : null,
    saved: fs.statSync(project.tlFile).mtimeMs, notes: fs.existsSync(P('.studio/notes.md')),
  } };
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
function writeNotes(tl, captions) {
  const out = [];
  const fmt = t => (t == null ? '' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);
  if (tl.note) out.push(`## Ghi chú chung\n${tl.note}\n`);
  (tl.scenes || []).forEach((s, i) => {
    if (s.note) out.push(`- scenes[${i}] ${s.type} ${fmt(s.t0)}–${fmt(s.t1)}: ${s.note}`);
    (s.lines || []).forEach((l, j) => l.note && out.push(`- scenes[${i}].lines[${j}] "${l.text}" @${fmt(l.t)}: ${l.note}`));
    (s.nodes || []).forEach((n, j) => n.note && out.push(`- scenes[${i}].nodes[${j}] ${n.kind} "${n.text || ''}": ${n.note}`));
  });
  captions.forEach((c, k) => c.note && out.push(`- captions[${k}] "${c.words.map(w => w.w).join(' ')}" ${fmt(c.t0)}: ${c.note}`));
  (tl.audio?.sfx || []).forEach((x, k) => x.note && out.push(`- audio.sfx[${k}] ${x.name} @${fmt(x.t)}: ${x.note}`));
  const f = P('.studio/notes.md');
  if (out.length) fs.writeFileSync(f, `# Ghi chú cho Claude (từ AI Video Studio)\nDự án: ${project.dir}\nCập nhật: ${new Date().toLocaleString('vi-VN')}\n\n${out.join('\n')}\n`);
  else if (fs.existsSync(f)) fs.unlinkSync(f);
  return out.length;
}
function save({ timeline, captions }) {
  if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) throw new Error('Thiếu timeline — không lưu');
  const tl = timeline;
  const capFile = typeof tl.captions === 'string' ? tl.captions : (captions?.length ? 'work/captions.json' : null);
  if (capFile) { fs.mkdirSync(path.dirname(P(capFile)), { recursive: true }); fs.writeFileSync(P(capFile), JSON.stringify(captions || [], null, 1)); tl.captions = capFile; }
  fs.writeFileSync(project.tlFile, JSON.stringify(tl, null, 1));
  fs.mkdirSync(path.join(project.dir, '.studio/history'), { recursive: true });
  const snap = path.join(project.dir, '.studio/history', `${stamp()}.json`);
  fs.writeFileSync(snap, JSON.stringify({ timeline: tl, captions }));
  // keep the newest 60 snapshots
  const all = fs.readdirSync(path.dirname(snap)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - 60))) fs.unlinkSync(path.join(path.dirname(snap), f));
  return { ok: true, notes: writeNotes(tl, captions || []), saved: Date.now() };
}

// ---------- library (sound, music, fonts) ----------
function library() {
  const sfxDir = path.join(SKILL, 'assets/sfx'), musDir = path.join(SKILL, 'assets/music');
  const sfx = fs.existsSync(sfxDir) ? fs.readdirSync(sfxDir).filter(f => /\.(flac|wav|mp3)$/.test(f)).sort() : [];
  const music = fs.existsSync(musDir) ? fs.readdirSync(musDir).filter(f => f.endsWith('.mp3')).sort() : [];
  return { sfx, music };
}

// ---------- waveform (peaks per 1/50 s) ----------
function waveform(cb) {
  const tl = JSON.parse(fs.readFileSync(project.tlFile, 'utf8'));
  const src = [tl.audio?.voice, tl.audio?.mix].find(a => a && fs.existsSync(P(a)));
  if (!src) return cb([]);
  const cache = P('.studio/wave.json');
  if (fs.existsSync(cache) && fs.statSync(cache).mtimeMs > fs.statSync(P(src)).mtimeMs) return cb(JSON.parse(fs.readFileSync(cache, 'utf8')));
  execFile('ffmpeg', ['-v', 'error', '-i', P(src), '-ac', '1', '-ar', '2000', '-f', 's16le', '-'], { encoding: 'buffer', maxBuffer: 1 << 29 }, (err, out) => {
    if (err) return cb([]);
    const n = out.length >> 1, step = 40, peaks = [];
    for (let i = 0; i < n; i += step) {
      let m = 0;
      for (let j = i; j < Math.min(n, i + step); j++) m = Math.max(m, Math.abs(out.readInt16LE(j * 2)));
      peaks.push(+(m / 32768).toFixed(3));
    }
    try { fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.writeFileSync(cache, JSON.stringify(peaks)); } catch {}
    cb(peaks);
  });
}

// ---------- media library (<project>/media) ----------
const IMG = /\.(jpe?g|png|webp|gif|svg)$/i, VID = /\.(mp4|mov|m4v|webm|mkv)$/i, AUD = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;
// Browsers play iPhone .mov (AAC + Apple spatial-audio track) silently, so the editor previews a clip's sound from
// <name>_frames/audio.m4a (first audio stream as AAC). Export still mixes the original file through ffmpeg.
const audioPending = new Set();
function extractAudio(src, fr, cb = () => {}) {
  const out = path.join(fr, 'audio.m4a');
  if (fs.existsSync(out) || audioPending.has(out)) return cb();
  audioPending.add(out);
  const tmp = path.join(fr, '.audio.tmp.m4a');
  execFile('ffmpeg', ['-v', 'error', '-y', '-i', src, '-map', '0:a:0?', '-vn', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', tmp], e => {
    audioPending.delete(out);
    if (!e && fs.existsSync(tmp) && fs.statSync(tmp).size > 1024) fs.renameSync(tmp, out); else fs.rmSync(tmp, { force: true });
    cb();
  });
}
function mediaList() {
  const d = P('media'); if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => !f.startsWith('.') && (IMG.test(f) || VID.test(f) || AUD.test(f))).sort().map(f => {
    const kind = IMG.test(f) ? 'image' : VID.test(f) ? 'video' : 'audio';
    const it = { name: f, path: `media/${f}`, kind };
    const fr = P(`media/${f.replace(/\.\w+$/, '')}_frames`);
    if (kind === 'video' && fs.existsSync(fr)) {
      const n = fs.readdirSync(fr).filter(x => x.endsWith('.jpg')).length;
      it.seq = { seq: `media/${path.basename(fr)}/%05d.jpg`, fps: 30, count: n }; it.thumb = `media/${path.basename(fr)}/00001.jpg`; it.dur = +(n / 30).toFixed(2);
      if (fs.existsSync(path.join(fr, 'audio.m4a'))) it.preview_audio = `media/${path.basename(fr)}/audio.m4a`;
      else extractAudio(P(`media/${f}`), fr); // videos imported before this existed: ready on the next list
    }
    if (kind === 'image') it.thumb = it.path;
    return it;
  });
}
// Stream the request body to media/<name>; videos are expanded to a 30 fps JPEG sequence the engine can seek.
function upload(req, name) {
  return new Promise((ok, bad) => {
    const safe = path.basename(name).replace(/[^\w.\-À-ỹ ]+/g, '_');
    fs.mkdirSync(P('media'), { recursive: true });
    const dst = P(`media/${safe}`), out = fs.createWriteStream(dst);
    req.pipe(out);
    out.on('error', bad);
    out.on('finish', () => {
      if (!VID.test(safe)) return ok({ name: safe });
      const fr = P(`media/${safe.replace(/\.\w+$/, '')}_frames`);
      fs.mkdirSync(fr, { recursive: true });
      execFile('ffmpeg', ['-v', 'error', '-y', '-i', dst, '-vf', 'fps=30,scale=w=1280:h=1280:force_original_aspect_ratio=decrease', '-q:v', '3', path.join(fr, '%05d.jpg')],
        e => (e ? bad(e) : extractAudio(dst, fr, () => ok({ name: safe }))));
    });
  });
}
function srt(captions) {
  const ts = x => { const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s2 = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  return captions.filter(c => !c.hidden).map((c, i) => `${i + 1}\n${ts(c.t0)} --> ${ts(c.t1)}\n${c.words.map(w => w.w).join(' ')}\n`).join('\n');
}
function still(t, dest) {
  return new Promise((ok, bad) => {
    const tl = JSON.parse(fs.readFileSync(project.tlFile, 'utf8'));
    const vert = (tl.height || 720) > (tl.width || 1280);
    const tmp = path.join(project.dir, `.still_${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ ...tl, width: vert ? 1080 : 1920, height: vert ? 1920 : 1080 }));
    fs.mkdirSync(P('out'), { recursive: true });
    const out = dest || `out/cover_${String(t).replace('.', '_')}s.jpg`;
    const abs = path.isAbsolute(out) ? out : P(out);
    execFile('node', [path.join(SKILL, 'scripts/render.mjs'), tmp, abs, '--still', String(t), abs], e => { fs.rmSync(tmp, { force: true }); e ? bad(e) : ok(out); });
  });
}


// ---------- templates ----------
function templateList() {
  const out = [];
  const read = (dir, user) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').sort()) {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        t.id = t.id || f.replace(/\.json$/, '');
        const pv = ext => fs.existsSync(path.join(TPL_DIR, 'previews', `${t.id}.${ext}`)) ? `/templates/previews/${encodeURIComponent(t.id)}.${ext}` : null;
        out.push({ ...t, user, preview: { mp4: pv('mp4'), jpg: pv('jpg') } });
      } catch (e) { console.error('template', f, e.message); }
    }
  };
  read(TPL_DIR, false); read(path.join(TPL_DIR, 'user'), true);
  return out;
}
const slug = s => String(s || 'mau').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'mau';
// Save the current project as a user template (+ a small cover still rendered at time t).
async function saveTemplate({ tpl, t = 1 }) {
  const dir = path.join(TPL_DIR, 'user');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(TPL_DIR, 'previews'), { recursive: true });
  let id = 'u-' + slug(tpl.name);
  for (let k = 2; fs.existsSync(path.join(dir, id + '.json')) || fs.existsSync(path.join(TPL_DIR, id + '.json')); k++) id = 'u-' + slug(tpl.name) + '-' + k;
  const doc = { ...tpl, id, user: undefined, preview: undefined, created: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(doc, null, 1));
  const big = path.join(TPL_DIR, 'previews', `.${id}_big.jpg`), jpg = path.join(TPL_DIR, 'previews', `${id}.jpg`);
  try {
    await still(+t || 0, big);
    await new Promise(ok => execFile('ffmpeg', ['-v', 'error', '-y', '-i', big, '-vf', 'scale=360:-2', '-q:v', '4', jpg], () => ok()));
  } catch (e) { console.error('template cover', e.message); }
  fs.rmSync(big, { force: true });
  return { ok: true, id, file: path.join(dir, id + '.json') };
}

// ---------- background jobs (export / new project) ----------
let job = null; // { kind, state: running|done|error, progress 0..1, step, log, out }
function run(cmd, argv, onLine) {
  return new Promise((ok, bad) => {
    const p = spawn(cmd, argv, { cwd: project?.dir || process.cwd() });
    job.proc = p;
    // Lines are reassembled across chunks so a long progress/JSON line never reaches onLine cut in half.
    const feeder = () => { let rest = ''; return d => { const s = d.toString(); job.log = (job.log + s).slice(-6000); const ls = (rest + s).split(/[\r\n]/); rest = ls.pop(); ls.forEach(line); }; };
    const line = l => { if (l && onLine) try { onLine(l); } catch (e) { console.error('onLine', e.message); } };
    p.stdout.on('data', feeder()); p.stderr.on('data', feeder());
    // Missing ffmpeg/python: reject the job instead of crashing the server with an unhandled 'error' event.
    p.on('error', e => bad(new Error(e.code === 'ENOENT' ? `Không tìm thấy ${path.basename(cmd)} — chạy lại bộ cài (install)` : e.message)));
    p.on('close', code => (code === 0 ? ok() : bad(new Error(`${path.basename(cmd)} lỗi (mã ${code})`))));
  });
}
async function exportVideo({ quality = '1080', from, to, aspects }) {
  const tl = JSON.parse(fs.readFileSync(project.tlFile, 'utf8'));
  // Missing source files (project moved / work/ deleted): say which one instead of a python/node stack trace.
  for (const f of [tl.aroll?.frames && path.dirname(tl.aroll.frames), tl.audio?.voice]) if (f && !fs.existsSync(P(f))) throw new Error(`Thiếu file nguồn: ${f} — dự án bị di chuyển hoặc đã xoá thư mục work/`);
  const [W, H] = quality === '720' ? [720, 1280] : quality === '4k' ? [2160, 3840] : [1080, 1920];
  const vert = (tl.height || 720) > (tl.width || 1280);
  const tmp = P('.studio/export.json');
  fs.writeFileSync(tmp, JSON.stringify({ ...tl, width: vert ? W : H, height: vert ? H : W }));
  // mix_audio.py writes tl.audio.mix (default work/mix.wav); hand that file to render.mjs explicitly so the MP4 always has sound.
  let mix = null;
  if (tl.audio?.voice || tl.audio?.music?.length || tl.audio?.sfx?.length || tl.audio?.tracks?.length || tl.clips?.some(c => c.audio)) {
    job.step = 'Trộn âm thanh (giọng + nhạc + SFX, -14 LUFS)';
    await run(PY, ['-I', '-X', 'utf8', path.join(SKILL, 'scripts/mix_audio.py'), project.tlFile]);
    mix = P(tl.audio?.mix || 'work/mix.wav');
    if (!fs.existsSync(mix)) throw new Error('Trộn âm thanh không tạo ra file ' + path.relative(project.dir, mix));
  }
  fs.mkdirSync(P('out'), { recursive: true });
  const out = `out/${path.basename(project.dir)}_${stamp()}.mp4`;
  job.step = 'Render khung hình';
  const total = (to ?? tl.duration) - (from ?? 0);
  // render.mjs resolves media against the timeline's folder, so the temp copy lives next to it via a relative symlink-free path.
  const tmpTl = path.join(project.dir, `.export_${process.pid}.json`);
  fs.renameSync(tmp, tmpTl);
  try {
    await run('node', [path.join(SKILL, 'scripts/render.mjs'), tmpTl, P(out), ...(mix ? ['--audio', mix] : []), ...(from != null ? ['--from', String(from)] : []), ...(to != null ? ['--to', String(to)] : [])], l => {
      const m = /([\d.]+)s \/ ([\d.]+)s/.exec(l);
      if (m) job.progress = Math.min(.99, (+m[1] - (from ?? 0)) / total);
    });
  } finally { fs.rmSync(tmpTl, { force: true }); }
  job.out = out;
  // Extra aspect ratios (references/reframe-dub.md): honest derivatives of the file just rendered.
  if (aspects?.length) {
    const { deriveAspects } = await import(pathToFileURL(path.join(SKILL, 'scripts/export_multi.mjs')).href);
    const r = await deriveAspects(P(out), aspects, { run, py: PY, onStep: s => { job.step = s; job.progress = 0; }, onProgress: k => { job.progress = Math.min(.99, k); } });
    job.outs = [{ aspect: r.native, out, note: 'Bản gốc (render thật)' }, ...r.outs.map(o => ({ ...o, out: path.relative(project.dir, o.out) }))];
  }
}
// "Video mới" pipeline lives in scripts/new_project.mjs (shared with scripts/autopilot.mjs).
async function newProject(o) {
  const { newProject: build } = await import(pathToFileURL(path.join(SKILL, 'scripts/new_project.mjs')).href);
  const d = await build(o, { run, onStep: (s, p) => { job.step = s; job.progress = p; } });
  openProject(d);
  job.out = d;
}
function startJob(kind, fn, payload) {
  if (job?.state === 'running') return false;
  job = { kind, state: 'running', progress: 0, step: 'Bắt đầu', log: '', out: null, started: Date.now() };
  fn(payload).then(() => { job.state = 'done'; job.progress = 1; job.step = 'Xong'; })
    .catch(e => { job.state = 'error'; job.step = job.cancelled && /lỗi \(mã/.test(e.message) ? 'Đã huỷ theo yêu cầu' : e.message; console.error(e); });
  return true;
}
// Server stopped (app quit, Ctrl+C) while a job runs: stop it (render.mjs then closes its Chromes) and drop this run's temp timelines.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => {
  if (job?.state === 'running') killTree(job.proc);
  if (project) for (const f of [`.export_${process.pid}.json`, `.still_${process.pid}.json`, `.cover_${process.pid}.json`]) fs.rmSync(path.join(project.dir, f), { force: true });
  setTimeout(() => process.exit(0), 300);
});

// ---------- plugins: studio/routes/*.mjs ----------
// Each module: export default (ctx) => async (req, res, p, u) => true if handled. ctx gives access to the project, jobs and helpers.
const ctx = {
  HERE, SKILL, PY, json, body, under, sendFile, run, stamp, startJob, readProject, save, openProject: switchProject,
  get project() { return project; }, get job() { return job; }, P: rel => P(rel),
};
const ROUTES = [];
for (const f of fs.readdirSync(path.join(HERE, 'routes')).filter(f => f.endsWith('.mjs')).sort()) {
  try { ROUTES.push((await import(pathToFileURL(path.join(HERE, 'routes', f)).href)).default(ctx)); } catch (e) { console.error(`plugin ${f}:`, e.message); }
}
const FEATURES = () => fs.readdirSync(path.join(HERE, 'features')).filter(f => f.endsWith('.js')).sort();

// ---------- http ----------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  // Local-only API: refuse other websites (CSRF via a simple POST) and DNS-rebinding hosts.
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
  if (!LOCAL.test(req.headers.host || '') || (req.headers.origin && !LOCAL.test(req.headers.origin.replace(/^https?:\/\//, '')))) return json(res, { error: 'forbidden' }, 403);
  try {
    if (p === '/' || p === '/index.html') return sendFile(req, res, path.join(HERE, 'index.html'));
    if (p.startsWith('/studio/')) { const f = under(HERE, p.slice(8)); return f ? sendFile(req, res, f) : json(res, {}, 403); }
    if (p.startsWith('/engine/')) { const f = under(path.join(SKILL, 'engine'), p.slice(8)); return f ? sendFile(req, res, f) : json(res, {}, 403); }
    if (p.startsWith('/assets/')) { const f = under(path.join(SKILL, 'assets'), p.slice(8)); return f ? sendFile(req, res, f) : json(res, {}, 403); }
    if (p.startsWith('/templates/')) { const f = under(TPL_DIR, p.slice(11)); return f ? sendFile(req, res, f) : json(res, {}, 403); }
    if (p.startsWith('/cdn/')) { // jsDelivr through the disk cache: emoji/icons download once per machine
      const hit = await cached('https://cdn.jsdelivr.net/' + p.slice(5));
      if (!hit) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': hit.type, 'Content-Length': hit.body.length, 'Cache-Control': 'public, max-age=604800' }); return res.end(hit.body);
    }
    if (p === '/api/templates' && req.method === 'GET') return json(res, templateList());
    // Everything below that reads or writes project files needs an open project (plugin routes included).
    if (!project && /^\/api\/(save|history|waveform|export|autosfx|media|upload|still|srt|reveal|templates\/media|transcribe|reframe|dub(?!\/voices)|stock\/fetch|genimage|segment|sticker|audio|broll\/suggest)(\/|$)/.test(p)) return json(res, { error: 'Chưa mở dự án' }, 400);
    if (p === '/api/templates/media' && req.method === 'POST') {
      // Copy every "media/…" file a template references from the skill's examples/media into the project (never overwrites).
      const { id } = await body(req);
      const f = [path.join(SKILL, 'templates', `${id}.json`), path.join(SKILL, 'templates/user', `${id}.json`)].find(x => fs.existsSync(x));
      let copied = 0;
      if (f) for (const m of new Set(fs.readFileSync(f, 'utf8').match(/media\/[^"%]+?\.(?:jpe?g|png|webp)/g) || [])) {
        const src = under(path.join(SKILL, 'examples'), m), dst = under(project.dir, m);
        if (src && dst && fs.existsSync(src) && !fs.existsSync(dst)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); copied++; }
      }
      // Frame-sequence folders ("media/sc_demo/%03d.jpg") are copied whole.
      if (f) for (const dir of new Set((fs.readFileSync(f, 'utf8').match(/media\/[^"%]+\/(?=%0\dd)/g) || []))) {
        const src = under(path.join(SKILL, 'examples'), dir), dst = under(project.dir, dir);
        if (src && dst && fs.existsSync(src) && !fs.existsSync(dst)) { fs.cpSync(src, dst, { recursive: true }); copied++; }
      }
      return json(res, { copied });
    }
    if (p === '/api/templates/save' && req.method === 'POST') return json(res, await saveTemplate(await body(req)));
    if (p.startsWith('/project/')) {
      if (!project) return json(res, { error: 'no project' }, 404);
      const f = under(project.dir, p.slice(9));
      return f ? sendFile(req, res, f) : json(res, {}, 403);
    }
    if (p === '/api/project' && req.method === 'GET') return project ? json(res, readProject()) : json(res, { error: 'Chưa mở dự án' }, 404);
    if (p === '/api/save' && req.method === 'POST') return json(res, save(await body(req)));
    if (p === '/api/history') {
      const d = path.join(project.dir, '.studio/history');
      if (!fs.existsSync(d)) return json(res, []);
      return json(res, fs.readdirSync(d).filter(f => f.endsWith('.json')).sort().reverse().map(f => f.replace('.json', '')));
    }
    if (p.startsWith('/api/history/')) {
      const f = under(path.join(project.dir, '.studio/history'), p.slice(13) + '.json');
      return f && fs.existsSync(f) ? json(res, JSON.parse(fs.readFileSync(f, 'utf8'))) : json(res, {}, 404);
    }
    if (p === '/api/library') return json(res, library());
    if (p === '/api/waveform') return waveform(w => json(res, w));
    if (p === '/api/broll') {
      const q = u.searchParams.get('q') || '';
      return execFile('node', [path.join(SKILL, 'scripts/broll.mjs'), 'search', q], { maxBuffer: 1 << 22 }, (e, out) =>
        json(res, (out || '').split('\n').filter(Boolean).slice(0, 30).map(l => { const m = l.trim().split(/\s{2,}/); return { id: m[1], template: m[2], text: m[3] }; }).filter(x => x.id)));
    }
    if (p === '/api/export' && req.method === 'POST') { const b = await body(req); const ok = startJob('export', exportVideo, b); return json(res, ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }); }
    if (p === '/api/new' && req.method === 'POST') { const b = await body(req); const ok = startJob('new', newProject, b); return json(res, ok ? { ok } : { ok, error: 'Đang có tác vụ khác chạy' }); }
    if (p === '/api/autosfx' && req.method === 'POST') {
      const b = await body(req);
      return execFile(PY, ['-I', '-X', 'utf8', path.join(SKILL, 'scripts/auto_sfx.py'), project.tlFile, ...(b.keep ? ['--keep-manual'] : [])], (e, out, err) =>
        e ? json(res, { error: (err || e.message).slice(-500) }, 500) : json(res, readProject()));
    }
    if (p === '/api/media') return json(res, mediaList());
    if (p === '/api/upload' && req.method === 'POST') { await upload(req, u.searchParams.get('name') || 'file.bin'); return json(res, mediaList()); }
    if (p === '/api/still') return still(+u.searchParams.get('t') || 0).then(out => json(res, { out })).catch(e => json(res, { error: e.message }, 500));
    if (p === '/api/srt') {
      const { captions } = readProject(); fs.mkdirSync(P('out'), { recursive: true });
      const out = `out/${path.basename(project.dir)}.srt`; fs.writeFileSync(P(out), srt(captions)); return json(res, { out });
    }
    if (p === '/api/job') return json(res, job ? { ...job, proc: undefined } : null);
    if (p === '/api/job/cancel' && req.method === 'POST') { if (job?.state === 'running') job.cancelled = true; killTree(job?.proc); return json(res, { ok: true }); }
    if (p === '/api/open' && req.method === 'POST') { const b = await body(req); switchProject(b.path); return json(res, { ok: true }); }
    if (p === '/api/reveal' && req.method === 'POST') { const b = await body(req); const f = under(project.dir, b.path || ''); if (f) revealPath(f); return json(res, { ok: !!f }); }
    if (p === '/api/features') return json(res, FEATURES());
    for (const r of ROUTES) if (await r(req, res, p, u)) return;
    json(res, { error: 'not found' }, 404);
  } catch (e) { console.error(e); json(res, { error: e.message }, 500); }
});

if (args[0] === '--new') {
  job = { kind: 'new', state: 'running', progress: 0, step: '', log: '' };
  await newProject({ video: args[1], dir: args[2] && !args[2].startsWith('--') ? args[2] : undefined });
  console.log(`starter project: ${project.dir}`);
  job = null; // otherwise every later job (export, AI…) is refused as "already running"
} else if (args[0] && !args[0].startsWith('--')) openProject(args[0]);

// Studio already running on this port (e.g. the shortcut was clicked twice): just show it instead of crashing.
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.log(`Cổng ${PORT} đang chạy AI Video Studio → mở trình duyệt`);
  if (args.includes('--open')) openPath(`http://localhost:${PORT}`);
  setTimeout(() => process.exit(0), 1500);
});
server.listen(PORT, '127.0.0.1', () => {
  const link = `http://localhost:${PORT}`;
  console.log(`AI Video Studio ${VERSION} → ${link}`);
  console.log('Tác giả: Nguyễn Tất Kiểm · Tặng khoá học AI miễn phí: https://nguyentatkiem.com.vn/aiplusntk/');
  if (args.includes('--open')) openPath(link);
});
