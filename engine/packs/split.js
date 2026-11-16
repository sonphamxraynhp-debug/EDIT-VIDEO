// Pack "split" — split-screen editing: speaker + a second source (screen recording, b-roll preset, image, frame sequence).
// Look: near-black gutters, one glowing accent divider, compact glass label chips, the speaker "shrinks" out of the full
// frame into its pane (and grows back on exit), so splits cut seamlessly against the plain talking head.
// Modules split_*: stack (top/bottom), side (left/right), pip (picture-in-picture), compare (A vs B + VS badge),
// focus (panes resize 70/30 at keyed times), label (chip). Caption style "split" docks onto the divider. Doc: references/pack-split.md.
(() => {
  const P = 'split';
  const DEF_SCREEN = { broll: { id: 'ai--neural--ember' } };
  // Procedural b-roll preset, cover-fitted into w×h (screenContent contain-fits it, which letterboxes half-frame panes).
  // broll: { id:'topic--template--pal' (catalog id) | template, pal, text, sub, icon, items, num, fit:'cover'|'contain' }
  function brollHTML(b, t, w, h, s) {
    const parts = String(b.id || '').split('--');
    const sc = { ...b, template: b.template || parts[1] || 'neural', pal: b.pal || parts[2] || 'ember',
      t0: s.t0, t1: s.t1, layout: 'full', keep: true };
    const r = MODULES.broll(sc, t, t - s.t0) || {};
    const k = (b.fit === 'contain' ? Math.min : Math.max)(w / 1280, h / 720);
    return `<div class="full" style="background:#120c0a"></div><div style="position:absolute;left:${f((w - 1280 * k) / 2)}px;top:${f((h - 720 * k) / 2)}px;width:1280px;height:720px;
      transform:scale(${k.toFixed(4)});transform-origin:0 0">${r.front || r.back || ''}</div>`;
  }

  // ---------- palette (TL.brand overrides: accent → divider/chips, primary → A side, dark, light, font, disp) ----------
  const C = (s = {}) => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return {
      bg: s.bg || b.dark || '#0B0D12',
      acc: s.color || b.accent || '#FFD84A',
      a: s.color_a || b.primary || '#FF5A4E',
      b: s.color_b || b.good || '#2BD9A0',
      text: b.light || '#FFFFFF',
      muted: b.muted || '#A3A8B4',
      font: b.font || "'Be Vietnam Pro',sans-serif",
      disp: s.font || b.disp || "'Montserrat','Be Vietnam Pro',sans-serif",
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
  const lum = h => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    return (.299 * (n >> 16) + .587 * ((n >> 8) & 255) + .114 * (n & 255)) / 255;
  };
  const f = (v, d = 1) => (+v).toFixed(d);
  const lerpR = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });

  // ---------- sources ----------
  // Speaker (main track) cover-cropped into a w×h box, face (TL.face or fx/fy) kept near the box's upper-middle.
  // At w×h = full frame this is pixel-identical to the plain talking head, so panes can grow out of / back into it.
  function speakerBox(t, w, h, o = {}) {
    const [W, H] = DIMS(), fc = TL.face || { x: W / 2, y: H * .4 };
    const fx = o.fx ?? fc.x, fy = o.fy ?? fc.y;
    const k = Math.max(w / W, h / H) * (o.zoom || 1);
    const ox = clamp(w / 2 - fx * k, w - W * k, 0), oy = clamp(h * (o.fpy ?? .42) - fy * k, h - H * k, 0);
    return `<div style="position:absolute;left:${f(ox)}px;top:${f(oy)}px;width:${W}px;height:${H}px;transform:scale(${k.toFixed(4)});transform-origin:0 0">${arollImg(t, o.filter || '')}</div>`;
  }
  const isSpeaker = src => src == null || src === 'speaker' || (typeof src === 'object' && src.speaker);
  // Any source: 'speaker' | {speaker:true, zoom, fx, fy, filter} | "img.jpg" | {seq,fps,count,t0} | {media, fit, pos, kb, filter}
  // | {screen:{broll|chat|media}} | {broll:{id}} | {color}. Returns HTML filling a w×h positioned parent.
  function srcHTML(src, t, w, h, s, lt = 0) {
    if (isSpeaker(src)) return speakerBox(t, w, h, typeof src === 'object' && src ? src : {});
    if (typeof src === 'string' || src.seq || src.src) src = { media: src };
    if (src.color) return `<div class="full" style="background:${src.color}"></div>`;
    if (src.media) {
      const kb = src.kb === false ? 1 : 1 + .06 * E.inOutSine(clamp(lt / Math.max(1, (s.t1 - s.t0)))) ;
      return `<img src="${media(src.media, t)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${src.fit || 'cover'};object-position:${src.pos || '50% 50%'};
        transform:scale(${kb.toFixed(4)});transform-origin:${src.pos || '50% 50%'};filter:${src.filter || 'none'};background:#000">`;
    }
    const sc = src.screen || src;
    if (sc.broll) return `<div class="full" style="overflow:hidden">${brollHTML(sc.broll, t, w, h, s)}</div>`;
    return `<div class="full" style="overflow:hidden;background:#111">${screenContent(sc, t, w, h, s)}</div>`;
  }
  // Second source of a speaker split: src2 | screen | media (+fit/pos) | default b-roll preset.
  const second = s => s.src2 ?? (s.screen ? { screen: s.screen } : s.media ? { media: s.media, fit: s.fit, pos: s.pos, kb: s.kb } : { screen: DEF_SCREEN });
  const pane = (r, inner, st = '') => `<div style="position:absolute;left:${f(r.x)}px;top:${f(r.y)}px;width:${f(r.w)}px;height:${f(r.h)}px;overflow:hidden;${st}">${inner}</div>`;

  // ---------- label chip ----------
  // lab: "text" | {text, icon, color, solid, cid}. dot = pulsing live dot.
  function chip(c, lab, t, o = {}) {
    if (!lab) return '';
    const L = typeof lab === 'string' ? { text: lab } : lab;
    if (!L.text && !L.icon) return '';
    const col = L.color || o.color || c.acc, solid = L.solid ?? o.solid;
    const fg = solid ? (lum(col) > .55 ? '#0B0B0C' : '#FFFFFF') : c.text;
    const pulse = .55 + .45 * Math.abs(Math.sin(t * 3.2));
    const dot = (L.dot ?? o.dot) ? `<span style="flex:none;width:12px;height:12px;border-radius:50%;background:${solid ? fg : col};box-shadow:0 0 ${f(10 * pulse, 0)}px ${solid ? fg : col};opacity:${f(pulse, 2)}"></span>` : '';
    const ic = L.icon ? `<span style="flex:none;display:inline-flex;width:${o.fs ? o.fs * 1.2 : 26}px;height:${o.fs ? o.fs * 1.2 : 26}px">${slIcon(L.icon, o.fs ? Math.round(o.fs * 1.2) : 26, solid && lum(col) <= .55 ? 'white' : 'black')}</span>` : '';
    const bar = solid || dot || ic ? '' : `<span style="flex:none;width:5px;height:${o.fs ? o.fs * 1.05 : 22}px;border-radius:3px;background:${col};box-shadow:0 0 10px ${hexA(col, .7)}"></span>`;
    return `<div${cidOf(L)} style="display:inline-flex;align-items:center;gap:10px;padding:${o.pad || '8px 18px 8px 14px'};border-radius:999px;white-space:nowrap;
      background:${solid ? col : 'rgba(12,14,19,.78)'};border:1.5px solid ${solid ? 'rgba(255,255,255,.25)' : hexA(col, .55)};color:${fg};
      backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 8px 22px rgba(0,0,0,.4);
      font-family:${c.disp};font-weight:800;font-size:${o.fs || 21}px;line-height:1.3;letter-spacing:.06em;text-transform:${L.upper === false ? 'none' : 'uppercase'};
      ${o.style || ''}">${dot}${ic}${bar}${esc(L.text || '')}</div>`;
  }
  const chipAt = (html, x, y, k, o = {}) => !html ? '' : `<div class="abs" style="left:${f(x)}px;top:${f(y)}px;transform:translate(${o.ax ?? 0}%,0) translateY(${f((1 - k) * (o.dy ?? -14))}px);
    opacity:${f(clamp(k * 1.5), 3)}">${html}</div>`;

  // ---------- two-pane layout (stack / side / focus / compare) ----------
  // mix m: 0 = plain full-frame speaker, 1 = split. share = fraction of the FIRST pane (top / left).
  const mixAt = (s, t, din = .55, dout = .45) => E.outCubic(prog(t, s.t0, din)) * (s.keep ? 1 : 1 - E.inOutSine(prog(t, s.t1 - dout, dout)));
  function rects(axis, share, g) {
    const [W, H] = DIMS();
    if (axis === 'v') {
      const y = H * share;
      return [{ x: 0, y: 0, w: W, h: y - g / 2 }, { x: 0, y: y + g / 2, w: W, h: H - y - g / 2 }, { x: 0, y: y - g / 2, w: W, h: g }];
    }
    const x = W * share;
    return [{ x: 0, y: 0, w: x - g / 2, h: H }, { x: x + g / 2, y: 0, w: W - x - g / 2, h: H }, { x: x - g / 2, y: 0, w: g, h: H }];
  }
  // srcs = [first, second]; labels = [first, second]; opts: {vs, emph}
  function twoUp(s, t, lt, axis, share, srcs, labels, o = {}) {
    const c = C(s), [W, H] = DIMS(), vert = VERT();
    const g = s.gap ?? 6, m = mixAt(s, t);
    const [rA, rB, rD] = rects(axis, share, g), full = { x: 0, y: 0, w: W, h: H };
    const spk = srcs.map(isSpeaker), anySpk = spk[0] || spk[1];
    // Off-screen start for panes that slide in (direction = away from the divider).
    const off = (r, i) => (axis === 'v' ? { ...r, y: r.y + (i ? 1 : -1) * (i ? H - r.y : r.y + r.h) } : { ...r, x: r.x + (i ? 1 : -1) * (i ? W - r.x : r.x + r.w) });
    const R = [rA, rB].map((r, i) => {
      if (spk[i] && !(spk[0] && spk[1])) return lerpR(full, r, m);                // speaker shrinks out of the full frame
      return lerpR(off(r, i), r, anySpk ? m : E.outCubic(prog(t, s.t0 + i * .08, .5)) * (s.keep ? 1 : 1 - E.inOutSine(prog(t, s.t1 - .4, .4))));
    });
    const dim = i => (o.emph != null ? lerp(.6, 1, clamp(((i ? 1 - share : share) - .3) / .2)) : 1);
    const layers = R.map((r, i) => pane(r, srcHTML(srcs[i], t, r.w, r.h, s, lt), `background:${c.bg};${dim(i) < .999 ? `filter:brightness(${f(dim(i), 3)})` : ''}`));
    // Speaker pane on top of the sliding pane so the shrink reads as one motion.
    const order = spk[1] && !spk[0] ? [layers[0], layers[1]] : [layers[1], layers[0]];
    const kd = E.outCubic(prog(lt, .25, .45)) * (s.keep ? 1 : 1 - clamp(prog(t, s.t1 - .45, .3)));
    const dLen = (axis === 'v' ? W : H) * kd;
    // Divider rides the gap between the two moving panes.
    const dPos = axis === 'v' ? (R[0].y + R[0].h + R[1].y) / 2 - g / 2 : (R[0].x + R[0].w + R[1].x) / 2 - g / 2;
    const div = axis === 'v'
      ? `<div class="abs" style="left:${f((W - dLen) / 2)}px;top:${f(dPos)}px;width:${f(dLen)}px;height:${g}px;background:${c.acc};box-shadow:0 0 18px ${hexA(c.acc, .8)},0 0 46px ${hexA(c.acc, .35)}"></div>`
      : `<div class="abs" style="left:${f(dPos)}px;top:${f((H - dLen) / 2)}px;width:${g}px;height:${f(dLen)}px;background:${c.acc};box-shadow:0 0 18px ${hexA(c.acc, .8)},0 0 46px ${hexA(c.acc, .35)}"></div>`;
    const bg = `<div class="full" style="background:${c.bg};opacity:${f(clamp(m * 3), 3)}"></div>`;
    // Labels: top-left of each pane, kept inside the vertical safe zone.
    const kl = i => E.outBack(prog(lt, .45 + i * .12, .35), 2) * (s.keep ? 1 : 1 - clamp(prog(t, s.t1 - .5, .25)));
    const top = vert ? 140 : 22, pad = vert ? 22 : 24, lfs = vert ? 21 : 19;
    const labs = labels.map((L, i) => {
      if (!L) return '';
      const r = [rA, rB][i];
      const big = o.emph == null || (i ? 1 - share : share) >= .5;
      const html = chip(c, L, t, { color: o.cols ? o.cols[i] : c.acc, solid: o.solid ?? (o.emph != null ? big : false), dot: typeof L === 'object' ? L.dot : false, fs: lfs });
      const y = axis === 'v' ? (i ? r.y + 18 : Math.max(top, r.y + 18)) : top;
      return chipAt(html, r.x + pad, y, kl(i));
    }).join('');
    let vs = '';
    if (o.vs) {
      const kv = E.outBack(prog(lt, .35, .4), 2.6) * (s.keep ? 1 : 1 - clamp(prog(t, s.t1 - .4, .25)));
      const cx = axis === 'v' ? W / 2 : rD.x + g / 2, cy = axis === 'v' ? rD.y + g / 2 : H * (vert ? .5 : .5);
      const d = vert ? 104 : 92, pulse = 1 + .04 * Math.sin(lt * 5);
      vs = `<div class="abs" style="left:${f(cx - d / 2)}px;top:${f(cy - d / 2)}px;width:${d}px;height:${d}px;border-radius:50%;
        background:radial-gradient(circle at 35% 30%,#fff 0,${c.acc} 30%,${hexA(c.acc, 1)} 55%,#E08A00 100%);border:5px solid ${c.bg};
        box-shadow:0 0 0 3px ${c.acc},0 0 34px ${hexA(c.acc, .7)},0 14px 30px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;
        transform:rotate(${f(-10 + (1 - clamp(kv)) * -120)}deg) scale(${f(clamp(kv, 0, 1.4) * pulse, 3)});opacity:${f(clamp(kv * 3), 3)}">
        <b style="font-family:'Montserrat',sans-serif;font-weight:900;font-style:italic;font-size:${Math.round(d * .4)}px;line-height:1;color:#111;letter-spacing:-.03em;
          text-shadow:0 2px 0 rgba(255,255,255,.5)">${esc(s.vs_text ?? 'VS')}</b></div>`;
    }
    return `<div class="full"${cidOf(s)}>${bg}${order.join('')}${div}${labs}${vs}</div>`;
  }

  // Divider position (for the caption dock) of the active vertical split at t, else null.
  function dockY(t) {
    const [, H] = DIMS();
    for (const s of TL.scenes || []) {
      if (s.hidden || t < s.t0 || t >= s.t1) continue;
      if (s.type === 'split_stack' && (s.dock ?? true)) return { y: H * stackShare(s), m: mixAt(s, t) };
      if (s.type === 'split_focus' && focusAxis(s) === 'v' && (s.dock ?? true)) return { y: H * focusShare(s, t), m: mixAt(s, t) };
    }
    return null;
  }
  const stackShare = s => { const r = clamp(s.ratio ?? .5, .25, .75); return (s.speaker_pos || 'bottom') === 'top' ? r : 1 - r; };
  const focusAxis = s => s.axis || (VERT() ? 'v' : 'h');
  // keys: [{t, v}] — v = speaker share (0.3 = speaker small, 0.7 = speaker big). Default: 50 → 70 → 30.
  function focusShare(s, t) {
    const d = s.t1 - s.t0;
    const keys = s.keys && s.keys.length ? s.keys : [{ t: s.t0, v: .5 }, { t: s.t0 + d * .3, v: .7, dur: .5 }, { t: s.t0 + d * .62, v: .3, dur: .5 }];
    const v = clamp(keyAt(keys, t, 'v', .5), .2, .8);
    const first = (s.speaker_pos || (focusAxis(s) === 'v' ? 'bottom' : 'left'));
    return first === 'top' || first === 'left' ? v : 1 - v;
  }

  const MOD = {
    // 1. Stack: speaker on one half (default bottom), second source on the other half, accent divider, label chips.
    // { speaker_pos:'bottom'|'top', ratio:.5 (speaker share), media | screen | src2, fit, pos, label, speaker_label, speaker:{zoom,fx,fy}, gap }
    split_stack(s, t, lt) {
      const top = (s.speaker_pos || 'bottom') === 'top';
      const sp = { speaker: true, ...(s.speaker || {}) }, sc = second(s);
      const srcs = top ? [sp, sc] : [sc, sp];
      const labs = top ? [s.speaker_label, s.label] : [s.label, s.speaker_label];
      return { back: twoUp(s, t, lt, 'v', stackShare(s), srcs, labs) };
    },

    // 2. Side by side (left/right). { speaker_side:'left'|'right', ratio:.5, media|screen|src2, label, speaker_label }
    split_side(s, t, lt) {
      const left = (s.speaker_side || 'left') === 'left';
      const r = clamp(s.ratio ?? .5, .25, .75);
      const sp = { speaker: true, ...(s.speaker || {}) }, sc = second(s);
      return { back: twoUp(s, t, lt, 'h', left ? r : 1 - r, left ? [sp, sc] : [sc, sp], left ? [s.speaker_label, s.label] : [s.label, s.speaker_label]) };
    },

    // 3. Picture-in-picture: second source full frame, speaker in a rounded corner window (drag x/y, size = %).
    // { corner:'tr'|'tl'|'br'|'bl', x, y, size, shape:'round'|'circle', aspect, media|screen|src2, label, speaker_label, ring }
    split_pip(s, t, lt) {
      const c = C(s), [W, H] = DIMS(), vert = VERT();
      const m = mixAt(s, t, .6, .5);
      const k = (s.size ?? 100) / 100, circle = s.shape === 'circle';
      const pw = (vert ? 236 : 300) * k, ph = circle ? pw : pw * (s.aspect ?? (vert ? 1.28 : .72));
      const corner = s.corner || (vert ? 'tr' : 'br'), mx = vert ? 26 : 30;
      const top = vert ? 150 : 28, bot = vert ? 1000 : H - 28;
      const cx = s.x ?? (corner[1] === 'l' ? mx + pw / 2 : W - mx - pw / 2);
      const cy = s.y ?? (corner[0] === 't' ? top + ph / 2 : bot - ph / 2);
      const pr = { x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph };
      const r = lerpR({ x: 0, y: 0, w: W, h: H }, pr, m);
      const rad = lerp(0, circle ? pw / 2 : 26, m), ring = s.ring ?? c.acc;
      const sc = second(s);
      const bgK = lerp(1.08, 1, E.outCubic(m));
      const back = `<div class="full" style="background:${c.bg}"></div><div class="full" style="opacity:${f(clamp(m * 1.6), 3)};transform:scale(${bgK.toFixed(4)})">${srcHTML(sc, t, W, H, s, lt)}</div>`;
      const sp = `<div style="position:absolute;left:${f(r.x)}px;top:${f(r.y)}px;width:${f(r.w)}px;height:${f(r.h)}px;border-radius:${f(rad)}px;overflow:hidden;
        box-shadow:0 0 0 ${f(4 * m)}px ${ring},0 0 ${f(30 * m)}px ${hexA(ring, .5)},0 18px 40px rgba(0,0,0,${f(.55 * m, 2)})">${speakerBox(t, r.w, r.h, { speaker: true, ...(s.speaker || {}), fpy: s.speaker?.fpy ?? .4 })}</div>`;
      const kl = E.outBack(prog(lt, .55, .35), 2) * (s.keep ? 1 : 1 - clamp(prog(t, s.t1 - .55, .25)));
      const sl = s.speaker_label ? chipAt(chip(c, s.speaker_label, t, { solid: true, color: ring, fs: 17, pad: '5px 14px', dot: true }), cx, pr.y + ph - 16, kl, { ax: -50, dy: 10 }) : '';
      const lab = s.label ? chipAt(chip(c, s.label, t, { fs: vert ? 21 : 19 }), corner[1] === 'l' && corner[0] === 't' ? W - (vert ? 22 : 24) : (vert ? 22 : 24), vert ? 140 : 22, kl, corner[1] === 'l' && corner[0] === 't' ? { ax: -100 } : {}) : '';
      return { back: `<div class="full"${cidOf(s)}>${back}${sp}${sl}${lab}</div>` };
    },

    // 4. Compare A vs B: two sources with coloured labels and a VS badge on the divider.
    // { a, b (any source; 'speaker' allowed), label_a, label_b, layout:'stack'|'side', vs_text, color_a, color_b }
    split_compare(s, t, lt) {
      const c = C(s), axis = (s.layout || (VERT() ? 'stack' : 'side')) === 'stack' ? 'v' : 'h';
      const A = s.a ?? { speaker: true, filter: 'grayscale(1) brightness(.8)' }, B = s.b ?? 'speaker';
      return { back: twoUp(s, t, lt, axis, clamp(s.ratio ?? .5, .25, .75), [A, B], [s.label_a ?? { text: 'A' }, s.label_b ?? { text: 'B' }], { vs: s.vs !== false, cols: [c.a, c.b], solid: true }) };
    },

    // 5. Focus: two panes whose split moves at keyed times (speaker 70/30 ↔ 30/70); small pane dims slightly.
    // { axis:'v'|'h', speaker_pos:'bottom'|'top'|'left'|'right', keys:[{t, v}] (v = speaker share), media|screen|src2, label, speaker_label }
    split_focus(s, t, lt) {
      const axis = focusAxis(s), pos = s.speaker_pos || (axis === 'v' ? 'bottom' : 'left');
      const first = pos === 'top' || pos === 'left';
      const sp = { speaker: true, ...(s.speaker || {}) }, sc = second(s), share = focusShare(s, t);
      return { back: twoUp(s, t, lt, axis, share, first ? [sp, sc] : [sc, sp], first ? [s.speaker_label, s.label] : [s.label, s.speaker_label], { emph: 1 }) };
    },

    // 6. Label chip anywhere. { text, icon, x, y, size, color, solid, dot, align:'center'|'left'|'right' }
    split_label(s, t, lt) {
      const c = C(s), [W] = DIMS();
      const k = E.outBack(prog(lt, 0, .35), 2.2), o = fadeIO(t, s.t0, s.keep ? null : s.t1, .12, .25);
      const sc = (s.size ?? 100) / 100, ax = s.align === 'left' ? 0 : s.align === 'right' ? -100 : -50;
      const html = chip(c, { text: s.text ?? 'ĐANG XEM', icon: s.icon, color: s.color, solid: s.solid, dot: s.dot ?? !s.icon, upper: s.upper }, t, { fs: s.font_size || 27, pad: '11px 24px 11px 18px' });
      return { front: `<div class="abs"${cidOf(s)} style="left:${f(s.x ?? W / 2)}px;top:${f(s.y ?? 170)}px;transform:translate(${ax}%,-50%) scale(${f(sc * clamp(k, 0, 1.3), 3)});
        transform-origin:${ax === 0 ? '0%' : ax === -100 ? '100%' : '50%'} 50%;opacity:${f(o * clamp(k * 2), 3)}">${html}</div>` };
    },
  };
  Object.assign(MODULES, MOD);

  // ---------- caption style "split": glass bar, current word in accent with an underline; docks onto the divider ----------
  CAPTION_STYLES.split = (cap, t) => {
    const c = C(), [W, H] = DIMS(), vert = VERT();
    const dock = cap.y == null ? dockY(t) : null;
    const size = cap.size || (vert ? 36 : 34);
    const base = vert ? 862 : 560;
    const top = cap.y ?? (dock ? lerp(base, dock.y, dock.m) : base);
    const x = cap.x ?? W / 2, dx = x - W / 2;
    let cur = -1;
    cap.words.forEach((w, i) => { if (t >= w.s - .03) cur = i; });
    const kin = E.outBack(prog(t, cap.t0, .18), 1.8);
    const html = cap.words.map((w, i) => {
      const on = i === cur && t < (w.e ?? w.s + .4) + .12;
      if (w.hl) return `<span style="display:inline-block;padding:0 .18em;margin:0 .04em;border-radius:.16em;background:${c.acc};color:#0B0B0C">${esc(w.w)}</span>`;
      return `<span style="position:relative;display:inline-block;margin:0 .02em;color:${on ? c.acc : cap.color || '#FFFFFF'}">${esc(w.w)}${on ? `<span style="position:absolute;left:0;right:0;bottom:-.02em;height:.1em;border-radius:.05em;background:${c.acc};
        transform:scaleX(${f(E.outCubic(prog(t, w.s - .03, .18)), 3)});transform-origin:0 50%"></span>` : ''}</span>`;
    }).join(' ');
    return `<div id="cap"${cidOf(cap)} style="position:absolute;top:${f(top)}px;left:${30 + dx}px;right:${30 - dx}px;text-align:center;transform:translateY(-50%) scale(${f(lerp(.9, 1, clamp(kin, 0, 1.1)), 3)});z-index:90">
      <span style="display:inline-block;max-width:${vert ? 620 : 980}px;padding:${f(size * .22)}px ${f(size * .55)}px;border-radius:${f(size * .45)}px;background:rgba(11,13,18,.84);
        border:1.5px solid rgba(255,255,255,.1);box-shadow:0 10px 26px rgba(0,0,0,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
        font-family:${cap.font || c.disp};font-weight:${cap.weight || 800};font-size:${size}px;line-height:1.32;letter-spacing:-.005em;color:#fff;text-shadow:none;white-space:normal">${html}</span></div>`;
  };

  // ---------- Studio metadata ----------
  const B2 = () => ({ screen: { broll: { id: 'ai--neural--ember' } } });
  PACKS.push({
    id: P, name: 'Chia đôi màn hình', icon: '🪟',
    desc: 'Người nói + màn hình / b-roll / ảnh: chia trên-dưới, trái-phải, khung PIP, so sánh A vs B, đổi tỉ lệ 70/30; người nói thu nhỏ từ toàn khung vào ô',
    caption: 'split',
    items: [
      { type: 'split_stack', label: 'Chia trên / dưới', make: T => ({ type: 'split_stack', t0: T, t1: T + 4, speaker_pos: 'bottom', ratio: .5, ...B2(), label: { text: 'Màn hình' }, speaker_label: '' }) },
      { type: 'split_side', label: 'Chia trái / phải', make: T => ({ type: 'split_side', t0: T, t1: T + 4, speaker_side: 'left', ...B2(), label: { text: 'Ví dụ' } }) },
      { type: 'split_pip', label: 'Khung PIP (người nói góc)', make: T => ({ type: 'split_pip', t0: T, t1: T + 4, corner: VERT() ? 'tr' : 'br', size: 100, ...B2(), label: { text: 'Đây là', dot: true }, speaker_label: 'LIVE' }) },
      { type: 'split_compare', label: 'So sánh A vs B', make: T => ({ type: 'split_compare', t0: T, t1: T + 4, a: { speaker: true, filter: 'grayscale(1) brightness(.8)' }, b: 'speaker', label_a: { text: 'Cách cũ' }, label_b: { text: 'Cách mới' } }) },
      { type: 'split_focus', label: 'Đổi trọng tâm 70/30', make: T => ({ type: 'split_focus', t0: T, t1: T + 5, ...B2(), keys: [{ t: T, v: .5 }, { t: T + 1.5, v: .7 }, { t: T + 3, v: .3 }], label: { text: 'Màn hình' }, speaker_label: { text: 'Mình' } }) },
      { type: 'split_label', label: 'Nhãn chip', make: T => ({ type: 'split_label', t0: T, t1: T + 2.5, text: 'Nhìn kỹ nha', x: DIMS()[0] / 2, y: VERT() ? 170 : 60, size: 100, dot: true }) },
    ],
    // Starter edit: speaker-only and split segments alternate; splits land on "nhìn / đây là / ví dụ / so sánh / xem".
    recipe: ctx => {
      const dur = ctx.dur || 20, caps = ctx.captions || [], vert = ctx.vertical ?? VERT();
      const src2 = ctx.media ? { media: ctx.media } : { screen: { broll: { id: ctx.broll || 'ai--neural--ember' } } };
      const groups = [['so sánh', 'so với'], ['ví dụ', 'chẳng hạn'], ['đây là', 'như thế này', 'cái này'], ['nhìn', 'xem', 'thấy']];
      const hits = [];
      groups.forEach((g, gi) => { let a = 0, tt; while ((tt = findWord(caps, g, a)) != null && hits.length < 40) { hits.push({ t: tt, g: gi }); a = tt + .05; } });
      hits.sort((p, q) => p.t - q.t);
      // Fallback beats keep speaker-only stretches ≤ ~5 s; real keyword hits near them win (greedy, in time order).
      for (const k of [.18, .45, .7]) if (!hits.some(h => Math.abs(h.t - dur * k) < 3)) hits.push({ t: dur * k, g: 3 });
      hits.sort((p, q) => p.t - q.t);
      const scenes = [{ type: 'split_label', t0: .25, t1: 2.4, text: ctx.title || 'Xem đến cuối nhé', x: vert ? 360 : 640, y: vert ? 170 : 64, size: 100, dot: true }];
      const rot = vert ? ['split_stack', 'split_pip', 'split_focus'] : ['split_side', 'split_pip', 'split_focus'];
      let last = 2.2, n = 0;
      for (const h of hits) {
        const t0 = Math.max(h.t - .15, last + 1.6);
        const len = h.g === 0 ? 4 : 3.6, t1 = Math.min(t0 + len, dur - 2.6);
        if (t1 - t0 < 2.4 || n >= 4) continue;
        let sc;
        if (h.g === 0) sc = { type: 'split_compare', a: { speaker: true, filter: 'grayscale(1) brightness(.8)' }, b: 'speaker', label_a: { text: 'Trước' }, label_b: { text: 'Sau' } };
        else {
          const type = rot[n % rot.length];
          sc = { type, ...src2, label: { text: h.g === 1 ? 'Ví dụ' : h.g === 2 ? 'Đây là' : 'Nhìn nè', dot: type === 'split_pip' } };
          if (type === 'split_focus') sc.keys = [{ t: t0, v: .5 }, { t: t0 + 1.2, v: .3 }, { t: t1 - 1, v: .7 }];
          if (type === 'split_pip') { sc.corner = vert ? 'tr' : 'br'; sc.speaker_label = 'LIVE'; }
        }
        scenes.push({ ...sc, t0: +t0.toFixed(2), t1: +t1.toFixed(2) });
        last = t1; n++;
      }
      scenes.push({ type: 'split_label', t0: Math.max(last + .3, dur - 2.4), t1: dur, text: (ctx.brand && ctx.brand.handle) || 'Theo dõi để xem phần 2', icon: '👉', x: vert ? 360 : 640, y: vert ? 170 : 64, size: 100, keep: true });
      return { caption_style: 'split', music: 'tech', scenes };
    },
  });
})();
