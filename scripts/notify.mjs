// Desktop notification helper (references/autopilot.md): macOS Notification Center, Windows tray balloon, Linux notify-send. Never throws.
//   node scripts/notify.mjs "<tiêu đề>" "<nội dung>"
//   import { notify } from './notify.mjs'; notify('Tự lái xong', 'clip.mov → 2 video')
// Respects ~/.ai-video-studio/autopilot.json {"notify": false} unless {force: true}.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { notifyDesktop } from './platform.mjs';

const AVS_HOME = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
const q = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').slice(0, 220);

export function notifyEnabled() {
  try { return JSON.parse(fs.readFileSync(path.join(AVS_HOME, 'autopilot.json'), 'utf8')).notify !== false; } catch { return true; }
}
export function notify(title, msg, { force = false, sound = true } = {}) {
  return new Promise(ok => {
    if (process.env.AVS_NO_NOTIFY || (!force && !notifyEnabled())) return ok(false);
    if (process.platform !== 'darwin') return notifyDesktop(title, msg).then(ok);
    const script = `display notification "${q(msg)}" with title "AI Video Studio" subtitle "${q(title)}"${sound ? ' sound name "Glass"' : ''}`;
    execFile('osascript', ['-e', script], { timeout: 5000 }, e => ok(!e));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const [title = 'AI Video Studio', msg = ''] = process.argv.slice(2).filter(a => a !== '--force');
  notify(title, msg, { force: process.argv.includes('--force') }).then(r => process.exit(0));
}
