// Gói style của người dùng (Style Lab, scripts/style_lab.mjs) — file tự sinh, đừng sửa tay: sửa engine/packs/user/<id>.js rồi chạy "node scripts/style_lab.mjs sync".
// ---- u_bds_den_gold.js ----
try {
// Style Lab: "BĐS Đen Gold" (tạo từ mô tả) — 2026-11-03. Spec: references/user/u_bds_den_gold.md
// Pack "u_bds_den_gold" — bất động sản sang trọng: đen tuyền – vàng gold, serif Playfair, khung viền mảnh + hoa văn góc,
// grade ấm cho A-roll, intro tên dự án ánh kim, thẻ giá đếm số, bản đồ vị trí SVG có pin, chip tiện ích, wipe vàng, CTA gọi điện.
// Khung thiết kế 720×1280 dọc / 1280×720 ngang (DIMS()).
(() => {
  const P = 'u_bds_den_gold';
  const SERIF = "'Playfair Display','DM Serif Display',Georgia,serif";
  const SANS = "'Be Vietnam Pro','Inter',system-ui,sans-serif";
  const pal = () => {
    const b = BR() || {};
    const gold = b.accent && b.accent !== '#FFD84A' ? b.accent : '#C9A44C';
    return { ink: '#0B0B0B', gold, hi: '#F3E3B0', lo: '#7A5A1C', cream: '#F4EEE0', mute: 'rgba(244,238,224,.6)', line: 'rgba(201,164,76,.75)',
      serif: b.disp && /serif|playfair/i.test(b.disp) ? b.disp : SERIF, sans: b.font && b.font !== 'var(--sans)' ? b.font : SANS };
  };
  const geo = () => { const [W, H] = DIMS(); return { W, H, v: VERT() }; };
  const life = (s, t, a = .4, b = .4) => fadeIO(t, s.t0, s.keep ? null : s.t1, a, b);
  const K = x => Math.max(0, Math.min(1, x));
  // Chữ ánh kim: gradient vàng, sheen trượt ping-pong theo t.
  const goldTxt = (t, p) => { const ph = (t * .35) % 2, pos = (ph < 1 ? ph : 2 - ph) * 100;
    return `background:linear-gradient(100deg,${p.lo} 0%,${p.gold} 30%,${p.hi} 50%,${p.gold} 70%,${p.lo} 100%);background-size:260% 100%;background-position:${pos.toFixed(1)}% 0;-webkit-background-clip:text;background-clip:text;color:transparent;`; };
  const rule = (w, p) => `<span style="display:inline-block;width:${w.toFixed(1)}px;height:1px;background:${p.gold};vertical-align:middle;opacity:.9"></span>`;
  const kicker = (txt, p, k, sz = 15) => `<div style="font:500 ${sz}px ${p.sans};letter-spacing:.5em;padding-left:.5em;text-transform:uppercase;color:${p.gold};opacity:${K(k).toFixed(3)};white-space:nowrap">${rule(k * 60, p)}<span style="margin:0 16px">${esc(txt)}</span>${rule(k * 60, p)}</div>`;
  const corner = (x, y, rot, k, p, sz = 76) => `<svg class="abs" style="left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;transform:rotate(${rot}deg);opacity:${K(k).toFixed(3)}" viewBox="0 0 76 76" fill="none">
    <path d="M3 73V18L18 3h55" stroke="${p.gold}" stroke-width="1.6" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - k).toFixed(3)}"/>
    <path d="M12 73V22l10-10h51" stroke="${p.gold}" stroke-width=".8" opacity=".55" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - k).toFixed(3)}"/>
    <rect x="14" y="14" width="7" height="7" transform="rotate(45 17.5 17.5)" fill="${p.gold}" opacity="${K(k).toFixed(3)}"/></svg>`;
  const card = (p) => `background:rgba(11,11,11,.86);border:1px solid ${p.line};box-shadow:0 20px 60px rgba(0,0,0,.5);`;

  const M = {
    // Khung cho cả video: grade ấm (back) + vignette, tint gold, viền mảnh vẽ dần, 4 hoa văn góc, tên thương hiệu cắt ngang viền trên.
    [`${P}_frame`](s, t, lt) {
      const g = geo(), p = pal(), k = E.outCubic(prog(lt, 0, 1.4)), ins = s.inset ?? (g.v ? 22 : 20), sz = 76;
      const grade = s.grade === false ? '' : 'contrast(1.07) saturate(.88) sepia(.14) brightness(.95)';
      const name = s.name ?? (BR().name || '');
      const back = `<div class="full"${cidOf(s)}>${grade ? arollImg(t, grade) : ''}</div>`;
      const front = `<div class="full" style="pointer-events:none">
        <div class="full" style="background:radial-gradient(ellipse 70% 58% at 50% 42%,rgba(0,0,0,0) 45%,rgba(11,11,11,${(s.vignette ?? .62).toFixed(2)}) 100%)"></div>
        <div class="full" style="background:${p.gold};mix-blend-mode:soft-light;opacity:.16"></div>
        <div class="full" style="background:linear-gradient(180deg,rgba(0,0,0,0) 58%,rgba(11,11,11,.55))"></div>
        <svg class="full" style="width:100%;height:100%" viewBox="0 0 ${g.W} ${g.H}" fill="none"><rect x="${ins}" y="${ins}" width="${g.W - 2 * ins}" height="${g.H - 2 * ins}" stroke="${p.gold}" stroke-width="1.2" opacity=".9" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - k).toFixed(3)}"/></svg>
        ${corner(ins - 2, ins - 2, 0, k, p)}${corner(g.W - ins - sz + 2, ins - 2, 90, k, p)}${corner(g.W - ins - sz + 2, g.H - ins - sz + 2, 180, k, p)}${corner(ins - 2, g.H - ins - sz + 2, 270, k, p)}
        ${name ? `<div class="abs" style="left:50%;top:${ins - 9}px;line-height:18px;transform:translateX(-50%);font:500 14px ${p.sans};letter-spacing:.42em;text-transform:uppercase;color:${p.gold};white-space:nowrap;opacity:${K(k).toFixed(3)};background:${p.ink};padding:0 14px;padding-left:calc(14px + .42em)">${esc(name)}</div>` : ''}
      </div>`;
      return { back, front };
    },

    // Intro tên dự án (full-frame ngắn): wash đen, kicker giữa 2 kẻ, từng chữ tiêu đề ánh kim hiện từ mờ, kẻ vàng mở ra, dòng vị trí nghiêng.
    [`${P}_intro`](s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .25, .5), dur = s.t1 - s.t0;
      const cx = s.x ?? g.W / 2, cy = s.y ?? g.H / 2, size = s.size || (g.v ? 64 : 72), w = s.w || (g.v ? 600 : 900);
      const kk = E.outCubic(prog(lt, .15, .7)), kr = E.outCubic(prog(lt, .9, .9)), ks = E.outCubic(prog(lt, 1.2, .7));
      const kw = K(prog(lt, 0, .3)) * (s.keep ? 1 : 1 - E.inCubic(prog(lt, dur - .5, .5)));
      const words = String(s.title || 'The Golden Residence').split(/\s+/).filter(Boolean);
      const title = words.map((w0, i) => { const k = E.outCubic(prog(lt, .35 + i * .14, .8));
        return `<span style="display:inline-block;opacity:${k.toFixed(3)};transform:translateY(${((1 - k) * 18).toFixed(1)}px);${k < .98 ? `filter:blur(${((1 - k) * 6).toFixed(1)}px);` : ''}${goldTxt(t, p)}">${esc(w0)}</span>`; }).join(' ');
      return { front: `<div class="full" style="background:${p.ink};opacity:${((s.wash ?? .82) * kw).toFixed(3)}"></div>
        <div class="abs"${cidOf(s)} style="left:${cx}px;top:${cy}px;width:${w}px;transform:translate(-50%,-50%);text-align:center;opacity:${o.toFixed(3)}">
          ${s.kicker !== '' ? kicker(s.kicker ?? 'DỰ ÁN', p, kk, g.v ? 16 : 17) : ''}
          <div style="margin-top:20px;font:600 ${size}px/1.15 ${p.serif};letter-spacing:.01em">${title}</div>
          <div style="margin:22px auto 0;width:${(kr * 140).toFixed(1)}px;height:1px;background:linear-gradient(90deg,transparent,${p.hi},transparent)"></div>
          ${s.sub ? `<div style="margin-top:16px;font:italic 400 ${g.v ? 22 : 24}px ${p.serif};color:${p.cream};opacity:${(ks * .85).toFixed(3)};letter-spacing:.08em">${esc(s.sub)}</div>` : ''}
        </div>`, hideCaptions: s.hideCaptions ?? true };
    },

    // Thẻ giá: thẻ đen viền vàng, thanh vàng trái, số đếm từ 0 (outExpo) chữ ánh kim, đơn vị nghiêng, ghi chú, badge ưu đãi.
    [`${P}_price`](s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .35, .4);
      const w = s.w || (g.v ? 580 : 500), h = s.h || (g.v ? 200 : 190), size = s.size || (g.v ? 80 : 72);
      const cx = s.x ?? (g.v ? g.W / 2 : g.W - 70 - w / 2), cy = s.y ?? (g.v ? 880 : g.H / 2 + 60);
      const ki = E.outCubic(prog(lt, 0, .6)), kb = E.outCubic(prog(lt, .2, .8)), kn = E.outExpo(prog(lt, .25, 1.3)), kt = E.outCubic(prog(lt, 1, .6));
      const raw = String(s.value ?? '3,2'), num = parseFloat(raw.replace(',', '.')), dec = (raw.split(/[.,]/)[1] || '').length;
      const shown = isNaN(num) ? raw : (num * kn).toFixed(dec).replace('.', ',');
      return { front: `<div class="abs"${cidOf(s)} style="left:${cx}px;top:${cy}px;width:${w}px;height:${h}px;transform:translate(-50%,-50%) translateY(${((1 - ki) * 26).toFixed(1)}px);opacity:${o.toFixed(3)};${card(p)}backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);overflow:hidden">
          <div class="abs" style="inset:6px;border:1px solid rgba(201,164,76,.3)"></div>
          <div class="abs" style="left:0;top:0;bottom:0;width:6px;background:linear-gradient(180deg,${p.hi},${p.gold},${p.lo});transform:scaleY(${kb.toFixed(3)});transform-origin:50% 0"></div>
          <div class="abs" style="left:34px;top:24px;font:500 15px ${p.sans};letter-spacing:.4em;text-transform:uppercase;color:${p.gold};opacity:${kb.toFixed(3)}">${esc(s.label ?? 'GIÁ CHỈ TỪ')}</div>
          <div class="abs" style="left:34px;top:46px;display:flex;align-items:baseline;gap:12px;white-space:nowrap">
            <span style="font:700 ${size}px/1.15 ${p.serif};${goldTxt(t, p)}">${esc(shown)}</span>
            <span style="font:italic 500 ${Math.round(size * .42)}px ${p.serif};color:${p.cream};opacity:${kn.toFixed(3)}">${esc(s.unit ?? 'tỷ')}</span></div>
          ${s.note ? `<div class="abs" style="left:34px;top:${h - 44}px;font:400 ${g.v ? 18 : 17}px ${p.sans};color:${p.mute};letter-spacing:.04em;opacity:${kt.toFixed(3)}">${esc(s.note)}</div>` : ''}
          ${s.badge ? `<div class="abs" style="right:-1px;top:-1px;padding:7px 16px;background:${p.gold};color:${p.ink};font:700 13px ${p.sans};letter-spacing:.22em;opacity:${kb.toFixed(3)};transform:translateX(${((1 - kb) * 30).toFixed(1)}px)">${esc(s.badge)}</div>` : ''}
        </div>` };
    },

    // Bản đồ vị trí: SVG đen (phố vẽ dần, sông, trục chính vàng, pin rơi, sóng lan) + danh sách điểm đến theo phút.
    [`${P}_map`](s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .35, .45);
      const w = s.w || (g.v ? 620 : 560), h = s.h || (g.v ? 250 : 240);
      const cx = s.x ?? (g.v ? g.W / 2 : g.W - 60 - w / 2), cy = s.y ?? (g.v ? 905 : g.H / 2 + 60);
      const mw = Math.round(w * .46), ki = E.outCubic(prog(lt, 0, .6)), kr = E.outCubic(prog(lt, .2, 1.1)), kp = E.outBack(prog(lt, .7, .6));
      let roads = '';
      for (let i = 0; i < 9; i++) { const a = rnd(i * 3 + 1), b = rnd(i * 3 + 2), c = rnd(i * 3 + 3), vt = i % 2;
        const x1 = vt ? a * 300 : -20, y1 = vt ? -20 : a * 200, x2 = vt ? a * 300 + (b - .5) * 80 : 320, y2 = vt ? 220 : a * 200 + (b - .5) * 60;
        roads += `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="rgba(201,164,76,${(.16 + c * .22).toFixed(2)})" stroke-width="${(1 + c * 1.5).toFixed(1)}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - kr).toFixed(3)}"/>`; }
      const rings = [0, 1].map(i => { const f = (t * .7 + i * .5) % 1; return `<circle cx="150" cy="100" r="${(4 + f * 34).toFixed(1)}" fill="none" stroke="${p.gold}" stroke-width="1.2" opacity="${((1 - f) * .8 * K(kp)).toFixed(3)}"/>`; }).join('');
      const svg = `<svg width="${mw}" height="${h - 2}" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" style="display:block">
        <rect width="300" height="200" fill="#121212"/>
        <path d="M-10 150C60 120 90 180 160 140S260 60 310 90" fill="none" stroke="rgba(201,164,76,.12)" stroke-width="14"/>${roads}
        <path d="M-10 100H310" stroke="${p.gold}" stroke-width="2.5" opacity=".7" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - kr).toFixed(3)}"/>${rings}
        <g transform="translate(150 ${(100 - (1 - kp) * 60).toFixed(1)})" opacity="${K(kp).toFixed(3)}"><path d="M0 0C-9 -12 -14 -18 -14 -27a14 14 0 0 1 28 0c0 9 -5 15 -14 27z" fill="${p.gold}"/><circle cx="0" cy="-27" r="5.5" fill="${p.ink}"/></g>
        <text x="150" y="128" text-anchor="middle" font-family="${p.serif}" font-style="italic" font-size="13" fill="${p.cream}" opacity="${K(kp).toFixed(3)}">${esc(s.place || 'Dự án')}</text></svg>`;
      const pois = s.pois || [{ name: 'Sân bay quốc tế', min: 15 }, { name: 'Trung tâm thành phố', min: 10 }, { name: 'Trường quốc tế', min: 5 }];
      const rows = pois.map((q, i) => { const k = E.outCubic(prog(lt, .6 + i * .28, .6));
        return `<div${cidOf(q)} style="display:flex;align-items:baseline;gap:12px;opacity:${k.toFixed(3)};transform:translateX(${((1 - k) * 16).toFixed(1)}px);min-width:0">
          <span style="font:700 ${g.v ? 26 : 24}px ${p.serif};color:${p.gold};min-width:${g.v ? 66 : 62}px;white-space:nowrap">${esc(String(q.min))}<span style="font:italic 400 ${g.v ? 15 : 14}px ${p.serif};margin-left:3px">phút</span></span>
          <span style="font:400 ${g.v ? 18 : 17}px ${p.sans};color:${p.cream};letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q.name)}</span></div>`; }).join('');
      return { front: `<div class="abs"${cidOf(s)} style="left:${cx}px;top:${cy}px;width:${w}px;height:${h}px;transform:translate(-50%,-50%) scale(${lerp(.96, 1, ki).toFixed(3)});opacity:${o.toFixed(3)};display:flex;${card(p)}overflow:hidden">
          <div style="width:${mw}px;height:100%;border-right:1px solid rgba(201,164,76,.4);flex:none">${svg}</div>
          <div style="flex:1;padding:${g.v ? 18 : 16}px 22px;display:flex;flex-direction:column;justify-content:center;gap:${g.v ? 12 : 10}px;min-width:0">
            <div style="font:500 14px ${p.sans};letter-spacing:.4em;text-transform:uppercase;color:${p.gold};margin-bottom:4px">${esc(s.label ?? 'VỊ TRÍ KẾT NỐI')}</div>${rows}</div></div>` };
    },

    // Chip tiện ích / thông số: icon + chữ trong chip đen viền vàng, bật ra lệch nhịp. Dọc: hàng ngang dưới mặt; ngang: cột trái.
    [`${P}_chips`](s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .3, .4), size = s.size || (g.v ? 22 : 20);
      const items = s.items || [{ icon: '🛏️', text: '3 phòng ngủ' }, { icon: '📐', text: '120 m²' }, { icon: '🏊', text: 'Hồ bơi vô cực' }];
      const cx = s.x ?? (g.v ? g.W / 2 : 230), cy = s.y ?? (g.v ? 790 : g.H / 2);
      const kt = E.outCubic(prog(lt, 0, .5));
      const html = items.map((it, i) => { const k = E.outBack(prog(lt, .15 + i * .22, .6));
        return `<div${cidOf(it)} style="display:flex;align-items:center;gap:10px;padding:10px 18px;background:rgba(11,11,11,.82);border:1px solid ${p.gold};opacity:${K(k).toFixed(3)};transform:scale(${lerp(.7, 1, Math.max(0, k)).toFixed(3)});white-space:nowrap;font:500 ${size}px ${p.sans};color:${p.cream};letter-spacing:.03em">
          ${it.icon ? `<span style="display:inline-flex;width:${size + 6}px;height:${size + 6}px;align-items:center;justify-content:center;font-size:${size}px;line-height:1">${slIcon(it.icon, size + 2, 'white')}</span>` : ''}${esc(it.text)}</div>`; }).join('');
      return { front: `<div class="abs"${cidOf(s)} style="left:${cx}px;top:${cy}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:14px;opacity:${o.toFixed(3)}">
          ${s.title ? `<div style="font:500 14px ${p.sans};letter-spacing:.45em;padding-left:.45em;text-transform:uppercase;color:${p.gold};opacity:${kt.toFixed(3)}">${esc(s.title)}</div>` : ''}
          <div style="display:flex;flex-direction:${g.v ? 'row' : 'column'};flex-wrap:wrap;justify-content:center;gap:12px;max-width:${g.v ? 640 : 420}px">${html}</div></div>` };
    },

    // Wipe vàng: tấm đen nghiêng quét ngang, mép dẫn dải gradient vàng, loé vàng nhẹ toàn khung.
    [`${P}_wipe`](s, t, lt) {
      const g = geo(), p = pal(), dur = Math.max(.2, s.t1 - s.t0), k = E.inOutSine(K(lt / dur)), dir = s.dir === 'left' ? -1 : 1;
      const sw = g.W * 1.2, x = lerp(-g.W * .62, g.W * .62, k) * dir, left = g.W / 2 + x - sw / 2, bell = Math.sin(Math.PI * k);
      const edge = dir > 0 ? `left:${(left + sw - 2).toFixed(1)}px` : `left:${(left - 58).toFixed(1)}px`;
      return { front: `<div class="full"${cidOf(s)} style="pointer-events:none;overflow:hidden">
          <div class="abs" style="left:${left.toFixed(1)}px;top:-12%;width:${sw}px;height:124%;transform:skewX(${-14 * dir}deg);background:${p.ink};box-shadow:0 0 60px rgba(0,0,0,.6)"></div>
          <div class="abs" style="${edge};top:-12%;width:60px;height:124%;transform:skewX(${-14 * dir}deg);background:linear-gradient(90deg,${dir > 0 ? `${p.gold},${p.hi},transparent` : `transparent,${p.hi},${p.gold}`})"></div>
          <div class="full" style="background:${p.gold};mix-blend-mode:screen;opacity:${(bell * .22).toFixed(3)}"></div></div>` };
    },

    // CTA gọi điện: panel đen dâng lên (dọc) / từ phải (ngang), kicker, ống nghe rung, hotline ánh kim, tên đơn vị, website, nút GỌI NGAY pulse.
    [`${P}_cta`](s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .4, .5), b = BR() || {};
      const phone = s.phone ?? (b.phone || '0909 123 456'), name = s.name ?? (b.name || 'Phòng kinh doanh dự án'), web = s.web ?? (b.website || '');
      const px = s.x ?? (g.v ? g.W / 2 : g.W - 260), py = s.y ?? (g.v ? 1010 : g.H / 2), size = s.size || (g.v ? 56 : 50);
      const ki = E.outCubic(prog(lt, 0, .7)), kp = E.outCubic(prog(lt, .4, .7)), kb = Math.max(0, E.outBack(prog(lt, .9, .6)));
      const pulse = .5 + .5 * Math.sin(t * 4), ring = Math.sin(t * 2.2) > .3 ? Math.sin(t * 28) * 7 : 0;
      const panel = g.v
        ? `<div class="abs" style="left:0;right:0;top:${g.H - 580}px;bottom:0;background:linear-gradient(180deg,rgba(11,11,11,0),${p.ink} 38%);opacity:${(o * ki).toFixed(3)}"></div>`
        : `<div class="abs" style="top:0;bottom:0;right:0;width:580px;background:linear-gradient(90deg,rgba(11,11,11,0),${p.ink} 42%);opacity:${(o * ki).toFixed(3)}"></div>`;
      const icon = `<svg width="${Math.round(size * .8)}" height="${Math.round(size * .8)}" viewBox="0 0 24 24" style="transform:rotate(${ring.toFixed(1)}deg);flex:none"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8z" fill="${p.gold}"/></svg>`;
      return { front: `${panel}<div class="abs"${cidOf(s)} style="left:${px}px;top:${py}px;transform:translate(-50%,-50%);text-align:center;opacity:${o.toFixed(3)};white-space:nowrap">
          ${kicker(s.kicker ?? 'LIÊN HỆ TƯ VẤN', p, ki)}
          <div style="margin-top:14px;display:flex;align-items:center;justify-content:center;gap:16px;opacity:${kp.toFixed(3)};transform:translateY(${((1 - kp) * 14).toFixed(1)}px)">${icon}<span style="font:700 ${size}px/1.1 ${p.serif};${goldTxt(t, p)}">${esc(phone)}</span></div>
          <div style="margin-top:10px;font:italic 400 ${g.v ? 22 : 21}px ${p.serif};color:${p.cream};opacity:${(kp * .9).toFixed(3)}">${esc(name)}</div>
          ${web ? `<div style="margin-top:6px;font:400 15px ${p.sans};letter-spacing:.18em;color:${p.mute};opacity:${kp.toFixed(3)}">${esc(web)}</div>` : ''}
          <div style="display:inline-block;margin-top:22px;padding:14px 44px;padding-left:calc(44px + .3em);background:linear-gradient(100deg,${p.gold},${p.hi},${p.gold});color:${p.ink};font:700 ${g.v ? 20 : 19}px ${p.sans};letter-spacing:.3em;transform:scale(${(kb * (1 + pulse * .03)).toFixed(3)});box-shadow:0 0 ${(16 + pulse * 24).toFixed(0)}px rgba(201,164,76,.5);opacity:${K(kb).toFixed(3)}">${esc(s.btn ?? 'GỌI NGAY')}</div>
        </div>`, hideCaptions: s.hideCaptions ?? true };
    },
  };
  Object.assign(MODULES, M);

  // ---------- Phụ đề: hộp đen mảnh kẻ vàng trên/dưới, từ hiện theo w.s, từ hl Playfair nghiêng ánh kim ----------
  CAPTION_STYLES[P] = (c, t) => {
    const g = geo(), p = pal(), size = c.size || (g.v ? 30 : 26), wpx = g.v ? 600 : 900;
    const x = c.x ?? g.W / 2, top = c.y ?? (g.v ? 1060 : 622);
    const html = (c.words || []).map(w => { const k = E.outCubic(prog(t, w.s - .04, .22));
      const hs = w.hl ? `font-family:${p.serif};font-style:italic;font-weight:600;${goldTxt(t, p)}` : `color:${c.color || p.cream};`;
      return `<span style="display:inline-block;opacity:${(.18 + .82 * k).toFixed(3)};transform:translateY(${((1 - k) * 6).toFixed(1)}px);${hs}">${esc(w.w)}</span>` + (w.br && g.v ? '<br>' : ' '); }).join('');
    return `<div id="cap"${cidOf(c)} style="top:${top}px;left:${x - wpx / 2}px;right:auto;width:${wpx}px;text-align:center;font-family:${c.font || p.sans};font-weight:${c.weight || 500};font-size:${size}px;line-height:1.45;letter-spacing:.02em;color:${c.color || p.cream};white-space:normal">
      <span style="display:inline-block;padding:10px 24px;background:rgba(11,11,11,.72);border-top:1px solid rgba(201,164,76,.8);border-bottom:1px solid rgba(201,164,76,.8);box-shadow:0 10px 30px rgba(0,0,0,.4)">${html}</span></div>`;
  };

  // ---------- Metadata + recipe ----------
  const mk = (type, d, o) => T => ({ type, t0: T, t1: T + d, ...o });
  PACKS.push({
    id: P, name: 'BĐS sang trọng đen – vàng', icon: '🏛️',
    desc: 'Bất động sản cao cấp: đen tuyền – vàng gold, serif Playfair, khung viền mảnh hoa văn góc, intro tên dự án ánh kim, thẻ giá đếm số, bản đồ vị trí, chip tiện ích, wipe vàng, CTA hotline',
    caption: P,
    items: [
      { type: `${P}_frame`, label: 'Khung sang trọng (cả video)', make: T => ({ type: `${P}_frame`, t0: 0, t1: Math.max(T + 3, (typeof TL !== 'undefined' && TL && TL.duration) || T + 10) }) },
      { type: `${P}_intro`, label: 'Intro tên dự án', make: mk(`${P}_intro`, 2.5, { kicker: 'DỰ ÁN', title: 'The Golden Residence', sub: 'Quận 2 · Thành phố Hồ Chí Minh' }) },
      { type: `${P}_price`, label: 'Thẻ giá', make: mk(`${P}_price`, 3.5, { label: 'GIÁ CHỈ TỪ', value: '3,2', unit: 'tỷ / căn', note: 'Thanh toán linh hoạt 24 tháng · Hỗ trợ vay 70%', badge: 'ƯU ĐÃI 5%' }) },
      { type: `${P}_map`, label: 'Bản đồ vị trí', make: mk(`${P}_map`, 3.6, { place: 'The Golden Residence', label: 'VỊ TRÍ KẾT NỐI', pois: [{ name: 'Sân bay quốc tế', min: 15 }, { name: 'Trung tâm Quận 1', min: 10 }, { name: 'Trường quốc tế', min: 5 }] }) },
      { type: `${P}_chips`, label: 'Chip tiện ích', make: mk(`${P}_chips`, 3.2, { title: 'TIỆN ÍCH NỔI BẬT', items: [{ icon: '🛏️', text: '3 phòng ngủ' }, { icon: '📐', text: '120 m²' }, { icon: '🏊', text: 'Hồ bơi vô cực' }, { icon: '🌳', text: 'Công viên 2 ha' }] }) },
      { type: `${P}_wipe`, label: 'Wipe vàng chuyển cảnh', make: mk(`${P}_wipe`, .7, { dir: 'right' }) },
      { type: `${P}_cta`, label: 'CTA gọi điện', make: mk(`${P}_cta`, 4, { kicker: 'LIÊN HỆ TƯ VẤN', phone: '0909 123 456', name: 'Phòng kinh doanh dự án', web: 'goldenresidence.vn', btn: 'GỌI NGAY' }) },
    ],
    recipe: ctx => {
      const dur = Math.max(3, +ctx.dur || 20), caps = ctx.captions || [], b = ctx.brand || {}, sc = [], fx = [];
      const T = x => +Math.max(0, Math.min(dur, x)).toFixed(2);
      const iEnd = Math.min(2.5, dur * .3), cLen = Math.min(4, dur * .3), cStart = dur - cLen;
      sc.push({ type: `${P}_frame`, t0: 0, t1: dur, name: b.name || '' });
      sc.push({ type: `${P}_intro`, t0: 0, t1: T(iEnd), kicker: 'DỰ ÁN', title: ctx.title || 'The Golden Residence', sub: b.city || 'Vị trí vàng · Trung tâm thành phố' });
      fx.push({ t: T(iEnd - .2), type: 'flash', amp: .5 }, { t: T(iEnd), type: 'zoom_in', amp: .35 });
      const lo = iEnd + .4, hi = cStart - .5;
      if (hi - lo > 1.5) {
        const want = [
          { type: `${P}_price`, keys: ['giá', 'tỷ', 'triệu', 'thanh toán', 'chiết khấu', 'ưu đãi'], d: 3.5, fx: 'punch', o: { label: 'GIÁ CHỈ TỪ', value: '3,2', unit: 'tỷ / căn', note: 'Thanh toán linh hoạt 24 tháng', badge: 'ƯU ĐÃI 5%' } },
          { type: `${P}_chips`, keys: ['phòng', 'diện tích', 'mét', 'tầng', 'tiện ích', 'hồ bơi', 'view', 'nội thất'], d: 3.2, fx: 'punch', o: { title: 'TIỆN ÍCH NỔI BẬT', items: [{ icon: '🛏️', text: '3 phòng ngủ' }, { icon: '📐', text: '120 m²' }, { icon: '🏊', text: 'Hồ bơi vô cực' }] } },
          { type: `${P}_map`, keys: ['vị trí', 'trung tâm', 'phút', 'cách', 'gần', 'kết nối', 'sân bay'], d: 3.6, fx: 'zoom_in', o: { place: ctx.title || 'Dự án', label: 'VỊ TRÍ KẾT NỐI', pois: [{ name: 'Sân bay quốc tế', min: 15 }, { name: 'Trung tâm thành phố', min: 10 }, { name: 'Trường quốc tế', min: 5 }] } },
        ];
        const fw = keys => { const s = findWord(caps, keys, lo); return s != null && s >= lo && s < hi - 1.2 ? s : null; };
        const picks = want.map((w, i) => ({ ...w, t: fw(w.keys) ?? lo + (hi - lo) * (i + .5) / want.length - w.d / 2 })).sort((a, c) => a.t - c.t);
        let last = lo - .6;
        for (const w of picks) {
          const t0 = Math.max(w.t, lo, last + .6), t1 = Math.min(t0 + w.d, hi);
          if (t1 - t0 < 1.2) continue;
          sc.push({ type: w.type, t0: T(t0), t1: T(t1), ...w.o }); fx.push({ t: T(t0), type: w.fx, amp: .45 }); last = t1;
        }
      }
      if (cStart + .35 <= dur && cStart - .35 > iEnd) { sc.push({ type: `${P}_wipe`, t0: T(cStart - .35), t1: T(cStart + .35), dir: 'right' }); fx.push({ t: T(cStart - .35), type: 'whip', amp: .6 }); }
      sc.push({ type: `${P}_cta`, t0: T(cStart), t1: dur, kicker: 'LIÊN HỆ TƯ VẤN', phone: b.phone || '0909 123 456', name: b.name || 'Phòng kinh doanh dự án', web: b.website || '', btn: 'GỌI NGAY' });
      return { caption_style: P, music: 'corporate', scenes: sc, fx };
    },
  });
})();

} catch (e) { console.error('user pack u_bds_den_gold.js', e); }

// ---- u_studio_luoi_ai.js ----
try {
// Style Lab: "Studio lưới AI" (clone từ video snaptik.vn_7702089090908409095_wm.mp4) — 2026-11-03. Spec: references/user/u_studio_luoi_ai.md
// Pack "u_studio_luoi_ai" — "Studio lưới AI": talking head shrunk to a rounded card on a slate blueprint grid with an orange
// app tile above; captions styled as an editor text box being selected (dashed border + handles + cursor); yellow
// serif highlight tags, neon / glow words, LED headline, blurred "focus" diagram with chips & pills, topic card, glowing outro.
(() => {
  const P = 'u_studio_luoi_ai';
  const SANS = "'Be Vietnam Pro',system-ui,sans-serif", SERIF = "'Playfair Display',Georgia,serif", DISP = "'Bungee','Oswald',Impact,sans-serif";
  const A = 'position:absolute;';
  const pal = () => { const b = (typeof BR === 'function' && BR()) || {};
    return { accent: b.accent && b.accent !== '#FFD84A' ? b.accent : '#E8703F', yellow: '#FFE24D', blue: '#6FA8E6', mint: '#B8FFE6', red: '#FF3B5C', ink: '#1C1A1A',
      slate: '#3B4751', sel: 'rgba(52,56,86,.86)', font: b.font && b.font !== 'var(--sans)' ? b.font : SANS, logo: b.logo, name: b.name, handle: b.handle }; };
  const geo = () => { const [W, H] = DIMS(); return { W, H, v: VERT() }; };
  const sc = (type, t) => (TL.scenes || []).find(x => x.type === `${P}_${type}` && !x.hidden && t >= x.t0 && t < x.t1);
  // Video card geometry: inside the grid frame when one is active, else the full frame.
  const inset = t => { const g = geo(), f = sc('grid', t);
    if (!f) return { x: 0, y: 0, w: g.W, h: g.H, r: 0, on: false };
    const m = f.margin ?? (g.v ? 44 : 110), top = f.top ?? (g.v ? 118 : 50), bot = f.bottom ?? (g.v ? 118 : 50);
    return { x: m, y: top, w: g.W - 2 * m, h: g.H - top - bot, r: f.radius ?? 22, on: true }; };
  // A-roll scaled + cropped (cover) into rect I, optional CSS filter.
  const aroll = (t, I, filter, extra = '') => { const g = geo(), k = Math.max(I.w / g.W, I.h / g.H);
    return `<div style="${A}left:${I.x.toFixed(1)}px;top:${I.y.toFixed(1)}px;width:${I.w.toFixed(1)}px;height:${I.h.toFixed(1)}px;border-radius:${I.r.toFixed(1)}px;overflow:hidden;${extra}"><div style="${A}left:${((I.w - g.W * k) / 2).toFixed(1)}px;top:${((I.h - g.H * k) / 2).toFixed(1)}px;width:${g.W}px;height:${g.H}px;transform:scale(${k.toFixed(4)});transform-origin:0 0">${arollImg(t, filter || '')}</div></div>`; };
  const blurLayer = (t, I, k) => aroll(t, I, `blur(${(14 * k).toFixed(1)}px) brightness(${(1 - .5 * k).toFixed(2)}) saturate(.8)`, `opacity:${k.toFixed(3)}`);
  const life = (s, t, a = .3, b = .3) => fadeIO(t, s.t0, s.t1, a, b);
  const pop = (lt, t0, d = .35) => E.outBack(prog(lt, t0, d));
  const STAR = '<svg viewBox="0 0 40 40" width="100%" height="100%"><g fill="#fff">' + Array.from({ length: 8 }, (_, i) => `<path d="M20 20 L17.5 6 Q20 2 22.5 6 Z" transform="rotate(${i * 45} 20 20)"/>`).join('') + '</g></svg>';
  // Orange app tile with the brand logo (or a neutral white star).
  const tile = (size, p, extra = '') => `<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size * .26)}px;background:${p.accent};box-shadow:0 8px 24px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;${extra}"><div style="width:${Math.round(size * .56)}px;height:${Math.round(size * .56)}px">${p.logo ? slIcon(p.logo, Math.round(size * .56), 'white') : STAR}</div></div>`;
  // Editor selection handles for a box.
  const handles = () => ['left:-5px;top:-5px', 'right:-5px;top:-5px', 'left:-5px;bottom:-5px', 'right:-5px;bottom:-5px'].map(q => `<i style="${A}${q};width:9px;height:9px;background:#fff;border:1.5px solid #3A3F6B"></i>`).join('');
  const hlTag = (txt, p, size) => `<span style="display:inline-block;background:${p.yellow};color:${p.ink};font:italic 700 ${size}px/1.15 ${SERIF};padding:.04em .4em .08em;border-radius:4px;transform:rotate(-2deg);box-shadow:0 4px 14px rgba(0,0,0,.35)">${esc(txt)}</span>`;
  const node = (x, y, k, html) => `<div style="${A}left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;transform:translate(-50%,-50%) scale(${k.toFixed(3)});opacity:${Math.min(1, k).toFixed(3)};text-align:center">${html}</div>`;
  const typed = (text, lt, start, cps) => { const ch = [...String(text || '')], n = Math.max(0, Math.min(ch.length, Math.floor((lt - start) * cps))); return esc(ch.slice(0, n).join('')) + `<span style="opacity:0">${esc(ch.slice(n).join(''))}</span>`; };

  const M = {
    // Grid frame for the whole talk: slate blueprint grid, video zooms out into a rounded card, app tile above.
    [`${P}_grid`](s, t, lt) {
      const g = geo(), p = pal(), I = inset(t), k = s.intro === false ? 1 : E.outCubic(prog(lt, 0, .5));
      const J = { x: lerp(0, I.x, k), y: lerp(0, I.y, k), w: lerp(g.W, I.w, k), h: lerp(g.H, I.h, k), r: I.r * k };
      const sh = (t * 6) % 28, ts = Math.min(64, I.y - 14), tk = pop(lt, .35, .45);
      const back = `<div class="full"${cidOf(s)} style="background:${s.bg || p.slate};opacity:${k.toFixed(3)}">
        <div class="full" style="background-image:linear-gradient(rgba(255,255,255,.11) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.11) 1px,transparent 1px);background-size:28px 28px;background-position:${sh.toFixed(1)}px ${sh.toFixed(1)}px"></div>
        <div class="full" style="background:radial-gradient(ellipse 70% 60% at 50% 45%,rgba(0,0,0,0),rgba(0,0,0,.45))"></div></div>
        <div class="full" style="filter:drop-shadow(0 20px 50px rgba(0,0,0,${(.5 * k).toFixed(2)}))">${aroll(t, J)}</div>`;
      const front = s.logo === false ? '' : `<div style="${A}left:${s.x ?? g.W / 2}px;top:${s.y ?? I.y / 2}px;transform:translate(-50%,-50%) scale(${tk.toFixed(3)}) translateY(${(Math.sin(t * 2) * 2).toFixed(1)}px);opacity:${Math.min(1, tk).toFixed(3)}">${tile(ts, p)}</div>`;
      return { back, front, cover: true };
    },

    // Hook: mock editor panel drops from the top, title inside an "editor text box being selected", cursor glides in and nudges it.
    [`${P}_hook`](s, t, lt) {
      const g = geo(), p = pal(), I = inset(t), o = life(s, t, .2, .3), size = s.size || (g.v ? 34 : 30);
      const cx = s.x ?? g.W / 2, cy = s.y ?? I.y + I.h * (g.v ? .72 : .8), w = s.w || Math.min(I.w - 60, g.v ? 560 : 760);
      const kb = pop(lt, .1, .4), kc = E.inOutSine(prog(lt, .5, .7)), nud = E.outCubic(prog(lt, 1.3, .4));
      const pw = g.v ? 540 : 520, ph = g.v ? 230 : 200, px = s.px ?? (g.v ? g.W / 2 - pw / 2 : I.x + 30), py = s.py ?? I.y + (g.v ? 40 : 30), kp = pop(lt, 0, .6);
      const chips = (n, y, seed) => Array.from({ length: n }, (_, i) => `<i style="${A}left:${(12 + i * (pw - 24) / n).toFixed(0)}px;top:${y}px;width:${((pw - 24) / n - 6).toFixed(0)}px;height:14px;border-radius:4px;background:${['#F3C6D9', '#D9D4F5', '#F8E79A', '#CDE8D4'][(i + seed) % 4]}"></i>`).join('');
      const panel = s.panel === false ? '' : `<div style="${A}left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;border-radius:14px;background:#F6F4EE;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden;transform:translateY(${((1 - kp) * -60).toFixed(1)}px);opacity:${Math.min(1, kp).toFixed(3)}">
          <div style="${A}left:0;top:0;right:0;height:26px;background:#E9E6DE"></div>${['#FF5F57', '#FEBC2E', '#28C840'].map((c, i) => `<i style="${A}left:${12 + i * 16}px;top:8px;width:10px;height:10px;border-radius:50%;background:${c}"></i>`).join('')}
          ${[0, 1, 2, 3, 4].map(i => `<i style="${A}left:14px;top:${40 + i * 18}px;width:${90 - i * 8}px;height:8px;border-radius:4px;background:#D9D6CE"></i>`).join('')}
          <div style="${A}left:${pw / 2 - 38}px;top:38px;width:76px;height:${ph - 120}px;border-radius:8px;background:#1C1A1A"><div style="${A}left:50%;top:50%;width:40px;height:40px;transform:translate(-50%,-50%);border-radius:50%;background:${p.accent};opacity:.9"></div></div>
          <i style="${A}left:${(14 + (pw - 28) * ((lt * .25) % 1)).toFixed(1)}px;top:${ph - 62}px;width:2px;height:54px;background:#E0443E"></i>
          ${chips(6, ph - 58, 0)}${chips(5, ph - 38, 1)}${chips(7, ph - 18, 2)}</div>`;
      const box = `<div${cidOf(s)} style="${A}left:${cx}px;top:${cy}px;width:${w}px;transform:translate(-50%,-50%) scale(${kb.toFixed(3)}) translateX(${(nud * -6).toFixed(1)}px);text-align:center;opacity:${Math.min(1, kb).toFixed(3)}">
          <div style="display:inline-block;position:relative;padding:10px 20px;background:${p.sel};border:1.5px dashed rgba(255,255,255,.8);border-radius:4px;font:600 ${size}px/1.25 ${p.font};color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.5)">${esc(s.title || 'AI edit video thì nó làm gì?')}${handles()}</div></div>`;
      const tl = s.tile === false ? '' : `<div style="${A}left:${cx - w / 2 + 30}px;top:${cy - 30}px;transform:translate(-50%,-50%) scale(${pop(lt, .25, .4).toFixed(3)})">${tile(g.v ? 76 : 64, p)}</div>`;
      const cur = `<svg style="${A}left:${lerp(cx + w / 2 + 120, cx + w / 2 - 30, kc).toFixed(1)}px;top:${lerp(cy + 140, cy + 24, kc).toFixed(1)}px;width:30px;height:38px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))" viewBox="0 0 30 38"><path d="M3 2 L3 30 L10 23 L15 35 L21 32 L16 21 L26 21 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>`;
      return { front: `<div class="full" style="opacity:${o.toFixed(3)}">${panel}${box}${tl}${cur}</div>`, hideCaptions: s.hideCaptions ?? true };
    },

    // Keyword pop above the face: yellow serif box / red neon / mint glow.
    [`${P}_tag`](s, t, lt) {
      const g = geo(), p = pal(), I = inset(t), o = life(s, t, .15, .25), look = s.look || 'yellow';
      const x = s.x ?? g.W / 2, y = s.y ?? I.y + (g.v ? 230 : 110), size = s.size || (look === 'glow' ? (g.v ? 110 : 96) : look === 'neon' ? (g.v ? 64 : 56) : (g.v ? 46 : 40));
      const k = pop(lt, 0, .4), fl = rnd(Math.floor(t * 20)) > .9 ? .55 : 1, c = s.color;
      let inner;
      if (look === 'neon') inner = `<div style="font:800 ${size}px/1.1 ${p.font};color:${c || p.red};opacity:${fl};text-shadow:0 0 10px ${c || p.red},0 0 36px ${c || p.red},0 0 70px rgba(255,59,92,.6)">${esc(s.text || 'đáng sợ')}</div>`;
      else if (look === 'glow') inner = `<div style="font:800 ${size}px/1 ${p.font};color:${c || p.mint};letter-spacing:-.02em;text-shadow:0 0 14px rgba(94,240,185,.9),0 0 50px rgba(94,240,185,.55);filter:blur(${((1 - Math.min(1, k)) * 8).toFixed(1)}px)">${esc(s.text || 'AI')}</div>`;
      else inner = hlTag(s.text || 'gây shock', p, size);
      return { front: `<div${cidOf(s)} style="${A}left:${x}px;top:${y}px;transform:translate(-50%,-50%) scale(${k.toFixed(3)});opacity:${(o * Math.min(1, k)).toFixed(3)};white-space:nowrap">${inner}</div>` };
    },

    // Topic card over a blurred frame: kicker → big blue title → 16:9 b/w picture → yellow tag.
    [`${P}_card`](s, t, lt) {
      const g = geo(), p = pal(), I = inset(t), o = life(s, t, .3, .35);
      const cx = s.x ?? I.x + I.w / 2, y0 = s.y ?? I.y + (g.v ? 90 : 40), w = s.w || Math.min(I.w - 80, g.v ? 440 : 520);
      const k1 = pop(lt, .1), k2 = pop(lt, .35, .5), k3 = pop(lt, .8, .5), k4 = pop(lt, 1.5, .4);
      const img = s.img ? `<img src="${media(s.img, t)}" style="width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.15)">`
        : `<div class="full" style="background:radial-gradient(circle at 12px 8px,#E4E4E0 4px,transparent 5px) 0 0/24px 34px,linear-gradient(90deg,transparent 6px,#BDBDB8 6px 18px,transparent 18px) 0 14px/24px 34px,linear-gradient(180deg,#6E6E6B,#2A2A28);transform:scale(${(1 + lt * .02).toFixed(3)})"></div>`;
      return { front: `<div class="full" style="opacity:${o.toFixed(3)}">${s.dim === false ? '' : blurLayer(t, I, o)}
        <div${cidOf(s)} style="${A}left:${cx}px;top:${y0}px;width:${w}px;transform:translateX(-50%);text-align:center">
          <div style="font:500 ${g.v ? 19 : 17}px ${p.font};color:rgba(255,255,255,.85);opacity:${Math.min(1, k1).toFixed(3)};transform:translateY(${((1 - k1) * 10).toFixed(1)}px)">${esc(s.kicker || 'viễn cảnh phim')}</div>
          <div style="margin-top:4px;font:800 ${s.size || (g.v ? 64 : 56)}px/1.1 ${p.font};color:${s.color || p.blue};letter-spacing:-.02em;text-shadow:0 4px 24px rgba(0,0,0,.5);transform:scale(${k2.toFixed(3)});opacity:${Math.min(1, k2).toFixed(3)}">${esc(s.title || 'Robot nổi loạn')}</div>
          <div style="position:relative;margin:18px auto 0;width:100%;height:${Math.round(w * 9 / 16)}px;border-radius:12px;overflow:hidden;box-shadow:0 14px 40px rgba(0,0,0,.5);transform:scale(${k3.toFixed(3)});opacity:${Math.min(1, k3).toFixed(3)}">${img}</div>
          ${s.tag ? `<div style="margin-top:18px;transform:scale(${k4.toFixed(3)});opacity:${Math.min(1, k4).toFixed(3)}">${hlTag(s.tag, p, g.v ? 30 : 26)}</div>` : ''}</div></div>`, hideCaptions: s.hideCaptions ?? false };
    },

    // LED headline: row of app tiles, then dotted orange LED text typed in letter by letter, dots scrolling, occasional flicker.
    [`${P}_led`](s, t, lt) {
      const g = geo(), p = pal(), I = inset(t), o = life(s, t, .2, .3), size = s.size || (g.v ? 74 : 64);
      const x = s.x ?? g.W / 2, y = s.y ?? I.y + (g.v ? 215 : 110), icons = s.icons || ['🤖', '✨', '🧠', '⚡', '🔥'];
      const col = s.color || '#FF8A3D', off = (t * 40) % 6, fl = rnd(Math.floor(t * 12)) > .93 ? .7 : 1;
      const row = `<div style="position:relative;display:flex;gap:10px;justify-content:center;margin-bottom:14px">${icons.map((ic, i) => { const k = pop(lt, i * .07, .4); return `<div style="width:44px;height:44px;border-radius:11px;background:#2B2B30;border:1px solid rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;transform:scale(${k.toFixed(3)});opacity:${Math.min(1, k).toFixed(3)}"><div style="width:26px;height:26px">${slIcon(ic, 26, 'white')}</div></div>`; }).join('')}</div>`;
      const led = `<div style="position:relative;font:400 ${size}px/1.05 ${DISP};letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;color:transparent;background:radial-gradient(circle,${col} 1.7px,rgba(255,138,61,.15) 2.3px,transparent 2.6px) ${off.toFixed(1)}px 0/6px 6px;-webkit-background-clip:text;background-clip:text;filter:drop-shadow(0 0 10px rgba(255,138,61,.7)) drop-shadow(0 0 28px rgba(255,120,40,.4));opacity:${fl}">${typed(s.text || 'TIN SỐC', lt, .25, s.cps ?? 14)}</div>`;
      return { front: `<div${cidOf(s)} style="${A}left:${x}px;top:${y}px;transform:translate(-50%,-50%);text-align:center;opacity:${o.toFixed(3)}"><div style="${A}left:-80px;right:-80px;top:-40px;bottom:-40px;background:radial-gradient(ellipse 60% 60% at 50% 55%,rgba(0,0,0,.55),transparent 70%)"></div>${row}${led}</div>` };
    },

    // Focus diagram over a blurred, darkened frame: person node → two chips → yellow pill above → outlined pill below, with drawn connectors.
    [`${P}_map`](s, t, lt) {
      const g = geo(), p = pal(), I = inset(t), o = life(s, t, .35, .4), st = s.step ?? .75, R = g.v ? 1 : .8;
      const cx = s.x ?? I.x + I.w / 2, cy = s.y ?? I.y + I.h * (g.v ? .5 : .55);
      const chips = s.chips || [{ icon: '🏢', label: 'Công ty A' }, { icon: '🏢', label: 'Công ty B' }];
      const dx = (g.v ? 150 : 210) * R, dyC = 160 * R, dyT = -150 * R, dyB = 280 * R, cxOf = i => cx + (chips.length === 1 ? 0 : (i ? dx : -dx));
      const k0 = pop(lt, .3), k1 = pop(lt, .3 + st), k2 = pop(lt, .3 + 2 * st), k3 = pop(lt, .3 + 3 * st);
      const line = (x1, y1, x2, y2, k) => `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${((y1 + y2) / 2).toFixed(1)},${x2.toFixed(1)} ${((y1 + y2) / 2).toFixed(1)},${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.5" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - clamp(k)).toFixed(3)}"/>`;
      const svg = `<svg style="${A}left:0;top:0" width="${g.W}" height="${g.H}">${chips.map((c, i) => line(cx, cy + 40, cxOf(i), cy + dyC - 18, k1)).join('')}${s.top === '' ? '' : line(cx, cy - 40, cx, cy + dyT + 20, k2)}${s.bottom === '' ? '' : line(cx, cy + 40, cx, cy + dyB - 20, k3)}</svg>`;
      const PERSON = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="${p.yellow}" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
      const center = node(cx, cy, k0, `<div style="width:72px;height:72px;border-radius:50%;border:1.5px solid ${p.yellow};background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;margin:0 auto">${s.icon ? slIcon(s.icon, 34, 'white') : PERSON}</div><div style="margin-top:8px;font:500 17px ${p.font};color:#fff;white-space:nowrap;text-shadow:0 1px 4px #000">${esc(s.center || 'nhà nghiên cứu')}</div>`);
      const chip = (c, i) => node(cxOf(i), cy + dyC, pop(lt, .3 + st + i * .15), `<div${cidOf(c)} style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;background:#2B2B30;border:1px solid rgba(255,255,255,.15);box-shadow:0 6px 18px rgba(0,0,0,.4);font:600 ${g.v ? 19 : 17}px ${p.font};color:#fff;white-space:nowrap">${c.icon ? `<span style="display:inline-block;width:22px;height:22px">${slIcon(c.icon, 22, 'white')}</span>` : ''}${esc(c.label)}</div>`);
      const top = s.top === '' ? '' : node(cx, cy + dyT, k2, `<div style="display:inline-block;padding:7px 18px;border-radius:999px;background:${p.yellow};color:${p.ink};font:700 ${g.v ? 22 : 19}px ${p.font};white-space:nowrap;box-shadow:0 6px 20px rgba(255,226,77,.35)">✦ ${esc(s.top || 'siêu trí tuệ')}</div>`);
      const bottom = s.bottom === '' ? '' : node(cx, cy + dyB, k3, `<div style="display:inline-block;padding:7px 18px;border-radius:999px;border:1.5px solid ${p.yellow};background:rgba(0,0,0,.5);color:#fff;font:700 ${g.v ? 22 : 19}px ${p.font};white-space:nowrap">✦ ${esc(s.bottom || 'tự cải thiện')}</div>`);
      const kick = s.kicker ? `<div style="${A}left:${I.x + I.w / 2}px;top:${I.y + (g.v ? 62 : 40)}px;transform:translateX(-50%);font:500 ${g.v ? 19 : 17}px ${p.font};color:rgba(255,255,255,.85);white-space:nowrap;text-shadow:0 1px 4px #000">${esc(s.kicker)}</div>` : '';
      return { front: `<div class="full" style="opacity:${o.toFixed(3)}">${s.dim === false ? '' : blurLayer(t, I, o)}${kick}<div class="full"${cidOf(s)}>${svg}${center}${chips.map(chip).join('')}${top}${bottom}</div></div>` };
    },

    // Outro on black: glowing orange display title typed in, white pill with logo + channel name, italic question, handle, ghost text.
    [`${P}_outro`](s, t, lt) {
      const g = geo(), p = pal(), ki = E.outCubic(prog(lt, 0, .5)), o = fadeIO(t, s.t0, s.t1, .5, .4);
      const cx = s.x ?? g.W / 2, cy = s.y ?? g.H * (g.v ? .46 : .48), size = s.size || (g.v ? 54 : 60), col = s.color || '#FF8A3D';
      const k2 = pop(lt, 1.1, .5), k3 = E.outCubic(prog(lt, 1.6, .5)), gl = 12 + Math.sin(t * 3) * 4;
      return { back: `<div class="full" style="background:#050507;opacity:${ki.toFixed(3)}"></div>`,
        front: `<div class="full"${cidOf(s)} style="opacity:${o.toFixed(3)}">
          <div class="full" style="background:radial-gradient(ellipse 50% 35% at 50% ${(cy / g.H * 100).toFixed(0)}%,rgba(232,112,63,.22),transparent 70%)"></div>
          ${s.ghost ? `<div style="${A}left:${cx}px;top:${cy + (g.v ? 190 : 140)}px;transform:translate(-50%,-50%);font:800 ${g.v ? 48 : 44}px ${p.font};color:rgba(255,255,255,.07);white-space:nowrap;filter:blur(1px)">${esc(s.ghost)}</div>` : ''}
          <div style="${A}left:${cx}px;top:${cy}px;transform:translate(-50%,-50%);text-align:center;white-space:nowrap">
            <div style="font:400 ${size}px/1.1 ${DISP};letter-spacing:.06em;text-transform:uppercase;color:${col};text-shadow:0 0 ${gl.toFixed(1)}px rgba(255,138,61,.85),0 0 40px rgba(255,120,40,.5)">${typed(s.title || 'XEM ĐẾN CUỐI', lt, .3, 16)}</div>
            <div style="margin-top:22px;display:inline-flex;align-items:center;gap:10px;padding:8px 18px 8px 10px;border-radius:12px;background:#fff;color:#111;font:700 ${g.v ? 30 : 28}px ${p.font};transform:scale(${k2.toFixed(3)});opacity:${Math.min(1, k2).toFixed(3)}">${tile(34, p, 'box-shadow:none')}${esc(s.name || p.name || 'Kênh của bạn')}</div>
            <div style="margin-top:22px;font:italic 500 ${g.v ? 28 : 26}px ${SERIF};color:rgba(255,255,255,.9);opacity:${k3.toFixed(3)};transform:translateY(${((1 - k3) * 10).toFixed(1)}px)">${esc(s.sub || 'Bạn thấy sao?')}</div>
            ${p.handle ? `<div style="margin-top:12px;font:500 ${g.v ? 20 : 18}px ${p.font};color:rgba(255,255,255,.55);opacity:${k3.toFixed(3)}">${esc(p.handle)}</div>` : ''}
          </div></div>`, cover: lt > .5, hideCaptions: true };
    },
  };
  Object.assign(MODULES, M);

  // ---------- captions: word-by-word white; "editor selection box" when no grid frame; yellow serif tag for hl; top of card during _map ----------
  CAPTION_STYLES[P] = (c, t) => {
    const g = geo(), p = pal(), I = inset(t), mp = sc('map', t), size = c.size || (g.v ? 34 : 30);
    const box = c.box ?? !I.on, w = Math.min(I.w - 40, g.v ? 600 : 900), x = c.x ?? g.W / 2;
    const y = c.y ?? (mp && mp.capTop !== false ? I.y + (g.v ? 118 : 78) : I.y + I.h * (g.v ? .70 : .80));
    const kb = pop(t - c.t0, 0, .3);
    const html = c.words.map(wd => { const k = pop(t - wd.s, 0, .25), vis = t >= wd.s;
      const st = `display:inline-block;opacity:${vis ? Math.min(1, k).toFixed(3) : 0};transform:scale(${vis ? k.toFixed(3) : .6})`;
      return (wd.hl ? `<span style="${st};margin:0 .1em">${hlTag(wd.w, p, size * 1.08)}</span>` : `<span style="${st}">${esc(wd.w)}</span>`) + (wd.br && g.v ? '<br>' : ' '); }).join('');
    const inner = box ? `<div style="display:inline-block;position:relative;padding:8px 18px;background:${p.sel};border:1.5px dashed rgba(255,255,255,.8);border-radius:4px">${html}${handles()}</div>` : html;
    return `<div id="cap"${cidOf(c)} style="left:${(x - w / 2).toFixed(1)}px;top:${y.toFixed(1)}px;right:auto;width:${w}px;transform:translateY(-50%) scale(${Math.min(1.04, kb).toFixed(3)});text-align:center;font-family:${c.font || p.font};font-weight:${c.weight || 600};font-size:${size}px;line-height:1.3;color:${c.color || '#fff'};text-shadow:${box ? '0 2px 6px rgba(0,0,0,.5)' : '0 2px 4px rgba(0,0,0,.9),0 0 18px rgba(0,0,0,.6)'};white-space:normal">${inner}</div>`;
  };

  // ---------- Studio metadata + recipe ----------
  const mk = (type, d, o) => T => ({ type: `${P}_${type}`, t0: T, t1: T + d, ...o });
  PACKS.push({
    id: P, name: 'Studio lưới AI', icon: '🧩',
    desc: 'Nền lưới xám xanh, video thành thẻ bo góc + ô app cam, phụ đề kiểu hộp đang chọn trong editor, tag vàng serif / neon / glow, LED headline, sơ đồ nền mờ, thẻ chủ đề, outro chữ cam phát sáng',
    caption: P,
    items: [
      { type: `${P}_grid`, label: 'Khung lưới + thẻ video (cả bài)', make: T => ({ type: `${P}_grid`, t0: T, t1: Math.max(T + 3, (typeof TL !== 'undefined' && TL && TL.duration) || T + 10) }) },
      { type: `${P}_hook`, label: 'Hook: hộp chữ đang chọn + bảng editor', make: mk('hook', 2.5, { title: 'AI edit video thì nó làm gì?' }) },
      { type: `${P}_tag`, label: 'Nhấn từ: hộp vàng / neon / phát sáng', make: mk('tag', 1.8, { text: 'gây shock', look: 'yellow' }) },
      { type: `${P}_card`, label: 'Thẻ chủ đề (kicker + tiêu đề + ảnh)', make: mk('card', 3.5, { kicker: 'viễn cảnh phim', title: 'Robot nổi loạn', tag: 'trong vài năm tới' }) },
      { type: `${P}_led`, label: 'Tiêu đề LED + dãy icon', make: mk('led', 3, { text: 'TIN SỐC', icons: ['🤖', '✨', '🧠', '⚡', '🔥'] }) },
      { type: `${P}_map`, label: 'Sơ đồ nhân vật – hai bên – ý chính (nền mờ)', make: mk('map', 6, { kicker: 'mấy ngày trước', center: 'nhà nghiên cứu', chips: [{ icon: '🏢', label: 'Công ty A' }, { icon: '🏢', label: 'Công ty B' }], top: 'siêu trí tuệ', bottom: 'tự cải thiện' }) },
      { type: `${P}_outro`, label: 'Outro: tiêu đề phát sáng + CTA', make: mk('outro', 3.5, { title: 'XEM ĐẾN CUỐI', sub: 'Bạn thấy sao?', ghost: 'đừng bỏ lỡ' }) },
    ],
    recipe: ctx => {
      const dur = Math.max(6, +ctx.dur || 30), caps = ctx.captions || [], S = [], fx = [], used = [];
      const T = x => +Math.max(0, Math.min(dur, x)).toFixed(2);
      const intro = T(Math.min(2.5, dur * .12)), oT = T(dur - Math.min(3.5, dur * .15));
      const words = caps.flatMap(c => c.words || []);
      const title = ctx.title || (words.length ? words.slice(0, 7).map(w => w.w).join(' ') : 'AI edit video thì nó làm gì?');
      const free = (a, b) => !used.some(([x, y]) => a < y + .3 && b > x - .3);
      const add = (s, f) => { s.t0 = T(s.t0); s.t1 = T(Math.min(s.t1, oT - .1)); if (s.t1 - s.t0 < .6 || !free(s.t0, s.t1)) return; S.push(s); used.push([s.t0, s.t1]); if (f) fx.push({ t: s.t0, type: f, amp: .8 }); };
      S.push({ type: `${P}_grid`, t0: intro, t1: dur });
      S.push({ type: `${P}_hook`, t0: 0, t1: intro, title });
      fx.push({ t: intro, type: 'punch', amp: 1 });
      // Topic card early: at the first topic word, else right after the hook.
      let c0 = findWord(caps, ['viễn cảnh', 'robot', 'AI', 'trí tuệ', 'công nghệ', 'chuyện'], intro + .5);
      if (c0 == null || c0 > dur * .4) c0 = intro + 1.2;
      add({ type: `${P}_card`, t0: c0, t1: c0 + 3.2, kicker: 'chủ đề hôm nay', title: title.split(' ').slice(0, 3).join(' '), tag: 'trong vài năm tới' }, 'whip');
      // Keyword tags: highlighted words first, else a spoken shock word, else a fixed neon word.
      const kw = words.filter(w => w.hl && w.s > intro + 1 && w.s < oT - 2).map(w => ({ w: w.w, s: w.s }));
      if (!kw.length) for (const k of ['sốc', 'shock', 'đáng sợ', 'khủng khiếp', 'bất ngờ', 'không tin', 'thật sự']) { const s0 = findWord(caps, [k], intro + 1); if (s0 != null && s0 < oT - 2) { kw.push({ w: k, s: s0 }); break; } }
      if (!kw.length) kw.push({ w: 'đáng sợ', s: dur * .3 });
      kw.slice(0, 2).forEach((w, i) => add({ type: `${P}_tag`, t0: w.s - .1, t1: w.s + 1.8, text: w.w.replace(/[.,!?]+$/, ''), look: i ? 'neon' : 'yellow' }, 'punch'));
      add({ type: `${P}_led`, t0: dur * .45, t1: dur * .45 + 3, text: 'TIN SỐC' }, 'flash');
      let m0 = findWord(caps, ['công ty', 'nghiên cứu', 'chạy đua', 'cuộc đua'], dur * .5);
      if (m0 == null || m0 > oT - 4) m0 = dur * .62;
      add({ type: `${P}_map`, t0: m0, t1: m0 + 6, kicker: 'mới đây', center: 'nguồn tin', chips: [{ icon: '🏢', label: 'Bên A' }, { icon: '🏢', label: 'Bên B' }], top: 'ý chính', bottom: 'kết luận' }, 'zoom_in');
      add({ type: `${P}_tag`, t0: oT - 2.6, t1: oT - .4, text: 'AI', look: 'glow' }, 'punch');
      // Beat fill: one whole-frame hit every 2 bars (~105 BPM) where nothing else hits.
      const cyc = ['whip', 'zoom_in', 'punch', 'flash'];
      for (let x = intro + 4.6, i = 0; x < oT - 1; x += 4.6, i++) if (!fx.some(f => Math.abs(f.t - x) < 1.2)) fx.push({ t: T(x), type: cyc[i % 4], amp: .7 });
      fx.push({ t: oT, type: 'glitch', amp: .9 });
      S.push({ type: `${P}_outro`, t0: oT, t1: dur, title: 'XEM ĐẾN CUỐI', sub: 'Bạn thấy sao?', name: ctx.brand?.name });
      fx.sort((a, b) => a.t - b.t);
      return { caption_style: P, music: 'tech', scenes: S, fx };
    },
  });
})();

} catch (e) { console.error('user pack u_studio_luoi_ai.js', e); }
