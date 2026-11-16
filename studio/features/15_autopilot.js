// Tự lái: thả video → video hoàn chỉnh. Hàng đợi nền, thư mục tự động, hồ sơ kênh + "Học từ chỉnh sửa".
// Server: studio/routes/15_autopilot.mjs · scripts/autopilot.mjs, queue.mjs, profile.mjs (references/autopilot.md).
(() => {
  const { $, esc } = Studio;
  const S = { st: null, profile: '', path: '', uploading: null, open: {}, sig: '' };
  const css = document.createElement('style');
  css.textContent = `
  .ap-card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r); padding: 10px; margin: 8px 0; }
  .ap-card h4 { margin: 0 0 8px; font-size: 12px; display: flex; align-items: center; gap: 6px; color: var(--tx); }
  .ap-card h4 .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ap-card h4 .r { flex: none; margin-left: auto; font-weight: 500; color: var(--tx3); font-size: 11px; }
  .ap-drop { border: 1.5px dashed var(--line3); border-radius: 10px; padding: 22px 12px; text-align: center; color: var(--tx2); cursor: pointer; transition: .15s; }
  .ap-drop i.big { font-size: 34px; color: var(--acc); display: block; margin-bottom: 6px; }
  .ap-drop b { display: block; font-size: 13.5px; color: var(--tx); margin-bottom: 3px; }
  .ap-drop small { font-size: 11px; color: var(--tx3); }
  .ap-drop.over, .ap-drop:hover { border-color: var(--acc); background: var(--acc-soft); }
  .ap-row2 { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 6px; align-items: center; margin-top: 8px; }
  .ap-lbl { font-size: 10.5px; color: var(--tx3); display: block; margin: 8px 0 3px; }
  .ap-steps { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
  .ap-step { display: grid; grid-template-columns: 16px minmax(0,1fr) auto; gap: 6px; align-items: start; font-size: 11.5px; color: var(--tx2); }
  .ap-step small { display: block; color: var(--tx3); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ap-step .s { color: var(--tx3); font-size: 10.5px; font-variant-numeric: tabular-nums; }
  .ap-step.done i { color: var(--ok); } .ap-step.warn i { color: var(--warn); } .ap-step.error i { color: var(--bad); } .ap-step.running { color: var(--tx); } .ap-step.running i { color: var(--acc); }
  .ap-step.skipped { opacity: .55; }
  .ap-bar { height: 4px; background: var(--bg4); border-radius: 3px; overflow: hidden; margin-top: 6px; } .ap-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--acc2), var(--wave)); transition: width .4s; }
  .ap-it { display: grid; grid-template-columns: 18px minmax(0,1fr) auto; gap: 6px; align-items: center; padding: 7px 0; border-top: 1px solid var(--line); font-size: 11.5px; }
  .ap-it .nm { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .ap-it .st { color: var(--tx3); font-size: 10.5px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ap-it .st.err { color: var(--bad); }
  .ap-it .b { display: flex; gap: 1px; } .ap-it .b button { width: 24px; height: 24px; padding: 0; justify-content: center; }
  .ap-ok { color: var(--ok); } .ap-bad { color: var(--bad); } .ap-run { color: var(--acc); } .ap-warn { color: var(--warn); }
  .ap-tog { display: flex; align-items: center; gap: 8px; font-size: 12px; margin: 6px 0; cursor: pointer; } .ap-tog input { width: auto; margin: 0; }
  .ap-tog small { display: block; color: var(--tx3); font-size: 10.5px; }
  .ap-fold { display: grid; grid-template-columns: minmax(0,1fr) 28px; gap: 4px; align-items: center; margin-bottom: 4px; } .ap-fold input { font-size: 11px; height: 28px; }
  .ap-fold button { width: 28px; height: 28px; padding: 0; justify-content: center; }
  .ap-prof { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 6px; align-items: center; padding: 6px 0; border-top: 1px solid var(--line); font-size: 12px; }
  .ap-prof .nm { font-weight: 600; } .ap-prof small { display: block; color: var(--tx3); font-size: 10.5px; }
  .ap-prof .b { display: flex; gap: 1px; } .ap-prof .b button { width: 24px; height: 24px; padding: 0; justify-content: center; }
  .ap-learn { font-size: 11px; color: var(--tx2); margin: 4px 0 0 0; padding-left: 16px; } .ap-learn li { margin: 2px 0; }
  .ap-form { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; } .ap-form label { font-size: 10.5px; color: var(--tx3); display: block; margin-bottom: 2px; }
  .ap-form .full { grid-column: 1 / 3; } .ap-form .chk { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11.5px; } .ap-form .chk label { display: flex; gap: 4px; align-items: center; color: var(--tx2); font-size: 11.5px; margin: 0; }
  .ap-form .chk input { width: auto; margin: 0; } .ap-form input[type=time] { color-scheme: dark; }
  #ap-topbtn .pct { font-size: 10.5px; color: var(--acc); margin-left: 4px; font-variant-numeric: tabular-nums; }`;
  document.head.appendChild(css);
  const active = () => document.querySelector('#rail .on')?.dataset.p === 'autopilot';
  const api = (u, b) => Studio.api(u, b);
  const ICON = { done: 'ti-circle-check ap-ok', error: 'ti-alert-triangle ap-bad', running: 'ti-loader-2 spin ap-run', cancelled: 'ti-player-stop muted', queued: 'ti-clock muted', warn: 'ti-alert-circle ap-warn', skipped: 'ti-minus muted' };
  const KNAME = { autopilot: 'Tự lái', highlights: 'Video dài → shorts', topic: 'Chủ đề → video', variants: 'Biến thể', publish: 'Đăng' };
  const SRC = { watch: 'thư mục tự động', upload: 'kéo thả', ui: 'Studio', cli: 'dòng lệnh', app: 'thả vào app' };
  const profiles = () => S.st?.profiles?.list || [];
  const defProfile = () => S.st?.profiles?.default;

  async function refresh(force) {
    const st = await api('/api/autopilot/state').catch(() => null);
    if (!st || st.error) return;
    const sig = JSON.stringify([st.items, st.runner, st.learn]);
    const first = !S.st; S.st = st;
    if (!S.profile) S.profile = st.settings.profile || defProfile();
    topBadge();
    if (!active()) return;
    if (first || force) return render();
    if (sig !== S.sig) { S.sig = sig; renderLive(); }
  }
  function topBadge() {
    const b = $('#ap-topbtn'); if (!b) return;
    const run = S.st?.items.find(i => i.state === 'running'), wait = S.st?.items.filter(i => i.state === 'queued').length || 0;
    b.querySelector('.pct').textContent = run ? `${Math.round((run.progress || 0) * 100)}%${wait ? ` +${wait}` : ''}` : wait ? `${wait} chờ` : '';
  }

  // ---------- render ----------
  function render() {
    $('#libact').innerHTML = `<button class="icon" id="ap-refresh" title="Tải lại"><i class="ti ti-refresh"></i></button>`;
    $('#ap-refresh').onclick = () => refresh(true);
    if (!S.st) { $('#libbody').innerHTML = '<div class="help">Đang tải…</div>'; return; }
    const st = S.st;
    $('#libbody').innerHTML = `
    <div class="help" style="margin-top:4px">Thả video thô → Studio tự làm hết: phụ đề, cắt lỗi nói, AI dựng, b-roll, SFX + nhạc, xuất MP4, ảnh bìa, nội dung đăng. Chạy nền, bạn vẫn sửa video khác được.</div>
    <div class="ap-drop" id="ap-drop"><i class="ti ti-rocket big"></i><b>Thả video vào đây để tự dựng</b><small>mp4 · mov · m4v · mkv — có thể thả nhiều file</small>
      <input type="file" id="ap-file" accept="video/*,.mov,.mkv,.m4v" multiple hidden></div>
    <div id="ap-upl"></div>
    <div class="ap-row2"><select id="ap-prof">${profiles().map(p => `<option value="${esc(p.id)}" ${p.id === S.profile ? 'selected' : ''}>${esc(p.name)}${p.id === defProfile() ? ' (mặc định)' : ''}</option>`).join('')}</select>
      <button id="ap-pick"><i class="ti ti-file-upload"></i> Chọn file</button></div>
    <label class="ap-lbl">Hoặc đường dẫn video / thư mục dự án trên máy</label>
    <div class="ap-row2"><input id="ap-path" placeholder="/Users/ban/Movies/clip.mov" value="${esc(S.path)}"><button id="ap-add" title="Thêm vào hàng đợi"><i class="ti ti-plus"></i> Thêm</button></div>
    <div id="ap-live"></div>
    <div id="ap-watch"></div>
    <div id="ap-profiles"></div>`;
    bindTop(); renderLive(); renderWatch(); renderProfiles();
  }
  function stepList(it) {
    const steps = S.st.steps, ss = it.steps || {};
    return `<div class="ap-steps">${steps.map(s => {
      const x = ss[s.id] || {}, state = x.state || 'queued';
      return `<div class="ap-step ${state}"><i class="ti ${ICON[state] || ICON.queued}"></i><div style="min-width:0">${esc(s.label)}${x.msg || x.detail ? `<small title="${esc(x.msg || x.detail)}">${esc(x.msg || x.detail)}</small>` : ''}</div><span class="s">${x.sec != null ? (x.sec < 10 ? x.sec.toFixed(1) : Math.round(x.sec)) + 's' : ''}</span></div>`;
    }).join('')}</div>`;
  }
  function renderLive() {
    const box = $('#ap-live'); if (!box) return;
    const st = S.st, items = st.items, run = items.find(i => i.state === 'running');
    const r = st.runner;
    const runnerNote = r.disabled ? 'Studio không chạy hàng đợi (AVS_NO_QUEUE) — dùng lệnh node scripts/queue.mjs run'
      : r.active ? '' : r.lock ? `Hàng đợi đang do tiến trình khác chạy (${r.lock.role === 'agent' ? 'chạy nền khi tắt app' : r.lock.role}, pid ${r.lock.pid})` : 'Đang khởi động hàng đợi…';
    box.innerHTML = `
    ${run ? `<div class="ap-card"><h4><i class="ti ti-loader-2 spin ap-run"></i><span class="t" title="${esc(run.input)}">Đang làm: ${esc(run.title)}</span><span class="r">${Math.round((run.progress || 0) * 100)}%</span></h4>
      <div class="help" style="margin:0" title="${esc(run.step)}">${esc((run.step || '').slice(0, 120))}</div><div class="ap-bar"><i style="width:${Math.round((run.progress || 0) * 100)}%"></i></div>
      ${run.kind === 'autopilot' ? stepList(run) : ''}
      ${run.learnedApplied?.length ? `<div class="help" style="margin:6px 0 0"><i class="ti ti-school"></i> Đã áp điều học được: ${esc(run.learnedApplied.length)} điều chỉnh</div>` : ''}
      <div class="acts"><button class="danger" data-act="cancel" data-id="${run.id}"><i class="ti ti-player-stop"></i> Huỷ</button></div></div>` : ''}
    <div class="ap-card"><h4><i class="ti ti-list-details"></i>Hàng đợi<span class="r">${items.filter(i => i.state === 'queued').length} chờ · ${items.filter(i => i.state === 'done').length} xong</span></h4>
      ${runnerNote ? `<div class="help" style="margin:0 0 4px">${esc(runnerNote)}</div>` : ''}
      ${!items.length ? '<div class="help" style="margin:0">Chưa có việc nào. Thả video ở trên hoặc vào thư mục tự động.</div>' : items.map((it, k) => `<div class="ap-it"><i class="ti ${ICON[it.state] || ''}"></i>
        <div style="min-width:0"><span class="nm" title="${esc(it.input)}">${esc(it.title)}</span>
          <span class="st ${it.state === 'error' ? 'err' : ''}" title="${esc(it.error || it.step || '')}">${esc(KNAME[it.kind] || it.kind)} · ${esc(SRC[it.source] || '')}${it.state === 'error' ? ' — ' + esc(it.error || '') : it.state === 'running' ? ` · ${Math.round((it.progress || 0) * 100)}%` : it.state === 'done' && it.result?.seconds ? ` · xong trong ${it.result.seconds}s` : it.state === 'queued' && it.attempt ? ' · ' + esc(it.step) : ''}</span></div>
        <div class="b">
          ${it.state === 'queued' ? `<button class="icon" title="Lên" data-act="up" data-id="${it.id}" ${k === 0 ? 'disabled' : ''}><i class="ti ti-arrow-up"></i></button><button class="icon" title="Xuống" data-act="down" data-id="${it.id}"><i class="ti ti-arrow-down"></i></button>` : ''}
          ${it.state === 'done' && it.project ? `<button class="icon" title="Mở dự án trong Studio để chỉnh" data-act="open" data-id="${it.id}"><i class="ti ti-edit"></i></button>` : ''}
          ${it.state === 'done' && it.outputs?.length ? `<button class="icon" title="Mở video" data-play="${esc(it.outputs.find(o => /\.mp4$/i.test(o)) || '')}"><i class="ti ti-player-play"></i></button>` : ''}
          ${['done', 'error'].includes(it.state) ? `<button class="icon" title="Hiện trong Finder" data-act="reveal" data-id="${it.id}"><i class="ti ti-folder"></i></button>` : ''}
          ${['error', 'cancelled'].includes(it.state) ? `<button class="icon" title="Thử lại (chạy tiếp từ bước dừng)" data-act="retry" data-id="${it.id}"><i class="ti ti-reload"></i></button>` : ''}
          ${['queued', 'running'].includes(it.state) ? `<button class="icon" title="Huỷ" data-act="cancel" data-id="${it.id}"><i class="ti ti-x"></i></button>` : `<button class="icon" title="Xoá khỏi danh sách" data-act="remove" data-id="${it.id}"><i class="ti ti-trash"></i></button>`}
        </div></div>`).join('')}
      ${items.some(i => ['done', 'cancelled'].includes(i.state)) ? `<div class="acts"><button id="ap-clear"><i class="ti ti-clear-all"></i> Xoá việc đã xong</button></div>` : ''}</div>`;
    box.querySelectorAll('[data-act]').forEach(b => (b.onclick = () => itemAct(b.dataset.id, b.dataset.act)));
    box.querySelectorAll('[data-play]').forEach(b => (b.onclick = () => b.dataset.play && api('/api/autopilot/reveal', { path: b.dataset.play })));
    if ($('#ap-clear')) $('#ap-clear').onclick = async () => { await api('/api/autopilot/clear', {}); refresh(true); };
  }
  function renderWatch() {
    const st = S.st, w = st.settings.watch, ag = st.runner.agent || {};
    $('#ap-watch').innerHTML = `<div class="ap-card"><h4><i class="ti ti-folder-bolt"></i>Thư mục tự động</h4>
      <label class="ap-tog"><input type="checkbox" id="ap-won" ${w.on ? 'checked' : ''}><span>Tự dựng mọi video thả vào thư mục<small>Video đứng yên 5 giây (đã chép xong) mới được nhận. Bản gốc chuyển sang “Đã xử lý”.</small></span></label>
      ${w.folders.map((f, i) => `<div style="${i ? 'border-top:1px solid var(--line);padding-top:6px;margin-top:6px' : ''}">
        <label class="ap-lbl">Thả video vào</label><div class="ap-fold"><input data-wf="${i}" data-k="in" value="${esc(f.in)}"><button class="icon" title="Mở trong Finder" data-wopen="${esc(f.in)}"><i class="ti ti-external-link"></i></button></div>
        <label class="ap-lbl">Kết quả (MP4, ảnh bìa, nội dung đăng)</label><div class="ap-fold"><input data-wf="${i}" data-k="done" value="${esc(f.done)}"><button class="icon" title="Mở trong Finder" data-wopen="${esc(f.done)}"><i class="ti ti-external-link"></i></button></div>
        <label class="ap-lbl">Bản gốc đã xử lý</label><div class="ap-fold"><input data-wf="${i}" data-k="processed" value="${esc(f.processed)}"><button class="icon" title="Mở trong Finder" data-wopen="${esc(f.processed)}"><i class="ti ti-external-link"></i></button></div>
        <div class="ap-row2" style="margin-top:4px"><select data-wf="${i}" data-k="profile"><option value="">Hồ sơ mặc định</option>${profiles().map(p => `<option value="${esc(p.id)}" ${p.id === f.profile ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
          ${w.folders.length > 1 ? `<button class="icon" title="Bỏ thư mục này" data-wdel="${i}"><i class="ti ti-trash"></i></button>` : '<span></span>'}</div></div>`).join('')}
      <div class="acts"><button id="ap-wadd"><i class="ti ti-folder-plus"></i> Thêm thư mục (cho hồ sơ khác)</button><button class="primary" id="ap-wsave"><i class="ti ti-device-floppy"></i> Lưu</button></div>
      ${st.runner.watchError ? `<div class="help ap-bad">${esc(st.runner.watchError)}</div>` : ''}
      <label class="ap-tog" style="margin-top:10px"><input type="checkbox" id="ap-agent" ${st.settings.agent || ag.installed ? 'checked' : ''}><span>Chạy cả khi tắt app<small>Cài một tác vụ nền macOS (LaunchAgent ${ag.installed ? '— đã cài' : ''}). Bỏ chọn để gỡ.</small></span></label>
      <label class="ap-tog"><input type="checkbox" id="ap-notify" ${st.settings.notify ? 'checked' : ''}><span>Thông báo macOS khi xong / lỗi</span></label>
      <label class="ap-tog"><input type="checkbox" id="ap-appdrop" ${st.settings.appDrop ? 'checked' : ''}><span>Thả vào app = tự lái<small>Thả video vào biểu tượng AI Video Studio → đưa thẳng vào hàng đợi Tự lái (thay vì chỉ tạo dự án).</small></span></label>
      ${st.runner.due ? `<div class="help" style="margin:4px 0 0">Lịch đăng: ${st.runner.due.skipped ? esc(st.runner.due.skipped) : `kiểm tra lúc ${new Date(st.runner.due.at).toLocaleTimeString('vi-VN')}${st.runner.due.msg ? ' — ' + esc(st.runner.due.msg) : ''}`}</div>` : ''}</div>`;
    const W = $('#ap-watch');
    const folders = () => { const f = JSON.parse(JSON.stringify(S.st.settings.watch.folders)); W.querySelectorAll('[data-wf]').forEach(el => (f[+el.dataset.wf][el.dataset.k] = el.value.trim())); return f; };
    const saveW = async (patch) => { const r = await api('/api/autopilot/settings', patch); if (r.error) return Studio.toast(r.error); S.st.settings = r.settings; return r; };
    $('#ap-won').onchange = async e => { await saveW({ watch: { on: e.target.checked, folders: folders() } }); Studio.toast(e.target.checked ? 'Đã bật thư mục tự động' : 'Đã tắt thư mục tự động'); };
    $('#ap-wsave').onclick = async () => { await saveW({ watch: { folders: folders() } }); Studio.toast('Đã lưu thư mục'); renderWatch(); };
    $('#ap-wadd').onclick = async () => { const f = folders(); const base = f[0].in.replace(/\/[^/]+$/, ''); f.push({ in: base + `/Thả video ${f.length + 1}`, done: f[0].done, processed: f[0].processed, profile: '' }); await saveW({ watch: { folders: f } }); renderWatch(); };
    W.querySelectorAll('[data-wdel]').forEach(b => (b.onclick = async () => { const f = folders(); f.splice(+b.dataset.wdel, 1); await saveW({ watch: { folders: f } }); renderWatch(); }));
    W.querySelectorAll('[data-wopen]').forEach(b => (b.onclick = async () => { const r = await api('/api/autopilot/reveal', { path: b.previousElementSibling.value, create: true }); if (r.error) Studio.toast(r.error); }));
    $('#ap-notify').onchange = e => saveW({ notify: e.target.checked });
    $('#ap-appdrop').onchange = e => saveW({ appDrop: e.target.checked });
    $('#ap-agent').onchange = async e => {
      if (e.target.checked && !confirm('Cài tác vụ nền macOS (LaunchAgent com.aivideostudio.watch)? Nó chạy hàng đợi + thư mục tự động cả khi Studio tắt. Gỡ bằng cách bỏ chọn ô này.')) { e.target.checked = false; return; }
      const r = await api('/api/autopilot/agent', { on: e.target.checked });
      Studio.toast(r.ok === false || r.error ? 'Lỗi: ' + (r.error || '') : e.target.checked ? 'Đã cài chạy nền' : 'Đã gỡ chạy nền');
      await refresh(); renderWatch();
    };
  }
  function renderProfiles() {
    const P = profiles(), learn = S.st.learn, proj = S.st.project;
    $('#ap-profiles').innerHTML = `<div class="ap-card"><h4><i class="ti ti-id-badge-2"></i>Hồ sơ kênh<span class="r">${P.length}</span></h4>
      ${P.map(p => `<div class="ap-prof"><div style="min-width:0"><span class="nm">${p.id === defProfile() ? '<i class="ti ti-star-filled" style="color:var(--warn)"></i> ' : ''}${esc(p.name)}</span>
        <small>${esc([p.pack === 'auto' ? 'AI chọn gói' : 'gói ' + p.pack, p.template ? 'mẫu ' + p.template : '', 'b-roll ' + p.broll_density, 'âm thanh ' + p.sound, (p.aspects || []).join('+'), p.whisper].filter(Boolean).join(' · '))}</small>
        ${p.learnedNotes?.length ? `<ul class="ap-learn">${p.learnedNotes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : p.learn ? `<small><i class="ti ti-school"></i> Đang học từ ${p.learnedN || 0} video bạn đã sửa${p.learnedN ? '' : ' (chưa có)'}</small>` : '<small>Không học từ chỉnh sửa</small>'}</div>
        <div class="b"><button class="icon" title="Sửa" data-pe="${esc(p.id)}"><i class="ti ti-pencil"></i></button><button class="icon" title="Nhân bản" data-pd="${esc(p.id)}"><i class="ti ti-copy"></i></button>
          ${p.id !== defProfile() ? `<button class="icon" title="Đặt làm mặc định" data-pdef="${esc(p.id)}"><i class="ti ti-star"></i></button>` : ''}
          ${p.learned ? `<button class="icon" title="Quên điều đã học" data-pr="${esc(p.id)}"><i class="ti ti-eraser"></i></button>` : ''}
          ${P.length > 1 ? `<button class="icon" title="Xoá hồ sơ" data-px="${esc(p.id)}"><i class="ti ti-trash"></i></button>` : ''}</div></div>`).join('')}
      <div class="acts"><button id="ap-pnew"><i class="ti ti-plus"></i> Hồ sơ mới</button>${proj?.autopilot ? '<button id="ap-learn" title="So dự án đang mở (do Tự lái làm) với bản Tự lái giao để học thói quen sửa của bạn"><i class="ti ti-school"></i> Học từ dự án này</button>' : ''}</div>
      ${learn ? `<div class="help" style="margin:6px 0 0">${learn.ok ? `Lần học gần nhất: ${esc(learn.observation?.name || '')} (${new Date(learn.at).toLocaleTimeString('vi-VN')})` : `Chưa học: ${esc(learn.why || '')}`}</div>` : ''}
      <div class="help" style="margin:6px 0 0">“Học từ chỉnh sửa”: khi bạn lưu một dự án do Tự lái làm, Studio so với bản Tự lái giao (cảnh tự động bị xoá, đổi kiểu phụ đề / gói, tắt nhạc…). Cần ít nhất 2 video có cùng thói quen mới điều chỉnh hồ sơ.</div></div>`;
    const B = $('#ap-profiles');
    const act = async (action, id) => { const r = await api('/api/autopilot/profile', { action, id }); if (r.error) return Studio.toast(r.error); S.st.profiles = r.profiles; renderProfiles(); render(); };
    B.querySelectorAll('[data-pe]').forEach(b => (b.onclick = () => editProfile(P.find(p => p.id === b.dataset.pe))));
    B.querySelectorAll('[data-pd]').forEach(b => (b.onclick = () => act('duplicate', b.dataset.pd)));
    B.querySelectorAll('[data-pdef]').forEach(b => (b.onclick = () => act('default', b.dataset.pdef)));
    B.querySelectorAll('[data-pr]').forEach(b => (b.onclick = () => confirm('Quên mọi điều hồ sơ này đã học từ các lần bạn sửa?') && act('reset', b.dataset.pr)));
    B.querySelectorAll('[data-px]').forEach(b => (b.onclick = () => confirm('Xoá hồ sơ này?') && act('delete', b.dataset.px)));
    $('#ap-pnew').onclick = () => editProfile(null);
    if ($('#ap-learn')) $('#ap-learn').onclick = async () => { await Studio.saveNow?.(); const r = await api('/api/autopilot/learn', {}); Studio.toast(r.ok ? `Đã ghi nhận: ${r.rules?.notes?.length || 0} điều chỉnh (${r.rules?.n || 0} video)` : 'Chưa học: ' + (r.why || r.error)); if (r.profiles) S.st.profiles = r.profiles; await refresh(); renderProfiles(); };
  }

  // ---------- profile editor ----------
  let BRANDS = null, TPLS = null;
  async function editProfile(p) {
    [BRANDS, TPLS] = await Promise.all([BRANDS || api('/api/brands').catch(() => []), TPLS || api('/api/templates').catch(() => [])]);
    const d = p || { name: 'Kênh mới', pack: 'auto', template: '', caption_style: '', goal: 'Chia sẻ', tone: 'Tự nhiên, gần gũi', ai: true, ai_density: 'vua', broll_density: 'vua', broll_goal: 'auto', broll_src: ['preset', 'hf', 'text', 'emoji', 'logo', 'aroll', 'lib'], sound: 'vua', music: 'auto', clean: 'vua', fillers: true, fillers_claude: false, whisper: 'large-v3-turbo', lang: 'vi', orient: 'auto', aspects: ['9:16'], quality: '1080', qc: true, cta: '', platforms: ['tiktok', 'youtube', 'facebook'], slot: '19:00', learn: true, extra: '', brand: '' };
    const packs = (Studio.win?.PACKS || []).filter(x => x.recipe || x.items);
    const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const chk = (name, opts, vals) => `<div class="chk">${opts.map(([k, l]) => `<label><input type="checkbox" name="${name}" value="${esc(k)}" ${(vals || []).includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>`;
    Studio.modal(`<h3><i class="ti ti-id-badge-2"></i> ${p ? 'Sửa' : 'Tạo'} hồ sơ kênh</h3><div class="ap-form">
      <div class="full"><label>Tên hồ sơ</label><input id="pf-name" value="${esc(d.name)}"></div>
      <div><label>Thương hiệu (brand kit)</label>${sel('pf-brand', [['', '— không —'], ...(BRANDS || []).map(b => [b.id, b.title || b.name])], d.brand)}</div>
      <div><label>Gói style</label>${sel('pf-pack', [['auto', 'AI chọn'], ...packs.map(x => [x.id, (x.icon || '') + ' ' + x.name]), ...(packs.some(x => x.id === d.pack) || d.pack === 'auto' ? [] : [[d.pack, d.pack]])], d.pack)}</div>
      <div><label>Mẫu (thay cho AI dựng)</label>${sel('pf-tpl', [['', '— AI dựng giúp —'], ...(TPLS || []).map(t => [t.id, t.name || t.id])], d.template)}</div>
      <div><label>Kiểu phụ đề (ép)</label><input id="pf-cap" value="${esc(d.caption_style || '')}" placeholder="để trống = theo gói/AI"></div>
      <div><label>Mục tiêu</label><input id="pf-goal" value="${esc(d.goal)}"></div><div><label>Giọng điệu</label><input id="pf-tone" value="${esc(d.tone)}"></div>
      <div><label>AI dựng giúp</label>${sel('pf-ai', [['1', 'Bật (claude -p)'], ['0', 'Tắt']], d.ai ? 1 : 0)}</div>
      <div><label>Mật độ graphic AI</label>${sel('pf-aid', [['thua', 'Thưa'], ['vua', 'Vừa'], ['day', 'Dày']], d.ai_density)}</div>
      <div><label>Mật độ b-roll</label>${sel('pf-bd', [['off', 'Tắt'], ['thua', 'Thưa (~8 s)'], ['vua', 'Vừa (~5 s)'], ['day', 'Dày (~3 s)'], ['ratday', 'Rất dày (~2 s)']], d.broll_density)}</div>
      <div><label>Âm thanh (SFX)</label>${sel('pf-snd', [['off', 'Tắt'], ['nhe', 'Nhẹ'], ['vua', 'Vừa'], ['phongphu', 'Phong phú']], d.sound)}</div>
      <div class="full"><label>Mục tiêu b-roll</label><select id="pf-bg">${[['auto', 'Tự nhận (theo gói + lời thoại)'], ['banhang', 'Bán hàng'], ['bds', 'BĐS'], ['khoahoc', 'Khoá học / Hướng dẫn'], ['review', 'Review'], ['tintuc', 'Tin tức'], ['kechuyen', 'Kể chuyện / Chia sẻ'], ['doanhnghiep', 'Doanh nghiệp'], ['amthuc', 'Ẩm thực / Du lịch'], ['giaitri', 'Giải trí']].map(([k, l]) => `<option value="${k}" ${(d.broll_goal || 'auto') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="full"><label>Nguồn b-roll</label>${chk('pf-bs', [['preset', 'B-roll động'], ['hf', 'Khối HyperFrames'], ['text', 'Chữ nổi'], ['emoji', 'Emoji'], ['logo', 'Logo công cụ'], ['aroll', 'Hiệu ứng trên người nói'], ['media', 'Media của dự án'], ['lib', 'Thư viện của tôi'], ['stock', 'Ảnh stock (mạng)'], ['stockvid', 'Video stock (key Pexels/Pixabay)'], ['aiimg', 'Ảnh AI (key OpenAI/Gemini)']], d.broll_src)}</div>
      <div><label>Nhạc nền</label>${sel('pf-mus', [['auto', 'Tự chọn (AI / theo đoạn)'], ['off', 'Không nhạc'], ['tech', 'tech'], ['chill', 'chill'], ['upbeat', 'upbeat'], ['corporate', 'corporate'], ['emotional', 'emotional'], ['suspense', 'suspense'], ...(['auto', 'off', 'tech', 'chill', 'upbeat', 'corporate', 'emotional', 'suspense'].includes(d.music) ? [] : [[d.music, d.music]])], d.music)}</div>
      <div><label>Làm sạch giọng</label>${sel('pf-cl', [['off', 'Tắt'], ['nhe', 'Nhẹ'], ['vua', 'Vừa'], ['manh', 'Mạnh']], d.clean)}</div>
      <div><label>Cắt lỗi nói / lặp từ</label>${sel('pf-fl', [['1', 'Bật'], ['1c', 'Bật + Claude dò câu hỏng'], ['0', 'Tắt']], d.fillers ? (d.fillers_claude ? '1c' : '1') : '0')}</div>
      <div><label>Nhận giọng (whisper)</label>${sel('pf-wh', [['large-v3-turbo', 'large-v3-turbo (chính xác)'], ['small', 'small (nhanh)'], ['large-v3', 'large-v3 (chậm nhất)']], d.whisper)}</div>
      <div><label>Ngôn ngữ</label>${sel('pf-lang', [['vi', 'Tiếng Việt'], ['auto', 'Tự nhận']], d.lang)}</div>
      <div><label>Khổ dựng</label>${sel('pf-or', [['auto', 'Theo video'], ['vertical', 'Dọc 9:16'], ['horizontal', 'Ngang 16:9']], d.orient)}</div>
      <div class="full"><label>Xuất các khổ</label>${chk('pf-asp', [['9:16', 'Dọc 9:16'], ['1:1', 'Vuông 1:1'], ['16:9', 'Ngang 16:9']], d.aspects)}</div>
      <div><label>Chất lượng</label>${sel('pf-q', [['1080', '1080p'], ['720', '720p (nhanh)'], ['4k', '4K']], d.quality)}</div>
      <div><label>AI kiểm tra (QC)</label>${sel('pf-qc', [['1', 'Bật (tự sửa lỗi an toàn)'], ['0', 'Tắt']], d.qc ? 1 : 0)}</div>
      <div class="full"><label>Lời kêu gọi (CTA) — dùng cho kết video + nội dung đăng</label><input id="pf-cta" value="${esc(d.cta)}" placeholder="VD: Follow để nhận mẹo AI mỗi ngày"></div>
      <div class="full"><label>Nền tảng viết nội dung đăng</label>${chk('pf-pl', [['tiktok', 'TikTok'], ['youtube', 'YouTube Shorts'], ['facebook', 'Facebook Reels'], ['instagram', 'Instagram'], ['zalo', 'Zalo']], d.platforms)}</div>
      <div><label>Giờ đăng mặc định</label><input id="pf-slot" type="time" value="${esc(d.slot || '19:00')}"></div>
      <div><label>Học từ chỉnh sửa</label>${sel('pf-learn', [['1', 'Bật'], ['0', 'Tắt']], d.learn ? 1 : 0)}</div>
      <div class="full"><label>Yêu cầu thêm cho AI</label><input id="pf-extra" value="${esc(d.extra || '')}" placeholder="VD: nhấn mạnh con số, giọng hài hước"></div>
      </div><div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="pf-save"><i class="ti ti-device-floppy"></i> Lưu</button></div>`);
    const v = id => $('#' + id).value, all = n => [...document.querySelectorAll(`[name=${n}]:checked`)].map(i => i.value);
    $('#pf-save').onclick = async () => {
      const fl = v('pf-fl');
      const prof = { ...(p ? { id: p.id } : {}), name: v('pf-name'), brand: v('pf-brand'), pack: v('pf-pack'), template: v('pf-tpl'), caption_style: v('pf-cap').trim(), goal: v('pf-goal'), tone: v('pf-tone'),
        ai: v('pf-ai') === '1', ai_density: v('pf-aid'), broll_density: v('pf-bd'), broll_goal: v('pf-bg') || 'auto', broll_src: all('pf-bs'), sound: v('pf-snd'), music: v('pf-mus'), clean: v('pf-cl'), fillers: fl !== '0', fillers_claude: fl === '1c',
        whisper: v('pf-wh'), lang: v('pf-lang'), orient: v('pf-or'), aspects: all('pf-asp'), quality: v('pf-q'), qc: v('pf-qc') === '1', cta: v('pf-cta'), platforms: all('pf-pl'), slot: v('pf-slot'), learn: v('pf-learn') === '1', extra: v('pf-extra') };
      const r = await api('/api/autopilot/profile', { action: 'save', profile: prof });
      if (r.error) return Studio.toast(r.error);
      S.st.profiles = r.profiles; Studio.closeModal(); Studio.toast('Đã lưu hồ sơ'); render();
    };
  }

  // ---------- actions ----------
  async function itemAct(id, action) {
    if (action === 'cancel' && !confirm('Huỷ việc này?')) return;
    if (action === 'open') { if (!confirm('Mở dự án này trong Studio? (dự án hiện tại được lưu trước)')) return; await Studio.saveNow?.(); }
    const r = await api('/api/autopilot/item', { id, action });
    if (r.error) return Studio.toast(r.error);
    if (action === 'open') return (location.hash = '', location.reload());
    refresh(true);
  }
  async function enqueuePath() {
    const p = $('#ap-path').value.trim(); if (!p) return Studio.toast('Nhập đường dẫn video');
    const r = await api('/api/autopilot/enqueue', { input: p, profile: S.profile });
    if (r.error) return Studio.toast(r.error);
    S.path = ''; Studio.toast('Đã thêm vào hàng đợi Tự lái'); refresh(true);
  }
  async function uploadFiles(files) {
    for (const f of files) {
      if (!/\.(mp4|mov|m4v|mkv|webm)$/i.test(f.name)) { Studio.toast('Bỏ qua (không phải video): ' + f.name); continue; }
      S.uploading = f.name; $('#ap-upl') && ($('#ap-upl').innerHTML = `<div class="help"><i class="ti ti-loader-2 spin"></i> Đang chép ${esc(f.name)} (${(f.size / 1048576).toFixed(0)} MB)…</div>`);
      const r = await fetch(`/api/autopilot/upload?name=${encodeURIComponent(f.name)}&profile=${encodeURIComponent(S.profile || '')}`, { method: 'POST', body: f }).then(x => x.json()).catch(e => ({ error: e.message }));
      if (r.error) Studio.toast('Lỗi: ' + r.error); else Studio.toast('Đã thêm “' + f.name + '” vào hàng đợi');
    }
    S.uploading = null; if ($('#ap-upl')) $('#ap-upl').innerHTML = ''; refresh(true);
  }
  function bindTop() {
    const dz = $('#ap-drop');
    dz.onclick = () => $('#ap-file').click();
    $('#ap-pick').onclick = () => $('#ap-file').click();
    $('#ap-file').onchange = e => uploadFiles([...e.target.files]);
    // stopPropagation: the editor's window-level drop handler would otherwise upload the file into the open project's media/
    dz.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); uploadFiles([...e.dataTransfer.files]); });
    $('#ap-prof').onchange = e => { S.profile = e.target.value; api('/api/autopilot/settings', { profile: S.profile }); };
    $('#ap-path').oninput = e => (S.path = e.target.value);
    $('#ap-path').onkeydown = e => e.key === 'Enter' && enqueuePath();
    $('#ap-add').onclick = enqueuePath;
  }

  // ---------- wiring ----------
  const openMe = () => document.querySelector('#rail [data-p="autopilot"]')?.click();
  Studio.addPanel('autopilot', 'ti-rocket', 'Tự lái', () => { render(); refresh(true); });
  // the top bar exists even when no project is open (onReady never fires then)
  Studio.addTopButton('<button class="ghost" id="ap-topbtn" title="Tự lái: thả video → video hoàn chỉnh"><i class="ti ti-rocket"></i> Tự lái<span class="pct"></span></button>', openMe);
  let n = 0; setInterval(() => (active() || ++n % 4 === 0) && refresh(false), 1500);
  refresh(false);
  if (/^#(tu-lai|autopilot)/.test(location.hash)) setTimeout(openMe, 300);
})();
