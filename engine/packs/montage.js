// Pack "montage" — five montage / storytelling looks ported from ghost-editor recipes (kurbaitaev, MIT), own code:
//   seoul  : voice-over list over fast hard-cut B-roll, ONE big key word per line (serif italic for mood/place, heavy grotesk
//            for facts), white flash / collage pages, blue selection list, chat-bubble outro          (mt_seoul_*)
//   result : warm "RESULT" podcast: navy / kraft cards with two-tier type, polaroids, paper stack, film grain + dust + burns
//            (mt_result_card, mt_polaroid, mt_paper_stack, mt_film)
//   face   : "Face RESULT": paper props BESIDE the face (zones from TL.face, never on it), navy two-tier captions under the chin
//            (mt_prop_note, mt_quote_card, mt_prop_bars, mt_label_tape + mt_polaroid / mt_film)
//   pov    : POV / action-cam clips cut into a story: HUD, kinetic hook, rewind card, freeze moment, stat badges (mt_pov_*)
//   vector : no camera: narrator + a world that draws itself (SVG stroke-dashoffset tree, camera moves) (mt_vec_*)
// Every module is a pure function of t. Spec: references/pack-montage.md.
(() => {
  const P = 'montage';
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const f1 = v => (+v).toFixed(1), f2 = v => (+v).toFixed(2), f3 = v => (+v).toFixed(3);
  const F = {
    serif: "'Playfair Display',Georgia,serif", sans: "'Inter Tight','Be Vietnam Pro',sans-serif", body: "'Be Vietnam Pro',sans-serif",
    // Caveat has no Vietnamese glyphs (ộ, ầ, ư…), so handwriting uses Pacifico (has the vietnamese subset).
    hand: "'Pacifico','Be Vietnam Pro',cursive", disp: "'Montserrat','Be Vietnam Pro',sans-serif", mono: "'JetBrains Mono',monospace", ui: "'Inter','Be Vietnam Pro',sans-serif",
  };
  const brand = () => (typeof TL !== 'undefined' && TL && TL.brand) || {};
  const C = {
    white: '#FFFFFF', ink: '#0E0E10', red: '#FF3B30', blue: '#0B84FE',                              // seoul
    navy: '#14213A', navy2: '#1E3052', pen: '#1F3B8C', rred: '#C8372D', gold: '#C9A24A', cream: '#FFF3D6', kraft: '#B98E5E',
    paper: '#FBF7EC', rink: '#22252B', script: '#FFE2A0',                                            // result
    lime: '#A6FF00', pink: '#111111',                                                                 // pov
    soil: '#1B1410', soil2: '#2A1F18', root: '#C9A15B', sky: '#F4EAD8', sun: '#F2B544', leaf: '#6E8B3D', fruit: '#C0392B', // vector
  };
  const lime = s => (s && s.color) || brand().primary || C.lime;
  const fps = () => (typeof TL !== 'undefined' && TL && TL.fps) || 30;
  const frameNo = t => Math.floor(t * fps() + 1e-6);
  const words = v => String(v ?? '').trim().split(/\s+/).filter(Boolean);
  const nch = v => Array.from(String(v ?? '')).length;
  // `*word*` -> accent span
  const marks = (v, style) => esc(v).replace(/\*([^*]+)\*/g, `<span style="${style}">$1</span>`);
  // Blur-in style (word lands on its spoken time): opacity 0 before `at`.
  const blurIn = (t, at, dur = .22, b = 14, rise = 0) => {
    if (t < at) return 'opacity:0;';
    const k = clamp((t - at) / dur), e = E.outCubic(k);
    return `opacity:${f3(e)};${k < 1 ? `filter:blur(${f1((1 - k) * b)}px);` : ''}${rise ? `transform:translateY(${f1((1 - e) * rise)}px);` : ''}`;
  };
  // Handwriting / print wipe-in, left to right.
  const wipe = (t, at, dur) => {
    if (t < at) return 'clip-path:inset(-30% 100% -30% -6%);';
    const k = E.inOutSine(clamp((t - at) / dur));
    return k >= 1 ? '' : `clip-path:inset(-30% ${f1((1 - k) * 100)}% -30% -6%);`;
  };
  const writeDur = txt => clamp(nch(txt) * .055, .35, 1.3);
  // Picture: 'aroll' = the main track at t; a path / {seq} = media(); '' = neutral placeholder.
  const pic = (src, t, st = '') => {
    if (src === 'aroll' || src === '@aroll') return `<div class="full" style="overflow:hidden;${st}">${arollImg(t)}</div>`;
    const u = src ? media(src, t) : '';
    if (!u) return `<div class="full" style="background:linear-gradient(140deg,#3a3f4b,#7b8190);${st}"><svg viewBox="0 0 24 24" style="position:absolute;left:50%;top:50%;width:22%;transform:translate(-50%,-50%);fill:none;stroke:rgba(255,255,255,.75);stroke-width:1.4"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-6-6-9 8"/></svg></div>`;
    return `<img src="${u}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;${st}">`;
  };
  // Film grain (data-URI turbulence, 8 seeds cycling by frame) + per-frame seeded dust specks and hairs.
  const GRAIN = [];
  const grain = (t, op = .08) => {
    const i = frameNo(t) % 8;
    if (!GRAIN[i]) {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' seed='${i * 7 + 3}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 1.4 -.2'/></filter><rect width='200' height='200' filter='url(#n)'/></svg>`;
      GRAIN[i] = `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}')`;
    }
    return `<div class="full" style="pointer-events:none;background-image:${GRAIN[i]};background-size:200px 200px;opacity:${op};mix-blend-mode:overlay"></div>`;
  };
  const dust = (t, n = 9, col = '255,250,235') => {
    const [W, H] = DIMS(), fr = frameNo(t);
    let h = '';
    for (let i = 0; i < n; i++) {
      if (rnd(fr * 31.7 + i * 7.3) < .5) continue;
      const x = rnd(fr * 17.1 + i * 3.1) * W, y = rnd(fr * 13.3 + i * 5.7) * H, sz = 1 + rnd(fr * 7.9 + i) * 3.2, o = .25 + rnd(fr * 3.3 + i * 9.1) * .45;
      h += `<i style="position:absolute;left:${f1(x)}px;top:${f1(y)}px;width:${f1(sz)}px;height:${f1(sz)}px;border-radius:50%;background:rgba(${col},${f2(o)})"></i>`;
    }
    if (rnd(fr * 1.37) > .82) { // a hair now and then
      const x = rnd(fr * 2.1) * W, y = rnd(fr * 4.3) * H, r = 14 + rnd(fr * 5.5) * 30;
      h += `<svg style="position:absolute;left:${f1(x)}px;top:${f1(y)}px;overflow:visible" width="1" height="1"><path d="M0 0c${f1(r * .4)} ${f1(-r * .3)} ${f1(r * .7)} ${f1(r * .5)} ${f1(r)} ${f1(r * .2)}" stroke="rgba(${col},.5)" stroke-width="1.2" fill="none"/></svg>`;
    }
    return `<div class="full" style="pointer-events:none;mix-blend-mode:screen">${h}</div>`;
  };
  const vignette = (a = .42) => `<div class="full" style="pointer-events:none;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 55%,rgba(0,0,0,${a}) 100%)"></div>`;
  // Paper entrances (RESULT props): returns [transform, opacity].
  const enter = (kind, lt, rot = 0, side = 1, dur = .45) => {
    const k = clamp(lt / dur);
    switch (kind) {
      case 'none': return [`rotate(${rot}deg)`, 1];
      case 'fade': return [`rotate(${rot}deg)`, E.outCubic(k)];
      case 'slap': { const e = E.outBack(clamp(lt / .28), 2); return [`rotate(${f2(rot + (1 - e) * 6)}deg) scale(${f3(lerp(1.3, 1, e))})`, clamp(lt / .1)]; }
      case 'drop': { const e = E.outBack(k, 1.4); return [`translateY(${f1((1 - e) * -520)}px) rotate(${f2(rot - (1 - e) * 8)}deg)`, clamp(lt / .12)]; }
      case 'rise': { const e = E.outBack(k, 1.3); return [`translateY(${f1((1 - e) * 460)}px) rotate(${f2(rot + (1 - e) * 6)}deg)`, clamp(lt / .12)]; }
      case 'swing': { const e = E.outBack(clamp(lt / .6), 2.4); return [`rotate(${f2(rot - (1 - e) * 38)}deg)`, clamp(lt / .12)]; }
      case 'unfold': { const e = E.outCubic(k); return [`rotate(${rot}deg) scaleY(${f3(Math.max(.02, e))})`, clamp(lt / .1)]; }
      default: { const e = E.outCubic(k); return [`translateX(${f1((1 - e) * 460 * side)}px) rotate(${f2(rot + (1 - e) * 24 * side)}deg)`, clamp(lt / .12)]; } // toss
    }
  };
  // Face-safe placement: zones measured from TL.face (design px). Returns centre + scale so a w×h prop fits the zone.
  const FACE = () => (typeof TL !== 'undefined' && TL && TL.face) || { x: DIMS()[0] / 2, y: DIMS()[1] * .42 };
  function place(s, w, h, def = 'top') {
    const [W, H] = DIMS();
    if (s.x != null && s.y != null) return { x: s.x, y: s.y, k: s.scale ?? 1, zone: 'xy' };
    const f = FACE(), fr = s.face_r ?? 180, fh = s.face_h ?? 250;
    const Z = {
      top: [24, 100, W - 24, f.y - fh],
      right: [f.x + fr, f.y - fh - 30, W - 14, f.y + fh * .9],
      left: [14, f.y - fh - 30, f.x - fr, f.y + fh * .9],
      chest: [36, f.y + fh + 30, W - 36, H - 190],
    };
    const order = [s.zone || def, 'top', 'right', 'left', 'chest'];
    let best = null;
    for (const z of order) {
      const b = Z[z]; if (!b) continue;
      const bw = b[2] - b[0], bh = b[3] - b[1]; if (bw < 80 || bh < 80) continue;
      const k = Math.min(1, bw / (w * 1.06), bh / (h * 1.06)) * (s.scale ?? 1);
      const r = { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, k, zone: z };
      if (k >= .6) return r;
      if (!best || k > best.k) best = r;
    }
    return best || { x: W / 2, y: 260, k: .6, zone: 'top' };
  }
  const propWrap = (s, t, lt, w, h, def, inner, opt = {}) => {
    const pl = place(s, w, h, def), [W] = DIMS(), rot = s.rot ?? opt.rot ?? -2;
    const [tr, o] = enter(s.enter || opt.enter || 'toss', lt, rot, pl.x > W / 2 ? 1 : -1);
    return `<div class="abs"${cidOf(s)} style="left:${f1(pl.x)}px;top:${f1(pl.y)}px;width:0;height:0;opacity:${f3(o)}">
      <div style="position:absolute;left:${-w / 2}px;top:${-h / 2}px;width:${w}px;height:${h}px;transform:scale(${f3(pl.k)}) ${tr};transform-origin:${s.enter === 'swing' || s.enter === 'unfold' ? '50% 0' : '50% 50%'};perspective:1200px">${inner}</div></div>`;
  };
  const stampHTML = (st, t, t0, extra = '') => {
    if (!st) return '';
    const at = t0 + (st.at ?? .8);
    if (t < at) return '';
    const e = E.outBack(clamp((t - at) / .22), 2.6), col = st.color || C.rred;
    return `<div style="position:absolute;${extra}padding:.18em .55em;border:.16em solid ${col};border-radius:.25em;color:${col};font:800 ${st.size || 30}px/1 ${F.disp};letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;mix-blend-mode:multiply;
      opacity:${f3(clamp((t - at) / .06) * .9)};transform:rotate(${st.rot ?? -9}deg) scale(${f3(lerp(1.9, 1, e))})">${esc(st.text || 'ĐÃ XONG')}</div>`;
  };
  const markerEllipse = (t, at, w, h, col = C.rred) => {
    if (t < at) return '';
    const k = E.inOutSine(clamp((t - at) / .5));
    return `<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="position:absolute;left:-8%;top:-22%;width:116%;height:144%;overflow:visible;pointer-events:none">
      <path d="M8 22C6 8 40 3 62 5S99 14 94 26 50 39 26 35 4 26 18 10" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${f3(1 - k)}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke" style="stroke-width:4px"/></svg>`;
  };

  // =================================================================================== SEOUL LIST
  const halo = 'text-shadow:0 0 2px rgba(0,0,0,.55),0 0 10px rgba(0,0,0,.42),0 6px 24px rgba(0,0,0,.35)';
  // Size a big word so it is ~`width` px wide (short words get bigger), clamped.
  const fitSize = (text, family, caps, width, base) => {
    const cw = family === 'sans' ? (caps ? .7 : .58) : (caps ? .72 : .5);
    return Math.round(clamp(width / Math.max(1, nch(text) * cw), base * .45, base * 1.15));
  };
  const SEO = {
    // 1. Fast hard-cut B-roll montage (cover): shots:[{src, at (s from scene start), pos}] or images[] cut every `every` s,
    //    each with a slow push zoom [z0,z1]. src 'aroll' = the speaker's own footage (selfie opener).
    mt_seoul_shots(s, t, lt) {
      const list = (s.shots || (s.images || []).map(src => ({ src }))).map(x => (typeof x === 'string' ? { src: x } : x));
      if (!list.length) list.push({ src: 'aroll' });
      const every = s.every ?? 1.4, starts = list.map((x, i) => x.at ?? i * every);
      const span = (starts.at(-1) ?? 0) + every;
      // no new cut in the last 0.35 s: the scene's own fade-out carries the hand-off instead of a cut + fade on top
      const lq = Math.min(lt, Math.max(0, s.t1 - s.t0 - .36));
      const ll = s.loop === false ? lq : lq % span;
      let i = 0; for (let j = 0; j < starts.length; j++) if (ll >= starts[j]) i = j;
      const sh = list[i], d = (starts[i + 1] ?? starts[i] + every) - starts[i], k = clamp((ll - starts[i]) / Math.max(.2, d));
      const [z0, z1] = sh.zoom || s.zoom || [1, 1.06];
      const z = lerp(z0, z1, k);
      return { back: `<div class="full"${cidOf(s)} style="overflow:hidden;background:#111">${pic(sh.src, t, `transform:scale(${f3(z)});transform-origin:50% 50%;${sh.pos ? `object-position:${sh.pos};` : ''}`)}</div>`, cover: true };
    },
    // 2. Big word beat: ONE word ~440 px wide, `family` serif (italic, mood/place) | sans (heavy, facts; caps = contrast word),
    //    `sub` = small line tucked under its right end (`sub_pos` below-right|below-left|above-left|above-right); each word blurs in
    //    at `at` + i·stagger (s from scene start), the sub at `sub_at`.
    mt_seoul_word(s, t, lt) {
      const [W] = DIMS(), fam = s.family || 'serif', caps = !!s.caps, text = caps ? String(s.text || '').toUpperCase() : String(s.text || 'yên bình');
      const size = s.size || fitSize(text, fam, caps, s.width || (fam === 'sans' ? 410 : 440), 120);
      const ws = words(text), at = s.at ?? 0, st = s.stagger ?? .1;
      const ff = fam === 'sans' ? `font-family:${F.sans};font-weight:900;letter-spacing:-.035em` : `font-family:${F.serif};font-style:italic;font-weight:600;letter-spacing:-.01em`;
      const col = s.color || C.white, shadow = col === C.white ? halo : 'text-shadow:none';
      const big = `<div style="${ff};font-size:${size}px;line-height:1.14;white-space:nowrap;color:${col};${shadow}">${ws.map((w, i) => `<span style="display:inline-block;${blurIn(lt, at + i * st)}">${esc(w)}</span>`).join(' ')}</div>`;
      const pos = s.sub_pos || 'below-right', subSz = s.sub_size || 34;
      const sub = s.sub ? `<div style="font:700 ${subSz}px/1.15 ${F.sans};color:${col};${shadow};white-space:nowrap;letter-spacing:-.01em;${pos.startsWith('above') ? 'margin-bottom:.05em' : 'margin-top:-.08em'};${blurIn(lt, s.sub_at ?? at + ws.length * st + .15)}">${esc(s.sub)}</div>` : '';
      const align = pos.endsWith('left') ? 'left' : pos.endsWith('right') ? 'right' : 'center';
      return { front: `<div class="abs"${cidOf(s)} style="left:${s.x ?? W / 2}px;top:${s.y ?? 600}px;transform:translate(-50%,-50%)"><div style="display:inline-block;text-align:${align}">${pos.startsWith('above') ? sub + big : big + sub}</div></div>`, hideCaptions: s.hideCaptions ?? true };
    },
    // 3. White word flash: white page, one black heavy connector word ("thậm chí", "và rồi"); sub optional. 0.4–0.8 s.
    mt_seoul_flash(s, t, lt) {
      const [W, H] = DIMS(), size = s.size || 64, txt = s.text || 'thậm chí';
      const fam = s.family === 'serif' ? `font-family:${F.serif};font-style:italic;font-weight:700` : `font-family:${F.sans};font-weight:900;letter-spacing:-.03em`;
      return {
        back: `<div class="full"${cidOf(s)} style="background:#fff"><div class="abs" style="left:${s.x ?? W / 2}px;top:${s.y ?? H * .48}px;transform:translate(-50%,-50%);text-align:left">
          <div style="${fam};font-size:${size}px;line-height:1.12;color:${C.ink};white-space:nowrap;${blurIn(lt, 0, .12, 8)}">${esc(txt)}</div>
          ${s.sub ? `<div style="font:800 ${Math.round(size * .55)}px/1.1 ${F.sans};color:${C.ink};white-space:nowrap;${blurIn(lt, s.sub_at ?? .15, .12, 6)}">${esc(s.sub)}</div>` : ''}</div></div>`,
        cover: true, hideCaptions: true,
      };
    },
    // 4. White collage page (hook). mode 'photo': heavy line on top, a photo card flies in tilted and lands straight, the big
    //    italic serif word under it (glitch:true = red ghosts), emoji stickers. mode 'shrink': the current shot (src, default
    //    'aroll') shrinks into a rounded card on white, the card dissolves as the big word lands and the line drops under it.
    mt_seoul_collage(s, t, lt) {
      const [W, H] = DIMS(), mode = s.mode || 'photo', red = s.word_color || C.red;
      const line = String(s.line ?? 'Đà Lạt có một điều'), lw = words(line), la = s.line_at ?? .05, bigAt = s.big_at ?? (mode === 'shrink' ? 1.0 : .75);
      const big = String(s.big ?? 'bất ngờ'), bsz = s.size || fitSize(big, 'serif', false, 470, 118);
      const glitch = s.glitch !== false, gk = clamp((lt - bigAt) / .55), fr = frameNo(t);
      const ghosts = glitch && lt >= bigAt ? [[-1, '#00E5FF'], [1, red]].map(([d, c], j) => {
        const jit = gk < 1 ? (rnd(fr * 3.1 + j) - .5) * 26 * (1 - gk) : 0;
        return `<span style="position:absolute;left:0;top:0;color:${c};opacity:${f3((1 - gk) * .75)};transform:translate(${f1(d * 6 * (1 - gk) + jit)}px,${f1(-d * 3 * (1 - gk))}px);mix-blend-mode:multiply">${esc(big)}</span>`;
      }).join('') : '';
      const bigHTML = `<div style="position:relative;font:italic 700 ${bsz}px/1.14 ${F.serif};color:${glitch ? red : C.ink};white-space:nowrap;${glitch ? `text-shadow:0 0 18px ${red}55;` : ''}${blurIn(lt, bigAt, .2, 10)}">${ghosts}<span style="position:relative">${esc(big)}</span></div>`;
      const lineHTML = (sz, col = C.ink) => `<div style="font:800 ${sz}px/1.15 ${F.sans};color:${col};letter-spacing:-.02em;white-space:nowrap">${lw.map((w, i) => `<span style="display:inline-block;${blurIn(lt, la + i * (s.line_stagger ?? .12), .18, 8)}">${esc(w)}</span>`).join(' ')}</div>`;
      let body = '';
      if (mode === 'shrink') {
        const k = E.inOutSine(clamp(lt / (s.shrink_dur ?? .55))), sc = lerp(1, s.scale ?? .63, k), r = lerp(0, 34, k);
        const fade = 1 - clamp((lt - bigAt) / .3);
        body += `<div class="full" style="transform:scale(${f3(sc)});transform-origin:50% 52%;border-radius:${f1(r / sc)}px;overflow:hidden;opacity:${f3(fade)};box-shadow:0 20px 50px rgba(0,0,0,${f2(.3 * k)})">${pic(s.src ?? 'aroll', t)}</div>`;
        const after = lt >= bigAt + .15, ly = after ? H * .48 + bsz * .7 : H * .52 - H * (s.scale ?? .63) / 2 - 46;
        const lo = after ? E.outCubic(clamp((lt - bigAt - .15) / .25)) : k * (1 - clamp((lt - bigAt + .1) / .1));
        body += `<div class="abs" style="left:${W / 2}px;top:${f1(ly)}px;transform:translate(-50%,-50%);opacity:${f3(lo)}">${lineHTML(s.line_size || 40)}</div>`;
        body += `<div class="abs" style="left:${W / 2}px;top:${H * .48}px;transform:translate(-50%,-50%)">${bigHTML}</div>`;
      } else {
        const pw = s.w || 528, ph = s.h || 330, pa = s.photo_at ?? .2, pk = E.outCubic(clamp((lt - pa) / .55)), cy = s.y ?? H * .47;
        body += `<div class="abs" style="left:${W / 2}px;top:${f1(cy - ph / 2 - 70)}px;transform:translate(-50%,-50%)">${lineHTML(s.line_size || 46)}</div>`;
        if (lt >= pa) body += `<div class="abs" style="left:${f1(W / 2 - pw / 2)}px;top:${f1(cy - ph / 2)}px;width:${pw}px;height:${ph}px;border-radius:18px;overflow:hidden;box-shadow:0 22px 46px rgba(0,0,0,.28);
          transform:translate(${f1((1 - pk) * 300)}px,${f1((1 - pk) * 520)}px) rotate(${f2(lerp(s.tilt ?? 16, -1.5, pk))}deg)">${pic(s.src, t)}</div>`;
        body += `<div class="abs" style="left:${W / 2}px;top:${f1(cy + ph / 2 + bsz * .72)}px;transform:translate(-50%,-50%)">${bigHTML}</div>`;
      }
      const stick = (s.stickers || []).map((st, i) => {
        const at = st.at ?? bigAt + .15 + i * .12, sz = st.size || 100;
        if (lt < at) return '';
        const e = E.outBack(clamp((lt - at) / .3), 2.2);
        return `<div class="abs" style="left:${(st.x ?? 560) - sz / 2}px;top:${(st.y ?? 330) - sz / 2}px;width:${sz}px;height:${sz}px;transform:scale(${f3(e)}) rotate(${f1((st.rot ?? 8) + Math.sin(lt * 3 + i) * 4)}deg)">${emoji(st.emoji || '👀', 0, 0, sz)}</div>`;
      }).join('');
      return { back: `<div class="full"${cidOf(s)} style="background:#fff;overflow:hidden">${body}${stick}</div>`, cover: true, hideCaptions: true };
    },
    // 5. Stacked list. variant 'stack' = heavy white words stacked (one per spoken item); 'highlight' = blue selection blocks
    //    behind white heavy words, left-aligned, wiped in on their word, optional emoji. items: [text | {text, at, emoji}].
    mt_seoul_list(s, t, lt) {
      const [W, H] = DIMS(), hl = s.variant === 'highlight', items = (s.items || ['đi bộ', 'đạp xe', 'ngắm hoàng hôn']).map(x => (typeof x === 'string' ? { text: x } : x));
      const size = s.size || (hl ? 54 : 70), st = s.stagger ?? .55, blue = s.blue || C.blue;
      const rows = items.map((it, i) => {
        const at = it.at ?? .05 + i * st, tx = s.caps !== false && !hl ? String(it.text).toUpperCase() : String(it.text);
        if (hl) {
          const k = E.outCubic(clamp((lt - at) / .25));
          if (lt < at) return `<div style="height:${f1(size * 1.32)}px"></div>`;
          const em = it.emoji ? `<span style="display:inline-block;margin-left:.25em;transform:scale(${f3(E.outBack(clamp((lt - at - .2) / .3), 2))})">${emoji(it.emoji, 0, 0, size * 1.3, 'position:relative;display:inline-block;vertical-align:-.2em')}</span>` : '';
          return `<div style="display:flex;align-items:center;margin-bottom:${f1(size * .1)}px"><span style="display:inline-block;background:${blue};color:#fff;font:900 ${size}px/1.2 ${F.sans};letter-spacing:-.02em;padding:0 .18em;border-radius:.08em;white-space:nowrap;clip-path:inset(0 ${f1((1 - k) * 100)}% 0 0)">${esc(tx)}</span>${em}</div>`;
        }
        return `<div style="font:900 ${size}px/${s.line_gap ?? .98} ${F.sans};letter-spacing:-.035em;color:#fff;${halo};white-space:nowrap;${blurIn(lt, at)}">${esc(tx)}</div>`;
      }).join('');
      const x = s.x ?? (hl ? 56 : W / 2), y = s.y ?? H * (hl ? .45 : .47);
      return { front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(${hl ? '0' : '-50%'},-50%);text-align:${hl ? 'left' : 'center'}">${rows}</div>`, hideCaptions: s.hideCaptions ?? true };
    },
    // 6. Chat-bubble outro (cover, black): the last shot shrinks into a card and floats off in 3D (+ up to 3 tilted cards),
    //    a blue typing bubble (•••), then the bubble with the closing `word`, an emoji tapback on its corner. Runs to the end.
    mt_seoul_imessage(s, t, lt) {
      const [W, H] = DIMS(), blue = s.blue || C.blue, ta = s.typing_at ?? .7, wa = s.word_at ?? 1.3;
      const k = E.inOutSine(clamp(lt / .55)), fl = E.inOutSine(clamp((lt - .6) / 2.2));
      const sc = lerp(1, .5, k) * lerp(1, .82, fl);
      const card = `<div class="full" style="transform:perspective(1400px) translate(${f1(fl * 70)}px,${f1(lerp(0, -300, k) - fl * 70)}px) rotateY(${f1(fl * -16)}deg) rotateX(${f1(fl * 8)}deg) scale(${f3(sc)});border-radius:${f1(lerp(0, 40, k) / sc)}px;overflow:hidden;opacity:${f3(1 - fl * .55)};box-shadow:0 30px 70px rgba(0,0,0,.6)">${pic(s.src ?? 'aroll', t)}</div>`;
      const cards = (s.cards || []).slice(0, 3).map((c, i) => {
        const a = .25 + i * .15, e = E.outCubic(clamp((lt - a) / .6)), d = E.inOutSine(clamp((lt - .8 - i * .2) / 2.4));
        const pos = [[150, 260, -14], [575, 300, 11], [600, 1010, -8]][i];
        return lt < a ? '' : `<div class="abs" style="left:${pos[0] - 95}px;top:${pos[1] - 120}px;width:190px;height:240px;border:7px solid #fff;border-radius:10px;overflow:hidden;background:#222;opacity:${f3(e * (1 - d * .6))};
          transform:translate(${f1((1 - e) * (i % 2 ? 200 : -200) + d * (i % 2 ? 60 : -60))}px,${f1(-d * 90)}px) rotate(${f1(pos[2] * (1 + d * .5))}deg) scale(${f3(lerp(.7, 1, e) * (1 - d * .2))})">${pic(c, t)}</div>`;
      }).join('');
      const bx = s.x ?? 70, by = s.y ?? H * .62, fsz = s.size || 54;
      let bub = '';
      if (lt >= ta && lt < wa) {
        const e = E.outBack(clamp((lt - ta) / .25), 2);
        const dots = [0, 1, 2].map(i => `<i style="display:inline-block;width:14px;height:14px;margin:0 5px;border-radius:50%;background:#fff;opacity:${f2(.5 + .5 * Math.sin(lt * 9 - i * 1.1))};transform:translateY(${f1(Math.sin(lt * 9 - i * 1.1) * -3)}px)"></i>`).join('');
        bub = `<div class="abs" style="left:${bx}px;top:${by}px;transform-origin:0 50%;transform:translateY(-50%) scale(${f3(e)});background:${blue};border-radius:30px;padding:20px 22px">${dots}</div>`;
      } else if (lt >= wa) {
        const e = E.outBack(clamp((lt - wa) / .3), 1.8), tb = s.emoji ? E.outBack(clamp((lt - wa - .35) / .3), 2.6) : 0;
        bub = `<div class="abs"${cidOf(s)} style="left:${bx}px;top:${by}px;transform-origin:0 100%;transform:translateY(-50%) scale(${f3(e)})">
          <div style="position:relative;background:${blue};color:#fff;font:700 ${fsz}px/1.2 ${F.ui};padding:.3em .62em .34em;border-radius:1.1em;white-space:nowrap">${esc(s.word || 'Đáng đi!')}
            <svg width="26" height="22" viewBox="0 0 26 22" style="position:absolute;left:-7px;bottom:-1px"><path d="M26 0v22C14 22 4 19 0 22c6-4 8-9 8-22z" fill="${blue}"/></svg>
            ${s.emoji ? `<div style="position:absolute;right:-28px;top:-44px;width:76px;height:64px;border-radius:32px;background:#2C2C2E;border:4px solid #000;display:flex;align-items:center;justify-content:center;transform:scale(${f3(tb)})">${emoji(s.emoji, 0, 0, 42, 'position:relative')}</div>` : ''}</div></div>`;
      }
      return { back: `<div class="full" style="background:#000;overflow:hidden">${card}${cards}${bub}</div>`, cover: true, hideCaptions: true };
    },
  };

  // ======================================================================================= RESULT
  const SURF = {
    navy: `radial-gradient(circle at 50% 40%,${C.navy2},${C.navy} 72%)`,
    kraft: `radial-gradient(circle at 30% 20%,rgba(255,255,255,.16),transparent 60%),${C.kraft}`,
    cork: `radial-gradient(rgba(0,0,0,.13) 1.3px,transparent 1.7px) 0 0/14px 14px,#B4885A`,
    paper: `radial-gradient(circle at 25% 15%,rgba(255,255,255,.55),transparent 55%),#F4EEDF`,
  };
  const darkSurf = sf => sf === 'navy';
  const polaroidHTML = (s, t, lt, w, ph, src) => {
    const lab = s.label ?? 'mùa hè năm ấy', la = s.label_at ?? .45, lsz = s.label_size || Math.round(w * .085);
    const imgs = s.images && s.images.length ? s.images : null, ev = s.every ?? .45;
    const cur = imgs ? imgs[Math.floor(Math.max(0, lt) / ev) % imgs.length] : src;
    return `<div style="position:absolute;inset:0;background:#FBF8F0;padding:${f1(w * .05)}px ${f1(w * .05)}px 0;box-shadow:0 22px 50px rgba(0,0,0,.5)">
      <div style="position:relative;width:100%;height:${ph}px;overflow:hidden;background:#222">${pic(cur, t, 'filter:sepia(.12) saturate(1.05)')}</div>
      <div style="font:${lsz}px/1.6 ${F.hand};color:${C.rink};text-align:center;white-space:nowrap;padding-top:2px;${wipe(lt, la, writeDur(lab))}">${esc(lab)}</div>
      ${s.tape !== false ? `<i style="position:absolute;top:-16px;left:50%;width:${f1(w * .42)}px;height:32px;margin-left:${f1(-w * .21)}px;background:rgba(238,222,186,.86);transform:rotate(-4deg);box-shadow:0 2px 4px rgba(0,0,0,.18)"></i>` : ''}</div>`;
  };
  const RES = {
    // 1. Full-screen card (≤ 2.5 s): surface navy | kraft | cork | paper, two-tier type: `kicker` small line + ONE big bold word
    //    (`big`) or a handwritten key word (`script`); `note` handwritten aside; `circle_at` marker ring around the word;
    //    `stamp:{text,at}`. Slow push-in, grain + dust.
    mt_result_card(s, t, lt) {
      const [W, H] = DIMS(), sf = s.surface || 'navy', dk = darkSurf(sf), ink = dk ? '#FFFDF8' : C.rink;
      const dur = Math.max(.5, s.t1 - s.t0), push = 1 + .05 * E.inOutSine(clamp(lt / dur));
      const kick = s.kicker ?? 'điều mình học được', ka = s.kicker_at ?? .1;
      const bigTxt = s.script ? String(s.script) : String(s.big ?? 'KIÊN NHẪN');
      const ba = s.big_at ?? .45, script = !!s.script;
      const bsz = s.size || (script ? Math.round(clamp(520 / Math.max(1, nch(bigTxt) * .62), 46, 104)) : Math.round(clamp(600 / Math.max(1, nch(bigTxt) * .64), 44, 120)));
      const bigSt = script ? `font:${bsz}px/1.55 ${F.hand};color:${dk ? C.script : C.pen};${wipe(lt, ba, writeDur(bigTxt))}`
        : `font:900 ${bsz}px/1.1 ${F.sans};letter-spacing:-.035em;color:${ink};${blurIn(lt, ba, .2, 10, 0)}transform:scale(${f3(lt < ba ? .9 : lerp(.9, 1, E.outBack(clamp((lt - ba) / .3), 2)))})`;
      const note = s.note ? `<div style="margin-top:28px;font:${s.note_size || 34}px/1.6 ${F.hand};color:${dk ? C.script : C.pen};transform:rotate(-3deg);white-space:nowrap;${wipe(lt, s.note_at ?? ba + .5, writeDur(s.note))}">${esc(s.note)}</div>` : '';
      const inner = `<div style="font:700 ${s.kicker_size || 40}px/1.15 ${F.sans};letter-spacing:-.02em;color:${ink};opacity:.95;white-space:nowrap;${blurIn(lt, ka, .25, 8, 10)}">${esc(kick)}</div>
        <div style="position:relative;display:inline-block;margin-top:10px;white-space:nowrap"><div style="${bigSt}">${esc(bigTxt)}</div>${s.circle_at != null ? markerEllipse(lt, s.circle_at, 0, 0, dk ? C.script : C.rred) : ''}</div>${note}`;
      return {
        back: `<div class="full"${cidOf(s)} style="background:${SURF[sf] || SURF.navy};overflow:hidden">
          <div class="full" style="transform:scale(${f3(push)});transform-origin:50% 45%"><div class="abs" style="left:${s.x ?? W / 2}px;top:${s.y ?? H * .44}px;transform:translate(-50%,-50%);text-align:center">${inner}</div>
          ${stampHTML(s.stamp, lt, 0, `left:${W / 2 + 60}px;top:${H * .44 + 130}px;`)}</div>
          ${grain(t, .1)}${dust(t, 10)}${vignette(.38)}</div>`,
        cover: true, hideCaptions: s.hideCaptions ?? !s.captions,
      };
    },
    // 2. Polaroid: photo (src, or images[] swapping stop-motion every `every` s) + thick margin with a handwritten `label`
    //    written in at `label_at`, tape on top, paper entrance `enter` (toss|slap|drop|swing|rise|fade|none). x,y = centre
    //    (or `zone` top|right|left|chest = beside the face), w = width, ratio = photo h/w, rot.
    mt_polaroid(s, t, lt) {
      const w = s.w || 300, ph = Math.round(w * .9 * (s.ratio ?? 1)), h = Math.round(w * .05 + ph + w * .085 * 1.6 + 6);
      const inner = polaroidHTML(s, t, lt, w, ph, s.src);
      if (s.x == null && s.y == null && !s.zone) { s = { ...s, x: DIMS()[0] * .5, y: DIMS()[1] * .3 }; }
      return { front: propWrap(s, t, lt, w, h, 'top', inner, { rot: -4 }), hideCaptions: s.hideCaptions ?? false };
    },
    // 3. Paper stack (cover, ≤ 2.5 s): photos stacked on kraft / navy; the top picture swaps stop-motion (images, every)
    //    with a little jump each swap; handwritten `title` above, small typed `sub` below.
    mt_paper_stack(s, t, lt) {
      const [W, H] = DIMS(), sf = s.surface || 'kraft', imgs = s.images && s.images.length ? s.images : [''];
      const ev = s.every ?? .42, n = Math.floor(Math.max(0, lt - .25) / ev), cur = imgs[n % imgs.length];
      const pw = s.w || 470, ph = Math.round(pw * 1.05), cx = W / 2, cy = s.y ?? H * .5;
      const back = [[-9, -16, 10], [7, 14, -6]].map(([r, dx, dy], i) => `<div class="abs" style="left:${cx - pw / 2 + dx}px;top:${cy - ph / 2 + dy}px;width:${pw}px;height:${ph + 70}px;background:#F6F1E3;transform:rotate(${r}deg);box-shadow:0 14px 30px rgba(0,0,0,.35)">
        <div style="margin:22px;height:${ph - 20}px;overflow:hidden;background:#333">${pic(imgs[(i + 1) % imgs.length], t, 'filter:sepia(.25) brightness(.85)')}</div></div>`).join('');
      const jr = (rnd(n * 7.7 + 1) - .5) * 5, jx = (rnd(n * 3.1) - .5) * 14, jy = (rnd(n * 5.3) - .5) * 10;
      const k = E.outBack(clamp(lt / .35), 1.6);
      const top = `<div class="abs" style="left:${cx - pw / 2}px;top:${cy - ph / 2}px;width:${pw}px;height:${ph + 70}px;background:#FBF8F0;box-shadow:0 22px 46px rgba(0,0,0,.45);transform:translate(${f1(jx)}px,${f1(jy + (1 - k) * 600)}px) rotate(${f2(jr - 1)}deg)">
        <div style="margin:22px;height:${ph - 20}px;overflow:hidden;background:#333">${pic(cur, t)}</div>
        ${s.sub ? `<div style="position:absolute;left:0;right:0;bottom:12px;text-align:center;font:600 22px/1 ${F.mono};color:${C.rink};letter-spacing:.06em">${esc(s.sub)}</div>` : ''}</div>`;
      const ttl = s.title ?? 'những chuyến đi';
      const title = `<div class="abs" style="left:${W / 2}px;top:${cy - ph / 2 - 92}px;transform:translate(-50%,-50%) rotate(-3deg);font:${s.title_size || 54}px/1.6 ${F.hand};color:${darkSurf(sf) ? C.script : C.rink};white-space:nowrap;${wipe(lt, s.title_at ?? .2, writeDur(ttl))}">${esc(ttl)}</div>`;
      return { back: `<div class="full"${cidOf(s)} style="background:${SURF[sf] || SURF.kraft};overflow:hidden">${back}${top}${title}${grain(t, .1)}${dust(t, 8)}${vignette(.35)}</div>`, cover: true, hideCaptions: s.hideCaptions ?? true };
    },
    // 4. Film layer over the whole video: grain + per-frame seeded dust (+ vignette, + film-burn light leaks at `leaks:[{t}]`
    //    absolute times = section turns). Face RESULT: vignette:false, no leaks (never a colour sweep over the face).
    mt_film(s, t, lt) {
      let lk = '';
      for (const L of s.leaks || []) {
        const lt0 = typeof L === 'number' ? L : L.t, d = (L && L.dur) || 1.0, k = (t - lt0) / d;
        if (k < 0 || k > 1) continue;
        const x = lerp(-35, 135, E.inOutSine(k)), o = Math.sin(Math.PI * k);
        lk += `<div class="full" style="mix-blend-mode:screen;opacity:${f3(o)};background:radial-gradient(ellipse 70% 50% at ${f1(x)}% 38%,rgba(255,150,50,.9),rgba(255,70,25,.45) 42%,transparent 72%)"></div>`;
      }
      return { front: `<div class="full"${cidOf(s)} style="pointer-events:none">${grain(t, s.grain ?? .07)}${s.dust === false ? '' : dust(t, s.dust_n || 8)}${s.vignette === false ? '' : vignette(.4)}${lk}</div>` };
    },
  };

  // ================================================================================== FACE RESULT
  const NOTE_SIZE = { note: [300, 340], sticky: [250, 250], ticket: [380, 180], receipt: [250, 380] };
  const FACE_MODS = {
    // 1. Paper prop beside the face: kind note | sticky | ticket | receipt; lines:[text | {text, at, size, color, strike (s, relative)}]
    //    handwritten (ticket / receipt: typed) in on their time; `stamp:{text, at}`; `circle:{line, at}` marker ring.
    //    zone top|right|left|chest (measured from TL.face; falls back to the zone where it fits best) or x,y.
    mt_prop_note(s, t, lt) {
      const kind = s.kind || 'note', [w, h] = s.w && s.h ? [s.w, s.h] : NOTE_SIZE[kind] || NOTE_SIZE.note;
      const lines = (s.lines || ['việc cần làm', 'dậy sớm', 'đọc 10 trang']).map(x => (typeof x === 'string' ? { text: x } : x));
      const typed = kind === 'ticket' || kind === 'receipt';
      const fam = typed ? `font-family:${F.mono};font-weight:600` : `font-family:${F.hand}`;
      const base = s.size || (typed ? 26 : 28);
      const rows = lines.map((L, i) => {
        const at = L.at ?? .45 + i * .55, sz = L.size || (i === 0 && !typed ? base * 1.15 : base);
        const st = L.strike != null && lt >= L.strike ? `<i style="position:absolute;left:-4%;top:52%;height:3px;background:${C.rred};width:${f1(108 * E.outCubic(clamp((lt - L.strike) / .3)))}%"></i>` : '';
        const circ = s.circle && (s.circle.line ?? 0) === i ? markerEllipse(lt, s.circle.at ?? 1.5, 0, 0) : '';
        return `<div style="position:relative;display:inline-block;${fam};font-size:${sz}px;line-height:${typed ? 1.45 : 1.55};color:${L.color || (typed ? C.rink : C.pen)};white-space:nowrap;${typed ? blurIn(lt, at, .12, 3) : wipe(lt, at, writeDur(L.text))}">${esc(L.text)}${st}${circ}</div>`;
      }).join('<br>');
      let paper;
      if (kind === 'sticky') paper = `background:linear-gradient(170deg,#FFE97A,#F9D94A);box-shadow:0 18px 30px rgba(0,0,0,.35);padding:30px 22px`;
      else if (kind === 'ticket') paper = `background:radial-gradient(circle at 0 50%,transparent 16px,#F3E6C8 17px) left/51% 100% no-repeat,radial-gradient(circle at 100% 50%,transparent 16px,#F3E6C8 17px) right/51% 100% no-repeat;filter:drop-shadow(0 16px 24px rgba(0,0,0,.4));padding:20px 40px`;
      else if (kind === 'receipt') paper = `background:#FAFAF6;box-shadow:0 18px 30px rgba(0,0,0,.35);padding:30px 22px;clip-path:polygon(0 0,100% 0,100% 97%,95% 100%,90% 97%,85% 100%,80% 97%,75% 100%,70% 97%,65% 100%,60% 97%,55% 100%,50% 97%,45% 100%,40% 97%,35% 100%,30% 97%,25% 100%,20% 97%,15% 100%,10% 97%,5% 100%,0 97%)`;
      else paper = `background:${C.paper} repeating-linear-gradient(${C.paper} 0 42px,#B9CDE8 42px 44px);background-position:0 18px;box-shadow:0 20px 40px rgba(0,0,0,.4);border-radius:4px;padding:26px 24px 20px 46px`;
      const head = kind === 'ticket' ? `<div style="font:800 15px/1 ${F.mono};letter-spacing:.24em;color:${C.rred};margin-bottom:8px">${esc(s.header || 'VÉ · NGÀY 1')}</div>`
        : kind === 'receipt' ? `<div style="text-align:center;font:800 16px/1 ${F.mono};letter-spacing:.2em;color:${C.rink};border-bottom:2px dashed #999;padding-bottom:10px;margin-bottom:10px">${esc(s.header || 'HOÁ ĐƠN')}</div>` : '';
      const margin = kind === 'note' ? `<i style="position:absolute;left:32px;top:0;bottom:0;width:2px;background:rgba(200,55,45,.45)"></i>` : '';
      const tape = kind === 'note' || kind === 'sticky' ? `<i style="position:absolute;top:-16px;left:50%;width:120px;height:32px;margin-left:-60px;background:rgba(238,222,186,.86);transform:rotate(-4deg)"></i>` : '';
      // receipt prints out of a slot: reveal top-down
      const pr = kind === 'receipt' ? clamp((lt - .1) / (s.print_dur ?? 1.1)) : 1;
      const inner = `<div style="position:absolute;inset:0;${kind === 'receipt' ? `clip-path:inset(0 0 ${f1((1 - pr) * 100)}% 0);` : ''}"><div style="position:absolute;inset:0;${paper};color:${C.rink};overflow:hidden">${margin}${head}${rows}</div>${tape}</div>
        ${stampHTML(s.stamp, lt, 0, 'right:14px;bottom:26px;')}`;
      const chest = (s.zone || '') === 'chest';
      return { front: propWrap(s, t, lt, w, h, 'top', inner, { rot: s.rot ?? (kind === 'ticket' ? 3 : -3), enter: kind === 'receipt' ? 'none' : 'slap' }), hideCaptions: s.hideCaptions ?? chest };
    },
    // 2. Quote card: cream paper, big red quote mark, the quote in serif italic word by word (`stagger`), `author`
    //    handwritten under it. zone default top.
    mt_quote_card(s, t, lt) {
      const q = String(s.text || 'Làm chậm mà chắc, còn hơn nhanh mà bỏ dở.'), w = s.w || 560, sz = s.size || 32;
      const perLine = Math.max(8, Math.floor((w - 70) / (sz * .5))), nl = Math.ceil(nch(q) / perLine);
      const h = s.h || Math.round(70 + nl * sz * 1.3 + (s.author ? 56 : 10));
      const ws = words(q), st = s.stagger ?? .13, a0 = s.at ?? .35;
      const body = ws.map((w2, i) => `<span style="display:inline-block;${blurIn(lt, a0 + i * st, .2, 6)}">${esc(w2)}</span>`).join(' ');
      const au = s.author ? `<div style="margin-top:6px;text-align:right;font:${Math.round(sz * .8)}px/1.6 ${F.hand};color:${C.pen};${wipe(lt, s.author_at ?? a0 + ws.length * st + .2, writeDur(s.author))}">${esc(s.author)}</div>` : '';
      const inner = `<div style="position:absolute;inset:0;background:${C.paper};box-shadow:0 20px 44px rgba(0,0,0,.42);border-radius:6px;padding:34px 30px 18px 40px">
        <div style="position:absolute;left:14px;top:-26px;font:900 110px/1 ${F.serif};color:${C.rred}">“</div>
        <div style="font:italic 600 ${sz}px/1.3 ${F.serif};color:${C.rink}">${body}</div>${au}</div>`;
      return { front: propWrap(s, t, lt, w, h, 'top', inner, { rot: -1.5, enter: 'drop' }) };
    },
    // 3. Graph-paper card: handwritten `title`, bars [{label, value 0–100, color, at}] grow from the base on their time.
    mt_prop_bars(s, t, lt) {
      const w = s.w || 420, h = s.h || 300, bars = s.bars || [{ label: 'qua cửa', value: 82, color: C.rred }, { label: 'một phòng', value: 34, color: C.pen }];
      const bw = Math.min(90, (w - 80) / bars.length - 26), base = h - 58, top = 86, ttl = s.title ?? 'ai quên nhiều hơn?';
      const cols = bars.map((b, i) => {
        const at = b.at ?? .6 + i * .5, k = E.outCubic(clamp((lt - at) / .55)), bh = (base - top) * clamp(b.value / 100) * k;
        const x = 50 + i * ((w - 80) / bars.length) + ((w - 80) / bars.length - bw) / 2;
        return `<div style="position:absolute;left:${f1(x)}px;top:${f1(base - bh)}px;width:${f1(bw)}px;height:${f1(bh)}px;background:${b.color || [C.rred, C.pen, C.gold][i % 3]};border:2px solid ${C.rink};border-bottom:0;opacity:.92"></div>
          <div style="position:absolute;left:${f1(x - 30)}px;width:${f1(bw + 60)}px;top:${base + 8}px;text-align:center;font:700 18px/1.15 ${F.sans};color:${C.rink}">${esc(b.label)}</div>
          ${k > .1 ? `<div style="position:absolute;left:${f1(x - 20)}px;width:${f1(bw + 40)}px;top:${f1(base - bh - 34)}px;text-align:center;font:800 24px/1.3 ${F.mono};color:${C.rink}">${Math.round(b.value * k)}${b.unit ?? '%'}</div>` : ''}`;
      }).join('');
      const inner = `<div style="position:absolute;inset:0;background:${C.paper};background-image:linear-gradient(rgba(31,59,140,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(31,59,140,.16) 1px,transparent 1px);background-size:20px 20px;box-shadow:0 20px 44px rgba(0,0,0,.42);border-radius:4px;overflow:hidden">
        <div style="position:absolute;left:0;right:0;top:12px;text-align:center;font:34px/1.6 ${F.hand};color:${C.rink};white-space:nowrap;${wipe(lt, s.title_at ?? .2, writeDur(ttl))}">${esc(ttl)}</div>
        <i style="position:absolute;left:36px;right:28px;top:${base}px;height:3px;background:${C.rink}"></i>${cols}</div>`;
      return { front: propWrap(s, t, lt, w, h, 'top', inner, { rot: 2, enter: 'swing' }) };
    },
    // 4. Label tape (chest band): an embossed tape prints `text` letter by letter (`cps`), little cut end; drops the caption.
    mt_label_tape(s, t, lt) {
      const txt = String(s.text || 'HIỆU ỨNG CỬA').toUpperCase(), ch = Array.from(txt), sz = s.size || 40, cps = s.cps ?? 14;
      const n = Math.floor(clamp((lt - .25) * cps, 0, ch.length)), w = Math.round(ch.length * sz * .68 + 70), h = Math.round(sz * 1.9);
      const col = s.tape || '#B3261E';
      const letters = ch.map((c, i) => `<span style="opacity:${i < n ? 1 : 0}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
      const inner = `<div style="position:absolute;inset:0;background:linear-gradient(180deg,${col},color-mix(in srgb,${col} 78%,#000));border-radius:4px;box-shadow:0 12px 24px rgba(0,0,0,.4);clip-path:polygon(0 0,100% 0,97% 50%,100% 100%,0 100%);
        display:flex;align-items:center;padding-left:28px;font:800 ${sz}px/1 ${F.mono};letter-spacing:.1em;color:#FDFDFD;text-shadow:0 1px 0 rgba(255,255,255,.4),0 -1px 0 rgba(0,0,0,.45);white-space:nowrap">${letters}</div>`;
      return { front: propWrap({ zone: 'chest', ...s }, t, lt, w, h, 'chest', inner, { rot: -3, enter: 'rise' }), hideCaptions: s.hideCaptions ?? (s.zone || 'chest') === 'chest' };
    },
  };

  // ========================================================================================= POV
  const ICON = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 000-6H9a3 3 0 010-6h6.5"/>',
    cam: '<rect x="3" y="7" width="13" height="11" rx="2"/><path d="M16 11l5-3v9l-5-3"/>', heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z"/>',
  };
  const icon = (name, sz, col) => (ICON[name] ? `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" style="flex:0 0 auto;fill:none;stroke:${col};stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round">${ICON[name]}</svg>` : `<span style="font-size:${sz * .9}px;line-height:1">${esc(name || '')}</span>`);
  const tc = sec => { const s2 = Math.max(0, Math.floor(sec)); return `${pad(Math.floor(s2 / 3600), 2)}:${pad(Math.floor(s2 / 60) % 60, 2)}:${pad(s2 % 60, 2)}`; };
  const rgbSplit = (t, k, amp = 10) => { if (k >= 1) return ''; const fr = frameNo(t), a = (1 - k) * amp, j = (rnd(fr * 1.7) - .5) * a; return `text-shadow:${f1(-a + j)}px 0 rgba(255,0,80,.85),${f1(a - j)}px 0 rgba(0,230,255,.85);`; };
  const POV = {
    // 1. Action-cam HUD over the footage: corner brackets, blinking REC + timecode (from tc_start s), battery + `res`,
    //    place chip (pin) bottom-left, clock chip bottom-right (`clock` "13:24", advances when tick:true), light fisheye vignette.
    mt_pov_hud(s, t, lt) {
      const [W, H] = DIMS(), acc = lime(s), m = 30, L = 46, o = clamp(lt / .3);
      const br = [[m, m, '0 0'], [W - m, m, '1 0'], [m, H - m, '0 1'], [W - m, H - m, '1 1']].map(([x, y, q]) => {
        const [qx, qy] = q.split(' ').map(Number);
        return `<i style="position:absolute;left:${x - qx * L}px;top:${y - qy * L}px;width:${L}px;height:${L}px;border:0 solid rgba(255,255,255,.9);${qy ? 'border-bottom-width' : 'border-top-width'}:4px;${qx ? 'border-right-width' : 'border-left-width'}:4px"></i>`;
      }).join('');
      const rec = Math.floor(lt * 1.6) % 2 === 0;
      const top = `<div style="position:absolute;left:${m + 22}px;top:${m + 20}px;display:flex;align-items:center;gap:10px;font:700 24px/1 ${F.mono};color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.6)">
        <i style="width:16px;height:16px;border-radius:50%;background:#FF2D2D;opacity:${rec ? 1 : .25}"></i>REC <span style="opacity:.9">${tc((s.tc_start ?? 0) + lt)}</span></div>
        <div style="position:absolute;right:${m + 22}px;top:${m + 20}px;display:flex;align-items:center;gap:10px;font:700 22px/1 ${F.mono};color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.6)">${esc(s.res || '4K·60')}
          <span style="position:relative;width:40px;height:20px;border:2.5px solid #fff;border-radius:4px"><i style="position:absolute;left:2px;top:2px;bottom:2px;width:${f1(30 * (s.battery ?? .72))}px;background:${acc}"></i><i style="position:absolute;right:-6px;top:5px;width:3px;height:7px;background:#fff"></i></span></div>`;
      const chip = (txt, ic, side) => `<div style="position:absolute;${side}:${m + 18}px;bottom:${s.chip_bottom ?? 150}px;display:flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;background:${acc};color:${C.pink};font:800 24px/1 ${F.sans};white-space:nowrap">${icon(ic, 24, C.pink)}${esc(txt)}</div>`;
      const ck = s.clock ? (s.tick ? (() => { const [hh, mm] = String(s.clock).split(':').map(Number); const mins = hh * 60 + mm + Math.floor(lt / 60); return `${pad(Math.floor(mins / 60) % 24, 2)}:${pad(mins % 60, 2)}`; })() : s.clock) : '';
      const fish = s.fisheye === false ? '' : `<div class="full" style="background:radial-gradient(ellipse 75% 62% at 50% 50%,transparent 60%,rgba(0,0,0,.38) 100%)"></div>`;
      return { front: `<div class="full"${cidOf(s)} style="pointer-events:none;opacity:${f3(o)}">${fish}${br}${top}${s.place ? chip(s.place, 'pin', 'left') : ''}${ck ? chip(ck, 'clock', 'right') : ''}</div>` };
    },
    // 2. Kinetic hook / end card (cover): dark page, lines [{text, at}] slam in one by one (white, `*word*` = accent),
    //    a round window of the footage (pip:false to hide), small `kicker` tag.
    mt_pov_kinetic(s, t, lt) {
      const [W, H] = DIMS(), acc = lime(s), lines = (s.lines || ['39 phút nữa', 'mà mình *vẫn trễ*']).map(x => (typeof x === 'string' ? { text: x } : x));
      const sz = s.size || 64, pipOn = s.pip !== false;
      const rows = lines.map((L, i) => {
        const at = L.at ?? .15 + i * .45, k = E.outBack(clamp((lt - at) / .3), 1.8);
        if (lt < at) return `<div style="height:${f1(sz * 1.2)}px"></div>`;
        return `<div style="font:900 ${L.size || sz}px/1.2 ${F.sans};letter-spacing:-.035em;color:#fff;white-space:nowrap;transform:translateY(${f1((1 - k) * 40)}px) scale(${f3(lerp(.85, 1, k))});opacity:${f3(clamp((lt - at) / .1))};${rgbSplit(t, clamp((lt - at) / .25), 8)}">${marks(L.text, `color:${acc}`)}</div>`;
      }).join('');
      const pr = s.pip_r || 150, py = s.pip_y ?? H * .27, pk = E.outBack(clamp(lt / .4), 1.6);
      const pip = pipOn ? `<div class="abs" style="left:${W / 2 - pr}px;top:${py - pr}px;width:${pr * 2}px;height:${pr * 2}px;border-radius:50%;overflow:hidden;border:6px solid ${acc};box-shadow:0 0 40px ${acc}55;transform:scale(${f3(pk)})">${pic(s.src ?? 'aroll', t)}</div>` : '';
      const kick = s.kicker ? `<div style="display:inline-block;margin-bottom:18px;padding:8px 16px;border-radius:8px;background:${acc};color:${C.pink};font:800 24px/1 ${F.mono};letter-spacing:.12em;text-transform:uppercase;${blurIn(lt, .05, .2, 6)}">${esc(s.kicker)}</div>` : '';
      const grid = `<div class="full" style="background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:60px 60px"></div>`;
      return { back: `<div class="full"${cidOf(s)} style="background:radial-gradient(circle at 50% 30%,#1D2117,#0B0C09 70%);overflow:hidden">${grid}${pip}
        <div class="abs" style="left:${s.x ?? 56}px;top:${s.y ?? (pipOn ? H * .58 : H * .45)}px;transform:translateY(-50%);text-align:left">${kick}${rows}</div></div>`, cover: true, hideCaptions: s.hideCaptions ?? true };
    },
    // 3. Rewind card (cover): the footage blurred and dark behind, ⏪ + `kicker` ("15 PHÚT TRƯỚC"), a big `time`, the `place`,
    //    each flying in from 3D depth with an RGB glitch.
    mt_pov_rewind(s, t, lt) {
      const [W, H] = DIMS(), acc = lime(s);
      const row = (html, at, extra = '') => {
        const k = E.outCubic(clamp((lt - at) / .45));
        return lt < at ? '' : `<div style="transform:perspective(900px) translateZ(${f1((1 - k) * -700)}px) rotateX(${f1((1 - k) * 50)}deg);opacity:${f3(clamp((lt - at) / .15))};${extra}">${html}</div>`;
      };
      const rw = `<svg viewBox="0 0 24 24" width="44" height="44" style="fill:${C.pink}"><path d="M11 6v12L2 12zM22 6v12l-9-6z"/></svg>`;
      const kick = `<div style="display:inline-flex;align-items:center;gap:10px;padding:10px 20px;border-radius:10px;background:${acc};color:${C.pink};font:900 34px/1 ${F.sans};letter-spacing:.02em">${rw}${esc(s.kicker || '15 PHÚT TRƯỚC')}</div>`;
      const time = `<div style="font:800 ${s.size || 150}px/1 ${F.mono};color:#fff;letter-spacing:-.04em;${rgbSplit(t, clamp((lt - .3) / .4), 14)}">${esc(s.time || '13:24')}</div>`;
      const place = s.place ? `<div style="display:inline-flex;align-items:center;gap:10px;font:800 40px/1.2 ${F.sans};color:#fff;white-space:nowrap">${icon('pin', 36, acc)}${esc(s.place)}</div>` : '';
      const scan = `<div class="full" style="background:repeating-linear-gradient(transparent 0 3px,rgba(0,0,0,.25) 3px 5px);opacity:.5"></div>`;
      return { back: `<div class="full"${cidOf(s)} style="overflow:hidden;background:#000">${pic(s.src ?? 'aroll', t, 'filter:blur(14px) brightness(.4) saturate(.6);transform:scale(1.12)')}${scan}
        <div class="abs" style="left:${W / 2}px;top:${s.y ?? H * .44}px;transform:translate(-50%,-50%);text-align:center;display:flex;flex-direction:column;align-items:center;gap:22px">
        ${row(kick, .05)}${row(time, .3)}${row(place, .6)}</div></div>`, cover: true, hideCaptions: s.hideCaptions ?? true };
    },
    // 4. The moment: freeze frame of the footage at `freeze_t` (absolute; default scene start) with a 1→1.3 push on `focus`
    //    {x,y} %, white flash, pause icon, an emoji over a spot (ex,ey px: hides a stranger's face / reacts) and a `label`.
    mt_pov_freeze(s, t, lt) {
      const [W, H] = DIMS(), acc = lime(s), ft = s.freeze_t ?? s.t0, dur = Math.max(.5, s.t1 - s.t0);
      const z = lerp(1, s.zoom ?? 1.3, E.inOutSine(clamp(lt / Math.min(dur, 1.4)))), fo = s.focus || { x: 50, y: 42 };
      const fl = 1 - E.outCubic(clamp(lt / .22));
      const em = s.emoji ? (() => { const sz = s.emoji_size || 150, e = E.outBack(clamp((lt - .25) / .3), 2.4); return `<div class="abs" style="left:${(s.ex ?? 520) - sz / 2}px;top:${(s.ey ?? 380) - sz / 2}px;width:${sz}px;height:${sz}px;transform:scale(${f3(e)}) rotate(${f1(Math.sin(lt * 4) * 6)}deg)">${emoji(s.emoji, 0, 0, sz)}</div>`; })() : '';
      const lab = s.label ? `<div class="abs" style="left:40px;top:${s.label_y ?? 210}px;${blurIn(lt, .35, .25, 8, 18)}"><div style="display:inline-block;padding:10px 18px;border-radius:10px;background:${acc};color:${C.pink};font:900 ${s.size || 40}px/1.1 ${F.sans};letter-spacing:-.02em;white-space:nowrap;box-shadow:6px 6px 0 #000">${esc(s.label)}</div></div>` : '';
      const pause = `<div class="abs" style="left:44px;top:120px;display:flex;gap:8px;opacity:${f3(.5 + .5 * Math.sin(lt * 5))}"><i style="width:14px;height:44px;background:#fff;border-radius:3px"></i><i style="width:14px;height:44px;background:#fff;border-radius:3px"></i></div>`;
      return { back: `<div class="full"${cidOf(s)} style="overflow:hidden;background:#000"><div class="full" style="transform:scale(${f3(z)});transform-origin:${fo.x}% ${fo.y}%;filter:contrast(1.12) saturate(.75)">${arollImg(ft)}</div>
        ${vignette(.5)}${pause}${em}${lab}<div class="full" style="background:#fff;opacity:${f3(fl * .9)}"></div></div>`, cover: true, hideCaptions: s.hideCaptions ?? true };
    },
    // 5. Stat badges: items [{icon clock|pin|bolt|flag|route|cam|heart|emoji, text, at}] slide in from the left, stacked.
    mt_pov_stats(s, t, lt) {
      const acc = lime(s), items = s.items || [{ icon: 'clock', text: '13:24' }, { icon: 'route', text: '12,4 km' }, { icon: 'bolt', text: '2 lần suýt ngã' }];
      const sz = s.size || 30;
      const rows = items.map((it, i) => {
        const at = it.at ?? .1 + i * .35, k = E.outBack(clamp((lt - at) / .35), 1.6);
        if (lt < at) return '';
        return `<div style="display:flex;width:max-content;align-items:center;gap:12px;margin-bottom:14px;padding:10px 20px 10px 14px;border-radius:12px;background:${i % 2 ? '#111' : acc};color:${i % 2 ? '#fff' : C.pink};font:800 ${sz}px/1 ${F.sans};white-space:nowrap;border:3px solid ${i % 2 ? acc : '#111'};
          transform:translateX(${f1((1 - k) * -420)}px)">${icon(it.icon || 'flag', sz * 1.05, i % 2 ? acc : C.pink)}${esc(it.text)}</div>`;
      }).join('');
      return { front: `<div class="abs"${cidOf(s)} style="left:${s.x ?? 40}px;top:${s.y ?? 200}px">${rows}</div>` };
    },
    // 6. POV clip montage (cover): images[] (or 'aroll') cut every `every` s with handheld shake, a whip-blur into each shot,
    //    a speed chip ("x2") and a chapter `label`.
    mt_pov_clips(s, t, lt) {
      const [W, H] = DIMS(), acc = lime(s), imgs = s.images && s.images.length ? s.images : ['aroll'], ev = s.every ?? 1.0;
      const i = Math.floor(Math.min(lt, Math.max(0, s.t1 - s.t0 - .36)) / ev), ll = lt - i * ev, src = imgs[i % imgs.length], fr = frameNo(t);
      const sh = s.shake ?? 1, jx = (Math.sin(t * 11.3) * 6 + (rnd(fr * .37) - .5) * 4) * sh, jy = (Math.cos(t * 9.1) * 5 + (rnd(fr * .53) - .5) * 4) * sh, jr = Math.sin(t * 6.7) * .8 * sh;
      const wk = i > 0 ? clamp(ll / .14) : 1, wx = (1 - E.outCubic(wk)) * 140, wb = (1 - wk) * 18;
      const z = 1.1 + .04 * (ll / ev) + (1 - wk) * .3;
      const chip = s.speed ? `<div class="abs" style="right:40px;top:110px;padding:8px 16px;border-radius:8px;background:${acc};color:${C.pink};font:900 34px/1 ${F.mono}">${esc(s.speed)}</div>` : '';
      const lab = s.label ? `<div class="abs" style="left:40px;top:110px;padding:8px 14px;border-left:6px solid ${acc};background:rgba(0,0,0,.55);color:#fff;font:800 26px/1.1 ${F.sans};letter-spacing:.04em;text-transform:uppercase;white-space:nowrap">${esc(s.label)}</div>` : '';
      return { back: `<div class="full"${cidOf(s)} style="overflow:hidden;background:#000"><div class="full" style="transform:translate(${f1(jx + wx)}px,${f1(jy)}px) rotate(${f2(jr)}deg) scale(${f3(z)});${wb > .5 ? `filter:blur(${f1(wb)}px);` : ''}">${pic(src, t)}</div>
        <div class="full" style="background:radial-gradient(ellipse 80% 65% at 50% 50%,transparent 60%,rgba(0,0,0,.35) 100%)"></div>${lab}${chip}</div>`, cover: true };
    },
  };

  // ======================================================================================= VECTOR
  const TREE = new Map();
  function treeOf(seed) {
    if (TREE.has(seed)) return TREE.get(seed);
    let n = 0; const R = () => rnd(seed * 97.13 + (n++) * 1.618);
    const up = [], dn = [], tips = [], rtips = [];
    const grow = (x, y, a, len, d, max, out, tipOut, isUp) => {
      const bend = (R() - .5) * .6, x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      const cx = (x + x2) / 2 + Math.cos(a + Math.PI / 2) * len * bend * .35, cy = (y + y2) / 2 + Math.sin(a + Math.PI / 2) * len * bend * .35;
      out.push({ d: `M${f1(x)} ${f1(y)}Q${f1(cx)} ${f1(cy)} ${f1(x2)} ${f1(y2)}`, dep: d, w: Math.max(1.3, (isUp ? 17 : 12) * Math.pow(.64, d)) });
      if (d >= 3 && isUp) tipOut.push({ x: x2, y: y2, dep: d, r: R() });
      if (d >= max) { if (!isUp) tipOut.push({ x: x2, y: y2, dep: d }); return; }
      const kids = R() < (isUp ? .28 : .42) ? 3 : 2, spread = isUp ? .38 + R() * .14 : .5 + R() * .2;
      for (let i = 0; i < kids; i++) {
        let na = a + (i / (kids - 1) - .5) * 2 * spread + (R() - .5) * .28;
        na = isUp ? clamp(na, -Math.PI + .3, -.3) : clamp(na, .25, Math.PI - .25);
        grow(x2, y2, na, len * (.7 + R() * .12), d + 1, max, out, tipOut, isUp);
      }
    };
    grow(360, 1280, -Math.PI / 2, 150, 0, 6, up, tips, true);
    grow(360, 1280, Math.PI / 2, 108, 0, 6, dn, rtips, false);
    const peb = Array.from({ length: 34 }, (_, i) => ({ x: rnd(seed + i * 3.7) * 1100 - 190, y: 1310 + rnd(seed + i * 5.1) * 900, rx: 6 + rnd(seed + i * 2.3) * 16, ry: 4 + rnd(seed + i * 6.1) * 8 }));
    const v = { up, dn, tips, rtips, peb, max: 6 };
    TREE.set(seed, v);
    return v;
  }
  const camAt = (keys, t) => {
    const ks = (keys && keys.length ? keys : [{ t: 0, x: 360, y: 1280, s: 1 }]).slice().sort((a, b) => a.t - b.t);
    let i = ks.findIndex(k => k.t > t);
    if (i === 0) return ks[0]; if (i < 0) return ks[ks.length - 1];
    const a = ks[i - 1], b = ks[i], k = E.inOutSine(clamp((t - a.t) / Math.max(.01, b.t - a.t)));
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s: lerp(a.s ?? 1, b.s ?? 1, k) };
  };
  const SEASON = [['#FFFFFF', 0], ['#F4A6B8', .7], ['#6E8B3D', 1], ['#D9822B', .8]]; // winter, spring, summer, autumn (leaf colour, size)
  const VEC = {
    // 1. The world (cover): sky over soil, horizon mid-frame; a seed splits and a procedural tree draws itself UP while its roots
    //    draw DOWN (stroke-dashoffset by depth) between grow_t and grow_end_t; leaves grow (r) on their tips, sun at sun_t,
    //    light burst at burst_t, fruit at fruit_t, warm grade from warm_t, seasons cycling seasons_t → seasons_end_t.
    //    cam:[{t,x,y,s}] = world point centred at scale s (horizon = y 1280; dive y≈1650, rise y≈950). seed = shape.
    mt_vec_world(s, t, lt) {
      const [W, H] = DIMS(), T = treeOf(s.seed ?? 7), g0 = s.grow_t ?? s.t0 + .6, g1 = s.grow_end_t ?? s.t0 + 6;
      const g = clamp((t - g0) / Math.max(.1, g1 - g0)), D = T.max + 1;
      const cm = camAt(s.cam, t), tr = `translate(${f1(W / 2 - cm.x * cm.s)} ${f1(H / 2 - cm.y * cm.s)}) scale(${f3(cm.s)})`;
      const segs = (arr, col) => arr.map(p => { const k = clamp(g * D - p.dep); return k <= 0 ? '' : `<path d="${p.d}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${f3(1 - k)}" stroke="${col}" stroke-width="${f1(p.w)}" fill="none" stroke-linecap="round"/>`; }).join('');
      // seasons
      let leafCol = s.leaf || C.leaf, leafSz = 1, snow = 0, fallK = 0;
      if (s.seasons_t != null && t >= s.seasons_t) {
        const se = s.seasons_end_t ?? s.seasons_t + 4, q = clamp((t - s.seasons_t) / Math.max(.4, se - s.seasons_t));
        if (q < 1) { const i = Math.min(3, Math.floor(q * 4)); [leafCol, leafSz] = SEASON[i]; snow = i === 0 ? 1 : 0; fallK = i === 3 ? (q * 4 - 3) : 0; }
      }
      const lk = s.leaves_t != null ? clamp((t - s.leaves_t) / .8) : 1;
      const leaves = T.tips.map((p, i) => {
        const k = clamp(g * D - (p.dep + .6)) * lk; if (k <= 0 || leafSz <= 0) return '';
        const r = (7 + p.r * 7) * E.outBack(clamp(k), 2) * leafSz, dy = fallK * (40 + p.r * 260) * (p.r > .5 ? 1 : .2);
        return `<circle cx="${f1(p.x)}" cy="${f1(p.y + dy)}" r="${f1(Math.max(0, r))}" fill="${leafCol}" opacity="${f2(.82 + p.r * .18)}"/>`;
      }).join('');
      const fk = s.fruit_t != null ? clamp((t - s.fruit_t) / .5) : 0;
      const fruit = fk > 0 && leafSz >= 1 ? T.tips.filter(p => p.r > .8 && p.dep >= 4).map(p => `<circle cx="${f1(p.x)}" cy="${f1(p.y + 8)}" r="${f1(9 * E.outBack(fk, 2.2))}" fill="${C.fruit}" stroke="#7A1F14" stroke-width="1.5"/>`).join('') : '';
      const sk = s.sun_t != null ? E.outBack(clamp((t - s.sun_t) / .7), 1.6) : 0;
      const sun = sk > 0 ? `<g transform="translate(560 830) rotate(${f1(t * 8)})">${Array.from({ length: 12 }, (_, i) => `<path d="M0 ${f1(-82 * sk)}L0 ${f1(-104 * sk)}" stroke="${C.sun}" stroke-width="6" stroke-linecap="round" transform="rotate(${i * 30})"/>`).join('')}<circle r="${f1(62 * sk)}" fill="${C.sun}"/></g>` : '';
      const bk = s.burst_t != null ? clamp((t - s.burst_t) / 1.2) : 0;
      const burst = bk > 0 && bk < 1 ? `<circle cx="360" cy="1280" r="${f1(40 + 900 * E.outCubic(bk))}" fill="url(#vburst)" opacity="${f3(1 - bk)}"/>` : '';
      const seedK = t < g0 ? 1 : 1 - clamp((t - g0) / .4);
      const seedEl = seedK > 0 ? `<ellipse cx="360" cy="1278" rx="14" ry="9" fill="#8A5A2B" stroke="#4A2E14" stroke-width="2" opacity="${f2(seedK)}"/>` : '';
      const peb = T.peb.map(p => `<ellipse cx="${f1(p.x)}" cy="${f1(p.y)}" rx="${f1(p.rx)}" ry="${f1(p.ry)}" fill="#3A2C22"/>`).join('');
      const strata = [1420, 1640, 1900].map((y, i) => `<path d="M-400 ${y}q180 ${18 - i * 8} 360 0t360 0t360 0t360 0t360 0" stroke="rgba(201,161,91,.13)" stroke-width="3" fill="none"/>`).join('');
      const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0"><defs>
          <linearGradient id="vsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7EFE0"/><stop offset="1" stop-color="#EED9B6"/></linearGradient>
          <linearGradient id="vsoil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.soil2}"/><stop offset="1" stop-color="${C.soil}"/></linearGradient>
          <radialGradient id="vburst"><stop offset="0" stop-color="#FFF6D8" stop-opacity="1"/><stop offset=".5" stop-color="${C.sun}" stop-opacity=".55"/><stop offset="1" stop-color="${C.sun}" stop-opacity="0"/></radialGradient></defs>
        <g transform="${tr}"><rect x="-3000" y="-3000" width="6720" height="4280" fill="url(#vsky)"/><rect x="-3000" y="1280" width="6720" height="4000" fill="url(#vsoil)"/>
          ${strata}${peb}${sun}<path d="M-3000 1280H3720" stroke="#3A2C22" stroke-width="4"/>
          ${segs(T.dn, s.root || C.root)}${segs(T.up, s.trunk || '#5A3E2B')}${leaves}${fruit}${seedEl}${burst}</g></svg>`;
      const fr = frameNo(t);
      const snowEl = snow ? Array.from({ length: 46 }, (_, i) => { const x = (rnd(i * 3.3) * W + Math.sin(t * 1.3 + i) * 20) % W, y = (rnd(i * 7.7) * H + t * (60 + rnd(i) * 70)) % H; return `<i style="position:absolute;left:${f1(x)}px;top:${f1(y)}px;width:7px;height:7px;border-radius:50%;background:#fff;opacity:.85"></i>`; }).join('') : '';
      const wk = s.warm_t != null ? clamp((t - s.warm_t) / 1.2) : 0;
      return {
        back: `<div class="full"${cidOf(s)} style="overflow:hidden;background:${C.sky}">${svg}${snowEl}
          ${wk > 0 ? `<div class="full" style="background:${C.sun};mix-blend-mode:soft-light;opacity:${f3(.35 * wk)}"></div>` : ''}${grain(t, .07)}${vignette(.32)}</div>`,
        cover: true, _fr: fr,
      };
    },
    // 2. Headline: Playfair on a soft cream panel (dark:true = dark panel over the soil), `*word*` = italic accent;
    //    words rise out of a blur one by one (stagger).
    mt_vec_headline(s, t, lt) {
      const [W] = DIMS(), dk = !!s.dark, sz = s.size || 50, ws = String(s.text || 'Cây mọc theo *hai hướng*').split(/\s+/);
      let inIt = false;
      const body = ws.map((w0, i) => {
        let w = w0, it = inIt;
        if (w.startsWith('*')) { it = true; inIt = true; w = w.slice(1); }
        if (w.endsWith('*')) { inIt = false; w = w.slice(0, -1); }
        const st = it ? `font-style:italic;color:${dk ? '#E7C27A' : '#9A6A22'}` : '';
        return `<span style="display:inline-block;${st};${blurIn(lt, (s.at ?? .12) + i * (s.stagger ?? .11), .3, 16, 14)}">${esc(w)}</span>`;
      }).join(' ');
      const k = E.outCubic(clamp(lt / .3));
      return { front: `<div class="abs"${cidOf(s)} style="left:${s.x ?? W / 2}px;top:${s.y ?? 250}px;transform:translate(-50%,-50%) scale(${f3(lerp(.94, 1, k))});opacity:${f3(k)};max-width:${s.w || 620}px;width:max-content;
        padding:22px 34px 26px;border-radius:22px;background:${dk ? 'rgba(27,20,16,.86)' : 'rgba(247,239,224,.93)'};box-shadow:0 14px 40px rgba(0,0,0,${dk ? .45 : .18});text-align:center;
        font:600 ${sz}px/1.22 ${F.serif};color:${dk ? C.sky : '#2A1F18'}">${body}</div>`, hideCaptions: s.hideCaptions ?? true };
    },
    // 3. Label on the drawing: a dot at x,y pops, a leader line draws to the label (dx,dy offset), the label pops (back.out).
    mt_vec_label(s, t, lt) {
      const x = s.x ?? 470, y = s.y ?? 1000, dx = s.dx ?? 120, dy = s.dy ?? -90, dk = s.dark ?? y > 640;
      const dot = E.outBack(clamp(lt / .25), 2.4), ln = E.inOutSine(clamp((lt - .12) / .35)), lab = E.outBack(clamp((lt - .4) / .3), 2);
      const col = dk ? C.root : '#5A3E2B';
      const [W] = DIMS(), estW = nch(String(s.text || 'công sức thầm lặng').replace(/\*/g, '')) * (s.size || 28) * .56 + 40;
      const lx = dx < 0 ? Math.max(14 + estW, x + dx) : Math.min(W - 14 - estW, x + dx), ly = y + dy, len = Math.hypot(lx - x, dy);
      return { front: `<div class="full"${cidOf(s)} style="pointer-events:none">
        <svg style="position:absolute;inset:0;overflow:visible" width="1" height="1"><line x1="${x}" y1="${y}" x2="${f1(x + (lx - x) * ln)}" y2="${f1(y + dy * ln)}" stroke="${col}" stroke-width="3" stroke-dasharray="${f1(len)}"/>
          <circle cx="${x}" cy="${y}" r="${f1(9 * dot)}" fill="${col}"/><circle cx="${x}" cy="${y}" r="${f1(18 * dot)}" fill="none" stroke="${col}" stroke-width="2" opacity=".5"/></svg>
        <div class="abs" style="left:${lx}px;top:${ly}px;transform:translate(${dx < 0 ? '-100%' : '0'},-50%) scale(${f3(lab)});transform-origin:${dx < 0 ? '100%' : '0'} 50%;padding:10px 18px;border-radius:12px;
          background:${dk ? 'rgba(244,234,216,.95)' : '#2A1F18'};color:${dk ? '#2A1F18' : C.sky};font:800 ${s.size || 28}px/1.15 ${F.disp};white-space:nowrap;box-shadow:0 8px 20px rgba(0,0,0,.3)">${marks(s.text || 'công sức thầm lặng', `font-family:${F.serif};font-style:italic;font-weight:600`)}</div></div>` };
    },
    // 4. Heavy moment: words [..] (Montserrat 900, caps) slam in one by one (`stagger`), each with a short shake and a crack
    //    drawing behind it.
    mt_vec_heavy(s, t, lt) {
      const [W, H] = DIMS(), ws = s.words || ['ÁP LỰC', 'BÓNG TỐI', 'ĐẤT ĐÁ'], st = s.stagger ?? .5, sz = s.size || 76, fr = frameNo(t);
      let shake = 0;
      const rows = ws.map((w, i) => {
        const at = (s.at ?? .1) + i * st, k = clamp((lt - at) / .22);
        if (lt < at) return `<div style="height:${f1(sz * 1.18)}px"></div>`;
        if (lt - at < .3) shake = Math.max(shake, 1 - (lt - at) / .3);
        const ck = E.outCubic(clamp((lt - at) / .25)), cw = nch(w) * sz * .72;
        const crack = `<svg viewBox="0 0 100 20" preserveAspectRatio="none" style="position:absolute;left:50%;top:50%;width:${f1(cw + 80)}px;height:${f1(sz)}px;transform:translate(-50%,-50%);overflow:visible">
          <path d="M0 10L12 6 20 13 31 4 44 12 55 7 66 15 78 5 88 11 100 8" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${f3(1 - ck)}" stroke="rgba(201,161,91,.7)" stroke-width="2" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
        return `<div style="position:relative;font:900 ${sz}px/1.18 ${F.disp};letter-spacing:.02em;color:${C.sky};white-space:nowrap;text-shadow:0 6px 0 #000,0 0 30px rgba(0,0,0,.6);opacity:${f3(clamp(k * 3))};transform:scale(${f3(lerp(1.8, 1, E.outBack(k, 1.6)))})">${crack}<span style="position:relative">${esc(w)}</span></div>`;
      }).join('');
      const jx = (rnd(fr * 1.3) - .5) * 22 * shake, jy = (rnd(fr * 2.9) - .5) * 22 * shake;
      return { front: `<div class="abs"${cidOf(s)} style="left:${s.x ?? W / 2}px;top:${s.y ?? H * .5}px;transform:translate(calc(-50% + ${f1(jx)}px),calc(-50% + ${f1(jy)}px));text-align:center;padding:30px 60px;border-radius:40px;background:radial-gradient(ellipse at 50% 50%,rgba(27,20,16,${s.panel === false ? 0 : .72}) 40%,rgba(27,20,16,0) 75%)">${rows}</div>`, hideCaptions: s.hideCaptions ?? true };
    },
    // 5. Two-way arrows: an UP arrow (sun icon, `up:{text,sub}`) and a DOWN arrow (weight icon, `down:{text,sub}`) draw themselves
    //    from the horizon (y), labels pop beside them.
    mt_vec_arrows(s, t, lt) {
      const [W, H] = DIMS(), y = s.y ?? H / 2, ux = s.up_x ?? 210, dx = s.down_x ?? 510, L = s.len ?? 300;
      const up = { text: 'hướng sáng', sub: 'thân vươn lên', ...(s.up || {}) }, dn = { text: 'trọng lực', sub: 'rễ đâm xuống', ...(s.down || {}) };
      const ka = E.inOutSine(clamp((lt - .1) / .6)), kb = E.inOutSine(clamp((lt - .35) / .6));
      const arrow = (x, dir, k, col) => {
        const y2 = y + dir * L * k, hk = clamp(k * 3 - 2);
        return `<line x1="${x}" y1="${y}" x2="${x}" y2="${f1(y2)}" stroke="${col}" stroke-width="10" stroke-linecap="round"/>${hk > 0 ? `<path d="M${x - 26 * hk} ${f1(y2 - dir * 26 * hk)}L${x} ${f1(y2)}L${x + 26 * hk} ${f1(y2 - dir * 26 * hk)}" stroke="${col}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}`;
      };
      const lab = (x, yy, o, k, ic, dark) => {
        const e = E.outBack(clamp(k), 2);
        return `<div class="abs" style="left:${x}px;top:${yy}px;transform:translate(-50%,-50%) scale(${f3(e)});text-align:center;padding:12px 20px;border-radius:16px;background:${dark ? 'rgba(244,234,216,.95)' : 'rgba(42,31,24,.92)'};color:${dark ? '#2A1F18' : C.sky};white-space:nowrap">
          <div style="font:800 30px/1.15 ${F.disp};display:flex;align-items:center;gap:10px;justify-content:center">${ic}${esc(o.text)}</div>${o.sub ? `<div style="font:italic 600 24px/1.3 ${F.serif};opacity:.85">${esc(o.sub)}</div>` : ''}</div>`;
      };
      const sunIc = `<svg viewBox="0 0 24 24" width="30" height="30" style="fill:none;stroke:${C.sun};stroke-width:2.6;stroke-linecap:round"><circle cx="12" cy="12" r="4.5" fill="${C.sun}"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>`;
      const wtIc = `<svg viewBox="0 0 24 24" width="30" height="30" style="fill:${C.root}"><path d="M9 6a3 3 0 116 0h3l3 15H3L6 6z"/></svg>`;
      return { front: `<div class="full"${cidOf(s)} style="pointer-events:none"><svg style="position:absolute;inset:0;overflow:visible" width="1" height="1">${arrow(ux, -1, ka, C.sun)}${arrow(dx, 1, kb, C.root)}</svg>
        ${lab(ux, y - L - 70, up, (lt - .6) / .3, sunIc, false)}${lab(dx, y + L + 70, dn, (lt - .85) / .3, wtIc, true)}</div>`, hideCaptions: s.hideCaptions ?? true };
    },
  };

  Object.assign(MODULES, SEO, RES, FACE_MODS, POV, VEC);

  // ===================================================================================== CAPTIONS
  const curIdx = (c, t) => { let k = -1; c.words.forEach((w, i) => { if (t >= w.s) k = i; }); return k; };
  const capPos = (c, dflt) => { const [W] = DIMS(); const x = c.x ?? W / 2; return { x, y: c.y ?? dflt, l: x - W / 2, r: W / 2 - x }; };
  // Seoul: no full-sentence slab — small lowercase words blur in exactly on their spoken time; `hl` words in serif italic.
  CAPTION_STYLES.mt_seoul = (c, t) => {
    const p = capPos(c, 1030), size = c.size || 32;
    const html = c.words.map(w => `<span style="display:inline-block;${blurIn(t, w.s, .2, 10)}${w.hl ? `font-family:${F.serif};font-style:italic;font-weight:700;font-size:1.3em;` : ''}">${esc(String(w.w).toLowerCase())}</span>`).join(' ');
    return `<div id="cap" class="mt_seoul"${cidOf(c)} style="top:${p.y}px;left:${p.l}px;right:${p.r}px;transform:translateY(-50%);text-align:center"><div style="display:inline-block;max-width:600px;font:700 ${size}px/1.3 ${c.font || F.sans};letter-spacing:-.01em;color:${c.color || '#fff'};${halo}">${html}</div></div>`;
  };
  // RESULT: two-tier on a navy card under the chin: small line + ONE big bold word (hl word, else the longest); hl word
  // in handwriting (warm yellow). Words appear as spoken.
  CAPTION_STYLES.mt_result = (c, t) => {
    const f = FACE(), p = capPos(c, clamp(f.y + 450, 900, 1110)), size = c.size || 34;
    const ws = c.words;
    let key = ws.findIndex(w => w.hl);
    if (key < 0 && ws.length > 2) { let best = -1; ws.forEach((w, i) => { const n = nch(w.w); if (n >= 4 && n >= best) { best = n; key = i; } }); }
    const small = ws.map((w, i) => (i === key ? '' : `<span style="${t >= w.s ? '' : 'opacity:0;'}">${esc(w.w)}</span>`)).filter(Boolean).join(' ');
    let bigH = '';
    if (key >= 0) {
      const w = ws[key], on = t >= w.s, e = on ? E.outBack(clamp((t - w.s) / .25), 2) : 0, txt = String(w.w);
      const bs = Math.round(clamp(520 / Math.max(1, nch(txt) * .62), size * 1.4, size * 2.6));
      bigH = w.hl ? `<div style="font:${Math.round(bs * .82)}px/1.45 ${F.hand};color:${C.script};white-space:nowrap;opacity:${on ? 1 : .22};transform:scale(${f3(lerp(.86, 1, e))})">${esc(txt)}</div>`
        : `<div style="font:900 ${bs}px/1.05 ${F.sans};letter-spacing:-.035em;white-space:nowrap;opacity:${on ? 1 : .22};transform:scale(${f3(lerp(.86, 1, e))})">${esc(txt)}</div>`;
    }
    const o = clamp((t - c.t0) / .1);
    return `<div id="cap" class="mt_result"${cidOf(c)} style="top:${p.y}px;left:${p.l}px;right:${p.r}px;transform:translateY(-50%);display:flex;justify-content:center;opacity:${f3(o)}">
      <div style="background:rgba(18,29,50,.88);border-radius:22px;padding:10px 28px 14px;text-align:center;color:#FFFDF8;box-shadow:0 14px 30px rgba(0,0,0,.32);max-width:640px;font-family:${c.font || F.sans}">
        ${small ? `<div style="font-weight:700;font-size:${size}px;line-height:1.15;letter-spacing:-.02em">${small}</div>` : ''}${bigH}</div></div>`;
  };
  // POV: editorial bold white words, the spoken word on a lime block, hl words lime.
  CAPTION_STYLES.mt_pov = (c, t) => {
    const p = capPos(c, 1000), size = c.size || 40, acc = lime(c), k = curIdx(c, t);
    const html = c.words.map((w, i) => {
      const on = i === k && t < (w.e ?? w.s + .4) + .1;
      return `<span style="display:inline-block;padding:0 .1em;border-radius:.12em;${on ? `background:${acc};color:#111;text-shadow:none;` : w.hl ? `color:${acc};` : ''}">${esc(w.w)}</span>`;
    }).join(' ');
    return `<div id="cap" class="mt_pov"${cidOf(c)} style="top:${p.y}px;left:${p.l}px;right:${p.r}px;transform:translateY(-50%);text-align:center;opacity:${f3(clamp((t - c.t0) / .08))}">
      <div style="display:inline-block;max-width:620px;font:800 ${size}px/1.22 ${c.font || F.sans};letter-spacing:-.02em;color:${c.color || '#fff'};text-shadow:0 3px 0 rgba(0,0,0,.55),0 0 14px rgba(0,0,0,.5)">${html}</div></div>`;
  };
  // Vector: each word rises out of a blur when spoken (lowercase, no box, dark glow); hl words in Playfair italic gold.
  // Bottom edge at y ≈ 1000.
  CAPTION_STYLES.mt_vec = (c, t) => {
    const p = capPos(c, 1000), size = c.size || 36;
    const html = c.words.map(w => `<span style="display:inline-block;${blurIn(t, w.s, .3, 18, 12)}${w.hl ? `font-family:${F.serif};font-style:italic;color:#E7C27A;font-size:1.12em;` : ''}">${esc(w.hl ? w.w : String(w.w).toLowerCase())}</span>`).join(' ');
    return `<div id="cap" class="mt_vec"${cidOf(c)} style="top:${p.y}px;left:${p.l}px;right:${p.r}px;transform:translateY(-100%);text-align:center">
      <div style="display:inline-block;max-width:600px;font:600 ${size}px/1.3 ${c.font || F.ui};color:${c.color || '#FFF8EC'};text-shadow:0 0 12px rgba(20,12,6,.85),0 2px 4px rgba(0,0,0,.7)">${html}</div></div>`;
  };

  // ===================================================================================== RECIPE
  const capTxt = c => c.words.map(w => w.w).join(' ');
  // Key word of a caption chunk: the longest word that is not a filler (được, những, chúng…).
  const STOP = new Set(['được', 'những', 'chúng', 'các', 'của', 'này', 'rằng', 'nhưng', 'trước', 'cũng', 'thì', 'là', 'và', 'với', 'một', 'mình', 'bây', 'giờ', 'đây', 'đấy', 'rồi', 'chỉ', 'cần', 'nhé', 'đều', 'biết', 'sau', 'đó', 'kia', 'để', 'sẽ', 'mới', 'xong', 'việc', 'làm', 'thế', 'cho', 'bạn', 'tôi', 'chính', 'dành', 'có', 'thể', 'từ', 'vào', 'gì', 'nào', 'khi', 'mà', 'như', 'đã', 'đang', 'rất', 'quá', 'ta', 'bằng', 'nó', 'họ', 'ai', 'lại', 'ra', 'đi', 'nữa', 'vậy']);
  const clean = w => String(w).replace(/[.,!?;:"“”]+/g, '');
  const isKey = w => !STOP.has(clean(w).toLowerCase());
  const longest = c => { let b = '', bs = c.t0; for (const w of c.words) if (isKey(w.w) && nch(clean(w.w)) > nch(b)) { b = clean(w.w); bs = w.s; } let weak = false; if (!b || nch(b) < 3) { const w = c.words.at(-1) || { w: '', s: c.t0 }; b = b || clean(w.w); bs = b === clean(w.w) ? w.s : bs; weak = true; } return { w: b, s: bs, weak }; };
  const norm = v => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
  const r2 = v => Math.round(v * 100) / 100;
  // Captions grouped into "lines" every ~minGap s: [{t0,t1,text,key:{w,s}}].
  const beats = (caps, from, to, gap) => {
    const out = []; let last = -1e9;
    for (const c of caps) { if (c.t0 < from || c.t0 > to) continue; if (c.t0 - last < gap) continue; const key = longest(c); if (key.weak) continue; out.push({ t0: c.t0, t1: c.t1, text: capTxt(c), key }); last = c.t0; }
    return out;
  };
  const CONNECT = ['thậm chí', 'và rồi', 'nhưng', 'sau đó', 'thế là', 'rồi', 'còn nữa'];
  function recipe(ctx) {
    const dur = ctx.dur || 20, caps = ctx.captions || [], o = ctx.opts || {}, v = o.variant || 'face', imgs = o.images || [];
    const title = o.title || ctx.title || '';
    const sc = [], fx = [];
    const endT = Math.max(dur - 2.6, dur * .8);
    if (v === 'seoul') {
      const hookEnd = Math.min(2.6, dur * .2);
      sc.push({ type: 'mt_seoul_collage', t0: 0, t1: r2(hookEnd), mode: 'shrink', src: 'aroll', line: caps[0] ? capTxt(caps[0]) : 'Một điều', big: title || (caps[0] ? longest(caps[0]).w : 'bất ngờ'), stickers: [{ emoji: '👀', x: 590, y: 300 }] });
      let a = hookEnd, i = 0;
      while (a < endT - .3) { const b = Math.min(endT, a + 6); sc.push({ type: 'mt_seoul_shots', t0: r2(a), t1: r2(b), images: imgs.length ? imgs.slice(i % Math.max(1, imgs.length)).concat(imgs) : ['aroll'], every: 1.4, cut: true }); a = b; i += 4; }
      const flashes = [];
      for (const cw of CONNECT) { const ft = findWord(caps, [cw], hookEnd + .5); if (ft != null && ft < endT - 1 && flashes.every(x => Math.abs(x - ft) > 3)) flashes.push(ft); if (flashes.length >= 2) break; }
      flashes.forEach(ft => sc.push({ type: 'mt_seoul_flash', t0: r2(ft), t1: r2(ft + .6), text: (caps.flatMap(c => c.words).find(w => Math.abs(w.s - ft) < .01)?.w) || 'và rồi' }));
      beats(caps, hookEnd + .2, endT - 1.2, 3.2).forEach((b, j) => {
        if (flashes.some(x => Math.abs(x - b.key.s) < 1)) return;
        const fam = /\d/.test(b.key.w) || j % 3 === 2 ? 'sans' : 'serif';
        sc.push({ type: 'mt_seoul_word', t0: r2(b.key.s - .05), t1: r2(Math.min(b.key.s + 1.1, endT)), text: b.key.w, family: fam, caps: fam === 'sans' });
      });
      sc.push({ type: 'mt_seoul_imessage', t0: r2(endT), t1: dur, src: imgs.at(-1) || 'aroll', cards: imgs.slice(0, 2), word: o.word || 'Đáng thử!', emoji: '❤️', typing_at: .6, word_at: 1.2 });
      return { caption_style: 'mt_seoul', music: o.music || 'lofi', scenes: sc };
    }
    if (v === 'result') {
      sc.push({ type: 'mt_film', t0: 0, t1: dur, leaks: [dur * .33, dur * .66].map(x => ({ t: r2(x) })) });
      sc.push({ type: 'mt_result_card', t0: 0, t1: r2(Math.min(2.3, dur * .2)), kicker: title ? 'câu chuyện về' : 'hôm nay mình kể', big: (title || (caps[0] ? longest(caps[0]).w : 'KÝ ỨC')).toUpperCase(), circle_at: 1.0 });
      const bs = beats(caps, 2.6, endT - 1, 4.2);
      bs.forEach((b, j) => {
        if (j % 3 === 0) sc.push({ type: 'mt_polaroid', t0: r2(b.t0), t1: r2(Math.min(b.t0 + 3, endT - .2)), src: imgs[j % Math.max(1, imgs.length)] || 'aroll', label: b.key.w, zone: 'top', w: 260 });
        else if (j % 3 === 1) sc.push({ type: 'mt_result_card', t0: r2(b.key.s - .1), t1: r2(Math.min(b.key.s + 2.1, endT - .2)), surface: j % 2 ? 'kraft' : 'navy', kicker: b.text.replace(b.key.w, '').trim().slice(0, 28) || 'và rồi', script: b.key.w });
        else if (imgs.length) sc.push({ type: 'mt_paper_stack', t0: r2(b.t0), t1: r2(Math.min(b.t0 + 2.3, endT - .2)), images: imgs, title: b.key.w });
        else sc.push({ type: 'mt_prop_note', t0: r2(b.t0), t1: r2(Math.min(b.t0 + 3, endT - .2)), kind: 'sticky', lines: [b.key.w], zone: 'top' });
      });
      sc.push({ type: 'mt_result_card', t0: r2(endT), t1: dur, surface: 'navy', kicker: o.cta_kicker || 'bạn còn giữ', big: o.cta || 'KỶ NIỆM NÀO?', keep: true });
      return { caption_style: 'mt_result', music: o.music || 'lofi_2', scenes: sc };
    }
    if (v === 'pov') {
      sc.push({ type: 'mt_pov_hud', t0: 0, t1: dur, place: o.place || 'Hành trình', clock: o.clock || '13:24', tick: true });
      const hookEnd = Math.min(2.4, dur * .18);
      const hookCaps = caps.filter(c => c.t0 < hookEnd);
      sc.push({ type: 'mt_pov_kinetic', t0: 0, t1: r2(hookEnd), kicker: 'POV', lines: (hookCaps.length ? hookCaps.slice(0, 3).map((c, i) => ({ text: i === hookCaps.slice(0, 3).length - 1 ? `*${capTxt(c)}*` : capTxt(c), at: r2(Math.max(.1, c.t0)) })) : [{ text: title || 'Một ngày', at: .1 }, { text: '*không như dự tính*', at: .6 }]) });
      sc.push({ type: 'mt_pov_rewind', t0: r2(hookEnd), t1: r2(hookEnd + 1.7), kicker: o.rewind || '15 PHÚT TRƯỚC', time: o.clock || '13:24', place: o.place || 'Điểm xuất phát' });
      const num = caps.flatMap(c => c.words).find(w => /\d/.test(w.w) && w.s > hookEnd + 2 && w.s < endT - 3);
      if (num) sc.push({ type: 'mt_pov_stats', t0: r2(num.s), t1: r2(num.s + 2.8), items: [{ icon: 'bolt', text: num.w }, { icon: 'clock', text: o.clock || '13:24' }] });
      if (imgs.length) { const a = dur * .38; sc.push({ type: 'mt_pov_clips', t0: r2(a), t1: r2(a + 2.4), images: imgs, every: .8, speed: 'x2', label: 'trên đường' }); }
      const mt = findWord(caps, ['bất ngờ', 'đột nhiên', 'thế là', 'suýt', 'nhưng'], dur * .45) ?? dur * .6;
      if (mt < endT - 2) sc.push({ type: 'mt_pov_freeze', t0: r2(mt), t1: r2(mt + 1.4), emoji: '😱', label: o.moment || 'KHOẢNH KHẮC ĐÓ', ex: 540, ey: 360 });
      sc.push({ type: 'mt_pov_kinetic', t0: r2(endT), t1: dur, kicker: 'còn bạn?', lines: [{ text: 'Bạn sẽ làm gì', at: .1 }, { text: '*nếu là mình?*', at: .5 }], pip: true, keep: true });
      return { caption_style: 'mt_pov', music: o.music || 'happy', scenes: sc, fx: mt < endT - 2 ? [{ t: r2(mt), type: 'punch' }] : [] };
    }
    if (v === 'vector') {
      const g0 = Math.min(1.2, dur * .06), g1 = dur * .42, dive = dur * .3, rise = dur * .5;
      sc.push({ type: 'mt_vec_world', t0: 0, t1: dur, seed: o.seed ?? 7, grow_t: r2(g0), grow_end_t: r2(g1), sun_t: r2(rise), burst_t: r2(rise), warm_t: r2(rise), fruit_t: r2(dur * .72), seasons_t: r2(endT - 2.4), seasons_end_t: r2(endT),
        cam: [{ t: 0, x: 360, y: 1280, s: 1.5 }, { t: r2(g0 + 1.5), x: 360, y: 1280, s: 1 }, { t: r2(dive), x: 360, y: 1620, s: 1.3 }, { t: r2(rise), x: 360, y: 980, s: 1.15 }, { t: r2(dur * .75), x: 360, y: 1180, s: .92 }] });
      sc.push({ type: 'mt_vec_headline', t0: .2, t1: r2(Math.min(3, dur * .2)), text: title ? `*${title}*` : 'Mọi thứ đều có *gốc rễ*', y: 230 });
      beats(caps, 3.5, endT - 1.5, 4.5).slice(0, 3).forEach((b, j) => {
        if (j === 1) sc.push({ type: 'mt_vec_heavy', t0: r2(b.t0), t1: r2(Math.min(b.t0 + 2.2, endT - .5)), words: (b.text.split(/\s+/).map(clean).filter(w => nch(w) >= 3 && isKey(w)).slice(0, 3).map(w => w.toUpperCase()).concat(o.heavy || ['ÁP LỰC', 'KIÊN TRÌ'])).slice(0, 3) });
        else sc.push({ type: 'mt_vec_label', t0: r2(b.key.s), t1: r2(Math.min(b.key.s + 2.4, endT - .5)), text: b.key.w, x: j ? 430 : 300, y: j ? 520 : 820, dx: j ? 110 : -120, dy: -80 });
      });
      sc.push({ type: 'mt_vec_headline', t0: r2(endT), t1: dur, text: o.cta || 'Gốc vững thì *quả ngọt*', y: 230, keep: true });
      return { caption_style: 'mt_vec', music: o.music || 'inspire', scenes: sc };
    }
    // face (default): Face RESULT — props beside the face, never on it.
    sc.push({ type: 'mt_film', t0: 0, t1: dur, vignette: false });
    const bs = beats(caps, .3, endT - 1, 3.8);
    const kinds = ['note', 'quote', 'bars', 'polaroid', 'sticky', 'ticket'];
    bs.forEach((b, j) => {
      const t1 = r2(Math.min(b.t0 + 3, endT - .2)), t0 = r2(b.t0), k = kinds[j % kinds.length];
      if (t1 - t0 < 1.2) return;
      if (k === 'quote') sc.push({ type: 'mt_quote_card', t0, t1, text: b.text, zone: 'top' });
      else if (k === 'bars') {
        const n = caps.flatMap(c => c.words).find(w => /\d/.test(w.w) && w.s >= b.t0 - .2 && w.s < b.t1 + 1);
        if (n) sc.push({ type: 'mt_prop_bars', t0, t1, title: b.key.w, bars: [{ label: 'trước', value: 30 }, { label: 'sau', value: 85 }] });
        else sc.push({ type: 'mt_prop_note', t0, t1, kind: 'ticket', header: 'GHI CHÚ', lines: [b.key.w.toUpperCase()], stamp: { text: 'GHI NHỚ', at: 1.2 }, zone: 'top' });
      } else if (k === 'polaroid') sc.push({ type: 'mt_polaroid', t0, t1, src: imgs[j % Math.max(1, imgs.length)] || '', label: b.key.w, zone: 'top', w: 230 });
      else sc.push({ type: 'mt_prop_note', t0, t1, kind: k === 'sticky' ? 'sticky' : k === 'ticket' ? 'ticket' : 'note', lines: [b.key.w, ...(k === 'note' ? [b.text.slice(0, 22)] : [])], zone: 'top' });
    });
    sc.push({ type: 'mt_label_tape', t0: r2(endT), t1: dur, text: o.cta || title || 'LƯU LẠI NHÉ', keep: true });
    return { caption_style: 'mt_result', music: o.music || 'lofi', scenes: sc };
  }

  // ===================================================================================== STUDIO
  const M = 'media/';
  PACKS.push({
    id: P, name: 'Montage kể chuyện (5 kiểu)', icon: '🎞️', caption: 'mt_result',
    desc: 'Danh sách Seoul (b-roll nhanh + chữ lớn), RESULT podcast ấm (thẻ navy, polaroid, phim), RESULT quanh mặt (đạo cụ giấy cạnh mặt), POV hành trình (HUD, tua lại, khoảnh khắc đóng băng), hoạt hình giải thích (thế giới tự vẽ). Chọn kiểu bằng recipe_opts.variant: seoul | result | face | pov | vector',
    items: [
      { type: 'mt_seoul_shots', label: 'Seoul · B-roll cắt nhanh', make: T => ({ type: 'mt_seoul_shots', t0: T, t1: T + 4.2, images: [M + 'top_dalat.jpg', M + 'top_hoian.jpg', M + 'top_sapa.jpg'], every: 1.4 }) },
      { type: 'mt_seoul_word', label: 'Seoul · Chữ lớn (serif / đậm)', make: T => ({ type: 'mt_seoul_word', t0: T, t1: T + 1.2, text: 'yên bình', family: 'serif', sub: 'giữa phố núi', y: 600 }) },
      { type: 'mt_seoul_flash', label: 'Seoul · Trang trắng chữ nối', make: T => ({ type: 'mt_seoul_flash', t0: T, t1: T + .6, text: 'thậm chí', sub: '&' }) },
      { type: 'mt_seoul_collage', label: 'Seoul · Trang collage mở đầu', make: T => ({ type: 'mt_seoul_collage', t0: T, t1: T + 2.6, mode: 'photo', src: M + 'top_dalat.jpg', line: '5 điều ở Đà Lạt', big: 'bất ngờ', stickers: [{ emoji: '👀', x: 590, y: 300 }] }) },
      { type: 'mt_seoul_list', label: 'Seoul · Danh sách chọn xanh', make: T => ({ type: 'mt_seoul_list', t0: T, t1: T + 2.6, variant: 'highlight', items: [{ text: 'đi bộ', emoji: '🚶' }, { text: 'đạp xe' }, { text: 'ngắm hoàng hôn', emoji: '🌅' }] }) },
      { type: 'mt_seoul_imessage', label: 'Seoul · Outro bong bóng chat', make: T => ({ type: 'mt_seoul_imessage', t0: T, t1: T + 2.6, src: M + 'top_hoian.jpg', cards: [M + 'top_dalat.jpg', M + 'top_sapa.jpg'], word: 'Đáng đi!', emoji: '❤️' }) },
      { type: 'mt_result_card', label: 'RESULT · Thẻ navy hai tầng chữ', make: T => ({ type: 'mt_result_card', t0: T, t1: T + 2.3, surface: 'navy', kicker: 'điều mình học được', big: 'KIÊN NHẪN', circle_at: 1.0 }) },
      { type: 'mt_result_card', label: 'RESULT · Thẻ giấy kraft viết tay', make: T => ({ type: 'mt_result_card', t0: T, t1: T + 2.3, surface: 'kraft', kicker: 'mỗi ngày giữ lại', script: 'một tấm vé', stamp: { text: 'NGÀY 1', at: 1.3 } }) },
      { type: 'mt_polaroid', label: 'RESULT · Polaroid + chữ viết tay', make: T => ({ type: 'mt_polaroid', t0: T, t1: T + 3, src: M + 'top_hoian.jpg', label: 'Hội An, 2019', x: 360, y: 330, w: 300, enter: 'toss' }) },
      { type: 'mt_paper_stack', label: 'RESULT · Xấp ảnh lật stop-motion', make: T => ({ type: 'mt_paper_stack', t0: T, t1: T + 2.4, images: [M + 'top_dalat.jpg', M + 'top_halong.jpg', M + 'top_phuquoc.jpg', M + 'top_sapa.jpg'], title: 'những chuyến đi', sub: '12 THÁNG · 4 NƠI' }) },
      { type: 'mt_film', label: 'RESULT · Hạt phim + bụi + vệt cháy', make: T => ({ type: 'mt_film', t0: T, t1: T + 6, leaks: [{ t: T + 2 }] }) },
      { type: 'mt_prop_note', label: 'Quanh mặt · Giấy ghi chú / vé / hoá đơn', make: T => ({ type: 'mt_prop_note', t0: T, t1: T + 3.2, kind: 'note', zone: 'top', lines: ['việc cần làm', 'dậy lúc 5 giờ', 'đọc 10 trang'], circle: { line: 1, at: 1.8 } }) },
      { type: 'mt_quote_card', label: 'Quanh mặt · Thẻ trích dẫn', make: T => ({ type: 'mt_quote_card', t0: T, t1: T + 3.4, text: 'Làm chậm mà chắc, còn hơn nhanh mà bỏ dở.', author: 'bà nội mình', zone: 'top' }) },
      { type: 'mt_prop_bars', label: 'Quanh mặt · Biểu đồ giấy kẻ ô', make: T => ({ type: 'mt_prop_bars', t0: T, t1: T + 3.2, title: 'ai quên nhiều hơn?', bars: [{ label: 'qua cửa', value: 82 }, { label: 'một phòng', value: 34 }], zone: 'top' }) },
      { type: 'mt_label_tape', label: 'Quanh mặt · Băng nhãn in chữ', make: T => ({ type: 'mt_label_tape', t0: T, t1: T + 2.6, text: 'HIỆU ỨNG CỬA' }) },
      { type: 'mt_pov_hud', label: 'POV · Khung HUD camera hành trình', make: T => ({ type: 'mt_pov_hud', t0: T, t1: T + 8, place: 'Bến Ninh Kiều', clock: '13:24', tick: true }) },
      { type: 'mt_pov_kinetic', label: 'POV · Mở đầu chữ động + cửa sổ tròn', make: T => ({ type: 'mt_pov_kinetic', t0: T, t1: T + 2.4, kicker: 'POV', lines: ['39 phút nữa', 'mà mình *vẫn trễ*'] }) },
      { type: 'mt_pov_rewind', label: 'POV · Tua lại "15 phút trước"', make: T => ({ type: 'mt_pov_rewind', t0: T, t1: T + 1.8, kicker: '15 PHÚT TRƯỚC', time: '13:24', place: 'Bến Ninh Kiều' }) },
      { type: 'mt_pov_freeze', label: 'POV · Khoảnh khắc đóng băng', make: T => ({ type: 'mt_pov_freeze', t0: T, t1: T + 1.4, emoji: '😱', label: 'KHOẢNH KHẮC ĐÓ', ex: 540, ey: 360 }) },
      { type: 'mt_pov_stats', label: 'POV · Huy hiệu số liệu', make: T => ({ type: 'mt_pov_stats', t0: T, t1: T + 3, items: [{ icon: 'clock', text: '13:24' }, { icon: 'route', text: '12,4 km' }, { icon: 'bolt', text: '2 lần suýt ngã' }] }) },
      { type: 'mt_pov_clips', label: 'POV · Đoạn clip rung tay tua nhanh', make: T => ({ type: 'mt_pov_clips', t0: T, t1: T + 2.4, images: [M + 'top_halong.jpg', M + 'top_phuquoc.jpg', M + 'gs_bg_city.jpg'], every: .8, speed: 'x2', label: 'trên đường' }) },
      { type: 'mt_vec_world', label: 'Hoạt hình · Thế giới tự vẽ (cây)', make: T => ({ type: 'mt_vec_world', t0: T, t1: T + 8, grow_t: T + .4, grow_end_t: T + 5, sun_t: T + 3, fruit_t: T + 5.5, cam: [{ t: T, x: 360, y: 1280, s: 1.4 }, { t: T + 2, x: 360, y: 1280, s: 1 }] }) },
      { type: 'mt_vec_headline', label: 'Hoạt hình · Tiêu đề serif', make: T => ({ type: 'mt_vec_headline', t0: T, t1: T + 2.6, text: 'Cây mọc theo *hai hướng*', y: 240 }) },
      { type: 'mt_vec_label', label: 'Hoạt hình · Nhãn chỉ vào hình', make: T => ({ type: 'mt_vec_label', t0: T, t1: T + 2.4, text: 'công sức *thầm lặng*', x: 330, y: 820, dx: 110, dy: 90 }) },
      { type: 'mt_vec_heavy', label: 'Hoạt hình · Chữ nặng dồn dập', make: T => ({ type: 'mt_vec_heavy', t0: T, t1: T + 2.2, words: ['ÁP LỰC', 'BÓNG TỐI', 'ĐẤT ĐÁ'] }) },
      { type: 'mt_vec_arrows', label: 'Hoạt hình · Hai mũi tên lên / xuống', make: T => ({ type: 'mt_vec_arrows', t0: T, t1: T + 3 }) },
    ],
    recipe,
  });
})();
