// Pack "neon" — port of the look of skill video-ai-caption-neon ("AI Caption Neon").
// Gradient wash (purple / pink) behind the speaker, punch framing that cuts every 1–2 s, scattered
// captions where keywords are 2× bigger, type on letter by letter and glow (pale core, saturated halo),
// keyword colour alternating yellow / pink per caption chunk, white flash with a negative frame, emoji
// bursts around a neon card, rolling counter, rounded logo chip, hand-drawn doodle. Spec: references/pack-neon.md.
(() => {
  const P = 'neon';
  // Palette measured from the reference video (references/design-system.md of the source skill).
  const N = {
    purple: ['#5F4DFC', '#9F6AFD'], pink: ['#C4226E', '#FE2B6D'], blue: ['#0B3E6F', '#1B6FB8'],
    dark: '#0C0422', yellow: '#FFFF6B', rose: '#FFBCFF', mint: '#7CF5D0', frame: '#B388FF', chip: '#0E0A18', pupil: '#FF2B6D',
  };
  // Pale core → saturated halo ("ruột nhạt, quầng đậm").
  const HALO = { '#FFFF6B': '#FFE11A', '#FFFB87': '#FFE11A', '#FFBCFF': '#BA50FF', '#FFBDFF': '#BA50FF', '#FFC2EA': '#FF4FB8', '#FFC2FF': '#BA50FF', '#7CF5D0': '#19D9A0' };
  const FONT = "'Be Vietnam Pro', var(--sans)";
  const DESIGN = () => (typeof DIMS === 'function' ? DIMS() : [720, 1280]);

  const hex6 = c => {
    if (typeof c !== 'string' || c[0] !== '#') return null;
    if (c.length === 4) return '#' + [...c.slice(1)].map(x => x + x).join('');
    return c.length === 7 ? c : null;
  };
  // Colour with alpha (0..1); non-hex colours are returned unchanged.
  const al = (c, a) => { const h = hex6(c); return h ? h + Math.round(clamp(a) * 255).toString(16).padStart(2, '0') : c; };
  const halo = c => HALO[(hex6(c) || '').toUpperCase()] || c;
  const glowShadow = (core, glow) => `0 0 10px ${al(glow, .95)},0 0 26px ${al(glow, .8)},0 0 58px ${al(glow, .45)},0 3px 14px rgba(0,0,0,.55)`;
  const WHITE_SHADOW = '0 2px 14px rgba(0,0,0,.62),0 0 3px rgba(0,0,0,.5)';
  // Deterministic noise: same seed → same layout, re-renders never jump.
  const nz = seed => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const back = k => E.outBack(clamp(k), 1.70158);
  // Keyword palette: brand accent/primary when the brand kit sets them, else yellow / pink from the reference.
  const keyPalette = () => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return b.accent ? [b.accent, b.primary || N.rose] : [N.yellow, N.rose];
  };
  // Width estimate for Be Vietnam Pro 700–800 (no DOM measuring: every frame is a pure string).
  function estW(text, size) {
    let w = 0;
    for (const ch of String(text)) {
      const b = ch.normalize('NFD')[0];
      if (b === ' ') w += .27;
      else if (/[iljtfr.,'!:;|1]/.test(b)) w += .36;
      else if (/[mwMW]/.test(b)) w += .9;
      else if (/[A-Z0-9]/.test(b)) w += .7;
      else w += .6;
    }
    return w * size;
  }

  // ---------- hand-drawn strokes (two-loop ellipse, strike, underline) ----------
  function doodlePath(kind, w, h) {
    if (kind === 'strike' || kind === 'underline') {
      const y = kind === 'strike' ? h / 2 : h - 6;
      return `M4 ${y + 5} C ${w * .28} ${y - 7}, ${w * .62} ${y + 8}, ${w - 4} ${y - 4}`;
    }
    const cx = w / 2, cy = h / 2, rx = w / 2 - 4, ry = h / 2 - 4;
    return `M ${cx - rx * .92} ${cy + ry * .30} C ${cx - rx * 1.06} ${cy - ry * .72}, ${cx - rx * .10} ${cy - ry * 1.06}, ${cx + rx * .72} ${cy - ry * .82}
      C ${cx + rx * 1.12} ${cy - ry * .64}, ${cx + rx * 1.10} ${cy + ry * .72}, ${cx + rx * .30} ${cy + ry * .92}
      C ${cx - rx * .62} ${cy + ry * 1.12}, ${cx - rx * 1.12} ${cy + ry * .34}, ${cx - rx * .80} ${cy - ry * .46}
      C ${cx - rx * .54} ${cy - ry * 1.02}, ${cx + rx * .52} ${cy - ry * 1.14}, ${cx + rx * 1.04} ${cy - ry * .34}`;
  }
  const doodleSVG = (kind, w, h, k, color = '#FFFFFF', width = 5) =>
    `<svg width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" style="display:block;overflow:visible">
      <path d="${doodlePath(kind, w, h)}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - k).toFixed(4)}" fill="none" stroke="${color}"
        stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 8px rgba(255,255,255,.5))"/></svg>`;

  // ---------- scattered caption block (shared by the caption style and neon_scatter) ----------
  // rows: [{ key, text, t }] — t = when the row appears. o: { cx, cy, small, key, color, hl, glow, seed, jitter, font, weight, doodle, cid, fade }
  function scatter(rows, t, o) {
    const [W] = DESIGN(), SAFE = 34, max = W - SAFE * 2, LEAD = -8;
    const laid = rows.map(r => {
      let fs = r.key ? o.key : o.small;
      const w0 = estW(r.text, fs);
      if (w0 > max) fs = Math.floor(fs * max / w0);
      return { ...r, fs, w: Math.min(max, estW(r.text, fs)), h: fs * (r.key ? 1.1 : 1.22) };
    });
    const total = laid.reduce((a, r) => a + r.h, 0) + (laid.length - 1) * LEAD;
    let y = o.cy - total / 2;
    const J = o.jitter ?? 150, dx = o.cx - W / 2;
    laid.forEach((r, i) => {
      const dir = i % 2 === 0 ? 1 : -1, amp = r.key ? J * .42 : J;
      const x = (W - r.w) / 2 + dir * (.35 + nz(o.seed + i)) * amp + dx;
      r.x = Math.round(clamp(x, SAFE, Math.max(SAFE, W - r.w - SAFE)));
      r.y = Math.round(y);
      y += r.h + LEAD;
    });
    const x0 = Math.min(...laid.map(r => r.x)), y0 = Math.min(...laid.map(r => r.y));
    const x1 = Math.max(...laid.map(r => r.x + r.w)), y1 = Math.max(...laid.map(r => r.y + r.h));
    const fade = o.fade ?? 1;
    let doo = '';
    const html = laid.map((r, i) => {
      const lt = t - r.t;
      if (lt < -.001) return '';
      const k = clamp(lt / .11);
      const sc = r.key ? .72 + .28 * back(lt / .2) : .9 + .1 * E.outCubic(k);
      let inner = esc(r.text);
      if (r.key && o.typeOn !== false) {
        const chars = [...r.text], kt = clamp(lt / (o.typeDur || .18));
        const cut = kt >= 1 ? chars.length : Math.max(1, Math.ceil(chars.length * kt));
        inner = esc(chars.slice(0, cut).join('')) + (cut < chars.length ? `<span style="opacity:0">${esc(chars.slice(cut).join(''))}</span>` : '');
      }
      const st = r.key
        ? `font-weight:800;color:${o.hl};text-shadow:${glowShadow(o.hl, o.glow)};letter-spacing:-.01em`
        : `font-weight:${o.weight || 700};color:${o.color || '#FFFFFF'};text-shadow:${WHITE_SHADOW}`;
      if (r.key && o.doodle && !doo) {
        const line = o.doodle === 'underline' || o.doodle === 'strike', padX = line ? 6 : Math.round(r.w * .07) + 20, padY = o.doodle === 'underline' ? Math.round(r.h * .08) : -Math.round(r.h * .1);
        const dk = E.outCubic(prog(t, r.t + .14, .34));
        if (dk > 0) doo = `<div style="position:absolute;left:${r.x - x0 - padX}px;top:${r.y - y0 - padY}px;opacity:${clamp(dk * 4).toFixed(3)}">${doodleSVG(o.doodle === true ? 'ellipse' : o.doodle, r.w + padX * 2, r.h + padY * 2, dk)}</div>`;
      }
      return `<div style="position:absolute;left:${r.x - x0}px;top:${r.y - y0}px;white-space:nowrap;font-size:${r.fs}px;line-height:1.1;${st};
        opacity:${k.toFixed(3)};transform:scale(${sc.toFixed(3)});transform-origin:${r.key ? '0% 50%' : '50% 50%'}">${inner}</div>`;
    }).join('');
    return `<div id="${o.id || ''}"${cidOf(o)} style="position:absolute;left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px;right:auto;
      font-family:${o.font || FONT};text-align:left;text-shadow:none;opacity:${fade.toFixed(3)}">${html}${doo}</div>`;
  }

  // "a |keyword| b c" → rows (keyword = big line, plain words 2 per line).
  function rowsFromText(text) {
    const rows = [];
    String(text || '').split('|').forEach((seg, i) => {
      seg = seg.trim();
      if (!seg) return;
      if (i % 2 === 1) { rows.push({ key: true, text: seg }); return; }
      const w = seg.split(/\s+/);
      for (let j = 0; j < w.length; j += 2) rows.push({ key: false, text: w.slice(j, j + 2).join(' ') });
    });
    return rows;
  }

  // ---------- caption style ----------
  // Chunk words → rows: consecutive hl words = one glowing keyword line, other words 2 per line (w.br is ignored: rows are the style).
  // Each row appears when its first word is spoken. Keyword colour alternates yellow / pink by chunk index.
  // Extra chunk fields: hl_color, glow, doodle ('ellipse'|'strike'|'underline').
  CAPTION_STYLES.neon = (c, t) => {
    const [W, H] = DESIGN();
    const rows = [];
    let buf = [];
    const flush = () => { if (buf.length) rows.push({ key: false, text: buf.map(w => w.w).join(' '), t: buf[0].s }); buf = []; };
    c.words.forEach((w, i) => {
      if (w.hl) {
        flush();
        const last = rows[rows.length - 1];
        if (last && last.key && c.words[i - 1]?.hl) last.text += ' ' + w.w;
        else rows.push({ key: true, text: w.w, t: w.s });
      } else {
        buf.push(w);
        if (buf.length >= 2) flush();
      }
    });
    flush();
    const idx = Math.max(0, (TL.captions || []).indexOf(c));
    const pal = keyPalette();
    const hl = c.hl_color || pal[idx % pal.length];
    const small = c.size || 48;
    const reveal = TL.caption_reveal !== false;
    if (!reveal) rows.forEach(r => { r.t = c.t0; });
    return scatter(rows, t, {
      id: 'cap', cid: c.cid, cx: c.x ?? W / 2, cy: c.y ?? Math.round(H * .61), small, key: Math.round(small * 1.92),
      hl, glow: c.glow || halo(hl), color: c.color, weight: c.weight, font: c.font, seed: (idx + 1) * 7.13, doodle: c.doodle,
    });
  };

  // ---------- flash: 0.30 s white bloom with motion blur and one negative frame ----------
  function flashHTML(lt, dur = .3, peak = .94) {
    if (lt < 0 || lt > dur) return '';
    const up = dur * .22;
    const k = lt < up ? lt / up : 1 - E.outCubic((lt - up) / (dur - up));
    const neg = lt >= up && lt < up + 1 / 30;
    const blur = (1 - Math.abs(lt - up) / dur) * 14;
    return `<div class="full" style="backdrop-filter:blur(${blur.toFixed(1)}px)${neg ? ' invert(1)' : ''};-webkit-backdrop-filter:blur(${blur.toFixed(1)}px)${neg ? ' invert(1)' : ''}"></div>
      <div class="full" style="background:#fff;opacity:${(clamp(k) * peak * (neg ? .35 : 1)).toFixed(3)}"></div>`;
  }

  // ---------- framing presets (zoom factors measured from the reference) ----------
  const ZOOM = { full: 1, wide: 1.22, punch: 1.45, punch_hard: 1.7, card: 1.06, card_tall: 1.04 };
  const CARD = { card: { x: 128, y: 292, w: 464, h: 824, r: 20 }, card_tall: { x: 96, y: 208, w: 528, h: 936, r: 22 } };
  const THEMES = { purple: { grad: N.purple, wash: .85 }, pink: { grad: N.pink, wash: .9 }, blue: { grad: N.blue, wash: .8 } };
  const pkey = p => String(p || 'punch').replace('-', '_');

  // Video layer: zoomed a-roll + gradient wash on the background only (cutout if available, else a soft hole around the person).
  function washedVideo(s, t, lt, shot, theme) {
    if (!TL.aroll) return `<div class="full" style="background:linear-gradient(135deg,${theme.grad[0]},${theme.grad[1]})"></div>`;
    const f = frameAt(t);
    const z = (shot.zoom ?? ZOOM[pkey(shot.preset)] ?? 1.45) * (s.drift === false ? 1 : 1 + .02 * prog(t, shot.t, Math.max(1, shot.dur)));
    const px = (shot.pan_x ?? s.pan_x ?? .5) * 100, py = (shot.pan_y ?? s.pan_y ?? .34) * 100;
    const grade = `${arollFilter(t)} contrast(${s.contrast ?? 1.1}) saturate(${s.saturation ?? 1.12})`;
    const img = `<img src="${url(fmtSeq(TL.aroll.frames, f))}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${grade}">`;
    const wash = s.wash ?? theme.wash, floor = s.floor ?? .6, keep = s.floor_keep ?? .22;
    const [a, b] = s.grad || theme.grad;
    const cut = !!TL.aroll.cutouts;
    const p = { x: 50, y: 64, rx: 34, ry: 50, ...(TL.person || {}), ...(s.person || {}) };
    const masks = [`linear-gradient(180deg,#000 0%,#000 ${((floor - .1) * 100).toFixed(0)}%,rgba(0,0,0,${keep}) ${((floor + .18) * 100).toFixed(0)}%,rgba(0,0,0,${keep}) 100%)`];
    if (!cut) masks.push(`radial-gradient(ellipse ${p.rx}% ${p.ry}% at ${p.x}% ${p.y}%,transparent 62%,#000 100%)`);
    const m = `-webkit-mask-image:${masks.join(',')};mask-image:${masks.join(',')};${masks.length > 1 ? '-webkit-mask-composite:source-in;mask-composite:intersect;' : ''}`;
    const grad = `linear-gradient(118deg,${a} 0%,${b} 100%)`;
    const layers = `<div class="full" style="background:${grad};mix-blend-mode:color;opacity:${clamp(wash + .1).toFixed(2)};${m}"></div>
      <div class="full" style="background:${grad};opacity:${(wash * .62).toFixed(3)};${m}"></div>`;
    const rim = s.rim ?? .45;
    const person = cut ? `<img src="${url(fmtSeq(TL.aroll.cutouts, f))}" onerror="this.remove()" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${grade}
      drop-shadow(0 0 ${(rim * 22).toFixed(0)}px ${al(b, rim)})">` : '';
    return `<div class="full" style="transform:scale(${z.toFixed(4)});transform-origin:${px}% ${py}%">${img}${layers}${person}</div>`;
  }

  const MOD = {
    // Background + framing for a whole section. preset: full|wide|punch|punch_hard|card|card_tall;
    // shots:[{t, preset|zoom, pan_y, pan_x}] = hard re-frames every 1–2.3 s; theme purple|pink|blue or grad:[a,b];
    // wash, floor, floor_keep, rim, person:{x,y,rx,ry} (% hole kept unwashed when no cutouts), flash:true, frame_color.
    neon_frame(s, t, lt) {
      const theme = { ...(THEMES[s.theme] || THEMES.purple) };
      const shots = [{ t: s.t0, preset: s.preset || 'punch', zoom: s.zoom, pan_y: s.pan_y, pan_x: s.pan_x }, ...(s.shots || [])].sort((a, b) => a.t - b.t);
      let i = 0;
      for (let j = 0; j < shots.length; j++) if (t >= shots[j].t) i = j;
      const shot = { ...shots[i], dur: (shots[i + 1]?.t ?? s.t1) - shots[i].t };
      const pr = pkey(shot.preset ?? s.preset);
      const [W, H] = DESIGN();
      let backHTML;
      if (CARD[pr]) {
        const c = { ...CARD[pr], ...(s.card || {}) };
        const col = s.frame_color || N.frame;
        const ek = E.outCubic(prog(t, shot.t, .24)), sc = 1.04 - .04 * ek;
        const [a, b] = s.grad || theme.grad;
        backHTML = `<div class="full" style="background:${N.dark}"></div>
          <div class="full" style="background:radial-gradient(ellipse 70% 45% at 50% 50%,${al(a, .55)} 0%,transparent 70%),radial-gradient(ellipse 60% 40% at 80% 85%,${al(b, .4)} 0%,transparent 70%)"></div>
          <div class="abs"${cidOf(s)} style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:${c.r}px;overflow:hidden;transform:scale(${sc.toFixed(4)});
            box-shadow:0 30px 60px rgba(0,0,0,.5)">${washedVideo(s, t, lt, shot, theme)}</div>
          ${s.no_frame ? '' : `<div class="abs" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:${c.r}px;transform:scale(${sc.toFixed(4)});
            border:2px solid ${al(col, .85)};box-shadow:0 0 42px ${al(col, .5)},0 0 110px ${al(col, .25)},inset 0 0 26px ${al(col, .15)}"></div>`}`;
      } else {
        backHTML = `<div class="full"${cidOf(s)} style="overflow:hidden;width:${W}px;height:${H}px">${washedVideo(s, t, lt, shot, theme)}</div>`;
      }
      const fl = (s.flash ? flashHTML(lt, s.flash_dur || .3) : '') + shots.slice(1).filter(x => x.flash).map(x => flashHTML(t - x.t, .3)).join('');
      return { back: backHTML, front: fl, cover: true };
    },

    // Standalone white flash (0.27–0.33 s) — put it ~0.05 s before a re-frame / colour change, always with a whoosh.
    neon_flash(s, t, lt) {
      return { front: flashHTML(lt, s.dur || Math.min(.33, s.t1 - s.t0), s.peak ?? .94) };
    },

    // Big glowing word (hook / promise / number). text (\n = new line), x, y, size, color (pale core), glow, type_on.
    neon_bigtype(s, t, lt) {
      const [W] = DESIGN();
      const x = s.x ?? W / 2, y = s.y ?? 400, col = s.color || N.yellow, glow = s.glow || halo(col);
      const linesT = String(s.text || '3 PHÚT').split('\n');
      let size = s.size || 108;
      const wMax = Math.max(...linesT.map(l => estW(l, size)));
      if (wMax > W - 92) size = Math.floor(size * (W - 92) / wMax);
      const o = fadeIO(t, s.t0, s.keep ? null : s.t1, .12, .2);
      const sc = .78 + .22 * back(lt / .26);
      const total = linesT.join('').length, typed = s.type_on === false ? total : Math.ceil(total * clamp(lt / (s.type_dur || .28)));
      let used = 0;
      const html = linesT.map(l => {
        const chars = [...l], n = clamp(typed - used, 0, chars.length);
        used += chars.length;
        return `<div>${esc(chars.slice(0, n).join(''))}<span style="opacity:0">${esc(chars.slice(n).join(''))}</span></div>`;
      }).join('');
      return { front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) scale(${sc.toFixed(3)});opacity:${o.toFixed(3)};
        font-family:${s.font || FONT};font-weight:800;font-size:${size}px;line-height:1.02;letter-spacing:-.02em;text-align:center;white-space:nowrap;
        color:${col};text-shadow:${glowShadow(col, glow)}">${html}</div>` };
    },

    // Scattered phrase placed by hand (same look as the caption): text "a |keyword| b", x, y (block centre), size (plain words), hl, doodle.
    neon_scatter(s, t, lt) {
      const [W, H] = DESIGN();
      const rows = rowsFromText(s.text || 'đây là |từ khoá| chính');
      const d = Math.max(.4, s.t1 - s.t0);
      const step = s.step ?? (rows.length > 1 ? Math.min(.42, (d * .62) / (rows.length - 1)) : 0);
      rows.forEach((r, i) => { r.t = s.t0 + i * step; });
      const hl = s.hl || keyPalette()[0], small = s.size || 48;
      return {
        front: scatter(rows, t, {
          cid: s.cid, cx: s.x ?? W / 2, cy: s.y ?? Math.round(H * .61), small, key: Math.round(small * 1.92), hl, glow: s.glow || halo(hl),
          color: s.color, seed: s.seed ?? 3.7, doodle: s.doodle, fade: fadeIO(t, s.t0, s.keep ? null : s.t1, .01, .16), typeOn: s.type_on,
        }),
        hideCaptions: true,
      };
    },

    // Emoji burst around the frame: burst: ['🤯', …] or [{char, x, y, size, rot}]; x/y move the whole group, size scales it.
    neon_emoji(s, t, lt) {
      const [W, H] = DESIGN();
      const POS = [[622, 308, 152, 12], [74, 668, 150, -9], [578, 900, 178, 7], [120, 300, 130, -14], [640, 640, 120, 10]];
      const gx = s.x ?? W / 2, gy = s.y ?? H / 2, f = (s.size || 150) / 150;
      const o = fadeIO(t, s.t0, s.keep ? null : s.t1, .01, .18);
      const list = s.burst || ['🤯', '🍿', '🤯'];
      const html = list.map((it, j) => {
        const e = typeof it === 'string' ? { char: it } : it, p = POS[j % POS.length];
        const x = (e.x ?? p[0]) - W / 2, y = (e.y ?? p[1]) - H / 2, sz = (e.size ?? p[2]) * f, rot = e.rot ?? p[3];
        const k = prog(lt, j * (s.stagger ?? .07), .26);
        const sc = .3 + .7 * back(k), fl = Math.sin(lt * 2.1 + j) * 5;
        return `<div style="position:absolute;left:${(gx + x * f - sz / 2).toFixed(1)}px;top:${(gy + y * f - sz / 2).toFixed(1)}px;width:${sz}px;height:${sz}px;
          opacity:${clamp(k * 3).toFixed(3)};transform:translateY(${fl.toFixed(2)}px) rotate(${rot}deg) scale(${sc.toFixed(3)});filter:drop-shadow(0 10px 26px rgba(0,0,0,.45))">
          ${emoji(e.char || '🤯', 0, 0, sz)}</div>`;
      }).join('');
      return { front: `<div class="full"${cidOf(s)} style="opacity:${o.toFixed(3)};pointer-events:none">${html}</div>` };
    },

    // Rolling number with a white icon (eye | play | heart | up). from, to, decimals, unit, prefix, dur_roll, x, y, size, pupil.
    neon_counter(s, t, lt) {
      const x = s.x ?? 470, y = s.y ?? 250, size = s.size || 86;
      const k = E.outCubic(prog(lt, .1, s.dur_roll || 1.4));
      const from = s.from ?? 0, to = s.to ?? 100, dec = s.decimals ?? (Number.isInteger(from) && Number.isInteger(to) ? 0 : 1);
      let v = (from + (to - from) * k).toFixed(dec);
      if (dec === 0 && Math.abs(+v) >= 10000) v = (+v).toLocaleString('vi-VN');
      const pupil = s.pupil || N.pupil, is = Math.round(size * 1.2);
      const ICON = {
        eye: `<path d="M6 50 C24 24 76 24 94 50 C76 76 24 76 6 50Z" fill="#FFFFFF"/><circle cx="50" cy="50" r="15" fill="none" stroke="${pupil}" stroke-width="9"/>`,
        play: `<path d="M30 20 L80 50 L30 80 Z" fill="#FFFFFF"/>`,
        heart: `<path d="M50 84 C18 62 8 44 18 30 C28 16 44 20 50 34 C56 20 72 16 82 30 C92 44 82 62 50 84Z" fill="#FFFFFF"/>`,
        up: `<path d="M14 74 L38 46 L58 62 L88 24" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M66 24 L88 24 L88 46" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`,
      };
      const o = fadeIO(t, s.t0, s.keep ? null : s.t1, .22, .2), sc = .78 + .22 * back(lt / .22);
      return { front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) scale(${sc.toFixed(3)});opacity:${o.toFixed(3)};
        display:flex;flex-direction:column;align-items:center;gap:2px;font-family:${FONT}">
        ${s.icon === '' ? '' : `<svg viewBox="0 0 100 100" width="${is}" height="${is}" style="filter:drop-shadow(0 0 18px rgba(255,255,255,.55))">${ICON[s.icon || 'eye'] || ICON.eye}</svg>`}
        <div style="font-weight:800;font-size:${size}px;line-height:1;letter-spacing:-.02em;color:#fff;white-space:nowrap;
          text-shadow:0 0 30px rgba(255,255,255,.45),0 3px 16px rgba(0,0,0,.4)">${esc((s.prefix || '') + v + (s.unit ? ' ' + s.unit : ''))}</div>
        ${s.label ? `<div style="font-weight:700;font-size:${Math.round(size * .36)}px;color:#fff;text-shadow:${WHITE_SHADOW};white-space:nowrap">${esc(s.label)}</div>` : ''}</div>` };
    },

    // Rounded dark chip with the product name or logo, neon rim — appears on the sentence that names the product.
    neon_logochip(s, t, lt) {
      const [W] = DESIGN();
      const x = s.x ?? W / 2, y = s.y ?? 1000, size = s.size || 120, col = s.color || N.frame;
      const o = fadeIO(t, s.t0, s.keep ? null : s.t1, .22, .2), sc = .78 + .22 * back(lt / .22);
      const icon = s.icon || (s.text ? '' : BR().logo);
      const inner = icon ? slIcon(icon, Math.round(size * .56), 'white')
        : `<span style="color:#fff;font-weight:800;letter-spacing:.02em;font-size:${Math.round(size * (String(s.text || 'LOGO').length > 5 ? .2 : .26))}px">${esc(s.text || 'LOGO')}</span>`;
      const label = s.label ? `<div style="position:absolute;top:${size + 14}px;left:50%;transform:translateX(-50%);white-space:nowrap;font-weight:800;font-size:${Math.round(size * .26)}px;
        color:#fff;text-shadow:${WHITE_SHADOW}">${esc(s.label)}</div>` : '';
      return { front: `<div class="abs"${cidOf(s)} style="left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;opacity:${o.toFixed(3)};transform:scale(${sc.toFixed(3)});font-family:${FONT}">
        <div style="width:100%;height:100%;border-radius:${Math.round(size * .25)}px;background:${s.bg || N.chip};display:flex;align-items:center;justify-content:center;
          border:1.5px solid ${al(col, .5)};box-shadow:0 0 34px ${al(col, .35)},0 14px 40px rgba(0,0,0,.5)">${inner}</div>${label}</div>` };
    },

    // Free hand-drawn stroke to circle something in the frame: kind ellipse|strike|underline, x, y (centre), w, h, color, draw (s), width.
    neon_doodle(s, t, lt) {
      const w = s.w || 420, h = s.h || 110, x = s.x ?? 360, y = s.y ?? 640;
      const k = E.outCubic(prog(lt, 0, s.draw || .38)), o = fadeIO(t, s.t0, s.keep ? null : s.t1, .01, .18);
      return { front: `<div class="abs"${cidOf(s)} style="left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;opacity:${o.toFixed(3)}">${doodleSVG(s.kind || 'ellipse', w, h, k, s.color || '#FFFFFF', s.width || 5)}</div>` };
    },
  };
  Object.assign(MODULES, MOD);

  // ---------- Studio metadata + starter edit ----------
  PACKS.push({
    id: P, name: 'Phụ đề neon AI', icon: '💜', caption: 'neon',
    desc: 'Nền gradient tím/hồng sau người, phụ đề rải chữ có từ khoá to phát sáng gõ dần, loá trắng, emoji, số chạy, logo chip',
    items: [
      { type: 'neon_frame', label: 'Khung + nền gradient', make: T => ({ type: 'neon_frame', t0: T, t1: T + 5, theme: 'purple', preset: 'punch', pan_y: .34, flash: true, shots: [{ t: T + 1.8, preset: 'wide' }, { t: T + 3.6, preset: 'punch' }] }) },
      { type: 'neon_frame', label: 'Thẻ video viền neon', make: T => ({ type: 'neon_frame', t0: T, t1: T + 1.6, theme: 'purple', preset: 'card', flash: true }) },
      { type: 'neon_flash', label: 'Loá trắng', make: T => ({ type: 'neon_flash', t0: T, t1: T + .3, peak: .94 }) },
      { type: 'neon_bigtype', label: 'Chữ lớn phát sáng', make: T => ({ type: 'neon_bigtype', t0: T, t1: T + 1.6, text: '3 PHÚT', x: 360, y: 400, size: 108, color: N.yellow }) },
      { type: 'neon_scatter', label: 'Cụm chữ rải + từ khoá', make: T => ({ type: 'neon_scatter', t0: T, t1: T + 2, text: 'đây là |từ khoá| chính', x: 360, y: 780, size: 48, hl: N.rose, doodle: 'ellipse' }) },
      { type: 'neon_emoji', label: 'Cụm emoji', make: T => ({ type: 'neon_emoji', t0: T, t1: T + 1, burst: ['🤯', '🍿', '🤯'], x: 360, y: 640, size: 150 }) },
      { type: 'neon_counter', label: 'Số chạy tăng', make: T => ({ type: 'neon_counter', t0: T, t1: T + 2, from: 1.9, to: 5.7, decimals: 1, unit: 'M', icon: 'eye', x: 470, y: 250, size: 86 }) },
      { type: 'neon_logochip', label: 'Ô logo bo góc', make: T => ({ type: 'neon_logochip', t0: T, t1: T + 1.2, text: 'VIDS', x: 360, y: 1000, size: 120 }) },
      { type: 'neon_doodle', label: 'Nét khoanh tay', make: T => ({ type: 'neon_doodle', t0: T, t1: T + 1.2, kind: 'ellipse', x: 360, y: 640, w: 420, h: 110 }) },
    ],
    // Sections of ~5–8 s alternating purple / pink, each opened by a flash, re-framed every ~1.8 s;
    // a card + emoji burst on the first "wow" word, logo chip on the brand name, big CTA at the end.
    recipe: ctx => {
      const dur = ctx.dur, caps = ctx.captions || [], scenes = [];
      const endT = Math.max(2.5, dur - 2.4);
      const nSec = Math.max(1, Math.round(endT / 6.5)), secLen = endT / nSec;
      const climax = findWord(caps, ['sốc', 'shock', 'điên', 'đáng sợ', 'khủng khiếp', 'wow', 'không thể tin', 'bất ngờ', 'crazy'], 2);
      for (let i = 0; i < nSec; i++) {
        const a = +(i * secLen).toFixed(2), b = +((i + 1) * secLen).toFixed(2);
        const shots = [];
        for (let x = a + 1.8, j = 0; x < b - .8; x += 1.8, j++) shots.push({ t: +x.toFixed(2), preset: j % 2 ? 'punch' : (j % 4 === 2 ? 'punch_hard' : 'wide') });
        scenes.push({ type: 'neon_frame', t0: a, t1: b, theme: i % 2 ? 'pink' : 'purple', preset: 'punch', pan_y: .34, flash: i > 0, shots });
      }
      scenes.push({ type: 'neon_frame', t0: endT, t1: dur, theme: 'purple', preset: 'punch_hard', pan_y: .3, flash: true });
      scenes.push({ type: 'neon_bigtype', t0: .15, t1: 1.9, text: (ctx.title || 'XEM NGAY').toUpperCase(), x: 360, y: 380, size: 96, color: N.yellow });
      if (climax != null && climax < endT - 1.2) {
        scenes.push({ type: 'neon_frame', t0: climax - .05, t1: climax + 1.1, theme: 'purple', preset: 'card', flash: true });
        scenes.push({ type: 'neon_emoji', t0: climax, t1: climax + 1.0, burst: ['🤯', '😱', '🔥'], x: 360, y: 640, size: 150 });
      }
      const brandName = ctx.brand?.name;
      const bt = brandName ? findWord(caps, [brandName], 1) : null;
      if (bt != null && bt < endT - 1) scenes.push({ type: 'neon_logochip', t0: bt, t1: bt + 1.2, text: brandName.toUpperCase().slice(0, 8), icon: ctx.brand.logo || '', x: 360, y: 1010, size: 120 });
      scenes.push({ type: 'neon_bigtype', t0: endT + .1, t1: dur, text: 'FOLLOW\nĐỂ XEM TIẾP', x: 360, y: 400, size: 84, color: N.rose, keep: true });
      if (ctx.brand?.logo) scenes.push({ type: 'neon_logochip', t0: endT + .4, t1: dur, icon: ctx.brand.logo, x: 360, y: 1010, size: 120, keep: true });
      const r2 = v => Math.round(v * 100) / 100;
      scenes.forEach(x => { x.t0 = r2(x.t0); x.t1 = r2(x.t1); });
      return { caption_style: 'neon', music: 'tech', scenes };
    },
  });
})();
