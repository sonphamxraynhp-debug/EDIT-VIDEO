// Pack "explain" — five "explain it visually" talking-head styles, ported (own code) from the MIT-licensed
// ghost-editor recipes by kurbaitaev: clean-os, product-page, stan-style, step-deck, whiteboard.
//   ex_os_*    Clean OS: the idea becomes a state change on a generic phone UI (phone stage, notification stack,
//              settings toggles, battery/ring data moment, red design-tool selection box, markup-pen signature word).
//   ex_pp_*    Product page: white pages with hairline line art and a virtual camera push, two-tier titles
//              (heavy sans + serif italic payoff), hook file card over a speaker card, UI split, drawing gallery.
//   ex_stan_*  Stan style: a screen band at the top behind the head, strip-title hook, [Bước n] labels,
//              one white "how it works" diagram, comment-keyword CTA; small lowercase chest captions.
//   ex_deck_*  Step Deck: navy / off-white / electric-blue full-screen cards, giant italic numeral shrinking into
//              place, phrase growing word by word, words behind the head, counter, caps promise title.
//   ex_board_* Whiteboard: split screen, marker board above (drawn stroke by stroke with a visible marker),
//              speaker below, eraser wipe between pages, seam pill captions.
// Recipe: ctx.opts.variant = 'os' | 'product' | 'stan' | 'deck' | 'board'. Doc: references/pack-explain.md.
(() => {
  const P = 'explain';
  const h = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const f0 = v => (+v).toFixed(0), f1 = v => (+v).toFixed(1), f2 = v => (+v).toFixed(2), f3 = v => (+v).toFixed(3);
  const brand = () => (typeof TL !== 'undefined' && TL && TL.brand) || {};
  const FONT = {
    inter: "'Inter','Be Vietnam Pro',sans-serif",
    tight: "'Inter Tight','Inter','Be Vietnam Pro',sans-serif",
    serif: "'Playfair Display','DM Serif Display',serif",
    sign: "'Pacifico','Be Vietnam Pro',cursive",
    // Caveat has no Vietnamese tone-mark glyphs, so the board writes in rounded Nunito with a hand wobble.
    hand: "'Nunito','Be Vietnam Pro',sans-serif",
    mont: "'Montserrat','Be Vietnam Pro',sans-serif",
  };
  const ACC = { blue: '#0A84FF', orange: '#FF9F0A', green: '#30D158', red: '#FF453A' };
  const accent = s => s.color || (s.accent && ACC[s.accent]) || s.accent || brand().primary || ACC.blue;
  const face = () => TL.face || { x: DIMS()[0] / 2, y: DIMS()[1] * .41 };
  // Chest band under the chin (captions / word cards never sit on the mouth): ~340 px under the face point.
  const chest = (d = 0) => clamp(face().y + 340 + d, 800, 1080);
  const hasCut = () => !!(TL && TL.aroll && TL.aroll.cutouts);
  const capAt = t => (TL.captions || []).find(c => t >= c.t0 && t < c.t1 && !c.hidden);
  const wordAt = t => { const c = capAt(t); if (!c) return null; let w = null; for (const x of c.words) if (t >= x.s) w = x; return w; };
  const atEnd = s => s.keep || s.t1 >= (TL.duration || 1e9) - .05; // scenes running to the end of the video don't animate out
  // Speaker (main track) cover-cropped into a w×h box, face kept at fpy of the box height. At full frame size this is
  // pixel-identical to the plain talking head, so a stage can shrink out of it seamlessly.
  function spk(t, w, hh, o = {}) {
    const [W, H] = DIMS(), fc = face();
    const k = Math.max(w / W, hh / H) * (o.zoom || 1);
    const ox = clamp(w / 2 - fc.x * k, w - W * k, 0), oy = clamp(hh * (o.fpy ?? .42) - fc.y * k, hh - H * k, 0);
    return `<div style="position:absolute;left:${f1(ox)}px;top:${f1(oy)}px;width:${W}px;height:${H}px;transform:scale(${k.toFixed(4)});transform-origin:0 0">${arollImg(t, o.filter || '')}</div>`;
  }
  const lerpR = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });
  const box = (r, inner, st = '') => `<div style="position:absolute;left:${f1(r.x)}px;top:${f1(r.y)}px;width:${f1(r.w)}px;height:${f1(r.h)}px;overflow:hidden;${st}">${inner}</div>`;

  // ---------- generic app icons (own simple glyphs, no brands) ----------
  const GLYPH = {
    mail: 'M3 6h18v12H3z M3 7l9 6 9-6', chat: 'M4 5h16v11H9l-5 4z', bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0',
    clock: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 7v5l3 3', cal: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5',
    gear: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
    play: 'M8 5v14l11-7z', doc: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7', photo: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6',
    spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z', folder: 'M3 6h6l2 2h10v11H3z', cart: 'M3 4h3l2 11h11l2-8H7 M9 20h.01 M18 20h.01',
    user: 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M4 21c1-4 4-6 8-6s7 2 8 6', search: 'M4 10a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M15 15l5 5',
    mic: 'M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 11a7 7 0 0 0 14 0 M12 18v3', video: 'M3 6h12v12H3z M15 10l6-3v10l-6-3z',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', check: 'M5 12l5 5 9-10', cloud: 'M7 18h10a4 4 0 0 0 0-8a6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z',
    heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z', music: 'M9 18V5l11-2v13 M6 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M17 16a3 3 0 1 0 6 0',
    moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z', battery: 'M3 8h16v8H3z M21 11v2', book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z M20 4h-4a2 2 0 0 0-2 2',
  };
  const ICOL = { mail: '#2F7BFF', chat: '#34C759', bell: '#FF3B30', clock: '#1C1C1E', cal: '#FF3B30', gear: '#8E8E93', play: '#FF2D55', doc: '#007AFF',
    photo: '#FF9500', spark: '#AF52DE', folder: '#0A84FF', cart: '#FF9F0A', user: '#5856D6', search: '#636366', mic: '#FF375F', video: '#30B0C7',
    bolt: '#FFCC00', check: '#30D158', cloud: '#64D2FF', heart: '#FF2D55', music: '#FC3C44', moon: '#5E5CE6', battery: '#30D158', book: '#FF9500' };
  const glyph = (name, sz, col = '#fff', sw = 2) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" style="display:block;fill:none;stroke:${col};stroke-width:${sw};stroke-linecap:round;stroke-linejoin:round">
    <path d="${GLYPH[name] || GLYPH.spark}"/></svg>`;
  function appIcon(name, sz, col) {
    const c = col || ICOL[name] || '#0A84FF';
    if (name && !GLYPH[name] && !/^[a-z]+$/.test(name)) // emoji / text glyph
      return `<span style="flex:none;display:inline-flex;align-items:center;justify-content:center;width:${sz}px;height:${sz}px;border-radius:${f1(sz * .23)}px;background:${c};font-size:${f0(sz * .58)}px;line-height:1">${h(name)}</span>`;
    return `<span style="flex:none;display:inline-flex;align-items:center;justify-content:center;width:${sz}px;height:${sz}px;border-radius:${f1(sz * .23)}px;
      background:linear-gradient(160deg,color-mix(in srgb,${c} 78%,#fff),${c});box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)">${glyph(name, Math.round(sz * .56), '#fff', 2.2)}</span>`;
  }
  // `*word*` = serif italic voice inside a title / card line.
  const rich = (text, css) => h(text).replace(/\*([^*]+)\*/g, `<span style="${css}">$1</span>`);

  // =====================================================================================================
  // 1. CLEAN OS
  // =====================================================================================================
  const frost = (a = .8) => `background:rgba(246,246,248,${a});backdrop-filter:blur(18px) saturate(1.6);-webkit-backdrop-filter:blur(18px) saturate(1.6)`;
  function notifCard(it, c, w) {
    const o = typeof it === 'string' ? { title: it } : it;
    return `<div${cidOf(o)} style="display:flex;gap:14px;align-items:center;width:${w}px;padding:14px 16px;border-radius:24px;${frost(.82)};box-shadow:0 10px 30px rgba(0,0,0,.18);font-family:${FONT.inter};color:#111">
      ${appIcon(o.icon || 'mail', 50)}
      <div style="flex:1;min-width:0;line-height:1.22">
        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:600;color:#6b6b70;letter-spacing:-.01em"><span>${h(o.app || 'Thư')}</span><span>${h(o.time || 'bây giờ')}</span></div>
        <div style="font-size:19px;font-weight:700;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h(o.title || '')}</div>
        ${o.text ? `<div style="font-size:17px;font-weight:400;color:#2b2b2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h(o.text)}</div>` : ''}</div></div>`;
  }
  const toggle = (on, c, k = 1) => {
    const p = clamp(on);
    return `<span style="flex:none;position:relative;width:${f0(56 * k)}px;height:${f0(34 * k)}px;border-radius:${f0(17 * k)}px;background:color-mix(in srgb,${c} ${f0(p * 100)}%,#E5E5EA)">
      <i style="position:absolute;top:${f0(3 * k)}px;left:${f1((3 + 22 * p) * k)}px;width:${f0(28 * k)}px;height:${f0(28 * k)}px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.25)"></i></span>`;
  };
  const cursorSvg = sz => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.3-3.5-6.8L4 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

  const OS = {
    // Phone stage: the talking head shrinks out of the full frame into a generic phone (island, status bar) over the
    // blurred footage; optional notification banner drops in at notif_t. cover.
    ex_os_phone(s, t, lt) {
      const c = accent(s), [W, H] = DIMS();
      const pw = s.w || 400, ph = Math.round(pw * 2.05), cx = s.x ?? W / 2, cy = s.y ?? H / 2 - 20;
      const m = E.outCubic(prog(lt, s.shrink_at ?? 0, .6)) * ((TL.duration && s.t1 >= TL.duration - .05) || s.keep ? 1 : 1 - E.inOutSine(prog(t, s.t1 - .55, .5)));
      const R = lerpR({ x: 0, y: 0, w: W, h: H }, { x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph }, m);
      const bz = 11 * m, rad = 60 * m;
      const bg = `<div class="full" style="overflow:hidden">${arollImg(t, 'blur(28px) brightness(.78) saturate(1.15)', 'transform:scale(1.18)')}</div>
        <div class="full" style="background:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.28))"></div>`;
      const sw = R.w - 2 * bz, sh = R.h - 2 * bz;
      let notif = '';
      if (s.notif) {
        const n = typeof s.notif === 'string' ? { title: s.notif } : s.notif, nt = n.t ?? s.notif_t ?? s.t0 + .9;
        const k = E.outBack(prog(t, nt, .45), 1.3), y = lerp(-120, 52, k);
        if (t >= nt) notif = `<div style="position:absolute;left:12px;top:${f1(y)}px;opacity:${f3(clamp(k * 2))};transform:scale(${f3(lerp(.9, 1, clamp(k)))})">${notifCard({ app: 'Nhắc nhở', icon: 'bell', ...n }, c, sw - 24)}</div>`;
      }
      const sb = `<div style="position:absolute;left:0;right:0;top:0;height:54px;display:flex;justify-content:space-between;align-items:center;padding:0 34px 0 40px;opacity:${f3(m)};
        font:600 19px/1 ${FONT.inter};color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.45)"><span>${h(s.time || '9:41')}</span>
        <span style="display:flex;gap:6px;align-items:center"><i style="width:22px;height:11px;border:2px solid #fff;border-radius:4px;display:inline-block;position:relative"><b style="position:absolute;inset:1px;right:5px;background:#fff;border-radius:2px"></b></i></span></div>
        <div style="position:absolute;left:50%;top:13px;width:118px;height:34px;margin-left:-59px;border-radius:17px;background:#000;opacity:${f3(m)}"></div>`;
      const screen = box({ x: bz, y: bz, w: sw, h: sh }, `${spk(t, sw, sh, { fpy: s.fpy ?? .42 })}${sb}${notif}`, `border-radius:${f1(Math.max(0, rad - bz))}px`);
      const phone = box(R, screen, `overflow:visible;border-radius:${f1(rad)}px;background:#0b0b0c;box-shadow:0 0 0 ${f1(2 * m)}px #3a3a3e,0 30px 70px rgba(0,0,0,${f2(.45 * m)})`);
      return { back: `<div class="full"${cidOf(s)}>${m > .001 ? bg : ''}${phone}</div>`, cover: true };
    },

    // Notification stack (frosted cards) dropping in one by one above the head. items:[{app,icon,title,text,time}].
    ex_os_notifs(s, t, lt) {
      const c = accent(s), [W] = DIMS(), w = s.w || 600, x = s.x ?? W / 2, y = s.y ?? 150, st = s.stagger ?? .35, a0 = s.at ?? .1;
      const items = s.items || [{ app: 'Thư', icon: 'mail', title: 'Sếp: cần gấp trước 5 giờ', text: 'Bạn xem lại giúp anh bản này nhé' }, { app: 'Tin nhắn', icon: 'chat', title: 'Nhóm dự án (12)', text: 'Ai làm phần dựng video?' }, { app: 'Lịch', icon: 'cal', title: 'Họp lúc 15:00', text: 'Còn 10 phút' }];
      const cards = items.map((it, i) => {
        const k = E.outBack(prog(lt, a0 + i * st, .42), 1.2);
        if (lt < a0 + i * st) return '';
        return `<div style="margin-bottom:10px;opacity:${f3(clamp(k * 2))};transform:translateY(${f1((1 - clamp(k)) * -46)}px) scale(${f3(lerp(.94, 1, clamp(k)))})">${notifCard(it, c, w)}</div>`;
      }).join('');
      const n = items.filter((_, i) => lt >= a0 + i * st).length, kb = E.outBack(prog(lt, a0 + (n - 1) * st, .3), 2.5);
      const badge = s.badge !== false && n ? `<div style="position:absolute;right:-14px;top:-16px;min-width:40px;height:40px;padding:0 10px;border-radius:20px;background:${ACC.red};color:#fff;
        font:700 22px/40px ${FONT.inter};text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.3);transform:scale(${f3(clamp(kb, 0, 1.3))})">${(s.badge_from || 0) + n}</div>` : '';
      return { front: `<div class="abs"${cidOf(s)} style="left:${f1(x - w / 2)}px;top:${f1(y)}px;width:${w}px">${badge}${cards}</div>` };
    },

    // Settings card: rows with toggles that flip at rows[i].t (state change lands on the word). on = start state.
    ex_os_toggle(s, t, lt) {
      const c = accent(s), [W] = DIMS(), w = s.w || 560, x = s.x ?? W / 2, y = s.y ?? 140;
      const rows = s.rows || [{ label: 'Thông báo', icon: 'bell', on: true, t: s.t0 + 1 }, { label: 'Tự động phát', icon: 'play', on: true, t: s.t0 + 1.5 }, { label: 'Chế độ tập trung', icon: 'moon', on: false, t: s.t0 + 2 }];
      const k = E.outCubic(prog(lt, 0, .35));
      const rh = rows.map((r, i) => {
        const fl = r.t != null ? E.inOutSine(prog(t, r.t, .22)) : 0, on = r.on ? 1 - fl : fl;
        const hl = r.t != null && t >= r.t - .05 && t < r.t + .6 ? .5 * (1 - prog(t, r.t + .2, .4)) : 0;
        return `<div${cidOf(r)} style="display:flex;align-items:center;gap:16px;padding:12px 18px;${i ? 'border-top:1px solid #E6E6EA;' : ''}background:color-mix(in srgb,${c} ${f0(hl * 22)}%,transparent)">
          ${appIcon(r.icon || 'gear', 40, r.color)}<span style="flex:1;font:500 24px/1.2 ${FONT.inter};letter-spacing:-.02em;color:#111">${h(r.label)}</span>${toggle(on, c)}</div>`;
      }).join('');
      return { front: `<div class="abs"${cidOf(s)} style="left:${f1(x - w / 2)}px;top:${f1(y)}px;width:${w}px;opacity:${f3(k)};transform:translateY(${f1((1 - k) * 40)}px)">
        <div style="font:700 30px/1 ${FONT.inter};letter-spacing:-.04em;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.45);margin:0 0 12px 8px">${h(s.title ?? 'cài đặt')}</div>
        <div style="border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 14px 40px rgba(0,0,0,.28)">${rh}</div></div>` };
    },

    // Data moment beside the head: ring % or battery counting from→to over [count_at, count_at+count_dur] (relative).
    ex_os_ring(s, t, lt) {
      const [W] = DIMS(), x = s.x ?? W - 140, y = s.y ?? 300, sz = s.size || 150;
      const k = E.inOutSine(prog(lt, s.count_at ?? .3, s.count_dur ?? 1.8)), v = Math.round(lerp(s.from ?? 100, s.to ?? 12, k));
      const col = s.color || (v > 50 ? ACC.green : v > 20 ? ACC.orange : ACC.red), e = E.outBack(prog(lt, 0, .4), 1.6);
      let g;
      if (s.mode === 'battery') {
        g = `<div style="position:relative;width:${sz}px;height:${f0(sz * .5)}px;border:5px solid #fff;border-radius:${f0(sz * .12)}px;box-shadow:0 6px 20px rgba(0,0,0,.35)">
          <div style="position:absolute;left:5px;top:5px;bottom:5px;width:calc(${f1(v)}% - 10px);border-radius:${f0(sz * .07)}px;background:${col}"></div>
          <i style="position:absolute;right:-14px;top:30%;width:8px;height:40%;border-radius:0 4px 4px 0;background:#fff"></i>
          <b style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:800 ${f0(sz * .24)}px/1 ${FONT.inter};color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.5)">${v}%</b></div>`;
      } else {
        const r = 44, C = 2 * Math.PI * r;
        g = `<div style="position:relative;width:${sz}px;height:${sz}px;border-radius:50%;${frost(.25)};box-shadow:0 8px 24px rgba(0,0,0,.3)">
          <svg viewBox="0 0 100 100" width="${sz}" height="${sz}" style="position:absolute;inset:0;transform:rotate(-90deg)"><circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="9"/>
          <circle cx="50" cy="50" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${f2(C)}" stroke-dashoffset="${f2(C * (1 - v / 100))}"/></svg>
          <b style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:800 ${f0(sz * .26)}px/1 ${FONT.inter};letter-spacing:-.04em;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.45)">${v}%</b></div>`;
      }
      const lab = s.label !== '' ? `<div style="margin-top:12px;font:600 22px/1.2 ${FONT.inter};letter-spacing:-.03em;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6);white-space:nowrap">${h(s.label || 'năng lượng')}</div>` : '';
      return { front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) scale(${f3(clamp(e, 0, 1.2))});opacity:${f3(clamp(e * 2))};display:flex;flex-direction:column;align-items:center">${g}${lab}</div>` };
    },

    // Red design-tool selection box with handles + cursor on a word card on the chest. mode 'focus' | 'reject'
    // (reject: struck through and deleted at reject_at). Hides captions (one text layer).
    ex_os_select(s, t, lt) {
      const [W] = DIMS(), x = s.x ?? W / 2, y = s.y ?? chest(), size = s.size || 60, col = s.color || '#FF3B30';
      const kw = clamp(prog(lt, 0, .25)), bl = (1 - kw) * 10;
      const sel = s.sel_at ?? .45, ks = E.outCubic(prog(lt, sel, .25));
      const rej = s.mode === 'reject' ? E.inOutSine(prog(lt, s.reject_at ?? 1.3, .35)) : 0;
      const word = `<span style="position:relative;display:inline-block;padding:.08em .22em;font:800 ${size}px/1.1 ${FONT.inter};letter-spacing:-.05em;text-transform:lowercase;color:#fff;
        text-shadow:0 3px 18px rgba(0,0,0,.45);filter:blur(${f1(bl)}px);opacity:${f3(kw * (1 - rej * .9))}">${h(s.text || 'không cần thiết')}
        ${rej > 0 ? `<i style="position:absolute;left:0;top:52%;height:6px;width:${f1(rej * 100)}%;background:${col};border-radius:3px"></i>` : ''}
        <i style="position:absolute;inset:-6px;border:2.5px solid ${col};background:color-mix(in srgb,${col} ${f0(lerp(0, 22, ks))}%,transparent);opacity:${f3(ks)}"></i>
        ${[[0, 0], [100, 0], [0, 100], [100, 100]].map(([a, b]) => `<i style="position:absolute;left:calc(${a}% - 6px + ${a ? 6 : -6}px);top:calc(${b}% - 6px + ${b ? 6 : -6}px);width:12px;height:12px;background:#fff;border:2.5px solid ${col};opacity:${f3(ks)}"></i>`).join('')}
        <b style="position:absolute;left:-8px;top:-40px;padding:3px 9px;background:${col};color:#fff;font:600 17px/1.2 ${FONT.inter};letter-spacing:0;opacity:${f3(ks)}">${h(s.label || 'Chữ')}</b></span>`;
      const kc = E.outCubic(prog(lt, sel - .35, .4)), click = prog(lt, sel, .18);
      const cur = `<div style="position:absolute;left:100%;top:100%;transform:translate(${f1(lerp(160, -2, kc))}px,${f1(lerp(140, -6, kc))}px) scale(${f3(1 - .2 * Math.sin(Math.PI * click))});opacity:${f3(clamp(kc * 2) * (1 - rej))}">${cursorSvg(40)}</div>`;
      return { front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%);white-space:nowrap"><div style="position:relative;display:inline-block">${word}${cur}</div></div>`, hideCaptions: s.hideCaptions ?? true };
    },

    // Markup pen: tool palette slides up, the pen writes the signature word (Pacifico) left to right in the accent colour.
    ex_os_pen(s, t, lt) {
      const c = accent(s), [W] = DIMS(), x = s.x ?? W / 2, y = s.y ?? chest(), size = s.size || 78;
      const kp = E.outCubic(prog(lt, 0, .4)), w0 = s.write_at ?? .35, wd = s.write_dur ?? 1.1, kw = E.inOutSine(prog(lt, w0, wd));
      const lift = clamp(prog(lt, w0 + wd, .3));
      const tools = ['#111', c, '#7a7a80', '#d9d9de'].map((col, i) => `<div style="width:30px;height:${i === 1 ? 78 : 62}px;border-radius:15px 15px 4px 4px;background:linear-gradient(180deg,${col} 0 28%,#f4f4f6 28%);box-shadow:0 0 0 1px rgba(0,0,0,.08)"></div>`).join('');
      const dots = ['#111', ACC.blue, ACC.green, c].map(col => `<i style="width:26px;height:26px;border-radius:50%;background:${col};${col === c ? 'box-shadow:0 0 0 3px #fff,0 0 0 5px ' + col : ''}"></i>`).join('');
      const pal = `<div class="abs" style="left:50%;top:${f1(1150 + (1 - kp) * 160)}px;transform:translateX(-50%);display:flex;align-items:flex-end;gap:16px;padding:12px 22px 0;border-radius:26px 26px 0 0;${frost(.9)};height:96px;box-shadow:0 -6px 30px rgba(0,0,0,.2)">
        ${tools}<span style="width:1px;height:50px;background:#ccc;margin:0 4px 20px"></span><div style="display:flex;gap:12px;margin-bottom:28px">${dots}</div></div>`;
      const nib = `<div style="position:absolute;left:${f1(kw * 100)}%;top:62%;transform:translate(-4px,-100%) translate(${f1(lift * 60)}px,${f1(lift * -60)}px) rotate(32deg);transform-origin:0 100%;opacity:${f3(clamp(prog(lt, w0 - .2, .2)) * (1 - lift))}">
        <div style="width:16px;height:150px;border-radius:8px 8px 2px 2px;background:linear-gradient(90deg,#e8e8ec,#fff 45%,#cfcfd6);box-shadow:0 6px 16px rgba(0,0,0,.35);position:relative">
        <i style="position:absolute;left:3px;bottom:-14px;border-left:5px solid transparent;border-right:5px solid transparent;border-top:16px solid ${c}"></i></div></div>`;
      const word = `<div style="position:relative;display:inline-block;padding:0 .2em;font:400 ${size}px/1.5 ${FONT.sign};color:${c};text-shadow:0 0 1px #fff,0 4px 24px rgba(0,0,0,.35);white-space:nowrap">
        <span style="display:inline-block;clip-path:inset(-30% ${f2((1 - kw) * 100)}% -30% -5%)">${h(s.text || 'thành công')}</span>${nib}</div>`;
      return { front: `${pal}<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(${s.rot ?? -4}deg)">${word}</div>`, hideCaptions: s.hideCaptions ?? true };
    },
  };

  // =====================================================================================================
  // 2. PRODUCT PAGE
  // =====================================================================================================
  const PP = { page: '#FDFDFD', ink: '#0F0E0E', card: '#181519', l1: '#9A9A9A', l2: '#B2B2B2', l3: '#C8C8C8', grey: '#F2F2F7',
    hook: 'linear-gradient(180deg,#FDFDFD 0%,#FDFDFD 46%,#F6F6F6 52%,#E3E3E3 58%,#BDBDBD 65%,#898989 71%,#7A7A7A 100%)',
    split: 'linear-gradient(180deg,#F3F3F3 0%,#F3F3F3 62%,#EEEEEE 71%,#D5D5D5 77%,#B7B7B7 87%,#A1A1A1 100%)' };
  const ppAcc = s => s.color || brand().primary || '#D94C5F';
  // Hairline line art (200×200), grey strokes + one black live part animated from lt.
  function ppArt(kind, lt, sz, s = {}) {
    const L = (d, c = PP.l1, w = 1.6) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    let g = '';
    if (kind === 'phone') {
      g = L('M48 34h80a12 12 0 0 1 12 12v124a12 12 0 0 1-12 12H48a12 12 0 0 1-12-12V46a12 12 0 0 1 12-12z', PP.l3) +
        L('M60 22h80a12 12 0 0 1 12 12v124a12 12 0 0 1-12 12H60a12 12 0 0 1-12-12V34a12 12 0 0 1 12-12z') + L('M84 30h32', PP.l2);
      const hop = Math.floor(lt * (s.rate || 2.2)) % 12;
      for (let i = 0; i < 12; i++) {
        const cx = 62 + (i % 3) * 26, cy = 44 + Math.floor(i / 3) * 28;
        g += i === hop ? `<rect x="${cx}" y="${cy}" width="20" height="20" rx="5" fill="${PP.ink}"/>` : `<rect x="${cx}" y="${cy}" width="20" height="20" rx="5" fill="none" stroke="${PP.l2}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
      }
    } else if (kind === 'book') {
      const sw = Math.sin(lt * 2.2) * 6;
      g = L('M50 40l70-14 34 20v120l-70 14-34-20z', PP.l2) + L('M50 40v120l34 20V60z') + L('M84 60l70-14') + L('M88 72l58-11 M88 84l58-11 M88 96l40-8', PP.l3) +
        `<path d="M132 52 L132 ${f1(150 + sw)} L138 ${f1(144 + sw)} L144 ${f1(148 + sw)} L144 50z" fill="${PP.ink}"/>`;
    } else if (kind === 'cup') {
      g = L('M52 80h86v56a28 28 0 0 1-28 28H80a28 28 0 0 1-28-28z') + L('M138 92h10a16 16 0 0 1 0 32h-10') + L('M40 172h120', PP.l3);
      for (let i = 0; i < 3; i++) { const ph = lt * 1.6 + i * 1.3, yy = 70 - ((ph * 18) % 40); g += `<path d="M${76 + i * 20} ${f1(yy)}q6 -8 0 -16q-6 -8 0 -16" fill="none" stroke="${PP.ink}" stroke-width="2.6" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="${f2(.9 - ((ph * 18) % 40) / 50)}"/>`; }
    } else if (kind === 'stairs') {
      g = L('M20 176h36v-30h36v-30h36v-30h36v-30', PP.l1) + L('M164 56v-36l22 9-22 9', PP.l2);
      const n = Math.min(4, Math.floor(lt * (s.rate || 1.6))), f = (lt * (s.rate || 1.6)) % 1, k = n >= 4 ? 0 : Math.sin(Math.PI * clamp(f / .5)) * (f < .5 ? 1 : 0);
      g += `<circle cx="${f1(38 + n * 36 + (f < .5 && n < 4 ? f * 2 * 36 : 0))}" cy="${f1(166 - n * 30 - k * 26)}" r="8" fill="${PP.ink}"/>`;
    } else if (kind === 'box') {
      const a = Math.sin(lt * 2) * 12 + 20;
      g = L('M50 80l50-24 50 24v70l-50 24-50-24z') + L('M50 80l50 24 50-24 M100 104v70', PP.l2) +
        `<path d="M100 56l-50 24 l-22 ${f1(-a)}l50 -24z" fill="${PP.ink}"/>`;
    } else { // bulb
      const p = .6 + .4 * Math.abs(Math.sin(lt * 3));
      g = L('M100 30a46 46 0 0 1 28 82c-6 5-8 12-8 20H80c0-8-2-15-8-20a46 46 0 0 1 28-82z') + L('M82 146h36 M84 158h32 M90 170h20', PP.l2) +
        `<path d="M88 132l4-34 8 14 8-14 4 34" fill="none" stroke="${PP.ink}" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity="${f2(p)}"/>` + L('M100 6v10 M40 30l7 7 M160 30l-7 7 M22 80h10 M168 80h10', PP.l3);
    }
    return `<svg viewBox="0 0 200 200" width="${sz}" height="${sz}" style="display:block;overflow:visible">${g}</svg>`;
  }
  // Two-tier title: tier A (Inter Tight 800) rises with blur; tier B (Playfair italic) revealed left to right.
  function ppTitle(s, t, y, a = s.title || 'Một trang', b = s.title_b || '', t0) {
    const ta = E.outExpo(prog(t, t0, .5)), tb = E.inOutSine(prog(t, t0 + .35, .55));
    const A = a ? `<div style="font:800 ${s.size_a || Math.min(60, Math.round(1150 / Math.max(1, Array.from(a).length)))}px/1.04 ${FONT.tight};letter-spacing:-.03em;color:${PP.ink};transform:translateY(${f1((1 - ta) * 190)}px);opacity:${f3(clamp(ta * 1.6))};filter:blur(${f1((1 - clamp(ta * 1.4)) * 8)}px)">${h(a)}</div>` : '';
    const B = b ? `<div style="font:italic 600 ${s.size_b || Math.min(96, Math.round(1180 / Math.max(1, Array.from(b).length)))}px/1.02 ${FONT.serif};letter-spacing:-.02em;color:${PP.ink};margin-top:-.06em;clip-path:inset(-20% ${f2((1 - tb) * 100)}% -20% 0);opacity:${f3(clamp(tb * 4))}">${h(b)}</div>` : '';
    return `<div class="abs" style="left:40px;right:40px;top:${y}px;text-align:center">${A}${B}</div>`;
  }
  // The one spoken word in a grey pill (captions are off over pages).
  function ppPill(t, y, show = 1) {
    const w = wordAt(t);
    if (!w || show <= 0) return '';
    return `<div class="abs" style="left:0;right:0;top:${y}px;display:flex;justify-content:center;opacity:${f3(show)}"><span style="height:64px;padding:0 12px;border-radius:7px;background:rgba(0,0,0,.45);
      color:#fff;font:700 44px/64px ${FONT.tight};letter-spacing:-.4px;white-space:nowrap">${h(w.w)}</span></div>`;
  }
  const PPM = {
    // Hook: gradient page, dark file card with badge, 2-3 tier headline (*word* = serif italic), speaker in a rounded card below. cover.
    ex_pp_hook(s, t, lt) {
      const c = ppAcc(s), [W, H] = DIMS(), top = s.card_y ?? 660;
      const lines = s.lines || ['Một cuốn sách', 'đổi cách tôi', '*dùng điện thoại*'];
      const head = lines.map((L, i) => {
        const ser = /^\*.*\*$/.test(L), k = E.outCubic(prog(lt, .05 + i * .12, .4));
        return `<div style="font:${ser ? `italic 600 ${s.size_b || 70}px/1.05 ${FONT.serif}` : `800 ${s.size_a || 52}px/1.08 ${FONT.tight}`};letter-spacing:${ser ? '-.02em' : '-.035em'};color:${PP.ink};
          opacity:${f3(k)};transform:translateY(${f1((1 - k) * 24)}px)">${h(L.replace(/^\*|\*$/g, ''))}</div>`;
      }).join('');
      const kc = E.outBack(prog(lt, 0, .45), 1.4);
      const card = `<div style="position:relative;display:inline-block;width:420px;padding:22px 26px;border-radius:16px;background:${PP.card};text-align:center;box-shadow:0 14px 30px rgba(0,0,0,.25);
        transform:scale(${f3(clamp(kc, 0, 1.2))});opacity:${f3(clamp(kc * 2))}">
        <div style="font:600 32px/1.2 ${FONT.inter};color:#fff;letter-spacing:-.02em;white-space:nowrap">${h(s.name || 'Tên sản phẩm (ví dụ)')}</div>
        <div style="margin-top:8px;font:500 20px/1.2 ${FONT.inter};color:#BDBDBD;white-space:nowrap"><span style="color:#8E8E92">›</span> ${h(s.sub || 'Thương hiệu · 2026')}</div>
        <div style="position:absolute;right:-26px;top:-30px;transform:rotate(8deg)">${s.badge_img ? `<img src="${url(s.badge_img)}" style="width:86px;height:86px;object-fit:cover;border-radius:14px;box-shadow:0 10px 26px rgba(0,0,0,.3)">` : appIcon(s.icon || 'book', 84, c)}</div></div>`;
      const plate = box({ x: 14, y: top, w: W - 28, h: H - top + 40 }, spk(t, W - 28, H - top + 40, { fpy: .4 }), 'border-radius:44px;box-shadow:0 -10px 40px rgba(0,0,0,.18)');
      return { back: `<div class="full"${cidOf(s)} style="background:${PP.hook}">${plate}<div class="abs" style="left:0;right:0;top:${s.y ?? 150}px;text-align:center">${card}<div style="margin-top:34px">${head}</div></div></div>`, cover: true, hideCaptions: s.hideCaptions ?? true };
    },
    // White page: hairline drawing pushed in by the virtual camera, zoom-out + two-tier title at title_t, word pill. cover.
    ex_pp_page(s, t, lt) {
      const [W] = DIMS(), sz = s.size || 440, tt = s.title_t ?? s.t0 + 1.4;
      const push = lerp(.654, 1, E.outExpo(prog(lt, 0, .55))), zo = E.inOutSine(prog(t, tt - .1, .9)), sc = push * lerp(1, .76, zo) * (1 + .03 * lt / 4);
      const art = `<div class="abs" style="left:${f1(W / 2 - sz / 2)}px;top:${f1((s.y ?? 470) - sz / 2)}px;transform:scale(${f3(sc)}) translateY(${f1(-zo * 80)}px);transform-origin:50% 20%">${ppArt(s.art || 'phone', lt, sz, s)}</div>`;
      const title = t >= tt ? ppTitle(s, t, 780, s.title || 'Điện thoại', s.title_b || '*của bạn*'.replace(/\*/g, ''), tt) : '';
      // Exit: an accelerating push into the cut while the white page dissolves into the face over 0.7 s (a white page
      // cutting straight to the footage reads as a flash).
      const ko = atEnd(s) ? 0 : E.inOutSine(prog(t, s.t1 - .7, .7));
      const pg = `<div class="full"${cidOf(s)} style="background:${PP.page};opacity:${f3(1 - ko)};transform:scale(${f3(1 + .12 * ko * ko)})">${art}${title}${ppPill(t, 1040, t < tt ? 1 : 1 - clamp(prog(t, tt, .1)))}</div>`;
      return { back: (ko > 0 ? arollImg(t) : '') + pg, cover: true, hideCaptions: true };
    },
    // Split: rebuilt UI on a light page (alert with a pressed button, or a list whose toggles go off on their words),
    // speaker in a rounded card at the bottom. cover.
    ex_pp_split(s, t, lt) {
      const c = ppAcc(s), [W, H] = DIMS(), top = s.card_y ?? 800, ui = s.ui || {};
      const ki = E.outExpo(prog(lt, .05, .5));
      let inner;
      if (ui.kind === 'list') {
        const rows = ui.rows || [{ label: 'Mạng xã hội', icon: 'chat', t: s.t0 + 1 }, { label: 'Video ngắn', icon: 'video', t: s.t0 + 1.6 }, { label: 'Trò chơi', icon: 'play', t: s.t0 + 2.2 }];
        inner = `<div style="width:520px;border-radius:20px;background:#fff;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.10)">
          <div style="padding:16px 22px;font:700 28px/1.2 ${FONT.inter};letter-spacing:-.02em;color:#111;border-bottom:1px solid #eee">${h(ui.title || 'Thông báo')}</div>
          ${rows.map((r, i) => { const off = r.t != null ? E.inOutSine(prog(t, r.t, .22)) : 0, hl = r.t != null && t > r.t - .05 && t < r.t + .5 ? .35 : 0;
            return `<div${cidOf(r)} style="display:flex;align-items:center;gap:14px;padding:12px 22px;${i ? 'border-top:1px solid #f0f0f0;' : ''}background:color-mix(in srgb,${c} ${f0(hl * 50)}%,#fff)">${appIcon(r.icon || 'bell', 38)}
              <span style="flex:1;font:500 24px/1.2 ${FONT.inter};color:#111">${h(r.label)}</span>${toggle(1 - off, ACC.green)}</div>`; }).join('')}</div>`;
      } else {
        const pt = ui.press_t ?? s.t0 + 1.6, pr = t >= pt && t < pt + .25 ? 1 : 0, gone = E.inOutSine(prog(t, pt + .35, .3));
        const btn = (txt, i) => `<div style="flex:1;padding:14px 0;text-align:center;font:${i === (ui.press ?? 0) ? 600 : 400} 24px/1.2 ${FONT.inter};color:${ACC.blue};
          background:${pr && i === (ui.press ?? 0) ? '#D1D1D6' : 'transparent'};${i ? 'border-left:1px solid #D8D8DC;' : ''}">${h(txt)}</div>`;
        inner = `<div style="width:420px;border-radius:22px;${frost(.92)};box-shadow:0 18px 50px rgba(0,0,0,.10);overflow:hidden;opacity:${f3(1 - gone)};transform:scale(${f3(1 - gone * .08)})">
          <div style="padding:24px 26px 18px;text-align:center"><div style="margin:0 auto 12px;width:max-content">${appIcon(ui.icon || 'bell', 54, c)}</div>
          <div style="font:700 25px/1.25 ${FONT.inter};letter-spacing:-.02em;color:#111">${h(ui.title || 'Cho phép gửi thông báo?')}</div>
          <div style="margin-top:6px;font:400 19px/1.3 ${FONT.inter};color:#3a3a3c">${h(ui.text || 'Thông báo có thể gồm âm thanh và biểu tượng.')}</div></div>
          <div style="display:flex;border-top:1px solid #D8D8DC">${(ui.buttons || ['Không cho phép', 'Cho phép']).map(btn).join('')}</div></div>`;
      }
      const panel = `<div class="abs" style="left:0;right:0;top:${f1((s.ui_y ?? 380) + (1 - ki) * 60)}px;display:flex;justify-content:center;transform:translateY(-50%);opacity:${f3(clamp(ki * 1.5))}">${inner}</div>`;
      const cw = Math.round(W * .87), plate = box({ x: (W - cw) / 2, y: top, w: cw, h: H - top + 40 }, spk(t, cw, H - top + 40, { fpy: s.fpy ?? .55 }), 'border-radius:40px');
      return { back: `<div class="full"${cidOf(s)} style="background:${PP.split}">${plate}${panel}${ppPill(t, top - 92)}</div>`, cover: true, hideCaptions: true };
    },
    // Gallery: a spoken list as drawings, one tile per item at items[i].t; at hl_t one tile lights up, the rest soften;
    // two-tier title at title_t. cover.
    ex_pp_gallery(s, t, lt) {
      const c = ppAcc(s), items = s.items || [{ art: 'phone', label: 'Điện thoại' }, { art: 'book', label: 'Sách' }, { art: 'cup', label: 'Trà' }, { art: 'stairs', label: 'Từng bước' }, { art: 'bulb', label: 'Ý tưởng' }, { art: 'box', label: 'Đơn giản' }];
      const cols = [16, 255, 493], rows = [170, 445], cw = 211, ch = 247, hlt = s.hl_t, hi = s.hl ?? 0, tt = s.title_t ?? s.t0 + Math.min(2.4, (s.t1 - s.t0) * .55);
      const tiles = items.slice(0, 6).map((it, i) => {
        const ti = it.t ?? s.t0 + .1 + i * (s.stagger ?? .28), k = E.outExpo(prog(t, ti, .45));
        if (t < ti) return '';
        const lit = hlt != null && t >= hlt ? E.outCubic(prog(t, hlt, .3)) : 0, me = i === hi;
        return `<div${cidOf(it)} class="abs" style="left:${cols[i % 3]}px;top:${rows[Math.floor(i / 3)]}px;width:${cw}px;height:${ch}px;border-radius:22px;background:#fff;border:1px solid #E8E8E8;
          box-shadow:${me && lit ? `0 0 0 ${f1(4 * lit)}px ${c},` : ''}18px 22px 42px rgba(0,0,0,.08);opacity:${f3(clamp(k * 1.5) * (me ? 1 : 1 - .6 * lit))};transform:translateY(${f1((1 - k) * 120)}px) scale(${f3(me ? 1 + .04 * lit : 1)});
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">${ppArt(it.art || 'bulb', t - ti, 150, it)}
          <span style="font:600 20px/1.2 ${FONT.inter};color:#555;letter-spacing:-.01em">${h(it.label || '')}</span></div>`;
      }).join('');
      return { back: `<div class="full"${cidOf(s)} style="background:${PP.page}">${tiles}${t >= tt ? ppTitle(s, t, 800, s.title || 'Bớt một chút', s.title_b || 'sống nhiều hơn', tt) : ppPill(t, 1040)}</div>`, cover: true, hideCaptions: true };
    },
  };

  // =====================================================================================================
  // 3. STAN STYLE
  // =====================================================================================================
  const stanBandH = s => s.band_h ?? (hasCut() ? face().y - 40 : Math.max(280, face().y - 205));
  function stanApp(s, t, w, hh) {
    const c = accent(s), sc = s.screen || {}, kind = sc.kind || 'app';
    if (sc.media) return `<img src="${media(sc.media, t)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${sc.fit || 'cover'};object-position:${sc.pos || '50% 0%'}">`;
    const lt = t - s.t0, scroll = sc.scroll ? E.inOutSine(prog(lt, .6, Math.max(1, s.t1 - s.t0 - 1))) * (sc.scroll === true ? 120 : sc.scroll) : 0;
    const nav = `<div style="height:58px;display:flex;align-items:center;gap:14px;padding:0 24px;border-bottom:1px solid #ececf0;background:#fff">
      <span style="width:30px;height:30px;border-radius:9px;background:${c}"></span><b style="font:700 21px/1 ${FONT.inter};color:#111;letter-spacing:-.02em">${h(sc.app || 'Công cụ (ví dụ)')}</b>
      <span style="flex:1"></span>${['Dự án', 'Mẫu', 'Xuất'].map(x => `<span style="font:500 17px/1 ${FONT.inter};color:#6b6b72">${x}</span>`).join('')}</div>`;
    let body;
    if (kind === 'chat') {
      const q = sc.prompt || 'Viết 5 ý tưởng video về nấu ăn nhanh', ch = Array.from(q), n = Math.floor(clamp((lt - .3) * 32, 0, ch.length));
      const ans = sc.lines || ['1. Bữa sáng 5 phút', '2. Món chay dễ làm', '3. Mẹo đi chợ tiết kiệm'];
      const a0 = .3 + ch.length / 32 + .3;
      body = `<div style="padding:20px 26px;display:flex;flex-direction:column;gap:12px">
        <div style="align-self:flex-end;max-width:76%;padding:12px 16px;border-radius:18px 18px 4px 18px;background:${c};color:#fff;font:500 20px/1.3 ${FONT.inter}">${h(ch.slice(0, n).join(''))}${n < ch.length ? '▍' : ''}</div>
        ${ans.map((L, i) => { const k = clamp(prog(lt, a0 + i * .35, .3)); return lt < a0 + i * .35 ? '' : `<div style="max-width:84%;padding:10px 16px;border-radius:16px;background:#f2f2f6;color:#111;font:500 19px/1.3 ${FONT.inter};opacity:${f3(k)}">${h(L)}</div>`; }).join('')}</div>`;
    } else {
      const ct = sc.click_t ?? s.t0 + 1.2, kc = E.inOutSine(prog(t, ct - .6, .55)), pressed = t >= ct && t < ct + .18, done = t >= ct + .2;
      const prompt = sc.prompt || 'kéo thả video vào đây';
      const res = (sc.cards || ['Phụ đề', 'Hiệu ứng', 'Nhạc nền']).map((x, i) => { const k = E.outCubic(prog(t, ct + .3 + i * .15, .35));
        return `<div style="flex:1;height:120px;border-radius:14px;background:linear-gradient(135deg,color-mix(in srgb,${c} 30%,#fff),#f4f4f8);border:1px solid #e6e6ec;padding:12px;opacity:${f3(done ? k : 0)};transform:translateY(${f1((1 - k) * 20)}px)">
          <div style="width:34px;height:34px;border-radius:9px;background:${c};opacity:.85"></div><div style="margin-top:12px;font:600 17px/1.2 ${FONT.inter};color:#222">${h(x)}</div></div>`; }).join('');
      body = `<div style="padding:22px 26px">
        <div style="font:800 30px/1.15 ${FONT.inter};letter-spacing:-.03em;color:#111">${h(sc.heading || 'Tạo video trong vài phút')}</div>
        <div style="display:flex;gap:12px;margin-top:16px;align-items:center"><div style="flex:1;height:54px;border-radius:14px;border:2px dashed #c9c9d2;display:flex;align-items:center;padding:0 16px;font:500 18px/1 ${FONT.inter};color:#7a7a84">${h(prompt)}</div>
          <div style="height:54px;padding:0 22px;border-radius:14px;background:${c};color:#fff;font:700 19px/54px ${FONT.inter};transform:scale(${pressed ? .94 : 1});box-shadow:0 0 0 ${pressed ? 6 : 0}px color-mix(in srgb,${c} 30%,transparent)">${h(sc.button || 'Bắt đầu')}</div></div>
        <div style="display:flex;gap:12px;margin-top:18px">${res}</div></div>`;
      const cx = lerp(w * .25, w - 90, kc), cy = lerp(hh - 20, 58 + 22 + 30 + 16 + 27 + 10, kc);
      body += `<div style="position:absolute;left:${f1(cx)}px;top:${f1(cy)}px;transform:scale(${pressed ? .85 : 1})">${cursorSvg(34)}</div>`;
    }
    return `<div style="position:absolute;inset:0;background:#fff;font-family:${FONT.inter}">${nav}<div style="position:relative;transform:translateY(${f1(-scroll)}px)">${body}</div></div>`;
  }
  const strip = (txt, size, o = {}) => `<span style="display:inline-block;padding:${o.pad || '.1em .32em .14em'};background:${o.bg || '#fff'};color:${o.fg || '#000'};font:${o.w || 700} ${size}px/1.15 ${FONT.inter};letter-spacing:-.025em;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.18)">${h(txt)}</span>`;
  const STAN = {
    // Screen band at the top, edge to edge, behind the head (cutouts) or ending above it. screen:{kind:'app'|'chat', media, …}.
    ex_stan_screen(s, t, lt) {
      const [W] = DIMS(), bh = stanBandH(s), k = E.outBack(prog(lt, 0, .35), 1.2);
      const band = `<div class="abs"${cidOf(s)} style="left:0;top:0;width:${W}px;height:${f0(bh)}px;overflow:hidden;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.35);
        transform:translateY(${f1((1 - clamp(k)) * -40)}px) scale(${f3(lerp(.96, 1, clamp(k)))});transform-origin:50% 0">${stanApp(s, t, W, bh)}</div>`;
      return { back: band, person: hasCut() };
    },
    // Hook: icon row(s) + black-on-white strip title lines, above the head.
    ex_stan_hook(s, t, lt) {
      const [W] = DIMS(), y = s.y ?? 150, icons = s.icons || ['video', 'doc', 'chat', 'spark'];
      const row = icons.map((ic, i) => { const k = E.outBack(prog(lt, .05 + i * .08, .35), 2); return `<span style="display:inline-block;transform:scale(${f3(clamp(k, 0, 1.3))});opacity:${f3(clamp(k * 2))}">${appIcon(ic, 66)}</span>`; }).join('<span style="width:14px;display:inline-block"></span>');
      const lines = (s.lines || ['hướng dẫn tự động hoá AI', 'cho ý tưởng nội dung']).map((L, i) => {
        const k = E.outCubic(prog(lt, .3 + i * .15, .3));
        return `<div style="margin-top:${i ? 2 : 0}px;clip-path:inset(0 ${f2((1 - k) * 100)}% 0 0)">${strip(L, i ? 32 : 40)}</div>`;
      }).join('');
      return { front: `<div class="abs"${cidOf(s)} style="left:0;width:${W}px;top:${y}px;text-align:center"><div style="display:flex;justify-content:center;align-items:center;margin-bottom:22px">${row}</div>${lines}</div>` };
    },
    // Step label under the chin: «[Bước n]», imperative title strip, app icons. Hides captions (one text layer).
    ex_stan_step(s, t, lt) {
      const [W] = DIMS(), y = s.y ?? chest(10), k = E.outBack(prog(lt, 0, .32), 1.8), k2 = E.outCubic(prog(lt, .12, .3));
      const icons = (s.icons || []).map(ic => appIcon(ic, 44)).join('');
      return { front: `<div class="abs"${cidOf(s)} style="left:0;width:${W}px;top:${y}px;text-align:center">
        <div style="display:inline-block;font:800 30px/1.2 ${FONT.inter};color:#fff;letter-spacing:-.01em;text-shadow:0 2px 10px rgba(0,0,0,.6);transform:scale(${f3(clamp(k, 0, 1.2))});opacity:${f3(clamp(k * 2))}">[${h(s.label || 'Bước ' + (s.num ?? 1))}]</div>
        <div style="margin-top:8px;clip-path:inset(0 ${f2((1 - k2) * 100)}% 0 0)">${strip(s.text || 'Tạo một kênh riêng', 36)}</div>
        ${icons ? `<div style="display:flex;justify-content:center;gap:10px;margin-top:12px;opacity:${f3(k2)}">${icons}</div>` : ''}</div>`, hideCaptions: s.hideCaptions ?? true };
    },
    // White "how it works" diagram: sources (bottom) → tool (middle) → one bold output word (top), lines drawn on,
    // entered by a zoom-blur. cover.
    ex_stan_diagram(s, t, lt) {
      const [W, H] = DIMS(), c = accent(s);
      const src = s.sources || [{ icon: 'video', label: 'Video' }, { icon: 'doc', label: 'Ghi chú' }, { icon: 'chat', label: 'Bình luận' }];
      const tool = s.tool || { icon: 'spark', label: 'Công cụ AI' }, out = s.output || 'Ý tưởng';
      const ez = E.outCubic(prog(lt, 0, .45)), st = s.stagger ?? .22;
      const sy = 980, ty = 640, oy = 330, xs = src.map((_, i) => W / 2 + (i - (src.length - 1) / 2) * Math.min(220, 600 / Math.max(1, src.length - 1 || 1)));
      const node = (x, y, ic, lab, k, big) => `<div class="abs" style="left:${f1(x)}px;top:${f1(y)}px;transform:translate(-50%,-50%) scale(${f3(clamp(k, 0, 1.2))});opacity:${f3(clamp(k * 2))};text-align:center">
        <div style="display:inline-flex;padding:${big ? 18 : 12}px;border-radius:${big ? 30 : 22}px;background:#fff;border:2.5px solid #111;box-shadow:6px 7px 0 #111">${appIcon(ic, big ? 74 : 54)}</div>
        <div style="margin-top:10px;font:700 ${big ? 28 : 22}px/1.2 ${FONT.inter};color:#111;white-space:nowrap">${h(lab)}</div></div>`;
      let lines = '', nodes = '';
      xs.forEach((x, i) => {
        const k = E.outBack(prog(lt, .3 + i * st, .35), 1.8), kl = E.inOutSine(prog(lt, .5 + i * st, .45));
        nodes += node(x, sy, src[i].icon || 'doc', src[i].label || '', k);
        const d = `M${f1(x)} ${sy - 66} C ${f1(x)} ${ty + 120} ${f1(W / 2)} ${ty + 170} ${f1(W / 2)} ${ty + 86}`;
        lines += `<path d="${d}" pathLength="1" fill="none" stroke="#111" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="1" stroke-dashoffset="${f3(1 - kl)}"/>`;
      });
      const tk = .5 + src.length * st, kt = E.outBack(prog(lt, tk, .4), 1.8), kl2 = E.inOutSine(prog(lt, tk + .3, .4)), ko = E.outBack(prog(lt, tk + .6, .45), 2.2);
      nodes += node(W / 2, ty, tool.icon || 'spark', tool.label || '', kt, true);
      lines += `<path d="M${W / 2} ${ty - 80} L ${W / 2} ${oy + 70}" pathLength="1" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-dasharray="1" stroke-dashoffset="${f3(1 - kl2)}"/>`;
      const word = `<div class="abs" style="left:0;right:0;top:${oy}px;text-align:center;transform:translateY(-50%) scale(${f3(clamp(ko, 0, 1.3))});opacity:${f3(clamp(ko * 2))}">
        <span style="font:900 ${s.size || 92}px/1 ${FONT.inter};letter-spacing:-.05em;color:#111">${h(out)}</span></div>`;
      const title = s.title ? `<div class="abs" style="left:0;right:0;top:150px;text-align:center;opacity:${f3(ez)}">${strip(s.title, 30, { bg: '#111', fg: '#fff' })}</div>` : '';
      return { back: `<div class="full"${cidOf(s)} style="background:#fff;transform:scale(${f3(lerp(1.3, 1, ez))});filter:blur(${f1((1 - ez) * 12)}px)">
        <div class="full" style="background-image:radial-gradient(#d9d9de 1.4px,transparent 1.4px);background-size:28px 28px;opacity:.7"></div>
        <svg class="full" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="position:absolute;inset:0">${lines}</svg>${nodes}${word}${title}</div>`, cover: true, hideCaptions: true };
    },
    // Comment-keyword CTA on the chest: «Bình luận "từ khoá"» typed in a comment bar + what you get.
    ex_stan_cta(s, t, lt) {
      const c = accent(s), [W] = DIMS(), y = s.y ?? chest(10), kw = s.keyword || 'kịch bản', ch = Array.from(kw), n = Math.floor(clamp((lt - .45) * 14, 0, ch.length));
      const k = E.outBack(prog(lt, 0, .4), 1.5), sent = n >= ch.length ? E.outBack(prog(lt, .45 + ch.length / 14 + .2, .3), 3) : 0;
      return { front: `<div class="abs"${cidOf(s)} style="left:0;width:${W}px;top:${y}px;text-align:center;opacity:${f3(clamp(k * 2))};transform:translateY(${f1((1 - clamp(k)) * 50)}px)">
        <div style="margin-bottom:12px">${strip(s.label || 'bình luận từ khoá để nhận', 28, { w: 600 })}</div>
        <div style="display:inline-flex;align-items:center;gap:14px;width:600px;padding:12px 12px 12px 16px;border-radius:999px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.3);text-align:left">
          ${appIcon('user', 46, '#8E8E93')}<span style="flex:1;font:700 28px/1.2 ${FONT.inter};color:#111">«${h(ch.slice(0, n).join(''))}${n < ch.length ? '▍' : ''}»</span>
          <span style="display:inline-flex;width:54px;height:54px;border-radius:50%;background:${c};align-items:center;justify-content:center;transform:scale(${f3(1 + .25 * Math.sin(Math.PI * clamp(sent)))})">${glyph('bolt', 28)}</span></div>
        ${s.gift ? `<div style="margin-top:12px;font:600 24px/1.2 ${FONT.inter};color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.6)">→ ${h(s.gift)}</div>` : ''}</div>`, hideCaptions: s.hideCaptions ?? true };
    },
  };

  // =====================================================================================================
  // 4. STEP DECK
  // =====================================================================================================
  const DK = { navy: '#0B1829', navy2: '#13253B', page: '#F1F1F1', cream: '#EAE4C0', ink: '#0F1827', warm: '#FAE9D4', red: '#D30B20', blue: '#2534E9',
    grad: 'linear-gradient(90deg,#FF6A2B,#FF4A4A,#FF2D7A,#E040A8,#C04AE0,#9A5CF0,#6E7CFF,#5A9BFF)' };
  const LOOKS = {
    navy: { bg0: '#13253B', bg1: '#0B1829', n0: '#83878C', n1: '#606368', words: '#FCFEFF', shadow: .4 },
    white: { bg0: '#FDFDFD', bg1: '#F0F0F0', n0: '#E0E0E2', n1: '#C5C5C7', words: '#0E1828', shadow: 0 },
    blue: { bg0: '#2F26F1', bg1: '#2019DB', n0: '#8A83F3', n1: '#655DE4', words: '#FFFFFF', shadow: .35 },
    cream: { bg0: '#F2EDCF', bg1: '#EAE4C0', n0: '#D6CFA6', n1: '#BDB58A', words: '#141414', shadow: 0 },
  };
  const ROT = ['navy', 'white', 'blue'];
  const FLICK = [1, .32, .6, .34, .74, 1];
  const flick = (t, t0) => { const i = Math.floor((t - t0) * 30); return i < 0 ? 0 : i >= FLICK.length ? 1 : FLICK[i]; };
  // Words markup: *serif payoff*, [blue box], !flicker. Each word appears at t0 + i*stagger (or words[i].t).
  function deckWords(s, t, L, base, maxw = 640) {
    const raw = s.words || String(s.text || '').split(/\s+/).filter(Boolean).map(w => ({ w }));
    const st = s.stagger ?? .22, a0 = s.t0 + (s.words_at ?? .3);
    let serifOn = false;
    return raw.map((o, i) => {
      let w = o.w, ser = false, boxw = false, fl = false;
      if (w.startsWith('*')) serifOn = true;
      ser = serifOn; if (w.endsWith('*')) serifOn = false;
      w = w.replace(/\*/g, '');
      if (/^\[.*\]$/.test(w)) { boxw = true; w = w.slice(1, -1); }
      if (w.startsWith('!')) { fl = true; w = w.slice(1); }
      const tw = o.t ?? a0 + i * st, on = t >= tw;
      const op = !on ? 0 : fl ? flick(t, tw) : i === 0 ? clamp(prog(t, tw, .2)) : 1;
      const ty = i === 0 && on ? (1 - E.outCubic(prog(t, tw, .2))) * 20 : 0;
      const kb = boxw ? E.outCubic(prog(t, tw - .15, .3)) : 0;
      const css = ser ? `font:italic 500 ${f0(base * 1.15)}px/1.05 ${FONT.serif};letter-spacing:-.02em` : `font:600 ${base}px/1.08 ${FONT.tight};letter-spacing:-.04em`;
      return `<span style="position:relative;display:inline-block;margin:0 .13em;${css};color:${boxw && kb > .5 ? '#fff' : L.words};opacity:${f3(op)};transform:translateY(${f1(ty)}px)">
        ${boxw ? `<i style="position:absolute;left:-.12em;right:-.12em;top:.06em;bottom:-.02em;background:${DK.blue};transform:scaleX(${f3(kb)});z-index:-1"></i>` : ''}${h(w)}</span>`;
    }).join(' ');
  }
  const deckBg = L => `background:radial-gradient(ellipse 80% 60% at 50% 48%,${L.bg0},${L.bg1})`;
  const DECK = {
    // Step card: rotating colour field, giant italic numeral shrinks into place out of a blur, words land on top.
    ex_deck_numeral(s, t, lt) {
      const [W, H] = DIMS(), num = s.num ?? 1, L = LOOKS[s.look || ROT[(Math.max(1, +num || 1) - 1) % 3]] || LOOKS.navy;
      const k = 1 - Math.pow(1 - clamp(prog(lt, 0, .88)), 3), sc = lerp(1.48, 1, k) * (1 + .05 * clamp(lt / 3)), bl = (1 - clamp(prog(lt, 0, .5))) * 14;
      const glow = (1 - E.outCubic(prog(lt, .25, .4))) * .8;
      const numEl = `<div class="abs" style="left:${f1(W * .485)}px;top:${f1(H * .493)}px;transform:translate(-50%,-50%) scale(${f3(sc)});filter:blur(${f1(bl)}px);
        font:italic 500 ${s.num_size || 660}px/1 ${FONT.serif};letter-spacing:-.04em;background:linear-gradient(180deg,${L.n0},${L.n1});-webkit-background-clip:text;background-clip:text;color:transparent;
        text-shadow:0 0 ${f0(60 * glow)}px rgba(255,255,255,${f2(glow * .5)})">${h(num)}</div>`;
      const words = `<div class="abs" style="left:30px;right:30px;top:${s.y ?? H / 2}px;transform:translateY(-50%);text-align:center;${L.shadow ? `text-shadow:0 4px 30px rgba(0,0,0,${L.shadow})` : ''}">${deckWords({ ...s, words_at: s.words_at ?? .4 }, t, L, s.size || 70)}</div>`;
      const lab = s.label ? `<div class="abs" style="left:0;right:0;top:${(s.y ?? H / 2) - 130}px;text-align:center;font:500 30px/1 ${FONT.serif};letter-spacing:.12em;text-transform:uppercase;color:${L.words};opacity:${f3(.75 * clamp(prog(lt, .2, .3)))};transform:scaleX(.88)">${h(s.label)}</div>` : '';
      return { back: `<div class="full"${cidOf(s)} style="${deckBg(L)};overflow:hidden">${numEl}${lab}${words}</div>`, cover: true, hideCaptions: true };
    },
    // Word card: navy (question / turn) | white page (statement) | cream; the phrase grows in place word by word.
    ex_deck_card(s, t, lt) {
      const [, H] = DIMS(), L = LOOKS[s.look || 'navy'] || LOOKS.navy;
      const words = `<div class="abs" style="left:34px;right:34px;top:${s.y ?? H / 2}px;transform:translateY(-50%) scale(${f3(1 + .04 * clamp(lt / 3))});text-align:center;line-height:1.1">${deckWords(s, t, { ...L, words: L === LOOKS.navy ? DK.warm : L.words }, s.size || 64)}</div>`;
      const sub = s.sub ? `<div class="abs" style="left:40px;right:40px;top:${(s.y ?? H / 2) + 150}px;text-align:center;font:italic 500 34px/1.2 ${FONT.serif};color:${L === LOOKS.navy ? DK.warm : L.words};opacity:${f3(clamp(prog(t, s.sub_t ?? s.t0 + 1.2, .25)) * .8)}">${h(s.sub)}</div>` : '';
      return { back: `<div class="full"${cidOf(s)} style="${deckBg(L)}">${words}${sub}</div>`, cover: true, hideCaptions: true };
    },
    // Words behind the head (needs cutouts to overlap; without, the baseline sits on the crown). gradient:true = the
    // reel's one gradient payoff word (Montserrat 800).
    ex_deck_behind(s, t, lt) {
      const [W] = DIMS(), fc = face(), cut = hasCut(), y = s.y ?? (cut ? fc.y - 150 : fc.y - 200), size = s.size || (s.gradient ? 120 : 104);
      const fl = flick(t, s.t0 + .02), rise = (1 - E.outCubic(prog(lt, 0, .35))) * 30, push = lerp(1.18, 1, E.outCubic(prog(lt, 0, .6))) * (1 + .04 * clamp(lt / 3));
      const txt = h(s.text || 'Tại sao');
      const css = s.gradient ? `font:800 ${size}px/1 ${FONT.mont};letter-spacing:-.03em;background:${DK.grad};-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 18px rgba(0,0,0,.25))`
        : s.serif ? `font:italic 500 ${size}px/1 ${FONT.serif};color:#FDFEFC;text-shadow:0 0 24px rgba(0,0,0,.35)` : `font:700 ${size}px/1 ${FONT.tight};letter-spacing:-.045em;color:#FDFEFC;text-shadow:0 0 24px rgba(0,0,0,.35)`;
      const el = `<div class="abs"${cidOf(s)} style="left:${s.x ?? W / 2}px;top:${y}px;transform:translate(-50%,-100%) translateY(${f1(rise)}px) scale(${f3(push)});transform-origin:50% 100%;white-space:nowrap;opacity:${f3(fl)};${css}">${txt}</div>`;
      return { back: el, person: cut, hideCaptions: s.hideCaptions ?? true };
    },
    // Counter card: numeral counts from→to one value per frame over [count_at, +count_dur] (relative), lines below.
    ex_deck_counter(s, t, lt) {
      const [W] = DIMS(), a = s.count_at ?? .3, d = s.count_dur ?? 1, k = clamp(prog(lt, a, d));
      const v = Math.round(lerp(s.from ?? 1, s.to ?? 10, k)), L = LOOKS[s.look || 'white'];
      const ln = (s.lines || ['lần nhanh hơn', '*so với cách cũ*']).map((x, i) => `<div style="margin-top:${i ? 6 : 0}px;opacity:${f3(clamp(prog(lt, a + d * .6 + i * .25, .2)))};${/^\*.*\*$/.test(x) ? `font:italic 500 56px/1.1 ${FONT.serif}` : `font:600 52px/1.1 ${FONT.tight};letter-spacing:-.04em`}">${h(x.replace(/^\*|\*$/g, ''))}</div>`).join('');
      return { back: `<div class="full"${cidOf(s)} style="${deckBg(L)};color:${L.words}">
        <div class="abs" style="left:0;width:${W}px;top:${s.y ?? 500}px;transform:translateY(-50%) scale(${f3(lerp(1.25, 1, E.outCubic(prog(lt, 0, .5))))});text-align:center;font:italic 500 ${s.num_size || 340}px/1 ${FONT.serif};letter-spacing:-.04em">${h(s.prefix || '')}${v}${h(s.suffix || '')}</div>
        <div class="abs" style="left:40px;right:40px;top:${(s.y ?? 500) + 270}px;text-align:center">${ln}</div></div>`, cover: true, hideCaptions: true };
    },
    // Promise title on navy: small serif caps build word by word, then the big caps word stamps in with an RGB split.
    ex_deck_title(s, t, lt) {
      const [W, H] = DIMS(), small = String(s.small || 'ba bước để').split(/\s+/), st = s.stagger ?? .18;
      const sm = small.map((w, i) => `<span style="opacity:${t >= s.t0 + .15 + i * st ? 1 : 0}">${h(w)}</span>`).join(' ');
      const bt = s.big_t ?? s.t0 + .25 + small.length * st, kb = E.outExpo(prog(t, bt, .4)), split = (1 - clamp(prog(t, bt, .5))) * 14 + 2;
      const big = h(s.big || 'LÀM CHỦ'), bsz = s.size || Math.min(128, Math.round(1000 / Math.max(1, Array.from(s.big || 'LÀM CHỦ').length)));
      const layer = (col, dx) => `<div style="position:absolute;left:0;right:0;top:0;color:${col};transform:translateX(${f1(dx)}px);mix-blend-mode:screen">${big}</div>`;
      const bigEl = t >= bt ? `<div style="position:relative;margin-top:14px;height:${f0(bsz * 1.05)}px;font:600 ${bsz}px/1 ${FONT.serif};letter-spacing:.02em;white-space:nowrap;transform:scaleX(.88) scale(${f3(lerp(1.3, 1, kb))});opacity:${f3(clamp(kb * 2))}">
        ${layer('#ff2a2a', -split)}${layer('#2aff6a', 0)}${layer('#3a5bff', split)}</div>` : '';
      return { back: `<div class="full"${cidOf(s)} style="${deckBg(LOOKS.navy)}"><div class="abs" style="left:20px;right:20px;top:${s.y ?? H / 2 - 90}px;text-align:center;color:${DK.warm}">
        <div style="font:500 44px/1.1 ${FONT.serif};letter-spacing:.14em;text-transform:uppercase;transform:scaleX(.88)">${sm}</div>${bigEl}
        ${s.sub ? `<div style="margin-top:20px;font:italic 500 34px/1.2 ${FONT.serif};opacity:${f3(clamp(prog(t, bt + .4, .3)) * .85)}">${h(s.sub)}</div>` : ''}</div></div>`, cover: true, hideCaptions: true };
    },
  };

  // =====================================================================================================
  // 5. WHITEBOARD
  // =====================================================================================================
  const MK = { ink: '#1E1F24', blue: '#1F5FD1', red: '#D7342B', green: '#128A4F', orange: '#E0A100' };
  const mcol = c => MK[c] || c || MK.ink;
  const seg = (a, b, c, d, n = 8) => Array.from({ length: n + 1 }, (_, i) => [lerp(a, c, i / n), lerp(b, d, i / n)]);
  const arc = (cx, cy, rx, ry, a0, a1, n = 28) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
  const poly = (pts, n = 6) => pts.slice(1).flatMap((p, i) => seg(pts[i][0], pts[i][1], p[0], p[1], n).slice(i ? 1 : 0));
  const S = (pts, c) => ({ pts, c });
  // Drawing vocabulary (100×100 box). Each shape = strokes in drawing order; c = marker colour key.
  const SHAPES = {
    bulb: () => [S(arc(50, 38, 24, 24, 140, 400)), S(poly([[31.6, 53.4], [40, 64], [40, 74], [60, 74], [60, 64], [68.4, 53.4]])), S(seg(42, 81, 58, 81)),
      S(poly([[44, 64], [47, 50], [50, 58], [53, 50], [56, 64]]), 'orange'), S(seg(50, 2, 50, 8)), S(seg(17, 13, 22, 18)), S(seg(83, 13, 78, 18)), S(seg(8, 38, 14, 38)), S(seg(86, 38, 92, 38))],
    clock: () => [S(arc(50, 50, 38, 38, -90, 270, 40)), S(seg(50, 14, 50, 20)), S(seg(86, 50, 80, 50)), S(seg(50, 86, 50, 80)), S(seg(14, 50, 20, 50)), S(seg(50, 50, 50, 26), 'red'), S(seg(50, 50, 66, 58), 'red')],
    arrow: () => [S(poly([[8, 62], [36, 46], [64, 50], [88, 38]])), S(poly([[74, 30], [88, 38], [78, 52]]))],
    check: () => [S(poly([[16, 52], [40, 76], [86, 22]]), 'green')],
    cross: () => [S(seg(22, 22, 78, 78), 'red'), S(seg(78, 22, 22, 78), 'red')],
    stick: () => [S(arc(50, 20, 11, 11, -90, 270)), S(seg(50, 31, 50, 64)), S(poly([[28, 38], [50, 46], [72, 38]])), S(poly([[34, 92], [50, 64], [66, 92]]))],
    house: () => [S(poly([[16, 48], [50, 16], [84, 48]])), S(poly([[24, 42], [24, 86], [76, 86], [76, 42]])), S(poly([[43, 86], [43, 64], [57, 64], [57, 86]]), 'blue')],
    target: () => [S(arc(46, 54, 38, 38, 0, 360, 40)), S(arc(46, 54, 25, 25, 0, 360, 32)), S(arc(46, 54, 11, 11, 0, 360, 20), 'red'), S(seg(92, 8, 50, 50), 'blue'), S(poly([[80, 8], [92, 8], [92, 20]]), 'blue')],
    mountain: () => [S(poly([[4, 88], [32, 42], [46, 60], [64, 26], [96, 88]])), S(seg(64, 26, 64, 6), 'red'), S(poly([[64, 6], [80, 11], [64, 16]]), 'red'), S(poly([[14, 88], [22, 78], [30, 88]]), 'blue')],
    chart: () => [S(poly([[12, 10], [12, 88], [92, 88]])), S(poly([[18, 76], [38, 60], [54, 66], [82, 30]]), 'green'), S(poly([[70, 30], [82, 30], [82, 42]]), 'green')],
    key: () => [S(arc(26, 50, 16, 16, 0, 360, 30)), S(seg(42, 50, 92, 50)), S(seg(78, 50, 78, 63)), S(seg(88, 50, 88, 60)), S(arc(26, 50, 5, 5, 0, 360, 14), 'orange')],
    heart: () => [S(Array.from({ length: 41 }, (_, i) => { const a = i / 40 * Math.PI * 2; return [50 + 2.4 * 16 * Math.pow(Math.sin(a), 3), 46 - 2.4 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]; }), 'red')],
    phone: () => [S(poly([[30, 6], [70, 6], [70, 94], [30, 94], [30, 6]])), S(seg(44, 86, 56, 86)), S(poly([[38, 18], [62, 18], [62, 74], [38, 74], [38, 18]]), 'blue')],
    rocket: () => [S(poly([[50, 6], [64, 28], [64, 68], [36, 68], [36, 28], [50, 6]])), S(arc(50, 38, 7, 7, 0, 360, 16), 'blue'), S(poly([[36, 52], [24, 72], [36, 68]])), S(poly([[64, 52], [76, 72], [64, 68]])), S(poly([[42, 70], [50, 92], [58, 70]]), 'orange')],
    video: () => [S(poly([[12, 24], [88, 24], [88, 76], [12, 76], [12, 24]])), S(poly([[42, 38], [62, 50], [42, 62], [42, 38]]), 'red')],
    chain: () => [S(arc(36, 50, 22, 13, 0, 360, 32)), S(arc(64, 50, 22, 13, 0, 360, 32), 'blue')],
    bubble: () => [S(poly([[10, 16], [90, 16], [90, 66], [40, 66], [24, 84], [28, 66], [10, 66], [10, 16]])), S(seg(24, 34, 76, 34), 'blue'), S(seg(24, 48, 60, 48), 'blue')],
    team: () => [S(arc(30, 30, 9, 9, -90, 270)), S(seg(30, 39, 30, 66)), S(poly([[16, 50], [30, 46], [44, 50]])), S(poly([[20, 90], [30, 66], [40, 90]])),
      S(arc(70, 30, 9, 9, -90, 270), 'blue'), S(seg(70, 39, 70, 66), 'blue'), S(poly([[56, 50], [70, 46], [84, 50]]), 'blue'), S(poly([[60, 90], [70, 66], [80, 90]]), 'blue')],
  };
  const SHAPE_NAMES = Object.keys(SHAPES);
  // Hand wobble (low-frequency, seeded) so lines look drawn, not ruled.
  const wob = (pts, seed) => pts.map(([x, y], i) => [x + Math.sin(i * .55 + seed * 1.7) * .9, y + Math.cos(i * .47 + seed * 2.3) * .9]);
  const plen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  function partial(pts, f) {
    if (f >= 1) return { pts, end: pts[pts.length - 1] };
    const L = plen(pts) * f; let acc = 0; const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + d >= L) { const k = (L - acc) / (d || 1), p = [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]; out.push(p); return { pts: out, end: p }; }
      acc += d; out.push(pts[i]);
    }
    return { pts: out, end: pts[pts.length - 1] };
  }
  // Draw a shape progressively: returns svg + marker tip position (in px, relative to the box) or null when lifted.
  function drawShape(name, k, size, color, seed = 1) {
    const strokes = (SHAPES[name] || SHAPES.bulb)().map((st, i) => ({ ...st, pts: wob(st.pts, seed + i) }));
    const GAP = 14, lens = strokes.map(st => plen(st.pts)), total = lens.reduce((a, b) => a + b, 0) + GAP * (strokes.length - 1);
    let pos = clamp(k) * total, tip = null, svg = '';
    strokes.forEach((st, i) => {
      if (pos <= 0) return;
      const f = clamp(pos / lens[i]);
      const p = partial(st.pts, f);
      if (p.pts.length > 1) svg += `<path d="M${p.pts.map(q => `${f2(q[0])} ${f2(q[1])}`).join(' L')}" fill="none" stroke="${st.c ? mcol(st.c) : color}" stroke-width="${f1(Math.max(3, size / 52))}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
      if (f < 1) tip = p.end;
      pos -= lens[i] + GAP;
    });
    return { svg: `<svg viewBox="0 0 100 100" width="${size}" height="${size}" style="display:block;overflow:visible">${svg}</svg>`, tip: tip && k < 1 ? [tip[0] * size / 100, tip[1] * size / 100] : null };
  }
  const markerTip = (x, y, col, o = 1) => `<div class="abs" style="left:${f1(x)}px;top:${f1(y)}px;width:0;height:0;opacity:${f3(o)}"><div style="position:absolute;left:-3px;top:-118px;width:26px;height:120px;transform:rotate(28deg);transform-origin:3px 118px">
    <div style="position:absolute;left:4px;bottom:0;width:8px;height:14px;border-radius:2px 2px 4px 4px;background:${col}"></div>
    <div style="position:absolute;left:0;bottom:12px;width:16px;height:22px;background:#d9d9de;border-radius:3px"></div>
    <div style="position:absolute;left:-2px;bottom:32px;width:20px;height:86px;border-radius:6px;background:linear-gradient(90deg,#f7f7f9,#fff 40%,#d6d6dc);box-shadow:3px 6px 12px rgba(0,0,0,.25)">
      <i style="position:absolute;left:0;right:0;top:0;height:22px;border-radius:6px 6px 0 0;background:${col}"></i></div></div></div>`;
  // Handwritten text revealed letter by letter (Nunito rounded + per-letter wobble), marker following the edge.
  function handText(text, k, size, col, seed = 3, tip = true) {
    const ch = Array.from(String(text || '').normalize('NFC')), n = k * ch.length, idx = Math.floor(n);
    const letters = ch.map((c, i) => `<span style="display:inline-block;${i >= n ? 'opacity:0;' : ''}transform:translateY(${f1(Math.sin(i * 1.3 + seed) * size * .03)}px) rotate(${f1(Math.sin(i * 2.1 + seed) * 2.5)}deg)">${c === ' ' ? '&nbsp;' : h(c)}</span>`).join('');
    const tipEl = tip && k > 0 && k < 1 ? `<span style="position:absolute;left:${f1(clamp(idx / Math.max(1, ch.length)) * 100)}%;top:78%">${markerTip(0, 0, col)}</span>` : '';
    return `<span style="position:relative;display:inline-block;white-space:nowrap;font:800 ${size}px/1.15 ${FONT.hand};color:${col};letter-spacing:.01em">${letters}${tipEl}</span>`;
  }
  // Active board split at t: {m (0..1 how far the board has dropped), seam y}.
  function boardAt(t) {
    for (const s of TL.scenes || []) {
      if (s.hidden || s.type !== 'ex_board_split' || t < s.t0 || t >= s.t1 + .01) continue;
      return { m: boardMix(s, t), y: DIMS()[1] * (s.ratio ?? .5) };
    }
    return null;
  }
  const boardMix = (s, t) => E.outCubic(prog(t, s.t0 + (s.drop_at ?? 0), .5)) * (atEnd(s) ? 1 : 1 - E.inOutSine(prog(t, s.t1 - .5, .5)));
  // A page sits on the board (split active) or draws its own white card.
  function pageWrap(s, t, inner, lt) {
    const [W] = DIMS(), b = boardAt(t), er = s.erase === false ? 0 : E.inOutSine(prog(t, s.t1 - .55, .42));
    const eraser = er > 0 && er < 1 ? `<div class="abs" style="left:${f1(lerp(-120, W + 20, er))}px;top:${f1((b ? b.y : 640) * .5 - 70)}px;width:100px;height:140px;border-radius:14px;background:linear-gradient(180deg,#3b4a63 0 35%,#e9e4d6 35%);box-shadow:4px 8px 16px rgba(0,0,0,.25);transform:rotate(-8deg)"></div>` : '';
    const clip = er > 0 ? `clip-path:inset(0 0 0 ${f2(er * 100)}%);` : '';
    const card = b ? '' : `<div class="abs" style="left:24px;right:24px;top:110px;height:560px;border-radius:24px;background:#FBFBF8;box-shadow:0 14px 40px rgba(0,0,0,.25);opacity:${f3(E.outCubic(prog(lt, 0, .3)))}"></div>`;
    const yOff = b ? (1 - b.m) * -b.y : 0;
    return `${card}<div class="full" style="${clip}transform:translateY(${f1(yOff)}px)">${inner}</div>${eraser}`;
  }
  const BOARD = {
    // Split layout: frame starts as the full face; the white board drops over the top (ratio of the height) and the
    // face slides into the bottom part. Other ex_board_* pages draw on it. cover.
    ex_board_split(s, t, lt) {
      const [W, H] = DIMS(), sy = H * (s.ratio ?? .5), m = boardMix(s, t);
      const R = lerpR({ x: 0, y: 0, w: W, h: H }, { x: 0, y: sy, w: W, h: H - sy }, m);
      const cam = box(R, spk(t, R.w, R.h, { fpy: lerp(.42, .45, m), zoom: s.zoom || 1 }));
      const by = lerp(-sy - 20, 0, m);
      const board = `<div class="abs" style="left:0;top:${f1(by)}px;width:${W}px;height:${f1(sy)}px;background:#FBFBF8;box-shadow:0 6px 18px rgba(0,0,0,.25)">
        <div class="full" style="background:linear-gradient(180deg,rgba(0,0,0,.035),transparent 12%,transparent 88%,rgba(0,0,0,.05))"></div>
        <div class="abs" style="left:0;right:0;bottom:-10px;height:12px;background:linear-gradient(180deg,#cfd2d8,#9ea3ad);box-shadow:0 3px 6px rgba(0,0,0,.25)"></div></div>`;
      return { back: `<div class="full"${cidOf(s)} style="background:#111">${cam}${board}</div>`, cover: true };
    },
    // One page = one drawing (SHAPES) drawn stroke by stroke with the marker, label written under it at label_t,
    // optional extra words [{text,t,x,y,color,size}], eraser wipe at the end.
    ex_board_draw(s, t, lt) {
      const [W] = DIMS(), b = boardAt(t), area = b ? b.y : 640, size = s.size || Math.min(300, area * .5);
      const cx = s.x ?? W / 2, cy = s.y ?? (b ? area * .44 : 330);
      const d0 = s.draw_at ?? .15, dd = s.draw_dur ?? 1.3, k = E.inOutSine(prog(lt, d0, dd));
      const col = mcol(s.color || 'ink'), dr = drawShape(s.shape || 'bulb', k, size, col, s.seed ?? 1);
      let html = `<div class="abs"${cidOf(s)} style="left:${f1(cx - size / 2)}px;top:${f1(cy - size / 2)}px;width:${size}px;height:${size}px">${dr.svg}</div>`;
      let tipAt = dr.tip ? [cx - size / 2 + dr.tip[0], cy - size / 2 + dr.tip[1]] : null;
      const lt0 = s.label_t ?? s.t0 + d0 + dd + .1;
      if (s.label) {
        const len = Array.from(s.label).length, kl = clamp(prog(t, lt0, Math.max(.4, len / (s.cps ?? 16))));
        html += `<div class="abs" style="left:0;right:0;top:${f1(s.label_y ?? cy + size / 2 + 18)}px;text-align:center;transform:rotate(${s.rot ?? -2}deg)">${handText(s.label, kl, s.label_size || 58, mcol(s.label_color || 'blue'), 3, true)}</div>`;
      }
      for (const w of s.words || []) {
        const len = Array.from(w.text || '').length, kw = clamp(prog(t, w.t ?? s.t0 + 1, Math.max(.3, len / 16)));
        html += `<div class="abs"${cidOf(w)} style="left:${w.x ?? 120}px;top:${w.y ?? 200}px;transform:translate(-50%,-50%) rotate(${w.rot ?? -4}deg)">${handText(w.text, kw, w.size || 40, mcol(w.color || 'red'), 7, true)}</div>`;
      }
      const lift = clamp(prog(lt, d0 + dd, .25));
      if (tipAt) html += markerTip(tipAt[0], tipAt[1], col);
      else if (lt > d0 + dd && lift < 1 && !(s.label && t >= lt0)) html += markerTip(cx + size / 2 - 10 + lift * 40, cy + size / 2 - 10 - lift * 60, col, 1 - lift);
      return { front: pageWrap(s, t, html, lt) };
    },
    // Handwritten checklist page: title + items written one by one (items[i].t), a tick drawn after each.
    ex_board_list(s, t, lt) {
      const [W] = DIMS(), b = boardAt(t), area = b ? b.y : 640, items = s.items || [{ text: 'Quay video' }, { text: 'Kéo vào công cụ' }, { text: 'Xuất video' }];
      const top = s.y ?? (b ? 70 : 150), gap = s.gap ?? Math.min(110, (area - top - 120) / Math.max(1, items.length));
      let html = '';
      if (s.title) { const kt = clamp(prog(lt, .05, .6)); html += `<div class="abs" style="left:0;right:0;top:${top}px;text-align:center">${handText(s.title, kt, 54, mcol('ink'), 2, true)}</div>`; }
      items.forEach((it, i) => {
        const o = typeof it === 'string' ? { text: it } : it, ti = o.t ?? s.t0 + .7 + i * (s.stagger ?? .9), len = Array.from(o.text).length, dw = Math.max(.35, len / 18);
        const kw = clamp(prog(t, ti, dw)), kc = E.inOutSine(prog(t, ti + dw + .05, .3)), y = top + 100 + i * gap;
        if (t < ti) return;
        const ck = drawShape('check', kc, 56, mcol('green'), i + 2);
        html += `<div class="abs"${cidOf(o)} style="left:80px;top:${f1(y)}px;display:flex;align-items:center;gap:18px"><div style="width:56px;height:56px">${ck.svg}</div>${handText(o.text, kw, s.size || 50, mcol(o.color || 'ink'), i * 3 + 1, kw < 1)}</div>`;
      });
      return { front: pageWrap(s, t, html, lt) };
    },
    // Hook pill: frame 1 is the face full screen with the hook words in a white pill under it.
    ex_board_hook(s, t, lt) {
      const [W] = DIMS(), k = E.outBack(prog(lt, 0, .35), 1.6);
      return { front: `<div class="abs"${cidOf(s)} style="left:${s.x ?? W / 2}px;top:${s.y ?? 880}px;transform:translate(-50%,-50%) scale(${f3(clamp(k, 0, 1.2))});opacity:${f3(clamp(k * 2))}">
        <span style="display:inline-block;padding:14px 26px;border-radius:999px;background:#fff;color:#16171b;font:700 ${s.size || 38}px/1.2 ${FONT.inter};letter-spacing:-.02em;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.25)">${rich(s.text || 'Vẽ ra thì *dễ hiểu*', `background:linear-gradient(transparent 55%,#FFE14D 55%)`)}</span></div>`, hideCaptions: s.hideCaptions ?? true };
    },
  };

  Object.assign(MODULES, OS, PPM, STAN, DECK, BOARD);

  // =====================================================================================================
  // CAPTION STYLES
  // =====================================================================================================
  const curIdx = (c, t) => { let k = -1; c.words.forEach((w, i) => { if (t >= w.s) k = i; }); return k; };
  // Clean OS: 1–3 word lowercase cards on the chest, resolving from blur; hl words in italic.
  CAPTION_STYLES.ex_os = (c, t) => {
    const [W] = DIMS(), k = Math.max(0, curIdx(c, t)), g = Math.floor(k / 3), ws = c.words.slice(g * 3, g * 3 + 3), s0 = ws[0]?.s ?? c.t0;
    const kk = clamp(prog(t, Math.max(c.t0, s0), .18)), size = c.size || 46;
    const html = ws.map(w => `<span style="${w.hl ? 'font-style:italic;' : ''}">${h(String(w.w).toLowerCase())}</span>`).join(' ');
    return `<div id="cap"${cidOf(c)} style="top:${c.y ?? chest()}px;left:${(c.x ?? W / 2) - W / 2}px;right:${W / 2 - (c.x ?? W / 2)}px;transform:translateY(-50%);text-align:center;
      font-family:${c.font || FONT.inter};font-weight:${c.weight || 700};font-size:${size}px;line-height:1.1;letter-spacing:-.045em;color:${c.color || '#fff'};
      text-shadow:0 2px 16px rgba(0,0,0,.4),0 1px 2px rgba(0,0,0,.3);opacity:${f3(kk)};filter:blur(${f1((1 - kk) * 9)}px)">${html}</div>`;
  };
  // Product page: two-tier chest captions — heavy sans + the payoff (hl or last word) in serif italic; words blur in on onset.
  CAPTION_STYLES.ex_pp = (c, t) => {
    const [W] = DIMS(), n = c.words.length, pay = c.words.findIndex(w => w.hl), pi = pay >= 0 ? pay : n >= 3 ? n - 1 : -1;
    const word = (w, i) => { const k = clamp(prog(t, w.s - .03, .13)); return `<span style="display:inline-block;opacity:${f3(k)};transform:translateY(${f1((1 - k) * 12)}px);filter:blur(${f1((1 - k) * 4)}px)">${h(w.w)}</span>`; };
    const a = c.words.map((w, i) => (i === pi ? '' : word(w, i))).filter(Boolean).join(' ');
    const b = pi >= 0 ? `<div style="font:italic 600 ${f0((c.size || 56) * 1.45)}px/1 ${FONT.serif};letter-spacing:-.02em;margin-top:-.02em">${word(c.words[pi], pi)}</div>` : '';
    return `<div id="cap"${cidOf(c)} style="top:${c.y ?? chest(-50)}px;left:40px;right:40px;text-align:center;color:${c.color || '#FFFEFF'};text-shadow:none">
      <div style="position:absolute;left:-80px;right:-80px;top:-90px;height:600px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.44) 60px,rgba(0,0,0,.5));z-index:-1"></div>
      <div style="font:800 ${c.size || 56}px/1.06 ${c.font || FONT.tight};letter-spacing:-.035em">${a}</div>${b}</div>`;
  };
  // Stan: small white lowercase phrases at 68 % height, the whole phrase cuts in on its first word.
  CAPTION_STYLES.ex_stan = (c, t) => {
    const [W, H] = DIMS();
    return `<div id="cap"${cidOf(c)} style="top:${c.y ?? Math.max(Math.round(H * .68), chest())}px;left:60px;right:60px;text-align:center;font-family:${c.font || FONT.inter};font-weight:${c.weight || 600};
      font-size:${c.size || 32}px;line-height:1.2;letter-spacing:-.01em;color:${c.color || '#fff'};text-shadow:0 1px 3px rgba(0,0,0,.55),0 0 14px rgba(0,0,0,.35)">${c.words.map(w => `<span style="${w.hl ? 'font-weight:800;' : ''}">${h(String(w.w).toLowerCase())}</span>`).join(' ')}</div>`;
  };
  // Step Deck: the phrase grows in place above the head (unspoken words keep their slot), hl word in serif italic,
  // first word fades + rises.
  CAPTION_STYLES.ex_deck = (c, t) => {
    const [W] = DIMS(), fc = face(), size = c.size || 50, y = c.y ?? Math.max(190, fc.y - 230);
    const html = c.words.map((w, i) => {
      const on = t >= w.s, k = i === 0 ? clamp(prog(t, w.s, .2)) : on ? 1 : 0;
      const css = w.hl ? `font:italic 500 ${f0(size * 1.25)}px/1.05 ${FONT.serif};letter-spacing:-.02em` : '';
      return `<span style="display:inline-block;${css};opacity:${f3(k)};transform:translateY(${f1(i === 0 ? (1 - E.outCubic(k)) * 20 : 0)}px)">${h(w.w)}</span>`;
    }).join(' ');
    return `<div id="cap"${cidOf(c)} style="top:${y}px;left:${(c.x ?? W / 2) - W / 2 + 40}px;right:${W / 2 - (c.x ?? W / 2) + 40}px;transform:translateY(-100%);text-align:center;
      font:600 ${size}px/1.08 ${c.font || FONT.tight};letter-spacing:-.04em;color:${c.color || '#FDFEFC'};text-shadow:0 0 24px rgba(0,0,0,.35)">${html}</div>`;
  };
  // Whiteboard: white pill on the seam (or low when no board), the spoken word swept in yellow.
  CAPTION_STYLES.ex_board = (c, t) => {
    const [W, H] = DIMS(), b = boardAt(t), y = c.y ?? (b ? lerp(H * .75, b.y, b.m) : H * .75), k = curIdx(c, t);
    const html = c.words.map((w, i) => {
      const sw = i === k ? clamp(prog(t, w.s, Math.max(.12, ((w.e ?? w.s + .3) - w.s) * .8))) : i < k ? 0 : 0;
      return `<span style="display:inline-block;padding:0 .08em;border-radius:.15em;background:linear-gradient(90deg,#FFE14D ${f1(sw * 100)}%,transparent ${f1(sw * 100)}%)">${h(w.w)}</span>`;
    }).join(' ');
    return `<div id="cap"${cidOf(c)} style="top:${f1(y)}px;left:30px;right:30px;transform:translateY(-50%);text-align:center;text-shadow:none">
      <span style="display:inline-block;max-width:640px;padding:10px 22px;border-radius:999px;background:#fff;color:#16171b;font-family:${c.font || FONT.inter};font-weight:${c.weight || 800};
        font-size:${c.size || 32}px;line-height:1.25;letter-spacing:-.015em;box-shadow:0 6px 20px rgba(0,0,0,.28)">${html}</span></div>`;
  };

  // =====================================================================================================
  // STUDIO METADATA + RECIPE
  // =====================================================================================================
  const T2 = (T, d) => ({ t0: T, t1: T + d });
  PACKS.push({
    id: P, name: 'Giải thích trực quan (5 kiểu)', icon: '🧠', caption: 'ex_os',
    desc: 'Năm kiểu giải thích bằng hình: Clean OS (ý tưởng thành thao tác trên điện thoại), Trang sản phẩm (trang trắng nét mảnh, tiêu đề 2 tầng), Màn hình sau lưng (hướng dẫn công cụ), Bộ thẻ bước (số nghiêng khổng lồ), Bảng vẽ tay (bảng trắng trên, người dưới)',
    items: [
      { type: 'ex_os_phone', label: 'OS · Người trong điện thoại', make: T => ({ type: 'ex_os_phone', ...T2(T, 3), notif: { app: 'Nhắc nhở', icon: 'bell', title: 'Đến giờ dựng video rồi', text: 'Chỉ mất 3 phút (ví dụ)' } }) },
      { type: 'ex_os_notifs', label: 'OS · Chồng thông báo', make: T => ({ type: 'ex_os_notifs', ...T2(T, 3) }) },
      { type: 'ex_os_toggle', label: 'OS · Thẻ cài đặt bật/tắt', make: T => ({ type: 'ex_os_toggle', ...T2(T, 3), rows: [{ label: 'Thông báo', icon: 'bell', on: true, t: T + 1 }, { label: 'Tự động phát', icon: 'play', on: true, t: T + 1.5 }, { label: 'Chế độ tập trung', icon: 'moon', on: false, t: T + 2 }] }) },
      { type: 'ex_os_ring', label: 'OS · Vòng % / pin cạnh đầu', make: T => ({ type: 'ex_os_ring', ...T2(T, 3), from: 100, to: 12, label: 'năng lượng' }) },
      { type: 'ex_os_select', label: 'OS · Khung chọn đỏ + con trỏ', make: T => ({ type: 'ex_os_select', ...T2(T, 2.4), text: 'làm thủ công', mode: 'reject' }) },
      { type: 'ex_os_pen', label: 'OS · Bút ký chữ tay', make: T => ({ type: 'ex_os_pen', ...T2(T, 2.4), text: 'thành công' }) },
      { type: 'ex_pp_hook', label: 'Trang SP · Mở đầu thẻ + tiêu đề', make: T => ({ type: 'ex_pp_hook', ...T2(T, 3), name: 'Tên sản phẩm (ví dụ)', sub: 'Thương hiệu · 2026', lines: ['Một công cụ', 'đổi cách tôi', '*làm video*'] }) },
      { type: 'ex_pp_page', label: 'Trang SP · Trang trắng nét mảnh', make: T => ({ type: 'ex_pp_page', ...T2(T, 3.6), art: 'phone', title: 'Điện thoại', title_b: 'của bạn', title_t: T + 1.6 }) },
      { type: 'ex_pp_split', label: 'Trang SP · Chia đôi giao diện', make: T => ({ type: 'ex_pp_split', ...T2(T, 3.6), ui: { kind: 'alert', title: 'Cho phép gửi thông báo?', press: 0, press_t: T + 1.8 } }) },
      { type: 'ex_pp_gallery', label: 'Trang SP · Bộ sưu tập hình vẽ', make: T => ({ type: 'ex_pp_gallery', ...T2(T, 4), hl: 0, hl_t: T + 2.2, title_t: T + 2.6, title: 'Bớt một chút', title_b: 'sống nhiều hơn' }) },
      { type: 'ex_stan_hook', label: 'Màn hình · Mở đầu icon + tiêu đề dải', make: T => ({ type: 'ex_stan_hook', ...T2(T, 2.8), lines: ['hướng dẫn dựng video bằng AI', 'trong 3 phút'] }) },
      { type: 'ex_stan_screen', label: 'Màn hình · Dải màn hình sau đầu', make: T => ({ type: 'ex_stan_screen', ...T2(T, 3.5), screen: { kind: 'app', app: 'Công cụ (ví dụ)', heading: 'Tạo video trong vài phút', click_t: T + 1.4 } }) },
      { type: 'ex_stan_screen', label: 'Màn hình · Dải chat gõ lệnh', make: T => ({ type: 'ex_stan_screen', ...T2(T, 3.5), screen: { kind: 'chat', prompt: 'Viết 5 ý tưởng video về nấu ăn nhanh' } }) },
      { type: 'ex_stan_step', label: 'Màn hình · Nhãn [Bước n]', make: T => ({ type: 'ex_stan_step', ...T2(T, 2.2), num: 1, text: 'Kéo thả video vào công cụ', icons: ['video', 'folder'] }) },
      { type: 'ex_stan_diagram', label: 'Màn hình · Sơ đồ cách hoạt động', make: T => ({ type: 'ex_stan_diagram', ...T2(T, 3.2), output: 'Video' }) },
      { type: 'ex_stan_cta', label: 'Màn hình · CTA bình luận từ khoá', make: T => ({ type: 'ex_stan_cta', ...T2(T, 3), keyword: 'kịch bản', gift: 'bộ mẫu miễn phí (ví dụ)' }) },
      { type: 'ex_deck_numeral', label: 'Thẻ bước · Số nghiêng khổng lồ', make: T => ({ type: 'ex_deck_numeral', ...T2(T, 2.2), num: 1, text: 'Quay *một lần*' }) },
      { type: 'ex_deck_card', label: 'Thẻ bước · Thẻ chữ xanh navy', make: T => ({ type: 'ex_deck_card', ...T2(T, 2.4), look: 'navy', text: 'Vậy làm sao để *nhanh hơn?*' }) },
      { type: 'ex_deck_card', label: 'Thẻ bước · Trang chữ trắng', make: T => ({ type: 'ex_deck_card', ...T2(T, 2.4), look: 'white', text: 'Chỉ cần [ba] bước !đơn giản' }) },
      { type: 'ex_deck_behind', label: 'Thẻ bước · Chữ to sau đầu', make: T => ({ type: 'ex_deck_behind', ...T2(T, 2.2), text: 'Tại sao?' }) },
      { type: 'ex_deck_behind', label: 'Thẻ bước · Chữ chuyển màu chốt', make: T => ({ type: 'ex_deck_behind', ...T2(T, 2.2), text: 'tự do', gradient: true }) },
      { type: 'ex_deck_counter', label: 'Thẻ bước · Bộ đếm số', make: T => ({ type: 'ex_deck_counter', ...T2(T, 2.4), from: 1, to: 10, suffix: '×', lines: ['nhanh hơn', '*so với cách cũ*'] }) },
      { type: 'ex_deck_title', label: 'Thẻ bước · Tiêu đề lời hứa', make: T => ({ type: 'ex_deck_title', ...T2(T, 2.4), small: 'ba bước để', big: 'LÀM CHỦ', sub: 'video ngắn' }) },
      { type: 'ex_board_split', label: 'Bảng vẽ · Chia đôi bảng + người', make: T => ({ type: 'ex_board_split', ...T2(T, 8) }) },
      { type: 'ex_board_draw', label: 'Bảng vẽ · Hình vẽ tay + nhãn', make: T => ({ type: 'ex_board_draw', ...T2(T, 3.6), shape: 'bulb', label: 'ý tưởng' }) },
      { type: 'ex_board_list', label: 'Bảng vẽ · Danh sách viết tay', make: T => ({ type: 'ex_board_list', ...T2(T, 4.2), title: 'Cách làm' }) },
      { type: 'ex_board_hook', label: 'Bảng vẽ · Viên chữ mở đầu', make: T => ({ type: 'ex_board_hook', ...T2(T, 1.6), text: 'Vẽ ra thì *dễ hiểu*' }) },
    ],
    recipe: ctx => recipe(ctx),
  });

  // ---------- recipe helpers ----------
  const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const cText = c => c.words.map(w => w.w).join(' ');
  const r2 = v => Math.round(v * 100) / 100;
  const cut = (s, n) => { const a = Array.from(String(s).trim()); return a.length > n ? a.slice(0, n - 1).join('').replace(/\s+\S*$/, '') + '…' : a.join(''); };
  const cap1 = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  // Phrase spoken around t (caption chunk + the next one if short), cleaned.
  function phraseAt(caps, t, n = 26) {
    const i = caps.findIndex(c => c.t1 > t);
    if (i < 0) return '';
    let s = cText(caps[i]);
    if (Array.from(s).length < 12 && caps[i + 1]) s += ' ' + cText(caps[i + 1]);
    return cut(s.replace(/[.,!?;:]+$/g, ''), n);
  }
  // Greedy placement: keep scenes in time order with ≥ gap s between them (and inside [lo, hi]).
  function place(list, gap, lo, hi) {
    const out = [];
    for (const s of list.filter(s => s && s.t0 != null).sort((a, b) => a.t0 - b.t0)) {
      if (s.t0 < lo || s.t1 > hi + .01) continue;
      if (out.length && s.t0 < out[out.length - 1].t1 + gap) continue;
      out.push(s);
    }
    return out;
  }
  const WORD_SHAPE = [[['thoi gian', 'phut', 'vai tieng', 'dong ho', 'tieng dong ho'], 'clock'], [['y tuong', 'nghi', 'sang tao'], 'bulb'], [['video', 'clip', 'phim'], 'video'], [['tang', 'phat trien', 'ket qua', 'doanh thu'], 'chart'],
    [['muc tieu', 'dich'], 'target'], [['kho', 'thu thach', 'vat va'], 'mountain'], [['bi quyet', 'chia khoa', 'meo'], 'key'], [['yeu', 'thich', 'dam me'], 'heart'], [['nhanh', 'toc do', 'tu dong'], 'rocket'],
    [['dien thoai', 'app', 'cong cu', 'tool', 'phan mem'], 'phone'], [['ket noi', 'lien ket'], 'chain'], [['noi', 'hoi', 'binh luan'], 'bubble'], [['moi nguoi', 'chung ta', 'cac ban', 'nhom'], 'team'], [['thanh cong', 'xong'], 'check'], [['nha'], 'house']];
  // Whole-word match only ("bây giờ" must not hit "giờ"); the same drawing never on two pages in a row.
  const shapeFor = (txt, i, prev) => { const f = ' ' + fold(txt).replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ') + ' '; for (const [ns, sh] of WORD_SHAPE) { const n = ns.find(n => f.includes(' ' + n + ' ')); if (n && sh !== prev) return [sh, n]; } const rot = ['bulb', 'arrow', 'rocket', 'target', 'chart'].filter(x => x !== prev); return [rot[i % rot.length], null]; };
  const FILLER = /\s+(nhé|nha|ạ|nhỉ|rồi|đấy|đây|thôi)$/i;
  const lastWords = (caps, n = 2) => { if (!caps.length) return ''; let s = cText(caps[caps.length - 1]).replace(/[.,!?]+$/, ''); while (FILLER.test(s)) s = s.replace(FILLER, ''); return s.split(/\s+/).slice(-n).join(' '); };

  function recipe(ctx) {
    const dur = ctx.dur, caps = ctx.captions || [], o = ctx.opts || {}, v = o.variant || 'os', title = ctx.title || o.title || '';
    const at = (needles, after, frac) => { const x = findWord(caps, needles, after); return x != null ? x : dur * frac; };
    const D = x => Math.max(0, Math.min(dur, r2(x)));
    const mk = (type, t0, d, extra = {}) => ({ type, t0: D(t0), t1: D(Math.min(t0 + d, dur)), ...extra });
    const endT = Math.max(0, dur - 2.6);
    let scenes = [], caption = 'ex_os', music = o.music || 'lofi';

    if (v === 'product') {
      caption = 'ex_pp'; music = o.music || 'tech';
      const t1 = at(['công cụ', 'sản phẩm', 'tool', 'là gì'], 3.4, .22), t2 = at(['chỉ cần', 'kéo', 'bấm', 'chọn'], t1 + 4.2, .5);
      scenes = [mk('ex_pp_hook', 0, Math.min(3, dur * .3), { name: o.name || cut(title || 'Tên sản phẩm (ví dụ)', 22), sub: o.sub || 'Giới thiệu nhanh', lines: o.lines || [cut(phraseAt(caps, .2, 18) || 'Một công cụ', 18), '*' + cut(phraseAt(caps, 1.6, 16) || 'đáng thử', 16) + '*'] }),
        ...place([mk('ex_pp_page', t1, 3.6, { art: 'phone', title: cap1(phraseAt(caps, t1, 16)), title_b: cut(phraseAt(caps, t1 + 1.2, 14), 14), title_t: D(t1 + 1.5) }),
          mk('ex_pp_split', t2, 3.6, { ui: { kind: 'alert', title: cut(cap1(phraseAt(caps, t2, 30)) + '?', 32), press: 1, press_t: D(t2 + 1.6) } })], 3, 3.2, endT - .5),
        mk('ex_pp_gallery', Math.max(dur - 3.8, 3.3), 3.8, { hl: 0, hl_t: D(dur - 1.9), title_t: D(dur - 1.6), title: cut(cap1(phraseAt(caps, dur - 3.6, 16)), 16), title_b: cut(phraseAt(caps, dur - 2, 14), 14) })];
    } else if (v === 'stan') {
      caption = 'ex_stan'; music = o.music || 'lofi_2';
      const scr = ['công cụ', 'tool', 'màn hình', 'kéo thả', 'video', 'hiệu ứng', 'phần mềm'];
      const st = [['đầu tiên', 'bước một', 'thứ nhất'], ['sau đó', 'tiếp theo', 'thứ hai'], ['cuối cùng', 'xuất', 'thứ ba']];
      const cand = [];
      const td = at(['cách', 'quy trình', 'hoạt động', 'tự động'], 3, .2);
      cand.push(mk('ex_stan_diagram', td, 3, { output: o.output || 'Video', title: o.diagram_title }));
      let after = 3;
      for (let i = 0; i < 3; i++) { const x = findWord(caps, scr, after); if (x == null) break; cand.push(mk('ex_stan_screen', x, 3.5, { screen: { kind: i % 2 ? 'chat' : 'app', app: o.app || 'Công cụ (ví dụ)', heading: cap1(phraseAt(caps, x, 28)), click_t: D(x + 1.4), prompt: i % 2 ? cap1(phraseAt(caps, x, 40)) : undefined } })); after = x + 5; }
      st.forEach((ns, i) => { const x = findWord(caps, ns, 3); if (x != null) cand.push(mk('ex_stan_step', x, 2.2, { num: i + 1, text: cap1(phraseAt(caps, x, 26)) })); });
      if (!cand.some(s => s.type === 'ex_stan_screen')) cand.push(mk('ex_stan_screen', dur * .45, 3.5, { screen: { kind: 'app', app: o.app || 'Công cụ (ví dụ)' } }));
      scenes = [mk('ex_stan_hook', 0, Math.min(2.8, dur * .3), { lines: o.lines || [cut((title || 'hướng dẫn nhanh').toLowerCase(), 26), cut(phraseAt(caps, 1, 24).toLowerCase(), 24)] }),
        ...place(cand, 1, 3.2, endT - .5), mk('ex_stan_cta', endT, dur - endT, { keyword: o.keyword || 'kịch bản', gift: o.gift })];
    } else if (v === 'deck') {
      caption = 'ex_deck'; music = o.music || 'lofi';
      const cand = [];
      caps.forEach(c => { const tx = cText(c); if ((/\?\s*$/.test(tx) || / gì\b| sao\b/.test(' ' + tx)) && c.t0 > 2.6) cand.push(mk('ex_deck_card', c.t0, 2.2, { look: 'navy', text: cut(cap1(tx.replace(/[.,]+$/, '')), 30) })); });
      const steps = [['đầu tiên', 'thứ nhất', 'bước một'], ['sau đó', 'tiếp theo', 'thứ hai'], ['cuối cùng', 'thứ ba']];
      steps.forEach((ns, i) => { const x = findWord(caps, ns, 2.6); if (x != null) cand.push(mk('ex_deck_numeral', x, 1.8, { num: i + 1, text: cut(cap1(phraseAt(caps, x + .2, 20)), 20) })); });
      const nt = caps.find(c => /\d+/.test(cText(c)) && c.t0 > 2.6);
      if (nt) { const n = +(cText(nt).match(/\d+/)[0]); cand.push(mk('ex_deck_counter', nt.t0, 2.2, { from: 0, to: Math.min(n, 999), lines: [cut(phraseAt(caps, nt.t0 + .6, 18), 18)] })); }
      if (cand.length < 3) cand.push(mk('ex_deck_card', dur * .35, 2.2, { look: 'white', text: cut(cap1(phraseAt(caps, dur * .35, 26)), 26) }), mk('ex_deck_numeral', dur * .55, 1.8, { num: 1, text: cut(cap1(phraseAt(caps, dur * .55, 20)), 20) }));
      const first = caps[0] ? cut(caps[0].words.slice(0, 2).map(w => w.w).join(' '), 14) : 'Tại sao';
      const last = lastWords(caps) || 'thành công';
      scenes = [mk('ex_deck_behind', 0, Math.min(2.2, dur * .25), { text: o.hook || first }), ...place(cand, 1.2, 2.6, endT - .3),
        mk('ex_deck_behind', endT, dur - endT, { text: o.payoff || cut(last.replace(/[.,!?]+$/, ''), 16), gradient: true })];
    } else if (v === 'board') {
      caption = 'ex_board'; music = o.music || 'mellow';
      scenes.push(mk('ex_board_split', Math.min(.6, dur * .05), dur, { drop_at: 0 }));
      scenes[0].t1 = dur;
      let tp = Math.min(1.2, dur * .08), i = 0;
      const pageLen = o.page_len || 4;
      while (tp < dur - 2.5 && i < 60) {
        const te = Math.min(dur - .1, tp + pageLen);
        const txt = caps.filter(c => c.t0 >= tp - .2 && c.t0 < te).map(cText).join(' ');
        const [shape, hit] = shapeFor(txt, i, scenes[scenes.length - 1]?.shape);
        const label = cut(hit && txt ? (Array.from(txt).length ? (() => { const f = fold(txt), j = f.indexOf(hit); return j >= 0 ? Array.from(txt).slice(j, j + Array.from(hit).length).join('') : hit; })() : hit) : phraseAt(caps, tp, 16), 16).toLowerCase();
        const last = te >= dur - 2.6;
        scenes.push(last && i > 0 ? mk('ex_board_list', tp, te - tp, { title: cut(phraseAt(caps, tp, 14), 14), items: caps.filter(c => c.t0 >= tp + .4 && c.t0 < te).slice(0, 3).map((c, k) => ({ text: cut(cText(c), 18), t: D(c.t0) })), erase: false })
          : mk('ex_board_draw', tp, te - tp, { shape, label, seed: i + 1, draw_dur: Math.min(1.4, (te - tp) * .4) }));
        tp = te; i++;
      }
    } else { // os
      caption = 'ex_os'; music = o.music || 'lofi';
      const t1 = at(['thông báo', 'tin nhắn', 'email', 'trước kia', 'mất'], 3, .2), t2 = at(['thời gian', 'phút', 'giờ', 'tiếng'], t1 + 4.4, .4);
      const t3 = at(['chọn', 'lựa chọn', 'bật', 'tắt', 'cài đặt'], t2 + 4.6, .6), t4 = at(['chỉ cần', 'quan trọng', 'không cần'], t3 + 4.6, .75);
      const sel = cut(phraseAt(caps, t4, 18).toLowerCase(), 18);
      const last = lastWords(caps) || 'thành công';
      scenes = [mk('ex_os_phone', 0, Math.min(2.8, dur * .3), { notif: { app: 'Nhắc nhở', icon: 'bell', title: cut(title || phraseAt(caps, .3, 30), 30), text: cut(phraseAt(caps, 1.5, 34), 34), t: .8 } }),
        ...place([mk('ex_os_notifs', t1, 2.8, { items: [0, 1, 2].map(k => ({ app: ['Thư', 'Tin nhắn', 'Lịch'][k], icon: ['mail', 'chat', 'cal'][k], title: cap1(phraseAt(caps, t1 + k * .8, 28)) })) }),
          mk('ex_os_ring', t2, 3, { from: 100, to: 12, label: cut(phraseAt(caps, t2, 16).toLowerCase(), 16) }),
          mk('ex_os_toggle', t3, 3, { rows: [{ label: 'Tự động phụ đề', icon: 'doc', on: false, t: D(t3 + .9) }, { label: 'Hiệu ứng', icon: 'spark', on: false, t: D(t3 + 1.4) }, { label: 'Làm thủ công', icon: 'clock', on: true, t: D(t3 + 1.9) }] }),
          mk('ex_os_select', t4, 2.2, { text: sel || 'không cần thiết', mode: 'focus' })], 1.5, 3, endT - .3),
        mk('ex_os_pen', endT, dur - endT, { text: cut(o.sign || last.toLowerCase(), 16) })];
    }
    return { caption_style: caption, music, scenes: scenes.filter(s => s.t1 - s.t0 >= .5) };
  }
})();
