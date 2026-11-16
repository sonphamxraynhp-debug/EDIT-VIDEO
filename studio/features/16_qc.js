// AI QC ("Kiểm tra chất lượng") + A/B variants ("Nhiều phiên bản") — references/qc-variants.md.
// Adds two cards to the AI panel (injected when the panel renders, no edit of 20_ai.js), a checkbox
// "AI kiểm tra & sửa trước khi xuất" in the export dialog, and a QC card in the "Xuất xong" dialog.
'use strict';
(() => {
  const S = Studio, $ = s => document.querySelector(s), esc = S.esc;
  const css = document.createElement('style');
  css.textContent = `
  .qc-score { display: flex; align-items: center; gap: 14px; margin: 6px 0 10px; }
  .qc-ring { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; font-size: 20px; font-weight: 800; flex: none;
    background: conic-gradient(var(--c) calc(var(--v) * 1%), var(--bg4) 0); position: relative; }
  .qc-ring::after { content: ''; position: absolute; inset: 6px; border-radius: 50%; background: var(--bg1); }
  .qc-ring b { position: relative; z-index: 1; }
  .qc-sum { color: var(--tx2); line-height: 1.5; font-size: 12.5px; }
  .qc-list { display: flex; flex-direction: column; gap: 4px; max-height: 46vh; overflow: auto; margin: 6px 0; }
  .qc-it { display: flex; gap: 8px; align-items: flex-start; padding: 7px 9px; border: 1px solid var(--line); border-radius: var(--rs); background: var(--bg1); cursor: pointer; }
  .qc-it:hover { border-color: var(--line3); }
  .qc-it.fixed { opacity: .62; }
  .qc-it .tm { font-variant-numeric: tabular-nums; font-size: 11px; color: var(--tx3); width: 42px; flex: none; padding-top: 1px; }
  .qc-it .sv { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; background: var(--tx3); }
  .qc-it .sv.high { background: var(--bad); } .qc-it .sv.med { background: var(--warn); } .qc-it .sv.low { background: var(--wave); }
  .qc-it .bd { flex: 1; min-width: 0; font-size: 12.5px; line-height: 1.45; }
  .qc-it .bd small { color: var(--tx3); font-size: 10.5px; margin-left: 4px; }
  .qc-it .ok { color: var(--ok); font-size: 11px; flex: none; }
  .qc-it .src { font-size: 9.5px; text-transform: uppercase; color: var(--tx3); border: 1px solid var(--line2); border-radius: 4px; padding: 0 4px; margin-right: 4px; }
  .qc-imgs { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; } .qc-imgs a { color: var(--acc); font-size: 12px; }
  .qc-cmp { width: 100%; border-radius: 6px; border: 1px solid var(--line2); margin-top: 6px; }
  label.qcx { display: flex; gap: 8px; align-items: center; margin-top: 12px; padding: 8px 10px; border: 1px solid var(--line2); border-radius: var(--rs); cursor: pointer; background: var(--bg1); }
  label.qcx:has(input:checked) { border-color: var(--acc-line); background: var(--acc-soft); }
  label.qcx small { color: var(--tx3); }
  .va-grid { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 10px; margin: 8px 0; }
  .va-col { background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r); padding: 8px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .va-col.cur { border-color: var(--acc-line); }
  .va-col video, .va-col img { width: 100%; aspect-ratio: 9/16; object-fit: cover; border-radius: 6px; background: #000; }
  body.landscape .va-col video, body.landscape .va-col img { aspect-ratio: 16/9; }
  .va-col b { font-size: 12.5px; } .va-col p { margin: 0; color: var(--tx2); font-size: 11.5px; line-height: 1.45; }
  .va-col .hk { color: var(--warn); font-weight: 700; font-size: 12px; }
  #modalbox:has(.va-grid) { width: min(1100px, 94vw); max-width: 94vw; }
  #modalbox:has(.qc-list) { width: min(640px, 94vw); }`;
  document.head.appendChild(css);

  const col = v => (v >= 80 ? 'var(--ok)' : v >= 55 ? 'var(--warn)' : 'var(--bad)');
  const ring = v => `<div class="qc-ring" style="--v:${v};--c:${col(v)}"><b>${v}</b></div>`;
  const KV = { hook: 'Hook', readability: 'Dễ đọc', spelling: 'Chính tả', variety: 'Đa dạng', pacing: 'Nhịp', brand: 'Thương hiệu' };
  let last = null, va = null, exportQc = null, passQc = false, saved = null;

  async function load() { const r = await S.api('/api/qc').catch(() => null); last = r && !r.none ? r : null; return last; }
  async function loadVa() { const r = await S.api('/api/variants').catch(() => null); va = r && !r.none ? r : null; return va; }
  const dirty = () => $('#status')?.classList.contains('dirty');

  // ---------- run QC as a job ----------
  async function runQc({ fix = false, claude = true, after } = {}) {
    if (dirty()) await S.saveNow();
    const r = await S.api('/api/qc/run', { fix, claude });
    if (!r.ok) return S.toast(r.error || 'Đang có tác vụ khác chạy');
    S.modal(`<h3><i class="ti ti-shield-check"></i> ${fix ? 'Đang kiểm tra & tự sửa…' : 'Đang kiểm tra chất lượng…'}</h3>
      <div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre>
      <p class="muted">Render ảnh bằng engine, đo chữ/mặt/phụ đề, trộn thử âm thanh${claude ? ', rồi Claude xem các khung hình (30–120 giây)' : ''}.</p>`);
    S.pollJob(async j => {
      if (j.state !== 'done') return S.modal(`<h3>Lỗi kiểm tra</h3><p>${esc(j.error || j.step)}</p><pre>${esc((j.log || '').slice(-1200))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      await load();
      if (fix) await S.reload();
      if (after) return after(last);
      showResult();
      rerender();
    });
  }

  // ---------- result dialog ----------
  function showResult() {
    const q = last; if (!q) return;
    const fixedN = q.issues.filter(i => i.fixed).length, open = q.issues.filter(i => !i.fixed);
    const fixable = open.some(i => i.src === 'auto' ? ['text_offcanvas', 'face_cover', 'caption_overlap', 'overlap', 'empty', 'caption_long', 'missing_media', 'hook_missing', 'music_masking'].includes(i.kind) : i.fix);
    const sc = q.claude?.scores && Object.keys(q.claude.scores).length ? `<div class="ai-kv">${Object.entries(q.claude.scores).map(([k, v]) => `<span>${KV[k] || k} ${v}/10</span>`).join('')}</div>` : '';
    S.modal(`<h3><i class="ti ti-shield-check"></i> Kiểm tra chất lượng</h3>
      <div class="qc-score">${q.after != null ? `${ring(q.before)}<i class="ti ti-arrow-right" style="color:var(--tx3)"></i>${ring(q.after)}` : ring(q.score)}
        <div class="qc-sum">${q.issues.length ? `${q.issues.length} vấn đề${fixedN ? `, đã sửa <b style="color:var(--ok)">${fixedN}</b>` : ''}${q.counts?.high ? ` · <b style="color:var(--bad)">${q.counts.high} nặng</b> còn lại` : ''}` : 'Không thấy vấn đề nào'}
        ${q.audio?.lufs != null ? `<br>Âm thanh: ${q.audio.lufs} LUFS · đỉnh ${q.audio.true_peak} dBTP${q.audio.masked_pct != null ? ` · nhạc át giọng ${q.audio.masked_pct}%` : ''}` : ''}
        ${q.undone ? '<br><i>Đã hoàn tác lần sửa trước.</i>' : ''}</div></div>
      ${q.claude?.summary ? `<div class="help"><b>Claude:</b> ${esc(q.claude.summary)}</div>${sc}` : q.claude?.error ? `<div class="help" style="color:var(--warn)">Không có nhận xét của Claude: ${esc(q.claude.error)}</div>` : ''}
      <div class="qc-list">${q.issues.map((i, k) => `<div class="qc-it ${i.fixed ? 'fixed' : ''}" data-qct="${i.t}" title="Bấm để tua tới ${S.fmt(i.t)}">
        <span class="tm">${S.fmt(i.t).replace(/^0:/, '')}</span><span class="sv ${i.severity}"></span>
        <span class="bd"><span class="src">${i.src === 'claude' ? 'Claude' : 'máy'}</span><b>${esc(i.kind_vi)}</b> — ${esc(i.msg)}${i.note ? `<small>(${esc(i.note)})</small>` : ''}</span>
        ${i.fixed ? '<span class="ok"><i class="ti ti-check"></i> đã sửa</span>' : ''}</div>`).join('')}</div>
      ${q.compare_sheet ? `<details><summary class="muted" style="cursor:pointer">Ảnh trước / sau khi sửa (${q.compare.length} cặp)</summary><img class="qc-cmp" src="/project/${q.compare_sheet}?${Date.now()}"></details>` : ''}
      <div class="qc-imgs">${q.sheet ? `<a href="/project/${q.sheet}" target="_blank"><i class="ti ti-layout-grid"></i> Ảnh tổng quan các khung</a>` : ''}</div>
      <div class="actions">${q.can_undo && q.fix && !q.undone ? '<button id="qcundo"><i class="ti ti-arrow-back-up"></i> Hoàn tác sửa</button>' : ''}
        <button id="qcagain"><i class="ti ti-refresh"></i> Kiểm tra lại</button>
        ${fixable ? '<button class="primary" id="qcfix"><i class="ti ti-wand"></i> Áp dụng sửa</button>' : ''}<button onclick="closeModal()">Đóng</button></div>`);
    $('#modalbox .qc-list').addEventListener('click', e => { const it = e.target.closest('[data-qct]'); if (it) { S.setTime(+it.dataset.qct); S.closeModal(); } });
    $('#qcfix') && ($('#qcfix').onclick = () => runQc({ fix: true }));
    $('#qcagain').onclick = () => runQc({ fix: false });
    $('#qcundo') && ($('#qcundo').onclick = async () => {
      const r = await S.api('/api/qc/undo', {}); if (r.error) return S.toast(r.error);
      await S.reload(); await load(); S.toast('Đã hoàn tác các sửa đổi của QC'); showResult(); rerender();
    });
  }

  // ---------- variants ----------
  async function runVariants() {
    const kind = $('#vakind')?.value || 'hook', exp = $('#vaexp')?.checked;
    if (dirty()) await S.saveNow();
    const r = await S.api('/api/variants/run', { n: 3, kind, export: !!exp });
    if (!r.ok) return S.toast(r.error || 'Đang có tác vụ khác chạy');
    S.modal(`<h3><i class="ti ti-versions"></i> Đang tạo 3 phiên bản…</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre>
      <p class="muted">Mỗi phiên bản là một dự án riêng nằm cạnh dự án này${exp ? ', có xuất video (720p) để so sánh' : ''}.</p>`);
    S.pollJob(async j => {
      if (j.state !== 'done') return S.modal(`<h3>Lỗi tạo phiên bản</h3><p>${esc(j.error || j.step)}</p><pre>${esc((j.log || '').slice(-1200))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      await loadVa(); showVariants(); rerender();
    });
  }
  const vfile = (dir, f) => `/api/variants/file?dir=${encodeURIComponent(dir)}&f=${encodeURIComponent(f)}`;
  function showVariants() {
    const v = va; if (!v) return S.toast('Chưa có phiên bản nào');
    const cols = [{ dir: v.base, name: 'Gốc', desc: 'Dự án ban đầu', hook: v.base_hook, still: v.base_still, video: v.base_video }, ...v.variants];
    S.modal(`<h3><i class="ti ti-versions"></i> So sánh ${v.variants.length} phiên bản <span class="muted" style="font-weight:400;font-size:12px">· ${esc(v.kind_vi || v.kind)}</span></h3>
      <div class="va-grid" style="--n:${cols.length}">${cols.map(c => `<div class="va-col ${c.dir === v.current ? 'cur' : ''}">
        ${c.video ? `<video src="${vfile(c.dir, c.video)}" ${c.still ? `poster="${vfile(c.dir, c.still)}"` : ''} muted loop playsinline controls preload="metadata"></video>` : c.still ? `<img src="${vfile(c.dir, c.still)}">` : '<div class="muted">chưa có ảnh</div>'}
        <b>${esc(c.name)}</b>${c.hook ? `<span class="hk">“${esc(c.hook)}”</span>` : ''}<p>${esc(c.desc || '')}</p>
        ${c.dir === v.current ? '<button class="mini" disabled>Đang mở</button>' : `<button class="mini" data-vaopen="${esc(c.dir)}"><i class="ti ti-folder-open"></i> Mở</button>`}</div>`).join('')}</div>
      <div class="actions"><button id="vaplay"><i class="ti ti-player-play"></i> Phát cùng lúc</button><button onclick="closeModal()">Đóng</button></div>`);
    $('#vaplay').onclick = () => { for (const vd of document.querySelectorAll('#modalbox video')) { vd.currentTime = 0; vd.play().catch(() => {}); } };
    $('#modalbox .va-grid').addEventListener('click', async e => {
      const b = e.target.closest('[data-vaopen]'); if (!b) return;
      if (dirty()) await S.saveNow();
      const r = await S.api('/api/variants/open', { dir: b.dataset.vaopen });
      if (r.ok) location.reload(); else S.toast(r.error || 'Không mở được');
    });
  }

  // ---------- AI panel cards (inserted whenever 20_ai.js renders its "Dựng giúp" tab) ----------
  function cards() {
    const q = last, v = va;
    return `<div class="ai-card" id="qcbox"><h4><i class="ti ti-shield-check"></i> Kiểm tra chất lượng</h4>
      <p>Máy dò chữ tràn khung, graphic che mặt, phụ đề bị đè, đoạn trống > 6 giây, phụ đề quá dài, file thiếu, hook, độ to âm thanh; rồi Claude xem các khung hình để soi hook, chính tả, nhịp.</p>
      ${q ? `<div class="qc-score" style="margin:6px 0">${ring(q.score)}<div class="qc-sum">${q.issues.length} vấn đề${q.counts?.fixed ? `, đã sửa ${q.counts.fixed}` : ''}<br><span class="muted">${new Date(q.created).toLocaleString('vi-VN')}</span></div></div>` : ''}
      <label class="ai-row" style="cursor:pointer"><input type="checkbox" id="qcclaude" style="flex:none" checked><span>Nhờ Claude xem khung hình <span class="muted">· chậm hơn</span></span></label>
      <div class="acts"><button class="mini" data-qc="run"><i class="ti ti-search"></i> Kiểm tra</button><button class="mini primary" data-qc="fix"><i class="ti ti-wand"></i> Kiểm tra & tự sửa</button>
      ${q ? '<button class="mini" data-qc="show"><i class="ti ti-list-details"></i> Kết quả</button>' : ''}</div></div>
      <div class="ai-card" id="vabox"><h4><i class="ti ti-versions"></i> Nhiều phiên bản (A/B)</h4>
      <p>Tạo 3 dự án anh em với hook mở đầu khác nhau (Claude viết) và/hoặc gói style khác nhau, để đăng thử xem bản nào giữ chân người xem tốt hơn.</p>
      <div class="ai-row"><select id="vakind"><option value="hook">Khác hook mở đầu</option><option value="style">Khác gói style</option><option value="both">Khác cả hai</option></select></div>
      <label class="ai-row" style="cursor:pointer"><input type="checkbox" id="vaexp" style="flex:none"><span>Xuất luôn video 720p để so sánh</span></label>
      <div class="acts"><button class="mini primary" data-qc="variants"><i class="ti ti-copy"></i> Tạo 3 phiên bản</button>${v ? '<button class="mini" data-qc="compare"><i class="ti ti-columns-3"></i> So sánh</button>' : ''}</div></div>`;
  }
  function inject() {
    const lib = $('#libbody'); if (!lib || !lib.querySelector('[data-ai="open"]') || lib.querySelector('#qcbox')) return;
    lib.insertAdjacentHTML('beforeend', cards());
  }
  function rerender() { const a = $('#qcbox'), b = $('#vabox'); if (a) { a.remove(); b?.remove(); inject(); } }
  new MutationObserver(inject).observe($('#libbody'), { childList: true });
  $('#libbody').addEventListener('click', e => {
    const b = e.target.closest('[data-qc]'); if (!b) return;
    const a = b.dataset.qc, claude = $('#qcclaude')?.checked !== false;
    if (a === 'run') runQc({ fix: false, claude });
    if (a === 'fix') runQc({ fix: true, claude });
    if (a === 'show') { if (last) showResult(); }
    if (a === 'variants') runVariants();
    if (a === 'compare') loadVa().then(showVariants);
  });

  // ---------- export dialog: "AI kiểm tra & sửa trước khi xuất" ----------
  new MutationObserver(() => {
    const box = $('#modalbox'); if (!box) return;
    if (box.querySelector('#xgo') && !box.querySelector('#qcx')) {
      const act = box.querySelector('.actions');
      act?.insertAdjacentHTML('beforebegin', `<label class="qcx"><input type="checkbox" id="qcx" ${saved?.qc ? 'checked' : ''}><span><b>AI kiểm tra & sửa trước khi xuất</b><br><small>Tự sửa chữ tràn khung, graphic che mặt, đoạn trống, phụ đề dài…; Claude soát chính tả và hook. Hoàn tác được.</small></span></label>`);
      if (saved && passQc) { // re-opened by us after the QC run: restore the form, then export
        const q = box.querySelector(`[name=xq][value="${saved.quality}"]`); if (q) q.checked = true;
        if ($('#xfrom')) $('#xfrom').value = saved.from; if ($('#xto')) $('#xto').value = saved.to;
        for (const i of box.querySelectorAll('[name=xasp]')) i.checked = saved.aspects.includes(i.value);
        setTimeout(() => $('#xgo')?.click(), 0);
      }
    }
    // QC card in the "Xuất xong" dialog
    if (exportQc && box.querySelector('h3 .ti-circle-check') && !box.querySelector('#qcdone')) {
      const q = exportQc; exportQc = null;
      box.querySelector('.actions')?.insertAdjacentHTML('beforebegin', `<div class="ai-card" id="qcdone"><h4><i class="ti ti-shield-check"></i> AI đã kiểm tra trước khi xuất</h4>
        <div class="qc-score">${q.after != null ? `${ring(q.before)}<i class="ti ti-arrow-right" style="color:var(--tx3)"></i>${ring(q.after)}` : ring(q.score)}
        <div class="qc-sum">Đã sửa ${q.counts?.fixed || 0}/${q.issues.length} vấn đề${q.counts?.high ? ` · còn ${q.counts.high} lỗi nặng` : ''}.<br><a href="#" id="qcdetail">Xem chi tiết</a></div></div></div>`);
      $('#qcdetail').onclick = e => { e.preventDefault(); showResult(); };
    }
  }).observe($('#modalbox'), { childList: true, subtree: false });
  document.addEventListener('click', e => {
    if (!e.target.closest?.('#xgo')) return;
    if (passQc) { passQc = false; saved = null; return; } // second pass: let studio.js export
    if (!$('#qcx')?.checked) return;
    e.preventDefault(); e.stopImmediatePropagation();
    saved = { qc: true, quality: document.querySelector('[name=xq]:checked')?.value || '1080', from: $('#xfrom')?.value || '', to: $('#xto')?.value || '',
      aspects: [...document.querySelectorAll('[name=xasp]:checked')].map(i => i.value) };
    runQc({ fix: true, claude: true, after: q => { exportQc = q; passQc = true; $('#export').click(); } });
  }, true);

  S.onReady(() => { load().then(rerender); loadVa().then(rerender); });
})();
