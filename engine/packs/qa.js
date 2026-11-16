// Pack "qa" — Q&A / street interview / "trả lời câu hỏi": big typed question card, handheld street mic + interviewee
// tag, numbered answer card, Yes/No poll result, viewer-comment question (TikTok reply style), "Câu 3/10" counter,
// big reveal flash. Bold yellow-on-ink look; TL.brand.primary replaces the yellow. Spec: references/pack-qa.md.
(() => {
  const P = 'qa';
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pal = (s = {}) => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return {
      y: s.color || b.primary || '#FFD60A', ink: '#111216', white: '#FFFFFF', pink: '#FF3D7F', green: '#22C55E', red: '#FF4D4D', blue: '#2F7BFF',
      soft: '#F3F4F6', grey: '#6B7280', font: s.font || b.font || "'Be Vietnam Pro',var(--sans)",
    };
  };
  const alpha = (c, p) => `color-mix(in srgb,${c} ${p}%,transparent)`;
  // |word| -> highlighted (yellow marker) inside text.
  const mark = (v, c) => esc(v).replace(/\|([^|]+)\|/g, `<b style="font-weight:inherit;background:linear-gradient(transparent 55%,${alpha(c.y, 85)} 55%);padding:0 .08em">$1</b>`);
  // Root: centred on x,y (default per design), `size` = base font px; pop-in + fade-out ending at t1.
  const root = (s, t, def, inner, extra = '') => {
    const [W, H] = DIMS(), v = VERT();
    const x = s.x ?? (v ? W / 2 : def.xh ?? W / 2), y = s.y ?? (v ? def.y : def.yh), size = s.size || def.size;
    const k = E.outBack(prog(t, s.t0, s.dur_in ?? .38), 1.5), o = fadeIO(t, s.t0, s.keep ? null : s.t1, .16, .22);
    const w = s.w ? `width:${s.w}px;` : def.w ? `width:${v ? def.w : def.wh || def.w}px;` : '';
    return `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;${w}font-family:${pal(s).font};font-size:${size}px;
      transform:translate(-50%,-50%) scale(${lerp(def.from ?? .82, 1, k).toFixed(4)});opacity:${o.toFixed(3)};${extra}">${inner}</div>`;
  };
  // Typed text with fixed layout: unrevealed characters are transparent (no reflow, diacritics stay whole).
  const typed = (text, n, caret, c) => {
    const ch = Array.from(String(text || '').normalize('NFC'));
    const shown = esc(ch.slice(0, n).join('')).replace(/\|([^|]+)\|/g, `<b style="font-weight:inherit;color:${c.pink}">$1</b>`).replace(/\|/g, '');
    const rest = esc(ch.slice(n).join('').replace(/\|/g, ''));
    return `${shown}${caret ? `<i style="display:inline-block;width:.08em;height:1em;margin:0 .02em -.12em;background:${c.ink}"></i>` : ''}<span style="color:transparent">${rest}</span>`;
  };
  const qBadge = (c, sz, rot = -8) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:${sz}px;height:${sz}px;border-radius:50%;background:${c.y};color:${c.ink};
    font-weight:900;font-size:${Math.round(sz * .66)}px;line-height:1;border:3px solid ${c.ink};box-shadow:3px 4px 0 ${c.ink};transform:rotate(${rot}deg);flex:0 0 auto">?</span>`;

  const MODS = {
    // 1. Big question card: "CÂU HỎI" header + ? badge, question typed at `cps` chars/s (|word| = pink). variant 'card' | 'full' (dims video).
    qa_question(s, t, lt) {
      const c = pal(s), v = VERT(), size = s.size || (v ? 44 : 38);
      const text = s.text || 'Bạn nghĩ sao?', len = Array.from(text.replace(/\|/g, '')).length;
      const n = Math.floor(clamp((lt - (s.type_delay ?? .3)) * (s.cps ?? 30), 0, len));
      const caret = n < len || Math.floor(lt * 2.2) % 2 === 0;
      const wob = Math.sin(lt * 2.4) * 1.2;
      const inner = `<div style="position:relative;padding:.55em .7em .65em;border-radius:.5em;background:${c.white};color:${c.ink};border:4px solid ${c.ink};box-shadow:8px 10px 0 ${c.ink}">
        <div style="position:absolute;right:-.55em;top:-.85em;transform:rotate(${(wob + 6).toFixed(2)}deg)">${qBadge(c, Math.round(size * 1.9), 0)}</div>
        <div style="display:inline-flex;align-items:center;gap:.4em;padding:.2em .6em;margin-bottom:.35em;border-radius:.4em;background:${c.ink};color:${c.y};font-weight:900;font-size:.5em;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap">
          ${esc(s.label || 'Câu hỏi')}${s.num != null ? `<span style="color:${c.white}">#${esc(s.num)}</span>` : ''}</div>
        <div style="font-weight:800;line-height:1.22;letter-spacing:-.005em;padding-right:1em">${typed(text, n, caret && n < len + 1, c)}</div></div>`;
      const dim = s.variant === 'full' ? `<div class="full" style="background:rgba(10,10,14,${(.55 * fadeIO(t, s.t0, s.t1, .25, .25)).toFixed(3)});backdrop-filter:blur(${(8 * fadeIO(t, s.t0, s.t1, .25, .25)).toFixed(1)}px)"></div>` : '';
      return { back: dim || undefined, front: root(s, t, { y: s.variant === 'full' ? 560 : 340, yh: 240, size, w: 600, wh: 760 }, inner) };
    },

    // 2. Street mic: handheld mic (flag with `brand`) rises into frame toward the speaker + name / age / job tag.
    //    mic_x, mic_y = mic head position; x,y = tag centre.
    qa_mic(s, t, lt) {
      const c = pal(s), v = VERT(), [W, H] = DIMS();
      const k = E.outCubic(prog(lt, 0, .45)), o = fadeIO(t, s.t0, s.t1, .2, .3);
      const mx = s.mic_x ?? (v ? 455 : 820), my = (s.mic_y ?? (v ? 730 : 470)) + (1 - k) * 520 + Math.sin(lt * 1.8) * 4;
      const ms = s.mic_size || 1, rot = s.mic_rot ?? -14;
      const brand = esc(s.brand || BR().name || 'Q&A');
      const mic = `<div class="abs" style="left:${mx}px;top:${my}px;width:0;height:0;opacity:${o.toFixed(3)};transform:rotate(${rot}deg) scale(${ms})">
        <div style="position:absolute;left:-46px;top:-46px;width:92px;height:92px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#4a4d55,#1b1c20 65%);
          box-shadow:inset 0 0 0 3px #2b2d33,0 8px 20px rgba(0,0,0,.45);background-image:radial-gradient(circle at 35% 30%,rgba(255,255,255,.18),transparent 45%),repeating-linear-gradient(45deg,rgba(255,255,255,.08) 0 2px,transparent 2px 7px),repeating-linear-gradient(-45deg,rgba(255,255,255,.08) 0 2px,transparent 2px 7px),radial-gradient(circle,#2a2c31,#141518)"></div>
        <div style="position:absolute;left:-40px;top:30px;width:80px;height:66px;border-radius:8px;background:${c.y};border:3px solid ${c.ink};display:flex;align-items:center;justify-content:center;
          font:900 ${brand.length > 6 ? 15 : 20}px/1 ${c.font};color:${c.ink};text-align:center;letter-spacing:.02em;box-shadow:inset -10px 0 0 rgba(0,0,0,.12)">${brand}</div>
        <div style="position:absolute;left:-17px;top:94px;width:34px;height:300px;border-radius:0 0 16px 16px;background:linear-gradient(90deg,#15161a,#3a3d44 45%,#121316)"></div></div>`;
      const kt = E.outBack(prog(lt, .25, .4), 1.6);
      const x = s.x ?? (v ? 250 : 300), y = s.y ?? (v ? 830 : 560), size = s.size || (v ? 34 : 30);
      const sub = [s.age ? `${esc(s.age)} tuổi` : '', esc(s.job || '')].filter(Boolean).join(' · ');
      const tag = `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(-3deg) scale(${lerp(.5, 1, kt).toFixed(3)});opacity:${(o * clamp(kt * 2)).toFixed(3)};font-family:${c.font};font-size:${size}px">
        <div style="display:inline-block;padding:.18em .5em;background:${c.y};color:${c.ink};border:3px solid ${c.ink};border-radius:.3em;font-weight:900;white-space:nowrap;box-shadow:5px 6px 0 ${c.ink}">${esc(s.name || 'Bạn Minh Anh')}</div>
        ${sub ? `<div style="margin:.35em 0 0 .5em;display:inline-block;padding:.22em .55em;background:${c.white};color:${c.ink};border:3px solid ${c.ink};border-radius:.3em;font-weight:700;font-size:.56em;white-space:nowrap;transform:rotate(2deg)">${sub}</div>` : ''}</div>`;
      return { front: mic + tag };
    },

    // 3. Answer card: "TRẢ LỜI" header + numbered points appearing `stagger` s apart (|word| = yellow marker).
    qa_answer(s, t, lt) {
      const c = pal(s), v = VERT(), size = s.size || (v ? 28 : 24), items = s.items || [];
      const st = s.stagger ?? .7;
      const rows = items.map((it, i) => {
        const o = typeof it === 'string' ? { text: it } : it;
        const k = E.outBack(prog(lt, .3 + i * st, .32), 1.6), on = s.active == null ? false : s.active === i;
        if (lt < .3 + i * st && i > 0) return ''; // the card grows row by row
        return `<div${cidOf(o)} style="display:flex;align-items:flex-start;gap:.5em;padding:.32em 0;opacity:${clamp(k * 1.5).toFixed(3)};transform:translateX(${((1 - k) * -30).toFixed(1)}px)">
          <span style="flex:0 0 1.5em;height:1.5em;border-radius:50%;background:${on ? c.pink : c.y};color:${c.ink};border:2.5px solid ${c.ink};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:.9em">${o.num ?? i + 1}</span>
          <span style="font-weight:700;line-height:1.28;padding-top:.08em">${mark(o.text, c)}</span></div>`;
      }).join('');
      const inner = `<div style="padding:.6em .75em .55em;border-radius:.55em;background:${c.white};color:${c.ink};border:4px solid ${c.ink};box-shadow:8px 10px 0 ${c.ink}">
        <div style="display:inline-flex;align-items:center;gap:.35em;padding:.18em .6em;margin-bottom:.25em;border-radius:.4em;background:${c.green};color:#fff;font-weight:900;font-size:.58em;letter-spacing:.14em;white-space:nowrap">
          <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" style="fill:none;stroke:#fff;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round"><path d="M4 12l5 5L20 6"/></svg>${esc(s.label || 'TRẢ LỜI')}</div>
        ${s.title ? `<div style="font-weight:900;font-size:1.12em;line-height:1.2;margin:.1em 0 .2em">${mark(s.title, c)}</div>` : ''}${rows}</div>`;
      return { front: root(s, t, { y: 740, yh: 380, xh: 900, size, w: 620, wh: 620, from: .9 }, inner) };
    },

    // 4. Poll result: question + bars that grow to pct with counting numbers; the winner glows. items:[{label,pct,emoji,color}].
    qa_poll_result(s, t, lt) {
      const c = pal(s), v = VERT(), size = s.size || (v ? 30 : 26);
      const items = s.items || [{ label: 'Có', pct: 68, emoji: '👍', color: c.green }, { label: 'Không', pct: 32, emoji: '👎', color: c.red }];
      const max = Math.max(...items.map(i => i.pct)), grow = s.grow ?? .9;
      const rows = items.map((it, i) => {
        const k = E.outCubic(prog(lt, .35 + i * .15, grow)), win = it.pct === max && k > .98, col = it.color || [c.green, c.red, c.blue, c.pink][i % 4];
        const em = Math.round(size * 1.5);
        return `<div${cidOf(it)} style="display:flex;align-items:center;gap:.45em;margin-top:.45em">
          <div style="position:relative;flex:0 0 ${em}px;height:${em}px;transform:scale(${win ? 1 + .08 * Math.sin(lt * 7) : 1})">${emoji(it.emoji || '🙂', 0, 0, em)}</div>
          <div style="position:relative;flex:1;height:1.7em;border-radius:.5em;background:${c.soft};border:3px solid ${c.ink};overflow:hidden">
            <div style="position:absolute;left:0;top:0;bottom:0;width:${(it.pct * k).toFixed(2)}%;background:${col};${win ? `box-shadow:0 0 22px ${alpha(col, 80)}` : ''}"></div>
            <div style="position:absolute;left:.5em;top:50%;transform:translateY(-50%);font-weight:900;color:${c.ink};white-space:nowrap">${esc(it.label)}</div>
            <div style="position:absolute;right:.5em;top:50%;transform:translateY(-50%);font-weight:900;color:${c.ink};white-space:nowrap">${Math.round(it.pct * k)}%</div></div></div>`;
      }).join('');
      const inner = `<div style="padding:.6em .75em .75em;border-radius:.55em;background:${c.white};color:${c.ink};border:4px solid ${c.ink};box-shadow:8px 10px 0 ${c.ink}">
        <div style="display:flex;align-items:center;gap:.45em"><span style="padding:.16em .55em;border-radius:.4em;background:${c.ink};color:${c.y};font-weight:900;font-size:.55em;letter-spacing:.14em;white-space:nowrap">${esc(s.label || 'KẾT QUẢ KHẢO SÁT')}</span>
          ${s.total ? `<span style="font-weight:700;font-size:.55em;color:${c.grey};white-space:nowrap">${esc(s.total)}</span>` : ''}</div>
        ${s.question ? `<div style="font-weight:800;line-height:1.22;margin-top:.3em">${mark(s.question, c)}</div>` : ''}${rows}</div>`;
      return { front: root(s, t, { y: 330, yh: 330, size, w: 600, wh: 640 }, inner) };
    },

    // 5. Viewer question from comments (TikTok "reply to comment" sticker) sliding in. avatar = image path / emoji / '' (initial).
    //    variant 'input': comment composer bar with typed text + send button (CTA "Hỏi tiếp ở bình luận").
    qa_comment_q(s, t, lt) {
      const c = pal(s), v = VERT(), size = s.size || (v ? 28 : 24);
      const k = E.outBack(prog(lt, 0, .45), 1.4), o = fadeIO(t, s.t0, s.t1, .15, .25);
      const user = s.user || '@ban.xem.video';
      const av = s.avatar && /\.(png|jpe?g|webp|gif)$/i.test(s.avatar)
        ? `<img src="${url(s.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : s.avatar ? `<span style="font-size:1.2em">${esc(s.avatar)}</span>` : `<span style="font-weight:900;color:#fff">${esc((user.replace('@', '')[0] || 'B').toUpperCase())}</span>`;
      const avatar = `<span style="flex:0 0 2.1em;height:2.1em;border-radius:50%;background:linear-gradient(135deg,${c.pink},${c.blue});display:flex;align-items:center;justify-content:center;overflow:hidden;border:2px solid #fff">${av}</span>`;
      const x = s.x ?? (v ? 360 : 640), y = s.y ?? (v ? (s.variant === 'input' ? 770 : 300) : (s.variant === 'input' ? 560 : 200));
      let inner;
      if (s.variant === 'input') {
        const text = s.text || 'Hỏi tiếp ở bình luận nhé 👇', ch = Array.from(text), n = Math.floor(clamp((lt - .45) * (s.cps ?? 22), 0, ch.length));
        const tap = n >= ch.length ? E.outBack(prog(lt, .45 + ch.length / (s.cps ?? 22) + .2, .3), 3) : 0;
        inner = `<div style="display:flex;align-items:center;gap:.5em;padding:.4em .45em .4em .5em;border-radius:999px;background:${c.white};border:3px solid ${c.ink};box-shadow:6px 8px 0 ${c.ink};width:${v ? 620 : 640}px">
          ${avatar}<span style="flex:1;font-weight:700;color:${n ? c.ink : c.grey};white-space:nowrap;overflow:hidden">${esc(ch.slice(0, n).join('')) || 'Thêm bình luận…'}<i style="display:inline-block;width:2px;height:1em;margin-left:2px;vertical-align:-.15em;background:${c.pink};opacity:${Math.floor(lt * 2.2) % 2 ? 0 : 1}"></i></span>
          <span style="flex:0 0 2.2em;height:2.2em;border-radius:50%;background:${c.pink};display:flex;align-items:center;justify-content:center;transform:scale(${(1 + .25 * Math.sin(Math.PI * clamp(tap))).toFixed(3)})">
            <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" style="fill:#fff"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg></span></div>
          ${s.label !== '' ? `<div style="margin-top:.5em;text-align:center;font-weight:900;font-size:1.1em;color:${c.y};text-shadow:0 3px 0 ${c.ink},0 0 14px rgba(0,0,0,.5);-webkit-text-stroke:1.5px ${c.ink};white-space:nowrap">${esc(s.label || 'HỎI TIẾP Ở BÌNH LUẬN')}</div>` : ''}`;
      } else {
        inner = `<div style="position:relative;max-width:${v ? 620 : 680}px;padding:.55em .7em .6em;border-radius:.6em;background:${c.white};color:${c.ink};box-shadow:0 14px 34px rgba(0,0,0,.35)">
          <div style="display:flex;align-items:center;gap:.45em;margin-bottom:.3em">${avatar}
            <div style="line-height:1.15;min-width:0"><div style="font-weight:600;font-size:.62em;color:${c.grey};white-space:nowrap">${esc(s.label || 'Trả lời bình luận của')}</div>
            <div style="font-weight:900;font-size:.8em;white-space:nowrap">${esc(user)}</div></div></div>
          <div style="font-weight:800;line-height:1.26">${mark(s.text || 'Làm sao để bắt đầu khi chưa biết gì?', c)}</div>
          <span style="position:absolute;left:1.4em;bottom:-.55em;width:1.1em;height:1.1em;background:${c.white};transform:rotate(45deg);border-radius:3px"></span></div>`;
      }
      const dx = s.variant === 'input' ? 0 : (1 - k) * -420;
      return { front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;font-family:${c.font};font-size:${size}px;opacity:${o.toFixed(3)};
        transform:translate(-50%,-50%) translateX(${dx.toFixed(1)}px) ${s.variant === 'input' ? `translateY(${((1 - k) * 80).toFixed(1)}px)` : `rotate(${lerp(-6, -1.5, k).toFixed(2)}deg)`}">${inner}</div>` };
    },

    // 6. "Câu 3/10" progress chip with segment dots; number flips in on enter.
    qa_counter(s, t, lt) {
      const c = pal(s), v = VERT(), size = s.size || (v ? 26 : 22);
      const num = s.num ?? 1, total = s.total ?? 5;
      const k = E.outBack(prog(lt, .1, .35), 2.2);
      const dots = total <= 12 ? `<span style="display:flex;gap:4px;margin-left:.2em">${Array.from({ length: total }, (_, i) => `<i style="display:block;width:${i + 1 === num ? 18 : 8}px;height:8px;border-radius:4px;background:${i < num ? c.ink : alpha(c.ink, 25)}"></i>`).join('')}</span>` : '';
      const inner = `<div style="display:inline-flex;align-items:center;gap:.4em;padding:.28em .7em;border-radius:999px;background:${c.y};color:${c.ink};border:3px solid ${c.ink};box-shadow:4px 5px 0 ${c.ink};font-weight:900;white-space:nowrap">
        ${esc(s.label || 'Câu')} <span style="display:inline-block;transform:translateY(${((1 - k) * -14).toFixed(1)}px) scale(${lerp(.4, 1, k).toFixed(3)})">${esc(num)}</span><span style="opacity:.55">/${esc(total)}</span>${dots}</div>`;
      return { front: root(s, t, { y: 150, yh: 50, size }, inner) };
    },

    // 7. Big reveal: white flash, word stamps in (scale 1.7 -> 1) with rays; kicker above ("ĐÁP ÁN"), optional emoji.
    qa_reveal(s, t, lt) {
      const c = pal(s), v = VERT(), size = s.size || (v ? 92 : 84), col = s.word_color || c.y;
      const k = E.outBack(prog(lt, .08, .32), 2.4), fl = 1 - E.outCubic(prog(lt, 0, .3));
      const rays = `<div style="position:absolute;left:50%;top:50%;width:${size * 7}px;height:${size * 7}px;transform:translate(-50%,-50%) rotate(${(lt * 18).toFixed(1)}deg) scale(${lerp(.3, 1, E.outCubic(prog(lt, 0, .5))).toFixed(3)});
        background:repeating-conic-gradient(${alpha(col, 40)} 0 8deg,transparent 8deg 22deg);-webkit-mask-image:radial-gradient(circle,#000 18%,transparent 62%);mask-image:radial-gradient(circle,#000 18%,transparent 62%);opacity:${(.85 * fadeIO(t, s.t0, s.t1, .1, .3)).toFixed(3)}"></div>`;
      const em = s.emoji ? `<div style="position:absolute;left:50%;top:-${Math.round(size * 1.15)}px;transform:translateX(-50%) scale(${E.outBack(prog(lt, .3, .35), 2.5).toFixed(3)})">${emoji(s.emoji, -size * .5, 0, size)}</div>` : '';
      const inner = `<div style="position:relative;text-align:center">${rays}${em}
        ${s.kicker !== '' ? `<div style="position:relative;display:inline-block;padding:.12em .55em;margin-bottom:.15em;border-radius:.3em;background:${c.ink};color:${c.white};font-weight:900;font-size:.3em;letter-spacing:.18em;white-space:nowrap;opacity:${clamp(k).toFixed(3)}">${esc(s.kicker || 'ĐÁP ÁN')}</div>` : ''}
        <div style="position:relative;font-weight:900;line-height:1;letter-spacing:-.02em;text-transform:uppercase;white-space:nowrap;color:${col};-webkit-text-stroke:${Math.max(3, size / 22).toFixed(1)}px ${c.ink};paint-order:stroke fill;
          text-shadow:0 ${(size / 14).toFixed(1)}px 0 ${c.ink},0 0 40px ${alpha(col, 60)};transform:scale(${lerp(1.7, 1, clamp(k, 0, 1.2)).toFixed(3)}) rotate(${s.rot ?? -3}deg)">${esc(s.text || 'ĐÚNG RỒI!')}</div>
        ${s.sub ? `<div style="position:relative;margin-top:.25em;display:inline-block;padding:.2em .6em;border-radius:.3em;background:${c.white};color:${c.ink};font-weight:800;font-size:.32em;white-space:nowrap;opacity:${clamp(prog(lt, .45, .25)).toFixed(3)}">${mark(s.sub, c)}</div>` : ''}</div>`;
      const flash = fl > .01 && s.flash !== false ? `<div class="full" style="background:#fff;opacity:${(fl * .85).toFixed(3)}"></div>` : '';
      const [W, H] = DIMS();
      const x = s.x ?? W / 2, y = s.y ?? (v ? 380 : 300);
      return { front: `${flash}<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;font-family:${c.font};font-size:${size}px;transform:translate(-50%,-50%);opacity:${fadeIO(t, s.t0, s.t1, .05, .25).toFixed(3)}">${inner}</div>` };
    },
  };
  Object.assign(MODULES, MODS);

  // Caption: heavy white words with a thick ink outline (street-interview style); the spoken word sits in a yellow box;
  // a caption that ends with '?' gets a yellow "?" badge.
  CAPTION_STYLES.qa = (c, t) => {
    const p = pal(c), [W] = DIMS(), v = VERT();
    const x = c.x ?? W / 2, y = c.y ?? (v ? 960 : 630), size = c.size || (v ? 46 : 38);
    let k = -1;
    c.words.forEach((w, i) => { if (t >= w.s) k = i; });
    const isQ = /\?\s*$/.test(c.words.map(w => w.w).join(' '));
    const html = c.words.map((w, i) => {
      const on = i === k && t < (w.e ?? w.s + .35) + .08;
      const pop = on ? lerp(1.14, 1.04, E.outCubic(prog(t, w.s, .14))) : 1;
      return `<span style="display:inline-block;padding:0 .12em;border-radius:.18em;${on ? `background:${p.y};color:${p.ink};-webkit-text-stroke:0;text-shadow:none;box-shadow:3px 4px 0 ${p.ink};` : `color:${w.hl ? p.y : c.color || p.white};`}transform:scale(${pop.toFixed(3)}) rotate(${on ? -2 : 0}deg)">${esc(w.w)}</span>${w.br ? '<br>' : ' '}`;
    }).join('');
    const o = clamp(prog(t, c.t0, .08));
    return `<div id="cap" class="qa"${cidOf(c)} style="top:${y}px;left:${x - W / 2}px;right:${W / 2 - x}px;transform:translateY(-50%);display:flex;justify-content:center;align-items:center;gap:12px;opacity:${o.toFixed(3)}">
      ${isQ ? qBadge(p, Math.round(size * 1.1)) : ''}<div style="max-width:${v ? 600 : 1080}px;font-family:${c.font || p.font};font-weight:${c.weight || 900};font-size:${size}px;line-height:1.2;text-align:center;
        color:${p.white};-webkit-text-stroke:${(size / 9).toFixed(1)}px ${p.ink};paint-order:stroke fill;text-shadow:0 4px 0 ${p.ink}">${html}</div></div>`;
  };

  // ---------- Studio metadata ----------
  const XY = (yv, yh) => (VERT() ? { y: yv } : { y: yh });
  // Question sentences in captions: chunks ending with '?' or containing question words, merged with neighbours.
  const QWORDS = ['tại sao', 'vì sao', 'như thế nào', 'thế nào', 'có nên', 'làm sao', 'sao', 'bao nhiêu', 'có phải'];
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
  const capText = c => c.words.map(w => w.w).join(' ');
  function findQuestions(caps) {
    const out = [];
    for (let i = 0; i < caps.length; i++) {
      const txt = capText(caps[i]), n = ' ' + norm(txt).replace(/[.,!?]/g, '') + ' ';
      if (!/\?\s*$/.test(txt) && !QWORDS.some(q => n.includes(' ' + norm(q) + ' '))) continue;
      let a = i, b = i;
      while (a > 0 && a > i - 1 && !/[.?!]\s*$/.test(capText(caps[a - 1])) && caps[a].t0 - caps[a - 1].t1 < .35) a--;
      while (b < caps.length - 1 && b < i + 1 && !/\?\s*$/.test(capText(caps[b])) && caps[b + 1].t0 - caps[b].t1 < .35) b++;
      let q = caps.slice(a, b + 1).map(capText).join(' ').replace(/\s+/g, ' ').trim();
      if (Array.from(q).length > 56) q = Array.from(q).slice(0, 54).join('').replace(/\s+\S*$/, '') + '…';
      q = q.charAt(0).toUpperCase() + q.slice(1).replace(/[.,!]+$/, '');
      if (!/[?…]$/.test(q)) q += '?';
      out.push({ t0: caps[a].t0, t1: caps[b].t1, text: q, after: b + 1 });
      i = b;
    }
    return out;
  }
  PACKS.push({
    id: P, name: 'Hỏi đáp / phỏng vấn đường phố', icon: '❓', caption: 'qa',
    desc: 'Q&A, phỏng vấn đường phố, trả lời câu hỏi: thẻ câu hỏi gõ chữ, micro cầm tay + tên người trả lời, thẻ trả lời đánh số, kết quả khảo sát, câu hỏi từ bình luận, "Câu 3/10", chữ đáp án nổ to',
    items: [
      { type: 'qa_question', label: 'Thẻ câu hỏi (gõ chữ)', make: T => ({ type: 'qa_question', t0: T, t1: T + 3.5, text: 'Nếu được làm lại, bạn có |nên| học đại học?', num: 1, ...XY(340, 240) }) },
      { type: 'qa_mic', label: 'Micro + tên người trả lời', make: T => ({ type: 'qa_mic', t0: T, t1: T + 4, name: 'Bạn Minh Anh', age: 24, job: 'Nhân viên văn phòng', brand: 'Q&A' }) },
      { type: 'qa_answer', label: 'Thẻ trả lời đánh số', make: T => ({ type: 'qa_answer', t0: T, t1: T + 5, items: ['Học |kỹ năng| trước', 'Bằng cấp vẫn có giá trị', 'Quan trọng là trải nghiệm'], stagger: .8, ...XY(740, 380) }) },
      { type: 'qa_poll_result', label: 'Kết quả Có / Không', make: T => ({ type: 'qa_poll_result', t0: T, t1: T + 4, question: 'Có nên nghỉ việc để khởi nghiệp?', total: '1.248 lượt bình chọn', items: [{ label: 'Có', pct: 38, emoji: '👍' }, { label: 'Không', pct: 62, emoji: '👎' }], ...XY(330, 330) }) },
      { type: 'qa_comment_q', label: 'Câu hỏi từ bình luận', make: T => ({ type: 'qa_comment_q', t0: T, t1: T + 4, user: '@thu.trang_99', text: 'Làm sao để |bắt đầu| khi chưa biết gì?', ...XY(300, 200) }) },
      { type: 'qa_comment_q', label: 'Ô bình luận (CTA hỏi tiếp)', make: T => ({ type: 'qa_comment_q', t0: T, t1: T + 3.5, variant: 'input', text: 'Hỏi tiếp ở bình luận nhé 👇', ...XY(770, 560) }) },
      { type: 'qa_counter', label: 'Bộ đếm Câu 3/10', make: T => ({ type: 'qa_counter', t0: T, t1: T + 5, num: 3, total: 10, ...XY(150, 50) }) },
      { type: 'qa_reveal', label: 'Chữ đáp án nổ to', make: T => ({ type: 'qa_reveal', t0: T, t1: T + 2, kicker: 'ĐÁP ÁN', text: 'KHÔNG NÊN', emoji: '🙅', sub: 'nếu chưa có |kế hoạch|', ...XY(380, 300) }) },
    ],
    // Starter edit: question card on question chunks ('?' / sao / tại sao / như thế nào / có nên), "Câu k/N" chip,
    // answer card with the next caption chunks as points, mic + interviewee tag at the first answer, CTA at the end.
    recipe: ctx => {
      const dur = ctx.dur, caps = ctx.captions || [], o = ctx.opts || {}, v = ctx.vertical !== false;
      const scenes = [];
      let qs = findQuestions(caps).filter(q => q.t0 < dur - 4);
      // keep questions at least 4 s apart
      qs = qs.filter((q, i, a) => !i || q.t0 - a[i - 1].t1 > 3.5).slice(0, o.max_q || 6);
      if (!qs.length) qs = [{ t0: .2, t1: Math.min(2.6, dur / 4), text: o.question || ctx.title || 'Bạn nghĩ sao về điều này?', after: caps.findIndex(c => c.t0 >= Math.min(2.6, dur / 4)) }];
      const ctaT = Math.max(dur - 3.2, 0);
      qs.forEach((q, i) => {
        const next = qs[i + 1]?.t0 ?? ctaT;
        const qEnd = Math.min(Math.max(q.t1 + .8, q.t0 + 2.8), next - .3);
        scenes.push({ type: 'qa_question', t0: +q.t0.toFixed(2), t1: +qEnd.toFixed(2), text: q.text, num: qs.length > 1 ? i + 1 : undefined, cps: 34 });
        if (qs.length > 1) scenes.push({ type: 'qa_counter', t0: +q.t0.toFixed(2), t1: +(next - .1).toFixed(2), num: i + 1, total: qs.length, y: v ? 150 : 50 });
        let a0 = qEnd + .25;
        if (i === 0 && next - a0 > 4) {
          scenes.push({ type: 'qa_mic', t0: +a0.toFixed(2), t1: +Math.min(a0 + 3, next - .2).toFixed(2), name: o.guest || 'Khách mời', age: o.age, job: o.job || 'Người trả lời', brand: ctx.brand?.name || 'Q&A' });
          a0 += 3.2;
        }
        const a1 = Math.min(a0 + 5, next - .2);
        if (a1 - a0 < 2) return;
        const pts = caps.filter(c => c.t0 >= a0 - .2 && c.t0 < a1).slice(0, 3).map(c => {
          let s = capText(c).replace(/[.,]+$/, '');
          return s.charAt(0).toUpperCase() + s.slice(1);
        });
        if (pts.length) scenes.push({ type: 'qa_answer', t0: +a0.toFixed(2), t1: +a1.toFixed(2), items: pts, stagger: Math.min(1.2, (a1 - a0 - .8) / Math.max(1, pts.length)) });
      });
      const rv = findWord(caps, ['đáp án', 'câu trả lời là', 'sự thật là', 'thực ra'], 1);
      if (rv != null && rv < ctaT - 2 && !scenes.some(s => s.type === 'qa_reveal')) scenes.push({ type: 'qa_reveal', t0: rv, t1: rv + 1.8, kicker: 'ĐÁP ÁN', text: o.reveal || 'SỰ THẬT LÀ…' });
      scenes.push({ type: 'qa_comment_q', t0: +ctaT.toFixed(2), t1: dur, variant: 'input', text: 'Hỏi tiếp ở bình luận nhé 👇', label: 'HỎI TIẾP Ở BÌNH LUẬN' });
      return { caption_style: 'qa', music: o.music || 'happy', scenes };
    },
  });
})();
