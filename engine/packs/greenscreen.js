// Pack "greenscreen" — green screen / news reaction: the speaker is cut out (rembg PNGs, TL.aroll.cutouts or '@cut')
// and composited at the bottom over a background: photo / frame sequence / b-roll preset / solid / gradient,
// a fake news article in a browser, a social post card, or a scrolling website screenshot.
// Modules gs_*: backdrop (background + cut-out speaker), article, tweet, pointer, zoomfocus, screen. Caption "greenscreen".
// Doc: references/pack-greenscreen.md.
(() => {
  const P = 'greenscreen';

  // ---------- palette (TL.brand overrides: primary, accent, dark, light, font, disp) ----------
  const C = (s = {}) => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return {
      accent: s.color || b.primary || '#FF3B30',
      hl: s.hl || b.accent || '#FFE14D',
      dark: b.dark || '#0E1116',
      light: b.light || '#FFFFFF',
      font: b.font || "'Be Vietnam Pro',sans-serif",
      disp: s.font || b.disp || "'Montserrat','Be Vietnam Pro',sans-serif",
      ui: "'Inter','Be Vietnam Pro',sans-serif",
      serif: "'Playfair Display','Be Vietnam Pro',Georgia,serif",
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
  const f2 = v => (+v).toFixed(2);
  const outOp = (s, t, din = .2) => fadeIO(t, s.t0, s.keep ? null : s.t1, din, .25);
  const isImg = v => typeof v === 'string' && /\.(png|jpe?g|webp|gif|svg)$/i.test(v);

  // ---------- shared state between gs_* scenes ----------
  const activeOf = (type, t) => (TL?.scenes || []).filter(s => !s.hidden && s.type === type && t >= s.t0 && t < s.t1);
  const backdropAt = t => activeOf('gs_backdrop', t).pop() || null;
  // Speaker box: x = centre, y = bottom edge (px, design space), size = height in % of the frame height.
  function personGeom(s) {
    const [W, H] = DIMS(), v = VERT();
    const size = s.size ?? (v ? 52 : 92), h = H * size / 100;
    // The speaker sits in the middle of the cut-out image whatever the footage aspect, so x = person centre.
    // w = approximate visual width of a head-and-shoulders person (for layout of captions/pointers only).
    const w = h * .58, x = s.x ?? (v ? W / 2 : W * .77), y = s.y ?? H;
    return { x, y, h, w, top: y - h, left: x - w / 2, size };
  }
  // Background zoom from the active gs_zoomfocus: keys [{t, x, y, s}] (x/y = focus point in % of the frame, s = scale).
  function zoomAt(t) {
    const z = activeOf('gs_zoomfocus', t).pop();
    if (!z || !z.keys?.length) return null;
    const [W, H] = DIMS();
    const sc = keyAt(z.keys, t, 's', 1);
    if (sc <= 1.001) return null;
    const px = keyAt(z.keys, t, 'x', 50) / 100 * W, py = keyAt(z.keys, t, 'y', 40) / 100 * H;
    const bd = backdropAt(t), cy = z.cy ?? (bd ? Math.min(H * .5, personGeom(bd).top * .55 + 60) : H / 2);
    const tx = clamp(W / 2 - sc * px, W - sc * W, 0), ty = clamp(cy - sc * py, H - sc * H, 0);
    return { s: sc, tx, ty, z };
  }
  const bgWrap = (t, html) => {
    const z = zoomAt(t);
    return z ? `<div class="full" style="transform-origin:0 0;transform:translate(${z.tx.toFixed(1)}px,${z.ty.toFixed(1)}px) scale(${z.s.toFixed(4)})">${html}</div>` : html;
  };
  // Where a card goes: 'back' (behind the speaker, zoomable) when a gs_backdrop is active, else in front of the video.
  const placeLayer = (s, t, html) => {
    const lay = s.layer || 'auto';
    if (lay === 'back' || (lay === 'auto' && backdropAt(t))) return { back: bgWrap(t, html) };
    return { front: html };
  };
  const defCard = (o = {}) => {
    const [W, H] = DIMS(), v = VERT();
    return v ? { x: 28, y: 118, w: W - 56, h: o.h ?? 470, r: 22 } : { x: 40, y: 40, w: o.wh ?? 760, h: H - 150, r: 20 };
  };

  // ---------- background: image | {src} | {seq,fps,count} | {broll:{template|id,pal,text}} | {color} | {gradient:[a,b,c],angle} ----------
  function bgHTML(bg, s, t, lt) {
    const [W, H] = DIMS();
    const d = Math.max(.5, s.t1 - s.t0), kb = s.kb ?? .08, k = E.inOutSine(prog(lt, 0, d));
    const sc = 1 + kb * ((s.kb_dir ?? 1) > 0 ? k : 1 - k);
    const ox = s.ox ?? 50, oy = s.oy ?? 40, dx = (s.pan_x ?? 0) * k;
    const flt = `${s.bg_blur ? `blur(${s.bg_blur}px) ` : ''}${s.bg_filter || ''}`;
    if (typeof bg === 'string') bg = isImg(bg) ? { src: bg } : /^(#|rgb|hsl)/.test(bg) ? { color: bg } : { src: bg };
    bg = bg || {};
    let html = '';
    if (bg.src || bg.seq) {
      html = `<img src="${media(bg, t)}" style="position:absolute;inset:${s.bg_blur ? -30 : 0}px;width:calc(100% + ${s.bg_blur ? 60 : 0}px);height:calc(100% + ${s.bg_blur ? 60 : 0}px);object-fit:cover;
        transform:translateX(${dx.toFixed(1)}px) scale(${sc.toFixed(4)});transform-origin:${ox}% ${oy}%;filter:${flt || 'none'}">`;
    } else if (bg.broll) {
      const b = { ...bg.broll };
      if (!b.template && b.id) { const p = String(b.id).split('--'); b.template = p[1]; b.pal = b.pal || p[2]; }
      const r = MODULES.broll({ ...b, t0: s.t0, t1: s.t1, layout: 'full', keep: true }, t, lt) || {};
      const kk = Math.max(W / 1280, H / 720) * sc;
      html = `<div class="full" style="background:#0b0b0d"></div><div style="position:absolute;left:${((W - 1280 * kk) / 2).toFixed(1)}px;top:${((H - 720 * kk) / 2).toFixed(1)}px;width:1280px;height:720px;
        transform:scale(${kk.toFixed(4)});transform-origin:0 0;filter:${flt || 'none'}">${r.front || r.back || ''}</div>`;
    } else if (bg.color) {
      html = `<div class="full" style="background:${bg.color}"></div>`;
    } else {
      // Gradient studio (default): soft moving light blobs + faint grid.
      const g = bg.gradient || ['#0B1E3A', '#123E6B', '#0A1426'];
      const a = bg.angle ?? 160, ph = lt * .35;
      const bx = 30 + Math.sin(ph) * 14, by = 26 + Math.cos(ph * .8) * 8, cx2 = 74 + Math.cos(ph * .7) * 10;
      html = `<div class="full" style="background:linear-gradient(${a}deg,${g.join(',')})"></div>
        <div class="full" style="background:radial-gradient(circle at ${bx.toFixed(1)}% ${by.toFixed(1)}%,${hexA(bg.glow || '#3FA7FF', .38)},transparent 46%),radial-gradient(circle at ${cx2.toFixed(1)}% 64%,${hexA(bg.glow2 || '#FF3B6B', .22)},transparent 44%)"></div>
        <div class="full" style="background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
          background-size:60px 60px;background-position:0 ${(lt * 6 % 60).toFixed(1)}px;-webkit-mask-image:radial-gradient(ellipse 80% 70% at 50% 40%,#000,transparent);mask-image:radial-gradient(ellipse 80% 70% at 50% 40%,#000,transparent)"></div>`;
    }
    const dim = s.dim ?? 0;
    return html + (dim ? `<div class="full" style="background:rgba(0,0,0,${dim})"></div>` : '');
  }

  // ---------- speaker cut-out (PNG per frame) with drop shadow; soft ellipse mask on the plain frame if no cutouts ----------
  function personHTML(s, t, lt) {
    if (!TL?.aroll?.frames || s.person === false) return '';
    const g = personGeom(s), n = frameAt(t);
    const frame = url(fmtSeq(TL.aroll.frames, n));
    const cutPat = s.cutouts || TL.aroll.cutouts;
    const pm = TL.person || { x: 50, y: 58, rx: 40, ry: 58 };
    const m = `radial-gradient(ellipse ${pm.rx}% ${pm.ry}% at ${pm.x}% ${pm.y}%, #000 60%, transparent 100%)`;
    const soft = `-webkit-mask-image:${m};mask-image:${m};`;
    const ol = s.outline ? Array.from({ length: 4 }, (_, i) => `drop-shadow(${[1, -1, 0, 0][i] * s.outline}px ${[0, 0, 1, -1][i] * s.outline}px 0 ${s.outline_color || '#fff'})`).join(' ') : '';
    const sh = s.shadow === false ? '' : `drop-shadow(0 18px 26px rgba(0,0,0,.55)) drop-shadow(0 0 2px rgba(255,255,255,${s.rim ?? .35}))`;
    const flt = `${arollFilter(t)} ${ol} ${sh}`;
    const ki = s.enter === false ? 1 : E.outCubic(prog(lt, 0, .5));
    const flip = s.flip ? ' scaleX(-1)' : '';
    const img = cutPat
      ? `<img src="${url(fmtSeq(cutPat, n))}" style="display:block;height:100%;width:auto;filter:${flt}${flip ? `;transform:${flip}` : ''}"
          onerror="this.onerror=null;this.src='${frame}';this.style.cssText+=';${soft}filter:${arollFilter(t)}'">`
      : `<img src="${frame}" style="display:block;height:100%;width:auto;${soft}filter:${arollFilter(t)}${flip ? `;transform:${flip}` : ''}">`;
    return `<div class="abs"${cidOf(s)} style="left:${g.x.toFixed(1)}px;top:${g.top.toFixed(1)}px;height:${g.h.toFixed(1)}px;transform:translateX(-50%) translateY(${((1 - ki) * 80).toFixed(1)}px);
      opacity:${clamp(ki * 1.6).toFixed(3)}">${img}</div>`;
  }

  // ---------- browser chrome (generic, not a copy of any product) ----------
  const LOCK = c => `<svg viewBox="0 0 24 24" width="14" height="14"><rect x="5" y="10" width="14" height="10" rx="2" fill="${c}"/><path d="M8 10V7.5a4 4 0 018 0V10" fill="none" stroke="${c}" stroke-width="2.2"/></svg>`;
  function chrome(urlText, dark) {
    const bar = dark ? '#1E2126' : '#ECEEF2', pill = dark ? '#2C3036' : '#FFFFFF', tx = dark ? '#C9CDD4' : '#4A4F57';
    const dots = ['#FF5F57', '#FEBC2E', '#28C840'].map(c => `<span style="width:11px;height:11px;border-radius:50%;background:${c}"></span>`).join('');
    return `<div style="height:44px;flex:none;display:flex;align-items:center;gap:12px;padding:0 14px;background:${bar};border-bottom:1px solid ${dark ? '#000' : '#D9DCE1'}">
      <div style="display:flex;gap:6px">${dots}</div>
      <svg viewBox="0 0 24 24" width="16" height="16" style="opacity:.55"><path d="M15 5l-7 7 7 7" fill="none" stroke="${tx}" stroke-width="2.6" stroke-linecap="round"/></svg>
      <div style="flex:1;min-width:0;height:28px;border-radius:14px;background:${pill};display:flex;align-items:center;gap:8px;padding:0 12px;font:500 14px/1 'Inter',sans-serif;color:${tx};
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:inset 0 0 0 1px ${dark ? '#3a3f46' : '#DADDE2'}">${LOCK(tx)}<span style="overflow:hidden;text-overflow:ellipsis">${esc(urlText)}</span></div>
      <svg viewBox="0 0 24 24" width="16" height="16" style="opacity:.55"><circle cx="5" cy="12" r="2" fill="${tx}"/><circle cx="12" cy="12" r="2" fill="${tx}"/><circle cx="19" cy="12" r="2" fill="${tx}"/></svg></div>`;
  }
  // Square logo tile: image path / si:slug / emoji, else initials on the accent colour.
  function logoTile(logo, name, size, bg) {
    if (logo) return `<div style="flex:none;width:${size}px;height:${size}px;border-radius:${size * .22}px;background:${bg};display:flex;align-items:center;justify-content:center;overflow:hidden">${slIcon(logo, Math.round(size * .66), 'white')}</div>`;
    const ini = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return `<div style="flex:none;width:${size}px;height:${size}px;border-radius:${size * .22}px;background:${bg};display:flex;align-items:center;justify-content:center;
      font:900 ${Math.round(size * (ini.length > 1 ? .4 : .5))}px/1 'Montserrat',sans-serif;color:#fff">${esc(ini)}</div>`;
  }
  // Card frame with entrance (rise + 3D tilt) used by article / tweet / screen.
  function cardFrame(s, t, lt, card, inner, o) {
    const ki = E.outBack(prog(lt, 0, .55), 1.2), kf = clamp(prog(lt, 0, .3));
    const op = o * kf;
    return `<div class="abs"${cidOf(s)} style="left:${card.x}px;top:${card.y}px;width:${card.w}px;height:${card.h}px;border-radius:${card.r}px;overflow:hidden;
      display:flex;flex-direction:column;opacity:${op.toFixed(3)};transform-origin:50% 100%;
      transform:perspective(1400px) translateY(${((1 - ki) * 70).toFixed(1)}px) rotateX(${((1 - ki) * 10).toFixed(2)}deg) scale(${lerp(.92, 1, clamp(ki, 0, 1.05)).toFixed(4)});
      box-shadow:0 30px 70px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08)">${inner}</div>`;
  }
  // Content inside a viewport that scrolls: v in px (number) or keys [{t, v}].
  const scrollPx = (sc, t, dflt = 0) => (sc == null ? dflt : typeof sc === 'number' ? sc : keyAt(sc, t, 'v', 0));

  const MOD = {
    // 1. Background + speaker cut-out.
    // { bg: "media/x.jpg" | {src}|{seq,fps,count}|{broll:{template|id,pal,text}}|{color}|{gradient:[..],angle}, kb, kb_dir, ox, oy, pan_x, bg_blur, dim,
    //   x, y (speaker centre-x / bottom-y), size (% of frame height), shadow, rim, outline, flip, cutouts (override pattern), person:false }
    gs_backdrop(s, t, lt) {
      const o = fadeIO(t, s.t0, s.keep ? null : s.t1, s.fade ?? .01, .25);
      const ground = s.ground === false ? '' : `<div class="full" style="background:linear-gradient(180deg,transparent 48%,rgba(0,0,0,.18) 70%,rgba(0,0,0,.5))"></div>`;
      const back = `<div class="full" style="overflow:hidden;opacity:${o.toFixed(3)}">${bgWrap(t, bgHTML(s.bg, s, t, lt))}${ground}</div>`;
      // Speaker goes in `front` so cards from later gs_* scenes (in `back`) stay behind it; pointers come after it.
      return { back, cover: o >= .999, front: `<div class="full" style="opacity:${o.toFixed(3)};pointer-events:none">${personHTML(s, t, lt)}</div>` + lines(s, t) };
    },

    // 2. News article in a browser: { source, logo, url, category, headline, date, author, image, lead, before, highlight, after,
    //    hl_t (abs s), hl_dur, hl_color, theme:'light'|'dark', card:{x,y,w,h,r}, full:false, scroll: px | [{t,v}], layer:'auto'|'back'|'front' }
    gs_article(s, t, lt) {
      const c = C(s), o = outOp(s, t), dark = s.theme === 'dark';
      const [W, H] = DIMS();
      const card = s.full ? { x: 0, y: 0, w: W, h: H, r: 0 } : { ...defCard({ h: s.image || s.lead ? 470 : 400 }), ...(s.card || {}) };
      const ink = dark ? '#F2F3F5' : '#111418', sub = dark ? '#A3A9B3' : '#5E6470', paper = dark ? '#16191E' : '#FFFFFF';
      const padX = Math.round(card.w * .04 + 4), tw = card.w - padX * 2;
      const hl = s.headline || 'Tiêu đề bài báo của bạn';
      const hs = s.headline_size || Math.round(clamp(tw / 16.5, 26, 44) * (hl.length > 80 ? .78 : hl.length > 52 ? .88 : 1));
      const imgH = s.image ? Math.round(s.image_h || card.w * .4) : 0;
      const hlT = s.hl_t ?? s.t0 + 1.4, hk = E.inOutSine(prog(t, hlT, s.hl_dur ?? .9));
      const mark = s.hl_color || (dark ? '#E8B500' : c.hl);
      const span = s.highlight ? `<span style="background-image:linear-gradient(100deg,${hexA(mark, 0)} 0,${mark} .6em,${mark} calc(100% - .5em),${hexA(mark, 0)} 100%);background-repeat:no-repeat;
        background-size:${(hk * 100).toFixed(2)}% 82%;background-position:0 62%;padding:0 .12em;margin:0 -.12em;font-weight:${hk > .02 ? 700 : 'inherit'};color:${dark && hk > .3 ? '#111' : ink}">${esc(s.highlight)}</span>` : '';
      const ikb = 1 + .06 * prog(lt, 0, Math.max(1, s.t1 - s.t0));
      const page = `<div style="padding:${Math.round(card.w * .028)}px ${padX}px 30px;font-family:${c.font};color:${ink}">
        <div style="display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:2px solid ${ink}">
          ${logoTile(s.logo, s.source || 'News', 34, c.accent)}
          <div style="font-family:${c.serif};font-weight:900;font-size:26px;line-height:1.2;letter-spacing:-.01em;white-space:nowrap">${esc(s.source || 'Tin Tức 24h')}</div>
          <div style="flex:1"></div>
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 7h16M4 12h16M4 17h16" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/></svg></div>
        ${s.category ? `<div style="margin-top:12px;font:800 14px/1.4 ${c.ui};letter-spacing:.14em;text-transform:uppercase;color:${c.accent}">${esc(s.category)}</div>` : ''}
        <div style="margin-top:${s.category ? 4 : 14}px;font-family:${c.disp};font-weight:900;font-size:${hs}px;line-height:1.24;letter-spacing:-.012em">${esc(hl)}</div>
        <div style="margin-top:8px;font:500 15px/1.4 ${c.ui};color:${sub}">${esc([s.date, s.author].filter(Boolean).join(' · '))}</div>
        ${s.image ? `<div style="margin-top:14px;height:${imgH}px;border-radius:10px;overflow:hidden;position:relative"><img src="${url(s.image)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(${ikb.toFixed(4)})"></div>` : ''}
        ${s.lead ? `<div style="margin-top:14px;font-weight:700;font-size:${s.body_size || 20}px;line-height:1.5">${esc(s.lead)}</div>` : ''}
        <div style="margin-top:10px;font-weight:500;font-size:${s.body_size || 20}px;line-height:1.6;color:${dark ? '#D5D8DD' : '#2A2F36'}">${esc(s.before || '')} ${span} ${esc(s.after || '')}</div></div>`;
      // Default scroll: when the highlight starts, glide down past the hero image so the marked sentence is in view.
      const auto = s.image && !s.full ? [{ t: hlT - .75, v: 0 }, { t: hlT - .05, v: imgH + 12, dur: .7 }] : 0;
      const sy = scrollPx(s.scroll ?? auto, t);
      const inner = (s.full ? '' : chrome(s.url || 'tintuc24h.vn/cong-nghe/bai-viet', dark)) +
        `<div style="position:relative;flex:1;overflow:hidden;background:${paper}"><div style="transform:translateY(${(-sy).toFixed(1)}px)">${page}</div>
          <div style="position:absolute;left:0;right:0;bottom:0;height:46px;background:linear-gradient(transparent,${paper})"></div></div>`;
      const r = placeLayer(s, t, cardFrame(s, t, lt, card, inner, o));
      if (s.lines) r.front = (r.front || '') + lines(s, t);
      return r;
    },

    // 3. Social post card (generic): { name, handle, avatar, verified, time, text, image, platform:'si:x'|emoji, stats:{replies,reposts,likes,views},
    //    like_t (abs), theme:'light'|'dark', x, y (centre), size (%), w }
    gs_tweet(s, t, lt) {
      const c = C(s), o = outOp(s, t), dark = s.theme === 'dark';
      const [W, H] = DIMS(), v = VERT();
      const bg = dark ? '#0F1216' : '#FFFFFF', ink = dark ? '#EEF0F3' : '#0F1419', sub = dark ? '#8B95A1' : '#5B6670', line = dark ? '#2A3038' : '#E6E9EC';
      const w = s.w || (v ? 620 : 600), k = (s.size ?? 100) / 100;
      const x = s.x ?? (v ? W / 2 : 420), y = s.y ?? (v ? 330 : 300);
      const ki = E.outBack(prog(lt, 0, .5), 1.5), kf = clamp(prog(lt, 0, .25));
      const likeT = s.like_t ?? s.t0 + 1.2, kl = E.outBack(prog(t, likeT, .35), 3), liked = t >= likeT;
      const av = s.avatar
        ? (isImg(s.avatar) ? `<img src="${url(s.avatar)}" style="width:100%;height:100%;object-fit:cover">` : slIcon(s.avatar, 40))
        : `<span style="font:900 24px/1 'Montserrat',sans-serif;color:#fff">${esc(String(s.name || 'A').trim()[0] || 'A')}</span>`;
      const tick = s.verified === false ? '' : `<svg viewBox="0 0 24 24" width="20" height="20" style="flex:none"><path d="M12 2l2.4 2.1 3.1-.4.9 3 2.8 1.5-.9 3 .9 3-2.8 1.5-.9 3-3.1-.4L12 22l-2.4-2.1-3.1.4-.9-3L2.8 15.8l.9-3-.9-3L5.6 8.3l.9-3 3.1.4z" fill="#1D9BF0"/><path d="M8 12.3l2.6 2.6L16.2 9.3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const fmt = n => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + 'Tr' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.', ',') + 'K' : String(Math.round(n)));
      const st = s.stats || {};
      const cnt = (val, k0) => (typeof val === 'number' ? fmt(lerp(val * .82, val, E.outCubic(prog(lt, k0, 1.4)))) : esc(val ?? ''));
      const ic = {
        replies: `<path d="M4 5h16v11H9l-5 4z" fill="none" stroke="${sub}" stroke-width="1.9" stroke-linejoin="round"/>`,
        reposts: `<path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5M17 7v5M7 17v-5" fill="none" stroke="${sub}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`,
        likes: `<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" fill="${liked ? '#F91880' : 'none'}" stroke="${liked ? '#F91880' : sub}" stroke-width="1.9" stroke-linejoin="round"/>`,
        views: `<path d="M5 20V12M10 20V6M15 20v-9M20 20V9" stroke="${sub}" stroke-width="2" stroke-linecap="round"/>`,
      };
      const stat = (key, i) => (st[key] == null ? '' : `<div style="display:flex;align-items:center;gap:7px;font:600 17px/1 ${c.ui};color:${key === 'likes' && liked ? '#F91880' : sub}">
        <svg viewBox="0 0 24 24" width="22" height="22" style="${key === 'likes' ? `transform:scale(${(liked ? clamp(kl, 0, 1.5) : 1).toFixed(3)})` : ''}">${ic[key]}</svg>${cnt(key === 'likes' && typeof st.likes === 'number' ? st.likes : st[key], .3 + i * .1)}</div>`);
      const words = String(s.text || 'Nội dung bài đăng…').split(/(\s+)/);
      const nW = words.filter(x => x.trim()).length;
      let wi = 0;
      const body = words.map(x => {
        if (!x.trim()) return x;
        const kk = clamp(prog(lt, .25 + (wi++ / Math.max(1, nW)) * Math.min(1.1, nW * .05), .18));
        return `<span style="opacity:${(.15 + .85 * kk).toFixed(2)}">${esc(x)}</span>`;
      }).join('');
      const plat = s.platform ? `<div style="margin-left:auto;flex:none">${slIcon(s.platform, 28, dark ? 'white' : 'black')}</div>` : '';
      const ts = s.text_size || ((s.text || '').length > 140 ? 23 : 26);
      const html = `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:${w}px;transform:translate(-50%,-50%) scale(${(k * lerp(.85, 1, clamp(ki, 0, 1.1))).toFixed(4)}) translateY(${((1 - ki) * 50).toFixed(1)}px);
        opacity:${(o * kf).toFixed(3)};background:${bg};border-radius:22px;padding:22px 24px 16px;box-shadow:0 28px 60px rgba(0,0,0,.5),0 0 0 1px ${line};font-family:${c.font};color:${ink}">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="flex:none;width:54px;height:54px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,${c.accent},#7A5CFF);display:flex;align-items:center;justify-content:center">${av}</div>
          <div style="min-width:0">
            <div style="display:flex;align-items:center;gap:6px;font-weight:800;font-size:21px;line-height:1.3;white-space:nowrap">${esc(s.name || 'Tên tài khoản')}${tick}</div>
            <div style="font:500 16px/1.3 ${c.ui};color:${sub};white-space:nowrap">${esc(s.handle || '@taikhoan')}${s.time ? ` · ${esc(s.time)}` : ''}</div></div>${plat}</div>
        <div style="margin-top:14px;font-size:${ts}px;line-height:1.45;font-weight:500;white-space:pre-wrap">${body}</div>
        ${s.image ? `<div style="margin-top:14px;height:${s.image_h || 230}px;border-radius:14px;overflow:hidden;border:1px solid ${line}"><img src="${url(s.image)}" style="width:100%;height:100%;object-fit:cover"></div>` : ''}
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid ${line};display:flex;justify-content:space-between">${['replies', 'reposts', 'likes', 'views'].map(stat).join('')}</div></div>`;
      return placeLayer(s, t, html);
    },

    // 4. Pointer: hand-drawn circle / arrow / box / underline / hand emoji at a region.
    // { kind:'circle'|'arrow'|'box'|'underline'|'hand', x, y (target centre), w, h (region), from:{x,y} (arrow start), label, color, width, size (%) }
    gs_pointer(s, t, lt) {
      const c = C(s), o = outOp(s, t, .08);
      const [W, H] = DIMS(), v = VERT();
      const kind = s.kind || 'arrow', col = s.color || c.accent, k = (s.size ?? 100) / 100;
      const x = s.x ?? W / 2, y = s.y ?? (v ? 300 : 260), w = (s.w ?? (v ? 520 : 460)) * k, h = (s.h ?? (v ? 110 : 100)) * k;
      const sw = s.width || 7, kd = E.outCubic(prog(lt, .05, .5)), pulse = 1 + .03 * Math.sin(lt * 6) * clamp(prog(lt, .6, .2));
      const bd = backdropAt(t), pg = bd ? personGeom(bd) : null;
      const fr = s.from || (pg ? { x: pg.x + (x < pg.x ? -40 : 40), y: pg.top + pg.h * .14 } : { x: x + (x < W / 2 ? 170 : -170), y: y + (v ? 260 : 200) });
      let path = '', head = '';
      const seed = Math.round(s.t0 * 10);
      if (kind === 'circle') {
        const pts = [];
        for (let i = 0; i <= 44; i++) {
          const a = -Math.PI * .62 + (i / 44) * Math.PI * 2.16, j = 1 + (rnd(seed + i) - .5) * .05 + i / 44 * .06;
          pts.push(`${(x + Math.cos(a) * (w / 2 + 14) * j).toFixed(1)},${(y + Math.sin(a) * (h / 2 + 14) * j).toFixed(1)}`);
        }
        path = 'M' + pts.join(' L');
      } else if (kind === 'box') {
        const l = x - w / 2 - 10, r = x + w / 2 + 10, tp = y - h / 2 - 10, b = y + h / 2 + 10;
        path = `M${l + 14},${tp} L${r - 14},${tp} Q${r},${tp} ${r},${tp + 14} L${r},${b - 14} Q${r},${b} ${r - 14},${b} L${l + 14},${b} Q${l},${b} ${l},${b - 14} L${l},${tp + 14} Q${l},${tp} ${l + 16},${tp - 1}`;
      } else if (kind === 'underline') {
        const l = x - w / 2, b = y + h / 2 + 8, n = 10;
        path = `M${l},${b}` + Array.from({ length: n }, (_, i) => ` Q${(l + (i + .5) * w / n).toFixed(1)},${(b + (i % 2 ? 7 : -7)).toFixed(1)} ${(l + (i + 1) * w / n).toFixed(1)},${b}`).join('');
      } else if (kind === 'arrow') {
        // From the speaker (or `from`) to the nearest edge of the region, curved.
        const tx = clamp(fr.x, x - w / 2 + 20, x + w / 2 - 20), ty = fr.y > y ? y + h / 2 + 12 : y - h / 2 - 12;
        const mx = (fr.x + tx) / 2 + (fr.y - ty) * .25 * (fr.x < tx ? -1 : 1), my = (fr.y + ty) / 2;
        path = `M${fr.x.toFixed(1)},${fr.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`;
        const ang = Math.atan2(ty - my, tx - mx), L = 30 * k, kh = clamp(prog(lt, .45, .15));
        const p1 = [tx - L * Math.cos(ang - .5), ty - L * Math.sin(ang - .5)], p2 = [tx - L * Math.cos(ang + .5), ty - L * Math.sin(ang + .5)];
        head = `<path d="M${p1[0].toFixed(1)},${p1[1].toFixed(1)} L${tx.toFixed(1)},${ty.toFixed(1)} L${p2[0].toFixed(1)},${p2[1].toFixed(1)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${kh.toFixed(2)}"/>`;
      }
      const draw = d => `<path d="${path}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="${sw + 5}" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - d).toFixed(3)}" transform="translate(2,4)"/>
        <path d="${path}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - d).toFixed(3)}"/>`;
      let svg = path ? `<svg class="full" viewBox="0 0 ${W} ${H}" style="overflow:visible;transform-origin:${x}px ${y}px;transform:scale(${pulse.toFixed(4)})">${draw(kd)}${head}</svg>` : '';
      if (kind === 'hand') {
        const kp = E.outBack(prog(lt, 0, .35), 2), sz = 120 * k, ang = Math.atan2(y - fr.y, x - fr.x), poke = Math.sin(lt * 7) * 10;
        const hx = x - Math.cos(ang) * (w / 2 + sz * .5 + poke), hy = y - Math.sin(ang) * (h / 2 + sz * .5 + poke);
        svg = `<div class="abs" style="left:${(hx - sz / 2).toFixed(1)}px;top:${(hy - sz / 2).toFixed(1)}px;width:${sz}px;height:${sz}px;transform:rotate(${(ang * 180 / Math.PI).toFixed(1)}deg) scale(${clamp(kp, 0, 1.3).toFixed(3)})">${emoji('👉', 0, 0, sz, 'position:absolute')}</div>`;
      }
      let label = '';
      if (s.label) {
        const kb = E.outBack(prog(lt, .35, .3), 2.2);
        const ly = s.label_y ?? (kind === 'arrow' ? fr.y + (fr.y > y ? 26 : -60) : (y - h / 2 - 66 > 110 ? y - h / 2 - 66 : y + h / 2 + 26));
        const lx = s.label_x ?? (kind === 'arrow' ? (pg ? clamp(fr.x + (fr.x < W / 2 ? -150 : 150), 160, W - 160) : fr.x) : x);
        label = `<div class="abs" style="left:${clamp(lx, 160, W - 160).toFixed(1)}px;top:${ly.toFixed(1)}px;transform:translateX(-50%) rotate(-3deg) scale(${clamp(kb, 0, 1.3).toFixed(3)});opacity:${clamp(kb * 2).toFixed(2)};
          background:${col};color:#fff;font:900 ${Math.round(26 * k)}px/1.3 ${c.disp};padding:4px 16px;border-radius:10px;white-space:nowrap;box-shadow:0 6px 0 rgba(0,0,0,.35)">${esc(s.label)}</div>`;
      }
      return { front: `<div class="full"${cidOf(s)} style="opacity:${o.toFixed(3)};pointer-events:none">${svg}${label}</div>` };
    },

    // 5. Zoom the background (backdrop + gs cards behind the speaker) to a region at keyed times.
    // { keys:[{t, x, y, s}] (abs time; x/y = focus point in % of frame; s = scale), cy (px, where the focus lands), brackets:true }
    gs_zoomfocus(s, t) {
      const z = zoomAt(t);
      if (!z || s.brackets === false || z.z !== s) return {};
      const [W] = DIMS(), smax = Math.max(...s.keys.map(k => k.s || 1)), kk = clamp((z.s - 1) / Math.max(.01, smax - 1));
      const bd = backdropAt(t), cy = s.cy ?? (bd ? Math.min(DIMS()[1] * .5, personGeom(bd).top * .55 + 60) : DIMS()[1] / 2);
      const bw = W * .78, bh = W * .3, L = 34, col = 'rgba(255,255,255,.9)';
      const l = W / 2 - bw / 2, tp = cy - bh / 2, r = l + bw, b = tp + bh;
      const cor = `M${l},${tp + L} L${l},${tp} L${l + L},${tp} M${r - L},${tp} L${r},${tp} L${r},${tp + L} M${r},${b - L} L${r},${b} L${r - L},${b} M${l + L},${b} L${l},${b} L${l},${b - L}`;
      return { front: `<svg class="full"${cidOf(s)} viewBox="0 0 ${W} ${DIMS()[1]}" style="opacity:${(kk * .9).toFixed(3)}"><path d="${cor}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round"/></svg>` };
    },

    // 6. Website / screenshot scrolled vertically: { image (tall screenshot), url, scroll:[{t,v}] (v = 0…1 of the page) | from/to (0…1, glides over the scene),
    //    device:'browser'|'phone', card:{x,y,w,h,r}, theme, layer }
    gs_screen(s, t, lt) {
      const c = C(s), o = outOp(s, t), dark = s.theme === 'dark';
      const [W, H] = DIMS(), v = VERT(), phone = s.device === 'phone';
      const card = { ...(phone ? (v ? { x: 170, y: 120, w: 380, h: 560, r: 44 } : { x: 120, y: 40, w: 340, h: 560, r: 44 }) : defCard()), ...(s.card || {}) };
      const d = s.t1 - s.t0;
      const sv = Array.isArray(s.scroll) ? keyAt(s.scroll, t, 'v', 0) : lerp(s.from ?? 0, s.to ?? 1, E.inOutSine(prog(lt, Math.min(.8, d * .2), Math.max(.5, d - Math.min(.8, d * .2) - .5))));
      const q = clamp(sv);
      let page;
      if (s.image) {
        page = `<img src="${url(s.image)}" style="position:absolute;left:0;width:100%;height:auto;top:${(q * 100).toFixed(3)}%;transform:translateY(${(-q * 100).toFixed(3)}%)">`;
      } else {
        // Placeholder page: nav, hero, text blocks, cards (tall, so it scrolls the same way).
        const ph = card.h * 2.6, blk = (h, w = 100, col = dark ? '#2B3038' : '#E7EAEE', mt = 12) => `<div style="height:${h}px;width:${w}%;border-radius:8px;background:${col};margin-top:${mt}px"></div>`;
        const ac = hexA(c.accent, .85);
        page = `<div style="position:absolute;left:0;right:0;height:${ph}px;top:${(q * 100).toFixed(3)}%;transform:translateY(${(-q * 100).toFixed(3)}%);padding:18px 22px">
          <div style="display:flex;align-items:center;gap:10px">${logoTile('', s.site || 'Web', 30, c.accent)}${blk(14, 30, undefined, 0)}</div>
          ${blk(card.h * .38, 100, `linear-gradient(135deg,${ac},#6D5CFF)`, 18)}${blk(26, 85, dark ? '#3A404A' : '#CDD2D8', 18)}${blk(14)}${blk(14, 92)}${blk(14, 70)}
          <div style="display:flex;gap:12px">${blk(card.h * .26, 50)}${blk(card.h * .26, 50)}</div>${blk(14)}${blk(14, 88)}${blk(14, 94)}${blk(14, 60)}
          ${blk(card.h * .32, 100, `linear-gradient(135deg,#FFB547,${ac})`, 18)}${blk(14)}${blk(14, 80)}${blk(14, 90)}${blk(14, 72)}${blk(card.h * .2)}${blk(14, 85)}${blk(14)}</div>`;
      }
      const vp = `<div style="position:relative;flex:1;overflow:hidden;background:${dark ? '#16191E' : '#fff'}">${page}
        <div style="position:absolute;right:5px;top:${(6 + q * 72).toFixed(1)}%;width:5px;height:22%;border-radius:3px;background:rgba(0,0,0,${dark ? .5 : .28})"></div></div>`;
      const inner = phone
        ? `<div style="position:absolute;inset:0;border-radius:${card.r}px;border:12px solid #111;pointer-events:none;z-index:2"></div>
           <div style="height:40px;flex:none;background:${dark ? '#16191E' : '#fff'};display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px">
           <div style="width:110px;height:22px;border-radius:12px;background:#111"></div></div>${vp}`
        : chrome(s.url || 'trangweb.vn', dark) + vp;
      return placeLayer(s, t, cardFrame(s, t, lt, card, inner, o));
    },
  };
  Object.assign(MODULES, MOD);

  // ---------- caption "greenscreen": heavy white outline text placed just above the speaker's head ----------
  CAPTION_STYLES.greenscreen = (cap, t) => {
    const c = C(), [W, H] = DIMS(), v = VERT();
    const bd = backdropAt(t), g = bd ? personGeom(bd) : null;
    const size = cap.size || (v ? 40 : 34);
    let top = v ? 860 : 590, left = 40, right = 40;
    if (g) {
      if (v) top = clamp(g.top + g.h * .14 - size * 2.75, 470, 880);
      else { right = clamp(W - g.left + 10, 40, W * .5); top = 600; }
    }
    if (cap.y != null) top = cap.y;
    if (cap.x != null) { const dx = cap.x - W / 2; left = 40 + dx; right = 40 - dx; }
    let cur = -1;
    cap.words.forEach((w, i) => { if (t >= w.s - .03) cur = i; });
    const kin = E.outBack(prog(t, cap.t0, .18), 2.2);
    const outline = strokeShadow(Math.max(2.2, size * .09), '#000') + `,0 ${Math.round(size * .14)}px 0 rgba(0,0,0,.85)`;
    const html = cap.words.map((w, i) => {
      const on = i === cur && t < (w.e ?? w.s + .4) + .12;
      const kp = E.outBack(prog(t, w.s - .03, .16), 3), sc = on ? lerp(1, 1.08, clamp(kp, 0, 1.2)) : 1;
      if (w.hl) return `<span style="display:inline-block;margin:.04em .1em;padding:0 .18em;border-radius:.16em;background:${c.accent};color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.4);
        box-shadow:0 .1em 0 #000;transform:rotate(-2deg) scale(${(on ? sc : 1).toFixed(3)})">${esc(w.w)}</span>`;
      return `<span style="display:inline-block;margin:0 .07em;${on ? `color:${c.hl};` : ''}transform:scale(${sc.toFixed(3)})">${esc(w.w)}</span>`;
    }).join(' ');
    return `<div id="cap"${cidOf(cap)} style="position:absolute;top:${top.toFixed(0)}px;left:${left}px;right:${right}px;text-align:center;white-space:normal;
      font-family:${cap.font || "'Be Vietnam Pro',sans-serif"};font-weight:${cap.weight || 900};font-size:${size}px;line-height:1.28;color:${cap.color || '#fff'};
      text-shadow:${outline};transform:scale(${lerp(.82, 1, clamp(kin, 0, 1.1)).toFixed(3)});transform-origin:50% 100%">${html}</div>`;
  };

  // ---------- Studio metadata ----------
  const V = () => VERT();
  const capText = (caps, from, n = 2) => {
    const i = Math.max(0, (caps || []).findIndex(c => c.t1 > from));
    return (caps || []).slice(i, i + n).map(c => c.words.map(w => w.w).join(' ')).join(' ').trim();
  };
  const sentence = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const article = (T, o = {}) => ({
    type: 'gs_article', t0: T, t1: T + 5, source: 'Tin Tức 24h', url: 'tintuc24h.vn/cong-nghe/ai-sieu-tri-tue', category: 'Công nghệ',
    headline: 'Cựu nhà nghiên cứu AI cảnh báo cuộc đua tới siêu trí tuệ', date: '31/10/2026', author: 'Minh Anh',
    image: '', lead: 'Một nhà nghiên cứu từng làm việc ở hai phòng thí nghiệm AI lớn vừa lên tiếng sau khi nghỉ việc.',
    before: 'Theo ông, các công ty đang chạy đua rất nhanh.', highlight: 'AI có thể tự cải thiện mà con người không kịp kiểm soát.', after: 'Nhiều chuyên gia đồng tình với nhận định này.',
    hl_t: T + 1.4, ...o,
  });
  const tweet = (T, o = {}) => ({
    type: 'gs_tweet', t0: T, t1: T + 4, name: 'Minh Tech', handle: '@minhtech', time: '2 giờ', verified: true,
    text: 'AI đang tiến bộ nhanh hơn mọi dự đoán. Bạn đã sẵn sàng chưa? 🤖', stats: { replies: 1280, reposts: 3400, likes: 25600, views: 1200000 },
    like_t: T + 1.4, ...(V() ? { x: 360, y: 330 } : { x: 420, y: 300 }), size: 100, ...o,
  });
  // Keyword finder for recipes: accent-SENSITIVE (so "đăng" ≠ "đang"), also matches inside multi-word tokens ("gây shock").
  const findAny = (caps, needles, after = 0) => {
    const nz = x => ' ' + String(x).normalize('NFC').toLowerCase().replace(/[.,!?;:"“”…]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    const ws = (caps || []).flatMap(c => c.words).filter(w => w.s >= after);
    for (let i = 0; i < ws.length; i++) {
      const win = nz(ws.slice(i, i + 3).map(w => w.w).join(' ')), head = nz(ws[i].w);
      if (needles.some(n => win.startsWith(nz(n)) || head.includes(nz(n)))) return ws[i].s;
    }
    return null;
  };
  PACKS.push({
    id: P, name: 'Green screen / react tin tức', icon: '🟩',
    desc: 'Tách người ghép lên ảnh nền, bài báo, bài đăng mạng xã hội, website cuộn; mũi tên chỉ, zoom vào vùng',
    caption: 'greenscreen',
    items: [
      { type: 'gs_backdrop', label: 'Nền + người tách nền', make: T => ({ type: 'gs_backdrop', t0: T, t1: T + 6, bg: { gradient: ['#0B1E3A', '#123E6B', '#0A1426'] }, kb: .08 }) },
      { type: 'gs_article', label: 'Bài báo (trình duyệt)', make: T => article(T) },
      { type: 'gs_tweet', label: 'Bài đăng mạng xã hội', make: T => tweet(T) },
      { type: 'gs_pointer', label: 'Mũi tên / khoanh tròn', make: T => ({ type: 'gs_pointer', t0: T, t1: T + 2.5, kind: 'circle', ...(V() ? { x: 360, y: 300, w: 560, h: 110 } : { x: 420, y: 230, w: 640, h: 110 }), label: 'NHÌN NÈ!' }) },
      { type: 'gs_zoomfocus', label: 'Zoom vào vùng nền', make: T => ({ type: 'gs_zoomfocus', t0: T, t1: T + 3,
        keys: [{ t: T, x: 50, y: 30, s: 1 }, { t: T + .6, x: 50, y: 30, s: 1.6 }, { t: T + 2.4, x: 50, y: 30, s: 1.6 }, { t: T + 3, x: 50, y: 30, s: 1 }] }) },
      { type: 'gs_screen', label: 'Website cuộn', make: T => ({ type: 'gs_screen', t0: T, t1: T + 5, image: '', url: 'trangweb.vn', from: 0, to: 1 }) },
    ],
    // Starter edit: backdrop whole video, article card first 5–6 s (zoom into the highlight), pointer on "đây|nhìn", post card on "đăng|bài viết".
    recipe: ctx => {
      const dur = ctx.dur || 20, caps = ctx.captions || [], b = ctx.brand || {};
      const v = ctx.vertical ?? V();
      const scenes = [{ type: 'gs_backdrop', t0: 0, t1: dur, bg: ctx.image || b.background || { gradient: ['#0B1E3A', '#123E6B', '#0A1426'] }, kb: .06, keep: true }];
      const aEnd = Math.min(6, dur * .35);
      const said = capText(caps, 0, 3);
      scenes.push(article(0, { t1: aEnd, headline: ctx.title || sentence(capText(caps, 0, 2)) || 'Tiêu đề bài báo', source: b.name || 'Tin Tức 24h',
        before: '', highlight: sentence(said) || 'Câu quan trọng trong bài', after: '', lead: '', hl_t: 1.6, image: ctx.article_image || '' }));
      const hy = ctx.article_image ? (v ? 47 : 60) : (v ? 27 : 42);
      scenes.push({ type: 'gs_zoomfocus', t0: 2.6, t1: aEnd, keys: [{ t: 2.6, x: 50, y: hy, s: 1 }, { t: 3.2, x: 50, y: hy, s: 1.45 }, { t: aEnd - .6, x: 50, y: hy, s: 1.45 }, { t: aEnd, x: 50, y: hy, s: 1 }] });
      const busy = [[0, aEnd]];
      const free = (a, z) => busy.every(([p, q]) => z <= p || a >= q);
      const tp = findAny(caps, ['đây', 'nhìn', 'xem này', 'nhìn này']);
      let tt = findAny(caps, ['đăng', 'bài viết', 'bài đăng', 'đăng bài', 'post'], aEnd);
      // No "đăng" keyword: show the post where the speaker says "đây/nhìn" after the article (so the pointer has a target), else mid-video.
      if (tt == null || !free(tt - .2, tt + 4)) tt = tp != null && tp >= aEnd + .3 && tp + 2 < dur ? tp - .3 : Math.max(aEnd + .5, dur * .5);
      if (tt + 2 < dur && free(tt - .2, Math.min(dur, tt + 4))) {
        scenes.push(tweet(Math.max(0, tt - .2), { t1: Math.min(dur, tt + 4), name: b.name || 'Tài khoản', handle: b.handle || '@taikhoan', text: sentence(capText(caps, tt, 2)) || 'Nội dung bài đăng' }));
        busy.push([tt - .2, tt + 4]);
      }
      if (tp != null) {
        const inArt = tp < aEnd, onTweet = scenes.find(s => s.type === 'gs_tweet' && tp >= s.t0 && tp < s.t1);
        const tgt = inArt ? (v ? { x: 360, y: 300, w: 560, h: 120 } : { x: 420, y: 250, w: 640, h: 120 }) : onTweet ? { x: onTweet.x, y: onTweet.y + 20, w: 540, h: 70 } : null;
        if (tgt) scenes.push({ type: 'gs_pointer', t0: Math.max(0, tp - .1), t1: Math.min(dur, tp + 2.2), kind: onTweet ? 'circle' : 'arrow', ...tgt, label: 'NHÌN NÈ!' });
      }
      return { caption_style: 'greenscreen', music: 'suspense', scenes };
    },
  });
})();
