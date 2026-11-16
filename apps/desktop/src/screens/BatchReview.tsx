import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowLeftRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Clapperboard, Download, FileText, Info,
  Layers, LayoutGrid, List, PenLine, RotateCcw, ShieldAlert, X,
} from "lucide-react";
import { api, fileUrl, useApi } from "../lib/api";
import { bytes, ms, VARIANT_STATUS } from "../lib/format";
import { useApp } from "../lib/store";
import { useVariants } from "../components/pickers";
import { Async, Badge, Btn, Card, Empty, Loading, Modal, NeedProject, PageHead, Thumb, VariantStatus } from "../components/ui";
import {
  CompareResult, compareVerdict, Decision, durationOf, qcChecks, qcWarnings, ReasonModal, StatusIcon, thumbOf, useDecide, videoOf,
} from "../components/d_review";

const PAGE_SIZE = 15;

export default function BatchReview() {
  const { projectId, campaign } = useApp();
  return (
    <>
      <PageHead icon={<Clapperboard size={24} />} title="Duyệt video hàng loạt" sub="Xem, đánh giá và phê duyệt các video đã được tạo theo chiến dịch" />
      <NeedProject projectId={projectId}>{campaign ? <BatchBody /> : <Loading rows={4} h={20} />}</NeedProject>
    </>
  );
}

function BatchBody() {
  const nav = useNavigate();
  const { project, product, toast, toastError } = useApp();
  const q = useVariants(undefined, 8000);
  const items: any[] = q.data?.items || [];
  const lib = useApi<any[]>(project?.id ? "/library" : null, { project_id: project?.id }, 15000);
  const sizeOf = useMemo(() => new Map((lib.data || []).map((r) => [r.variant_id, r.size_bytes as number])), [lib.data]);

  const [f, setF] = useState({ angle: "", group: "", status: "", duration: "", audience: "" });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [groupBy, setGroupBy] = useState(false);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<{ decision: Decision; ids: string[] } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [exported, setExported] = useState<{ folder: string; count: number } | null>(null);
  const { bulk } = useDecide(() => q.reload());

  const opts = useMemo(() => {
    const m = (fn: (v: any) => [string, string]) => Array.from(new Map(items.map(fn)).entries()).filter(([k]) => k !== undefined && k !== "undefined");
    return {
      angle: m((v) => [v.concept_json?.angle, v.angle_label]),
      group: m((v) => [v.similarity_group, v.similarity_group]),
      duration: m((v) => [String(v.concept_json?.duration), `${v.concept_json?.duration}s`]),
      audience: m((v) => [v.concept_json?.audience, v.audience_label]),
      status: m((v) => [v.status, VARIANT_STATUS[v.status]?.label || v.status]),
    };
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter(
        (v) =>
          (!f.angle || v.concept_json?.angle === f.angle) &&
          (!f.group || v.similarity_group === f.group) &&
          (!f.status || v.status === f.status) &&
          (!f.duration || String(v.concept_json?.duration) === f.duration) &&
          (!f.audience || v.concept_json?.audience === f.audience),
      ),
    [items, f],
  );
  const ordered = useMemo(
    () => (groupBy ? [...filtered].sort((a, b) => `${a.similarity_group}|${a.angle_label}|${a.code}`.localeCompare(`${b.similarity_group}|${b.angle_label}|${b.code}`)) : filtered),
    [filtered, groupBy],
  );
  const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  useEffect(() => { if (page > pages) setPage(1); }, [pages, page]);
  const pageItems = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (items.length && (!activeId || !items.some((v) => v.id === activeId))) setActiveId((items.find((v) => videoOf(v).src) || items[0]).id);
  }, [items, activeId]);
  const active = items.find((v) => v.id === activeId);

  const selItems = items.filter((v) => sel.has(v.id));
  const selIds = selItems.map((v) => v.id);
  const totalMs = selItems.reduce((a, v) => a + (durationOf(v).ms || 0), 0);
  const anyEstimated = selItems.some((v) => durationOf(v).estimated);
  const exportable = selItems.filter((v) => v.export);
  const allFiltered = filtered.length > 0 && filtered.every((v) => sel.has(v.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setFilter = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };

  async function approveSel() {
    const r = await bulk(selIds, "accept");
    if (r) setSel(new Set(r.errors.map((e: any) => e.variant_id)));
    return r;
  }
  async function exportSel() {
    try {
      const r = await api.post<{ folder: string; count: number }>("/exports", { variant_ids: exportable.map((v) => v.id) });
      setExported(r);
      toast({ kind: "success", title: `Đã xuất ${r.count} video`, body: r.folder });
      return r;
    } catch (e) {
      toastError(e, "Xuất video thất bại");
      return undefined;
    }
  }
  const exportTitle = !selIds.length ? "Chọn video trước" : !exportable.length ? "Chỉ xuất được video đã render final (Hoàn tất)" : selIds.length > exportable.length ? `${selIds.length - exportable.length} video chưa render final sẽ bị bỏ qua` : undefined;

  // Nhãn nhóm khi gom theo concept
  let lastGroup = "";

  return (
    <>
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 340px", alignItems: "start" }}>
      <div className="col" style={{ gap: 14, minWidth: 0 }}>
        {/* Bộ lọc */}
        <div className="card" style={{ padding: 12 }}>
          <div className="row wrap" style={{ gap: 10, alignItems: "flex-end" }}>
            <div className="field" style={{ minWidth: 140 }}>
              <span className="label">Sản phẩm</span>
              <select className="select" disabled value="p"><option value="p">{product?.name || "—"}</option></select>
            </div>
            <FSel label="Danh mục kịch bản" value={f.angle} onChange={(v) => setFilter("angle", v)} options={opts.angle} />
            <FSel label="Cụm tương đồng" value={f.group} onChange={(v) => setFilter("group", v)} options={opts.group} />
            <FSel label="Trạng thái" value={f.status} onChange={(v) => setFilter("status", v)} options={opts.status} />
            <FSel label="Độ dài" value={f.duration} onChange={(v) => setFilter("duration", v)} options={opts.duration} />
            <FSel label="Đối tượng" value={f.audience} onChange={(v) => setFilter("audience", v)} options={opts.audience} />
            <button className="btn" onClick={() => { setF({ angle: "", group: "", status: "", duration: "", audience: "" }); setPage(1); }}><RotateCcw size={14} /> Đặt lại</button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="row wrap" style={{ gap: 8 }}>
          <label className="btn" style={{ cursor: "pointer" }}>
            <input type="checkbox" className="check" checked={allFiltered} onChange={() => setSel(allFiltered ? new Set() : new Set(filtered.map((v) => v.id)))} />
            Chọn tất cả ({filtered.length})
          </label>
          <Btn icon={<ArrowLeftRight size={15} />} disabled={selIds.length !== 2} title={selIds.length !== 2 ? "Chọn đúng 2 video để so sánh" : undefined} onClick={() => setCompareOpen(true)}>So sánh ({selIds.length === 2 ? 2 : selIds.length})</Btn>
          <button className={`btn ${groupBy ? "primary" : ""}`} onClick={() => setGroupBy(!groupBy)} title="Gom theo cụm tương đồng / góc nội dung"><Layers size={15} /> Nhóm theo concept</button>
          <Btn kind="teal" icon={<Check size={15} />} disabled={!selIds.length} title={!selIds.length ? "Chọn video trước" : undefined} onClick={approveSel}>Phê duyệt</Btn>
          <Btn kind="orange" icon={<PenLine size={15} />} disabled={!selIds.length} title={!selIds.length ? "Chọn video trước" : undefined} onClick={() => setReasonFor({ decision: "revise", ids: selIds })}>Gửi chỉnh sửa</Btn>
          <Btn icon={<Download size={15} />} disabled={!exportable.length} title={exportTitle} onClick={exportSel}>Xuất video đã chọn</Btn>
          <div className="seg" style={{ marginLeft: "auto" }}>
            <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")} aria-label="Lưới"><LayoutGrid size={15} /></button>
            <button className={view === "list" ? "on" : ""} onClick={() => setView("list")} aria-label="Danh sách"><List size={15} /></button>
          </div>
        </div>

        {exported && (
          <div className="info-box small row">
            <CheckCircle2 size={15} className="c-teal" />
            <span className="grow ellipsis">Đã xuất {exported.count} video → <span className="mono">{exported.folder}</span></span>
            <Btn size="xs" onClick={() => api.post("/system/open-folder", { path: exported.folder }).then(() => true).catch((e) => { toastError(e); })}>Mở thư mục</Btn>
            <button className="btn xs ghost" onClick={() => setExported(null)} aria-label="Đóng"><X size={13} /></button>
          </div>
        )}

        <Async q={q} empty={(d) => d.items.length === 0 && (
          <Empty title="Chưa có video nào trong chiến dịch" action={<button className="btn primary" onClick={() => nav("/production/batch")}>Thiết lập sản xuất hàng loạt</button>}>
            Lập ma trận, sinh kịch bản và render preview để duyệt tại đây.
          </Empty>
        )}>
          {() =>
            pageItems.length === 0 ? (
              <Empty title="Không có video khớp bộ lọc" />
            ) : view === "grid" ? (
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {pageItems.map((v) => {
                  const head = groupBy && v.similarity_group !== lastGroup ? (lastGroup = v.similarity_group) : null;
                  return (
                    <div key={v.id} style={{ display: "contents" }}>
                      {head && <div className="small semi t2" style={{ gridColumn: "1 / -1", marginTop: 4 }}><Layers size={13} /> Cụm {head} · {filtered.filter((x) => x.similarity_group === head).length} video</div>}
                      <VideoCard v={v} checked={sel.has(v.id)} active={v.id === activeId} onCheck={() => toggle(v.id)} onOpen={() => setActiveId(v.id)} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th style={{ width: 34 }} /><th>Video</th><th>Góc / Đối tượng</th><th>Cụm</th><th>Thời lượng</th><th>QC</th><th>Trạng thái</th></tr></thead>
                  <tbody>
                    {pageItems.map((v) => {
                      const d = durationOf(v);
                      return (
                        <tr key={v.id} className={v.id === activeId ? "sel" : ""} style={{ cursor: "pointer" }} onClick={() => setActiveId(v.id)}>
                          <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="check" checked={sel.has(v.id)} onChange={() => toggle(v.id)} /></td>
                          <td><div className="row"><Thumb src={thumbOf(v)} ratio="9/16" style={{ width: 34 }} /><div><div className="semi">{v.code}</div><div className="xs t2 ellipsis" style={{ maxWidth: 240 }}>{v.script?.title || "—"}</div></div></div></td>
                          <td className="small">{v.angle_label}<div className="xs muted">{v.audience_label}</div></td>
                          <td><Badge tone="purple">{v.similarity_group || "—"}</Badge></td>
                          <td className="small">{d.ms ? `${d.estimated ? "~" : ""}${ms(d.ms)}` : "—"}</td>
                          <td>{v.qc ? <Badge tone={v.qc.severity === "critical" ? "red" : v.qc.severity === "warning" ? "orange" : "teal"}>{v.qc.severity === "critical" ? "Nghiêm trọng" : v.qc.severity === "warning" ? "Cảnh báo" : "Đạt"}</Badge> : <span className="xs muted">Chưa QC</span>}</td>
                          <td><VariantStatus status={v.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </Async>

        {pages > 1 && (
          <div className="row" style={{ justifyContent: "center", gap: 4 }}>
            <button className="btn xs ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={14} /></button>
            {Array.from({ length: pages }).map((_, i) => (i < 6 || i === pages - 1) && (
              <button key={i} className={`btn xs ${page === i + 1 ? "primary" : "ghost"}`} onClick={() => setPage(i + 1)}>{i + 1}</button>
            ))}
            <button className="btn xs ghost" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Trang sau"><ChevronRight size={14} /></button>
            <span className="xs muted">{PAGE_SIZE} video/trang · tổng {ordered.length}</span>
          </div>
        )}

      </div>

      <DetailPanel v={active} index={active ? items.indexOf(active) + 1 : 0} total={items.length} project={project} product={product} />

      <ReasonModal
        open={!!reasonFor}
        decision={reasonFor?.decision || null}
        count={reasonFor?.ids.length || 0}
        onClose={() => setReasonFor(null)}
        onSubmit={async (reason) => {
          if (!reasonFor) return;
          const r = await bulk(reasonFor.ids, reasonFor.decision, reason);
          if (r) setSel(new Set(r.errors.map((e: any) => e.variant_id)));
          return r;
        }}
      />
      <CompareModal open={compareOpen} ids={selIds} items={items} onClose={() => setCompareOpen(false)} />
    </div>
    {/* Thanh hành động dính đáy */}
    <div className="sticky-bottom">
      <Layers size={22} className="c-primary" />
      <div className="bold" style={{ fontSize: 16 }}>{selIds.length} video được chọn</div>
      <span className="small t2">Tổng thời lượng: <b>{selIds.length ? `${anyEstimated ? "~" : ""}${ms(totalMs)}` : "—"}</b></span>
      <span className="small t2">Dung lượng final: <b>{exportable.length ? bytes(exportable.reduce((a, v) => a + (sizeOf.get(v.id) || 0), 0)) : "—"}</b>{exportable.length > 0 && exportable.length < selIds.length ? ` (${exportable.length} video đã render)` : ""}</span>
      <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
        <Btn kind="primary" icon={<Check size={15} />} disabled={!selIds.length} onClick={approveSel}>Phê duyệt ({selIds.length})</Btn>
        <Btn kind="orange" icon={<PenLine size={15} />} disabled={!selIds.length} onClick={() => setReasonFor({ decision: "revise", ids: selIds })}>Gửi chỉnh sửa ({selIds.length})</Btn>
        <Btn icon={<Download size={15} />} disabled={!exportable.length} title={exportTitle} onClick={exportSel}>Xuất video ({exportable.length})</Btn>
        <Btn kind="ghost" icon={<X size={15} />} disabled={!selIds.length} onClick={() => setSel(new Set())}>Bỏ chọn</Btn>
      </div>
    </div>
    </>
  );
}

function FSel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <div className="field" style={{ minWidth: 130 }}>
      <span className="label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tất cả</option>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </div>
  );
}

function VideoCard({ v, checked, active, onCheck, onOpen }: { v: any; checked: boolean; active: boolean; onCheck: () => void; onOpen: () => void }) {
  const d = durationOf(v);
  const hasVideo = !!videoOf(v).src;
  return (
    <div className={`card ${active ? "glow" : ""}`} style={{ padding: 8, cursor: "pointer" }} onClick={onOpen}>
      <div className="row" style={{ alignItems: "stretch", gap: 8 }}>
        <div style={{ width: 84, flexShrink: 0, position: "relative" }}>
          <Thumb src={thumbOf(v)} ratio="9/16" play={hasVideo} duration={d.ms ? `${d.estimated ? "~" : ""}${ms(d.ms)}` : undefined} />
          <input
            type="checkbox"
            className="check"
            checked={checked}
            onClick={(e) => e.stopPropagation()}
            onChange={onCheck}
            style={{ position: "absolute", top: 6, left: 6 }}
            aria-label={`Chọn ${v.code}`}
          />
        </div>
        <div className="col grow" style={{ gap: 6, minWidth: 0 }}>
          <div className="semi small">{v.code}</div>
          <div className="xs t2" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.script?.title || v.script?.hook || "Chưa có kịch bản"}</div>
          <div style={{ marginTop: "auto" }}><Badge tone="gray">{v.angle_label}</Badge></div>
          <VariantStatus status={v.status} />
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ v, index, total, project, product }: { v: any; index: number; total: number; project: any; product: any }) {
  const detail = useApi<any>(v ? `/variants/${v.id}` : null);
  const prod = useApi<any>(product?.id ? `/products/${product.id}` : null);
  if (!v) return <Card title="Chi tiết video đã chọn"><div className="small muted">Chọn một video trong lưới.</div></Card>;
  const vid = videoOf(v);
  const d = durationOf(v);
  const c = qcChecks(v);
  const warns = qcWarnings(c).filter((w) => w.s !== "pass");
  const beats: any[] = detail.data?.script_full?.beats_json?.beats || [];
  const claimIds = Array.from(new Set(beats.flatMap((b) => b.claim_ids || [])));
  const claims = (prod.data?.claims || []).filter((x: any) => claimIds.includes(x.id));
  const tl = detail.data?.storyboard?.timeline_json;
  const manifest = v.export?.manifest_json;

  return (
    <div className="card" style={{ position: "sticky", top: 0 }}>
      <div className="card-title mb12"><Info size={15} className="c-primary" /> Chi tiết video đã chọn ({index}/{total})</div>
      {vid.src ? (
        <video key={vid.src} className="video-player" controls preload="metadata" poster={fileUrl(thumbOf(v)) || undefined} src={fileUrl(vid.src)} style={{ maxHeight: 280, objectFit: "contain" }} />
      ) : (
        <Thumb src={null} ratio="16/10" label={<Badge>Chưa render preview</Badge>} />
      )}
      <div className="row between mt12">
        <div className="bold">{v.code}</div>
        <VariantStatus status={v.status} />
      </div>
      <div className="small t2">{v.script?.title || "—"}</div>

      <div className="small semi mt12 row"><FileText size={14} /> Hook kịch bản</div>
      <div className="inner small mt8" style={{ fontStyle: "italic" }}>{v.script?.hook ? `“${v.script.hook}”` : "Chưa có kịch bản"}</div>

      <div className="small semi mt12 row"><Clapperboard size={14} /> Thông tin sản xuất</div>
      {detail.loading && !detail.data ? <Loading rows={3} /> : (
        <div className="kv mt8" style={{ gridTemplateColumns: "100px 1fr", fontSize: 12 }}>
          <span>Dự án</span><span className="ellipsis">{project?.name || "—"}</span>
          <span>Sản phẩm</span><span>{product?.name || "—"}</span>
          <span>Độ dài</span><span>{d.ms ? `${d.estimated ? "~" : ""}${ms(d.ms)}${d.estimated ? " (ước tính)" : ""}` : "—"} · mục tiêu {v.concept_json?.duration}s</span>
          <span>Khung hình</span><span>{manifest?.resolution || (tl?.canvas ? `${tl.canvas.width}×${tl.canvas.height} (${tl.canvas.aspect})` : "—")}</span>
          <span>Góc / Đối tượng</span><span>{v.angle_label} · {v.audience_label}</span>
          <span>Cấu trúc</span><span>{v.narrative_label} · {v.format_label}</span>
          <span>Kịch bản</span><span>v{v.script?.version ?? "—"} · {v.script?.engine || "—"}</span>
          <span>Cảnh / Beat</span><span>{tl?.tracks?.video?.length ?? "—"} cảnh · {beats.length || "—"} beat</span>
          {manifest && <><span>Encoder</span><span>{manifest.encoder || "—"}</span></>}
        </div>
      )}

      <div className="small semi mt12 row"><CheckCircle2 size={14} className="c-teal" /> Claim (đã duyệt) được dùng</div>
      <div className="col mt8" style={{ gap: 5 }}>
        {prod.loading && !prod.data ? <Loading rows={2} /> : claimIds.length === 0 ? (
          <div className="xs muted">Kịch bản không gắn claim nào.</div>
        ) : (
          <>
            {claims.map((x: any) => (
              <div key={x.id} className="row xs" style={{ alignItems: "flex-start" }}>
                <StatusIcon s={x.status === "approved" ? "pass" : "fail"} size={13} /> <span>{x.text}{x.status !== "approved" && <Badge tone="red">{x.status}</Badge>}</span>
              </div>
            ))}
            {claimIds.length > claims.length && <div className="row xs c-red"><ShieldAlert size={13} /> {claimIds.length - claims.length} claim không còn tồn tại trong hồ sơ sản phẩm</div>}
          </>
        )}
      </div>

      <div className="small semi mt12 row"><AlertTriangle size={14} className="c-orange" /> Cảnh báo QC</div>
      <div className="col mt8" style={{ gap: 5 }}>
        {!c ? <div className="xs muted">Chưa có báo cáo QC.</div> : warns.length === 0 ? <div className="xs c-teal">Không có cảnh báo.</div> : warns.slice(0, 6).map((w, i) => (
          <div key={i} className="row xs t2" style={{ alignItems: "flex-start" }}><StatusIcon s={w.s} size={13} />{w.text}</div>
        ))}
      </div>
    </div>
  );
}

function CompareModal({ open, ids, items, onClose }: { open: boolean; ids: string[]; items: any[]; onClose: () => void }) {
  const [a, b] = ids;
  const cmp = useApi<any>(open && ids.length === 2 ? "/variants/compare" : null, { a, b });
  const va = items.find((v) => v.id === a);
  const vb = items.find((v) => v.id === b);
  const verdict = cmp.data ? compareVerdict(cmp.data) : null;
  return (
    <Modal open={open} onClose={onClose} title={`So sánh ${va?.code || "A"} vs ${vb?.code || "B"}`} width={640}>
      <div className="grid g2 mb12">
        {[va, vb].map((v, i) => (
          <div key={i} className="inner row" style={{ gap: 10 }}>
            <Thumb src={thumbOf(v)} ratio="9/16" style={{ width: 48 }} />
            <div style={{ minWidth: 0 }}>
              <div className="semi">{v?.code}</div>
              <div className="xs t2 ellipsis">{v?.script?.title || "—"}</div>
              <div className="xs muted">{v?.angle_label}</div>
            </div>
          </div>
        ))}
      </div>
      <Async q={cmp}>{(r) => <CompareResult r={r} />}</Async>
      {verdict && <div className={`mt12 ${verdict.tone === "teal" ? "info-box" : "warn-box"} small`}>{verdict.text}</div>}
    </Modal>
  );
}
