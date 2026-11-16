// OS differences in one place (macOS / Windows / Linux): Chrome/Edge, the venv's Python, the Claude CLI, opening/revealing
// files, clipboard, notifications and links. Everything else in the app calls these instead of `open`, `osascript`, …
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile, execFileSync } from 'node:child_process';

export const IS_WIN = process.platform === 'win32', IS_MAC = process.platform === 'darwin';

const winDirs = () => [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
export function findChrome() {
  const c = [process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ...winDirs().flatMap(d => ['Google/Chrome/Application/chrome.exe', 'Chromium/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'].map(f => path.join(d, f))),
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  return c.find(f => f && fs.existsSync(f));
}
export const CHROME = findChrome();

// Python of scripts/.venv (setup) — `dir` may be the skill root or scripts/.
export function pyBin(dir) {
  const rel = IS_WIN ? '.venv/Scripts/python.exe' : '.venv/bin/python';
  return [path.join(dir, rel), path.join(dir, 'scripts', rel)].find(f => fs.existsSync(f)) || (IS_WIN ? 'python' : 'python3');
}

// Claude Code CLI. On Windows an npm install is a claude.cmd shim, which spawn() cannot run without a shell (and a shell
// would mangle prompts passed as arguments), so it resolves to `node …/cli.js`.
function whichAll(name) {
  try { return execFileSync(IS_WIN ? 'where' : '/bin/sh', IS_WIN ? [name] : ['-lc', `command -v ${name}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).map(s => s.trim()).filter(Boolean); } catch { return []; }
}
let CLAUDE = null;
export function claudeCmd() {
  if (CLAUDE) return CLAUDE;
  if (process.env.CLAUDE_BIN) return (CLAUDE = [process.env.CLAUDE_BIN, []]);
  const home = os.homedir();
  if (IS_WIN) {
    const found = [...whichAll('claude'), path.join(home, '.local/bin/claude.exe'), path.join(process.env.APPDATA || '', 'npm/claude.cmd')].filter(f => fs.existsSync(f));
    const exe = found.find(f => /\.exe$/i.test(f));
    if (exe) return (CLAUDE = [exe, []]);
    for (const cmd of found.filter(f => /\.(cmd|bat)$/i.test(f))) {
      const cli = path.join(path.dirname(cmd), 'node_modules/@anthropic-ai/claude-code/cli.js');
      if (fs.existsSync(cli)) return (CLAUDE = [process.execPath, [cli]]);
    }
    return (CLAUDE = ['claude.exe', []]);
  }
  const p = whichAll('claude')[0] || [path.join(home, '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'].find(f => fs.existsSync(f));
  return (CLAUDE = [p || 'claude', []]);
}
export const claudeBin = () => claudeCmd()[0];
// Claude subscription for the app: a long-lived token from `claude setup-token` in ~/.ai-video-studio/claude-token
// (or CLAUDE_CODE_OAUTH_TOKEN) so the app does not share the CLI's rotating login. Session variables inherited from a
// Claude Code session that started the server are dropped (they die with that session). --setting-sources "" keeps the
// user's ~/.claude/CLAUDE.md and settings out of video prompts. ANTHROPIC_API_KEY, if set, still wins (billed API).
const TOKEN_FILE = path.join(process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio'), 'claude-token');
function claudeEnv(env = process.env) {
  const e = { ...env };
  for (const k of Object.keys(e)) if (k === 'CLAUDECODE' || (k.startsWith('CLAUDE_CODE_') && k !== 'CLAUDE_CODE_OAUTH_TOKEN')) delete e[k];
  if (!e.CLAUDE_CODE_OAUTH_TOKEN) try { const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); if (t) e.CLAUDE_CODE_OAUTH_TOKEN = t; } catch { /* CLI login */ }
  return e;
}
const claudeArgs = args => (args.includes('--setting-sources') ? args : [...args, '--setting-sources', '']);
export function spawnClaude(args, opts = {}) { const [exe, pre] = claudeCmd(); return spawn(exe, [...pre, ...claudeArgs(args)], { ...opts, env: claudeEnv(opts.env) }); }
export function execClaude(args, opts = {}, cb) { const [exe, pre] = claudeCmd(); return execFile(exe, [...pre, ...claudeArgs(args)], { ...opts, env: claudeEnv(opts.env) }, cb); }

// Stop a child and everything it started. On Windows kill() is a hard TerminateProcess that skips the child's own cleanup
// (render.mjs closing its Chromes/ffmpeg), so the whole tree goes through taskkill instead.
export function killTree(p) {
  if (!p || p.exitCode != null) return;
  if (IS_WIN && p.pid) { try { execFile('taskkill', ['/pid', String(p.pid), '/t', '/f'], () => {}); return; } catch { /* fall through */ } }
  try { p.kill('SIGTERM'); } catch { /* already gone */ }
}
const bg = (cmd, args) => { try { const p = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }); p.on('error', () => {}); p.unref(); } catch { /* no opener */ } };
// Open a file, folder or URL with the system's default app.
export function openPath(target) {
  if (IS_MAC) return bg('open', [target]);
  if (IS_WIN) return /^https?:/i.test(target) ? bg('rundll32', ['url.dll,FileProtocolHandler', target]) : bg('explorer.exe', [target]);
  bg('xdg-open', [target]);
}
// Show a file selected in Finder / Explorer.
export function revealPath(file) {
  if (IS_MAC) return bg('open', ['-R', file]);
  if (IS_WIN) return bg('explorer.exe', [`/select,${path.resolve(file)}`]);
  bg('xdg-open', [path.dirname(file)]);
}
export function copyText(text) {
  const [cmd, args] = IS_MAC ? ['pbcopy', []] : IS_WIN ? ['powershell.exe', ['-NoProfile', '-Command', '$input | Set-Clipboard']] : ['xclip', ['-selection', 'clipboard']];
  return new Promise(ok => { try { const p = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true }); p.on('error', () => ok(false)); p.on('close', c => ok(c === 0)); p.stdin.end(text); } catch { ok(false); } });
}
// Desktop notification (macOS: Notification Center, Windows: tray balloon). Resolves true when shown.
export function notifyDesktop(title, msg) {
  return new Promise(ok => {
    if (IS_MAC) {
      const q = s => JSON.stringify(String(s));
      return execFile('osascript', ['-e', `display notification ${q(msg)} with title ${q(title)}`], { timeout: 5000 }, e => ok(!e));
    }
    if (IS_WIN) {
      const q = s => `'${String(s).replace(/'/g, "''")}'`;
      const ps = `Add-Type -AssemblyName System.Windows.Forms;$n=New-Object System.Windows.Forms.NotifyIcon;$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;$n.ShowBalloonTip(6000,${q(title)},${q(msg)},'Info');Start-Sleep 7;$n.Dispose()`;
      return execFile('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { timeout: 15000, windowsHide: true }, e => ok(!e));
    }
    execFile('notify-send', [title, msg], { timeout: 5000 }, e => ok(!e));
  });
}
// Symlink, or what Windows allows without admin rights: a junction for folders, a copy for files.
export function linkPath(src, dst) {
  const dir = fs.statSync(src).isDirectory();
  try { fs.symlinkSync(src, dst, IS_WIN ? (dir ? 'junction' : 'file') : undefined); }
  catch (e) { if (!IS_WIN) throw e; dir ? fs.cpSync(src, dst, { recursive: true }) : fs.copyFileSync(src, dst); }
}
