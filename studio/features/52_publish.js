// Gói đăng mạng xã hội: AI viết tiêu đề/caption/hashtag cho từng nền tảng, kiểm tra thông số, ảnh bìa, mở trang đăng. KHÔNG tự đăng.
(() => {
  const { $, esc } = Studio;
  const ICON = { tiktok: 'ti-brand-tiktok', youtube: 'ti-brand-youtube', facebook: 'ti-brand-facebook', instagram: 'ti-brand-instagram', zalo: 'ti-message-circle' };
  const S = { video: null, videos: [], plats: null, check: null, data: null, tab: 'tiktok', sel: null, notes: '', busy: false, cover: null, coverT: null };
  const css = document.createElement('style');
  css.textContent = `
  #modalbox.pub-wide { width: min(820px, 94vw); }
  .pub-top { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; }
  .pub-honest { background: rgba(251,191,36,.08); border: 1px solid rgba(251,191,36,.3); color: #F5D58A; border-radius: 8px; padding: 8px 10px; font-size: 11.5px; line-height: 1.5; margin: 10px 0; }
  .pub-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line2); margin: 12px 0 0; flex-wrap: wrap; }
  .pub-tabs button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--tx2); padding: 8px 10px; }
  .pub-tabs button.on { color: var(--tx); border-bottom-color: var(--acc); }
  .pub-tabs button input { margin: 0 2px 0 0; }
  .pub-body { display: grid; grid-template-columns: minmax(0, 1fr) 210px; gap: 14px; padding-top: 10px; }
  .pub-f { margin-bottom: 8px; } .pub-f .h { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--tx3); margin-bottom: 4px; } .pub-f .h .grow { flex: 1; }
  .pub-f .h button { padding: 2px 8px; font-size: 10.5px; } .pub-f textarea { width: 100%; min-height: 80px; } .pub-f input { width: 100%; }
  .pub-f .cnt { font-size: 10px; color: var(--tx3); } .pub-f .cnt.over { color: var(--bad); }
  .pub-chk { font-size: 11px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; } .pub-chk div { display: flex; gap: 6px; align-items: flex-start; line-height: 1.35; }
  .pub-chk .ok { color: var(--ok); } .pub-chk .warn { color: var(--warn); } .pub-chk .bad { color: var(--bad); }
  .pub-side img { width: 100%; max-height: 220px; object-fit: contain; background: #000; border-radius: 8px; border: 1px solid var(--line2); margin-top: 6px; }
  .pub-side .acts { padding-top: 6px; } .pub-side .acts button { width: 100%; justify-content: center; }
  .pub-empty { padding: 26px 10px; text-align: center; color: var(--tx3); }`;
  document.head.appendChild(css);
  const box = () => $('#modalbox');
  const copy = async (txt, what) => { try { await navigator.clipboard.writeText(txt); } catch { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); } Studio.toast('Đã chép ' + what); };
  const LIM = { tiktok: 4000, youtube: 5000, facebook: 2200, instagram: 2200, zalo: 2000 };

  async function open(video) {
    const [plats, videos, data] = await Promise.all([Studio.api('/api/publish/platforms'), Studio.api('/api/publish/videos'), Studio.api('/api/publish/data')]);
    S.plats = plats; S.videos = Array.isArray(videos) ? videos : []; S.data = data;
    S.sel = S.sel || Object.fromEntries(Object.keys(plats).map(k => [k, true]));
    S.video = video || (data?.video && S.videos.some(v => v.path === data.video) ? data.video : S.videos[0]?.path) || null;
    if (S.coverT == null) S.coverT = data?.platforms?.tiktok?.thumb_time ?? +(Studio.T || 1).toFixed(1);
    render(); box().classList.add('pub-wide');
    if (S.video) check();
  }
  async function check() { S.check = await Studio.api('/api/publish/check?video=' + encodeURIComponent(S.video)); render(); }
  async function gen() {
    if (!S.video) return Studio.toast('Xuất video trước (nút Xuất)');
    const r = await Studio.api('/api/publish/gen', { video: S.video, platforms: Object.keys(S.sel).filter(k => S.sel[k]), notes: S.notes });
    if (r.error) return Studio.toast(r.error);
    S.busy = 'AI đang viết nội dung…'; render();
    const t = setInterval(async () => {
      const j = await Studio.api('/api/job'); if (!j || j.kind !== 'publish') return;
      if (j.state === 'running') { S.busy = j.step; const el = $('#pub-busy'); if (el) el.textContent = j.step; return; }
      clearInterval(t); S.busy = false;
      if (j.state === 'error') Studio.toast('Lỗi: ' + j.step);
      else { S.data = await Studio.api('/api/publish/data'); const tt = S.data?.platforms?.[S.tab]?.thumb_time; if (tt != null) S.coverT = tt; Studio.toast('Đã viết xong · lưu ở publish/<nền tảng>.txt'); }
      if ($('.pub')) render();
    }, 1200);
  }
  function field(k, label, val, { area, max, copyAs } = {}) {
    const n = [...(val || '')].length;
    return `<div class="pub-f"><div class="h">${label}${max ? `<span class="cnt ${n > max ? 'over' : ''}">${n}/${max}</span>` : ''}<span class="grow"></span><button data-pcopy="${k}" data-pwhat="${esc(copyAs || label.toLowerCase())}"><i class="ti ti-copy"></i> Chép</button></div>
      ${area ? `<textarea data-pf="${k}" rows="${area}">${esc(val || '')}</textarea>` : `<input data-pf="${k}" value="${esc(val || '')}">`}</div>`;
  }
  function render() {
    const P = S.plats || {}, d = S.data?.platforms?.[S.tab], chk = S.check?.checks?.[S.tab] || [];
    Studio.modal(`<div class="pub"><h3><i class="ti ti-send"></i> Đăng mạng xã hội</h3>
      <div class="pub-top"><div><label class="lbl" style="margin-top:0">Video đã xuất</label><select id="pub-vid">${S.videos.length ? S.videos.map(v => `<option ${v.path === S.video ? 'selected' : ''}>${esc(v.path)}</option>`).join('') : '<option value="">— chưa có video, bấm Xuất trước —</option>'}</select></div>
        <button class="primary" id="pub-gen" ${S.busy || !S.video ? 'disabled' : ''}>${S.busy ? '<i class="ti ti-loader-2 spin"></i> Đang viết…' : `<i class="ti ti-sparkles"></i> ${S.data ? 'Viết lại' : 'Viết nội dung'} bằng AI`}</button></div>
      <label class="lbl">Ghi chú cho AI (tuỳ chọn)</label><input id="pub-notes" placeholder="VD: nhấn mạnh ưu đãi tháng này, giọng vui vẻ, kêu gọi inbox" value="${esc(S.notes)}">
      <div class="pub-honest"><i class="ti ti-info-circle"></i> Studio <b>không tự đăng</b> lên TikTok/Facebook/Instagram/Zalo — việc đó cần ứng dụng OAuth được từng nền tảng duyệt. Bấm <b>Chép</b> từng phần, <b>Mở trang đăng</b> rồi kéo file MP4 vào, hoặc <b>Lên lịch</b> để Studio nhắc đúng giờ (YouTube: tự tải lên nếu đã <b>Kết nối YouTube</b> ở mục Lịch đăng). Thông số kiểm tra là tham khảo (nền tảng đổi thường xuyên).</div>
      ${S.busy ? `<div class="muted" id="pub-busy"><i class="ti ti-loader-2 spin"></i> ${esc(S.busy)}</div><div class="bar"><i style="width:45%"></i></div>` : ''}
      <div class="pub-tabs">${Object.entries(P).map(([k, p]) => `<button data-ptab="${k}" class="${k === S.tab ? 'on' : ''}"><input type="checkbox" data-psel="${k}" ${S.sel[k] ? 'checked' : ''} title="Viết cho nền tảng này"><i class="ti ${ICON[k]}"></i> ${esc(p.name)}</button>`).join('')}</div>
      <div class="pub-body"><div>
        ${d ? `${S.tab === 'youtube' ? field('title', 'Tiêu đề', d.title, { max: 100 }) : ''}
          ${field('caption', S.tab === 'youtube' ? 'Mô tả' : 'Caption', d.caption, { area: 5, max: LIM[S.tab] })}
          ${field('hashtags', 'Hashtag', (d.hashtags || []).join(' '), { copyAs: 'hashtag' })}
          ${field('first_comment', 'Bình luận đầu tiên (ghim)', d.first_comment, { area: 2, copyAs: 'bình luận' })}
          <div class="acts" style="padding-top:2px"><button id="pub-all"><i class="ti ti-clipboard-text"></i> Chép tất cả (caption + hashtag)</button><button id="pub-save"><i class="ti ti-device-floppy"></i> Lưu chỉnh sửa</button></div>
          <div class="help">Lưu tại <code>publish/${S.tab}.txt</code> trong thư mục dự án.</div>`
        : `<div class="pub-empty"><i class="ti ti-sparkles" style="font-size:26px"></i><br>${S.video ? 'Bấm <b>Viết nội dung bằng AI</b>: Claude đọc lời thoại và viết tiêu đề, caption, hashtag, bình luận đầu và gợi ý ảnh bìa cho từng nền tảng.' : 'Chưa có video đã xuất trong <code>out/</code>.'}</div>`}
      </div><div class="pub-side">
        <div class="lbl" style="margin-top:0">Kiểm tra cho ${esc(P[S.tab]?.name || '')}</div>
        <div class="pub-chk">${chk.length ? chk.map(c => `<div class="${c.level}"><i class="ti ${c.level === 'ok' ? 'ti-circle-check' : c.level === 'warn' ? 'ti-alert-triangle' : 'ti-circle-x'}"></i><span>${esc(c.msg)}</span></div>`).join('') : '<span class="muted">—</span>'}</div>
        <div class="lbl">Ảnh bìa${d?.thumb_text ? ` · chữ gợi ý: “${esc(d.thumb_text)}”` : ''}</div>
        <div style="display:flex;gap:6px"><input id="pub-ct" type="number" step="0.1" min="0" value="${esc(S.coverT)}" style="width:80px" title="Giây"><button id="pub-cover" style="flex:1;justify-content:center"><i class="ti ti-photo"></i> Xuất ảnh bìa</button></div>
        ${d?.thumb_time != null ? `<div class="help">AI gợi ý khung ${d.thumb_time}s</div>` : ''}
        ${S.cover ? `<img src="${esc(S.cover.url)}"><div class="acts"><button data-preveal="${esc(S.cover.out)}"><i class="ti ti-folder"></i> Hiện ảnh bìa</button></div>` : ''}
        <div class="acts"><button class="primary" id="pub-open"><i class="ti ti-external-link"></i> Mở trang đăng ${esc(P[S.tab]?.name || '')}</button>
          ${window.openScheduleFor ? `<button id="pub-sched" ${S.video ? '' : 'disabled'} title="Lên lịch đăng (dùng caption AI ở trên)"><i class="ti ti-calendar-plus"></i> Lên lịch ${esc(P[S.tab]?.name || '')}…</button>` : ''}
          <button id="pub-reveal" ${S.video ? '' : 'disabled'}><i class="ti ti-folder"></i> Hiện MP4 trong Finder</button></div>
        <div class="help">${esc(P[S.tab]?.note || '')}</div>
      </div></div>
      <div class="actions"><button onclick="closeModal()">Đóng</button></div></div>`);
    box().classList.add('pub-wide');
    bind();
  }
  function collect() { const o = {}; document.querySelectorAll('.pub [data-pf]').forEach(i => (o[i.dataset.pf] = i.value)); if (o.hashtags != null) o.hashtags = o.hashtags.split(/\s+/).filter(Boolean); return o; }
  function bind() {
    $('#pub-vid').onchange = e => { S.video = e.target.value; check(); };
    $('#pub-notes').oninput = e => (S.notes = e.target.value);
    $('#pub-gen').onclick = gen;
    document.querySelectorAll('.pub [data-ptab]').forEach(b => (b.onclick = e => { if (e.target.matches('input')) return; if (S.data?.platforms?.[S.tab]) Object.assign(S.data.platforms[S.tab], collect()); S.tab = b.dataset.ptab; render(); }));
    document.querySelectorAll('.pub [data-psel]').forEach(c => (c.onchange = () => (S.sel[c.dataset.psel] = c.checked)));
    document.querySelectorAll('.pub [data-pcopy]').forEach(b => (b.onclick = () => copy(document.querySelector(`.pub [data-pf="${b.dataset.pcopy}"]`).value, b.dataset.pwhat)));
    if ($('#pub-all')) $('#pub-all').onclick = () => { const o = collect(); copy([o.title, o.caption, '', (o.hashtags || []).join(' ')].filter(x => x != null).join('\n').trim(), 'caption + hashtag'); };
    if ($('#pub-save')) $('#pub-save').onclick = async () => { const r = await Studio.api('/api/publish/save', { platform: S.tab, data: collect() }); if (r.error) return Studio.toast(r.error); Object.assign(S.data.platforms[S.tab], collect()); Studio.toast('Đã lưu ' + r.file); };
    $('#pub-ct').onchange = e => (S.coverT = +e.target.value);
    $('#pub-cover').onclick = async () => {
      $('#pub-cover').innerHTML = '<i class="ti ti-loader-2 spin"></i> Đang render…';
      const r = await Studio.api('/api/publish/cover', { t: S.coverT });
      if (r.error) { Studio.toast(r.error); render(); return; }
      S.cover = r; render();
    };
    document.querySelectorAll('.pub [data-preveal]').forEach(b => (b.onclick = () => Studio.api('/api/reveal', { path: b.dataset.preveal })));
    $('#pub-open').onclick = async () => { const r = await Studio.api('/api/publish/open', { platform: S.tab }); Studio.toast(r.error || 'Đã mở ' + r.url + ' trong trình duyệt'); };
    $('#pub-reveal').onclick = () => Studio.api('/api/reveal', { path: S.video });
    // 18_schedule.js: schedule this video for the current tab (other platforms selectable) with the AI captions above
    if ($('#pub-sched')) $('#pub-sched').onclick = () => { if (S.data?.platforms?.[S.tab]) Object.assign(S.data.platforms[S.tab], collect()); window.openScheduleFor({ platform: S.tab, video: S.video, all: S.data?.platforms || {}, thumb: S.cover?.out }); };
  }
  // Wide box only for this dialog; add a "Đăng" button to the export-finished dialog.
  new MutationObserver(() => {
    const b = box(); if (!b) return;
    if (!b.querySelector('.pub')) b.classList.remove('pub-wide');
    const h = b.querySelector('h3'), acts = b.querySelector('.actions');
    if (h && /Xuất xong/.test(h.textContent) && acts && !acts.querySelector('.pub-go')) {
      const out = b.querySelector('.path')?.textContent?.trim();
      const btn = document.createElement('button'); btn.className = 'pub-go'; btn.innerHTML = '<i class="ti ti-send"></i> Đăng mạng xã hội…';
      btn.onclick = () => open(out); acts.prepend(btn);
    }
  }).observe(document.getElementById('modalbox'), { childList: true, subtree: true });
  Studio.onReady(() => Studio.addTopButton('<button class="ghost" id="pub-btn" title="Gói đăng mạng xã hội: caption, hashtag, ảnh bìa"><i class="ti ti-send"></i> Đăng</button>', () => open()));
  window.openPublish = open;
})();
