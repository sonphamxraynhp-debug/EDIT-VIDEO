// Rail panel "B-roll AI": stock search (Commons/Openverse free, Pexels/Pixabay with the user's key), Claude per-sentence suggestions
// (engine presets from assets/broll/catalog.json or stock queries), AI image generation with the user's own OpenAI/Gemini key.
// Server: studio/routes/60_media.mjs + scripts/ai_broll.mjs. Spec: references/keyframes-mask-broll.md.
(() => {
  const { $, esc, fmt } = Studio;
  const r2 = v => Math.round(v * 100) / 100;
  let tab = 'stock', INS = 'full', KEYS = null, Q = '', KIND = 'photo', RES = null, LOADING = false, SUG = null, PICK = new Set(), GEN = '';
  const vert = () => Studio.DH > Studio.DW;
  const loadKeys = async () => { try { KEYS = (await Studio.api('/api/aikeys')).keys; } catch { KEYS = {}; } };

  // ---------- insert ----------
  function insertMedia(m, t0, t1, meta = {}) {
    const TL = Studio.TL; t0 = r2(Math.max(0, t0)); t1 = r2(Math.min(TL.duration, Math.max(t0 + .5, t1)));
    const s = { type: 'photo', t0, t1, mode: 'full', media: m.kind === 'video' ? { ...m.seq, t0 } : m.path, ...(meta.license ? { credit: `${meta.author || ''} · ${meta.license} · ${meta.provider || ''}` } : {}) };
    TL.scenes.push(s); return s;
  }
  function insertPreset(e, text, t0, t1) {
    const TL = Studio.TL; t0 = r2(Math.max(0, t0)); t1 = r2(Math.min(TL.duration, Math.max(t0 + 1, t1)));
    // Vertical: presets are 16:9, shown through media_card — full-screen cutaway (default) or the default card the user can drag.
    const s = vert() ? { type: 'media_card', t0, t1, ...(INS === 'full' ? { card: { x: 0, y: 0, w: Studio.DW, h: Studio.DH, r: 0 } } : {}), screen: { broll: { id: e.id, ...(text ? { text } : {}) } } }
      : { type: 'broll', t0, t1, layout: 'full', ...Object.fromEntries(Object.entries(e).filter(([k]) => !['id', 'topic', 'tags'].includes(k))), ...(text ? { text } : {}) };
    TL.scenes.push(s); return s;
  }
  async function fetchAndInsert(it, t0, t1) {
    const m = await Studio.api('/api/stock/fetch', { url: it.url, kind: it.kind, name: it.title, dur: Math.min(4, Math.max(2, t1 - t0)), meta: { provider: it.provider, title: it.title, author: it.author, license: it.license, page: it.page } });
    if (m.error) throw new Error(m.error);
    Studio.pushUndo(); const s = insertMedia(m, t0, t1, it);
    if (typeof MEDIA_LOAD === 'function') MEDIA_LOAD();
    return s;
  }

  // ---------- render ----------
  const keyNote = () => {
    const miss = ['pexels', 'pixabay'].filter(k => !KEYS?.[k]);
    return miss.length ? `<div class="abnote"><i class="ti ti-key"></i><div>${miss.map(k => k[0].toUpperCase() + k.slice(1)).join(' và ')} cần API key miễn phí — bấm <b>⚙ Key</b> để dán. Hiện đang tìm trên <b>Wikimedia Commons</b> + <b>Openverse</b> (giấy phép CC: nhớ ghi nguồn; tên tác giả lưu ở media/credits.json).</div></div>` : '';
  };
  function render() {
    if (!KEYS) { loadKeys().then(render); }
    $('#libact').innerHTML = '<button class="icon" id="abkeys" title="API key (Pexels, Pixabay, OpenAI, Gemini)"><i class="ti ti-settings"></i></button>';
    $('#abkeys').onclick = keysModal;
    const seg = `<div class="seg">${[['stock', 'Kho ảnh/video'], ['ai', 'AI gợi ý'], ['gen', 'Tạo ảnh AI']].map(([k, l]) => `<button data-abtab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    let h = '';
    if (tab === 'stock') {
      h = `<div class="abq"><input id="abq" placeholder="VD: văn phòng, robot, city night…" value="${esc(Q)}"><button data-abgo class="primary"><i class="ti ti-search"></i></button></div>
        <div class="chips">${[['photo', 'Ảnh'], ['video', 'Video']].map(([k, l]) => `<button class="chip ${KIND === k ? 'on' : ''}" data-abkind="${k}">${l}</button>`).join('')}</div>${keyNote()}
        ${LOADING ? '<div class="empty"><i class="ti ti-loader-2 abspin"></i><b>Đang tìm…</b></div>' : !RES ? '<div class="empty"><i class="ti ti-photo-search"></i><b>Tìm b-roll thật</b><span>Gõ chủ đề (tiếng Việt hoặc Anh) rồi Enter. Bấm một kết quả để tải về media/ và chèn tại playhead (2,5 s).</span></div>'
          : RES.items.length ? `<div class="help">“${esc(RES.query)}” → <b>${esc(RES.en)}</b> · ${RES.items.length} kết quả</div><div class="abgrid">${RES.items.map((it, i) => `<div class="abcell" data-abi="${i}" title="${esc(it.title)} — ${esc(it.author || '')} (${esc(it.license || '')})">
              <div class="th" style="background-image:url('${esc(it.thumb || '')}')">${it.kind === 'video' ? `<span class="du"><i class="ti ti-player-play-filled"></i>${it.dur ? Math.round(it.dur) + 's' : ''}</span>` : ''}<span class="pv">${esc(it.provider)}</span></div>
              <div class="nm">${esc(it.license || '')}</div></div>`).join('')}</div>`
          : `<div class="empty"><i class="ti ti-mood-empty"></i><b>Không có kết quả</b><span>Thử từ khoá tiếng Anh đơn giản hơn${RES.missing.length ? ', hoặc thêm key Pexels/Pixabay' : ''}.</span></div>`}`;
    } else if (tab === 'ai') {
      h = `<div class="help">Claude đọc phụ đề, chọn câu đáng minh hoạ và đề xuất: <b>b-roll động</b> có sẵn trong thư viện (9.080 preset) hoặc <b>từ khoá ảnh stock</b>. Tick những mục muốn dùng rồi chèn.</div>
        <div class="acts"><button class="primary" data-abact="suggest"><i class="ti ti-sparkles"></i> ${SUG ? 'Gợi ý lại' : 'AI gợi ý b-roll'}</button>${SUG?.length ? `<button data-abact="insert"><i class="ti ti-plus"></i> Chèn ${PICK.size} mục</button>` : ''}</div>${SUG?.length && vert() ? `<div class="chips" style="margin:8px 0 0">${[['full', 'B-roll động toàn màn'], ['card', 'Dạng thẻ']].map(([k, l]) => `<button class="chip ${INS === k ? 'on' : ''}" data-abins="${k}">${l}</button>`).join('')}</div>` : ''}
        ${SUG ? SUG.length ? `<div class="ablist">${SUG.map((s, i) => `<label class="absug ${PICK.has(i) ? 'on' : ''}"><input type="checkbox" data-abpick="${i}" ${PICK.has(i) ? 'checked' : ''}>
            <div><div class="t"><a data-abseek="${s.t0}">${fmt(s.t0)}–${fmt(s.t1)}</a> <span class="kd ${s.kind}">${s.kind === 'preset' ? 'B-roll động' : 'Ảnh stock'}</span></div>
            <div class="q">“${esc(s.text)}”</div>
            <div class="w">${s.kind === 'preset' ? `<i class="ti ti-movie"></i> ${esc(s.preset?.template || '')} · <b>${esc(s.label || s.preset?.text || '')}</b>` : `<i class="ti ti-photo-search"></i> ${esc(s.query)}`}</div>
            ${s.why ? `<div class="why">${esc(s.why)}</div>` : ''}</div></label>`).join('')}</div>` : '<div class="empty"><b>Claude không đề xuất mục nào</b></div>' : ''}`;
    } else {
      const has = KEYS && (KEYS.openai || KEYS.gemini);
      h = has ? `<div class="help">Tạo ảnh bằng key của bạn (${[KEYS.openai && 'OpenAI gpt-image-1', KEYS.gemini && 'Google Imagen 4'].filter(Boolean).join(', ')}). Ảnh lưu vào media/ và chèn tại playhead 3 s. Có tính phí theo tài khoản của bạn.</div>
          <textarea id="abgen" rows="4" placeholder="Mô tả ảnh, VD: robot trợ lý đang làm việc trong văn phòng hiện đại, ánh sáng điện ảnh, dọc 9:16">${esc(GEN)}</textarea>
          ${KEYS.openai && KEYS.gemini ? `<select id="abprov"><option value="openai">OpenAI</option><option value="gemini">Google Gemini (Imagen)</option></select>` : ''}
          <div class="acts"><button class="primary" data-abact="gen"><i class="ti ti-photo-ai"></i> Tạo ảnh</button></div>`
        : `<div class="empty"><i class="ti ti-photo-ai"></i><b>Cần API key tạo ảnh</b><span>Studio không tự tạo ảnh khi chưa có key. Dán <b>OpenAI API key</b> (platform.openai.com → API keys) hoặc <b>Google Gemini API key</b> (aistudio.google.com → Get API key) trong ⚙ Key. Key lưu trên máy ở ~/.ai-video-studio/config.json (chỉ bạn đọc được).</span><button data-abact="keys"><i class="ti ti-key"></i> Dán key</button></div>`;
    }
    $('#libbody').innerHTML = `<div id="abpanel">${seg}${h}</div>`;
    const q = $('#abq'); if (q) q.onkeydown = e => { if (e.key === 'Enter') search(); };
  }
  async function search() {
    Q = ($('#abq')?.value || Q).trim(); if (!Q) return;
    LOADING = true; render();
    try { RES = await Studio.api(`/api/stock?q=${encodeURIComponent(Q)}&kind=${KIND}`); } catch (e) { RES = { query: Q, en: Q, items: [], missing: [] }; Studio.toast('Lỗi tìm: ' + e.message); }
    LOADING = false; render();
  }
  function keysModal() {
    const K = KEYS || {}, f = (k, l, help) => `<label class="lbl">${l} ${K[k] ? `<span class="muted">(đã lưu ${esc(K[k])})</span>` : ''}</label><input type="password" id="k_${k}" placeholder="${K[k] ? 'giữ nguyên — dán key mới để thay' : help}" autocomplete="off">`;
    Studio.modal(`<h3><i class="ti ti-key"></i> API key cho B-roll AI</h3>
      ${f('pexels', 'Pexels', 'pexels.com/api → miễn phí')}${f('pixabay', 'Pixabay', 'pixabay.com/api/docs → miễn phí')}
      ${f('openai', 'OpenAI (tạo ảnh)', 'sk-…')}${f('gemini', 'Google Gemini (tạo ảnh Imagen)', 'AIza…')}
      <p class="muted">Lưu tại <code>~/.ai-video-studio/config.json</code> (quyền 600, chỉ tài khoản của bạn đọc được), không ghi vào dự án. Để trống = giữ nguyên. Gõ một dấu cách rồi lưu để xoá key.</p>
      <div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="ksave">Lưu</button></div>`);
    $('#ksave').onclick = async () => {
      const b = {}; for (const k of ['pexels', 'pixabay', 'openai', 'gemini']) { const v = $('#k_' + k).value; if (v) b[k] = v.trim() ? v : ''; }
      const r = await Studio.api('/api/aikeys', b); KEYS = r.keys; Studio.closeModal(); Studio.toast('Đã lưu key'); render();
    };
  }
  const jobModal = title => Studio.modal(`<h3>${title}</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre><div class="actions"><button id="jcancel">Dừng</button></div>`);
  async function runJob(path, body, title, done) {
    const r = await Studio.api(path, body); if (!r.ok) return Studio.toast('Đang có tác vụ khác chạy');
    jobModal(title); $('#jcancel').onclick = () => Studio.api('/api/job/cancel', {});
    Studio.pollJob(j => { if (j.state === 'done') { Studio.closeModal(); done(j.out); } else Studio.modal(`<h3>Lỗi</h3><p>${esc(j.step)}</p><div class="actions"><button onclick="closeModal()">Đóng</button></div>`); });
  }
  async function insertPicked() {
    const list = [...PICK].map(i => SUG[i]).filter(Boolean); if (!list.length) return Studio.toast('Chưa chọn mục nào');
    let n = 0;
    const presets = list.filter(s => s.kind === 'preset' && s.preset);
    if (presets.length) { Studio.pushUndo(); for (const s of presets) { insertPreset(s.preset, s.label, s.t0, Math.min(s.t1, s.t0 + 4)); n++; } Studio.changed(); }
    for (const s of list.filter(s => s.kind === 'stock')) {
      Studio.toast(`Đang tìm ảnh “${s.query}”…`);
      try {
        const r = await Studio.api(`/api/stock?q=${encodeURIComponent(s.query)}&en=${encodeURIComponent(s.query)}&kind=photo&n=3`);
        const it = r.items?.[0]; if (!it) { Studio.toast(`Không thấy ảnh cho “${s.query}”`); continue; }
        await fetchAndInsert(it, s.t0, Math.min(s.t1, s.t0 + 3)); Studio.changed(); n++;
      } catch (e) { Studio.toast('Lỗi tải: ' + e.message); }
    }
    Studio.toast(`Đã chèn ${n} b-roll`);
  }

  // ---------- events ----------
  document.addEventListener('click', async e => {
    const P = e.target.closest('#abpanel'); if (!P) return; let b;
    if ((b = e.target.closest('[data-abtab]'))) { tab = b.dataset.abtab; return render(); }
    if ((b = e.target.closest('[data-abkind]'))) { KIND = b.dataset.abkind; return Q ? search() : render(); }
    if (e.target.closest('[data-abgo]')) return search();
    if ((b = e.target.closest('[data-abins]'))) { INS = b.dataset.abins; return render(); }
    if ((b = e.target.closest('[data-abseek]'))) { e.preventDefault(); return Studio.setTime(+b.dataset.abseek + .05); }
    if ((b = e.target.closest('[data-abi]'))) {
      const it = RES.items[+b.dataset.abi], T = Studio.T; b.classList.add('busy'); Studio.toast('Đang tải về media/…');
      try { const s = await fetchAndInsert(it, T, T + (it.kind === 'video' ? Math.min(3, it.dur || 3) : 2.5)); Studio.changed(); Studio.select(compOf(s)); Studio.toast(`Đã chèn b-roll (${it.license})`); }
      catch (err) { Studio.toast('Lỗi tải: ' + err.message); }
      return b.classList.remove('busy');
    }
    if ((b = e.target.closest('[data-abact]'))) {
      const a = b.dataset.abact;
      if (a === 'keys') return keysModal();
      if (a === 'suggest') return runJob('/api/broll/suggest', {}, '<i class="ti ti-sparkles"></i> Claude đang gợi ý b-roll…', out => { SUG = out || []; PICK = new Set(SUG.map((_, i) => i)); tab = 'ai'; render(); });
      if (a === 'insert') return insertPicked();
      if (a === 'gen') {
        GEN = $('#abgen').value.trim(); if (!GEN) return Studio.toast('Nhập mô tả ảnh');
        const T = Studio.T;
        return runJob('/api/genimage', { prompt: GEN, provider: $('#abprov')?.value }, '<i class="ti ti-photo-ai"></i> Đang tạo ảnh…', out => {
          Studio.pushUndo(); const s = insertMedia({ kind: 'image', path: out.path }, T, T + 3); Studio.changed(); Studio.select(compOf(s));
          if (typeof MEDIA_LOAD === 'function') MEDIA_LOAD(); Studio.toast('Đã tạo ảnh bằng ' + out.provider);
        });
      }
    }
  });
  document.addEventListener('change', e => {
    const p = e.target.dataset?.abpick; if (p == null) return;
    e.target.checked ? PICK.add(+p) : PICK.delete(+p); render();
  });
  document.addEventListener('mouseover', e => {
    const c = e.target.closest?.('#abpanel .abcell'); if (!c || c.querySelector('video')) return;
    const it = RES?.items[+c.dataset.abi]; if (!it?.preview) return;
    const v = document.createElement('video'); v.src = it.preview; v.muted = true; v.autoplay = true; v.loop = true; v.playsInline = true;
    c.querySelector('.th').appendChild(v); c.addEventListener('mouseleave', () => v.remove(), { once: true });
  });

  Studio.addPanel('aibroll', 'ti-wand', 'B-roll AI', render);
  const st = document.createElement('style');
  st.textContent = `
#abpanel .abq { display:flex; gap:6px; margin-bottom:8px; } #abpanel .abq input { flex:1; height:32px; } #abpanel .abq button { height:32px; }
#abpanel .chips { margin-bottom:8px; }
#abpanel .abnote { display:flex; gap:8px; background:var(--bg2); border:1px solid var(--line2); border-radius:8px; padding:8px 10px; font-size:11px; color:var(--tx2); margin-bottom:10px; line-height:1.45; }
#abpanel .abnote .ti { color:var(--warn); font-size:15px; }
#abpanel .abgrid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
#abpanel .abcell { cursor:pointer; } #abpanel .abcell.busy { opacity:.45; pointer-events:none; }
#abpanel .abcell .th { position:relative; aspect-ratio:4/3; border-radius:8px; background:var(--bg3) center/cover no-repeat; border:1px solid var(--line); overflow:hidden; transition:border-color .15s; }
#abpanel .abcell:hover .th { border-color:var(--acc); }
#abpanel .abcell video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
#abpanel .abcell .du, #abpanel .abcell .pv { position:absolute; bottom:4px; font-size:10px; background:rgba(0,0,0,.65); color:#fff; border-radius:4px; padding:1px 5px; z-index:1; }
#abpanel .abcell .du { right:4px; } #abpanel .abcell .pv { left:4px; text-transform:capitalize; }
#abpanel .abcell .nm { font-size:10.5px; color:var(--tx3); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#abpanel .ablist { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
#abpanel .absug { display:flex; gap:8px; background:var(--bg2); border:1px solid var(--line); border-radius:8px; padding:8px; cursor:pointer; font-size:11.5px; }
#abpanel .absug.on { border-color:var(--acc-line); background:var(--acc-soft); }
#abpanel .absug input { width:auto; margin-top:2px; }
#abpanel .absug .t a { color:var(--acc); cursor:pointer; font-variant-numeric:tabular-nums; }
#abpanel .absug .kd { font-size:10px; border-radius:4px; padding:1px 5px; margin-left:4px; background:var(--t-broll); color:#fff; } #abpanel .absug .kd.stock { background:var(--t-audio); }
#abpanel .absug .q { color:var(--tx); margin:3px 0; font-style:italic; }
#abpanel .absug .w { color:var(--tx2); } #abpanel .absug .why { color:var(--tx3); margin-top:2px; }
#abpanel textarea { width:100%; margin:8px 0; } #abpanel select { margin-bottom:8px; }
#abpanel .empty button { margin-top:10px; }
.abspin { animation:abspin 1s linear infinite; } @keyframes abspin { to { transform:rotate(360deg); } }`;
  document.head.appendChild(st);
})();
