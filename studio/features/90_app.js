// Mac app glue (references/app-render.md): "Mở thư mục" button, and progress for a project the app started
// from a video dropped on its icon (job running before any project is open).
(() => {
  Studio.onReady(() => Studio.addTopButton('<button class="ghost" id="app-reveal" title="Mở thư mục dự án trong Finder"><i class="ti ti-folder-open"></i></button>',
    async () => { const r = await Studio.api('/api/app/reveal', {}); if (!r.ok) Studio.toast('Chưa mở dự án'); }));
  let shown = false;
  async function watchNew() {
    const j = await Studio.api('/api/job').catch(() => null);
    if (!j || j.kind !== 'new' || j.state !== 'running') return;
    if (!shown) {
      shown = true;
      Studio.modal(`<h3><i class="ti ti-video-plus"></i> Đang tạo dự án từ video…</h3><div id="jobstep" class="muted"></div><div class="bar"><i></i></div><pre id="joblog"></pre>`);
      Studio.pollJob(j => {
        if (j.state === 'done') location.reload();
        else Studio.modal(`<h3>Lỗi tạo dự án</h3><p>${Studio.esc(j.step)}</p><pre>${Studio.esc((j.log || '').slice(-1500))}</pre><div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      });
    }
  }
  // Boot shows "Chưa mở dự án" when nothing is open yet; check after it so the progress modal wins.
  setTimeout(watchNew, 900);
})();
