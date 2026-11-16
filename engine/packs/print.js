// Pack "print" — five print-design looks around a talking head, rewritten for this engine from the MIT recipes of
// ghost-editor (kurbaitaev): swiss-grid, halftone-dossier, tactile-paper, kinetic-doc, data-story (swiss-grid,
// halftone-dossier and data-story adapt LemoLab's lemo-opuscar styles, MIT). Spec: references/pack-print.md.
//   print_swiss_*   Swiss poster grid: one grid, Inter, one signal red, wipes + knife cuts, giant numerals.
//   print_dossier_* case file on cream paper: halftone dots, misregistered black serif, stamps, navy caption bar.
//   print_paper_*   tactile paper: maroon ground, sheets that unfurl / turn on twos, hand marks, pill captions.
//   print_kdoc_*    kinetic documentary: B&W pictures as prints / windows, grey turn pages, one warm red.
//   print_data_*    data story: a chart drawing itself on cream paper under a red-blue pencil, figure captions.
// Every module is a pure function of t; design space 720x1280 (9:16) or 1280x720 (16:9).
(() => {
  const P = 'print';
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const chars = v => Array.from(String(v ?? '').normalize('NFC'));
  const G = () => { const [W, H] = DIMS(), v = VERT(); return { W, H, v, u: v ? 1 : .74 }; };
  const px = n => `${Math.round(n)}px`;
  const f3 = n => (+n).toFixed(3);
  // cubic-bezier easing (Newton solve on x) — swiss "snap" curve is (.7,0,.2,1).
  const bez = (x1, y1, x2, y2) => k => {
    if (k <= 0) return 0; if (k >= 1) return 1;
    let u = k;
    for (let i = 0; i < 8; i++) {
      const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u - k;
      const dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
      if (Math.abs(dx) < 1e-6) break;
      u = clamp(u - x / dx);
    }
    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  };
  const SW = bez(.7, 0, .2, 1);
  const E16 = 4 / 30, E8 = 8 / 30;
  const back = (k, s = 1.9) => E.outBack(clamp(k), s);
  const step = (x, fps) => Math.floor(x * fps + 1e-6) / fps; // stop-motion clock (twos = 12, threes = 8)
  // film grain / paper noise as a data-URI SVG (cached per seed); used as background or mask.
  const NOISE = new Map();
  const noise = (seed = 1, freq = .85, alpha = .5) => {
    const k = `${seed}|${freq}|${alpha}`;
    if (!NOISE.has(k)) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha} 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
      NOISE.set(k, `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}')`);
    }
    return NOISE.get(k);
  };
  const grain = (o = .18, seed = 1, blend = 'multiply') => `<div class="full" style="background-image:${noise(seed)};background-size:256px 256px;opacity:${o};mix-blend-mode:${blend};pointer-events:none"></div>`;
  // Halftone screen: rotated dot grid whose dot radius follows a density field (radial | edge | linear | flat). Cached.
  const HT = new Map();
  function halftone(w, h, o = {}) {
    const key = JSON.stringify([w, h, o]);
    if (HT.has(key)) return HT.get(key);
    const st = o.step || 22, a = (o.ang ?? 15) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const cx = o.cx ?? .5, cy = o.cy ?? .45, mx = o.max ?? .5, field = o.field || 'radial';
    const dens = (x, y) => {
      if (field === 'edge') { const d = Math.min(x, 1 - x, y * h / w, (1 - y) * h / w); return clamp(1 - d / (o.reach ?? .22)); }
      if (field === 'linear') return clamp(o.flip ? 1 - y : y);
      if (field === 'flat') return o.level ?? .5;
      const d = Math.hypot((x - cx) * w / h, y - cy); return clamp(1 - d / (o.radius ?? .55));
    };
    const n = Math.ceil(Math.hypot(w, h) / st) + 2;
    let c = '';
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const X = w / 2 + (i * ca - j * sa) * st, Y = h / 2 + (i * sa + j * ca) * st;
      if (X < -st || Y < -st || X > w + st || Y > h + st) continue;
      const r = st * mx * Math.sqrt(dens(clamp(X / w), clamp(Y / h)) * (o.gain ?? 1));
      if (r > .7) c += `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="${r.toFixed(1)}"/>`;
    }
    const svg = `<svg class="abs" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="left:0;top:0;mix-blend-mode:${o.blend || 'multiply'};opacity:${o.op ?? 1}"><g fill="${o.color || '#2E55D6'}">${c}</g></svg>`;
    if (HT.size > 40) HT.delete(HT.keys().next().value);
    HT.set(key, svg);
    return svg;
  }
  // cover-image helper (greyscale prints): image path or a drawn placeholder
  const picture = (src, filter = 'grayscale(1) contrast(1.08)', style = '') => src
    ? `<img src="${url(src)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${filter};${style}">`
    : `<div class="full" style="background:repeating-linear-gradient(135deg,#8d8d8d 0 14px,#7d7d7d 14px 28px);display:flex;align-items:center;justify-content:center;font:600 26px/1 'Inter',sans-serif;color:#eee;letter-spacing:.12em">ẢNH MINH HOẠ</div>`;

  // =====================================================================================================
  // 1. SWISS GRID — page #EAE9E5, paper #FFF, ink #111, greys, signal red #E30613; Inter only; wipes + knife cuts.
  // =====================================================================================================
  const SWC = { page: '#EAE9E5', paper: '#FFFFFF', ink: '#111111', mute: '#77766F', guide: '#D3D2CC', sig: '#E30613', font: "'Inter','Be Vietnam Pro',sans-serif" };
  const swPal = s => ({ ...SWC, sig: s?.color || (TL?.brand?.primary) || SWC.sig });
  // grid: 6 columns, 48 px margin (9:16) — 1280 wide gets 12 columns of the same rhythm
  const swGrid = () => {
    const g = G(), m = g.v ? 48 : 72, cols = g.v ? 6 : 12, gut = g.v ? 16 : 18, cw = ((g.v ? 648 : 1208) - m - (cols - 1) * gut) / cols;
    return { ...g, m, cols, gut, cw, x: i => m + i * (cw + gut), right: g.v ? 648 : 1208 };
  };
  const guides = (gr, y0, y1, col) => Array.from({ length: gr.cols }, (_, i) => `<div class="abs" style="left:${px(gr.x(i))}px;top:${px(y0)};width:1px;height:${px(y1 - y0)};background:${col}"></div>`).join('');
  // a word that rises out of its clip rect (diacritics kept inside by the padded clip box)
  const riseWord = (w, k, out = 0, extra = '') => `<span style="display:inline-block;overflow:hidden;vertical-align:top;padding:.24em .02em .14em;margin:-.24em -.02em -.14em">` +
    `<span style="display:inline-block;transform:translateY(${((1 - k) * 125 - out * 125).toFixed(1)}%);${extra}">${esc(w)}</span></span>`;
  const riseText = (text, lt, at, gap, out = 0) => String(text || '').split(/\s+/).filter(Boolean)
    .map((w, i) => riseWord(w, SW(prog(lt, at + i * gap, E16)), out)).join(' ');
  // card wipe: the page's top edge wipes up over the frame; rolls up into the header at the end
  const swWipe = (s, lt) => {
    const d = s.t1 - s.t0, a = 100 * (1 - SW(prog(lt, 0, E8))), b = 100 * SW(prog(lt, d - E8, E8));
    return `clip-path:inset(${a.toFixed(2)}% 0 ${b.toFixed(2)}% 0)`;
  };
  const swNote = (gr, c, y, text, lt, at) => text ? `<div class="abs" style="left:${gr.m}px;top:${px(y)};width:${px((gr.right - gr.m) * clamp(prog(lt, at, .3)))};height:2px;background:${c.ink}"></div>
      <div class="abs" style="left:${gr.m}px;top:${px(y + 12)};font:500 ${px(32 * gr.u)}/1.1 ${c.font};color:${c.ink};white-space:nowrap">${riseText(text, lt, at + .1, .05)}</div>` : '';

  const SWISS = {
    // House frame: paper header (title flush left, chapter counter right, ink rule, signal line struck across) +
    // the page under the chin with column guides. The face band in between stays as shot. chapters:[{t,num}].
    print_swiss_frame(s, t, lt) {
      const c = swPal(s), gr = swGrid(), { W, H, v, u } = gr;
      const hh = s.header_h ?? (v ? 200 : 118), top = s.page_top ?? (v ? 940 : 560);
      const kh = SW(prog(lt, 0, E8)), kp = SW(prog(lt, E16, E8));
      const ch = (s.chapters || []).filter(x => t >= x.t).pop();
      const num = ch ? ch.num : s.num ?? 0, total = s.total ?? Math.max(1, (s.chapters || []).length);
      const ck = ch ? SW(prog(t, ch.t, E16)) : 1;
      const counter = `<span style="display:inline-block;overflow:hidden;vertical-align:top;padding:.2em 0 .1em;margin:-.2em 0 -.1em"><span style="display:inline-block;transform:translateY(${((1 - ck) * 110).toFixed(1)}%)">${pad(num, 2)}</span></span><span style="color:${c.mute}"> / ${pad(total, 2)}</span>`;
      const header = `<div class="abs"${cidOf(s)} style="left:0;top:0;width:${W}px;height:${px(hh * kh)};overflow:hidden;background:${c.page}">
        ${guides(gr, 0, hh, c.guide)}
        <div class="abs" style="left:${gr.m}px;top:${px(hh * .585)};width:${px((gr.right - gr.m) * clamp(prog(lt, .1, .35)))};height:2px;background:${c.ink}"></div>
        <div class="abs" style="left:${gr.m}px;top:${px(hh * .64)};font:500 ${px(32 * u)}/1.15 ${c.font};color:${c.ink};white-space:nowrap;max-width:${px(gr.right - gr.m - 150)};overflow:hidden">${riseText(s.title || 'Tiêu đề', lt, .2, .05)}</div>
        <div class="abs" style="right:${px(W - gr.right)};top:${px(hh * .64)};font:500 ${px(32 * u)}/1.15 ${c.font};color:${c.ink};white-space:nowrap;font-variant-numeric:tabular-nums">${counter}</div></div>
        ${s.signal === false ? '' : `<div class="abs" style="left:0;top:${px(hh * kh)};width:${px(W * clamp(prog(lt, 0, .45)))};height:3px;background:${c.sig}"></div>`}`;
      const page = `<div class="abs" style="left:0;top:${px(H - (H - top) * kp)};width:${W}px;height:${px(H - top)};background:${c.page};overflow:hidden">${guides(gr, 0, H - top, c.guide)}</div>`;
      return { back: header + page };
    },

    // Chapter card: statement on top, a giant Inter 800 numeral flush left climbing in 4 eased steps, caption row.
    print_swiss_numeral(s, t, lt) {
      const c = swPal(s), gr = swGrid(), { W, H, v, u } = gr;
      const size = s.size || (v ? 640 : 520), n = String(s.num ?? 1);
      const k4 = Math.min(4, Math.floor(clamp(prog(lt, .25, 4 * E16)) * 4 + 1e-6));
      const sub = SW(prog(lt, .25 + Math.min(3, k4) * E16, E16));
      const climb = k4 >= 4 ? 1 : (k4 + sub) / 4;
      const numTop = v ? 1040 - size * .96 : H - 70 - size * .96;
      const st = `<div class="abs" style="left:${gr.m}px;top:${px(v ? 140 : 70)};width:${px(v ? 600 : 620)};font:700 ${px((s.text_size || 66) * u)}/1.04 ${c.font};letter-spacing:-.022em;color:${c.ink}">${riseText(s.text || 'Quy tắc số một', lt, .1, .06)}</div>`;
      const numeral = `<div class="abs" style="left:${px(gr.m - size * .045)};top:${px(numTop)};height:${px(size * .98)};overflow:hidden">
        <div style="font:800 ${size}px/1 ${c.font};letter-spacing:-.04em;color:${s.red ? c.sig : c.ink};transform:translateY(${((1 - climb) * 100).toFixed(2)}%)">${esc(n)}</div></div>`;
      const ny = v ? 1072 : H - 60;
      return { cover: true, hideCaptions: true, front: `<div class="full"${cidOf(s)} style="background:${c.page};${swWipe(s, lt)}">${guides(gr, 0, H, c.guide)}${st}${numeral}${v ? swNote(gr, c, ny, s.note, lt, .5) : ''}</div>` };
    },

    // Programme as ruled rows (number + item) snapping in `stagger` apart; `cut` = index knife-cut at `cut_at` (relative):
    // a 3 px ink line crosses the row, it collapses to its midline and the rows below ripple up.
    print_swiss_rows(s, t, lt) {
      const c = swPal(s), gr = swGrid(), { W, H, v, u } = gr;
      const items = s.items || ['Mục một', 'Mục hai', 'Mục ba'], st = s.stagger ?? .35, at0 = s.at ?? .35;
      const rh = (s.row_h || 108) * u, y0 = s.rows_y ?? (v ? 420 : 210);
      const cutI = s.cut ?? -1, cutAt = s.cut_at ?? (at0 + items.length * st + .5);
      const kc = cutI >= 0 ? clamp(prog(lt, cutAt, E16)) : 0, kcol = cutI >= 0 ? SW(prog(lt, cutAt + E16, E8)) : 0;
      const rows = items.map((it, i) => {
        const k = SW(prog(lt, at0 + i * st, E16)), kl = clamp(prog(lt, at0 + i * st, .3));
        const shift = i > cutI && cutI >= 0 ? -rh * SW(prog(lt, cutAt + E16 + E8 + (i - cutI - 1) * E16 * .5, E8)) : 0;
        const isCut = i === cutI, sy = isCut ? 1 - kcol : 1;
        return `<div class="abs" style="left:0;top:${px(y0 + i * rh + shift)};width:${W}px;height:${px(rh)};transform:scaleY(${f3(sy)});transform-origin:50% 50%">
          <div class="abs" style="left:${gr.m}px;bottom:0;width:${px((gr.right - gr.m) * kl)};height:2px;background:${c.ink}"></div>
          <div class="abs" style="left:${gr.m}px;bottom:${px(18 * u)};font:500 ${px(34 * u)}/1.1 ${c.font};color:${c.mute}">${riseWord(pad(i + 1, 2), k)}</div>
          <div class="abs" style="left:${px(gr.x(1))};bottom:${px(14 * u)};width:${px(gr.right - gr.x(1))};font:700 ${px(Math.min((s.item_size || 46) * u, (gr.right - gr.x(1)) / (chars(it).length * .56)))}/1.08 ${c.font};letter-spacing:-.015em;color:${c.ink};white-space:nowrap;overflow:hidden;padding-top:.25em">${riseWord(it, k)}</div>
          ${isCut ? `<div class="abs" style="left:${gr.m}px;top:50%;width:${px((gr.right - gr.m) * kc)};height:3px;background:${c.ink}"></div>` : ''}</div>`;
      }).join('');
      const title = `<div class="abs" style="left:${gr.m}px;top:${px(v ? 150 : 70)};width:${px(v ? 600 : 900)};font:700 ${px((s.text_size || 64) * u)}/1.04 ${c.font};letter-spacing:-.022em;color:${c.ink}">${riseText(s.title || 'Chương trình', lt, .05, .06)}</div>`;
      return { cover: true, hideCaptions: true, front: `<div class="full"${cidOf(s)} style="background:${c.page};${swWipe(s, lt)}">${guides(gr, 0, H, c.guide)}${title}${rows}${v ? swNote(gr, c, 1072, s.note, lt, .6) : ''}</div>` };
    },

    // The protagonist as a signal slab (3 columns) wiping up on `slab_at`; the statement overprints it in black.
    // The exception: at `off_at` the slab leaves the grid linearly with an eighth's pause mid-flight; readout on → off grid.
    print_swiss_slab(s, t, lt) {
      const c = swPal(s), gr = swGrid(), { W, H, v, u } = gr;
      const sx = gr.x(v ? 3 : 7), sw = gr.x(v ? 5 : 11) + gr.cw - sx, sy = v ? 250 : 120, sh = v ? 627 : 480;
      const ks = SW(prog(lt, s.slab_at ?? .15, E8));
      let dx = 0, dy = 0;
      const off = s.off_at;
      if (off != null && lt > off) { // linear move, pause one eighth at the middle, then continue
        const a = lt - off, leg = .45, m = a < leg ? a / leg * .5 : a < leg + E8 ? .5 : .5 + Math.min(1, (a - leg - E8) / leg) * .5;
        dx = m * (W - sx + 40); dy = -m * 90;
      }
      const offGrid = off != null && lt > off + .05;
      const slab = `<div class="abs" style="left:${px(sx + dx)};top:${px(sy + dy)};width:${px(sw)};height:${px(sh)};background:${c.sig};clip-path:inset(${((1 - ks) * 100).toFixed(2)}% 0 0 0)"></div>`;
      const read = `<div class="abs" style="left:${gr.m}px;top:${px(sy + sh - 30)};font:500 ${px(32 * u)}/1 ${c.font};color:${offGrid ? c.sig : c.mute};white-space:nowrap">${offGrid ? 'lệch lưới' : 'trên lưới'}</div>`;
      const st = `<div class="abs" style="left:${gr.m}px;top:${px(v ? 150 : 70)};width:${px(v ? 610 : 820)};font:700 ${px((s.text_size || 72) * u)}/1.04 ${c.font};letter-spacing:-.022em;color:${c.ink}">${riseText(s.text || 'Một thứ duy nhất', lt, .3, .07)}</div>`;
      return { cover: true, hideCaptions: true, front: `<div class="full"${cidOf(s)} style="background:${c.page};${swWipe(s, lt)}">${guides(gr, 0, H, c.guide)}${slab}${st}${read}${v ? swNote(gr, c, 1072, s.note, lt, .6) : ''}</div>` };
    },

    // A grid that means something: cols x rows cells drawn line by line, then `fill` cells turn signal red linearly
    // (rate cells/s from fill_at). label e.g. "24 ô = 24 giờ trong ngày".
    print_swiss_cells(s, t, lt) {
      const c = swPal(s), gr = swGrid(), { W, H, v, u } = gr;
      const cols = s.cols || 6, rows = s.rows || 4, total = cols * rows, fill = Math.min(total, s.fill ?? 8);
      const gx = gr.m, gw = gr.right - gr.m, cell = (gw - (cols - 1) * 6) / cols, gy = v ? 420 : 170, chh = Math.min(cell, v ? 110 : 80);
      const kl = clamp(prog(lt, .2, .5));
      const fa = s.fill_at ?? .8, rate = s.rate ?? 10, nf = Math.min(fill, Math.max(0, (lt - fa) * rate));
      let cells = '';
      for (let i = 0; i < total; i++) {
        const r = Math.floor(i / cols), q = i % cols, x = gx + q * (cell + 6), y = gy + r * (chh + 6);
        const kk = SW(prog(lt, .2 + (r + q) * .03, E16));
        const red = s.from_end ? i >= total - nf : i < nf;
        cells += `<div class="abs" style="left:${px(x)};top:${px(y)};width:${px(cell)};height:${px(chh)};border:2px solid ${c.ink};background:${red ? c.sig : c.paper};transform:scale(${f3(kk)});transform-origin:0 0"></div>`;
      }
      const st = `<div class="abs" style="left:${gr.m}px;top:${px(v ? 150 : 50)};width:${px(v ? 610 : 900)};font:700 ${px((s.text_size || 64) * u)}/1.04 ${c.font};letter-spacing:-.022em;color:${c.ink}">${riseText(s.text || 'Một ngày có 24 giờ', lt, .05, .06)}</div>`;
      const ly = gy + rows * (chh + 6) + 30;
      const label = `<div class="abs" style="left:${gr.m}px;top:${px(ly)};font:500 ${px(34 * u)}/1.15 ${c.font};color:${c.ink};width:${px(gw)}">${riseText(s.label || '', lt, .5, .05)}</div>
        <div class="abs" style="left:${gr.m}px;top:${px(ly + 56 * u)};font:700 ${px(40 * u)}/1 ${c.font};color:${c.sig};font-variant-numeric:tabular-nums">${nf > 0 ? `${Math.floor(nf)} / ${total}` : ''}</div>`;
      return { cover: true, hideCaptions: true, front: `<div class="full"${cidOf(s)} style="background:${c.page};${swWipe(s, lt)}">${guides(gr, 0, H, c.guide)}<div style="opacity:${f3(kl > 0 ? 1 : 0)}">${cells}</div>${st}${label}</div>` };
    },
  };

  // Caption: flush left on the page — a grey lead-in + a bold statement; each word rises out of its clip rect on its
  // onset (a sixteenth, swiss snap) and leaves upward in the last eighth. Draws its own page block if no frame is on.
  CAPTION_STYLES.print_swiss = (cap, t) => {
    const c = swPal(), gr = swGrid(), { W, H, v } = gr;
    const ws = cap.words, n = ws.length, lead = n >= 5 ? Math.floor(n / 3) : 0;
    const stTxt = ws.slice(lead).map(w => w.w).join(' '), L = chars(stTxt).length;
    const sz = cap.size || (v ? (L > 34 ? 44 : L > 22 ? 54 : 64) : (L > 40 ? 44 : 54));
    const out = clamp(prog(t, cap.t1 - E8 * .6, E8 * .6));
    const word = (w, i, style) => {
      const k = SW(prog(t, w.s, E16));
      return riseWord(w.w, k, SW(out), `${w.hl ? `color:${c.sig};` : ''}`);
    };
    const frameOn = (TL.scenes || []).some(s => s.type === 'print_swiss_frame' && !s.hidden && t >= s.t0 && t < s.t1);
    const y = cap.y ?? (v ? 968 : 580), x = cap.x != null ? cap.x - 312 : gr.m;
    const html = `${lead ? `<div style="font-weight:500;font-size:${Math.round(sz * .62)}px;line-height:1.15;color:${c.mute};margin-bottom:.25em">${ws.slice(0, lead).map(word).join(' ')}</div>` : ''}
      <div style="font-weight:${cap.weight || 700};font-size:${sz}px;line-height:1.06;letter-spacing:-.02em;color:${cap.color || c.ink}">${ws.slice(lead).map((w, i) => word(w, i + lead)).join(' ')}</div>`;
    return `<div id="cap" class="print_swiss"${cidOf(cap)} style="text-shadow:none;left:${px(x)};right:auto;top:${px(y)};width:${px(gr.right - gr.m)};text-align:left;font-family:${cap.font || c.font};
      ${frameOn ? '' : `background:${c.page};padding:14px 18px 18px ${px(gr.m)};margin-left:-${px(gr.m)};width:${px(gr.right)};`}">${html}</div>`;
  };

  // =====================================================================================================
  // 2. HALFTONE DOSSIER — paper #F4ECDD, navy #1D2340, blue, pink misregistration, yellow highlight, red stamps.
  // =====================================================================================================
  const DOC = { paper: '#F4ECDD', navy: '#1D2340', blue: '#2E55D6', pink: '#FF5A87', yellow: '#FFC628', red: '#E8384F', cream: '#FFF4E2', night: '#18203F', night2: '#2A3568', orange: '#F58A34',
    serif: "'Playfair Display',Georgia,serif", disp: "'Unbounded','Be Vietnam Pro',sans-serif", mono: "'JetBrains Mono',monospace", sans: "'Inter','Be Vietnam Pro',sans-serif" };
  // printed paper: mottling, warm vignette, fold, grain re-seeded every 2 frames (4 cached seeds)
  const docPaper = (t, night) => {
    const g = night ? DOC.night : DOC.paper, seed = 1 + Math.floor(t * 15) % 4;
    return `<div class="full" style="background:${g};background-image:radial-gradient(ellipse at 28% 18%,rgba(255,255,255,${night ? .06 : .45}),transparent 55%),radial-gradient(ellipse at 50% 50%,transparent 55%,rgba(${night ? '0,0,0,.45' : '120,80,30,.22'}) 100%),linear-gradient(90deg,transparent 49.6%,rgba(0,0,0,.05) 50%,rgba(255,255,255,.12) 50.4%,transparent 51.5%)"></div>${grain(night ? .35 : .28, seed, night ? 'screen' : 'multiply')}`;
  };
  // dot wipe: the page enters as a field of growing dots (mask), over `dur`
  const dotWipe = (lt, dur = .32, stp = 26) => {
    const k = clamp(lt / dur);
    if (k >= 1) return '';
    const r = (E.inCubic(k) * stp * .75).toFixed(1);
    const m = `radial-gradient(circle,#000 ${r}px,transparent ${(+r + .8).toFixed(1)}px)`;
    return `-webkit-mask-image:${m};mask-image:${m};-webkit-mask-size:${stp}px ${stp}px;mask-size:${stp}px ${stp}px;`;
  };
  // black-serif headline popping glyph by glyph (drop .45em + squash) with a pink misregistration shadow
  const glyphPop = (text, lt, at = .1, gap = .04, night = false) => {
    let i = 0;
    return String(text || '').normalize('NFC').split(/\s+/).filter(Boolean).map(w => `<span style="display:inline-block;white-space:nowrap">${chars(w).map(ch => {
      const k = prog(lt, at + (i++) * gap, .32), e = back(k, 2.2), sq = 1 - clamp(k * 1.6);
      return `<span style="display:inline-block;opacity:${k > 0 ? 1 : 0};transform:translateY(${((1 - e) * -.45).toFixed(3)}em) scale(${f3(1 - .3 * sq)},${f3(1 + .35 * sq)});transform-origin:50% 100%">${esc(ch)}</span>`;
    }).join('')}</span>`).join(' ');
  };
  const headline = (text, lt, o = {}) => {
    const g = G(), night = o.night, size = (o.size || 92) * g.u;
    return `<div class="abs" style="left:${px(o.x ?? 53)};top:${px(o.y ?? (g.v ? 170 : 70))};width:${px(o.w ?? (g.v ? 614 : 760))};font:900 ${px(size)}/1.02 ${DOC.serif};letter-spacing:-.01em;color:${night ? DOC.cream : DOC.navy};text-shadow:.055em .055em 0 ${night ? DOC.yellow : DOC.pink}">${glyphPop(text, lt, o.at ?? .12, o.gap ?? .035)}</div>`;
  };
  const chip = (text, bg, fg, size, extra = '') => `<span style="display:inline-block;padding:.22em .55em .2em;border-radius:.25em;background:${bg};color:${fg};font:800 ${px(size)}/1.1 ${DOC.mono};letter-spacing:.04em;white-space:nowrap;${extra}">${esc(text)}</span>`;
  // stamp: slams 2.6x -> 1x in 0.09 s, then a small elastic settle; distressed ink via a noise mask
  const stampHTML = (text, lt, at, o = {}) => {
    if (lt < at - .09) return '';
    const a = lt - at, col = o.color || DOC.red;
    const sc = a < 0 ? lerp(2.6, 1, E.inCubic(clamp((a + .09) / .09))) : 1 + .06 * Math.exp(-a * 9) * Math.sin(a * 38);
    const op = a < 0 ? .3 : .93, m = noise(7, .55, 1.4), solid = 'linear-gradient(rgba(0,0,0,.72),rgba(0,0,0,.72))';
    return `<div style="display:inline-block;transform:rotate(${o.rot ?? -8}deg) scale(${f3(sc)});opacity:${op}">
      <div style="padding:.12em .4em .1em;border:.09em solid ${col};outline:.035em solid ${col};outline-offset:.06em;border-radius:.12em;color:${col};font:900 ${px(o.size || 64)}/1.05 ${DOC.sans};letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;
        -webkit-mask-image:${m},${solid};mask-image:${m},${solid};-webkit-mask-size:220px 220px,100% 100%;mask-size:220px 220px,100% 100%">${esc(text)}</div></div>`;
  };
  const shakeAt = (lt, at) => { const a = lt - at; if (a < 0 || a > .35) return ''; const m = 14 * (1 - a / .35) ** 2, j = Math.floor(lt * 30); return `transform:translate(${(Math.sin(j * 2.3) * m).toFixed(1)}px,${(Math.cos(j * 1.7) * m).toFixed(1)}px);`; };
  // drawn prop that "boils": three jittered copies cycling at 10 fps
  const boil = (lt, amp = 2) => { const f = Math.floor(lt * 10) % 3; return `translate(${[0, amp, -amp][f]}px,${[0, -amp, amp * .6][f]}px) rotate(${[0, .8, -.6][f]}deg)`; };
  const docProp = (icon, x, y, size, lt, at) => {
    const k = back(prog(lt, at, .42), 1.9);
    if (!icon) return '';
    const inner = /\.(png|jpe?g|webp|gif)$/i.test(icon) ? `<img src="${url(icon)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">` : emoji(icon, 0, 0, size);
    return `<div class="abs" style="left:${px(x - size / 2)};top:${px(y - size / 2)};width:${size}px;height:${size}px;transform:translateY(${((1 - k) * 260).toFixed(1)}px) ${boil(lt)};opacity:${lt >= at ? 1 : 0}">${inner}</div>`;
  };

  const DOSSIER = {
    // HUD over the whole reel: case number chip + chapter chip (chapters:[{t,text}]) top left, REC dot + date top right.
    print_dossier_frame(s, t, lt) {
      const { W, v, u } = G(), sz = 26 * u, k = back(prog(lt, 0, .4), 1.9);
      const ch = (s.chapters || []).filter(x => t >= x.t).pop(), chText = ch ? ch.text : s.chapter;
      const kc = ch ? back(prog(t, ch.t, .35), 1.9) : k;
      const rec = Math.floor(t * 2) % 2 === 0;
      return { front: `<div class="abs"${cidOf(s)} style="left:${px(s.x ?? 40)};top:${px(s.y ?? (v ? 70 : 30))};transform:translateY(${((1 - k) * -120).toFixed(1)}px)">
          ${chip(s.case || 'HỒ SƠ SỐ 001', DOC.navy, DOC.cream, sz, `box-shadow:5px 5px 0 ${DOC.pink}`)}
          ${chText ? `<div style="margin-top:12px;transform:scale(${f3(kc)});transform-origin:0 50%">${chip(chText, DOC.yellow, DOC.navy, sz, `box-shadow:5px 5px 0 ${DOC.navy}`)}</div>` : ''}</div>
        <div class="abs" style="right:${px(v ? 40 : 40)};top:${px(s.y ?? (v ? 70 : 30))};transform:translateY(${((1 - k) * -120).toFixed(1)}px);display:flex;align-items:center;gap:10px">
          <span style="width:${px(sz * .7)};height:${px(sz * .7)};border-radius:50%;background:${DOC.red};opacity:${rec ? 1 : .25}"></span>
          ${chip(`REC ${s.date || '10.11.2026'}`, DOC.navy, DOC.cream, sz)}</div>` };
    },

    // Exhibit page (full frame): printed paper + 1-3 halftone layers, black-serif headline popping in glyph by glyph,
    // exhibit chip, optional giant halftone numeral (num), drawn prop (icon), typed evidence label, built-in stamp.
    print_dossier_page(s, t, lt) {
      const { W, H, v, u } = G(), night = !!s.night;
      const layers = s.dots || (night ? [{ color: DOC.night2, field: 'radial', ang: 15, blend: 'screen', op: .9 }] : [{ color: DOC.blue, field: 'edge', ang: 15, op: .55 }, { color: DOC.pink, field: 'radial', ang: 45, cy: .68, op: .6, step: 26 }]);
      const dots = layers.map(o => halftone(W, H, o)).join('');
      const num = s.num != null ? (() => {
        const k = back(prog(lt, s.num_at ?? .3, .45), 1.9), size = (s.num_size || 300) * u;
        const fill = `radial-gradient(circle,${DOC.orange} 38%,transparent 41%) 0 0/14px 14px,${DOC.yellow}`;
        return `<div class="abs" style="left:${px(v ? 40 : W - 520)};top:${px(v ? 430 : 200)};font:900 ${px(size)}/1 ${DOC.disp};letter-spacing:-.04em;background:${fill};-webkit-background-clip:text;background-clip:text;color:transparent;
          -webkit-text-stroke:${px(4 * u)} ${DOC.navy};filter:drop-shadow(10px 10px 0 ${DOC.pink});transform:scale(${f3(k)});transform-origin:20% 80%">${esc(s.num)}</div>`;
      })() : '';
      const exhibit = s.exhibit ? `<div class="abs" style="left:53px;top:${px(v ? 120 : 30)};transform:scale(${f3(back(prog(lt, .05, .35)))});transform-origin:0 50%">${chip(s.exhibit, night ? DOC.yellow : DOC.navy, night ? DOC.navy : DOC.cream, 26 * u)}</div>` : '';
      const label = s.label ? (() => {
        const ch = chars(s.label), n = Math.floor(clamp((lt - (s.label_at ?? .8)) * (s.cps ?? 26), 0, ch.length));
        return `<div class="abs" style="left:53px;top:${px(v ? 880 : 500)};width:${px(v ? 614 : 560)};padding:.4em .6em;background:${DOC.cream};border:3px solid ${DOC.navy};box-shadow:7px 7px 0 ${DOC.navy};font:800 ${px(30 * u)}/1.3 ${DOC.mono};color:${DOC.navy};opacity:${lt >= (s.label_at ?? .8) - .05 ? 1 : 0};transform:rotate(-1deg)">${esc(ch.slice(0, n).join(''))}<span style="color:transparent">${esc(ch.slice(n).join(''))}</span></div>`;
      })() : '';
      const prop = docProp(s.icon, v ? (s.num != null ? 560 : 360) : (s.num != null ? 1140 : 960), v ? (s.num != null ? 360 : 600) : (s.num != null ? 200 : 400), (s.icon_size || (s.num != null ? 210 : 300)) * u, lt, s.icon_at ?? .35);
      const stAt = s.stamp_at ?? (s.t1 - s.t0) * .6;
      const stamp = s.stamp ? `<div class="abs" style="left:${px(v ? 360 : 960)};top:${px(v ? 790 : 520)};transform:translate(-50%,-50%)">${stampHTML(s.stamp, lt, stAt, { size: 66 * u })}</div>` : '';
      const page = `${docPaper(t, night)}${dots}${exhibit}${headline(s.title || 'Hồ sơ', lt, { night, size: s.title_size || 92 })}${num}${prop}${label}`;
      return { cover: true, front: `<div class="full"${cidOf(s)} style="overflow:hidden;${dotWipe(lt)}"><div class="full" style="${s.stamp ? shakeAt(lt, stAt) : ''}">${page}${stamp}</div></div>` };
    },

    // Suspect profile: height chart, the drawn suspect (emoji / image) rising with overshoot and boiling, a white flash,
    // a navy plate "NGHI PHẠM / HỒ SƠ SỐ 001".
    print_dossier_suspect(s, t, lt) {
      const { W, H, v, u } = G();
      const y0 = v ? 300 : 120, y1 = v ? 900 : 600, cx = v ? 360 : 640;
      let chart = '';
      for (let i = 0, n = 8; i <= n; i++) {
        const y = y1 - (y1 - y0) * i / n, kl = clamp(prog(lt, .05 + i * .03, .25));
        chart += `<div class="abs" style="left:${px(v ? 40 : 300)};top:${px(y)};width:${px((v ? 640 : 680) * kl)};height:${i % 2 ? 2 : 4}px;background:${DOC.navy};opacity:.8"></div>`
          + (i % 2 ? '' : `<div class="abs" style="left:${px(v ? 44 : 304)};top:${px(y - 34 * u)};font:800 ${px(26 * u)}/1 ${DOC.mono};color:${DOC.navy};opacity:${kl}">${150 + i * 5}</div>`);
      }
      const fa = s.flash_at ?? .55, fl = lt >= fa ? .5 * (1 - clamp((lt - fa) / .3)) : 0;
      const kp = back(prog(lt, .7, .4), 1.9);
      const plate = `<div class="abs" style="left:${px(cx)};top:${px(v ? 960 : 620)};transform:translate(-50%,-50%) scale(${f3(kp)});background:${DOC.navy};color:${DOC.cream};padding:.35em .9em .4em;border-radius:.2em;box-shadow:8px 8px 0 ${DOC.pink};text-align:center;font-size:${px(30 * u)}">
        <div style="font:900 1.6em/1.05 ${DOC.sans};letter-spacing:.06em;white-space:nowrap">${esc(s.name || 'NGHI PHẠM')}</div>
        <div style="font:800 1em/1.2 ${DOC.mono};color:${DOC.yellow};white-space:nowrap">${esc(s.case || 'HỒ SƠ SỐ 001')}</div></div>`;
      const page = `${docPaper(t)}${halftone(W, H, { color: DOC.yellow, field: 'radial', cy: .45, ang: 30, op: .75 })}${chart}${docProp(s.icon || '📱', cx, v ? 640 : 380, (s.icon_size || 360) * u, lt, .25)}${plate}
        ${s.title ? headline(s.title, lt, { y: v ? 130 : 40, size: 72, at: .9 }) : ''}<div class="full" style="background:#fff;opacity:${f3(fl)}"></div>`;
      return { cover: true, front: `<div class="full"${cidOf(s)} style="overflow:hidden;${dotWipe(lt)}">${page}</div>` };
    },

    // Evidence board: 2-4 index cards (num, icon, text) pinned and popping in `stagger` apart, a red string drawn
    // pin to pin. items:[{text, icon}].
    print_dossier_board(s, t, lt) {
      const { W, H, v, u } = G(), items = (s.items || [{ text: 'Ngủ muộn', icon: '🌙' }, { text: 'Lười vận động', icon: '🏋️' }, { text: 'Tim mệt', icon: '❤️' }]).slice(0, 4);
      const st = s.stagger ?? .45, at0 = s.at ?? .4;
      const pos = v ? [[200, 430], [500, 610], [220, 820], [500, 1000]] : [[260, 330], [620, 470], [980, 330], [1000, 560]];
      const rots = [-4, 3, -2, 4];
      const cw = 270 * u, chh = 200 * u;
      const cards = items.map((it, i) => {
        const [x, y] = pos[i], k = back(prog(lt, at0 + i * st, .38), 2);
        return `<div class="abs" style="left:${px(x - cw / 2)};top:${px(y - chh / 2)};width:${px(cw)};height:${px(chh)};background:${DOC.cream};border:3px solid ${DOC.navy};box-shadow:7px 8px 0 rgba(29,35,64,.85);transform:rotate(${rots[i]}deg) scale(${f3(k)});opacity:${lt >= at0 + i * st ? 1 : 0}">
          <div class="abs" style="left:12px;top:6px;font:900 ${px(54 * u)}/1 ${DOC.disp};color:${DOC.yellow};-webkit-text-stroke:2.5px ${DOC.navy}">${pad(i + 1, 2)}</div>
          ${emoji(it.icon || '📌', cw - 102 * u, 10, 92 * u)}
          <div class="abs" style="left:14px;right:12px;bottom:12px;font:800 ${px(30 * u)}/1.15 ${DOC.sans};color:${DOC.navy}">${esc(it.text)}</div>
          <div class="abs" style="left:50%;top:-12px;width:22px;height:22px;margin-left:-11px;border-radius:50%;background:${DOC.red};border:3px solid ${DOC.navy}"></div></div>`;
      }).join('');
      const pts = items.map((_, i) => [pos[i][0], pos[i][1] - chh / 2]);
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const ks = clamp(prog(lt, s.string_at ?? (at0 + items.length * st), .6));
      const string = `<svg class="abs" width="${W}" height="${H}" style="left:0;top:0"><polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${DOC.red}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${len.toFixed(0)}" stroke-dashoffset="${(len * (1 - ks)).toFixed(1)}"/></svg>`;
      const page = `${docPaper(t)}${halftone(W, H, { color: DOC.blue, field: 'edge', op: .45 })}${s.title ? headline(s.title, lt, { y: v ? 150 : 40, size: 76 }) : ''}${cards}${string}`;
      return { cover: true, front: `<div class="full"${cidOf(s)} style="overflow:hidden;${dotWipe(lt)}">${page}</div>` };
    },

    // A verdict stamp over the frame (below the face, no shake): text, color, rot, size; slams at `at` (relative).
    print_dossier_stamp(s, t, lt) {
      const { v, u } = G();
      return { front: `<div class="abs"${cidOf(s)} style="left:${px(s.x ?? (v ? 360 : 640))};top:${px(s.y ?? (v ? 955 : 520))};transform:translate(-50%,-50%)">${stampHTML(s.text || 'ĐÃ XÁC MINH', lt, s.at ?? .12, { size: (s.size || 60) * u, rot: s.rot, color: s.color })}</div>` };
    },
  };

  // Caption: navy pill, pink offset shadow, cream Inter heavy, keywords (hl) yellow; pops in (back.out, -2.4° -> -0.6°).
  CAPTION_STYLES.print_dossier = (c, t) => {
    const { W, v } = G(), size = c.size || (v ? 36 : 32), k = back(prog(t, c.t0, .4), 1.9);
    const x = c.x ?? W / 2, y = c.y ?? (v ? 1060 : 620);
    const html = c.words.map(w => `<span style="color:${w.hl ? DOC.yellow : c.color || DOC.cream}">${esc(w.w)}</span>`).join(' ');
    return `<div id="cap" class="print_dossier"${cidOf(c)} style="text-shadow:none;left:${px(x - W / 2)};right:${px(W / 2 - x)};top:${px(y)};transform:translateY(-50%);text-align:center">
      <div style="display:inline-block;max-width:${v ? 600 : 1000}px;padding:.36em .62em .4em;border-radius:14px;background:${DOC.navy};box-shadow:7px 7px 0 ${DOC.pink};font:${c.weight || 800} ${size}px/1.2 ${c.font || DOC.sans};
        transform:scale(${f3(lerp(.6, 1, k))}) rotate(${lerp(-2.4, -.6, clamp(k)).toFixed(2)}deg)">${html}</div></div>`;
  };

  // =====================================================================================================
  // 3. TACTILE PAPER — maroon ground, newsprint / letter paper, stop-motion on twos, white arrows, crimson marker.
  // =====================================================================================================
  const TP = { g0: '#522333', g1: '#60293C', g2: '#240F16', flat: '#6A2947', title: '#110E10', label: '#141114', white: '#FDFCFB', marker: '#990028', pill: 'rgba(31,31,31,.85)', cap: '#FCFCFD', box: '#363432', boxText: '#F2F4F0', news: '#C9CAC6', letter: '#DFCFB6',
    sans: "'Inter Tight','Inter','Be Vietnam Pro',sans-serif", serif: "'Playfair Display',Georgia,serif", mono: "'JetBrains Mono',monospace" };
  const ground = (flat, t) => `<div class="full" style="background:${flat ? TP.flat : `radial-gradient(ellipse 80% 65% at 50% 42%,${TP.g1} 0%,${TP.g0} 50%,${TP.g2} 100%)`}"></div>${grain(.35, 3 + Math.floor(t * 12) % 2, 'overlay')}`;
  const paperBg = kind => {
    const col = kind === 'letter' ? TP.letter : TP.news;
    return `background:${col};background-image:${noise(5, .7, .35)},radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.35),transparent 60%),radial-gradient(ellipse at 80% 100%,rgba(60,40,20,.18),transparent 60%);background-size:256px 256px,100% 100%,100% 100%`;
  };
  // the printed sheet's content (newspaper / letter): head, body lines, date; underline marks drawn on its lines
  const sheetContent = (s, lt, w) => {
    const u = G().u, body = s.body || ['Thành phố ngày càng đông đúc,', 'nhưng con người lại thấy', 'cô đơn hơn bao giờ hết.'];
    const marks = new Set(s.marks || []), ka = clamp(prog(step(lt, 12), s.mark_at ?? 1.2, .4));
    return `<div style="padding:${px(30 * u)} ${px(34 * u)};color:${TP.label}">
      <div style="display:flex;justify-content:space-between;font:600 ${px(20 * u)}/1 ${TP.mono};border-bottom:2px solid ${TP.label};padding-bottom:8px;letter-spacing:.06em"><span>${esc(s.paper_name || 'BÁO MẪU')}</span><span>${esc(s.date || 'SỐ 01 · 2026')}</span></div>
      <div style="font:900 ${px((s.head_size || 54) * u)}/1.04 ${TP.serif};margin:${px(18 * u)} 0 ${px(14 * u)}">${esc(s.head || 'Tiêu đề bài báo (ví dụ)')}</div>
      ${body.map((l, i) => `<div style="position:relative;display:inline-block;font:500 ${px(30 * u)}/1.45 ${TP.serif};margin-right:100%;white-space:nowrap">${esc(l)}${marks.has(i) ? `<svg style="position:absolute;left:-4px;bottom:-4px;overflow:visible" width="${px(w)}" height="10"><path d="M0 6 Q ${w * .25} 1 ${w * .5} 5 T ${w} 4" fill="none" stroke="${TP.marker}" stroke-width="7" stroke-linecap="round" opacity=".9" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${f3(1 - ka)}" style="mix-blend-mode:multiply"/></svg>` : ''}</div>`).join('')}
      ${Array.from({ length: 9 }, (_, i) => `<div style="height:${px(14 * u)};margin-top:${px(14 * u)};width:${88 - (i * 37) % 30}%;background:rgba(20,17,20,.16)"></div>`).join('')}</div>`;
  };
  // unfurl from the top-left corner: visible triangle x+y<r (clip-path) + a lighter folded flap on the fold line
  const unfurl = (r, w, h) => {
    const R = r.toFixed(1), f = Math.min(160, r * .32);
    const clip = `clip-path:polygon(0 0,${R}px 0,0 ${R}px)`;
    if (r >= w + h) return { clip: '', flap: '' };
    const ax = r / 2 - f * .55, ay = r / 2 - f * .55;
    const flap = `<svg class="abs" width="${w}" height="${h}" style="left:0;top:0;overflow:visible"><defs><linearGradient id="fl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f1ea"/><stop offset="1" stop-color="#a9a49b"/></linearGradient></defs>
      <polygon points="${R},0 0,${R} ${ax.toFixed(1)},${ay.toFixed(1)}" fill="url(#fl)" style="filter:drop-shadow(-6px -6px 10px rgba(0,0,0,.35))"/></svg>`;
    return { clip, flap };
  };
  // white (or black) brush arrow drawn on twos
  const arrowSVG = (x1, y1, x2, y2, k, col = TP.white, wdt = 9) => {
    const mx = (x1 + x2) / 2 + (y2 - y1) * .25, my = (y1 + y2) / 2 - (x2 - x1) * .25;
    const a = Math.atan2(y2 - my, x2 - mx), hl = 34;
    const h1 = [x2 - hl * Math.cos(a - .5), y2 - hl * Math.sin(a - .5)], h2 = [x2 - hl * Math.cos(a + .5), y2 - hl * Math.sin(a + .5)];
    const kh = clamp((k - .8) / .2);
    return `<svg class="abs" width="10" height="10" style="left:0;top:0;overflow:visible"><path d="M${x1} ${y1} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="${wdt}" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${f3(1 - clamp(k / .8))}"/>
      <path d="M${h1[0].toFixed(1)} ${h1[1].toFixed(1)} L${x2} ${y2} L${h2[0].toFixed(1)} ${h2[1].toFixed(1)}" fill="none" stroke="${col}" stroke-width="${wdt}" stroke-linecap="round" stroke-linejoin="round" opacity="${kh > 0 ? 1 : 0}"/></svg>`;
  };
  const sheetGeo = () => { const { W, H, v } = G(); return v ? { x: 23, y: 400, w: 674, h: 900 } : { x: 380, y: 150, w: 860, h: 600 }; };
  const sheetBlock = (s, lt, r) => {
    const sg = sheetGeo(), uf = unfurl(r, sg.w, sg.h);
    return `<div class="abs" style="left:${sg.x}px;top:${sg.y}px;width:${sg.w}px;height:${sg.h}px;filter:drop-shadow(0 18px 22px rgba(0,0,0,.45))">
      <div class="full" style="${paperBg(s.paper)};overflow:hidden;${uf.clip}">${sheetContent(s, lt, sg.w * .55)}</div>${uf.flap}</div>`;
  };
  const titleWords = (text, lt, at, gap, col, size) => String(text || '').split(/\s+/).filter(Boolean).map((w, i) => {
    const a = step(lt, 12) - (at + i * gap); // whole words rise on twos
    return a < 0 ? `<span style="opacity:0">${esc(w)}</span>` : `<span style="display:inline-block;transform:translateY(${a < 1 / 12 ? 18 : a < 2 / 12 ? 7 : 0}px)">${esc(w)}</span>`;
  }).join(' ');

  // a paper scene (ground + unfurling sheet + title + arrow), as seen at local time lt
  const paperScene = (s, t, lt) => {
    const { v, u } = G(), d = s.t1 - s.t0, sl = step(lt, 12);
    const sg = sheetGeo(), r = (sg.w + sg.h) * 1.02 * E.outCubic(clamp(sl / (s.unfurl ?? .9)));
    const push = 1 + .045 * E.inOutSine(clamp(lt / Math.max(1, d)));
    const title = s.title !== '' ? `<div class="abs" style="left:${px(v ? 56 : 60)};top:${px(v ? 120 : 40)};width:${px(v ? 560 : 320)};font:700 ${px((s.title_size || 76) * u)}/1.02 ${TP.sans};letter-spacing:-.02em;color:${s.title_color || TP.white}">${titleWords(s.title || 'Thành phố đông người', lt, s.title_at ?? .1, .25)}</div>` : '';
    const ak = clamp(prog(sl, s.arrow_at ?? .7, .4));
    const arrow = s.arrow === false || s.title === '' ? '' : arrowSVG(v ? 668 : 330, v ? 230 : 330, v ? 612 : 470, v ? 450 : 330, ak);
    return `<div class="full"${cidOf(s)} style="overflow:hidden">${ground(false, t)}<div class="full" style="transform:scale(${f3(push)});transform-origin:50% 60%">${sheetBlock(s, lt, r)}${title}${arrow}</div></div>`;
  };
  // the page turning away around its left edge (k 0..1), the speaker underneath
  const turnWrap = (s, t, inner, k) => {
    const { v } = G();
    return `<div class="full" style="perspective:${v ? 1600 : 2400}px;overflow:hidden">
      <div class="full" style="transform-origin:0 50%;transform:rotateY(${(-105 * k).toFixed(1)}deg);backface-visibility:hidden;box-shadow:${(30 * k).toFixed(0)}px 0 60px rgba(0,0,0,.5)">
        ${inner}<div class="full" style="background:linear-gradient(90deg,rgba(0,0,0,${f3(.5 * k)}),rgba(255,255,255,${f3(.12 * k)}) 70%,rgba(0,0,0,${f3(.3 * k)}))"></div></div></div>`;
  };

  const PAPER = {
    // Hook / paper scene (full frame): maroon ground, a printed sheet unfurling from its corner on twos from frame 0,
    // the title rising word by word above it, a white brush arrow title -> sheet, crimson underlines (marks:[line idx]).
    print_paper_sheet(s, t, lt) {
      const { W, H, v, u } = G(), d = s.t1 - s.t0;
      // turn_out: the scene ends by turning away like a page onto the speaker (last turn_dur s, on twos / threes)
      const fps = s.slow ? 8 : 12, td = s.turn_dur ?? (s.slow ? .9 : .5), ts = d - td - .08;
      if (s.turn_out && lt >= ts) {
        const k = E.inCubic(clamp((step(lt - ts, fps)) / td));
        return k >= 1 ? {} : { front: turnWrap(s, t, paperScene(s, t, ts), k) };
      }
      return { cover: true, front: paperScene(s, t, lt) };
    },

    // Page turn onto the face: the paper scene (same props as print_paper_sheet, fully open) turns away like a page
    // around its left edge — on twos (or threes with slow:true) — from `turn_at`, uncovering the speaker.
    // (print_paper_sheet with turn_out:true does the same inside one scene.)
    print_paper_turn(s, t, lt) {
      const fps = s.slow ? 8 : 12, ta = s.turn_at ?? .3, dur = s.turn_dur ?? (s.slow ? .9 : .5);
      const k = E.inCubic(clamp((step(lt, fps) - ta) / dur));
      if (k >= 1) return {};
      return { front: turnWrap(s, t, paperScene({ ...s, arrow: false }, t, 99), k) };
    },

    // A print / card curling in from the bottom edge below the face (top >= 810): greyscale photo (src) or emoji (icon),
    // a charcoal label box of plain fact boiling at 8 fps, optional crimson ellipse round it.
    print_paper_card(s, t, lt) {
      const { W, v, u } = G(), sl = step(lt, 12);
      const w = (s.w || 400) * u, h = (s.h || 260) * u, x = s.x ?? (v ? 380 : W - 300), y = s.y ?? (v ? 1105 : 470);
      const k = E.outCubic(clamp(sl / (s.curl ?? .5)));
      const rx = (1 - k) * 75, push = 1 + .03 * clamp(lt / 3);
      const inner = s.src ? picture(s.src) : `<div class="full" style="${paperBg(s.paper || 'letter')};display:flex;align-items:center;justify-content:center">${s.icon ? `<div style="position:relative;width:${px(h * .7)};height:${px(h * .7)}">${emoji(s.icon, 0, 0, h * .7)}</div>` : `<div style="font:900 ${px(46 * u)}/1.05 ${TP.serif};color:${TP.label};text-align:center;padding:0 .4em">${esc(s.text || 'Bức ảnh (ví dụ)')}</div>`}</div>`;
      const b = Math.floor(lt * 8) % 2;
      const lk = clamp(prog(sl, s.label_at ?? .5, 1 / 12));
      const label = s.label ? `<div class="abs" style="left:${px(-14)};bottom:${px(-26 * u)};padding:${px(12 * u)} ${px(16 * u)} ${px(10 * u)};background:${TP.box};color:${TP.boxText};font:700 ${px(34 * u)}/1 ${TP.sans};letter-spacing:-.01em;white-space:nowrap;opacity:${lk};transform:rotate(${b ? -2.4 : -1.6}deg) translate(${b}px,${-b}px)">${esc(s.label)}</div>` : '';
      const ek = clamp(prog(sl, s.ellipse_at ?? .8, .4));
      const ell = s.ellipse ? `<svg class="abs" width="${w + 60}" height="${h + 50}" style="left:-30px;top:-25px;overflow:visible"><ellipse cx="${(w + 60) / 2}" cy="${(h + 50) / 2}" rx="${(w + 40) / 2}" ry="${(h + 30) / 2}" fill="none" stroke="${TP.marker}" stroke-width="8" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${f3(1 - ek)}" transform="rotate(-4 ${(w + 60) / 2} ${(h + 50) / 2})" style="mix-blend-mode:multiply" opacity=".9"/></svg>` : '';
      return { front: `<div class="abs"${cidOf(s)} style="left:${px(x - w / 2)};top:${px(y - h / 2)};width:${px(w)};height:${px(h)};perspective:900px">
        <div class="full" style="transform-origin:50% 100%;transform:rotateX(${rx.toFixed(1)}deg) rotate(${s.rot ?? -2}deg) scale(${f3(push)});opacity:${lt > 0 ? 1 : 0}">
          <div class="full" style="border:${px(12 * u)} solid #F4F1EA;background:#F4F1EA;box-shadow:0 14px 26px rgba(0,0,0,.45);overflow:hidden"><div class="full" style="overflow:hidden">${inner}</div>
            <div class="full" style="background:linear-gradient(0deg,rgba(0,0,0,${f3(.4 * (1 - k))}),transparent 60%)"></div></div>${ell}${label}</div></div>` };
    },

    // Hand marks glued to the frame: kind 'arrow' (white; black:true for the flat ground) from x,y to x2,y2,
    // 'underline' (crimson, w wide at x,y), 'ellipse' (crimson round x,y w,h). Drawn on twos over `draw` s.
    print_paper_marks(s, t, lt) {
      const { v } = G(), k = clamp(prog(step(lt, 12), s.at ?? 0, s.draw ?? .45));
      const x = s.x ?? 360, y = s.y ?? (v ? 900 : 500), kind = s.kind || 'arrow';
      let svg = '';
      if (kind === 'arrow') svg = arrowSVG(x, y, s.x2 ?? x + 120, s.y2 ?? y + 160, k, s.black ? TP.label : TP.white, s.width || 9);
      else if (kind === 'underline') { const w = s.w || 300; svg = `<svg class="abs" width="10" height="10" style="left:0;top:0;overflow:visible"><path d="M${x - w / 2} ${y} Q ${x} ${y - 8} ${x + w / 2} ${y + 2}" fill="none" stroke="${TP.marker}" stroke-width="9" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${f3(1 - k)}" opacity=".9"/></svg>`; }
      else { const w = s.w || 260, h = s.h || 140; svg = `<svg class="abs" width="10" height="10" style="left:0;top:0;overflow:visible"><ellipse cx="${x}" cy="${y}" rx="${w / 2}" ry="${h / 2}" transform="rotate(-5 ${x} ${y})" fill="none" stroke="${TP.marker}" stroke-width="8" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${f3(1 - k)}" opacity=".9"/></svg>`; }
      return { front: `<div class="full"${cidOf(s)} style="pointer-events:none">${svg}</div>` };
    },

    // The rising word (full frame, flat ground): one word whose letters rise from behind a page edge two frames apart,
    // the page carrying a sub line in serif italic. Hides captions (the word is the caption).
    print_paper_rise(s, t, lt) {
      const { W, H, v, u } = G(), edge = s.edge_y ?? (v ? 700 : 470), sl = step(lt, 12);
      const ch = chars(s.text || 'Phẳng'), size = Math.min((s.size || 150) * u, (v ? 640 : 1100) / Math.max(1, ch.length * .56));
      const letters = ch.map((c, i) => {
        const k = E.outCubic(clamp((sl - (s.at ?? .15) - i * 2 / 30) / (3 / 12)));
        return `<span style="display:inline-block;transform:translateY(${((1 - k) * 110).toFixed(1)}%)">${c === ' ' ? '&nbsp;' : esc(c)}</span>`;
      }).join('');
      const pk = E.outCubic(clamp(sl / .35));
      return { cover: true, hideCaptions: true, front: `<div class="full"${cidOf(s)} style="overflow:hidden">${ground(true, t)}
        <div class="abs" style="left:0;top:0;width:${W}px;height:${px(edge)};overflow:hidden"><div class="abs" style="left:0;right:0;bottom:-.08em;text-align:center;font:700 ${px(size)}/1 ${TP.sans};letter-spacing:-.03em;color:${s.color || TP.white};white-space:nowrap">${letters}</div></div>
        <div class="abs" style="left:${px(v ? 30 : 140)};top:${px(edge + (1 - pk) * 500)};width:${px(v ? 660 : 1000)};height:${px(H)};${paperBg('letter')};box-shadow:0 -10px 30px rgba(0,0,0,.4);transform:rotate(-1.2deg)">
          ${s.sub ? `<div style="padding:${px(40 * u)} ${px(40 * u)};font:italic 600 ${px(44 * u)}/1.25 ${TP.serif};color:${TP.label}">${esc(s.sub)}</div>` : ''}</div></div>` };
    },
  };

  // Caption: 1-3 word chunks (<= 17 chars) in a black condensed pill, hard swaps (no animation, no active word).
  const chunks3 = words => {
    const out = []; let cur = [];
    for (const w of words) {
      const len = chars([...cur.map(x => x.w), w.w].join(' ')).length;
      if (cur.length && (cur.length >= 3 || len > 17)) { out.push(cur); cur = []; }
      cur.push(w);
    }
    if (cur.length) out.push(cur);
    return out;
  };
  CAPTION_STYLES.print_paper = (c, t) => {
    const { W, v } = G(), size = c.size || (v ? 42 : 38);
    const groups = chunks3(c.words);
    const g = groups.filter(gr => t >= gr[0].s).pop() || groups[0];
    const x = c.x ?? W / 2, y = c.y ?? (v ? 935 : 600);
    return `<div id="cap" class="print_paper"${cidOf(c)} style="text-shadow:none;left:${px(x - W / 2)};right:${px(W / 2 - x)};top:${px(y)};transform:translateY(-50%);text-align:center">
      <span style="display:inline-block;padding:${px(size * .3)} ${px(size * .38)} ${px(size * .26)};border-radius:10px;background:${TP.pill};color:${c.color || TP.cap};font:${c.weight || 700} ${size}px/1.05 ${c.font || TP.sans};letter-spacing:-.025em;text-transform:uppercase;white-space:nowrap">${g.map(w => esc(w.w)).join(' ')}</span></div>`;
  };

  // =====================================================================================================
  // 4. KINETIC DOC — B&W archive pictures, grey pages for turn lines, warm paper for quotes, ONE warm red #D63A2F.
  // =====================================================================================================
  const KD = { ink: '#111111', white: '#F4F3EF', red: '#D63A2F', black: '#0A0A0A', greyC: '#DDDDDD', greyE: '#A1A1A1', paperC: '#E6E1D6', paperE: '#A9A49B',
    sans: "'Inter','Be Vietnam Pro',sans-serif", cond: "'Oswald','Be Vietnam Pro',sans-serif", serif: "'Playfair Display',Georgia,serif", mono: "'JetBrains Mono',monospace" };
  const kdPage = (warm, t) => `<div class="full" style="background:radial-gradient(ellipse 85% 70% at 50% 45%,${warm ? KD.paperC : KD.greyC} 30%,${warm ? KD.paperE : KD.greyE} 100%)"></div>${grain(.22, 11 + Math.floor(t * 15) % 3, 'overlay')}`;
  // red label box wiping on left -> right (0.5 s), optional sub-line strip
  const kdLabel = (text, sub, lt, at, x, y, u) => {
    if (!text) return '';
    const k = E.outCubic(clamp(prog(lt, at, .5)));
    return `<div class="abs" style="left:${px(x)};top:${px(y)};clip-path:inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)">
      <div style="display:inline-block;padding:.2em .4em .06em;background:${KD.red};color:#fff;font:700 ${px(40 * u)}/1.15 ${KD.cond};text-transform:uppercase;letter-spacing:.02em;white-space:nowrap">${esc(text)}</div>
      ${sub ? `<div style="display:table;margin-top:4px;padding:.18em .5em;background:${KD.white};color:${KD.ink};font:600 ${px(28 * u)}/1.2 ${KD.sans};white-space:nowrap">${esc(sub)}</div>` : ''}</div>`;
  };
  const fitBig = (w, max, width) => Math.max(36, Math.min(max, width / Math.max(1, chars(w).length * .5)));

  const KDOC = {
    // Turn line on a grey page: 1-3 heavy condensed words, each preceded by a black block of its size 3 frames ahead.
    // words:[{text,t}] (absolute) or text + stagger from `at`; red = index of the red word.
    print_kdoc_turn(s, t, lt) {
      const { W, H, v, u } = G();
      const ws = s.words?.length ? s.words.map(w => ({ text: w.text, lt: w.t - s.t0 })) : String(s.text || 'Nhưng rồi').split(/\s+/).filter(Boolean).map((w, i) => ({ text: w, lt: (s.at ?? .12) + i * (s.stagger ?? .35) }));
      const big = Math.min(...ws.map(w => fitBig(w.text, (s.size || 150) * u, v ? 640 : 1000)));
      const rows = ws.map((w, i) => {
        const shown = lt >= w.lt, block = !shown && lt >= w.lt - 3 / 30, red = s.red === i;
        return `<div style="display:block"><span style="display:inline-block;padding:0 .06em;background:${block ? KD.ink : 'transparent'};color:${shown ? (red ? KD.red : KD.ink) : 'transparent'};line-height:1.02">${esc(w.text)}</span></div>`;
      }).join('');
      return { cover: true, hideCaptions: true, front: `<div class="full"${cidOf(s)}>${kdPage(false, t)}
        <div class="abs" style="left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font:700 ${px(big)}/1 ${KD.cond};text-transform:uppercase;letter-spacing:-.005em">${rows}</div></div>` };
    },

    // A picture as a print: the sharp B&W picture over its own blurred, darkened copy, slow push 1 -> 1.06;
    // red label box (+ sub line) wiping on at `label_at`. src = image path (blank = placeholder).
    print_kdoc_print(s, t, lt) {
      const { W, H, v, u } = G(), d = s.t1 - s.t0, push = 1 + .06 * E.inOutSine(clamp(lt / Math.max(.5, d)));
      const bw = v ? 640 : 760, bh = v ? 560 : 460, cy = v ? 470 : 290;
      return { cover: true, front: `<div class="full"${cidOf(s)} style="background:${KD.black};overflow:hidden">
        <div class="full" style="transform:scale(1.15);filter:blur(28px) brightness(.42)">${picture(s.src)}</div>
        <div class="abs" style="left:${px(W / 2 - bw / 2)};top:${px(cy - bh / 2)};width:${bw}px;height:${bh}px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,.6)"><div class="full" style="transform:scale(${f3(push)})">${picture(s.src)}</div>
          ${grain(.18, 13, 'overlay')}</div>
        ${kdLabel(s.label, s.sub, lt, s.label_at ?? .45, W / 2 - bw / 2 + 20, cy + bh / 2 - (s.sub ? 90 : 56) * u, u)}</div>` };
    },

    // A picture in a window on black, stepping up in three sizes 4 frames apart, then a slow push.
    print_kdoc_window(s, t, lt) {
      const { W, H, v, u } = G(), d = s.t1 - s.t0;
      const sizes = s.steps || [.46, .68, .9], i = Math.min(2, Math.floor(Math.max(0, lt) / (4 / 30)));
      const sc = sizes[i] * (1 + .05 * E.inOutSine(clamp((lt - .4) / Math.max(.5, d))));
      const bw = (v ? 640 : 1000) * sc, bh = (v ? 760 : 520) * sc, cy = v ? 470 : 300;
      return { cover: true, front: `<div class="full"${cidOf(s)} style="background:${KD.black}">
        <div class="abs" style="left:${px(W / 2 - bw / 2)};top:${px(cy - bh / 2)};width:${px(bw)};height:${px(bh)};overflow:hidden;outline:2px solid rgba(244,243,239,.25)">${picture(s.src)}${grain(.2, 17, 'overlay')}</div>
        ${kdLabel(s.label, s.sub, lt, s.label_at ?? .6, W / 2 - bw / 2 + 16, cy + bh / 2 - (s.sub ? 90 : 56) * u, u)}</div>` };
    },

    // A number counting up in red Playfair 900 on warm paper (each value stepped), with a caps label and a sub line.
    print_kdoc_counter(s, t, lt) {
      const { W, H, v, u } = G(), from = s.from ?? 0, to = s.to ?? 100, dur = s.count ?? 1.2;
      const span = Math.abs(to - from), stepsN = Math.min(span, 24) || 1;
      const k = clamp(prog(lt, s.at ?? .2, dur)), val = from + (to - from) * Math.floor(k * stepsN) / stepsN;
      const dec = s.decimals ?? (String(to).split('.')[1] || '').length;
      const num = val.toLocaleString('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const txt = `${s.prefix || ''}${num}${s.suffix || ''}`, size = Math.min((s.size || 210) * u, (W - 70) / (chars(txt).length * .6));
      return { cover: true, hideCaptions: true, front: `<div class="full"${cidOf(s)}>${kdPage(true, t)}
        <div class="abs" style="left:0;right:0;top:${px(v ? 380 : 170)};text-align:center">
          <div style="font:900 ${px(size)}/1 ${KD.serif};color:${KD.red};font-variant-numeric:lining-nums tabular-nums;white-space:nowrap">${esc(s.prefix || '')}${num}${esc(s.suffix || '')}</div>
          ${s.label ? `<div style="margin-top:.4em;display:inline-block;padding:.2em .45em .08em;background:${KD.ink};color:${KD.white};font:700 ${px(44 * u)}/1.15 ${KD.cond};text-transform:uppercase;opacity:${lt >= (s.at ?? .2) ? 1 : 0}">${esc(s.label)}</div>` : ''}
          ${s.sub ? `<div style="margin:.6em auto 0;max-width:${v ? 600 : 900}px;font:italic 600 ${px(38 * u)}/1.25 ${KD.serif};color:${KD.ink};opacity:${lt >= (s.at ?? .2) + dur ? 1 : 0}">${esc(s.sub)}</div>` : ''}</div></div>` };
    },

    // Typewriter quote on warm paper: JetBrains Mono ~1 char a frame (cps), blinking bar cursor, attribution in serif italic.
    print_kdoc_type(s, t, lt) {
      const { W, H, v, u } = G(), ch = chars(s.text || 'Chúng ta không thiếu thời gian, chỉ thiếu ưu tiên.');
      const n = Math.floor(clamp((lt - (s.at ?? .2)) * (s.cps ?? 30), 0, ch.length)), done = n >= ch.length;
      const cur = !done || Math.floor(lt * 2.4) % 2 === 0;
      return { cover: true, hideCaptions: true, front: `<div class="full"${cidOf(s)}>${kdPage(true, t)}
        <div class="abs" style="left:${px(v ? 60 : 160)};right:${px(v ? 60 : 160)};top:${px(v ? 380 : 150)};font:600 ${px((s.size || 46) * u)}/1.4 ${KD.mono};color:${KD.ink}">
          ${esc(ch.slice(0, n).join(''))}<i style="display:inline-block;width:.12em;height:1.05em;vertical-align:-.18em;margin-left:.04em;background:${KD.ink};opacity:${cur ? 1 : 0}"></i><span style="color:transparent">${esc(ch.slice(n).join(''))}</span>
          ${s.by ? `<div style="margin-top:1.1em;font:italic 600 ${px(38 * u)}/1.2 ${KD.serif};color:${KD.red};opacity:${done ? 1 : 0}">${esc(s.by)}</div>` : ''}</div></div>` };
    },
  };

  // Caption: one centred line of small words (Inter 500, soft shadow) appearing in ONE frame at their onset at their
  // final place; one heavy condensed caps word (the `hl` word, or the last long word) on its own line under it.
  CAPTION_STYLES.print_kdoc = (c, t) => {
    const { W, v } = G(), size = c.size || (v ? 40 : 36), ws = c.words;
    let bi = ws.findIndex(w => w.hl);
    if (bi < 0 && ws.length >= 3 && chars(ws[ws.length - 1].w.replace(/[.,!?…]/g, '')).length >= 4) bi = ws.length - 1;
    const vis = w => (t >= w.s ? '' : 'visibility:hidden;');
    const small = ws.map((w, i) => (i === bi ? '' : `<span style="${vis(w)}">${esc(w.w)}</span>`)).filter(Boolean).join(' ');
    const bw = bi >= 0 ? ws[bi] : null, bs = bw ? fitBig(bw.w, size * 2.8, v ? 640 : 1000) : 0;
    const x = c.x ?? W / 2, y = c.y ?? (v ? 940 : 560);
    return `<div id="cap" class="print_kdoc"${cidOf(c)} style="left:${px(x - W / 2 + 30)};right:${px(W / 2 - x + 30)};top:${px(y)};transform:translateY(-50%);text-align:center;color:${c.color || KD.white};text-shadow:0 2px 14px rgba(0,0,0,.6),0 1px 3px rgba(0,0,0,.5)">
      ${small ? `<div style="font:${c.weight || 500} ${size}px/1.2 ${c.font || KD.sans};word-spacing:.32em">${small}</div>` : ''}
      ${bw ? `<div style="${vis(bw)}margin-top:.08em;font:700 ${Math.round(bs)}px/1 ${KD.cond};text-transform:uppercase;letter-spacing:-.005em;white-space:nowrap">${bw.hl ? `<span style="background:${KD.red};padding:0 .12em;text-shadow:none">${esc(bw.w)}</span>` : esc(bw.w)}</div>` : ''}</div>`;
  };

  // =====================================================================================================
  // 5. DATA STORY — cream paper + dot grid, chart drawn mark by mark under a red-blue pencil, handwritten notes,
  //    figure-caption subtitles. Numbers only with a source; otherwise the page says "SƠ ĐỒ MINH HOẠ".
  // =====================================================================================================
  const DS = { paper: '#F6F3EC', dot: '#E4DDCF', ink: '#2B2723', soft: '#6E665C', rule: '#DDD6C9', zero: '#BDB4A5', blue: '#2F5D8A', red: '#A8283A', wood: '#E3C79C',
    ramp: ['#FDDBC7', '#F4A582', '#D6604D', '#B2182B'], serif: "'Playfair Display',Georgia,serif", mono: "'JetBrains Mono',monospace", hand: "'Pacifico',cursive" };
  const dsPaper = () => `<div class="full" style="background:${DS.paper};background-image:radial-gradient(circle,${DS.dot} 1.6px,transparent 2.2px);background-size:24px 24px;background-position:12px 12px"></div>${grain(.12, 21, 'multiply')}`;
  const rampAt = k => DS.ramp[Math.min(DS.ramp.length - 1, Math.floor(clamp(k) * DS.ramp.length * .999))];
  // the red-blue pencil, tip at (x,y), angle a (rad), lead = 'blue' | 'red'; trembles while drawing
  const pencil = (x, y, a, lead, lt, drawing) => {
    const j = drawing ? Math.sin(lt * 70) * 1.3 : 0, L = 230, col = lead === 'red' ? DS.red : DS.blue, other = lead === 'red' ? DS.blue : DS.red;
    return `<svg class="abs" width="10" height="10" style="left:${px(x + j)};top:${px(y - j * .6)};overflow:visible;transform:rotate(${(a * 180 / Math.PI).toFixed(1)}deg);transform-origin:0 0;filter:drop-shadow(6px 8px 6px rgba(0,0,0,.25))">
      <polygon points="0,0 34,-9 34,9" fill="${DS.wood}"/><polygon points="0,0 11,-3 11,3" fill="${col}"/>
      <rect x="34" y="-9" width="${L / 2}" height="18" fill="${col}"/><rect x="${34 + L / 2}" y="-9" width="${L / 2}" height="18" fill="${other}"/>
      <rect x="34" y="-9" width="${L}" height="5" fill="rgba(255,255,255,.22)"/></svg>`;
  };
  // pencil path between marks: lifts and arcs (k 0..1 from a to b)
  const arcTo = (a, b, k) => { const e = E.inOutSine(k); return [lerp(a[0], b[0], e), lerp(a[1], b[1], e) - Math.sin(Math.PI * e) * 60]; };
  const dsTitle = (s, lt, u, v) => {
    const ch = chars(s.title || 'Tiêu đề biểu đồ'), n = Math.floor(clamp(lt * 40, 0, ch.length));
    const src = s.source ? `Nguồn: ${s.source}` : 'SƠ ĐỒ MINH HOẠ';
    return `<div class="abs" style="left:${px(v ? 48 : 80)};top:${px(v ? 150 : 50)};width:${px(v ? 624 : 1100)}">
      <div style="font:500 ${px((s.title_size || 52) * u)}/1.1 ${DS.serif};color:${DS.ink}">${esc(ch.slice(0, n).join(''))}<span style="color:transparent">${esc(ch.slice(n).join(''))}</span></div>
      <div style="margin-top:10px;font:400 ${px(24 * u)}/1.3 ${DS.mono};color:${s.source ? DS.soft : DS.red};letter-spacing:.02em;opacity:${f3(clamp(prog(lt, .4, .3)))}">${esc(s.unit ? `${s.unit} · ${src}` : src)}</div></div>`;
  };
  // handwritten note written on left -> right with a small leader line to (lx,ly)
  const dsNote = (text, x, y, lt, at, red, u, lx, ly) => {
    if (!text) return '';
    const dur = Math.max(.5, chars(text).length * .045), k = clamp(prog(lt, at, dur));
    const leader = lx != null ? `<svg class="abs" width="10" height="10" style="left:0;top:0;overflow:visible"><path d="M${x + 10} ${y + 8} Q ${(x + lx) / 2} ${Math.min(y, ly) - 30} ${lx} ${ly}" fill="none" stroke="${red ? DS.red : DS.blue}" stroke-width="3" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${f3(1 - clamp(prog(lt, at + dur, .3)))}"/></svg>` : '';
    return `${leader}<div class="abs" style="left:${px(x)};top:${px(y - 48 * u)};font:400 ${px(40 * u)}/1.3 ${DS.hand};color:${red ? DS.red : DS.blue};white-space:nowrap;clip-path:inset(-20% ${((1 - k) * 100).toFixed(2)}% -30% -5%)">${esc(text)}</div>`;
  };

  const DATA = {
    // Bar chart drawing itself: axis grows, bars land `stagger` apart (ramp colour by value), the pencil travels to
    // each bar top, a note pinned to bar `note.i`. items:[{label,value}], source (no source = schematic, no numbers).
    print_data_bars(s, t, lt) {
      const { W, H, v, u } = G(), items = s.items || [{ label: 'T2', value: 3 }, { label: 'T3', value: 5 }, { label: 'T4', value: 4 }, { label: 'T5', value: 8 }];
      const x0 = v ? 70 : 140, x1 = v ? 650 : 1140, yb = v ? 860 : 500, yt = v ? 380 : 190;
      const max = s.max ?? Math.max(...items.map(i => i.value)) * 1.12, nums = !!s.source;
      const ka = clamp(prog(lt, s.axis_at ?? .3, .45)), at0 = (s.axis_at ?? .3) + .5, st = s.stagger ?? .45, grow = .32;
      const slot = (x1 - x0) / items.length, bw = slot * .58;
      const tip = [];
      const bars = items.map((it, i) => {
        const k = SW(prog(lt, at0 + i * st, grow)), h = (yb - yt) * it.value / max * k, x = x0 + slot * i + (slot - bw) / 2;
        tip.push([x + bw / 2, yb - (yb - yt) * it.value / max]);
        return `<div class="abs" style="left:${px(x)};top:${px(yb - h)};width:${px(bw)};height:${px(h)};background:${rampAt(it.value / max)};border:2px solid ${DS.ink};border-bottom:none;opacity:${k > 0 ? 1 : 0}"></div>
          ${nums ? `<div class="abs" style="left:${px(x - 20)};width:${px(bw + 40)};top:${px(yb - h - 40 * u)};text-align:center;font:400 ${px(26 * u)}/1 ${DS.mono};color:${DS.ink};opacity:${k >= 1 ? 1 : 0}">${esc(it.value)}</div>` : ''}
          <div class="abs" style="left:${px(x - 30)};width:${px(bw + 60)};top:${px(yb + 12)};text-align:center;font:400 ${px(26 * u)}/1.1 ${DS.mono};color:${DS.soft};opacity:${f3(ka)}">${esc(it.label)}</div>`;
      }).join('');
      const axis = `<div class="abs" style="left:${px(x0)};top:${px(yb)};width:${px((x1 - x0) * ka)};height:3px;background:${DS.ink}"></div>
        <div class="abs" style="left:${px(x0)};top:${px(yb - (yb - yt) * ka)};width:3px;height:${px((yb - yt) * ka)};background:${DS.zero}"></div>`;
      // pencil: rests at the right, arcs to each bar top as it is drawn, exits after the last
      const tAt = i => at0 + i * st;
      let pp = [W + 40, yt - 100], drawing = false;
      for (let i = 0; i < items.length; i++) {
        const prev = i ? tip[i - 1] : [W - 60, yt - 60];
        if (lt >= tAt(i) - .25 && lt < tAt(i)) pp = arcTo(prev, tip[i], (lt - tAt(i) + .25) / .25);
        else if (lt >= tAt(i)) { pp = tip[i]; drawing = lt < tAt(i) + grow; }
      }
      const endT = tAt(items.length - 1) + grow;
      if (lt > endT + .2) pp = arcTo(tip[items.length - 1], [W + 60, yt - 200], clamp((lt - endT - .2) / .4));
      const n = s.note, ni = n ? Math.min(items.length - 1, n.i ?? items.length - 1) : 0;
      const noteAt = n?.at ?? endT + .1;
      const note = n ? dsNote(n.text, v ? Math.max(40, Math.min(420, tip[ni][0] - 260)) : tip[ni][0] - 300, (v ? yt - 20 : yt - 10), lt, noteAt, n.red, u, tip[ni][0], tip[ni][1] - 50) : '';
      return { cover: true, front: `<div class="full"${cidOf(s)}>${dsPaper()}${dsTitle(s, lt, u, v)}${axis}${bars}${note}${pencil(pp[0], pp[1], -.62, n?.red && lt > noteAt ? 'red' : 'blue', lt, drawing)}</div>` };
    },

    // Cells filling (waffle): cols x rows, `fill` cells tick in `rate`/s from fill_at in the ramp's dark end; big
    // "n / total" figure + note.
    print_data_cells(s, t, lt) {
      const { W, H, v, u } = G(), cols = s.cols || 10, rows = s.rows || 10, total = cols * rows, fill = Math.min(total, s.fill ?? 30);
      const gw = v ? 460 : 380, cell = gw / cols, gx = v ? (W - gw) / 2 : 700, gy = v ? 310 : 170;
      const fa = s.fill_at ?? .6, nf = Math.min(fill, Math.max(0, Math.floor((lt - fa) * (s.rate ?? 40))));
      const kg = clamp(prog(lt, .15, .4));
      let c = '';
      for (let i = 0; i < total; i++) {
        const r = Math.floor(i / cols), q = i % cols;
        c += `<div class="abs" style="left:${px(gx + q * cell + 2)};top:${px(gy + r * cell + 2)};width:${px(cell - 4)};height:${px(cell - 4)};background:${i < nf ? (s.red === false ? DS.blue : DS.ramp[3]) : DS.rule};opacity:${kg >= (r + 1) / rows ? 1 : 0}"></div>`;
      }
      const nums = !!s.source;
      const fig = `<div class="abs" style="left:${px(v ? gx : 120)};top:${px(v ? gy + gw + 24 : 300)};font:500 ${px(84 * u)}/1 ${DS.serif};color:${DS.ink}">${nums || s.show_count ? `${nf}<span style="color:${DS.soft};font-size:.5em"> / ${total}</span>` : ''}</div>`;
      const note = s.note ? dsNote(s.note.text || s.note, v ? gx + 250 : 120, v ? gy + gw + 90 : 460, lt, s.note.at ?? fa + fill / (s.rate ?? 40) + .2, s.note.red, u) : '';
      return { cover: true, front: `<div class="full"${cidOf(s)}>${dsPaper()}${dsTitle(s, lt, u, v)}${c}${fig}${note}${pencil(gx + (nf % cols + .5) * cell, gy + Math.floor(Math.max(0, nf - 1) / cols) * cell + cell * .5, -.62, 'red', lt, nf > 0 && nf < fill)}</div>` };
    },

    // Line chart drawn by the pencil (stroke grows linearly over `draw` s), points appear as reached, a red note on
    // the last point. values:[..], labels:[..].
    print_data_line(s, t, lt) {
      const { W, H, v, u } = G(), vals = s.values || [2, 3, 3.5, 5, 7, 9.5], labels = s.labels || [];
      const x0 = v ? 80 : 160, x1 = v ? 640 : 1120, yb = v ? 860 : 500, yt = v ? 400 : 190;
      const max = s.max ?? Math.max(...vals) * 1.1, min = s.min ?? 0;
      const pts = vals.map((val, i) => [x0 + (x1 - x0) * i / Math.max(1, vals.length - 1), yb - (yb - yt) * (val - min) / (max - min)]);
      const at = s.draw_at ?? .6, dur = s.draw ?? 1.4, k = clamp(prog(lt, at, dur));
      const seg = k * (pts.length - 1), si = Math.min(pts.length - 2, Math.floor(seg)), sk = seg - si;
      const tipP = k >= 1 ? pts[pts.length - 1] : [lerp(pts[si][0], pts[si + 1][0], sk), lerp(pts[si][1], pts[si + 1][1], sk)];
      const drawn = [...pts.slice(0, si + 1), tipP].map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
      const ka = clamp(prog(lt, .2, .4));
      const grid = [0, .25, .5, .75, 1].map(f => `<div class="abs" style="left:${px(x0)};top:${px(yb - (yb - yt) * f)};width:${px((x1 - x0) * ka)};height:${f ? 1 : 3}px;background:${f ? DS.rule : DS.ink}"></div>`).join('');
      const dots = pts.map((p, i) => (seg >= i - .001 ? `<div class="abs" style="left:${px(p[0] - 7)};top:${px(p[1] - 7)};width:14px;height:14px;border-radius:50%;background:${i === pts.length - 1 ? DS.red : DS.blue}"></div>` : '')).join('');
      const labs = labels.map((l, i) => `<div class="abs" style="left:${px(pts[i][0] - 50)};width:100px;top:${px(yb + 12)};text-align:center;font:400 ${px(24 * u)}/1 ${DS.mono};color:${DS.soft};opacity:${f3(ka)}">${esc(l)}</div>`).join('');
      const last = pts[pts.length - 1], n = s.note;
      const note = n ? dsNote(n.text || n, Math.max(40, last[0] - 330), last[1] - 70, lt, n.at ?? at + dur + .15, n.red ?? true, u, last[0] - 10, last[1] - 14) : '';
      const pen = lt < at + dur + .1 ? pencil(tipP[0], tipP[1], -.62, 'blue', lt, k > 0 && k < 1) : pencil(...arcTo(last, [W + 80, yt - 200], clamp((lt - at - dur - .1) / .5)), -.62, 'red', lt, false);
      return { cover: true, front: `<div class="full"${cidOf(s)}>${dsPaper()}${dsTitle(s, lt, u, v)}${grid}${labs}
        <svg class="abs" width="${W}" height="${H}" style="left:0;top:0"><polyline points="${drawn}" fill="none" stroke="${DS.blue}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/></svg>${dots}${note}${pen}</div>` };
    },

    // Pencil note on a paper slip above the head (over the face world): written left -> right, pencil at the tip.
    print_data_note(s, t, lt) {
      const { W, v, u } = G(), text = s.text || 'ghi chú tay', size = (s.size || 42) * u;
      const x = s.x ?? (v ? 50 : 80), y = s.y ?? (v ? 200 : 110);
      const wEst = chars(text).length * size * .5 + 60;
      const ks = back(prog(lt, 0, .3), 1.6), at = s.write_at ?? .25, dur = Math.max(.5, chars(text).length * .045), k = clamp(prog(lt, at, dur));
      const col = s.red ? DS.red : DS.blue;
      const pen = lt < at + dur + .25 ? pencil(x + 24 + (wEst - 40) * k, y + size * .2, -.62, s.red ? 'red' : 'blue', lt, k > 0 && k < 1) : '';
      return { front: `<div class="abs"${cidOf(s)} style="left:${px(x)};top:${px(y - size)};width:${px(wEst)};height:${px(size * 1.6)};background:${DS.paper};box-shadow:0 6px 16px rgba(0,0,0,.25);transform:rotate(${s.rot ?? -2}deg) scale(${f3(ks)});transform-origin:0 50%">
          <div class="abs" style="left:24px;top:${px(size * .2)};font:400 ${px(size)}/1.3 ${DS.hand};color:${col};white-space:nowrap;clip-path:inset(-20% ${((1 - k) * 100).toFixed(2)}% -30% -5%)">${esc(text)}</div></div>
        <div style="transform:rotate(0)">${pen}</div>` };
    },
  };

  // Caption: the figure caption on a paper band — mono kicker (figure number), a hairline rule drawing under it,
  // Playfair words appearing on their onsets (fade + 4 px rise over 0.125 s), two lines max.
  CAPTION_STYLES.print_data = (c, t) => {
    const { W, v } = G(), caps = TL.captions || [], idx = caps.indexOf(c), prev = idx > 0 ? caps[idx - 1] : null;
    const fresh = !prev || c.t0 - prev.t1 > .3, kr = fresh ? clamp(prog(t, c.t0, .3)) : 1;
    const L = chars(c.words.map(w => w.w).join(' ')).length, size = c.size || (v ? (L > 50 ? 32 : 38) : 34);
    const y = c.y ?? (v ? 990 : 590), x = v ? 40 : 80, w = v ? 640 : 1120;
    const kicker = c.kicker || (TL.data_kicker ? `${TL.data_kicker} · ` : '') + `HÌNH ${idx >= 0 ? idx + 1 : 1}`;
    const html = c.words.map(wd => { const k = clamp(prog(t, wd.s, .125)); return `<span style="display:inline-block;opacity:${f3(k)};transform:translateY(${((1 - k) * 4).toFixed(1)}px);${wd.hl ? `color:${DS.red};` : ''}">${esc(wd.w)}</span>`; }).join(' ');
    return `<div id="cap" class="print_data"${cidOf(c)} style="text-shadow:none;left:0;right:0;top:${px(y)};text-align:left">
      <div style="position:absolute;left:0;right:0;top:0;height:${px(size * 3.6)};background:rgba(246,243,236,.97);box-shadow:0 -1px 0 ${DS.rule}"></div>
      <div style="position:relative;margin-left:${px(x)};width:${px(w)};padding-top:${px(14)}">
        <div style="font:400 ${px(22 * (v ? 1 : .9))}/1 ${DS.mono};color:${DS.soft};letter-spacing:.08em;text-transform:uppercase">${esc(kicker)}</div>
        <div style="margin:10px 0 8px;height:1.5px;width:${(kr * 100).toFixed(1)}%;background:${DS.ink}"></div>
        <div style="font:${c.weight || 500} ${size}px/1.18 ${c.font || DS.serif};color:${c.color || DS.ink};max-height:${px(size * 2.4)};overflow:hidden">${html}</div></div></div>`;
  };

  Object.assign(MODULES, SWISS, DOSSIER, PAPER, KDOC, DATA);

  // =====================================================================================================
  // Studio metadata + recipe
  // =====================================================================================================
  const VARIANTS = {
    swiss: { caption: 'print_swiss', music: '' }, dossier: { caption: 'print_dossier', music: 'suspense' },
    paper: { caption: 'print_paper', music: 'mellow' }, kdoc: { caption: 'print_kdoc', music: 'mellow_2' }, data: { caption: 'print_data', music: '' },
  };
  const capStr = c => c.words.map(w => w.w).join(' ');
  const cleanTxt = s => { s = String(s || '').replace(/[.,!?;:]+$/, '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
  // first caption chunk at/after time T (text), for sample statements
  const capAt = (caps, T) => caps.find(c => c.t0 >= T - .05) || caps[caps.length - 1];
  const NUM_RE = /^\d+([.,]\d+)?%?$/;

  PACKS.push({
    id: P, name: 'Báo in & tư liệu (5 phong cách)', icon: '🗞️', caption: 'print_kdoc',
    desc: 'Năm phong cách in ấn quanh người nói: lưới Thuỵ Sĩ (Inter, một màu đỏ), hồ sơ mật (chấm halftone, con dấu), giấy thủ công (giấy gấp stop-motion), phim tài liệu (ảnh đen trắng, chữ hiện theo lời), câu chuyện số liệu (biểu đồ tự vẽ dưới bút chì). recipe_opts.variant = swiss | dossier | paper | kdoc | data',
    items: [
      { type: 'print_swiss_frame', label: 'Thuỵ Sĩ · Khung trang + bộ đếm', make: T => ({ type: 'print_swiss_frame', t0: T, t1: T + 8, title: 'Ba quy tắc thiết kế (ví dụ)', total: 3, chapters: [{ t: T, num: 1 }, { t: T + 4, num: 2 }] }) },
      { type: 'print_swiss_numeral', label: 'Thuỵ Sĩ · Thẻ chương số khổng lồ', make: T => ({ type: 'print_swiss_numeral', t0: T, t1: T + 2.4, num: 1, text: 'Bỏ bớt mọi thứ thừa', note: 'Chương một' }) },
      { type: 'print_swiss_rows', label: 'Thuỵ Sĩ · Danh sách kẻ dòng + cắt', make: T => ({ type: 'print_swiss_rows', t0: T, t1: T + 2.5, title: 'Việc cần bỏ', items: ['Lướt mạng lúc 2 giờ sáng', 'Họp không mục tiêu', 'Trả lời tin nhắn ngay'], stagger: .25, cut: 0, cut_at: 1.4 }) },
      { type: 'print_swiss_slab', label: 'Thuỵ Sĩ · Khối đỏ nhân vật chính', make: T => ({ type: 'print_swiss_slab', t0: T, t1: T + 2.5, text: 'Chiếc điện thoại của bạn', off_at: 1.5 }) },
      { type: 'print_swiss_cells', label: 'Thuỵ Sĩ · Lưới mang ý nghĩa', make: T => ({ type: 'print_swiss_cells', t0: T, t1: T + 2.5, text: 'Một ngày có 24 giờ', cols: 6, rows: 4, fill: 6, label: '24 ô = 24 giờ trong ngày', from_end: true }) },
      { type: 'print_dossier_frame', label: 'Hồ sơ · Khung HUD số hồ sơ + REC', make: T => ({ type: 'print_dossier_frame', t0: T, t1: T + 8, case: 'HỒ SƠ SỐ 001', chapters: [{ t: T, text: 'CHƯƠNG 1 · NGHI VẤN' }] }) },
      { type: 'print_dossier_page', label: 'Hồ sơ · Trang tang vật halftone', make: T => ({ type: 'print_dossier_page', t0: T, t1: T + 3, title: 'Thói quen lúc nửa đêm', exhibit: 'TANG VẬT 01', num: '01', label: 'Ghi chú: thức tới 2 giờ sáng (ví dụ)', stamp: 'ĐÁNG NGỜ', stamp_at: 2.1 }) },
      { type: 'print_dossier_suspect', label: 'Hồ sơ · Chân dung nghi phạm', make: T => ({ type: 'print_dossier_suspect', t0: T, t1: T + 2.8, icon: '📱', name: 'NGHI PHẠM', case: 'HỒ SƠ SỐ 001' }) },
      { type: 'print_dossier_board', label: 'Hồ sơ · Bảng chứng cứ + dây đỏ', make: T => ({ type: 'print_dossier_board', t0: T, t1: T + 3.4, title: 'Ba manh mối', items: [{ text: 'Ngủ muộn', icon: '🌙' }, { text: 'Ít vận động', icon: '🏃' }, { text: 'Căng thẳng', icon: '💢' }] }) },
      { type: 'print_dossier_stamp', label: 'Hồ sơ · Con dấu phán quyết', make: T => ({ type: 'print_dossier_stamp', t0: T, t1: T + 1.8, text: 'ĐÃ ĐÓNG HỒ SƠ' }) },
      { type: 'print_paper_sheet', label: 'Giấy · Trang báo mở góc', make: T => ({ type: 'print_paper_sheet', t0: T, t1: T + 3.2, title: 'Thành phố đông người', head: 'Sống giữa đám đông (ví dụ)', marks: [1], mark_at: 1.6, turn_out: true }) },
      { type: 'print_paper_turn', label: 'Giấy · Lật trang sang mặt người', make: T => ({ type: 'print_paper_turn', t0: T, t1: T + .9, title: 'Thành phố đông người', head: 'Sống giữa đám đông (ví dụ)' }) },
      { type: 'print_paper_card', label: 'Giấy · Ảnh in cuộn lên', make: T => ({ type: 'print_paper_card', t0: T, t1: T + 2.5, icon: '🏙️', label: 'Hà Nội, 2026 (ví dụ)', ellipse: true }) },
      { type: 'print_paper_marks', label: 'Giấy · Nét tay (mũi tên / gạch / khoanh)', make: T => ({ type: 'print_paper_marks', t0: T, t1: T + 2, kind: 'arrow', x: 560, y: 760, x2: 470, y2: 940 }) },
      { type: 'print_paper_rise', label: 'Giấy · Chữ trồi sau mép giấy', make: T => ({ type: 'print_paper_rise', t0: T, t1: T + 2, text: 'Cô đơn', sub: 'giữa hàng triệu người' }) },
      { type: 'print_kdoc_turn', label: 'Tài liệu · Trang xám câu chuyển', make: T => ({ type: 'print_kdoc_turn', t0: T, t1: T + 1.6, text: 'Nhưng rồi', red: 1 }) },
      { type: 'print_kdoc_print', label: 'Tài liệu · Ảnh in đen trắng + nhãn', make: T => ({ type: 'print_kdoc_print', t0: T, t1: T + 2.5, src: '', label: 'Năm 2015', sub: 'Ảnh minh hoạ (ví dụ)' }) },
      { type: 'print_kdoc_window', label: 'Tài liệu · Khung ảnh bước 3 cỡ', make: T => ({ type: 'print_kdoc_window', t0: T, t1: T + 2.2, src: '' }) },
      { type: 'print_kdoc_counter', label: 'Tài liệu · Số đếm đỏ', make: T => ({ type: 'print_kdoc_counter', t0: T, t1: T + 2.2, from: 0, to: 300, suffix: ' giờ', label: 'mỗi năm (ví dụ)' }) },
      { type: 'print_kdoc_type', label: 'Tài liệu · Trích dẫn máy chữ', make: T => ({ type: 'print_kdoc_type', t0: T, t1: T + 3, text: 'Chúng ta không thiếu thời gian, chỉ thiếu ưu tiên.', by: 'Câu nói (ví dụ)' }) },
      { type: 'print_data_bars', label: 'Số liệu · Biểu đồ cột tự vẽ', make: T => ({ type: 'print_data_bars', t0: T, t1: T + 3.2, title: 'Giờ dùng điện thoại mỗi ngày', unit: 'giờ', items: [{ label: '2019', value: 3 }, { label: '2021', value: 4.5 }, { label: '2023', value: 5 }, { label: '2025', value: 6 }], note: { text: 'tăng gấp đôi!', red: true } }) },
      { type: 'print_data_cells', label: 'Số liệu · Ô vuông lấp đầy', make: T => ({ type: 'print_data_cells', t0: T, t1: T + 3, title: '100 người thì có bao nhiêu?', fill: 30, show_count: true, note: { text: 'gần một phần ba' } }) },
      { type: 'print_data_line', label: 'Số liệu · Đường tăng trưởng', make: T => ({ type: 'print_data_line', t0: T, t1: T + 3.2, title: 'Thời gian dựng một video', values: [9, 7, 5, 3, 1.5, .3], labels: ['2020', '', '', '', '', 'nay'], note: { text: 'chỉ còn vài phút' } }) },
      { type: 'print_data_note', label: 'Số liệu · Ghi chú bút chì', make: T => ({ type: 'print_data_note', t0: T, t1: T + 2.2, text: 'nhớ con số này' }) },
    ],
    // Starter edit by variant (opts.variant): house frame / HUD over the whole video, 2-4 cards on caption keywords
    // (chapter words, numbers, "nhưng", list words), a flat or stamped ending.
    recipe: ctx => {
      const dur = ctx.dur, caps = ctx.captions || [], o = ctx.opts || {}, vt = VARIANTS[o.variant] ? o.variant : 'kdoc';
      const scenes = [], fx = [], busy = [];
      const free = (a, b) => a >= 0 && b <= dur - .2 && b - a >= .8 && !busy.some(([x, y]) => a < y + .25 && b > x - .25);
      const put = (s, block = true) => { if (!free(s.t0, s.t1)) return false; s.t0 = +s.t0.toFixed(2); s.t1 = +s.t1.toFixed(2); scenes.push(s); if (block) busy.push([s.t0, s.t1]); return true; };
      const kw = (list, after = 0) => findWord(caps, list, after);
      const title = ctx.title || (caps[0] ? cleanTxt(capStr(caps[0])) : 'Câu chuyện');
      const numWord = () => { for (const c of caps) for (const w of c.words) if (NUM_RE.test(w.w) && w.s > 2.5 && w.s < dur - 4) return { t: w.s, n: w.w, c }; return null; };
      const turnT = kw(['nhưng', 'tuy nhiên', 'thế nhưng', 'và rồi'], 2.5);
      const listT = kw(['thứ nhất', 'đầu tiên', 'bước', 'cách', 'việc cần'], 2.5);
      const nw = numWord();
      const mid = f => dur * f;
      const stmt = T => cleanTxt(capStr(capAt(caps, T) || { words: [{ w: title }] }));
      if (vt === 'swiss') {
        const ch = [kw(['thứ nhất', 'đầu tiên', 'trước kia'], 1), kw(['thứ hai', 'tiếp theo', 'bây giờ'], 4), kw(['cuối cùng', 'thứ ba', 'việc cần làm'], 8)].filter(x => x != null && x < dur - 3);
        const starts = (ch.length ? ch : [mid(.25), mid(.6)]).filter((x, i, a) => !i || x - a[i - 1] > 3.5).slice(0, 3);
        scenes.push({ type: 'print_swiss_frame', t0: 0, t1: dur, title, total: starts.length, chapters: starts.map((x, i) => ({ t: +(x + 2.4).toFixed(2), num: i + 1 })) });
        starts.forEach((x, i) => put({ type: 'print_swiss_numeral', t0: x, t1: x + 2.4, num: i + 1, text: stmt(x), note: `Chương ${i + 1}` }));
        if (nw) put({ type: 'print_swiss_cells', t0: nw.t, t1: nw.t + 2.4, text: stmt(nw.t), cols: 6, rows: 4, fill: Math.min(24, Math.max(1, Math.round(parseFloat(nw.n)) || 6)), label: 'mỗi ô là một đơn vị' });
        if (turnT != null) put({ type: 'print_swiss_slab', t0: turnT, t1: turnT + 2.4, text: stmt(turnT), off_at: 1.3 });
      } else if (vt === 'dossier') {
        scenes.push({ type: 'print_dossier_frame', t0: 2.6, t1: dur, case: o.case || 'HỒ SƠ SỐ 001', chapter: 'MỞ HỒ SƠ' });
        put({ type: 'print_dossier_page', t0: 0, t1: Math.min(2.6, dur * .3), title, exhibit: 'HỒ SƠ MẬT' });
        const s2 = kw(['điện thoại', 'ứng dụng', 'công cụ', 'tool', 'ai'], 3) ?? mid(.3);
        put({ type: 'print_dossier_suspect', t0: s2, t1: s2 + 2.8, icon: o.icon || '📱', name: 'NGHI PHẠM', case: o.case || 'HỒ SƠ SỐ 001', title: stmt(s2) });
        const s3 = listT ?? mid(.55);
        put({ type: 'print_dossier_page', t0: s3, t1: s3 + 3, title: stmt(s3), exhibit: 'TANG VẬT 01', num: nw ? nw.n : '01', stamp: 'ĐÁNG NGỜ', stamp_at: 2.1 });
        const vT = kw(['sự thật', 'thực ra', 'đúng', 'chính là'], 3);
        if (vT != null) put({ type: 'print_dossier_stamp', t0: vT, t1: vT + 1.8, text: 'ĐÃ XÁC MINH' }, false) && fx.push({ t: +(vT + .12).toFixed(2), type: 'punch', amp: .05 });
        if (!busy.some(([x, y]) => y > dur - 2.4)) scenes.push({ type: 'print_dossier_stamp', t0: +Math.max(0, dur - 2.2).toFixed(2), t1: dur, text: 'ĐÃ ĐÓNG HỒ SƠ', keep: true });
      } else if (vt === 'paper') {
        const h = Math.min(3.2, dur * .3);
        scenes.push({ type: 'print_paper_sheet', t0: 0, t1: h, title, head: o.head || 'Trang báo mẫu (ví dụ)', marks: [1], mark_at: 1.5, turn_out: true });
        busy.push([0, h]);
        if (turnT != null) put({ type: 'print_paper_rise', t0: turnT, t1: turnT + 1.8, text: (capAt(caps, turnT)?.words.slice(1, 3).map(w => w.w).join(' ')) || 'Nhưng', sub: stmt(turnT) });
        const nT = kw(['thành phố', 'ảnh', 'video', 'clip', 'sản phẩm'], h + 1) ?? mid(.4);
        put({ type: 'print_paper_card', t0: nT, t1: nT + 2.5, icon: o.icon || '🎞️', label: cleanTxt(capStr(capAt(caps, nT))).split(' ').slice(0, 3).join(' '), ellipse: true });
        const eT = Math.max(h + 3, dur - 4);
        put({ type: 'print_paper_sheet', t0: eT, t1: eT + 2.6, title: '', head: title, paper: 'letter', turn_out: true, slow: true });
      } else if (vt === 'data') {
        put({ type: 'print_data_note', t0: .4, t1: 2.8, text: o.note || title }, false);
        const b = nw ? nw.t : mid(.35);
        put({ type: 'print_data_bars', t0: b, t1: b + 3.2, title: stmt(b), items: [{ label: 'A', value: 3 }, { label: 'B', value: 5 }, { label: 'C', value: 4 }, { label: 'D', value: 8 }], note: { text: 'tăng mạnh', red: true } });
        const l = kw(['bây giờ', 'nhanh', 'tăng', 'giảm', 'chỉ'], b + 4) ?? mid(.7);
        put({ type: 'print_data_line', t0: l, t1: l + 3.2, title: stmt(l), values: [9, 7, 5, 3, 1.5, .4], note: { text: 'gần như bằng 0' } });
      } else { // kdoc
        const p1 = kw(['video', 'clip', 'ảnh', 'hình ảnh'], 2) ?? mid(.2);
        put({ type: 'print_kdoc_window', t0: p1, t1: p1 + 2.2, src: o.image || '', label: cleanTxt(capAt(caps, p1)?.words[0]?.w || 'Ảnh') });
        if (turnT != null) put({ type: 'print_kdoc_turn', t0: turnT - .05, t1: turnT + 1.4, text: (capAt(caps, turnT)?.words.slice(0, 2).map(w => w.w).join(' ')) || 'Nhưng', red: 1 });
        if (nw) put({ type: 'print_kdoc_counter', t0: nw.t, t1: nw.t + 2, from: 0, to: parseFloat(nw.n.replace(',', '.')) || 10, label: stmt(nw.t).split(' ').slice(0, 4).join(' ') });
        const q = Math.max(4, dur - 6);
        put({ type: 'print_kdoc_type', t0: q, t1: q + 3, text: stmt(q), by: o.by || '' });
      }
      return { caption_style: VARIANTS[vt].caption, music: o.music ?? VARIANTS[vt].music, scenes, fx };
    },
  });
})();
