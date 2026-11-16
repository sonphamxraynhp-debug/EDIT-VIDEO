// Auto-reframe ("Bám mặt" tab on clips), translate + dub panel ("Dịch & lồng tiếng"), styles for the multi-aspect export options.
// Engine: reframeCss / sub2HTML in engine.js. Server: studio/routes/40_reframe.mjs, scripts/face_track.py, dub.py, export_multi.mjs.
// Spec: references/reframe-dub.md.
(() => {
  const { $, esc, sect } = Studio;
  const LANGS = [['en', 'Tiếng Anh'], ['zh', 'Tiếng Trung'], ['ja', 'Tiếng Nhật'], ['ko', 'Tiếng Hàn'], ['th', 'Tiếng Thái'], ['vi', 'Tiếng Việt'], ['fr', 'Tiếng Pháp'],
    ['de', 'Tiếng Đức'], ['es', 'Tiếng Tây Ban Nha'], ['id', 'Tiếng Indonesia'], ['ru', 'Tiếng Nga'], ['it', 'Tiếng Ý'], ['pt', 'Tiếng Bồ Đào Nha']];
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const jobModal = title => Studio.modal(`<h3>${title}</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre><div class="actions"><button id="jcancel">Dừng</button></div>`);
  const fail = j => Studio.modal(`<h3>Lỗi</h3><p>${esc(j.step)}</p><pre>${esc((j.log || '').slice(-1200))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
  async function startJob(path, body, title, done) {
    const r = await Studio.api(path, body);
    if (!r.ok) return Studio.toast('Đang có tác vụ khác chạy');
    jobModal(title); $('#jcancel').onclick = () => Studio.api('/api/job/cancel', {});
    Studio.pollJob(j => (j.state === 'done' ? (Studio.closeModal(), done(j.out)) : fail(j)));
  }

  // ---------- Bám mặt (clip inspector) ----------
  Studio.addInspectorTab(c => {
    if (c.kind !== 'clip') return null;
    const o = c.obj, still = typeof o.src === 'string', on = o.reframe?.length && !o.reframe_off, fa = Studio.DW / Studio.DH;
    let h;
    if (still) h = '<div class="help">Clip là ảnh tĩnh — chỉnh Tâm X/Y ở tab Cơ bản.</div>';
    else if (!o.reframe?.length) h = `<div class="acts"><button class="primary" data-rf="run"><i class="ti ti-face-id"></i> Bám mặt tự động</button></div>
      <div class="help">Dò mặt người nói trên máy (YuNet, offline, vài giây cho mỗi phút video), làm mượt chống rung, giữ nguyên khi cắt cảnh, rồi tự dời khung cắt theo mặt.
      Dùng cho <b>clip ngang trong video dọc</b> (và ngược lại). Clip được chuyển sang chế độ <b>Lấp đầy</b>.</div>`;
    else {
      const same = Math.abs((o.ar || 1.78) - fa) < .02;
      h = `<div class="rfstat ${on ? 'on' : ''}"><i class="ti ${on ? 'ti-face-id' : 'ti-face-id-error'}"></i><div><b>${on ? 'Đang bám mặt' : 'Đã tắt bám mặt'}</b>
        <small>${o.reframe.length} điểm · nguồn ${o.ar ? (o.ar > 1 ? 'ngang' : 'dọc') + ' ' + o.ar.toFixed(2) + ':1' : ''}</small></div></div>
        <div class="acts"><button data-rf="toggle" class="${on ? 'on' : ''}"><i class="ti ${on ? 'ti-toggle-right' : 'ti-toggle-left'}"></i> ${on ? 'Tắt' : 'Bật'}</button>
        <button data-rf="run"><i class="ti ti-refresh"></i> Dò lại</button><button data-rf="clear" class="danger"><i class="ti ti-trash"></i> Xoá</button></div>
        ${(o.fit || 'cover') !== 'cover' ? '<div class="help" style="color:var(--warn)">Bám mặt chỉ có tác dụng ở chế độ Lấp đầy (tab Cơ bản).</div>' : ''}
        <div class="help">${same ? 'Nguồn cùng khổ với khung nên không cần dời khung; tăng <b>Phóng to</b> ở tab Cơ bản để zoom vào mặt (tâm zoom bám theo mặt).'
          : 'Khung cắt tự dời theo mặt; Tâm X/Y ở tab Cơ bản bị thay bằng vị trí mặt. Phóng to &gt; 1 sẽ zoom quanh mặt.'}</div>`;
    }
    return ['reframe', 'Bám mặt', `<div id="rfpanel">${h}</div>`];
  });
  const clipSel = () => (Studio.sel?.kind === 'clip' ? Studio.sel : null);
  function applyTrack(out, o) {
    const TL = Studio.TL; let n = 0;
    Studio.pushUndo();
    for (const k of TL.clips) {
      if (k !== o && k.src?.seq !== out.seq) continue;
      const a = (+k.in || 0) - .5, b = +(k.out ?? 3) + .5;
      k.reframe = out.keys.filter(x => x.t >= a && x.t <= b); k.ar = out.ar; k.fit = 'cover'; delete k.reframe_off; n++;
    }
    Studio.changed(true);
    Studio.toast(`Đã bám mặt ${n} clip · thấy mặt ở ${Math.round(out.found * 100)}% mẫu${out.cuts ? ` · ${out.cuts} chỗ cắt cảnh` : ''}`);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('#rfpanel [data-rf]'); if (!b) return;
    const c = clipSel(); if (!c) return; const o = c.obj, a = b.dataset.rf;
    if (a === 'run') return startJob('/api/reframe', { src: o.src }, '<i class="ti ti-face-id"></i> Đang dò mặt…', out => applyTrack(out, o));
    Studio.pushUndo();
    if (a === 'toggle') { if (o.reframe_off) delete o.reframe_off; else o.reframe_off = true; }
    if (a === 'clear') { delete o.reframe; delete o.reframe_off; }
    Studio.changed(true);
  });

  // ---------- Dịch & lồng tiếng (left panel) ----------
  let VOICES = {}, ST = null;
  const state = () => {
    const TL = Studio.TL;
    ST = ST || { lang: TL.sub2?.lang || (TL.lang === 'en' ? 'vi' : 'en'), tts: TL.audio?.dub?.engine || 'say', voice: TL.audio?.dub?.voice || '' };
    return ST;
  };
  async function loadVoices(lang) {
    if (VOICES[lang]) return;
    VOICES[lang] = await Studio.api('/api/dub/voices?lang=' + lang).catch(() => ({ say: [], edge: null }));
    if (document.querySelector('#dubp')) render();
  }
  function render() {
    const TL = Studio.TL, CAP = Studio.CAP || [], s = state(), S2 = TL.sub2 || {}, A = TL.audio || {}, V = VOICES[s.lang];
    if (!V) loadVoices(s.lang);
    const src = TL.lang || 'vi', nTr = CAP.filter(c => c.tr).length, dub = A.dub, trk = (A.tracks || []).find(t => t.id === 'dub');
    const vg = Math.round((A.voice_gain ?? 1) * 100);
    const voices = s.tts === 'edge' ? (V?.edge ? [[V.edge, V.edge + ' (online)']] : []) : (V?.say || []).map(v => [v, v]);
    $('#libbody').innerHTML = `<div id="dubp">${CAP.length ? '' : Studio.ctaTranscribe('Dịch và lồng tiếng')}
      ${sect('Ngôn ngữ', `<div class="row"><div><span class="lbl">Gốc</span><select data-db="src">${opt(LANGS, src)}</select></div>
        <div><span class="lbl">Dịch sang</span><select data-db="lang">${opt(LANGS.filter(l => l[0] !== src), s.lang)}</select></div></div>
        <div class="help">Dịch bằng Claude (lệnh <code>claude</code> trên máy), theo từng câu rồi chia lại khớp từng đoạn phụ đề.</div>`, 'ti-language')}
      ${sect('Phụ đề song ngữ', `<label class="check"><input type="checkbox" data-db="on" ${S2.on ? 'checked' : ''} ${nTr ? '' : 'disabled'}> Hiện dòng dịch dưới phụ đề${S2.lang ? ` (${esc(S2.lang)})` : ''}</label>
        <span class="lbl">Kiểu</span><div class="seg3">${[['plain', 'Viền tối'], ['box', 'Nền đen'], ['yellow', 'Chữ vàng']].map(([k, l]) => `<button data-dbs="${k}" class="${(S2.style || 'plain') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="slrow"><span>Cỡ chữ</span><input type="range" data-db="size" min="16" max="44" step="1" value="${S2.size || (Studio.DH > Studio.DW ? 27 : 25)}"><b>${S2.size || 'tự'}</b></div>
        <div class="acts"><button data-dba="translate" class="${nTr ? '' : 'primary'}"><i class="ti ti-language"></i> ${nTr ? 'Dịch lại' : 'Dịch phụ đề'}</button></div>
        <div class="help">${nTr ? `${nTr}/${CAP.length} đoạn đã có bản dịch — sửa trực tiếp ở danh sách dưới.` : 'Chưa có bản dịch.'} Dòng dịch tự đặt ngay dưới phụ đề (hoặc trên nếu sát đáy), theo mọi kiểu phụ đề.</div>`, 'ti-badge-cc')}
      ${sect('Lồng tiếng', `<div class="row"><div><span class="lbl">Giọng đọc</span><select data-db="tts">${opt([['say', 'macOS (offline)'], ['edge', 'Microsoft Edge (cần mạng)']], s.tts)}</select></div>
        <div><span class="lbl">Giọng</span><select data-db="voice">${voices.length ? opt(voices, s.voice || voices[0][0]) : '<option value="">(không có giọng)</option>'}</select></div></div>
        <div class="slrow"><span>Giọng gốc</span><input type="range" data-db="vg" min="0" max="100" step="5" value="${vg}"><b>${vg}%</b></div>
        <div class="acts"><button data-dba="dub" class="primary"><i class="ti ti-microphone-2"></i> Tạo lồng tiếng</button></div>
        ${dub ? `<div class="dubfile"><i class="ti ti-wave-sine"></i> ${esc(dub.file)} · ${esc(dub.voice || '')}${trk ? `<label class="check"><input type="checkbox" data-db="dubon" ${trk.mute ? '' : 'checked'}> Dùng khi xuất</label>` : ''}</div>
          <audio controls preload="none" src="/project/${esc(dub.file)}?${Studio.META?.saved || ''}"></audio>` : ''}
        <div class="help">Mỗi câu đọc riêng, nhanh lên tối đa 1,35× để khớp chỗ trống; câu quá dài sẽ lấn sang câu sau (có báo). Giọng lồng tiếng là một track âm thanh;
        giọng gốc giảm theo thanh trên khi <b>xuất</b> (preview vẫn phát giọng gốc — nghe thử bản lồng tiếng ở đây). ${s.tts === 'say' ? 'Thêm giọng macOS: Cài đặt › Trợ năng › Nội dung được đọc.' : 'edge-tts gửi câu chữ lên dịch vụ đọc của Microsoft.'}</div>`, 'ti-microphone-2')}
      ${nTr ? sect('Bản dịch', `<div class="trlist">${CAP.map((c, i) => c.hidden ? '' : `<div><small>${esc(c.words.map(w => w.w).join(' '))}</small><input data-tri="${i}" value="${esc(c.tr || '')}"></div>`).join('')}</div>`, 'ti-list') : ''}
    </div>`;
  }
  function setSub2(fn) { const TL = Studio.TL; Studio.pushUndo('sub2'); TL.sub2 = TL.sub2 || { style: 'plain', lang: state().lang }; fn(TL.sub2); Studio.changed(); }
  async function run(kind) {
    const s = state(), TL = Studio.TL;
    if (!(Studio.CAP || []).length) return Studio.needCaptions(() => run(kind), 'Dịch và lồng tiếng');
    await Studio.saveNow();
    const body = { lang: s.lang, tts: s.tts, voice: s.voice || undefined, voice_gain: TL.audio?.voice_gain ?? .15,
      translate: kind === 'translate' || TL.sub2?.lang !== s.lang || !(Studio.CAP || []).some(c => c.tr), dub: kind === 'dub', force: kind === 'translate' };
    startJob('/api/dub', body, kind === 'dub' ? '<i class="ti ti-microphone-2"></i> Đang lồng tiếng…' : '<i class="ti ti-language"></i> Đang dịch phụ đề…', async out => {
      await Studio.reload();
      const ov = out?.overruns?.length;
      Studio.toast(kind === 'dub' ? `Đã lồng tiếng ${out?.phrases || ''} câu${ov ? ` · ${ov} câu dài hơn chỗ trống (lấn nhẹ)` : ''}` : 'Đã dịch phụ đề');
      Studio.renderPanel();
    });
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('#dubp')) return; let b;
    if ((b = e.target.closest('[data-dbs]'))) { setSub2(x => (x.style = b.dataset.dbs)); return render(); }
    if ((b = e.target.closest('[data-dba]'))) return run(b.dataset.dba);
  });
  document.addEventListener('input', e => {
    const t = e.target; if (!t.closest?.('#dubp')) return;
    if (t.dataset.db === 'size') { t.nextElementSibling.textContent = t.value; return setSub2(x => (x.size = +t.value)); }
    if (t.dataset.db === 'vg') { t.nextElementSibling.textContent = t.value + '%'; Studio.pushUndo('vg'); Studio.TL.audio = Studio.TL.audio || {}; Studio.TL.audio.voice_gain = +t.value / 100; return Studio.changed(); }
    if (t.dataset.tri != null) { const c = Studio.CAP[+t.dataset.tri]; Studio.pushUndo('tr' + t.dataset.tri); c.tr = t.value; return Studio.changed(); }
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!t.closest?.('#dubp')) return; const s = state(), k = t.dataset.db;
    if (k === 'lang') { s.lang = t.value; s.voice = ''; return render(); }
    if (k === 'src') { Studio.pushUndo(); Studio.TL.lang = t.value; if (s.lang === t.value) s.lang = t.value === 'vi' ? 'en' : 'vi'; Studio.changed(); return render(); }
    if (k === 'tts') { s.tts = t.value; s.voice = ''; return render(); }
    if (k === 'voice') { s.voice = t.value; return; }
    if (k === 'on') { setSub2(x => (x.on = t.checked)); return; }
    if (k === 'dubon') { const trk = (Studio.TL.audio?.tracks || []).find(x => x.id === 'dub'); if (trk) { Studio.pushUndo(); trk.mute = !t.checked; Studio.changed(); } }
  });
  Studio.addPanel('dub', 'ti-language', 'Lồng tiếng', render);
  try { PANEL_TITLE.dub = 'Dịch & lồng tiếng'; } catch {}

  const st = document.createElement('style');
  st.textContent = `
#rfpanel .rfstat { display:flex; gap:10px; align-items:center; padding:10px; border:1px solid var(--line2); border-radius:var(--r); background:var(--bg2); margin-top:4px; }
#rfpanel .rfstat i { font-size:22px; color:var(--tx3); } #rfpanel .rfstat.on i { color:var(--ok); }
#rfpanel .rfstat small { display:block; color:var(--tx3); font-size:11px; }
#rfpanel button.on { background:var(--acc-soft); border-color:var(--acc-line); }
#dubp .seg3 { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; }
#dubp .seg3 button.on { background:var(--acc-soft); border-color:var(--acc-line); }
#dubp .row { display:flex; gap:8px; } #dubp .row > div { flex:1; min-width:0; } #dubp select { width:100%; }
#dubp audio { width:100%; height:32px; margin-top:6px; }
#dubp .dubfile { font-size:11px; color:var(--tx2); margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; align-items:center; word-break:break-all; }
#dubp .trlist { display:flex; flex-direction:column; gap:6px; max-height:420px; overflow:auto; }
#dubp .trlist small { display:block; color:var(--tx3); font-size:10.5px; margin-bottom:2px; }
#dubp .trlist input { width:100%; }
.xasp { display:flex; flex-direction:column; gap:4px; margin:4px 0 2px; }
.xasp label { display:flex; gap:6px; align-items:center; font-size:12px; cursor:pointer; } .xasp small { color:var(--tx3); }
.xouts { display:flex; flex-direction:column; gap:6px; margin:6px 0 10px; }
.xouts > div { padding:8px 10px; border:1px solid var(--line2); border-radius:var(--rs); background:var(--bg2); }
.xouts a { color:var(--acc); margin-left:6px; } .xouts small { display:block; color:var(--tx3); margin-top:3px; }`;
  document.head.appendChild(st);
})();
