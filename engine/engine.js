// Seekable frame renderer: window.init(timeline) once, then await window.renderFrame(t) per frame.
// Every frame is rebuilt from scratch from t alone, so any frame can be rendered in any order.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  linear: k => k,
  inQuad: k => k * k,
  outCubic: k => 1 - Math.pow(1 - k, 3),
  inCubic: k => k * k * k,
  outExpo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  inOutSine: k => -(Math.cos(Math.PI * k) - 1) / 2,
  outBack: (k, s = 1.70158) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2),
};
const prog = (t, t0, dur) => clamp((t - t0) / dur);

// Entrance/exit presets from references/style-bible.md §5.
const PRESET = {
  label: { dur: .18, ease: E.outCubic, y: 8, s: 1, b: 0 },
  hero: { dur: .28, ease: k => E.outBack(k, 1.6), y: 14, s: 1.06, b: 12 },
  mega: { dur: .35, ease: E.outExpo, y: 0, s: 1.25, b: 18 },
  pop: { dur: .30, ease: k => E.outBack(k, 2.2), y: 0, s: .4, b: 0 },
  stamp: { dur: .22, ease: k => E.outBack(k, 2.5), y: 0, s: 1.6, b: 0 },
  fade: { dur: .25, ease: E.outCubic, y: 0, s: 1, b: 0 },
};
function anim(t, tin, tout, kind = 'label', extra = '') {
  const P = PRESET[kind] || PRESET.label;
  if (t < tin) return 'opacity:0;';
  const k = P.ease(prog(t, tin, P.dur));
  const kl = clamp(k, 0, 1);
  let o = kind === 'pop' || kind === 'stamp' ? clamp(prog(t, tin, P.dur * .5)) : kl;
  const ko = tout != null ? E.inOutSine(prog(t, tout - .22, .22)) : 0;
  o *= 1 - ko;
  const y = lerp(P.y, 0, k) - ko * 6, s = lerp(P.s, 1, k) * (1 - ko * .06), b = lerp(P.b, 0, kl) + ko * 4;
  return `opacity:${o.toFixed(3)};transform:translateY(${y.toFixed(1)}px) scale(${s.toFixed(3)}) ${extra};` +
    (b > .3 ? `filter:blur(${b.toFixed(1)}px);` : '');
}
const bob = (t, phase = 0, amp = 6) => `translateY(${(Math.sin((t + phase) * 2.6) * amp).toFixed(1)}px) rotate(${(Math.sin((t + phase) * 1.9) * 4).toFixed(1)}deg)`;

let TL = null;
const url = p => (!p ? '' : /^(https?:|file:|data:)/.test(p) ? p : TL.base + p);
const pad = (n, w) => String(n).padStart(w, '0');
// '@clip' / '@cut' are virtual patterns for the main track (TL.clips): frame n of the OUTPUT maps to the
// right clip's source frame, so every module that reads TL.aroll.frames follows cuts, speed and reorder.
const fmtSeq = (pattern, n) => (pattern === '@clip' || pattern === '@cut' ? clipPath((n - 1) / TL.fps, pattern === '@cut')
  : pattern.replace(/%0(\d)d/, (_, w) => pad(n, +w)));
const frameAt = t => Math.min(TL.aroll?.count || 1e9, Math.max(1, Math.floor(t * TL.fps + 1e-6) + 1));

// Media item: "x.jpg" | {src} | {seq:"dir/%05d.jpg", fps, count, t0}
function media(item, t) {
  if (!item) return '';
  if (typeof item === 'string') return url(item);
  if (item.src) return url(item.src);
  const n = Math.floor((t - (item.t0 || 0)) * (item.fps || TL.fps)) % (item.count || 1) + 1;
  return url(fmtSeq(item.seq, Math.max(1, n)));
}

// Fluent 3D emoji (1,500+, index in fluent_index.js) via jsDelivr; system emoji fallback via onerror.
const FLUENT_CDN = CDN + 'gh/microsoft/fluentui-emoji@main/assets/';
const fluentPath = ch => (typeof FLUENT_INDEX === 'undefined' ? null
  : FLUENT_INDEX[ch] || FLUENT_INDEX[ch.replace(/\uFE0F/g, '')] || FLUENT_INDEX[ch + '\uFE0F']);
function emoji(ch, x, y, size, style = '') {
  const p = TL.fluent !== false && fluentPath(ch);
  const fb = `<span style="font-size:${Math.round(size * .9)}px">${ch}</span>`;
  const inner = p
    ? `<img src="${TL.emoji_dir ? url(TL.emoji_dir + '/' + p) : FLUENT_CDN + encodeURI(p)}" onerror="this.outerHTML='${fb.replace(/"/g, '&quot;')}'">`
    : fb;
  return `<div class="emoji" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;${style}">${inner}</div>`;
}

// ---------- main track: TL.clips (spec: references/clips.md) ----------
// clip = { src: {seq,fps,count} | "still.jpg", audio?, in, out, speed=1, volume=1, filter:{preset,brightness,contrast,
//          saturate,hue,temp,blur}, flip, fit:"cover"|"contain"|"blurfill", zoom, ox, oy, cutouts?, transition:{type,dur} }
let CLIPS = [];
function layoutClips() {
  CLIPS = [];
  let t = 0;
  for (const c of TL.clips || []) {
    if (c.hidden) continue;
    const d = Math.max(1 / TL.fps, ((c.out ?? 3) - (c.in || 0)) / (c.speed || 1));
    CLIPS.push({ ...c, t0: t, t1: t + d });
    t += d;
  }
  return t;
}
function clipAt(t) {
  if (!CLIPS.length) return null;
  let i = CLIPS.findIndex(c => t < c.t1);
  if (i < 0) i = CLIPS.length - 1;
  const c = CLIPS[i];
  return { c, i, lt: t - c.t0, src: (c.in || 0) + Math.max(0, t - c.t0) * (c.speed || 1) };
}
function srcFrame(c, srcT, cut) {
  if (typeof c.src === 'string') return cut ? (c.cutout_img || c.src) : c.src;
  const fps = c.src.fps || TL.fps, n = Math.min(c.src.count || 1e9, Math.max(1, Math.floor(srcT * fps + 1e-6) + 1));
  return fmtSeq(cut && c.cutouts ? c.cutouts : c.src.seq, n);
}
function clipPath(t, cut) { const k = clipAt(t); return k ? srcFrame(k.c, k.src, cut) : ''; }
const LUT = {
  warm: 'sepia(.22) saturate(1.2) hue-rotate(-8deg)', cool: 'saturate(1.05) hue-rotate(12deg) brightness(1.02)',
  vivid: 'saturate(1.45) contrast(1.1)', bw: 'grayscale(1) contrast(1.15)', film: 'sepia(.3) contrast(1.08) saturate(.85)',
  fade: 'contrast(.86) brightness(1.08) saturate(.8)', night: 'brightness(.8) saturate(1.2) hue-rotate(195deg) contrast(1.1)',
  pop: 'saturate(1.6) contrast(1.15) brightness(1.04)',
};
function clipFilter(c) {
  const f = c.filter || {};
  let s = f.preset ? LUT[f.preset] || '' : '';
  if (f.brightness != null) s += ` brightness(${f.brightness})`;
  if (f.contrast != null) s += ` contrast(${f.contrast})`;
  if (f.saturate != null) s += ` saturate(${f.saturate})`;
  if (f.hue) s += ` hue-rotate(${f.hue}deg)`;
  if (f.temp) s += f.temp > 0 ? ` sepia(${(f.temp * .5).toFixed(2)})` : ` hue-rotate(${(f.temp * 25).toFixed(0)}deg)`;
  if (f.blur) s += ` blur(${f.blur}px)`;
  return s;
}
// Auto-reframe (references/reframe-dub.md): clip.reframe = [{t, ox, oy}] = face centre (% of the source) keyed by SOURCE time,
// clip.ar = source width/height. Pans the cover crop so the face sits centred (x) / at 42% height (y); off with clip.reframe_off.
let FRAME_AR = 9 / 16;
function reframeAt(keys, s) {
  const i = keys.findIndex(k => k.t > s);
  if (i <= 0) return keys[i < 0 ? keys.length - 1 : 0];
  const a = keys[i - 1], b = keys[i], k = (s - a.t) / (b.t - a.t || 1);
  return { ox: lerp(a.ox, b.ox, k), oy: lerp(a.oy, b.oy, k) };
}
// object-position / transform-origin that put the face at x 50% / y 42% of a box of aspect boxAr (clamped to the image edges).
function reframePos(ox, oy, ar, boxAr, flip) {
  const axis = (fc, over, aim) => { if (over <= 1.001) return [50, fc]; const p = clamp((fc / 100 * over - aim) / (over - 1)); return [p * 100, (fc / 100 * over - p * (over - 1)) * 100]; };
  const [px, sx] = axis(ox, ar / boxAr, .5), [py, sy] = axis(oy, boxAr / ar, .42);
  return [`${px.toFixed(2)}% ${py.toFixed(2)}%`, `${flip ? 50 : sx.toFixed(2)}% ${sy.toFixed(2)}%`];
}
function reframeCss(c, srcT) {
  if (!c.reframe?.length || c.reframe_off || (c.fit && c.fit !== 'cover')) return '';
  const f = reframeAt(c.reframe, srcT), ar = c.ar || 16 / 9, [op, to] = reframePos(f.ox, f.oy, ar, FRAME_AR, c.flip);
  // --rf lets renderFrame() redo this for the real box when a module draws the clip in a card that is not full-frame
  return `--rf:${f.ox.toFixed(2)} ${f.oy.toFixed(2)} ${ar} ${c.flip ? 1 : 0};object-position:${op};transform-origin:${to}`;
}
// Post-layout pass (renderFrame): recompute for the real box size, and also pan modules that draw the main track themselves
// (url(fmtSeq(TL.aroll.frames…)) with object-fit:cover and no object-position of their own, e.g. slate's frame_grid card).
function fixReframe(stage, t) {
  const k = CLIPS.length ? clipAt(t) : null, c = k?.c;
  const live = c && c.reframe?.length && !c.reframe_off && (!c.fit || c.fit === 'cover') && typeof c.src !== 'string';
  const abs = p => new URL(url(p), document.baseURI).href;
  const srcs = live ? [abs(srcFrame(c, k.src)), c.cutouts ? abs(srcFrame(c, k.src, true)) : null] : [];
  for (const im of stage.querySelectorAll('img')) {
    let v = im.style.getPropertyValue('--rf').trim(), own = !!v;
    if (!v && live && srcs.includes(im.src) && !im.style.objectPosition && getComputedStyle(im).objectFit === 'cover') {
      const f = reframeAt(c.reframe, k.src); v = `${f.ox} ${f.oy} ${c.ar || 16 / 9} ${c.flip ? 1 : 0}`;
    }
    if (!v) continue;
    const [ox, oy, ar, fl] = v.split(' ').map(Number), w = im.offsetWidth, h = im.offsetHeight;
    if (!w || !h || (own && Math.abs(w / h - FRAME_AR) < .01)) continue;
    const [op, to] = reframePos(ox, oy, ar, w / h, fl);
    im.style.objectPosition = op; if (own) im.style.transformOrigin = to;
  }
}
function clipLayer(c, srcT, t, extraFilter = '', style = '') {
  const rf = reframeCss(c, srcT);
  const tr = `${c.flip ? 'scaleX(-1) ' : ''}scale(${c.zoom || 1})`;
  const img = `<img src="${url(srcFrame(c, srcT))}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${c.fit === 'contain' || c.fit === 'blurfill' ? 'contain' : 'cover'};
    transform:${tr};${rf || `transform-origin:${c.ox ?? 50}% ${c.oy ?? 45}%`};filter:${gradeBase(t)} ${extraFilter}">`;
  const bg = c.fit === 'blurfill' ? `<img src="${url(srcFrame(c, srcT))}" style="position:absolute;inset:-40px;width:calc(100% + 80px);height:calc(100% + 80px);object-fit:cover;filter:blur(30px) brightness(.7)">` : '';
  // Background replace: person cutout (clip.cutouts) over blur / colour / image / nothing; frames without a cutout show the plain frame.
  if (c.cutouts && c.bg?.type) {
    const b = c.bg, raw = url(srcFrame(c, srcT)), fit = c.fit === 'contain' || c.fit === 'blurfill' ? 'contain' : 'cover';
    const under = b.type === 'blur' ? `<img src="${raw}" style="position:absolute;inset:-40px;width:calc(100% + 80px);height:calc(100% + 80px);object-fit:cover;filter:blur(${b.blur ?? 26}px) brightness(${b.dim ?? .8})">`
      : b.type === 'color' ? `<div class="full" style="background:${b.color || '#151515'}"></div>`
      : b.type === 'image' && b.src ? `<img src="${media(b.src, t)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : '';
    const cut = `<img src="${url(srcFrame(c, srcT, true))}" onerror="this.onerror=null;this.src='${raw}'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${fit};
      transform:${tr};${rf || `transform-origin:${c.ox ?? 50}% ${c.oy ?? 45}%`};filter:${gradeBase(t)} ${extraFilter}">`;
    return `<div class="full" style="overflow:hidden;${style}${maskCss(c.mask)}">${under}${cut}</div>`;
  }
  const inner = `<div class="full" style="overflow:hidden;${style}${maskCss(c.mask)}">${bg}${img}</div>`;
  return c.mask?.bg ? `<div class="full"><div class="full" style="background:${c.mask.bg}"></div>${inner}</div>` : inner;
}
// Transition INTO clip c over its first `dur` seconds; the previous clip keeps playing underneath.
const TRANS = {
  fade: k => [`opacity:${k}`, ''],
  dissolve: k => [`opacity:${k}`, ''],
  slide_l: k => [`transform:translateX(${((1 - E.outCubic(k)) * 100).toFixed(2)}%)`, ''],
  slide_r: k => [`transform:translateX(${(-(1 - E.outCubic(k)) * 100).toFixed(2)}%)`, ''],
  slide_up: k => [`transform:translateY(${((1 - E.outCubic(k)) * 100).toFixed(2)}%)`, ''],
  push: k => [`transform:translateX(${((1 - E.inOutSine(k)) * 100).toFixed(2)}%)`, `transform:translateX(${(-E.inOutSine(k) * 100).toFixed(2)}%)`],
  zoom: k => [`opacity:${k};transform:scale(${lerp(1.35, 1, E.outCubic(k)).toFixed(3)})`, `transform:scale(${lerp(1, .85, k).toFixed(3)})`],
  zoom_out: k => [`opacity:${k};transform:scale(${lerp(.7, 1, E.outCubic(k)).toFixed(3)})`, `transform:scale(${lerp(1, 1.25, k).toFixed(3)})`],
  blur: k => [`opacity:${k};filter:blur(${((1 - k) * 22).toFixed(1)}px)`, `filter:blur(${(k * 22).toFixed(1)}px)`],
  whip: k => [`transform:translateX(${((1 - E.outExpo(k)) * 110).toFixed(2)}%);filter:blur(${((1 - k) * 26).toFixed(1)}px)`, `transform:translateX(${(-E.inCubic(k) * 110).toFixed(2)}%);filter:blur(${(k * 26).toFixed(1)}px)`],
  spin: k => [`opacity:${k};transform:rotate(${((1 - E.outCubic(k)) * -25).toFixed(1)}deg) scale(${lerp(1.4, 1, E.outCubic(k)).toFixed(3)})`, ''],
  wipe: k => [`clip-path:inset(0 ${((1 - E.inOutSine(k)) * 100).toFixed(2)}% 0 0)`, ''],
  circle: k => [`clip-path:circle(${(E.outCubic(k) * 75).toFixed(2)}% at 50% 50%)`, ''],
  flash: k => [`opacity:${k > .5 ? 1 : 0}`, ''],
  glitch: k => [`opacity:${k > .3 ? 1 : 0};transform:translateX(${k < .9 ? ((rnd(Math.floor(k * 20)) - .5) * 60).toFixed(0) : 0}px)`, ''],
};
function mainTrack(t, extraFilter = '', extraStyle = '') {
  const k = clipAt(t);
  if (!k) return '<div class="full" style="background:#000"></div>';
  const { c, i, lt, src } = k, tr = c.transition, prev = CLIPS[i - 1];
  const cur = clipLayer(c, src, t, `${clipFilter(c)} ${extraFilter}`, extraStyle);
  if (!tr || !prev || lt >= (tr.dur ?? .4)) return cur;
  const p = clamp(lt / (tr.dur ?? .4)), [inS, outS] = (TRANS[tr.type] || TRANS.fade)(p);
  const pSrc = (prev.out ?? 0) + lt * (prev.speed || 1);
  const flash = tr.type === 'flash' ? `<div class="full" style="background:#fff;opacity:${(1 - Math.abs(p - .5) * 2).toFixed(3)}"></div>` : '';
  return `<div class="full">${clipLayer(prev, pSrc, t, clipFilter(prev), outS)}<div class="full" style="${inS}">${cur}</div>${flash}</div>`;
}

const GRADES = {
  normal: 'contrast(1.06) saturate(1.08)',
  bw: 'grayscale(1) contrast(1.18) brightness(.92)',
  sad: 'saturate(.35) sepia(.1) hue-rotate(185deg) brightness(.82) contrast(1.05)',
  mellow: 'sepia(.25) saturate(1.15) brightness(1.05)',
  blur: 'blur(28px) brightness(.55) saturate(1.1)',
};
const activeIn = (list, t) => (list || []).filter(r => t >= r.t0 && t < r.t1);

function gradeBase(t) { const g = activeIn(TL.grade, t).pop(); return GRADES[g ? g.mode : 'normal'] || g.mode; }
function arollFilter(t) {
  const base = gradeBase(t);
  // Modules that draw TL.aroll themselves still pick up the clip's colour grade.
  const k = CLIPS.length ? clipAt(t) : null;
  return k ? `${base} ${clipFilter(k.c)}` : base;
}
function arollTransform(t) {
  const z = activeIn(TL.zoom, t).pop();
  if (!z) return '';
  const k = z.ramp ? E.inOutSine(prog(t, z.t0, z.t1 - z.t0)) : 1;
  const s = lerp(z.from ?? z.scale, z.scale, k);
  return `transform:scale(${s.toFixed(4)});transform-origin:${z.ox ?? 62}% ${z.oy ?? 35}%;`;
}
function arollImg(t, extraFilter = '', extraStyle = '') {
  if (!TL.aroll) return '<div class="full" style="background:#000"></div>';
  if (CLIPS.length) return `<div class="full" style="${arollTransform(t)}">${mainTrack(t, extraFilter, extraStyle)}</div>`;
  return `<img class="cover" src="${url(fmtSeq(TL.aroll.frames, frameAt(t)))}" style="filter:${arollFilter(t)} ${extraFilter};${arollTransform(t)}${extraStyle}">`;
}
// Person over a replaced background: real cutout if masks exist, else a soft ellipse around the speaker.
function personLayer(t) {
  const p = TL.person || { x: 62, y: 62, rx: 26, ry: 62 };
  const m = `radial-gradient(ellipse ${p.rx}% ${p.ry}% at ${p.x}% ${p.y}%, #000 62%, transparent 100%)`;
  const soft = `-webkit-mask-image:${m};mask-image:${m};`;
  if (TL.aroll?.cutouts) {
    // Missing cutout for this frame -> fall back to the soft ellipse on the plain frame.
    const fb = url(fmtSeq(TL.aroll.frames, frameAt(t)));
    return `<img class="cover" src="${url(fmtSeq(TL.aroll.cutouts, frameAt(t)))}" style="filter:${arollFilter(t)};${arollTransform(t)}"
      onerror="this.onerror=null;this.src='${fb}';this.style.cssText+='${soft}'">`;
  }
  return arollImg(t, '', soft);
}

function captionHTML(t) {
  if (TL.caption_style === 'none') return '';
  if (activeIn(TL.captionsHide, t).length) return '';
  const c = (TL.captions || []).find(c => t >= c.t0 && t < c.t1 && !c.hidden);
  if (!c) return '';
  if (CAPTION_STYLES[TL.caption_style]) return CAPTION_STYLES[TL.caption_style](c, t) + sub2HTML(c);
  let cur = -1;
  c.words.forEach((w, i) => { if (t >= w.s) cur = i; });
  return `<div id="cap" class="${TL.caption_style || ''}"${c.cid ? ` data-cid="${c.cid}"` : ''}>${c.words.map((w, i) => `<span class="${i === cur ? 'on' : ''}">${w.w}</span>`).join(' ')}</div>` + sub2HTML(c);
}
// Bilingual subtitles (references/reframe-dub.md): caption.tr shown under the active caption when TL.sub2.on;
// renderFrame() then moves it just below #cap (or above it near the bottom), so it follows every caption style's position.
const SUB2 = { plain: 'color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.9),0 0 2px #000', box: 'color:#fff;background:rgba(0,0,0,.62);padding:.15em .5em;border-radius:.3em',
  yellow: 'color:#FFE14D;text-shadow:0 2px 6px rgba(0,0,0,.9),0 0 2px #000' };
function sub2HTML(c) {
  const s = TL.sub2;
  if (!s?.on || !c.tr) return '';
  const v = FRAME_AR < 1, txt = String(c.tr).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<div id="sub2" style="position:absolute;left:${v ? 40 : 120}px;right:${v ? 40 : 120}px;top:${s.y ?? (v ? 1090 : 640)}px;text-align:center;z-index:95;pointer-events:none">
    <span style="display:inline-block;font-family:'Be Vietnam Pro',Inter,sans-serif;font-weight:600;font-size:${s.size || (v ? 27 : 25)}px;line-height:1.3;${SUB2[s.style] || SUB2.plain}">${txt}</span></div>`;
}
function placeSub2(stage) {
  const s2 = stage.querySelector('#sub2'), cap = stage.querySelector('#cap');
  if (!s2 || !cap || TL.sub2?.y != null) return;
  const sr = stage.getBoundingClientRect(), k = sr.height / stage.offsetHeight, r = cap.getBoundingClientRect();
  if (!r.height || !k) return;
  const h = s2.offsetHeight, below = (r.bottom - sr.top) / k + 8;
  s2.style.top = `${(below + h > stage.offsetHeight - 24 ? (r.top - sr.top) / k - h - 8 : below).toFixed(1)}px`;
}

// ---------- free keyframes + masks (spec: references/keyframes-mask-broll.md) ----------
// kf: [{t (absolute s), x, y (px offset), scale, rot (deg), opacity, ease: linear|in|out|inOut|back|bounce|hold}] — ease = curve leaving that key.
const KF_EASE = { linear: k => k, in: E.inCubic, out: E.outCubic, inOut: E.inOutSine, back: k => E.outBack(k, 1.7), hold: () => 0,
  bounce: k => { const n = 7.5625, d = 2.75; return k < 1 / d ? n * k * k : k < 2 / d ? n * (k -= 1.5 / d) * k + .75 : k < 2.5 / d ? n * (k -= 2.25 / d) * k + .9375 : n * (k -= 2.625 / d) * k + .984375; } };
const KF_DEF = { x: 0, y: 0, scale: 1, rot: 0, opacity: 1 };
function kfAt(kf, t) {
  const ks = [...kf].sort((a, b) => a.t - b.t), v = k => ({ ...KF_DEF, ...k });
  const i = ks.findIndex(k => k.t > t);
  if (i === 0 || i < 0) return v(ks[i === 0 ? 0 : ks.length - 1]);
  const a = v(ks[i - 1]), b = v(ks[i]), e = (KF_EASE[a.ease] || KF_EASE.linear)(clamp((t - a.t) / Math.max(1e-6, b.t - a.t)));
  const o = { ...a }; for (const p in KF_DEF) o[p] = a[p] + (b[p] - a[p]) * e; return o;
}
const kfTr = v => `translate(${(+v.x).toFixed(2)}px,${(+v.y).toFixed(2)}px) rotate(${(+v.rot).toFixed(2)}deg) scale(${(+v.scale).toFixed(4)})`;
// mask: {shape: circle|rounded|heart|star|rect|diamond|blob, x, y, w, h (% of the layer, x/y = centre), feather (%), invert, r (rounded radius)}
const MASK_SHAPES = {
  rect: () => '<rect width="100" height="100"/>', rounded: m => `<rect width="100" height="100" rx="${m.r ?? 14}"/>`,
  circle: () => '<ellipse cx="50" cy="50" rx="50" ry="50"/>', diamond: () => '<polygon points="50,0 100,50 50,100 0,50"/>',
  star: () => `<polygon points="${Array.from({ length: 10 }, (_, i) => { const a = Math.PI * (i / 5 - .5), r = i % 2 ? 21 : 50; return `${(50 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`; }).join(' ')}"/>`,
  heart: () => '<path d="M50 96C22 74 0 56 0 30 0 12 13 0 28 0c10 0 18 6 22 15C54 6 62 0 72 0c15 0 28 12 28 30 0 26-22 44-50 66z"/>',
  blob: () => '<path d="M52 1c22 1 44 14 47 38 3 22-10 45-30 55C49 104 23 97 10 79-4 60-2 33 13 17 23 6 37 0 52 1z"/>',
};
function maskCss(m) {
  if (!m || !MASK_SHAPES[m.shape]) return '';
  const x = m.x ?? 50, y = m.y ?? 50, w = Math.max(1, m.w ?? 80), h = Math.max(1, m.h ?? 60), f = +m.feather || 0;
  const shape = `<g${f ? ' filter="url(#f)"' : ''}><g transform="translate(${x - w / 2} ${y - h / 2}) scale(${w / 100} ${h / 100})" fill="${m.invert ? '#000' : '#fff'}">${MASK_SHAPES[m.shape](m)}</g></g>`;
  const defs = f ? `<filter id="f" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="${f}"/></filter>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs>${defs}${m.invert ? `<mask id="m"><rect x="-50" y="-50" width="200" height="200" fill="#fff"/>${shape}</mask>` : ''}</defs>${m.invert ? '<rect width="100" height="100" fill="#fff" mask="url(#m)"/>' : shape}</svg>`;
  const u = `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}')`; // single quotes: lives inside style="…"
  return `-webkit-mask-image:${u};mask-image:${u};-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;`;
}
// Wrap a scene's back/front in its mask, then in its keyframed transform (around s.anchor, default s.x/s.y or the frame centre).
function sceneFx(s, html, t) {
  if (!html) return html;
  if (s.mask) html = `<div class="full" style="${maskCss(s.mask)}">${html}</div>`;
  if (s.kf?.length) {
    const v = kfAt(s.kf, t), [ax, ay] = s.anchor || [s.x ?? STAGE_WH[0] / 2, s.y ?? STAGE_WH[1] / 2];
    html = `<div class="full" style="transform-origin:${ax}px ${ay}px;transform:${kfTr(v)};opacity:${clamp(v.opacity).toFixed(3)}">${html}</div>`;
  }
  return html;
}
// Text lines with kf are moved after render (any module draws them; the line keeps its own entrance anim inside).
let STAGE_WH = [720, 1280], KF_LINES = [];
function applyLineKf(stage, t) {
  for (const L of KF_LINES) {
    const el = stage.querySelector(`[data-cid="${L.cid}"]`); if (!el) continue;
    const v = kfAt(L.kf, t), cur = el.style.transform || '', re = /^translate\(-50%,\s*-50%\)/;
    el.style.transform = re.test(cur) ? cur.replace(re, m => `${m} ${kfTr(v)}`) : `${kfTr(v)} ${cur}`;
    el.style.opacity = ((el.style.opacity === '' ? 1 : +el.style.opacity) * clamp(v.opacity)).toFixed(3);
  }
}

const DEFAULT_HIDE_CAPS = new Set(['slam_bg', 'mega', 'orbit', 'mosaic', 'mosaic_wall', 'end_card', 'flash_ring']);

// Scene in/out envelope for every module, so no graphic pops on or off in a single frame: overlays ease in over 0.2 s and
// out over 0.26 s centred on t1; full-frame scenes (cover) ease in over 0.32 s with a slight zoom + blur settle. A full-frame
// scene followed straight away by another scene ("handoff": next t0 within 0.1 s of its t1) stays whole and keeps running
// for 0.32 s UNDER the next one, which crossfades in on top, so two backdrops/panels never dip to the raw camera between them.
// Not applied at the very start/end of the video, to scenes with their own fades (broll, photo), or when s.cut = true
// (a deliberate hard cut on the beat); `keep` scenes (stay to the end) only get the ease-in.
const ENV = { in: .2, out: .26, fin: .32, fout: .32 }, OWN_FADE = new Set(['broll', 'photo']);
const enveloped = s => !s.cut && !OWN_FADE.has(s.type);
function envelope(s, t, full, hand) {
  if (!enveloped(s)) return null;
  const D = TL.duration || 1e9, di = full ? ENV.fin : ENV.in, dout = full ? ENV.fout : ENV.out;
  const ki = s.t0 > .05 ? clamp((t - s.t0) / di) : 1;
  const ko = s.keep ? 0 : hand ? clamp((t - s.t1 - ENV.fin * .5) / (ENV.fin * .5)) : s.t1 < D - .05 ? clamp((t - (s.t1 - dout / 2)) / dout) : 0;
  if (ki >= 1 && ko <= 0) return null;
  return { ki, ko, o: (full ? E.inOutSine(ki) : E.outCubic(ki)) * (1 - E.inOutSine(ko)) };
}
function envWrap(html, v, full) {
  if (!html) return html;
  const sc = full ? lerp(1.04, 1, E.outCubic(v.ki)) * lerp(1, 1.02, v.ko) : lerp(.97, 1, E.outCubic(v.ki)) * lerp(1, .97, v.ko);
  const bl = full ? (1 - v.ki) * 8 + v.ko * 6 : 0;
  return `<div class="full" style="opacity:${v.o.toFixed(3)};transform:scale(${sc.toFixed(4)});transform-origin:50% 50%;${bl > .3 ? `filter:blur(${bl.toFixed(1)}px);` : ''}pointer-events:none">${html}</div>`;
}
const isFull = (s, r) => !!r.cover || DEFAULT_HIDE_CAPS.has(s.type);
// Does this scene hand off to one starting at its t1? (probed once per scene object: full at its last frame + a successor)
const HANDOFF = new WeakMap();
function handsOff(s, all) {
  if (HANDOFF.has(s)) return HANDOFF.get(s);
  const fn = MODULES[s.type];
  let h = false;
  if (fn && enveloped(s) && !s.keep && s.t1 < (TL.duration || 1e9) - .05 && all.some(o => o !== s && Math.abs(o.t0 - s.t1) < .1)) {
    try { h = isFull(s, fn(s, s.t1 - .02, s.t1 - .02 - s.t0) || {}); } catch { h = false; }
  }
  HANDOFF.set(s, h);
  return h;
}
function compose(t) {
  const D = TL.duration || 1e9, all = (TL.scenes || []).filter(s => !s.hidden), hand = [], live = [];
  for (const s of all) {
    if (t < s.t0) continue;
    // Full-frame b-rolls linger 0.25 s under whatever follows so back-to-back b-rolls crossfade instead of dipping to black.
    if (t < s.t1 || (s.type === 'broll' && (s.layout || 'full') === 'full' && t < s.t1 + .25)) (handsOff(s, all) ? hand : live).push(s);
    else if (enveloped(s) && !s.keep && s.t1 < D - .05 && t < s.t1 + ENV.fin) {
      if (handsOff(s, all)) hand.push(s);
      else if (t < s.t1 + ENV.out / 2) live.push(s);
    }
  }
  let cover = false, person = false, hideCaps = false;
  const back = [], front = [];
  // hand-off scenes first (drawn under the scene that replaces them); their module sees t1 + 0.32 s so its own fade-out
  // happens under the incoming scene too
  for (const s0 of [...hand, ...live]) {
    const h = hand.includes(s0), s = h ? { ...s0, t1: s0.t1 + ENV.fin } : s0, fn = MODULES[s.type];
    if (!fn) { console.warn('unknown module', s.type); continue; }
    const r = fn(s, t, t - s.t0) || {};
    if (s.kf?.length || s.mask) { r.back = sceneFx(s, r.back, t); r.front = sceneFx(s, r.front, t); r.cover = false; }
    const full = h || isFull(s, r), v = envelope(s0, t, full, h);
    if (v) { r.back = envWrap(r.back, v, full); r.front = envWrap(r.front, v, full); r.cover = false; }
    if (r.cover) cover = true;
    if (r.person) person = true;
    if (r.back) back.push(r.back);
    if (r.front) front.push(r.front);
    if (t < s0.t1 && (s.hideCaptions ?? (r.hideCaptions || DEFAULT_HIDE_CAPS.has(s.type)))) hideCaps = true;
  }
  return fxWrap(t, (cover ? '' : arollImg(t)) + back.join('') + (person ? personLayer(t) : '') + front.join('')) + (hideCaps ? '' : captionHTML(t));
}

// Whole-frame transition accents: timeline.fx = [{ t, type, dur?, amp? }] — captions stay steady on top.
const FX_DUR = { shake: .35, punch: .25, zoom_in: .6, whip: .3, blur_in: .35, glitch: .3, flash: .25, rgb: .3, push: 2, mono: 1.5 };
function fxWrap(t, html) {
  const list = (TL.fx || []).filter(f => t >= f.t && t < f.t + (f.dur ?? FX_DUR[f.type] ?? .3));
  if (!list.length) return html;
  let tr = '', fl = '', over = '';
  for (const f of list) {
    const d = f.dur ?? FX_DUR[f.type] ?? .3, k = (t - f.t) / d, j = Math.floor(t * 30);
    if (f.type === 'shake') { const m = (f.amp ?? 14) * (1 - k); tr += ` translate(${(Math.sin(j * 2.1) * m).toFixed(1)}px,${(Math.cos(j * 1.7) * m).toFixed(1)}px) scale(${(1 + m / 300).toFixed(4)})`; }
    if (f.type === 'punch') tr += ` scale(${(1 + (f.amp ?? .12) * (1 - E.outCubic(k))).toFixed(4)})`;
    if (f.type === 'zoom_in') tr += ` scale(${(1 + (f.amp ?? .15) * E.inOutSine(k)).toFixed(4)})`;
    // push: slow push-in on the speaker, held, eased back over the last 25 % (auto b-roll "aroll" source)
    if (f.type === 'push') tr += ` scale(${(1 + (f.amp ?? .1) * E.inOutSine(clamp(k / .35)) * (1 - E.inOutSine(clamp((k - .75) / .25)))).toFixed(4)})`;
    // mono: a black-and-white, high-contrast beat that fades back to colour
    if (f.type === 'mono') { const m = 1 - E.inOutSine(clamp((k - .7) / .3)); fl += ` grayscale(${m.toFixed(3)}) contrast(${(1 + .25 * m).toFixed(3)})`; }
    if (f.type === 'whip') {
      const x = k < .5 ? -E.inCubic(k * 2) * 420 : (1 - E.outCubic((k - .5) * 2)) * 420;
      tr += ` translateX(${x.toFixed(1)}px) scale(${(1 + Math.abs(x) / 620).toFixed(4)})`; fl += ` blur(${(Math.sin(Math.PI * k) * 22).toFixed(1)}px)`;
    }
    if (f.type === 'blur_in') fl += ` blur(${((1 - E.outCubic(k)) * 24).toFixed(1)}px) brightness(${(1 + (1 - k) * .4).toFixed(2)})`;
    if (f.type === 'glitch' || f.type === 'rgb') {
      const on = rnd(j) > .35;
      if (on) { tr += ` translateX(${((rnd(j + 1) - .5) * 36).toFixed(1)}px) scale(1.03)`; fl += ` hue-rotate(${Math.round(rnd(j + 2) * 90)}deg) saturate(1.8)`; }
      over += `<div class="full" style="background:repeating-linear-gradient(transparent 0 ${2 + Math.round(rnd(j + 3) * 4)}px, rgba(255,255,255,.07) 0 ${4 + Math.round(rnd(j + 3) * 4)}px);mix-blend-mode:screen"></div>`;
      if (on) over += `<div class="abs" style="left:0;right:0;top:${Math.round(rnd(j + 4) * 640)}px;height:${20 + Math.round(rnd(j + 5) * 60)}px;background:rgba(255,40,90,.35);mix-blend-mode:screen;transform:translateX(${Math.round((rnd(j + 6) - .5) * 80)}px)"></div>`;
    }
    if (f.type === 'flash') over += `<div class="full" style="background:#fff;opacity:${(1 - E.outCubic(k)).toFixed(3)}"></div>`;
  }
  return `<div class="full" style="transform:${tr || 'none'};filter:${fl || 'none'};transform-origin:50% 45%">${html}</div>${over}`;
}

window.init = async (timeline) => {
  TL = timeline;
  TL.fps = TL.fps || 30;
  if (TL.clips?.length) {
    const d = layoutClips();
    TL.aroll = { ...(TL.aroll || {}), frames: '@clip', cutouts: TL.clips.some(c => c.cutouts) ? '@cut' : undefined, count: Math.ceil(d * TL.fps) + 1 };
  } else CLIPS = [];
  KF_LINES = (TL.scenes || []).flatMap((s, i) => (s.lines || []).map((L, j) => (L.kf?.length ? Object.assign(L, { cid: L.cid || `kf${i}_${j}` }) : null))).filter(Boolean);
  const stage = document.getElementById('stage');
  // Design space: 1280x720 landscape, 720x1280 vertical (TL.design overrides); output size = TL.width x TL.height.
  const vert = (TL.height || 720) > (TL.width || 1280);
  const [DW, DH] = TL.design || (vert ? [720, 1280] : [1280, 720]);
  FRAME_AR = DW / DH;
  stage.style.width = `${DW}px`;
  stage.style.height = `${DH}px`; STAGE_WH = [DW, DH];
  stage.style.transform = `scale(${(TL.width || DW) / DW})`;
  if (vert) document.body.classList.add('vertical');
  document.body.style.width = `${TL.width || DW}px`;
  document.body.style.height = `${TL.height || DH}px`;
  await document.fonts.ready;
  return true;
};

// Decode every image of the next frame BEFORE it replaces the visible one, so live playback never shows a
// half-loaded (black) frame. Decoded images are kept in a small LRU so the swap paints them immediately.
const PRE = new Map();
function preload(html) {
  const urls = new Set();
  for (const m of html.matchAll(/<img[^>]*?\ssrc="([^"]+)"/g)) urls.add(m[1].replace(/&amp;/g, '&'));
  for (const m of html.matchAll(/url\((?:&quot;|["'])?([^"')&]+)(?:&quot;|["'])?\)/g)) if (!m[1].startsWith('data:') && !m[1].startsWith('#')) urls.add(m[1]);
  return Promise.all([...urls].map(u => {
    let p = PRE.get(u);
    if (p) { PRE.delete(u); PRE.set(u, p); return p.done; }
    const im = new Image(); im.src = u;
    p = { im, done: im.decode().catch(() => {}) };
    PRE.set(u, p);
    if (PRE.size > 240) PRE.delete(PRE.keys().next().value);
    return p.done;
  }));
}
window.renderFrame = async (t) => {
  const stage = document.getElementById('stage');
  const html = compose(t);
  await Promise.race([preload(html), new Promise(r => setTimeout(r, 1000))]);
  stage.innerHTML = html;
  placeSub2(stage);
  fixReframe(stage, t);
  if (KF_LINES.length) applyLineKf(stage, t);
  if (window.hfMount) await hfMount(stage, t); // HyperFrames blocks: live iframes beside #stage (engine/hf.js)
  // Chat panes and other .autoscroll boxes always show their newest content (deterministic per frame).
  for (const el of stage.querySelectorAll('.autoscroll')) el.scrollTop = el.scrollHeight;
  const imgs = [...stage.querySelectorAll('img')];
  await Promise.all(imgs.map(i => (i.complete ? Promise.resolve() : i.decode().catch(() => {}))));
  for (const el of stage.querySelectorAll('.autoscroll')) el.scrollTop = el.scrollHeight;
  await document.fonts.ready;
  return imgs.length;
};
