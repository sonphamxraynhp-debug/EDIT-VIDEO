// "Slate grid" style (design 720x1280): video card on a slate grid, badge on top, clean captions with a
// highlighted keyword, LED / neon words, logo row, node diagram over a blurred card, media card, end title.
// Specs: references/modules-slate.md. Every visible element carries data-cid (when given) so the studio can pick it.

const SL = {
  bg: '#45545E', grid: 'rgba(255,255,255,.075)', cell: 31,
  card: { x: 80, y: 140, w: 560, h: 1000, r: 8 },
  yellow: '#F3E35A', badge: '#D97757', led: '#FF8A1E', neon: '#FF3348', teal: '#5EE6C8',
};
const cidAttr = o => (o && o.cid ? ` data-cid="${o.cid}"` : '');
// Frame size: 720×1280 (9:16) or 1280×720 when the project is horizontal (VERT() lives in packs/core.js).
const SLW = () => (typeof VERT === 'function' && !VERT() ? 1280 : 720), SLH = () => (SLW() === 720 ? 1280 : 720);
// Keyframes [{t, v}] or [{t, x, y, s}] → interpolated value at t (inOutSine between keys).
function keyAt(keys, t, field = 'v', dflt = 0) {
  if (keys == null) return dflt;
  if (typeof keys === 'number') return keys;
  if (!keys.length) return dflt;
  if (t <= keys[0].t) return keys[0][field] ?? dflt;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t < b.t) {
      const d = b.dur ?? Math.min(.45, b.t - a.t);
      const k = E.inOutSine(prog(t, b.t - d, d));
      return lerp(a[field] ?? dflt, b[field] ?? dflt, k);
    }
  }
  return keys[keys.length - 1][field] ?? dflt;
}
const SI_CDN2 = CDN + 'npm/simple-icons@15.0.0/icons/';
// Icon as an <img>/emoji at size px. tone: 'black' glyph (default) | 'white'.
function slIcon(icon, size, tone = 'black') {
  if (!icon) return '';
  if (icon.startsWith('si:')) return `<img src="${SI_CDN2}${icon.slice(3)}.svg" style="width:${size}px;height:${size}px;object-fit:contain;${tone === 'white' ? 'filter:invert(1)' : ''}">`;
  if (/\.(png|jpe?g|webp|svg|gif)$/i.test(icon) || /^(https?:|data:)/.test(icon)) return `<img src="${url(icon)}" style="width:${size}px;height:${size}px;object-fit:contain">`;
  return `<span style="display:inline-block;width:${size}px;height:${size}px;position:relative">${emoji(icon, 0, 0, size, 'position:absolute')}</span>`;
}
const PERSON_SVG = c => `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${c}" stroke-width="1.6"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c1.2-3.8 4-5.6 7-5.6s5.8 1.8 7 5.6"/></svg>`;
const SPARK = `<svg viewBox="0 0 24 24" width=".8em" height=".8em" style="vertical-align:-.05em"><path fill="currentColor" d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" opacity=".95"/><path fill="currentColor" d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" opacity=".7"/></svg>`;
const inOut = (t, t0, t1, din = .3, dout = .2) => (t1 == null ? 1 : 1 - E.inCubic(prog(t, t1 - dout, dout))) * E.outCubic(prog(t, t0, din));

// ---------- extra text styles for lines[] (textLine in vertical.js) ----------
Object.assign(TEXT_STYLE, {
  clean: () => `color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.55),0 0 2px rgba(0,0,0,.4)`,
  muted: () => `color:rgba(255,255,255,.82);text-shadow:0 2px 8px rgba(0,0,0,.5)`,
  grad_blue: () => `background:linear-gradient(180deg,#E3F4FF 0%,#8CCBFF 45%,#2F7BFF 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 10px rgba(30,90,255,.45))`,
  grad_teal: () => `background:linear-gradient(180deg,#D9FFF3 0%,${SL.teal} 50%,#1F9C86 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 18px rgba(94,230,200,.65)) drop-shadow(0 0 40px rgba(94,230,200,.35))`,
  hl: () => `color:#151515;background:${SL.yellow};padding:0 .22em;border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.3)`,
});

// ---------- backgrounds ----------
function slateBg(g = {}) {
  const cell = g.cell || SL.cell, line = g.color || SL.grid;
  return `<div class="full" style="background-color:${g.bg || SL.bg};background-image:linear-gradient(${line} 2px,transparent 2px),linear-gradient(90deg,${line} 2px,transparent 2px);background-size:${cell}px ${cell}px;background-position:-1px -1px"></div>`;
}

// ---------- captions (caption_style:"slate") ----------
// Captions chunk: { t0, t1, words:[{w,s,e,hl?,br?}], x?, y?, size?, font?, color?, weight?, hl_font?, hl_bg?, hidden? }
// Words appear as they are spoken (TL.caption_reveal !== false); hl words become the yellow serif keyword box.
function slateCaption(c, t) {
  const st = [];
  if (c.y != null) st.push(`top:${c.y}px`);
  if (c.x != null) st.push(`left:${c.x - SLW() / 2}px;right:${SLW() / 2 - c.x}px`);
  if (c.size) st.push(`font-size:${c.size}px`);
  if (c.font) st.push(`font-family:${c.font}`);
  if (c.color) st.push(`color:${c.color}`);
  if (c.weight) st.push(`font-weight:${c.weight}`);
  const reveal = TL.caption_reveal !== false;
  const html = c.words.map(w => {
    const vis = !reveal || t >= w.s - .02;
    const k = reveal ? E.outCubic(prog(t, w.s - .02, .12)) : 1;
    const ws = vis ? `opacity:${k.toFixed(2)}` : 'opacity:0';
    const word = w.hl
      ? `<span class="hl" style="${ws};transform:scale(${lerp(.7, 1, E.outBack(prog(t, w.s - .02, .22), 2)).toFixed(3)});${c.hl_font ? `font-family:${c.hl_font};` : ''}${c.hl_bg ? `background:${c.hl_bg};` : ''}">${esc(w.w)}</span>`
      : `<span style="${ws}">${esc(w.w)}</span>`;
    return word + (w.br ? '<br>' : ' ');
  }).join('');
  return `<div id="cap" class="slate"${cidAttr(c)} style="${st.join(';')}">${html}</div>`;
}

// ---------- modules ----------
const SMOD = {
  // Video card on the slate grid + badge. blur/dim/zoom accept numbers or keyframes [{t,v}] / [{t,s,x,y}].
  frame_grid(s, t, lt) {
    const c = { ...(SLW() > SLH() ? { x: 150, y: 96, w: 980, h: 551, r: 8 } : SL.card), ...(s.card || {}) };
    const blur = keyAt(s.blur, t), dim = keyAt(s.dim, t);
    const zs = keyAt(s.zoom, t, 's', 1), zx = keyAt(s.zoom, t, 'x', 50), zy = keyAt(s.zoom, t, 'y', 40);
    // Enter: 'blur' = dissolve from blur (as the reference between shots), 'zoom' = card scales up from .92, 'cut'.
    const en = s.enter || 'cut', ek = E.outCubic(prog(lt, 0, en === 'zoom' ? .35 : .3));
    const eb = en === 'blur' ? (1 - ek) * 16 : 0, es = en === 'zoom' ? lerp(.92, 1, ek) : 1;
    // Slow drift keeps the card alive (reference: ~2-3% over a shot).
    const drift = s.drift === false ? 1 : 1 + .025 * prog(lt, 0, Math.max(1, s.t1 - s.t0));
    const vid = TL.aroll
      ? `<img src="${url(fmtSeq(TL.aroll.frames, frameAt(t)))}" style="position:absolute;inset:-${Math.ceil(blur * 1.5)}px;width:calc(100% + ${Math.ceil(blur * 3)}px);height:calc(100% + ${Math.ceil(blur * 3)}px);object-fit:cover;
          filter:${arollFilter(t)} blur(${(blur + eb).toFixed(1)}px) brightness(${(1 - dim).toFixed(3)});transform:scale(${(zs * drift).toFixed(4)});transform-origin:${zx}% ${zy}%">`
      : '<div class="full" style="background:#111"></div>';
    const card = `<div class="abs"${cidAttr(s)} style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:${c.r}px;overflow:hidden;
      box-shadow:0 18px 40px rgba(0,0,0,.35);transform:scale(${es.toFixed(4)})">${vid}</div>`;
    let badge = '';
    if (s.badge !== false) {
      const b = { icon: 'si:claude', bg: SL.badge, size: 118, x: SLW() / 2, y: c.y, ...(s.badge || {}) };
      const bk = E.outBack(prog(lt, 0, .35), 1.8);
      badge = `<div class="abs"${cidAttr(b)} style="left:${b.x - b.size / 2}px;top:${b.y - b.size / 2}px;width:${b.size}px;height:${b.size}px;border-radius:${b.size * .2}px;
        background:${b.bg};display:flex;align-items:center;justify-content:center;box-shadow:0 8px 22px rgba(0,0,0,.3);
        transform:scale(${(s.badge_anim === false ? 1 : bk).toFixed(3)})">${slIcon(b.icon, b.size * .66, 'white')}</div>`;
    }
    return { back: slateBg(s.grid) + card + badge, front: lines(s, t), cover: true, hideCaptions: s.hideCaptions ?? blur > 6 };
  },

  // Dot-matrix LED word ("TIN SHOCK"): dark dotted panel, letters type on one by one with an orange glow.
  led_text(s, t, lt) {
    const size = s.size || 74, x = s.x ?? SLW() / 2, y = s.y ?? 400, col = s.color || SL.led;
    const chars = [...(s.text || 'TIN SHOCK')], cps = s.cps || 14;
    const shown = Math.min(chars.length, Math.floor(lt * cps) + 1);
    const txt = chars.map((ch, i) => `<span style="opacity:${i < shown ? 1 : .07}">${esc(ch)}</span>`).join('');
    const dot = Math.max(4, Math.round(size / 10.5));
    const mask = `radial-gradient(circle,#000 ${dot * .36}px,transparent ${dot * .44}px)`;
    const o = inOut(t, s.t0, s.keep ? null : s.t1, .12, .15);
    const panel = s.panel === false ? '' : `<div style="position:absolute;inset:-${size * .12}px -${size * .22}px;background:rgba(12,10,9,.72);border-radius:6px;
      background-image:radial-gradient(circle,rgba(255,255,255,.07) ${dot * .4}px,transparent ${dot * .5}px);background-size:${dot}px ${dot}px"></div>`;
    return { front: `<div class="abs"${cidAttr(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%);opacity:${o.toFixed(3)}">${panel}
      <div style="position:relative;font-family:var(--disp);font-weight:900;font-size:${size}px;line-height:1;letter-spacing:.06em;white-space:nowrap;color:${col};
        -webkit-mask-image:${mask};mask-image:${mask};-webkit-mask-size:${dot}px ${dot}px;mask-size:${dot}px ${dot}px;
        filter:brightness(1.25) drop-shadow(0 0 3px ${col}) drop-shadow(0 0 12px ${col}88)">${txt}</div></div>` };
  },

  // Neon tube word ("đáng sợ"): flickers on, then hums.
  neon_text(s, t, lt) {
    const size = s.size || 80, x = s.x ?? SLW() / 2, y = s.y ?? 400, col = s.color || SL.neon;
    const fl = s.flicker === false ? 1 : (lt < .45 ? [1, .15, .9, .1, 1, .3, 1, 1, .2, 1][Math.floor(lt / .045)] ?? 1 : .93 + .07 * Math.sin(lt * 40));
    const o = inOut(t, s.t0, s.keep ? null : s.t1, .05, .15) * fl;
    return { front: `<div class="abs"${cidAttr(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(${s.rotate ?? -3}deg);opacity:${o.toFixed(3)};
      font-family:${s.font || 'var(--sans)'};font-weight:${s.weight || 800};font-size:${size}px;white-space:nowrap;color:${s.core || '#FF4D61'};
      text-shadow:0 0 4px ${col},0 0 12px ${col},0 0 26px ${col},0 0 48px ${col}aa,0 0 80px ${col}66">${esc(s.text || 'đáng sợ')}</div>` };
  },

  // Row of white app tiles with logos, popping in left → right.
  logo_row(s, t, lt) {
    const icons = s.icons || ['si:openai', 'si:claude', 'si:googlegemini'], sz = s.size || 60, gap = s.gap ?? 14, x = s.x ?? SLW() / 2, y = s.y ?? 310;
    const W = icons.length * sz + (icons.length - 1) * gap;
    const out = s.keep ? 1 : 1 - E.inCubic(prog(t, s.t1 - .18, .18));
    const tiles = icons.map((ic, i) => {
      const k = E.outBack(prog(lt, i * (s.stagger ?? .07), .3), 2.2);
      const dark = typeof ic === 'object' && ic.dark;
      const icon = typeof ic === 'object' ? ic.icon : ic;
      return `<div style="position:absolute;left:${i * (sz + gap)}px;top:0;width:${sz}px;height:${sz}px;border-radius:${sz * .26}px;background:${dark ? '#1b1b1b' : '#fff'};
        display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,.35);transform:scale(${clamp(k, 0, 1.2).toFixed(3)});opacity:${clamp(k * 3).toFixed(2)}">${slIcon(icon, sz * .6, dark ? 'white' : 'black')}</div>`;
    }).join('');
    return { front: `<div class="abs"${cidAttr(s)} style="left:${x - W / 2}px;top:${y - sz / 2}px;width:${W}px;height:${sz}px;opacity:${out.toFixed(3)}">${tiles}</div>` };
  },

  // Rounded media card (b-roll image / frame sequence / preset) — "viễn cảnh phim iRobot".
  media_card(s, t, lt) {
    const c = { x: 110, y: 360, w: 500, h: 290, r: 18, ...(s.card || {}) };
    const k = E.outBack(prog(lt, 0, .4), 1.3), o = inOut(t, s.t0, s.keep ? null : s.t1, .2, .2);
    const zs = keyAt(s.pan, t, 's', 1 + .06 * prog(lt, 0, s.t1 - s.t0));
    const inner = s.screen ? screenContent(s.screen, t, c.w, c.h, s) : `<img src="${media(s.media, t)}" style="width:100%;height:100%;object-fit:cover;transform:scale(${zs.toFixed(4)})">`;
    return {
      front: `<div class="abs"${cidAttr(s)} style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:${c.r}px;overflow:hidden;opacity:${o.toFixed(3)};
        box-shadow:0 16px 40px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.18);transform:translateY(${((1 - k) * 60).toFixed(1)}px) scale(${lerp(.9, 1, k).toFixed(3)})">${inner}</div>` + lines(s, t),
    };
  },

  // Node diagram (blurred card behind): nodes move between keyframed positions, edges draw on as curves.
  // nodes: [{ id, kind: person|chip|pill|pill_outline|big|label, text, icon, x, y, keys:[{t,x,y}], t, out, size, ring }]
  // edges: [{ from, to, t, bend, dur }]
  diagram(s, t, lt) {
    const P = {}, html = [];
    for (const n of s.nodes || []) {
      const nt = n.t ?? s.t0;
      if (t < nt || n.hidden) continue;
      const x = keyAt(n.keys, t, 'x', n.x ?? 360), y = keyAt(n.keys, t, 'y', n.y ?? 600);
      P[n.id] = { x, y };
      const k = E.outBack(prog(t, nt, .32), 1.8), o = inOut(t, nt, n.out ?? (s.keep ? null : s.t1), .14, .2);
      const sz = n.size || ({ person: 64, chip: 22, pill: 30, pill_outline: 32, big: 120, label: 26 }[n.kind] || 24);
      let body = '';
      if (n.kind === 'person') {
        body = `<div style="width:${sz}px;height:${sz}px;margin:0 auto;border-radius:50%;border:2px solid rgba(255,255,255,.85);background:rgba(0,0,0,.25);padding:${sz * .18}px">${PERSON_SVG('#fff')}</div>
          ${n.text ? `<div style="margin-top:8px;font-weight:700;font-size:${Math.round(sz * .26)}px;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.6)">${esc(n.text)}</div>` : ''}`;
      } else if (n.kind === 'chip') {
        body = `<div style="display:inline-flex;align-items:center;gap:${sz * .4}px;padding:${sz * .38}px ${sz * .6}px ${sz * .38}px ${sz * .38}px;border-radius:${sz * .5}px;
          background:rgba(38,38,40,.82);border:1px solid rgba(255,255,255,.16);box-shadow:0 8px 20px rgba(0,0,0,.35)">
          <span style="width:${sz * 1.45}px;height:${sz * 1.45}px;border-radius:${sz * .36}px;background:#fff;display:inline-flex;align-items:center;justify-content:center">${slIcon(n.icon || 'si:openai', sz, 'black')}</span>
          <span style="font-weight:800;font-size:${sz}px;color:#fff">${esc(n.text || '')}</span></div>`;
      } else if (n.kind === 'pill' || n.kind === 'pill_outline') {
        const outl = n.kind === 'pill_outline';
        const ring = n.ring ? `<div style="position:absolute;left:50%;top:50%;width:150%;height:${outl ? 190 : 210}%;transform:translate(-50%,-50%);border:2px dashed rgba(255,255,255,.55);border-radius:50%"></div>` : '';
        body = `<div style="position:relative;display:inline-block">${ring}<div style="position:relative;display:inline-flex;align-items:center;gap:.3em;padding:.26em .7em;border-radius:999px;
          font-weight:800;font-size:${sz}px;${outl ? `color:#fff;background:rgba(15,15,15,.75);border:2.5px solid ${n.color || SL.yellow}` : `color:#151515;background:${n.color || SL.yellow};box-shadow:0 6px 18px rgba(243,227,90,.35)`}">
          <span style="color:${outl ? n.color || SL.yellow : '#151515'}">${SPARK}</span>${esc(n.text || '')}</div></div>`;
      } else if (n.kind === 'big') {
        body = `<div style="font-family:var(--disp);font-weight:900;font-size:${sz}px;line-height:1;${TEXT_STYLE[n.style || 'grad_teal']()}">${esc(n.text || 'AI')}</div>`;
      } else {
        body = `<div style="font-weight:${n.weight || 800};font-size:${sz}px;white-space:nowrap;${TEXT_STYLE[n.style || 'clean']()}">${esc(n.text || '')}</div>`;
      }
      html.push(`<div class="abs"${cidAttr(n)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) scale(${clamp(k, 0, 1.3).toFixed(3)});opacity:${o.toFixed(3)};text-align:center;white-space:nowrap">${body}</div>`);
    }
    const paths = (s.edges || []).map(e => {
      const a = P[e.from], b = P[e.to];
      if (!a || !b || t < (e.t ?? s.t0)) return '';
      const d = e.dur ?? .45, k = E.outCubic(prog(t, e.t ?? s.t0, d));
      const bend = e.bend ?? 0, mx = (a.x + b.x) / 2 + bend, my = Math.min(a.y, b.y) - Math.abs(b.y - a.y) * .15;
      const pathD = `M${a.x},${a.y} C${a.x},${my} ${b.x + bend * .3},${my} ${b.x},${b.y}`;
      return `<path d="${pathD}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - k).toFixed(3)}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"/>`;
    }).join('');
    const o = s.keep ? 1 : 1 - E.inCubic(prog(t, s.t1 - .2, .2));
    return { front: `<svg class="full" viewBox="0 0 ${SLW()} ${SLH()}" style="opacity:${o.toFixed(3)}">${paths}</svg>` + html.join('') + lines(s, t), hideCaptions: s.hideCaptions ?? true };
  },

  // End title on black: mixed-style title, swoosh, logo pill, italic question.
  // title: [{ text, color, font, italic, weight }], pill: { icon, text }, question
  title_card(s, t, lt) {
    const y = s.y ?? 560;
    const parts = (s.title || [{ text: 'SKI', color: '#fff' }, { text: 'LL AI EDIT VIDEO', color: '#FF7A2E', italic: true }]).map(p =>
      `<span style="color:${p.color || '#fff'};font-family:${p.font || 'var(--disp)'};font-style:${p.italic ? 'italic' : 'normal'};font-weight:${p.weight || 900}">${esc(p.text)}</span>`).join('');
    const k1 = E.outCubic(prog(lt, 0, .45)), k2 = E.outCubic(prog(lt, .25, .5)), k3 = E.outBack(prog(lt, .45, .4), 1.6), k4 = E.outCubic(prog(lt, .7, .4));
    const pill = s.pill === false ? '' : `<div style="display:inline-flex;align-items:center;gap:10px;background:#fff;border-radius:10px;padding:8px 20px 8px 14px;margin-top:22px;
      transform:scale(${k3.toFixed(3)});opacity:${clamp(k3 * 2).toFixed(2)}">${s.pill?.icon === '' ? '' : slIcon(s.pill?.icon || 'si:claude', 34, 'black')}
      <span style="font-family:'Playfair Display',serif;font-weight:600;font-size:40px;color:#141414">${esc(s.pill?.text || 'Claude')}</span></div>`;
    return {
      back: `<div class="full" style="background:${s.bg || 'radial-gradient(ellipse at 50% 45%,#16151a 0%,#050506 70%)'}"></div>`,
      front: `<div class="abs"${cidAttr(s)} style="left:0;right:0;top:${y}px;text-align:center">
        <div style="font-size:${s.size || 50}px;letter-spacing:.01em;white-space:nowrap;opacity:${k1.toFixed(3)};transform:translateY(${((1 - k1) * 20).toFixed(1)}px)">${parts}</div>
        <svg width="460" height="40" viewBox="0 0 460 40" style="display:block;margin:-4px auto 0"><defs><linearGradient id="sw" x1="0" x2="1"><stop offset="0" stop-color="#7B61FF" stop-opacity="0"/><stop offset=".5" stop-color="#9B8CFF"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>
          <path d="M10,32 Q230,-6 450,26" fill="none" stroke="url(#sw)" stroke-width="4" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - k2).toFixed(3)}"/></svg>
        ${pill}
        <div style="margin-top:26px;font-family:'Playfair Display',serif;font-style:italic;font-weight:500;font-size:36px;color:#fff;opacity:${k4.toFixed(3)}">${esc(s.question ?? 'Bạn thấy sao?')}</div></div>`,
      cover: true, hideCaptions: true,
    };
  },
};
Object.assign(MODULES, SMOD);
CAPTION_STYLES.slate = slateCaption;
