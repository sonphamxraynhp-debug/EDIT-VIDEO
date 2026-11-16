/** Tiện ích dùng chung cho màn Kiểm định nội dung (AVF_18) và Duyệt hàng loạt (AVF_19). */
import { ReactNode, useState } from "react";
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Tone } from "../lib/format";
import { useApp } from "../lib/store";
import { Badge, Btn, Field, Modal } from "./ui";

export type Decision = "accept" | "revise" | "reject" | "waive";

export const DECISION_LABEL: Record<Decision, string> = {
  accept: "Phê duyệt",
  revise: "Gửi chỉnh sửa",
  reject: "Từ chối",
  waive: "Miễn trừ (waive)",
};

/** Mã lỗi chặn duyệt từ backend → giải thích tiếng Việt rõ ràng. */
export const BLOCK_EXPLAIN: Record<string, string> = {
  "BLOCK-01": "Kịch bản có claim nghiêm trọng (chưa duyệt / bị cấm / cụm từ rủi ro). Sửa kịch bản ở AI Sáng tạo rồi render preview lại.",
  "BLOCK-02": "Có tư liệu chưa rõ quyền sử dụng. Cập nhật quyền ở màn Tư liệu rồi chạy lại QC.",
  "BLOCK-04": "Điểm nguyên bản quá thấp (video quá giống bản gần nhất) – không thể miễn trừ. Hãy đổi hook / cảnh / giọng đọc rồi chạy lại QC.",
  "BLOCK-05": "Vi phạm chính sách quảng cáo Meta/TikTok – không thể miễn trừ. Sửa nội dung theo các cờ chính sách rồi chạy lại QC.",
  QC_CRITICAL: "QC còn lỗi nghiêm trọng (kỹ thuật / footage). Sửa lỗi hoặc dùng 'Miễn trừ' kèm lý do.",
  QC_MISSING: "Chưa có báo cáo QC – cần render preview và chạy QC trước.",
  REASON_REQUIRED: "Miễn trừ bắt buộc ghi lý do.",
  INVALID_TRANSITION: "Trạng thái hiện tại của biến thể không cho phép quyết định này.",
  FORBIDDEN: "Chỉ Reviewer/Owner được duyệt QC.",
};

export const APPROVED_PLUS = ["APPROVED", "RENDERING", "COMPLETED"];

export function qcChecks(v: any): any {
  return v?.qc?.checks_json || null;
}

export function thumbOf(v: any): string | null {
  return v?.export?.manifest_json?.thumbnail || qcChecks(v)?.preview?.thumbnail || null;
}

export function videoOf(v: any): { src: string | null; kind: "final" | "preview" | null } {
  const f = v?.export?.output_uri;
  if (f) return { src: f, kind: "final" };
  const p = qcChecks(v)?.preview?.video;
  if (p) return { src: p, kind: "preview" };
  return { src: null, kind: null };
}

/** Thời lượng thật (ms) nếu có bản final; nếu không thì ước tính từ kịch bản. */
export function durationOf(v: any): { ms: number | null; estimated: boolean } {
  const m = v?.export?.manifest_json?.duration_ms;
  if (m) return { ms: m, estimated: false };
  const e = v?.script?.est_seconds;
  if (e) return { ms: e * 1000, estimated: true };
  return { ms: null, estimated: true };
}

export const ST_TONE: Record<string, Tone> = { pass: "teal", warn: "orange", fail: "red" };
export const ST_LABEL: Record<string, string> = { pass: "Đạt", warn: "Cần xem", fail: "Không đạt" };

export function StatusIcon({ s, size = 14 }: { s?: string; size?: number }) {
  if (s === "pass") return <CheckCircle2 size={size} className="c-teal" />;
  if (s === "warn") return <AlertTriangle size={size} className="c-orange" />;
  if (s === "fail") return <XCircle size={size} className="c-red" />;
  return <MinusCircle size={size} className="muted" />;
}

export function StatusBadge({ s, label }: { s?: string | null; label?: ReactNode }) {
  if (!s) return <span className="xs muted">N/A</span>;
  return <Badge tone={ST_TONE[s] || "gray"} icon={<StatusIcon s={s} size={11} />}>{label ?? ST_LABEL[s] ?? s}</Badge>;
}

/** Ô % có màu theo ngưỡng (giống AVF_18): thấp = tốt. */
export function PctCell({ v, warn = 0.6, bad = 0.75 }: { v?: number | null; warn?: number; bad?: number }) {
  if (v === undefined || v === null) return <span className="xs muted">N/A</span>;
  const tone: Tone = v >= bad ? "red" : v >= warn ? "orange" : "teal";
  return <Badge tone={tone}>{Math.round(v * 100)}%</Badge>;
}

export function audioStatus(c: any): string | null {
  const a = c?.technical?.audio;
  if (!a) return null;
  if (!a.has_audio || a.clipping) return "fail";
  if (a.silent) return "warn";
  return "pass";
}

export function subtitleStatus(c: any): string | null {
  const t = c?.technical;
  if (!t) return null;
  return t.caption_overflow ? "warn" : "pass";
}

/** Danh sách cảnh báo QC đọc được từ checks_json. */
export function qcWarnings(c: any): Array<{ s: string; text: string }> {
  if (!c) return [];
  const out: Array<{ s: string; text: string }> = [];
  for (const f of c.claim?.flags || []) out.push({ s: f.severity === "critical" ? "fail" : "warn", text: `[${f.code}] Beat ${f.beat + 1}: ${f.message}` });
  if (c.script_similarity?.status === "warn") out.push({ s: "warn", text: `Kịch bản giống biến thể gần nhất ${Math.round((c.script_similarity.value || 0) * 100)}% (ngưỡng 60%)` });
  if (c.visual_reuse?.status === "warn")
    out.push({ s: "warn", text: `Tái sử dụng cảnh ${Math.round((c.visual_reuse.value || 0) * 100)}%${c.visual_reuse.same_order ? " – cùng thứ tự cảnh với biến thể khác" : ""}` });
  for (const g of c.footage?.gaps || []) out.push({ s: g.code === "BLOCK-03" ? "fail" : "warn", text: `[${g.code}] ${g.message || g.need || "Thiếu footage"}` });
  for (const a of c.rights?.assets || []) out.push({ s: "fail", text: `Tư liệu chưa rõ quyền: ${a.file_name}` });
  const t = c.technical;
  if (t) {
    if (t.black_frames?.length) out.push({ s: "fail", text: `${t.black_frames.length} đoạn khung hình đen` });
    if (t.frozen_frames?.length) out.push({ s: "warn", text: `${t.frozen_frames.length} đoạn hình đứng (frozen) tại ${t.frozen_frames.map((f: any) => `${(+f.start).toFixed(1)}s`).join(", ")}` });
    if (t.audio && !t.audio.has_audio) out.push({ s: "fail", text: "Video không có âm thanh" });
    if (t.audio?.clipping) out.push({ s: "fail", text: `Âm thanh bị clipping (peak ${t.audio.peak_db} dB)` });
    if (t.audio?.silent) out.push({ s: "warn", text: "Âm thanh quá nhỏ / im lặng" });
    if (t.caption_overflow) out.push({ s: "warn", text: `${t.caption_overflow} phụ đề tràn khung` });
  } else out.push({ s: "warn", text: "Chưa có QC kỹ thuật (chưa render preview)" });
  for (const f of c.policy?.flags || []) out.push({ s: f.severity === "critical" || f.severity === "fail" ? "fail" : "warn", text: `[${f.code}] Beat ${(f.beat ?? 0) + 1}: ${f.message}` });
  if (c.originality && c.originality.status !== "pass")
    out.push({ s: c.originality.status === "fail" ? "fail" : "warn", text: `Điểm nguyên bản ${Math.round((c.originality.score || 0) * 100)}% (tối thiểu ${Math.round((c.originality.min || 0) * 100)}%)` });
  if (c.safe_zone?.status && c.safe_zone.status !== "pass") out.push({ s: c.safe_zone.status, text: c.safe_zone.message || "Chữ nằm trong vùng UI của TikTok" });
  if (c.music_license?.status && c.music_license.status !== "pass") out.push({ s: c.music_license.status, text: c.music_license.message || "Nhạc chưa rõ bản quyền" });
  if (c.disclosure?.message) out.push({ s: c.disclosure.status || "warn", text: c.disclosure.message });
  return out;
}

/** Gọi quyết định duyệt cho 1 biến thể; lỗi chặn (BLOCK-01/02, QC_CRITICAL) được giải thích rõ. */
export function useDecide(onDone: () => void) {
  const { toast } = useApp();
  const [lastError, setLastError] = useState<ApiError | null>(null);
  async function decide(vid: string, decision: Decision, reason?: string) {
    setLastError(null);
    try {
      await api.post(`/variants/${vid}/approval`, { decision, reason: reason || null });
      toast({ kind: "success", title: `${DECISION_LABEL[decision]}: thành công` });
      onDone();
      return true;
    } catch (e) {
      const err = e as ApiError;
      setLastError(err);
      const code = err?.body?.code;
      toast({ kind: "error", title: err?.body?.message || "Không thực hiện được", code, hint: BLOCK_EXPLAIN[code] || err?.body?.hint });
      onDone();
      return undefined;
    }
  }
  async function bulk(ids: string[], decision: Decision, reason?: string) {
    try {
      const r = await api.post<{ ok: string[]; errors: any[] }>("/variants/bulk-approval", { variant_ids: ids, decision, reason: reason || null });
      if (r.errors.length)
        toast({
          kind: r.ok.length ? "warn" : "error",
          title: `${DECISION_LABEL[decision]}: ${r.ok.length}/${ids.length} thành công`,
          body: r.errors.slice(0, 3).map((x) => `${x.code}: ${x.message}`).join(" · "),
          hint: BLOCK_EXPLAIN[r.errors[0]?.code],
        });
      else toast({ kind: "success", title: `${DECISION_LABEL[decision]}: ${r.ok.length} biến thể` });
      onDone();
      return r;
    } catch (e) {
      const err = e as ApiError;
      toast({ kind: "error", title: err?.body?.message || "Lỗi duyệt hàng loạt", code: err?.body?.code, hint: err?.body?.hint });
      return undefined;
    }
  }
  return { decide, bulk, lastError, clearError: () => setLastError(null) };
}

/** Modal nhập lý do (bắt buộc cho waive, tuỳ chọn cho revise/reject). */
export function ReasonModal({ open, decision, count, onClose, onSubmit }: {
  open: boolean;
  decision: Decision | null;
  count: number;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const required = decision === "waive";
  if (!decision) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${DECISION_LABEL[decision]} – ${count} biến thể`}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Huỷ</button>
          <Btn
            kind={decision === "reject" ? "danger" : decision === "revise" ? "orange" : "primary"}
            disabled={required && !reason.trim()}
            title={required && !reason.trim() ? "Miễn trừ bắt buộc ghi lý do" : undefined}
            onClick={async () => {
              const r = await onSubmit(reason.trim());
              setReason("");
              onClose();
              return r;
            }}
          >
            Xác nhận
          </Btn>
        </>
      }
    >
      {decision === "waive" && (
        <div className="warn-box small mb12">
          Miễn trừ cho phép duyệt khi QC còn lỗi nghiêm trọng về kỹ thuật/footage. Lỗi claim (BLOCK-01) và quyền tư liệu (BLOCK-02) vẫn bị chặn. Lý do được lưu vào nhật ký duyệt.
        </div>
      )}
      {decision === "reject" && <div className="small t2 mb12">Biến thể sẽ chuyển sang “Bị từ chối”. Có thể mở lại sau (chuyển về Nháp/Cần chỉnh sửa).</div>}
      <Field label={required ? "Lý do (bắt buộc)" : "Lý do / ghi chú (tuỳ chọn)"}>
        <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Hook trùng với VAR-0002, cần đổi mở đầu…" autoFocus />
      </Field>
    </Modal>
  );
}

export function downloadText(name: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Báo cáo QC phẳng để xuất CSV/JSON. */
export function qcReportRows(items: any[]) {
  return items.map((v) => {
    const c = qcChecks(v) || {};
    return {
      code: v.code,
      status: v.status,
      angle: v.angle_label,
      audience: v.audience_label,
      title: v.script?.title || "",
      severity: v.qc?.severity || "",
      decision: v.qc?.decision || "",
      script_similarity: c.script_similarity?.value ?? "",
      visual_reuse: c.visual_reuse?.value ?? "",
      same_scene_order: c.visual_reuse?.same_order ?? "",
      claim: c.claim?.status || "",
      claim_flags: (c.claim?.flags || []).map((f: any) => `${f.code}:${f.message}`).join(" | "),
      footage: c.footage?.status || "",
      rights: c.rights?.status || "",
      audio: audioStatus(c) || "",
      subtitle: subtitleStatus(c) || "",
      technical: c.technical?.status || "",
      disclosure: c.disclosure?.message || "",
    };
  });
}

export function exportQcReport(items: any[], format: "csv" | "json") {
  const rows = qcReportRows(items);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  if (format === "json") {
    downloadText(`qc_report_${stamp}.json`, JSON.stringify({ generated_at: new Date().toISOString(), note: "Đánh giá nội bộ – không bảo đảm phê duyệt trên nền tảng", rows }, null, 2), "application/json");
  } else {
    const keys = Object.keys(rows[0] || { code: "" });
    const csv = "﻿" + [keys.join(","), ...rows.map((r: any) => keys.map((k) => csvCell(r[k])).join(","))].join("\n");
    downloadText(`qc_report_${stamp}.csv`, csv, "text/csv");
  }
}

/** Kết quả so sánh A/B từ GET /variants/compare. */
export function CompareResult({ r }: { r: any }) {
  const row = (label: string, ok: boolean, value: ReactNode, note?: string) => (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <StatusIcon s={ok ? "pass" : "warn"} />
      <div className="grow">
        <div className="small semi">{label}: {value}</div>
        {note && <div className="xs muted">{note}</div>}
      </div>
    </div>
  );
  return (
    <div className="col" style={{ gap: 10 }}>
      {row("Độ tương đồng kịch bản", r.script_similarity < 0.6, `${Math.round(r.script_similarity * 100)}%`, "So sánh văn bản toàn kịch bản (TF cosine)")}
      {row("Độ tương đồng hook", r.hook_similarity < 0.6, `${Math.round(r.hook_similarity * 100)}%`)}
      {row("Cùng cấu trúc nội dung", !r.same_structure, r.same_structure ? "Có (cùng chuỗi beat)" : "Không")}
      {row("Trùng cảnh quay", r.scene_overlap <= 0.7, `${Math.round(r.scene_overlap * 100)}%`, "Tỷ lệ cảnh dùng chung (Jaccard)")}
      {row("Cùng góc nội dung", !r.same_angle, r.same_angle ? "Có" : "Không")}
    </div>
  );
}

/** Nhận định chỉ dựa trên số đo so sánh — không suy đoán. */
export function compareVerdict(r: any): { tone: Tone; text: string } {
  const issues: string[] = [];
  if (r.script_similarity >= 0.6) issues.push("kịch bản giống nhau cao");
  if (r.hook_similarity >= 0.6) issues.push("hook giống nhau");
  if (r.same_structure) issues.push("cùng cấu trúc beat");
  if (r.scene_overlap > 0.7) issues.push("dùng chung phần lớn cảnh quay");
  if (r.same_angle) issues.push("cùng góc nội dung");
  if (!issues.length) return { tone: "teal", text: "Hai biến thể khác biệt rõ về kịch bản, hook, cấu trúc và cảnh quay theo các ngưỡng nội bộ." };
  return { tone: issues.length >= 3 ? "red" : "orange", text: `Hai biến thể có ${issues.join(", ")}. Cân nhắc đổi góc nội dung, hook hoặc chọn cảnh quay khác để tăng tính khác biệt.` };
}
