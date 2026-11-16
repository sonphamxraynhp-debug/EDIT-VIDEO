// "Tạo style" (references/style-lab.md): clone a style from any edited reference video, or create one from a description.
// Claude Code CLI writes a new pack + template + Claude skill; the server validates it in the engine before installing.
'use strict';
(() => {
  const S = Studio;
  const css = document.createElement('style');
  css.textContent = `
  .sl-card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r); padding: 10px 12px; margin: 8px 0; }
  .sl-card h4 { margin: 0 0 6px; font-size: 12.5px; display: flex; gap: 6px; align-items: center; }
  .sl-card p { margin: 4px 0; color: var(--tx2); line-height: 1.5; }
  .sl-kv { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0; }
  .sl-kv span { background: var(--bg3); border: 1px solid var(--line2); border-radius: 999px; padding: 2px 8px; font-size: 11px; color: var(--tx2); }
  .sl-sw { display: flex; gap: 3px; margin: 6px 0; } .sl-sw i { flex: 1; height: 22px; border-radius: 4px; border: 1px solid rgba(255,255,255,.08); }
  .sl-sheet { width: 100%; border-radius: 6px; border: 1px solid var(--line2); cursor: zoom-in; background: #000; display: block; }
  .sl-nav { display: flex; gap: 4px; justify-content: center; margin-top: 4px; } .sl-nav button { padding: 2px 8px; font-size: 11px; }
  .sl-nav button.on { border-color: var(--acc-line); color: var(--tx); }
  .sl-drop { border: 1px dashed var(--line3); border-radius: var(--r); padding: 14px 10px; text-align: center; color: var(--tx3); cursor: pointer; }
  .sl-drop:hover, .sl-drop.over { border-color: var(--acc-line); color: var(--tx2); background: var(--acc-soft); }
  .sl-row { display: flex; gap: 6px; align-items: center; margin: 6px 0; } .sl-row > * { flex: 1; min-width: 0; }
  .sl-prog .bar { height: 5px; background: var(--bg4); border-radius: 3px; overflow: hidden; margin: 8px 0 4px; } .sl-prog .bar i { display: block; height: 100%; background: var(--acc); transition: width .4s; }
  .sl-steps { margin: 6px 0 0; padding: 0; list-style: none; font-size: 11.5px; color: var(--tx3); } .sl-steps li { padding: 2px 0; } .sl-steps li.on { color: var(--tx); } .sl-steps li.ok { color: var(--ok); }
  .sl-err { color: var(--bad); white-space: pre-wrap; font-size: 12px; }
  .sl-vid { width: 100%; max-height: 340px; border-radius: 6px; background: #000; display: block; border: 1px solid var(--line2); }
  .sl-thumbs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 6px 0; } .sl-thumbs img { width: 100%; border-radius: 4px; border: 1px solid var(--line2); cursor: zoom-in; }
  .sl-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; } .sl-acts button { flex: 1 1 auto; }
  .sl-spec { max-height: 260px; overflow: auto; white-space: pre-wrap; font-size: 11px; color: var(--tx2); background: var(--bg1); border-radius: 6px; padding: 8px; margin: 6px 0 0; }
  .sl-mine { display: flex; gap: 8px; align-items: center; padding: 6px; border: 1px solid var(--line); border-radius: var(--rs); margin: 4px 0; background: var(--bg1); }
  .sl-mine img { width: 40px; height: 56px; object-fit: cover; border-radius: 4px; background: #000; flex: none; }
  .sl-mine .tx { flex: 1; min-width: 0; } .sl-mine .tx b { display: block; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sl-mine .tx small { color: var(--tx3); font-size: 10.5px; } .sl-mine button.icon { width: 26px; height: 26px; flex: none; }
  .sl-imgs { display: flex; gap: 4px; flex-wrap: wrap; margin: 4px 0; } .sl-imgs img { width: 46px; height: 46px; object-fit: cover; border-radius: 4px; }`;
  document.head.appendChild(css);

  const FONTS = ['', 'Be Vietnam Pro', 'Montserrat', 'Inter', 'Playfair Display', 'DM Serif Display', 'Bungee', 'Lexend', 'Oswald', 'Nunito', 'Pacifico'];
  const STEPS = { clone: ['Phân tích video (cắt cảnh, màu, chữ, lời, nhạc)', 'Claude xem contact sheet + viết gói', 'Kiểm tra gói trong engine (sửa tối đa 2 vòng)', 'Cài gói, template, skill, video xem trước'],
    describe: ['Claude thiết kế style + viết gói', 'Kiểm tra gói trong engine (sửa tối đa 2 vòng)', 'Cài gói, template, skill, video xem trước'] };
  const st = { tab: 'clone', w: null, an: null, sheet: 0, src: '', job: null, kind: null, result: null, styles: null, check: null, d: { desc: '', orient: 'vertical', industry: '', colors: '', font: '', images: [] }, name: '', model: 'default', timer: null };
  const $b = () => document.getElementById('libbody');
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const fileUrl = (w, f) => `/api/stylelab/file?w=${encodeURIComponent(w)}&f=${encodeURIComponent(f)}`;

  async function loadStyles() { st.styles = await S.api('/api/stylelab/list').catch(() => []); if (st.visible) render(); }
  async function checkCli() { st.check = await S.api('/api/stylelab/check').catch(e => ({ error: e.message })); if (st.visible) render(); }

  function render() {
    const b = $b(); if (!b) return;
    if (st.visible && b.querySelector('#sltab')) save(); // keep what the user typed when the panel re-renders
    st.visible = true;
    if (!st.styles) loadStyles();
    if (!st.check) checkCli();
    const running = st.job && st.job.state === 'running';
    b.innerHTML = `<div class="seg" id="sltab">${[['clone', 'ti-movie', 'Clone từ video'], ['describe', 'ti-writing', 'Từ mô tả']].map(([k, i, l]) => `<button data-t="${k}" class="${st.tab === k ? 'on' : ''}"><i class="ti ${i}"></i> ${l}</button>`).join('')}</div>
      ${st.check?.error ? `<div class="sl-card"><p class="sl-err"><i class="ti ti-alert-triangle"></i> ${S.esc(st.check.error)}</p></div>` : ''}
      ${running || (st.job && st.job.state === 'error' && !st.result) ? progCard() : ''}
      ${!running && st.result ? resultCard(st.result) : ''}
      ${st.tab === 'clone' ? cloneTab(running) : descTab(running)}
      <div class="sl-card"><h4><i class="ti ti-dna-2"></i> Style của tôi ${st.styles ? `<span class="muted">(${st.styles.length})</span>` : ''}</h4>
        ${!st.styles ? '<p class="muted">Đang tải…</p>' : !st.styles.length ? '<p class="muted">Chưa có style nào. Clone từ một video bạn thích, hoặc mô tả style bạn muốn.</p>' : st.styles.map(mineRow).join('')}</div>`;
    bind();
  }
  const opts = running => `<div class="sl-row"><input id="slname" placeholder="Tên style (tuỳ chọn)" value="${S.esc(st.name)}" ${running ? 'disabled' : ''}>
      <select id="slmodel" title="Model Claude" ${running ? 'disabled' : ''}>${[['default', 'Model mặc định của CLI'], ['sonnet', 'Sonnet (nhanh)'], ['opus', 'Opus (kỹ hơn)']].map(([v, l]) => `<option value="${v}" ${st.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  function cloneTab(running) {
    const an = st.an;
    return `<div class="sl-card"><h4><i class="ti ti-movie"></i> Video mẫu đã edit (TikTok / Reels / YouTube)</h4>
      <p class="muted" style="font-size:11.5px">Đưa vào video bất kỳ có style bạn thích. Máy phân tích cắt cảnh, màu, vị trí chữ, lời nói, nhạc; Claude xem contact sheet rồi viết một gói style mới tái tạo phong cách đó (không chép logo/nội dung).</p>
      <div class="sl-drop" id="sldrop"><i class="ti ti-upload"></i> Kéo thả hoặc bấm để chọn video<input type="file" id="slfile" accept="video/*" hidden></div>
      <div class="sl-row"><input id="slpath" placeholder="…hoặc đường dẫn: ~/Downloads/video.mp4" value="${S.esc(st.src)}" ${running ? 'disabled' : ''}><button id="slan" style="flex:none" ${running ? 'disabled' : ''}><i class="ti ti-scan"></i> Phân tích</button></div>
      ${an ? anCard(an) + opts(running) + `<button class="primary" id="slgo" style="width:100%" ${running || st.check?.error ? 'disabled' : ''}><i class="ti ti-sparkles"></i> Tạo style bằng Claude</button>
        <p class="muted" style="font-size:11px;margin-top:6px">Mất khoảng 2–8 phút (Claude CLI trên máy bạn, dùng gói Claude của bạn). Gói chỉ được cài khi qua kiểm tra trong engine.</p>` : ''}</div>`;
  }
  function anCard(an) {
    const sh = an.sheets || [], cur = sh[st.sheet] || sh[0];
    const tz = (an.text_zones || [])[0];
    return `<div style="margin-top:8px">${cur ? `<img class="sl-sheet" id="slsheet" src="${fileUrl(st.w, cur.file)}" title="Contact sheet ${cur.from}s–${cur.to}s (bấm để phóng to)">
        <div class="sl-nav">${sh.map((s, i) => `<button data-sh="${i}" class="${i === st.sheet ? 'on' : ''}">${Math.round(s.from)}–${Math.round(s.to)}s</button>`).join('')}</div>` : ''}
      <div class="sl-sw" title="Bảng màu chủ đạo">${(an.palette || []).slice(0, 6).map(p => `<i style="background:${p.hex}" title="${p.hex} · ${Math.round(p.share * 100)}%"></i>`).join('')}${(an.accents || []).slice(0, 3).map(p => `<i style="background:${p.hex};flex:.6" title="nhấn ${p.hex}"></i>`).join('')}</div>
      <div class="sl-kv"><span>${S.fmt(an.duration)} · ${an.aspect}</span><span>${an.n_cuts} cắt cảnh · ${an.cut_rate_per_min}/phút</span><span>cảnh TB ${an.avg_shot_s}s</span>
        <span>${an.audio?.music_likely ? `có nhạc${an.audio.bpm ? ' ~' + Math.round(an.audio.bpm) + ' BPM' : ''}` : 'ít/không nhạc'}</span><span>lời nói ${Math.round(an.speech_ratio * 100)}%</span>
        ${tz ? `<span>chữ ở ${Math.round(tz.y0 * 100)}–${Math.round(tz.y1 * 100)}% chiều cao</span>` : ''}${an.audio?.transients?.length ? `<span>${an.audio.transients.length} tiếng động mạnh</span>` : ''}</div>
      ${an.text_zones_image ? `<details><summary class="muted" style="font-size:11px;cursor:pointer">Vùng chữ / phụ đề</summary><img class="sl-sheet" src="${fileUrl(st.w, an.text_zones_image)}"></details>` : ''}</div>`;
  }
  function descTab(running) {
    const d = st.d;
    return `<div class="sl-card"><h4><i class="ti ti-writing"></i> Mô tả style bạn muốn</h4>
      <textarea id="sldesc" rows="5" placeholder="VD: Video bất động sản sang trọng tông đen – vàng gold, chữ serif, intro tên dự án, thẻ giá, bản đồ vị trí, CTA gọi điện" ${running ? 'disabled' : ''}>${S.esc(d.desc)}</textarea>
      <div class="seg" id="slor" style="margin-top:6px">${[['vertical', 'Dọc 9:16'], ['horizontal', 'Ngang 16:9']].map(([k, l]) => `<button data-o="${k}" class="${d.orient === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="sl-row"><input id="slind" placeholder="Ngành (BĐS, mỹ phẩm…)" value="${S.esc(d.industry)}"><input id="slcol" placeholder="Màu thương hiệu: #111111, #C9A44C" value="${S.esc(d.colors)}"></div>
      <div class="sl-row"><select id="slfont">${FONTS.map(f => `<option value="${f}" ${d.font === f ? 'selected' : ''}>${f || 'Font: để Claude chọn'}</option>`).join('')}</select>
        <button id="slimg" style="flex:none"><i class="ti ti-photo-plus"></i> Ảnh tham khảo</button><input type="file" id="slimgf" accept="image/*" multiple hidden></div>
      ${d.images.length ? `<div class="sl-imgs">${d.images.map((f, i) => `<img src="${f.url}" title="Bấm để bỏ" data-rmimg="${i}">`).join('')}</div>` : ''}
      ${opts(running)}<button class="primary" id="slgo" style="width:100%" ${running || st.check?.error ? 'disabled' : ''}><i class="ti ti-sparkles"></i> Tạo style bằng Claude</button>
      <p class="muted" style="font-size:11px;margin-top:6px">Claude viết gói style + template + skill; mất khoảng 2–8 phút (Sonnet nhanh hơn).</p></div>`;
  }
  function progCard() {
    const j = st.job, steps = STEPS[st.kind] || [], p = j.progress || 0;
    const si = st.kind === 'analyze' ? -1 : st.kind === 'clone' ? (p < .23 ? 0 : p < .61 ? 1 : p < .87 ? 2 : 3) : (p < .61 ? 0 : p < .87 ? 1 : 2);
    const el = (Date.now() - (j.started || Date.now())) / 1000;
    return `<div class="sl-card sl-prog"><h4>${j.state === 'error' ? '<i class="ti ti-alert-triangle" style="color:var(--bad)"></i> Chưa tạo được' : '<i class="ti ti-loader-2 spin"></i> ' + (st.kind === 'analyze' ? 'Đang phân tích video' : 'Đang tạo style')}<span class="muted" style="margin-left:auto">${mmss(el)}</span></h4>
      ${j.state === 'error' ? `<p class="sl-err">${S.esc(j.step)}</p>` : `<div class="bar"><i style="width:${Math.round(p * 100)}%"></i></div><div class="muted" id="slstep" style="font-size:11.5px">${S.esc(j.step || '')}</div>
      ${si >= 0 ? `<ul class="sl-steps">${steps.map((s, i) => `<li class="${i < si ? 'ok' : i === si ? 'on' : ''}"><i class="ti ${i < si ? 'ti-check' : i === si ? 'ti-point-filled' : 'ti-point'}"></i> ${s}</li>`).join('')}</ul>` : ''}
      <div class="sl-acts"><button id="slcancel"><i class="ti ti-player-stop"></i> Dừng</button></div>`}</div>`;
  }
  function resultCard(r) {
    if (!r.ok) return `<div class="sl-card"><h4><i class="ti ti-alert-triangle" style="color:var(--bad)"></i> Chưa tạo được style</h4><p class="sl-err">${S.esc(r.error || 'Lỗi không rõ')}</p>
      ${r.validation?.problems?.length ? `<ul class="sl-steps">${r.validation.problems.slice(0, 8).map(p => `<li>• ${S.esc(p)}</li>`).join('')}</ul>` : ''}
      ${r.stills?.length ? `<div class="sl-thumbs">${r.stills.slice(0, 8).map(s => `<img src="${fileUrl(st.w, s)}">`).join('')}</div>` : ''}</div>`;
    const v = r.files?.preview?.ok ? `/templates/previews/${encodeURIComponent(r.id)}.mp4?${Date.now()}` : null;
    return `<div class="sl-card"><h4><i class="ti ti-circle-check" style="color:var(--ok)"></i> ${S.esc(r.name)} <span class="muted" style="margin-left:auto;font-weight:400">${mmss(r.sec || 0)}</span></h4>
      ${v ? `<video class="sl-vid" src="${v}" autoplay loop muted playsinline></video>` : ''}
      ${r.meta?.summary ? `<p>${S.esc(r.meta.summary)}</p>` : ''}
      <div class="sl-kv"><span>gói ${S.esc(r.id)}</span><span>${r.validation?.meta?.items?.length || 0} graphic</span><span>${r.validation?.recipe?.scenes || 0} cảnh tự dựng</span><span>${r.turns?.length > 1 ? `${r.turns.length - 1} vòng sửa` : 'qua kiểm tra ngay'}</span></div>
      ${r.seen ? `<p class="muted" style="font-size:11.5px"><i class="ti ti-eye"></i> Claude thấy: ${S.esc(r.seen)}</p>` : ''}
      ${r.compare ? `<details><summary class="muted" style="font-size:11px;cursor:pointer">So sánh: video mẫu (trên) · style mới (dưới)</summary><img class="sl-sheet" src="${fileUrl(st.w, r.compare)}"></details>` : ''}
      <details><summary class="muted" style="font-size:11px;cursor:pointer">Style spec</summary><div class="sl-spec">${S.esc(r.spec || '')}</div></details>
      <div class="sl-acts"><button class="primary" data-apply="${S.esc(r.id)}"><i class="ti ti-wand"></i> Áp dụng cho dự án</button><button data-lib="${S.esc(r.id)}"><i class="ti ti-layout-grid"></i> Mở trong thư viện mẫu</button><button data-del="${S.esc(r.id)}" title="Xoá style"><i class="ti ti-trash"></i></button></div>
      ${r.files?.skill ? `<p class="muted" style="font-size:10.5px;margin-top:6px">Skill Claude Code: ${S.esc(r.files.skill.replace(/^\/Users\/[^/]+/, '~'))}</p>` : ''}</div>`;
  }
  const mineRow = s => `<div class="sl-mine">${s.thumb ? `<img src="${s.thumb}">` : '<img>'}<div class="tx"><b>${S.esc(s.name)}</b><small>${s.kind === 'clone' ? 'clone từ video' : 'từ mô tả'} · ${S.esc(s.aspect)} · ${S.esc(String(s.created || '').slice(0, 10))}</small></div>
    <button class="icon" data-apply="${S.esc(s.id)}" title="Áp dụng cho dự án"><i class="ti ti-wand"></i></button><button class="icon" data-lib="${S.esc(s.id)}" title="Mở trong thư viện mẫu"><i class="ti ti-layout-grid"></i></button><button class="icon" data-del="${S.esc(s.id)}" title="Xoá style"><i class="ti ti-trash"></i></button></div>`;

  function bind() {
    const b = $b(), q = s => b.querySelector(s);
    q('#sltab').onclick = e => { const x = e.target.closest('[data-t]'); if (x) { save(); st.tab = x.dataset.t; render(); } };
    b.onclick = e => {
      let x;
      if ((x = e.target.closest('[data-apply]'))) return applyStyle(x.dataset.apply);
      if ((x = e.target.closest('[data-lib]'))) return openLib(x.dataset.lib);
      if ((x = e.target.closest('[data-del]'))) return delStyle(x.dataset.del);
      if ((x = e.target.closest('[data-sh]'))) { st.sheet = +x.dataset.sh; return render(); }
      if ((x = e.target.closest('[data-rmimg]'))) { save(); st.d.images.splice(+x.dataset.rmimg, 1); return render(); }
      if (e.target.matches('.sl-sheet, .sl-thumbs img')) return S.modal(`<img src="${e.target.src}" style="max-width:100%;max-height:80vh;display:block;margin:auto"><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
    };
    q('#slcancel') && (q('#slcancel').onclick = () => S.api('/api/job/cancel', {}).then(() => S.toast('Đã dừng')));
    if (st.tab === 'clone') {
      const drop = q('#sldrop'), fi = q('#slfile');
      drop.onclick = () => fi.click();
      fi.onchange = () => fi.files[0] && upload(fi.files[0]);
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) upload(f); };
      q('#slan').onclick = () => { st.src = q('#slpath').value.trim(); if (!st.src) return S.toast('Chọn video hoặc nhập đường dẫn'); analyze(st.src); };
    } else {
      q('#slor').onclick = e => { const x = e.target.closest('[data-o]'); if (x) { save(); st.d.orient = x.dataset.o; render(); } };
      q('#slimg').onclick = () => q('#slimgf').click();
      q('#slimgf').onchange = async () => { save(); for (const f of [...q('#slimgf').files].slice(0, 4 - st.d.images.length)) { const r = await put(f); if (r.path) st.d.images.push({ path: r.path, url: URL.createObjectURL(f) }); } render(); };
    }
    q('#slgo') && (q('#slgo').onclick = generate);
  }
  function save() {
    const b = $b(), v = s => b.querySelector(s)?.value;
    if (v('#slname') != null) st.name = v('#slname').trim(); if (v('#slmodel')) st.model = v('#slmodel');
    if (st.tab === 'describe' && b.querySelector('#sldesc')) Object.assign(st.d, { desc: v('#sldesc'), industry: v('#slind').trim(), colors: v('#slcol').trim(), font: v('#slfont') });
    if (st.tab === 'clone' && b.querySelector('#slpath')) st.src = v('#slpath').trim();
  }
  const put = f => fetch('/api/stylelab/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f }).then(r => r.json());
  async function upload(f) {
    S.toast(`Đang tải lên ${f.name} (${(f.size / 1e6).toFixed(1)} MB)…`);
    const r = await put(f).catch(e => ({ error: e.message }));
    if (!r.path) return S.toast('Tải lên lỗi: ' + (r.error || ''));
    st.src = r.path; analyze(r.path);
  }
  async function analyze(p) {
    st.result = null; st.an = null;
    const r = await S.api('/api/stylelab/analyze', { path: p });
    if (!r.ok) return S.toast(r.error || 'Không phân tích được');
    st.w = r.w; st.kind = 'analyze'; st.sheet = 0; watch(async j => {
      if (j.state === 'done') { st.an = await S.api('/api/stylelab/analysis?w=' + encodeURIComponent(st.w)); st.job = null; }
      render();
    });
  }
  async function generate() {
    save();
    const body = { mode: st.tab, name: st.name, model: st.model };
    if (st.tab === 'clone') { if (!st.w || !st.an) return S.toast('Phân tích video trước'); body.w = st.w; }
    else { if (!st.d.desc?.trim()) return S.toast('Hãy mô tả style bạn muốn'); Object.assign(body, { desc: st.d.desc, orient: st.d.orient, industry: st.d.industry, colors: st.d.colors, font: st.d.font, images: st.d.images.map(i => i.path) }); }
    const r = await S.api('/api/stylelab/generate', body);
    if (!r.ok) return S.toast(r.error || 'Không chạy được');
    st.w = r.w; st.kind = st.tab; st.result = null;
    watch(async j => {
      st.result = await S.api('/api/stylelab/result?w=' + encodeURIComponent(st.w));
      if (st.result.none) st.result = { ok: false, error: j.step };
      if (st.result.ok) { st.job = null; S.toast(`Đã tạo style “${st.result.name}”`); await loadPack(st.result.id, true); refreshTemplates(); }
      else if (j.state === 'error') st.result.error = j.step || st.result.error;
      st.styles = null; render();
    });
  }
  // Poll the shared job (one at a time on the server) and re-render the progress card every second.
  function watch(onDone) {
    clearInterval(st.timer);
    st.job = { state: 'running', progress: 0, step: 'Bắt đầu', started: Date.now() };
    render();
    st.timer = setInterval(async () => {
      const j = await S.api('/api/job').catch(() => null); if (!j || j.kind !== 'stylelab') return;
      st.job = j;
      if (j.state !== 'running') { clearInterval(st.timer); st.timer = null; return onDone(j); }
      if (st.visible && $b()?.querySelector('.sl-prog')) { const c = $b().querySelector('.sl-prog'); const tmp = document.createElement('div'); tmp.innerHTML = progCard(); c.replaceWith(tmp.firstElementChild); $b().querySelector('#slcancel') && ($b().querySelector('#slcancel').onclick = () => S.api('/api/job/cancel', {}).then(() => S.toast('Đã dừng'))); }
    }, 1000);
  }
  // A newly installed pack is injected into the preview iframe (no reload needed); after a reload it comes from packs/user/_all.js.
  function loadPack(id, force) {
    const w = S.win; if (!w?.document) return Promise.resolve(false);
    if (!force && w.PACKS?.some(p => p.id === id)) return Promise.resolve(true);
    if (w.PACKS) for (let i = w.PACKS.length - 1; i >= 0; i--) if (w.PACKS[i].id === id) w.PACKS.splice(i, 1);
    return new Promise(ok => { const s = w.document.createElement('script'); s.src = `/engine/packs/user/${encodeURIComponent(id)}.js?v=${Date.now()}`; s.onload = () => ok(true); s.onerror = () => ok(false); w.document.body.appendChild(s); });
  }
  function refreshTemplates() { try { TEMPLATES = null; } catch {} }
  async function applyStyle(id) {
    if (!S.TL) return S.toast('Mở một dự án trước');
    if (!(await loadPack(id))) return S.toast('Không nạp được gói ' + id);
    const list = await S.api('/api/templates'); const tpl = list.find(t => t.id === id);
    if (!tpl) return S.toast('Không thấy template của style ' + id);
    refreshTemplates();
    await applyTemplate(tpl);
  }
  function openLib(id) { try { TEMPLATES = null; tplCat = 'Tất cả'; } catch {} st.visible = false; openPanel('tpl'); setTimeout(() => { const s = document.getElementById('search'); if (s) { s.value = id; s.dispatchEvent(new Event('input')); } }, 300); }
  async function delStyle(id) {
    if (!confirm(`Xoá style ${id}? Gói, template, spec, video xem trước và skill Claude của style này sẽ bị xoá.`)) return;
    const r = await S.api('/api/stylelab/delete', { id });
    if (!r.ok) return S.toast('Lỗi: ' + (r.error || ''));
    const w = S.win; if (w?.PACKS) for (let i = w.PACKS.length - 1; i >= 0; i--) if (w.PACKS[i].id === id) w.PACKS.splice(i, 1);
    if (st.result?.id === id) st.result = null;
    refreshTemplates(); st.styles = null; S.toast('Đã xoá style ' + id); render();
  }

  S.addPanel('stylelab', 'ti-dna', 'Tạo style', render);
  // other panels re-render #libbody; stop live updates when they do
  document.addEventListener('click', e => { if (e.target.closest('#rail [data-p]') && !e.target.closest('[data-p="stylelab"]')) st.visible = false; }, true);
  S.onReady(() => { fetch('/api/job').then(r => r.json()).then(j => { if (j?.kind === 'stylelab' && j.state === 'running') { st.w = j.w; st.kind = /describe/.test(j.w || '') ? 'describe' : /analyze|^\d+_clone/.test(j.w || '') && j.progress < .3 ? 'analyze' : 'clone'; watch(async jj => { st.result = await S.api('/api/stylelab/result?w=' + encodeURIComponent(st.w)); if (st.result.none) { st.result = null; st.an = await S.api('/api/stylelab/analysis?w=' + encodeURIComponent(st.w)); if (st.an.error) st.an = null; } render(); }); } }).catch(() => {}); });
})();
