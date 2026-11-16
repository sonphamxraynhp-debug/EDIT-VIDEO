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
