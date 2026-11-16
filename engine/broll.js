// Procedural b-roll: 55 seekable templates × 10 palettes. Each template is (p, lt, d) => HTML for a 1280×720 frame,
// where p = params ({c: palette, text, sub, icon, items, num, seed}), lt = seconds since clip start, d = clip length.
// Catalog of ready-made combinations: assets/broll/catalog.json (scripts/gen_broll_catalog.py). Spec: references/broll-library.md.

const PAL = {
  ember: { bg: '#120C0A', bg2: '#4B2016', a: '#F0543A', b: '#F6E08C', fg: '#FFFFFF', mu: '#8C8480' },
  neon: { bg: '#070B1A', bg2: '#1B1350', a: '#22E1FF', b: '#FF3DCB', fg: '#FFFFFF', mu: '#7A86B8' },
  ocean: { bg: '#031326', bg2: '#0B3A66', a: '#2EC5FF', b: '#9BF0FF', fg: '#FFFFFF', mu: '#6E8FB0' },
  forest: { bg: '#04140D', bg2: '#0E3B26', a: '#3DDC97', b: '#C8F7A1', fg: '#FFFFFF', mu: '#6F9C86' },
  gold: { bg: '#140F05', bg2: '#4A3510', a: '#F6C453', b: '#FFF1C1', fg: '#FFFFFF', mu: '#A08F6A' },
  violet: { bg: '#0D0819', bg2: '#33195E', a: '#9B6CFF', b: '#FF8AD8', fg: '#FFFFFF', mu: '#8C7FB0' },
  mono: { bg: '#0B0B0B', bg2: '#2A2A2A', a: '#FFFFFF', b: '#BDBDBD', fg: '#FFFFFF', mu: '#7A7A7A' },
  sunset: { bg: '#1A0710', bg2: '#5A1530', a: '#FF7A59', b: '#FF3D7F', fg: '#FFFFFF', mu: '#B07A8A' },
  light: { bg: '#F6F1EC', bg2: '#FFFFFF', a: '#F0543A', b: '#1F1A17', fg: '#1F1A17', mu: '#8C8480', light: true },
  candy: { bg: '#FFF4FA', bg2: '#FFE1F0', a: '#FF4F9A', b: '#FFB703', fg: '#2B1630', mu: '#9C7D93', light: true },
};
const BR_PALS = Object.keys(PAL);

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const R = (seed, i) => rnd(seed * 131 + i);
const fx = n => n.toFixed(1);
const loop = (lt, period) => (lt % period) / period;
const glowTxt = (c, k = 1) => `text-shadow:0 0 ${18 * k}px ${c.a}AA,0 0 ${50 * k}px ${c.a}55`;

function bgBase(c, cx = 30, cy = 25) {
  return `<div class="full" style="background:radial-gradient(circle at ${cx}% ${cy}%, ${c.bg2} 0, ${c.bg} 62%)"></div>`;
}
function vign(c) {
  return c.light ? '' : `<div class="full" style="background:radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,.6) 100%)"></div>`;
}
// Shrink display text so long Vietnamese phrases never overflow (≈0.62 em per uppercase glyph, italic 900).
const fit = (text, size, width = 1160) => Math.min(size, Math.floor(width / (Math.max(1, String(text).replace(/<[^>]+>/g, '').length) * .62)));
function bigText(p, lt, y = 300, size = 92, delay = .15) {
  if (!p.text) return '';
  const c = p.c;
  size = fit(p.text, size);
  return `<div class="abs" style="left:0;right:0;top:${y}px;text-align:center;${anim(lt, delay, null, 'hero')}">
    <div class="mega" style="display:inline-block;font-size:${size}px;color:${c.fg};${c.light ? '' : 'text-shadow:0 6px 30px rgba(0,0,0,.5)'}">${p.text}</div>
    ${p.sub ? `<div class="sub" style="margin-top:14px;font-size:26px;color:${c.a};${anim(lt, delay + .25, null, 'label')}">${esc(p.sub)}</div>` : ''}</div>`;
}
function countUp(lt, to, t0 = .2, dur = 1.6) {
  const k = E.outCubic(prog(lt, t0, dur));
  const v = to * k;
  return Math.abs(to) >= 100 ? Math.round(v).toLocaleString('vi-VN') : v.toFixed(Number.isInteger(to) ? 0 : 1);
}
const card = (c, extra = '') => `background:${c.light ? '#fff' : 'rgba(255,255,255,.06)'};border:1px solid ${c.light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.12)'};border-radius:22px;box-shadow:0 20px 50px rgba(0,0,0,${c.light ? .12 : .45});${extra}`;

// Logo or emoji: "si:<slug>" = Simple Icons glyph painted in the brand colour (CSS mask), anything else = Fluent emoji.
const BR_SI = (typeof CDN !== 'undefined' ? CDN : 'https://cdn.jsdelivr.net/') + 'npm/simple-icons@15.0.0/icons/';
function brIco(icon, size, color = '#111') {
  if (String(icon).startsWith('si:')) return `<div style="width:${size}px;height:${size}px;background:${color};-webkit-mask:url(${BR_SI}${icon.slice(3)}.svg) center/contain no-repeat;mask:url(${BR_SI}${icon.slice(3)}.svg) center/contain no-repeat"></div>`;
  return emoji(icon, 0, 0, size, 'position:relative');
}

const BRL = {
  // ---------------------------------------------------------------- abstract backgrounds
  particles(p, lt) {
    const c = p.c; let h = bgBase(c, 50, 70);
    for (let i = 0; i < 46; i++) {
      const s = 6 + R(p.seed, i) * 46, x = R(p.seed, i + 50) * 1280, sp = 20 + R(p.seed, i + 9) * 60;
      const y = 760 - ((R(p.seed, i + 3) * 800 + lt * sp) % 820);
      h += `<div class="abs" style="left:${fx(x)}px;top:${fx(y)}px;width:${fx(s)}px;height:${fx(s)}px;border-radius:50%;background:${i % 3 ? c.a : c.b};opacity:${(.12 + R(p.seed, i + 7) * .5).toFixed(2)};filter:blur(${fx(s > 30 ? 6 : 1)}px)"></div>`;
    }
    return h + vign(c) + bigText(p, lt);
  },
  grid_tunnel(p, lt) {
    const c = p.c;
    return `<div class="full" style="background:linear-gradient(${c.bg} 0, ${c.bg2} 52%, ${c.bg} 53%)"></div>
      <div class="abs" style="left:490px;top:150px;width:300px;height:300px;border-radius:50%;background:linear-gradient(${c.b},${c.a});
        -webkit-mask-image:repeating-linear-gradient(#000 0 14px,transparent 14px 20px);opacity:.9;box-shadow:0 0 80px ${c.a}"></div>
      <div class="abs" style="left:-640px;top:376px;width:2560px;height:800px;transform:perspective(380px) rotateX(64deg);transform-origin:50% 0;
        background-image:linear-gradient(${c.a} 2px,transparent 2px),linear-gradient(90deg,${c.a} 2px,transparent 2px);background-size:90px 90px;
        background-position:0 ${fx((lt * 160) % 90)}px;-webkit-mask-image:linear-gradient(transparent,#000 25%)"></div>${vign(c)}${bigText(p, lt, 120, 96)}`;
  },
  blobs(p, lt) {
    const c = p.c; let h = `<div class="full" style="background:${c.bg}"></div>`;
    [c.a, c.b, c.bg2, c.a].forEach((col, i) => {
      const x = 640 + Math.sin(lt * .7 + i * 1.7 + p.seed) * 360, y = 360 + Math.cos(lt * .55 + i * 2.1) * 200;
      h += `<div class="abs" style="left:${fx(x - 300)}px;top:${fx(y - 300)}px;width:600px;height:600px;border-radius:50%;background:${col};opacity:.55;filter:blur(90px)"></div>`;
    });
    return h + bigText(p, lt);
  },
  wave_lines(p, lt) {
    const c = p.c; let paths = '';
    for (let k = 0; k < 18; k++) {
      let d = '';
      for (let x = 0; x <= 1280; x += 20) {
        const y = 360 + Math.sin(x / 180 + lt * 1.4 + k * .35) * (60 + k * 6) + Math.sin(x / 70 - lt * 2 + k) * 10;
        d += (x ? 'L' : 'M') + x + ' ' + fx(y);
      }
      paths += `<path d="${d}" stroke="${k % 2 ? c.a : c.b}" stroke-width="2" fill="none" opacity="${(.15 + k / 30).toFixed(2)}"/>`;
    }
    return bgBase(c) + `<svg class="full" viewBox="0 0 1280 720">${paths}</svg>` + vign(c) + bigText(p, lt);
  },
  hex_grid(p, lt) {
    const c = p.c; let h = bgBase(c, 50, 50);
    for (let r = 0; r < 9; r++) for (let q = 0; q < 15; q++) {
      const x = q * 92 + (r % 2) * 46 - 20, y = r * 80 - 10;
      const dist = Math.hypot(x - 640, y - 360) / 700;
      const on = Math.max(0, Math.sin(lt * 3 - dist * 9 + p.seed));
      h += `<div class="abs" style="left:${x}px;top:${y}px;width:84px;height:94px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:${c.a};opacity:${(.05 + on * .35).toFixed(2)}"></div>`;
    }
    return h + vign(c) + bigText(p, lt);
  },
  starfield(p, lt) {
    const c = p.c; let h = `<div class="full" style="background:${c.light ? c.bg : '#000'}"></div>`;
    for (let i = 0; i < 140; i++) {
      const a = R(p.seed, i) * Math.PI * 2, z = (R(p.seed, i + 300) + lt * .45) % 1;
      const r0 = 20 + z * z * 900, len = 8 + z * z * 120;
      h += `<div class="abs" style="left:640px;top:360px;width:${fx(len)}px;height:2px;background:linear-gradient(90deg,transparent,${i % 4 ? c.fg : c.a});opacity:${fx(z)};transform:rotate(${fx(a * 57.3)}deg) translateX(${fx(r0)}px);transform-origin:0 50%"></div>`;
    }
    return h + bigText(p, lt);
  },
  sunburst(p, lt) {
    const c = p.c;
    return `<div class="full" style="background:repeating-conic-gradient(from ${fx(lt * 20)}deg at 50% 50%, ${c.a} 0deg 8deg, ${c.bg2} 8deg 20deg)"></div>
      <div class="full" style="background:radial-gradient(circle at 50% 50%, transparent 0, ${c.bg} 75%)"></div>${bigText(p, lt, 290, 100)}
      ${p.icon ? `<div class="abs" style="left:590px;top:140px;${anim(lt, .05, null, 'pop')}">${emoji(p.icon, 0, 0, 110)}</div>` : ''}`;
  },
  spotlight(p, lt) {
    const c = p.c, x = 640 + Math.sin(lt * 1.2) * 300, y = 330 + Math.cos(lt * .9) * 80;
    return `<div class="full" style="background:${c.bg}"></div>${bigText(p, lt, 290, 110, 0)}
      <div class="full" style="background:radial-gradient(circle 260px at ${fx(x)}px ${fx(y)}px, transparent 0, rgba(0,0,0,.92) 100%)"></div>`;
  },
  rings(p, lt) {
    const c = p.c; let h = bgBase(c, 50, 50);
    for (let i = 0; i < 7; i++) {
      const k = loop(lt + i * .45, 3.15);
      h += `<div class="abs" style="left:640px;top:360px;width:${fx(k * 1300)}px;height:${fx(k * 1300)}px;margin:${fx(-k * 650)}px 0 0 ${fx(-k * 650)}px;border-radius:50%;border:3px solid ${c.a};opacity:${fx((1 - k) * .8)}"></div>`;
    }
    if (p.icon) h += `<div class="abs" style="left:575px;top:295px;${anim(lt, .1, null, 'pop')}">${emoji(p.icon, 0, 0, 130)}</div>`;
    return h + vign(c) + (p.text ? bigText({ ...p }, lt, 470, 64) : '');
  },
  // ---------------------------------------------------------------- data / business
  bar_chart(p, lt) {
    const c = p.c, vals = p.items?.length ? p.items.map(Number) : [22, 35, 31, 48, 62, 95];
    const mx = Math.max(...vals); let bars = '';
    vals.forEach((v, i) => {
      const k = E.outBack(clamp(prog(lt, .2 + i * .12, .6)), 1.3), h = 380 * v / mx * k, last = i === vals.length - 1;
      bars += `<div style="width:90px;height:${fx(Math.max(0, h))}px;border-radius:12px 12px 4px 4px;background:${last ? `linear-gradient(${c.b},${c.a})` : (c.light ? '#00000014' : 'rgba(255,255,255,.14)')};${last ? `box-shadow:0 0 40px ${c.a}88` : ''}"></div>`;
    });
    const n = p.num ?? 248;
    return bgBase(c) + `<div class="abs" style="left:150px;top:150px;height:440px;display:flex;align-items:flex-end;gap:34px;border-bottom:2px solid ${c.mu}">${bars}</div>
      <div class="abs" style="left:900px;top:160px;text-align:left"><div class="mega" style="font-size:${fit('+' + countUp(9, n) + (p.unit ?? '%'), 110, 360)}px;color:${c.a};${c.light ? '' : glowTxt(c, .6)}">+${countUp(lt, n, .4, 1.8)}${esc(p.unit ?? '%')}</div>
      <div class="label" style="color:${c.fg};font-size:34px;margin-top:10px;${anim(lt, .5)}">${esc(p.text || 'TĂNG TRƯỞNG')}</div>
      ${p.sub ? `<div class="sub" style="color:${c.mu};margin-top:8px;${anim(lt, .7)}">${esc(p.sub)}</div>` : ''}</div>` + vign(c);
  },
  line_chart(p, lt) {
    const c = p.c, pts = [];
    for (let i = 0; i <= 40; i++) pts.push([100 + i * 27, 560 - (i / 40) ** 1.8 * 380 - Math.sin(i * 1.3 + p.seed) * 22]);
    const k = E.inOutSine(prog(lt, .1, 2.2)), m = Math.max(1, Math.round(k * 40));
    const d = pts.slice(0, m + 1).map((q, i) => (i ? 'L' : 'M') + fx(q[0]) + ' ' + fx(q[1])).join(' ');
    const head = pts[m];
    const area = d + ` L${fx(head[0])} 600 L100 600 Z`;
    return bgBase(c) + `<div class="full grid-bg" style="opacity:.6"></div><svg class="full" viewBox="0 0 1280 720">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.a}" stop-opacity=".45"/><stop offset="1" stop-color="${c.a}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#lg)"/><path d="${d}" stroke="${c.a}" stroke-width="6" fill="none" stroke-linecap="round" style="filter:drop-shadow(0 0 10px ${c.a})"/>
      <circle cx="${fx(head[0])}" cy="${fx(head[1])}" r="12" fill="${c.b}" style="filter:drop-shadow(0 0 14px ${c.b})"/></svg>
      <div class="abs" style="left:110px;top:70px"><div class="label" style="color:${c.fg};${anim(lt, .1)}">${esc(p.text || 'Doanh thu')}</div>
      <div class="mega" style="font-size:84px;color:${c.a};margin-top:6px">${p.num != null ? '+' + countUp(lt, p.num, .1, 2.2) + (p.unit ?? '%') : ''}</div></div>` + vign(c);
  },
  pie(p, lt) {
    const c = p.c, n = p.num ?? 78, k = E.outCubic(prog(lt, .2, 1.6)) * n;
    return bgBase(c, 50, 50) + `<div class="abs" style="left:440px;top:110px;width:400px;height:400px;border-radius:50%;background:conic-gradient(${c.a} 0 ${fx(k * 3.6)}deg, ${c.light ? '#0000000f' : 'rgba(255,255,255,.08)'} ${fx(k * 3.6)}deg 360deg);
      -webkit-mask-image:radial-gradient(circle, transparent 52%, #000 53%);filter:drop-shadow(0 0 30px ${c.a}66)"></div>
      <div class="abs" style="left:440px;top:250px;width:400px;text-align:center"><div class="mega" style="font-size:96px;color:${c.fg}">${Math.round(k)}%</div></div>
      <div class="abs" style="left:0;right:0;top:560px;text-align:center"><div class="label" style="display:inline-block;color:${c.fg};font-size:38px;${anim(lt, .5)}">${esc(p.text || '')}</div></div>` + vign(c);
  },
  kpi(p, lt) {
    const c = p.c, its = p.items?.length ? p.items : [['Doanh thu', 1250, 'tr'], ['Khách mới', 3480, ''], ['Tỷ lệ chốt', 38, '%']];
    let cards = '';
    its.slice(0, 3).forEach((it, i) => {
      const [lab, v, u] = Array.isArray(it) ? it : [it, 100 + i * 50, ''];
      cards += `<div style="${card(c, 'width:330px;height:230px;padding:32px;')}${anim(lt, .15 + i * .15, null, 'hero')}">
        <div class="sub" style="color:${c.mu};font-size:22px;text-shadow:none">${esc(lab)}</div>
        <div class="mega" style="font-size:72px;color:${i === 1 ? c.a : c.fg};margin-top:22px">${countUp(lt, +v, .3 + i * .15, 1.6)}<span style="font-size:36px;color:${c.mu}">${esc(u)}</span></div>
        <div class="sub" style="color:${c.a};font-size:20px;margin-top:16px;text-shadow:none">▲ ${(8 + i * 7)}%</div></div>`;
    });
    return bgBase(c) + `<div class="full grid-bg" style="opacity:.5"></div>${p.text ? `<div class="abs label" style="left:110px;top:90px;color:${c.fg};${anim(lt, .05)}">${esc(p.text)}</div>` : ''}
      <div class="abs" style="left:110px;top:220px;display:flex;gap:40px">${cards}</div>` + vign(c);
  },
  progress(p, lt) {
    const c = p.c, its = p.items?.length ? p.items : ['Kịch bản', 'Quay', 'Dựng', 'Đăng'];
    let rows = '';
    its.slice(0, 5).forEach((it, i) => {
      const k = E.outCubic(prog(lt, .25 + i * .28, .9));
      rows += `<div style="margin-bottom:34px;${anim(lt, .1 + i * .1)}"><div style="display:flex;justify-content:space-between;width:760px"><span class="label" style="font-size:30px;color:${c.fg};text-shadow:none">${esc(it)}</span>
        <span class="label" style="font-size:30px;color:${c.a};text-shadow:none">${Math.round(k * 100)}%</span></div>
        <div style="margin-top:12px;width:760px;height:18px;border-radius:9px;background:${c.light ? '#0000000f' : 'rgba(255,255,255,.1)'}"><div style="width:${fx(k * 100)}%;height:100%;border-radius:9px;background:linear-gradient(90deg,${c.b},${c.a});box-shadow:0 0 18px ${c.a}88"></div></div></div>`;
    });
    return bgBase(c) + `<div class="abs" style="left:260px;top:${p.text ? 190 : 140}px">${rows}</div>${p.text ? `<div class="abs hero" style="left:260px;top:80px;color:${c.a};font-size:54px;${anim(lt, .05, null, 'hero')}">${esc(p.text)}</div>` : ''}` + vign(c);
  },
  counter_big(p, lt) {
    const c = p.c;
    return bgBase(c, 50, 50) + `<div class="abs" style="left:0;right:0;top:170px;text-align:center"><div class="mega" style="font-size:${fit(countUp(9, p.num ?? 1000000) + (p.unit ?? ''), 230)}px;color:${c.a};${c.light ? '' : glowTxt(c)}">${countUp(lt, p.num ?? 1000000, .15, 2)}${esc(p.unit ?? '')}</div>
      <div class="label" style="color:${c.fg};font-size:44px;margin-top:20px;${anim(lt, .4)}">${esc(p.text || '')}</div></div>` + vign(c);
  },
  // ---------------------------------------------------------------- tech / AI
  code_rain(p, lt) {
    const c = p.c, src = (p.items?.length ? p.items : ['const ai = new Editor();', 'await ai.cut(silence);', 'captions.sync(words);', 'render({ fps: 30 });',
      'if (hook) addZoom(1.06);', 'music.duck(voice, -12);', 'export default video;', 'for (const s of scenes) {', '  s.animate(easeOut);', '}']);
    let h = `<div class="full" style="background:${c.bg}"></div>`;
    for (let col = 0; col < 3; col++) {
      let lines = '';
      for (let i = 0; i < 26; i++) lines += `<div style="opacity:${(.35 + R(p.seed, i + col * 40) * .65).toFixed(2)};color:${i % 5 === 0 ? c.a : c.fg}">${esc(src[(i + col * 3) % src.length])}</div>`;
      h += `<div class="abs" style="left:${60 + col * 420}px;top:${fx(-((lt * (40 + col * 15)) % 600))}px;font:500 22px/42px ui-monospace,Menlo,monospace;white-space:pre">${lines}${lines}</div>`;
    }
    return h + `<div class="full" style="background:linear-gradient(${c.bg},transparent 25%,transparent 75%,${c.bg})"></div>` + vign(c) + bigText(p, lt);
  },
  matrix(p, lt) {
    const c = p.c; let h = `<div class="full" style="background:#000"></div>`;
    const glyph = 'アイウエオカキクケコ0123456789ABCDEF';
    for (let col = 0; col < 42; col++) {
      const sp = 120 + R(p.seed, col) * 220, head = ((lt * sp + R(p.seed, col + 9) * 900) % 1000) - 200;
      let s = '';
      for (let r = 0; r < 18; r++) s += `<div style="opacity:${fx(Math.max(0, 1 - r / 14))};color:${r ? c.a : c.fg}">${glyph[Math.floor(R(col, r + Math.floor(lt * 8)) * glyph.length)]}</div>`;
      h += `<div class="abs" style="left:${col * 31}px;top:${fx(head)}px;font:600 26px/30px ui-monospace,monospace;display:flex;flex-direction:column-reverse;text-shadow:0 0 8px ${c.a}">${s}</div>`;
    }
    return h + bigText({ ...p, c: { ...c, fg: '#fff' } }, lt);
  },
  neural(p, lt) {
    const c = p.c, nodes = [];
    const layers = [4, 6, 6, 3];
    layers.forEach((n, L) => { for (let i = 0; i < n; i++) nodes.push([220 + L * 280, 360 + (i - (n - 1) / 2) * 92, L]); });
    let edges = '', dots = '';
    nodes.forEach((a, i) => nodes.forEach((b, j) => {
      if (b[2] !== a[2] + 1) return;
      const on = Math.max(0, Math.sin(lt * 4 - a[2] * 1.2 + (i * 7 + j) % 5));
      edges += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${on > .7 ? c.a : c.mu}" stroke-width="${on > .7 ? 3 : 1}" opacity="${(.2 + on * .6).toFixed(2)}"/>`;
    }));
    nodes.forEach((a, i) => {
      const on = Math.max(0, Math.sin(lt * 4 - a[2] * 1.2 + i));
      dots += `<circle cx="${a[0]}" cy="${a[1]}" r="${fx(14 + on * 6)}" fill="${on > .6 ? c.a : c.bg2}" stroke="${c.a}" stroke-width="2" style="filter:drop-shadow(0 0 ${fx(on * 16)}px ${c.a})"/>`;
    });
    return bgBase(c, 50, 50) + `<svg class="full" viewBox="0 0 1280 720">${edges}${dots}</svg>` + vign(c) +
      (p.text ? `<div class="abs" style="left:0;right:0;top:40px;text-align:center"><div class="hero" style="display:inline-block;color:${c.fg};font-size:58px;${anim(lt, .1, null, 'hero')}">${esc(p.text)}</div></div>` : '');
  },
  glitch_text(p, lt) {
    const c = p.c, j = Math.floor(lt * 14), g = R(j, 3) > .6;
    const off = g ? (R(j, 1) - .5) * 30 : 0;
    const t = p.text || 'AI';
    const layer = (col, dx, clip) => `<div class="abs mega" style="left:0;right:0;top:250px;text-align:center;font-size:150px;color:${col};transform:translateX(${fx(dx)}px);${clip ? `clip-path:inset(${clip})` : ''};mix-blend-mode:${c.light ? 'multiply' : 'screen'}">${t}</div>`;
    let h = `<div class="full" style="background:${c.bg}"></div><div class="full" style="background:repeating-linear-gradient(transparent 0 3px, rgba(255,255,255,.04) 3px 4px)"></div>`;
    h += layer('#ff2a55', -6 - off, '') + layer('#22e1ff', 6 + off, '') + layer(c.fg, 0, '');
    if (g) h += layer(c.a, off * 2, `${fx(R(j, 5) * 60)}% 0 ${fx(R(j, 6) * 30)}% 0`);
    return h + (p.sub ? `<div class="abs sub" style="left:0;right:0;top:450px;text-align:center;color:${c.a};font-size:30px">${esc(p.sub)}</div>` : '') + vign(c);
  },
  search(p, lt) {
    const c = p.c, q = p.text || 'cách edit video bằng AI', n = Math.floor(clamp(prog(lt, .3, q.length * .06)) * q.length);
    let res = '';
    for (let i = 0; i < 4; i++) res += `<div style="margin-top:26px;${anim(lt, .4 + q.length * .06 + i * .15)}"><div style="width:${380 + R(p.seed, i) * 300}px;height:20px;border-radius:6px;background:${i ? c.mu + '66' : c.a}"></div>
      <div style="margin-top:10px;width:${520 + R(p.seed, i + 9) * 200}px;height:14px;border-radius:6px;background:${c.mu}44"></div></div>`;
    return bgBase(c) + `<div class="abs" style="left:190px;top:150px;width:900px;height:84px;${card(c, 'border-radius:42px;display:flex;align-items:center;padding:0 34px;')}">
      <span style="font-size:34px;margin-right:18px">🔍</span><span class="label" style="color:${c.fg};font-weight:600;font-size:32px;text-shadow:none">${esc(q.slice(0, n))}<span style="opacity:${Math.floor(lt * 2.5) % 2 ? 0 : 1};color:${c.a}">|</span></span></div>
      <div class="abs" style="left:230px;top:260px">${res}</div>` + vign(c);
  },
  browser(p, lt) {
    const c = p.c, ready = lt > 1.0;
    const sk = (w, h, mt = 16) => `<div style="width:${w}px;height:${h}px;border-radius:8px;margin-top:${mt}px;background:${c.mu}${ready ? '55' : '33'}"></div>`;
    const tiles = [0, 1, 2].map(i => `<div style="width:250px;height:170px;border-radius:14px;background:${ready ? `linear-gradient(135deg,${[c.a, c.b, c.bg2][i]},${c.bg2})` : c.mu + '22'};${ready ? anim(lt, 1 + i * .12, null, 'pop') : ''}"></div>`).join('');
    return bgBase(c) + `<div class="abs" style="left:170px;top:80px;width:940px;height:560px;${card(c, 'overflow:hidden;')}${anim(lt, 0, null, 'hero')}">
      <div style="height:52px;display:flex;align-items:center;gap:10px;padding:0 20px;background:${c.light ? '#00000008' : 'rgba(255,255,255,.05)'}">
      <i style="width:14px;height:14px;border-radius:50%;background:#ff5f57"></i><i style="width:14px;height:14px;border-radius:50%;background:#febc2e"></i><i style="width:14px;height:14px;border-radius:50%;background:#28c840"></i>
      <div style="margin-left:20px;flex:1;height:30px;border-radius:15px;background:${c.mu}22;font:500 16px/30px var(--sans);color:${c.mu};padding-left:16px">${esc(p.sub || 'https://')}</div></div>
      <div style="padding:30px 40px">${ready ? `<div class="hero" style="font-size:44px;color:${c.a};${anim(lt, 1)}">${esc(p.text || 'Website')}</div>` : sk(420, 40, 0)}${sk(700, 16, 22)}${sk(560, 16)}
      <div style="display:flex;gap:30px;margin-top:34px">${tiles}</div></div></div>` + vign(c);
  },
  phone_feed(p, lt) {
    const c = p.c; let feed = '';
    for (let i = 0; i < 8; i++) feed += `<div style="height:220px;margin:14px;border-radius:16px;background:linear-gradient(135deg,${[c.a, c.b, c.bg2, c.mu][i % 4]},${c.bg2});position:relative">
      <div style="position:absolute;left:14px;bottom:14px;width:${120 + R(p.seed, i) * 100}px;height:12px;border-radius:6px;background:rgba(255,255,255,.7)"></div>
      <div style="position:absolute;right:14px;bottom:10px;font-size:22px">${['❤️', '🔥', '👍', '💬'][i % 4]}</div></div>`;
    const sc = (lt * 180) % (234 * 4);
    return bgBase(c, 70, 30) + `<div class="abs" style="left:490px;top:30px;width:300px;height:640px;border-radius:44px;border:10px solid #111;background:${c.light ? '#fff' : '#0d0d0d'};overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5);${anim(lt, 0, null, 'hero')}">
      <div style="transform:translateY(${fx(-sc)}px)">${feed}</div><div class="abs" style="left:100px;top:8px;width:80px;height:22px;border-radius:12px;background:#111"></div></div>
      ${p.text ? `<div class="abs hero" style="left:850px;top:300px;font-size:56px;color:${c.a};${anim(lt, .3, null, 'hero')}">${esc(p.text)}</div>` : ''}
      ${p.icon ? `<div class="abs" style="left:300px;top:250px;${anim(lt, .5, null, 'pop')}"><div style="transform:${bob(lt)}">${emoji(p.icon, 0, 0, 120)}</div></div>` : ''}` + vign(c);
  },
  notifications(p, lt) {
    const c = p.c, its = p.items?.length ? p.items : ['Đơn hàng mới · 1.250.000đ', 'Khách hàng vừa thanh toán', 'Bạn có 12 tin nhắn mới', 'Doanh thu hôm nay +32%'];
    let h = bgBase(c, 50, 30);
    its.slice(0, 5).forEach((it, i) => {
      const t0 = .2 + i * .45;
      h += `<div class="abs" style="left:340px;top:${110 + i * 110}px;width:600px;height:92px;${card(c, 'display:flex;align-items:center;gap:20px;padding:0 24px;')}${anim(lt, t0, null, 'hero')}">
        <div style="width:56px;height:56px;border-radius:14px;background:${c.a};display:flex;align-items:center;justify-content:center;font-size:30px">${p.icon || '🔔'}</div>
        <div><div class="sub" style="color:${c.fg};font-size:24px;text-shadow:none">${esc(it)}</div><div style="color:${c.mu};font:500 16px var(--sans);margin-top:4px">vừa xong</div></div></div>`;
    });
    return h + vign(c);
  },
  chat(p, lt) {
    const c = p.c, its = p.items?.length ? p.items : ['Anh ơi video này edit bằng gì vậy?', 'Bằng AI 100% luôn em 😎', 'Thật á? Mất bao lâu ạ?', 'Có 10 phút thôi!'];
    let h = bgBase(c, 50, 20), y = 100;
    its.slice(0, 5).forEach((it, i) => {
      const me = i % 2 === 1;
      h += `<div class="abs" style="${me ? 'right:250px' : 'left:250px'};top:${y}px;max-width:560px;padding:20px 28px;border-radius:28px;${me ? `border-bottom-right-radius:8px;background:${c.a};color:#fff` : `border-bottom-left-radius:8px;${card(c)}color:${c.fg}`};font:600 28px/1.3 var(--sans);${anim(lt, .2 + i * .6, null, 'pop')}">${esc(it)}</div>`;
      y += 120;
    });
    return h + vign(c);
  },
  checklist(p, lt) {
    const c = p.c, its = p.items?.length ? p.items : ['Cắt khoảng lặng', 'Phụ đề tự động', 'Chèn nhạc nền', 'Hiệu ứng chuyển cảnh'];
    let rows = '';
    its.slice(0, 6).forEach((it, i) => {
      const t0 = .3 + i * .5, done = lt > t0 + .3;
      rows += `<div style="display:flex;align-items:center;gap:26px;margin-bottom:30px;${anim(lt, t0)}"><div style="width:54px;height:54px;border-radius:14px;border:3px solid ${c.a};background:${done ? c.a : 'transparent'};display:flex;align-items:center;justify-content:center;color:#fff;font:900 34px var(--sans);transform:scale(${done ? fx(1 + .25 * Math.max(0, 1 - (lt - t0 - .3) * 5)) : 1})">${done ? '✓' : ''}</div>
        <div class="label" style="font-size:40px;color:${c.fg};text-shadow:none;${done ? 'opacity:1' : 'opacity:.55'}">${esc(it)}</div></div>`;
    });
    return bgBase(c) + `${p.text ? `<div class="abs hero" style="left:300px;top:70px;color:${c.a};font-size:56px;${anim(lt, 0, null, 'hero')}">${esc(p.text)}</div>` : ''}<div class="abs" style="left:300px;top:${p.text ? 180 : 120}px">${rows}</div>` + vign(c);
  },
  files(p, lt) {
    const c = p.c; let h = bgBase(c, 50, 60);
    for (let i = 0; i < 9; i++) {
      const t0 = .1 + i * .18, k = E.inOutSine(prog(lt, t0, .7));
      const sx = (R(p.seed, i) - .5) * 1400 + 640, sy = -150 - R(p.seed, i + 5) * 100;
      const x = lerp(sx, 590, k), y = lerp(sy, 360, k);
      h += `<div class="abs" style="left:${fx(x)}px;top:${fx(y)}px;width:100px;height:128px;border-radius:10px;background:${c.light ? '#fff' : '#f5f5f5'};box-shadow:0 10px 30px rgba(0,0,0,.35);transform:rotate(${fx((1 - k) * (R(p.seed, i + 2) - .5) * 120)}deg) scale(${fx(1 - k * .5)});opacity:${fx(1 - prog(lt, t0 + .6, .15))}">
        <div style="margin:18px 14px;height:10px;border-radius:5px;background:${[c.a, c.b, c.mu][i % 3]}"></div><div style="margin:0 14px;height:8px;border-radius:4px;background:#ccc"></div><div style="margin:8px 14px;width:50px;height:8px;border-radius:4px;background:#ccc"></div></div>`;
    }
    return h + `<div class="abs" style="left:540px;top:330px;font-size:170px;line-height:1;transform:scale(${fx(1 + .06 * Math.sin(lt * 9) * (lt < 2.2 ? 1 : 0))})">${emoji(p.icon || '📁', 0, 0, 200, 'position:relative')}</div>` +
      (p.text ? `<div class="abs" style="left:0;right:0;top:80px;text-align:center"><div class="hero" style="display:inline-block;font-size:60px;color:${c.a};${anim(lt, .1, null, 'hero')}">${esc(p.text)}</div></div>` : '') + vign(c);
  },
  // ---------------------------------------------------------------- time / place
  clock(p, lt) {
    const c = p.c, sp = p.num ?? 6, m = lt * sp * 360, hr = m / 12;
    let ticks = '';
    for (let i = 0; i < 12; i++) ticks += `<div class="abs" style="left:198px;top:12px;width:4px;height:${i % 3 ? 16 : 30}px;background:${c.fg};transform:rotate(${i * 30}deg);transform-origin:2px 188px;opacity:.8"></div>`;
    return bgBase(c, 50, 50) + `<div class="abs" style="left:440px;top:110px;width:400px;height:400px;border-radius:50%;border:8px solid ${c.a};box-shadow:0 0 60px ${c.a}66, inset 0 0 40px ${c.a}33">
      ${ticks}<div class="abs" style="left:194px;top:80px;width:12px;height:120px;border-radius:6px;background:${c.fg};transform:rotate(${fx(hr)}deg);transform-origin:6px 120px"></div>
      <div class="abs" style="left:196px;top:30px;width:8px;height:170px;border-radius:4px;background:${c.a};transform:rotate(${fx(m)}deg);transform-origin:4px 170px"></div>
      <div class="abs" style="left:184px;top:184px;width:32px;height:32px;border-radius:50%;background:${c.fg}"></div></div>
      ${p.text ? `<div class="abs" style="left:0;right:0;top:560px;text-align:center"><div class="hero" style="display:inline-block;font-size:62px;color:${c.fg};${anim(lt, .2, null, 'hero')}">${esc(p.text)}</div></div>` : ''}` + vign(c);
  },
  calendar(p, lt) {
    const c = p.c, start = p.num ?? 1, day = start + Math.floor(lt * 6), k = (lt * 6) % 1;
    const pg = (d, style) => `<div class="abs" style="left:0;top:70px;width:340px;height:300px;border-radius:0 0 24px 24px;background:${c.light ? '#fff' : '#fafafa'};display:flex;align-items:center;justify-content:center;font:900 170px var(--sans);color:#1b1b1b;${style}">${d}</div>`;
    return bgBase(c, 50, 50) + `<div class="abs" style="left:470px;top:130px;width:340px;height:380px;perspective:900px">
      <div class="abs" style="left:0;top:0;width:340px;height:80px;border-radius:24px 24px 0 0;background:${c.a};color:#fff;font:800 34px/80px var(--sans);text-align:center">${esc(p.sub || 'THÁNG 11')}</div>
      ${pg(day + 1, '')}${pg(day, `transform-origin:50% 0;transform:rotateX(${fx(-k * 100)}deg);opacity:${fx(1 - k * .6)}`)}</div>
      ${p.text ? `<div class="abs" style="left:0;right:0;top:560px;text-align:center"><div class="hero" style="display:inline-block;font-size:58px;color:${c.fg};${anim(lt, .2, null, 'hero')}">${esc(p.text)}</div></div>` : ''}` + vign(c);
  },
  countdown(p, lt) {
    const c = p.c, n = 3 - Math.floor(lt / .8), k = (lt % .8) / .8;
    const show = n > 0 ? n : (p.text || 'GO!');
    return bgBase(c, 50, 50) + `<div class="abs" style="left:640px;top:360px;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;border:10px solid ${c.a}33"></div>
      <div class="abs" style="left:640px;top:360px;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;background:conic-gradient(${c.a} 0 ${fx(n > 0 ? k * 360 : 360)}deg,transparent 0);-webkit-mask-image:radial-gradient(circle,transparent 66%,#000 67%)"></div>
      <div class="abs" style="left:0;right:0;top:${n > 0 ? 210 : 280}px;text-align:center"><div class="mega" style="display:inline-block;font-size:${n > 0 ? 300 : fit(show, 130)}px;color:${c.fg};transform:scale(${fx(1.3 - E.outCubic(Math.min(1, k * 3)) * .3)})">${esc(show)}</div></div>` + vign(c);
  },
  globe(p, lt) {
    const c = p.c; let dots = '';
    for (let la = -80; la <= 80; la += 10) for (let lo = 0; lo < 360; lo += 10) {
      const L = (lo + lt * 30) * Math.PI / 180, A = la * Math.PI / 180;
      const x = Math.cos(A) * Math.sin(L), y = Math.sin(A), z = Math.cos(A) * Math.cos(L);
      if (z < 0) continue;
      const land = Math.sin(lo * .09 + la * .05) + Math.cos(la * .11 - lo * .03) > .5;
      dots += `<circle cx="${fx(640 + x * 260)}" cy="${fx(360 - y * 260)}" r="${fx(2 + z * (land ? 3 : 1.5))}" fill="${land ? c.a : c.mu}" opacity="${fx(.2 + z * .8)}"/>`;
    }
    return bgBase(c, 50, 50) + `<div class="abs" style="left:380px;top:100px;width:520px;height:520px;border-radius:50%;box-shadow:0 0 120px ${c.a}44, inset 0 0 60px ${c.a}22"></div><svg class="full" viewBox="0 0 1280 720">${dots}</svg>` + vign(c) +
      (p.text ? `<div class="abs" style="left:0;right:0;top:620px;text-align:center"><div class="hero" style="display:inline-block;font-size:56px;color:${c.fg};${anim(lt, .2, null, 'hero')}">${esc(p.text)}</div></div>` : '');
  },
  map_pins(p, lt) {
    const c = p.c; let h = bgBase(c, 50, 50) + `<div class="full" style="background-image:radial-gradient(${c.mu}55 2px, transparent 2.5px);background-size:22px 22px;opacity:.8"></div>`;
    const pins = p.items?.length ? p.items : ['Hà Nội', 'Đà Nẵng', 'TP.HCM', 'Singapore', 'Tokyo'];
    pins.slice(0, 6).forEach((nm, i) => {
      const x = 180 + R(p.seed, i) * 900, y = 160 + R(p.seed, i + 4) * 380, t0 = .2 + i * .3;
      const k = prog(lt, t0, .35), rip = loop(Math.max(0, lt - t0), 1.4);
      h += `<div class="abs" style="left:${fx(x - 40 * rip)}px;top:${fx(y - 14 * rip)}px;width:${fx(80 * rip)}px;height:${fx(28 * rip)}px;border-radius:50%;border:2px solid ${c.a};opacity:${fx(k * (1 - rip))}"></div>
        <div class="abs" style="left:${fx(x - 22)}px;top:${fx(y - 60 - (1 - E.outBack(k, 2)) * 120)}px;opacity:${fx(Math.min(1, k * 3))}">${emoji('📍', 0, 0, 52, 'position:relative')}</div>
        <div class="abs sub" style="left:${fx(x + 30)}px;top:${fx(y - 40)}px;color:${c.fg};${anim(lt, t0 + .3)}">${esc(nm)}</div>`;
    });
    return h + vign(c) + (p.text ? `<div class="abs hero" style="left:80px;top:50px;font-size:54px;color:${c.a};${anim(lt, 0, null, 'hero')}">${esc(p.text)}</div>` : '');
  },
  timeline_steps(p, lt) {
    const c = p.c, its = p.items?.length ? p.items : ['Ý tưởng', 'Kịch bản', 'Quay', 'Dựng', 'Đăng'];
    const n = Math.min(6, its.length), w = 1000 / (n - 1);
    const k = E.inOutSine(prog(lt, .2, 2.4));
    let h = bgBase(c) + `<div class="abs" style="left:140px;top:356px;width:1000px;height:8px;border-radius:4px;background:${c.mu}44"></div>
      <div class="abs" style="left:140px;top:356px;width:${fx(1000 * k)}px;height:8px;border-radius:4px;background:${c.a};box-shadow:0 0 20px ${c.a}"></div>`;
    its.slice(0, n).forEach((it, i) => {
      const on = k >= i / (n - 1) - .001;
      h += `<div class="abs" style="left:${fx(140 + i * w - 30)}px;top:330px;width:60px;height:60px;border-radius:50%;background:${on ? c.a : c.bg};border:4px solid ${on ? c.a : c.mu};color:#fff;font:800 26px/52px var(--sans);text-align:center;${on ? `box-shadow:0 0 30px ${c.a}` : ''}">${i + 1}</div>
        <div class="abs label" style="left:${fx(140 + i * w - 100)}px;width:200px;text-align:center;top:${i % 2 ? 420 : 250}px;font-size:28px;color:${on ? c.fg : c.mu};text-shadow:none">${esc(it)}</div>`;
    });
    return h + vign(c) + (p.text ? `<div class="abs" style="left:0;right:0;top:90px;text-align:center"><div class="hero" style="display:inline-block;font-size:56px;color:${c.a};${anim(lt, 0, null, 'hero')}">${esc(p.text)}</div></div>` : '');
  },
  // ---------------------------------------------------------------- fun / emotional
  likes(p, lt) {
    const c = p.c; let h = bgBase(c, 50, 50);
    for (let i = 0; i < 18; i++) {
      const t0 = R(p.seed, i) * 2.5, k = prog(lt, t0, 1.6);
      if (k <= 0 || k >= 1) continue;
      h += `<div class="abs" style="left:${fx(560 + (R(p.seed, i + 3) - .5) * 500 + Math.sin(k * 6 + i) * 30)}px;top:${fx(420 - k * 380)}px;opacity:${fx(1 - k)};transform:scale(${fx(.6 + R(p.seed, i + 8) * .8)})">${emoji(p.icon || '❤️', 0, 0, 60, 'position:relative')}</div>`;
    }
    const beat = 1 + .08 * Math.max(0, Math.sin(lt * 9));
    return h + `<div class="abs" style="left:520px;top:120px;transform:scale(${fx(beat)})">${emoji(p.icon || '❤️', 0, 0, 240, 'position:relative')}</div>
      <div class="abs" style="left:0;right:0;top:420px;text-align:center"><div class="mega" style="display:inline-block;font-size:120px;color:${c.fg}">${countUp(lt, p.num ?? 128000, .1, 2.2)}</div>
      <div class="label" style="color:${c.a};font-size:36px;margin-top:8px">${esc(p.text || 'lượt thích')}</div></div>` + vign(c);
  },
  rocket(p, lt, d) {
    const c = p.c, y = 520 - E.inQuad(prog(lt, .3, Math.max(1.5, d - .2))) * 760 + Math.sin(lt * 30) * 2;
    let h = `<div class="full" style="background:linear-gradient(${c.bg},${c.bg2})"></div>`;
    for (let i = 0; i < 60; i++) {
      const sy = (R(p.seed, i) * 720 + lt * (300 + R(p.seed, i + 1) * 600)) % 720;
      h += `<div class="abs" style="left:${fx(R(p.seed, i + 2) * 1280)}px;top:${fx(sy)}px;width:2px;height:${fx(10 + R(p.seed, i + 4) * 40)}px;background:${c.fg};opacity:.5"></div>`;
    }
    h += `<div class="abs" style="left:600px;top:${fx(y + 110)}px;width:80px;height:${fx(Math.max(0, 600 - y))}px;background:linear-gradient(${c.b},${c.a}88,transparent);filter:blur(14px);border-radius:40px"></div>`;
    h += `<div class="abs" style="left:560px;top:${fx(y)}px;transform:rotate(-45deg)">${emoji('🚀', 0, 0, 160, 'position:relative')}</div>`;
    return h + vign(c) + (p.text ? `<div class="abs" style="left:0;right:0;top:60px;text-align:center"><div class="mega" style="display:inline-block;font-size:${fit(p.text, 96)}px;color:${c.fg};${anim(lt, .2, null, 'mega')}">${p.text}</div></div>` : '');
  },
  money_rain(p, lt) {
    const c = p.c; let h = bgBase(c, 50, 30);
    const icons = p.items?.length ? p.items : ['💸', '💰', '🪙', '💵'];
    for (let i = 0; i < 34; i++) {
      const sp = 220 + R(p.seed, i) * 260, y = ((R(p.seed, i + 1) * 900 + lt * sp) % 900) - 120;
      h += `<div class="abs" style="left:${fx(R(p.seed, i + 2) * 1240)}px;top:${fx(y)}px;transform:rotate(${fx(Math.sin(lt * 3 + i) * 30)}deg)">${emoji(icons[i % icons.length], 0, 0, 50 + R(p.seed, i + 5) * 40, 'position:relative')}</div>`;
    }
    return h + (p.num != null ? `<div class="abs" style="left:0;right:0;top:240px;text-align:center"><div class="mega" style="display:inline-block;font-size:150px;color:${c.a};${glowTxt(c, .7)}">${countUp(lt, p.num, .1, 2)}${esc(p.unit ?? '')}</div>
      <div class="label" style="color:${c.fg};font-size:40px">${esc(p.text || '')}</div></div>` : bigText(p, lt)) + vign(c);
  },
  emoji_burst(p, lt, d) {
    const c = p.c; let h = bgBase(c, 50, 50);
    const icons = p.items?.length ? p.items : ['🎉', '✨', '🔥', '⭐', '💯'];
    for (let i = 0; i < 28; i++) {
      const a = R(p.seed, i) * Math.PI * 2, k = E.outCubic(prog(lt, .15, 1.4)), r = k * (200 + R(p.seed, i + 1) * 380);
      h += `<div class="abs" style="left:${fx(610 + Math.cos(a) * r)}px;top:${fx(330 + Math.sin(a) * r * .7 + k * k * 60)}px;opacity:${fx(1 - prog(lt, Math.max(1.6, d - .6), .6))};transform:rotate(${fx(a * 90 * k)}deg)">${emoji(icons[i % icons.length], 0, 0, 44 + R(p.seed, i + 7) * 40, 'position:relative')}</div>`;
    }
    return h + `<div class="abs" style="left:0;right:0;top:270px;text-align:center"><div class="mega" style="display:inline-block;font-size:${fit(p.text || '', 120)}px;color:${c.a};${anim(lt, .05, null, 'stamp')}">${p.text || ''}</div></div>` + vign(c);
  },
  versus(p, lt) {
    const c = p.c, its = p.items?.length ? p.items : ['TRƯỚC', 'SAU'], k = E.outExpo(prog(lt, .05, .6));
    return `<div class="abs" style="left:${fx(-640 + k * 640)}px;top:0;width:660px;height:720px;background:${c.light ? '#e9e4df' : '#1b1b1b'};clip-path:polygon(0 0,100% 0,94% 100%,0 100%)">
        <div class="abs" style="left:0;right:40px;top:300px;text-align:center"><div class="mega" style="font-size:90px;color:${c.mu}">${esc(its[0])}</div><div style="font-size:70px">${emoji(p.icon || '😩', 0, 0, 90, 'position:relative;margin:20px auto')}</div></div></div>
      <div class="abs" style="left:${fx(1280 - k * 660)}px;top:0;width:660px;height:720px;background:linear-gradient(135deg,${c.a},${c.b});clip-path:polygon(6% 0,100% 0,100% 100%,0 100%)">
        <div class="abs" style="left:40px;right:0;top:300px;text-align:center"><div class="mega" style="font-size:90px;color:#fff">${esc(its[1])}</div><div>${emoji(p.sub || '🤩', 0, 0, 90, 'position:relative;margin:20px auto')}</div></div></div>
      <div class="abs" style="left:590px;top:310px;width:100px;height:100px;border-radius:50%;background:#fff;color:#111;font:900 italic 40px/100px var(--sans);text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4);${anim(lt, .5, null, 'stamp')}">VS</div>`;
  },
  typewriter(p, lt) {
    const c = p.c, q = p.text || 'Làm ít hơn. Hiệu quả hơn.', n = Math.floor(clamp(prog(lt, .2, q.length * .055)) * q.length);
    return bgBase(c, 20, 20) + `<div class="abs serif" style="left:120px;top:110px;font-size:160px;color:${c.a};opacity:.5">“</div>
      <div class="abs" style="left:160px;right:160px;top:240px;font:800 italic 66px/1.2 var(--sans);color:${c.fg};white-space:normal">${esc(q.slice(0, n))}<span style="color:${c.a};opacity:${Math.floor(lt * 2.5) % 2 ? 0 : 1}">▍</span></div>
      ${p.sub ? `<div class="abs sub" style="left:160px;top:560px;color:${c.mu};${anim(lt, .3 + q.length * .055)}">— ${esc(p.sub)}</div>` : ''}` + vign(c);
  },
  ticker(p, lt) {
    const c = p.c, its = p.items?.length ? p.items : ['TIN NÓNG', 'AI EDIT VIDEO', 'TỰ ĐỘNG 100%', 'TIẾT KIỆM 90% THỜI GIAN'];
    const strip = (y, rot, dir, bg, fg) => {
      const txt = Array(8).fill(its.map(esc).join('  ✦  ')).join('  ✦  ');
      return `<div class="abs" style="left:-200px;top:${y}px;width:1700px;height:90px;background:${bg};transform:rotate(${rot}deg);overflow:hidden">
        <div class="mega" style="font-size:58px;line-height:90px;color:${fg};white-space:nowrap;transform:translateX(${fx(dir * ((lt * 220) % 1200) - 600)}px)">${txt}</div></div>`;
    };
    return bgBase(c) + strip(200, -6, -1, c.a, '#fff') + strip(400, 5, 1, c.light ? '#1f1a17' : '#fff', c.light ? '#fff' : '#111') + vign(c);
  },
  equalizer(p, lt) {
    const c = p.c; let bars = '';
    for (let i = 0; i < 48; i++) {
      const v = .15 + .85 * Math.abs(Math.sin(lt * (3 + R(p.seed, i) * 5) + i * .5) * Math.sin(lt * 1.3 + i * .21));
      bars += `<div style="width:16px;height:${fx(v * 380)}px;border-radius:8px;background:linear-gradient(${c.b},${c.a});box-shadow:0 0 14px ${c.a}66"></div>`;
    }
    return bgBase(c, 50, 50) + `<div class="abs" style="left:100px;right:100px;top:150px;height:400px;display:flex;align-items:center;justify-content:space-between">${bars}</div>` + vign(c) +
      (p.text ? `<div class="abs" style="left:0;right:0;top:580px;text-align:center"><div class="hero" style="display:inline-block;font-size:54px;color:${c.fg};${anim(lt, .1, null, 'hero')}">${esc(p.text)}</div></div>` : '');
  },
  orbit_icons(p, lt) {
    const c = p.c, icons = p.items?.length ? p.items : ['🎬', '🎵', '✨', '📈', '🤖', '💬'];
    let h = bgBase(c, 50, 50) + `<div class="abs" style="left:340px;top:160px;width:600px;height:400px;border-radius:50%;border:2px dashed ${c.mu}88"></div>`;
    icons.forEach((e, i) => {
      const a = lt * .9 + i / icons.length * Math.PI * 2, x = 640 + Math.cos(a) * 300, y = 360 + Math.sin(a) * 200, z = (Math.sin(a) + 1) / 2;
      h += `<div class="abs" style="left:${fx(x - 40)}px;top:${fx(y - 40)}px;transform:scale(${fx(.7 + z * .5)});z-index:${Math.round(z * 10)};${card(c, 'width:80px;height:80px;border-radius:22px;display:flex;align-items:center;justify-content:center;')}">${emoji(e, 0, 0, 52, 'position:relative')}</div>`;
    });
    return h + `<div class="abs" style="left:560px;top:280px;z-index:6;${anim(lt, .1, null, 'pop')}">${emoji(p.icon || '🤖', 0, 0, 160, 'position:relative')}</div>` + vign(c) +
      (p.text ? `<div class="abs" style="left:0;right:0;top:600px;text-align:center"><div class="hero" style="display:inline-block;font-size:52px;color:${c.fg};${anim(lt, .2, null, 'hero')}">${esc(p.text)}</div></div>` : '');
  },
  icon_hero(p, lt) {
    const c = p.c;
    return bgBase(c, 50, 40) + `<div class="abs" style="left:640px;top:260px;width:420px;height:420px;margin:-210px 0 0 -210px;border-radius:50%;background:radial-gradient(circle, ${c.a}66, transparent 70%)"></div>
      <div class="abs" style="left:540px;top:150px;${anim(lt, .05, null, 'pop')}"><div style="transform:${bob(lt, 0, 8)}">${emoji(p.icon || '💡', 0, 0, 200, 'position:relative')}</div></div>
      <div class="abs" style="left:0;right:0;top:420px;text-align:center"><div class="hero" style="display:inline-block;font-size:${fit(p.text || '', 76)}px;color:${c.a};${anim(lt, .3, null, 'hero')}">${esc(p.text || '')}</div>
      ${p.sub ? `<div class="label" style="color:${c.fg};margin-top:14px;${anim(lt, .5)}">${esc(p.sub)}</div>` : ''}</div>` + vign(c);
  },
  quote_card(p, lt) {
    const c = p.c;
    return bgBase(c, 80, 20) + `<div class="abs" style="left:190px;top:120px;width:900px;height:480px;${card(c, 'padding:60px 70px;')}${anim(lt, 0, null, 'hero')};transform-origin:50% 50%">
      <div style="font-size:60px">${emoji(p.icon || '💬', 0, 0, 70, 'position:relative')}</div>
      <div style="margin-top:20px;font:800 46px/1.25 var(--sans);color:${c.fg};white-space:normal;${anim(lt, .25)}">${esc(p.text || 'Không phải làm nhiều hơn, mà là làm thông minh hơn.')}</div>
      <div class="sub" style="margin-top:30px;color:${c.a};text-shadow:none;${anim(lt, .5)}">${esc(p.sub || '')}</div></div>`;
  },
  // ---------------------------------------------------------------- life / commerce (v5)
  // Brand logo (Simple Icons, p.icon = "si:<slug>", p.hex = brand colour) on a lit tile; emoji works too.
  logo_hero(p, lt) {
    const c = p.c, hex = p.hex ? '#' + String(p.hex).replace('#', '') : c.a;
    return bgBase(c, 50, 45) + `<div class="abs" style="left:640px;top:300px;width:560px;height:560px;margin:-280px 0 0 -280px;border-radius:50%;background:radial-gradient(circle, ${hex}55, transparent 68%)"></div>
      <div class="abs" style="left:520px;top:120px;width:240px;height:240px;${anim(lt, .05, null, 'pop')}"><div style="width:240px;height:240px;border-radius:56px;background:#fff;box-shadow:0 30px 70px rgba(0,0,0,.45),0 0 0 6px ${hex}33;display:flex;align-items:center;justify-content:center;transform:${bob(lt, 0, 5)}">${brIco(p.icon || '✨', 150, hex)}</div></div>
      <div class="abs" style="left:0;right:0;top:420px;text-align:center"><div class="hero" style="display:inline-block;font-size:${fit(p.text || '', 80)}px;color:${c.fg};${anim(lt, .3, null, 'hero')}">${esc(p.text || '')}</div>
      ${p.sub ? `<div class="label" style="color:${hex};margin-top:12px;${anim(lt, .5)}">${esc(p.sub)}</div>` : ''}</div>` + vign(c);
  },
  food_steam(p, lt) {
    const c = p.c; let steam = '';
    for (let i = 0; i < 5; i++) {
      const k = loop(lt + i * .45, 2.2), x = 560 + i * 40 + Math.sin(lt * 2 + i) * 18;
      steam += `<div class="abs" style="left:${fx(x)}px;top:${fx(250 - k * 170)}px;width:40px;height:90px;border-radius:50%;background:${c.fg};opacity:${fx((1 - k) * .35)};filter:blur(14px);transform:scaleX(${fx(1 + k)})"></div>`;
    }
    return bgBase(c, 50, 60) + `<div class="abs" style="left:440px;top:330px;width:400px;height:60px;border-radius:50%;background:rgba(0,0,0,.35);filter:blur(10px)"></div>` + steam +
      `<div class="abs" style="left:530px;top:200px;${anim(lt, .05, null, 'pop')}">${emoji(p.icon || '🍜', 0, 0, 220, 'position:relative')}</div>
      <div class="abs" style="left:0;right:0;top:470px;text-align:center"><div class="hero" style="display:inline-block;font-size:${fit(p.text || '', 76)}px;color:${c.a};${anim(lt, .3, null, 'hero')}">${esc(p.text || '')}</div>
      ${p.sub ? `<div class="label" style="color:${c.fg};margin-top:12px;${anim(lt, .5)}">${esc(p.sub)}</div>` : ''}</div>` + vign(c);
  },
  plane_route(p, lt) {
    const c = p.c, [A, B] = p.items?.length >= 2 ? p.items : ['Hà Nội', 'Đà Nẵng'];
    const k = E.inOutSine(prog(lt, .4, 1.8)), x0 = 220, x1 = 1060, y0 = 470, x = lerp(x0, x1, k), y = y0 - Math.sin(k * Math.PI) * 260;
    const ang = Math.atan2(-Math.cos(k * Math.PI) * 260 * Math.PI, x1 - x0) * 180 / Math.PI;
    const pin = (px, lab, d) => `<div class="abs" style="left:${px - 22}px;top:${y0 - 22}px;${anim(lt, d, null, 'pop')}"><div style="width:44px;height:44px;border-radius:50%;background:${c.a};box-shadow:0 0 0 10px ${c.a}33,0 0 30px ${c.a}"></div>
      <div class="label" style="position:absolute;left:50%;top:60px;transform:translateX(-50%);white-space:nowrap;color:${c.fg};font-size:34px">${esc(lab)}</div></div>`;
    return bgBase(c, 50, 30) + `<svg class="abs" style="left:0;top:0" width="1280" height="720"><path d="M${x0} ${y0} Q 640 ${y0 - 520} ${x1} ${y0}" fill="none" stroke="${c.mu}" stroke-width="4" stroke-dasharray="4 14" stroke-linecap="round"/>
      <path d="M${x0} ${y0} Q 640 ${y0 - 520} ${x1} ${y0}" fill="none" stroke="${c.a}" stroke-width="6" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${fx(1 - k)}"/></svg>` +
      pin(x0, A, .05) + pin(x1, B, .2) + `<div class="abs" style="left:${fx(x - 45)}px;top:${fx(y - 45)}px;transform:rotate(${fx(ang + 45)}deg)">${emoji(p.icon || '✈️', 0, 0, 90, 'position:relative')}</div>` +
      (p.text ? `<div class="abs" style="left:0;right:0;top:70px;text-align:center"><div class="hero" style="display:inline-block;font-size:${fit(p.text, 64)}px;color:${c.fg};${anim(lt, .2, null, 'hero')}">${esc(p.text)}</div></div>` : '') + vign(c);
  },
  heartbeat(p, lt) {
    const c = p.c; let d = '';
    for (let x = 0; x <= 1280; x += 8) {
      const ph = ((x / 1280) * 3 + 0) % 1, beat = ph > .42 && ph < .58 ? Math.sin((ph - .42) / .16 * Math.PI * 2) * (ph < .5 ? -150 : 70) : Math.sin(x * .05) * 4;
      d += `${x ? 'L' : 'M'}${x} ${fx(330 + beat)} `;
    }
    const k = loop(lt, 1.5), pulse = 1 + Math.max(0, Math.sin(k * Math.PI * 2)) * .14;
    return bgBase(c, 50, 50) + `<svg class="abs" style="left:0;top:0" width="1280" height="720"><path d="${d}" fill="none" stroke="${c.a}" stroke-width="6" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${fx(1 - E.outCubic(prog(lt, 0, 1.6)))}" style="filter:drop-shadow(0 0 10px ${c.a})"/></svg>
      <div class="abs" style="left:560px;top:120px;transform:scale(${fx(pulse)})">${emoji(p.icon || '❤️', 0, 0, 160, 'position:relative')}</div>
      <div class="abs" style="left:0;right:0;top:470px;text-align:center"><div class="mega" style="font-size:${fit(p.text || '', 82)}px;color:${c.fg};${anim(lt, .3, null, 'hero')}">${esc(p.text || '')}</div>
      ${p.num != null ? `<div class="label" style="color:${c.a};font-size:44px;margin-top:10px;${anim(lt, .5)}">${countUp(lt, p.num, .5)}${esc(p.unit ?? ' BPM')}</div>` : p.sub ? `<div class="label" style="color:${c.a};margin-top:10px;${anim(lt, .5)}">${esc(p.sub)}</div>` : ''}</div>` + vign(c);
  },
  house_build(p, lt) {
    const c = p.c, k = E.outCubic(prog(lt, .1, 1.6)), lit = lt > 1.7;
    const path = 'M420 520 L420 330 L640 170 L860 330 L860 520 Z M560 520 L560 420 L720 420 L720 520 M470 340 L560 340 L560 400 L470 400 Z';
    return bgBase(c, 50, 40) + `<div class="abs" style="left:380px;top:540px;width:520px;height:6px;border-radius:3px;background:${c.mu}"></div>
      <svg class="abs" style="left:0;top:0" width="1280" height="720"><path d="${path}" fill="${lit ? c.a + '22' : 'none'}" stroke="${c.a}" stroke-width="8" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${fx(1 - k)}" style="filter:drop-shadow(0 0 12px ${c.a}88)"/>
      ${lit ? `<rect x="470" y="340" width="90" height="60" fill="${c.b}" opacity="${fx(.6 + .3 * Math.sin(lt * 4))}"/>` : ''}</svg>
      ${p.icon ? `<div class="abs" style="left:760px;top:120px;${anim(lt, 1.6, null, 'pop')}">${emoji(p.icon, 0, 0, 110, 'position:relative')}</div>` : ''}
      <div class="abs" style="left:0;right:0;top:590px;text-align:center"><div class="hero" style="display:inline-block;font-size:${fit(p.text || '', 64)}px;color:${c.fg};${anim(lt, .6, null, 'hero')}">${esc(p.text || '')}</div></div>` + vign(c);
  },
  shopping_cart(p, lt) {
    const c = p.c, its = p.items?.length ? p.items : ['👕', '👟', '🎧', '📱'];
    let h = bgBase(c, 50, 60) + `<div class="abs" style="left:450px;top:250px">${emoji(p.icon || '🛒', 0, 0, 320, 'position:relative')}</div>`;
    its.slice(0, 5).forEach((e, i) => {
      // items drop in and pile up on top of the basket, so they stay visible
      const t0 = .2 + i * .35, k = E.inQuad(prog(lt, t0, .45)), land = lt > t0 + .45;
      const x = 500 + (i % 3) * 80 + (i > 2 ? 40 : 0), yEnd = 240 - (i > 2 ? 60 : 0), y = land ? yEnd + Math.sin(prog(lt, t0 + .45, .25) * Math.PI) * -14 : lerp(-140, yEnd, k);
      h += `<div class="abs" style="left:${x}px;top:${fx(y)}px;transform:rotate(${(i % 2 ? 1 : -1) * 12}deg)">${emoji(e, 0, 0, 110, 'position:relative')}</div>`;
    });
    return h + `<div class="abs" style="left:0;right:0;top:590px;text-align:center"><span class="hero" style="font-size:${fit(p.text || '', 60)}px;color:${c.fg};${anim(lt, .3, null, 'hero')}">${esc(p.text || '')}</span>
      ${p.num != null ? `<span class="mega" style="margin-left:24px;font-size:60px;color:${c.a};${glowTxt(c, .6)}">${countUp(lt, p.num, .4)}${esc(p.unit ?? 'đ')}</span>` : ''}</div>` + vign(c);
  },
  price_tag(p, lt) {
    const c = p.c, sw = Math.sin(lt * 3) * Math.exp(-lt * 1.2) * 14, cut = lt > .9;
    const old = p.sub || '', now = p.num != null ? countUp(lt, p.num, .9, .8) + esc(p.unit ?? 'đ') : esc(p.text || 'SALE');
    return bgBase(c, 40, 40) + `<div class="abs" style="left:640px;top:60px;width:4px;height:120px;background:${c.mu}"></div>
      <div class="abs" style="left:420px;top:170px;width:440px;height:300px;transform-origin:50% -100px;transform:rotate(${fx(sw)}deg);${anim(lt, 0, null, 'hero')}">
        <div style="width:440px;height:300px;border-radius:28px;background:${c.a};box-shadow:0 30px 60px rgba(0,0,0,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px">
          <div style="width:30px;height:30px;border-radius:50%;background:${c.bg};margin-bottom:10px"></div>
          ${old ? `<div style="font:700 40px var(--sans);color:${c.bg};opacity:.7;text-decoration:${cut ? 'line-through' : 'none'}">${esc(old)}</div>` : ''}
          <div class="mega" style="font-size:${fit(String(now), 84, 400)}px;color:#fff">${now}</div></div></div>
      ${p.num != null && p.text ? `<div class="abs" style="left:0;right:0;top:530px;text-align:center"><div class="hero" style="display:inline-block;font-size:${fit(p.text, 64)}px;color:${c.fg};${anim(lt, .4, null, 'hero')}">${esc(p.text)}</div></div>` : ''}` + vign(c);
  },
  star_rating(p, lt) {
    const c = p.c, r = Math.min(5, Math.max(0, p.num ?? 4.9));
    let stars = '';
    for (let i = 0; i < 5; i++) {
      const f = clamp(r - i) * E.outCubic(prog(lt, .2 + i * .18, .3));
      stars += `<div style="position:relative;width:150px;height:150px;${anim(lt, .1 + i * .12, null, 'pop')}"><svg viewBox="0 0 24 24" width="150" height="150"><defs><linearGradient id="sg${i}"><stop offset="${fx(f)}" stop-color="${c.b}"/><stop offset="${fx(f)}" stop-color="${c.mu}55"/></linearGradient></defs>
        <path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z" fill="url(#sg${i})"/></svg></div>`;
    }
    return bgBase(c, 50, 40) + `<div class="abs" style="left:0;right:0;top:150px;display:flex;justify-content:center;gap:14px">${stars}</div>
      <div class="abs" style="left:0;right:0;top:340px;text-align:center"><div class="mega" style="font-size:110px;color:${c.fg}">${countUp(lt, r, .3, 1.2)}<span style="font-size:50px;color:${c.mu}">/5</span></div>
      <div class="label" style="color:${c.a};font-size:44px;margin-top:6px;${anim(lt, .6)}">${esc(p.text || '')}</div></div>` + vign(c);
  },
  gift_box(p, lt) {
    const c = p.c, open = E.outBack(prog(lt, .7, .4), 2), burst = prog(lt, .75, .9);
    let rays = '';
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = 80 + burst * 260; rays += `<div class="abs" style="left:${fx(640 + Math.cos(a) * r - 12)}px;top:${fx(300 + Math.sin(a) * r * .7 - 12)}px;width:24px;height:24px;border-radius:6px;background:${i % 2 ? c.a : c.b};opacity:${fx(1 - burst)};transform:rotate(${fx(a * 60)}deg)"></div>`; }
    return bgBase(c, 50, 50) + rays + `<div class="abs" style="left:480px;top:${fx(260 - open * 60)}px;transform:rotate(${fx(-open * 18)}deg);transform-origin:0 100%;width:320px;height:70px;border-radius:14px;background:${c.a};box-shadow:0 10px 30px rgba(0,0,0,.4)"></div>
      <div class="abs" style="left:500px;top:330px;width:280px;height:220px;border-radius:16px;background:${c.a};box-shadow:0 30px 60px rgba(0,0,0,.4)"><div style="position:absolute;left:120px;top:0;width:40px;height:220px;background:${c.b}"></div></div>
      ${lt > .9 ? `<div class="abs" style="left:560px;top:${fx(250 - E.outCubic(prog(lt, .9, .5)) * 140)}px">${emoji(p.icon || '🎁', 0, 0, 160, 'position:relative')}</div>` : ''}
      <div class="abs" style="left:0;right:0;top:590px;text-align:center"><div class="hero" style="display:inline-block;font-size:${fit(p.text || '', 64)}px;color:${c.fg};${anim(lt, 1, null, 'hero')}">${esc(p.text || '')}</div></div>` + vign(c);
  },
  book_open(p, lt) {
    const c = p.c, flip = loop(lt, 1.1), page = Math.cos(flip * Math.PI);
    return bgBase(c, 50, 50) + `<div class="abs" style="left:340px;top:160px;width:600px;height:360px;perspective:1600px;${anim(lt, 0, null, 'hero')}">
      <div style="position:absolute;left:0;top:0;width:300px;height:360px;border-radius:14px 0 0 14px;background:${c.light ? '#fff' : '#F3EEE6'};box-shadow:0 20px 50px rgba(0,0,0,.45)"></div>
      <div style="position:absolute;left:300px;top:0;width:300px;height:360px;border-radius:0 14px 14px 0;background:${c.light ? '#fff' : '#F7F2EA'};box-shadow:0 20px 50px rgba(0,0,0,.45)"></div>
      ${[0, 1, 2, 3, 4].map(i => `<div style="position:absolute;left:${i % 2 ? 340 : 40}px;top:${60 + Math.floor(i / 2) * 50}px;width:220px;height:14px;border-radius:7px;background:#00000018"></div>`).join('')}
      <div style="position:absolute;left:300px;top:0;width:300px;height:360px;transform-origin:0 50%;transform:scaleX(${fx(page)});background:${page > 0 ? '#FFFFFF' : '#E6E0D6'};border-radius:0 14px 14px 0"></div></div>
      <div class="abs" style="left:560px;top:40px;${anim(lt, .2, null, 'pop')}">${emoji(p.icon || '📚', 0, 0, 130, 'position:relative')}</div>
      <div class="abs" style="left:0;right:0;top:570px;text-align:center"><div class="hero" style="display:inline-block;font-size:${fit(p.text || '', 64)}px;color:${c.fg};${anim(lt, .4, null, 'hero')}">${esc(p.text || '')}</div></div>` + vign(c);
  },
  gauge(p, lt) {
    const c = p.c, v = clamp((p.num ?? 85) / 100), k = E.outCubic(prog(lt, .2, 1.4)) * v, a = -90 + k * 180;
    return bgBase(c, 50, 55) + `<svg class="abs" style="left:0;top:0" width="1280" height="720">
      <path d="M 410 470 A 230 230 0 1 1 870 470" fill="none" stroke="${c.mu}44" stroke-width="40" stroke-linecap="round"/>
      <path d="M 410 470 A 230 230 0 1 1 870 470" fill="none" stroke="${c.a}" stroke-width="40" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${fx(1 - k)}" style="filter:drop-shadow(0 0 14px ${c.a})"/></svg>
      <div class="abs" style="left:634px;top:270px;width:12px;height:200px;border-radius:6px;background:${c.fg};transform-origin:50% 100%;transform:rotate(${fx(a)}deg)"></div>
      <div class="abs" style="left:610px;top:440px;width:60px;height:60px;border-radius:50%;background:${c.fg}"></div>
      <div class="abs" style="left:0;right:0;top:520px;text-align:center"><div class="mega" style="font-size:96px;color:${c.a}">${countUp(lt, p.num ?? 85, .2, 1.4)}${esc(p.unit ?? '%')}</div>
      <div class="label" style="color:${c.fg};font-size:40px;${anim(lt, .5)}">${esc(p.text || '')}</div></div>` + vign(c);
  },
  trophy(p, lt) {
    const c = p.c; let conf = '';
    for (let i = 0; i < 40; i++) {
      const x = R(p.seed, i) * 1280, y = ((lt * (120 + R(p.seed, i + 3) * 160) + R(p.seed, i + 5) * 720) % 820) - 60;
      conf += `<div class="abs" style="left:${fx(x)}px;top:${fx(y)}px;width:14px;height:22px;background:${[c.a, c.b, c.fg][i % 3]};transform:rotate(${fx(lt * 200 + i * 40)}deg);opacity:.85"></div>`;
    }
    return bgBase(c, 50, 40) + `<div class="abs" style="left:640px;top:260px;width:600px;height:600px;margin:-300px;background:repeating-conic-gradient(${c.a}33 0 10deg, transparent 10deg 20deg);border-radius:50%;transform:rotate(${fx(lt * 20)}deg);-webkit-mask-image:radial-gradient(circle,#000,transparent 70%)"></div>` + conf +
      `<div class="abs" style="left:530px;top:110px;${anim(lt, .05, null, 'pop')}"><div style="transform:${bob(lt, 0, 6)}">${emoji(p.icon || '🏆', 0, 0, 220, 'position:relative')}</div></div>
      <div class="abs" style="left:0;right:0;top:450px;text-align:center"><div class="mega" style="font-size:${fit(p.text || '', 92)}px;color:${c.b};${glowTxt(c, .7)};${anim(lt, .3, null, 'mega')}">${esc(p.text || '')}</div>
      ${p.sub ? `<div class="label" style="color:${c.fg};margin-top:12px;${anim(lt, .55)}">${esc(p.sub)}</div>` : ''}</div>` + vign(c);
  },
};
const BR_TEMPLATES = Object.keys(BRL);

// Timeline module: { type:"broll", template|id, pal, text, sub, icon, items, num, unit, seed, layout:"full"|"card"|"right"|"left"|"pip", x,y,w,h, rot, person }
MODULES.broll = function (s, t, lt) {
  const fn = BRL[s.template] || BRL.particles;
  const p = { ...s, c: typeof s.pal === 'object' ? s.pal : PAL[s.pal || 'ember'], seed: s.seed ?? 1 };
  const d = s.t1 - s.t0;
  const W = 1280, H = 720;
  const inner = `<div class="abs" style="left:0;top:0;width:${W}px;height:${H}px;overflow:hidden">${fn(p, lt, d)}</div>`;
  const lay = s.layout || 'full';
  if (lay === 'full') {
    // Full-frame b-roll stacks in timeline order (covers earlier modules); with person:true it becomes the background behind the cutout.
    // Fades out over the 0.25 s linger after t1 (see compose) -> crossfade into the next shot instead of a black dip.
    // fit:"cover" (auto b-roll in vertical): scale the 1280×720 preset to cover the whole frame, centred.
    const [FW, FH] = (s.fit === 'cover' || s.fit === 'portrait') && typeof DIMS === 'function' ? DIMS() : [W, H], k = Math.max(FW / W, FH / H);
    const at = (kk, y, extra = '') => `<div style="position:absolute;left:${((FW - W * kk) / 2).toFixed(1)}px;top:${y.toFixed(1)}px;width:${W}px;height:${H}px;transform:scale(${kk.toFixed(4)});transform-origin:0 0;${extra}">${inner}</div>`;
    // fit:"portrait" (9:16 without letterbox or cropped text): the preset is laid out on a 1280-wide canvas as tall as the
    // frame; its full-bleed layers (.full: background, vignette) stretch over the whole canvas while the content stays in a
    // 720-px band in the middle (s.zoom, default 1), so nothing is cropped and there is no band edge.
    let body;
    if (k === 1) body = inner;
    else if (s.fit === 'portrait' && FH > FW) {
      const z = s.zoom || 1, kw = FW / W * z, CH = FH / kw, off = (CH - H) / 2;
      body = `<div style="position:absolute;left:${((FW - W * kw) / 2).toFixed(1)}px;top:0;width:${W}px;height:${CH.toFixed(1)}px;transform:scale(${kw.toFixed(4)});transform-origin:0 0">
        <style>.brp>.full{top:${(-off).toFixed(1)}px!important;bottom:${(-off).toFixed(1)}px!important}</style>
        <div class="abs brp" style="left:0;top:${off.toFixed(1)}px;width:${W}px;height:${H}px">${fn(p, lt, d)}</div></div>`;
    } else body = at(k, (FH - H * k) / 2);
    const html = `<div class="full" style="${anim(t, s.t0, s.keep ? null : s.t1 + .25, 'fade')}">${body}</div>`;
    const cover = lt > .25 && t < s.t1;
    return s.person ? { back: html, person: true, cover } : { front: html, cover };
  }
  const box = { card: [190, 90, 900, 506], right: [660, 70, 580, 326], left: [40, 70, 580, 326], pip: [860, 60, 380, 214] }[lay] || [s.x, s.y, s.w, s.h];
  const [x, y, w, h] = [s.x ?? box[0], s.y ?? box[1], s.w ?? box[2], s.h ?? box[3]];
  const sc = w / W;
  return {
    front: `<div class="abs" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.55);border:2px solid rgba(255,255,255,.15);
      ${anim(t, s.t0, s.keep ? null : s.t1, 'hero', `rotate(${s.rot ?? 0}deg)`)}"><div style="transform:scale(${sc.toFixed(4)});transform-origin:0 0">${inner}</div></div>`,
  };
};
