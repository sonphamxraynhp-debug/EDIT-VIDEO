// "Bất động sản" pack — upscale property-listing look for Vietnamese real-estate videos (design 720x1280, 9:16;
// horizontal 1280x720 via DIMS()). Deep navy glass cards, warm gold hairlines/numbers, ivory text,
// Playfair Display headings (Vietnamese-safe serif) + Be Vietnam Pro body. Every colour/font overridable via
// timeline.brand: dark = navy, accent = gold, light = ivory, disp = heading font, font = body font.
// Positioning: x/y = centre, size = scale base (60 = 100%); photo modules also take card:{x,y,w,h}.
// Spec: references/pack-realestate.md.
(() => {
  const P = 'realestate';
  const pal = () => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return {
      navy: b.dark || '#0F2A3D', gold: b.accent || '#C9A35B', ivory: b.light || '#F6F1E7',
      serif: b.disp || "'Playfair Display', Georgia, serif", sans: b.font || "'Be Vietnam Pro', system-ui, sans-serif",
    };
  };
  const vert = () => { try { return VERT(); } catch (e) { return true; } };
  const dims = () => { try { return DIMS(); } catch (e) { return [720, 1280]; } };
  const hexRGB = hex => {
    let h = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{3,8}$/i.test(h)) return null;
    if (h.length === 3) h = [...h].map(c => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const al = (hex, a) => { const c = hexRGB(hex); return c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : hex; };
  const mix = (hex, hex2, k) => {
    const a = hexRGB(hex), b = hexRGB(hex2);
    if (!a || !b) return hex;
    return '#' + a.map((v, i) => Math.round(lerp(v, b[i], k)).toString(16).padStart(2, '0')).join('');
  };
  const f = (v, d = 3) => (+v).toFixed(d);
  const SC = s => (s.size || (vert() ? 60 : 54)) / 60;
  const posXY = (s, vx, vy, hx, hy) => [s.x ?? (vert() ? vx : hx), s.y ?? (vert() ? vy : hy)];
  // Fit a single line of text into maxW px (rough glyph-width ratio).
  const fit = (text, base, maxW, ratio = .55, min = 18) => Math.max(min, Math.min(base, maxW / (Math.max(1, [...String(text)].length) * ratio)));
  // Vietnamese number format: 3.25 -> "3,25", 12500 -> "12.500".
  const vn = (v, dec = 0) => {
    const p = Math.pow(10, dec), [i, d] = (Math.round(Math.abs(v) * p + 1e-7) / p).toFixed(dec).split('.');
    return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : '');
  };
  const decOf = v => { const m = String(v).match(/[.,](\d+)/); return m ? m[1].length : 0; };
  const num = v => (typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0);
  const out = s => (s.keep ? null : s.t1);
  const glass = (C, r = 24) => `background:linear-gradient(160deg,${al(mix(C.navy, '#ffffff', .1), .9)},${al(C.navy, .93)});
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid ${al(C.gold, .45)};border-radius:${r}px;
    box-shadow:0 26px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08)`;
  const goldText = (C, shine = -1) => `background:linear-gradient(100deg,${mix(C.gold, '#ffffff', .45)} 0%,${C.gold} 38%,${mix(C.gold, '#000000', .28)} 100%)${shine >= 0 ? `,linear-gradient(100deg,transparent ${f(shine * 140 - 30, 1)}%,rgba(255,255,255,.85) ${f(shine * 140 - 15, 1)}%,transparent ${f(shine * 140, 1)}%)` : ''};
    background-blend-mode:screen;-webkit-background-clip:text;background-clip:text;color:transparent`;

  // ---------- line icons (stroke = currentColor) ----------
  const ICONS = {
    area: '<path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/><rect x="7.5" y="7.5" width="9" height="9" rx="1"/>',
    bed: '<path d="M3 18v-6.5A2 2 0 0 1 5 9.5h14a2 2 0 0 1 2 2V18M3 14.5h18M3 18v2.5M21 18v2.5"/><path d="M6 9.5V7a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 12 7v2.5"/>',
    bath: '<path d="M3.5 12h17v3a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4z"/><path d="M6 12V5.8a1.8 1.8 0 0 1 3.4-.8"/><path d="M7 19l-1 2M17 19l1 2"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/>',
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
    building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M11 21v-3h2v3"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    house: '<path d="M3 11l9-7 9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
    car: '<path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2.5M19 16v2.5M3.5 11h17"/><circle cx="8" cy="13.5" r=".6"/><circle cx="16" cy="13.5" r=".6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>',
    money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
  };
  const ico = (name, size, color, sw = 1.6) => ICONS[name]
    ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display:block">${ICONS[name]}</svg>`
    : slIcon(name, size);

  // ---------- photos ----------
  // Tasteful placeholder (gradient + house icon) underneath; a missing/broken image simply hides itself.
  const placeholder = (C, label) => `<div class="full" style="background:radial-gradient(110% 70% at 28% 18%,${al(C.gold, .32)},transparent 62%),linear-gradient(165deg,${mix(C.navy, '#ffffff', .2)},${C.navy} 75%)">
    <div style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);width:26%;aspect-ratio:1;opacity:.85">${ico('house', '100%', al(C.gold, .9), 1.1)}</div>
    ${label ? `<div style="position:absolute;left:0;right:0;top:64%;text-align:center;font:600 15px ${C.sans};letter-spacing:.2em;color:${al(C.ivory, .55)};text-transform:uppercase">${esc(label)}</div>` : ''}</div>`;
  function photo(C, item, t, imgStyle = '', ph = '') {
    const src = item ? media(item, t) : '';
    return placeholder(C, src ? '' : ph) + (src ? `<img src="${src}" onerror="this.style.display='none'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;${imgStyle}">` : '');
  }
  // Ken Burns per image index: slow push-in with alternating drift.
  const kb = (i, k) => {
    const d = [[-1, -1], [1, -.5], [-.5, 1], [1, 1]][i % 4];
    const sc = i % 2 ? lerp(1.16, 1.05, k) : lerp(1.04, 1.16, k);
    return `transform:scale(${f(sc, 4)}) translate(${f(d[0] * 2.4 * k, 2)}%,${f(d[1] * 1.8 * k, 2)}%);transform-origin:50% 50%`;
  };
  const imgsOf = s => (s.images && s.images.length ? s.images : (s.media ? [].concat(s.media) : []));
  const cardRect = (s, w, h, vx, vy, hx, hy) => {
    if (s.card) return { ...s.card, sc: 1 };
    const [x, y] = posXY(s, vx, vy, hx, hy), sc = SC(s);
    return { x: x - w / 2, y: y - h / 2, w, h, sc };
  };

  // Entrance wrapper for centred cards: fade + rise + slight scale.
  const enterTf = (lt, sc, d = 40) => { const k = E.outCubic(prog(lt, 0, .55)); return `translate(-50%,-50%) translateY(${f((1 - k) * d, 1)}px) scale(${f(sc * lerp(.96, 1, k), 4)})`; };
  const header = (C, title, sub, k = 1) => `<div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;opacity:${f(k)}">
      <div style="width:34px;height:2px;background:${C.gold}"></div>
      <div style="font-family:${C.serif};font-size:30px;line-height:1.25;padding-top:2px;color:${C.ivory};white-space:nowrap">${esc(title)}</div>
      ${sub ? `<div style="margin-left:auto;font:600 15px ${C.sans};letter-spacing:.16em;text-transform:uppercase;color:${C.gold};white-space:nowrap">${esc(sub)}</div>` : ''}</div>`;

  const MOD = {
    // 1. Title card: tag chip, project name (serif, wipe reveal), gold rule, pin + address.
    re_title(s, t, lt) {
      const C = pal(), [W, H] = dims(), sc = SC(s), [x, y] = posXY(s, W / 2, 790, W * .3, H * .66);
      const w = s.w || 620, o = fadeIO(t, s.t0, out(s), .3, .35);
      const kTag = E.outBack(prog(lt, .15, .4), 1.8), kName = E.outCubic(prog(lt, .3, .7)), kLine = E.outCubic(prog(lt, .7, .6)), kAddr = E.outCubic(prog(lt, .9, .5));
      const name = s.name ?? 'The Riverside Residence', fs = fit(name, s.name_size || 54, w - 76, .5, 34);
      const card = `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:${w}px;transform:${enterTf(lt, sc)};opacity:${f(o)}">
        <div style="${glass(C)};padding:30px 38px 30px;position:relative;overflow:hidden">
          <div style="position:absolute;left:0;top:0;width:${f(80 * kLine, 1)}px;height:3px;background:${C.gold}"></div>
          <div style="position:absolute;left:0;top:0;width:3px;height:${f(80 * kLine, 1)}px;background:${C.gold}"></div>
          ${s.tag === false ? '' : `<span style="display:inline-block;background:${C.gold};color:${C.navy};font:800 17px ${C.sans};letter-spacing:.14em;padding:8px 15px 7px;border-radius:6px;transform:scale(${f(clamp(kTag, 0, 1.2))});transform-origin:0 50%;opacity:${f(clamp(kTag * 2))}">${esc(s.tag ?? 'CĂN HỘ 2PN')}</span>`}
          <div style="margin-top:16px;font-family:${C.serif};font-size:${f(fs, 1)}px;line-height:1.24;padding-top:4px;color:${C.ivory};clip-path:inset(-20% ${f((1 - kName) * 100, 1)}% -20% 0)">${esc(name)}</div>
          ${s.sub ? `<div style="margin-top:4px;font-family:${C.serif};font-style:italic;font-size:24px;line-height:1.3;color:${C.gold};opacity:${f(kName)}">${esc(s.sub)}</div>` : ''}
          <div style="height:2px;width:${f(kLine * 100, 1)}%;background:linear-gradient(90deg,${C.gold},transparent);margin:16px 0 14px"></div>
          <div style="display:flex;align-items:center;gap:10px;opacity:${f(kAddr)};transform:translateX(${f((1 - kAddr) * -16, 1)}px)">
            <div style="flex:none">${ico('pin', 26, C.gold, 1.8)}</div>
            <div style="font:500 21px/1.35 ${C.sans};color:${al(C.ivory, .88)}">${esc(s.address ?? 'Đường Nguyễn Hữu Cảnh, Bình Thạnh, TP.HCM')}</div></div>
        </div></div>`;
      const shade = s.shade === false ? '' : `<div class="full" style="background:linear-gradient(180deg,transparent 42%,${al(C.navy, .72)} 100%);opacity:${f(o)}"></div>`;
      return { back: shade, front: card, hideCaptions: s.hideCaptions ?? true };
    },

    // 2. Price reveal: label, struck old price, count-up value + unit, per-m² pill, "GIÁ TỐT" corner ribbon.
    re_price(s, t, lt) {
      const C = pal(), [W, H] = dims(), sc = SC(s), [x, y] = posXY(s, W / 2, 700, W * .7, H / 2);
      const w = s.w || 560, o = fadeIO(t, s.t0, out(s), .3, .3);
      const to = num(s.value ?? 3.25), dec = s.decimals ?? decOf(s.value ?? '3,25'), from = num(s.from ?? 0);
      const kc = E.outExpo(prog(lt, .35, s.count_dur ?? 1.4)), v = lerp(from, to, kc);
      const shine = lt > 1.7 ? prog(lt, 1.7, .8) : -1;
      const kOld = E.outCubic(prog(lt, .15, .4)), kStrike = E.outCubic(prog(lt, .45, .4)), kSub = E.outCubic(prog(lt, 1.3, .5));
      const kRib = E.outBack(prog(lt, 1.5, .45), 1.6), unit = s.unit ?? 'tỷ';
      const txt = vn(v, dec), big = fit(vn(to, dec) + unit, s.value_size || 118, w - 90, .5, 60);
      const ribbon = s.ribbon === false ? '' : `<div style="position:absolute;right:-58px;top:30px;width:230px;transform:rotate(45deg) scale(${f(clamp(kRib, 0, 1.2))});opacity:${f(clamp(kRib * 2))};
        background:${s.ribbon_color || '#B3322A'};color:#fff;text-align:center;font:800 17px/1 ${C.sans};letter-spacing:.14em;padding:11px 0 10px;box-shadow:0 6px 16px rgba(0,0,0,.35)">${esc(s.ribbon ?? 'GIÁ TỐT')}</div>`;
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:${w}px;transform:${enterTf(lt, sc)};opacity:${f(o)}">
          <div style="${glass(C)};padding:30px 40px 32px;position:relative;overflow:hidden;text-align:center">${ribbon}
            <div style="font:700 16px ${C.sans};letter-spacing:.32em;color:${C.gold};text-transform:uppercase">${esc(s.label ?? 'Giá bán')}</div>
            ${s.old ? `<div style="position:relative;display:inline-block;margin-top:12px;font:500 26px/1.3 ${C.sans};color:${al(C.ivory, .55)};opacity:${f(kOld)}">${esc(s.old)}
              <div style="position:absolute;left:-4px;top:54%;height:2.5px;width:calc(${f(kStrike * 100, 1)}% + 8px);background:#D9534A;transform:rotate(-4deg)"></div></div>` : ''}
            <div style="margin-top:${s.old ? 0 : 10}px;white-space:nowrap;line-height:1.15;padding-top:6px">
              <span style="font-family:${C.serif};font-weight:700;font-size:${f(big, 1)}px;${goldText(C, shine)};filter:drop-shadow(0 4px 14px rgba(0,0,0,.35))">${txt}</span>
              <span style="font-family:${C.serif};font-size:${f(big * .38, 1)}px;color:${C.ivory};margin-left:8px">${esc(unit)}</span></div>
            ${s.per_m2 === '' || s.per_m2 === false ? '' : `<div style="display:inline-block;margin-top:10px;padding:8px 20px 9px;border:1px solid ${al(C.gold, .6)};border-radius:999px;font:600 21px ${C.sans};color:${C.ivory};opacity:${f(kSub)};transform:translateY(${f((1 - kSub) * 10, 1)}px)">${esc(s.per_m2 ?? '~ 43 triệu/m²')}</div>`}
          </div></div>`,
        hideCaptions: s.hideCaptions ?? false,
      };
    },

    // 3. Spec grid (3 cols x 2 rows by default) with line icons, staggered pop.
    re_specs(s, t, lt) {
      const C = pal(), [W, H] = dims(), sc = SC(s), [x, y] = posXY(s, W / 2, 650, W * .7, H / 2);
      const w = s.w || 640, o = fadeIO(t, s.t0, out(s), .3, .3), cols = s.cols || 3;
      const items = s.items || [
        { icon: 'area', value: '75 m²', label: 'Diện tích' }, { icon: 'bed', value: '2', label: 'Phòng ngủ' }, { icon: 'bath', value: '2', label: 'WC' },
        { icon: 'compass', value: 'Đông Nam', label: 'Hướng' }, { icon: 'doc', value: 'Sổ hồng', label: 'Pháp lý' }, { icon: 'building', value: 'Tầng 12', label: 'Bàn giao 2024' }];
      const cw = Math.floor((w - 58 - (cols - 1) * 12) / cols);
      const cells = items.map((it, i) => {
        const k = E.outBack(prog(lt, .3 + i * (s.stagger ?? .12), .4), 1.8), kc = clamp(k, 0, 1.15);
        return `<div${cidOf(it)} style="width:${f(cw, 1)}px;padding:18px 8px 16px;border-radius:18px;background:${al(C.ivory, .05)};border:1px solid ${al(C.gold, .22)};text-align:center;
          transform:scale(${f(lerp(.6, 1, kc))});opacity:${f(clamp(k * 2.5))}">
          <div style="width:58px;height:58px;margin:0 auto 10px;border-radius:50%;border:1.5px solid ${al(C.gold, .75)};display:flex;align-items:center;justify-content:center;background:${al(C.gold, .1)}">${ico(it.icon || 'house', 30, C.gold)}</div>
          <div style="font:700 ${f(fit(it.value, 26, cw - 16, .56, 16), 1)}px/1.3 ${C.sans};color:${C.ivory};white-space:nowrap">${esc(it.value)}</div>
          <div style="margin-top:4px;font:600 14px/1.3 ${C.sans};letter-spacing:.1em;text-transform:uppercase;color:${al(C.ivory, .6)};white-space:nowrap">${esc(it.label)}</div></div>`;
      }).join('');
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:${w}px;transform:${enterTf(lt, sc)};opacity:${f(o)}">
          <div style="${glass(C)};padding:26px 28px 28px">${header(C, s.title ?? 'Thông tin căn hộ', s.sub ?? '', E.outCubic(prog(lt, .1, .4)))}
          <div style="display:flex;flex-wrap:wrap;gap:12px">${cells}</div></div></div>`,
        hideCaptions: s.hideCaptions ?? false,
      };
    },

    // 4. Stylised map card: roads draw on, pin drops, radius pulses, POI list rows slide in one by one.
    re_map(s, t, lt) {
      const C = pal(), [W, H] = dims(), sc = SC(s), [x, y] = posXY(s, W / 2, 590, W * .7, H / 2);
      const w = s.w || 640, mh = 360, o = fadeIO(t, s.t0, out(s), .3, .3);
      const kr = E.outCubic(prog(lt, .1, .9)), dash = k => `pathLength="1" stroke-dasharray="1" stroke-dashoffset="${f(1 - k)}"`;
      const land = mix(C.navy, '#ffffff', .1), road = al(C.ivory, .2), major = al(C.gold, .7);
      const pin = { x: 320, y: 175, ...(s.pin || {}) };
      const minor = ['M0,70 L640,62', 'M0,262 L640,276', 'M92,0 L104,360', 'M248,0 L238,360', 'M420,0 L432,360', 'M566,0 L556,360', 'M0,150 L250,160']
        .map(d => `<path d="${d}" ${dash(kr)} stroke="${road}" stroke-width="5" fill="none"/>`).join('');
      const majors = ['M-10,330 L650,40', 'M0,205 C200,190 420,215 640,180']
        .map(d => `<path d="${d}" ${dash(E.outCubic(prog(lt, .25, .9)))} stroke="${major}" stroke-width="9" fill="none" stroke-linecap="round"/>`).join('');
      const kp = E.outBack(prog(lt, .55, .45), 1.5), pinY = lerp(-120, 0, clamp(kp, 0, 1.1));
      const pulses = [0, .8].map(ph => {
        if (lt < 1) return '';
        const r = ((lt - 1 + ph) % 1.6) / 1.6;
        return `<circle cx="${pin.x}" cy="${pin.y}" r="${f(18 + r * 120, 1)}" fill="${al(C.gold, f(.22 * (1 - r), 3))}" stroke="${al(C.gold, f(.8 * (1 - r), 3))}" stroke-width="2"/>`;
      }).join('');
      const rad = E.outCubic(prog(lt, .9, .6));
      const pois = s.pois || [
        { time: "5'", text: 'Trường học quốc tế', icon: '🏫', mx: 140, my: 110 }, { time: "7'", text: 'Siêu thị, TTTM', icon: '🛒', mx: 500, my: 120 },
        { time: "10'", text: 'Trung tâm Quận 1', icon: '🏙️', mx: 560, my: 300 }, { time: "15'", text: 'Sân bay Tân Sơn Nhất', icon: '✈️', mx: 70, my: 300 }];
      const dots = pois.map((p, i) => p.mx == null ? '' : `<circle cx="${p.mx}" cy="${p.my}" r="${f(7 * E.outBack(prog(lt, 1 + i * .35, .3), 2), 2)}" fill="${C.ivory}" stroke="${C.gold}" stroke-width="3"/>`).join('');
      const map = `<svg viewBox="0 0 640 ${mh}" width="100%" height="${mh}" style="display:block">
        <rect width="640" height="${mh}" fill="${land}"/>
        <path d="M-10,310 C110,262 210,350 330,312 S540,226 650,262" stroke="${mix(C.navy, '#4A90B8', .55)}" stroke-width="34" fill="none" opacity="${f(E.outCubic(prog(lt, 0, .5)))}"/>
        <path d="M-10,310 C110,262 210,350 330,312 S540,226 650,262" stroke="${al('#ffffff', .18)}" stroke-width="2" fill="none" stroke-dasharray="8 10"/>
        <g fill="${mix(C.navy, '#4F8A64', .5)}" opacity="${f(E.outCubic(prog(lt, .2, .5)))}"><ellipse cx="160" cy="112" rx="56" ry="34"/><ellipse cx="500" cy="98" rx="44" ry="26"/><ellipse cx="350" cy="250" rx="38" ry="18"/></g>
        ${minor}${majors}
        <circle cx="${pin.x}" cy="${pin.y}" r="${f(130 * rad, 1)}" fill="none" stroke="${al(C.gold, .55)}" stroke-width="1.5" stroke-dasharray="5 7"/>
        ${pulses}${dots}
        <ellipse cx="${pin.x}" cy="${pin.y + 3}" rx="${f(14 * clamp(kp), 1)}" ry="${f(5 * clamp(kp), 1)}" fill="rgba(0,0,0,.4)"/>
        <g transform="translate(${pin.x},${f(pin.y + pinY, 1)})" opacity="${f(clamp(prog(lt, .55, .1)))}">
          <path d="M0,0 C-6,-14 -22,-26 -22,-44 A22,22 0 1 1 22,-44 C22,-26 6,-14 0,0z" fill="${C.gold}" stroke="${mix(C.gold, '#000000', .3)}" stroke-width="1.5"/>
          <circle cx="0" cy="-44" r="9" fill="${C.navy}"/></g>
        ${s.radius_label === false ? '' : `<g opacity="${f(rad)}"><rect x="${pin.x + 92}" y="${pin.y - 104}" width="74" height="28" rx="14" fill="${C.navy}" stroke="${al(C.gold, .7)}"/>
          <text x="${pin.x + 129}" y="${pin.y - 85}" text-anchor="middle" font-family="Be Vietnam Pro" font-weight="700" font-size="15" fill="${C.gold}">${esc(s.radius_label ?? '3 km')}</text></g>`}
      </svg>`;
      const rows = pois.map((p, i) => {
        const k = E.outCubic(prog(lt, 1 + i * (s.stagger ?? .35), .4));
        return `<div${cidOf(p)} style="display:flex;align-items:center;gap:14px;height:54px;opacity:${f(k)};transform:translateX(${f((1 - k) * -30, 1)}px);${i ? `border-top:1px solid ${al(C.ivory, .08)}` : ''}">
          <div style="min-width:66px;padding:6px 10px 5px;border-radius:9px;background:${C.gold};color:${C.navy};font:800 19px/1.2 ${C.sans};text-align:center;white-space:nowrap">${esc(p.time)}</div>
          ${p.icon ? `<div style="flex:none;width:30px;height:30px">${slIcon(p.icon, 30)}</div>` : ''}
          <div style="font:500 21px/1.3 ${C.sans};color:${C.ivory};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.text)}</div></div>`;
      }).join('');
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:${w}px;transform:${enterTf(lt, sc)};opacity:${f(o)}">
          <div style="${glass(C)};overflow:hidden">
            <div style="position:relative">${map}
              <div style="position:absolute;left:18px;top:16px;padding:7px 14px 8px;border-radius:10px;background:${al(C.navy, .85)};border:1px solid ${al(C.gold, .5)};font-family:${C.serif};font-size:22px;line-height:1.25;color:${C.ivory}">${esc(s.title ?? 'Vị trí đắc địa')}</div></div>
            <div style="padding:12px 26px 16px">${rows}</div></div></div>`,
        hideCaptions: s.hideCaptions ?? true,
      };
    },

    // 5. Amenities icon grid (emoji / Fluent 3D / si: / image icons).
    re_amenities(s, t, lt) {
      const C = pal(), [W, H] = dims(), sc = SC(s), [x, y] = posXY(s, W / 2, 650, W * .7, H / 2);
      const w = s.w || 640, o = fadeIO(t, s.t0, out(s), .3, .3), cols = s.cols || 3;
      const items = s.items || [{ icon: '🏊', label: 'Hồ bơi' }, { icon: '🏋️', label: 'Phòng gym' }, { icon: '🌳', label: 'Công viên' },
        { icon: '🛡️', label: 'An ninh 24/7' }, { icon: '🛒', label: 'Siêu thị' }, { icon: '🏫', label: 'Trường học' }];
      const cw = Math.floor((w - 58 - (cols - 1) * 12) / cols);
      const tiles = items.map((it, i) => {
        const k = E.outBack(prog(lt, .3 + i * (s.stagger ?? .12), .42), 2), kc = clamp(k, 0, 1.15);
        const bob = lt > 1 ? Math.sin((lt + i * .7) * 2.2) * 3 : 0;
        return `<div${cidOf(it)} style="width:${f(cw, 1)}px;height:150px;border-radius:18px;background:linear-gradient(170deg,${al(C.ivory, .09)},${al(C.ivory, .03)});border:1px solid ${al(C.gold, .25)};
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;transform:scale(${f(lerp(.5, 1, kc))});opacity:${f(clamp(k * 2.5))}">
          <div style="width:64px;height:64px;transform:translateY(${f(bob, 1)}px)">${slIcon(it.icon, 64)}</div>
          <div style="font:700 ${f(fit(it.label, 19, cw - 14, .55, 14), 1)}px/1.3 ${C.sans};color:${C.ivory};white-space:nowrap">${esc(it.label)}</div></div>`;
      }).join('');
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:${w}px;transform:${enterTf(lt, sc)};opacity:${f(o)}">
          <div style="${glass(C)};padding:26px 28px 28px">${header(C, s.title ?? 'Tiện ích nội khu', s.sub ?? `${items.length}+ tiện ích`, E.outCubic(prog(lt, .1, .4)))}
          <div style="display:flex;flex-wrap:wrap;gap:12px">${tiles}</div></div></div>`,
        hideCaptions: s.hideCaptions ?? false,
      };
    },

    // 6. Photo slideshow: fullscreen (mode:'full', default) or card; Ken Burns + crossfade + room label lower-left.
    re_gallery(s, t, lt) {
      const C = pal(), [W, H] = dims(), imgs = imgsOf(s), n = Math.max(1, imgs.length), labels = s.labels || [];
      const per = s.per || (s.t1 - s.t0) / n, xf = Math.min(s.xfade ?? .5, per * .5);
      const i = Math.min(n - 1, Math.floor(lt / per)), li = lt - i * per;
      const full = (s.mode || 'full') === 'full';
      const o = full ? 1 - clamp(prog(t, s.t1 - .2, .2)) * (s.keep ? 0 : 1) : fadeIO(t, s.t0, out(s), .35, .3);
      const layer = (j, op) => `<div class="full" style="opacity:${f(op)};overflow:hidden">${photo(C, imgs[j], t, kb(j, clamp((lt - j * per + xf) / (per + xf))), labels[j] || 'Ảnh ' + (j + 1))}</div>`;
      let stack = '';
      if (i > 0 && li < xf) stack += layer(i - 1, 1);
      stack += layer(i, i > 0 ? E.inOutSine(clamp(li / xf)) : (full ? clamp(lt / .3) : 1));
      const lab = labels[i] ?? '', kl = E.outCubic(prog(li, i > 0 ? xf * .5 : .2, .55));
      const labelHTML = (fs, bottom, left) => lab ? `<div style="position:absolute;left:${left}px;bottom:${bottom}px;right:${left}px">
          <div style="display:flex;align-items:center;gap:12px;font:700 16px ${C.sans};letter-spacing:.22em;color:${C.gold};text-shadow:0 1px 8px rgba(0,0,0,.6);opacity:${f(kl)}">
            <span>${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</span><span style="height:2px;width:${f(60 * kl, 1)}px;background:${C.gold};box-shadow:0 1px 6px rgba(0,0,0,.5)"></span></div>
          <div style="margin-top:6px;font-family:${C.serif};font-size:${fs}px;line-height:1.25;padding-top:4px;color:${C.ivory};text-shadow:0 3px 18px rgba(0,0,0,.55);clip-path:inset(-20% ${f((1 - kl) * 100, 1)}% -20% 0)">${esc(lab)}</div></div>` : '';
      if (full) {
        const segs = s.progress === false ? '' : `<div style="position:absolute;left:40px;right:40px;top:${vert() ? 150 : 36}px;display:flex;gap:8px">${Array.from({ length: n }, (_, j) =>
          `<div style="flex:1;height:3px;border-radius:2px;background:${al(C.ivory, .3)};overflow:hidden"><div style="height:100%;width:${f(clamp((lt - j * per) / per) * 100, 1)}%;background:${C.gold}"></div></div>`).join('')}</div>`;
        const ly = s.label_y ?? (vert() ? 870 : 600);
        return {
          back: `<div class="full"${cidOf(s)} style="opacity:${f(o)}">${stack}
            <div class="full" style="background:linear-gradient(180deg,${al(C.navy, .5)} 0%,transparent 22%,transparent 45%,${al(C.navy, .55)} 66%,${al(C.navy, .88)} 100%)"></div>
            ${segs}<div style="position:absolute;left:0;right:0;top:0;height:${ly}px">${labelHTML(s.label_size || 50, 0, 44)}</div></div>`,
          cover: lt >= .3 && o >= .999, hideCaptions: s.hideCaptions ?? false,
        };
      }
      const c = cardRect(s, s.w || 560, s.h || 700, W / 2, 560, W * .7, H / 2), k = E.outCubic(prog(lt, 0, .55));
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:26px;overflow:hidden;opacity:${f(o)};
          border:1.5px solid ${al(C.gold, .55)};box-shadow:0 26px 60px rgba(0,0,0,.5);transform:translateY(${f((1 - k) * 40, 1)}px) scale(${f(c.sc * lerp(.95, 1, k), 4)})">
          ${stack}<div class="full" style="background:linear-gradient(180deg,transparent 55%,${al(C.navy, .85)} 100%)"></div>${labelHTML(s.label_size || 40, 28, 30)}</div>`,
        hideCaptions: s.hideCaptions ?? false,
      };
    },

    // 7. Before / after wipe: divider sweeps across, revealing images[1] over images[0].
    re_compare(s, t, lt) {
      const C = pal(), [W, H] = dims(), imgs = imgsOf(s), labels = s.labels || ['THÔ', 'HOÀN THIỆN'];
      const c = cardRect(s, s.w || 600, s.h || 740, W / 2, 580, W * .7, H / 2);
      const o = fadeIO(t, s.t0, out(s), .3, .3), k = E.outCubic(prog(lt, 0, .5));
      const keys = s.keys || [{ t: 0, p: .94 }, { t: .5, p: .94 }, { t: 2, p: .06 }, { t: 2.8, p: .5 }];
      let p = keys[0].p;
      for (let j = 1; j < keys.length; j++) if (lt >= keys[j - 1].t) p = lerp(keys[j - 1].p, keys[j].p, E.inOutSine(prog(lt, keys[j - 1].t, keys[j].t - keys[j - 1].t)));
      const px = p * c.w;
      const chip = (txt, side, gold) => `<div style="position:absolute;top:22px;${side}:22px;padding:9px 16px 8px;border-radius:9px;font:800 17px/1.2 ${C.sans};letter-spacing:.14em;white-space:nowrap;
        ${gold ? `background:${C.gold};color:${C.navy}` : `background:${al(C.navy, .82)};color:${C.ivory};border:1px solid ${al(C.ivory, .3)}`}">${esc(txt)}</div>`;
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:26px;overflow:hidden;opacity:${f(o)};
          border:1.5px solid ${al(C.gold, .55)};box-shadow:0 26px 60px rgba(0,0,0,.5);transform:translateY(${f((1 - k) * 40, 1)}px) scale(${f(c.sc * lerp(.95, 1, k), 4)})">
          <div class="full">${photo(C, imgs[0], t, 'transform:scale(1.04)', labels[0])}</div>
          <div class="full" style="clip-path:inset(0 0 0 ${f(px, 1)}px)">${photo(C, imgs[1], t, 'transform:scale(1.04)', labels[1])}</div>
          <div style="opacity:${f(clamp(p * 4))}">${chip(labels[0], 'left', false)}</div>
          <div style="opacity:${f(clamp((1 - p) * 4))}">${chip(labels[1], 'right', true)}</div>
          <div style="position:absolute;top:0;bottom:0;left:${f(px - 1.5, 1)}px;width:3px;background:${C.ivory};box-shadow:0 0 14px rgba(0,0,0,.5)"></div>
          <div style="position:absolute;left:${f(px - 30, 1)}px;top:${f(c.h / 2 - 30, 1)}px;width:60px;height:60px;border-radius:50%;background:${C.gold};border:3px solid ${C.ivory};box-shadow:0 6px 18px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="${C.navy}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l-5 6 5 6M15 6l5 6-5 6"/></svg></div>
          ${s.title ? `<div style="position:absolute;left:0;right:0;bottom:0;padding:60px 28px 24px;background:linear-gradient(180deg,transparent,${al(C.navy, .9)});font-family:${C.serif};font-size:32px;line-height:1.25;color:${C.ivory}">${esc(s.title)}</div>` : ''}</div>`,
        hideCaptions: s.hideCaptions ?? true,
      };
    },

    // 8. Floor plan on ivory paper: image or generated SVG plan (walls draw on) + numbered pins with labels.
    re_floorplan(s, t, lt) {
      const C = pal(), [W, H] = dims(), sc = SC(s), [x, y] = posXY(s, W / 2, 600, W * .7, H / 2);
      const w = s.w || 640, pw = w - 48, ph = Math.round(pw * .7), o = fadeIO(t, s.t0, out(s), .3, .3);
      const kw = E.outCubic(prog(lt, .2, 1)), kf = E.outCubic(prog(lt, .8, .5));
      const rooms = s.rooms || [
        { n: 'Phòng khách', a: '28 m²', r: [20, 20, 330, 230] }, { n: 'Bếp', a: '10 m²', r: [330, 20, 580, 140] }, { n: 'WC', r: [330, 140, 440, 230] },
        { n: 'Phòng ngủ 1', a: '14 m²', r: [20, 230, 250, 400] }, { n: 'Phòng ngủ 2', a: '11 m²', r: [250, 230, 450, 400] }, { n: 'WC', r: [440, 140, 580, 230] }, { n: 'Ban công', r: [450, 230, 580, 400] }];
      let plan;
      if (s.image) plan = `<img src="${media(s.image, t)}" onerror="this.style.display='none'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:${f(E.outCubic(prog(lt, .2, .6)))}">`;
      else {
        const dash = `pathLength="1" stroke-dasharray="1" stroke-dashoffset="${f(1 - kw)}"`;
        const R = rooms.map((rm, i) => {
          const [x0, y0, x1, y1] = rm.r, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, tint = i % 2 ? al(C.gold, .1) : al(C.navy, .04);
          return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${tint}" opacity="${f(kf)}"/>
            <path d="M${x0},${y0}H${x1}V${y1}H${x0}Z" ${dash} fill="none" stroke="${C.navy}" stroke-width="3"/>
            <text x="${cx}" y="${cy + (rm.a ? -2 : 6)}" text-anchor="middle" font-family="Be Vietnam Pro" font-weight="600" font-size="${x1 - x0 < 120 ? 13 : 16}" fill="${al(C.navy, .72)}" opacity="${f(kf)}">${esc(rm.n)}</text>
            ${rm.a ? `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="Be Vietnam Pro" font-size="13" fill="${al(C.navy, .5)}" opacity="${f(kf)}">${esc(rm.a)}</text>` : ''}`;
        }).join('');
        plan = `<svg viewBox="0 0 600 420" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0">
          ${R}<path d="M20,20H580V400H20Z" ${dash} fill="none" stroke="${C.navy}" stroke-width="7"/>
          <g fill="none" stroke="${al(C.navy, .55)}" stroke-width="1.5" opacity="${f(kf)}"><path d="M180,230 A40,40 0 0 1 220,190"/><path d="M290,230 A36,36 0 0 0 326,194"/><path d="M330,180 A30,30 0 0 1 360,150"/></g>
          <g stroke="${C.ivory}" stroke-width="8" opacity="${f(kf)}"><path d="M180,230H220M290,230H326M330,150V180"/></g></svg>`;
      }
      const pins = (s.pins || [{ x: 14, y: 44, label: 'Phòng khách rộng' }, { x: 64, y: 14, label: 'Bếp mở' }, { x: 10, y: 88, label: 'Phòng ngủ master' }, { x: 86, y: 63, label: 'Ban công' }])
        .map((pn, i) => {
          const k = E.outBack(prog(lt, 1 + i * (s.stagger ?? .35), .4), 2.2), right = pn.x > 60;
          return `<div${cidOf(pn)} style="position:absolute;left:${pn.x}%;top:${pn.y}%;transform:translate(-50%,-50%) scale(${f(clamp(k, 0, 1.2))});opacity:${f(clamp(k * 3))}">
            <div style="position:relative;width:40px;height:40px;border-radius:50%;background:${C.gold};border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font:800 18px ${C.sans};color:${C.navy}">${i + 1}
              ${pn.label ? `<div style="position:absolute;top:50%;${right ? 'right' : 'left'}:46px;transform:translateY(-50%);white-space:nowrap;padding:6px 12px 7px;border-radius:8px;background:${C.navy};color:${C.ivory};font:600 15px/1.25 ${C.sans};box-shadow:0 4px 12px rgba(0,0,0,.25)">${esc(pn.label)}</div>` : ''}</div></div>`;
        }).join('');
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:${w}px;transform:${enterTf(lt, sc)};opacity:${f(o)}">
          <div style="background:${C.ivory};border-radius:24px;padding:22px 24px 24px;border:1px solid ${al(C.gold, .6)};box-shadow:0 26px 60px rgba(0,0,0,.45)">
            <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px">
              <div style="font-family:${C.serif};font-size:30px;line-height:1.25;padding-top:2px;color:${C.navy};white-space:nowrap">${esc(s.title ?? 'Mặt bằng căn hộ')}</div>
              <div style="margin-left:auto;font:700 15px ${C.sans};letter-spacing:.14em;color:${mix(C.gold, '#000000', .2)};white-space:nowrap">${esc(s.sub ?? '75 m² · 2PN · 2WC')}</div></div>
            <div style="position:relative;width:${pw}px;height:${ph}px">${plan}${pins}</div></div></div>`,
        hideCaptions: s.hideCaptions ?? false,
      };
    },

    // 9. Agent contact: card (default) or lower-third (mode:'lower'); avatar = brand.logo or initials; Zalo + "Gọi ngay" pulse.
    re_agent(s, t, lt) {
      const C = pal(), B = BR(), [W, H] = dims(), sc = SC(s), lower = s.mode === 'lower';
      const name = s.name ?? (B.name || 'Nguyễn Minh Anh'), phone = s.phone ?? (B.phone || '0909 123 456');
      const avatar = s.avatar ?? B.logo, role = s.role ?? 'Chuyên viên tư vấn BĐS';
      const initials = name.split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase();
      const o = fadeIO(t, s.t0, out(s), .3, .3);
      const ka = E.outBack(prog(lt, .15, .45), 1.8), k1 = E.outCubic(prog(lt, .3, .45)), k2 = E.outCubic(prog(lt, .5, .45)), k3 = E.outBack(prog(lt, .7, .45), 1.7);
      const av = sz => `<div style="flex:none;width:${sz}px;height:${sz}px;border-radius:50%;padding:4px;background:linear-gradient(140deg,${mix(C.gold, '#ffffff', .4)},${C.gold});transform:scale(${f(clamp(ka, 0, 1.2))});box-shadow:0 8px 20px rgba(0,0,0,.35)">
          <div style="width:100%;height:100%;border-radius:50%;overflow:hidden;background:${C.navy};display:flex;align-items:center;justify-content:center;position:relative">
            <span style="font-family:${C.serif};font-size:${f(sz * .38, 1)}px;color:${C.gold};line-height:1">${esc(initials)}</span>
            ${avatar ? `<img src="${media(avatar, t)}" onerror="this.style.display='none'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : ''}</div></div>`;
      const pr = lt > 1 ? ((lt - 1) % 1.3) / 1.3 : -1;
      const ring = pr < 0 ? '' : `<div style="position:absolute;inset:0;border-radius:999px;border:2px solid ${C.gold};transform:scale(${f(1 + pr * .35)},${f(1 + pr * .8)});opacity:${f((1 - pr) * .8)}"></div>`;
      const beat = lt > 1 ? 1 + .035 * Math.sin((lt - 1) * Math.PI * 2 / 1.3) : 1;
      const callBtn = (fs, pad) => `<div style="position:relative;display:inline-block;transform:scale(${f(clamp(k3, 0, 1.2) * beat)})">${ring}
          <div style="position:relative;display:flex;align-items:center;gap:10px;padding:${pad};border-radius:999px;background:linear-gradient(140deg,${mix(C.gold, '#ffffff', .3)},${C.gold});color:${C.navy};font:800 ${fs}px/1.2 ${C.sans};white-space:nowrap;box-shadow:0 8px 22px ${al(C.gold, .4)}">
            ${ico('phone', fs + 4, C.navy, 2.2)}${esc(s.cta ?? 'Gọi ngay')}</div></div>`;
      if (lower) {
        const [x, y] = posXY(s, 30, 800, 40, 580);
        return {
          front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translateY(-50%) translateX(${f((1 - E.outCubic(prog(lt, 0, .5))) * -60, 1)}px) scale(${f(sc)});transform-origin:0 50%;opacity:${f(o)}">
            <div style="${glass(C, 999)};display:flex;align-items:center;gap:16px;padding:10px 12px 10px 10px">${av(84)}
              <div style="opacity:${f(k1)};padding-right:6px"><div style="font-family:${C.serif};font-size:28px;line-height:1.25;color:${C.ivory};white-space:nowrap">${esc(name)}</div>
                <div style="font:600 15px/1.3 ${C.sans};color:${C.gold};letter-spacing:.06em;white-space:nowrap">${esc(role)} · ${esc(phone)}</div></div>
              ${callBtn(18, '12px 20px')}</div></div>`,
          hideCaptions: s.hideCaptions ?? false,
        };
      }
      const [x, y] = posXY(s, W / 2, 680, W * .7, H / 2), w = s.w || 600;
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:${w}px;transform:${enterTf(lt, sc)};opacity:${f(o)}">
          <div style="${glass(C)};padding:34px 36px 32px;text-align:center">
            <div style="display:flex;justify-content:center">${av(128)}</div>
            <div style="margin-top:16px;font-family:${C.serif};font-size:${f(fit(name, 40, w - 80, .5, 26), 1)}px;line-height:1.25;color:${C.ivory};opacity:${f(k1)}">${esc(name)}</div>
            <div style="margin-top:2px;font:600 17px/1.3 ${C.sans};letter-spacing:.16em;text-transform:uppercase;color:${C.gold};opacity:${f(k1)}">${esc(role)}</div>
            <div style="margin:18px auto 0;display:inline-flex;align-items:center;gap:12px;opacity:${f(k2)};transform:translateY(${f((1 - k2) * 10, 1)}px)">
              ${ico('phone', 30, C.gold, 1.8)}<span style="font:800 36px/1.2 ${C.sans};letter-spacing:.04em;color:${C.ivory}">${esc(phone)}</span></div>
            <div style="margin-top:22px;display:flex;justify-content:center;gap:16px;align-items:center">
              ${s.zalo === false ? '' : `<div style="display:flex;align-items:center;gap:10px;padding:14px 26px;border-radius:999px;background:#0068FF;color:#fff;font:800 22px/1.2 ${C.sans};transform:scale(${f(clamp(k3, 0, 1.2))});box-shadow:0 8px 22px rgba(0,104,255,.35)">
                ${ico('chat', 24, '#fff', 2.2)}Zalo</div>`}
              ${callBtn(22, '14px 28px')}</div>
            ${(s.website ?? B.website) ? `<div style="margin-top:18px;font:500 17px ${C.sans};color:${al(C.ivory, .6)};opacity:${f(k2)}">${esc(s.website ?? B.website)}</div>` : ''}
          </div></div>`,
        hideCaptions: s.hideCaptions ?? true,
      };
    },

    // 10. Stamp / badge slam: "ĐÃ BÁN", "HOT", "CHỈ CÒN 2 CĂN".
    re_stamp(s, t, lt) {
      const C = pal(), [W, H] = dims(), sc = SC(s), [x, y] = posXY(s, W / 2, 560, W * .7, H * .45);
      const text = s.text ?? 'ĐÃ BÁN';
      const col = s.color || (/BÁN|HẾT|HOT/i.test(text) ? '#B3322A' : mix(C.gold, '#000000', .18));
      const o = fadeIO(t, s.t0, out(s), .05, .3);
      const ks = prog(lt, 0, .22), slam = ks < 1 ? lerp(2.6, 1, E.inCubic(ks)) : 1 + .06 * Math.sin(prog(lt, .22, .3) * Math.PI) * (1 - prog(lt, .22, .3));
      const sh = s.shake === false ? 0 : (1 - prog(lt, .22, .3)) * (lt > .22 ? 6 : 0), j = Math.floor(t * 30);
      const fs = fit(text, s.font_size || 74, 520, .62, 34);
      const dust = lt > .2 && lt < .8 ? (() => { const r = prog(lt, .2, .6); return `<div style="position:absolute;left:50%;top:50%;width:${f(300 + r * 260, 0)}px;height:${f(150 + r * 160, 0)}px;transform:translate(-50%,-50%);border-radius:50%;border:3px solid ${al(col, .5)};opacity:${f(1 - r)}"></div>`; })() : '';
      // Ink grit: three offset speckle grids intersected (pure CSS, deterministic).
      const grit = [1.3, 1, 1.6].map(r => `radial-gradient(circle,transparent 0 ${r}px,#000 ${r + .7}px)`).join(',');
      const gritCSS = `-webkit-mask-image:${grit};mask-image:${grit};-webkit-mask-size:23px 19px,31px 13px,17px 29px;mask-size:23px 19px,31px 13px,17px 29px;-webkit-mask-position:0 0,4px 3px,7px 11px;mask-position:0 0,4px 3px,7px 11px;-webkit-mask-composite:source-in;mask-composite:intersect`;
      return {
        back: s.dim ? `<div class="full" style="background:${al(C.navy, s.dim)};opacity:${f(o)}"></div>` : '',
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) translate(${f(Math.sin(j * 2.1) * sh, 1)}px,${f(Math.cos(j * 1.7) * sh, 1)}px) rotate(${s.rotate ?? -9}deg) scale(${f(sc * slam)});opacity:${f(o * clamp(ks * 3))}">
          ${dust}<div style="position:relative;padding:8px;border:6px solid ${col};border-radius:16px;background:${al(C.ivory, s.paper ?? .9)};${s.grit === false ? '' : gritCSS};box-shadow:0 10px 30px rgba(0,0,0,.3)">
            <div style="border:2px solid ${col};border-radius:9px;padding:${s.sub ? '10px 34px 8px' : '12px 34px 10px'};text-align:center;color:${col};white-space:nowrap">
              ${s.sub ? `<div style="font:800 20px/1.2 ${C.sans};letter-spacing:.3em">${esc(s.sub)}</div>` : ''}
              <div style="font:900 ${f(fs, 1)}px/1.18 ${C.sans};letter-spacing:.05em;padding-top:4px">${esc(text)}</div></div></div></div>`,
        hideCaptions: s.hideCaptions ?? false,
      };
    },

    // 11. Mortgage estimate: price, LTV, rate, term -> monthly payment (amortised), count-up + principal/interest bar.
    re_loan(s, t, lt) {
      const C = pal(), [W, H] = dims(), sc = SC(s), [x, y] = posXY(s, W / 2, 620, W * .7, H / 2);
      const w = s.w || 620, o = fadeIO(t, s.t0, out(s), .3, .3);
      const price = num(s.price ?? 3.25), ltv = num(s.ltv ?? 70) / 100, rate = num(s.rate ?? 8), years = num(s.years ?? 20);
      const loan = price * ltv * 1e9, r = rate / 1200, n = Math.round(years * 12);
      const M = r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
      const total = M * n, interest = total - loan, monthly = M / 1e6;
      const kc = E.outExpo(prog(lt, 1, 1.2)), shine = lt > 2.1 ? prog(lt, 2.1, .8) : -1;
      const rows = [['Giá nhà', `${vn(price, decOf(s.price ?? '3,25'))} tỷ`], [`Vay ${Math.round(ltv * 100)}%`, `${vn(loan / 1e9, 2)} tỷ`], ['Lãi suất', `${vn(rate, decOf(s.rate ?? 8))}%/năm`], ['Thời hạn', `${years} năm`]]
        .map(([a, b], i) => {
          const k = E.outCubic(prog(lt, .25 + i * .18, .4));
          return `<div style="display:flex;justify-content:space-between;align-items:center;height:48px;border-bottom:1px solid ${al(C.ivory, .08)};opacity:${f(k)};transform:translateX(${f((1 - k) * -20, 1)}px)">
            <span style="font:500 20px ${C.sans};color:${al(C.ivory, .7)}">${esc(a)}</span><span style="font:700 22px ${C.sans};color:${C.ivory}">${esc(b)}</span></div>`;
        }).join('');
      const kr = E.outCubic(prog(lt, .9, .4)), kb2 = E.outCubic(prog(lt, 1.6, .6)), pPct = loan / total;
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:${w}px;transform:${enterTf(lt, sc)};opacity:${f(o)}">
          <div style="${glass(C)};padding:26px 32px 28px">${header(C, s.title ?? 'Ước tính trả góp', '', E.outCubic(prog(lt, .1, .4)))}${rows}
            <div style="margin-top:20px;text-align:center;opacity:${f(kr)}">
              <div style="font:700 16px ${C.sans};letter-spacing:.24em;color:${C.gold};text-transform:uppercase">${esc(s.label ?? 'Trả mỗi tháng ≈')}</div>
              <div style="white-space:nowrap;line-height:1.15;padding-top:6px"><span style="font-family:${C.serif};font-weight:700;font-size:84px;${goldText(C, shine)}">${vn(monthly * kc, 1)}</span>
                <span style="font-family:${C.serif};font-size:30px;color:${C.ivory};margin-left:8px">triệu</span></div></div>
            <div style="margin-top:14px;opacity:${f(kb2)}">
              <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;background:${al(C.ivory, .12)}">
                <div style="width:${f(pPct * 100 * kb2, 1)}%;background:${C.gold}"></div><div style="width:${f((1 - pPct) * 100 * kb2, 1)}%;background:${al(C.ivory, .45)}"></div></div>
              <div style="display:flex;justify-content:space-between;margin-top:8px;font:500 15px ${C.sans};color:${al(C.ivory, .65)}">
                <span><b style="color:${C.gold}">●</b> Gốc ${vn(loan / 1e9, 2)} tỷ</span><span><b style="color:${al(C.ivory, .6)}">●</b> Lãi ${vn(interest / 1e9, 2)} tỷ</span></div>
              <div style="margin-top:10px;font:italic 400 13px ${C.sans};color:${al(C.ivory, .45)};text-align:center">${esc(s.note ?? '*Tham khảo, tính theo dư nợ giảm dần, lãi suất cố định')}</div></div>
          </div></div>`,
        hideCaptions: s.hideCaptions ?? true,
      };
    },
  };
  Object.assign(MODULES, MOD);

  // ---------- caption style: white sans + gold serif-italic keywords on a soft navy strip ----------
  CAPTION_STYLES.realestate = (c, t) => {
    const C = pal(), [W] = dims();
    const top = c.y ?? (vert() ? 925 : 585), x = c.x ?? W / 2, size = c.size || (vert() ? 30 : 32);
    const reveal = TL.caption_reveal !== false, o = fadeIO(t, c.t0, c.t1, .15, .12);
    const words = c.words.map(w => {
      const k = reveal ? E.outCubic(prog(t, w.s - .03, .18)) : 1, st = `opacity:${f(k)};display:inline-block;transform:translateY(${f((1 - k) * 8, 1)}px)`;
      return (w.hl
        ? `<span style="${st};font-family:${C.serif};font-style:italic;font-weight:700;font-size:1.16em;color:${C.gold};text-shadow:0 2px 12px rgba(0,0,0,.5),0 0 18px ${al(C.gold, .25)}">${esc(w.w)}</span>`
        : `<span style="${st}">${esc(w.w)}</span>`) + (w.br ? '<br>' : ' ');
    }).join('');
    const hair = pos => `<div style="position:absolute;left:12%;right:12%;${pos}:0;height:1px;background:linear-gradient(90deg,transparent,${al(C.gold, .75)},transparent)"></div>`;
    return `<div id="cap" class="realestate"${cidOf(c)} style="left:${x - W / 2}px;right:${W / 2 - x}px;top:${top}px;text-align:center;opacity:${f(o)};text-shadow:none">
      <div style="position:relative;display:inline-block;max-width:${W - 70}px;padding:12px 40px 14px;background:linear-gradient(90deg,transparent,${al(C.navy, .78)} 14%,${al(C.navy, .78)} 86%,transparent);
        font-family:${c.font || C.sans};font-size:${size}px;font-weight:${c.weight || 600};line-height:1.32;color:${c.color || '#fff'};text-align:center">${hair('top')}${words}${hair('bottom')}</div></div>`;
  };

  // ---------- Studio metadata ----------
  const IMGS = ['media/living.jpg', 'media/bedroom.jpg', 'media/kitchen.jpg', 'media/facade.jpg'];
  const items = [
    { type: 're_title', label: 'Thẻ tiêu đề dự án', make: T => ({ type: 're_title', t0: T, t1: T + 2.8, x: 360, y: 790, size: 60, tag: 'CĂN HỘ 2PN', name: 'The Riverside Residence', address: 'Đường Nguyễn Hữu Cảnh, Bình Thạnh, TP.HCM' }) },
    { type: 're_price', label: 'Giá bán (đếm số)', make: T => ({ type: 're_price', t0: T, t1: T + 3, x: 360, y: 700, size: 60, value: '3,25', unit: 'tỷ', old: '3,6 tỷ', per_m2: '~ 43 triệu/m²', ribbon: 'GIÁ TỐT' }) },
    { type: 're_specs', label: 'Thông số căn', make: T => ({ type: 're_specs', t0: T, t1: T + 3.5, x: 360, y: 650, size: 60, title: 'Thông tin căn hộ' }) },
    { type: 're_map', label: 'Bản đồ vị trí', make: T => ({ type: 're_map', t0: T, t1: T + 4, x: 360, y: 590, size: 60, title: 'Vị trí đắc địa', radius_label: '3 km' }) },
    { type: 're_amenities', label: 'Tiện ích', make: T => ({ type: 're_amenities', t0: T, t1: T + 3.5, x: 360, y: 650, size: 60, title: 'Tiện ích nội khu' }) },
    { type: 're_gallery', label: 'Ảnh căn nhà (slideshow)', make: T => ({ type: 're_gallery', t0: T, t1: T + 6, mode: 'full', images: IMGS.slice(), labels: ['Phòng khách', 'Phòng ngủ master', 'Bếp mở', 'Mặt tiền dự án'] }) },
    { type: 're_compare', label: 'Trước / sau', make: T => ({ type: 're_compare', t0: T, t1: T + 3.5, x: 360, y: 580, size: 60, images: ['media/raw.jpg', 'media/living.jpg'], labels: ['THÔ', 'HOÀN THIỆN'] }) },
    { type: 're_floorplan', label: 'Mặt bằng', make: T => ({ type: 're_floorplan', t0: T, t1: T + 4, x: 360, y: 600, size: 60, title: 'Mặt bằng căn hộ', sub: '75 m² · 2PN · 2WC' }) },
    { type: 're_agent', label: 'Thẻ môi giới / CTA', make: T => ({ type: 're_agent', t0: T, t1: T + 3.5, x: 360, y: 680, size: 60 }) },
    { type: 're_agent', label: 'Môi giới (lower-third)', make: T => ({ type: 're_agent', t0: T, t1: T + 4, mode: 'lower', x: 30, y: 800, size: 60 }) },
    { type: 're_stamp', label: 'Con dấu ĐÃ BÁN / HOT', make: T => ({ type: 're_stamp', t0: T, t1: T + 2, x: 360, y: 560, size: 60, text: 'ĐÃ BÁN' }) },
    { type: 're_loan', label: 'Tính trả góp', make: T => ({ type: 're_loan', t0: T, t1: T + 4.5, x: 360, y: 620, size: 60, price: '3,25', ltv: 70, rate: 8, years: 20 }) },
  ];
  const MK = {};
  for (const it of items) if (!MK[it.type]) MK[it.type] = it.make;

  PACKS.push({
    id: P, name: 'Bất động sản', icon: '🏡', caption: 'realestate',
    desc: 'Giới thiệu căn hộ, nhà phố, dự án: thẻ kính navy–vàng, giá đếm số, thông số, bản đồ vị trí, tiện ích, ảnh Ken Burns, mặt bằng, trả góp, thẻ môi giới',
    items,
    recipe: ctx => {
      const dur = ctx.dur, caps = ctx.captions || [], end = Math.max(3, dur - 3.5);
      const horiz = ctx.vertical === false;
      const fix = sc => { if (horiz) { delete sc.x; delete sc.y; delete sc.size; } return sc; };
      const fw = n => (typeof findWord === 'function' ? findWord(caps, n) : null);
      const title = ctx.title || 'Căn hộ cao cấp';
      const scenes = [fix({ ...MK.re_title(0), t1: Math.min(2.8, end), name: title })];
      const cands = [
        ['re_specs', fw(['phòng ngủ', 'diện tích', 'mét vuông', 'm2']), 3.2],
        ['re_price', fw(['giá', 'tỷ']), 3],
        ['re_map', fw(['vị trí', 'cách', 'gần']), 3.6],
        ['re_amenities', fw(['tiện ích']), 3.2],
      ].filter(c => c[1] != null).sort((a, b) => a[1] - b[1]);
      let free = 3;
      for (const [type, at, d] of cands) {
        const t0 = Math.max(at - .1, free);
        if (t0 + 1.6 > end) continue;
        const t1 = Math.min(t0 + d, end);
        scenes.push(fix({ ...MK[type](t0), t0: +t0.toFixed(2), t1: +t1.toFixed(2) }));
        free = t1 + .2;
      }
      scenes.push(fix({ ...MK.re_agent(end), t0: +end.toFixed(2), t1: +dur.toFixed(2) }));
      return { caption_style: 'realestate', music: 'inspire', scenes };
    },
  });
})();
