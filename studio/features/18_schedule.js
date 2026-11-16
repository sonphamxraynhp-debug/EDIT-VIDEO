// Lịch đăng: lịch tuần kéo-thả, danh sách, xếp lịch tự động vào khung giờ, kết nối YouTube (OAuth của chính bạn) để tự tải lên.
// Nền tảng khác: đến giờ Studio thông báo + mở trang đăng + chép caption (tự đăng TikTok/Facebook/Instagram cần app được duyệt).
(() => {
  const { $, esc } = Studio;
  const TZ = 'Asia/Ho_Chi_Minh';
  const ICON = { youtube: 'ti-brand-youtube', tiktok: 'ti-brand-tiktok', facebook: 'ti-brand-facebook', instagram: 'ti-brand-instagram', zalo: 'ti-message-circle' };
  const COL = { youtube: '#E5484D', tiktok: '#2DD4BF', facebook: '#4C7DFF', instagram: '#D9468F', zalo: '#3B9EFF' };
  const ST = { planned: ['Đã lên lịch', 'ti-clock'], uploading: ['Đang tải lên', 'ti-loader-2 spin'], done: ['Đã đăng', 'ti-circle-check'], reminded: ['Đã nhắc', 'ti-bell-ringing'], error: ['Lỗi', 'ti-alert-triangle'] };
  const S = { v: null, videos: null, week: null, back: null, showOld: false, timer: null };
  const css = document.createElement('style');
  css.textContent = `
  #modalbox.sc-wide { width: min(1080px, 96vw); }
  #modalbox.sc-mid { width: min(640px, 94vw); }
  .sc-card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r); padding: 10px; margin: 8px 0; }
  .sc-yt { display: flex; gap: 8px; align-items: center; } .sc-yt .ti-brand-youtube { color: #E5484D; font-size: 22px; }
  .sc-yt b { display: block; font-size: 12.5px; } .sc-yt small { color: var(--tx3); font-size: 10.5px; display: block; }
  .sc-q { height: 5px; background: var(--bg4); border-radius: 5px; overflow: hidden; margin: 8px 0 3px; } .sc-q i { display: block; height: 100%; background: linear-gradient(90deg, var(--ok), var(--warn)); }
  .sc-acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; } .sc-acts button { padding: 5px 9px; font-size: 11.5px; }
  .sc-day { font-size: 10.5px; font-weight: 700; color: var(--tx2); text-transform: uppercase; letter-spacing: .04em; margin: 12px 0 4px; display: flex; gap: 6px; }
  .sc-day.today { color: var(--acc); }
  .sc-it { display: grid; grid-template-columns: 42px 30px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg2); margin: 4px 0; cursor: pointer; }
  .sc-it:hover { border-color: var(--line3); }
  .sc-it .tm { font: 600 12px ui-monospace, Menlo, monospace; color: var(--tx); }
  .sc-it .pf { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: #fff; }
  .sc-it .nm { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .sc-it .sub { font-size: 10.5px; color: var(--tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sc-st { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--bg4); color: var(--tx2); white-space: nowrap; }
  .sc-st.done { background: rgba(52,211,153,.14); color: var(--ok); } .sc-st.error { background: rgba(248,113,113,.14); color: var(--bad); }
  .sc-st.reminded { background: rgba(251,191,36,.12); color: var(--warn); } .sc-st.uploading { background: var(--acc-soft); color: #CFC8FF; }
  .sc-err { color: var(--bad); }
  .sc-note { background: rgba(251,191,36,.08); border: 1px solid rgba(251,191,36,.3); color: #F5D58A; border-radius: 8px; padding: 8px 10px; font-size: 11.5px; line-height: 1.5; margin: 8px 0; }
  .sc-note.info { background: var(--acc-soft); border-color: var(--acc-line); color: #D9D3FF; }
  .sc-form label { display: block; font-size: 10.5px; color: var(--tx3); margin: 8px 0 3px; } .sc-form input, .sc-form select, .sc-form textarea { width: 100%; }
  .sc-form input[type=date], .sc-form input[type=time] { background: var(--bg1); border: 1px solid var(--line2); border-radius: var(--rs); padding: 6px 8px; color: var(--tx); color-scheme: dark; outline: none; }
  .sc-form label.sc-v { display: grid; margin: 0; font-size: inherit; color: inherit; } .sc-form .sc-v input { width: auto; }
  .sc-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px; } .sc-g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 8px; }
  .sc-plats { display: flex; gap: 6px; flex-wrap: wrap; } .sc-plats label { display: inline-flex !important; gap: 4px; align-items: center; border: 1px solid var(--line2); border-radius: 999px; padding: 4px 10px; margin: 0 !important; cursor: pointer; color: var(--tx2) !important; font-size: 11.5px !important; }
  .sc-plats label:has(input:checked) { border-color: var(--acc-line); background: var(--acc-soft); color: var(--tx) !important; } .sc-plats input { width: auto !important; margin: 0; }
  /* week view */
  .sc-wk-h { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; } .sc-wk-h b { font-size: 13px; }
  .sc-wk { display: grid; grid-template-columns: 44px repeat(7, minmax(0, 1fr)); border: 1px solid var(--line2); border-radius: 10px; overflow: hidden; background: var(--bg1); }
  .sc-wk .dh { padding: 6px 4px; text-align: center; font-size: 11px; color: var(--tx2); border-bottom: 1px solid var(--line2); border-left: 1px solid var(--line); background: var(--bg2); }
  .sc-wk .dh.today { color: var(--acc); font-weight: 700; } .sc-wk .dh b { display: block; font-size: 15px; color: var(--tx); } .sc-wk .dh.today b { color: var(--acc); }
  .sc-wk .hours { position: relative; } .sc-wk .hours div { position: absolute; right: 6px; font-size: 10px; color: var(--tx3); transform: translateY(-6px); }
  .sc-col { position: relative; border-left: 1px solid var(--line); cursor: copy; }
  .sc-col.past { background: repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,.015) 6px 12px); }
  .sc-col .hl { position: absolute; left: 0; right: 0; border-top: 1px solid var(--line); pointer-events: none; }
  .sc-col .slot { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--acc-line); pointer-events: none; }
  .sc-col .slot span { position: absolute; right: 3px; top: -1px; font-size: 9px; color: var(--acc); opacity: .7; }
  .sc-col .nowl { position: absolute; left: 0; right: 0; border-top: 2px solid var(--bad); pointer-events: none; z-index: 2; }
  .sc-col.over { background: var(--acc-soft); }
  .sc-ev { position: absolute; left: 3px; right: 3px; border-radius: 6px; padding: 3px 5px; font-size: 10.5px; line-height: 1.25; color: #fff; overflow: hidden; cursor: grab; z-index: 1; box-shadow: 0 2px 8px rgba(0,0,0,.35); border-left: 3px solid rgba(255,255,255,.5); }
  .sc-ev .t { font-weight: 700; display: flex; gap: 3px; align-items: center; } .sc-ev .t .ti { font-size: 12px; }
  .sc-ev .n { opacity: .9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sc-ev.done, .sc-ev.reminded { opacity: .55; } .sc-ev.error { outline: 2px solid var(--bad); }
  .sc-wk-body { max-height: 62vh; overflow-y: auto; }
  .sc-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 10.5px; color: var(--tx3); margin-top: 8px; } .sc-legend i.d { width: 9px; height: 9px; border-radius: 3px; display: inline-block; margin-right: 3px; }
  /* auto */
  .sc-vl { max-height: 300px; overflow-y: auto; border: 1px solid var(--line2); border-radius: 8px; }
  .sc-v { display: grid; grid-template-columns: 22px 44px minmax(0, 1fr); gap: 8px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--line); cursor: pointer; } .sc-v:last-child { border-bottom: 0; }
  .sc-v img { width: 44px; height: 44px; object-fit: cover; border-radius: 6px; background: #000; } .sc-v .nm { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .sc-v small { color: var(--tx3); font-size: 10.5px; }
  .sc-steps { margin: 0; padding-left: 20px; line-height: 1.6; font-size: 12px; } .sc-steps li { margin: 5px 0; } .sc-steps code { font-size: 11px; background: var(--bg0); padding: 1px 5px; border-radius: 4px; }
  .sc-steps a { color: #B9AEFF; }`;
  document.head.appendChild(css);

  // ---- time helpers (always Vietnam time) ----
  const parts = d => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(d)).map(x => [x.type, x.value]));
  const vnDate = d => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
  const vnTime = d => { const p = parts(d); return `${p.hour}:${p.minute}`; };
  const vnMin = d => { const p = parts(d); return +p.hour * 60 + +p.minute; };
  const fromVN = (date, time) => `${date}T${time}:00+07:00`;
  const addDays = (date, n) => vnDate(Date.parse(`${date}T12:00:00+07:00`) + n * 864e5);
  const WD = { Mon: 'T2', Tue: 'T3', Wed: 'T4', Thu: 'T5', Fri: 'T6', Sat: 'T7', Sun: 'CN' };
  const dayLabel = date => { const p = parts(`${date}T12:00:00+07:00`); return `${WD[p.weekday]} ${p.day}/${p.month}`; };
  const NOW = () => S.v?.now || new Date().toISOString();
  const box = () => $('#modalbox');
  const wide = cls => { box().classList.remove('sc-wide', 'sc-mid'); if (cls) box().classList.add(cls); };
  const active = () => document.querySelector('#rail .on')?.dataset.p === 'schedule';
  const copy = async t => { try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); } };

  async function load() { const r = await Studio.api('/api/schedule'); if (!r.error) S.v = r; if (active()) render(); poll(); return S.v; }
  function poll() {
    clearTimeout(S.timer);
    const busy = S.v?.run?.busy || S.v?.youtube?.pending || S.v?.items?.some(x => x.state === 'uploading');
    if (active() || $('.sc-wkv') || busy) S.timer = setTimeout(load, busy ? 2000 : 15000);
  }
  // next free posting slot for a platform (client-side, same rule as publish.mjs autoSchedule)
  function nextSlot(plats) {
    const v = S.v, taken = new Set(v.items.filter(x => x.state !== 'error').map(x => x.platform + '|' + Date.parse(x.when)));
    const min = Date.parse(NOW()) + 10 * 60e3, d0 = vnDate(NOW());
    for (let d = 0; d < 60; d++) for (const s of v.settings.slots) { const t = Date.parse(fromVN(addDays(d0, d), s)); if (t >= min && plats.every(p => !taken.has(p + '|' + t))) return new Date(t).toISOString(); }
    return new Date(min).toISOString();
  }

  // ---------- panel ----------
  function ytCard() {
    const y = S.v.youtube, q = y.quota, pct = Math.min(100, Math.round(q.used / q.daily * 100));
    if (!y.connected) return `<div class="sc-card"><div class="sc-yt"><i class="ti ti-brand-youtube"></i><div><b>Chưa kết nối YouTube</b><small>${y.hasClient ? 'Đã có OAuth client · bấm Kết nối' : 'Mục YouTube sẽ chỉ được nhắc đăng tay'}</small></div></div>
      ${y.authError ? `<div class="help sc-err">${esc(y.authError)}</div>` : ''}
      <div class="sc-acts"><button class="primary" id="sc-ytc"><i class="ti ti-plug-connected"></i> Kết nối YouTube</button></div></div>`;
    return `<div class="sc-card"><div class="sc-yt"><i class="ti ti-brand-youtube"></i><div style="min-width:0;flex:1"><b>${esc(y.channel?.title || 'Đã kết nối')}</b><small>Tự tải lên + hẹn giờ công khai</small></div><span class="sc-st done">đã kết nối</span></div>
      <div class="sc-q" title="Quota YouTube Data API hôm nay"><i style="width:${pct}%"></i></div>
      <small class="muted">Quota hôm nay: ~${q.used.toLocaleString('vi-VN')}/${q.daily.toLocaleString('vi-VN')} đơn vị · mỗi video ${q.upload.toLocaleString('vi-VN')} → còn ~${q.uploadsLeft} video</small>
      <div class="sc-acts"><button id="sc-ytk"><i class="ti ti-refresh"></i> Kiểm tra</button><button id="sc-ytg"><i class="ti ti-help"></i> Hướng dẫn</button><span class="grow"></span><button class="danger" id="sc-ytd"><i class="ti ti-plug-x"></i> Ngắt</button></div></div>`;
  }
  function itemRow(it) {
    const [stl, sti] = ST[it.state] || ['?', 'ti-help'];
    return `<div class="sc-it" data-scid="${esc(it.id)}" title="${esc(it.error || '')}"><span class="tm">${vnTime(it.when)}</span><span class="pf" style="background:${COL[it.platform]}"><i class="ti ${ICON[it.platform]}"></i></span>
      <div style="min-width:0"><div class="nm">${esc(it.title || it.caption || it.name)}</div><div class="sub ${it.error ? 'sc-err' : ''}">${esc(it.error || it.name + (it.exists ? '' : ' · (mất file!)'))}</div></div>
      <span class="sc-st ${it.state}"><i class="ti ${sti}" style="font-size:11px"></i> ${stl}</span></div>`;
  }
  function render() {
    const B = $('#libbody'); if (!B) return;
    if (!S.v) { B.innerHTML = '<div class="help"><i class="ti ti-loader-2 spin"></i> Đang tải lịch…</div>'; return; }
    const v = S.v, today = vnDate(NOW()), weekAgo = Date.parse(NOW()) - 7 * 864e5;
    const up = v.items.filter(x => ['planned', 'uploading', 'error'].includes(x.state));
    const old = v.items.filter(x => ['done', 'reminded'].includes(x.state) && Date.parse(x.when) > weekAgo).reverse();
    const byDay = {}; for (const it of up) (byDay[vnDate(it.when)] ||= []).push(it);
    const run = v.run;
    B.innerHTML = `${ytCard()}
      <div class="sc-acts" style="margin-top:4px"><button class="primary" id="sc-week"><i class="ti ti-calendar-week"></i> Lịch tuần</button><button id="sc-auto"><i class="ti ti-wand"></i> Xếp lịch tự động</button><button id="sc-add" title="Thêm một mục"><i class="ti ti-plus"></i></button></div>
      ${run.busy ? `<div class="help"><i class="ti ti-loader-2 spin"></i> ${esc(run.step || 'Đang chạy lịch…')}</div>` : ''}
      <div class="sect"><i class="ti ti-calendar-event"></i> Sắp đăng <span class="muted">${up.length}</span></div>
      ${up.length ? Object.entries(byDay).map(([d, list]) => `<div class="sc-day ${d === today ? 'today' : ''}">${d === today ? 'Hôm nay · ' : d === addDays(today, 1) ? 'Ngày mai · ' : ''}${dayLabel(d)}${d < today ? ' · quá hạn' : ''}</div>${list.map(itemRow).join('')}`).join('')
        : '<div class="help">Chưa có lịch. Bấm <b>Xếp lịch tự động</b> để rải các video đã xuất vào khung giờ đăng, hoặc <b>Lên lịch</b> trong hộp thoại <b>Đăng</b>.</div>'}
      ${old.length ? `<div class="sect" style="cursor:pointer" id="sc-oldt"><i class="ti ti-chevron-${S.showOld ? 'down' : 'right'}"></i> Đã xong 7 ngày qua <span class="muted">${old.length}</span></div>${S.showOld ? old.map((it, i) => `${i && vnDate(old[i - 1].when) === vnDate(it.when) ? '' : `<div class="sc-day">${dayLabel(vnDate(it.when))}</div>`}${itemRow(it)}`).join('') : ''}` : ''}
      <div class="sect"><i class="ti ti-settings"></i> Cài đặt lịch</div>
      <div class="sc-form"><label>Khung giờ đăng mặc định (giờ VN, cách nhau dấu phẩy)</label><input id="sc-slots" value="${esc(v.settings.slots.join(', '))}">
        <div class="sc-g2"><div><label>Nhắc trước (phút)</label><input id="sc-rem" type="number" min="0" value="${v.settings.remindMin}"></div><div><label>YouTube tải trước (phút)</label><input id="sc-lead" type="number" min="0" value="${v.settings.ytLeadMin}"></div></div>
        <div class="sc-g2"><div><label>YouTube mặc định</label><select id="sc-priv">${[['public', 'Công khai'], ['unlisted', 'Không công khai'], ['private', 'Riêng tư']].map(([k, l]) => `<option value="${k}" ${v.settings.privacy === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div><label>Video cho trẻ em</label><select id="sc-kids"><option value="0" ${v.settings.madeForKids ? '' : 'selected'}>Không (mặc định)</option><option value="1" ${v.settings.madeForKids ? 'selected' : ''}>Có</option></select></div></div>
        <div class="sc-acts"><button id="sc-sset"><i class="ti ti-device-floppy"></i> Lưu cài đặt</button><button id="sc-run" ${run.busy ? 'disabled' : ''} title="Bình thường Studio tự chạy mỗi phút"><i class="ti ti-player-play"></i> Chạy mục đến hạn</button></div>
        <div class="help">Studio kiểm tra lịch mỗi phút khi đang mở (và hàng đợi Tự lái nếu có). YouTube: tải lên trước giờ đăng, YouTube tự công khai đúng giờ. Nền tảng khác: 10 phút trước có thông báo; đến giờ Studio mở trang đăng, hiện file và <b>chép sẵn caption</b> — bạn chỉ cần kéo file vào và dán.</div>
        ${run.last?.at ? `<div class="help">Lần chạy gần nhất ${vnTime(run.last.at)}: ${run.last.error ? `<span class="sc-err">${esc(run.last.error)}</span>` : run.last.skipped ? 'bỏ qua (tiến trình khác đang chạy)' : `nhắc ${run.last.reminded?.length || 0}, tải YouTube ${run.last.uploaded?.length || 0}, lỗi ${run.last.errors?.length || 0}`}</div>` : ''}</div>`;
    bindPanel();
  }
  function bindPanel() {
    const B = $('#libbody'), on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
    on('sc-ytc', () => ytWizard()); on('sc-ytg', () => ytWizard());
    on('sc-ytk', async () => { const r = await Studio.api('/api/youtube/check', {}); Studio.toast(r.error || `Kết nối tốt · kênh ${r.channel?.title || '?'}`); load(); });
    on('sc-ytd', async () => { if (!confirm('Ngắt kết nối YouTube? Token sẽ bị thu hồi và xoá khỏi máy. Các mục YouTube sẽ chuyển sang nhắc đăng tay.')) return; await Studio.api('/api/youtube/disconnect', {}); Studio.toast('Đã ngắt kết nối YouTube'); load(); });
    on('sc-week', () => week()); on('sc-auto', () => auto()); on('sc-add', () => edit(null, { back: null }));
    on('sc-oldt', () => { S.showOld = !S.showOld; render(); });
    on('sc-sset', async () => {
      const r = await Studio.api('/api/schedule/settings', { slots: $('#sc-slots').value, remindMin: +$('#sc-rem').value, ytLeadMin: +$('#sc-lead').value, privacy: $('#sc-priv').value, madeForKids: $('#sc-kids').value === '1' });
      Studio.toast(r.error || 'Đã lưu cài đặt lịch'); load();
    });
    on('sc-run', async () => { const r = await Studio.api('/api/schedule/run', {}); Studio.toast(r.error || 'Đang chạy các mục đến hạn…'); setTimeout(load, 600); });
    B.querySelectorAll('[data-scid]').forEach(el => (el.onclick = () => edit(el.dataset.scid, { back: null })));
  }

  // ---------- week view (drag & drop) ----------
  const H0 = 6, H1 = 24, PX = 34; // 06:00–24:00, px per hour
  function week(start) {
    if (start) S.week = start;
    if (!S.week) { const t = vnDate(NOW()), wd = parts(`${t}T12:00:00+07:00`).weekday; S.week = addDays(t, -['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd)); }
    const v = S.v, days = [...Array(7)].map((_, i) => addDays(S.week, i)), today = vnDate(NOW()), nowM = vnMin(NOW());
    const y = m => ((Math.max(H0 * 60, Math.min(H1 * 60 - 20, m)) - H0 * 60) / 60) * PX;
    const ev = days.map(d => v.items.filter(x => vnDate(x.when) === d).sort((a, b) => Date.parse(a.when) - Date.parse(b.when)));
    const H = (H1 - H0) * PX;
    Studio.modal(`<div class="sc-wkv"><div class="sc-wk-h"><h3 style="margin:0"><i class="ti ti-calendar-week"></i> Lịch đăng</h3><span class="grow"></span>
        <button class="icon" id="sc-wp" title="Tuần trước"><i class="ti ti-chevron-left"></i></button><b>${dayLabel(days[0])} – ${dayLabel(days[6])}</b><button class="icon" id="sc-wn" title="Tuần sau"><i class="ti ti-chevron-right"></i></button>
        <button id="sc-wt">Tuần này</button><button id="sc-wa"><i class="ti ti-wand"></i> Xếp tự động</button></div>
      <div class="sc-wk"><div></div>${days.map(d => `<div class="dh ${d === today ? 'today' : ''}">${dayLabel(d).split(' ')[0]}<b>${d.slice(8)}</b></div>`).join('')}</div>
      <div class="sc-wk-body"><div class="sc-wk" style="border-top:0;border-radius:0 0 10px 10px">
        <div class="hours" style="height:${H}px">${[...Array(H1 - H0)].map((_, i) => `<div style="top:${i * PX}px">${String(H0 + i).padStart(2, '0')}:00</div>`).join('')}</div>
        ${days.map((d, i) => `<div class="sc-col ${d < today ? 'past' : ''}" data-day="${d}" style="height:${H}px">
          ${[...Array(H1 - H0)].map((_, h) => `<div class="hl" style="top:${h * PX}px"></div>`).join('')}
          ${v.settings.slots.map(s => { const m = +s.slice(0, 2) * 60 + +s.slice(3); return m >= H0 * 60 ? `<div class="slot" style="top:${y(m)}px"><span>${s}</span></div>` : ''; }).join('')}
          ${d === today ? `<div class="nowl" style="top:${y(nowM)}px"></div>` : ''}
          ${ev[i].map((it, k) => { const near = ev[i].filter(o => Math.abs(Date.parse(o.when) - Date.parse(it.when)) < 50 * 60e3), n = near.length, j = near.indexOf(it); // overlapping → side by side
            return `<div class="sc-ev ${it.state}" draggable="${it.state === 'planned' || it.state === 'error'}" data-scid="${esc(it.id)}" title="${esc((it.title || it.name) + ' · ' + ST[it.state][0] + (it.error ? ' · ' + it.error : ''))}"
              style="top:${y(vnMin(it.when))}px;left:calc(3px + (100% - 6px) * ${j / n});width:calc((100% - 6px) / ${n} - 2px);right:auto;background:${COL[it.platform]};min-height:30px"><div class="t"><i class="ti ${ICON[it.platform]}"></i>${vnTime(it.when)}${it.state !== 'planned' ? ` <i class="ti ${ST[it.state][1]}"></i>` : ''}</div><div class="n">${esc(it.title || it.name)}</div></div>`; }).join('')}
        </div>`).join('')}</div></div>
      <div class="sc-legend">${Object.entries(v.platforms).map(([k, n]) => `<span><i class="d" style="background:${COL[k]}"></i>${esc(n)}</span>`).join('')}<span>· Kéo thả để đổi ngày/giờ (bước 15 phút) · bấm vào ô trống để thêm · vạch tím = khung giờ đăng</span></div>
      <div class="actions"><button onclick="closeModal()">Đóng</button></div></div>`);
    wide('sc-wide');
    const body = $('.sc-wk-body'); if (body && !S.scrolled) { body.scrollTop = Math.max(0, y(Math.min(...v.settings.slots.map(s => +s.slice(0, 2) * 60)) - 90)); }
    $('#sc-wp').onclick = () => week(addDays(S.week, -7)); $('#sc-wn').onclick = () => week(addDays(S.week, 7));
    $('#sc-wt').onclick = () => { S.week = null; week(); }; $('#sc-wa').onclick = () => auto('week');
    let drag = null;
    document.querySelectorAll('.sc-ev').forEach(el => {
      el.ondragstart = e => { drag = el.dataset.scid; e.dataTransfer.setData('text/plain', drag); e.dataTransfer.effectAllowed = 'move'; };
      el.onclick = e => { e.stopPropagation(); edit(el.dataset.scid, { back: 'week' }); };
    });
    const minAt = (col, e) => { const r = col.getBoundingClientRect(); return Math.round((H0 * 60 + (e.clientY - r.top) / PX * 60) / 15) * 15; };
    document.querySelectorAll('.sc-col').forEach(col => {
      col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
      col.ondragleave = () => col.classList.remove('over');
      col.ondrop = async e => {
        e.preventDefault(); col.classList.remove('over'); const id = drag || e.dataTransfer.getData('text/plain'); if (!id) return;
        const m = Math.max(0, Math.min(23 * 60 + 45, minAt(col, e))), when = fromVN(col.dataset.day, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
        if (Date.parse(when) < Date.parse(NOW()) && !confirm('Thời điểm này đã qua — mục sẽ chạy ngay ở lượt kiểm tra kế tiếp. Tiếp tục?')) return;
        const r = await Studio.api('/api/schedule/update', { id, when, state: 'planned' });
        if (r.error) return Studio.toast(r.error);
        Studio.toast(`Đã dời sang ${dayLabel(col.dataset.day)} ${vnTime(when)}`); await load(); S.scrolled = true; const st = $('.sc-wk-body')?.scrollTop; week(); if (st != null) $('.sc-wk-body').scrollTop = st; S.scrolled = false;
      };
      col.onclick = e => { if (e.target.closest('.sc-ev')) return; const m = Math.max(0, minAt(col, e)); edit(null, { back: 'week', when: fromVN(col.dataset.day, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`) }); };
    });
  }

  // ---------- edit / add one item ----------
  async function edit(id, { back, when, file, platforms, per } = {}) {
    if (!S.videos) S.videos = await Studio.api('/api/schedule/videos');
    const it = id ? S.v.items.find(x => x.id === id) : null;
    if (id && !it) return Studio.toast('Mục này không còn');
    const v = S.v, isNew = !it, f = it?.file || file || S.videos?.[0]?.file || '';
    const plats = it ? [it.platform] : platforms || ['youtube'];
    const w = it?.when || when || nextSlot(plats);
    const vids = [...(S.videos || [])]; if (f && !vids.some(x => x.file === f)) vids.unshift({ file: f, name: f.split(/[\\/]/).pop(), src: '' });
    const P = it || per || {};
    Studio.modal(`<div class="sc-ed sc-form"><h3><i class="ti ${isNew ? 'ti-calendar-plus' : ICON[it.platform]}"></i> ${isNew ? 'Thêm lịch đăng' : 'Sửa lịch đăng'}${it ? ` <span class="sc-st ${it.state}">${ST[it.state][0]}</span>` : ''}</h3>
      ${it?.error ? `<div class="sc-note">${esc(it.error)}</div>` : ''}
      ${it?.url && it.state === 'done' ? `<div class="sc-note info"><i class="ti ti-brand-youtube"></i> <a href="${esc(it.url)}" target="_blank" style="color:inherit">${esc(it.url)}</a>${it.publishAt ? ` · YouTube công khai lúc ${esc(vnTime(it.publishAt))} ${esc(dayLabel(vnDate(it.publishAt)))}` : ''}${(it.warnings || []).map(w => '<br>⚠ ' + esc(w)).join('')}</div>` : ''}
      <label>Video</label><select id="sc-f">${vids.map(x => `<option value="${esc(x.file)}" ${x.file === f ? 'selected' : ''}>${esc(x.name)}${x.src ? ' · ' + esc(x.src) : ''}${x.info ? ` · ${x.info.dur}s ${x.info.w}×${x.info.h}` : ''}</option>`).join('') || '<option value="">— chưa có video đã xuất —</option>'}</select>
      <label>Nền tảng</label>${isNew ? `<div class="sc-plats">${Object.entries(v.platforms).map(([k, n]) => `<label><input type="checkbox" data-scp="${k}" ${plats.includes(k) ? 'checked' : ''}><i class="ti ${ICON[k]}"></i>${esc(n)}</label>`).join('')}</div>`
        : `<select id="sc-pl">${Object.entries(v.platforms).map(([k, n]) => `<option value="${k}" ${k === it.platform ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`}
      <div class="sc-g3"><div><label>Ngày (giờ Việt Nam)</label><input type="date" id="sc-d" value="${vnDate(w)}"></div><div><label>Giờ</label><input type="time" id="sc-t" value="${vnTime(w)}" step="300"></div>
        <div><label>Khung giờ nhanh</label><select id="sc-qs"><option value="">—</option>${v.settings.slots.map(s => `<option>${s}</option>`).join('')}</select></div></div>
      <label>Tiêu đề <span class="muted">(YouTube ≤ 100 ký tự; #Shorts tự thêm cho video dọc ngắn)</span></label><input id="sc-ti" value="${esc(P.title || '')}" maxlength="100">
      <label>Caption / mô tả</label><textarea id="sc-ca" rows="4">${esc(P.caption || '')}</textarea>
      <label>Hashtag</label><input id="sc-ha" value="${esc((P.hashtags || []).join(' '))}" placeholder="#edit #ai">
      <div class="sc-g2"><div><label>Quyền riêng tư YouTube</label><select id="sc-pr">${[['public', 'Công khai đúng giờ'], ['unlisted', 'Không công khai'], ['private', 'Riêng tư']].map(([k, l]) => `<option value="${k}" ${(P.privacy || v.settings.privacy) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div style="display:flex;align-items:flex-end"><button id="sc-cap" style="width:100%;justify-content:center" title="Lấy tiêu đề/caption/hashtag do AI viết trong hộp thoại Đăng"><i class="ti ti-sparkles"></i> Lấy caption AI</button></div></div>
      <div class="help">${!v.youtube.connected ? '<b>YouTube chưa kết nối</b> → mục YouTube cũng chỉ được nhắc đăng tay. ' : ''}Nền tảng khác: đến giờ Studio thông báo, mở trang đăng, hiện file và chép caption vào clipboard.</div>
      <div class="actions">${it ? `<button class="danger" id="sc-del"><i class="ti ti-trash"></i> Xoá</button><button id="sc-rv"><i class="ti ti-folder"></i></button><button id="sc-cp" title="Chép caption + hashtag"><i class="ti ti-copy"></i></button>` : ''}<span class="grow"></span>
        ${it && it.state !== 'planned' && it.state !== 'uploading' ? `<button id="sc-re"><i class="ti ti-rotate"></i> ${it.state === 'error' ? 'Thử lại' : 'Lên lịch lại'}</button>` : ''}
        <button id="sc-x">${back === 'publish' ? 'Quay lại' : 'Huỷ'}</button><button class="primary" id="sc-ok"><i class="ti ti-check"></i> ${isNew ? 'Lên lịch' : 'Lưu'}</button></div></div>`);
    wide('sc-mid');
    const goBack = async () => { if (back === 'week') { await load(); week(); } else if (back === 'publish' && window.openPublish) window.openPublish(); else { Studio.closeModal(); load(); } };
    const data = () => ({ file: $('#sc-f').value, when: fromVN($('#sc-d').value, $('#sc-t').value), title: $('#sc-ti').value, caption: $('#sc-ca').value, hashtags: $('#sc-ha').value, privacy: $('#sc-pr').value });
    $('#sc-qs').onchange = e => e.target.value && ($('#sc-t').value = e.target.value);
    $('#sc-x').onclick = goBack;
    $('#sc-cap').onclick = async () => {
      const pl = it ? $('#sc-pl').value : (document.querySelector('[data-scp]:checked')?.dataset.scp || 'tiktok');
      const r = await Studio.api(`/api/schedule/captions?file=${encodeURIComponent($('#sc-f').value)}&platform=${pl}`);
      if (!r.caption && !r.title) return Studio.toast('Video này chưa có caption AI — mở hộp thoại Đăng → Viết nội dung bằng AI');
      $('#sc-ti').value = r.title || ''; $('#sc-ca').value = r.caption || ''; $('#sc-ha').value = (r.hashtags || []).join(' '); Studio.toast('Đã lấy caption AI (' + pl + ')');
    };
    $('#sc-ok').onclick = async () => {
      const d = data(); if (!d.file) return Studio.toast('Chọn video');
      let r;
      if (it) r = await Studio.api('/api/schedule/update', { id: it.id, ...d, platform: $('#sc-pl').value, ...(it.state !== 'planned' && Date.parse(d.when) !== Date.parse(it.when) ? { state: 'planned' } : {}) });
      else {
        const ps = [...document.querySelectorAll('[data-scp]:checked')].map(x => x.dataset.scp); if (!ps.length) return Studio.toast('Chọn ít nhất 1 nền tảng');
        // edited fields apply to all chosen platforms unless the user kept per-platform AI captions from the Đăng dialog
        const perPlatform = per?.all ? Object.fromEntries(ps.map(k => [k, per.all[k] ? { title: per.all[k].title, caption: per.all[k].caption, hashtags: per.all[k].hashtags } : {}])) : null;
        r = await Studio.api('/api/schedule/add', { ...d, platforms: ps, ...(per?.thumb ? { thumb: per.thumb } : {}), ...(perPlatform && !S.dirtyEdit ? { perPlatform, title: undefined, caption: undefined, hashtags: undefined } : {}) });
      }
      if (r.error) return Studio.toast(r.error);
      Studio.toast(it ? 'Đã lưu' : `Đã lên lịch ${r.items.length} mục · ${dayLabel(vnDate(d.when))} ${vnTime(d.when)}`); S.dirtyEdit = false;
      await load(); goBack();
    };
    S.dirtyEdit = false; ['#sc-ti', '#sc-ca', '#sc-ha'].forEach(s => ($(s).oninput = () => (S.dirtyEdit = true)));
    if (it) {
      $('#sc-del').onclick = async () => { if (!confirm('Xoá mục lịch này?')) return; const r = await Studio.api('/api/schedule/remove', { id: it.id }); if (r.error) return Studio.toast(r.error); Studio.toast('Đã xoá'); await load(); goBack(); };
      $('#sc-rv').onclick = () => Studio.api('/api/schedule/reveal', { id: it.id });
      $('#sc-cp').onclick = async () => { const r = await Studio.api('/api/schedule/copy', { id: it.id }); await copy(r.text || ''); Studio.toast('Đã chép caption + hashtag'); };
      if ($('#sc-re')) $('#sc-re').onclick = async () => {
        let w2 = data().when; if (Date.parse(w2) < Date.parse(NOW()) && it.state !== 'error') w2 = nextSlot([it.platform]);
        const r = await Studio.api('/api/schedule/update', { id: it.id, ...data(), when: w2, state: 'planned' }); if (r.error) return Studio.toast(r.error);
        Studio.toast(it.state === 'error' ? 'Sẽ thử lại ở lượt kiểm tra kế tiếp' : 'Đã lên lịch lại ' + vnTime(w2)); await load(); goBack();
      };
    }
  }

  // ---------- auto schedule ----------
  async function auto(back) {
    S.videos = await Studio.api('/api/schedule/videos');
    const v = S.v, vids = Array.isArray(S.videos) ? S.videos : [];
    Studio.modal(`<div class="sc-form"><h3><i class="ti ti-wand"></i> Xếp lịch tự động</h3>
      <div class="help" style="margin-top:0">Chọn các video đã xong và nền tảng — Studio rải mỗi video vào khung giờ trống kế tiếp (${esc(v.settings.slots.join(', '))} mỗi ngày), dùng caption AI của từng dự án nếu đã viết trong hộp thoại <b>Đăng</b>.</div>
      <label>Video (${vids.length})</label>
      <div class="sc-vl">${vids.map((x, i) => `<label class="sc-v"><input type="checkbox" data-scv="${i}" ${!x.scheduled.length && i < 6 ? 'checked' : ''}><img loading="lazy" src="/api/schedule/poster?file=${encodeURIComponent(x.file)}">
        <div style="min-width:0"><div class="nm">${esc(x.name)}</div><small>${esc(x.src || '')}${x.info ? ` · ${x.info.dur}s · ${x.info.w}×${x.info.h}` : ''}${x.hasCaptions ? ' · <i class="ti ti-sparkles"></i> có caption AI' : ' · chưa có caption AI'}${x.scheduled.length ? ' · đã lên lịch: ' + esc(x.scheduled.join(', ')) : ''}</small></div></label>`).join('') || '<div class="help" style="padding:10px">Chưa có video nào trong <code>out/</code>. Xuất video trước.</div>'}</div>
      <label>Nền tảng</label><div class="sc-plats">${Object.entries(v.platforms).map(([k, n]) => `<label><input type="checkbox" data-scp="${k}" ${k === 'youtube' || k === 'tiktok' ? 'checked' : ''}><i class="ti ${ICON[k]}"></i>${esc(n)}</label>`).join('')}</div>
      <div class="sc-g2"><div><label>Bắt đầu từ ngày</label><input type="date" id="sc-from" value="${vnDate(NOW())}"></div><div><label>Khung giờ (sửa trong Cài đặt lịch)</label><input disabled value="${esc(v.settings.slots.join(', '))}"></div></div>
      ${!v.youtube.connected ? '<div class="sc-note">YouTube chưa kết nối — mục YouTube sẽ chỉ được nhắc đăng tay cho tới khi bạn <b>Kết nối YouTube</b>.</div>' : ''}
      <div class="actions"><button id="sc-x">Huỷ</button><button class="primary" id="sc-go"><i class="ti ti-calendar-plus"></i> Xếp lịch</button></div></div>`);
    wide('sc-mid');
    $('#sc-x').onclick = () => (back === 'week' ? week() : Studio.closeModal());
    $('#sc-go').onclick = async () => {
      const files = [...document.querySelectorAll('[data-scv]:checked')].map(x => vids[+x.dataset.scv].file), plats = [...document.querySelectorAll('[data-scp]:checked')].map(x => x.dataset.scp);
      if (!files.length) return Studio.toast('Chọn ít nhất 1 video'); if (!plats.length) return Studio.toast('Chọn ít nhất 1 nền tảng');
      const from = $('#sc-from').value, fromIso = from === vnDate(NOW()) ? undefined : fromVN(from, '00:00');
      const r = await Studio.api('/api/schedule/auto', { files, platforms: plats, from: fromIso });
      if (r.error) return Studio.toast(r.error);
      const first = r.items[0]; Studio.toast(`Đã xếp ${r.items.length} mục (${files.length} video) · bắt đầu ${dayLabel(vnDate(first.when))} ${vnTime(first.when)}`);
      await load(); S.week = null; week(); const t = vnDate(first.when); if (t > addDays(S.week, 6)) week(addDays(S.week, Math.floor((Date.parse(t + 'T12:00:00+07:00') - Date.parse(S.week + 'T12:00:00+07:00')) / 864e5 / 7) * 7));
    };
  }

  // ---------- YouTube connect wizard ----------
  function ytWizard() {
    const y = S.v.youtube;
    Studio.modal(`<div class="sc-form"><h3><i class="ti ti-brand-youtube" style="color:#E5484D"></i> Kết nối YouTube (tự tải video lên kênh của bạn)</h3>
      <div class="sc-note info">Dùng <b>OAuth client của chính bạn</b> — miễn phí, không chia sẻ mật khẩu. Token chỉ lưu trên máy này (<code>~/.ai-video-studio/youtube_token.json</code>, quyền 600). Làm 1 lần, mất ~10 phút.</div>
      <ol class="sc-steps">
        <li>Mở <a href="https://console.cloud.google.com/projectcreate" target="_blank">Google Cloud Console → Tạo dự án</a> (tên tuỳ ý, VD “AI Video Studio”).</li>
        <li>Vào <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank">YouTube Data API v3</a> → bấm <b>Enable (Bật)</b>.</li>
        <li>Vào <a href="https://console.cloud.google.com/auth/overview" target="_blank">Google Auth Platform (OAuth consent screen)</a> → <b>Get started</b>: đặt tên app, email hỗ trợ, Audience = <b>External</b>, email liên hệ → Create.
          Sau đó vào <b>Audience</b> → <b>Test users</b> → <b>Add users</b> → thêm Gmail sở hữu kênh YouTube.</li>
        <li>Để kết nối không hết hạn sau 7 ngày: ở <b>Audience</b> bấm <b>Publish app</b> (chuyển sang <i>In production</i>). App chưa xác minh vẫn dùng được cho chính bạn — khi đăng nhập Google sẽ cảnh báo “Google chưa xác minh ứng dụng này” → bấm <b>Nâng cao → Đi tới … (không an toàn)</b>.</li>
        <li>Vào <a href="https://console.cloud.google.com/auth/clients" target="_blank">Clients</a> → <b>Create client</b> → Application type: <b>Desktop app</b> → Create → <b>Download JSON</b>.</li>
        <li>Dán nội dung file JSON vào ô dưới (hoặc chọn file) → <b>Lưu client</b> → <b>Kết nối</b>: trình duyệt mở trang Google, chọn tài khoản có kênh, tick đủ quyền, bấm <b>Cho phép</b>.</li>
      </ol>
      <label>OAuth client (JSON loại Desktop app) ${y.hasClient ? `<span class="sc-st done">đã lưu: ${esc(y.client_id)}</span>` : ''}</label>
      <textarea id="sc-cj" rows="3" placeholder='{"installed":{"client_id":"….apps.googleusercontent.com","client_secret":"…", …}}' style="font:11px ui-monospace,Menlo,monospace"></textarea>
      <div class="sc-acts"><button id="sc-cf"><i class="ti ti-file-upload"></i> Chọn file JSON…</button><input type="file" id="sc-cfi" accept=".json,application/json" hidden><button id="sc-cs"><i class="ti ti-device-floppy"></i> Lưu client</button>
        <span class="grow"></span><button class="primary" id="sc-cn" ${y.hasClient ? '' : 'disabled'}><i class="ti ti-plug-connected"></i> ${y.connected ? 'Kết nối lại' : 'Kết nối'}</button></div>
      <div id="sc-cst" class="help">${y.connected ? `Đang kết nối với kênh <b>${esc(y.channel?.title || '?')}</b>.` : y.authError ? `<span class="sc-err">${esc(y.authError)}</span>` : ''}</div>
      <div class="sc-note"><b>Lưu ý quan trọng:</b> YouTube khoá ở chế độ <b>Riêng tư</b> mọi video tải lên qua API từ dự án Google Cloud <b>chưa được kiểm duyệt</b> (tạo sau 28/07/2020) — kể cả video hẹn giờ công khai.
        Muốn video tự công khai, gửi đơn kiểm duyệt miễn phí: <a href="https://support.google.com/youtube/contact/yt_api_form" target="_blank" style="color:inherit">YouTube API Services – Audit and Quota Extension Form</a>. Trong lúc chờ, hãy thử với 1 video ở chế độ Riêng tư.<br>
        Quota mặc định 10 000 đơn vị/ngày, mỗi video ~1 600 → khoảng 6 video/ngày. Ảnh bìa tuỳ chỉnh cần kênh đã <a href="https://www.youtube.com/verify" target="_blank" style="color:inherit">xác minh số điện thoại</a>.</div>
      <div class="actions">${y.connected || y.hasClient ? '<button class="danger" id="sc-forget">Xoá client + token</button><span class="grow"></span>' : ''}<button onclick="closeModal()">Đóng</button></div></div>`);
    wide('sc-mid');
    $('#sc-cf').onclick = () => $('#sc-cfi').click();
    $('#sc-cfi').onchange = async e => { const f = e.target.files[0]; if (f) { $('#sc-cj').value = await f.text(); $('#sc-cs').click(); } };
    $('#sc-cs').onclick = async () => {
      const r = await Studio.api('/api/youtube/client', { json: $('#sc-cj').value });
      if (r.error) { $('#sc-cst').innerHTML = `<span class="sc-err">${esc(r.error)}</span>`; return; }
      Studio.toast('Đã lưu OAuth client ' + r.client_id); await load(); ytWizard();
    };
    $('#sc-cn').onclick = async () => {
      const r = await Studio.api('/api/youtube/connect', {});
      if (r.error) { $('#sc-cst').innerHTML = `<span class="sc-err">${esc(r.error)}</span>`; return; }
      $('#sc-cst').innerHTML = `<i class="ti ti-loader-2 spin"></i> Đã mở trang đăng nhập Google trong trình duyệt — chọn tài khoản và bấm Cho phép. Không thấy tab? <a href="${esc(r.url)}" target="_blank" style="color:#B9AEFF">Mở lại link</a> (chờ tối đa 5 phút).`;
      const t0 = Date.now(), iv = setInterval(async () => {
        const s = await Studio.api('/api/youtube/status');
        if (s.connected && !s.pending) { clearInterval(iv); Studio.toast('Đã kết nối YouTube · ' + (s.channel?.title || '')); await load(); if ($('#sc-cst')) ytWizard(); }
        else if (s.authError || Date.now() - t0 > 320e3) { clearInterval(iv); if ($('#sc-cst')) $('#sc-cst').innerHTML = `<span class="sc-err">${esc(s.authError || 'Hết thời gian chờ')}</span>`; }
      }, 2000);
    };
    if ($('#sc-forget')) $('#sc-forget').onclick = async () => { if (!confirm('Xoá OAuth client và token YouTube khỏi máy?')) return; await Studio.api('/api/youtube/disconnect', { forgetClient: true }); await load(); ytWizard(); };
  }

  // ---------- hook for the "Đăng" dialog (52_publish.js) ----------
  // openScheduleFor({ platform, video: 'out/x.mp4', all: {tiktok: {title, caption, hashtags}, …} })
  window.openScheduleFor = async ({ platform, video, all, thumb }) => {
    await load();
    const isAbs = r => /^([a-zA-Z]:[\\/]|[\\/])/.test(r); // POSIX or Windows absolute path
    const meta = Studio.META, file = video && !isAbs(video) && meta?.dir ? meta.dir + '/' + video : video;
    const plats = [platform].filter(Boolean);
    S.videos = await Studio.api('/api/schedule/videos');
    const abs = r => (r && !isAbs(r) && meta?.dir ? meta.dir + '/' + r : r);
    edit(null, { back: 'publish', file, platforms: plats, per: { ...(all?.[platform] || {}), all, thumb: abs(thumb) } });
  };
  Studio.addPanel('schedule', 'ti-calendar', 'Lịch đăng', () => { render(); load(); });
  Studio.onReady(() => load());
})();
