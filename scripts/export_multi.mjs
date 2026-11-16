// Multi-aspect derivatives of an exported MP4 (references/reframe-dub.md).
// usage: node scripts/export_multi.mjs <rendered.mp4> --aspects 9:16,1:1,16:9 [--out-dir out/]
// The engine only designs 720x1280 and 1280x720, so the native orientation is the real render and the others are
// honest derivatives of that file:
//   16:9 source -> 9:16 / 1:1 : crop that follows the speaker's face (scripts/face_track.py on the rendered video).
//   9:16 source -> 1:1        : square crop that keeps the face and, when both fit, the caption zone (~74% height).
//   9:16 source -> 16:9       : the whole vertical video centred over a blurred, zoomed copy of itself (nothing cropped).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pyBin } from './platform.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PYBIN = pyBin(SKILL);
const sh = (cmd, argv, onLine) => new Promise((ok, bad) => {
  const p = spawn(cmd, argv); let log = '';
  const feed = d => { const s = d.toString(); log = (log + s).slice(-3000); s.split(/[\r\n]/).forEach(l => l && onLine && onLine(l)); };
  p.stdout.on('data', feed); p.stderr.on('data', feed);
  p.on('close', c => (c === 0 ? ok() : bad(new Error(`${path.basename(cmd)} lỗi (mã ${c}) ${log.slice(-400)}`))));
});
const even = v => Math.max(2, Math.round(v / 2) * 2);
function probe(f) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', f]));
  return { W: j.streams[0].width, H: j.streams[0].height, dur: +j.format.duration };
}
function faceAt(keys, t) {
  const i = keys.findIndex(k => k.t > t);
  if (i <= 0) return keys[i < 0 ? keys.length - 1 : 0];
  const a = keys[i - 1], b = keys[i], k = (t - a.t) / (b.t - a.t || 1);
  return { ox: a.ox + (b.ox - a.ox) * k, oy: a.oy + (b.oy - a.oy) * k };
}
export const NOTES = {
  '16:9>9:16': 'Cắt dọc bám mặt từ bản ngang: chữ/graphic ở hai bên trái-phải bị cắt mất; ảnh phóng ~1,8× nên kém nét hơn bản gốc.',
  '16:9>1:1': 'Cắt vuông bám mặt từ bản ngang: mất phần hai bên trái-phải (graphic, chữ đặt sát mép).',
  '9:16>1:1': 'Cắt vuông từ bản dọc: giữ mặt và vùng phụ đề nếu vừa; tiêu đề sát mép trên, CTA/nút/logo sát mép dưới có thể bị cắt.',
  '9:16>16:9': 'Bản dọc đặt giữa, hai bên là chính video phóng to làm mờ: không cắt gì, nhưng chữ nhỏ hơn bản ngang thật.',
};

// opts: { run(cmd, argv, onLine), py, onStep(text), onProgress(0..1), outDir }
export async function deriveAspects(src, aspects, opts = {}) {
  const run = opts.run || sh, py = opts.py || PYBIN, step = opts.onStep || (() => {}), prog = opts.onProgress || (() => {});
  const { W, H, dur } = probe(src), vert = H > W, native = vert ? '9:16' : '16:9';
  const todo = [...new Set(aspects)].filter(a => a !== native && NOTES[`${native}>${a}`]);
  const outDir = opts.outDir || path.dirname(src), base = path.basename(src, '.mp4');
  const res = [];
  let keys = null;
  if (todo.some(a => !(vert && a === '16:9'))) {
    step('Dò mặt trên bản đã xuất (để cắt khung bám mặt)');
    const tj = path.join(outDir, `.${base}_face.json`);
    await run(py, ['-I', '-X', 'utf8', path.join(SKILL, 'scripts/face_track.py'), src, '--fps', '5', '--out', tj]);
    keys = JSON.parse(fs.readFileSync(tj, 'utf8')).keys; fs.rmSync(tj, { force: true });
    if (!keys.length) keys = [{ t: 0, ox: 50, oy: 42 }];
  }
  for (const [n, a] of todo.entries()) {
    const out = path.join(outDir, `${base}_${a.replace(':', 'x')}.mp4`);
    step(`Tạo bản ${a} (${n + 1}/${todo.length})`);
    let vf, ow, oh;
    if (vert && a === '16:9') {
      oh = even(W); ow = even(oh * 16 / 9); // keep the short side (1080x1920 -> 1920x1080)
      vf = `[0:v]split[a][b];[a]scale=${ow}:${oh}:force_original_aspect_ratio=increase,crop=${ow}:${oh},boxblur=40:2,eq=brightness=-0.08[bg];` +
        `[b]scale=-2:${oh}[fg];[bg][fg]overlay=(W-w)/2:0,setsar=1[v]`;
    } else {
      const cw = vert ? W : even(a === '1:1' ? H : H * 9 / 16), ch = vert ? W : H;
      const capY = H * .74, lines = [];
      for (let t = 0; t < dur + .1; t += 1 / 15) {
        const f = faceAt(keys, t), fx = f.ox / 100 * W, fy = f.oy / 100 * H;
        let x = 0, y = 0;
        if (vert) y = capY - fy < ch * .8 ? (fy + capY) / 2 - ch / 2 : fy - ch * .4;  // face + caption zone when they fit
        else x = fx - cw / 2;
        x = Math.round(Math.min(W - cw, Math.max(0, x))); y = Math.round(Math.min(H - ch, Math.max(0, y)));
        lines.push(`${t.toFixed(3)} crop x ${x}, crop y ${y};`);
      }
      const cmd = path.join(outDir, `.${base}_${a.replace(':', 'x')}.cmd`);
      fs.writeFileSync(cmd, lines.join('\n'));
      // 9:16 crop is upscaled so its short side matches the export (1920x1080 -> 1080x1920); 1:1 keeps the crop size
      [ow, oh] = a === '9:16' ? [even(H), even(H * 16 / 9)] : [cw, ch];
      vf = `[0:v]sendcmd=f='${cmd.replace(/'/g, "'\\''")}',crop=w=${cw}:h=${ch}:x=0:y=0,scale=${ow}:${oh}:flags=lanczos,setsar=1[v]`;
    }
    await run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-filter_complex', vf, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', out], l => {
      const m = /out_time_ms=(\d+)/.exec(l); if (m) prog((n + Math.min(1, +m[1] / 1e6 / dur)) / todo.length);
    });
    fs.rmSync(path.join(outDir, `.${base}_${a.replace(':', 'x')}.cmd`), { force: true });
    res.push({ aspect: a, out, w: ow, h: oh, note: NOTES[`${native}>${a}`] });
  }
  return { native, outs: res };
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  if (!a[0]) { console.log('usage: node export_multi.mjs <video.mp4> --aspects 9:16,1:1,16:9 [--out-dir dir]'); process.exit(1); }
  const r = await deriveAspects(path.resolve(a[0]), opt('--aspects', '9:16,1:1,16:9').split(','), { outDir: opt('--out-dir'), onStep: s => console.log(s) });
  console.log(JSON.stringify(r, null, 1));
}
