// "Khoá học / bài giảng" pack: premium educator look — white cards, soft shadows, 20px radius, Lexend + Be Vietnam Pro,
// brand primary (default deep blue #2B59FF) + accent (default #FFC83D). Spec: references/pack-course.md.
// Teaching modules (quiz / steps / term / code) default to layout:"split": the talking head shrinks into a rounded
// card at the top and the lesson content sits in a white card below (back-to-back split scenes chain without "pumping").
(() => {
  const P = 'course';
  // JetBrains Mono for course_code (falls back to system monospace if it isn't loaded yet).
  try {
    if (typeof document !== 'undefined' && !document.getElementById('course-pack-fonts')) {
      const l = document.createElement('link');
      l.id = 'course-pack-fonts'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700;800&display=block';
      document.head.appendChild(l);
    }
  } catch (e) { /* no DOM (studio worker) */ }

  // ---------- palette & helpers ----------
  // TL.brand overrides; pack defaults are blue/yellow (BR()'s generic defaults are orange, so read TL.brand directly).
  const pal = () => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {}, br = BR();
    return {
      p: b.primary || '#2B59FF', a: b.accent || '#FFC83D', ink: b.dark || '#0E1A3A', muted: '#5B6785',
      bg: '#F2F5FF', paper: '#FFFFFF', ok: '#12B76A', bad: '#F04438',
      font: b.font || "'Be Vietnam Pro', sans-serif", disp: b.disp || "'Lexend', 'Be Vietnam Pro', sans-serif",
      mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
      logo: br.logo, name: br.name, handle: br.handle, phone: br.phone, website: br.website,
    };
  };
  const mix = (c, pct, w = 'transparent') => `color-mix(in srgb, ${c} ${pct}%, ${w})`;
  const f3 = v => (+v).toFixed(3);
  const SHADOW = '0 18px 44px rgba(14,26,58,.22), 0 3px 10px rgba(14,26,58,.10)';
  // *word* → accent marker highlight that draws on with k (0..1).
  const rich = (text, k = 1, col) => esc(text || '').replace(/\*(.+?)\*/g, (_, w) =>
    `<span style="background:linear-gradient(transparent 60%, ${mix(col || pal().a, 60)} 60%, ${mix(col || pal().a, 60)} 92%, transparent 92%) no-repeat 0 0 / ${(clamp(k) * 100).toFixed(1)}% 100%;padding:0 .06em">${w}</span>`);
  const plain = text => String(text || '').replace(/\*/g, '');
  const fitSize = (text, base, maxW, maxLines, cw = .56) => Math.round(Math.min(base, (maxLines * maxW) / (cw * Math.max(1, plain(text).length))));
  const icon = (ic, size) => {
    if (!ic) return '';
    if (/\.(png|jpe?g|webp|svg|gif)$/i.test(ic) || /^(https?:|data:)/.test(ic)) return `<img src="${url(ic)}" style="width:100%;height:100%;object-fit:cover">`;
    return slIcon(ic, size);
  };

  // ---------- split stage (video card + content box) ----------
  const SPLIT = new Set(['course_quiz', 'course_steps', 'course_term', 'course_code']);
  const isSplit = s => SPLIT.has(s.type) && (s.layout || 'split') === 'split';
  const geo = () => (VERT()
    ? { vid: { x: 40, y: 196, w: 640, h: 380 }, box: { x: 40, y: 600, w: 640, h: 390 }, ov: { x: 40, y: 600, w: 640, h: 390 } }
    : { vid: { x: 48, y: 96, w: 600, h: 528 }, box: { x: 676, y: 96, w: 556, h: 528 }, ov: { x: 676, y: 96, w: 556, h: 528 } });
  const chained = (s, dir) => (TL.scenes || []).some(o => o !== s && !o.hidden && isSplit(o) &&
    Math.abs(dir === 'in' ? o.t1 - s.t0 : o.t0 - s.t1) < .08);
  // How far the video has shrunk into its card (0 = full frame, 1 = card).
  const splitK = (s, t) => (chained(s, 'in') ? 1 : E.inOutSine(prog(t, s.t0, .45))) * (chained(s, 'out') ? 1 : 1 - E.inOutSine(prog(t, s.t1 - .4, .4)));
  function splitBack(s, t) {
    const [W, H] = DIMS(), C = pal(), v = { ...geo().vid, ...(s.video || {}) }, k = splitK(s, t);
    const x = lerp(0, v.x, k), y = lerp(0, v.y, k), w = lerp(W, v.w, k), h = lerp(H, v.h, k), r = lerp(0, 28, k);
    const fy = Math.round(((TL.face?.y ?? H * .4) / H) * 100);
    return `<div class="full" style="background:${C.bg};background-image:radial-gradient(${mix(C.p, 16)} 1.6px, transparent 1.8px);background-size:28px 28px"></div>
      <div class="full" style="background:radial-gradient(ellipse at 50% 0%, ${mix(C.p, 14)} 0%, transparent 60%)"></div>
      <div class="abs"${cidOf(s.video)} style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;border-radius:${r.toFixed(1)}px;overflow:hidden;
        box-shadow:${k > .05 ? SHADOW : 'none'};background:#000">${arollImg(t, '', `object-position:50% ${fy}%`)}</div>`;
  }
  // Content box: split → fixed box under the video; overlay → card over the live video.
  function boxOf(s) {
    const g = geo();
    return { ...(isSplit(s) ? g.box : g.ov), ...(s.card || {}) };
  }
  // White card shell with entrance (rise + fade) and exit.
  function cardShell(s, t, inner, extra = '') {
    const b = boxOf(s), C = pal();
    const k = E.outCubic(prog(t, s.t0 + (isSplit(s) && !chained(s, 'in') ? .2 : 0), .4));
    const o = clamp(k * 1.4) * (1 - E.inCubic(prog(t, s.t1 - .25, .25)));
    return `<div class="abs"${cidOf(s)} style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;border-radius:22px;background:${C.paper};
      box-shadow:${SHADOW};padding:26px 28px;display:flex;flex-direction:column;gap:14px;font-family:${C.font};color:${C.ink};
      opacity:${f3(o)};transform:translateY(${((1 - k) * 40).toFixed(1)}px);${extra}">${inner}</div>`;
  }
  const chip = (text, bg, fg, size = 18) => `<span style="display:inline-flex;align-items:center;gap:6px;background:${bg};color:${fg};font-family:${pal().disp};font-weight:800;
    font-size:${size}px;letter-spacing:.06em;line-height:1.5;padding:2px 12px;border-radius:999px;white-space:nowrap">${text}</span>`;

  const MOD = {
    // Chapter / lesson title card. cover:true = full branded frame; cover:false = white card over the video at y.
    course_chapter(s, t, lt) {
      const [W, H] = DIMS(), C = pal(), num = s.num || 'BÀI 1', title = s.title || 'Tên bài học', sub = s.subtitle ?? '';
      const kb = E.outBack(prog(lt, .2, .35), 2), kt = E.outCubic(prog(lt, .32, .45)), ks = E.outCubic(prog(lt, .55, .4)), ku = E.outCubic(prog(lt, .6, .5));
      if (s.cover !== false) {
        const wipe = 1 - E.outExpo(prog(lt, 0, .5)), up = E.inOutSine(prog(t, s.t1 - .45, .45));
        const digits = (num.match(/\d+/) || ['1'])[0].padStart(2, '0');
        const maxW = W - 120, size = fitSize(title, s.size || (VERT() ? 66 : 72), maxW, 3);
        const y = s.y ?? H * .47, x = s.x ?? 60;
        return {
          back: '', cover: true, hideCaptions: true,
          front: `<div class="full"${cidOf(s)} style="clip-path:inset(0 ${(wipe * 100).toFixed(2)}% ${(up * 100).toFixed(2)}% 0);
            background:linear-gradient(155deg, ${C.p} 0%, ${mix(C.p, 72, '#050A24')} 100%);overflow:hidden;font-family:${C.font}">
            <div class="full" style="background-image:radial-gradient(rgba(255,255,255,.13) 1.6px, transparent 1.8px);background-size:30px 30px"></div>
            <div class="abs" style="right:-30px;top:${VERT() ? 120 : 40}px;font-family:${C.disp};font-weight:900;font-size:${VERT() ? 360 : 420}px;line-height:1.1;color:rgba(255,255,255,.07);
              transform:translateX(${((1 - kt) * 80).toFixed(1)}px)">${digits}</div>
            <div class="abs" style="left:${x}px;top:${y}px;width:${maxW}px;transform:translateY(-50%)">
              <div style="transform:scale(${f3(clamp(kb, 0, 1.3))});transform-origin:0 50%;opacity:${f3(clamp(kb * 2))}">${chip(esc(num), C.a, C.ink, 26)}</div>
              <div style="margin-top:22px;font-family:${C.disp};font-weight:800;font-size:${size}px;line-height:1.28;color:#fff;letter-spacing:-.01em;
                opacity:${f3(kt)};transform:translateY(${((1 - kt) * 36).toFixed(1)}px)">${esc(title).replace(/\*(.+?)\*/g, `<span style="color:${C.a}">$1</span>`)}</div>
              <div style="margin-top:20px;width:${(ku * 120).toFixed(1)}px;height:8px;border-radius:4px;background:${C.a}"></div>
              ${sub ? `<div style="margin-top:22px;font-weight:500;font-size:${VERT() ? 30 : 32}px;line-height:1.45;color:rgba(255,255,255,.86);opacity:${f3(ks)};transform:translateY(${((1 - ks) * 20).toFixed(1)}px)">${esc(sub)}</div>` : ''}
            </div>
            ${C.name || C.logo ? `<div class="abs" style="left:${x}px;bottom:${VERT() ? 300 : 60}px;display:flex;align-items:center;gap:14px;opacity:${f3(ks)}">
              ${C.logo ? `<span style="width:52px;height:52px;border-radius:14px;background:#fff;display:inline-flex;align-items:center;justify-content:center;overflow:hidden">${icon(C.logo, 36)}</span>` : ''}
              <span style="font-family:${C.disp};font-weight:700;font-size:24px;color:#fff;line-height:1.4">${esc(C.name || '')}</span></div>` : ''}
          </div>`,
        };
      }
      // overlay card
      const w = s.w || (VERT() ? 640 : 760), x = s.x ?? W / 2, y = s.y ?? (VERT() ? 200 : 96); // top edge
      const size = fitSize(title, s.size || 46, w - 90, 2);
      const k = E.outExpo(prog(lt, 0, .5)), o = clamp(lt / .15) * (1 - E.inCubic(prog(t, s.t1 - .3, .3)));
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x - w / 2}px;top:${y}px;width:${w}px;transform:translateX(${((1 - k) * -120).toFixed(1)}px);opacity:${f3(o)};
          background:${C.paper};border-radius:22px;box-shadow:${SHADOW};padding:24px 30px 26px 40px;font-family:${C.font};color:${C.ink};overflow:hidden">
          <div class="abs" style="left:0;top:0;bottom:0;width:10px;background:linear-gradient(${C.p},${mix(C.p, 60, C.a)})"></div>
          <div style="transform:scale(${f3(clamp(kb, 0, 1.3))});transform-origin:0 50%">${chip(esc(num), C.p, '#fff', 20)}</div>
          <div style="margin-top:12px;font-family:${C.disp};font-weight:800;font-size:${size}px;line-height:1.3;opacity:${f3(kt)}">${rich(title, ku)}</div>
          ${sub ? `<div style="margin-top:8px;font-weight:500;font-size:24px;line-height:1.45;color:${C.muted};opacity:${f3(ks)}">${esc(sub)}</div>` : ''}
        </div>`,
      };
    },

    // Thin lesson progress bar at the top: "BÀI x/y · tên bài", fills from `from` to `to` over the scene.
    course_progress(s, t, lt) {
      const [W] = DIMS(), C = pal(), w = s.w || (VERT() ? 640 : 900), x = s.x ?? W / 2, y = s.y ?? (VERT() ? 152 : 44);
      const p = lerp(s.from ?? 0, s.to ?? 1, prog(t, s.t0, Math.max(.1, s.t1 - s.t0)));
      const k = E.outCubic(prog(lt, 0, .4)), o = clamp(k * 1.5) * (1 - E.inCubic(prog(t, s.t1 - .25, .25)));
      const lab = `BÀI ${s.idx ?? 1}${s.total ? `/${s.total}` : ''}`;
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x - w / 2}px;top:${y}px;width:${w}px;height:52px;transform:translateY(${((1 - k) * -40 - 26).toFixed(1)}px);opacity:${f3(o)};
          background:rgba(255,255,255,.94);border-radius:16px;box-shadow:0 10px 26px rgba(14,26,58,.22);overflow:hidden;display:flex;align-items:center;gap:12px;padding:0 16px 4px 8px;font-family:${C.font};color:${C.ink}">
          ${chip(lab, C.p, '#fff', 17)}
          <span style="flex:1;min-width:0;font-weight:700;font-size:20px;line-height:1.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.title || 'Tên bài học')}</span>
          <span style="font-family:${C.disp};font-weight:800;font-size:18px;color:${C.p};font-variant-numeric:tabular-nums">${Math.round(p * 100)}%</span>
          <div class="abs" style="left:0;right:0;bottom:0;height:6px;background:${mix(C.p, 14)}"></div>
          <div class="abs" style="left:0;bottom:0;height:6px;width:${(p * 100).toFixed(2)}%;background:linear-gradient(90deg, ${C.p}, ${C.a});border-radius:0 3px 3px 0"></div>
        </div>`,
      };
    },

    // "Ghi nhớ / Lưu ý" callout card, pops at key_t. kind: remember | note | warn | tip. *word* gets a marker.
    course_keypoint(s, t, lt) {
      const [W] = DIMS(), C = pal();
      const K = { remember: ['GHI NHỚ', '📌', C.p, '#fff'], note: ['LƯU Ý', '💡', C.a, C.ink], warn: ['CHÚ Ý', '⚠️', C.bad, '#fff'], tip: ['MẸO', '✨', C.ok, '#fff'] }[s.kind || 'remember'] || [];
      const [label, ic, col, fg] = [s.label || K[0], s.icon || K[1], s.color || K[2], K[3]];
      const kt = s.key_t ?? s.t0, w = s.w || (VERT() ? 640 : 720), x = s.x ?? W / 2, y = s.y ?? (VERT() ? 770 : 560), size = s.size || 32;
      if (t < kt) return {};
      const k = E.outBack(prog(t, kt, .38), 1.9), o = clamp((t - kt) / .12) * (1 - E.inCubic(prog(t, s.t1 - .25, .25)));
      const ring = prog(t, kt + .1, .6);
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x - w / 2}px;top:${y}px;width:${w}px;transform:translateY(-50%) scale(${f3(lerp(.6, 1, clamp(k, 0, 1.2)))});opacity:${f3(o)};
          background:${C.paper};border-radius:22px;box-shadow:${SHADOW};padding:22px 26px 24px 30px;display:flex;gap:20px;align-items:center;font-family:${C.font};color:${C.ink};overflow:hidden">
          <div class="abs" style="left:0;top:0;bottom:0;width:9px;background:${col}"></div>
          <div style="position:relative;flex:none;width:84px;height:84px;border-radius:22px;background:${mix(col, 16)};display:flex;align-items:center;justify-content:center">
            <div class="abs" style="inset:${(-ring * 14).toFixed(1)}px;border-radius:${(22 + ring * 10).toFixed(1)}px;border:3px solid ${col};opacity:${f3((1 - ring) * .8)}"></div>${slIcon(ic, 54)}</div>
          <div style="flex:1;min-width:0">
            <div>${chip(esc(label), col, fg, 17)}</div>
            <div style="margin-top:8px;font-weight:700;font-size:${size}px;line-height:1.38">${rich(s.text || 'Nội dung cần ghi nhớ', prog(t, kt + .3, .5), col === C.a ? C.a : C.a)}</div>
          </div></div>`,
      };
    },

    // Numbered steps; each step appears at its own t, the current one is highlighted, earlier ones get a check.
    course_steps(s, t, lt) {
      const C = pal(), b = boxOf(s), steps = (s.steps || []).map((st, i) => (typeof st === 'string' ? { text: st, t: s.t0 + .5 + i * .8 } : st));
      let cur = -1;
      steps.forEach((st, i) => { if (t >= (st.t ?? s.t0)) cur = i; });
      const n = Math.max(1, steps.length), avail = b.h - 52 - (s.title ? 64 : 0) - (n - 1) * 10;
      const rowH = Math.min(86, avail / n), fs = s.size || Math.round(Math.min(30, rowH * .38));
      const rows = steps.map((st, i) => {
        if (i > cur) return '';
        const k = E.outCubic(prog(t, st.t ?? s.t0, .35)), on = i === cur, done = i < cur;
        const dot = done ? `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : String(i + 1);
        return `<div${cidOf(st)} style="display:flex;align-items:center;gap:18px;min-height:${rowH.toFixed(0)}px;padding:6px 16px;border-radius:16px;
          background:${on ? mix(C.p, 10) : 'transparent'};border:2px solid ${on ? mix(C.p, 35) : 'transparent'};
          opacity:${f3(clamp(k * 1.5) * (done ? .62 : 1))};transform:translateX(${((1 - k) * -60).toFixed(1)}px)">
          <div style="flex:none;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:${C.disp};font-weight:800;font-size:24px;
            background:${done ? C.ok : on ? C.p : mix(C.p, 12)};color:${done || on ? '#fff' : C.p};box-shadow:${on ? `0 0 0 ${(6 + Math.sin(t * 6) * 2).toFixed(1)}px ${mix(C.p, 18)}` : 'none'}">${dot}</div>
          <div style="flex:1;font-weight:${on ? 800 : 600};font-size:${fs}px;line-height:1.35">${rich(st.text, on ? prog(t, (st.t ?? s.t0) + .2, .4) : 1)}</div></div>`;
      }).join('');
      const head = s.title ? `<div style="display:flex;align-items:center;justify-content:space-between;line-height:1.4">
        <span style="font-family:${C.disp};font-weight:800;font-size:30px">${esc(s.title)}</span>${chip(`${Math.max(0, cur + 1)}/${steps.length}`, mix(C.p, 12), C.p, 18)}</div>` : '';
      return { back: isSplit(s) ? splitBack(s, t) : '', cover: isSplit(s), hideCaptions: isSplit(s), front: cardShell(s, t, head + `<div style="display:flex;flex-direction:column;gap:10px">${rows}</div>`) };
    },

    // Quiz: question + 4 options (A–D) + countdown ring; at reveal_t the correct one turns green, the rest dim.
    course_quiz(s, t, lt) {
      const C = pal(), b = boxOf(s), opts = (s.options || ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D']).slice(0, 4);
      const rv = s.reveal_t ?? s.t1 - 1.2, revealed = t >= rv, rk = E.outBack(prog(t, rv, .35), 2);
      const start = s.t0 + .6, frac = clamp((rv - t) / Math.max(.1, rv - start)), secs = Math.max(0, Math.ceil(rv - t));
      const R = 24, CIRC = 2 * Math.PI * R;
      const ring = `<div style="position:relative;width:62px;height:62px;flex:none">
        <svg viewBox="0 0 62 62" width="62" height="62" style="transform:rotate(-90deg)"><circle cx="31" cy="31" r="${R}" fill="none" stroke="${mix(C.p, 14)}" stroke-width="6"/>
          <circle cx="31" cy="31" r="${R}" fill="none" stroke="${revealed ? C.ok : frac < .34 ? C.bad : C.p}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="${(CIRC * (1 - (revealed ? 1 : frac))).toFixed(2)}"/></svg>
        <div class="abs" style="inset:0;display:flex;align-items:center;justify-content:center;font-family:${C.disp};font-weight:800;font-size:24px;color:${revealed ? C.ok : C.ink}">${revealed ? '✓' : secs}</div></div>`;
      const qs = fitSize(s.question || 'Câu hỏi?', s.size || 30, b.w - 60, 2, .55);
      const cols = b.w > 600 || !VERT() ? 2 : 2;
      const opt = opts.map((o, i) => {
        const k = E.outBack(prog(t, s.t0 + .45 + i * .1, .35), 1.6), good = i === (s.correct ?? 0);
        const st = !revealed ? `background:${C.paper};border:2px solid ${mix(C.p, 22)}` : good ? `background:${C.ok};border:2px solid ${C.ok};color:#fff` : `background:#F4F5F8;border:2px solid #E6E8EE`;
        const tile = !revealed ? `background:${mix(C.p, 12)};color:${C.p}` : good ? 'background:#fff;color:' + C.ok : 'background:#E3E6EC;color:#9AA1B2';
        const sc = revealed && good ? lerp(1, 1.04, clamp(rk, 0, 1.3)) : lerp(.7, 1, clamp(k, 0, 1.2));
        return `<div${cidOf(typeof s.options?.[i] === 'object' ? s.options[i] : null)} style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;${st};
          opacity:${f3(clamp(k * 2) * (revealed && !good ? .45 : 1))};transform:scale(${f3(sc)});${revealed && good ? `box-shadow:0 10px 24px ${mix(C.ok, 40)}` : ''}">
          <span style="flex:none;width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:${C.disp};font-weight:800;font-size:22px;${tile}">${revealed && good ? '✓' : 'ABCD'[i]}</span>
          <span style="font-weight:700;font-size:${s.opt_size || 23}px;line-height:1.3">${esc(typeof o === 'object' ? o.text : o)}</span></div>`;
      }).join('');
      const inner = `<div style="display:flex;align-items:center;gap:16px">${chip('CÂU HỎI', C.a, C.ink, 18)}<span style="flex:1"></span>${ring}</div>
        <div style="font-family:${C.disp};font-weight:700;font-size:${qs}px;line-height:1.35;margin-top:-4px">${esc(s.question || 'Câu hỏi?')}</div>
        <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;margin-top:2px">${opt}</div>`;
      return { back: isSplit(s) ? splitBack(s, t) : '', cover: isSplit(s), hideCaptions: isSplit(s), front: cardShell(s, t, inner, 'gap:14px;padding:22px 24px;justify-content:center') };
    },

    // Definition card: tag + term (big) + optional en/phonetic + definition + optional example.
    course_term(s, t, lt) {
      const C = pal(), b = boxOf(s), d = .2;
      const k1 = E.outCubic(prog(lt, d + .1, .4)), k2 = E.outCubic(prog(lt, d + .35, .45)), k3 = E.outCubic(prog(lt, d + .7, .4)), ku = E.outCubic(prog(lt, d + .3, .5));
      const ts = fitSize(s.term || 'Thuật ngữ', s.size || 58, b.w - 60, 1, .6);
      const inner = `<div style="display:flex;align-items:center;gap:12px">${chip(esc(s.tag || '📘 THUẬT NGỮ'), mix(C.p, 12), C.p, 17)}
          ${s.en ? `<span style="font-style:italic;font-weight:500;font-size:22px;color:${C.muted};line-height:1.5">${esc(s.en)}</span>` : ''}</div>
        <div style="opacity:${f3(k1)};transform:translateY(${((1 - k1) * 20).toFixed(1)}px)">
          <div style="font-family:${C.disp};font-weight:800;font-size:${ts}px;line-height:1.25;color:${C.p};letter-spacing:-.01em">${esc(s.term || 'Thuật ngữ')}</div>
          <div style="margin-top:6px;width:${(ku * 110).toFixed(1)}px;height:7px;border-radius:4px;background:${C.a}"></div></div>
        <div style="font-weight:500;font-size:${s.def_size || 27}px;line-height:1.45;opacity:${f3(k2)};transform:translateY(${((1 - k2) * 14).toFixed(1)}px)">${rich(s.definition || 'Định nghĩa ngắn gọn, dễ hiểu.', k3)}</div>
        ${s.example ? `<div style="margin-top:auto;padding:12px 16px;border-radius:14px;background:${mix(C.p, 7)};border-left:6px solid ${C.a};font-size:22px;line-height:1.45;opacity:${f3(k3)}">
          <b style="color:${C.p}">Ví dụ:</b> ${esc(s.example)}</div>` : ''}`;
      return { back: isSplit(s) ? splitBack(s, t) : '', cover: isSplit(s), hideCaptions: isSplit(s), front: cardShell(s, t, inner) };
    },

    // Code / formula box: dark editor, monospace, typewriter at cps, optional highlighted line (1-based) from hl_t.
    course_code(s, t, lt) {
      const C = pal(), b = boxOf(s), code = String(s.code ?? 'print("Xin chào!")'), cps = s.cps || 32;
      const start = s.t0 + (s.delay ?? .45);
      let left = Math.max(0, Math.floor((t - start) * cps));
      const total = code.length, typing = left < total;
      const KW = /^(def|return|if|else|elif|for|while|in|import|from|as|class|const|let|var|function|print|True|False|None|and|or|not|new|await|async)$/;
      const tok = line => {
        const out = [], re = /(#.*$|\/\/.*$)|("[^"]*"?|'[^']*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_À-ỹ][\wÀ-ỹ]*)|(\s+)|(.)/g;
        let m;
        while ((m = re.exec(line))) {
          const [txt] = m;
          const col = m[1] ? '#7C8DB5' : m[2] ? '#A5E3A0' : m[3] ? '#FFB86B' : m[4] ? (KW.test(txt) ? '#8FB3FF' : /\($/.test(line.slice(0, re.lastIndex + 1)) ? '#FFD580' : '#E6EAF5') : '#C9D1E6';
          out.push([txt, col]);
        }
        return out;
      };
      const ls = code.split('\n'), hl = s.hl_line, hk = hl ? E.outCubic(prog(t, s.hl_t ?? start + total / cps + .2, .35)) : 0;
      let lastLine = 0;
      const rows = ls.map((ln, i) => {
        if (left <= 0 && i > 0) return '';
        lastLine = i;
        let html = '';
        for (const [txt, col] of tok(ln)) {
          if (left <= 0) break;
          const part = txt.slice(0, left); left -= part.length;
          html += `<span style="color:${col}">${esc(part)}</span>`;
        }
        left -= 1; // newline
        const on = hl === i + 1;
        return `<div style="position:relative;display:flex;gap:18px;padding:0 14px;line-height:1.75;white-space:pre">
          ${on ? `<div class="abs" style="inset:0;border-radius:8px;background:${mix(C.a, 22 * hk)};border-left:4px solid ${mix(C.a, 100 * hk)}"></div>` : ''}
          <span style="position:relative;width:26px;text-align:right;color:#4E5B7E">${i + 1}</span><span style="position:relative">${html}${'%CUR' + i}</span></div>`;
      }).join('');
      const blink = typing || Math.floor((t - start) * 2.2) % 2 === 0;
      const body = rows.replace(/%CUR(\d+)/g, (_, i) => (+i === lastLine && blink ? `<span style="display:inline-block;width:.6em;height:1.1em;vertical-align:-.18em;background:${C.a};margin-left:1px"></span>` : ''));
      const fs = s.size || Math.round(Math.min(24, (b.w - 110) / (.6 * Math.max(16, ...ls.map(l => l.length)))));
      const inner = `<div style="display:flex;align-items:center;gap:8px;padding:0 4px 4px">
          <i style="width:13px;height:13px;border-radius:50%;background:#FF5F57"></i><i style="width:13px;height:13px;border-radius:50%;background:#FEBC2E"></i><i style="width:13px;height:13px;border-radius:50%;background:#28C840"></i>
          <span style="margin-left:12px;font-family:${C.font};font-weight:600;font-size:18px;color:#AFB9D6;line-height:1.5">${esc(s.title || 'main.py')}</span><span style="flex:1"></span>
          ${chip(esc(s.lang || 'PYTHON'), mix(C.p, 45), '#fff', 14)}</div>
        <div style="font-family:${C.mono};font-weight:500;font-size:${fs}px;color:#E6EAF5;padding:10px 0;border-radius:14px;background:rgba(255,255,255,.035);flex:1">${body}</div>
        ${s.caption ? `<div style="font-family:${C.font};font-weight:600;font-size:22px;color:#C9D1E6;line-height:1.45">${rich(s.caption, hk)}</div>` : ''}`;
      return { back: isSplit(s) ? splitBack(s, t) : '', cover: isSplit(s), hideCaptions: isSplit(s), front: cardShell(s, t, inner, `background:#101830;color:#E6EAF5;padding:20px 20px 22px;gap:12px;border:1px solid rgba(255,255,255,.08)`) };
    },

    // Hand-drawn annotation over the video. shape: circle | underline | arrow | box. x,y = centre of the target, w,h = its size.
    // arrow runs from the bottom-left corner of the box to the top-right one (flip:true mirrors it).
    course_annotate(s, t, lt) {
      const [W, H] = DIMS(), C = pal(), col = s.color || C.a, sw = s.stroke || 8;
      const x = s.x ?? W / 2, y = s.y ?? H / 2, w = s.w ?? 300, h = s.h ?? 200, shape = s.shape || 'circle';
      const k = E.inOutSine(prog(lt, .05, s.dur || .55)), o = 1 - E.inCubic(prog(t, s.t1 - .25, .25));
      let d = '', d2 = '', lx = x, ly = y - h / 2 - 34;
      if (shape === 'circle') {
        const pts = [], N = 72, a0 = -2.3, sweep = Math.PI * 2 * 1.1;
        for (let i = 0; i <= N; i++) {
          const q = i / N, a = a0 + sweep * q, wob = 1 + .035 * Math.sin(a * 3 + 1) + .05 * q;
          pts.push(`${(x + Math.cos(a) * w / 2 * 1.06 * wob).toFixed(1)},${(y + Math.sin(a) * h / 2 * 1.06 * wob).toFixed(1)}`);
        }
        d = 'M' + pts.join(' L');
        ly = y - h / 2 * 1.12 - 36;
      } else if (shape === 'underline') {
        const yy = y + h / 2;
        d = `M${x - w / 2},${yy + 4} Q${x - w / 6},${yy - 8} ${x},${yy + 2} T${x + w / 2},${yy - 4}`;
        d2 = `M${x - w / 2 + w * .12},${yy + 18} Q${x},${yy + 8} ${x + w / 2 - w * .08},${yy + 14}`;
        ly = yy + 56;
      } else if (shape === 'box') {
        const l = x - w / 2, r = x + w / 2, tp = y - h / 2, bt = y + h / 2, j = 6;
        d = `M${l + 18},${tp - j} L${r + j},${tp + 2} L${r - 2},${bt + j} L${l - j},${bt - 2} L${l + 4},${tp + 10}`;
      } else {
        const fl = s.flip ? -1 : 1, x0 = x - fl * w / 2, y0 = y + h / 2, x1 = x + fl * w / 2, y1 = y - h / 2;
        const bend = s.bend ?? .25, mx = (x0 + x1) / 2 + (y1 - y0) * bend * fl, my = (y0 + y1) / 2 - (x1 - x0) * bend * fl;
        d = `M${x0},${y0} Q${mx},${my} ${x1},${y1}`;
        const ang = Math.atan2(y1 - my, x1 - mx), L = 34;
        d2 = `M${(x1 - L * Math.cos(ang - .5)).toFixed(1)},${(y1 - L * Math.sin(ang - .5)).toFixed(1)} L${x1},${y1} L${(x1 - L * Math.cos(ang + .5)).toFixed(1)},${(y1 - L * Math.sin(ang + .5)).toFixed(1)}`;
        lx = x0; ly = y0 + 40;
      }
      const k2 = E.outCubic(prog(lt, .05 + (s.dur || .55) * .85, .25));
      const path = (pd, kk) => `<path d="${pd}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${f3(1 - kk)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
      const lk = E.outBack(prog(lt, .4, .3), 2);
      const label = s.label ? `<div class="abs" style="left:${lx}px;top:${ly}px;transform:translate(-50%,-50%) rotate(${s.tilt ?? -4}deg) scale(${f3(clamp(lk, 0, 1.3))});
        font-family:${C.disp};font-weight:800;font-size:${s.size || 30}px;line-height:1.35;white-space:nowrap;padding:2px 16px;border-radius:12px;background:${col};color:${col === C.a ? C.ink : '#fff'};
        box-shadow:0 8px 20px rgba(0,0,0,.3)">${esc(s.label)}</div>` : '';
      return {
        front: `<div class="full"${cidOf(s)} style="opacity:${f3(o)}"><svg class="full" viewBox="0 0 ${W} ${H}" style="filter:drop-shadow(0 3px 5px rgba(0,0,0,.35))">
          ${path(d, k)}${d2 ? path(d2, shape === 'arrow' ? k2 : E.outCubic(prog(lt, .35, .35))) : ''}</svg>${label}</div>`,
      };
    },

    // Instructor lower-third: avatar circle, name, title/credential with a verified tick, optional logo.
    course_instructor(s, t, lt) {
      const [W] = DIMS(), C = pal(), x = s.x ?? (VERT() ? 40 : 60), y = s.y ?? (VERT() ? 790 : 540), sz = s.size || 96;
      const av = s.avatar || C.logo || '👨‍🏫', logo = s.logo ?? '';
      const ka = E.outBack(prog(lt, 0, .4), 2), kw = E.outExpo(prog(lt, .15, .55)), kt = E.outCubic(prog(lt, .35, .4));
      const out = E.inCubic(prog(t, s.t1 - .35, .35));
      const name = s.name || C.name || 'Giảng viên', role = s.role || 'Chuyên gia đào tạo';
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(${(-out * 120).toFixed(1)}px,-50%);opacity:${f3(1 - out)};display:flex;align-items:center;font-family:${C.font};color:${C.ink}">
          <div style="position:relative;z-index:2;flex:none;width:${sz}px;height:${sz}px;border-radius:50%;background:${C.paper};border:5px solid ${C.p};box-shadow:0 10px 26px rgba(14,26,58,.3);
            display:flex;align-items:center;justify-content:center;overflow:hidden;transform:scale(${f3(clamp(ka, 0, 1.3))})">${icon(av, sz * .62)}</div>
          <div style="margin-left:-${sz / 2}px;padding:14px 26px 14px ${sz / 2 + 20}px;border-radius:0 22px 22px 0;background:${C.paper};box-shadow:${SHADOW};
            clip-path:inset(-20px ${((1 - kw) * 100).toFixed(1)}% -20px 0 round 0 22px 22px 0);display:flex;align-items:center;gap:18px;border-left:0">
            <div style="opacity:${f3(kt)};transform:translateX(${((1 - kt) * -16).toFixed(1)}px)">
              <div style="font-family:${C.disp};font-weight:800;font-size:${Math.round(sz * .31)}px;line-height:1.3;white-space:nowrap">${esc(name)}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:2px;font-weight:600;font-size:${Math.round(sz * .21)}px;color:${C.muted};line-height:1.45;white-space:nowrap">
                <span style="width:22px;height:22px;border-radius:50%;background:${C.p};color:#fff;font-size:14px;display:inline-flex;align-items:center;justify-content:center">✓</span>${esc(role)}</div>
            </div>
            ${logo ? `<div style="width:56px;height:56px;border-radius:14px;background:${mix(C.p, 8)};display:flex;align-items:center;justify-content:center;opacity:${f3(kt)}">${icon(logo, 38)}</div>` : ''}
          </div>
          <div class="abs" style="left:${sz * .5}px;right:0;bottom:-8px;height:6px;border-radius:3px;background:linear-gradient(90deg,${C.p},${C.a});transform-origin:0 50%;transform:scaleX(${f3(kw)})"></div>
        </div>`,
      };
    },

    // Enrol CTA over a blurred frame: course name, struck old price → new price, live countdown, pulsing button, contact.
    course_cta(s, t, lt) {
      const [W, H] = DIMS(), C = pal(), w = s.w || (VERT() ? 620 : 640), x = s.x ?? W / 2, y = s.y ?? (VERT() ? 600 : H / 2);
      const k = E.outBack(prog(lt, .1, .45), 1.4), kp = E.outCubic(prog(lt, .45, .35)), ks = E.outCubic(prog(lt, .75, .3)), kb = E.outBack(prog(lt, .9, .4), 2);
      const num = v => +String(v || '').replace(/[^\d]/g, '') || 0;
      const oldP = s.old_price ?? '2.990.000đ', newP = s.price ?? '1.490.000đ';
      const pct = num(oldP) && num(newP) ? Math.round((1 - num(newP) / num(oldP)) * 100) : 0;
      const rem = Math.max(0, Math.floor((s.countdown ?? 86352) - lt)), hh = String(Math.floor(rem / 3600)).padStart(2, '0'), mm = String(Math.floor(rem / 60) % 60).padStart(2, '0'), ss = String(rem % 60).padStart(2, '0');
      const pulse = 1 + .035 * Math.max(0, Math.sin((lt - 1) * 6));
      const shine = ((lt * .8) % 1.4) / 1.4 * 160 - 30;
      const contact = [s.phone ?? C.phone, s.website ?? C.website].filter(Boolean).map(esc).join('  ·  ');
      const blur = s.blur_bg === false ? '' : `${arollImg(t, 'blur(16px) brightness(.5)', 'transform:scale(1.12)')}<div class="full" style="background:linear-gradient(180deg, ${mix(C.p, 30)} 0%, rgba(5,10,36,.55) 100%)"></div>`;
      const o = 1 - E.inCubic(prog(t, s.t1 - .2, .2));
      return {
        back: blur, cover: s.blur_bg !== false, hideCaptions: true,
        front: `<div class="abs"${cidOf(s)} style="left:${x - w / 2}px;top:${y}px;width:${w}px;transform:translateY(-50%) scale(${f3(lerp(.8, 1, clamp(k, 0, 1.15)))});opacity:${f3(clamp(lt / .2) * o)};
          background:${C.paper};border-radius:28px;box-shadow:0 30px 70px rgba(0,0,0,.4);padding:34px 34px 30px;font-family:${C.font};color:${C.ink};text-align:center">
          <div>${chip('🎓 ' + esc(s.tag || 'KHOÁ HỌC ONLINE'), mix(C.p, 12), C.p, 18)}</div>
          <div style="margin-top:14px;font-family:${C.disp};font-weight:800;font-size:${fitSize(s.course || 'Làm chủ AI trong 30 ngày', 42, w - 70, 2)}px;line-height:1.3">${esc(s.course || 'Làm chủ AI trong 30 ngày')}</div>
          <div style="margin-top:18px;display:flex;align-items:center;justify-content:center;gap:18px;opacity:${f3(kp)}">
            <span style="position:relative;font-weight:600;font-size:28px;color:${C.muted};line-height:1.4">${esc(oldP)}
              <i class="abs" style="left:-4px;top:52%;height:3px;width:calc(${f3(E.outCubic(prog(lt, .6, .3)))} * (100% + 8px));background:${C.bad};transform:rotate(-8deg)"></i></span>
            ${pct > 0 ? chip(`-${pct}%`, C.bad, '#fff', 20) : ''}</div>
          <div style="font-family:${C.disp};font-weight:900;font-size:${s.price_size || 66}px;line-height:1.25;color:${C.p};opacity:${f3(kp)};transform:scale(${f3(lerp(.7, 1, kp))})">${esc(newP)}</div>
          ${s.countdown === false ? '' : `<div style="margin-top:10px;display:inline-flex;align-items:center;gap:10px;padding:6px 18px;border-radius:999px;background:${mix(C.a, 30)};font-weight:700;font-size:23px;line-height:1.5;opacity:${f3(ks)}">
            ⏰ Còn <b style="font-family:${C.disp};font-variant-numeric:tabular-nums;color:${C.ink}">${hh}:${mm}:${ss}</b></div>`}
          <div style="position:relative;margin-top:22px;height:84px;border-radius:20px;background:${C.a};color:${C.ink};display:flex;align-items:center;justify-content:center;overflow:hidden;
            font-family:${C.disp};font-weight:900;font-size:32px;letter-spacing:.04em;box-shadow:0 12px 26px ${mix(C.a, 55)}, inset 0 -5px 0 rgba(0,0,0,.12);
            transform:scale(${f3(clamp(kb, 0, 1.2) * pulse)})">${esc(s.button || 'ĐĂNG KÝ NGAY')} →
            <i class="abs" style="top:-20px;bottom:-20px;width:70px;left:${shine.toFixed(1)}%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent);transform:skewX(-20deg)"></i></div>
          ${contact ? `<div style="margin-top:16px;font-weight:600;font-size:22px;color:${C.muted};line-height:1.45;opacity:${f3(ks)}">${contact}</div>` : ''}
        </div>`,
      };
    },

    // Full-frame whiteboard slide: chapter chip + title + bullets (each at its own t) + speaker PIP circle.
    course_board(s, t, lt) {
      const [W, H] = DIMS(), C = pal(), V = VERT();
      const bullets = (s.bullets || []).map((b, i) => (typeof b === 'string' ? { text: b, t: s.t0 + .7 + i * .7 } : b));
      const k = E.outCubic(prog(lt, 0, .4)), o = 1 - E.inCubic(prog(t, s.t1 - .3, .3));
      const pip = { d: V ? 220 : 250, cx: V ? 580 : W - 180, cy: V ? 270 : H - 170, ...(s.pip || {}) };
      const fy = TL.face?.y ?? H * .4, fx = TL.face?.x ?? W / 2, z = pip.z ?? .6;
      const pk = E.outBack(prog(lt, .25, .4), 1.8);
      const tx = V ? 56 : 80, tw = V ? 380 : 840, ty = V ? 170 : 70;
      let cur = -1;
      bullets.forEach((b, i) => { if (t >= b.t) cur = i; });
      const rows = bullets.map((b, i) => {
        if (i > cur) return '';
        const kk = E.outCubic(prog(t, b.t, .35));
        return `<div${cidOf(b)} style="display:flex;gap:18px;align-items:flex-start;opacity:${f3(kk)};transform:translateX(${((1 - kk) * -40).toFixed(1)}px)">
          <span style="flex:none;margin-top:4px;width:40px;height:40px;border-radius:12px;background:${i === cur ? C.p : mix(C.p, 14)};color:${i === cur ? '#fff' : C.p};display:flex;align-items:center;justify-content:center;
            font-family:${C.disp};font-weight:800;font-size:20px">${i + 1}</span>
          <span style="font-weight:${i === cur ? 700 : 600};font-size:${s.size || 31}px;line-height:1.42;color:${C.ink}">${rich(b.text, prog(t, b.t + .2, .45))}</span></div>`;
      }).join('');
      const img = TL.aroll ? `<img src="${url(fmtSeq(TL.aroll.frames, frameAt(t)))}" style="position:absolute;width:${W * z}px;height:${H * z}px;left:${(pip.d / 2 - fx * z).toFixed(1)}px;top:${(pip.d / 2 - fy * z + pip.d * .06).toFixed(1)}px;filter:${arollFilter(t)}">` : '';
      return {
        cover: true, hideCaptions: s.hideCaptions ?? false,
        back: `<div class="full" style="background:#FBFCFF;background-image:linear-gradient(${mix(C.p, 7)} 1.5px, transparent 1.5px),linear-gradient(90deg, ${mix(C.p, 7)} 1.5px, transparent 1.5px);background-size:40px 40px"></div>
          <div class="abs" style="left:0;top:0;bottom:0;width:14px;background:linear-gradient(${C.p},${C.a})"></div>`,
        front: `<div class="full"${cidOf(s)} style="opacity:${f3(o)};font-family:${C.font};color:${C.ink}">
          <div class="abs" style="left:${tx}px;top:${ty}px;width:${tw}px;opacity:${f3(k)};transform:translateY(${((1 - k) * 20).toFixed(1)}px)">
            ${chip(esc(s.num || 'BÀI 1'), C.a, C.ink, 20)}
            <div style="margin-top:14px;font-family:${C.disp};font-weight:800;font-size:${fitSize(s.title || 'Tổng quan bài học', s.title_size || 46, tw, V ? 3 : 2)}px;line-height:1.3">${esc(s.title || 'Tổng quan bài học')}</div>
            <div style="margin-top:14px;width:${(k * 120).toFixed(1)}px;height:7px;border-radius:4px;background:${C.p}"></div></div>
          <div class="abs" style="left:${tx}px;top:${V ? 470 : 280}px;width:${V ? W - tx - 50 : W - tx - 360}px;display:flex;flex-direction:column;gap:22px">${rows}</div>
          <div class="abs"${cidOf(s.pip)} style="left:${pip.cx - pip.d / 2}px;top:${pip.cy - pip.d / 2}px;width:${pip.d}px;height:${pip.d}px;border-radius:50%;overflow:hidden;background:#000;
            border:7px solid #fff;box-shadow:0 0 0 4px ${C.p}, ${SHADOW};transform:scale(${f3(clamp(pk, 0, 1.3))})">${img}</div>
        </div>`,
      };
    },
  };
  Object.assign(MODULES, MOD);

  // ---------- captions: dark translucent pill, current word in a brand chip, hl words in accent ----------
  CAPTION_STYLES[P] = (c, t) => {
    const [W] = DIMS(), C = pal(), V = VERT();
    const st = [`top:${c.y ?? (V ? 868 : 626)}px`, `font-family:${c.font || C.font}`, `font-weight:${c.weight || 700}`, `font-size:${c.size || (V ? 34 : 32)}px`,
      `color:${c.color || '#fff'}`, 'line-height:1.32', 'text-shadow:none', 'white-space:normal', 'letter-spacing:-.005em'];
    st.push(c.x != null ? `left:${c.x - W / 2 + 46}px;right:${W / 2 - c.x + 46}px` : 'left:46px;right:46px');
    const reveal = TL.caption_reveal !== false;
    let cur = -1;
    c.words.forEach((w, i) => { if (t >= w.s - .02) cur = i; });
    const k = E.outCubic(prog(t, c.t0, .16));
    const words = c.words.map((w, i) => {
      const on = i === cur && t < (w.e ?? w.s + .4) + .25, said = !reveal || i <= cur;
      const col = w.hl ? C.a : 'inherit';
      const box = on ? `background:${w.hl ? C.a : C.p};color:${w.hl ? C.ink : '#fff'};box-shadow:0 0 0 .13em ${w.hl ? C.a : C.p};border-radius:.18em` : `color:${col}`;
      return `<span style="${box};opacity:${said ? 1 : .62};${w.hl ? 'font-weight:800;' : ''}">${esc(w.w)}</span>${w.br ? '<br>' : ' '}`;
    }).join('');
    return `<div id="cap" class="course"${cidOf(c)} style="${st.join(';')};opacity:${f3(k)};transform:translateY(${((1 - k) * 10).toFixed(1)}px)">
      <span style="background:${c.bg || 'rgba(9,14,34,.84)'};-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:.2em .55em;border-radius:16px;line-height:1.85">${words}</span></div>`;
  };

  // ---------- Studio metadata + automatic first cut ----------
  PACKS.push({
    id: P, name: 'Khoá học / bài giảng', icon: '🎓', caption: P,
    desc: 'Thẻ trắng bo tròn, xanh thương hiệu: thẻ chương, thanh tiến độ, ghi nhớ, các bước, quiz, thuật ngữ, code, khoanh vẽ, giảng viên, CTA đăng ký',
    items: [
      { type: 'course_chapter', label: 'Thẻ chương / bài', make: T => ({ type: 'course_chapter', t0: T, t1: T + 2.5, num: 'BÀI 1', title: 'Làm quen với *AI* tạo sinh', subtitle: 'Khoá học AI cho người mới bắt đầu' }) },
      { type: 'course_progress', label: 'Thanh tiến độ bài', make: T => ({ type: 'course_progress', t0: T, t1: T + 10, idx: 1, total: 12, title: 'Làm quen với AI tạo sinh' }) },
      { type: 'course_keypoint', label: 'Ghi nhớ / Lưu ý', make: T => ({ type: 'course_keypoint', t0: T, t1: T + 3, kind: 'remember', text: 'Luôn *kiểm chứng* thông tin AI đưa ra' }) },
      { type: 'course_steps', label: 'Các bước', make: T => ({ type: 'course_steps', t0: T, t1: T + 4.5, title: '3 bước bắt đầu', steps: [{ text: 'Mở ChatGPT và đăng nhập', t: T + .5 }, { text: 'Viết câu lệnh *rõ ràng*', t: T + 1.5 }, { text: 'Kiểm tra và chỉnh kết quả', t: T + 2.5 }] }) },
      { type: 'course_quiz', label: 'Câu hỏi trắc nghiệm', make: T => ({ type: 'course_quiz', t0: T, t1: T + 5, reveal_t: T + 3.8, question: 'AI tạo sinh làm được việc gì?', options: ['Viết nội dung', 'Nấu cơm', 'Lái máy bay', 'Sửa xe'], correct: 0 }) },
      { type: 'course_term', label: 'Thẻ thuật ngữ', make: T => ({ type: 'course_term', t0: T, t1: T + 4, term: 'Prompt', en: '/prɒmpt/ · câu lệnh', definition: 'Câu lệnh bạn gửi cho AI để *mô tả rõ* việc cần làm.', example: '"Viết 3 tiêu đề cho bài về du lịch Đà Lạt"' }) },
      { type: 'course_code', label: 'Khung code / công thức', make: T => ({ type: 'course_code', t0: T, t1: T + 4.5, title: 'hello.py', lang: 'PYTHON', code: 'ten = "Lan"\ntuoi = 20\nprint("Xin chào", ten)', hl_line: 3 }) },
      { type: 'course_annotate', label: 'Khoanh / gạch / mũi tên', make: T => ({ type: 'course_annotate', t0: T, t1: T + 2, shape: 'circle', x: 360, y: 640, w: 320, h: 200, label: 'Chỗ này!' }) },
      { type: 'course_instructor', label: 'Giảng viên (lower-third)', make: T => ({ type: 'course_instructor', t0: T, t1: T + 3.5, name: 'Nguyễn Văn A', role: 'Giảng viên AI · 8 năm kinh nghiệm', avatar: '👨‍🏫' }) },
      { type: 'course_cta', label: 'CTA đăng ký khoá học', make: T => ({ type: 'course_cta', t0: T, t1: T + 3.5, course: 'Làm chủ AI trong 30 ngày', old_price: '2.990.000đ', price: '1.490.000đ', countdown: 86352 }) },
      { type: 'course_board', label: 'Bảng trắng + camera tròn', make: T => ({ type: 'course_board', t0: T, t1: T + 5, num: 'BÀI 1', title: 'Tổng quan bài học', bullets: ['AI tạo sinh là gì?', 'Viết *prompt* hiệu quả', 'Ứng dụng vào công việc'] }) },
    ],
    recipe: ctx => {
      const dur = ctx.dur, caps = ctx.captions || [], words = caps.flatMap(c => c.words);
      const say = (from, n, skip = 0) => words.filter(w => w.s >= from).slice(skip, skip + n).map(w => w.w).join(' ').replace(/^[,.:;!?\s]+/, '');
      const title = ctx.title || (say(0, 6) || 'Bài học hôm nay').replace(/^\p{Ll}/u, m => m.toUpperCase());
      const ctaT = Math.max(3, dur - 3.5), scenes = [];
      const busy = [];
      const free = (a, b) => busy.every(([x, y]) => b <= x || a >= y);
      scenes.push({ type: 'course_chapter', t0: 0, t1: Math.min(2.5, dur), num: 'BÀI 1', title, subtitle: ctx.brand?.name ? `Khoá học của ${ctx.brand.name}` : 'Khoá học online', cover: false });
      scenes.push({ type: 'course_progress', t0: 0, t1: ctaT, idx: 1, total: 10, title });
      scenes.push({ type: 'course_instructor', t0: 1, t1: Math.min(4.5, ctaT), name: ctx.brand?.name || 'Giảng viên', role: ctx.brand?.handle || 'Chuyên gia đào tạo' });
      busy.push([1, 4.6]);
      const KP = [['quan trọng', 'remember'], ['ghi nhớ', 'remember'], ['nhớ', 'remember'], ['lưu ý', 'note'], ['chú ý', 'warn'], ['mẹo', 'tip']];
      let best = null;
      for (const [w, kind] of KP) { const at = findWord(caps, [w], 2.5); if (at != null && (!best || at < best.at)) best = { at, kind, n: w.split(' ').length }; }
      if (best && best.at < ctaT - 1) {
        const t0 = Math.max(4.6, best.at - .15), t1 = Math.min(t0 + 3.2, ctaT);
        if (t1 - t0 > 1.2) { scenes.push({ type: 'course_keypoint', t0, t1, key_t: t0, kind: best.kind, text: say(best.at, 8, best.n) || say(best.at, 8) }); busy.push([t0, t1]); }
      }
      const stepTimes = [];
      let after = 2.5;
      while (stepTimes.length < 4) { const at = findWord(caps, ['bước'], after); if (at == null || at > ctaT - 1) break; stepTimes.push(at); after = at + .3; }
      if (stepTimes.length) {
        const t0 = Math.max(2.6, stepTimes[0] - .4), t1 = Math.min(ctaT, stepTimes[stepTimes.length - 1] + 3);
        if (free(t0, t1) && t1 - t0 > 2) scenes.push({ type: 'course_steps', t0, t1, title: `${stepTimes.length} bước`, steps: stepTimes.map(at => ({ text: say(at, 6, 2) || say(at, 6), t: at })) });
      }
      scenes.push({ type: 'course_cta', t0: ctaT, t1: dur, course: ctx.title || 'Khoá học online', old_price: '1.990.000đ', price: '990.000đ', countdown: 86352 });
      return { caption_style: P, music: 'corporate', scenes };
    },
  });
})();
