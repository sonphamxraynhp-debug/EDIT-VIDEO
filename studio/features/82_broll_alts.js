// Inspector tab "Phương án khác" on automatic b-roll (scripts/auto_broll.mjs keeps up to 3 runners-up per insert point in
// scene._alts = [{label, scene}]): one click swaps the shown b-roll for another, keeping the timing the user may have changed.
// The replaced one becomes an alternative itself, so the user can flip back. One undo step per swap.
'use strict';
(() => {
  const S = Studio, esc = S.esc;
  const sceneOf = c => (c?.kind === 'scene' ? c.obj : c?.scene) || null;
  const SRC = { preset: 'B-roll động', hf: 'Khối HyperFrames', text: 'Chữ nổi', emoji: 'Emoji 3D', logo: 'Logo công cụ', media: 'Media dự án', lib: 'Thư viện của tôi', stock: 'Ảnh stock', stockvid: 'Video stock', aiimg: 'Ảnh AI' };
  const ROLE = { hook: 'câu mở / gây tò mò', number: 'con số', money: 'giá / tiền', list: 'liệt kê', compare: 'so sánh', proof: 'bằng chứng / đánh giá', tool: 'nhắc tên công cụ', place: 'cảnh thật', time: 'thời gian', emotion: 'cảm xúc', cta: 'kêu gọi', general: 'ý chung' };
  const what = s => s.type === 'text' ? `“${s.lines?.[0]?.text || ''}”` : s.type === 'emoji_pop' ? s.src : s.type === 'hf' ? s.block : s.type === 'photo' ? (s.credit ? 'ảnh/clip · ' + s.credit.split('·')[0] : 'ảnh/clip') : (s.template || s.screen?.broll?.template || s.type) + (s.text || s.screen?.broll?.text ? ` “${s.text || s.screen.broll.text}”` : '');
  S.addInspectorTab(c => {
    const o = sceneOf(c);
    if (!o?._alts?.length) return null;
    const cur = `<div class="help" style="margin:0 0 8px">Đang dùng: <b>${esc(SRC[o._src] || o._src || 'b-roll')}</b> — ${esc(what(o))}${o._role ? `<br>Câu này: ${esc(ROLE[o._role] || o._role)}` : ''}</div>`;
    const list = o._alts.map((a, i) => `<button data-balt="${i}" style="width:100%;justify-content:flex-start;margin:0 0 6px;padding:8px 10px;text-align:left"><i class="ti ti-switch-horizontal"></i>
      <span><b>${esc(a.label)}</b><br><small class="muted">${esc(what(a.scene))}</small></span></button>`).join('');
    return ['alts', 'Phương án khác', S.sect('Đổi b-roll này', cur + list + '<div class="help">Bấm để thay; phương án đang dùng chuyển xuống danh sách để đổi lại được. ⌘Z để hoàn tác.</div>', 'ti-arrows-shuffle')];
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-balt]'); if (!b) return;
    const o = sceneOf(S.sel); if (!o?._alts) return;
    const i = (S.TL.scenes || []).indexOf(o), a = o._alts[+b.dataset.balt]; if (i < 0 || !a) return;
    S.pushUndo();
    const { _alts, cid, ...curScene } = o, d = (a.scene.t1 - a.scene.t0) || (o.t1 - o.t0);
    const label = (SRC[o._src] || 'B-roll') + (o.type === 'hf' ? ' · ' + o.block : o.template || o.screen?.broll?.template ? ' · ' + (o.template || o.screen.broll.template) : '');
    const next = { ...JSON.parse(JSON.stringify(a.scene)), t0: o.t0, t1: +(o.t0 + d).toFixed(2), _auto: true, note: 'tự động', _role: o._role,
      _src: Object.keys(SRC).find(k => a.label.startsWith(SRC[k])) || a.scene.type,
      _alts: [{ label, scene: curScene }, ..._alts.filter(x => x !== a)] };
    if (next.lines) next.lines.forEach(L => { if (L.t != null) L.t = next.t0; });
    if (next.media && typeof next.media === 'object' && next.media.t0 != null) next.media.t0 = next.t0;
    S.TL.scenes[i] = next;
    S.changed(true);
    const c = S.compOf(next.type === 'text' && next.lines?.[0] ? next.lines[0] : next); if (c) S.select(c);
    S.toast('Đã đổi b-roll — ⌘Z để hoàn tác');
  });
})();
