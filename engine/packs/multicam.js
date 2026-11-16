// Pack "multicam" — 2-person podcast / interview shot on 2–3 cameras: the edit cuts to whoever is talking (quick
// punch-in on every cut, 2-up when both talk), or keeps both on screen (split) with the speaker lit up. Name
// lower-thirds, reaction PIP of the listener, topic/chapter bar, speaker waveforms. Cuts + levels come from
// scripts/multicam.py (per-mic loudness with hysteresis). Spec: references/pack-multicam.md.
(() => {
  const P = 'multicam';
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const CAM_COLORS = ['#FFB020', '#3DD6FF', '#B78CFF'];
  const pal = (s = {}) => {
    const b = (typeof TL !== 'undefined' && TL && TL.brand) || {};
    return {
      ink: '#0A0C11', plate: 'rgba(10,12,18,.84)', white: '#F5F7FA', muted: 'rgba(245,247,250,.62)', line: 'rgba(255,255,255,.12)',
      accent: s.color || b.primary || CAM_COLORS[0], font: s.font || b.font || "'Be Vietnam Pro',var(--sans)",
    };
  };
  const camColor = (cam, i) => (cam && cam.color) || (i === 0 ? TL?.brand?.primary : i === 1 ? TL?.brand?.accent : null) || CAM_COLORS[i % 3];
  const alpha = (c, p) => `color-mix(in srgb,${c} ${p}%,transparent)`;

  // ---------- rig: cams + cuts shared by every mc_* scene ----------
  // Default rig when nothing is given: the A-roll twice (cam 1 = tighter mirrored crop) so any project renders.
  const DEF_CAMS = [
    { media: 'aroll', name: 'Người dẫn', title: 'Host', face: { x: 50, y: 38 } },
    { media: 'aroll', name: 'Khách mời', title: 'Chuyên gia', face: { x: 50, y: 34 }, zoom: 1.45, flip: true },
  ];
  const rigScene = () => (TL?.scenes || []).find(x => !x.hidden && (x.type === 'mc_switch' || x.type === 'mc_split') && (x.cams || x.cuts));
  function rig(s) {
    const r = rigScene() || {}, m = TL?.multicam || {};
    let cams = s.cams || r.cams || m.cams || DEF_CAMS;
    const fit = s.fit || r.fit;
    if (fit) cams = cams.map(c => ({ fit, ...c }));
    let cuts = s.cuts || r.cuts || m.cuts;
    if (!cuts || !cuts.length) { // alternate every 4 s from the scene start
      cuts = [];
      const t0 = r.t0 ?? s.t0 ?? 0, t1 = r.t1 ?? s.t1 ?? t0 + 4;
      for (let t = t0, i = 0; t < t1; t += 4, i++) cuts.push({ t, cam: i % Math.min(2, cams.length) });
    }
    cuts = cuts.slice().sort((a, b) => a.t - b.t);
    return { cams, cuts, levels: s.levels || r.levels || m.levels, step: s.step || r.step || m.step || .1, lt0: s.levels_t0 ?? r.levels_t0 ?? m.levels_t0 ?? 0 };
  }
  // Index of the cut active at t (cuts before the first one count as the first one).
  const cutIdx = (cuts, t) => { let i = 0; for (let j = 0; j < cuts.length; j++) if (t >= cuts[j].t) i = j; return i; };
  const camOf = c => (c == null ? 0 : c.cam ?? 0);
  const isOn = (c, i) => { const v = camOf(c); return v === i || v === 'both' || v === 'wide'; };

  // One camera image filling its parent. face = {x,y} focus in % of the source frame; zoom scales around it.
  function camImg(cam, t, scale = 1, extraFilter = '') {
    cam = cam || {};
    const fx = cam.face?.x ?? 50, fy = cam.face?.y ?? 40, z = (cam.zoom || 1) * scale;
    let src = '', filt = cam.filter || '';
    if (!cam.media || cam.media === 'aroll') {
      if (!TL.aroll) return '<div class="full" style="background:#15171c"></div>';
      src = url(fmtSeq(TL.aroll.frames, frameAt(t)));
      filt = `${arollFilter(t)} ${filt}`;
    } else src = media(cam.media, t);
    // fit 'blurfill': whole frame contained over a blurred copy (vertical camera inside a landscape edit).
    const fit = cam.fit === 'blurfill' || cam.fit === 'contain' ? 'contain' : 'cover';
    const under = cam.fit === 'blurfill' ? `<img src="${src}" style="position:absolute;inset:-40px;width:calc(100% + 80px);height:calc(100% + 80px);object-fit:cover;filter:${filt} blur(28px) brightness(.6) ${extraFilter}">` : '';
    return `${under}<img src="${src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${fit};object-position:${fx}% ${fy}%;
      transform:${cam.flip ? 'scaleX(-1) ' : ''}scale(${z.toFixed(4)});transform-origin:${fx}% ${fy}%;filter:${filt} ${extraFilter}">`;
  }
  // 2-up rectangles (design px) for 'both': stacked when vertical, side by side when landscape.
  const twoUp = (n, mode) => {
    const [W, H] = DIMS(), side = mode === 'side' || (mode !== 'stack' && !VERT());
    const g = 6;
    return Array.from({ length: n }, (_, i) => (side ? { x: i * (W + g) / n, y: 0, w: (W - g * (n - 1)) / n, h: H } : { x: 0, y: i * (H + g) / n, w: W, h: (H - g * (n - 1)) / n }));
  };
  const box = (R, inner, extra = '') => `<div class="abs" style="left:${R.x.toFixed(1)}px;top:${R.y.toFixed(1)}px;width:${R.w.toFixed(1)}px;height:${R.h.toFixed(1)}px;overflow:hidden;${extra}">${inner}</div>`;

  // tiny speaking bars icon (animated from t)
  const talkBars = (t, col, h = 16, on = true) => `<span style="display:inline-flex;align-items:flex-end;gap:2px;height:${h}px">${[0, 1, 2, 3].map(j => {
    const v = on ? .35 + .65 * Math.abs(Math.sin(t * (7 + j * 2.3) + j * 1.7)) : .25;
    return `<i style="display:block;width:3px;height:${(v * h).toFixed(1)}px;border-radius:2px;background:${col}"></i>`;
  }).join('')}</span>`;

  const MODS = {
    // 1. Full-frame switcher. cuts:[{t, cam: index|'both'|'wide'}]; quick punch-in at each cut, alternate tight/medium framing.
    mc_switch(s, t) {
      const R = rig(s), c = pal(s), { cams, cuts } = R;
      const i = cutIdx(cuts, t), cut = cuts[i], ts = Math.max(s.t0, cut?.t ?? s.t0), lt = t - ts;
      const k = E.outCubic(prog(lt, 0, s.punch_dur ?? .32));
      const punch = 1 + (s.punch ?? .07) * k + (s.drift ?? .012) * prog(lt, 0, 6);
      const v = camOf(cut);
      let html;
      if (v === 'both' || (v === 'wide' && !s.wide)) {
        const n = Math.min(cams.length, s.both_n || 2), rects = twoUp(n, s.layout_both);
        html = `<div class="full" style="background:${c.ink}"></div>` + rects.map((r, j) => box(r, camImg(cams[j], t, punch))).join('')
          + rects.slice(1).map(r => `<div class="abs" style="left:${VERT() && s.layout_both !== 'side' ? 0 : r.x - 6}px;top:${VERT() && s.layout_both !== 'side' ? r.y - 6 : 0}px;
            ${VERT() && s.layout_both !== 'side' ? 'width:100%;height:6px' : 'height:100%;width:6px'};background:${c.accent};box-shadow:0 0 18px ${alpha(c.accent, 60)}"></div>`).join('');
      } else if (v === 'wide') {
        html = `<div class="full" style="overflow:hidden">${camImg({ media: s.wide.media || s.wide, face: s.wide.face, zoom: s.wide.zoom }, t, punch)}</div>`;
      } else {
        // Every 2nd shot of the same camera is tighter, so back-to-back cuts never look identical.
        let n = 0;
        for (let j = 0; j < i; j++) if (camOf(cuts[j]) === v) n++;
        const tight = s.alt === false ? 1 : (n % 2 ? s.tight ?? 1.16 : 1);
        html = `<div class="full" style="overflow:hidden">${camImg(cams[v] || cams[0], t, punch * tight)}</div>`;
      }
      const fl = s.flash && i > 0 && lt < .12 ? `<div class="full" style="background:#fff;opacity:${(1 - lt / .12).toFixed(3)}"></div>` : '';
      return { back: `<div class="full"${cidOf(s)}>${html}</div>${fl}`, cover: true };
    },

    // 2. Both cams always visible (stacked / side by side); the speaker gets an accent border + glow, the other dims.
    mc_split(s, t) {
      const R = rig(s), c = pal(s), { cams, cuts } = R, [W, H] = DIMS(), v = VERT();
      const side = s.layout === 'side' || (s.layout !== 'stack' && !v);
      const n = Math.min(cams.length, 2 + (s.three ? 1 : 0));
      const pad = s.pad ?? (v ? 28 : 40), gap = s.gap ?? (v ? 84 : 20);
      const top = s.top ?? (v ? 190 : 96), ph = s.h ?? (v ? (side ? 640 : 400) : 480);
      const rects = Array.from({ length: n }, (_, j) => (side
        ? { x: pad + j * ((W - 2 * pad - gap * (n - 1)) / n + gap), y: top, w: (W - 2 * pad - gap * (n - 1)) / n, h: ph }
        : { x: pad, y: top + j * (ph + gap), w: W - 2 * pad, h: ph }));
      const i = cutIdx(cuts, t), cut = cuts[i], tc = Math.max(s.t0, cut?.t ?? s.t0);
      const en = E.outCubic(prog(t, s.t0, .4));
      const panels = rects.map((r, j) => {
        const on = isOn(cut, j), was = i > 0 ? isOn(cuts[i - 1], j) : on;
        const kk = E.outCubic(prog(t, tc, .3)), w = on === was ? (on ? 1 : 0) : on ? kk : 1 - kk;
        const col = camColor(cams[j], j), sc = lerp(.965, 1, w) * lerp(.92, 1, en);
        const name = s.show_names === false ? '' : `<div style="position:absolute;left:14px;bottom:14px;display:flex;align-items:center;gap:8px;padding:6px 12px 6px 10px;border-radius:10px;
          background:rgba(8,10,14,.72);font:800 ${s.name_size || 20}px/1.15 ${c.font};color:${c.white};white-space:nowrap">${talkBars(t, w > .5 ? col : 'rgba(255,255,255,.4)', 16, w > .5)}
          ${esc(cams[j]?.name || `Cam ${j + 1}`)}${cams[j]?.title ? `<span style="font-weight:600;font-size:.72em;color:${col};opacity:.95">${esc(cams[j].title)}</span>` : ''}</div>`;
        const live = w > .02 ? `<div style="position:absolute;right:14px;top:14px;padding:4px 10px;border-radius:8px;background:${col};color:#0B0B0E;font:800 14px ${c.font};letter-spacing:.12em;opacity:${w.toFixed(3)}">${esc(s.live_label || 'ĐANG NÓI')}</div>` : '';
        return `<div class="abs"${cidOf(cams[j])} style="left:${r.x.toFixed(1)}px;top:${r.y.toFixed(1)}px;width:${r.w.toFixed(1)}px;height:${r.h.toFixed(1)}px;border-radius:${s.r ?? 22}px;overflow:hidden;
          transform:scale(${sc.toFixed(4)});opacity:${en.toFixed(3)};border:3px solid ${alpha(col, Math.round(w * 100))};
          box-shadow:0 0 ${(46 * w).toFixed(0)}px ${alpha(col, Math.round(55 * w))},0 16px 44px rgba(0,0,0,.55)">
          ${camImg(cams[j], t, s.zoom ?? 1, `brightness(${lerp(.5, 1, w).toFixed(3)}) saturate(${lerp(.55, 1, w).toFixed(3)})`)}${name}${live}</div>`;
      }).join('');
      const g0 = camColor(cams[0], 0), g1 = camColor(cams[1], 1);
      const bgd = `<div class="full" style="background:radial-gradient(circle 520px at 12% 8%,${alpha(g0, 16)},transparent),radial-gradient(circle 520px at 90% 92%,${alpha(g1, 16)},transparent),${c.ink}"></div>`;
      return { back: `<div class="full"${cidOf(s)}>${bgd}${panels}</div>`, cover: true };
    },

    // 3. Name lower-thirds: each cam's name/title when that cam is first on screen (mode 'every' = at each shot).
    //    Anchor: x = left edge, y = centre.
    mc_names(s, t) {
      const R = rig(s), c = pal(s), { cams, cuts } = R, v = VERT();
      const hold = s.hold ?? 3, mode = s.mode || 'first', size = s.size || (v ? 34 : 30);
      const i = cutIdx(cuts, t), cut = cuts[i], cur = camOf(cut);
      if (typeof cur !== 'number') return {};
      // Start of the current shot of `cur`, and whether this is its first appearance inside the scene.
      const shotStart = Math.max(s.t0, cut?.t ?? s.t0);
      const nextCut = cuts[i + 1]?.t ?? Infinity;
      let first = true;
      for (let j = 0; j < i; j++) if (camOf(cuts[j]) === cur && (cuts[j + 1]?.t ?? Infinity) > s.t0) first = false;
      if (mode === 'first' && !first) return {};
      const a = shotStart + (s.delay ?? .25), b = Math.min(a + (mode === 'every' && !first ? 1.8 : hold), nextCut - .05, s.t1);
      if (t < a || t >= b) return {};
      const lt = t - a, out = prog(t, b - .25, .25), cam = cams[cur] || {}, col = camColor(cam, cur);
      const kb = E.outCubic(prog(lt, 0, .25)), kn = E.outCubic(prog(lt, .08, .35)), kt = E.outCubic(prog(lt, .25, .35));
      const x = s.x ?? (v ? 40 : 60), y = s.y ?? (v ? 760 : 540);
      const html = `<div class="abs"${cidOf(s)} style="left:${x}px;top:${y}px;transform:translateY(-50%);font-family:${c.font};opacity:${(1 - out).toFixed(3)};display:flex;align-items:stretch;gap:10px">
        <div style="width:7px;border-radius:4px;background:${col};box-shadow:0 0 16px ${alpha(col, 70)};transform:scaleY(${kb.toFixed(3)});transform-origin:50% 100%"></div>
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px">
          <div style="clip-path:inset(0 ${((1 - kn) * 100).toFixed(1)}% 0 0);padding:.16em .5em .2em;border-radius:10px;background:${c.plate};color:${c.white};
            font-weight:800;font-size:${size}px;line-height:1.15;white-space:nowrap;display:flex;align-items:center;gap:.4em">${esc(cam.name || `Cam ${cur + 1}`)}
            ${s.cam_tag === false ? '' : `<span style="font-size:.42em;font-weight:800;letter-spacing:.14em;color:${col};border:1.5px solid ${alpha(col, 70)};border-radius:6px;padding:.15em .45em">CAM ${cur + 1}</span>`}</div>
          ${cam.title ? `<div style="opacity:${kt.toFixed(3)};transform:translateX(${((1 - kt) * -16).toFixed(1)}px);padding:.28em .7em;border-radius:8px;background:${col};color:#0B0B0E;
            font-weight:800;font-size:${Math.round(size * .5)}px;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap">${esc(cam.title)}</div>` : ''}</div></div>`;
      return { front: html };
    },

    // 4. Reaction PIP: the listening camera in a small card while one person talks (hidden on 'both').
    mc_reaction(s, t) {
      const R = rig(s), c = pal(s), { cams, cuts } = R, v = VERT();
      const i = cutIdx(cuts, t), cut = cuts[i], cur = camOf(cut);
      if (typeof cur !== 'number' || cams.length < 2) return {};
      let lis = s.cam;
      if (lis == null) { lis = cams.length === 2 ? 1 - cur : (() => { for (let j = i - 1; j >= 0; j--) if (typeof camOf(cuts[j]) === 'number' && camOf(cuts[j]) !== cur) return camOf(cuts[j]); return (cur + 1) % cams.length; })(); }
      if (lis === cur) return {};
      const a = Math.max(s.t0, cut?.t ?? s.t0) + (s.delay ?? .45), b = Math.min(cuts[i + 1]?.t ?? Infinity, s.t1);
      if (t < a || t >= b) return {};
      const k = E.outBack(prog(t, a, .35), 1.5), o = clamp(prog(t, a, .2)) * (1 - prog(t, b - .2, .2));
      const w = s.w || (v ? 196 : 210), h = s.h || (v ? 260 : 150), x = s.x ?? (v ? 720 - 24 - w / 2 : 1280 - 30 - w / 2), y = s.y ?? (v ? 330 : 110);
      const cam = cams[lis] || {}, col = camColor(cam, lis);
      return { front: `<div class="abs"${cidOf(s)} style="left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;border-radius:20px;overflow:hidden;opacity:${o.toFixed(3)};
          transform:scale(${lerp(.6, 1, k).toFixed(3)});transform-origin:100% 0;border:3px solid #fff;box-shadow:0 14px 34px rgba(0,0,0,.5),0 0 0 2px ${alpha(col, 60)}">
          ${camImg(cam, t, s.zoom ?? 1.05)}
          <div style="position:absolute;left:0;right:0;bottom:0;padding:18px 10px 8px;background:linear-gradient(transparent,rgba(0,0,0,.75));font:800 ${s.size || 17}px/1.1 ${c.font};color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            <i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col};margin-right:6px;vertical-align:middle"></i>${esc(cam.name || 'Đang nghe')}</div></div>` };
    },

    // 5. Episode / topic chapter bar. chapters:[{t (absolute), title}]; episode pill + current title + progress.
    mc_topic(s, t, lt) {
      const c = pal(s), [W] = DIMS(), v = VERT();
      const ch = (s.chapters && s.chapters.length ? s.chapters : [{ t: s.t0, title: s.title || 'Chủ đề hôm nay' }]).slice().sort((a, b) => a.t - b.t);
      const i = cutIdx(ch, t), tc = Math.max(s.t0, ch[i].t), kc = E.outCubic(prog(t, tc, .4)), prev = i > 0 && t < tc + .4 ? ch[i - 1] : null;
      const w = s.w || (v ? 640 : 760), x = s.x ?? W / 2, y = s.y ?? (v ? 150 : 46), size = s.size || (v ? 24 : 22);
      const o = fadeIO(t, s.t0, s.t1, .35, .3), en = E.outCubic(prog(lt, 0, .45));
      const pr = clamp((t - s.t0) / Math.max(.1, s.t1 - s.t0));
      const ticks = ch.slice(1).map(q => `<i style="position:absolute;top:-2px;left:${(clamp((q.t - s.t0) / (s.t1 - s.t0)) * 100).toFixed(2)}%;width:2px;height:7px;background:rgba(255,255,255,.7)"></i>`).join('');
      const ttl = (q, kk, dir) => `<span style="position:absolute;left:0;top:50%;white-space:nowrap;transform:translateY(calc(-50% + ${(dir * (1 - kk) * 26).toFixed(1)}px));opacity:${kk.toFixed(3)}">${esc(q.title)}</span>`;
      return { front: `<div class="abs"${cidOf(s)} style="left:${x - w / 2}px;top:${y}px;width:${w}px;transform:translateY(-50%) translateY(${((1 - en) * -18).toFixed(1)}px);opacity:${o.toFixed(3)};font-family:${c.font};font-size:${size}px">
        <div style="display:flex;align-items:center;gap:.5em;padding:.38em .45em;border-radius:.7em;background:${c.plate};border:1px solid ${c.line};box-shadow:0 10px 30px rgba(0,0,0,.35)">
          <span style="flex:0 0 auto;display:inline-flex;align-items:center;gap:.35em;padding:.25em .6em;border-radius:.45em;background:${c.accent};color:#0B0B0E;font-weight:800;font-size:.72em;letter-spacing:.1em;white-space:nowrap">
            <i style="width:.55em;height:.55em;border-radius:50%;background:#E8202A;display:block;box-shadow:0 0 0 2px rgba(255,255,255,.6)"></i>${esc(s.episode || 'TẬP 1')}</span>
          <span style="position:relative;flex:1;height:1.4em;overflow:hidden;color:${c.white};font-weight:700">${prev ? ttl(prev, 1 - kc, -1) : ''}${ttl(ch[i], prev ? kc : 1, 1)}</span>
          ${ch.length > 1 ? `<span style="flex:0 0 auto;color:${c.muted};font-weight:700;font-size:.7em;white-space:nowrap">${i + 1}/${ch.length}</span>` : ''}</div>
        <div style="position:relative;margin:7px .6em 0;height:3px;border-radius:2px;background:rgba(255,255,255,.18)">
          <div style="width:${(pr * 100).toFixed(2)}%;height:100%;border-radius:2px;background:${c.accent};box-shadow:0 0 10px ${alpha(c.accent, 70)}"></div>${ticks}</div></div>` };
    },

    // 6. Speaker waveforms: one row per cam, bars scroll from levels[cam][k] (k = (t - levels_t0) / step), from multicam.py.
    mc_wave(s, t, lt) {
      const R = rig(s), c = pal(s), { cams, cuts } = R, v = VERT();
      const n = Math.min(cams.length, s.n || cams.length), bars = s.bars || 26;
      const lv = (j, tt) => {
        if (R.levels && R.levels[j]) {
          const f = (tt - R.lt0) / R.step, a = Math.floor(f), arr = R.levels[j];
          const g = q => (q >= 0 && q < arr.length ? arr[q] : 0);
          return lerp(g(a), g(a + 1), f - a);
        }
        const on = isOn(cuts[cutIdx(cuts, tt)], j); // fallback: fake speech on the active cam
        return on ? .35 + .55 * Math.abs(Math.sin(tt * 9.1 + j) * Math.sin(tt * 3.7 + 1.3 * j)) : .04;
      };
      const size = s.size || 18, w = s.w || (v ? 330 : 320);
      const x = s.x ?? (v ? 24 + w / 2 : 30 + w / 2), y = s.y ?? (v ? 248 : 110);
      const o = fadeIO(t, s.t0, s.t1, .3, .3), now = Array.from({ length: n }, (_, j) => lv(j, t));
      const loud = now.indexOf(Math.max(...now));
      const rows = Array.from({ length: n }, (_, j) => {
        const col = camColor(cams[j], j), act = j === loud && now[j] > .12;
        const bs = Array.from({ length: bars }, (_, b) => {
          const val = clamp(lv(j, t - b * .045) * (.7 + .3 * rnd(b * 7.3 + j * 31)));
          return `<i style="display:block;flex:1;height:${Math.max(3, val * 30).toFixed(1)}px;border-radius:2px;background:${act ? col : 'rgba(255,255,255,.32)'};opacity:${(1 - b / bars * .55).toFixed(2)}"></i>`;
        }).join('');
        return `<div style="display:flex;align-items:center;gap:10px;height:36px">
          <span style="flex:0 0 7.2em;display:flex;align-items:center;gap:6px;color:${act ? c.white : c.muted};font-weight:800;white-space:nowrap;overflow:hidden">
            <i style="flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:${col};box-shadow:${act ? `0 0 10px ${col}` : 'none'}"></i>${esc(cams[j]?.name || `Cam ${j + 1}`)}</span>
          <span style="flex:1;display:flex;align-items:center;gap:2px;height:32px">${bs}</span></div>`;
      }).join('');
      return { front: `<div class="abs"${cidOf(s)} style="left:${x - w / 2}px;top:${y}px;width:${w}px;transform:translateY(-50%) scale(${lerp(.92, 1, E.outCubic(prog(lt, 0, .35))).toFixed(3)});opacity:${o.toFixed(3)};
        font-family:${c.font};font-size:${size}px;padding:8px 14px;border-radius:16px;background:${c.plate};border:1px solid ${c.line}">${rows}</div>` };
    },
  };
  Object.assign(MODULES, MODS);

  // Caption: white bold on a dark plate; the spoken word takes the ACTIVE SPEAKER's colour and a small speaker tag
  // sits above the plate. Sits in the seam between split panels when an mc_split is on screen.
  CAPTION_STYLES.multicam = (c, t) => {
    const p = pal(c), [W] = DIMS(), v = VERT();
    const sc = (TL.scenes || []).filter(x => !x.hidden && t >= x.t0 && t < x.t1);
    const split = sc.find(x => x.type === 'mc_split'), sw = sc.find(x => x.type === 'mc_switch');
    const R = rig(split || sw || {}), cut = R.cuts[cutIdx(R.cuts, t)], cur = camOf(cut);
    const spk = typeof cur === 'number' ? R.cams[cur] : null, col = c.color ? null : camColor(spk, typeof cur === 'number' ? cur : 0);
    const hi = col || '#FFD84A';
    const x = c.x ?? W / 2, size = c.size || (v ? 40 : 34);
    const y = c.y ?? (split && (split.layout || 'auto') !== 'side' && v ? 632 : v ? 905 : 640);
    let k = -1;
    c.words.forEach((w, i) => { if (t >= w.s) k = i; });
    const html = c.words.map((w, i) => {
      const on = i === k && t < (w.e ?? w.s + .35) + .08;
      const pop = on ? lerp(1.12, 1, E.outCubic(prog(t, w.s, .16))) : 1;
      return `<span style="display:inline-block;color:${on || w.hl ? hi : c.color || p.white};transform:scale(${pop.toFixed(3)})">${esc(w.w)}</span>${w.br ? '<br>' : ' '}`;
    }).join('');
    const o = clamp(prog(t, c.t0, .08));
    const tag = spk && c.speaker !== false && !split && sw
      ? `<div style="display:inline-flex;align-items:center;gap:6px;margin-bottom:6px;padding:3px 10px;border-radius:7px;background:${hi};color:#0B0B0E;font:800 ${Math.round(size * .4)}px/1.2 ${c.font || p.font};letter-spacing:.1em;text-transform:uppercase">${esc(spk.name || '')}</div>` : '';
    return `<div id="cap" class="multicam"${cidOf(c)} style="top:${y}px;left:${x - W / 2}px;right:${W / 2 - x}px;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;opacity:${o.toFixed(3)};text-shadow:none">
      ${tag}<div style="max-width:${v ? 640 : 1080}px;padding:10px 22px;border-radius:14px;background:rgba(8,10,14,.66);font-family:${c.font || p.font};font-weight:${c.weight || 800};
        font-size:${size}px;line-height:1.22;text-align:center;color:${p.white};text-shadow:0 2px 10px rgba(0,0,0,.5)">${html}</div></div>`;
  };

  // ---------- Studio metadata ----------
  const XY = (yv, yh) => (VERT() ? { y: yv } : { y: yh });
  PACKS.push({
    id: P, name: 'Multicam podcast 2 người', icon: '🎥', caption: 'multicam',
    desc: 'Podcast/phỏng vấn nhiều camera: tự cắt sang người đang nói (punch-in), 2-up khi cả hai nói, chia đôi màn sáng viền người nói, tên lower-third, PIP phản ứng, thanh chủ đề, sóng âm 2 người',
    items: [
      { type: 'mc_switch', label: 'Chuyển camera theo người nói', make: T => ({ type: 'mc_switch', t0: T, t1: T + 8, cuts: [{ t: T, cam: 0 }, { t: T + 2.5, cam: 1 }, { t: T + 5, cam: 'both' }, { t: T + 6.5, cam: 0 }], punch: .07 }) },
      { type: 'mc_split', label: 'Chia đôi 2 camera (sáng người nói)', make: T => ({ type: 'mc_split', t0: T, t1: T + 8, cuts: [{ t: T, cam: 0 }, { t: T + 3, cam: 1 }, { t: T + 6, cam: 0 }] }) },
      { type: 'mc_names', label: 'Tên lower-third theo camera', make: T => ({ type: 'mc_names', t0: T, t1: T + 8, mode: 'first', hold: 3, ...XY(760, 540) }) },
      { type: 'mc_reaction', label: 'PIP người đang nghe', make: T => ({ type: 'mc_reaction', t0: T, t1: T + 8 }) },
      { type: 'mc_topic', label: 'Thanh tập / chủ đề', make: T => ({ type: 'mc_topic', t0: T, t1: T + 10, episode: 'TẬP 12', chapters: [{ t: T, title: 'AI có thay thế con người?' }, { t: T + 5, title: 'Lời khuyên cho người mới' }], ...XY(150, 46) }) },
      { type: 'mc_wave', label: 'Sóng âm 2 người nói', make: T => ({ type: 'mc_wave', t0: T, t1: T + 6, ...XY(248, 110) }) },
    ],
    // Starter edit: mc_switch for the whole video (ctx.opts.cuts from multicam.py, else alternate ~4 s on caption
    // boundaries), names when each cam first appears, topic bar, reaction PIP and waveform when levels exist.
    recipe: ctx => {
      const dur = ctx.dur, caps = ctx.captions || [], o = ctx.opts || {};
      const cams = o.cams || DEF_CAMS.map((c, i) => (i === 0 && ctx.brand?.name ? { ...c, name: ctx.brand.name } : c));
      let cuts = o.cuts;
      if (!cuts || !cuts.length) {
        const starts = caps.map(c => c.t0);
        cuts = [{ t: 0, cam: 0 }];
        for (let k = 4; k < dur - 1.5; k += 4) {
          const tt = starts.length ? starts.reduce((b, s) => (Math.abs(s - k) < Math.abs(b - k) ? s : b)) : k;
          if (tt - cuts[cuts.length - 1].t >= 2.5 && tt < dur - 1.5) cuts.push({ t: +tt.toFixed(2), cam: cuts.length % 2 });
        }
        if (cuts.length >= 4) cuts[3] = { ...cuts[3], cam: 'both' }; // one 2-up beat for rhythm
      }
      const scenes = [{ type: 'mc_switch', t0: 0, t1: dur, cams, cuts, punch: .07, ...(o.levels ? { levels: o.levels, step: o.step || .1 } : {}) }];
      scenes.push({ type: 'mc_topic', t0: .2, t1: dur, episode: o.episode || 'TẬP MỚI', chapters: o.chapters || [{ t: 0, title: ctx.title || 'Podcast hôm nay' }] });
      scenes.push({ type: 'mc_names', t0: 0, t1: dur, mode: 'first', hold: 3 });
      if (cams.length > 1 && dur > 8) scenes.push({ type: 'mc_reaction', t0: Math.min(6, dur / 3), t1: dur - 2 });
      if (o.levels) scenes.push({ type: 'mc_wave', t0: 0, t1: dur });
      return { caption_style: 'multicam', music: o.music || 'corporate', scenes };
    },
  });
})();
