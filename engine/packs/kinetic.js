// Pack "kinetic" — kinetic typography + fast b-roll cuts for short-form (TikTok / Reels / Shorts).
// Ported from the specs video-edit-kinetic-broll ("POV: your content after I edit it": multi-size word stacks,
// black scenes with a glowing red arc, diamonds, portrait card, blur-back-to-talk) and taki-video-edit-reference-shortform
// (Anton cream headings with dark stroke, Montserrat ExtraBold captions, hard cuts + punch zoom, b-roll every 2.5–3 s).
// Design space 720×1280 (vertical, primary) or 1280×720 via DIMS(). Doc: references/pack-kinetic.md.
(() => {
  const P = 'kinetic';

  // Anton (heading) + Inter Tight (kinetic words) are not in index.html — inject them once at load.
  if (typeof document !== 'undefined' && !document.querySelector('link[data-pack-font="kinetic"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.dataset.packFont = 'kinetic';
    l.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Inter+Tight:wght@400;500;600;700;800;900&display=block';
    document.head.appendChild(l);
  }

  const HEAD = "'Anton','Oswald','Be Vietnam Pro',sans-serif";
  const KIN = "'Inter Tight','Inter','Be Vietnam Pro',sans-serif";
  const CAPF = "'Montserrat','Be Vietnam Pro',sans-serif";

  // Pack palette; TL.brand (primary/accent/dark/light/font/disp) overrides it.
  const K = () => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return {
      hi: b.accent || '#F6E7A2',        // cream-yellow heading / keyword (TAKI)
      red: b.primary || '#E0362C',      // accent red (bars, buttons)
      dark: b.dark || '#0A0A0A',        // black scene (10,10,10)
      light: b.light || '#FFFFFF',
      arc: 'rgb(68,20,14)', dFill: 'rgb(60,20,16)', dLine: 'rgb(190,72,62)', ring: 'rgb(163,46,64)', paper: '#F3F3F3',
      head: b.disp && b.disp !== 'var(--disp)' ? b.disp : HEAD,
      kin: b.font && b.font !== 'var(--sans)' ? b.font : KIN,
    };
  };
  const WH = () => DIMS();
  const stroke = (w, c = '#000') => strokeShadow(w, c);
  // Uppercase-Anton width ≈ .5 em/glyph, Inter Tight 900 ≈ .6 em → shrink so a line never overflows maxW.
  const fitPx = (text, size, maxW, em = .5) => Math.min(size, Math.floor(maxW / (Math.max(1, [...String(text)].length) * em)));
  // Word entrance from the spec: 0.2 s, blur → sharp, opacity up, slight rise. Out = instant (hard cut).
  const rise = (t, t0, d = .2, dy = 14, blur = 10) => {
    if (t < t0) return 'opacity:0;';
    const k = E.outCubic(prog(t, t0, d));
    return `opacity:${k.toFixed(3)};transform:translateY(${((1 - k) * dy).toFixed(1)}px);${k < 1 ? `filter:blur(${((1 - k) * blur).toFixed(1)}px);` : ''}`;
  };
  const slamK = (t, t0, d = .26) => E.outExpo(prog(t, t0, d));
  // Hard-cut entrance flash (one or two frames of white) used by graphic scenes.
  const cutFlash = (lt, on = true) => (on && lt < .1 ? `<div class="full" style="background:#fff;opacity:${(1 - lt / .1).toFixed(3)}"></div>` : '');
  const arollSrc = t => (TL.aroll ? url(fmtSeq(TL.aroll.frames, frameAt(t))) : '');
  const faceXY = s => {
    const [W, H] = WH(), f = TL.face || {};
    return { x: s.fx ?? f.x ?? W / 2, y: s.fy ?? f.y ?? H * .4 };
  };

  // Glowing quarter-disc arc in a corner (maroon fill, white rim + halo), grows 0.45 s, white dot runs the rim in 1.0 s.
  function arcBg(lt, o = {}) {
    const [W, H] = WH(), c = K();
    const R = (o.r ?? .546) * Math.min(W, H) * E.outCubic(prog(lt, 0, .45));
    const corner = o.corner || 'bl';
    const cx = corner.includes('r') ? W : 0, cy = corner.includes('b') ? H : 0;
    const sx = cx ? -1 : 1, sy = cy ? -1 : 1;
    const a = [cx, cy + sy * R], b = [cx + sx * R, cy];
    const sweep = (sx * sy > 0) ? 0 : 1;
    const ph = E.inOutSine(prog(lt, .1, 1)) * Math.PI / 2;
    const dot = [cx + sx * R * Math.sin(ph), cy + sy * R * Math.cos(ph)];
    const rim = Math.max(3, W * .007);
    return `<div class="full" style="background:${c.dark}"></div>
      <svg class="full" viewBox="0 0 ${W} ${H}" style="overflow:visible">
        ${R > 1 ? `<path d="M${cx},${cy} L${a[0]},${a[1]} A${R} ${R} 0 0 ${sweep} ${b[0]},${b[1]} Z" fill="${c.arc}"/>
        <path d="M${a[0]},${a[1]} A${R} ${R} 0 0 ${sweep} ${b[0]},${b[1]}" fill="none" stroke="#fff" stroke-width="${rim}" style="filter:drop-shadow(0 0 6px #fff) drop-shadow(0 0 18px rgba(255,90,60,.9))"/>
        <circle cx="${dot[0].toFixed(1)}" cy="${dot[1].toFixed(1)}" r="${(rim * 1.6).toFixed(1)}" fill="#fff" style="filter:drop-shadow(0 0 10px #fff)"/>` : ''}
      </svg>`;
  }
  // Background modes shared by text scenes: 'arc' (black + arc), 'dark' (black + red glow), 'dim' (darkened a-roll), 'none'.
  function sceneBg(s, lt, mode) {
    const c = K();
    if (mode === 'arc') return { back: arcBg(lt, { corner: s.arc_corner, r: s.arc_r }), cover: true };
    if (mode === 'dark') return { back: `<div class="full" style="background:radial-gradient(circle at 50% 46%, rgba(160,30,20,.55) 0, ${c.dark} 58%)"></div>`, cover: true };
    if (mode === 'dim') return { back: `<div class="full" style="background:rgba(0,0,0,${s.dim ?? .58})"></div>`, cover: false };
    return { back: '', cover: false };
  }

  // ---------------------------------------------------------------- captions (caption_style: "kinetic")
  // Groups of 1–3 words replace each other; each word pops in 0.2 s (blur → sharp, rise); a group vanishes instantly.
  // Keyword (w.hl, or auto: digits / inner capitals like iRobot, OpenAI) = Anton cream ×1.7 on its own line.
  function groupsOf(words) {
    const g = [];
    let cur = [];
    words.forEach((w, i) => {
      const prev = words[i - 1];
      if (cur.length && (cur.length >= 3 || w.br || (prev && (isHl(prev) || isHl(w))) || (prev && w.s - (prev.e ?? prev.s) > .4))) { g.push(cur); cur = []; }
      cur.push(w);
    });
    if (cur.length) g.push(cur);
    return g;
  }
  const isHl = w => !!w.hl || (TL.kinetic_auto_hl !== false && (/\d/.test(w.w) || /[A-Z]/.test(w.w)));
  function kineticCaption(c, t) {
    const [W, H] = WH(), col = K();
    const groups = groupsOf(c.words || []);
    let g = null;
    for (const gr of groups) if (t >= gr[0].s - .02) g = gr;
    if (!g) return `<div id="cap"${cidOf(c)} style="display:none"></div>`;
    const size = c.size || (VERT() ? 50 : 44);
    const y = c.y ?? H * (VERT() ? .69 : .8), x = c.x ?? W / 2, half = Math.min(x, W - x) - 30;
    const html = g.filter(w => t >= w.s - .02).map(w => {
      const hl = isHl(w);
      const fs = hl ? fitPx(w.w, size * 1.7, half * 2, .5) : size;
      const st = hl
        ? `display:block;font-family:${col.head};font-weight:400;font-size:${fs}px;line-height:1.08;color:${c.color || col.hi};letter-spacing:.01em;text-shadow:${stroke(4)},0 7px 0 #000,0 10px 24px rgba(0,0,0,.5)`
        : `display:inline-block;margin:0 .14em;font-family:${c.font || CAPF};font-weight:${c.weight || 800};font-size:${fs}px;line-height:1.15;color:${c.color || '#fff'};text-shadow:${stroke(3)},0 5px 0 #000`;
      const k = E.outBack(prog(t, w.s - .02, .22), 1.8);
      const sc = hl ? `scale(${lerp(.55, 1, clamp(k, 0, 1.15)).toFixed(3)})` : '';
      return `<span style="${st};${rise(t, w.s - .02, .2, 12, 8)}${hl ? `transform:${sc};` : ''}">${esc(w.w)}</span>`;
    }).join('');
    return `<div id="cap"${cidOf(c)} style="left:${x - half}px;right:auto;width:${half * 2}px;top:${y}px;transform:translateY(-50%);text-align:center;white-space:normal;text-shadow:none;font-weight:800">${html}</div>`;
  }
  CAPTION_STYLES.kinetic = kineticCaption;

  // ---------------------------------------------------------------- modules
  const TIER = { xs: .38, s: .5, m: .74, l: 1, xl: 1.45 };
  Object.assign(MODULES, {
    // Multi-size word stack ("thậm chí / KHỦNG KHIẾP / hơn"): words: [{ text, t, tier: xs|s|m|l|xl, align: left|center|right, hl }]
    // Each word on its own row unless { row:n } groups them. size = px of tier l. bg: arc | dark | dim | none.
    kinetic_words(s, t, lt) {
      const [W, H] = WH(), c = K();
      const x = s.x ?? W / 2, y = s.y ?? H * (VERT() ? .495 : .5), L = s.size || (VERT() ? 104 : 120);
      const maxW = W - 80;
      const rows = [];
      (s.words || []).forEach((w, i) => { const r = w.row ?? i; (rows[r] = rows[r] || []).push(w); });
      const html = rows.filter(Boolean).map(r => {
        const al = r[0].align || 'center';
        const txt = r.map(w => w.text).join(' ');
        const big = r.some(w => (TIER[w.tier || 'l'] || 1) >= .74);
        const em = big ? .56 : .55;
        return `<div style="align-self:${al === 'left' ? 'flex-start' : al === 'right' ? 'flex-end' : 'center'};white-space:nowrap;line-height:1.02">${r.map(w => {
          const tier = TIER[w.tier || 'l'] || 1, heavy = tier >= .74;
          const fs = fitPx(txt, L * tier, maxW, em);
          return `<span${cidOf(w)} style="display:inline-block;margin:0 .1em;font-family:${c.kin};font-weight:${heavy ? 900 : 500};font-size:${fs}px;letter-spacing:${heavy ? '-.03em' : '0'};
            color:${w.hl ? c.hi : w.color || '#fff'};${w.hl ? `text-shadow:0 0 30px ${c.red}88;` : ''}${rise(t, w.t ?? s.t0, .2, 16, 12)}">${esc(w.text)}</span>`;
        }).join('')}</div>`;
      }).join('');
      const bg = sceneBg(s, lt, s.bg || 'arc');
      return {
        ...bg,
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;max-width:${maxW}px">${html}</div>` + cutFlash(lt, s.flash),
        hideCaptions: s.hideCaptions ?? true,
      };
    },

    // Big number / word slam: text (or count:{to,prefix,suffix,dur}) slams from ×2.2 + shake, labels above/below. bg: dark | arc | dim | none.
    kinetic_slam(s, t, lt) {
      const [W, H] = WH(), c = K();
      const x = s.x ?? W / 2, y = s.y ?? H * .47;
      let text = s.text ?? '90%';
      if (s.count) {
        const k = E.outCubic(prog(lt, .05, s.count.dur ?? .8)), v = (s.count.to ?? 100) * k;
        text = `${s.count.prefix || ''}${Number.isInteger(s.count.to ?? 100) ? Math.round(v) : v.toFixed(1)}${s.count.suffix || ''}`;
      }
      const full = s.count ? `${s.count.prefix || ''}${s.count.to ?? 100}${s.count.suffix || ''}` : text;
      const size = fitPx(full, s.size || (VERT() ? 360 : 280), W - 70, .5);
      const k = slamK(t, s.t0), sh = lt > .26 && lt < .6 ? (1 - prog(lt, .26, .34)) * 9 : 0, j = Math.floor(t * 30);
      const dx = sh * Math.sin(j * 2.3), dy = sh * Math.cos(j * 1.7);
      const lab = (txt, d, top) => (txt ? `<div style="font-family:${c.kin};font-weight:800;font-size:${fitPx(txt, s.label_size || 46, W - 80, .58)}px;color:#fff;letter-spacing:.02em;text-transform:${s.upper === false ? 'none' : 'uppercase'};
        text-shadow:0 4px 18px rgba(0,0,0,.6);white-space:nowrap;margin:${top ? '0 0 6px' : '10px 0 0'};${rise(t, s.t0 + d, .2, top ? -14 : 14)}">${esc(txt)}</div>` : '');
      const rays = (s.rays ?? true) && (s.bg || 'dark') !== 'none'
        ? `<div class="full" style="opacity:${(.35 * k).toFixed(3)};background:repeating-conic-gradient(from ${(lt * 18).toFixed(1)}deg at ${x}px ${y}px, rgba(255,255,255,.10) 0 6deg, transparent 6deg 18deg);-webkit-mask-image:radial-gradient(circle at ${x}px ${y}px,#000 0,transparent 70%);mask-image:radial-gradient(circle at ${x}px ${y}px,#000 0,transparent 70%)"></div>` : '';
      const bg = sceneBg(s, lt, s.bg || 'dark');
      return {
        ...bg, back: bg.back + rays,
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px);text-align:center;display:flex;flex-direction:column;align-items:center">
          ${lab(s.top, .12, true)}
          <div style="font-family:${c.head};font-size:${size}px;line-height:.95;color:${s.color || c.hi};white-space:nowrap;opacity:${clamp(k * 2.5).toFixed(3)};transform:scale(${lerp(2.2, 1, k).toFixed(3)});
            ${k < .9 ? `filter:blur(${((1 - k) * 14).toFixed(1)}px);` : ''}text-shadow:${stroke(5)},0 10px 0 #000,0 0 60px ${c.red}aa">${esc(text)}</div>
          ${lab(s.bottom, .32, false)}</div>` + cutFlash(lt, s.flash ?? true),
        hideCaptions: s.hideCaptions ?? true,
      };
    },

    // Two opposing concepts as diamonds ("OpenAI ◆ vs ◆ Anthropic"): items:[{ text, icon, t }], title, vs. bg: arc | dark | dim.
    kinetic_diamonds(s, t, lt) {
      const [W, H] = WH(), c = K();
      const items = s.items || [{ text: 'trước', t: s.t0 }, { text: 'sau', t: s.t0 + .5 }];
      const y = s.y ?? H * .48, hd = (s.size || (VERT() ? .15 : .1)) * W, gap = s.gap ?? (VERT() ? W * .5 : W * .32);
      const x0 = (s.x ?? W / 2) - gap / 2;
      const ds = items.slice(0, 2).map((it, i) => {
        const ti = it.t ?? s.t0 + i * .45, k = E.outBack(prog(t, ti, .32), 1.9);
        if (t < ti) return '';
        const cx = x0 + i * gap;
        const ic = it.icon ? `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-45deg)">${slIcon(it.icon, hd * .72, 'white')}</div>` : '';
        return `<div${cidOf(it)} style="position:absolute;left:${cx}px;top:${y}px;transform:translate(-50%,-50%) scale(${clamp(k, 0, 1.25).toFixed(3)});opacity:${clamp(k * 3).toFixed(3)};text-align:center">
          <div style="position:relative;width:${hd * 1.414}px;height:${hd * 1.414}px;margin:0 auto;transform:rotate(45deg);background:${c.dFill};border:${Math.max(3, W * .006)}px solid ${c.dLine};box-shadow:0 0 30px ${c.dLine}66,inset 0 0 30px rgba(0,0,0,.4)">${ic}</div>
          <div style="margin-top:${hd * .55}px;font-family:${c.kin};font-weight:900;font-size:${fitPx(it.text, s.label_size || 46, gap - 20, .56)}px;color:#fff;white-space:nowrap;letter-spacing:-.02em">${esc(it.text)}</div></div>`;
      }).join('');
      const tv = items[1]?.t ?? s.t0 + .45;
      const vs = s.vs === false ? '' : `<div style="position:absolute;left:${x0 + gap / 2}px;top:${y}px;transform:translate(-50%,-50%);font-family:${c.kin};font-weight:500;font-style:italic;font-size:${s.vs_size || 34}px;color:${c.hi};${rise(t, tv, .2)}">${esc(s.vs || 'vs')}</div>`;
      const title = s.title ? `<div style="position:absolute;left:0;right:0;top:${y - hd * 2.2}px;text-align:center;font-family:${c.kin};font-weight:500;font-size:${fitPx(s.title, 40, W - 80, .55)}px;color:rgba(255,255,255,.9);${rise(t, s.t0, .2)}">${esc(s.title)}</div>` : '';
      const bg = sceneBg(s, lt, s.bg || 'arc');
      return { ...bg, front: `<div class="abs full"${cidOf(s)}>${title}${ds}${vs}</div>` + cutFlash(lt, s.flash), hideCaptions: s.hideCaptions ?? true };
    },

    // Portrait / brand card on light paper: red ring + photo (grey, fades out at the bottom) or logo/emoji,
    // name + 2 keyword tags. Opens zoomed ×2.35 → 1 in 0.6 s. img | icon, name, tags:[..], tag_t:[..]
    kinetic_portrait(s, t, lt) {
      const [W, H] = WH(), c = K();
      const x = s.x ?? W / 2, y = s.y ?? H * (VERT() ? .4 : .42), d = (s.size || (VERT() ? .62 : .32)) * W;
      const z = lerp(s.zoom_from ?? 2.35, 1, E.outCubic(prog(lt, 0, .6)));
      const inner = s.img
        ? `<img src="${media(s.img, t)}" style="position:absolute;left:50%;bottom:0;width:${.43 / .62 * 100}%;height:auto;transform:translateX(-50%);filter:grayscale(1) contrast(1.05);
            -webkit-mask-image:linear-gradient(#000 66%,transparent);mask-image:linear-gradient(#000 66%,transparent)">`
        : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${slIcon(s.icon || 'si:openai', d * .48, 'white')}</div>`;
      const tags = (s.tags || []).slice(0, 3).map((g, i) => {
        const ti = (s.tag_t || [])[i] ?? s.t0 + .55 + i * .28;
        return `<span style="display:inline-block;margin:0 8px;padding:8px 20px;border-radius:999px;font-family:${c.kin};font-weight:800;font-size:${s.tag_size || 30}px;
          ${i % 2 ? `color:${c.ring};border:3px solid ${c.ring}` : `color:#fff;background:${c.ring};border:3px solid ${c.ring}`};${rise(t, ti, .2)}">${esc(g)}</span>`;
      }).join('');
      return {
        back: `<div class="full" style="background:${c.paper}"></div><div class="full" style="background:radial-gradient(circle at 50% 40%,transparent 40%,rgba(0,0,0,.12) 100%)"></div>`,
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) scale(${z.toFixed(4)});text-align:center;transform-origin:50% 30%">
          <div style="position:relative;width:${d}px;height:${d}px;margin:0 auto;border-radius:50%;background:${c.ring};overflow:hidden;box-shadow:0 20px 50px rgba(163,46,64,.35)">${inner}</div>
          ${s.name ? `<div style="margin-top:26px;font-family:${c.kin};font-weight:900;font-size:${fitPx(s.name, s.name_size || 64, W - 60, .58)}px;letter-spacing:-.03em;color:#111;white-space:nowrap">${esc(s.name)}</div>` : ''}
          ${s.role ? `<div style="margin-top:4px;font-family:${c.kin};font-weight:500;font-size:30px;color:#555">${esc(s.role)}</div>` : ''}
          <div style="margin-top:22px;white-space:nowrap">${tags}</div></div>` + cutFlash(lt, s.flash),
        cover: true, hideCaptions: s.hideCaptions ?? true,
      };
    },

    // B-roll insert with keyword overlay. layout: full | split (b-roll on top, speaker below) | card.
    // Source: broll:{ id | template, pal, text, sub, icon, num } (procedural preset) or media (image / {seq}).
    // keyword (Anton cream, slams in), sub (small line above it), kw_t, kw_y. zoom: start scale (punch-in → 1).
    kinetic_broll(s, t, lt) {
      const [W, H] = WH(), c = K();
      const lay = s.layout || 'full';
      const box = lay === 'full' ? { x: 0, y: 0, w: W, h: H }
        : lay === 'split' ? (VERT() ? { x: 0, y: 0, w: W, h: Math.round(H * (s.split ?? .5)) } : { x: 0, y: 0, w: Math.round(W * (s.split ?? .5)), h: H })
          : { x: 40, y: VERT() ? 150 : 60, w: W - 80, h: VERT() ? 470 : 380, ...(s.card || {}) };
      const z = lerp(s.zoom ?? 1.18, 1, E.outCubic(prog(lt, 0, .35))) * (1 + .05 * prog(lt, .35, Math.max(.5, s.t1 - s.t0)));
      let inner = '';
      if (s.media) {
        inner = `<img src="${media(s.media, t)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${s.pos || '50% 50%'};transform:scale(${z.toFixed(4)})">`;
      } else {
        const src = s.broll || { id: 'ai--neural--ember' }, parts = String(src.id || '').split('--');
        const b = { text: '', ...src, template: src.template || parts[1] || 'particles', pal: src.pal || parts[2] || 'ember', t0: s.t0, t1: s.t1, layout: 'full', keep: true };
        const r = MODULES.broll(b, t, lt) || {};
        // fit: blend (default — 16:9 preset centred, height-scaled, edges fade into its palette) | cover | contain.
        const fit = s.fit || 'blend', pal = (typeof PAL !== 'undefined' && PAL[b.pal]) || { bg: '#0c0a09', bg2: '#2a1510' };
        const k = fit === 'cover' ? Math.max(box.w / 1280, box.h / 720) : fit === 'contain' ? Math.min(box.w / 1280, box.h / 720)
          : Math.max(box.w / 1280, Math.min(box.h / 720, box.w / 1280 * 1.9));
        const fade = fit === 'blend' && 720 * k < box.h - 2 ? '-webkit-mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent);mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent);' : '';
        inner = `<div class="full" style="background:radial-gradient(circle at 50% 50%, ${pal.bg2} 0, ${pal.bg} 70%)"></div><div style="position:absolute;left:${(box.w / 2 - 640).toFixed(1)}px;top:${(box.h / 2 - 360).toFixed(1)}px;width:1280px;height:720px;
          transform:scale(${(k * z).toFixed(4)});transform-origin:640px 360px;${fade}">${r.front || r.back || ''}</div>`;
      }
      inner += `<div class="full" style="background:linear-gradient(180deg,rgba(0,0,0,.0) 45%,rgba(0,0,0,.55) 100%)"></div>`;
      const frame = `<div class="abs" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;overflow:hidden;${lay === 'card' ? 'border-radius:22px;box-shadow:0 24px 60px rgba(0,0,0,.55);border:3px solid rgba(255,255,255,.9);' : ''}">${inner}</div>`;
      // Split: speaker re-framed into the lower part (face centred in it), with a red seam.
      let speaker = '';
      if (lay === 'split' && VERT()) {
        const f = faceXY(s), lh = H - box.h, off = clamp(f.y - lh * .42, 0, H - lh);
        speaker = `<div class="abs" style="left:0;top:${box.h}px;width:${W}px;height:${lh}px;overflow:hidden;background:#000">
          ${TL.aroll ? `<img src="${arollSrc(t)}" style="position:absolute;left:0;top:${-off}px;width:${W}px;height:${H}px;object-fit:cover;filter:${arollFilter(t)}">` : ''}</div>
          <div class="abs" style="left:0;top:${box.h - 3}px;width:${W}px;height:6px;background:${c.red};box-shadow:0 0 16px ${c.red}"></div>`;
      } else if (lay === 'split') {
        // Horizontal: b-roll left, speaker right (face centred in the right half).
        const f = faceXY(s), lw = W - box.w, off = clamp(f.x - lw / 2, 0, W - lw);
        speaker = `<div class="abs" style="left:${box.w}px;top:0;width:${lw}px;height:${H}px;overflow:hidden;background:#000">
          ${TL.aroll ? `<img src="${arollSrc(t)}" style="position:absolute;left:${-off}px;top:0;width:${W}px;height:${H}px;object-fit:cover;filter:${arollFilter(t)}">` : ''}</div>
          <div class="abs" style="left:${box.w - 3}px;top:0;width:6px;height:${H}px;background:${c.red};box-shadow:0 0 16px ${c.red}"></div>`;
      }
      const kwT = s.kw_t ?? s.t0 + .12, kk = slamK(t, kwT, .24);
      const kwY = s.kw_y ?? (lay === 'split' ? (VERT() ? box.h - 90 : H * .5) : lay === 'card' ? box.y + box.h + 70 : H * .5);
      const kwS = fitPx(s.keyword || '', s.size || (VERT() ? 110 : 120), (lay === 'split' && !VERT() ? box.w : W) - 70, .5);
      const kwR = lay === 'split' && !VERT() ? W - box.w : 0;
      const kw = s.keyword ? `<div style="position:absolute;left:0;right:${kwR}px;top:${kwY}px;transform:translateY(-50%);text-align:center">
          ${s.sub ? `<div style="font-family:${c.kin};font-weight:800;font-size:${s.sub_size || 34}px;color:#fff;text-shadow:${stroke(2.5)},0 4px 0 #000;margin-bottom:30px;${rise(t, kwT - .05, .2)}">${esc(s.sub)}</div>` : ''}
          <div style="display:inline-block;font-family:${c.head};font-size:${kwS}px;line-height:1;color:${s.color || c.hi};text-transform:${s.upper === false ? 'none' : 'uppercase'};white-space:nowrap;
            text-shadow:${stroke(5)},0 8px 0 #000,0 14px 30px rgba(0,0,0,.6);opacity:${t < kwT ? 0 : clamp(kk * 2.5).toFixed(3)};transform:scale(${lerp(1.9, 1, kk).toFixed(3)}) rotate(${s.rot ?? -2}deg)">${esc(s.keyword)}</div></div>` : '';
      const full = lay !== 'card';
      return {
        front: `<div class="abs full"${cidOf(s)}>${frame}${speaker}${kw}</div>` + cutFlash(lt, s.flash ?? false),
        cover: full,
        hideCaptions: s.hideCaptions ?? !!s.keyword,
      };
    },

    // Zoom-cut emphasis: hard cut to a punched-in speaker (×scale on the face), optional grade (bw | red | hot),
    // vignette + word slam. Keep it short (0.6–1.5 s). word, word_y, scale, fx/fy (focus, default TL.face).
    kinetic_zoomcut(s, t, lt) {
      const [W, H] = WH(), c = K();
      const f = faceXY(s), sc = (s.scale ?? 1.45) * lerp(1.12, 1, E.outCubic(prog(lt, 0, .18)));
      const grade = { bw: 'grayscale(1) contrast(1.35) brightness(.95)', red: 'grayscale(1) contrast(1.3) sepia(1) hue-rotate(-50deg) saturate(3.5) brightness(.85)', hot: 'contrast(1.25) saturate(1.4)' }[s.grade || 'bw'] || '';
      const img = TL.aroll ? `<img src="${arollSrc(t)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${arollFilter(t)} ${grade};
        transform:scale(${sc.toFixed(4)});transform-origin:${(f.x / W * 100).toFixed(1)}% ${(f.y / H * 100).toFixed(1)}%">` : `<div class="full" style="background:${c.dark}"></div>`;
      const vig = `<div class="full" style="background:radial-gradient(ellipse at 50% 45%,transparent 35%,rgba(0,0,0,.75) 100%)"></div>`;
      const wt = s.word_t ?? s.t0 + .05, k = slamK(t, wt, .22);
      const ws = fitPx(s.word || '', s.size || (VERT() ? 150 : 140), W - 60, .5);
      const word = s.word ? `<div style="position:absolute;left:0;right:0;top:${s.word_y ?? H * .78}px;transform:translateY(-50%);text-align:center">
        <span style="display:inline-block;font-family:${c.head};font-size:${ws}px;line-height:1;color:${s.color || (s.grade === 'red' ? '#fff' : c.hi)};text-transform:${s.upper === false ? 'none' : 'uppercase'};white-space:nowrap;
          text-shadow:${stroke(5)},0 9px 0 #000,0 0 50px ${c.red};opacity:${t < wt ? 0 : clamp(k * 2.5).toFixed(3)};transform:scale(${lerp(2, 1, k).toFixed(3)})">${esc(s.word)}</span></div>` : '';
      return {
        back: `<div class="full"${cidOf(s)} style="overflow:hidden">${img}</div>${vig}`,
        front: `<div class="abs full"${s.word_cid ? ` data-cid="${s.word_cid}"` : ''}>${word}</div>` + cutFlash(lt, s.flash ?? true),
        cover: true, hideCaptions: s.hideCaptions ?? !!s.word,
      };
    },

    // Emoji burst: centre emoji pops + bobs, n particles fly out radially under gravity. emojis:[..], x, y, size, n, spread.
    kinetic_emoji(s, t, lt) {
      const [W, H] = WH();
      const list = s.emojis || ['😱', '🔥', '🤯'], x = s.x ?? W * .74, y = s.y ?? H * .3, size = s.size || 150, n = s.n ?? 8;
      if (lt < 0) return {};
      const out = s.keep ? 1 : 1 - E.inCubic(prog(t, s.t1 - .15, .15));
      let parts = '';
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + ((i / Math.max(1, n - 1)) - .5) * (s.spread ?? 2.6) + (rnd(i * 7 + 3) - .5) * .3;
        const v = 520 + rnd(i * 11 + 5) * 380, ps = size * (.32 + rnd(i * 5 + 1) * .25), tt = Math.max(0, lt - .05);
        const px = x + Math.cos(a) * v * tt, py = y + Math.sin(a) * v * tt + .5 * 1500 * tt * tt;
        const o = clamp(1 - tt / 1.1) * clamp(lt / .06);
        if (o <= 0) continue;
        parts += emoji(list[(i + 1) % list.length], px - ps / 2, py - ps / 2, ps, `opacity:${o.toFixed(3)};transform:rotate(${((rnd(i) - .5) * 160 * tt).toFixed(1)}deg)`);
      }
      const k = E.outBack(prog(lt, 0, .32), 2.4);
      const bobY = Math.sin(lt * 5) * 6, rot = Math.sin(lt * 3.2) * 7;
      const main = emoji(list[0], x - size / 2, y - size / 2, size, `transform:translateY(${bobY.toFixed(1)}px) scale(${clamp(k, 0, 1.3).toFixed(3)}) rotate(${rot.toFixed(1)}deg)`);
      return { front: `<div class="abs full"${cidOf(s)} style="opacity:${out.toFixed(3)}">${parts}${main}</div>` };
    },

    // Hook title (first 2 s, readable muted): line 1 Anton cream slams in, line 2 on a red bar wiping in. text, text2, y, size.
    kinetic_hook(s, t, lt) {
      const [W, H] = WH(), c = K();
      const y = s.y ?? H * (VERT() ? .16 : .2), size = s.size || (VERT() ? 92 : 96);
      const up = v => (s.upper === false ? v : String(v).toUpperCase());
      const t1 = up(s.text ?? 'ĐIỀU NÀY'), t2 = s.text2 ? up(s.text2) : '';
      const k1 = slamK(t, s.t0, .26);
      const s1 = fitPx(t1, size, W - 60, .5), s2 = fitPx(t2, size * .62, W - 110, .52);
      const t2t = s.text2_t ?? s.t0 + .3, w2 = E.outExpo(prog(t, t2t, .3));
      const bar = t2 ? `<div style="display:inline-block;margin-top:14px;padding:6px 22px 2px;background:${c.red};transform:rotate(-2deg);clip-path:inset(0 ${((1 - w2) * 100).toFixed(1)}% 0 0);box-shadow:0 8px 0 rgba(0,0,0,.55)">
        <span style="font-family:${c.head};font-size:${s2}px;line-height:1.1;color:#fff;white-space:nowrap;letter-spacing:.01em">${esc(t2)}</span></div>` : '';
      return {
        front: `<div class="abs"${cidOf(s)} style="left:0;right:0;top:${y}px;text-align:center">
          <div style="font-family:${c.head};font-size:${s1}px;line-height:1.02;color:${s.color || c.hi};white-space:nowrap;text-shadow:${stroke(5)},0 9px 0 #000,0 14px 34px rgba(0,0,0,.55);
            opacity:${clamp(k1 * 2.5).toFixed(3)};transform:scale(${lerp(1.6, 1, k1).toFixed(3)})">${esc(t1)}</div>${bar}</div>`,
      };
    },

    // Progress / retention bar for the whole video: thin bar (top by default) + chapter marks and current chapter chip.
    // chapters:[{ t, text }], pos: top | bottom, height.
    kinetic_progress(s, t, lt) {
      const [W, H] = WH(), c = K();
      const hgt = s.height || 9, top = s.pos === 'bottom' ? H - hgt : (s.y ?? 0);
      const k = clamp((t - s.t0) / Math.max(.1, s.t1 - s.t0));
      const marks = (s.chapters || []).map(ch => `<div style="position:absolute;left:${((ch.t - s.t0) / (s.t1 - s.t0) * W).toFixed(1)}px;top:0;width:3px;height:100%;background:rgba(0,0,0,.6)"></div>`).join('');
      const cur = (s.chapters || []).filter(ch => t >= ch.t).pop();
      const chip = cur && cur.text ? `<div style="position:absolute;left:${s.chip_x ?? 18}px;top:${s.pos === 'bottom' ? -46 : hgt + 12}px;padding:5px 14px;border-radius:6px;background:rgba(0,0,0,.6);
        font-family:${c.kin};font-weight:800;font-size:22px;color:${c.hi};letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;${rise(t, cur.t, .2, 8, 4)}">${esc(cur.text)}</div>` : '';
      return {
        front: `<div class="abs"${cidOf(s)} style="left:0;top:${top}px;width:${W}px;height:${hgt}px;background:rgba(255,255,255,.22)">
          <div style="position:absolute;left:0;top:0;height:100%;width:${(k * W).toFixed(1)}px;background:linear-gradient(90deg,${c.red},${c.hi});box-shadow:0 0 12px ${c.red}"></div>${marks}${chip}</div>`,
      };
    },

    // CTA (one action): headline (Anton cream) + red Follow button with handle; a hand taps it at tap_t → "ĐÃ FOLLOW ✓".
    kinetic_cta(s, t, lt) {
      const [W, H] = WH(), c = K(), b = BR();
      const y = s.y ?? H * (VERT() ? .85 : .5);
      const tapT = s.tap_t ?? s.t0 + 1.1, pressed = t >= tapT;
      const kb = E.outBack(prog(lt, .15, .35), 2), press = t >= tapT && t < tapT + .12 ? .9 : 1;
      const head = s.text ? `<div style="font-family:${c.head};font-size:${fitPx(s.text, s.size || 70, W - 60, .5)}px;line-height:1;color:${c.hi};text-transform:uppercase;white-space:nowrap;
        text-shadow:${stroke(4)},0 7px 0 #000;margin-bottom:22px;${rise(t, s.t0, .22, 18)}">${esc(s.text)}</div>` : '';
      const label = pressed ? (s.done || 'ĐÃ FOLLOW ✓') : (s.button || 'FOLLOW');
      const handle = s.handle ?? b.handle;
      const btn = `<div style="display:inline-flex;align-items:center;gap:14px;padding:16px 36px;border-radius:999px;background:${pressed ? '#2a2a2a' : c.red};border:3px solid ${pressed ? '#555' : '#fff'};
        box-shadow:0 10px 0 rgba(0,0,0,.45),0 0 30px ${c.red}88;transform:scale(${(clamp(kb, 0, 1.2) * press).toFixed(3)})">
        <span style="font-family:${c.kin};font-weight:900;font-size:40px;color:#fff;letter-spacing:.02em;white-space:nowrap">${pressed ? '' : '＋ '}${esc(label)}</span></div>`;
      const hk = E.inOutSine(prog(t, tapT - .45, .45));
      const hand = t > tapT - .5 ? emoji(s.hand || '👆', W / 2 + 190 - 60 * hk, y + 150 - 110 * hk + (pressed ? 8 : 0), 96, `opacity:${clamp((t - tapT + .5) / .15).toFixed(3)}`) : '';
      return {
        front: `<div class="abs"${cidOf(s)} style="left:0;right:0;top:${y}px;transform:translateY(-50%);text-align:center">${head}${btn}
          ${handle ? `<div style="margin-top:16px;font-family:${c.kin};font-weight:700;font-size:28px;color:#fff;text-shadow:${stroke(2)};${rise(t, s.t0 + .4, .2)}">${esc(handle)}</div>` : ''}</div>${hand}`,
        hideCaptions: s.hideCaptions ?? false,
      };
    },
  });

  // ---------------------------------------------------------------- Studio menu + auto recipe
  const LOGOS = { openai: 'si:openai', chatgpt: 'si:openai', anthropic: 'si:anthropic', claude: 'si:claude', google: 'si:google', gemini: 'si:googlegemini',
    meta: 'si:meta', apple: 'si:apple', tesla: 'si:tesla', microsoft: 'si:microsoft', nvidia: 'si:nvidia', tiktok: 'si:tiktok', youtube: 'si:youtube', facebook: 'si:facebook' };
  const SCARY = ['sợ', 'shock', 'khủng khiếp', 'kinh khủng', 'bất ngờ', 'không thể tin', 'quá đỉnh', 'nguy hiểm', 'điên rồ'];
  const STOP = new Set(['không', 'những', 'được', 'người', 'trong', 'nhưng', 'thì', 'này', 'mình', 'bạn', 'rằng', 'cũng', 'những', 'việc', 'các', 'một', 'với', 'đang', 'vừa', 'của', 'và', 'là', 'có', 'để', 'nha', 'đây']);
  const BROLL_ROT = ['ai--neural--ember', 'robot--glitch_text--ember', 'ai--code_rain--ember', 'ai--browser--ember', 'robot--orbit_icons--ember'];

  PACKS.push({
    id: P, name: 'Kinetic b-roll / short-form', icon: '⚡', caption: 'kinetic',
    desc: 'Chữ động nhiều cỡ trên nền đen cung đỏ, số lớn đập vào, b-roll cắt nhanh có từ khoá Anton vàng kem, zoom-cut, emoji, thanh tiến trình, CTA',
    items: [
      { type: 'kinetic_words', label: 'Chữ xếp tầng (nền đen cung đỏ)', make: T => ({ type: 'kinetic_words', t0: T, t1: T + 2, bg: 'arc', words: [{ text: 'thậm chí', t: T, tier: 's', align: 'left' }, { text: 'khủng khiếp', t: T + .4, tier: 'l', hl: true }, { text: 'hơn', t: T + .8, tier: 's', align: 'right' }] }) },
      { type: 'kinetic_slam', label: 'Số lớn đập vào', make: T => ({ type: 'kinetic_slam', t0: T, t1: T + 1.6, count: { to: 90, suffix: '%' }, top: 'hơn', bottom: 'người dùng' }) },
      { type: 'kinetic_diamonds', label: 'Hai hình thoi đối lập', make: T => ({ type: 'kinetic_diamonds', t0: T, t1: T + 2.2, items: [{ text: 'OpenAI', icon: 'si:openai', t: T }, { text: 'Anthropic', icon: 'si:anthropic', t: T + .6 }] }) },
      { type: 'kinetic_portrait', label: 'Thẻ chân dung / thương hiệu', make: T => ({ type: 'kinetic_portrait', t0: T, t1: T + 2, icon: 'si:openai', name: 'OpenAI', tags: ['ChatGPT', 'AGI'] }) },
      { type: 'kinetic_broll', label: 'B-roll + từ khoá', make: T => ({ type: 'kinetic_broll', t0: T, t1: T + 1.6, layout: 'split', broll: { id: 'ai--neural--ember' }, keyword: 'AI' }) },
      { type: 'kinetic_zoomcut', label: 'Zoom-cut nhấn mạnh', make: T => ({ type: 'kinetic_zoomcut', t0: T, t1: T + 1, word: 'ĐÁNG SỢ', grade: 'bw' }) },
      { type: 'kinetic_emoji', label: 'Emoji bung', make: T => ({ type: 'kinetic_emoji', t0: T, t1: T + 1.4, emojis: ['😱', '🔥', '🤯'] }) },
      { type: 'kinetic_hook', label: 'Tiêu đề hook', make: T => ({ type: 'kinetic_hook', t0: T, t1: T + 2.2, text: 'ĐIỀU NÀY', text2: 'SẮP XẢY RA' }) },
      { type: 'kinetic_progress', label: 'Thanh tiến trình', make: T => ({ type: 'kinetic_progress', t0: T, t1: (TL && TL.duration) || T + 20 }) },
      { type: 'kinetic_cta', label: 'CTA Follow', make: T => ({ type: 'kinetic_cta', t0: T, t1: T + 2.5, text: 'Xem phần 2' }) },
    ],
    recipe: ctx => {
      const caps = ctx.captions || [], dur = ctx.dur || 20, scenes = [], fx = [];
      const words = capWords(caps);
      const busy = (a, b) => scenes.some(s => s.type !== 'kinetic_progress' && s.type !== 'kinetic_emoji' && a < s.t1 && b > s.t0);
      const add = s => { if (!busy(s.t0, s.t1) && s.t0 >= 0 && s.t1 <= dur - 2.4) { scenes.push(s); return true; } return false; };
      const first = words.slice(0, 4).map(w => w.w).join(' ');
      scenes.push({ type: 'kinetic_hook', t0: 0, t1: Math.min(2.2, dur), text: ctx.title || first || 'XEM NGAY', text2: ctx.subtitle || '' });
      // Numbers → slam.
      const num = words.find(w => /\d/.test(w.w) && w.s > 2.2);
      if (num) add({ type: 'kinetic_slam', t0: num.s - .05, t1: num.s + 1.4, text: num.w.replace(/[.,!?]$/, '') });
      // Brand names → diamonds (two close together) or portrait (one).
      const brands = [];
      for (const [k, icon] of Object.entries(LOGOS)) { const at = findWord(caps, [k], 2.2); if (at != null) brands.push({ k, icon, at }); }
      brands.sort((a, b) => a.at - b.at);
      if (brands.length >= 2 && brands[1].at - brands[0].at < 3) {
        const nm = b => words.find(w => Math.abs(w.s - b.at) < .01)?.w || b.k;
        add({ type: 'kinetic_diamonds', t0: brands[0].at - .05, t1: brands[1].at + 1.3, items: brands.slice(0, 2).map(b => ({ text: nm(b), icon: b.icon, t: b.at })) });
      } else if (brands.length) {
        const b = brands[0];
        add({ type: 'kinetic_portrait', t0: b.at - .05, t1: b.at + 1.8, icon: b.icon, name: words.find(w => Math.abs(w.s - b.at) < .01)?.w || b.k, tags: [] });
      }
      // Emotional words → zoom-cut + emoji.
      for (const n of SCARY) {
        const at = findWord(caps, [n], 2.2);
        if (at != null && add({ type: 'kinetic_zoomcut', t0: at - .3, t1: at + .8, word: n.toUpperCase(), grade: 'bw' })) {
          scenes.push({ type: 'kinetic_emoji', t0: at - .2, t1: at + 1.1, emojis: ['😱', '🤯', '⚡'], x: 540, y: 330 });
          fx.push({ t: at - .3, type: 'glitch' });
          break;
        }
      }
      // Never leave the speaker alone > ~3 s: fill gaps with split / full b-roll carrying the longest word as keyword.
      let r = 0;
      for (let t0 = 2.4; t0 < dur - 4; t0 += .2) {
        const lastEnd = Math.max(2.2, ...scenes.filter(s => !['kinetic_progress', 'kinetic_emoji'].includes(s.type) && s.t1 <= t0 + .01).map(s => s.t1));
        if (t0 - lastEnd < 2.2 || busy(t0, t0 + 1.6)) continue;
        const near = words.filter(w => w.s >= t0 && w.s < t0 + 1.6 && !STOP.has(w.low))
          .sort((a, b) => (isHl(b) - isHl(a)) || (b.w.length - a.w.length))[0];
        if (add({ type: 'kinetic_broll', t0, t1: t0 + 1.6, layout: r % 2 ? 'full' : 'split', broll: { id: BROLL_ROT[r % BROLL_ROT.length] }, keyword: near ? near.w : '', kw_t: near ? near.s : t0 + .1 })) {
          fx.push({ t: t0 + 1.6, type: 'blur_in' });
          r++;
        }
      }
      scenes.push({ type: 'kinetic_cta', t0: dur - 2.4, t1: dur, text: ctx.cta || 'Theo dõi để xem tiếp' });
      // Progress bar last so it stays on top of full-frame graphics.
      return { caption_style: 'kinetic', music: 'tech', scenes: [...scenes.sort((a, b) => a.t0 - b.t0), { type: 'kinetic_progress', t0: 0, t1: dur }], fx };
    },
  });
})();
