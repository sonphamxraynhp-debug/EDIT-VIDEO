// Hàng đợi nền + Thư mục tự động (references/autopilot.md).
// Store: ~/.ai-video-studio/queue.json (AVS_HOME overrides); settings: ~/.ai-video-studio/autopilot.json; lock: queue.lock.
// One runner at a time (Studio server lane, `queue.mjs run`, or the LaunchAgent) holds queue.lock; the others stay passive and
// take over when the holder exits. The runner executes at most ONE item at a time, retries a failed item once, scans the watch
// folders and calls `node scripts/publish.mjs run-due` every 60 s when that script exists.
// usage:
//   node scripts/queue.mjs add <kind> <input> [--profile id] [--out dir] [--opts '{"n":6}']   kinds: autopilot|highlights|topic|variants|publish
//   node scripts/queue.mjs list | cancel <id> | retry <id> | remove <id> | up <id> | down <id> | clear-done
//   node scripts/queue.mjs run [--daemon]        (run until the queue is empty; --daemon: keep running + watch folders)
//   node scripts/queue.mjs agent install|uninstall|status      (LaunchAgent com.aivideostudio.watch)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { notify } from './notify.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AVS_HOME = process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio');
const QFILE = path.join(AVS_HOME, 'queue.json'), SFILE = path.join(AVS_HOME, 'autopilot.json'), LOCK = path.join(AVS_HOME, 'queue.lock');
export const VIDEO_EXT = /\.(mp4|mov|m4v|mkv)$/i;
const MOVIES = path.join(os.homedir(), 'Movies', 'AI Video Studio');
export const DEFAULT_FOLDER = { in: path.join(MOVIES, 'Thả video vào đây'), done: path.join(MOVIES, 'Đã xong'), processed: path.join(MOVIES, 'Đã xử lý'), profile: '' };
const LA_LABEL = 'com.aivideostudio.watch';
const LA_DIR = process.env.AVS_LA_DIR || path.join(os.homedir(), 'Library/LaunchAgents');

const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
function wr(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); }
const slug = s => String(s || 'x').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// ---------- settings ----------
export function loadSettings() {
  const s = rd(SFILE, {}) || {};
  return { notify: s.notify !== false, appDrop: !!s.appDrop, agent: !!s.agent, profile: s.profile || '',
    watch: { on: !!s.watch?.on, folders: (s.watch?.folders?.length ? s.watch.folders : [DEFAULT_FOLDER]).map(f => ({ ...DEFAULT_FOLDER, ...f })) } };
}
export function saveSettings(patch) {
  const cur = loadSettings(), next = { ...cur, ...patch, watch: { ...cur.watch, ...(patch.watch || {}) } };
  next.watch.folders = next.watch.folders.map(f => ({ in: String(f.in || '').replace(/^~(?=\/)/, os.homedir()), done: String(f.done || '').replace(/^~(?=\/)/, os.homedir()), processed: String(f.processed || '').replace(/^~(?=\/)/, os.homedir()), profile: f.profile || '' })).filter(f => f.in);
  if (!next.watch.folders.length) next.watch.folders = [DEFAULT_FOLDER];
  wr(SFILE, next); return next;
}

// ---------- queue store ----------
export function loadQueue() { const q = rd(QFILE, null); return q && Array.isArray(q.items) ? q : { version: 1, items: [] }; }
// read-modify-write with the freshest file (the UI process and the runner process both write it)
export function mutate(fn) { const q = loadQueue(); const r = fn(q); wr(QFILE, q); return r; }
export const KINDS = {
  autopilot: { name: 'Tự lái', script: 'autopilot.mjs' },
  highlights: { name: 'Video dài → shorts', script: 'highlights.mjs' },
  topic: { name: 'Chủ đề → video', script: 'topic_video.mjs' },
  variants: { name: 'Biến thể A/B', script: 'variants.mjs' },
  publish: { name: 'Đăng / lên lịch', script: 'publish.mjs' },
};
export function addItem({ kind, input, opts = {}, source = 'ui' }) {
  if (!KINDS[kind]) throw new Error(`Loại việc lạ: ${kind}`);
  if (!input) throw new Error('Thiếu đầu vào');
  const it = { id: crypto.randomBytes(4).toString('hex'), kind, input: String(input), opts, source, state: 'queued', progress: 0, step: 'Đang chờ', created: new Date().toISOString(),
    started: null, finished: null, outputs: [], error: null, attempt: 0, title: kind === 'topic' ? String(input).slice(0, 60) : path.basename(String(input)) };
  mutate(q => q.items.push(it));
  return it;
}
export function cancelItem(id) {
  return mutate(q => { const it = q.items.find(x => x.id === id); if (!it) return false;
    if (it.state === 'queued') { it.state = 'cancelled'; it.step = 'Đã huỷ'; it.finished = new Date().toISOString(); }
    else if (it.state === 'running') it.cancel = true;
    return true; });
}
export function retryItem(id) { return mutate(q => { const it = q.items.find(x => x.id === id); if (!it || it.state === 'running') return false; Object.assign(it, { state: 'queued', step: 'Đang chờ (thử lại)', error: null, attempt: 0, progress: 0, cancel: false, finished: null }); return true; }); }
export function removeItem(id) { return mutate(q => { const it = q.items.find(x => x.id === id); if (!it || it.state === 'running') return false; q.items = q.items.filter(x => x.id !== id); return true; }); }
export function moveItem(id, d) { return mutate(q => { const i = q.items.findIndex(x => x.id === id), j = i + d; if (i < 0 || j < 0 || j >= q.items.length) return false; [q.items[i], q.items[j]] = [q.items[j], q.items[i]]; return true; }); }
export function clearDone() { return mutate(q => { const n = q.items.length; q.items = q.items.filter(x => !['done', 'cancelled'].includes(x.state)); return n - q.items.length; }); }

function argsFor(it) {
  const o = it.opts || {}, k = it.kind, A = [];
  if (k === 'autopilot') { A.push(it.input); if (o.profile) A.push('--profile', o.profile); if (o.out) A.push('--out', o.out); if (o.project) A.push('--project', o.project); }
  else if (k === 'highlights') { A.push(it.input, '--out', o.out || path.join(AVS_HOME, 'autopilot/highlights', `${slug(path.basename(it.input, path.extname(it.input)))}-${it.id}`)); for (const f of ['n', 'min', 'max', 'orient']) if (o[f] != null) A.push('--' + f, String(o[f])); }
  else if (k === 'topic') { A.push(it.input, '--out', o.out || path.join(AVS_HOME, 'autopilot/topics', it.id)); /* fresh folder per item: topic_video nests into an existing one */ for (const f of ['dur', 'voice', 'orient']) if (o[f] != null) A.push('--' + f, String(o[f])); }
  else if (k === 'variants') { A.push(it.input, '--n', String(o.n || 3)); if (o.kind) A.push('--kind', o.kind); }
  else if (k === 'publish') { A.push(o.action || 'youtube-upload', it.input); if (o.meta) A.push('--meta', o.meta); if (o.schedule) A.push('--schedule', o.schedule); }
  if (Array.isArray(o.args)) A.push(...o.args.map(String));
  return A;
}

// ---------- lock ----------
function readLock() { return rd(LOCK, null); }
function tryLock(role) {
  const l = readLock();
  if (l && l.pid !== process.pid && alive(l.pid)) return false;
  if (l?.pid === process.pid) return true;
  wr(LOCK, { pid: process.pid, role, host: os.hostname(), since: new Date().toISOString() });
  return readLock()?.pid === process.pid;
}
function unlock() { const l = readLock(); if (l?.pid === process.pid) fs.rmSync(LOCK, { force: true }); }

// ---------- runner ----------
export class Runner {
  constructor({ role = 'cli', daemon = true, log = (...a) => console.log(...a) } = {}) {
    Object.assign(this, { role, daemon, log, child: null, item: null, active: false, timer: null, seen: new Map(), lastDue: 0, due: null, watchErr: null, idleSince: Date.now() });
  }
  status() {
    const l = readLock();
    return { active: this.active, role: this.role, lock: l && alive(l.pid) ? l : null, running: this.item?.id || null, watchError: this.watchErr, due: this.due,
      agent: agentStatus() };
  }
  start() { if (!this.timer) { this.timer = setInterval(() => this.tick().catch(e => this.log('queue:', e.message)), 2000); this.tick().catch(() => {}); } return this; }
  stop({ requeue = true } = {}) {
    clearInterval(this.timer); this.timer = null;
    if (this.child) { try { process.kill(-this.child.pid, 'SIGTERM'); } catch {} }
    if (this.item && requeue) mutate(q => { const it = q.items.find(x => x.id === this.item.id); if (it && it.state === 'running') Object.assign(it, { state: 'queued', step: 'Bị dừng — sẽ chạy tiếp', runner: null }); });
    unlock();
  }
  async tick() {
    if (this.busy) return; this.busy = true;
    try {
      this.active = tryLock(this.role);
      if (!this.active) return;
      // items left "running" by a runner that died → back to the queue (autopilot resumes where it stopped)
      mutate(q => { for (const it of q.items) if (it.state === 'running' && it.runner !== process.pid && !alive(it.runner)) Object.assign(it, { state: 'queued', step: 'Chạy tiếp sau khi bị dừng', runner: null }); });
      const st = loadSettings();
      if (this.daemon && st.watch.on) this.scan(st);
      if (this.child) {
        const it = loadQueue().items.find(x => x.id === this.item.id);
        if (it?.cancel) { this.cancelled = true; try { process.kill(-this.child.pid, 'SIGTERM'); } catch {} }
      } else {
        const next = loadQueue().items.find(x => x.state === 'queued');
        if (next) this.runItem(next); else if (!this.daemon && Date.now() - this.idleSince > 1500) { this.stop(); this.onIdle?.(); }
      }
      if (this.daemon && Date.now() - this.lastDue > 60000) { this.lastDue = Date.now(); this.runDue(); }
    } finally { this.busy = false; }
  }
  runDue() {
    const f = path.join(SKILL, 'scripts/publish.mjs');
    if (!fs.existsSync(f)) { this.due = { at: new Date().toISOString(), skipped: 'chưa có scripts/publish.mjs' }; return; }
    execFile('node', [f, 'run-due'], { timeout: 50 * 60000, cwd: SKILL }, (e, out, err) => {
      this.due = { at: new Date().toISOString(), ok: !e, msg: String(e ? (err || e.message) : out).trim().split('\n').pop()?.slice(0, 200) || '' };
    });
  }
  runItem(it0) {
    const spec = KINDS[it0.kind], script = path.join(SKILL, 'scripts', spec.script);
    const upd = patch => mutate(q => { const it = q.items.find(x => x.id === it0.id); if (it) Object.assign(it, patch); return it; });
    if (!fs.existsSync(script)) { upd({ state: 'error', error: `Tính năng “${spec.name}” chưa được cài (thiếu scripts/${spec.script})`, step: 'Lỗi', finished: new Date().toISOString() }); return; }
    const attempt = (it0.attempt || 0) + 1;
    this.item = upd({ state: 'running', started: new Date().toISOString(), progress: 0, step: attempt > 1 ? 'Thử lại lần 2' : 'Bắt đầu', runner: process.pid, attempt, error: null, cancel: false });
    this.cancelled = false;
    const argv = argsFor(it0);
    this.log(`queue: chạy ${it0.kind} ${it0.input} (lần ${attempt})`);
    const p = spawn('node', [script, ...argv], { cwd: SKILL, detached: true, env: process.env });
    this.child = p;
    let log = '', last = 0, pending = {}, result = null;
    const flush = (force) => { if (force || Date.now() - last > 1000) { last = Date.now(); upd({ ...pending, log: log.slice(-1500) }); pending = {}; } };
    const onLine = l => {
      const m = /^@@ ([\d.]+) (.*)$/.exec(l);
      if (m) { pending.progress = Math.min(.999, +m[1]); pending.step = m[2]; }
      else if (/^PROJECT /.test(l)) { pending.project = l.slice(8).trim(); flush(true); }
      else if (/^RESULT /.test(l)) { try { result = JSON.parse(l.slice(7)); } catch {} }
      flush();
    };
    const feed = d => { const s = d.toString(); log = (log + s).slice(-8000); s.split(/[\r\n]/).forEach(l => l && onLine(l)); };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', e => feed('LỖI: ' + e.message));
    p.on('close', code => {
      this.child = null; this.item = null; this.idleSince = Date.now();
      const errLine = (log.match(/^LỖI: .*$/gm) || []).pop()?.slice(5) || log.trim().split('\n').slice(-2).join(' | ').slice(-300);
      const outputs = result?.outputs || (it0.opts?.out ? [it0.opts.out] : []);
      if (code === 0) { upd({ state: 'done', progress: 1, step: 'Xong', finished: new Date().toISOString(), outputs, result, log: log.slice(-1500) }); if (it0.kind !== 'autopilot') notify(`${spec.name} xong`, it0.title); }
      else if (this.cancelled) upd({ state: 'cancelled', step: 'Đã huỷ', finished: new Date().toISOString(), log: log.slice(-1500) });
      else if (attempt < 2 && !/chưa được cài|Chỉ nhận tệp|Không thấy /.test(errLine)) upd({ state: 'queued', step: `Lỗi, sẽ thử lại: ${errLine}`.slice(0, 300), error: errLine, log: log.slice(-1500) });
      else { upd({ state: 'error', step: 'Lỗi', error: errLine, finished: new Date().toISOString(), log: log.slice(-1500) }); if (it0.kind !== 'autopilot') notify(`${spec.name} lỗi`, `${it0.title}: ${errLine}`); }
      this.log(`queue: ${it0.kind} ${it0.input} → ${code === 0 ? 'xong' : this.cancelled ? 'huỷ' : 'lỗi ' + errLine}`);
    });
  }
  // Watch folders: a video whose size+mtime stayed the same for 5 s is moved to "Đã xử lý" and queued for Tự lái.
  scan(st) {
    this.watchErr = null;
    for (const f of st.watch.folders) {
      try {
        for (const d of [f.in, f.done, f.processed]) fs.mkdirSync(d, { recursive: true });
        for (const name of fs.readdirSync(f.in)) {
          const abs = path.join(f.in, name);
          if (name.startsWith('.') || /\.(download|crdownload|part|tmp)$/i.test(name) || !VIDEO_EXT.test(name)) continue;
          let s; try { s = fs.statSync(abs); } catch { continue; }
          if (!s.isFile() || s.size === 0) continue;
          const sig = `${s.size}:${s.mtimeMs}`, prev = this.seen.get(abs);
          if (!prev || prev.sig !== sig) { this.seen.set(abs, { sig, since: Date.now() }); continue; }
          if (Date.now() - prev.since < 5000) continue;
          this.seen.delete(abs);
          let dst = path.join(f.processed, name);
          for (let k = 2; fs.existsSync(dst); k++) dst = path.join(f.processed, `${path.basename(name, path.extname(name))} (${k})${path.extname(name)}`);
          fs.renameSync(abs, dst);
          const base = path.basename(dst, path.extname(dst));
          const it = addItem({ kind: 'autopilot', input: dst, opts: { profile: f.profile || st.profile || undefined, out: path.join(f.done, base) }, source: 'watch' });
          this.log(`watch: ${name} → hàng đợi (${it.id})`);
        }
      } catch (e) { this.watchErr = `${f.in}: ${e.message}`; }
    }
  }
}

// ---------- LaunchAgent (only when the user turns on "Chạy cả khi tắt app") ----------
const plistPath = () => path.join(LA_DIR, `${LA_LABEL}.plist`);
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Windows: a Task Scheduler task at logon running a hidden wscript launcher (no admin rights needed).
const WIN_TASK = 'AIVideoStudio-watch', winVbs = () => path.join(AVS_HOME, 'agent.vbs');
export function agentStatus() { return process.platform === 'win32' ? { installed: fs.existsSync(winVbs()), task: WIN_TASK } : { installed: fs.existsSync(plistPath()), plist: plistPath() }; }
export function agentInstall() {
  if (process.platform === 'win32') {
    const q = s => String(s).replace(/"/g, '""'), cmd = `"${process.execPath}" "${path.join(SKILL, 'scripts/queue.mjs')}" run --daemon --role agent`;
    fs.mkdirSync(AVS_HOME, { recursive: true });
    fs.writeFileSync(winVbs(), [`Set sh = CreateObject("WScript.Shell")`, `sh.CurrentDirectory = "${q(SKILL)}"`, `sh.Run "${q(cmd)}", 0, False`, ''].join('\r\n'));
    saveSettings({ agent: true });
    if (process.env.AVS_NO_LAUNCHCTL) return Promise.resolve({ ok: true, task: WIN_TASK, scheduler: false });
    return new Promise(ok => execFile('schtasks', ['/create', '/f', '/tn', WIN_TASK, '/sc', 'onlogon', '/rl', 'limited', '/tr', `wscript.exe "${winVbs()}"`], e =>
      execFile('schtasks', ['/run', '/tn', WIN_TASK], () => ok({ ok: !e, error: e?.message, task: WIN_TASK }))));
  }
  const node = process.execPath, logf = path.join(os.homedir(), 'Library/Logs/AIVideoStudio-watch.log');
  const PATH = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local/bin'), path.dirname(node), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  const env = { PATH, ...(process.env.AVS_HOME ? { AVS_HOME: process.env.AVS_HOME } : {}) };
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>Label</key><string>${LA_LABEL}</string>
 <key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(path.join(SKILL, 'scripts/queue.mjs'))}</string><string>run</string><string>--daemon</string><string>--role</string><string>agent</string></array>
 <key>WorkingDirectory</key><string>${xml(SKILL)}</string>
 <key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k, v]) => `<key>${k}</key><string>${xml(v)}</string>`).join('')}</dict>
 <key>RunAtLoad</key><true/>
 <key>KeepAlive</key><true/>
 <key>ThrottleInterval</key><integer>30</integer>
 <key>ProcessType</key><string>Background</string>
 <key>StandardOutPath</key><string>${xml(logf)}</string>
 <key>StandardErrorPath</key><string>${xml(logf)}</string>
</dict></plist>
`;
  fs.mkdirSync(LA_DIR, { recursive: true });
  fs.writeFileSync(plistPath(), plist);
  if (!process.env.AVS_NO_LAUNCHCTL && process.platform === 'darwin') {
    const uid = process.getuid();
    return new Promise(ok => execFile('launchctl', ['bootout', `gui/${uid}/${LA_LABEL}`], () => execFile('launchctl', ['bootstrap', `gui/${uid}`, plistPath()], e => { saveSettings({ agent: true }); ok({ ok: !e, error: e?.message, plist: plistPath() }); })));
  }
  saveSettings({ agent: true });
  return Promise.resolve({ ok: true, plist: plistPath(), launchctl: false });
}
export function agentUninstall() {
  saveSettings({ agent: false });
  if (process.platform === 'win32') {
    const done = () => { fs.rmSync(winVbs(), { force: true }); return { ok: true }; };
    return process.env.AVS_NO_LAUNCHCTL ? Promise.resolve(done()) : new Promise(ok => execFile('schtasks', ['/delete', '/f', '/tn', WIN_TASK], () => ok(done())));
  }
  const done = () => { fs.rmSync(plistPath(), { force: true }); return { ok: true }; };
  if (!process.env.AVS_NO_LAUNCHCTL && process.platform === 'darwin' && fs.existsSync(plistPath()))
    return new Promise(ok => execFile('launchctl', ['bootout', `gui/${process.getuid()}/${LA_LABEL}`], () => ok(done())));
  return Promise.resolve(done());
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const [cmd, a, b] = args;
  const fmt = it => `${it.id}  ${it.state.padEnd(9)} ${it.kind.padEnd(10)} ${Math.round((it.progress || 0) * 100).toString().padStart(3)}%  ${it.title}  ${it.state === 'error' ? '— ' + it.error : it.step || ''}`;
  try {
    if (cmd === 'add') {
      const opts = { ...(opt('--opts') ? JSON.parse(opt('--opts')) : {}) };
      if (opt('--profile')) opts.profile = opt('--profile'); if (opt('--out')) opts.out = path.resolve(opt('--out'));
      const input = a === 'topic' ? b : path.resolve(b.replace(/^~(?=\/)/, os.homedir()));
      console.log(fmt(addItem({ kind: a, input, opts, source: 'cli' })));
    } else if (cmd === 'list') { const q = loadQueue(); if (!q.items.length) console.log('(hàng đợi trống)'); q.items.forEach(it => console.log(fmt(it))); const l = readLock(); console.log(l && alive(l.pid) ? `runner: pid ${l.pid} (${l.role})` : 'runner: không chạy'); }
    else if (cmd === 'cancel') console.log(cancelItem(a) ? 'ok' : 'không thấy');
    else if (cmd === 'retry') console.log(retryItem(a) ? 'ok' : 'không thể');
    else if (cmd === 'remove') console.log(removeItem(a) ? 'ok' : 'không thể');
    else if (cmd === 'up' || cmd === 'down') console.log(moveItem(a, cmd === 'up' ? -1 : 1) ? 'ok' : 'không thể');
    else if (cmd === 'clear-done') console.log(clearDone());
    else if (cmd === 'run') {
      const daemon = args.includes('--daemon');
      const r = new Runner({ role: opt('--role', daemon ? 'daemon' : 'cli'), daemon, log: m => console.log(`[${new Date().toLocaleTimeString('vi-VN')}] ${m}`) });
      r.onIdle = () => { console.log('Hàng đợi trống — xong.'); process.exit(0); };
      for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { r.stop(); process.exit(0); });
      r.start();
      setInterval(() => { if (!r.active && !daemon) { const l = readLock(); console.log(`Đang có runner khác (pid ${l?.pid}, ${l?.role}) — chờ…`); } }, 30000);
    } else if (cmd === 'agent') {
      const f = { install: agentInstall, uninstall: agentUninstall, status: async () => agentStatus() }[a];
      if (!f) throw new Error('agent install|uninstall|status');
      console.log(JSON.stringify(await f()));
    } else { console.error('usage: node scripts/queue.mjs add <kind> <input> [--profile id] [--out dir] | list | cancel|retry|remove|up|down <id> | clear-done | run [--daemon] | agent install|uninstall|status'); process.exit(2); }
  } catch (e) { console.error('LỖI: ' + e.message); process.exit(1); }
}
