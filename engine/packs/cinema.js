// Pack "cinema" — cinematic storytelling: letterbox bars + film grade (teal-orange / warm / bw / bleach),
// grain, gate weave, vignette; Playfair chapter titles, typewriter lines, location stamp, quote over a darkened
// frame, end credits, light-leak flash, slow-motion ghosting. Elegant small subtitles live inside the bottom bar.
// Design space 720×1280 (vertical) or 1280×720 via DIMS(). Doc: references/pack-cinema.md.
(() => {
  const P = 'cinema';
  if (typeof document !== 'undefined' && !document.querySelector('link[data-pack-font="cinema"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.dataset.packFont = 'cinema';
    l.href = 'https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=block';
    document.head.appendChild(l);
  }
  const SERIF = "'Playfair Display','DM Serif Display',Georgia,serif";
  const SANS = "'Be Vietnam Pro',system-ui,sans-serif";
  const MONO = "'Space Mono','Courier New',monospace";
  const pal = () => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return { warm: b.accent && b.accent !== '#FFD84A' ? b.accent : '#E9C77B', ink: '#F2EEE6', bar: b.bar || '#000',
      sans: b.font && b.font !== 'var(--sans)' ? b.font : SANS, serif: b.serif || SERIF };
  };
  const geo = () => { const [W, H] = DIMS(); return { W, H, v: VERT() }; };
  const life = (s, t, din = .4, dout = .4) => fadeIO(t, s.t0, s.keep ? null : s.t1, din, dout);

  // ---------- film look ----------
  // SVG colour grades (split-tone curves) referenced as filter:url(#cine-…) on a graded copy of the A-roll.
  const DEFS = `<svg width="0" height="0" style="position:absolute"><defs>
    <filter id="cine-teal" color-interpolation-filters="sRGB"><feComponentTransfer>
      <feFuncR type="table" tableValues="0 .1 .44 .86 1"/><feFuncG type="table" tableValues=".04 .27 .53 .8 .94"/><feFuncB type="table" tableValues=".16 .43 .56 .64 .72"/></feComponentTransfer></filter>
    <filter id="cine-warm" color-interpolation-filters="sRGB"><feComponentTransfer>
      <feFuncR type="table" tableValues=".07 .32 .6 .86 1"/><feFuncG type="table" tableValues=".04 .27 .53 .8 .95"/><feFuncB type="table" tableValues=".03 .2 .43 .7 .86"/></feComponentTransfer></filter>
    <filter id="cine-bleach" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values=".42"/><feComponentTransfer>
      <feFuncR type="table" tableValues="0 .14 .5 .88 1"/><feFuncG type="table" tableValues="0 .14 .5 .88 1"/><feFuncB type="table" tableValues=".02 .16 .5 .86 .98"/></feComponentTransfer></filter>
  </defs></svg>`;
  const GRADE = {
    teal: 'url(#cine-teal) contrast(1.1) saturate(1.2)',
    warm: 'url(#cine-warm) saturate(1.08) contrast(1.04)',
    bw: 'grayscale(1) contrast(1.28) brightness(.95)',
    bleach: 'url(#cine-bleach) contrast(1.12)',
    none: '',
  };
  const noise = (a, freq = .8) => `url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22220%22 height=%22220%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%22${freq}%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3CfeColorMatrix values=%220 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 ${a} 0%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')`;
  const GRAIN = noise(.9, .85);
  const grainLayer = (t, a) => { const j = Math.floor(t * 24), gx = Math.round(rnd(j) * 220), gy = Math.round(rnd(j + 11) * 220);
    return `<div class="full" style="background-image:${GRAIN};background-size:220px 220px;background-position:${gx}px ${gy}px;mix-blend-mode:overlay;opacity:${a}"></div>`; };

  // Active letterbox (first one) and its bar sizes right now — captions and other modules use it to stay inside the window.
  function bars(t) {
    const s = (TL.scenes || []).find(x => x.type === 'cine_letterbox' && !x.hidden && t >= x.t0 && t < x.t1);
    if (!s) return null;
    const g = geo(), ratio = s.ratio || 2.35;
    let top, bot;
    if (g.v) { top = s.top ?? (ratio >= 2.2 ? 150 : 120); bot = s.bottom ?? (ratio >= 2.2 ? 290 : 250); }
    else { top = bot = s.top ?? Math.max(0, (g.H - g.W / ratio) / 2); if (s.bottom != null) bot = s.bottom; }
    const ki = s.intro === 0 ? 1 : E.inOutSine(prog(t, s.t0, s.intro ?? .9));
    const ko = s.keep || s.outro === false ? 0 : E.inOutSine(prog(t, s.t1 - (s.outro ?? 0), s.outro || 1e-6));
    const k = s.outro ? ki * (1 - ko) : ki;
    return { s, top: top * k, bot: bot * k, fullTop: top, fullBot: bot };
  }
  const gradeOf = t => { const b = bars(t); return b ? (GRADE[b.s.grade ?? 'teal'] ?? '') : ''; };
  const winY = t => { const g = geo(), b = bars(t); return b ? [b.fullTop, g.H - b.fullBot] : [0, g.H]; };   // visible window [top, bottom]

  // Typed text: n visible characters (grapheme-safe for Vietnamese), cursor blinking at 2 Hz when idle.
  const typed = (text, lt, start, cps) => { const ch = [...String(text || '')]; const n = Math.max(0, Math.min(ch.length, Math.floor((lt - start) * cps))); return { txt: ch.slice(0, n).join(''), done: n >= ch.length, n }; };
  const cursor = (t, typing, col, h) => `<span style="display:inline-block;width:.55em;height:${h};margin-left:.08em;vertical-align:-.12em;background:${col};opacity:${typing || Math.floor(t * 2) % 2 === 0 ? .9 : 0}"></span>`;

  const M = {
    // Frame look over the A-roll (put it FIRST in scenes): graded + weaving copy of the video (back),
    // bars + vignette + grain + flicker (front). Bars never hide captions: the cinema caption sits inside the bottom bar.
    cine_letterbox(s, t, lt) {
      const g = geo(), b = bars(t) || { top: 0, bot: 0 }, f = GRADE[s.grade ?? 'teal'] ?? '';
      const j = Math.floor(t * 24);
      const wv = s.weave === false ? '' : `transform:translate(${(Math.sin(t * 7.3) * .8 + (rnd(j) - .5) * .9).toFixed(2)}px,${(Math.sin(t * 5.1) * .6 + (rnd(j + 5) - .5) * 1.2).toFixed(2)}px) scale(1.012);`;
      const back = f || wv ? `<div class="full"${cidOf(s)}>${arollImg(t, f, wv)}</div>` : '';
      const vg = s.vignette ?? .55, gr = s.grain ?? .32, fl = s.flicker ?? .05;
      const bar = s.bar_color || pal().bar;
      const front = `${DEFS}<div class="full" style="pointer-events:none">
        ${vg ? `<div class="full" style="background:radial-gradient(ellipse 72% 60% at 50% 48%,rgba(0,0,0,0) 50%,rgba(0,0,0,${vg}) 100%)"></div>` : ''}
        ${s.grade === 'warm' ? `<div class="full" style="background:#FF9A4D;mix-blend-mode:soft-light;opacity:.18"></div>` : ''}
        ${s.grade === 'teal' || s.grade == null ? `<div class="full" style="background:linear-gradient(180deg,rgba(0,90,110,.16),rgba(255,140,60,.08));mix-blend-mode:soft-light"></div>` : ''}
        ${gr ? grainLayer(t, gr) : ''}
        ${fl ? `<div class="full" style="background:#000;opacity:${(rnd(j + 21) * fl).toFixed(3)}"></div>` : ''}
        ${s.dust === false ? '' : Array.from({ length: 3 }, (_, i) => rnd(j * 3 + i) > .86 ? `<div class="abs" style="left:${Math.round(rnd(j * 7 + i) * g.W)}px;top:${Math.round(rnd(j * 5 + i) * g.H)}px;width:${(1 + rnd(j + i) * 2.5).toFixed(1)}px;height:${Math.round(4 + rnd(j * 2 + i) * 30)}px;background:rgba(255,255,255,.55);border-radius:2px;transform:rotate(${Math.round(rnd(j + i * 9) * 180)}deg)"></div>` : '').join('')}
        <div class="abs" style="left:0;right:0;top:0;height:${b.top.toFixed(1)}px;background:${bar}"></div>
        <div class="abs" style="left:0;right:0;bottom:0;height:${b.bot.toFixed(1)}px;background:${bar}"></div></div>`;
      return { back, front };
    },

    // Chapter title: kicker between thin rules + Playfair italic title tightening from wide tracking, soft dark wash.
    cine_title(s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .6, .6), [wt, wb] = winY(t);
      const cx = s.x ?? g.W / 2, cy = s.y ?? (g.v ? (wt + wb) / 2 - 20 : g.H / 2), size = s.size || (g.v ? 70 : 78);
      const kr = E.outCubic(prog(lt, .1, .9)), kt = E.outCubic(prog(lt, .35, 1.3)), ks = E.outCubic(prog(lt, 1, .8));
      const blur = (1 - kt) * 10, w = s.w || (g.v ? 620 : 980);
      const rule = `<span style="display:inline-block;width:${(kr * (g.v ? 70 : 110)).toFixed(1)}px;height:1px;background:${p.warm};opacity:.85;vertical-align:middle"></span>`;
      return { front: `<div class="full" style="background:radial-gradient(ellipse 80% 45% at 50% ${(cy / g.H * 100).toFixed(0)}%,rgba(0,0,0,${(.55 * (s.wash ?? 1)).toFixed(2)}),rgba(0,0,0,0) 100%);opacity:${o.toFixed(3)}"></div>
        <div class="abs"${cidOf(s)} style="left:${cx}px;top:${cy}px;width:${w}px;transform:translate(-50%,-50%);text-align:center;opacity:${o.toFixed(3)}">
          ${s.kicker !== '' ? `<div style="font:500 ${g.v ? 18 : 18}px ${p.sans};letter-spacing:.5em;padding-left:.5em;color:${p.warm};opacity:${kr.toFixed(3)};white-space:nowrap">${rule}<span style="margin:0 18px">${esc(s.kicker || 'CHƯƠNG I')}</span>${rule}</div>` : ''}
          <div style="margin-top:22px;font:italic 500 ${size}px/1.15 ${p.serif};color:${p.ink};letter-spacing:${lerp(.14, .01, kt).toFixed(3)}em;opacity:${kt.toFixed(3)};${blur > .3 ? `filter:blur(${blur.toFixed(1)}px);` : ''}text-shadow:0 4px 30px rgba(0,0,0,.6)">${esc(s.title || 'Những ngày cũ')}</div>
          ${s.sub ? `<div style="margin-top:18px;font:400 ${g.v ? 22 : 22}px ${p.sans};letter-spacing:.12em;color:rgba(242,238,230,.75);opacity:${ks.toFixed(3)}">${esc(s.sub)}</div>` : ''}</div>`,
        hideCaptions: s.hideCaptions ?? true };
    },

    // Typewriter line (memory / date): "Hà Nội, 2019" typed at cps with a blinking block cursor.
    cine_type(s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .15, .4), [wt] = winY(t), size = s.size || (g.v ? 36 : 34);
      const al = s.align || (g.v ? 'center' : 'left'), x = s.x ?? (al === 'center' ? g.W / 2 : (g.v ? 48 : 110)), y = s.y ?? (g.v ? wt + 70 : wt + 80);
      const ty = typed(s.text || 'Hà Nội, 2019', lt, s.delay ?? .2, s.cps ?? 12);
      const tr = al === 'center' ? 'translate(-50%,-50%)' : al === 'right' ? 'translate(-100%,-50%)' : 'translate(0,-50%)';
      return { front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:${tr};opacity:${o.toFixed(3)};white-space:nowrap;font:${s.bold ? 700 : 400} ${size}px/1.2 ${MONO};color:${s.color || p.ink};letter-spacing:.02em;text-shadow:0 2px 14px rgba(0,0,0,.7)">${esc(ty.txt)}${cursor(t, !ty.done, s.color || p.ink, '1.05em')}</div>` };
    },

    // Location + time stamp, bottom-left inside the picture window: rule grows, place in tracked caps, mono time typed.
    cine_location(s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .3, .5), [, wb] = winY(t);
      const x = s.x ?? (g.v ? 40 : 64), yb = s.y ?? wb - (g.v ? 34 : 26);
      const kl = E.outCubic(prog(lt, 0, .6)), kp = E.outCubic(prog(lt, .25, .6));
      const ty = typed(s.time || '06:42 · 12.10.2019', lt, .8, s.cps ?? 16);
      return { front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${yb}px;transform:translateY(-100%);opacity:${o.toFixed(3)};display:flex;gap:16px;align-items:stretch;text-shadow:0 2px 12px rgba(0,0,0,.75)">
          <div style="width:2px;background:${p.warm};transform:scaleY(${kl.toFixed(3)});transform-origin:50% 100%"></div>
          <div><div style="font:600 ${g.v ? 24 : 24}px/1.3 ${p.sans};letter-spacing:.32em;text-transform:uppercase;color:${p.ink};white-space:nowrap;clip-path:inset(0 ${((1 - kp) * 100).toFixed(1)}% 0 0)">${esc(s.place || 'Hà Nội, Việt Nam')}</div>
          <div style="margin-top:6px;font:400 ${g.v ? 18 : 18}px/1.3 ${MONO};color:rgba(242,238,230,.8);letter-spacing:.06em;white-space:nowrap;min-height:1.3em">${esc(ty.txt)}${lt > .7 ? cursor(t, !ty.done, 'rgba(242,238,230,.8)', '1em') : ''}</div></div></div>` };
    },

    // Quote over a darkened, slightly blurred frame: words fade in at wps, author after.
    cine_quote(s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .5, .5), [wt, wb] = winY(t);
      const cx = s.x ?? g.W / 2, cy = s.y ?? (wt + wb) / 2, size = s.size || (g.v ? 44 : 46), w = s.w || (g.v ? 600 : 960);
      const words = String(s.text || '').split(/\s+/).filter(Boolean), wps = s.wps ?? 4, st = .45;
      const body = words.map((w0, i) => { const k = E.outCubic(prog(lt, st + i / wps, .5)); return `<span style="display:inline-block;opacity:${k.toFixed(3)};transform:translateY(${((1 - k) * 8).toFixed(1)}px);${k < .97 ? `filter:blur(${((1 - k) * 4).toFixed(1)}px)` : ''}">${esc(w0)}</span>`; }).join(' ');
      const ka = E.outCubic(prog(lt, st + words.length / wps + .2, .6)), kq = E.outCubic(prog(lt, .1, .6));
      return { front: `<div class="full" style="background:rgba(4,4,6,${(.62 * o).toFixed(3)});backdrop-filter:blur(${(3 * o).toFixed(1)}px) saturate(.6);-webkit-backdrop-filter:blur(${(3 * o).toFixed(1)}px) saturate(.6)"></div>
        <div class="abs"${cidOf(s)} style="left:${cx}px;top:${cy}px;width:${w}px;transform:translate(-50%,-50%);text-align:center;opacity:${o.toFixed(3)}">
          <div style="font:italic 400 ${Math.round(size * 2.6)}px/0.6 ${p.serif};color:${p.warm};opacity:${(kq * .8).toFixed(3)};height:${Math.round(size * .9)}px">“</div>
          <div style="font:italic 500 ${size}px/1.4 ${p.serif};color:${p.ink};text-shadow:0 3px 20px rgba(0,0,0,.7)">${body}</div>
          ${s.author ? `<div style="margin-top:26px;font:500 ${g.v ? 19 : 19}px ${p.sans};letter-spacing:.3em;text-transform:uppercase;color:${p.warm};opacity:${ka.toFixed(3)}">— ${esc(s.author)}</div>` : ''}</div>`,
        hideCaptions: s.hideCaptions ?? true };
    },

    // End credits over black (inside the bars): mode 'roll' scrolls up, 'card' fades rows in. Auto: roll when ≥ 5 s.
    cine_credits(s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .6, .6), [wt, wb] = winY(t), dur = s.t1 - s.t0;
      const rows = s.lines || [{ role: 'Đạo diễn', name: BR().name || 'Bạn' }];
      const mode = s.mode || (dur >= 5 ? 'roll' : 'card'), rs = g.v ? 1 : 1, rowH = 74 * rs;
      const titleH = s.title ? 130 : 0, footH = s.thanks || s.logo ? 120 : 0, H0 = titleH + rows.length * rowH + footH;
      const row = (r, i) => {
        const k = mode === 'card' ? E.outCubic(prog(lt, .5 + i * .28, .7)) : 1;
        return `<div${cidOf(r)} style="display:flex;align-items:baseline;justify-content:center;gap:26px;height:${rowH}px;opacity:${k.toFixed(3)};transform:translateY(${((1 - k) * 10).toFixed(1)}px)">
          <div style="flex:1;text-align:right;font:500 ${g.v ? 17 : 17}px ${p.sans};letter-spacing:.26em;text-transform:uppercase;color:rgba(242,238,230,.62)">${esc(r.role)}</div>
          <div style="flex:1;text-align:left;font:500 ${g.v ? 30 : 30}px ${p.serif};color:${p.ink};white-space:nowrap">${esc(r.name)}</div></div>`;
      };
      const kT = E.outCubic(prog(lt, .15, .9));
      const inner = `${s.title ? `<div style="height:${titleH}px;text-align:center;font:italic 500 ${g.v ? 52 : 56}px/1.2 ${p.serif};color:${p.ink};opacity:${mode === 'card' ? kT.toFixed(3) : 1}">${esc(s.title)}<div style="width:60px;height:1px;background:${p.warm};margin:18px auto 0"></div></div>` : ''}
        ${rows.map(row).join('')}
        ${footH ? `<div style="height:${footH}px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:12px;opacity:${mode === 'card' ? E.outCubic(prog(lt, .6 + rows.length * .28, .7)).toFixed(3) : 1}">
          ${s.logo ? `<div style="height:44px">${slIcon(s.logo, 44, 'white')}</div>` : ''}${s.thanks ? `<div style="font:italic 400 ${g.v ? 24 : 24}px ${p.serif};color:${p.warm}">${esc(s.thanks)}</div>` : ''}</div>` : ''}`;
      const winH = wb - wt;
      let y;
      if (mode === 'roll') { const y0 = wb - 40, y1 = wt + winH * .5 - H0; y = lerp(y0, y1, clamp(lt / Math.max(.1, dur - .2))); }
      else y = wt + (winH - H0) / 2;
      return { back: `<div class="full" style="background:#050505;opacity:${clamp(prog(lt, 0, .6)).toFixed(3)}"></div>`,
        front: `<div class="abs"${cidOf(s)} style="left:0;right:0;top:${y.toFixed(1)}px;opacity:${o.toFixed(3)}">${inner}</div>`,
        cover: lt > .6 && (s.keep || t < s.t1 - .6), hideCaptions: s.hideCaptions ?? false };
    },

    // Light-leak flash transition: warm blobs sweep across with screen blend, peaking mid-way with a soft white bloom.
    cine_flash(s, t, lt) {
      const dur = Math.max(.2, s.t1 - s.t0), k = clamp(lt / dur), bell = Math.sin(Math.PI * k), dir = s.side === 'right' ? -1 : 1;
      const C = { warm: ['255,122,46', '255,61,61', '255,214,122'], cool: ['90,170,255', '160,120,255', '210,240,255'], white: ['255,255,255', '255,240,220', '255,255,255'] }[s.color || 'warm'];
      const x1 = 50 + dir * lerp(-70, 70, k), x2 = 50 + dir * lerp(-40, 90, E.inOutSine(k)), I = s.intensity ?? 1;
      const b = s.over_bars ? null : bars(t), clip = b ? `clip-path:inset(${b.top.toFixed(1)}px 0 ${b.bot.toFixed(1)}px 0);` : '';
      return { front: `<div class="full"${cidOf(s)} style="pointer-events:none;mix-blend-mode:screen;${clip}opacity:${(bell * I).toFixed(3)}">
        <div class="full" style="background:radial-gradient(ellipse 60% 90% at ${x1.toFixed(1)}% 40%,rgba(${C[0]},.95),rgba(${C[1]},.45) 40%,rgba(0,0,0,0) 72%)"></div>
        <div class="full" style="background:radial-gradient(ellipse 40% 60% at ${x2.toFixed(1)}% 65%,rgba(${C[2]},.9),rgba(0,0,0,0) 70%)"></div>
        <div class="full" style="background:rgba(255,246,232,${(Math.pow(bell, 3) * .55).toFixed(3)})"></div></div>` };
    },

    // Slow-motion look: dreamy ghost trail from neighbour frames (t−0.05, t−0.1, t−0.15). speed<1 also retimes the picture.
    cine_slowmo(s, t, lt) {
      const sp = s.speed ?? 1, ts = s.t0 + lt * sp, f = gradeOf(t), n = s.ghosts ?? 3, step = s.step ?? .05, a = s.trail ?? .42;
      let html = `<div class="full">${arollImg(ts, `${f} contrast(.97) brightness(1.03)`)}</div>`;
      for (let i = 1; i <= n; i++) html += `<div class="full" style="opacity:${(a * Math.pow(.62, i - 1)).toFixed(3)}">${arollImg(Math.max(0, ts - i * step), `${f} blur(${(i * .6).toFixed(1)}px)`)}</div>`;
      const k = fadeIO(t, s.t0, s.t1, .25, .25);
      return { back: `${DEFS}<div class="full"${cidOf(s)}>${html}</div>`,
        front: `<div class="full" style="pointer-events:none;background:radial-gradient(ellipse 70% 60% at 50% 45%,rgba(255,240,220,${(.08 * k).toFixed(3)}),rgba(0,0,0,${(.35 * k).toFixed(3)}) 100%)"></div>`, cover: true };
    },
  };
  Object.assign(MODULES, M);

  // ---------- captions: small elegant subtitle inside the bottom letterbox bar ----------
  CAPTION_STYLES.cinema = (c, t) => {
    const g = geo(), p = pal(), b = bars(t), size = c.size || (g.v ? 26 : 22), wpx = g.v ? 620 : 1100;
    const caps = TL.captions || [], i = caps.indexOf(c), prev = i > 0 ? caps[i - 1] : null;
    const lastW = prev && prev.words.length ? prev.words[prev.words.length - 1].w : '';
    const cap1 = !prev || /[.!?…]$/.test(lastW) || c.t0 - prev.t1 > .6;
    const lh = size * 1.5;
    // Vertical: top part of the (tall) bottom bar. Horizontal: centred in the bar. No letterbox: low in frame.
    let top = c.y;
    if (top == null) top = b && b.bot > lh ? (g.v ? g.H - b.bot + Math.min(22, (b.bot - lh) / 2) : g.H - b.bot + (b.bot - lh) / 2) : (g.v ? 930 : 640);
    const html = c.words.map((w, k) => {
      let txt = w.w; if (k === 0 && cap1) txt = txt.charAt(0).toUpperCase() + txt.slice(1);
      const e = E.outCubic(prog(t, w.s - .08, .35));
      const hs = w.hl ? `font-family:${p.serif};font-style:italic;font-weight:500;color:${c.hl_color || p.warm};letter-spacing:.02em;` : '';
      return `<span style="display:inline-block;opacity:${e.toFixed(3)};${hs}">${esc(txt)}</span>` + (w.br && g.v ? '<br>' : ' ');
    }).join('');
    return `<div id="cap"${cidOf(c)} style="top:${top.toFixed(1)}px;left:${(c.x ?? g.W / 2) - wpx / 2}px;right:auto;width:${wpx}px;text-align:center;font-family:${c.font || p.sans};font-weight:${c.weight || 400};font-size:${size}px;line-height:1.5;
      letter-spacing:.06em;color:${c.color || p.ink};text-shadow:0 1px 3px rgba(0,0,0,.9),0 0 14px rgba(0,0,0,.6);white-space:normal">${html}</div>`;
  };

  // ---------- Studio metadata + recipe ----------
  const make = (type, d, o) => T => ({ type, t0: T, t1: T + d, ...o });
  PACKS.push({
    id: P, name: 'Điện ảnh kể chuyện', icon: '🎬',
    desc: 'Letterbox 2.35:1, màu phim teal-cam / ấm / đen trắng / bleach, hạt phim, tiêu đề Playfair nghiêng, chữ đánh máy, địa danh, trích dẫn, credits cuối phim, light leak, slow-motion',
    caption: 'cinema',
    items: [
      { type: 'cine_letterbox', label: 'Letterbox + màu phim (cả video)', make: T => ({ type: 'cine_letterbox', t0: 0, t1: Math.max(T + 3, (typeof TL !== 'undefined' && TL && TL.duration) || T + 10), ratio: 2.35, grade: 'teal' }) },
      { type: 'cine_title', label: 'Tiêu đề chương', make: make('cine_title', 3, { kicker: 'CHƯƠNG I', title: 'Những ngày cũ', sub: 'Một câu chuyện có thật' }) },
      { type: 'cine_type', label: 'Chữ đánh máy', make: make('cine_type', 3, { text: 'Hà Nội, mùa thu 2019' }) },
      { type: 'cine_location', label: 'Địa danh + thời gian', make: make('cine_location', 3.5, { place: 'Hà Nội, Việt Nam', time: '06:42 · 12.10.2019' }) },
      { type: 'cine_quote', label: 'Trích dẫn', make: make('cine_quote', 3.5, { text: 'Có những ngày bình thường, sau này nhìn lại mới thấy là đẹp nhất.', author: 'Nhật ký' }) },
      { type: 'cine_credits', label: 'Credits cuối phim', make: make('cine_credits', 4, { title: 'Hết', lines: [{ role: 'Đạo diễn', name: 'Nguyễn Văn A' }, { role: 'Quay phim', name: 'Trần Thị B' }, { role: 'Âm nhạc', name: 'AI Video Studio' }], thanks: 'Cảm ơn bạn đã xem' }) },
      { type: 'cine_flash', label: 'Light leak chuyển cảnh', make: make('cine_flash', .8, { color: 'warm' }) },
      { type: 'cine_slowmo', label: 'Slow-motion (bóng mờ)', make: make('cine_slowmo', 2, { speed: .6 }) },
    ],
    recipe: ctx => {
      const dur = ctx.dur, caps = ctx.captions || [], sc = [], ws = capWords(caps);
      const cEnd = Math.max(3, dur - 4);
      sc.push({ type: 'cine_letterbox', t0: 0, t1: dur, ratio: 2.35, grade: 'teal' });
      const first = caps.length ? caps[0].words.slice(0, 6).map(w => w.w).join(' ') : '';
      const title = ctx.title || (first ? first.charAt(0).toUpperCase() + first.slice(1) : 'Những ngày cũ');
      sc.push({ type: 'cine_title', t0: .1, t1: Math.min(2.8, dur * .3), kicker: 'CHƯƠNG I', title });
      sc.push({ type: 'cine_flash', t0: +Math.min(2.5, dur * .28).toFixed(2), t1: +Math.min(3.2, dur * .3 + .7).toFixed(2), color: 'warm' });
      sc.push({ type: 'cine_location', t0: .8, t1: Math.min(4.6, cEnd), place: ctx.brand?.city || 'Việt Nam', time: 'Hôm nay' });
      // A spoken year ("2019") → typewriter memory line.
      const yr = ws.find(w => /^(19|20)\d\d[.,!?]*$/.test(w.w) && w.s > 4 && w.s < cEnd - 2);
      if (yr) sc.push({ type: 'cine_type', t0: +yr.s.toFixed(2), t1: +(yr.s + 2.5).toFixed(2), text: `Năm ${yr.w.replace(/[.,!?]+$/, '')}` });
      // First highlighted word after the opening → quote card with that sentence.
      const hc = caps.find(c => c.t0 > 4 && c.t1 < cEnd - .5 && c.words.some(w => w.hl));
      if (hc) {
        const i = caps.indexOf(hc), txt = [hc, caps[i + 1]].filter(Boolean).flatMap(c => c.words.map(w => w.w)).join(' ');
        const a = hc.t0, b = Math.min(cEnd - .2, a + 3.4);
        if (b - a > 2) sc.push({ type: 'cine_quote', t0: +a.toFixed(2), t1: +b.toFixed(2), text: txt.charAt(0).toUpperCase() + txt.slice(1) + '.' });
      }
      sc.push({ type: 'cine_credits', t0: +cEnd.toFixed(2), t1: dur, title: ctx.title || 'Hết', lines: [{ role: 'Đạo diễn', name: ctx.brand?.name || 'Bạn' }, { role: 'Dựng phim', name: 'AI Video Studio' }], thanks: ctx.brand?.handle ? `Theo dõi ${ctx.brand.handle}` : 'Cảm ơn bạn đã xem' });
      return { caption_style: 'cinema', music: 'epic', scenes: sc };
    },
  });
})();
