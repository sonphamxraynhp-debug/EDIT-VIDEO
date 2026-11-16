// Pack "podcast" — port of skill video-edit-ai-podcast ("AI Dark Keynote"): warm-black canvas with a faint 90px grid and
// two gold glows, the talking head in a rounded card that changes framing at each new idea, gold keynote blocks built
// up one element at a time, and a dark-plate karaoke caption (spoken word turns gold). Spec: references/pack-podcast.md.
(() => {
  const P = 'podcast';
  // Source palettes (edit-presets.md). Pick with TL.podcast_theme or scene.theme; TL.brand.primary / scene.color override the gold.
  const THEMES = {
    gold: { gold: '#F7D33B', bright: '#FFF160', ink: '#0F0E0C', card: '#1F1C13', white: '#F4F2E5', on: '#0B0A08', line: 'rgba(255,241,150,.14)', glow: [150, 132, 40], gridc: 'rgba(150,145,120,.10)' },
    blue: { gold: '#4DA3FF', bright: '#8FC7FF', ink: '#080B10', card: '#121A26', white: '#EEF3FA', on: '#060A12', line: 'rgba(143,199,255,.16)', glow: [40, 90, 170], gridc: 'rgba(120,140,170,.10)' },
    red: { gold: '#FF6B35', bright: '#FFA173', ink: '#0E0907', card: '#231411', white: '#F7EEE8', on: '#140804', line: 'rgba(255,161,115,.16)', glow: [150, 60, 30], gridc: 'rgba(170,130,120,.10)' },
    green: { gold: '#4ADE80', bright: '#8FF0B4', ink: '#070C09', card: '#101C15', white: '#EEF6F0', on: '#06110A', line: 'rgba(143,240,180,.15)', glow: [40, 140, 80], gridc: 'rgba(120,160,135,.10)' },
    cinematic: { gold: '#E7B66B', bright: '#F6D7A4', ink: '#090909', card: '#191714', white: '#F3EEE6', on: '#0B0906', line: 'rgba(246,215,164,.14)', glow: [140, 100, 50], gridc: 'rgba(150,140,125,.09)' },
    white: { gold: '#2457FF', bright: '#2457FF', ink: '#F7F8FC', card: '#FFFFFF', white: '#101522', on: '#FFFFFF', line: 'rgba(16,21,34,.10)', glow: [120, 150, 255], gridc: 'rgba(16,21,34,.06)' },
  };
  const pal = (s = {}) => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    const th = THEMES[s.theme || TL.podcast_theme] || THEMES.gold;
    const over = s.color || b.primary;
    const gold = over || th.gold;
    return {
      ...th, gold, bright: over ? `color-mix(in srgb,${gold} 60%,#fff)` : th.bright,
      a: p => `color-mix(in srgb,${gold} ${p}%,transparent)`,
      font: s.font || b.font || "'Be Vietnam Pro',var(--sans)", danger: '#FF4D3D',
    };
  };
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const hl = (v, c) => esc(v).replace(/\|([^|]+)\|/g, `<b style="color:${c.gold};font-weight:inherit">$1</b>`);

  // Source icon set (overlay_engine.html). Anything else: 'si:<slug>', emoji or image path via slIcon().
  const ICONS = {
    doc: 'M6 3h8l4 4v14H6z M14 3v4h4', img: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6', vid: 'M3 6h13v12H3z M16 10l5-3v10l-5-3',
    chart: 'M4 19h16 M6 15l4-5 3 3 5-7', clock: 'M12 3a9 9 0 100 18 9 9 0 000-18 M12 7v5l3 2', bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8 M4 21c0-4 4-6 8-6s8 2 8 6', shop: 'M4 8h16l-1 12H5z M8 8V6a4 4 0 018 0v2',
    link: 'M9 15l6-6 M10 6h5a4 4 0 010 8h-2 M14 18H9a4 4 0 010-8h2', check: 'M4 12l5 5L20 6', folder: 'M3 7h6l2 3h10v10H3z',
    phone: 'M8 2h8v20H8z M11 19h2', laptop: 'M4 5h16v11H4z M2 19h20',
    spark: 'M12 3v6 M12 15v6 M3 12h6 M15 12h6 M6 6l3 3 M15 15l3 3 M18 6l-3 3 M9 15l-3 3',
    gear: 'M12 9a3 3 0 100 6 3 3 0 000-6 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2',
    mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3 M5 11a7 7 0 0014 0 M12 18v3',
    alert: 'M12 3l10 18H2z M12 10v5 M12 18v.5',
  };
  const ico = (k, sz, col, sw = 1.9) => {
    if (k && (k.startsWith('si:') || !ICONS[k] && k.length <= 4 || /\.(png|jpe?g|webp|svg|gif)$/i.test(k))) return slIcon(k, sz, 'white');
    return `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" style="display:block;fill:none;stroke:${col};stroke-width:${sw};stroke-linecap:round;stroke-linejoin:round"><path d="${ICONS[k] || ICONS.doc}"/></svg>`;
  };

  // Motion (design-system.md): block in .30 s outCubic rising 16px; out .22 s rising 8px (finishes at t1);
  // child items .26 s, 12px, scale .94→1, `stagger` s apart.
  const blockMotion = (s, t) => {
    const k = E.outCubic(prog(t, s.t0, s.dur_in ?? .3));
    const ko = s.keep ? 0 : prog(t, s.t1 - .22, .22);
    return { o: k * (1 - ko), dy: (1 - k) * 16 - ko * 8 };
  };
  const item = (t, at) => {
    const k = E.outCubic(prog(t, at, .26));
    return `opacity:${k.toFixed(3)};transform:translateY(${((1 - k) * 12).toFixed(1)}px) scale(${(.94 + .06 * k).toFixed(3)})`;
  };
  // Root element: centred on (x, y); `size` = base font size, inner sizes are in em.
  const root = (s, t, def, inner, extra = '') => {
    const [W, H] = DIMS();
    const m = blockMotion(s, t), c = pal(s);
    // Landscape default: graphics on the right half (hero card sits left), y scaled from the 1280 design.
    const v = VERT();
    const x = s.x ?? (v ? W / 2 : 940), y = s.y ?? (v ? def.y ?? H / 2 : def.yh ?? Math.round((def.y ?? 640) * 600 / 1280 + 20)), size = s.size || def.size;
    const w = s.w === 'auto' || (s.w == null && def.w == null) ? 'max-content' : `${s.w ?? def.w}px`;
    return `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:${w};font-family:${c.font};font-size:${size}px;color:${c.white};
      transform:translate(-50%,-50%) translateY(${m.dy.toFixed(1)}px);opacity:${m.o.toFixed(3)};${extra}">${inner}</div>`;
  };
  const stg = (s, i) => s.t0 + (s.delay ?? 0) + i * (s.stagger ?? .55);

  // ---------- framing presets (design-system.md) ----------
  const FR_V = {
    full: [0, 0, 720, 1280, 0], tall: [68, 150, 584, 880, 44], 'tall-low': [68, 300, 584, 760, 44],
    hero: [68, 80, 584, 584, 40], 'hero-low': [68, 330, 584, 584, 40], mid: [170, 430, 380, 470, 34],
    'mini-left': [68, 560, 210, 280, 26], 'mini-center': [255, 560, 210, 280, 26], 'mini-right': [442, 560, 210, 280, 26],
  };
  // Landscape: card on the left/right half, graphics on the other side.
  const FR_H = {
    full: [0, 0, 1280, 720, 0], tall: [60, 60, 560, 600, 36], 'tall-low': [660, 60, 560, 600, 36],
    hero: [60, 90, 540, 540, 36], 'hero-low': [680, 90, 540, 540, 36], mid: [420, 110, 440, 500, 30],
    'mini-left': [60, 220, 220, 280, 24], 'mini-center': [530, 220, 220, 280, 24], 'mini-right': [1000, 220, 220, 280, 24],
  };
  const frameRect = f => {
    const base = (VERT() ? FR_V : FR_H)[f.preset || 'hero'] || FR_V.hero;
    return { x: f.x ?? base[0], y: f.y ?? base[1], w: f.w ?? base[2], h: f.h ?? base[3], r: f.r ?? base[4], pan_y: f.pan_y ?? .42, zoom: f.zoom ?? 1 };
  };

  function bg(c, s) {
    const [g1, g2] = s.glows || [[.28, .20, .55, 74], [.86, .78, .45, 40]];
    const [W] = DIMS(), [r, g, b] = c.glow, grid = s.grid ?? 90;
    const glow = ([x, y, rad, a]) => `radial-gradient(circle ${Math.round(rad * W)}px at ${x * 100}% ${y * 100}%,rgba(${r},${g},${b},${(a / 255).toFixed(3)}),transparent 100%)`;
    const gridImg = grid ? `,linear-gradient(${c.gridc} 1px,transparent 1px),linear-gradient(90deg,${c.gridc} 1px,transparent 1px)` : '';
    return `<div class="full" style="background-color:${c.ink};background-image:${glow(g1)},${glow(g2)}${gridImg};
      background-size:100% 100%,100% 100%${grid ? `,${grid}px ${grid}px,${grid}px ${grid}px` : ''};background-position:0 0,0 0,-1px -1px,-1px -1px"></div>`;
  }

  const MODS = {
    // 1. Canvas + video card. framing: [{t (absolute), preset | x,y,w,h,r, pan_y, zoom}] — morphs between frames in `morph` s.
    podcast_frame(s, t, lt) {
      const c = pal(s);
      const keys = (s.framing && s.framing.length ? s.framing : [{ t: s.t0, preset: s.preset || 'hero' }]).slice().sort((a, b) => a.t - b.t);
      let i = 0;
      for (let j = 0; j < keys.length; j++) if (t >= keys[j].t) i = j;
      let R = frameRect(keys[i]);
      const md = s.morph ?? .35;
      if (i > 0 && md > 0 && t < keys[i].t + md) {
        const A = frameRect(keys[i - 1]), k = E.inOutSine(prog(t, keys[i].t, md));
        R = Object.fromEntries(Object.keys(R).map(n => [n, lerp(A[n], R[n], k)]));
      }
      if (s.card) R = { ...R, ...s.card };
      const en = E.outCubic(prog(lt, 0, .35));
      const sc = s.enter === 'cut' ? 1 : lerp(.94, 1, en);
      const drift = 1 + (s.drift === false ? 0 : .02 * prog(t, keys[i].t, 8));
      const full = R.w >= DIMS()[0] - 1 && R.r < 1;
      const vid = TL.aroll
        ? `<img src="${url(fmtSeq(TL.aroll.frames, frameAt(t)))}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% ${(R.pan_y * 100).toFixed(1)}%;
            filter:${arollFilter(t)};transform:scale(${(R.zoom * drift).toFixed(4)});transform-origin:50% ${(R.pan_y * 100).toFixed(1)}%">`
        : `<div class="full" style="background:${c.card}"></div>`;
      const edge = full || s.no_frame ? '' : `border:1px solid ${c.line};box-shadow:0 0 70px ${c.a(10)},0 18px 60px rgba(0,0,0,.55);`;
      const card = `<div class="abs"${cidOf(s)} style="left:${R.x.toFixed(1)}px;top:${R.y.toFixed(1)}px;width:${R.w.toFixed(1)}px;height:${R.h.toFixed(1)}px;border-radius:${R.r.toFixed(1)}px;
        overflow:hidden;${edge}transform:scale(${sc.toFixed(4)});opacity:${s.enter === 'cut' ? 1 : en.toFixed(3)}">${vid}</div>`;
      return { back: bg(c, s) + card, cover: true };
    },

    // 2. Chapter tag pill (gold outline + dot). variant: 'tag' | 'solid' (gold summary pill) | 'ghost'; sub = small 2nd line.
    podcast_tag(s, t) {
      const c = pal(s), v = s.variant || 'tag';
      let inner;
      if (v === 'tag') {
        inner = `<span style="display:inline-flex;align-items:center;gap:.5em;padding:.5em 1.1em;border:1.5px solid ${c.gold};border-radius:999px;background:${c.a(7)};
          color:${c.bright};font-weight:800;letter-spacing:.13em;text-transform:uppercase;white-space:nowrap;box-shadow:0 0 26px ${c.a(16)}">
          <i style="width:.45em;height:.45em;border-radius:50%;background:${c.gold};display:block;box-shadow:0 0 10px ${c.gold}"></i>${esc(s.text)}</span>`;
      } else {
        const solid = v === 'solid';
        inner = `<span style="display:inline-flex;flex-direction:column;align-items:center;padding:.5em 1em;border-radius:999px;font-weight:800;white-space:nowrap;
          ${solid ? `background:${c.gold};color:${c.on};box-shadow:0 0 34px ${c.a(34)}` : `background:${c.a(10)};color:${c.bright};border:1.5px solid ${c.gold}`}">${esc(s.text)}
          ${s.sub ? `<small style="display:block;font-weight:500;font-size:.6em;opacity:.72;letter-spacing:.04em">${esc(s.sub)}</small>` : ''}</span>`;
      }
      return { front: root(s, t, { y: v === 'tag' ? 70 : 900, yh: v === 'tag' ? 90 : 480, size: v === 'tag' ? 18 : 22 }, inner) };
    },

    // 3. Horizontal chips appearing one by one. mode: 'plain' | 'q' (gold "?") | 'icon' (icon tiles) | 'flow' (ghost pills joined by arrows).
    podcast_chips(s, t) {
      const c = pal(s), mode = s.mode || 'plain', items = s.items || [];
      const chip = (it, i) => {
        const o = typeof it === 'string' ? { text: it } : it;
        const at = stg(s, i);
        if (mode === 'flow') return `<span${cidOf(o)} style="display:inline-flex;padding:.5em 1em;border-radius:999px;background:${c.a(10)};color:${c.bright};border:1.5px solid ${c.gold};
          font-weight:800;white-space:nowrap;${item(t, at)}">${esc(o.text)}</span>`;
        if (mode === 'icon') return `<span${cidOf(o)} style="display:inline-flex;padding:.45em;border-radius:.7em;background:${c.card};border:1px solid ${c.line};${item(t, at)}">${ico(o.icon || o.text, Math.round((s.size || 20) * 1.5), c.gold)}</span>`;
        return `<span${cidOf(o)} style="display:inline-flex;align-items:center;gap:.4em;padding:.5em .8em;border-radius:.7em;background:${c.card};border:1px solid ${c.line};
          font-weight:600;white-space:nowrap;${item(t, at)}">${o.icon ? ico(o.icon, Math.round((s.size || 20) * 1.1), c.gold) : ''}${esc(o.text)}${mode === 'q' ? `<b style="color:${c.gold};font-weight:800;margin-left:.15em">?</b>` : ''}</span>`;
      };
      const arrow = i => `<span style="width:1.1em;height:2px;background:${c.a(55)};position:relative;flex:0 0 1.1em;${item(t, stg(s, i) - (s.stagger ?? .55) * .4)}">
        <i style="position:absolute;right:-1px;top:-4px;border-left:7px solid ${c.a(80)};border-top:5px solid transparent;border-bottom:5px solid transparent"></i></span>`;
      const parts = [];
      items.forEach((it, i) => { if (mode === 'flow' && i) parts.push(arrow(i)); parts.push(chip(it, i)); });
      return { front: root(s, t, { y: 760, yh: 400, size: 20 }, `<div style="display:flex;align-items:center;justify-content:center;flex-wrap:${mode === 'flow' ? 'nowrap' : 'wrap'};gap:${mode === 'flow' ? '.5em' : '.5em'}">${parts.join('')}</div>`, `max-width:${DIMS()[0] - 100}px`) };
    },

    // 4. Vertical card list with icons — the workhorse. active: index (or [{t, v}] absolute keys) turns one row gold.
    podcast_rows(s, t) {
      const c = pal(s), items = s.items || [];
      const act = Array.isArray(s.active) ? s.active.reduce((a, k) => (t >= k.t ? k.v : a), -1) : s.active ?? -1;
      const rows = items.map((it, i) => {
        const o = typeof it === 'string' ? { text: it } : it;
        const on = Math.round(act) === i;
        return `<div${cidOf(o)} style="display:flex;align-items:center;gap:.55em;height:2.4em;padding:0 .7em;border-radius:.7em;font-weight:600;white-space:nowrap;
          background:${on ? c.gold : c.card};border:1px solid ${on ? c.gold : c.line};color:${on ? c.on : c.white};${on ? `box-shadow:0 0 34px ${c.a(34)};` : ''}${item(t, stg(s, i))}">
          <span style="width:1.46em;height:1.46em;border-radius:.46em;background:${on ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.06)'};display:flex;align-items:center;justify-content:center;flex:0 0 1.46em">${ico(o.icon || 'doc', Math.round((s.size || 26) * .78), on ? c.on : c.gold)}</span>
          <span style="overflow:hidden;text-overflow:ellipsis">${esc(o.text)}</span>
          ${on ? `<span style="margin-left:auto;display:flex;align-items:center;gap:.4em"><span style="width:3.7em;height:4px;border-radius:2px;background:rgba(0,0,0,.35)"></span>${ico('chart', Math.round((s.size || 26) * .8), c.on, 2.2)}</span>` : ''}</div>`;
      }).join('');
      return { front: root(s, t, { y: 840, yh: 380, size: 26, w: 584 }, `<div style="display:flex;flex-direction:column;gap:.31em">${rows}</div>`) };
    },

    // 5. Big number / keyword: kicker + huge gold word + sub (|…| = gold).
    podcast_bigtype(s, t, lt) {
      const c = pal(s), sz = s.size || 96;
      const pop = lerp(.86, 1, E.outBack(prog(lt, .08, .4), 1.6));
      const inner = `<div style="text-align:center">
        ${s.kicker ? `<div style="color:${c.gold};font-weight:800;font-size:${(19 / 96).toFixed(3)}em;letter-spacing:.24em;text-transform:uppercase;margin-bottom:.2em">${esc(s.kicker)}</div>` : ''}
        <div style="color:${c.gold};font-weight:800;line-height:1;letter-spacing:-.02em;white-space:nowrap;text-shadow:0 0 42px ${c.a(45)};transform:scale(${pop.toFixed(3)})">${esc(s.big)}</div>
        ${s.sub ? `<div style="color:${c.white};font-weight:600;font-size:${(26 / 96).toFixed(3)}em;margin-top:.3em;opacity:.92;white-space:nowrap">${hl(s.sub, c)}</div>` : ''}</div>`;
      return { front: root(s, t, { y: 210, yh: 270, size: sz }, inner) };
    },

    // 6. Programme title lockup (use once): l1 small gold caps, l2 white, l3 big gold, gold rule drawing out.
    podcast_lockup(s, t, lt) {
      const c = pal(s), d = (s.stagger ?? .25);
      const k = n => item(t, s.t0 + n * d);
      const rk = E.outCubic(prog(lt, 3 * d, .45));
      const inner = `<div style="text-align:center;white-space:nowrap">
        <div style="color:${c.gold};font-weight:800;font-size:.357em;letter-spacing:.3em;text-transform:uppercase;${k(0)}">${esc(s.l1 || '')}</div>
        <div style="color:${c.white};font-weight:800;line-height:1.1;letter-spacing:.02em;margin-top:.1em;${k(1)}">${esc(s.l2 || '')}</div>
        <div style="color:${c.gold};font-weight:800;font-size:1.107em;line-height:1.05;text-shadow:0 0 44px ${c.a(50)};${k(2)}">${esc(s.l3 || '')}</div>
        <div style="height:5px;border-radius:3px;background:${c.gold};margin:.18em auto 0;box-shadow:0 0 26px ${c.a(60)};width:${((s.rule || 210) * rk).toFixed(1)}px"></div></div>`;
      return { front: root(s, t, { y: 210, yh: 270, size: 56 }, inner) };
    },

    // 7. Numbered roadmap: gold circles on a track, label under each.
    podcast_steps(s, t, lt) {
      const c = pal(s), items = s.items || [], n = items.length || 1;
      const tk = E.outCubic(prog(t, s.t0, (s.stagger ?? .55) * n));
      const inner = `<div style="position:relative;display:flex;align-items:flex-start;justify-content:space-between">
        <span style="position:absolute;top:1.12em;left:${50 / n}%;width:${(100 - 100 / n) * tk}%;height:2px;background:${c.a(35)}"></span>
        ${items.map((it, i) => {
          const o = typeof it === 'string' ? { text: it } : it;
          return `<span${cidOf(o)} style="display:flex;flex-direction:column;align-items:center;gap:.47em;flex:1;z-index:2;${item(t, stg(s, i))}">
            <span style="border-radius:50%;background:${c.gold};color:${c.on};font-weight:800;font-size:1.24em;width:1.8em;height:1.8em;display:flex;align-items:center;justify-content:center;box-shadow:0 0 24px ${c.a(42)}">${o.num ?? i + 1}</span>
            <span style="color:${c.white};font-weight:600;opacity:.88;text-align:center;white-space:nowrap">${esc(o.text)}</span></span>`;
        }).join('')}</div>`;
      return { front: root(s, t, { y: 944, yh: 520, size: 17, w: 584 }, inner) };
    },

    // 8. Illustrative chart card. kind 'line' (gold curve drawing on) | 'grid' (cells light up + counter: total, count, unit).
    podcast_chart(s, t, lt) {
      const c = pal(s), sz = s.size || 22, kind = s.kind || 'line', draw = s.draw ?? (kind === 'grid' ? 1.6 : 1.4);
      let body;
      if (kind === 'grid') {
        const k = prog(lt, .2, draw), total = s.total || 18, n = Math.round(k * total);
        const cells = Array.from({ length: total }, (_, i) => `<span style="aspect-ratio:1;border-radius:6px;${i < n ? `background:${c.gold};box-shadow:0 0 12px ${c.a(50)}` : 'background:rgba(255,255,255,.06)'}"></span>`).join('');
        body = `<div style="display:flex;align-items:center;gap:.7em">
          <div style="min-width:6.8em;font-weight:800;font-size:1.82em;line-height:1;color:${c.white};white-space:nowrap">
            <em style="display:block;font-style:normal;color:${c.gold};font-size:.35em;letter-spacing:.2em;text-transform:uppercase;margin-bottom:.3em">${esc(s.kicker || '')}</em>
            ${Math.round(k * (s.count ?? total))}${s.suffix || ''} <span style="font-size:.5em;font-weight:700">${esc(s.unit || '')}</span></div>
          <div style="display:grid;grid-template-columns:repeat(${s.cols || 6},1fr);gap:6px;flex:1">${cells}</div></div>`;
      } else {
        const k = E.outCubic(prog(lt, .15, draw)), cid = String(s.cid || s.t0).replace(/\W/g, '_');
        const d = s.path || 'M6 82 C60 78 90 62 130 56 C175 49 210 30 292 8';
        body = `<div style="color:${c.gold};font-weight:800;font-size:.68em;letter-spacing:.18em;text-transform:uppercase;margin-bottom:.1em">${esc(s.kicker || '')}</div>
          <div style="color:${c.white};font-weight:600;margin-bottom:.3em;white-space:nowrap">${esc(s.label || '')}</div>
          <svg viewBox="0 0 300 90" preserveAspectRatio="none" style="display:block;width:100%;height:${s.h || 90}px;overflow:visible">
            <defs><clipPath id="pc${cid}"><rect x="0" y="-10" width="${(k * 300).toFixed(1)}" height="110"/></clipPath></defs>
            <path d="${d} L292 90 L6 90 Z" fill="${c.a(12)}" stroke="none" clip-path="url(#pc${cid})"/>
            <path d="${d}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${(1 - k).toFixed(4)}" fill="none" stroke="${c.gold}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 8px ${c.a(55)})"/></svg>`;
      }
      return { front: root(s, t, { y: 840, yh: 380, size: sz, w: 584 }, kind === 'grid' ? `<div style="padding:.7em .8em;border-radius:20px;background:${c.card};border:1px solid ${c.line}">${body}</div>`
        : `<div style="padding:.72em .82em;border-radius:20px;background:${c.card};border:1px solid ${c.line}">${body}</div>`) };
    },

    // 9. Myth busted: a false belief card, a red line strikes through `strike` s after t0, text dims.
    podcast_myth(s, t, lt) {
      const c = pal(s), k = E.outCubic(prog(lt, s.strike ?? 1.2, .45));
      const inner = `<span style="position:relative;display:inline-flex;align-items:center;gap:.5em;padding:.5em .85em;border-radius:.67em;background:${c.card};border:1px solid ${c.line};
          font-weight:600;white-space:nowrap;color:${k > .9 ? 'rgba(244,242,229,.42)' : c.white}">
          <span style="color:${c.danger};font-weight:800;opacity:${k.toFixed(2)};width:${(k * .9).toFixed(2)}em;overflow:hidden">✕</span>${esc(s.text)}
          <span style="position:absolute;left:.65em;top:50%;height:3px;width:calc((100% - 1.3em) * ${k.toFixed(4)});background:${c.danger};border-radius:2px;box-shadow:0 0 14px rgba(255,77,61,.8)"></span></span>`;
      return { front: root(s, t, { y: 740, yh: 360, size: 24 }, inner) };
    },

    // 10. CTA button + sub line (end of video).
    podcast_cta(s, t, lt) {
      const c = pal(s), pulse = 1 + .025 * Math.sin(Math.max(0, lt - .4) * 5.5);
      const inner = `<div style="display:flex;flex-direction:column;align-items:center;gap:.26em">
        <span style="display:inline-flex;align-items:center;gap:.4em;padding:.52em 1.3em;border-radius:999px;background:${c.gold};color:${c.on};font-weight:800;letter-spacing:.02em;white-space:nowrap;
          box-shadow:0 0 48px ${c.a(42)};transform:scale(${pulse.toFixed(4)})">${ico(s.icon || 'link', Math.round((s.size || 31) * .78), c.on, 2.2)}${esc(s.text || 'ĐĂNG KÝ NGAY')}</span>
        ${s.sub ? `<span style="color:${c.bright};font-weight:500;font-size:.58em;opacity:.85;white-space:nowrap">${esc(s.sub)}</span>` : ''}</div>`;
      return { front: root(s, t, { y: 880, yh: 470, size: 31 }, inner) };
    },
  };
  Object.assign(MODULES, MODS);

  // Caption: dark rounded plate, cream 44px/700; the word being spoken turns gold; hl words stay gold with a small pop.
  CAPTION_STYLES.podcast = (c, t) => {
    const p = pal(c), [W] = DIMS(), v = VERT();
    const x = c.x ?? W / 2, y = c.y ?? (v ? 1058 : 668), size = c.size || (v ? 44 : 34);
    let cur = -1;
    c.words.forEach((w, i) => { if (t >= w.s) cur = i; });
    const html = c.words.map((w, i) => {
      const on = i === cur && t < (w.e ?? w.s + .35) + .08;
      const col = w.hl || on ? p.gold : (c.color || p.white);
      const sc = w.hl ? lerp(.82, 1, E.outBack(prog(t, w.s - .02, .24), 2)) : 1;
      return `<span style="display:inline-block;color:${col};${w.hl ? `transform:scale(${sc.toFixed(3)});text-shadow:0 0 18px ${p.a(45)},0 2px 12px rgba(0,0,0,.6);` : ''}">${esc(w.w)}</span>${w.br ? '<br>' : ' '}`;
    }).join('');
    const o = clamp(prog(t, c.t0, .09));
    return `<div id="cap" class="podcast"${cidOf(c)} style="top:${y}px;left:${x - W / 2}px;right:${W / 2 - x}px;transform:translateY(-50%);display:flex;justify-content:center;opacity:${o.toFixed(3)};text-shadow:none">
      <div style="max-width:${v ? 610 : 1100}px;padding:12px 26px;border-radius:16px;background:rgba(9,9,12,.60);font-family:${c.font || p.font};font-weight:${c.weight || 700};
        font-size:${size}px;line-height:1.24;text-align:center;color:${p.white};text-shadow:0 2px 12px rgba(0,0,0,.6)">${html}</div></div>`;
  };

  // ---------- Studio metadata ----------
  // Default position for new items: centre column (vertical) or right half (landscape, card on the left).
  const XY = y => (VERT() ? { x: 360, y } : { x: 940, y: Math.round(y * 600 / 1280 + 20) });
  PACKS.push({
    id: P, name: 'Podcast / phỏng vấn', icon: '🎙️', caption: 'podcast',
    desc: 'Nền đen ấm lưới mờ + quầng vàng, người trong thẻ bo góc đổi khung theo ý, khối keynote vàng dựng dần, phụ đề tấm tối chữ vàng theo lời',
    items: [
      { type: 'podcast_frame', label: 'Khung nền + thẻ video', make: T => ({ type: 'podcast_frame', t0: T, t1: T + 8, framing: [{ t: T, preset: 'hero' }] }) },
      { type: 'podcast_tag', label: 'Nhãn chương', make: T => ({ type: 'podcast_tag', t0: T, t1: T + 4, text: 'Chủ đề hôm nay', ...XY(710), size: 18 }) },
      { type: 'podcast_chips', label: 'Hàng thẻ / câu hỏi / chuỗi', make: T => ({ type: 'podcast_chips', t0: T, t1: T + 4, mode: 'plain', items: ['Ý một', 'Ý hai', 'Ý ba'], stagger: .7, ...XY(760), size: 20 }) },
      { type: 'podcast_rows', label: 'Danh sách thẻ dọc', make: T => ({ type: 'podcast_rows', t0: T, t1: T + 5, stagger: 1, items: [{ text: 'Nội dung', icon: 'doc' }, { text: 'Hình ảnh', icon: 'img' }, { text: 'Video', icon: 'vid' }], active: [{ t: T + 2.2, v: 2 }], ...XY(790), w: 584, size: 26 }) },
      { type: 'podcast_bigtype', label: 'Số / chữ lớn', make: T => ({ type: 'podcast_bigtype', t0: T, t1: T + 3, kicker: 'Chỉ cần', big: '1 phút', sub: 'xem hết |video này|', ...XY(820), size: 96 }) },
      { type: 'podcast_lockup', label: 'Cụm tiêu đề chương trình', make: T => ({ type: 'podcast_lockup', t0: T, t1: T + 4, l1: 'Chương trình', l2: 'PODCAST', l3: 'TẬP MỚI', rule: 210, ...XY(820), size: 56 }) },
      { type: 'podcast_steps', label: 'Lộ trình đánh số', make: T => ({ type: 'podcast_steps', t0: T, t1: T + 4, items: ['Bước 1', 'Bước 2', 'Bước 3'], stagger: .6, ...XY(840), w: 584, size: 17 }) },
      { type: 'podcast_chart', label: 'Biểu đồ / lưới đếm', make: T => ({ type: 'podcast_chart', t0: T, t1: T + 4, kind: 'line', kicker: 'Tăng đều', label: 'Lượt nghe', ...XY(830), w: 584, size: 22 }) },
      { type: 'podcast_myth', label: 'Gạch bỏ hiểu lầm', make: T => ({ type: 'podcast_myth', t0: T, t1: T + 3, text: 'Muốn dùng AI phải giỏi công nghệ', strike: 1.2, ...XY(760), size: 24 }) },
      { type: 'podcast_cta', label: 'Nút kêu gọi', make: T => ({ type: 'podcast_cta', t0: T, t1: T + 3, text: 'NGHE TẬP ĐẦY ĐỦ', sub: 'Link ngay bên dưới', ...XY(840), size: 31 }) },
    ],
    // Starter edit: frame for the whole video (framing alternates every ~7 s at idea breaks), intro tag + bigtype,
    // keyword-placed graphics in the free zone of the current framing, CTA at the end.
    recipe: ctx => {
      const dur = ctx.dur, v = ctx.vertical !== false, caps = ctx.captions || [];
      const cx = v ? 360 : 940;
      const scenes = [];
      // Change framing at caption boundaries closest to every ~7 s (never mid-sentence).
      const starts = caps.map(c => c.t0);
      const order = v ? ['hero-low', 'hero', 'tall', 'hero'] : ['hero', 'tall', 'hero', 'tall'];
      const framing = [{ t: 0, preset: order[0] }];
      for (let k = 7; k < dur - 4; k += 7) {
        const tt = starts.length ? starts.reduce((b, s) => (Math.abs(s - k) < Math.abs(b - k) ? s : b)) : k;
        if (tt - framing[framing.length - 1].t > 4) framing.push({ t: +tt.toFixed(2), preset: order[framing.length % order.length] });
      }
      const endT = Math.max(2.5, dur - 3);
      framing.push({ t: +endT.toFixed(2), preset: 'hero' });
      scenes.push({ type: 'podcast_frame', t0: 0, t1: dur, framing });
      const zone = tt => { let f = framing[0]; for (const x of framing) if (tt >= x.t) f = x; return f.preset; };
      // Free y for a block in the current framing (vertical): above the card for *-low, below for hero, else top band.
      const freeY = (tt, hgt) => {
        if (!v) return 300 + hgt / 2;
        const p = zone(tt);
        if (p === 'hero') return 680 + hgt / 2 + 20;
        if (p === 'hero-low' || p === 'tall-low') return Math.max(40 + hgt / 2, 180);
        return 60 + hgt / 2;
      };
      const firstEnd = Math.min(dur, framing[1]?.t ?? Math.min(dur, 6));
      scenes.push({ type: 'podcast_tag', t0: .2, t1: Math.min(firstEnd, 4.5), text: ctx.title || ctx.brand?.name || 'Tập mới', x: cx, y: v ? 66 : 110, size: 18 });
      const kw = caps.flatMap(c => c.words).find(w => w.hl) || null;
      if (kw && kw.s < firstEnd - 1.2) scenes.push({ type: 'podcast_bigtype', t0: kw.s, t1: firstEnd, kicker: 'điểm chính', big: kw.w.toUpperCase(), x: cx, y: v ? 205 : 250, size: 96 });
      const rules = [
        [['không phải', 'sai lầm', 'hiểu lầm', 'không tin'], (tt, end) => ({ type: 'podcast_myth', t0: tt - .4, t1: end, text: 'Điều nhiều người vẫn nghĩ', strike: .6, size: 24 }), 60],
        [['tăng', 'doanh thu', 'lượt xem', 'phát triển'], (tt, end) => ({ type: 'podcast_chart', t0: tt, t1: end, kind: 'line', kicker: 'Tăng trưởng', label: 'Theo thời gian', w: 584, size: 22 }), 180],
        [['bước', 'đầu tiên', 'thứ nhất', 'lộ trình'], (tt, end) => ({ type: 'podcast_steps', t0: tt, t1: end, items: ['Bước 1', 'Bước 2', 'Bước 3'], stagger: .8, w: 584, size: 17 }), 85],
        [['ai', 'công cụ', 'ứng dụng'], (tt, end) => ({ type: 'podcast_chips', t0: tt, t1: end, mode: 'icon', items: ['si:openai', 'si:claude', 'si:googlegemini'], stagger: .5, size: 20 }), 70],
      ];
      let after = 2.5;
      for (const [needles, mk, hgt] of rules) {
        const tt = findWord(caps, needles, after);
        if (tt == null || tt > endT - 2) continue;
        const end = Math.min(tt + 4.5, endT - .1, (framing.find(f => f.t > tt)?.t ?? dur) - .05);
        if (end - tt < 1.5) continue;
        scenes.push({ ...mk(tt, end), x: cx, y: freeY(tt, hgt) });
        after = end + .4;
      }
      scenes.push({ type: 'podcast_cta', t0: endT + .2, t1: dur, text: 'THEO DÕI NGAY', sub: ctx.brand?.handle || 'Tập mới mỗi tuần', x: cx, y: v ? 820 : 420, size: 31 });
      return { caption_style: 'podcast', music: 'corporate', scenes };
    },
  });
})();
