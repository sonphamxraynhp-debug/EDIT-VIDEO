// Agent: Telegram gateway (scripts/telegram.mjs, runs in-process while Studio is open) + feedback loop + suggestions
// (scripts/feedback.mjs). Spec: references/agent-telegram.md. Env AVS_NO_TELEGRAM=1 → never start the bot here.
//   GET  /api/agent/state                         → {tg, feedback, suggestions, profiles, tags, improve}
//   POST /api/agent/telegram {token?, on?, profile?, digest?, autoImprove?} → (re)start/stop the bot
//   POST /api/agent/pair · /unpair {id} · /test
//   POST /api/agent/feedback {video?, project?, rating, tags[], comment}
//   POST /api/agent/improve {claude} · /suggest {claude} · /act {id, action: apply|dismiss}
import fs from 'node:fs';
import path from 'node:path';
import { TelegramBot, loadCfg, saveCfg, newPairCode } from '../../scripts/telegram.mjs';
import { TAGS, addFeedback, listFeedback, improve, refreshSuggestions, loadSuggestions, actSuggestion } from '../../scripts/feedback.mjs';
import { loadStore, AVS_HOME } from '../../scripts/profile.mjs';

export default ctx => {
  // The Studio's own queue runner (15_autopilot) executes the jobs; this bot only talks.
  let bot = null;
  const restart = async () => {
    bot?.stop(); bot = null;
    const c = loadCfg();
    if (process.env.AVS_NO_TELEGRAM || !c.on || !c.token) return null;
    bot = new TelegramBot({ runQueue: !!process.env.AVS_NO_QUEUE });
    try { await bot.start(); } catch (e) { const b = bot; bot = null; return { error: e.message, b }; }
    return null;
  };
  let startErr = null;
  restart().then(r => { startErr = r?.error || null; }).catch(e => { startErr = e.message; });
  for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => bot?.stop());
  const tgState = () => { const c = loadCfg(); return bot ? { ...bot.status(), error: bot.lastError || startErr } : { running: false, error: startErr, on: c.on, hasToken: !!c.token, allowed: c.allowed, profile: c.profile, digest: c.digest, autoImprove: c.autoImprove, pair: c.pair && Date.parse(c.pair.exp) > Date.now() ? c.pair : null }; };
  const recentVideos = () => {
    const d = ctx.project?.dir; if (!d) return [];
    const out = path.join(d, 'out'); if (!fs.existsSync(out)) return [];
    return fs.readdirSync(out).filter(f => /\.mp4$/i.test(f)).map(f => path.join(out, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(0, 6);
  };
  return async (req, res, p) => {
    if (!p.startsWith('/api/agent/')) return false;
    const J = o => (ctx.json(res, o), true);
    const b = req.method === 'POST' ? await ctx.body(req) : {};
    try {
      if (p === '/api/agent/state') {
        const imp = (() => { try { return JSON.parse(fs.readFileSync(path.join(AVS_HOME, 'improve_log.json'), 'utf8')).slice(-1)[0]; } catch { return null; } })();
        const fb = listFeedback(40).reverse();
        return J({ tg: tgState(), feedback: fb, suggestions: loadSuggestions().items.slice().reverse(), tags: TAGS, improve: imp,
          profiles: loadStore().profiles.map(x => ({ id: x.id, name: x.name, fb: x.fb || null })), videos: recentVideos().map(v => ({ file: v, name: path.basename(v), rated: fb.some(e => e.video === v) })) });
      }
      if (p === '/api/agent/telegram') {
        const patch = {};
        if (typeof b.token === 'string' && b.token.trim()) { if (!/^\d+:[\w-]{30,}$/.test(b.token.trim())) return J({ error: 'Token không đúng dạng 123456:ABC… (lấy từ @BotFather)' }); patch.token = b.token.trim(); patch.offset = 0; }
        for (const k of ['on', 'autoImprove']) if (k in b) patch[k] = !!b[k];
        if ('profile' in b) patch.profile = String(b.profile || '');
        if ('digest' in b) patch.digest = /^\d{1,2}:\d{2}$/.test(b.digest) ? b.digest : '';
        saveCfg(patch);
        const r = await restart(); startErr = r?.error || null;
        return J({ ok: !r?.error, error: r?.error, tg: tgState() });
      }
      if (p === '/api/agent/pair') return J({ pair: newPairCode(), bot: bot?.me?.username || null });
      if (p === '/api/agent/unpair') { const c = loadCfg(); saveCfg({ allowed: c.allowed.filter(a => String(a.id) !== String(b.id)) }); return J({ ok: true, tg: tgState() }); }
      if (p === '/api/agent/test') {
        if (!bot) return J({ error: 'Bot chưa chạy' });
        const c = loadCfg(); for (const a of c.allowed) await bot.send(a.id, '👋 Tin thử từ AI Video Studio — kết nối ổn!');
        return J({ ok: true, sent: c.allowed.length });
      }
      if (p === '/api/agent/feedback') return J({ ok: true, entry: addFeedback({ video: b.video, project: b.project || ctx.project?.dir, rating: b.rating, tags: b.tags || [], comment: b.comment || '', source: 'studio' }) });
      if (p === '/api/agent/improve') return J(await improve({ claude: b.claude !== false }));
      if (p === '/api/agent/suggest') return J(await refreshSuggestions({ claude: b.claude !== false }));
      if (p === '/api/agent/act') return J(await actSuggestion(b.id, b.action === 'dismiss' ? 'dismiss' : 'apply'));
    } catch (e) { return J({ error: e.message }); }
    return J({ error: 'không rõ yêu cầu' });
  };
};
