// "Tutorial phát sáng" pack — port of the video-tutorial-glow skill (design 720x1280, 9:16).
// Look: real footage full-frame, Be Vietnam Pro cream keywords (#F5F2CD, upright ExtraBold) + white italic
// explanations (#FAFAFA), every glyph wrapped in a gold halo (#E8C45A) over a soft dark drop shadow.
// Motion is deliberately light: blocks fade in while rising a few px, the halo flares once then settles.
// Spec: references/pack-glow.md.
(() => {
  const P = 'glow';
  const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
  const MARGIN = 60;
  // Palette: source colours, overridable by timeline.brand (accent = cream keyword, light = white, primary = halo).
  const pal = () => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return { cream: b.accent || '#F5F2CD', white: b.light || '#FAFAFA', glow: b.primary || '#E8C45A', font: b.font || FONT };
  };
  const rgb = hex => {
    let h = String(hex || '#E8C45A').replace('#', '');
    if (h.length === 3) h = [...h].map(c => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  };
  const f1 = v => (+v).toFixed(1);
  // Three stacked layers as in overlay.py: wide gold halo, tight gold rim, dark shadow offset 5% of size.
  // strength > 1 = brighter halo (entrance flare).
  function glowShadow(size, strength = 1, gc) {
    const g = rgb(gc || pal().glow), a = v => clamp(v * strength, 0, 1).toFixed(2);
    return [
      `0 0 ${f1(Math.max(2, size * .04))}px rgba(${g},${a(.95)})`,
      `0 0 ${f1(Math.max(6, size * .11))}px rgba(${g},${a(.85)})`,
      `0 0 ${f1(Math.max(10, size * .2))}px rgba(${g},${a(.45)})`,
      `0 ${f1(size * .05)}px ${f1(Math.max(8, size * .16))}px rgba(0,0,0,.8)`,
    ].join(',');
  }
  // Rough Be Vietnam Pro advance width (em) — used to shrink long Vietnamese lines like overlay.py _fit().
  function estW(text, size, weight = 800, italic = false) {
    let w = 0;
    for (const ch of String(text || '')) {
      if (ch === ' ') w += .26;
      else if (/[A-ZĐÂĂÊÔƠƯÁÀẢÃẠ0-9]/.test(ch.normalize('NFC')) && ch === ch.toUpperCase() && ch !== ch.toLowerCase()) w += .7;
      else if (/[0-9]/.test(ch)) w += .62;
      else if (/[il.,:;'!|]/.test(ch)) w += .28;
      else if (/[mwMW]/.test(ch)) w += .86;
      else if (/\p{Extended_Pictographic}/u.test(ch)) w += 1.1;
      else w += .58;
    }
    return w * size * (weight >= 800 ? 1.03 : 1) + (italic ? size * .22 : 0);
  }
  const fit = (text, size, maxW, weight, italic) => {
    let s = size;
    while (s > 18 && estW(text, s, weight, italic) > maxW) s -= 2;
    return s;
  };
  // Entrance/exit shared by every block: fade + rise (source: "trượt lên vài pixel"), halo flare.
  function life(s, t, din = .2, dout = .18) {
    const lt = t - s.t0, k = E.outCubic(prog(lt, 0, din));
    const o = k * (s.keep ? 1 : 1 - E.inCubic(prog(t, s.t1 - dout, dout)));
    const rise = (1 - k) * (s.rise ?? 14);
    const flare = 1 + (s.flare ?? .6) * (1 - E.outCubic(prog(lt, 0, .55)));
    return { o, rise, flare, lt };
  }
  // Soft dark blob behind text ("shade" 0..1) for bright backgrounds.
  const shadeDiv = (amount, r = 46) => amount > 0
    ? `<div style="position:absolute;inset:-14px -34px;border-radius:${r}px;background:rgba(0,0,0,${clamp(amount * .9, 0, .85).toFixed(2)});filter:blur(22px)"></div>` : '';
  // A glowing text run.
  const glowSpan = (text, size, { color, weight = 800, italic = false, strength = 1, gc, extra = '' } = {}) =>
    `<span style="position:relative;font-family:${pal().font};font-weight:${weight};font-style:${italic ? 'italic' : 'normal'};font-size:${f1(size)}px;line-height:1.12;
      color:${color};white-space:nowrap;letter-spacing:-.005em;text-shadow:${glowShadow(size, strength, gc)};${extra}">${esc(text)}</span>`;
  const iconSpan = (icon, size) => icon ? `<span style="display:inline-block;vertical-align:middle;margin-right:${f1(size * .22)}px">${slIcon(icon, Math.round(size * 1.05), 'white')}</span>` : '';
  // Root block positioned by its centre (x,y) — Studio drags x/y and scales size.
  const root = (s, x, y, o, rise, inner, extra = '') =>
    `<div class="abs"${cidOf(s)} style="left:${f1(x)}px;top:${f1(y)}px;transform:translate(-50%,-50%) translateY(${f1(rise)}px);opacity:${o.toFixed(3)};${extra}">${inner}</div>`;

  Object.assign(MODULES, {
    // Dark bands at the top/bottom of the frame, under all text — for bright footage (white wall, white shirt, white UI).
    // top/bottom = opacity at the edge, top_h/bottom_h = band height in px.
    glow_scrim(s, t) {
      const [W, H] = DIMS();
      const o = s.keep ? 1 : fadeIO(t, s.t0, s.t1, .3, .3);
      const top = s.top ?? .42, bot = s.bottom ?? .5, th = s.top_h ?? 420, bh = s.bottom_h ?? 460;
      const band = (a, h, dir) => a > 0 ? `<div class="abs" style="left:0;right:0;${dir}:0;height:${h}px;background:linear-gradient(to ${dir === 'top' ? 'bottom' : 'top'},rgba(0,0,0,${a}) 0%,rgba(0,0,0,${(a * .55).toFixed(2)}) 45%,rgba(0,0,0,0) 100%)"></div>` : '';
      return { back: `<div class="abs" style="left:0;top:0;width:${W}px;height:${H}px;opacity:${o.toFixed(3)};pointer-events:none">${band(top, th, 'top')}${band(bot, bh, 'bottom')}</div>` };
    },

    // Opening title pair: big cream keyword + small white italic promise beside it (or below when too wide).
    // Use two scenes: one above the head (y≈170), one at chest height (y≈800).
    glow_title(s, t) {
      const c = pal(), [W] = DIMS();
      const { o, rise, flare } = life(s, t, .25);
      const bs0 = s.size || 210, ss0 = s.small_size || Math.round(bs0 * .46);
      const bs = fit(s.big || 'AI', bs0, W - MARGIN * 2, 800);
      const bw = estW(s.big || 'AI', bs, 800);
      let ss = fit(s.small || '', ss0, W - MARGIN * 2 - bw - bs * .06, 700, true);
      const below = s.layout === 'below' || (s.small && ss < ss0 * .62);
      if (below) ss = fit(s.small || '', ss0, W - MARGIN * 2 - bs * .3, 700, true);
      const lt = t - s.t0, k2 = E.outCubic(prog(lt, s.small_delay ?? .18, .25));
      const big = glowSpan(s.big || 'AI', bs, { color: c.cream, weight: 800, strength: flare, extra: 'line-height:.98' });
      const small = s.small ? `<span style="display:inline-block;opacity:${k2.toFixed(3)};transform:translateY(${f1((1 - k2) * 10)}px);${below ? `margin:-${f1(bs * .1)}px 0 0 ${f1(bs * .42)}px` : `margin-left:${f1(bs * .06)}px;vertical-align:${f1(bs * .02)}px`}">
        ${glowSpan(s.small, ss, { color: c.white, weight: 700, italic: true, strength: flare })}</span>` : '';
      const inner = `<div style="position:relative;white-space:nowrap;text-align:left">${shadeDiv(s.shade || 0, 80)}${below ? `<div>${big}</div><div style="text-align:left">${small}</div>` : `${big}${small}`}</div>`;
      return { front: root(s, s.x ?? 360, s.y ?? 170, o, rise, inner) };
    },

    // One keyword pops on when the speaker names a tool / number: CHATGPT, CANVA, 12 TRANG.
    glow_keyword(s, t) {
      const c = pal(), [W] = DIMS();
      const { o, rise, flare } = life(s, t);
      const size = fit(s.text || 'CHATGPT', s.size || 112, W - MARGIN * 2 - (s.icon ? (s.size || 112) : 0), 800);
      const al = s.align || 'center';
      const x = s.x ?? 360;
      const inner = `<div style="position:relative;white-space:nowrap">${shadeDiv(s.shade || 0)}${iconSpan(s.icon, size * .8)}${glowSpan(s.text || 'CHATGPT', size, { color: s.color || c.cream, weight: 800, strength: flare })}</div>`;
      const tx = al === 'left' ? '0' : al === 'right' ? '-100%' : '-50%';
      return { front: root(s, x, s.y ?? 150, o, rise, inner).replace('translate(-50%,-50%)', `translate(${tx},-50%)`) };
    },

    // Section marker at the top-left: Input / Output / Bước 2. 2–4 per minute.
    glow_marker(s, t) {
      const c = pal(), [W] = DIMS();
      const { o, rise, flare, lt } = life(s, t);
      const size = fit(s.text || 'Input', s.size || 68, W - MARGIN * 2, 800);
      // A short gold underline draws on under the marker (signature accent).
      const k = E.outCubic(prog(lt, .12, .35));
      const bar = s.bar === false ? '' : `<div style="height:${f1(size * .07)}px;width:${f1(k * Math.min(estW(s.text || 'Input', size), size * 2.2))}px;margin-top:${f1(size * .04)}px;border-radius:9px;background:${c.glow};box-shadow:0 0 ${f1(size * .2)}px ${c.glow}"></div>`;
      const inner = `<div style="position:relative;white-space:nowrap">${shadeDiv(s.shade || 0)}${s.num ? glowSpan(s.num + ' ', size * .7, { color: c.white, weight: 700, italic: true, strength: flare }) : ''}${glowSpan(s.text || 'Input', size, { color: c.cream, weight: 800, strength: flare })}${bar}</div>`;
      // x,y = left edge / centre of the text line.
      return { front: root(s, s.x ?? 76, s.y ?? 100, o, rise, inner).replace('translate(-50%,-50%)', 'translate(0,-50%)') };
    },

    // Content block: cream italic header (optional emoji/logo) + white italic items, staggered. Carries the explanation
    // while the screen shot is on. Default sits above the caption band (bottom ≈ 940).
    glow_list(s, t) {
      const c = pal(), [W] = DIMS();
      const { o, rise, flare, lt } = life(s, t);
      const hs0 = s.size || 54, is0 = s.item_size || Math.round(hs0 * 46 / 54), lh = is0 * 1.32;
      const items = s.items || [], head = s.header;
      const boxW = s.w || W - MARGIN * 2 + 8;
      const iconW = s.icon ? hs0 * 1.3 : 0;
      const hs = head ? fit(head, hs0, boxW - iconW - 10, 800, true) : 0;
      const total = (head ? hs0 * 1.5 : 0) + lh * items.length;
      const y = s.y ?? (s.anchor === 'top' ? 120 + total / 2 : 940 - total / 2);
      const st = s.stagger ?? .12;
      const rows = items.map((it, i) => {
        const k = E.outCubic(prog(lt, (head ? .15 : 0) + i * st, .22));
        const sz = fit(it, is0, boxW - 36, 700, true);
        return `<div style="height:${f1(lh)}px;display:flex;align-items:center;padding-left:16px;opacity:${k.toFixed(3)};transform:translateY(${f1((1 - k) * 12)}px)">${glowSpan(it, sz, { color: c.white, weight: 700, italic: true, strength: flare })}</div>`;
      }).join('');
      const header = head ? `<div style="height:${f1(hs0 * 1.5)}px;display:flex;align-items:center;white-space:nowrap">${iconSpan(s.icon, hs0)}${glowSpan(head, hs, { color: c.cream, weight: 800, italic: true, strength: flare })}</div>` : '';
      const inner = `<div style="position:relative;width:${boxW}px;text-align:left">${shadeDiv(s.shade || 0, 60)}<div style="position:relative">${header}${rows}</div></div>`;
      return { front: root(s, s.x ?? 360, y, o, rise, inner) };
    },

    // Side tip in the upper half (list without header): "Mẹo: bật chế độ Pro".
    glow_note(s, t) {
      return MODULES.glow_list({ ...s, header: s.header || null, anchor: 'top', y: s.y ?? 200, size: s.size || 54, item_size: s.item_size || s.size || 46 }, t);
    },

    // Closing call-to-action line with an emoji on each side: ❤️ Like & Cmt nhaaa ❤️ (top of frame, clear of app buttons).
    glow_endcard(s, t) {
      const c = pal(), [W] = DIMS();
      const { o, rise, flare, lt } = life(s, t);
      const size0 = s.size || 52;
      const size = fit(s.text || 'Like & Cmt nhaaa', size0, W - MARGIN * 2 - size0 * 2.6, 700, true);
      const bump = 1 + .08 * Math.sin(Math.max(0, lt - .3) * 5.2) * Math.exp(-Math.max(0, lt - .3) * 1.4);
      const ic = s.icon ?? '❤️';
      const em = ic ? `<span style="display:inline-block;transform:scale(${bump.toFixed(3)})">${slIcon(ic, Math.round(size * 1.05))}</span>` : '';
      const inner = `<div style="position:relative;display:flex;align-items:center;gap:${f1(size * .3)}px;white-space:nowrap">${shadeDiv(s.shade || 0)}${em}${glowSpan(s.text || 'Like & Cmt nhaaa', size, { color: c.white, weight: 700, italic: true, strength: flare })}${em}</div>`;
      return { front: root(s, s.x ?? 360, s.y ?? 110, o, rise, inner), hideCaptions: s.hideCaptions ?? false };
    },

    // Screen insert: a laptop screen "filmed with a phone" — screen panel in perspective, dark keyboard below
    // (the dark zone where list/keyword text sits), slow handheld drift. layout:'full' = media fills the frame.
    // screen: { media | broll:{id} | chat:{…} } as in media_card; or media: "x.png" / {seq,…}.
    glow_screen(s, t, lt) {
      const [W, H] = DIMS();
      const dur = Math.max(.5, s.t1 - s.t0);
      const zoom = lerp(1, s.zoom ?? 1.06, E.inOutSine(prog(lt, 0, dur)));
      const hx = Math.sin(lt * 1.3 + 1) * 3 + Math.sin(lt * 2.9) * 1.5, hy = Math.cos(lt * 1.1) * 2.5 + Math.sin(lt * 3.7 + 2) * 1.2;
      const rot = Math.sin(lt * .9) * .35 + (s.tilt ?? 0);
      const en = s.enter || 'cut';
      const ek = en === 'cut' ? 1 : E.outCubic(prog(lt, 0, .22));
      const eo = en === 'fade' ? ek : 1, es = en === 'zoom' ? lerp(1.12, 1, ek) : 1;
      // UI screens (chat) are laid out at 1/ui_scale size then scaled up, so text reads on a phone.
      const content = (w, h) => {
        if (!s.screen) return null;
        const u = s.ui_scale ?? (s.screen.chat ? 1.7 : 1);
        if (u === 1) return screenContent(s.screen, t, w, h, s);
        return `<div style="position:absolute;left:0;top:0;width:${f1(w / u)}px;height:${f1(h / u)}px;transform:scale(${u});transform-origin:0 0">${screenContent(s.screen, t, w / u, h / u, s)}</div>`;
      };
      const contentOf = (w, h) => content(w, h) ?? 
        `<img src="${media(s.media, t)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${s.fit || 'cover'};object-position:${s.pos || '50% 30%'}">`;
      if ((s.layout || 'laptop') === 'full') {
        return { back: `<div class="abs" style="left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;background:#0c0b0a;opacity:${eo.toFixed(3)}">
          <div class="full" style="transform:translate(${f1(hx)}px,${f1(hy)}px) rotate(${rot.toFixed(2)}deg) scale(${(zoom * 1.03 * es).toFixed(4)});filter:${s.filter || 'contrast(1.04) saturate(1.05)'}">${contentOf(W, H)}</div>
          <div class="full" style="background:radial-gradient(ellipse 85% 70% at 50% 45%,transparent 55%,rgba(0,0,0,.45) 100%)"></div></div>`, cover: true };
      }
      // Laptop: screen card (w×h) centred at (x,y), keyboard under it.
      const sw = s.size || 600, sh = Math.round(sw * (s.ratio ?? .625)), sx = s.x ?? W / 2, sy = s.y ?? 470;
      const bez = Math.round(sw * .025);
      const keys = `repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 46px,transparent 46px 52px),repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 40px,transparent 40px 47px)`;
      const kbTop = sy + sh / 2 + bez + 18;
      const scene = `<div class="abs" style="left:0;top:0;width:${W}px;height:${H}px;background:radial-gradient(ellipse 120% 60% at 50% ${sy}px,#2a2420 0%,#14110f 45%,#070605 100%)"></div>
        <div class="abs" style="left:-60px;right:-60px;top:${f1(kbTop)}px;height:${H - kbTop + 80}px;transform:perspective(700px) rotateX(48deg);transform-origin:50% 0;
          background:${keys},linear-gradient(#191614,#0b0a09);border-top:2px solid rgba(255,255,255,.08)"></div>
        <div class="abs" style="left:${f1(sx - sw * .45)}px;width:${f1(sw * .9)}px;top:${f1(kbTop - 10)}px;height:200px;background:radial-gradient(ellipse 50% 50% at 50% 0%,rgba(150,180,255,.16),transparent 70%)"></div>
        <div class="abs"${cidOf(s)} style="left:${f1(sx - sw / 2 - bez)}px;top:${f1(sy - sh / 2 - bez)}px;width:${sw + bez * 2}px;height:${sh + bez * 2}px;padding:${bez}px;border-radius:${bez * 1.4}px;
          background:#0a0a0b;box-shadow:0 0 0 2px #2b2b2e,0 30px 60px rgba(0,0,0,.6);transform:perspective(1400px) rotateX(${s.tiltX ?? 4}deg)">
          <div style="position:relative;width:${sw}px;height:${sh}px;overflow:hidden;border-radius:4px;background:#fff">${contentOf(sw, sh)}
            <div class="full" style="background:linear-gradient(115deg,rgba(255,255,255,.14) 0%,rgba(255,255,255,0) 32%,rgba(255,255,255,0) 70%,rgba(255,255,255,.06) 100%)"></div>
            <div class="full" style="background:repeating-linear-gradient(0deg,rgba(0,0,0,.035) 0 2px,transparent 2px 4px);mix-blend-mode:multiply"></div></div></div>`;
      return {
        back: `<div class="abs" style="left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;background:#070605;opacity:${eo.toFixed(3)}">
          <div class="full" style="transform:translate(${f1(hx)}px,${f1(hy)}px) rotate(${rot.toFixed(2)}deg) scale(${(zoom * es).toFixed(4)});transform-origin:50% 40%">${scene}</div>
          <div class="full" style="background:radial-gradient(ellipse 80% 65% at 50% 40%,transparent 60%,rgba(0,0,0,.5) 100%)"></div></div>`,
        cover: true,
      };
    },

    // Punch-in on the talking head (no screen footage available): crop zoom + new vertical framing reads as a new shot.
    glow_punch(s, t, lt) {
      const z = lerp(s.size ?? 1.35, (s.size ?? 1.35) * (1 + (s.drift ?? .03)), E.inOutSine(prog(lt, 0, Math.max(.5, s.t1 - s.t0))));
      const f = (typeof TL !== 'undefined' && TL.face) || { x: 360, y: 520 };
      const ox = s.x ?? f.x, oy = s.y ?? f.y;
      return { back: arollImg(t, '', `transform:scale(${z.toFixed(4)});transform-origin:${f1(ox / 7.2)}% ${f1(oy / 12.8)}%`), cover: true };
    },
  });

  // ---------- caption style "glow" ----------
  // White upright Bold, keywords (hl) cream ExtraBold, gold halo + shadow on everything, ≤ 2 lines, bottom line ends
  // above the app buttons (≈ y 1096). Faint dark shade behind (TL.caption_shade, default .32; 0 = off).
  CAPTION_STYLES.glow = (c, t) => {
    const p = pal(), [W, H] = DIMS();
    const maxW = W - MARGIN * 2 - 40;
    let size = c.size || 54;
    const text = c.words.map(w => w.w).join(' ');
    while (size > 34 && estW(text, size, 760) > maxW * 1.9) size -= 3;
    const k = E.outCubic(prog(t, c.t0, .18));
    const o = k * (1 - E.inCubic(prog(t, c.t1 - .08, .08)));
    const words = c.words.map(w => {
      const col = w.hl ? p.cream : (c.color || p.white);
      return `<span style="font-weight:${w.hl ? 800 : (c.weight || 700)};color:${col};${w.hl ? `text-shadow:${glowShadow(size, 1.25)}` : ''}">${esc(w.w)}</span>` + (w.br ? '<br>' : ' ');
    }).join('');
    const shade = TL.caption_shade ?? .32;
    const pos = c.y != null ? `top:${c.y}px;transform:translate(-50%,-50%) translateY(${f1((1 - k) * 8)}px)` : `top:auto;bottom:${H - 1096}px;transform:translate(-50%,0) translateY(${f1((1 - k) * 8)}px)`;
    return `<div id="cap"${cidOf(c)} style="position:absolute;left:${c.x ?? W / 2}px;right:auto;${pos};width:${maxW}px;text-align:center;opacity:${o.toFixed(3)};z-index:90">
      <div style="position:relative;display:inline-block">${shadeDiv(shade, 50)}
      <div style="position:relative;font-family:${c.font || p.font};font-size:${size}px;line-height:1.22;letter-spacing:-.005em;text-shadow:${glowShadow(size, 1)};text-wrap:balance">${words}</div></div></div>`;
  };

  // ---------- Studio metadata ----------
  const BRAND_WORDS = ['ChatGPT', 'Claude', 'OpenAI', 'Anthropic', 'Gemini', 'Canva', 'Notion', 'Midjourney', 'CapCut', 'Copilot', 'Grok', 'DeepSeek', 'Perplexity'];
  PACKS.push({
    id: P, name: 'Tutorial phát sáng', icon: '✨',
    desc: 'Hình quay thật toàn khung, chữ kem viền vàng phát sáng, phụ đề trắng từ khoá kem, cảnh màn hình laptop chèn đè',
    caption: 'glow',
    items: [
      { type: 'glow_scrim', label: 'Dải tối trên/dưới', make: T => ({ type: 'glow_scrim', t0: T, t1: T + 10, top: .42, bottom: .5 }) },
      { type: 'glow_title', label: 'Tiêu đề kem + vàng', make: T => ({ type: 'glow_title', t0: T, t1: T + 4, big: 'AI', small: 'thiết kế', x: 360, y: 170, size: 210 }) },
      { type: 'glow_keyword', label: 'Từ khoá bật lên', make: T => ({ type: 'glow_keyword', t0: T, t1: T + 2.4, text: 'CHATGPT', x: 360, y: 150, size: 112 }) },
      { type: 'glow_marker', label: 'Mốc đoạn (Input/Bước)', make: T => ({ type: 'glow_marker', t0: T, t1: T + 3, text: 'Input', x: 76, y: 100, size: 68 }) },
      { type: 'glow_list', label: 'Khối liệt kê', make: T => ({ type: 'glow_list', t0: T, t1: T + 4, header: 'Claude hỏi nhu cầu', icon: '❓', items: ['1. Số slide', '2. Audience', '3. Mức độ chi tiết'], x: 360, y: 790, size: 54 }) },
      { type: 'glow_note', label: 'Ghi chú nửa trên', make: T => ({ type: 'glow_note', t0: T, t1: T + 3, items: ['Mẹo: bật chế độ Pro', 'để có kết quả nét hơn'], x: 360, y: 200, size: 46 }) },
      { type: 'glow_screen', label: 'Cảnh màn hình laptop', make: T => ({ type: 'glow_screen', t0: T, t1: T + 2.5, screen: { broll: { id: 'cong-nghe-moi--neural--ember' } }, x: 360, y: 470, size: 600 }) },
      { type: 'glow_punch', label: 'Punch-in mặt người', make: T => ({ type: 'glow_punch', t0: T, t1: T + 2, size: 1.35 }) },
      { type: 'glow_endcard', label: 'Dòng chốt Like & Cmt', make: T => ({ type: 'glow_endcard', t0: T, t1: T + 3, text: 'Like & Cmt nhaaa', icon: '❤️', x: 360, y: 110, size: 52 }) },
    ],
    recipe: ctx => {
      const dur = ctx.dur || 20, caps = ctx.captions || [];
      const scenes = [{ type: 'glow_scrim', t0: 0, t1: dur, top: .42, bottom: .5 }];
      const words = caps.flatMap(c => c.words || []);
      const hl = words.filter(w => w.hl).map(w => w.w);
      const big = (ctx.title || hl[0] || words.find(w => w.w.length > 3)?.w || 'AI').replace(/[.,!?]/g, '');
      scenes.push({ type: 'glow_title', t0: .3, t1: Math.min(4.5, dur * .3), big: big.length > 8 ? big.toUpperCase() : big[0].toUpperCase() + big.slice(1), small: ctx.subtitle || 'siêu đỉnh', x: 360, y: 170, size: 190 });
      // Keywords: brand names spoken in the captions (one big block at a time).
      let after = 5, used = 0;
      for (const b of BRAND_WORDS) {
        const at = findWord(caps, [b], after);
        if (at == null || used >= 3 || at > dur - 4) continue;
        scenes.push({ type: 'glow_keyword', t0: +at.toFixed(2), t1: +(at + 2.4).toFixed(2), text: b.toUpperCase(), x: 360, y: 150, size: 112 });
        after = at + 2.6; used++;
      }
      const step = findWord(caps, ['bước một', 'bước 1', 'đầu tiên', 'thứ nhất']);
      if (step != null) scenes.push({ type: 'glow_marker', t0: step, t1: step + 3, text: 'Bước 1', x: 76, y: 100, size: 68 });
      scenes.push({ type: 'glow_endcard', t0: Math.max(0, dur - 3), t1: dur, text: 'Like & Cmt nhaaa', icon: '❤️', x: 360, y: 110, size: 52 });
      return { caption_style: 'glow', music: 'corporate', scenes: scenes.sort((a, b) => a.t0 - b.t0) };
    },
  });
})();
