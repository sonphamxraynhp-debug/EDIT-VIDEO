// Telegram gateway + agent (references/agent-telegram.md). Long polling (getUpdates) — no public URL/webhook needed:
// the bot waits for messages, only paired chats may use it.
//   • gửi video (≤ 20 MB, giới hạn Bot API) → Tự lái dựng → bot gửi lại video + điểm QC + nút chấm điểm
//   • /chude <chủ đề> → video từ chủ đề · /trangthai · /dexuat · /caitien · /hoso · /help
//   • nhắn tự do → agent (Claude CLI) hiểu ý và chạy đúng việc
//   • chấm ★ + bấm thẻ góp ý + gõ góp ý → feedback.mjs → tự cải tiến hồ sơ kênh; mỗi sáng gửi đề xuất kèm nút Áp dụng.
// Config ~/.ai-video-studio/telegram.json (mode 600): {token, on, allowed:[{id,name}], pair, profile, digest:"08:00", autoImprove}
//   node scripts/telegram.mjs token <BOT_TOKEN>   · pair (in mã ghép nối) · run (chạy bot + hàng đợi) · status
// Inside the Studio server the bot runs in-process (studio/routes/46_agent.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AVS_HOME, loadQueue, addItem, retryItem, Runner, KINDS } from './queue.mjs';
import { loadStore } from './profile.mjs';
import { TAGS, addFeedback, patchFeedback, improve, refreshSuggestions, loadSuggestions, actSuggestion, askClaudeJSON, listFeedback } from './feedback.mjs';

const CFG = path.join(AVS_HOME, 'telegram.json'), INBOX = path.join(AVS_HOME, 'telegram', 'inbox');
const API = process.env.AVS_TG_API || 'https://api.telegram.org'; // override = local fake server in tests
const VIDEO = /\.(mp4|mov|m4v|mkv|webm)$/i, MAX_DL = 20 * 1024 * 1024, MAX_UP = 49 * 1024 * 1024;
export const DEFAULTS = { token: '', on: false, allowed: [], pair: null, profile: '', digest: '08:00', autoImprove: true, offset: 0, notified: [], fbmap: {}, pending: {}, lastDigest: '', lastImproveN: 0 };
export function loadCfg() { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CFG, 'utf8')) }; } catch { return { ...DEFAULTS }; } }
export function saveCfg(patch) {
  const c = { ...loadCfg(), ...patch };
  fs.mkdirSync(AVS_HOME, { recursive: true });
  fs.writeFileSync(CFG, JSON.stringify(c, null, 1), { mode: 0o600 }); try { fs.chmodSync(CFG, 0o600); } catch { /* windows */ }
  return c;
}
export const publicCfg = c => ({ on: c.on, hasToken: !!c.token, allowed: c.allowed, pair: c.pair && Date.parse(c.pair.exp) > Date.now() ? c.pair : null, profile: c.profile, digest: c.digest, autoImprove: c.autoImprove });
export function newPairCode() { const pair = { code: String(crypto.randomInt(100000, 999999)), exp: new Date(Date.now() + 15 * 60e3).toISOString() }; saveCfg({ pair }); return pair; }

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const vn = n => new Date(n).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const rdj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const STATE_VI = { queued: 'đang chờ', running: 'đang chạy', done: 'xong', failed: 'lỗi', cancelled: 'đã huỷ' };
const HELP = `<b>AI Video Studio · Agent</b>
🎬 Gửi một video (≤ 20 MB) → tự dựng xong gửi lại
💡 /chude &lt;chủ đề&gt; → làm video không cần quay
📋 /trangthai → hàng đợi đang làm gì
✨ /dexuat → đề xuất cải tiến + ý tưởng video
🧠 /caitien → học từ các lần chấm điểm để dựng đúng gu hơn
🪪 /hoso → chọn hồ sơ kênh cho video gửi qua bot
Hoặc cứ nhắn tự nhiên, ví dụ: "làm video về 3 mẹo chốt đơn", "video hôm qua sao rồi?"`;

export class TelegramBot {
  constructor({ log = (...a) => console.log('[telegram]', ...a), runQueue = false } = {}) {
    Object.assign(this, { log, runQueue, running: false, ctrl: null, timers: [], me: null, lastError: null, runner: null, busy: new Set() });
  }
  get cfg() { return loadCfg(); }
  async api(method, params = {}, { signal } = {}) {
    const r = await fetch(`${API}/bot${this.cfg.token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params), signal });
    const j = await r.json().catch(() => ({ ok: false, description: 'HTTP ' + r.status }));
    if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
    return j.result;
  }
  async upload(method, chat_id, field, file, extra = {}) {
    const fd = new FormData();
    fd.append('chat_id', String(chat_id));
    for (const [k, v] of Object.entries(extra)) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    fd.append(field, new Blob([fs.readFileSync(file)]), path.basename(file));
    const j = await (await fetch(`${API}/bot${this.cfg.token}/${method}`, { method: 'POST', body: fd })).json();
    if (!j.ok) throw new Error(`${method}: ${j.description}`);
    return j.result;
  }
  send(chat_id, text, extra = {}) { return this.api('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }).catch(e => this.log(e.message)); }

  async start() {
    if (this.running) return this;
    const c = this.cfg;
    if (!c.token) throw new Error('Chưa có token bot (BotFather)');
    this.me = await this.api('getMe');
    this.running = true; this.lastError = null;
    await this.api('setMyCommands', { commands: [['chude', 'Làm video từ chủ đề'], ['trangthai', 'Hàng đợi đang làm gì'], ['dexuat', 'Đề xuất cải tiến + ý tưởng'], ['caitien', 'Tự cải tiến từ phản hồi'], ['hoso', 'Chọn hồ sơ kênh'], ['help', 'Hướng dẫn']].map(([command, description]) => ({ command, description })) }).catch(() => {});
    if (this.runQueue) this.runner = new Runner({ role: 'telegram', daemon: true, log: m => this.log(m) }).start();
    this.loop();
    this.timers.push(setInterval(() => this.deliver().catch(e => this.log('deliver:', e.message)), 5000));
    this.timers.push(setInterval(() => this.daily().catch(e => this.log('digest:', e.message)), 60000));
    this.log(`đang chờ tin nhắn cho @${this.me.username}`);
    return this;
  }
  stop() { this.running = false; this.ctrl?.abort(); for (const t of this.timers) clearInterval(t); this.timers = []; this.runner?.stop(); this.runner = null; }
  status() { const c = this.cfg; return { running: this.running, bot: this.me ? { username: this.me.username, name: this.me.first_name } : null, error: this.lastError, ...publicCfg(c) }; }

  async loop() {
    while (this.running) {
      try {
        this.ctrl = new AbortController();
        const ups = await this.api('getUpdates', { offset: this.cfg.offset, timeout: 30, allowed_updates: ['message', 'callback_query'] }, { signal: this.ctrl.signal });
        for (const u of ups) {
          saveCfg({ offset: u.update_id + 1 });
          await (u.callback_query ? this.onCallback(u.callback_query) : u.message ? this.onMessage(u.message) : null)?.catch(e => { this.log('update:', e.message); });
        }
        this.lastError = null;
      } catch (e) {
        if (!this.running) break;
        this.lastError = e.message; this.log(e.message);
        await new Promise(r => setTimeout(r, /409|Conflict/.test(e.message) ? 15000 : 5000));
      }
    }
  }
  allowed(chat) { return this.cfg.allowed.some(a => String(a.id) === String(chat.id)); }

  async onMessage(m) {
    const chat = m.chat, text = (m.text || m.caption || '').trim();
    if (!this.allowed(chat)) {
      const c = this.cfg, code = (text.match(/\d{6}/) || [])[0];
      if (code && c.pair && code === c.pair.code && Date.parse(c.pair.exp) > Date.now()) {
        saveCfg({ allowed: [...c.allowed, { id: chat.id, name: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id) }], pair: null });
        return this.send(chat.id, `✅ Đã ghép nối với AI Video Studio.\n\n${HELP}`);
      }
      return this.send(chat.id, '🔒 Bot riêng của AI Video Studio. Mở Studio → <b>Agent</b> → <b>Lấy mã ghép nối</b>, rồi gửi <code>/start 123456</code> vào đây.');
    }
    const vid = m.video || m.video_note || (m.document && (/^video\//.test(m.document.mime_type || '') || VIDEO.test(m.document.file_name || '')) ? m.document : null);
    if (vid) return this.onVideo(chat, vid, text);
    if (!text) return;
    const pend = this.cfg.pending[chat.id];
    if (pend && Date.parse(pend.until) > Date.now() && !text.startsWith('/')) {
      patchFeedback(pend.fid, { comment: text.slice(0, 1000) });
      const p = { ...this.cfg.pending }; delete p[chat.id]; saveCfg({ pending: p });
      await this.send(chat.id, '🙏 Đã ghi góp ý. Lần sau Tự lái sẽ tính tới điều này.');
      return this.maybeImprove(chat.id);
    }
    const [cmd, ...rest] = text.split(/\s+/), arg = rest.join(' ').trim();
    switch (cmd.toLowerCase().replace(/@.*/, '')) {
      case '/start': case '/help': case '/huongdan': return this.send(chat.id, HELP);
      case '/trangthai': case '/status': return this.send(chat.id, this.statusText());
      case '/chude': case '/topic': return arg ? this.queueTopic(chat, arg) : this.send(chat.id, 'Gõ: <code>/chude 3 mẹo chốt đơn livestream</code>');
      case '/dexuat': return this.sendSuggestions(chat.id, true);
      case '/caitien': return this.runImprove(chat.id);
      case '/hoso': return this.chooseProfile(chat.id);
      default: return this.agent(chat, text);
    }
  }

  async onVideo(chat, v, caption) {
    if (v.file_size && v.file_size > MAX_DL) return this.send(chat.id, `📦 Video ${(v.file_size / 1048576).toFixed(0)} MB vượt giới hạn 20 MB của bot Telegram.\nCách khác: chép video vào thư mục tự động trên máy, hoặc nhắn đường dẫn file trên máy (ví dụ <code>/Users/ban/Movies/clip.mov</code>).`);
    await this.api('sendChatAction', { chat_id: chat.id, action: 'upload_video' }).catch(() => {});
    const f = await this.api('getFile', { file_id: v.file_id });
    const r = await fetch(`${API}/file/bot${this.cfg.token}/${f.file_path}`);
    if (!r.ok) throw new Error('tải video lỗi ' + r.status);
    fs.mkdirSync(INBOX, { recursive: true });
    const name = (v.file_name || path.basename(f.file_path) || 'video.mp4').replace(/[^\p{L}\p{N}._-]+/gu, '_');
    const dst = path.join(INBOX, `${Date.now().toString(36)}_${VIDEO.test(name) ? name : name + '.mp4'}`);
    fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer()));
    const it = addItem({ kind: 'autopilot', input: dst, opts: { ...(this.cfg.profile ? { profile: this.cfg.profile } : {}), telegram: { chat: chat.id } }, source: 'telegram' });
    return this.send(chat.id, `🎬 Đã nhận video, đang dựng (#${it.id}). Thường mất 2–4 phút, xong mình gửi lại ngay.`);
  }
  queueTopic(chat, topic) {
    const it = addItem({ kind: 'topic', input: topic, opts: { telegram: { chat: chat.id } }, source: 'telegram' });
    return this.send(chat.id, `💡 Đang làm video chủ đề “${esc(topic)}” (#${it.id}): viết kịch bản → giọng đọc → b-roll → xuất.`);
  }
  statusText() {
    const items = loadQueue().items.slice(-8).reverse();
    if (!items.length) return 'Hàng đợi trống. Gửi video hoặc /chude để bắt đầu.';
    return '<b>Hàng đợi</b>\n' + items.map(i => `${i.state === 'done' ? '✅' : i.state === 'failed' ? '⚠️' : i.state === 'running' ? '⏳' : '🕒'} ${esc(KINDS[i.kind]?.name || i.kind)} · ${esc(i.title)} — ${STATE_VI[i.state] || i.state}${i.state === 'running' ? ` ${Math.round((i.progress || 0) * 100)}% ${esc(i.step || '')}` : ''}`).join('\n');
  }

  // ---------- results → chat ----------
  async deliver() {
    const c = this.cfg, done = new Set(c.notified);
    for (const it of loadQueue().items) {
      const chat = it.opts?.telegram?.chat;
      if (!chat || done.has(it.id) || !['done', 'failed'].includes(it.state) || this.busy.has(it.id)) continue;
      this.busy.add(it.id);
      try {
        if (it.state === 'failed') {
          await this.send(chat, `⚠️ Việc #${it.id} (${esc(it.title)}) bị lỗi: ${esc(String(it.error || it.step || '').slice(0, 300))}`, { reply_markup: { inline_keyboard: [[{ text: '🔁 Chạy lại', callback_data: `q:${it.id}:retry` }]] } });
        } else {
          const vids = (it.outputs || []).filter(f => VIDEO.test(f) && fs.existsSync(f)), proj = it.project || it.result?.project;
          const qc = proj ? rdj(path.join(proj, '.studio/qc.json'), null) : null, pub = proj ? rdj(path.join(proj, 'publish/publish.json'), null) : null;
          const sec = it.result?.seconds, cap = pub?.platforms?.tiktok?.caption || pub?.tiktok?.caption || '';
          const head = `✅ Xong <b>${esc(it.title)}</b>${sec ? ` sau ${sec}s` : ''}${qc?.score != null ? ` · AI kiểm tra ${qc.score}/100` : ''}`;
          const v = vids[0];
          if (v && fs.statSync(v).size <= MAX_UP) await this.upload('sendVideo', chat, 'video', v, { caption: head + (cap ? `\n\n${esc(cap).slice(0, 700)}` : ''), parse_mode: 'HTML', supports_streaming: 'true' });
          else await this.send(chat, head + (v ? `\n📁 ${esc(v)} (lớn hơn 50 MB nên không gửi qua Telegram được)` : ''));
          await this.send(chat, 'Video này thế nào? Chấm để Tự lái học gu của bạn:', { reply_markup: { inline_keyboard: [[1, 2, 3, 4, 5].map(n => ({ text: `${n}⭐`, callback_data: `r:${it.id}:${n}` }))] } });
        }
        saveCfg({ notified: [...this.cfg.notified, it.id].slice(-300) });
      } catch (e) { this.log('gửi kết quả lỗi:', e.message); }
      finally { this.busy.delete(it.id); }
    }
  }

  async onCallback(q) {
    const chat = q.message?.chat; if (!chat || !this.allowed(chat)) return this.api('answerCallbackQuery', { callback_query_id: q.id, text: 'Chưa ghép nối' }).catch(() => {});
    const [k, a, b] = (q.data || '').split(':'), ack = text => this.api('answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
    if (k === 'r') {
      const it = loadQueue().items.find(x => x.id === a), vid = (it?.outputs || []).find(f => VIDEO.test(f));
      const e = addFeedback({ video: vid, project: it?.project || it?.result?.project, rating: +b, source: 'telegram', chat: chat.id });
      saveCfg({ fbmap: { ...this.cfg.fbmap, [a]: e.id }, pending: { ...this.cfg.pending, [chat.id]: { fid: e.id, until: new Date(Date.now() + 15 * 60e3).toISOString() } } });
      await ack(`Đã chấm ${b}★`);
      const tags = Object.entries(TAGS).map(([t, l]) => ({ text: l, callback_data: `t:${e.id}:${t}` }));
      const rows = []; for (let i = 0; i < tags.length; i += 2) rows.push(tags.slice(i, i + 2));
      await this.api('editMessageText', { chat_id: chat.id, message_id: q.message.message_id, text: `Đã chấm ${'⭐'.repeat(+b)} — chọn điều cần sửa (bấm nhiều được), hoặc gõ góp ý:`, reply_markup: { inline_keyboard: [...rows, [{ text: '✔️ Xong', callback_data: `d:${e.id}` }]] } }).catch(() => {});
      return;
    }
    if (k === 't') { patchFeedback(a, { tags: [b] }); return ack(`Đã ghi: ${TAGS[b] || b}`); }
    if (k === 'd') {
      await ack('Cảm ơn!');
      await this.api('editMessageText', { chat_id: chat.id, message_id: q.message.message_id, text: '🙏 Đã ghi phản hồi. Muốn nói thêm thì cứ gõ.' }).catch(() => {});
      return this.maybeImprove(chat.id);
    }
    if (k === 's') { await ack('Đang xử lý…'); const r = await actSuggestion(a, b, { onImprove: () => improve({ claude: true }) }).catch(e => ({ msg: '⚠️ ' + e.message })); return this.send(chat.id, (b === 'apply' ? '✅ ' : '🗑 ') + esc(r.msg)); }
    if (k === 'q' && b === 'retry') { await ack(retryItem(a) ? 'Đã cho chạy lại' : 'Không chạy lại được'); return; }
    if (k === 'p') { saveCfg({ profile: a === '_' ? '' : a }); await ack('Đã chọn'); return this.send(chat.id, `🪪 Video gửi qua bot sẽ dùng hồ sơ: <b>${esc(a === '_' ? 'mặc định' : loadStore().profiles.find(p => p.id === a)?.name || a)}</b>`); }
    return ack('');
  }

  // ---------- self-improvement & suggestions ----------
  async maybeImprove(chatId) {
    const c = this.cfg, n = listFeedback().length;
    if (!c.autoImprove || n - (c.lastImproveN || 0) < 3) return;
    saveCfg({ lastImproveN: n });
    const r = await improve({ claude: true }).catch(e => ({ error: e.message }));
    const notes = (r.profiles || []).flatMap(p => p.notes.map(x => `• ${p.name}: ${x}`));
    if (notes.length || r.ai?.summary) await this.send(chatId, `🧠 <b>Đã tự cải tiến</b> từ ${n} phản hồi${r.ai?.summary ? `\n${esc(r.ai.summary)}` : ''}${notes.length ? '\n' + esc(notes.slice(0, 6).join('\n')) : ''}${r.suggestions ? `\n\n✨ Có ${r.suggestions} đề xuất mới: /dexuat` : ''}`);
  }
  async runImprove(chatId) {
    await this.send(chatId, '🧠 Đang phân tích các lần chấm điểm…');
    saveCfg({ lastImproveN: listFeedback().length });
    const r = await improve({ claude: true }).catch(e => ({ error: e.message }));
    if (r.error) return this.send(chatId, '⚠️ ' + esc(r.error));
    const lines = (r.profiles || []).map(p => `• <b>${esc(p.name)}</b>: ${p.n} phản hồi${p.avg ? `, TB ${p.avg}★` : ''}${p.notes.length ? '\n  ' + esc(p.notes.join('\n  ')) : ' — chưa đủ dữ liệu để chỉnh'}`);
    await this.send(chatId, `🧠 <b>Kết quả tự cải tiến</b>\n${lines.join('\n')}${r.ai?.summary ? `\n\n🤖 ${esc(r.ai.summary)}` : r.ai?.error ? `\n\n(AI: ${esc(r.ai.error)})` : ''}`);
    if (r.suggestions) return this.sendSuggestions(chatId, false);
  }
  async sendSuggestions(chatId, refresh) {
    if (refresh) { await this.send(chatId, '✨ Đang xem lại dữ liệu để đề xuất…'); await refreshSuggestions({ claude: true }).catch(e => this.log(e.message)); }
    const items = loadSuggestions().items.filter(s => s.state === 'new').slice(-6).reverse();
    if (!items.length) return this.send(chatId, 'Hiện chưa có đề xuất mới. Gửi thêm video và chấm điểm để mình có dữ liệu.');
    for (const s of items) await this.send(chatId, `<b>${esc(s.title)}</b>\n${esc(s.detail || '')}`, { reply_markup: { inline_keyboard: [[...(s.action?.type && s.action.type !== 'none' ? [{ text: '✅ Áp dụng', callback_data: `s:${s.id}:apply` }] : []), { text: '🗑 Bỏ qua', callback_data: `s:${s.id}:dismiss` }]] } });
  }
  async daily() {
    const c = this.cfg; if (!c.digest || !c.allowed.length) return;
    const now = new Date(), today = now.toISOString().slice(0, 10), [h, m] = c.digest.split(':').map(Number);
    if (c.lastDigest === today || now.getHours() * 60 + now.getMinutes() < h * 60 + (m || 0)) return;
    saveCfg({ lastDigest: today });
    await refreshSuggestions({ claude: true }).catch(() => {});
    const q = loadQueue().items.filter(i => Date.now() - Date.parse(i.finished || i.created) < 864e5);
    for (const a of c.allowed) {
      await this.send(a.id, `☀️ <b>Bản tin sáng</b> — 24 giờ qua: ${q.filter(i => i.state === 'done').length} video xong, ${q.filter(i => i.state === 'failed').length} lỗi.`);
      await this.sendSuggestions(a.id, false);
    }
  }
  async chooseProfile(chatId) {
    const s = loadStore(), cur = this.cfg.profile;
    const rows = [[{ text: (cur ? '' : '● ') + 'Mặc định', callback_data: 'p:_' }], ...s.profiles.map(p => [{ text: (cur === p.id ? '● ' : '') + p.name + (p.fb?.avg ? ` (${p.fb.avg}★)` : ''), callback_data: `p:${p.id}` }])];
    return this.send(chatId, '🪪 Chọn hồ sơ kênh cho video gửi qua bot:', { reply_markup: { inline_keyboard: rows } });
  }

  // ---------- free text → agent ----------
  async agent(chat, text) {
    await this.api('sendChatAction', { chat_id: chat.id, action: 'typing' }).catch(() => {});
    const q = loadQueue().items.slice(-6).map(i => ({ id: i.id, kind: i.kind, title: i.title, state: i.state, step: i.step, error: i.error?.slice?.(0, 120) }));
    const prompt = `Bạn là agent của AI Video Studio (phần mềm tự dựng video ngắn tiếng Việt) trò chuyện qua Telegram với chủ kênh. Trả lời ngắn, thân thiện, tiếng Việt.
Hàng đợi gần đây: ${JSON.stringify(q)}
Hồ sơ kênh: ${JSON.stringify(loadStore().profiles.map(p => ({ id: p.id, name: p.name, avg: p.fb?.avg })))}
Đề xuất đang chờ: ${loadSuggestions().items.filter(s => s.state === 'new').length}
Việc bạn có thể làm (chọn tối đa 1): topic {topic} = làm video từ chủ đề · video_path {path} = dựng video có sẵn trên máy theo đường dẫn · status · suggest · improve · profile {id} = đổi hồ sơ cho bot · retry {id} · none.
Tin nhắn: ${JSON.stringify(text.slice(0, 1500))}
Chỉ trả JSON: {"reply":"…","action":{"type":"…", …}}`;
    let r;
    try { r = await askClaudeJSON(prompt, { model: 'sonnet', timeout: 120000 }); }
    catch (e) { return this.send(chat.id, `${/Claude/.test(e.message) ? '🤖 Máy chưa cài/đăng nhập Claude Code nên mình chỉ hiểu lệnh.' : '⚠️ ' + esc(e.message.slice(0, 200))}\n\n${HELP}`); }
    if (r.reply) await this.send(chat.id, esc(r.reply));
    const a = r.action || {};
    if (a.type === 'topic' && a.topic) return this.queueTopic(chat, a.topic);
    if (a.type === 'video_path' && a.path) {
      const f = String(a.path).replace(/^["']|["']$/g, '');
      if (!fs.existsSync(f) || !VIDEO.test(f)) return this.send(chat.id, `Không thấy file video: <code>${esc(f)}</code>`);
      const it = addItem({ kind: 'autopilot', input: f, opts: { ...(this.cfg.profile ? { profile: this.cfg.profile } : {}), telegram: { chat: chat.id } }, source: 'telegram' });
      return this.send(chat.id, `🎬 Đang dựng ${esc(path.basename(f))} (#${it.id}).`);
    }
    if (a.type === 'status') return this.send(chat.id, this.statusText());
    if (a.type === 'suggest') return this.sendSuggestions(chat.id, true);
    if (a.type === 'improve') return this.runImprove(chat.id);
    if (a.type === 'profile') return this.chooseProfile(chat.id);
    if (a.type === 'retry' && a.id) return this.send(chat.id, retryItem(a.id) ? `🔁 Đã cho chạy lại #${esc(a.id)}` : 'Không chạy lại được việc đó.');
  }
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  const [cmd, a] = process.argv.slice(2);
  if (cmd === 'token') { saveCfg({ token: String(a || '').trim(), on: true }); console.log('Đã lưu token (chỉ bạn đọc được file).'); }
  else if (cmd === 'pair') { const p = newPairCode(); console.log(`Mã ghép nối: ${p.code} (15 phút). Gửi "/start ${p.code}" cho bot.`); }
  else if (cmd === 'status') console.log(JSON.stringify(publicCfg(loadCfg()), null, 1));
  else if (cmd === 'run') {
    const bot = new TelegramBot({ runQueue: !process.argv.includes('--no-queue') });
    await bot.start().catch(e => { console.error(e.message); process.exit(1); });
    for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => { bot.stop(); process.exit(0); });
  } else { console.error('usage: node scripts/telegram.mjs token <BOT_TOKEN> | pair | run [--no-queue] | status'); process.exit(2); }
}
