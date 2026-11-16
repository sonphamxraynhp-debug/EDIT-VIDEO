// "Beat slideshow" pack — photos → video cut exactly on the music's beats (property tours, product showcases,
// events). No speaker needed. Beat times come from scripts/beats.py (stored in timeline.beats = {bpm, beats,
// downbeats, levels, fps}) or per scene `beats:[t…]`; without either a grid from `bpm` (default 120) is used.
// Every module is a pure function of t. Colours/fonts/logo/contact from BR() (timeline.brand).
// Positioning: x/y = centre, size (module-specific default). Spec: references/pack-beatslide.md.
(() => {
  const P = 'beatslide';
  const f3 = v => (+v).toFixed(3), f1 = v => (+v).toFixed(1);
  const pal = () => { const b = BR(); return { p: b.primary, a: b.accent, d: b.dark, l: b.light, m: b.muted, font: b.font, disp: b.disp, b }; };
  const dims = () => { try { return DIMS(); } catch (e) { return [720, 1280]; } };
  const vert = () => { try { return VERT(); } catch (e) { return true; } };
  const g = () => (typeof TL !== 'undefined' && TL && TL.beats) || {};

  // ---------- beat helpers ----------
  // Absolute beat times for a scene: s.beats → timeline.beats.beats → grid from bpm starting at t0 + offset.
  function beatsOf(s, key = 'beats') {
    if (Array.isArray(s[key]) && s[key].length) return s[key];
    if (key === 'beats' && s.downbeats_only && Array.isArray(g().downbeats)) return g().downbeats;
    if (Array.isArray(g()[key]) && g()[key].length) return g()[key];
    const bpm = s.bpm || g().bpm || 120, per = 60 / bpm * (key === 'downbeats' ? 4 : 1), out = [];
    for (let t = (s.t0 || 0) + (s.offset || 0); t < (s.t1 ?? 60) + 2; t += per) out.push(+t.toFixed(4));
    return out;
  }
  // Index of the last beat <= t (binary search), -1 if none.
  function lastIdx(bs, t) {
    let lo = 0, hi = bs.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (bs[m] <= t + 1e-6) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  // 1 on the beat, decaying exponentially (decay s); 0 before the first beat.
  function pulse(bs, t, decay = .16, from = -1e9) {
    const i = lastIdx(bs, t);
    if (i < 0 || bs[i] < from) return 0;
    return Math.exp(-(t - bs[i]) / decay);
  }
  // Beats inside [a, b), taking every n-th one.
  const beatsIn = (bs, a, b, n = 1, skip = 0) => bs.filter(x => x >= a - 1e-6 && x < b).filter((_, i) => i >= skip && (i - skip) % n === 0);
  // Audio level 0..1 at t from levels[] (fps), else a synthetic envelope from the beats.
  function levelAt(s, t) {
    const L = s.levels || g().levels, fps = s.levels_fps || g().fps || 30;
    if (Array.isArray(L) && L.length) {
      const x = t * fps, i = Math.floor(x), k = x - i;
      return lerp(L[clamp(i, 0, L.length - 1)] || 0, L[clamp(i + 1, 0, L.length - 1)] || 0, k);
    }
    return .35 + .55 * pulse(beatsOf(s), t, .22);
  }

  // ---------- image helpers ----------
  const HUES = [[24, 80], [200, 70], [330, 70], [150, 60], [265, 65], [45, 85]];
  function placeholder(i, label) {
    const [h, sat] = HUES[i % HUES.length];
    return `<div class="full" style="background:radial-gradient(120% 90% at 30% 20%, hsl(${h} ${sat}% 62%), hsl(${(h + 40) % 360} ${sat}% 28%) 70%, hsl(${(h + 60) % 360} 40% 12%));display:flex;align-items:center;justify-content:center">
      <div style="font:800 44px var(--disp);color:rgba(255,255,255,.85);letter-spacing:.08em;text-shadow:0 4px 20px rgba(0,0,0,.35)">📷 ${String(i + 1).padStart(2, '0')}${label ? `<div style="font-size:22px;font-weight:600;letter-spacing:.02em;text-align:center;opacity:.8">${esc(label)}</div>` : ''}</div></div>`;
  }
  // Ken Burns variants per segment index: [scale from, scale to, panX %, panY %].
  const KB = [[1.04, 1.16, -2, -1.5], [1.16, 1.05, 2, 1], [1.05, 1.15, 2.5, -1], [1.15, 1.04, -2, 1.5]];
  function photo(s, imgs, j, t, seg0, seg1, extra = '', filt = '') {
    const n = imgs.length, idx = n ? j % n : j;
    const kb = KB[j % KB.length], k = E.inOutSine(clamp((t - seg0) / Math.max(.3, seg1 - seg0)));
    const sc = s.kenburns === false ? 1 : lerp(kb[0], kb[1], k), px = s.kenburns === false ? 0 : lerp(0, kb[2], k), py = s.kenburns === false ? 0 : lerp(0, kb[3], k);
    const fit = s.fit || 'cover';
    const inner = n ? `${fit === 'blurfill' ? `<img src="${media(imgs[idx], t)}" style="position:absolute;inset:-40px;width:calc(100% + 80px);height:calc(100% + 80px);object-fit:cover;filter:blur(28px) brightness(.6)">` : ''}
        <img src="${media(imgs[idx], t)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${fit === 'blurfill' ? 'contain' : 'cover'};transform:translate(${f1(px)}%,${f1(py)}%) scale(${f3(sc)});filter:${s.filter || 'contrast(1.05) saturate(1.1)'} ${filt}">`
      : placeholder(idx, (s.labels || [])[idx]);
    return `<div class="full" style="overflow:hidden;${extra}">${inner}</div>`;
  }

  // ---------- caption-free text bits ----------
  const starAccent = (txt, a) => esc(txt).replace(/\*([^*]+)\*/g, `<span style="color:${a}">$1</span>`);

  Object.assign(MODULES, {
    // Photos cut exactly on beats; each cut uses the next transition style; Ken Burns between beats.
    // images[], beats[] (abs s), every (cut every n beats, 1), skip (beats skipped first), trans: 'zoom'|'slide'|'flash'|'glitch'|[…]|'mix',
    // labels[], label_pos 'bl'|'tc', counter (01/08), progress (story bars), fit 'cover'|'blurfill', kenburns, filter.
    beat_slideshow(s, t) {
      const [W, H] = dims(), C = pal(), imgs = s.images || [];
      // Cut grid counts from the first beat at/after t0 (keeps bar phase: a slideshow starting on a downbeat cuts on 1 and 3).
      const cuts = [s.t0, ...beatsIn(beatsOf(s), s.t0 - .03, s.t1 - .05, s.every || 1, s.skip || 0).filter(b => b > s.t0 + .12)];
      const j = Math.max(0, lastIdx(cuts, t)), c0 = cuts[j], c1 = cuts[j + 1] ?? s.t1;
      const styles = Array.isArray(s.trans) ? s.trans : (!s.trans || s.trans === 'mix') ? ['zoom', 'slide', 'flash', 'glitch'] : [s.trans];
      const st = styles[(j - 1 + styles.length * 100) % styles.length], lt = t - c0;
      let html = '';
      const D = { zoom: .32, slide: .3, flash: .3, glitch: .26, cut: 0 }[st] ?? .3;
      if (j === 0 || lt >= D || st === 'cut') {
        html = photo(s, imgs, j, t, c0, c1);
      } else {
        const p = lt / D, prevSeg0 = cuts[j - 1];
        if (st === 'zoom') {
          const e = E.outExpo(p);
          html = photo(s, imgs, j, t, c0, c1, `transform:scale(${f3(lerp(1.38, 1, e))})`, `brightness(${f3(1 + .55 * (1 - e))})`) +
            `<div class="full" style="background:radial-gradient(circle at 50% 50%, rgba(255,255,255,.55), rgba(255,255,255,0) 70%);opacity:${f3((1 - p) * .9)}"></div>`;
        } else if (st === 'slide') {
          const e = E.outExpo(p), dir = (j % 2) ? 'X' : 'Y', sg = (j % 4 < 2) ? 1 : -1, bl = f1((1 - p) * 10);
          html = photo(s, imgs, j - 1, t, prevSeg0, c0, `transform:translate${dir}(${f1(-sg * e * 100)}%)`, `blur(${bl}px)`) +
            photo(s, imgs, j, t, c0, c1, `transform:translate${dir}(${f1(sg * (1 - e) * 100)}%)`, `blur(${bl}px)`);
        } else if (st === 'flash') {
          html = photo(s, imgs, j, t, c0, c1, '', `brightness(${f3(1 + .8 * (1 - p))})`) +
            `<div class="full" style="background:#fff;opacity:${f3(Math.pow(1 - p, 2))}"></div>`;
        } else { // glitch: RGB split + displaced slices + a couple of frames of the previous photo
          const fr = Math.floor(t * 30), r = k => rnd(fr * 7 + k), amp = (1 - p) * 34;
          const showPrev = p < .35 && r(1) > .5;
          const base = showPrev ? photo(s, imgs, j - 1, t, prevSeg0, c0) : photo(s, imgs, j, t, c0, c1);
          const tint = (hue, dx) => `<div class="full" style="mix-blend-mode:screen;opacity:${f3(.55 * (1 - p * .6))};transform:translateX(${f1(dx)}px)">${photo(s, imgs, j, t, c0, c1, '', `grayscale(1) sepia(1) saturate(9) hue-rotate(${hue}deg) brightness(.42)`)}</div>`;
          let slices = '';
          for (let k = 0; k < 4; k++) {
            const y0 = Math.floor(r(10 + k) * 90), h = 3 + Math.floor(r(20 + k) * 12);
            slices += `<div class="full" style="clip-path:inset(${y0}% 0 ${Math.max(0, 100 - y0 - h)}% 0);transform:translateX(${f1((r(30 + k) - .5) * amp * 3)}px)">${photo(s, imgs, j, t, c0, c1, '', 'saturate(1.6)')}</div>`;
          }
          html = base + tint(-50, amp) + tint(140, -amp) + slices +
            `<div class="full" style="background:repeating-linear-gradient(transparent 0 3px, rgba(0,0,0,.18) 3px 4px);opacity:${f3(1 - p)}"></div>`;
        }
      }
      // overlays: label pill, counter, story progress, logo watermark
      const n = Math.max(1, imgs.length), idx = j % n, lab = (s.labels || [])[idx];
      let over = `<div class="full" style="background:linear-gradient(180deg, rgba(0,0,0,.28), transparent 22%, transparent 62%, rgba(0,0,0,.55))"></div>`;
      if (lab) {
        const k = E.outBack(clamp(lt / .3), 1.4), o = clamp(lt / .12);
        const top = s.label_pos === 'tc';
        const sz = s.label_size || (vert() ? 34 : 30);
        over += `<div class="abs"${cidOf(s.label_cid ? { cid: s.label_cid } : null)} style="${top ? `left:0;right:0;top:${vert() ? 150 : 60}px;text-align:center` : `left:${vert() ? 44 : 56}px;bottom:${s.label_y ?? (vert() ? 300 : 70)}px`};opacity:${f3(o)};transform:translateX(${f1((1 - k) * -40)}px)">
          <span style="display:inline-block;font:800 ${sz}px ${C.disp};letter-spacing:.01em;color:${C.l};text-transform:uppercase;text-shadow:0 3px 18px rgba(0,0,0,.6)">${esc(lab)}</span>
          <div style="height:5px;width:${f1(clamp(lt / .4) * 90)}px;background:${C.a};margin-top:8px;border-radius:3px;${top ? 'margin-left:auto;margin-right:auto' : ''}"></div></div>`;
      }
      if (s.counter !== false && imgs.length > 1) {
        over += `<div class="abs" style="right:${vert() ? 40 : 56}px;top:${vert() ? 120 : 44}px;font:800 24px ${C.disp};color:${C.l};letter-spacing:.06em;padding:6px 14px;border-radius:30px;background:rgba(0,0,0,.38)">
          <span style="color:${C.a}">${String(idx + 1).padStart(2, '0')}</span><span style="opacity:.6"> / ${String(n).padStart(2, '0')}</span></div>`;
      }
      if (s.progress) {
        const segs = Math.min(cuts.length, 24);
        over += `<div class="abs" style="left:24px;right:24px;top:${vert() ? 70 : 20}px;display:flex;gap:6px">${Array.from({ length: segs }, (_, i) => {
          const a = cuts[i], b = cuts[i + 1] ?? s.t1, k = clamp((t - a) / (b - a));
          return `<div style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.3);overflow:hidden"><div style="height:100%;width:${f1(k * 100)}%;background:#fff"></div></div>`;
        }).join('')}</div>`;
      }
      const logo = s.logo ?? C.b.logo;
      if (logo) over += `<div class="abs" style="left:${vert() ? 40 : 56}px;top:${vert() ? 110 : 40}px;opacity:.92">${slIcon(logo, vert() ? 64 : 52, 'white')}</div>`;
      return { back: `<div class="full"${cidOf(s)}>${html}${over}</div>`, cover: true, hideCaptions: s.hideCaptions ?? false };
    },

    // Pulses any background on each beat: the A-roll / main track (default) or `media` (image/seq).
    // amp (scale .06), bright (.25), decay (.16 s), edge (accent glow on the frame edge, true), downbeats_only.
    beat_pulse(s, t) {
      const C = pal(), bs = s.downbeats_only ? beatsOf(s, 'downbeats') : beatsOf(s);
      const k = pulse(bs, t, s.decay || .16, s.t0 - .01) * fadeIO(t, s.t0, s.t1, .1, .2);
      const sc = 1 + (s.amp ?? .06) * k, br = 1 + (s.bright ?? .25) * k;
      const bg = s.media ? `<img class="cover" src="${media(s.media, t)}" style="transform:scale(${f3(sc)});filter:brightness(${f3(br)}) contrast(1.05)">`
        : `<div class="full" style="transform:scale(${f3(sc)});transform-origin:50% 45%">${arollImg(t, `brightness(${f3(br)})`)}</div>`;
      const edge = s.edge === false ? '' : `<div class="full" style="box-shadow:inset 0 0 ${f1(60 + 80 * k)}px ${f1(10 + 26 * k)}px ${C.a};opacity:${f3(.85 * k)};mix-blend-mode:screen"></div>`;
      return { back: `<div class="full" style="overflow:hidden"${cidOf(s)}>${bg}</div>`, front: edge, cover: true };
    },

    // Word-per-beat kinetic text. words[] (or text), mode 'single' (one big word at a time) | 'stack' (words pile up),
    // every (1), delay (s after t0 before the first word), x/y/size, colors[], box (dark plate). *word* = accent.
    beat_text(s, t) {
      const [W, H] = dims(), C = pal();
      const words = s.words || String(s.text || 'BEAT DROP').split(/\s+/);
      const bs = beatsIn(beatsOf(s), s.t0 + (s.delay || 0) - .02, s.t1, s.every || 1).slice(0, words.length);
      const i = lastIdx(bs, t);
      if (i < 0) return {};
      const out = fadeIO(t, s.t0, s.t1, .01, .18), size = s.size || (vert() ? 118 : 104);
      const x = s.x ?? W / 2, y = s.y ?? (vert() ? 560 : H / 2);
      const cols = s.colors || [C.l, C.a, C.l, C.p];
      const word = (w, k, lt, fs) => {
        const e = E.outExpo(clamp(lt / .2)), acc = /^\*.*\*$/.test(w), txt = w.replace(/^\*|\*$/g, '');
        const col = acc ? C.a : cols[k % cols.length];
        const pz = 1 + .06 * pulse(bs, t, .14, bs[k]);
        return `<div style="font:900 ${fs}px ${s.font || C.disp};color:${col};text-transform:${s.upper === false ? 'none' : 'uppercase'};letter-spacing:-.01em;line-height:.95;white-space:nowrap;
          opacity:${f3(clamp(lt / .06))};transform:scale(${f3(lerp(1.7, 1, e) * pz)});filter:blur(${f1((1 - e) * 10)}px);text-shadow:0 6px 30px rgba(0,0,0,.55), 0 0 2px rgba(0,0,0,.4)">${esc(txt)}</div>`;
      };
      const fit = w => Math.min(size, (W * .86) / Math.max(1, w.replace(/\*/g, '').length * .66));
      let inner;
      if ((s.mode || 'single') === 'stack') inner = bs.slice(0, i + 1).map((b, k) => word(words[k], k, t - b, fit(words[k]) * .72)).join('');
      else inner = word(words[i], i, t - bs[i], fit(words[i]));
      const plate = s.box ? `background:rgba(0,0,0,.45);padding:24px 36px;border-radius:24px;` : '';
      return {
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%);opacity:${f3(out)};text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;${plate}">${inner}</div>`,
        hideCaptions: true,
      };
    },

    // Polaroid / rounded-card collage: images pop in on beats. images[], labels[], style 'polaroid'|'rounded',
    // every (1), delay, bg 'blur'|'paper'|css colour, title, cards:[{x,y,w,r}] (override layout), size (card width).
    beat_frame(s, t) {
      const [W, H] = dims(), C = pal(), V = vert(), imgs = s.images || [], n = Math.max(1, Math.min(s.max || 6, imgs.length || 4));
      const bs = beatsIn(beatsOf(s), s.t0 + (s.delay ?? 0) - .03, s.t1, s.every || 1).slice(0, n);
      const LAY = V ? [[220, 360, -7], [500, 420, 6], [250, 700, 5], [490, 760, -5], [230, 1020, -4], [480, 1060, 7]]
        : [[250, 260, -7], [560, 300, 5], [880, 250, -4], [1070, 440, 7], [400, 500, 4], [740, 520, -6]];
      const cw = s.size || (V ? 300 : 280), pol = (s.style || 'polaroid') === 'polaroid';
      const last = lastIdx(bs, t);
      const bgImg = imgs.length ? imgs[Math.max(0, last) % imgs.length] : null;
      const bg = s.bg === 'paper' ? `<div class="full" style="background:radial-gradient(120% 80% at 50% 30%, #F4ECDD, #D9CBB2)"></div>`
        : (s.bg && s.bg !== 'blur') ? `<div class="full" style="background:${s.bg}"></div>`
          : bgImg ? `<img class="cover" src="${media(bgImg, t)}" style="filter:blur(26px) brightness(.45) saturate(1.2);transform:scale(1.15)">`
            : `<div class="full" style="background:radial-gradient(120% 80% at 50% 30%, ${C.p}, ${C.d})"></div>`;
      let cards = '';
      for (let k = 0; k <= last; k++) {
        const L = (s.cards || [])[k] || {}, d = LAY[k % LAY.length];
        const x = L.x ?? d[0], y = L.y ?? d[1], rot = L.r ?? d[2], w = L.w ?? cw, h = Math.round(w * (pol ? 1.12 : 1.25));
        const lt = t - bs[k], e = E.outBack(clamp(lt / .38), 1.5), o = clamp(lt / .1);
        const settle = 1 + .03 * pulse(beatsOf(s), t, .14, bs[k] + .3);
        const ph = imgs.length ? `<img src="${media(imgs[k % imgs.length], t)}" style="width:100%;height:100%;object-fit:cover;display:block">` : `<div style="position:relative;width:100%;height:100%">${placeholder(k)}</div>`;
        const lab = (s.labels || [])[k];
        cards += pol
          ? `<div class="abs"${cidOf(L)} style="left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;padding:${Math.round(w * .05)}px ${Math.round(w * .05)}px ${Math.round(w * .2)}px;background:#FBFAF6;border-radius:4px;
              box-shadow:0 ${f1(10 + 20 * e)}px ${f1(20 + 30 * e)}px rgba(0,0,0,.45);opacity:${f3(o)};transform:rotate(${f1(rot + (1 - e) * 18)}deg) scale(${f3(lerp(1.6, 1, e) * settle)})">
              <div style="width:100%;height:${Math.round(w * .82)}px;overflow:hidden;background:#222">${ph}</div>
              ${lab ? `<div style="position:absolute;left:0;right:0;bottom:${Math.round(w * .045)}px;text-align:center;font:400 ${Math.round(w * .085)}px Pacifico, cursive;color:#2A2A2A">${esc(lab)}</div>` : ''}</div>`
          : `<div class="abs"${cidOf(L)} style="left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;border-radius:26px;overflow:hidden;border:4px solid rgba(255,255,255,.9);
              box-shadow:0 ${f1(10 + 20 * e)}px ${f1(24 + 30 * e)}px rgba(0,0,0,.5);opacity:${f3(o)};transform:rotate(${f1(rot * .5 + (1 - e) * 12)}deg) scale(${f3(lerp(1.5, 1, e) * settle)})">${ph}
              ${lab ? `<div style="position:absolute;left:0;right:0;bottom:0;padding:30px 14px 12px;background:linear-gradient(transparent, rgba(0,0,0,.7));font:800 ${Math.round(w * .08)}px ${C.disp};color:#fff;text-transform:uppercase">${esc(lab)}</div>` : ''}</div>`;
      }
      const title = s.title ? `<div class="abs" style="left:0;right:0;top:${V ? 110 : 40}px;text-align:center;font:900 ${V ? 54 : 46}px ${C.disp};color:${s.bg === 'paper' ? C.d : C.l};text-transform:uppercase;
          opacity:${f3(clamp((t - s.t0) / .25))};text-shadow:${s.bg === 'paper' ? 'none' : '0 4px 20px rgba(0,0,0,.5)'}">${starAccent(s.title, C.a)}</div>` : '';
      return { back: `<div class="full"${cidOf(s)} style="overflow:hidden;opacity:${f3(fadeIO(t, s.t0, s.t1, .2, .25))}">${bg}${title}${cards}</div>`, cover: true, hideCaptions: s.hideCaptions ?? true };
    },

    // Audio-reactive EQ bars from levels[] (scripts/beats.py) — mode 'bars' (bottom) | 'mirror' (centre) | 'circle' (ring + logo).
    // n (32 / circle 48), x/y (centre), w/h (area), colors [from, to], opacity.
    beat_bars(s, t) {
      const [W, H] = dims(), C = pal(), mode = s.mode || 'bars';
      const bs = beatsOf(s), bp = pulse(bs, t, .2), lv = levelAt(s, t);
      const o = fadeIO(t, s.t0, s.t1, .25, .25) * (s.opacity ?? 1);
      const c1 = (s.colors || [])[0] || C.p, c2 = (s.colors || [])[1] || C.a;
      const n = s.n || (mode === 'circle' ? 48 : 32);
      const bar = i => {
        const u = i / Math.max(1, n - 1), prof = mode === 'circle' ? .8 + .2 * Math.sin(u * Math.PI * 4) : 1 - .45 * u;
        const wig = .45 + .55 * Math.abs(Math.sin(i * 2.31 + t * 7.3 + Math.sin(i * .7) * 3 + Math.sin(t * 3.1 + i)));
        return clamp((lv * wig * prof) * 1.1 + bp * .28 * prof, .04, 1);
      };
      if (mode === 'circle') {
        const cx = s.x ?? W / 2, cy = s.y ?? (vert() ? 560 : H / 2), R = s.r || (vert() ? 150 : 120), L = s.h || 120;
        let bars = '';
        for (let i = 0; i < n; i++) {
          const a = i / n * 360, h = 8 + bar(i) * L;
          bars += `<div style="position:absolute;left:${cx - 4}px;top:${cy - R - h}px;width:8px;height:${f1(h)}px;border-radius:4px;background:linear-gradient(0deg, ${c1}, ${c2});transform-origin:4px ${f1(R + h)}px;transform:rotate(${f1(a)}deg)"></div>`;
        }
        const logo = s.logo ?? C.b.logo, sc = 1 + .08 * bp;
        const mid = `<div class="abs" style="left:${cx - R + 14}px;top:${cy - R + 14}px;width:${2 * R - 28}px;height:${2 * R - 28}px;border-radius:50%;background:${C.d};border:4px solid ${c2};
          display:flex;align-items:center;justify-content:center;transform:scale(${f3(sc)});box-shadow:0 0 ${f1(30 + 60 * bp)}px ${c1}">${logo ? slIcon(logo, R, 'white') : `<div style="font:900 ${Math.round(R * .5)}px ${C.disp};color:${C.l}">${esc(s.text || '♪')}</div>`}</div>`;
        return { front: `<div class="full"${cidOf(s)} style="opacity:${f3(o)}">${bars}${mid}</div>` };
      }
      const w = s.w || W - 80, h = s.h || (mode === 'mirror' ? 220 : 170), cx = s.x ?? W / 2, base = s.y ?? (mode === 'mirror' ? H / 2 : H - (vert() ? 190 : 40));
      const gap = 4, bw = (w - gap * (n - 1)) / n;
      let bars = '';
      for (let i = 0; i < n; i++) {
        const hh = bar(i) * h, x = cx - w / 2 + i * (bw + gap);
        bars += mode === 'mirror'
          ? `<div style="position:absolute;left:${f1(x)}px;top:${f1(base - hh / 2)}px;width:${f1(bw)}px;height:${f1(hh)}px;border-radius:${f1(bw / 2)}px;background:linear-gradient(180deg, ${c2}, ${c1} 50%, ${c2})"></div>`
          : `<div style="position:absolute;left:${f1(x)}px;top:${f1(base - hh)}px;width:${f1(bw)}px;height:${f1(hh)}px;border-radius:${f1(bw / 2)}px ${f1(bw / 2)}px 2px 2px;background:linear-gradient(0deg, ${c1}, ${c2})"></div>`;
      }
      return { front: `<div class="full"${cidOf(s)} style="opacity:${f3(o)};filter:drop-shadow(0 0 ${f1(6 + 14 * bp)}px ${c1})">${bars}</div>` };
    },

    // Opening card: logo pops on beat 1, tag on beat 2, title slams on beat 3, sub on beat 4.
    // title (*accent*), tag, sub, image (Ken Burns background), logo, x/y/size.
    beat_intro(s, t) {
      const [W, H] = dims(), C = pal(), V = vert();
      const bs = beatsIn(beatsOf(s), s.t0 - .02, s.t1 + 1);
      const at = k => bs[k] ?? (s.t0 + k * .45), lt = t - s.t0;
      const sz = (s.size || 60) / 60, x = s.x ?? W / 2, y = s.y ?? (V ? 600 : H / 2);
      const bg = s.image ? photo({ filter: 'brightness(.5) saturate(1.15)' }, [s.image], 0, t, s.t0, s.t1)
        : `<div class="full" style="background:radial-gradient(110% 70% at 50% 35%, ${C.p} 0%, ${C.d} 75%)"></div>`;
      const pop = (k, dur = .3) => { const e = E.outBack(clamp((t - at(k)) / dur), 1.8); return { e, o: clamp((t - at(k)) / .08) }; };
      const logo = s.logo ?? C.b.logo;
      const lp = pop(0), tp = pop(1), ti = pop(2, .22), sp = pop(3);
      const tpz = 1 + .05 * pulse(bs, t, .15, at(2) + .05);
      const flash = Math.max(0, ...[0, 1, 2, 3].map(k => (t >= at(k) && t < at(k) + .25) ? (1 - (t - at(k)) / .25) * .35 : 0));
      const tsz = Math.round(Math.min(92 * sz, (W * .88) / Math.max(4, String(s.title || '').replace(/\*/g, '').length * .6)));
      return {
        back: `<div class="full" style="overflow:hidden">${bg}<div class="full" style="background:radial-gradient(80% 60% at 50% 50%, transparent, rgba(0,0,0,.55))"></div></div>`,
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%);width:${W - 60}px;text-align:center;opacity:${f3(fadeIO(t, s.t0, s.t1, .01, .2))}">
          ${logo ? `<div style="display:inline-block;margin-bottom:${Math.round(26 * sz)}px;opacity:${f3(lp.o)};transform:scale(${f3(lp.e)})">${slIcon(logo, Math.round(96 * sz), 'white')}</div>` : ''}
          ${s.tag !== false ? `<div style="opacity:${f3(tp.o)};transform:translateY(${f1((1 - tp.e) * 20)}px)"><span style="display:inline-block;padding:8px 22px;border-radius:40px;background:${C.a};color:${C.d};font:800 ${Math.round(26 * sz)}px ${C.disp};letter-spacing:.14em;text-transform:uppercase">${esc(s.tag || 'GIỚI THIỆU')}</span></div>` : ''}
          <div style="margin-top:${Math.round(18 * sz)}px;font:900 ${tsz}px ${C.disp};line-height:1;color:${C.l};text-transform:uppercase;letter-spacing:-.01em;
            opacity:${f3(ti.o)};transform:scale(${f3(lerp(1.5, 1, E.outExpo(clamp((t - at(2)) / .22))) * tpz)});filter:blur(${f1((1 - clamp((t - at(2)) / .18)) * 8)}px);text-shadow:0 6px 30px rgba(0,0,0,.5)">${starAccent(s.title || 'Bộ sưu tập *mới*', C.a)}</div>
          ${s.sub ? `<div style="margin-top:${Math.round(16 * sz)}px;font:600 ${Math.round(28 * sz)}px ${C.font};color:${C.l};opacity:${f3(sp.o * .92)};transform:translateY(${f1((1 - sp.e) * 16)}px)">${esc(s.sub)}</div>` : ''}
          <div style="margin:${Math.round(22 * sz)}px auto 0;height:5px;border-radius:3px;background:${C.a};width:${f1(E.outCubic(clamp((t - at(2)) / .5)) * 160 * sz)}px"></div>
        </div><div class="full" style="background:#fff;opacity:${f3(flash)};pointer-events:none"></div>`,
        cover: true, hideCaptions: true,
      };
    },

    // Closing card: logo (beat 1), name (beat 2), contact rows (phone/website/handle from brand, beat 3, staggered), CTA pill (beat 4) pulsing on every beat.
    beat_outro(s, t) {
      const [W, H] = dims(), C = pal(), V = vert(), b = C.b;
      const bs = beatsIn(beatsOf(s), s.t0 - .02, s.t1 + 1);
      const at = k => bs[k] ?? (s.t0 + k * .45);
      const sz = (s.size || 60) / 60, x = s.x ?? W / 2, y = s.y ?? (V ? 620 : H / 2);
      const bg = s.image ? photo({ filter: 'brightness(.42) saturate(1.1) blur(2px)' }, [s.image], 0, t, s.t0, s.t1)
        : `<div class="full" style="background:radial-gradient(110% 70% at 50% 40%, ${C.p} 0%, ${C.d} 78%)"></div>`;
      const pop = (k, dl = 0) => { const e = E.outBack(clamp((t - at(k) - dl) / .3), 1.7); return `opacity:${f3(clamp((t - at(k) - dl) / .08))};transform:translateY(${f1((1 - e) * 24)}px) scale(${f3(lerp(.85, 1, e))})`; };
      const logo = s.logo ?? b.logo;
      const rows = [['📞', s.phone ?? b.phone], ['🌐', s.website ?? b.website], ['@', s.handle ?? b.handle]].filter(r => r[1]);
      const cp = pulse(bs, t, .18, at(3));
      return {
        back: `<div class="full" style="overflow:hidden">${bg}</div>`,
        front: `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translate(-50%,-50%);width:${W - 80}px;text-align:center;opacity:${f3(fadeIO(t, s.t0, s.t1, .01, .3))}">
          ${logo ? `<div style="display:inline-flex;width:${Math.round(150 * sz)}px;height:${Math.round(150 * sz)}px;border-radius:50%;background:rgba(255,255,255,.1);border:3px solid ${C.a};align-items:center;justify-content:center;${pop(0)}">${slIcon(logo, Math.round(92 * sz), 'white')}</div>` : ''}
          <div style="margin-top:${Math.round(22 * sz)}px;font:900 ${Math.round(64 * sz)}px ${C.disp};color:${C.l};text-transform:uppercase;line-height:1.02;${pop(1)}">${starAccent(s.name ?? (b.name || 'Liên hệ ngay'), C.a)}</div>
          ${s.sub ? `<div style="margin-top:10px;font:600 ${Math.round(26 * sz)}px ${C.font};color:${C.l};opacity:.85">${esc(s.sub)}</div>` : ''}
          <div style="margin-top:${Math.round(26 * sz)}px;display:flex;flex-direction:column;align-items:center;gap:${Math.round(12 * sz)}px">
            ${rows.map((r, k) => `<div style="display:flex;align-items:center;gap:14px;padding:10px 26px;border-radius:40px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.18);font:700 ${Math.round(30 * sz)}px ${C.font};color:${C.l};${pop(2, k * .1)}">
              <span style="color:${C.a};font-weight:900">${r[0]}</span>${esc(r[1])}</div>`).join('')}
          </div>
          ${s.cta !== false ? `<div style="margin-top:${Math.round(30 * sz)}px;display:inline-block;padding:16px 46px;border-radius:50px;background:${C.a};color:${C.d};font:900 ${Math.round(32 * sz)}px ${C.disp};text-transform:uppercase;letter-spacing:.04em;
            ${t < at(3) ? 'opacity:0' : `transform:scale(${f3(1 + .08 * cp)});box-shadow:0 0 ${f1(20 + 40 * cp)}px ${C.a}`}">${esc(s.cta || 'Nhắn tin ngay')}</div>` : ''}
        </div>`,
        cover: true, hideCaptions: true,
      };
    },
  });

  // Caption: heavy uppercase Montserrat, one line, current word pops in accent (scale bump on its onset).
  CAPTION_STYLES[P] = (c, t) => {
    const [W] = dims(), C = pal(), V = vert();
    const size = c.size || (V ? 44 : 38);
    let cur = -1;
    c.words.forEach((w, i) => { if (t >= w.s - .02) cur = i; });
    const words = c.words.map((w, i) => {
      const on = i === cur, k = on ? E.outBack(clamp((t - w.s) / .18), 2) : 1;
      const col = on || w.hl ? C.a : (c.color || '#fff');
      return `<span style="display:inline-block;color:${col};opacity:${i <= cur || TL.caption_reveal === false ? 1 : .55};transform:scale(${f3(on ? lerp(1.22, 1.1, k) : 1)});transform-origin:50% 80%;margin:0 ${on ? '.18em' : '0'}">${esc(w.w)}</span>${w.br ? '<br>' : ' '}`;
    }).join('');
    const pos = c.x != null ? `left:${c.x - W / 2 + 40}px;right:${W / 2 - c.x + 40}px` : 'left:40px;right:40px';
    return `<div id="cap" class="beatslide"${cidOf(c)} style="${pos};top:${c.y ?? (V ? 900 : 590)}px;font-family:${c.font || C.disp};font-weight:${c.weight || 900};font-size:${size}px;
      text-transform:uppercase;line-height:1.15;letter-spacing:-.005em;white-space:normal;text-shadow:0 0 1px #000, 0 3px 0 rgba(0,0,0,.85), 0 6px 18px rgba(0,0,0,.6)">${words}</div>`;
  };

  // ---------- Studio metadata + automatic first cut ----------
  const IMG = ['media/living.jpg', 'media/bedroom.jpg', 'media/kitchen.jpg', 'media/facade.jpg'];
  PACKS.push({
    id: P, name: 'Ảnh theo nhịp nhạc (beat slideshow)', icon: '🥁', caption: P,
    desc: 'Ảnh → video cắt đúng nhịp nhạc: zoom-punch, trượt, chớp, glitch, Ken Burns, chữ theo nhịp, collage polaroid, cột EQ, intro/outro thương hiệu',
    items: [
      { type: 'beat_slideshow', label: 'Slideshow theo nhịp', make: T => ({ type: 'beat_slideshow', t0: T, t1: T + 6, bpm: 120, every: 2, images: IMG, labels: ['Phòng khách', 'Phòng ngủ', 'Bếp', 'Mặt tiền'], trans: 'mix' }) },
      { type: 'beat_pulse', label: 'Nhịp đập nền', make: T => ({ type: 'beat_pulse', t0: T, t1: T + 4, bpm: 120, amp: .06 }) },
      { type: 'beat_text', label: 'Chữ theo nhịp', make: T => ({ type: 'beat_text', t0: T, t1: T + 3, bpm: 120, words: ['NHÀ', 'MỚI', '*ĐẸP*', 'QUÁ'] }) },
      { type: 'beat_frame', label: 'Collage polaroid', make: T => ({ type: 'beat_frame', t0: T, t1: T + 4, bpm: 120, images: IMG, labels: ['living', 'bedroom', 'kitchen', 'home'], title: 'Nhà *mơ ước*' }) },
      { type: 'beat_bars', label: 'Cột EQ theo nhạc', make: T => ({ type: 'beat_bars', t0: T, t1: T + 5, bpm: 120, mode: 'bars' }) },
      { type: 'beat_intro', label: 'Intro theo nhịp', make: T => ({ type: 'beat_intro', t0: T, t1: T + 2.5, bpm: 120, tag: 'RA MẮT', title: 'The *Riverside*', sub: 'Căn hộ view sông · Bình Thạnh' }) },
      { type: 'beat_outro', label: 'Outro liên hệ', make: T => ({ type: 'beat_outro', t0: T, t1: T + 3.5, bpm: 120, name: 'Liên hệ *xem nhà*', phone: '0909 123 456', website: 'riverside.vn' }) },
    ],
    // ctx.opts: {images[], labels[], beats:{bpm,beats,downbeats}|[t…], bpm, title, sub, every}
    recipe: ctx => {
      const dur = ctx.dur, o = ctx.opts || {}, caps = ctx.captions || [];
      const bsrc = Array.isArray(o.beats) ? { beats: o.beats } : (o.beats || {});
      const bpm = o.bpm || bsrc.bpm || 120, per = 60 / bpm;
      const beats = bsrc.beats || Array.from({ length: Math.ceil(dur / per) + 1 }, (_, i) => +(i * per).toFixed(3));
      const down = bsrc.downbeats || beats.filter((_, i) => i % 4 === 0);
      const B = { beats, downbeats: down, bpm };
      const snap = (t, list = down) => list.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), list[0] ?? t);
      const scenes = [];
      if (!caps.length) {
        // Music-only montage: intro (1 bar) → slideshow cut on beats → outro (last ~2 bars).
        const introEnd = Math.min(dur * .3, snap(per * 4)) || per * 4, outroT = Math.max(introEnd + 2, snap(dur - per * 8));
        const ibi = per, every = o.every || Math.max(1, Math.round(.9 / ibi));
        scenes.push({ type: 'beat_intro', t0: 0, t1: introEnd, ...B, title: o.title || ctx.title || 'Bộ sưu tập *mới*', tag: o.tag || 'GIỚI THIỆU', sub: o.sub, image: (o.images || [])[0] });
        scenes.push({ type: 'beat_slideshow', t0: introEnd, t1: outroT, ...B, every, images: o.images || [], labels: o.labels, trans: 'mix', progress: false });
        scenes.push({ type: 'beat_bars', t0: introEnd, t1: outroT, ...B, levels: bsrc.levels, mode: 'bars', h: 56, opacity: .5, n: 48, y: vert() ? 1240 : 700 });
        scenes.push({ type: 'beat_outro', t0: outroT, t1: dur, ...B, image: (o.images || [])[(o.images || []).length - 1] });
        return { caption_style: 'none', music: o.music || 'hype', scenes };
      }
      // With a speaker: pulse the A-roll on downbeats, kinetic title on the first beats, polaroid of the photos mid-way, outro.
      const words = String(o.title || ctx.title || caps.flatMap(c => c.words).slice(0, 3).map(w => w.w).join(' ')).split(/\s+/).slice(0, 4);
      scenes.push({ type: 'beat_text', t0: 0, t1: Math.min(2.6, dur), ...B, words, y: vert() ? 420 : 300 });
      scenes.push({ type: 'beat_pulse', t0: 0, t1: Math.max(1, dur - 3), ...B, downbeats_only: true, amp: .035, bright: .12, edge: false });
      if (o.images && o.images.length && dur > 10) scenes.push({ type: 'beat_frame', t0: dur * .45, t1: dur * .45 + 3.2, ...B, images: o.images.slice(0, 4), labels: o.labels, hideCaptions: false });
      scenes.push({ type: 'beat_outro', t0: Math.max(0, dur - 3), t1: dur, ...B });
      return { caption_style: P, music: o.music || 'hype', scenes };
    },
  });
})();
