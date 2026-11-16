// Âm thanh+ (references/audio.md): làm sạch giọng (preset + A/B), tự hạ nhạc khi nói, nhiều track âm thanh.
// Data lives in TL.audio.clean / .duck / .tracks; scripts/mix_audio.py applies it on export (or "Trộn thử").
// Extra tracks show as timeline rows "xa:<id>" (drag to move, drag edges to trim) via the Studio._build hook.
(() => {
  const S = Studio, { $, esc, fmt } = S;
  const PRESETS = [['off', 'Tắt'], ['nhe', 'Nhẹ'], ['vua', 'Vừa'], ['manh', 'Mạnh']];
  const COLORS = ['#7A4E9C', '#2F7A5B', '#8C5A2B', '#2B6C8C', '#8C2B4E'];
  const DUCK0 = { on: true, amount_db: -10, attack: 60, release: 400 };
  const A = () => { const t = S.TL; t.audio = t.audio || {}; return t.audio; };
  const tracks = () => A().tracks || (A().tracks = []);
  const rr = v => Math.round(v * 100) / 100;
  const itemLen = it => Math.max(.1, (it.out ?? (it.in || 0) + (it.src_dur || 5)) - (it.in || 0));
  const css = document.createElement('style');
  css.textContent = `
  .ap section { padding: 12px 0; border-bottom: 1px solid var(--line); } .ap section:last-child { border-bottom: 0; }
  .ap .sh { font-size: 12px; font-weight: 700; color: var(--tx); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; } .ap .sh .ti { color: var(--acc); font-size: 15px; }
  .ap .sh .badge { margin-left: auto; font-size: 10px; font-weight: 600; color: var(--tx3); background: var(--bg3); border-radius: 4px; padding: 1px 6px; }
  .ap .ab { display: flex; gap: 6px; margin-top: 8px; } .ap .ab button { flex: 1; justify-content: center; }
  .ap .ab button.on { background: var(--acc-soft); border-color: var(--acc-line); color: #D9D3FF; }
  .ap .sw { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--tx2); margin-bottom: 6px; cursor: pointer; }
  .ap .trk { background: var(--bg2); border: 1px solid var(--line); border-left: 3px solid var(--c); border-radius: 8px; padding: 8px; margin-bottom: 8px; }
  .ap .trk .top { display: flex; gap: 4px; align-items: center; } .ap .trk .top input[type=text] { flex: 1; min-width: 0; padding: 4px 6px; }
  .ap .trk .ms { padding: 3px 7px; font-weight: 700; font-size: 11px; } .ap .trk .ms.on.m { background: #5b2330; border-color: var(--bad); color: #fff; } .ap .trk .ms.on.s { background: #5b4a14; border-color: var(--warn); color: #fff; }
  .ap .trk .items { margin: 6px 0 0; font-size: 11.5px; color: var(--tx2); } .ap .trk .items div { display: flex; gap: 6px; align-items: center; padding: 3px 4px; border-radius: 5px; cursor: pointer; }
  .ap .trk .items div:hover { background: var(--bg3); } .ap .trk .items span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ap .trk .items small { color: var(--tx3); }
  .ap .pick { max-height: 180px; overflow: auto; border: 1px solid var(--line); border-radius: 6px; margin-top: 6px; } .ap .pick div { padding: 5px 8px; font-size: 11.5px; cursor: pointer; display: flex; gap: 6px; align-items: center; } .ap .pick div:hover { background: var(--acc-soft); }
  .ap audio { width: 100%; height: 30px; margin-top: 6px; }`;
  document.head.appendChild(css);
  KIND_IC.aitem = 'ti-wave-square';

  // ---------- timeline rows + components ----------
  S._build.push(comps => {
    for (let i = TRACKS.length - 1; i >= 0; i--) if (TRACKS[i][0].startsWith('xa:')) TRACKS.splice(i, 1);
    const list = S.TL?.audio?.tracks || [];
    const at = TRACKS.findIndex(x => x[0] === 'audio') + 1;
    list.forEach((t, ti) => {
      const k = 'xa:' + t.id, solo = list.some(x => x.solo), off = t.mute || (solo && !t.solo);
      TRACKS.splice(at + ti, 0, [k, (t.name || 'Track ' + (ti + 1)) + (off ? ' (tắt)' : ''), t.solo ? 'ti-headphones' : off ? 'ti-volume-off' : 'ti-playlist']);
      TRK[k] = TRK[k] || { lock: false, hide: false };
      TCOL[k] = COLORS[ti % COLORS.length];
      (t.items || []).forEach((it, ii) => {
        it.cid = `x${ti}i${ii}`;
        comps.push({
          obj: it, kind: 'aitem', track: k, t0: it.t0 || 0, t1: (it.t0 || 0) + itemLen(it), label: it.file?.split(/[\\/]/).pop() || '?', icon: 'ti-wave-square', tag: 'Track âm thanh', trk: t,
          setTimes(t0, t1, moved) {
            if (moved) { it.t0 = t0; return; }
            if (Math.abs(t0 - (it.t0 || 0)) > 1e-4) { it.in = rr(Math.max(0, (it.in || 0) + t0 - (it.t0 || 0))); it.t0 = t0; }
            let out = (it.in || 0) + (t1 - t0); if (it.src_dur) out = Math.min(out, it.src_dur); it.out = rr(out);
          },
          remove() { const a = t.items; a.splice(a.indexOf(it), 1); },
          dup(cp) { cp.t0 = rr((cp.t0 || 0) + itemLen(cp)); t.items.push(cp); },
          tabs: itemTabs,
        });
      });
    });
  });

  // ---------- inspector: track item ----------
  const n = (f, v, step = .1) => `<input type="number" data-xa="${f}" value="${v ?? ''}" step="${step}">`;
  const sl = (f, label, v, a, b, step, unit) => `<div class="slrow"><span>${label}</span><input type="range" data-xa="${f}" min="${a}" max="${b}" step="${step}" value="${v}"><b>${v}${unit}</b></div>`;
  function itemTabs(c) {
    const it = c.obj, t = c.trk, eq = it.eq || {};
    return [
      ['basic', 'Cơ bản', S.sect('File âm thanh', `<div class="help" style="margin-top:0">${esc(it.file || '')} · track <b>${esc(t.name || '')}</b>${it.src_dur ? ` · dài ${fmt(it.src_dur)}` : ''}</div>
        <div class="row"><div><span class="lbl">Bắt đầu (s)</span>${n('t0', rr(it.t0 || 0), .01)}</div><div><span class="lbl">Điểm vào</span>${n('in', rr(it.in || 0), .01)}</div><div><span class="lbl">Điểm ra</span>${n('out', rr(it.out ?? itemLen(it)), .01)}</div></div>
        <div class="acts"><button data-xact="here"><i class="ti ti-arrow-bar-to-right"></i> Bắt đầu tại playhead</button></div>
        ${sl('gain', 'Âm lượng', it.gain ?? 0, -40, 12, 1, ' dB')}`, 'ti-wave-square')],
      ['fx', 'Fade & EQ', S.sect('Fade', sl('fade_in', 'Fade vào', it.fade_in || 0, 0, 5, .1, 's') + sl('fade_out', 'Fade ra', it.fade_out || 0, 0, 5, .1, 's'), 'ti-chart-line') +
        S.sect('EQ 3 dải', sl('eq.low', 'Trầm 120Hz', eq.low || 0, -12, 12, 1, ' dB') + sl('eq.mid', 'Trung 1kHz', eq.mid || 0, -12, 12, 1, ' dB') + sl('eq.high', 'Cao 8kHz', eq.high || 0, -12, 12, 1, ' dB') +
        '<div class="help">Áp khi xuất / Trộn thử. Preview trong editor chỉ phát âm lượng, chưa có fade/EQ.</div>', 'ti-adjustments-horizontal')],
      ['trk', 'Track', S.sect('Track', `<label class="sw"><input type="checkbox" data-xt="mute" ${t.mute ? 'checked' : ''}> Tắt tiếng track (M)</label>
        <label class="sw"><input type="checkbox" data-xt="solo" ${t.solo ? 'checked' : ''}> Solo (chỉ nghe các track solo)</label>
        <label class="sw"><input type="checkbox" data-xt="duck" ${t.duck ? 'checked' : ''}> Tự hạ khi có giọng nói</label>
        ${sl('tgain', 'Âm lượng track', t.gain || 0, -30, 12, 1, ' dB')}`, 'ti-playlist')],
    ];
  }
  function setItem(f, v) {
    const c = S.sel; if (!c) return;
    const it = c.obj;
    if (c.kind === 'music') { if (f === 'fade_in' || f === 'fade_out') it[f] = +v || undefined; return; }
    if (c.kind !== 'aitem') return;
    if (f === 'tgain') c.trk.gain = +v || 0;
    else if (f.startsWith('eq.')) { it.eq = { ...(it.eq || {}), [f.slice(3)]: +v }; if (!Object.values(it.eq).some(Boolean)) delete it.eq; }
    else if (f === 'in') { const len = itemLen(it); it.in = rr(Math.max(0, +v)); it.out = rr(it.src_dur ? Math.min(it.src_dur, it.in + len) : it.in + len); }
    else if (f === 'out') it.out = rr(Math.max((it.in || 0) + .1, Math.min(it.src_dur || 1e9, +v)));
    else it[f] = f === 't0' ? rr(Math.max(0, +v)) : +v;
  }
  $('#insp').addEventListener('input', e => {
    const el = e.target, f = el.dataset.xa; if (!f) return;
    S.pushUndo('xa' + f); setItem(f, el.value);
    const b = el.parentNode.querySelector('b'); if (b && el.type === 'range') b.textContent = el.value + (/fade/.test(f) ? 's' : ' dB');
    S.changed();
  });
  $('#insp').addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.xa && el.type === 'number') S.renderInspector();
    const k = el.dataset.xt; if (!k || S.sel?.kind !== 'aitem') return;
    S.pushUndo(); S.sel.trk[k] = el.checked || undefined; S.changed(true); rerender();
  });
  $('#insp').addEventListener('click', e => {
    if (!e.target.closest('[data-xact="here"]') || S.sel?.kind !== 'aitem') return;
    S.pushUndo(); S.sel.obj.t0 = rr(S.T); S.changed(true);
  });
  // per-music-item fades (mix_audio.py: fade_in / fade_out, default = 0.12 s crossfade)
  S.addInspectorTab(c => c.kind !== 'music' ? null : ['fade', 'Fade', S.sect('Fade nhạc', sl('fade_in', 'Fade vào', c.obj.fade_in || 0, 0, 6, .1, 's') + sl('fade_out', 'Fade ra', c.obj.fade_out || 0, 0, 6, .1, 's') +
    '<div class="help">0 = chuyển mượt mặc định 0,12 s. Áp khi xuất.</div>', 'ti-chart-line')]);

  // ---------- preview playback of extra tracks (gain + mute/solo only) ----------
  const els = new Map();
  S._play.push((ev, T) => {
    if (ev === 'stop') { for (const a of els.values()) a.pause(); return; }
    const list = S.TL.audio?.tracks || [], solo = list.some(t => t.solo), live = new Set();
    for (const t of list) {
      if (t.mute || (solo && !t.solo) || TRK['xa:' + t.id]?.hide) continue;
      for (const it of t.items || []) {
        if (it.hidden || !it.file) continue;
        const t0 = it.t0 || 0, t1 = t0 + itemLen(it);
        if (T < t0 || T >= t1) continue;
        live.add(it);
        let a = els.get(it); if (!a) els.set(it, (a = new Audio('/project/' + it.file)));
        a.volume = Math.min(1, Math.pow(10, ((it.gain || 0) + (t.gain || 0)) / 20));
        const want = (it.in || 0) + T - t0;
        if (a.paused || Math.abs(a.currentTime - want) > .3) { a.currentTime = want; a.play().catch(() => {}); }
      }
    }
    for (const [it, a] of els) if (!live.has(it) && !a.paused) a.pause();
  });

  // ---------- rail panel ----------
  let ab = null, abBusy = false, picking = null, abEl = null;
  function render() {
    const au = A(), cl = au.clean?.preset || 'off', dk = au.duck, legacy = dk === undefined || dk === true, d = typeof dk === 'object' ? { ...DUCK0, ...dk } : DUCK0;
    const dOn = legacy || (typeof dk === 'object' && d.on !== false);
    const media = (typeof MEDIA !== 'undefined' ? MEDIA : []).filter(m => m.kind === 'audio' || m.kind === 'video');
    $('#libbody').innerHTML = `<div class="ap">
      <section><div class="sh"><i class="ti ti-microphone-2"></i>Làm sạch giọng<span class="badge">offline · ffmpeg</span></div>
        <div class="seg">${PRESETS.map(([k, l]) => `<button data-cl="${k}" class="${cl === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="help">Lọc ồn nền (học mẫu ồn từ đoạn yên nhất), giảm vang phòng (gần đúng, bằng expander), giảm xì “s”, nén, tăng độ rõ, chuẩn hoá âm lượng. Không cứu được giọng méo/rè nặng.</div>
        <div class="ab"><button data-ab="make" ${abBusy ? 'disabled' : ''}><i class="ti ${abBusy ? 'ti-loader-2' : 'ti-arrows-left-right'}"></i> ${abBusy ? 'Đang tạo…' : `Tạo A/B 5 s quanh ${fmt(S.T)}`}</button></div>
        ${ab ? `<div class="ab"><button data-ab="a" class="${abEl?.dataset.k === 'a' && !abEl.paused ? 'on' : ''}"><i class="ti ti-player-play"></i> A · Gốc</button><button data-ab="b" class="${abEl?.dataset.k === 'b' && !abEl.paused ? 'on' : ''}"><i class="ti ti-player-play"></i> B · Đã làm sạch</button></div>
          <div class="help">Hai bản cùng độ to (-16 LUFS) để so độ sạch, không phải độ to. Preset “${esc(ab.preset)}”.</div>` : ''}
      </section>
      <section><div class="sh"><i class="ti ti-arrow-down-bar"></i>Tự hạ nhạc khi nói<span class="badge">${legacy ? 'kiểu cũ' : dOn ? `${d.amount_db} dB` : 'tắt'}</span></div>
        <label class="sw"><input type="checkbox" data-dk="on" ${dOn ? 'checked' : ''}> Bật (nhạc nền + track có “tự hạ”)</label>
        ${legacy ? '<div class="help">Dự án đang dùng kiểu cũ (nén sidechain cố định) — giữ nguyên tiếng như trước. Kéo một thanh bên dưới để chuyển sang kiểu mới, hạ đúng số dB khi có giọng.</div>' : ''}
        <div class="slrow"><span>Hạ</span><input type="range" data-dk="amount_db" min="-24" max="-3" step="1" value="${d.amount_db}"><b>${d.amount_db} dB</b></div>
        <div class="slrow"><span>Vào (attack)</span><input type="range" data-dk="attack" min="10" max="300" step="10" value="${d.attack}"><b>${d.attack} ms</b></div>
        <div class="slrow"><span>Nhả (release)</span><input type="range" data-dk="release" min="100" max="1500" step="50" value="${d.release}"><b>${d.release} ms</b></div>
      </section>
      <section><div class="sh"><i class="ti ti-playlist"></i>Track âm thanh<span class="badge">${tracks().length}</span></div>
        ${tracks().map((t, i) => `<div class="trk" style="--c:${COLORS[i % COLORS.length]}"><div class="top">
            <input type="text" data-tn="${i}" value="${esc(t.name || '')}">
            <button class="ms m ${t.mute ? 'on' : ''}" data-tm="${i}" title="Tắt tiếng">M</button><button class="ms s ${t.solo ? 'on' : ''}" data-ts="${i}" title="Solo">S</button>
            <button class="icon" data-tdel="${i}" title="Xoá track"><i class="ti ti-trash"></i></button></div>
          <div class="slrow"><span>Âm lượng</span><input type="range" data-tg="${i}" min="-30" max="12" step="1" value="${t.gain || 0}"><b>${t.gain || 0} dB</b></div>
          <label class="sw"><input type="checkbox" data-tdk="${i}" ${t.duck ? 'checked' : ''}> Tự hạ khi có giọng</label>
          <div class="items">${(t.items || []).map((it, j) => `<div data-tsel="${i}:${j}"><i class="ti ti-wave-square"></i><span>${esc(it.file?.split('/').pop() || '')}</span><small>${fmt(it.t0 || 0)} · ${rr(itemLen(it))}s</small></div>`).join('') || '<div class="help" style="cursor:default">Chưa có file.</div>'}</div>
          <div class="acts" style="padding-top:6px"><button data-tadd="${i}"><i class="ti ti-plus"></i> Thêm file tại ${fmt(S.T)}</button></div>
          ${picking === i ? `<div class="pick">${media.map(m => `<div data-tpick="${esc(m.path)}"><i class="ti ${m.kind === 'video' ? 'ti-movie' : 'ti-music'}"></i>${esc(m.name)}</div>`).join('') || '<div style="cursor:default">Chưa có file âm thanh trong Media.</div>'}
            <div data-tup="1"><i class="ti ti-cloud-upload"></i><b>Tải file lên…</b></div></div>` : ''}
        </div>`).join('')}
        <div class="acts" style="padding-top:2px"><button data-tnew="1" class="primary"><i class="ti ti-plus"></i> Thêm track</button></div>
        <div class="help">Lồng tiếng, nhạc phụ, tiếng môi trường… Mỗi file là một khối trên timeline: kéo để dời, kéo mép để cắt; fade/EQ trong inspector.</div>
      </section>
      <section><div class="sh"><i class="ti ti-player-play"></i>Trộn thử</div>
        <div class="acts" style="padding-top:0"><button data-mix="1"><i class="ti ti-adjustments-alt"></i> Lưu & trộn (-14 LUFS)</button></div>
        ${S.META.mixed ? `<audio controls src="/project/${esc(S.META.mixed)}"></audio>` : '<div class="help">Trộn đúng như khi xuất (giọng sạch, hạ nhạc, track phụ) để nghe trước.</div>'}
      </section></div>
      <input type="file" id="xaup" hidden accept="audio/*,video/*">`;
  }
  S.addPanel('audioplus', 'ti-adjustments-alt', 'Âm thanh+', render);
  const rerender = () => { if ($('#libbody .ap')) render(); };

  async function makeAB() {
    const TL = S.TL, T = S.T;
    let src, ss;
    if (TL.clips?.length) { const k = clipAtT(T); if (!k?.c.audio || k.c.mute) return S.toast('Clip tại playhead không có tiếng'); src = k.c.audio; ss = srcAt(k, T) - 2.5; }
    else { src = TL.audio?.voice || S.META.audio; ss = T - 2.5; }
    if (!src) return S.toast('Dự án chưa có giọng');
    const preset = A().clean?.preset && A().clean.preset !== 'off' ? A().clean.preset : 'vua';
    abBusy = true; rerender();
    try {
      const r = await S.api('/api/audio/ab', { src, ss: Math.max(0, ss), dur: 5, clean: { ...(A().clean || {}), preset } });
      if (r.error) S.toast(r.error); else { ab = { ...r, preset }; playAB('b'); }
    } finally { abBusy = false; rerender(); }
  }
  function playAB(k) {
    if (!ab) return;
    if (abEl && abEl.dataset.k === k && !abEl.paused) { abEl.pause(); return rerender(); }
    const at = abEl && !abEl.paused ? abEl.currentTime : 0;
    abEl?.pause();
    abEl = new Audio('/project/' + ab[k] + '?' + Date.now()); abEl.dataset.k = k; abEl.currentTime = at;
    abEl.onended = abEl.onpause = rerender; abEl.play().catch(() => {}); rerender();
  }
  async function addFile(i, file) {
    const r = await S.api('/api/audio/probe?file=' + encodeURIComponent(file));
    const d = r.dur || 5, t = tracks()[i];
    S.pushUndo();
    const it = { file, t0: rr(S.T), in: 0, out: rr(Math.min(d, Math.max(.5, S.TL.duration - S.T))), src_dur: d, gain: 0 };
    (t.items = t.items || []).push(it); picking = null;
    S.changed(); S.select(comps.find(c => c.obj === it), false); render();
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('#libbody .ap [data-cl],#libbody .ap [data-ab],#libbody .ap [data-tm],#libbody .ap [data-ts],#libbody .ap [data-tdel],#libbody .ap [data-tadd],#libbody .ap [data-tpick],#libbody .ap [data-tup],#libbody .ap [data-tnew],#libbody .ap [data-tsel],#libbody .ap [data-mix]');
    if (!b) return;
    const d = b.dataset, au = A();
    if (d.cl) { S.pushUndo(); if (d.cl === 'off') delete au.clean; else au.clean = { ...(au.clean || {}), preset: d.cl }; ab = null; S.changed(); return render(); }
    if (d.ab) return d.ab === 'make' ? makeAB() : playAB(d.ab);
    if (d.tnew) { S.pushUndo(); const id = 't' + Date.now().toString(36); tracks().push({ id, name: ['Lồng tiếng', 'Nhạc phụ', 'Môi trường'][tracks().length % 3], gain: 0, items: [] }); S.changed(); return render(); }
    if (d.tm || d.ts) { const t = tracks()[+(d.tm ?? d.ts)], k = d.tm ? 'mute' : 'solo'; S.pushUndo(); t[k] = !t[k] || undefined; S.changed(true); return render(); }
    if (d.tdel) { const t = tracks()[+d.tdel]; if ((t.items || []).length && !confirm(`Xoá track “${t.name}” và ${t.items.length} file?`)) return; S.pushUndo(); tracks().splice(+d.tdel, 1); if (S.sel?.trk === t) S.select(null); S.changed(true); return render(); }
    if (d.tadd) { picking = picking === +d.tadd ? null : +d.tadd; return render(); }
    if (d.tpick) return addFile(picking, d.tpick);
    if (d.tup) {
      const inp = $('#xaup'), i = picking;
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        S.toast('Đang tải ' + f.name + '…');
        const before = new Set((await S.api('/api/media')).map(x => x.path));
        const list = await (await fetch('/api/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f })).json();
        if (typeof MEDIA !== 'undefined') MEDIA = list;
        const m = list.find(x => !before.has(x.path)) || list.find(x => x.name === f.name);
        if (m) addFile(i, m.path); else { S.toast('Đã tải lên, chọn file trong danh sách'); render(); }
      };
      return inp.click();
    }
    if (d.tsel) { const [i, j] = d.tsel.split(':').map(Number), it = tracks()[i].items[j]; S.setTime(it.t0 || 0); return S.select(comps.find(c => c.obj === it), false); }
    if (d.mix) {
      await S.saveNow();
      const r = await S.api('/api/audio/mix', {}); if (r.error) return S.toast(r.error);
      S.modal(`<h3><i class="ti ti-adjustments-alt"></i> Trộn âm thanh</h3><div class="bar"><i></i></div><div id="jobstep" class="help">Bắt đầu…</div><pre id="joblog" class="help"></pre>`);
      S.pollJob(j => { S.closeModal(); if (j.state === 'done') { S.META.mixed = j.out + '?' + Date.now(); S.toast('Đã trộn xong · nghe trong panel Âm thanh+'); } else S.toast('Lỗi trộn: ' + j.step); rerender(); });
    }
  });
  document.addEventListener('input', e => {
    const el = e.target; if (!el.closest?.('#libbody .ap')) return;
    const d = el.dataset, au = A();
    if (d.dk) {
      S.pushUndo('duck' + d.dk);
      const cur = typeof au.duck === 'object' ? au.duck : { ...DUCK0 };
      if (d.dk === 'on') { cur.on = el.checked; au.duck = cur; S.changed(); return render(); }
      cur[d.dk] = +el.value; au.duck = cur;
      el.parentNode.querySelector('b').textContent = el.value + (d.dk === 'amount_db' ? ' dB' : ' ms');
      return S.changed();
    }
    if (d.tg != null) { S.pushUndo('tg' + d.tg); tracks()[+d.tg].gain = +el.value || 0; el.parentNode.querySelector('b').textContent = el.value + ' dB'; return S.changed(); }
    if (d.tn != null) { S.pushUndo('tn' + d.tn); tracks()[+d.tn].name = el.value; return S.changed(); }
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el.closest?.('#libbody .ap') || el.dataset.tdk == null) return;
    S.pushUndo(); tracks()[+el.dataset.tdk].duck = el.checked || undefined; S.changed(); render();
  });
})();
