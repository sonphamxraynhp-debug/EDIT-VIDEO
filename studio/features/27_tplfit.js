// "Bám lời thoại" (studio/routes/27_tplfit.mjs → scripts/tpl_fit.mjs): after "Dùng mẫu" every template scene is re-timed to the
// sentence it belongs to, its placeholder text rewritten from the speech, sample photos replaced by photos found for that
// sentence and caption keywords highlighted. Projects without captions get them first (whisper). library.js calls
// Studio.fitTemplate(tpl) right after applying a template; the project tab has a button to run it again. One ⌘Z undoes it
// together with the template.
'use strict';
(() => {
  const S = Studio, esc = S.esc;
  let busy = false;
  S.fitTemplate = async (tpl, o = {}) => {
    if (busy) return;
    busy = true;
    await S.saveNow();
    const r = await S.api('/api/tplfit', { claude: o.claude !== false, images: o.images !== false });
    if (!r.ok) { busy = false; return S.toast(r.error || 'Đang có tác vụ khác chạy'); }
    const t0 = Date.now();
    S.modal(`<h3><i class="ti ti-wand"></i> Đang làm mẫu ${tpl?.name ? '“' + esc(tpl.name) + '” ' : ''}khớp lời thoại…</h3>
      <div class="muted" style="margin:0 0 6px">Canh từng graphic đúng lúc nói · viết lại chữ theo nội dung clip · thay ảnh mẫu bằng ảnh theo lời nói · nhấn từ khoá phụ đề.</div>
      <div id="jobstep" class="muted">Bắt đầu</div><div class="bar"><i></i></div><div class="muted" id="tfel" style="font-size:11px;margin-top:4px"></div>`);
    const tick = setInterval(() => { const el = document.getElementById('tfel'); if (el) el.textContent = `Đã chạy ${Math.round((Date.now() - t0) / 1000)} giây`; else clearInterval(tick); }, 1000);
    S.pollJob(async j => {
      clearInterval(tick); busy = false;
      if (j.state !== 'done') {
        return S.modal(`<h3>Chưa làm mẫu khớp lời thoại được</h3><p>${esc(j.step)}</p>
          <p class="muted">Mẫu đã được áp dụng, nhưng chữ và ảnh vẫn là nội dung mẫu. Kiểm tra video có tiếng nói, rồi bấm “Bám lời thoại” trong tab Dự án để thử lại.</p>
          <div class="actions"><button onclick="closeModal()">Đóng</button></div>`);
      }
      await S.reload();
      const x = j.out || {}, miss = [...new Set(x.missing || [])];
      const ai = x.claude && x.claude !== 'ok' ? `<p class="muted"><i class="ti ti-alert-triangle"></i> Không dùng được Claude (${esc(x.claude)}), chữ được lấy thẳng từ lời nói — nên đọc lại.</p>` : '';
      if (miss.length || ai) {
        S.modal(`<h3><i class="ti ti-check"></i> Mẫu đã khớp lời thoại</h3>
          <p>${x.transcribed ? `Đã tạo lời thoại (${x.transcribed.words} từ). ` : ''}${x.fit} cảnh canh theo câu nói · ${x.texts} chữ viết lại · ${x.images} ảnh theo lời thoại${x.hl ? ` · ${x.hl} từ khoá phụ đề` : ''}.</p>${ai}
          ${miss.length ? `<p class="muted">Còn ${miss.length} chỗ lời thoại không nhắc tới, bạn tự sửa nhé: ${miss.slice(0, 8).map(esc).join(' · ')}</p>` : ''}
          <div class="actions"><button class="primary" onclick="closeModal()">OK</button></div>`);
      } else {
        S.closeModal();
        S.toast(`Mẫu đã khớp lời thoại: ${x.texts} chữ, ${x.images} ảnh, ${x.fit} cảnh canh theo câu nói — ⌘Z để hoàn tác`);
      }
    });
  };
  document.addEventListener('click', e => { if (e.target.closest('[data-pact="tplfit"]')) { S.pushUndo(); S.fitTemplate(); } });
})();
