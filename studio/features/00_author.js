// Author intro shown every time the Studio opens (+ "Tác giả" chip next to the logo to see it again).
// Required credit — see NOTICE / AGENTS.md: keep the author name and course link when modifying or redistributing.
// Own overlay (not #modal) so it never fights with features that open dialogs on start. Closes on the button, Esc, a click
// outside, or by itself after 9 s (paused while the pointer is over it).
'use strict';
(() => {
  const AUTHOR = 'Nguyễn Tất Kiểm', COURSE = 'https://nguyentatkiem.com.vn/aiplusntk/', SITE = 'https://taki.vn';
  const css = document.createElement('style');
  css.textContent = `
  #author { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(5,6,9,.62); backdrop-filter: blur(4px); animation: au-in .25s ease; }
  #author.out { opacity: 0; transition: opacity .25s; }
  @keyframes au-in { from { opacity: 0; } }
  #author .card { width: min(440px, calc(100vw - 32px)); background: linear-gradient(160deg, var(--bg2), var(--bg1)); border: 1px solid var(--line2); border-radius: 14px;
    box-shadow: 0 24px 80px rgba(0,0,0,.55); padding: 26px 26px 20px; text-align: center; position: relative; overflow: hidden; }
  #author .card::before { content: ''; position: absolute; inset: -40% -20% auto; height: 220px; background: radial-gradient(closest-side, rgba(139,123,255,.28), transparent); pointer-events: none; }
  #author .mk { width: 46px; height: 46px; border-radius: 13px; margin: 0 auto 12px; background: conic-gradient(from 210deg, #8B7BFF, #2DD4BF, #8B7BFF); box-shadow: 0 6px 24px rgba(139,123,255,.5); position: relative; }
  #author .mk i { position: absolute; background: #0B0C0F; border-radius: 3px; }
  #author .mk i:nth-child(1) { left: 12px; top: 12px; width: 5px; height: 22px; } #author .mk i:nth-child(2) { left: 20.5px; top: 18px; width: 5px; height: 16px; } #author .mk i:nth-child(3) { left: 29px; top: 14px; width: 5px; height: 20px; }
  #author h2 { margin: 0; font-size: 19px; letter-spacing: -.01em; }
  #author .by { margin: 6px 0 0; color: var(--tx2); font-size: 13px; }
  #author .by b { color: var(--tx); }
  #author .tag { margin: 10px 0 16px; color: var(--tx3); font-size: 12px; line-height: 1.5; }
  #author .gift { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 13.5px;
    color: #fff; background: linear-gradient(135deg, #8B7BFF, #6C5CF0); box-shadow: 0 6px 22px rgba(108,92,240,.45); }
  #author .gift:hover { filter: brightness(1.08); }
  #author .row { display: flex; gap: 8px; margin-top: 10px; }
  #author .row a, #author .row button { flex: 1; justify-content: center; padding: 9px; border-radius: 9px; border: 1px solid var(--line2); background: var(--bg3); color: var(--tx2); text-decoration: none; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 6px; }
  #author .row button { color: var(--tx); font-weight: 600; }
  #author .bar { height: 2px; background: var(--line); border-radius: 2px; margin-top: 14px; overflow: hidden; }
  #author .bar i { display: block; height: 100%; width: 100%; background: var(--acc); transform-origin: left; animation: au-t 9s linear forwards; }
  #author:hover .bar i { animation-play-state: paused; }
  @keyframes au-t { to { transform: scaleX(0); } }
  .au-chip { margin-left: 4px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line2); background: var(--bg2); color: var(--tx2); font-size: 11px; cursor: pointer; white-space: nowrap; }
  .au-chip:hover { color: var(--tx); border-color: var(--acc-line); }`;
  document.head.appendChild(css);

  function show(auto = true) {
    if (document.getElementById('author')) return;
    const el = document.createElement('div');
    el.id = 'author';
    el.innerHTML = `<div class="card" role="dialog" aria-label="Giới thiệu tác giả">
      <div class="mk"><i></i><i></i><i></i></div>
      <h2>AI Video Studio</h2>
      <p class="by">Phần mềm của tác giả <b>${AUTHOR}</b></p>
      <p class="tag">Edit video bằng AI chạy ngay trên máy bạn: template tự bám lời thoại, tạo style từ video bất kỳ, tự lái, agent Telegram.</p>
      <a class="gift" href="${COURSE}" target="_blank" rel="noopener"><i class="ti ti-gift"></i> Tặng khoá học AI miễn phí</a>
      <div class="row"><a href="${SITE}" target="_blank" rel="noopener"><i class="ti ti-world"></i> taki.vn</a><button data-close><i class="ti ti-player-play"></i> Bắt đầu dùng</button></div>
      ${auto ? '<div class="bar"><i></i></div>' : ''}</div>`;
    const close = () => { if (!el.isConnected) return; el.classList.add('out'); setTimeout(() => el.remove(), 250); document.removeEventListener('keydown', esc, true); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', esc, true);
    if (auto) el.querySelector('.bar i').addEventListener('animationend', close);
    document.body.appendChild(el);
  }
  // "Tác giả" chip beside the logo
  const logo = document.querySelector('.logo');
  if (logo) {
    const b = document.createElement('button');
    b.className = 'au-chip'; b.title = `Tác giả: ${AUTHOR} · Tặng khoá học AI miễn phí`; b.innerHTML = '<i class="ti ti-user-heart" style="font-size:12px"></i> Tác giả';
    b.onclick = () => show(false);
    logo.appendChild(b);
  }
  show(true);
  window.Studio && (Studio.showAuthor = () => show(false));
})();
