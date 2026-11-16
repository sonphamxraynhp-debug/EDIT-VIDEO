// "Video mới": raw talking-head video → starter project (shared by studio/server.mjs /api/new and scripts/autopilot.mjs).
// usage: node scripts/new_project.mjs <video> [project_dir] [--model large-v3-turbo] [--lang vi|auto] [--pack slate] [--title "…"]
//                                     [--orient vertical|horizontal|auto]
// Steps: whisper (transcribe.py) → cut silences (cut.py) → 30 fps frames → face position (find_face.py) → captions (captions.py)
// → timeline.json (frame_grid + title_card, music bed). Progress lines "@@ <0..1> <step>" on stdout; exit ≠ 0 + Vietnamese error.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pyBin } from './platform.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PY = pyBin(SKILL);

// Plain runner (the server passes its own, which also records job.proc for "Dừng").
export function runCmd(cmd, argv, onLine, { cwd } = {}) {
  return new Promise((ok, bad) => {
    const p = spawn(cmd, argv, { cwd: cwd || process.cwd() });
    let log = '';
    const feed = d => { const s = d.toString(); log = (log + s).slice(-4000); s.split(/[\r\n]/).forEach(l => l && onLine && onLine(l)); };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', bad);
    p.on('close', code => (code === 0 ? ok(log) : bad(Object.assign(new Error(`${path.basename(cmd)} lỗi (mã ${code})`), { log }))));
  });
}

// Display orientation of a video (rotation metadata included): 'vertical' | 'horizontal'.
export function videoOrient(src) {
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation:stream_tags=rotate', '-of', 'json', src]).toString());
    const s = j.streams?.[0] || {};
    const rot = Math.abs(+(s.side_data_list?.find(x => x.rotation != null)?.rotation ?? s.tags?.rotate ?? 0)) % 180;
    const [w, h] = rot === 90 ? [s.height, s.width] : [s.width, s.height];
    return h > w ? 'vertical' : 'horizontal';
  } catch { return 'vertical'; }
}

/**
 * Build the starter project. Returns the project dir.
 * o: { video, dir?, model='large-v3-turbo', pack='slate', title='', orient='vertical'|'horizontal'|'auto', lang? }
 * env: { run(cmd, argv, onLine) → Promise, onStep(text, progress) }
 */
export async function newProject({ video, dir, model = 'large-v3-turbo', pack = 'slate', title = '', orient = 'vertical', lang }, { run = runCmd, onStep = () => {} } = {}) {
  const src = path.resolve(String(video).trim().replace(/^["']|["']$/g, '').replace(/^~(?=[\\/]|$)/, os.homedir()));
  if (!fs.existsSync(src)) throw new Error(`không thấy video ${src}`);
  if (orient === 'auto') orient = videoOrient(src);
  const d = path.resolve(dir || path.join(path.dirname(src), path.basename(src, path.extname(src)) + '_studio'));
  fs.mkdirSync(path.join(d, 'work/frames'), { recursive: true });
  const S = f => path.join(SKILL, 'scripts', f);
  onStep('Nhận dạng giọng nói (whisper)', .05);
  await run(PY, ['-I', '-X', 'utf8', S('transcribe.py'), src, path.join(d, 'work/words_raw.json'), '--model', model, ...(lang && lang !== 'vi' ? ['--lang', lang] : [])]);
  onStep('Cắt khoảng lặng', .45);
  await run(PY, ['-I', '-X', 'utf8', S('cut.py'), src, path.join(d, 'work/words_raw.json'), path.join(d, 'work')]);
  onStep(`Trích khung hình ${orient === 'horizontal' ? '16:9' : '9:16'}`, .6);
  const [FW, FH] = orient === 'horizontal' ? [1280, 720] : [720, 1280];
  // stale frames from an interrupted earlier run would make the clip longer than the audio
  for (const f of fs.readdirSync(path.join(d, 'work/frames'))) if (f.endsWith('.jpg')) fs.rmSync(path.join(d, 'work/frames', f));
  await run('ffmpeg', ['-v', 'error', '-y', '-i', path.join(d, 'work/aroll.mp4'), '-vf', `scale=${FW}:${FH}:force_original_aspect_ratio=increase,crop=${FW}:${FH}`, '-q:v', '3', path.join(d, 'work/frames/%05d.jpg')]);
  // timeline.face (bubble / PIP / hook anchor): find_face.py on a few frames; keep the default if no person is found.
  onStep('Tìm vị trí mặt', .75);
  let face = orient === 'horizontal' ? { x: 640, y: 300 } : { x: 360, y: 520 };
  await run(PY, ['-I', '-X', 'utf8', S('find_face.py'), path.join(d, 'work/frames'), '--design', `${FW}x${FH}`], l => { try { const f = JSON.parse(l); if (f.x != null) face = f; } catch {} }).catch(() => {});
  onStep('Tạo phụ đề', .85);
  await run(PY, ['-I', '-X', 'utf8', S('captions.py'), path.join(d, 'work/words.json'), path.join(d, 'work/captions.json'), '--max', '4']);
  const caps = JSON.parse(fs.readFileSync(path.join(d, 'work/captions.json'), 'utf8'));
  for (const c of caps) for (const w of c.words) w.w = w.w.replace(/[.,!?]+$/, '').toLowerCase();
  fs.writeFileSync(path.join(d, 'work/captions.json'), JSON.stringify(caps, null, 1));
  const dur = +(fs.readdirSync(path.join(d, 'work/frames')).length / 30).toFixed(2);
  const tl = {
    width: orient === 'horizontal' ? 1920 : 1080, height: orient === 'horizontal' ? 1080 : 1920, fps: 30, duration: +(dur + 2.5).toFixed(2),
    pack, _starter: { pack, title, dur: +(dur + 2.5).toFixed(2) },
    aroll: { frames: 'work/frames/%05d.jpg' }, face,
    caption_style: 'slate', captions: 'work/captions.json',
    scenes: [
      // slate's card / title positions are laid out for 720x1280; a 1280x720 design needs its own (else they spill off the bottom)
      { type: 'frame_grid', t0: 0, t1: dur, ...(orient === 'horizontal' ? { card: { x: 120, y: 70, w: 1040, h: 585, r: 8 }, badge: { icon: 'si:claude', x: 640 } } : { badge: { icon: 'si:claude' } }) },
      { type: 'title_card', t0: dur, t1: +(dur + 2.5).toFixed(2), question: 'Bạn thấy sao?', ...(orient === 'horizontal' ? { y: 210 } : {}) },
    ],
    audio: { voice: 'work/aroll.mp4', mix: 'work/mix.wav', music: [{ t0: 0, t1: +(dur + 2.5).toFixed(2), mood: 'tech', gain: -20 }], sfx: [] },
  };
  fs.writeFileSync(path.join(d, 'timeline.json'), JSON.stringify(tl, null, 1));
  return d;
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!pos[0]) { console.error('usage: node scripts/new_project.mjs <video> [project_dir] [--model large-v3-turbo] [--lang vi|auto] [--pack slate] [--title …] [--orient vertical|horizontal|auto]'); process.exit(2); }
  newProject({ video: pos[0], dir: pos[1], model: opt('--model', 'large-v3-turbo'), pack: opt('--pack', 'slate'), title: opt('--title', ''), orient: opt('--orient', 'vertical'), lang: opt('--lang') },
    { onStep: (s, p) => console.log(`@@ ${p.toFixed(2)} ${s}`) })
    .then(d => { console.log(`@@ 1.00 Xong`); console.log(JSON.stringify({ dir: d })); })
    .catch(e => { console.error('LỖI: ' + e.message + (e.log ? '\n' + e.log.slice(-600) : '')); process.exit(1); });
}
