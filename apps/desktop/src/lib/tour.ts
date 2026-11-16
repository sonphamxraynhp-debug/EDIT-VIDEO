/** Nội dung tutorial: tour làm quen theo quy trình 15 bước + hướng dẫn riêng từng màn hình.
 *  Mỗi bước trỏ tới một phần tử trên màn: `sel` (CSS selector) hoặc `text` (chữ mở đầu của tiêu đề thẻ/nút),
 *  `closest` để làm nổi cả khối chứa. Không tìm thấy → popover hiện giữa màn hình. */

export interface TourTarget {
  sel?: string;
  text?: string;
  closest?: string;
}

export interface TourStep {
  path?: string;
  target?: TourTarget;
  title: string;
  body: string;
  tips?: string[];
}

const PAGE: TourTarget = { sel: ".page-head" };

export const MAIN_TOUR: TourStep[] = [
  {
    title: "Chào mừng đến AI Video Factory",
    body: "Phần mềm biến video bạn tự quay và hồ sơ sản phẩm có bằng chứng thành hàng trăm creative quảng cáo khác nhau, chạy hoàn toàn trên máy. Tour này đi qua quy trình chính trong khoảng 3 phút.",
    tips: [
      "Mọi video phải qua 3 cổng: claim có bằng chứng, chính sách quảng cáo Meta/TikTok, điểm nguyên bản.",
      "Phần mềm không đăng tự động và không có tính năng né bộ lọc trùng lặp.",
      "Dùng phím → và ← để chuyển bước, Esc để đóng.",
    ],
  },
  {
    path: "/",
    target: { sel: ".sidebar" },
    title: "Thanh điều hướng theo quy trình",
    body: "Các mục xếp từ trên xuống đúng thứ tự làm việc: Dự án → Tư liệu → Product Brain → AI Sáng tạo → Sản xuất → Kiểm duyệt → Thư viện → Phân tích.",
  },
  {
    path: "/projects",
    target: PAGE,
    title: "1 · Tạo dự án",
    body: "Một dự án gồm một sản phẩm và một chiến dịch. Bấm “Dự án mới”, nhập tên sản phẩm và số video mục tiêu. Đổi dự án đang làm ở thanh đường dẫn phía trên.",
  },
  {
    path: "/media",
    target: { text: "Nhập tư liệu nguồn", closest: ".card" },
    title: "2 · Nhập video nguồn",
    body: "Kéo thả video tự quay hoặc chọn cả thư mục. Phần mềm đọc thông số, chặn file trùng và tạo bản xem trước nhẹ.",
    tips: ["Càng nhiều clip khác góc máy, bối cảnh thì các bản càng khác nhau. Trên 20 bản cần ít nhất 3 video và 12 cảnh."],
  },
  {
    path: "/media/analyze",
    target: { text: "Phân cảnh nhận diện", closest: ".card" },
    title: "3 · Phân tích và duyệt cảnh",
    body: "Video được tách cảnh, chấm chất lượng, đọc chữ và tách lời thoại. Nhãn cảnh chỉ là gợi ý: bạn duyệt từng cảnh trước khi dùng.",
  },
  {
    path: "/brain",
    target: { text: "AI Knowledge Audit", closest: ".card" },
    title: "4 · Product Brain",
    body: "Nhập USP, cách dùng và claim. Mỗi claim cần gắn bằng chứng mới được duyệt; AI chỉ được nói những claim đã duyệt.",
    tips: ["Nên có từ 5 claim trở lên cho lô trên 50 bản để kịch bản không lặp ý."],
  },
  {
    path: "/creative/strategy",
    target: { text: "Thư viện hook", closest: ".card" },
    title: "5 · Thư viện hook",
    body: "Sinh câu mở đầu bằng AI hoặc gõ tay. Hook mới phải khác các hook đã có và qua cổng chính sách; mỗi hook dùng tối đa cho 5 bản.",
  },
  {
    path: "/creative/strategy",
    target: { text: "Kế hoạch & ước tính", closest: ".card" },
    title: "Kế hoạch & ước tính",
    body: "Nhập số bản muốn làm để biết còn thiếu video nguồn, hook hay claim nào, cần bao nhiêu giờ render và bao nhiêu GB. Hết cảnh báo đỏ thì bấm “Sinh N biến thể”.",
  },
  {
    path: "/creative/matrix",
    target: { text: "Danh sách ý tưởng", closest: ".card" },
    title: "6 · Ma trận biến thể",
    body: "Mỗi dòng là một biến thể khác nhau về khán giả, góc, kết cấu, thời lượng, bố cục, giọng. Cột “Độc đáo” là điểm nguyên bản sau QC. Bấm “Tạo kịch bản” để AI viết hàng loạt.",
  },
  {
    path: "/creative/scripts",
    target: { text: "Kiểm chứng thông tin", closest: ".card" },
    title: "7 · Duyệt kịch bản",
    body: "Cờ đỏ là claim chưa duyệt, câu không khớp bằng chứng hoặc vi phạm chính sách quảng cáo. Sửa câu bị gắn cờ rồi bấm “Duyệt kịch bản”.",
  },
  {
    path: "/creative/storyboard",
    target: PAGE,
    title: "8 · Storyboard",
    body: "Mỗi câu thoại được gán một cảnh, ưu tiên cảnh chưa bản nào dùng. Đổi cảnh, hiệu ứng chuyển động và thời lượng ở cột phải.",
  },
  {
    path: "/production/editor",
    target: { text: "Render Preview" },
    title: "9 · Xem trước",
    body: "Chỉnh timeline, phụ đề, rồi “Render Preview”. Bản xem trước có chữ DRAFT; QC tự chạy khi render xong.",
  },
  {
    path: "/review/qc",
    target: PAGE,
    title: "10 · Kiểm định QC",
    body: "Mỗi bản có báo cáo: claim, chính sách quảng cáo, điểm nguyên bản, kỹ thuật âm thanh hình ảnh, vùng an toàn TikTok. Lỗi claim, chính sách và nguyên bản không duyệt kèm lý do được.",
  },
  {
    path: "/production/batch",
    target: { text: "Thiết lập sản xuất", closest: ".card" },
    title: "11 · Sản xuất hàng loạt",
    body: "Tạo lô render final cho các bản đã duyệt QC. Bản có điểm nguyên bản dưới ngưỡng bị loại và được liệt kê để sửa.",
  },
  {
    path: "/production/queue",
    target: { text: "Lô render", closest: ".card" },
    title: "12 · Hàng đợi render",
    body: "Theo dõi tiến độ, tạm dừng hoặc tiếp tục cả lô. Tắt máy giữa chừng thì mở lại vẫn chạy tiếp.",
  },
  {
    path: "/library",
    target: { text: "Xuất video" },
    title: "13 · Xuất gói quảng cáo",
    body: "Chọn preset Meta Ads hoặc TikTok Ads rồi xuất. Gói gồm video đặt tên theo quy ước và ads_mapping.csv (tên quảng cáo, nội dung, CTA, link có UTM). Bạn tải lên Ads Manager thủ công.",
  },
  {
    path: "/analytics",
    target: { text: "Yếu tố thắng", closest: ".card" },
    title: "14 · Học từ kết quả",
    body: "Nhập CSV từ Ads Manager. Phần mềm tìm hook, góc, bố cục… hiệu quả nhất rồi sinh lô kế tiếp dựa trên chúng.",
  },
  {
    path: "/",
    target: { sel: '[data-tour="help"]' },
    title: "Trợ giúp luôn ở đây",
    body: "Bấm nút này để mở lại tour, xem hướng dẫn riêng của màn đang mở, hoặc xem checklist các bước còn thiếu của dự án.",
  },
];

/** Hướng dẫn riêng từng màn: bước của tour chính cho màn đó + mẹo bổ sung. */
const EXTRA: Record<string, TourStep[]> = {
  "/": [{ path: "/", target: PAGE, title: "Tổng quan", body: "Số liệu sản xuất của mọi dự án, tác vụ đang chạy và tình trạng máy. Khối “Quy trình bắt đầu nhanh” dẫn tới 4 bước đầu tiên." }],
  "/creative/voice": [{ path: "/creative/voice", target: PAGE, title: "Phòng thu giọng đọc", body: "Chọn giọng tiếng Việt của hệ điều hành, tốc độ và mức âm lượng. Bấm “Nghe thử” trước khi lưu làm mặc định. Mỗi biến thể tự được gán một tốc độ khác nhau." }],
  "/creative/templates": [{ path: "/creative/templates", target: PAGE, title: "Thư viện mẫu video", body: "Mẫu quy định cấu trúc, kiểu phụ đề và chuyển động. Ma trận tự chọn mẫu theo góc nội dung; bạn có thể ghim một mẫu cho cả chiến dịch ở màn Chiến lược." }],
  "/production/motion": [{ path: "/production/motion", target: PAGE, title: "Motion & Effects", body: "Xem trước hiệu ứng chuyển động. Bản render hiện hỗ trợ zoom và pan; các hiệu ứng khác chỉ xem trước." }],
  "/production/subtitles": [{ path: "/production/subtitles", target: PAGE, title: "Subtitle Studio", body: "Sửa phụ đề theo từng câu, chọn kiểu chữ và từ khoá nhấn màu. Phụ đề được giữ trong vùng an toàn của TikTok và Reels." }],
  "/review/batch": [{ path: "/review/batch", target: PAGE, title: "Duyệt video hàng loạt", body: "Duyệt nhiều bản cùng lúc. Bản có lỗi claim, chính sách hoặc điểm nguyên bản thấp không duyệt được, kể cả khi chọn nhiều." }],
  "/settings": [{ path: "/settings", target: PAGE, title: "Cài đặt hệ thống", body: "Số job song song, GPU, âm lượng mục tiêu, ngưỡng điểm nguyên bản và sao lưu. Thẻ “Thành phần & phụ thuộc” cho biết FFmpeg, Ollama, giọng đọc đã sẵn sàng chưa." }],
  "/system/hardware": [{ path: "/system/hardware", target: PAGE, title: "Tối ưu phần cứng", body: "Chạy benchmark để biết máy render nhanh cỡ nào và chọn chế độ Eco / Balanced / Turbo phù hợp." }],
  "/system/models": [{ path: "/system/models", target: PAGE, title: "Quản lý mô hình AI", body: "Xem engine nào đã cài. Tải model Whisper bằng một nút để tách lời thoại tiếng Việt. Mọi thứ chạy offline sau khi tải." }],
  "/system/brand": [{ path: "/system/brand", target: PAGE, title: "Nhận diện thương hiệu", body: "Màu, kiểu phụ đề, logo và thẻ kết được chèn vào video khi render. Tải logo PNG nền trong suốt cho đẹp nhất." }],
};

export function screenTour(pathname: string): TourStep[] {
  const match = (p?: string) => p !== undefined && (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/"));
  const exact = (p?: string) => p === pathname;
  const fromMain = MAIN_TOUR.filter((s) => exact(s.path) && s.path !== "/");
  const extra = Object.entries(EXTRA).find(([p]) => exact(p))?.[1] ?? Object.entries(EXTRA).find(([p]) => match(p) && p !== "/")?.[1] ?? [];
  const steps = [...fromMain, ...extra];
  return steps.length ? steps : EXTRA["/"].map((s) => ({ ...s, path: pathname, title: "Màn hình này", body: "Chưa có hướng dẫn riêng cho màn này. Mở “Tour làm quen” để xem toàn bộ quy trình." }));
}

export const TOUR_VERSION = 1;
