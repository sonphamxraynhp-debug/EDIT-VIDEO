// Pack "topn" — listicle / Top N countdown (Top 5 món ăn, Top 3 app, Top 10 điểm đến…).
// Opening "TOP 5" card, giant rank-number slam that shrinks into a corner badge, item cards (image/emoji +
// name + reason + price/score), rank ladder, #1 podium reveal with confetti, recap list, persistent badge.
// Rank colours: #1 gold, #2 silver, #3 bronze, #4 cyan, #5 violet (scene.color / TL.brand.ranks override).
// Design space 720×1280 (vertical) or 1280×720 via DIMS(). Doc: references/pack-topn.md.
(() => {
  const P = 'topn';
  if (typeof document !== 'undefined' && !document.querySelector('link[data-pack-font="topn"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.dataset.packFont = 'topn';
    l.href = 'https://fonts.googleapis.com/css2?family=Anton&display=block';
    document.head.appendChild(l);
  }
  const NUM = "'Anton','Oswald','Be Vietnam Pro',sans-serif";       // rank numerals
  const SANS = "'Be Vietnam Pro',system-ui,sans-serif";              // every Vietnamese text

  const RANK = { 1: '#FFC83D', 2: '#D9E1EC', 3: '#E8894B', 4: '#4FD3EA', 5: '#B793FF' };
  const pal = () => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return { gold: b.accent || '#FFC83D', ink: b.dark || '#0D0F16', light: b.light || '#FFFFFF', primary: b.primary || '#FF5A36',
      font: b.font && b.font !== 'var(--sans)' ? b.font : SANS, ranks: b.ranks || {} };
  };
  const rc = (rank, s = {}) => s.color || pal().ranks[rank] || RANK[rank] || pal().primary;
  const hex = c => { const m = /^#?([\da-f]{6})$/i.exec(c || ''); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const rgba = (c, a) => { const A = hex(c); return A ? `rgba(${A[0]},${A[1]},${A[2]},${a})` : c; };
  const dark = c => { const A = hex(c); return A ? (A[0] * .3 + A[1] * .59 + A[2] * .11) > 150 : false; };   // light bg → dark text
  const geo = () => { const [W, H] = DIMS(); return { W, H, v: VERT() }; };
  const life = (s, t, din = .25, dout = .25) => fadeIO(t, s.t0, s.keep ? null : s.t1, din, dout);
  const fit = (text, size, maxW, em = .56) => Math.min(size, Math.floor(maxW / (Math.max(1, [...String(text || '')].length) * em)));
  const stroke = (w, c = 'rgba(0,0,0,.85)') => strokeShadow(w, c);
  // Image (path / media item) or emoji / icon thumbnail filling a w×h box.
  const thumb = (s, w, h, r, t) => {
    const src = s.image || s.img ? media(s.image || s.img, t) : '';
    if (src) return `<div style="position:relative;width:${w}px;height:${h}px;border-radius:${r}px;overflow:hidden;background:#222"><img src="${src}" style="width:100%;height:100%;object-fit:cover"></div>`;
    const e = s.emoji || s.icon || '⭐';
    const inner = /^(si:|\w[\w/.-]*\.(png|jpe?g|svg|webp))/.test(e) ? slIcon(e, Math.round(w * .62), 'white') : emoji(e, w * .14, h * .14, Math.round(Math.min(w, h) * .72), 'position:absolute');
    return `<div style="position:relative;width:${w}px;height:${h}px;border-radius:${r}px;overflow:hidden;background:radial-gradient(circle at 50% 40%,${rgba(rc(s.rank, s), .55)},rgba(20,22,32,.95) 75%);display:flex;align-items:center;justify-content:center">${inner}</div>`;
  };
  const rays = (cx, cy, color, a, rot, n = 18) => `<div class="abs" style="left:${cx - 1100}px;top:${cy - 1100}px;width:2200px;height:2200px;border-radius:50%;opacity:${a.toFixed(3)};
    background:repeating-conic-gradient(from ${rot.toFixed(1)}deg,${rgba(color, .34)} 0deg ${(180 / n).toFixed(2)}deg,rgba(0,0,0,0) ${(180 / n).toFixed(2)}deg ${(360 / n).toFixed(2)}deg);
    -webkit-mask-image:radial-gradient(circle,#000 0,#000 18%,transparent 62%);mask-image:radial-gradient(circle,#000 0,#000 18%,transparent 62%)"></div>`;
  const stars = (score, max, size, color) => {
    const n = clamp(score / max) * 5;
    return `<span style="position:relative;display:inline-block;font-size:${size}px;letter-spacing:2px;line-height:1;color:rgba(255,255,255,.22)">★★★★★<span style="position:absolute;left:0;top:0;overflow:hidden;white-space:nowrap;width:${(n / 5 * 100).toFixed(1)}%;color:${color}">★★★★★</span></span>`;
  };
  // Confetti burst from (cx, cy) at local time `at`: deterministic particles (rnd) so any frame renders alone.
  const confetti = (lt, at, cx, cy, n, cols, W, H) => {
    const k = lt - at; if (k < 0) return '';
    let h = '';
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (rnd(i * 7 + 1) - .5) * 2.4, sp = 520 + rnd(i * 7 + 2) * 760;
      const x = cx + Math.cos(a) * sp * k * .9 + Math.sin(k * 3 + i) * 18, y = cy + Math.sin(a) * sp * k + 620 * k * k;
      if (y > H + 40 || x < -40 || x > W + 40) continue;
      const w = 9 + rnd(i * 7 + 3) * 9, hh = w * (.4 + rnd(i * 7 + 4) * .5), rot = (rnd(i * 7 + 5) * 360 + k * 520 * (i % 2 ? 1 : -1)) % 360;
      const o = clamp(1.6 - k * .45);
      h += `<div class="abs" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${w.toFixed(1)}px;height:${hh.toFixed(1)}px;background:${cols[i % cols.length]};opacity:${o.toFixed(2)};border-radius:${i % 3 ? 2 : 50}px;transform:rotate(${rot.toFixed(0)}deg) scaleX(${Math.cos(k * 9 + i).toFixed(2)})"></div>`;
    }
    return h;
  };

  const M = {
    // Opening title card: "TOP" + huge number + title ribbon (+ sub). Dark wash with rotating rays over the video.
    top_title(s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .2, .3), n = s.count ?? s.n ?? 5, col = s.color || p.gold;
      const cx = s.x ?? g.W / 2, cy = s.y ?? (g.v ? 560 : 300), sz = s.size || (g.v ? 470 : 330);
      const kN = E.outBack(prog(lt, .12, .5), 1.7), kT = E.outCubic(prog(lt, .0, .35)), kR = E.outCubic(prog(lt, .45, .45)), kS = E.outCubic(prog(lt, .75, .4));
      const shake = lt > .3 && lt < .6 ? ((rnd(Math.floor(lt * 60)) - .5) * 14 * (1 - prog(lt, .3, .3))).toFixed(1) : 0;
      const title = String(s.title || 'Điều bạn cần biết'), tsz = fit(title, s.title_size || (g.v ? 56 : 52), g.v ? 600 : 900, .62);
      const out = s.keep ? 0 : prog(t, s.t1 - .3, .3);
      const flash = lt > .3 && lt < .62 ? `<div class="full" style="background:#fff;opacity:${(.55 * (1 - prog(lt, .3, .32))).toFixed(3)}"></div>` : '';
      return { front: `<div class="full"${cidOf(s)} style="opacity:${o.toFixed(3)};overflow:hidden;transform:translateX(${shake}px) scale(${(1 + out * .08).toFixed(3)})">
        <div class="full" style="background:radial-gradient(ellipse 80% 60% at 50% ${(cy / g.H * 100).toFixed(0)}%,rgba(26,22,40,.86),rgba(6,6,12,.95))"></div>
        ${rays(cx, cy, col, kN * .9, lt * 14)}
        <div class="abs" style="left:0;right:0;top:${cy - sz * .62 - (g.v ? 96 : 70)}px;text-align:center;font:900 ${g.v ? 62 : 48}px ${p.font};letter-spacing:${lerp(.9, .32, kT).toFixed(2)}em;padding-left:.32em;color:#fff;opacity:${kT.toFixed(3)};text-shadow:0 4px 20px rgba(0,0,0,.6)">${esc(s.kicker || 'TOP')}</div>
        <div class="abs" style="left:${cx}px;top:${cy}px;transform:translate(-50%,-50%) scale(${lerp(2.4, 1, clamp(kN, 0, 1.2)).toFixed(3)});opacity:${clamp(kN * 2).toFixed(3)};font-family:${NUM};font-size:${sz}px;line-height:1;white-space:nowrap;
          background:linear-gradient(180deg,#FFF6D5 0%,${col} 48%,${rgba(col, 1)} 60%,#B5770E 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 10px 0 rgba(0,0,0,.55)) drop-shadow(0 0 40px ${rgba(col, .55)})">${esc(n)}</div>
        <div class="abs" style="left:${cx}px;top:${cy + sz * .5 + (g.v ? 34 : 20)}px;transform:translate(-50%,0) skewX(-8deg);clip-path:inset(0 ${((1 - kR) * 100).toFixed(1)}% 0 0);background:${col};padding:10px 30px 12px;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.45)">
          <div style="transform:skewX(8deg);font:900 ${tsz}px/1.15 ${p.font};color:${dark(col) ? p.ink : '#fff'};text-transform:uppercase;white-space:nowrap">${esc(title)}</div></div>
        ${s.sub ? `<div class="abs" style="left:0;right:0;top:${cy + sz * .5 + (g.v ? 34 : 20) + tsz * 1.15 + 40}px;text-align:center;font:600 ${g.v ? 28 : 26}px ${p.font};color:#E6E8EE;opacity:${kS.toFixed(3)};transform:translateY(${((1 - kS) * 12).toFixed(1)}px);text-shadow:0 2px 10px rgba(0,0,0,.7)">${esc(s.sub)}</div>` : ''}
        ${flash}</div>`, hideCaptions: s.hideCaptions ?? true };
    },

    // Rank slam: giant "#3" hits the centre (shake + flash + ring), name pill under it, then shrinks into a corner badge.
    top_number(s, t, lt) {
      const g = geo(), p = pal(), rank = s.rank ?? 3, col = rc(rank, s), hold = s.hold ?? 1.15;
      const o = life(s, t, .08, .25), cx = s.x ?? g.W / 2, cy = s.y ?? (g.v ? 500 : 320), sz = s.size || (g.v ? 380 : 300);
      const corner = s.corner || 'tl', bx = s.bx ?? (corner === 'tr' ? g.W - (g.v ? 92 : 96) : (g.v ? 92 : 96)), by = s.by ?? (g.v ? 196 : 92);
      const kIn = E.outBack(prog(lt, 0, .32), 1.8), k2 = E.inOutSine(prog(lt, hold, .45)), kBadge = E.outBack(prog(lt, hold + .3, .35), 1.6);
      const bsz = 112 / sz;                     // final scale of the numeral inside the badge
      const x = lerp(cx, bx, k2), y = lerp(cy, by, k2), sc = lerp(lerp(2.6, 1, clamp(kIn, 0, 1.15)), bsz, k2);
      const shake = lt > .1 && lt < .45 ? ((rnd(Math.floor(lt * 60)) - .5) * 18 * (1 - prog(lt, .1, .35))).toFixed(1) : 0;
      const kRing = prog(lt, .12, .5), kName = E.outCubic(prog(lt, .3, .3)) * (1 - prog(lt, hold - .1, .2));
      const label = `#${rank}`, txtCol = dark(col) ? p.ink : '#fff';
      const name = s.name ? `<div class="abs" style="left:${cx}px;top:${cy + sz * .52 + 10}px;transform:translate(-50%,${((1 - kName) * 20).toFixed(1)}px);opacity:${kName.toFixed(3)};max-width:${g.W - 80}px;
          background:#fff;color:${p.ink};font:900 ${fit(s.name, g.v ? 46 : 42, g.W - 140, .6)}px/1.15 ${p.font};padding:10px 28px 12px;border-radius:999px;white-space:nowrap;box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 0 4px ${col}">${esc(s.name)}</div>` : '';
      const badgeName = s.name && s.badge_name !== false ? `<div class="abs" style="left:${corner === 'tr' ? 'auto' : `${bx + 66}px`};${corner === 'tr' ? `right:${g.W - bx + 66}px;` : ''}top:${by}px;transform:translateY(-50%) translateX(${((1 - clamp(kBadge)) * (corner === 'tr' ? 16 : -16)).toFixed(1)}px);opacity:${clamp(kBadge).toFixed(3)};
          background:rgba(12,14,22,.82);border:1.5px solid ${rgba(col, .7)};color:#fff;font:800 ${g.v ? 24 : 22}px/1.2 ${p.font};padding:9px 18px;border-radius:12px;white-space:nowrap;max-width:${g.v ? 420 : 520}px;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</div>` : '';
      const box = `<div class="abs" style="left:${bx - 58}px;top:${by - 58}px;width:116px;height:116px;border-radius:26px;background:linear-gradient(160deg,${col},${rgba(col, .78)});box-shadow:0 10px 26px rgba(0,0,0,.45),inset 0 2px 0 rgba(255,255,255,.45);
          transform:scale(${clamp(kBadge, 0, 1.2).toFixed(3)});opacity:${clamp(kBadge * 2).toFixed(3)}"></div>`;
      const numCol = k2 > .85 ? txtCol : col;
      const num = `<div class="abs" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;transform:translate(calc(-50% + ${shake}px),-52%) scale(${sc.toFixed(3)});opacity:${clamp(kIn * 3).toFixed(3)};font-family:${NUM};font-size:${sz}px;line-height:1;white-space:nowrap;color:${numCol};
          text-shadow:${k2 > .85 ? 'none' : `0 ${Math.round(sz * .03)}px 0 rgba(0,0,0,.6),0 0 ${Math.round(sz * .15)}px ${rgba(col, .6)}`}">${label}</div>`;
      const dim = (1 - k2) * clamp(prog(lt, 0, .15));
      const ring = kRing > 0 && kRing < 1 ? `<div class="abs" style="left:${cx - 260}px;top:${cy - 260}px;width:520px;height:520px;border-radius:50%;border:${(14 * (1 - kRing)).toFixed(1)}px solid ${col};transform:scale(${lerp(.3, 1.5, E.outCubic(kRing)).toFixed(3)});opacity:${(1 - kRing).toFixed(3)}"></div>` : '';
      const flash = lt > .1 && lt < .35 ? `<div class="full" style="background:${rgba(col, .5)};mix-blend-mode:screen;opacity:${(1 - prog(lt, .1, .25)).toFixed(3)}"></div>` : '';
      return { front: `<div class="full"${cidOf(s)} style="opacity:${o.toFixed(3)};pointer-events:none">
        <div class="full" style="background:radial-gradient(ellipse 70% 50% at 50% ${(cy / g.H * 100).toFixed(0)}%,rgba(0,0,0,.25),rgba(0,0,0,.72));opacity:${dim.toFixed(3)}"></div>
        ${dim > .01 ? rays(cx, cy, col, dim * .8, lt * 20, 14) : ''}${ring}${box}${num}${name}${badgeName}${flash}</div>`, hideCaptions: s.hideCaptions ?? lt < hold + .3 };
    },

    // Item card (bottom-anchored): image/emoji + rank chip, name, 1-line reason, optional price chip + score.
    top_item(s, t, lt) {
      const g = geo(), p = pal(), rank = s.rank ?? 3, col = rc(rank, s), o = life(s, t, .2, .25);
      const w = s.w || (g.v ? 650 : 640), ih = s.img_size || (s.compact ? 130 : g.v ? 200 : 180);
      const x = s.x ?? (g.v ? g.W / 2 : g.W - w / 2 - 40), yb = s.y ?? (g.v ? 985 : 676);
      const kC = E.outBack(prog(lt, 0, .45), 1.3), kI = E.outBack(prog(lt, .15, .45), 1.8);
      const kx = i => E.outCubic(prog(lt, .25 + i * .12, .35));
      const tw = w - ih - 68, nsz = fit(s.name, s.size || (g.v ? 44 : 40), tw * 1.9, .58);
      const row = (i, html, mt = 0) => `<div style="opacity:${kx(i).toFixed(3)};transform:translateX(${((1 - kx(i)) * 24).toFixed(1)}px);margin-top:${mt}px">${html}</div>`;
      const score = s.score != null ? `<span style="display:inline-flex;align-items:center;gap:10px">${stars(+s.score, s.max || (s.score > 5 ? 10 : 5), g.v ? 26 : 24, col)}<span style="font:800 ${g.v ? 24 : 22}px ${p.font};color:#fff">${esc(s.score)}${s.score_suffix ?? (s.score > 5 ? '/10' : '')}</span></span>` : '';
      const price = s.price ? `<span style="background:${col};color:${dark(col) ? p.ink : '#fff'};font:900 ${g.v ? 24 : 22}px ${p.font};padding:6px 16px;border-radius:10px;white-space:nowrap">${esc(s.price)}</span>` : '';
      const foot = price || score ? row(3, `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">${price}${score}</div>`, 14) : '';
      const chip = `<div class="abs" style="left:-14px;top:-18px;min-width:70px;height:70px;padding:0 12px;border-radius:20px;background:${col};color:${dark(col) ? p.ink : '#fff'};font:400 46px/70px ${NUM};text-align:center;box-shadow:0 8px 18px rgba(0,0,0,.5);transform:rotate(-6deg) scale(${clamp(kI, 0, 1.3).toFixed(3)})">#${esc(rank)}</div>`;
      const card = `<div style="position:relative;width:${w}px;display:flex;gap:26px;align-items:center;padding:22px 26px 22px 22px;border-radius:28px;background:linear-gradient(160deg,rgba(26,28,40,.94),rgba(10,11,18,.94));
          box-shadow:0 24px 50px rgba(0,0,0,.5),inset 0 0 0 1.5px ${rgba(col, .45)};border-left:7px solid ${col}">
        <div style="position:relative;flex:none;transform:scale(${lerp(.6, 1, clamp(kI, 0, 1.1)).toFixed(3)});opacity:${clamp(kI * 2).toFixed(3)}">${thumb(s, ih, ih, 20, t)}${chip}</div>
        <div style="flex:1;min-width:0">
          ${s.kicker !== '' ? row(0, `<div style="font:800 ${g.v ? 19 : 18}px ${p.font};letter-spacing:.22em;color:${col};text-transform:uppercase">${esc(s.kicker || `Hạng ${rank}`)}</div>`) : ''}
          ${row(1, `<div style="font:900 ${nsz}px/1.12 ${p.font};color:#fff;margin-top:4px">${esc(s.name || 'Tên mục')}</div>`)}
          ${s.reason ? row(2, `<div style="font:500 ${g.v ? 23 : 22}px/1.38 ${p.font};color:#C9CDD8;margin-top:8px">${esc(s.reason)}</div>`) : ''}
          ${foot}</div></div>`;
      return { front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${yb}px;transform:translate(-50%,-100%) translateY(${((1 - clamp(kC)) * 60).toFixed(1)}px) scale(${lerp(.9, 1, clamp(kC, 0, 1.05)).toFixed(3)});transform-origin:50% 100%;opacity:${(o * clamp(kC * 2)).toFixed(3)}">${card}</div>`,
        hideCaptions: s.hideCaptions ?? !s.compact };
    },

    // Rank ladder on the side: #1 at the top … #N at the bottom; current rank glows (+ its name), passed ranks get ✓.
    // Current = s.current, else the last marks[{rank,t}] already reached.
    top_progress(s, t, lt) {
      const g = geo(), p = pal(), n = s.count ?? 5, o = life(s, t, .3, .3);
      const marks = (s.marks || []).filter(m => t >= m.t).sort((a, b) => a.t - b.t);
      const cur = s.current ?? (marks.length ? marks[marks.length - 1] : null)?.rank ?? null;
      const curT = marks.length ? marks[marks.length - 1].t : s.t0;
      const done = new Set(marks.slice(0, -1).map(m => m.rank));
      const side = s.side || (g.v ? 'right' : 'left'), L = side === 'left';
      const gap = s.gap || (g.v ? 74 : 80), x = s.x ?? (L ? (g.v ? 58 : 66) : (g.v ? g.W - 58 : g.W - 66)), yc = s.y ?? (g.v ? 470 : 380), y0 = yc - gap * (n - 1) / 2;
      const kIn = i => E.outBack(prog(lt, .05 + i * .07, .35), 1.6);
      const kc = E.outBack(prog(t, curT, .4), 2);
      let html = `<div class="abs" style="left:${x - 2}px;top:${y0}px;width:4px;height:${gap * (n - 1)}px;background:rgba(255,255,255,.25);border-radius:2px"></div>`;
      if (cur != null) html += `<div class="abs" style="left:${x - 2}px;top:${y0 + gap * (cur - 1)}px;width:4px;height:${gap * (n - cur)}px;background:${rc(cur, {})};border-radius:2px;box-shadow:0 0 12px ${rgba(rc(cur, {}), .8)}"></div>`;
      for (let r = 1; r <= n; r++) {
        const y = y0 + gap * (r - 1), col = rc(r, {}), on = r === cur, ok = done.has(r), k = clamp(kIn(n - r), 0, 1.2);
        const d = on ? lerp(52, 70, clamp(kc, 0, 1.2)) : 50;
        const bg = on ? col : ok ? 'rgba(20,22,32,.85)' : 'rgba(10,12,20,.6)';
        const bd = on ? '#fff' : ok ? col : 'rgba(255,255,255,.45)';
        const tc = on ? (dark(col) ? p.ink : '#fff') : ok ? col : 'rgba(255,255,255,.8)';
        html += `<div class="abs" style="left:${x - d / 2}px;top:${y - d / 2}px;width:${d}px;height:${d}px;border-radius:50%;background:${bg};border:${on ? 3 : 2}px ${ok || on ? 'solid' : 'dashed'} ${bd};
          display:flex;align-items:center;justify-content:center;font:400 ${on ? 34 : 26}px ${NUM};color:${tc};transform:scale(${k.toFixed(3)});box-shadow:${on ? `0 0 24px ${rgba(col, .8)},0 6px 14px rgba(0,0,0,.4)` : '0 4px 10px rgba(0,0,0,.35)'}">${ok ? '✓' : r}</div>`;
        if (on && s.names?.[r]) {
          const kl = E.outCubic(prog(t, curT + .15, .3));
          html += `<div class="abs" style="${L ? `left:${x + d / 2 + 12}px` : `right:${g.W - x + d / 2 + 12}px`};top:${y}px;transform:translate(${((1 - kl) * (L ? -20 : 20)).toFixed(1)}px,-50%);opacity:${kl.toFixed(3)};background:rgba(12,14,22,.85);border:1.5px solid ${rgba(col, .8)};color:#fff;font:800 ${g.v ? 22 : 21}px ${p.font};padding:7px 14px;border-radius:10px;white-space:nowrap">${esc(s.names[r])}</div>`;
        }
      }
      return { front: `<div class="full"${cidOf(s)} style="opacity:${o.toFixed(3)};pointer-events:none">${html}</div>` };
    },

    // Final #1 reveal: rays, 2-1-3 podium rising, #1 image/emoji pops with a flash, crown, confetti, big name.
    top_podium(s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .2, .3), col = rc(1, s), v = g.v;
      const cx = s.x ?? g.W / 2, base = s.y ?? (v ? 960 : 700), u = v ? 1 : .62;
      const blocks = [{ r: 2, h: 190 * u, dx: -1 }, { r: 1, h: 270 * u, dx: 0 }, { r: 3, h: 140 * u, dx: 1 }];
      const bw = v ? 200 : 170, gapx = v ? 214 : 182;
      const kR = E.outCubic(prog(lt, 0, .5)), kImg = E.outBack(prog(lt, .85, .5), 1.8), kN = E.outCubic(prog(lt, 1.1, .4)), kK = E.outCubic(prog(lt, .95, .35));
      const kb = r => E.outBack(prog(lt, { 3: .1, 2: .25, 1: .45 }[r], .45), 1.3);
      const others = { 2: s.second, 3: s.third };
      let pod = '';
      for (const b of blocks) {
        const k = clamp(kb(b.r), 0, 1.1), c = rc(b.r, b.r === 1 ? s : {}), x = cx + b.dx * gapx - bw / 2;
        pod += `<div class="abs" style="left:${x}px;top:${base - b.h}px;width:${bw}px;height:${b.h}px;transform-origin:50% 100%;transform:scaleY(${k.toFixed(3)});border-radius:14px 14px 0 0;
          background:linear-gradient(180deg,${c},${rgba(c, .55)} 70%,rgba(20,20,30,.9));box-shadow:inset 0 3px 0 rgba(255,255,255,.5),0 -6px 30px ${rgba(c, .35)};text-align:center">
          <div style="font:400 ${Math.round(110 * u)}px/1.15 ${NUM};color:${dark(c) ? p.ink : '#fff'};opacity:.9">${b.r}</div>
          </div>${others[b.r] ? `<div class="abs" style="left:${x - 20}px;width:${bw + 40}px;top:${base - b.h * k - (v ? 40 : 32)}px;text-align:center;font:800 ${v ? 24 : 19}px/1.2 ${p.font};color:#fff;opacity:${clamp(k).toFixed(3)};text-shadow:0 2px 8px rgba(0,0,0,.8);white-space:nowrap">${esc(others[b.r])}</div>` : ''}`;
      }
      const top1 = base - 270 * u, ir = s.img_size || (v ? 250 : 170), iy = top1 - ir / 2 - 22;
      const img = `<div class="abs" style="left:${cx - ir / 2}px;top:${iy - ir / 2}px;width:${ir}px;height:${ir}px;transform:scale(${clamp(kImg, 0, 1.2).toFixed(3)});opacity:${clamp(kImg * 2).toFixed(3)}">
          <div style="border-radius:50%;overflow:hidden;box-shadow:0 0 0 7px ${col},0 0 60px ${rgba(col, .7)},0 18px 40px rgba(0,0,0,.6)">${thumb({ ...s, rank: 1 }, ir, ir, ir / 2, t)}</div>
          ${s.crown === false ? '' : emoji('👑', ir / 2 - 55, -92 + (1 - kK) * -40, 110, `position:absolute;opacity:${kK.toFixed(3)};transform:rotate(${((1 - kK) * -30 - 8).toFixed(1)}deg)`)}</div>`;
      const name = String(s.name || 'Quán quân'), nsz = fit(name, s.size || (v ? 66 : 56), g.W - 80, .6);
      const ky = v ? 168 : 46;
      const head = `<div class="abs" style="left:0;right:0;top:${ky}px;text-align:center;opacity:${kN.toFixed(3)};transform:translateY(${((1 - kN) * 18).toFixed(1)}px)">
          <div style="font:900 ${v ? 26 : 22}px ${p.font};letter-spacing:.34em;padding-left:.34em;color:${col}">${esc(s.kicker || 'TOP 1')}</div>
          <div style="font:900 ${nsz}px/1.12 ${p.font};color:#fff;margin-top:6px;text-shadow:0 6px 24px rgba(0,0,0,.7),0 0 30px ${rgba(col, .45)}">${esc(name)}</div>
          ${s.reason ? `<div style="font:600 ${v ? 26 : 22}px/1.35 ${p.font};color:#DADDE6;margin:10px auto 0;max-width:${v ? 600 : 900}px">${esc(s.reason)}</div>` : ''}</div>`;
      const flash = lt > .85 && lt < 1.15 ? `<div class="full" style="background:#fff;opacity:${(.38 * (1 - prog(lt, .85, .3))).toFixed(3)}"></div>` : '';
      return { front: `<div class="full"${cidOf(s)} style="opacity:${o.toFixed(3)};overflow:hidden">
        <div class="full" style="background:radial-gradient(ellipse 90% 60% at 50% ${(iy / g.H * 100).toFixed(0)}%,rgba(40,30,10,.94),rgba(5,5,10,.98));opacity:${kR.toFixed(3)}"></div>
        ${rays(cx, iy, col, kR * .95, lt * 16, 20)}${pod}${img}${head}
        ${confetti(lt, .9, cx, iy, s.confetti ?? 90, [col, '#FF5A7A', '#4FD3EA', '#fff', '#B793FF', '#7BE07B'], g.W, g.H)}${flash}</div>`, hideCaptions: s.hideCaptions ?? true };
    },

    // Recap list of all N items, #1 at the top, rows sliding in one by one.
    top_recap(s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .25, .3), items = (s.items || []).slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
      const w = s.w || (g.v ? 640 : 760), rh = s.row_h || (g.v ? (items.length > 5 ? 74 : 92) : (items.length > 5 ? 56 : 70));
      const cx = s.x ?? g.W / 2, cy = s.y ?? (g.v ? 560 : 360), kP = E.outCubic(prog(lt, 0, .4)), step = s.stagger ?? .14;
      const rows = items.map((it, i) => {
        const r = it.rank ?? i + 1, col = rc(r, it), k = E.outCubic(prog(lt, .25 + i * step, .4)), th = rh - 16;
        return `<div${cidOf(it)} style="display:flex;align-items:center;gap:18px;height:${rh}px;padding:0 18px;border-radius:16px;margin-top:${i ? 8 : 0}px;opacity:${k.toFixed(3)};transform:translateX(${((1 - k) * 60).toFixed(1)}px);
            background:${r === 1 ? `linear-gradient(90deg,${rgba(col, .35)},rgba(255,255,255,.04))` : 'rgba(255,255,255,.05)'};border:1.5px solid ${rgba(col, r === 1 ? .8 : .28)}">
          <div style="width:${Math.round(rh * .78)}px;flex:none;font:400 ${Math.round(rh * .6)}px/1 ${NUM};color:${col};text-align:center">${r}</div>
          ${it.image || it.img || it.emoji ? `<div style="flex:none">${thumb({ ...it, rank: r }, th, th, 12, t)}</div>` : ''}
          <div style="flex:1;min-width:0;font:800 ${Math.round(rh * .34)}px/1.2 ${p.font};color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.name)}</div>
          ${it.note ? `<div style="flex:none;font:700 ${Math.round(rh * .26)}px ${p.font};color:${col}">${esc(it.note)}</div>` : ''}</div>`;
      }).join('');
      const panel = `<div style="width:${w}px;padding:26px 24px 24px;border-radius:30px;background:linear-gradient(170deg,rgba(24,26,38,.95),rgba(8,9,15,.95));box-shadow:0 30px 70px rgba(0,0,0,.55),inset 0 0 0 1.5px rgba(255,255,255,.08)">
          <div style="display:flex;align-items:baseline;gap:14px;margin:0 6px 18px">
            <div style="font:900 ${g.v ? 22 : 20}px ${p.font};letter-spacing:.26em;color:${p.gold}">${esc(s.kicker || 'TỔNG KẾT')}</div>
            <div style="font:900 ${g.v ? 34 : 30}px/1.15 ${p.font};color:#fff">${esc(s.title || `Top ${items.length}`)}</div></div>${rows}</div>`;
      return { front: `<div class="full" style="background:rgba(4,5,10,${(.55 * kP * o).toFixed(3)})"></div><div class="abs"${cidOf(s)} style="left:${cx}px;top:${cy}px;transform:translate(-50%,-50%) translateY(${((1 - kP) * 40).toFixed(1)}px);opacity:${(o * kP).toFixed(3)}">${panel}</div>`,
        hideCaptions: s.hideCaptions ?? true };
    },

    // Persistent corner badge: "TOP 5" + series title; with marks[{rank,t}] it also flips to the current "#n".
    top_badge(s, t, lt) {
      const g = geo(), p = pal(), o = life(s, t, .3, .3), corner = s.corner || 'tr';
      const marks = (s.marks || []).filter(m => t >= m.t).sort((a, b) => a.t - b.t), m = marks[marks.length - 1];
      const col = m ? rc(m.rank, {}) : s.color || p.gold, k = E.outBack(prog(lt, 0, .4), 1.6), kf = m ? E.outBack(prog(t, m.t, .35), 2) : 1;
      const x = s.x ?? (corner === 'tr' ? g.W - 28 : 28), y = s.y ?? (g.v ? 150 : 34);
      const big = m ? `#${m.rank}` : (s.label || 'TOP 5');
      const inner = `<div style="display:flex;align-items:center;gap:12px;background:rgba(10,12,20,.82);border:1.5px solid ${rgba(col, .75)};border-radius:16px;padding:8px 16px 8px 8px;box-shadow:0 8px 22px rgba(0,0,0,.4)">
          <div style="min-width:64px;height:52px;padding:0 10px;border-radius:11px;background:${col};color:${dark(col) ? p.ink : '#fff'};font:400 34px/52px ${NUM};text-align:center;white-space:nowrap;transform:scale(${clamp(kf, 0, 1.25).toFixed(3)})">${esc(big)}</div>
          <div style="font:800 ${g.v ? 20 : 19}px/1.2 ${p.font};color:#fff;white-space:nowrap;max-width:${g.v ? 300 : 380}px;overflow:hidden;text-overflow:ellipsis">${esc(m && s.names?.[m.rank] ? s.names[m.rank] : s.title || 'Bảng xếp hạng')}</div></div>`;
      return { front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(${corner === 'tr' ? '-100%' : '0'},0) scale(${clamp(k, 0, 1.1).toFixed(3)});transform-origin:${corner === 'tr' ? '100%' : '0'} 0;opacity:${o.toFixed(3)}">${inner}</div>` };
    },
  };
  Object.assign(MODULES, M);

  // ---------- captions: bold uppercase, active word on a rank-gold block ----------
  CAPTION_STYLES.topn = (c, t) => {
    const g = geo(), p = pal(), size = c.size || (g.v ? 44 : 40), wpx = g.v ? 600 : 1040;
    const hi = c.color_hi || p.gold, x = c.x ?? g.W / 2;
    // A compact top_item that keeps captions on pushes them just above the card (card top ≈ bottom − height).
    const card = (TL.scenes || []).find(s => s.type === 'top_item' && !s.hidden && t >= s.t0 && t < s.t1 && (s.hideCaptions === false || (s.compact && s.hideCaptions == null)));
    const lift = card && c.y == null ? (card.y ?? (g.v ? 985 : 676)) - Math.max(card.img_size || (card.compact ? 130 : 200), card.compact ? 178 : 196) - 44 - 14 : null;
    const top = c.y ?? (g.v ? 880 : 590);
    let cur = -1; c.words.forEach((w, i) => { if (t >= w.s) cur = i; });
    const html = c.words.map((w, i) => {
      const on = i === cur, k = E.outBack(prog(t, w.s, .18), 2.4), past = i <= cur;
      const st = on ? `background:${hi};color:${p.ink};border-radius:10px;padding:0 .18em;margin:0 -.06em;transform:scale(${lerp(.9, 1.06, clamp(k, 0, 1.2)).toFixed(3)}) rotate(-2deg);text-shadow:none;box-shadow:0 6px 16px rgba(0,0,0,.45)`
        : `color:${w.hl ? hi : '#fff'};opacity:${past ? 1 : .9}`;
      return `<span style="display:inline-block;${st}">${esc(w.w)}</span>` + (w.br ? '<br>' : ' ');
    }).join('');
    return `<div id="cap"${cidOf(c)} style="top:${lift ?? top}px;${lift != null ? 'transform:translateY(-100%);' : ''}left:${x - wpx / 2}px;right:auto;width:${wpx}px;text-align:center;font-family:${c.font || p.font};font-weight:${c.weight || 900};font-size:${size}px;line-height:1.3;
      text-transform:uppercase;color:${c.color || '#fff'};text-shadow:${stroke(3)},0 6px 14px rgba(0,0,0,.5);white-space:normal">${html}</div>`;
  };

  // ---------- Studio metadata + recipe ----------
  const sample = [
    { rank: 5, name: 'Phú Quốc', reason: 'Biển xanh, hoàng hôn đẹp nhất miền Nam', emoji: '🏝️', price: 'từ 3 triệu' },
    { rank: 4, name: 'Sa Pa', reason: 'Ruộng bậc thang mùa lúa chín', emoji: '🌾', score: 8.6 },
    { rank: 3, name: 'Hội An', reason: 'Phố cổ đèn lồng lung linh về đêm', emoji: '🏮', score: 9.1 },
    { rank: 2, name: 'Đà Lạt', reason: 'Se lạnh quanh năm, rừng thông, cà phê', emoji: '🌲', score: 9.3 },
    { rank: 1, name: 'Vịnh Hạ Long', reason: 'Kỳ quan thiên nhiên thế giới', emoji: '⛰️', score: 9.8 },
  ];
  const make = (type, d, o) => T => ({ type, t0: T, t1: T + d, ...o });
  // Ordinal words: explicit rank ("số 3", "top 3", "hạng 3") or spoken order ("thứ nhất", "đầu tiên", "thứ hai", …, "cuối cùng").
  const ORD = ['nhất', 'hai', 'ba', 'tư', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'];
  const DIG = ['một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'];
  function detect(caps, n) {
    const hits = [];
    for (let k = 1; k <= n; k++) {
      const exp = findWord(caps, [`số ${k}`, `top ${k}`, `hạng ${k}`, `vị trí số ${k}`, `số ${DIG[k - 1]}`, `hạng ${DIG[k - 1]}`], 1.5);
      if (exp != null) hits.push({ t: exp, rank: k, explicit: true });
      const ord = findWord(caps, k === 1 ? ['thứ nhất', 'đầu tiên', 'trước tiên'] : [`thứ ${ORD[k - 1]}`, `vị trí thứ ${ORD[k - 1]}`], 1.5);
      if (ord != null) hits.push({ t: ord, pos: k });
    }
    const last = findWord(caps, ['cuối cùng'], 1.5);
    if (last != null) hits.push({ t: last, pos: n });
    const byT = new Map();
    for (const h of hits.sort((a, b) => a.t - b.t)) {
      const rank = h.explicit ? h.rank : n - h.pos + 1;             // spoken order counts down: first item = #N
      if (![...byT.values()].includes(rank)) byT.set(h.t, rank);
    }
    return [...byT.entries()].map(([t, rank]) => ({ t, rank })).sort((a, b) => a.t - b.t);
  }
  PACKS.push({
    id: P, name: 'Top N / đếm ngược', icon: '🏆',
    desc: 'Listicle Top 5/Top 10: thẻ mở đầu số khổng lồ, số hạng đập vào rồi thu về góc, thẻ mục có ảnh/giá/điểm, thang hạng, bục vinh quang #1 có pháo giấy, tổng kết',
    caption: 'topn',
    items: [
      { type: 'top_title', label: 'Thẻ mở đầu TOP N', make: make('top_title', 2.5, { count: 5, title: 'Điểm đến Việt Nam', sub: 'Đáng đi nhất năm nay' }) },
      { type: 'top_number', label: 'Số hạng đập vào', make: make('top_number', 3.5, { rank: 3, name: 'Hội An' }) },
      { type: 'top_item', label: 'Thẻ mục (ảnh + lý do)', make: make('top_item', 3, { ...sample[2] }) },
      { type: 'top_progress', label: 'Thang hạng bên cạnh', make: T => ({ type: 'top_progress', t0: T, t1: T + 6, count: 5, marks: [{ rank: 5, t: T }, { rank: 4, t: T + 1.5 }, { rank: 3, t: T + 3 }], names: { 5: 'Phú Quốc', 4: 'Sa Pa', 3: 'Hội An' } }) },
      { type: 'top_podium', label: 'Bục vinh quang #1', make: make('top_podium', 3.5, { name: 'Vịnh Hạ Long', emoji: '⛰️', second: 'Đà Lạt', third: 'Hội An', kicker: 'TOP 1' }) },
      { type: 'top_recap', label: 'Tổng kết danh sách', make: make('top_recap', 3, { title: 'Top 5 điểm đến', items: sample.map(x => ({ rank: x.rank, name: x.name, emoji: x.emoji })) }) },
      { type: 'top_badge', label: 'Huy hiệu góc', make: make('top_badge', 6, { label: 'TOP 5', title: 'Điểm đến Việt Nam' }) },
    ],
    recipe: ctx => {
      const dur = ctx.dur, caps = ctx.captions || [], sc = [];
      const ws = capWords(caps), clean = w => w.replace(/[.,!?…:;"“”]+$/g, '');
      let n = 5;
      for (let i = 0; i < ws.length - 1; i++) if (clean(ws[i].low) === 'top' && /^\d+$/.test(clean(ws[i + 1].low))) { n = clamp(+clean(ws[i + 1].low), 3, 10); break; }
      const t0 = 2.5, end = dur - 3;
      let hits = detect(caps, n).filter(h => h.t >= t0 - .5 && h.t < end - 1);
      if (hits.length < 2) {                                             // nothing spoken → spread #N…#1 evenly
        const step = (end - t0) / n;
        hits = Array.from({ length: n }, (_, i) => ({ t: t0 + i * step, rank: n - i }));
      }
      const say = (a, b) => ws.filter(w => w.s >= a && w.s < b).map(w => clean(w.w)).slice(0, 4).join(' ');
      const nameOf = (h, i) => { const s = say(h.t + .3, (hits[i + 1]?.t ?? end)); return s ? s.charAt(0).toUpperCase() + s.slice(1) : `Mục số ${h.rank}`; };
      const title = ctx.title || 'Điều bạn cần biết';
      sc.push({ type: 'top_title', t0: 0, t1: t0, count: n, title });
      const h1 = hits.find(h => h.rank === 1), i1 = hits.indexOf(h1);
      const podT = h1 && Math.min(end, hits[i1 + 1]?.t ?? end) - Math.max(t0, h1.t) >= 2.4 ? Math.max(t0, h1.t) : null;   // podium covers the side graphics
      const sideEnd = +(podT != null && podT > t0 + 1 ? podT : end).toFixed(2);
      sc.push({ type: 'top_badge', t0: t0, t1: sideEnd, label: `TOP ${n}`, title, corner: 'tr' });
      sc.push({ type: 'top_progress', t0: t0, t1: sideEnd, count: n, marks: hits.map(h => ({ rank: h.rank, t: +h.t.toFixed(2) })) });
      const items = [];
      hits.forEach((h, i) => {
        const a = Math.max(t0, h.t), b = Math.min(end, hits[i + 1]?.t ?? end), name = nameOf(h, i);
        items.push({ rank: h.rank, name });
        if (b - a < 1.2) return;
        if (h.rank === 1 && b - a >= 2.4) { sc.push({ type: 'top_podium', t0: +a.toFixed(2), t1: +b.toFixed(2), name, emoji: '🏆' }); return; }
        sc.push({ type: 'top_number', t0: +a.toFixed(2), t1: +b.toFixed(2), rank: h.rank, name, badge_name: false });
        if (b - a > 2) sc.push({ type: 'top_item', t0: +(a + 1.2).toFixed(2), t1: +b.toFixed(2), rank: h.rank, name, reason: say(h.t + 1.2, b) || '', emoji: '⭐', compact: true });
      });
      sc.push({ type: 'top_recap', t0: +end.toFixed(2), t1: dur, title: `Top ${n}`, items });
      return { caption_style: 'topn', music: 'hype', scenes: sc };
    },
  });
})();
