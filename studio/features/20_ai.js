// AI tools (references/ai-edit.md): "AI dựng giúp" (Claude plans pack, caption fixes, hook, graphics, music, SFX),
// "Cắt lỗi nói" (fillers / repeats / pauses / false starts) and "Lời thoại" (edit the video by deleting words).
// Every cut is a ripple on TL.clips (split + remove + remapAll from clips.js), so captions, scenes, sfx and music follow.
'use strict';
(() => {
  const S = Studio;
  const css = document.createElement('style');
  css.textContent = `
  .ai-card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r); padding: 10px 12px; margin: 8px 0; }
  .ai-card h4 { margin: 0 0 4px; font-size: 12.5px; display: flex; gap: 6px; align-items: center; }
  .ai-card p { margin: 4px 0; color: var(--tx2); line-height: 1.5; }
  .ai-kv { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0; }
  .ai-kv span { background: var(--bg3); border: 1px solid var(--line2); border-radius: 999px; padding: 2px 8px; font-size: 11px; color: var(--tx2); }
  .ai-drop { color: var(--warn); font-size: 11px; margin: 4px 0 0; padding-left: 16px; }
  .ai-opts label.o { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border: 1px solid var(--line2); border-radius: var(--rs); margin: 4px 0; cursor: pointer; background: var(--bg1); }
  .ai-opts label.o:has(input:checked) { border-color: var(--acc-line); background: var(--acc-soft); }
  .ai-row { display: flex; gap: 8px; align-items: center; margin: 6px 0; } .ai-row > * { flex: 1; min-width: 0; }
  .fl-list { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
  .fl-it { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--line); border-radius: var(--rs); background: var(--bg1); }
  .fl-it.off { opacity: .55; }
  .fl-it .fl-k { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: var(--bg4); color: var(--tx2); flex: none; }
  .fl-it .fl-k.filler { background: rgba(251,191,36,.15); color: var(--warn); } .fl-it .fl-k.repeat { background: var(--acc-soft); color: #CFC8FF; }
  .fl-it .fl-k.pause { background: rgba(45,212,191,.13); color: var(--wave); } .fl-it .fl-k.false_start { background: rgba(248,113,113,.13); color: var(--bad); }
  .fl-it .fl-tx { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fl-it .fl-tx small { display: block; color: var(--tx3); font-size: 10.5px; }
  .fl-it button.icon { width: 26px; height: 26px; flex: none; }
  .tw-wrap { line-height: 2.05; font-size: 13.5px; user-select: none; padding: 4px 0 20px; }
  .tw-wrap .tm { font-size: 10px; color: var(--tx3); margin: 0 4px 0 2px; font-variant-numeric: tabular-nums; cursor: pointer; background: var(--bg2); border-radius: 4px; padding: 1px 4px; }
  .tw-wrap .tm:hover { color: var(--tx); }
  .tw { padding: 2px 2px; border-radius: 4px; cursor: text; transition: background .1s; }
  .tw:hover { background: var(--bg3); }
  .tw.cur { color: #fff; box-shadow: inset 0 -2px 0 var(--acc); }
  .tw.sel { background: rgba(248,113,113,.28); color: #fff; text-decoration: line-through; text-decoration-color: rgba(255,255,255,.5); }
  .tw.hl { color: var(--warn); font-weight: 600; }
  .tw.flag { box-shadow: inset 0 -2px 0 var(--warn); }
  .ai-qc { display: flex; gap: 8px; margin-top: 10px; } .ai-qc figure { margin: 0; flex: 1; text-align: center; font-size: 11px; color: var(--tx3); }
  .ai-qc img { width: 100%; border-radius: 6px; border: 1px solid var(--line2); background: #000; }
  .ai-qc .ph { aspect-ratio: 9/16; border-radius: 6px; border: 1px dashed var(--line3); display: flex; align-items: center; justify-content: center; }
  body.landscape .ai-qc .ph { aspect-ratio: 16/9; }`;
  document.head.appendChild(css);

  const r2 = v => Math.round(v * 100) / 100;
  const GOALS = ['Khoá học', 'Bất động sản', 'Review', 'Chia sẻ', 'Bán hàng', 'Khác'];
  const TONES = ['Tự nhiên', 'Vui nhộn, năng lượng', 'Chuyên nghiệp', 'Truyền cảm hứng', 'Kịch tính', 'Sang trọng, tối giản'];
  const DENS = [['thua', 'Thưa', '5–7 graphic'], ['vua', 'Vừa', '8–11 graphic'], ['day', 'Dày', '12–15 graphic']];
  const packs = () => S.win?.PACKS || [];
  const packName = id => packs().find(p => p.id === id)?.name || id || '—';
  let aiTab = 'build', lastPlan = null, fl = null, flSel = new Set(), flBusy = false;

  // ---------- ripple cut on the main track ----------
  // Cut output-time ranges [[a,b],…]: split clips at the edges, drop the pieces inside, remap everything after. One undo step.
  function cutRanges(ranges, label) {
    if (!TL.clips?.length) migrateClips();
    if (!TL.clips?.length) { S.toast('Dự án chưa có video trên track chính'); return 0; }
    const R = ranges.map(([a, b]) => [Math.max(0, +a), Math.min(clipsTotal(), +b)]).filter(([a, b]) => b - a >= 1 / 30).sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const r of R) { const m = merged[merged.length - 1]; if (m && r[0] <= m[1] + .1) m[1] = Math.max(m[1], r[1]); else merged.push([...r]); }
    if (!merged.length) return 0;
    S.pushUndo();
    let removed = 0;
    for (const [a, b] of merged.reverse()) removed += cutOne(a, b);
    if (!removed) { S.toast('Không cắt được (đoạn quá ngắn)'); return 0; }
    S.changed(true);
    S.toast(`${label || 'Đã cắt'}: bỏ ${merged.length} đoạn, ngắn đi ${removed.toFixed(1)}s`);
    return removed;
  }
  function cutOne(a, b) {
    const tol = 2 / 30 + 1e-6;
    splitClipAt(b); splitClipAt(a);
    const L = clipLayout().filter(k => k.t1 > k.t0);
    const kill = L.filter(k => k.t0 >= a - tol && k.t1 <= b + tol);
    if (!kill.length || kill.length === L.length) return 0;
    const A = Math.min(...kill.map(k => k.t0)), B = Math.max(...kill.map(k => k.t1));
    const dead = new Set(kill.map(k => k.c));
    TL.clips = TL.clips.filter(c => !dead.has(c));
    if (TL.clips[0]) delete TL.clips[0].transition;
    remapAll(fRemove(A, B), [A, B]);
    fixDuration();
    return B - A;
  }
  // Words in output time, flattened from the captions.
  const allWords = () => CAP.filter(c => !c.hidden).flatMap((c, ci) => c.words.map((w, wi) => ({ w, c, ci, wi }))).sort((x, y) => x.w.s - y.w.s);
  // Span to remove for words i..j (indices into allWords): the words + the pause after them, never touching neighbours.
  function wordSpan(W, i, j) {
    const prev = W[i - 1]?.w, next = W[j + 1]?.w, f = W[i].w, l = W[j].w;
    const a = Math.max(prev ? prev.e : 0, f.s - .04);
    const b = next ? Math.min(next.s, Math.max(l.e + .02, next.s - .08)) : l.e + .06;
    return [r2(a), r2(b)];
  }
  // Play [a, b] with a little context, then stop.
  let pvTimer = null;
  function previewRange(a, b) {
    clearInterval(pvTimer);
    if (playing) play();
    S.setTime(Math.max(0, a - .8)); play();
    pvTimer = setInterval(() => { if (!playing || S.T >= b + .4) { clearInterval(pvTimer); if (playing) play(); } }, 50);
  }

  // ---------- AI dựng giúp ----------
  function openAiModal() {
    if (!CAP.length && S.needCaptions) return S.needCaptions(openAiModal, 'AI dựng giúp');
    const cur = TL.pack || 'slate';
    S.modal(`<h3><i class="ti ti-wand"></i> AI dựng giúp</h3>
      <p class="muted" style="margin:2px 0 8px">Claude đọc lời thoại (${CAP.length} dòng phụ đề, ${fmt(TL.duration)}) rồi chọn gói style, sửa phụ đề, viết hook, đặt graphic đúng lúc nói từ khoá, chọn nhạc và SFX. Mất khoảng 20–90 giây. Áp dụng xong vẫn hoàn tác được (⌘Z).</p>
      <div class="row2"><div><label class="lbl">Mục tiêu video</label><select id="aig">${GOALS.map(g => `<option>${g}</option>`).join('')}</select></div>
      <div><label class="lbl">Giọng điệu</label><select id="ait">${TONES.map(g => `<option>${g}</option>`).join('')}</select></div></div>
      <label class="lbl">Gói style</label><div class="ai-opts">
        <label class="o"><input type="radio" name="aip" value="keep" checked> Giữ gói hiện tại <b>${esc(packName(cur))}</b></label>
        <label class="o"><input type="radio" name="aip" value="auto"> Để AI chọn gói hợp nội dung nhất</label>
        <label class="o"><input type="radio" name="aip" value="pick"> Gói khác: <select id="aipk" style="width:auto;flex:1">${packs().filter(p => p.recipe).map(p => `<option value="${p.id}">${p.icon || ''} ${esc(p.name)}</option>`).join('')}</select></label></div>
      <label class="lbl">Mật độ graphic</label><div class="seg" id="aid">${DENS.map(([k, l, s]) => `<button data-d="${k}" class="${k === 'vua' ? 'on' : ''}" title="${s}">${l} <span class="muted">${s}</span></button>`).join('')}</div>
      <label class="lbl">Yêu cầu thêm (tuỳ chọn)</label><textarea id="aix" placeholder="VD: nhấn mạnh con số, CTA là “nhắn tin để nhận tài liệu”, không dùng emoji…"></textarea>
      ${S.autofill ? `<label class="ai-row" style="cursor:pointer"><input type="checkbox" id="aiaf" style="flex:none" ${S.autofill.opts.after_ai !== false ? 'checked' : ''}><span>Tự thêm b-roll + âm thanh sau khi dựng <span class="muted">· panel Tự động</span></span></label>` : ''}
      <p class="muted" style="font-size:11px">Cảnh do AI tạo được đánh dấu; chạy lại sẽ chỉ thay các cảnh AI chưa bị bạn chỉnh. Cảnh bạn đã sửa hoặc tự thêm được giữ nguyên.</p>
      <div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="aigo"><i class="ti ti-sparkles"></i> Dựng</button></div>`);
    $('#aig').value = { course: 'Khoá học', realestate: 'Bất động sản', review: 'Review', share: 'Chia sẻ' }[cur] || 'Khác';
    $('#aid').onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; for (const x of $('#aid').children) x.classList.toggle('on', x === b); };
    $('#aipk').onfocus = () => { document.querySelector('[name=aip][value=pick]').checked = true; };
    $('#aigo').onclick = startAi;
  }
  async function startAi() {
    if (!CAP.length) return S.needCaptions(openAiModal, 'AI dựng giúp');
    const pm = document.querySelector('[name=aip]:checked').value;
    const body = { goal: $('#aig').value, tone: $('#ait').value, pack: pm === 'pick' ? $('#aipk').value : pm, density: $('#aid .on')?.dataset.d || 'vua', extra: $('#aix').value.trim() };
    const af = !!$('#aiaf')?.checked; if (S.autofill && $('#aiaf')) S.autofill.afterAi = af;
    await S.saveNow();
    const r = await S.api('/api/ai/edit', body);
    if (!r.ok) return S.toast(r.error || 'Đang có tác vụ khác chạy');
    S.modal(`<h3><i class="ti ti-sparkles"></i> AI đang dựng…</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre><div class="actions"><button id="aicancel">Dừng</button></div>`);
    $('#aicancel').onclick = () => S.api('/api/job/cancel', {});
    S.pollJob(async j => {
      if (j.state !== 'done') return S.modal(`<h3>AI dựng chưa được</h3><p>${esc(j.step)}</p><pre>${esc((j.log || '').split('\n').filter(l => !l.startsWith('@@')).join('\n').slice(-1200))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      const plan = await S.api('/api/ai/plan');
      if (plan.error) return S.toast(plan.error);
      lastPlan = plan; applyPlan(plan);
      if (af && S.autofill) await S.autofill.run('all', { noUndo: true }); // same undo step as the AI build
      showResult(plan);
    });
  }
  function applyPlan(plan) {
    S.pushUndo();
    const mine = s => (s._ai || s._recipe) && !s._orig;
    if (plan.pack !== TL.pack && TL.fx) TL.fx = TL.fx.filter(f => !f._recipe || f._orig);
    TL.pack = plan.pack; TL.caption_style = plan.caption_style || undefined;
    if (plan.hook) TL.title = plan.hook;
    TL.scenes = [...(TL.scenes || []).filter(s => !mine(s)), ...JSON.parse(JSON.stringify(plan.scenes))];
    TL.audio = TL.audio || {};
    TL.audio.music = [...(TL.audio.music || []).filter(m => !m._ai && !(m.t0 <= .05 && m.t1 >= TL.duration - .1)), { ...plan.music, t1: TL.duration }];
    TL.audio.sfx = [...(TL.audio.sfx || []).filter(x => !x._ai), ...plan.sfx.map(x => ({ ...x }))];
    let n = 0;
    for (const e of plan.captions) {
      const c = CAP.find(x => Math.abs(x.t0 - e.t0) < .02 && x.words.length === e.n);
      if (!c) continue;
      e.words.forEach((w, j) => { const cw = c.words[j]; cw.w = w.w; if (w.hl) cw.hl = true; else delete cw.hl; if (w.br) cw.br = true; else delete cw.br; });
      c.words = c.words.filter(w => w.w); n++;
    }
    CAP = CAP.filter(c => c.words.length);
    plan._applied = n;
    S.changed(true);
  }
  function planCard(plan, full) {
    const kinds = {}; for (const s of plan.scenes.filter(s => !s._base)) kinds[S.typeName(s.type)] = (kinds[S.typeName(s.type)] || 0) + 1;
    return `<div class="ai-card"><h4><i class="ti ti-sparkles" style="color:var(--acc)"></i> ${esc(plan.hook || 'Bản dựng AI')}</h4>
      <div class="ai-kv"><span>Gói: ${esc(packName(plan.pack))}</span><span>${plan.scenes.filter(s => !s._base).length} graphic</span><span>${plan.captions.length} dòng phụ đề sửa</span><span>Nhạc: ${esc(plan.music?.mood || '—')}</span><span>${plan.sfx.length} SFX</span></div>
      ${plan.summary ? `<p>${esc(plan.summary)}</p>` : ''}
      ${full ? `<div class="ai-kv">${Object.entries(kinds).map(([k, v]) => `<span>${esc(k)}${v > 1 ? ' ×' + v : ''}</span>`).join('')}</div>` : ''}
      ${plan.dropped?.length ? `<ul class="ai-drop">${plan.dropped.slice(0, 6).map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}</div>`;
  }
  function qcTimes() {
    const sc = (TL.scenes || []).filter(s => s._ai && !s._base).sort((a, b) => a.t0 - b.t0);
    const pick = sc.length >= 3 ? [sc[0], sc[Math.floor(sc.length / 2)], sc[sc.length - 1]] : sc;
    return pick.map(s => r2(Math.min(s.t1 - .05, s.t0 + Math.min(1, (s.t1 - s.t0) * .5))));
  }
  function showResult(plan) {
    const ts = qcTimes();
    S.modal(`<h3><i class="ti ti-circle-check" style="color:var(--ok)"></i> Đã dựng xong</h3>${planCard(plan, true)}
      <div class="ai-qc" id="aiqc">${ts.map(t => `<figure><div class="ph"><i class="ti ti-photo"></i></div><figcaption>${fmt(t)}</figcaption></figure>`).join('')}</div>
      <div class="actions"><button id="aiundo"><i class="ti ti-arrow-back-up"></i> Hoàn tác</button><button id="aiqcgo"><i class="ti ti-photo-check"></i> Render thử 3 khung</button><button class="primary" onclick="closeModal()">Xem trên timeline</button></div>`);
    $('#aiundo').onclick = () => { undo(); S.closeModal(); S.toast('Đã hoàn tác bản dựng AI'); };
    $('#aiqcgo').onclick = () => renderQc(ts);
  }
  // QC: real stills from the export renderer at three AI scene starts.
  async function renderQc(ts) {
    $('#aiqcgo').disabled = true;
    await S.saveNow();
    const figs = [...document.querySelectorAll('#aiqc figure')];
    for (const [k, t] of ts.entries()) {
      figs[k].querySelector('.ph, img').outerHTML = '<div class="ph"><i class="ti ti-loader-2 spin"></i></div>';
      const r = await S.api('/api/still?t=' + t);
      figs[k].querySelector('.ph').outerHTML = r.out ? `<img src="/project/${esc(r.out)}?${Date.now()}" title="Bấm để tới ${fmt(t)}">` : `<div class="ph" title="${esc(r.error || '')}"><i class="ti ti-alert-triangle" style="color:var(--bad)"></i></div>`;
      const img = figs[k].querySelector('img'); if (img) img.onclick = () => { S.closeModal(); S.setTime(t); };
    }
    $('#aiqcgo').disabled = false;
  }
  function removeAi() {
    const n = (TL.scenes || []).filter(s => s._ai && !s._orig).length;
    if (!n) return S.toast('Không có cảnh AI nào (chưa chỉnh) để xoá');
    S.pushUndo();
    TL.scenes = TL.scenes.filter(s => !s._ai || s._orig);
    if (TL.audio?.sfx) TL.audio.sfx = TL.audio.sfx.filter(x => !x._ai);
    S.changed(true); S.toast(`Đã xoá ${n} cảnh AI`);
  }

  // ---------- Cắt lỗi nói ----------
  const KIND_VI = { filler: 'đệm', repeat: 'lặp', pause: 'ngắt', false_start: 'hỏng' };
  async function detect() {
    const W = allWords().map(x => ({ w: x.w.w, s: x.w.s, e: x.w.e }));
    if (!W.length) return S.needCaptions(null, 'Dò lỗi nói');
    const body = { words: W, pause: +$('#flpause').value || .7, fillers: $('#fllist').value.trim(), claude: $('#flclaude').checked };
    flBusy = true; renderAi();
    const done = res => { flBusy = false; if (res.error) { S.toast('Lỗi dò: ' + res.error); fl = null; } else { fl = res; flSel = new Set(res.cuts.map((c, i) => (c.conf >= .6 ? i : -1)).filter(i => i >= 0)); } renderAi(); };
    if (body.claude) {
      const r = await S.api('/api/ai/fillers', body);
      if (!r.ok) { flBusy = false; renderAi(); return S.toast('Đang có tác vụ khác chạy'); }
      S.modal(`<h3><i class="ti ti-scissors"></i> Đang dò lỗi nói…</h3><div id="jobstep" class="muted"></div><div class="bar"><i></i></div><pre id="joblog"></pre>`);
      S.pollJob(async j => { S.closeModal(); done(j.state === 'done' ? await S.api('/api/ai/fillers') : { error: j.step }); });
    } else done(await S.api('/api/ai/fillers', body));
  }
  function cutSelected() {
    if (!fl) return;
    const list = fl.cuts.filter((c, i) => flSel.has(i));
    if (!list.length) return S.toast('Chưa chọn chỗ nào');
    if (cutRanges(list.map(c => [c.a, c.b]), 'Đã cắt lỗi nói')) { fl = null; flSel.clear(); renderAi(); }
  }

  function renderAi() {
    const seg = `<div class="seg">${[['build', 'Dựng giúp'], ['fix', 'Cắt lỗi nói']].map(([k, l]) => `<button data-aitab="${k}" class="${aiTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    if (aiTab === 'build') {
      const nAi = (TL.scenes || []).filter(s => s._ai && !s._base).length, nEd = (TL.scenes || []).filter(s => s._ai && s._orig).length;
      $('#libbody').innerHTML = seg + (CAP.length ? '' : S.ctaTranscribe('AI dựng giúp')) + `<button class="wide primary" data-ai="open"><i class="ti ti-wand"></i> AI dựng giúp</button>
        <div class="help">Claude đọc lời thoại rồi chọn gói style, sửa lỗi nhận dạng trong phụ đề (giữ nguyên thời gian từng từ), viết hook, đặt 6–15 graphic đúng lúc nói từ khoá, chọn nhạc và SFX. Cần Claude Code (lệnh <b>claude</b>) trên máy.</div>
        ${lastPlan ? planCard(lastPlan, true) : ''}
        <div class="ai-card"><h4><i class="ti ti-info-circle"></i> Trên timeline</h4><p>${nAi} cảnh do AI tạo${nEd ? `, ${nEd} cảnh bạn đã chỉnh (sẽ được giữ khi dựng lại)` : ''}.</p>
        <div class="acts"><button class="mini" data-ai="qc" ${nAi ? '' : 'disabled'}><i class="ti ti-photo-check"></i> Render thử 3 khung</button><button class="mini danger" data-ai="clear" ${nAi ? '' : 'disabled'}><i class="ti ti-trash"></i> Xoá cảnh AI</button></div></div>`;
      if (!lastPlan) S.api('/api/ai/plan').then(p => { if (!p.error && !lastPlan) { lastPlan = p; if (panel === 'ai' && aiTab === 'build') renderAi(); } }).catch(() => {});
      return;
    }
    const list = fl ? fl.cuts.map((c, i) => `<div class="fl-it ${flSel.has(i) ? '' : 'off'}"><input type="checkbox" data-fl="${i}" ${flSel.has(i) ? 'checked' : ''}>
        <span class="fl-k ${c.kind}">${KIND_VI[c.kind] || c.kind}</span><span class="fl-tx">${esc(c.text || c.reason)}<small>${fmt(c.a)} · ${(c.b - c.a).toFixed(2)}s · ${esc(c.reason)}</small></span>
        <button class="icon" data-flplay="${i}" title="Nghe thử đoạn này"><i class="ti ti-player-play"></i></button></div>`).join('') : '';
    const tot = fl ? fl.cuts.filter((c, i) => flSel.has(i)).reduce((a, c) => a + c.b - c.a, 0) : 0;
    $('#libbody').innerHTML = seg + `<div class="help">Dò tiếng đệm (ờ, à, ừm, thì là, kiểu như…), từ/cụm nói lặp liền nhau, chỗ ngắt quá lâu. Cắt sẽ dồn cả video, phụ đề, graphic, SFX như cắt clip trên timeline.</div>
      <div class="ai-row"><div><label class="lbl" style="font-size:11px;color:var(--tx3)">Ngắt quãng dài hơn (giây)</label><input id="flpause" type="number" step=".1" min=".3" value="${$('#flpause')?.value || .7}"></div></div>
      <label class="lbl" style="font-size:11px;color:var(--tx3)">Từ đệm (phẩy ngăn cách, để trống = mặc định)</label><input id="fllist" placeholder="ờ, à, ừ, ừm, ơ, ờm, thì là, kiểu như, nói chung là" value="${esc($('#fllist')?.value || '')}">
      <label class="ai-row" style="cursor:pointer"><input type="checkbox" id="flclaude" style="flex:none" ${$('#flclaude')?.checked ? 'checked' : ''}><span>Nhờ Claude tìm câu nói hỏng (bắt đầu rồi nói lại) <span class="muted">· chậm hơn</span></span></label>
      <button class="wide" data-ai="detect" ${flBusy ? 'disabled' : ''}>${flBusy ? '<i class="ti ti-loader-2 spin"></i> Đang dò…' : '<i class="ti ti-search"></i> Dò lỗi nói'}</button>
      ${fl ? (fl.cuts.length ? `<div class="ai-row"><b>${fl.cuts.length} chỗ</b><span class="muted" style="text-align:right">đã chọn ${flSel.size} · ${tot.toFixed(1)}s</span></div>
        <div class="acts"><button class="mini" data-ai="all">Chọn hết</button><button class="mini" data-ai="none">Bỏ chọn</button></div>
        <div class="fl-list">${list}</div><button class="wide primary" data-ai="cut" ${flSel.size ? '' : 'disabled'}><i class="ti ti-scissors"></i> Cắt tất cả đã chọn</button>`
        : `<div class="empty"><i class="ti ti-mood-check"></i><b>Không thấy lỗi nói</b><span>Lời thoại đã gọn. Có thể bật “Nhờ Claude” để tìm câu nói hỏng.</span></div>`) : ''}
      ${fl?.note ? `<div class="help" style="color:var(--warn)">${esc(fl.note)}</div>` : ''}`;
  }
  S.addPanel('ai', 'ti-sparkles', 'AI', renderAi);
  $('#libbody').addEventListener('click', e => {
    if (panel !== 'ai') return;
    const t = e.target, b = t.closest('[data-aitab],[data-ai],[data-flplay]');
    if (t.matches('[data-fl]')) { const i = +t.dataset.fl; t.checked ? flSel.add(i) : flSel.delete(i); return renderAi(); }
    if (!b) return;
    if (b.dataset.aitab) { aiTab = b.dataset.aitab; return renderAi(); }
    if (b.dataset.flplay) { const c = fl.cuts[+b.dataset.flplay]; return previewRange(c.a, c.b); }
    const a = b.dataset.ai;
    if (a === 'open') openAiModal();
    if (a === 'clear') removeAi();
    if (a === 'qc') { const ts = qcTimes(); S.modal(`<h3><i class="ti ti-photo-check"></i> Render thử</h3><div class="ai-qc" id="aiqc">${ts.map(t => `<figure><div class="ph"></div><figcaption>${fmt(t)}</figcaption></figure>`).join('')}</div><div class="actions"><button id="aiqcgo" hidden></button><button onclick="closeModal()">Đóng</button></div>`); renderQc(ts); }
    if (a === 'detect') detect();
    if (a === 'all' && fl) { flSel = new Set(fl.cuts.map((c, i) => i)); renderAi(); }
    if (a === 'none') { flSel.clear(); renderAi(); }
    if (a === 'cut') cutSelected();
  });
  S.onReady(() => S.addTopButton(`<button class="ghost" id="aibtn" title="Claude đọc lời thoại và dựng graphic, phụ đề, nhạc, SFX"><i class="ti ti-wand"></i> AI dựng giúp</button>`, openAiModal));

  // ---------- Lời thoại: edit the video by deleting words ----------
  let tw = { a: -1, b: -1, drag: false, moved: false }, W = [];
  const selRange = () => (tw.a < 0 ? null : [Math.min(tw.a, tw.b), Math.max(tw.a, tw.b)]);
  function renderWords() {
    W = allWords(); sig = [CAP, TL.duration];
    const flags = new Set();
    if (fl) for (const c of fl.cuts) for (const [k, x] of W.entries()) if (x.w.s >= c.a - .01 && x.w.e <= c.b + .05) flags.add(k);
    $('#libact').innerHTML = `<button class="mini icon" data-transcribe title="Tạo lại lời thoại tự động (Whisper)"><i class="ti ti-microphone"></i></button><button class="mini danger" id="twdel" ${selRange() ? '' : 'disabled'} title="Cắt đoạn đã chọn khỏi video (Delete)"><i class="ti ti-scissors"></i> Xoá đoạn</button>`;
    $('#twdel').onclick = deleteSel;
    if (!W.length) { $('#libbody').innerHTML = S.ctaTranscribe('Sửa video bằng chữ'); return; }
    const sr = selRange();
    // flowing text; a time chip where the speaker pauses (≥ 0.5 s) or every ~40 words
    let html = '', lastE = -9, since = 99;
    for (const [k, x] of W.entries()) {
      if (x.w.s - lastE >= .5 || since >= 40) { html += `${k ? '<br>' : ''}<span class="tm" data-tws="${x.w.s}">${fmt(x.w.s)}</span>`; since = 0; }
      lastE = x.w.e; since++;
      const cls = ['tw', sr && k >= sr[0] && k <= sr[1] ? 'sel' : '', x.w.hl ? 'hl' : '', flags.has(k) ? 'flag' : ''].filter(Boolean).join(' ');
      html += `<span class="${cls}" data-k="${k}">${esc(x.w.w)}</span> `;
    }
    $('#libbody').innerHTML = `<div class="help">Bấm một từ để tua tới đó. Kéo hoặc Shift-bấm để chọn một đoạn, rồi bấm <b>Delete</b> hay “Xoá đoạn” để cắt đoạn đó khỏi video (dồn cả timeline). ${fl ? 'Từ gạch chân vàng = lỗi nói đã dò.' : ''} Hoàn tác bằng ⌘Z.</div>
      <div class="tw-wrap" id="twwrap">${html}</div>`;
    markCur();
  }
  function deleteSel() {
    const r = selRange(); if (!r) return;
    const span = wordSpan(W, r[0], r[1]), txt = W.slice(r[0], r[1] + 1).map(x => x.w.w).join(' ');
    tw = { a: -1, b: -1, drag: false };
    if (cutRanges([span], `Đã xoá “${txt.length > 30 ? txt.slice(0, 30) + '…' : txt}”`)) S.setTime(span[0]);
    renderWords();
  }
  function paintSel() {
    const r = selRange();
    for (const el of document.querySelectorAll('#twwrap .tw')) { const k = +el.dataset.k; el.classList.toggle('sel', !!r && k >= r[0] && k <= r[1]); }
    const d = $('#twdel'); if (d) d.disabled = !r;
  }
  let curK = -1, sig = null;
  function markCur() {
    if (panel !== 'words') return;
    // the captions were replaced (undo, cut, reload): redraw so indices never point at stale words
    if (sig && (sig[0] !== CAP || sig[1] !== TL?.duration) && !tw.drag) { sig = null; tw = { a: -1, b: -1 }; return renderWords(); }
    if (!W.length) return;
    const T = S.T, k = W.findIndex(x => T >= x.w.s - .02 && T < x.w.e + .02);
    if (k === curK && document.querySelector('#twwrap .tw.cur')) return;
    document.querySelector('#twwrap .tw.cur')?.classList.remove('cur');
    curK = k;
    const el = k >= 0 && document.querySelector(`#twwrap .tw[data-k="${k}"]`);
    if (el) { el.classList.add('cur'); if (playing) el.scrollIntoView({ block: 'nearest' }); }
  }
  setInterval(markCur, 120);
  S.addPanel('words', 'ti-file-text', 'Lời thoại', renderWords);
  const lib = $('#libbody');
  lib.addEventListener('mousedown', e => {
    if (panel !== 'words') return;
    const el = e.target.closest('.tw'); if (!el) return;
    e.preventDefault();
    const k = +el.dataset.k;
    if (e.shiftKey && tw.a >= 0) tw.b = k; else tw = { a: k, b: k, drag: true, moved: false };
    paintSel();
  });
  lib.addEventListener('mouseover', e => {
    if (panel !== 'words' || !tw.drag) return;
    const el = e.target.closest('.tw'); if (!el) return;
    const k = +el.dataset.k; if (k !== tw.b) { tw.b = k; tw.moved = true; paintSel(); }
  });
  window.addEventListener('mouseup', e => {
    if (panel !== 'words' || !tw.drag) return;
    tw.drag = false;
    if (!tw.moved && !e.shiftKey && W[tw.a]) S.setTime(W[tw.a].w.s + .001);
  });
  lib.addEventListener('click', e => { if (panel === 'words') { const m = e.target.closest('[data-tws]'); if (m) S.setTime(+m.dataset.tws); } });
  // Delete in the transcript cuts the selected words (capture phase: runs before the editor's own Delete = remove selected element).
  window.addEventListener('keydown', e => {
    if (panel !== 'words' || !selRange() || !['Delete', 'Backspace'].includes(e.key)) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    e.preventDefault(); e.stopImmediatePropagation(); deleteSel();
  }, true);
  window.addEventListener('keydown', e => { if (panel === 'words' && e.key === 'Escape' && selRange()) { tw = { a: -1, b: -1 }; paintSel(); } }, true);

  // For tests / Claude: Studio.ai.cut([[a,b]]) etc.
  S.ai = { cutRanges, wordSpan, allWords, applyPlan, detect: () => detect() };
})();
