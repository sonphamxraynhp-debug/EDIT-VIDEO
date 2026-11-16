// Rail panel "Tự động" (references/autofill.md): one click = automatic b-roll (scripts/auto_broll.mjs: goal × sentence role × 11
// sources, alternatives on each scene — see 82_broll_alts.js; personal library via /api/brolllib) + richer sound
// (scripts/auto_sfx.py --level, mood music per section). Server: studio/routes/80_autofill.mjs. Only items marked _auto are
// replaced on a re-run; what you added or edited stays. Every run is one undo step (⌘Z) and a history snapshot.
'use strict';
(() => {
  const S = Studio, { $, esc } = S;
  const css = document.createElement('style');
  css.textContent = `
  .af section { border-bottom: 1px solid var(--line); padding: 4px 0 12px; margin-bottom: 10px; }
  .af .sh { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 12px; color: var(--tx2); margin: 4px 0 8px; }
  .af .sh .badge { margin-left: auto; font-weight: 600; font-size: 10.5px; color: var(--tx3); background: var(--bg2); border: 1px solid var(--line); border-radius: 999px; padding: 1px 7px; }
  .af .seg button { flex-direction: column; gap: 1px; padding: 5px 2px; font-size: 11.5px; }
  .af .seg button small { display: block; font-weight: 500; font-size: 9.5px; color: var(--tx3); white-space: nowrap; }
  .af .big { width: 100%; justify-content: center; padding: 12px; font-size: 13.5px; font-weight: 700; margin: 2px 0 8px; gap: 8px; }
  .af .row3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .af .row3 button { justify-content: center; padding: 7px 4px; font-size: 11.5px; }
  .af .stat { display: flex; gap: 5px; flex-wrap: wrap; margin: 6px 0 0; }
  .af .stat span { background: var(--bg2); border: 1px solid var(--line2); border-radius: 999px; padding: 2px 8px; font-size: 11px; color: var(--tx2); }
  .af .last { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--rs); padding: 8px 10px; font-size: 11.5px; color: var(--tx2); line-height: 1.5; margin-top: 8px; }
  .af label.sw { display: flex; align-items: center; gap: 8px; margin: 6px 0; cursor: pointer; }
  .af .goals { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; margin-bottom: 8px; }
  .af .goals button { justify-content: flex-start; gap: 6px; padding: 7px 8px; font-size: 11.5px; text-align: left; }
  .af .goals button.on { border-color: var(--acc-line); background: var(--acc-soft); color: var(--tx); }
  .af .chips .chip small { color: var(--warn); font-size: 9.5px; margin-left: 3px; }
  .af .vr { display: flex; align-items: center; gap: 8px; margin: 8px 0 4px; font-size: 11.5px; color: var(--tx2); }
  .af .vr input { flex: 1; }
  .af .lib { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 6px; }
  .af .lib .it { position: relative; border: 1px solid var(--line2); border-radius: var(--rs); overflow: hidden; background: var(--bg2); }
  .af .lib img { width: 100%; height: 62px; object-fit: cover; display: block; }
  .af .lib input { width: 100%; border: 0; border-top: 1px solid var(--line); border-radius: 0; font-size: 10px; padding: 3px 5px; background: var(--bg1); }
  .af .lib .x { position: absolute; top: 2px; right: 2px; padding: 0 4px; font-size: 10px; background: rgba(0,0,0,.6); border: 0; }
  .af .lib .k { position: absolute; left: 3px; top: 3px; font-size: 9px; background: rgba(0,0,0,.6); color: #fff; border-radius: 4px; padding: 0 4px; }`;
  document.head.appendChild(css);
  // labels for the v4 music beds in the "Âm thanh" library panel (library.js)
  try {
    Object.assign(MOOD_VI, { lofi_hiphop: 'Lofi hip-hop', cinematic_epic: 'Điện ảnh hoành tráng', corporate_upbeat: 'Doanh nghiệp tươi', real_estate_luxury: 'BĐS sang trọng',
      tiktok_trap: 'TikTok trap', acoustic_warm: 'Guitar mộc ấm', ambient_calm: 'Thư giãn, thiền', news_bg: 'Nền bản tin', kids_playful: 'Vui nhộn', piano_minimal: 'Piano tâm sự' });
    Object.assign(MOOD_IC, { lofi_hiphop: 'ti-headphones', cinematic_epic: 'ti-movie', corporate_upbeat: 'ti-building', real_estate_luxury: 'ti-home-star', tiktok_trap: 'ti-brand-tiktok',
      acoustic_warm: 'ti-guitar-pick', ambient_calm: 'ti-leaf', news_bg: 'ti-news', kids_playful: 'ti-balloon', piano_minimal: 'ti-piano' });
  } catch {}

  const DENS = [['thua', 'Thưa', '~1 / 8 s'], ['vua', 'Vừa', '~1 / 5 s'], ['day', 'Dày', '~1 / 3 s'], ['ratday', 'Rất dày', '~1 / 2 s']];
  const SRCS = [['preset', 'B-roll động', 'ti-movie'], ['hf', 'Khối HyperFrames', 'ti-layout-board'], ['text', 'Chữ nổi', 'ti-typography'], ['emoji', 'Emoji', 'ti-mood-happy'],
    ['logo', 'Logo công cụ', 'ti-brand-apple'], ['aroll', 'Hiệu ứng trên người nói', 'ti-zoom-in'], ['media', 'Media dự án', 'ti-photo'], ['lib', 'Thư viện của tôi', 'ti-folder-heart'],
    ['stock', 'Ảnh stock', 'ti-world-search'], ['stockvid', 'Video stock', 'ti-video'], ['aiimg', 'Ảnh AI', 'ti-wand'], ['claude', 'Claude chọn', 'ti-sparkles']];
  let META = null, LIB = null;
  const loadMeta = () => S.api('/api/broll/meta').then(m => { META = m; if (S.panel === 'autofill' || document.querySelector('.af')) render(); }).catch(() => {});
  const loadLib = () => S.api('/api/brolllib').then(l => { LIB = l; if (document.querySelector('.af')) render(); }).catch(() => {});
  const LEVELS = [['nhe', 'Nhẹ', 'chỉ cảnh chính'], ['vua', 'Vừa', '+ riser, số, tiền'], ['phongphu', 'Phong phú', '+ từ khoá, cảm xúc']];
  const DEF = { goal: 'auto', variety: .6, density: 'vua', src: ['preset', 'hf', 'text', 'emoji', 'logo', 'aroll', 'media', 'lib'], level: 'vua', music: true, after_ai: true };
  let O = { ...DEF }, last = null, busy = false;
  try { O = { ...DEF, ...JSON.parse(localStorage.getItem('avs_autofill') || '{}') }; } catch {}
  if (!O.v5) { O.src = [...new Set([...O.src, 'hf', 'logo', 'aroll', 'lib'])]; O.v5 = 1; } // new sources on by default once
  const keep = () => { try { localStorage.setItem('avs_autofill', JSON.stringify(O)); } catch {} };

  const counts = () => {
    const TL = S.TL || {}, a = TL.audio || {};
    return { scenes: (TL.scenes || []).filter(s => s._auto).length, edited: (TL.scenes || []).filter(s => s._auto && s._orig).length,
      sfx: (a.sfx || []).filter(x => x._auto).length, music: (a.music || []).filter(m => m._auto).length };
  };
  const goalName = () => (META?.goals || []).find(g => g.id === O.goal)?.name || 'Tự nhận';
  const need = k => (k === 'stockvid' && META && !META.keys.stockvid ? '<small>cần key</small>' : k === 'aiimg' && META && !META.keys.aiimg ? '<small>cần key</small>' : k === 'lib' && LIB && !LIB.length ? '<small>trống</small>' : '');
  const srcHelp = () => [
    O.src.includes('hf') && '<b>Khối HyperFrames</b>: số đếm, sao đánh giá, thông báo đơn, lời kêu gọi… chữ lấy từ câu nói.',
    O.src.includes('logo') && '<b>Logo</b>: khi người nói nhắc tên công cụ / thương hiệu (ChatGPT, Canva, Shopee, Grab…).',
    O.src.includes('aroll') && '<b>Hiệu ứng trên người nói</b>: đẩy cận chậm, nhấn từ, đen trắng — không chèn hình, giữ kết nối với người xem.',
    O.src.includes('stock') && '<b>Ảnh stock</b>: Openverse + Wikimedia (CC, ghi nguồn trong media/credits.json), thêm Pexels/Pixabay nếu có key; ảnh có chuyển động.',
    O.src.includes('stockvid') && `<b>Video stock</b>: Pexels / Pixabay (key miễn phí, dán ở panel B-roll AI)${META && !META.keys.stockvid ? ' — <span style="color:var(--warn)">chưa có key, sẽ dùng ảnh thay</span>' : ''}.`,
    O.src.includes('aiimg') && `<b>Ảnh AI</b>: tối đa 2 ảnh / video bằng key OpenAI hoặc Gemini của bạn${META && !META.keys.aiimg ? ' — <span style="color:var(--warn)">chưa có key</span>' : ''}.`,
    O.src.includes('claude') && '<b>Claude chọn</b>: Claude xem các phương án của từng câu, chọn cái hợp nhất và viết chữ, chậm hơn 20–90 s.',
  ].filter(Boolean).join(' ');
  function render() {
    if (!META) loadMeta();
    if (!LIB) loadLib();
    const c = counts();
    $('#libbody').innerHTML = `<div class="af">${(S.CAP || []).length ? '' : S.ctaTranscribe('B-roll tự động')}
      <section><div class="sh"><i class="ti ti-bolt"></i>Tự thêm b-roll + âm thanh</div>
        <div class="help">Đọc lời thoại rồi chèn b-roll động, chữ nổi, emoji, ảnh của bạn đúng lúc nói; đặt SFX theo từng cảnh và chọn nhạc theo đoạn. Không che mặt người nói, bỏ qua 1,5 s đầu và thẻ kết. Chạy lại chỉ thay phần tự động — phần bạn tự thêm hoặc đã sửa được giữ.</div>
        <button class="primary big" data-af="all" ${busy ? 'disabled' : ''}><i class="ti ${busy ? 'ti-loader-2 spin' : 'ti-bolt'}"></i> Tự thêm B-roll + âm thanh</button>
        <div class="row3"><button data-af="broll" ${busy ? 'disabled' : ''}><i class="ti ti-movie"></i> Chỉ B-roll</button><button data-af="sfx" ${busy ? 'disabled' : ''}><i class="ti ti-volume"></i> Chỉ âm thanh</button>
          <button data-af="clear" ${busy || !(c.scenes + c.sfx + c.music) ? 'disabled' : ''}><i class="ti ti-eraser"></i> Xoá tự động</button></div>
        <div class="stat"><span>${c.scenes} cảnh tự động${c.edited ? ` (${c.edited} đã sửa, giữ)` : ''}</span><span>${c.sfx} SFX</span><span>${c.music ? c.music + ' đoạn nhạc' : 'nhạc giữ nguyên'}</span></div>
        ${last ? `<div class="last">${last}</div>` : ''}
      </section>
      <section><div class="sh"><i class="ti ti-target"></i>Mục tiêu video<span class="badge">${esc(goalName())}</span></div>
        <div class="goals">${(META?.goals || [{ id: 'auto', name: 'Tự nhận', icon: '✨' }]).map(g => `<button data-afg="${g.id}" class="${O.goal === g.id ? 'on' : ''}" title="${esc(g.desc || '')}">${g.icon} ${esc(g.name)}</button>`).join('')}</div>
        <div class="help">Mục tiêu quyết định loại b-roll cho từng câu: bán hàng thiên về giá, đánh giá sao, thông báo đơn; kể chuyện thiên về cảnh thật và trích dẫn; khoá học thiên về các bước, logo công cụ…</div>
      </section>
      <section><div class="sh"><i class="ti ti-movie"></i>B-roll<span class="badge">mật độ</span></div>
        <div class="seg">${DENS.map(([k, l, s]) => `<button data-afd="${k}" class="${O.density === k ? 'on' : ''}">${l}<small>${s}</small></button>`).join('')}</div>
        <div class="vr"><span>Đều tay</span><input type="range" min="0" max="1" step=".1" value="${O.variety}" data-afv><span>Đa dạng</span></div>
        <div class="chips">${SRCS.map(([k, l, ic]) => `<button class="chip ${O.src.includes(k) ? 'on' : ''}" data-afs="${k}" title="${esc(META?.sources?.[k] || l)}"><i class="ti ${ic}"></i> ${l}${need(k)}</button>`).join('')}</div>
        <div class="help">${srcHelp()}</div>
      </section>
      <section><div class="sh"><i class="ti ti-folder-heart"></i>Thư viện b-roll của tôi<span class="badge">${LIB ? LIB.length : '…'} mục</span></div>
        <div class="help">Ảnh/clip của bạn (sản phẩm, cửa hàng, văn phòng, hậu trường…) lưu một lần, dùng cho mọi dự án. Gắn thẻ đúng nội dung; b-roll tự động chọn mục có thẻ khớp với câu đang nói.</div>
        <div class="row3"><button data-afu><i class="ti ti-upload"></i> Thêm ảnh/clip</button><button data-aft ${LIB?.length ? '' : 'disabled'} title="Claude xem từng ảnh và viết thẻ"><i class="ti ti-sparkles"></i> Claude gắn thẻ</button><button data-afr title="Tải lại"><i class="ti ti-refresh"></i></button></div>
        <input type="file" id="afup" accept="image/*,video/*" multiple hidden>
        ${LIB?.length ? `<div class="lib">${LIB.slice(-60).reverse().map(it => `<div class="it" title="${esc(it.tags.join(', '))}"><img src="/api/brolllib/file?f=${encodeURIComponent(it.thumb)}" loading="lazy">${it.kind === 'video' ? '<span class="k">clip</span>' : ''}
          <button class="x" data-afx="${esc(it.id)}" title="Xoá khỏi thư viện">✕</button><input data-aftag="${esc(it.id)}" value="${esc(it.tags.join(', '))}" placeholder="thẻ, cách nhau dấu phẩy"></div>`).join('')}</div>` : ''}
      </section>
      <section><div class="sh"><i class="ti ti-volume"></i>Âm thanh<span class="badge">309 SFX · 30 nhạc</span></div>
        <div class="seg">${LEVELS.map(([k, l, s]) => `<button data-afl="${k}" class="${O.level === k ? 'on' : ''}">${l}<small>${s}</small></button>`).join('')}</div>
        <label class="sw"><input type="checkbox" data-afm ${O.music ? 'checked' : ''}> Tự chọn nhạc nền theo nội dung từng đoạn (crossfade, tự hạ khi nói)</label>
        <label class="sw"><input type="checkbox" data-afai ${O.after_ai ? 'checked' : ''}> Tự chạy sau “AI dựng giúp”</label>
        <div class="help">Giới hạn số tiếng mỗi giây, tự giảm âm lượng SFX khi đang có giọng nói. Không có nhạc riêng của bạn thì nhạc cũ được thay bằng nhạc theo đoạn.</div>
      </section></div>`;
  }
  function opts(extra = {}) {
    return { goal: O.goal, variety: +O.variety, density: O.density, src: O.src.filter(x => x !== 'claude'), claude: O.src.includes('claude'), level: O.level, music: !!O.music, ...extra };
  }
  const NAMES = { all: 'Đang thêm b-roll + âm thanh…', broll: 'Đang thêm b-roll…', sfx: 'Đang đặt âm thanh…', clear: 'Đang xoá phần tự động…' };
  // run(mode, {noUndo}) -> Promise<summary|null>. noUndo: caller already pushed an undo step (AI dựng giúp).
  async function run(mode = 'all', o = {}) {
    if (busy) return null;
    if (mode !== 'sfx' && mode !== 'clear' && !(S.CAP || []).length) return S.needCaptions(() => run(mode, o), 'Tự thêm b-roll');
    busy = true; render();
    await S.saveNow();
    if (!o.noUndo) S.pushUndo();
    const r = await S.api('/api/autofill', { mode, ...opts(o.opts || {}) });
    if (!r.ok) { busy = false; render(); S.toast(r.error || 'Đang có tác vụ khác chạy'); return null; }
    S.modal(`<h3><i class="ti ti-bolt"></i> ${NAMES[mode]}</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre>`);
    return new Promise(ok => S.pollJob(async j => {
      busy = false;
      if (j.state !== 'done') {
        S.modal(`<h3>Chưa tự thêm được</h3><p>${esc(j.step)}</p><pre>${esc((j.log || '').split('\n').filter(l => !l.startsWith('@@')).join('\n').slice(-1000))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
        render(); return ok(null);
      }
      S.closeModal();
      await S.reload();
      const out = j.out || {}, b = out.broll || {}, kinds = Object.entries(b.kinds || {}).map(([k, v]) => `${S.typeName ? S.typeName(k) : k} ×${v}`).join(', ');
      last = [mode === 'clear' ? `Đã xoá ${b.removed ?? 0} cảnh tự động + SFX/nhạc tự động.` : '',
        b.added != null && mode !== 'clear' ? `B-roll: +${b.added}${b.goal ? ` · mục tiêu <b>${esc(b.goal.name)}</b>${b.goal.why === 'chọn tay' ? '' : ` (tự nhận theo ${esc(b.goal.why)})`}` : ''}<br>Nguồn: ${esc(Object.entries(b.sources || {}).map(([k, v]) => `${(SRCS.find(x => x[0] === k) || [k, k])[1]} ×${v}`).join(', ') || kinds)}${b.alts ? ` · ${b.alts} cảnh có phương án thay thế (bấm cảnh → tab “Phương án khác”)` : ''}${b.removed ? ` · thay ${b.removed} cảnh cũ` : ''}${b.claude ? ` · ${esc(b.claude)}` : ''}` : '',
        out.sfx && mode !== 'clear' ? 'Âm thanh: ' + esc(String(out.sfx).replace(/^level \d: /, '')) : ''].filter(Boolean).join('<br>');
      render();
      S.toast(mode === 'clear' ? 'Đã xoá phần tự động' : 'Xong — ⌘Z để hoàn tác');
      ok(out);
    }));
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('.af [data-af],.af [data-afd],.af [data-afs],.af [data-afl],.af [data-afg],.af [data-afu],.af [data-aft],.af [data-afr],.af [data-afx]');
    if (!t) return;
    if (t.dataset.af) return run(t.dataset.af);
    if (t.dataset.afg) O.goal = t.dataset.afg;
    if (t.hasAttribute('data-afu')) return $('#afup').click();
    if (t.hasAttribute('data-afr')) { LIB = null; META = null; return render(); }
    if (t.dataset.afx) return S.api('/api/brolllib/rm', { id: t.dataset.afx }).then(loadLib);
    if (t.hasAttribute('data-aft')) return tagLib();
    if (t.dataset.afd) O.density = t.dataset.afd;
    if (t.dataset.afl) O.level = t.dataset.afl;
    if (t.dataset.afs) { const k = t.dataset.afs; O.src = O.src.includes(k) ? O.src.filter(x => x !== k) : [...O.src, k]; }
    keep(); render();
  });
  async function uploadLib(files) {
    S.toast(`Đang thêm ${files.length} mục vào thư viện…`);
    for (const f of files) {
      const r = await fetch(`/api/brolllib/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f }).then(r => r.json()).catch(e => ({ error: e.message }));
      if (r.error) S.toast(`${f.name}: ${r.error}`);
    }
    await loadLib(); S.toast('Đã thêm vào thư viện — bấm “Claude gắn thẻ” hoặc tự gõ thẻ');
  }
  async function tagLib() {
    const r = await S.api('/api/brolllib/tag', {}); if (!r.ok) return S.toast(r.error || 'Đang có tác vụ khác chạy');
    S.modal(`<h3><i class="ti ti-sparkles"></i> Claude đang gắn thẻ thư viện…</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div>`);
    S.pollJob(async j => { S.closeModal(); await loadLib(); S.toast(j.state === 'done' ? (j.step || 'Xong') : 'Chưa gắn thẻ được: ' + j.step); });
  }
  document.addEventListener('change', e => {
    if (e.target.id === 'afup' && e.target.files.length) { uploadLib([...e.target.files]); e.target.value = ''; }
    if (e.target.matches('.af [data-aftag]')) S.api('/api/brolllib/tags', { id: e.target.dataset.aftag, tags: e.target.value }).then(it => { if (it && !it.error) { const x = LIB?.find(i => i.id === it.id); if (x) x.tags = it.tags; } });
    if (e.target.matches('.af [data-afv]')) { O.variety = +e.target.value; keep(); }
    if (e.target.matches('.af [data-afm]')) { O.music = e.target.checked; keep(); }
    if (e.target.matches('.af [data-afai]')) { O.after_ai = e.target.checked; keep(); }
  });
  S.autofill = { run, get opts() { return O; }, set afterAi(v) { O.after_ai = !!v; keep(); } };
  S.addPanel('autofill', 'ti-bolt', 'Tự động', render);
})();
