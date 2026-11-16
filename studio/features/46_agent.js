// Agent panel: Telegram gateway (pairing, status), feedback on exported videos, self-improvement and suggestions.
// Server: studio/routes/46_agent.mjs · scripts/telegram.mjs, feedback.mjs (references/agent-telegram.md).
(() => {
  const { $, esc } = Studio;
  const S = { st: null, tab: 'tg', busy: '', rate: {} };
  const active = () => (typeof panel === 'undefined' ? true : panel === 'agent'); // library.js global
  const css = document.createElement('style');
  css.textContent = `
  .ag-tabs { display: flex; gap: 4px; margin: 2px 0 8px; } .ag-tabs button { flex: 1; justify-content: center; font-size: 11.5px; } .ag-tabs button.on { background: var(--acc-soft); border-color: var(--acc-line); color: var(--tx); }
  .ag-card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r); padding: 10px; margin: 8px 0; font-size: 12px; }
  .ag-card h4 { margin: 0 0 8px; font-size: 12px; display: flex; gap: 6px; align-items: center; } .ag-card h4 .r { margin-left: auto; font-weight: 500; color: var(--tx3); font-size: 11px; }
  .ag-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tx3); display: inline-block; } .ag-dot.on { background: var(--ok); box-shadow: 0 0 8px var(--ok); } .ag-dot.err { background: var(--bad); }
  .ag-steps { margin: 4px 0 8px 16px; padding: 0; color: var(--tx2); line-height: 1.6; font-size: 11.5px; }
  .ag-code { font: 700 26px/1 var(--mono, monospace); letter-spacing: 4px; text-align: center; padding: 10px; background: var(--bg1); border-radius: 8px; margin: 6px 0; color: var(--acc); }
  .ag-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 6px; align-items: center; padding: 6px 0; border-top: 1px solid var(--line); }
  .ag-row small { display: block; color: var(--tx3); font-size: 10.5px; } .ag-row .nm { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ag-stars { display: flex; gap: 2px; } .ag-stars button { width: 26px; height: 26px; padding: 0; justify-content: center; font-size: 14px; background: none; border: 0; filter: grayscale(1) opacity(.45); }
  .ag-stars button.on { filter: none; }
  .ag-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; } .ag-chips span { padding: 3px 8px; border-radius: 99px; border: 1px solid var(--line2); font-size: 10.5px; cursor: pointer; color: var(--tx2); }
  .ag-chips span.on { background: var(--acc-soft); border-color: var(--acc-line); color: var(--tx); }
  .ag-sug { padding: 8px 0; border-top: 1px solid var(--line); } .ag-sug b { display: block; font-size: 12px; } .ag-sug p { margin: 3px 0 6px; color: var(--tx2); font-size: 11.5px; line-height: 1.45; }
  .ag-sug .acts { display: flex; gap: 4px; } .ag-sug.done { opacity: .5; } .ag-sug .res { font-size: 10.5px; color: var(--tx3); }
  .ag-notes { margin: 4px 0 0 14px; padding: 0; font-size: 11px; color: var(--tx2); } .ag-notes li { margin: 2px 0; }`;
  document.head.appendChild(css);

  async function load() { S.st = await Studio.api('/api/agent/state'); render(); }
  const post = async (url, body, label) => {
    S.busy = label || '…'; render();
    try { const r = await Studio.api(url, body); if (r.error) Studio.toast(r.error); return r; }
    finally { S.busy = ''; await load(); }
  };
  const stars = (key, cur) => `<div class="ag-stars" data-rk="${esc(key)}">${[1, 2, 3, 4, 5].map(n => `<button data-star="${n}" class="${n <= (cur || 0) ? 'on' : ''}">⭐</button>`).join('')}</div>`;

  function tgTab(t) {
    const st = t.running ? 'on' : t.error ? 'err' : '';
    let h = `<div class="ag-card"><h4><span class="ag-dot ${st}"></span> Cổng Telegram <span class="r">${t.running ? 'đang chờ tin nhắn' + (t.bot ? ` · @${esc(t.bot.username)}` : '') : t.on ? 'chưa chạy' : 'đang tắt'}</span></h4>`;
    if (t.error) h += `<div class="help" style="color:var(--bad)">${esc(t.error)}</div>`;
    if (!t.hasToken) h += `<ol class="ag-steps"><li>Mở Telegram, nhắn <b>@BotFather</b> → <code>/newbot</code> → đặt tên.</li><li>Dán <b>token</b> BotFather trả về vào ô dưới.</li><li>Bấm <b>Lấy mã ghép nối</b> và gửi mã cho bot của bạn.</li></ol>`;
    h += `<span class="lbl">Token bot ${t.hasToken ? '(đã lưu — dán token mới để thay)' : ''}</span><input id="ag-token" type="password" placeholder="123456789:AA…" autocomplete="off">
      <div class="acts" style="margin-top:6px"><button class="primary" data-ag="save"><i class="ti ti-plug-connected"></i> ${t.hasToken ? 'Lưu & chạy lại' : 'Kết nối'}</button>
      ${t.hasToken ? `<button data-ag="toggle">${t.on ? '<i class="ti ti-player-pause"></i> Tắt' : '<i class="ti ti-player-play"></i> Bật'}</button>` : ''}</div></div>`;
    if (t.hasToken) {
      h += `<div class="ag-card"><h4><i class="ti ti-link"></i> Ghép nối <span class="r">${t.allowed.length} người dùng</span></h4>`;
      if (t.pair) h += `<div class="help" style="margin:0">Gửi cho bot ${t.bot ? `<b>@${esc(t.bot.username)}</b>` : ''} trong 15 phút:</div><div class="ag-code">/start ${esc(t.pair.code)}</div>`;
      h += `<div class="acts"><button data-ag="pair"><i class="ti ti-key"></i> Lấy mã ghép nối</button>${t.allowed.length && t.running ? '<button data-ag="test"><i class="ti ti-send"></i> Gửi tin thử</button>' : ''}</div>`;
      h += t.allowed.map(a => `<div class="ag-row"><div><span class="nm">${esc(a.name)}</span><small>chat ${esc(a.id)}</small></div><button class="icon" title="Bỏ ghép nối" data-unpair="${esc(a.id)}"><i class="ti ti-unlink"></i></button></div>`).join('') + '</div>';
      const prof = S.st.profiles;
      h += `<div class="ag-card"><h4><i class="ti ti-settings"></i> Cách bot làm việc</h4>
        <span class="lbl">Hồ sơ kênh cho video gửi qua bot</span><select id="ag-prof"><option value="">Mặc định</option>${prof.map(p => `<option value="${esc(p.id)}" ${t.profile === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <span class="lbl">Bản tin sáng (đề xuất + tóm tắt) lúc</span><input id="ag-digest" type="time" value="${esc(t.digest || '')}">
        <label class="ap-tog" style="display:flex;gap:8px;margin-top:8px"><input type="checkbox" id="ag-auto" ${t.autoImprove ? 'checked' : ''} style="width:auto"><span>Tự cải tiến sau mỗi 3 phản hồi<small class="muted" style="display:block;font-size:10.5px">Chỉnh hồ sơ kênh theo điểm và góp ý, báo lại qua Telegram</small></span></label>
        <div class="acts" style="margin-top:6px"><button data-ag="opts"><i class="ti ti-device-floppy"></i> Lưu</button></div>
        <div class="help">Trong Telegram: gửi video (≤ 20 MB) để tự dựng · <code>/chude</code> · <code>/trangthai</code> · <code>/dexuat</code> · <code>/caitien</code> · <code>/hoso</code> · hoặc nhắn tự nhiên. Bot chỉ chạy khi Studio đang mở, hoặc chạy riêng bằng <code>node scripts/telegram.mjs run</code>.</div></div>`;
    }
    return h;
  }
  function fbTab() {
    const st = S.st;
    let h = `<div class="ag-card"><h4><i class="ti ti-movie"></i> Video vừa xuất của dự án</h4>`;
    h += st.videos.length ? st.videos.map(v => { const r = S.rate[v.file] || {}; return `<div class="ag-row" style="grid-template-columns:minmax(0,1fr)"><div><span class="nm">${esc(v.name)}</span>${v.rated && !r.n ? '<small>đã chấm</small>' : ''}</div>
      ${stars(v.file, r.n)}${r.n ? `<div class="ag-chips" data-tk="${esc(v.file)}">${Object.entries(st.tags).map(([k, l]) => `<span data-tag="${k}" class="${r.tags?.includes(k) ? 'on' : ''}">${esc(l)}</span>`).join('')}</div>
      <textarea rows="2" data-cm="${esc(v.file)}" placeholder="Góp ý thêm (không bắt buộc)">${esc(r.comment || '')}</textarea><div class="acts"><button class="primary" data-send="${esc(v.file)}"><i class="ti ti-check"></i> Gửi phản hồi</button></div>` : ''}</div>`; }).join('')
      : '<div class="help" style="margin:0">Xuất video (nút Xuất) rồi chấm ở đây. Video gửi qua Telegram được chấm ngay trong chat.</div>';
    h += '</div>';
    const fb = st.feedback.slice(0, 15);
    h += `<div class="ag-card"><h4><i class="ti ti-message-star"></i> Phản hồi gần đây <span class="r">${st.feedback.length}</span></h4>${fb.map(e => `<div class="ag-row" style="grid-template-columns:minmax(0,1fr)"><div><span class="nm">${e.rating ? '⭐'.repeat(e.rating) : '—'} ${esc(e.video ? e.video.split(/[\\/]/).pop() : e.project ? e.project.split(/[\\/]/).pop() : '')}</span>
      <small>${esc(e.source)} · ${new Date(e.t).toLocaleString('vi-VN')}${e.qc != null ? ` · QC ${e.qc}` : ''}${e.tags.length ? ' · ' + e.tags.map(t => esc(st.tags[t] || t)).join(', ') : ''}</small>${e.comment ? `<small>“${esc(e.comment)}”</small>` : ''}</div></div>`).join('') || '<div class="help" style="margin:0">Chưa có phản hồi.</div>'}</div>`;
    return h;
  }
  function sugTab() {
    const st = S.st, imp = st.improve;
    let h = `<div class="ag-card"><h4><i class="ti ti-brain"></i> Tự cải tiến <span class="r">${imp ? 'lần cuối ' + new Date(imp.at).toLocaleString('vi-VN') : 'chưa chạy'}</span></h4>
      <div class="help" style="margin-top:0">Đọc điểm, thẻ góp ý và lỗi AI kiểm tra → chỉnh mật độ hiệu ứng, âm lượng nhạc, kiểu phụ đề, hướng dẫn cho AI dựng giúp của từng hồ sơ kênh.</div>
      <div class="acts"><button class="primary" data-ag="improve"><i class="ti ti-sparkles"></i> Tự cải tiến ngay</button></div>`;
    for (const p of st.profiles.filter(p => p.fb)) h += `<div style="margin-top:8px"><b>${esc(p.name)}</b> <span class="muted">${p.fb.n} phản hồi${p.fb.avg ? ` · TB ${p.fb.avg}★` : ''}</span><ul class="ag-notes">${(p.fb.notes || []).map(n => `<li>${esc(n)}</li>`).join('') || '<li>chưa cần chỉnh</li>'}</ul></div>`;
    if (imp?.ai?.summary) h += `<div class="help">🤖 ${esc(imp.ai.summary)}</div>`; else if (imp?.ai?.error) h += `<div class="help">AI: ${esc(imp.ai.error)}</div>`;
    h += '</div>';
    const items = st.suggestions.filter(s => s.state === 'new'), old = st.suggestions.filter(s => s.state !== 'new').slice(0, 6);
    h += `<div class="ag-card"><h4><i class="ti ti-bulb"></i> Đề xuất <span class="r">${items.length} mới</span></h4>
      <div class="acts"><button data-ag="suggest"><i class="ti ti-refresh"></i> Tìm đề xuất mới</button></div>
      ${items.map(s => `<div class="ag-sug"><b>${esc(s.title)}</b><p>${esc(s.detail || '')}</p><div class="acts">${s.action?.type && s.action.type !== 'none' ? `<button class="primary" data-act="apply" data-sid="${s.id}"><i class="ti ti-check"></i> Áp dụng</button>` : ''}<button data-act="dismiss" data-sid="${s.id}">Bỏ qua</button></div></div>`).join('')}
      ${old.map(s => `<div class="ag-sug done"><b>${esc(s.title)}</b><span class="res">${s.state === 'applied' ? '✅' : '🗑'} ${esc(s.result || '')}</span></div>`).join('')}
      ${!items.length && !old.length ? '<div class="help">Chưa có đề xuất. Bấm "Tìm đề xuất mới" — app xem phản hồi, hàng đợi, lịch đăng và lời thoại gần đây để gợi ý việc nên làm tiếp.</div>' : ''}</div>`;
    return h;
  }
  function render() {
    const el = $('#libbody'); if (!el || !active()) return;
    if (!S.st) { el.innerHTML = '<div class="loading"><i class="ti ti-loader-2 spin"></i> Đang tải…</div>'; return; }
    el.innerHTML = `<div class="ag-tabs">${[['tg', 'Telegram'], ['fb', 'Phản hồi'], ['sug', 'Cải tiến & đề xuất']].map(([k, l]) => `<button data-agtab="${k}" class="${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${S.busy ? `<div class="help"><i class="ti ti-loader-2 spin"></i> ${esc(S.busy)}</div>` : ''}${S.tab === 'tg' ? tgTab(S.st.tg) : S.tab === 'fb' ? fbTab() : sugTab()}`;
  }

  document.addEventListener('click', async e => {
    const el = $('#libbody'); if (!el || !el.contains(e.target) || !active()) return;
    const t = e.target.closest('[data-agtab],[data-ag],[data-unpair],[data-star],[data-tag],[data-send],[data-act]'); if (!t) return;
    if (t.dataset.agtab) { S.tab = t.dataset.agtab; return render(); }
    const a = t.dataset.ag, tg = S.st.tg;
    if (a === 'save') return post('/api/agent/telegram', { token: $('#ag-token').value, on: true }, 'Đang kết nối bot…');
    if (a === 'toggle') return post('/api/agent/telegram', { on: !tg.on }, tg.on ? 'Đang tắt…' : 'Đang bật…');
    if (a === 'pair') return post('/api/agent/pair', {}, 'Tạo mã…');
    if (a === 'test') { const r = await post('/api/agent/test', {}, 'Đang gửi…'); if (r.ok) Studio.toast(`Đã gửi tin thử tới ${r.sent} người`); return; }
    if (a === 'opts') return post('/api/agent/telegram', { profile: $('#ag-prof').value, digest: $('#ag-digest').value, autoImprove: $('#ag-auto').checked }, 'Đang lưu…');
    if (a === 'improve') { const r = await post('/api/agent/improve', {}, 'AI đang phân tích phản hồi (≈1 phút)…'); if (!r.error) { S.tab = 'sug'; Studio.toast('Đã tự cải tiến'); } return; }
    if (a === 'suggest') return post('/api/agent/suggest', {}, 'Đang tìm đề xuất (≈1 phút)…');
    if (t.dataset.unpair) return post('/api/agent/unpair', { id: t.dataset.unpair });
    if (t.dataset.star) { const k = t.closest('[data-rk]').dataset.rk; S.rate[k] = { ...(S.rate[k] || {}), n: +t.dataset.star }; return render(); }
    if (t.dataset.tag) { const k = t.closest('[data-tk]').dataset.tk, r = S.rate[k]; r.tags = r.tags?.includes(t.dataset.tag) ? r.tags.filter(x => x !== t.dataset.tag) : [...(r.tags || []), t.dataset.tag]; return render(); }
    if (t.dataset.send) {
      const k = t.dataset.send, r = S.rate[k], cm = el.querySelector(`[data-cm="${CSS.escape(k)}"]`)?.value || '';
      await post('/api/agent/feedback', { video: k, rating: r.n, tags: r.tags || [], comment: cm }, 'Đang lưu…');
      delete S.rate[k]; Studio.toast('Đã ghi phản hồi — lần sau Tự lái sẽ tính tới'); return;
    }
    if (t.dataset.act) { const r = await post('/api/agent/act', { id: t.dataset.sid, action: t.dataset.act }, t.dataset.act === 'apply' ? 'Đang áp dụng…' : ''); if (r.msg) Studio.toast(r.msg); }
  });
  document.addEventListener('input', e => { const k = e.target.dataset?.cm; if (k && S.rate[k]) S.rate[k].comment = e.target.value; });
  Studio.addPanel('agent', 'ti-robot-face', 'Agent', () => { render(); load(); });
})();
