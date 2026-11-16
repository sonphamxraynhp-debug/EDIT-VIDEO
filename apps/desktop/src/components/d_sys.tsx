/** Tiện ích dùng chung cho các màn hình hệ thống (Phần cứng / Mô hình / Cài đặt). */
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { api, useApi } from "../lib/api";
import { useApp } from "../lib/store";

/** Giá trị mặc định — sao chép từ DEFAULT_SETTINGS trong services/api/avf/main.py. */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  language: "vi",
  theme: "dark",
  autosave: true,
  autosave_minutes: 5,
  performance_mode: "balanced",
  parallel_jobs: 2,
  gpu_accel: true,
  offline_mode: true,
  telemetry: false,
  loudness_lufs: -14,
  export_preset: "1080x1920_h264",
  voice_default: { provider: "os_say", voice: "Linh", rate: 1.0, lufs: -16 },
  qc_checks: { similarity: true, evidence: true, audio_subtitle: true, rights: true },
  pause_temp_c: 85,
  prevent_sleep: true,
  checkpoint_minutes: 5,
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Bản nháp cài đặt: đọc GET /settings, chỉ gửi các khoá đã đổi qua PUT /settings. */
export function useSettingsDraft() {
  const q = useApi<Record<string, any>>("/settings");
  const { toast, toastError } = useApp();
  const [draft, setDraft] = useState<Record<string, any>>({});
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);
  const changed = useMemo(() => {
    if (!q.data) return {} as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (k === "paths") continue;
      if (!same(v, q.data[k])) out[k] = v;
    }
    return out;
  }, [draft, q.data]);
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  async function save(extra?: Record<string, unknown>) {
    const body = { ...changed, ...(extra || {}) };
    delete (body as any).paths;
    if (!Object.keys(body).length) {
      toast({ kind: "warn", title: "Không có thay đổi để lưu" });
      return;
    }
    try {
      const r = await api.put<Record<string, any>>("/settings", body);
      q.setData(r);
      toast({ kind: "success", title: `Đã lưu ${Object.keys(body).length} cài đặt` });
      return true;
    } catch (e) {
      toastError(e, "Lưu cài đặt thất bại");
    }
  }
  return { q, draft, set, changed, dirty: Object.keys(changed).length > 0, save, reset: () => q.data && setDraft(q.data) };
}

export function Stepper({ value, onChange, min, max, step = 1, suffix }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: ReactNode }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <button className="btn sm icon" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label="Giảm">
        <Minus size={14} />
      </button>
      <div className="inner center bold" style={{ padding: "4px 10px", minWidth: 52 }}>{value}</div>
      <button className="btn sm icon" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label="Tăng">
        <Plus size={14} />
      </button>
      {suffix && <span className="small muted">{suffix}</span>}
    </div>
  );
}

export function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const NA_MAC = "N/A (macOS không cung cấp)";
