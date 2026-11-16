/** Màn mở đầu: chọn Chế độ AI (thả video, AI tự làm), Chế độ Manual (tự làm từng bước) hoặc Tin tức (video kiểu kênh tin), kèm dự án gần đây. */
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, Check, FileText, Newspaper, Quote, Scissors, Sparkles, UserRound } from "lucide-react";
import { fileUrl } from "../lib/api";
import { dt } from "../lib/format";
import { useApp } from "../lib/store";
import { Badge } from "../components/ui";

const MODES = [
  {
    id: "ai",
    icon: <Sparkles size={30} />,
    title: "Chế độ AI",
    lead: "Thả video vào, AI tự làm hết.",
    points: [
      "Tự phân tích video, nghe lời thoại, đọc chữ trên hình",
      "Tự lập hồ sơ sản phẩm từ chính lời nói trong clip",
      "Tự viết, kiểm tra và duyệt kịch bản sạch",
      "Tự dựng bản xem thử; bạn chỉ chọn video nào dùng",
    ],
  },
  {
    id: "manual",
    icon: <FileText size={30} />,
    title: "Chế độ Manual",
    lead: "Bạn tự làm và quyết từng bước.",
    points: [
      "Tự nhập thông tin sản phẩm và tài liệu căn cứ",
      "Tự chọn số video, độ dài, kiểu video",
      "Đọc và duyệt từng kịch bản",
      "Chọn video, xuất bản final và gói quảng cáo",
    ],
  },
  {
    id: "news",
    icon: <Newspaper size={30} />,
    title: "Tin tức",
    lead: "Video kiểu kênh tin, giọng AI đọc.",
    points: [
      "Dán nội dung tin, thả ảnh hoặc video thật vào",
      "AI viết tiêu đề và lời đọc theo nhịp bản tin",
      "Vùng chữ màu, nhãn chuyên mục, tên kênh của bạn",
      "Chọn giọng đọc trong 10 giọng, nhả tiếng gốc của clip",
    ],
  },
];
/** Bốn chế độ làm nhanh, dùng chung màn soạn với Tin tức. */
const MORE = [
  { kind: "review", icon: <UserRound size={22} />, title: "Review người thật", lead: "Clip người nói: cắt khoảng lặng, chạy phụ đề, chèn hình sản phẩm, màn chốt." },
  { kind: "clips", icon: <Scissors size={22} />, title: "Cắt video dài", lead: "Một buổi dạy hay livestream thành nhiều clip ngắn có tiêu đề và phụ đề." },
  { kind: "story", icon: <BookOpen size={22} />, title: "Kể chuyện bằng ảnh", lead: "Mỗi câu một cảnh: hình phủ kín, chữ theo câu, giọng AI đọc." },
  { kind: "quote", icon: <Quote size={22} />, title: "Trích dẫn", lead: "Chữ lớn hiện từng dòng trên nền màu, 10 đến 20 giây, nhạc là chính." },
];
const CTA: Record<string, string> = { ai: "Bắt đầu với AI", manual: "Bắt đầu tự làm", news: "Làm video tin tức" };

export default function Start() {
  const nav = useNavigate();
  const { projects, setProjectId } = useApp();
  return (
    <div className="start">
      <div className="center col" style={{ gap: 6, marginBottom: 26 }}>
        <div className="bold" style={{ fontSize: 26 }}>Hôm nay bạn muốn làm video theo cách nào?</div>
        <div className="t2">Ba cách làm chính và bốn chế độ làm nhanh. Cách nào cũng sửa tay được mọi nội dung.</div>
      </div>
      <div className="start-modes">
        {MODES.map((m) => (
          <div key={m.id} className={`card start-mode ${m.id === "manual" ? "" : m.id}`} onClick={() => nav(m.id === "news" ? "/news?new=1" : `/flow?new=1&mode=${m.id}`)}>
            <div className="start-icon">{m.icon}</div>
            <div className="bold mt12" style={{ fontSize: 20 }}>{m.title}</div>
            <div className="t2 mt4">{m.lead}</div>
            <div className="col mt12" style={{ gap: 8, marginBottom: 16 }}>
              {m.points.map((p) => <div key={p} className="row small" style={{ gap: 8, alignItems: "flex-start" }}><Check size={15} className="c-teal" style={{ flexShrink: 0, marginTop: 2 }} />{p}</div>)}
            </div>
            <div className="btn primary lg" style={{ width: "100%", justifyContent: "center", marginTop: "auto" }}>{CTA[m.id]} <ArrowRight size={16} /></div>
          </div>
        ))}
      </div>
      <div className="start-more mt16">
        {MORE.map((m) => (
          <div key={m.kind} className="card start-mini" onClick={() => nav(`/news?new=1&kind=${m.kind}`)}>
            <div className="row" style={{ gap: 10 }}><span className="c-primary" style={{ display: "inline-flex" }}>{m.icon}</span><span className="bold">{m.title}</span></div>
            <div className="small t2 mt8">{m.lead}</div>
          </div>
        ))}
      </div>
      {projects.length > 0 && (
        <div className="card mt16">
          <div className="bold mb12">Làm tiếp dự án gần đây</div>
          <div className="col" style={{ gap: 8 }}>
            {projects.slice(0, 6).map((p: any) => (
              <div key={p.id} className="list-item row between" style={{ gap: 12 }} onClick={() => { setProjectId(p.id); nav("/flow"); }}>
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  {p.thumbnail ? <img src={fileUrl(p.thumbnail)} alt="" style={{ width: 28, height: 50, objectFit: "cover", borderRadius: 6 }} /> : <div style={{ width: 28 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div className="semi ellipsis">{p.name}</div>
                    <div className="xs muted">{p.phase} · {p.completed}/{p.target} video · {dt(p.updated_at)}</div>
                  </div>
                </div>
                <Badge tone={p.settings_json?.mode === "ai" ? "purple" : "gray"}>{p.settings_json?.mode === "ai" ? "Chế độ AI" : "Manual"}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
