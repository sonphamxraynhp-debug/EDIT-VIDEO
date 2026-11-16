// Pack "news" — TV news bulletin look (vertical 9:16 and horizontal 16:9): channel ident, LIVE badge with ticking clock,
// lower-third name bar, BREAKING / TIN NÓNG banner slam, headline card, location map card, pull quote, scrolling ticker.
// Modules news_*: intro, live, lowerthird, breaking, headline, map, quote, ticker. Caption "news". Doc: references/pack-news.md.
// Vertical layout (720×1280): live badge ~y160 · face · cards centred ~y770 · caption ~y872 · ticker 944–1000 (inside the safe zone).
(() => {
  const P = 'news';

  // ---------- palette (TL.brand overrides: primary = news red, dark = navy, accent = gold, secondary = blue, logo, name) ----------
  const N = (s = {}) => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return {
      red: s.color || b.news_red || b.primary || '#D90F1A',
      navy: s.navy || b.dark || '#0A1C44',
      blue: b.secondary || '#1556D8',
      gold: s.accent || b.accent || '#FFC21A',
      font: b.font || "'Be Vietnam Pro',sans-serif",
      disp: b.disp || "'Montserrat','Be Vietnam Pro',sans-serif",
      cond: "'Oswald','Be Vietnam Pro',sans-serif",
      logo: b.logo || '', name: b.name || '',
    };
  };
  const hexA = (h, a) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || ''));
    if (!m) return h;
    let x = m[1];
    if (x.length === 3) x = x.split('').map(ch => ch + ch).join('');
    const n = parseInt(x, 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const f3 = v => (+v).toFixed(3);
  const outK = (s, t, d = .35) => (s.keep ? 0 : clamp(prog(t, s.t1 - d, d)));
    // Logo slot: image / si:slug / emoji, else channel initials on the news red.
  function logoBox(c, logo, name, size, bg) {
    let inner;
    if (logo) inner = slIcon(logo, Math.round(size * .64), 'white');
    else {
      // "TIN TỨC 24H" → "TT" over "24H": letters of the word initials, numbers kept whole on a second line.
      const ws = String(name || 'TV').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean);
      const ini = ws.filter(w => !/^\d/.test(w)).map(w => w[0]).join('').slice(0, 3).toUpperCase() || 'TV', num = (ws.find(w => /^\d/.test(w)) || '').slice(0, 4).toUpperCase();
      inner = `<div style="text-align:center;color:#fff;font-family:${c.disp};font-weight:900;line-height:.95"><div style="font-size:${Math.round(size * (ini.length > 2 ? .3 : .38))}px;letter-spacing:-.02em">${esc(ini)}</div>
        ${num ? `<div style="margin-top:${Math.round(size * .04)}px;font-size:${Math.round(size * .2)}px;padding:${Math.round(size * .02)}px ${Math.round(size * .06)}px;background:#fff;color:${bg || c.red};letter-spacing:.02em">${esc(num)}</div>` : ''}</div>`;
    }
    return `<div style="flex:none;width:${size}px;height:${size}px;background:${bg || c.red};display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative">${inner}</div>`;
  }
  const clipR = k => `clip-path:inset(0 ${((1 - clamp(k)) * 100).toFixed(2)}% 0 0)`;
  const clipL = k => `clip-path:inset(0 0 0 ${(clamp(k) * 100).toFixed(2)}%)`;
  // Anchor helpers: left-anchored (x = left edge, y = vertical centre) or centred (x, y = centre). size = scale %.
  const leftRoot = (s, x, y, inner, extra = '') => `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translateY(-50%) scale(${f3((s.size ?? 100) / 100)});transform-origin:0 50%;${extra}">${inner}</div>`;
  const midRoot = (s, x, y, inner, extra = '') => `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) scale(${f3((s.size ?? 100) / 100)});transform-origin:50% 50%;${extra}">${inner}</div>`;
  const D = () => { const [W, H] = DIMS(); return { W, H, v: VERT() }; };

  const MOD = {
    // 1. Channel ident (cover): { channel, name (program), sub, logo, dur }  ~2 s; last 0.4 s wipes to the video.
    news_intro(s, t, lt) {
      const c = N(s), { W, H, v } = D();
      const d = s.t1 - s.t0, ko = clamp(prog(lt, d - .42, .42)), ke = E.inOutSine(ko);
      const chan = s.channel || c.name || 'TIN TỨC 24H', prog_ = s.name || 'BẢN TIN 60 GIÂY';
      const cx = W / 2, cy = H * (v ? .44 : .44), R = v ? 300 : 260;
      // Rotating globe meridians + latitude lines.
      let globe = '';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI + lt * .6, rx = Math.abs(Math.cos(a)) * R;
        globe += `<ellipse cx="${cx}" cy="${cy}" rx="${rx.toFixed(1)}" ry="${R}" fill="none" stroke="rgba(120,170,255,.22)" stroke-width="1.5"/>`;
      }
      for (let j = -2; j <= 2; j++) { const yy = cy + j * R * .38, rr = Math.sqrt(Math.max(0, R * R - (j * R * .38) ** 2)); globe += `<ellipse cx="${cx}" cy="${yy}" rx="${rr.toFixed(1)}" ry="${(rr * .16).toFixed(1)}" fill="none" stroke="rgba(120,170,255,.16)" stroke-width="1.2"/>`; }
      globe += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(140,190,255,.35)" stroke-width="2"/>`;
      const kg = E.outCubic(prog(lt, 0, .6));
      const band = E.inOutSine(prog(lt, .05, .6));
      const kl = E.outBack(prog(lt, .25, .45), 1.8), kshine = prog(lt, .75, .45);
      const kn = E.outExpo(prog(lt, .7, .5)), ksub = E.outCubic(prog(lt, 1, .4));
      const ls = v ? 150 : 128;
      const sweep = (lt * 520) % (W + 600) - 300;
      const logo = `<div style="position:relative;width:${ls}px;height:${ls}px;margin:0 auto;transform:scale(${clamp(kl, 0, 1.25).toFixed(3)}) rotate(${((1 - clamp(kl)) * -25).toFixed(1)}deg);
        box-shadow:0 20px 50px rgba(0,0,0,.5),0 0 0 4px rgba(255,255,255,.9);overflow:hidden">${logoBox(c, s.logo || c.logo, chan, ls)}
        <div style="position:absolute;top:-20%;bottom:-20%;width:40%;left:${lerp(-60, 140, kshine).toFixed(1)}%;transform:skewX(-20deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent)"></div></div>`;
      const text = `<div style="margin-top:${v ? 34 : 24}px;font:900 ${v ? 44 : 40}px/1.25 ${c.disp};letter-spacing:.06em;color:#fff;white-space:nowrap;opacity:${clamp(kn * 1.5).toFixed(3)};
          transform:translateY(${((1 - kn) * 30).toFixed(1)}px);text-shadow:0 4px 20px rgba(0,0,0,.5)">${esc(chan)}</div>
        <div style="display:inline-block;margin-top:12px;padding:6px 26px;background:${c.gold};color:${c.navy};font:800 ${v ? 30 : 26}px/1.35 ${c.disp};letter-spacing:.04em;white-space:nowrap;${clipR(kn)}">${esc(prog_)}</div>
        ${s.sub ? `<div style="margin-top:14px;font:600 ${v ? 22 : 20}px/1.4 ${c.font};color:rgba(255,255,255,.85);letter-spacing:.08em;white-space:nowrap;opacity:${ksub.toFixed(3)}">${esc(s.sub)}</div>` : ''}`;
      const scene = `<div class="full" style="background:radial-gradient(circle at 50% 42%,${c.blue} 0%,${c.navy} 55%,#040A1C 100%)"></div>
        <svg class="full" viewBox="0 0 ${W} ${H}" style="opacity:${kg.toFixed(3)}">${globe}</svg>
        <div class="abs" style="left:${sweep}px;top:-20%;width:200px;height:140%;transform:rotate(18deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent)"></div>
        <div class="abs" style="left:-10%;right:-10%;top:${(cy + R * .95).toFixed(0)}px;height:${v ? 18 : 14}px;background:${c.red};transform:translateX(${((1 - band) * -120).toFixed(1)}%) skewX(-20deg)"></div>
        <div class="abs" style="left:-10%;right:-10%;top:${(cy + R * .95 + (v ? 26 : 20)).toFixed(0)}px;height:${v ? 6 : 5}px;background:${c.gold};transform:translateX(${((1 - band) * 120).toFixed(1)}%) skewX(-20deg)"></div>
        <div class="abs" style="left:0;right:0;top:${(cy - ls / 2 - (v ? 30 : 30)).toFixed(0)}px;text-align:center">${logo}${text}</div>`;
      const exitBar = ko > 0 ? `<div class="abs" style="top:0;bottom:0;width:${v ? 26 : 30}px;left:${(ke * W - 13).toFixed(1)}px;background:${c.red};box-shadow:0 0 30px ${hexA(c.red, .8)}"></div>` : '';
      return { cover: ko <= 0, hideCaptions: true, front: `<div class="full"${cidOf(s)} style="${ko > 0 ? clipL(ke) : ''}">${scene}</div>${exitBar}` };
    },

    // 2. LIVE badge + ticking clock: { label:'TRỰC TIẾP', clock:'20:15:00', place, logo, x (left), y (centre), size }
    news_live(s, t, lt) {
      const c = N(s), { v } = D();
      const ki = E.outBack(prog(lt, 0, .4), 1.8), kc = E.outCubic(prog(lt, .2, .4)), ko = outK(s, t);
      const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s.clock || '20:00:00') || [0, 20, 0, 0];
      const sec = (+m[1] * 3600 + +m[2] * 60 + +(m[3] || 0) + Math.floor(Math.max(0, lt)) + 86400) % 86400;
      const hh = String(Math.floor(sec / 3600)).padStart(2, '0'), mm = String(Math.floor(sec / 60) % 60).padStart(2, '0'), ss = String(sec % 60).padStart(2, '0');
      const dot = .55 + .45 * Math.abs(Math.sin(lt * Math.PI));
      const h = v ? 46 : 40, fs = v ? 22 : 19;
      const logo = (s.logo || c.logo) ? `<div style="margin-right:8px">${logoBox(c, s.logo || c.logo, c.name, h, c.navy)}</div>` : '';
      const html = `<div style="display:flex;align-items:stretch;height:${h}px;font-family:${c.disp};opacity:${(1 - ko).toFixed(3)}">${logo}
        <div style="display:flex;align-items:center;gap:10px;padding:0 16px;background:${c.red};color:#fff;font-weight:900;font-size:${fs}px;letter-spacing:.06em;white-space:nowrap;
          transform:scale(${clamp(ki, 0, 1.2).toFixed(3)});transform-origin:0 50%;box-shadow:0 6px 18px rgba(0,0,0,.35)">
          <span style="width:12px;height:12px;border-radius:50%;background:#fff;opacity:${dot.toFixed(2)};box-shadow:0 0 ${(dot * 12).toFixed(1)}px #fff"></span>${esc(s.label || 'TRỰC TIẾP')}</div>
        <div style="display:flex;align-items:center;padding:0 14px;background:${hexA(c.navy, .92)};color:#fff;font:600 ${fs + 2}px/1 ${c.cond};letter-spacing:.05em;font-variant-numeric:tabular-nums;white-space:nowrap;${clipR(kc)}">${hh}:${mm}<span style="opacity:.75">:${ss}</span></div>
        ${s.place ? `<div style="display:flex;align-items:center;padding:0 14px;background:rgba(255,255,255,.92);color:${c.navy};font-weight:800;font-size:${fs - 2}px;letter-spacing:.08em;white-space:nowrap;${clipR(prog(lt, .35, .4))}">${esc(s.place)}</div>` : ''}</div>`;
      return { front: leftRoot(s, s.x ?? (v ? 30 : 36), s.y ?? (v ? 162 : 46), html) };
    },

    // 3. Lower third: { name, title, tag, logo, x (left edge), y (centre), size }
    news_lowerthird(s, t, lt) {
      const c = N(s), { v } = D();
      const ko = outK(s, t), kl = E.outBack(prog(lt, 0, .35), 1.6), ks = E.outExpo(prog(lt, .1, .4));
      const kn = E.outExpo(prog(lt, .18, .45)) * (1 - E.inCubic(ko)), kt = E.outExpo(prog(lt, .32, .45)) * (1 - E.inCubic(ko));
      const ls = v ? 104 : 92;
      const name = s.name || 'Nguyễn Văn A', title = s.title || 'Phóng viên';
      const nfs = Math.round((v ? 34 : 30) * (name.length > 22 ? .82 : 1));
      const html = `<div style="display:flex;align-items:stretch;opacity:${(1 - ko * ko).toFixed(3)}">
        <div style="transform:perspective(500px) rotateY(${((1 - clamp(kl)) * 90).toFixed(1)}deg) scale(${clamp(kl, 0, 1.15).toFixed(3)});transform-origin:100% 50%;box-shadow:0 10px 26px rgba(0,0,0,.4)">${logoBox(c, s.logo || c.logo, c.name || name, ls)}</div>
        <div style="width:8px;background:${c.gold};transform:scaleY(${ks.toFixed(3)})"></div>
        <div style="display:flex;flex-direction:column;justify-content:center">
          ${s.tag ? `<div style="align-self:flex-start;padding:2px 12px;background:${c.gold};color:${c.navy};font:800 ${v ? 15 : 14}px/1.45 ${c.disp};letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;${clipR(kn)}">${esc(s.tag)}</div>` : ''}
          <div style="padding:${v ? 8 : 6}px 26px ${v ? 6 : 4}px 20px;background:#fff;color:${c.navy};font:900 ${nfs}px/1.3 ${c.disp};white-space:nowrap;text-transform:uppercase;letter-spacing:.01em;
            box-shadow:0 8px 22px rgba(0,0,0,.3);${clipR(kn)}"><span style="display:inline-block;transform:translateX(${((1 - kn) * -30).toFixed(1)}px)">${esc(name)}</span></div>
          <div style="align-self:flex-start;padding:${v ? 6 : 5}px 22px ${v ? 7 : 6}px 20px;background:linear-gradient(90deg,${c.navy},${hexA(c.navy, .88)});color:#fff;font:600 ${v ? 22 : 19}px/1.35 ${c.font};
            white-space:nowrap;${clipR(kt)}">${esc(title)}</div></div></div>`;
      return { front: leftRoot(s, s.x ?? (v ? 26 : 50), s.y ?? (v ? 792 : 548), html) };
    },

    // 4. Breaking banner slam: { label:'TIN NÓNG', sub:'BREAKING NEWS', text, y (band centre), size, siren:true }
    news_breaking(s, t, lt) {
      const c = N(s), { W, H, v } = D();
      const ko = outK(s, t, .3), k = (s.size ?? 100) / 100;
      const y = s.y ?? (v ? 330 : 300), bh = (v ? 132 : 118) * k;
      const kb = E.outExpo(prog(lt, 0, .22)), ks = prog(lt, .12, .26), kse = E.outBack(ks, 1.4);
      const shake = lt > .34 && lt < .8 ? Math.sin(lt * 70) * 9 * (1 - prog(lt, .34, .46)) : 0;
      const ksub = E.outExpo(prog(lt, .4, .4)), ktx = E.outExpo(prog(lt, .55, .45));
      const pulse = .5 + .5 * Math.sin(lt * 11);
      const flash = lt > .3 && lt < .55 ? (1 - prog(lt, .3, .25)) * .55 : 0;
      const label = s.label || 'TIN NÓNG', fs = Math.round((v ? 84 : 78) * k * (label.length > 10 ? .8 : 1));
      const siren = s.siren === false ? '' : `<div class="full" style="pointer-events:none;box-shadow:inset 0 0 ${(90 + pulse * 70).toFixed(0)}px ${hexA(c.red, .35 + pulse * .3)}"></div>
        <div class="abs" style="left:-25%;top:-15%;width:60%;height:45%;background:radial-gradient(circle,${hexA(c.red, .45 * pulse)},transparent 65%)"></div>
        <div class="abs" style="right:-25%;top:-15%;width:60%;height:45%;background:radial-gradient(circle,${hexA('#2A6BFF', .4 * (1 - pulse))},transparent 65%)"></div>`;
      const em = (side) => `<div class="abs" style="${side}:${v ? 18 : 60}px;top:${(bh / 2 - 34 * k).toFixed(1)}px;width:${68 * k}px;height:${68 * k}px;transform:scale(${(clamp(kse, 0, 1.3) * (1 + .08 * pulse)).toFixed(3)})">${emoji('🚨', 0, 0, 68 * k, 'position:absolute')}</div>`;
      const band = `<div class="abs" style="left:0;right:0;top:${(y - bh / 2).toFixed(1)}px;height:${bh.toFixed(1)}px;transform:scaleY(${kb.toFixed(3)}) translateX(${shake.toFixed(1)}px);
          background:repeating-linear-gradient(-45deg,${c.red} 0 28px,${hexA('#8E0610', 1)} 28px 56px);background-size:79.2px 79.2px;background-position:${(lt * 90).toFixed(1)}px 0;
          border-top:4px solid ${c.gold};border-bottom:4px solid ${c.gold};box-shadow:0 18px 40px rgba(0,0,0,.45)">
          <div class="full" style="background:linear-gradient(180deg,rgba(255,255,255,.18),transparent 45%,rgba(0,0,0,.25))"></div>
          ${em('left')}${em('right')}
          <div class="abs" style="left:0;right:0;top:50%;text-align:center;transform:translateY(-50%) scale(${lerp(2.4, 1, clamp(kse, 0, 1.08)).toFixed(3)});opacity:${clamp(ks * 3).toFixed(3)};
            filter:blur(${((1 - clamp(ks * 1.6)) * 10).toFixed(1)}px);font:900 italic ${fs}px/1.12 ${c.disp};color:#fff;letter-spacing:.02em;white-space:nowrap;
            text-shadow:0 5px 0 rgba(0,0,0,.35),0 0 26px rgba(255,255,255,.35)">${esc(label)}</div></div>`;
      const sub = `<div class="abs" style="left:${v ? 40 : 120}px;top:${(y - bh / 2 - (v ? 40 : 36) * k).toFixed(1)}px;padding:4px 16px;background:${c.navy};color:${c.gold};
          font:800 ${Math.round((v ? 20 : 18) * k)}px/1.35 ${c.disp};letter-spacing:.2em;white-space:nowrap;${clipR(ksub)}">${esc(s.sub || 'BREAKING NEWS')}</div>`;
      const txt = s.text ? `<div class="abs" style="left:${v ? 24 : 120}px;right:${v ? 24 : 120}px;top:${(y + bh / 2 + 10).toFixed(1)}px;padding:${v ? 12 : 10}px 20px;background:#fff;color:${c.navy};
          font:800 ${Math.round((v ? 28 : 26) * k)}px/1.32 ${c.disp};text-align:center;box-shadow:0 12px 28px rgba(0,0,0,.35);${clipR(ktx)}">${esc(s.text)}</div>` : '';
      return {
        front: `<div class="full"${cidOf(s)} style="opacity:${(1 - ko).toFixed(3)};pointer-events:none">${siren}
          <div class="full" style="background:#fff;opacity:${flash.toFixed(3)}"></div>${band}${sub}${txt}</div>`,
      };
    },

    // 5. Headline card: { tag:'CÔNG NGHỆ', text, sub, x, y (centre), size, w }
    news_headline(s, t, lt) {
      const c = N(s), { W, v } = D();
      const ko = outK(s, t), w = s.w || (v ? 650 : 760);
      const kw = E.outExpo(prog(lt, 0, .45)), kt = E.outBack(prog(lt, .25, .35), 2.2), kx = E.outCubic(prog(lt, .3, .45)), ku = E.inOutSine(prog(lt, .5, .8));
      const text = s.text || 'Tiêu đề bản tin', fs = s.text_size || Math.round((v ? 36 : 34) * (text.length > 70 ? .8 : text.length > 45 ? .9 : 1));
      const html = `<div style="position:relative;width:${w}px;opacity:${(1 - ko).toFixed(3)};transform:translateY(${(ko * 30).toFixed(1)}px)">
        ${s.tag ? `<div style="position:absolute;left:22px;top:-20px;z-index:2;padding:4px 16px;background:${c.red};color:#fff;font:800 ${v ? 18 : 16}px/1.4 ${c.disp};letter-spacing:.12em;text-transform:uppercase;
          white-space:nowrap;transform:scale(${clamp(kt, 0, 1.2).toFixed(3)});transform-origin:0 50%;box-shadow:0 6px 14px rgba(0,0,0,.35)">${esc(s.tag)}</div>` : ''}
        <div style="position:relative;padding:${s.tag ? 30 : 22}px 26px 22px 34px;background:linear-gradient(120deg,${hexA(c.navy, .96)},${hexA(c.blue, .92)});box-shadow:0 20px 44px rgba(0,0,0,.45);${clipR(kw)}">
          <div style="position:absolute;left:0;top:0;bottom:0;width:10px;background:${c.red}"></div>
          <div style="font:900 ${fs}px/1.24 ${c.disp};color:#fff;letter-spacing:-.005em;opacity:${kx.toFixed(3)};transform:translateY(${((1 - kx) * 16).toFixed(1)}px)">${esc(text)}</div>
          ${s.sub ? `<div style="margin-top:8px;font:600 ${v ? 21 : 19}px/1.4 ${c.font};color:${c.gold};opacity:${kx.toFixed(3)}">${esc(s.sub)}</div>` : ''}
          <div style="margin-top:14px;height:4px;width:${(ku * 100).toFixed(1)}%;background:linear-gradient(90deg,${c.red},${c.gold})"></div></div></div>`;
      return { front: midRoot(s, s.x ?? W / 2, s.y ?? (v ? 760 : 520), html) };
    },

    // 6. Location card with a stylised map + dropping pin: { place, sub, label:'ĐỊA ĐIỂM', coord, x, y, size }
    news_map(s, t, lt) {
      const c = N(s), { W, v } = D();
      const ko = outK(s, t), kw = E.outExpo(prog(lt, 0, .45)), kz = E.outCubic(prog(lt, 0, 1.6));
      const kp = E.outBack(prog(lt, .45, .45), 2.4), kpin = prog(lt, .45, .3), kt = E.outExpo(prog(lt, .6, .45));
      const M = v ? 210 : 190, seed = (s.seed ?? 3);
      // Stylised map: water, land masses, blocks, roads, a river; pin at the centre.
      const land = `<path d="M-10,${M * .18} C${M * .2},${M * .1} ${M * .35},${M * .3} ${M * .55},${M * .22} S${M * .9},${M * .05} ${M + 10},${M * .16} L${M + 10},${M + 10} L-10,${M + 10} Z" fill="#1B3D6E"/>
        <path d="M-10,${M * .62} C${M * .25},${M * .5} ${M * .45},${M * .78} ${M * .7},${M * .66} S${M},${M * .7} ${M + 10},${M * .6}" fill="none" stroke="#2E7BD6" stroke-width="${M * .06}" stroke-linecap="round" opacity=".9"/>`;
      let roads = '';
      for (let i = 0; i < 6; i++) {
        const a = rnd(seed + i) * M, b = rnd(seed + i + 9) * M;
        roads += `<path d="M${a.toFixed(0)},${M * .2} L${b.toFixed(0)},${M}" stroke="rgba(255,255,255,.22)" stroke-width="${i % 2 ? 2 : 3.5}"/>`;
        roads += `<path d="M0,${(M * .25 + rnd(seed + i + 20) * M * .75).toFixed(0)} L${M},${(M * .25 + rnd(seed + i + 30) * M * .75).toFixed(0)}" stroke="rgba(255,255,255,.14)" stroke-width="2"/>`;
      }
      const grid = Array.from({ length: 7 }, (_, i) => `<path d="M${i * M / 6},0 V${M} M0,${i * M / 6} H${M}" stroke="rgba(120,170,255,.12)" stroke-width="1"/>`).join('');
      const pr = (lt * .9) % 1;
      const pin = `<g transform="translate(${M / 2},${M * .48})">
        <ellipse cx="0" cy="2" rx="${(14 * clamp(kp, 0, 1.2)).toFixed(1)}" ry="${(5 * clamp(kp, 0, 1.2)).toFixed(1)}" fill="rgba(0,0,0,.45)"/>
        <circle r="${(10 + pr * 46).toFixed(1)}" fill="none" stroke="${c.red}" stroke-width="3" opacity="${((1 - pr) * clamp(kpin * 2)).toFixed(2)}"/>
        <g transform="translate(0,${((1 - clamp(kpin * 1.4)) * -70).toFixed(1)}) scale(${clamp(kp, 0, 1.3).toFixed(3)})">
          <path d="M0,0 C-6,-12 -20,-22 -20,-36 A20,20 0 1 1 20,-36 C20,-22 6,-12 0,0Z" fill="${c.red}" stroke="#fff" stroke-width="3"/>
          <circle cx="0" cy="-36" r="7.5" fill="#fff"/></g></g>`;
      const map = `<div style="flex:none;width:${M}px;height:${M}px;overflow:hidden;background:#0D2347;position:relative">
        <svg viewBox="0 0 ${M} ${M}" width="${M}" height="${M}" style="transform:scale(${lerp(1.5, 1, kz).toFixed(3)});transform-origin:50% 48%">${grid}${land}${roads}</svg>
        <svg viewBox="0 0 ${M} ${M}" width="${M}" height="${M}" style="position:absolute;inset:0;overflow:visible">${pin}</svg></div>`;
      const place = s.place || 'Hà Nội', pfs = Math.round((v ? 40 : 36) * (place.length > 16 ? .78 : 1));
      const info = `<div style="flex:1;min-width:0;padding:${v ? 22 : 18}px 26px;display:flex;flex-direction:column;justify-content:center;opacity:${kt.toFixed(3)};transform:translateX(${((1 - kt) * 24).toFixed(1)}px)">
        <div style="align-self:flex-start;padding:3px 12px;background:${c.red};color:#fff;font:800 ${v ? 16 : 15}px/1.4 ${c.disp};letter-spacing:.14em;white-space:nowrap">📍 ${esc(s.label || 'ĐỊA ĐIỂM')}</div>
        <div style="margin-top:10px;font:900 ${pfs}px/1.2 ${c.disp};color:${c.navy};text-transform:uppercase">${esc(place)}</div>
        ${s.sub ? `<div style="margin-top:4px;font:600 ${v ? 21 : 19}px/1.35 ${c.font};color:#46536B">${esc(s.sub)}</div>` : ''}
        ${s.coord ? `<div style="margin-top:8px;font:600 ${v ? 17 : 15}px/1 ${c.cond};color:${c.blue};letter-spacing:.06em">${esc(s.coord)}</div>` : ''}</div>`;
      const html = `<div style="display:flex;width:${v ? 640 : 600}px;background:#fff;box-shadow:0 22px 50px rgba(0,0,0,.45);border-bottom:6px solid ${c.red};opacity:${(1 - ko).toFixed(3)};${clipR(kw)}">${map}${info}</div>`;
      return { front: midRoot(s, s.x ?? W / 2, s.y ?? (v ? 752 : 470), html) };
    },

    // 7. Pull quote: { text, source, role, avatar, x, y, size, w }  (hides captions by default: the quote is the speech)
    news_quote(s, t, lt) {
      const c = N(s), { W, v } = D();
      const ko = outK(s, t), w = s.w || (v ? 640 : 720);
      const kc = E.outBack(prog(lt, 0, .45), 1.4), km = E.outBack(prog(lt, .15, .4), 2.4), kl = E.outExpo(prog(lt, .4, .6));
      const words = String(s.text || 'Câu trích dẫn quan trọng.').split(/\s+/), nW = words.length;
      const body = words.map((x, i) => `<span style="opacity:${(.12 + .88 * clamp(prog(lt, .25 + i / nW * Math.min(1.4, nW * .07), .2))).toFixed(2)}">${esc(x)}</span>`).join(' ');
      const fs = s.text_size || Math.round((v ? 30 : 28) * ((s.text || '').length > 110 ? .85 : 1));
      const av = s.avatar ? `<div style="flex:none;width:58px;height:58px;border-radius:50%;overflow:hidden;border:3px solid ${c.red}"><img src="${url(s.avatar)}" style="width:100%;height:100%;object-fit:cover"></div>` : '';
      const html = `<div style="position:relative;width:${w}px;padding:${v ? 44 : 38}px 34px 26px;background:#fff;box-shadow:0 24px 54px rgba(0,0,0,.45);border-top:8px solid ${c.red};
          opacity:${(clamp(kc * 2) * (1 - ko)).toFixed(3)};transform:translateY(${((1 - clamp(kc, 0, 1.05)) * 40).toFixed(1)}px)">
        <div style="position:absolute;left:24px;top:-46px;width:84px;height:84px;background:${c.red};display:flex;align-items:center;justify-content:center;transform:scale(${clamp(km, 0, 1.3).toFixed(3)}) rotate(-6deg);
          box-shadow:0 10px 22px rgba(0,0,0,.35)"><span style="font:900 92px/1 Georgia,serif;color:#fff;margin-top:34px">“</span></div>
        <div style="font:700 italic ${fs}px/1.42 ${c.font};color:${c.navy}">${body}</div>
        <div style="margin-top:16px;height:3px;width:${(kl * 100).toFixed(1)}%;background:linear-gradient(90deg,${c.red},${c.gold})"></div>
        <div style="margin-top:14px;display:flex;align-items:center;gap:14px;opacity:${kl.toFixed(3)}">${av}
          <div><div style="font:900 ${v ? 22 : 20}px/1.3 ${c.disp};color:${c.navy};text-transform:uppercase;white-space:nowrap">${esc(s.source || 'Nguồn trích dẫn')}</div>
          ${s.role ? `<div style="font:600 ${v ? 17 : 16}px/1.35 ${c.font};color:#5A6478">${esc(s.role)}</div>` : ''}</div></div></div>`;
      return { hideCaptions: s.hideCaptions ?? true, front: midRoot(s, s.x ?? W / 2, s.y ?? (v ? 786 : 360), html) };
    },

    // 8. Scrolling ticker: { label:'TIN NÓNG', items:[…], speed (px/s), y (bar centre), right (text, e.g. channel), logo }
    news_ticker(s, t, lt) {
      const c = N(s), { W, H, v } = D();
      const h = s.h || (v ? 56 : 50), y = s.y ?? (v ? 972 : H - h / 2), k = (s.size ?? 100) / 100;
      const ki = E.outExpo(prog(lt, 0, .45)), kl = E.outExpo(prog(lt, .15, .45)), ko = outK(s, t);
      const items = (s.items && s.items.length ? s.items : ['Tin mới cập nhật liên tục', 'Theo dõi kênh để không bỏ lỡ']).map(String);
      const fs = Math.round(h * .42), sep = `<span style="display:inline-block;width:${fs * .5}px;height:${fs * .5}px;background:${c.red};transform:rotate(45deg);margin:0 ${fs * .9}px;vertical-align:.12em"></span>`;
      const one = items.map(x => `<span>${esc(x)}</span>`).join(sep) + sep;
      // One copy must cover the bar: estimate its width, repeat inside the copy, then loop the 2-copy strip with a paused CSS animation (exact seam).
      const est = items.reduce((a, x) => a + x.length * fs * .54, 0) + items.length * fs * 2.4;
      const rep = Math.max(1, Math.ceil(W * 1.15 / Math.max(1, est)));
      const copy = one.repeat(rep), dur = Math.max(2, est * rep / (s.speed || 110));
      const delay = (Math.max(0, lt - .3) % dur);
      const label = s.label || 'TIN NÓNG', lw = Math.round(label.length * fs * .82 + 54);
      const right = s.right ?? (c.name || '');
      const html = `<style>@keyframes nwsTick{from{transform:translateX(0)}to{transform:translateX(-50%)}}</style>
        <div class="abs"${cidOf(s)} style="left:0;width:${W}px;top:${(y - h / 2).toFixed(1)}px;height:${h}px;transform:translateY(${((1 - ki) * (h + 30)).toFixed(1)}px) scaleY(${k.toFixed(3)});
          opacity:${(1 - ko).toFixed(3)};display:flex;box-shadow:0 -6px 24px rgba(0,0,0,.35)">
          <div style="position:relative;flex:none;width:${lw}px;z-index:2;background:${c.red};color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;
            font:900 italic ${fs + 2}px/1 ${c.disp};letter-spacing:.03em;white-space:nowrap;clip-path:polygon(0 0,100% 0,${(lw - 18)}px 100%,0 100%);transform:translateX(${((1 - kl) * -lw).toFixed(1)}px)">
            <span style="width:9px;height:9px;border-radius:50%;background:#fff;opacity:${(.5 + .5 * Math.abs(Math.sin(lt * 3))).toFixed(2)}"></span>${esc(label)}</div>
          <div style="position:relative;flex:1;min-width:0;overflow:hidden;background:#fff;margin-left:-18px;display:flex;align-items:center;border-top:3px solid ${c.gold}">
            <div style="display:inline-flex;white-space:nowrap;padding-left:30px;font:700 ${fs}px/1 ${c.font};color:${c.navy};animation:nwsTick ${dur.toFixed(3)}s linear infinite;
              animation-play-state:paused;animation-delay:-${delay.toFixed(3)}s"><span style="padding-right:0">${copy}</span><span>${copy}</span></div></div>
          ${right ? `<div style="flex:none;padding:0 16px;background:${c.navy};color:#fff;display:flex;align-items:center;gap:8px;font:800 ${fs - 2}px/1 ${c.disp};letter-spacing:.06em;white-space:nowrap;border-top:3px solid ${c.gold}">
            ${(s.logo || c.logo) ? slIcon(s.logo || c.logo, fs + 6, 'white') : ''}${esc(right)}</div>` : ''}</div>`;
      return { front: html };
    },
  };
  Object.assign(MODULES, MOD);

  // ---------- caption "news": one line on a navy band with a red tab, current word gold, hl words underlined red ----------
  CAPTION_STYLES.news = (cap, t) => {
    const c = N(), { W, v } = D();
    const size = cap.size || (v ? 30 : 28);
    const top = cap.y ?? (v ? 868 : 606);
    const dx = (cap.x ?? W / 2) - W / 2;
    let cur = -1;
    cap.words.forEach((w, i) => { if (t >= w.s - .03) cur = i; });
    const kin = E.outCubic(prog(t, cap.t0, .14));
    const html = cap.words.map((w, i) => {
      const on = i === cur && t < (w.e ?? w.s + .4) + .12;
      if (w.hl) return `<span style="color:#fff;background:${c.red};padding:0 .2em;border-radius:3px">${esc(w.w)}</span>`;
      return `<span style="${on ? `color:${c.gold};` : ''}">${esc(w.w)}</span>`;
    }).join(' ');
    return `<div id="cap"${cidOf(cap)} style="position:absolute;top:${top}px;left:${24 + dx}px;right:${24 - dx}px;text-align:center;white-space:normal;pointer-events:none">
      <div style="display:inline-block;max-width:100%;position:relative;padding:${Math.round(size * .26)}px ${Math.round(size * .6)}px ${Math.round(size * .3)}px ${Math.round(size * .8)}px;
        background:${hexA(c.navy, .9)};box-shadow:0 8px 22px rgba(0,0,0,.35);font-family:${cap.font || c.font};font-weight:${cap.weight || 700};font-size:${size}px;line-height:1.32;
        color:${cap.color || '#fff'};text-shadow:0 2px 4px rgba(0,0,0,.4);clip-path:inset(0 ${((1 - kin) * 100).toFixed(1)}% 0 0)">
        <span style="position:absolute;left:0;top:0;bottom:0;width:${Math.round(size * .26)}px;background:${c.red}"></span>${html}</div></div>`;
  };

  // ---------- Studio metadata ----------
  const V = () => VERT();
  const capText = (caps, from, n = 2) => {
    const i = (caps || []).findIndex(c => c.t1 > from);
    return i < 0 ? '' : caps.slice(i, i + n).map(c => c.words.map(w => w.w).join(' ')).join(' ').trim();
  };
  const upFirst = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
  // Keyword finder for recipes: accent-SENSITIVE (so "đăng" ≠ "đang"), also matches inside multi-word tokens ("gây shock").
  const findAny = (caps, needles, after = 0) => {
    const nz = x => ' ' + String(x).normalize('NFC').toLowerCase().replace(/[.,!?;:"“”…]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    const ws = (caps || []).flatMap(c => c.words).filter(w => w.s >= after);
    for (let i = 0; i < ws.length; i++) {
      const win = nz(ws.slice(i, i + 3).map(w => w.w).join(' ')), head = nz(ws[i].w);
      if (needles.some(n => win.startsWith(nz(n)) || head.includes(nz(n)))) return ws[i].s;
    }
    return null;
  };
  PACKS.push({
    id: P, name: 'Bản tin thời sự', icon: '📺',
    desc: 'Ident kênh, badge TRỰC TIẾP + đồng hồ, lower-third, banner TIN NÓNG, thẻ tiêu đề, bản đồ, trích dẫn, ticker chạy chữ — dọc và ngang',
    caption: 'news',
    items: [
      { type: 'news_intro', label: 'Ident mở đầu (2 s)', make: T => ({ type: 'news_intro', t0: T, t1: T + 2, channel: 'TIN TỨC 24H', name: 'BẢN TIN 60 GIÂY', sub: '31/10/2026' }) },
      { type: 'news_live', label: 'Badge TRỰC TIẾP + giờ', make: T => ({ type: 'news_live', t0: T, t1: T + 6, label: 'TRỰC TIẾP', clock: '20:15:00', place: 'HÀ NỘI' }) },
      { type: 'news_lowerthird', label: 'Lower-third tên + chức danh', make: T => ({ type: 'news_lowerthird', t0: T, t1: T + 4, name: 'Nguyễn Văn A', title: 'Phóng viên công nghệ', tag: 'Tường thuật' }) },
      { type: 'news_breaking', label: 'Banner TIN NÓNG', make: T => ({ type: 'news_breaking', t0: T, t1: T + 2.8, label: 'TIN NÓNG', sub: 'BREAKING NEWS', text: 'Nội dung tin nóng ngắn gọn' }) },
      { type: 'news_headline', label: 'Thẻ tiêu đề', make: T => ({ type: 'news_headline', t0: T, t1: T + 4, tag: 'Công nghệ', text: 'Tiêu đề bản tin ngắn gọn, rõ ý', sub: 'Cập nhật lúc 20:15' }) },
      { type: 'news_map', label: 'Bản đồ địa điểm', make: T => ({ type: 'news_map', t0: T, t1: T + 4, place: 'San Francisco', sub: 'California, Hoa Kỳ', coord: '37.77°N · 122.42°W' }) },
      { type: 'news_quote', label: 'Trích dẫn', make: T => ({ type: 'news_quote', t0: T, t1: T + 4.5, text: 'Chúng ta cần chuẩn bị cho tương lai ngay từ hôm nay.', source: 'Chuyên gia AI', role: 'Nhà nghiên cứu' }) },
      { type: 'news_ticker', label: 'Ticker chạy chữ', make: T => ({ type: 'news_ticker', t0: T, t1: T + 8, label: 'TIN NÓNG', items: ['Tin thứ nhất', 'Tin thứ hai', 'Tin thứ ba'], speed: 110 }) },
    ],
    // Starter edit: ident 0–2 s, live badge + ticker for the rest, lower-third right after the ident (≥1 s),
    // breaking banner on "nóng|khẩn|mới nhất", headline card on the first highlighted word, follow lower-third at the end.
    recipe: ctx => {
      const dur = ctx.dur || 20, caps = ctx.captions || [], b = ctx.brand || {};
      const chan = b.name || 'TIN TỨC 24H', ie = Math.min(2, dur * .2);
      const scenes = [{ type: 'news_intro', t0: 0, t1: ie, channel: chan, name: ctx.title ? String(ctx.title).toUpperCase() : 'BẢN TIN 60 GIÂY', sub: b.website || '' }];
      const busy = [];
      const free = (a, z) => busy.every(([p, q]) => z <= p || a >= q);
      const add = (sc, minLen = 1.8) => {
        sc.t1 = Math.min(sc.t1, dur - 3.2);
        if (sc.t1 - sc.t0 < minLen || !free(sc.t0, sc.t1)) return false;
        busy.push([sc.t0, sc.t1]); scenes.push(sc); return true;
      };
      scenes.push({ type: 'news_live', t0: ie, t1: dur, label: 'TRỰC TIẾP', clock: '20:15:00', place: b.place || 'HÀ NỘI', keep: true });
      scenes.push({ type: 'news_ticker', t0: ie, t1: dur, label: 'TIN NÓNG', items: caps.length ? [upFirst(capText(caps, 0, 3)), upFirst(capText(caps, dur * .4, 3)), upFirst(capText(caps, dur * .7, 3))].filter(Boolean) : ['Tin mới cập nhật'], speed: 110, keep: true });
      add({ type: 'news_lowerthird', t0: Math.max(1, ie + .2), t1: Math.max(1, ie + .2) + 3.6, name: b.presenter || b.name || 'Người dẫn', title: b.handle || 'Bản tin công nghệ', tag: 'Dẫn chương trình' });
      const tb = findAny(caps, ['nóng', 'khẩn', 'mới nhất', 'khẩn cấp', 'gây sốc', 'sốc', 'shock'], ie + .5);
      if (tb != null) {
        const st = Math.max(ie, tb - .3);
        if (!add({ type: 'news_breaking', t0: st, t1: st + 2.8, label: 'TIN NÓNG', sub: 'BREAKING NEWS', text: upFirst(capText(caps, tb, 1)) }, 1.5)) {
          scenes.push({ type: 'news_breaking', t0: st, t1: Math.min(dur - .5, st + 2.6), label: 'TIN NÓNG', sub: 'BREAKING NEWS', text: '' });
        }
      }
      const hw = caps.flatMap(c => c.words).find(w => w.hl && w.s > ie);
      if (hw) {
        let st = Math.max(ie, hw.s - .2);
        const blk = busy.find(([p, q]) => st < q && st + 4 > p);
        if (blk) st = blk[1] + .1;
        add({ type: 'news_headline', t0: st, t1: st + 4, tag: 'Tiêu điểm', text: upFirst(capText(caps, hw.s - 1, 2)) || 'Tiêu đề', sub: '' });
      }
      scenes.push({ type: 'news_lowerthird', t0: Math.max(ie, dur - 3), t1: dur, name: b.handle ? `Theo dõi ${b.handle}` : 'Theo dõi kênh', title: 'Cập nhật tin mới mỗi ngày', tag: chan, keep: true });
      return { caption_style: 'news', music: 'epic', scenes };
    },
  });
})();
