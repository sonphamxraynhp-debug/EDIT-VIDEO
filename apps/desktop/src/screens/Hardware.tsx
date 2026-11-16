import { ReactNode, useEffect, useState } from "react";
import { Activity, CheckCircle2, Cpu, Folder, Gauge, HardDrive, Info, Laptop, Leaf, Layers, MemoryStick, MonitorCog, Play, Rocket, Save, Scale, Timer, XCircle, Zap } from "lucide-react";
import { api, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { dt } from "../lib/format";
import { Async, Badge, Btn, Card, Empty, ErrorBox, InfoNote, Loading, PageHead, Toggle, Warn } from "../components/ui";
import { Sparkline } from "../components/charts";
import { NA_MAC, Stepper, useSettingsDraft } from "../components/d_sys";

const N = 40;
type Samples = { cpu: number[]; ram: number[]; io: number[]; rd: number; wr: number };

const MODES = [
  { id: "eco", label: "Eco", icon: <Leaf size={16} />, desc: "Tiết kiệm tài nguyên – chạy 1 tác vụ render/CPU một lúc" },
  { id: "balanced", label: "Balanced", icon: <Scale size={16} />, desc: "Cân bằng – dùng đúng số tác vụ song song bạn đặt" },
  { id: "turbo", label: "Turbo", icon: <Rocket size={16} />, desc: "Tối đa – tối thiểu một nửa số nhân CPU chạy song song" },
];

function StaticCard({ icon, label, value, sub }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card row" style={{ gap: 12, padding: 14 }}>
      <div className="kpi-icon" style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--primary-soft)", color: "var(--primary-2)", flexShrink: 0 }}>{icon}</div>
      <div className="grow">
        <div className="xs muted">{label}</div>
        <div className="semi ellipsis" title={typeof value === "string" ? value : undefined}>{value}</div>
        {sub && <div className="xs t2 ellipsis">{sub}</div>}
      </div>
    </div>
  );
}

function LiveCard({ icon, title, value, right, values, color }: { icon: ReactNode; title: string; value: ReactNode; right?: ReactNode; values: number[]; color: string }) {
  return (
    <div className="inner" style={{ padding: 14 }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <span style={{ color }}>{icon}</span>
        <div className="grow">
          <div className="semi">{title}</div>
          <div className="bold" style={{ fontSize: 22, color }}>{value}</div>
        </div>
        {right && <div className="xs t2 right">{right}</div>}
      </div>
      <div className="mt8">
        {values.length >= 2 ? <Sparkline values={values} color={color} height={56} /> : <div className="xs muted" style={{ height: 56, display: "grid", placeItems: "center" }}>Đang thu thập mẫu…</div>}
      </div>
    </div>
  );
}

export default function Hardware() {
  const hwQ = useApi<any>("/system/hardware", undefined, 2000);
  const [s, setS] = useState<Samples>({ cpu: [], ram: [], io: [], rd: 0, wr: 0 });
  const live = hwQ.data?.live;
  const st = hwQ.data?.static;

  useEffect(() => {
    if (!live) return;
    setS((p) => ({
      cpu: [...p.cpu, live.cpu_pct ?? 0].slice(-N),
      ram: [...p.ram, live.ram_pct ?? 0].slice(-N),
      io: [...p.io, (live.disk_read_mbs ?? 0) + (live.disk_write_mbs ?? 0)].slice(-N),
      rd: live.disk_read_mbs ?? 0,
      wr: live.disk_write_mbs ?? 0,
    }));
  }, [live?.ts]);

  return (
    <>
      <PageHead title="Tối ưu phần cứng" icon={<Cpu size={24} />} sub="Giám sát hiệu năng, cấu hình xử lý và tối ưu tài nguyên cho AI và render video" />

      {hwQ.error && !hwQ.data && <ErrorBox error={hwQ.error} onRetry={hwQ.reload} />}
      {!st && !hwQ.error && <Loading rows={2} h={60} />}
      {st && (
        <div className="grid g6">
          <StaticCard icon={<Laptop size={20} />} label="Hệ điều hành" value={st.os_pretty || st.os} sub={st.os} />
          <StaticCard icon={<Cpu size={20} />} label="CPU" value={st.cpu} sub={`${st.cores_physical ?? "?"} nhân vật lý / ${st.cores_logical ?? "?"} luồng`} />
          <StaticCard icon={<MonitorCog size={20} />} label="GPU" value={st.gpu} sub={st.unified_memory ? "Unified Memory (dùng chung RAM)" : "VRAM: không đọc được"} />
          <StaticCard icon={<MemoryStick size={20} />} label="RAM" value={`${st.ram_total_gb} GB`} sub={live ? `Đang dùng ${live.ram_used_gb} GB (${Math.round(live.ram_pct)}%)` : undefined} />
          <StaticCard icon={<HardDrive size={20} />} label="Ổ đĩa dữ liệu" value={`${st.disk_total_gb} GB`} sub={live ? `Trống ${live.disk_free_gb} GB` : undefined} />
          <StaticCard
            icon={<Layers size={20} />}
            label="Tăng tốc mã hoá"
            value={st.hw_encoders?.length ? st.hw_encoders.map((e: string) => e.replace("_videotoolbox", " VT").replace("h264", "H.264").replace("hevc", "HEVC")).join(" / ") : "Không có"}
            sub={st.sw_encoder ? "Dự phòng CPU: libx264 ✓" : "Thiếu libx264"}
          />
        </div>
      )}

      <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0, 1.85fr) minmax(320px, 1fr)", alignItems: "start" }}>
        <div className="col" style={{ gap: 16 }}>
          <Card title="Hiệu năng thời gian thực" icon={<Activity size={16} className="c-primary" />} right={<Badge tone="teal" icon={<span className="dot" />}>Đang theo dõi (2s)</Badge>}>
            {!live ? (
              <Loading rows={3} />
            ) : (
              <div className="grid g2">
                <LiveCard icon={<Cpu size={20} />} title="CPU" value={`${Math.round(live.cpu_pct)}%`} right={st ? `${st.cores_logical} luồng` : undefined} values={s.cpu} color="#8b6cff" />
                <div className="inner" style={{ padding: 14 }}>
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <span className="c-teal"><MonitorCog size={20} /></span>
                    <div className="grow">
                      <div className="semi">GPU</div>
                      <div className="bold" style={{ fontSize: 16, color: "var(--muted)" }}>{live.gpu_pct ?? NA_MAC}</div>
                    </div>
                    <div className="xs t2 right">Nhiệt độ: {live.temp_c != null ? `${live.temp_c}°C` : "N/A"}</div>
                  </div>
                  <div className="xs muted mt8" style={{ height: 56, display: "grid", placeItems: "center", textAlign: "center" }}>
                    Không vẽ biểu đồ GPU vì hệ điều hành không cung cấp số liệu – ứng dụng không hiển thị số giả.
                  </div>
                </div>
                <LiveCard icon={<MemoryStick size={20} />} title="RAM" value={`${live.ram_used_gb} / ${live.ram_total_gb} GB (${Math.round(live.ram_pct)}%)`} values={s.ram} color="#4fc3ff" />
                <LiveCard icon={<HardDrive size={20} />} title="Ổ đĩa (I/O)" value={`${(s.rd + s.wr).toFixed(1)} MB/s`} right={<>Đọc: {s.rd.toFixed(1)} MB/s<br />Ghi: {s.wr.toFixed(1)} MB/s</>} values={s.io} color="#19d3b5" />
              </div>
            )}
          </Card>
          <Benchmark />
        </div>

        <div className="col" style={{ gap: 16 }}>
          <ProcessingConfig />
          <Card title="Lưu ý quan trọng" icon={<Info size={16} className="c-cyan" />}>
            <ul className="small t2" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Apple Silicon (macOS) dùng Unified Memory – RAM dùng chung cho CPU/GPU, không có VRAM riêng để hiển thị.</li>
              <li>Máy Windows/Linux có GPU rời sẽ hiển thị VRAM (qua nvidia-smi) nếu có.</li>
              <li>macOS không cung cấp % GPU và nhiệt độ cho ứng dụng thường nên hiển thị “N/A”.</li>
              <li>Nếu bộ mã hoá GPU lỗi khi render final, hệ thống tự chuyển sang libx264 (CPU).</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function ProcessingConfig() {
  const { q, draft, set, dirty, save, reset } = useSettingsDraft();
  const cache = q.data?.paths?.data ? `${q.data.paths.data}/work` : "";
  return (
    <Card title="Cấu hình xử lý" icon={<Gauge size={16} className="c-primary" />}>
      <Async q={q}>
        {() => (
          <>
            <div className="grid g3" style={{ gap: 8 }}>
              {MODES.map((m) => (
                <div key={m.id} className={`list-item ${draft.performance_mode === m.id ? "on" : ""}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }} onClick={() => set("performance_mode", m.id)}>
                  <div className="row semi" style={{ gap: 6 }}>{m.icon}{m.label}</div>
                  <div className="xs muted">{m.desc}</div>
                </div>
              ))}
            </div>
            <div className="col mt16" style={{ gap: 14 }}>
              <div className="row between">
                <span className="small">Tăng tốc GPU (nếu hỗ trợ)</span>
                <Toggle on={!!draft.gpu_accel} onChange={(v) => set("gpu_accel", v)} />
              </div>
              <div className="xs muted" style={{ marginTop: -8 }}>Giá trị mặc định ưu tiên; mỗi lô render vẫn có tuỳ chọn GPU riêng ở màn hình Sản xuất hàng loạt.</div>
              <div className="row between">
                <span className="small">Số tác vụ render song song</span>
                <Stepper value={Number(draft.parallel_jobs ?? 2)} onChange={(v) => set("parallel_jobs", v)} min={1} max={8} />
              </div>
              <div>
                <div className="small mb8">Thư mục cache (tạm)</div>
                <div className="inner row" style={{ padding: "8px 10px" }}>
                  <Folder size={14} className="muted" />
                  <span className="mono ellipsis grow" title={cache}>{cache || "—"}</span>
                </div>
                <div className="xs muted mt8">Chỉ đọc – cache nằm trong thư mục dữ liệu; đổi bằng biến môi trường AVF_DATA_DIR rồi khởi động lại.</div>
              </div>
              <div className="row between">
                <span className="small">Nhiệt độ tạm dừng</span>
                <Stepper value={Number(draft.pause_temp_c ?? 85)} onChange={(v) => set("pause_temp_c", v)} min={60} max={100} suffix="°C" />
              </div>
              <div className="xs muted">Ngưỡng nhiệt được lưu vào cài đặt; trên macOS không đọc được nhiệt độ nên ngưỡng này chưa có tác dụng.</div>
            </div>
            <div className="row mt16" style={{ justifyContent: "flex-end" }}>
              <Btn kind="ghost" size="sm" disabled={!dirty} onClick={reset}>Hoàn tác</Btn>
              <Btn kind="primary" size="sm" icon={<Save size={14} />} disabled={!dirty} title={dirty ? undefined : "Chưa có thay đổi"} onClick={() => save()}>Lưu cấu hình</Btn>
            </div>
          </>
        )}
      </Async>
    </Card>
  );
}

function Benchmark() {
  const { toastError } = useApp();
  const [polling, setPolling] = useState(false);
  const q = useApi<any>("/system/benchmark", undefined, polling ? 1500 : undefined);
  const running = !!q.data?.running;
  useEffect(() => {
    if (q.data && !q.data.running && polling) setPolling(false);
    if (q.data?.running && !polling) setPolling(true);
  }, [q.data]);
  const results: any[] = q.data?.results || [];
  async function start() {
    try {
      await api.post("/system/benchmark");
      setPolling(true);
      q.reload();
    } catch (e) {
      toastError(e, "Không chạy được benchmark");
    }
  }
  return (
    <Card
      title="Benchmark render trên máy này"
      sub="Đo thời gian thực tế render video thử 1080×1920 (15/30/45 giây) bằng ffmpeg với bộ mã hoá tốt nhất hiện có"
      icon={<Timer size={16} className="c-primary" />}
      right={<Btn kind="primary" icon={<Play size={15} />} loading={running} onClick={start}>{running ? "Đang chạy…" : "Chạy benchmark trên máy này"}</Btn>}
    >
      {q.error && !q.data ? (
        <ErrorBox error={q.error} onRetry={q.reload} />
      ) : q.loading && !q.data ? (
        <Loading />
      ) : !results.length && !running ? (
        <Empty title="Chưa có kết quả benchmark">Bấm “Chạy benchmark trên máy này” để đo tốc độ render thật (mất khoảng 1–2 phút, máy sẽ bận trong lúc chạy).</Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Độ dài video</th><th>Độ phân giải</th><th>Bộ mã hoá</th><th>Thời gian thực tế</th><th>Tốc độ hiệu quả</th><th>Kết quả</th></tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.duration}>
                    <td className="semi">{r.duration} giây</td>
                    <td>{r.resolution}</td>
                    <td><Badge tone="teal">{r.encoder}</Badge></td>
                    <td>≈ {r.seconds} giây</td>
                    <td>{r.speed}× {r.speed >= 1 ? "(nhanh hơn thời gian thực)" : ""}</td>
                    <td>{r.ok ? <span className="row c-teal small" style={{ gap: 4 }}><CheckCircle2 size={14} /> Thành công</span> : <span className="row c-red small" style={{ gap: 4 }}><XCircle size={14} /> Lỗi</span>}</td>
                  </tr>
                ))}
                {running && (
                  <tr><td colSpan={6} className="small muted"><Zap size={13} /> Đang render bài thử tiếp theo…</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {q.data?.finished && <div className="xs muted mt8">Lần chạy gần nhất: {dt(q.data.finished)}</div>}
        </>
      )}
      <div className="mt12">
        <Warn title="Kết quả benchmark chỉ mang tính tham chiếu">Video thử là testsrc tổng hợp; thời gian thực tế phụ thuộc độ phức tạp dự án, hiệu ứng, số lớp và tải hệ thống.</Warn>
      </div>
      <div className="mt8"><InfoNote>Benchmark chỉ chạy khi bạn bấm nút; không tự chạy nền.</InfoNote></div>
    </Card>
  );
}
