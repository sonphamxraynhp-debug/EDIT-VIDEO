// AI Video Studio — editor UI. The preview is the real render engine (engine/index.html) in an iframe,
// so what you see is frame-exact what render.mjs exports. Every edit mutates timeline.json in memory;
// "Lưu" writes it (plus captions + notes for Claude) through studio/server.mjs.
// Files: clips.js (main track model + ripple), library.js (left rail panels), this file (everything else).
'use strict';
let DW = 720, DH = 1280; const FPS = 30;

let TL = null, CAP = [], META = {}, LIB = { sfx: [], music: [] }, WAVE = [];
let T = 0, playing = false, sel = null, comps = [], dirty = false, undoStack = [], redoStack = [];
let query = '', K = .5, win = null, needInit = true, busy = false, pending = false, SNAP = true;
const ITAB = {};

// ---------- vocabulary ----------
const TRACKS = [['cap', 'Phụ đề', 'ti-badge-cc'], ['add', 'Chữ thêm', 'ti-letter-t'], ['gline', 'Chữ graphic', 'ti-text-size'], ['gfx', 'Graphic', 'ti-sparkles'],
  ['broll', 'B-roll', 'ti-photo'], ['scene', 'Cảnh', 'ti-layout-board'], ['video', 'Video chính', 'ti-movie'], ['audio', 'Âm thanh', 'ti-music'], ['wave', 'Giọng', 'ti-wave-sine']];
const TCOL = { scene: 'var(--t-scene)', cap: 'var(--t-cap)', add: 'var(--t-add)', gline: 'var(--t-gline)', gfx: 'var(--t-gfx)', broll: 'var(--t-broll)', audio: 'var(--t-audio)', video: 'var(--t-video)' };
const TRK = Object.fromEntries(TRACKS.map(([k]) => [k, { lock: false, hide: false }]));
const LAYOUT = new Set(['frame_grid', 'title_card', 'spotlight', 'bubble_screen', 'hook_card', 'grid_bg', 'end_card', 'slam_bg', 'split', 'mega']);
const BROLL = new Set(['broll', 'media_card', 'mosaic', 'mosaic_wall', 'photo', 're_gallery']);
const TYPE_VI = {
  frame_grid: 'Khung video lưới', title_card: 'Thẻ kết', media_card: 'Thẻ media', led_text: 'Chữ LED', neon_text: 'Chữ neon', logo_row: 'Hàng logo',
  diagram: 'Sơ đồ', text: 'Chữ thêm', spotlight: 'Spotlight', bubble_screen: 'Bubble + màn hình', hook_card: 'Thẻ mở đầu', grid_bg: 'Nền lưới',
  icon_tap: 'Logo + tay bấm', sticker: 'Sticker', follow_cta: 'Nút Follow', broll: 'B-roll', emoji_pop: 'Emoji', photo: 'Ảnh / clip phủ',
};
const FONTS = [['', 'Mặc định'], ['var(--sans)', 'Be Vietnam Pro'], ['var(--disp)', 'Montserrat'], ["'Inter'", 'Inter'], ["'Playfair Display',serif", 'Playfair Display'],
  ["'DM Serif Display',serif", 'DM Serif Display'], ["'Lexend'", 'Lexend'], ["'Oswald'", 'Oswald'], ["'Nunito'", 'Nunito'], ["'Bungee'", 'Bungee'], ["'Pacifico'", 'Pacifico']];
const STYLES = [['white', 'Trắng'], ['yellow', 'Vàng'], ['clean', 'Sạch'], ['muted', 'Dịu'], ['ink', 'Mực'], ['fire', 'Lửa'], ['glow', 'Phát sáng'], ['neon', 'Neon'], ['dark', 'Tối'], ['hl', 'Nhấn'], ['grad_blue', 'Gradient xanh'], ['grad_teal', 'Gradient ngọc']];
const SWATCH = ['#FFFFFF', '#FCDB36', '#F3E35A', '#151515', '#FF8A1E', '#E8432A', '#FF3348', '#5EE6C8', '#8CCBFF', '#A78BFA'];
const NODE_SIZE = { person: 64, chip: 22, pill: 30, pill_outline: 32, big: 120, label: 26 };

// ---------- component model ----------
const typeName = ty => TYPE_VI[ty] || (win?.PACKS || []).flatMap(p => p.items).find(i => i.type === ty)?.label || ty;
const sceneName = s => (s.type === 'hf' ? win?.HF_CATALOG?.[s.block]?.label || 'Khối HyperFrames' : typeName(s.type));
function trackOf(s) { return s.type === 'text' ? 'add' : LAYOUT.has(s.type) ? 'scene' : BROLL.has(s.type) ? 'broll' : 'gfx'; }
function build() {
  comps = [];
  clipLayout().forEach(k => { k.c.cid = 'k' + k.i; comps.push({ obj: k.c, kind: 'clip', track: 'video', t0: k.t0, t1: k.t1, idx: k.i, label: `Clip ${k.i + 1}`, sub: typeof k.c.src === 'string' ? k.c.src : k.c.src?.seq }); });
  (TL.scenes || []).forEach((s, i) => {
    s.cid = 's' + i;
    if (s.type !== 'text') comps.push({ obj: s, kind: 'scene', track: trackOf(s), t0: s.t0, t1: s.t1, label: sceneName(s), sub: s.text || s.question || '', scene: s });
    (s.lines || []).forEach((L, j) => {
      L.cid = `s${i}l${j}`;
      comps.push({ obj: L, kind: 'line', track: s.type === 'text' ? 'add' : 'gline', t0: L.t ?? s.t0, t1: L.out ?? s.t1, label: L.text, scene: s });
    });
    (s.nodes || []).forEach((n, j) => {
      n.cid = `s${i}n${j}`;
      comps.push({ obj: n, kind: 'node', track: 'gline', t0: n.t ?? s.t0, t1: n.out ?? s.t1, label: n.text || n.kind, scene: s });
    });
    if (s.badge && typeof s.badge === 'object') { s.badge.cid = `s${i}b`; comps.push({ obj: s.badge, kind: 'badge', track: null, t0: s.t0, t1: s.t1, label: 'Huy hiệu', scene: s }); }
  });
  CAP.forEach((c, k) => { c.cid = 'c' + k; comps.push({ obj: c, kind: 'cap', track: 'cap', t0: c.t0, t1: c.t1, label: c.words.map(w => w.w).join(' ') }); });
  (TL.audio?.sfx || []).forEach((x, k) => { x.cid = 'a' + k; comps.push({ obj: x, kind: 'sfx', track: 'audio', t0: x.t, t1: x.t + .45, label: x.name }); });
  (TL.audio?.music || []).forEach((m, k) => { m.cid = 'm' + k; comps.push({ obj: m, kind: 'music', track: 'audio', t0: m.t0, t1: m.t1, label: m.mood || m.file }); });
  for (const f of window.Studio?._build || []) f(comps); // features add their own components (e.g. 30_audio.js: extra audio tracks)
}
const compOf = obj => comps.find(c => c.obj === obj);
const compByCid = cid => comps.find(c => c.obj.cid === cid);

// ---------- undo / dirty ----------
const strip = (k, v) => (k === 'cid' ? undefined : v);
const snapshot = () => JSON.stringify({ TL, CAP }, strip);
let lastPush = { key: '', at: 0 };
function pushUndo(key = '') {
  const now = Date.now();
  if (key && key === lastPush.key && now - lastPush.at < 900) { lastPush.at = now; return; }
  lastPush = { key, at: now };
  undoStack.push(snapshot()); if (undoStack.length > 150) undoStack.shift();
  redoStack = [];
}
function restore(s) {
  const o = JSON.parse(s); TL = o.TL; CAP = o.CAP;
  const cid = sel?.obj.cid; build(); sel = cid ? compByCid(cid) || null : null; changed(true);
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }
// First edit of an element keeps its designed state in _orig ("Về thiết kế" restores it).
function touch(obj, key) {
  pushUndo(key ? obj.cid + key : '');
  if (!obj._orig) obj._orig = JSON.parse(JSON.stringify(obj, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v)));
}
function markDirty() { dirty = true; $('#status').textContent = 'Chưa lưu'; $('#status').classList.add('dirty'); }
function changed(inspector = false) {
  markDirty();
  if (T > TL.duration) { T = TL.duration; $('#time').textContent = fmt(T); }
  build();
  if (sel) sel = compOf(sel.obj) || null;
  needInit = true; draw(); renderList(); renderTimeline();
  if (inspector) renderInspector();
  $('#durtc').textContent = '/ ' + fmt(TL.duration);
}

// ---------- preview ----------
function previewTL() {
  const o = JSON.parse(JSON.stringify(TL));
  o.captions = JSON.parse(JSON.stringify(CAP)); o.base = '/project/'; o.width = DW; o.height = DH;
  if (o.aroll) o.aroll.count = META.frames || undefined;
  // Track "hide" toggles only affect the preview, never the saved timeline.
  if (TRK.video.hide) for (const c of o.clips || []) c.filter = { ...(c.filter || {}), brightness: 0 };
  if (TRK.cap.hide) o.caption_style = 'none';
  (o.scenes || []).forEach(s => {
    if (s.type === 'text' ? TRK.add.hide : TRK[trackOf(s)]?.hide) s.hidden = true;
    if (s.type !== 'text' && TRK.gline.hide) for (const L of s.lines || []) L.hidden = true;
  });
  return o;
}
async function draw() {
  if (!win?.renderFrame) return;
  if (busy) { pending = true; return; }
  busy = true;
  try {
    // Image decode can stall in a hidden window; never let one frame block the editor.
    const capped = p => Promise.race([p, new Promise(r => setTimeout(r, 1200))]);
    if (needInit) { needInit = false; await capped(win.init(previewTL())); }
    await capped(win.renderFrame(T));
  } catch (e) { console.error(e); }
  busy = false;
  drawOverlay();
  if (pending) { pending = false; draw(); }
}
function fit() {
  const w = $('#stagewrap').clientWidth - 40, h = $('#stagewrap').clientHeight - 32;
  K = Math.max(.1, Math.min(w / DW, h / DH));
  $('#stagebox').style.width = DW * K + 'px'; $('#stagebox').style.height = DH * K + 'px';
  const f = $('#frame'); f.style.width = DW + 'px'; f.style.height = DH + 'px'; f.style.transform = `scale(${K})`;
  drawOverlay();
}
function elFor(obj) { try { return win?.document.querySelector(`[data-cid="${obj.cid}"]`); } catch { return null; } }
function rectOf(obj) {
  const el = elFor(obj); if (!el) return null;
  if (el.id === 'cap') { // union of visible words
    let r = null;
    for (const s of el.querySelectorAll('span')) {
      if (+getComputedStyle(s).opacity < .05) continue;
      const b = s.getBoundingClientRect();
      r = r ? { l: Math.min(r.l, b.left), t: Math.min(r.t, b.top), r: Math.max(r.r, b.right), b: Math.max(r.b, b.bottom) } : { l: b.left, t: b.top, r: b.right, b: b.bottom };
    }
    return r && { x: r.l, y: r.t, w: r.r - r.l, h: r.b - r.t };
  }
  const b = el.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height };
}
let SAFE = { x: 40, y: 130, w: 600, h: 870 };
function drawOverlay() {
  const ov = $('#overlay'); let h = '';
  if ($('#safe').checked) h += `<div class="safe" style="left:${SAFE.x * K}px;top:${SAFE.y * K}px;width:${SAFE.w * K}px;height:${SAFE.h * K}px"><span>vùng an toàn</span></div>`;
  if ($('#face').checked) { const f = TL?.face || { x: 360, y: 520 }; const r = 120 * K; h += `<div class="facezone" style="left:${f.x * K - r}px;top:${f.y * K - r * 1.2}px;width:${r * 2}px;height:${r * 2.4}px"></div>`; }
  if (sel && sel.kind !== 'clip') {
    const r = rectOf(sel.obj);
    if (r) h += `<div class="selbox" style="left:${r.x * K - 3}px;top:${r.y * K - 3}px;width:${r.w * K + 6}px;height:${r.h * K + 6}px"><i class="nw"></i><i class="ne"></i><i class="sw"></i><i class="se"></i></div>`;
  }
  ov.innerHTML = h;
}
function pick(px, py) {
  if (!win) return null;
  for (const el of win.document.elementsFromPoint(px, py)) {
    const c = el.closest('[data-cid]');
    if (c) { const cp = compByCid(c.getAttribute('data-cid')); if (cp && !TRK[cp.track]?.lock) return cp; }
  }
  return null;
}

// ---------- geometry (design px) ----------
function activeKey(n) {
  if (!n.keys?.length) return null;
  let k = n.keys[0];
  for (const x of n.keys) if (x.t <= T + 1e-3) k = x;
  return k;
}
const SCENE_DEF = { led_text: [360, 400, 74], neon_text: [360, 400, 80], logo_row: [360, 310, 60], title_card: [360, 560, 50], icon_tap: [360, 985, 200], sticker: [360, 960, 320], follow_cta: [360, 858, 0], emoji_pop: [360, 640, 160] };
function getPos(c) {
  const o = c.obj;
  if (c.kind === 'line') return { x: o.x ?? DW / 2, y: o.y ?? DH / 2, size: o.size || 48 };
  if (c.kind === 'cap') return { x: o.x ?? 360, y: o.y ?? 790, size: o.size || 31 };
  if (c.kind === 'node') { const k = activeKey(o); return { x: k ? k.x : o.x ?? 360, y: k ? k.y : o.y ?? 600, size: o.size || NODE_SIZE[o.kind] || 24 }; }
  if (c.kind === 'badge') return { x: o.x ?? 360, y: o.y ?? (c.scene.card?.y ?? 140), size: o.size || 118 };
  if (c.kind === 'scene') {
    if (o.type === 'frame_grid' || o.type === 'media_card') {
      const d = o.type === 'frame_grid' ? { x: 80, y: 140, w: 560, h: 1000 } : { x: 110, y: 360, w: 500, h: 290 };
      const cd = { ...d, ...(o.card || {}) }; return { x: cd.x, y: cd.y, size: cd.w, card: cd };
    }
    const d = SCENE_DEF[o.type] || [360, 640, 60];
    return { x: o.x ?? d[0], y: o.y ?? d[1], size: o.size || d[2] };
  }
  return null;
}
function setPos(c, p) {
  const o = c.obj;
  if (c.kind === 'node') { const k = activeKey(o); if (k) { k.x = Math.round(p.x); k.y = Math.round(p.y); } else { o.x = Math.round(p.x); o.y = Math.round(p.y); } if (p.size) o.size = Math.round(p.size); return; }
  if (c.kind === 'scene' && (o.type === 'frame_grid' || o.type === 'media_card')) {
    const cur = getPos(c).card, f = p.size / cur.w;
    o.card = { ...cur, x: Math.round(p.x), y: Math.round(p.y), w: Math.round(cur.w * f), h: Math.round(cur.h * f) };
    return;
  }
  o.x = Math.round(p.x); o.y = Math.round(p.y);
  if (p.size && SCENE_DEF[o.type]?.[2] !== 0) o.size = Math.round(p.size * 10) / 10;
}
const origSize = c => { const o = c.obj._orig; if (!o) return getPos(c)?.size; const tmp = { ...c, obj: { ...o, keys: c.obj.keys } }; return getPos(tmp)?.size; };

// ---------- timing ----------
const ABS_T = new Set(['t', 'out', 't0', 't1', 'reveal_t', 'strike_at', 'highlight_t']);
function shiftScene(s, d) {
  const walk = (o, top) => {
    if (Array.isArray(o)) return o.forEach(x => walk(x, false));
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === '_orig' || k === 'cid') continue;
      if (!top && ABS_T.has(k) && typeof v === 'number') o[k] = r2(v + d);
      else if (v && typeof v === 'object') walk(v, false);
    }
  };
  walk(s, true);
}
function setTimes(c, t0, t1, moved) {
  const o = c.obj; t0 = r2(Math.max(0, t0)); t1 = r2(Math.max(t0 + 1 / FPS, t1));
  if (c.kind === 'scene') { if (moved) shiftScene(o, t0 - o.t0); o.t0 = t0; o.t1 = t1; }
  else if (c.kind === 'line' || c.kind === 'node') {
    const s = c.scene;
    if (s.type === 'text' && s.lines.length === 1) { s.t0 = t0; s.t1 = t1; o.t = t0; delete o.out; }
    else {
      if (t0 < s.t0) s.t0 = t0; if (t1 > s.t1) s.t1 = t1;
      o.t = t0; if (Math.abs(t1 - s.t1) < .02) delete o.out; else o.out = t1;
      if (c.kind === 'node' && moved && o.keys) { const d = t0 - (c.t0); for (const k of o.keys) k.t = r2(k.t + d); }
    }
  } else if (c.kind === 'cap') {
    const d = t0 - o.t0, sc = moved ? 1 : (t1 - t0) / Math.max(.01, o.t1 - o.t0);
    for (const w of o.words) { if (moved) { w.s = r2(w.s + d); w.e = r2(w.e + d); } else { w.s = r2(t0 + (w.s - o.t0) * sc); w.e = r2(t0 + (w.e - o.t0) * sc); } }
    o.t0 = t0; o.t1 = t1;
  } else if (c.kind === 'sfx') o.t = t0;
  else if (c.kind === 'music') { o.t0 = t0; o.t1 = t1; }
  else if (c.setTimes) c.setTimes(t0, t1, moved);
}

function select(c, seek) {
  sel = c;
  if (seek && c && (T < c.t0 || T >= c.t1)) setTime(c.t0 + Math.min(.4, (c.t1 - c.t0) / 2));
  renderList(); renderTimeline(); renderInspector(); drawOverlay();
  if (panel === 'trans' || panel === 'filter') renderPanel();
}

// ---------- inspector ----------
const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
const num = (f, v, step = 1) => `<input type="number" data-f="${f}" value="${v ?? ''}" step="${step}">`;
const sect = (title, body, ic = '') => `<section>${title ? `<div class="sh">${ic ? `<i class="ti ${ic}"></i>` : ''}${title}</div>` : ''}${body}</section>`;
function posBlock(c) {
  const p = getPos(c); if (!p) return '';
  const os = origSize(c) || p.size, pct = Math.round(p.size / os * 100);
  const r = rectOf(c.obj);
  const inSafe = !r || (r.x >= SAFE.x && r.y >= SAFE.y && r.x + r.w <= SAFE.x + SAFE.w && r.y + r.h <= SAFE.y + SAFE.h);
  return sect('Vị trí và cỡ', `<div class="row"><div><span class="lbl">X</span>${num('x', Math.round(p.x))}</div><div><span class="lbl">Y</span>${num('y', Math.round(p.y))}</div><div><span class="lbl">Cỡ %</span>${num('pct', pct)}</div></div>
    <div class="slrow"><span>Cỡ</span><input type="range" data-f="pct" min="20" max="300" value="${pct}"><b>${pct}%</b></div>
    ${r ? `<div class="${inSafe ? 'ok' : 'warn'}"><i class="ti ${inSafe ? 'ti-circle-check' : 'ti-alert-triangle'}"></i> ${inSafe ? 'Trong vùng an toàn' : 'Ra ngoài vùng an toàn (bị nút TikTok/Reels che)'}</div>` : ''}`, 'ti-arrows-move');
}
function colorBlock(cur) {
  return `<span class="lbl">Màu</span><div class="sw"><button class="orig ${cur ? '' : 'on'}" data-color="">Gốc</button>
    ${SWATCH.map(c => `<button style="background:${c}" class="${cur === c ? 'on' : ''}" data-color="${c}"></button>`).join('')}
    <input type="color" data-f="color" value="${cur || '#ffffff'}"></div>`;
}
function timeBlock(c) {
  return sect('Thời gian (giây)', `<div class="row"><div><span class="lbl">Bắt đầu</span>${num('t0', r2(c.t0), .01)}</div>
    ${c.kind === 'sfx' ? '' : `<div><span class="lbl">Kết thúc</span>${num('t1', r2(c.t1), .01)}</div>`}</div>`, 'ti-clock');
}
const noteBlock = o => sect('Ghi chú cho Claude', `<textarea data-f="note" placeholder="Ví dụ: đổi chữ này sang màu cam, to hơn…">${esc(o.note || '')}</textarea>
  <div class="help">Lưu cùng chỉnh sửa. Lần sau nói với Claude “xem ghi chú trong editor”.</div>`, 'ti-message-2');
const actions = c => `<div class="acts"><button data-act="hide"><i class="ti ${c.obj.hidden ? 'ti-eye' : 'ti-eye-off'}"></i> ${c.obj.hidden ? 'Hiện' : 'Ẩn'}</button><button data-act="dup"><i class="ti ti-copy"></i> Nhân bản</button>
  <button data-act="del" class="danger"><i class="ti ti-trash"></i> Xoá</button>${c.obj._orig ? '<button data-act="reset"><i class="ti ti-restore"></i> Về thiết kế</button>' : ''}</div>`;
function textBlock(o, withStyle) {
  return sect('Nội dung', `<textarea data-f="text" rows="2" class="big">${esc(o.text || '')}</textarea>`, 'ti-letter-t') +
    sect('Chữ', `<div class="row"><div><span class="lbl">Font</span><select data-f="font">${opt(FONTS, o.font || '')}</select></div>
    <div><span class="lbl">Độ đậm</span><select data-f="weight">${opt([['', 'Mặc định'], ['500', '500'], ['600', '600'], ['700', '700'], ['800', '800'], ['900', '900']], o.weight || '')}</select></div></div>
    ${withStyle ? `<span class="lbl">Kiểu chữ</span><div class="pills">${STYLES.map(([v, l]) => `<button class="${(o.style || 'white') === v ? 'on' : ''}" data-sty="${v}">${l}</button>`).join('')}</div>
    <label class="check"><input type="checkbox" data-f="italic" ${o.italic === false ? '' : 'checked'}> Nghiêng</label>` : ''}
    ${colorBlock(o.color)}`, 'ti-typography');
}
function animBlock(c) {
  const o = c.obj, cur = o.anim || 'pop', d = r2(c.t1 - c.t0);
  return sect('Hoạt ảnh vào', `<div class="angrid">${ANIM_LIST.map(([k, l]) => `<button class="an ${cur === k ? 'on' : ''}" data-anim="${k}"><span class="ad"><b class="an-${k}">Aa</b></span><small>${l}</small></button>`).join('')}</div>`, 'ti-sparkles') +
    sect('Thời lượng', `<div class="slrow"><span>Hiển thị</span><input type="range" data-f="dur" min=".3" max="10" step=".1" value="${d}"><b>${d}s</b></div>
    <div class="help">Chữ hiện từ ${fmt(c.t0)}. Kéo mép khối trên timeline để chỉnh chính xác.</div>`, 'ti-clock');
}
function capText(c) { return c.words.map(w => (w.hl ? `*${w.w}*` : w.w) + (w.br ? ' /' : '')).join(' '); }

// Clip inspector (main track): Cơ bản / Tốc độ / Âm thanh / Màu / Chuyển cảnh.
function clipTabs(c) {
  const o = c.obj, k = clipLayout()[c.idx], f = o.filter || {}, still = typeof o.src === 'string';
  const rng = (fld, v, a, b, st, lab, unit = '', show = x => x) => `<div class="slrow"><span>${lab}</span><input type="range" data-cf="${fld}" min="${a}" max="${b}" step="${st}" value="${v}"><b data-v="${fld}">${show(v)}${unit}</b></div>`;
  const thumb = clipFrameUrl(o, srcAt(k, k.t0 + Math.min(.5, (k.t1 - k.t0) / 2)));
  return [
    ['basic', 'Cơ bản', `<div class="clipcard"><span class="cth" style="background-image:url('${thumb}');filter:${clipFilterCss(o)}"></span><div><b>Clip ${c.idx + 1} / ${TL.clips.length}</b>
        <small>${still ? 'Ảnh tĩnh' : 'Video'} · nguồn ${r2(o.in || 0)}–${r2(o.out ?? 3)}s</small><small>Trên timeline ${fmt(k.t0)} – ${fmt(k.t1)}</small></div></div>` +
      sect('Khung hình', `<div class="seg3">${[['cover', 'Lấp đầy', 'ti-arrows-maximize'], ['contain', 'Vừa khung', 'ti-box-padding'], ['blurfill', 'Nền mờ', 'ti-blur']].map(([v, l, ic]) => `<button class="${(o.fit || 'cover') === v ? 'on' : ''}" data-cfit="${v}"><i class="ti ${ic}"></i>${l}</button>`).join('')}</div>
        ${rng('zoom', o.zoom || 1, 1, 3, .05, 'Phóng to', '×')}${rng('ox', o.ox ?? 50, 0, 100, 1, 'Tâm X', '%')}${rng('oy', o.oy ?? 45, 0, 100, 1, 'Tâm Y', '%')}
        <div class="acts"><button data-cact="flip" class="${o.flip ? 'on' : ''}"><i class="ti ti-flip-vertical"></i> Lật ngang</button></div>`, 'ti-crop') +
      sect('Cắt nguồn (giây)', `<div class="row"><div><span class="lbl">Vào</span><input type="number" step=".05" data-cf="in" value="${r2(o.in || 0)}"></div><div><span class="lbl">Ra</span><input type="number" step=".05" data-cf="out" value="${r2(o.out ?? 3)}"></div></div>
        <div class="help">Đổi điểm vào/ra sẽ tự dồn phụ đề, graphic, SFX phía sau (ripple).</div>`, 'ti-cut') +
      `<div class="acts"><button data-cact="split"><i class="ti ti-scissors"></i> Tách tại playhead</button><button data-cact="dup"><i class="ti ti-copy"></i> Nhân bản</button><button data-cact="del" class="danger"><i class="ti ti-trash"></i> Xoá (dồn)</button></div>`],
    ['speed', 'Tốc độ', sect('Tốc độ phát', `<div class="seg4">${[.5, 1, 1.5, 2].map(v => `<button class="${(o.speed || 1) === v ? 'on' : ''}" data-cspeed="${v}">${v}×</button>`).join('')}</div>
        ${rng('speed', o.speed || 1, .25, 4, .05, 'Tốc độ', '×')}
        <div class="stat"><span>Thời lượng</span><b>${r2(k.t1 - k.t0)}s</b><span class="muted">gốc ${r2((o.out ?? 3) - (o.in || 0))}s</span></div>
        <div class="help">Phụ đề và graphic nằm trong clip giãn/co theo; phía sau tự dồn. Tiếng đổi theo (giữ cao độ).</div>`, 'ti-brand-speedtest')],
    ['audio', 'Âm thanh', sect('Âm lượng clip', still || !o.audio ? '<div class="help">Clip này không có tiếng.</div>'
      : `${rng('volume', Math.round((o.volume ?? 1) * 100), 0, 200, 1, 'Âm lượng', '%')}<div class="acts"><button data-cact="mute" class="${o.mute ? 'on' : ''}"><i class="ti ${o.mute ? 'ti-volume-off' : 'ti-volume'}"></i> ${o.mute ? 'Đang tắt tiếng' : 'Tắt tiếng'}</button></div>`, 'ti-volume')],
    ['color', 'Màu', sect('Bộ lọc', `<div class="flmini">${FILTERS.map(([v, l]) => `<button class="${(f.preset || '') === v ? 'on' : ''}" data-cpreset="${v}"><span style="background-image:url('${thumb}');filter:${v ? LUT_CSS[v] : 'none'}"></span><small>${l}</small></button>`).join('')}</div>`, 'ti-color-filter') +
      sect('Điều chỉnh', `${rng('brightness', f.brightness ?? 1, .5, 1.5, .01, 'Độ sáng')}${rng('contrast', f.contrast ?? 1, .5, 1.5, .01, 'Tương phản')}${rng('saturate', f.saturate ?? 1, 0, 2, .01, 'Bão hoà')}
        ${rng('temp', f.temp ?? 0, -1, 1, .01, 'Nhiệt độ')}${rng('hue', f.hue ?? 0, -180, 180, 1, 'Sắc độ', '°')}${rng('blur', f.blur ?? 0, 0, 20, .5, 'Làm mờ', 'px')}
        <div class="acts"><button data-cact="resetcolor"><i class="ti ti-restore"></i> Đặt lại màu</button></div>`, 'ti-adjustments')],
    ['trans', 'Chuyển cảnh', c.idx === 0 ? sect('', '<div class="help">Clip đầu tiên không có chuyển cảnh vào. Chọn clip phía sau, hoặc kéo hiệu ứng từ thư viện Chuyển cảnh thả vào chỗ nối.</div>')
      : sect('Chuyển cảnh vào clip này', `<div class="trgrid sm"><button class="tr ${o.transition ? '' : 'on'}" data-ctr=""><span class="demo none"><i class="ti ti-ban"></i></span><small>Không</small></button>
        ${TRANS_TYPES.map(([kk, l, ic]) => `<button class="tr ${o.transition?.type === kk ? 'on' : ''}" data-ctr="${kk}"><span class="demo t-${kk}"><i class="a"></i><i class="b"></i><i class="ti ${ic} ic"></i></span><small>${l}</small></button>`).join('')}</div>
        ${o.transition ? rng('tdur', o.transition.dur ?? .4, .1, 1.5, .05, 'Thời lượng', 's') : ''}`, 'ti-transition-right')],
  ];
}
function inspTabs(c) {
  const o = c.obj;
  if (c.kind === 'clip') return clipTabs(c);
  if (c.tabs) return c.tabs(c); // feature components bring their own inspector tabs
  if (c.kind === 'line') return [['basic', 'Cơ bản', textBlock(o, true)], ['anim', 'Hoạt ảnh', animBlock(c)], ['pos', 'Vị trí', posBlock(c) + timeBlock(c)]];
  if (c.kind === 'cap') return [['basic', 'Cơ bản', sect('Nội dung', `<textarea data-f="captext" rows="2" class="big">${esc(capText(o))}</textarea>
      <div class="help">*từ* = từ khoá nổi bật · dấu / = xuống dòng. Bấm từ để bật/tắt nổi bật, Shift+bấm để xuống dòng.</div>
      <div class="wchips">${o.words.map((w, i) => `<span data-w="${i}" class="${w.hl ? 'hl' : ''} ${w.br ? 'br' : ''}">${esc(w.w)}</span>`).join('')}</div>`, 'ti-badge-cc') +
    sect('Chữ', `<div class="row"><div><span class="lbl">Font</span><select data-f="font">${opt(FONTS, o.font || '')}</select></div>
      <div><span class="lbl">Độ đậm</span><select data-f="weight">${opt([['', 'Mặc định'], ['600', '600'], ['700', '700'], ['800', '800'], ['900', '900']], o.weight || '')}</select></div></div>
      ${colorBlock(o.color)}<div class="acts"><button data-act="capall"><i class="ti ti-copy-check"></i> Áp dụng font/cỡ/màu/vị trí cho mọi phụ đề</button></div>`, 'ti-typography')],
    ['pos', 'Vị trí', posBlock(c) + timeBlock(c)]];
  if (c.kind === 'node') return [['basic', 'Cơ bản', sect('Nút sơ đồ', `<div class="row"><div><span class="lbl">Loại</span><select data-f="nkind">${opt(Object.keys(NODE_SIZE).map(k => [k, k]), o.kind)}</select></div>
      <div><span class="lbl">Icon</span><input data-f="icon" value="${esc(o.icon || '')}" placeholder="si:openai / 🚀"></div></div>
      <span class="lbl">Nội dung</span><input data-f="text" value="${esc(o.text || '')}">
      ${o.keys ? `<div class="help">Nút này di chuyển theo ${o.keys.length} mốc; kéo trên khung hình sẽ sửa mốc đang hiệu lực (${fmt(activeKey(o).t)}).</div>` : ''}`, 'ti-hierarchy')],
    ['pos', 'Vị trí', posBlock(c) + timeBlock(c)]];
  if (c.kind === 'badge') return [['basic', 'Cơ bản', sect('Huy hiệu', `<span class="lbl">Icon (si:slug, emoji, ảnh)</span><input data-f="icon" value="${esc(o.icon || 'si:claude')}"><span class="lbl">Màu nền</span><input type="color" data-f="bg" value="${o.bg || '#D97757'}">`) + posBlock(c)]];
  if (c.kind === 'sfx') return [['basic', 'Cơ bản', sect('Hiệu ứng âm thanh', `<span class="lbl">Tiếng</span><div class="row"><select data-f="sfxname">${opt(LIB.sfx.map(f => [f.replace(/\.\w+$/, ''), f.replace(/\.\w+$/, '')]), o.name)}</select><button data-act="audition" class="fixed"><i class="ti ti-player-play-filled"></i></button></div>
    <span class="lbl">Âm lượng (dB)</span>${num('gain', o.gain ?? -12, 1)}`, 'ti-bell') + timeBlock(c)]];
  if (c.kind === 'music') return [['basic', 'Cơ bản', sect('Nhạc nền', `<span class="lbl">Nhạc</span><select data-f="mood">${opt([...(o.file ? [['', o.file]] : []), ...LIB.music.map(f => [f.replace('.mp3', ''), f.replace('.mp3', '')])], o.mood || '')}</select>
    <span class="lbl">Âm lượng (dB)</span>${num('gain', o.gain ?? -16, 1)}`, 'ti-music') + timeBlock(c)]];
  // scene
  let basic = '';
  if (o.text != null || ['led_text', 'neon_text'].includes(o.type)) basic += sect('Nội dung', `<input data-f="text" value="${esc(o.text || '')}">${colorBlock(o.color)}`, 'ti-letter-t');
  if (o.type === 'emoji_pop') basic += sect('Emoji', `<input data-f="emoji" value="${esc(o.src || '')}"><div class="help">Dán một emoji bất kỳ. Thư viện Sticker bên trái có sẵn emoji 3D.</div>`, 'ti-mood-smile');
  if (o.type === 'logo_row') basic += sect('Logo (cách nhau dấu phẩy)', `<input data-f="icons" value="${esc((o.icons || []).map(i => (typeof i === 'object' ? i.icon : i)).join(', '))}"><div class="help">si:openai, si:claude, si:googlegemini, emoji 🤖…</div>`, 'ti-brand-apple');
  if (o.type === 'title_card') basic += sect('Thẻ kết', `<span class="lbl">Câu hỏi</span><input data-f="question" value="${esc(o.question ?? '')}"><span class="lbl">Chữ trong nhãn</span><input data-f="pilltext" value="${esc(o.pill?.text || 'Claude')}">`);
  if (o.type === 'photo') { const cur = o.media || o.src, list = (typeof MEDIA !== 'undefined' ? MEDIA : []).filter(m => m.kind !== 'audio');
    basic += sect('Ảnh / clip', `<select data-f="pmedia">${opt([['', typeof cur === 'object' && cur ? 'Video đã chọn' : '— Chọn từ Media —'], ...list.map(m => [m.path, m.name])], typeof cur === 'string' ? cur : '')}</select><div class="help">Nhập ảnh/video mới ở mục Media bên trái.</div>`, 'ti-photo'); }
  if (o.type === 'frame_grid') basic += sect('Khung video', `<span class="lbl">Làm mờ video (px)</span>${num('blur', typeof o.blur === 'number' ? o.blur : Array.isArray(o.blur) ? o.blur[o.blur.length - 1].v : 0)}<span class="lbl">Vào cảnh</span><select data-f="enter">${opt([['cut', 'Cắt'], ['blur', 'Mờ dần'], ['zoom', 'Phóng to']], o.enter || 'cut')}</select>`);
  basic += timeBlock(c);
  return [['basic', 'Cơ bản', basic], ['pos', 'Vị trí', posBlock(c) || sect('', '<div class="help">Thành phần này không kéo thả được trên preview. Sửa vị trí trong tab Nâng cao (JSON).</div>')],
    ['json', 'Nâng cao', sect('Tham số đầy đủ (JSON)', `<textarea class="code" data-f="json">${esc(JSON.stringify(o, (k, v) => (k === 'cid' || k === '_orig' || k === 'lines' || k === 'nodes' ? undefined : v), 1))}</textarea>
      <div class="acts"><button data-act="json" class="primary"><i class="ti ti-check"></i> Áp dụng JSON</button></div>`, 'ti-code')]];
}
const KIND_IC = { clip: 'ti-movie', line: 'ti-letter-t', cap: 'ti-badge-cc', node: 'ti-hierarchy', badge: 'ti-badge', sfx: 'ti-bell', music: 'ti-music', scene: 'ti-sparkles' };
function renderInspector() {
  const el = $('#insp');
  if (!sel) { el.innerHTML = projectPanel(); return; }
  const c = sel, o = c.obj;
  const tag = { clip: 'Video', line: c.scene?.type === 'text' ? 'Chữ thêm' : 'Chữ graphic', cap: 'Phụ đề', node: 'Sơ đồ', badge: 'Huy hiệu', sfx: 'Âm thanh', music: 'Nhạc nền', scene: sceneName(o) }[c.kind] || c.tag || c.kind;
  const tabs = inspTabs(c), key = c.kind;
  for (const h of Studio._insp) { const t = h(c); if (t) tabs.push(...(Array.isArray(t[0]) ? t : [t])); }
  if (!tabs.some(t => t[0] === ITAB[key])) ITAB[key] = tabs[0][0];
  const cur = tabs.find(t => t[0] === ITAB[key]);
  el.innerHTML = `<div class="ihead"><span class="iic"><i class="ti ${KIND_IC[c.kind]}"></i></span><div class="it"><h3>${esc(c.kind === 'line' && c.scene.type === 'text' ? (o.text || 'Chữ thêm') : c.label)}</h3>
      <div class="sub"><span class="pill">${esc(tag)}</span><a class="time" data-act="seek"><i class="ti ti-clock-play"></i> ${fmt(c.t0)} – ${fmt(c.t1)}</a></div></div>
      <button class="icon" data-act="desel" title="Bỏ chọn (Esc)"><i class="ti ti-x"></i></button></div>
    ${tabs.length > 1 ? `<div class="itabs">${tabs.map(([k, l]) => `<button data-itab="${k}" class="${k === cur[0] ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
    <div class="ibody">${cur[2]}${c.kind === 'clip' ? '' : actions(c) + noteBlock(o)}</div>`;
}
function projectPanel() {
  const capStyles = [...new Set(['slate', 'tiktok', ...Object.keys((win && win.CAPTION_STYLES) || {})])];
  const B = TL.brand || {};
  const bf = (k, label, type = 'text', ph = '') => `<div><span class="lbl">${label}</span><input ${type === 'color' ? 'type="color"' : ''} data-brand="${k}" value="${esc(B[k] ?? (type === 'color' ? (k === 'primary' ? '#FF5A36' : '#FFD84A') : ''))}" placeholder="${ph}"></div>`;
  const tabs = [['proj', 'Dự án'], ['brand', 'Thương hiệu']];
  const cur = ITAB.project || 'proj';
  const body = cur === 'brand' ? sect('Bộ nhận diện thương hiệu', `<div class="help" style="margin-top:0">Mọi gói style và mẫu dùng chung.</div>
      <div class="row">${bf('primary', 'Màu chính', 'color')}${bf('accent', 'Màu nhấn', 'color')}</div>
      <div class="row">${bf('name', 'Tên / thương hiệu', 'text', 'Kiệm AI')}${bf('handle', 'Kênh', 'text', '@kiem.ai')}</div>
      <div class="row">${bf('phone', 'Điện thoại', 'text', '09xx…')}${bf('website', 'Website', 'text', 'nguyentatkiem.com')}</div>
      ${bf('logo', 'Logo (media/logo.png, si:slug, emoji)', 'text', 'media/logo.png')}`, 'ti-palette')
    : sect('Gói style', `<select data-pf="pack">${opt([['', '— chọn —'], ...packs().map(p => [p.id, p.icon + ' ' + p.name])], TL.pack || '')}</select>
      <div class="help">${esc(packs().find(p => p.id === TL.pack)?.desc || 'Gói quyết định kiểu phụ đề, graphic gợi ý và bản dựng tự động.')}</div>
      <div class="acts"><button data-pact="recipe" class="primary"><i class="ti ti-wand"></i> Dựng tự động theo gói</button><button data-pact="tplfit"><i class="ti ti-text-recognition"></i> Bám lời thoại</button></div>
      <div class="help">“Dựng tự động”: thêm intro, graphic theo từ khoá trong lời nói, CTA cuối, nhạc. “Bám lời thoại”: canh các graphic của mẫu đúng lúc nói, viết lại chữ và thay ảnh mẫu theo nội dung clip (tự chạy khi chọn mẫu). Hoàn tác được.</div>`, 'ti-package') +
    sect('Kiểu phụ đề', `<select data-pf="caption_style">${opt([...capStyles.map(c => [c, (win && win.CAPTION_LABELS || {})[c] || c]), ['', 'Karaoke cơ bản'], ['none', 'Tắt phụ đề']], TL.caption_style ?? '')}</select>
      <label class="check"><input type="checkbox" data-pf="caption_reveal" ${TL.caption_reveal === false ? '' : 'checked'}> Hiện từng từ theo lời nói</label>`, 'ti-badge-cc') +
    sect('Vị trí mặt (bubble / PIP / vùng mặt)', `<div class="row"><div><span class="lbl">X</span><input type="number" data-pf="facex" value="${TL.face?.x ?? 360}"></div><div><span class="lbl">Y</span><input type="number" data-pf="facey" value="${TL.face?.y ?? 520}"></div></div>`, 'ti-face-id') +
    sect('Âm thanh', `<div class="acts"><button data-pact="autosfx"><i class="ti ti-wand"></i> Tự đặt SFX theo graphic</button></div>
      <div class="help">Lưu dự án, rồi đặt whoosh / pop / ding đúng lúc từng graphic xuất hiện (giữ SFX bạn tự thêm).</div>`, 'ti-volume') +
    sect('Ghi chú chung cho Claude', `<textarea data-pf="note" placeholder="Ví dụ: thêm b-roll ở đoạn 0:12, nhạc sôi động hơn…">${esc(TL.note || '')}</textarea>
      <div class="help">Bấm vào chữ / khung trên preview hoặc khối trên timeline để chỉnh. Kéo để di chuyển, kéo góc để đổi cỡ.</div>`, 'ti-message-2') +
    `<div class="meta"><span><i class="ti ti-movie"></i> ${(TL.clips || []).length} clip</span><span><i class="ti ti-photo"></i> ${META.frames} khung</span><span><i class="ti ti-clock"></i> ${fmt(TL.duration)}</span><span><i class="ti ti-aspect-ratio"></i> ${DW > DH ? '16:9' : '9:16'}</span></div>`;
  return `<div class="ihead"><span class="iic"><i class="ti ti-settings"></i></span><div class="it"><h3>${esc(META.name || 'Dự án')}</h3><div class="sub"><span class="pill">Cài đặt dự án</span></div></div></div>
    <div class="itabs">${tabs.map(([k, l]) => `<button data-itab="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div><div class="ibody">${body}</div>`;
}
// Starter edit from a pack recipe (also used once for projects made by "Video mới").
function applyRecipe(packId, title, replace = false) {
  const p = packs().find(x => x.id === packId);
  if (!p?.recipe) return toast('Gói này chưa có bản dựng tự động');
  const r = p.recipe({ dur: TL.duration, captions: CAP, brand: (win.BR ? win.BR() : TL.brand || {}), vertical: DH > DW, title: title ?? TL.title ?? '' });
  TL.pack = packId;
  if (r.caption_style != null) TL.caption_style = r.caption_style || undefined;
  TL.scenes = [...(replace ? [] : (TL.scenes || []).filter(s => !s._recipe)), ...(r.scenes || []).map(s => ({ ...s, _recipe: true }))];
  if (r.fx) TL.fx = [...(replace ? [] : (TL.fx || []).filter(f => !f._recipe)), ...r.fx.map(f => ({ ...f, _recipe: true }))];
  if (r.music) { TL.audio = TL.audio || {}; TL.audio.music = [{ t0: 0, t1: TL.duration, mood: r.music, gain: -20 }]; }
  needInit = true; changed(true); toast(`Đã dựng theo gói ${p.name}: ${(r.scenes || []).length} thành phần`);
}
function applyField(f, v, el) {
  const c = sel, o = c?.obj;
  if (f === 'note') { o.note = v || undefined; markDirty(); renderList(); return; }
  if (['x', 'y', 'pct'].includes(f)) {
    touch(o, 'pos'); const p = getPos(c);
    if (f === 'x') p.x = +v; if (f === 'y') p.y = +v; if (f === 'pct') p.size = (origSize(c) || p.size) * (+v / 100);
    setPos(c, p); changed(); syncPosInputs(); return;
  }
  if (f === 't0' || f === 't1') { pushUndo(o.cid + f); setTimes(c, f === 't0' ? +v : c.t0, f === 't1' ? +v : c.t1, false); changed(); return; }
  if (f === 'dur') { pushUndo(o.cid + f); setTimes(c, c.t0, c.t0 + +v, false); changed(); const b = el.parentNode.querySelector('b'); if (b) b.textContent = r2(+v) + 's'; return; }
  touch(o, f);
  if (f === 'text') o.text = v;
  else if (f === 'font' || f === 'weight' || f === 'style' || f === 'anim') { if (v === '') delete o[f]; else o[f] = f === 'weight' ? +v : v; }
  else if (f === 'italic') o.italic = el.checked;
  else if (f === 'color') o.color = v;
  else if (f === 'icon') o.icon = v;
  else if (f === 'emoji') o.src = v;
  else if (f === 'bg') o.bg = v;
  else if (f === 'nkind') { o.kind = v; }
  else if (f === 'gain') o.gain = +v;
  else if (f === 'sfxname') o.name = v;
  else if (f === 'mood') { if (v) { o.mood = v; delete o.file; } }
  else if (f === 'question') o.question = v;
  else if (f === 'pilltext') o.pill = { ...(o.pill || {}), text: v };
  else if (f === 'icons') o.icons = v.split(',').map(s => s.trim()).filter(Boolean);
  else if (f === 'enter') o.enter = v;
  else if (f === 'blur') o.blur = +v;
  else if (f === 'pmedia') { const m = MEDIA.find(x => x.path === v); if (m) { o.media = m.kind === 'video' ? { ...m.seq, t0: o.t0 } : m.path; delete o.src; } }
  else if (f === 'captext') setCapText(o, v);
  changed(f === 'captext' || f === 'nkind');
}
function syncPosInputs() {
  const p = getPos(sel); if (!p) return;
  const set = (f, v) => { for (const i of document.querySelectorAll(`#insp [data-f="${f}"]`)) if (document.activeElement !== i) i.value = v; };
  set('x', Math.round(p.x)); set('y', Math.round(p.y)); set('pct', Math.round(p.size / (origSize(sel) || p.size) * 100));
}
// "những thông tin / *gây shock*" → words with br/hl; keeps timings when the word count is unchanged, else spreads evenly.
function setCapText(c, v) {
  const toks = []; let hl = false, buf = [];
  for (const raw of v.trim().split(/\s+/)) {
    if (raw === '/') { if (toks.length) toks[toks.length - 1].br = true; continue; }
    let w = raw;
    if (w.startsWith('*')) { hl = true; w = w.slice(1); }
    const end = w.endsWith('*'); if (end) w = w.slice(0, -1);
    if (hl) { buf.push(w); if (end) { toks.push({ w: buf.join(' '), hl: true }); buf = []; hl = false; } }
    else if (w) toks.push({ w });
  }
  if (buf.length) toks.push({ w: buf.join(' '), hl: true });
  const old = c.words, same = old.length === toks.length;
  c.words = toks.map((tk, i) => {
    const s = same ? old[i].s : r2(c.t0 + (c.t1 - c.t0) * i / toks.length), e = same ? old[i].e : r2(c.t0 + (c.t1 - c.t0) * (i + 1) / toks.length);
    return { w: tk.w, s, e, ...(tk.hl ? { hl: true } : {}), ...(tk.br ? { br: true } : {}) };
  });
}
// Clip field edits from the inspector (sliders coalesce into one undo step).
function clipField(f, v, el) {
  const c = sel; if (c?.kind !== 'clip') return;
  const o = c.obj, i = c.idx;
  pushUndo('clip' + i + f);
  const lab = el?.parentNode?.querySelector(`[data-v="${f}"]`);
  if (f === 'speed') { setClipSpeed(i, +v); if (lab) lab.textContent = r2(+v) + '×'; changed(); return; }
  if (f === 'in' || f === 'out') {
    const sp = o.speed || 1, cur = f === 'in' ? (o.in || 0) : (o.out ?? 3);
    trimClip(i, f === 'in' ? 'l' : 'r', (+v - cur) / sp); changed(true); return;
  }
  if (f === 'zoom' || f === 'ox' || f === 'oy') { o[f] = +v; if (f === 'zoom' && +v === 1) delete o.zoom; }
  else if (f === 'volume') { o.volume = +v / 100; if (o.volume === 1) delete o.volume; }
  else if (f === 'tdur') { if (o.transition) o.transition.dur = +v; }
  else { o.filter = { ...(o.filter || {}), [f]: +v }; }
  if (lab) lab.textContent = (f === 'volume' ? Math.round(+v) : r2(+v)) + ({ zoom: '×', ox: '%', oy: '%', volume: '%', hue: '°', blur: 'px', tdur: 's' }[f] || '');
  changed();
}
$('#insp').addEventListener('input', e => {
  const t = e.target, f = t.dataset.f, pf = t.dataset.pf, bk = t.dataset.brand, cf = t.dataset.cf;
  if (cf) { if (t.type === 'range') clipField(cf, t.value, t); return; }
  if (bk) { pushUndo('brand' + bk); TL.brand = { ...(TL.brand || {}), [bk]: t.value || undefined }; return changed(); }
  if (pf) return projectField(pf, t);
  if (!f || f === 'json' || f === 'captext') return;
  if (t.tagName === 'SELECT' || t.type === 'checkbox') return;
  if (t.type === 'range' && f === 'pct') { const b = t.parentNode.querySelector('b'); if (b) b.textContent = t.value + '%'; }
  applyField(f, t.value, t);
});
$('#insp').addEventListener('change', e => {
  const t = e.target, f = t.dataset.f, pf = t.dataset.pf, cf = t.dataset.cf;
  if (cf && t.type === 'number') return clipField(cf, t.value, t);
  if (cf && t.type === 'range') return renderInspector();
  if (pf) return projectField(pf, t);
  if (f === 'captext' || t.tagName === 'SELECT' || t.type === 'checkbox') applyField(f, t.value, t);
});
function projectField(pf, el) {
  pushUndo('proj' + pf);
  if (pf === 'caption_style') TL.caption_style = el.value || undefined;
  if (pf === 'pack') { TL.pack = el.value || undefined; renderInspector(); }
  if (pf === 'caption_reveal') TL.caption_reveal = el.checked ? undefined : false;
  if (pf === 'facex' || pf === 'facey') TL.face = { ...(TL.face || { x: 360, y: 520 }), [pf === 'facex' ? 'x' : 'y']: +el.value };
  if (pf === 'note') TL.note = el.value || undefined;
  changed();
}
async function autoSfx() {
  await saveNow(); pushUndo();
  const p = await api('/api/autosfx', { keep: true });
  if (p.error) return toast('Lỗi: ' + p.error);
  TL = p.timeline; CAP = p.captions; migrateClips(); changed(true); return toast(`Đã đặt ${TL.audio?.sfx?.length || 0} SFX`);
}
$('#insp').addEventListener('click', async e => {
  const t = e.target;
  const it = t.closest('[data-itab]');
  if (it) { ITAB[sel ? sel.kind : 'project'] = it.dataset.itab; return renderInspector(); }
  const pa = t.closest('[data-pact]')?.dataset.pact;
  if (pa === 'recipe') {
    if (!TL.pack) return toast('Chọn gói style trước');
    // recipes place their graphics on keywords of the speech — without captions they would only add intro/CTA
    if (!CAP.length && Studio.needCaptions) return Studio.needCaptions(() => { pushUndo(); applyRecipe(TL.pack); }, 'Dựng tự động theo gói');
    pushUndo(); return applyRecipe(TL.pack);
  }
  if (pa === 'autosfx') return autoSfx();
  if (!sel) return;
  const c = sel, o = c.obj;
  // clip controls
  let b;
  if ((b = t.closest('[data-cfit]'))) { pushUndo(); o.fit = b.dataset.cfit; if (o.fit === 'cover') delete o.fit; return changed(true); }
  if ((b = t.closest('[data-cspeed]'))) { pushUndo(); setClipSpeed(c.idx, +b.dataset.cspeed); return changed(true); }
  if ((b = t.closest('[data-cpreset]'))) { return setFilter(c.idx, b.dataset.cpreset); }
  if ((b = t.closest('[data-ctr]'))) { return setTransition(c.idx, b.dataset.ctr, o.transition?.dur ?? transDur); }
  if ((b = t.closest('[data-cact]'))) {
    const a = b.dataset.cact;
    if (a === 'flip') { pushUndo(); o.flip = !o.flip || undefined; return changed(true); }
    if (a === 'mute') { pushUndo(); o.mute = !o.mute || undefined; return changed(true); }
    if (a === 'resetcolor') { pushUndo(); delete o.filter; return changed(true); }
    if (a === 'split') return splitAtPlayhead();
    if (a === 'dup') return duplicateSel();
    if (a === 'del') return removeSel();
  }
  if ((b = t.closest('[data-anim]'))) { touch(o, 'anim'); o.anim = b.dataset.anim; changed(true); return; }
  if ((b = t.closest('[data-sty]'))) { touch(o, 'style'); o.style = b.dataset.sty; changed(true); return; }
  b = t.closest('[data-act],[data-color],[data-w]'); if (!b) return;
  if (b.dataset.color != null) { touch(o, 'color'); if (b.dataset.color) o.color = b.dataset.color; else delete o.color; changed(true); return; }
  if (b.dataset.w != null) { touch(o, 'w'); const w = o.words[+b.dataset.w]; if (e.shiftKey) w.br = !w.br || undefined; else w.hl = !w.hl || undefined; changed(true); return; }
  const a = b.dataset.act;
  if (a === 'seek') setTime(c.t0);
  if (a === 'desel') select(null);
  if (a === 'hide') { touch(o); o.hidden = !o.hidden || undefined; changed(true); }
  if (a === 'del') removeSel();
  if (a === 'dup') duplicateSel();
  if (a === 'reset') { pushUndo(); const orig = o._orig; for (const k of Object.keys(o)) if (k !== 'cid' && k !== 'note') delete o[k]; Object.assign(o, orig); changed(true); }
  if (a === 'audition') new Audio(sfxUrl(o.name)).play();
  if (a === 'json') {
    try {
      const v = JSON.parse($('#insp [data-f="json"]').value); touch(o);
      for (const k of Object.keys(o)) if (!['cid', '_orig', 'lines', 'nodes', 'note'].includes(k)) delete o[k];
      Object.assign(o, v); changed(true); toast('Đã áp dụng');
    } catch (err) { toast('JSON lỗi: ' + err.message); }
  }
  if (a === 'capall') {
    pushUndo();
    for (const x of CAP) for (const k of ['font', 'size', 'color', 'weight', 'x', 'y']) { if (o[k] != null) x[k] = o[k]; else delete x[k]; }
    changed(true); toast('Đã áp dụng cho ' + CAP.length + ' phụ đề');
  }
});
function removeSel() {
  if (!sel) return;
  const c = sel, o = c.obj;
  if (c.kind === 'clip') {
    if (TRK.video.lock) return toast('Track video đang khoá');
    pushUndo();
    if (!deleteClip(c.idx)) { undoStack.pop(); return toast('Không thể xoá clip duy nhất'); }
    sel = null; changed(true); return toast('Đã xoá clip · phần sau tự dồn lại');
  }
  pushUndo();
  const drop = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); };
  if (c.kind === 'scene') drop(TL.scenes, o);
  else if (c.kind === 'line') { drop(c.scene.lines, o); if (c.scene.type === 'text' && !c.scene.lines.length) drop(TL.scenes, c.scene); }
  else if (c.kind === 'node') { drop(c.scene.nodes, o); c.scene.edges = (c.scene.edges || []).filter(e => e.from !== o.id && e.to !== o.id); }
  else if (c.kind === 'badge') c.scene.badge = false;
  else if (c.kind === 'cap') drop(CAP, o);
  else if (c.kind === 'sfx') drop(TL.audio.sfx, o);
  else if (c.kind === 'music') drop(TL.audio.music, o);
  else if (c.remove) c.remove();
  sel = null; changed(true);
}
function duplicateSel() {
  if (!sel) return; pushUndo();
  const c = sel;
  if (c.kind === 'clip') { const cp = duplicateClip(c.idx); changed(); return select(compOf(cp)); }
  const cp = JSON.parse(JSON.stringify(c.obj, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v)));
  const d = Math.min(1, c.t1 - c.t0);
  let nw = cp;
  if (c.kind === 'scene') { shiftScene(cp, d); cp.t0 += d; cp.t1 += d; TL.scenes.push(cp); }
  else if (c.kind === 'line') { const s = JSON.parse(JSON.stringify(c.scene, (k, v) => (k === 'cid' || k === '_orig' ? undefined : v))); if (c.scene.type === 'text') { s.lines = [nw = { ...cp, y: (cp.y ?? 640) + 70 }]; TL.scenes.push(s); } else { cp.y = (cp.y ?? 640) + 70; c.scene.lines.push(cp); } }
  else if (c.kind === 'node') { cp.id = (cp.id || 'n') + '_2'; if (cp.keys) cp.keys.forEach(k => (k.y += 60)); else cp.y = (cp.y ?? 600) + 60; c.scene.nodes.push(cp); }
  else if (c.kind === 'sfx') { cp.t += .5; TL.audio.sfx.push(cp); }
  else if (c.kind === 'cap') { cp.y = (cp.y ?? 790) + 60; CAP.push(cp); }
  else if (c.dup) c.dup(cp);
  else { undoStack.pop(); return; }
  changed(); const n = compOf(nw) || comps.find(x => JSON.stringify(x.obj, strip) === JSON.stringify(cp, strip)); select(n || null);
}
function splitAtPlayhead() {
  if (!TL.clips?.length) return toast('Chưa có clip');
  if (TRK.video.lock) return toast('Track video đang khoá');
  pushUndo();
  const b = splitClipAt(T);
  if (!b) { undoStack.pop(); return toast('Đặt playhead vào giữa một clip để tách'); }
  changed(); select(compOf(b)); toast('Đã tách clip');
}

// ---------- add text / graphics ----------
// Graphic library = every pack registered in the engine (engine/packs/*.js); see library.js (Hiệu ứng).
const packs = () => (win && win.PACKS) || [];

// ---------- stage interactions ----------
let drag = null;
$('#overlay').addEventListener('mousedown', e => {
  const box = $('#stagebox').getBoundingClientRect();
  const px = (e.clientX - box.left) / K, py = (e.clientY - box.top) / K;
  const handle = e.target.matches('.selbox i') ? e.target.className : null;
  if (!handle && !e.target.closest('.selbox')) { const c = pick(px, py); if (c !== sel) { select(c); } }
  if (!sel || sel.kind === 'clip') return;
  const p0 = getPos(sel); if (!p0) return;
  const r = rectOf(sel.obj);
  drag = { sx: e.clientX, sy: e.clientY, p0: { ...p0 }, handle, cx: r ? r.x + r.w / 2 : p0.x, cy: r ? r.y + r.h / 2 : p0.y, moved: false };
  e.preventDefault();
});
window.addEventListener('mousemove', e => {
  if (!drag) return;
  const dx = (e.clientX - drag.sx) / K, dy = (e.clientY - drag.sy) / K;
  if (!drag.moved && Math.hypot(dx, dy) < 2) return;
  if (!drag.moved) { touch(sel.obj, 'drag' + Date.now()); drag.moved = true; }
  const p = { ...drag.p0 };
  if (drag.handle) {
    const box = $('#stagebox').getBoundingClientRect();
    const mx = (e.clientX - box.left) / K, my = (e.clientY - box.top) / K, ox = (drag.sx - box.left) / K, oy = (drag.sy - box.top) / K;
    const f = Math.max(.15, Math.hypot(mx - drag.cx, my - drag.cy) / Math.max(4, Math.hypot(ox - drag.cx, oy - drag.cy)));
    p.size = drag.p0.size * f;
  } else {
    let nx = drag.p0.x + dx, ny = drag.p0.y + dy;
    if (!e.altKey && Math.abs(nx - DW / 2) < 6 && sel.kind !== 'scene') nx = DW / 2; // snap to centre line
    p.x = nx; p.y = ny;
  }
  setPos(sel, p); needInit = true; build(); draw(); syncPosInputs();
});
window.addEventListener('mouseup', () => { if (drag?.moved) changed(); drag = null; });
$('#overlay').addEventListener('dblclick', () => { const i = $('#insp [data-f="text"], #insp [data-f="captext"]'); if (i) { i.focus(); i.select?.(); } });

// ---------- timeline ----------
let PPS = 60, lastTrackSig = '';
const RULER_H = 28, VIDEO_H = 64, WAVE_H = 40;
const lanes = list => { const ends = []; for (const c of list) { let l = ends.findIndex(e => e <= c.t0 + .001); if (l < 0) { l = ends.length; ends.push(0); } ends[l] = c.t1; c.lane = l; } return Math.max(1, ends.length); };
function rulerStep() { for (const s of [.25, .5, 1, 2, 5, 10, 15, 30, 60, 120]) if (s * PPS >= 64) return s; return 300; }
function clipStrip(k, w) {
  const tw = Math.max(18, Math.round((VIDEO_H - 2) * DW / DH)), n = Math.min(400, Math.ceil(w / tw)), sp = k.c.speed || 1, f = clipFilterCss(k.c);
  let h = '';
  for (let j = 0; j < n; j++) h += `<i style="width:${tw}px;background-image:url('${clipFrameUrl(k.c, (k.c.in || 0) + ((j + .5) * tw / PPS) * sp)}');filter:${f}"></i>`;
  return h;
}
function renderTimeline() {
  if (!TL) return;
  const dur = TL.duration, W = dur * PPS + 240;
  $('#tlinner').style.width = W + 'px';
  const step = rulerStep(), minor = step / 4;
  let rh = '';
  for (let s = 0; s <= dur + step; s += minor) {
    const major = Math.abs(s / step - Math.round(s / step)) < 1e-6;
    rh += `<i class="${major ? 'mj' : ''}" style="left:${s * PPS}px"></i>`;
    if (major) rh += `<span style="left:${s * PPS}px">${step < 1 ? fmt(s).replace(/0$/, '') : fmt(s).replace(/\.\d+$/, '')}</span>`;
  }
  rh += `<div class="endmark" style="left:${dur * PPS}px"></div>`;
  $('#ruler').innerHTML = rh;
  let th = '', lh = '';
  const label = (key, name, ic, h, tools = true) => `<div class="lrow ${key === 'video' ? 'main' : ''}" style="height:${h}px"><i class="ti ${ic}"></i><span>${name}</span>
    ${tools ? `<button class="lt ${TRK[key].hide ? 'on' : ''}" data-thide="${key}" title="Ẩn trên preview"><i class="ti ${TRK[key].hide ? 'ti-eye-off' : 'ti-eye'}"></i></button><button class="lt ${TRK[key].lock ? 'on' : ''}" data-tlock="${key}" title="Khoá track"><i class="ti ${TRK[key].lock ? 'ti-lock' : 'ti-lock-open'}"></i></button>` : ''}</div>`;
  for (const [key, name, ic] of TRACKS) {
    const lk = TRK[key]?.lock ? ' locked' : '', hd = TRK[key]?.hide ? ' hid' : '';
    if (key === 'wave') { th += `<div class="track wave" style="height:${WAVE_H}px"><canvas class="wave" id="wave" width="${Math.min(32000, Math.ceil(W))}" height="${WAVE_H}"></canvas></div>`; lh += label(key, name, ic, WAVE_H, false); continue; }
    if (key === 'video') {
      const L = clipLayout();
      th += `<div class="track video${lk}${hd}" data-track="video" style="height:${VIDEO_H + 8}px">` + L.map(k => {
        const w = Math.max(6, (k.t1 - k.t0) * PPS - 1), c = k.c, on = sel?.obj === c;
        return `<div class="clip ${on ? 'sel' : ''}" data-ci="${k.i}" style="left:${k.t0 * PPS}px;width:${w}px">
          <div class="strip">${clipStrip(k, w)}</div>
          <div class="ctop"><span class="cn">${k.i + 1}</span>${c.speed && c.speed !== 1 ? `<span class="cb"><i class="ti ti-brand-speedtest"></i>${c.speed}×</span>` : ''}${c.mute ? '<span class="cb"><i class="ti ti-volume-off"></i></span>' : ''}${c.filter ? '<span class="cb"><i class="ti ti-color-filter"></i></span>' : ''}${c.flip ? '<span class="cb"><i class="ti ti-flip-vertical"></i></span>' : ''}<span class="cd">${r2(k.t1 - k.t0)}s</span></div>
          <span class="h l"></span><span class="h r"></span></div>`;
      }).join('') + L.slice(1).map(k => `<button class="tb ${k.c.transition ? 'on' : ''}" data-tbi="${k.i}" style="left:${k.t0 * PPS}px" title="${k.c.transition ? 'Chuyển cảnh: ' + (TRANS_TYPES.find(x => x[0] === k.c.transition.type)?.[1] || k.c.transition.type) : 'Thêm chuyển cảnh'}"><i class="ti ${k.c.transition ? 'ti-transition-right' : 'ti-plus'}"></i></button>`).join('') + '</div>';
      lh += label(key, name, ic, VIDEO_H + 8);
      continue;
    }
    const list = comps.filter(c => c.track === key).sort((a, b) => a.t0 - b.t0);
    if (!list.length && !['cap', 'audio'].includes(key) && !key.startsWith('xa:') && !TRK[key].lock && !TRK[key].hide) continue; // empty optional tracks stay out of the way
    const n = lanes(list), h = Math.max(28, n * 24 + 5);
    th += `<div class="track${lk}${hd}" data-track="${key}" style="height:${h}px">` + list.map(c => `<div class="blk ${sel?.obj === c.obj ? 'sel' : ''} ${c.obj.hidden ? 'off' : ''} k-${c.kind}" data-cid="${c.obj.cid}"
      style="left:${c.t0 * PPS}px;width:${Math.max(8, (c.t1 - c.t0) * PPS - 2)}px;top:${3 + c.lane * 24}px;--bc:${TCOL[key]}" title="${esc(c.label)} · ${fmt(c.t0)}–${fmt(c.t1)}">
      <span class="h l"></span>${c.obj.note ? '<span class="note"></span>' : ''}${c.kind === 'sfx' ? '<i class="ti ti-bell"></i>' : c.kind === 'music' ? '<i class="ti ti-music"></i>' : c.icon ? `<i class="ti ${c.icon}"></i>` : ''}${esc(c.label)}${Studio._blk.map(f => f(c, PPS)).join('')}<span class="h r"></span></div>`).join('') + '</div>';
    lh += label(key, name, ic, h);
  }
  $('#tracks').innerHTML = th; $('#tllabels').innerHTML = `<div class="lhead" style="height:${RULER_H}px"></div><div class="lrows" id="lrows">${lh}</div>`;
  // When the set of tracks changes, keep the main video track (and voice) in view.
  const sig = [...document.querySelectorAll('#tracks .track')].map(t => t.dataset.track || 'w').join();
  if (sig !== lastTrackSig) {
    lastTrackSig = sig;
    const sc = $('#tlscroll'), tv = $('.track.video');
    if (tv) { const want = tv.offsetTop + tv.offsetHeight + WAVE_H + 40 - sc.clientHeight; if (want > sc.scrollTop) sc.scrollTop = want; }
  }
  $('#lrows').scrollTop = $('#tlscroll').scrollTop;
  drawWave(); placeHead();
  const n = comps.filter(c => c.track && c.track !== 'audio' && c.kind !== 'clip').length;
  $('#tlinfo').textContent = `${(TL.clips || []).length} clip · ${n} thành phần · ${fmt(dur)}`;
}
function drawWave() {
  const cv = $('#wave'); if (!cv || !WAVE.length) return;
  const g = cv.getContext('2d'), H = cv.height, mid = H / 2;
  const src = TL.audio?.voice || META.audio;
  const col = getComputedStyle(document.body).getPropertyValue('--wave').trim() || '#2dd4bf';
  if (!TL.clips?.length) { g.fillStyle = col; for (let x = 0; x < cv.width; x += 3) { const v = WAVE[Math.floor(x / PPS * 50)] || 0, h = Math.max(1, v * (H - 6)); g.fillRect(x, mid - h / 2, 2, h); } return; }
  for (const k of clipLayout()) {
    if (k.c.audio !== src) continue;
    g.fillStyle = k.c.mute ? 'rgba(160,160,170,.35)' : col;
    const vol = k.c.mute ? .6 : clamp(k.c.volume ?? 1, .2, 1.6);
    for (let x = Math.ceil(k.t0 * PPS); x < k.t1 * PPS && x < cv.width; x += 3) {
      const v = WAVE[Math.floor(srcAt(k, x / PPS) * 50)] || 0, h = Math.max(1, Math.min(H - 4, v * (H - 6) * vol));
      g.fillRect(x, mid - h / 2, 2, h);
    }
  }
}
function placeHead() { $('#playhead').style.left = T * PPS + 'px'; }
function setZoom(v) { PPS = clamp(v, 8, 300); $('#zoom').value = PPS; renderTimeline(); autoScroll(); }
$('#zoom').addEventListener('input', e => setZoom(+e.target.value));
$('#zin').addEventListener('click', () => setZoom(PPS * 1.3));
$('#zout').addEventListener('click', () => setZoom(PPS / 1.3));
function zoomFit() { setZoom(($('#tlscroll').clientWidth - 60) / Math.max(1, TL.duration)); $('#tlscroll').scrollLeft = 0; }
$('#zfit').addEventListener('click', zoomFit);
$('#tsnap').addEventListener('click', () => { SNAP = !SNAP; $('#tsnap').classList.toggle('on', SNAP); toast(SNAP ? 'Bật nam châm' : 'Tắt nam châm'); });
$('#tsplit').addEventListener('click', splitAtPlayhead);
$('#tdel').addEventListener('click', removeSel);
$('#tdup').addEventListener('click', duplicateSel);
$('#tlscroll').addEventListener('scroll', () => { const l = $('#lrows'); if (l) l.scrollTop = $('#tlscroll').scrollTop; });
$('#tlscroll').addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(PPS * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); } }, { passive: false });
$('#tllabels').addEventListener('click', e => {
  const h = e.target.closest('[data-thide]'), l = e.target.closest('[data-tlock]');
  if (h) { const k = h.dataset.thide; TRK[k].hide = !TRK[k].hide; needInit = true; draw(); renderTimeline(); }
  if (l) { const k = l.dataset.tlock; TRK[k].lock = !TRK[k].lock; if (TRK[k].lock && sel?.track === k) select(null); renderTimeline(); }
});
function seekFromX(clientX) { const r = $('#tlinner').getBoundingClientRect(); setTime(clamp((clientX - r.left) / PPS, 0, TL.duration - 1 / FPS)); }
function snap(t, self) {
  if (!SNAP) return t;
  const cands = [T, 0, ...clipLayout().flatMap(k => [k.t0, k.t1]), ...comps.filter(c => c.obj !== self && c.track && c.kind !== 'clip').flatMap(c => [c.t0, c.t1])];
  for (const x of cands) if (Math.abs(x - t) * PPS < 7) return x;
  return t;
}
let tdrag = null;
$('#tlinner').addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (e.target.closest('.tb')) return;
  const cl = e.target.closest('.clip');
  if (cl) {
    const i = +cl.dataset.ci, c = TL.clips[i];
    if (TRK.video.lock) return;
    if (sel?.obj !== c) select(compOf(c));
    const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
    const k = clipLayout()[i];
    tdrag = { clip: true, i, mode, sx: e.clientX, moved: false, base: snapshot(), k };
    e.preventDefault(); return;
  }
  const b = e.target.closest('.blk');
  if (!b || b.closest('.locked')) { seekFromX(e.clientX); tdrag = { scrub: true }; return; }
  const c = compByCid(b.dataset.cid); if (!c) return;
  if (sel?.obj !== c.obj) select(c);
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  tdrag = { c, mode, sx: e.clientX, t0: c.t0, t1: c.t1, moved: false };
  e.preventDefault();
});
$('#ruler').addEventListener('mousedown', e => { seekFromX(e.clientX); tdrag = { scrub: true }; e.stopPropagation(); });
function clipDragMove(e) {
  const d = (e.clientX - tdrag.sx) / PPS;
  if (!tdrag.moved && Math.abs(e.clientX - tdrag.sx) < 3) return;
  if (!tdrag.moved) { pushUndo(); tdrag.moved = true; }
  const { i, mode, k } = tdrag;
  if (mode === 'move') {
    // reorder: show a drop marker at the nearest boundary
    const L = clipLayout(), x = (e.clientX - $('#tlinner').getBoundingClientRect().left) / PPS;
    let j = L.length; for (const q of L) if (x < (q.t0 + q.t1) / 2) { j = q.i; break; }
    tdrag.target = j;
    const at = j < L.length ? L[j].t0 : L[L.length - 1].t1;
    let m = $('#dropmark'); if (!m) { m = document.createElement('div'); m.id = 'dropmark'; $('#tracks').appendChild(m); }
    const tv = $('.track.video'); m.style.left = at * PPS - 2 + 'px'; m.style.top = tv.offsetTop + 'px'; m.style.height = tv.offsetHeight + 'px';
    const g = document.querySelector(`.clip[data-ci="${i}"]`); if (g) { g.classList.add('dragging'); g.style.transform = `translateX(${e.clientX - tdrag.sx}px)`; }
    return;
  }
  // ripple trim from the drag-start state
  const o = JSON.parse(tdrag.base); TL = o.TL; CAP = o.CAP;
  const edgeT = mode === 'r' ? k.t1 : k.t0;
  let target = edgeT + d;
  if (SNAP) { for (const x of [T, ...clipLayout().filter(q => q.i !== i).flatMap(q => [q.t0, q.t1])]) if (Math.abs(x - target) * PPS < 7) { target = x; break; } }
  trimClip(i, mode, target - edgeT);
  build(); sel = compOf(TL.clips[i]); renderTimeline(); needInit = true; draw();
}
window.addEventListener('mousemove', e => {
  if (!tdrag) return;
  if (tdrag.scrub) return seekFromX(e.clientX);
  if (tdrag.clip) return clipDragMove(e);
  const d = (e.clientX - tdrag.sx) / PPS;
  if (!tdrag.moved && Math.abs(e.clientX - tdrag.sx) < 3) return;
  if (!tdrag.moved) { pushUndo(); touch(tdrag.c.obj); tdrag.moved = true; }
  const { c, mode, t0, t1 } = tdrag;
  const cur = compOf(c.obj) || c;
  if (mode === 'move') { let n0 = snap(t0 + d, c.obj); if (n0 === t0 + d) n0 = snap(t1 + d, c.obj) - (t1 - t0); setTimes(cur, n0, n0 + (t1 - t0), true); }
  if (mode === 'l') setTimes(cur, Math.min(snap(t0 + d, c.obj), t1 - .05), t1, false);
  if (mode === 'r') setTimes(cur, t0, Math.max(snap(t1 + d, c.obj), t0 + .05), false);
  build(); sel = compOf(c.obj); tdrag.c = sel; renderTimeline(); needInit = true; draw();
});
window.addEventListener('mouseup', () => {
  if (tdrag?.clip && tdrag.moved) {
    $('#dropmark')?.remove();
    if (tdrag.mode === 'move') {
      const { i, target: j } = tdrag;
      if (j != null && j !== i && j !== i + 1) { const c = TL.clips[i]; moveClip(i, j); changed(true); select(compOf(c)); toast('Đã đổi thứ tự clip'); }
      else { undoStack.pop(); renderTimeline(); }
    } else changed(true);
  } else if (tdrag?.moved) changed(true);
  tdrag = null;
});
$('#tlinner').addEventListener('dblclick', e => { const b = e.target.closest('.blk,.clip'); if (b) { const c = b.dataset.ci != null ? compOf(TL.clips[+b.dataset.ci]) : compByCid(b.dataset.cid); if (c) setTime(c.t0); } });
$('#tlinner').addEventListener('click', e => {
  const tb = e.target.closest('.tb'); if (!tb) return;
  const i = +tb.dataset.tbi; select(compOf(TL.clips[i])); ITAB.clip = 'trans'; renderInspector();
});
// Transitions dragged from the library onto a clip boundary.
function nearestBoundary(clientX) {
  const x = (clientX - $('#tlinner').getBoundingClientRect().left) / PPS, L = clipLayout();
  let best = null; for (const k of L.slice(1)) if (!best || Math.abs(k.t0 - x) < Math.abs(best.t0 - x)) best = k;
  return best;
}
$('#tlinner').addEventListener('dragover', e => {
  if (![...e.dataTransfer.types].includes('text/x-trans')) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  const k = nearestBoundary(e.clientX);
  for (const b of document.querySelectorAll('.tb')) b.classList.toggle('hot', !!k && +b.dataset.tbi === k.i);
});
$('#tlinner').addEventListener('drop', e => {
  const ty = e.dataTransfer.getData('text/x-trans'); if (ty == null || ![...e.dataTransfer.types].includes('text/x-trans')) return;
  e.preventDefault(); e.stopPropagation();
  const k = nearestBoundary(e.clientX); if (!k) return toast('Cần ít nhất 2 clip để có chuyển cảnh');
  setTransition(k.i, ty, transDur); select(compOf(TL.clips[k.i])); toast('Đã thêm chuyển cảnh');
});
// resizable timeline height
(() => {
  let rs = null;
  $('#tlwrap').addEventListener('mousedown', e => { const r = $('#tlwrap').getBoundingClientRect(); if (e.clientY - r.top < 6) { rs = { y: e.clientY, h: r.height }; e.preventDefault(); } });
  window.addEventListener('mousemove', e => { if (!rs) return; const h = clamp(rs.h - (e.clientY - rs.y), 180, innerHeight - 320); document.documentElement.style.setProperty('--tlh', h + 'px'); fit(); });
  window.addEventListener('mouseup', () => (rs = null));
})();

// ---------- playback ----------
const voice = $('#voice');
// A timer, not rAF: rAF stalls when the window is hidden, and draw() is already throttled by `busy`.
const nextFrame = f => setTimeout(f, 16);
const sfxUrl = name => { const f = LIB.sfx.find(x => x.replace(/\.\w+$/, '') === name); return f ? '/assets/sfx/' + f : ''; };
const dbVol = g => clamp(Math.pow(10, (g ?? -12) / 20) * 2.2, 0, 1);
let musicEls = [], lastT = 0, clock0 = 0, curClip = -1;
const clipAud = new Map();
// Preview from the AAC copy the server extracts (browsers play iPhone .mov audio silently); export keeps the original.
const previewSrc = src => (typeof MEDIA !== 'undefined' && MEDIA.find(m => m.path === src)?.preview_audio) || src;
const audFor = src => { const p = previewSrc(src); if (!clipAud.has(p)) clipAud.set(p, Object.assign(new Audio('/project/' + p), { preload: 'auto' })); return clipAud.get(p); };
// Main-track audio follows the clips: right source time, speed (pitch kept), volume, mute.
function syncClipAudio(force) {
  let want = null;
  const k = playing && TL.clips?.length ? clipAtT(T) : null;
  if (k && k.c.audio && !k.c.mute && T < k.t1 - .02) {
    want = audFor(k.c.audio);
    const st = srcAt(k, T);
    want.playbackRate = k.c.speed || 1; want.volume = clamp(k.c.volume ?? 1, 0, 1);
    if (want.paused || force || curClip !== k.i || Math.abs(want.currentTime - st) > .25) { want.currentTime = st; want.play().catch(() => {}); }
  }
  curClip = k ? k.i : -1;
  for (const a of clipAud.values()) if (a !== want && !a.paused) a.pause();
}
const useClipAudio = () => !!TL.clips?.length;
function setTime(t) {
  T = clamp(t, 0, TL.duration);
  if (playing) { if (!useClipAudio() && META.audio) voice.currentTime = T; clock0 = performance.now() / 1000 - T; for (const m of musicEls) m.el.pause(); syncClipAudio(true); }
  $('#time').textContent = fmt(T); placeHead(); draw();
  renderList();
  autoScroll();
}
function autoScroll() {
  const sc = $('#tlscroll'), x = T * PPS;
  if (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 60) sc.scrollLeft = Math.max(0, x - sc.clientWidth * .3);
}
function setPlayIcon() { $('#play').innerHTML = `<i class="ti ${playing ? 'ti-player-pause-filled' : 'ti-player-play-filled'}"></i>`; }
function play() {
  if (playing) return stop();
  if (T >= TL.duration - .05) T = 0;
  playing = true; setPlayIcon(); lastT = T; clock0 = performance.now() / 1000 - T;
  if (useClipAudio()) syncClipAudio(true);
  else if (META.audio) { voice.currentTime = T; voice.play().catch(() => {}); }
  musicEls = TRK.audio.hide ? [] : (TL.audio?.music || []).filter(m => !m.hidden).map(m => ({ m, el: Object.assign(new Audio(m.file ? '/project/' + m.file : `/assets/music/${m.mood}.mp3`), { loop: true, volume: dbVol((m.gain ?? -16) + 4) }) }));
  nextFrame(tick);
}
function stop() {
  playing = false; setPlayIcon(); voice.pause(); syncClipAudio();
  for (const m of musicEls) m.el.pause(); musicEls = [];
  for (const f of Studio._play) f('stop', T);
  renderList();
}
let lastList = 0;
function tick() {
  if (!playing) return;
  const now = !useClipAudio() && META.audio && !voice.paused ? voice.currentTime : performance.now() / 1000 - clock0;
  T = Math.min(now, TL.duration);
  if (useClipAudio()) syncClipAudio();
  if (!TRK.audio.hide) for (const x of TL.audio?.sfx || []) if (x.t > lastT && x.t <= T && !x.hidden) { const a = new Audio(sfxUrl(x.name)); a.volume = dbVol(x.gain); a.play().catch(() => {}); }
  for (const { m, el } of musicEls) {
    const inside = T >= m.t0 && T < m.t1;
    if (inside && el.paused) { el.currentTime = (T - m.t0 + (m.offset || 0)) % (el.duration || 1e9); el.play().catch(() => {}); }
    if (!inside && !el.paused) el.pause();
  }
  for (const f of Studio._play) f('tick', T);
  lastT = T;
  $('#time').textContent = fmt(T); placeHead(); autoScroll(); draw();
  if (panel === 'comp' && performance.now() - lastList > 400) { lastList = performance.now(); renderList(); }
  if (T >= TL.duration) return stop();
  nextFrame(tick);
}
$('#play').addEventListener('click', play);
$('#stepb').addEventListener('click', () => setTime(T - 1 / FPS));
$('#stepf').addEventListener('click', () => setTime(T + 1 / FPS));
const toggleOv = (id, btn) => { $(id).checked = !$(id).checked; $(btn).classList.toggle('on', $(id).checked); drawOverlay(); };
$('#safebtn').addEventListener('click', () => toggleOv('#safe', '#safebtn'));
$('#facebtn').addEventListener('click', () => toggleOv('#face', '#facebtn'));
$('#safe').addEventListener('change', drawOverlay);
$('#face').addEventListener('change', drawOverlay);
function toggleExpand() {
  document.body.classList.toggle('expanded');
  $('#expand').innerHTML = `<i class="ti ${document.body.classList.contains('expanded') ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}"></i>`;
  $('#expand').title = document.body.classList.contains('expanded') ? 'Thu nhỏ preview' : 'Phóng to preview';
  setTimeout(fit, 0);
}
$('#expand').addEventListener('click', toggleExpand);
$('#fitall').addEventListener('click', () => { fit(); zoomFit(); });

// ---------- keyboard ----------
window.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && document.activeElement.type !== 'checkbox' && document.activeElement.type !== 'range';
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return saveNow(); }
  if (typing) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); return duplicateSel(); }
  if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); return splitAtPlayhead(); }
  if (!mod && (e.key === '=' || e.key === '+')) return setZoom(PPS * 1.25);
  if (!mod && e.key === '-') return setZoom(PPS / 1.25);
  if (!mod && e.shiftKey && e.key.toLowerCase() === 'z') { fit(); return zoomFit(); }
  if (e.key === ' ') { e.preventDefault(); return play(); }
  if (e.key === 'Escape') { if (document.body.classList.contains('expanded')) return toggleExpand(); return select(null); }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return removeSel(); }
  if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    if (e.altKey && sel && getPos(sel)) {
      const p = getPos(sel), n = e.shiftKey ? 10 : 1; touch(sel.obj, 'nudge');
      if (e.key === 'ArrowLeft') p.x -= n; if (e.key === 'ArrowRight') p.x += n; if (e.key === 'ArrowUp') p.y -= n; if (e.key === 'ArrowDown') p.y += n;
      setPos(sel, p); changed(); syncPosInputs(); return;
    }
    if (e.key === 'ArrowLeft') setTime(T - (e.shiftKey ? 1 : 1 / FPS));
    if (e.key === 'ArrowRight') setTime(T + (e.shiftKey ? 1 : 1 / FPS));
  }
});

// ---------- save / history / export / new ----------
async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body, strip) });
  return r.json();
}
async function saveNow() {
  const r = await api('/api/save', { timeline: TL, captions: CAP });
  if (r.ok) { dirty = false; $('#status').textContent = 'Đã lưu'; $('#status').classList.remove('dirty'); toast(r.notes ? `Đã lưu · ${r.notes} ghi chú cho Claude` : 'Đã lưu'); loadHistory(); }
  else toast('Lỗi lưu: ' + (r.error || ''));
}
$('#save').addEventListener('click', saveNow);
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
async function loadHistory() {
  let list = []; try { list = await api('/api/history'); } catch {}
  if (!Array.isArray(list)) list = [];
  $('#history').innerHTML = '<option value="">Lịch sử</option>' + list.map(id => `<option value="${id}">${id.slice(0, 10)} ${id.slice(11).replace(/-/g, ':')}</option>`).join('');
}
$('#history').addEventListener('change', async e => {
  const id = e.target.value; e.target.value = ''; if (!id) return;
  if (!confirm('Mở lại phiên bản ' + id + '? (vẫn hoàn tác được)')) return;
  const s = await api('/api/history/' + id); pushUndo();
  TL = s.timeline; CAP = s.captions || []; migrateClips(); sel = null; changed(true);
});
function modal(html) { $('#modalbox').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && !pollTimer) closeModal(); });
let pollTimer = null;
function pollJob(onDone) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const j = await api('/api/job'); if (!j) return;
    const bar = $('#modal .bar i'); if (bar) bar.style.width = Math.round(j.progress * 100) + '%';
    const st = $('#jobstep'); if (st) st.textContent = j.step + (j.state === 'running' ? ` · ${Math.round(j.progress * 100)}%` : '');
    const lg = $('#joblog'); if (lg) lg.textContent = j.log.split(/[\r\n]+/).slice(-8).join('\n');
    if (j.state !== 'running') { clearInterval(pollTimer); pollTimer = null; onDone(j); }
  }, 700);
}
$('#export').addEventListener('click', () => {
  const v = DH > DW, q = (a, b) => (v ? `${a}×${b}` : `${b}×${a}`);
  modal(`<h3><i class="ti ti-upload"></i> Xuất video</h3>
    <label class="lbl">Chất lượng</label><div class="qual">
      <label><input type="radio" name="xq" value="1080" checked><b>1080p</b><small>${q(1080, 1920)} · Full HD</small></label>
      <label><input type="radio" name="xq" value="720"><b>720p</b><small>${q(720, 1280)} · nhanh</small></label>
      <label><input type="radio" name="xq" value="4k"><b>4K</b><small>${q(2160, 3840)}</small></label></div>
    <div class="row2"><div><label class="lbl">Từ (giây)</label><input id="xfrom" type="number" placeholder="0"></div><div><label class="lbl">Đến (giây)</label><input id="xto" type="number" placeholder="${TL.duration}"></div></div>
    <label class="lbl">Xuất thêm khổ khác (cùng lúc)</label><div class="xasp">${(v ? [['1:1', 'Vuông 1:1', 'cắt bám mặt'], ['16:9', 'Ngang 16:9', 'video giữa, nền mờ']] : [['9:16', 'Dọc 9:16', 'cắt bám mặt'], ['1:1', 'Vuông 1:1', 'cắt bám mặt']]).map(([k, l, d]) => `<label><input type="checkbox" name="xasp" value="${k}"> <b>${l}</b> <small>${d}</small></label>`).join('')}</div>
    <div class="acts" style="margin-top:12px"><button id="xcover"><i class="ti ti-photo"></i> Ảnh bìa (khung ${fmt(T)})</button><button id="xsrt"><i class="ti ti-file-text"></i> Phụ đề .srt</button></div>
    <p class="muted">Âm thanh được trộn lại (giọng + nhạc + SFX, chuẩn −14 LUFS) rồi render từng khung bằng đúng engine của preview.</p>
    <div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="xgo"><i class="ti ti-upload"></i> Xuất</button></div>`);
  $('#xcover').onclick = async () => { if (dirty) await saveNow(); toast('Đang render ảnh bìa…'); const r = await api('/api/still?t=' + T); if (r.out) { window.open('/project/' + r.out); api('/api/reveal', { path: r.out }); } else toast('Lỗi: ' + r.error); };
  $('#xsrt').onclick = async () => { if (dirty) await saveNow(); const r = await api('/api/srt'); toast('Đã lưu ' + r.out); api('/api/reveal', { path: r.out }); };
  $('#xgo').onclick = async () => {
    if (dirty) await saveNow();
    const from = $('#xfrom').value, to = $('#xto').value;
    const r = await api('/api/export', { quality: document.querySelector('[name=xq]:checked').value, from: from === '' ? undefined : +from, to: to === '' ? undefined : +to, aspects: [...document.querySelectorAll('[name=xasp]:checked')].map(i => i.value) });
    if (!r.ok) return toast(r.error || 'Đang có tác vụ khác chạy');
    modal(`<h3>Đang xuất video…</h3><div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><pre id="joblog"></pre><div class="actions"><button id="xcancel">Dừng</button></div>`);
    $('#xcancel').onclick = () => api('/api/job/cancel', {});
    pollJob(j => {
      if (j.state === 'done') modal(`<h3><i class="ti ti-circle-check" style="color:var(--ok)"></i> Xuất xong</h3><p class="path">${esc(j.out)}</p>${(j.outs || []).length > 1 ? `<div class="xouts">${j.outs.map(o => `<div><b>${esc(o.aspect)}</b> <a href="/project/${esc(o.out)}" target="_blank">${esc(o.out.split('/').pop())}</a><small>${esc(o.note || '')}</small></div>`).join('')}</div>` : ''}<div class="actions"><button onclick="api('/api/reveal',{path:'${esc(j.out)}'})"><i class="ti ti-folder"></i> Hiện trong Finder</button><a href="/project/${esc(j.out)}" target="_blank"><button class="primary"><i class="ti ti-player-play"></i> Mở video</button></a><button onclick="closeModal()">Đóng</button></div>`);
      else modal(`<h3>Lỗi khi xuất</h3><p>${esc(j.step)}</p><pre>${esc(j.log.slice(-1500))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
    });
  };
});
$('#newproj').addEventListener('click', () => {
  modal(`<h3><i class="ti ti-video-plus"></i> Tạo dự án từ video thô</h3><label class="lbl">Video</label><div class="row" style="gap:6px"><button id="npick" class="primary" style="flex:none"><i class="ti ti-folder-open"></i> Chọn video từ máy…</button><input type="file" id="nfile" accept="video/*,.mov,.mkv,.m4v" hidden>
    <input id="npath" placeholder="${/Win/.test(navigator.platform) ? 'hoặc dán đường dẫn: C:\\Users\\ban\\Videos\\clip.mp4' : 'hoặc dán đường dẫn: /Users/ban/Movies/clip.mp4'}"></div>
    <label class="lbl">Thư mục dự án (để trống = cạnh video)</label><input id="ndir" placeholder="">
    <label class="lbl">Gói style</label><div class="packs">${packs().filter(p => p.recipe).map((p, i) => `<label><input type="radio" name="npack" value="${p.id}" ${i === 0 ? 'checked' : ''}><b>${p.icon} ${esc(p.name)}</b><span class="muted">${esc(p.desc || '')}</span></label>`).join('')}</div>
    <label class="lbl">Tiêu đề / chủ đề (dùng cho intro)</label><input id="ntitle" placeholder="VD: 3 mẹo dùng ChatGPT">
    <div class="row2"><div><label class="lbl">Khổ hình</label><select id="norient"><option value="vertical">Dọc 9:16 (Reels, TikTok, Shorts)</option><option value="horizontal">Ngang 16:9 (YouTube)</option></select></div>
    <div><label class="lbl">Độ chính xác nhận giọng</label><select id="nmodel"><option value="large-v3-turbo">large-v3-turbo (chính xác, khuyên dùng)</option><option value="small">small (nhanh, sai nhiều hơn)</option><option value="large-v3">large-v3 (chậm nhất)</option></select></div></div>
    <p class="muted">Tự làm: nhận giọng → cắt khoảng lặng → cắt khung → phụ đề → bản dựng theo gói (intro, graphic theo từ khoá, CTA, nhạc). Sau đó bạn (hoặc Claude) chỉnh tiếp.</p>
    <div class="actions"><button onclick="closeModal()">Huỷ</button><button class="primary" id="ngo">Tạo</button></div>`);
  $('#npick').onclick = () => $('#nfile').click();
  $('#nfile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const b = $('#npick'); b.disabled = true; b.innerHTML = `<i class="ti ti-loader-2 spin"></i> Đang chép ${esc(f.name)}…`;
    try { const r = await (await fetch('/api/pick/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f })).json(); $('#npath').value = r.path; if (!$('#ntitle').value) $('#ntitle').value = f.name.replace(/\.\w+$/, ''); }
    catch (err) { toast('Không chép được video: ' + err.message); }
    b.disabled = false; b.innerHTML = `<i class="ti ti-circle-check"></i> ${esc(f.name)}`;
  };
  $('#ngo').onclick = async () => {
    if (!$('#npath').value.trim()) return toast('Chọn video trước');
    const r = await api('/api/new', { video: $('#npath').value.trim(), dir: $('#ndir').value.trim() || undefined, model: $('#nmodel').value,
      pack: document.querySelector('[name=npack]:checked')?.value || 'slate', title: $('#ntitle').value.trim(), orient: $('#norient').value });
    if (!r.ok) return toast(r.error || 'Đang có tác vụ khác chạy');
    modal(`<h3>Đang tạo dự án…</h3><div id="jobstep" class="muted"></div><div class="bar"><i></i></div><pre id="joblog"></pre>`);
    pollJob(j => { if (j.state === 'done') location.reload(); else modal(`<h3>Lỗi</h3><p>${esc(j.step)}</p><pre>${esc(j.log.slice(-1500))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`); });
  };
});
function toast(m) {
  for (const o of document.querySelectorAll('.toast')) o.remove();
  const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `<i class="ti ti-info-circle"></i>${esc(m)}`; document.body.appendChild(d); setTimeout(() => d.remove(), 2400);
}
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('resize', fit);

// ---------- boot ----------

// ---------- feature API (studio/features/*.js) ----------
// Features are plain scripts loaded after boot; they read/mutate TL/CAP through this object and call changed() after edits.
const Studio = window.Studio = {
  get TL() { return TL; }, set TL(v) { TL = v; }, get CAP() { return CAP; }, set CAP(v) { CAP = v; }, get META() { return META; },
  get T() { return T; }, get win() { return win; }, get sel() { return sel; }, get DW() { return DW; }, get DH() { return DH; },
  $, esc, fmt, api, toast, modal, closeModal, pollJob, setTime, saveNow, pushUndo, changed, renderTimeline, renderInspector, renderPanel, build, draw,
  select, sect, typeName, compOf: obj => compOf(obj),
  _insp: [], _ready: [], _blk: [], // _blk: fn(comp, PPS) -> extra HTML inside a timeline block (keyframe diamonds…)
  _build: [], _play: [], // build(comps) hooks add timeline components; play('tick'|'stop', T) hooks follow playback
  // left rail panel: Studio.addPanel('ai', 'ti-robot', 'AI', () => { $('#libbody').innerHTML = … })
  addPanel(id, icon, name, fn) { RAIL.push([id, icon, name]); PANEL_TITLE[id] = name; SEARCH_PH[id] = ''; EXTRA_PANELS[id] = fn; renderRail(); },
  // top bar button inserted before "Xuất"
  addTopButton(html, onClick) { const b = document.createElement('span'); b.innerHTML = html; const el = b.firstElementChild; $('#export').before(el); el.addEventListener('click', onClick); return el; },
  // inspector tab(s) for the selected component: fn(c) -> [key, label, html] | [[…], …] | null
  addInspectorTab(fn) { Studio._insp.push(fn); },
  onReady(fn) { if (Studio._isReady) fn(); else Studio._ready.push(fn); },
  // reload project from disk (after a server-side job rewrote timeline.json)
  async reload() { const p = await api('/api/project'); TL = p.timeline; CAP = p.captions; META = p.meta; TL.scenes = TL.scenes || []; migrateClips(); needInit = true; build(); renderTimeline(); renderInspector(); renderPanel(); draw(); $('#durtc').textContent = '/ ' + fmt(TL.duration); if (META.audio) voice.src = '/project/' + META.audio + '?' + Date.now(); WAVE = await api('/api/waveform'); renderTimeline(); },
};
// All feature scripts download in parallel; async=false keeps them executing in file order.
async function loadFeatures() {
  await Promise.all((await api('/api/features')).map(f => new Promise(ok => { const s = document.createElement('script'); s.async = false; s.src = '/studio/features/' + f; s.onload = s.onerror = ok; document.body.appendChild(s); })));
}
async function boot() {
  renderRail();
  const proj = fetch('/api/project'), lib = api('/api/library').catch(() => ({ sfx: [], music: [] }));
  await loadFeatures().catch(e => console.error(e));
  const r = await proj;
  if (!r.ok) { modal(`<h3>Chưa mở dự án</h3><p>Chạy <code>node studio/server.mjs &lt;thư mục dự án&gt;</code> hoặc bấm “Video mới”.</p><div class="actions"><button onclick="closeModal()">Đóng</button></div>`); return; }
  const p = await r.json();
  TL = p.timeline; CAP = p.captions; META = p.meta;
  TL.scenes = TL.scenes || [];
  if ((TL.width || 1080) > (TL.height || 1920)) { DW = 1280; DH = 720; SAFE = { x: 60, y: 40, w: 1160, h: 620 }; document.body.classList.add('landscape'); }
  migrateClips();
  $('#ver').textContent = META.version; $('#ptag').textContent = META.name;
  for (const a of ['#aspect', '#aspect2']) $(a).textContent = DW > DH ? '16:9' : '9:16';
  $('#durtc').textContent = '/ ' + fmt(TL.duration);
  if (META.audio) voice.src = '/project/' + META.audio;
  // The waveform can take ffmpeg a few seconds on a new project: draw the editor first, add the wave when it arrives.
  LIB = await lib;
  api('/api/waveform').then(w => { WAVE = Array.isArray(w) ? w : []; renderTimeline(); }).catch(() => {});
  build(); fit(); renderPanel(); renderTimeline(); renderInspector(); loadHistory();
  requestAnimationFrame(() => zoomFit());
  loadThumbs();
  const f = $('#frame');
  const ready = () => {
    win = f.contentWindow; needInit = true; FLU = null; build(); renderPanel(); renderTimeline(); renderInspector(); draw();
    MEDIA_LOAD();
    if (!Studio._isReady) { Studio._isReady = true; Studio._ready.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }
    if (TL._starter) { const st = TL._starter; delete TL._starter; if (st.title) TL.title = st.title; pushUndo(); applyRecipe(st.pack, st.title, true); saveNow(); }
  };
  if (f.contentWindow?.renderFrame) ready(); else f.addEventListener('load', ready);
}
boot();
