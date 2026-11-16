// 16 extra caption styles (ids "hf_*"), visual ideas from the caption components of HeyGen HyperFrames
// (Apache-2.0), rewritten from scratch in this engine's idiom. Contract (references/packs.md "Kiểu phụ đề"):
// CAPTION_STYLES[id](c, t) -> '<div id="cap" …>', c = {t0,t1,words:[{w,s,e,hl?,br?}],x?,y?,size?,font?,color?,weight?,cid}.
// Every frame is a pure function of t (no state, no CSS animation); randomness comes from rnd(seed).
// Extra optional chunk fields: hl_color (emphasis colour), emoji (hf_emoji_pop), texture (hf_texture:
// lava|marble|metal|gold|ice; or TL.caption_texture). TL.caption_reveal === false shows every word at once.
(() => {
  const f1 = v => (+v).toFixed(1), f2 = v => (+v).toFixed(2), f3 = v => (+v).toFixed(3);
  const SANS = "'Be Vietnam Pro', sans-serif", DISP = "'Montserrat', 'Be Vietnam Pro', sans-serif";
  const SERIF = "'Playfair Display', 'Be Vietnam Pro', serif", LEX = "'Lexend', 'Be Vietnam Pro', sans-serif";
  const OSW = "'Oswald', 'Be Vietnam Pro', sans-serif";
  const TAU = Math.PI * 2;
  const elastic = k => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - .75) * TAU / 3) + 1);
  const br = w => (w.br ? '<br>' : ' ');
  const reveal = () => TL.caption_reveal !== false;
  const said = (w, t) => !reveal() || t >= w.s - .02;
  const curIdx = (c, t) => { let k = -1; c.words.forEach((w, i) => { if (t >= w.s - .02) k = i; }); return k; };
  // Emphasis set: hl words; styles that need a focal word fall back to the longest word (TL.caption_auto_hl === false disables).
  const keys = (c, auto = false) => {
    const s = new Set();
    c.words.forEach((w, i) => w.hl && s.add(i));
    if (!s.size && auto && TL.caption_auto_hl !== false) {
      let b = -1, bl = 3;
      c.words.forEach((w, i) => { const l = [...w.w.replace(/[.,!?;:"“”…]/g, '')].length; if (l > bl) { bl = l; b = i; } });
      if (b >= 0) s.add(b);
    }
    return s;
  };
  const seedOf = c => { const i = (TL.captions || []).indexOf(c); return (i < 0 ? Math.round(c.t0 * 10) : i) * 17.31 + 3.7; };
  const fade = (c, t, din = .12, dout = .1) => clamp(prog(t, c.t0 - .02, din)) * (1 - clamp(prog(t, c.t1 - dout, dout)));
  // Geometry in design px: centred on (x, y); default lower-middle safe zone (below the face, above the UI bar).
  function geo(c, o = {}) {
    const [W, H] = DIMS(), v = VERT();
    const x = c.x ?? W / 2, y = c.y ?? (v ? (o.yv ?? 930) : (o.yl ?? 560));
    const half = Math.max(140, Math.min(Math.min(x, W - x) - (v ? 34 : 60), v ? 330 : (o.wl ?? 470)));
    return { W, H, v, x, y, half, size: c.size || (v ? o.sv : o.sl), font: c.font || o.font || SANS,
      color: c.color || o.color || '#fff', weight: c.weight || o.weight || 800 };
  }
  const box = (c, g, inner, extra = '') =>
    `<div id="cap"${cidOf(c)} style="left:${f1(g.x - g.half)}px;right:auto;width:${f1(g.half * 2)}px;top:${f1(g.y)}px;transform:translateY(-50%);text-align:center;white-space:normal;text-shadow:none;font-family:${g.font};font-weight:${g.weight};font-size:${f1(g.size)}px;line-height:1.22;color:${g.color};${extra}">${inner}</div>`;
  const empty = c => `<div id="cap"${cidOf(c)} style="display:none"></div>`;
  const stroke = (px, col = '#000') => `-webkit-text-stroke:${f1(px * 2)}px ${col};paint-order:stroke fill;`;
  const fitPx = (txt, px, maxW, k = .62) => Math.min(px, maxW / Math.max(1, [...txt].length * k));
  const S = CAPTION_STYLES;

  // 1 ── hf_pill_karaoke: dark capsule, words light up one by one (yellow; hl pink).
  S.hf_pill_karaoke = (c, t) => {
    const g = geo(c, { sv: 40, sl: 34 }), cur = curIdx(c, t), ks = keys(c), hc = c.hl_color || '#FF5FA2';
    const kin = E.outBack(prog(t, c.t0 - .02, .26), 1.7), op = fade(c, t);
    const body = c.words.map((w, i) => {
      const on = i === cur, sp = said(w, t), k = E.outCubic(prog(t, w.s - .02, .14));
      const col = on ? (ks.has(i) ? hc : '#FFD84A') : sp ? (ks.has(i) ? hc : g.color) : 'rgba(255,255,255,.4)';
      const sc = on ? lerp(1.16, 1.07, k) : 1;
      const glow = on ? `text-shadow:0 0 18px ${ks.has(i) ? 'rgba(255,95,162,.55)' : 'rgba(255,216,74,.5)'};` : '';
      return `<span style="display:inline-block;margin:0 .03em;color:${col};transform:scale(${f3(sc)});${glow}">${esc(w.w)}</span>${br(w)}`;
    }).join('');
    return box(c, g, `<div style="display:inline-block;max-width:100%;box-sizing:border-box;padding:.3em .85em .36em;border-radius:${f1(g.size * 1.05)}px;background:rgba(14,14,20,.86);border:2px solid rgba(255,255,255,.14);box-shadow:0 12px 34px rgba(0,0,0,.4);opacity:${f3(op)};transform:scale(${f3(lerp(.86, 1, kin))})">${body}</div>`);
  };

  // 2 ── hf_kinetic_slam: one huge word at a time, slamming in from alternating sides, shake on impact.
  S.hf_kinetic_slam = (c, t) => {
    const g = geo(c, { sv: 108, sl: 104, font: DISP, weight: 900, yv: 900, yl: 520 }), cur = curIdx(c, t), ks = keys(c);
    if (cur < 0) return empty(c);
    const w = c.words[cur], txt = w.w.toUpperCase(), hl = ks.has(cur);
    const gi = (TL.captions || []).indexOf(c) * 3 + cur, dir = [[-1, 0], [1, 0], [0, -1], [0, 1]][((gi % 4) + 4) % 4];
    const k = prog(t, w.s - .02, .2), e = E.outExpo(k), dist = 340 * (1 - e);
    const lt = t - (w.s - .02) - .2, shake = lt > 0 && lt < .16 ? Math.sin(lt * 90) * 9 * (1 - lt / .16) : 0;
    const fs = fitPx(txt, g.size * (hl ? 1.18 : 1), g.half * 2 - 10, .7);
    const blur = (1 - e) * 10, op = clamp(k * 3) * (1 - clamp(prog(t, c.t1 - .06, .06)));
    const col = hl ? (c.hl_color || '#FFE135') : g.color;
    const bar = E.outCubic(prog(t, w.s + .06, .2));
    return box(c, g, `<div style="position:relative;display:inline-block;opacity:${f3(op)};transform:translate(${f1(dir[0] * dist + shake)}px,${f1(dir[1] * dist + shake * .4)}px) scale(${f3(lerp(1.5, 1, e))});${blur > .3 ? `filter:blur(${f1(blur)}px);` : ''}">
      <div style="position:absolute;left:-4%;right:-4%;bottom:.04em;height:.2em;background:${hl ? '#FF3B5C' : (BR().primary)};transform:scaleX(${f3(bar)});transform-origin:${dir[0] > 0 ? 'right' : 'left'} 50%;border-radius:4px;opacity:.95"></div>
      <span style="position:relative;display:inline-block;font-size:${f1(fs)}px;line-height:1.18;letter-spacing:-.01em;color:${col};${stroke(fs * .045)}text-shadow:0 ${f1(fs * .07)}px 0 #000,0 14px 30px rgba(0,0,0,.45)">${esc(txt)}</span></div>`);
  };

  // 3 ── hf_neon_glow: cyan neon tubes that flicker on as spoken; hl words magenta.
  S.hf_neon_glow = (c, t) => {
    const g = geo(c, { sv: 46, sl: 40, font: LEX, weight: 700 }), ks = keys(c), sd = seedOf(c);
    const body = c.words.map((w, i) => {
      const col = ks.has(i) ? (c.hl_color || '#FF3BD4') : (c.color || '#2FE6FF');
      const lt = t - (w.s - .02);
      if (!said(w, t)) return `<span style="display:inline-block;color:transparent;-webkit-text-stroke:1.2px ${col}55">${esc(w.w)}</span>${br(w)}`;
      const flick = reveal() && lt < .22 ? (rnd(Math.floor(t * 30) + i * 7 + sd) > .45 ? 1 : .25) : 1;
      const hum = .92 + .08 * Math.sin(t * 9 + i);
      return `<span style="display:inline-block;color:#F4FEFF;opacity:${f3(flick * hum)};text-shadow:0 0 3px #fff,0 0 8px ${col},0 0 18px ${col},0 0 34px ${col},0 0 60px ${col}88${ks.has(i) ? `;font-weight:800;transform:scale(1.08)` : ''}">${esc(w.w)}</span>${br(w)}`;
    }).join('');
    return box(c, g, `<div style="display:inline-block;padding:.25em .6em;border-radius:24px;background:radial-gradient(ellipse at 50% 50%,rgba(4,6,22,.82),rgba(4,6,22,.6) 55%,rgba(4,6,22,0) 100%);opacity:${f3(fade(c, t))}">${body}</div>`, 'letter-spacing:.01em;');
  };

  // 4 ── hf_neon_accent: chunky white sticker text, hl/active words become wiggling multi-colour neon accents.
  S.hf_neon_accent = (c, t) => {
    const g = geo(c, { sv: 48, sl: 42, weight: 900 }), ks = keys(c), cur = curIdx(c, t), sd = seedOf(c);
    const PAL = ['#B6FF3B', '#FF4FA3', '#FFB13B', '#4FE3FF', '#C38BFF'];
    const accent = i => (ks.size ? ks.has(i) : i === cur);
    const body = c.words.map((w, i) => {
      if (!said(w, t)) return `<span style="display:inline-block;opacity:0">${esc(w.w)}</span>${br(w)}`;
      const k = E.outBack(prog(t, w.s - .02, .24), 2), a = accent(i);
      const col = a ? PAL[Math.floor(rnd(sd + i) * PAL.length)] : g.color;
      const rot = (a ? 4.5 : 1.2) * Math.sin(t * 3.1 + i * 1.7), dy = (a ? 5 : 2) * Math.sin(t * 2.3 + i * 2.1);
      const sh = a ? `0 0 6px ${col},0 0 16px ${col},0 0 32px ${col}aa,0 4px 0 #000` : '0 4px 0 #000,0 0 14px rgba(0,0,0,.55)';
      return `<span style="display:inline-block;margin:0 .04em;color:${a ? '#fff' : col};${a ? `-webkit-text-stroke:1.5px ${col};` : stroke(2.4)}text-shadow:${sh};transform:translateY(${f1(dy)}px) rotate(${f2(rot)}deg) scale(${f3(lerp(.3, a ? 1.12 : 1, k))})">${esc(w.w)}</span>${br(w)}`;
    }).join('');
    return box(c, g, body, `opacity:${f3(fade(c, t))};`);
  };

  // 5 ── hf_gradient_fill: words filled with a flowing sunset gradient, elastic bounce entrance.
  const clipText = bg => `background:${bg};-webkit-background-clip:text;background-clip:text;color:transparent;padding:.2em .05em .12em;margin:-.2em -.05em -.12em;`;
  S.hf_gradient_fill = (c, t) => {
    const g = geo(c, { sv: 54, sl: 46, font: DISP, weight: 900 }), ks = keys(c);
    const base = c.color ? `linear-gradient(100deg,${c.color},#fff 50%,${c.color})` : 'linear-gradient(100deg,#FFD23F,#FF6B6B 30%,#C86BFA 60%,#5EC8FF 85%,#FFD23F)';
    const hot = c.hl_color ? `linear-gradient(100deg,${c.hl_color},#fff 50%,${c.hl_color})` : 'linear-gradient(100deg,#FFF6B0,#FFC94A 35%,#FF8A00 65%,#FFF6B0)';
    const pos = ((t * 22) % 200).toFixed(1);
    const body = c.words.map((w, i) => {
      if (!said(w, t)) return `<span style="display:inline-block;opacity:0">${esc(w.w)}</span>${br(w)}`;
      const k = elastic(prog(t, w.s - .02, .55)), h = ks.has(i);
      return `<span style="display:inline-block;filter:drop-shadow(0 3px 0 rgba(0,0,0,.7)) drop-shadow(0 8px 14px rgba(0,0,0,.45));transform:translateY(${f1((1 - k) * 26)}px) scale(${f3(lerp(.4, h ? 1.14 : 1, k))});margin:0 ${h ? '.08em' : '0'}"><span style="display:inline-block;${clipText(h ? hot : base)}background-size:200% 100%;background-position:${pos}% 0">${esc(w.w)}</span></span>${br(w)}`;
    }).join('');
    return box(c, g, body, `opacity:${f3(fade(c, t))};line-height:1.2;letter-spacing:-.01em;`);
  };

  // 6 ── hf_emoji_pop: stroked white text, horizontal-squeeze entrance, an emoji pops above for matching words.
  const EMO = { ai: '🤖', robot: '🤖', video: '🎬', clip: '🎬', phim: '🎬', edit: '✂️', cắt: '✂️', tiền: '💰', lãi: '💰', giá: '🏷️',
    giờ: '⏰', tiếng: '⏰', phút: '⏰', 'đồng hồ': '⏰', nhanh: '⚡', yêu: '❤️', tim: '❤️', vui: '😄', cười: '😂', buồn: '😢', khóc: '😭',
    đỉnh: '🔥', hot: '🔥', lửa: '🔥', top: '🏆', 'số 1': '🏆', hay: '👍', sai: '❌', đúng: '✅', xong: '✅', tăng: '📈', giảm: '📉',
    tiến: '🚀', 'tiến hoá': '🚀', 'tiến hóa': '🚀', học: '📚', sách: '📚', nhà: '🏠', xe: '🚗', ăn: '🍜', 'điện thoại': '📱', máy: '💻',
    'máy tính': '💻', wow: '😮', 'bí mật': '🤫', 'ý tưởng': '💡', mẹo: '💡', sợ: '😱', tự: '', 'tự động': '⚙️', sao: '⭐', 'thế giới': '🌍' };
  const norm = s => s.toLowerCase().replace(/[.,!?;:"“”…()]/g, '');
  function emojiAt(c, t) {
    if (c.emoji) return { ch: c.emoji, s: c.words[0]?.s ?? c.t0 };
    let hit = null;
    c.words.forEach((w, i) => {
      if (!said(w, t)) return;
      const one = norm(w.w), two = i > 0 ? norm(c.words[i - 1].w) + ' ' + one : '';
      const ch = (two && EMO[two]) || EMO[one];
      if (ch) hit = { ch, s: w.s };
      else if (w.hl && !hit) hit = { ch: '🔥', s: w.s };
    });
    return hit;
  }
  S.hf_emoji_pop = (c, t) => {
    const g = geo(c, { sv: 50, sl: 44, weight: 900 }), ks = keys(c);
    const body = c.words.map((w, i) => {
      if (!said(w, t)) return `<span style="display:inline-block;opacity:0">${esc(w.w)}</span>${br(w)}`;
      const k = E.outBack(prog(t, w.s - .02, .22), 2.2);
      return `<span style="display:inline-block;color:${ks.has(i) ? (c.hl_color || '#FFE14D') : g.color};${stroke(g.size * .07)}text-shadow:0 ${f1(g.size * .09)}px 0 #000;transform:scale(${f3(lerp(.12, 1, k))},${f3(lerp(1.35, 1, clamp(k)))})">${esc(w.w)}</span>${br(w)}`;
    }).join('');
    const em = emojiAt(c, t);
    let pop = '';
    if (em) {
      const es = Math.round(g.size * 1.55), lt = t - (em.s - .02), k = E.outBack(clamp(lt / .32), 2.6);
      const rot = Math.sin(lt * 7) * 9 * Math.exp(-lt * 2.2), bobY = Math.sin(t * 3.2) * 4;
      pop = `<div style="position:absolute;left:50%;top:${f1(-es - 14)}px;width:0;height:0">${emoji(em.ch, -es / 2, bobY, es, `transform:scale(${f3(clamp(k, 0, 1.3))}) rotate(${f1(rot)}deg);transform-origin:50% 90%`)}</div>`;
    }
    return box(c, g, `<div style="position:relative">${pop}${body}</div>`, `opacity:${f3(fade(c, t))};line-height:1.2;`);
  };

  // 7 ── hf_highlight_sweep: TikTok — a red box sweeps in behind the active word (hl words: yellow box, dark text).
  S.hf_highlight_sweep = (c, t) => {
    const g = geo(c, { sv: 46, sl: 40, weight: 900 }), ks = keys(c), cur = curIdx(c, t);
    const body = c.words.map((w, i) => {
      const on = i === cur, h = ks.has(i);
      const k = E.outCubic(prog(t, w.s - .02, .13));
      const bx = on ? `<span style="position:absolute;left:-.16em;right:-.16em;top:.02em;bottom:-.04em;border-radius:.2em;background:${h ? (c.hl_color || '#FFD60A') : '#FF2D55'};transform:scaleX(${f3(k)}) rotate(-1.5deg);transform-origin:0 50%;z-index:-1;box-shadow:0 6px 16px rgba(0,0,0,.3)"></span>` : '';
      const col = on && h ? '#111' : h ? (c.hl_color || '#FFD60A') : g.color;
      return `<span style="position:relative;z-index:0;display:inline-block;margin:0 .1em;color:${col};${on && h ? '' : stroke(g.size * .055)}text-shadow:${on && h ? 'none' : '0 4px 10px rgba(0,0,0,.55)'};transform:scale(${f3(on ? lerp(1.0, 1.06, k) : 1)})">${bx}${esc(w.w)}</span>${br(w)}`;
    }).join('');
    return box(c, g, body, `opacity:${f3(fade(c, t))};line-height:1.3;`);
  };

  // 8 ── hf_glitch_rgb: condensed uppercase on a scanline plate; red/cyan channel split jitters on every word hit.
  S.hf_glitch_rgb = (c, t) => {
    const g = geo(c, { sv: 54, sl: 46, font: OSW, weight: 700 }), ks = keys(c), sd = seedOf(c), fr = Math.floor(t * 24);
    const burst = rnd(fr * .37 + sd) > .9;
    const body = c.words.map((w, i) => {
      if (!said(w, t)) return `<span style="display:inline-block;opacity:0">${esc(w.w.toUpperCase())}</span>${br(w)}`;
      const lt = t - (w.s - .02), hot = lt < .2 || burst;
      const r = j => rnd(fr * 1.3 + i * 11 + j + sd);
      const dx = hot ? 3 + r(1) * 7 : 2, jx = hot ? (r(2) - .5) * 16 : 0, sk = hot ? (r(3) - .5) * 14 : 0;
      const slice = hot && r(4) > .72 ? `clip-path:inset(-30% -10% ${f1(14 + r(6) * 16)}% -10%);` : '';
      const col = ks.has(i) ? (c.hl_color || '#E8FF3A') : g.color;
      return `<span style="display:inline-block;margin:0 .07em;color:${col};text-shadow:${f1(dx)}px 0 rgba(255,0,72,.9),${f1(-dx)}px 0 rgba(0,234,255,.9);transform:translateX(${f1(jx)}px) skewX(${f1(sk)}deg);${slice}">${esc(w.w.toUpperCase())}</span>${br(w)}`;
    }).join('');
    const jit = burst ? (rnd(fr + sd * 2) - .5) * 10 : 0;
    return box(c, g, `<div style="display:inline-block;max-width:100%;box-sizing:border-box;position:relative;padding:.18em .55em .22em;background:rgba(6,8,12,.74);border-left:4px solid #FF0048;border-right:4px solid #00EAFF;transform:translateX(${f1(jit)}px)">
      ${body}<div style="position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.07) 0 1px,transparent 1px 4px);background-position:0 ${(t * 40 % 4).toFixed(1)}px"></div></div>`,
    `opacity:${f3(fade(c, t))};letter-spacing:.03em;line-height:1.25;`);
  };

  // 9 ── hf_particle_burst: clean bold caption; each emphasised word explodes a seeded burst of particles + a ring.
  S.hf_particle_burst = (c, t) => {
    const g = geo(c, { sv: 48, sl: 42, weight: 800 }), ks = keys(c, true), sd = seedOf(c);
    const PAL = ['#FFD447', '#FF5D8F', '#4FE3FF', '#9BFF5C', '#FFFFFF', '#FF9B3D'];
    const body = c.words.map((w, i) => {
      if (!said(w, t)) return `<span style="display:inline-block;opacity:0">${esc(w.w)}</span>${br(w)}`;
      const h = ks.has(i), lt = t - (w.s - .02), k = E.outBack(prog(t, w.s - .02, .22), 2.4);
      let fx = '';
      if (h && lt >= 0 && lt < 1) {
        const D = .95, q = lt / D, ex = E.outCubic(q);
        for (let j = 0; j < 22; j++) {
          const r1 = rnd(sd + i * 31 + j), r2 = rnd(sd + i * 31 + j + .5), r3 = rnd(sd + i * 31 + j + .77);
          const a = r1 * TAU, d = (g.size * .9 + r2 * g.size * 2.1) * ex, px = Math.cos(a) * d * 1.35, py = Math.sin(a) * d * .8 + 90 * lt * lt;
          const sz = 5 + r3 * 9, col = PAL[j % PAL.length], sq = j % 3 === 0;
          fx += `<i style="position:absolute;left:50%;top:50%;width:${f1(sz)}px;height:${f1(sz)}px;margin:${f1(-sz / 2)}px;border-radius:${sq ? '2px' : '50%'};background:${col};box-shadow:0 0 8px ${col};opacity:${f3(1 - q * q)};transform:translate(${f1(px)}px,${f1(py)}px) rotate(${f1(r1 * 360 + lt * 400)}deg) scale(${f3(1 - q * .6)})"></i>`;
        }
        const rq = clamp(lt / .4);
        if (rq < 1) fx += `<i style="position:absolute;left:50%;top:50%;width:${f1(g.size * 3)}px;height:${f1(g.size * 3)}px;margin:${f1(-g.size * 1.5)}px;border-radius:50%;border:${f1(4 * (1 - rq) + 1)}px solid #FFD447;opacity:${f3(1 - rq)};transform:scale(${f3(.2 + E.outCubic(rq) * .9)})"></i>`;
      }
      const col = h ? (c.hl_color || '#FFD447') : g.color;
      return `<span style="position:relative;display:inline-block;color:${col};${stroke(g.size * .05)}text-shadow:0 4px 0 rgba(0,0,0,.8),0 0 16px rgba(0,0,0,.4);transform:scale(${f3(lerp(.5, h ? 1.18 : 1, k))});margin:0 ${h ? '.12em' : '0'}">${fx}${esc(w.w)}</span>${br(w)}`;
    }).join('');
    return box(c, g, body, `opacity:${f3(fade(c, t))};`);
  };

  // 10 ── hf_clip_wipe: a brand-colour block slides across each word and wipes it into view, left → right.
  S.hf_clip_wipe = (c, t) => {
    const g = geo(c, { sv: 46, sl: 40, weight: 800 }), ks = keys(c), B = BR();
    const body = c.words.map((w, i) => {
      const h = ks.has(i), s0 = reveal() ? w.s - .04 : c.t0 - 1;
      const k1 = E.outCubic(prog(t, s0, .12)), k2 = E.inOutSine(prog(t, s0 + .08, .18));
      const bar = k1 > 0 && k2 < 1 ? `<span style="position:absolute;top:.12em;bottom:.04em;left:${f2(k2 * 100)}%;right:${f2((1 - k1) * 100)}%;background:${h ? (c.hl_color || B.accent) : B.primary}"></span>` : '';
      const col = h ? (c.hl_color || B.accent) : g.color;
      return `<span style="position:relative;display:inline-block;margin:0 .02em"><span style="display:inline-block;color:${col};text-shadow:0 3px 0 rgba(0,0,0,.75),0 0 18px rgba(0,0,0,.5);clip-path:inset(-40% ${f2((1 - k2) * 100)}% -40% -5%)">${esc(w.w)}</span>${bar}</span>${br(w)}`;
    }).join('');
    return box(c, g, body, `opacity:${f3(fade(c, t, .05))};line-height:1.3;`);
  };

  // 11 ── hf_editorial_emphasis: small tracked uppercase sans + giant italic serif emphasis word on its own line.
  S.hf_editorial_emphasis = (c, t) => {
    const g = geo(c, { sv: 30, sl: 26, weight: 600, yv: 900, yl: 540 }), ks = keys(c, true);
    const rows = [];
    c.words.forEach((w, i) => {
      const key = ks.has(i), last = rows[rows.length - 1];
      if (last && last.key === key) last.ws.push([w, i]); else rows.push({ key, ws: [[w, i]] });
    });
    const body = rows.map(r => {
      if (r.key) {
        const txt = r.ws.map(([w]) => w.w).join(' '), fs = fitPx(txt, g.size * 2.9, g.half * 2 - 10, .5);
        const w0 = r.ws[0][0];
        if (!said(w0, t)) return `<div style="font-size:${f1(fs)}px;line-height:1.2;opacity:0">&nbsp;</div>`;
        const k = E.outCubic(prog(t, w0.s - .02, .32));
        return `<div style="font-family:${SERIF};font-style:italic;font-weight:800;font-size:${f1(fs)}px;line-height:1.16;letter-spacing:-.015em;color:${c.hl_color || '#FFE6B0'};text-shadow:0 6px 24px rgba(0,0,0,.55),0 2px 2px rgba(0,0,0,.5);clip-path:inset(-30% ${f2((1 - k) * 100)}% -30% -5%);transform:translateY(${f1((1 - k) * 10)}px) scale(${f3(lerp(1.08, 1, k))})">${esc(txt)}</div>`;
      }
      return `<div style="text-transform:uppercase;letter-spacing:.16em;line-height:1.5">${r.ws.map(([w]) => {
        const k = E.outCubic(prog(t, w.s - .02, .2)), sp = said(w, t);
        return `<span style="display:inline-block;opacity:${f3(sp ? k : 0)};transform:translateY(${f1((1 - k) * 8)}px);text-shadow:0 2px 10px rgba(0,0,0,.7)">${esc(w.w)}</span>`;
      }).join(' ')}</div>`;
    }).join('');
    return box(c, g, body, `opacity:${f3(fade(c, t))};`);
  };

  // 12 ── hf_matrix_decode: each word scrambles through glyphs (incl. Vietnamese letters) before locking in.
  const POOL = '01ĂÂĐÊÔƠƯ#$%&@*+=?<>ABCDEFGHKLMNPQRSTUVXYZ';
  S.hf_matrix_decode = (c, t) => {
    const g = geo(c, { sv: 44, sl: 38, weight: 800 }), ks = keys(c), sd = seedOf(c), fr = Math.floor(t * 24);
    const GR = c.hl_color || '#3CFF8F';
    const body = c.words.map((w, i) => {
      const chars = [...w.w.toUpperCase()];
      if (!said(w, t)) return `<span style="display:inline-block;opacity:0">${esc(w.w.toUpperCase())}</span>${br(w)}`;
      const lt = t - (w.s - .02), D = .42, n = reveal() ? Math.floor(chars.length * clamp(lt / D)) : chars.length;
      const final = ks.has(i) ? GR : g.color;
      const inner = chars.map((ch, j) => j < n
        ? `<span style="color:${final}">${esc(ch)}</span>`
        : `<span style="color:${GR};opacity:.85;text-shadow:0 0 10px ${GR}">${esc(POOL[Math.floor(rnd(fr * 3.1 + j * 13 + i * 7 + sd) * POOL.length)])}</span>`).join('');
      return `<span style="display:inline-block;${ks.has(i) ? `text-shadow:0 0 14px ${GR}99;` : 'text-shadow:0 2px 8px rgba(0,0,0,.8);'}">${inner}</span>${br(w)}`;
    }).join('');
    return box(c, g, `<div style="display:inline-block;max-width:100%;box-sizing:border-box;padding:.22em .55em;background:linear-gradient(90deg,transparent,rgba(0,18,8,.72) 12%,rgba(0,18,8,.72) 88%,transparent);border-top:1px solid ${GR}55;border-bottom:1px solid ${GR}55">${body}</div>`,
    `opacity:${f3(fade(c, t))};letter-spacing:.06em;`);
  };

  // 13 ── hf_blend_difference: big white uppercase with mix-blend-mode:difference (inverts against the video);
  // words rise out of a mask; hl words sit in a solid block that inverts the picture behind them.
  S.hf_blend_difference = (c, t) => {
    const g = geo(c, { sv: 64, sl: 58, font: DISP, weight: 900 }), ks = keys(c);
    const body = c.words.map((w, i) => {
      const k = said(w, t) ? E.outExpo(prog(t, w.s - .02, .3)) : 0, h = ks.has(i);
      const inner = `<span style="display:inline-block;transform:translateY(${f2((1 - k) * 110)}%);${h ? 'background:#fff;color:#000;padding:0 .12em' : 'color:#fff'}">${esc(w.w.toUpperCase())}</span>`;
      return `<span style="display:inline-block;overflow:hidden;vertical-align:bottom;padding:.24em .02em .02em;margin:-.24em 0 -.02em">${inner}</span>${br(w)}`;
    }).join('');
    return box(c, g, body, `mix-blend-mode:difference;opacity:${f3(fade(c, t))};line-height:1.04;letter-spacing:-.02em;`);
  };

  // 14 ── hf_weight_shift: elegant line; the active word swells to heavy weight, the rest stay light (no reflow).
  S.hf_weight_shift = (c, t) => {
    const g = geo(c, { sv: 44, sl: 38, color: '#F7F2E8', weight: 500 }), ks = keys(c), cur = curIdx(c, t);
    const body = c.words.map((w, i) => {
      const on = i === cur, sp = said(w, t), h = ks.has(i);
      const k = on ? E.outCubic(prog(t, w.s - .02, .22)) : 0;
      const wt = on ? (k < .35 ? 700 : 900) : sp ? (h ? 800 : 600) : g.weight;
      const op = on ? 1 : sp ? .92 : .55, col = h ? (c.hl_color || '#FFC86B') : g.color;
      const ls = on ? lerp(.08, -.005, k) : .01;
      const line = on ? `<span style="position:absolute;left:10%;right:10%;bottom:-.06em;height:3px;border-radius:2px;background:${col};transform:scaleX(${f3(k)})"></span>` : '';
      return `<span style="position:relative;display:inline-grid;margin:0 .1em"><span style="grid-area:1/1;visibility:hidden;font-weight:900">${esc(w.w)}</span><span style="grid-area:1/1;font-weight:${wt};letter-spacing:${f3(ls)}em;opacity:${f3(op)};color:${col};${h && sp ? 'font-style:italic;' : ''}text-shadow:0 0 2px rgba(0,0,0,.7),0 2px 4px rgba(0,0,0,.6),0 3px 20px rgba(0,0,0,.75)">${esc(w.w)}</span>${line}</span>${br(w)}`;
    }).join('');
    return box(c, g, body, `opacity:${f3(fade(c, t, .2))};line-height:1.3;`);
  };

  // 15 ── hf_texture: big uppercase filled with a slowly flowing texture (lava / marble / metal / gold / ice).
  const TEX = {
    lava: 'radial-gradient(circle at 25% 35%,#FFF07A 0,#FFC21F 9%,transparent 24%),radial-gradient(circle at 72% 62%,#FFE16B 0,#FF8A00 10%,transparent 28%),radial-gradient(circle at 48% 90%,#FFB300 0,transparent 22%),linear-gradient(160deg,#FF4D00,#C40000 38%,#FF7A00 58%,#7A0000 80%,#FF5A00)',
    marble: 'radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.9),transparent 40%),repeating-linear-gradient(118deg,#FFFFFF 0 7px,#E3E4EA 10px,#FFFFFF 15px,#A9ADBA 16.5px,#FFFFFF 24px,#F1F1F5 34px),linear-gradient(#fff,#ddd)',
    metal: 'repeating-linear-gradient(90deg,rgba(255,255,255,.12) 0 1px,transparent 1px 3px),linear-gradient(180deg,#FFFFFF 0,#C9D0D8 30%,#6B7580 48%,#F4F7FA 52%,#8C96A0 75%,#E3E8EE 100%)',
    gold: 'repeating-linear-gradient(90deg,rgba(255,255,255,.1) 0 1px,transparent 1px 4px),linear-gradient(180deg,#FFF6C2 0,#F1C24E 38%,#9A6412 52%,#F9DA7A 66%,#C68A22 100%)',
    ice: 'radial-gradient(circle at 70% 30%,#fff,transparent 30%),linear-gradient(160deg,#E8FBFF,#7FDBFF 35%,#2A8CFF 60%,#C8F2FF 85%)',
  };
  S.hf_texture = (c, t) => {
    const g = geo(c, { sv: 76, sl: 70, font: DISP, weight: 900 }), ks = keys(c);
    const name = TEX[c.texture] ? c.texture : TEX[TL.caption_texture] ? TL.caption_texture : 'lava';
    const alt = name === 'gold' ? 'lava' : 'gold';
    const px = (t * 14 % 100).toFixed(1), py = (50 + Math.sin(t * .9) * 30).toFixed(1);
    const body = c.words.map((w, i) => {
      if (!said(w, t)) return `<span style="display:inline-block;opacity:0">${esc(w.w.toUpperCase())}</span>${br(w)}`;
      const k = E.outBack(prog(t, w.s - .02, .26), 1.8), h = ks.has(i);
      const tex = TEX[h ? alt : name], vert = name === 'metal' || name === 'gold';
      return `<span style="display:inline-block;filter:drop-shadow(0 3px 0 rgba(0,0,0,.75)) drop-shadow(0 10px 18px rgba(0,0,0,.45));transform:translateY(${f1((1 - clamp(k)) * 20)}px) scale(${f3(lerp(.7, h ? 1.12 : 1, k))});margin:0 .06em"><span style="display:inline-block;${clipText(tex)}background-size:${vert ? '100% 100%' : '220% 220%'};background-position:${vert ? '0 0' : `${px}% ${py}%`};${c.color ? `-webkit-text-stroke:1px ${c.color};` : ''}">${esc(w.w.toUpperCase())}</span></span>${br(w)}`;
    }).join('');
    return box(c, g, body, `opacity:${f3(fade(c, t))};line-height:1.06;letter-spacing:-.01em;`);
  };

  // 16 ── hf_parallax_layers: solid front text with two outlined echo layers drifting at different depths;
  // words enter with a vertical stretch.
  S.hf_parallax_layers = (c, t) => {
    const g = geo(c, { sv: 62, sl: 56, font: DISP, weight: 900 }), ks = keys(c), B = BR();
    const layer = (kind) => c.words.map((w, i) => {
      const txt = esc(w.w.toUpperCase());
      if (!said(w, t)) return `<span style="display:inline-block;opacity:0">${txt}</span>${br(w)}`;
      const lag = kind === 'front' ? 0 : kind === 'mid' ? .05 : .1;
      const k = E.outExpo(prog(t, w.s - .02 + lag, .32)), h = ks.has(i);
      const tf = `transform:scaleY(${f3(lerp(2.4, 1, k))}) scaleX(${f3(lerp(.8, 1, k))});transform-origin:50% 100%;opacity:${f3(clamp(k * 2))}`;
      if (kind === 'front') return `<span style="display:inline-block;color:${h ? (c.hl_color || B.accent) : g.color};text-shadow:0 4px 0 rgba(0,0,0,.6),0 10px 24px rgba(0,0,0,.45);${tf}">${txt}</span>${br(w)}`;
      const col = kind === 'mid' ? (h ? B.accent : '#FFFFFF') : B.primary;
      return `<span style="display:inline-block;color:transparent;-webkit-text-stroke:${kind === 'mid' ? 1.6 : 2}px ${col};${tf}">${txt}</span>${br(w)}`;
    }).join('');
    const d1x = Math.sin(t * 1.3) * 3, d1y = -9 + Math.cos(t * 1.1) * 2, d2x = Math.sin(t * 1.3 + .8) * 6, d2y = -18 + Math.cos(t * 1.1 + .6) * 4;
    return box(c, g, `<div style="position:relative">
      <div style="position:absolute;inset:0;opacity:.4;transform:translate(${f1(d2x)}px,${f1(d2y)}px)">${layer('back')}</div>
      <div style="position:absolute;inset:0;opacity:.65;transform:translate(${f1(d1x)}px,${f1(d1y)}px)">${layer('mid')}</div>
      <div style="position:relative">${layer('front')}</div></div>`,
    `opacity:${f3(fade(c, t))};line-height:1.08;letter-spacing:-.01em;`);
  };

  // Vietnamese names for the Studio caption-style pickers.
  window.CAPTION_LABELS = Object.assign(window.CAPTION_LABELS || {}, {
    hf_pill_karaoke: 'Viên thuốc karaoke', hf_kinetic_slam: 'Đập chữ từng từ', hf_neon_glow: 'Neon phát sáng',
    hf_neon_accent: 'Neon nhấn màu', hf_gradient_fill: 'Chữ chuyển màu', hf_emoji_pop: 'Emoji bật',
    hf_highlight_sweep: 'Hộp đỏ TikTok', hf_glitch_rgb: 'Nhiễu RGB', hf_particle_burst: 'Pháo hạt từ khoá',
    hf_clip_wipe: 'Lau chữ', hf_editorial_emphasis: 'Tạp chí nhấn chữ', hf_matrix_decode: 'Giải mã Matrix',
    hf_blend_difference: 'Đảo màu theo nền', hf_weight_shift: 'Đổi độ đậm', hf_texture: 'Chữ vân chất liệu',
    hf_parallax_layers: 'Lớp chữ chiều sâu',
  });
})();
