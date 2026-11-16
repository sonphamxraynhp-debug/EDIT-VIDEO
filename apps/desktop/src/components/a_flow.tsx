/** Thành phần dùng chung cho các màn hình Nguồn video / Phân tích (nhóm A). */
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { API, ApiError } from "../lib/api";

export const FLOW_STEPS: Array<{ n: string; label: string; to: string }> = [
  { n: "01", label: "Nguồn video", to: "/media" },
  { n: "02", label: "Product Brain", to: "/brain" },
  { n: "03", label: "Chiến lược", to: "/creative/strategy" },
  { n: "04", label: "Sản xuất", to: "/production/batch" },
  { n: "05", label: "Kiểm duyệt", to: "/review/qc" },
  { n: "06", label: "Xuất bản", to: "/library" },
];

export function FlowStepper({ active, done }: { active: number; done: boolean[] }) {
  const nav = useNavigate();
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="stepper">
        {FLOW_STEPS.map((s, i) => (
          <div key={s.n} className={`step ${i === active ? "on" : done[i] ? "done" : ""}`} onClick={() => nav(s.to)} title={`Đi tới ${s.label}`}>
            <span className="n">{s.n}</span>
            <span className="ellipsis">{s.label}</span>
            {i < FLOW_STEPS.length - 1 && <ChevronRight size={14} className="muted" style={{ marginLeft: "auto" }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Upload multipart có tiến độ (fetch không báo tiến độ upload). Lỗi trả về ApiError có code + hint. */
export function uploadWithProgress<T = any>(path: string, form: FormData, onProgress: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API + path);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () =>
      reject(new ApiError({ code: "BACKEND_OFFLINE", message: "Không kết nối được dịch vụ local", hint: "Chạy scripts/dev.sh hoặc khởi động lại ứng dụng." }, 0));
    xhr.onload = () => {
      let j: any = null;
      try {
        j = JSON.parse(xhr.responseText);
      } catch {
        /* không phải JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(j as T);
      const body = j?.error || (j?.detail ? { code: "VALIDATION", message: "Dữ liệu không hợp lệ", details: { detail: j.detail } } : { code: `HTTP_${xhr.status}`, message: xhr.statusText || "Lỗi tải lên" });
      reject(new ApiError(body, xhr.status));
    };
    xhr.send(form);
  });
}

/** Đường dẫn video phát được: proxy (nếu có) → kết quả job proxy → file gốc. */
export function playablePath(asset: any): string | undefined {
  if (!asset) return undefined;
  const m = asset.meta_json || {};
  if (m.proxy) return m.proxy;
  const pj = (asset.jobs || []).find((j: any) => j.kind === "proxy" && j.profile_json?.result?.proxy);
  return pj?.profile_json?.result?.proxy || asset.uri;
}

export const ACTIVE_JOB = ["PENDING", "PREPARING", "RENDERING", "VERIFYING", "RETRY_WAIT"];
