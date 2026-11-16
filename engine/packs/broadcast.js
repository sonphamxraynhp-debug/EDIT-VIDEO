// Pack "broadcast" — four TV-broadcast looks for a talking head, rewritten for this engine from the ghost-editor recipes
// (MIT, kurbaitaev) which adapt lemo-opuscar styles by LemoLab (MIT): caption-news, news-package, telestrator, hologram-hud.
// Sub-styles (ctx.opts.variant): 'capnews' | 'package' | 'tele' | 'holo'. Modules bc_capnews_*, bc_pkg_*, bc_tele_*, bc_holo_*.
// Captions: bc_capnews (lower-band slabs, one keyword on a honey block), bc_tele (one-line subtitle bar), bc_holo (HUD plate);
// 'package' runs without word captions (the strap carries the headline). Doc: references/pack-broadcast.md.
// Full-frame cards draw their own signature entrance/exit (ledger slide, band wipe, slanted wipe, power-on slit) and are
// placed with cut:true so the engine envelope does not add a second fade on top. Design space 720×1280 (16:9: 1280×720).
(() => {
  const P = 'broadcast';
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const f1 = v => (+v).toFixed(1), f3 = v => (+v).toFixed(3);
  const brand = () => (typeof TL !== 'undefined' && TL && TL.brand) || {};
  const chars = v => Array.from(String(v ?? '').normalize('NFC'));
  const alpha = (c, p) => `color-mix(in srgb,${c} ${p}%,transparent)`;
  // font size that fits `text` in maxW (k = average advance in em), clamped to [min, size]
  const fit = (text, maxW, size, min, k = .56) => Math.max(min, Math.min(size, maxW / (Math.max(1, chars(text).length) * k)));
  // item time: absolute `t` (re-timed by applyTemplate) or `at` seconds after the scene start
  const itT = (s, it, dflt) => (it && it.t != null ? it.t : s.t0 + (it && it.at != null ? it.at : dflt));
  const sT = (s, key, dflt) => (s[key + '_t'] != null ? s[key + '_t'] : s.t0 + (s[key + '_at'] ?? dflt));
  const tokens = v => String(v ?? '').match(/\|[^|]+\||\S+/g) || [];
  const fold = v => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const faceBox = () => { const f = (TL && TL.face) || { x: 360, y: 560 }; return { x0: f.x - 165, x1: f.x + 165, y0: f.y - 220, y1: f.y + 270, f }; };
  // own signature entrance/exit progress for full-frame cards (cut:true): 0 → 1 in, 0 → 1 out
  const ioK = (s, t, din = .3, dout = .3) => ({
    i: s.t0 > .05 ? E.inOutSine(clamp((t - s.t0) / din)) : 1,
    o: s.keep ? 0 : E.inOutSine(clamp((t - (s.t1 - dout)) / dout)),
  });

  // ---------- line icons (24×24, stroke) shared by every sub-style ----------
  const ICONS = {
    mail: 'M3 6h18v12H3z M3 7l9 6 9-6', chat: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5', feed: 'M4 4h16v16H4z M4 9h16 M9 9v11',
    phone: 'M7 2h10v20H7z M11 18h2', clock: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 7v5l3 2', book: 'M3 5h7l2 2 2-2h7v14h-7l-2 1-2-1H3z M12 7v13',
    moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z', heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', cup: 'M5 8h12v6a6 6 0 0 1-12 0z M17 10h2a2 2 0 0 1 0 4h-2 M8 3v3 M12 3v3',
    video: 'M3 6h13v12H3z M16 10l5-3v10l-5-3', user: 'M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8z M4 21a8 8 0 0 1 16 0',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', check: 'M4 12l5 5L20 6',
    bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 21h4', text: 'M5 5h14 M12 5v14 M9 19h6',
    spark: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M6 18l2.5-2.5 M15.5 8.5L18 6',
    cursor: 'M5 3l14 8-6 2-2 6z', cut: 'M6 9a3 3 0 1 0 0-6a3 3 0 1 0 0 6z M6 21a3 3 0 1 0 0-6a3 3 0 1 0 0 6z M8.5 7.5L20 19 M8.5 16.5L20 5',
    chart: 'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3', money: 'M3 7h18v10H3z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
    home: 'M3 11l9-7 9 7 M5 10v10h14V10', play: 'M7 5l12 7-12 7z',
  };
  const icon = (name, size, color, sw = 2) => (ICONS[name]
    ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="display:block;fill:none;stroke:${color};stroke-width:${sw};stroke-linecap:round;stroke-linejoin:round;overflow:visible"><path d="${ICONS[name]}"/></svg>`
    : `<span style="display:inline-block;font-size:${Math.round(size * .8)}px;line-height:1">${esc(name || '•')}</span>`);
  const ICON_WORDS = [['thong bao', 'bell'], ['tin nhan', 'chat'], ['email', 'mail'], ['thu ', 'mail'], ['dien thoai', 'phone'], ['thoi gian', 'clock'],
    ['phut', 'clock'], ['gio', 'clock'], ['sach', 'book'], ['ngu', 'moon'], ['suc khoe', 'heart'], ['video', 'video'], ['clip', 'video'], ['cong cu', 'bolt'],
    ['edit', 'cut'], ['cat', 'cut'], ['phong chu', 'text'], ['chu', 'text'], ['keo tha', 'cursor'], ['keo', 'cursor'], ['hieu ung', 'spark'], ['ai ', 'spark'],
    ['ca phe', 'cup'], ['tien', 'money'], ['nha', 'home'], ['nguoi', 'user'], ['tang', 'chart'], ['so lieu', 'chart']];
  const iconFor = v => { const f = ' ' + fold(v) + ' '; const m = ICON_WORDS.find(([k]) => f.includes(' ' + k.trim() + (k.endsWith(' ') ? ' ' : ''))); return m ? m[1] : 'star'; };

  // ---------- caption helpers ----------
  const STOP = new Set(['va', 'la', 'cua', 'cac', 'nhung', 'mot', 'thi', 'ma', 'co', 'duoc', 'cho', 'voi', 'nay', 'do', 'roi', 'da', 'se', 'dang', 'chung',
    'ta', 'toi', 'ban', 'minh', 'nhe', 'de', 'trong', 'khi', 'cung', 'nhu', 'khong', 'vao', 'ra', 'tu', 'den', 'lai', 'the', 'viec', 'gi', 'nao', 'bay',
    'gio', 'chi', 'can', 'deu', 'biet', 'rang', 'sau', 'truoc', 'kia', 'day', 'moi', 'xong', 'vai', 'nhung', 'cac', 'ay', 'nua', 'qua', 'rat', 'lam']);
  const clean = w => fold(w).replace(/[^\p{L}\p{N}]/gu, '');
  function kwIndex(words) {
    const h = words.findIndex(w => w.hl); if (h >= 0) return h;
    let best = -1, bl = 0;
    words.forEach((w, i) => { const c = clean(w.w); if (!c || STOP.has(c)) return; const L = /\d/.test(c) ? 99 : c.length + i * .01; if (L >= 3 && L > bl) { bl = L; best = i; } });
    return best;
  }
  function chunks(words) {
    const n = words.length, m = n <= 2 ? 1 : n <= 5 ? 2 : 3, out = [];
    let i = 0;
    for (let c = 0; c < m; c++) { const take = Math.round((n - i) / (m - c)); out.push(words.slice(i, i + take).map((w, j) => ({ ...w, i: i + j }))); i += take; }
    return out.filter(g => g.length);
  }
  const capText = c => c.words.map(w => w.w).join(' ');
  const short = (v, n = 22) => { let s = String(v).replace(/[.,!?]+$/, '').trim(); if (chars(s).length > n) { s = chars(s).slice(0, n).join('').replace(/\s+\S*$/, ''); } return s.charAt(0).toUpperCase() + s.slice(1); };

  // =====================================================================================================================
  // 1. CAPTION NEWS — the speaker's face as shot, huge captions slammed onto the lower band chunk by chunk, one keyword on a
  //    honey block; ledger-sheet cutaways (document + highlighter, lit grid, ruled list), title sting that becomes the bug.
  // =====================================================================================================================
  const CN = (s = {}) => ({
    ink: '#0E0E0C', ivory: '#F7F5EF', honey: s.color || brand().primary || '#FFC21A', loss: '#FF4A3D', grey: '#8D8B83', muted: '#5E5C55',
    sheet: '#151512', desk: '#23221E', panel: '#1E1D19', edge: '#3A3933', slab: 'rgba(14,14,12,.84)', rule: 'rgba(255,255,255,.05)',
    margin: 'rgba(255,74,61,.42)', font: "'Inter Tight','Be Vietnam Pro',sans-serif",
  });
  const kwBlock = (p, html, k, inkOn, pad = '.02em .14em') => `<span style="position:relative;display:inline-block;padding:${pad}">
    <i style="position:absolute;left:0;right:0;top:.06em;bottom:0;background:${p.honey};transform:scaleX(${f3(k)});transform-origin:0 50%"></i>
    <span style="position:relative;color:${inkOn ? p.ink : p.ivory}">${html}</span></span>`;
  // ledger sheet (or desk) card sliding in from the right with honey speed streaks, slow push 1 → 1.03, sliding out left
  function sheet(s, t, lt, inner, bg) {
    const p = CN(s), [W, H] = DIMS(), io = ioK(s, t), x = (1 - io.i) * 100 - io.o * 100;
    const push = lerp(1, 1.03, prog(lt, 0, Math.max(1, s.t1 - s.t0)));
    const paper = bg || `background-color:${p.sheet};background-image:linear-gradient(90deg,transparent 50px,${p.margin} 50px 52px,transparent 52px 57px,${p.margin} 57px 59px,transparent 59px),repeating-linear-gradient(180deg,transparent 0 35px,${p.rule} 35px 36px)`;
    let streaks = '';
    if (io.i < 1) {
      const ex = x / 100 * W;
      streaks = [.24, .47, .71, .86].map((fy, j) => { const len = (1 - io.i) * W * (.35 + .12 * j); return `<div class="abs" style="left:${f1(ex - len - 6)}px;top:${f1(H * fy)}px;width:${f1(len)}px;height:${3 + j * 2}px;background:linear-gradient(90deg,transparent,${p.honey});opacity:${f3(1 - io.i)}"></div>`; }).join('');
    }
    return {
      back: `<div class="full"${cidOf(s)} style="transform:translateX(${f3(x)}%);overflow:hidden"><div class="full" style="${paper}"></div>
        <div class="full" style="transform:scale(${f3(push)});transform-origin:50% 45%">${inner}</div></div>${streaks}`,
      cover: io.i >= 1 && io.o <= 0,
    };
  }
  const sourceTag = (p, label, kicker, k, y, x = 43, size = 26) => `<div class="abs" style="left:${x}px;top:${y}px;display:flex;font-family:${p.font};font-size:${size}px;line-height:1;white-space:nowrap;clip-path:inset(-10px ${f1((1 - k) * 100)}% -10px 0)">
    <span style="background:${p.honey};color:${p.ink};font-weight:900;padding:.34em .4em .28em;letter-spacing:.02em">${esc(kicker || 'NGUỒN')}</span>
    <span style="background:${p.ink};color:${p.ivory};font-weight:600;padding:.34em .5em .28em">${esc(label)}</span></div>`;

  const CAPNEWS = {
    // Frame-start hook: lines stacked on ink slabs in the lower band, each slamming in 1.3 → 1; |word| = giant honey block.
    // lines[] | text ('a / b / |c|'); without text it uses the captions under the scene (the speaker's own words).
    bc_capnews_hook(s, t, lt) {
      const p = CN(s), v = VERT(), maxw = v ? 634 : 900;
      let lines = s.lines || (s.text ? String(s.text).split('/') : null);
      if (!lines) {
        const cs = (TL.captions || []).filter(c => c.t1 > s.t0 + .02 && c.t0 < s.t1 - .05).slice(0, 3);
        const words = cs.flatMap(c => c.words); const ki = kwIndex(words);
        lines = chunks(words).map(g => g.map(w => (w.i === ki ? `|${w.w}|` : w.w)).join(' '));
        if (!lines.length) lines = ['Tin |mới|'];
      }
      lines = lines.map(l => String(l).trim()).filter(Boolean);
      const ks = s.kw_scale ?? 1.45, st = s.stagger ?? .13, d0 = s.delay ?? .13;
      const width = l => chars(l.replace(/\|[^|]+\|/g, '')).length * .56 + chars((l.match(/\|([^|]+)\|/) || [, ''])[1]).length * .6 * ks + .6;
      const size = Math.max(36, Math.min(s.size || (v ? 70 : 64), ...lines.map(l => maxw / width(l))));
      const html = lines.map((l, i) => {
        const at = s.t0 + d0 + i * st, k = E.outBack(prog(t, at, .13), 1.6), o = clamp(prog(t, at, .04)), kwAt = at + .18;
        const inner = esc(l).replace(/\|([^|]+)\|/g, (_, w) => `<span style="font-size:${ks}em;line-height:1.1">${kwBlock(p, w, E.outCubic(prog(t, kwAt, .12)), t >= kwAt + .08, '.04em .16em 0')}</span>`).replace(/\|/g, '');
        return `<div style="display:flex"><div style="background:${p.slab};padding:.06em .24em .1em;white-space:nowrap;opacity:${f3(o)};transform:scale(${f3(lerp(1.3, 1, k))});transform-origin:0 100%">${inner}</div></div>`;
      }).join('');
      const x = s.x ?? (v ? 43 : 64), y = s.y ?? (v ? 1120 : 650);
      return { front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;width:${maxw}px;transform:translateY(-100%);display:flex;flex-direction:column;align-items:flex-start;gap:${Math.round(size * .1)}px;
        font-family:${p.font};font-weight:900;font-size:${f1(size)}px;line-height:1.16;letter-spacing:-.02em;color:${p.ivory}">${html}</div>`, hideCaptions: true };
    },

    // Title sting: a honey ruled page (red double margin) wipes over the bottom band, title words slam one by one (|word| in an
    // ink block), a dark chip follows, then the page wipes off left (the title lives on as bc_capnews_badge).
    bc_capnews_sting(s, t, lt) {
      const p = CN(s), [W, H] = DIMS(), v = VERT(), top = s.top ?? (v ? clamp(((TL.face && TL.face.y) || 560) + 250, 760, 900) : 380);
      const kin = E.inOutSine(prog(lt, 0, .24)), kout = E.inOutSine(prog(t, s.t1 - .32, .24));
      let rules = '';
      for (let y = 36, i = 0; top + y < H; y += 36, i++) rules += `<div style="position:absolute;left:0;top:${y}px;height:2px;width:${f1(E.outCubic(prog(lt, .08 + i * .03, .3)) * 100)}%;background:rgba(14,14,12,.13)"></div>`;
      const mk = E.outCubic(prog(lt, .12, .4)) * 100;
      const marg = `<div style="position:absolute;left:52px;top:0;width:2px;height:${f1(mk)}%;background:${p.loss};opacity:.75"></div><div style="position:absolute;left:58px;top:0;width:2px;height:${f1(mk)}%;background:${p.loss};opacity:.75"></div>`;
      const tk = tokens(s.title || 'BẢN TIN |HÔM NAY|'), size = s.size || (v ? 66 : 60);
      const words = tk.map((w, i) => {
        const at = s.t0 + .3 + i * .12, k = E.outBack(prog(t, at, .13), 1.6), o = clamp(prog(t, at, .04)), m = /^\|.*\|$/.test(w), txt = esc(w.replace(/\|/g, ''));
        return `<span style="display:inline-block;margin:0 .22em .08em 0;opacity:${f3(o)};transform:scale(${f3(lerp(1.3, 1, k))});transform-origin:0 100%;${m ? `background:${p.ink};color:${p.honey};padding:.04em .16em 0` : ''}">${txt}</span>`;
      }).join('');
      const ca = s.t0 + .3 + tk.length * .12 + .15, ck = E.outCubic(prog(t, ca, .25));
      const chip = s.chip ? `<div style="display:inline-block;margin-top:18px;background:${p.ink};color:${p.ivory};font-weight:900;font-size:28px;line-height:1;letter-spacing:.04em;padding:.36em .5em .3em;text-transform:uppercase;opacity:${f3(ck)};transform:translateY(${f1((1 - ck) * 16)}px)">${esc(s.chip)}</div>` : '';
      const page = `<div class="abs"${cidOf(s)} style="left:0;top:${top}px;width:${W}px;height:${H - top}px;background:${p.honey};box-shadow:0 -12px 40px rgba(0,0,0,.35);
        clip-path:inset(-60px ${f1((1 - kin) * 100)}% 0 0);transform:translateX(${f1(-kout * 100)}%)">${rules}${marg}
        <div style="position:absolute;left:84px;right:36px;top:${v ? 44 : 30}px;font-family:${p.font};font-weight:900;font-size:${size}px;line-height:1.14;letter-spacing:-.02em;color:${p.ink}">${words}<br>${chip}</div></div>`;
      return { front: page, hideCaptions: true };
    },

    // Channel bug top left (honey block + dark chip, caps) from the sting to the end.
    bc_capnews_badge(s, t, lt) {
      const p = CN(s), v = VERT(), k = E.outCubic(prog(lt, 0, .3));
      return { front: `<div class="abs"${cidOf(s)} style="left:${s.x ?? (v ? 43 : 48)}px;top:${s.y ?? (v ? 84 : 40)}px;display:flex;font-family:${p.font};font-weight:900;font-size:${s.size || 28}px;line-height:1;letter-spacing:.01em;text-transform:uppercase;white-space:nowrap;
        opacity:${f3(k)};transform:translateX(${f1((1 - k) * -24)}px)"><span style="background:${p.honey};color:${p.ink};padding:.34em .4em .28em">${esc(s.a ?? 'BẢN TIN')}</span>${s.b ? `<span style="background:${p.ink};color:${p.ivory};padding:.34em .4em .28em">${esc(s.b)}</span>` : ''}</div>` };
    },

    // Source tag under the bug (NGUỒN + label), slides in left to right.
    bc_capnews_source(s, t, lt) {
      const p = CN(s), v = VERT();
      return { front: `<div${cidOf(s)}>${sourceTag(p, s.label || 'Nguồn', s.kicker, E.inOutSine(prog(lt, 0, .22)), s.y ?? (v ? 140 : 88), s.x ?? (v ? 43 : 48), s.size || 26)}</div>` };
    },

    // Document on a dark desk: the paper (src image, or drawn kicker/title/lines) tilted −1.5°, push .94 → 1; highlighter
    // sweeps on hl:[{line:'title'|i, t|at}]; the key words re-set in a tilted honey block (block, block_t|block_at); source tag.
    bc_capnews_doc(s, t, lt) {
      const p = CN(s), [W] = DIMS(), v = VERT();
      const bw = s.w ?? (v ? 520 : 400), bh = s.h ?? (v ? 620 : 470), cx = s.x ?? W / 2, cy = s.y ?? (v ? 520 : 330);
      const push = lerp(.94, 1, E.outCubic(prog(lt, 0, Math.max(1.2, s.t1 - s.t0))));
      const hlK = key => { const h = (s.hl || []).find(x => String(x.line) === String(key)); return h ? E.inOutSine(prog(t, itT(s, h, .8), h.dur ?? .4)) : 0; };
      const hl = (key, html) => { const k = hlK(key); return `<span style="position:relative;display:inline;padding:0 .1em;background:linear-gradient(${p.honey},${p.honey}) 0 60%/${f1(k * 100)}% 78% no-repeat;-webkit-box-decoration-break:clone;box-decoration-break:clone">${html}</span>`; };
      const body = s.src
        ? `<img src="${media(s.src, t)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
        : `<div style="position:absolute;inset:0;padding:34px 34px;font-family:${p.font};color:#1d1c19">
            <div style="font-weight:700;font-size:17px;letter-spacing:.18em;color:#77756c;text-transform:uppercase">${esc(s.kicker || 'Tài liệu mẫu')}</div>
            <div style="height:3px;background:#1d1c19;margin:12px 0 16px"></div>
            <div style="font-weight:900;font-size:${f1(fit(s.title || '', (bw - 68) * 2.6, 34, 24, .55))}px;line-height:1.22;letter-spacing:-.01em">${hl('title', esc(s.title || 'Tiêu đề tài liệu'))}</div>
            <div style="margin-top:18px;font-weight:500;font-size:21px;line-height:1.55;color:#3b3a35">${(s.lines || []).map((l, i) => `<div style="margin-bottom:6px">${hl(i, esc(l))}</div>`).join('')}</div>
            ${Array.from({ length: 4 }, (_, i) => `<div style="height:10px;margin-top:14px;width:${[92, 80, 88, 55][i]}%;background:#e3e0d6;border-radius:3px"></div>`).join('')}</div>`;
      const paper = `<div class="abs" style="left:${cx - bw / 2}px;top:${cy - bh / 2}px;width:${bw}px;height:${bh}px;background:#F4F1E8;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.6),0 2px 0 rgba(255,255,255,.4) inset;transform:rotate(${s.tilt ?? -1.5}deg) scale(${f3(push)})">${body}</div>`;
      let block = '';
      if (s.block) {
        const bt = sT(s, 'block', 1.6), k = E.outCubic(prog(t, bt, .14));
        block = `<div class="abs" style="left:${s.block_x ?? (v ? 43 : cx + bw / 2 + 30)}px;top:${s.block_y ?? (v ? cy + bh / 2 + 26 : cy - 40)}px;max-width:${v ? 634 : 420}px;transform:rotate(-2deg);opacity:${f3(clamp(k * 3))};
          font-family:${p.font};font-weight:900;font-size:${f1(fit(s.block, v ? 600 : 400, 46, 30, .6))}px;line-height:1.12;letter-spacing:-.02em;text-transform:uppercase">${kwBlock(p, esc(s.block), k, t >= bt + .08, '.12em .3em .08em')}</div>`;
      }
      const src = s.source ? sourceTag(p, s.source, s.source_kicker, E.inOutSine(prog(lt, .35, .22)), v ? 140 : 88, v ? 43 : 48) : '';
      const desk = `background:radial-gradient(ellipse at 50% 38%,#34322c,${p.desk} 58%,#121210)`;
      const r = sheet(s, t, lt, paper + block + src, desk);
      return r;
    },

    // Lit grid on the ledger: panels (icon + label) rise staggered and light up on their word: honey border/label, red badge.
    // items:[{icon,label,badge,t|at}] (2–4), title, kicker.
    bc_capnews_grid(s, t, lt) {
      const p = CN(s), [W] = DIMS(), v = VERT(), items = (s.items || []).slice(0, 4), n = items.length || 1;
      const x = v ? 43 : 140, w = v ? 634 : 1000, top = s.top ?? (v ? 330 : 190), ph = s.ph ?? (v ? (n <= 3 ? 150 : 124) : 90), gap = v ? 18 : 14;
      const panels = items.map((it, i) => {
        const T = itT(s, it, .7 + i * .7), rk = E.outCubic(prog(lt, .15 + i * .1, .35)), lit = t >= T, lk = E.outCubic(prog(t, T, .15));
        const col = lit ? p.honey : p.grey, bk = it.badge != null ? E.outBack(prog(t, T + .08, .28), 2.4) : 0;
        const badge = it.badge != null && lit ? `<div style="position:absolute;right:-10px;top:-10px;min-width:40px;height:40px;padding:0 8px;border-radius:20px;background:${p.loss};color:#fff;font-weight:900;font-size:24px;line-height:40px;text-align:center;transform:scale(${f3(bk)})">${esc(it.badge)}</div>` : '';
        return `<div style="position:absolute;left:${x}px;top:${top + i * (ph + gap)}px;width:${w}px;height:${ph}px;background:${p.panel};border:3px solid ${lit ? p.honey : p.edge};border-radius:6px;display:flex;align-items:center;gap:26px;padding:0 28px;
          opacity:${f3(rk)};transform:translateY(${f1((1 - rk) * 53)}px);box-shadow:${lit ? `0 0 ${f1(24 * lk)}px ${alpha(p.honey, 30)}` : 'none'}">
          <div style="position:relative;flex:none">${icon(it.icon || iconFor(it.label || ''), Math.round(ph * .52), col, 2.2)}${badge}</div>
          <div style="font-weight:900;font-size:${f1(fit(it.label, w - ph - 90, v ? 46 : 40, 28, .58))}px;line-height:1.2;color:${col};white-space:nowrap">${esc(it.label)}</div></div>`;
      }).join('');
      const title = s.title ? `<div class="abs" style="left:${x}px;top:${top - (v ? 92 : 70)}px;width:${w}px;font-weight:900;font-size:${v ? 40 : 34}px;line-height:1.2;color:${p.ivory};letter-spacing:-.01em">${s.kicker ? `<div style="font-size:.55em;color:${p.grey};letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px">${esc(s.kicker)}</div>` : ''}${esc(s.title)}</div>` : '';
      return sheet(s, t, lt, `<div class="full" style="font-family:${p.font}">${title}${panels}</div>`);
    },

    // Ruled list on the ledger: numeral slams, honey bar grows from the left on its word, the previous bar turns ivory.
    // items:[{text,t|at}] (2–4), title.
    bc_capnews_list(s, t, lt) {
      const p = CN(s), v = VERT(), items = (s.items || []).slice(0, 4).map(it => (typeof it === 'string' ? { text: it } : it)), n = items.length || 1;
      const top = s.top ?? (v ? 300 : 150), step = v ? (n <= 3 ? 172 : 140) : 120, bx = v ? 140 : 220, bw = v ? 520 : 820, bh = v ? 100 : 84;
      const Ts = items.map((it, i) => itT(s, it, .6 + i * .8));
      let last = -1; Ts.forEach((T, i) => { if (t >= T) last = i; });
      const rows = items.map((it, i) => {
        const T = Ts[i], nk = E.outBack(prog(t, T, .16), 2), gk = E.outCubic(prog(t, T + .04, .3)), y = top + 130 + i * step;
        return `<div style="position:absolute;left:${v ? 43 : 120}px;top:${y}px;width:90px;height:${bh}px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:${v ? 84 : 72}px;line-height:1;color:${p.honey};opacity:${f3(clamp(nk * 2))};transform:scale(${f3(lerp(1.5, 1, clamp(nk, 0, 1.1)))})">${i + 1}</div>
          <div style="position:absolute;left:${bx}px;top:${y}px;width:${bw}px;height:${bh}px;border-bottom:2px solid ${alpha(p.ivory, 12)}"></div>
          <div style="position:absolute;left:${bx}px;top:${y}px;width:${f1(bw * gk)}px;height:${bh}px;background:${i === last ? p.honey : p.ivory};overflow:hidden;display:flex;align-items:center">
            <span style="padding:0 24px;white-space:nowrap;font-weight:900;font-size:${f1(fit(it.text, bw - 48, v ? 40 : 36, 26, .57))}px;line-height:1.2;color:${p.ink};letter-spacing:-.01em">${esc(it.text)}</span></div>`;
      }).join('');
      const title = s.title ? `<div style="position:absolute;left:${v ? 43 : 120}px;right:${v ? 43 : 120}px;top:${top}px;font-weight:900;font-size:${f1(fit(s.title, v ? 1268 : 1900, v ? 48 : 44, 32, .56))}px;line-height:1.18;color:${p.ivory};letter-spacing:-.02em">${esc(s.title)}</div>` : '';
      return sheet(s, t, lt, `<div class="full" style="font-family:${p.font}">${title}${rows}</div>`);
    },
  };

  // No word captions (news package: the strap carries the words). Shared: any template may set caption_style "none".
  CAPTION_STYLES.none = () => '';

  // Caption: one caption at a time in the lower band, 1–3 chunks stacked on ink slabs, each slamming in on its first word;
  // one keyword per caption (w.hl, else the strongest word) on a honey block wiping left → right. The last caption (verdict) is 1.2×.
  CAPTION_STYLES.bc_capnews = (c, t) => {
    const p = CN(c), v = VERT(), all = TL.captions || [], verdict = all.length > 2 && all[all.length - 1].t0 === c.t0;
    const maxw = v ? 634 : 900, gs = chunks(c.words), kw = kwIndex(c.words);
    const size0 = (c.size || (v ? 54 : 50)) * (verdict ? 1.2 : 1);
    const size = Math.max(36, Math.min(size0, ...gs.map(g => (maxw - 24) / (chars(g.map(w => w.w).join(' ')).length * .57 + .6))));
    const lines = gs.map(g => {
      const s0 = g[0].s, k = E.outBack(prog(t, s0, .13), 1.6), o = clamp(prog(t, s0 - .01, .04));
      const ws = g.map(w => {
        if (w.i !== kw) return `<span style="color:${w.hl ? p.honey : c.color || p.ivory}">${esc(w.w)}</span>`;
        const ks = Math.max(s0 + .13, w.s) + .05;
        return kwBlock(p, esc(w.w), E.outCubic(prog(t, ks, .12)), t >= ks + .08);
      }).join(' ');
      return `<div style="display:flex"><div style="background:${p.slab};padding:.05em .24em .1em;white-space:nowrap;opacity:${f3(o)};transform:scale(${f3(lerp(1.3, 1, k))});transform-origin:0 100%">${ws}</div></div>`;
    }).join('');
    const left = c.x != null ? c.x - maxw / 2 : v ? 43 : 64, bottom = c.y ?? (v ? 1120 : 660);
    return `<div id="cap" class="bc_capnews"${cidOf(c)} style="left:${left}px;right:auto;top:${bottom}px;width:${maxw}px;transform:translateY(-100%);display:flex;flex-direction:column;align-items:flex-start;gap:${Math.round(size * .1)}px;
      font-family:${c.font || p.font};font-weight:${c.weight || 900};font-size:${f1(size)}px;line-height:1.16;letter-spacing:-.02em;text-align:left;text-shadow:none">${lines}</div>`;
  };

  // =====================================================================================================================
  // 2. NEWS PACKAGE — the speaker as the anchor of a one-story segment: a plate sting that becomes the bug, a lemon-tab strap
  //    on the chest that flips its headline, a rundown that returns ticked, full-frame one-fact cards joined by the band wipe.
  // =====================================================================================================================
  const PK = (s = {}) => {
    const lemon = s.color || brand().primary || '#F2CF1D';
    return {
      ink: '#121417', ink2: '#1B1E23', ink3: '#22262C', line: '#454B55', lemon, lemonL: `color-mix(in srgb,${lemon} 72%,#fff)`, lemonD: `color-mix(in srgb,${lemon} 84%,#000)`,
      gold: '#D4B064', paper: '#F4F1E8', olive: '#6E5A1E', grey: '#C9CCD2', grey2: '#8A909A',
      head: "'Inter Tight','Be Vietnam Pro',sans-serif", cond: "'Oswald','Be Vietnam Pro',sans-serif", mono: "'JetBrains Mono',monospace",
    };
  };
  const studioBg = (p, lt) => `background-color:${p.ink};background-image:radial-gradient(circle at 86% 6%,${alpha(p.lemon, 20)},transparent 48%),radial-gradient(rgba(255,255,255,.075) 1.4px,transparent 1.9px),repeating-linear-gradient(115deg,transparent 0 150px,rgba(255,255,255,.028) 150px 240px);
    background-size:100% 100%,24px 24px,100% 100%;background-position:0 0,0 0,${f1(lt * 14)}px 0`;
  const band = (p, x, H) => `<div class="abs" style="left:${f1(x)}px;top:-10px;width:68px;height:${H + 20}px;display:flex;box-shadow:0 0 30px rgba(0,0,0,.4)"><div style="width:56px;background:${p.lemon}"></div><div style="width:3px;background:${p.ink}"></div><div style="width:9px;background:${p.gold}"></div></div>`;
  const cornerTag = (p, txt) => `<div class="abs" style="left:40px;top:96px;display:flex;align-items:center;gap:12px;background:rgba(18,20,23,.82);padding:10px 16px 10px 0;font-family:${p.mono};font-weight:600;font-size:24px;letter-spacing:3px;color:${p.gold};text-transform:uppercase"><i style="width:6px;align-self:stretch;background:${p.gold}"></i>${esc(txt)}</div>`;
  // band wipe in (picture revealed left of the band) / out (the face revealed left of the band)
  function pkgCard(s, t, lt, inner) {
    const p = PK(s), [W, H] = DIMS(), io = ioK(s, t);
    let clip = '', b = '';
    if (io.i < 1) { const bx = lerp(-68, W, io.i); clip = `clip-path:inset(0 ${f1(Math.max(0, W - bx))}px 0 0);`; b = band(p, bx, H); }
    else if (io.o > 0) { const bx = lerp(-68, W, io.o); clip = `clip-path:inset(0 0 0 ${f1(Math.max(0, bx + 68))}px);`; b = band(p, bx, H); }
    return {
      back: `<div class="full"${cidOf(s)} style="${clip}overflow:hidden"><div class="full" style="${studioBg(p, lt)}"></div>${inner}${s.schematic ? cornerTag(p, s.schematic === true ? 'SƠ ĐỒ' : s.schematic) : ''}</div>`,
      front: b || undefined, cover: io.i >= 1 && io.o <= 0,
    };
  }
  // text pushed up out of a mask (padding keeps Vietnamese stacked diacritics inside the mask)
  const pushUp = (html, k, extra = '') => `<div style="overflow:hidden;padding-top:.28em;margin-top:-.28em;${extra}"><div style="transform:translateY(${f1((1 - k) * 115)}%)">${html}</div></div>`;
  const pkStamp = (p, s, t, x, y) => {
    if (!s.stamp) return '';
    const st = sT(s, 'stamp', 2.2); if (t < st) return '';
    const k = E.outCubic(prog(t, st, .16)), o = clamp(prog(t, st, .05)), rk = prog(t, st + .05, .45);
    return `<div class="abs" style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(-8deg) scale(${f3(lerp(1.9, 1, k))});opacity:${f3(o)}">
      <div style="position:absolute;left:50%;top:50%;width:300px;height:150px;border:3px solid ${p.lemon};border-radius:50%;transform:translate(-50%,-50%) scale(${f3(.8 + rk * 1.3)});opacity:${f3(1 - rk)}"></div>
      <div style="position:relative;background:${p.ink};border:3px solid ${p.lemon};outline:3px solid ${p.lemon};outline-offset:5px;padding:.22em .55em .16em;text-align:center;font-family:${p.cond};font-weight:700;font-size:${s.stamp_size || 44}px;line-height:1.12;color:${p.lemon};text-transform:uppercase;white-space:nowrap;letter-spacing:.04em">
      ${esc(s.stamp)}${s.stamp_sub ? `<div style="color:${p.paper};font-size:.56em;font-weight:600;letter-spacing:.1em">${esc(s.stamp_sub)}</div>` : ''}</div></div>`;
  };
  // The plate: lemon parallelogram with an ink bar + a gold bar, channel word in condensed caps (letters drop when lt0 given).
  function plate(p, word, cx, cy, sc, lt0, glint) {
    const w = 347, h = 120, sl = 34;
    const letters = chars(word).map((ch, i) => {
      const k = lt0 == null ? 1 : E.outBack(prog(lt0, .1 + i * .06, .22), 2);
      return `<span style="display:inline-block;transform:translateY(${f1((1 - k) * -50)}px);opacity:${f3(clamp(k * 1.5))}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`;
    }).join('');
    const gl = glint != null && glint > 0 && glint < 1 ? `<div style="position:absolute;top:-20px;bottom:-20px;left:${f1(lerp(-80, w + 40, glint))}px;width:46px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);transform:skewX(-18deg)"></div>` : '';
    return `<div class="abs" style="left:${f1(cx)}px;top:${f1(cy)}px;width:${w}px;height:${h}px;transform:translate(-50%,-50%) scale(${f3(sc)})">
      <div style="position:absolute;inset:0;overflow:hidden;clip-path:polygon(${sl}px 0,100% 0,calc(100% - ${sl}px) 100%,0 100%);background:linear-gradient(180deg,${p.lemonL},${p.lemonD})">
        <div style="position:absolute;inset:0;clip-path:polygon(${sl + 10}px 0,${sl + 26}px 0,26px 100%,10px 100%);background:${p.ink}"></div>
        <div style="position:absolute;inset:0;clip-path:polygon(${sl + 30}px 0,${sl + 38}px 0,38px 100%,30px 100%);background:${p.gold}"></div>${gl}</div>
      <div style="position:absolute;left:58px;right:30px;top:0;bottom:0;display:flex;align-items:center;justify-content:center;font-family:${p.cond};font-weight:700;font-size:${Math.round(fit(word, 250, 60, 36, .5))}px;line-height:1;padding-top:.1em;color:${p.ink};letter-spacing:.03em;white-space:nowrap">${letters}</div></div>`;
  }
  const bugPos = (s, v) => ({ x: s.bug_x ?? (v ? 548 : 1130), y: s.bug_y ?? (v ? 118 : 66), sc: s.bug_scale ?? .42 });

  const PKG = {
    // Sting → bug: slashes, the plate slams in (×1.35 → 1), letters drop, the wordmark opens from the centre with a mono
    // dateline, a glint, then (fly_at, default 1.25 s) the plate flies to the bug position while the band wipes the studio off the
    // face, and waits there (start bc_pkg_badge ~0.35 s after fly_at). title, dateline, word.
    bc_pkg_sting(s, t, lt) {
      const p = PK(s), [W, H] = DIMS(), v = VERT(), fly0 = s.fly_at ?? 1.25, fly1 = fly0 + .32;
      const c0 = { x: W / 2, y: v ? 520 : 300 }, bug = bugPos(s, v), word = s.word || 'LÊN SÓNG';
      const slam = E.outBack(prog(lt, 0, .22), 2.2), fk = E.inOutSine(prog(lt, fly0, fly1 - fly0));
      const sc = lerp(lerp(1.35, 1, clamp(slam, 0, 1.2)), bug.sc, fk), rot = lerp(2.5, 0, clamp(slam)) * (1 - fk);
      const pl = `<div class="full" style="transform-origin:${f1(lerp(c0.x, bug.x, fk))}px ${f1(lerp(c0.y, bug.y, fk))}px;transform:rotate(${f1(rot)}deg)">${plate(p, word, lerp(c0.x, bug.x, fk), lerp(c0.y, bug.y, fk), sc, lt, prog(lt, .45, .23))}</div>`;
      const rk = prog(lt, .16, .39), ring = rk > 0 && rk < 1 ? `<div class="abs" style="left:${c0.x}px;top:${c0.y}px;width:420px;height:150px;border:4px solid ${p.lemon};border-radius:50%;transform:translate(-50%,-50%) scale(${f3(.7 + rk * 1.4)});opacity:${f3(1 - rk)}"></div>` : '';
      const slash = (dl, y) => { const k = prog(lt, dl, .28); return k > 0 && k < 1 ? `<div class="abs" style="left:${f1(lerp(-W * .8, W * 1.1, E.outCubic(k)))}px;top:${y}px;width:${W * .7}px;height:26px;background:${p.lemon};transform:skewX(-30deg) rotate(-12deg);opacity:${f3(1 - k)}"></div>` : ''; };
      const wo = E.outCubic(prog(lt, .26, .2)) * (1 - E.inCubic(prog(lt, fly0 - .2, .16)));
      const mark = `<div class="abs" style="left:0;width:${W}px;top:${c0.y + 92}px;text-align:center;clip-path:inset(-20px ${f1((1 - wo) * 50)}% -20px ${f1((1 - wo) * 50)}%)">
        <div style="font-family:${p.head};font-weight:800;font-size:${f1(fit(s.title || 'CHỦ ĐỀ HÔM NAY', W - 80, 46, 28, .78))}px;line-height:1.25;letter-spacing:.12em;color:${p.paper};text-transform:uppercase;white-space:nowrap">${esc(s.title || 'CHỦ ĐỀ HÔM NAY')}</div>
        ${s.dateline !== '' ? `<div style="margin-top:12px;font-family:${p.mono};font-weight:600;font-size:22px;letter-spacing:3px;color:${p.gold};text-transform:uppercase;white-space:nowrap">${esc(s.dateline || 'MỘT CHỦ ĐỀ · MỘT BẢN TIN')}</div>` : ''}</div>`;
      const wk = E.inOutSine(prog(lt, fly0, .3)), bx = lerp(-68, W, wk);
      const bg = `<div class="full"${cidOf(s)} style="${wk > 0 ? `clip-path:inset(0 0 0 ${f1(Math.max(0, bx + 68))}px);` : ''}${studioBg(p, lt)}"></div>`;
      return { back: bg + slash(0, v ? 360 : 200) + slash(.04, v ? 690 : 420) + ring, front: mark + pl + (wk > 0 && wk < 1 ? band(p, bx, H) : ''), cover: wk <= 0, hideCaptions: true };
    },

    // The same plate parked top right as the bug until the end (a glint every `glint_every` s).
    bc_pkg_badge(s, t, lt) {
      const p = PK(s), v = VERT(), b = bugPos(s, v), ge = s.glint_every ?? 7;
      return { front: `<div${cidOf(s)}>${plate(p, s.word || 'LÊN SÓNG', s.x ?? b.x, s.y ?? b.y, s.scale ?? b.sc, null, ge ? prog(lt % ge, ge - .5, .45) : null)}</div>` };
    },

    // Lower-third strap on the chest: lemon category tab, paper body with a lemon bar, headline + olive sub-line, ink end block;
    // flips to the next item (new words up from below, 0.32 s; the tab flashes white on a new category).
    // items:[{t|at, tab, head, sub, source}] — or tab/head/sub/source on the scene.
    bc_pkg_strap(s, t, lt) {
      const p = PK(s), v = VERT();
      const items = (s.items && s.items.length ? s.items : [{ tab: s.tab, head: s.head, sub: s.sub, source: s.source }]).map((it, i) => ({ ...it, T: itT(s, it, i ? i * 3 : 0) }));
      let cur = 0; items.forEach((it, i) => { if (t >= it.T) cur = i; });
      const it = items[cur], prev = cur > 0 && t >= it.T ? items[cur - 1] : null, fk = prev ? E.outCubic(prog(t, it.T, .32)) : 1;
      const x0 = s.x ?? (v ? 40 : 70), w = v ? 533 : 820, endW = v ? 80 : 110, tabY = s.y ?? (v ? 878 : 500), tabH = 46, bodyY = tabY + tabH, bodyH = v ? 112 : 96, tw = w - 48;
      const ke = E.outCubic(prog(lt, 0, .35)), tk = E.outBack(prog(lt, .1, .3), 1.6);
      const flash = prev && prev.tab !== it.tab && t - it.T < .1;
      const textBlock = q => `<div style="position:absolute;inset:0;padding:${q.sub ? 14 : 30}px 0 0 34px">
        <div style="font-family:${p.head};font-weight:800;font-size:${f1(fit(q.head || '', tw, v ? 40 : 38, 26, .58))}px;line-height:1.25;color:${p.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q.head || '')}</div>
        ${q.sub ? `<div style="margin-top:4px;font-family:${p.cond};font-weight:600;font-size:26px;line-height:1.2;letter-spacing:1.5px;color:${p.olive};text-transform:uppercase;white-space:nowrap;overflow:hidden">${esc(q.sub)}</div>` : ''}</div>`;
      const layer = (q, y) => `<div style="position:absolute;inset:0;transform:translateY(${f1(y)}%)">${textBlock(q)}</div>`;
      const body = prev && fk < 1 ? layer(prev, -fk * 100) + layer(it, (1 - fk) * 100) : layer(it, 0);
      const tabTxt = q => `<span style="white-space:nowrap">${esc(q.tab || 'HÔM NAY')}</span>`;
      const tabInner = prev && fk < 1 && prev.tab !== it.tab
        ? `<div style="position:relative;overflow:hidden;height:1.3em"><div style="transform:translateY(${f1(-fk * 100)}%)">${tabTxt(prev)}</div><div style="position:absolute;left:0;top:0;transform:translateY(${f1((1 - fk) * 100)}%)">${tabTxt(it)}</div></div>`
        : `<div style="height:1.3em">${tabTxt(it)}</div>`;
      const src = it.source ? `<div style="position:absolute;right:0;top:${bodyH + 12}px;background:${p.ink};padding:8px 14px;font-family:${p.mono};font-weight:600;font-size:22px;letter-spacing:2px;color:${p.gold};text-transform:uppercase;white-space:nowrap">${esc(s.source_kicker || 'NGUỒN')}: ${esc(it.source)}</div>` : '';
      return { front: `<div class="abs"${cidOf(s)} style="left:${x0}px;top:${tabY}px;width:${w + endW}px">
        <div style="display:inline-block;height:${tabH}px;padding:0 18px;background:${flash ? '#fff' : p.lemon};color:${p.ink};font-family:${p.cond};font-weight:600;font-size:28px;line-height:${tabH + 2}px;letter-spacing:2px;text-transform:uppercase;transform:scaleY(${f3(clamp(tk, 0, 1.2))});transform-origin:0 100%">${tabInner}</div>
        <div style="position:relative;width:${w + endW}px;height:${bodyH}px;clip-path:inset(0 ${f1((1 - ke) * 100)}% -60px 0)">
          <div style="position:absolute;left:0;top:0;width:${w}px;height:${bodyH}px;background:${p.paper};box-shadow:0 8px 0 rgba(0,0,0,.28);overflow:hidden"><i style="position:absolute;left:0;top:0;bottom:0;width:12px;background:${p.lemon}"></i>${body}</div>
          <div style="position:absolute;left:${w}px;top:0;width:${endW}px;height:${bodyH}px;background:${p.ink};border-top:4px solid ${p.lemon};display:flex;align-items:center;justify-content:center;text-align:center;font-family:${p.cond};font-weight:600;font-size:21px;line-height:1.25;letter-spacing:1px;color:${p.paper}">${esc(s.word || 'LÊN SÓNG').replace(' ', '<br>')}</div>${src}</div></div>`,
      hideCaptions: true };
    },

    // Rundown: tab, big count + unit, mono line, title, numbered rows flipping in with a mono timecode; recap:true = the same
    // object with each row ticked (lemon disc + ink check) at its t|at. items:[{text, tc, t|at}].
    bc_pkg_rundown(s, t, lt) {
      const p = PK(s), [W] = DIMS(), v = VERT(), items = (s.items || []).slice(0, 4).map(it => (typeof it === 'string' ? { text: it } : it)), n = items.length, recap = !!s.recap;
      const x = v ? 40 : 300, w = v ? 640 : 680, ty = v ? 190 : 70;
      const k0 = E.outCubic(prog(lt, .25, .3)), k1 = E.outCubic(prog(lt, .4, .32)), k2 = E.outCubic(prog(lt, .5, .32));
      const head = `<div class="abs" style="left:${x}px;top:${ty}px;width:${w}px">
        <div style="display:inline-block;padding:0 16px;height:44px;line-height:46px;background:${p.lemon};color:${p.ink};font-family:${p.cond};font-weight:600;font-size:28px;letter-spacing:2px;text-transform:uppercase;transform:scaleX(${f3(k0)});transform-origin:0 50%">${esc(s.tab || (recap ? 'TÓM TẮT' : 'HÔM NAY'))}</div>
        ${pushUp(`<div style="display:flex;align-items:baseline;gap:16px;font-family:${p.cond};font-weight:700;line-height:1.1"><span style="font-size:${v ? 110 : 90}px;color:${p.lemon}">${String(n).padStart(2, '0')}</span><span style="font-size:${v ? 44 : 38}px;color:${p.paper};letter-spacing:1px;text-transform:uppercase">${esc(s.unit || 'Ý CHÍNH')}</span></div>`, k1, 'margin-top:10px')}
        ${s.mono ? `<div style="margin-top:4px;font-family:${p.mono};font-weight:600;font-size:22px;letter-spacing:3px;color:${p.grey2};text-transform:uppercase;opacity:${f3(k2)}">${esc(s.mono)}</div>` : ''}
        ${s.title ? pushUp(`<div style="font-family:${p.head};font-weight:800;font-size:${f1(fit(s.title, w, v ? 42 : 36, 28, .58))}px;line-height:1.2;color:${p.paper};white-space:nowrap">${esc(s.title)}</div>`, k2, 'margin-top:10px') : ''}</div>`;
      const ry = v ? 560 : 330, rh = v ? 72 : 62, gap = 12;
      const rows = items.map((it, i) => {
        const k = E.outBack(prog(lt, .6 + i * .22, .3), 2), sw = prog(lt, .6 + i * .22, .45);
        const T = itT(s, it, 1 + i * .6), tk = recap && t >= T ? E.outBack(prog(t, T, .25), 2.6) : 0;
        return `<div style="position:absolute;left:${x}px;top:${ry + i * (rh + gap)}px;width:${w}px;height:${rh}px;background:${p.ink2};border-top:4px solid ${p.lemon};display:flex;align-items:center;overflow:hidden;
          transform:scaleY(${f3(lerp(.02, 1, clamp(k, 0, 1.15)))});opacity:${f3(clamp(k * 3))}">
          <div style="flex:none;width:84px;height:100%;background:${p.ink3};display:flex;align-items:center;justify-content:center;font-family:${p.cond};font-weight:700;font-size:44px;line-height:1;padding-top:.06em;color:${p.lemon}">${String(i + 1).padStart(2, '0')}</div>
          <div style="flex:1;min-width:0;padding:0 18px;font-family:${p.head};font-weight:800;font-size:${f1(fit(it.text, w - 260, 34, 24, .58))}px;line-height:1.25;color:${p.paper};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.text)}</div>
          ${recap ? `<div style="flex:none;width:44px;height:44px;margin-right:14px;border-radius:50%;border:2px solid ${alpha(p.lemon, 50)};position:relative"><div style="position:absolute;inset:-2px;border-radius:50%;background:${p.lemon};transform:scale(${f3(tk)});display:flex;align-items:center;justify-content:center">${icon('check', 28, p.ink, 3.4)}</div></div>` : ''}
          ${it.tc ? `<div style="flex:none;padding-right:18px;font-family:${p.mono};font-weight:600;font-size:22px;letter-spacing:1px;color:${p.grey2}">${esc(it.tc)}</div>` : ''}
          ${sw > 0 && sw < 1 ? `<div style="position:absolute;top:0;bottom:0;left:${f1(lerp(-30, 110, sw))}%;width:22%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.14),transparent)"></div>` : ''}</div>`;
      }).join('');
      return pkgCard(s, t, lt, head + rows);
    },

    // Split-flap board: eyebrow + title push up, tiles flip from `from` to `to` (top half folds down, bottom unfolds, 0.05 s
    // apart) at flip_t|flip_at; a lemon label lands; optional stamp (stamp, stamp_sub, stamp_t|stamp_at).
    bc_pkg_flap(s, t, lt) {
      const p = PK(s), [W] = DIMS(), v = VERT();
      const A = chars(String(s.from ?? 'BẬT').toUpperCase()), B = chars(String(s.to ?? 'TẮT').toUpperCase()), n = Math.max(A.length, B.length);
      while (A.length < n) A.push(' '); while (B.length < n) B.push(' ');
      const gap = 10, tw = Math.min(v ? 100 : 110, ((v ? 640 : 900) - (n - 1) * gap) / n), th = tw * 1.5, bx = (W - (n * tw + (n - 1) * gap)) / 2, by = v ? 470 : 260;
      const ft = sT(s, 'flip', 1.3);
      const glyph = ch => `<div style="position:absolute;inset:0;background:linear-gradient(180deg,${p.ink3},#1a1d22);border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:${p.cond};font-weight:700;font-size:${f1(tw * .74)}px;line-height:1;padding-top:.12em;color:${p.paper}">${ch === ' ' ? '' : esc(ch)}</div>`;
      const half = (ch, top, extra = '') => `<div style="position:absolute;inset:0;clip-path:inset(${top ? '0 0 50% 0' : '50% 0 0 0'});${extra}">${glyph(ch)}</div>`;
      const tiles = A.map((a, i) => {
        const b = B[i], fs = ft + i * .05, p1 = prog(t, fs, .08), p2 = prog(t, fs + .08, .08), ek = E.outCubic(prog(lt, .35 + i * .05, .3));
        let html;
        if (a === b || t < fs) html = glyph(t < fs ? a : b);
        else if (t >= fs + .16) html = glyph(b);
        else html = half(b, true) + half(p2 > 0 ? a : a, false) + (p1 < 1 ? half(a, true, `transform:scaleY(${f3(1 - p1)});transform-origin:50% 50%`) : '') + (p2 > 0 ? half(b, false, `transform:scaleY(${f3(p2)});transform-origin:50% 50%`) : '');
        return `<div style="position:absolute;left:${f1(bx + i * (tw + gap))}px;top:${by}px;width:${f1(tw)}px;height:${f1(th)}px;opacity:${f3(ek)};transform:translateY(${f1((1 - ek) * 40)}px)">${html}
          <i style="position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:rgba(0,0,0,.65)"></i></div>`;
      }).join('');
      const k1 = E.outCubic(prog(lt, .15, .32)), k2 = E.outCubic(prog(lt, .25, .32));
      const head = `<div class="abs" style="left:${v ? 40 : 160}px;right:${v ? 40 : 160}px;top:${v ? 230 : 70}px">
        ${s.eyebrow ? `<div style="font-family:${p.mono};font-weight:600;font-size:24px;letter-spacing:3px;color:${p.gold};text-transform:uppercase;opacity:${f3(k1)}">${esc(s.eyebrow)}</div>` : ''}
        ${pushUp(`<div style="font-family:${p.head};font-weight:800;font-size:${f1(fit(s.title || '', (v ? 640 : 960) * 2, v ? 52 : 46, 32, .58))}px;line-height:1.2;color:${p.paper}">${esc(s.title || '')}</div>`, k2, 'margin-top:8px')}</div>`;
      const lt2 = ft + n * .05 + .25, lk = E.outBack(prog(t, lt2, .3), 1.8);
      const label = s.label ? `<div class="abs" style="left:${W / 2}px;top:${by + th + 50}px;transform:translateX(-50%) scale(${f3(clamp(lk, 0, 1.2))});opacity:${f3(clamp(lk * 2))};background:${p.lemon};color:${p.ink};padding:.3em .7em .26em;font-family:${p.head};font-weight:800;font-size:34px;line-height:1.15;white-space:nowrap;text-transform:uppercase">${esc(s.label)}</div>` : '';
      return pkgCard(s, t, lt, head + tiles + label + pkStamp(p, s, t, s.stamp_x ?? W * .66, s.stamp_y ?? (by + th + 210)));
    },

    // Accent-edged ink cards (2–3) push up on their words, each with a line icon; a gold bracket joins them to a summary
    // line (|word| = lemon) at summary_t|summary_at; optional stamp. items:[{icon, text, t|at}].
    bc_pkg_cards(s, t, lt) {
      const p = PK(s), [W] = DIMS(), v = VERT(), items = (s.items || []).slice(0, 3), n = items.length || 1;
      const x0 = v ? 40 : 200, tw = v ? 640 : 880, gap = 18, cw = (tw - (n - 1) * gap) / n, ch = v ? 230 : 200, cy = v ? 420 : 210;
      const cards = items.map((it, i) => {
        const k = E.outCubic(prog(t, itT(s, it, .6 + i * .6), .32));
        return `<div style="position:absolute;left:${f1(x0 + i * (cw + gap))}px;top:${cy}px;width:${f1(cw)}px;height:${ch}px;overflow:hidden">
          <div style="position:absolute;inset:0;background:${p.ink2};border-top:6px solid ${p.lemon};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:0 10px;transform:translateY(${f1((1 - k) * 100)}%)">
            ${icon(it.icon || iconFor(it.text || ''), 70, p.lemon, 2)}
            <div style="font-family:${p.head};font-weight:800;font-size:${f1(fit(it.text, (cw - 20) * 1.9, 32, 22, .58))}px;line-height:1.2;color:${p.paper};text-align:center">${esc(it.text)}</div></div></div>`;
      }).join('');
      const st = sT(s, 'summary', .6 + n * .6 + .5), bk = E.inOutSine(prog(t, st, .35)), by = cy + ch + 22;
      const bracket = `<svg class="abs" style="left:0;top:0;overflow:visible" width="${W}" height="10"><path d="M${x0 + 4} ${by} v22 H${x0 + tw - 4} v-22 M${W / 2} ${by + 22} v26" fill="none" stroke="${p.gold}" stroke-width="4" pathLength="1" stroke-dasharray="${f3(bk)} 1"/></svg>`;
      const sk = E.outCubic(prog(t, st + .2, .32));
      const sum = s.summary ? `<div class="abs" style="left:${x0}px;width:${tw}px;top:${by + 66}px;text-align:center">${pushUp(`<div style="font-family:${p.head};font-weight:800;font-size:${f1(fit(s.summary, tw * 1.8, 44, 30, .58))}px;line-height:1.22;color:${p.paper}">${esc(s.summary).replace(/\|([^|]+)\|/g, `<span style="background:${p.lemon};color:${p.ink};padding:0 .14em">$1</span>`)}</div>`, sk)}</div>` : '';
      const k1 = E.outCubic(prog(lt, .15, .32)), k2 = E.outCubic(prog(lt, .25, .32));
      const head = `<div class="abs" style="left:${x0}px;width:${tw}px;top:${v ? 230 : 60}px">
        ${s.eyebrow ? `<div style="font-family:${p.mono};font-weight:600;font-size:24px;letter-spacing:3px;color:${p.gold};text-transform:uppercase;opacity:${f3(k1)}">${esc(s.eyebrow)}</div>` : ''}
        ${pushUp(`<div style="font-family:${p.head};font-weight:800;font-size:${f1(fit(s.title || '', tw * 1.9, v ? 52 : 44, 30, .58))}px;line-height:1.2;color:${p.paper}">${esc(s.title || '')}</div>`, k2, 'margin-top:8px')}</div>`;
      return pkgCard(s, t, lt, head + bracket + cards + sum + pkStamp(p, s, t, s.stamp_x ?? W * .68, s.stamp_y ?? (by + 190)));
    },
  };

  // =====================================================================================================================
  // 3. TELESTRATOR — a TV analysis segment: the speaker's footage plays, then FREEZES (a true still of that frame) and gets
  //    drawn on around the face (ring, marker arrows, red zone, one label); dark tactics boards between; show packaging.
  // =====================================================================================================================
  const TE = (s = {}) => ({
    yellow: s.color || brand().primary || '#FFD400', cyan: '#3FD8FF', red: '#FF3B30', chalk: '#F4F1E8', board: '#0C1411', card: 'rgba(8,12,14,.9)', grey: '#8C948F',
    label: "'Inter Tight','Be Vietnam Pro',sans-serif", cond: "'Oswald','Be Vietnam Pro',sans-serif", mono: "'JetBrains Mono',monospace",
  });
  const role = (p, r) => ({ yellow: p.yellow, cyan: p.cyan, red: p.red, chalk: p.chalk })[r] || r || p.yellow;
  const boardBg = p => `background-color:${p.board};background-image:linear-gradient(rgba(244,241,232,.07) 1.5px,transparent 1.5px),linear-gradient(90deg,rgba(244,241,232,.07) 1.5px,transparent 1.5px);background-size:40px 40px;background-position:-1px -1px`;
  const rewT = (s, t) => Math.max(0, s.t0 - (s.span ?? 3) * E.inOutSine(clamp((t - s.t0) / Math.max(.4, s.t1 - s.t0 - .25))));
  // slanted yellow wipe: the board is revealed left of the band's centre line on the way in, right of it on the way out
  function teleCard(s, t, lt, inner) {
    const p = TE(s), [W, H] = DIMS(), io = ioK(s, t, .36, .36), bw = 280, off = H * Math.tan(14 * Math.PI / 180);
    const at = k => lerp(-bw - off / 2, W + bw + off / 2, k);
    let clip = '', b = '';
    const bandAt = xc => `<div class="abs" style="left:${f1(xc - bw / 2)}px;top:-40px;width:${bw}px;height:${H + 80}px;transform:skewX(-14deg);background:${p.yellow};border-left:9px solid #0b0f0d;border-right:9px solid #0b0f0d"></div>`;
    if (io.i < 1) { const xc = at(io.i); clip = `clip-path:polygon(0 0,${f1(xc + off / 2)}px 0,${f1(xc - off / 2)}px 100%,0 100%);`; b = bandAt(xc); }
    else if (io.o > 0) { const xc = at(io.o); clip = `clip-path:polygon(${f1(xc + off / 2)}px 0,100% 0,100% 100%,${f1(xc - off / 2)}px 100%);`; b = bandAt(xc); }
    return { back: `<div class="full"${cidOf(s)} style="${clip}overflow:hidden"><div class="full" style="${boardBg(p)}"></div>${inner}</div>`, front: b || undefined, cover: io.i >= 1 && io.o <= 0 };
  }
  // marker line along pts (drawn over dur, arrowhead pops in the last 10 %), dashed = intended / future path
  function marker(p, a, k, id, W, H) {
    if (k <= 0 || !a.pts || a.pts.length < 2) return '';
    const col = role(p, a.color || 'yellow'), w = a.w ?? 7;
    const pts = a.pts.map(([x, y], i) => [x + (i ? (rnd(i * 7.3 + x) - .5) * 3 : 0), y + (i ? (rnd(i * 3.1 + y) - .5) * 3 : 0)]);
    const d = 'M' + pts.map(q => `${f1(q[0])} ${f1(q[1])}`).join(' L');
    const [ax, ay] = pts[pts.length - 2], [bx, by] = pts[pts.length - 1], ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI, hk = a.head === false ? 0 : E.outBack(clamp((k - .88) / .12), 2);
    const reveal = `stroke-dasharray="${f3(k)} 2" pathLength="1"`;
    const mask = a.dashed ? `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><path d="${d}" fill="none" stroke="#fff" stroke-width="${w + 12}" stroke-linecap="round" ${reveal}/></mask>` : '';
    const seg = (stroke, sw, extra = '') => a.dashed
      ? `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="26 16" mask="url(#${id})" ${extra}/>`
      : `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${reveal} ${extra}/>`;
    const head = hk > 0 ? `<g transform="translate(${f1(bx)} ${f1(by)}) rotate(${f1(ang)}) scale(${f3(hk)})"><path d="M6 0 L-22 -15 L-16 0 L-22 15 Z" fill="${col}" stroke="rgba(0,0,0,.55)" stroke-width="3" stroke-linejoin="round"/></g>` : '';
    return `${mask}${seg('rgba(0,0,0,.55)', w + 6)}${seg(col, w, `style="filter:drop-shadow(0 0 6px ${alpha(col, 70)})"`)}${seg('rgba(255,255,255,.75)', Math.max(1.5, w * .28))}${head}`;
  }
  function ringSvg(p, r, k, lt) {
    if (k <= 0) return '';
    const col = role(p, r.color || 'yellow'), R = r.r ?? 70, ry = R * .36, pk = lerp(.6, 1, E.outBack(clamp(k * 1.4), 2));
    return `<g transform="translate(${r.x} ${r.y}) scale(${f3(pk)})">
      <ellipse rx="${f1(R * 1.22)}" ry="${f1(ry * 1.22)}" fill="none" stroke="${col}" stroke-width="3" stroke-dasharray="14 10" stroke-dashoffset="${f1(-lt * 40)}" opacity="${f3(clamp(k * 2) * .8)}"/>
      <ellipse rx="${R}" ry="${f1(ry)}" fill="${alpha(col, 16)}" stroke="rgba(0,0,0,.5)" stroke-width="10" pathLength="1" stroke-dasharray="${f3(k)} 2"/>
      <ellipse rx="${R}" ry="${f1(ry)}" fill="none" stroke="${col}" stroke-width="6" pathLength="1" stroke-dasharray="${f3(k)} 2" style="filter:drop-shadow(0 0 6px ${alpha(col, 70)})"/></g>`;
  }
  function teleLabel(p, L, k, guard) {
    if (!L || k <= 0) return '';
    const col = role(p, L.color || 'yellow'), [W] = DIMS(), big = L.big || '', small = L.small || '';
    const bs = fit(big, W - 140, L.size || 46, 30, .62), w = Math.max(chars(big).length * bs * .62, chars(small).length * 30 * .5) + 60;
    let x = L.x ?? 40, y = L.y ?? 230;
    if (guard) { const b = faceBox(); if (x < b.x1 && x + w > b.x0 && y + 110 > b.y0 && y < b.y1) y = y < b.f.y ? Math.max(90, b.y0 - 120) : b.y1 + 10; }
    return `<div class="abs" style="left:${x}px;top:${y}px;display:flex;background:${p.card};clip-path:inset(0 ${f1((1 - k) * 100)}% 0 0);box-shadow:0 10px 30px rgba(0,0,0,.4)">
      <i style="flex:none;width:10px;background:${col}"></i><div style="padding:12px 22px 14px 18px">
      ${big ? `<div style="font-family:${p.label};font-weight:900;font-size:${f1(bs)}px;line-height:1.15;color:${p.chalk};white-space:nowrap;text-transform:uppercase">${esc(big)}</div>` : ''}
      ${small ? `<div style="margin-top:4px;font-family:${p.cond};font-weight:600;font-size:28px;line-height:1.2;letter-spacing:3px;color:${col};white-space:nowrap;text-transform:uppercase">${esc(small)}</div>` : ''}</div></div>`;
  }

  const TELE = {
    // Show packaging on every frame: corner bug (show name + ● TRỰC TIẾP / PHÂN TÍCH / XEM LẠI, picked automatically from the
    // freeze / board / rewind scenes on screen), source clock (▶ running, ❚❚ on a freeze, ◀◀ counting back; real time + frame),
    // matchup bar (sides[2], the yellow leader flips once at flip_t with a flash). show, sides, lead (0|1), flip_t.
    bc_tele_chrome(s, t, lt) {
      const p = TE(s), [W, H] = DIMS(), v = VERT();
      const act = (TL.scenes || []).filter(x => !x.hidden && t >= x.t0 && t < x.t1 && /^bc_tele_(freeze|board|rows|rewind)$/.test(x.type)).pop();
      const mode = !act ? 'live' : act.type === 'bc_tele_rewind' ? 'replay' : 'analysis';
      const frozen = act && act.type === 'bc_tele_freeze', tc = frozen ? (act.freeze_t ?? act.t0) : act && act.type === 'bc_tele_rewind' ? rewT(act, t) : t;
      const M = { live: ['TRỰC TIẾP', p.red], analysis: ['PHÂN TÍCH', p.yellow], replay: ['XEM LẠI', p.cyan] }[mode];
      const sym = frozen ? '❚❚' : mode === 'replay' ? '◀◀' : '▶', symC = frozen ? p.yellow : mode === 'replay' ? p.cyan : p.chalk;
      const mm = Math.floor(tc / 60), ss = Math.floor(tc % 60), F = Math.floor(tc * (TL.fps || 30) + 1e-6) + 1;
      const clock = `<div class="abs" style="left:${v ? 40 : 40}px;top:${v ? 88 : 36}px;display:flex;align-items:center;gap:12px;background:${p.card};padding:8px 16px;font-family:${p.mono};font-weight:600;font-size:26px;line-height:1.2;color:${frozen ? p.yellow : p.chalk};white-space:nowrap">
        <span style="color:${symC};font-size:.8em;letter-spacing:-2px">${sym}</span>${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}<span style="color:${p.grey}">· F${F}</span></div>`;
      const dot = mode === 'live' ? `<i style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${p.red};margin-right:10px;opacity:${Math.floor(t * 2) % 2 ? .35 : 1}"></i>` : '';
      const bug = `<div class="abs" style="right:${W - (v ? 680 : 1240)}px;top:${v ? 84 : 32}px;text-align:right">
        <div style="display:inline-block;background:${p.yellow};color:#0b0f0d;padding:.22em .5em .16em;font-family:${p.label};font-weight:900;font-size:30px;line-height:1.15;letter-spacing:.02em;text-transform:uppercase;white-space:nowrap">${esc(s.show || 'SOI KỸ')}</div>
        <div style="display:flex;justify-content:flex-end"><div style="display:flex;align-items:center;background:${p.card};padding:6px 14px;font-family:${p.cond};font-weight:600;font-size:24px;line-height:1.2;letter-spacing:2px;color:${M[1]};white-space:nowrap">${dot}${M[0]}</div></div></div>`;
      const sides = s.sides || ['BẠN', 'THÓI QUEN'], flip = s.flip_t != null && t >= s.flip_t, lead = flip ? 1 - (s.lead ?? 1) : s.lead ?? 1;
      const fk = s.flip_t != null ? E.inOutSine(prog(t, s.flip_t, .3)) : 1, fl = s.flip_t != null ? 1 - clamp((t - s.flip_t) / .3) : 0;
      const cw = v ? 150 : 170, mx = (v ? 680 : 1240) - cw * 2 - 12, my = v ? 1076 : 632;
      const leadX = flip ? lerp((s.lead ?? 1) * cw, lead * cw, fk) : lead * cw;
      const matchup = `<div class="abs" style="left:${mx}px;top:${my}px;width:${cw * 2 + 12}px;height:50px;background:${p.card};padding:0 6px;font-family:${p.cond};font-weight:700;font-style:italic;font-size:26px;line-height:50px;color:${p.chalk}">
        <div style="position:absolute;left:${f1(6 + leadX)}px;top:5px;width:${cw}px;height:40px;background:${p.yellow};transform:skewX(-10deg)"></div>
        ${sides.slice(0, 2).map((sd, i) => `<div style="position:absolute;left:${6 + i * cw}px;top:0;width:${cw}px;text-align:center;white-space:nowrap;overflow:hidden;color:${i === lead && fk > .5 ? '#0b0f0d' : p.chalk};font-size:${f1(fit(sd, cw - 16, 26, 18, .5))}px">${esc(sd)}</div>`).join('')}
        ${fl > 0 && fl < 1 ? `<div style="position:absolute;inset:-6px;background:${p.yellow};opacity:${f3(fl * .7)}"></div>` : ''}</div>`;
      return { front: `<div${cidOf(s)}>${clock}${bug}${matchup}</div>` };
    },

    // Freeze frame: a true still of the speaker's frame at freeze_t (default t0), white flash, spotlight outside a focus ellipse,
    // then ring (who) → zone / marker arrows (what) → label (the finding). ring:{x,y,r,color,t|at}, zone:{x,y,w,h,t|at},
    // arrows:[{pts:[[x,y]…],color,dashed,t|at}], label:{big,small,color,x,y,t|at}, focus:{x,y,rx,ry}. Plays live again at t1.
    bc_tele_freeze(s, t, lt) {
      const p = TE(s), [W, H] = DIMS(), fb = faceBox(), ft = s.freeze_t ?? s.t0, ko = s.keep ? 0 : E.inOutSine(prog(t, s.t1 - .25, .25));
      const fl = lt < .16 ? .34 * Math.sin(Math.PI * lt / .16) : 0, sk = E.outCubic(prog(lt, .05, .3)) * (1 - ko);
      const fc = s.focus || { x: fb.f.x, y: fb.f.y + 140, rx: 250, ry: 470 };
      const spot = `<div class="full" style="opacity:${f3(sk)};background:radial-gradient(ellipse ${fc.rx}px ${fc.ry}px at ${fc.x}px ${fc.y}px,transparent 72%,rgba(0,0,0,.42) 100%)"></div>`;
      const z = s.zone, zk = z ? E.outCubic(prog(t, itT(s, z, .5), .3)) * (1 - ko) : 0;
      const zone = z && zk > 0 ? `<div class="abs" style="left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px;border-radius:${z.round === false ? 6 : 50}%;background:rgba(255,59,48,.36);border:4px dashed ${p.red};transform:scale(${f3(lerp(.85, 1, zk))});opacity:${f3(zk)}"></div>` : '';
      const back = `<div class="full"${cidOf(s)} style="opacity:${f3(1 - ko)}">${arollImg(ft)}</div>${spot}${zone}${fl > 0 ? `<div class="full" style="background:#fff;opacity:${f3(fl)}"></div>` : ''}`;
      const r = s.ring || { x: Math.min(W - 110, fb.x1 + 40), y: fb.f.y + 190, r: 70 };
      const rk = E.inOutSine(prog(t, itT(s, r, .25), .3));
      const id = 'bcm' + Math.round(s.t0 * 100);
      const arrows = (s.arrows || []).map((a, i) => marker(p, a, E.inOutSine(prog(t, itT(s, a, .6 + i * .35), a.dur ?? .42)), id + 'a' + i, W, H)).join('');
      const fade = `opacity:${f3(1 - ko)}`;
      const svg = `<svg class="abs" style="left:0;top:0;overflow:visible;${fade}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${ringSvg(p, r, rk, lt)}${arrows}</svg>`;
      const L = s.label, lk = L ? E.outCubic(prog(t, itT(s, L, 1.0), .25)) : 0;
      return { back, front: svg + `<div class="full" style="${fade}">${teleLabel(p, L, lk, s.guard !== false)}</div>`, cover: ko <= 0 };
    },

    // Tactics board with a drawn phone: notifications stream in (cyan), the board freezes (❚❚) at freeze_t|freeze_at,
    // cyan rings on ring:[indices], a yellow marker strike, then the label. items:[{text,icon,t|at}], title, eyebrow.
    bc_tele_board(s, t, lt) {
      const p = TE(s), [W] = DIMS(), v = VERT(), items = (s.items || []).slice(0, 6).map(it => (typeof it === 'string' ? { text: it } : it));
      const fz = sT(s, 'freeze', .5 + items.length * .45 + .3), tt = Math.min(t, fz);
      const Ts = items.map((it, i) => itT(s, it, .5 + i * .45)), shown = items.map((it, i) => Ts[i] <= fz);
      const px = v ? 150 : 440, pw = v ? 420 : 400, py = v ? 300 : 120, ph = v ? 560 : 520, cardH = 74, cg = 10, top = py + 70;
      const ycard = i => { let sh = 0; for (let j = i + 1; j < items.length; j++) if (shown[j]) sh += E.outCubic(prog(tt, Ts[j], .25)); return top + sh * (cardH + cg); };
      const rings = s.ring || [], rT = j => fz + .3 + j * .3, stT = sT(s, 'strike', fz - s.t0 + .3 + rings.length * .3 + .15);
      const cards = items.map((it, i) => {
        if (!shown[i] || t < Ts[i]) return '';
        const k = E.outCubic(prog(t, Ts[i], .25)), y = ycard(i) - (1 - k) * 40;
        if (y > py + ph - cardH - 30) return '';
        return `<div style="position:absolute;left:${px + 18}px;top:${f1(y)}px;width:${pw - 36}px;height:${cardH}px;opacity:${f3(k)};background:rgba(63,216,255,.13);border-left:6px solid ${p.cyan};border-radius:10px;display:flex;align-items:center;gap:14px;padding:0 14px">
          ${icon(it.icon || 'bell', 34, p.cyan, 2.2)}<div style="min-width:0;font-family:${p.label};font-weight:700;font-size:${f1(fit(it.text, pw - 120, 27, 20, .55))}px;line-height:1.2;color:${p.chalk};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.text)}</div></div>`;
      }).join('');
      const phone = `<div style="position:absolute;left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;border:5px solid ${alpha(p.chalk, 85)};border-radius:46px;background:rgba(0,0,0,.25)">
        <div style="position:absolute;left:50%;top:14px;width:110px;height:26px;margin-left:-55px;border-radius:13px;background:${alpha(p.chalk, 85)}"></div></div>`;
      const id = 'bcb' + Math.round(s.t0 * 100);
      const ringEls = rings.map((ix, j) => {
        if (!shown[ix]) return ''; const y = ycard(ix) + cardH / 2; const k = E.inOutSine(prog(t, rT(j), .3));
        return ringSvg(p, { x: px + pw / 2, y, r: pw / 2 + 4, color: 'cyan' }, k, lt).replace(/ry="([\d.]+)"/g, (m0, q) => `ry="${f1(+q / .36 * (cardH * .78) / (pw / 2 + 4))}"`);
      }).join('');
      const strikes = rings.map((ix, j) => (shown[ix] ? marker(p, { pts: [[px + 30, ycard(ix) + cardH / 2 + 4], [px + pw - 30, ycard(ix) + cardH / 2 - 4]], color: 'yellow', w: 7, head: false }, E.inOutSine(prog(t, stT + j * .2, .3)), id + j, W, 1280) : '')).join('');
      const fk = E.outCubic(prog(t, fz, .2));
      const pause = t >= fz ? `<div style="position:absolute;left:${px + pw - 92}px;top:${py + 14}px;background:${p.yellow};color:#0b0f0d;padding:4px 14px;font-family:${p.cond};font-weight:700;font-size:24px;line-height:1.2;letter-spacing:2px;transform:scale(${f3(lerp(1.4, 1, fk))});opacity:${f3(fk)}">❚❚</div>` : '';
      const k1 = E.outCubic(prog(lt, .2, .3));
      const head = `<div style="position:absolute;left:${v ? 40 : 80}px;right:${v ? 40 : 80}px;top:${v ? 160 : 40}px;opacity:${f3(k1)}">
        ${s.eyebrow !== '' ? `<div style="font-family:${p.cond};font-weight:600;font-size:26px;letter-spacing:3px;color:${p.yellow};text-transform:uppercase">${esc(s.eyebrow || 'BẢNG PHÂN TÍCH')}</div>` : ''}
        <div style="font-family:${p.label};font-weight:900;font-size:${f1(fit(s.title || '', (v ? 640 : 1100), v ? 44 : 40, 28, .6))}px;line-height:1.2;color:${p.chalk};white-space:nowrap">${esc(s.title || '')}</div></div>`;
      const L = s.label, lk = L ? E.outCubic(prog(t, L.t ?? (L.at != null ? s.t0 + L.at : stT + rings.length * .2 + .35), .25)) : 0;
      const lab = teleLabel(p, L && { x: v ? 40 : 880, y: v ? 890 : 420, ...L }, lk, false);
      const svg = `<svg class="abs" style="left:0;top:0;overflow:visible" width="${W}" height="1280">${ringEls}${strikes}</svg>`;
      return teleCard(s, t, lt, head + phone + cards + pause + svg + lab);
    },

    // Summary board: rows land on their words with oblique yellow numerals, a chalk icon and a yellow marker underline.
    // items:[{text, icon, t|at}] (2–4), title, eyebrow.
    bc_tele_rows(s, t, lt) {
      const p = TE(s), [W] = DIMS(), v = VERT(), items = (s.items || []).slice(0, 4).map(it => (typeof it === 'string' ? { text: it } : it)), n = items.length || 1;
      const top = v ? 330 : 170, step = v ? (n <= 3 ? 180 : 150) : 120, id = 'bcr' + Math.round(s.t0 * 100);
      const rows = items.map((it, i) => {
        const T = itT(s, it, .6 + i * .7), k = E.outBack(prog(t, T, .3), 1.8), y = top + i * step, fs = fit(it.text, v ? 400 : 760, 44, 28, .6);
        const tw = Math.min(v ? 420 : 780, chars(it.text).length * fs * .58);
        const ul = marker(p, { pts: [[230, y + 96], [230 + tw, y + 92]], color: 'yellow', w: 6, head: false }, E.inOutSine(prog(t, T + .25, .35)), id + i, W, 1280);
        return `<div style="position:absolute;left:40px;top:${y}px;height:110px;display:flex;align-items:center;opacity:${f3(clamp(k * 2))};transform:translateX(${f1((1 - clamp(k)) * -40)}px)">
            <div style="width:100px;font-family:${p.cond};font-weight:700;font-style:italic;font-size:96px;line-height:1;color:${p.yellow};transform:skewX(-8deg)">${i + 1}</div>
            <div style="width:80px">${icon(it.icon || iconFor(it.text), 54, p.chalk, 2)}</div>
            <div style="font-family:${p.label};font-weight:900;font-size:${f1(fs)}px;line-height:1.15;color:${p.chalk};white-space:nowrap">${esc(it.text)}</div></div>
          <svg class="abs" style="left:0;top:0;overflow:visible" width="${W}" height="1280">${ul}</svg>`;
      }).join('');
      const k1 = E.outCubic(prog(lt, .2, .3));
      const head = `<div style="position:absolute;left:40px;right:40px;top:${v ? 170 : 40}px;opacity:${f3(k1)}">
        <div style="font-family:${p.cond};font-weight:600;font-size:26px;letter-spacing:3px;color:${p.yellow};text-transform:uppercase">${esc(s.eyebrow || 'TÓM LẠI')}</div>
        <div style="font-family:${p.label};font-weight:900;font-size:${f1(fit(s.title || '', W - 80, v ? 52 : 46, 30, .6))}px;line-height:1.2;color:${p.chalk};white-space:nowrap;text-transform:uppercase">${esc(s.title || '')}</div></div>`;
      return teleCard(s, t, lt, head + rows);
    },

    // The reel's one stamp: a framed card drops 1.7× → 1× rotated −5° with a small flash. text, sub, x, y (default: above the head).
    bc_tele_stamp(s, t, lt) {
      const p = TE(s), [W] = DIMS(), v = VERT(), k = E.outBack(prog(lt, 0, .3), 1.8), fl = 1 - clamp(lt / .2);
      return { front: `<div class="abs"${cidOf(s)} style="left:${s.x ?? W / 2}px;top:${s.y ?? (v ? Math.max(250, faceBox().y0 - 110) : 520)}px;transform:translate(-50%,-50%) rotate(-5deg) scale(${f3(lerp(1.7, 1, clamp(k, 0, 1.15)))});opacity:${f3(clamp(prog(lt, 0, .06)))}">
        <div style="background:rgba(8,12,14,.92);border:5px double ${p.chalk};padding:.24em .7em .2em;text-align:center;box-shadow:0 0 ${f1(60 * fl)}px rgba(255,255,255,${f3(.8 * fl)}),0 14px 34px rgba(0,0,0,.45)">
          <div style="font-family:${p.label};font-weight:900;font-size:${f1(fit(s.text || 'ĐƠN GIẢN', 560, 54, 34, .62))}px;line-height:1.18;color:${p.chalk};white-space:nowrap;text-transform:uppercase">${esc(s.text || 'ĐƠN GIẢN')}</div>
          ${s.sub ? `<div style="font-family:${p.cond};font-weight:600;font-size:26px;letter-spacing:3px;color:${p.yellow};white-space:nowrap;text-transform:uppercase">${esc(s.sub)}</div>` : ''}</div></div>` };
    },

    // Rewind: the speaker's own footage runs backwards `span` seconds with jitter, tracking bars and a big ◀◀ TUA LẠI;
    // the clock counts back; live play resumes at t1.
    bc_tele_rewind(s, t, lt) {
      const p = TE(s), [W, H] = DIMS(), v = VERT(), ko = s.keep ? 0 : E.inOutSine(prog(t, s.t1 - .25, .25)), ki = clamp(lt / .15);
      const j = Math.floor(t * 30), jx = (rnd(j) - .5) * 18 * ki * (1 - ko);
      const bars = [0, 1, 2, 3].map(i => `<div class="abs" style="left:0;right:0;top:${Math.round(rnd(j * 3 + i) * H)}px;height:${6 + Math.round(rnd(j + i * 5) * 12)}px;background:linear-gradient(90deg,rgba(255,255,255,.1),rgba(255,255,255,.55),rgba(255,255,255,.15));opacity:${f3(ki * (1 - ko))}"></div>`).join('');
      const back = `<div class="full"${cidOf(s)} style="opacity:${f3(1 - ko)};transform:translateX(${f1(jx)}px)">${arollImg(rewT(s, t))}</div>${bars}`;
      const tk = E.outBack(prog(lt, .05, .25), 2);
      const front = `<div class="abs" style="left:0;width:${W}px;top:${s.y ?? (v ? 200 : 80)}px;text-align:center;opacity:${f3(clamp(tk) * (1 - ko))};transform:scale(${f3(lerp(1.3, 1, clamp(tk)))})">
        <span style="display:inline-block;background:rgba(8,12,14,.75);padding:.06em .4em;font-family:${p.cond};font-weight:700;font-style:italic;font-size:${v ? 76 : 70}px;line-height:1.2;color:${p.chalk};letter-spacing:2px;white-space:nowrap"><span style="color:${p.cyan}">◀◀</span> ${esc(s.text || 'TUA LẠI')}</span></div>`;
      return { back, front, cover: ko <= 0 };
    },
  };

  // Caption: the speaker's words as a one-line subtitle on a black 0.64 bar with a yellow left edge (shrunk, never wrapped).
  CAPTION_STYLES.bc_tele = (c, t) => {
    const p = TE(c), [W] = DIMS(), v = VERT(), txt = capText(c), maxw = v ? 620 : 1060;
    const size = Math.max(22, Math.min(c.size || (v ? 34 : 32), (maxw - 50) / (chars(txt).length * .54)));
    const html = c.words.map(w => `<span style="color:${w.hl ? p.yellow : c.color || p.chalk}">${esc(w.w)}</span>`).join(' ');
    const yc = c.y ?? (v ? 1028 : 600), dx = (c.x ?? W / 2) - W / 2, o = clamp(prog(t, c.t0, .06));
    return `<div id="cap" class="bc_tele"${cidOf(c)} style="left:${dx}px;right:${-dx}px;top:${yc}px;transform:translateY(-50%);display:flex;justify-content:center;opacity:${f3(o)};text-shadow:none">
      <div style="max-width:${maxw}px;background:rgba(0,0,0,.64);border-left:4px solid ${p.yellow};padding:.2em .6em .26em;font-family:${c.font || p.label};font-weight:${c.weight || 600};font-size:${f1(size)}px;line-height:1.3;white-space:nowrap">${html}</div></div>`;
  };

  // =====================================================================================================================
  // 4. HOLOGRAM HUD — the object the speaker names is scanned into a glowing line wireframe on a projector pad; target boxes
  //    lock onto its parts, values roll in from garbage glyphs and turn amber when true, finished values dock in a rail.
  // =====================================================================================================================
  const HO = (s = {}) => {
    const h = s.hue ?? brand().hue ?? 188, a = s.accent_hue ?? 38;
    return {
      h, a, line: k => `hsla(${h},100%,72%,${k})`, hot: `hsla(${h},70%,94%,1)`, dim: k => `hsla(${h},70%,52%,${k})`, amber: `hsl(${a},100%,64%)`,
      plate: 'rgba(1,8,12,.76)', text: `hsl(${h},35%,94%)`, ui: "'Exo 2','Be Vietnam Pro',sans-serif", mono: "'JetBrains Mono',monospace",
    };
  };
  const GLY = chars('ABCDEFGHKLMNOPQRSTUVXYĂÂĐÊÔƠƯ0123456789#%<>/+=');
  // text rolling right → left from garbage glyphs over dur starting at T0 (layout = final text, so nothing jumps)
  function roll(text, t, T0, dur = .45) {
    const cs = chars(text), n = cs.length, j = Math.floor(t * 30);
    if (t < T0) return `<span style="color:transparent">${esc(text)}</span>`;
    return cs.map((ch, i) => {
      if (ch === ' ' || t >= T0 + dur * (n - i) / n) return esc(ch);
      const g = GLY[Math.floor(rnd(j * 7.13 + i * 3.7) * GLY.length)];
      return `<span style="position:relative;display:inline-block"><span style="color:transparent">${esc(ch)}</span><span style="position:absolute;left:0;top:0;opacity:.85">${esc(g)}</span></span>`;
    }).join('');
  }
  const plateCss = p => `background:${p.plate};border:1px solid ${p.line(.28)};box-shadow:0 0 0 1px rgba(0,0,0,.3)`;
  const ticks = (p, sz = 12) => ['left:-2px;top:-2px;border-width:3px 0 0 3px', 'right:-2px;top:-2px;border-width:3px 3px 0 0', 'left:-2px;bottom:-2px;border-width:0 0 3px 3px', 'right:-2px;bottom:-2px;border-width:0 3px 3px 0']
    .map(c => `<i style="position:absolute;${c};width:${sz}px;height:${sz}px;border-style:solid;border-color:${p.line(.95)}"></i>`).join('');
  // power-on / power-off slit (a bright line opening to the full frame)
  function holoWrap(s, t, lt, inner, front = '') {
    const p = HO(s), [W, H] = DIMS(), io = ioK(s, t, .3, .26), k = Math.min(io.i, 1 - io.o);
    const slit = k < 1 ? `<div class="abs" style="left:0;right:0;top:${f1(H / 2 - k * H / 2 - 2)}px;height:3px;background:${p.hot};box-shadow:0 0 18px ${p.line(1)}"></div><div class="abs" style="left:0;right:0;top:${f1(H / 2 + k * H / 2 - 1)}px;height:3px;background:${p.hot};box-shadow:0 0 18px ${p.line(1)}"></div>` : '';
    const clip = k < 1 ? `clip-path:inset(${f1((1 - k) * 50)}% 0 ${f1((1 - k) * 50)}% 0);` : '';
    return { back: `<div class="full"${cidOf(s)} style="${clip}overflow:hidden">${inner}</div>`, front: (k < 1 ? '' : front) + slit || undefined, cover: k >= 1 };
  }
  const stage = (p, lt) => `<div class="full" style="background:radial-gradient(ellipse at 50% 44%,hsl(${p.h + 6},65%,8%),hsl(${p.h + 12},70%,2.6%) 70%)"></div>
    <div class="full" style="background-image:radial-gradient(${p.line(.17)} 1.3px,transparent 1.8px);background-size:32px 32px;background-position:${f1(-lt * 5)}px ${f1(lt * 3)}px"></div>
    <div class="full" style="background:radial-gradient(ellipse at 50% 46%,transparent 52%,rgba(0,0,0,.55))"></div>`;
  function pad(p, cx, cy, rx, lt) {
    const ry = rx * .27;
    const tk = Array.from({ length: 48 }, (_, i) => { const a = i / 48 * Math.PI * 2 + lt * .15, c = Math.cos(a), s2 = Math.sin(a), r1 = 1.06, r2 = i % 4 ? 1.1 : 1.16; return `M${f1(cx + c * rx * r1)} ${f1(cy + s2 * ry * r1)}L${f1(cx + c * rx * r2)} ${f1(cy + s2 * ry * r2)}`; }).join('');
    return `<div class="abs" style="left:${cx - rx * .8}px;top:${cy - 320}px;width:${rx * 1.6}px;height:320px;background:linear-gradient(to top,${p.line(.14)},transparent);clip-path:polygon(18% 0,82% 0,100% 100%,0 100%)"></div>
      <svg class="abs" style="left:0;top:0;overflow:visible" width="1" height="1"><g fill="none" style="filter:drop-shadow(0 0 6px ${p.line(.7)})">
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${f1(ry)}" stroke="${p.line(.75)}" stroke-width="2.5" fill="${p.line(.06)}"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${f1(rx * .72)}" ry="${f1(ry * .72)}" stroke="${p.line(.4)}" stroke-width="2" stroke-dasharray="18 10" stroke-dashoffset="${f1(lt * 30)}"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${f1(rx * .42)}" ry="${f1(ry * .42)}" stroke="${p.line(.35)}" stroke-width="1.5"/>
      <path d="${tk}" stroke="${p.line(.5)}" stroke-width="2"/></g></svg>`;
  }
  // ---- wireframe models (y up, about 2 units tall). segs: [[x,y,z],[x,y,z]], parts: name → points ----
  const loop = pts => pts.map((q, i) => [q, pts[(i + 1) % pts.length]]);
  const rrect = (cx, cy, z, w, h, r, n = 4) => { const out = []; [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 1], [-w / 2 + r, -h / 2 + r, 2], [w / 2 - r, -h / 2 + r, 3]].forEach(([x, y, q]) => { for (let i = 0; i <= n; i++) { const a = (q + i / n) * Math.PI / 2; out.push([cx + x + Math.cos(a) * r, cy + y + Math.sin(a) * r, z]); } }); return out; };
  const rectZ = (cx, cy, z, w, h) => [[cx - w / 2, cy - h / 2, z], [cx + w / 2, cy - h / 2, z], [cx + w / 2, cy + h / 2, z], [cx - w / 2, cy + h / 2, z]];
  const circXZ = (cx, cy, cz, r, n = 24) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * Math.PI * 2) * r, cy, cz + Math.sin(i / n * Math.PI * 2) * r]);
  const circXY = (cx, cy, z, r, n = 20, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(a0 + (a1 - a0) * i / n) * r, cy + Math.sin(a0 + (a1 - a0) * i / n) * r, z]);
  const open = pts => pts.slice(0, -1).map((q, i) => [q, pts[i + 1]]);
  const box = (cx, cy, cz, w, h, d) => { const f = rectZ(cx, cy, cz + d / 2, w, h), b = rectZ(cx, cy, cz - d / 2, w, h); return [...loop(f), ...loop(b), ...f.map((q, i) => [q, b[i]])]; };
  const MODELS = {
    phone() {
      const f = rrect(0, 0, .09, .96, 1.96, .14), b = rrect(0, 0, -.09, .96, 1.96, .14), sc = rrect(0, -.02, .1, .84, 1.7, .08), notch = rrect(0, .86, .1, .24, .06, .03, 2);
      const segs = [...loop(f), ...loop(b), ...[0, 5, 10, 15].map(i => [f[i], b[i]]), ...loop(sc), ...loop(notch)], notif = [], grid = [];
      for (let k = 0; k < 3; k++) { const r = rectZ(0, .52 - k * .25, .11, .72, .18); segs.push(...loop(r)); segs.push(...loop(circXY(-.26, .52 - k * .25, .11, .045, 8).slice(0, 8))); notif.push(...r); }
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const r = rectZ(-.27 + i * .18, -.38 - j * .22, .11, .12, .12); segs.push(...loop(r)); grid.push(...r); }
      return { segs, parts: { screen: sc, notif, camera: notch, grid, body: f } };
    },
    laptop() {
      const base = box(0, -.62, .1, 2.1, .08, 1.3), sb = [[-1, -.58, -.55], [1, -.58, -.55]], st = [[-1, .72, -.8], [1, .72, -.8]];
      const scr = [sb[0], sb[1], st[1], st[0]], inner = [[-.9, -.48, -.57], [.9, -.48, -.57], [.9, .64, -.785], [-.9, .64, -.785]];
      const keys = []; for (let i = 0; i < 4; i++) keys.push([[-.8, -.575, .35 - i * .14], [.8, -.575, .35 - i * .14]]);
      const pad2 = rectZ(0, 0, 0, .5, .3).map(([x, y]) => [x, -.575, .5 + y * .6]);
      return { segs: [...base, ...loop(scr), ...loop(inner), ...keys, ...loop(pad2)], parts: { screen: scr, keyboard: keys.flat(), body: [...scr, ...base.flat()] } };
    },
    book() {
      const segs = box(0, 0, 0, 1.3, 1.85, .32), lab = rectZ(.05, .35, .161, .9, .4), pages = [];
      for (let i = 1; i < 6; i++) pages.push([[.65, .9, .16 - i * .053], [.65, -.9, .16 - i * .053]]);
      const spine = [[[-.65, .6, .16], [-.65, .6, -.16]], [[-.65, -.6, .16], [-.65, -.6, -.16]]];
      return { segs: [...segs, ...loop(lab), ...pages, ...spine], parts: { cover: rectZ(0, 0, .16, 1.3, 1.85), title: lab, spine: spine.flat(), body: rectZ(0, 0, .16, 1.3, 1.85) } };
    },
    cup() {
      const top = circXZ(0, .7, 0, .62), bot = circXZ(0, -.75, 0, .48), segs = [...loop(top), ...loop(bot), ...loop(circXZ(0, .62, 0, .56))];
      for (let i = 0; i < 24; i += 3) segs.push([top[i], bot[i]]);
      const h1 = circXY(.62, 0, 0, .38, 14, -Math.PI / 2, Math.PI / 2), h2 = circXY(.62, 0, 0, .24, 14, -Math.PI / 2, Math.PI / 2);
      const steam = [0, 1, 2].map(i => open(Array.from({ length: 8 }, (_, k) => [-.25 + i * .25 + Math.sin(k * .9 + i) * .06, .9 + k * .1, 0]))).flat();
      return { segs: [...segs, ...open(h1), ...open(h2), ...steam], parts: { rim: top, handle: [...h1, ...h2], body: [...top, ...bot] } };
    },
    monitor() {
      const f = rrect(0, .3, .06, 2.1, 1.25, .06), b = rrect(0, .3, -.06, 2.1, 1.25, .06), sc = rectZ(0, .32, .07, 1.9, 1.06);
      const play = [[-.14, .5, .08], [.2, .32, .08], [-.14, .14, .08]], bar = rectZ(0, -.12, .08, 1.6, .05), knob = rectZ(-.25, -.12, .085, .06, .12);
      const neck = box(0, -.55, -.05, .16, .55, .1), base = loop(circXZ(0, -.83, -.05, .5));
      return { segs: [...loop(f), ...loop(b), ...[0, 5, 10, 15].map(i => [f[i], b[i]]), ...loop(sc), ...loop(play), ...loop(bar), ...loop(knob), ...neck, ...base],
        parts: { screen: sc, play, timeline: [...bar, ...knob], stand: [...neck.flat(), ...circXZ(0, -.83, -.05, .5)], body: f } };
    },
  };
  MODELS.video = MODELS.monitor; MODELS.tv = MODELS.monitor;
  const MODEL_VI = { phone: 'ĐIỆN THOẠI', laptop: 'MÁY TÍNH', book: 'CUỐN SÁCH', cup: 'CỐC CÀ PHÊ', monitor: 'VIDEO', video: 'VIDEO', tv: 'MÀN HÌNH' };
  const MCACHE = {};
  const modelOf = name => (MCACHE[name] ||= (MODELS[name] || MODELS.phone)());
  const proj = ([x, y, z], yaw, pitch, S, cx, cy) => {
    const c = Math.cos(yaw), s1 = Math.sin(yaw); const X = x * c + z * s1; let Z = -x * s1 + z * c;
    const cp = Math.cos(pitch), sp = Math.sin(pitch), Y = y * cp - Z * sp; Z = y * sp + Z * cp;
    const f = 5 / (5 - Z); return [cx + X * S * f, cy - Y * S * f, Z];
  };
  // wireframe as SVG: segments clipped by the scan plane (visible where y ≤ scanY), hot (white) just under the scan front
  function wire(p, m, view, scanY, hotParts = []) {
    const bk = [[], [], [], []];
    for (const [a, b] of m.segs) {
      let A = a, B = b;
      if (A[1] > scanY && B[1] > scanY) continue;
      if (A[1] > scanY || B[1] > scanY) { const k = (scanY - A[1]) / (B[1] - A[1]); const C = [A[0] + (B[0] - A[0]) * k, scanY, A[2] + (B[2] - A[2]) * k]; if (A[1] > scanY) A = C; else B = C; }
      const pa = proj(A, ...view), pb = proj(B, ...view), z = (pa[2] + pb[2]) / 2;
      const hot = scanY < 1.2 && Math.max(A[1], B[1]) > scanY - .12;
      bk[hot ? 3 : z > .3 ? 0 : z > -.3 ? 1 : 2].push(`M${f1(pa[0])} ${f1(pa[1])}L${f1(pb[0])} ${f1(pb[1])}`);
    }
    const st = [[p.line(1), 2.6], [p.line(.75), 2.2], [p.line(.42), 1.8], [p.hot, 3]];
    return bk.map((d, i) => (d.length ? `<path d="${d.join('')}" fill="none" stroke="${st[i][0]}" stroke-width="${st[i][1]}" stroke-linecap="round"/>` : '')).join('');
  }
  const bbox = (pts, view, padPx = 12) => { const q = pts.map(P => proj(P, ...view)); const xs = q.map(v => v[0]), ys = q.map(v => v[1]); return [Math.min(...xs) - padPx, Math.min(...ys) - padPx, Math.max(...xs) + padPx, Math.max(...ys) + padPx]; };
  // target lock: corner brackets start 1.9× and rotated 45°, snap in 0.22 s, white for 3 frames, tag chip above
  function lockBox(p, [x0, y0, x1, y1], T, t, label, dimmed) {
    if (t < T - .02) return '';
    const k = E.outCubic(prog(t, T, .22)), sc = lerp(1.9, 1, k), rot = lerp(45, 0, k), white = t >= T + .2 && t < T + .3;
    const col = white ? '#fff' : p.line(dimmed ? .45 : 1), w = x1 - x0, h = y1 - y0, c = Math.min(26, w / 3, h / 3);
    const br = [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]].map(([x, y, sx, sy]) => `M${x + sx * c} ${y}H${x}V${y + sy * c}`).join('');
    const tag = label && k >= 1 ? `<div style="position:absolute;left:-2px;${y0 < 420 ? `top:${h + 10}px` : `bottom:${h + 10}px`};background:${p.line(dimmed ? .5 : .95)};color:#02161a;padding:.12em .45em .08em;font-family:${p.ui};font-weight:700;font-size:26px;line-height:1.2;letter-spacing:.06em;white-space:nowrap;text-transform:uppercase">${esc(label)}</div>` : '';
    return `<div class="abs" style="left:${f1(x0)}px;top:${f1(y0)}px;width:${f1(w)}px;height:${f1(h)}px;transform:rotate(${f1(rot)}deg) scale(${f3(sc)});opacity:${f3(lerp(.3, dimmed ? .6 : 1, k))}">
      <svg style="position:absolute;left:0;top:0;overflow:visible" width="${f1(w)}" height="${f1(h)}"><path d="${br}" fill="none" stroke="${col}" stroke-width="4" style="filter:drop-shadow(0 0 6px ${p.line(.8)})"/></svg>${tag}</div>`;
  }
  // spec card: label rolls in, value rolls right → left and turns amber (1-frame white flash) when true; progress bar
  function specCard(p, c, T, t, x, y, w) {
    if (!c || t < T) return '';
    const k = E.outCubic(prog(t, T, .3)), vT = T + .15, tr = vT + .5, tru = t >= tr, flash = t >= tr && t < tr + 1 / 30;
    const pr = c.progress ?? 1, pk = E.inOutSine(prog(t, vT, .5)) * pr;
    return `<div class="abs" style="left:${x}px;top:${y}px;width:${w}px;${plateCss(p)};padding:14px 20px 16px;opacity:${f3(k)};transform:translateY(${f1((1 - k) * 20)}px)">${ticks(p)}
      <div style="font-family:${p.ui};font-weight:700;font-size:26px;line-height:1.2;letter-spacing:.14em;color:${p.line(.95)};white-space:nowrap;text-transform:uppercase">${roll(c.label || 'TRẠNG THÁI', t, T, .3)}</div>
      <div style="font-family:${p.ui};font-weight:500;font-size:${f1(fit(c.value || '', w - 40, 58, 32, .62))}px;line-height:1.2;letter-spacing:.04em;color:${flash ? '#fff' : tru ? p.amber : p.text};white-space:nowrap;text-transform:uppercase;${tru ? `text-shadow:0 0 18px hsla(${p.a},100%,60%,.5)` : ''}">${roll(c.value || '', t, vT, .45)}</div>
      <div style="margin-top:10px;height:6px;background:${p.line(.15)}"><div style="height:100%;width:${f1(pk * 100)}%;background:${tru ? p.amber : p.line(.9)}"></div></div></div>`;
  }
  const holoStageActive = t => (TL.scenes || []).some(x => !x.hidden && t >= x.t0 && t < x.t1 && /^bc_holo_(scan|list)$/.test(x.type));
  // chips docked by HUD scenes: scene.dock {label,on,t}, scene.docks[], bc_holo_list items with dock !== false
  function holoDocks() {
    const out = [];
    for (const x of (TL.scenes || []).filter(q => !q.hidden && /^bc_holo_/.test(q.type))) {
      for (const d of [...(x.docks || []), ...(x.dock ? [x.dock] : [])]) out.push({ label: d.label, on: d.on !== false, T: d.t ?? x.t1 - .5 });
      if (x.type === 'bc_holo_list' && x.dock_items !== false) (x.items || []).forEach((it, i) => out.push({ label: it.label, on: true, T: itT(x, it, .8 + i) + .6 }));
    }
    return out.sort((a, b) => a.T - b.T);
  }

  const HOLO = {
    // Edge chrome on every frame: corner brackets + parallax rulers, subject // mode top left, status top right; while a HUD
    // scene is on screen the rail of docked chips (two columns) shows under the top band. subject, status, chips:[{label,on,t}].
    bc_holo_chrome(s, t, lt) {
      const p = HO(s), [W, H] = DIMS(), v = VERT(), m = 27, top = v ? 86 : 40, bot = v ? 1150 : 680, hud = holoStageActive(t);
      const br = [[m, top, 1, 1], [W - m, top, -1, 1], [m, bot, 1, -1], [W - m, bot, -1, -1]].map(([x, y, sx, sy]) => `M${x + sx * 40} ${y}H${x}V${y + sy * 40}`).join('');
      const ruler = (x, sp, dir) => { let d = ''; const off = (lt * sp) % 40; for (let y = top + 70 - off; y < bot - 60; y += 20) { const L = Math.round((y + off) / 20) % 2 ? 8 : 16; d += `M${x} ${f1(y)}h${dir * L}`; } return d; };
      const svg = `<svg class="abs" style="left:0;top:0;overflow:visible;filter:drop-shadow(0 0 3px rgba(0,0,0,.6))" width="${W}" height="${H}"><path d="${br}" fill="none" stroke="${p.line(.9)}" stroke-width="3"/>
        <path d="${ruler(m + 6, hud ? 18 : 8, 1)}${ruler(W - m - 6, hud ? 26 : 10, -1)}" fill="none" stroke="${p.line(.55)}" stroke-width="2"/></svg>`;
      const mono = (txt, side) => `<div class="abs" style="${side}:${m + 22}px;top:${top + 8}px;${plateCss(p)};padding:4px 12px;font-family:${p.mono};font-weight:600;font-size:22px;line-height:1.3;letter-spacing:1px;color:${p.line(.95)};white-space:nowrap;text-transform:uppercase">${txt}</div>`;
      const st = hud ? '' : mono(`<span style="color:${p.amber};opacity:${Math.floor(t * 2) % 2 ? .4 : 1}">●</span> ${esc(s.status || 'TRỰC TUYẾN')}`, 'right');
      let rail = '';
      if (hud) {
        const chips = [...holoDocks(), ...(s.chips || []).map(c => ({ ...c, on: c.on !== false, T: c.t ?? s.t0 }))].filter(c => t >= c.T).slice(0, 4);
        const cw = v ? 300 : 280, xs = v ? [52, 368] : [52, 352], y0 = v ? 150 : 96;
        rail = chips.map((c, i) => {
          const k = E.outCubic(prog(t, c.T, .3)), x = xs[i % 2], y = y0 + Math.floor(i / 2) * 64;
          return `<div class="abs" style="left:${x}px;top:${y}px;width:${cw}px;height:54px;${plateCss(p)};display:flex;align-items:center;gap:12px;padding:0 14px;opacity:${f3(k)};transform:translateX(${f1((1 - k) * 27)}px)">
            <div style="flex:none;position:relative;width:46px;height:24px;border-radius:12px;border:2px solid ${p.amber};${c.on ? `background:hsla(${p.a},100%,60%,.25)` : ''}"><i style="position:absolute;top:3px;${c.on ? 'right:3px' : 'left:3px'};width:14px;height:14px;border-radius:50%;${c.on ? `background:${p.amber}` : `border:2px solid ${p.amber};box-sizing:border-box`}"></i></div>
            <div style="min-width:0;font-family:${p.ui};font-weight:700;font-size:${f1(fit(c.label, cw - 100, 26, 18, .62))}px;line-height:1.2;letter-spacing:.05em;color:${p.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase">${esc(c.label)}</div></div>`;
        }).join('');
      }
      return { front: `<div${cidOf(s)}>${svg}${mono(esc(s.subject || 'CHỦ ĐỀ // QUÉT'), 'left')}${st}${rail}</div>` };
    },

    // Scan scene: stage + pad, the model (phone|laptop|book|cup|monitor) grows under a rising scan plane while it turns;
    // locks:[{part,label,t|at}] snap onto its parts, card:{label,value,t|at,progress} rolls in, title rolls in; erase_t|erase_at
    // scan-erases it top-down. dock:{label,on,t} adds a chip to the rail (bc_holo_chrome).
    bc_holo_scan(s, t, lt) {
      const p = HO(s), [W, H] = DIMS(), v = VERT(), m = modelOf(s.model || 'phone');
      const cx = s.x ?? W / 2, cy = s.y ?? (v ? 545 : 330), S = s.scale ?? (v ? 165 : 130);
      const sd = s.scan_dur ?? 1.2, sk = E.inOutSine(prog(lt, .3, sd)), et = s.erase_t ?? (s.erase_at != null ? s.t0 + s.erase_at : null);
      let scanY = lerp(-1.15, 1.25, sk); if (et != null && t >= et) scanY = lerp(1.25, -1.15, E.inOutSine(prog(t, et, .8)));
      const view = [(s.yaw ?? -.55) + lt * (s.spin ?? .22), s.pitch ?? .24, S, cx, cy];
      const scanning = (sk > 0 && sk < 1) || (et != null && t >= et && t < et + .8);
      const sp = proj([0, scanY, 0], ...view), plane = scanning ? `<ellipse cx="${f1(sp[0])}" cy="${f1(sp[1])}" rx="${f1(S * 1.35)}" ry="${f1(S * .3)}" fill="${p.line(.1)}" stroke="${p.hot}" stroke-width="3"/>` : '';
      const svg = `<svg class="abs" style="left:0;top:0;overflow:visible" width="${W}" height="${H}"><g style="filter:drop-shadow(0 0 4px ${p.line(.9)}) drop-shadow(0 0 14px ${p.line(.45)})">${wire(p, m, view, scanY)}${plane}</g></svg>`;
      const padY = proj([0, -1.15, 0], ...view)[1] + 20;
      const locks = (s.locks || []).map((L, i) => ({ ...L, T: itT(s, L, sd + .6 + i * 1) }));
      let lastI = -1; locks.forEach((L, i) => { if (t >= L.T) lastI = i; });
      const boxes = locks.map((L, i) => (m.parts[L.part] && scanY > -1 ? lockBox(p, L.box || bbox(m.parts[L.part], view), L.T, t, L.label, i < lastI) : '')).join('');
      const card = s.card ? specCard(p, s.card, itT(s, s.card, sd + .6 + locks.length + .2), t, v ? 87 : 840, v ? 800 : 420, v ? 547 : 380) : '';
      const tT = sT(s, 'title', .3 + sd), tk = clamp(prog(t, tT, .2));
      const title = s.title ? `<div class="abs" style="left:${v ? 52 : 52}px;top:${v ? 296 : 160}px;${plateCss(p)};padding:4px 16px;opacity:${f3(tk)};font-family:${p.ui};font-weight:500;font-size:${f1(fit(s.title, v ? 560 : 520, 50, 32, .78))}px;line-height:1.25;letter-spacing:.16em;color:${p.text};white-space:nowrap;text-transform:uppercase">${roll(s.title, t, tT, .5)}</div>` : '';
      const pct = Math.round(clamp(sk) * 100), status = sk < 1 ? `QUÉT ${pct}%` : locks.length ? `KHOÁ ${Math.max(0, lastI + 1)}/${locks.length}` : 'ĐÃ QUÉT';
      const stat = `<div class="abs" style="right:49px;top:${v ? 94 : 48}px;${plateCss(p)};padding:4px 12px;font-family:${p.mono};font-weight:600;font-size:22px;line-height:1.3;letter-spacing:1px;color:${p.line(.95)};white-space:nowrap">${status}</div>`;
      return holoWrap(s, t, lt, stage(p, lt) + pad(p, cx, padY, S * 1.3, lt) + svg, boxes + card + title + stat);
    },

    // Turntable list: line icons on one pad; the table whips each to the front on its word, a lock + amber marker per item,
    // status n/N; items dock as "on" chips. items:[{icon,label,t|at}] (2–5), dock_items:false to keep the rail.
    bc_holo_list(s, t, lt) {
      const p = HO(s), [W, H] = DIMS(), v = VERT(), items = (s.items || []).slice(0, 5), n = Math.max(1, items.length);
      const cx = s.x ?? W / 2, cy = s.y ?? (v ? 700 : 470), rx = s.rx ?? (v ? 230 : 300), ry = rx * .28, lift = v ? 150 : 120;
      const Ts = items.map((it, i) => itT(s, it, .8 + i));
      const tgt = i => Math.PI / 2 - i * Math.PI * 2 / n;
      let ang = Math.PI / 2 + .9 - lt * .25;
      Ts.forEach((T, i) => { if (t < T) return; let g = tgt(i); while (g > ang + Math.PI) g -= Math.PI * 2; while (g < ang - Math.PI) g += Math.PI * 2; ang = lerp(ang, g, E.inOutSine(prog(t, T, .45))); });
      let front = -1; Ts.forEach((T, i) => { if (t >= T) front = i; });
      const objs = items.map((it, i) => { const a = ang + i * Math.PI * 2 / n, d = Math.sin(a); return { it, i, x: cx + Math.cos(a) * rx, y: cy + d * ry - lift, d }; }).sort((a, b) => a.d - b.d);
      const ic = objs.map(o => { const sz = lerp(64, 132, (o.d + 1) / 2), op = lerp(.3, 1, (o.d + 1) / 2);
        return `<div class="abs" style="left:${f1(o.x - sz / 2)}px;top:${f1(o.y - sz / 2)}px;opacity:${f3(op)};filter:drop-shadow(0 0 6px ${p.line(.9)}) drop-shadow(0 0 16px ${p.line(.4)})">${icon(o.it.icon || iconFor(o.it.label || ''), Math.round(sz), o.i === front ? p.hot : p.line(1), 1.6)}</div>
          <div class="abs" style="left:${f1(o.x)}px;top:${f1(o.y + sz / 2 + 4)}px;width:2px;height:${f1(lift - sz / 2 - 4)}px;background:linear-gradient(${p.line(.0)},${p.line(.5 * op)})"></div>`; }).join('');
      let marks = '';
      if (front >= 0) {
        const T = Ts[front], sz = 132, x = cx + Math.cos(ang + front * Math.PI * 2 / n) * rx, y = cy + Math.sin(ang + front * Math.PI * 2 / n) * ry - lift;
        marks = lockBox(p, [x - sz / 2 - 16, y - sz / 2 - 16, x + sz / 2 + 16, y + sz / 2 + 16], T + .3, t, '', false);
        const lk = clamp(prog(t, T + .5, .2));
        marks += `<div class="abs" style="left:${f1(cx)}px;top:${f1(y + sz / 2 + (v ? 130 : 110))}px;transform:translateX(-50%);opacity:${f3(lk)};${plateCss(p)};padding:6px 20px;font-family:${p.ui};font-weight:700;font-size:${f1(fit(items[front].label, 520, 44, 28, .66))}px;line-height:1.25;letter-spacing:.08em;color:${t >= T + .9 ? p.amber : p.text};white-space:nowrap;text-transform:uppercase">${roll(items[front].label || '', t, T + .5, .4)}</div>`;
      }
      const stat = `<div class="abs" style="right:49px;top:${v ? 94 : 48}px;${plateCss(p)};padding:4px 12px;font-family:${p.mono};font-weight:600;font-size:22px;line-height:1.3;letter-spacing:1px;color:${p.line(.95)};white-space:nowrap">${esc(s.status || 'MỤC')} ${front + 1}/${items.length}</div>`;
      const title = s.title ? `<div class="abs" style="left:52px;top:${v ? 296 : 160}px;${plateCss(p)};padding:4px 16px;font-family:${p.ui};font-weight:500;font-size:${f1(fit(s.title, 560, 46, 30, .78))}px;line-height:1.25;letter-spacing:.16em;color:${p.text};white-space:nowrap;text-transform:uppercase">${roll(s.title, t, s.t0 + .3, .5)}</div>` : '';
      return holoWrap(s, t, lt, stage(p, lt) + pad(p, cx, cy, rx * 1.12, lt), ic + marks + stat + title);
    },

    // Target lock over the live picture (an object in the room, never the face): box x,y,w,h snaps at lock_t|lock_at, tag
    // label, optional value rolled beside it.
    bc_holo_target(s, t, lt) {
      const p = HO(s), T = sT(s, 'lock', .15), x = s.x ?? 470, y = s.y ?? 640, w = s.w ?? 160, h = s.h ?? 160;
      const val = s.value ? `<div class="abs" style="left:${x}px;top:${y + h + 12}px;${plateCss(p)};padding:4px 12px;font-family:${p.ui};font-weight:700;font-size:28px;line-height:1.25;color:${t >= T + .7 ? p.amber : p.text};white-space:nowrap;text-transform:uppercase;opacity:${f3(clamp(prog(t, T + .25, .15)))}">${roll(s.value, t, T + .25, .4)}</div>` : '';
      return { front: `<div${cidOf(s)}>${lockBox(p, [x, y, x + w, y + h], T, t, s.label || 'MỤC TIÊU', false)}${val}</div>` };
    },

    // Stand-alone spec card (label + rolling value turning amber + progress), e.g. the payoff value at eye level.
    bc_holo_card(s, t, lt) {
      const p = HO(s), v = VERT();
      return { front: `<div${cidOf(s)}>${specCard(p, s, sT(s, 'card', .1), t, s.x ?? (v ? 87 : 440), s.y ?? (v ? 800 : 440), s.w ?? (v ? 547 : 400))}</div>` };
    },
  };

  // Caption: the spoken line on a dark HUD plate with diagonal corner ticks and voiceprint bars that move while a word is
  // spoken; Exo 2, two lines max, plate bottom at y 1107; no glyph roll on the speaker's words.
  CAPTION_STYLES.bc_holo = (c, t) => {
    const p = HO(c), [W] = DIMS(), v = VERT(), txt = capText(c), maxw = v ? 520 : 900;
    const size = Math.max(28, Math.min(c.size || (v ? 44 : 40), (maxw * 2 - 40) / (chars(txt).length * .55)));
    const speaking = c.words.some(w => t >= w.s && t < (w.e ?? w.s + .3));
    const bars = Array.from({ length: 5 }, (_, i) => `<i style="display:block;width:5px;height:${f1(speaking ? 8 + 22 * Math.abs(Math.sin(t * 13 + i * 1.7)) : 5)}px;background:${p.line(.9)}"></i>`).join('');
    const html = c.words.map(w => `<span style="color:${w.hl ? p.line(1) : c.color || p.text}">${esc(w.w)}</span>`).join(' ');
    const o = fadeIO(t, c.t0, c.t1, .1, .1), bottom = c.y ?? (v ? 1107 : 660), dx = (c.x ?? W / 2) - W / 2;
    return `<div id="cap" class="bc_holo"${cidOf(c)} style="left:${dx}px;right:${-dx}px;top:${bottom}px;transform:translateY(-100%);display:flex;justify-content:center;opacity:${f3(o)};text-shadow:none">
      <div style="position:relative;max-width:${maxw + 80}px;${plateCss(p)};padding:.3em .7em .36em 64px;font-family:${c.font || p.ui};font-weight:${c.weight || 500};font-size:${f1(size)}px;line-height:1.24;text-align:left">
        <div style="position:absolute;left:18px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:4px;height:34px">${bars}</div>
        <i style="position:absolute;left:-6px;top:-6px;width:22px;height:22px;border-left:3px solid ${p.line(.95)};border-top:3px solid ${p.line(.95)};transform:skewX(-20deg)"></i>
        <i style="position:absolute;right:-6px;bottom:-6px;width:22px;height:22px;border-right:3px solid ${p.line(.95)};border-bottom:3px solid ${p.line(.95)};transform:skewX(-20deg)"></i>${html}</div></div>`;
  };

  Object.assign(MODULES, CAPNEWS, PKG, TELE, HOLO);

  // ---------- Studio metadata ----------
  const XY = (yv, yh) => (VERT() ? { y: yv } : { y: yh });
  PACKS.push({
    id: P, name: 'Truyền hình (4 kiểu)', icon: '📡', caption: 'bc_capnews',
    desc: 'Bốn kiểu truyền hình cho người nói: phụ đề bản tin (chữ to trên khối mực, từ khoá vàng mật), phóng sự truyền hình (plate → logo góc, băng tên vàng chanh, rundown, bảng lật), vẽ phân tích (dừng hình thật + vòng, mũi tên, nhãn, bảng chiến thuật), quét hologram (wireframe phát sáng, khoá mục tiêu, giá trị cuộn)',
    items: [
      { type: 'bc_capnews_hook', label: 'Bản tin: câu mở đầu chữ khổng lồ', make: T => ({ type: 'bc_capnews_hook', t0: T, t1: T + 2, text: 'AI đang dựng / video |THAY BẠN|' }) },
      { type: 'bc_capnews_sting', label: 'Bản tin: trang tiêu đề kẻ dòng', make: T => ({ type: 'bc_capnews_sting', t0: T, t1: T + 2.3, title: 'BẢN TIN |HÔM NAY|', chip: 'Góc nhìn nhanh' }) },
      { type: 'bc_capnews_badge', label: 'Bản tin: logo góc (bug)', make: T => ({ type: 'bc_capnews_badge', t0: T, t1: T + 8, a: 'BẢN TIN', b: 'HÔM NAY' }) },
      { type: 'bc_capnews_source', label: 'Bản tin: thẻ nguồn', make: T => ({ type: 'bc_capnews_source', t0: T, t1: T + 3, label: 'Nguồn mẫu' }) },
      { type: 'bc_capnews_doc', label: 'Bản tin: tài liệu + bút dạ', make: T => ({ type: 'bc_capnews_doc', t0: T, t1: T + 4, cut: true, kicker: 'Tài liệu mẫu', title: 'Tiêu đề tài liệu được nhắc tới (ví dụ)', lines: ['Dòng trích dẫn thứ nhất', 'Dòng trích dẫn thứ hai'], hl: [{ line: 'title', at: .8 }, { line: 1, at: 1.8 }], block: 'Ý CHÍNH', block_at: 2.4, source: 'Nguồn mẫu' }) },
      { type: 'bc_capnews_grid', label: 'Bản tin: lưới ô sáng', make: T => ({ type: 'bc_capnews_grid', t0: T, t1: T + 4, cut: true, title: 'Ba thứ chiếm thời gian', items: [{ icon: 'mail', label: 'Email', at: .7, badge: '' }, { icon: 'chat', label: 'Tin nhắn', at: 1.4, badge: '' }, { icon: 'feed', label: 'Mạng xã hội', at: 2.1, badge: '' }] }) },
      { type: 'bc_capnews_list', label: 'Bản tin: danh sách kẻ dòng', make: T => ({ type: 'bc_capnews_list', t0: T, t1: T + 4, cut: true, title: 'Ba việc nên làm', items: [{ text: 'Ngủ đủ giấc', at: .6 }, { text: 'Vận động', at: 1.4 }, { text: 'Gọi cho bạn bè', at: 2.2 }] }) },
      { type: 'bc_pkg_sting', label: 'Phóng sự: plate mở đầu → logo', make: T => ({ type: 'bc_pkg_sting', t0: T, t1: T + 2, title: 'CHỦ ĐỀ HÔM NAY', dateline: 'MỘT CHỦ ĐỀ · MỘT BẢN TIN' }) },
      { type: 'bc_pkg_badge', label: 'Phóng sự: logo góc LÊN SÓNG', make: T => ({ type: 'bc_pkg_badge', t0: T, t1: T + 8 }) },
      { type: 'bc_pkg_strap', label: 'Phóng sự: băng tên lật chữ', make: T => ({ type: 'bc_pkg_strap', t0: T, t1: T + 6, items: [{ at: 0, tab: 'HÔM NAY', head: 'Tiêu đề ngắn của đoạn', sub: 'Dòng phụ' }, { at: 3, tab: '01 · Ý CHÍNH', head: 'Ý thứ nhất', sub: 'Giải thích ngắn', source: 'Nguồn mẫu' }] }) },
      { type: 'bc_pkg_rundown', label: 'Phóng sự: rundown các ý', make: T => ({ type: 'bc_pkg_rundown', t0: T, t1: T + 3.5, cut: true, title: 'Trong bản tin này', mono: 'MỘT CHỦ ĐỀ · BA Ý', items: [{ text: 'Ý thứ nhất', tc: '00:05' }, { text: 'Ý thứ hai', tc: '00:10' }, { text: 'Ý thứ ba', tc: '00:15' }] }) },
      { type: 'bc_pkg_rundown', label: 'Phóng sự: tóm tắt đánh dấu ✓', make: T => ({ type: 'bc_pkg_rundown', t0: T, t1: T + 3.5, cut: true, recap: true, items: [{ text: 'Ý thứ nhất', at: 1 }, { text: 'Ý thứ hai', at: 1.6 }, { text: 'Ý thứ ba', at: 2.2 }] }) },
      { type: 'bc_pkg_flap', label: 'Phóng sự: bảng lật chữ', make: T => ({ type: 'bc_pkg_flap', t0: T, t1: T + 3.5, cut: true, eyebrow: 'ĐIỂM 01', title: 'Thông báo buổi tối', from: 'BẬT', to: 'TẮT', flip_at: 1.3, label: 'Tắt sau 9 giờ tối' }) },
      { type: 'bc_pkg_cards', label: 'Phóng sự: 3 thẻ + ngoặc', make: T => ({ type: 'bc_pkg_cards', t0: T, t1: T + 4, cut: true, eyebrow: 'ĐIỂM 02', title: 'Ba bước đơn giản', items: [{ icon: 'cursor', text: 'Kéo thả' }, { icon: 'spark', text: 'Chọn hiệu ứng' }, { icon: 'video', text: 'Xuất clip' }], summary: 'Không cần |biết edit|', stamp: 'DỄ LÀM', stamp_at: 3 }) },
      { type: 'bc_tele_chrome', label: 'Phân tích: khung chương trình', make: T => ({ type: 'bc_tele_chrome', t0: T, t1: T + 10, show: 'SOI KỸ', sides: ['BẠN', 'THÓI QUEN'] }) },
      { type: 'bc_tele_freeze', label: 'Phân tích: dừng hình + vẽ', make: T => ({ type: 'bc_tele_freeze', t0: T, t1: T + 2.4, cut: true, label: { big: 'ĐIỂM MẤU CHỐT', small: 'NHÌN KỸ', at: 1 } }) },
      { type: 'bc_tele_board', label: 'Phân tích: bảng điện thoại', make: T => ({ type: 'bc_tele_board', t0: T, t1: T + 4.5, cut: true, title: 'Một buổi sáng', items: ['Tin nhắn mới', 'Email công việc', 'Nhắc lịch họp', 'Thông báo ứng dụng'], freeze_at: 2.6, ring: [0, 2], label: { big: 'QUÁ NHIỀU', small: 'TẮT BỚT', color: 'cyan' } }) },
      { type: 'bc_tele_rows', label: 'Phân tích: bảng tóm tắt', make: T => ({ type: 'bc_tele_rows', t0: T, t1: T + 4, cut: true, title: 'Cần làm gì', items: [{ icon: 'moon', text: 'Ngủ sớm' }, { icon: 'cup', text: 'Uống nước' }, { icon: 'phone', text: 'Cất điện thoại' }] }) },
      { type: 'bc_tele_stamp', label: 'Phân tích: dấu chốt', make: T => ({ type: 'bc_tele_stamp', t0: T, t1: T + 1.8, text: 'ĐƠN GIẢN', sub: 'CHỈ MỘT VIỆC' }) },
      { type: 'bc_tele_rewind', label: 'Phân tích: tua lại', make: T => ({ type: 'bc_tele_rewind', t0: T, t1: T + 1.4, cut: true, span: 2.5 }) },
      { type: 'bc_holo_chrome', label: 'Hologram: khung HUD', make: T => ({ type: 'bc_holo_chrome', t0: T, t1: T + 10, subject: 'CHỦ ĐỀ // QUÉT' }) },
      { type: 'bc_holo_scan', label: 'Hologram: quét vật thể', make: T => ({ type: 'bc_holo_scan', t0: T, t1: T + 4.5, cut: true, model: 'phone', title: 'Điện thoại', locks: [{ part: 'notif', label: 'Thông báo', at: 2 }, { part: 'camera', label: 'Camera', at: 2.9 }], card: { label: 'Thông báo', value: 'TẮT', at: 3.3 }, dock: { label: 'Thông báo', on: false, t: T + 4.2 } }) },
      { type: 'bc_holo_list', label: 'Hologram: bàn xoay danh sách', make: T => ({ type: 'bc_holo_list', t0: T, t1: T + 5, cut: true, items: [{ icon: 'moon', label: 'Ngủ', at: .8 }, { icon: 'heart', label: 'Vận động', at: 1.8 }, { icon: 'user', label: 'Bạn bè', at: 2.8 }] }) },
      { type: 'bc_holo_target', label: 'Hologram: khoá mục tiêu', make: T => ({ type: 'bc_holo_target', t0: T, t1: T + 2.5, x: 470, y: 640, w: 170, h: 170, label: 'Mục tiêu', value: 'Đã khoá' }) },
      { type: 'bc_holo_card', label: 'Hologram: thẻ giá trị', make: T => ({ type: 'bc_holo_card', t0: T, t1: T + 3, label: 'Kết quả', value: 'Sẵn sàng' }) },
    ],
    // Starter edit per sub-style (opts.variant). Graphics are placed on the captions: list / source / object words, the
    // payoff on the last caption. Edit the texts in Studio: they are taken from the speech.
    recipe: ctx => {
      const o = ctx.opts || {}, dur = ctx.dur, caps = ctx.captions || [], vt = o.variant || 'capnews', title = ctx.title || 'Bản tin hôm nay';
      const r2 = x => Math.round(x * 100) / 100, sc = [], free = (a, b) => !sc.some(s => s.cut && s.t0 < b + .3 && a < s.t1 + .3);
      const after = (T, n) => caps.filter(c => c.t0 >= T - .05).slice(0, n);
      const fw = (ns, a = 0) => (typeof findWord === 'function' ? findWord(caps, ns, a) : null);
      const lastCap = caps[caps.length - 1], payoff = lastCap ? lastCap.t0 : Math.max(0, dur - 2);
      const kwOf = c => { const i = kwIndex(c.words); return i >= 0 ? c.words[i].w.replace(/[.,!?]/g, '') : short(capText(c), 14); };
      const titleWords = String(title).toUpperCase().split(/\s+/);
      if (vt === 'package') {
        const s1 = Math.min(2, dur * .2);
        sc.push({ type: 'bc_pkg_sting', t0: 0, t1: r2(s1), title: title.toUpperCase(), dateline: o.dateline || 'MỘT CHỦ ĐỀ · MỘT BẢN TIN' });
        sc.push({ type: 'bc_pkg_badge', t0: r2(s1 - .15), t1: dur, keep: true });
        const pts = [.35, .55, .72].map(f => caps.find(c => c.t0 >= dur * f)).filter(Boolean).filter((c, i, a) => a.indexOf(c) === i);
        const mmss = x => `00:${String(Math.floor(x)).padStart(2, '0')}`.slice(-5);
        const rows = pts.map(c => ({ text: short(capText(c), 20), tc: mmss(c.t0) }));
        if (dur >= 12 && rows.length) sc.push({ type: 'bc_pkg_rundown', t0: r2(s1 + .3), t1: r2(Math.min(s1 + 3.6, dur * .32)), cut: true, title: title, mono: `MỘT CHỦ ĐỀ · ${rows.length} Ý`, items: rows });
        const strap = [{ t: r2(s1), tab: 'HÔM NAY', head: short(title, 26), sub: o.sub || '' }];
        pts.forEach((c, i) => {
          strap.push({ t: r2(c.t0), tab: `${String(i + 1).padStart(2, '0')} · ${kwOf(c).toUpperCase()}`, head: short(capText(c), 26), sub: o.sub || '' });
          const nx = after(c.t0, 3);
          if (i === 1 && dur >= 16 && free(c.t0, c.t0 + 3.6)) sc.push({ type: 'bc_pkg_cards', t0: r2(c.t0), t1: r2(Math.min(c.t0 + 3.8, dur - 3.4)), cut: true, eyebrow: `ĐIỂM ${String(i + 1).padStart(2, '0')}`, title: short(capText(c), 30), items: nx.map((q, j) => ({ icon: iconFor(capText(q)), text: short(kwOf(q), 14), t: r2(q.t0 + .1 + (j ? 0 : .5)) })) });
        });
        const recapT = Math.max(dur - 3.2, dur * .7);
        sc.push({ type: 'bc_pkg_strap', t0: r2(s1), t1: r2(recapT), items: strap });
        if (dur >= 12 && rows.length) sc.push({ type: 'bc_pkg_rundown', t0: r2(recapT), t1: dur, keep: true, cut: true, recap: true, items: rows.map((rw, i) => ({ text: rw.text, t: r2(recapT + .9 + i * .55) })) });
        return { caption_style: 'none', scenes: sc };
      }
      if (vt === 'tele') {
        sc.push({ type: 'bc_tele_chrome', t0: 0, t1: dur, keep: true, show: o.show || 'SOI KỸ', sides: o.sides || ['BẠN', 'VẤN ĐỀ'], flip_t: r2(payoff) });
        let fT = fw(['quan trọng', 'vấn đề', 'bí quyết', 'thời gian', 'công cụ', 'chỉ cần', 'đây'], 1.5); if (fT == null || fT > dur - 6) fT = dur * .25;
        const fc = caps.find(c => c.t1 > fT) || null;
        sc.push({ type: 'bc_tele_freeze', t0: r2(fT), t1: r2(Math.min(fT + 2.3, dur - 1)), cut: true, label: { big: fc ? short(capText(fc), 18).toUpperCase() : 'ĐIỂM MẤU CHỐT', small: 'ĐIỂM MẤU CHỐT', at: 1 } });
        if (dur >= 14) {
          const bT = Math.max(fT + 3, dur * .48), items = after(bT, 4).map(c => short(capText(c), 24));
          if (items.length >= 2 && bT + 4.4 < dur - 2) sc.push({ type: 'bc_tele_board', t0: r2(bT), t1: r2(bT + 4.4), cut: true, title: short(title, 28), items, freeze_at: 2.6, ring: [0, Math.min(2, items.length - 1)], label: { big: 'NHÌN LẠI', small: 'ĐIỀU CẦN BỎ', color: 'cyan' } });
        }
        if (dur >= 20) { const rT = Math.min(dur - 6, payoff - 3.9), items = after(rT - 2.5, 3).map(c => ({ text: short(kwOf(c), 16), icon: iconFor(capText(c)) })); if (free(rT, rT + 3.6)) sc.push({ type: 'bc_tele_rows', t0: r2(rT), t1: r2(rT + 3.6), cut: true, title: 'Tóm lại', items }); }
        if (payoff < dur - .8) sc.push({ type: 'bc_tele_stamp', t0: r2(payoff), t1: r2(Math.min(dur, payoff + 1.8)), text: o.stamp || 'CHỐT LẠI', sub: o.stamp_sub || '' });
        return { caption_style: 'bc_tele', scenes: sc };
      }
      if (vt === 'holo') {
        sc.push({ type: 'bc_holo_chrome', t0: 0, t1: dur, keep: true, subject: o.subject || `${short(titleWords.slice(0, 2).join(' '), 16).toUpperCase()} // QUÉT` });
        const OBJ = [['điện thoại', 'phone'], ['máy tính', 'laptop'], ['laptop', 'laptop'], ['sách', 'book'], ['cà phê', 'cup'], ['cốc', 'cup'], ['video', 'monitor'], ['clip', 'monitor'], ['màn hình', 'monitor']];
        let sT0 = null, model = o.model || 'phone';
        for (const [w, mdl] of OBJ) { const x = fw([w], 1.2); if (x != null && x < dur - 6 && (sT0 == null || x < sT0)) { sT0 = x; if (!o.model) model = mdl; } }
        if (sT0 == null) sT0 = Math.min(dur * .2, dur - 6);
        const mv = MODEL_VI[model] || 'VẬT THỂ', parts = Object.keys(modelOf(model).parts).filter(k => k !== 'body').slice(0, 2);
        const PART_VI = { screen: 'MÀN HÌNH', notif: 'THÔNG BÁO', camera: 'CAMERA', grid: 'ỨNG DỤNG', keyboard: 'BÀN PHÍM', cover: 'BÌA', title: 'TÊN SÁCH', spine: 'GÁY', rim: 'MIỆNG CỐC', handle: 'QUAI', play: 'NỘI DUNG', timeline: 'DÒNG THỜI GIAN', stand: 'CHÂN ĐẾ' };
        const s1 = Math.min(sT0 + 4.6, dur - 2);
        sc.push({ type: 'bc_holo_scan', t0: r2(sT0), t1: r2(s1), cut: true, model, title: mv, locks: parts.map((pt, i) => ({ part: pt, label: PART_VI[pt] || pt, at: 1.9 + i * .9 })), card: { label: 'ĐỐI TƯỢNG', value: mv, at: 3.4 }, dock: { label: mv, on: true, t: r2(s1 - .5) } });
        let fx = [];
        if (dur >= 14) {
          const lT = Math.max(s1 + 2.4, dur * .55), its = after(lT + .4, 3);
          if (its.length >= 2 && lT + 5 < dur - .5) { sc.push({ type: 'bc_holo_list', t0: r2(lT), t1: r2(Math.min(lT + 5.2, dur - .5)), cut: true, items: its.map((c, i) => ({ icon: iconFor(capText(c)), label: short(kwOf(c), 14).toUpperCase(), at: .8 + i * 1.3 })) }); fx = [{ t: r2(lT), type: 'glitch' }]; }
        }
        return { caption_style: 'bc_holo', scenes: sc, fx };
      }
      // capnews (default)
      const hook = caps.filter(c => c.t0 < 2.2).slice(0, 2), hEnd = hook.length ? Math.min(2.6, hook[hook.length - 1].t1) : 1.8;
      sc.push({ type: 'bc_capnews_hook', t0: 0, t1: r2(Math.max(1.4, hEnd)) });
      const s0 = Math.max(1.4, hEnd) + .05, s1 = s0 + 2.3;
      if (dur >= 10) {
        sc.push({ type: 'bc_capnews_sting', t0: r2(s0), t1: r2(s1), title: o.sting || `${titleWords.slice(0, -1).join(' ')} |${titleWords[titleWords.length - 1]}|`, chip: o.chip || 'Góc nhìn nhanh' });
        sc.push({ type: 'bc_capnews_badge', t0: r2(s1 - .1), t1: dur, keep: true, a: titleWords.slice(0, Math.min(2, titleWords.length - 1) || 1).join(' '), b: titleWords.slice(Math.min(2, titleWords.length - 1) || 1, 4).join(' ') });
      }
      const srcT = fw(['theo', 'nguồn', 'nghiên cứu', 'báo cáo', 'khảo sát', 'số liệu'], s1);
      if (srcT != null && srcT < dur - 6) {
        const c = caps.find(q => q.t1 > srcT), nx = after(c.t1, 2);
        sc.push({ type: 'bc_capnews_doc', t0: r2(c.t0), t1: r2(Math.min(c.t0 + 4.2, dur - 1.5)), cut: true, kicker: 'Tài liệu được nhắc tới', title: short(capText(c), 60), lines: nx.map(q => short(capText(q), 40)), hl: [{ line: 'title', at: .7 }], block: kwOf(c).toUpperCase(), block_at: 2.2, source: o.source || 'Ghi nguồn tại đây' });
      }
      let lT = fw(['thứ nhất', 'đầu tiên', 'các bước', 'bước', 'mẹo', 'lý do', 'cách'], s1);
      if (lT == null || lT > dur - 5) lT = Math.max(s1 + .5, dur * .4);
      const li = after(lT, 3);
      if (li.length >= 2 && free(li[0].t0 - .3, li[li.length - 1].t1 + .6) && li[0].t0 < dur - 4) sc.push({ type: 'bc_capnews_list', t0: r2(li[0].t0 - .3), t1: r2(Math.min(dur - 1, Math.max(li[0].t0 + 3, li[li.length - 1].t1 + .6))), cut: true, title: o.list_title || 'Điểm chính', items: li.map(c => ({ text: short(capText(c), 24), t: r2(c.t0) })) });
      if (dur >= 18) {
        const gT = dur * .68, gi = after(gT, 3);
        if (gi.length >= 2 && free(gi[0].t0 - .3, gi[gi.length - 1].t1 + .6) && gi[gi.length - 1].t1 < dur - 1) sc.push({ type: 'bc_capnews_grid', t0: r2(gi[0].t0 - .3), t1: r2(gi[gi.length - 1].t1 + .6), cut: true, title: o.grid_title || '', items: gi.map(c => ({ icon: iconFor(capText(c)), label: short(kwOf(c), 18), t: r2(c.t0) })) });
      }
      return { caption_style: 'bc_capnews', scenes: sc };
    },
  });
})();
