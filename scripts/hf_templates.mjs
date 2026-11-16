// Writes the "Doanh nghiệp / Bán hàng" templates built from HyperFrames blocks (engine/hf) into templates/<id>.json.
// usage: node scripts/hf_templates.mjs   then   node scripts/build_templates.mjs <footage> <id …>   (previews)
// Vertical layout: full-frame (16:9) blocks sit as a band over the lower half (BAND, captions hidden meanwhile) or centred
// for intro/outro (MID); transparent blocks (lower thirds, notifications…) use the engine's own default placement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'templates');
const CAT = JSON.parse(fs.readFileSync(path.join(here, '..', 'engine/hf/catalog.json'), 'utf8'));
const hf = (block, t0, t1, o = {}) => {
  if (!CAT[block]) throw new Error('missing block ' + block);
  return { type: 'hf', block, t0, t1, ...o };
};
const BAND = { y: 1010, hideCaptions: true }, MID = { y: 640, hideCaptions: true };
const V = (id, name, category, desc, tags, needs, title, caption_style, music, brand, scenes, fx = [], preview = { from: 0, to: 6, still: 2 }) =>
  ({ id, name, category, aspect: '9:16', pack: 'hf_tin', desc, tags, title, caption_style, music, brand, use_recipe: false, base_dur: 20.2, needs, preview, fx, scenes });
const H = (...a) => ({ ...V(...a), aspect: '16:9' });

const T = [
  V('dn-gioi-thieu-cong-ty', 'Giới thiệu công ty', 'doanhnghiep', 'Thẻ tiêu đề thương hiệu, tên + chức danh người nói, biểu đồ doanh thu, dải đối tác và logo kết.',
    ['giới thiệu', 'công ty', 'thương hiệu', 'doanh nghiệp'], ['tên công ty', 'người nói + chức danh', 'số liệu nổi bật'], 'Giới thiệu công ty', 'hf_weight_shift', 'corporate', { primary: '#3E7BFA', accent: '#9CC2FF', dark: '#0B1220' },
    [hf('titlecard-lockup', 0, 3, { ...MID, vars: { wordmark: 'CÔNG TY ABC', label: 'ĐỒNG HÀNH CÙNG DOANH NGHIỆP VIỆT', kicker: 'XIN CHÀO' } }),
      hf('lt-kicker-name', 3.2, 8, { texts: { 0: 'Nhà sáng lập', 1: 'Nguyễn Minh Anh' } }),
      hf('data-chart', 8.6, 14.2, BAND),
      hf('trust-strip', 14.6, 17.6, BAND),
      hf('logo-brand-close', 17.8, 20.2, { ...MID, vars: { wordmark: 'CÔNG TY ABC', tagline: 'Chất lượng tạo niềm tin', url: 'congtyabc.vn' } })],
    [{ t: 3, type: 'punch', amp: .06 }, { t: 17.8, type: 'flash' }], { from: 0, to: 6, still: 1.9 }),

  V('dn-ra-mat-san-pham', 'Ra mắt sản phẩm mới', 'doanhnghiep', 'Cổng không gian mở màn, sản phẩm xoay 360°, danh sách thông số trượt vào, chốt bằng nút hành động.',
    ['ra mắt', 'sản phẩm mới', 'launch', 'thông số'], ['tên sản phẩm', 'thông số nổi bật', 'lời kêu gọi'], 'Ra mắt sản phẩm', 'hf_gradient_fill', 'epic', { primary: '#7C5CFF', accent: '#FFD166', dark: '#0A0718' },
    [hf('titlecard-lockup', 0, 3.4, { ...MID, vars: { wordmark: 'SẢN PHẨM MỚI', label: 'RA MẮT HÔM NAY', kicker: 'GIỚI THIỆU' } }),
      hf('product-turntable', 3.6, 8.4, BAND),
      hf('mk-specs-list', 8.8, 14.6),
      hf('cta-lockup', 16.2, 20.2, { ...MID, vars: { action_line: 'Đặt trước hôm nay', button_label: 'Nhận ưu đãi ra mắt', microcopy: 'Số lượng có hạn' } })],
    [{ t: 3.6, type: 'whip' }, { t: 16.2, type: 'punch', amp: .1 }], { from: 0, to: 6, still: 2.6 }),

  V('dn-demo-phan-mem', 'Demo phần mềm / app', 'doanhnghiep', 'Gõ câu lệnh mở đầu, điện thoại + tablet + laptop xoè ra, màn đăng ký, các bước hướng dẫn, tải app trên 2 kho.',
    ['app', 'phần mềm', 'SaaS', 'demo'], ['tên app', 'tính năng chính', 'link tải'], 'Demo phần mềm', 'hf_pill_karaoke', 'tech', { primary: '#00C2A8', accent: '#B4FFF2', dark: '#04110F' },
    [hf('typed-prompt', 0, 3.2, { ...MID, vars: { text: 'Quản lý bán hàng chỉ trong 1 app' } }),
      hf('multi-device-splay', 3.4, 7.6, BAND),
      hf('signup-flow', 8, 12.4, BAND),
      hf('onboarding-stepper-flow', 12.8, 16.8, BAND),
      hf('store-badge-lockup', 17.2, 20.2, { ...MID, vars: { headline: 'Tải app miễn phí' } })],
    [{ t: 3.4, type: 'zoom_in' }], { from: 0, to: 6, still: 5.2 }),

  V('dn-bao-cao-so-lieu', 'Báo cáo số liệu', 'doanhnghiep', 'Con số tăng trưởng đếm lên, cuộc đua doanh thu giữa các kênh bán, thanh tiến độ mục tiêu và dấu tích hoàn thành.',
    ['số liệu', 'báo cáo', 'tăng trưởng', 'doanh thu'], ['con số chính', 'số liệu theo kênh', 'mục tiêu'], 'Kết quả quý này', 'hf_editorial_emphasis', 'corporate_2', { primary: '#22C55E', accent: '#BBF7D0', dark: '#06130B' },
    [hf('count-up', 0.4, 3.6, { ...MID, vars: { end: 245, prefix: '+', suffix: '%' } }),
      hf('bar-chart-race', 4, 13.4, BAND),
      hf('mk-progress-stat', 13.8, 17.4),
      hf('success-check', 17.6, 20.2, MID)],
    [{ t: .4, type: 'punch', amp: .08 }], { from: 0, to: 6, still: 2.4 }),

  V('bh-khach-hang-noi-gi', 'Khách hàng nói gì', 'banhang', 'Thẻ đánh giá của khách, chấm 4,9 sao, thẻ 12.000+ khách hàng, tường logo và câu kêu gọi đặt hàng.',
    ['đánh giá', 'feedback', 'khách hàng', 'uy tín'], ['lời khen của khách', 'số khách đã mua', 'lời kêu gọi'], 'Khách hàng nói gì', 'hf_highlight_sweep', 'inspire', { primary: '#F97316', accent: '#FFE0B2', dark: '#140A02' },
    [hf('testimonial-card', 0.3, 4.4, BAND),
      hf('star-rating-fill', 4.8, 8.4, BAND),
      hf('social-proof-card', 8.8, 12.8, BAND),
      hf('logo-wall', 13.2, 16.8, BAND),
      hf('cta-close', 17.2, 20.2, MID)],
    [], { from: 0, to: 6, still: 3.2 }),

  V('bh-don-hang-do-ve', 'Đơn hàng đổ về', 'banhang', 'Thông báo có đơn mới bật lên, chồng thông báo thanh toán/giao hàng, tiền tăng vọt, pháo giấy và nút Mua ngay.',
    ['đơn hàng', 'thông báo', 'chốt đơn', 'bán hàng online'], ['sản phẩm', 'doanh số', 'lời kêu gọi'], 'Đơn hàng đổ về', 'hf_kinetic_slam', 'hype', { primary: '#EF4444', accent: '#FDE047', dark: '#140404' },
    [hf('headline-slam', 0.2, 3.4, { ...MID, size: 150, vars: { text: 'Đơn về liên tục', accent_word_index: 1 } }),
      hf('notification-stack', 3.8, 8, BAND),
      hf('notification-pileup', 8.4, 12.6),
      hf('apple-money-count', 13, 16.8, { ...BAND, texts: { 0: '0đ' } }),
      hf('confetti', 16.6, 20.2, { y: 640, hideCaptions: false }),
      hf('cta-close', 17.4, 20.2, { ...MID, vars: { action_line: 'Chốt đơn ngay', button_label: 'Mua ngay' } })],
    [{ t: .2, type: 'shake', amp: 10 }, { t: 13, type: 'punch', amp: .1 }], { from: 0, to: 6, still: 1.6 }),

  V('dn-tuyen-dung', 'Tuyển dụng', 'doanhnghiep', 'Tiêu đề đập mạnh "Chúng tôi đang tuyển", tên + vị trí người tuyển, thẻ checklist quyền lợi, bảng lật chữ và nút ứng tuyển.',
    ['tuyển dụng', 'việc làm', 'HR', 'tuyển người'], ['vị trí tuyển', 'quyền lợi', 'cách ứng tuyển'], 'Chúng tôi đang tuyển', 'hf_neon_accent', 'happy', { primary: '#EC4899', accent: '#FBCFE8', dark: '#16050E' },
    [hf('headline-slam', 0, 3, { ...MID, size: 150, vars: { text: 'Chúng tôi đang tuyển', accent_word_index: 3 } }),
      hf('lt-color-block', 3.2, 8, { texts: { 0: 'Trần Thu Hà', 1: 'Trưởng phòng nhân sự' } }),
      hf('marker-checklist-card', 8.4, 13, { ...BAND, vars: { top: 'LÀM VIỆC', mid: 'Ở', circled: 'ĐÂY', rest: 'ĐƯỢC GÌ', l1: 'LƯƠNG', v1: 'CẠNH TRANH', l2: 'THƯỞNG', v2: 'THÁNG 13', l3: 'HỌC', v3: 'MIỄN PHÍ' } }),
      hf('split-flap-board', 13.4, 16.8, { ...BAND, vars: { boardText: 'TUYEN DUNG' } }),
      hf('cta-lockup', 17.2, 20.2, { ...MID, vars: { action_line: 'Ứng tuyển ngay', button_label: 'Gửi CV hôm nay', microcopy: 'Phản hồi trong 48 giờ' } })],
    [{ t: 0, type: 'flash' }], { from: 0, to: 6, still: 1.8 }),

  V('dn-su-kien-hoi-thao', 'Sự kiện / hội thảo', 'doanhnghiep', 'Bảng lật chữ báo sự kiện, tên diễn giả, lưới ảnh hội trường, đồng hồ đếm số người tham dự và nút đăng ký.',
    ['sự kiện', 'hội thảo', 'workshop', 'đăng ký'], ['tên sự kiện', 'diễn giả', 'thời gian / địa điểm'], 'Hội thảo 2026', 'hf_clip_wipe', 'inspire_2', { primary: '#0EA5E9', accent: '#BAE6FD', dark: '#03111A' },
    [hf('split-flap-board', 0, 3.4, { ...MID, vars: { boardText: 'HOI THAO 2026', cellCount: 13 } }),
      hf('lt-soft-pill', 3.6, 8.4, { texts: { 0: 'Diễn giả: Lê Quang Huy', 1: 'Chuyên gia marketing' } }),
      hf('mk-placeholder-grid', 8.8, 13.2),
      hf('count-up', 13.6, 16.8, { ...BAND, vars: { end: 500, prefix: '', suffix: '+' } }),
      hf('cta-lockup', 17.2, 20.2, { ...MID, vars: { action_line: 'Giữ chỗ miễn phí', button_label: 'Đăng ký tham dự', microcopy: 'Chỉ còn 50 ghế' } })],
    [], { from: 0, to: 6, still: 3.2 }),

  V('bh-uu-dai-co-han', 'Ưu đãi có hạn', 'banhang', 'Tiêu đề giảm giá sốc, con số % quay kiểu máy xèng, huy hiệu bật, dấu tích đã áp mã và câu chốt đơn.',
    ['khuyến mãi', 'giảm giá', 'flash sale', 'ưu đãi'], ['mức giảm', 'thời hạn', 'lời kêu gọi'], 'Giảm giá sốc', 'hf_texture', 'hype_2', { primary: '#F43F5E', accent: '#FFE4E6', dark: '#18040A' },
    [hf('headline-slam', 0, 3, { ...MID, size: 150 }),
      hf('slot-machine-roll', 3.4, 8, BAND),
      hf('badge-pop', 8.4, 12.4, BAND),
      hf('success-check', 12.8, 16.6, BAND),
      hf('cta-close', 17, 20.2, { ...MID, vars: { action_line: 'Chỉ hôm nay thôi', button_label: 'Mua ngay' } })],
    [{ t: 0, type: 'shake', amp: 14 }, { t: 3.4, type: 'flash' }], { from: 0, to: 6, still: 1.5 }),

  V('dn-quy-trinh-dich-vu', 'Quy trình dịch vụ', 'doanhnghiep', 'Sơ đồ quyết định dọc toàn màn hình, quy trình vẽ tay, gạch chân ý chính và dấu tích hoàn thành.',
    ['quy trình', 'dịch vụ', 'các bước', 'tư vấn'], ['các bước làm việc', 'câu hỏi khách hay gặp'], 'Quy trình 4 bước', 'hf_weight_shift', 'corporate', { primary: '#14B8A6', accent: '#CCFBF1', dark: '#04120F' },
    [hf('flowchart-vertical', 0.3, 8.2, { fit: 'cover', hideCaptions: true }),
      hf('hw-pipeline', 8.6, 14.4),
      hf('hw-underline', 14.8, 17.4, BAND),
      hf('success-check', 17.6, 20.2, MID)],
    [{ t: 8.6, type: 'whip' }], { from: 0, to: 6, still: 3 }),

  V('bh-truoc-sau-so-sanh', 'Trước & sau dịch vụ', 'banhang', 'Hai khung trước/sau so sánh, thanh quét trước/sau, danh sách lợi ích và nút đặt lịch.',
    ['trước sau', 'so sánh', 'dịch vụ', 'kết quả'], ['ảnh trước', 'ảnh sau', 'lợi ích'], 'Trước và sau', 'hf_matrix_decode', 'happy_2', { primary: '#A855F7', accent: '#F3E8FF', dark: '#0F0618' },
    [hf('comparison-split', 0.2, 4.4),
      hf('before-after-wipe', 4.8, 9, BAND),
      hf('mk-specs-list', 9.4, 15),
      hf('cta-lockup', 16.4, 20.2, { ...MID, vars: { action_line: 'Đặt lịch hôm nay', button_label: 'Nhận tư vấn miễn phí', microcopy: 'Ưu đãi cho 20 khách đầu' } })],
    [], { from: 0, to: 6, still: 2.4 }),

  V('dn-ban-tin-doanh-nghiep', 'Bản tin doanh nghiệp', 'doanhnghiep', 'Thanh tin tức + dải tin chạy kiểu truyền hình, bản đồ thị trường, chữ AI trả lời và logo kết.',
    ['bản tin', 'tin tức', 'thông báo', 'doanh nghiệp'], ['tiêu đề tin', 'nội dung chính'], 'Bản tin tuần này', 'hf_glitch_rgb', 'corporate_2', { primary: '#DC2626', accent: '#FECACA', dark: '#120303' },
    [hf('lower-third-bild', 0.3, 7.6, { hideCaptions: true }),
      hf('world-map', 8, 14.2, BAND),
      hf('news-ticker', 14.4, 20.2)],
    [{ t: 8, type: 'glitch' }], { from: 0, to: 6, still: 2.5 }),

  H('dn-keynote-ngang', 'Keynote doanh nghiệp', 'doanhnghiep', 'Video ngang: thẻ tiêu đề, tên người nói, lưới thẻ tính năng, biểu đồ doanh thu và logo kết toàn khung.',
    ['keynote', 'thuyết trình', 'ngang', 'YouTube'], ['tên công ty', 'tính năng', 'số liệu'], 'Keynote doanh nghiệp', 'hf_editorial_emphasis', 'corporate', { primary: '#3E7BFA', accent: '#9CC2FF', dark: '#0B1220' },
    [hf('titlecard-lockup', 0, 3.2, { hideCaptions: true, vars: { wordmark: 'CÔNG TY ABC', label: 'KẾ HOẠCH 2026', kicker: 'KEYNOTE' } }),
      hf('lt-clean-bar', 3.4, 8),
      hf('grid-card-assemble', 8.4, 12.8, { hideCaptions: true }),
      hf('data-chart', 13.2, 18, { hideCaptions: true }),
      hf('logo-brand-close', 18, 20.2, { hideCaptions: true, vars: { wordmark: 'CÔNG TY ABC', tagline: 'Cùng nhau đi xa', url: 'congtyabc.vn' } })],
    [], { from: 0, to: 6, still: 2 }),

  H('dn-ra-mat-ngang', 'Ra mắt sản phẩm (ngang)', 'doanhnghiep', 'Video ngang: tiêu đề đập mạnh, điện thoại + tablet + laptop xoè ra, thẻ tính năng bay quanh, 3 điện thoại giới thiệu app.',
    ['ra mắt', 'sản phẩm', '3D', 'ngang'], ['tên sản phẩm', 'tính năng'], 'Ra mắt sản phẩm', 'hf_gradient_fill', 'epic_2', { primary: '#7C5CFF', accent: '#FFD166', dark: '#0A0718' },
    [hf('headline-slam', 0, 3.6, { hideCaptions: true, vars: { text: 'Sản phẩm mới đã có mặt', accent_word_index: 1 } }),
      hf('multi-device-splay', 4, 8.6, { hideCaptions: true }),
      hf('orbit-card', 9, 14.4, { hideCaptions: true, offset: 4, vars: { feature1Title: 'Luôn đồng bộ', feature1Desc: 'Thay đổi cập nhật tức thì trên mọi thiết bị.' } }),
      hf('app-showcase', 14.8, 20.2, { hideCaptions: true })],
    [{ t: 4, type: 'whip' }, { t: 14.8, type: 'flash' }], { from: 0, to: 6, still: 2.2 }),

  H('dn-saas-ngang', 'Giới thiệu phần mềm (ngang)', 'doanhnghiep', 'Video ngang: giao diện lật 3D, khung trình duyệt, bật tắt cài đặt, con trỏ bấm và thẻ 5 sao cuối video.',
    ['phần mềm', 'SaaS', 'demo', 'ngang'], ['tên phần mềm', 'tính năng', 'số khách hàng'], 'Phần mềm quản lý', 'hf_pill_karaoke', 'tech_2', { primary: '#00C2A8', accent: '#B4FFF2', dark: '#04110F' },
    [hf('browser-device-stage', 0, 4.4, { hideCaptions: true }),
      hf('lt-dark-card', 4.6, 9),
      hf('settings-toggle-flow', 9.4, 14, { hideCaptions: true }),
      hf('press-ripple', 14.2, 16.6, { hideCaptions: true }),
      hf('social-proof-card', 16.8, 20.2, { hideCaptions: true })],
    [], { from: 0, to: 6, still: 2.6 }),

  H('dn-bao-cao-ngang', 'Báo cáo quý (ngang)', 'doanhnghiep', 'Video ngang: đếm số tăng trưởng, đua doanh thu các kênh, thẻ biểu đồ cột và sơ đồ kế hoạch quý sau.',
    ['báo cáo', 'số liệu', 'họp', 'ngang'], ['số liệu quý', 'kế hoạch'], 'Báo cáo quý', 'hf_weight_shift', 'corporate_2', { primary: '#22C55E', accent: '#BBF7D0', dark: '#06130B' },
    [hf('count-up', 0.2, 3.4, { hideCaptions: true, vars: { end: 245, prefix: '+', suffix: '%' } }),
      hf('bar-chart-race', 3.6, 12.6, { hideCaptions: true }),
      hf('animated-bar-chart', 13, 17, { hideCaptions: true }),
      hf('lt-stack-bars', 17.2, 20.2, { texts: { 0: 'Phạm Quốc Bảo', 1: 'Giám đốc kinh doanh' } })],
    [], { from: 0, to: 6, still: 2.5 }),

  H('bh-don-hang-ngang', 'Livestream chốt đơn (ngang)', 'banhang', 'Video ngang: thông báo đơn mới, chồng tin nhắn khách hỏi giá, bình luận hiện dần, pháo giấy và nút đặt hàng.',
    ['livestream', 'chốt đơn', 'bình luận', 'ngang'], ['sản phẩm', 'giá', 'lời kêu gọi'], 'Chốt đơn livestream', 'hf_kinetic_slam', 'hype', { primary: '#EF4444', accent: '#FDE047', dark: '#140404' },
    [hf('notification-stack', 0.2, 4.4, { hideCaptions: true }),
      hf('yt-comment-card', 4.8, 12.6),
      hf('confetti', 13, 17),
      hf('cta-lockup', 17.2, 20.2, { hideCaptions: true, vars: { action_line: 'Chốt đơn ngay', button_label: 'Đặt hàng', microcopy: 'Freeship hôm nay' } })],
    [], { from: 0, to: 6, still: 2 }),
];

for (const t of T) fs.writeFileSync(path.join(OUT, t.id + '.json'), JSON.stringify(t, null, 1));
console.log(T.length, 'mẫu:', T.map(t => t.id).join(' '));
