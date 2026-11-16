// Seek a HyperFrames composition window to absolute time t (s): every paused GSAP timeline in window.__timelines,
// keyed by data-composition-id and offset by its (nested) data-start, plus CSS/WAAPI animations. Shared by
// engine/hf.js (live blocks) and scripts/hf_import.mjs (validation + thumbnails).
function hfSeek(w, t) {
  const doc = w.document, tls = w.__timelines || {};
  for (const el of doc.querySelectorAll('[data-composition-id]')) {
    const tl = tls[el.getAttribute('data-composition-id')];
    if (!tl) continue;
    let st = 0;
    for (let e = el; e; e = e.parentElement && e.parentElement.closest('[data-composition-id]')) st += parseFloat(e.getAttribute('data-start')) || 0;
    const lt = Math.max(0, t - st);
    try { if (tl.pause) tl.pause(); if (tl.totalTime) tl.totalTime(lt, false); else if (tl.seek) tl.seek(lt, false); } catch (e) { /* authored timeline threw */ }
  }
  if (doc.getAnimations) for (const a of doc.getAnimations()) { try { a.pause(); a.currentTime = t * 1000; } catch (e) { /* finished/detached */ } }
}
