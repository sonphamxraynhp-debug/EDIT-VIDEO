// Core pack: helpers shared by every pack + Studio menu entries for the built-in styles
// (slate grid, tutorial bubble, AI Hype Cam). Module code lives in slate.js / vertical.js / modules.js / broll.js.
const VERT = () => (TL?.height || 720) > (TL?.width || 1280);
const DIMS = () => (VERT() ? [720, 1280] : [1280, 720]);
// Words of all captions with absolute times — recipes use it to place graphics on keywords.
function capWords(captions) { return (captions || []).flatMap(c => c.words.map(w => ({ ...w, low: w.w.toLowerCase() }))); }
// First time any of the needles is spoken: exact (with diacritics) match first, accent-insensitive fallback.
// Multi-word tokens ("gây shock") are split, so needles match inside them too.
function findWord(captions, needles, after = 0) {
  const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const clean = s => s.toLowerCase().replace(/[.,!?;:"“”]/g, '');
  const ws = capWords(captions).flatMap(w => w.w.split(/\s+/).map(p => ({ s: w.s, w: clean(p) }))).filter(w => w.w);
  for (const norm of [x => x, fold]) {
    for (let i = 0; i < ws.length; i++) {
      if (ws[i].s < after) continue;
      for (const n of needles) {
        const parts = clean(n).split(/\s+/).map(norm);
        if (parts.every((p, k) => ws[i + k] && norm(ws[i + k].w) === p)) return ws[i].s;
      }
    }
  }
  return null;
}

// Deep-copy a template whose times start at 0, shifted to start at T.
const shiftT = (o, T) => JSON.parse(JSON.stringify(o), (k, v) => (['t', 't0', 't1'].includes(k) && typeof v === 'number' ? Math.round((v + T) * 1000) / 1000 : v));

(() => {
  const L = (text, t, o = {}) => ({ text, t, style: 'yellow', size: 60, y: 640, anim: 'pop', ...o });
  PACKS.push({
    id: 'slate', name: 'Slate grid (Claude edit)', icon: '🟦', desc: 'Thẻ video trên nền lưới, phụ đề ô vàng, LED, neon, sơ đồ', caption: 'slate',
    items: [
      { type: 'frame_grid', label: 'Khung video lưới', make: T => ({ type: 'frame_grid', t0: T, t1: T + 3, enter: 'blur' }) },
      { type: 'led_text', label: 'Chữ LED', make: T => ({ type: 'led_text', t0: T, t1: T + 2.5, text: 'TIN SHOCK', y: 400, size: 74 }) },
      { type: 'neon_text', label: 'Chữ neon', make: T => ({ type: 'neon_text', t0: T, t1: T + 1.5, text: 'đáng sợ', y: 400, size: 80 }) },
      { type: 'logo_row', label: 'Hàng logo', make: T => ({ type: 'logo_row', t0: T, t1: T + 2.5, icons: ['si:openai', 'si:claude', 'si:googlegemini'], y: 310 }) },
      { type: 'media_card', label: 'Thẻ media', make: T => ({ type: 'media_card', t0: T, t1: T + 3, screen: { broll: { id: 'cong-nghe-moi--neural--ember' } }, lines: [L('tiêu đề nhỏ', T, { style: 'clean', italic: false, weight: 700, font: 'var(--sans)', size: 24, y: 292 }), L('TIÊU ĐỀ', T + .3, { style: 'grad_blue', italic: false, size: 66, y: 336 })] }) },
      { type: 'diagram', label: 'Sơ đồ', make: T => ({ type: 'diagram', t0: T, t1: T + 4, nodes: [{ id: 'a', kind: 'chip', text: 'OpenAI', icon: 'si:openai', x: 270, y: 640, t: T + .2 }, { id: 'b', kind: 'chip', text: 'Anthropic', icon: 'si:anthropic', x: 450, y: 640, t: T + .5 }, { id: 'p', kind: 'pill', text: 'ý chính', x: 360, y: 500, t: T + .9, ring: true }], edges: [{ from: 'a', to: 'p', t: T + .9 }, { from: 'b', to: 'p', t: T + 1 }] }) },
      { type: 'title_card', label: 'Thẻ kết', make: T => ({ type: 'title_card', t0: T, t1: T + 2.5, question: 'Bạn thấy sao?' }) },
    ],
    recipe: ctx => ({
      caption_style: 'slate', music: 'tech',
      scenes: [{ type: 'frame_grid', t0: 0, t1: ctx.dur - 2.5, badge: { icon: ctx.brand.logo || 'si:claude' } }, { type: 'title_card', t0: ctx.dur - 2.5, t1: ctx.dur, question: 'Bạn thấy sao?' }],
    }),
  });
  PACKS.push({
    id: 'bubble', name: 'Bubble hướng dẫn (3 mã lệnh)', icon: '🟡', desc: 'Nền lưới đỏ-cam, mặt trong bubble, thẻ màn hình chat, spotlight', caption: '',
    items: [
      { type: 'hook_card', label: 'Thẻ mở đầu', make: T => ({ type: 'hook_card', t0: T, t1: T + 1.8, screen: { broll: { id: 'cong-nghe-moi--neural--ember' } }, lines: [L('3 MẸO HAY', T, { style: 'white', size: 46, y: 548, anim: 'slide_l' }), L('AI LÀM HỘ BẠN', T + .5, { size: 46, y: 602, anim: 'fly', from_y: 712 })] }) },
      { type: 'spotlight', label: 'Spotlight', make: T => ({ type: 'spotlight', t0: T, t1: T + 2, lines: [L('QUÁ ĐỈNH', T + .1, { size: 84, y: 685, anim: 'tumble' }), L('ĐIỀU NÀY', T + .45, { style: 'white', size: 50, y: 610, anim: 'slide_r' })], sticker: { src: '🔥', t: T + .6, from: 'left', y: 960 } }) },
      { type: 'bubble_screen', label: 'Bubble + màn hình', make: T => ({ type: 'bubble_screen', t0: T, t1: T + 5, enter: 'drop', screen: { chat: { input: { text: 'Viết cho tôi…', t0: T + .5, t1: T + 2 }, messages: [{ role: 'user', t: T + 2.1, text: 'Viết cho tôi…' }, { role: 'ai', t: T + 2.5, text: '**Đây là kết quả:**\n- ý 1\n- ý 2', cps: 40 }] } } }) },
      { type: 'icon_tap', label: 'Logo + tay bấm', make: T => ({ type: 'icon_tap', t0: T, t1: T + 1.8, icon: 'si:openai', y: 985 }) },
      { type: 'sticker', label: 'Sticker', make: T => ({ type: 'sticker', t0: T, t1: T + 2, src: '🚀', from: 'pop', size: 220, y: 900 }) },
      { type: 'follow_cta', label: 'Nút Follow + từ khoá', make: T => ({ type: 'follow_cta', t0: T, t1: T + 3, keyword: { text: 'GPT', t: T + 1.2 } }) },
      { type: 'text', label: 'Chữ tự do', make: T => ({ type: 'text', t0: T, t1: T + 2, lines: [L('CHỮ', T)] }) },
    ],
    recipe: ctx => ({
      caption_style: '', music: 'happy',
      scenes: [{ type: 'spotlight', t0: 0, t1: 2.2, lines: [L(ctx.title || 'MẸO HAY', .1, { size: 80, y: 685, anim: 'tumble' })], sticker: { src: '🔥', t: .6, from: 'left', y: 960 } },
        { type: 'follow_cta', t0: ctx.dur - 3, t1: ctx.dur, keyword: { text: 'FOLLOW', t: ctx.dur - 1.8 } }],
    }),
  });
  PACKS.push({
    id: 'hypecam', name: 'AI Hype Cam (ngang 16:9)', icon: '🔴', desc: 'Nền tech đỏ, HUD khoá mặt, chữ hero cam, checklist, mosaic', caption: '',
    horizontal: true,
    items: [
      { type: 'slam_bg', label: 'Nền slam', make: T => shiftT({"t0": 0.0, "t1": 2.6, "type": "slam_bg", "tiles": ["broll/01.jpg", "broll/02.jpg", "broll/03.jpg", "broll/04.jpg", "broll/05.jpg", "broll/06.jpg"], "cx": 700, "cy": 280}, T) },
      { type: 'hud', label: 'HUD khoá mặt', make: T => shiftT({"t0": 0.0, "t1": 2.6, "type": "hud", "face_out": 1.0}, T) },
      { type: 'kinetic', label: 'Chữ kinetic', make: T => shiftT({"t0": 0.0, "t1": 2.6, "type": "kinetic", "y": 430, "label": "Video này được edit", "label_words": [{"w": "Video", "t": 0.0}, {"w": "này", "t": 0.38}, {"w": "được", "t": 0.6}, {"w": "edit", "t": 0.78}], "hero": "BỞI AI", "hero_t": 1.8, "hero_size": 84}, T) },
      { type: 'counter', label: 'Bộ đếm số', make: T => shiftT({"t0": 0.0, "t1": 1.64, "type": "counter", "from": 1, "to": 100, "t_a": 0.96, "t_b": 1.38, "x": 34, "y": 22, "size": 200}, T) },
      { type: 'stickers', label: 'Sticker', make: T => shiftT({"t0": 0.0, "t1": 1.6, "type": "stickers", "items": [{"e": "💯", "x": 1070, "y": 40, "size": 90, "t": 0.5}, {"e": "🤖", "x": 965, "y": 430, "size": 95, "t": 0.6}, {"e": "🎞️", "x": 1120, "y": 300, "size": 100, "t": 0.7}, {"e": "🎬", "x": 1205, "y": 250, "size": 80, "t": 0.75}]}, T) },
      { type: 'waveform_strip', label: 'Dải sóng âm', make: T => shiftT({"t0": 0.0, "t1": 1.3, "type": "waveform_strip"}, T) },
      { type: 'flash_ring', label: 'Vòng flash', make: T => shiftT({"t0": 0.0, "t1": 0.35, "type": "flash_ring", "cx": 700, "cy": 270}, T) },
      { type: 'mega', label: 'Chữ siêu to', make: T => shiftT({"t0": 0.0, "t1": 1.1, "type": "mega", "text": "HOÀI NGH<em>I?</em>", "align": "center", "y": 42, "size": 128}, T) },
      { type: 'question_marks', label: 'Dấu hỏi bay', make: T => shiftT({"t0": 0.0, "t1": 1.05, "type": "question_marks"}, T) },
      { type: 'pill', label: 'Nhãn pill', make: T => shiftT({"t0": 0.0, "t1": 0.7, "type": "pill", "text": "Có đáng ổn hay không?", "x": 75, "y": 374}, T) },
      { type: 'ui_showcase', label: 'UI showcase', make: T => shiftT({"t0": 0.0, "t1": 4.3, "type": "ui_showcase", "image": "ui/claude_plan.png", "chip": "ĐANG DỰNG", "chip_t": 10.5, "label": "Claude đang edit", "label_t": 10.7, "hero": "100% VIDEO", "hero_t": 11.1, "sub": "này", "sub_t": 11.4, "pip": true, "pip_t": 11.6}, T) },
      { type: 'light_leak', label: 'Light leak', make: T => shiftT({"t0": 0.0, "t1": 0.45, "type": "light_leak", "side": "left"}, T) },
      { type: 'ring', label: 'Vòng sáng', make: T => shiftT({"t0": 0.0, "t1": 1.6, "type": "ring", "from": 6, "to": 100, "t_a": 24.4, "t_b": 25.3, "x": 75, "y": 330}, T) },
      { type: 'compare_bar', label: 'Thanh so sánh', make: T => shiftT({"t0": 0.0, "t1": 1.4, "type": "compare_bar", "top": "Trước đây · 3–4 tiếng", "bottom": "30–40 phút", "bottom_t": 26.1}, T) },
      { type: 'iris', label: 'Iris', make: T => shiftT({"t0": 0.0, "t1": 0.55, "type": "iris", "cx": 735, "cy": 290}, T) },
      { type: 'checklist_panel', label: 'Checklist', make: T => shiftT({"t0": 0.0, "t1": 8.9, "type": "checklist_panel", "label": "Ngày xưa phải chọn", "hero": "RẤT NHIỀU", "items": [{"text": "Nhạc", "t": 2.8, "win": {"type": "waves"}}, {"text": "Hiệu ứng", "t": 3.5, "win": {"type": "emoji"}}, {"text": "Cắt cảnh thừa", "t": 4.2, "win": {"type": "trim", "from": 125, "to": 71}}, {"text": "Phần nói lặp", "t": 5.4, "win": {"type": "strike", "lines": ["nhiều anh chị em có thể chưa biết", "thay vì trước đây chúng ta sẽ mất", "tuy nhiên là bây giờ tất cả mọi video", "hay là rất là nhiều những cái cảnh trám"], "result": "giữ lại lần nói ổn nhất"}}, {"text": "Sound effect", "t": 7.1, "win": {"type": "sfx"}}]}, T) },
      { type: 'prompt_box', label: 'Ô prompt', make: T => shiftT({"t0": 0.0, "t1": 3.6, "type": "prompt_box", "x": 22, "y": 286, "text": "Edit video này một cách xuất sắc nhất", "type_a": 39.6, "type_b": 41.0, "progress_a": 41.3, "progress_b": 42.4}, T) },
      { type: 'stamp', label: 'Con dấu', make: T => shiftT({"t0": 0.0, "t1": 0.8, "type": "stamp", "text": "TỰ ĐỘNG 100%", "x": 26, "y": 420, "rot": -8}, T) },
      { type: 'orbit', label: 'Chữ quay quanh đầu', make: T => shiftT({"t0": 0.0, "t1": 2.8, "type": "orbit", "cards": ["broll/01.jpg", "broll/02.jpg", "broll/03.jpg", "broll/04.jpg", "broll/05.jpg"], "outline": "HIỆU ỨNG", "fill": "BAY QUANH ĐẦU", "fill_t": 44.25}, T) },
      { type: 'mood', label: 'Đổi mood', make: T => shiftT({"t0": 0.0, "t1": 2.0, "type": "mood", "mode": "sad", "text": "buồn…", "text_t": 47.6, "x": 410, "y": 290}, T) },
      { type: 'mosaic', label: 'Mosaic b-roll', make: T => shiftT({"t0": 0.0, "t1": 2.1, "type": "mosaic", "step": 0.7, "columns": [["broll/01.jpg", "broll/04.jpg", "broll/07.jpg"], ["broll/02.jpg", "broll/05.jpg", "broll/08.jpg"], ["broll/03.jpg", "broll/06.jpg", "broll/09.jpg"]]}, T) },
      { type: 'mosaic_wall', label: 'Tường mosaic', make: T => shiftT({"t0": 0.0, "t1": 1.6, "type": "mosaic_wall", "tiles": ["broll/01.jpg", "broll/02.jpg", "broll/03.jpg", "broll/04.jpg", "broll/05.jpg", "broll/06.jpg", "broll/07.jpg", "broll/08.jpg", "broll/09.jpg"], "text": "SINH ĐỘNG", "text_t": 56.7}, T) },
      { type: 'step_cards', label: 'Thẻ các bước', make: T => shiftT({"t0": 0.0, "t1": 5.3, "type": "step_cards", "compact": false, "highlight_t": 62.4, "hero": "RÕ NHẤT", "cards": [{"title": "Hình ảnh\nminh hoạ", "images": ["broll/09.jpg", "broll/02.jpg"], "t": 0.7}, {"title": "Người xem\nnhìn nhận", "emoji": "👀", "t": 2.6}, {"title": "Giá trị\nvideo", "emoji": "⭐", "t": 3.8}]}, T) },
      { type: 'black', label: 'Màn đen', make: T => shiftT({"t0": 0.0, "t1": 0.6, "type": "black", "fade_in": 0.4}, T) },
      { type: 'end_card', label: 'End card', make: T => shiftT({"t0": 0.0, "t1": 5.2, "type": "end_card", "label": "Video này được edit", "text": "100% BỞI AI", "fade_out": 0.7}, T) },
    ],
  });
})();

// ---------- basic pack: the user's own photos / clips, plain text, emoji, b-roll ----------
(() => {
  Object.assign(MODULES, {
    // Photo or clip (media/… image, or {seq,fps,count,t0} frames from an uploaded video).
    // mode "full": covers the frame (Ken Burns); "card": rounded card at card:{x,y,w,h,r} with optional label.
    photo(s, t, lt) {
      const [W, H] = DIMS();
      const src = media(s.media || s.src, t);
      const kb = s.kb ?? .08, dir = s.kb_dir ?? 1, k = prog(lt, 0, Math.max(.5, s.t1 - s.t0));
      const sc = 1 + kb * (dir > 0 ? k : 1 - k);
      const img = src ? `<img src="${src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${s.fit || 'cover'};transform:scale(${sc.toFixed(4)});transform-origin:${s.ox ?? 50}% ${s.oy ?? 45}%">`
        : `<div class="full" style="background:linear-gradient(135deg,#2b2f3a,#555b6e);display:flex;align-items:center;justify-content:center;font-size:90px">🖼️</div>`;
      const o = fadeIO(t, s.t0, s.keep ? null : s.t1, s.fade ?? .25, .25);
      if ((s.mode || 'full') === 'full') return { back: `<div class="full"${cidOf(s)} style="overflow:hidden;opacity:${o.toFixed(3)}">${img}</div>`, cover: o >= .999, front: lines(s, t) };
      const c = { x: W * .1, y: H * .22, w: W * .8, h: W * .8 * .62, r: 22, ...(s.card || {}) };
      const pk = E.outBack(prog(lt, 0, .4), 1.4);
      const label = s.label ? `<div style="position:absolute;left:14px;bottom:14px;background:rgba(0,0,0,.6);color:#fff;font:700 22px var(--sans);padding:6px 14px;border-radius:10px">${esc(s.label)}</div>` : '';
      return { front: `<div class="abs"${cidOf(s)} style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;border-radius:${c.r}px;overflow:hidden;opacity:${o.toFixed(3)};
        transform:scale(${lerp(.85, 1, pk).toFixed(3)});box-shadow:0 18px 44px rgba(0,0,0,.45);border:${s.border ?? '3px solid #fff'}">${img}${label}</div>` + lines(s, t) };
    },
    // Emoji / icon burst at x,y.
    emoji_pop(s, t, lt) {
      const sz = s.size || 160, k = E.outBack(prog(lt, 0, .35), 2.2), o = fadeIO(t, s.t0, s.t1, .1, .2);
      return { front: `<div class="abs"${cidOf(s)} style="left:${(s.x ?? 360) - sz / 2}px;top:${(s.y ?? 640) - sz / 2}px;width:${sz}px;height:${sz}px;opacity:${o.toFixed(3)};transform:scale(${k.toFixed(3)}) ${bob(lt, 0, 5)}">${emoji(s.src || '🔥', 0, 0, sz, 'position:absolute')}</div>` };
    },
  });
  const L = (text, t, o = {}) => ({ text, t, style: 'white', size: 56, y: 640, anim: 'pop', ...o });
  PACKS.push({
    id: 'basic', name: 'Cơ bản (ảnh, chữ, emoji)', icon: '🧩', desc: 'Ảnh/clip của bạn, chữ tự do, emoji, b-roll trong thẻ', caption: '',
    items: [
      { type: 'photo', label: 'Ảnh / clip toàn màn', make: T => ({ type: 'photo', t0: T, t1: T + 3, mode: 'full', src: '' }) },
      { type: 'photo', label: 'Ảnh / clip dạng thẻ', make: T => ({ type: 'photo', t0: T, t1: T + 3, mode: 'card', src: '', label: 'Chú thích' }) },
      { type: 'text', label: 'Chữ tự do', make: T => ({ type: 'text', t0: T, t1: T + 2, lines: [L('CHỮ MỚI', T, { style: 'yellow' })] }) },
      { type: 'emoji_pop', label: 'Emoji bật lên', make: T => ({ type: 'emoji_pop', t0: T, t1: T + 1.6, src: '🔥', y: 900 }) },
      { type: 'media_card', label: 'B-roll động trong thẻ', make: T => ({ type: 'media_card', t0: T, t1: T + 3, screen: { broll: { id: 'cong-nghe-moi--neural--ember' } } }) },
    ],
  });
})();

// ---------- templates (templates/*.json, spec: references/templates.md) ----------
// Applies a template to a timeline in place: pack + caption style + brand (user's own values win) + music + fx,
// scenes from the pack recipe (opts = tpl.recipe_opts) plus the template's own scenes, re-timed to this video:
// a START at t < 3 s stays, t > base_dur − 4 s is anchored to the end, anything else is scaled by duration / base_dur.
// Only whole-video scenes (frames, tickers, progress bars: ≥ 40 % of base_dur, HyperFrames blocks excepted, or start-to-end) stretch with the video; every
// other scene keeps its own length (shrinks on shorter clips, grows ≤ 25 % on longer ones) so a 4 s card never becomes 30 s.
function applyTemplate(tl, tpl, captions, title) {
  const dur = tl.duration, base = tpl.base_dur || dur, d = dur - base, k = dur / base;
  const at = t => (t == null ? t : Math.round((t < 3 ? t : t > base - 4 ? t + d : t * k) * 100) / 100);
  const TK = /^(t|t0|t1|out|strike_at)$|_t$/, r2 = v => Math.round(v * 100) / 100;
  const remap = (o, f) => JSON.parse(JSON.stringify(o), (key, v) => (TK.test(key) && typeof v === 'number' ? Math.max(0, Math.min(dur, r2(f(v)))) : v));
  const whole = s => s.keep || (s.type !== 'hf' && s.t1 - s.t0 >= base * .4) || (s.t0 < 3 && s.t1 > base - 4);
  const retime = s => {
    if (s.t0 == null || s.t1 == null || whole(s)) return remap(s, at);
    const len = s.t1 - s.t0, nl = len * Math.min(k, 1.25);
    let n0 = at(s.t0); const n1 = Math.min(dur, n0 + nl);
    if (n1 - n0 < Math.min(nl, .8)) n0 = Math.max(0, n1 - nl);
    return remap(s, v => n0 + (v - s.t0) * (n1 - n0) / Math.max(.01, len));
  };
  tl.pack = tpl.pack || tl.pack;
  if (tpl.caption_style != null) tl.caption_style = tpl.caption_style || undefined;
  if (tpl.brand) tl.brand = { ...tpl.brand, ...(tl.brand || {}) };
  if (tpl.theme) Object.assign(tl, tpl.theme);
  const pack = PACKS.find(p => p.id === tl.pack);
  const keep = (tl.scenes || []).filter(s => !s._recipe && !s._tpl);
  const r = tpl.use_recipe !== false && pack?.recipe ? pack.recipe({ dur, captions: captions || [], brand: { ...BR(), ...(tl.brand || {}) }, vertical: (tl.height || 1920) > (tl.width || 1080), title: title || tpl.title, opts: tpl.recipe_opts || {} }) : {};
  if (r.caption_style != null && tpl.caption_style == null) tl.caption_style = r.caption_style || undefined;
  const own = (tpl.scenes || []).map(s => ({ ...retime(s), _tpl: true }));
  tl.scenes = [...keep, ...(r.scenes || []).map(s => ({ ...s, _recipe: true })), ...own];
  const fx = [...(r.fx || []), ...(tpl.fx || []).map(retime)];
  if (fx.length) tl.fx = [...(tl.fx || []).filter(f => !f._recipe), ...fx.map(f => ({ ...f, _recipe: true }))];
  const music = tpl.music || r.music;
  if (music) { tl.audio = tl.audio || {}; tl.audio.music = [{ t0: 0, t1: dur, mood: music, gain: tpl.music_gain ?? -20 }]; }
  return tl;
}
window.applyTemplate = applyTemplate;
