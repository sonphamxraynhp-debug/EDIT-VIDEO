// Brand kit nhiều thương hiệu: lưu trong ~/.ai-video-studio/brands.json, áp cho dự án (TL.brand + logo vào media/), đổi nhanh trên thanh trên.
(() => {
  const { $, esc } = Studio;
  const FONTS = [['', 'Mặc định của gói'], ['"Be Vietnam Pro", sans-serif', 'Be Vietnam Pro'], ['"Montserrat", sans-serif', 'Montserrat'], ['"Inter", sans-serif', 'Inter'],
    ['"Lexend", sans-serif', 'Lexend'], ['"Nunito", sans-serif', 'Nunito'], ['"Oswald", sans-serif', 'Oswald'], ['"Playfair Display", serif', 'Playfair Display'],
    ['"DM Serif Display", serif', 'DM Serif Display'], ['"Bungee", sans-serif', 'Bungee'], ['"Pacifico", cursive', 'Pacifico']];
  const KEYS = ['primary', 'accent', 'dark', 'light', 'font', 'disp', 'logo', 'name', 'handle', 'phone', 'website', 'outro', 'kit'];
  const DEF = { primary: '#FF5A36', accent: '#FFD84A', dark: '#111214', light: '#FFFFFF' };
  let LIST = null, EDIT = null;
  const css = document.createElement('style');
  css.textContent = `
  .bk-card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r); padding: 10px; margin: 8px 0; }
  .bk-card.cur { border-color: var(--acc-line); box-shadow: 0 0 0 1px var(--acc-line) inset; }
  .bk-top { display: flex; gap: 10px; align-items: center; }
  .bk-logo { width: 40px; height: 40px; border-radius: 10px; background: var(--bg4); display: flex; align-items: center; justify-content: center; overflow: hidden; flex: none; font-weight: 800; font-size: 15px; }
  .bk-logo img { width: 100%; height: 100%; object-fit: contain; }
  .bk-nm { min-width: 0; flex: 1; } .bk-nm b { display: block; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .bk-nm small { color: var(--tx3); font-size: 10.5px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bk-sw { display: flex; gap: 3px; margin-top: 8px; } .bk-sw i { flex: 1; height: 14px; border-radius: 4px; border: 1px solid rgba(255,255,255,.08); }
  .bk-act { display: flex; gap: 4px; margin-top: 8px; } .bk-act button { padding: 4px 8px; font-size: 11px; } .bk-act .grow { flex: 1; }
  .bk-form label { display: block; font-size: 10.5px; color: var(--tx3); margin: 8px 0 3px; }
  .bk-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px; } .bk-g4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 6px; }
  .bk-up { display: flex; gap: 8px; align-items: center; }
  #bk-menu { position: fixed; z-index: 60; background: var(--bg2); border: 1px solid var(--line2); border-radius: 10px; padding: 6px; min-width: 230px; box-shadow: 0 18px 50px rgba(0,0,0,.55); }
  #bk-menu button { width: 100%; background: transparent; border-color: transparent; justify-content: flex-start; padding: 6px 8px; }
  #bk-menu button:hover { background: var(--bg4); } #bk-menu .dots { display: inline-flex; gap: 2px; } #bk-menu .dots i { width: 9px; height: 9px; border-radius: 50%; }
  #bk-menu hr { border: 0; border-top: 1px solid var(--line); margin: 4px 0; }
  #bk-sw b { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }`;
  document.head.appendChild(css);
  const active = () => document.querySelector('#rail .on')?.dataset.p === 'brands';
  const cur = () => Studio.TL?.brand?.kit;
  const packs = () => (Studio.win?.PACKS || []).map(p => [p.id, p.icon + ' ' + p.name]);
  async function load() { const r = await Studio.api('/api/brands'); LIST = Array.isArray(r) ? r : []; updateSwitch(); if (active()) render(); }

  async function apply(id) {
    const r = await Studio.api('/api/brands/apply', { id });
    if (r.error) return Studio.toast(r.error);
    Studio.pushUndo('brandkit');
    const keep = Object.fromEntries(Object.entries(Studio.TL.brand || {}).filter(([k]) => !KEYS.includes(k)));
    Studio.TL.brand = { ...keep, ...r.brand };
    let msg = `Đã áp thương hiệu “${r.title}”`;
    if (r.pack && r.pack !== Studio.TL.pack && confirm(`Thương hiệu này dùng gói style mặc định “${r.pack}”. Đổi gói của dự án sang gói này?`)) { Studio.TL.pack = r.pack; msg += ' + đổi gói (bấm “Dựng tự động theo gói” nếu muốn dựng lại)'; }
    Studio.changed(); updateSwitch(); Studio.toast(msg);
    if (active()) render();
  }
  function card(b) {
    const ini = (b.name || b.title || '?').split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();
    return `<div class="bk-card ${cur() === b.id ? 'cur' : ''}"><div class="bk-top"><div class="bk-logo" style="background:${esc(b.primary || '#333')};color:${esc(b.light || '#fff')}">${b.logoUrl ? `<img src="${esc(b.logoUrl)}">` : esc(ini)}</div>
      <div class="bk-nm"><b>${esc(b.title || b.name)}</b><small>${esc([b.name, b.handle, b.phone].filter(Boolean).join(' · ') || 'chưa có thông tin')}</small></div>${cur() === b.id ? '<span class="pill">đang dùng</span>' : ''}</div>
      <div class="bk-sw">${['primary', 'accent', 'dark', 'light'].map(k => `<i title="${k} ${esc(b[k] || DEF[k])}" style="background:${esc(b[k] || DEF[k])}"></i>`).join('')}</div>
      <div class="bk-act"><button class="primary" data-bka="${esc(b.id)}"><i class="ti ti-check"></i> Áp dụng cho dự án</button><span class="grow"></span>
        <button class="icon" title="Sửa" data-bke="${esc(b.id)}"><i class="ti ti-pencil"></i></button><button class="icon" title="Nhân bản" data-bkd="${esc(b.id)}"><i class="ti ti-copy"></i></button><button class="icon danger" title="Xoá" data-bkx="${esc(b.id)}"><i class="ti ti-trash"></i></button></div></div>`;
  }
  function form() {
    const b = EDIT, inp = (k, l, ph = '') => `<div><label>${l}</label><input data-bk="${k}" value="${esc(b[k] || '')}" placeholder="${esc(ph)}"></div>`;
    const col = (k, l) => `<div><label>${l}</label><input type="color" data-bk="${k}" value="${esc(b[k] || DEF[k])}"></div>`;
    const sel = (k, l, opts) => `<div><label>${l}</label><select data-bk="${k}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${(b[k] || '') === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
    return `<div class="bk-card bk-form"><b style="font-size:12.5px">${b.id ? 'Sửa thương hiệu' : 'Thương hiệu mới'}</b>
      ${inp('title', 'Tên bộ nhận diện (chỉ để bạn phân biệt)', 'VD: Kênh BĐS Sài Gòn')}
      <div class="bk-g4">${col('primary', 'Màu chính')}${col('accent', 'Màu nhấn')}${col('dark', 'Nền tối')}${col('light', 'Chữ sáng')}</div>
      <div class="bk-g2">${sel('font', 'Font chữ', FONTS)}${sel('disp', 'Font tiêu đề', FONTS)}</div>
      <label>Logo (PNG nền trong là đẹp nhất)</label><div class="bk-up"><div class="bk-logo">${b.logoUrl ? `<img src="${esc(b.logoUrl)}">` : '<i class="ti ti-photo"></i>'}</div>
        <button id="bk-logo" ${b.id ? '' : 'disabled title="Lưu trước rồi tải logo"'}><i class="ti ti-upload"></i> Tải logo</button><input type="file" id="bk-file" accept="image/*" hidden></div>
      <div class="bk-g2">${inp('name', 'Tên hiển thị trong video', 'Kiệm AI')}${inp('handle', 'Kênh / handle', '@kiem.ai')}${inp('phone', 'Điện thoại', '09xx xxx xxx')}${inp('website', 'Website', 'vidu.vn')}</div>
      ${sel('pack', 'Gói style mặc định', [['', '— không đổi gói —'], ...packs()])}
      ${inp('outro', 'Câu kết / CTA (dùng {{brand.outro}} trong mẫu)', 'Follow để xem thêm!')}
      <div class="acts"><button class="primary" id="bk-save"><i class="ti ti-device-floppy"></i> Lưu</button><button id="bk-cancel">Huỷ</button></div></div>`;
  }
  function render() {
    $('#libact').innerHTML = `<button class="icon" id="bk-new" title="Thương hiệu mới"><i class="ti ti-plus"></i></button>`;
    $('#bk-new').onclick = () => { EDIT = { ...DEF }; render(); };
    if (!LIST) { $('#libbody').innerHTML = '<div class="help">Đang tải…</div>'; return; }
    $('#libbody').innerHTML = `<div class="help" style="margin-top:4px">Lưu nhiều bộ nhận diện (màu, font, logo, liên hệ) dùng lại cho mọi dự án và cho <b>Làm hàng loạt</b>. Lưu ở <code>~/.ai-video-studio/brands.json</code>.</div>
      ${EDIT ? form() : ''}
      ${LIST.map(card).join('') || (EDIT ? '' : '<div class="help">Chưa có thương hiệu nào.</div>')}
      <div class="acts"><button id="bk-new2"><i class="ti ti-plus"></i> Thương hiệu mới</button><button id="bk-fromproj" title="Lấy màu, tên, liên hệ đang đặt trong dự án này"><i class="ti ti-download"></i> Lưu từ dự án này</button></div>`;
    bind();
  }
  function bind() {
    const B = $('#libbody');
    $('#bk-new2').onclick = () => { EDIT = { ...DEF }; render(); };
    $('#bk-fromproj').onclick = () => { const t = Studio.TL.brand || {}; EDIT = { ...DEF, ...Object.fromEntries(['primary', 'accent', 'dark', 'light', 'font', 'disp', 'name', 'handle', 'phone', 'website'].filter(k => t[k]).map(k => [k, t[k]])), title: t.name || Studio.META.name, pack: Studio.TL.pack || '' }; render(); };
    B.querySelectorAll('[data-bka]').forEach(b => (b.onclick = () => apply(b.dataset.bka)));
    B.querySelectorAll('[data-bke]').forEach(b => (b.onclick = () => { EDIT = { ...LIST.find(x => x.id === b.dataset.bke) }; render(); B.scrollTop = 0; }));
    B.querySelectorAll('[data-bkd]').forEach(b => (b.onclick = async () => { const r = await Studio.api('/api/brands/duplicate', { id: b.dataset.bkd }); if (r.error) return Studio.toast(r.error); await load(); Studio.toast('Đã nhân bản'); }));
    B.querySelectorAll('[data-bkx]').forEach(b => (b.onclick = async () => { const x = LIST.find(y => y.id === b.dataset.bkx); if (!confirm(`Xoá thương hiệu “${x.title || x.name}”? (dự án đã áp vẫn giữ màu)`)) return; await Studio.api('/api/brands/delete', { id: x.id }); await load(); }));
    if (!EDIT) return;
    B.querySelectorAll('[data-bk]').forEach(i => (i.oninput = i.onchange = () => (EDIT[i.dataset.bk] = i.value)));
    $('#bk-cancel').onclick = () => { EDIT = null; render(); };
    $('#bk-save').onclick = async () => {
      const { logoUrl, ...brand } = EDIT;
      const r = await Studio.api('/api/brands/save', { brand });
      if (r.error) return Studio.toast(r.error);
      EDIT = null; await load(); Studio.toast('Đã lưu thương hiệu “' + (r.title || r.name) + '”');
      if (cur() === r.id && confirm('Thương hiệu này đang dùng cho dự án — áp lại các thay đổi?')) apply(r.id);
    };
    $('#bk-logo').onclick = () => $('#bk-file').click();
    $('#bk-file').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const r = await fetch(`/api/brands/logo?id=${encodeURIComponent(EDIT.id)}&name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f }).then(x => x.json());
      if (r.error) return Studio.toast(r.error);
      EDIT.logo = r.logo; EDIT.logoUrl = r.logoUrl; await load(); Studio.toast('Đã tải logo');
    };
  }
  // ---- quick switcher (top bar) ----
  let sw = null;
  function updateSwitch() {
    if (!sw) return;
    const b = LIST?.find(x => x.id === cur());
    sw.querySelector('b').textContent = b ? b.title || b.name : 'Thương hiệu';
    sw.querySelector('.sw').style.background = b?.primary || Studio.TL?.brand?.primary || 'var(--bg4)';
  }
  function menu() {
    document.getElementById('bk-menu')?.remove();
    const r = sw.getBoundingClientRect(), m = document.createElement('div'); m.id = 'bk-menu';
    m.style.top = r.bottom + 6 + 'px'; m.style.left = Math.min(innerWidth - 250, r.left) + 'px';
    m.innerHTML = (LIST || []).map(b => `<button data-bkm="${esc(b.id)}"><span class="dots"><i style="background:${esc(b.primary || DEF.primary)}"></i><i style="background:${esc(b.accent || DEF.accent)}"></i></span>${esc(b.title || b.name)}${cur() === b.id ? ' <i class="ti ti-check" style="margin-left:auto;color:var(--acc)"></i>' : ''}</button>`).join('')
      + `${LIST?.length ? '<hr>' : ''}<button data-bkm=""><i class="ti ti-settings"></i> Quản lý thương hiệu…</button>`;
    document.body.appendChild(m);
    m.onclick = e => { const b = e.target.closest('[data-bkm]'); if (!b) return; m.remove(); if (b.dataset.bkm) apply(b.dataset.bkm); else document.querySelector('#rail [data-p="brands"]')?.click(); };
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
  }
  Studio.addPanel('brands', 'ti-palette', 'Thương hiệu', () => { render(); if (!LIST) load(); });
  Studio.onReady(() => {
    sw = Studio.addTopButton('<button class="ghost" id="bk-sw" title="Đổi nhanh thương hiệu"><span class="sw" style="width:12px;height:12px;border-radius:4px;display:inline-block"></span><b>Thương hiệu</b><i class="ti ti-chevron-down" style="font-size:13px"></i></button>', menu);
    load();
  });
})();
