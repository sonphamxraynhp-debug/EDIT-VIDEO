// "Chia sẻ / kể chuyện" pack: warm editorial look for Vietnamese sharing videos (kinh nghiệm, kể chuyện,
// quan điểm, bài học, trả lời bình luận). Cream paper cards, ink text, terracotta accent, sage, serif quotes,
// paper grain from CSS/SVG noise, optional warm film grade. Doc: references/pack-share.md.
(() => {
  const P = 'share';
  const SERIF = "'Playfair Display','DM Serif Display',Georgia,serif";   // Vietnamese-safe serif
  const DISP = "'DM Serif Display','Playfair Display',Georgia,serif";    // numerals / quote marks
  const SANS = "'Be Vietnam Pro',system-ui,sans-serif";
  const HAND = "'Pacifico','Be Vietnam Pro',cursive";

  // Palette: pack defaults < TL.brand (same object BR() merges) < scene.palette.
  function pal(s = {}) {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    const x = s.palette || {};
    return {
      paper: x.paper || b.paper || '#F4EDE2', paper2: x.paper2 || b.paper2 || '#E8DAC4',
      ink: x.ink || b.ink || b.dark || '#1D1B19', accent: x.accent || b.primary || '#D9653B',
      sage: x.sage || b.sage || b.accent || '#8FA98F', muted: x.muted || b.muted || '#7D7166',
      serif: x.serif || b.serif || SERIF, sans: x.sans || (b.font && b.font !== 'var(--sans)' ? b.font : SANS),
    };
  }
  const hex = c => { const m = /^#?([\da-f]{6})$/i.exec(c || ''); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const mix = (a, b, k) => { const A = hex(a), B = hex(b); if (!A || !B) return a; return '#' + A.map((v, i) => Math.round(lerp(v, B[i], k)).toString(16).padStart(2, '0')).join(''); };
  const rgba = (c, a) => { const A = hex(c); return A ? `rgba(${A[0]},${A[1]},${A[2]},${a})` : c; };

  // SVG fractal noise tiles (paper fibre + film grain).
  const noise = (a, freq = .8) => `url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%22${freq}%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3CfeColorMatrix values=%220 0 0 0 .35 0 0 0 0 .26 0 0 0 0 .18 0 0 0 ${a} 0%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')`;
  const PAPER_GRAIN = noise(.22, .9), FILM_GRAIN = noise(.6, .75);
  const paperBg = (p, r = 22) => `background-color:${p.paper};background-image:${PAPER_GRAIN},radial-gradient(ellipse at 25% 0%,rgba(255,255,255,.55),rgba(255,255,255,0) 60%),linear-gradient(180deg,rgba(255,248,236,0),rgba(110,70,30,.07));
    background-size:200px 200px,100% 100%,100% 100%;border-radius:${r}px;box-shadow:0 22px 44px rgba(29,18,8,.34),0 3px 8px rgba(29,18,8,.18);color:${p.ink}`;

  const geo = () => { const [W, H] = DIMS(); return { W, H, v: VERT() }; };
  // Centre position: x/y from the scene, else vertical / horizontal defaults.
  const XY = (s, vy, hy) => { const g = geo(); return [s.x ?? g.W / 2, s.y ?? (g.v ? vy : hy)]; };
  const life = (s, t) => fadeIO(t, s.t0, s.keep ? null : s.t1, .35, .3);
  // Lower cards are bottom-anchored (y = bottom edge) so they grow upward, away from the caption/safe-zone floor.
  const BOT = () => (VERT() ? 985 : 690);
  const rootB = (s, x, y, inner, o, tr = '') => `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:max-content;transform:translate(-50%,-100%) ${tr};transform-origin:50% 100%;opacity:${clamp(o).toFixed(3)}">${inner}</div>`;
  const root = (s, x, y, inner, o, tr = '', st = '') => `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:max-content;transform:translate(-50%,-50%) ${tr};opacity:${clamp(o).toFixed(3)};${st}">${inner}</div>`;

  // Rich text: "*từ khoá*" = italic serif accent. Words fade/slide in at `wps` words per second from `start` (local t).
  function tokens(text) {
    let hl = false; const out = [];
    for (let w of String(text || '').split(/\s+/).filter(Boolean)) {
      if (w.startsWith('*')) { hl = true; w = w.slice(1); }
      const m = /^(.*)\*([^*]*)$/.exec(w);              // "riêng*?" → hl "riêng" + plain "?"
      if (m) { if (m[1]) out.push({ w: m[1], hl }); hl = false; if (m[2] && out.length) out[out.length - 1].tail = m[2]; continue; }
      if (w) out.push({ w, hl });
    }
    return out;
  }
  function rich(text, lt, start, wps, p, o = {}) {
    const tk = tokens(text);
    return tk.map((k0, i) => {
      const k = !wps ? 1 : E.outCubic(prog(lt, start + i / wps, .4));
      const st = `display:inline-block;opacity:${k.toFixed(3)};transform:translateY(${((1 - k) * 10).toFixed(1)}px);${k < .98 ? `filter:blur(${((1 - k) * 3).toFixed(1)}px);` : ''}`;
      const hs = k0.hl ? `font-family:'Playfair Display',serif;font-style:italic;font-weight:${o.hlWeight || 600};color:${o.hlColor || p.accent};` : '';
      const ul = k0.hl && o.underline ? underline(lt, start + (i + 1) / (wps || 99) + .05, o.underline) : '';
      return `<span style="${st}${hs}${ul ? 'position:relative;' : ''}">${esc(k0.w)}${ul}</span>${k0.tail ? `<span style="${st}">${esc(k0.tail)}</span>` : ''}`;
    }).join(' ');
  }
  const wordCount = text => tokens(text).length;

  // Hand-drawn underline (two wobbly strokes) drawn on from local time `at`.
  function underline(lt, at, color, block = false) {
    const k1 = E.outCubic(prog(lt, at, .45)), k2 = E.outCubic(prog(lt, at + .3, .3));
    const pos = block ? 'display:block;width:72%;height:18px;margin:6px auto 0' : 'position:absolute;left:-4%;width:108%;bottom:-.16em;height:.36em';
    return `<svg viewBox="0 0 200 20" preserveAspectRatio="none" style="${pos};overflow:visible;pointer-events:none;opacity:${k1 > .01 ? 1 : 0}">
      <path d="M3,13 C40,7 70,16 105,10 S170,8 197,11" fill="none" stroke="${color}" stroke-width="3.6" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - k1).toFixed(3)}"/>
      <path d="M22,18 C70,14 120,17 176,15" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" opacity=".7" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - k2).toFixed(3)}"/></svg>`;
  }
  const kicker = (txt, p, color, size = 19) => `<div style="font-family:${p.sans};font-weight:700;font-size:${size}px;letter-spacing:.2em;text-transform:uppercase;color:${color || p.accent};line-height:1.5">${esc(txt)}</div>`;
  const cardIn = (lt, d = .5) => { const k = E.outCubic(prog(lt, 0, d)); return { k, tr: `translateY(${((1 - k) * 40).toFixed(1)}px)` }; };

  // Vietnamese numbers: "1,2 tỷ" (decimal comma), "1.200" (thousand dots), "90%".
  function parseNum(v) {
    const str = String(v ?? ''), m = /\d[\d.,]*/.exec(str);
    if (!m) return null;
    let raw = m[0].replace(/[.,]$/, ''); const [ip, dp = ''] = raw.split(',');
    return { pre: str.slice(0, m.index), suf: str.slice(m.index + raw.length), n: parseFloat(ip.replace(/\./g, '') + (dp ? '.' + dp : '')), dec: dp.length, dots: /\.\d{3}/.test(ip) };
  }
  const fmtNum = (n, dec, dots) => { let [i, d] = n.toFixed(dec).split('.'); if (dots || i.length > 4) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return d ? `${i},${d}` : i; };

  // ---------- icons ----------
  const ICON = {
    bulb: (p, on) => `<svg viewBox="0 0 64 64" width="100%" height="100%" style="overflow:visible">
      <g stroke="${p.accent}" stroke-width="3.2" stroke-linecap="round" opacity="${on.toFixed(2)}">
        <path d="M32 2v6M8 12l4.5 4.5M56 12l-4.5 4.5M2 32h6M56 32h6"/></g>
      <path d="M32 12a16 16 0 0 0-9.6 28.8c2 1.6 3.1 3.6 3.1 6V49h13v-2.2c0-2.4 1.1-4.4 3.1-6A16 16 0 0 0 32 12z" fill="${mix(p.paper, '#F6C25A', on)}" stroke="${p.ink}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M26 54h12M28 59h8" stroke="${p.ink}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M28 40c0-5 1.6-8 4-8s4 3 4 8" fill="none" stroke="${p.ink}" stroke-width="2" stroke-linecap="round" opacity=".55"/></svg>`,
    bookmark: (c, fill) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M6.5 3h11a1 1 0 0 1 1 1v17l-6.5-4.2L5.5 21V4a1 1 0 0 1 1-1z" fill="${fill}" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
    share: (c, fill) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M13.5 4.5 21 11.5l-7.5 7v-4.2c-5.2 0-8.6 1.5-11 5 .9-5.2 4-9.6 11-10.6z" fill="${fill}" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
    heart: c => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" fill="none" stroke="${c}" stroke-width="1.8"/></svg>`,
  };

  const M = {
    // Quote card: big quote marks, words revealed one by one, author line. full:true → full-frame paper page.
    sh_quote(s, t, lt) {
      const p = pal(s), g = geo(), o = life(s, t), size = s.size || (s.full ? 52 : 40);
      const n = wordCount(s.text), wps = s.wps ?? 5, st = .3, done = st + n / wps;
      const ka = E.outCubic(prog(lt, done + .05, .4));
      const author = s.author ? `<div style="margin-top:22px;display:flex;align-items:center;gap:14px;justify-content:${s.full ? 'center' : 'flex-start'};opacity:${ka.toFixed(3)};transform:translateX(${((1 - ka) * -14).toFixed(1)}px)">
        <span style="width:${lerp(0, 38, ka).toFixed(1)}px;height:2px;background:${p.sage}"></span>
        <span style="font-family:${p.sans};font-weight:600;font-size:${Math.round(size * .5)}px;color:${p.muted};line-height:1.4">${esc(s.author)}</span></div>` : '';
      const kq = E.outBack(prog(lt, .05, .45), 1.6);
      const mark = `<div style="position:absolute;left:${s.full ? '50%' : '26px'};top:${s.full ? '-170px' : '-74px'};font-family:${DISP};font-size:${s.full ? 240 : 200}px;line-height:1;color:${p.accent};
        transform:${s.full ? 'translateX(-50%) ' : ''}scale(${clamp(kq, 0, 1.2).toFixed(3)});transform-origin:30% 60%;opacity:${clamp(kq * 2).toFixed(2)}">“</div>`;
      const body = `${mark}<div style="position:relative;font-family:${p.serif};font-weight:500;font-size:${size}px;line-height:1.38;color:${p.ink};text-align:${s.full ? 'center' : 'left'};padding-top:6px">${rich(s.text, lt, st, wps, p, { underline: s.underline === false ? null : p.accent })}</div>${author}`;
      if (s.full) {
        const kw = E.outCubic(prog(lt, 0, .45)), kx = s.keep ? 0 : E.inCubic(prog(t, s.t1 - .35, .35));
        return { front: `<div class="full" style="${paperBg(p, 0)};box-shadow:none;clip-path:inset(${((1 - kw) * 100).toFixed(1)}% 0 ${(kx * 100).toFixed(1)}% 0)"></div>`
          + root(s, s.x ?? g.W / 2, s.y ?? g.H * .5, `<div style="position:relative;width:${s.w || (g.v ? 580 : 900)}px">${body}</div>`, clamp(prog(lt, .15, .3)) * (1 - kx)), hideCaptions: s.hideCaptions ?? true };
      }
      const [x, y] = XY(s, BOT(), BOT()), ci = cardIn(lt);
      const card = `<div style="position:relative;width:${s.w || (g.v ? 600 : 760)}px;padding:58px 44px 38px;${paperBg(p)}">${body}</div>`;
      return { front: rootB(s, x, y, card, o * ci.k, `${ci.tr} rotate(${(s.tilt ?? -1.2) * ci.k}deg)`), hideCaptions: s.hideCaptions ?? true };
    },

    // Big stat with count-up ("3 năm", "1,2 tỷ", "90%") + short label.
    sh_stat(s, t, lt) {
      const p = pal(s), g = geo(), o = life(s, t), size = s.size || 124;
      const nv = parseNum(s.value ?? '90%');
      const kc = E.outExpo(prog(lt, .15, s.count ?? 1.1));
      let num = esc(s.value), suf = '';
      if (nv && isFinite(nv.n)) { num = esc(nv.pre) + fmtNum(nv.n * kc, nv.dec, nv.dots); suf = nv.suf.trim(); }
      const pct = suf.startsWith('%');
      const kp = E.outBack(prog(lt, 0, .45), 1.5), kl = E.outCubic(prog(lt, .5, .45)), ku = E.outCubic(prog(lt, .7, .6));
      const onCard = s.card !== false, ink = onCard ? p.ink : mix(p.accent, '#ffffff', .3), sh = onCard ? '' : 'text-shadow:0 4px 22px rgba(20,12,6,.85),0 2px 4px rgba(20,12,6,.6);';
      const bigCol = s.color || (onCard ? p.accent : '#FBF6EE');
      const inner = `${s.kicker ? kicker(s.kicker, p, onCard ? p.sage : '#E9DFC9', 18) : ''}
        <div style="white-space:nowrap;line-height:1.12;padding-top:.04em;${sh}">
          <span style="font-family:${DISP};font-size:${size}px;color:${bigCol}">${num}${pct ? '%' : ''}</span>${suf && !pct ? `<span style="font-family:${p.serif};font-style:italic;font-weight:600;font-size:${Math.round(size * .44)}px;color:${ink};margin-left:.22em">${esc(suf)}</span>` : ''}${pct && suf.length > 1 ? `<span style="font-family:${p.serif};font-size:${Math.round(size * .4)}px;color:${ink};margin-left:.2em">${esc(suf.slice(1).trim())}</span>` : ''}</div>
        <div style="height:3px;width:${(ku * 120).toFixed(1)}px;background:${p.sage};margin:6px auto 10px;border-radius:2px"></div>
        ${s.label ? `<div style="font-family:${p.sans};font-weight:600;font-size:${Math.round(size * .21)}px;line-height:1.4;color:${onCard ? p.muted : '#F4EDE2'};opacity:${kl.toFixed(3)};max-width:${s.w || 520}px;${sh}">${esc(s.label)}</div>` : ''}`;
      const [x, y] = XY(s, BOT(), BOT());
      const box = onCard ? `<div style="text-align:center;padding:22px 46px 26px;${paperBg(p, 26)}">${inner}</div>` : `<div style="text-align:center">${inner}</div>`;
      return { front: rootB(s, x, y, box, o * clamp(kp * 2), `scale(${lerp(.86, 1, clamp(kp, 0, 1.1)).toFixed(3)}) rotate(${s.tilt ?? 1}deg)`), hideCaptions: s.hideCaptions ?? true };
    },

    // Numbered list ("3 bài học"): items at their own t; current item emphasised, earlier ones dim with a sage tick.
    sh_list(s, t, lt) {
      const p = pal(s), g = geo(), o = life(s, t), size = s.size || 28, w = s.w || (g.v ? 620 : 760);
      const items = (s.items || []).map((it, i) => (typeof it === 'string' ? { text: it } : it)).map((it, i) => ({ ...it, t: it.t ?? s.t0 + .7 + i * (s.gap ?? 1.3) }));
      let cur = -1; items.forEach((it, i) => { if (t >= it.t) cur = i; });
      const rows = items.map((it, i) => {
        const k = E.outCubic(prog(t, it.t, .45)), on = i === cur, past = i < cur;
        const kn = E.outBack(prog(t, it.t, .4), 2);
        const num = past
          ? `<div style="width:52px;height:52px;border-radius:50%;background:${p.sage};display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="${p.paper}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`
          : `<div style="width:52px;height:52px;border-radius:50%;${on ? `background:${p.accent};color:${p.paper};` : `border:2px dashed ${rgba(p.ink, .25)};color:${rgba(p.ink, .3)};`}display:flex;align-items:center;justify-content:center;font-family:${DISP};font-size:30px;line-height:1;transform:scale(${on ? clamp(kn, 0, 1.25).toFixed(3) : 1})">${i + 1}</div>`;
        return `<div${cidOf(it)} style="display:flex;align-items:center;gap:20px;padding:12px 0;${i ? `border-top:1px solid ${rgba(p.ink, .1)};` : ''}">
          <div style="flex:none">${num}</div>
          <div style="font-family:${p.sans};font-weight:${on ? 700 : 600};font-size:${size}px;line-height:1.38;color:${p.ink};opacity:${(k * (past ? .5 : 1)).toFixed(3)};transform:translateX(${((1 - k) * -24).toFixed(1)}px)">${on ? rich(it.text, 9, 0, 0, p) : esc(String(it.text).replace(/\*/g, ''))}</div></div>`;
      }).join('');
      const head = `${s.kicker ? kicker(s.kicker, p, p.sage) : ''}${s.title ? `<div style="font-family:${p.serif};font-weight:600;font-size:${Math.round(size * 1.35)}px;line-height:1.3;margin:2px 0 14px;color:${p.ink}">${rich(s.title, lt, .15, 8, p)}</div>` : ''}`;
      const [x, y] = XY(s, BOT(), BOT()), ci = cardIn(lt);
      return { front: rootB(s, x, y, `<div style="width:${w}px;padding:30px 36px 22px;${paperBg(p)}">${head}${rows}</div>`, o * ci.k, `${ci.tr} rotate(${s.tilt ?? .6}deg)`), hideCaptions: s.hideCaptions ?? true };
    },

    // Story timeline: line draws on between milestones, dots pop, current milestone highlighted. orient: 'v' | 'h'.
    sh_timeline(s, t, lt) {
      const p = pal(s), g = geo(), o = life(s, t), size = s.size || 26;
      const items = (s.items || []).map((it, i) => ({ ...it, t: it.t ?? s.t0 + .5 + i * (s.gap ?? 1) }));
      const hz = (s.orient || (g.v ? 'v' : 'h')) === 'h';
      let cur = -1; items.forEach((it, i) => { if (t >= it.t) cur = i; });
      const cells = items.map((it, i) => {
        const kd = E.outBack(prog(t, it.t, .4), 2.4), kt = E.outCubic(prog(t, it.t + .08, .45)), on = i === cur;
        const nx = items[i + 1], ks = nx ? E.inOutSine(prog(t, it.t + .1, Math.max(.2, nx.t - it.t - .1))) : 0;
        const ring = on ? `<div style="position:absolute;inset:-9px;border-radius:50%;border:2px solid ${p.accent};opacity:${(1 - prog(t, it.t, .9)) * .9};transform:scale(${lerp(.6, 1.5, prog(t, it.t, .9)).toFixed(3)})"></div>` : '';
        const dot = `<div style="position:absolute;${hz ? 'left:50%;top:0;margin-left:-11px' : 'left:0;top:12px'};width:22px;height:22px;border-radius:50%;background:${on ? p.accent : i < cur ? p.sage : p.paper};border:3px solid ${i <= cur ? (on ? p.accent : p.sage) : rgba(p.ink, .25)};transform:scale(${t >= it.t ? clamp(kd, 0, 1.3).toFixed(3) : .75})">${ring}</div>`;
        const seg = nx ? `<div style="position:absolute;${hz ? `left:calc(50% + 11px);top:9px;height:4px;width:calc(100% - 22px);transform-origin:0 50%;transform:scaleX(${ks.toFixed(3)})` : `left:9px;top:34px;width:4px;bottom:-12px;transform-origin:50% 0;transform:scaleY(${ks.toFixed(3)})`};background:${p.sage};border-radius:2px"></div>` : '';
        const txt = `<div style="opacity:${kt.toFixed(3)};transform:translate${hz ? 'Y' : 'X'}(${((1 - kt) * 16).toFixed(1)}px)">
          <div style="font-family:${DISP};font-size:${Math.round(size * 1.45)}px;line-height:1.15;color:${on ? p.accent : p.ink}">${esc(it.year ?? '')}</div>
          <div style="font-family:${p.sans};font-weight:${on ? 700 : 500};font-size:${size}px;line-height:1.38;color:${on ? p.ink : rgba(p.ink, .72)};margin-top:2px">${esc(it.text ?? '')}</div></div>`;
        return hz
          ? `<div${cidOf(it)} style="position:relative;flex:1;padding:40px 8px 0;text-align:center">${seg}${dot}${txt}</div>`
          : `<div${cidOf(it)} style="position:relative;padding:4px 0 24px 46px">${seg}${dot}${txt}</div>`;
      }).join('');
      const head = s.title ? `<div style="font-family:${p.serif};font-weight:600;font-size:${Math.round(size * 1.4)}px;line-height:1.3;margin-bottom:18px">${rich(s.title, lt, .1, 8, p)}</div>` : '';
      const [x, y] = XY(s, BOT(), BOT()), ci = cardIn(lt);
      const w = s.w || (hz ? (g.v ? 640 : 980) : 560);
      const box = `<div style="width:${w}px;padding:30px 34px ${hz ? 30 : 8}px;${s.card === false ? `color:#FBF6EE` : paperBg(p)}">${head}<div style="${hz ? 'display:flex' : ''}">${cells}</div></div>`;
      return { front: rootB(s, x, y, box, o * ci.k, ci.tr), hideCaptions: s.hideCaptions ?? true };
    },

    // TikTok-style "Trả lời bình luận của @user" bubble, slides in at the top.
    sh_comment(s, t, lt) {
      const p = pal(s), g = geo(), o = life(s, t), size = s.size || 27, w = s.w || 560;
      const user = String(s.user || '@ban.doc').replace(/^@?/, '@');
      const k = E.outBack(prog(lt, 0, .55), 1.3), kt = E.outCubic(prog(lt, .3, .4));
      const ini = user.replace(/^@/, '').charAt(0).toUpperCase() || 'B';
      const av = s.avatar ? `<img src="${url(s.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : ini;
      const bub = `<div style="position:relative;width:${w}px;background:${s.bg || '#FFFDF9'};border-radius:20px;padding:18px 22px 20px;box-shadow:0 14px 34px rgba(20,12,6,.32);display:flex;gap:16px;align-items:flex-start">
        <div style="flex:none;width:56px;height:56px;border-radius:50%;background:${s.avatar_bg || p.accent};color:#fff;display:flex;align-items:center;justify-content:center;font-family:${p.sans};font-weight:800;font-size:26px;overflow:hidden">${av}</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:${p.sans};font-size:${Math.round(size * .7)}px;line-height:1.45;color:${p.muted}">${esc(s.reply_label || 'Trả lời bình luận của')} <b style="color:${p.ink};font-weight:700">${esc(user)}</b></div>
          <div style="font-family:${p.sans};font-weight:700;font-size:${size}px;line-height:1.4;color:${p.ink};margin-top:4px;opacity:${kt.toFixed(3)}">${esc(s.text || 'Anh ơi, làm sao để bắt đầu khi không có vốn?')}</div>
          ${s.likes ? `<div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-family:${p.sans};font-size:17px;color:${p.muted}"><span style="width:18px;height:18px;display:inline-block">${ICON.heart(p.muted)}</span>${esc(s.likes)}</div>` : ''}
        </div>
        <div style="position:absolute;left:46px;bottom:-14px;width:28px;height:28px;background:${s.bg || '#FFFDF9'};transform:rotate(45deg);border-radius:4px"></div></div>`;
      const [x, y] = XY(s, 228, 120);
      return { front: root(s, x, y, bub, o * clamp(prog(lt, 0, .2)), `translateY(${((1 - k) * -150).toFixed(1)}px)`), hideCaptions: s.hideCaptions ?? false };
    },

    // Poll / A-B debate: question + 2–3 options with animated percentage bars.
    sh_poll(s, t, lt) {
      const p = pal(s), g = geo(), o = life(s, t), size = s.size || 28, w = s.w || (g.v ? 600 : 760);
      const opts = (s.options || [{ text: 'Làm thuê ổn định', pct: 38 }, { text: 'Ra riêng khởi nghiệp', pct: 62 }]).map(x => (typeof x === 'string' ? { text: x, pct: 50 } : x));
      const best = opts.reduce((m, x, i) => (x.pct > opts[m].pct ? i : m), 0);
      const rows = opts.map((op, i) => {
        const kb = E.outCubic(prog(lt, .6 + i * .18, s.count ?? 1.1)), kr = E.outCubic(prog(lt, .3 + i * .12, .4));
        const win = i === best, col = op.color || (win ? p.accent : p.sage);
        return `<div${cidOf(op)} style="margin-top:${i ? 18 : 6}px;opacity:${kr.toFixed(3)};transform:translateY(${((1 - kr) * 12).toFixed(1)}px)">
          <div style="display:flex;align-items:baseline;gap:12px;font-family:${p.sans};font-size:${size}px;line-height:1.4">
            <span style="flex:none;font-family:${DISP};color:${col}">${String.fromCharCode(65 + i)}</span>
            <span style="flex:1;font-weight:${win ? 700 : 500};color:${p.ink}">${esc(op.text)}</span>
            <span style="flex:none;font-family:${DISP};font-size:${Math.round(size * 1.15)}px;color:${win ? p.accent : p.muted}">${Math.round(op.pct * kb)}%</span></div>
          <div style="height:14px;border-radius:7px;background:${rgba(p.ink, .08)};margin-top:6px;overflow:hidden"><div style="height:100%;width:${(op.pct * kb).toFixed(2)}%;background:${col};border-radius:7px"></div></div></div>`;
      }).join('');
      const head = `${kicker(s.kicker || 'Bạn chọn bên nào?', p, p.sage, 18)}<div style="font-family:${p.serif};font-weight:600;font-size:${Math.round(size * 1.35)}px;line-height:1.32;margin:4px 0 12px;color:${p.ink}">${rich(s.question || 'Làm thuê hay *ra riêng*?', lt, .15, 7, p)}</div>`;
      const foot = s.note ? `<div style="margin-top:16px;font-family:${p.sans};font-size:18px;line-height:1.4;color:${p.muted};opacity:${E.outCubic(prog(lt, 1.4, .4)).toFixed(3)}">${esc(s.note)}</div>` : '';
      const [x, y] = XY(s, BOT(), BOT()), ci = cardIn(lt);
      return { front: rootB(s, x, y, `<div style="width:${w}px;padding:28px 36px 30px;${paperBg(p)}">${head}${rows}${foot}</div>`, o * ci.k, `${ci.tr} rotate(${s.tilt ?? -.6}deg)`), hideCaptions: s.hideCaptions ?? true };
    },

    // Chapter divider. mode 'full': paper page wipes over the video; 'overlay': paper band in the lower third.
    sh_chapter(s, t, lt) {
      const p = pal(s), g = geo(), size = s.size || (s.mode === 'overlay' ? 40 : 62);
      const num = s.num ?? 'PHẦN 2', big = s.big ?? (String(num).match(/\d+/)?.[0]?.padStart(2, '0') || '');
      const kout = s.keep ? 0 : E.inCubic(prog(t, s.t1 - .35, .35));
      if (s.mode === 'overlay') {
        const kw = E.outExpo(prog(lt, 0, .55)), kt = E.outCubic(prog(lt, .25, .4));
        const band = `<div style="position:relative;width:${s.w || 620}px;padding:20px 34px 22px;${paperBg(p, 10)};clip-path:inset(-40px ${((1 - kw) * 100).toFixed(1)}% -40px 0);display:flex;align-items:center;gap:22px">
          <div style="flex:none;width:6px;align-self:stretch;background:${p.accent};border-radius:3px"></div>
          <div>${kicker(num, p, p.accent, 18)}<div style="font-family:${p.serif};font-weight:600;font-size:${size}px;line-height:1.3;color:${p.ink};opacity:${kt.toFixed(3)}">${rich(s.title || 'Thất bại đầu tiên', lt, .3, 8, p)}</div></div></div>`;
        const [x, y] = XY(s, 800, 560);
        return { front: root(s, x, y, band, 1 - kout, `rotate(${s.tilt ?? -1.5}deg)`), hideCaptions: s.hideCaptions ?? false };
      }
      const kw = E.outCubic(prog(lt, 0, .5)), kl = E.outCubic(prog(lt, .35, .5)), kb = E.outCubic(prog(lt, .1, .9));
      const page = `<div class="full" style="${paperBg(p, 0)};box-shadow:none;clip-path:inset(${((1 - kw) * 100).toFixed(1)}% 0 ${(kout * 100).toFixed(1)}% 0)"></div>`;
      const [x, y] = XY(s, 600, 340);
      const inner = `<div style="position:relative;text-align:center;width:${g.v ? 620 : 1000}px">
        ${big ? `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-56%) scale(${lerp(1.12, 1, kb).toFixed(3)});font-family:${DISP};font-size:${g.v ? 380 : 340}px;line-height:1;color:transparent;-webkit-text-stroke:2px ${rgba(p.accent, .2)};opacity:${kb.toFixed(3)}">${esc(big)}</div>` : ''}
        <div style="position:relative">${kicker(num, p, p.accent, 24)}
        <div style="width:${(kl * 120).toFixed(1)}px;height:2px;background:${p.ink};margin:16px auto 22px;opacity:.7"></div>
        <div style="font-family:${p.serif};font-weight:600;font-size:${size}px;line-height:1.28;color:${p.ink}">${rich(s.title || 'Thất bại *đầu tiên*', lt, .45, 6, p)}</div>
        ${s.sub ? `<div style="margin-top:20px;font-family:${p.sans};font-size:${Math.round(size * .38)}px;line-height:1.45;color:${p.muted};opacity:${E.outCubic(prog(lt, .9, .4)).toFixed(3)}">${esc(s.sub)}</div>` : ''}</div></div>`;
      return { front: page + root(s, x, y, inner, clamp(prog(lt, .2, .3)) * (1 - kout)), hideCaptions: s.hideCaptions ?? true };
    },

    // "Bài học" card: lightbulb, serif text, hand-drawn underline under *keywords* (or under the whole text).
    sh_lesson(s, t, lt) {
      const p = pal(s), g = geo(), o = life(s, t), size = s.size || 40, w = s.w || (g.v ? 600 : 760);
      const text = s.text || 'Đi chậm cũng được, miễn là *đừng dừng lại*.';
      const n = wordCount(text), wps = s.wps ?? 5, st = .45, hasHl = /\*/.test(text);
      const kb = E.outCubic(prog(lt, .2, .5)), kbi = E.outBack(prog(lt, .05, .5), 2);
      const head = `<div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
        <div style="width:58px;height:58px;transform:scale(${clamp(kbi, 0, 1.25).toFixed(3)}) rotate(${((1 - clamp(kbi)) * -20).toFixed(1)}deg)">${ICON.bulb(p, kb)}</div>
        ${kicker(s.kicker || 'Bài học', p, p.accent, 20)}</div>`;
      const body = `<div style="font-family:${p.serif};font-weight:500;font-size:${size}px;line-height:1.4;color:${p.ink}">${rich(text, lt, st, wps, p, { underline: hasHl ? p.accent : null })}</div>
        ${hasHl ? '' : underline(lt, st + n / wps, p.accent, true)}
        ${s.note ? `<div style="margin-top:14px;text-align:right;font-family:${HAND};font-size:${Math.round(size * .62)}px;line-height:1.6;color:${p.sage};transform:rotate(-3deg);opacity:${E.outCubic(prog(lt, st + n / wps + .3, .4)).toFixed(3)}">${esc(s.note)}</div>` : ''}`;
      const [x, y] = XY(s, BOT(), BOT()), ci = cardIn(lt);
      return { front: rootB(s, x, y, `<div style="width:${w}px;padding:28px 40px 34px;${paperBg(p)}">${head}${body}</div>`, o * ci.k, `${ci.tr} rotate(${s.tilt ?? -1}deg)`), hideCaptions: s.hideCaptions ?? true };
    },

    // Book / source card: cover image or generated book, title, author, note.
    sh_source(s, t, lt) {
      const p = pal(s), g = geo(), o = life(s, t), size = s.size || 34, w = s.w || (g.v ? 620 : 760);
      const kb = E.outCubic(prog(lt, .1, .7)), bc = s.color || p.accent;
      const bw = 150, bh = 222;
      const cover = s.cover
        ? `<img src="${url(s.cover)}" style="width:100%;height:100%;object-fit:cover;border-radius:3px 6px 6px 3px">`
        : `<div style="position:absolute;inset:0;border-radius:3px 7px 7px 3px;background:linear-gradient(90deg,${mix(bc, '#000000', .35)} 0,${mix(bc, '#000000', .1)} 9%,${bc} 13%,${mix(bc, '#ffffff', .08)} 60%,${bc});overflow:hidden">
            <div style="position:absolute;inset:0;background-image:${PAPER_GRAIN};background-size:200px 200px;opacity:.6"></div>
            <div style="position:absolute;left:24px;right:14px;top:22px;height:1.5px;background:${rgba(p.paper, .7)}"></div>
            <div style="position:absolute;left:24px;right:14px;top:30px;font-family:${p.serif};font-weight:700;font-size:21px;line-height:1.25;color:${p.paper}">${esc(s.book_title || s.title || 'Tên sách')}</div>
            <div style="position:absolute;left:24px;right:14px;bottom:18px;font-family:${p.sans};font-size:12px;letter-spacing:.12em;text-transform:uppercase;line-height:1.4;color:${rgba(p.paper, .85)}">${esc(s.author || '')}</div></div>`;
      const book = `<div style="flex:none;width:${bw}px;height:${bh}px;perspective:700px"><div style="position:relative;width:100%;height:100%;transform:rotateY(${lerp(-38, -14, kb).toFixed(1)}deg) translateY(${((1 - kb) * 20).toFixed(1)}px);transform-origin:0 50%;
        box-shadow:12px 16px 26px rgba(29,18,8,.35);border-radius:3px 7px 7px 3px">${cover}</div></div>`;
      const kt = E.outCubic(prog(lt, .35, .45));
      const info = `<div style="flex:1;min-width:0;opacity:${kt.toFixed(3)};transform:translateX(${((1 - kt) * 16).toFixed(1)}px)">
        ${kicker(s.kicker || 'Nguồn tham khảo', p, p.sage, 17)}
        <div style="font-family:${p.serif};font-weight:600;font-size:${size}px;line-height:1.28;color:${p.ink};margin-top:6px">${esc(s.title || 'Tên sách')}</div>
        ${s.author ? `<div style="font-family:${p.sans};font-weight:500;font-size:${Math.round(size * .62)}px;line-height:1.4;color:${p.muted};margin-top:8px">${esc(s.author)}</div>` : ''}
        ${s.note ? `<div style="font-family:${p.serif};font-style:italic;font-size:${Math.round(size * .6)}px;line-height:1.4;color:${p.accent};margin-top:12px">${esc(s.note)}</div>` : ''}</div>`;
      const [x, y] = XY(s, BOT(), BOT()), ci = cardIn(lt);
      return { front: rootB(s, x, y, `<div style="width:${w}px;padding:30px 34px;${paperBg(p)};display:flex;align-items:center;gap:30px">${book}${info}</div>`, o * ci.k, `${ci.tr} rotate(${s.tilt ?? .8}deg)`), hideCaptions: s.hideCaptions ?? true };
    },

    // Polaroid memories: images[] (or a frozen frame of the speaker) dropped on with tilt, tape and caption.
    sh_memory(s, t, lt) {
      const p = pal(s), g = geo(), o = life(s, t);
      const imgs = (s.images && s.images.length ? s.images : [{ freeze: s.freeze ?? s.t0, caption: s.caption }]).slice(0, 3).map(x => (typeof x === 'string' ? { src: x } : x));
      const n = imgs.length, pw = s.size || (n === 1 ? 380 : n === 2 ? 320 : 270);
      const offs = n === 1 ? [[0, 0, s.tilt ?? -4]] : n === 2 ? [[-150, -30, -7], [150, 40, 6]] : [[-205, 10, -9], [0, -50, 3], [205, 30, 8]];
      const dim = s.backdrop === false ? '' : `<div class="full" style="background:radial-gradient(ellipse at 50% 60%,rgba(25,16,8,.25),rgba(25,16,8,.6));opacity:${o.toFixed(3)}"></div>`;
      const cards = imgs.map((im, i) => {
        const ti = s.t0 + .1 + i * (s.stagger ?? .45), k = E.outCubic(prog(t, ti, .55)), kd = E.outBack(prog(t, ti, .55), 1.4);
        if (t < ti) return '';
        const zoom = 1 + .06 * prog(t, ti, Math.max(1, s.t1 - ti));
        const photo = im.src
          ? `<img src="${url(im.src)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:sepia(.18) saturate(.92) contrast(.97);transform:scale(${zoom.toFixed(4)})">`
          : `<div style="position:absolute;inset:0;transform:scale(${zoom.toFixed(4)})">${arollImg(im.freeze ?? s.t0, 'sepia(.28) saturate(.88) contrast(.95) brightness(1.04)', 'object-position:50% 32%')}</div>`;
        const date = (im.date || (i === 0 && s.date)) ? `<div style="position:absolute;right:12px;bottom:10px;font-family:'Courier New',monospace;font-weight:700;font-size:${Math.round(pw * .058)}px;color:#FF9A3C;text-shadow:0 0 6px rgba(255,120,30,.8);letter-spacing:.06em">${esc(im.date || s.date)}</div>` : '';
        const cap = im.caption ?? (i === 0 ? s.caption : '');
        const [ox, oy, rot] = offs[i];
        return `<div${cidOf(im)} style="position:absolute;left:${ox}px;top:${oy}px;transform:translate(-50%,-50%) rotate(${(rot * kd).toFixed(2)}deg) scale(${lerp(1.25, 1, kd).toFixed(3)});opacity:${clamp(k * 1.6).toFixed(3)};
          width:${pw}px;padding:${Math.round(pw * .05)}px ${Math.round(pw * .05)}px 0;background:#FBF8F1;background-image:${PAPER_GRAIN};background-size:200px 200px;box-shadow:0 ${lerp(40, 14, k).toFixed(0)}px ${lerp(60, 30, k).toFixed(0)}px rgba(20,12,4,${lerp(.15, .45, k).toFixed(2)})">
          <div style="position:relative;width:100%;height:${Math.round(pw * 1.12)}px;overflow:hidden;background:#222">${photo}${date}
            <div class="full" style="background:linear-gradient(160deg,rgba(255,220,170,.18),rgba(0,0,0,0) 50%,rgba(60,30,10,.18))"></div></div>
          <div style="height:${Math.round(pw * .24)}px;display:flex;align-items:center;justify-content:center;font-family:${HAND};font-size:${Math.round(pw * .068)}px;line-height:1.7;color:${p.ink};white-space:nowrap;overflow:hidden">${esc(cap || '')}</div>
          <div style="position:absolute;left:50%;top:-14px;width:${Math.round(pw * .36)}px;height:30px;margin-left:-${Math.round(pw * .18)}px;background:${rgba(p.paper2, .78)};transform:rotate(${i % 2 ? 4 : -3}deg);box-shadow:0 1px 3px rgba(0,0,0,.12)"></div></div>`;
      }).join('');
      const [x, y] = XY(s, 700, 360);
      return { front: dim + `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;opacity:${o.toFixed(3)}">${cards}</div>`, hideCaptions: s.hideCaptions ?? true };
    },

    // Warm CTA: save + share buttons with icons, handle.
    sh_cta(s, t, lt) {
      const p = pal(s), g = geo(), o = life(s, t), size = s.size || 40, w = s.w || (g.v ? 600 : 720);
      const handle = s.handle ?? BR().handle ?? '';
      const btn = (i, icon, label, at) => {
        const kp = prog(lt, at, .5), on = lt >= at, pulse = on ? 1 + .18 * Math.sin(Math.PI * clamp(kp)) : 1;
        const kin = E.outBack(prog(lt, .35 + i * .12, .45), 1.8);
        return `<div style="flex:1;display:flex;align-items:center;justify-content:center;gap:12px;padding:14px 10px;border-radius:999px;${on ? `background:${p.accent};color:${p.paper};` : `border:2px solid ${rgba(p.ink, .2)};color:${p.ink};`}
          font-family:${p.sans};font-weight:700;font-size:24px;line-height:1.3;transform:scale(${clamp(kin, 0, 1.2).toFixed(3)})">
          <span style="width:30px;height:30px;display:inline-block;transform:scale(${pulse.toFixed(3)})">${icon(on ? p.paper : p.ink, on ? p.paper : 'none')}</span>${esc(label)}</div>`;
      };
      const card = `<div style="width:${w}px;padding:30px 36px 28px;${paperBg(p)};text-align:center">
        ${kicker(s.kicker || 'Nếu video có ích với bạn', p, p.sage, 18)}
        <div style="font-family:${p.serif};font-weight:600;font-size:${size}px;line-height:1.3;color:${p.ink};margin:8px 0 22px">${rich(s.title || '*Lưu lại* & chia sẻ cho người cần nhé', lt, .2, s.wps ?? 12, p)}</div>
        <div style="display:flex;gap:16px">${btn(0, ICON.bookmark, s.save || 'Lưu lại', s.save_at ?? 1.1)}${btn(1, ICON.share, s.share || 'Chia sẻ', s.share_at ?? 1.5)}</div>
        ${handle ? `<div style="margin-top:18px;font-family:${p.sans};font-weight:600;font-size:21px;line-height:1.4;color:${p.muted};opacity:${E.outCubic(prog(lt, .8, .4)).toFixed(3)}">${esc(handle)}</div>` : ''}</div>`;
      const [x, y] = XY(s, BOT(), BOT()), ci = cardIn(lt);
      return { front: rootB(s, x, y, card, o * ci.k, ci.tr), hideCaptions: s.hideCaptions ?? true };
    },

    // Warm film grade over the whole video: tint + vignette + animated grain (+ optional light leak). Put it first in scenes.
    sh_grade(s, t, lt) {
      const I = s.intensity ?? 1, mode = s.mode || 'warm';
      const f = { warm: `sepia(${.14 * I}) saturate(${1 + .06 * I}) contrast(${1 + .03 * I})`, film: `sepia(${.2 * I}) saturate(${1 - .08 * I}) contrast(${1 - .05 * I}) brightness(${1 + .02 * I})`, soft: `sepia(${.08 * I}) contrast(${1 - .06 * I}) brightness(${1 + .03 * I})` }[mode] || '';
      const o = s.fade === false ? 1 : fadeIO(t, s.t0, s.t1, .4, .4);
      const j = Math.floor(t * 12), gx = (j * 73) % 200, gy = (j * 131) % 200;
      const tint = s.tint || '#FF9A4D';
      const vg = s.vignette ?? .5, gr = s.grain ?? (mode === 'film' ? .5 : .3);
      let html = `<div class="full" style="backdrop-filter:${f};-webkit-backdrop-filter:${f}"></div>
        <div class="full" style="background:${tint};mix-blend-mode:soft-light;opacity:${(.28 * I).toFixed(3)}"></div>`;
      if (mode === 'film') html += `<div class="full" style="background:rgba(60,35,20,1);mix-blend-mode:lighten;opacity:.14"></div>`;
      if (vg) html += `<div class="full" style="background:radial-gradient(ellipse 75% 62% at 50% 46%,rgba(30,15,5,0) 55%,rgba(30,15,5,${vg}) 100%)"></div>`;
      if (gr) html += `<div class="full" style="background-image:${FILM_GRAIN};background-size:200px 200px;background-position:${gx}px ${gy}px;mix-blend-mode:overlay;opacity:${gr}"></div>`;
      if (s.leak) {
        const lx = 92 + Math.sin(t * .5) * 8, ly = 18 + Math.cos(t * .37) * 10;
        html += `<div class="full" style="background:radial-gradient(circle at ${lx.toFixed(1)}% ${ly.toFixed(1)}%,rgba(255,140,60,.55),rgba(255,90,60,.18) 25%,rgba(0,0,0,0) 45%);mix-blend-mode:screen;opacity:${(.6 + .25 * Math.sin(t * 1.3)).toFixed(3)}"></div>`;
      }
      return { front: `<div class="full"${cidOf(s)} style="pointer-events:none;opacity:${o.toFixed(3)}">${html}</div>` };
    },
  };
  Object.assign(MODULES, M);

  // ---------- captions: calm editorial ----------
  // Sentence case, cream text over a soft ink wash, words fade in as spoken, hl words italic serif terracotta.
  CAPTION_STYLES.share = (c, t) => {
    const p = pal(), g = geo();
    const size = c.size || (g.v ? 34 : 36), wpx = g.v ? 600 : 1000;
    const x = c.x ?? g.W / 2, top = c.y ?? (g.v ? 905 : 575);
    const caps = TL.captions || [], i = caps.indexOf(c), prev = i > 0 ? caps[i - 1] : null;
    const lastW = prev && prev.words.length ? prev.words[prev.words.length - 1].w : '';
    const cap1 = !prev || /[.!?…]$/.test(lastW) || c.t0 - prev.t1 > .6;
    const reveal = TL.caption_reveal !== false;
    const hlCol = c.hl_color || mix(p.accent, '#ffffff', .22);
    const html = c.words.map((w, k) => {
      let txt = w.w; if (k === 0 && cap1) txt = txt.charAt(0).toUpperCase() + txt.slice(1);
      const e = reveal ? E.outCubic(prog(t, w.s - .06, .3)) : 1;
      const st = `display:inline-block;opacity:${e.toFixed(3)};transform:translateY(${((1 - e) * 6).toFixed(1)}px)`;
      const hs = w.hl ? `;font-family:${c.hl_font || "'Playfair Display',serif"};font-style:italic;font-weight:700;font-size:1.14em;color:${hlCol};letter-spacing:0` : '';
      return `<span style="${st}${hs}">${esc(txt)}</span>` + (w.br ? '<br>' : ' ');
    }).join('');
    return `<div id="cap"${cidOf(c)} style="top:${top}px;left:${x - wpx / 2}px;right:auto;width:${wpx}px;text-align:center;font-family:${c.font || p.sans};font-weight:${c.weight || 600};font-size:${size}px;line-height:1.42;letter-spacing:-.005em;
      color:${c.color || '#FBF6EE'};text-shadow:0 2px 12px rgba(20,12,6,.75),0 1px 3px rgba(20,12,6,.6);white-space:normal">
      <div style="display:inline-block;padding:14px 34px;background:radial-gradient(closest-side,rgba(24,16,10,.5),rgba(24,16,10,.28) 70%,rgba(24,16,10,0));border-radius:40px">${html}</div></div>`;
  };

  // ---------- Studio metadata + recipe ----------
  const make = (type, d, o) => T => ({ type, t0: T, t1: T + d, ...o });
  PACKS.push({
    id: P, name: 'Chia sẻ / kể chuyện', icon: '💬',
    desc: 'Thẻ giấy kem ấm, chữ serif, cam đất + xanh xô thơm: trích dẫn, con số, bài học, dòng thời gian, trả lời bình luận, ảnh kỷ niệm',
    caption: 'share',
    items: [
      { type: 'sh_quote', label: 'Thẻ trích dẫn', make: make('sh_quote', 4, { text: 'Thành công là đi từ thất bại này đến thất bại khác mà *không mất nhiệt huyết*.', author: 'Winston Churchill' }) },
      { type: 'sh_stat', label: 'Con số lớn', make: make('sh_stat', 2.6, { value: '3 năm', label: 'tự học, không bằng cấp' }) },
      { type: 'sh_list', label: 'Danh sách bài học', make: T => ({ type: 'sh_list', t0: T, t1: T + 5, title: '3 điều mình *ước biết sớm hơn*', items: [{ text: 'Tiền mặt quan trọng hơn lợi nhuận', t: T + .8 }, { text: 'Chọn người trước, chọn việc sau', t: T + 2 }, { text: 'Đừng ngại hỏi người đi trước', t: T + 3.2 }] }) },
      { type: 'sh_timeline', label: 'Dòng thời gian', make: T => ({ type: 'sh_timeline', t0: T, t1: T + 4.5, items: [{ year: '2019', text: 'Mở quán cà phê đầu tiên', t: T + .5 }, { year: '2021', text: 'Đóng cửa vì dịch', t: T + 1.5 }, { year: '2023', text: 'Làm lại với mô hình online', t: T + 2.5 }] }) },
      { type: 'sh_comment', label: 'Trả lời bình luận', make: make('sh_comment', 4, { user: '@thuy.nguyen', text: 'Anh ơi, làm sao để bắt đầu khi không có vốn?' }) },
      { type: 'sh_poll', label: 'Bình chọn A/B', make: make('sh_poll', 4, { question: 'Làm thuê hay *ra riêng*?', options: [{ text: 'Làm thuê ổn định', pct: 38 }, { text: 'Ra riêng khởi nghiệp', pct: 62 }], note: '2.348 người đã bình chọn' }) },
      { type: 'sh_chapter', label: 'Chương / phần', make: make('sh_chapter', 2, { num: 'PHẦN 2', title: 'Thất bại *đầu tiên*', mode: 'full' }) },
      { type: 'sh_lesson', label: 'Thẻ bài học', make: make('sh_lesson', 4, { text: 'Đi chậm cũng được, miễn là *đừng dừng lại*.', note: 'ghi nhớ nhé!' }) },
      { type: 'sh_source', label: 'Sách / nguồn', make: make('sh_source', 3.5, { title: 'Nhà giả kim', author: 'Paulo Coelho', note: 'Cuốn sách đổi cách mình nghĩ' }) },
      { type: 'sh_memory', label: 'Ảnh kỷ niệm', make: make('sh_memory', 3.5, { caption: 'Ngày đầu khởi nghiệp', date: "'19 08 24" }) },
      { type: 'sh_cta', label: 'Lưu lại & chia sẻ', make: make('sh_cta', 3, {}) },
      { type: 'sh_grade', label: 'Màu phim ấm (cả video)', make: T => ({ type: 'sh_grade', t0: 0, t1: Math.max(T + 3, (typeof TL !== 'undefined' && TL && TL.duration) || T + 10), mode: 'warm' }) },
    ],
    recipe: ctx => {
      const dur = ctx.dur, caps = ctx.captions || [], sc = [], busy = [];
      const free = (a, b) => busy.every(([x, y]) => b <= x || a >= y);
      const take = (sceneObj) => { sc.push(sceneObj); busy.push([sceneObj.t0, sceneObj.t1]); };
      const end = dur - 3;
      sc.push({ type: 'sh_grade', t0: 0, t1: dur, mode: 'warm' });
      // Hook: chapter overlay with the title, else a short quote of the opening line.
      if (ctx.title || !caps.length) take({ type: 'sh_chapter', t0: .1, t1: Math.min(2.5, dur * .3), mode: 'overlay', num: 'CÂU CHUYỆN', title: ctx.title || 'Điều mình ước biết sớm hơn' });
      else {
        const first = caps[0].words.slice(0, 10).map(w => w.w).join(' ');
        take({ type: 'sh_chapter', t0: .1, t1: Math.min(2.5, dur * .3), mode: 'overlay', num: 'CÂU CHUYỆN', title: first.charAt(0).toUpperCase() + first.slice(1) });
      }
      const ws = capWords(caps), clean = w => w.replace(/[.,!?…:;"“”]+$/g, '');
      const isNum = w => /^\d[\d.,]*%?$/.test(w);
      // Stat: "<số> năm|tỷ|tỉ|triệu" or "<số>%".
      for (let i = 0; i < ws.length; i++) {
        const w = clean(ws[i].low), pv = i ? clean(ws[i - 1].low) : '';
        let val = null, ts = ws[i].s;
        if (/%$/.test(w) && isNum(w)) val = w;
        else if (['năm', 'tỷ', 'tỉ', 'triệu'].includes(w) && isNum(pv)) { val = `${pv} ${w}`; ts = ws[i - 1].s; }
        if (!val) continue;
        const a = Math.max(2.6, ts - .1), b = a + 2.6;
        if (b <= end && free(a, b)) {
          const label = ws.slice(i + 1, i + 5).map(x => x.w).join(' ');
          take({ type: 'sh_stat', t0: +a.toFixed(2), t1: +b.toFixed(2), value: val, label }); break;
        }
      }
      // List: "điều" / "bài học" → following caption chunks become items.
      const tl = findWord(caps, ['bài học', 'điều'], 2.6);
      if (tl != null) {
        let a = Math.max(2.6, tl - .1);
        for (const [x, y] of busy) if (a >= x && a < y) a = y + .05;   // starts right after an overlapping graphic
        const b = Math.min(a + 7, end - 3.5);
        if (b - a > 3 && free(a, b)) {
          const iw = ws.findIndex(x => x.s >= tl), n = iw > 0 && /^\d+$/.test(clean(ws[iw - 1].low)) ? ws[iw - 1].w : '3';
          const items = caps.filter(c => c.t0 > tl + .6 && c.t0 < b - .8).slice(0, 3).map(c => ({ text: c.words.slice(0, 7).map(w => w.w).join(' '), t: +c.t0.toFixed(2) }));
          if (items.length) take({ type: 'sh_list', t0: +a.toFixed(2), t1: +b.toFixed(2), title: `${n} điều *đáng nhớ*`, items });
        }
      }
      // Lesson near the end, CTA for the last 3 s.
      const la = Math.max(2.6, dur - 7.2), lb = dur - 3.1;
      if (lb - la >= 2.5 && free(la, lb)) {
        const said = ws.filter(w => w.s >= la && w.s < lb).slice(0, 14).map(w => w.w).join(' ');
        take({ type: 'sh_lesson', t0: +la.toFixed(2), t1: +lb.toFixed(2), text: said ? said.charAt(0).toUpperCase() + said.slice(1) : 'Đi chậm cũng được, miễn là *đừng dừng lại*.' });
      }
      sc.push({ type: 'sh_cta', t0: +Math.max(0, dur - 3).toFixed(2), t1: dur, handle: ctx.brand?.handle || '' });
      return { caption_style: 'share', music: 'mellow', scenes: sc };
    },
  });
})();
