import { ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, BookOpen, CheckCircle2, ClipboardCheck, Clock, Cpu, Factory, FileCheck2, FileText, Film, FolderOpen,
  Gauge, HelpCircle, History, Image, Layers, ListChecks, Pencil, Play, PlayCircle, Rocket, ShieldCheck, Sparkles,
  Star, UploadCloud, Wand2, XCircle,
} from "lucide-react";
import { api, useApi } from "../lib/api";
import { RIGHTS, bytes, duration as fmtDuration } from "../lib/format";
import { useApp } from "../lib/store";
import { useVariants } from "../components/pickers";
import { Badge, Bar, Btn, Card, Empty, Field, InfoNote, Kpi, Loading, Modal, NeedProject, PageHead, Select, Toggle, Warn } from "../components/ui";

const DONE_OR_READY = ["APPROVED", "RENDERING", "COMPLETED"];
const ANGLE_ICON: Record<string, ReactNode> = {
  faq: <HelpCircle size={18} />, qa: <HelpCircle size={18} />, how_to: <BookOpen size={18} />, tips: <Sparkles size={18} />,
  demo: <PlayCircle size={18} />, checklist: <ListChecks size={18} />, mistakes: <AlertTriangle size={18} />,
  comparison: <Layers size={18} />, feature: <Star size={18} />, brand_story: <Star size={18} />,
};
const ASPECTS = [
  { id: "9:16", label: "9:16", sub: "TikTok, Reels", w: 14, h: 24, res: "1080 × 1920" },
  { id: "1:1", label: "1:1", sub: "Social", w: 20, h: 20, res: "1080 × 1080" },
  { id: "16:9", label: "16:9", sub: "YouTube", w: 26, h: 15, res: "1920 × 1080" },
];
const SIM_THRESHOLD = 0.6; // ngưỡng gom cụm của backend (creative.cluster)

type Detail = { gaps: any[]; hasStoryboard: boolean };

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 10 }}>
      <div className="col" style={{ alignItems: "center", gap: 6 }}>
        <div className="step on"><span className="n">{n}</span></div>
        <div className="xs muted center" style={{ lineHeight: 1.3 }}>{title}</div>
      </div>
      <div className="col" style={{ gap: 10 }}>{children}</div>
    </div>
  );
}

function CheckCard({ state, title, children }: { state: "pass" | "warn" | "fail" | "loading"; title: string; children: ReactNode }) {
  const icon = state === "pass" ? <CheckCircle2 size={22} className="c-teal" /> : state === "warn" ? <AlertTriangle size={22} className="c-orange" /> : state === "fail" ? <XCircle size={22} className="c-red" /> : <Clock size={22} className="muted" />;
  return (
    <div className={state === "warn" ? "warn-box" : "inner"} style={{ display: "flex", gap: 10, alignItems: "flex-start", borderColor: state === "fail" ? "rgba(240,80,110,.5)" : undefined }}>
      {icon}
      <div><div className="semi small" style={{ color: "var(--text)" }}>{title}</div><div className="xs t2 mt8" style={{ marginTop: 4 }}>{children}</div></div>
    </div>
  );
}

export default function BatchSetup() {
  const nav = useNavigate();
  const { projectId, campaign, hw, toast, toastError, reloadProject } = useApp();
  const variants = useVariants();
  const camp = useApi<any>(campaign ? `/campaigns/${campaign.id}` : null);
  const assets = useApi<any[]>(projectId ? "/assets" : null, { project_id: projectId });
  const settings = useApi<any>("/settings");
  const bench = useApi<any>("/system/benchmark");
  const templates = useApi<any[]>("/templates");
  const brands = useApi<any>("/brands");
  const voices = useApi<any>("/voice/providers");
  const library = useApi<any[]>(projectId ? "/library" : null, { project_id: projectId });
  const productId = camp.data?.product?.id;
  const product = useApi<any>(productId ? `/products/${productId}` : null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [validatedAt, setValidatedAt] = useState<Date | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [priority, setPriority] = useState("5");
  const [blocked, setBlocked] = useState<Array<{ variant_id: string; score: number; nearest?: string }>>([]);

  const items: any[] = variants.data?.items || [];
  const idsKey = items.map((v) => `${v.id}:${v.status}`).join(",");

  // Lấy storyboard từng biến thể để biết thiếu tư liệu (gaps) — giới hạn 60 biến thể
  async function loadDetails() {
    const list = items.slice(0, 60);
    if (!list.length) return;
    setDetailsLoading(true);
    try {
      const res = await Promise.all(list.map((v) => api.get(`/variants/${v.id}`).catch(() => null)));
      const m: Record<string, Detail> = {};
      res.forEach((d, i) => {
        if (!d) return;
        const tl = d.storyboard?.timeline_json;
        m[list[i].id] = { gaps: tl?.gaps || [], hasStoryboard: !!tl };
      });
      setDetails(m);
    } finally {
      setDetailsLoading(false);
    }
  }
  useEffect(() => {
    loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Poll benchmark khi đang chạy
  useEffect(() => {
    if (!bench.data?.running) return;
    const t = setInterval(() => bench.reload(), 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bench.data?.running]);

  const s = settings.data;
  const brief = camp.data?.brief_json || {};
  const aspect = brief.aspect || "9:16";

  async function saveSetting(patch: Record<string, unknown>) {
    try {
      settings.setData(await api.put("/settings", patch));
      return true;
    } catch (e) {
      toastError(e, "Không lưu được cấu hình");
      return undefined;
    }
  }
  async function saveBrief(patch: Record<string, unknown>, msg?: string) {
    if (!campaign) return undefined;
    try {
      const next = { ...brief, ...patch };
      for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
      camp.setData(await api.put(`/campaigns/${campaign.id}`, { brief_json: next }));
      reloadProject();
      if (msg) toast({ kind: "success", title: msg });
      return true;
    } catch (e) {
      toastError(e, "Không lưu được chiến dịch");
      return undefined;
    }
  }

  // ---------------- số liệu
  const approvedScripts = items.filter((v) => v.script?.status === "approved").length;
  const readyVariants = items.filter((v) => DONE_OR_READY.includes(v.status)).length;
  const approvedForFinal = items.filter((v) => ["APPROVED", "FAILED", "COMPLETED"].includes(v.status)).length;
  const exported = items.filter((v) => v.export || v.status === "COMPLETED").length;
  const assetList = assets.data || [];
  const assetsReady = assetList.filter((a) => a.status === "analyzed").length;

  const benchRatio = useMemo(() => {
    const r = (bench.data?.results || []).filter((x: any) => x.ok && x.duration);
    if (!r.length) return null;
    return r.reduce((a: number, x: any) => a + x.seconds / x.duration, 0) / r.length; // giây render / giây video
  }, [bench.data]);
  const bytesPerSec = useMemo(() => {
    const ok = (library.data || []).filter((x) => x.exists && x.size_bytes && x.manifest_json?.duration_ms);
    if (!ok.length) return null;
    return ok.reduce((a, x) => a + x.size_bytes / (x.manifest_json.duration_ms / 1000), 0) / ok.length;
  }, [library.data]);
  const parallel = Math.max(1, Number(s?.parallel_jobs || 2));

  const groups = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of items) {
      const a = v.concept_json?.angle || "other";
      const g = m.get(a) || { angle: a, label: v.angle_label || a, group: camp.data?.angle_coverage?.[a]?.group, list: [] as any[] };
      g.list.push(v);
      m.set(a, g);
    }
    return [...m.values()].map((g) => {
      const ready = g.list.filter((v: any) => DONE_OR_READY.includes(v.status)).length;
      const secs = g.list.reduce((a: number, v: any) => a + (v.concept_json?.duration || 0), 0);
      const gaps = g.list.flatMap((v: any) => details[v.id]?.gaps || []);
      const noSb = g.list.filter((v: any) => details[v.id] && !details[v.id].hasStoryboard).length;
      const covMissing: string[] = camp.data?.angle_coverage?.[g.angle]?.missing || [];
      return { ...g, n: g.list.length, ready, pct: g.list.length ? (ready / g.list.length) * 100 : 0, secs, gaps, noSb, covMissing };
    }).sort((a, b) => b.n - a.n);
  }, [items, details, camp.data]);
  const totalSecs = groups.reduce((a, g) => a + g.secs, 0);

  // ---------------- kiểm tra sẵn sàng
  const claims: any[] = product.data?.claims || [];
  const claimApproved = claims.filter((c) => c.status === "approved").length;
  const claimPending = claims.filter((c) => c.status === "needs_review").length;
  const scriptFlags = items.reduce((a, v) => a + (v.script?.flags || 0), 0);
  const claimState: "pass" | "warn" | "fail" | "loading" = !product.data && productId ? "loading" : scriptFlags > 0 ? "fail" : claimPending > 0 || !claims.length ? "warn" : "pass";
  const badRights = assetList.filter((a) => !["own_footage", "licensed"].includes(a.rights));
  const rightsState = !assets.data ? "loading" : badRights.some((a) => a.rights === "unknown") ? "fail" : badRights.length ? "warn" : "pass";
  const similar = items.filter((v) => (v.uniqueness_json?.max_similarity ?? 0) >= SIM_THRESHOLD);
  const simState = !variants.data ? "loading" : similar.length ? "warn" : "pass";

  async function validate() {
    await Promise.all([variants.reload(), camp.reload(), assets.reload(), product.reload(), library.reload(), loadDetails()]);
    setValidatedAt(new Date());
    const issues = [claimState, rightsState, simState].filter((x) => x !== "pass").length;
    toast({ kind: issues ? "warn" : "success", title: issues ? `Còn ${issues} hạng mục cần xem lại` : "Tất cả kiểm tra đạt", body: `${approvedForFinal} biến thể đủ điều kiện render final.` });
    return true;
  }

  async function runBenchmark() {
    try {
      bench.setData(await api.post("/system/benchmark"));
      setTimeout(() => bench.reload(), 800);
      return true;
    } catch (e) {
      toastError(e, "Không chạy được benchmark");
      return undefined;
    }
  }

  async function createBatch() {
    if (!campaign) return undefined;
    try {
      const r = await api.post<any>("/render/batches", {
        campaign_id: campaign.id, idempotency_key: crypto.randomUUID(), priority: Number(priority), prefix, gpu: s?.gpu_accel !== false, kind: "final",
      });
      setBatchOpen(false);
      const bl: Array<{ variant_id: string; score: number; nearest?: string }> = r.blocked_originality || [];
      setBlocked(bl);
      toast({ kind: r.queued ? "success" : "warn", title: `Đã xếp ${r.queued} video vào hàng đợi render`, body: r.skipped_not_approved ? `Bỏ qua ${r.skipped_not_approved} biến thể chưa được duyệt (chỉ render final biến thể APPROVED).` : undefined });
      variants.reload();
      if (r.queued && !bl.length) nav("/production/queue");
      return true;
    } catch (e) {
      toastError(e, "Không tạo được hàng đợi render");
      return undefined;
    }
  }

  const live = hw?.live;
  const voiceOpts = (voices.data?.providers || []).flatMap((p: any) => (p.voices || []).map((vn: string) => ({ value: `${p.id}::${vn}`, label: `${vn} – ${p.name}${p.ready ? "" : " (chưa sẵn sàng)"}` })));
  const vd = s?.voice_default || {};
  const kits: any[] = brands.data?.kits || [];
  const hwEnc = (hw?.static?.hw_encoders || []).find((e: string) => e.startsWith("h264"));
  const durations: number[] = brief.durations_sec || [];
  const durOptions: number[] = camp.data?.options?.durations || [15, 30, 45];

  return (
    <>
      <PageHead
        title="Trung tâm sản xuất hàng loạt"
        icon={<Factory size={22} />}
        sub="Lập kế hoạch, cấu hình và tạo hàng đợi render hàng loạt trên máy tính (xử lý local)"
        actions={<Btn icon={<History size={16} />} onClick={() => nav("/production/queue")}>Xem lịch sử sản xuất</Btn>}
      />
      <NeedProject projectId={projectId}>
        {!campaign ? (
          <Empty title="Dự án chưa có chiến dịch" action={<Btn kind="primary" onClick={() => nav("/creative/strategy")}>Lập chiến lược sáng tạo</Btn>}>Tạo chiến dịch và ma trận biến thể trước khi sản xuất hàng loạt.</Empty>
        ) : (
          <>
            <div className="grid g4">
              <Kpi icon={<Layers size={22} />} value={variants.data ? variants.data.total : "…"} label={`Biến thể dự kiến${camp.data?.target_count ? ` · mục tiêu ${camp.data.target_count}` : ""}`} />
              <Kpi icon={<FileCheck2 size={22} />} tone="teal" value={variants.data ? approvedScripts : "…"} label="Kịch bản đã duyệt" />
              <Kpi icon={<Image size={22} />} tone="cyan" value={assets.data ? `${assetsReady}/${assetList.length}` : "…"} label="Tư liệu đã phân tích" />
              <Kpi icon={<UploadCloud size={22} />} tone="orange" value={variants.data ? exported : "…"} label="Đã xuất (final)" />
            </div>

            {blocked.length > 0 && (
              <div className="mt16">
                <Warn title={`${blocked.length} biến thể bị loại do điểm nguyên bản thấp`}>
                  Các biến thể này giống nội dung khác quá mức nên không được xếp vào hàng đợi. Sửa hook/cảnh/giọng rồi QC lại.
                  <div className="xs mt8 mono">{blocked.map((b) => `${b.variant_id.slice(0, 8)} (${Number(b.score).toFixed(2)})`).join(" · ")}</div>
                  <div className="mt8"><Btn size="sm" onClick={() => nav("/production/queue")}>Xem hàng đợi render</Btn></div>
                </Warn>
              </div>
            )}

            {variants.data && items.length === 0 && (
              <div className="mt16"><Empty title="Chưa có biến thể nào" action={<Btn kind="primary" onClick={() => nav("/creative/strategy")}>Sinh ma trận biến thể</Btn>}>Sinh ma trận ở bước Chiến lược sáng tạo, viết và duyệt kịch bản, dựng storyboard rồi quay lại đây.</Empty></div>
            )}

            <div className="grid mt16" style={{ gridTemplateColumns: "330px minmax(0, 1fr) 300px", alignItems: "start" }}>
              {/* ---------------- Thiết lập sản xuất */}
              <Card title="Thiết lập sản xuất" icon={<Wand2 size={16} className="c-primary" />}>
                {camp.loading && !camp.data ? <Loading rows={8} /> : (
                  <div className="col" style={{ gap: 16 }}>
                    <Step n={1} title="Cấu hình chung">
                      <Field label="Chiến dịch / Dự án">
                        <div className="input row" style={{ alignItems: "center" }} title="Chiến dịch của dự án đang chọn (đổi dự án ở thanh bên)"><Film size={14} className="muted" /><span className="ellipsis">{campaign.name}</span></div>
                      </Field>
                      <Field label="Thư viện video nguồn">
                        <div className="row">
                          <div className="input row grow" style={{ alignItems: "center" }}><FolderOpen size={14} className="muted" /><span className="ellipsis">{assets.data ? `${assetList.length} tư liệu · ${camp.data?.scene_count ?? 0} cảnh` : "…"}</span></div>
                          <Btn size="sm" onClick={() => nav("/media")}>Mở</Btn>
                        </div>
                      </Field>
                      <Field label="Kịch bản đã duyệt">
                        <div className="row">
                          <div className="input row grow" style={{ alignItems: "center" }}><FileText size={14} className="muted" />{approvedScripts} kịch bản</div>
                          <Btn size="sm" onClick={() => nav("/creative/scripts")}>Chọn…</Btn>
                        </div>
                      </Field>
                    </Step>
                    <Step n={2} title="Nguồn nội dung">
                      <Field label="Độ dài video đầu ra" hint="Áp dụng khi sinh lại ma trận biến thể">
                        <div className="seg">
                          {durOptions.map((d) => {
                            const on = durations.includes(d);
                            return (
                              <button key={d} className={on ? "on" : ""} title={on && durations.length === 1 ? "Cần giữ ít nhất 1 độ dài" : undefined}
                                onClick={() => { if (on && durations.length === 1) return; saveBrief({ durations_sec: on ? durations.filter((x) => x !== d) : [...durations, d].sort((a, b) => a - b) }); }}>{d}s</button>
                            );
                          })}
                        </div>
                      </Field>
                      <Field label="Giọng đọc / Audio preset">
                        {voiceOpts.length ? (
                          <Select value={`${vd.provider}::${vd.voice}`} onChange={(v) => { const [provider, voice] = v.split("::"); return saveSetting({ voice_default: { ...vd, provider, voice } }); }} options={voiceOpts} />
                        ) : <div className="input row muted" style={{ alignItems: "center" }}>{voices.loading ? "Đang tải…" : "Chưa có giọng TTS local"}</div>}
                      </Field>
                    </Step>
                    <Step n={3} title="Mẫu & Thương hiệu">
                      <Field label="Bộ template áp dụng">
                        <Select value={brief.template_id || ""} onChange={async (v) => {
                          if (!v) return saveBrief({ template_id: undefined }, "Dùng template tự động theo góc nội dung");
                          try { await api.post(`/campaigns/${campaign.id}/template`, { template_id: v }); camp.reload(); toast({ kind: "success", title: "Đã áp dụng template", body: "Có hiệu lực với storyboard dựng mới." }); } catch (e) { toastError(e); }
                        }} options={[{ value: "", label: "Tự động theo góc nội dung" }, ...(templates.data || []).map((t) => ({ value: t.id, label: `${t.name} (${t.category})` }))]} />
                      </Field>
                      <Field label="Bộ nhận diện thương hiệu">
                        <div className="row">
                          <Select value={brands.data?.active || ""} onChange={async (v) => {
                            try { brands.setData(await api.post(`/brands/${v}/activate`)); toast({ kind: "success", title: "Đã kích hoạt brand kit" }); } catch (e) { toastError(e); }
                          }} options={kits.length ? kits.map((k) => ({ value: k.id, label: k.name })) : [{ value: "", label: "Chưa có brand kit" }]} />
                          <button className="btn icon sm" title="Sửa brand kit" onClick={() => nav("/system/brand")}><Pencil size={14} /></button>
                        </div>
                      </Field>
                    </Step>
                    <Step n={4} title="Chất lượng & Xuất">
                      <Field label="Chất lượng render final" hint={`${ASPECTS.find((a) => a.id === aspect)?.res || ""} · 30 fps · AAC 160k`}>
                        <Select value={s?.gpu_accel === false ? "cpu" : "gpu"} onChange={(v) => saveSetting({ gpu_accel: v === "gpu" })}
                          options={[...(hwEnc ? [{ value: "gpu", label: `H.264 – ${hwEnc} (GPU)` }] : [{ value: "gpu", label: "GPU không khả dụng → CPU" }]), { value: "cpu", label: "H.264 – libx264 CRF 20 (CPU)" }]} />
                      </Field>
                      <Field label="Tỷ lệ khung hình (Aspect ratio)" hint="Áp dụng cho storyboard dựng mới; storyboard hiện có giữ khung cũ.">
                        <div className="grid g3" style={{ gap: 8 }}>
                          {ASPECTS.map((a) => (
                            <div key={a.id} className={`list-item ${aspect === a.id ? "on" : ""}`} style={{ flexDirection: "column", gap: 4, padding: 8 }}
                              onClick={() => aspect !== a.id && saveBrief({ aspect: a.id }, `Đã đặt khung hình ${a.id}`)}>
                              <div style={{ width: a.w, height: a.h, border: "2px solid currentColor", borderRadius: 3 }} />
                              <b className="small">{a.label}</b><span className="xs muted">{a.sub}</span>
                            </div>
                          ))}
                        </div>
                      </Field>
                    </Step>
                  </div>
                )}
              </Card>

              {/* ---------------- Ma trận sản xuất */}
              <div className="col" style={{ gap: 16 }}>
                <Card title="Ma trận sản xuất theo nhóm nội dung" icon={<Layers size={16} className="c-primary" />} sub="Nhóm theo góc nội dung · sẵn sàng = biến thể đã duyệt QC trở lên"
                  right={detailsLoading ? <Badge tone="gray">Đang kiểm tra storyboard…</Badge> : undefined}>
                  {variants.loading && !variants.data ? <Loading rows={5} h={26} /> : groups.length === 0 ? <div className="small muted">Chưa có biến thể để lập ma trận.</div> : (
                    <>
                      <div className="table-wrap">
                        <table className="tbl">
                          <thead><tr><th>Nhóm sản xuất</th><th className="center">Số lượng</th><th style={{ width: 150 }}>Mức sẵn sàng</th><th>Thiếu tài nguyên</th><th>Ước tính dung lượng</th><th>Ước tính render</th></tr></thead>
                          <tbody>
                            {groups.map((g) => {
                              const miss = g.gaps.length + g.noSb + g.covMissing.length;
                              const tip = [...g.gaps.map((x: any) => x.suggest_shot || x.message), ...(g.noSb ? [`${g.noSb} biến thể chưa có storyboard`] : []), ...(g.covMissing.length ? [`Thư viện thiếu cảnh: ${g.covMissing.join(", ")}`] : [])].join("\n");
                              return (
                                <tr key={g.angle} style={{ cursor: "pointer" }} onClick={() => nav(`/creative/matrix`)} title="Mở ma trận sáng tạo">
                                  <td><div className="row"><div className="kpi-icon" style={{ width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", background: "var(--primary-soft)", color: "var(--primary-2)" }}>{ANGLE_ICON[g.angle] || <Film size={18} />}</div><div><div className="semi">{g.label}</div><div className="xs muted">{g.group || "—"}</div></div></div></td>
                                  <td className="center bold">{g.n}</td>
                                  <td><div className="row small" style={{ gap: 6 }}><b style={{ minWidth: 36 }}>{Math.round(g.pct)}%</b><Bar value={g.pct} thin tone="teal" style={{ flex: 1 }} /></div><div className="xs muted">{g.ready}/{g.n} biến thể</div></td>
                                  <td title={tip || undefined}>{miss ? <Badge tone="orange" icon={<AlertTriangle size={11} />}>{miss} thiếu</Badge> : details[g.list[0]?.id] ? <Badge tone="teal" icon={<CheckCircle2 size={11} />}>Đủ</Badge> : <span className="xs muted">—</span>}</td>
                                  <td className="small" title={bytesPerSec ? "Theo bitrate trung bình các video final đã xuất" : "Chưa có video final để ước tính"}>{bytesPerSec ? `~ ${bytes(bytesPerSec * g.secs)}` : "—"}</td>
                                  <td className="small" title={benchRatio ? "Theo benchmark encode trên máy ÷ số job song song" : "Chạy benchmark để ước tính"}>{benchRatio ? `~ ${fmtDuration((benchRatio * g.secs) / parallel)}` : "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="inner mt12 grid g2" style={{ gap: 8 }}>
                        <div className="small">Tổng kế hoạch: <b>{items.length} video</b> · {fmtDuration(totalSecs)} nội dung</div>
                        <div className="small right">Dung lượng ước tính: <b>{bytesPerSec ? `~ ${bytes(bytesPerSec * totalSecs)}` : "chưa có dữ liệu"}</b></div>
                        <div className="small">Mức sẵn sàng chung: <b className="c-teal">{items.length ? Math.round((readyVariants / items.length) * 100) : 0}%</b> ({readyVariants}/{items.length})</div>
                        <div className="small right">Thời gian render ước tính: <b>{benchRatio ? `~ ${fmtDuration((benchRatio * totalSecs) / parallel)}` : "Chạy benchmark để ước tính"}</b></div>
                      </div>
                      {items.length > 60 && <div className="xs muted mt8">Kiểm tra storyboard giới hạn 60 biến thể đầu tiên.</div>}
                    </>
                  )}
                </Card>

                <Card title="Kiểm tra sẵn sàng trước khi sản xuất" icon={<ClipboardCheck size={16} className="c-primary" />} sub={validatedAt ? `Xác thực lúc ${validatedAt.toLocaleTimeString("vi-VN")}` : undefined}>
                  <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr)) 220px", gap: 10, alignItems: "stretch" }}>
                    <CheckCard state={claimState} title="Thông tin & tuyên bố sản phẩm">
                      {claimState === "loading" ? "Đang tải…" : scriptFlags > 0 ? `${scriptFlags} câu kịch bản bị gắn cờ claim — sửa trước khi render.` : `${claimApproved} claim đã duyệt có bằng chứng${claimPending ? `, ${claimPending} claim chờ duyệt` : ""}.${!claims.length ? " Chưa có claim nào." : ""}`}
                    </CheckCard>
                    <CheckCard state={rightsState} title="Quyền sử dụng tư liệu">
                      {rightsState === "loading" ? "Đang tải…" : badRights.length ? `${badRights.length} tư liệu ${badRights.map((a) => RIGHTS[a.rights]?.label || a.rights).filter((x, i, arr) => arr.indexOf(x) === i).join(", ").toLowerCase()}.` : `${assetList.length} tư liệu đều tự quay hoặc có giấy phép.`}
                    </CheckCard>
                    <CheckCard state={simState} title="Đánh giá trùng lặp sáng tạo">
                      {simState === "loading" ? "Đang tải…" : similar.length ? `${similar.length} biến thể có độ tương đồng kịch bản ≥ ${Math.round(SIM_THRESHOLD * 100)}% (${similar.map((v) => v.code).slice(0, 4).join(", ")}${similar.length > 4 ? "…" : ""}).` : "Không có cặp kịch bản trùng lặp cao."}
                    </CheckCard>
                    <div className="col" style={{ gap: 8 }}>
                      <Btn icon={<ShieldCheck size={16} />} onClick={validate}>Xác thực sự sẵn sàng</Btn>
                      <Btn kind="primary" size="lg" icon={<Play size={16} />} onClick={() => setBatchOpen(true)}>Tạo hàng đợi render</Btn>
                      <div className="xs muted center">{approvedForFinal} biến thể đủ điều kiện render final</div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* ---------------- Lập lịch & tài nguyên */}
              <div className="col" style={{ gap: 16 }}>
                <Card title="Lập lịch & tài nguyên" icon={<Cpu size={16} className="c-primary" />}>
                  <div className="col" style={{ gap: 9 }}>
                    {[
                      { l: "CPU", v: live?.cpu_pct, t: live ? `${Math.round(live.cpu_pct)}%` : "…", tone: "teal" },
                      { l: "GPU", v: null, t: "N/A", tone: "purple" },
                      { l: "RAM", v: live?.ram_pct, t: live ? `${live.ram_used_gb}/${live.ram_total_gb} GB` : "…", tone: "cyan" },
                    ].map((r) => (
                      <div key={r.l} style={{ display: "grid", gridTemplateColumns: "40px 1fr 90px", gap: 8, alignItems: "center" }} title={r.v === null ? "Hệ điều hành không cung cấp % GPU" : undefined}>
                        <span className="small t2">{r.l}</span><Bar value={r.v ?? 0} tone={r.tone} thin /><span className="small right">{r.t}</span>
                      </div>
                    ))}
                  </div>
                  <div className="divider" />
                  {!s ? <Loading rows={4} /> : (
                    <div className="col" style={{ gap: 12 }}>
                      <div className="row between">
                        <span className="small">Số tác vụ chạy song song</span>
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn xs icon" disabled={parallel <= 1} onClick={() => saveSetting({ parallel_jobs: parallel - 1 })} aria-label="Giảm">−</button>
                          <b style={{ minWidth: 20, textAlign: "center" }}>{parallel}</b>
                          <button className="btn xs icon" disabled={parallel >= Math.max(2, hw?.static?.cores_logical || 8)} onClick={() => saveSetting({ parallel_jobs: parallel + 1 })} aria-label="Tăng">+</button>
                        </div>
                      </div>
                      <Field label="Chế độ hiệu năng">
                        <Select value={s.performance_mode || "balanced"} onChange={(v) => saveSetting({ performance_mode: v })} options={[{ value: "eco", label: "Eco – tiết kiệm (1 job)" }, { value: "balanced", label: "Cân bằng (khuyến nghị)" }, { value: "turbo", label: "Turbo – tối đa hiệu suất" }]} />
                      </Field>
                      <Field label="Ưu tiên lô render">
                        <Select value={priority} onChange={setPriority} options={[{ value: "2", label: "Cao" }, { value: "5", label: "Bình thường" }, { value: "8", label: "Thấp" }]} />
                      </Field>
                      <Field label="Thư mục xuất video">
                        <div className="row">
                          <div className="input row grow small" style={{ alignItems: "center" }} title={s.paths?.output}><span className="ellipsis" style={{ direction: "rtl", textAlign: "left" }}>{s.paths?.output}</span></div>
                          <Btn size="sm" icon={<FolderOpen size={14} />} title="Mở thư mục" onClick={async () => { try { await api.post("/system/open-folder", { path: s.paths?.output }); return true; } catch (e) { toastError(e); return undefined; } }} />
                        </div>
                      </Field>
                      <div className="row between" title="Đã lưu nhưng worker chưa áp dụng tham số này">
                        <span className="small">Chu kỳ lưu checkpoint</span>
                        <Select value={String(s.checkpoint_minutes ?? 5)} onChange={(v) => saveSetting({ checkpoint_minutes: Number(v) })} style={{ width: 110, height: 30 }} options={[1, 5, 10, 15].map((m) => ({ value: String(m), label: `${m} phút` }))} />
                      </div>
                      <div className="row between" title="Worker tự thử lại job lỗi tối đa 3 lần (backoff); job dở dang được khôi phục khi khởi động lại">
                        <span className="small">Tự động tiếp tục khi lỗi</span><Toggle on disabled />
                      </div>
                      <div className="row between" title="Máy không cung cấp nhiệt độ; worker chưa áp dụng ngưỡng này">
                        <span className="small">Giới hạn nhiệt độ <span className="xs c-orange">(chưa áp dụng)</span></span>
                        <Select value={String(s.pause_temp_c ?? 85)} onChange={(v) => saveSetting({ pause_temp_c: Number(v) })} style={{ width: 90, height: 30 }} options={[75, 80, 85, 90].map((t) => ({ value: String(t), label: `${t}°C` }))} />
                      </div>
                    </div>
                  )}
                </Card>

                <Card title="Benchmark render" icon={<Gauge size={16} className="c-primary" />} right={<Btn size="sm" icon={<Rocket size={14} />} disabled={!!bench.data?.running} loading={!!bench.data?.running} onClick={runBenchmark}>{bench.data?.results?.length ? "Chạy lại" : "Run Benchmark"}</Btn>}>
                  {bench.loading && !bench.data ? <Loading rows={2} /> : !bench.data?.results?.length ? (
                    <div className="small muted">{bench.data?.running ? "Đang đo tốc độ encode 15/30/45 giây @1080×1920…" : "Chưa có benchmark. Chạy để ước tính thời gian render lô."}</div>
                  ) : (
                    <div className="col" style={{ gap: 6 }}>
                      {bench.data.results.map((r: any) => (
                        <div key={r.duration} className="row between small">
                          <span className="t2">{r.duration}s · {r.encoder}</span>
                          <span>{r.ok ? <><b>{String(r.seconds).replace(".", ",")} giây</b> <span className="muted">(×{String(r.speed).replace(".", ",")})</span></> : <span className="c-red">Lỗi</span>}</span>
                        </div>
                      ))}
                      {bench.data.running && <div className="xs muted">Đang chạy…</div>}
                      <div className="xs muted">Chỉ đo bước encode; render thật còn dựng cảnh + overlay nên lâu hơn.</div>
                    </div>
                  )}
                </Card>
              </div>
            </div>

            <Modal open={batchOpen} onClose={() => setBatchOpen(false)} title="Tạo hàng đợi render final"
              footer={<><Btn kind="ghost" onClick={() => setBatchOpen(false)}>Huỷ</Btn><Btn kind="primary" icon={<Play size={15} />} disabled={!approvedForFinal} title={approvedForFinal ? undefined : "Chưa có biến thể nào được duyệt QC"} onClick={createBatch}>Xếp {approvedForFinal} video vào hàng đợi</Btn></>}>
              <div className="col" style={{ gap: 12 }}>
                <div className="kv">
                  <span>Chiến dịch</span><b>{campaign.name}</b>
                  <span>Đủ điều kiện</span><b className="c-teal">{approvedForFinal} biến thể (APPROVED / lỗi trước đó / render lại)</b>
                  <span>Sẽ bỏ qua</span><span>{items.length - approvedForFinal} biến thể chưa duyệt</span>
                  <span>Encoder</span><span>{s?.gpu_accel === false ? "libx264 (CPU)" : hwEnc ? `${hwEnc} (GPU, tự chuyển CPU nếu lỗi)` : "libx264 (CPU)"}</span>
                  <span>Song song</span><span>{parallel} job · chế độ {s?.performance_mode || "balanced"}</span>
                  <span>Ước tính</span><span>{benchRatio ? `~ ${fmtDuration((benchRatio * items.filter((v) => ["APPROVED", "FAILED", "COMPLETED"].includes(v.status)).reduce((a, v) => a + (v.concept_json?.duration || 0), 0)) / parallel)}` : "Chạy benchmark để ước tính"}</span>
                </div>
                <Field label="Tiền tố tên file (tuỳ chọn)" hint="Ví dụ: T11_ → T11_V-0001.mp4">
                  <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/[\\/:*?"<>|]/g, ""))} placeholder="Không có" />
                </Field>
                <Field label="Ưu tiên">
                  <Select value={priority} onChange={setPriority} options={[{ value: "2", label: "Cao" }, { value: "5", label: "Bình thường" }, { value: "8", label: "Thấp" }]} />
                </Field>
                {!approvedForFinal && <InfoNote>Duyệt biến thể ở màn hình Kiểm duyệt trước — backend chỉ nhận biến thể APPROVED cho render final.</InfoNote>}
              </div>
            </Modal>
          </>
        )}
      </NeedProject>
    </>
  );
}

