// Free keyframes: scene.kf / line.kf = [{t, x, y, scale, rot, opacity, ease}] (engine: kfAt/sceneFx in engine.js).
// Inspector tab "Keyframe", diamonds on timeline blocks, and preview drag edits the key at the playhead. Spec: references/keyframes-mask-broll.md.
(() => {
  const { $, esc, fmt, sect } = Studio;
  const EASES = [['linear', 'Đều'], ['inOut', 'Mượt'], ['in', 'Nhanh dần'], ['out', 'Chậm dần'], ['back', 'Nảy quá'], ['bounce', 'Nảy bóng'], ['hold', 'Giữ (nhảy)']];
  const PROPS = [['x', 'Dời X', -1280, 1280, 1, 'px'], ['y', 'Dời Y', -1280, 1280, 1, 'px'], ['scale', 'Tỉ lệ', .1, 4, .01, '×'], ['rot', 'Xoay', -360, 360, 1, '°'], ['opacity', 'Độ mờ', 0, 1, .01, '']];
  const DEF = { x: 0, y: 0, scale: 1, rot: 0, opacity: 1 };
  const EPS = .5 / 30, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
  const able = c => c && (c.kind === 'scene' || c.kind === 'line');
  const hasKf = c => able(c) && c.obj.kf?.length > 0;
  const valAt = (o, t) => (o.kf?.length && Studio.win?.kfAt ? Studio.win.kfAt(o.kf, t) : { ...DEF });
  const keyIdx = (o, t) => (o.kf || []).findIndex(k => Math.abs(k.t - t) < EPS);
  const sortK = o => o.kf.sort((a, b) => a.t - b.t);

  // ---- preview drag / position inputs edit the key at the playhead (wrap studio.js getPos/setPos) ----
  const baseGet = window.getPos, baseSet = window.setPos;
  window.getPos = c => {
    const p = baseGet(c); if (!p || !hasKf(c)) return p;
    const v = valAt(c.obj, Studio.T);
    return { ...p, x: p.x + v.x, y: p.y + v.y, size: p.size * v.scale };
  };
  window.setPos = (c, p) => {
    if (!hasKf(c)) return baseSet(c, p);
    const b = baseGet(c), k = ensureKey(c.obj);
    k.x = Math.round(p.x - b.x); k.y = Math.round(p.y - b.y);
    if (p.size && b.size) k.scale = r3(Math.max(.05, p.size / b.size));
  };
  function ensureKey(o, t = Studio.T) {
    o.kf = o.kf || [];
    let i = keyIdx(o, t);
    if (i < 0) { const v = valAt(o, t); const prev = [...o.kf].reverse().find(k => k.t < t); o.kf.push({ t: r2(t), x: Math.round(v.x), y: Math.round(v.y), scale: r3(v.scale), rot: r2(v.rot), opacity: r2(v.opacity), ease: prev?.ease || 'inOut' }); sortK(o); i = keyIdx(o, t); }
    return o.kf[i];
  }
  function anchorFor(c) {
    if (c.kind !== 'scene' || c.obj.anchor) return;
    const p = baseGet(c); if (p) c.obj.anchor = [Math.round(p.card ? p.card.x + p.card.w / 2 : p.x), Math.round(p.card ? p.card.y + p.card.h / 2 : p.y)];
  }

  // ---- inspector tab ----
  function tab(c) {
    if (!able(c)) return null;
    const o = c.obj, T = Studio.T, ks = o.kf || [], i = keyIdx(o, T), v = valAt(o, T);
    const cur = i >= 0 ? ks[i] : [...ks].reverse().find(k => k.t < T) || null;
    const rng = ([p, l, a, b, st, u]) => `<div class="slrow"><span>${l}</span><input type="range" data-kfp="${p}" min="${a}" max="${b}" step="${st}" value="${v[p]}"><b data-kfv="${p}">${fmtV(p, v[p])}${u}</b></div>`;
    const html = sect('Keyframe tại playhead', `<div class="kfbar">
        <button data-kfa="prev" title="Keyframe trước"><i class="ti ti-chevron-left"></i></button>
        <button data-kfa="add" class="${i >= 0 ? 'on' : 'primary'}" title="Thêm / cập nhật keyframe tại playhead"><i class="ti ti-diamond${i >= 0 ? '-filled' : ''}"></i> ${i >= 0 ? 'Có keyframe' : 'Thêm keyframe'}</button>
        <button data-kfa="next" title="Keyframe sau"><i class="ti ti-chevron-right"></i></button>
        ${i >= 0 ? '<button data-kfa="del" class="danger" title="Xoá keyframe này"><i class="ti ti-trash"></i></button>' : ''}</div>
        <div class="help">Playhead ${fmt(T)} · ${ks.length} keyframe. ${ks.length ? 'Kéo thành phần trên khung hình hoặc kéo thanh trượt để sửa (tự tạo keyframe tại playhead).' : 'Đặt playhead, bấm Thêm keyframe, dời playhead rồi chỉnh giá trị để tạo chuyển động.'}</div>`, 'ti-diamond') +
      sect('Giá trị', PROPS.map(rng).join(''), 'ti-adjustments') +
      (cur ? sect('Kiểu chuyển động', `<select data-kfe>${EASES.map(([k, l]) => `<option value="${k}" ${(cur.ease || 'linear') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="help">Áp cho đoạn từ keyframe ${fmt(cur.t)} tới keyframe kế tiếp.</div>`, 'ti-chart-bezier') : '') +
      (ks.length ? sect('Danh sách', `<div class="kflist">${ks.map((k, j) => `<button data-kfs="${k.t}" class="${j === i ? 'on' : ''}"><i class="ti ti-diamond-filled"></i>${fmt(k.t)}<small>${esc(EASES.find(e => e[0] === (k.ease || 'linear'))?.[1] || '')}</small></button>`).join('')}</div>
        <div class="acts"><button data-kfa="clear" class="danger"><i class="ti ti-eraser"></i> Xoá mọi keyframe</button></div>`, 'ti-list') : '');
    return ['kf', 'Keyframe', `<div id="kfpanel">${html}</div>`];
  }
  const fmtV = (p, x) => (p === 'scale' || p === 'opacity' ? (+x).toFixed(2) : Math.round(x));
  Studio.addInspectorTab(tab);

  const sel = () => (able(Studio.sel) ? Studio.sel : null);
  document.addEventListener('click', e => {
    if (!e.target.closest('#kfpanel')) return;
    const c = sel(); if (!c) return; const o = c.obj, T = Studio.T;
    const b = e.target.closest('[data-kfa],[data-kfs]'); if (!b) return;
    if (b.dataset.kfs != null) return Studio.setTime(+b.dataset.kfs + 1e-3);
    const a = b.dataset.kfa, ks = o.kf || [];
    if (a === 'prev') { const k = [...ks].reverse().find(k => k.t < T - EPS); return k ? Studio.setTime(k.t + 1e-3) : Studio.toast('Không còn keyframe phía trước'); }
    if (a === 'next') { const k = ks.find(k => k.t > T + EPS); return k ? Studio.setTime(k.t + 1e-3) : Studio.toast('Không còn keyframe phía sau'); }
    Studio.pushUndo();
    if (a === 'add') { anchorFor(c); ensureKey(o); }
    if (a === 'del') { const i = keyIdx(o, T); if (i >= 0) o.kf.splice(i, 1); if (!o.kf.length) delete o.kf; }
    if (a === 'clear') { delete o.kf; delete o.anchor; }
    Studio.changed(true);
  });
  document.addEventListener('input', e => {
    const p = e.target.dataset?.kfp; if (!p || !e.target.closest('#kfpanel')) return;
    const c = sel(); if (!c) return;
    Studio.pushUndo('kf' + p); anchorFor(c);
    const k = ensureKey(c.obj), v = +e.target.value;
    k[p] = p === 'scale' || p === 'opacity' ? r3(v) : Math.round(v);
    const lab = document.querySelector(`#kfpanel [data-kfv="${p}"]`); if (lab) lab.textContent = fmtV(p, v) + PROPS.find(x => x[0] === p)[5];
    Studio.changed();
    const add = document.querySelector('#kfpanel [data-kfa="add"]'); if (add && !add.classList.contains('on')) Studio.renderInspector();
  });
  document.addEventListener('change', e => {
    if (e.target.dataset?.kfe == null || !e.target.closest('#kfpanel')) return;
    const c = sel(); if (!c?.obj.kf) return; const T = Studio.T, o = c.obj;
    const i = keyIdx(o, T), k = i >= 0 ? o.kf[i] : [...o.kf].reverse().find(k => k.t < T);
    if (!k) return; Studio.pushUndo(); k.ease = e.target.value; Studio.changed(true);
  });
  // Keep the tab's values in step with the playhead (seek, arrows, playback).
  let lastT = -1;
  setInterval(() => {
    const ae = document.activeElement; if (!document.querySelector('#kfpanel') || Studio.T === lastT || (/INPUT|SELECT/.test(ae?.tagName) && ae.closest('#kfpanel'))) return;
    lastT = Studio.T; Studio.renderInspector();
  }, 250);

  // ---- timeline diamonds ----
  Studio._blk.push((c, pps) => (hasKf(c) ? c.obj.kf.map(k => `<i class="kfd ${Math.abs(k.t - Studio.T) < EPS ? 'on' : ''}" data-kft="${k.t}" style="left:${((k.t - c.t0) * pps).toFixed(1)}px" title="Keyframe ${fmt(k.t)}"></i>`).join('') : ''));
  const grab = e => {
    const d = e.target.closest?.('.kfd'); if (!d) return;
    e.stopPropagation(); e.preventDefault();
    const blk = d.closest('[data-cid]'), c = blk && Studio.sel?.obj.cid === blk.dataset.cid ? Studio.sel : null;
    if (!c && blk) { const cp = typeof compByCid === 'function' ? compByCid(blk.dataset.cid) : null; if (cp) Studio.select(cp); }
    Studio.setTime(+d.dataset.kft + 1e-3);
  };
  Studio.onReady(() => document.querySelector('#tlinner')?.addEventListener('mousedown', grab, true));

  const st = document.createElement('style');
  st.textContent = `
.blk .kfd { position:absolute; top:50%; width:8px; height:8px; margin:-4px 0 0 -4px; background:#FFE17A; border:1px solid rgba(0,0,0,.6); transform:rotate(45deg); border-radius:1px; cursor:pointer; z-index:2; box-shadow:0 0 0 1px rgba(255,255,255,.25); }
.blk .kfd:hover, .blk .kfd.on { background:var(--acc); box-shadow:0 0 0 2px var(--acc-soft); }
#kfpanel .kfbar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
#kfpanel .kfbar button.on { background:var(--acc-soft); border-color:var(--acc-line); color:var(--tx); }
#kfpanel .kfbar .ti-diamond-filled { color:#FFE17A; }
#kfpanel .kflist { display:flex; flex-wrap:wrap; gap:6px; }
#kfpanel .kflist button { font-size:11px; padding:4px 8px; }
#kfpanel .kflist button small { color:var(--tx3); margin-left:2px; }
#kfpanel .kflist button.on { border-color:var(--acc-line); background:var(--acc-soft); }
#kfpanel .kflist .ti { color:#FFE17A; font-size:10px; }`;
  document.head.appendChild(st);
})();
