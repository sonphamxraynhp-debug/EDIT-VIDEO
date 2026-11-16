// HyperFrames blocks (engine/hf/<name>/index.html, imported by scripts/hf_import.mjs, catalog in hf/catalog.js) as 'hf' scenes.
// scene = { type:'hf', block, t0, t1, x, y (centre, design px), size (% of the default fit), fit: 'contain'|'cover' (full-frame
//           blocks), speed=1, offset=0 (s into the block), loop, fade=.2, vars:{id:value}, texts:{i:text} }
// The module only draws an empty .hfslot (selection / hit-testing in Studio). After each frame hfMount() lines a live iframe up
// with every slot in #hfl — a layer beside #stage that innerHTML never wipes, so iframes keep their state — seeks it with
// hfSeek() and lifts the captions into #hfcap above it. Spec: references/hyperframes.md.
(() => {
  const CAT = window.HF_CATALOG || {}, GROUPS = window.HF_GROUPS || [];
  const DIMS = () => STAGE_WH;
  window.HF_VARS = {}; window.HF_TEXTS = {};
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  // Default scale/centre so the block's content box fits the frame; landscape blocks in a 9:16 frame get boosted (≤2.2×).
  function place(s, b) {
    const [DW, DH] = DIMS(), nat = Math.min(DW / b.w, DH / b.h), [bx, by, bw, bh] = b.box;
    if (b.layer === 'full') {
      const k = (s.fit === 'cover' ? Math.max(DW / b.w, DH / b.h) : nat) * (s.size ?? 100) / 100;
      return { k, bx: 0, by: 0, bw: b.w, bh: b.h, x: s.x ?? DW / 2, y: s.y ?? DH / 2 };
    }
    const boost = Math.min(2.2, Math.max(1, (b.w / b.h) / (DW / DH) * .7));
    const k = Math.min(nat * boost, DW * .94 / bw, DH * .9 / bh) * (s.size ?? 100) / 100;
    const cx = boost > 1 ? DW / 2 : (bx + bw / 2) * nat + (DW - b.w * nat) / 2, cy = (by + bh / 2) / b.h * DH;
    const half = bh * k / 2;
    return { k, bx, by, bw, bh, x: s.x ?? cx, y: s.y ?? clamp(cy, half + 20, DH - half - 20) };
  }
  MODULES.hf = (s, t, lt) => {
    const b = CAT[s.block];
    if (!b) return {};
    const p = place(s, b), w = p.bw * p.k, h = p.bh * p.k;
    let bt = Math.max(0, lt * (s.speed || 1) + (s.offset || 0));
    bt = s.loop ? bt % b.dur : Math.min(bt, b.dur - 1e-3);
    const fd = s.fade ?? .2, op = fd > 0 ? fadeIO(t, s.t0, s.t1, fd, fd) : 1;
    const vars = { ...(b.vi || {}), ...(s.vars || {}) }, texts = { ...(b.vit || {}), ...(s.texts || {}) };
    const spec = JSON.stringify([vars, texts]), key = `${s.block}~${hash(spec)}~${s.t0}`;
    if (!(key in HF_VARS)) { HF_VARS[key] = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, absUrl(v)])); HF_TEXTS[key] = texts; }
    return { front: `<div class="hfslot"${cidOf(s)} data-hf="${key}" data-blk="${s.block}" data-t="${bt.toFixed(4)}" data-k="${p.k.toFixed(5)}" data-ox="${p.bx}" data-oy="${p.by}" data-op="${op.toFixed(3)}"
      style="position:absolute;left:${(p.x - w / 2).toFixed(1)}px;top:${(p.y - h / 2).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px"></div>` };
  };

  // ---------- live iframes ----------
  const FR = new Map(); // key -> { host, ifr, ready, used }
  let L = null, C = null;
  function layers(stage) {
    if (!L) {
      L = document.createElement('div'); L.id = 'hfl'; C = document.createElement('div'); C.id = 'hfcap';
      stage.after(L, C);
    }
    for (const el of [L, C]) el.style.cssText = `position:absolute;left:0;top:0;width:${stage.style.width};height:${stage.style.height};transform:${stage.style.transform};transform-origin:0 0;overflow:hidden;pointer-events:none`;
  }
  const absUrl = v => (typeof v === 'string' && /\.(jpe?g|png|webp|gif|svg|mp4)$/i.test(v) && !/^(https?:|data:|file:)/.test(v) ? new URL(url(v), document.baseURI).href : v);
  function frame(key, blk) {
    let f = FR.get(key);
    if (f) return f;
    const b = CAT[blk], host = document.createElement('div'), ifr = document.createElement('iframe');
    ifr.name = key; ifr.src = b.file; ifr.setAttribute('scrolling', 'no');
    ifr.style.cssText = `position:absolute;left:0;top:0;width:${b.w}px;height:${b.h}px;border:0;transform-origin:0 0;background:transparent;pointer-events:none`;
    host.appendChild(ifr); L.appendChild(host);
    const ready = new Promise(res => ifr.addEventListener('load', res, { once: true })).then(async () => {
      const w = ifr.contentWindow, d = w.document;
      if (b.layer === 'over') { const st = d.createElement('style'); st.textContent = 'html,body{background:transparent!important}'; d.head.appendChild(st); }
      await Promise.race([Promise.all([d.fonts?.ready, w.__hf?.buildReady]), new Promise(r => setTimeout(r, 8000))]);
    });
    f = { host, ifr, ready: Promise.race([ready, new Promise(r => setTimeout(r, 15000))]), used: 0 };
    FR.set(key, f);
    return f;
  }
  window.hfMount = async (stage, t) => {
    const slots = [...stage.querySelectorAll('.hfslot')];
    if (!slots.length && !FR.size) return;
    layers(stage);
    const live = new Set(), n = performance.now();
    for (const sl of slots) {
      const key = sl.dataset.hf, f = frame(key, sl.dataset.blk);
      live.add(key); f.used = n;
      await f.ready;
      const k = +sl.dataset.k;
      // the iframe lives outside #stage: carry over the opacity of the slot's wrappers (scene in/out envelope, keyframes)
      let op = +sl.dataset.op;
      for (let e = sl.parentElement; e && e !== stage; e = e.parentElement) if (e.style.opacity !== '') op *= +e.style.opacity;
      f.host.style.cssText = `${sl.style.cssText};overflow:hidden;opacity:${op.toFixed(3)};display:block;z-index:${live.size}`;
      f.ifr.style.transform = `translate(${-sl.dataset.ox * k}px,${-sl.dataset.oy * k}px) scale(${k})`;
      try { hfSeek(f.ifr.contentWindow, +sl.dataset.t); } catch (e) { console.warn('hf seek', key, e); }
    }
    for (const [key, f] of FR) if (!live.has(key)) f.host.style.display = 'none';
    if (FR.size > 14) for (const [key, f] of [...FR].filter(([k]) => !live.has(k)).sort((a, b) => a[1].used - b[1].used).slice(0, FR.size - 14)) { f.host.remove(); FR.delete(key); }
    C.replaceChildren(...(slots.length ? [...stage.querySelectorAll('#cap, #sub2')] : []));
  };
  window.hfReset = () => { for (const f of FR.values()) f.host.remove(); FR.clear(); if (C) C.replaceChildren(); };

  // ---------- library ----------
  for (const g of GROUPS) {
    const items = Object.entries(CAT).filter(([, b]) => b.group === g.id).map(([name, b]) => ({
      type: 'hf', label: b.label, block: name,
      make: T => ({ type: 'hf', block: name, t0: T, t1: T + Math.min(12, Math.max(2, b.dur)), ...(b.layer === 'full' ? { fit: 'contain' } : {}) }),
    }));
    if (items.length) PACKS.push({ id: g.id, name: g.name, icon: g.icon, desc: 'HyperFrames (HeyGen, Apache-2.0)', items });
  }
})();
