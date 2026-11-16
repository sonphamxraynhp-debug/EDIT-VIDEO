// Masks (clip.mask / scene.mask), background removal for a clip (cutouts + bg), "sticker người" from the playhead frame.
// Engine side: maskCss / clipLayer in engine.js. Server: studio/routes/60_media.mjs. Spec: references/keyframes-mask-broll.md.
(() => {
  const { $, esc, fmt, sect } = Studio;
  const SHAPES = [['', 'Không', ''], ['circle', 'Tròn', '<ellipse cx="12" cy="12" rx="10" ry="10"/>'], ['rounded', 'Bo góc', '<rect x="2" y="3" width="20" height="18" rx="5"/>'],
    ['rect', 'Chữ nhật', '<rect x="2" y="4" width="20" height="16"/>'], ['heart', 'Trái tim', '<path d="M12 21C6 16.5 2 13 2 8.2 2 5 4.6 3 7.3 3c2 0 3.6 1.1 4.7 2.9C13.1 4.1 14.7 3 16.7 3 19.4 3 22 5 22 8.2 22 13 18 16.5 12 21z"/>'],
    ['star', 'Ngôi sao', '<polygon points="12,2 14.6,8.6 21.5,9.1 16.2,13.6 17.9,20.5 12,16.8 6.1,20.5 7.8,13.6 2.5,9.1 9.4,8.6"/>'], ['diamond', 'Thoi', '<polygon points="12,2 22,12 12,22 2,12"/>'],
    ['blob', 'Blob', '<path d="M12.5 2c5 .2 9.4 3.4 9.5 8.6.1 5-3 9.8-8 11.2-5.1 1.3-10.3-1.6-11.5-6.5C1.3 10 4.6 2 12.5 2z"/>']];
  const ROUND = new Set(['circle', 'heart', 'star', 'diamond', 'blob']);
  const BG = [['', 'Tắt', 'ti-ban'], ['blur', 'Làm mờ', 'ti-blur'], ['color', 'Màu', 'ti-palette'], ['image', 'Ảnh', 'ti-photo'], ['none', 'Trong suốt', 'ti-background']];
  const ok = c => c && (c.kind === 'clip' || c.kind === 'scene');
  const DW = () => Studio.DW, DH = () => Studio.DH;
  const rng = (f, v, a, b, st, l, u = '') => `<div class="slrow"><span>${l}</span><input type="range" data-mk="${f}" min="${a}" max="${b}" step="${st}" value="${v}"><b data-mkv="${f}">${v}${u}</b></div>`;
  const images = () => (typeof MEDIA !== 'undefined' ? MEDIA : []).filter(m => m.kind === 'image');

  function defaults(c, shape) {
    let m = { x: 50, y: c.kind === 'clip' ? 42 : 50, w: 80, h: 60 };
    const r = c.kind === 'scene' && typeof rectOf === 'function' ? rectOf(c.obj) : null;
    if (r && r.w < DW() * .95) m = { x: (r.x + r.w / 2) / DW() * 100, y: (r.y + r.h / 2) / DH() * 100, w: r.w / DW() * 100 * 1.05, h: r.h / DH() * 100 * 1.05 };
    if (ROUND.has(shape)) { const side = Math.min(m.w * DW(), m.h * DH()) / 100 || DW() * .8; m.w = side / DW() * 100; m.h = side / DH() * 100; }
    for (const k in m) m[k] = Math.round(m[k] * 10) / 10;
    return { shape, ...m, feather: 0 };
  }

  function tab(c) {
    if (!ok(c)) return null;
    const o = c.obj, m = o.mask || {}, clip = c.kind === 'clip';
    let h = sect('Hình mặt nạ', `<div class="mkgrid">${SHAPES.map(([k, l, svg]) => `<button data-mshape="${k}" class="${(m.shape || '') === k ? 'on' : ''}">
        <svg viewBox="0 0 24 24">${svg || '<line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="2"/>'}</svg><small>${l}</small></button>`).join('')}</div>`, 'ti-shape');
    if (m.shape) h += sect('Vị trí và cỡ (% khung)', rng('x', m.x ?? 50, 0, 100, .5, 'Tâm X', '%') + rng('y', m.y ?? 50, 0, 100, .5, 'Tâm Y', '%') + rng('w', m.w ?? 80, 5, 200, .5, 'Rộng', '%') + rng('h', m.h ?? 60, 5, 200, .5, 'Cao', '%') +
      rng('feather', m.feather ?? 0, 0, 20, .5, 'Viền mềm') + (m.shape === 'rounded' ? rng('r', m.r ?? 14, 0, 50, 1, 'Bo góc') : '') +
      `<label class="check"><input type="checkbox" data-mkc="invert" ${m.invert ? 'checked' : ''}> Đảo ngược (khoét lỗ)</label>
      ${clip ? `<span class="lbl">Màu nền ngoài mặt nạ</span><div class="row"><input type="color" data-mkbg value="${m.bg || '#000000'}"><button data-mka="nobg" class="${m.bg ? '' : 'on'}">Đen (mặc định)</button></div>` : ''}`, 'ti-arrows-move');
    if (clip) {
      const has = !!o.cutouts, b = o.bg || {};
      h += sect('Tách nền (thay phông)', `${has ? `<div class="ok"><i class="ti ti-circle-check"></i> Đã tách nền (${esc(String(o.cutouts).split('/').slice(-2, -1)[0] || 'ảnh')})</div>` : ''}
        <div class="acts"><button data-mka="segment" class="${has ? '' : 'primary'}"><i class="ti ti-user-scan"></i> ${has ? 'Tách lại' : 'Tách nền clip này'}</button>
        <button data-mka="sticker"><i class="ti ti-sticker"></i> Tạo sticker người</button></div>
        <div class="help">Chạy rembg (u2net_human_seg) trên máy cho đúng đoạn nguồn ${(+o.in || 0).toFixed(2)}–${(+(o.out ?? 3)).toFixed(2)}s của clip — khoảng 0,2–0,5 s/khung. Sticker lấy khung tại playhead.</div>
        ${has ? `<span class="lbl">Nền phía sau người</span><div class="seg5">${BG.map(([k, l, ic]) => `<button data-mbg="${k}" class="${(b.type || '') === k ? 'on' : ''}"><i class="ti ${ic}"></i>${l}</button>`).join('')}</div>
          ${b.type === 'blur' ? rng('bgblur', b.blur ?? 26, 4, 60, 1, 'Độ mờ', 'px') : ''}
          ${b.type === 'color' ? `<span class="lbl">Màu nền</span><input type="color" data-mbgc value="${b.color || '#151515'}">` : ''}
          ${b.type === 'image' ? `<span class="lbl">Ảnh nền (từ Media)</span><select data-mbgi><option value="">— chọn ảnh —</option>${images().map(i => `<option value="${esc(i.path)}" ${b.src === i.path ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>
            ${images().length ? '' : '<div class="help">Chưa có ảnh trong Media — tải ảnh lên ở thư viện Media trước.</div>'}` : ''}
          ${b.type === 'none' ? '<div class="help">Phần nền trong suốt: thấy màu nền của khung (đen) hoặc thứ nằm dưới track chính.</div>' : ''}` : ''}`, 'ti-user-scan');
    }
    return ['mask', 'Mặt nạ', `<div id="mkpanel">${h}</div>`];
  }
  Studio.addInspectorTab(tab);

  const sel = () => (ok(Studio.sel) ? Studio.sel : null);
  const set = (fn, key) => { const c = sel(); if (!c) return; Studio.pushUndo(key); fn(c.obj, c); Studio.changed(!key); };
  document.addEventListener('click', e => {
    if (!e.target.closest('#mkpanel')) return;
    const c = sel(); if (!c) return; let b;
    if ((b = e.target.closest('[data-mshape]'))) return set((o, c) => { const s = b.dataset.mshape; if (!s) delete o.mask; else o.mask = o.mask ? { ...o.mask, shape: s } : defaults(c, s); });
    if ((b = e.target.closest('[data-mbg]'))) return set(o => { const k = b.dataset.mbg; if (!k) delete o.bg; else o.bg = { ...(o.bg || {}), type: k }; });
    if ((b = e.target.closest('[data-mka]'))) {
      const a = b.dataset.mka;
      if (a === 'nobg') return set(o => { if (o.mask) delete o.mask.bg; });
      if (a === 'segment') return segment(c);
      if (a === 'sticker') return sticker(c);
    }
  });
  document.addEventListener('input', e => {
    const t = e.target; if (!t.closest?.('#mkpanel')) return;
    const c = sel(); if (!c) return;
    if (t.dataset.mk) {
      const f = t.dataset.mk, v = +t.value, lab = document.querySelector(`#mkpanel [data-mkv="${f}"]`);
      if (lab) lab.textContent = v + (/^[xywh]$/.test(f) ? '%' : f === 'bgblur' ? 'px' : '');
      return set(o => { if (f === 'bgblur') o.bg = { ...(o.bg || {}), blur: v }; else if (o.mask) o.mask[f] = v; }, 'mk' + f);
    }
    if (t.dataset.mkbg != null) return set(o => { if (o.mask) o.mask.bg = t.value; }, 'mkbg');
    if (t.dataset.mbgc != null) return set(o => { o.bg = { ...(o.bg || {}), type: 'color', color: t.value }; }, 'mbgc');
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!t.closest?.('#mkpanel')) return;
    if (t.dataset.mkc === 'invert') return set(o => { if (o.mask) o.mask.invert = t.checked || undefined; });
    if (t.dataset.mbgi != null) return set(o => { o.bg = { ...(o.bg || {}), type: 'image', src: t.value || undefined }; });
  });

  const jobModal = title => Studio.modal(`<h3>${title}</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre><div class="actions"><button id="jcancel">Dừng</button></div>`);
  const fail = j => Studio.modal(`<h3>Lỗi</h3><p>${esc(j.step)}</p><pre>${esc((j.log || '').slice(-1200))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
  async function startJob(path, body, title, done) {
    const r = await Studio.api(path, body);
    if (!r.ok) return Studio.toast('Đang có tác vụ khác chạy');
    jobModal(title); $('#jcancel').onclick = () => Studio.api('/api/job/cancel', {});
    Studio.pollJob(j => (j.state === 'done' ? (Studio.closeModal(), done(j.out)) : fail(j)));
  }
  function segment(c) {
    const o = c.obj;
    startJob('/api/segment', { src: o.src, in: +o.in || 0, out: +(o.out ?? 3), fps: o.src?.fps || 30 }, '<i class="ti ti-user-scan"></i> Đang tách nền…', out => {
      const tgt = Studio.TL.clips.includes(o) ? o : Studio.TL.clips.find(x => JSON.stringify(x.src) === JSON.stringify(o.src) && x.in === o.in);
      if (!tgt) return Studio.toast('Clip đã bị xoá');
      Studio.pushUndo(); tgt.cutouts = out.cutouts; if (out.still) tgt.cutout_img = out.cutouts;
      if (!tgt.bg?.type) tgt.bg = { type: 'blur' };
      Studio.changed(true); Studio.toast(out.still ? 'Đã tách nền ảnh' : `Đã tách nền ${out.n || ''} khung · chọn nền ở bên phải`);
    });
  }
  function sticker(c) {
    const o = c.obj, L = clipLayout(), k = L.find(x => x.c === o); if (!k) return;
    const T = Studio.T, t = T >= k.t0 && T < k.t1 ? T : (k.t0 + k.t1) / 2;
    const frame = clipFrameUrl(o, srcAt(k, t)).replace(/^\/project\//, '');
    startJob('/api/sticker', { frame }, '<i class="ti ti-sticker"></i> Đang tạo sticker người…', out => {
      Studio.pushUndo();
      const s = { type: 'sticker', t0: Math.round(T * 100) / 100, t1: Math.round(Math.min(Studio.TL.duration, T + 2.5) * 100) / 100, src: out.path, from: 'pop', size: Math.round(Math.min(DW(), DH()) * .5), x: Math.round(DW() / 2), y: Math.round(DH() * .72), outline: 0 };
      Studio.TL.scenes.push(s); Studio.changed(); Studio.select(compOf(s)); if (typeof MEDIA_LOAD === 'function') MEDIA_LOAD();
      Studio.toast('Đã thêm sticker người tại playhead');
    });
  }

  const st = document.createElement('style');
  st.textContent = `
#mkpanel .mkgrid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
#mkpanel .mkgrid button { flex-direction:column; gap:3px; padding:8px 2px 6px; font-size:10.5px; color:var(--tx2); }
#mkpanel .mkgrid svg { width:26px; height:26px; fill:currentColor; opacity:.85; }
#mkpanel .mkgrid button.on { background:var(--acc-soft); border-color:var(--acc-line); color:var(--tx); }
#mkpanel .seg5 { display:grid; grid-template-columns:repeat(5,1fr); gap:4px; }
#mkpanel .seg5 button { flex-direction:column; gap:2px; padding:6px 2px; font-size:10.5px; }
#mkpanel .seg5 button.on, #mkpanel .row button.on { background:var(--acc-soft); border-color:var(--acc-line); }
#mkpanel input[type=color] { width:44px; height:30px; padding:2px; }
#mkpanel .ok { color:var(--ok); font-size:11.5px; margin-bottom:6px; }`;
  document.head.appendChild(st);
})();
