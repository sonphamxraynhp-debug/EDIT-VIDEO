// Vertical 9:16 "AI tutorial bubble" modules (design space 720x1280).
// Each module: (scene, t, localT) => { back, front, person, cover, hideCaptions }. Specs: references/modules-vertical.md.

const VW = 720, VH = 1280;
const V = {
  red: '#AA2619', orange: '#DE5A1E', yellow: '#E9C21B', bubble: '#F7BE48', line: 'rgba(255,170,70,.55)',
  hero: '#FCDB36', ink: '#FFE53B', fire: '#E8432A', glow: '#FFFF22', neon: '#9CFF4A',
};

// ---------- text ----------
// Hard outline via stacked shadows (works on any HTML text, no paint-order dependency).
function strokeShadow(w, color) {
  const out = [];
  for (let a = 0; a < 16; a++) {
    const r = (a / 16) * Math.PI * 2;
    out.push(`${(Math.cos(r) * w).toFixed(1)}px ${(Math.sin(r) * w).toFixed(1)}px 0 ${color}`);
  }
  return out.join(',');
}
const TEXT_STYLE = {
  white: () => `color:#fff;text-shadow:3px 4px 0 #000,0 0 12px rgba(0,0,0,.35)`,
  yellow: () => `color:${V.hero};text-shadow:3px 4px 0 #000,0 0 12px rgba(0,0,0,.35)`,
  ink: () => `color:${V.ink};text-shadow:${strokeShadow(3, '#000')},5px 6px 0 #000`,
  fire: () => `color:${V.fire};text-shadow:${strokeShadow(2.5, '#fff')},4px 5px 0 #3a0a05`,
  glow: () => `color:${V.glow};text-shadow:${strokeShadow(1.5, '#B33A00')},0 0 10px #ff7a00,0 0 22px #ff5a00,0 0 34px rgba(255,80,0,.75)`,
  neon: () => `color:#fff;text-shadow:0 0 6px ${V.neon},0 0 18px #7dff2a,0 0 36px #5cff10,0 0 64px rgba(90,255,20,.75)`,
  dark: () => `color:#111;text-shadow:none`,
};

// One line: { text, t, out?, style:white|yellow|ink|fire|glow|neon, size, x=360, y, anim, from_y, from_x, upper, weight, italic }
// anim: pop | slide_l | slide_r | tumble | blur_zoom | fly | type | fade | drop
function textLine(L, t, sceneOut) {
  if (t < L.t || L.hidden) return '';
  const lt = t - L.t, size = L.size || 48, x = L.x ?? VW / 2, y = L.y;
  const tout = L.out ?? sceneOut;
  let o = 1;
  if (tout != null) o *= 1 - E.inCubic(prog(t, tout - .12, .12));
  const style = (TEXT_STYLE[L.style || 'white'] || TEXT_STYLE.white)();
  const txt = L.upper === false ? L.text : (L.upper ? L.text.toUpperCase() : L.text);
  const base = `position:absolute;left:${x}px;top:${y}px;font-family:${L.font || 'var(--disp)'};font-weight:${L.weight || 900};font-style:${L.italic === false ? 'normal' : 'italic'};
    font-size:${size}px;line-height:1.05;white-space:nowrap;letter-spacing:-.01em;${style};${L.color ? `color:${L.color};` : ''}`;
  let tr = '', fl = '', inner = esc(txt);
  const a = L.anim || 'pop';
  if (a === 'pop') { const k = E.outBack(prog(lt, 0, .28), 2); tr = `scale(${lerp(.3, 1, k).toFixed(3)})`; o *= clamp(lt / .12); }
  if (a === 'fade') o *= E.outCubic(prog(lt, 0, .25));
  if (a === 'slide_l' || a === 'slide_r') {
    const k = E.outExpo(prog(lt, 0, .35)), dir = a === 'slide_l' ? -1 : 1;
    tr = `translateX(${(dir * (1 - k) * 420).toFixed(1)}px) skewX(${(dir * (1 - k) * -12).toFixed(1)}deg)`; fl = `blur(${((1 - k) * 10).toFixed(1)}px)`;
  }
  if (a === 'drop') { const k = E.outBack(prog(lt, 0, .3), 1.6); tr = `translateY(${((1 - k) * -90).toFixed(1)}px)`; o *= clamp(lt / .1); }
  if (a === 'blur_zoom') { const k = E.outCubic(prog(lt, 0, .35)); tr = `scale(${lerp(1.7, 1, k).toFixed(3)})`; fl = `blur(${((1 - k) * 16).toFixed(1)}px)`; o *= clamp(lt / .1); }
  if (a === 'fly') {
    // appears at from_x/from_y (pop), holds, then flies to its final x/y — "VIẾT NHƯ NGƯỜI THẬT" in the hook.
    const hold = L.hold ?? .25, fk = E.inOutSine(prog(lt, .2 + hold, .22)), pk = E.outBack(prog(lt, 0, .25), 2);
    const fx = (L.from_x ?? x) - x, fy = (L.from_y ?? y + 120) - y, fs = L.from_scale ?? .8;
    tr = `translate(${(fx * (1 - fk)).toFixed(1)}px,${(fy * (1 - fk)).toFixed(1)}px) scale(${(lerp(.3, fs, pk) * (1 - fk) + fk).toFixed(3)})`;
    o *= clamp(lt / .1);
  }
  if (a === 'tumble' || a === 'type') {
    const chars = [...txt], st = L.stagger ?? (a === 'type' ? .035 : .06);
    inner = chars.map((c, i) => {
      const k = prog(lt, i * st, a === 'type' ? .001 : .28);
      if (k <= 0) return `<span style="opacity:0">${esc(c)}</span>`;
      if (a === 'type') return esc(c);
      const e = E.outBack(k, 1.8);
      return `<span style="display:inline-block;white-space:pre;opacity:${clamp(k * 3).toFixed(2)};transform:perspective(300px) rotateX(${((1 - e) * -95).toFixed(1)}deg) translateY(${((1 - e) * 26).toFixed(1)}px)">${esc(c)}</span>`;
    }).join('');
  }
  return `<div${L.cid ? ` data-cid="${L.cid}"` : ''} style="${base}transform:translate(-50%,-50%) ${tr};filter:${fl || 'none'};opacity:${o.toFixed(3)}">${inner}</div>`;
}
const lines = (s, t) => (s.lines || []).map(L => textLine(L, t, s.keep ? null : s.t1)).join('');

// ---------- backgrounds ----------
// Red→orange→yellow radial with an irregular orange grid (segments with gaps), drifting slowly.
function gridBg(t, s = {}) {
  const cx = s.glow_x ?? 360, cy = s.glow_y ?? 600;
  const c = s.colors || [V.yellow, V.orange, V.red];
  let segs = '';
  const cell = s.cell ?? 122, drift = (t * (s.drift ?? 5)) % cell;
  for (let i = -1; i < VH / cell + 1; i++) {
    for (let j = 0; j < 3; j++) {
      if (rnd(i * 7 + j) < .35) continue;
      const x0 = rnd(i * 13 + j * 5) * VW * .7, w = 120 + rnd(i * 3 + j) * 420;
      segs += `<i style="position:absolute;left:${x0.toFixed(0)}px;top:${(i * cell + 30 + drift).toFixed(0)}px;width:${w.toFixed(0)}px;height:2px;background:${V.line}"></i>`;
    }
  }
  for (let i = 0; i < VW / cell + 1; i++) {
    for (let j = 0; j < 3; j++) {
      if (rnd(i * 11 + j + 50) < .3) continue;
      const y0 = rnd(i * 17 + j * 9) * VH * .8, h = 140 + rnd(i * 5 + j + 9) * 520;
      segs += `<i style="position:absolute;left:${(i * cell + 116).toFixed(0)}px;top:${y0.toFixed(0)}px;width:2px;height:${h.toFixed(0)}px;background:${V.line}"></i>`;
    }
  }
  return `<div class="full" style="background:radial-gradient(ellipse 70% 42% at ${cx}px ${cy}px, ${c[0]} 0%, ${c[1]} 48%, ${c[2]} 100%)"></div>
    <div class="full" style="opacity:${s.grid_opacity ?? 1}">${segs}</div>
    <div class="full" style="background:radial-gradient(ellipse 90% 70% at 50% 50%, transparent 55%, rgba(80,0,0,.35) 100%)"></div>`;
}

// ---------- the speaker ----------
// Raw camera frame (or cutout when available) mapped so that the face point (fx,fy in frame px) lands at (cx,cy) with zoom z.
function facePlaced(t, { cx, cy, z, fx, fy, cut = false, filter = '' }) {
  const n = frameAt(t);
  const raw = url(fmtSeq(TL.aroll.frames, n));
  const src = cut && TL.aroll.cutouts ? url(fmtSeq(TL.aroll.cutouts, n)) : raw;
  // Camera frames follow the project orientation (1280×720 in a 16:9 project).
  const [FW, FH] = typeof DIMS === 'function' ? DIMS() : [VW, VH];
  const w = FW * z, h = FH * z, l = cx - fx * z, tp = cy - fy * z;
  // A missing cutout falls back to the raw frame (circle crop still looks right).
  return `<img src="${src}" ${src !== raw ? `onerror="this.onerror=null;this.src='${raw}'"` : ''} style="position:absolute;left:${l.toFixed(1)}px;top:${tp.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;filter:${GRADES.normal} ${filter}">`;
}
const FACE = () => TL.face || { x: 360, y: 520 };
// Circle cam. kind "bubble" = cutout on yellow disc (screen-share layout); "pip" = raw crop over blur (spotlight layout).
function faceCircle(t, s, kind) {
  const b = { ...(kind === 'bubble' ? { cx: 360, cy: 315, d: 275, z: .55, bg: V.bubble } : { cx: 360, cy: 330, d: 310, z: .62, bg: '#000' }), ...(s[kind] || {}) };
  const f = FACE();
  const pt = s[kind + '_t'] ?? s.t0, k = E.outBack(prog(t, pt, .3), 1.7);
  const inner = facePlaced(t, { cx: b.d / 2, cy: b.d / 2 + b.d * .08, z: b.z, fx: f.x, fy: f.y, cut: kind === 'bubble' });
  return `<div class="abs" style="left:${b.cx - b.d / 2}px;top:${b.cy - b.d / 2}px;width:${b.d}px;height:${b.d}px;border-radius:50%;overflow:hidden;background:${b.bg};
    border:${kind === 'bubble' ? `3px solid #E3A53A` : '0'};box-shadow:0 10px 30px rgba(0,0,0,.25);transform:scale(${clamp(k, 0, 2).toFixed(3)});opacity:${clamp((t - pt) / .08).toFixed(2)}">${inner}</div>`;
}

// ---------- screen content (inside cards) ----------
// screen: { media:"x.png"|{seq,fps,count}, fit, pan:[{t,s,x,y}] } | { chat:{...} } | { broll:{template,...} }
function screenContent(sc, t, w, h, s) {
  if (!sc) return '';
  let html = '';
  if (sc.chat) html = chatUI(sc.chat, t, w, h);
  else if (sc.broll) {
    // Catalog ids are "<topic>--<template>--<palette>": resolve them when no explicit template is given.
    const [, tpl, pal] = (sc.broll.id || '').split('--');
    const b = { ...(tpl && !sc.broll.template ? { template: tpl, pal } : {}), ...sc.broll, t0: s.t0, t1: s.t1, layout: 'full', keep: true };
    const r = MODULES.broll(b, t, t - s.t0) || {};
    // Contain-fit (presets keep text near the 1280 edges), centred on the preset's own dark base.
    const k = Math.min(w / 1280, h / 720);
    html = `<div class="full" style="background:#120c0a"></div><div style="position:absolute;left:${((w - 1280 * k) / 2).toFixed(1)}px;top:${((h - 720 * k) / 2).toFixed(1)}px;width:1280px;height:720px;transform:scale(${k.toFixed(4)});transform-origin:0 0">${r.front || r.back || ''}</div>`;
  } else if (sc.media) html = `<img src="${media(sc.media, t)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${sc.fit || 'cover'};object-position:${sc.pos || '50% 0%'}">`;
  const pk = panAt(sc.pan, t);
  return pk ? `<div class="full" style="transform-origin:${pk.x}% ${pk.y}%;transform:scale(${pk.s.toFixed(4)})">${html}</div>` : html;
}
// Keyframed zoom/pan inside a card (eases between keys): [{t, s, x, y}] with x/y = focus point in %.
function panAt(keys, t) {
  if (!keys || !keys.length) return null;
  let a = keys[0], b = keys[0];
  for (const k of keys) { if (k.t <= t) a = k; if (k.t > t) { b = k; break; } b = k; }
  const d = (b.ease ?? .45), kk = a === b ? 1 : E.inOutSine(clamp((t - b.t + d) / d));
  const g = (p, def) => lerp(a[p] ?? def, b[p] ?? def, b.t - t > d ? 0 : kk);
  return { s: g('s', 1), x: g('x', 50), y: g('y', 0) };
}

// Generic light chat UI (prompt → streamed answer). Not a copy of any product UI; colours/labels configurable.
// chat: { messages:[{role:"user"|"ai", text, t, cps}], input:{text, t0, t1}, note, font }
function chatUI(c, t, w, h) {
  const fs = c.font || 15;
  let body = '';
  for (const m of c.messages || []) {
    if (t < m.t) continue;
    if (m.role === 'user') {
      body += `<div style="display:flex;justify-content:flex-end;margin:14px 0 10px"><div style="max-width:68%;background:#F1F1F1;border-radius:18px;padding:9px 14px;color:#1d4e7a;font-size:${fs}px;line-height:1.45">${md(m.text)}</div></div>`;
    } else {
      const n = Math.floor((t - m.t) * (m.cps || 90));
      const shown = m.text.slice(0, n);
      if (m.note) body += `<div style="color:#8e8e8e;font-size:${fs - 3}px;margin:6px 0">🗂 ${esc(m.note)}</div>`;
      body += `<div style="color:#0d0d0d;font-size:${fs}px;line-height:1.55">${md(shown)}${n < m.text.length ? '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#111;margin-left:4px"></span>' : ''}</div>`;
      if (n >= m.text.length && c.actions !== false) body += `<div style="color:#999;font-size:${fs}px;margin:8px 0 4px;letter-spacing:6px">⧉ 👍 👎 ↻ ⋯</div>`;
    }
  }
  let input = '';
  if (c.input) {
    const I = c.input, typing = t >= I.t0 && t < I.t1, n = typing ? Math.floor((t - I.t0) / Math.max(.01, (I.t1 - I.t0) * .85) * I.text.length) : 0;
    const txt = typing ? I.text.slice(0, n) : '';
    input = `<div style="position:absolute;left:14px;right:14px;bottom:12px;border:1px solid #e3e3e3;border-radius:22px;padding:12px 56px 12px 16px;font-size:${fs}px;color:${txt ? '#0d0d0d' : '#9a9a9a'};background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.06);white-space:nowrap;overflow:hidden">
      ${txt ? esc(txt) + (Math.floor(t * 2) % 2 ? '|' : '') : esc(c.placeholder || 'Hỏi bất kỳ điều gì')}
      <span style="position:absolute;right:8px;top:6px;width:32px;height:32px;border-radius:50%;background:${txt ? '#111' : '#cfcfcf'};color:#fff;text-align:center;line-height:32px;font-size:16px">↑</span></div>`;
  }
  return `<div class="full" style="background:#fff;font-family:var(--ui)"><div class="autoscroll" style="position:absolute;left:0;right:0;top:0;bottom:${c.input ? 68 : 0}px;overflow:hidden;padding:${c.pad || '18px 26px 18px 26px'}">${body}</div>${input}</div>`;
}
// Tiny markdown: **bold**, "- " bullets, line breaks.
function md(s) {
  return esc(s).split('\n').map(l => {
    l = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    return /^\s*[-•] /.test(l) ? `<div style="padding-left:22px;position:relative;margin:2px 0"><span style="position:absolute;left:6px">•</span>${l.replace(/^\s*[-•] /, '')}</div>` : `<div>${l || '&nbsp;'}</div>`;
  }).join('');
}

// Enter motions for card layouts.
function enterTr(kind, t, t0) {
  if (!kind || kind === 'cut') return '';
  const k = E.outCubic(prog(t, t0, kind === 'fade' ? .25 : .32));
  if (kind === 'drop') return `transform:translateY(${((1 - k) * -VH).toFixed(1)}px);`;
  if (kind === 'push_up') return `transform:translateY(${((1 - k) * VH).toFixed(1)}px);`;
  if (kind === 'fade') return `opacity:${k.toFixed(3)};`;
  if (kind === 'zoom') return `transform:scale(${lerp(1.25, 1, k).toFixed(3)});opacity:${k.toFixed(3)};`;
  return '';
}
const entering = (s, t) => s.enter && s.enter !== 'cut' && t < s.t0 + .32;

// ---------- sticker / icon ----------
// Image with a thick white die-cut outline + soft shadow. src = png (ideally transparent) | emoji char.
function stickerHTML(st, t) {
  if (!st || t < st.t) return '';
  const lt = t - st.t, sz = st.size || 320, x = st.x ?? 360, y = st.y ?? 960;
  const from = st.from || 'left', k = E.outCubic(prog(lt, 0, .3)), dir = from === 'left' ? -1 : from === 'right' ? 1 : 0;
  const trUp = from === 'up' || from === 'down'
    ? `translateY(${((from === 'up' ? 1 : -1) * (1 - E.outBack(prog(lt, 0, .35), 1.4)) * 420).toFixed(1)}px)` : '';
  let tr = trUp || (from === 'pop' ? `scale(${lerp(.2, 1, E.outBack(prog(lt, 0, .3), 2)).toFixed(3)})` : `translateX(${(dir * (1 - k) * 520).toFixed(1)}px)`);
  tr += ` ${st.bob === false ? '' : `rotate(${(Math.sin(lt * 2.2) * 2).toFixed(2)}deg)`}`;
  const blur = from === 'pop' ? 0 : trUp ? (1 - k) * 8 : (1 - k) * 18;
  const ol = st.outline ?? 7;
  const outline = Array.from({ length: 12 }, (_, i) => { const r = i / 12 * Math.PI * 2; return `drop-shadow(${(Math.cos(r) * ol).toFixed(1)}px ${(Math.sin(r) * ol).toFixed(1)}px 0 #fff)`; }).join(' ');
  const inner = /\.(png|jpe?g|webp|svg|gif)$/i.test(st.src || '') || /^(https?:|data:)/.test(st.src || '')
    ? `<img src="${url(st.src)}" style="width:100%;height:100%;object-fit:contain">`
    : emoji(st.src || '✅', 0, 0, sz, 'position:absolute');
  return `<div class="abs" style="left:${x - sz / 2}px;top:${y - sz / 2}px;width:${sz}px;height:${sz}px;transform:${tr};filter:${st.outline === 0 ? '' : outline} drop-shadow(0 10px 18px rgba(0,0,0,.35)) blur(${blur.toFixed(1)}px);opacity:${clamp(lt / .08).toFixed(2)}">${inner}</div>`;
}
// Brand/logo icons: "si:openai" → Simple Icons SVG (CC0) via jsDelivr; else image path / emoji.
const SI_CDN = CDN + 'npm/simple-icons@13.0.0/icons/';
function iconHTML(icon, size, color = '#fff', stroke = '#111') {
  if (icon.startsWith('si:')) {
    const u = SI_CDN + icon.slice(3) + '.svg';
    // Glyphs are black; white = invert (CSS masks don't load cross-origin from file://). Stroke = outline ring of drop-shadows.
    const ring = Array.from({ length: 8 }, (_, i) => { const r = i / 8 * Math.PI * 2; return `drop-shadow(${(Math.cos(r) * 4).toFixed(1)}px ${(Math.sin(r) * 4).toFixed(1)}px 0 ${stroke})`; }).join(' ');
    return `<div style="width:${size}px;height:${size}px;filter:${ring}"><img src="${u}" style="width:100%;height:100%;object-fit:contain;filter:${color === '#000' || color === 'black' ? 'none' : 'invert(1)'}"></div>`;
  }
  if (/\.(png|jpe?g|webp|svg)$/i.test(icon) || /^https?:/.test(icon)) return `<img src="${url(icon)}" style="width:${size}px;height:${size}px;object-fit:contain">`;
  return emoji(icon, 0, 0, size, 'position:relative');
}
// Pixel-art hand cursor (SVG, drawn here; no external asset).
const HAND = `<svg viewBox="0 0 17 22" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="M5 0h2v1h1v6h2v1h2v1h2v1h1v1h1v6h-1v3h-1v2H5v-2H4v-2H3v-2H2v-2H1v-1H0v-3h3v1h1V1h1z"/><path fill="#fff" d="M5 1h2v7h1V8h2v1h1v1h1V10h2v1h1v6h-1v3h-1v1H6v-2H5v-2H4v-2H3v-2H2v-1H1v-1h2v1h1v1h1z"/></svg>`;

const VMOD = {
  // Solid grid background for any span (use under text-only moments).
  grid_bg(s, t) { return { back: gridBg(t, s), cover: true }; },

  // Layout A — hook: rounded white card on top, speaker cutout bottom, 2-line title in between.
  hook_card(s, t, lt) {
    const c = { x: 50, y: 78, w: 620, h: 407, r: 38, ...(s.card || {}) };
    const ck = E.outBack(prog(t, s.card_t ?? s.t0, .35), 1.4);
    const card = `<div class="abs" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:${c.r}px;overflow:hidden;background:#fff;border:3px solid #111;
      box-shadow:0 14px 34px rgba(0,0,0,.28);transform:translateY(${((1 - ck) * -60).toFixed(1)}px) scale(${lerp(.9, 1, ck).toFixed(3)});opacity:${clamp(ck * 2).toFixed(2)}">${screenContent(s.screen, t, c.w, c.h, s)}</div>`;
    const p = { dy: 450, z: 1, ...(s.speaker || {}) };
    const f = FACE();
    const person = TL.aroll ? `<div class="full" style="overflow:hidden">${facePlaced(t, { cx: f.x, cy: f.y + p.dy, z: p.z, fx: f.x, fy: f.y, cut: true })}</div>` : '';
    return { back: gridBg(t, s) + card + person, front: lines(s, t), cover: true, hideCaptions: true };
  },

  // Layout B — screen share: grid bg, face bubble (top), bordered screen card (bottom half).
  bubble_screen(s, t, lt) {
    const c = { x: 8, y: 545, w: 704, h: 455, ...(s.card || {}) };
    const card = `<div class="abs" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;overflow:hidden;background:#fff;border:3px solid #0f0e0a;box-shadow:0 12px 30px rgba(60,0,0,.35)">
      ${screenContent(s.screen, t, c.w - 6, c.h - 6, s)}</div>`;
    const body = gridBg(t, s) + card;
    const bubble = faceCircle(t, s, 'bubble');
    const en = enterTr(s.enter, t, s.t0);
    return {
      back: `<div class="full" style="${en}">${body}</div>` + bubble,
      front: lines(s, t) + (s.sticker ? stickerHTML(s.sticker, t) : ''),
      cover: !entering(s, t), hideCaptions: s.hideCaptions ?? true,
    };
  },

  // Layout C — spotlight: blurred camera, sharp circle cam on top, label + hero (3D tumble), sticker below.
  spotlight(s, t, lt) {
    const blurK = E.outCubic(prog(lt, 0, .18));
    const bg = `<div class="full" style="overflow:hidden">${arollImg(t, `blur(${(blurK * (s.blur ?? 16)).toFixed(1)}px) brightness(${lerp(1, .92, blurK).toFixed(3)})`, 'transform:scale(1.08)')}</div>`;
    return { back: bg + faceCircle(t, s, 'pip'), front: lines(s, t) + stickerHTML(s.sticker, t), cover: true, hideCaptions: true };
  },

  // Icon + pixel hand tapping it (e.g. "si:openai" when the speaker says "vô ChatGPT").
  icon_tap(s, t, lt) {
    const sz = s.size || 200, x = s.x ?? 360, y = s.y ?? 985;
    const k = E.outBack(prog(lt, 0, .3), 2.2);
    const taps = s.taps ?? [.55, 1.15];
    let press = 0;
    for (const tp of taps) { const d = lt - tp; if (d >= 0 && d < .22) press = Math.sin(d / .22 * Math.PI); }
    const ic = `<div class="abs" style="left:${x - sz / 2}px;top:${y - sz / 2}px;transform:scale(${(clamp(k, 0, 1.3) * (1 - press * .08)).toFixed(3)});opacity:${clamp(lt / .1).toFixed(2)}">${iconHTML(s.icon || 'si:openai', sz, s.color || '#fff', s.stroke || '#111')}</div>`;
    const hs = s.hand_size || 96, hx = x + sz * .3, hy = y + sz * .22;
    const hk = E.outCubic(prog(lt, .15, .3));
    const hand = s.hand === false ? '' : `<div class="abs" style="left:${hx}px;top:${hy}px;width:${hs}px;height:${hs * 22 / 17}px;transform:translate(${((1 - hk) * 120).toFixed(1)}px,${((1 - hk) * 90 - press * 10).toFixed(1)}px) scale(${(1 - press * .1).toFixed(3)});opacity:${hk.toFixed(2)}">${HAND}</div>`;
    return { front: ic + hand };
  },

  // Free text overlay (any layout): lines[] — e.g. "/humanizer" ink stack, "KHÔNG VIẾT..." fire, "TRỌN BỘ..." glow.
  text(s, t) { return { front: lines(s, t), hideCaptions: s.hideCaptions ?? true }; },

  // Sticker on its own.
  sticker(s, t) { return { front: stickerHTML({ ...s, t: s.t ?? s.t0 }, t) }; },

  // CTA: black "Follow" pill grows open, then a neon keyword ("GPT") pops under it.
  follow_cta(s, t, lt) {
    const y = s.y ?? 858, w = s.w ?? 306, h = s.h ?? 98;
    const k = E.outCubic(prog(lt, 0, .35)), tk = prog(lt, .25, .25);
    const pill = `<div class="abs" style="left:${360 - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;transform:scaleX(${lerp(.25, 1, k).toFixed(3)}) scaleY(${lerp(.6, 1, k).toFixed(3)});
      background:#0b0b0b;border:3px solid #fff;border-radius:22px;box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;gap:16px;opacity:${clamp(lt / .08).toFixed(2)}">
      <div style="position:relative;width:52px;height:52px;border-radius:50%;background:radial-gradient(circle at 50% 36%,#f2f2f2 0 17%,transparent 18%),radial-gradient(ellipse 34% 26% at 50% 86%,#f2f2f2 0 98%,transparent 100%),#9a9a9a;opacity:${tk.toFixed(2)}">
        <div style="position:absolute;right:-4px;bottom:-4px;width:24px;height:24px;border-radius:50%;background:#22c55e;border:2px solid #0b0b0b;color:#fff;font-size:15px;line-height:20px;text-align:center;font-weight:900;transform:scale(${E.outBack(prog(lt, .6, .25), 2.5).toFixed(3)})">✓</div></div>
      <span style="font-family:var(--ui);font-weight:800;font-size:40px;color:#fff;opacity:${tk.toFixed(2)};transform:translateY(${((1 - tk) * 14).toFixed(1)}px);display:inline-block">${esc(s.label || 'Follow')}</span></div>`;
    const kw = s.keyword ? textLine({ style: 'neon', size: 110, y: y + 157, anim: 'pop', upper: false, ...s.keyword }, t, s.keep ? null : s.t1) : '';
    return { front: pill + kw };
  },

};
Object.assign(MODULES, VMOD);
