// Làm hàng loạt: template / dự án hiện tại × bảng tính CSV/XLSX → mỗi dòng một video. Server: studio/routes/50_batch.mjs.
(() => {
  const { $, esc } = Studio;
  const S = { source: 'file:bds-can-ho.template.json', sheet: null, targets: [], mapping: {}, voice: 'auto', quality: '1080', dur: '', rows: '', brand: '', prevRow: 0, prevT: 2.5,
    img: null, busy: false, run: null, status: null, sources: null, brands: [], history: [], showText: false };
  const css = document.createElement('style');
  css.textContent = `
  .bt-card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r); padding: 10px; margin: 8px 0; }
  .bt-card h4 { margin: 0 0 8px; font-size: 12px; display: flex; align-items: center; gap: 6px; color: var(--tx); }
  .bt-card h4 .n { width: 18px; height: 18px; border-radius: 50%; background: var(--acc-soft); color: var(--acc); font-size: 10.5px; display: inline-flex; align-items: center; justify-content: center; }
  .bt-map { display: flex; flex-direction: column; gap: 6px; }
  .bt-m { display: grid; grid-template-columns: minmax(0, 1fr) 120px; gap: 6px; align-items: center; }
  .bt-m .k { min-width: 0; font-size: 11.5px; } .bt-m .k b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .bt-m .k small { display: block; color: var(--tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; }
  .bt-m .k small.v { color: var(--wave); }
  .bt-m select { font-size: 11px; padding: 4px 22px 4px 6px; height: 28px; }
  .bt-m.on .k b { color: #D9D3FF; }
  .bt-kind { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--tx3); margin: 8px 0 2px; font-weight: 700; }
  .bt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; } .bt-grid label { font-size: 10.5px; color: var(--tx3); display: block; margin-bottom: 3px; }
  .bt-prev { display: flex; gap: 8px; align-items: flex-start; margin-top: 8px; }
  .bt-prev img { width: 120px; border-radius: 8px; border: 1px solid var(--line2); background: #000; }
  .bt-row { display: grid; grid-template-columns: 18px minmax(0,1fr) auto; gap: 6px; align-items: center; padding: 7px 0; border-top: 1px solid var(--line); font-size: 11.5px; }
  .bt-row .nm { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; } .bt-row .st { color: var(--tx3); font-size: 10.5px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bt-row .st.err { color: var(--bad); }
  .bt-row .b { display: flex; gap: 2px; } .bt-row .b button { width: 26px; height: 26px; padding: 0; justify-content: center; }
  .bt-pbar { height: 3px; background: var(--bg4); border-radius: 3px; overflow: hidden; margin-top: 3px; } .bt-pbar i { display: block; height: 100%; background: linear-gradient(90deg, var(--acc2), var(--wave)); }
  .bt-ok { color: var(--ok); } .bt-bad { color: var(--bad); } .bt-run { color: var(--acc); }
  .bt-drop { border: 1px dashed var(--line3); border-radius: 8px; padding: 10px; text-align: center; color: var(--tx3); cursor: pointer; font-size: 11.5px; }
  .bt-drop:hover { border-color: var(--acc); color: var(--tx); }
  .bt-file { display: flex; align-items: center; gap: 6px; font-size: 11.5px; margin-top: 6px; } .bt-file b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`;
  document.head.appendChild(css);
  const active = () => document.querySelector('#rail .on')?.dataset.p === 'batch';
  const rerender = () => active() && render();
  const row0 = () => S.sheet?.rows?.[S.prevRow] || S.sheet?.rows?.[0] || {};

  async function loadTargets() {
    const r = await Studio.api('/api/batch/targets', { source: S.source, columns: S.sheet?.columns });
    if (r.error) return Studio.toast(r.error);
    S.targets = r.targets; S.needs = r.needs;
    if (S.sheet) S.mapping = r.mapping;
    S.img = null; rerender();
  }
  async function init() {
    const [src, brands, hist] = await Promise.all([Studio.api('/api/batch/sources'), Studio.api('/api/brands').catch(() => []), Studio.api('/api/batch/list').catch(() => [])]);
    S.sources = src.sources || []; S.project = src.project; S.brands = Array.isArray(brands) ? brands : []; S.history = Array.isArray(hist) ? hist : [];
    await loadTargets();
  }
  async function useSheet(r) {
    if (r.error) return Studio.toast(r.error);
    S.sheet = r; S.prevRow = 0;
    if (r.source) S.source = r.source;
    await loadTargets();
    Studio.toast(`Đã đọc ${r.rows.length} dòng · ${r.columns.length} cột`);
  }
  async function upload(file) {
    const r = await fetch('/api/batch/sheet?name=' + encodeURIComponent(file.name), { method: 'POST', body: file }).then(x => x.json());
    useSheet(r);
  }
  const jobBody = () => ({ source: S.source, sheet: S.sheet?.file, mapping: S.mapping, brand: S.brand || null, voice: S.voice, quality: S.quality, dur: S.dur || null, rows: S.rows || null,
    name: (S.sources.find(s => s.key === S.source)?.name || S.project || 'hang-loat') });
  async function preview() {
    if (!S.sheet) return Studio.toast('Chọn bảng tính trước');
    S.busy = 'preview'; rerender();
    const r = await Studio.api('/api/batch/preview', { ...jobBody(), row: S.prevRow, t: +S.prevT });
    S.busy = false;
    if (r.error) Studio.toast('Lỗi xem trước: ' + r.error); else S.img = r.img + '?' + Date.now(), S.prevDur = r.duration;
    rerender();
  }
  async function start(resume) {
    if (!resume && !S.sheet) return Studio.toast('Chọn bảng tính trước');
    const r = await Studio.api('/api/batch/start', resume ? { resume } : jobBody());
    if (r.error) return Studio.toast(r.error);
    S.run = r.dir; S.status = null; poll(); rerender();
  }
  let timer = null;
  function poll() {
    clearInterval(timer);
    timer = setInterval(async () => {
      const [st, job] = await Promise.all([Studio.api('/api/batch/status?dir=' + encodeURIComponent(S.run)), Studio.api('/api/job')]);
      S.status = st; S.job = job;
      if (!job || job.kind !== 'batch' || job.state !== 'running') { clearInterval(timer); timer = null; S.history = await Studio.api('/api/batch/list').catch(() => S.history); }
      rerender();
    }, 1000);
  }

  function mapRow(t) {
    const cols = S.sheet?.columns || [], c = S.mapping[t.key] || '', v = c ? row0()[c] : '';
    return `<div class="bt-m ${c ? 'on' : ''}"><div class="k"><b title="${esc(t.label)}">${esc(t.label)}</b>${c ? `<small class="v" title="${esc(v)}">→ ${esc(v || '(trống)')}</small>` : t.sample && t.kind !== 'text' ? `<small title="${esc(t.sample)}">mẫu: ${esc(t.sample)}</small>` : ''}</div>
      <select data-bmap="${esc(t.key)}"><option value="">— giữ mẫu —</option>${cols.map(x => `<option ${x === c ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>`;
  }
  function render() {
    $('#libact').innerHTML = `<button class="icon" id="bt-refresh" title="Tải lại"><i class="ti ti-refresh"></i></button>`;
    $('#bt-refresh').onclick = () => init();
    if (!S.sources) { $('#libbody').innerHTML = '<div class="help">Đang tải…</div>'; return; }
    const groups = [...new Set(S.sources.map(s => s.group))];
    const T = S.targets, by = k => T.filter(t => t.kind === k);
    const nMap = Object.values(S.mapping).filter(Boolean).length;
    const st = S.status, running = S.job?.kind === 'batch' && S.job.state === 'running';
    $('#libbody').innerHTML = `
    <div class="help" style="margin-top:4px">Một mẫu + một bảng tính → mỗi dòng một video riêng (thư mục dự án + MP4). Chạy lần lượt, dừng được, chạy tiếp được.</div>
    <div class="bt-card"><h4><span class="n">1</span>Nguồn</h4>
      <select id="bt-src"><option value="project" ${S.source === 'project' ? 'selected' : ''}>Dự án đang mở (${esc(S.project || '')})</option>
      ${groups.map(g => `<optgroup label="${esc(g)}">${S.sources.filter(s => s.group === g).map(s => `<option value="${esc(s.key)}" ${s.key === S.source ? 'selected' : ''}>${esc(s.name)} · ${s.aspect || ''}</option>`).join('')}</optgroup>`).join('')}</select>
      ${S.needs?.length ? `<div class="help">Cần: ${esc(S.needs.join(', '))}</div>` : ''}
      ${S.source === 'project' ? '<div class="help">Dự án hiện tại: thay chữ / ảnh / thương hiệu theo từng dòng, giữ nguyên giọng và video.</div>' : ''}</div>
    <div class="bt-card"><h4><span class="n">2</span>Bảng tính</h4>
      <div class="bt-drop" id="bt-drop"><i class="ti ti-table-import"></i> Chọn hoặc thả file .csv / .xlsx<input type="file" id="bt-file" accept=".csv,.xlsx,.tsv,.txt" hidden></div>
      <div class="acts" style="padding-top:6px"><button id="bt-ex"><i class="ti ti-building-community"></i> Dùng ví dụ BĐS (5 căn)</button></div>
      ${S.sheet ? `<div class="bt-file"><i class="ti ti-file-spreadsheet bt-ok"></i><b title="${esc(S.sheet.file)}">${esc(S.sheet.name)}</b><span class="muted">${S.sheet.rows.length} dòng · ${S.sheet.columns.length} cột</span></div>` : ''}</div>
    <div class="bt-card"><h4><span class="n">3</span>Ghép cột <span class="muted" style="font-weight:500">${S.sheet ? `${nMap} đã ghép` : ''}</span>
      ${S.sheet ? `<span class="muted" style="margin-left:auto;font-weight:500">dòng</span><select id="bt-prow" style="width:56px;height:24px;font-size:11px;padding:2px 18px 2px 6px">${S.sheet.rows.map((_, i) => `<option value="${i}" ${i === S.prevRow ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>` : ''}</h4>
      ${!S.sheet ? '<div class="help">Chọn bảng tính để ghép cột vào chỗ trống <b>{{cột}}</b>, chữ mẫu, ảnh và thông tin thương hiệu.</div>' : `<div class="bt-map">
        ${by('placeholder').length ? `<div class="bt-kind">Chỗ trống {{…}}</div>${by('placeholder').map(mapRow).join('')}` : ''}
        <div class="bt-kind">Trường chính</div>${by('field').map(mapRow).join('')}
        ${by('media').length ? `<div class="bt-kind">Ảnh / video trong mẫu</div>${by('media').map(mapRow).join('')}` : ''}
        ${by('text').length ? `<div class="bt-kind" style="cursor:pointer" id="bt-ttog"><i class="ti ti-chevron-${S.showText ? 'down' : 'right'}" style="font-size:12px"></i> Chữ mẫu trong template (${by('text').length})</div>${S.showText ? by('text').map(mapRow).join('') : ''}` : ''}
      </div>`}</div>
    <div class="bt-card"><h4><span class="n">4</span>Tuỳ chọn</h4>
      <div class="bt-grid">
        <div><label>Thương hiệu</label><select id="bt-brand"><option value="">— theo mẫu —</option>${S.brands.map(b => `<option value="${esc(b.id)}" ${b.id === S.brand ? 'selected' : ''}>${esc(b.title || b.name)}</option>`).join('')}</select></div>
        <div><label>Giọng / nền</label><select id="bt-voice">${[['auto', 'Tự động'], ['tts', 'Giọng AI (Linh)'], ['none', 'Chỉ nhạc + ảnh'], ['beat', 'Ảnh theo nhịp']].map(([v, l]) => `<option value="${v}" ${v === S.voice ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label>Chất lượng</label><select id="bt-q"><option value="1080" ${S.quality === '1080' ? 'selected' : ''}>1080p</option><option value="720" ${S.quality === '720' ? 'selected' : ''}>720p (nhanh)</option></select></div>
        <div><label>Độ dài mặc định (s)</label><input id="bt-dur" type="number" min="3" placeholder="theo mẫu" value="${esc(S.dur)}"></div>
        <div style="grid-column:1/3"><label>Chỉ làm các dòng (vd 1-3,5 · trống = tất cả)</label><input id="bt-rows" placeholder="tất cả" value="${esc(S.rows)}"></div>
      </div>
      <div class="help">Tự động: dòng có cột <b>video</b> → dựng từ video người nói; có cột <b>lời đọc</b> → giọng AI tiếng Việt (macOS “Linh”) + ảnh; không có → ảnh + nhạc của mẫu.</div></div>
    <div class="bt-card"><h4><span class="n">5</span>Xem trước & chạy</h4>
      <div class="bt-grid"><div><label>Khung hình tại (s)</label><input id="bt-pt" type="number" step="0.5" min="0" value="${esc(S.prevT)}"></div>
        <div style="display:flex;align-items:flex-end"><button id="bt-prev" style="width:100%;justify-content:center" ${S.busy || !S.sheet ? 'disabled' : ''}>${S.busy === 'preview' ? '<i class="ti ti-loader-2 spin"></i> Đang dựng…' : `<i class="ti ti-eye"></i> Xem dòng ${S.prevRow + 1}`}</button></div></div>
      ${S.img ? `<div class="bt-prev"><img src="${esc(S.img)}"><div class="help" style="margin:0">Ảnh tĩnh dòng ${S.prevRow + 1} tại ${S.prevT}s${S.prevDur ? ` · video dài ${S.prevDur}s` : ''}.<br>Chưa có tiếng trong ảnh xem trước.</div></div>` : ''}
      <div class="acts"><button class="primary" id="bt-go" ${!S.sheet || running ? 'disabled' : ''}><i class="ti ti-player-play"></i> Bắt đầu ${S.sheet ? `(${S.rows || S.sheet.rows.length + ' video'})` : ''}</button>
        ${running ? '<button class="danger" id="bt-stop"><i class="ti ti-player-stop"></i> Dừng</button>' : ''}</div></div>
    ${st ? `<div class="bt-card"><h4><i class="ti ti-list-check"></i>${esc(st.name)} <span class="muted" style="font-weight:500;margin-left:auto">${st.rows.filter(r => r.state === 'done').length}/${st.total}</span></h4>
      ${running ? `<div class="help" style="margin:0 0 4px">${esc(S.job.step || '')}</div>` : ''}
      ${st.rows.map(r => `<div class="bt-row"><i class="ti ${r.state === 'done' ? 'ti-circle-check bt-ok' : r.state === 'error' ? 'ti-alert-triangle bt-bad' : r.state === 'running' ? 'ti-loader-2 spin bt-run' : r.state === 'cancelled' ? 'ti-player-pause muted' : 'ti-clock muted'}"></i>
        <div style="min-width:0"><span class="nm">${r.i + 1}. ${esc(r.title || r.name || 'Dòng ' + (r.i + 1))}</span>
          <span class="st ${r.state === 'error' ? 'err' : ''}" title="${esc(r.error || r.step || '')}">${esc(r.error || (r.state === 'pending' ? 'chờ' : r.state === 'cancelled' ? 'đã dừng — bấm Chạy tiếp' : r.step || r.state))}</span>
          ${r.state === 'running' ? `<div class="bt-pbar"><i style="width:${Math.round((r.progress || 0) * 100)}%"></i></div>` : ''}</div>
        <div class="b">${r.url ? `<button class="icon" title="Mở video" data-bopen="${esc(r.url)}"><i class="ti ti-player-play"></i></button><button class="icon" title="Hiện trong Finder" data-breveal="${esc(r.rout)}"><i class="ti ti-folder"></i></button>` : ''}
          ${r.rdir ? `<button class="icon" title="Mở dự án này trong Studio" data-bproj="${esc(r.rdir)}"><i class="ti ti-edit"></i></button>` : ''}</div></div>`).join('')}
      ${!running && st.rows.some(r => r.state !== 'done') ? `<div class="acts"><button id="bt-resume"><i class="ti ti-player-track-next"></i> Chạy tiếp các dòng chưa xong</button></div>` : ''}</div>` : ''}
    ${S.history.length ? `<div class="sect"><i class="ti ti-history"></i> Lần chạy trước</div>${S.history.slice(0, 6).map(h => `<div class="bt-row" style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><span class="nm">${esc(h.name)}</span><span class="st">${h.done}/${h.total} video</span></div>
      <div class="b"><button class="icon" title="Xem" data-bhist="${esc(h.dir)}"><i class="ti ti-list"></i></button><button class="icon" title="Hiện trong Finder" data-breveal="${esc(h.dir)}"><i class="ti ti-folder"></i></button></div></div>`).join('')}` : ''}`;
    bind();
  }
  function bind() {
    const B = $('#libbody');
    $('#bt-src').onchange = e => { S.source = e.target.value; S.mapping = {}; loadTargets(); };
    $('#bt-drop').onclick = () => $('#bt-file').click();
    $('#bt-file').onchange = e => e.target.files[0] && upload(e.target.files[0]);
    $('#bt-drop').ondragover = e => e.preventDefault();
    $('#bt-drop').ondrop = e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) upload(f); };
    $('#bt-ex').onclick = async () => useSheet(await Studio.api('/api/batch/example'));
    if ($('#bt-prow')) $('#bt-prow').onchange = e => { S.prevRow = +e.target.value; S.img = null; render(); };
    if ($('#bt-ttog')) $('#bt-ttog').onclick = () => { S.showText = !S.showText; render(); };
    B.querySelectorAll('[data-bmap]').forEach(s => (s.onchange = () => { if (s.value) S.mapping[s.dataset.bmap] = s.value; else delete S.mapping[s.dataset.bmap]; S.img = null; render(); }));
    $('#bt-brand').onchange = e => { S.brand = e.target.value; S.img = null; };
    $('#bt-voice').onchange = e => { S.voice = e.target.value; S.img = null; };
    $('#bt-q').onchange = e => (S.quality = e.target.value);
    $('#bt-dur').onchange = e => (S.dur = e.target.value);
    $('#bt-rows').onchange = e => { S.rows = e.target.value.trim(); render(); };
    $('#bt-pt').onchange = e => (S.prevT = e.target.value);
    $('#bt-prev').onclick = preview;
    $('#bt-go').onclick = () => start();
    if ($('#bt-stop')) $('#bt-stop').onclick = () => Studio.api('/api/job/cancel', {}).then(() => Studio.toast('Đang dừng… (dòng đang làm sẽ làm lại khi chạy tiếp)'));
    if ($('#bt-resume')) $('#bt-resume').onclick = () => start(S.run);
    B.querySelectorAll('[data-bopen]').forEach(b => (b.onclick = () => window.open(b.dataset.bopen)));
    B.querySelectorAll('[data-breveal]').forEach(b => (b.onclick = () => Studio.api('/api/reveal', { path: b.dataset.breveal })));
    B.querySelectorAll('[data-bproj]').forEach(b => (b.onclick = async () => {
      if (!confirm('Mở dự án của dòng này trong Studio? (lưu dự án hiện tại trước)')) return;
      await Studio.saveNow(); const r = await Studio.api('/api/open', { path: Studio.META.dir + '/' + b.dataset.bproj }); if (r.ok) location.reload(); else Studio.toast(r.error || 'Lỗi');
    }));
    B.querySelectorAll('[data-bhist]').forEach(b => (b.onclick = async () => { S.run = b.dataset.bhist; S.status = await Studio.api('/api/batch/status?dir=' + encodeURIComponent(S.run)); S.job = await Studio.api('/api/job'); if (S.job?.kind === 'batch' && S.job.state === 'running') poll(); render(); }));
  }
  Studio.addPanel('batch', 'ti-stack-2', 'Hàng loạt', () => { render(); if (!S.sources) init(); });
  Studio.onReady(async () => {
    const j = await Studio.api('/api/job');
    if (j?.kind === 'batch' && j.batch) { S.run = j.batch; if (j.state === 'running') poll(); }
  });
})();
