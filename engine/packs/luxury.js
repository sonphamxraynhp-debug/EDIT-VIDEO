// "Minimal Luxury" pack — ported from the video-edit-minimal-luxury skill (Iman-Gadzhi-style short-form):
// white Inter captions that bounce in word by word (numbers huge, keywords bold), warm dark grade + vignette + grain,
// B&W portrait on paper with a red disc, outlined icon callout, black "pillars" arcs, red diamonds, blackout,
// two-line labels over a B&W clip, zoom-blur punch, dip-to-black, outro with handle bar.
// Palette: white #F5F5F5 · ink #0C0B0B · paper #F2F2F2 · one red #A8203A (TL.brand.primary overrides) · maroon #3A2219.
// Spec: references/pack-luxury.md
(() => {
  const P = 'luxury';
  // Inter 300/900 are not in index.html's font link (400–800 are).
  if (!document.querySelector('link[data-pack="luxury"]')) {
    document.head.insertAdjacentHTML('beforeend', '<link data-pack="luxury" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;900&display=block">');
  }

  const C = { white: '#F5F5F5', ink: '#0C0B0B', paper: '#F2F2F2', red: '#A8203A', maroon: '#3A2219', blackout: '#0E0D0D', outro: '#0E0E1A', rim: 'rgb(200,30,50)' };
  const brand = () => ((typeof TL !== 'undefined' && TL && TL.brand) || {});
  const RED = s => (s && s.color) || brand().primary || C.red;
  const FONT = s => (s && s.font) || brand().font || "'Inter', 'Be Vietnam Pro', sans-serif";
  const ease = (t, t0, d) => E.outCubic(prog(t, t0, d));
  const f3 = v => (+v).toFixed(3);
  const words = s => String(s || '').split(/\s+/).filter(Boolean);
  // Scene-level fade-out so cards never pop off.
  const outK = (s, t, d = .2) => (s.keep ? 1 : 1 - E.inCubic(prog(t, s.t1 - d, d)));
  const faceY = () => (TL && TL.face ? TL.face.y : 400);
  // Default caption / callout line: chest height, under the chin of a phone-framed face.
  const chestY = () => (TL && TL.caption_y) || clamp(faceY() + 340, 650, 1000);

  const hexA = (hex, a) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // Film grain: static fractal noise tile, offset per frame (pure function of t).
  const GRAIN_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>";
  const GRAIN_URL = 'data:image/svg+xml,' + encodeURIComponent(GRAIN_SVG).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27');
  const grain = (t, op = .1) => {
    const j = Math.floor(t * (TL.fps || 30));
    return `<div class="full" style="background-image:url(${GRAIN_URL});background-position:${(j * 37) % 160}px ${(j * 71) % 160}px;mix-blend-mode:overlay;opacity:${op}"></div>`;
  };
  const vignette = (op = 1) => `<div class="full" style="opacity:${op};background:radial-gradient(ellipse 70% 62% at 50% 45%,rgba(0,0,0,0) 55%,rgba(0,0,0,.55) 100%)"></div>`;
  const frameSrc = t => (TL.aroll ? url(fmtSeq(TL.aroll.frames, frameAt(t))) : '');
  const cutSrc = t => (TL.aroll && TL.aroll.cutouts ? url(fmtSeq(TL.aroll.cutouts, frameAt(t))) : '');

  // Callout icons (from the source design: gold chest/key/bolt/star, green check/money, pink brain, white eye/clock).
  const ICONS = {
    chest: `<svg viewBox="0 0 64 64" fill="none" stroke="#F1D27A" stroke-width="2.4" stroke-linejoin="round"><rect x="8" y="26" width="48" height="28" rx="3" fill="#6B3F1D"/><path d="M8 30c0-10 8-16 24-16s24 6 24 16" fill="#8A5428"/><rect x="8" y="26" width="48" height="6" fill="#C98A3C"/><rect x="26" y="26" width="12" height="12" rx="2" fill="#F1D27A" stroke="#7A5A1E"/><circle cx="32" cy="33" r="2" fill="#7A5A1E"/><path d="M16 14 32 8 48 14" stroke="#F1D27A" stroke-width="2"/></svg>`,
    bolt: `<svg viewBox="0 0 64 64" fill="#F1D27A"><path d="M36 4 14 36h16l-4 24 24-34H34z"/></svg>`,
    star: `<svg viewBox="0 0 64 64" fill="#F1D27A"><path d="M32 4l8 18 20 2-15 13 5 20-18-11-18 11 5-20L4 24l20-2z"/></svg>`,
    key: `<svg viewBox="0 0 64 64" fill="none" stroke="#F1D27A" stroke-width="4" stroke-linecap="round"><circle cx="22" cy="24" r="12"/><path d="M31 33 56 58M48 50l6-6M40 42l6-6"/></svg>`,
    eye: `<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3.5"><path d="M4 32s10-18 28-18 28 18 28 18-10 18-28 18S4 32 4 32z"/><circle cx="32" cy="32" r="8" fill="#fff"/></svg>`,
    check: `<svg viewBox="0 0 64 64" fill="none" stroke="#7CE38B" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 34l14 14 30-32"/></svg>`,
    money: `<svg viewBox="0 0 64 64" fill="none" stroke="#7CE38B" stroke-width="3.5"><rect x="4" y="16" width="56" height="32" rx="4"/><circle cx="32" cy="32" r="8"/><path d="M12 24h4M48 40h4"/></svg>`,
    brain: `<svg viewBox="0 0 64 64" fill="none" stroke="#F1A0C8" stroke-width="3.5" stroke-linecap="round"><path d="M28 8c-8 0-12 6-12 12-6 2-8 8-6 14-2 6 2 12 8 12 2 6 10 8 10 2V8zM36 8c8 0 12 6 12 12 6 2 8 8 6 14 2 6-2 12-8 12-2 6-10 8-10 2V8z"/></svg>`,
    clock: `<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><circle cx="32" cy="32" r="24"/><path d="M32 16v16l10 6"/></svg>`,
    warn: `<svg viewBox="0 0 64 64" fill="none" stroke="#F1D27A" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"><path d="M32 6 60 56H4z"/><path d="M32 24v14M32 46v2"/></svg>`,
  };
  const iconHTML = (ic, px) => (ICONS[ic] ? ICONS[ic].replace('<svg ', `<svg width="${px}" height="${px}" `) : slIcon(ic || '⭐', px, 'white'));

  // Words that appear one by one: fade + rise (+ optional blur), pure function of t.
  const stagWords = (list, t, t0, step, { dy = 5, blur = 0, dur = .22, op = 1 } = {}) => list.map((w, i) => {
    const k = ease(t, t0 + i * step, dur);
    return `<span style="display:inline-block;opacity:${f3(k * op)};transform:translateY(${((1 - k) * dy).toFixed(1)}px);${blur ? `filter:blur(${((1 - k) * blur).toFixed(1)}px);` : ''}">${esc(w)}</span>`;
  }).join(' ');

  const MOD = {
    // Background for the whole talk: warm, slightly dark grade, slow 3–5 % drift per segment, hard zoom steps
    // 1.0 ↔ 1.08 at sentence boundaries (zooms:[{t,s}]), vignette + 10 % film grain.
    luxury_frame(s, t, lt) {
      if (!TL.aroll) return {};
      const keys = (s.zooms && s.zooms.length ? s.zooms : [{ t: s.t0, s: s.zoom ?? 1 }]).slice().sort((a, b) => a.t - b.t);
      let i = 0;
      for (let k = 0; k < keys.length; k++) if (t >= keys[k].t) i = k;
      const seg0 = Math.max(s.t0, keys[i].t), seg1 = keys[i + 1] ? keys[i + 1].t : s.t1;
      const z = (keys[i].s ?? 1) * (1 + (s.drift ?? .04) * prog(t, seg0, Math.max(.5, seg1 - seg0)));
      const ox = (s.pan_x ?? .5) * 100, oy = (s.pan_y ?? .42) * 100;
      const grade = s.grade === false ? '' : ' sepia(.1) saturate(.92) contrast(1.06) brightness(.95)';
      const back = `<div class="full"${cidOf(s)} style="overflow:hidden"><img class="cover" src="${frameSrc(t)}" style="filter:${arollFilter(t)}${grade};transform:scale(${z.toFixed(4)});transform-origin:${ox}% ${oy}%"></div>`
        + (s.vignette === false ? '' : vignette(s.vignette_opacity ?? 1)) + (s.grain === false ? '' : grain(t, s.grain_opacity ?? .1));
      return { back, cover: true };
    },

    // Zoom-blur punch (0.3–0.35 s): scale up to +22 %, blur 14 px, darken 45 % at the middle — on a hero word.
    luxury_zoomblur(s, t, lt) {
      if (!TL.aroll) return {};
      const d = Math.max(.1, s.t1 - s.t0), k = Math.sin(Math.PI * clamp(lt / d)) * (s.strength ?? 1);
      return {
        front: `<div class="full" style="overflow:hidden;background:#000"><img class="cover" src="${frameSrc(t)}" style="filter:${arollFilter(t)} blur(${(14 * k).toFixed(1)}px) brightness(${f3(1 - .45 * k)});transform:scale(${f3(1 + .22 * k)});transform-origin:50% 42%"></div>${vignette()}`,
      };
    },

    // Dip to black: fades to black and back (0.4 s), used when entering / leaving a b-roll.
    luxury_dip(s, t, lt) {
      const d = Math.max(.1, s.t1 - s.t0), k = Math.sin(Math.PI * clamp(lt / d));
      return { front: `<div class="full" style="background:#000;opacity:${f3(k)}"></div>` };
    },

    // Portrait cut-out on paper: B&W person, red disc grows behind the head, red-diamond bullets slide in, the
    // group shrinks, then the title blurs in word by word and the subtitle follows. Full frame, no captions.
    // img = transparent PNG (best). Without img: frozen A-roll frame (TL.aroll.cutouts if present, else soft mask).
    luxury_cutout(s, t, lt) {
      const [W, H] = DIMS();
      const red = RED(s), k = s.size ? s.size / 64 : 1;
      const hasB = (s.bullets || []).length > 0;
      const cx = s.x ?? (hasB ? W / 2 - 95 : W / 2), cy = s.y ?? 520;   // centre of the red disc (= head); shifted left when bullets sit on the right
      const r = s.r ?? 185;
      const at = s.circle_at ?? .5, bAt = s.bullets_at ?? 1.0, shAt = s.shrink_at ?? 2.4, tAt = s.title_at ?? 2.6, sAt = s.subtitle_at ?? 3.3;
      const sc = s.shrink_at === false ? 1 : lerp(1, s.shrink_to ?? .8, ease(lt, shAt, .5));
      const ik = ease(lt, 0, .35), iz = lerp(1.08, 1, ease(lt, 0, .6));
      const ck = ease(lt, at, .45);
      const dOff = !s.img && !cutSrc(s.frame_t ?? s.t0) ? (s.disc_offset ?? 26) : 0;
      let person;
      const pw = s.w ?? 420;
      if (s.img) {
        person = `<img src="${media(s.img, t)}" style="position:absolute;left:${cx - pw / 2}px;top:${cy - (s.head_y ?? 160)}px;width:${pw}px;filter:grayscale(1) contrast(1.05);opacity:${f3(ik)};transform:scale(${f3(iz)});transform-origin:50% 30%">`;
      } else {
        // Frozen speaker frame, scaled so the face lands on the disc; masked to a soft bust that fades at the bottom.
        const ft = s.frame_t ?? s.t0, fs = s.frame_scale ?? .78;
        const fc = s.focus || { x: (TL.face && TL.face.x) || 360, y: faceY() };
        const fw = W * fs, fh = H * fs, left = cx - fc.x * fs, top = cy - fc.y * fs;
        const cut = cutSrc(ft);
        if (cut) {
          const fx = (fc.x / W) * 100, fy = (fc.y / H) * 100, mask = 'linear-gradient(#000 70%,transparent 96%)';
          person = `<img src="${cut}" style="position:absolute;left:${left}px;top:${top}px;width:${fw}px;height:${fh}px;object-fit:cover;
            filter:grayscale(1) contrast(1.12);-webkit-mask-image:${mask};mask-image:${mask};opacity:${f3(ik)};transform:scale(${f3(iz)});transform-origin:${fx}% ${fy}%">`;
        } else {
          // No alpha available: B&W portrait inside a circle, the red disc sits behind it, offset (editorial look).
          const pr = r * .94, ps = s.frame_scale ?? .66;
          person = `<div style="position:absolute;left:${cx - pr}px;top:${cy - pr}px;width:${pr * 2}px;height:${pr * 2}px;border-radius:50%;overflow:hidden;opacity:${f3(ik)};
            transform:scale(${f3(iz)});box-shadow:0 18px 40px rgba(0,0,0,.18)"><img src="${frameSrc(ft)}" style="position:absolute;left:${pr - fc.x * ps}px;top:${pr - (fc.y + 90) * ps}px;
            width:${W * ps}px;height:${H * ps}px;filter:grayscale(1) contrast(1.12) brightness(1.05)"></div>`;
        }
      }
      const bx = (s.bullets_pos && s.bullets_pos.x) ?? cx + r + dOff + 22, by = (s.bullets_pos && s.bullets_pos.y) ?? cy - 40;
      const buls = (s.bullets || []).map((b, i) => {
        const q = ease(lt, bAt + i * .5, .35);
        const it = typeof b === 'object' ? b : { text: b };
        return `<div${cidOf(it)} style="position:absolute;left:${bx}px;top:${by + i * 52 * k}px;display:flex;align-items:center;gap:${10 * k}px;white-space:nowrap;
          color:#1A1A1A;font-weight:600;font-size:${32 * k}px;opacity:${f3(q)};transform:translateX(${((1 - q) * 26).toFixed(1)}px)">
          <i style="display:block;width:${12 * k}px;height:${12 * k}px;flex:0 0 ${12 * k}px;background:${red};transform:rotate(45deg)"></i><span>${esc(it.text)}</span></div>`;
      }).join('');
      const ty = s.title_y ?? cy + r + 210;
      const title = s.title ? `<div style="position:absolute;left:-200px;right:-200px;top:${ty}px;text-align:center;color:#111;font-weight:800;font-size:${72 * k}px;letter-spacing:-.02em;line-height:1">${stagWords(words(s.title), lt, tAt, .22, { dy: 6, blur: 10, dur: .5 })}</div>` : '';
      const sub = s.subtitle ? `<div style="position:absolute;left:-200px;right:-200px;top:${ty + 86 * k}px;text-align:center;color:#333;font-weight:500;font-size:${32 * k}px">${stagWords(words(s.subtitle), lt, sAt, .25, { dy: 6, dur: .3 })}</div>` : '';
      const o = outK(s, t, .25);
      return {
        back: `<div class="full" style="background:${s.bg || C.paper};opacity:${f3(Math.min(1, lt / .12) * o)};font-family:${FONT(s)}">
          <div class="full"${cidOf(s)} style="transform:scale(${f3(sc)});transform-origin:50% 42%">
            <div style="position:absolute;left:${cx - r + dOff}px;top:${cy - r + dOff * .7}px;width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:${red};transform:scale(${f3(ck)})"></div>
            ${person}${buls}${title}${sub}</div></div>`,
        cover: lt > .12 && o > .99, hideCaptions: true,
      };
    },

    // Outlined glass box with an icon, two lines typing in word by word, floats ±4 px. No captions while it shows.
    luxury_callout(s, t, lt) {
      const x = s.x ?? DIMS()[0] / 2, y = s.y ?? chestY(), size = s.size || 38, k = size / 38;
      const pk = ease(lt, 0, .35), o = pk * outK(s, t);
      const fl = Math.sin(lt * 1.6) * 4;
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) translateY(${fl.toFixed(1)}px) scale(${f3(lerp(.6, 1, pk))});opacity:${f3(o)};
          display:flex;align-items:center;gap:${16 * k}px;padding:${14 * k}px ${24 * k}px ${14 * k}px ${16 * k}px;border:2px solid ${s.line || 'rgba(255,255,255,.78)'};border-radius:${18 * k}px;
          background:rgba(0,0,0,.22);backdrop-filter:blur(3px);font-family:${FONT(s)};color:${C.white};white-space:nowrap;text-shadow:0 2px 12px rgba(0,0,0,.45)">
          <div style="width:${64 * k}px;height:${64 * k}px;flex:0 0 ${64 * k}px;display:flex;align-items:center;justify-content:center">${iconHTML(s.icon || 'chest', Math.round(60 * k))}</div>
          <div style="display:flex;flex-direction:column;line-height:1">
            <div style="font-weight:800;font-size:${size}px;letter-spacing:-.015em">${stagWords(words(s.l1 ?? 'bí mật'), lt, s.l1_at ?? .4, .14)}</div>
            ${s.l2 === '' ? '' : `<div style="font-weight:500;font-size:${24 * k}px;margin-top:${5 * k}px">${stagWords(words(s.l2 ?? 'đằng sau thành công'), lt, s.l2_at ?? 1.0, .14, { op: .9 })}</div>`}
          </div></div>`,
        hideCaptions: s.hideCaptions ?? true,
      };
    },

    // Ink background, two maroon discs in opposite corners, white glowing half-arcs drawing round them with a running dot.
    // Captions stay, centred (y 640). Optional text = big centre word (then captions hide).
    luxury_pillars(s, t, lt) {
      const [W, H] = DIMS();
      const discs = s.discs || [{ x: 60, y: 140, r: 300 }, { x: W - 60, y: H - 140, r: 300 }];
      const disc = s.disc || C.maroon;
      let svg = '';
      discs.forEach((d, i) => {
        const dk = ease(lt, .1 + i * .25, .6);
        const ak = ease(lt, .3 + i * .25, 1.4);
        const R = d.r + 8, start = i ? Math.PI / 2 : -Math.PI / 2, ang = start + ak * Math.PI;
        const sx = d.x + R * Math.cos(start), sy = d.y + R * Math.sin(start), ex = d.x + R * Math.cos(ang), ey = d.y + R * Math.sin(ang);
        svg += `<circle cx="${d.x}" cy="${d.y}" r="${f3(d.r * dk)}" fill="${disc}"/>`;
        if (ak > .001) {
          svg += `<path d="M${f3(sx)},${f3(sy)} A${R},${R} 0 0 1 ${f3(ex)},${f3(ey)}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" filter="url(#luxGlow)"/>`
            + `<circle cx="${f3(ex)}" cy="${f3(ey)}" r="9" fill="#fff" filter="url(#luxGlow2)"/>`;
        }
      });
      const tx = s.text ? `<div class="abs"${cidOf(s)} style="left:0;right:0;top:${s.y ?? 640}px;transform:translateY(-50%);text-align:center;font-family:${FONT(s)};font-weight:800;font-size:${s.size || 72}px;letter-spacing:-.025em;color:${C.white}">${stagWords(words(s.text), lt, .5, .2, { dy: 8, blur: 8, dur: .4 })}</div>` : '';
      return {
        back: `<div class="full"${s.text ? '' : cidOf(s)} style="background:${s.bg || C.ink};opacity:${f3(s.fade_out ? outK(s, t, s.fade_out) : 1)}"><svg class="full" viewBox="0 0 ${W} ${H}" style="overflow:visible">
          <defs><filter id="luxGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="luxGlow2" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${svg}</svg>${tx}</div>`,
        cover: true, hideCaptions: s.hideCaptions ?? !!s.text,
      };
    },

    // Red-outlined diamonds in a row on ink (max 3), each pops when its word is spoken (items[i].t or stagger).
    luxury_diamonds(s, t, lt) {
      const [W] = DIMS();
      const items = (s.items || ['sang trọng', 'tối giản']).slice(0, 3).map(it => (typeof it === 'object' ? it : { text: it }));
      const size = s.size || 190, k = size / 150, gap = s.gap ?? 215 * k, y = s.y ?? 560, x = s.x ?? W / 2, red = RED(s);
      const x0 = x - (items.length - 1) * gap / 2;
      const html = items.map((it, i) => {
        const q = ease(t, it.t ?? (s.t0 + .1 + i * (s.stagger ?? .6)), .4);
        return `<div class="abs"${cidOf(it)} style="left:${x0 + i * gap - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;opacity:${f3(q)};transform:scale(${f3(lerp(.4, 1, q))})">
          <div style="position:absolute;inset:${18 * k}px;transform:rotate(45deg);border:2px solid ${red};background:${hexA(red, .22)};box-shadow:0 0 22px ${hexA(red, .45)},inset 0 0 18px ${hexA(red, .3)}"></div>
          <span style="position:relative;max-width:${118 * k}px;text-align:center;line-height:1.05;font-weight:600;font-size:${22 * k}px;color:#fff;text-shadow:0 0 8px rgba(0,0,0,.6)">${esc(it.text)}</span></div>`;
      }).join('');
      return { back: `<div class="full"${cidOf(s)} style="background:${s.bg || C.ink};font-family:${FONT(s)};opacity:${f3(s.fade_out ? outK(s, t, s.fade_out) : 1)}">${html}</div>`, cover: true };
    },

    // Plain black for a short punch line (1–2 s). Without text, captions switch to the airy "wide" layout at y 640.
    luxury_blackout(s, t, lt) {
      const tx = s.text ? `<div class="abs"${cidOf(s)} style="left:40px;right:40px;top:${s.y ?? 640}px;transform:translateY(-50%);text-align:center;font-family:${FONT(s)};font-weight:500;font-size:${s.size || 28}px;word-spacing:.5em;letter-spacing:.02em;color:${C.white}">${stagWords(words(s.text), lt, .1, s.stagger ?? .18, { dy: 6, dur: .2 })}</div>` : '';
      return { back: `<div class="full"${s.text ? '' : cidOf(s)} style="background:${s.bg || C.blackout}"></div>${tx}`, cover: true, hideCaptions: s.hideCaptions ?? !!s.text };
    },

    // B-roll (or the speaker) in B&W with a glowing red rim, two-line labels popping up on both sides.
    // Rim = real outline when TL.aroll.cutouts exist, else a glowing red inset frame. media = b-roll image / sequence.
    luxury_labels(s, t, lt) {
      const [W, H] = DIMS();
      const red = s.rim || C.rim;
      let back = '', cover = false;
      if (s.bg !== false) {
        cover = true;
        const src = s.media ? media(s.media, t) : frameSrc(t);
        const z = 1 + (s.drift ?? .05) * prog(t, s.t0, Math.max(1, s.t1 - s.t0));
        back = `<div class="full" style="overflow:hidden;background:#000"><img class="cover" src="${src}" style="filter:grayscale(1) contrast(1.15) brightness(${s.outline === false ? .8 : .62});transform:scale(${f3(z)});transform-origin:50% 40%"></div>`;
        if (s.outline !== false) {
          const cut = !s.media && cutSrc(t);
          if (cut) back += `<div class="full" style="filter:drop-shadow(0 0 2px ${red}) drop-shadow(0 0 8px ${red}) drop-shadow(0 0 22px ${hexA('#C81E32', .7)});transform:scale(${f3(z)});transform-origin:50% 40%"><img class="cover" src="${cut}" style="filter:grayscale(1) contrast(1.15) brightness(.9)"></div>`;
          else {
            const ins = s.inset ?? 34, pulse = .85 + .15 * Math.sin(lt * 3);
            back += `<div class="abs" style="left:${ins}px;top:${ins}px;right:${ins}px;bottom:${ins}px;border:3px solid ${red};border-radius:${s.radius ?? 6}px;opacity:${f3(ease(lt, .15, .4) * pulse)};
              box-shadow:0 0 6px ${red},0 0 18px ${red},0 0 44px ${hexA('#C81E32', .7)},inset 0 0 10px ${red},inset 0 0 40px ${hexA('#C81E32', .4)}"></div>`;
          }
        }
        back += vignette() + grain(t, .1);
        if (s.dip !== false) back += `<div class="full" style="background:#000;opacity:${f3(1 - prog(lt, .0, .2))}"></div>`;
      }
      const items = (s.items || []).map(it => {
        const q = ease(t, it.t ?? (s.t0 + (it.at ?? .5)), .3);
        const al = it.align || (it.x > W / 2 ? 'r' : 'l');
        const pos = al === 'r' ? `right:${W - it.x}px;text-align:right` : al === 'c' ? `left:${it.x}px;text-align:center;margin-left:-300px;width:600px` : `left:${it.x}px;text-align:left`;
        const sz = it.size || 40;
        return `<div class="abs"${cidOf(it)} style="${pos};top:${it.y ?? 700}px;opacity:${f3(q)};transform:translateY(${((1 - q) * 10).toFixed(1)}px);line-height:.98;white-space:nowrap;text-shadow:0 2px 16px rgba(0,0,0,.75)">
          <div style="font-weight:800;font-size:${sz}px;letter-spacing:-.02em">${esc(it.l1 || '')}</div>${it.l2 ? `<div style="font-weight:500;font-size:${sz * .7}px;opacity:.9;margin-top:2px">${esc(it.l2)}</div>` : ''}</div>`;
      }).join('');
      return { back, front: `<div class="full"${cidOf(s)} style="font-family:${FONT(s)};color:${C.white};opacity:${f3(outK(s, t, .15))}">${items}</div>`, cover };
    },

    // End card: logo word scales in, handle bar (cyan/pink edge shadows) stretches open, CTA fades in. Needs ≥ 1.8 s.
    luxury_outro(s, t, lt) {
      const B = BR(), k = (s.size || 64) / 64;
      const k1 = ease(lt, 0, .4), k2 = ease(lt, .35, .4), k3 = ease(lt, .9, .4);
      const logo = s.logo ?? (B.name || 'TAKI');
      const logoIc = s.icon || (B.logo && !s.logo ? B.logo : '');
      return {
        back: `<div class="full" style="background:${s.bg || C.outro}"></div>`,
        front: `<div class="abs"${cidOf(s)} style="left:0;right:0;top:${s.y ?? DIMS()[1] / 2}px;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:${28 * k}px;font-family:${FONT(s)};color:#fff">
          <div style="display:flex;align-items:center;gap:${16 * k}px;font-weight:900;font-size:${64 * k}px;letter-spacing:-.03em;line-height:1;opacity:${f3(k1)};transform:scale(${f3(lerp(.8, 1, k1))})">${logoIc ? slIcon(logoIc, 64 * k, 'white') : ''}${logo ? `<span>${esc(logo)}</span>` : ''}</div>
          <div style="display:flex;align-items:center;gap:${14 * k}px;padding:${12 * k}px ${18 * k}px;border:3px solid #fff;border-radius:${10 * k}px;background:${s.bg || C.outro};box-shadow:-4px 0 0 #25F4EE,4px 0 0 #FE2C55;opacity:${f3(k2)};transform:scaleX(${f3(lerp(.2, 1, k2))})">
            <svg viewBox="0 0 24 24" width="${30 * k}" height="${30 * k}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
            <span style="font-weight:600;font-size:${30 * k}px;min-width:${260 * k}px;text-align:center">${esc(s.handle ?? (B.handle || '@yourhandle'))}</span></div>
          <div style="font-weight:500;font-size:${26 * k}px;color:rgba(255,255,255,.85);opacity:${f3(k3)}">${esc(s.cta ?? 'Theo dõi để xem phần tiếp')}</div></div>`,
        cover: true, hideCaptions: true,
      };
    },
  };
  Object.assign(MODULES, MOD);

  // ---------- caption style: white Inter, words bounce in and stay; numbers "big", hl words "hero", the rest "sm" ----------
  // Word fields: hl (→ hero), cls ('big'|'hero'|'sm'|'muted'). Chunk fields: layout ('row'|'stack'|'wide'), x, y, size, font, color, weight.
  const CAP_Y = { luxury_pillars: () => 640, luxury_blackout: () => 640, luxury_diamonds: s => (s.y ?? 560) + 1.2 * (s.size || 190) };
  CAPTION_STYLES.luxury = (c, t) => {
    const [W] = DIMS();
    let y = c.y, layout = c.layout;
    for (const s of TL.scenes || []) {
      if (s.hidden || t < s.t0 || t >= s.t1 || !String(s.type).startsWith('luxury_')) continue;
      if (y == null && s.cap_y != null) y = s.cap_y;
      else if (y == null && CAP_Y[s.type]) y = CAP_Y[s.type](s);
      if (s.type === 'luxury_blackout' && !s.text && !layout) layout = 'wide';
    }
    if (y == null) y = chestY();
    const f = (c.size || 38) / 38;
    const cls = w => w.cls || (w.hl ? 'hero' : /\d/.test(w.w) ? 'big' : '');
    const SZ = { '': [38, 600, '-.005em', 1.05], sm: [24, 500, '0', 1.1], big: [104, 700, '-.03em', .95], hero: [72, 800, '-.025em', .95], muted: [38, 600, '-.005em', 1.05] };
    const span = (w, kind) => {
      const q = reveal ? prog(t, w.s - .02, .16) : 1, k = E.outCubic(q);
      if (reveal && t < w.s - .02) return ''; // not spoken yet: takes no room, so the visible words stay centred
      const over = 1 + .08 * Math.sin(q * Math.PI);
      const [px, wt, ls, lh] = layout === 'wide' ? [28, 500, '.02em', 1.1] : SZ[kind] || SZ[''];
      const op = (kind === 'sm' ? .9 : kind === 'muted' ? .55 : 1) * k;
      return `<span style="display:inline-block;opacity:${f3(op)};transform:translateY(${((1 - k) * 8).toFixed(1)}px) scale(${f3(q < 1 ? lerp(.92, over, k) : 1)});
        font-size:${(px * f).toFixed(1)}px;font-weight:${kind === '' && c.weight ? c.weight : wt};letter-spacing:${ls};line-height:${lh}${layout === 'wide' ? ';margin:0 .35em' : ''}${kind === 'hero' && c.hl_color ? `;color:${c.hl_color}` : ''}">${esc(w.w)}</span>`;
    };
    const ws = c.words || [];
    const reveal = TL.caption_reveal !== false;
    const hasKey = ws.some(w => ['big', 'hero'].includes(cls(w)));
    let body;
    if (layout !== 'wide' && layout !== 'row' && hasKey) {
      // stack: small words above / below the key word, key word on its own line (sm + HERO + sm).
      const rows = [];
      let cur = [];
      for (const w of ws) {
        const kd = cls(w);
        const key = kd === 'big' || kd === 'hero';
        // consecutive key words share one line ("khủng khiếp"), small words gather above / below
        if (!cur.length || cur.key !== key) { if (cur.length) rows.push(cur); cur = []; cur.key = key; }
        cur.push([w, key ? kd : kd || 'sm']);
      }
      if (cur.length) rows.push(cur);
      body = rows.map(r => `<div style="display:flex;justify-content:center;align-items:baseline;column-gap:.3em;flex-wrap:wrap">${r.map(([w, kd]) => span(w, kd)).join('')}</div>`).join('');
      body = `<div style="display:flex;flex-direction:column;align-items:center;row-gap:${(2 * f).toFixed(1)}px">${body}</div>`;
    } else {
      body = `<div style="display:flex;flex-wrap:wrap;justify-content:center;align-items:baseline;column-gap:.32em;row-gap:2px">${ws.map(w => span(w, layout === 'wide' ? '' : (cls(w) === 'big' || cls(w) === 'hero' ? cls(w) : cls(w) || ''))).join('')}</div>`;
    }
    const x = c.x ?? W / 2;
    return `<div id="cap" class="luxury"${cidOf(c)} style="position:absolute;left:${x - W / 2 + 40}px;right:${W / 2 - x + 40}px;top:${y}px;transform:translateY(-50%);
      font-family:${c.font || FONT()};color:${c.color || C.white};text-align:center;font-size:${(38 * f).toFixed(1)}px;
      text-shadow:0 2px 14px rgba(0,0,0,.65),0 0 2px rgba(0,0,0,.5)">${body}</div>`;
  };

  // ---------- Studio metadata ----------
  const items = [
    { type: 'luxury_frame', label: 'Nền grade ấm + drift + hạt film', make: T => ({ type: 'luxury_frame', t0: T, t1: T + 10, zooms: [{ t: T, s: 1 }, { t: T + 4, s: 1.08 }], drift: .04 }) },
    { type: 'luxury_zoomblur', label: 'Zoom-blur (nhấn từ khoá)', make: T => ({ type: 'luxury_zoomblur', t0: T, t1: T + .35 }) },
    { type: 'luxury_dip', label: 'Dip đen', make: T => ({ type: 'luxury_dip', t0: T, t1: T + .4 }) },
    { type: 'luxury_cutout', label: 'Chân dung cắt nền + vòng đỏ', make: T => ({ type: 'luxury_cutout', t0: T, t1: T + 5, bullets: ['tối giản', 'sang trọng'], title: 'Tên nhân vật', subtitle: 'một dòng giới thiệu' }) },
    { type: 'luxury_callout', label: 'Hộp chú thích có icon', make: T => ({ type: 'luxury_callout', t0: T, t1: T + 4, icon: 'chest', l1: 'bí mật', l2: 'đằng sau phong cách' }) },
    { type: 'luxury_pillars', label: 'Nền đen + đĩa + cung trắng', make: T => ({ type: 'luxury_pillars', t0: T, t1: T + 2.5 }) },
    { type: 'luxury_diamonds', label: 'Hình thoi viền đỏ', make: T => ({ type: 'luxury_diamonds', t0: T, t1: T + 2, items: ['sang trọng', 'tối giản'], stagger: .7 }) },
    { type: 'luxury_blackout', label: 'Nền đen chỉ chữ', make: T => ({ type: 'luxury_blackout', t0: T, t1: T + 1.5 }) },
    { type: 'luxury_labels', label: 'B-roll viền đỏ + nhãn 2 bên', make: T => ({ type: 'luxury_labels', t0: T, t1: T + 4, items: [{ x: 70, y: 700, l1: 'ý tưởng', l2: 'sáng tạo', t: T + .5 }, { x: 650, y: 700, l1: 'hình ảnh', l2: 'cao cấp', t: T + 1.6 }] }) },
    { type: 'luxury_outro', label: 'Thẻ kết (logo + handle)', make: T => ({ type: 'luxury_outro', t0: T, t1: T + 2.2, cta: 'Theo dõi để xem phần tiếp' }) },
  ];

  const recipe = ctx => {
    const dur = ctx.dur, caps = ctx.captions || [];
    const end = Math.max(2, dur - 2.2);
    const scenes = [];
    // Zoom steps 1.0 ↔ 1.08 at sentence-ish boundaries (every other caption chunk starting after a pause).
    const zooms = [{ t: 0, s: 1 }];
    let zi = 1;
    for (let i = 1; i < caps.length; i++) {
      if (caps[i].t0 - zooms[zooms.length - 1].t < 3.5) continue;
      if (caps[i].t0 >= end - 1) break;
      zooms.push({ t: caps[i].t0, s: zi++ % 2 ? 1.08 : 1 });
    }
    scenes.push({ type: 'luxury_frame', t0: 0, t1: end, zooms, drift: .04 });
    scenes.push({ type: 'luxury_zoomblur', t0: 0, t1: .35 });
    const used = [];
    const free = (a, b) => a > 2 && b < end - .3 && used.every(([x, y]) => b + 1.2 < x || a > y + 1.2);
    const put = (sc) => { if (free(sc.t0, sc.t1)) { scenes.push(sc); used.push([sc.t0, sc.t1]); return true; } return false; };
    const tSec = findWord(caps, ['bí mật', 'công thức', 'chìa khoá', 'chìa khóa', 'bí quyết', 'lưu ý', 'quan trọng', 'sự thật']);
    if (tSec != null) put({ type: 'luxury_callout', t0: tSec - .2, t1: tSec + 3.8, icon: 'key', l1: 'bí quyết', l2: 'điều ít ai nói', l1_at: .3, l2_at: .9 });
    const tList = findWord(caps, ['hai yếu tố', 'ba yếu tố', 'trụ cột', 'hai điều', 'ba điều', 'hai cách', 'ba cách']);
    if (tList != null) {
      put({ type: 'luxury_pillars', t0: tList - .1, t1: tList + 2.2 });
    }
    const tShock = findWord(caps, ['đáng sợ', 'khủng khiếp', 'shock', 'gây shock', 'sốc', 'bất ngờ']);
    if (tShock != null) put({ type: 'luxury_blackout', t0: tShock - .1, t1: tShock + 1.3 });
    const tNum = capWords(caps).find(w => /\d/.test(w.w) && w.s > 2.5 && w.s < end - 2);
    if (tNum) put({ type: 'luxury_zoomblur', t0: tNum.s - .05, t1: tNum.s + .3 });
    scenes.push({ type: 'luxury_dip', t0: end - .2, t1: end + .2 });
    scenes.push({ type: 'luxury_outro', t0: end, t1: dur, cta: 'Theo dõi để xem phần tiếp' });
    const r2 = v => Math.round(v * 100) / 100;
    scenes.forEach(sc => { sc.t0 = r2(Math.max(0, sc.t0)); sc.t1 = r2(sc.t1); });
    return { caption_style: P, music: 'corporate', scenes };
  };

  PACKS.push({
    id: P, name: 'Tối giản sang trọng', icon: '🖤', caption: P,
    desc: 'Minimal luxury kiểu Iman Gadzhi: phụ đề trắng nảy từng chữ, số khổng lồ, chân dung đen trắng + vòng đỏ, hộp icon, nền đen cung trắng, zoom-blur',
    items, recipe,
  });
})();
