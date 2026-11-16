// Scene modules. Each: (scene, t, localT) => { back, front, person, cover, hideCaptions }.
// Times inside a scene (label_t, hero_t, items[].t …) are absolute seconds on the edited timeline.
// Specs and reference timings: references/modules.md.

const rnd = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const px = (x, y) => `left:${x}px;top:${y}px;`;
const div = (cls, style, html = '') => `<div class="${cls}" style="${style}">${html}</div>`;
const tin = (s, key, dflt) => (s[key] != null ? s[key] : dflt);
const out = s => (s.keep ? null : s.t1);

// ---------- shared backgrounds ----------
function techBg(s, t, opts = {}) {
  const cx = s.cx ?? 690, cy = s.cy ?? 300;
  const tiles = (s.tiles || []).length ? s.tiles : null;
  let wall = '';
  if (tiles) {
    let cells = '';
    for (let i = 0; i < 24; i++) {
      const m = tiles[i % tiles.length];
      cells += `<div style="position:relative;width:250px;height:170px;border-radius:10px;overflow:hidden;background:#2a1410"><img class="cover" src="${media(m, t)}" style="filter:grayscale(.3) brightness(.55) sepia(.5) hue-rotate(-20deg)"></div>`;
    }
    const drift = (t * 14) % 270;
    wall = `<div class="abs" style="left:-260px;top:-300px;width:1900px;display:flex;flex-wrap:wrap;gap:20px;transform:perspective(900px) rotateY(-22deg) rotateZ(-8deg) translateX(${-drift}px);opacity:.75">${cells}</div>`;
  }
  const rays = `<div class="full" style="background:repeating-conic-gradient(from ${(t * 8).toFixed(1)}deg at ${cx}px ${cy}px, rgba(255,120,70,.20) 0deg 3deg, transparent 3deg 11deg);-webkit-mask-image:radial-gradient(circle at ${cx}px ${cy}px,#000 0,#000 18%,transparent 62%);mix-blend-mode:screen"></div>`;
  const glow = `<div class="full" style="background:radial-gradient(circle at ${cx}px ${cy + 40}px, rgba(255,90,50,.55) 0, rgba(200,50,20,.25) 22%, transparent 48%)"></div>`;
  const floor = `<div class="abs" style="left:-640px;top:470px;width:2560px;height:700px;transform:perspective(420px) rotateX(62deg);transform-origin:50% 0;
    background-image:linear-gradient(rgba(255,110,70,.55) 1.5px,transparent 1.5px),linear-gradient(90deg,rgba(255,110,70,.55) 1.5px,transparent 1.5px);
    background-size:110px 110px;background-position:0 ${(t * 60) % 110}px;-webkit-mask-image:linear-gradient(transparent,#000 30%)"></div>`;
  let dots = '';
  for (let i = 0; i < 40; i++) {
    const x = rnd(i) * 1280, y = (rnd(i + 99) * 720 - t * (8 + rnd(i + 7) * 18)) % 720;
    dots += `<div class="abs" style="${px(x.toFixed(0), ((y + 720) % 720).toFixed(0))}width:3px;height:3px;border-radius:50%;background:#fff;opacity:${(.3 + rnd(i + 3) * .6).toFixed(2)}"></div>`;
  }
  const vignette = `<div class="full" style="background:radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(0,0,0,.75) 100%)"></div>`;
  return `<div class="full" style="background:${opts.base || '#160604'}"></div>${wall}${glow}${opts.noRays ? '' : rays}${floor}${dots}${vignette}`;
}
function panelBg() {
  return `<div class="full" style="background:radial-gradient(circle at 26% 22%, #4B2016 0, #2a120c 26%, #120C0A 58%, #0A0607 100%)"></div><div class="full grid-bg"></div>`;
}
function pipCircle(t, s) {
  const x = s.pip_x ?? 1002, y = s.pip_y ?? 455, d = s.pip_d ?? 230;
  const a = anim(t, tin(s, 'pip_t', s.t0 + .3), null, 'pop');
  return `<div class="abs" style="${px(x, y)}width:${d}px;height:${d}px;border-radius:50%;overflow:hidden;border:3px solid var(--accent);box-shadow:0 10px 40px rgba(0,0,0,.6);${a}">
    <img src="${url(fmtSeq(TL.aroll.frames, frameAt(t)))}" style="position:absolute;width:${d * 2.1}px;left:${-d * (s.pip_fx ?? .78)}px;top:${-d * (s.pip_fy ?? .2)}px;filter:${GRADES.normal}"></div>`;
}
function pipRect(t, s, x = 862, y = 74, w = 380, h = 520) {
  const a = anim(t, tin(s, 'pip_t', s.t0), null, 'fade');
  return `<div class="abs" style="${px(x, y)}width:${w}px;height:${h}px;border-radius:12px;overflow:hidden;border:2px solid rgba(255,255,255,.85);box-shadow:0 20px 60px rgba(0,0,0,.6);${a}">
    <img src="${url(fmtSeq(TL.aroll.frames, frameAt(t)))}" style="position:absolute;height:100%;left:${-(s.pip_fx ?? .52) * h * 16 / 9 + w / 2}px;filter:${GRADES.normal}"></div>`;
}
function wavebars(n, seed, h, color, playK = 1) {
  let b = '';
  for (let i = 0; i < n; i++) {
    const v = .25 + rnd(seed + i) * .75;
    b += `<i style="display:inline-block;width:4px;margin-right:3px;height:${(v * h).toFixed(0)}px;background:${color};opacity:${i / n < playK ? 1 : .35};vertical-align:middle;border-radius:1px"></i>`;
  }
  return b;
}

const MODULES = {
  // HUD: corner brackets, REC timecode, face-lock box, status lines (hook only)
  hud(s, t, lt) {
    const f = Math.floor(lt * 30), tc = `00:00:${pad(Math.floor(lt) % 60, 2)}:${pad(f % 30, 2)}`;
    const br = (x, y, r) => `<div class="abs" style="${px(x, y)}width:30px;height:30px;border-left:2px solid #fff;border-top:2px solid #fff;transform:rotate(${r}deg)"></div>`;
    let h = br(22, 22, 0) + br(1228, 22, 90) + br(1228, 668, 180) + br(22, 668, 270);
    h += `<div class="abs" style="${px(46, 38)}font-weight:600;font-size:15px;display:flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:#ff3b30;display:inline-block"></i>AI EDIT · ${tc}</div>`;
    const fc = s.face || { x: 588, y: 128, w: 290, h: 310 };
    if (t < tin(s, 'face_out', s.t1)) {
      const k = E.outBack(prog(t, s.t0, .3), 1.4), sc = lerp(1.25, 1, k), c = 'var(--accent)';
      const corner = (x, y, r) => `<div class="abs" style="${px(x, y)}width:42px;height:42px;border-left:3px solid ${c};border-top:3px solid ${c};transform:rotate(${r}deg)"></div>`;
      const scanY = (lt * 220) % fc.h;
      h += `<div class="abs" style="${px(fc.x, fc.y)}width:${fc.w}px;height:${fc.h}px;transform:scale(${sc.toFixed(3)});opacity:${clamp(k)}">
        ${corner(0, 0, 0)}${corner(fc.w - 42, 0, 90)}${corner(fc.w - 42, fc.h - 42, 180)}${corner(0, fc.h - 42, 270)}
        <div class="abs" style="left:0;top:${scanY.toFixed(0)}px;width:${fc.w}px;height:2px;background:${c};box-shadow:0 0 10px ${c}"></div></div>`;
      const pct = Math.min(99, Math.floor(lt * 60));
      h += `<div class="abs" style="${px(fc.x + fc.w + 14, fc.y + 8)}font-weight:700;font-size:15px;line-height:1.55;text-shadow:0 2px 8px #000">
        <span style="background:var(--accent);padding:0 5px;border-radius:3px;margin-right:6px">AI</span>ĐANG EDIT<br>KHOÁ MẶT ✓<br>PHÂN TÍCH ${pct}%</div>`;
    }
    return { front: h };
  },

  // Left-column text stack: emoji → label (optionally word-by-word) → hero → sub → sub2
  kinetic(s, t) {
    const x = s.x ?? 75; let y = s.y ?? 205; const o = out(s);
    let h = '';
    if (s.emoji) s.emoji.forEach((e, i) => { h += emoji(e, x + i * 70, y - 78, 56, anim(t, tin(s, 'emoji_t', s.t0) + i * .08, o, 'pop')); });
    if (s.label) {
      let txt = s.label;
      if (s.label_words) txt = s.label_words.filter(w => t >= w.t).map((w, i, a) => `<span style="opacity:${i === a.length - 1 ? lerp(.55, 1, prog(t, w.t, .12)).toFixed(2) : 1}">${w.w}</span>`).join(' ');
      h += `<div class="abs label" style="${px(x, y)}${anim(t, tin(s, 'label_t', s.t0), o, 'label')}">${txt}</div>`;
      y += 44;
    }
    if (s.hero) {
      const lines = s.hero.split('\n').length, fs = s.hero_size ?? 60;
      h += `<div class="abs hero" style="${px(x - 2, y)}font-size:${fs}px;transform-origin:0 50%;${anim(t, tin(s, 'hero_t', s.t0), o, 'hero')}">${s.hero.replace(/\n/g, '<br>')}</div>`;
      y += fs * .98 * lines + 10;
    }
    if (s.sub) { h += `<div class="abs sub" style="${px(x, y)}${anim(t, tin(s, 'sub_t', s.t0), o, 'label')}">${s.sub}</div>`; y += 30; }
    if (s.sub2) h += `<div class="abs hero" style="${px(x, y)}font-size:${s.sub2_size ?? 30}px;color:#fff;${anim(t, tin(s, 'sub2_t', s.t0), o, 'hero')}">${s.sub2}</div>`;
    return { front: h };
  },

  // Huge word: "HOÀI NGH<em>I?</em>", "100%", "30–40 PHÚT". style: glow|white. behind: under the person (needs cutouts)
  mega(s, t) {
    const fs = s.size ?? 130, o = out(s);
    let a = anim(t, s.t0, o, 'mega');
    if (s.dim_t && t > s.dim_t) a += `opacity:${lerp(1, s.dim_to ?? .35, prog(t, s.dim_t, .3)).toFixed(2)};`;
    const pos = s.align === 'center' ? `left:0;right:0;text-align:center;top:${s.y ?? 40}px;` : px(s.x ?? 75, s.y ?? 40);
    const h = `<div class="abs mega ${s.style || 'white'}" style="${pos}font-size:${fs}px;transform-origin:${s.align === 'center' ? '50%' : '0'} 60%;${a}">${s.text}</div>`;
    const behind = s.behind && TL.aroll.cutouts;
    return behind ? { back: h, person: true } : { front: h };
  },

  // Counting number: format pct (1%→100%) or clock (00:00:44→04:00:00)
  counter(s, t) {
    const a = tin(s, 't_a', s.t0), b = tin(s, 't_b', s.t1 - .3);
    const k = (E[s.ease || 'inQuad'])(prog(t, a, b - a));
    const v = Math.round(lerp(s.from ?? 1, s.to ?? 100, k));
    const txt = s.format === 'clock' ? `${pad(Math.floor(v / 3600), 2)}:${pad(Math.floor(v / 60) % 60, 2)}:${pad(v % 60, 2)}` : `${v}%`;
    const fs = s.size ?? 190;
    const pulse = s.format !== 'clock' && v === (s.to ?? 100) ? lerp(1.12, 1, E.outCubic(prog(t, b, .25))) : 1;
    return { front: `<div class="abs mega ${s.style || 'glow'}" style="${px(s.x ?? 40, s.y ?? 30)}font-size:${fs}px;transform:scale(${pulse.toFixed(3)});transform-origin:0 60%;${anim(t, s.t0, out(s), 'fade')}">${txt}</div>` };
  },

  question_marks(s, t) {
    const items = s.items || [{ x: 215, y: 240, size: 70 }, { x: 98, y: 445, size: 60 }, { x: 25, y: 395, size: 42 }, { x: 270, y: 380, size: 34 }];
    return { front: items.map((q, i) => `<div class="abs mega" style="${px(q.x, q.y)}font-size:${q.size}px;color:var(--accent);text-shadow:0 4px 14px rgba(0,0,0,.4)"><div style="${anim(t, (q.t ?? s.t0) + i * .12, out(s), 'pop')}"><div style="transform:${bob(t, i * 1.3)}">?</div></div></div>`).join('') };
  },

  pill(s, t) {
    return { front: `<div class="abs pill" style="${px(s.x ?? 75, s.y ?? 374)}transform-origin:0 50%;${anim(t, s.t0, out(s), 'pop')}">${s.text}</div>` };
  },

  stamp(s, t) {
    const shake = t - s.t0 > .22 && t - s.t0 < .34 ? `translateX(${(Math.sin(t * 180) * 2).toFixed(1)}px)` : '';
    return { front: `<div class="abs" style="${px(s.x ?? 235, s.y ?? 470)}transform:rotate(${s.rot ?? -8}deg)"><div class="stamp" style="font-size:${s.size ?? 30}px;${anim(t, s.t0, out(s), 'stamp', shake)}">${s.text || 'TỰ ĐỘNG 100%'}</div></div>` };
  },

  stickers(s, t) {
    // Hype Cam stickers are laid out for 1280x720; in a vertical frame they'd sit off-screen → squeeze x into the frame.
    const [W] = typeof STAGE_WH !== 'undefined' ? STAGE_WH : [1280], maxX = Math.max(0, ...(s.items || []).map(it => it.x + (it.size ?? 70)));
    const fx = maxX > W ? (W - 20) / maxX : 1;
    return { front: (s.items || []).map((it, i) => `<div class="abs" style="${px(it.x * fx, it.y)}${anim(t, it.t ?? s.t0, out(s), 'pop')}"><div style="transform:${bob(t, i * 2.1, 5)}">${emoji(it.e, 0, 0, it.size ?? 70)}</div></div>`).join('') };
  },

  // Bottom waveform strip used in the hook
  waveform_strip(s, t, lt) {
    const n = 150; let b = '';
    for (let i = 0; i < n; i++) {
      const v = .15 + Math.pow(rnd(i * 3 + Math.floor(lt * 8)), 2) * .85, red = Math.abs(i / n - (lt * .35) % 1) < .04 || rnd(i + 500) > .93;
      b += `<i style="display:inline-block;width:3px;margin-right:4.5px;height:${(v * 22).toFixed(0)}px;background:${red ? 'var(--accent)' : '#fff'};opacity:.9;vertical-align:middle"></i>`;
    }
    return { front: `<div class="abs" style="left:75px;top:648px;width:1130px;height:26px;overflow:hidden;white-space:nowrap;${anim(t, s.t0, out(s), 'fade')}">${b}</div>` };
  },

  // Replace background with the red tech wall; person stays on top
  slam_bg(s, t) {
    return { back: techBg(s, t), person: true };
  },

  flash_ring(s, t, lt) {
    const k = prog(lt, 0, s.dur ?? .35), cx = s.cx ?? 690, cy = s.cy ?? 270;
    const r = lerp(40, 900, E.outCubic(k)), w = lerp(28, 4, k);
    return { front: `<div class="full" style="background:#fff;opacity:${lerp(s.flash ?? .85, 0, E.outCubic(k)).toFixed(3)}"></div>
      <div class="abs" style="left:${cx - r}px;top:${cy - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;border:${w.toFixed(1)}px solid #fff;opacity:${(1 - k).toFixed(3)};box-shadow:0 0 30px #fff"></div>` };
  },

  light_leak(s, t, lt) {
    const d = s.t1 - s.t0, k = prog(lt, 0, d), o = Math.sin(Math.PI * k);
    const w = lerp(8, 40, o), x = s.side === 'left' ? 0 : 1280 - w;
    return { front: `<div class="abs" style="left:${x}px;top:0;width:${w.toFixed(1)}px;height:720px;background:linear-gradient(90deg,transparent,rgba(255,110,60,.95),rgba(255,220,190,.9),rgba(255,110,60,.95),transparent);opacity:${o.toFixed(3)};filter:blur(2px)"></div>
      <div class="full" style="background:radial-gradient(ellipse at ${s.side === 'left' ? 0 : 100}% 50%, rgba(255,110,60,${(.35 * o).toFixed(3)}), transparent 45%)"></div>` };
  },

  iris(s, t, lt) {
    const r = lerp(0, 1500, E.inCubic(prog(lt, 0, s.dur ?? .45)));
    const cx = s.cx ?? 735, cy = s.cy ?? 290;
    return { front: `<div class="abs" style="left:${cx - r}px;top:${cy - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:${s.color || '#1a0e0b'}"></div>`, hideCaptions: true };
  },

  ring(s, t) {
    const a = tin(s, 't_a', s.t0 + .2), b = tin(s, 't_b', s.t0 + 1.2);
    const v = Math.round(lerp(s.from ?? 6, s.to ?? 100, E.inQuad(prog(t, a, b - a))));
    const R = 33, C = 2 * Math.PI * R;
    return { front: `<div class="abs" style="${px(s.x ?? 75, s.y ?? 320)}width:84px;height:84px;${anim(t, s.t0, out(s), 'pop')}">
      <svg width="84" height="84" style="position:absolute;transform:rotate(-90deg)"><circle cx="42" cy="42" r="${R}" fill="rgba(0,0,0,.5)" stroke="rgba(255,255,255,.25)" stroke-width="5"/>
      <circle cx="42" cy="42" r="${R}" fill="none" stroke="#F0543A" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - v / 100)).toFixed(1)}"/></svg>
      <div class="full mega" style="display:flex;align-items:center;justify-content:center;font-size:23px;text-transform:none">${v}%</div></div>` };
  },

  compare_bar(s, t) {
    const x = s.x ?? 73, y = s.y ?? 333, o = out(s);
    const sk = E.outCubic(prog(t, tin(s, 'shrink_t', 1e9), .5));
    const w = lerp(s.bottom_w ?? 240, s.bottom_w2 ?? 140, sk);
    return { front: `<div class="abs glassbar" style="${px(x, y)}width:${s.top_w ?? 572}px;transform-origin:0 50%;${anim(t, s.t0, o, 'label')}">${s.top}</div>
      <div class="abs glassbar" style="${px(x, y + 60)}width:${w.toFixed(0)}px;background:var(--accent);font-size:15px;padding:12px 8px;transform-origin:0 50%;${anim(t, tin(s, 'bottom_t', s.t0 + .25), o, 'pop')}">${sk > .5 && s.bottom2 ? s.bottom2 : s.bottom}</div>` };
  },

  // Blurred A-roll + tilted screenshot card + right text column (+ PiP or tag pills)
  ui_showcase(s, t, lt) {
    const back = arollImg(t, GRADES.blur);
    const k = E.outBack(prog(lt, 0, .5), 1.2);
    const cx = lerp(-760, s.card_x ?? 20, k);
    const card = `<div class="abs" style="left:${cx.toFixed(0)}px;top:${s.card_y ?? 70}px;width:${s.card_w ?? 700}px;transform:perspective(1400px) rotateY(${s.rot ?? 12}deg) rotateZ(${s.rotz ?? 2}deg);transform-origin:0 50%">
      <div style="border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 30px 80px rgba(0,0,0,.6)"><img src="${media(s.image, t)}" style="display:block;width:100%"></div></div>`;
    const X = s.text_x ?? 757; let h = card, y = s.text_y ?? 134; const o = out(s);
    if (s.chip) { h += `<div class="abs chip" style="${px(X, y)}${anim(t, tin(s, 'chip_t', s.t0 + .3), o, 'pop')}">● ${s.chip}</div>`; y += 58; }
    if (s.label) { h += `<div class="abs label" style="${px(X, y)}${anim(t, tin(s, 'label_t', s.t0 + .4), o, 'label')}">${s.label}</div>`; y += 46; }
    if (s.hero) { h += `<div class="abs hero" style="${px(X, y)}font-size:${s.hero_size ?? 56}px;${anim(t, tin(s, 'hero_t', s.t0 + .6), o, 'hero')}">${s.hero}</div>`; y += 66; }
    if (s.sub) { h += `<div class="abs label" style="${px(X, y)}${anim(t, tin(s, 'sub_t', s.t0 + .8), o, 'label')}">${s.sub}</div>`; y += 54; }
    if (s.pip) {
      const pk = E.outCubic(prog(t, tin(s, 'pip_t', s.t0 + 1), .35));
      h += `<div class="abs" style="${px(X, y + 16 + (1 - pk) * 40)}width:430px;height:242px;border-radius:8px;overflow:hidden;border:2px solid #fff;opacity:${pk.toFixed(3)}">${arollImg(t)}</div>`;
    }
    (s.tags || []).forEach((g, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      h += `<div class="abs tag" style="${px(X + col * 136, y + 6 + row * 40)}${anim(t, g.t, o, 'pop')}">${g.text}</div>`;
    });
    return { cover: true, back, front: h };
  },

  // Dark panel: title + numbered list (left), "manual editing" window (right), round PiP
  checklist_panel(s, t) {
    const items = s.items || [];
    let act = -1; items.forEach((it, i) => { if (t >= it.t) act = i; });
    let h = `<div class="abs label" style="${px(60, 56)}font-size:32px">${s.label || ''}</div><div class="abs hero" style="${px(60, 96)}font-size:52px">${s.hero || ''}</div>`;
    items.forEach((it, i) => {
      const on = i <= act, cur = i === act;
      const dx = cur ? lerp(0, 12, E.outBack(prog(t, it.t, .3))) : 0;
      h += `<div class="abs" style="${px(60 + dx, 208 + i * 78.5)}display:flex;align-items:center;gap:18px;${anim(t, s.t0 + .1 + i * .06, null, 'label')}">
        <div class="num ${on ? 'on' : ''}" style="${cur ? 'transform:scale(1.05)' : ''}">${pad(i + 1, 2)}</div>
        <div style="font-weight:700;font-size:${cur ? 30 : 29}px;color:${cur ? '#fff' : 'rgba(200,190,186,.55)'}">${it.text}</div></div>`;
    });
    let win = '';
    const it = items[act];
    if (it && it.win) win = WIN[it.win.type](it.win, t, it.t);
    h += `<div class="abs card" style="${px(534, 60)}width:680px;height:460px;overflow:hidden;${anim(t, s.t0 + .2, null, 'fade')}">
      <div style="height:38px;background:rgba(255,255,255,.04);border-bottom:1px solid var(--line);padding:9px 18px;font-weight:600;font-size:15px;color:#d8cfcb">${s.window_title || 'Bàn dựng thủ công'}</div>
      <div style="position:relative;height:422px">${win}</div></div>`;
    h += pipCircle(t, s);
    return { cover: true, back: panelBg(), front: h };
  },

  prompt_box(s, t) {
    const x = s.x ?? 22, y = s.y ?? 286, w = s.w ?? 380, o = out(s);
    const txt = s.text || 'Edit video này một cách xuất sắc nhất';
    const n = Math.floor(txt.length * prog(t, tin(s, 'type_a', s.t0 + .4), tin(s, 'type_b', s.t0 + 1.6) - tin(s, 'type_a', s.t0 + .4)));
    const caret = Math.floor(t * 2.5) % 2 ? '|' : '';
    const pk = prog(t, tin(s, 'progress_a', 1e9), (s.progress_b ?? 1e9) - (s.progress_a ?? 0));
    return { front: `<div class="abs" style="${px(x, y)}width:${w}px;height:66px;border-radius:12px;background:rgba(40,34,32,.6);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.18);${anim(t, s.t0, o, 'pop')};transform-origin:0 50%">
      <div style="position:absolute;left:14px;top:12px;right:56px;font-weight:600;font-size:14px;line-height:1.3">${txt.slice(0, n)}${n < txt.length ? caret : ''}</div>
      <div style="position:absolute;right:12px;top:18px;width:30px;height:30px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px">↑</div></div>
      ${pk > 0 ? `<div class="abs" style="${px(x, y + 76)}width:${(w * pk).toFixed(0)}px;height:5px;border-radius:3px;background:var(--accent);box-shadow:0 0 12px var(--accent)"></div>` : ''}` };
  },

  // Cards orbiting the head on tilted ellipses; outline word then filled word behind the head
  orbit(s, t, lt) {
    const cx = s.cx ?? 690, cy = s.cy ?? 300;
    let back = techBg({ ...s, tiles: null }, t), front = '';
    const ell = (rx, ry, rot) => `<div class="abs" style="left:${cx - rx}px;top:${cy - ry}px;width:${2 * rx}px;height:${2 * ry}px;border-radius:50%;border:2px solid rgba(255,110,70,.75);transform:rotate(${rot}deg);box-shadow:0 0 12px rgba(255,90,50,.5)"></div>`;
    back += ell(520, 210, -8) + ell(420, 150, 10);
    if (s.outline) back += `<div class="abs mega" style="left:0;right:0;top:${s.text_y ?? 48}px;text-align:center;font-size:${s.size ?? 108}px;color:transparent;-webkit-text-stroke:2.5px rgba(255,255,255,.9);${anim(t, s.t0 + .1, tin(s, 'fill_t', null), 'mega')}">${s.outline}</div>`;
    if (s.fill) back += `<div class="abs mega glow" style="left:0;right:0;top:${s.text_y ?? 48}px;text-align:center;font-size:${s.size ?? 108}px;${anim(t, tin(s, 'fill_t', s.t0 + 1.2), out(s), 'mega')}">${s.fill}</div>`;
    const cards = s.cards || [];
    cards.forEach((m, i) => {
      const ang = (i / cards.length) * Math.PI * 2 + lt * (s.speed ?? 1.1);
      const x = cx + Math.cos(ang) * 460 - 70, y = cy + Math.sin(ang) * 170 - 90 - Math.cos(ang) * 40;
      const z = Math.sin(ang), sc = lerp(.8, 1.08, (z + 1) / 2);
      const c = `<div class="abs" style="${px(x.toFixed(0), y.toFixed(0))}width:140px;height:180px;border-radius:10px;overflow:hidden;border:2px solid #fff;transform:scale(${sc.toFixed(3)}) rotate(${(Math.cos(ang) * 10).toFixed(1)}deg);box-shadow:0 10px 30px rgba(0,0,0,.5);${anim(t, s.t0 + i * .1, out(s), 'pop')}"><img class="cover" src="${media(m, t)}"></div>`;
      if (z < 0) back += c; else front += c;
    });
    (s.emoji || ['🚀', '✨', '🎶']).forEach((e, i) => { front += `<div class="abs" style="${px([175, 990, 1225][i % 3], [255, 40, 190][i % 3])}${anim(t, s.t0 + .3 + i * .15, out(s), 'pop')}"><div style="transform:${bob(t, i)}">${emoji(e, 0, 0, 64)}</div></div>`; });
    return { back, front, person: true };
  },

  // mode: sad | happy | mellow
  mood(s, t, lt) {
    if (s.mode === 'happy') {
      let beams = '';
      for (let i = 0; i < 7; i++) {
        const a = -60 + i * 20 + Math.sin(t * 2 + i) * 10;
        beams += `<div class="abs" style="left:640px;top:-40px;width:5px;height:1100px;background:linear-gradient(${i % 2 ? '#4fb3ff' : '#ff8a50'},transparent);transform-origin:50% 0;transform:rotate(${a.toFixed(1)}deg);opacity:.85;filter:blur(1px)"></div>`;
      }
      const ball = `<div class="abs" style="left:80px;top:-10px;width:70px;height:70px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#9aa 40%,#334 100%);box-shadow:0 0 40px #fff"></div>`;
      const floor = `<div class="abs" style="left:-200px;top:560px;width:1700px;height:200px;background:repeating-linear-gradient(90deg,#1d4ed8 0 120px,transparent 120px 170px,#f97316 170px 260px,transparent 260px 330px);transform:perspective(300px) rotateX(55deg);opacity:.8"></div>`;
      const back = `<div class="full" style="background:radial-gradient(ellipse at 50% 30%,#1b2550,#05060f 70%)"></div>${beams}${ball}${floor}`;
      return { back, person: true, front: `<div class="abs mega white" style="${px(s.x ?? 30, s.y ?? 240)}font-size:${s.size ?? 92}px;transform-origin:0 60%;${anim(t, s.t0, out(s), 'mega')}">${s.text || 'VUI!'}</div>` };
    }
    const sad = s.mode === 'sad';
    let fx = '';
    if (sad) fx = `<div class="full" style="background:radial-gradient(ellipse at 55% 45%,transparent 35%,rgba(0,8,20,.7) 100%)"></div>`;
    else for (let i = 0; i < 14; i++) {
      const r = 20 + rnd(i) * 50;
      fx += `<div class="abs" style="${px((rnd(i + 3) * 1280).toFixed(0), ((rnd(i + 9) * 720 - lt * 12) % 720).toFixed(0))}width:${r}px;height:${r}px;border-radius:50%;background:radial-gradient(rgba(255,200,140,.45),transparent 70%)"></div>`;
    }
    const notes = sad ? '' : (s.notes || [[205, 455], [378, 462]]).map((p, i) => `<div class="abs" style="${px(p[0], p[1])}${anim(t, s.t0 + i * .15, out(s), 'pop')}"><div style="transform:${bob(t, i)}">${emoji('🎶', 0, 0, 56)}</div></div>`).join('');
    const color = sad ? 'rgba(235,240,245,.92)' : '#F3D9A4';
    return {
      cover: true,
      back: arollImg(t, sad ? GRADES.sad : GRADES.mellow) + fx,
      front: notes + (s.text ? `<div class="abs serif" style="${px(s.x ?? 410, s.y ?? 290)}font-size:${s.size ?? 66}px;color:${color};text-shadow:0 4px 20px rgba(0,0,0,.5);${anim(t, tin(s, 'text_t', s.t0), out(s), 'hero')}">${s.text}</div>` : ''),
    };
  },

  // 3 vertical columns of B-roll, each switching clip with a stagger
  mosaic(s, t, lt) {
    const cols = s.columns || [];
    const step = s.step ?? .75;
    let h = '';
    cols.forEach((list, c) => {
      const idx = Math.max(0, Math.floor((lt - c * .18) / step)) % list.length;
      const cut = (lt - c * .18) % step;
      const sc = 1.04 + .06 * prog(cut, 0, step);
      const w = 1280 / cols.length;
      h += `<div class="abs" style="left:${(c * w).toFixed(0)}px;top:0;width:${(w - 4).toFixed(0)}px;height:720px;overflow:hidden;background:#000;${anim(t, s.t0 + c * .08, null, 'fade')}">
        <img class="cover" src="${media(list[idx], t)}" style="transform:scale(${sc.toFixed(3)})"></div>`;
    });
    return { cover: true, back: '<div class="full" style="background:#000"></div>', front: h };
  },

  // Tilted wall of many tiles drifting diagonally + center word
  mosaic_wall(s, t, lt) {
    const tiles = s.tiles || [];
    let cells = '';
    for (let i = 0; i < 120; i++) cells += `<div style="position:relative;width:200px;height:130px;border-radius:6px;overflow:hidden;background:#222"><img class="cover" src="${media(tiles[i % Math.max(1, tiles.length)], t)}"></div>`;
    const z = lerp(1.6, 1, E.outCubic(prog(lt, 0, .6)));
    const back = `<div class="full" style="background:#0b0b0b"></div><div class="abs" style="left:-700px;top:-650px;width:2700px;display:flex;flex-wrap:wrap;gap:14px;transform:perspective(1100px) rotateX(22deg) rotateZ(-13deg) scale(${z.toFixed(3)}) translate(${(-lt * 40).toFixed(0)}px,${(-lt * 18).toFixed(0)}px)">${cells}</div>`;
    const word = s.text ? `<div class="abs mega white" style="left:0;right:0;top:${s.y ?? 300}px;text-align:center;font-size:${s.size ?? 68}px;text-shadow:0 6px 30px rgba(0,0,0,.8);${anim(t, tin(s, 'text_t', s.t0 + .4), out(s), 'mega')}">${s.text}</div>` : '';
    return { cover: true, back, front: word };
  },

  // Numbered cards connected by chevrons, last one highlighted, rectangular PiP on the right
  step_cards(s, t) {
    const cards = s.cards || [];
    let h = '';
    const W = 215, H = 300, X0 = 40, GAP = 55;
    cards.forEach((c, i) => {
      const x = X0 + i * (W + GAP) * (s.compact ? .78 : 1), w = s.compact ? 185 : W;
      const hl = s.highlight_t != null && t >= s.highlight_t && i === cards.length - 1;
      const sc = hl ? lerp(1, 1.06, E.outBack(prog(t, s.highlight_t, .3))) : 1;
      const vis = c.images ? c.images.slice(0, 2).map((m, j) => `<div style="position:absolute;left:${10 + j * 55}px;top:${18 + j * 4}px;width:${w * .55}px;height:${w * .62}px;border-radius:6px;overflow:hidden;border:2px solid #fff;transform:rotate(${j ? 0 : -4}deg)"><img class="cover" src="${media(m, t)}"></div>`).join('')
        : `<div style="position:absolute;left:0;right:0;top:20px;display:flex;justify-content:center">${emoji(c.emoji || '⭐', 0, 0, hl ? 86 : 70, 'position:relative')}</div>`;
      h += `<div class="abs card" style="${px(x, 100)}width:${w}px;height:${H}px;transform:scale(${sc.toFixed(3)});${hl ? 'border:2px solid var(--accent);box-shadow:0 0 40px rgba(255,90,50,.6);' : ''}${anim(t, c.t, null, 'pop')}">
        <div style="position:absolute;left:14px;top:10px;color:var(--accent);font-weight:800;font-size:15px">${pad(i + 1, 2)}</div>
        <div style="position:absolute;left:0;right:0;top:30px;height:180px">${vis}</div>
        <div style="position:absolute;left:0;right:0;top:${H - 70}px;text-align:center;font-weight:700;font-size:20px;line-height:1.25">${c.title.replace(/\n/g, '<br>')}</div></div>`;
      if (i < cards.length - 1 && cards[i + 1] && t >= cards[i + 1].t) h += `<div class="abs" style="${px(x + w + 8, 150)}color:var(--accent);font-weight:900;font-size:30px">^</div>`;
    });
    if (s.hero && t >= (s.highlight_t ?? 1e9)) h += `<div class="abs mega glow" style="${px(38, 440)}font-size:${s.hero_size ?? 64}px;${anim(t, s.highlight_t, null, 'hero')}">${s.hero}</div>`;
    h += pipRect(t, s);
    return { cover: true, back: panelBg(), front: h };
  },

  end_card(s, t, lt) {
    const fin = E.outCubic(prog(lt, .1, .6)), fo = 1 - prog(t, s.t1 - (s.fade_out ?? .6), s.fade_out ?? .6);
    return {
      cover: true,
      back: `<div class="full" style="background:radial-gradient(ellipse at 50% 38%, #3d1a10 0, #1a0b07 45%, #070405 100%)"></div>`,
      front: `<div class="full" style="opacity:${fo.toFixed(3)}"><div class="abs" style="left:0;right:0;top:${(296 - (1 - fin) * 14).toFixed(1)}px;text-align:center;opacity:${fin.toFixed(3)}">
        <div style="font-weight:600;font-size:21px;margin-bottom:6px">${s.label || 'Video này được edit'}</div>
        <div style="font-weight:700;font-size:66px;line-height:1.1;background:linear-gradient(90deg,#FFC9AE,#F0543A);-webkit-background-clip:text;background-clip:text;color:transparent">${s.text || '100% BỞI AI'}</div></div></div>
        <div class="full" style="background:#000;opacity:${(1 - fo).toFixed(3)}"></div>`,
    };
  },

  black(s, t, lt) {
    const k = s.fade_in ? prog(lt, 0, s.fade_in) : 1;
    return { front: `<div class="full" style="background:#000;opacity:${k.toFixed(3)}"></div>`, hideCaptions: true };
  },
};

// Content of the "manual editing" window per checklist item
const WIN = {
  waves(w, t, t0) {
    return (w.rows || ['Nhạc 01', 'Nhạc 02', 'Nhạc 03']).map((r, i) => `<div style="position:absolute;left:28px;top:${32 + i * 107}px;width:624px;height:84px;border-radius:10px;background:rgba(255,255,255,.03);${anim(t, t0 + i * .08, null, 'label')}">
      <div style="position:absolute;left:16px;top:30px;font-weight:700;font-size:18px;color:#aaa">${r}</div>
      <div style="position:absolute;left:130px;top:22px;white-space:nowrap;height:40px;line-height:40px">${wavebars(64, i * 70, 18 + 10 * Math.sin(t * 6 + i) ** 2, '#d9472f')}</div></div>`).join('');
  },
  emoji(w, t, t0) {
    return (w.items || ['✨', '💥', '🔥', '🪄', '🎞️', '🎬']).map((e, i) => `<div class="abs" style="${px(70 + (i % 4) * 140, 60 + Math.floor(i / 4) * 130)}${anim(t, t0 + i * .1, null, 'pop')}">${emoji(e, 0, 0, 74)}</div>`).join('');
  },
  trim(w, t, t0) {
    const v = Math.round(lerp(w.from ?? 125, w.to ?? 71, E.outCubic(prog(t, t0 + .3, 1.2))));
    return `<div style="position:absolute;left:28px;top:60px;white-space:nowrap">${wavebars(80, 7, 16, '#e8e2df', 1)}</div>
      <div class="abs mega white" style="${px(30, 170)}font-size:58px;text-transform:none">${v} s <span style="color:var(--accent)">→ ${w.to ?? 71} s</span></div>`;
  },
  strike(w, t, t0) {
    const lines = w.lines || [];
    let h = lines.map((l, i) => {
      const k = E.outCubic(prog(t, t0 + .25 + i * .3, .35));
      return `<div class="abs" style="${px(26, 30 + i * 67)}font-weight:700;font-size:21px;color:#e8e2df;${anim(t, t0 + i * .05, null, 'label')}">${l}
        <div style="position:absolute;left:0;top:50%;height:3px;width:${(k * 100).toFixed(0)}%;background:var(--accent)"></div></div>`;
    }).join('');
    if (w.result) h += `<div class="abs" style="${px(26, 30 + lines.length * 67 + 12)}font-weight:700;font-size:23px;color:var(--hi);${anim(t, t0 + .3 + lines.length * .3, null, 'label')}">→ ${w.result}</div>`;
    return h;
  },
  sfx(w, t, t0) {
    return (w.items || ['whoosh', 'impact', 'pop', 'riser', 'glitch', 'click']).map((n, i) => `<div class="abs" style="${px(28 + (i % 3) * 212, 40 + Math.floor(i / 3) * 140)}width:190px;height:110px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid var(--line);${anim(t, t0 + i * .12, null, 'pop')}">
      <div style="position:absolute;left:14px;top:12px;font-weight:700;font-size:15px">${n}</div>
      <div style="position:absolute;left:14px;top:50px;white-space:nowrap">${wavebars(18, i * 40 + 3, 26, '#e0533a', t >= t0 + i * .12 + .3 ? 1 : .2)}</div></div>`).join('');
  },
};
