// "Screencast" pack — screen-recording tutorials in the Screen-Studio look: the recording floats in a browser /
// window / laptop frame over a gradient wallpaper, the camera smoothly zooms and pans to where the work happens
// (focus keys), click ripples, an enlarged smooth cursor, shortcut keycaps, numbered callouts, a face-cam
// bubble and a spotlight highlight. All overlay coordinates are SCREEN pixels of the recording (sw × sh) and are
// mapped through the active sc_screen's current zoom, so they stay glued to the UI. Pure functions of t.
// Times (focus/clicks/cursor) are absolute timeline seconds. Helper: scripts/screen_focus.py. Spec: references/pack-screencast.md.
(() => {
  const P = 'screencast';
  const f3 = v => (+v).toFixed(3), f1 = v => (+v).toFixed(1);
  const dims = () => { try { return DIMS(); } catch (e) { return [1280, 720]; } };
  const vert = () => { try { return VERT(); } catch (e) { return false; } };
  const pal = () => { const b = BR(); return { p: b.primary, a: b.accent, d: b.dark, l: b.light, font: b.font, b }; };
  const UI = "Inter, 'Be Vietnam Pro', system-ui, sans-serif";
  const ioC = k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2); // easeInOutCubic

  const WALL = {
    aurora: 'radial-gradient(70% 90% at 15% 20%, #7B5CFF 0%, transparent 60%), radial-gradient(60% 80% at 90% 30%, #FF6FB1 0%, transparent 60%), radial-gradient(80% 90% at 60% 100%, #3BC8FF 0%, transparent 60%), #2A2350',
    sunset: 'radial-gradient(70% 90% at 20% 10%, #FFB36B 0%, transparent 60%), radial-gradient(70% 90% at 90% 80%, #FF5A7A 0%, transparent 60%), #6B2D5C',
    ocean: 'radial-gradient(80% 90% at 10% 90%, #00C2A8 0%, transparent 60%), radial-gradient(70% 80% at 90% 10%, #3A7BFF 0%, transparent 60%), #10265A',
    mint: 'radial-gradient(80% 90% at 20% 20%, #B9F6CA 0%, transparent 60%), radial-gradient(70% 80% at 85% 85%, #7FD1FF 0%, transparent 60%), #E9F3F1',
    dark: 'radial-gradient(70% 80% at 50% 0%, #2B2F45 0%, transparent 70%), #0E0F15',
  };
  const wallCSS = (bg, C) => !bg ? WALL.aurora : WALL[bg] ? WALL[bg] : bg === 'brand' ? `radial-gradient(70% 90% at 15% 20%, ${C.p} 0%, transparent 60%), radial-gradient(70% 90% at 90% 90%, ${C.a} 0%, transparent 60%), ${C.d}` : bg;

  // ---------- geometry ----------
  // Content rect (canvas px) of the recording inside its frame, plus chrome sizes.
  function geom(s) {
    const [W, H] = dims(), V = vert(), sw = s.sw || 1280, sh = s.sh || 800, frame = s.frame || 'browser';
    const bar = frame === 'browser' ? 38 : frame === 'window' ? 30 : 0, bez = frame === 'device' ? 14 : 0, base = frame === 'device' ? 22 : 0;
    if (frame === 'none') {
      const k = Math.min(W / sw, H / sh), rw = sw * k, rh = sh * k;
      return { W, H, sw, sh, frame, bar: 0, bez: 0, base: 0, rx: (W - rw) / 2, ry: (H - rh) / 2, rw, rh, rad: 0 };
    }
    const area = V ? { x: 20, y: 120, w: W - 40, h: (s.area_h || 600) } : { x: 50, y: 34, w: W - 100, h: H - 34 - (s.bottom ?? 74) };
    const sc = (s.size || 60) / 60;
    let rw = Math.min(area.w - 2 * bez, (area.h - bar - 2 * bez - base) * sw / sh) * sc, rh = rw * sh / sw;
    const cx = s.x ?? (area.x + area.w / 2), cy = s.y ?? (area.y + area.h / 2);
    const totH = rh + bar + 2 * bez + base;
    const rx = cx - rw / 2, ry = cy - totH / 2 + bar + bez;
    return { W, H, sw, sh, frame, bar, bez, base, rx, ry, rw, rh, rad: frame === 'device' ? 6 : 12 };
  }
  // Camera {x,y,s} at t (screen px + zoom) from focus keys; each key is reached AT key.t after easing for key.dur (.8 s).
  function cam(s, t) {
    const g = geom(s), keys = s.focus || [];
    const d0 = { x: g.sw / 2, y: g.sh / 2, s: 1 };
    if (!keys.length) return d0;
    if (t <= keys[0].t) {
      const k = keys[0], dur = k.dur ?? .8, e = ioC(clamp((t - (k.t - dur)) / dur));
      return { x: lerp(d0.x, k.x ?? d0.x, e), y: lerp(d0.y, k.y ?? d0.y, e), s: lerp(1, k.s ?? 1, e) };
    }
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i];
      if (t < b.t) {
        const dur = Math.min(b.dur ?? .8, b.t - a.t), e = ioC(clamp((t - (b.t - dur)) / dur));
        return { x: lerp(a.x ?? d0.x, b.x ?? d0.x, e), y: lerp(a.y ?? d0.y, b.y ?? d0.y, e), s: lerp(a.s ?? 1, b.s ?? 1, e) };
      }
    }
    const L = keys[keys.length - 1];
    return { x: L.x ?? d0.x, y: L.y ?? d0.y, s: L.s ?? 1 };
  }
  const zoomMode = s => s.zoom_mode || (vert() ? 'inside' : 'canvas');
  // Affine (scale k, translate tx,ty) applied to the zoomed group at t.
  function xform(s, t) {
    const g = geom(s), c = cam(s, t), k = Math.max(1, c.s);
    const px = g.rx + c.x / g.sw * g.rw, py = g.ry + c.y / g.sh * g.rh;
    const inside = zoomMode(s) === 'inside';
    const vp = inside ? { x: g.rx, y: g.ry, w: g.rw, h: g.rh } : { x: 0, y: 0, w: g.W, h: g.H };
    const ccx = inside ? g.rx + g.rw / 2 : g.rx + g.rw / 2, ccy = g.ry + g.rh / 2;
    const idx = ccx * (1 - k), idy = ccy * (1 - k);
    const fx = vp.x + vp.w / 2 - k * px, fy = (inside ? vp.y + vp.h / 2 : ccy) - k * py;
    const m = clamp((k - 1) / .25);
    let tx = lerp(idx, fx, m), ty = lerp(idy, fy, m);
    const lox = vp.x + vp.w - k * (g.rx + g.rw), hix = vp.x - k * g.rx;
    const loy = vp.y + vp.h - k * (g.ry + g.rh), hiy = vp.y - k * g.ry;
    if (lox <= hix) tx = clamp(tx, lox, hix);
    if (loy <= hiy) ty = clamp(ty, loy, hiy);
    return { k, tx, ty, g };
  }
  // Screen point -> canvas point at t through the active (or given) sc_screen.
  function activeScreen(t, ref) {
    const L = (typeof TL !== 'undefined' && TL && TL.scenes) || [];
    return L.find(x => x.type === 'sc_screen' && !x.hidden && (ref ? x.cid === ref : true) && t >= x.t0 && t < x.t1)
      || L.find(x => x.type === 'sc_screen' && !x.hidden && (!ref || x.cid === ref)) || null;
  }
  function map(t, x, y, ref) {
    const s = activeScreen(t, ref);
    if (!s) { const [W, H] = dims(); return { x: x / 1280 * W, y: y / 800 * H, k: 1 }; }
    const { k, tx, ty, g } = xform(s, t);
    const X = k * (g.rx + x / g.sw * g.rw) + tx, Y = k * (g.ry + y / g.sh * g.rh) + ty;
    // vis: point is inside the visible viewport (the content rect in 'inside' zoom mode, the canvas otherwise)
    const vp = zoomMode(s) === 'inside' ? [g.rx, g.ry, g.rx + g.rw, g.ry + g.rh] : [0, 0, g.W, g.H];
    return { x: X, y: Y, k: k * g.rw / g.sw, vis: X >= vp[0] - 2 && X <= vp[2] + 2 && Y >= vp[1] - 2 && Y <= vp[3] + 2 };
  }
  window.SC_MAP = map;

  // Fake app UI when no recording is given (sw × sh px), so the module never renders empty.
  function fakeUI(g, C) {
    const cards = [0, 1, 2].map(i => `<div style="flex:1;background:#fff;border-radius:14px;padding:20px;box-shadow:0 2px 10px rgba(20,30,60,.06)">
      <div style="font:600 14px ${UI};color:#7A8197">${['Doanh thu', 'Khách mới', 'Tỉ lệ chốt'][i]}</div><div style="font:800 32px ${UI};color:#1B1F2A;margin-top:8px">${['128 tr', '+342', '4,8%'][i]}</div>
      <div style="height:6px;border-radius:3px;background:#EEF0F5;margin-top:14px"><div style="height:100%;width:${[72, 54, 38][i]}%;border-radius:3px;background:${C.p}"></div></div></div>`).join('');
    const rows = ['Chiến dịch Tết', 'Black Friday', 'Ra mắt sản phẩm', 'Webinar AI'].map((r, i) => `<div style="display:flex;justify-content:space-between;padding:14px 4px;border-bottom:1px solid #EEF0F5;font:500 15px ${UI};color:#1B1F2A"><span>${r}</span><span style="color:${i % 2 ? '#12B76A' : '#7A8197'}">${i % 2 ? 'Đang chạy' : 'Bản nháp'}</span></div>`).join('');
    return `<div style="position:absolute;left:0;top:0;width:${g.sw}px;height:${g.sh}px;transform:scale(${f3(g.rw / g.sw)});transform-origin:0 0;display:flex;background:#F5F6FA">
      <div style="width:220px;background:#151A2D;padding:24px 16px;color:#C8CEE0;font:500 15px ${UI}"><div style="font:800 20px ${UI};color:#fff;margin-bottom:26px">⚡ Workspace</div>
        ${['Tổng quan', 'Chiến dịch', 'Khách hàng', 'Báo cáo', 'Cài đặt'].map((x, i) => `<div style="padding:10px 12px;border-radius:8px;margin-bottom:4px;${i === 0 ? 'background:#2B3356;color:#fff' : ''}">${x}</div>`).join('')}</div>
      <div style="flex:1;padding:30px 36px"><div style="font:800 26px ${UI};color:#1B1F2A">Tổng quan</div><div style="font:500 14px ${UI};color:#7A8197;margin:6px 0 22px">Hiệu quả 30 ngày qua</div>
        <div style="display:flex;gap:18px">${cards}</div><div style="background:#fff;border-radius:14px;padding:12px 20px;margin-top:20px">${rows}</div></div></div>`;
  }
  // Frame of the recording at t: holds the last frame instead of looping. media: "x.png" | {seq,fps,count} ; in (s) = source start.
  function screenSrc(s, t) {
    const m = s.media;
    if (!m) return '';
    if (typeof m === 'string' || m.src) return media(m, t);
    const fps = m.fps || TL.fps, n = clamp(Math.floor((t - s.t0 + (s.in || 0)) * fps + 1e-6) + 1, 1, m.count || 1e9);
    return url(fmtSeq(m.seq, n));
  }

  Object.assign(MODULES, {
    // Recording in a frame over a wallpaper with Screen-Studio zoom & pan.
    // media, sw/sh (1280×800), in, frame 'browser'|'window'|'device'|'none', url (address bar), title, bg (aurora|sunset|ocean|mint|dark|brand|css),
    // focus:[{t,x,y,s,dur}], zoom_mode 'canvas'|'inside', x/y/size (window centre / scale 60 = 100%), shadow, radius.
    sc_screen(s, t) {
      const C = pal(), { k, tx, ty, g } = xform(s, t);
      const prev = xform(s, t - 1 / 30), speed = Math.hypot(tx - prev.tx, ty - prev.ty) + Math.abs(k - prev.k) * 600;
      const mb = Math.min(2.2, speed / 40) / Math.sqrt(k);
      const src = screenSrc(s, t);
      const content = src ? `<img src="${src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill">` : fakeUI(g, C);
      const inside = zoomMode(s) === 'inside';
      const rad = s.radius ?? g.rad;
      const o = fadeIO(t, s.t0, s.t1, .35, .3), e = E.outCubic(prog(t, s.t0, .5));
      const tl = ['#FF5F57', '#FEBC2E', '#28C840'].map(c => `<span style="width:12px;height:12px;border-radius:50%;background:${c};display:inline-block;margin-right:8px"></span>`).join('');
      let chrome = '';
      if (g.frame === 'browser') chrome = `<div style="position:absolute;left:${g.rx}px;top:${g.ry - g.bar}px;width:${g.rw}px;height:${g.bar}px;background:#E9EAEE;border-radius:${rad}px ${rad}px 0 0;display:flex;align-items:center;padding-left:14px">
          ${tl}<div style="margin-left:14px;flex:0 1 ${Math.round(g.rw * .5)}px;height:24px;border-radius:7px;background:#fff;font:500 13px ${UI};color:#555B6E;display:flex;align-items:center;padding:0 12px;white-space:nowrap;overflow:hidden">🔒 ${esc(s.url || 'app.example.com')}</div></div>`;
      if (g.frame === 'window') chrome = `<div style="position:absolute;left:${g.rx}px;top:${g.ry - g.bar}px;width:${g.rw}px;height:${g.bar}px;background:#2A2C35;border-radius:${rad}px ${rad}px 0 0;display:flex;align-items:center;padding-left:12px">${tl}
          <div style="flex:1;text-align:center;margin-right:80px;font:600 13px ${UI};color:#C9CBD6">${esc(s.title || '')}</div></div>`;
      const outerR = g.frame === 'browser' || g.frame === 'window' ? `0 0 ${rad}px ${rad}px` : `${rad}px`;
      const shadow = s.shadow === false ? '' : `box-shadow:0 ${g.frame === 'none' ? 0 : 30}px 80px rgba(0,0,0,.45), 0 8px 24px rgba(0,0,0,.25);`;
      const device = g.frame === 'device' ? `<div style="position:absolute;left:${g.rx - g.bez}px;top:${g.ry - g.bez}px;width:${g.rw + 2 * g.bez}px;height:${g.rh + 2 * g.bez}px;background:#0B0B0E;border-radius:18px;border:2px solid #3A3B42;${shadow}"></div>
          <div style="position:absolute;left:${g.rx - g.bez - 46}px;top:${g.ry + g.rh + g.bez}px;width:${g.rw + 2 * g.bez + 92}px;height:${g.base}px;background:linear-gradient(#D4D6DC,#9A9DA6);border-radius:0 0 22px 22px"></div>` : '';
      const body = `<div style="position:absolute;left:${g.rx}px;top:${g.ry}px;width:${g.rw}px;height:${g.rh}px;overflow:hidden;border-radius:${outerR};background:#fff;${g.frame === 'device' ? '' : shadow}">
          ${inside ? `<div style="position:absolute;left:${-g.rx}px;top:${-g.ry}px;width:${g.W}px;height:${g.H}px;transform-origin:0 0;transform:translate(${f1(tx)}px,${f1(ty)}px) scale(${f3(k)});${mb > .3 ? `filter:blur(${f1(mb)}px)` : ''}">
            <div style="position:absolute;left:${g.rx}px;top:${g.ry}px;width:${g.rw}px;height:${g.rh}px;overflow:hidden">${content}</div></div>` : content}</div>`;
      const group = inside ? device + chrome + body
        : `<div class="full" style="transform-origin:0 0;transform:translate(${f1(tx)}px,${f1(ty)}px) scale(${f3(k)});${mb > .3 ? `filter:blur(${f1(mb)}px)` : ''}">${device}${chrome}${body}</div>`;
      const wall = g.frame === 'none' ? `<div class="full" style="background:${s.bg ? wallCSS(s.bg, C) : '#000'}"></div>` : `<div class="full" style="background:${wallCSS(s.bg, C)};transform:scale(${f3(1 + (k - 1) * .06)})"></div>`;
      return {
        back: `<div class="full"${cidOf(s)} style="overflow:hidden;opacity:${f3(o)}">${wall}<div class="full" style="transform:translateY(${f1((1 - e) * 40)}px) scale(${f3(lerp(.94, 1, e))});transform-origin:50% 50%">${group}</div></div>`,
        cover: true,
      };
    },

    // Click ripples at clicks:[{t,x,y}] (screen px). color, size (ring radius 44), screen (cid of the sc_screen).
    sc_click(s, t) {
      const C = pal(), col = s.color || C.a, R = s.size || 44;
      let out = '';
      for (const c of s.clicks || []) {
        const lt = t - c.t;
        if (lt < -.05 || lt > .75) continue;
        const p = map(t, c.x, c.y, s.screen), z = Math.min(2.2, Math.max(.8, p.k * 1.25));
        if (p.vis === false) continue;
        const k1 = E.outCubic(clamp(lt / .6)), k2 = E.outCubic(clamp((lt - .12) / .6));
        const press = lt < .12 ? lerp(.6, 1, clamp(lt / .12)) : lerp(1, 0, clamp((lt - .12) / .35));
        const ring = (k, w, a) => `<div style="position:absolute;left:${f1(p.x)}px;top:${f1(p.y)}px;width:${f1(2 * R * z * k)}px;height:${f1(2 * R * z * k)}px;margin:${f1(-R * z * k)}px 0 0 ${f1(-R * z * k)}px;border-radius:50%;border:${w}px solid ${col};opacity:${f3(a * (1 - k))}"></div>`;
        out += ring(.15 + .85 * k1, 4, 1) + ring(.15 + .85 * k2, 2, .7) +
          `<div style="position:absolute;left:${f1(p.x)}px;top:${f1(p.y)}px;width:${f1(26 * z)}px;height:${f1(26 * z)}px;margin:${f1(-13 * z)}px 0 0 ${f1(-13 * z)}px;border-radius:50%;background:${col};opacity:${f3(.45 * press)}"></div>`;
      }
      return out ? { front: `<div class="full"${cidOf(s)} style="pointer-events:none">${out}</div>` } : {};
    },

    // Enlarged smooth cursor following keys:[{t,x,y,dur}] (screen px); press dips at clicks:[{t}] or [t]; size (1.5), style 'mac'|'dot'.
    sc_cursor(s, t) {
      const keys = s.keys || [];
      if (!keys.length) return {};
      const sx = keyAt(keys.map(k => ({ ...k, dur: k.dur ?? .55 })), t, 'x', 640), sy = keyAt(keys.map(k => ({ ...k, dur: k.dur ?? .55 })), t, 'y', 400);
      const p = map(t, sx, sy, s.screen), z = Math.min(2.4, Math.max(.7, p.k)) * (s.size || 1.5);
      if (p.vis === false) return {};
      const press = (s.clicks || []).map(c => (typeof c === 'number' ? c : c.t)).reduce((m, ct) => Math.max(m, t >= ct - .06 && t < ct + .22 ? 1 - Math.abs(t - ct - .04) / .18 : 0), 0);
      const sc = 1 - .18 * clamp(press), o = fadeIO(t, s.t0, s.t1, .2, .2);
      const body = s.style === 'dot'
        ? `<div style="width:${f1(28 * z)}px;height:${f1(28 * z)}px;margin:${f1(-14 * z)}px 0 0 ${f1(-14 * z)}px;border-radius:50%;background:rgba(20,20,30,.35);border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.35)"></div>`
        : `<svg width="${f1(24 * z)}" height="${f1(32 * z)}" viewBox="0 0 24 32" style="display:block;filter:drop-shadow(0 ${f1(3 * z)}px ${f1(4 * z)}px rgba(0,0,0,.35))"><path d="M2 2 L2 25 L8 19.5 L12.2 29 L16 27.4 L11.9 18 L20 18 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;
      return { front: `<div class="abs"${cidOf(s)} style="left:${f1(p.x)}px;top:${f1(p.y)}px;opacity:${f3(o)};transform:scale(${f3(sc)});transform-origin:0 0;z-index:60">${body}</div>` };
    },

    // Shortcut keycaps popping one by one: keys "⌘ + K" | ["Ctrl","Shift","P"], label (caption under), x/y/size, theme 'dark'|'light'.
    sc_keys(s, t) {
      const [W, H] = dims(), V = vert(), C = pal();
      const keys = Array.isArray(s.keys) ? s.keys : String(s.keys || '⌘ + K').split('+').map(x => x.trim()).filter(Boolean);
      const sz = (s.size || 60) / 60, x = s.x ?? W / 2, y = s.y ?? (V ? 620 : H - 200);
      const o = fadeIO(t, s.t0, s.t1, .01, .25), light = s.theme === 'light';
      const lt = t - s.t0;
      const caps = keys.map((kk, i) => {
        const at = .1 + i * .14, e = E.outBack(clamp((lt - at) / .3), 2.2), op = clamp((lt - at) / .08);
        const hit = Math.max(0, 1 - Math.abs(lt - (.1 + keys.length * .14 + .1)) / .12); // all keys "pressed" together
        const wide = kk.length > 2;
        return `${i ? `<span style="font:800 ${Math.round(34 * sz)}px ${UI};color:${light ? C.d : '#fff'};opacity:${f3(op * .8)};margin:0 ${Math.round(10 * sz)}px">+</span>` : ''}
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:${Math.round(76 * sz)}px;height:${Math.round(76 * sz)}px;padding:0 ${wide ? Math.round(20 * sz) : 0}px;border-radius:${Math.round(16 * sz)}px;
            background:${light ? 'linear-gradient(#FFFFFF,#E9EBF0)' : 'linear-gradient(#3A3D4A,#22242C)'};color:${light ? '#1B1F2A' : '#fff'};font:700 ${Math.round((wide ? 28 : 38) * sz)}px ${UI};
            box-shadow:0 ${f1((6 - 4 * hit) * sz)}px 0 ${light ? '#B9BDC8' : '#0E0F14'}, 0 ${Math.round(14 * sz)}px ${Math.round(30 * sz)}px rgba(0,0,0,.35);border:1px solid ${light ? '#D7DAE2' : 'rgba(255,255,255,.12)'};
            opacity:${f3(op)};transform:translateY(${f1(((1 - e) * 30 + 4 * hit) * sz)}px) scale(${f3(lerp(.5, 1, e))})">${esc(kk)}</span>`;
      }).join('');
      const lab = s.label ? `<div style="margin-top:${Math.round(14 * sz)}px;font:600 ${Math.round(24 * sz)}px ${UI};color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.6);opacity:${f3(clamp((lt - .5) / .25))}">${esc(s.label)}</div>` : '';
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%);opacity:${f3(o)};text-align:center;white-space:nowrap">
          <div style="display:inline-flex;align-items:center;padding:${Math.round(16 * sz)}px ${Math.round(22 * sz)}px;border-radius:${Math.round(26 * sz)}px;background:rgba(10,12,20,.55);backdrop-filter:blur(8px);
            opacity:${f3(clamp((lt - .05) / .1))};transform:scale(${f3(lerp(.7, 1, E.outBack(clamp((lt - .05) / .3), 1.8)))})">${caps}</div>${lab}</div>`,
      };
    },

    // Numbered step bubble pointing at a screen point: num, text, at:{x,y} (screen px), dx/dy (bubble offset, canvas px), color, screen.
    sc_callout(s, t) {
      const [W, H] = dims(), C = pal(), col = s.color || C.p;
      const at = s.at || { x: 640, y: 400 }, p = map(t, at.x, at.y, s.screen), lt = t - s.t0;
      if (p.vis === false) return {};
      const dx = s.dx ?? (p.x > W * .6 ? -220 : 160), dy = s.dy ?? (p.y > H * .5 ? -110 : 100);
      const bx = p.x + dx, by = p.y + dy, o = fadeIO(t, s.t0, s.t1, .01, .25);
      const eDot = E.outBack(clamp(lt / .3), 2), eLine = E.outCubic(clamp((lt - .12) / .3)), eB = E.outBack(clamp((lt - .3) / .35), 1.6);
      const pul = .5 + .5 * Math.sin(lt * 6);
      const lx = lerp(p.x, bx, eLine), ly = lerp(p.y, by, eLine);
      const sz = (s.size || 60) / 60;
      return {
        front: `<div class="full"${cidOf(s)} style="opacity:${f3(o)};pointer-events:none">
          <svg width="${W}" height="${H}" style="position:absolute;left:0;top:0"><line x1="${f1(p.x)}" y1="${f1(p.y)}" x2="${f1(lx)}" y2="${f1(ly)}" stroke="${col}" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/></svg>
          <div style="position:absolute;left:${f1(p.x)}px;top:${f1(p.y)}px;width:${f1(44 + 14 * pul)}px;height:${f1(44 + 14 * pul)}px;transform:translate(-50%,-50%) scale(${f3(eDot)});border-radius:50%;border:3px solid ${col};background:${col}33"></div>
          <div style="position:absolute;left:${f1(p.x)}px;top:${f1(p.y)}px;width:14px;height:14px;transform:translate(-50%,-50%) scale(${f3(eDot)});border-radius:50%;background:${col};box-shadow:0 0 0 3px #fff"></div>
          <div style="position:absolute;left:${f1(bx)}px;top:${f1(by)}px;transform:translate(${dx < 0 ? '-100%' : '0'},-50%) scale(${f3(eB)});transform-origin:${dx < 0 ? '100%' : '0'} 50%;opacity:${f3(clamp((lt - .3) / .1))};
            display:flex;align-items:center;gap:${Math.round(12 * sz)}px;padding:${Math.round(10 * sz)}px ${Math.round(20 * sz)}px ${Math.round(10 * sz)}px ${Math.round(10 * sz)}px;border-radius:${Math.round(40 * sz)}px;background:#fff;box-shadow:0 12px 30px rgba(0,0,0,.3);max-width:${Math.round(W * .5)}px">
            <span style="flex:none;width:${Math.round(44 * sz)}px;height:${Math.round(44 * sz)}px;border-radius:50%;background:${col};color:#fff;font:800 ${Math.round(24 * sz)}px ${UI};display:flex;align-items:center;justify-content:center">${esc(s.num ?? 1)}</span>
            <span style="font:700 ${Math.round(24 * sz)}px ${UI};color:#1B1F2A;line-height:1.2">${esc(s.text || 'Bấm vào đây')}</span></div></div>`,
      };
    },

    // Speaker picture-in-picture from the A-roll: shape 'circle'|'rounded', corner 'br'|'bl'|'tr'|'tl'|'bc', size (diameter px), x/y (centre),
    // zoom (1.7 = how tight on the face), face {x,y} (design px of the source, default timeline.face), aspect (source w/h), name.
    sc_facecam(s, t) {
      const [W, H] = dims(), V = vert(), C = pal();
      const D = s.size || (V ? 330 : 210), shape = s.shape || 'circle', m = V ? 40 : 34;
      const corner = s.corner || (V ? 'bc' : 'br');
      const cx = s.x ?? (corner === 'bc' ? W / 2 : corner.includes('r') ? W - m - D / 2 : m + D / 2);
      const cy = s.y ?? (corner.startsWith('t') ? m + D / 2 : corner === 'bc' ? H - (V ? 120 : m) - D / 2 : H - m - D / 2);
      const A = s.aspect || (TL.aroll && TL.aroll.aspect) || 9 / 16;
      const [dw, dh] = A < 1 ? [720, 1280] : [1280, 720];
      const face = s.face || TL.face || { x: dw / 2, y: dh * .4 };
      const iw = D * (s.zoom || (A < 1 ? 1.7 : 2.6)), ih = iw / A;
      const lx = clamp(D / 2 - face.x / dw * iw, D - iw, 0), ly = clamp(D / 2 - face.y / dh * ih, D - ih, 0);
      const e = E.outBack(clamp((t - s.t0) / .45), 1.5), o = fadeIO(t, s.t0, s.t1, .15, .25);
      const r = shape === 'circle' ? '50%' : `${Math.round(D * .16)}px`;
      const name = s.name ? `<div style="position:absolute;left:50%;top:${D - 14}px;transform:translateX(-50%);white-space:nowrap;padding:6px 16px;border-radius:20px;background:${C.p};color:#fff;font:700 ${Math.round(D * .075)}px ${UI};box-shadow:0 6px 16px rgba(0,0,0,.3)">${esc(s.name)}</div>` : '';
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${cx - D / 2}px;top:${cy - D / 2}px;width:${D}px;height:${D}px;opacity:${f3(o)};transform:scale(${f3(lerp(.4, 1, e))});z-index:50">
          <div style="position:absolute;inset:0;border-radius:${r};overflow:hidden;border:${Math.round(D * .025)}px solid #fff;box-shadow:0 18px 40px rgba(0,0,0,.45);background:#222">
            <div style="position:absolute;left:${f1(lx)}px;top:${f1(ly)}px;width:${f1(iw)}px;height:${f1(ih)}px">${arollImg(t)}</div></div>${name}</div>`,
      };
    },

    // Dim everything except rect {x,y,w,h} (screen px): dim (.6), color (border), label (above), radius, screen.
    sc_highlight(s, t) {
      const C = pal(), r = s.rect || { x: 400, y: 200, w: 400, h: 200 }, o = fadeIO(t, s.t0, s.t1, .3, .3);
      const a = map(t, r.x, r.y, s.screen), b = map(t, r.x + r.w, r.y + r.h, s.screen), pad = s.pad ?? 8;
      const x0 = a.x - pad, y0 = a.y - pad, w = b.x - a.x + 2 * pad, h = b.y - a.y + 2 * pad, col = s.color || C.a;
      const lab = s.label ? `<div style="position:absolute;${y0 < 60 ? 'right:0;bottom:-46px' : 'left:0;top:-46px'};white-space:nowrap;padding:6px 14px;border-radius:10px;background:${col};color:${C.d};font:800 20px ${UI}">${esc(s.label)}</div>` : '';
      return {
        front: `<div class="full"${cidOf(s)} style="overflow:hidden;pointer-events:none;opacity:${f3(o)}"><div style="position:absolute;left:${f1(x0)}px;top:${f1(y0)}px;width:${f1(w)}px;height:${f1(h)}px;border-radius:${s.radius ?? 12}px;
          box-shadow:0 0 0 4000px rgba(5,8,18,${f3(s.dim ?? .6)}), 0 0 0 3px ${col}, 0 0 30px ${col}">${lab}</div></div>`,
      };
    },
  });

  // Caption: dark rounded plate, Inter 600, spoken word gets an accent underline bar; one or two lines at the bottom.
  CAPTION_STYLES[P] = (c, t) => {
    const [W] = dims(), V = vert(), C = pal();
    let cur = -1;
    c.words.forEach((w, i) => { if (t >= w.s - .02) cur = i; });
    const words = c.words.map((w, i) => {
      const on = i === cur, col = w.hl ? C.a : (c.color || '#fff');
      return `<span style="position:relative;color:${col};opacity:${i <= cur || TL.caption_reveal === false ? 1 : .5}">${esc(w.w)}${on ? `<span style="position:absolute;left:0;right:0;bottom:-.12em;height:.12em;border-radius:.06em;background:${C.a};transform:scaleX(${f3(E.outCubic(clamp((t - w.s) / .15)))});transform-origin:0 50%"></span>` : ''}</span>${w.br ? '<br>' : ' '}`;
    }).join('');
    const pos = c.x != null ? `left:${c.x - W / 2 + 60}px;right:${W / 2 - c.x + 60}px` : (V ? 'left:40px;right:40px' : 'left:150px;right:150px');
    const k = E.outCubic(prog(t, c.t0, .15));
    return `<div id="cap" class="screencast"${cidOf(c)} style="${pos};${c.y != null ? `top:${c.y}px` : V ? 'top:760px' : 'top:auto;bottom:26px'};font-family:${c.font || UI};font-weight:${c.weight || 600};font-size:${c.size || (V ? 32 : 26)}px;line-height:1.5;
      text-shadow:none;white-space:normal;opacity:${f3(k)}"><span style="background:rgba(14,16,24,.82);-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:.18em .6em;border-radius:12px">${words}</span></div>`;
  };

  // Spoken shortcut -> keycap labels ("control shift p", "command k", "phím tắt Ctrl C").
  const MOD = { ctrl: 'Ctrl', control: 'Ctrl', cmd: '⌘', command: '⌘', shift: 'Shift', alt: 'Alt', option: '⌥', enter: 'Enter', tab: 'Tab', esc: 'Esc', escape: 'Esc', windows: '⊞', win: '⊞', space: 'Space' };
  function spokenShortcuts(caps) {
    const ws = (caps || []).flatMap(c => c.words), out = [];
    const norm = w => String(w).toLowerCase().replace(/[.,!?:;"'()]/g, '');
    for (let i = 0; i < ws.length; i++) {
      const w = norm(ws[i].w);
      const isTat = w === 'tắt' && i > 0 && norm(ws[i - 1].w) === 'phím';
      if (!MOD[w] && !isTat) continue;
      const keys = [];
      let j = isTat ? i + 1 : i;
      while (j < ws.length && keys.length < 4) {
        const x = norm(ws[j].w).replace(/\+/g, '');
        if (MOD[x]) keys.push(MOD[x]);
        else if (/^[a-z0-9]$/i.test(x) || /^f\d{1,2}$/i.test(x)) keys.push(x.toUpperCase());
        else if (x === '+' || x === 'cộng' || x === 'và' || x === '') { /* joiner */ } else break;
        j++;
      }
      if (keys.length >= 2 || (keys.length === 1 && isTat)) { out.push({ t: ws[i].s, keys, end: ws[Math.max(i, j - 1)].e ?? ws[i].s + 1 }); i = j; }
    }
    return out;
  }

  PACKS.push({
    id: P, name: 'Quay màn hình hướng dẫn (screencast)', icon: '🖥️', caption: P,
    desc: 'Màn hình trong khung trình duyệt/laptop trên nền gradient, tự zoom-pan theo vùng thao tác, vòng click, con trỏ to mượt, phím tắt, chú thích số, face-cam tròn, làm tối vùng ngoài',
    items: [
      { type: 'sc_screen', label: 'Màn hình + zoom theo thao tác', make: T => ({ type: 'sc_screen', t0: T, t1: T + 6, frame: 'browser', url: 'app.example.com', bg: 'aurora', focus: [{ t: T + 1.2, x: 420, y: 200, s: 1.8 }, { t: T + 3.4, x: 760, y: 420, s: 1.5 }, { t: T + 5.2, x: 640, y: 400, s: 1 }] }) },
      { type: 'sc_click', label: 'Vòng click', make: T => ({ type: 'sc_click', t0: T, t1: T + 3, clicks: [{ t: T + .3, x: 420, y: 200 }, { t: T + 1.6, x: 760, y: 420 }] }) },
      { type: 'sc_cursor', label: 'Con trỏ to mượt', make: T => ({ type: 'sc_cursor', t0: T, t1: T + 3, keys: [{ t: T, x: 640, y: 400 }, { t: T + 1, x: 420, y: 200 }, { t: T + 2.2, x: 760, y: 420 }], clicks: [T + 1.05, T + 2.25] }) },
      { type: 'sc_keys', label: 'Phím tắt', make: T => ({ type: 'sc_keys', t0: T, t1: T + 2, keys: '⌘ + K', label: 'Mở bảng lệnh' }) },
      { type: 'sc_callout', label: 'Chú thích bước', make: T => ({ type: 'sc_callout', t0: T, t1: T + 2.5, num: 1, text: 'Bấm Tạo chiến dịch', at: { x: 360, y: 380 } }) },
      { type: 'sc_facecam', label: 'Face-cam góc', make: T => ({ type: 'sc_facecam', t0: T, t1: T + 5, shape: 'circle' }) },
      { type: 'sc_highlight', label: 'Làm nổi vùng', make: T => ({ type: 'sc_highlight', t0: T, t1: T + 2.5, rect: { x: 260, y: 130, w: 980, h: 300 }, label: 'Form tạo mới' }) },
    ],
    // ctx.opts: {screen (media), sw, sh, focus[], clicks[], cursor[], frame, url, bg, facecam (default: when the project has A-roll / captions)}
    recipe: ctx => {
      const dur = ctx.dur, o = ctx.opts || {}, caps = ctx.captions || [], scenes = [];
      const scr = { type: 'sc_screen', t0: 0, t1: dur, cid: 'scr', media: o.screen || o.media, sw: o.sw, sh: o.sh, frame: o.frame || 'browser', url: o.url, bg: o.bg || 'aurora', focus: o.focus || [] };
      scenes.push(scr);
      if (o.clicks && o.clicks.length) scenes.push({ type: 'sc_click', t0: 0, t1: dur, clicks: o.clicks, screen: 'scr' });
      if (o.cursor && o.cursor.length) scenes.push({ type: 'sc_cursor', t0: 0, t1: dur, keys: o.cursor, clicks: (o.clicks || []).map(c => c.t), screen: 'scr' });
      const hasAroll = o.facecam ?? ((typeof TL !== 'undefined' && TL && TL.aroll) || caps.length > 0);
      if (hasAroll) scenes.push({ type: 'sc_facecam', t0: 0, t1: dur, shape: 'circle' });
      for (const k of spokenShortcuts(caps)) scenes.push({ type: 'sc_keys', t0: Math.max(0, k.t - .1), t1: Math.min(dur, Math.max(k.end + .6, k.t + 1.8)), keys: k.keys });
      // numbered callouts on "bước 1/2/…" pointing at the camera focus of that moment
      let n = 0, after = 0;
      while (n < 4) {
        const at = findWord(caps, ['bước'], after);
        if (at == null || at > dur - 1.5) break;
        const fk = (o.focus || []).filter(f => f.t <= at + .5).pop();
        n++;
        scenes.push({ type: 'sc_callout', t0: at, t1: Math.min(dur, at + 2.4), num: n, text: `Bước ${n}`, at: fk ? { x: fk.x, y: fk.y } : { x: (o.sw || 1280) / 2, y: (o.sh || 800) / 2 }, screen: 'scr' });
        after = at + 2.4;
      }
      return { caption_style: P, music: o.music || 'lofi', scenes };
    },
  });
})();
