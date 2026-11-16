export type Tone = "teal" | "purple" | "cyan" | "orange" | "red" | "gray" | "pink";

export const VARIANT_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Nháp", tone: "gray" },
  SCRIPT_READY: { label: "Chờ duyệt kịch bản", tone: "orange" },
  SCRIPT_APPROVED: { label: "Kịch bản đã duyệt", tone: "cyan" },
  STORYBOARD_READY: { label: "Đã có storyboard", tone: "purple" },
  PREVIEW_READY: { label: "Có preview", tone: "purple" },
  QC_PENDING: { label: "Chờ kiểm duyệt", tone: "orange" },
  APPROVED: { label: "Sẵn sàng", tone: "teal" },
  RENDERING: { label: "Đang render", tone: "cyan" },
  COMPLETED: { label: "Hoàn tất", tone: "teal" },
  NEEDS_REVISION: { label: "Cần chỉnh sửa", tone: "orange" },
  REJECTED: { label: "Bị từ chối", tone: "red" },
  FAILED: { label: "Thất bại", tone: "red" },
};

export const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Chờ xử lý", tone: "gray" },
  PREPARING: { label: "Đang chuẩn bị", tone: "cyan" },
  RENDERING: { label: "Đang chạy", tone: "purple" },
  VERIFYING: { label: "Đang kiểm tra", tone: "cyan" },
  COMPLETED: { label: "Hoàn thành", tone: "teal" },
  PAUSED: { label: "Tạm dừng", tone: "orange" },
  RETRY_WAIT: { label: "Chờ thử lại", tone: "orange" },
  FAILED: { label: "Thất bại", tone: "red" },
  CANCELLED: { label: "Đã huỷ", tone: "gray" },
};

export const JOB_KIND: Record<string, string> = {
  proxy: "Tạo proxy",
  analysis: "Phân tích video",
  script: "Sinh kịch bản",
  voice: "Tạo giọng đọc",
  preview: "Render preview",
  final: "Render final",
};

export const CLAIM_STATUS: Record<string, { label: string; tone: Tone }> = {
  approved: { label: "Đã duyệt", tone: "teal" },
  needs_review: { label: "Chờ duyệt", tone: "orange" },
  prohibited: { label: "Bị cấm", tone: "red" },
  expired: { label: "Hết hạn", tone: "gray" },
};

export const SHOT_TAGS: Record<string, string> = {
  demonstration: "Demo / thao tác",
  packshot: "Packshot",
  face: "Khuôn mặt",
  hand: "Bàn tay",
  before_after: "Trước / sau",
  cta: "CTA",
  close_up: "Cận cảnh",
  presenter: "Người dẫn",
  packaging: "Bao bì",
  insert: "Insert shot",
};

export const RIGHTS: Record<string, { label: string; tone: Tone }> = {
  own_footage: { label: "Tự quay · Có quyền", tone: "teal" },
  licensed: { label: "Có giấy phép", tone: "teal" },
  needs_check: { label: "Cần duyệt", tone: "orange" },
  unknown: { label: "Chưa rõ quyền", tone: "red" },
};

export function ms(msVal?: number | null): string {
  if (msVal === undefined || msVal === null || isNaN(msVal)) return "--:--";
  const s = Math.round(msVal / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function msPrecise(msVal: number): string {
  const s = msVal / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

export function bytes(n?: number | null): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i >= 2 ? 1 : 0).replace(".", ",")} ${u[i]}`;
}

export function num(n?: number | null): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("vi-VN");
}

export function pct(n?: number | null, digits = 0): string {
  if (n === undefined || n === null) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function dt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Hôm nay, ${hm}`;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Hôm qua, ${hm}`;
  return d.toLocaleDateString("vi-VN") + " " + hm;
}

export function duration(sec?: number | null): string {
  if (sec === undefined || sec === null) return "—";
  if (sec < 60) return `${Math.round(sec)} giây`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} phút ${Math.round(sec % 60)} giây`;
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

export const fileName = (p?: string | null) => (p ? p.split(/[\\/]/).pop() || p : "");
