import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Clapperboard, Clock, Cpu, Database, FileDown, Film,
  FolderOpen, Gauge, HardDrive, Hourglass, Leaf, MemoryStick, Layers, MonitorCog, Pause, Play, RotateCcw, Scale, Search,
  Settings2, Thermometer, Users, X, XCircle, Zap,
} from "lucide-react";
import { api, useApi, useQueueEvents } from "../lib/api";
import { JOB_KIND, JOB_STATUS, duration as fmtDuration } from "../lib/format";
import { useApp } from "../lib/store";
import { Badge, Bar, Btn, Card, Empty, ErrorBox, InfoNote, JobStatus, Loading, PageHead, Select, Thumb, Toggle } from "../components/ui";
import { Sparkline, VBars } from "../components/charts";

const ACTIVE = ["PENDING", "PREPARING", "RENDERING", "VERIFYING", "RETRY_WAIT"];
const RUNNING = ["PREPARING", "RENDERING", "VERIFYING"];

const MODES = [
  { id: "eco", label: "Eco", sub: "Tiết kiệm tài nguyên (1 job, chậm hơn, mát máy)", icon: <Leaf size={16} className="c-teal" /> },
  { id: "balanced", label: "Balanced", sub: "Cân bằng (đề xuất, chạy theo số job song song)", icon: <Scale size={16} className="c-primary" /> },
  { id: "turbo", label: "Turbo", sub: "Tối đa hiệu suất (≥ ½ số nhân CPU, tốn tài nguyên)", icon: <Zap size={16} className="c-orange" /> },
];

const BATCH_STATUSES = ["PENDING", "RENDERING", "PAUSED", "COMPLETED", "FAILED", "CANCELLED", "RETRY_WAIT"];
const BATCH_ACTIVE = ["PENDING", "PREPARING", "RENDERING", "VERIFYING", "RETRY_WAIT"];

const NOT_ENFORCED = "Đã lưu vào cấu hình nhưng worker hiện chưa áp dụng tham số này";

function mmss(sec: number | null): string {
  if (sec === null || isNaN(sec) || sec < 0) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function elapsed(j: any, now: number): number | null {
  if (!j.started_at) return null;
  const st = new Date(j.started_at).getTime();
  const end = RUNNING.includes(j.status) ? now : j.finished_at ? new Date(j.finished_at).getTime() : new Date(j.updated_at).getTime();
  return (end - st) / 1000;
}

/** Ô KPI phần cứng nhỏ gọn (dải trên cùng AVF_17). */
function HwTile({ icon, label, value, sub, spark, color, na }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; spark?: number[]; color?: string; na?: string }) {
  return (
    <div className="card" style={{ padding: 12 }} title={na}>
      <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        <div className="kpi-icon" style={{ width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", background: "var(--primary-soft)", color: color || "var(--primary-2)", flexShrink: 0 }}>{icon}</div>
        <div className="grow">
          <div className="xs muted">{label}</div>
          <div className="bold" style={{ fontSize: 17, lineHeight: 1.2 }}>{value}</div>
          {sub && <div className="xs t2 ellipsis">{sub}</div>}
        </div>
      </div>
      {spark && spark.length > 1 && <div className="mt8"><Sparkline values={spark} color={color || "#8b6cff"} height={22} /></div>}
    </div>
  );
}

export default function RenderQueue() {
  const nav = useNavigate();
  const { hw, project, campaign, toast, toastError } = useApp();
  const settings = useApi<any>("/settings");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [batchPoll, setBatchPoll] = useState<number | undefined>(undefined);
  const batches = useApi<any[]>(campaign ? "/render/batches" : null, campaign ? { campaign_id: campaign.id } : undefined, batchPoll);
  useEffect(() => {
    const act = (batches.data || []).some((b: any) => BATCH_ACTIVE.some((k) => (b.jobs?.[k] || 0) > 0));
    setBatchPoll(act ? 5000 : undefined);
  }, [batches.data]);
  const jobs = useApi<any>("/render/jobs", { status, kind, q: qDebounced, page, size }, 10000);
  const [now, setNow] = useState(Date.now());
  const [hist, setHist] = useState<{ cpu: number[]; ram: number[]; disk: number[] }>({ cpu: [], ram: [], disk: [] });
  const lastStats = useRef<string>("");
  const lastReload = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setQDebounced(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const live = hw?.live;
  const st = hw?.static;
  useEffect(() => {
    if (!live) return;
    setHist((h) => ({
      cpu: [...h.cpu, live.cpu_pct ?? 0].slice(-30),
      ram: [...h.ram, live.ram_pct ?? 0].slice(-30),
      disk: [...h.disk, (live.disk_read_mbs ?? 0) + (live.disk_write_mbs ?? 0)].slice(-30),
    }));
  }, [live?.ts]); // eslint-disable-line react-hooks/exhaustive-deps

  // SSE: cập nhật tiến độ ngay trên bảng; khi số lượng theo trạng thái đổi thì tải lại trang hiện tại
  useQueueEvents((e) => {
    const map = new Map(e.jobs.map((j: any) => [j.id, j]));
    jobs.setData((d: any) => {
      if (!d) return d;
      let changed = false;
      const items = d.items.map((it: any) => {
        const u: any = map.get(it.id);
        if (u && (u.status !== it.status || u.progress !== it.progress || u.error_code !== it.error_code)) {
          changed = true;
          return { ...it, status: u.status, progress: u.progress, error_code: u.error_code };
        }
        return it;
      });
      return changed ? { ...d, items, stats: { ...d.stats, by_status: e.stats } } : d;
    });
    const key = JSON.stringify(e.stats);
    if (key !== lastStats.current) {
      const first = lastStats.current === "";
      lastStats.current = key;
      if (!first && Date.now() - lastReload.current > 1500) {
        lastReload.current = Date.now();
        jobs.reload();
      }
    }
  });

  const s = settings.data;
  async function saveSetting(patch: Record<string, unknown>) {
    try {
      const r = await api.put("/settings", patch);
      settings.setData(r);
      return true;
    } catch (e) {
      toastError(e, "Không lưu được cấu hình render");
      return undefined;
    }
  }

  async function jobAction(j: any, action: string) {
    try {
      await api.post(`/render/jobs/${j.id}/actions`, { action });
      toast({ kind: "success", title: `${{ pause: "Đã tạm dừng", resume: "Đã tiếp tục", retry: "Đã đưa vào thử lại", cancel: "Đã huỷ" }[action]} ${j.code || j.id.slice(0, 8)}` });
      jobs.reload();
      return true;
    } catch (e) {
      toastError(e);
      return undefined;
    }
  }

  async function batchAction(b: any, action: string) {
    try {
      const r = await api.post<{ changed: number }>(`/render/batches/${b.id}/actions`, { action });
      const lbl = { pause: "Đã tạm dừng", resume: "Đã tiếp tục", retry: "Đã đưa vào thử lại", cancel: "Đã huỷ" }[action];
      toast({ kind: r.changed ? "success" : "warn", title: `${lbl} lô “${b.name || b.id.slice(0, 8)}”: ${r.changed} tác vụ` });
      batches.reload();
      jobs.reload();
      return true;
    } catch (e) {
      toastError(e);
      return undefined;
    }
  }

  async function queueAction(action: string, label: string) {
    try {
      const r = await api.post<{ affected: number }>("/render/actions", { action });
      toast({ kind: r.affected ? "success" : "warn", title: `${label}: ${r.affected} tác vụ` });
      jobs.reload();
      return true;
    } catch (e) {
      toastError(e);
      return undefined;
    }
  }

  async function openFolder(path?: string) {
    try {
      await api.post("/system/open-folder", { path: path || s?.paths?.output });
      return true;
    } catch (e) {
      toastError(e, "Không mở được thư mục");
      return undefined;
    }
  }

  async function exportLog() {
    try {
      const r = await api.get<{ lines: string[] }>("/system/logs", { name: "worker", lines: 5000 });
      const blob = new Blob([(r.lines || []).join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `avf-worker-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (!r.lines?.length) toast({ kind: "warn", title: "Nhật ký worker đang trống" });
      return true;
    } catch (e) {
      toastError(e, "Không xuất được nhật ký");
      return undefined;
    }
  }

  const stats = jobs.data?.stats;
  const by: Record<string, number> = stats?.by_status || {};
  const running = RUNNING.reduce((a, k) => a + (by[k] || 0), 0);
  const waiting = (by.PENDING || 0) + (by.RETRY_WAIT || 0);
  const failed = by.FAILED || 0;
  const paused = by.PAUSED || 0;
  const mode = s?.performance_mode || "balanced";
  const parallel = Number(s?.parallel_jobs || 2);
  const cores = st?.cores_logical || 4;
  const maxParallel = Math.max(2, Math.min(16, cores));
  const workerLimit = mode === "eco" ? 1 : mode === "turbo" ? Math.max(parallel, Math.floor(cores / 2) || 2) : parallel;
  const total = jobs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));

  const hourly = useMemo(() => {
    const out: Array<{ label: string; value: number }> = [];
    const m = new Map<string, number>((stats?.hourly || []).map((x: any) => [x.h, x.n]));
    for (let i = 7; i >= 0; i--) {
      const d = new Date(Date.now() - i * 3600e3);
      const hUtc = String(d.getUTCHours()).padStart(2, "0");
      out.push({ label: `${String(d.getHours()).padStart(2, "0")}h`, value: m.get(hUtc) || 0 });
    }
    return out;
  }, [stats?.hourly]);

  const encoders: string[] = st?.hw_encoders || [];
  const hwEnc = encoders.find((e) => e.startsWith("h264")) || encoders[0];

  return (
    <>
      <PageHead
        title="Local Render Queue"
        icon={<Clapperboard size={22} />}
        sub="Hàng đợi dựng video trên máy (CPU / GPU local) — tiến độ cập nhật trực tiếp"
        actions={
          <div className="inner row small" style={{ padding: "8px 12px" }}>
            <span className="muted">Dự án:</span> <b>{project?.name || "—"}</b>
            <span className="muted" style={{ marginLeft: 10 }}>Chiến dịch:</span> <b>{campaign?.name || "—"}</b>
          </div>
        }
      />

      {/* Dải phần cứng */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <HwTile icon={<Cpu size={17} />} label="CPU" value={live ? `${Math.round(live.cpu_pct)}%` : "…"} sub={st?.cpu} spark={hist.cpu} color="#19d3b5" />
        <HwTile icon={<MonitorCog size={17} />} label="GPU" value="N/A" sub={st?.gpu || "—"} na="Hệ điều hành không cung cấp % GPU cho tiến trình này — không hiển thị số ước đoán" />
        <HwTile icon={<MemoryStick size={17} />} label="RAM" value={live ? `${live.ram_used_gb} / ${live.ram_total_gb} GB` : "…"} sub={live ? `${Math.round(live.ram_pct)}%` : undefined} spark={hist.ram} color="#4fc3ff" />
        <HwTile icon={<Database size={17} />} label="VRAM" value="N/A" sub={st?.unified_memory ? "Bộ nhớ hợp nhất (dùng chung RAM)" : "Không đo được"} na="Không có số liệu VRAM trên máy này" />
        <HwTile icon={<HardDrive size={17} />} label="Ổ đĩa dữ liệu" value={live ? `${live.disk_free_gb} GB trống` : "…"} sub={live ? `/ ${live.disk_total_gb} GB · I/O ${Math.round((live.disk_read_mbs || 0) + (live.disk_write_mbs || 0))} MB/s` : undefined} spark={hist.disk} color="#a074ff" />
        <HwTile icon={<Film size={17} />} label="Bộ mã hoá" value={hwEnc ? hwEnc.replace("_", " ") : "libx264"} sub={encoders.length ? `${encoders.length} encoder phần cứng${st?.sw_encoder ? " + libx264" : ""}` : "Chỉ CPU (libx264)"} />
        <HwTile icon={<Thermometer size={17} />} label="Nhiệt độ" value={live?.temp_c != null ? `${live.temp_c}°C` : "N/A"} sub={live?.temp_c != null ? "Cảm biến cao nhất" : "Không đọc được cảm biến"} />
        <HwTile icon={<Users size={17} />} label="Workers" value={`${running} / ${workerLimit}`} sub={<span className="row" style={{ gap: 5 }}><span className="dot" style={{ color: running ? "var(--teal)" : "var(--muted)" }} />{running ? "Đang hoạt động" : "Đang chờ việc"}</span>} />
      </div>

      <div className="grid mt16" style={{ gridTemplateColumns: "270px minmax(0, 1fr) 290px", alignItems: "start" }}>
        {/* Cấu hình render */}
        <Card title="Cấu hình render" icon={<Settings2 size={16} className="c-primary" />}>
          {!s && !settings.error && <Loading rows={6} />}
          {settings.error && <ErrorBox error={settings.error} onRetry={settings.reload} />}
          {s && (
            <div className="col" style={{ gap: 14 }}>
              <div>
                <div className="label mb8">Chế độ hiệu năng</div>
                <div className="col" style={{ gap: 6 }}>
                  {MODES.map((m) => (
                    <div key={m.id} className={`list-item ${mode === m.id ? "on" : ""}`} style={{ padding: 8 }} onClick={() => mode !== m.id && saveSetting({ performance_mode: m.id })}>
                      <input type="radio" className="check" readOnly checked={mode === m.id} />
                      {m.icon}
                      <div><div className="semi small">{m.label}</div><div className="xs muted">{m.sub}</div></div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="label mb8">Số job chạy song song</div>
                <div className="row">
                  <button className="btn sm icon" disabled={parallel <= 1} onClick={() => saveSetting({ parallel_jobs: parallel - 1 })} aria-label="Giảm">−</button>
                  <b style={{ minWidth: 28, textAlign: "center", fontSize: 16 }}>{parallel}</b>
                  <button className="btn sm icon" disabled={parallel >= maxParallel} onClick={() => saveSetting({ parallel_jobs: parallel + 1 })} aria-label="Tăng">+</button>
                  <span className="xs muted">(tối đa theo máy: {maxParallel})</span>
                </div>
                {mode !== "balanced" && <div className="xs muted mt8">Chế độ {mode === "eco" ? "Eco luôn chạy 1 job" : `Turbo chạy ${workerLimit} job`}; giá trị này dùng cho Balanced.</div>}
              </div>
              <div>
                <div className="label mb8">Preset mã hoá (render final)</div>
                <Select
                  value={s.gpu_accel === false ? "cpu" : "gpu"}
                  onChange={(v) => saveSetting({ gpu_accel: v === "gpu" })}
                  options={[
                    ...(hwEnc ? [{ value: "gpu", label: `H.264 – ${hwEnc} (GPU)` }] : [{ value: "gpu", label: "GPU (không có – tự dùng CPU)" }]),
                    { value: "cpu", label: "H.264 – libx264 CRF 20 (CPU)" },
                  ]}
                />
                <div className="xs muted mt8">Áp dụng cho lô tạo ở Trung tâm sản xuất; lỗi GPU tự chuyển sang CPU. Preview luôn dùng libx264.</div>
              </div>
              <div title={NOT_ENFORCED}>
                <div className="label mb8">Ngưỡng tự động tạm dừng</div>
                <Select value={String(s.pause_temp_c ?? 85)} onChange={(v) => saveSetting({ pause_temp_c: Number(v) })} options={[75, 80, 85, 90].map((t) => ({ value: String(t), label: `≥ ${t}°C` }))} />
                <div className="xs c-orange mt8">{live?.temp_c == null ? "Máy không cung cấp nhiệt độ — " : ""}worker chưa áp dụng ngưỡng này.</div>
              </div>
              <div className="row between" title={NOT_ENFORCED}>
                <span className="small">Ngăn máy ngủ khi đang render <span className="xs c-orange">(chưa áp dụng)</span></span>
                <Toggle purple on={!!s.prevent_sleep} onChange={(v) => saveSetting({ prevent_sleep: v })} />
              </div>
              <div title={NOT_ENFORCED}>
                <div className="label mb8">Lưu checkpoint (khôi phục)</div>
                <Select value={String(s.checkpoint_minutes ?? 5)} onChange={(v) => saveSetting({ checkpoint_minutes: Number(v) })} options={[1, 5, 10, 15].map((m) => ({ value: String(m), label: `Mỗi ${m} phút` }))} />
                <div className="xs muted mt8">Hàng đợi lưu trong SQLite; job dở dang tự thử lại khi worker khởi động lại.</div>
              </div>
              <div className="row small c-teal"><CheckCircle2 size={15} /> Cấu hình đã lưu</div>
            </div>
          )}
        </Card>

        {/* Bảng job */}
        <Card
          title={`Hàng đợi render (${total} tác vụ)`}
          icon={<Clapperboard size={16} className="c-primary" />}
          right={
            <>
              <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} style={{ width: 160, height: 32 }} options={[{ value: "", label: "Tất cả trạng thái" }, ...Object.entries(JOB_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} />
              <Select value={kind} onChange={(v) => { setKind(v); setPage(1); }} style={{ width: 150, height: 32 }} options={[{ value: "", label: "Mọi loại job" }, ...Object.entries(JOB_KIND).map(([k, v]) => ({ value: k, label: v }))]} />
              <div className="search" style={{ margin: 0, height: 32, maxWidth: 220 }}>
                <Search size={14} />
                <input placeholder="Tìm Job ID, Variant…" value={q} onChange={(e) => setQ(e.target.value)} />
                {q && <X size={13} style={{ cursor: "pointer" }} onClick={() => setQ("")} />}
              </div>
            </>
          }
        >
          {jobs.loading && !jobs.data && <Loading rows={6} h={28} />}
          {jobs.error && !jobs.data && <ErrorBox error={jobs.error} onRetry={jobs.reload} />}
          {jobs.data && jobs.data.items.length === 0 && (
            <Empty title={status || kind || qDebounced ? "Không có tác vụ khớp bộ lọc" : "Hàng đợi đang trống"}
              action={!(status || kind || qDebounced) ? <Btn kind="primary" onClick={() => nav("/production/batch")}>Tạo hàng đợi render</Btn> : <Btn onClick={() => { setStatus(""); setKind(""); setQ(""); }}>Xoá bộ lọc</Btn>}>
              {!(status || kind || qDebounced) && "Tạo lô render từ Trung tâm sản xuất hàng loạt hoặc render preview trong Editor."}
            </Empty>
          )}
          {jobs.data && jobs.data.items.length > 0 && (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Job ID</th><th>Thumbnail</th><th>Variant</th><th>Loại</th><th>Thời lượng</th><th>Độ phân giải</th><th>Trạng thái</th><th style={{ width: 120 }}>Tiến độ</th><th>Đã chạy</th><th>Lỗi / Ghi chú</th><th className="right">Thao tác</th></tr>
                </thead>
                <tbody>
                  {jobs.data.items.map((j: any) => {
                    const res = j.profile_json?.result;
                    const pct = Math.round((j.progress || 0) * 100);
                    const el = elapsed(j, now);
                    return (
                      <tr key={j.id}>
                        <td className="mono" title={j.id}>#{j.id.slice(0, 8)}</td>
                        <td><Thumb src={res?.thumbnail} ratio="9/16" style={{ width: 30 }} /></td>
                        <td className="semi">{j.code || "—"}</td>
                        <td className="small">{JOB_KIND[j.kind] || j.kind}</td>
                        <td className="small">{j.duration ? `${j.duration}s` : "—"}</td>
                        <td className="small">{res?.width ? `${res.width} × ${res.height}` : "—"}</td>
                        <td><JobStatus status={j.status} /></td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <Bar value={pct} thin tone={j.status === "FAILED" ? "red" : j.status === "PAUSED" ? "orange" : j.status === "COMPLETED" ? "teal" : ""} style={{ flex: 1 }} />
                            <span className="xs" style={{ minWidth: 30 }}>{pct}%</span>
                          </div>
                        </td>
                        <td className="mono small">{mmss(el)}</td>
                        <td className="xs" style={{ maxWidth: 190 }}>
                          {j.error_code ? (
                            <span className="c-red" title={j.error_message || ""}>{j.error_code}{j.error_message ? ` – ${j.error_message}` : ""}</span>
                          ) : j.attempts > 1 ? <span className="muted">Lần thử {j.attempts}</span> : <span className="muted">–</span>}
                        </td>
                        <td className="right">
                          <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                            {["PENDING", "PREPARING", "RENDERING", "RETRY_WAIT"].includes(j.status) && <Btn size="xs" icon={<Pause size={12} />} title="Tạm dừng" onClick={() => jobAction(j, "pause")} />}
                            {j.status === "PAUSED" && <Btn size="xs" kind="primary" icon={<Play size={12} />} title="Tiếp tục" onClick={() => jobAction(j, "resume")} />}
                            {["FAILED", "CANCELLED"].includes(j.status) && <Btn size="xs" icon={<RotateCcw size={12} />} title="Thử lại" onClick={() => jobAction(j, "retry")} />}
                            {j.status === "COMPLETED" && j.output_uri && <Btn size="xs" icon={<FolderOpen size={12} />} title="Mở thư mục chứa file" onClick={() => openFolder(j.output_uri)} />}
                            {[...ACTIVE, "PAUSED", "FAILED"].includes(j.status) && <Btn size="xs" kind="ghost" icon={<XCircle size={12} />} title="Huỷ job" onClick={() => jobAction(j, "cancel")} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {jobs.data && total > 0 && (
            <div className="row between mt12 small">
              <div className="row">
                <span className="muted">Hiển thị</span>
                <Select value={String(size)} onChange={(v) => { setSize(Number(v)); setPage(1); }} style={{ width: 110, height: 30 }} options={[10, 20, 50].map((n) => ({ value: String(n), label: `${n} / trang` }))} />
              </div>
              <span className="muted">{(page - 1) * size + 1} – {Math.min(total, page * size)} trên {total} tác vụ</span>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn xs icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={14} /></button>
                {Array.from({ length: pages }).map((_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1).map((p, i, arr) => (
                  <span key={p} className="row" style={{ gap: 4 }}>
                    {i > 0 && arr[i - 1] !== p - 1 && <span className="muted">…</span>}
                    <button className={`btn xs ${p === page ? "primary" : ""}`} style={{ minWidth: 26 }} onClick={() => setPage(p)}>{p}</button>
                  </span>
                ))}
                <button className="btn xs icon" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Trang sau"><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </Card>

        {/* Thống kê */}
        <div className="col" style={{ gap: 16 }}>
          <Card title="Thống kê & hiệu suất" icon={<BarChart3 size={16} className="c-primary" />}>
            {!stats ? <Loading rows={4} /> : (
              <>
                <div className="grid g2" style={{ gap: 8 }}>
                  {[
                    { l: "Tổng tác vụ", v: stats.total, c: "c-primary", i: <Clapperboard size={15} /> },
                    { l: "Hoàn thành", v: by.COMPLETED || 0, c: "c-teal", i: <CheckCircle2 size={15} /> },
                    { l: "Đang render", v: running, c: "c-cyan", i: <Play size={15} /> },
                    { l: "Chờ xử lý", v: waiting, c: "", i: <Hourglass size={15} /> },
                    { l: "Tạm dừng", v: paused, c: "c-orange", i: <Pause size={15} /> },
                    { l: "Thất bại", v: failed, c: "c-red", i: <XCircle size={15} /> },
                  ].map((x) => (
                    <div key={x.l} className="inner row" style={{ padding: "8px 10px", gap: 8 }}>
                      <span className={x.c}>{x.i}</span>
                      <div><div className="bold" style={{ fontSize: 16 }}>{x.v}</div><div className="xs muted">{x.l}</div></div>
                    </div>
                  ))}
                </div>
                <div className="mt12 small semi">Thông lượng xử lý (job hoàn thành / giờ, 8 giờ qua)</div>
                <div className="mt8"><VBars data={hourly} height={90} /></div>
                <div className="divider" />
                <div className="col" style={{ gap: 8 }}>
                  <div className="row between small"><span className="row t2"><Clock size={14} /> Thời gian render TB</span><b className="c-teal">{stats.avg_seconds != null ? fmtDuration(stats.avg_seconds) : "—"}</b></div>
                  <div className="row between small"><span className="row t2"><Gauge size={14} /> Tốc độ ước tính</span><b className="c-teal">{stats.per_hour != null ? `${String(stats.per_hour).replace(".", ",")} video/giờ` : "—"}</b></div>
                  <div className="row between small"><span className="row t2"><Hourglass size={14} /> Thời gian còn lại</span><b className="c-teal">{stats.remaining ? (stats.eta_seconds != null ? `≈ ${fmtDuration(stats.eta_seconds)}` : "Chưa đủ dữ liệu") : "Không còn job"}</b></div>
                  <div className="xs muted">Tính từ 20 job preview/final hoàn thành gần nhất ÷ số job song song.</div>
                </div>
              </>
            )}
          </Card>
          <Card title={`Các lỗi phổ biến (${(stats?.errors || []).reduce((a: number, e: any) => a + e.n, 0)} tác vụ)`} icon={<AlertTriangle size={16} className="c-red" />}>
            {!stats ? <Loading rows={2} /> : stats.errors.length === 0 ? (
              <div className="small muted row"><CheckCircle2 size={14} className="c-teal" /> Không có lỗi trong hàng đợi.</div>
            ) : (
              <div className="col" style={{ gap: 6 }}>
                {stats.errors.map((e: any) => (
                  <div key={e.error_code} className="inner row between small" style={{ padding: "7px 10px", cursor: "pointer" }} title="Lọc job thất bại" onClick={() => { setStatus("FAILED"); setPage(1); }}>
                    <span className="row mono"><AlertTriangle size={13} className="c-orange" /> {e.error_code}</span><b>{e.n}</b>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {campaign && (
        <div className="mt16">
          <Card title={`Lô render (${(batches.data || []).length})`} icon={<Layers size={16} className="c-primary" />}>
            {batches.loading && !batches.data && <Loading rows={2} h={28} />}
            {batches.error && !batches.data && <ErrorBox error={batches.error} onRetry={batches.reload} />}
            {batches.data && batches.data.length === 0 && <div className="small muted">Chưa có lô render nào cho chiến dịch này.</div>}
            {batches.data && batches.data.length > 0 && (
              <div className="col" style={{ gap: 8 }}>
                {batches.data.map((b: any) => {
                  const c: Record<string, number> = b.jobs || {};
                  const act = BATCH_ACTIVE.reduce((a, k) => a + (c[k] || 0), 0);
                  const done = c.COMPLETED || 0;
                  return (
                    <div key={b.id} className="inner row" style={{ gap: 12, padding: "10px 12px", flexWrap: "wrap" }}>
                      <div className="grow" style={{ minWidth: 180 }}>
                        <div className="semi small ellipsis">{b.name || `Lô ${b.id.slice(0, 8)}`}</div>
                        <div className="xs muted">{b.created_at ? new Date(b.created_at).toLocaleString("vi-VN") : "—"} · {done}/{b.total ?? 0} hoàn thành</div>
                      </div>
                      <div className="row wrap" style={{ gap: 4 }}>
                        {BATCH_STATUSES.filter((k) => (c[k] || 0) > 0).map((k) => (
                          <Badge key={k} tone={JOB_STATUS[k]?.tone || "gray"}>{k} {c[k]}</Badge>
                        ))}
                        {!BATCH_STATUSES.some((k) => (c[k] || 0) > 0) && <span className="xs muted">Không có tác vụ</span>}
                      </div>
                      <div className="row" style={{ gap: 4 }}>
                        <Btn size="xs" icon={<Pause size={12} />} disabled={!act} onClick={() => batchAction(b, "pause")}>Tạm dừng</Btn>
                        <Btn size="xs" kind="primary" icon={<Play size={12} />} disabled={!c.PAUSED} onClick={() => batchAction(b, "resume")}>Tiếp tục</Btn>
                        <Btn size="xs" icon={<RotateCcw size={12} />} disabled={!(c.FAILED || c.CANCELLED)} onClick={() => batchAction(b, "retry")}>Thử lại</Btn>
                        <Btn size="xs" kind="ghost" icon={<XCircle size={12} />} disabled={!(act + (c.PAUSED || 0))} onClick={() => batchAction(b, "cancel")}>Huỷ</Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {!hwEnc && st && <div className="mt12"><InfoNote>Không phát hiện encoder phần cứng — mọi job render bằng CPU (libx264).</InfoNote></div>}

      <div className="sticky-bottom" style={{ justifyContent: "center" }}>
        <Btn kind="danger" size="lg" icon={<Pause size={17} />} disabled={!(running + waiting)} title={running + waiting ? undefined : "Không có job đang chạy/chờ"} onClick={() => queueAction("pause_all", "Đã tạm dừng")}>Tạm dừng tất cả</Btn>
        <Btn kind="teal" size="lg" icon={<Play size={17} />} disabled={!paused} title={paused ? undefined : "Không có job tạm dừng"} onClick={() => queueAction("resume_all", "Đã tiếp tục")}>Tiếp tục</Btn>
        <Btn kind="primary" size="lg" icon={<RotateCcw size={17} />} disabled={!failed} title={failed ? undefined : "Không có job thất bại"} onClick={() => queueAction("retry_failed", "Đã đưa vào thử lại")}>Thử lại lỗi ({failed})</Btn>
        <Btn size="lg" icon={<FileDown size={17} />} onClick={exportLog}>Xuất nhật ký</Btn>
        <Btn size="lg" icon={<FolderOpen size={17} />} disabled={!s?.paths?.output} onClick={() => openFolder()}>Mở thư mục đầu ra</Btn>
        {by.COMPLETED ? <Badge tone="teal" icon={<CheckCircle2 size={12} />}>{by.COMPLETED} hoàn thành</Badge> : null}
      </div>
    </>
  );
}
