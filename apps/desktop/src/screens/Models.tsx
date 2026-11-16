import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Boxes, Brain, CheckCircle2, Cpu, Database, Download, Eye, FileCheck2, Film, Info, Laptop, Mic,
  Play, Plus, RefreshCw, ScanLine, ShieldCheck, Terminal, Trash2, Volume2, Wifi, WifiOff, XCircle,
} from "lucide-react";
import { api, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { dt } from "../lib/format";
import { Async, Badge, Bar, Btn, Card, Empty, ErrorBox, InfoNote, Loading, Modal, PageHead, Select, Tabs } from "../components/ui";

const KIND: Record<string, { label: string; icon: ReactNode; color: string }> = {
  llm: { label: "LLM", icon: <Brain size={18} />, color: "#a074ff" },
  vision: { label: "Vision", icon: <Eye size={18} />, color: "#4fc3ff" },
  asr: { label: "ASR", icon: <Mic size={18} />, color: "#19d3b5" },
  tts: { label: "TTS", icon: <Volume2 size={18} />, color: "#f5a524" },
  embeddings: { label: "Embeddings", icon: <Boxes size={18} />, color: "#e879f9" },
  ocr: { label: "OCR", icon: <ScanLine size={18} />, color: "#4f8bff" },
};
const ORDER = ["llm", "vision", "asr", "tts", "embeddings", "ocr"];
const WHISPER_MB = 148;

export default function Models() {
  const { hw, health, toastError, toast } = useApp();
  const q = useApi<any>("/models");
  const [tab, setTab] = useState("all");
  const [confirmDl, setConfirmDl] = useState(false);
  const [dlPoll, setDlPoll] = useState(false);
  const dl = useApi<any>("/models/whisper/download", undefined, dlPoll ? 1000 : undefined);
  const [pdPoll, setPdPoll] = useState(false);
  const pd = useApi<any>("/models/piper/download", undefined, pdPoll ? 1000 : undefined);
  const [tests, setTests] = useState<any[] | null>(null);
  const st = hw?.static;

  useEffect(() => {
    if (dl.data?.running && !dlPoll) setDlPoll(true);
    if (dl.data && !dl.data.running && dlPoll) {
      setDlPoll(false);
      q.reload();
      if (dl.data.error) toast({ kind: "error", title: "Tải Whisper thất bại", body: dl.data.error });
      else toast({ kind: "success", title: "Đã tải xong model Whisper (ggml-large-v3-turbo-q5_0.bin)" });
    }
  }, [dl.data]);

  useEffect(() => {
    if (pd.data?.running && !pdPoll) setPdPoll(true);
    if (pd.data && !pd.data.running && pdPoll) {
      setPdPoll(false);
      q.reload();
      if (pd.data.error) toast({ kind: "error", title: "Tải giọng Piper thất bại", body: pd.data.error });
      else toast({ kind: "success", title: `Đã tải giọng đọc tiếng Việt ${pd.data.model}` });
    }
  }, [pd.data]);

  async function startPiper() {
    try {
      await api.post("/models/piper/download");
      setPdPoll(true);
      pd.reload();
    } catch (e) {
      toastError(e, "Không bắt đầu tải giọng được");
    }
  }

  const models: any[] = q.data?.models || [];
  const sorted = useMemo(() => [...models].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)), [models]);
  const shown = tab === "all" ? sorted : sorted.filter((m) => m.kind === tab);
  const installed = models.filter((m) => m.installed).length;
  const whisper = models.find((m) => m.kind === "asr");

  async function startDownload() {
    setConfirmDl(false);
    try {
      await api.post("/models/whisper/download");
      setDlPoll(true);
      dl.reload();
    } catch (e) {
      toastError(e, "Không bắt đầu tải được");
    }
  }
  async function runTest() {
    try {
      const r = await api.post<{ results: any[] }>("/models/test");
      setTests(r.results);
      return true;
    } catch (e) {
      toastError(e, "Kiểm tra suy luận thất bại");
    }
  }

  return (
    <>
      <PageHead title="Quản lý mô hình AI" icon={<Brain size={24} />} sub="Cài đặt, kiểm tra và theo dõi các mô hình AI chạy local cho phân tích, tạo nội dung và sản xuất video" />

      <div className="grid" style={{ gridTemplateColumns: "1.3fr 1fr 1fr" }}>
        <div className="card row" style={{ gap: 12 }}>
          <Laptop size={26} className="c-primary" />
          <div className="grow">
            <div className="semi">Cấu hình máy (tóm tắt)</div>
            <div className="xs t2 ellipsis">{st ? `${st.os_pretty} · ${st.cpu} · ${st.cores_logical} luồng · RAM ${st.ram_total_gb} GB${st.unified_memory ? " (Unified)" : ""}` : "Đang đọc…"}</div>
          </div>
          <Btn size="sm" icon={<RefreshCw size={14} />} onClick={async () => { await q.reload(); return true; }}>Quét lại</Btn>
        </div>
        <div className="card row" style={{ gap: 12 }}>
          <Database size={26} className="c-cyan" />
          <div className="grow">
            <div className="semi">Dung lượng thư mục mô hình</div>
            {q.data ? (
              <>
                <div className="small t2">{q.data.usage_gb} GB{st ? ` / ${st.disk_total_gb} GB ổ đĩa` : ""}</div>
                <Bar value={st ? (q.data.usage_gb / st.disk_total_gb) * 100 : 0} thin tone="cyan" style={{ marginTop: 6 }} />
                <div className="xs muted ellipsis mt8" title={q.data.models_dir}>Chỉ tính file trong {q.data.models_dir}; model Ollama lưu riêng.</div>
              </>
            ) : <div className="small muted">—</div>}
          </div>
        </div>
        <div className="card row" style={{ gap: 12 }}>
          <Cpu size={26} className="c-teal" />
          <div className="grow">
            <div className="semi">Đã cài {installed}/{models.length || "—"} engine</div>
            <div className="row wrap mt8" style={{ gap: 6 }}>
              {sorted.map((m) => (
                <span key={m.kind} className={`small ${m.installed ? "c-teal" : "c-orange"}`}>{KIND[m.kind]?.label || m.kind} {m.installed ? "✓" : "✗"}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0, 2.2fr) minmax(300px, 1fr)", alignItems: "start" }}>
        <div className="col" style={{ gap: 16 }}>
          <Tabs pill value={tab} onChange={setTab} tabs={[{ id: "all", label: `Tất cả (${models.length})` }, ...ORDER.filter((k) => models.some((m) => m.kind === k)).map((k) => ({ id: k, label: `${KIND[k].label} (${models.filter((m) => m.kind === k).length})` }))]} />
          <Async q={q} empty={(d) => !d.models?.length && <Empty title="Không có mô hình nào được đăng ký" />}>
            {() => (
              <div className="grid g2">
                {shown.map((m) => (
                  <ModelCard key={m.kind} m={m} dl={m.kind === "asr" ? dl.data : m.kind === "tts" ? pd.data : undefined} onDownload={m.kind === "tts" ? startPiper : () => setConfirmDl(true)} />
                ))}
              </div>
            )}
          </Async>

          <div className="row wrap">
            <Btn icon={<Plus size={15} />} disabled title="Backend chưa hỗ trợ nhập model từ file local – hãy đặt file vào thư mục models hoặc dùng Ollama">Import Local Model</Btn>
            <Btn icon={<ShieldCheck size={15} />} disabled title="Backend chưa có API kiểm tra checksum theo yêu cầu; checksum sha256 được ghi tự động khi tải Whisper">Verify Checksum</Btn>
            <Btn
              icon={<Download size={15} />}
              disabled={!whisper || whisper.installed || !!dl.data?.running}
              title={whisper?.installed ? "Whisper đã được cài" : dl.data?.running ? "Đang tải" : "Chỉ hỗ trợ tải Whisper từ nguồn đã duyệt"}
              onClick={() => setConfirmDl(true)}
            >
              Download from Approved Source
            </Btn>
            <Btn icon={<Play size={15} />} onClick={runTest}>Test Inference</Btn>
            <Btn kind="danger" icon={<Trash2 size={15} />} disabled title="Backend chưa hỗ trợ gỡ model; xoá thủ công trong thư mục models hoặc `ollama rm`">Remove Model</Btn>
          </div>

          {tests && (
            <Card title="Kết quả kiểm tra suy luận" icon={<FileCheck2 size={16} className="c-primary" />} right={<span className="link small" onClick={() => setTests(null)}>Ẩn</span>}>
              <div className="grid g4">
                {tests.map((t) => (
                  <div key={t.kind} className="inner">
                    <div className="row between">
                      <b>{KIND[t.kind]?.label || t.kind.toUpperCase()}</b>
                      {t.ok ? <Badge tone="teal" icon={<CheckCircle2 size={12} />}>OK</Badge> : <Badge tone="red" icon={<XCircle size={12} />}>Lỗi</Badge>}
                    </div>
                    <div className="xs muted mt8">{t.ms != null ? `${t.ms} ms` : t.ok ? "Công cụ sẵn sàng" : "Không sẵn sàng"}</div>
                    {t.error && <div className="xs c-red mt8" style={{ wordBreak: "break-word" }}>{t.error}</div>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <LogConsole />
        </div>

        <div className="col" style={{ gap: 16 }}>
          <Card title="Điều phối & vận hành mô hình" icon={<Cpu size={16} className="c-primary" />}>
            <div className="small semi mb8">Kế hoạch tải mô hình (Pipeline)</div>
            <div className="row" style={{ gap: 4, justifyContent: "space-between" }}>
              {[
                { k: "vision", label: "Vision", sub: "Phân tích", icon: <Eye size={18} />, ok: models.find((m) => m.kind === "vision")?.installed },
                { k: "llm", label: "LLM", sub: "Kịch bản", icon: <Brain size={18} />, ok: models.find((m) => m.kind === "llm")?.installed },
                { k: "tts", label: "TTS", sub: "Giọng đọc", icon: <Volume2 size={18} />, ok: models.find((m) => m.kind === "tts")?.installed },
                { k: "render", label: "Render", sub: "ffmpeg", icon: <Film size={18} />, ok: health?.ffmpeg },
              ].map((s, i) => (
                <div key={s.k} className="row" style={{ gap: 4 }}>
                  <div className="inner center" style={{ padding: "8px 6px", width: 62, borderColor: s.ok ? "rgba(25,211,181,.45)" : s.ok === false ? "rgba(240,80,110,.5)" : undefined }}>
                    <div className="c-primary">{s.icon}</div>
                    <div className="xs semi">{s.label}</div>
                    <div className="xs muted">{s.sub}</div>
                  </div>
                  {i < 3 && <ArrowRight size={14} className="muted" />}
                </div>
              ))}
            </div>
            <div className="xs muted mt8">Viền xanh = sẵn sàng, viền đỏ = thiếu thành phần.</div>
          </Card>

          <Card title="Bộ nhớ & cơ chế dự phòng" icon={<ShieldCheck size={16} className="c-teal" />}>
            <div className="col small t2" style={{ gap: 8 }}>
              <div className="row" style={{ alignItems: "flex-start" }}><CheckCircle2 size={14} className="c-teal" style={{ flexShrink: 0, marginTop: 2 }} />LLM trả về sai schema JSON hoặc không chạy → sinh kịch bản bằng template engine nội bộ.</div>
              <div className="row" style={{ alignItems: "flex-start" }}><CheckCircle2 size={14} className="c-teal" style={{ flexShrink: 0, marginTop: 2 }} />Bộ mã hoá GPU (VideoToolbox/NVENC) lỗi khi render → tự render lại bằng libx264 (CPU).</div>
              <div className="row" style={{ alignItems: "flex-start" }}><CheckCircle2 size={14} className="c-teal" style={{ flexShrink: 0, marginTop: 2 }} />Gắn nhãn cảnh (Vision) dùng heuristic có độ tin cậy thấp → cần người xác nhận.</div>
              <div className="row" style={{ alignItems: "flex-start" }}><Info size={14} className="c-cyan" style={{ flexShrink: 0, marginTop: 2 }} />Ollama tự quản lý nạp/giải phóng model trong bộ nhớ{st?.unified_memory ? " (Unified Memory dùng chung RAM)" : ""}.</div>
            </div>
          </Card>

          <Card title="Khả dụng offline" icon={health?.llm ? <Wifi size={16} className="c-teal" /> : <WifiOff size={16} className="c-orange" />} right={<Badge tone={installed === models.length && models.length ? "teal" : "orange"}>{installed === models.length && models.length ? "Sẵn sàng" : "Thiếu thành phần"}</Badge>}>
            <div className="small t2">Mọi xử lý chạy trên máy này. Chỉ thao tác “Download from Approved Source” cần Internet. Khả năng offline phụ thuộc các mô hình đã cài và kiểm tra thành công ở trên.</div>
          </Card>
          <InfoNote>Mô hình không cài được sẽ có thông báo rõ và chức năng liên quan tự hạ cấp (fallback) thay vì dừng toàn bộ dây chuyền.</InfoNote>
        </div>
      </div>

      <Modal
        open={confirmDl}
        onClose={() => setConfirmDl(false)}
        title="Tải Whisper từ nguồn đã duyệt"
        footer={<><Btn kind="ghost" onClick={() => setConfirmDl(false)}>Huỷ</Btn><Btn kind="primary" icon={<Download size={15} />} onClick={startDownload}>Xác nhận tải (~{WHISPER_MB} MB)</Btn></>}
      >
        <div className="kv">
          <span>Model</span><span>whisper.cpp · ggml-large-v3-turbo-q5_0.bin (MIT)</span>
          <span>Nguồn</span><span className="mono" style={{ wordBreak: "break-all" }}>{whisper?.download_url || "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"}</span>
          <span>Dung lượng</span><span>~{WHISPER_MB} MB</span>
          <span>Lưu vào</span><span className="mono" style={{ wordBreak: "break-all" }}>{q.data?.models_dir || "—"}</span>
        </div>
        <div className="mt12"><InfoNote>Cần kết nối Internet. Sau khi tải, hệ thống tính checksum sha256 và ghi vào registry + nhật ký hoạt động.</InfoNote></div>
        {whisper && !whisper.cli && <div className="mt8 small c-orange">Lưu ý: chưa tìm thấy công cụ whisper-cli; ASR chỉ hoạt động khi có cả CLI và model.</div>}
      </Modal>
    </>
  );
}

function ModelCard({ m, dl, onDownload }: { m: any; dl?: any; onDownload: () => void }) {
  const k = KIND[m.kind] || { label: m.kind, icon: <Cpu size={18} />, color: "#8b6cff" };
  const downloading = (m.kind === "asr" || m.kind === "tts") && dl?.running;
  const piperMissing = m.kind === "tts" && m.can_download_piper && !(m.piper_voices || []).length;
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: `${k.color}22`, color: k.color, flexShrink: 0 }}>{k.icon}</div>
        <div className="grow">
          <div className="xs muted ellipsis">{m.title}</div>
          <div className="semi ellipsis" title={m.model_name}>{m.model_name}</div>
          <div className="xs t2">{m.provider}</div>
        </div>
        {m.installed ? (
          <Badge tone="teal" icon={<CheckCircle2 size={12} />}>Đã cài đặt</Badge>
        ) : downloading ? (
          <Badge tone="cyan">Đang tải</Badge>
        ) : (
          <Badge tone="orange" icon={<AlertTriangle size={12} />}>Chưa cài</Badge>
        )}
      </div>
      <div className="grid g2 mt12 xs t2" style={{ gap: 6 }}>
        <span>Dung lượng: <b className="c-primary">{m.size_gb ? `${m.size_gb} GB` : "—"}</b></span>
        <span>Backend: <b>{m.backend}</b></span>
        <span className="ellipsis" title={m.license}>License: <b className="c-teal">{m.license}</b></span>
        {m.kind === "asr" && <span>whisper-cli: <b className={m.cli ? "c-teal" : "c-orange"}>{m.cli ? "có" : "thiếu"}</b></span>}
        {m.kind === "llm" && m.available && <span className="ellipsis" title={m.available.join(", ")}>Ollama: {m.available.length} model</span>}
      </div>
      {m.warning && <div className="xs c-orange mt8 row" style={{ gap: 5 }}><AlertTriangle size={12} />{m.warning}</div>}
      {m.note && <div className="xs muted mt8">{m.note}</div>}
      {m.kind === "llm" && !m.installed && <div className="xs c-orange mt8">Chưa có model trong Ollama – chạy `ollama pull {m.model_name}`; trong lúc đó dùng template engine.</div>}
      {m.kind === "asr" && (downloading || dl?.error) && (
        <div className="mt8">
          {downloading && <><div className="row between xs"><span>Đang tải ggml-large-v3-turbo-q5_0.bin</span><b>{Math.round((dl.progress || 0) * 100)}%</b></div><Bar value={(dl.progress || 0) * 100} thin tone="teal" style={{ marginTop: 4 }} /></>}
          {dl?.error && !downloading && <div className="xs c-red">Lỗi tải: {dl.error}</div>}
        </div>
      )}
      {m.kind === "tts" && (downloading || dl?.error) && (
        <div className="mt8">
          {downloading && <><div className="row between xs"><span>Đang tải giọng {dl.model}</span><b>{Math.round((dl.progress || 0) * 100)}%</b></div><Bar value={(dl.progress || 0) * 100} thin tone="teal" style={{ marginTop: 4 }} /></>}
          {dl?.error && !downloading && <div className="xs c-red">Lỗi tải: {dl.error}</div>}
        </div>
      )}
      {piperMissing && !downloading && (
        m.piper
          ? <Btn size="sm" kind="teal" className="mt8" icon={<Download size={13} />} onClick={onDownload}>Tải giọng Piper tiếng Việt (~{m.piper_size_mb} MB)</Btn>
          : <div className="xs c-orange mt8">Chưa cài Piper – chạy `scripts/install-linux.sh` (hoặc `.venv/bin/pip install piper-tts`) rồi mở lại app.</div>
      )}
      {m.kind === "asr" && !m.installed && !downloading && (
        <Btn size="sm" kind="teal" className="mt8" icon={<Download size={13} />} onClick={onDownload}>Tải từ nguồn đã duyệt (~{WHISPER_MB} MB)</Btn>
      )}
    </div>
  );
}

function LogConsole() {
  const [filter, setFilter] = useState("all");
  const act = useApi<any[]>("/activity", { limit: 50 }, 10000);
  const logs = useApi<{ lines: string[] }>("/system/logs", { name: "api", lines: 80 }, 10000);
  const rows = useMemo(() => {
    const a = (act.data || [])
      .filter((x) => filter !== "model" || /model|mô hình|whisper|ollama/i.test(x.message))
      .map((x) => ({ t: x.at as string, text: x.message as string, level: x.level as string }));
    return a.sort((x, y) => (x.t < y.t ? -1 : 1));
  }, [act.data, filter]);
  const color = (lv: string) => (lv === "error" ? "var(--red)" : lv === "warning" ? "var(--orange)" : "var(--text-2)");
  return (
    <Card
      title="Nhật ký kiểm tra & xác thực mô hình"
      icon={<Terminal size={16} className="c-primary" />}
      right={
        <>
          <Select value={filter} onChange={setFilter} options={[{ value: "all", label: "Hoạt động: tất cả" }, { value: "model", label: "Chỉ mô hình" }, { value: "api", label: "Log API (80 dòng)" }]} style={{ height: 30, width: 190 }} />
          <Btn size="sm" icon={<RefreshCw size={13} />} onClick={async () => { act.reload(); logs.reload(); return true; }}>Làm mới</Btn>
        </>
      }
    >
      <div className="inner mono" style={{ maxHeight: 220, overflow: "auto", fontSize: 11.5, lineHeight: 1.7, background: "#070b1c" }}>
        {filter === "api" ? (
          logs.error ? <ErrorBox error={logs.error} onRetry={logs.reload} /> : !logs.data ? <Loading /> : logs.data.lines.length ? logs.data.lines.map((l, i) => <div key={i} style={{ color: /error|exception/i.test(l) ? "var(--red)" : /warn/i.test(l) ? "var(--orange)" : undefined, whiteSpace: "pre-wrap" }}>{l}</div>) : <div className="muted">Chưa có log API.</div>
        ) : act.error ? (
          <ErrorBox error={act.error} onRetry={act.reload} />
        ) : !act.data ? (
          <Loading />
        ) : rows.length ? (
          rows.map((r, i) => (
            <div key={i} style={{ color: color(r.level) }}>
              <span className="muted">[{dt(r.t)}]</span> {r.text}
            </div>
          ))
        ) : (
          <div className="muted">Chưa có mục nhật ký{filter === "model" ? " về mô hình – bấm Test Inference để kiểm tra" : ""}.</div>
        )}
      </div>
    </Card>
  );
}
