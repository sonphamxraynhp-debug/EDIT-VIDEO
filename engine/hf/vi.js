// Vietnamese defaults for HyperFrames blocks (hand-written, survives re-imports): vars → catalog[name].vi,
// texts (keyed by the block's original text) → catalog[name].vit. A scene's own vars/texts still win.
(() => {
  const C = window.HF_CATALOG || {};
  const VI = {
    'count-up': { vars: { end: 120, suffix: '%', prefix: '+' } },
    'testimonial-card': { vars: { quote: 'Dùng thử 1 tuần là mình chốt mua luôn.', author: 'Chị Lan Anh', handle: 'Khách hàng Hà Nội' } },
    'testimonial-proof-card': { vars: { quote: 'Doanh số tháng này tăng gấp đôi.', author: 'Anh Minh', role: 'Chủ cửa hàng' } },
    'star-rating-fill': { vars: { rating: 4.9 } },
    'cta-lockup': { vars: { action_line: 'Bắt đầu ngay hôm nay', button_label: 'Nhắn tin để được tư vấn', microcopy: 'Miễn phí tư vấn' } },
    'cta-close': { vars: { action_line: 'Đặt hàng ngay', button_label: 'Mua ngay' } },
    'store-badge-lockup': { vars: { headline: 'Tải ứng dụng ngay' } },
    'notification-stack': { vars: { titles: 'Đơn hàng mới,Đã thanh toán,Đang giao hàng', bodies: 'Khách vừa đặt 2 sản phẩm,Chuyển khoản thành công,Dự kiến nhận hàng ngày mai' } },
    'native-notification-pop': { vars: { title: 'Có đơn hàng mới', body: 'Khách vừa đặt 2 sản phẩm', app_label: 'Cửa hàng' } },
    'bar-chart-race': { vars: { title: 'Doanh thu theo kênh bán', subtitle: 'Đơn vị: triệu đồng', valuePrefix: '', valueSuffix: 'tr', periods: '2020, 2021, 2022, 2023, 2024, 2025',
      series: 'Facebook: 42, 58, 71, 96, 118, 131\nTikTok Shop: 5, 20, 60, 110, 170, 240\nShopee: 30, 45, 60, 80, 95, 120\nWebsite: 20, 25, 33, 40, 52, 60\nCửa hàng: 70, 72, 75, 78, 80, 82\nZalo: 10, 15, 22, 30, 41, 55' } },
    'comparison-split': { vars: { labelA: 'Trước', labelB: 'Sau' } },
    'headline-slam': { vars: { text: 'Giảm giá sốc hôm nay', accent_word_index: 2 } },
    'titlecard-lockup': { vars: { wordmark: 'THƯƠNG HIỆU', label: 'GIẢI PHÁP CHO DOANH NGHIỆP', kicker: 'GIỚI THIỆU' } },
    'social-proof-card': { vars: { brand: 'Thương hiệu', proof: '12.000+ khách hàng', cta: 'Dùng thử miễn phí', f1: 'Nhanh|giao trong 2h', f2: 'Chuẩn|chính hãng', f3: 'Yên tâm|đổi trả 30 ngày' } },
    'trust-strip': { vars: { marks: 'Đối tác 1, Đối tác 2, Đối tác 3, Đối tác 4, Đối tác 5' } },
    'split-flap-board': { vars: { boardText: 'KHAI TRUONG' } },
    'marker-checklist-card': { vars: { top: 'SỨC MẠNH', mid: 'CỦA', circled: 'MỘT', rest: 'CHẠM', l1: 'CHỌN', v1: 'MẪU', l2: 'SỬA', v2: 'CHỮ', l3: 'ĐĂNG', v3: 'NGAY' } },
    'typed-prompt': { vars: { text: 'Viết kịch bản video bán hàng 30 giây' } },
    'logo-sting': { vars: { wordmark: 'THƯƠNG HIỆU' } },
    'logo-brand-close': { vars: { wordmark: 'THƯƠNG HIỆU', tagline: 'Chất lượng tạo niềm tin', url: 'thuonghieu.vn' } },
    'chat-thread': { vars: { contact: 'Khách hàng' } },
    'lower-third-bild': { vars: { TXT_MAIN_1_Line: 'TIN NÓNG', TXT_SUB: 'Khai trương chi nhánh mới' } },
    'lt-clean-bar': { texts: { 'Dr. Maya Chen': 'Nguyễn Minh Anh', 'Maya Chen': 'Nguyễn Minh Anh', 'Host · Neuroscientist': 'Giám đốc · Công ty ABC' } }, 'lt-bold-block': { texts: { 'Dr. Maya Chen': 'Nguyễn Minh Anh', 'Maya Chen': 'Nguyễn Minh Anh', 'Host · Neuroscientist': 'Giám đốc · Công ty ABC' } }, 'lt-color-block': { texts: { 'Dr. Maya Chen': 'Nguyễn Minh Anh', 'Maya Chen': 'Nguyễn Minh Anh', 'Host · Neuroscientist': 'Giám đốc · Công ty ABC' } }, 'lt-dark-card': { texts: { 'Dr. Maya Chen': 'Nguyễn Minh Anh', 'Maya Chen': 'Nguyễn Minh Anh', 'Host · Neuroscientist': 'Giám đốc · Công ty ABC' } }, 'lt-mask-reveal': { texts: { 'Dr. Maya Chen': 'Nguyễn Minh Anh', 'Maya Chen': 'Nguyễn Minh Anh', 'Host · Neuroscientist': 'Giám đốc · Công ty ABC' } },
    'lt-side-rule': { texts: { 'Dr. Maya Chen': 'Nguyễn Minh Anh', 'Maya Chen': 'Nguyễn Minh Anh', 'Host · Neuroscientist': 'Giám đốc · Công ty ABC' } }, 'lt-soft-pill': { texts: { 'Dr. Maya Chen': 'Nguyễn Minh Anh', 'Maya Chen': 'Nguyễn Minh Anh', 'Host · Neuroscientist': 'Giám đốc · Công ty ABC' } }, 'lt-stack-bars': { texts: { 'Dr. Maya Chen': 'Nguyễn Minh Anh', 'Maya Chen': 'Nguyễn Minh Anh', 'Host · Neuroscientist': 'Giám đốc · Công ty ABC' } }, 'lt-accent-underline': { texts: { 'Dr. Maya Chen': 'Nguyễn Minh Anh', 'Maya Chen': 'Nguyễn Minh Anh', 'Host · Neuroscientist': 'Giám đốc · Công ty ABC' } },
    'lt-kicker-name': { texts: { 'Episode 47': 'Nhà sáng lập', 'Maya Chen': 'Nguyễn Minh Anh' } },
    'app-showcase': { texts: { 'Unleash Full Potential': 'Bứt phá giới hạn', 'START NOW': 'BẮT ĐẦU', 'James Medrano': 'Minh Anh', 'JM': 'MA', 'Premium Member': 'Thành viên VIP',
      'Weekly Goal': 'Mục tiêu tuần', 'Your Progress': 'Tiến độ', 'See all': 'Xem hết', 'Running': 'Chạy bộ', 'Cycling': 'Đạp xe', 'Strength': 'Sức mạnh', '45 min': '45 phút', 'Burned Calories': 'Calo đã đốt' } },
    'signup-flow': { texts: { 'Create account': 'Tạo tài khoản', 'Continue with Google': 'Tiếp tục với Google', 'or': 'hoặc', 'email@company.com': 'ten@congty.vn', 'Password': 'Mật khẩu', 'Start building': 'Bắt đầu ngay' } },
    'onboarding-stepper-flow': { texts: { 'Step 2 of 3': 'Bước 2 / 3', 'Choose your visual style': 'Chọn phong cách', 'Continue': 'Tiếp tục' } },
    'settings-toggle-flow': { texts: { 'Auto captions': 'Phụ đề tự động', 'Generate timed captions': 'Tạo phụ đề theo giọng nói', 'Brand kit': 'Bộ nhận diện', 'Apply saved colors': 'Áp màu thương hiệu', 'Sound effects': 'Hiệu ứng âm thanh', 'Layer subtle UI sounds': 'Thêm tiếng động nhẹ' } },
    'spotlight-card': { texts: { 'Spotlight Card': 'Tính năng nổi bật', 'A card with a scripted cursor spotlight and lit border.': 'Mô tả ngắn về tính năng của bạn.' } },
    'camera-rig-depth-stack': { texts: { 'Camera Rig Depth Stack': 'Bộ sưu tập mới' } },
    'data-chart': { texts: { 'Monthly Revenue vs. Conversion Rate': 'Doanh thu và tỉ lệ chốt đơn', 'Revenue': 'Doanh thu', 'Conversion Rate': 'Tỉ lệ chốt', 'Source: Internal analytics': 'Nguồn: số liệu nội bộ' } },
    'animated-bar-chart': { texts: { 'Animated Bar Chart': 'Doanh số 7 tháng', 'Jan': 'T1', 'Feb': 'T2', 'Mar': 'T3', 'Apr': 'T4', 'May': 'T5', 'Jun': 'T6', 'Jul': 'T7' } },
    'apple-money-count': { texts: { '$0': '0đ' } },
    'world-map': { texts: { 'Global GDP per Capita': 'Thị trường xuất khẩu', 'Low': 'Thấp', 'High': 'Cao', 'Source: International Monetary Fund': 'Nguồn: số liệu nội bộ' } },
    'flowchart': { texts: { 'Yes': 'Có', 'Not sure': 'Chưa chắc', 'Should I learn to code?': 'Có nên mở cửa hàng online?', 'Start with Pythom': 'Bắt đầu với Shopee', 'Try no-code first': 'Thử bán qua Facebook', 'Build a personal website': 'Làm website riêng', 'Take a free intro course': 'Học khoá miễn phí' } },
    'flowchart-vertical': { texts: { 'Yes': 'Có', 'Not sure': 'Chưa chắc', 'Should I learn to code?': 'Có nên mở cửa hàng online?', 'Start with Pythom': 'Bắt đầu với Shopee', 'Try no-code first': 'Thử bán qua Facebook', 'Build a personal website': 'Làm website riêng', 'Take a free intro course': 'Học khoá miễn phí' } },
    'confetti': { texts: { 'Confetti': 'Chúc mừng!' } },
    'wireframe-portal-title': { texts: { 'HYPERFRAMES PRESENTS': 'RA MẮT SẢN PHẨM MỚI' } },
    'vfx-text-cursor': { texts: { 'Now available': 'Đã có mặt', 'in HyperFrames': 'tại cửa hàng' } },
    'morph-text': { texts: { 'Do more with less.': 'Làm nhiều hơn, tốn ít hơn.', "Built for what's next.": 'Sẵn sàng cho tương lai.', 'Fast. Focused. Powerful.': 'Nhanh. Gọn. Mạnh.', 'Your work, amplified.': 'Công việc nhân đôi hiệu quả.', 'Start free today.': 'Dùng thử miễn phí hôm nay.' } },
    'texture-mask-text': { texts: { 'Texture Mask Text': 'BỘ SƯU TẬP MỚI' } },
    'news-ticker': { texts: { 'Live': 'Trực tiếp', 'Global Desk': 'Bản tin', 'Breaking': 'Nóng' } },
    'hw-callout-circle': { texts: { 'subject': 'chỗ này' } },
    'hw-underline': { texts: { 'underline the point': 'ý quan trọng', 'cross this out': 'bỏ cách cũ', 'bracket the aside': 'ghi chú thêm' } },
    'yt-circle-pointer': { texts: { 'the thing': 'nhìn đây' } },
    'arc-motion-path': { texts: { 'Arc Motion Path': 'Mới!' } },
    'parallax-zoom': { texts: { 'Inspired by how people discover.': 'Thiết kế theo cách khách hàng tìm kiếm.', 'EBAY PLAYBOOK': 'CẨM NANG BÁN HÀNG' } },
    'parallax-unzoom': { texts: { 'Inspired by how people discover.': 'Thiết kế theo cách khách hàng tìm kiếm.', 'EBAY PLAYBOOK': 'CẨM NANG BÁN HÀNG' } },
    'mesh-gradient-bg': { texts: { 'Mesh Gradient Background': '', 'A render-safe mesh gradient using animated radial layers.': '' } },
    'vignette': { texts: { 'Frame the eye. Hold the moment.': '' } },
    'ui-3d-reveal': { texts: { 'HeyGen — Home': 'Trang chủ', 'App Redesign': 'Thiết kế app' } },
  };
  // Demo captions that just repeat the block's name ("chat-thread", "Arc Motion Path"…): title blocks get a placeholder
  // headline, everything else hides them.
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [name, b] of Object.entries(C)) for (const t of b.texts) {
    if (![name, b.title, b.root].some(x => norm(x) === norm(t.def))) continue;
    const ph = t.def === t.def.toUpperCase() ? 'TIÊU ĐỀ CỦA BẠN' : 'Tiêu đề của bạn';
    (b.vit = b.vit || {})[t.i] = b.group === 'hf_logo' ? ph : '';
  }
  for (const [name, d] of Object.entries(VI)) {
    const b = C[name]; if (!b) continue;
    const ids = new Set(b.vars.map(v => v.id));
    if (d.vars) b.vi = Object.fromEntries(Object.entries(d.vars).filter(([k]) => ids.has(k)));
    if (d.texts) b.vit = Object.assign(b.vit || {}, Object.fromEntries(Object.entries(d.texts).map(([def, v]) => [b.texts.find(t => t.def === def)?.i, v]).filter(([i]) => i != null)));
  }
})();
