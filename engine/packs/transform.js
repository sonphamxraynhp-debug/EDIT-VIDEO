// Pack "transform" — before/after transformation videos (makeover, nội thất, làm đẹp, giảm cân, chỉnh màu, dọn dẹp).
// Look: dark plum cards, cool grey for TRƯỚC, hot pink → gold gradient for SAU, white flash + sparkles on the reveal,
// Lexend numbers, Montserrat 900 tags. Modules tf_*: slider (wipe), flash_reveal, timer (Ngày 1 → Ngày 30 ring),
// grid (progression gallery), stats (72kg → 64kg), stamp (KẾT QUẢ / WOW). Caption style "transform". Doc: references/pack-transform.md.
(() => {
  const P = 'transform';

  // ---------- palette (TL.brand overrides: primary → after colour, accent → gold, dark → card, good, bad, light, font, disp) ----------
  const C = (s = {}) => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return {
      card: s.bg || b.dark || '#120D18',
      aft: s.color || b.primary || '#FF3D8B',
      gold: s.gold || b.accent || '#FFC23D',
      bef: s.before_color || '#8E97A8',
      good: s.good || b.good || '#21D19F',
      bad: s.bad || b.bad || '#FF5A5F',
      text: b.light || '#FFFFFF',
      muted: b.muted || '#ABA4B8',
      font: b.font || "'Be Vietnam Pro',sans-serif",
      disp: s.font || b.disp || "'Montserrat','Be Vietnam Pro',sans-serif",
      num: "'Lexend','Montserrat',sans-serif",
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
  const f = (v, d = 1) => (+v).toFixed(d);
  const grad = c => `linear-gradient(120deg,${c.aft},${c.gold})`;
  const outOp = (s, t) => fadeIO(t, s.t0, s.keep ? null : s.t1, .15, .3);
  // Look progression for the speaker when no before/after media is given: k = 0 (dull) … 1 (vivid).
  const FB = k => `grayscale(${f(lerp(.85, 0, k), 2)}) saturate(${f(lerp(.7, 1.32, k), 2)}) brightness(${f(lerp(.7, 1.06, k), 2)}) contrast(${f(lerp(.85, 1.07, k), 2)})`;
  // Lazy: lerp/clamp come from engine.js, which loads after the packs.
  const DEF = k => ({ speaker: true, filter: FB(k) });

  // ---------- sources (same contract as the split pack) ----------
  function speakerBox(t, w, h, o = {}) {
    const [W, H] = DIMS(), fc = TL.face || { x: W / 2, y: H * .4 };
    const fx = o.fx ?? fc.x, fy = o.fy ?? fc.y;
    const k = Math.max(w / W, h / H) * (o.zoom || 1);
    const ox = clamp(w / 2 - fx * k, w - W * k, 0), oy = clamp(h * (o.fpy ?? .4) - fy * k, h - H * k, 0);
    return `<div style="position:absolute;left:${f(ox)}px;top:${f(oy)}px;width:${W}px;height:${H}px;transform:scale(${k.toFixed(4)});transform-origin:0 0">${arollImg(t, o.filter || '')}</div>`;
  }
  // 'speaker' | {speaker:true, filter, zoom, fx, fy} | "img.jpg" | {seq,fps,count,t0} | {media, fit, pos, filter} | {color}
  function srcHTML(src, t, w, h) {
    if (src == null || src === 'speaker' || src.speaker) return speakerBox(t, w, h, typeof src === 'object' && src ? src : {});
    if (typeof src === 'string' || src.seq || src.src) src = { media: src };
    if (src.color) return `<div class="full" style="background:${src.color}"></div>`;
    return `<img src="${media(src.media, t)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${src.fit || 'cover'};object-position:${src.pos || '50% 40%'};filter:${src.filter || 'none'}">`;
  }

  // ---------- shared pieces ----------
  // Card root centred at (x, y), size = %. Full-frame variants skip this.
  function root(s, inner, o = {}) {
    const [W, H] = DIMS();
    const x = s.x ?? W / 2, y = s.y ?? Math.round(H * (o.fy ?? (VERT() ? .39 : .45)));
    const k = (s.size ?? 100) / 100;
    return `<div class="abs"${cidOf(s)} style="left:${f(x)}px;top:${f(y)}px;transform:translate(-50%,-50%) scale(${f(k, 3)}) ${o.tr || ''};transform-origin:50% 50%;opacity:${f(o.op ?? 1, 3)}">${inner}</div>`;
  }
  const cardCSS = c => `background:linear-gradient(180deg,${hexA(c.card, .94)},${hexA(c.card, .9)});border:1.5px solid rgba(255,255,255,.1);border-radius:28px;
    box-shadow:0 26px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-family:${c.font};color:${c.text}`;
  const SPARK4 = (col, sz) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}"><path d="M12 0C12.9 7.6 16.4 11.1 24 12 16.4 12.9 12.9 16.4 12 24 11.1 16.4 7.6 12.9 0 12 7.6 11.1 11.1 7.6 12 0z" fill="${col}"/></svg>`;
  // TRƯỚC / SAU tag. kind: 'before' | 'after'
  function tag(c, text, kind, fs = 22) {
    const after = kind === 'after';
    return `<div style="display:inline-flex;align-items:center;gap:8px;padding:7px 16px 7px 12px;border-radius:999px;white-space:nowrap;
      background:${after ? grad(c) : 'rgba(18,18,24,.8)'};border:1.5px solid ${after ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.18)'};color:${after ? '#fff' : '#E4E7EE'};
      box-shadow:0 8px 20px rgba(0,0,0,.38)${after ? `,0 0 22px ${hexA(c.aft, .5)}` : ''};backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
      font-family:${c.disp};font-weight:900;font-size:${fs}px;line-height:1.3;letter-spacing:.1em;text-transform:uppercase">
      ${after ? SPARK4('#fff', Math.round(fs * .85)) : `<span style="width:${Math.round(fs * .5)}px;height:${Math.round(fs * .5)}px;border-radius:50%;background:${c.bef}"></span>`}${esc(text)}</div>`;
  }
  const head = (c, text) => !text ? '' : `<div style="display:flex;align-items:center;gap:10px;font-family:${c.disp};font-weight:900;font-size:21px;line-height:1.3;letter-spacing:.14em;
    color:${c.gold};text-transform:uppercase;white-space:nowrap">${SPARK4(c.gold, 20)}${esc(text)}</div>`;
  // Frame geometry: 'card' (default) or 'full'.
  function frameBox(s) {
    const [W, H] = DIMS(), vert = VERT();
    if ((s.frame || 'card') === 'full') return { full: true, w: W, h: H };
    return { full: false, w: s.w || (vert ? 600 : 880), h: s.h || (vert ? 700 : 520) };
  }
  function framed(s, t, lt, fb, inner, o = {}) {
    const c = C(s), op = outOp(s, t);
    if (fb.full) return { back: `<div class="full"${cidOf(s)} style="opacity:${f(op * clamp(prog(lt, 0, .3)), 3)};background:${c.card}">${inner}</div>` };
    const ke = E.outBack(prog(lt, 0, .5), 1.5);
    const glow = o.glow ?? 0;
    const card = `<div style="position:relative;width:${fb.w}px;height:${fb.h}px;border-radius:30px;overflow:hidden;background:${c.card};
      box-shadow:0 0 0 3px rgba(255,255,255,.92),0 0 0 ${f(3 + 5 * glow)}px ${hexA(c.aft, .55 * glow)},0 0 ${f(60 * glow)}px ${hexA(c.gold, .45 * glow)},0 30px 70px rgba(0,0,0,.6)">${inner}</div>`;
    const back = (s.backdrop ?? 'dim') === 'dim' ? `<div class="full" style="opacity:${f(op * clamp(prog(lt, 0, .35)), 3)};background:${hexA(c.card, .62)};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)"></div>` : '';
    return { back, front: root(s, card, { op: op * clamp(ke * 2), tr: `translateY(${f((1 - clamp(ke)) * 60)}px) rotate(${f((1 - clamp(ke)) * -3, 2)}deg) scale(${f(lerp(.86, 1, clamp(ke, 0, 1.1)), 3)})` }) };
  }
  // Tag inset: inside the safe zone when full-frame vertical.
  const tagTop = fb => (fb.full ? (VERT() ? 140 : 26) : 20);

  const MOD = {
    // 1. Before/after slider: vertical wipe line with a handle; before on the left, after on the right.
    // { before, after (any source; default = speaker dull → vivid), frame:'card'|'full', keys:[{t, v}] (v = line 0…1 from left),
    //   before_label:'TRƯỚC', after_label:'SAU', handle_y:.5, w, h, x, y, size, backdrop:'dim'|'none' }
    tf_slider(s, t, lt) {
      const c = C(s), fb = frameBox(s), { w, h } = fb, d = s.t1 - s.t0;
      const keys = s.keys && s.keys.length ? s.keys : [{ t: s.t0 + .45, v: .94 }, { t: s.t0 + Math.min(1.75, d * .45), v: .06, dur: Math.min(1.15, d * .3) },
        { t: s.t0 + Math.min(2.55, d * .7), v: .5, dur: Math.min(.7, d * .2) }];
      const p = clamp(keyAt(keys, t, 'v', .5) + (lt > 2.6 ? Math.sin((lt - 2.6) * 1.6) * .015 : 0), 0, 1), lx = p * w;
      const before = `<div class="full">${srcHTML(s.before || DEF(0), t, w, h)}</div>`;
      const after = `<div class="full" style="clip-path:inset(0 0 0 ${f(lx)}px)">${srcHTML(s.after || DEF(1), t, w, h)}</div>`;
      const hy = h * (s.handle_y ?? .5), hd = 70;
      const pulse = (lt % 1.1) / 1.1;
      const line = `<div class="abs" style="left:${f(lx - 2)}px;top:0;width:4px;height:${h}px;background:#fff;box-shadow:0 0 14px rgba(255,255,255,.9),0 0 34px ${hexA(c.aft, .6)}"></div>
        <div class="abs" style="left:${f(lx - hd / 2)}px;top:${f(hy - hd / 2)}px;width:${hd}px;height:${hd}px;border-radius:50%;border:3px solid #fff;opacity:${f(1 - pulse, 3)};transform:scale(${f(1 + pulse * .6, 3)})"></div>
        <div class="abs" style="left:${f(lx - hd / 2)}px;top:${f(hy - hd / 2)}px;width:${hd}px;height:${hd}px;border-radius:50%;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.45),0 0 0 6px ${hexA(c.aft, .35)};
          display:flex;align-items:center;justify-content:center">
          <svg viewBox="0 0 40 24" width="40" height="24"><path d="M13 4L5 12l8 8M27 4l8 8-8 8" fill="none" stroke="${c.card}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
      const tt = tagTop(fb), fs = fb.full ? 24 : 21;
      const kb = E.outBack(prog(lt, .25, .35), 2);
      const tb = `<div class="abs" style="left:20px;top:${tt}px;opacity:${f(clamp((lx - 190) / 40) * clamp(kb), 3)};transform:scale(${f(clamp(kb, 0, 1.2), 3)});transform-origin:0 50%">${tag(c, s.before_label ?? 'TRƯỚC', 'before', fs)}</div>`;
      const ta = `<div class="abs" style="right:20px;top:${tt}px;opacity:${f(clamp((w - lx - 160) / 40) * clamp(kb), 3)};transform:scale(${f(clamp(kb, 0, 1.2), 3)});transform-origin:100% 50%">${tag(c, s.after_label ?? 'SAU', 'after', fs)}</div>`;
      return framed(s, t, lt, fb, before + after + line + tb + ta, { glow: clamp(1 - p * 1.6) * .8 });
    },

    // 2. Flash reveal: before (slow push-in) → white flash + sparkles at `flash` → after (punch-in, glow frame, SAU tag).
    // { before, after, flash (abs time; default t0 + 1.3), frame:'card'|'full', before_label, after_label, sparkles:10 }
    tf_flash_reveal(s, t, lt) {
      const c = C(s), fb = frameBox(s), { w, h } = fb, d = s.t1 - s.t0;
      const tf = s.flash ?? s.t0 + Math.min(1.3, d * .42), a = t - tf;
      let inner;
      if (a < 0) {
        const z = 1 + .05 * E.inOutSine(clamp(lt / Math.max(.5, tf - s.t0)));
        inner = `<div class="full" style="transform:scale(${f(z, 4)})">${srcHTML(s.before || DEF(0), t, w, h)}</div>`;
      } else {
        const z = lerp(1.14, 1, E.outCubic(prog(a, 0, .7)));
        inner = `<div class="full" style="transform:scale(${f(z, 4)});filter:brightness(${f(lerp(1.35, 1, E.outCubic(prog(a, 0, .6))), 3)})">${srcHTML(s.after || DEF(1), t, w, h)}</div>`;
      }
      const fl = a < 0 ? E.inCubic(clamp((a + .14) / .14)) : 1 - E.outCubic(prog(a, 0, .55));
      const flash = fl > .001 ? `<div class="full" style="background:radial-gradient(circle at 50% 45%,#fff 0,#fff 45%,${hexA(c.gold, .9)} 100%);opacity:${f(fl, 3)}"></div>` : '';
      const n = s.sparkles ?? 10;
      const sparks = a > 0 && a < 1.4 ? Array.from({ length: n }, (_, i) => {
        const st = i * .05, k = clamp((a - st) / .9);
        if (k <= 0 || k >= 1) return '';
        const px = (.1 + rnd(i * 7 + 1) * .8) * w, py = (.1 + rnd(i * 7 + 2) * .75) * h, sz = 22 + rnd(i * 7 + 3) * 34;
        const sc = Math.sin(Math.PI * k), col = i % 3 === 0 ? c.gold : i % 3 === 1 ? '#fff' : c.aft;
        return `<div class="abs" style="left:${f(px - sz / 2)}px;top:${f(py - sz / 2)}px;transform:scale(${f(sc, 3)}) rotate(${f(k * 90)}deg);filter:drop-shadow(0 0 8px ${col})">${SPARK4(col, f(sz, 0))}</div>`;
      }).join('') : '';
      const ring = a > 0 && a < .8 ? `<div class="abs" style="left:${f(w / 2)}px;top:${f(h * .45)}px;width:${f(lerp(60, w * 1.3, E.outCubic(a / .8)))}px;height:${f(lerp(60, w * 1.3, E.outCubic(a / .8)))}px;
        transform:translate(-50%,-50%);border-radius:50%;border:${f(lerp(14, 1, a / .8))}px solid ${hexA(c.gold, .9)};opacity:${f(1 - a / .8, 3)}"></div>` : '';
      const tt = tagTop(fb), fs = fb.full ? 24 : 21;
      const kb = E.outBack(prog(lt, .2, .35), 2), ka = E.outBack(prog(a, .25, .4), 2.4);
      const tb = a < 0 ? `<div class="abs" style="left:20px;top:${tt}px;transform:scale(${f(clamp(kb, 0, 1.2), 3)});transform-origin:0 50%;opacity:${f(clamp(kb), 3)}">${tag(c, s.before_label ?? 'TRƯỚC', 'before', fs)}</div>` : '';
      const ta = a > 0 ? `<div class="abs" style="right:20px;top:${tt}px;transform:scale(${f(clamp(ka, 0, 1.3), 3)});transform-origin:100% 50%;opacity:${f(clamp(ka * 2), 3)}">${tag(c, s.after_label ?? 'SAU', 'after', fs)}</div>` : '';
      return framed(s, t, lt, fb, inner + ring + sparks + flash + tb + ta, { glow: a > 0 ? clamp(a / .4) * (.6 + .25 * Math.sin(a * 4)) : 0 });
    },

    // 3. Timer: progress ring + counter (Ngày 1 → Ngày 30). { from:1, to:30, unit:'Ngày', title, count (s), from_label, to_label, x, y, size }
    tf_timer(s, t, lt) {
      const c = C(s), op = outOp(s, t), d = s.t1 - s.t0;
      const from = s.from ?? 1, to = s.to ?? 30, unit = s.unit ?? 'Ngày';
      const ke = E.outBack(prog(lt, 0, .45), 1.6), kc = E.inOutSine(prog(lt, .4, s.count ?? Math.max(1.2, d - 1.4)));
      const v = Math.round(lerp(from, to, kc)), done = kc >= 1;
      const R = 96, S = 236, gid = 'tfrg' + String(c.aft + c.gold).replace(/[^0-9a-z]/gi, '');
      const ang = -90 + 360 * kc, hx = S / 2 + R * Math.cos(ang * Math.PI / 180), hy = S / 2 + R * Math.sin(ang * Math.PI / 180);
      const kd = E.outBack(prog(lt, .4 + (s.count ?? Math.max(1.2, d - 1.4)), .4), 2.6);
      const ring = `<div style="position:relative;width:${S}px;height:${S}px;margin:0 auto">
        <svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" style="position:absolute;inset:0;overflow:visible;filter:drop-shadow(0 0 ${done ? 18 : 10}px ${hexA(c.aft, .55)})">
          <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.aft}"/><stop offset="1" stop-color="${c.gold}"/></linearGradient></defs>
          <circle cx="${S / 2}" cy="${S / 2}" r="${R}" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="18"/>
          ${Array.from({ length: 30 }, (_, i) => { const a2 = i * 12 * Math.PI / 180; return `<line x1="${f(S / 2 + (R + 17) * Math.cos(a2))}" y1="${f(S / 2 + (R + 17) * Math.sin(a2))}" x2="${f(S / 2 + (R + 22) * Math.cos(a2))}" y2="${f(S / 2 + (R + 22) * Math.sin(a2))}" stroke="rgba(255,255,255,.22)" stroke-width="2"/>`; }).join('')}
          <circle cx="${S / 2}" cy="${S / 2}" r="${R}" fill="none" stroke="url(#${gid})" stroke-width="18" stroke-linecap="round" pathLength="1" stroke-dasharray="1"
            stroke-dashoffset="${f(1 - Math.max(.001, kc), 4)}" transform="rotate(-90 ${S / 2} ${S / 2})"/>
          <circle cx="${f(hx)}" cy="${f(hy)}" r="13" fill="#fff" stroke="${c.gold}" stroke-width="4"/></svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-family:${c.disp};font-weight:900;font-size:20px;line-height:1.3;letter-spacing:.2em;color:${c.muted};text-transform:uppercase">${esc(unit)}</div>
          <div style="font-family:${c.num};font-weight:900;font-size:${String(v).length > 2 ? 72 : 88}px;line-height:1.05;color:#fff;letter-spacing:-.03em">${v}</div></div>
        ${done ? `<div style="position:absolute;right:6px;top:10px;width:52px;height:52px;border-radius:50%;background:${c.good};display:flex;align-items:center;justify-content:center;
          transform:scale(${f(clamp(kd, 0, 1.4), 3)});box-shadow:0 0 0 5px ${c.card},0 0 20px ${hexA(c.good, .6)}"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 12.5l4.3 4.3L19 7.2" fill="none" stroke="#0B0B0C" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>` : ''}</div>`;
      const fl = s.from_label ?? `${unit} ${from}`, tl = s.to_label ?? `${unit} ${to}`;
      const kr = E.outCubic(prog(lt, .3, .4));
      const row = `<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px;opacity:${f(kr, 3)};transform:translateY(${f((1 - kr) * 14)}px)">
        <span style="padding:6px 16px;border-radius:999px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.16);font-family:${c.disp};font-weight:800;font-size:22px;line-height:1.3;color:#E4E7EE;white-space:nowrap">${esc(fl)}</span>
        <svg viewBox="0 0 48 20" width="48" height="20"><path d="M2 10h40M34 3l8 7-8 7" fill="none" stroke="${c.gold}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"
          pathLength="1" stroke-dasharray="1" stroke-dashoffset="${f(1 - kc, 3)}"/></svg>
        <span style="padding:6px 16px;border-radius:999px;background:${done ? grad(c) : 'rgba(255,255,255,.04)'};border:1.5px solid ${done ? 'rgba(255,255,255,.35)' : hexA(c.aft, .5)};
          font-family:${c.disp};font-weight:900;font-size:22px;line-height:1.3;color:#fff;white-space:nowrap">${esc(tl)}</span></div>`;
      const body = `<div style="${cardCSS(c)};width:${s.w || 440}px;padding:24px 26px 26px;text-align:center">
        <div style="display:flex;justify-content:center;margin-bottom:14px">${head(c, s.title ?? 'Hành trình thay đổi')}</div>${ring}${row}</div>`;
      return { front: root(s, body, { op, tr: `translateY(${f((1 - clamp(ke)) * 50)}px) scale(${f(lerp(.85, 1, clamp(ke, 0, 1.1)), 3)})` }) };
    },

    // 4. Progression grid: 2×2 or 1×3 gallery, cells pop in order with a flash; last cell gets the gradient frame + KẾT QUẢ badge.
    // { items:[{media|src, label, t, cid}], cols, title, final_label:'KẾT QUẢ', stagger:.45, w, cell_h }
    tf_grid(s, t, lt) {
      const c = C(s), op = outOp(s, t), vert = VERT();
      const items = s.items && s.items.length ? s.items : ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4'].map(label => ({ label }));
      const n = items.length, cols = s.cols || (n === 4 ? 2 : Math.min(n, 3));
      const Wt = s.w || (vert ? (cols >= 3 ? 650 : 600) : (cols >= 3 ? 980 : 640)), gap = 14;
      const cw = (Wt - gap * (cols - 1)) / cols, ch = s.cell_h || (vert ? cw * (cols >= 3 ? 1.5 : 1.12) : cw * (cols >= 3 ? .78 : .62));
      const ke = E.outCubic(prog(lt, 0, .35));
      const cells = items.map((it, i) => {
        const ti = it.t ?? s.t0 + .25 + i * (s.stagger ?? .45), k = E.outBack(prog(t, ti, .45), 1.8), fl = 1 - clamp((t - ti) / .35);
        const last = i === n - 1, kl = E.outBack(prog(t, ti + .3, .4), 2.4);
        const src = it.media || it.src ? (it.src || { media: it.media }) : { speaker: true, filter: FB(n > 1 ? i / (n - 1) : 1) };
        const lab = it.label ? `<div style="position:absolute;left:10px;bottom:10px">${tag(c, it.label, last ? 'after' : 'before', cols >= 3 ? 16 : 18)}</div>` : '';
        const num = `<div style="position:absolute;left:10px;top:10px;width:36px;height:36px;border-radius:50%;background:${last ? '#fff' : 'rgba(10,10,14,.75)'};border:1.5px solid rgba(255,255,255,.3);
          display:flex;align-items:center;justify-content:center;font-family:${c.num};font-weight:800;font-size:18px;line-height:1;color:${last ? c.aft : '#fff'}">${i + 1}</div>`;
        const badge = last && t >= ti + .3 ? `<div style="position:absolute;right:-8px;top:-14px;transform:rotate(6deg) scale(${f(clamp(kl, 0, 1.4), 3)});transform-origin:100% 0;padding:5px 14px;border-radius:999px;background:${c.gold};color:#1A1020;
          font-family:${c.disp};font-weight:900;font-size:${cols >= 3 ? 15 : 17}px;line-height:1.3;letter-spacing:.06em;white-space:nowrap;box-shadow:0 6px 16px rgba(0,0,0,.4)">${esc(s.final_label ?? 'KẾT QUẢ')}</div>` : '';
        if (t < ti) return `<div style="position:relative;width:${f(cw)}px;height:${f(ch)}px;border-radius:20px;background:rgba(255,255,255,.04);border:2px dashed rgba(255,255,255,.14)"></div>`;
        return `<div${cidOf(it)} style="position:relative;width:${f(cw)}px;height:${f(ch)}px;transform:scale(${f(lerp(.7, 1, clamp(k, 0, 1.1)), 3)});opacity:${f(clamp(k * 2), 3)}">
          <div style="position:absolute;inset:0;border-radius:20px;overflow:hidden;background:#000;box-shadow:${last ? `0 0 0 3px #fff,0 0 0 7px ${hexA(c.aft, .7)},0 0 34px ${hexA(c.gold, .5)}` : '0 0 0 2px rgba(255,255,255,.18)'},0 14px 30px rgba(0,0,0,.5)">
            ${srcHTML(src, t, cw, ch)}${fl > 0 ? `<div class="full" style="background:#fff;opacity:${f(fl * .85, 3)}"></div>` : ''}${num}${lab}</div>${badge}</div>`;
      }).join('');
      const body = `<div style="width:${Wt}px">${s.title ? `<div style="display:flex;justify-content:center;margin-bottom:14px">${head(c, s.title)}</div>` : ''}
        <div style="display:grid;grid-template-columns:repeat(${cols},${f(cw)}px);gap:${gap}px">${cells}</div></div>`;
      const back = (s.backdrop ?? 'dim') === 'dim' ? `<div class="full" style="opacity:${f(op * ke, 3)};background:${hexA(c.card, .72)};backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)"></div>` : '';
      return { back, front: root(s, body, { op, tr: `translateY(${f((1 - ke) * 30)}px)` }) };
    },

    // 5. Stats before → after: grey old value, drawing arrow, new value counting, coloured delta chip.
    // { title, rows:[{label, from, to, unit, better:'down'|'up', dec, t}], w }
    tf_stats(s, t, lt) {
      const c = C(s), op = outOp(s, t), ke = E.outCubic(prog(lt, 0, .35));
      const rows = s.rows && s.rows.length ? s.rows : [{ label: 'Cân nặng', from: 72, to: 64, unit: 'kg', better: 'down' }];
      const fmt = (v, dec) => (+v).toFixed(dec).replace('.', ',');
      const html = rows.map((r, i) => {
        const ti = r.t ?? s.t0 + .3 + i * (s.stagger ?? .55), ka = E.outCubic(prog(t, ti, .3)), kw = E.inOutSine(prog(t, ti + .25, .45)), kc = E.outCubic(prog(t, ti + .55, .9));
        const kd = E.outBack(prog(t, ti + 1.35, .35), 2.6);
        const from = +r.from || 0, to = +r.to || 0, dec = r.dec ?? (from % 1 || to % 1 ? 1 : 0), up = to >= from;
        const better = r.better || (up ? 'up' : 'down'), good = (better === 'up') === up;
        const col = good ? c.good : c.bad, u = r.unit ?? s.unit ?? '';
        const big = rows.length > 2 ? 46 : 56;
        return `<div${cidOf(r)} style="opacity:${f(ka, 3)};transform:translateY(${f((1 - ka) * 18)}px);padding:${i ? 16 : 4}px 0 4px;${i ? 'border-top:1px solid rgba(255,255,255,.08)' : ''}">
          <div style="font-weight:700;font-size:21px;line-height:1.35;color:${c.muted};margin-bottom:4px">${esc(r.label || '')}</div>
          <div style="display:flex;align-items:center;gap:14px">
            <div style="position:relative;font-family:${c.num};font-weight:700;font-size:${big * .7}px;line-height:1.2;color:${c.bef};white-space:nowrap">${fmt(from, dec)}<span style="font-size:.55em;margin-left:3px">${esc(u)}</span>
              <span style="position:absolute;left:-4px;right:-4px;top:52%;height:3px;border-radius:2px;background:${c.bad};transform:scaleX(${f(kw, 3)});transform-origin:0 50%;opacity:.85"></span></div>
            <svg viewBox="0 0 64 24" width="64" height="24" style="flex:none"><path d="M2 12h54M47 4l9 8-9 8" fill="none" stroke="${c.gold}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"
              pathLength="1" stroke-dasharray="1" stroke-dashoffset="${f(1 - kw, 3)}"/></svg>
            <div style="font-family:${c.num};font-weight:900;font-size:${big}px;line-height:1.15;color:${kc > .02 ? col : 'transparent'};white-space:nowrap;letter-spacing:-.02em;text-shadow:0 0 ${f(22 * kc)}px ${hexA(col, .45)}">${fmt(lerp(from, to, kc), dec)}<span style="font-size:.5em;margin-left:4px">${esc(u)}</span></div>
            <div style="margin-left:auto;flex:none;display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:${hexA(col, .16)};border:1.5px solid ${hexA(col, .7)};color:${col};
              font-family:${c.num};font-weight:800;font-size:22px;line-height:1.3;white-space:nowrap;transform:scale(${f(clamp(kd, 0, 1.4), 3)});opacity:${f(clamp(kd * 2), 3)}">
              <svg viewBox="0 0 12 12" width="14" height="14"><path d="${up ? 'M6 1l5 9H1z' : 'M6 11L1 2h10z'}" fill="${col}"/></svg>${fmt(Math.abs(to - from), dec)}${esc(u)}</div></div></div>`;
      }).join('');
      const body = `<div style="${cardCSS(c)};width:${s.w || 600}px;padding:26px 28px">${head(c, s.title ?? 'Kết quả sau 30 ngày')}<div style="margin-top:12px">${html}</div></div>`;
      return { front: root(s, body, { op, tr: `translateY(${f((1 - ke) * 40)}px)` }) };
    },

    // 6. Reveal stamp: style:'stamp' (KẾT QUẢ pill + rays + confetti) or 'wow' (comic starburst). { text, sub, style, rotate, confetti, backdrop }
    tf_stamp(s, t, lt) {
      const c = C(s), op = outOp(s, t), wow = s.style === 'wow';
      const text = s.text ?? (wow ? 'WOW!' : 'KẾT QUẢ');
      const ks = prog(lt, 0, .2), sc = lt < .2 ? lerp(2.6, 1, E.inQuad(ks)) : 1 - .06 * Math.sin(clamp((lt - .2) / .25) * Math.PI);
      const sh = lt > .2 && lt < .55 ? (1 - (lt - .2) / .35) * 10 : 0, jx = Math.sin(lt * 97) * sh, jy = Math.cos(lt * 83) * sh;
      const rot = s.rotate ?? (wow ? -8 : -6);
      const fs = s.font_size || clamp(520 / Math.max(3, [...text].length * .72), 44, wow ? 100 : 92);
      const rays = `<div style="position:absolute;left:50%;top:50%;width:760px;height:760px;transform:translate(-50%,-50%) rotate(${f(lt * 18)}deg) scale(${f(E.outCubic(prog(lt, .15, .5)), 3)});border-radius:50%;
        background:repeating-conic-gradient(${hexA(c.gold, .28)} 0 7deg,transparent 7deg 20deg);-webkit-mask-image:radial-gradient(circle,#000 10%,transparent 64%);mask-image:radial-gradient(circle,#000 10%,transparent 64%)"></div>`;
      let core;
      if (wow) {
        const pts = Array.from({ length: 32 }, (_, i) => { const r = i % 2 ? 172 : 236 + (i % 4 === 0 ? 16 : 0), a = i * Math.PI / 16; return `${f(260 + r * Math.cos(a))},${f(260 + r * Math.sin(a) * .82)}`; }).join(' ');
        core = `<div style="position:relative;width:520px;height:520px;display:flex;align-items:center;justify-content:center">
          <svg viewBox="0 0 520 520" width="520" height="520" style="position:absolute;inset:0;filter:drop-shadow(0 16px 30px rgba(0,0,0,.5))">
            <polygon points="${pts}" fill="${c.gold}" stroke="#1A1020" stroke-width="10" stroke-linejoin="round"/>
            <polygon points="${pts}" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round" transform="translate(26 26) scale(.9)"/></svg>
          <div style="position:relative;font-family:'Montserrat',sans-serif;font-weight:900;font-style:italic;font-size:${f(fs, 0)}px;line-height:1.1;color:${c.aft};letter-spacing:-.02em;white-space:nowrap;
            text-shadow:4px 4px 0 #1A1020,-2px -2px 0 #1A1020,2px -2px 0 #1A1020,-2px 2px 0 #1A1020,0 10px 0 #1A1020">${esc(text)}</div></div>`;
      } else {
        core = `<div style="position:relative;padding:14px 46px 16px;border-radius:24px;background:${grad(c)};border:5px solid #fff;
          box-shadow:0 0 0 6px ${hexA(c.card, .9)},0 0 0 9px ${hexA(c.gold, .9)},0 0 60px ${hexA(c.aft, .6)},0 24px 50px rgba(0,0,0,.55);
          font-family:${c.disp};font-weight:900;font-size:${f(fs, 0)}px;line-height:1.28;letter-spacing:.03em;color:#fff;white-space:nowrap;text-shadow:0 4px 0 rgba(0,0,0,.18)">
          <span style="position:absolute;left:-24px;top:-26px;transform:rotate(-12deg)">${SPARK4('#fff', 46)}</span>
          <span style="position:absolute;right:-18px;bottom:-20px">${SPARK4(c.gold, 34)}</span>${esc(text)}</div>`;
      }
      const conf = (s.confetti ?? true) && lt > .18 ? Array.from({ length: 28 }, (_, i) => {
        const tau = lt - .18; if (tau > 2.2) return '';
        const a = rnd(i * 5 + 1) * Math.PI * 2, v = 380 + rnd(i * 5 + 2) * 420;
        const x = Math.cos(a) * v * tau, y = Math.sin(a) * v * tau * .8 + 520 * tau * tau;
        const col = [c.aft, c.gold, '#fff', c.good][i % 4], wv = 10 + rnd(i * 5 + 3) * 10;
        return `<div style="position:absolute;left:50%;top:50%;width:${f(wv)}px;height:${f(wv * .45)}px;border-radius:2px;background:${col};opacity:${f(clamp(1 - tau / 2.2), 3)};
          transform:translate(${f(x)}px,${f(y)}px) rotate(${f(tau * 540 * (i % 2 ? 1 : -1) + i * 37)}deg)"></div>`;
      }).join('') : '';
      const ksub = E.outCubic(prog(lt, .45, .35));
      const sub = s.sub ? `<div style="margin-top:${wow ? -30 : 30}px;font-weight:800;font-size:30px;line-height:1.35;color:#fff;text-shadow:0 3px 14px rgba(0,0,0,.85);white-space:nowrap;
        opacity:${f(ksub, 3)};transform:translateY(${f((1 - ksub) * 16)}px)">${esc(s.sub)}</div>` : '';
      const body = `<div style="position:relative;display:flex;flex-direction:column;align-items:center">${rays}${conf}
        <div style="position:relative;transform:translate(${f(jx)}px,${f(jy)}px) rotate(${rot}deg) scale(${f(sc, 3)});opacity:${f(clamp(ks * 3), 3)}">${core}</div>${sub}</div>`;
      const flash = lt > .2 && lt < .42 ? `<div class="full" style="background:#fff;opacity:${f((1 - (lt - .2) / .22) * .35, 3)}"></div>` : '';
      const back = s.backdrop === 'dim' ? `<div class="full" style="background:${hexA(c.card, .55)};opacity:${f(op, 3)}"></div>` : '';
      return { back, front: root(s, body, { op, fy: .42 }) + flash };
    },
  };
  Object.assign(MODULES, MOD);

  // ---------- caption style "transform": heavy white, current word fills pink→gold gradient; "trước" greys, "sau / kết quả" gold ----------
  const norm = w => String(w).toLowerCase().replace(/[.,!?…:;"]/g, '');
  CAPTION_STYLES.transform = (cap, t) => {
    const c = C(), [W] = DIMS(), vert = VERT();
    const x = cap.x ?? W / 2, dx = x - W / 2, top = cap.y ?? (vert ? 880 : 590), size = cap.size || (vert ? 42 : 40);
    let cur = -1;
    cap.words.forEach((w, i) => { if (t >= w.s - .03) cur = i; });
    const kin = E.outBack(prog(t, cap.t0, .18), 2);
    const sh = `0 3px 0 rgba(0,0,0,.55),0 0 14px rgba(0,0,0,.55),${strokeShadow(Math.max(1.5, size * .05), 'rgba(0,0,0,.75)')}`;
    const html = cap.words.map((w, i) => {
      const on = i === cur && t < (w.e ?? w.s + .4) + .12, n = norm(w.w);
      const kp = E.outBack(prog(t, w.s - .03, .18), 2.6);
      if (w.hl) return `<span style="display:inline-block;margin:.04em .08em;padding:0 .22em;border-radius:.2em;background:${grad(c)};color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.25);
        box-shadow:0 .1em .4em ${hexA(c.aft, .45)};transform:rotate(-2deg) scale(${f(on ? lerp(1, 1.08, clamp(kp)) : 1, 3)})">${esc(w.w)}</span>`;
      if (on) return `<span style="position:relative;display:inline-block;margin:0 .06em;color:${c.gold};text-shadow:${sh},0 0 18px ${hexA(c.aft, .7)};
        transform:translateY(${f(-3 * clamp(kp))}px) scale(${f(lerp(1, 1.1, clamp(kp, 0, 1.2)), 3)})">${esc(w.w)}<span style="position:absolute;left:4%;right:4%;bottom:.02em;height:.12em;border-radius:.06em;
        background:${grad(c)};box-shadow:0 2px 0 rgba(0,0,0,.5);transform:scaleX(${f(clamp(kp), 3)});transform-origin:0 50%"></span></span>`;
      const col = n === 'trước' ? '#B9C2D3' : /^(sau|kết|quả)$/.test(n) ? c.gold : cap.color || '#FFFFFF';
      return `<span style="display:inline-block;color:${col};text-shadow:${sh}">${esc(w.w)}</span>`;
    }).join(' ');
    return `<div id="cap"${cidOf(cap)} style="position:absolute;top:${top}px;left:${40 + dx}px;right:${40 - dx}px;text-align:center;white-space:normal;
      font-family:${cap.font || c.disp};font-weight:${cap.weight || 900};font-size:${size}px;line-height:1.32;letter-spacing:-.005em;
      transform:scale(${f(lerp(.88, 1, clamp(kin, 0, 1.1)), 3)});transform-origin:50% 0">${html}</div>`;
  };

  // ---------- Studio metadata ----------
  const at = (y, size = 100) => ({ x: DIMS()[0] / 2, y: VERT() ? y : Math.round(y * 720 / 1280), size: VERT() ? size : Math.round(size * .8) });
  PACKS.push({
    id: P, name: 'Biến đổi trước / sau', icon: '✨',
    desc: 'Makeover, nội thất, làm đẹp, giảm cân: thanh trượt TRƯỚC/SAU, loé sáng lộ kết quả, đếm Ngày 1 → 30, lưới tiến trình, chỉ số 72kg → 64kg, con dấu KẾT QUẢ',
    caption: 'transform',
    items: [
      { type: 'tf_slider', label: 'Thanh trượt trước / sau', make: T => ({ type: 'tf_slider', t0: T, t1: T + 4, ...at(500), frame: 'card', before: '', after: '', before_label: 'TRƯỚC', after_label: 'SAU' }) },
      { type: 'tf_flash_reveal', label: 'Loé sáng lộ kết quả', make: T => ({ type: 'tf_flash_reveal', t0: T, t1: T + 3.5, ...at(500), frame: 'card', flash: T + 1.3, before: '', after: '' }) },
      { type: 'tf_timer', label: 'Đếm ngày (vòng tiến độ)', make: T => ({ type: 'tf_timer', t0: T, t1: T + 3.5, ...at(700, 82), from: 1, to: 30, unit: 'Ngày', title: 'Hành trình thay đổi' }) },
      { type: 'tf_grid', label: 'Lưới tiến trình 2×2 / 1×3', make: T => ({ type: 'tf_grid', t0: T, t1: T + 4, ...at(500), title: 'Từng bước thay đổi', items: [{ label: 'Tuần 1' }, { label: 'Tuần 2' }, { label: 'Tuần 3' }, { label: 'Tuần 4' }] }) },
      { type: 'tf_stats', label: 'Chỉ số trước → sau', make: T => ({ type: 'tf_stats', t0: T, t1: T + 4, ...at(470), title: 'Kết quả sau 30 ngày',
        rows: [{ label: 'Cân nặng', from: 72, to: 64, unit: 'kg', better: 'down' }, { label: 'Vòng eo', from: 86, to: 74, unit: 'cm', better: 'down' }, { label: 'Năng lượng', from: 40, to: 85, unit: '%', better: 'up' }] }) },
      { type: 'tf_stamp', label: 'Con dấu KẾT QUẢ / WOW', make: T => ({ type: 'tf_stamp', t0: T, t1: T + 2.5, ...at(520), text: 'KẾT QUẢ', style: 'stamp', sub: 'Khác biệt rõ rệt' }) },
    ],
    // Starter edit: timer hook → slider on "trước" → flash reveal on "sau / kết quả" → stats on spoken numbers (else grid) → stamp.
    recipe: ctx => {
      const dur = ctx.dur || 20, caps = ctx.captions || [], vert = ctx.vertical ?? VERT();
      const P2 = (y, size = 100) => ({ x: vert ? 360 : 640, y: vert ? y : Math.round(y * 720 / 1280), size: vert ? size : Math.round(size * .8) });
      const before = ctx.before || '', after = ctx.after || '';
      const scenes = [], busy = [];
      // Place a graphic at its wanted start, else in the free slot nearest to it (0.4 s air between blocks; may shrink to ≥ 2.2 s).
      const add = sc => {
        const len = sc.t1 - sc.t0, want = sc.t0, end = dur - 2.6;
        const room = t0 => (t0 < 0 || busy.some(([a, z]) => t0 > a - .4 - 1e-6 && t0 < z + .4 - 1e-6)) ? 0
          : Math.min(end, ...busy.filter(([a]) => a > t0).map(([a]) => a - .4)) - t0;
        const cands = [want, ...busy.map(([, z]) => z + .4)].filter(t0 => room(t0) >= 2.2).sort((p, q) => Math.abs(p - want) - Math.abs(q - want));
        if (!cands.length) return false;
        const sh = cands[0] - want;
        sc.t0 = +cands[0].toFixed(2); sc.t1 = +(sc.t0 + Math.min(len, room(cands[0]))).toFixed(2);
        if (sc.flash != null) sc.flash = +(sc.flash + sh).toFixed(2);
        busy.push([sc.t0, sc.t1]); scenes.push(sc); return true;
      };
      add({ type: 'tf_timer', t0: .2, t1: Math.min(3, dur * .2), ...P2(700, 82), from: 1, to: 30, unit: 'Ngày', title: ctx.title || 'Hành trình thay đổi', count: 1.6 });
      const tb = findWord(caps, ['trước đây', 'trước kia', 'trước', 'lúc đầu', 'ban đầu']);
      add({ type: 'tf_slider', t0: Math.max(0, (tb ?? dur * .2) - .2), t1: (tb ?? dur * .2) + 4, ...P2(500), frame: 'card', ...(before ? { before } : {}), ...(after ? { after } : {}) });
      const ta = findWord(caps, ['kết quả', 'sau khi', 'sau', 'bây giờ', 'giờ thì'], (tb ?? 0) + 1) ?? Math.min((tb ?? dur * .2) + 5.6, dur - 4);
      add({ type: 'tf_flash_reveal', t0: Math.max(0, ta - 1.2), t1: ta + 2.4, flash: +ta.toFixed(2), ...P2(500), frame: 'card', ...(before ? { before } : {}), ...(after ? { after } : {}) });
      const nums = capWords(caps).filter(w => /\d/.test(w.w));
      if (nums.length) {
        const a = nums[0], b2 = nums[1];
        const va = parseFloat(String(a.w).replace(',', '.')) || 0, vb = b2 ? parseFloat(String(b2.w).replace(',', '.')) || 0 : Math.round(va * .9);
        add({ type: 'tf_stats', t0: Math.max(0, a.s - .2), t1: a.s + 4, ...P2(470), title: 'Trước → Sau', rows: [{ label: 'Chỉ số', from: va, to: vb, unit: '' }] });
      } else add({ type: 'tf_grid', t0: dur * .66, t1: dur * .66 + 3.6, ...P2(500), title: 'Từng bước thay đổi', items: [{ label: 'Bước 1' }, { label: 'Bước 2' }, { label: 'Bước 3' }, { label: 'Kết quả' }] });
      scenes.push({ type: 'tf_stamp', t0: +(dur - 2.4).toFixed(2), t1: dur, ...P2(520), text: 'KẾT QUẢ', style: 'stamp', keep: true });
      return { caption_style: 'transform', music: 'inspire', scenes };
    },
  });
})();
