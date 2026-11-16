// "Chọn video từ máy" for dialogs that otherwise need a typed path (Video mới…): the browser uploads the chosen file,
// it is kept in ~/.ai-video-studio/uploads/ and its server-side path goes back into the dialog. Works the same on macOS/Windows.
//   POST /api/pick/upload?name=clip.mp4   (raw body) → { path, size }
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

export default ctx => {
  const DIR = path.join(process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio'), 'uploads');
  return async (req, res, p, u) => {
    if (p !== '/api/pick/upload' || req.method !== 'POST') return false;
    fs.mkdirSync(DIR, { recursive: true });
    const name = path.basename(u.searchParams.get('name') || 'video.mp4').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-80);
    const f = path.join(DIR, Date.now().toString(36) + '_' + name);
    await new Promise((ok, bad) => { const s = fs.createWriteStream(f); req.pipe(s); s.on('finish', ok); s.on('error', bad); });
    ctx.json(res, { path: f, size: fs.statSync(f).size });
    return true;
  };
};
