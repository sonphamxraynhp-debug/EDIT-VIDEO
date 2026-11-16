// AI Video Studio — main track (TL.clips, spec: references/clips.md).
// Layout, migration from TL.aroll, and ripple edits: every clip edit remaps the OUTPUT times of captions
// (and their words), scenes (incl. nested absolute times), sfx, music, fx, grade/zoom ranges.
'use strict';

// Shared helpers (loaded first; used by library.js and studio.js).
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const r2 = v => Math.round(v * 100) / 100;
const r3 =v => Math.round(v * 1000) / 1000;
const deep = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v)));
const clipDur = c => Math.max(1 / 30, ((c.out ?? 3) - (c.in || 0)) / (c.speed || 1));
const srcLen = c => (typeof c.src === 'string' ? Infinity : (c.src?.count || 1) / (c.src?.fps || 30));
const TRANS_TYPES = [['fade', 'Mờ dần', 'ti-blur'], ['dissolve', 'Hoà tan', 'ti-droplet-half-2'], ['slide_l', 'Trượt trái', 'ti-arrow-big-left-lines'], ['slide_r', 'Trượt phải', 'ti-arrow-big-right-lines'],
  ['slide_up', 'Trượt lên', 'ti-arrow-big-up-lines'], ['push', 'Đẩy', 'ti-arrows-right'], ['zoom', 'Phóng vào', 'ti-zoom-in'], ['zoom_out', 'Thu ra', 'ti-zoom-out'], ['blur', 'Nhoè', 'ti-blur-off'],
  ['whip', 'Lia nhanh', 'ti-wind'], ['spin', 'Xoay', 'ti-rotate-clockwise-2'], ['wipe', 'Gạt', 'ti-layout-sidebar-left-expand'], ['circle', 'Vòng tròn', 'ti-circle-dashed'], ['flash', 'Loé sáng', 'ti-bolt'], ['glitch', 'Nhiễu', 'ti-wave-saw-tool']];
const FILTERS = [['', 'Gốc'], ['warm', 'Ấm'], ['cool', 'Lạnh'], ['vivid', 'Rực rỡ'], ['bw', 'Đen trắng'], ['film', 'Phim'], ['fade', 'Phai'], ['night', 'Đêm'], ['pop', 'Pop']];
const LUT_CSS = {
  warm: 'sepia(.22) saturate(1.2) hue-rotate(-8deg)', cool: 'saturate(1.05) hue-rotate(12deg) brightness(1.02)',
  vivid: 'saturate(1.45) contrast(1.1)', bw: 'grayscale(1) contrast(1.15)', film: 'sepia(.3) contrast(1.08) saturate(.85)',
  fade: 'contrast(.86) brightness(1.08) saturate(.8)', night: 'brightness(.8) saturate(1.2) hue-rotate(195deg) contrast(1.1)',
  pop: 'saturate(1.6) contrast(1.15) brightness(1.04)',
};

function clipLayout() {
  let t = 0;
  return (TL.clips || []).map((c, i) => { const d = c.hidden ? 0 : clipDur(c); const k = { c, i, t0: t, t1: t + d }; t += d; return k; });
}
const clipsTotal = () => clipLayout().reduce((a, k) => Math.max(a, k.t1), 0);
function clipAtT(t) { const L = clipLayout().filter(k => k.t1 > k.t0); return L.find(k => t >= k.t0 - 1e-6 && t < k.t1) || L[L.length - 1] || null; }
// Source time inside clip k at output time t.
const srcAt = (k, t) => (k.c.in || 0) + Math.max(0, t - k.t0) * (k.c.speed || 1);
function clipFrameUrl(c, st) {
  if (!c?.src) return '';
  if (typeof c.src === 'string') return '/project/' + c.src;
  const fps = c.src.fps || 30, n = Math.min(c.src.count || 1e9, Math.max(1, Math.floor(st * fps + 1e-6) + 1));
  return '/project/' + c.src.seq.replace(/%0(\d)d/, (_, w) => String(n).padStart(+w, '0'));
}
function clipFilterCss(c) {
  const f = c?.filter || {};
  let s = f.preset ? LUT_CSS[f.preset] || '' : '';
  if (f.brightness != null) s += ` brightness(${f.brightness})`;
  if (f.contrast != null) s += ` contrast(${f.contrast})`;
  if (f.saturate != null) s += ` saturate(${f.saturate})`;
  if (f.hue) s += ` hue-rotate(${f.hue}deg)`;
  if (f.temp) s += f.temp > 0 ? ` sepia(${(f.temp * .5).toFixed(2)})` : ` hue-rotate(${(f.temp * 25).toFixed(0)}deg)`;
  return s || 'none';
}

// Old single-take projects → one clip covering the A-roll (TL.aroll stays for compatibility).
function migrateClips() {
  if (TL.clips?.length || !TL.aroll?.frames) return false;
  const fps = TL.fps || 30, count = META.frames || Math.round((TL.duration || 0) * fps);
  if (!count) return false;
  const out = r3(Math.min(count / fps, TL.duration || Infinity));
  TL.clips = [{ src: { seq: TL.aroll.frames, fps, count }, ...(TL.audio?.voice || META.audio ? { audio: TL.audio?.voice || META.audio } : {}), in: 0, out,
    ...(TL.aroll.cutouts ? { cutouts: TL.aroll.cutouts } : {}) }];
  return true;
}

// ---------- time remapping ----------
const ABS_KEYS = new Set(['t', 'out', 't0', 't1', 'reveal_t', 'strike_at', 'highlight_t']);
function mapScene(s, f) {
  const walk = (o, top) => {
    if (Array.isArray(o)) return o.forEach(x => walk(x, false));
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === '_orig' || k === 'cid') continue;
      if (!top && ABS_KEYS.has(k) && typeof v === 'number') o[k] = r2(f(v));
      else if (v && typeof v === 'object') walk(v, false);
    }
  };
  walk(s, true);
  s.t0 = r2(f(s.t0)); s.t1 = r2(f(s.t1));
}
const fRemove = (a, b) => t => (t <= a ? t : t >= b ? t - (b - a) : a);
const fInsert = (p, d) => t => (t < p - 1e-6 ? t : t + d);
const fScale = (a, d0, d1) => t => (t <= a ? t : t >= a + d0 - 1e-6 ? t + (d1 - d0) : a + (t - a) * d1 / d0);
// Apply f to every output time in the project. cut=[a,b] drops what lies inside the removed span.
function remapAll(f, cut) {
  const inCut = t => cut && t > cut[0] + 1e-3 && t < cut[1] - 1e-3;
  const span = (o, k0 = 't0', k1 = 't1') => { o[k0] = r2(f(o[k0])); o[k1] = r2(f(o[k1])); return o[k1] - o[k0] > .04; };
  CAP = CAP.filter(c => {
    c.words = (c.words || []).filter(w => !inCut((w.s + w.e) / 2));
    if (!c.words.length) return false;
    for (const w of c.words) { w.s = r2(f(w.s)); w.e = r2(f(w.e)); }
    c.t0 = r2(Math.min(f(c.t0), c.words[0].s)); c.t1 = r2(Math.max(f(c.t1), c.words[c.words.length - 1].e));
    return c.t1 - c.t0 > .04;
  });
  TL.scenes = (TL.scenes || []).filter(s => {
    if (cut && s.t0 >= cut[0] - 1e-3 && s.t1 <= cut[1] + 1e-3) return false;
    mapScene(s, f); return s.t1 - s.t0 > .04;
  });
  const A = TL.audio || {};
  if (A.sfx) A.sfx = A.sfx.filter(x => !inCut(x.t) && ((x.t = r2(f(x.t))), true));
  if (A.music) A.music = A.music.filter(m => span(m));
  if (TL.fx) TL.fx = TL.fx.filter(x => !inCut(x.t) && ((x.t = r2(f(x.t))), true));
  for (const k of ['grade', 'zoom', 'captionsHide']) if (Array.isArray(TL[k])) TL[k] = TL[k].filter(r => span(r));
  CAP.sort((a, b) => a.t0 - b.t0);
}
// Duration = main track + the tail of any scene that ends after it (end cards).
function fixDuration() {
  if (!TL.clips?.length) return;
  const end = Math.max(clipsTotal(), ...(TL.scenes || []).filter(s => !s.hidden).map(s => s.t1 || 0));
  TL.duration = r2(end);
  for (const m of TL.audio?.music || []) if (m.t1 > TL.duration) m.t1 = TL.duration;
}

// ---------- operations ----------
function splitClipAt(t) {
  const k = clipAtT(t);
  if (!k) return null;
  if (t - k.t0 < 2 / 30 || k.t1 - t < 2 / 30) return null;
  const c = k.c, cut = r3(srcAt(k, t)), b = deep(c);
  delete b.transition; b.in = cut; c.out = cut;
  TL.clips.splice(k.i + 1, 0, b);
  return b;
}
function deleteClip(i) {
  if ((TL.clips || []).length <= 1) return false;
  const k = clipLayout()[i];
  TL.clips.splice(i, 1);
  if (TL.clips[0]) delete TL.clips[0].transition;
  remapAll(fRemove(k.t0, k.t1), [k.t0, k.t1]);
  fixDuration();
  return true;
}
function duplicateClip(i) {
  const k = clipLayout()[i], cp = deep(k.c);
  TL.clips.splice(i + 1, 0, cp);
  remapAll(fInsert(k.t1, k.t1 - k.t0));
  fixDuration();
  return cp;
}
function insertClipAt(clip, t) {
  const L = clipLayout();
  // nearest boundary to t
  let idx = L.length, at = L.length ? L[L.length - 1].t1 : 0, best = Infinity;
  for (const k of L) for (const [b, j] of [[k.t0, k.i], [k.t1, k.i + 1]]) if (Math.abs(b - t) < best) { best = Math.abs(b - t); idx = j; at = b; }
  TL.clips.splice(idx, 0, clip);
  remapAll(fInsert(at, clipDur(clip)));
  fixDuration();
  return at;
}
// Ripple trim. edge 'l'|'r', d = output-time delta of that edge (positive = to the right).
function trimClip(i, edge, d) {
  const k = clipLayout()[i], c = k.c, sp = c.speed || 1, min = 2 / 30 * sp;
  if (edge === 'r') {
    const nOut = clamp((c.out ?? 3) + d * sp, (c.in || 0) + min, srcLen(c)), dd = (nOut - (c.out ?? 3)) / sp;
    c.out = r3(nOut);
    if (dd < 0) remapAll(fRemove(k.t1 + dd, k.t1), [k.t1 + dd, k.t1]); else if (dd > 0) remapAll(fInsert(k.t1, dd));
  } else {
    const nIn = clamp((c.in || 0) + d * sp, 0, (c.out ?? 3) - min), dd = (nIn - (c.in || 0)) / sp;
    c.in = r3(nIn);
    if (dd > 0) remapAll(fRemove(k.t0, k.t0 + dd), [k.t0, k.t0 + dd]); else if (dd < 0) remapAll(fInsert(k.t0, -dd));
  }
  fixDuration();
}
function setClipSpeed(i, sp) {
  const k = clipLayout()[i], d0 = k.t1 - k.t0;
  k.c.speed = clamp(+sp, .25, 4); if (k.c.speed === 1) delete k.c.speed;
  const d1 = clipDur(k.c);
  if (Math.abs(d1 - d0) > 1e-4) remapAll(fScale(k.t0, d0, d1));
  fixDuration();
}
// Reorder: clip i → index j. Captions/sfx/scenes that live inside a moved clip move with it.
function moveClip(i, j) {
  if (i === j) return;
  const L0 = clipLayout(), c = TL.clips[i];
  TL.clips.splice(i, 1); TL.clips.splice(j > i ? j - 1 : j, 0, c);
  delete TL.clips[0].transition;
  const L1 = clipLayout(), newOf = new Map(L1.map(k => [k.c, k]));
  const idxAt = t => L0.findIndex(k => t >= k.t0 - 1e-6 && t < k.t1);
  const f = t => { const n = idxAt(t); if (n < 0) return t; const k0 = L0[n], k1 = newOf.get(k0.c); return k1.t0 + (t - k0.t0); };
  // captions: split each caption by source clip, then map each part
  const caps = [];
  for (const cap of CAP) {
    const groups = new Map();
    for (const w of cap.words) { const n = idxAt((w.s + w.e) / 2); if (!groups.has(n)) groups.set(n, []); groups.get(n).push(w); }
    for (const ws of groups.values()) {
      const part = groups.size === 1 ? cap : { ...deep(cap), words: ws };
      for (const w of part.words) { const m = f((w.s + w.e) / 2) - (w.s + w.e) / 2; w.s = r2(w.s + m); w.e = r2(w.e + m); }
      const m0 = f(groups.size === 1 ? cap.t0 : ws[0].s) - (groups.size === 1 ? cap.t0 : ws[0].s);
      if (groups.size === 1) { part.t0 = r2(cap.t0 + m0); part.t1 = r2(cap.t1 + m0); } else { part.t0 = ws[0].s; part.t1 = ws[ws.length - 1].e; }
      part.t0 = Math.min(part.t0, part.words[0].s); part.t1 = Math.max(part.t1, part.words[part.words.length - 1].e);
      caps.push(part);
    }
  }
  CAP = caps.sort((a, b) => a.t0 - b.t0);
  for (const s of TL.scenes || []) {
    const a = idxAt(s.t0), b = idxAt(Math.max(s.t0, s.t1 - 1e-3));
    if (a >= 0 && a === b) { const d = f(s.t0) - s.t0; if (Math.abs(d) > 1e-4) mapScene(s, t => t + d); }
  }
  for (const x of TL.audio?.sfx || []) x.t = r2(f(x.t));
  for (const x of TL.fx || []) x.t = r2(f(x.t));
}
