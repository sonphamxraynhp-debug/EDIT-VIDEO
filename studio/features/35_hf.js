// Inspector tab "Khối" for HyperFrames scenes (engine/hf.js): the block's declared variables, its static texts,
// and timing/framing (speed, start offset, loop, fade, contain/cover). Edits re-init the preview (debounced).
'use strict';
(() => {
  const S = Studio, esc = S.esc;
  const cat = () => S.win?.HF_CATALOG || {};
  const isHf = c => c?.kind === 'scene' && c.obj.type === 'hf';
  const VL = { title: 'Tiêu đề', subtitle: 'Phụ đề', headline: 'Tiêu đề', name: 'Tên', role: 'Chức danh', label: 'Nhãn', accent: 'Màu nhấn', ink: 'Màu chữ',
    ground: 'Màu nền', background: 'Màu nền', prefix: 'Tiền tố', suffix: 'Hậu tố', start: 'Từ số', end: 'Đến số', exit: 'Kiểu thoát', glow: 'Phát sáng' };
  const vlabel = v => VL[v.id] || VL[String(v.label || '').toLowerCase()] || v.label || v.id;
  function field(v, val, vi) {
    const a = `data-hv="${esc(v.id)}" data-vt="${v.type}"`, cur = val ?? vi ?? v.def ?? '';
    const opts = v.options?.map(o => (typeof o === 'object' ? [o.value, o.label || o.value] : [o, o]));
    if (opts) return `<select ${a}>${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    if (v.type === 'color') return `<input type="color" ${a} value="${esc(/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#ffffff')}">`;
    if (v.type === 'boolean') return `<select ${a}><option value="true" ${cur === true || cur === 'true' ? 'selected' : ''}>Bật</option><option value="false" ${cur === true || cur === 'true' ? '' : 'selected'}>Tắt</option></select>`;
    if (v.type === 'number') return `<input type="number" step="any" ${a} value="${esc(cur)}">`;
    if (typeof cur === 'object') return `<input ${a} value="${esc(cur.url || cur.src || '')}" placeholder="đường dẫn ảnh trong dự án">`;
    return String(cur).length > 40 ? `<textarea rows="2" ${a}>${esc(cur)}</textarea>` : `<input ${a} value="${esc(cur)}">`;
  }
  S.addInspectorTab(c => {
    if (!isHf(c)) return null;
    const o = c.obj, b = cat()[o.block];
    if (!b) return ['hf', 'Khối', `<div class="help">Không tìm thấy khối "${esc(o.block)}" trong engine/hf.</div>`];
    const vars = b.vars.map(v => `<span class="lbl" title="${esc(v.desc)}">${esc(vlabel(v))}</span>${field(v, o.vars?.[v.id], b.vi?.[v.id])}`).join('');
    const texts = b.texts.map(t => `<span class="lbl">${esc(t.def.length > 34 ? t.def.slice(0, 34) + '…' : t.def)}</span><input data-hx="${t.i}" value="${esc(o.texts?.[t.i] ?? '')}" placeholder="${esc(b.vit?.[t.i] ?? t.def)}">`).join('');
    const num = (k, v, st, ph) => `<input type="number" step="${st}" data-hk="${k}" value="${v ?? ''}" placeholder="${ph}">`;
    const html = `<div id="hfpanel">
      ${vars ? S.sect('Nội dung & màu', vars, 'ti-adjustments') : ''}
      ${texts ? S.sect(vars ? 'Chữ khác' : 'Chữ trong khối', texts + '<div class="help">Để trống = giữ chữ gốc.</div>', 'ti-letter-t') : ''}
      ${S.sect('Chạy', `<div class="row"><div><span class="lbl">Tốc độ</span>${num('speed', o.speed, .05, '1')}</div><div><span class="lbl">Bắt đầu từ giây</span>${num('offset', o.offset, .1, '0')}</div></div>
        <div class="row"><div><span class="lbl">Mờ vào/ra (s)</span>${num('fade', o.fade, .05, '0.2')}</div><div><span class="lbl">Lặp lại</span><select data-hk="loop"><option value="">Không</option><option value="1" ${o.loop ? 'selected' : ''}>Có</option></select></div></div>
        ${b.layer === 'full' ? `<span class="lbl">Khung</span><select data-hk="fit"><option value="contain" ${o.fit !== 'cover' ? 'selected' : ''}>Vừa khung (giữ trọn khối)</option><option value="cover" ${o.fit === 'cover' ? 'selected' : ''}>Lấp đầy (cắt mép)</option></select>` : ''}
        <div class="help">Khối dài ${b.dur}s, ${b.w}×${b.h}, ${b.layer === 'full' ? 'phủ kín khung' : 'nền trong suốt'}. Kéo trên khung hình để dời, tab Vị trí để đổi cỡ.</div>
        <div class="acts"><button data-hact="reset"><i class="ti ti-restore"></i> Về mặc định</button></div>`, 'ti-player-play')}
      <div class="help">Nguồn: HyperFrames của HeyGen (Apache-2.0) · ${esc(b.title)}</div></div>`;
    return ['hf', 'Khối', html];
  });
  const cur = () => (isHf(S.sel) ? S.sel.obj : null);
  let tm = 0;
  const apply = () => { clearTimeout(tm); tm = setTimeout(() => S.changed(true), 350); };
  document.addEventListener('focusin', e => { if (e.target.closest('#hfpanel') && cur()) S.pushUndo(); });
  document.addEventListener('input', e => {
    const el = e.target, o = cur(); if (!o || !el.closest('#hfpanel')) return;
    if (el.dataset.hv) {
      const t = el.dataset.vt, v = t === 'number' ? (el.value === '' ? undefined : +el.value) : t === 'boolean' ? el.value === 'true' : el.value;
      o.vars = { ...(o.vars || {}) }; if (v === undefined || v === '') delete o.vars[el.dataset.hv]; else o.vars[el.dataset.hv] = v;
    } else if (el.dataset.hx != null) {
      o.texts = { ...(o.texts || {}) }; if (el.value === '') delete o.texts[el.dataset.hx]; else o.texts[el.dataset.hx] = el.value;
    } else if (el.dataset.hk) {
      const k = el.dataset.hk;
      if (k === 'loop') { if (el.value) o.loop = true; else delete o.loop; } else if (k === 'fit') o.fit = el.value;
      else if (el.value === '') delete o[k]; else o[k] = +el.value;
    } else return;
    apply();
  });
  document.addEventListener('change', e => { if (e.target.closest('#hfpanel select')) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
  document.addEventListener('click', e => {
    if (!e.target.closest('#hfpanel [data-hact="reset"]')) return;
    const o = cur(); if (!o) return;
    S.pushUndo(); for (const k of ['vars', 'texts', 'speed', 'offset', 'loop', 'fade', 'size', 'x', 'y']) delete o[k];
    S.changed(true); S.renderInspector();
  });
})();
