import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Clock, Copy, Download, Filter, Info, LayoutGrid, Lightbulb, Plus, Save, Search, Sparkles, Target, Users, Wand2, Layers, BookOpen, MonitorPlay,
} from "lucide-react";
import { api, ApiError, useApi } from "../lib/api";
import { VARIANT_STATUS } from "../lib/format";
import { useApp } from "../lib/store";
import { Async, Badge, Btn, Card, Empty, ErrorBox, InfoNote, Loading, Modal, NeedProject, PageHead, Toggle, VariantStatus, Warn } from "../components/ui";
import { Donut, PALETTE } from "../components/charts";
import { useVariants } from "../components/pickers";
import { MultiPick, Pager } from "../components/b_creative";

const PLATFORMS = [
  { value: "tiktok_9_16", label: "TikTok 9:16" },
  { value: "reels_9_16", label: "Reels 9:16" },
  { value: "shorts_9_16", label: "Shorts 9:16" },
];
const QC_DONE = ["APPROVED", "RENDERING", "COMPLETED"];
const PAGE = 8;

interface Form {
  target: number;
  audiences: string[];
  angles: string[];
  narratives: string[];
  durations: number[];
  formats: string[];
  platforms: string[];
  quota: number;
}

function formFrom(c: any): Form {
  const b = c.brief_json || {};
  const o = c.options;
  return {
    target: c.target_count || 10,
    audiences: b.audiences || Object.keys(o.audiences).slice(0, 2),
    angles: b.creative_angles || Object.keys(o.angles),
    narratives: b.narratives || Object.keys(o.narratives),
    durations: b.durations_sec || [30],
    formats: b.formats || ["full", "packshot_text"],
    platforms: b.platform_presets || ["tiktok_9_16"],
    quota: Number(b.quota_ratio ?? 0.25),
  };
}

const lsKey = (cid: string) => `avf.matrix.last.${cid}`;

export default function Matrix() {
  const { projectId, campaign } = useApp();
  return (
    <NeedProject projectId={projectId}>
      {campaign ? <MatrixInner cid={campaign.id} /> : <NoCampaign />}
    </NeedProject>
  );
}

function NoCampaign() {
  const nav = useNavigate();
  return (
    <>
      <PageHead title="Ma trận sáng tạo" sub="Kết hợp tri thức sản phẩm đã xác thực và tư liệu quay thật để tạo danh mục ý tưởng video đa dạng." icon={<LayoutGrid size={22} />} />
      <Empty title="Dự án chưa có chiến dịch" action={<Btn kind="primary" onClick={() => nav("/creative/strategy")}>Thiết lập chiến lược nội dung</Btn>}>
        Lập chiến lược nội dung trước để có brief cho ma trận.
      </Empty>
    </>
  );
}

function MatrixInner({ cid }: { cid: string }) {
  const nav = useNavigate();
  const { product, toast, toastError, reloadProject } = useApp();
  const cq = useApi<any>(`/campaigns/${cid}`);
  const all = useVariants(undefined, 6000);
  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const [last, setLast] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem(lsKey(cid)) || "null"); } catch { return null; }
  });
  const [axisModal, setAxisModal] = useState<null | keyof Form>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [useLlm, setUseLlm] = useState(true);
  const [queued, setQueued] = useState<number | null>(null);
  const [genErr, setGenErr] = useState<ApiError | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genTarget, setGenTarget] = useState(10);
  const [genNewBatch, setGenNewBatch] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [batchF, setBatchF] = useState("");

  // danh sách phân trang + lọc (server-side)
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [angleF, setAngleF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setQDeb(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const list = useApi<{ total: number; items: any[] }>(`/campaigns/${cid}/variants`, { q: qDeb, angle: angleF, status: statusF, page, size: PAGE }, 8000);

  useEffect(() => {
    if (cq.data && (!form || !dirty)) setForm(formFrom(cq.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cq.data]);

  const upd = (p: Partial<Form>) => { setForm((f) => (f ? { ...f, ...p } : f)); setDirty(true); };
  const c = cq.data;
  const items = all.data?.items || [];
  const batchOptions = useMemo(() => Array.from(new Set((list.data?.items || []).map((v) => v.batch_no).filter((b) => b !== undefined && b !== null))).sort((a: any, b: any) => a - b), [list.data]);

  async function save(silent = false) {
    if (!form || !c) return;
    const brief = {
      ...(c.brief_json || {}),
      audiences: form.audiences, creative_angles: form.angles, narratives: form.narratives,
      durations_sec: form.durations, formats: form.formats, platform_presets: form.platforms, quota_ratio: form.quota,
      product_id: c.brief_json?.product_id || product?.id,
    };
    try {
      const r = await api.put(`/campaigns/${cid}`, { target_count: form.target, brief_json: brief });
      cq.setData(r);
      setDirty(false);
      reloadProject();
      if (!silent) toast({ kind: "success", title: "Đã lưu cấu hình ma trận" });
      return true;
    } catch (e) {
      toastError(e, "Không lưu được cấu hình");
      throw e;
    }
  }

  function generate() {
    setGenErr(null);
    setGenTarget(form?.target || c?.target_count || 10);
    setGenNewBatch(false);
    setGenOpen(true);
  }

  async function doGenerate() {
    if (!genNewBatch) {
      const existing = items.filter((v) => v.status === "DRAFT" || v.status === "REJECTED").length;
      if (existing && !window.confirm(`Lập lại ma trận sẽ xoá ${existing} biến thể ở trạng thái Nháp/Bị từ chối và tạo kế hoạch mới. Tiếp tục?`)) return;
    }
    setGenErr(null);
    setGenBusy(true);
    try {
      if (dirty) await save(true);
      const target = Math.max(1, Math.min(1000, Math.round(genTarget) || 1));
      const r = await api.post(`/campaigns/${cid}/variants/generate`, { target, new_batch: genNewBatch });
      const rec = { ...r, at: new Date().toISOString() };
      setLast(rec);
      try { localStorage.setItem(lsKey(cid), JSON.stringify(rec)); } catch { /* bỏ qua */ }
      toast({ kind: "success", title: `Đã lập ${r.created} ý tưởng${r.batch_no ? ` · Lô ${r.batch_no}` : ""}`, body: `${r.feasible_count} tổ hợp khả thi / ${r.theoretical} lý thuyết` });
      (r.warnings || []).forEach((w: any) => toast({ kind: "warn", title: typeof w === "string" ? w : w.message || w.code, body: typeof w === "string" ? undefined : w.hint }));
      setGenOpen(false);
      all.reload(); list.reload(); cq.reload(); reloadProject();
      return true;
    } catch (e) {
      setGenErr(e as ApiError);
      if ((e as ApiError).body?.code !== "NEED_MORE_SOURCE") toastError(e, "Lập ma trận thất bại");
    } finally {
      setGenBusy(false);
    }
  }

  async function genScripts() {
    const n = items.filter((v) => v.status === "DRAFT" || v.status === "NEEDS_REVISION").length;
    if (!n) {
      toast({ kind: "warn", title: "Không có ý tưởng nào cần sinh kịch bản", body: "Chỉ biến thể Nháp / Cần chỉnh sửa được đưa vào hàng đợi." });
      return;
    }
    try {
      const r = await api.post(`/campaigns/${cid}/scripts/generate`, { use_llm: useLlm });
      setQueued(r.queued);
      toast({ kind: "success", title: `Đã đưa ${r.queued} kịch bản vào hàng đợi`, body: useLlm ? "AI local (Ollama) sinh ~20–60 giây/kịch bản" : "Template engine" });
      return true;
    } catch (e) {
      toastError(e, "Không tạo được kịch bản");
    }
  }

  const theoretical = form ? form.audiences.length * form.angles.length * form.narratives.length * form.durations.length * form.formats.length : 0;
  const qcDone = items.filter((v) => QC_DONE.includes(v.status)).length;
  const qcPending = items.filter((v) => v.status === "QC_PENDING").length;

  const stats = useMemo(() => (form && c ? computeStats(items, form, c) : null), [items, form, c]);
  const diversity = form ? Math.round(((0.6 - form.quota) / 0.45) * 100) : 0;

  if (cq.loading && !c) return <><Head /><Loading rows={6} /></>;
  if (cq.error && !c) return <><Head /><ErrorBox error={cq.error} onRetry={cq.reload} /></>;
  if (!c || !form) return null;
  const o = c.options;

  const axes: Array<{ key: keyof Form; label: string; icon: JSX.Element; n: number }> = [
    { key: "angles", label: "Góc sáng tạo", icon: <Target size={15} />, n: form.angles.length },
    { key: "audiences", label: "Phân khúc khách hàng", icon: <Users size={15} />, n: form.audiences.length },
    { key: "narratives", label: "Cấu trúc câu chuyện", icon: <BookOpen size={15} />, n: form.narratives.length },
    { key: "durations", label: "Thời lượng", icon: <Clock size={15} />, n: form.durations.length },
    { key: "formats", label: "Cách trình bày", icon: <MonitorPlay size={15} />, n: form.formats.length },
  ];

  return (
    <>
      <Head actions={<>
        {dirty && <Btn icon={<Save size={15} />} onClick={() => save()}>Lưu cấu hình</Btn>}
        <Btn kind="primary" icon={<Plus size={16} />} onClick={generate} disabled={!c.product} title={!c.product ? "Chiến dịch chưa gắn Product Brain" : undefined}>
          Tạo ma trận mới
        </Btn>
      </>} />

      {/* ---------------- thanh cấu hình */}
      <div className="card" style={{ display: "grid", gridTemplateColumns: "130px 1.1fr 1.1fr 1.2fr 1.2fr 1.5fr", gap: 14, alignItems: "end" }}>
        <label className="field">
          <span className="label">Tổng video mục tiêu</span>
          <input className="input" type="number" min={1} max={2000} value={form.target} onChange={(e) => upd({ target: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        <div className="field">
          <span className="label">Sản phẩm</span>
          <div className="select row" style={{ backgroundImage: "none", cursor: "pointer" }} title="Mở Product Brain" onClick={() => nav("/brain")}>
            <span className="ellipsis grow">{c.product?.name || "Chưa có sản phẩm"}</span>
            <span className="xs muted">{c.approved_claims} claim</span>
          </div>
        </div>
        <div className="field">
          <span className="label">Độ dài</span>
          <div className="seg">
            {(o.durations as number[]).map((d) => {
              const on = form.durations.includes(d);
              return (
                <button key={d} className={on ? "on" : ""} title="Chọn một hoặc nhiều độ dài"
                  onClick={() => upd({ durations: on ? (form.durations.length > 1 ? form.durations.filter((x) => x !== d) : form.durations) : [...form.durations, d].sort((a, b) => a - b) })}>
                  {d}s
                </button>
              );
            })}
          </div>
        </div>
        <div className="field">
          <span className="label">Nền tảng</span>
          <MultiPick value={form.platforms} options={PLATFORMS} allLabel="Tất cả nền tảng" onChange={(v) => upd({ platforms: v })} />
        </div>
        <div className="field">
          <span className="label">Khách hàng</span>
          <MultiPick value={form.audiences} allLabel="Tất cả phân khúc" options={Object.entries(o.audiences).map(([k, v]) => ({ value: k, label: String(v) }))} onChange={(v) => upd({ audiences: v })} />
        </div>
        <div className="field">
          <span className="label row between">Mức đa dạng sáng tạo <span className="xs muted">≤ {Math.round(form.quota * 100)}% mỗi góc</span></span>
          <div className="row" style={{ height: 38 }}>
            <input className="range" type="range" min={0} max={100} value={diversity} onChange={(e) => upd({ quota: Math.round((0.6 - (Number(e.target.value) / 100) * 0.45) * 100) / 100 })} />
            <b className="small" style={{ width: 70 }}>{diversity >= 67 ? "Cao" : diversity >= 34 ? "Trung bình" : "Thấp"}</b>
          </div>
        </div>
      </div>

      <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0, 1fr) 340px", alignItems: "start" }}>
        <div className="col" style={{ gap: 16 }}>
          {/* ---------------- cấu hình ma trận + flow */}
          <Card title="Cấu hình ma trận" sub="Bấm vào một trục để chọn giá trị">
            <div className="row" style={{ gap: 16, alignItems: "stretch" }}>
              <div className="inner col" style={{ gap: 4, width: 260, flexShrink: 0, padding: 8 }}>
                {axes.map((a) => (
                  <div key={a.key} className="row" style={{ padding: "6px 8px", borderRadius: 8, cursor: "pointer" }} onClick={() => setAxisModal(a.key)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(123,86,255,.1)")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                    <span className="c-primary">{a.icon}</span>
                    <span className="grow small">{a.label}</span>
                    <Badge tone="purple">{a.n}</Badge>
                  </div>
                ))}
              </div>
              <div className="grow col" style={{ justifyContent: "center" }}>
                <div className="row" style={{ gap: 10, alignItems: "stretch" }}>
                  <FlowBox title="Tổng hợp lý thuyết" value={theoretical.toLocaleString("vi-VN")} sub={last && last.theoretical !== theoretical ? `Lần lập gần nhất: ${last.theoretical}` : "Tích các trục đã chọn"} />
                  <ArrowRight className="muted" style={{ alignSelf: "center", flexShrink: 0 }} />
                  <FlowBox active title="Kế hoạch triển khai" value={items.length.toLocaleString("vi-VN")}
                    sub={last ? `${last.feasible_count} khả thi · loại ${last.rejected_count}` : `Mục tiêu ${form.target}`} />
                  <ArrowRight className="muted" style={{ alignSelf: "center", flexShrink: 0 }} />
                  <FlowBox title="Đã duyệt chất lượng" value={items.length ? `${qcDone}/${items.length}` : "—"}
                    sub={qcDone === 0 ? <Badge tone="orange">Chưa duyệt</Badge> : qcDone === items.length ? <Badge tone="teal">Đã duyệt đủ</Badge> : <Badge tone="cyan">{qcPending} chờ kiểm duyệt</Badge>} />
                </div>
                {last && Object.keys(last.rejected_reasons || {}).length > 0 && (
                  <div className="row wrap small" style={{ gap: 6 }}>
                    <span className="muted">Lý do loại:</span>
                    {Object.entries(last.rejected_reasons).map(([k, n]) => <Badge key={k} tone="orange">{k} · {String(n)}</Badge>)}
                  </div>
                )}
                <div className="row small muted" style={{ justifyContent: "center" }}>
                  <Info size={14} className="c-cyan" /> Biến thể kỹ thuật không đồng nghĩa với nội dung nguyên bản.
                </div>
              </div>
            </div>
          </Card>

          {/* ---------------- danh sách ý tưởng */}
          <Card title={`Danh sách ý tưởng (${(list.data?.total ?? 0).toLocaleString("vi-VN")} kế hoạch)`}
            right={<>
              <div className="search" style={{ margin: 0, maxWidth: 260, height: 32 }}>
                <Search size={14} />
                <input placeholder="Tìm theo mã, góc, khách hàng…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <select className="select" style={{ width: 150, height: 32 }} value={angleF} onChange={(e) => { setAngleF(e.target.value); setPage(1); }}>
                <option value="">Mọi góc</option>
                {Object.entries(o.angles).map(([k, a]: any) => <option key={k} value={k}>{a.label}</option>)}
              </select>
              <select className="select" style={{ width: 160, height: 32 }} value={statusF} onChange={(e) => { setStatusF(e.target.value); setPage(1); }}>
                <option value="">Mọi trạng thái</option>
                {Object.entries(VARIANT_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
              <select className="select" style={{ width: 150, height: 32 }} value={batchF} onChange={(e) => setBatchF(e.target.value)} title="Lọc phía client, chỉ trên trang hiện tại">
                <option value="">Mọi lô (trang này)</option>
                {batchOptions.map((b) => <option key={b} value={b}>Lô {b}</option>)}
              </select>
              {(angleF || statusF || q || batchF) && <button className="btn sm ghost" onClick={() => { setAngleF(""); setStatusF(""); setQ(""); setBatchF(""); }}><Filter size={13} /> Xoá lọc</button>}
            </>}>
            <Async q={list} empty={(d) => d.total === 0 && (
              items.length === 0 ? (
                <Empty title="Chưa có ý tưởng nào" action={<Btn kind="primary" icon={<Sparkles size={15} />} onClick={generate}>Lập ma trận ngay</Btn>}>
                  Cấu hình các trục bên trên rồi bấm “Tạo ma trận mới”. Nếu chưa có brief, hãy thiết lập ở <span className="link" onClick={() => nav("/creative/strategy")}>Chiến lược nội dung</span>.
                </Empty>
              ) : <Empty title="Không có ý tưởng khớp bộ lọc" />
            )}>
              {(d) => (
                <>
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead><tr><th>Concept ID</th><th>Audience</th><th>Hook / Angle</th><th>Format</th><th>Lô</th><th>Độc đáo</th><th>Source Coverage</th><th>Semantic Cluster</th><th>Trạng thái</th></tr></thead>
                      <tbody>
                        {d.items.filter((v) => !batchF || String(v.batch_no) === batchF).map((v) => {
                          const cov = v.concept_json.coverage;
                          const og = v.originality_json || {};
                          const hasOg = typeof og.score === "number";
                          const ogTone = !hasOg ? "gray" : og.pass === false ? "red" : og.score < (og.min ?? 0) + 0.15 ? "orange" : "teal";
                          const pc = (x: any) => (typeof x === "number" ? `${Math.round(x * 100)}%` : "—");
                          const voice = v.concept_json.voice;
                          const clusterSize = items.filter((x) => x.similarity_group && x.similarity_group === v.similarity_group).length;
                          return (
                            <tr key={v.id} style={{ cursor: "pointer" }} onClick={() => nav(`/creative/scripts?v=${v.id}`)} title="Mở trong Nhà máy kịch bản">
                              <td className="link">{v.code}</td>
                              <td>{v.audience_label}</td>
                              <td>
                                <div className="semi">{v.angle_label}</div>
                                <div className="xs muted ellipsis" style={{ maxWidth: 240 }}>{v.script?.hook || v.narrative_label}</div>
                              </td>
                              <td><div className="small">{v.format_label}</div><div className="xs muted">{v.concept_json.duration}s · {v.narrative_label}{voice?.rate ? ` · giọng ×${voice.rate}` : ""}</div></td>
                              <td>{v.batch_no !== undefined && v.batch_no !== null ? <Badge tone="purple">Lô {v.batch_no}</Badge> : <span className="muted">—</span>}</td>
                              <td title={hasOg ? `Chữ: ${pc(og.text)} · Hook: ${pc(og.hook)} · Hình: ${pc(og.visual)} · Âm thanh: ${pc(og.audio)}` : "Chưa có điểm độc đáo (chạy QC)"}>
                                {hasOg ? <Badge tone={ogTone as any}>{Math.round(og.score * 100)}%</Badge> : <span className="muted">—</span>}
                              </td>
                              <td className="small">{cov === undefined ? "—" : `Tư liệu ${Math.round(cov * 100)}%`}<div className="xs muted">Điểm {v.score ?? "—"}</div></td>
                              <td>{v.similarity_group ? <Badge tone={clusterSize > 1 ? "orange" : "purple"}>{v.similarity_group}{clusterSize > 1 ? ` · ${clusterSize}` : ""}</Badge> : <span className="muted">—</span>}</td>
                              <td><VariantStatus status={v.status} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="row between mt12">
                    <span className="small muted">Hiển thị {(page - 1) * PAGE + 1} – {Math.min(page * PAGE, d.total)} / {d.total} ý tưởng</span>
                    <Pager page={page} pages={Math.ceil(d.total / PAGE)} onPage={setPage} />
                  </div>
                </>
              )}
            </Async>
          </Card>
        </div>

        {/* ---------------- cột phải: độ phủ */}
        <Card title="Độ phủ đa dạng sáng tạo" sub="Tính từ các ý tưởng đã lập so với trục đã chọn">
          {!stats || items.length === 0 ? (
            <div className="small muted">Chưa có ý tưởng để tính độ phủ.</div>
          ) : (
            <>
              <div className="row" style={{ gap: 16 }}>
                <Donut data={stats.cov.map((x, i) => ({ label: x.label, value: Math.max(1, x.pct), color: PALETTE[i] }))} size={128} thickness={18}
                  center={<div><div className="bold" style={{ fontSize: 22 }}>{stats.overall}%</div><div className="xs muted">Độ phủ</div></div>} />
                <div className="chart-legend grow">
                  {stats.cov.map((x, i) => (
                    <div key={x.label} className="legend-row" title={`${x.used}/${x.total} giá trị được dùng`}><span className="legend-dot" style={{ background: PALETTE[i] }} />{x.label}<b>{x.pct}%</b></div>
                  ))}
                </div>
              </div>

              <div className="divider" />
              <div className="card-title" style={{ fontSize: 14 }}><AlertTriangle size={15} className="c-orange" /> Cảnh báo cụm ngữ nghĩa</div>
              <div className="col mt8" style={{ gap: 6 }}>
                {stats.warnings.length === 0 && <div className="small c-teal">Không phát hiện góc hoặc cụm nào vượt ngưỡng.</div>}
                {stats.warnings.map((w, i) => (
                  <div key={i} className="row small" style={{ alignItems: "flex-start" }}><span className="legend-dot" style={{ background: w.tone === "red" ? "var(--red)" : "var(--orange)", marginTop: 4 }} /><span className="t2">{w.text}</span></div>
                ))}
              </div>

              <div className="divider" />
              <div className="card-title" style={{ fontSize: 14 }}><Layers size={15} className="c-cyan" /> Khoảng trống độ phủ</div>
              <div className="col mt8" style={{ gap: 6 }}>
                {stats.gaps.length === 0 && <div className="small c-teal">Mọi giá trị đã chọn đều có ý tưởng.</div>}
                {stats.gaps.map((g, i) => <div key={i} className="small t2">› {g}</div>)}
              </div>

              <div className="divider" />
              <div className="card-title" style={{ fontSize: 14 }}><Lightbulb size={15} className="c-primary" /> Gợi ý mở rộng</div>
              <div className="xs muted mb8">Từ dữ liệu cảnh quay thật — chỉ góc có đủ footage mới được gợi ý.</div>
              <div className="col" style={{ gap: 6 }}>
                {stats.suggest.length === 0 && <div className="small muted">Đã dùng mọi góc khả thi.</div>}
                {stats.suggest.slice(0, 4).map((s) => (
                  <div key={s.key} className="inner row small" style={{ padding: "8px 10px" }}>
                    <span className="grow">Bổ sung góc “{s.label}” ({s.group})</span>
                    <button className="btn xs primary" title="Thêm vào trục Góc sáng tạo (cần lưu / lập lại ma trận)" onClick={() => upd({ angles: [...form.angles, s.key] })}><Plus size={12} /></button>
                  </div>
                ))}
                {stats.blocked.map((s) => (
                  <div key={s.key} className="small muted" title="Thiếu footage — quay bổ sung trước khi dùng góc này">✕ {s.label}: thiếu cảnh {s.missing.join(", ")}</div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {queued !== null && (
        <div className="mt16">
          <InfoNote>
            Đã đưa <b>{queued}</b> kịch bản vào hàng đợi {useLlm ? "(AI local – Ollama, ~20–60 giây mỗi kịch bản)" : "(template engine)"}.{" "}
            <span className="link" onClick={() => nav("/production/queue")}>Theo dõi ở Render Queue →</span>{" "}
            <span className="link" onClick={() => nav("/creative/scripts")}>Mở Nhà máy kịch bản →</span>
          </InfoNote>
        </div>
      )}

      <div className="sticky-bottom">
        <div className="row small t2">
          <Toggle on={useLlm} onChange={setUseLlm} purple /> Dùng AI local (Ollama) để viết kịch bản
        </div>
        <div className="spacer" style={{ marginLeft: "auto" }} />
        <Btn icon={<Copy size={15} />} onClick={() => setDupOpen(true)} disabled={!items.length} title={!items.length ? "Chưa có ý tưởng" : undefined}>Phát hiện ý tưởng trùng</Btn>
        <Btn kind="primary" icon={<Wand2 size={15} />} onClick={genScripts} disabled={!items.length} title={!items.length ? "Lập ma trận trước" : "Sinh kịch bản cho mọi ý tưởng Nháp / Cần chỉnh sửa"}>Tạo kịch bản</Btn>
        <a className="btn" href={`/api/v1/campaigns/${cid}/variants.csv`} download style={!items.length ? { pointerEvents: "none", opacity: 0.5 } : undefined}>
          <Download size={15} /> Xuất ma trận CSV
        </a>
      </div>

      <Modal open={genOpen} onClose={() => !genBusy && setGenOpen(false)} title="Tạo ma trận biến thể"
        footer={<><Btn onClick={() => setGenOpen(false)} disabled={genBusy}>Huỷ</Btn><Btn kind="primary" icon={<Sparkles size={15} />} loading={genBusy} onClick={doGenerate}>Tạo</Btn></>}>
        <label className="field">
          <span className="label">Số biến thể mục tiêu (tối đa 1000)</span>
          <input className="input" type="number" min={1} max={1000} value={genTarget} onChange={(e) => setGenTarget(Number(e.target.value))} />
        </label>
        <label className="row mt12" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" className="check" checked={genNewBatch} onChange={(e) => setGenNewBatch(e.target.checked)} />
          <span className="small">Thêm thành lô mới (giữ các biến thể hiện có)</span>
        </label>
        {genErr && genErr.body?.code === "NEED_MORE_SOURCE" && (
          <div className="mt12">
            <Warn title={genErr.body.message}>
              Cần {String((genErr.body.details as any)?.required?.assets ?? "?")} video / {String((genErr.body.details as any)?.required?.scenes ?? "?")} cảnh, hiện có {String((genErr.body.details as any)?.have?.assets ?? "?")} / {String((genErr.body.details as any)?.have?.scenes ?? "?")}.
              {genErr.body.hint ? ` ${genErr.body.hint}` : " Nhập thêm video nguồn hoặc giảm số biến thể mục tiêu."}
            </Warn>
          </div>
        )}
        {genErr && genErr.body?.code !== "NEED_MORE_SOURCE" && <div className="mt12"><ErrorBox error={genErr} /></div>}
      </Modal>

      <AxisModal axis={axisModal} form={form} c={c} onClose={() => setAxisModal(null)} onChange={(p) => upd(p)} />
      <DupModal open={dupOpen} onClose={() => setDupOpen(false)} items={items} />
    </>
  );
}

function Head({ actions }: { actions?: JSX.Element }) {
  return <PageHead title="Ma trận sáng tạo" icon={<LayoutGrid size={22} />} sub="Kết hợp tri thức sản phẩm đã xác thực và tư liệu quay thật để tạo danh mục ý tưởng video đa dạng, có định hướng." actions={actions} />;
}

function FlowBox({ title, value, sub, active }: { title: string; value: string; sub?: React.ReactNode; active?: boolean }) {
  return (
    <div className={`inner center grow ${active ? "" : ""}`} style={{ padding: "14px 10px", borderColor: active ? "var(--primary)" : undefined, background: active ? "rgba(123,86,255,.16)" : undefined, boxShadow: active ? "0 0 0 1px rgba(123,86,255,.3)" : undefined }}>
      <div className="small t2">{title}</div>
      <div className="bold" style={{ fontSize: 28, margin: "4px 0" }}>{value}</div>
      <div className="xs muted">{sub}</div>
    </div>
  );
}

function computeStats(items: any[], form: Form, c: any) {
  const o = c.options;
  const dims: Array<{ label: string; key: string; values: Array<string | number>; names: Record<string, string> }> = [
    { label: "Góc sáng tạo", key: "angle", values: form.angles, names: Object.fromEntries(Object.entries(o.angles).map(([k, a]: any) => [k, a.label])) },
    { label: "Phân khúc KH", key: "audience", values: form.audiences, names: o.audiences },
    { label: "Cấu trúc câu chuyện", key: "narrative", values: form.narratives, names: o.narratives },
    { label: "Thời lượng", key: "duration", values: form.durations, names: Object.fromEntries(form.durations.map((d) => [String(d), `${d}s`])) },
    { label: "Cách trình bày", key: "format", values: form.formats, names: o.formats },
  ];
  const cov = dims.map((d) => {
    const used = new Set(items.map((v) => String(v.concept_json[d.key])));
    const n = d.values.filter((x) => used.has(String(x))).length;
    return { label: d.label, used: n, total: d.values.length, pct: d.values.length ? Math.round((n / d.values.length) * 100) : 0, missing: d.values.filter((x) => !used.has(String(x))).map((x) => d.names[String(x)] || String(x)) };
  });
  const overall = Math.round(cov.reduce((a, x) => a + x.pct, 0) / cov.length);

  const warnings: Array<{ text: string; tone: "orange" | "red" }> = [];
  const byAngle: Record<string, number> = {};
  items.forEach((v) => { byAngle[v.concept_json.angle] = (byAngle[v.concept_json.angle] || 0) + 1; });
  Object.entries(byAngle).forEach(([k, n]) => {
    const share = n / items.length;
    if (share > form.quota + 1e-6) warnings.push({ tone: "orange", text: `Góc “${o.angles[k]?.label || k}” chiếm ${Math.round(share * 100)}% (khuyến nghị ≤ ${Math.round(form.quota * 100)}%)` });
  });
  const groups: Record<string, any[]> = {};
  items.forEach((v) => { if (v.similarity_group) (groups[v.similarity_group] ||= []).push(v); });
  Object.entries(groups).filter(([, vs]) => vs.length > 1).forEach(([g, vs]) => {
    warnings.push({ tone: vs.length / items.length > 0.3 ? "red" : "orange", text: `Cụm ${g}: ${vs.length} ý tưởng gần giống nhau (${vs.map((v) => v.code).join(", ")})` });
  });
  const highSim = items.filter((v) => (v.uniqueness_json?.max_similarity ?? 0) >= 0.6);
  if (highSim.length) warnings.push({ tone: "orange", text: `${highSim.length} kịch bản có độ tương đồng ≥ 60% với kịch bản khác` });
  const overflow = items.filter((v) => v.concept_json.quota_overflow).length;
  if (overflow) warnings.push({ tone: "orange", text: `${overflow} ý tưởng được thêm vượt hạn mức đa dạng để đủ mục tiêu` });

  const gaps: string[] = [];
  cov.forEach((x) => { if (x.missing.length) gaps.push(`Chưa có ý tưởng cho ${x.label.toLowerCase()}: ${x.missing.join(", ")}`); });
  if (items.length < form.target) gaps.push(`Mới lập ${items.length}/${form.target} ý tưởng so với mục tiêu`);

  const suggest = Object.entries(c.angle_coverage).filter(([k, a]: any) => a.feasible && !form.angles.includes(k)).map(([k, a]: any) => ({ key: k, label: a.label, group: a.group }));
  const blocked = Object.entries(c.angle_coverage).filter(([, a]: any) => !a.feasible).map(([k, a]: any) => ({ key: k, label: a.label, missing: a.missing as string[] }));
  return { cov, overall, warnings, gaps, suggest, blocked };
}

function AxisModal({ axis, form, c, onClose, onChange }: { axis: keyof Form | null; form: Form; c: any; onClose: () => void; onChange: (p: Partial<Form>) => void }) {
  if (!axis) return null;
  const o = c.options;
  let opts: Array<{ value: string; label: string; hint?: string; disabled?: boolean }> = [];
  let title = "";
  if (axis === "angles") {
    title = "Góc sáng tạo";
    opts = Object.entries(o.angles).map(([k, a]: any) => {
      const cv = c.angle_coverage[k];
      return { value: k, label: `${a.label} · ${a.group}`, hint: cv && !cv.feasible ? `thiếu ${cv.missing.join(", ")}` : undefined };
    });
  } else if (axis === "audiences") { title = "Phân khúc khách hàng"; opts = Object.entries(o.audiences).map(([k, v]) => ({ value: k, label: String(v) })); }
  else if (axis === "narratives") { title = "Cấu trúc câu chuyện"; opts = Object.entries(o.narratives).map(([k, v]) => ({ value: k, label: String(v) })); }
  else if (axis === "formats") { title = "Cách trình bày"; opts = Object.entries(o.formats).map(([k, v]) => ({ value: k, label: String(v) })); }
  else if (axis === "durations") { title = "Thời lượng"; opts = (o.durations as number[]).map((d) => ({ value: String(d), label: `${d} giây` })); }
  const cur = (axis === "durations" ? form.durations.map(String) : (form[axis] as string[])) || [];
  const set = (v: string[]) => onChange(axis === "durations" ? { durations: v.map(Number).sort((a, b) => a - b) } : { [axis]: v } as Partial<Form>);
  return (
    <Modal open onClose={onClose} title={`Trục: ${title}`} footer={<Btn kind="primary" onClick={onClose}>Xong</Btn>}>
      <div className="col" style={{ gap: 6 }}>
        {opts.map((op) => {
          const on = cur.includes(op.value);
          return (
            <label key={op.value} className={`list-item ${on ? "on" : ""}`}>
              <input type="checkbox" className="check" checked={on} disabled={on && cur.length <= 1} onChange={() => set(on ? cur.filter((x) => x !== op.value) : [...cur, op.value])} />
              <span className="grow">{op.label}</span>
              {op.hint && <Badge tone="orange">{op.hint}</Badge>}
            </label>
          );
        })}
      </div>
      <div className="xs muted mt12">Thay đổi có hiệu lực khi lưu cấu hình và lập lại ma trận. Góc thiếu footage sẽ bị loại với lý do NEED_MORE_SOURCE.</div>
    </Modal>
  );
}

function DupModal({ open, onClose, items }: { open: boolean; onClose: () => void; items: any[] }) {
  const nav = useNavigate();
  const groups = useMemo(() => {
    const g: Record<string, any[]> = {};
    items.forEach((v) => { if (v.similarity_group) (g[v.similarity_group] ||= []).push(v); });
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  }, [items]);
  const byId = Object.fromEntries(items.map((v) => [v.id, v]));
  const pairs = items.filter((v) => v.uniqueness_json?.nearest && (v.uniqueness_json.max_similarity ?? 0) >= 0.5)
    .sort((a, b) => b.uniqueness_json.max_similarity - a.uniqueness_json.max_similarity);
  const dup = groups.filter(([, vs]) => vs.length > 1);
  return (
    <Modal open={open} onClose={onClose} title="Phát hiện ý tưởng trùng" width={720}>
      <div className="small t2 mb12">Cụm ngữ nghĩa do backend gom (cosine unigram+bigram trên concept/kịch bản; ngưỡng 0,6 với kịch bản). Chỉ là chỉ số nội bộ.</div>
      <div className="card-title" style={{ fontSize: 14 }}>Cụm có nhiều hơn 1 ý tưởng ({dup.length})</div>
      <div className="col mt8" style={{ gap: 8 }}>
        {dup.length === 0 && <div className="small c-teal">Không có cụm trùng — mỗi ý tưởng thuộc một cụm riêng ({groups.length} cụm).</div>}
        {dup.map(([g, vs]) => (
          <div key={g} className="inner">
            <div className="row"><Badge tone="orange">{g}</Badge><span className="small muted">{vs.length} ý tưởng</span></div>
            <div className="row wrap mt8" style={{ gap: 6 }}>
              {vs.map((v) => <span key={v.id} className="chip" onClick={() => { onClose(); nav(`/creative/scripts?v=${v.id}`); }}>{v.code} · {v.angle_label} · {v.audience_label}</span>)}
            </div>
          </div>
        ))}
      </div>
      <div className="card-title mt16" style={{ fontSize: 14 }}>Cặp kịch bản tương đồng cao (≥ 50%)</div>
      <div className="col mt8" style={{ gap: 6 }}>
        {pairs.length === 0 && <div className="small muted">Chưa có cặp nào (cần kịch bản để so sánh).</div>}
        {pairs.map((v) => {
          const n = byId[v.uniqueness_json.nearest];
          return (
            <div key={v.id} className="row small inner" style={{ padding: "8px 10px" }}>
              <b>{v.code}</b> ↔ <b>{n?.code || v.uniqueness_json.nearest.slice(0, 8)}</b>
              <span className="grow muted">{v.angle_label}{n ? ` / ${n.angle_label}` : ""}</span>
              <Badge tone={v.uniqueness_json.max_similarity >= 0.7 ? "red" : "orange"}>{Math.round(v.uniqueness_json.max_similarity * 100)}%</Badge>
              {n && <button className="btn xs" onClick={() => { onClose(); nav(`/creative/scripts?v=${v.id}&cmp=${n.id}`); }}>So sánh</button>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
