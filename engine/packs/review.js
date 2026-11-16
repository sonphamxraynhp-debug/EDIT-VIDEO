// Pack "review" — Vietnamese product-review videos (tech, mỹ phẩm, gia dụng, so sánh, unbox, chấm điểm).
// Look: near-black cards, electric green for pros/good, red for cons/bad, highlight yellow; Montserrat / Be Vietnam Pro heavy.
// Modules rv_*: product hero, score ring, pros/cons, spec table A vs B, bars, verdict stamp, price compare, unbox list,
// coupon ticket, sub-score bars, pointer callout. Caption style "review". Doc: references/pack-review.md.
(() => {
  const P = 'review';
  const SI = CDN + 'npm/simple-icons@15.0.0/icons/';

  // ---------- palette (TL.brand overrides: dark, good|primary, bad, accent, light, muted, font, disp) ----------
  const C = (s = {}) => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return {
      card: s.bg || b.dark || '#0E0E10',
      good: s.good || b.good || b.primary || '#00E08A',
      bad: s.bad || b.bad || '#FF4D4D',
      hl: s.hl || b.accent || '#FFE14D',
      text: s.color || b.light || '#FFFFFF',
      muted: b.muted || '#9A9AA6',
      font: b.font || "'Be Vietnam Pro',sans-serif",
      disp: s.font || b.disp || "'Montserrat','Be Vietnam Pro',sans-serif",
    };
  };
  const hexA = (h, a) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || ''));
    if (!m) return h;
    let x = m[1];
    if (x.length === 3) x = x.split('').map(ch => ch + ch).join('');
    const n = parseInt(x, 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const lum = h => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    return (.299 * (n >> 16) + .587 * ((n >> 8) & 255) + .114 * (n & 255)) / 255;
  };
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
  const num = v => +String(v ?? '').replace(/[^\d.,]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.') || 0;
  const tierCol = (c, v, max = 10) => (v / max >= .8 ? c.good : v / max >= .62 ? c.hl : c.bad);

  // ---------- shared pieces ----------
  // Root: centred at (x, y); size = scale in % (100 = design size). Every root carries data-cid.
  function root(s, inner, o = {}) {
    const [W, H] = DIMS();
    const x = s.x ?? W / 2, y = s.y ?? Math.round(H * (o.fy ?? .38));
    const k = (s.size ?? (VERT() ? 100 : 82)) / 100;
    return `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;${o.w ? `width:${o.w}px;` : ''}transform:translate(-50%,-50%) scale(${k.toFixed(3)}) ${o.tr || ''};
      transform-origin:50% 50%;opacity:${(o.op ?? 1).toFixed(3)};${o.st || ''}">${inner}</div>`;
  }
  const cardCSS = (c, pad = 28) => `background:linear-gradient(180deg,${hexA(c.card, .95)},${hexA(c.card, .9)});border:1.5px solid rgba(255,255,255,.09);border-radius:28px;
    padding:${pad}px;box-shadow:0 26px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-family:${c.font};color:${c.text}`;
  const head = (c, text, col) => !text ? '' : `<div style="display:flex;align-items:center;gap:10px;font-family:${c.disp};font-weight:900;font-size:21px;line-height:1.3;letter-spacing:.14em;
    color:${col || c.hl};text-transform:uppercase;white-space:nowrap"><span style="width:10px;height:10px;border-radius:3px;background:${col || c.hl};box-shadow:0 0 12px ${col || c.hl}"></span>${esc(text)}</div>`;
  const outOp = (s, t) => fadeIO(t, s.t0, s.keep ? null : s.t1, .12, .25);
  const SVG_CHECK = (col, sw = 3.2) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M5 12.5l4.3 4.3L19 7.2" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const SVG_X = (col, sw = 3.2) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/></svg>`;
  const STAR = 'M12 2.4l2.95 5.98 6.6.96-4.78 4.65 1.13 6.57L12 17.46l-5.9 3.1 1.13-6.57L2.45 9.34l6.6-.96z';

  // Product image (contain) with a placeholder (gradient tile + 📦) when missing or failing to load.
  function prodImg(src, w, h, c, ph = '📦') {
    const pz = Math.round(Math.min(w, h) * .82);
    const hold = `<div style="position:absolute;left:50%;top:50%;width:${pz}px;height:${pz}px;transform:translate(-50%,-50%);border-radius:${pz * .2}px;
      background:linear-gradient(140deg,${hexA(c.good, .9)},#5B5BFF 60%,#B44DFF);display:${src ? 'none' : 'flex'};align-items:center;justify-content:center;
      box-shadow:inset 0 2px 0 rgba(255,255,255,.35),0 18px 40px rgba(0,0,0,.45)">${slIcon(ph, Math.round(pz * .55))}</div>`;
    const img = src ? `<img src="${url(src)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
    return `<div style="position:relative;width:${w}px;height:${h}px">${img}${hold}</div>`;
  }

  // Shop / brand logo tile: si:<slug> (Simple Icons), emoji, image path, or text initials. Falls back to initials on 404.
  const BRAND_BG = { shopee: '#EE4D2D', lazada: '#0F146D', tiktok: '#000000', tiktokshop: '#000000', tiki: '#1A94FF', sendo: '#D0021B', amazon: '#FF9900',
    apple: '#111111', samsung: '#1428A0', xiaomi: '#FF6900', oppo: '#1BA784', vivo: '#415FFF', cellphones: '#D70018', fptshop: '#CB1C22', thegioididong: '#FFD400', dienmayxanh: '#2F80ED' };
  function logoTile(icon, name, size, bg) {
    const key = String((icon && icon.startsWith('si:') ? icon.slice(3) : name) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const fill = bg || BRAND_BG[key] || '#FFFFFF', dark = lum(fill) < .6;
    const ini = String(name || key || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
    const txt = `<b style="display:${icon && icon.startsWith('si:') ? 'none' : 'block'};font-family:'Montserrat',sans-serif;font-weight:900;font-size:${Math.round(size * (ini.length > 1 ? .34 : .44))}px;
      line-height:1;color:${dark ? '#fff' : '#111'}">${esc(ini)}</b>`;
    let inner = txt;
    if (icon && icon.startsWith('si:')) inner = `<img src="${SI}${icon.slice(3)}.svg" style="width:${size * .58}px;height:${size * .58}px;object-fit:contain;${dark ? 'filter:invert(1)' : ''}"
      onerror="this.style.display='none';this.nextElementSibling.style.display='block'">` + txt;
    else if (icon) inner = slIcon(icon, Math.round(size * .66));
    return `<div style="flex:none;width:${size}px;height:${size}px;border-radius:${size * .26}px;background:${fill};display:flex;align-items:center;justify-content:center;
      box-shadow:0 6px 16px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.12)">${inner}</div>`;
  }

  const MOD = {
    // 1. Product hero — image with glow + slow 3D sway/float, brand logo, name, price tag (+ old price, badge).
    // { image, name, brand, logo:'si:apple', price, old_price, badge, backdrop:'dim'|'none', spin:true }
    rv_product(s, t, lt) {
      const c = C(s), o = outOp(s, t);
      const ki = E.outBack(prog(lt, 0, .6), 1.3), kb = clamp(prog(lt, 0, .45));
      const kn = E.outCubic(prog(lt, .28, .4)), kp = E.outBack(prog(lt, .55, .4), 2.4);
      const iw = s.img_w || (VERT() ? 330 : 250), ih = s.img_h || (VERT() ? 420 : 290);
      const sway = s.spin === false ? 0 : Math.sin(lt * 1.15) * 14, fl = Math.sin(lt * 2.1) * 9;
      const rays = `<div style="position:absolute;left:50%;top:${ih / 2}px;width:${iw * 1.9}px;height:${iw * 1.9}px;transform:translate(-50%,-50%) rotate(${(lt * 14).toFixed(1)}deg);border-radius:50%;
        background:repeating-conic-gradient(${hexA(c.good, .16)} 0 8deg,transparent 8deg 22deg);-webkit-mask-image:radial-gradient(circle,#000 18%,transparent 66%);mask-image:radial-gradient(circle,#000 18%,transparent 66%);opacity:${kb.toFixed(2)}"></div>`;
      const glow = `<div style="position:absolute;left:50%;top:${ih / 2}px;width:${iw * 1.4}px;height:${iw * 1.4}px;border-radius:50%;
        transform:translate(-50%,-50%) scale(${(.85 + .07 * Math.sin(lt * 2.4)).toFixed(3)});background:radial-gradient(circle,${hexA(c.good, .55)} 0%,${hexA(c.good, .2)} 38%,transparent 68%);opacity:${kb.toFixed(2)}"></div>`;
      const shadow = `<div style="position:absolute;left:50%;top:${ih - 6}px;width:${iw * .7}px;height:28px;transform:translate(-50%,0) scale(${(1 - fl / 60).toFixed(3)});border-radius:50%;
        background:radial-gradient(ellipse,rgba(0,0,0,.6),transparent 70%)"></div>`;
      const badge = s.badge ? `<div style="position:absolute;right:${-6}px;top:${ih * .08}px;transform:rotate(8deg) scale(${clamp(kp, 0, 1.3).toFixed(3)});padding:6px 16px;border-radius:999px;
        background:${c.bad};color:#fff;font-family:${c.disp};font-weight:900;font-size:22px;line-height:1.3;white-space:nowrap;box-shadow:0 8px 18px rgba(0,0,0,.4)">${esc(s.badge)}</div>` : '';
      const image = `<div style="position:relative;width:${iw}px;height:${ih}px;margin:0 auto">${rays}${glow}${shadow}
        <div style="position:absolute;inset:0;transform:translateY(${(fl - (1 - ki) * 40).toFixed(1)}px) perspective(900px) rotateY(${sway.toFixed(1)}deg) scale(${lerp(.5, 1, ki).toFixed(3)});
          filter:blur(${((1 - kb) * 10).toFixed(1)}px) drop-shadow(0 26px 30px rgba(0,0,0,.55));opacity:${kb.toFixed(2)}">${prodImg(s.image, iw, ih, c)}</div>${badge}</div>`;
      const brand = (s.logo || s.brand) ? `<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:14px">
        ${s.logo ? logoTile(s.logo, s.brand, 44, '#FFFFFF') : ''}${s.brand ? `<span style="font-family:${c.disp};font-weight:800;font-size:22px;letter-spacing:.2em;color:${c.muted};text-transform:uppercase">${esc(s.brand)}</span>` : ''}</div>` : '';
      const name = `<div style="margin-top:8px;font-family:${c.disp};font-weight:900;font-size:${s.name_size || 50}px;line-height:1.22;letter-spacing:-.01em;white-space:nowrap;color:${c.text};
        text-shadow:0 4px 18px rgba(0,0,0,.6)">${esc(s.name || 'Tên sản phẩm')}</div>`;
      const price = s.price ? `<div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-top:12px;transform:scale(${clamp(kp, 0, 1.4).toFixed(3)});opacity:${clamp(kp * 2).toFixed(2)}">
        <div style="position:relative;transform:rotate(-3deg);background:${c.hl};color:#111;font-family:${c.disp};font-weight:900;font-size:40px;line-height:1.25;padding:4px 24px 4px 40px;
          border-radius:10px 999px 999px 10px;box-shadow:0 8px 0 rgba(0,0,0,.45),0 14px 30px rgba(0,0,0,.35);white-space:nowrap">
          <span style="position:absolute;left:14px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:${hexA(c.card, .9)}"></span>${esc(s.price)}</div>
        ${s.old_price ? `<span style="font-family:${c.disp};font-weight:700;font-size:24px;color:${c.muted};text-decoration:line-through;text-decoration-color:${c.bad};text-decoration-thickness:3px;white-space:nowrap">${esc(s.old_price)}</span>` : ''}</div>` : '';
      const body = `<div style="text-align:center;opacity:1">${image}<div style="opacity:${kn.toFixed(3)};transform:translateY(${((1 - kn) * 24).toFixed(1)}px)">${brand}${name}</div>${price}</div>`;
      const back = (s.backdrop ?? 'dim') === 'dim' ? `<div class="full" style="opacity:${(o * kb).toFixed(3)};background:radial-gradient(ellipse 80% 60% at 50% 40%,${hexA(c.card, .55)},${hexA(c.card, .9)} 75%)"></div>` : '';
      return { back, front: root(s, body, { w: 660, op: o, fy: .4 }) };
    },

    // 2. Score ring with count-up + 5-star row (halves) + verdict label pill.  { score:8.6, max:10, stars?, label, title }
    rv_score(s, t, lt) {
      const c = C(s), o = outOp(s, t), max = s.max || 10, sc = s.score ?? 8.6;
      const ke = E.outBack(prog(lt, 0, .4), 1.6), kc = E.outCubic(prog(lt, .15, 1.2));
      const col = s.color || tierCol(c, sc, max);
      const R = 98, ring = 240;
      const stars = s.stars ?? sc / max * 5;
      const starRow = [0, 1, 2, 3, 4].map(i => {
        const fill = clamp(stars * kc - i), kp = E.outBack(prog(lt, .3 + i * .08, .3), 2.6), gid = `rvst${Math.round(fill * 100)}`;
        return `<svg viewBox="0 0 24 24" width="46" height="46" style="transform:scale(${clamp(kp, 0, 1.4).toFixed(3)});filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))">
          <defs><linearGradient id="${gid}"><stop offset="${fill}" stop-color="${c.hl}"/><stop offset="${fill}" stop-color="rgba(255,255,255,.14)"/></linearGradient></defs>
          <path d="${STAR}" fill="url(#${gid})" stroke="${c.hl}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
      }).join('');
      const label = s.label ?? (sc / max >= .8 ? 'Rất đáng tiền' : sc / max >= .62 ? 'Ổn trong tầm giá' : 'Chưa thuyết phục');
      const kl = E.outBack(prog(lt, 1.15, .35), 2.4);
      const body = `<div style="${cardCSS(c, 30)};width:480px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px">
        ${head(c, s.title ?? 'Điểm đánh giá', col)}
        <div style="position:relative;width:${ring}px;height:${ring}px">
          <svg viewBox="0 0 ${ring} ${ring}" width="${ring}" height="${ring}" style="transform:rotate(-90deg);filter:drop-shadow(0 0 14px ${hexA(col, .55)})">
            <circle cx="${ring / 2}" cy="${ring / 2}" r="${R}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="20"/>
            <circle cx="${ring / 2}" cy="${ring / 2}" r="${R}" fill="none" stroke="${col}" stroke-width="20" stroke-linecap="round" pathLength="1" stroke-dasharray="1"
              stroke-dashoffset="${(1 - kc * sc / max).toFixed(4)}"/></svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <div style="font-family:${c.disp};font-weight:900;font-size:86px;line-height:1.05;color:${c.text};letter-spacing:-.03em">${f1(sc * kc)}</div>
            <div style="font-family:${c.disp};font-weight:800;font-size:24px;line-height:1.2;color:${c.muted}">/ ${max}</div></div></div>
        <div style="display:flex;gap:8px">${starRow}</div>
        ${label ? `<div style="transform:scale(${clamp(kl, 0, 1.3).toFixed(3)});opacity:${clamp(kl * 2).toFixed(2)};padding:8px 26px;border-radius:999px;background:${col};color:#0B0B0C;
          font-family:${c.disp};font-weight:900;font-size:28px;line-height:1.3;white-space:nowrap;box-shadow:0 0 24px ${hexA(col, .5)}">${esc(label)}</div>` : ''}</div>`;
      return { front: root(s, body, { op: o, fy: .34, tr: `translateY(${((1 - ke) * 50).toFixed(1)}px) scale(${lerp(.85, 1, clamp(ke, 0, 1.1)).toFixed(3)})` }) };
    },

    // 3. Pros / cons columns. pros/cons: ["text" | {text, t}] — items appear at their own t (auto stagger otherwise).
    rv_proscons(s, t, lt) {
      const c = C(s), o = outOp(s, t), ke = E.outCubic(prog(lt, 0, .3));
      const pros = (s.pros || []).map(x => (typeof x === 'string' ? { text: x } : x)), cons = (s.cons || []).map(x => (typeof x === 'string' ? { text: x } : x));
      const st = s.stagger ?? .3;
      const col = (list, good, off) => {
        const cc = good ? c.good : c.bad;
        const items = list.map((it, i) => {
          const ti = it.t ?? s.t0 + .35 + (off + i) * st, k = E.outCubic(prog(t, ti, .3)), kp = E.outBack(prog(t, ti + .05, .3), 2.6);
          return `<div${cidOf(it)} style="display:flex;gap:10px;align-items:flex-start;opacity:${k.toFixed(3)};transform:translateX(${((1 - k) * (good ? -26 : 26)).toFixed(1)}px)">
            <div style="flex:none;width:30px;height:30px;margin-top:2px;border-radius:50%;background:${cc};padding:5px;transform:scale(${clamp(kp, 0, 1.4).toFixed(3)});box-shadow:0 0 12px ${hexA(cc, .5)}">${good ? SVG_CHECK('#0B0B0C', 3.6) : SVG_X('#0B0B0C', 3.6)}</div>
            <div style="font-weight:700;font-size:${s.item_size || 23}px;line-height:1.36;color:${c.text}">${esc(it.text || '')}</div></div>`;
        }).join('');
        return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">
          <div style="align-self:flex-start;display:flex;align-items:center;gap:8px;padding:6px 16px 6px 8px;border-radius:999px;background:${hexA(cc, .14)};border:1.5px solid ${hexA(cc, .6)};
            font-family:${c.disp};font-weight:900;font-size:22px;line-height:1.3;letter-spacing:.04em;color:${cc};white-space:nowrap">
            <span style="width:26px;height:26px;border-radius:50%;background:${cc};padding:4px">${good ? SVG_CHECK('#0B0B0C', 3.8) : SVG_X('#0B0B0C', 3.8)}</span>${esc(good ? s.pros_title ?? 'ƯU ĐIỂM' : s.cons_title ?? 'NHƯỢC ĐIỂM')}</div>${items}</div>`;
      };
      const body = `<div style="${cardCSS(c, 26)};width:${s.w || 650}px">${s.title ? `<div style="margin-bottom:16px">${head(c, s.title)}</div>` : ''}
        <div style="display:flex;gap:22px">${col(pros, true, 0)}<div style="flex:none;width:1.5px;background:linear-gradient(transparent,rgba(255,255,255,.16),transparent)"></div>${col(cons, false, pros.length)}</div></div>`;
      return { front: root(s, body, { op: o, fy: .37, tr: `translateY(${((1 - ke) * 40).toFixed(1)}px)` }) };
    },

    // 4. Spec table A vs B. a/b: {name, image}; rows: [{label, a, b, win:'a'|'b'|'', t}]
    rv_specs_vs(s, t, lt) {
      const c = C(s), o = outOp(s, t), ke = E.outCubic(prog(lt, 0, .3));
      const A = s.a || { name: 'Máy A' }, B = s.b || { name: 'Máy B' };
      const kh = E.outBack(prog(lt, .05, .45), 1.5), kv = E.outBack(prog(lt, .25, .4), 3);
      const side = (p, right) => `<div${cidOf(p)} style="display:flex;flex-direction:column;align-items:center;gap:6px;transform:translateX(${((1 - kh) * (right ? 60 : -60)).toFixed(1)}px);opacity:${clamp(kh).toFixed(2)}">
        <div style="transform:rotate(${right ? 6 : -6}deg)">${prodImg(p.image, 110, 130, c, p.icon || '📦')}</div>
        <div style="font-family:${c.disp};font-weight:900;font-size:24px;line-height:1.25;text-align:center;color:${c.text}">${esc(p.name || '')}</div></div>`;
      const rows = (s.rows || []).map((r, i) => {
        const ti = r.t ?? s.t0 + .55 + i * (s.stagger ?? .32), k = E.outCubic(prog(t, ti, .3)), kw = E.outBack(prog(t, ti + .3, .3), 2.2);
        const val = (v, me) => {
          const win = r.win === me, lose = r.win && !win;
          return `<div style="justify-self:${me === 'a' ? 'start' : 'end'};position:relative;display:flex;align-items:center;gap:8px;padding:4px 14px;border-radius:12px;
            background:${win ? hexA(c.good, .16 * clamp(kw)) : 'transparent'};border:1.5px solid ${win ? hexA(c.good, .7 * clamp(kw)) : 'transparent'};
            font-family:${c.disp};font-weight:900;font-size:${s.value_size || 27}px;line-height:1.3;white-space:nowrap;color:${win && kw > .3 ? c.good : c.text};opacity:${lose ? lerp(1, .5, clamp(kw)) : 1}">
            ${win && me === 'b' ? `<span style="width:22px;height:22px;transform:scale(${clamp(kw, 0, 1.4).toFixed(2)})">${SVG_CHECK(c.good, 4)}</span>` : ''}${esc(String(v ?? ''))}
            ${win && me === 'a' ? `<span style="width:22px;height:22px;transform:scale(${clamp(kw, 0, 1.4).toFixed(2)})">${SVG_CHECK(c.good, 4)}</span>` : ''}</div>`;
        };
        return `<div${cidOf(r)} style="display:grid;grid-template-columns:1fr 150px 1fr;align-items:center;gap:8px;padding:10px 0;border-top:1px solid rgba(255,255,255,.07);
          opacity:${k.toFixed(3)};transform:translateY(${((1 - k) * 18).toFixed(1)}px)">${val(r.a, 'a')}
          <div style="text-align:center;font-weight:700;font-size:18px;line-height:1.3;color:${c.muted};text-transform:uppercase;letter-spacing:.05em">${esc(r.label || '')}</div>${val(r.b, 'b')}</div>`;
      }).join('');
      const body = `<div style="${cardCSS(c, 24)};width:${s.w || 650}px">${s.title ? `<div style="margin-bottom:10px;display:flex;justify-content:center">${head(c, s.title)}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 110px 1fr;align-items:center;padding-bottom:12px">${side(A, false)}
          <div style="justify-self:center;width:78px;height:78px;border-radius:50%;background:linear-gradient(135deg,${c.hl},#FF9A3D);display:flex;align-items:center;justify-content:center;
            font-family:${c.disp};font-weight:900;font-style:italic;font-size:32px;line-height:1;color:#111;transform:rotate(-8deg) scale(${clamp(kv, 0, 1.5).toFixed(3)});
            box-shadow:0 0 0 6px ${hexA(c.card, .9)},0 0 26px ${hexA(c.hl, .55)}">VS</div>${side(B, true)}</div>${rows}</div>`;
      return { front: root(s, body, { op: o, fy: .37, tr: `translateY(${((1 - ke) * 40).toFixed(1)}px)` }) };
    },

    // 5. Benchmark bars. bars: [{label, value, icon?, color?, suffix?}], unit, best:'max'|'min'|index, max
    rv_bars(s, t, lt) {
      const c = C(s), o = outOp(s, t), ke = E.outCubic(prog(lt, 0, .3));
      const bars = s.bars || [{ label: 'Máy A', value: 12 }, { label: 'Máy B', value: 9 }];
      const vals = bars.map(b => +b.value || 0), mx = s.max || Math.max(...vals) * 1.08 || 1;
      const bi = typeof s.best === 'number' ? s.best : s.best === 'none' ? -1 : vals.indexOf(s.best === 'min' ? Math.min(...vals) : Math.max(...vals));
      const dec = s.decimals ?? (vals.some(v => v % 1) ? 1 : 0);
      const rows = bars.map((b, i) => {
        const ti = b.t ?? s.t0 + .3 + i * (s.stagger ?? .22), k = E.outCubic(prog(t, ti, s.grow ?? .9)), ka = E.outCubic(prog(t, ti, .25));
        const best = i === bi, col = b.color || (best ? c.good : '#6B6B78');
        return `<div${cidOf(b)} style="opacity:${ka.toFixed(3)}">
          <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:23px;line-height:1.3;color:${c.text};white-space:nowrap">${b.icon ? slIcon(b.icon, 32) : ''}${esc(b.label || '')}
              ${best && k > .95 ? `<span style="padding:2px 10px;border-radius:999px;background:${c.good};color:#0B0B0C;font-family:${c.disp};font-weight:900;font-size:15px;letter-spacing:.06em">${esc(s.best_label ?? 'TỐT NHẤT')}</span>` : ''}</div>
            <div style="font-family:${c.disp};font-weight:900;font-size:32px;line-height:1.2;color:${best ? c.good : c.text};white-space:nowrap">${(vals[i] * k).toFixed(dec)}<span style="font-size:20px;color:${c.muted};margin-left:4px">${esc(b.suffix ?? s.unit ?? '')}</span></div></div>
          <div style="height:26px;border-radius:13px;background:rgba(255,255,255,.07);overflow:hidden">
            <div style="height:100%;width:${(vals[i] / mx * k * 100).toFixed(2)}%;border-radius:13px;background:linear-gradient(90deg,${hexA(col, .55)},${col});
              box-shadow:${best ? `0 0 18px ${hexA(col, .6)}` : 'none'}"></div></div></div>`;
      }).join('');
      const body = `<div style="${cardCSS(c, 28)};width:${s.w || 600}px;display:flex;flex-direction:column;gap:20px">${head(c, s.title ?? 'Thời lượng pin')}${rows}
        ${s.note ? `<div style="font-size:17px;line-height:1.35;color:${c.muted}">${esc(s.note)}</div>` : ''}</div>`;
      return { front: root(s, body, { op: o, fy: .38, tr: `translateY(${((1 - ke) * 40).toFixed(1)}px)` }) };
    },

    // 6. Verdict stamp: verdict:'buy'|'consider'|'skip' (or text + color), slam + shake + impact ring. { sub, backdrop }
    rv_verdict(s, t, lt) {
      const c = C(s), o = outOp(s, t);
      const V = { buy: ['ĐÁNG MUA', c.good, '✓'], consider: ['CÂN NHẮC', c.hl, '!'], skip: ['KHÔNG NÊN MUA', c.bad, '✕'] }[s.verdict || 'buy'] || ['ĐÁNG MUA', c.good, '✓'];
      const text = s.text || V[0], col = s.color || V[1];
      const fs = s.font_size || clamp(560 / (text.length * .74), 40, 86);
      const ks = prog(lt, 0, .2), sc = lt < .2 ? lerp(2.6, 1, E.inQuad(ks)) : 1 - .05 * Math.sin(clamp((lt - .2) / .22) * Math.PI);
      const sh = lt > .2 && lt < .6 ? (1 - (lt - .2) / .4) * 11 : 0;
      const jx = Math.sin(lt * 97) * sh, jy = Math.cos(lt * 83) * sh;
      const kr = prog(lt, .2, .5), ksub = E.outCubic(prog(lt, .5, .35));
      const icon = `<div style="position:absolute;left:-26px;top:-30px;width:64px;height:64px;border-radius:50%;background:${col};color:#0B0B0C;display:flex;align-items:center;justify-content:center;
        padding:12px;box-shadow:0 0 0 5px ${hexA(c.card, .95)}">${V[2] === '✓' ? SVG_CHECK('#0B0B0C', 4) : V[2] === '✕' ? SVG_X('#0B0B0C', 4) : `<b style="font-family:${c.disp};font-weight:900;font-size:40px;line-height:1">!</b>`}</div>`;
      const stamp = `<div style="position:relative;display:inline-block;transform:rotate(${s.rotate ?? -7}deg);padding:10px 34px;border:7px solid ${col};border-radius:18px;
        background:${hexA(c.card, .88)};box-shadow:inset 0 0 0 5px ${hexA(c.card, .88)},inset 0 0 0 8px ${hexA(col, .8)},0 0 40px ${hexA(col, .45)},0 20px 40px rgba(0,0,0,.5);
        font-family:${c.disp};font-weight:900;font-size:${fs.toFixed(0)}px;line-height:1.28;letter-spacing:.02em;color:${col};white-space:nowrap;text-shadow:0 0 18px ${hexA(col, .55)}">${icon}${esc(text)}</div>`;
      const ring = lt > .2 ? `<div style="position:absolute;left:50%;top:50%;width:${lerp(300, 760, E.outCubic(kr)).toFixed(0)}px;height:${lerp(140, 380, E.outCubic(kr)).toFixed(0)}px;transform:translate(-50%,-50%);
        border-radius:50%;border:${lerp(10, 1, kr).toFixed(1)}px solid ${col};opacity:${(1 - kr).toFixed(3)}"></div>` : '';
      const streaks = lt > .2 ? [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const a = i * 45 + 22, d = lerp(150, 330, E.outCubic(kr));
        return `<div style="position:absolute;left:50%;top:50%;width:${lerp(60, 10, kr).toFixed(0)}px;height:6px;border-radius:3px;background:${col};opacity:${(1 - kr).toFixed(3)};
          transform:translate(-50%,-50%) rotate(${a}deg) translateX(${d.toFixed(0)}px)"></div>`;
      }).join('') : '';
      const sub = s.sub ? `<div style="margin-top:26px;font-weight:800;font-size:28px;line-height:1.35;color:${c.text};text-shadow:0 3px 12px rgba(0,0,0,.8);opacity:${ksub.toFixed(3)};
        transform:translateY(${((1 - ksub) * 16).toFixed(1)}px);white-space:nowrap">${esc(s.sub)}</div>` : '';
      const body = `<div style="position:relative;text-align:center">${ring}${streaks}
        <div style="transform:translate(${jx.toFixed(1)}px,${jy.toFixed(1)}px) scale(${sc.toFixed(3)});opacity:${clamp(ks * 3).toFixed(2)}">${stamp}</div>${sub}</div>`;
      const flash = lt > .2 && lt < .4 ? `<div class="full" style="background:${col};opacity:${((1 - (lt - .2) / .2) * .22).toFixed(3)}"></div>` : '';
      const back = s.backdrop === 'dim' ? `<div class="full" style="background:${hexA(c.card, .6)};opacity:${o.toFixed(3)}"></div>` : '';
      return { back, front: root(s, body, { op: o, fy: .55 }) + flash };
    },

    // 7. Price comparison across shops. shops: [{shop, icon:'si:shopee', price, note, t}], best = index (default: cheapest)
    rv_price_compare(s, t, lt) {
      const c = C(s), o = outOp(s, t), ke = E.outCubic(prog(lt, 0, .3));
      const shops = s.shops || [];
      const prices = shops.map(x => num(x.price));
      const bi = typeof s.best === 'number' ? s.best : prices.indexOf(Math.min(...prices.filter(p => p > 0)));
      const st = s.stagger ?? .28, last = shops.reduce((m, x, i) => Math.max(m, x.t ?? s.t0 + .35 + i * st), s.t0);
      const kb = E.outBack(prog(t, last + .3, .3), 2.4);
      const rows = shops.map((x, i) => {
        const ti = x.t ?? s.t0 + .35 + i * st, k = E.outCubic(prog(t, ti, .3)), best = i === bi && kb > 0;
        return `<div${cidOf(x)} style="position:relative;display:flex;align-items:center;gap:16px;padding:12px 18px 12px 12px;border-radius:18px;
          background:${best ? hexA(c.good, .12 * clamp(kb)) : 'rgba(255,255,255,.04)'};border:2px solid ${best ? hexA(c.good, clamp(kb)) : 'rgba(255,255,255,.06)'};
          opacity:${k.toFixed(3)};transform:translateX(${((1 - k) * 50).toFixed(1)}px) scale(${best ? lerp(1, 1.03, clamp(kb)).toFixed(3) : 1})">
          ${logoTile(x.icon, x.shop, 56, x.bg)}
          <div style="flex:1;min-width:0"><div style="font-family:${c.disp};font-weight:900;font-size:25px;line-height:1.25;color:${c.text};white-space:nowrap">${esc(x.shop || '')}</div>
            ${x.note ? `<div style="font-weight:600;font-size:17px;line-height:1.35;color:${c.muted};white-space:nowrap">${esc(x.note)}</div>` : ''}</div>
          <div style="font-family:${c.disp};font-weight:900;font-size:29px;line-height:1.25;white-space:nowrap;color:${best ? c.good : c.text}">${esc(x.price || '')}</div>
          ${best ? `<div style="position:absolute;right:16px;top:-15px;padding:3px 12px;border-radius:999px;background:${c.good};color:#0B0B0C;font-family:${c.disp};font-weight:900;
            font-size:15px;line-height:1.35;letter-spacing:.06em;transform:scale(${clamp(kb, 0, 1.4).toFixed(3)});white-space:nowrap">${esc(s.best_label ?? 'RẺ NHẤT')}</div>` : ''}</div>`;
      }).join('');
      const body = `<div style="${cardCSS(c, 26)};width:${s.w || 600}px;display:flex;flex-direction:column;gap:14px">${head(c, s.title ?? 'So giá các sàn')}${rows}
        ${s.note ? `<div style="font-size:16px;line-height:1.35;color:${c.muted}">${esc(s.note)}</div>` : ''}</div>`;
      return { front: root(s, body, { op: o, fy: .37, tr: `translateY(${((1 - ke) * 40).toFixed(1)}px)` }) };
    },

    // 8. "Trong hộp có" checklist — each item ticks at its t. items: [{icon:'📱', text, t}]
    rv_unbox(s, t, lt) {
      const c = C(s), o = outOp(s, t), ke = E.outBack(prog(lt, 0, .4), 1.4);
      const items = (s.items || []).map(x => (typeof x === 'string' ? { text: x } : x));
      const rows = items.map((x, i) => {
        const ti = x.t ?? s.t0 + .35 + i * (s.stagger ?? .3), k = E.outCubic(prog(t, ti, .28)), kt = E.outCubic(prog(t, ti + .18, .25)), ki = E.outBack(prog(t, ti, .35), 2.4);
        return `<div${cidOf(x)} style="display:flex;align-items:center;gap:16px;padding:8px 6px;opacity:${k.toFixed(3)};transform:translateY(${((1 - k) * 16).toFixed(1)}px)">
          <div style="flex:none;width:36px;height:36px;border-radius:10px;border:2.5px solid ${kt > 0 ? c.good : 'rgba(255,255,255,.3)'};background:${hexA(c.good, kt)};padding:3px">
            <svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M5 12.5l4.3 4.3L19 7.2" fill="none" stroke="#0B0B0C" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"
              pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - kt).toFixed(3)}"/></svg></div>
          <div style="flex:none;transform:scale(${clamp(ki, 0, 1.4).toFixed(3)})">${slIcon(x.icon || '📦', 44)}</div>
          <div style="font-weight:700;font-size:25px;line-height:1.32;color:${c.text}">${esc(x.text || '')}</div></div>`;
      }).join('');
      const body = `<div style="${cardCSS(c, 26)};width:${s.w || 520}px;display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">${head(c, s.title ?? 'Trong hộp có')}<span style="width:44px;height:44px;display:inline-block">${slIcon(s.icon || '📦', 44)}</span></div>${rows}</div>`;
      return { front: root(s, body, { op: o, fy: .37, tr: `translateY(${((1 - clamp(ke, 0, 1)) * 50).toFixed(1)}px) rotate(${((1 - clamp(ke, 0, 1)) * -4).toFixed(2)}deg)` }) };
    },

    // 9. Coupon ticket: perforated stub, monospace code typing in, pulsing Copy button, expiry.
    // { discount:'15%', discount_label:'GIẢM', sub:'tối đa 500K', code, label:'MÃ GIẢM GIÁ', copy:'SAO CHÉP', expiry, logo }
    rv_coupon(s, t, lt) {
      const c = C(s), o = outOp(s, t);
      const Wt = 620, Ht = 236, sx = 200, n = 18, r = 22;
      const ke = E.outBack(prog(lt, 0, .5), 1.4);
      const d = `M${r},0 H${sx - n} A${n} ${n} 0 0 0 ${sx + n},0 H${Wt - r} A${r} ${r} 0 0 1 ${Wt},${r} V${Ht - r} A${r} ${r} 0 0 1 ${Wt - r},${Ht} H${sx + n} A${n} ${n} 0 0 0 ${sx - n},${Ht} H${r} A${r} ${r} 0 0 1 0,${Ht - r} V${r} A${r} ${r} 0 0 1 ${r},0 Z`;
      const gid = `rvcp${String(c.hl + c.card).replace(/[^0-9a-z]/gi, '')}`;
      const shape = `<svg viewBox="0 0 ${Wt} ${Ht}" width="${Wt}" height="${Ht}" style="position:absolute;inset:0;filter:drop-shadow(0 22px 34px rgba(0,0,0,.55))">
        <defs><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="${c.hl}"/><stop offset="${(sx / Wt).toFixed(4)}" stop-color="${c.hl}"/>
          <stop offset="${(sx / Wt).toFixed(4)}" stop-color="${c.card}"/><stop offset="1" stop-color="${c.card}"/></linearGradient></defs>
        <path d="${d}" fill="url(#${gid})" stroke="rgba(255,255,255,.1)" stroke-width="1.5"/>
        <line x1="${sx}" y1="${n + 8}" x2="${sx}" y2="${Ht - n - 8}" stroke="rgba(0,0,0,.4)" stroke-width="3" stroke-dasharray="9 8"/></svg>`;
      const code = String(s.code || 'REVIEW15'), shown = Math.floor(clamp((lt - .45) / .5) * code.length + 1e-6);
      const pulse = 1 + .06 * Math.max(0, Math.sin((lt - 1) * 6)) * (lt > 1 ? 1 : 0), kc = E.outBack(prog(lt, .8, .3), 2.4);
      const stub = `<div style="position:absolute;left:0;top:0;width:${sx}px;height:${Ht}px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#111;text-align:center">
        <div style="font-family:${c.disp};font-weight:900;font-size:22px;line-height:1.3;letter-spacing:.12em">${esc(s.discount_label ?? 'GIẢM')}</div>
        <div style="font-family:${c.disp};font-weight:900;font-size:${String(s.discount || '15%').length > 4 ? 46 : 64}px;line-height:1.1;letter-spacing:-.03em">${esc(s.discount || '15%')}</div>
        ${s.sub ? `<div style="margin-top:4px;font-weight:700;font-size:17px;line-height:1.3">${esc(s.sub)}</div>` : ''}</div>`;
      const right = `<div style="position:absolute;left:${sx + 30}px;right:28px;top:0;height:${Ht}px;display:flex;flex-direction:column;justify-content:center;gap:12px">
        <div style="display:flex;align-items:center;gap:10px;font-family:${c.disp};font-weight:900;font-size:18px;line-height:1.3;letter-spacing:.14em;color:${c.muted}">
          ${s.logo ? logoTile(s.logo, s.shop, 30) : ''}${esc(s.label ?? 'MÃ GIẢM GIÁ')}</div>
        <div style="align-self:flex-start;padding:6px 16px;border:2.5px dashed ${c.hl};border-radius:12px;background:${hexA(c.hl, .08)};
          font-family:Menlo,'SF Mono',Consolas,'Courier New',monospace;font-weight:800;font-size:${code.length > 10 ? 30 : 38}px;line-height:1.3;letter-spacing:.08em;color:${c.text};white-space:nowrap">
          ${[...code].map((ch, i) => `<span style="opacity:${i < shown ? 1 : .12}">${esc(ch)}</span>`).join('')}</div>
        <div style="display:flex;align-items:center;gap:14px">
          <div style="padding:7px 18px;border-radius:999px;background:${c.good};color:#0B0B0C;font-family:${c.disp};font-weight:900;font-size:18px;line-height:1.3;letter-spacing:.06em;white-space:nowrap;
            transform:scale(${(clamp(kc, 0, 1.4) * pulse).toFixed(3)});box-shadow:0 0 ${(18 * (pulse - 1) / .06).toFixed(0)}px ${hexA(c.good, .7)}">⧉ ${esc(s.copy ?? 'SAO CHÉP')}</div>
          ${s.expiry ? `<div style="font-weight:700;font-size:17px;line-height:1.3;color:${c.muted};white-space:nowrap">${esc(s.expiry)}</div>` : ''}</div></div>`;
      const body = `<div style="position:relative;width:${Wt}px;height:${Ht}px;font-family:${c.font}">${shape}${stub}${right}</div>`;
      return { front: root(s, body, { op: o, fy: .44, tr: `translateX(${((1 - clamp(ke, 0, 1.2)) * 320).toFixed(1)}px) rotate(${((1 - ke) * -10 + Math.sin(lt * 1.6) * .6).toFixed(2)}deg)` }) };
    },

    // 10. Sub-scores with mini bars. items: [{label, score, icon?, t}], max:10
    rv_rating_bar(s, t, lt) {
      const c = C(s), o = outOp(s, t), ke = E.outCubic(prog(lt, 0, .3)), max = s.max || 10;
      const rows = (s.items || []).map((x, i) => {
        const ti = x.t ?? s.t0 + .3 + i * (s.stagger ?? .2), k = E.outCubic(prog(t, ti, .7)), ka = E.outCubic(prog(t, ti, .22));
        const col = x.color || tierCol(c, x.score, max);
        return `<div${cidOf(x)} style="display:flex;align-items:center;gap:14px;opacity:${ka.toFixed(3)};transform:translateX(${((1 - ka) * -24).toFixed(1)}px)">
          ${x.icon ? `<span style="flex:none;width:34px;height:34px">${slIcon(x.icon, 34)}</span>` : ''}
          <div style="flex:none;width:${s.label_w || 160}px;font-weight:700;font-size:23px;line-height:1.32;color:${c.text};white-space:nowrap">${esc(x.label || '')}</div>
          <div style="flex:1;height:14px;border-radius:7px;background:rgba(255,255,255,.08);overflow:hidden">
            <div style="height:100%;width:${(x.score / max * k * 100).toFixed(2)}%;border-radius:7px;background:${col};box-shadow:0 0 12px ${hexA(col, .55)}"></div></div>
          <div style="flex:none;width:58px;text-align:right;font-family:${c.disp};font-weight:900;font-size:27px;line-height:1.25;color:${col}">${f1(x.score * k)}</div></div>`;
      }).join('');
      const body = `<div style="${cardCSS(c, 28)};width:${s.w || 600}px;display:flex;flex-direction:column;gap:18px">${head(c, s.title ?? 'Điểm chi tiết')}${rows}</div>`;
      return { front: root(s, body, { op: o, fy: .37, tr: `translateY(${((1 - ke) * 40).toFixed(1)}px)` }) };
    },

    // 11. Pointer callout: pulsing dot at (px, py), elbow line drawing to a label box centred at (x, y).
    // { px, py, x, y, text, sub, color, w }
    rv_callout(s, t, lt) {
      const c = C(s), o = outOp(s, t), [W, H] = DIMS(), col = s.color || c.hl;
      const px = s.px ?? W * .5, py = s.py ?? H * .4, x = s.x ?? W * .72, y = s.y ?? H * .3, bw = s.w || 250;
      const k = (s.size ?? 100) / 100, dir = px < x ? -1 : 1;
      const ax = x + dir * (bw * k) / 2, ay = y, ex = ax + dir * 34;
      const kd = E.outBack(prog(lt, 0, .3), 2.6), kl = E.inOutSine(prog(lt, .15, .4)), kb = E.outBack(prog(lt, .5, .32), 2);
      const pulse = (lt % 1.2) / 1.2;
      const svg = `<svg class="full" viewBox="0 0 ${W} ${H}" style="opacity:${o.toFixed(3)};overflow:visible">
        <circle cx="${px}" cy="${py}" r="${lerp(10, 34, pulse).toFixed(1)}" fill="none" stroke="${col}" stroke-width="3" opacity="${((1 - pulse) * clamp(kd)).toFixed(3)}"/>
        <path d="M${px},${py} L${ex},${ay} L${ax},${ay}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - kl).toFixed(3)}"/>
        <path d="M${px},${py} L${ex},${ay} L${ax},${ay}" fill="none" stroke="${col}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - kl).toFixed(3)}"/>
        <circle cx="${px}" cy="${py}" r="${(9 * clamp(kd, 0, 1.4)).toFixed(1)}" fill="${col}" stroke="#000" stroke-opacity=".5" stroke-width="2"/></svg>`;
      const box = `<div style="width:${bw}px;padding:12px 18px;border-radius:16px;background:${hexA(c.card, .92)};border:2px solid ${col};box-shadow:0 12px 30px rgba(0,0,0,.5),0 0 18px ${hexA(col, .35)};
        transform:scale(${clamp(kb, 0, 1.3).toFixed(3)});opacity:${clamp(kb * 2).toFixed(2)};text-align:${dir < 0 ? 'left' : 'right'}">
        <div style="font-family:${c.disp};font-weight:900;font-size:26px;line-height:1.28;color:${col}">${esc(s.text || 'Tính năng')}</div>
        ${s.sub ? `<div style="font-weight:600;font-size:18px;line-height:1.35;color:${c.text};margin-top:2px">${esc(s.sub)}</div>` : ''}</div>`;
      return { front: svg + root({ ...s, x, y }, box, { op: o }) };
    },
  };
  Object.assign(MODULES, MOD);

  // ---------- caption style "review": heavy white text, black outline, current word in accent, hl words in a yellow box ----------
  CAPTION_STYLES.review = (cap, t) => {
    const c = C(), [W] = DIMS(), vert = VERT();
    const x = cap.x ?? W / 2, dx = x - W / 2, top = cap.y ?? (vert ? 872 : 548), size = cap.size || (vert ? 42 : 40);
    const reveal = TL.caption_reveal === true;
    let cur = -1;
    cap.words.forEach((w, i) => { if (t >= w.s - .03) cur = i; });
    const kin = E.outBack(prog(t, cap.t0, .16), 2);
    const base = cap.color || '#FFFFFF', outline = strokeShadow(Math.max(2, size * .085), '#000') + `,0 ${Math.round(size * .12)}px 0 #000`;
    const html = cap.words.map((w, i) => {
      if (reveal && t < w.s - .02) return `<span style="display:inline-block;opacity:0">${esc(w.w)}</span>`;
      const on = i === cur && t < (w.e ?? w.s + .4) + .12;
      const kp = E.outBack(prog(t, w.s - .03, .16), 3), sc = on ? lerp(1, 1.1, clamp(kp, 0, 1.2)) : 1;
      if (w.hl) {
        return `<span style="display:inline-block;margin:.06em .1em;padding:0 .2em;border-radius:.18em;background:${c.hl};color:#0B0B0C;text-shadow:none;box-shadow:0 .12em 0 #000;
          transform:rotate(-2deg) scale(${(on ? sc : 1).toFixed(3)})">${esc(w.w)}</span>`;
      }
      return `<span style="display:inline-block;margin:0 .03em;${on ? `color:${c.good};` : ''}transform:scale(${sc.toFixed(3)})">${esc(w.w)}</span>`;
    }).join(' ');
    return `<div id="cap"${cidOf(cap)} style="position:absolute;top:${top}px;left:${40 + dx}px;right:${40 - dx}px;text-align:center;white-space:normal;
      font-family:${cap.font || c.disp};font-weight:${cap.weight || 900};font-size:${size}px;line-height:1.3;letter-spacing:-.005em;color:${base};
      text-shadow:${outline};transform:scale(${lerp(.86, 1, clamp(kin, 0, 1.1)).toFixed(3)});transform-origin:50% 0">${html}</div>`;
  };

  // ---------- Studio metadata ----------
  const XY = (y, size = 100) => () => ({ x: DIMS()[0] / 2, y: VERT() ? y : Math.round(y * 720 / 1280 + 40), size: VERT() ? size : Math.round(size * .82) });
  const at = (fy, size) => XY(fy, size)();
  PACKS.push({
    id: P, name: 'Review sản phẩm', icon: '⭐',
    desc: 'Thẻ tối, xanh điện cho ưu điểm, đỏ cho nhược điểm: sản phẩm xoay, chấm điểm, so sánh A vs B, so giá, mã giảm giá, con dấu kết luận',
    caption: 'review',
    items: [
      { type: 'rv_product', label: 'Sản phẩm (hero)', make: T => ({ type: 'rv_product', t0: T, t1: T + 3, ...at(520), image: '', name: 'Galaxy S25 Ultra', brand: 'Samsung', logo: 'si:samsung', price: '27.990.000đ', old_price: '33.990.000đ', badge: 'MỚI' }) },
      { type: 'rv_score', label: 'Điểm tổng (vòng)', make: T => ({ type: 'rv_score', t0: T, t1: T + 3.5, ...at(440), score: 8.6, label: 'Rất đáng tiền' }) },
      { type: 'rv_proscons', label: 'Ưu / Nhược', make: T => ({ type: 'rv_proscons', t0: T, t1: T + 4.5, ...at(470), pros: ['Pin trâu 2 ngày', 'Màn hình sáng rõ', 'Sạc nhanh 45W'], cons: ['Hơi nặng tay', 'Giá còn cao', 'Không kèm củ sạc'] }) },
      { type: 'rv_specs_vs', label: 'So sánh A vs B', make: T => ({ type: 'rv_specs_vs', t0: T, t1: T + 4.5, ...at(470), a: { name: 'Máy A', image: '' }, b: { name: 'Máy B', image: '' },
        rows: [{ label: 'Chip', a: 'SD 8 Gen 3', b: 'A17 Pro', win: 'b' }, { label: 'Pin', a: '5000 mAh', b: '4422 mAh', win: 'a' }, { label: 'Sạc', a: '45W', b: '27W', win: 'a' }, { label: 'Giá', a: '22,9tr', b: '28,9tr', win: 'a' }] }) },
      { type: 'rv_bars', label: 'Biểu đồ test', make: T => ({ type: 'rv_bars', t0: T, t1: T + 3.5, ...at(480), title: 'Thời lượng pin', unit: 'giờ', bars: [{ label: 'Máy A', value: 12 }, { label: 'Máy B', value: 9 }, { label: 'Máy C', value: 7.5 }] }) },
      { type: 'rv_verdict', label: 'Con dấu kết luận', make: T => ({ type: 'rv_verdict', t0: T, t1: T + 2.5, ...at(640), verdict: 'buy', sub: 'Pin trâu, giá hợp lý' }) },
      { type: 'rv_price_compare', label: 'So giá các sàn', make: T => ({ type: 'rv_price_compare', t0: T, t1: T + 3.5, ...at(470), shops: [{ shop: 'Shopee', icon: 'si:shopee', price: '12.490.000đ', note: 'Freeship' },
        { shop: 'Lazada', price: '12.690.000đ', note: 'Tặng ốp lưng' }, { shop: 'TikTok Shop', icon: 'si:tiktok', price: '12.290.000đ', note: 'Voucher live' }] }) },
      { type: 'rv_unbox', label: 'Trong hộp có', make: T => ({ type: 'rv_unbox', t0: T, t1: T + 3.5, ...at(470), items: [{ icon: '📱', text: 'Thân máy' }, { icon: '🔌', text: 'Cáp USB-C' }, { icon: '📄', text: 'Sách hướng dẫn' }, { icon: '📌', text: 'Que chọc SIM' }] }) },
      { type: 'rv_coupon', label: 'Mã giảm giá', make: T => ({ type: 'rv_coupon', t0: T, t1: T + 3.5, ...at(560), discount: '15%', sub: 'tối đa 500K', code: 'REVIEW15', expiry: 'HSD: 30/11', logo: 'si:shopee', shop: 'Shopee' }) },
      { type: 'rv_rating_bar', label: 'Điểm chi tiết', make: T => ({ type: 'rv_rating_bar', t0: T, t1: T + 3.5, ...at(470), items: [{ label: 'Thiết kế', score: 9, icon: '🎨' }, { label: 'Pin', score: 8, icon: '🔋' }, { label: 'Camera', score: 7.5, icon: '📷' }, { label: 'Hiệu năng', score: 8.5, icon: '⚡' }, { label: 'Giá', score: 6.5, icon: '💰' }] }) },
      { type: 'rv_callout', label: 'Chú thích chỉ điểm', make: T => ({ type: 'rv_callout', t0: T, t1: T + 2.5, px: 300, py: 520, x: 520, y: 330, size: 100, text: 'Camera 200MP', sub: 'zoom quang 5x' }) },
    ],
    // Starter edit: product intro → pros/cons, A vs B, coupon on keywords → score + verdict in the last 4 s.
    recipe: ctx => {
      const dur = ctx.dur || 20, caps = ctx.captions || [], b = ctx.brand || {};
      const scenes = [], busy = [];
      const free = (t0, t1) => busy.every(([a, z]) => t1 <= a || t0 >= z);
      // Place a graphic; if it collides with an earlier one, slide it to start right after (keeps its length), trim at the outro.
      const add = (sc) => {
        const len = sc.t1 - sc.t0;
        for (let i = 0; i < 4 && !free(sc.t0, sc.t1); i++) {
          const end = Math.max(...busy.filter(([a, z]) => sc.t1 > a && sc.t0 < z).map(([, z]) => z));
          sc.t0 = end + .05; sc.t1 = sc.t0 + len;
        }
        sc.t1 = Math.min(sc.t1, dur - 4.1);
        if (sc.t1 - sc.t0 < 2 || !free(sc.t0, sc.t1)) return false;
        busy.push([sc.t0, sc.t1]); scenes.push(sc); return true;
      };
      const name = ctx.title || b.product || 'Tên sản phẩm';
      add({ type: 'rv_product', t0: 0, t1: Math.min(3, dur - 4.2), ...at(520), image: ctx.image || b.product_image || '', name, brand: b.name || '', logo: b.logo || '', price: b.price || '' });
      const tp = findWord(caps, ['ưu điểm', 'điểm cộng', 'nhược điểm', 'điểm trừ']);
      if (tp != null) add({ type: 'rv_proscons', t0: Math.max(0, tp - .2), t1: tp + 4.5, ...at(470), pros: ['Ưu điểm 1', 'Ưu điểm 2', 'Ưu điểm 3'], cons: ['Nhược điểm 1', 'Nhược điểm 2'] });
      const tv = findWord(caps, ['so sánh', 'so với']);
      if (tv != null) add({ type: 'rv_specs_vs', t0: Math.max(0, tv - .2), t1: tv + 4.5, ...at(470), a: { name, image: ctx.image || '' }, b: { name: 'Đối thủ', image: '' },
        rows: [{ label: 'Hiệu năng', a: '—', b: '—', win: '' }, { label: 'Pin', a: '—', b: '—', win: '' }, { label: 'Giá', a: '—', b: '—', win: '' }] });
      const tc = findWord(caps, ['mã giảm', 'giảm giá', 'voucher', 'mã giảm giá']);
      if (tc != null) add({ type: 'rv_coupon', t0: Math.max(0, tc - .1), t1: tc + 3.5, ...at(560), discount: '10%', code: 'MAGIAMGIA', expiry: 'HSD: …' });
      const te = Math.max(dur - 4, 0);
      scenes.push({ type: 'rv_score', t0: te, t1: dur, ...at(378, 88), score: 8.5, label: 'Rất đáng tiền', keep: true });
      scenes.push({ type: 'rv_verdict', t0: Math.max(te, dur - 2.2), t1: dur, ...at(748, 96), verdict: 'buy', keep: true });
      return { caption_style: 'review', music: 'hype', scenes };
    },
  });
})();
