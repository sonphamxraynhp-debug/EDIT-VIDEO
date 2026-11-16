// "AI Dark Keynote" pack — ported (look only) from the video-edit-ai-keynote skill.
// Warm-black canvas with a faint 90px grid and two gold glows, the speaker inside a rounded card that
// re-frames every few seconds, one caption line at a time on a dark plate with gold keywords, and UI-like
// graphics (tag, rows, chips, bigtype, steps, chart, gridfill, myth, cta) that build up as the idea is spoken.
// Design space 720x1280 (vertical). Every positionable block uses x/y = centre and size = base font px.
// Spec: references/pack-keynote.md.
(() => {
  const P = 'keynote';
  const K = {
    ink: '#0F0E0C', gold: '#F7D33B', gold2: '#FFF160', dim: '#C9A93A', card: '#1F1C13',
    line: 'rgba(255,241,150,.14)', white: '#F4F2E5', red: '#FF4D3D', dark: '#0B0A08', glow: [150, 132, 40],
  };
  // Palette: source colours, overridable by timeline.brand (primary → gold, accent → bright gold, dark → canvas).
  const pal = (s = {}) => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return {
      ...K, gold: s.color || b.primary || K.gold, gold2: s.color2 || b.accent || K.gold2, ink: b.dark || K.ink,
      font: s.font || b.font || "'Be Vietnam Pro',var(--sans),sans-serif",
    };
  };
  const hexA = (hex, a) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const f3 = v => (+v).toFixed(3);
  const hl = (s, gold) => esc(s || '').replace(/\|([^|]+)\|/g, `<b style="color:${gold};font-weight:inherit">$1</b>`);

  // Line icons from the source design system (stroke, 24x24); anything else goes through slIcon (si:/emoji/image).
  const ICON = {
    doc: 'M6 3h8l4 4v14H6z M14 3v4h4', img: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6',
    vid: 'M3 6h13v12H3z M16 10l5-3v10l-5-3', chart: 'M4 19h16 M6 15l4-5 3 3 5-7',
    clock: 'M12 3a9 9 0 100 18 9 9 0 000-18 M12 7v5l3 2', bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8 M4 21c0-4 4-6 8-6s8 2 8 6',
    shop: 'M4 8h16l-1 12H5z M8 8V6a4 4 0 018 0v2', link: 'M9 15l6-6 M10 6h5a4 4 0 010 8h-2 M14 18H9a4 4 0 010-8h2',
    check: 'M4 12l5 5L20 6', folder: 'M3 7h6l2 3h10v10H3z', phone: 'M8 2h8v20H8z M11 19h2',
    laptop: 'M4 5h16v11H4z M2 19h20', spark: 'M12 3v6 M12 15v6 M3 12h6 M15 12h6 M6 6l3 3 M15 15l3 3 M18 6l-3 3 M9 15l-3 3',
    gear: 'M12 9a3 3 0 100 6 3 3 0 000-6 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2',
    alert: 'M12 3L2 20h20z M12 10v4 M12 17v.5', globe: 'M12 3a9 9 0 100 18 9 9 0 000-18 M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
    brain: 'M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 006 1V4a3 3 0 00-3 0 M15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-6 1',
    up: 'M4 17l6-6 4 4 6-8 M14 7h6v6', x: 'M6 6l12 12 M18 6L6 18',
  };
  const icon = (k, sizeEm, color) => (ICON[k]
    ? `<svg viewBox="0 0 24 24" style="width:${sizeEm};height:${sizeEm};display:block;fill:none;stroke:${color};stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round"><path d="${ICON[k]}"/></svg>`
    : `<span style="display:block;width:${sizeEm};height:${sizeEm};font-size:${sizeEm};position:relative">${slIcon(k, 100, 'white').replace(/100px/g, '1em').replace(/90px/g, '.9em')}</span>`);

  // Entrance .30s slide-up 16px (outCubic), exit .22s slide-up 8px — measured on the reference.
  function life(s, t) {
    const IN = s.dur_in ?? .3, k = E.outCubic(prog(t, s.t0, IN));
    let o = k, dy = (1 - k) * 16;
    if (!s.keep && s.t1 != null) { const q = prog(t, s.t1 - .22, .22); o *= 1 - q; dy -= q * 8; }
    return { o, dy };
  }
  // Child of a staggered group: .26s, slide 12px, scale .94 → 1.
  const kid = (t, st) => {
    const k = E.outCubic(prog(t, st, .26));
    return `opacity:${f3(k)};transform:translateY(${((1 - k) * 12).toFixed(1)}px) scale(${f3(.94 + .06 * k)})`;
  };
  // Root box: centred on x/y, em-based so `size` scales the whole block.
  function root(s, t, D, inner, o = {}) {
    const [W, H] = DIMS(), L = life(s, t), c = pal(s);
    const w = o.w === 'auto' ? '' : `width:${o.w}px;`;
    return `<div class="abs"${cidOf(s)} style="left:${s.x ?? W / 2}px;top:${s.y ?? H / 2}px;${w}font-size:${s.size || D}px;font-family:${c.font};color:${c.white};
      line-height:1.2;opacity:${f3(L.o)};transform:translate(-50%,-50%) translateY(${L.dy.toFixed(1)}px);${o.style || ''}">${inner}</div>`;
  }

  // ---------- background ----------
  function kBg(s = {}) {
    const c = pal(s), g = s.grid ?? 90, [r, gg, b] = s.glow_rgb || K.glow, [W, H] = DIMS();
    const gl = s.glow === false ? [] : (s.glows || [[.28, .20, .55, 74], [.86, .78, .45, 40]]).map(([x, y, rad, a]) =>
      `radial-gradient(circle ${Math.round(rad * W)}px at ${x * 100}% ${y * 100}%,rgba(${r},${gg},${b},${(a / 255).toFixed(3)}) 0%,rgba(${r},${gg},${b},0) 100%)`);
    const layers = [...gl], sizes = gl.map(() => '100% 100%');
    if (g) { layers.push('linear-gradient(rgba(150,145,120,.10) 1px,transparent 1px)', 'linear-gradient(90deg,rgba(150,145,120,.10) 1px,transparent 1px)'); sizes.push(`${g}px ${g}px`, `${g}px ${g}px`); }
    return `<div class="full" style="background-color:${c.ink};background-image:${layers.join(',') || 'none'};background-size:${sizes.join(',') || 'auto'};background-position:0 0"></div>`;
  }

  // ---------- framing presets (source design-system, 720x1280) ----------
  const PRE_V = {
    full: [0, 0, 720, 1280, 0], tall: [68, 150, 584, 880, 44], 'tall-low': [68, 300, 584, 760, 44],
    hero: [68, 80, 584, 584, 40], 'hero-low': [68, 330, 584, 584, 40], mid: [170, 430, 380, 470, 34],
    'mini-left': [68, 560, 210, 280, 26], 'mini-center': [255, 560, 210, 280, 26], 'mini-right': [442, 560, 210, 280, 26],
  };
  // Horizontal fallback (1280x720): card on the left/right, graphics on the other side.
  const PRE_H = {
    full: [0, 0, 1280, 720, 0], hero: [60, 60, 560, 600, 36], 'hero-low': [660, 60, 560, 600, 36], tall: [60, 60, 560, 600, 36],
    'tall-low': [660, 60, 560, 600, 36], mid: [390, 120, 500, 480, 30], 'mini-left': [60, 220, 240, 300, 24],
    'mini-center': [520, 220, 240, 300, 24], 'mini-right': [980, 220, 240, 300, 24],
  };
  const rectOf = sh => {
    const p = (VERT() ? PRE_V : PRE_H)[sh.preset || 'hero'] || PRE_V.hero, c = sh.card || {};
    return { x: c.x ?? p[0], y: c.y ?? p[1], w: c.w ?? p[2], h: c.h ?? p[3], r: c.r ?? sh.r ?? p[4], zoom: sh.zoom ?? 1, pan_y: sh.pan_y, t: sh.t };
  };

  // ---------- modules ----------
  const MOD = {
    // Speaker card on the warm grid. shots: [{t, preset|card:{x,y,w,h,r}, pan_y?, zoom?}] — the card morphs
    // between frames in `morph` s (0 = hard cut). Face is centred from TL.face unless pan_y is set.
    keynote_frame(s, t, lt) {
      const [W, H] = DIMS(), c = pal(s);
      const shots = (s.shots && s.shots.length ? s.shots : [{ t: s.t0, preset: s.preset || 'hero', card: s.card, pan_y: s.pan_y, zoom: s.zoom }]);
      let i = 0;
      for (let j = 0; j < shots.length; j++) if (t >= (shots[j].t ?? s.t0)) i = j;
      const cur = rectOf(shots[i]), prev = i > 0 ? rectOf(shots[i - 1]) : null, md = s.morph ?? .35;
      const k = prev && md > 0 ? E.outCubic(prog(t, cur.t ?? s.t0, md)) : 1;
      const R = prev ? Object.fromEntries(['x', 'y', 'w', 'h', 'r', 'zoom'].map(f => [f, lerp(prev[f], cur[f], k)])) : cur;
      const st = cur.t ?? s.t0, nx = shots[i + 1]?.t ?? s.t1, drift = s.drift === false ? 1 : 1 + .03 * E.inOutSine(prog(t, st, Math.max(1, nx - st)));
      const ek = E.outCubic(prog(lt, 0, .35)), es = s.enter === 'cut' ? 1 : lerp(.96, 1, ek), eo = s.enter === 'cut' ? 1 : ek;
      const out = s.keep ? 1 : 1 - prog(t, s.t1 - .2, .2);
      // Fit the full frame into the card (cover) and keep the face around 42% height.
      const F = TL.face || { x: W / 2, y: H * .41 }, sc = Math.max(R.w / W, R.h / H) * R.zoom * drift, iw = W * sc, ih = H * sc;
      const left = clamp(R.w / 2 - F.x * sc, R.w - iw, 0);
      const top = cur.pan_y != null ? (R.h - ih) * cur.pan_y : clamp(R.h * .42 - F.y * sc, R.h - ih, 0);
      const vid = TL.aroll
        ? `<img src="${url(fmtSeq(TL.aroll.frames, frameAt(t)))}" style="position:absolute;left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${iw.toFixed(1)}px;height:${ih.toFixed(1)}px;max-width:none;filter:${arollFilter(t)}">`
        : `<div class="full" style="background:#15130f"></div>`;
      const isFull = R.w >= W - 1 && R.h >= H - 1, frame = !s.no_frame && !isFull;
      const card = `<div class="abs"${cidOf(s)} style="left:${R.x.toFixed(1)}px;top:${R.y.toFixed(1)}px;width:${R.w.toFixed(1)}px;height:${R.h.toFixed(1)}px;border-radius:${R.r.toFixed(1)}px;overflow:hidden;
        opacity:${f3(eo * out)};transform:scale(${f3(es)});${frame ? `box-shadow:0 0 70px ${hexA(c.gold, .10)},0 18px 60px rgba(0,0,0,.55);` : ''}">${vid}
        ${frame ? `<div class="full" style="border-radius:inherit;border:1px solid rgba(255,241,150,.16);box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)"></div>` : ''}</div>`;
      return { back: kBg(s) + card, cover: true };
    },

    // Chapter label: gold-outlined pill with a pulsing dot, uppercase, tracked.
    keynote_tag(s, t, lt) {
      const c = pal(s), D = 18, u = v => `${(v / D).toFixed(4)}em`, pulse = .65 + .35 * Math.cos(lt * 5);
      return { front: root(s, t, D, `<span style="display:inline-flex;align-items:center;gap:${u(10)};padding:${u(9)} ${u(20)} ${u(9)} ${u(16)};border:${u(1.5)} solid ${c.gold};border-radius:999px;
        background:${hexA(c.gold, .07)};color:${c.gold2};font-weight:800;letter-spacing:.13em;text-transform:uppercase;white-space:nowrap;box-shadow:0 0 ${u(26)} ${hexA(c.gold, .16)}">
        <i style="display:block;width:${u(8)};height:${u(8)};border-radius:50%;background:${c.gold};box-shadow:0 0 ${u(10)} ${hexA(c.gold, pulse)}"></i>${esc(s.text || 'Chương mới')}</span>`, { w: 'auto' }) };
    },

    // Vertical card list, rows build in with `stagger`; `active` (index or [{t,i}]) turns a row gold.
    // items: ["text" | {text, icon}] ; summary: {text, sub?, t?, ghost?} → gold pill under the list.
    keynote_rows(s, t, lt) {
      const c = pal(s), D = 26, u = v => `${(v / D).toFixed(4)}em`, sg = s.stagger ?? .55;
      let act = -1, at = s.t0;
      if (Array.isArray(s.active)) for (const a of s.active) { if (t >= a.t) { act = a.i; at = a.t; } } else if (s.active != null) { act = s.active; at = s.t0 + act * sg; }
      const ka = E.outCubic(prog(t, at, .22));
      const rows = (s.items || []).map((it, j) => {
        const o = typeof it === 'string' ? { text: it } : it, on = j === act, a = on ? ka : 0;
        const bg = on ? `linear-gradient(${hexA(c.gold, a)},${hexA(c.gold, a)}),${c.card}` : c.card;
        const col = a > .5 ? c.dark : c.white, ic = a > .5 ? c.dark : c.gold;
        const tail = on ? `<span style="margin-left:auto;display:flex;align-items:center;gap:${u(10)};opacity:${f3(a)}"><span style="width:${u(96 * a)};height:${u(4)};border-radius:2px;background:rgba(0,0,0,.35)"></span>${icon('chart', u(22), c.dark)}</span>` : '';
        return `<div${cidOf(o)} style="display:flex;align-items:center;gap:${u(14)};height:${u(62)};padding:0 ${u(18)};border-radius:${u(18)};background:${bg};
          border:1px solid ${on && a > .3 ? c.gold : c.line};color:${col};font-weight:600;white-space:nowrap;${on ? `box-shadow:0 0 ${u(34)} ${hexA(c.gold, .34 * a)};` : ''}${kid(t, s.t0 + j * sg)}">
          <span style="width:${u(38)};height:${u(38)};flex:0 0 ${u(38)};border-radius:${u(12)};background:${a > .5 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.06)'};display:flex;align-items:center;justify-content:center">${icon(o.icon || 'doc', u(20), ic)}</span>
          <span style="overflow:hidden;text-overflow:ellipsis">${esc(o.text)}</span>${tail}</div>`;
      }).join('');
      let sum = '';
      if (s.summary) {
        const m = typeof s.summary === 'string' ? { text: s.summary } : s.summary, st = m.t ?? s.t0 + (s.items || []).length * sg;
        sum = `<div style="text-align:center;margin-top:${u(18)};${kid(t, st)}">${pill(m, c, u)}</div>`;
      }
      return { front: root(s, t, D, `<div style="display:flex;flex-direction:column;gap:${u(8)}">${rows}</div>${sum}`, { w: s.w || 584 }) };
    },

    // Horizontal chips that pop in one by one. mode: chip | question (gold "?") | flow (gold ghost pills + arrows) | icon (icon-only tiles).
    keynote_chips(s, t, lt) {
      const c = pal(s), D = 20, u = v => `${(v / D).toFixed(4)}em`, sg = s.stagger ?? .55, mode = s.mode || 'chip';
      const items = (s.items || []).map(it => (typeof it === 'string' ? { text: it } : it));
      const parts = [];
      items.forEach((o, j) => {
        const st = s.t0 + j * sg;
        if (mode === 'flow' && j > 0) {
          const ka = E.outCubic(prog(t, st - .12, .2));
          parts.push(`<span style="position:relative;flex:0 0 ${u(26)};height:${u(2)};background:${hexA(c.gold, .55)};transform-origin:left;transform:scaleX(${f3(ka)})">
            <span style="position:absolute;right:${u(-1)};top:${u(-4)};border-left:${u(7)} solid ${hexA(c.gold, .8)};border-top:${u(5)} solid transparent;border-bottom:${u(5)} solid transparent"></span></span>`);
        }
        let el;
        if (mode === 'flow') {
          el = `<span${cidOf(o)} style="display:inline-flex;align-items:center;padding:${u(11)} ${u(22)};border-radius:999px;background:${hexA(c.gold, .1)};border:${u(1.5)} solid ${c.gold};
            color:${c.gold2};font-weight:800;font-size:${u(22)};white-space:nowrap;${kid(t, st)}">${esc(o.text)}</span>`;
        } else if (mode === 'icon') {
          el = `<span${cidOf(o)} style="display:inline-flex;align-items:center;justify-content:center;width:${u(64)};height:${u(64)};border-radius:${u(16)};background:${c.card};border:1px solid ${c.line};${kid(t, st)}">${icon(o.icon || o.text || 'spark', u(30), c.gold)}</span>`;
        } else {
          el = `<span${cidOf(o)} style="display:inline-flex;align-items:center;gap:${u(8)};padding:${u(10)} ${u(mode === 'question' ? 14 : 16)} ${u(10)} ${u(16)};border-radius:${u(14)};background:${c.card};border:1px solid ${c.line};
            color:${c.white};font-weight:600;white-space:nowrap;${kid(t, st)}">${o.icon ? icon(o.icon, u(22), c.gold) : ''}${esc(o.text || '')}${mode === 'question' ? `<b style="color:${c.gold};font-weight:800;margin-left:${u(2)}">?</b>` : ''}</span>`;
        }
        parts.push(el);
      });
      const al = s.align === 'left' ? 'flex-start' : s.align === 'right' ? 'flex-end' : 'center';
      return { front: root(s, t, D, `<div style="display:flex;align-items:center;justify-content:${al};gap:${u(mode === 'flow' ? 10 : 10)};flex-wrap:${mode === 'flow' ? 'nowrap' : 'wrap'}">${parts.join('')}</div>`, { w: s.w || 584 }) };
    },

    // Big emphasis: kicker / huge gold word or number (count-up when `count`) / sub with |gold|.
    // With big2 it becomes the programme lockup: white line + glowing gold line + gold underline (`rule` px).
    keynote_bigtype(s, t, lt) {
      const c = pal(s), D = 96, u = v => `${(v / D).toFixed(4)}em`;
      let big = String(s.big ?? '1 phút');
      if (s.count) {
        const m = /^([^0-9]*)([0-9]+(?:[.,][0-9]+)?)(.*)$/.exec(big);
        if (m) {
          const n = parseFloat(m[2].replace(',', '.')), dec = (m[2].split(/[.,]/)[1] || '').length;
          const v = n * E.outCubic(prog(t, s.t0 + .1, s.count_dur ?? .9));
          big = m[1] + v.toFixed(dec).replace('.', m[2].includes(',') ? ',' : '.') + m[3];
        }
      }
      const lock = s.big2 != null, bk = E.outBack(prog(t, s.t0 + .08, .4), 1.5);
      const kick = s.kicker ? `<div style="color:${c.gold};font-weight:800;font-size:${u(lock ? 20 : 19)};letter-spacing:${lock ? '.3em' : '.24em'};text-transform:uppercase;margin-bottom:${u(6)};${kid(t, s.t0)}">${esc(s.kicker)}</div>` : '';
      const l1 = lock
        ? `<div style="color:${c.white};font-weight:800;font-size:${u(58)};letter-spacing:.02em;line-height:1.1;white-space:nowrap;${kid(t, s.t0 + .1)}">${esc(big)}</div>
           <div style="color:${c.gold};font-weight:800;font-size:${u(64)};line-height:1.08;letter-spacing:.01em;white-space:nowrap;text-shadow:0 0 ${u(44)} ${hexA(c.gold, .5)};${kid(t, s.t0 + .3)}">${esc(s.big2)}</div>`
        : `<div style="color:${c.gold};font-weight:800;line-height:1;letter-spacing:-.02em;white-space:nowrap;text-shadow:0 0 ${u(42)} ${hexA(c.gold, .45)};
            opacity:${f3(clamp(bk * 2))};transform:scale(${f3(lerp(.85, 1, bk))})">${esc(big)}</div>`;
      const sub = s.sub ? `<div style="color:${c.white};font-weight:600;font-size:${u(26)};margin-top:${u(10)};opacity:.92;${kid(t, s.t0 + .35)}">${hl(s.sub, c.gold)}</div>` : '';
      const rule = s.rule || lock ? `<div style="height:${u(5)};border-radius:3px;background:${c.gold};margin:${u(12)} auto 0;box-shadow:0 0 ${u(26)} ${hexA(c.gold, .6)};width:${u((s.rule || 210) * E.outCubic(prog(t, s.t0 + .45, .45)))}"></div>` : '';
      return { front: root(s, t, D, `<div style="text-align:center">${kick}${l1}${sub}${rule}</div>`, { w: s.w || 584 }) };
    },

    // Numbered roadmap: gold circles on a track that fills as each step is spoken; current step glows.
    keynote_steps(s, t, lt) {
      const c = pal(s), D = 17, u = v => `${(v / D).toFixed(4)}em`, sg = s.stagger ?? .6, items = s.items || ['Tối 1', 'Tối 2', 'Tối 3'], n = items.length;
      let cur = -1;
      items.forEach((_, j) => { if (t >= s.t0 + j * sg) cur = j; });
      const fill = n > 1 ? clamp((cur + E.outCubic(prog(t, s.t0 + cur * sg, sg)) * (cur < n - 1 ? 1 : 0)) / (n - 1)) : 0;
      const inset = 100 / (2 * n);
      const cells = items.map((txt, j) => {
        const on = j === cur, ring = on ? .5 + .5 * Math.sin((t - s.t0) * 6) : 0;
        return `<span style="flex:1;display:flex;flex-direction:column;align-items:center;gap:${u(9)};position:relative;z-index:2;${kid(t, s.t0 + j * sg)}">
          <span style="width:${u(40)};height:${u(40)};border-radius:50%;background:${c.gold};color:${c.dark};font-weight:800;font-size:${u(21)};display:flex;align-items:center;justify-content:center;
            box-shadow:0 0 ${u(24)} ${hexA(c.gold, .42)}${on ? `,0 0 0 ${u(5 + ring * 3)} ${hexA(c.gold, .18)}` : ''}">${j + 1}</span>
          <span style="color:${on ? c.white : 'rgba(244,242,229,.82)'};font-weight:${on ? 700 : 600};text-align:center;white-space:nowrap">${esc(txt)}</span></span>`;
      }).join('');
      const tr = `<span style="position:absolute;top:${u(19)};left:${inset}%;right:${inset}%;height:2px;background:${hexA(c.gold, .25)}"></span>
        <span style="position:absolute;top:${u(19)};left:${inset}%;width:${((100 - 2 * inset) * fill).toFixed(2)}%;height:2px;background:${c.gold};box-shadow:0 0 8px ${hexA(c.gold, .7)}"></span>`;
      return { front: root(s, t, D, `<div style="position:relative;display:flex;align-items:flex-start">${tr}${cells}</div>`, { w: s.w || 584 }) };
    },

    // Rising line chart in a card: line draws in `draw` s with a glowing tip; optional value badge.
    // data: numbers (any scale) → smooth curve. Illustrative only, not a real data chart.
    keynote_chart(s, t, lt) {
      const c = pal(s), D = 22, u = v => `${(v / D).toFixed(4)}em`, ch = s.h || 90;
      const data = s.data || [6, 9, 15, 19, 30, 44, 70, 100], mn = Math.min(...data), mx = Math.max(...data), n = data.length;
      const pt = i => [6 + (288 * i) / (n - 1), 84 - (76 * (data[i] - mn)) / ((mx - mn) || 1)];
      const S = [];
      for (let i = 0; i < n - 1; i++) {
        const p0 = pt(Math.max(0, i - 1)), p1 = pt(i), p2 = pt(i + 1), p3 = pt(Math.min(n - 1, i + 2));
        for (let q = 0; q < 12; q++) {
          const a = q / 12, a2 = a * a, a3 = a2 * a;
          S.push([0, 1].map(d => .5 * (2 * p1[d] + (-p0[d] + p2[d]) * a + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * a2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * a3)));
        }
      }
      S.push(pt(n - 1));
      const k = E.outCubic(prog(t, s.t0 + .15, s.draw ?? 1.4)), xEnd = 6 + 288 * k;
      const vis = [];
      for (let i = 0; i < S.length; i++) {
        if (S[i][0] <= xEnd) vis.push(S[i]);
        else { const a = S[i - 1], b = S[i], f = (xEnd - a[0]) / (b[0] - a[0] || 1); vis.push([xEnd, lerp(a[1], b[1], f)]); break; }
      }
      const tip = vis[vis.length - 1], P = vis.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      const gid = `kng${String(s.cid || s.t0).replace(/\W/g, '')}`;
      const svg = `<svg viewBox="0 0 300 90" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
        <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c.gold}" stop-opacity=".28"/><stop offset="1" stop-color="${c.gold}" stop-opacity="0"/></linearGradient></defs>
        ${[22, 45, 68].map(y => `<line x1="0" x2="300" y1="${y}" y2="${y}" stroke="rgba(255,241,150,.07)" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('')}
        ${vis.length > 1 ? `<polygon points="6,90 ${P} ${tip[0].toFixed(1)},90" fill="url(#${gid})"/>` : ''}
        <polyline points="${P}" fill="none" stroke="${c.gold}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 6px ${hexA(c.gold, .6)})"/></svg>`;
      const dot = `<span style="position:absolute;left:${(tip[0] / 3).toFixed(2)}%;top:${(tip[1] / .9).toFixed(2)}%;width:${u(12)};height:${u(12)};margin:${u(-6)} 0 0 ${u(-6)};border-radius:50%;background:${c.gold2};
        box-shadow:0 0 ${u(6)} ${c.gold},0 0 ${u(18)} ${hexA(c.gold, .8)};opacity:${f3(clamp(k * 6))}"></span>`;
      const val = s.value ? `<div style="position:absolute;right:${u(18)};top:${u(14)};color:${c.gold};font-weight:800;font-size:${u(34)};letter-spacing:-.01em;text-shadow:0 0 ${u(20)} ${hexA(c.gold, .45)};${kid(t, s.t0 + (s.draw ?? 1.4) * .8)}">${esc(s.value)}</div>` : '';
      return { front: root(s, t, D, `<div style="position:relative;background:${c.card};border:1px solid ${c.line};border-radius:${u(20)};padding:${u(16)} ${u(18)} ${u(14)}">
        ${val}<div style="color:${c.gold};font-weight:800;font-size:${u(15)};letter-spacing:.18em;text-transform:uppercase;margin-bottom:${u(2)}">${esc(s.kicker ?? 'Tăng đều')}</div>
        <div style="color:${c.white};font-weight:600;margin-bottom:${u(8)}">${esc(s.label ?? 'Lượt view')}</div>
        <div style="position:relative;height:${u(ch)}">${svg}${dot}</div></div>`, { w: s.w || 584 }) };
    },

    // Counter + grid of cells lighting up one by one ("nhân bản 12 kênh").
    keynote_gridfill(s, t, lt) {
      const c = pal(s), D = 40, u = v => `${(v / D).toFixed(4)}em`, total = s.total || 18, cols = s.cols || 9, dr = s.draw ?? 1.6;
      const k = clamp((t - s.t0 - .2) / dr), n = Math.round((s.count ?? total) * E.outCubic(k));
      const cells = Array.from({ length: total }, (_, i) => {
        const ck = E.outBack(prog(t, s.t0 + .2 + (dr * (i + 1)) / total - .12, .2), 2.2), on = ck > .02;
        return `<span style="aspect-ratio:1;border-radius:${u(6)};position:relative;background:rgba(255,255,255,.06)">${on ? `<span style="position:absolute;inset:0;border-radius:inherit;background:${c.gold};
          box-shadow:0 0 ${u(12)} ${hexA(c.gold, .5)};transform:scale(${f3(clamp(ck, 0, 1.15))})"></span>` : ''}</span>`;
      }).join('');
      return { front: root(s, t, D, `<div style="display:flex;align-items:center;gap:${u(18)};background:${c.card};border:1px solid ${c.line};border-radius:${u(20)};padding:${u(16)} ${u(18)}">
        <div style="flex:0 0 auto;min-width:${u(140)};font-weight:800;line-height:1;white-space:nowrap"><em style="display:block;font-style:normal;color:${c.gold};font-size:${u(14)};letter-spacing:.2em;text-transform:uppercase;margin-bottom:${u(8)}">${esc(s.kicker ?? 'Nhân bản')}</em>
          <span style="color:${c.white}">${n}</span> <span style="color:${c.white};font-size:${u(24)};font-weight:700;opacity:.9">${esc(s.unit ?? 'kênh')}</span></div>
        <div style="flex:1;display:grid;grid-template-columns:repeat(${cols},1fr);gap:${u(6)}">${cells}</div></div>`, { w: s.w || 584 }) };
    },

    // Wrong belief struck through in red at `strike_at` (the exact second the speaker negates it); text dims.
    keynote_myth(s, t, lt) {
      const c = pal(s), D = 24, u = v => `${(v / D).toFixed(4)}em`, sa = s.strike_at ?? s.t0 + 1.2;
      const k = E.outCubic(prog(t, sa, .45)), shake = k > 0 && k < 1 ? Math.sin((t - sa) * 70) * (1 - k) * 3 : 0;
      const badge = s.badge === false ? '' : `<span style="position:absolute;right:${u(-12)};top:${u(-14)};padding:${u(3)} ${u(10)};border-radius:999px;background:${c.red};color:#fff;font-weight:800;font-size:${u(13)};letter-spacing:.12em;
        box-shadow:0 0 ${u(16)} ${hexA(c.red, .6)};opacity:${f3(clamp((k - .6) * 3))};transform:scale(${f3(lerp(.6, 1, E.outBack(clamp((k - .6) * 2.5), 2)))})">${esc(s.badge || 'SAI')}</span>`;
      const kick = s.kicker ? `<div style="text-align:center;color:${c.gold};font-weight:800;font-size:${u(14)};letter-spacing:.24em;text-transform:uppercase;margin-bottom:${u(10)}">${esc(s.kicker)}</div>` : '';
      return { front: root(s, t, D, `${kick}<span style="position:relative;display:inline-block;padding:${u(12)} ${u(20)};border-radius:${u(16)};background:${c.card};border:1px solid ${c.line};
        color:${k > .5 ? 'rgba(244,242,229,.42)' : c.white};font-weight:600;white-space:nowrap;transform:translateX(${shake.toFixed(1)}px)">${esc(s.text || 'Muốn dùng AI phải giỏi công nghệ')}
        <span style="position:absolute;left:${u(16)};top:50%;height:${u(3)};margin-top:${u(-1)};width:calc((100% - ${u(32)}) * ${f3(k)});background:${c.red};border-radius:2px;box-shadow:0 0 ${u(14)} ${hexA(c.red, .8)}"></span>${badge}</span>`,
      { w: 'auto', style: 'text-align:center' }) };
    },

    // Gold call-to-action button with a link icon, gentle pulse + shine sweep, small line underneath.
    keynote_cta(s, t, lt) {
      const c = pal(s), D = 31, u = v => `${(v / D).toFixed(4)}em`, bk = E.outBack(prog(lt, 0, .45), 1.8);
      const pulse = 1 + .022 * Math.sin(lt * 4.2) * clamp(lt - .45), sw = ((lt - .5) % 1.8 + 1.8) % 1.8 / 1.8;
      const shine = lt > .5 ? `<span style="position:absolute;inset:0;border-radius:inherit;overflow:hidden"><span style="position:absolute;top:0;bottom:0;width:30%;left:${(-40 + sw * 180).toFixed(1)}%;
        background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);transform:skewX(-18deg)"></span></span>` : '';
      return { front: root(s, t, D, `<div style="display:flex;flex-direction:column;align-items:center;gap:${u(10)}">
        <span style="position:relative;display:inline-flex;align-items:center;gap:${u(12)};padding:${u(16)} ${u(40)};border-radius:999px;background:${c.gold};color:${c.dark};font-weight:800;letter-spacing:.02em;white-space:nowrap;
          box-shadow:0 0 ${u(48)} ${hexA(c.gold, .42)};transform:scale(${f3(clamp(bk, 0, 1.2) * pulse)})">${icon(s.icon || 'link', u(26), c.dark)}${esc(s.text || 'ĐĂNG KÝ NGAY')}${shine}</span>
        ${s.sub ? `<span style="color:${c.gold2};font-weight:500;font-size:${u(18)};white-space:nowrap;padding:${u(5)} ${u(14)};border-radius:999px;background:rgba(9,9,12,.55);${kid(t, s.t0 + .35)}">${esc(s.sub)}</span>` : ''}</div>`, { w: s.w || 584 }) };
    },
  };
  // Gold summary pill (used by rows.summary). ghost → outlined.
  function pill(m, c, u) {
    return `<span style="display:inline-flex;flex-direction:column;align-items:center;padding:${u(11)} ${u(24)};border-radius:999px;font-weight:800;font-size:${u(22)};white-space:nowrap;
      ${m.ghost ? `background:${hexA(c.gold, .1)};color:${c.gold2};border:1.5px solid ${c.gold}` : `background:${c.gold};color:${c.dark};box-shadow:0 0 ${u(34)} ${hexA(c.gold, .34)}`}">${esc(m.text)}
      ${m.sub ? `<small style="display:block;font-weight:500;font-size:.6em;opacity:.7;letter-spacing:.04em">${esc(m.sub)}</small>` : ''}</span>`;
  }
  Object.assign(MODULES, MOD);

  // ---------- caption: one line at a time on a dark rounded plate, keywords in gold ----------
  CAPTION_STYLES.keynote = (c, t) => {
    const p = pal(c), [W] = DIMS(), x = c.x ?? W / 2, size = c.size || 44;
    const reveal = TL.caption_reveal === true, a = E.linear(prog(t, c.t0, .09));
    const html = c.words.map(w => {
      const vis = !reveal || t >= w.s - .02, wo = vis ? (reveal ? E.outCubic(prog(t, w.s - .02, .1)) : 1) : 0;
      const txt = esc(w.w);
      return (w.hl ? `<b style="color:${p.gold};font-weight:inherit;opacity:${f3(wo)}">${txt}</b>` : `<span style="opacity:${f3(wo)}">${txt}</span>`) + (w.br ? '<br>' : ' ');
    }).join('');
    return `<div id="cap" class="keynote"${cidOf(c)} style="top:${c.y ?? 1010}px;left:${x - W / 2}px;right:${W / 2 - x}px;display:flex;justify-content:center;opacity:${f3(a)};text-shadow:none">
      <div style="max-width:${Math.round(610 * size / 44)}px;padding:${(size * .27).toFixed(1)}px ${(size * .59).toFixed(1)}px;border-radius:${(size * .36).toFixed(1)}px;background:rgba(9,9,12,.60);
        color:${c.color || p.white};font-family:${c.font || p.font};font-weight:${c.weight || 700};font-size:${size}px;line-height:1.24;text-align:center;letter-spacing:-.005em;
        text-shadow:0 2px 12px rgba(0,0,0,.6)">${html.trim()}</div></div>`;
  };

  // ---------- Studio menu + starter recipe ----------
  PACKS.push({
    id: P, name: 'Keynote thuyết trình', icon: '🟨',
    desc: 'Nền đen ấm lưới mờ + quầng vàng, mặt trong thẻ bo góc đổi khung, phụ đề nền tối từ khoá vàng, đồ hoạ UI dựng dần theo lời',
    caption: P,
    items: [
      { type: 'keynote_frame', label: 'Khung thẻ video (đổi khung)', make: T => ({ type: 'keynote_frame', t0: T, t1: T + 8, shots: [{ t: T, preset: 'hero' }, { t: T + 4, preset: 'tall' }] }) },
      { type: 'keynote_tag', label: 'Nhãn chương', make: T => ({ type: 'keynote_tag', t0: T, t1: T + 4, text: 'Người làm văn phòng', x: 360, y: 715, size: 18 }) },
      { type: 'keynote_rows', label: 'Danh sách thẻ', make: T => ({ type: 'keynote_rows', t0: T, t1: T + 5, x: 360, y: 840, size: 26, stagger: .9, items: [{ text: 'Báo cáo', icon: 'doc' }, { text: 'Nội dung', icon: 'folder' }, { text: 'Thuyết trình', icon: 'laptop' }], active: [{ t: T + 2.9, i: 2 }] }) },
      { type: 'keynote_chips', label: 'Hàng chip / câu hỏi / mũi tên', make: T => ({ type: 'keynote_chips', t0: T, t1: T + 4, x: 360, y: 760, size: 20, mode: 'question', stagger: .9, items: ['Kiếm được tiền', 'Dòng thu nhập'] }) },
      { type: 'keynote_bigtype', label: 'Chữ lớn / lockup', make: T => ({ type: 'keynote_bigtype', t0: T, t1: T + 3.5, x: 360, y: 830, size: 96, kicker: 'Chỉ cần', big: '1 phút', count: true, sub: 'là bạn |nắm được hết|' }) },
      { type: 'keynote_steps', label: 'Lộ trình đánh số', make: T => ({ type: 'keynote_steps', t0: T, t1: T + 4, x: 360, y: 800, size: 17, stagger: .8, items: ['Tối 1', 'Tối 2', 'Tối 3'] }) },
      { type: 'keynote_chart', label: 'Biểu đồ đi lên', make: T => ({ type: 'keynote_chart', t0: T, t1: T + 4, x: 360, y: 830, size: 22, kicker: 'Tăng đều', label: 'Lượt view', value: '+320%' }) },
      { type: 'keynote_gridfill', label: 'Lưới ô + đếm số', make: T => ({ type: 'keynote_gridfill', t0: T, t1: T + 4, x: 360, y: 830, size: 40, kicker: 'Nhân bản', unit: 'kênh', total: 18, count: 12 }) },
      { type: 'keynote_myth', label: 'Gạch bỏ hiểu lầm', make: T => ({ type: 'keynote_myth', t0: T, t1: T + 3.5, x: 360, y: 830, size: 24, text: 'Muốn dùng AI phải giỏi công nghệ', strike_at: T + 1.4 }) },
      { type: 'keynote_cta', label: 'Nút kêu gọi', make: T => ({ type: 'keynote_cta', t0: T, t1: T + 3, x: 360, y: 880, size: 31, text: 'ĐĂNG KÝ NGAY', sub: 'Link ngay bên dưới · miễn phí' }) },
    ],
    // Starter edit: card re-frames every ~6 s, intro bigtype, keyword chips/myth on spoken cues, CTA at the end.
    recipe: ctx => {
      const dur = ctx.dur, caps = ctx.captions || [], scenes = [];
      const hlw = caps.flatMap(c => c.words.filter(w => w.hl)).map(w => ({ w: w.w.replace(/[.,!?]/g, ''), s: w.s }));
      const ctaT = Math.max(2.5, dur - 3);
      const cycle = ['hero', 'tall', 'hero-low', 'tall'], shots = [];
      for (let i = 0, tt = 0; tt < ctaT - 1.5; i++, tt += 6.5) shots.push({ t: +tt.toFixed(2), preset: cycle[i % cycle.length] });
      shots.push({ t: +ctaT.toFixed(2), preset: 'full' });
      scenes.push({ type: 'keynote_frame', t0: 0, t1: dur, shots });
      const zoneY = p => (p === 'hero' ? 840 : p === 'hero-low' ? 170 : 85);
      const shotAt = tt => shots.filter(s => s.t <= tt + 1e-3).pop().preset;
      // Intro
      const title = ctx.title || (hlw[0] && hlw[0].w.toUpperCase()) || (ctx.brand && ctx.brand.name) || 'AI';
      scenes.push({ type: 'keynote_bigtype', t0: .3, t1: Math.min(3, shots[1] ? shots[1].t : 3), x: 360, y: 830, size: 88, kicker: 'Hôm nay', big: title });
      // Spoken cues → graphics (only where the card leaves room)
      const used = [];
      const free = (a, b) => !used.some(([x, y]) => a < y && b > x);
      // A graphic lives only inside one shot (never across a re-frame) and never overlaps another graphic.
      const place = (tt, len, mk, only) => {
        const p = shotAt(tt), nx = (shots.find(s => s.t > tt + 1e-3) || { t: ctaT }).t, end = Math.min(tt + len, nx - .05, ctaT);
        if (p === 'full' || p === 'tall-low' || (only && !only.includes(p)) || end - tt < 1.5 || !free(tt, end)) return;
        used.push([tt, end]); scenes.push(mk(p, +end.toFixed(2)));
      };
      const neg = findWord(caps, ['không tin', 'sai lầm', 'lầm tưởng', 'không phải'], 3);
      if (neg != null) { const t0 = Math.max(3, neg - 1.2); place(t0, 3, (p, e) => ({ type: 'keynote_myth', t0: +t0.toFixed(2), t1: e, strike_at: +Math.min(neg, e - .6).toFixed(2), x: 360, y: zoneY(p), size: 30, text: 'Chuyện này chỉ có trong phim' })); }
      const kws = hlw.filter(w => w.s > 3);
      if (kws.length) { const t0 = Math.max(3, kws[0].s - .1); place(t0, 4, (p, e) => ({ type: 'keynote_chips', t0: +t0.toFixed(2), t1: e, x: 360, y: zoneY(p), size: 20, stagger: .7, items: kws.slice(0, 3).map(w => w.w) })); }
      const growth = findWord(caps, ['tăng', 'tăng trưởng', 'doanh thu', 'lượt xem', 'cải thiện'], 3);
      if (growth != null) place(growth, 3.5, (p, e) => ({ type: 'keynote_chart', t0: +growth.toFixed(2), t1: e, x: 360, y: p === 'hero' ? 840 : 165, size: 22, kicker: 'Tăng đều', label: 'Xu hướng', value: '↑' }), ['hero', 'hero-low']);
      const handle = ctx.brand && (ctx.brand.handle || ctx.brand.website);
      scenes.push({ type: 'keynote_cta', t0: +ctaT.toFixed(2), t1: dur, x: 360, y: 870, size: 31, text: 'THEO DÕI NGAY', sub: handle ? String(handle) : 'Để không bỏ lỡ video tiếp theo' });
      return { caption_style: P, music: 'corporate', scenes };
    },
  });
})();
