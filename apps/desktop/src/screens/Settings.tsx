import { ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Bell, Brain, CheckCircle2, ClipboardCheck, Cpu, Database, Download, FileText, Film, Folder, FolderOpen, Globe, HardDrive, Info,
  Layers, Lock, RefreshCw, RotateCcw, Save, ScrollText, Settings as SettingsIcon, ShieldCheck, Trash2, Upload, Wifi, XCircle,
} from "lucide-react";
import { api, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { bytes } from "../lib/format";
import { Async, Badge, Bar, Btn, Card, Empty, ErrorBox, InfoNote, Loading, Modal, PageHead, Seg, Select, Toggle } from "../components/ui";
import { DEFAULT_SETTINGS, downloadText, Stepper, useSettingsDraft } from "../components/d_sys";

const SECTIONS: Array<{ id: string; label: string; icon: ReactNode }> = [
  { id: "general", label: "Chung", icon: <SettingsIcon size={16} /> },
  { id: "language", label: "Ngôn ngữ", icon: <Globe size={16} /> },
  { id: "project", label: "Dự án", icon: <Folder size={16} /> },
  { id: "storage", label: "Lưu trữ", icon: <Database size={16} /> },
  { id: "render", label: "Render", icon: <Film size={16} /> },
  { id: "models", label: "AI Models", icon: <Brain size={16} /> },
  { id: "security", label: "Quyền & Bảo mật", icon: <ShieldCheck size={16} /> },
  { id: "qc", label: "Quy trình kiểm duyệt", icon: <ClipboardCheck size={16} /> },
  { id: "notify", label: "Thông báo", icon: <Bell size={16} /> },
  { id: "logs", label: "Logs", icon: <ScrollText size={16} /> },
  { id: "about", label: "About", icon: <Info size={16} /> },
];

const PRESETS = [{ value: "1080x1920_h264", label: "1080×1920 (9:16) – H.264 – MP4" }];
const QC_ITEMS: Array<[string, string]> = [
  ["similarity", "Kiểm tra độ tương đồng nội dung (văn bản & kịch bản)"],
  ["audio_subtitle", "Kiểm tra chất lượng âm thanh & phụ đề"],
  ["evidence", "Kiểm tra bằng chứng & thông tin sản phẩm"],
  ["rights", "Kiểm tra nguồn tư liệu & quyền sử dụng"],
];

function Group({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mb12">
      <div className="card-title mb12" style={{ fontSize: 14 }}>
        <span className="c-primary">{icon}</span>
        {title}
      </div>
      <div className="inner">{children}</div>
    </div>
  );
}

function Row({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, alignItems: "center", padding: "7px 0" }}>
      <span className="small t2">{label}</span>
      <div>
        {children}
        {hint && <div className="xs muted mt8">{hint}</div>}
      </div>
    </div>
  );
}

export default function Settings() {
  const [sp, setSp] = useSearchParams();
  const tab = SECTIONS.some((s) => s.id === sp.get("tab")) ? (sp.get("tab") as string) : "general";
  const setTab = (id: string) => {
    const n = new URLSearchParams(sp);
    if (id === "general") n.delete("tab");
    else n.set("tab", id);
    setSp(n, { replace: true });
  };
  const sd = useSettingsDraft();
  const { toast, toastError } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);

  async function restoreDefaults() {
    try {
      const r = await api.put<Record<string, any>>("/settings", DEFAULT_SETTINGS);
      sd.q.setData(r);
      setConfirmReset(false);
      toast({ kind: "success", title: "Đã khôi phục cài đặt mặc định" });
      return true;
    } catch (e) {
      toastError(e, "Khôi phục mặc định thất bại");
    }
  }

  return (
    <>
      <PageHead title="Cài đặt hệ thống" icon={<SettingsIcon size={24} />} sub="Tuỳ chỉnh hoạt động, tài nguyên và quy trình sản xuất của AI Video Factory" />
      <div className="grid" style={{ gridTemplateColumns: "200px minmax(0, 1fr) 300px", alignItems: "start" }}>
        <div className="card col" style={{ padding: 8, gap: 2, position: "sticky", top: 0 }}>
          {SECTIONS.map((s) => (
            <div key={s.id} className={`nav-item ${tab === s.id ? "active" : ""}`} style={{ padding: "8px 10px", fontSize: 13 }} onClick={() => setTab(s.id)}>
              {s.icon}
              {s.label}
            </div>
          ))}
        </div>

        <div className="card">
          {tab === "logs" ? (
            <LogsViewer />
          ) : tab === "about" ? (
            <About />
          ) : tab === "notify" ? (
            <Empty title="Thông báo">Ứng dụng chạy local: thông báo hiển thị trong ứng dụng (toast + biểu tượng chuông). Chưa hỗ trợ email/push vì không gửi dữ liệu ra ngoài máy.</Empty>
          ) : tab === "models" ? (
            <ModelsSummary />
          ) : (
            <Async q={sd.q}>{() => <SettingsBody tab={tab} sd={sd} />}</Async>
          )}
        </div>

        <InfoPanel />
      </div>

      <div className="sticky-bottom">
        <span className="small muted">{sd.dirty ? `${Object.keys(sd.changed).length} thay đổi chưa lưu: ${Object.keys(sd.changed).join(", ")}` : "Không có thay đổi chưa lưu"}</span>
        <div className="row" style={{ marginLeft: "auto" }}>
          <Btn icon={<Upload size={15} />} disabled={!sd.q.data} onClick={() => downloadText(`avf-settings-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(sd.q.data, null, 2), "application/json")}>Xuất cấu hình</Btn>
          <Btn icon={<RotateCcw size={15} />} disabled={!sd.q.data} onClick={() => setConfirmReset(true)}>Khôi phục mặc định</Btn>
          <Btn kind="ghost" disabled={!sd.dirty} onClick={sd.reset}>Huỷ thay đổi</Btn>
          <Btn kind="primary" icon={<Save size={15} />} disabled={!sd.dirty} title={sd.dirty ? undefined : "Chưa có thay đổi"} onClick={() => sd.save()}>Lưu thay đổi</Btn>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Khôi phục cài đặt mặc định?"
        footer={<><Btn kind="ghost" onClick={() => setConfirmReset(false)}>Huỷ</Btn><Btn kind="danger" icon={<RotateCcw size={15} />} onClick={restoreDefaults}>Khôi phục</Btn></>}
      >
        <div className="small t2">Các cài đặt chung, render, giọng đọc mặc định, QC và hiệu suất sẽ trở về giá trị gốc. Bộ nhận diện thương hiệu, dự án và dữ liệu video không bị ảnh hưởng.</div>
        <div className="mt12"><InfoNote>Gợi ý: bấm “Xuất cấu hình” trước để giữ bản sao cấu hình hiện tại.</InfoNote></div>
      </Modal>
    </>
  );
}

function SettingsBody({ tab, sd }: { tab: string; sd: ReturnType<typeof useSettingsDraft> }) {
  const { draft, set } = sd;
  const all = tab === "general";
  const qc = (draft.qc_checks || {}) as Record<string, boolean>;
  const paths = draft.paths || {};
  return (
    <>
      {(all || tab === "language") && (
        <Group title="Cài đặt chung" icon={<SettingsIcon size={15} />}>
          <Row label="Ngôn ngữ giao diện" hint="Hiện giao diện chỉ có bản tiếng Việt.">
            <Select value={draft.language} onChange={(v) => set("language", v)} options={[{ value: "vi", label: "Tiếng Việt" }]} />
          </Row>
          <Row label="Giao diện (Theme)" hint="Ứng dụng chỉ hỗ trợ giao diện tối.">
            <Select value="dark" onChange={() => undefined} options={[{ value: "dark", label: "Tối (Dark)" }]} disabled />
          </Row>
        </Group>
      )}
      {(all || tab === "project") && (
        <Group title="Dự án & tự động lưu" icon={<Folder size={15} />}>
          <Row label="Tự động lưu (Autosave)"><Toggle purple on={!!draft.autosave} onChange={(v) => set("autosave", v)} /></Row>
          <Row label="Chu kỳ lưu">
            <Select value={draft.autosave_minutes} onChange={(v) => set("autosave_minutes", Number(v))} options={[1, 2, 5, 10, 15].map((n) => ({ value: n, label: `${n} phút` }))} style={{ maxWidth: 200 }} />
          </Row>
          {!all && (
            <>
              <Row label="Checkpoint render" hint="Chu kỳ lưu điểm khôi phục tác vụ render dài.">
                <Select value={draft.checkpoint_minutes} onChange={(v) => set("checkpoint_minutes", Number(v))} options={[1, 2, 5, 10].map((n) => ({ value: n, label: `${n} phút` }))} style={{ maxWidth: 200 }} />
              </Row>
              <Row label="Ngăn máy ngủ khi render"><Toggle purple on={!!draft.prevent_sleep} onChange={(v) => set("prevent_sleep", v)} /></Row>
            </>
          )}
        </Group>
      )}
      {(all || tab === "storage") && (
        <Group title="Đường dẫn & lưu trữ" icon={<HardDrive size={15} />}>
          {([["Thư mục dữ liệu", paths.data], ["Thư mục xuất video", paths.output], ["Thư mục mô hình", paths.models], ["Thư mục log", paths.logs]] as Array<[string, string]>).map(([l, p]) => (
            <Row key={l} label={l}>
              <PathBox path={p} />
            </Row>
          ))}
          <div className="xs muted mt8">Chỉ đọc. Đổi vị trí bằng biến môi trường <span className="mono">AVF_DATA_DIR</span> (dữ liệu, cache, mô hình, log) và <span className="mono">AVF_OUTPUT_DIR</span> (video xuất), sau đó khởi động lại dịch vụ local.</div>
          {tab === "storage" && <div className="mt12"><StorageUsage /></div>}
        </Group>
      )}
      {(all || tab === "render") && (
        <Group title="Xuất video & âm thanh" icon={<Film size={15} />}>
          <Row label="Preset xuất mặc định" hint="Hiện engine render xuất 1080×1920 H.264 MP4.">
            <Select value={draft.export_preset} onChange={(v) => set("export_preset", v)} options={PRESETS} />
          </Row>
          <Row label="Mức âm chuẩn (Loudness)">
            <Select value={draft.loudness_lufs} onChange={(v) => set("loudness_lufs", Number(v))} options={[-14, -16, -23].map((n) => ({ value: n, label: `${n} LUFS` }))} style={{ maxWidth: 200 }} />
          </Row>
        </Group>
      )}
      {(all || tab === "qc") && (
        <Group title="Quy trình kiểm soát chất lượng" icon={<ClipboardCheck size={15} />}>
          <div className="grid g2" style={{ gap: 10 }}>
            {QC_ITEMS.map(([k, label]) => (
              <label key={k} className="row small" style={{ cursor: "pointer" }}>
                <input type="checkbox" className="check" checked={qc[k] !== false} onChange={(e) => set("qc_checks", { ...qc, [k]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
          <div className="xs muted mt8">Kiểm tra claim bị cấm và quyền tư liệu luôn chặn duyệt (BLOCK-01/02) bất kể lựa chọn ở đây.</div>
          <Row label="Ngưỡng điểm nguyên bản tối thiểu" hint="Biến thể có điểm nguyên bản dưới ngưỡng bị chặn duyệt, chặn render final và chặn xuất gói — tránh bị nền tảng coi là nội dung lặp">
            <input className="input" type="number" min={0.2} max={0.8} step={0.05} style={{ maxWidth: 120 }} value={draft.originality_min ?? 0.35}
              onChange={(e) => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) set("originality_min", n); }}
              onBlur={() => set("originality_min", Math.min(0.8, Math.max(0.2, Number(draft.originality_min ?? 0.35))))} />
          </Row>
        </Group>
      )}
      {(all || tab === "render") && (
        <Group title="Xử lý & hiệu suất" icon={<Cpu size={15} />}>
          <Row label="Số tác vụ chạy song song" hint="Khuyến nghị 2–4 tuỳ CPU/RAM; chế độ Eco luôn chạy 1.">
            <Stepper value={Number(draft.parallel_jobs ?? 2)} onChange={(v) => set("parallel_jobs", v)} min={1} max={8} />
          </Row>
          <Row label="Chế độ hiệu năng">
            <Seg value={draft.performance_mode} onChange={(v) => set("performance_mode", v)} options={[{ value: "eco", label: "Eco" }, { value: "balanced", label: "Balanced" }, { value: "turbo", label: "Turbo" }]} />
          </Row>
          <Row label="Chế độ ngoại tuyến (Offline)" hint="Chạy hoàn toàn trên máy, không cần Internet để xử lý.">
            <Toggle purple on={!!draft.offline_mode} onChange={(v) => set("offline_mode", v)} />
          </Row>
        </Group>
      )}
      {(all || tab === "security") && <Security sd={sd} />}
    </>
  );
}

function PathBox({ path }: { path?: string }) {
  const { toastError } = useApp();
  return (
    <div className="row" style={{ gap: 6 }}>
      <div className="inner row grow" style={{ padding: "7px 10px" }}>
        <Folder size={14} className="muted" />
        <span className="mono ellipsis" title={path}>{path || "—"}</span>
      </div>
      <Btn size="sm" icon={<FolderOpen size={14} />} disabled={!path} title="Mở trong Finder" onClick={async () => {
        try { await api.post("/system/open-folder", { path }); return true; } catch (e) { toastError(e, "Không mở được thư mục"); }
      }} />
    </div>
  );
}

function Security({ sd }: { sd: ReturnType<typeof useSettingsDraft> }) {
  const { toast, toastError } = useApp();
  const nav = useNavigate();
  const [backup, setBackup] = useState<string | null>(null);
  const [confirmClean, setConfirmClean] = useState(false);
  async function doBackup() {
    try {
      const r = await api.post<{ backup: string }>("/system/backup");
      setBackup(r.backup);
      toast({ kind: "success", title: "Đã sao lưu cơ sở dữ liệu", body: r.backup });
      return true;
    } catch (e) {
      toastError(e, "Sao lưu thất bại");
    }
  }
  async function doClean() {
    try {
      const r = await api.post<any>("/system/cleanup", undefined, { target: "cache" });
      setConfirmClean(false);
      toast({ kind: "success", title: "Đã dọn cache", body: `Còn lại: work ${bytes(r.work)}, voice ${bytes(r.voice)}` });
      return true;
    } catch (e) {
      toastError(e, "Dọn cache thất bại");
    }
  }
  const card = (icon: ReactNode, title: string, desc: ReactNode, action: ReactNode) => (
    <div className="inner col" style={{ gap: 6 }}>
      <div className="row semi small"><span className="c-primary">{icon}</span>{title}</div>
      <div className="xs muted grow">{desc}</div>
      {action}
    </div>
  );
  return (
    <Group title="Bảo mật & quyền riêng tư" icon={<Lock size={15} />}>
      <div className="grid g3" style={{ gap: 10 }}>
        {card(<HardDrive size={15} />, "Lưu trữ dự án cục bộ", "Dữ liệu dự án, video, kịch bản lưu trên máy; API chỉ lắng nghe 127.0.0.1.", <Badge tone="teal">Đang áp dụng</Badge>)}
        {card(<Database size={15} />, "Sao lưu dữ liệu", backup ? <span className="mono" style={{ wordBreak: "break-all" }}>{backup}</span> : "Tạo bản sao SQLite (dự án, kịch bản, QC) vào thư mục backups.", <Btn size="sm" icon={<Download size={13} />} onClick={doBackup}>Sao lưu ngay</Btn>)}
        {card(<Trash2 size={15} />, "Xoá cache", "Xoá file tạm render và giọng đọc đã tạo. Không ảnh hưởng video gốc/video đã xuất.", <Btn size="sm" kind="danger" icon={<Trash2 size={13} />} onClick={() => setConfirmClean(true)}>Dọn cache…</Btn>)}
        {card(<Wifi size={15} />, "Gửi dữ liệu sử dụng (Telemetry)", "Mặc định tắt. Hiện ứng dụng không gửi telemetry ra ngoài kể cả khi bật.", <Toggle on={!!sd.draft.telemetry} onChange={(v) => sd.set("telemetry", v)} />)}
        {card(<ShieldCheck size={15} />, "Truy xuất nguồn chứng cứ", "Claim chỉ dùng khi đã duyệt và có evidence; QC chặn claim bị cấm.", <Badge tone="teal">Bắt buộc</Badge>)}
        {card(<ScrollText size={15} />, "Nhật ký hệ thống", "Xem log API/worker để truy vết lỗi và thao tác.", <Btn size="sm" onClick={() => nav("/settings?tab=logs")}>Mở Logs</Btn>)}
      </div>
      <Modal
        open={confirmClean}
        onClose={() => setConfirmClean(false)}
        title="Dọn cache?"
        footer={<><Btn kind="ghost" onClick={() => setConfirmClean(false)}>Huỷ</Btn><Btn kind="danger" icon={<Trash2 size={15} />} onClick={doClean}>Xoá cache</Btn></>}
      >
        <div className="small t2">Xoá toàn bộ thư mục tạm render (work) và file giọng đọc đã tạo (voice). Không thể hoàn tác; giọng đọc sẽ được tạo lại khi render lần sau. Video gốc, proxy và video đã xuất không bị xoá.</div>
      </Modal>
    </Group>
  );
}

function StorageUsage() {
  const q = useApi<any>("/system/storage", undefined, 30000);
  const { hw } = useApp();
  return (
    <Async q={q}>
      {(s) => {
        const items: Array<[string, number]> = [["Video gốc", s.media], ["Proxy/keyframe", s.proxy], ["Tạm render", s.work], ["Video xuất", s.output], ["Mô hình", s.models], ["Giọng đọc", s.voice]];
        const total = items.reduce((a, [, v]) => a + (v || 0), 0);
        const diskTotal = hw?.static?.disk_total_gb;
        const usedPct = diskTotal ? ((diskTotal - s.disk_free_gb) / diskTotal) * 100 : 0;
        return (
          <div className="col" style={{ gap: 8 }}>
            <div className="row between small"><span>Ổ đĩa dữ liệu</span><b>{diskTotal ? `${Math.round(diskTotal - s.disk_free_gb)} GB / ${diskTotal} GB (${Math.round(usedPct)}%)` : `Trống ${s.disk_free_gb?.toFixed(1)} GB`}</b></div>
            <Bar value={usedPct} tone={usedPct > 90 ? "red" : usedPct > 75 ? "orange" : "teal"} />
            <div className="xs muted">Ứng dụng đang dùng {bytes(total)} · Trống {s.disk_free_gb?.toFixed(1)} GB</div>
            {items.map(([l, v]) => (
              <div key={l} className="row between xs t2"><span>{l}</span><span>{bytes(v)}</span></div>
            ))}
          </div>
        );
      }}
    </Async>
  );
}

function InfoPanel() {
  const { health, hw } = useApp();
  const m = useApi<any>("/models");
  const st = hw?.static;
  const comp = (ok: boolean | undefined, label: string, val: ReactNode) => (
    <div key={label} className="row small" style={{ gap: 6 }}>
      {ok ? <CheckCircle2 size={14} className="c-teal" /> : <XCircle size={14} className="c-red" />}
      <span className="grow">{label}</span>
      <span className="xs muted ellipsis" style={{ maxWidth: 130 }} title={typeof val === "string" ? val : undefined}>{val}</span>
    </div>
  );
  const ffv = st?.ffmpeg?.match(/ffmpeg version (\S+)/)?.[1];
  return (
    <div className="col" style={{ gap: 16 }}>
      <Card title="Thông tin hệ thống" icon={<Info size={16} className="c-primary" />}>
        <div className="kv" style={{ gridTemplateColumns: "110px 1fr" }}>
          <span>Ứng dụng</span><span className="semi">AI Video Factory</span>
          <span>Phiên bản</span><span>v1.0.0</span>
          <span>Trạng thái</span><span>{health ? <Badge tone={health.status === "ok" ? "teal" : "red"}>{health.status === "ok" ? "Hoạt động ổn định" : health.status}</Badge> : "…"}</span>
          <span>Schema DB</span><span>{health?.schema_version ?? "—"}</span>
        </div>
      </Card>
      <Card title="Thành phần & phụ thuộc" icon={<Layers size={16} className="c-primary" />}>
        <div className="col" style={{ gap: 7 }}>
          {comp(health?.status === "ok", "API local (Python)", health ? "đang chạy" : "—")}
          {comp(health?.ffmpeg, "FFmpeg", ffv || (health?.ffmpeg ? "có" : "thiếu"))}
          {comp(health?.llm, "LLM (Ollama)", health?.llm ? "sẵn sàng" : "không chạy")}
          {m.data?.models?.filter((x: any) => x.kind !== "llm").map((x: any) => comp(x.installed, x.provider, x.model_name))}
          {m.error && <div className="xs c-red">Không đọc được danh sách mô hình</div>}
        </div>
      </Card>
      <Card title="Bộ mã hoá hỗ trợ" icon={<Cpu size={16} className="c-primary" />}>
        {!st ? <Loading rows={2} /> : (
          <div className="col" style={{ gap: 7 }}>
            {comp(st.sw_encoder, "H.264 (CPU – libx264)", st.sw_encoder ? "có" : "thiếu")}
            {comp(st.hw_encoders?.some((e: string) => e.startsWith("h264_")), "H.264 (GPU)", st.hw_encoders?.filter((e: string) => e.startsWith("h264_")).join(", ") || "không có")}
            {comp(st.hw_encoders?.some((e: string) => e.startsWith("hevc_")), "H.265 / HEVC (GPU)", st.hw_encoders?.filter((e: string) => e.startsWith("hevc_")).join(", ") || "không có")}
            {comp(st.hw_encoders?.some((e: string) => e.startsWith("av1_")), "AV1 (GPU)", st.hw_encoders?.some((e: string) => e.startsWith("av1_")) ? "có" : "không có")}
          </div>
        )}
      </Card>
      <Card title="Lưu trữ & tài nguyên" icon={<HardDrive size={16} className="c-primary" />}>
        <StorageUsage />
      </Card>
    </div>
  );
}

function ModelsSummary() {
  const nav = useNavigate();
  const q = useApi<any>("/models");
  return (
    <>
      <div className="row between mb12">
        <div className="card-title" style={{ fontSize: 14 }}><Brain size={15} className="c-primary" /> Mô hình AI</div>
        <Btn size="sm" onClick={() => nav("/system/models")}>Mở Quản lý mô hình →</Btn>
      </div>
      <Async q={q} empty={(d) => !d.models?.length && <Empty title="Không có mô hình" />}>
        {(d) => (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Loại</th><th>Provider</th><th>Model</th><th>Dung lượng</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {d.models.map((x: any) => (
                  <tr key={x.kind}>
                    <td className="semi">{x.kind.toUpperCase()}</td>
                    <td>{x.provider}</td>
                    <td className="ellipsis" style={{ maxWidth: 220 }}>{x.model_name}</td>
                    <td>{x.size_gb ? `${x.size_gb} GB` : "—"}</td>
                    <td>{x.installed ? <Badge tone="teal">Đã cài</Badge> : <Badge tone="orange">Chưa cài</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
      <div className="xs muted mt8">Thư mục: <span className="mono">{q.data?.models_dir}</span></div>
    </>
  );
}

function LogsViewer() {
  const [name, setName] = useState<"api" | "worker">("api");
  const [lines, setLines] = useState(300);
  const [follow, setFollow] = useState(true);
  const q = useApi<{ lines: string[] }>("/system/logs", { name, lines }, follow ? 5000 : undefined);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [q.data]);
  const data = q.data?.lines || [];
  return (
    <>
      <div className="row wrap mb12">
        <div className="card-title" style={{ fontSize: 14 }}><ScrollText size={15} className="c-primary" /> Nhật ký hệ thống</div>
        <div className="row" style={{ marginLeft: "auto" }}>
          <Seg value={name} onChange={setName} options={[{ value: "api", label: "API" }, { value: "worker", label: "Worker" }]} />
          <Select value={lines} onChange={(v) => setLines(Number(v))} options={[100, 300, 1000].map((n) => ({ value: n, label: `${n} dòng` }))} style={{ width: 120 }} />
          <label className="row small" style={{ gap: 6 }}><Toggle on={follow} onChange={setFollow} /> Tự làm mới</label>
          <Btn size="sm" icon={<RefreshCw size={13} />} onClick={async () => { await q.reload(); return true; }}>Làm mới</Btn>
          <Btn size="sm" icon={<Download size={13} />} disabled={!data.length} onClick={() => downloadText(`avf-${name}-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.log`, data.join("\n"))}>Tải .log</Btn>
        </div>
      </div>
      {q.error && !q.data ? (
        <ErrorBox error={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <Loading rows={6} />
      ) : !data.length ? (
        <Empty title={`Chưa có log ${name}`}>File {name}.log chưa được tạo hoặc đang trống.</Empty>
      ) : (
        <div ref={box} className="inner mono" style={{ height: 520, overflow: "auto", fontSize: 11.5, lineHeight: 1.6, background: "#070b1c", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {data.map((l, i) => (
            <div key={i} style={{ color: /error|exception|traceback/i.test(l) ? "var(--red)" : /warn/i.test(l) ? "var(--orange)" : undefined }}>{l}</div>
          ))}
        </div>
      )}
      <div className="xs muted mt8"><FileText size={12} /> Hiển thị {data.length} dòng cuối của {name}.log</div>
    </>
  );
}

function About() {
  const { health, hw } = useApp();
  return (
    <>
      <div className="row mb12" style={{ gap: 14 }}>
        <div className="brand-logo"><Film size={20} color="#fff" /></div>
        <div>
          <div className="bold" style={{ fontSize: 18 }}>AI Video Factory</div>
          <div className="small muted">Phiên bản 1.0.0 · Bản chạy local</div>
        </div>
      </div>
      <div className="kv">
        <span>Hệ điều hành</span><span>{hw?.static?.os_pretty || "—"}</span>
        <span>CPU</span><span>{hw?.static?.cpu || "—"}</span>
        <span>FFmpeg</span><span>{hw?.static?.ffmpeg || "—"}</span>
        <span>Cơ sở dữ liệu</span><span className="mono" style={{ wordBreak: "break-all" }}>{health?.db || "—"}</span>
        <span>Offline</span><span>{health?.offline_capable ? "Có – xử lý hoàn toàn trên máy" : "—"}</span>
      </div>
      <div className="mt16"><InfoNote>Đánh giá nội bộ (QC) không bảo đảm việc phân phối hoặc phê duyệt trên nền tảng. Nội dung có giọng AI tổng hợp cần xét nhãn disclosure khi đăng.</InfoNote></div>
    </>
  );
}
