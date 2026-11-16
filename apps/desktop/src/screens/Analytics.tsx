import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, BarChart3, Clock, Database, Download, Eye, FileSpreadsheet, Lightbulb, LinkIcon, MousePointerClick, Plus, PlayCircle, Unplug, Upload,
} from "lucide-react";
import { api, ApiError, useApi } from "../lib/api";
import { num } from "../lib/format";
import { useApp } from "../lib/store";
import { useVariants, VariantSelect } from "../components/pickers";
import { Async, Badge, Btn, Card, Empty, Field, InfoNote, Kpi, Modal, NeedProject, PageHead, Select, Thumb } from "../components/ui";
import { AreaChart, HBars } from "../components/charts";

const PLATFORMS = [
  { value: "", label: "Tất cả nền tảng" },
  { value: "tiktok", label: "TikTok" },
  { value: "reels", label: "Instagram Reels" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube Shorts" },
  { value: "other", label: "Khác" },
];

const TEMPLATE =
  "code,platform,date,views,watch_time,hold_3s,completion,ctr,conversions,post_url\n" +
  "V-0001,tiktok,2026-11-01,0,0,,,,,https://\n";

const sec = (v?: number | null) => (v === null || v === undefined ? "—" : `${v.toFixed(1).replace(".", ",")} giây`);
const pctv = (v?: number | null) => (v === null || v === undefined ? "—" : `${v.toFixed(2).replace(".", ",")}%`);

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob(["﻿" + TEMPLATE], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "mau_hieu_suat.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Analytics() {
  const { projectId, campaign } = useApp();
  const [platform, setPlatform] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const q = useApi<any>(campaign ? "/analytics" : null, { campaign_id: campaign?.id, platform });

  return (
    <>
      <PageHead
        title="Phân tích hiệu quả sáng tạo"
        sub="Đánh giá hiệu suất nội dung, so sánh góc sáng tạo từ số liệu bạn nhập"
        icon={<BarChart3 size={22} />}
        actions={
          <>
            <div className="chip" style={{ cursor: "default" }}><Database size={14} className="c-cyan" /> Nguồn dữ liệu: CSV nhập thủ công</div>
            <div className="chip" style={{ cursor: "default" }}><Unplug size={14} className="c-red" /> Không kết nối nền tảng</div>
          </>
        }
      />
      <NeedProject projectId={projectId}>
        {!campaign ? (
          <Empty title="Dự án chưa có chiến dịch">Tạo chiến dịch và ma trận biến thể trước khi nhập số liệu hiệu suất.</Empty>
        ) : (
          <>
            <div className="card row wrap" style={{ alignItems: "flex-end", gap: 14 }}>
              <Field label="Nền tảng"><Select value={platform} onChange={setPlatform} options={PLATFORMS} style={{ width: 190 }} /></Field>
              <Field label="Chiến dịch"><div className="input row" style={{ width: 240 }}><span className="ellipsis">{campaign.name}</span></div></Field>
              <div className="row" style={{ marginLeft: "auto" }}>
                <Btn icon={<Download size={15} />} onClick={downloadTemplate}>Tải CSV mẫu</Btn>
                <Btn icon={<Plus size={15} />} onClick={() => setManualOpen(true)}>Nhập thủ công</Btn>
                <Btn kind="primary" icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>Nhập CSV hiệu suất</Btn>
              </div>
            </div>
            <div className="mt16">
              <Async q={q}>
                {(d) =>
                  !d.totals?.published ? (
                    <Empty title={platform ? "Chưa có số liệu cho nền tảng này" : "Chưa có số liệu hiệu suất"}
                      action={<div className="row" style={{ justifyContent: "center", gap: 10 }}>
                        <Btn icon={<Download size={15} />} onClick={downloadTemplate}>Tải CSV mẫu</Btn>
                        <Btn kind="primary" icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>Nhập CSV hiệu suất</Btn>
                      </div>}>
                      Ứng dụng không kết nối API của TikTok/Facebook/YouTube. Hãy xuất số liệu từ trang quản trị nền tảng, điền vào CSV mẫu
                      (cột <span className="mono">code</span> là mã biến thể, ví dụ V-0001) rồi nhập vào đây, hoặc nhập thủ công từng bài đăng.
                    </Empty>
                  ) : (
                    <Dashboard d={d} />
                  )
                }
              </Async>
            </div>
            <div className="mt16"><Learnings /></div>
          </>
        )}
      </NeedProject>
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={q.reload} />
      {manualOpen && <ManualModal onClose={() => setManualOpen(false)} onDone={q.reload} />}
    </>
  );
}

function Dashboard({ d }: { d: any }) {
  const vq = useVariants(undefined, 0);
  const vmap = useMemo(() => new Map<string, any>((vq.data?.items || []).map((v: any) => [v.id, v])), [vq.data]);
  const t = d.totals;
  const daily: any[] = d.daily || [];
  const byAngle: any[] = d.by_angle || [];
  const top: any[] = d.top || [];
  const totalViews = t.views || 0;

  // Insight: chỉ nêu sự kiện tính từ dữ liệu
  const facts: string[] = [];
  if (byAngle.length && totalViews) {
    const a = byAngle[0];
    facts.push(`Góc “${a.label}” có tổng lượt xem cao nhất: ${num(a.views)} (${Math.round(((a.views || 0) / totalViews) * 100)}% tổng lượt xem, ${a.n} video).`);
  }
  const ctrAngles = byAngle.filter((a) => a.ctr !== null && a.ctr !== undefined);
  if (ctrAngles.length >= 2) {
    const best = [...ctrAngles].sort((a, b) => b.ctr - a.ctr)[0];
    facts.push(`CTR trung bình cao nhất thuộc góc “${best.label}”: ${pctv(best.ctr)}.`);
  }
  const watchAngles = byAngle.filter((a) => a.watch !== null && a.watch !== undefined);
  if (watchAngles.length >= 2) {
    const best = [...watchAngles].sort((a, b) => b.watch - a.watch)[0];
    facts.push(`Thời gian xem trung bình dài nhất: góc “${best.label}” (${sec(best.watch)}).`);
  }
  if (top[0]) facts.push(`Video có nhiều lượt xem nhất: ${top[0].code} (${num(top[0].views)} lượt).`);
  if (daily.length) facts.push(`Dữ liệu trải trên ${daily.length} ngày (${daily[0].d} → ${daily[daily.length - 1].d}).`);

  return (
    <>
      <div className="grid g4">
        <Kpi icon={<PlayCircle size={22} />} value={num(t.published)} label="Video đã đăng (có số liệu)" />
        <Kpi icon={<Eye size={22} />} value={num(t.views)} label="Lượt xem" tone="cyan" />
        <Kpi icon={<Clock size={22} />} value={sec(t.watch)} label="Thời gian xem TB" tone="teal" />
        <Kpi icon={<MousePointerClick size={22} />} value={pctv(t.ctr)} label="CTR trung bình" tone="orange" />
      </div>

      <div className="grid mt16" style={{ gridTemplateColumns: "1.3fr 1fr 1fr" }}>
        <Card title="Hiệu suất theo ngày" sub="Tổng lượt xem theo ngày ghi nhận">
          {daily.length ? (
            <>
              <AreaChart series={[daily.map((x) => x.views || 0)]} labels={daily.map((x) => (x.d || "").slice(5).split("-").reverse().join("/"))} height={200} />
              <div className="row small t2 mt8"><span className="legend-dot" style={{ background: "#8b6cff" }} /> Lượt xem · {daily.reduce((a, x) => a + (x.posts || 0), 0)} lượt ghi nhận video</div>
            </>
          ) : <div className="small muted">Không có ngày nào có số liệu.</div>}
        </Card>
        <Card title="Hiệu quả theo góc sáng tạo" sub="Tổng lượt xem">
          {byAngle.length ? (
            <HBars data={byAngle.map((a) => ({ label: a.label || a.angle || "—", value: a.views || 0 }))} format={(v) => num(v)} />
          ) : <div className="small muted">Chưa có dữ liệu.</div>}
        </Card>
        <Card title="Giữ chân người xem" icon={<Activity size={16} className="c-teal" />}>
          <Empty title="Không có đường cong giữ chân">
            Đường cong giữ chân theo giây chỉ có trong trang quản trị nền tảng và không được nhập vào ứng dụng.
            Cột <span className="mono">hold_3s</span> / <span className="mono">completion</span> trong CSV được lưu nhưng API phân tích hiện chưa tổng hợp chúng.
          </Empty>
        </Card>
      </div>

      <div className="grid mt16" style={{ gridTemplateColumns: "1.3fr 1fr 1fr" }}>
        <Card title="Top concept hiệu quả" sub="Theo tổng lượt xem">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>#</th><th>Concept / Video</th><th>Góc</th><th className="right">Lượt xem</th><th className="right">Xem TB</th><th className="right">CTR</th></tr></thead>
              <tbody>
                {top.map((r, i) => {
                  const v = vmap.get(r.id);
                  const thumb = v?.export?.manifest_json?.thumbnail || v?.qc?.checks_json?.preview?.thumbnail;
                  return (
                    <tr key={r.id}>
                      <td className="bold">{i + 1}</td>
                      <td>
                        <div className="row">
                          <Thumb src={thumb} ratio="9/16" style={{ width: 30 }} />
                          <div style={{ minWidth: 0 }}><div className="semi ellipsis" style={{ maxWidth: 200 }}>{v?.script?.title || r.code}</div><div className="xs muted">{r.code}</div></div>
                        </div>
                      </td>
                      <td><Badge tone="purple">{r.label || "—"}</Badge></td>
                      <td className="right">{num(r.views)}</td>
                      <td className="right">{sec(r.watch)}</td>
                      <td className="right">{pctv(r.ctr)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <AbTest top={top} vmap={vmap} />
        <Card title="Nhận định từ dữ liệu" icon={<Lightbulb size={16} className="c-orange" />}>
          {facts.length ? (
            <ul className="small t2" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {facts.map((f) => <li key={f}>{f}</li>)}
            </ul>
          ) : <div className="small muted">Chưa đủ dữ liệu để rút ra nhận định.</div>}
          <div className="mt12"><InfoNote>Tương quan ≠ nhân quả. {d.note}</InfoNote></div>
        </Card>
      </div>
    </>
  );
}

function AbTest({ top, vmap }: { top: any[]; vmap: Map<string, any> }) {
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");
  useEffect(() => {
    if (top.length >= 2) {
      if (!top.some((x) => x.id === a)) setA(top[0].id);
      if (!top.some((x) => x.id === b)) setB(top[1].id);
    }
  }, [top, a, b]);
  if (top.length < 2) {
    return <Card title="A/B Test – So sánh biến thể"><div className="small muted">Cần số liệu của ít nhất 2 biến thể để so sánh.</div></Card>;
  }
  const ra = top.find((x) => x.id === a);
  const rb = top.find((x) => x.id === b);
  const opts = top.map((x) => ({ value: x.id, label: `${x.code} · ${x.label || ""}` }));
  const rows: Array<[string, (r: any) => number | null, (v: number | null) => string]> = [
    ["Lượt xem", (r) => r?.views ?? null, (v) => num(v)],
    ["Thời gian xem TB", (r) => r?.watch ?? null, (v) => sec(v)],
    ["CTR", (r) => r?.ctr ?? null, (v) => pctv(v)],
  ];
  const side = (r: any, val: string, set: (v: string) => void, label: string, color: string) => {
    const v = r ? vmap.get(r.id) : null;
    return (
      <div className="col center" style={{ gap: 6, flex: 1 }}>
        <Badge tone={color as any}>{label}</Badge>
        <Thumb src={v?.export?.manifest_json?.thumbnail || v?.qc?.checks_json?.preview?.thumbnail} ratio="1/1" style={{ width: 84, margin: "0 auto" }} />
        <Select value={val} onChange={set} options={opts} />
      </div>
    );
  };
  return (
    <Card title="A/B Test – So sánh biến thể" sub="So sánh số liệu đã nhập">
      <div className="row" style={{ alignItems: "flex-start" }}>
        {side(ra, a, setA, "Variant A", "purple")}
        <div className="bold c-primary" style={{ alignSelf: "center" }}>VS</div>
        {side(rb, b, setB, "Variant B", "teal")}
      </div>
      <table className="tbl mt12">
        <tbody>
          {rows.map(([label, get, fmt]) => {
            const va = get(ra), vb = get(rb);
            const win = va !== null && vb !== null && va !== vb ? (va > vb ? "a" : "b") : null;
            return (
              <tr key={label}>
                <td className="small muted">{label}</td>
                <td className={`right ${win === "a" ? "c-teal bold" : ""}`}>{fmt(va)}</td>
                <td className={`right ${win === "b" ? "c-teal bold" : ""}`}>{fmt(vb)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="xs muted mt8">Chỉ là chênh lệch quan sát, chưa kiểm định thống kê; phụ thuộc thời điểm đăng, phân phối và ngân sách.</div>
    </Card>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast, toastError, campaign } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<{ imported: number; unknown_codes: string[]; ambiguous_codes?: string[] } | null>(null);
  const close = () => { setFile(null); setRes(null); onClose(); };
  async function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (campaign?.id) fd.append("campaign_id", campaign.id);   // mã V-xxxx chỉ duy nhất trong một chiến dịch
    try {
      const r = await api.post<{ imported: number; unknown_codes: string[]; ambiguous_codes?: string[] }>("/metrics/import", fd);
      setRes(r);
      toast({ kind: r.imported ? "success" : "warn", title: `Đã nhập ${r.imported} dòng số liệu` });
      onDone();
      return true;
    } catch (e) {
      toastError(e, "Nhập CSV thất bại");
    }
  }
  return (
    <Modal open={open} onClose={close} title={<><FileSpreadsheet size={16} /> Nhập CSV hiệu suất</>} width={560}
      footer={<><button className="btn ghost" onClick={close}>Đóng</button><Btn kind="primary" icon={<Upload size={15} />} disabled={!file} onClick={submit}>Nhập dữ liệu</Btn></>}>
      <div className="small t2">
        Các cột: <span className="mono">code, platform, date, views, watch_time, hold_3s, completion, ctr, conversions, post_url</span>.
        <br /><span className="mono">code</span> = mã biến thể (V-0001…), <span className="mono">date</span> dạng YYYY-MM-DD, <span className="mono">watch_time</span> tính bằng giây,
        <span className="mono"> ctr / hold_3s / completion</span> nhập theo % (ví dụ 4.7).
      </div>
      <div className="row mt12">
        <Btn size="sm" icon={<Download size={14} />} onClick={downloadTemplate}>Tải CSV mẫu</Btn>
      </div>
      <div className="dropzone mt12" onClick={() => ref.current?.click()}>
        <Upload size={22} className="c-primary" />
        <div className="semi">{file ? file.name : "Chọn tệp CSV"}</div>
        <div className="xs muted">UTF-8, có dòng tiêu đề</div>
        <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={(e) => { setFile(e.target.files?.[0] || null); setRes(null); }} />
      </div>
      {res && (
        <div className="mt12">
          <InfoNote>Đã nhập <b>{res.imported}</b> dòng.</InfoNote>
          {!!res.ambiguous_codes?.length && (
            <div className="warn-box small mt8">Bỏ qua {res.ambiguous_codes.length} mã trùng ở nhiều chiến dịch: {res.ambiguous_codes.slice(0, 20).join(", ")}</div>
          )}
          {res.unknown_codes.length > 0 && (
            <div className="warn-box small mt8">Bỏ qua {res.unknown_codes.length} dòng có mã không tồn tại: {res.unknown_codes.filter(Boolean).slice(0, 20).join(", ") || "(trống)"}</div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ManualModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast, toastError } = useApp();
  const vq = useVariants(undefined, 0);
  const items = vq.data?.items || [];
  const [f, setF] = useState<Record<string, string>>({ platform: "tiktok", date: new Date().toISOString().slice(0, 10) });
  const [vid, setVid] = useState<string | null>(null);
  useEffect(() => {
    if (!vid && items.length) setVid(items[0].id);
  }, [items, vid]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const numOrNull = (k: string) => (f[k] === undefined || f[k] === "" ? undefined : Number(f[k]));
  const invalid = ["views", "watch_time", "ctr", "hold_3s", "completion", "conversions"].some((k) => f[k] && isNaN(Number(f[k])));
  async function submit() {
    if (!vid) return;
    try {
      await api.post("/metrics", {
        variant_id: vid, platform: f.platform, post_url: f.post_url || null, captured_at: f.date || undefined,
        views: numOrNull("views") ?? 0, watch_time: numOrNull("watch_time") ?? 0, ctr: numOrNull("ctr") ?? null,
        hold_3s: numOrNull("hold_3s") ?? null, completion: numOrNull("completion") ?? null, conversions: numOrNull("conversions") ?? null,
      });
      toast({ kind: "success", title: "Đã lưu số liệu" });
      onDone();
      onClose();
      return true;
    } catch (e) {
      toastError(e, "Lưu số liệu thất bại");
    }
  }
  return (
    <Modal open onClose={onClose} title="Nhập số liệu thủ công" width={600}
      footer={<><button className="btn ghost" onClick={onClose}>Huỷ</button><Btn kind="primary" disabled={!vid || invalid} onClick={submit}>Lưu số liệu</Btn></>}>
      {vq.loading && !vq.data ? <div className="small muted">Đang tải biến thể…</div> : items.length === 0 ? (
        <Empty title="Chưa có biến thể nào trong chiến dịch" />
      ) : (
        <div className="grid g2" style={{ gap: 12 }}>
          <Field label="Biến thể"><VariantSelect items={items} value={vid} onChange={setVid} /></Field>
          <Field label="Nền tảng"><Select value={f.platform} onChange={(v) => setF((x) => ({ ...x, platform: v }))} options={PLATFORMS.slice(1)} /></Field>
          <Field label="Ngày ghi nhận"><input className="input" type="date" value={f.date || ""} onChange={set("date")} /></Field>
          <Field label={<><LinkIcon size={12} /> Link bài đăng</>}><input className="input" placeholder="https://…" value={f.post_url || ""} onChange={set("post_url")} /></Field>
          <Field label="Lượt xem"><input className="input" inputMode="numeric" value={f.views || ""} onChange={set("views")} /></Field>
          <Field label="Thời gian xem TB (giây)"><input className="input" inputMode="decimal" value={f.watch_time || ""} onChange={set("watch_time")} /></Field>
          <Field label="CTR (%)"><input className="input" inputMode="decimal" value={f.ctr || ""} onChange={set("ctr")} /></Field>
          <Field label="Chuyển đổi"><input className="input" inputMode="numeric" value={f.conversions || ""} onChange={set("conversions")} /></Field>
          <Field label="Giữ chân 3 giây (%)"><input className="input" inputMode="decimal" value={f.hold_3s || ""} onChange={set("hold_3s")} /></Field>
          <Field label="Xem hết (%)"><input className="input" inputMode="decimal" value={f.completion || ""} onChange={set("completion")} /></Field>
        </div>
      )}
      {invalid && <div className="small c-red mt8">Các ô số chỉ nhận giá trị số.</div>}
    </Modal>
  );
}


const DIM_LABEL: Record<string, string> = {
  hook: "Hook", angle: "Góc", audience: "Khán giả", narrative: "Kết cấu", format: "Bố cục", duration: "Thời lượng", voice_rate: "Tốc độ giọng", music: "Nhạc",
};
const KPI_OPTS = [
  { value: "ctr", label: "CTR" },
  { value: "hold_3s", label: "Giữ chân 3 giây" },
  { value: "completion", label: "Xem hết" },
  { value: "views", label: "Lượt xem" },
  { value: "conversions", label: "Chuyển đổi" },
];
const lift = (v?: number | null) => (v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
const fmtMean = (v?: number | null) => (v === null || v === undefined ? "—" : String(Math.round(v * 100) / 100).replace(".", ","));

function Learnings() {
  const { campaign, toast, toastError } = useApp();
  const [kpi, setKpi] = useState("ctr");
  const [target, setTarget] = useState("20");
  const [explore, setExplore] = useState("0.2");
  const [err, setErr] = useState<ApiError | null>(null);
  const q = useApi<any>(campaign?.id ? `/campaigns/${campaign.id}/learnings` : null, { kpi });

  async function nextBatch() {
    if (!campaign?.id) return;
    setErr(null);
    const t = Math.max(1, Math.round(Number(target) || 20));
    const ex = Math.min(0.5, Math.max(0, Number(explore) || 0));
    try {
      const r = await api.post<any>(`/campaigns/${campaign.id}/variants/next-batch`, { target: t, kpi, explore: ex, use_llm: true });
      const w: string[] = r.warnings || [];
      toast({
        kind: w.length ? "warn" : "success",
        title: `Đã tạo ${r.created} biến thể (lô ${r.batch_no})`,
        body: `Hook thắng: ${(r.winning_hooks || []).length} · hook mới: ${(r.fresh_hooks || []).length}${w.length ? ` · ${w.join("; ")}` : ""}`,
      });
      return true;
    } catch (e) {
      const ae = e as ApiError;
      if (ae?.status === 422 && ae.body?.code === "NEED_MORE_SOURCE") {
        setErr(ae);
        toast({ kind: "warn", title: ae.body.message, code: ae.body.code, hint: ae.body.hint });
      } else toastError(e, "Không sinh được lô kế tiếp");
    }
  }

  return (
    <Card title="Yếu tố thắng → lô kế tiếp" icon={<Lightbulb size={16} className="c-orange" />} sub="Rút ra từ số liệu đã nhập để sinh lô biến thể tiếp theo"
      right={<Select value={kpi} onChange={setKpi} options={KPI_OPTS} style={{ width: 190 }} />}>
      {!campaign?.id ? (
        <InfoNote>Hãy chọn một chiến dịch để xem yếu tố thắng.</InfoNote>
      ) : (
        <Async q={q}>
          {(d) => {
            const dims = Object.entries(d.dimensions || {}) as Array<[string, any[]]>;
            const winners: any[] = d.winners || [];
            return (
              <>
                {!d.variants_with_data ? (
                  <Empty title="Chưa có biến thể nào có số liệu">
                    {d.note || "Hãy nhập CSV hiệu suất trước (nút “Nhập CSV hiệu suất” ở trên)."}
                  </Empty>
                ) : (
                  <>
                    <div className="small t2 mb8">
                      KPI: <b>{d.kpi_label || d.kpi}</b> · {d.variants_with_data} biến thể có số liệu · trung bình {fmtMean(d.mean)}
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", gap: 16, alignItems: "start" }}>
                      <div className="col" style={{ gap: 6 }}>
                        <div className="small semi">Yếu tố thắng</div>
                        {winners.length === 0 && <div className="xs muted">Chưa đủ dữ liệu để chọn yếu tố thắng.</div>}
                        {winners.map((w, i) => (
                          <div key={i} className="inner row" style={{ padding: "7px 10px" }}>
                            <Badge tone="purple">{DIM_LABEL[w.dimension] || w.dimension}</Badge>
                            <span className="grow small ellipsis" title={w.label}>{w.label || w.value}</span>
                            <span className="xs muted">n={w.n} · TB {fmtMean(w.mean)}</span>
                            <Badge tone={(w.lift ?? 0) >= 0 ? "teal" : "red"}>{lift(w.lift)}</Badge>
                          </div>
                        ))}
                      </div>
                      <div className="table-wrap">
                        <table className="tbl">
                          <thead><tr><th>Yếu tố</th><th>Giá trị (top 3)</th><th className="right">n</th><th className="right">TB</th><th className="right">Lift</th></tr></thead>
                          <tbody>
                            {dims.filter(([, rows]) => rows?.length).flatMap(([dim, rows]) =>
                              rows.slice(0, 3).map((r, i) => (
                                <tr key={`${dim}-${i}`}>
                                  <td className="small">{i === 0 ? DIM_LABEL[dim] || dim : ""}</td>
                                  <td className="small"><span className="ellipsis" style={{ display: "block", maxWidth: 220 }} title={r.label}>{r.label || r.value}</span></td>
                                  <td className="right small">{r.n}</td>
                                  <td className="right small">{fmtMean(r.mean)}</td>
                                  <td className={`right small ${(r.lift ?? 0) >= 0 ? "c-teal" : "c-red"}`}>{lift(r.lift)}</td>
                                </tr>
                              )),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="divider" />
                    <div className="row wrap" style={{ alignItems: "flex-end", gap: 14 }}>
                      <Field label="Số biến thể mục tiêu">
                        <input className="input" type="number" min={1} max={500} value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 110 }} />
                      </Field>
                      <Field label="Tỷ lệ khám phá hook mới" hint={`${Math.round((Number(explore) || 0) * 100)}% hook mới, còn lại dùng yếu tố thắng`}>
                        <div className="row">
                          <input type="range" min={0} max={0.5} step={0.05} value={explore} onChange={(e) => setExplore(e.target.value)} style={{ width: 160 }} />
                          <input className="input" type="number" min={0} max={0.5} step={0.05} value={explore} onChange={(e) => setExplore(e.target.value)} style={{ width: 80 }} />
                        </div>
                      </Field>
                      <Btn kind="primary" icon={<Plus size={15} />} onClick={nextBatch}>Sinh lô kế tiếp</Btn>
                    </div>
                    {err && (
                      <div className="warn-box small mt12">
                        <b>{err.body.message}</b>
                        {err.body.hint && <div className="mt8">{err.body.hint}</div>}
                      </div>
                    )}
                  </>
                )}
                {d.note && d.variants_with_data > 0 && <div className="xs muted mt12">{d.note}</div>}
              </>
            );
          }}
        </Async>
      )}
    </Card>
  );
}
